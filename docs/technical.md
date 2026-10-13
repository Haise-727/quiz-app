# Quizlike technical reference

Schemas, rules and code patterns. For what the project is, see the
[README](../README.md). For an optional plan to move to AWS, see [aws-migration.md](aws-migration.md).
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
│   │   │              Grading  Analytics  Insights  HostSession
│   │   └── Profile.jsx
│   ├── components/
│   │   ├── quiz/      QuizRunner  QuestionView  OptionCard  PlacementChip  QuizBrowser ...
│   │   ├── live/      LiveOption  Countdown  Leaderboard  Podium  PowerUpBar  ...
│   │   ├── game/      XPBar  LevelBadge  StreakChip  BadgeTile  AnimatedNumber  JoinField  DailyQuestion  WeakSpots
│   │   ├── landing/   HeroDemo  LevelDemo
│   │   ├── layout/    DashboardLayout  PageHeader  PublicNav  PublicFooter
│   │   ├── teacher/   HotspotEditor  ImportQuestionsDialog  CopyCodeButton  Skeleton
│   │   ├── MathText.jsx                  formulas in question text (KaTeX, loaded on demand)
│   │   └── ui/        button  input  dialog  dropdown-menu  switch  ...
│   ├── utils/
│   │   ├── gamification.js     XP, levels, streaks, badges (pure)
│   │   ├── quizAttempt.js      answer shapes and grading (pure)
│   │   ├── liveScoring.js      live game rules (pure)
│   │   ├── liveSession.js      live game database calls
│   │   ├── guestProgress.js    a guest's progress, kept in the browser
│   │   ├── csv.js              safe spreadsheet export
│   │   ├── questionImport.js   reads a pasted table or CSV into questions (pure)
│   │   ├── questionValidation.js  what must be true before a quiz is published (pure)
│   │   ├── mathText.js         finds formulas in text (pure)
│   │   ├── insights.js         teacher insights (pure)
│   │   ├── daily.js  weakSpots.js  the daily question and weak spots (pure)
│   │   ├── accountPlan.js  accountData.js  export and delete an account
│   │   ├── quizCopy.js  userNames.js  duplicate and clone, and name lookups
│   │   ├── media.js  mediaUpload.js  quizLookup.js  sounds.js  ...
│   ├── contexts/      AuthContext  ThemeContext  ProgressContext
│   ├── hooks/useQuizKeys.js
│   ├── lib/motion.js           the shared animation language
│   ├── index.css               design tokens and base styles
│   └── firebase.js
├── scripts/                    unit tests and the media seeding script
├── docs/
├── firestore.rules  database.rules.json  firebase.json  .env.emulator  vercel.json
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
| Badges | 12, each with a target value and a progress bar while locked |

**The daily question.** Every student gets the same question each day, chosen by a
hash of the local date from the open quizzes (single answer multiple choice, true
or false, and fill in the blank, with no media). Answering it is saved ONCE per day
as a result with the id `daily-YYYY-MM-DD` and an empty `teacherId`, so it needs no
new rules and no teacher ever sees it. It counts toward the streak and earns a flat
15 XP when right or 5 when wrong. It never counts in the averages, the quizzes taken,
the recent activity or the quiz badges (`src/utils/daily.js`).

**Weak spots.** `src/utils/weakSpots.js` ranks the student's subjects by accuracy on
their latest attempt of each quiz, and lists up to six questions missed on that latest
attempt, newest first. A question answered right on a later attempt drops off.

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
tested. `src/api/live.js` only talks to the database.

```
sessions/{pin}
  quizId, quizTitle, hostId, totalQuestions, skippedCount, createdAt
  state: "lobby" | "question" | "reveal" | "leaderboard" | "ended"
  currentQuestionIndex, questionStartedAt, questionEndsAt
  settings: { streakBonus, powerUps, shuffle, lockOnStart, teams, suddenDeath }
  pausedAt: server time the host paused at, absent while the game runs
  order: [position, ...]                      only when shuffle is on
  players: { [playerId]: { name, score, streak, bestStreak, correctCount, joinedAt, connected,
                           team, eliminatedAt, powerups: { fifty, double }, doubleFor, fiftyFor } }
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

**Coming back.** A seat is never deleted when a connection drops: `watchPresence` marks it
`connected: false` and the seat keeps its score. A phone saves its seat in `localStorage`
and rejoins by itself after a reload. A new phone that uses the name of someone who has
dropped takes their seat (`claimSeat`), and a name held by someone still connected is
refused. Seats are forgotten after six hours.

**Pausing.** The host writes `pausedAt`. Every clock shows the time left at that moment.
On resume the start, and any moved deadline, slide later by exactly the length of the
pause (`resumeShift`), so players get back the time they had and the speed bonus is kept.

**Teams.** With `settings.teams` of 2, 3 or 4, a new player joins the smallest team and
turning teams on after players have joined spreads them in join order. A team scores the
AVERAGE of its players. Teams and sudden death cannot be on together.

**Sudden death.** Whoever did not answer fully right is marked `eliminatedAt` with the
question number. The host does this about 1.5 seconds AFTER the reveal, because a
player's answer is stored a beat after their phone says "locked in" and must be counted.
If a question would knock out everyone still in, nobody goes. The game ends when one
player is left. The final order is those still standing, then the later you went out the
better, then score.

**Settings.** The host picks them in the lobby. `shuffle` stores one random
`order` that everyone reads. `lockOnStart` makes `joinSession` refuse late
joiners.

**Types.** Ten of the eleven question types play live (`LIVE_SUPPORTED_TYPES`).
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
| `NUMERIC` | A number with a tolerance and an optional unit | yes |
| `HOTSPOT` | Tap the right place on a picture | yes |

### Number and click on the image

`NUMERIC` stores `numericData: { answer, tolerance, unit }`. A student's answer is the text
as typed. `parseNumeric` accepts a comma or a point as the decimal mark, a thousands comma
(`1,000` is 1000), spaces and the unit after the number, and `gradeNumeric` allows the
tolerance as a plain plus or minus. Text that is not a number is never marked right.

`HOTSPOT` stores `hotspotData: { regions: [{ id, x, y, w, h }] }`, boxes drawn on the
question's own picture (`question.media`), all in percentages of the picture so they match
at any size. The student's answer is `{ x, y }` in the same unit, and a tap inside any box
is right. The picture is shown uncropped, because a crop would move the boxes. The picture
claims the arrow keys (`data-owns-keys`) so the quiz shortcuts do not steal them.

## Maths

Between dollar signs a question or option is drawn as a formula: `$x^2$` inline, `$$...$$`
on its own line, `\$` for a plain dollar sign. Money is safe: `$5 and $10` is not maths,
because an inline formula needs text touching both dollar signs. `splitMath` finds the
formulas (pure, tested). `MathText` draws them with KaTeX, fetched only when a formula
appears, with `trust` off so teacher text cannot add links or scripts.

## Importing questions

`importQuestions` in `src/utils/questionImport.js` turns a table into editor questions. It
guesses the separator (comma, semicolon or tab, so a paste from a spreadsheet works),
reads quoted cells with commas, quotes and line breaks, and reports problems by the row
number a spreadsheet would show. The right answer can be a letter, a number or the
option's own text. The editor's dialog previews the result before anything is added.
`validateQuestions` (`questionValidation.js`) runs before every publish.

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

The rules that matter are plain functions, tested without a browser. Run them all:

```
npm test
```

| File | What it checks |
|---|---|
| `test-gamification.mjs` | XP, levels, streaks, badges, the daily result (run it under several time zones) |
| `test-quiz-attempt.mjs` | answer shapes, grading, numbers with tolerance, clicks on a picture |
| `test-live-scoring.mjs` | live scoring, power-ups, ranking, pausing, rejoining, teams, sudden death |
| `test-question-import.mjs` | reading a pasted table or CSV |
| `test-question-validation.mjs` | what must be true before publishing |
| `test-math-text.mjs` | finding formulas and not mistaking money for maths |
| `test-insights.mjs`, `test-daily.mjs`, `test-weak-spots.mjs` | teacher insights, the daily question, weak spots |
| `test-account-plan.mjs`, `test-csv.mjs` | what an account owns, safe spreadsheet export |

Each file was mutation checked: break a rule on purpose and the matching test fails.

## Trying things with nothing at stake

`npm run emulators` starts the Firebase Authentication, Firestore and Realtime Database
emulators on your own computer, loaded with `firestore.rules` and `database.rules.json`
(it needs Java 17 or newer). `npm run dev:emulated` runs the app at
http://localhost:5174 wired to them with fake keys from `.env.emulator`. Accounts and data
live only in the emulators and disappear when you stop them. Use it to try a rule change
before publishing it: every rule in this repo was proven this way.

## Accessibility

Every page, dialog and live screen was checked with axe-core in light and dark mode. Pages
have a skip to the content link, one main landmark and one level one heading, headings go
up one level at a time, and the paused live screen makes its answer board `inert`. The
quiz works from the keyboard: number keys choose, Enter moves on, the arrow keys move a
marker on a picture question.

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
