# Platform audit & change log

## Audit findings (before)

**Architecture:** 28 static pages, vanilla JS, mock data in `js/data.js` reset on every reload. No sessions, no roles, no admin.

**Fake success / non-functional**
- Task submit, task publish, "Save Draft", edit profile, contact form, forgot password ("Check your email"), chat "Report", academy refer: all showed success after a `setTimeout` without storing anything.
- "Account Settings" → `alert('coming soon')`; pipeline "+ Add candidate" → `alert()`; interviewer "Open file" → `alert()`.
- Footer Privacy/Terms and social icons, founder LinkedIn → `href="#"`.
- Topbar search boxes did nothing; notifications were hard-coded HTML.

**Assessment flow**
- Timer counted *up* from 00:00, ignored the task's time limit, auto-started on file upload and reset on refresh.
- Submitting twice was possible; there was no deadline enforcement or "already submitted" state.

**Inconsistent statistics**
- Candidate dashboard "Rank #24" vs data rank #1; activity said "scored 88" while notifications said 91.
- Academy: "240 students" (6 existed), "79% placement rate" (19/48 = 40%).
- Marketing: 12,000+ candidates / 500+ companies / 89% placement — not derived from anything; HR applicant counts were `Math.random()`, as were feed likes/comments.

**Job/task gaps:** jobs page claimed "every listing includes a task" while 2 jobs had none; Flutter job reused the React task. No deadlines; time limits were free text.

**Identity:** candidate hard-coded as Jay everywhere (chat always "Jay" even for HR); no role-based access; any URL opened any dashboard.

**Scores:** no explanation of the 0–1000 score; verified task scores and portfolio items looked identical; no breakdown, feedback or disputes visible to candidates.

## What changed

### Foundation
- `js/store.js` — data layer shaped like an API (`window.UR`), persisted to localStorage, transactional (rolls back on failed save so the UI never shows false success), audit-logged, with notifications. See `BACKEND.md`.
- `js/ui.js` — shared toasts, modals, confirm dialogs, form fields, empty/loading/error states, CSV import/export, accessible charts.
- `js/components.js` — session-aware navbar/sidebar/topbar, **role guard** (`data-roles`), live notification popover with unread counts, sidebar badges, platform announcement banner, live stats (`data-stat`).
- `js/data.js` — seed catalogue corrected: every job has its own task; time limits in minutes; rubric descriptions; companies.

### Candidate
- Dashboard rebuilt on live data: attention items, application progress, **skill progression chart**, per-skill scores, performance, recommendations by skill match.
- New: **My Applications** (timeline, withdraw, message HR), **Assessments** (history, rubric breakdown, reviewer feedback, improvement suggestions, integrity status, **disputes**), **Interviews** (confirm / request reschedule / .ics), **Certificates & badges** (printable, public **verify.html**), **Settings** (privacy, notifications, identity verification, password, data export, deletion request).
- Task workplace: explicit **Start** gate, **server-style countdown** from a saved deadline (survives reloads), 5-minute warning, expiry handling, file size/empty checks, live-URL output, confirm-before-submit, success shown **only after the save succeeds**, "already submitted" state, tab-switch integrity signal.
- Profile/portfolio persisted: visibility toggles, add/delete external work, follow, message, report; **verified score vs community likes** clearly distinguished.

### Company
- HR dashboard: real pipeline (drag-and-drop enforces valid transitions, notifies candidate), live stats, review & interview side panels, verification banner.
- New: **Job postings** (create/edit, publish rules), **Tasks** list, **Applications** (filters, sort, drawer, CSV, select-to-compare), **Compare**, **Interviews** (schedule/assign/reschedule/cancel/feedback), **Team** (invite codes, roles, remove), **Analytics** (funnel, score distribution, time-to-review/hire, CSV), **Company profile** + verification.
- Review queue: rubric scoring with per-criterion comments, overall feedback, suggestions, integrity flags, shortlist/reject.
- Task builder saves drafts/publishes with validation, deadline, skills, difficulty; rubric locked after first submission.

### Academy
- Dashboard: computed stats (placement rate shows its base), progress table, referral slots from real jobs, outcomes chart.
- Students: **bulk CSV onboarding** with row-level errors, batches, status → Student/Candidate ID conversion, placement capture, export.
- New: **Batches & courses**, **Reports** (batch comparison, skill coverage, CSV, print), **Referrals & placements** (tracking + visibility).

### Admin (new role)
Overview & analytics, **users & organisations** (verification queue, suspend/reactivate), **moderation** (jobs, tasks, submissions, **integrity/plagiarism** queue with match navigation, void scores), **disputes & reports** (decide disputes, user reports, contact inbox), **audit log** (filter, CSV), **platform settings** (scoring thresholds, integrity thresholds, verification policy, announcement).

### Common
Notifications page; role-aware **chat** for all roles with privacy rules, blocking and real reports; real login with demo accounts; registration with validation and invite codes; honest forgot-password; contact form stored to the admin inbox; **Privacy Policy** and **Terms** pages; leaderboard "How scores are calculated"; consistent live statistics everywhere.

## Verified
- Store workflow test (32 assertions): apply → submit → duplicate-file detection → score → shortlist → interview → offer → hire → placement; disputes; verification; privacy; academy bulk import and referrals; persistence.
- Headless-browser smoke test: 63 page loads across public/candidate/company/academy/admin with **0 JavaScript errors**; access guard redirects wrong roles and anonymous users.

## Known limitations (need the backend — see BACKEND.md)
Data is per-browser; no real security; emails aren't sent; uploaded file contents aren't stored; identity checks are manual; plagiarism detection is heuristic (exact hashes, text shingles, timing) rather than code/image similarity.
