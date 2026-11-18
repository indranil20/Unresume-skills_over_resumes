# Unresume — Skill-Based Hiring Platform

Unresume is a frontend prototype for a skill-based hiring platform: candidates prove themselves through real tasks instead of resumes, companies hire based on task scores, and academies manage and refer their students to employers.

This is a **static frontend with a client-side data layer**. `js/store.js` (`window.UR`) behaves like the backend API — it enforces every business rule (roles, timers, scoring, state machines, privacy, integrity checks) and persists to the browser's `localStorage`. Every workflow really completes and is visible to the other roles **in the same browser**, but nothing is shared between devices and nothing is secure. `BACKEND.md` lists the exact API, tables and services needed to replace it; `AUDIT.md` lists what was found and changed.

**Try it:** open `login.html`, expand *Demo accounts* (password `demo1234`), and sign in as the candidate, a TechCorp HR/interviewer, the NextGen academy or the admin. Open two browser tabs as different roles to watch changes propagate. *Settings → Reset demo data* restores the sample data.
## Tech Stack

- **HTML** — one standalone file per page (no build step, no bundler)
- **CSS** — custom CSS with CSS variables for the design system (no Tailwind/Bootstrap)
- **JavaScript** — vanilla JS only, no framework
- **GSAP 3.12.5** (CDN) — animations on marketing pages (`index.html`, `leaderboard.html`, `portfolio-gallery.html`, `browse-candidates.html`)
- **Sortable.js 1.15.2** (CDN) — drag & drop for the HR hiring pipeline
- **Google Fonts** — Plus Jakarta Sans (display/headings), Inter (body text), JetBrains Mono (scores/code), Caveat (handwritten notes)
- **Material Symbols Rounded** (CDN) — icon set used throughout

No `npm install` or build step is required. Open any `.html` file directly in a browser, or serve the project folder with any static file server.

## Folder Structure

```
Unresume - skills over resumes/
├── css/
│   ├── globals.css      # design tokens, reset, dashboard shell layout, shared components (buttons, cards, forms, toggles, rubric bars)
│   ├── navbar.css       # public navbar/footer, dashboard sidebar (+ mobile drawer), topbar notification/avatar popovers
│   ├── dashboard.css    # shared skins for all dashboard pages (banners, stats, panels, modals, toasts, empty states)
│   ├── auth.css         # login / register / forgot-password layout
│   └── home.css         # landing-page-only styles (hero, features, role cards, CTA)
├── js/
│   ├── data.js          # seed catalogue (jobs, tasks, candidates, companies) the store is built from
│   ├── store.js         # data layer / API stand-in (window.UR) — persistence, rules, notifications, audit log
│   ├── ui.js            # shared UI helpers (window.UI) — toasts, modals, states, CSV, charts
│   └── components.js    # navbar/footer/sidebar/topbar, role guard (data-roles), live notifications & stats
├── images/
│   ├── unresume-logo-dark.png  # main wordmark, used in navbar/sidebar/footer/auth pages
│   ├── unresume-logo.png
│   ├── logo.png
│   ├── founder-indranil.png    # About page founder photo
│   └── favicon.png             # browser tab icon, linked on every page
└── *.html                      # one file per page (see Pages below)
```

## Roles & Modules

Pages declare who may open them: `<div id="sidebar" data-roles="hr,interviewer">` (or `<body data-roles="any">`). `components.js` redirects anonymous visitors to sign-in and other roles to their own dashboard, and renders the sidebar for the signed-in user's role. Script order on every page: `data.js → store.js → ui.js → components.js`.

| Role | Pages |
|---|---|
| **Candidate** | `candidate-dashboard`, `jobs`, `job-detail`, `task-workplace`, `my-applications`, `assessments`, `candidate-interviews`, `certificates`, `candidate-profile`, `edit-profile`, `feed`, `leaderboard`, `chat`, `settings`, `notifications` |
| **HR** | `hr-dashboard` (pipeline), `hr-jobs`, `company-tasks`, `task-create`, `hr-applications`, `interviewer-dashboard` (review queue), `compare`, `hr-interviews`, `browse-candidates`, `hr-analytics`, `team`, `company-profile` |
| **Interviewer** | review queue, tasks, task builder, compare, interviews |
| **Academy** | `academy-dashboard`, `manage-students` (bulk CSV), `batches`, `academy-jobs` (referrals), `placements`, `academy-reports` |
| **Admin** | `admin-dashboard`, `admin-users`, `admin-moderation`, `admin-disputes`, `admin-audit`, `admin-settings` |
| **Public** | `index`, `about`, `contact`, `jobs`, `job-detail`, `leaderboard`, `portfolio-gallery`, `candidate-profile?u=`, `verify`, `privacy`, `terms`, auth pages |

## How scores work
- **Verified task score (0–100):** a company reviewer scores the submission against the task's published rubric (always 100 points).
- **Skill Score (0–1000):** 10 × the mean of a candidate's verified task scores. Ranked after 3 verified tasks (configurable).
- **Certificates** for task scores ≥ 70; **skill badges** for 2+ tasks in a skill averaging ≥ 75. Portfolio likes and external projects never affect scores.
- Candidates can dispute a score within 30 days; Unresume admins decide.
## Responsive Design

Every page works on desktop, tablet and phone. Breakpoints are written as `@media (max-width: …)` rules, either in the shared CSS files or in each page's own `<style>` block.

| Width | Dashboard pages | Public pages |
|---|---|---|
| > 980px | Full sidebar (256px) + content | Full navbar with links |
| ≤ 980px | — | Navbar collapses to a hamburger menu |
| ≤ 900px | Sidebar becomes a 76px icon rail | — |
| ≤ 720px | Sidebar becomes an off-canvas **drawer**, opened from a ☰ button in the topbar | — |
| ≤ 640px | Single-column content, compact topbar, popovers pinned to the viewport | Single-column grids, tighter padding |

How the shared pieces adapt:

- **Sidebar drawer** — `renderSidebar()` in `components.js` automatically inserts the ☰ button (`.dash-menu-btn`) into the page's `.dash-topbar` and adds a backdrop. The drawer closes when you tap the backdrop, press Esc or pick a link. Dashboard pages don't need any extra HTML for this.
- **Chat** (`chat.html`) — at ≤ 700px it shows one pane at a time: the conversation list first, then the open chat with a ← back button.
- **Tables** — `manage-students.html` turns rows into cards on small screens, so the status dropdown stays usable. `academy-dashboard.html` and `leaderboard.html` hide secondary columns.
- **Filter pills / job lists** — on phones these scroll sideways instead of wrapping (for example the job list on `academy-jobs.html`).
- **Forms** — inputs use 16px text on phones, so iOS doesn't zoom in when you tap a field.
- **Viewport height** — full-height layouts use `100dvh` (falling back to `100vh`), so they aren't cut off by the mobile browser's address bar.

To test, open Chrome DevTools (F12) → device toolbar (Ctrl+Shift+M) and try different phone and tablet sizes.

## Design System

A light theme, defined as CSS variables in `css/globals.css`:

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#f7f7fd` | page background |
| `--bg-card` | `#ffffff` | cards |
| `--bg-elevated` | `#f1f0fb` | raised/inset surfaces, inputs |
| `--brand` | `#4f46e5` | primary accent |
| `--purple` | `#7c3aed` | gradient partner for `--brand` |
| `--cyan` / `--pink` / `--teal` | `#0ea5e9` / `#d946ef` / `#14b8a6` | secondary accents |
| `--text1` → `--text4` | `#0e1230` → `#9296b0` | text hierarchy, dark → dim |
| `--border` / `--border-light` | `#e9e8f4` / `#d9d7ee` | card/divider borders |

- Primary buttons and active states use a `#4f46e5 → #7c3aed` gradient.
- Icon chips use the `.tint-blue / .tint-purple / .tint-pink / .tint-teal / .tint-amber` classes (a soft background with a matching icon color).
- Cards are solid white with a 1px `--border` and a soft shadow (`--shadow-sm` / `--shadow-md`).
- GSAP: the landing page hero uses `gsap.set()` + `gsap.to()`, so the text stays visible if the CDN is slow. Some lists and cards (`browse-candidates`, `leaderboard`, `portfolio-gallery`, the hero visual and stats) use `gsap.from()` with `clearProps`.

## Known Limitations

See `BACKEND.md`. In short: data lives in one browser's localStorage; passwords are hashed client-side (not secure); no emails are sent; uploaded file contents are not stored (only name, size, SHA-256); identity verification is a manual admin review; plagiarism detection is heuristic.