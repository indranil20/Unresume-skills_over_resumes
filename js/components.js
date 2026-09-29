/* Shared Navbar + Footer + Sidebar — injected on every page */

// ── Helpers ──────────────────────────────────────────────
function currentPage() { return location.pathname.split('/').pop() || 'index.html'; }
function isActive(href) { return currentPage() === href ? 'nav-active' : ''; }

// ── Navbar (public pages) ─────────────────────────────────
function renderNavbar() {
  const el = document.getElementById('navbar');
  if (!el) return;
  el.innerHTML = `
  <nav class="navbar">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo">
        <img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img">
      </a>

      <div class="nav-links" id="navLinks">
        <a href="jobs.html" class="nav-link ${isActive('jobs.html')}">Jobs</a>
        <a href="leaderboard.html" class="nav-link ${isActive('leaderboard.html')}">Leaderboard</a>
        <a href="portfolio-gallery.html" class="nav-link ${isActive('portfolio-gallery.html')}">Portfolio</a>
        <a href="about.html" class="nav-link ${isActive('about.html')}">About</a>
        <a href="contact.html" class="nav-link ${isActive('contact.html')}">Contact</a>
      </div>

      <div class="nav-actions" id="navActions">
        <a href="login.html" class="btn-ghost" style="padding:10px 18px;font-size:13.5px;">Sign In</a>
        <a href="register.html" class="btn-primary" style="padding:10px 20px;font-size:13.5px;">Get Started</a>
      </div>

      <button class="nav-hamburger" id="navToggle" onclick="toggleMobileNav()">
        <span class="material-symbols-rounded" id="hamburgerIcon">menu</span>
      </button>
    </div>

    <div class="nav-mobile" id="navMobile">
      <a href="jobs.html" class="nav-mobile-link">Jobs</a>
      <a href="leaderboard.html" class="nav-mobile-link">Leaderboard</a>
      <a href="portfolio-gallery.html" class="nav-mobile-link">Portfolio Gallery</a>
      <a href="about.html" class="nav-mobile-link">About</a>
      <a href="contact.html" class="nav-mobile-link">Contact</a>
      <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px;border-top:1px solid var(--border);">
        <a href="login.html" class="btn-ghost" style="justify-content:center;">Sign In</a>
        <a href="register.html" class="btn-primary" style="justify-content:center;">Get Started</a>
      </div>
    </div>
  </nav>`;
}

function toggleMobileNav() {
  const mob = document.getElementById('navMobile');
  const icon = document.getElementById('hamburgerIcon');
  mob.classList.toggle('open');
  icon.textContent = mob.classList.contains('open') ? 'close' : 'menu';
}

// ── Footer (public pages) ─────────────────────────────────
function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-top">
        <div>
          <a href="index.html" class="footer-logo" style="margin-bottom:14px">
            <img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img-sm" style="height:40px">
          </a>
          <p class="footer-tagline">Skills over resumes — the future of skill-based hiring.</p>
        </div>
        <div class="footer-links-grid">
          <div class="footer-col">
            <div class="footer-col-title">Platform</div>
            <a href="jobs.html" class="footer-link">Browse Jobs</a>
            <a href="leaderboard.html" class="footer-link">Leaderboard</a>
            <a href="portfolio-gallery.html" class="footer-link">Portfolio</a>
          </div>
          <div class="footer-col">
            <div class="footer-col-title">Join</div>
            <a href="register.html" class="footer-link">As Candidate</a>
            <a href="register-company.html" class="footer-link">As Company</a>
            <a href="register-academy.html" class="footer-link">As Academy</a>
          </div>
          <div class="footer-col">
            <div class="footer-col-title">Company</div>
            <a href="about.html" class="footer-link">About</a>
            <a href="contact.html" class="footer-link">Contact</a>
          </div>
        </div>
        <div class="footer-social">
          <a href="#" aria-label="LinkedIn"><svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3v-11zm6.5 0h3.8v1.5h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1v5.45h-4v-4.83c0-1.15-.02-2.64-1.6-2.64-1.61 0-1.86 1.26-1.86 2.56v4.91h-4v-11z"/></svg></a>
          <a href="#" aria-label="Twitter"><svg viewBox="0 0 24 24"><path d="M22 5.9a8.2 8.2 0 0 1-2.36.65 4.1 4.1 0 0 0 1.8-2.27 8.2 8.2 0 0 1-2.6 1 4.1 4.1 0 0 0-7 3.74A11.65 11.65 0 0 1 3.4 4.74a4.1 4.1 0 0 0 1.27 5.48 4.1 4.1 0 0 1-1.86-.51v.05a4.1 4.1 0 0 0 3.3 4.02 4.1 4.1 0 0 1-1.86.07 4.1 4.1 0 0 0 3.83 2.85A8.23 8.23 0 0 1 2 18.4a11.6 11.6 0 0 0 6.29 1.84c7.55 0 11.67-6.25 11.67-11.67l-.01-.53A8.3 8.3 0 0 0 22 5.9z"/></svg></a>
          <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.58 0 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85C2.42 3.92 3.93 2.38 7.15 2.27 8.42 2.2 8.8 2.2 12 2.2zm0 4.86a4.94 4.94 0 1 0 0 9.88 4.94 4.94 0 0 0 0-9.88zm0 8.15a3.21 3.21 0 1 1 0-6.42 3.21 3.21 0 0 1 0 6.42zm5.14-9.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"/></svg></a>
          <a href="#" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/></svg></a>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="footer-copy">© 2025 Unresume. All rights reserved.</span>
        <div class="footer-legal">
          <a href="#" class="footer-link">Privacy</a>
          <a href="#" class="footer-link">Terms</a>
        </div>
      </div>
    </div>
  </footer>`;
}

// ── Sidebar (dashboard pages) ─────────────────────────────
const sidebarConfig = {
  candidate: {
    name: 'Jay Desai', initials: 'JD',
    gradient: 'linear-gradient(135deg,#38bdf8,#2563eb)',
    badge: 'Candidate',
    accent: '#4f46e5',
    accentBg: '#eeedfd',
    nav: [
      { icon:'dashboard',  label:'Dashboard',  href:'candidate-dashboard.html' },
      { icon:'work',       label:'Jobs',       href:'jobs.html' },
      { icon:'task_alt',   label:'My Tasks',   href:'task-workplace.html' },
      { icon:'photo_library', label:'Portfolio', href:'candidate-profile.html' },
      { icon:'chat',       label:'Messages',   href:'chat.html' },
      { icon:'dynamic_feed', label:'Feed',     href:'feed.html' },
      { icon:'leaderboard', label:'Leaderboard', href:'leaderboard.html' },
    ],
  },
  hr: {
    name: 'Emily Ross', initials: 'ER',
    gradient: 'linear-gradient(135deg,#38bdf8,#2563eb)',
    badge: 'HR',
    accent: '#2563eb',
    accentBg: '#eaf1ff',
    nav: [
      { icon:'dashboard',   label:'Dashboard',   href:'hr-dashboard.html' },
      { icon:'group',       label:'Candidates',  href:'browse-candidates.html' },
      { icon:'chat',        label:'Messages',    href:'chat.html' },
    ],
  },
  interviewer: {
    name: 'Mark Wilson', initials: 'MW',
    gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',
    badge: 'Interviewer',
    accent: '#7c3aed',
    accentBg: '#f1ecfe',
    nav: [
      { icon:'dashboard',  label:'Dashboard',    href:'interviewer-dashboard.html' },
      { icon:'add_task',   label:'Create Task',  href:'task-create.html' },
      { icon:'rate_review', label:'Review Queue', href:'interviewer-dashboard.html' },
    ],
  },
  academy: {
    name: 'NextGen Academy', initials: 'NA',
    gradient: 'linear-gradient(135deg,#e879f9,#a855f7)',
    badge: 'Academy',
    accent: '#c026d3',
    accentBg: '#fdeefc',
    nav: [
      { icon:'dashboard', label:'Dashboard',  href:'academy-dashboard.html' },
      { icon:'group',     label:'Students',   href:'manage-students.html' },
      { icon:'work',      label:'Jobs',       href:'academy-jobs.html' },
      { icon:'handshake', label:'Placements', href:'placements.html' },
    ],
  },
};

function renderSidebar(role = 'candidate') {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const cfg = sidebarConfig[role] || sidebarConfig.candidate;
  const cur = currentPage();

  // Highlight only the first nav item pointing at this page (some share an href)
  const activeIdx = cfg.nav.findIndex(item => item.href === cur);
  const navItems = cfg.nav.map((item, i) => {
    const active = i === activeIdx;
    return `<a href="${item.href}" class="sidebar-item ${active ? 'sidebar-active' : ''}" title="${item.label}">
      <span class="material-symbols-rounded sidebar-icon">${item.icon}</span>
      <span class="sidebar-label">${item.label}</span>
    </a>`;
  }).join('');

  el.innerHTML = `
  <aside class="sidebar">
    <div class="sidebar-logo">
      <img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img-sm">
    </div>

    <div class="sidebar-badge" style="background:${cfg.accentBg};color:${cfg.accent};">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.accent}"></span>${cfg.badge} Panel
    </div>

    <nav class="sidebar-nav">
      ${navItems}
    </nav>

    <div class="sidebar-bottom">
      <div class="sidebar-user">
        <div class="sidebar-avatar" style="background:${cfg.gradient};">${cfg.initials}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${cfg.name}</div>
          <div class="sidebar-user-role">${cfg.badge}</div>
        </div>
        <a href="login.html" class="sidebar-logout" title="Sign out">
          <span class="material-symbols-rounded" style="font-size:18px;">logout</span>
        </a>
      </div>
    </div>
  </aside>`;
}

// ── Topbar popovers (notifications / avatar menu) ──────────
function toggleTopbarPopover(trigger) {
  const panel = trigger.parentElement.querySelector('.popover-panel');
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.popover-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) panel.classList.add('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.topbar-popover')) {
    document.querySelectorAll('.popover-panel.open').forEach(p => p.classList.remove('open'));
  }
});

// ── Init on load ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  renderFooter();

  // Dashboard pages declare: <div id="sidebar" data-role="candidate"></div>
  const sidebar = document.getElementById('sidebar');
  if (sidebar) renderSidebar(sidebar.dataset.role || 'candidate');
});
