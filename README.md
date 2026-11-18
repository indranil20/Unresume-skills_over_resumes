# Unresume — Skills-First Hiring Platform

## Project purpose

Unresume is a skill-based hiring platform prototype designed to help employers evaluate what candidates can actually do, rather than relying only on resumes, degrees, or self-reported skills. Candidates demonstrate their abilities through practical tasks, receive reviewer-assessed scores, and build a portfolio of evidence. Companies use those submissions to find and hire suitable candidates, while academies can support students through referrals and placement tracking.

The project is a static frontend prototype. Its client-side data layer (`js/store.js`, exposed as `window.UR`) simulates platform operations and saves demo data in the current browser's `localStorage`. It has no production backend, and client-side authentication and checks are not secure.

## How the platform works

**Discover → Apply → Assessment → Verified score → Shortlist → Interview → Hired**

1. A company creates a job and links it to a practical task with requirements and a scoring rubric. It can also accept candidates' existing verified skill scores instead of a new task.
2. A candidate finds a job or a standard assessment, then either applies with existing verified scores (when the job allows it and they qualify) or works on the task and submits their work.
3. An interviewer reviews the submission against the rubric, records a score and feedback, and can recommend the candidate.
4. HR manages applications through the hiring pipeline, contacts candidates, and arranges interviews.
5. Academies can manage student cohorts, refer students to opportunities, and track placements.

## Features and functionality

### Candidates

- Browse and filter job openings, view job details, and apply through task-based assessments — or with existing verified scores when a job accepts them.
- See each task's type, estimated effort, time window, deadline and AI-use policy before starting.
- Start timed task attempts (the countdown survives page reloads), disclose any AI use, and submit supported work or output.
- Take reusable **standard assessments** once and reuse the verified score across jobs; retake after 30 days (best score counts).
- Track applications, task results, interviews, and notifications.
- Build a profile and portfolio from assessed tasks and external projects, with privacy controls.
- View verified scores, skill rankings, certificates, and public portfolio information.
- Communicate with hiring teams, follow other users, raise a score dispute, or appeal an integrity decision.
- Choose who sees each portfolio item (Public / Recruiters only / Only me), hide scores, opt out of leaderboards, and accept or leave academy affiliations.

### Companies and HR

- Create and manage job postings, practical tasks, and task rubrics — start from the template library or the draft assistant (drafts must be reviewed by a person before publishing).
- Choose the task type: screening (≤2h of effort) or company assessment (≤8h); effort caps prevent unpaid work.
- Accept existing verified scores per job (e.g. React ≥ 800), and request the role task from a verified-score applicant only when needed.
- Review applications and candidate submissions, compare candidates, and manage the hiring pipeline.
- Search candidate profiles and portfolios, and invite candidates to apply.
- Coordinate interviewer reviews, interviews, team access, and candidate communications.
- View company hiring and application analytics, including assessment→interview and interview→hire conversion, time to hire, and overdue reviews.

### Interviewers

- Access assigned review queues and candidate work.
- Score submissions against the task rubric, add feedback, record an authenticity check, and recommend candidates. Reviews have a 5-day target; overdue ones are flagged.
- Support task creation and participate in candidate comparisons and interviews.

### Academies

- Manage students and batches, including bulk student import. Linking a student's existing account requires the student's consent, and students can leave at any time.
- Refer students to job opportunities and track referral progress.
- Record placements and review academy reports.

### Platform administration and public pages

- Admin tools cover user management, content moderation, the integrity queue, disputes and appeals, verification requests, audit records, platform settings, and product success metrics computed from real platform activity.
- Public pages include job listings, candidate profiles, portfolios, leaderboards, certificate verification, and proposed pricing (`pricing.html` — marked "not active"; no payments are taken).

## Scores and verification

- A reviewer awards a **verified task score out of 100** using the task's published rubric. The rubric is locked once the task has submissions.
- Only the **best** verified score per task counts, weighted by difficulty (Beginner ×0.8, Intermediate ×1.0, Advanced ×1.25).
- **Track scores (0–1000)** = 10 × that weighted average, calculated separately for Frontend, Backend, Mobile, Data & ML, Design and Product. Tracks are never combined; a candidate's headline score is their primary track and is always labelled.
- Leaderboards rank within one track or skill only (filterable by experience). Candidates appear after 3 verified tasks in a track.
- Certificates (task score ≥ 70) can be checked on `verify.html`; skill badges need 2+ verified tasks in a skill averaging ≥ 75.
- Portfolio likes, followers, self-declared skills and external projects never count as verified scores.
- Candidates can dispute a score within 30 days or appeal an integrity decision; Unresume moderators decide, not the company. Automated integrity flags are always reviewed by a person — nobody is penalised automatically.

Full methodology: `leaderboard.html#how`. Thresholds are configurable in Admin → Platform Settings.

## Run the demo

No package installation or build step is required. From the project root, start a local static server:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>. A hosted copy is also available at <https://indranil20.github.io/Unresume-skills_over_resumes>.

Sign in using the **Demo accounts** list on the login page. All demo accounts use the password `demo1234`:

| Role | Email |
|---|---|
| Candidate | `jay@unresume.demo` (also `priya@`, `arjun@`, `sara@`, `rahul@`, `neha@unresume.demo`) |
| Company HR | `emily@techcorp.demo` |
| Company interviewer | `mark@techcorp.demo` |
| Academy | `team@nextgen.demo` |
| Admin | `admin@unresume.demo` |

To explore role-based workflows, use different demo accounts in separate tabs on the same origin. Changes are saved in that browser's `localStorage`; **Settings → Reset demo data** restores the sample dataset (it also resets automatically when the data format changes).

## Documentation

| File | Contents |
|---|---|
| [AUDIT.md](AUDIT.md) | First audit and the dashboards/workflows built |
| [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) | Credibility, effort, trust and fairness improvements, requirement by requirement |
| [BACKEND.md](BACKEND.md) | Services, database tables, API endpoints and server-side rules needed for production |

## Prototype limitations

- Data is stored locally in one browser and is not shared across devices or users.
- Authentication and permissions are simulated in client-side code; do not use real or sensitive data.
- Email delivery, persistent file storage, identity verification, and other production services are not fully integrated.
- Some integrity checks and workflows are simulated: plagiarism detection uses file fingerprints, text similarity and timing signals only, and the task draft assistant is rule-based (no AI service is connected).
- Payments are not integrated; pricing is a proposal.
- Some libraries and fonts load from CDNs, so an internet connection is needed.
- See [BACKEND.md](BACKEND.md) for backend requirements and [AUDIT.md](AUDIT.md) for audit notes.
