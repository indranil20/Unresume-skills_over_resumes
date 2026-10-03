# Unresume — Skill-Based Hiring Platform

Unresume is a frontend prototype for a skill-based hiring platform: candidates prove themselves through real tasks instead of resumes, companies hire based on task scores, and academies manage and refer their students to employers.

This is a **static, no-backend prototype** — pure HTML, CSS and vanilla JavaScript. There is no server, no database, and no real authentication. All "data" (jobs, candidates, tasks, conversations) lives in `js/data.js` as in-memory mock data, and any "saved" changes (new students, status updates, referrals, sign-ups) only persist for the current page session — a refresh resets them.

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
│   ├── components.js    # injects shared navbar/footer/sidebar into #navbar/#footer/#sidebar placeholders, role-based sidebar config, mobile drawer + popover toggle logic
│   └── data.js          # all mock data: getJobs(), getTasks(), getCandidates(), getConversations(), getFeed()
├── images/
│   ├── unresume-logo-dark.png  # main wordmark, used in navbar/sidebar/footer/auth pages
│   ├── unresume-logo.png
│   ├── logo.png
│   ├── founder-indranil.png    # About page founder photo
│   └── favicon.png             # browser tab icon, linked on every page
└── *.html                      # one file per page (see Pages below)
```

## Roles & Modules

The platform serves four roles, each with its own dashboard module (sidebar + topbar layout). The shared sidebar is rendered by `js/components.js` based on a `data-role` attribute:

```html
<div id="sidebar" data-role="candidate"></div>  <!-- or hr / interviewer / academy -->
```

| Role | Accent | Dashboard | Module pages |
|---|---|---|---|
| **Candidate** | Indigo (`#4f46e5`) | `candidate-dashboard.html` | Jobs, My Tasks, Portfolio, Messages, Feed, Leaderboard, Edit Profile |
| **HR / Company** | Blue (`#2563eb`) | `hr-dashboard.html` | Candidates (Browse), Messages, Post Job + Task |
| **Interviewer** | Purple (`#7c3aed`) | `interviewer-dashboard.html` | Create Task, Review Queue |
| **Academy** | Magenta (`#c026d3`) | `academy-dashboard.html` | Students (Manage Students), Jobs (in-module), Placements |

Each role's dashboard pages stay fully **inside their own module** — no role is redirected to a page styled for a different audience. For example, Academy has its own `academy-jobs.html` (list + inline detail + "Refer a Student" panel) instead of using the public `jobs.html`.

## Pages

### Public / marketing (shared navbar + footer, no login required)
- `index.html` — landing page
- `about.html` — company story, how it works, founder
- `contact.html` — contact form + contact details
- `jobs.html` — public job board (used by Candidates and HR)
- `job-detail.html` — single job listing + "Start Task & Apply"
- `leaderboard.html` — global candidate rankings (podium + table)
- `portfolio-gallery.html` — public showcase of candidate work
- `candidate-profile.html` — public/owner portfolio view (owner = no `?u=` param or `?u=jay-dev`)

### Auth
- `login.html` — role-aware sign in (Candidate / Company / Academy, with HR/Interviewer sub-role)
- `register.html` — role picker (Candidate / Company / Academy)
- `register-candidate.html`, `register-company.html`, `register-academy.html` — per-role sign-up
- `forgot-password.html` — email-based reset flow (cosmetic, no real email sent)

> **Note:** None of the forms above enforce real authentication. Fields are not required and submitting any of them redirects straight to the matching dashboard — this was intentionally simplified for demo/prototyping purposes.

### Candidate module
- `candidate-dashboard.html` — stats, job tasks, practice tasks, score ring, activity
- `task-workplace.html` — task brief, rubric, file submission workspace (full-screen, no sidebar)
- `edit-profile.html` — edit name/username/bio/skills
- `feed.html` — social feed of candidate activity
- `chat.html` — messaging inbox (full-screen, no sidebar)

### HR / Company module
- `hr-dashboard.html` — drag & drop hiring pipeline, job postings, shortlist
- `browse-candidates.html` — talent search/filter (HR-only; not reachable without login)
- `task-create.html` — task builder for job postings (shared with Interviewer)

### Interviewer module
- `interviewer-dashboard.html` — submissions queue, scoring panel

### Academy module
- `academy-dashboard.html` — student roster, company referral slots (with "Refer students" modal), top performers
- `manage-students.html` — add students, issue **Student ID**, status tracking, auto-conversion to **Candidate ID**
- `academy-jobs.html` — in-module job browser with inline "Refer a Student" action
- `placements.html` — per-company / per-student placement visibility toggles

## Key Feature Notes

- **Student ID → Candidate ID system** (`manage-students.html`): Academies add students and issue them a `STU-xxxx` Student ID, shown with a "⚡ Priority Referral" tag. When a student's status is set to **Placed** or **Left Academy**, their access automatically converts to an independent `CAND-xxxx` Candidate ID.
- **Topbar popovers**: every dashboard's notification bell and avatar open a dropdown (`toggleTopbarPopover()` in `components.js`). Renamed from an earlier `togglePopover` name because that collides with the browser's native Popover API (`HTMLElement.prototype.togglePopover`).
- **No real backend**: "Apply", "Refer Student", "Save Draft", "Send Message", etc. are all simulated with a short fake delay (`setTimeout`) and a UI confirmation — there is no network request.

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

- No backend, no persistence — all mock data resets on page reload.
- No real authentication/session — role access is enforced only by navigation (no link to a page = "no access"), not by any server-side check.
- Some pages reference fixed/demo identities (e.g. candidate "self" = `jay-dev`) rather than a real logged-in user.
