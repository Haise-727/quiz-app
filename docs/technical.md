# Quizlike — Technical Reference

## Project Structure

```
quiz-app/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (button, card, dialog, etc.)
│   │   └── MediaRenderer.jsx
│   ├── contexts/
│   │   └── AuthContext.jsx  # Auth state, role, sign-in methods, switchRole, updateDisplayName
│   ├── pages/
│   │   ├── Landing.jsx      # Public home + 6-box PIN entry
│   │   ├── Browse.jsx       # Public quiz discovery
│   │   ├── Login.jsx        # Unified auth (Google + email, sign-in/up)
│   │   ├── Profile.jsx      # Shared profile page
│   │   ├── Practice.jsx     # Self-paced study mode (public)
│   │   ├── Flashcards.jsx   # Flip-card study mode (public)
│   │   ├── NotFound.jsx     # 404
│   │   ├── Guest/
│   │   │   └── GuestTakeQuiz.jsx
│   │   ├── Teacher/
│   │   │   ├── TeacherHome.jsx
│   │   │   ├── CreateQuiz.jsx
│   │   │   ├── YourQuizzes.jsx
│   │   │   ├── Grading.jsx
│   │   │   └── Analytics.jsx
│   │   └── Student/
│   │       ├── StudentDashboard.jsx
│   │       ├── AttendQuiz.jsx
│   │       ├── TakeQuiz.jsx
│   │       └── YourResults.jsx
│   ├── utils/
│   │   └── devTools.js      # clearInvalidQuizzes, seedTestQuiz
│   ├── lib/
│   │   └── utils.js         # cn() helper (clsx + tailwind-merge)
│   ├── firebase.js          # Firebase init, exports db, auth, googleProvider
│   ├── App.jsx              # Routes + ProtectedRoute guard
│   └── main.jsx             # Root render + Toaster
├── docs/                    # This folder
├── firestore.rules          # Security rules (deploy to Firebase Console)
└── vite.config.js
```

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
      type: "MCQ" | "FILL_IN_THE_BLANK" | "PARAGRAPH" | "MATCH_THE_FOLLOWING" | "REORDER" | "CATEGORIZE" | ...,
      questionText: string,
      points: number,
      timeLimit: number (seconds),
      media: { ... } | null,
      // type-specific data:
      mcqData?: { options: [{id, text, media}], correctOptions: [id] },
      fillBlankData?: { answers: [{text}] },
      matchData?: { pairs: [{id, prompt, answer, promptMedia, answerMedia}] },
      reorderData?: { items: [{id, text, media}] },
      categorizeData?: { categories: [{id, name}], items: [{id, text, media, categoryId}] }
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
  bonus: number,
  finalScore: number,
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

## Auth Flow

```
Google sign-in
  → new user: show role picker → createUserProfile → navigate to dashboard
  → existing user: fetchUserData → navigate to dashboard

Email sign-in
  → signInWithEmailAndPassword → onAuthStateChanged → fetchUserData → navigate (via useEffect in Login)

Email sign-up
  → createUserWithEmailAndPassword → updateProfile → createUserProfile → navigate

Role switch (post-login)
  → switchRole(newRole) → updateDoc users/{uid} → setUserRole(newRole)
  → ProtectedRoute detects mismatch → auto-redirects to correct dashboard
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

### Dev Tools (TeacherHome)
- **Clear Invalid Quizzes** — deletes quiz docs using old schema (`text` field instead of `questionText`)
- **Seed Test Quiz** — creates a quiz with all 7 question types, `active: true`

## Environment
- Node.js + Vite dev server: `npm run dev`
- Build: `npm run build`
- All Firebase config is in `src/firebase.js` (API keys committed — standard for Firebase web apps, rules enforce security)
- `npm install` must use `--legacy-peer-deps` due to `@toast-ui/react-image-editor` requiring React 17 peer dep (works fine at runtime on React 19)
