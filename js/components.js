/* Shared Navbar + Footer + Sidebar + Topbar + access guard.
   Requires js/store.js (window.UR) and js/ui.js (window.UI) to be loaded first. */

// ── Helpers ──────────────────────────────────────────────
function currentPage() { return location.pathname.split('/').pop() || 'index.html'; }
function isActive(href) { return currentPage() === href ? 'nav-active' : ''; }
const _esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const _user = () => (window.UR ? UR.user() : null);

// Social profiles: add real URLs here; empty entries are not rendered (no dead "#" links).
const SOCIAL_LINKS = { LinkedIn: '', Twitter: '', Instagram: '', YouTube: '' };

// ── Navbar (public pages) ─────────────────────────────────
function renderNavbar() {
  const el = document.getElementById('navbar');
  if (!el) return;
  const u = _user();
  const home = u ? UR.ROLES[u.role].home : null;
  const actions = u
    ? `<a href="${home}" class="btn-primary" style="padding:10px 20px;font-size:13.5px;"><span class="material-symbols-rounded" style="font-size:17px">dashboard</span>Dashboard</a>
       <button class="btn-ghost" style="padding:10px 16px;font-size:13.5px;" onclick="signOut()">Sign out</button>`
    : `<a href="login.html" class="btn-ghost" style="padding:10px 18px;font-size:13.5px;">Sign In</a>
       <a href="register.html" class="btn-primary" style="padding:10px 20px;font-size:13.5px;">Get Started</a>`;
  el.innerHTML = `
  <nav class="navbar">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo"><img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img"></a>
      <div class="nav-links" id="navLinks">
        <a href="jobs.html" class="nav-link ${isActive('jobs.html')}">Jobs</a>
        <a href="leaderboard.html" class="nav-link ${isActive('leaderboard.html')}">Leaderboard</a>
        <a href="portfolio-gallery.html" class="nav-link ${isActive('portfolio-gallery.html')}">Portfolio</a>
        <a href="about.html" class="nav-link ${isActive('about.html')}">About</a>
        <a href="contact.html" class="nav-link ${isActive('contact.html')}">Contact</a>
      </div>
      <div class="nav-actions" id="navActions">${actions}</div>
      <button class="nav-hamburger" id="navToggle" onclick="toggleMobileNav()" aria-label="Menu">
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
        ${u ? `<a href="${home}" class="btn-primary" style="justify-content:center;">Dashboard</a><button class="btn-ghost" style="justify-content:center;" onclick="signOut()">Sign out</button>`
            : `<a href="login.html" class="btn-ghost" style="justify-content:center;">Sign In</a><a href="register.html" class="btn-primary" style="justify-content:center;">Get Started</a>`}
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
function signOut() { if (window.UR) UR.auth.logout(); location.href = 'login.html'; }

// ── Footer (public pages) ─────────────────────────────────
const SOCIAL_SVG = {
  LinkedIn: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3v-11zm6.5 0h3.8v1.5h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1v5.45h-4v-4.83c0-1.15-.02-2.64-1.6-2.64-1.61 0-1.86 1.26-1.86 2.56v4.91h-4v-11z"/>',
  Twitter: '<path d="M22 5.9a8.2 8.2 0 0 1-2.36.65 4.1 4.1 0 0 0 1.8-2.27 8.2 8.2 0 0 1-2.6 1 4.1 4.1 0 0 0-7 3.74A11.65 11.65 0 0 1 3.4 4.74a4.1 4.1 0 0 0 1.27 5.48 4.1 4.1 0 0 1-1.86-.51v.05a4.1 4.1 0 0 0 3.3 4.02 4.1 4.1 0 0 1-1.86.07 4.1 4.1 0 0 0 3.83 2.85A8.23 8.23 0 0 1 2 18.4a11.6 11.6 0 0 0 6.29 1.84c7.55 0 11.67-6.25 11.67-11.67l-.01-.53A8.3 8.3 0 0 0 22 5.9z"/>',
  Instagram: '<path d="M12 2.2c3.2 0 3.58 0 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85C2.42 3.92 3.93 2.38 7.15 2.27 8.42 2.2 8.8 2.2 12 2.2zm0 4.86a4.94 4.94 0 1 0 0 9.88 4.94 4.94 0 0 0 0-9.88zm0 8.15a3.21 3.21 0 1 1 0-6.42 3.21 3.21 0 0 1 0 6.42zm5.14-9.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"/>',
  YouTube: '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>',
};
function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  const social = Object.entries(SOCIAL_LINKS).filter(([, url]) => url).map(([n, url]) => `<a href="${_esc(url)}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24">${SOCIAL_SVG[n]}</svg></a>`).join('');
  el.innerHTML = `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-top">
        <div>
          <a href="index.html" class="footer-logo" style="margin-bottom:14px"><img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img-sm" style="height:40px"></a>
          <p class="footer-tagline">Skills over resumes — the future of skill-based hiring.</p>
        </div>
        <div class="footer-links-grid">
          <div class="footer-col">
            <div class="footer-col-title">Platform</div>
            <a href="jobs.html" class="footer-link">Browse Jobs</a>
            <a href="leaderboard.html" class="footer-link">Leaderboard</a>
            <a href="portfolio-gallery.html" class="footer-link">Portfolio</a>
            <a href="verify.html" class="footer-link">Verify a Certificate</a>
            <a href="pricing.html" class="footer-link">Plans (proposed)</a>
          </div>
          <div class="footer-col">
            <div class="footer-col-title">Join</div>
            <a href="register-candidate.html" class="footer-link">As Candidate</a>
            <a href="register-company.html" class="footer-link">As Company</a>
            <a href="register-academy.html" class="footer-link">As Academy</a>
          </div>
          <div class="footer-col">
            <div class="footer-col-title">Company</div>
            <a href="about.html" class="footer-link">About</a>
            <a href="contact.html" class="footer-link">Contact</a>
            <a href="privacy.html" class="footer-link">Privacy Policy</a>
            <a href="terms.html" class="footer-link">Terms of Service</a>
          </div>
        </div>
        ${social ? `<div class="footer-social">${social}</div>` : ''}
      </div>
      <div class="footer-bottom">
        <span class="footer-copy">© ${new Date().getFullYear()} Unresume. All rights reserved.</span>
        <div class="footer-legal">
          <a href="privacy.html" class="footer-link">Privacy</a>
          <a href="terms.html" class="footer-link">Terms</a>
        </div>
      </div>
    </div>
  </footer>`;
}

// ── Sidebar (dashboard pages) ─────────────────────────────
const sidebarConfig = {
  candidate: {
    gradient: 'linear-gradient(135deg,#38bdf8,#2563eb)', accent: '#4f46e5', accentBg: '#eeedfd',
    nav: [
      { icon: 'dashboard', label: 'Dashboard', href: 'candidate-dashboard.html' },
      { icon: 'work', label: 'Jobs', href: 'jobs.html' },
      { icon: 'assignment_turned_in', label: 'Applications', href: 'my-applications.html' },
      { icon: 'task_alt', label: 'Assessments', href: 'assessments.html' },
      { icon: 'event', label: 'Interviews', href: 'candidate-interviews.html' },
      { icon: 'workspace_premium', label: 'Certificates', href: 'certificates.html' },
      { icon: 'photo_library', label: 'Portfolio', href: 'candidate-profile.html' },
      { icon: 'chat', label: 'Messages', href: 'chat.html', badge: 'messages' },
      { icon: 'dynamic_feed', label: 'Feed', href: 'feed.html' },
      { icon: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' },
      { icon: 'settings', label: 'Settings', href: 'settings.html' },
    ],
  },
  hr: {
    gradient: 'linear-gradient(135deg,#38bdf8,#2563eb)', accent: '#2563eb', accentBg: '#eaf1ff',
    nav: [
      { icon: 'dashboard', label: 'Dashboard', href: 'hr-dashboard.html' },
      { icon: 'work', label: 'Jobs', href: 'hr-jobs.html' },
      { icon: 'assignment', label: 'Tasks', href: 'company-tasks.html' },
      { icon: 'inbox', label: 'Applications', href: 'hr-applications.html' },
      { icon: 'rate_review', label: 'Review Queue', href: 'interviewer-dashboard.html', badge: 'reviews' },
      { icon: 'compare_arrows', label: 'Compare', href: 'compare.html' },
      { icon: 'event', label: 'Interviews', href: 'hr-interviews.html' },
      { icon: 'group', label: 'Talent Search', href: 'browse-candidates.html' },
      { icon: 'insights', label: 'Analytics', href: 'hr-analytics.html' },
      { icon: 'badge', label: 'Team', href: 'team.html' },
      { icon: 'apartment', label: 'Company Profile', href: 'company-profile.html' },
      { icon: 'chat', label: 'Messages', href: 'chat.html', badge: 'messages' },
    ],
  },
  interviewer: {
    gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', accent: '#7c3aed', accentBg: '#f1ecfe',
    nav: [
      { icon: 'rate_review', label: 'Review Queue', href: 'interviewer-dashboard.html', badge: 'reviews' },
      { icon: 'assignment', label: 'Tasks', href: 'company-tasks.html' },
      { icon: 'add_task', label: 'Create Task', href: 'task-create.html' },
      { icon: 'compare_arrows', label: 'Compare', href: 'compare.html' },
      { icon: 'event', label: 'Interviews', href: 'hr-interviews.html' },
      { icon: 'chat', label: 'Messages', href: 'chat.html', badge: 'messages' },
      { icon: 'settings', label: 'Settings', href: 'settings.html' },
    ],
  },
  academy: {
    gradient: 'linear-gradient(135deg,#e879f9,#a855f7)', accent: '#c026d3', accentBg: '#fdeefc',
    nav: [
      { icon: 'dashboard', label: 'Dashboard', href: 'academy-dashboard.html' },
      { icon: 'group', label: 'Students', href: 'manage-students.html' },
      { icon: 'school', label: 'Batches', href: 'batches.html' },
      { icon: 'work', label: 'Jobs', href: 'academy-jobs.html' },
      { icon: 'handshake', label: 'Referrals & Placements', href: 'placements.html' },
      { icon: 'summarize', label: 'Reports', href: 'academy-reports.html' },
      { icon: 'chat', label: 'Messages', href: 'chat.html', badge: 'messages' },
      { icon: 'settings', label: 'Settings', href: 'settings.html' },
    ],
  },
  admin: {
    gradient: 'linear-gradient(135deg,#334155,#0f172a)', accent: '#0f172a', accentBg: '#eef0f5',
    nav: [
      { icon: 'space_dashboard', label: 'Overview', href: 'admin-dashboard.html' },
      { icon: 'manage_accounts', label: 'Users & Orgs', href: 'admin-users.html', badge: 'verifications' },
      { icon: 'gavel', label: 'Moderation', href: 'admin-moderation.html', badge: 'flags' },
      { icon: 'rate_review', label: 'Practice Reviews', href: 'interviewer-dashboard.html' },
      { icon: 'report', label: 'Disputes & Reports', href: 'admin-disputes.html', badge: 'disputes' },
      { icon: 'history', label: 'Audit Log', href: 'admin-audit.html' },
      { icon: 'tune', label: 'Platform Settings', href: 'admin-settings.html' },
      { icon: 'chat', label: 'Messages', href: 'chat.html', badge: 'messages' },
    ],
  },
};

function navBadgeCount(kind, u) {
  try {
    if (kind === 'messages') return UR.messages.unread();
    if (kind === 'reviews') return UR.submissions.list({ status: 'pending' }).filter(s => u.role === 'admin' ? !s.task.companyId : true).length;
    if (kind === 'verifications') return UR.analytics.platform().pendingVerifications;
    if (kind === 'flags') return UR.analytics.platform().flaggedSubmissions;
    if (kind === 'disputes') { const p = UR.analytics.platform(); return p.openDisputes + p.openReports; }
  } catch (e) {}
  return 0;
}

function renderSidebar(role) {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const u = _user();
  role = (u && u.role) || role || 'candidate';
  const cfg = sidebarConfig[role] || sidebarConfig.candidate;
  const cur = currentPage();
  let org = '';
  if (u && u.orgId) { const o = UR.companies.get(u.orgId) || UR.academies.get(u.orgId); if (o) org = o.name; }
  const activeIdx = cfg.nav.findIndex(item => item.href === cur);
  const navItems = cfg.nav.map((item, i) => {
    const n = item.badge && u ? navBadgeCount(item.badge, u) : 0;
    return `<a href="${item.href}" class="sidebar-item ${i === activeIdx ? 'sidebar-active' : ''}" title="${item.label}" ${i === activeIdx ? 'aria-current="page"' : ''}>
      <span class="material-symbols-rounded sidebar-icon">${item.icon}</span>
      <span class="sidebar-label">${item.label}</span>
      ${n ? `<span class="sidebar-count" aria-label="${n} pending">${n > 99 ? '99+' : n}</span>` : ''}
    </a>`;
  }).join('');
  const name = u ? u.name : 'Guest';
  el.innerHTML = `
  <aside class="sidebar">
    <div class="sidebar-logo"><a href="${u ? UR.ROLES[u.role].home : 'index.html'}"><img src="images/unresume-logo-dark.png" alt="Unresume" class="logo-img-sm"></a></div>
    <div class="sidebar-badge" style="background:${cfg.accentBg};color:${cfg.accent};">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.accent}"></span>${UR.ROLES[role].label} Panel
    </div>
    <nav class="sidebar-nav">${navItems}</nav>
    <div class="sidebar-bottom">
      <div class="sidebar-demo" title="All data is stored in this browser's localStorage until the backend API is connected (see BACKEND.md).">
        <span class="material-symbols-rounded" style="font-size:15px">database</span><span class="sidebar-label">Demo data · this browser</span>
      </div>
      <div class="sidebar-user">
        <div class="sidebar-avatar" style="background:${cfg.gradient};">${_esc(UI.initials(name))}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${_esc(name)}</div>
          <div class="sidebar-user-role">${_esc(org || UR.ROLES[role].label)}</div>
        </div>
        <button class="sidebar-logout" title="Sign out" aria-label="Sign out" onclick="signOut()"><span class="material-symbols-rounded" style="font-size:18px;">logout</span></button>
      </div>
    </div>
  </aside>`;

  const topbar = document.querySelector('.dash-topbar');
  if (topbar && !topbar.querySelector('.dash-menu-btn')) {
    const btn = document.createElement('button');
    btn.className = 'topbar-icon-btn dash-menu-btn'; btn.type = 'button'; btn.title = 'Menu'; btn.setAttribute('aria-label', 'Open menu');
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:22px">menu</span>';
    btn.addEventListener('click', () => toggleSidebar(true));
    topbar.prepend(btn);
  }
  if (!document.querySelector('.sidebar-backdrop')) {
    const bd = document.createElement('div'); bd.className = 'sidebar-backdrop';
    bd.addEventListener('click', () => toggleSidebar(false)); document.body.appendChild(bd);
  }
  el.querySelectorAll('.sidebar-item').forEach(a => a.addEventListener('click', () => toggleSidebar(false)));
}
function toggleSidebar(open) { document.body.classList.toggle('sidebar-open', open); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSidebar(false); });

// ── Topbar: notifications, messages, account menu ────────
const NOTIF_ICON = { application: ['assignment_turned_in', 'tint-blue'], score: ['grade', 'tint-purple'], interview: ['event', 'tint-amber'], message: ['chat', 'tint-blue'], referral: ['send', 'tint-pink'], placement: ['handshake', 'tint-teal'], verification: ['verified_user', 'tint-teal'], dispute: ['gavel', 'tint-pink'], integrity: ['policy', 'tint-red'], review: ['rate_review', 'tint-purple'], report: ['flag', 'tint-red'], contact: ['mail', 'tint-blue'], moderation: ['gavel', 'tint-amber'], team: ['group_add', 'tint-teal'], submission: ['upload', 'tint-teal'], social: ['person_add', 'tint-pink'], academy: ['school', 'tint-pink'] };

function topbarActionsHTML(u) {
  const notifs = UR.notifications.list(8), unread = UR.notifications.unread();
  const role = u.role;
  const profileLink = role === 'candidate' ? `<a href="candidate-profile.html" class="avatar-menu-item"><span class="material-symbols-rounded" style="font-size:18px">person</span> View Profile</a><a href="edit-profile.html" class="avatar-menu-item"><span class="material-symbols-rounded" style="font-size:18px">edit</span> Edit Profile</a>`
    : role === 'hr' ? `<a href="company-profile.html" class="avatar-menu-item"><span class="material-symbols-rounded" style="font-size:18px">apartment</span> Company Profile</a>` : '';
  return `
    <div class="topbar-popover">
      <button class="topbar-icon-btn" title="Notifications" aria-label="Notifications${unread ? `, ${unread} unread` : ''}" onclick="toggleTopbarPopover(this)">
        <span class="material-symbols-rounded" style="font-size:20px">notifications</span>${unread ? `<span class="notif-count">${unread > 9 ? '9+' : unread}</span>` : ''}
      </button>
      <div class="popover-panel notif-panel">
        <div class="popover-head">Notifications ${unread ? `<button class="mark-read" onclick="UR.notifications.markAllRead()">Mark all read</button>` : ''}</div>
        <div class="notif-list">${notifs.length ? notifs.map(n => { const [ic, tint] = NOTIF_ICON[n.type] || ['notifications', 'tint-purple']; return `<a class="notif-item ${n.read ? '' : 'unread'}" href="${_esc(n.link || 'notifications.html')}" onclick="UR.notifications.markRead('${n.id}')">
          <div class="notif-icon ${tint}"><span class="material-symbols-rounded" style="font-size:17px">${ic}</span></div>
          <div style="min-width:0"><div class="notif-text">${_esc(n.title)}</div><div class="notif-time">${UI.timeAgo(n.createdAt)}</div></div></a>`; }).join('')
          : '<div class="notif-empty">You\'re all caught up.</div>'}</div>
        <a href="notifications.html" class="notif-all">View all notifications</a>
      </div>
    </div>
    <a href="chat.html" class="topbar-icon-btn" title="Messages" aria-label="Messages">${(() => { const m = UR.messages.unread(); return `<span class="material-symbols-rounded" style="font-size:20px">chat</span>${m ? `<span class="notif-count">${m > 9 ? '9+' : m}</span>` : ''}`; })()}</a>
    <div class="topbar-popover">
      <button class="topbar-avatar" onclick="toggleTopbarPopover(this)" aria-label="Account menu" style="border:none;background:${sidebarConfig[role].gradient}">${_esc(UI.initials(u.name))}</button>
      <div class="popover-panel avatar-panel">
        <div class="avatar-head"><b>${_esc(u.name)}</b><span>${_esc(u.email)}</span></div>
        ${profileLink}
        <a href="settings.html" class="avatar-menu-item"><span class="material-symbols-rounded" style="font-size:18px">settings</span> Account Settings</a>
        <a href="notifications.html" class="avatar-menu-item"><span class="material-symbols-rounded" style="font-size:18px">notifications</span> Notifications</a>
        <button class="avatar-menu-item danger" onclick="signOut()"><span class="material-symbols-rounded" style="font-size:18px">logout</span> Sign Out</button>
      </div>
    </div>`;
}
function renderTopbar() {
  const u = _user(); if (!u) return;
  document.querySelectorAll('.dash-topbar').forEach(tb => {
    if (tb.hasAttribute('data-auto') && !tb.querySelector('.topbar-search') && tb.dataset.search) {
      const s = document.createElement('div'); s.className = 'topbar-search';
      s.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;color:var(--text4)">search</span><input type="text" id="topbarSearch" placeholder="${_esc(tb.dataset.search)}" aria-label="Search" data-local>`;
      tb.appendChild(s);
    }
    let box = tb.querySelector('.topbar-actions');
    if (!box) {
      const existing = [...tb.children].find(c => c.querySelector && c.querySelector('.topbar-popover'));
      if (existing) { existing.classList.add('topbar-actions'); box = existing; }
      else { box = document.createElement('div'); box.className = 'topbar-actions'; tb.appendChild(box); }
    }
    const openPanel = box.querySelector('.popover-panel.open');
    const wasOpen = openPanel ? [...box.querySelectorAll('.popover-panel')].indexOf(openPanel) : -1;
    box.innerHTML = topbarActionsHTML(u);
    if (wasOpen >= 0) box.querySelectorAll('.popover-panel')[wasOpen].classList.add('open');
  });
  // topbar search fallbacks: Enter routes to the role's search page
  document.querySelectorAll('.topbar-search input:not([data-local]):not([oninput])').forEach(inp => {
    if (inp._wired) return; inp._wired = true;
    const target = { candidate: 'jobs.html', hr: 'browse-candidates.html', interviewer: 'interviewer-dashboard.html', academy: 'manage-students.html', admin: 'admin-users.html' }[u.role];
    inp.placeholder = inp.placeholder || 'Search…';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) location.href = `${target}?q=${encodeURIComponent(inp.value.trim())}`; });
  });
}
function toggleTopbarPopover(trigger) {
  const panel = trigger.parentElement.querySelector('.popover-panel');
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.popover-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) panel.classList.add('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.topbar-popover')) document.querySelectorAll('.popover-panel.open').forEach(p => p.classList.remove('open'));
});

// ── Access guard ─────────────────────────────────────────
// Pages declare allowed roles with data-roles on #sidebar or <body> ("any" = any signed-in user).
function guardPage() {
  const holder = document.getElementById('sidebar') || document.body;
  const spec = holder.dataset.roles || holder.dataset.role || (document.body.dataset.roles || '');
  if (!spec || !window.UR) return true;
  const u = UR.user();
  const allowed = spec.split(',').map(s => s.trim());
  if (u && (allowed.includes('any') || allowed.includes(u.role))) return true;
  document.documentElement.style.visibility = 'hidden';
  const next = encodeURIComponent(currentPage() + location.search);
  location.replace(u ? `${UR.ROLES[u.role].home}?denied=${encodeURIComponent(currentPage())}` : `login.html?next=${next}`);
  return false;
}

// ── Live platform stats (data-stat="key") ────────────────
function renderStats() {
  const els = document.querySelectorAll('[data-stat]'); if (!els.length || !window.UR) return;
  const s = UR.analytics.platform();
  els.forEach(el => {
    const k = el.dataset.stat, v = s[k];
    el.textContent = v == null ? '—' : (k.endsWith('Rate') ? `${v}%` : Number(v).toLocaleString());
  });
}

function renderAnnouncement() {
  if (!window.UR) return;
  const msg = UR.settings().announcement;
  const main = document.querySelector('.dash-main');
  const old = document.getElementById('urAnnouncement');
  if (old) old.remove();
  if (msg && main) { const b = document.createElement('div'); b.id = 'urAnnouncement'; b.className = 'd-announce'; b.innerHTML = `<span class="material-symbols-rounded" style="font-size:19px">campaign</span>${_esc(msg)}`; main.prepend(b); }
}
function deniedNotice() {
  const d = new URLSearchParams(location.search).get('denied');
  if (d && window.UI) setTimeout(() => UI.toast(`Your account type can't open ${d}.`, 'error'), 200);
}

// ── Init — runs immediately (scripts are at the end of <body>) ──
(function initShell() {
  if (!guardPage()) return;
  renderNavbar();
  renderFooter();
  const sidebar = document.getElementById('sidebar');
  if (sidebar) renderSidebar(sidebar.dataset.role);
  renderTopbar();
  renderStats();
  renderAnnouncement();
  deniedNotice();
  window.addEventListener('ur:change', () => {
    if (sidebar) renderSidebar(sidebar.dataset.role);
    renderTopbar();
    renderStats();
  });
})();
