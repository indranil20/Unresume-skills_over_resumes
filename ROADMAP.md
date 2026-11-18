# Master-prompt gap audit & roadmap

The master prompt was checked against what already exists (see `AUDIT.md` and `IMPROVEMENT-PLAN.md`). **Already-built work is not repeated here.** This file lists only what is new or still incomplete.

## Progress update
**Decision taken:** Node.js + Express + PostgreSQL, keeping the current pages. The full backend build plan is in `BACKEND.md` → "Backend build plan" (layout, phases B1–B10, schema, security, endpoints, jobs, testing, deployment). Not built yet.

**Frontend items from phases 5–9: done ✅**
- Profile completion %
- Headline, location, experience, education and self-reported certifications; About tab; share link
- Personal projects as a separate portfolio category
- Jobs: salary, work mode, experience level, responsibilities, filters, saved jobs, pagination
- "Under review" status and paused jobs
- Assigned reviewers
- Autosave and submission preview; GitHub/Figma links
- Max attempts; extra-time requests; tab tracking made opt-in and disclosed
- Review strengths, weaknesses and recommendation; dual review (blind, averaged, disagreements escalated)
- Reviewer calibration
- Score freshness
- Certificate valid / expired / revoked status with full traceability
- Leaderboard search and pagination
- Chat read receipts
- Deadline reminders and job recommendations (client-side stand-in for a scheduled job)
- How It Works page; homepage featured jobs, opt-in featured candidates, academy section, FAQ
- Admin pricing management

**Still open:** everything in Phases 3–4 (backend), chat file sharing (needs storage), moving the test suites into the repo, a full WCAG and performance pass.

## Already done (no rework needed)
Role dashboards for candidate, HR, interviewer, academy and admin · jobs + job detail · task workspace with countdown, start warning and confirmation · rubric review with per-criterion scores, feedback, suggestions, authenticity, locked rubric, review log · verified-score system (task / skill / track, difficulty weighting, best attempt, eligibility, disputes, appeals, moderation) · reusable standard assessments and verified-score applications · track/skill leaderboards with experience filter, methodology and opt-out · three-level portfolio visibility + confidential tasks · academy consent, leave, batches, bulk import, referrals, placements, reports · chat with block/report and privacy rules · notifications · certificate verification page · admin users / verification / moderation / disputes / audit / settings / metrics · proposed pricing · privacy & terms · no fabricated statistics · demo-safe honest states.

## The one big gap: a real backend
The master prompt requires server-side authorization, real password hashing, sessions, email verification, password reset, authoritative timers, secure file storage, a database and backend certificate verification. **None of that can be done in the browser** — today `js/store.js` simulates it with localStorage. This is the foundation for most remaining items, and it's a stack and hosting decision for the owner (see "Decision needed").

## New items, by phase

### Phase 3–4 · Backend, database, authentication (needs backend)
- API server + PostgreSQL with migrations and seed scripts (schema in `BACKEND.md`, extended with the entities in master-prompt §20: `UserRoles`, `CompanyMembers`, `AcademyStudents`, `TaskRubrics`, `Reviews`, `VerifiedScores`, `Certificates`, `Subscriptions`, `Payments`)
- Server-side sessions (httpOnly cookies), argon2/bcrypt hashing, CSRF protection, rate limiting, input validation
- Email verification, password reset with expiring tokens, transactional email
- Server-authoritative assessment deadlines; signed-URL file uploads with type/size/virus checks
- Certificate verification against the database, with **valid / revoked / expired** status
- Swap each `UR.*` method for an API call (pages don't change)

### Phase 5 · Candidate & company (frontend + data model)
- Candidate profile: photo, headline, **experience, education, certifications** sections, public profile URL/share, **profile completion %** on the dashboard
- Portfolio: description, thumbnail and **separate "Personal projects"** category (besides verified and external)
- Jobs: **salary range, responsibilities, work mode (remote/hybrid/on-site), experience requirement**; **saved jobs**; filters for those fields; **pagination**
- ATS: add **"Under review"** status (when a reviewer opens a submission) and **pause job**
- Company: contact info on the profile; assign a specific interviewer to a job/task

### Phase 6 · Assessments
- **Autosave / save progress** (notes and links saved before submit)
- **Submission preview** before final confirm
- Dedicated **GitHub / Figma link** fields
- Task setting for **maximum attempts**
- **Accommodations**: candidate can request a time extension; company or admin approves
- Make tab-switch tracking **opt-in per task and disclosed** (master prompt §9 cautions against invasive monitoring)

### Phase 7 · Reviews & scoring
- Review form: **strengths, weaknesses, recommendation** fields
- **Dual review** option for important assessments (second reviewer; large differences escalate)
- **Reviewer calibration**: per-reviewer average versus task average, shown to admins
- **Score freshness**: scores older than N months are marked "older" and weighted lower (configurable)
- Traceability panel on certificates and verify page: assessment ID, company, reviewer, rubric, evaluation date

### Phase 8 · Leaderboard, chat, notifications
- Leaderboard **search + pagination**
- Chat **read receipts** and **file sharing** (sharing needs storage)
- Notifications: **assessment deadline reminders** and **job recommendations** (scheduled job → backend)

### Phase 9 · Public site & admin
- **How It Works** page; homepage **featured jobs, featured candidates (with their consent), FAQ, academy section** — all from real data, no fake testimonials
- Admin **pricing management** (edit the proposed plans from settings)

### Phase 10 · Quality
- Move the browser test suites into the repo (`tests/`) with a one-command runner; add API, permission and end-to-end tests once the backend exists
- WCAG 2.1 AA pass (keyboard, focus, contrast) and performance pass (lazy images, caching)
- Deployment docs, environment config, backups

## Order of work
Phases 5–7 (frontend items) can be built now on the current data layer, without blocking on the backend. Phases 3–4 are the production foundation and should start as soon as the stack is chosen. Payments stay last, as the master prompt says.

## Decision needed
Choose the backend approach before Phase 3:
1. **Node.js + Express + PostgreSQL**, keeping the current HTML pages (recommended: least rework, matches `BACKEND.md`)
2. Next.js + TypeScript full rewrite (bigger effort; the pages would need to be rebuilt as components)
3. Managed backend (e.g. Supabase: Postgres + auth + storage) — fastest to production, adds vendor dependency
