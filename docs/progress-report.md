# Quizlike progress report

**Status: feature complete and deployed** at https://quizlike.vercel.app. The
last round of work was a full redesign, a game layer on every kind of quiz, and a
rebuilt live game, and then eleven question types, a quiz importer, teacher insights,
a daily question and team and sudden death live games. What remains is hardening that
needs a server of our own.

## What it is

A full stack quiz platform in the style of Kahoot and Quizizz. Teachers build and
manage quizzes and classes. Students take them alone, as homework, or in a live
game. Guests can take part with no account.

---

## Features

### Accounts

- Google and email sign in
- Teacher and student roles on one account, switchable from the profile page
- Route guards with role checks
- A profile page: edit your name, see your level and badges, switch role

### Building quizzes (teachers)

- Eleven question types: multiple choice (one or several answers), true or false,
  fill in the blank, number (with a tolerance and a unit), click on the image,
  paragraph (marked by hand), match, reorder, categorize, visual comprehension and
  listening comprehension
- Maths between dollar signs, drawn as formulas
- Import questions from a pasted table or a CSV file, with a preview and row by row errors
- A check before publishing that names any broken question
- Duplicate a quiz, folders, and cloning of open quizzes by other teachers
- Pictures, audio and video on questions and on answer options
- Crop and annotate images before upload
- Draft autosave, and full editing of published quizzes
- A join code for every quiz, an active switch, a time limit and points per question
- A question bank to save and reuse questions

### Taking quizzes

- One shared quiz screen for signed in students and guests
- A timer ring, a progress strip, and animated moves between questions
- Keyboard shortcuts: number and letter keys to choose, Enter and arrows to move
- Match and Categorize by dragging or by tapping, with a tray pinned to the top on phones
- Sound effects, with a mute switch

### The game layer

- XP for every quiz: more for accuracy, a bonus for a perfect score, and only
  the best attempt on each quiz counts
- Levels, a daily streak and twelve badges, all worked out from saved results
- A daily question that is the same for every student, which keeps the streak going
- Weak spots: subjects ranked by accuracy and the questions to revisit
- A result screen that fills the XP bar, levels up and shows new badges
- Guests keep progress on their device until they sign up
- A student dashboard and sidebar chip that show level, XP and streak

### Live games

- The host picks the rules in the lobby: streak bonus, power-ups, shuffled
  questions, and a lock on late joiners
- A QR code and a link as well as the code, with copy buttons
- A shared 3, 2, 1 on every device, using server time
- Streak bonus up to +50%, a 50/50 and a double points power-up for each player
- Teams (a team scores the average of its players) or sudden death (a wrong answer knocks you out)
- A pause button that gives everyone back exactly the time they had
- A seat is kept when a player reloads, loses signal or changes phone
- A leaderboard that shows who moved, and a podium
- Ten of the eleven question types, including Match, Reorder, Categorize, number and click on the image
- Pictures, audio and video on each player's own device. A long clip extends the clock
- The host can kick players and export the results as a spreadsheet

### Classes and assignments

- Create classes, invite students by code, assign quizzes with due dates, and
  track who has finished
- In app notifications

### Teacher tools

- A home page with live numbers, a quiz list with a menu per quiz, and one button to host
- Grading with a queue of pending answers and partial credit
- Analytics for each quiz: score spread, accuracy per question and a student table
- Insights across all quizzes: activity by week, the most missed questions, a student table with trends
- A CSV export that neutralises spreadsheet formulas

### Student pages

- Join by code or browse open quizzes
- Results: a stats strip, a score trend, averages by subject, and every attempt
  with a full review of each answer

### Design

- Light by default with a dark option, one green accent, serif headings
- Motion limited to transform and opacity, and reduced when the system asks
- Phone friendly everywhere, with skeleton loaders and calm empty states

---

## Routes

| Page | Route | Access |
|---|---|---|
| Landing | `/` | Public |
| Browse | `/browse` | Public |
| Login | `/login` | Public |
| Guest quiz | `/quiz/:quizId` | Public |
| Live play | `/play`, `/play/:pin` | Public |
| Profile | `/profile` | Any signed in user |
| Teacher home | `/teacher/home` | Teacher |
| Create quiz | `/teacher/create-quiz` | Teacher |
| Edit quiz | `/teacher/edit-quiz/:quizId` | Teacher |
| Your quizzes | `/teacher/your-quizzes` | Teacher |
| Classes | `/teacher/classes` | Teacher |
| Question bank | `/teacher/question-bank` | Teacher |
| Grading | `/teacher/grading/:quizId` | Teacher |
| Analytics | `/teacher/analytics/:quizId` | Teacher |
| Insights | `/teacher/insights` | Teacher |
| Host live game | `/teacher/host/:pin` | Teacher |
| Student dashboard | `/student/dashboard` | Student |
| Join a quiz | `/student/attend-quiz` | Student |
| Take quiz | `/student/quiz/:quizId` | Student |
| Results | `/student/results` | Student |
| Not found | `*` | Public |

Six old links redirect so that shared URLs keep working. That includes the old
practice and flashcard links, which now open the quiz.

---

## Quality

- Unit tests for XP and levels, grading, live scoring and the CSV export. Each
  was checked by breaking a rule on purpose and watching the test fail.
- Every page was opened in a real browser with real data: a guest, a student and
  a teacher, a live game with a host and two players, phone width and dark mode.
- Real image, audio and video files were uploaded through the same steps the
  editor uses, then checked on every page that shows media.

## Remaining work

**Before this is production grade**

- Close the gaps in [security.md](security.md). The biggest are answer keys that
  can be read, scores that the browser writes, and the open live game database.
- Publish the new rules in the Firebase console (steps in [security.md](security.md)).
- A server of our own, so scores and answer keys stop living in the browser. An AWS
  plan exists ([aws-migration.md](aws-migration.md)) but the move is not under way.
- Run lint, build and the unit tests on every push.
- Commit browser tests for the main flows.

**Nice to have**

- Drag to reorder questions in the editor, and duplicate a question
- Import questions from CSV
- Cross quiz and per student trends for teachers
