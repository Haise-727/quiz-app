# Quizlike — Architecture Deep Dive

This document explains *how* the project is put together and why. For what the
product does and how to run it, start with the [README](README.md).

---

## Design Goals

1. **No server to operate.** The team is small, so the architecture leans on
   managed services. There is no Express app, no container, no VM — Firebase
   provides auth and data, Vercel serves the bundle and runs one function.
2. **Authorisation on the server, not in the UI.** Hiding a button is not
   security. Every access rule that matters is expressed in
   `firestore.rules`, so a modified client cannot read or write what it
   should not.
3. **Right database for each job.** Firestore for durable, queryable records;
   Realtime Database for live game state that must fan out to every player in
   under a second.
4. **Guests are first-class.** A student should be able to take a quiz from a
   shared link without creating an account, and the teacher should still get
   their result.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | React 19 + Vite 6 | Fast HMR dev loop, ES modules, minimal config |
| Routing | React Router 7 | Nested routes and route-level access guards |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | Utility-first, no separate build step |
| Components | shadcn/ui over Radix primitives | Accessible primitives, owned in-repo rather than versioned as a dependency |
| State | React Context + custom helpers | Two pieces of global state (auth, theme); a store library would be overhead |
| Animation | Framer Motion | Page and modal transitions |
| Charts | Recharts | Composable React chart primitives for the analytics page |
| Auth | Firebase Authentication | Google OAuth and email/password without running an identity service |
| Database | Cloud Firestore | Document model matches the nested quiz/question shape; realtime listeners built in |
| Live state | Firebase Realtime Database | Lower latency and cheaper fan-out than Firestore for ephemeral session data |
| Media | ImageKit | CDN storage plus on-the-fly transforms; keeps large uploads out of Firestore |
| Drag & drop | @hello-pangea/dnd | Powers Match, Reorder and Categorize question types |
| Hosting | Vercel | Static bundle on CDN plus serverless functions from the same repo |

---

## Repository Layout

```
quiz-app/
├─ api/
│  └─ auth.js                 # Vercel serverless function — ImageKit token signing
├─ public/                    # static assets served as-is
├─ src/
│  ├─ components/
│  │  ├─ ui/                  # shadcn/ui primitives (button, card, dialog, tabs, …)
│  │  ├─ layout/              # DashboardLayout — shared teacher/student shell
│  │  ├─ MediaUploader.jsx    # upload → crop → annotate → ImageKit pipeline
│  │  ├─ MediaRenderer.jsx    # renders image/video media on questions
│  │  ├─ ImageCropperModal.jsx / ImageEditorModal.jsx
│  │  ├─ NotificationBell.jsx
│  │  └─ ProtectedRoute.jsx   # route guard: auth + role enforcement
│  ├─ contexts/
│  │  ├─ AuthContext.jsx      # user, role, sign-in/out, switchRole
│  │  └─ ThemeContext.jsx
│  ├─ pages/
│  │  ├─ Teacher/             # home, create/edit quiz, your quizzes, grading,
│  │  │                       # analytics, classes, question bank, host session
│  │  ├─ Student/             # dashboard, attend quiz, take quiz, results
│  │  ├─ Guest/               # GuestTakeQuiz — no account required
│  │  ├─ Landing.jsx  Browse.jsx  Login.jsx  Profile.jsx
│  │  ├─ Practice.jsx  Flashcards.jsx  PlaySession.jsx  NotFound.jsx
│  ├─ utils/                  # Firestore access helpers, not UI
│  │  ├─ liveSession.js       # Realtime Database session lifecycle
│  │  ├─ classHelpers.js  assignmentHelpers.js  questionBankHelpers.js
│  │  ├─ notifications.js  sounds.js  devTools.js
│  ├─ lib/utils.js            # cn() — clsx + tailwind-merge
│  ├─ firebase.js             # SDK init; exports db, auth, realtimeDb, googleProvider
│  ├─ App.jsx                 # route table
│  └─ main.jsx                # entry point
├─ docs/                      # technical reference, progress report, contributing
├─ firestore.rules            # Firestore authorisation
├─ database.rules.json        # Realtime Database authorisation
├─ vercel.json                # SPA rewrites
└─ vite.config.js
```

Note there is no `src/api/` directory — Firestore calls live in `src/utils/`,
and `api/` at the repository root is Vercel's serverless function directory.

---

## How the Layers Talk

### Frontend
Route-level components under `src/pages/` own data fetching and call helpers in
`src/utils/`, which wrap the Firebase SDK. Components under `src/components/ui/`
are presentational. Global state is deliberately small: `AuthContext` holds the
signed-in user and role, `ThemeContext` holds the theme; everything else is
local component state or read live from Firestore.

`ProtectedRoute` wraps routes that require a session. Given a `role` prop it
also enforces that role and redirects a mismatched user to their own dashboard,
handling the window where auth has resolved but the Firestore profile has not.

### Backend
There is no traditional backend tier. The client speaks to Firebase directly,
and Firebase security rules are the enforcement point — `firestore.rules`
defines per-collection read/write conditions based on the caller's UID and role,
so authorisation cannot be bypassed by editing client code.

The single custom endpoint is `api/auth.js`. ImageKit uploads must be signed
with a private key, and a private key cannot ship to a browser, so the function
holds it in a Vercel environment variable and returns short-lived signed upload
parameters on request.

### Database
**Firestore** stores users, quizzes, results, classes, enrolments, the question
bank and notifications. Questions are embedded as an array inside their quiz
document rather than normalised into a subcollection: a quiz is always read as a
whole, so embedding makes it one read instead of N.

**Realtime Database** stores only `sessions/{pin}` — the live game. State is
ephemeral, written on every answer by every player, and must reach all clients
immediately, which is what RTDB is good at and what Firestore would be expensive
for.

**ImageKit** stores uploaded media; Firestore holds only the resulting URLs.

### Deployment
Push to `main` triggers a Vercel build. Vite emits a static bundle served from
the CDN, `api/` becomes serverless functions, and `vercel.json` rewrites every
path to `index.html` so deep links and refreshes reach the client router.
Firebase security rules are deployed separately through the Firebase console.

---

## Known Limitations

- **Realtime Database rules are permissive.** `database.rules.json` allows read
  and write on `sessions` with only a shape check. Sessions are ephemeral and
  PIN-scoped, and nothing graded depends on them — but a determined client could
  write to another session's node. Tightening this to host-only writes is the
  main outstanding security task.
- **No automated tests.** There is no unit or integration test suite; testing
  has been manual. This is the largest gap in the project.
- **No CI pipeline.** Lint and build are run locally, not enforced on push.
- **`--legacy-peer-deps` required.** `@toast-ui/react-image-editor` declares a
  React 17 peer dependency. It works on React 19 at runtime, but installs need
  the flag until the dependency is replaced.
- **Analytics are per-quiz.** There is no cross-quiz or per-student trend view yet.
