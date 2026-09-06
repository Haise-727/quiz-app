# Quizlike — Project Progress Report

**Status: feature-complete and deployed.** Live at
https://quizlike.vercel.app — remaining work is polish, testing and the
nice-to-haves listed at the end.

## Project Overview
A full-stack interactive quiz platform in the Kahoot/Quizizz mould. Teachers
create and manage quizzes and classes; students take them asynchronously or in
live synchronised sessions. Guests can participate with no account at all.

---

## Tech Stack
- **Frontend:** React 19, React Router 7, Vite 6
- **Styling:** Tailwind CSS v4, shadcn/ui component system (Radix UI primitives)
- **Backend:** Firebase Auth (Google OAuth + email/password); one Vercel
  serverless function for signed ImageKit uploads
- **Database:** Cloud Firestore (7 collections, role-based security rules) and
  Firebase Realtime Database (live game sessions)
- **Animation:** Framer Motion · **Charts:** Recharts
- **Media:** ImageKit CDN, TUI Image Editor, react-easy-crop
- **Drag & drop:** @hello-pangea/dnd · **Toasts:** sonner
- **Deployment:** Vercel, auto-deploying from `main`

---

## Features Implemented

### Authentication & user management
- Google OAuth sign-in via Firebase popup
- Email/password sign-up and sign-in
- Role-based accounts: **Teacher** and **Student**, switchable on one account
- Protected route system with role enforcement and race-condition handling
- Profile page — edit display name, view account info, switch role
- Firestore security rules enforcing per-role read/write access

### Quiz creation (teacher)
- 9 question types: Multiple Choice (single and multi-select), True/False,
  Fill in the Blank, Paragraph (manual grading), Match the Following,
  Reorder, Categorize, Visual Comprehension, Listening Comprehension
- Rich media on questions and individual answer options (images and video via
  ImageKit)
- In-browser image cropping and annotation before upload
- Draft autosave, with discard option
- **Full editing of already-published quizzes** — text, media and structure
- Auto-generated unique join code; activate/deactivate toggle
- Per-question time limits and point values
- **Question bank** — save individual questions and reuse them across quizzes

### Quiz taking
- **Authenticated students** — graded, results saved to the account
- **Guest mode** — no account, join by code, results stored under a guest ID
- **Live multiplayer** — see below
- Timer countdown per question with auto-advance, pulsing in the final seconds
- Question dot navigation, animated slide transitions
- All question types fully interactive
- Completion screen with score breakdown

### Live game engine
- Teacher hosts a session and receives a 6-digit PIN
- Players join a lobby from the landing page; teacher controls question reveal
- Answers, scores and leaderboard sync in real time via Realtime Database
- Supported live types: MCQ, True/False, Fill in the Blank — other types are
  skipped and reported in the session summary
- Synthesised sound effects for game events

### Classes & assignments
- Teachers create classes and enrol students
- Assign quizzes to a class with due dates and completion tracking
- In-app notification system with a notification bell

### Teacher dashboard & management
- Live stats: active quizzes, total quizzes, unique students, completed sessions
- Quiz management — search, filter, activate/deactivate, preview, delete
- Grading interface — pending submissions first, manual point entry per answer
- **Analytics** per quiz: score distribution chart, per-question pass rate
  chart, sortable results table, CSV export

### Student dashboard & results
- Personal stats: quizzes taken, average score, best score, time spent
- Recent activity feed with score badges
- **Your Results** — full review of every past attempt with per-question
  breakdown, correct answers revealed, partial credit shown
- **Score timeline** — line chart of scores over time
- Join by code or browse available quizzes

### Study modes (public, no login)
- **Practice mode** — self-paced, no timer, no score saved; immediate
  correct/wrong feedback, "Reveal Answer" for complex types, session summary
- **Flashcard mode** — CSS 3D flip cards, works for all question types,
  "Got It" / "Still Learning" tracking, shuffle, review-flagged-only, mastery bar

### Discovery, sharing & UI
- **Browse** — public search across all active quizzes
- Play / Practice / Flashcards entry points per quiz; share-link copy button
- **Dark mode** — full theme toggle honouring OS preference, persisted to
  localStorage
- Consistent theming: orange for teacher views, blue/purple for student views
- shadcn/ui throughout; Framer Motion transitions; responsive mobile/desktop
- Toast notifications, loading and empty states, proper 404 page

---

## Routes (22 routes across 21 page components)

| Page | Route | Access |
|---|---|---|
| Landing | `/` | Public |
| Browse | `/browse` | Public |
| Login | `/login` | Public |
| Guest Quiz | `/quiz/:quizId` | Public |
| Practice Mode | `/practice/:quizId` | Public |
| Flashcard Mode | `/flashcards/:quizId` | Public |
| Live Play | `/play`, `/play/:pin` | Public |
| Profile | `/profile` | Any signed-in user |
| Teacher Home | `/teacher/home` | Teacher |
| Create Quiz | `/teacher/create-quiz` | Teacher |
| Edit Quiz | `/teacher/edit-quiz/:quizId` | Teacher |
| Your Quizzes | `/teacher/your-quizzes` | Teacher |
| Classes | `/teacher/classes` | Teacher |
| Question Bank | `/teacher/question-bank` | Teacher |
| Grading | `/teacher/grading/:quizId` | Teacher |
| Analytics | `/teacher/analytics/:quizId` | Teacher |
| Host Live Session | `/teacher/host/:pin` | Teacher |
| Student Dashboard | `/student/dashboard` | Student |
| Attend Quiz | `/student/attend-quiz` | Student |
| Take Quiz | `/student/quiz/:quizId` | Student |
| Your Results | `/student/results` | Student |
| 404 | `*` | Public |

Plus four legacy redirects kept so old links keep working.

---

## Remaining Work

**Should be done before this is production-grade**
- **Automated tests** — there is no test suite; all testing has been manual
- **Tighten Realtime Database rules** — `sessions` is currently readable and
  writable by any client with only a shape check
- **CI pipeline** — run lint and build on push

**Nice to have**
- CreateQuiz: drag-to-reorder questions, duplicate question, in-page preview
- Bulk question import from CSV or Google Forms
- More live question types (Match, Reorder, Categorize in live mode)
- Cross-quiz and per-student analytics trends
