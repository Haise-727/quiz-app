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
│   │   ├── AnswerReveal.jsx     # shared "correct answer" view with media (Practice, Flashcards)
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
│   │   ├── media.js             # mediaKind, getMainMedia, getSubQuestions (one rule for every page)
│   │   ├── mediaUpload.js       # uploadQuestionMedia: editor files to ImageKit (Publish, Save to Bank)
│   │   ├── notifications.js  sounds.js
│   │   └── devTools.js          # clearInvalidQuizzes, clearAllQuizResults, seedTestQuiz
│   ├── styles/                  # page-specific CSS (CreateQuiz, TakeQuiz)
│   ├── lib/utils.js             # cn() helper (clsx + tailwind-merge)
│   ├── firebase.js              # exports db, auth, realtimeDb, googleProvider
│   ├── App.jsx                  # route table + ProtectedRoute guards
│   └── main.jsx                 # root render + Toaster
├── scripts/
│   └── seed-media-quiz.mjs      # real upload + quiz seeding for media testing
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

Live mode plays eight of the nine types. See `LIVE_SUPPORTED_TYPES` in
`src/utils/liveSession.js`: `MCQ`, `TRUE_FALSE`, `FILL_IN_THE_BLANK`,
`MATCH_THE_FOLLOWING`, `REORDER`, `CATEGORIZE`, `VISUAL_COMPREHENSION` and
`LISTENING_COMPREHENSION`. Paragraph questions need a teacher to mark them, so
they are skipped and counted in `skippedCount`. A comprehension question with
no gradable follow up question is skipped the same way.

A comprehension question is one live question. The player sees the image, audio
or video once, with every follow up question under it, and answers as many as
they can before the clock runs out.

The answer a live player writes to
`sessions/{pin}/answers/{questionIndex}/{playerId}/answer` is plain JSON:

| Type | Shape |
|---|---|
| `MCQ` | `[optionId, ...]` |
| `TRUE_FALSE` | boolean |
| `FILL_IN_THE_BLANK` | string |
| `MATCH_THE_FOLLOWING` | `{ [promptPairId]: pairIdOfTheAnswerDroppedThere }` |
| `REORDER` | `[itemId, ...]` in the player's order |
| `CATEGORIZE` | `{ [itemId]: categoryId }` |
| `VISUAL_COMPREHENSION`, `LISTENING_COMPREHENSION` | `{ s0: [optionId, ...], s2: [optionId, ...] }` |

The comprehension keys are `s0`, `s1` and so on, never bare numbers. The
Realtime Database turns an object with whole number keys into an array, and a
player who skips follow up question 0 would come back as an array padded with
nulls. The `s` prefix keeps it an object. `getSubAnswers` in the same file still
accepts both shapes, so an answer that did arrive as an array is scored fairly.

The three simple types are all or nothing. The drag and drop types score
partial credit, which is the share of pairs matched, items left in the right
position, or items dropped in the right category. A comprehension question
scores the share of follow up points earned, where each follow up question is
worth its own `points` (5 if unset). In every case the result is multiplied by
the same speed bonus. Only a fully correct answer sets `correct` and extends a
streak.

Audio and video play on each player's own device with normal controls, so a
remote player can replay a clip. The host screen shows the same media.

A clip can be longer than the question's time limit. The host measures the
media once it has loaded and writes a later `questionEndsAt`, and every screen
counts down to that same instant. The clock only ever moves later, and the
reveal waits until the media has loaded, so nobody loses the picture the
question is about.

## Realtime Database — `sessions/{pin}`

Live game state. `pin` is a 6-digit code, checked for collision on creation.

```
{
  quizId: string,
  quizTitle: string,
  hostId: string (uid),
  totalQuestions: number,      // playable questions only
  skippedCount: number,        // questions dropped as unsupported in live mode
  state: "lobby" | "question" | "reveal" | "leaderboard" | "ended",
  currentQuestionIndex: number,
  questionStartedAt: number (ms) | null,
  questionEndsAt: number (ms) | null,   // set by the host when a clip is longer than the time limit
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

### Media

Every picture, audio clip or video on a question is stored as one small object
and nothing else. The file itself lives on ImageKit.

```
{ url: string, fileId: string, fileType: "image" | "video" | "audio", cropData?: {...} }
```

The object can sit in any of these places on a question: `media`, an MCQ
option's `media`, a match pair's `promptMedia` and `answerMedia`, a categorize
or reorder item's `media`, and `visualData.mainMedia` or
`listeningData.mainMedia` for the comprehension types.

How a file gets there. The editor keeps a picked file in memory until the
teacher publishes. Publish and "Save to Bank" both call `uploadQuestionMedia` in
`src/utils/mediaUpload.js`, which asks `/api/auth` for a short lived signed
token (the ImageKit private key stays on the server), uploads to ImageKit, and
writes the object above onto a copy of the question. The editor only fields
(`localMediaFile`, `localCropData` and so on) are removed before anything is
saved.

`fileType` is taken from the browser's MIME type, because ImageKit calls every
audio and video file "non-image". Quizzes saved before that change still hold
`"non-image"`. `mediaKind` in `src/utils/media.js` handles both: it trusts a
real `fileType` and otherwise falls back to the file extension, so old quizzes
keep working.

Every page that shows a quiz renders media through `MediaRenderer`, and the
"here is the correct answer" view that Practice and Flashcards share lives in
`src/components/AnswerReveal.jsx`. Where a question keeps its main media, and
where its follow up questions are, comes from `getMainMedia` and
`getSubQuestions` in `src/utils/media.js`. Do not read `question.media` directly,
because comprehension questions keep theirs somewhere else.

Testing it. `scripts/seed-media-quiz.mjs` follows the same steps as the browser:
it uploads real files to ImageKit through `/api/auth` and writes a quiz with
media in every slot, using a throwaway teacher account. Run it with
`node scripts/seed-media-quiz.mjs --dir <folder of images, audio and video>`,
then `--cleanup` when you are done. Its header explains exactly what it creates
and what it cannot delete. Add `--legacy` to store ImageKit's raw `"non-image"`
value and test the old data shape.

### Dev tools (TeacherHome)
- **Clear Invalid Quizzes** — deletes quiz docs using the old schema (`text`
  field instead of `questionText`)
- **Clear All Quiz Results** — wipes results for the signed-in teacher
- **Seed Test Quiz** — creates a quiz covering every question type, `active: true`

## Environment

- Dev server: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
- Firebase config is read from `VITE_*` environment variables in
  `src/firebase.js`; copy `.env.local.example` to `.env.local` and fill it in.
  Nothing secret is committed. `.env.local.example` lists every variable and
  says where to find each value.
- `npm run dev` does not serve the `api` folder. `vite.config.js` forwards `/api`
  to the deployed app so uploads work locally. Set `VITE_API_PROXY` to test a
  preview deployment instead.
- ImageKit server credentials (`IMAGEKIT_PRIVATE_KEY` and friends) are set in
  Vercel project settings only.
- `npm install` needs `--legacy-peer-deps`: `@toast-ui/react-image-editor`
  declares a React 17 peer dependency but runs correctly on React 19.
