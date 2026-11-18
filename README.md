# Unresume — Skills-First Hiring Platform

## Project purpose

Unresume is a skill-based hiring platform prototype designed to help employers evaluate what candidates can actually do, rather than relying only on resumes, degrees, or self-reported skills. Candidates demonstrate their abilities through practical tasks, receive reviewer-assessed scores, and build a portfolio of evidence. Companies use those submissions to find and hire suitable candidates, while academies can support students through referrals and placement tracking.

The project is a static frontend prototype. Its client-side data layer (`js/store.js`, exposed as `window.UR`) simulates platform operations and saves demo data in the current browser's `localStorage`. It has no production backend, and client-side authentication and checks are not secure.

## How the platform works

1. A company creates a job and links it to a practical task with requirements and a scoring rubric.
2. A candidate finds a job or practice assessment, works on the task, and submits their work.
3. An interviewer reviews the submission against the rubric, records a score and feedback, and can recommend the candidate.
4. HR manages applications through the hiring pipeline, contacts candidates, and arranges interviews.
5. Academies can manage student cohorts, refer students to opportunities, and track placements.

## Features and functionality

### Candidates

- Browse and filter job openings, view job details, and apply through task-based assessments.
- Start timed task attempts and submit supported work or output.
- Track applications, task results, interviews, and notifications.
- Build a profile and portfolio from assessed tasks and external projects, with privacy controls.
- View verified scores, skill rankings, certificates, and public portfolio information.
- Communicate with hiring teams, follow other users, and raise a score dispute.

### Companies and HR

- Create and manage job postings, practical tasks, and task rubrics.
- Review applications and candidate submissions, compare candidates, and manage the hiring pipeline.
- Search candidate profiles and portfolios, and invite candidates to apply.
- Coordinate interviewer reviews, interviews, team access, and candidate communications.
- View company hiring and application analytics.

### Interviewers

- Access assigned review queues and candidate work.
- Score submissions against the task rubric, add feedback, and recommend candidates.
- Support task creation and participate in candidate comparisons and interviews.

### Academies

- Manage students and batches, including bulk student import.
- Refer students to job opportunities and track referral progress.
- Record placements and review academy reports.

### Platform administration and public pages

- Admin tools cover user management, content moderation, disputes, verification requests, audit records, and platform settings.
- Public pages include job listings, candidate profiles, portfolios, leaderboards, and certificate verification.

## Scores and verification

- A reviewer awards a **verified task score out of 100** using the task's published rubric.
- Scores from verified tasks contribute to skill and track scores and rankings; practice or portfolio likes do not act as reviewer scores.
- Certificates, badges, and ranking eligibility depend on platform criteria and settings.
- Candidates can dispute a score within the configured dispute window; an administrator reviews the dispute.

## Run the demo

No package installation or build step is required. From the project root, start a local static server:

Open [https://indranil20.github.io/Unresume-skills_over_resumes], then sign in using the **Demo accounts** list on the login page. All demo accounts use the password `demo1234`. To explore role-based workflows, use different demo accounts in separate tabs on the same origin. Changes are saved in that browser's `localStorage`; **Settings → Reset demo data** restores the sample dataset.

## Technology

- Standalone HTML pages, custom CSS, and vanilla JavaScript; no framework or bundler.
- Shared scripts provide the sample data, client-side store, reusable UI helpers, and common page components.
- Some third-party assets and libraries load from CDNs and require an internet connection.

## Prototype limitations

- Data is stored locally in one browser and is not shared across devices or users.
- Authentication and permissions are simulated in client-side code; do not use real or sensitive data.
- Email delivery, persistent file storage, identity verification, and other production services are not fully integrated.
- Some integrity checks and workflows are simulated. See [BACKEND.md](BACKEND.md) for backend requirements and [AUDIT.md](AUDIT.md) for audit notes.
