# Quizlike — Project Progress Report

## Project Overview
A full-stack interactive quiz platform built as a Quizzit/Kahoot clone. Teachers create and manage quizzes; students join and take them live or asynchronously. The app supports guest participation (no account needed) as well as authenticated teacher/student accounts.

---

## Tech Stack
- **Frontend:** React 19, React Router 7, Vite 6
- **Styling:** Tailwind CSS v4, shadcn/ui component system (Radix UI primitives)
- **Backend/Database:** Firebase 11 — Firestore (persistent data), Firebase Auth (authentication), Firebase Realtime Database (installed, reserved for live game mode)
- **Animation:** Framer Motion
- **Charts:** Recharts
- **Media:** ImageKit (image/video hosting), TUI Image Editor (in-browser image annotation)
- **Utilities:** class-variance-authority, tailwind-merge, sonner (toasts), react-photo-view

---

## Features Implemented

### Authentication & User Management
- Google OAuth sign-in via Firebase popup
- Email/password sign-up and sign-in
- Role-based accounts: **Teacher** and **Student**
- Role switching — a single account can toggle between teacher and student mode
- Protected route system with role enforcement and race-condition handling
- Profile page — edit display name, view account info, switch role
- Firestore security rules — proper read/write restrictions per user type

### Quiz Creation (Teacher)
- 7 question types supported:
  - Multiple Choice (single and multi-select)
  - Fill in the Blank
  - Paragraph (manual grading)
  - Match the Following (drag and drop)
  - Reorder Sequence (drag and drop)
  - Categorize Items (drag and drop)
  - Visual/Listening Comprehension (sub-questions)
- Rich media support on questions and answer options (images, videos via ImageKit)
- In-browser image annotation with TUI Image Editor
- Auto-generated unique quiz code for student join
- Quiz activate/deactivate toggle
- Per-question time limits and point values
- Speed bonus scoring system

### Quiz Taking
- **Authenticated students** — full graded experience, results saved to account
- **Guest mode** — no account required, join by code, results saved under unique guest ID
- Timer countdown per question with auto-advance on timeout
- Timer pulses red in final 10 seconds
- Question dot navigation (click to jump to any question)
- Animated slide transitions between questions
- All 7 question types fully interactive
- Completion screen with score breakdown (base score + speed bonus)

### Teacher Dashboard & Management
- Live stats: active quizzes, total quizzes, unique students, completed sessions
- Quiz management page — search, filter, activate/deactivate, preview, delete
- Grading interface — pending submissions sorted first, manual point entry per answer, one-click save
- **Analytics page** per quiz:
  - Score distribution bar chart (5 buckets, colour-coded)
  - Per-question pass rate bar chart (green = easy, red = hard)
  - Sortable student results table (by name, score, %, status, date)
  - CSV export of all submissions

### Student Dashboard & Results
- Personal stats: quizzes taken, average score, best score, time spent
- Recent activity feed with score badges
- **YourResults page** — full review of every past quiz with per-question answer breakdown, correct answer reveal, partial credit display
- Quiz join by code or browse from available list

### Study Modes (Phase 8)
- **Practice Mode** — public, no login required
  - Self-paced, no timer, no score saved
  - MCQ: click to answer → immediate correct/wrong colour feedback
  - Fill-in-blank: type and check → shows correct answer if wrong
  - All other types: "Reveal Answer" button with formatted correct answer
  - Session summary at end
- **Flashcard Mode** — public, no login required
  - CSS 3D flip card animation (question front / answer back)
  - Works for all 7 question types
  - "Got It" / "Still Learning" tracking per card
  - Shuffle cards, review only flagged cards, mastery progress bar

### Discovery & Sharing
- **Browse page** — public, no login required, search across all active quizzes
- Each quiz accessible with Play (graded), Practice, or Flashcards entry points
- Share link copy button per quiz (teacher)
- Quiz code displayed on all relevant pages

### UI/UX
- Consistent colour theming — orange gradient for teacher views, blue/purple for student views
- shadcn/ui component library throughout — Cards, Badges, Dialogs, Dropdowns, Progress bars, Avatars
- Framer Motion animations on page transitions, stat cards, modals
- Avatar dropdown with role switch and profile link on every page
- Responsive layout — works on mobile and desktop
- Proper 404 page
- Toast notifications (sonner) for all user actions
- Loading states and empty states on all data-fetching pages

---

## Pages Built (14 total)

| Page | Route | Access |
|---|---|---|
| Landing | `/` | Public |
| Browse | `/browse` | Public |
| Login | `/login` | Public |
| Guest Quiz | `/quiz/:id` | Public |
| Practice Mode | `/practice/:id` | Public |
| Flashcard Mode | `/flashcards/:id` | Public |
| Profile | `/profile` | Any auth'd user |
| Teacher Home | `/teacher/home` | Teacher |
| Create Quiz | `/teacher/create-quiz` | Teacher |
| Your Quizzes | `/teacher/your-quizzes` | Teacher |
| Grading | `/teacher/grading/:id` | Teacher |
| Analytics | `/teacher/analytics/:id` | Teacher |
| Student Dashboard | `/student/dashboard` | Student |
| Attend Quiz | `/student/attend-quiz` | Student |
| Take Quiz | `/student/quiz/:id` | Student |
| Your Results | `/student/results` | Student |

---

## Planned / Remaining

- **Live Game Engine** — real-time synchronized quiz sessions (Kahoot-style lobby, teacher-controlled question reveal, live leaderboard, end podium) — uses Firebase Realtime Database
- **CreateQuiz improvements** — drag-to-reorder questions, duplicate question, in-page preview
- **Score timeline** — line chart of student scores over time on YourResults
- **Dark mode** — full theme toggle with CSS variable swap
- **Question bank** — save and reuse individual questions across quizzes
- **Import** — bulk question creation from CSV or Google Forms
