# Quiz App – Project Overview

## 📄 Introduction
This repository contains **Quiz App**, a modern web application built with **React**, **Vite**, and **Tailwind CSS** (optional). The app enables teachers to create quizzes, students to take them, and stores results in **Firebase Firestore**. It follows a component‑driven architecture with a clear separation between UI, state, and data‑access layers.

---

## 🛠️ Tech Stack
| Layer | Technology | Reason |
|------|------------|--------|
| **Framework** | **React 18** + **Vite 6** | Fast dev server, hot‑module replacement, ES‑module support |
| **Styling** | **Tailwind CSS** (via `@tailwindcss/vite`) – optional, fallback to vanilla CSS | Utility‑first styling, theming, dark‑mode support |
| **State Management** | React Context + custom hooks | Lightweight, no extra library overhead |
| **Backend / Data** | **Firebase Firestore** (via `firebase` SDK) | Server‑less NoSQL store, realtime listeners |
| **Auth** | Firebase Authentication (Email/Password) | Secure, easy integration |
| **Build / Deploy** | Vite (dev) → static bundle, can be deployed to Vercel/Netlify |
| **Testing** | Jest + React Testing Library (planned) |

---

## 📦 Project Structure
```
quiz-app/
├─ public/               # static assets (favicon, etc.)
├─ src/                  # source code
│  ├─ api/               # wrappers around Firebase calls
│  ├─ components/        # reusable UI components
│  │   ├─ ImageEditorModal.jsx
│  │   └─ …
│  ├─ pages/             # route‑level components (Student/, Teacher/)
│  ├─ hooks/             # custom React hooks
│  ├─ context/           # React Context providers
│  ├─ utils/             # helper utilities
│  ├─ App.jsx            # root component (router + layout)
│  └─ main.jsx           # React entry point
├─ .env                  # environment variables (Firebase keys)
├─ vite.config.js        # Vite configuration (Tailwind plugin, alias)
├─ package.json          # deps & scripts
└─ README.md             # high‑level docs (this file is a deeper dive)
```

---

## 🏗️ Architecture Overview
### 1. Front‑End (React)
- **Router** – `react-router-dom` handles navigation between `/login`, `/student`, `/teacher`, etc.
- **Component hierarchy** – UI components are pure and stateless; state lives in Context providers (e.g., `AuthContext`, `QuizContext`).
- **Data flow** – Components call async functions from `src/api/*` which interact with Firestore. Results are stored in Context and propagated via hooks.

### 2. Backend (Firebase)
- **Firestore collections**:
  - `users` – user profile & role (teacher / student)
  - `quizzes` – quiz metadata, questions, options
  - `responses` – student answers linked to quiz ID and user ID
- **Security Rules** – defined in `firestore.rules` to enforce role‑based read/write permissions.
- **Auth** – Firebase Auth provides JWT tokens that are verified on the client side to identify the current user.

### 3. Build / Deploy Pipeline
1. `npm install` – installs dependencies (including `@tailwindcss/vite`).
2. `npm run dev` – starts Vite dev server on `http://localhost:5173`.
3. `npm run build` – creates an optimized static bundle in `dist/`.
4. Deploy `dist/` to Vercel/Netlify or serve via any static web server.

---

## 🔄 Development Workflow
| Step | Description |
|------|-------------|
| **1️⃣ Clone & Install** | `git clone <repo>` → `npm install --legacy-peer-deps` (required for some legacy deps). |
| **2️⃣ Environment** | Create a `.env` file (copy from `.env.local.example`). Add your Firebase config variables (`VITE_FIREBASE_API_KEY`, etc.). |
| **3️⃣ Run Dev Server** | `npm run dev`. Vite watches files and hot‑reloads on change. |
| **4️⃣ Feature Development** | - Create a new branch `git checkout -b feat/<name>`.
- Write UI components under `src/components/`.
- Add API helpers under `src/api/`.
- Update Context or hooks as needed.
- Run `npm run lint` (optional) to keep code clean. |
| **5️⃣ Test (future)** | Add Jest tests under `src/__tests__/`. Run `npm test`. |
| **6️⃣ PR & Merge** | Open a PR, CI runs lint + build, then merge to `main`. |
| **7️⃣ Deploy** | CI/CD (GitHub Actions) triggers a Vercel deployment on merge. |

---

## 📋 Product Requirements Document (PRD) – High‑Level
| # | Feature | Description | Acceptance Criteria |
|---|---------|-------------|----------------------|
| 1 | **User Authentication** | Teachers & students sign‑up / login with email & password. | ✅ Auth flow works; role stored in Firestore; protected routes redirect unauthenticated users. |
| 2 | **Quiz Creation (Teacher)** | Teacher can create a quiz with title, description, multiple‑choice questions, timer, and optionally upload an image. | ✅ All fields saved; quiz appears in teacher dashboard; validation errors shown. |
| 3 | **Quiz Taking (Student)** | Student can browse available quizzes, start one, answer questions, and submit. | ✅ Answers stored under `responses`; timer stops at 0; UI shows progress bar. |
| 4 | **Result Summary** | After submission, student sees score, correct answers, and a summary chart. | ✅ Score calculated correctly; chart displays via Chart.js; data persisted. |
| 5 | **Realtime Updates** | Teacher dashboard shows live count of attempts per quiz. | ✅ Firestore listener updates UI without page refresh. |
| 6 | **Responsive Design** | App works on desktop, tablet, and mobile. | ✅ Layout adjusts; touch interactions work; no horizontal overflow. |
| 7 | **Accessibility** | Keyboard navigation & ARIA labels for all interactive elements. | ✅ WCAG 2.1 AA compliance checklist passed. |
| 8 | **Dark Mode** (optional) | Users can toggle a dark theme that respects OS preference. | ✅ Theme persists in `localStorage`; UI components adapt. |

---

## 🚀 Getting Started (Quick Start)
```bash
# 1. Clone the repository
git clone https://github.com/your-org/quiz-app.git
cd quiz-app

# 2. Install dependencies (legacy peer deps required for older packages)
npm install --legacy-peer-deps

# 3. Set up environment variables
cp .env.local.example .env
# Edit .env and add your Firebase config values

# 4. Run the development server
npm run dev
# Open http://localhost:5173 in your browser

# 5. Build for production (optional)
npm run build
```

---

## 📚 Helpful Links
- **Vite Docs** – https://vitejs.dev/guide/
- **Tailwind CSS** – https://tailwindcss.com/docs
- **Firebase Docs** – https://firebase.google.com/docs
- **React Router** – https://reactrouter.com/

---

## 📝 Notes & Future Improvements
- Migrate to **Tailwind v4** once stable (currently using v3).
- Add **unit & integration tests** (Jest + React Testing Library).
- Implement **role‑based dashboards** with admin panel.
- Introduce **CI pipeline** (GitHub Actions) for lint, test, and preview deploys.
- Replace legacy packages (`inflight`, `npmlog`, etc.) with modern alternatives.

---

*This document is intended to give a new contributor a rapid understanding of the project’s purpose, architecture, and development workflow.*
