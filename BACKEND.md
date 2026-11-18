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
