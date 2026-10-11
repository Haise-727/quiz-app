# Quizlike technical reference

Schemas, rules and code patterns. For what the project is, see the
[README](../README.md). For the cloud move, see [aws-migration.md](aws-migration.md).
For known weaknesses, see [security.md](security.md).

## Project structure

```
quiz-app/
├── api/auth.js                    Vercel function: signs ImageKit upload tokens
├── src/
│   ├── pages/
│   │   ├── Landing.jsx  Browse.jsx  Login.jsx  NotFound.jsx     public
│   │   ├── PlaySession.jsx                                       a player in a live game
│   │   ├── Guest/GuestTakeQuiz.jsx                               a guest taking a quiz
│   │   ├── Student/   StudentDashboard  AttendQuiz  TakeQuiz  YourResults
│   │   ├── Teacher/   TeacherHome  CreateQuiz  YourQuizzes  Classes  QuestionBank
│   │   │              Grading  Analytics  HostSession
│   │   └── Profile.jsx
│   ├── components/
│   │   ├── quiz/      QuizRunner  QuestionView  OptionCard  PlacementChip  QuizBrowser ...
│   │   ├── live/      LiveOption  Countdown  Leaderboard  Podium  PowerUpBar  ...
│   │   ├── game/      XPBar  LevelBadge  StreakChip  BadgeTile  AnimatedNumber  JoinField
│   │   ├── landing/   HeroDemo  LevelDemo
│   │   ├── layout/    DashboardLayout  PageHeader  PublicNav  PublicFooter
│   │   ├── teacher/   CopyCodeButton  Skeleton
│   │   └── ui/        button  input  dialog  dropdown-menu  switch  ...
│   ├── utils/
│   │   ├── gamification.js     XP, levels, streaks, badges (pure)
│   │   ├── quizAttempt.js      answer shapes and grading (pure)
│   │   ├── liveScoring.js      live game rules (pure)
│   │   ├── liveSession.js      live game database calls
│   │   ├── guestProgress.js    a guest's progress, kept in the browser
│   │   ├── csv.js              safe spreadsheet export
│   │   ├── media.js  mediaUpload.js  quizLookup.js  sounds.js  ...
│   ├── contexts/      AuthContext  ThemeContext  ProgressContext
│   ├── hooks/useQuizKeys.js
│   ├── lib/motion.js           the shared animation language
│   ├── index.css               design tokens and base styles
│   └── firebase.js
├── scripts/                    unit tests and the media seeding script
├── docs/
├── firestore.rules  database.rules.json  vercel.json
```

## Design system

The look is deliberately small: one warm off white canvas, near black ink,
hairline borders and a single green. Everything is a token in
`src/index.css`, so dark mode is a second set of the same names.

| Token | Use |
|---|---|
| `--background`, `--foreground` | page and text |
| `--ink` | the default button and anything that needs weight |
| `--primary` | green for go actions (join, start, host). Passes contrast as text and behind white text |
| `--brand` | a brighter green for decoration only, such as progress fills |
| `--tint-*` and `--tint-*-fg` | pastel pairs for status chips, never for large areas |
| `--flame` | streak fire |

Type is Geist for the interface, Instrument Serif for display headings
(`text-hero`) and Geist Mono for small labels and numbers (`eyebrow`,
`tabular`). The fonts are self hosted through `@fontsource` packages, so nothing
loads from a third party. Icons are Phosphor (`react-icons/pi`).

Light is the default everywhere. Dark is opt in: `[data-theme="dark"]` on the
root, set by a small script in `index.html` before first paint so there is no
flash. The `dark:` variant follows that toggle, not the operating system.

Motion lives in `src/lib/motion.js`: a stiff `spring` for presses and
selections, `springPop` for rewards, `stagger` and `rise` for entrances, and
`slideQuestion` between questions. Only `transform` and `opacity` are animated.
The app is wrapped in `MotionConfig reducedMotion="user"`, so people who ask
their system for less motion get fades.

## Gamification

Nothing about XP is stored. It is worked out from the quiz results the app
already saves, by the pure functions in `src/utils/gamification.js`. That means
there is no new field to forge, the rules can change without a data migration,
and the same file can run on a server later.

| Rule | Value |
|---|---|
| XP for an attempt | `round(questions * 10 * accuracy)` plus `questions * 2`, plus 25 for a perfect score, capped at 250 |
| Which attempts count | The best attempt on each quiz, so a retake earns only the difference |
| Level `n` starts at | `50 * n * (n - 1)` XP |
| Streak | Days in a row with at least one result. It stays alive until the end of the next day |
| Badges | 11, each with a target value and a progress bar while locked |

A signed in student's progress comes from `ProgressContext`, which fetches
results once and shares them with the sidebar chip, the dashboard and the
profile. A guest's results are kept in `localStorage` (`guestProgress.js`) and
the result screen invites them to sign up to keep it.

## Taking a quiz

`QuizRunner` is one component used by the signed in quiz and the guest quiz, so
they behave the same. It owns the timer, navigation and saving. It draws each
question with `QuestionView`, which only knows how to show a question and report
answer changes.

`src/utils/quizAttempt.js` holds the answer shapes and the grading. The shapes
are what gets saved as `userAnswer` on a result and what the review pages read,
so they must not change:

| Type | Stored answer |
|---|---|
| `MCQ` | `[optionId, ...]` |
| `TRUE_FALSE` | boolean |
| `FILL_IN_THE_BLANK`, `PARAGRAPH` | string |
| `MATCH_THE_FOLLOWING` | `{ pairs: { [pairId]: { answerText, answerMedia, ... } } }` |
| `REORDER` | `[item, ...]` in the student's order |
| `CATEGORIZE` | `{ bank: [...], [categoryId]: [item, ...] }` |
| `VISUAL_COMPREHENSION`, `LISTENING_COMPREHENSION` | `{ [subQuestionIndex]: [optionId, ...] }` |

Match, Reorder and Categorize give partial credit in proportion. Match and
Categorize use pointer based placement (`PlacementChip`, `placement.js`) with
tap to place as the fallback. Reorder uses `@hello-pangea/dnd`. The pointer
approach replaced the drag library for placement because its drop selection
grows the hovered zone by the height of the dragged item, which picked the wrong
slot when slots were stacked.

## Live games

State is in the Realtime Database under `sessions/{pin}`. The rules of a game
are pure functions in `src/utils/liveScoring.js`, which is where they are
tested. `src/utils/liveSession.js` only talks to the database.

```
sessions/{pin}
  quizId, quizTitle, hostId, totalQuestions, skippedCount, createdAt
  state: "lobby" | "question" | "reveal" | "leaderboard" | "ended"
  currentQuestionIndex, questionStartedAt, questionEndsAt
  settings: { streakBonus, powerUps, shuffle, lockOnStart }
  order: [position, ...]                      only when shuffle is on
  players: { [playerId]: { name, score, streak, bestStreak, correctCount, joinedAt,
                           powerups: { fifty, double }, doubleFor, fiftyFor } }
  answers: { [questionIndex]: { [playerId]: { answer, correct, points, parts, answeredAt } } }
```

**Time.** Every timestamp is server time. `serverNow()` reads
`.info/serverTimeOffset` and corrects the device clock, because a phone that is
a few seconds off would otherwise start a question early or late.
`questionStartedAt` is set three seconds in the future so every screen shows the
same 3, 2, 1. The host can move `questionEndsAt` later when a clip is longer
than the time limit. It only ever moves later.

**Scoring.** `points = round(base * (1 + streakPct/100) * (usedFifty ? 0.5 : 1) * (doubled && correct ? 2 : 1))`
where `base` is the question's points weighted by speed.

| Rule | Value |
|---|---|
| Streak bonus | +10% for each earlier correct answer in a row, up to +50%. Only fully correct answers count |
| 50/50 | Hides wrong options until half remain and halves the points. One per game |
| Double | Doubles the points if the answer is correct. One per game |
| Partial credit | Match, Categorize and comprehension score the share earned. Only a full answer sets `correct` |
| Ranking | Ties share a rank, and the leaderboard shows who moved up or down |

A player's score, streak and stored answer are all computed inside one
transaction from the player's own record, so a bonus or a double cannot apply
twice, and answering twice returns the first result.

**Settings.** The host picks them in the lobby. `shuffle` stores one random
`order` that everyone reads. `lockOnStart` makes `joinSession` refuse late
joiners.

**Types.** Eight of the nine question types play live (`LIVE_SUPPORTED_TYPES`).
Paragraph needs marking by hand, so it is skipped and counted in
`skippedCount`. Comprehension questions are one live question with partial
credit. Their answer keys are `s0`, `s1` and so on, never bare numbers, because
the Realtime Database turns an object with whole number keys into an array.

## Question types

| Value | Label | Graded automatically |
|---|---|---|
| `MCQ` | Multiple choice, single or multi select | yes |
| `TRUE_FALSE` | True or false | yes |
| `FILL_IN_THE_BLANK` | Fill in the blank | yes |
| `PARAGRAPH` | Paragraph | no, a teacher marks it |
| `MATCH_THE_FOLLOWING` | Match the following | yes |
| `CATEGORIZE` | Categorize | yes |
| `REORDER` | Reorder | yes |
| `VISUAL_COMPREHENSION` | Image plus follow up questions | yes |
| `LISTENING_COMPREHENSION` | Audio or video plus follow up questions | yes |

## Media

Every picture, clip or recording on a question is stored as one small object,
and the file itself lives on ImageKit.

```
{ url, fileId, fileType: "image" | "video" | "audio", cropData? }
```

It can sit in `media`, an MCQ option's `media`, a match pair's `promptMedia` and
`answerMedia`, a categorize or reorder item's `media`, and `visualData.mainMedia`
or `listeningData.mainMedia` for the comprehension types. Never read
`question.media` directly: use `getMainMedia` and `getSubQuestions` from
`src/utils/media.js`.

The editor keeps a picked file in memory until the teacher publishes. Publish and
"Save to bank" call `uploadQuestionMedia`, which asks `/api/auth` for a short
lived signed token (the ImageKit private key stays on the server), uploads, and
writes the object onto a copy of the question.

`fileType` comes from the browser's MIME type, because ImageKit calls every audio
and video file "non-image". Older quizzes still hold that value, and `mediaKind`
falls back to the file extension for them.

`scripts/seed-media-quiz.mjs` follows the same steps as the browser against a
throwaway teacher account, so media bugs can be tested with real files. Run it
with `--dir <folder>`, then `--cleanup`. Its header says what it creates and what
it cannot delete.

## Auth flow

```
Google sign in
  new user       role picker, then createUserProfile, then the dashboard
  existing user  fetchUserData, then the dashboard

Email sign in    signInWithEmailAndPassword, then onAuthStateChanged, then fetchUserData
Email sign up    createUserWithEmailAndPassword, updateProfile, createUserProfile
Role switch      switchRole updates users/{uid}; ProtectedRoute redirects to the right home
Guest            joins by code with no account; results are written with isGuest: true
```

Routes are guarded in `App.jsx`: `<ProtectedRoute role="teacher">` enforces a
role, `<ProtectedRoute>` needs any signed in user, and public routes have no
wrapper. Roles are a preference stored in the profile, not a security boundary.
See [security.md](security.md).

## Spreadsheet export

`src/utils/csv.js` quotes every cell and neutralises values that start with `=`,
`+`, `-`, `@`, a tab or a carriage return, so a name typed as a formula cannot
run when a teacher opens the export. The analytics export uses it.

## Tests

The rules that matter are plain functions, tested without a browser:

```
node scripts/test-gamification.mjs     XP, levels, streaks, badges (run it under several time zones)
node scripts/test-quiz-attempt.mjs     answer shapes and grading
node scripts/test-live-scoring.mjs     live scoring, streaks, power-ups, ranking
node scripts/test-csv.mjs              formula neutralising
```

Each file checks its own behaviour and was mutation checked: break a rule on
purpose and the matching test fails. Run them before a commit that touches
`src/utils`.

## Environment

- Dev server `npm run dev`, build `npm run build`, lint `npm run lint`.
- Firebase config comes from `VITE_*` variables read in `src/firebase.js`. Copy
  `.env.local.example` to `.env.local`. Nothing secret is committed.
- `npm run dev` does not serve the `api` folder. `vite.config.js` forwards `/api`
  to the deployed app so uploads work locally. Set `VITE_API_PROXY` to test a
  preview deployment.
- ImageKit server credentials live in the Vercel project settings only.
- `npm install` needs `--legacy-peer-deps`, because
  `@toast-ui/react-image-editor` declares a React 17 peer dependency but runs on
  React 19.
