# Security Review

Reviewed on 9 October 2026. This covers our own code and rules, and the services
we depend on: Firebase, ImageKit, Vercel, GitHub and the npm packages.

## How we checked

We did not only read the code. We tested the live project from outside, the way
an attacker would.

- Anonymous requests to Firestore and the Realtime Database, with no login.
- A throwaway signed in account with no rights, deleted afterwards.
- The upload signer at `/api/auth`, called with no login.
- The response headers of the live site.
- `npm audit` on the production dependencies.
- A search of the whole git history for secrets.
- A search of the code for risky patterns such as `dangerouslySetInnerHTML`.

Every test that wrote anything cleaned up after itself, or used data that was
ours.

## The short version

The basics are sound. The weak spot is one design choice: **the browser is
trusted to do jobs that only a server should do.** The browser grades the quiz,
writes its own score, and decides who is allowed to write to a live game. Because
of that, anyone who opens the browser tools can cheat, and the database rules
cannot stop them.

None of this broke a demo, and none of it needs a rewrite to start fixing. The
plan at the end puts the cheap fixes first.

## What is already fine

- No secrets in git history, on any branch. The ImageKit private key exists only
  in Vercel's environment settings.
- The Firebase web config in the code is public by design. It identifies the
  project and does not grant access. Access is decided by the rules.
- No unsafe rendering. The code never uses `dangerouslySetInnerHTML`, `eval` or
  `innerHTML`, and React escapes everything it prints. Player names and quiz text
  cannot inject script.
- Anonymous visitors cannot list users, classes, enrolments, results, question
  bank items or notifications. Those rules hold.
- Results, the question bank and notifications can only be read by their owner.
- HTTPS is forced with a long `strict-transport-security` header.
- The lockfile is committed, and npm 12 blocks install scripts by default.

## Findings

Severity means how bad it is if someone uses it today.

| # | Severity | Finding |
|---|---|---|
| 1 | High | Anyone can download every answer key |
| 2 | High | Scores are written by the browser and accepted without checks |
| 3 | High | The live game database is open to the whole internet |
| 4 | High | The upload signer gives out tokens to anyone |
| 5 | High | Any signed in user can list every user's email |
| 6 | Medium | Roles are only a preference, not a permission |
| 7 | Medium | Any signed in user can read every class and its join code |
| 8 | Medium | The Firebase API key has no website restriction and there is no App Check |
| 9 | Medium | Almost no security headers |
| 10 | Medium | Dependency vulnerabilities |
| 11 | Low | No limits on the size or shape of stored data |
| 12 | Low | Weak random numbers and public codes |
| 13 | Low | Dev tools are visible in production |
| 14 | Low | Development and production share one Firebase project |

### 1. Anyone can download every answer key (High)

**Evidence.** With no login, one request returned all 10 public quizzes, 51
questions, and every answer key: 29 `correctOptions`, 4 `correctAnswer` and 7
fill in the blank answer lists.

**Why.** The quiz document holds the questions and the answers together, and the
rule lets anyone read an active quiz. Firestore rules decide who can read a
document. They cannot hide one field of it.

**Impact.** A student can read the answers before or during a graded quiz. A
graded quiz is only as honest as the students.

**Fix.** Keep the answers in a separate place that only the owner and a server
can read, for example `quizzes/{id}/private/answers`. The browser gets the
questions without answers. A small server function receives the submission,
grades it against the private answers, and writes the result. This is the same
change as finding 2.

### 2. Scores are written by the browser (High)

**Evidence.** An anonymous request created a result with a score of 999999 out of
10 and Firestore accepted it. The rule for `quiz_results` is `allow create: if
true` with no checks. We deleted the test result straight away.

**Why.** Guests have no account, so the rule lets anyone create results. Nothing
checks the score, the quiz or the teacher.

**Impact.** A student can give themselves any score. Anyone can also fill a
teacher's results page with junk by naming that teacher in the result.

**Fix, quick.** Tighten the rule so a result must name a real quiz, the
`teacherId` must match that quiz's owner, the score cannot exceed `maxScore`, and
the document cannot be large. This stops junk and nonsense scores, but a student
can still pick a believable score.

**Fix, proper.** Grade on the server, as in finding 1, and set the rule to
`create: false` for browsers.

### 3. The live game database is open to the whole internet (High)

**Evidence.** With no login we listed every live game PIN, read a session
including the host's user id, wrote a new session, read it back and deleted it.
The rules are `.read: true` and `.write: true` on `sessions`.

**Impact.** Anyone can end or hijack a game, change any player's score, kick
players, or collect PINs and host ids. Players write their own scores to the
database, so cheating needs no skill.

**Fix, quick.** Close the listing so a visitor needs the PIN to read a game. Sign
guests in with Firebase Anonymous Auth so every player has an id. Then write
rules per node: only the host can change `state`, `currentQuestionIndex` and the
timers, and a player can only write their own `players/{id}` and their own
answer once.

**Fix, proper.** Compute the score on a server so no player writes a score.

A starting point for the rules:

```
"sessions": {
  "$pin": {
    ".read": "auth != null",
    "state":                { ".write": "auth.uid === data.parent().child('hostId').val()" },
    "currentQuestionIndex": { ".write": "auth.uid === data.parent().child('hostId').val()" },
    "players": { "$uid": { ".write": "auth.uid === $uid" } },
    "answers": { "$q": { "$uid": { ".write": "auth.uid === $uid && !data.exists()" } } }
  }
}
```

### 4. The upload signer gives out tokens to anyone (High)

**Evidence.** `GET /api/auth` returns a valid ImageKit upload token and signature
to any caller, and it sends `access-control-allow-origin: *`. Our own test script
uploaded 25 files to the ImageKit account without logging in.

**Impact.** Anyone can use our ImageKit account as free storage. That costs money
and quota, and it lets someone host unwanted files under our account.

**Fix.** Make the function check a Firebase ID token before it signs anything. The
browser already has one. The function can verify it against Google's public keys
without a service account. Remove the wildcard CORS header, because the app only
calls it from its own origin. Add a rate limit. In the ImageKit dashboard,
restrict the allowed file types and sizes. When we move to AWS, an S3 presigned
upload can enforce a maximum size and file type itself, which closes this
properly.

### 5. Any signed in user can list every user's email (High)

**Evidence.** A brand new account with no profile and no role listed all 31
profiles. All 31 include an email address, plus role, display name and last login.

**Why.** The rule is `allow read: if isSignedIn()` on `users`, added so teachers
can see student names.

**Impact.** A privacy leak. Anyone can sign up and collect the email addresses of
every student and teacher.

**Fix.** Allow a profile to be read only by its owner. Teachers do not need the
profile: results already store the student's `username`, and enrolments can store
a display name. If a shared directory is ever needed, make a separate collection
that holds only a display name.

### 6. Roles are only a preference (Medium)

**Evidence.** A new account changed its own role to `teacher` and Firestore
accepted it. One real profile has a role value that is not a role at all.
Creating a quiz or a class does not check the role either.

**Impact.** There is no real difference between a student and a teacher. Any
signed in user can create quizzes and classes, and can create a notification for
another user.

**Fix.** Set the role as a Firebase custom claim from a server function, and make
the rules read `request.auth.token.role`. Restrict who can create notifications.

### 7. Any signed in user can read every class (Medium)

**Evidence.** A new account listed all classes, with their join codes.

**Fix.** Let a student fetch one class by its code, and let a teacher list only
their own classes. Joining is best done by a server function.

### 8. The API key has no website restriction, and there is no App Check (Medium)

**Evidence.** We created an account from a plain script with no `Referer`
header, so the key is accepted from anywhere.

**Why it matters.** A Firebase API key is not a secret, but an unrestricted key
lets anyone script sign ups and requests against our quota.

**Fix, in the consoles, no code.** In Google Cloud, restrict the key to our
website addresses and to the Firebase APIs we use. Turn on App Check in
monitoring mode, then enforce it. Set a budget alert on the project.

### 9. Almost no security headers (Medium)

**Evidence.** The live site sends only `strict-transport-security`.

**Missing.** `x-content-type-options`, `x-frame-options` (so the site cannot be
framed, which blocks clickjacking), `referrer-policy`, `permissions-policy` and a
`content-security-policy`.

**Fix.** The four simple headers are now in `vercel.json`: `x-content-type-options`,
`x-frame-options`, `referrer-policy` and `permissions-policy`. Check them after the
next deploy with `curl -I https://quizlike.vercel.app`. The CSP is still to do.
Start it in report only mode, because the app loads fonts, ImageKit media,
Firebase and the image editor, and a strict policy needs testing before it is
enforced.

### 10. Dependency vulnerabilities (Medium)

`npm audit` reports 28 findings on production dependencies: 5 critical, 13 high
and 10 moderate. Most of them cannot be reached from the browser.

- **React Router** was the one that mattered. It runs in the browser and had open
  redirect advisories. It is updated from 7.6.2 to 7.18.4, inside the version
  range we already allowed, and the routes were checked afterwards.
- **The image editor** (`tui-image-editor`, `fabric`) pulls in `request`,
  `form-data`, `tar` and `node-pre-gyp`. Those are Node tools used at install
  time and do not run in the browser. The only fix is a major version change of
  the editor, which also needs `--legacy-peer-deps` today. Long term, replace it.
- **Firebase** pulls in `ws`, `protobufjs` and `@grpc/grpc-js`, which are for its
  Node builds. The browser build uses neither.
- **ImageKit's server library** pulls in an old `axios`. The signer only uses it
  to compute a signature and never makes an HTTP call with it.

**Fix.** Keep `npm audit` in the checks, turn on Dependabot, and plan the editor
replacement.

### 11. No limits on size or shape of stored data (Low)

The join form limits a player name to 24 characters, but only in the browser. A
direct write to the database can send any size, and the Firestore rules do not
check field types, lengths or the number of questions.

**Fix.** Add `.validate` rules in the Realtime Database and field checks in the
Firestore rules.

### 12. Weak random numbers and public codes (Low)

Quiz join codes come from `Math.random`, and guest ids do too. Quiz codes are
shown on the Browse page on purpose, so they are not secrets. The live game PIN
has only six digits and can be listed today (finding 3).

**Fix.** Use `crypto.getRandomValues`, and treat codes as identifiers and never as
passwords.

### 13. Dev tools are visible in production (Low)

The teacher home page shows Clear Invalid Quizzes, Seed Test Quiz and Clear All
Quiz Results, and nothing hides them in production. They only touch the teacher's
own data, but one click wipes every result.

**Fix.** Show them only when `import.meta.env.DEV` is true.

### 14. Development and production share one Firebase project (Low)

Running `npm run dev` talks to the real database. A mistake while testing changes
real data.

**Fix.** Create a second Firebase project for development, or use the Firebase
emulators, and keep Vercel preview deployments off the production project.

## The services we depend on

| Service | What to do |
|---|---|
| Firebase | Restrict the API key, enable App Check, set a budget alert, turn on multi factor sign in for everyone with project access, review the project members. |
| ImageKit | Restrict file types and sizes in the dashboard. Rotate the private key if it was ever pasted anywhere. |
| Vercel | Vercel preview deployments are public by default and use the same environment variables as production. Turn on deployment protection for previews. |
| GitHub | Protect the `main` branch, require a review before merging, and turn on secret scanning and Dependabot. |
| npm | Commit the lockfile (done), keep `npm audit` in the checks, and avoid adding packages that need install scripts. |

## Fix plan, cheapest first

**Phase 0: console settings, no code (an hour).**
Restrict the API key, turn on App Check in monitoring mode, set a budget alert,
protect `main` on GitHub, turn on Dependabot and secret scanning, protect Vercel
previews. Delete the leftover test documents.

**Phase 1: rules and config only (a day).**
Tighten `users`, `classes`, `quiz_results` and `notifications`. Close the live
game listing and write per node rules, with Anonymous Auth for guests. Hide the
dev tools in production. The simple security headers are already done. This
removes findings 3 (mostly), 5, 7 and 13, and blunts 2 and 6.

**Phase 2: one small server function (a few days).**
Grade quizzes on the server, hide the answer keys, create results from the
server, sign the ImageKit upload only for a verified user, and set roles as
custom claims. This removes findings 1, 2, 4 and 6 for good, and it is the same
function that will award points and badges for the gamification work, so that
score cannot be forged either.

**Phase 3: the AWS move.**
The server function in phase 2 becomes the first real API tier. See
[aws-migration.md](aws-migration.md).

## Accepted for now

- The editor's Node only dependency warnings. They cannot run in the browser.
- Public quiz codes. They are meant to be shared.
- No account deletion. The rules forbid deleting a profile, which also blocks a
  user from removing their own data. Worth fixing before real users.

## Already changed

- React Router updated to 7.18.4, which clears its runtime advisories.
- Security headers added to `vercel.json` (finding 9, apart from the CSP).
- Notes and settings for AI coding tools are ignored by git, so they cannot reach
  a push by accident. See the end of `.gitignore`.
