# Quizlike

A full-stack interactive quiz platform. Teachers build quizzes with nine
question types, publish them to classes, and run them either as self-paced
assignments or as live Kahoot-style multiplayer sessions. Students join with a
code — with or without an account — and teachers get grading tools and
per-question analytics afterwards.

**Live app → https://quizlike.vercel.app**

No signup needed to look around: [Browse](https://quizlike.vercel.app/browse)
lists every published quiz, and Practice and Flashcard modes are fully public.

<!-- TODO: add 3-4 screenshots here (landing, create-quiz, live session, analytics) -->

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 6, React Router 7 |
| **Styling** | Tailwind CSS v4, shadcn/ui on Radix primitives, Framer Motion |
| **Backend** | Firebase Auth (Google OAuth + email/password), Vercel serverless function |
| **Database** | Cloud Firestore (persistent data), Firebase Realtime Database (live sessions) |
| **Media** | ImageKit CDN, TUI Image Editor, react-easy-crop |
| **Charts** | Recharts |
| **Deployment** | Vercel — auto-deploy from `main`, SPA rewrites, serverless API |

## Architecture

```
Browser (React SPA on Vercel CDN)
   │
   ├── Firebase Auth ........... Google OAuth + email/password, JWT session
   ├── Cloud Firestore ......... quizzes, results, classes, question bank
   │                             (access controlled by firestore.rules)
   ├── Realtime Database ....... live game sessions keyed by 6-digit PIN
   └── /api/auth (Vercel λ) .... signs short-lived ImageKit upload tokens
                                 so the private key never reaches the client
```

**Frontend.** A single-page React app. Auth state and role live in
`AuthContext`; `ProtectedRoute` enforces teacher/student access per route.
Pages talk to Firestore through helpers in `src/utils/`.

**Backend.** Mostly serverless: Firebase handles authentication and data access
directly, with authorisation enforced server-side by security rules rather than
in client code. The one custom endpoint, [`api/auth.js`](api/auth.js), runs as a
Vercel function and generates signed ImageKit upload parameters — this exists so
the ImageKit private key stays on the server.

**Database.** Firestore holds everything durable. The Realtime Database is used
only for live game state, where sub-second fan-out to every connected player
matters more than query flexibility.

## Features

**Authentication & roles**
- Google OAuth and email/password sign-in
- Teacher and student roles, switchable on one account
- Route guards with role enforcement, plus a public guest path
- Role-based Firestore security rules

**Quiz creation (teacher)**
- Nine question types: Multiple Choice (single/multi), True/False, Fill in the
  Blank, Paragraph, Match the Following, Categorize, Reorder, Visual
  Comprehension, Listening Comprehension
- Images and video on questions and individual answer options
- In-browser image cropping and annotation before upload
- Per-question time limits and point values
- Draft autosave, full edit of published quizzes, auto-generated join code
- Reusable question bank

**Taking quizzes**
- Three modes: graded (signed in), guest (code only, no account), and live
  multiplayer session
- Practice mode and flashcard mode for self-study, both public
- Per-question countdown, dot navigation, animated transitions

**Live game engine**
- Teacher hosts a session and gets a 6-digit PIN
- Players join a lobby, questions are revealed under teacher control
- Answers and scores sync in real time through the Realtime Database

**Teaching tools**
- Classes with student enrolment and assignment due dates
- Manual grading queue for paragraph answers, with partial credit
- Analytics per quiz: score distribution, per-question pass rate, sortable
  results table, CSV export
- In-app notifications

## Data Model

Firestore collections:

| Collection | Holds |
|---|---|
| `users` | profile, role, timestamps |
| `quizzes` | metadata, join code, embedded question array |
| `quiz_results` | one document per attempt, with per-answer grading state |
| `classes` | teacher-owned class records |
| `class_enrollments` | student ↔ class membership |
| `question_bank` | saved questions reusable across quizzes |
| `notifications` | per-user in-app notifications |

Realtime Database: `sessions/{pin}` — live game state (players, current
question, answers, scores).

Full field-level schema is in [docs/technical.md](docs/technical.md).

## Running Locally

```bash
git clone https://github.com/Haise-727/quiz-app.git
cd quiz-app
npm install --legacy-peer-deps
cp .env.local.example .env.local   # then fill in Firebase config
npm run dev                        # http://localhost:5173
```

`--legacy-peer-deps` is required: `@toast-ui/react-image-editor` declares a
React 17 peer dependency but runs fine on React 19.

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

### Environment variables

Client-side (`.env.local`, all prefixed `VITE_`):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`,
`VITE_FIREBASE_DATABASE_URL`

Server-side (set in Vercel project settings, never committed):
`IMAGEKIT_PUBLIC_KEY_API`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT_API`

## Deployment

Hosted on Vercel, deploying automatically on every push to `main`.
[`vercel.json`](vercel.json) rewrites all paths to `index.html` so client-side
routing works on refresh and deep links. Files in `api/` are deployed as
serverless functions. Firestore rules live in
[`firestore.rules`](firestore.rules) and Realtime Database rules in
[`database.rules.json`](database.rules.json); both are deployed through the
Firebase console.

## Team

| Member | Responsibility |
|---|---|
| **Harsha VarDan M Sakamuri** | Backend, database and deployment. Firebase Auth integration, Firestore data model and security rules, the ImageKit upload pipeline and its serverless endpoint, the real-time live game engine, classes/assignments and analytics, plus the Vercel deployment and environment configuration. |
| **Rakshith Shakkthi** | Frontend and UI. Built the initial student and teacher dashboards and the quiz creation page, then led the UI/UX overhaul onto Tailwind and the shadcn component system — landing, login, browse, practice and flashcard screens, shared layout, theming and visual polish across the app. |

## Documentation

- [docs/technical.md](docs/technical.md) — schemas, auth flow, code patterns
- [docs/progress-report.md](docs/progress-report.md) — feature status
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — architecture deep dive
- [docs/contributing.md](docs/contributing.md) — setup guide for new collaborators
