# Backend requirements

Unresume currently runs entirely in the browser. `js/store.js` (`window.UR`) is a **stand-in for the backend**: it enforces every business rule and persists to `localStorage`. Every workflow really completes, and every role sees the results — but only within one browser, with no security.

To go to production, replace each `UR.*` method with a `fetch()` to the endpoint below. Pages only talk to `UR`, so **no page code needs to change** beyond making calls `async` where they aren't already.

> Anything marked **⚠ not available in the prototype** is honestly labelled in the UI (no fake success messages).

---

## 1. Services needed

| Service | Why | Prototype behaviour |
|---|---|---|
| **API server + PostgreSQL** | All data below | `localStorage` (per browser) |
| **Auth** (sessions/JWT, bcrypt/argon2) | Sign-in, roles | FNV hash in the browser — **not secure** |
| **Email** (SES/SendGrid/Postmark) | Password reset, email verification, team invites, notification emails | ⚠ Not sent. Reset requests go to the admin inbox; invites show a code to share manually |
| **Object storage** (S3/GCS) + signed URLs + virus scan | Task file uploads | ⚠ Only file name, size and SHA-256 are stored. Reviewers can't open files |
| **ID verification provider** (e.g. Onfido, Digio) | Candidate identity checks | Request recorded; an admin approves manually |
| **Calendar/video** (Google/Microsoft, Zoom/Meet) | Interview invites with links | `.ics` download + manual link field |
| **Plagiarism engine** (code similarity e.g. MOSS/JPlag; perceptual image hash; text similarity) | Integrity | Exact file-hash/URL match, note similarity (3-word shingles), timing and tab-switch signals |
| **LLM API** (server-side) | Task drafting assistant | Rule-based drafts from the template library. Publishing any drafted task requires human confirmation — keep that rule |
| **Billing** (Razorpay/Stripe) | Proposed company plans | Not integrated; `pricing.html` is marked proposed and no limits are enforced |
| **2FA / session service** | Account security | Login lockout after 5 failed attempts only |
| **Job queue** (BullMQ/SQS) | Expire attempts, send emails, run integrity checks | Done synchronously on page load/submit |
| **Realtime** (WebSocket/SSE) | Live notifications & chat | `storage` event across tabs of the same browser |

## 2. Data model (tables)

`users(id, role[candidate|hr|interviewer|academy|admin], name, email unique, password_hash, org_id, username, title, status[active|suspended|removed], status_reason, last_login_at, created_at)`
`candidate_profiles(user_id PK, username unique, bio, location, skills[], followers, privacy jsonb{profileVisibility, showScores, allowMessages}, notify_prefs jsonb, identity_status, email_verified, academy_id)`
`verified_history(id, username, title, skill, score, date)` — imported results that predate rubric breakdowns
`portfolio_items(id, username, title, type[task|external], is_public, preview_type, url, submission_id)`
`companies(id, name, logo_url, industry, size, website, location, about, verification[pending|verified|rejected], verified_at)`
`academies(id, …same shape…)`
`jobs(id, company_id, title, category, location, type, description, skills[], requirements[], task_id unique, referral_slots, deadline, status[draft|open|closed|flagged|removed], moderation jsonb)`
`tasks(id, company_id null=practice, job_id, title, brief, requirements[], rubric jsonb[{criterion, points, description}] CHECK sum=100, skills[], time_limit_min, deadline, difficulty, submission_types[], status[draft|published|paused|flagged|removed], created_by)`
`attempts(id, task_id, username, started_at, deadline_at, status[active|submitted|expired|withdrawn], focus_losses, application_id, submission_id)` — **the timer is server-side**: `deadline_at` is authoritative
`submissions(id, task_id, attempt_id, username, submitted_at, duration_min, status[pending|scored|disputed|void], note, is_public, output_url, files jsonb[{slot, name, size, type, sha256, storage_key}], focus_losses, integrity jsonb{flags[], cleared_at, cleared_by, clear_note}, score jsonb{total, breakdown[], feedback, suggestions[], reviewer_id, scored_at, adjusted_from}, void_reason)`
`applications(id, job_id, username, submission_id, status, referred_by academy_id, history jsonb[{status, at, by, note}])` — unique(job_id, username) where status≠withdrawn
`interviews(id, application_id, username, company_id, stage, scheduled_at, duration_min, mode, location, interviewer_id, status[proposed|confirmed|reschedule|completed|cancelled], notes, candidate_note, feedback, outcome, cancel_reason)`
`disputes(id, submission_id, username, reason, details, status[open|under_review|resolved|rejected], decision, resolution, original_score, resolved_by, resolved_at)`
`reports(id, type[job|user|message|account_deletion], target_id, reporter_id, reason, details, status, resolution)`
`contact_messages(id, name, email, topic, message, status)`
`verification_requests(id, kind[company|academy|identity], target_id, submitted_by, evidence, status, note, decided_at)`
`notifications(id, user_id, type, title, link, read, created_at)`
`conversations(id, participants[2], meta jsonb per user{pinned, muted, blocked, cleared_at}, read_at jsonb)`, `messages(id, conversation_id, from_user, text, at)`
`batches(id, academy_id, name, course, start_date, end_date, capacity)`
`students(id, academy_id, name, email, batch_id, username null, record_id STU-/CAND-, id_type, status[Active|Referred|Placed|Left Academy])`
`referrals(id, academy_id, student_id, job_id, status[referred|started|applied|placed|rejected], note)`
`placements(id, academy_id, student_id, username, company_id, external_company, job_id, role, placed_at, salary, visible, source[application|manual])`
`invites(id, company_id, email, role, code, status)`, `follows(user_id, username)`, `likes(user_id, target)`, `feed_events(...)`
`audit_log(id, actor_id, role, action, target, details, at)` — append-only

**Added in the credibility pass:**
- `tasks` + `kind[standard|screening|advanced], estimated_hours, ai_policy[allowed|disclose|not_allowed], confidential, source[manual|template|generated], template_id, human_reviewed_by`
- `jobs` + `accept_verified jsonb[{skill, min_score}]`
- `applications` + `route[task|verified_score], evidence jsonb, task_requested jsonb`
- `submissions` + `visibility[public|recruiters|private], ai_policy, ai_disclosure, review_log jsonb`; `score` + `authenticity[not_checked|verified|walkthrough|concern], authenticity_note`
- `portfolio_items.visibility[public|recruiters|private]` (replaces `is_public`)
- `candidate_profiles` + `experience[Entry|Mid|Senior]`, `privacy.leaderboard`
- `students` + `pending_username, consent[pending|accepted|declined], left_at, former_username`
- `disputes` + `kind[score|integrity]`, decision `reinstated`
- new: `feedback(id, user_id, role, context[review|hire|platform], target_id, rating 1-5, comment, at)`, `job_invites(id, job_id, username, by, note, at)`, `login_failures(email, count, locked_until)`
`settings(key, value)` — see `DEFAULT_SETTINGS` in `store.js`

## 3. Endpoints (mapped from `UR.*`)

| `UR` method | Endpoint | Roles |
|---|---|---|
| `auth.login / logout / register / changePassword` | `POST /api/auth/login`, `/logout`, `/register`, `/password` | public / any |
| — (missing) | `POST /api/auth/password-reset`, `POST /api/auth/verify-email` | public ⚠ |
| `candidates.get / list / leaderboard / stats` | `GET /api/candidates/:username`, `GET /api/candidates?q&skill`, `GET /api/leaderboard?skill` | public (privacy enforced server-side) |
| `candidates.updateProfile`, `.portfolio.*`, `.follow`, `.requestIdentityVerification` | `PATCH /api/me/profile`, `POST/PATCH/DELETE /api/me/portfolio/:id`, `POST /api/follows`, `POST /api/me/verification` | candidate |
| `jobs.list / get` | `GET /api/jobs?status&q&category`, `GET /api/jobs/:id` | public |
| `jobs.save / setStatus` | `POST/PATCH /api/jobs/:id`, `POST /api/jobs/:id/status` | hr |
| `tasks.list / get / save / setStatus` | `GET/POST/PATCH /api/tasks`, `POST /api/tasks/:id/status` | hr, interviewer, admin |
| `attempts.start / current / recordFocusLoss` | `POST /api/tasks/:id/attempts`, `GET /api/tasks/:id/attempts/me`, `POST /api/attempts/:id/focus-loss` | candidate |
| `submissions.submit` | `POST /api/attempts/:id/upload-url` (signed URL) → `POST /api/attempts/:id/submit` | candidate |
| `submissions.list / get / score` | `GET /api/submissions?…`, `POST /api/submissions/:id/score` | hr, interviewer (own company), admin |
| `submissions.clearIntegrity / void` | `POST /api/submissions/:id/integrity/clear`, `POST /api/submissions/:id/void` | reviewer / admin |
| `applications.list / move / withdraw` | `GET /api/applications`, `POST /api/applications/:id/move`, `POST /api/applications/:id/withdraw` | per role |
| `interviews.*` | `GET/POST /api/interviews`, `POST /api/interviews/:id/{respond,complete,cancel}`, `PATCH /api/interviews/:id` | hr, interviewer, candidate |
| `disputes.open / list / resolve` | `POST /api/submissions/:id/disputes`, `GET /api/disputes`, `POST /api/disputes/:id/resolve` | candidate / admin |
| `reports.*`, `contact.*`, `verifications.*` | `/api/reports`, `/api/contact`, `/api/verifications/:id/decide` | any / admin |
| `notifications.*` | `GET /api/notifications`, `POST /api/notifications/read` | any |
| `messages.*` | `GET/POST /api/conversations`, `POST /api/conversations/:id/messages`, `PATCH /api/conversations/:id/meta` + WebSocket | any |
| `academy.*` | `/api/academy/students` (+ `POST /bulk` CSV), `/batches`, `/referrals`, `/placements` | academy |
| `team.*` | `/api/company/team`, `/api/company/invites` | hr |
| `analytics.company / academy / platform` | `GET /api/analytics/{company,academy,platform}` | hr / academy / admin+public subset |
| `admin.*` | `/api/admin/users`, `/api/admin/jobs/:id/moderate`, `/api/admin/tasks/:id/moderate`, `/api/admin/settings`, `/api/admin/audit` | admin |
| `verifiedApply.eligibility / apply / requestTask` | `GET /api/jobs/:id/eligibility`, `POST /api/jobs/:id/apply-verified`, `POST /api/applications/:id/request-task` | candidate / hr |
| `attempts.retakeInfo`, `attempts.start({retake})` | `GET /api/tasks/:id/retake`, `POST /api/tasks/:id/attempts?retake=1` | candidate |
| `affiliation.requests / respond / leave` | `GET /api/me/affiliations`, `POST /api/me/affiliations/:id/{accept,decline}`, `DELETE /api/me/affiliation` | candidate |
| `library.templates / draft` | `GET /api/library/templates`, `POST /api/tasks/draft` (LLM; returns a draft, never publishes) | hr, interviewer, admin |
| `jobInvites.send` | `POST /api/jobs/:id/invites` | hr |
| `feedback.submit` | `POST /api/feedback` | any |
| `metrics()` | `GET /api/admin/metrics` | admin |
| `certificates.verify` | `GET /api/certificates/:id` | public |
| `exportMine` | `GET /api/me/export` | any |

## 4. Rules the server must enforce (already implemented in `store.js`)

- **Role checks** on every call (`requireUser([...])`); company/academy users only touch their own org's data.
- **Timer:** `deadline_at = min(started_at + time_limit, task.deadline)`; reject submits after it; a background job marks attempts `expired` and applications `expired`.
- **One attempt per job task**; practice tasks can be retried after expiry.
- **Rubric totals 100** to publish; **rubric is locked** once a task has submissions.
- **Jobs can only go live** with a published linked task and a verified company.
- **Scores are final for companies** once saved; only admins change them, via disputes (30-day window).
- **Verified score** = reviewer rubric total. Only the **best** verified score per task counts; each is weighted by task difficulty (`difficultyWeights`). **Skill / track score** = round(10 × weighted mean) over results tagged with that skill / track — tracks are never combined. Headline score = primary track (most verified tasks), always labelled. Ranked per track after max(`rankMinTasks`, `trackMinTasks`) tasks; skill views need 2. Disputed-but-unresolved scores keep counting. Certificates ≥ `certificateThreshold`. Skill badges need `badgeMinTasks` tasks averaging ≥ `badgeMinAvg`.
- **Effort caps** per task type (`maxEstimatedHours`, `maxTimeLimitMin`), fair-use confirmation, and human review for drafted tasks — all enforced at publish.
- **Verified-score applications** only when every `accept_verified` entry is met with `badgeMinTasks`+ tasks; the application starts as `scored`.
- **Retakes** only for standard assessments, after `retakeCooldownDays`, once the previous attempt is scored.
- **Academy links** need the candidate's consent; candidates can leave at any time and the academy loses access to new activity.
- **Portfolio visibility** enforced server-side: recruiter-only items are returned only to hr/interviewer/academy/admin viewers.
- **Never suspend or void automatically.** Automated flags and reviewer authenticity concerns create work for admins; appeals go to a different moderator.
- **Privacy:** profile visibility, hidden scores (never returned to other viewers, anonymised on leaderboards), message permissions, blocks.
- **Application state machine:** see `ALLOWED_MOVES` in `store.js`; interviewers may only shortlist/reject.
- **Hire → placement:** hiring an academy student creates a placement, marks them Placed and converts `STU-` → `CAND-`.
- **Audit log** every state change; **notifications** to the affected parties (see `notify(...)` calls).
- **Integrity:** compute SHA-256 server-side after upload (don't trust the client), compare against all submissions of the task, run code/image similarity asynchronously, escalate high-severity flags to admins.

---

# Backend build plan — Node.js + Express + PostgreSQL

**Decision:** keep the existing HTML pages and replace the browser data layer (`js/store.js`) with a real API. Each `UR.*` method becomes an HTTP call, so page code barely changes. Everything below is **to be built**; none of it exists yet. (Node.js is not installed on the current dev machine — install Node 20 LTS and PostgreSQL 15+ first.)

## A. Project layout

```
server/
  package.json            express, pg, zod, argon2, express-session + connect-pg-simple,
                          helmet, express-rate-limit, csurf (or double-submit token), multer, nodemailer, ws
  src/
    app.js                express app: helmet, JSON limits, sessions, CSRF, rate limits, routes, error handler
    db.js                 pg Pool, transaction helper
    auth/                 register, login, logout, verify-email, password reset, sessions, lockout
    middleware/           requireUser(roles), requireOrgMember, validate(zodSchema), audit()
    routes/               one router per module (jobs, tasks, attempts, submissions, applications,
                          interviews, disputes, reports, academy, team, messages, notifications, admin, public)
    services/             scoring.js (port of verifiedResults/computeStats/rankTable), integrity.js,
                          notify.js, email.js, storage.js, certificates.js, metrics.js
    jobs/                 scheduled workers: expire attempts, deadline reminders, job recommendations,
                          review-SLA alerts, integrity scans
  migrations/             numbered SQL files (001_init.sql …)
  seeds/                  demo seed (dev only — never run in production)
  tests/                  unit (scoring, permissions), API (supertest), end-to-end
js/api.js                 browser adapter: same method names as UR, implemented with fetch()
```

## B. Phases

| Phase | Work | Done when |
|---|---|---|
| B1 | Repo setup, env config (`.env`: DATABASE_URL, SESSION_SECRET, SMTP_*, STORAGE_*), health check, CI | `npm test` green in CI |
| B2 | Migrations for all tables (section C), indexes, constraints, seed script | Fresh DB builds from migrations |
| B3 | Auth: register, email verification, login, logout, password reset, sessions, lockout, roles | Auth tests pass; no secrets in localStorage |
| B4 | Core hiring API: jobs, tasks, attempts, submissions, applications, interviews | Candidate→company journey works end to end via API |
| B5 | Scoring & review: score, dual review, disputes, appeals, certificates, calibration | Score always traceable to assessment, reviewer, rubric, submission, date |
| B6 | Academy, team, messages (WebSocket), notifications, reports | Academy and chat journeys work |
| B7 | Admin, metrics, settings/pricing, audit export | Admin journey works; every sensitive action audit-logged |
| B8 | Frontend switch: load `js/api.js` instead of `js/store.js`; remove demo login panel in production builds | All pages pass the smoke test against the API |
| B9 | Files (object storage), email provider, scheduled jobs, backups, deployment | Staging environment live |
| B10 | Payments (only after the core is stable) | Provider-confirmed payments only |

## C. Database (PostgreSQL)

Normalised tables. All have `id` (uuid or bigserial), `created_at`, `updated_at`; soft delete (`deleted_at`) where noted.

| Table | Key columns / constraints |
|---|---|
| `users` | email **unique** (citext), password_hash (argon2id), email_verified_at, status, last_login_at, prev_login_at, deleted_at |
| `user_roles` | user_id FK, role enum(candidate, hr, interviewer, academy_admin, super_admin); unique(user_id, role) |
| `sessions` | managed by connect-pg-simple |
| `email_tokens` | user_id, purpose(verify / reset), token_hash, expires_at, used_at |
| `login_failures` | email, count, locked_until |
| `candidate_profiles` | user_id PK/FK, username **unique**, headline, bio, location, experience_level, photo_key, privacy jsonb, notify_prefs jsonb, featured bool, identity_status |
| `candidate_skills` | user_id, skill; unique pair |
| `work_history`, `education`, `certifications_self` | user_id FK, ordered rows (self-reported, never "verified") |
| `companies` | name, logo_key, website, industry, size, location, about, contact_email, verification enum, verified_at, plan_key |
| `company_members` | company_id, user_id, role(hr / interviewer); unique pair |
| `academies` | same shape as companies |
| `academy_students` | academy_id, user_id null, pending_user_id, email, record_id unique, id_type, status, consent enum, batch_id, left_at |
| `batches` | academy_id, name (unique per academy), course, dates, capacity |
| `skill_tracks` | key, label; `track_skills(track_key, skill)` |
| `jobs` | company_id FK, title, category, location, work_mode, experience_level, salary_min/max, responsibilities jsonb, requirements jsonb, skills text[], deadline, status enum(draft, open, paused, closed, flagged, removed), referral_slots, accept_verified jsonb, task_id unique |
| `saved_jobs` | user_id, job_id; unique pair |
| `tasks` | company_id null (=standard), job_id, kind, title, brief, requirements jsonb, skills text[], difficulty, estimated_hours, time_limit_min, deadline, ai_policy, confidential, max_attempts, track_focus, dual_review, source, template_id, human_reviewed_by, status |
| `task_rubrics` | task_id, position, criterion, points, description; CHECK sum(points)=100 at publish (enforced in the service); **locked** once a submission exists (trigger) |
| `task_reviewers` | task_id, user_id |
| `assessment_attempts` | task_id, user_id, started_at, **deadline_at (server-authoritative)**, status, draft jsonb, focus_losses |
| `extension_requests` | attempt_id, minutes, reason, status, decided_by, decided_at |
| `submissions` | attempt_id unique, task_id, user_id, submitted_at, duration_min, status, note, visibility, ai_policy, ai_disclosure, links jsonb, integrity jsonb |
| `submission_files` | submission_id, slot, storage_key, name, size, mime, sha256 (index on sha256 for duplicate checks) |
| `reviews` | submission_id, reviewer_id, total, strengths, weaknesses, recommendation, feedback, suggestions jsonb, authenticity, authenticity_note, created_at — **one row per reviewer** (dual review = 2 rows) |
| `review_scores` | review_id, criterion_id, awarded, comment |
| `verified_scores` | submission_id unique, task_id, user_id, total (final), difficulty, weight, reviewer_ids, rubric_snapshot jsonb, evaluated_at, status(valid / disputed / void), void_reason |
| `certificates` | public_id unique (UR-XXXXXXXX), verified_score_id FK, issued_at, expires_at, revoked_at |
| `applications` | job_id, user_id, route(task / verified_score), evidence jsonb, submission_id, status enum (applied, assessment_pending, submitted, under_review, scored, shortlisted, interview, offer, hired, rejected, withdrawn, expired), referred_by academy_id; unique(job_id, user_id) where status ≠ withdrawn |
| `application_events` | application_id, status, by_user, note, at |
| `interviews` | application_id, stage, scheduled_at, duration, mode, location, interviewer_id, status, feedback, outcome |
| `job_invites`, `referrals`, `placements` | as in section 2 |
| `disputes` | submission_id, kind(score / integrity), reason, details, status, decision, resolution, resolved_by |
| `reports`, `contact_messages`, `verification_requests` | as in section 2 |
| `conversations`, `conversation_members` (last_read_at, pinned, muted, blocked, cleared_at), `messages`, `message_attachments` | |
| `notifications` | user_id, type, title, link, read_at |
| `feedback` | user_id, context, target_id, rating, comment |
| `plans`, `subscriptions`, `payments` | plans editable by admin; subscriptions/payments only written from provider webhooks |
| `settings` | key/value jsonb (scoring thresholds, effort caps, freshness, SLA) |
| `audit_logs` | actor_id, role, action, target, details, ip, at — append-only (no UPDATE/DELETE grants) |

Indexes: every FK; `jobs(status, created_at)`, `applications(job_id, status)`, `submissions(task_id, status)`, `verified_scores(user_id)`, `notifications(user_id, read_at)`, `messages(conversation_id, created_at)`, `submission_files(sha256)`.

## D. Authentication & security

- argon2id password hashing; minimum 8 characters plus a breached-password check.
- Server sessions in Postgres, httpOnly + Secure + SameSite=Lax cookies; session rotation on login; sign out everywhere.
- Email verification required before applying or publishing; password reset via single-use, 30-minute hashed tokens; same response whether or not the email exists.
- Login lockout (5 failures → 15 min) plus IP rate limits on auth routes; optional TOTP 2FA for company and admin accounts.
- CSRF protection on all state-changing routes; helmet security headers; strict CSP (only the CDNs in use).
- Validate every request body with zod; parameterised SQL only.
- **Authorization on the server for every route** (role + org membership + ownership). Port each `requireUser([...])` and org check from `store.js`. Changing a URL or request must never expose another user's data.
- File uploads: type/size allow-list, virus scan, private bucket, short-lived signed URLs; working files readable only by the candidate and the owning company's reviewers.
- Audit-log every state change, with admin export. Backups: daily snapshots + point-in-time recovery, restore tested quarterly.
- Privacy: data export, account deletion (soft delete → purge after the retention period), consent records. Review obligations under India's DPDP Act 2023 with counsel; don't claim compliance without that review.

## E. Business rules to port (already implemented in `store.js`, now server-side)

Everything in section 4 above, plus this round:
- **Staged hiring (anti unpaid-work):** `jobs.invite_only_task` — when true, `POST /attempts` for that job's task returns 403 unless the candidate's application has `task_requested_at`, is in `in_progress`/`shortlisted`/`interview`/`offer`/`hired`, or a `job_invites` row exists. Saving a job with `invite_only_task = true` requires at least one `accept_verified` rule.
- **Workload cap:** reject starting a company task (kind `screening`/`advanced`) when the candidate already has `settings.max_active_company_tasks` (default 2) active attempts on company tasks. Standard assessments are exempt. `GET /me/workload` returns active tasks, hours in progress, hours started in the last 30 days and verified-score applications.
- **Qualify paths:** `GET /jobs/:id/eligibility` also returns published standard assessments that cover each unmet skill.
- Application status `under_review` set when a reviewer opens a submission.
- Jobs can be **paused** (hidden; existing applicants unaffected).
- `max_attempts` per task; standard-assessment retakes after the cooldown, best score counts.
- **Autosave** of attempt drafts (text fields; files go to storage as they are uploaded).
- **Extension requests**: up to `maxExtensionPct` of the window; the owning company (admin for standard tasks) decides; approval moves `deadline_at`.
- Tab tracking only when `track_focus` is on and disclosed; never treated as proof.
- **Dual review**: the first review is hidden from the second reviewer and the candidate; final = average; gap > `dualReviewGap` → admin integrity item.
- **Reviewer calibration** report: each reviewer's average and delta versus other reviewers on the same tasks.
- **Score freshness**: scores older than `freshnessMonths` weigh `staleWeight`.
- **Certificates**: valid / expired (`certificateValidityMonths`) / revoked (submission voided); verification exposes only name, assessment, score, issuer, reviewer, dates and rubric.
- Profile completion %, saved jobs, job filters (work mode, experience, salary), pagination (cursor-based on the server), homepage featured candidates (opt-in only).
- Pricing plans are data in `plans`, editable by admins; no limits enforced until billing exists.

## F. Additional endpoints (this round)

| Endpoint | Purpose |
|---|---|
| `PATCH /api/me/profile` | headline, location, experience, work history, education, certifications, featured |
| `GET /api/me/profile/completion` | completion % + missing items |
| `GET /api/jobs?work_mode&experience&min_salary&cursor` | filtered, paginated board |
| `PUT/DELETE /api/me/saved-jobs/:jobId` | save / unsave |
| `POST /api/jobs/:id/status` | `open / paused / closed` |
| `PUT /api/attempts/:id/draft` | autosave |
| `POST /api/attempts/:id/extensions`, `POST /api/extensions/:id/decide` | accommodations |
| `POST /api/submissions/:id/open` | marks under_review |
| `POST /api/submissions/:id/reviews` | first/second review (dual) or final score |
| `GET /api/admin/calibration` | reviewer calibration |
| `GET /api/certificates/:publicId` | public verification (rate-limited) |
| `GET/PUT /api/admin/plans` | pricing management |
| `GET /api/public/featured` | featured jobs and opted-in candidates |

## G. Real-time, email, scheduled jobs

- **WebSocket** (ws or Socket.IO) for new messages, read receipts and notifications; fall back to polling.
- **Email** through a provider (SES / Postmark): verification, reset, team invites, academy link requests, interview invites and changes, score results, deadline reminders. Respect notification preferences.
- **Scheduler** (node-cron or BullMQ workers): expire attempts at `deadline_at`; 24-hour deadline reminders; job recommendations; review-SLA overdue alerts; nightly integrity scans (code similarity with JPlag/MOSS, perceptual image hashes).

## H. Testing & deployment

- Unit tests for scoring (port the browser suites: workflow, framework, features — 95 checks today), permissions matrix tests (every route × every role), API tests with supertest, Playwright end-to-end for the candidate, company, academy and admin journeys, plus negative cases (invalid forms, duplicates, unauthorised access, expired sessions, oversized uploads, timeouts, invalid certificate IDs, concurrent submissions).
- Deploy: managed Postgres (e.g. Neon / RDS), Node host (Render / Railway / a VM behind Nginx), object storage, environment-based config, staging and production, HTTPS everywhere, monitoring and error tracking.