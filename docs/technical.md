# Quizlike — Technical Reference

Field-level schemas, auth flow and code patterns. For architecture and
rationale see [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md).

## Project Structure

```
quiz-app/
├── api/
│   └── auth.js                  # Vercel function: signs ImageKit upload params
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui (button, card, dialog, tabs, badge, …)
│   │   ├── layout/
│   │   │   └── DashboardLayout.jsx
│   │   ├── MediaUploader.jsx    # upload → crop → annotate → ImageKit
│   │   ├── MediaRenderer.jsx  MediaPreview.jsx  Image.jsx
│   │   ├── ImageCropperModal.jsx  ImageEditorModal.jsx
│   │   ├── NotificationBell.jsx  Confetti.jsx
│   │   └── ProtectedRoute.jsx
│   ├── contexts/
│   │   ├── AuthContext.jsx      # user, role, sign-in methods, switchRole
│   │   └── ThemeContext.jsx
│   ├── pages/
│   │   ├── Landing.jsx          # public home + 6-box PIN entry
│   │   ├── Browse.jsx           # public quiz discovery
│   │   ├── Login.jsx            # unified auth (Google + email)
│   │   ├── Profile.jsx  Practice.jsx  Flashcards.jsx  NotFound.jsx
│   │   ├── PlaySession.jsx      # player view of a live game
│   │   ├── Guest/GuestTakeQuiz.jsx
│   │   ├── Teacher/
│   │   │   ├── TeacherHome.jsx  CreateQuiz.jsx  YourQuizzes.jsx
│   │   │   ├── Grading.jsx  Analytics.jsx  Classes.jsx
│   │   │   ├── QuestionBank.jsx
│   │   │   └── HostSession.jsx  # host view of a live game
│   │   └── Student/
│   │       ├── StudentDashboard.jsx  AttendQuiz.jsx
│   │       └── TakeQuiz.jsx  YourResults.jsx
│   ├── utils/
│   │   ├── liveSession.js       # Realtime DB session lifecycle + scoring
│   │   ├── classHelpers.js      # classes and enrolment
│   │   ├── assignmentHelpers.js # due dates, completion counts
│   │   ├── questionBankHelpers.js
│   │   ├── notifications.js  sounds.js
│   │   └── devTools.js          # clearInvalidQuizzes, clearAllQuizResults, seedTestQuiz
│   ├── styles/                  # page-specific CSS (CreateQuiz, TakeQuiz)
│   ├── lib/utils.js             # cn() helper (clsx + tailwind-merge)
│   ├── firebase.js              # exports db, auth, realtimeDb, googleProvider
│   ├── App.jsx                  # route table + ProtectedRoute guards
│   └── main.jsx                 # root render + Toaster
├── docs/
├── firestore.rules              # deploy via Firebase Console
├── database.rules.json          # Realtime DB rules
└── vercel.json
```

## Question Types

Nine types, selected per question in CreateQuiz:

| Value | Label | Auto-graded |
|---|---|---|
| `MCQ` | Multiple Choice (single or multi-select) | yes |
| `TRUE_FALSE` | True / False | yes |
| `FILL_IN_THE_BLANK` | Fill in the Blank | yes |
| `PARAGRAPH` | Paragraph | no — manual grading |
| `MATCH_THE_FOLLOWING` | Match the Following | yes |
| `CATEGORIZE` | Categorize | yes |
| `REORDER` | Reorder | yes |
| `VISUAL_COMPREHENSION` | Visual Comprehension (media + sub-questions) | yes |
| `LISTENING_COMPREHENSION` | Listening Comprehension (media + sub-questions) | yes |

Live mode supports a subset — see `LIVE_SUPPORTED_TYPES` in
`src/utils/liveSession.js`: `MCQ`, `TRUE_FALSE`, `FILL_IN_THE_BLANK`.
Unsupported questions are skipped and counted in `skippedCount`.

## Firestore Collections

### `users/{uid}`
```
{
  email: string,
  role: "teacher" | "student",
  displayName: string,
  createdAt: string (ISO),
  lastActive: string (ISO)
}
```

### `quizzes/{quizId}`
```
{
  title: string,
  description: string,
  createdBy: string (uid),
  createdAt: Timestamp,
  active: boolean,
  code: string (6-char uppercase),
  totalPoints: number,
  questions: [
    {
      id: string,
      type: <one of the nine values above>,
      questionText: string,
      points: number,
      timeLimit: number (seconds),
      media: { ... } | null,
      // type-specific payloads:
      mcqData?:        { options: [{id, text, media}], correctOptions: [id] },
      trueFalseData?:  { correctAnswer: boolean },
      fillBlankData?:  { answers: [{text}] },
      matchData?:      { pairs: [{id, prompt, answer, promptMedia, answerMedia}] },
      reorderData?:    { items: [{id, text, media}] },
      categorizeData?: { categories: [{id, name}], items: [{id, text, media, categoryId}] },
      visualData?:     { subQuestions: [{id, type, questionText, mcqData}] },
      listeningData?:  { subQuestions: [{id, type, questionText, mcqData}] }
    }
  ]
}
```

### `quiz_results/{resultId}`
```
{
  quizId: string,
  userId: string (uid or "guest_<timestamp>_<random>"),
  username: string (guest display name),
  quizTitle: string,
  teacherId: string,
  status: "completed" | "pending",
  score: number,
  maxScore: number,
  completedAt: Timestamp,
  isGuest: boolean,
  answers: [
    {
      type: string,
      questionText: string,
      userAnswer: any,
      pointsAwarded: number,
      status: "auto_graded" | "pending_review" | "manually_graded",
      isCorrect: boolean
    }
  ]
}
```

### `classes/{classId}`
```
{
  name: string,
  description: string,
  teacherId: string (uid),
  teacherName: string,
  code: string (join code),
  quizIds: [string],
  dueDates: { [quizId]: string (ISO) },
  createdAt: Timestamp
}
```

### `class_enrollments/{enrollmentId}`
```
{
  classId: string,
  studentId: string (uid),
  studentName: string,
  studentEmail: string,
  enrolledAt: Timestamp
}
```

### `question_bank/{itemId}`
```
{
  teacherId: string (uid),
  question: { ...same shape as a quiz question },
  createdAt: Timestamp
}
```

### `notifications/{notificationId}`
```
{
  userId: string (uid, recipient),
  type: string,
  message: string,
  link: string,
  read: boolean,
  createdAt: Timestamp
}
```

## Realtime Database — `sessions/{pin}`

Live game state. `pin` is a 6-digit code, checked for collision on creation.

```
{
  quizId: string,
  quizTitle: string,
  hostId: string (uid),
  totalQuestions: number,      // playable questions only
  skippedCount: number,        // questions dropped as unsupported in live mode
  state: "lobby" | "question" | "leaderboard" | "ended",
  currentQuestionIndex: number,
  questionStartedAt: number (ms) | null,
  createdAt: number (ms),
  players: { [playerId]: { name, score, joinedAt } },
  answers: { [questionIndex]: { [playerId]: { answer, timeTakenMs, points } } }
}
```

The session is deleted when the host ends the game.

## Auth Flow

```
Google sign-in
  → new user: show role picker → createUserProfile → navigate to dashboard
  → existing user: fetchUserData → navigate to dashboard

Email sign-in
  → signInWithEmailAndPassword → onAuthStateChanged → fetchUserData
  → navigate (via useEffect in Login)

Email sign-up
  → createUserWithEmailAndPassword → updateProfile → createUserProfile → navigate

Role switch (post-login)
  → switchRole(newRole) → updateDoc users/{uid} → setUserRole(newRole)
  → ProtectedRoute detects mismatch → auto-redirects to correct dashboard

Guest
  → join by quiz code, no account
  → generateGuestId() → results written with isGuest: true
```

## Key Patterns

### Route protection
```jsx
// App.jsx
<ProtectedRoute role="teacher">  // enforces role
<ProtectedRoute>                 // any authenticated user
// Public routes have no wrapper
```

### shadcn component usage
```jsx
import { Button } from '@/components/ui/button';
// variant="student" → blue gradient
// variant="teacher" → orange gradient
// variant="app"     → indigo gradient
```

### Media upload
Client requests signed params from `/api/auth`, then uploads directly to
ImageKit. Only the resulting URL is written to Firestore. The ImageKit private
key lives in a Vercel environment variable and never reaches the browser.

### Dev tools (TeacherHome)
- **Clear Invalid Quizzes** — deletes quiz docs using the old schema (`text`
  field instead of `questionText`)
- **Clear All Quiz Results** — wipes results for the signed-in teacher
- **Seed Test Quiz** — creates a quiz covering every question type, `active: true`

## Environment

- Dev server: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
- Firebase config is read from `VITE_*` environment variables in
  `src/firebase.js`; copy `.env.local.example` to `.env.local` and fill it in.
  Nothing secret is committed — see the README for the full variable list.
- ImageKit server credentials (`IMAGEKIT_PRIVATE_KEY` and friends) are set in
  Vercel project settings only.
- `npm install` needs `--legacy-peer-deps`: `@toast-ui/react-image-editor`
  declares a React 17 peer dependency but runs correctly on React 19.
