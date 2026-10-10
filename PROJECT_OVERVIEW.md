# Quizlike: how it is put together

This explains how the project is built and why. For what the product does and
how to run it, start with the [README](README.md). For file by file detail,
schemas and scoring rules, see [docs/technical.md](docs/technical.md).

---

## Design goals

1. **No server to run.** The team is small, so the project leans on managed
   services. There is no Express app, no container and no VM. Firebase provides
   sign in and data, and Vercel serves the site and runs one small function.
2. **Rules belong on the server.** Hiding a button is not security. Access rules
   live in `firestore.rules`. Some rules are still too loose, and
   [docs/security.md](docs/security.md) lists them honestly with a plan.
3. **The right database for each job.** Firestore for durable records you can
   query. Realtime Database for live game state that must reach every player in
   under a second.
4. **Guests are first class.** A student can take a quiz from a shared link
   without an account, and the teacher still gets the result.
5. **Rules are plain functions.** Scoring, grading, XP and live game rules are
   pure functions with no React and no database calls, so they can be tested on
   their own and moved to a server later without a rewrite.
6. **A small design language.** One accent colour, one motion vocabulary and one
   set of tokens, so a new page looks right by default.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Framework | React 19 and Vite 6 | Fast dev loop, ES modules, little config |
| Routing | React Router 7 | Nested routes and route level guards |
| Styling | Tailwind CSS v4 | Utility classes over a small set of theme tokens |
| Components | Radix primitives, owned in the repo | Accessible parts that we can restyle freely |
| Icons and type | Phosphor, Geist, Instrument Serif | One icon family, self hosted fonts |
| State | React Context | Three small contexts: auth, theme, student progress |
| Animation | Framer Motion | Springs for presses, staggers for entrances |
| Charts | Recharts | One line chart on the student results page |
| Auth | Firebase Authentication | Google and email sign in with no identity service to run |
| Database | Cloud Firestore | Document model fits a quiz with its questions inside |
| Live state | Firebase Realtime Database | Low latency fan out for short lived sessions |
| Media | ImageKit | CDN storage and transforms, keeps large files out of Firestore |
| Drag and drop | Pointer placement, plus @hello-pangea/dnd for Reorder | See the note in the technical reference |
| Hosting | Vercel | Static site on a CDN plus a serverless function from the same repo |

---

## How the layers talk

### Frontend

Pages under `src/pages` fetch data and call helpers in `src/utils`, which wrap
the Firebase SDK. Components under `src/components` are presentational. Three
contexts hold global state: who is signed in (`AuthContext`), the theme
(`ThemeContext`), and a signed in student's progress (`ProgressContext`).

The parts that behave the same everywhere are shared: `QuizRunner` plays a quiz
for signed in students and guests, `QuestionView` draws a question, and
`QuizBrowser` lists open quizzes on the public and student pages.

`ProtectedRoute` wraps routes that need a session. Given a `role` it also
enforces it and sends a mismatched user to their own home, including the short
window where sign in has finished but the profile has not loaded.

### Backend

There is no traditional backend. The browser talks to Firebase directly, and
Firestore security rules decide what it may read and write.

The one custom endpoint is `api/auth.js`. ImageKit uploads must be signed with a
private key, and a private key cannot be sent to a browser, so the function
keeps it in a Vercel environment variable and returns a short lived signed token.

### Data

**Firestore** holds users, quizzes, results, classes, enrolments, the question
bank and notifications. Questions are an array inside their quiz document,
because a quiz is always read as a whole and one read beats many.

**Realtime Database** holds only `sessions/{pin}`, the live game. It changes on
every answer and has to reach every client at once, which suits it well and
would cost a lot on Firestore.

**ImageKit** holds uploaded media. Firestore keeps only the URLs.

**XP is not stored.** Levels, streaks and badges are worked out from the results
that are already saved, so there is nothing new to forge and the rules can change
without a data migration.

### Deployment

A push to `main` triggers a Vercel build. Vite makes a static bundle for the CDN,
`api/` becomes a serverless function, and `vercel.json` rewrites every path to
`index.html` so deep links work. Security headers are set there too. Firestore
rules are deployed separately from the Firebase console.

---

## Known limitations

- **Security gaps.** Answer keys are readable by anyone who can read a quiz,
  scores are written by the browser, the live game database is open, and roles
  are a preference rather than a boundary. All of it is written up in
  [docs/security.md](docs/security.md), with fixes ordered by effort. The plan is
  to close these while moving to AWS ([docs/aws-migration.md](docs/aws-migration.md)).
- **Tests cover rules, not screens.** The scoring, grading, XP and export rules
  have unit tests. There are no committed browser tests yet.
- **No CI.** Lint and build run on a developer's machine, not on every push.
- **`--legacy-peer-deps` is needed.** `@toast-ui/react-image-editor` declares a
  React 17 peer dependency. It runs on React 19, but installs need the flag until
  that package is replaced.
- **Analytics are per quiz.** There is no cross quiz or per student trend view
  for teachers yet.
