<div align="center">

# Quizlike

### Build a quiz. Play it live. Learn it anywhere.

A full-stack quiz platform where teachers create rich, media-heavy quizzes
and students play them solo, as a class assignment, or in a live
Kahoot-style multiplayer game with a shared PIN.

[![Live Demo](https://img.shields.io/badge/Live_Demo-quizlike.vercel.app-22c55e?style=for-the-badge)](https://quizlike.vercel.app)

![React](https://img.shields.io/badge/React_19-149ECA?style=flat-square&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase_11-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

<img src="docs/screenshots/landing.png" alt="Quizlike landing page" width="100%">

</div>

---

## Why it exists

Most classroom quiz tools make you pick: either a fast live game, or a proper
graded assignment with real marking. Quizlike does both from the same quiz.
Write the questions once, then run them live on a projector, set them as
homework with a due date, or let anyone revise them as flashcards.

---

## Features

### 🎯 Nine question types

Far beyond multiple choice. Eight of them are graded instantly and play in live games.

| Type | What it does | Live mode |
|---|---|:---:|
| **Multiple Choice** | Single or multi-select, any number of options | ✅ |
| **True / False** | The quick one | ✅ |
| **Fill in the Blank** | Free text, multiple accepted answers | ✅ |
| **Match the Following** | Drag answers onto their prompts | ✅ |
| **Reorder** | Drag items into the correct sequence | ✅ |
| **Categorize** | Sort items into buckets | ✅ |
| **Paragraph** | Long-form, graded by hand | ✍️ manual |
| **Visual Comprehension** | An image plus follow-up questions | ✅ |
| **Listening Comprehension** | Audio or video plus follow-up questions | ✅ |

The drag-and-drop types award **partial credit**, so getting three of four
matches right is worth three quarters of the marks rather than nothing.

### 🔴 Live multiplayer

Host a game and put the PIN on the projector. Students join from their phones
with the code or a share link, and answers, scores and the leaderboard sync in
real time through Firebase Realtime Database.

- Lobby with players appearing as they join
- Teacher controls when each question is revealed
- Speed-weighted scoring: answer faster, score higher
- Live leaderboard between questions and a podium at the end
- Sound effects and confetti

### 👤 No account needed

Guests join by code, play the whole quiz, and their results still reach the
teacher. Browse, Practice and Flashcards are fully public too, so a shared
link just works.

### 📚 Three ways to study the same quiz

| Mode | Timed | Scored | Sign-in |
|---|:---:|:---:|:---:|
| **Play** | yes | yes | optional |
| **Practice** | no | no | no |
| **Flashcards** | no | self-rated | no |

Practice gives instant right-or-wrong feedback and a reveal button. Flashcards
flip in 3D, track "Got it" versus "Still learning", shuffle, and let you drill
only the ones you keep missing.

### 🖼️ Real media support

Images, video and audio on both questions and individual answer options, served
through the ImageKit CDN. Crop and annotate images in the browser before
uploading, without leaving the quiz editor.

### 🏫 Classes and assignments

Create a class, enrol students, assign quizzes with due dates, and track who
has finished. Students get in-app notifications when work is set.

### ✏️ Grading and analytics

- Auto-grading for everything except paragraph answers
- A marking queue for the ones that need a human, with partial credit
- Score distribution and per-question pass rate charts
- Sortable results table and one-click CSV export

### 🎨 Built to feel good

Light and dark themes, responsive from phone to projector, animated
transitions throughout, and a reusable question bank so you never write the
same question twice.

---

## Tech Stack

| Layer | Built with |
|---|---|
| **Frontend** | React 19, Vite 6, React Router 7 |
| **Styling** | Tailwind CSS v4, shadcn/ui on Radix, Framer Motion |
| **Auth** | Firebase Authentication — Google OAuth and email/password |
| **Database** | Cloud Firestore (7 collections) + Realtime Database for live sessions |
| **Media** | ImageKit CDN, TUI Image Editor |
| **Charts** | Recharts |
| **Hosting** | Vercel — static CDN plus serverless functions |

Authorisation is enforced server-side by Firestore security rules rather than
in client code, so a modified client cannot read or write what it should not.

---

## Quick Start

```bash
git clone https://github.com/Haise-727/quiz-app.git
cd quiz-app
npm install --legacy-peer-deps
cp .env.local.example .env.local   # fill in Firebase + ImageKit values
npm run dev                        # http://localhost:5173
```

`--legacy-peer-deps` is required because `@toast-ui/react-image-editor`
declares a React 17 peer dependency but runs fine on React 19.

> **Blank page on first run?** A client environment variable is missing. The
> ImageKit SDK is constructed at module scope, so an empty `VITE_URL_ENDPOINT`
> throws during import and React never mounts. See `.env.local.example`.

---

## Team

| | |
|---|---|
| **Harsha Vardan M Sakamuri** | Frontend, Backend, Database, Deployment |
| **Rakshith Shakkthi** | Frontend & UI, Backend |

---

## Documentation

- **[Technical reference](docs/technical.md)** — schemas, auth flow, code patterns
- **[Architecture deep dive](PROJECT_OVERVIEW.md)** — design decisions and trade-offs
- **[Progress report](docs/progress-report.md)** — what is built, what is left
- **[Contributing](docs/contributing.md)** — setup guide for new collaborators

<div align="center">

**[Try it live →](https://quizlike.vercel.app)**

</div>
