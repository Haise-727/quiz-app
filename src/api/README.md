# src/api

The only place the app talks to a database or a sign in service.

Pages, components and contexts call the functions in this folder. They never import
Firebase. ESLint enforces this (`no-restricted-imports` in `eslint.config.js`).

Why: today the backend is Firebase. The plan in `docs/aws-migration.md` moves it to AWS one
piece at a time. If every call goes through here, moving a piece means rewriting one file
in this folder, not 17 pages.

| File | What it holds |
|---|---|
| `auth.js` | sign in, sign up, sign out, who is signed in, error messages |
| `users.js` | profiles (`users/{uid}`) and display names |
| `quizzes.js` | create, read, update, delete and list quizzes, join codes |
| `results.js` | submit a result, list results, mark a result, completion counts |
| `classes.js` | classes, enrolments, due dates |
| `questionBank.js` | the teacher's saved questions |
| `notifications.js` | create, list (live), mark read |
| `live.js` | live games on the Realtime Database, and the pure scoring rules re-exported |
| `account.js` | export my data, delete my account |
| `devTools.js` | teacher test helpers (seed and clear) |

## The rules every function follows

1. Return plain objects with an `id`. Never a snapshot or a reference.
2. The server stamps times (`createdAt`, `updatedAt`, `completedAt`). Callers do not send them.
   Times that come back must have `toDate()` and `toMillis()` (pages call both).
3. A function that finds nothing returns `null` or `[]`. It does not throw.
4. A function that is not allowed or fails throws, and the page shows a message.
5. Two listeners exist: `listenToNotifications` and `listenToSession`. Each returns an
   unsubscribe function. Everything else reads once.

## Moving a function to AWS

Keep the name and the return shape. Change only the inside. For example `getQuiz(id)` becomes
`fetch(API + '/quizzes/' + id)`. A switch such as `VITE_BACKEND=aws` can choose between the old
and new body while both run side by side.
