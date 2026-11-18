/* ═══════════════════════════════════════════════════════════════════════════
   Unresume data layer  —  window.UR
   ───────────────────────────────────────────────────────────────────────────
   This is a CLIENT-SIDE stand-in for the backend. Every method here maps 1:1
   to an endpoint listed in BACKEND.md. Data persists in this browser's
   localStorage, so every workflow (apply → submit → review → shortlist →
   interview → hire → placement, disputes, moderation…) really completes and
   is visible to the other roles in the same browser — but it is NOT shared
   between devices, and nothing here is secure. Swap these methods for fetch()
   calls when the API exists; pages only talk to UR.*.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

const VERSION = 6;
const KEY = 'unresume.db';
const SESSION_KEY = 'unresume.session';
const DAY = 864e5, HOUR = 36e5, MIN = 6e4;

const nowISO = () => new Date().toISOString();
const ago = (d = 0, h = 0, m = 0) => new Date(Date.now() - d * DAY - h * HOUR - m * MIN).toISOString();
const ahead = (d = 0, h = 0) => new Date(Date.now() + d * DAY + h * HOUR).toISOString();
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
let seqN = 0;
const uid = p => `${p}-${Date.now().toString(36)}${(seqN++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

class URError extends Error {
  constructor(message, code = 'error') { super(message); this.name = 'URError'; this.code = code; }
}

/* ── hashing ─────────────────────────────────────────────────────────────── */
function fnv32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// Prototype-only password hash. A real backend must use bcrypt/argon2 server-side.
const pwHash = (email, pw) => 'fnv:' + fnv32(`ur|${email.toLowerCase()}|${pw}`, 0x811c9dc5) + fnv32(`${pw}|${email.toLowerCase()}`, 0x9e3779b9);

async function sha256(buffer) {
  if (global.crypto && global.crypto.subtle) {
    const d = await global.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const bytes = new Uint8Array(buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  return 'fnv-' + fnv32(s, 0x811c9dc5) + fnv32(s, 0x9e3779b9);
}

/* ── constants shared with the UI ────────────────────────────────────────── */
const APP_STATUS = {
  in_progress: { label: 'In progress',   tint: 'gray',        icon: 'hourglass_top' },
  submitted:   { label: 'Submitted',     tint: 'tint-blue',   icon: 'upload' },
  under_review:{ label: 'Under review',  tint: 'tint-purple', icon: 'rate_review' },
  scored:      { label: 'Scored',        tint: 'tint-purple', icon: 'grade' },
  shortlisted: { label: 'Shortlisted',   tint: 'tint-teal',   icon: 'thumb_up' },
  interview:   { label: 'Interview',     tint: 'tint-amber',  icon: 'event' },
  offer:       { label: 'Offer',         tint: 'tint-pink',   icon: 'redeem' },
  hired:       { label: 'Hired',         tint: 'tint-teal',   icon: 'handshake' },
  rejected:    { label: 'Not selected',  tint: 'tint-red',    icon: 'block' },
  withdrawn:   { label: 'Withdrawn',     tint: 'gray',        icon: 'undo' },
  expired:     { label: 'Time expired',  tint: 'gray',        icon: 'timer_off' },
};
const APP_FLOW = ['in_progress', 'submitted', 'under_review', 'scored', 'shortlisted', 'interview', 'offer', 'hired'];
const PIPELINE = ['shortlisted', 'interview', 'offer', 'hired'];
const SUB_STATUS = {
  pending:   { label: 'Awaiting review', tint: 'tint-amber' },
  scored:    { label: 'Verified score',  tint: 'tint-teal' },
  disputed:  { label: 'Under dispute',   tint: 'tint-pink' },
  void:      { label: 'Score voided',    tint: 'tint-red' },
};
const INTERVIEW_STATUS = {
  proposed:   { label: 'Awaiting confirmation', tint: 'tint-amber' },
  confirmed:  { label: 'Confirmed',             tint: 'tint-teal' },
  reschedule: { label: 'Reschedule requested',  tint: 'tint-pink' },
  completed:  { label: 'Completed',             tint: 'tint-purple' },
  cancelled:  { label: 'Cancelled',             tint: 'gray' },
};
const TIERS = [
  { name: 'Diamond', min: 800, icon: 'diamond',           tint: 'tint-blue' },
  { name: 'Gold',    min: 750, icon: 'workspace_premium', tint: 'tint-amber' },
  { name: 'Silver',  min: 650, icon: 'military_tech',     tint: 'gray' },
  { name: 'Bronze',  min: 1,   icon: 'military_tech',     tint: 'tint-pink' },
  { name: 'Unranked',min: 0,   icon: 'hourglass_empty',   tint: 'gray' },
];
const ROLES = {
  candidate:   { label: 'Candidate',   home: 'candidate-dashboard.html' },
  hr:          { label: 'HR',          home: 'hr-dashboard.html' },
  interviewer: { label: 'Interviewer', home: 'interviewer-dashboard.html' },
  academy:     { label: 'Academy',     home: 'academy-dashboard.html' },
  admin:       { label: 'Admin',       home: 'admin-dashboard.html' },
};
const DEFAULT_SETTINGS = {
  rankMinTasks: 3,            // verified tasks needed to appear on the leaderboard
  certificateThreshold: 70,   // min task score that issues a certificate
  certificateValidityMonths: 36, // certificates older than this verify as 'expired'
  badgeMinTasks: 2,           // verified tasks in a skill needed for a skill badge
  badgeMinAvg: 75,            // avg score in that skill needed for a skill badge
  fastCompletionPct: 5,       // integrity: submitted in < N% of the time limit
  similarityThreshold: 0.6,   // integrity: note similarity (Jaccard of 3-word shingles)
  focusLossThreshold: 6,      // integrity: times the candidate left the tab
  requireCompanyVerification: true,
  allowCandidateChat: true,
  maxUploadMB: 50,
  announcement: '',
  // ── scoring framework ──
  difficultyWeights: { Beginner: 0.8, Intermediate: 1.0, Advanced: 1.25 },
  trackMinTasks: 2,           // verified tasks in a track before that track score is shown/ranked
  retakeCooldownDays: 30,     // standard assessments can be retaken after this; best score counts
  // ── candidate effort limits (anti unpaid-work) ──
  maxEstimatedHours: { screening: 2, advanced: 8, standard: 4 },
  maxTimeLimitMin: { screening: 240, advanced: 4320, standard: 1440 },
  maxActiveCompanyTasks: 2,   // a candidate can have at most N company tasks (screening/advanced) in progress at once
  // ── trust ──
  reviewSlaDays: 5,           // companies should score submissions within N days
  maxFailedLogins: 5,         // lock sign-in for 15 minutes after N failures
  // ── freshness ──
  freshnessMonths: 24,        // verified scores older than this count less
  staleWeight: 0.5,           // weight multiplier for older scores
  dualReviewGap: 15,          // dual review: escalate to moderators if reviewers differ by more than this
  maxExtensionPct: 50,        // accommodations: max extra time as % of the original window
  // ── proposed plans (shown on pricing.html; not enforced, no payments) ──
  plans: [
    { key: 'free', name: 'Free', price: '₹0', period: 'forever', blurb: 'For small teams hiring occasionally.', features: ['2 open jobs', 'Assessment library & standard assessments', 'Accept existing verified scores', 'Review queue, pipeline, messaging', '2 team seats'] },
    { key: 'pro', name: 'Professional', price: '₹9,999', period: '/ month', blurb: 'For growing teams hiring every month.', features: ['Unlimited open jobs', '10 team seats', 'Hiring analytics & CSV export', 'Shared custom task templates', 'Talent search outreach', 'Review-SLA reminders'], highlight: true },
    { key: 'enterprise', name: 'Enterprise', price: 'Custom', period: '', blurb: 'For high-volume hiring and compliance needs.', features: ['Everything in Professional', 'SSO & advanced permissions', 'Audit-log export, data residency', 'ATS integrations (API & webhooks)', 'Reviewer calibration reports', 'Dedicated support'] },
  ],
};

/* Skill tracks: scores are only combined within a track, never across unrelated skills. */
const TRACKS = {
  frontend: { label: 'Frontend', skills: ['React', 'TypeScript', 'CSS', 'JavaScript', 'HTML'] },
  backend:  { label: 'Backend',  skills: ['Node.js', 'PostgreSQL', 'AWS', 'Docker', 'DevOps'] },
  mobile:   { label: 'Mobile',   skills: ['Flutter', 'Dart', 'Firebase', 'Mobile UI'] },
  data:     { label: 'Data & ML', skills: ['Python', 'Machine Learning', 'SQL', 'Pandas', 'TensorFlow', 'Data Science', 'Tableau', 'Analytics'] },
  design:   { label: 'Design',   skills: ['Figma', 'UI/UX', 'Prototyping', 'User Research', 'UI/UX Design'] },
  product:  { label: 'Product',  skills: ['Product Strategy', 'Roadmapping', 'Agile'] },
};
const trackOf = skill => (Object.entries(TRACKS).find(([, t]) => t.skills.includes(skill)) || ['other'])[0];
const ASSESSMENT_KINDS = {
  standard:  { label: 'Standard assessment', desc: 'Reusable Unresume skill assessment. One verified score can be reused for many jobs.' },
  screening: { label: 'Screening task', desc: 'Short task (≤2h) used to filter applicants.' },
  advanced:  { label: 'Company assessment', desc: 'Role-specific task (≤8h of effort) for shortlisted or serious applicants.' },
};
const AI_POLICY = {
  allowed: { label: 'AI tools allowed', desc: 'You may use AI assistants. You are still responsible for understanding and explaining your work.' },
  disclose: { label: 'AI allowed with disclosure', desc: 'You may use AI assistants, but describe how you used them when you submit.' },
  not_allowed: { label: 'No AI tools', desc: 'Complete this task without AI code/content generators. Spell-check and docs are fine.' },
};
const EXPERIENCE = ['Entry', 'Mid', 'Senior'];

/* ── formatting helpers that are business rules (single source) ─────────── */
function fmtDuration(min) {
  if (!min) return 'No limit';
  if (min % 10080 === 0) { const w = min / 10080; return `${w} week${w > 1 ? 's' : ''}`; }
  if (min % 1440 === 0) { const d = min / 1440; return `${d} day${d > 1 ? 's' : ''}`; }
  if (min % 60 === 0) { const h = min / 60; return `${h} hour${h > 1 ? 's' : ''}`; }
  return `${min} min`;
}
function tierFor(score, ranked) {
  if (!ranked) return TIERS[TIERS.length - 1];
  return TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
}

/* ═══ SEED ═════════════════════════════════════════════════════════════════ */
const SKILL_TITLES = {
  React: ['React Component Library', 'React State Management Task', 'React Performance Audit'],
  TypeScript: ['TypeScript Refactor Task', 'Typed API Client'],
  'Node.js': ['Node.js REST Endpoint', 'Node.js Queue Worker'],
  'UI/UX': ['Checkout UX Audit', 'Landing Page Redesign'],
  Figma: ['Figma Design System Task', 'Figma Prototype Challenge'],
  Prototyping: ['Interactive Prototype Task'],
  CSS: ['CSS Layout Challenge', 'Responsive Grid Task'],
  Python: ['Python Data Cleaning Task', 'Python Algorithm Set'],
  'Machine Learning': ['Classification Model Task', 'Feature Engineering Task'],
  SQL: ['SQL Analytics Queries', 'SQL Schema Design'],
  TensorFlow: ['TensorFlow Image Classifier'],
  'Product Strategy': ['Product Teardown', 'Go-to-market Brief'],
  Analytics: ['Metrics Dashboard Spec', 'Funnel Analysis'],
  Agile: ['Sprint Planning Exercise'],
  Flutter: ['Flutter UI Challenge', 'Flutter Offline Sync Task'],
  Dart: ['Dart Data Layer Task'],
  Firebase: ['Firebase Auth Integration'],
  'Mobile UI': ['Mobile Onboarding Screens'],
  'Data Science': ['Exploratory Data Analysis', 'A/B Test Analysis'],
  PostgreSQL: ['PostgreSQL Query Tuning'],
  Tableau: ['Tableau Sales Dashboard'],
};
// Deterministic score list of length n whose mean is ~target (0–100)
function genScores(n, target) {
  const offs = [3, -2, 5, -4, 1, -3, 4, -1, 2, -5, 0, 3, -2, 1, -1];
  const out = []; for (let i = 0; i < n; i++) out.push(Math.max(40, Math.min(99, Math.round(target + offs[i % offs.length]))));
  const want = Math.round(target * n); let diff = want - out.reduce((a, b) => a + b, 0), k = 0;
  while (diff !== 0 && k < 400) { const i = k % n; const step = diff > 0 ? 1 : -1; if (out[i] + step <= 99 && out[i] + step >= 40) { out[i] += step; diff -= step; } k++; }
  return out;
}

const JOB_EXTRAS = {
  1: { workMode: 'Hybrid', experienceLevel: 'Mid', salary: { min: 18, max: 26, unit: 'LPA' }, responsibilities: ['Own frontend features from design to release', 'Maintain and extend the design system', 'Improve accessibility and web performance', 'Review pull requests and mentor juniors'] },
  2: { workMode: 'Remote', experienceLevel: 'Mid', salary: { min: 14, max: 20, unit: 'LPA' }, responsibilities: ['Run user research and usability tests', 'Design flows, wireframes and high-fidelity UI', 'Contribute to the design system', 'Partner with engineers through delivery'] },
  3: { inviteOnlyTask: true, workMode: 'On-site', experienceLevel: 'Mid', salary: { min: 20, max: 30, unit: 'LPA' }, responsibilities: ['Build and evaluate ML models', 'Own data pipelines with engineering', 'Present insights to stakeholders'] },
  4: { workMode: 'Hybrid', experienceLevel: 'Senior', salary: null, responsibilities: ['Design and build microservices and APIs', 'Own PostgreSQL schemas and performance', 'Run services on AWS with Docker'] },
  5: { workMode: 'On-site', experienceLevel: 'Senior', salary: { min: 25, max: 35, unit: 'LPA' }, responsibilities: ['Own the product roadmap', 'Define metrics and run experiments', 'Work with design and engineering daily'] },
  6: { workMode: 'Remote', experienceLevel: 'Entry', salary: { min: 6, max: 10, unit: 'LPA' }, responsibilities: ['Build Flutter features end-to-end', 'Integrate Firebase services', 'Ship to the App Store and Play Store'] },
};
const PROFILE_EXTRAS = {
  'jay-dev': { headline: 'Frontend engineer · React & accessibility', featured: true, workHistory: [{ title: 'Frontend Developer', org: 'PixelWorks', from: '2023', to: 'Present' }, { title: 'Web Intern', org: 'Brightlabs', from: '2022', to: '2023' }], education: [{ school: 'Gujarat Technological University', degree: 'B.E. Computer Engineering', year: '2022' }], certifications: [{ name: 'Web Accessibility Fundamentals', issuer: 'W3C (edX)', year: '2023', url: '' }] },
  'priya-designs': { headline: 'Product designer · fintech onboarding', featured: true, workHistory: [{ title: 'Product Designer', org: 'Finly', from: '2022', to: 'Present' }], education: [{ school: 'NID Bengaluru', degree: 'M.Des Interaction Design', year: '2022' }], certifications: [] },
  'arjun-ml': { headline: 'ML engineer', featured: false, workHistory: [{ title: 'Data Analyst', org: 'Insightly', from: '2021', to: '2024' }], education: [{ school: 'University of Pune', degree: 'B.Sc Statistics', year: '2021' }], certifications: [{ name: 'TensorFlow Developer', issuer: 'Google', year: '2023', url: '' }] },
};
function buildSeed() {
  const jobsSrc = getJobs(), tasksSrc = getTasks(), candSrc = getCandidates(), compSrc = getCompanies();
  const db = {
    version: VERSION, seededAt: nowISO(), settings: { ...DEFAULT_SETTINGS },
    users: [], candidates: {}, companies: [], academies: [], jobs: [], tasks: [], attempts: [], submissions: [],
    applications: [], interviews: [], disputes: [], reports: [], contact: [], notifications: [], conversations: [],
    students: [], batches: [], referrals: [], placements: [], audit: [], feed: [], likes: {}, follows: {},
    verifications: [], invites: [], feedback: [], jobInvites: [], loginFailures: {}, savedJobs: {}, extensions: [], reminders: {}, seq: { stu: 1042, cand: 5001 },
  };
  const PW = 'demo1234';
  const addUser = (u) => { db.users.push({ status: 'active', createdAt: ago(60), ...u, email: u.email.toLowerCase(), pwHash: pwHash(u.email, PW) }); return u.id; };

  /* companies */
  compSrc.forEach(c => db.companies.push({ ...c, verification: 'verified', verifiedAt: ago(90), createdAt: ago(120) }));
  db.companies.push({ id: 'co-quickhire', name: 'QuickHire Labs', logo: '⚡', industry: 'HR tech', size: '1–10', website: 'https://quickhire.example', location: 'Delhi', about: 'Recruitment automation for startups.', verification: 'pending', createdAt: ago(2) });

  /* academies */
  db.academies.push({ id: 'ac-nextgen', name: 'NextGen Academy', logo: '🎓', location: 'Kolkata', website: 'https://nextgen.example', about: 'Full-stack and data science bootcamps.', verification: 'verified', verifiedAt: ago(80), createdAt: ago(150) });
  db.academies.push({ id: 'ac-codecamp', name: 'CodeCamp Kolkata', logo: '💻', location: 'Kolkata', website: 'https://codecamp.example', about: 'Weekend coding bootcamp.', verification: 'pending', createdAt: ago(3) });

  /* staff users */
  addUser({ id: 'u-emily', role: 'hr', name: 'Emily Ross', email: 'emily@techcorp.demo', orgId: 'co-techcorp', title: 'Talent Lead' });
  addUser({ id: 'u-mark', role: 'interviewer', name: 'Mark Wilson', email: 'mark@techcorp.demo', orgId: 'co-techcorp', title: 'Senior Frontend Engineer' });
  addUser({ id: 'u-anita', role: 'hr', name: 'Anita Rao', email: 'anita@designstudio.demo', orgId: 'co-designstudio', title: 'Design Recruiter' });
  addUser({ id: 'u-kabir', role: 'hr', name: 'Kabir Shah', email: 'kabir@dataflow.demo', orgId: 'co-dataflow', title: 'Head of Data' });
  addUser({ id: 'u-dev', role: 'hr', name: 'Dev Patel', email: 'dev@cloudsystems.demo', orgId: 'co-cloudsystems', title: 'Engineering Manager' });
  addUser({ id: 'u-meera', role: 'hr', name: 'Meera Iyer', email: 'meera@startupx.demo', orgId: 'co-startupx', title: 'Co-founder' });
  addUser({ id: 'u-tom', role: 'hr', name: 'Tom Fernandes', email: 'tom@mobilefirst.demo', orgId: 'co-mobilefirst', title: 'CTO' });
  addUser({ id: 'u-sam', role: 'hr', name: 'Sam Roy', email: 'sam@quickhire.demo', orgId: 'co-quickhire', title: 'Founder', createdAt: ago(2) });
  addUser({ id: 'u-nextgen', role: 'academy', name: 'NextGen Academy', email: 'team@nextgen.demo', orgId: 'ac-nextgen', title: 'Placement Office' });
  addUser({ id: 'u-codecamp', role: 'academy', name: 'CodeCamp Kolkata', email: 'hello@codecamp.demo', orgId: 'ac-codecamp', title: 'Admin', createdAt: ago(3) });
  addUser({ id: 'u-admin', role: 'admin', name: 'Platform Admin', email: 'admin@unresume.demo', title: 'Trust & Safety' });

  /* tasks */
  tasksSrc.forEach(t => {
    const job = jobsSrc.find(j => j.id === t.jobId);
    db.tasks.push({
      id: t.id, jobId: t.jobId || null, companyId: job ? job.companyId : null, title: t.title, brief: t.brief,
      requirements: t.requirements, rubric: t.rubric, skills: t.skills, timeLimitMin: t.timeLimitMin,
      difficulty: t.difficulty, submissionTypes: t.submissionTypes, deadline: job ? ahead(job.deadlineInDays) : null,
      kind: t.kind || (job ? 'advanced' : 'standard'), estimatedHours: t.estimatedHours || 2, aiPolicy: t.aiPolicy || 'disclose', confidential: false,
      maxAttempts: job ? 1 : 3, trackFocus: false, dualReview: t.id === 3, reviewerIds: t.id === 1 ? ['u-mark'] : [],
      status: 'published', createdBy: job ? null : 'u-admin', createdAt: ago(job ? job.postedDaysAgo : 40), updatedAt: ago(job ? job.postedDaysAgo : 40),
    });
  });
  db.tasks.find(t => t.id === 1).createdBy = 'u-mark';

  /* jobs */
  jobsSrc.forEach(j => db.jobs.push({
    id: j.id, companyId: j.companyId, title: j.title, category: j.category, location: j.location, type: j.type,
    skills: j.skills, description: j.description, requirements: j.requirements, taskId: j.taskId, featured: j.featured,
    referralSlots: j.referralSlots, status: 'open', createdAt: ago(j.postedDaysAgo), deadline: ahead(j.deadlineInDays),
    acceptVerified: j.acceptVerified || [], ...(JOB_EXTRAS[j.id] || {}),
  }));

  /* candidates */
  candSrc.forEach((c, i) => {
    const userId = 'u-' + c.username.split('-')[0];
    addUser({ id: userId, role: 'candidate', name: c.name, email: c.email, username: c.username, createdAt: ago(200 - i * 20) });
    db.candidates[c.username] = {
      username: c.username, userId, name: c.name, bio: c.bio, location: c.location, skills: c.skills,
      followers: c.followers, following: c.following, joinedAt: ago(200 - i * 20), academyId: null, targetScore: c.score, targetTasks: c.tasksCompleted,
      verification: { email: true, identity: i < 3 ? 'verified' : 'none' },
      privacy: { profileVisibility: 'public', showScores: true, allowMessages: 'companies', leaderboard: true },
      notifyPrefs: { applications: true, interviews: true, messages: true, scores: true },
      experience: c.experience || 'Entry', academyStatus: null, ...(PROFILE_EXTRAS[c.username] || { headline: '', workHistory: [], education: [], certifications: [], featured: false }),
      portfolio: c.portfolio.map(p => ({ id: 'pf-' + p.id, legacyId: p.id, title: p.title, type: p.type, visibility: p.isPublic ? 'public' : 'private', isPublic: p.isPublic, previewType: p.previewType, url: p.url || '', submissionId: null, createdAt: ago(30 - p.id) })),
      history: [],
    };
  });
  db.candidates['sara-product'].verification.identity = 'pending';
  ['rahul-dev', 'neha-data', 'arjun-ml'].forEach(u => { db.candidates[u].academyId = 'ac-nextgen'; db.candidates[u].academyStatus = 'active'; });
  db.candidates['priya-designs'].portfolio.find(p => p.legacyId === 5).visibility = 'recruiters';
  db.candidates['priya-designs'].portfolio.find(p => p.legacyId === 5).isPublic = false;

  /* submissions with real scores */
  const H_DUP = 'b7c1e6d9a4f2083e5c19d7a0f6e2b84d31c5a9e70f4d2b6c8a1e3f5d7092c4ab';
  const mkFiles = (base, ext1, ext2, h1, h2) => [
    { slot: 'working', name: `${base}-working.${ext1}`, size: 2_400_000, type: 'application/zip', sha256: h1 },
    { slot: 'output', name: `${base}-final.${ext2}`, size: 1_100_000, type: 'image/png', sha256: h2 },
  ];
  const scored = (taskId, awards, reviewer, feedback, suggestions, d) => {
    const task = db.tasks.find(t => t.id === taskId);
    const breakdown = task.rubric.map((r, i) => ({ criterion: r.criterion, max: r.points, awarded: awards[i][0], comment: awards[i][1] }));
    return { status: 'scored', score: { total: breakdown.reduce((a, b) => a + b.awarded, 0), breakdown, feedback, suggestions, reviewerId: reviewer, scoredAt: ago(d) } };
  };
  const sub = (o) => { db.submissions.push({ integrity: { flags: [], checkedAt: o.submittedAt }, focusLosses: 0, outputUrl: '', isPublic: true, ...o }); return o.id; };

  sub({ id: 'sub-1', taskId: 1, candidate: 'jay-dev', submittedAt: ago(9), durationMin: 1510, note: 'Used Recharts with a custom theme; all charts are keyboard reachable and have text alternatives.',
    files: mkFiles('jay-dashboard', 'zip', 'png', 'a1f0c3e2d5b4968777f1e2d3c4b5a6978877665544332211aa00bb11cc22dd33', 'c3e2d5b4968777f1e2d3c4b5a6978877665544332211aa00bb11cc22dd33a1f0'),
    ...scored(1, [[23, 'Clean, typed components. A few long render functions.'], [22, 'Strong hierarchy; table view is cramped on 360px.'], [28, 'All filters work; date range edge case off by one.'], [18, 'Excellent keyboard support and labels.']], 'u-mark',
      'Very strong submission. Accessibility work stood out — this is the best keyboard support we have seen on this task.',
      ['Split DashboardPage into smaller components (it is ~400 lines).', 'Handle the inclusive end date in the range filter.', 'Use a card layout for the table below 400px.'], 6) });
  sub({ id: 'sub-2', taskId: 5, candidate: 'jay-dev', submittedAt: ago(25), durationMin: 150, isPublic: false, note: 'Included Big-O analysis in docstrings.',
    files: mkFiles('jay-algos', 'zip', 'pdf', 'd4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3', 'e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4'),
    ...scored(5, [[44, '2 of 3 problems fully correct; problem 3 fails on empty input.'], [24, 'Problem 2 could be O(n) with a hash map.'], [16, 'Readable; some single-letter names.']], 'u-admin',
      'Solid fundamentals. Watch edge cases and look for linear-time alternatives.', ['Add guards for empty input.', 'Practice hash-map based two-pointer patterns.'], 22) });
  sub({ id: 'sub-3', taskId: 2, candidate: 'priya-designs', submittedAt: ago(7), durationMin: 2900, note: 'Rationale doc is on page 2 of the PDF.',
    files: mkFiles('priya-fintech', 'fig', 'png', '0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9', '1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a'),
    ...scored(2, [[27, 'Polished and on-brand.'], [26, 'Onboarding cut from 7 to 4 steps.'], [18, 'Android back behaviour missing in one flow.'], [17, 'Clear, concise rationale.']], 'u-anita',
      'Excellent redesign with a clearly reasoned flow.', ['Document Android navigation patterns.', 'Add empty/error states for KYC upload.'], 5) });
  sub({ id: 'sub-4', taskId: 3, candidate: 'arjun-ml', submittedAt: ago(11), durationMin: 6200, note: 'Gradient boosting with SHAP feature importance.',
    files: mkFiles('arjun-churn', 'ipynb', 'pdf', '2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b', '3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c'),
    ...scored(3, [[28, 'Reported 86% accuracy, but validation leaks the target-encoded column; corrected accuracy ~81%.'], [20, 'Readable, a few unexplained cells.'], [19, 'Good insights on tenure and support tickets.'], [12, 'Charts lack axis labels.']], 'u-kabir',
      'Good modelling instincts; fix the leakage and the result will be much more credible.', ['Fit encoders inside the CV loop to avoid leakage.', 'Label all chart axes and units.'], 8) });
  sub({ id: 'sub-9', taskId: 8, candidate: 'rahul-dev', submittedAt: ago(28), durationMin: 2300, note: 'Recording is in the zip (habit-demo.mp4).',
    files: mkFiles('rahul-habits', 'zip', 'mp4', '4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d', '5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e'),
    ...scored(8, [[23, 'Nice theming, some overflow on small phones.'], [24, 'Streak logic correct; persistence works.'], [18, 'Bloc used well; widget tree is deep.'], [11, 'Recording good, README thin.']], 'u-tom',
      'Functional and pleasant app.', ['Extract reusable widgets to flatten the tree.', 'Expand the README with architecture notes.'], 25) });
  /* pending (review queue) */
  sub({ id: 'sub-5', taskId: 1, candidate: 'neha-data', submittedAt: ago(0, 5), durationMin: 1700, status: 'pending', note: 'Built with Vite + React 18. Charts use Chart.js.',
    files: mkFiles('neha-dashboard', 'zip', 'png', H_DUP, '6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3') });
  sub({ id: 'sub-6', taskId: 1, candidate: 'arjun-ml', submittedAt: ago(0, 2), durationMin: 95, status: 'pending', note: 'Dashboard in React. Filters on top, charts below.', focusLosses: 9,
    files: mkFiles('arjun-dashboard', 'zip', 'png', H_DUP, '7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4') });
  sub({ id: 'sub-7', taskId: 7, candidate: 'sara-product', submittedAt: ago(1, 3), durationMin: 2600, status: 'pending', note: 'Teardown of a UPI savings app; roadmap uses RICE.',
    files: mkFiles('sara-teardown', 'docx', 'pdf', '8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5', '9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6') });
  sub({ id: 'sub-8', taskId: 4, candidate: 'priya-designs', submittedAt: ago(0, 9), durationMin: 600, status: 'pending', note: 'Pure CSS grid, tested in Chrome/Firefox/Safari.',
    files: mkFiles('priya-css', 'zip', 'png', 'ae0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7', 'bf1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8') });
  // integrity flags for the seeded duplicate
  db.submissions.find(s => s.id === 'sub-5').integrity.flags.push({ type: 'duplicate_file', severity: 'high', detail: 'Working file is byte-identical to a submission by another candidate (sub-6).', relatedId: 'sub-6' });
  const s6 = db.submissions.find(s => s.id === 'sub-6');
  s6.integrity.flags.push({ type: 'duplicate_file', severity: 'high', detail: 'Working file is byte-identical to a submission by another candidate (sub-5).', relatedId: 'sub-5' });
  s6.integrity.flags.push({ type: 'fast_completion', severity: 'low', detail: 'Submitted in 95 min of a 2-day limit (3%).' });
  s6.integrity.flags.push({ type: 'focus_loss', severity: 'low', detail: 'Left the assessment tab 9 times.' });

  /* link task portfolio items to submissions */
  const linkPf = (u, legacyId, subId) => { const p = db.candidates[u].portfolio.find(x => x.legacyId === legacyId); if (p) p.submissionId = subId; };
  linkPf('jay-dev', 1, 'sub-1'); linkPf('jay-dev', 3, 'sub-2'); linkPf('priya-designs', 4, 'sub-3'); linkPf('arjun-ml', 6, 'sub-4'); linkPf('rahul-dev', 8, 'sub-9');

  /* verified history (older tasks, before store-tracked submissions) */
  Object.values(db.candidates).forEach(c => {
    const own = db.submissions.filter(s => s.candidate === c.username && s.status === 'scored');
    const n = Math.max(0, c.targetTasks - own.length);
    const ownSum = own.reduce((a, s) => a + s.score.total, 0);
    const target = n ? (c.targetScore / 10 * c.targetTasks - ownSum) / n : 0;
    const scores = genScores(n, target);
    // portfolio task items without a submission keep their displayed score in history
    const loose = c.portfolio.filter(p => p.type === 'task' && !p.submissionId);
    scores.forEach((sc, i) => {
      const skill = c.skills[i % c.skills.length];
      const titles = SKILL_TITLES[skill] || [`${skill} Task`];
      const pf = loose[i];
      const score = pf ? (candSrc.find(x => x.username === c.username).portfolio.find(p => p.id === pf.legacyId).score) : sc;
      const h = { id: `hist-${c.username}-${i}`, difficulty: 'Intermediate', title: pf ? pf.title : titles[i % titles.length] + (i >= titles.length ? ` ${Math.floor(i / titles.length) + 1}` : ''), skill, score, date: ago(40 + i * 14), reviewer: 'Partner company reviewer' };
      if (pf) pf.historyId = h.id;
      c.history.push(h);
    });
    // rebalance the last free entry so the seeded skill score matches the target
    const free = c.history.filter(h => !loose.some(p => p.historyId === h.id));
    if (free.length) {
      const total = own.reduce((a, s) => a + s.score.total, 0) + c.history.reduce((a, h) => a + h.score, 0);
      const want = Math.round(c.targetScore / 10 * c.targetTasks);
      free[free.length - 1].score = Math.max(40, Math.min(99, free[free.length - 1].score + (want - total)));
    }
    delete c.targetScore; delete c.targetTasks;
  });

  /* applications */
  const app = (o) => db.applications.push({ referredBy: null, createdAt: o.history[0].at, updatedAt: o.history[o.history.length - 1].at, ...o });
  const hist = (...steps) => steps.map(([status, d, h = 0, by = null, note = '']) => ({ status, at: ago(d, h), by, note }));
  app({ id: 'app-1', jobId: 1, candidate: 'jay-dev', submissionId: 'sub-1', status: 'interview', history: hist(['in_progress', 11], ['submitted', 9], ['scored', 6, 0, 'u-mark'], ['shortlisted', 5, 0, 'u-mark', 'Recommended to HR'], ['interview', 2, 0, 'u-emily']) });
  app({ id: 'app-2', jobId: 2, candidate: 'priya-designs', submissionId: 'sub-3', status: 'shortlisted', history: hist(['in_progress', 10], ['submitted', 7], ['scored', 5, 0, 'u-anita'], ['shortlisted', 4, 0, 'u-anita']) });
  app({ id: 'app-3', jobId: 3, candidate: 'arjun-ml', submissionId: 'sub-4', status: 'scored', history: hist(['in_progress', 15], ['submitted', 11], ['scored', 8, 0, 'u-kabir']) });
  app({ id: 'app-4', jobId: 1, candidate: 'neha-data', submissionId: 'sub-5', status: 'submitted', referredBy: 'ac-nextgen', history: hist(['in_progress', 2], ['submitted', 0, 5]) });
  app({ id: 'app-5', jobId: 1, candidate: 'arjun-ml', submissionId: 'sub-6', status: 'submitted', history: hist(['in_progress', 0, 4], ['submitted', 0, 2]) });
  app({ id: 'app-6', jobId: 5, candidate: 'sara-product', submissionId: 'sub-7', status: 'submitted', history: hist(['in_progress', 3], ['submitted', 1, 3]) });
  app({ id: 'app-7', jobId: 6, candidate: 'rahul-dev', submissionId: 'sub-9', status: 'hired', referredBy: 'ac-nextgen', history: hist(['in_progress', 30], ['submitted', 28], ['scored', 25, 0, 'u-tom'], ['shortlisted', 25, 0, 'u-tom'], ['interview', 23, 0, 'u-tom'], ['offer', 21, 0, 'u-tom'], ['hired', 20, 0, 'u-tom']) });

  /* interviews */
  db.interviews.push({ id: 'iv-1', applicationId: 'app-1', candidate: 'jay-dev', companyId: 'co-techcorp', stage: 'Technical interview', scheduledAt: ahead(2, 5), durationMin: 60, mode: 'Video call', location: 'Meeting link shared on confirmation', interviewerId: 'u-mark', status: 'proposed', notes: 'Walk through your dashboard submission, then a live coding exercise.', createdBy: 'u-emily', createdAt: ago(2), feedback: '' });
  db.interviews.push({ id: 'iv-2', applicationId: 'app-7', candidate: 'rahul-dev', companyId: 'co-mobilefirst', stage: 'Final round', scheduledAt: ago(23), durationMin: 45, mode: 'Video call', location: '', interviewerId: 'u-tom', status: 'completed', notes: '', createdBy: 'u-tom', createdAt: ago(24), feedback: 'Strong product sense, good Flutter depth. Proceed to offer.', outcome: 'pass' });

  /* disputes, reports, contact, verifications */
  db.submissions.find(s => s.id === 'sub-4').status = 'disputed';
  db.disputes.push({ id: 'dsp-1', submissionId: 'sub-4', originalScore: 79, candidate: 'arjun-ml', reason: 'Score calculation', details: 'My notebook reports 86% accuracy on the test set, above the 80% requirement, but Model Performance was scored 28/35. I believe the leakage concern does not apply because the encoder is fit on the training fold only (cell 14).', status: 'open', createdAt: ago(3), resolution: '', resolvedAt: null, resolvedBy: null });
  db.reports.push({ id: 'rep-1', type: 'message', targetId: 'conv-3', targetLabel: 'Conversation with Priya Sharma', reporter: 'u-jay', reason: 'Spam', details: 'Repeated promotional messages.', status: 'open', createdAt: ago(1) });
  db.reports.push({ id: 'rep-2', type: 'job', targetId: 4, targetLabel: 'Backend Engineer · CloudSystems', reporter: 'u-neha', reason: 'Misleading requirements', details: 'Listing says 4+ years but task is entry level.', status: 'open', createdAt: ago(2) });
  db.contact.push({ id: 'msg-1', name: 'Ritika Sen', email: 'ritika@example.com', topic: 'Partnership / Academy', message: 'We run a design school in Chennai and would like to onboard our students.', status: 'open', createdAt: ago(1, 4) });
  db.verifications.push({ id: 'ver-1', kind: 'company', targetId: 'co-quickhire', label: 'QuickHire Labs', submittedBy: 'u-sam', evidence: 'GSTIN 07AAACQ1234F1Z5 · domain quickhire.example', status: 'pending', createdAt: ago(2) });
  db.verifications.push({ id: 'ver-2', kind: 'academy', targetId: 'ac-codecamp', label: 'CodeCamp Kolkata', submittedBy: 'u-codecamp', evidence: 'Registered training institute certificate #WB-TI-2207', status: 'pending', createdAt: ago(3) });
  db.verifications.push({ id: 'ver-3', kind: 'identity', targetId: 'sara-product', label: 'Sara Ali (identity)', submittedBy: 'u-sara', evidence: 'Government ID uploaded (stored by ID-verification provider — not in this prototype)', status: 'pending', createdAt: ago(1) });

  /* academy: batches, students, referrals, placements */
  db.batches.push({ id: 'bt-1', academyId: 'ac-nextgen', name: 'FS-2026A', course: 'Full Stack Development', startDate: '2026-01-12', endDate: '2026-07-10', capacity: 30, createdAt: ago(320) });
  db.batches.push({ id: 'bt-2', academyId: 'ac-nextgen', name: 'DS-2026A', course: 'Data Science', startDate: '2026-02-02', endDate: '2026-08-01', capacity: 25, createdAt: ago(300) });
  const stu = (o) => db.students.push({ academyId: 'ac-nextgen', idType: 'student', createdAt: ago(250), consent: o.candidate ? 'accepted' : null, ...o });
  stu({ id: 'st-1', name: 'Rahul Mehta', email: 'rahul@unresume.demo', batchId: 'bt-1', candidate: 'rahul-dev', recordId: 'CAND-5001', idType: 'candidate', status: 'Placed' });
  stu({ id: 'st-2', name: 'Neha Patel', email: 'neha@unresume.demo', batchId: 'bt-2', candidate: 'neha-data', recordId: 'STU-1042', status: 'Referred' });
  stu({ id: 'st-3', name: 'Arjun Kumar', email: 'arjun@unresume.demo', batchId: 'bt-2', candidate: 'arjun-ml', recordId: 'STU-1043', status: 'Active' });
  stu({ id: 'st-4', name: 'Ishita Bose', email: 'ishita@example.com', batchId: 'bt-1', candidate: null, recordId: 'STU-1044', status: 'Active' });
  stu({ id: 'st-5', name: 'Karan Malhotra', email: 'karan@example.com', batchId: 'bt-1', candidate: null, recordId: 'STU-1045', status: 'Active' });
  stu({ id: 'st-6', name: 'Pooja Nair', email: 'pooja@example.com', batchId: 'bt-2', candidate: null, recordId: 'STU-1046', status: 'Active' });
  db.seq.stu = 1047; db.seq.cand = 5002;
  db.referrals.push({ id: 'ref-1', academyId: 'ac-nextgen', studentId: 'st-2', jobId: 1, status: 'applied', createdAt: ago(3), note: '' });
  db.referrals.push({ id: 'ref-2', academyId: 'ac-nextgen', studentId: 'st-1', jobId: 6, status: 'placed', createdAt: ago(31), note: '' });
  db.placements.push({ id: 'pl-1', academyId: 'ac-nextgen', studentId: 'st-1', candidate: 'rahul-dev', companyId: 'co-mobilefirst', jobId: 6, role: 'Flutter Developer', placedAt: ago(20), salary: '₹9 LPA', visible: true, source: 'application' });

  /* conversations */
  const conv = (id, a, b, msgs) => db.conversations.push({ id, participants: [a, b], meta: {}, createdAt: msgs[0][2], messages: msgs.map(([from, text, at], i) => ({ id: `${id}-m${i}`, from, text, at })), readAt: { [a]: msgs[msgs.length - 1][2] } });
  conv('conv-1', 'u-jay', 'u-emily', [['u-emily', 'Hi Jay! I reviewed your React dashboard submission — impressive work.', ago(2, 4)], ['u-jay', 'Thank you! I put a lot of effort into the accessibility aspects.', ago(2, 3)], ['u-emily', "It really shows. I've proposed a technical interview — please confirm the slot in your Interviews page.", ago(1, 2)]]);
  db.conversations[0].readAt['u-jay'] = ago(2, 3);
  conv('conv-2', 'u-jay', 'u-mark', [['u-mark', 'Your React dashboard scored 91/100 — well done.', ago(6)], ['u-jay', 'Thanks for the feedback! Any areas I could improve?', ago(6)], ['u-mark', 'The detailed suggestions are in your assessment result. Main one: split the large page component.', ago(5, 20)]]);
  conv('conv-3', 'u-jay', 'u-priya', [['u-priya', 'Hey! I saw your dashboard submission. How did you handle the data viz?', ago(0, 5)], ['u-jay', 'Used Recharts with a custom theme. Happy to share the approach!', ago(0, 4)], ['u-priya', 'That would be amazing. Would love to collaborate on something.', ago(0, 1)]]);
  db.conversations[2].readAt['u-jay'] = ago(0, 4);

  /* notifications */
  const nt = (to, type, title, link, d, h = 0, read = false) => db.notifications.push({ id: uid('nt'), to, type, title, link, read, createdAt: ago(d, h) });
  nt('u-jay', 'interview', 'TechCorp proposed a Technical interview — please confirm', 'candidate-interviews.html', 2);
  nt('u-jay', 'score', 'Your "React Dashboard Challenge" was scored 91/100', 'assessments.html?id=sub-1', 6, 0, true);
  nt('u-jay', 'application', 'You were shortlisted for Frontend Developer at TechCorp', 'my-applications.html', 5, 0, true);
  nt('u-emily', 'application', 'Neha Patel submitted the React Dashboard Challenge', 'hr-applications.html?job=1', 0, 5);
  nt('u-emily', 'application', 'Arjun Kumar submitted the React Dashboard Challenge', 'hr-applications.html?job=1', 0, 2);
  nt('u-mark', 'review', '2 new submissions for React Dashboard Challenge', 'interviewer-dashboard.html', 0, 2);
  nt('u-mark', 'integrity', 'Integrity check flagged 2 submissions (duplicate files)', 'interviewer-dashboard.html', 0, 2);
  nt('u-nextgen', 'placement', 'Rahul Mehta was hired by MobileFirst', 'placements.html', 20, 0, true);
  nt('u-nextgen', 'referral', 'Neha Patel submitted her TechCorp task', 'placements.html', 0, 5);
  nt('u-admin', 'dispute', 'New score dispute from Arjun Kumar', 'admin-disputes.html', 3);
  nt('u-admin', 'verification', 'QuickHire Labs requested company verification', 'admin-users.html?tab=verification', 2);
  nt('u-admin', 'integrity', '2 submissions flagged for duplicate files', 'admin-moderation.html?tab=integrity', 0, 2);

  /* feed (public activity; generated from real events afterwards) */
  const fd = (actor, type, text, link, d, h = 0, extra = {}) => db.feed.push({ id: uid('fd'), actor, type, text, link, createdAt: ago(d, h), ...extra });
  fd('priya-designs', 'submission', 'submitted the CSS Layout Challenge', 'leaderboard.html', 0, 9);
  fd('arjun-ml', 'score', 'earned a verified 79/100 on Customer Churn Prediction', 'candidate-profile.html?u=arjun-ml', 8, 0, { score: 79 });
  fd('sara-product', 'follow', 'started following Jay Desai', 'candidate-profile.html?u=jay-dev', 0, 6);
  fd('rahul-dev', 'hired', 'was hired as Flutter Developer at MobileFirst', 'candidate-profile.html?u=rahul-dev', 20);
  fd('jay-dev', 'score', 'earned a verified 91/100 on React Dashboard Challenge', 'candidate-profile.html?u=jay-dev', 6, 0, { score: 91 });
  fd('priya-designs', 'score', 'earned a verified 88/100 on Mobile App Redesign', 'candidate-profile.html?u=priya-designs', 5, 0, { score: 88 });
  db.follows = { 'u-sara': ['jay-dev'] };

  /* audit */
  db.audit.push({ id: uid('au'), actor: 'system', action: 'seed', target: 'database', at: nowISO(), details: 'Demo data initialised' });
  return db;
}

/* ═══ persistence ═════════════════════════════════════════════════════════ */
let db = null;
function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || db.version !== VERSION) { db = buildSeed(); persist(); }
  db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  return db;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { throw new URError('Could not save — browser storage is full or disabled.', 'storage'); }
}
/* Every mutation runs through tx(): if saving fails the in-memory change is
   rolled back and the error propagates, so the UI never shows a false success. */
function tx(fn) {
  load();
  const snapshot = JSON.stringify(db);
  try {
    const result = fn(db);
    persist();
    emit();
    return result;
  } catch (e) {
    db = JSON.parse(snapshot);
    throw e;
  }
}
function emit() { try { global.dispatchEvent(new CustomEvent('ur:change')); } catch (e) {} }
global.addEventListener && global.addEventListener('storage', e => {
  if (e.key === KEY) { db = null; emit(); }
  if (e.key === SESSION_KEY) emit();
});

/* ═══ auth & access ═══════════════════════════════════════════════════════ */
function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function me() {
  const s = session(); if (!s) return null;
  const u = load().users.find(x => x.id === s.userId);
  return u && u.status === 'active' ? u : null;
}
function requireUser(roles) {
  const u = me();
  if (!u) throw new URError('Please sign in to continue.', 'auth');
  if (roles && !roles.includes(u.role)) throw new URError('You do not have permission to do that.', 'forbidden');
  return u;
}
function audit(d, action, target, details = '') {
  const u = me();
  d.audit.unshift({ id: uid('au'), actor: u ? u.id : 'anonymous', actorName: u ? u.name : 'Anonymous', role: u ? u.role : '', action, target: String(target), details, at: nowISO() });
  if (d.audit.length > 2000) d.audit.length = 2000;
}
function notify(d, to, type, title, link = '') {
  const ids = Array.isArray(to) ? to : [to];
  ids.filter(Boolean).forEach(id => {
    // respect candidate notification preferences
    const u = d.users.find(x => x.id === id);
    if (u && u.role === 'candidate') {
      const c = d.candidates[u.username];
      const prefKey = { application: 'applications', interview: 'interviews', message: 'messages', score: 'scores' }[type];
      if (c && prefKey && c.notifyPrefs && c.notifyPrefs[prefKey] === false) return;
    }
    d.notifications.unshift({ id: uid('nt'), to: id, type, title, link, read: false, createdAt: nowISO() });
  });
}
const orgMembers = (d, orgId, roles) => d.users.filter(u => u.orgId === orgId && u.status === 'active' && (!roles || roles.includes(u.role))).map(u => u.id);
const admins = d => d.users.filter(u => u.role === 'admin' && u.status === 'active').map(u => u.id);
const candUserId = (d, username) => (d.candidates[username] || {}).userId;
function feed(d, actor, type, text, link, extra = {}) {
  const c = d.candidates[actor];
  if (!c || c.privacy.profileVisibility !== 'public') return;
  d.feed.unshift({ id: uid('fd'), actor, type, text, link, createdAt: nowISO(), ...extra });
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
function required(obj, fields) {
  const missing = fields.filter(([k]) => !String(obj[k] ?? '').trim());
  if (missing.length) throw new URError(`${missing.map(m => m[1]).join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`, 'validation');
}

const auth = {
  current: me,
  session,
  login(email, password, expectRole) {
    const d = load();
    const em = String(email || '').trim().toLowerCase();
    const lock = (d.loginFailures || {})[em];
    if (lock && lock.until && new Date(lock.until) > new Date()) throw new URError(`Too many failed attempts. Try again after ${new Date(lock.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} or reset your password.`, 'locked');
    const u = d.users.find(x => x.email === em);
    if (!u || u.pwHash !== pwHash(u.email, password || '')) {
      tx(dd => {
        dd.loginFailures = dd.loginFailures || {};
        const f = dd.loginFailures[em] = { count: ((dd.loginFailures[em] || {}).count || 0) + 1, until: null };
        if (f.count >= dd.settings.maxFailedLogins) { f.until = new Date(Date.now() + 15 * MIN).toISOString(); f.count = 0; if (u) notify(dd, u.id, 'security', 'Your account was temporarily locked after repeated failed sign-in attempts', 'settings.html'); }
        audit(dd, 'auth.login_failed', em);
      });
      throw new URError('Incorrect email or password.', 'auth');
    }
    if (u.status !== 'active') throw new URError('This account has been suspended. Contact support@unresume.io.', 'suspended');
    if (expectRole && u.role !== 'admin') {
      const group = { candidate: ['candidate'], company: ['hr', 'interviewer'], academy: ['academy'], admin: ['admin'] }[expectRole] || [expectRole];
      if (!group.includes(u.role)) throw new URError(`This is a ${ROLES[u.role].label} account — choose "${u.role === 'hr' || u.role === 'interviewer' ? 'Company' : ROLES[u.role].label}" above.`, 'role');
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id, at: nowISO() }));
    tx(dd => { const uu = dd.users.find(x => x.id === u.id); uu.prevLoginAt = uu.lastLoginAt || null; uu.lastLoginAt = nowISO(); if (dd.loginFailures) delete dd.loginFailures[em]; audit(dd, 'auth.login', u.id); });
    return clone(u);
  },
  logout() { localStorage.removeItem(SESSION_KEY); emit(); },
  register(input) {
    const { role, name, email, password } = input;
    required(input, [['name', 'Name'], ['email', 'Email'], ['password', 'Password']]);
    if (!validEmail(email)) throw new URError('Enter a valid email address.', 'validation');
    if (String(password).length < 8) throw new URError('Password must be at least 8 characters.', 'validation');
    if (!['candidate', 'hr', 'interviewer', 'academy'].includes(role)) throw new URError('Choose an account type.', 'validation');
    const user = tx(d => {
      const em = email.trim().toLowerCase();
      if (d.users.some(u => u.email === em)) throw new URError('An account with this email already exists. Sign in instead.', 'duplicate');
      const id = uid('u');
      const u = { id, role, name: name.trim(), email: em, pwHash: pwHash(em, password), status: 'active', createdAt: nowISO(), title: input.title || '' };
      if (role === 'candidate') {
        let base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidate', un = base, n = 2;
        while (d.candidates[un]) un = `${base}-${n++}`;
        u.username = un;
        d.candidates[un] = { username: un, userId: id, name: u.name, bio: input.bio || '', location: '', skills: input.skills || [], followers: 0, following: 0, joinedAt: nowISO(), academyId: null,
          verification: { email: false, identity: 'none' }, privacy: { profileVisibility: 'public', showScores: true, allowMessages: 'companies' },
          notifyPrefs: { applications: true, interviews: true, messages: true, scores: true }, portfolio: [], history: [] };
        // link to an academy student record with the same email
        d.students.filter(s => s.email.toLowerCase() === em && !s.candidate).forEach(s => { s.pendingCandidate = un; s.consent = 'pending'; });
      } else if (role === 'hr' || role === 'interviewer') {
        if (input.inviteCode) {
          const inv = d.invites.find(i => i.code === input.inviteCode.trim().toUpperCase() && i.status === 'pending');
          if (!inv) throw new URError('That invite code is not valid or has already been used.', 'validation');
          if (inv.email !== em) throw new URError('This invite was issued to a different email address.', 'validation');
          u.orgId = inv.companyId; u.role = inv.role; inv.status = 'accepted'; inv.acceptedAt = nowISO();
          notify(d, orgMembers(d, inv.companyId, ['hr']), 'team', `${u.name} joined your team as ${ROLES[inv.role].label}`, 'team.html');
        } else {
          required(input, [['orgName', 'Company name']]);
          const co = { id: uid('co'), name: input.orgName.trim(), logo: '🏢', industry: input.industry || '', size: input.size || '', website: input.website || '', location: '', about: '', verification: 'pending', createdAt: nowISO() };
          d.companies.push(co); u.orgId = co.id;
          d.verifications.push({ id: uid('ver'), kind: 'company', targetId: co.id, label: co.name, submittedBy: id, evidence: input.website ? `Website: ${input.website}` : 'No evidence provided yet', status: 'pending', createdAt: nowISO() });
          notify(d, admins(d), 'verification', `${co.name} registered and is awaiting verification`, 'admin-users.html?tab=verification');
        }
      } else if (role === 'academy') {
        const ac = { id: uid('ac'), name: input.orgName ? input.orgName.trim() : u.name, logo: '🎓', location: input.location || '', website: input.website || '', about: '', verification: 'pending', createdAt: nowISO() };
        d.academies.push(ac); u.orgId = ac.id;
        d.verifications.push({ id: uid('ver'), kind: 'academy', targetId: ac.id, label: ac.name, submittedBy: id, evidence: input.website ? `Website: ${input.website}` : 'No evidence provided yet', status: 'pending', createdAt: nowISO() });
        notify(d, admins(d), 'verification', `${ac.name} registered and is awaiting verification`, 'admin-users.html?tab=verification');
      }
      d.users.push(u);
      audit(d, 'auth.register', id, role);
      return u;
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: nowISO() }));
    return clone(user);
  },
  changePassword(current, next) {
    const u = requireUser();
    if (u.pwHash !== pwHash(u.email, current || '')) throw new URError('Current password is incorrect.', 'auth');
    if (String(next || '').length < 8) throw new URError('New password must be at least 8 characters.', 'validation');
    tx(d => { d.users.find(x => x.id === u.id).pwHash = pwHash(u.email, next); audit(d, 'auth.password_change', u.id); });
  },
  updateAccount(patch) {
    const u = requireUser();
    tx(d => {
      const uu = d.users.find(x => x.id === u.id);
      if (patch.name != null) { if (!patch.name.trim()) throw new URError('Name is required.', 'validation'); uu.name = patch.name.trim(); if (uu.role === 'candidate') d.candidates[uu.username].name = uu.name; }
      if (patch.title != null) uu.title = patch.title.trim();
      audit(d, 'account.update', u.id);
    });
  },
  emailExists(email) { return load().users.some(u => u.email === String(email || '').trim().toLowerCase()); },
  demoAccounts() {
    return [
      { role: 'candidate', label: 'Candidate', email: 'jay@unresume.demo', name: 'Jay Desai' },
      { role: 'company', label: 'Company · HR', email: 'emily@techcorp.demo', name: 'Emily Ross (TechCorp)' },
      { role: 'company', label: 'Company · Interviewer', email: 'mark@techcorp.demo', name: 'Mark Wilson (TechCorp)' },
      { role: 'academy', label: 'Academy', email: 'team@nextgen.demo', name: 'NextGen Academy' },
      { role: 'admin', label: 'Admin', email: 'admin@unresume.demo', name: 'Platform Admin' },
    ];
  },
};

/* ═══ candidates, scores, ranks ═══════════════════════════════════════════ */
function taskOf(d, id) { return d.tasks.find(t => t.id == id); }
// A score counts as verified once a reviewer scores it. It keeps counting while
// under dispute (shown with a marker) until an admin adjusts or voids it.
const hasScore = s => !!(s && s.score && (s.status === 'scored' || s.status === 'disputed'));
/* ── Scoring framework (documented on leaderboard.html#how and in BACKEND.md) ──
   1. A verified result = a reviewer's rubric total (0–100) on one task.
   2. Only the BEST verified result per task counts (retakes can't stack).
   3. Each result is weighted by task difficulty (settings.difficultyWeights).
   4. Skill score (0–1000) = 10 × difficulty-weighted mean of results tagged with that skill.
   5. Track score (0–1000) = same, over results whose skills belong to the track.
      Tracks never mix: Frontend is never averaged with Design.
   6. A candidate's headline "Skill Score" is their PRIMARY track score
      (track with the most verified tasks; ties → higher score), always shown with its track. */
function verifiedResults(d, username) {
  const c = d.candidates[username]; if (!c) return [];
  const w = d.settings.difficultyWeights || DEFAULT_SETTINGS.difficultyWeights;
  const best = {};
  d.submissions.filter(s => s.candidate === username && hasScore(s)).forEach(s => {
    if (!best[s.taskId] || s.score.total > best[s.taskId].score.total) best[s.taskId] = s;
  });
  const fromSubs = Object.values(best).map(s => {
    const t = taskOf(d, s.taskId) || {};
    const diff = t.difficulty || 'Intermediate';
    return { id: s.id, title: t.title || 'Task', skills: t.skills || [], score: s.score.total, date: s.score.scoredAt, submissionId: s.id, taskId: s.taskId, companyId: t.companyId, difficulty: diff, weight: w[diff] || 1, kind: t.kind || 'advanced',
      attempts: d.submissions.filter(x => x.candidate === username && x.taskId === s.taskId && hasScore(x)).length };
  });
  const fromHist = (c.history || []).map(h => ({ id: h.id, title: h.title, skills: [h.skill], score: h.score, date: h.date, historyId: h.id, difficulty: h.difficulty || 'Intermediate', weight: w[h.difficulty || 'Intermediate'] || 1, kind: 'imported', attempts: 1 }));
  // Freshness: results older than freshnessMonths count with staleWeight (still shown, marked "older").
  const cutoff = Date.now() - (d.settings.freshnessMonths || 24) * 30.4 * DAY, sw = d.settings.staleWeight ?? 0.5;
  return [...fromSubs, ...fromHist].map(r => (new Date(r.date).getTime() < cutoff ? { ...r, stale: true, weight: r.weight * sw } : r)).sort((a, b) => new Date(a.date) - new Date(b.date));
}
const wmean = rs => { const sw = rs.reduce((a, r) => a + r.weight, 0); return sw ? rs.reduce((a, r) => a + r.score * r.weight, 0) / sw : 0; };
function computeStats(d, username) {
  const s = d.settings, results = verifiedResults(d, username);
  const n = results.length;
  const bySkill = {}, byTrack = {};
  results.forEach(r => {
    r.skills.forEach(sk => { (bySkill[sk] = bySkill[sk] || []).push(r); });
    [...new Set(r.skills.map(trackOf))].forEach(tr => { (byTrack[tr] = byTrack[tr] || []).push(r); });
  });
  const skills = Object.entries(bySkill).map(([skill, rs]) => {
    const avg = wmean(rs);
    const level = avg >= 90 ? 'Expert' : avg >= 80 ? 'Advanced' : avg >= s.badgeMinAvg ? 'Proficient' : null;
    return { skill, track: trackOf(skill), count: rs.length, avg: Math.round(avg * 10) / 10, score: Math.round(avg * 10), badge: rs.length >= s.badgeMinTasks && level ? level : null };
  }).sort((a, b) => b.avg - a.avg);
  const minT = s.trackMinTasks || 2;
  const tracks = Object.entries(byTrack).map(([track, rs]) => ({ track, label: (TRACKS[track] || { label: 'Other' }).label, count: rs.length, score: Math.round(wmean(rs) * 10), ranked: false }))
    .sort((a, b) => b.count - a.count || b.score - a.score);
  tracks.forEach(t => { t.ranked = t.count >= Math.max(s.rankMinTasks, minT); t.tier = tierFor(t.score, t.ranked); });
  const primary = tracks[0] || null;
  const skillScore = primary ? primary.score : 0;
  const ranked = !!(primary && primary.ranked);
  const mean = n ? results.reduce((a, r) => a + r.score, 0) / n : 0;
  const certificates = results.filter(r => r.score >= s.certificateThreshold).map(r => ({
    id: 'UR-' + fnv32(username + '|' + r.id, 0x811c9dc5).toUpperCase(), title: r.title, score: r.score, date: r.date, skills: r.skills, submissionId: r.submissionId || null, companyId: r.companyId || null, difficulty: r.difficulty,
  }));
  return { skillScore, primaryTrack: primary ? primary.track : null, primaryTrackLabel: primary ? primary.label : null, ranked, tracks, tasksVerified: n, results, skills, badges: skills.filter(x => x.badge), certificates, tier: tierFor(skillScore, ranked), mean: Math.round(mean * 10) / 10 };
}
/* Ranking only ever compares candidates within ONE track or ONE skill. */
function rankTable(d, opts) {
  if (typeof opts === 'string') opts = { skill: opts };
  opts = opts || {};
  const minT = d.settings.rankMinTasks;
  const rows = Object.values(d.candidates).map(c => {
    const u = d.users.find(x => x.id === c.userId);
    if (!u || u.status !== 'active') return null;
    if (opts.experience && c.experience !== opts.experience) return null;
    const st = computeStats(d, c.username);
    if (opts.skill) {
      const sk = st.skills.find(x => x.skill === opts.skill);
      if (!sk || sk.count < Math.min(2, minT)) return null;
      return { username: c.username, score: sk.score, tasks: sk.count, ranked: true, stats: st, track: sk.track };
    }
    const track = opts.track || st.primaryTrack;
    const tr = st.tracks.find(x => x.track === track);
    if (!tr || !tr.ranked) return null;
    return { username: c.username, score: tr.score, tasks: tr.count, ranked: true, stats: st, track };
  }).filter(Boolean).filter(r => !opts.track || r.track === opts.track || opts.skill);
  rows.sort((a, b) => b.score - a.score || b.tasks - a.tasks || a.username.localeCompare(b.username));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
  return rows;
}function canView(d, c, viewer) {
  if (!c) return false;
  if (viewer && (viewer.role === 'admin' || viewer.username === c.username)) return true;
  if (c.privacy.profileVisibility === 'public') return true;
  if (c.privacy.profileVisibility === 'companies') return !!viewer && ['hr', 'interviewer', 'academy'].includes(viewer.role);
  return false;
}
const RECRUITER_ROLES = ['hr', 'interviewer', 'academy', 'admin'];
const visOf = p => p.visibility || (p.isPublic ? 'public' : 'private');
function portfolioVisibleTo(p, viewer) {
  const v = visOf(p);
  return v === 'public' || (v === 'recruiters' && !!viewer && RECRUITER_ROLES.includes(viewer.role));
}
function publicCandidate(d, c, viewer) {
  const st = computeStats(d, c.username);
  const rt = st.primaryTrack ? rankTable(d, { track: st.primaryTrack }) : [];
  const row = rt.find(r => r.username === c.username);
  const owner = viewer && (viewer.username === c.username || viewer.role === 'admin');
  const hideScores = !owner && !c.privacy.showScores;
  const user = d.users.find(u => u.id === c.userId) || {};
  return {
    ...clone(c), portfolio: clone(c.portfolio.filter(p => owner || portfolioVisibleTo(p, viewer))), email: owner || (viewer && ['hr', 'interviewer', 'academy', 'admin'].includes(viewer.role)) ? user.email : undefined,
    status: user.status, rankedOf: rt.length,
    stats: hideScores ? { hidden: true, skillScore: null, ranked: false, tasksVerified: null, results: [], skills: [], badges: [], certificates: [], tier: TIERS[TIERS.length - 1], mean: null } : st,
    rank: hideScores ? null : row ? row.rank : null,
    percentile: hideScores ? null : row ? Math.round((1 - (row.rank - 1) / Math.max(rt.length, 1)) * 100) : null,
  };
}
const candidates = {
  get(username) {
    const d = load(), c = d.candidates[username], viewer = me();
    if (!c) return null;
    if (!canView(d, c, viewer)) return { username, restricted: true, name: c.privacy.profileVisibility === 'private' ? 'Private profile' : c.name };
    return publicCandidate(d, c, viewer);
  },
  list({ q = '', skill = '' } = {}) {
    const d = load(), viewer = me();
    return Object.values(d.candidates).filter(c => canView(d, c, viewer))
      .filter(c => (d.users.find(u => u.id === c.userId) || {}).status === 'active')
      .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.skills.some(s => s.toLowerCase().includes(q.toLowerCase())))
      .filter(c => !skill || c.skills.includes(skill))
      .map(c => publicCandidate(d, c, viewer));
  },
  stats(username) { const d = load(); return d.candidates[username] ? computeStats(d, username) : null; },
  // Profile completion: each item links to where it can be completed.
  completion(username) {
    const d = load(), c = d.candidates[username]; if (!c) return null;
    const st = computeStats(d, username);
    const items = [
      ['Headline', !!c.headline, 'edit-profile.html'], ['Short bio', (c.bio || '').length >= 20, 'edit-profile.html'], ['Location', !!c.location, 'edit-profile.html'],
      ['At least 3 skills', c.skills.length >= 3, 'edit-profile.html'], ['Experience or education', (c.workHistory || []).length + (c.education || []).length > 0, 'edit-profile.html'],
      ['A portfolio item', c.portfolio.length > 0, 'candidate-profile.html'], ['A verified task score', st.tasksVerified > 0, 'assessments.html?tab=library'],
      ['Identity verified', c.verification.identity === 'verified', 'settings.html'],
    ].map(([label, done, link]) => ({ label, done, link }));
    return { pct: Math.round(items.filter(i => i.done).length / items.length * 100), items };
  },
  featured(limit = 4) {
    const d = load();
    return Object.values(d.candidates).filter(c => c.featured && c.privacy.profileVisibility === 'public' && c.privacy.showScores && (d.users.find(u => u.id === c.userId) || {}).status === 'active')
      .map(c => { const st = computeStats(d, c.username); return { username: c.username, name: c.name, headline: c.headline, track: st.primaryTrackLabel, score: st.skillScore, tasks: st.tasksVerified, skills: c.skills.slice(0, 3) }; })
      .filter(c => c.tasks > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  },
  // opts: { track, skill, experience } — always scoped; never a cross-track global ranking.
  leaderboard(opts) {
    const d = load(), viewer = me();
    if (typeof opts === 'string') opts = { skill: opts };
    opts = opts || {};
    if (!opts.track && !opts.skill) opts.track = 'frontend';
    return rankTable(d, opts).map(r => {
      const c = d.candidates[r.username];
      const visible = canView(d, c, viewer) && c.privacy.showScores && c.privacy.leaderboard !== false;
      const isMe = viewer && viewer.username === r.username;
      return { ...r, visible: visible || isMe, isMe, name: visible || isMe ? c.name : 'Anonymous candidate', username: visible || isMe ? r.username : null, experience: c.experience, tier: tierFor(r.score, true), stats: undefined, skills: visible || isMe ? c.skills : [] };
    });
  },
  tracks() { return Object.entries(TRACKS).map(([key, t]) => ({ key, label: t.label, skills: t.skills })); },
  allSkills() { const set = new Set(); Object.values(load().candidates).forEach(c => c.skills.forEach(s => set.add(s))); load().tasks.forEach(t => (t.skills || []).forEach(s => set.add(s))); return [...set].sort(); },
  updateProfile(patch) {
    const u = requireUser(['candidate']);
    return tx(d => {
      const c = d.candidates[u.username];
      if (patch.name != null) { if (!patch.name.trim()) throw new URError('Name is required.', 'validation'); c.name = patch.name.trim(); d.users.find(x => x.id === u.id).name = c.name; }
      if (patch.username != null && patch.username !== c.username) {
        const nu = patch.username.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(nu)) throw new URError('Username must be 3–30 characters: lowercase letters, numbers and hyphens.', 'validation');
        if (d.candidates[nu]) throw new URError('That username is taken.', 'duplicate');
        const old = c.username;
        c.username = nu; d.candidates[nu] = c; delete d.candidates[old];
        d.users.find(x => x.id === u.id).username = nu;
        ['submissions', 'applications', 'interviews', 'disputes', 'attempts', 'placements'].forEach(k => d[k].forEach(x => { if (x.candidate === old) x.candidate = nu; }));
        d.students.forEach(s => { if (s.candidate === old) s.candidate = nu; });
        d.feed.forEach(f => { if (f.actor === old) f.actor = nu; });
      }
      if (patch.bio != null) c.bio = patch.bio.slice(0, 500);
      if (patch.location != null) c.location = patch.location.slice(0, 80);
      if (patch.skills) { if (!patch.skills.length) throw new URError('Select at least one skill.', 'validation'); c.skills = patch.skills; }
      if (patch.privacy) c.privacy = { ...c.privacy, ...patch.privacy };
      const cleanRows = (rows, keys, max) => (Array.isArray(rows) ? rows : []).map(r => Object.fromEntries(keys.map(k => [k, String(r[k] || '').trim().slice(0, 120)]))).filter(r => r[keys[0]]).slice(0, max);
      if (patch.headline != null) c.headline = String(patch.headline).trim().slice(0, 100);
      if (patch.workHistory) c.workHistory = cleanRows(patch.workHistory, ['title', 'org', 'from', 'to'], 15);
      if (patch.education) c.education = cleanRows(patch.education, ['school', 'degree', 'year'], 10);
      if (patch.certifications) {
        c.certifications = cleanRows(patch.certifications, ['name', 'issuer', 'year', 'url'], 20);
        c.certifications.forEach(x => { if (x.url && !/^https?:\/\//.test(x.url)) throw new URError('Certification links must start with http:// or https://', 'validation'); });
      }
      if (patch.featured != null) c.featured = !!patch.featured;
      if (patch.experience) { if (!EXPERIENCE.includes(patch.experience)) throw new URError('Invalid experience level.', 'validation'); c.experience = patch.experience; }
      if (patch.notifyPrefs) c.notifyPrefs = { ...c.notifyPrefs, ...patch.notifyPrefs };
      audit(d, 'candidate.update', c.username, Object.keys(patch).join(','));
      return clone(c);
    });
  },
  requestIdentityVerification(evidence) {
    const u = requireUser(['candidate']);
    tx(d => {
      const c = d.candidates[u.username];
      if (c.verification.identity === 'verified') throw new URError('Your identity is already verified.', 'state');
      if (d.verifications.some(v => v.kind === 'identity' && v.targetId === c.username && v.status === 'pending')) throw new URError('You already have a verification request under review.', 'state');
      c.verification.identity = 'pending';
      d.verifications.push({ id: uid('ver'), kind: 'identity', targetId: c.username, label: `${c.name} (identity)`, submittedBy: u.id, evidence: evidence || 'Details provided by candidate', status: 'pending', createdAt: nowISO() });
      notify(d, admins(d), 'verification', `${c.name} requested identity verification`, 'admin-users.html?tab=verification');
      audit(d, 'verification.request', c.username, 'identity');
    });
  },
  // Full details of one portfolio item, filtered by what this viewer may see.
  portfolioItem(username, itemId) {
    const d = load(), viewer = me(), c = d.candidates[username];
    if (!c) throw new URError('Candidate not found.', 'not_found');
    const p = c.portfolio.find(x => x.id === itemId);
    const owner = !!viewer && (viewer.username === username || viewer.role === 'admin');
    const recruiter = !!viewer && RECRUITER_ROLES.includes(viewer.role);
    if (!p || (!owner && !portfolioVisibleTo(p, viewer))) throw new URError('This portfolio item is private or no longer exists.', 'not_found');
    const showScore = owner || c.privacy.showScores;
    const out = { item: clone(p), visibility: visOf(p), candidate: { name: c.name, username, headline: c.headline || '' }, owner, task: null, submission: null, score: null, history: null };
    const s = p.submissionId && d.submissions.find(x => x.id === p.submissionId);
    if (s) {
      const t = taskOf(d, s.taskId) || {};
      const job = t.jobId ? d.jobs.find(j => j.id === t.jobId) : null;
      const co = t.companyId ? d.companies.find(x => x.id === t.companyId) : null;
      out.task = { id: t.id, title: t.title, kind: t.kind, kindLabel: (ASSESSMENT_KINDS[t.kind] || {}).label || 'Assessment', skills: t.skills || [], difficulty: t.difficulty, estimatedHours: t.estimatedHours,
        brief: t.confidential && !owner && !recruiter ? null : t.brief, requirements: t.confidential && !owner && !recruiter ? [] : (t.requirements || []), confidential: !!t.confidential,
        company: co ? co.name : 'Unresume', jobTitle: job ? job.title : null, aiPolicy: (AI_POLICY[t.aiPolicy] || {}).label || null };
      out.submission = { submittedAt: s.submittedAt, status: s.status, outputUrl: s.outputUrl || '', links: clone(s.links || {}),
        files: (s.files || []).filter(f => f.slot === 'output' || owner || recruiter).map(f => ({ slot: f.slot, name: f.name, size: f.size, type: f.type, sha256: f.sha256 })),
        note: owner || recruiter ? s.note || '' : '', aiDisclosure: owner || recruiter ? s.aiDisclosure || '' : '' };
      if (s.score && s.status !== 'void' && showScore) {
        const r = s.score;
        out.score = { total: r.total, scoredAt: r.scoredAt, breakdown: (r.breakdown || []).map(b => ({ criterion: b.criterion, max: b.max, awarded: b.awarded })),
          strengths: r.strengths || '', feedback: owner ? r.feedback : '', suggestions: owner ? r.suggestions || [] : [], dual: !!(s.reviews && s.reviews.length > 1) };
      }
    } else if (p.historyId) {
      const h = (c.history || []).find(x => x.id === p.historyId);
      if (h) out.history = { title: h.title, skill: h.skill, difficulty: h.difficulty, date: h.date, reviewer: h.reviewer, score: showScore ? h.score : null };
    }
    return out;
  },
  portfolio: {
    // visibility: 'public' | 'recruiters' | 'private' (boolean accepted for older callers)
    setVisibility(itemId, visibility) {
      const u = requireUser(['candidate']);
      if (typeof visibility === 'boolean') visibility = visibility ? 'public' : 'private';
      if (!['public', 'recruiters', 'private'].includes(visibility)) throw new URError('Invalid visibility.', 'validation');
      tx(d => {
        const p = d.candidates[u.username].portfolio.find(x => x.id === itemId);
        if (!p) throw new URError('Portfolio item not found.', 'not_found');
        const s = p.submissionId && d.submissions.find(x => x.id === p.submissionId);
        const t = s && taskOf(d, s.taskId);
        if (visibility === 'public' && t && t.confidential) throw new URError('This task is confidential to the company — its output can be shown to recruiters but not publicly.', 'confidential');
        p.visibility = visibility; p.isPublic = visibility === 'public';
        if (s) s.isPublic = p.isPublic;
      });
    },
    addExternal({ title, url, previewType, kind = 'external', description = '' }) {
      const u = requireUser(['candidate']);
      if (!String(title || '').trim()) throw new URError('Title is required.', 'validation');
      if (!/^https?:\/\/\S+\.\S+/.test(String(url || '').trim())) throw new URError('Enter a full URL starting with http:// or https://', 'validation');
      return tx(d => {
        if (!['external', 'personal'].includes(kind)) throw new URError('Invalid project type.', 'validation');
        const item = { id: uid('pf'), title: title.trim().slice(0, 80), type: kind, description: String(description || '').trim().slice(0, 400), visibility: 'public', isPublic: true, previewType: previewType || 'website', url: url.trim(), submissionId: null, createdAt: nowISO() };
        d.candidates[u.username].portfolio.unshift(item);
        audit(d, 'portfolio.add', item.id);
        return item;
      });
    },
    remove(itemId) {
      const u = requireUser(['candidate']);
      tx(d => {
        const c = d.candidates[u.username], p = c.portfolio.find(x => x.id === itemId);
        if (!p) throw new URError('Portfolio item not found.', 'not_found');
        if (p.type === 'task') throw new URError('Verified task outputs cannot be deleted — set them to private instead.', 'state');
        c.portfolio = c.portfolio.filter(x => x.id !== itemId);
        audit(d, 'portfolio.remove', itemId);
      });
    },
  },
  follow(username) {
    const u = requireUser();
    return tx(d => {
      const list = d.follows[u.id] = d.follows[u.id] || [];
      const c = d.candidates[username]; if (!c) throw new URError('Candidate not found.', 'not_found');
      const i = list.indexOf(username);
      if (i >= 0) { list.splice(i, 1); c.followers = Math.max(0, c.followers - 1); return false; }
      list.push(username); c.followers++;
      if (u.role === 'candidate') feed(d, u.username, 'follow', `started following ${c.name}`, `candidate-profile.html?u=${username}`);
      notify(d, c.userId, 'social', `${u.name} started following you`, u.username ? `candidate-profile.html?u=${u.username}` : '');
      return true;
    });
  },
  isFollowing(username) { const u = me(); return !!u && (load().follows[u.id] || []).includes(username); },
};

/* ═══ companies & academies ═══════════════════════════════════════════════ */
function orgApi(kind) {
  const coll = kind === 'company' ? 'companies' : 'academies';
  return {
    get: id => clone(load()[coll].find(x => x.id === id)) || null,
    list: (filter = {}) => clone(load()[coll].filter(x => !filter.verification || x.verification === filter.verification)),
    mine() { const u = me(); return u && u.orgId ? clone(load()[coll].find(x => x.id === u.orgId)) : null; },
    contactId(id) { const roles = kind === 'company' ? ['hr'] : ['academy']; const m = load().users.find(x => x.orgId === id && roles.includes(x.role) && x.status === 'active'); return m ? m.id : null; },
    update(patch) {
      const u = requireUser(kind === 'company' ? ['hr'] : ['academy']);
      return tx(d => {
        const o = d[coll].find(x => x.id === u.orgId); if (!o) throw new URError('Organisation not found.', 'not_found');
        if (patch.name != null && !patch.name.trim()) throw new URError('Name is required.', 'validation');
        if (patch.website && !/^https?:\/\//.test(patch.website)) throw new URError('Website must start with http:// or https://', 'validation');
        ['name', 'logo', 'industry', 'size', 'website', 'location', 'about'].forEach(k => { if (patch[k] != null) o[k] = String(patch[k]).trim(); });
        audit(d, `${kind}.update`, o.id);
        return clone(o);
      });
    },
    requestVerification(evidence) {
      const u = requireUser(kind === 'company' ? ['hr'] : ['academy']);
      tx(d => {
        const o = d[coll].find(x => x.id === u.orgId);
        if (o.verification === 'verified') throw new URError('Already verified.', 'state');
        if (d.verifications.some(v => v.targetId === o.id && v.status === 'pending')) throw new URError('A verification request is already under review.', 'state');
        if (!String(evidence || '').trim()) throw new URError('Provide registration details or other evidence.', 'validation');
        o.verification = 'pending';
        d.verifications.push({ id: uid('ver'), kind, targetId: o.id, label: o.name, submittedBy: u.id, evidence: evidence.trim(), status: 'pending', createdAt: nowISO() });
        notify(d, admins(d), 'verification', `${o.name} requested ${kind} verification`, 'admin-users.html?tab=verification');
        audit(d, 'verification.request', o.id, kind);
      });
    },
  };
}
const companies = orgApi('company');
const academies = orgApi('academy');

/* ═══ jobs & tasks ═════════════════════════════════════════════════════════ */
function enrichJob(d, j) {
  const co = d.companies.find(c => c.id === j.companyId) || {};
  const task = j.taskId ? taskOf(d, j.taskId) : null;
  const apps = d.applications.filter(a => a.jobId === j.id);
  const coJobs = d.jobs.filter(x => x.companyId === j.companyId).map(x => x.id);
  const coSubs = d.submissions.filter(s => s.score && coJobs.includes((taskOf(d, s.taskId) || {}).jobId));
  const trust = { verified: co.verification === 'verified', hires: d.applications.filter(a => coJobs.includes(a.jobId) && a.status === 'hired').length,
    avgReviewDays: coSubs.length ? Math.round(coSubs.reduce((a, s) => a + (new Date(s.score.scoredAt) - new Date(s.submittedAt)) / DAY, 0) / coSubs.length * 10) / 10 : null,
    reviewSlaDays: d.settings.reviewSlaDays, hasActiveRecruiter: d.users.some(u => u.orgId === j.companyId && u.role === 'hr' && u.status === 'active') };
  return { ...clone(j), trust, company: co.name, logo: co.logo, companyVerified: co.verification === 'verified', task: task ? clone(task) : null,
    hasTask: !!(task && task.status === 'published'), applicants: apps.filter(a => a.status !== 'in_progress' && a.status !== 'withdrawn').length, applications: apps.length };
}
const jobs = {
  list({ status = 'open', companyId, q = '', category = '', workMode = '', experienceLevel = '', minSalary = 0 } = {}) {
    const d = load();
    return d.jobs.filter(j => (status === 'all' || j.status === status) && (!companyId || j.companyId === companyId))
      .map(j => enrichJob(d, j))
      .filter(j => status !== 'open' || (j.hasTask && j.companyVerified))
      .filter(j => !category || j.category === category)
      .filter(j => (!workMode || j.workMode === workMode) && (!experienceLevel || j.experienceLevel === experienceLevel) && (!minSalary || (j.salary && j.salary.max >= minSalary)))
      .filter(j => !q || [j.title, j.company, ...j.skills].some(s => String(s).toLowerCase().includes(q.toLowerCase())));
  },
  get(id) {
    const d = load(), j = d.jobs.find(x => x.id == id); if (!j) return null;
    const u = me();
    const isOwner = u && (u.role === 'admin' || u.orgId === j.companyId);
    if (j.status !== 'open' && !isOwner) return null;
    return enrichJob(d, j);
  },
  save(input) {
    const u = requireUser(['hr']);
    required(input, [['title', 'Job title'], ['description', 'Description'], ['category', 'Category']]);
    const skills = (input.skills || []).map(s => s.trim()).filter(Boolean);
    const reqs = (input.requirements || []).map(s => s.trim()).filter(Boolean);
    if (!skills.length) throw new URError('Add at least one skill.', 'validation');
    if (!reqs.length) throw new URError('Add at least one requirement.', 'validation');
    return tx(d => {
      let j = input.id ? d.jobs.find(x => x.id == input.id) : null;
      if (j && j.companyId !== u.orgId) throw new URError('You can only edit your company\'s jobs.', 'forbidden');
      if (!j) { j = { id: Math.max(0, ...d.jobs.map(x => x.id)) + 1, companyId: u.orgId, status: 'draft', createdAt: nowISO(), featured: false, referralSlots: 3, taskId: null }; d.jobs.push(j); }
      if (input.acceptVerified !== undefined) {
        const av = (input.acceptVerified || []).filter(r => r && r.skill);
        av.forEach(r => { const n = Number(r.minScore); if (!Number.isInteger(n) || n < 500 || n > 1000) throw new URError('Minimum verified score must be a whole number between 500 and 1000.', 'validation'); r.minScore = n; r.skill = String(r.skill).trim(); });
        j.acceptVerified = av;
      }
      if (input.inviteOnlyTask !== undefined) {
        if (input.inviteOnlyTask && !(j.acceptVerified || []).length) throw new URError('Invite-only assessments need at least one accepted verified score, so candidates have a way to apply first.', 'validation');
        j.inviteOnlyTask = !!input.inviteOnlyTask;
      }
      if (input.workMode != null && !['Remote', 'Hybrid', 'On-site'].includes(input.workMode)) throw new URError('Choose a work mode.', 'validation');
      if (input.experienceLevel != null && !EXPERIENCE.includes(input.experienceLevel)) throw new URError('Choose an experience level.', 'validation');
      if (input.salary !== undefined) {
        const s = input.salary;
        if (s && (s.min != null || s.max != null)) {
          const mn = Number(s.min), mx = Number(s.max);
          if (!(mn > 0) || !(mx > 0) || mn > mx) throw new URError('Salary range needs a minimum and maximum, with minimum ≤ maximum.', 'validation');
          j.salary = { min: mn, max: mx, unit: 'LPA' };
        } else j.salary = null;
      }
      if (input.workMode) j.workMode = input.workMode;
      if (input.experienceLevel) j.experienceLevel = input.experienceLevel;
      if (input.responsibilities) j.responsibilities = input.responsibilities.map(x => String(x).trim()).filter(Boolean).slice(0, 15);
      Object.assign(j, { title: input.title.trim(), category: input.category, location: (input.location || '').trim(), type: input.type || 'Full-time', description: input.description.trim(), skills, requirements: reqs, deadline: input.deadline || j.deadline || null, referralSlots: Math.max(0, parseInt(input.referralSlots ?? j.referralSlots, 10) || 0), updatedAt: nowISO() });
      if (input.taskId !== undefined) {
        const t = input.taskId ? taskOf(d, input.taskId) : null;
        if (input.taskId && (!t || t.companyId !== u.orgId)) throw new URError('Choose one of your company\'s tasks.', 'validation');
        if (t) { d.jobs.forEach(o => { if (o.id !== j.id && o.taskId === t.id) throw new URError(`That task is already linked to "${o.title}".`, 'validation'); }); t.jobId = j.id; }
        j.taskId = t ? t.id : null;
      }
      audit(d, input.id ? 'job.update' : 'job.create', j.id, j.title);
      return clone(j);
    });
  },
  setStatus(id, status) {
    const u = requireUser(['hr']);
    if (!['open', 'closed', 'draft', 'paused'].includes(status)) throw new URError('Invalid status.', 'validation');
    return tx(d => {
      const j = d.jobs.find(x => x.id == id); if (!j || j.companyId !== u.orgId) throw new URError('Job not found.', 'not_found');
      if (['flagged', 'removed'].includes(j.status)) throw new URError('This job is under moderation. Contact support to restore it.', 'moderation');
      if (status === 'open') {
        const co = d.companies.find(c => c.id === j.companyId);
        if (d.settings.requireCompanyVerification && co.verification !== 'verified') throw new URError('Your company must be verified before jobs can go live. Request verification from Company Profile.', 'unverified');
        const t = j.taskId ? taskOf(d, j.taskId) : null;
        if (!t) throw new URError('Link a task before publishing — every job on Unresume is applied to through a task.', 'no_task');
        if (t.status !== 'published') throw new URError(`Publish the task "${t.title}" first.`, 'no_task');
        if (j.deadline && new Date(j.deadline) < new Date()) throw new URError('The application deadline is in the past. Update it first.', 'validation');
      }
      j.status = status; j.updatedAt = nowISO();
      audit(d, `job.${status}`, j.id, j.title);
      return clone(j);
    });
  },
  categories() { return [...new Set(load().jobs.map(j => j.category))].sort(); },
  saved() { const u = me(); if (!u || u.role !== 'candidate') return []; return clone((load().savedJobs || {})[u.username] || []); },
  toggleSave(jobId) {
    const u = requireUser(['candidate']);
    return tx(d => { d.savedJobs = d.savedJobs || {}; const arr = d.savedJobs[u.username] = d.savedJobs[u.username] || []; const i = arr.indexOf(+jobId); if (i >= 0) { arr.splice(i, 1); return false; } arr.push(+jobId); return true; });
  },
};
const tasks = {
  list({ companyId, status, practice, mine } = {}) {
    const d = load(), u = me();
    return clone(d.tasks.filter(t => (!companyId || t.companyId === companyId) && (!status || t.status === status)
      && (practice === undefined || (practice ? !t.jobId && !t.companyId : !!t.companyId))
      && (!mine || (u && (t.companyId === u.orgId || (u.role === 'admin' && !t.companyId))))))
      .map(t => ({ ...t, timeLimitLabel: fmtDuration(t.timeLimitMin), submissions: d.submissions.filter(s => s.taskId === t.id).length, reviewed: d.submissions.filter(s => s.taskId === t.id && s.status !== 'pending').length, job: t.jobId ? clone(d.jobs.find(j => j.id === t.jobId)) : null }));
  },
  get(id) {
    const d = load(), t = taskOf(d, id); if (!t) return null;
    const u = me(); const owner = u && (u.role === 'admin' || t.companyId === u.orgId);
    if (t.status !== 'published' && !owner) return null;
    const job = t.jobId ? d.jobs.find(j => j.id === t.jobId) : null;
    if (job && job.status !== 'open' && !owner) return null;
    return { ...clone(t), timeLimitLabel: fmtDuration(t.timeLimitMin), job: job ? enrichJob(d, job) : null, company: t.companyId ? clone(d.companies.find(c => c.id === t.companyId)) : null };
  },
  save(input, publish) {
    const u = requireUser(['hr', 'interviewer', 'admin']);
    required(input, [['title', 'Task title'], ['brief', 'Brief']]);
    const reqs = (input.requirements || []).map(s => s.trim()).filter(Boolean);
    const rubric = (input.rubric || []).filter(r => String(r.criterion || '').trim() || r.points);
    if (publish) {
      if (!reqs.length) throw new URError('Add at least one requirement.', 'validation');
      if (rubric.length < 2) throw new URError('Add at least two scoring criteria.', 'validation');
      if (rubric.some(r => !String(r.criterion || '').trim())) throw new URError('Every scoring criterion needs a name.', 'validation');
      if (rubric.some(r => !(r.points > 0))) throw new URError('Every criterion needs points greater than 0.', 'validation');
      const total = rubric.reduce((a, r) => a + (+r.points || 0), 0);
      if (total !== 100) throw new URError(`Rubric points must total 100 (currently ${total}).`, 'validation');
      if (!(input.submissionTypes || []).length) throw new URError('Select at least one accepted submission type.', 'validation');
      if (!(input.timeLimitMin > 0)) throw new URError('Set a time limit.', 'validation');
      if (input.deadline && new Date(input.deadline) < new Date()) throw new URError('The deadline must be in the future.', 'validation');
    }
    // Anti unpaid-work limits: effort and time caps per assessment type.
    const kind = input.kind || (u.role === 'admin' ? 'standard' : 'advanced');
    if (!ASSESSMENT_KINDS[kind]) throw new URError('Choose an assessment type.', 'validation');
    if (kind === 'standard' && u.role !== 'admin') throw new URError('Standard assessments are maintained by Unresume. Companies create screening or company assessments.', 'forbidden');
    const est = Number(input.estimatedHours);
    if (publish) {
      const s0 = load().settings, maxH = s0.maxEstimatedHours[kind], maxT = s0.maxTimeLimitMin[kind];
      if (!(est > 0)) throw new URError('Estimate how many hours of focused work this task takes.', 'validation');
      if (est > maxH) throw new URError(`${ASSESSMENT_KINDS[kind].label}s are limited to ${maxH}h of estimated effort to avoid unpaid work. Split it or shorten the brief.`, 'effort_cap');
      if (+input.timeLimitMin > maxT) throw new URError(`${ASSESSMENT_KINDS[kind].label}s can have at most ${fmtDuration(maxT)} on the clock.`, 'effort_cap');
      if (!AI_POLICY[input.aiPolicy || 'disclose']) throw new URError('Choose an AI-use policy.', 'validation');
      if (input.source === 'generated' && !input.humanReviewed) throw new URError('This task was drafted by the assistant. Confirm you reviewed and edited every section before publishing.', 'review_required');
      if (!input.fairUse) throw new URError('Confirm the task is an assessment exercise, not real production work you will use.', 'fair_use');
    }
    return tx(d => {
      let t = input.id ? taskOf(d, input.id) : null;
      const orgId = u.role === 'admin' ? null : u.orgId;
      if (t && t.companyId !== orgId) throw new URError('You can only edit your own organisation\'s tasks.', 'forbidden');
      if (t && d.submissions.some(s => s.taskId === t.id) && publish && JSON.stringify(t.rubric.map(r => [r.criterion, +r.points])) !== JSON.stringify(rubric.map(r => [r.criterion.trim(), +r.points])))
        throw new URError('This task already has submissions, so its rubric is locked to keep scores comparable. Duplicate it as a new task instead.', 'locked');
      if (!t) { t = { id: Math.max(0, ...d.tasks.map(x => x.id)) + 1, companyId: orgId, jobId: null, status: 'draft', createdBy: u.id, createdAt: nowISO() }; d.tasks.push(t); }
      if (['flagged', 'removed'].includes(t.status)) throw new URError('This task is under moderation.', 'moderation');
      Object.assign(t, { title: input.title.trim(), brief: input.brief.trim(), requirements: reqs, rubric: rubric.map(r => ({ criterion: String(r.criterion).trim(), points: +r.points, description: String(r.description || '').trim() })),
        skills: input.skills || t.skills || [], timeLimitMin: +input.timeLimitMin || 0, deadline: input.deadline || null, difficulty: input.difficulty || 'Intermediate', submissionTypes: input.submissionTypes || [], updatedAt: nowISO(),
        kind, estimatedHours: est || 0, aiPolicy: input.aiPolicy || 'disclose', confidential: !!input.confidential, source: input.source || t.source || 'manual', templateId: input.templateId || t.templateId || null,
        humanReviewedBy: input.humanReviewed ? u.id : (t.humanReviewedBy || null),
        maxAttempts: Math.max(1, Math.min(5, parseInt(input.maxAttempts, 10) || t.maxAttempts || (kind === 'standard' ? 3 : 1))), trackFocus: !!input.trackFocus, dualReview: !!input.dualReview,
        reviewerIds: (input.reviewerIds || t.reviewerIds || []).filter(id => d.users.some(x => x.id === id && (u.role === 'admin' ? x.role === 'admin' : x.orgId === u.orgId))) });
      if (publish) t.status = 'published';
      if (input.jobId !== undefined) {
        d.jobs.forEach(j => { if (j.taskId === t.id && j.id != input.jobId) j.taskId = null; });
        if (input.jobId) {
          const j = d.jobs.find(x => x.id == input.jobId);
          if (!j || j.companyId !== orgId) throw new URError('Choose one of your company\'s jobs.', 'validation');
          if (j.taskId && j.taskId !== t.id) { const old = taskOf(d, j.taskId); if (old) old.jobId = null; }
          j.taskId = t.id; t.jobId = j.id;
        } else t.jobId = null;
      }
      audit(d, publish ? 'task.publish' : 'task.save_draft', t.id, t.title);
      return clone(t);
    });
  },
  setStatus(id, status) {
    const u = requireUser(['hr', 'interviewer', 'admin']);
    return tx(d => {
      const t = taskOf(d, id); if (!t || (u.role !== 'admin' && t.companyId !== u.orgId)) throw new URError('Task not found.', 'not_found');
      if (!['published', 'paused', 'draft'].includes(status)) throw new URError('Invalid status.', 'validation');
      if (['flagged', 'removed'].includes(t.status)) throw new URError('This task is under moderation.', 'moderation');
      t.status = status; t.updatedAt = nowISO();
      audit(d, `task.${status}`, t.id, t.title);
    });
  },
};

/* ═══ attempts (timer) & submissions ═══════════════════════════════════════ */
function expireStale(d) {
  const now = Date.now(); let changed = false;
  d.attempts.forEach(a => {
    if (a.status === 'active' && a.deadlineAt && new Date(a.deadlineAt).getTime() < now) {
      a.status = 'expired'; changed = true;
      const app = a.applicationId && d.applications.find(x => x.id === a.applicationId);
      if (app && app.status === 'in_progress') { app.status = 'expired'; app.updatedAt = nowISO(); app.history.push({ status: 'expired', at: a.deadlineAt, by: null, note: 'Time limit reached without a submission' }); }
    }
  });
  return changed;
}
const attempts = {
  current(taskId) {
    const u = me(); if (!u || u.role !== 'candidate') return null;
    const d = load();
    if (expireStale(d)) { try { persist(); } catch (e) {} }
    const list = d.attempts.filter(a => a.taskId == taskId && a.candidate === u.username).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    return clone(list[0]) || null;
  },
  // Standard assessments can be retaken after a cooldown once the last attempt is scored; only the best score counts.
  retakeInfo(taskId) {
    const u = me(); if (!u || u.role !== 'candidate') return null;
    const d = load(), t = taskOf(d, taskId); if (!t || t.jobId) return { allowed: false, reason: 'Job tasks can be attempted once.' };
    const last = d.submissions.filter(s => s.taskId == taskId && s.candidate === u.username).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (!last) return { allowed: true };
    if (last.status === 'pending') return { allowed: false, reason: 'Your last attempt is still being reviewed.' };
    const at = new Date(new Date(last.submittedAt).getTime() + d.settings.retakeCooldownDays * DAY);
    return at <= new Date() ? { allowed: true, attempts: d.submissions.filter(s => s.taskId == taskId && s.candidate === u.username).length } : { allowed: false, availableAt: at.toISOString(), reason: `Retake available ${at.toLocaleDateString()}` };
  },
  start(taskId, opts = {}) {
    const u = requireUser(['candidate']);
    const retake = opts.retake ? attempts.retakeInfo(taskId) : null;
    if (opts.retake && !retake.allowed) throw new URError(retake.reason, 'cooldown');
    return tx(d => {
      expireStale(d);
      const t = taskOf(d, taskId);
      if (!t || t.status !== 'published') throw new URError('This task is not accepting submissions.', 'closed');
      const job = t.jobId ? d.jobs.find(j => j.id === t.jobId) : null;
      if (job && job.status !== 'open') throw new URError('This job is no longer accepting applications.', 'closed');
      if (job) {
        const acc = taskAccessFor(d, job, u.username);
        if (!acc.open) throw new URError(acc.reason, 'invite_only');
      }
      if (t.deadline && new Date(t.deadline) < new Date()) throw new URError('The deadline for this task has passed.', 'closed');
      const mine = d.attempts.filter(a => a.taskId == taskId && a.candidate === u.username).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
      const existing = mine.find(a => a.status === 'active') || (!opts.retake && mine.find(a => a.status === 'submitted'));
      if (existing) return clone(existing);
      if (t.kind !== 'standard') {
        const lim = d.settings.maxActiveCompanyTasks || 2;
        const busy = d.attempts.filter(a => a.candidate === u.username && a.status === 'active' && a.taskId != taskId && (taskOf(d, a.taskId) || {}).kind !== 'standard');
        if (busy.length >= lim) throw new URError(`You already have ${busy.length} company tasks in progress. Submit one before starting another — this keeps unpaid assessment work manageable.`, 'workload');
      }
      const used = mine.filter(a => ['submitted', 'expired'].includes(a.status)).length;
      if (t.maxAttempts && used >= t.maxAttempts) throw new URError(`You've used all ${t.maxAttempts} attempt${t.maxAttempts > 1 ? 's' : ''} for this task.`, 'max_attempts');
      if (d.attempts.some(a => a.taskId == taskId && a.candidate === u.username && a.status === 'expired') && job)
        throw new URError('Your attempt for this job task expired. Each job task can be attempted once.', 'expired');
      const startedAt = nowISO();
      let deadlineAt = t.timeLimitMin ? new Date(Date.now() + t.timeLimitMin * MIN).toISOString() : null;
      if (t.deadline && (!deadlineAt || new Date(t.deadline) < new Date(deadlineAt))) deadlineAt = t.deadline;
      const a = { id: uid('att'), taskId: t.id, candidate: u.username, startedAt, deadlineAt, status: 'active', focusLosses: 0, applicationId: null };
      if (job) {
        let app = d.applications.find(x => x.jobId === job.id && x.candidate === u.username && x.status !== 'withdrawn');
        if (!app) {
          const st = d.students.find(s => s.candidate === u.username && s.idType === 'student');
          const ref = st && d.referrals.find(r => r.studentId === st.id && r.jobId === job.id);
          app = { id: uid('app'), jobId: job.id, candidate: u.username, submissionId: null, status: 'in_progress', referredBy: ref ? ref.academyId : null, createdAt: startedAt, updatedAt: startedAt, history: [{ status: 'in_progress', at: startedAt, by: u.id, note: 'Task started' }] };
          d.applications.push(app);
          if (ref) ref.status = 'started';
        }
        a.applicationId = app.id;
      }
      d.attempts.push(a);
      audit(d, 'attempt.start', a.id, t.title);
      return clone(a);
    });
  },
  // Only recorded when the task explicitly enables (and discloses) tab tracking.
  recordFocusLoss(attemptId) {
    try { tx(d => { const a = d.attempts.find(x => x.id === attemptId); const t = a && taskOf(d, a.taskId); if (a && a.status === 'active' && t && t.trackFocus) a.focusLosses++; }); } catch (e) {}
  },
  // Autosave of text fields while working (files can't be persisted in the browser).
  saveDraft(attemptId, draft) {
    const u = requireUser(['candidate']);
    tx(d => { const a = d.attempts.find(x => x.id === attemptId && x.candidate === u.username); if (!a || a.status !== 'active') throw new URError('Attempt is not active.', 'state'); a.draft = { ...(a.draft || {}), ...draft, savedAt: nowISO() }; });
  },
  // Accommodations: candidate asks for more time; the task owner (or admin for standard tasks) decides.
  requestExtension(attemptId, minutes, reason) {
    const u = requireUser(['candidate']);
    if (String(reason || '').trim().length < 10) throw new URError('Briefly explain why you need more time (10+ characters).', 'validation');
    return tx(d => {
      const a = d.attempts.find(x => x.id === attemptId && x.candidate === u.username); if (!a || a.status !== 'active') throw new URError('Attempt is not active.', 'state');
      if (d.extensions.some(e => e.attemptId === attemptId && e.status === 'pending')) throw new URError('You already have a pending request.', 'duplicate');
      const t = taskOf(d, a.taskId), maxMin = Math.round((t.timeLimitMin || 0) * d.settings.maxExtensionPct / 100);
      const m = Math.round(Number(minutes));
      if (!(m > 0) || m > maxMin) throw new URError(`Request between 1 and ${maxMin} minutes.`, 'validation');
      const ex = { id: uid('ext'), attemptId, taskId: t.id, candidate: u.username, minutes: m, reason: reason.trim(), status: 'pending', createdAt: nowISO() };
      d.extensions.push(ex);
      notify(d, t.companyId ? orgMembers(d, t.companyId, ['hr', 'interviewer']) : admins(d), 'review', `Time extension request from ${d.candidates[u.username].name} (${t.title})`, 'interviewer-dashboard.html?tab=extensions');
      return clone(ex);
    });
  },
  extensions({ status = 'pending' } = {}) {
    const u = requireUser(['hr', 'interviewer', 'admin', 'candidate']); const d = load();
    return d.extensions.filter(e => { const t = taskOf(d, e.taskId) || {}; return (!status || e.status === status) && (u.role === 'candidate' ? e.candidate === u.username : u.role === 'admin' ? !t.companyId : t.companyId === u.orgId); })
      .map(e => ({ ...clone(e), candidateName: (d.candidates[e.candidate] || {}).name, taskTitle: (taskOf(d, e.taskId) || {}).title }));
  },
  decideExtension(id, approve, note = '') {
    const u = requireUser(['hr', 'interviewer', 'admin']);
    tx(d => {
      const e = d.extensions.find(x => x.id === id); if (!e || e.status !== 'pending') throw new URError('Request not found or already decided.', 'state');
      const t = taskOf(d, e.taskId); if (u.role !== 'admin' && t.companyId !== u.orgId) throw new URError('Not your task.', 'forbidden');
      const a = d.attempts.find(x => x.id === e.attemptId);
      e.status = approve ? 'approved' : 'declined'; e.note = note; e.decidedBy = u.id; e.decidedAt = nowISO();
      if (approve && a && a.status === 'active' && a.deadlineAt) a.deadlineAt = new Date(new Date(a.deadlineAt).getTime() + e.minutes * MIN).toISOString();
      notify(d, candUserId(d, e.candidate), 'submission', approve ? `You got ${e.minutes} more minutes for ${t.title}` : `Your time extension for ${t.title} was declined${note ? ': ' + note : ''}`, `task-workplace.html?id=${t.id}`);
      audit(d, approve ? 'extension.approve' : 'extension.decline', id, note);
    });
  },
};

/* integrity heuristics — see BACKEND.md for the production engine */
function shingles(text) {
  const w = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const set = new Set(); for (let i = 0; i + 2 < w.length; i++) set.add(w.slice(i, i + 3).join(' '));
  return set;
}
function jaccard(a, b) { if (!a.size || !b.size) return 0; let inter = 0; a.forEach(x => { if (b.has(x)) inter++; }); return inter / (a.size + b.size - inter); }
function integrityCheck(d, s) {
  const flags = [], t = taskOf(d, s.taskId), set = d.settings;
  const others = d.submissions.filter(o => o.id !== s.id && o.candidate !== s.candidate);
  s.files.forEach(f => {
    if (!f.sha256) return;
    const hit = others.find(o => o.files.some(g => g.sha256 === f.sha256));
    if (hit) flags.push({ type: 'duplicate_file', severity: 'high', detail: `${f.slot === 'working' ? 'Working file' : 'Final output'} is byte-identical to a file submitted by another candidate (${hit.id}).`, relatedId: hit.id });
  });
  if (s.outputUrl) { const hit = others.find(o => o.outputUrl && o.outputUrl.replace(/\/$/, '') === s.outputUrl.replace(/\/$/, '')); if (hit) flags.push({ type: 'duplicate_url', severity: 'high', detail: `Output URL is identical to another candidate's submission (${hit.id}).`, relatedId: hit.id }); }
  const sh = shingles(s.note);
  if (sh.size >= 8) others.forEach(o => { const j = jaccard(sh, shingles(o.note)); if (j >= set.similarityThreshold) flags.push({ type: 'similar_text', severity: 'medium', detail: `Submission notes are ${Math.round(j * 100)}% similar to ${o.id}.`, relatedId: o.id }); });
  if (t && t.timeLimitMin >= 60 && s.durationMin < t.timeLimitMin * set.fastCompletionPct / 100) flags.push({ type: 'fast_completion', severity: 'low', detail: `Submitted in ${s.durationMin} min of a ${fmtDuration(t.timeLimitMin)} limit (${Math.round(s.durationMin / t.timeLimitMin * 100)}%).` });
  if (t && t.trackFocus && s.focusLosses >= set.focusLossThreshold) flags.push({ type: 'focus_loss', severity: 'low', detail: `Left the assessment tab ${s.focusLosses} times.` });
  return flags;
}
const INTEGRITY_LABEL = { review_gap: 'Reviewer disagreement', reviewer_concern: 'Reviewer concern', duplicate_file: 'Duplicate file', duplicate_url: 'Duplicate URL', similar_text: 'Similar text', fast_completion: 'Unusually fast', focus_loss: 'Left tab often' };

function enrichSub(d, s, viewer) {
  const t = taskOf(d, s.taskId) || {};
  const c = d.candidates[s.candidate] || {};
  const app = d.applications.find(a => a.submissionId === s.id);
  const reviewer = s.score && d.users.find(u => u.id === s.score.reviewerId);
  const dispute = d.disputes.filter(x => x.submissionId === s.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const due = new Date(new Date(s.submittedAt).getTime() + d.settings.reviewSlaDays * DAY);
  const out = { ...clone(s), reviewDueAt: due.toISOString(), overdue: s.status === 'pending' && due < new Date(), task: { id: t.id, title: t.title, rubric: clone(t.rubric), companyId: t.companyId, timeLimitMin: t.timeLimitMin, skills: t.skills, jobId: t.jobId, kind: t.kind, difficulty: t.difficulty, aiPolicy: t.aiPolicy, confidential: t.confidential, estimatedHours: t.estimatedHours },
    candidateName: c.name, application: app ? clone(app) : null, job: app ? enrichJob(d, d.jobs.find(j => j.id === app.jobId)) : null,
    reviewerName: reviewer ? reviewer.name : (s.score ? 'Reviewer' : null), dispute: dispute ? clone(dispute) : null,
    companyName: t.companyId ? (d.companies.find(co => co.id === t.companyId) || {}).name : 'Unresume Practice' };
  // candidates never see raw integrity flags of other candidates; reviewers see all
  if (viewer && viewer.role === 'candidate') out.integrity = { flagged: s.integrity.flags.length > 0, cleared: !!s.integrity.clearedAt };
  // Dual review stays blind: pending first-review scores are only visible to admins.
  if (s.reviews && !(viewer && viewer.role === 'admin')) out.reviews = s.status === 'pending' ? s.reviews.map(r => ({ reviewerId: r.reviewerId })) : undefined;
  return out;
}
const submissions = {
  async submit({ attemptId, files, note = '', isPublic = true, visibility, outputUrl = '', aiDisclosure = '', aiConfirm = false, links = {} }) {
    const u = requireUser(['candidate']);
    const d0 = load(), a0 = d0.attempts.find(x => x.id === attemptId);
    if (!a0 || a0.candidate !== u.username) throw new URError('Assessment session not found. Reload the page and try again.', 'not_found');
    if (a0.status === 'submitted') throw new URError('You have already submitted this task.', 'duplicate');
    if (a0.status === 'expired' || (a0.deadlineAt && new Date(a0.deadlineAt) < new Date())) throw new URError('Time is up — this attempt can no longer be submitted.', 'expired');
    const t0 = taskOf(d0, a0.taskId);
    const policy = t0.aiPolicy || 'disclose';
    if (policy === 'disclose' && String(aiDisclosure).trim().length < 3) throw new URError('This task asks you to describe any AI tool use (write "None" if you used none).', 'validation');
    if (policy === 'not_allowed' && !aiConfirm) throw new URError('Confirm you completed this task without AI generation tools.', 'validation');
    if (!visibility) visibility = isPublic ? 'public' : 'private';
    if (t0.confidential && visibility === 'public') visibility = 'recruiters';
    const working = files.working, output = files.output;
    if (!working) throw new URError('Upload your working file.', 'validation');
    if (!output && !String(outputUrl).trim()) throw new URError('Upload your final output or provide a URL.', 'validation');
    if (outputUrl && !/^https?:\/\/\S+\.\S+/.test(outputUrl.trim())) throw new URError('The output URL must start with http:// or https://', 'validation');
    const maxB = d0.settings.maxUploadMB * 1024 * 1024;
    [working, output].filter(Boolean).forEach(f => { if (f.size > maxB) throw new URError(`"${f.name}" is larger than ${d0.settings.maxUploadMB} MB.`, 'validation'); if (!f.size) throw new URError(`"${f.name}" is empty.`, 'validation'); });
    // hash files (real SHA-256 of the bytes) for duplicate detection
    const meta = [];
    for (const [slot, f] of [['working', working], ['output', output]]) {
      if (!f) continue;
      const buf = await f.arrayBuffer();
      meta.push({ slot, name: f.name, size: f.size, type: f.type || 'application/octet-stream', sha256: await sha256(buf) });
    }
    return tx(d => {
      const a = d.attempts.find(x => x.id === attemptId);
      if (a.status !== 'active') throw new URError(a.status === 'submitted' ? 'You have already submitted this task.' : 'This attempt has expired.', 'state');
      const t = taskOf(d, a.taskId);
      const s = { id: uid('sub'), taskId: a.taskId, attemptId: a.id, candidate: u.username, submittedAt: nowISO(), durationMin: Math.max(1, Math.round((Date.now() - new Date(a.startedAt)) / MIN)),
        status: 'pending', note: String(note).slice(0, 2000), isPublic: visibility === 'public', visibility, aiPolicy: policy, aiDisclosure: String(aiDisclosure || '').trim().slice(0, 1000), links: Object.fromEntries(Object.entries(links || {}).filter(([k, v]) => ['repo', 'design'].includes(k) && /^https?:\/\/\S+\.\S+/.test(String(v || '').trim())).map(([k, v]) => [k, String(v).trim()])), outputUrl: String(outputUrl || '').trim(), files: meta, focusLosses: a.focusLosses, integrity: { flags: [], checkedAt: nowISO() } };
      s.integrity.flags = integrityCheck(d, s);
      // flag the matching earlier submissions too
      s.integrity.flags.filter(f => f.relatedId).forEach(f => { const o = d.submissions.find(x => x.id === f.relatedId); if (o && !o.integrity.flags.some(g => g.relatedId === s.id)) o.integrity.flags.push({ type: f.type, severity: f.severity, detail: `Matches a later submission (${s.id}).`, relatedId: s.id }); });
      d.submissions.push(s);
      a.status = 'submitted'; a.submissionId = s.id;
      const c = d.candidates[u.username];
      const prevItem = c.portfolio.find(p => p.submissionId && (d.submissions.find(x => x.id === p.submissionId) || {}).taskId === t.id);
      if (prevItem) c.portfolio = c.portfolio.filter(p => p !== prevItem);
      c.portfolio.unshift({ id: uid('pf'), title: t.title, type: 'task', visibility, isPublic: visibility === 'public', previewType: output && /^image\//.test(output.type) ? 'image' : (s.outputUrl ? 'website' : 'document'), url: s.outputUrl, submissionId: s.id, createdAt: nowISO() });
      const reviewers = t.companyId ? orgMembers(d, t.companyId, ['hr', 'interviewer']) : admins(d);
      if (a.applicationId) {
        const app = d.applications.find(x => x.id === a.applicationId);
        app.submissionId = s.id; app.status = 'submitted'; app.updatedAt = nowISO(); app.history.push({ status: 'submitted', at: nowISO(), by: u.id, note: '' });
        const job = d.jobs.find(j => j.id === app.jobId);
        notify(d, reviewers, 'application', `${c.name} submitted the ${t.title} for ${job.title}`, `interviewer-dashboard.html?sub=${s.id}`);
        if (app.referredBy) { notify(d, orgMembers(d, app.referredBy, ['academy']), 'referral', `${c.name} submitted the ${t.title} (${job.title})`, 'placements.html'); const st = d.students.find(x => x.candidate === u.username); const ref = st && d.referrals.find(r => r.studentId === st.id && r.jobId === job.id); if (ref) ref.status = 'applied'; }
      } else notify(d, reviewers, 'review', `New practice submission: ${t.title}`, `interviewer-dashboard.html?sub=${s.id}`);
      if (s.integrity.flags.some(f => f.severity !== 'low')) notify(d, admins(d), 'integrity', `Integrity check flagged a submission for ${t.title}`, 'admin-moderation.html?tab=integrity');
      notify(d, u.id, 'submission', `Submission received: ${t.title}`, `assessments.html?id=${s.id}`);
      feed(d, u.username, 'submission', `submitted the ${t.title}`, `candidate-profile.html?u=${u.username}`);
      audit(d, 'submission.create', s.id, t.title);
      return clone(s);
    });
  },
  get(id) {
    const d = load(), s = d.submissions.find(x => x.id === id), u = me(); if (!s || !u) return null;
    const t = taskOf(d, s.taskId);
    const allowed = u.role === 'admin' || s.candidate === u.username || (t && t.companyId && t.companyId === u.orgId);
    return allowed ? enrichSub(d, s, u) : null;
  },
  list({ candidate, companyId, status, taskId, practice, flagged } = {}) {
    const d = load(), u = me(); if (!u) return [];
    return d.submissions.filter(s => {
      const t = taskOf(d, s.taskId) || {};
      if (u.role === 'candidate' && s.candidate !== u.username) return false;
      if (['hr', 'interviewer'].includes(u.role) && t.companyId !== u.orgId) return false;
      if (u.role === 'academy') return false;
      if (candidate && s.candidate !== candidate) return false;
      if (companyId && t.companyId !== companyId) return false;
      if (status && (Array.isArray(status) ? !status.includes(s.status) : s.status !== status)) return false;
      if (taskId && s.taskId != taskId) return false;
      if (practice && t.companyId) return false;
      if (flagged && !(s.integrity.flags.length && !s.integrity.clearedAt)) return false;
      return true;
    }).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map(s => enrichSub(d, s, u));
  },
  score(id, { breakdown, feedback, suggestions = [], authenticity = 'not_checked', authenticityNote = '', strengths = '', weaknesses = '', recommendation = '' }) {
    const u = requireUser(['hr', 'interviewer', 'admin']);
    return tx(d => {
      const s = d.submissions.find(x => x.id === id); if (!s) throw new URError('Submission not found.', 'not_found');
      const t = taskOf(d, s.taskId);
      if (u.role !== 'admin' && t.companyId !== u.orgId) throw new URError('You can only score your company\'s submissions.', 'forbidden');
      if (s.status === 'void') throw new URError('This submission was voided by moderation.', 'state');
      if (s.score && u.role !== 'admin') throw new URError('This submission has already been scored. Disputes are handled by Unresume admins.', 'state');
      if (!Array.isArray(breakdown) || breakdown.length !== t.rubric.length) throw new URError('Score every rubric criterion.', 'validation');
      const bd = t.rubric.map((r, i) => {
        const v = breakdown[i].awarded;
        if (v === '' || v == null || isNaN(v)) throw new URError(`Enter a score for "${r.criterion}".`, 'validation');
        const n = Number(v); if (n < 0 || n > r.points || !Number.isInteger(n)) throw new URError(`"${r.criterion}" must be a whole number from 0 to ${r.points}.`, 'validation');
        return { criterion: r.criterion, max: r.points, awarded: n, comment: String(breakdown[i].comment || '').trim() };
      });
      if (String(feedback || '').trim().length < 20) throw new URError('Write at least a sentence of overall feedback (20+ characters) — candidates rely on it.', 'validation');
      const total = bd.reduce((a, b) => a + b.awarded, 0);
      const prevTotal = s.score ? s.score.total : null;
      if (!['not_checked', 'verified', 'walkthrough', 'concern'].includes(authenticity)) throw new URError('Invalid authenticity status.', 'validation');
      if (authenticity === 'concern' && String(authenticityNote).trim().length < 10) throw new URError('Describe the authenticity concern (10+ characters). It is sent to Unresume moderators, not used to auto-penalise.', 'validation');
      if (recommendation && !['strong_yes', 'yes', 'no'].includes(recommendation)) throw new URError('Invalid recommendation.', 'validation');
      const review = { total, breakdown: bd, feedback: feedback.trim(), suggestions: suggestions.map(x => x.trim()).filter(Boolean), reviewerId: u.id, scoredAt: nowISO(), authenticity, authenticityNote: String(authenticityNote).trim(),
        strengths: String(strengths).trim().slice(0, 1000), weaknesses: String(weaknesses).trim().slice(0, 1000), recommendation: recommendation || null };
      // Dual review: the first review is held until an independent second reviewer scores.
      if (t.dualReview && !s.score) {
        s.reviews = s.reviews || [];
        if (s.reviews.some(r => r.reviewerId === u.id)) throw new URError('This task needs an independent second reviewer — a different team member must score it.', 'dual_review');
        s.reviews.push(clone(review)); // keep each reviewer's own record untouched
        if (s.reviews.length < 2) {
          (s.reviewLog = s.reviewLog || []).push({ at: nowISO(), by: u.id, action: 'first_review', total });
          notify(d, (t.companyId ? orgMembers(d, t.companyId, ['hr', 'interviewer']) : admins(d)).filter(x => x !== u.id), 'review', `Second review needed: ${d.candidates[s.candidate].name} · ${t.title}`, `interviewer-dashboard.html?sub=${s.id}`);
          audit(d, 'submission.first_review', s.id, String(total));
          return clone(s);
        }
        const [r1, r2] = s.reviews;
        const avg = Math.round((r1.total + r2.total) / 2);
        review.total = avg;
        review.breakdown = r1.breakdown.map((b, i) => ({ ...b, awarded: Math.round((b.awarded + r2.breakdown[i].awarded) / 2), comment: [b.comment, r2.breakdown[i].comment].filter(Boolean).join(' / ') }));
        review.feedback = r2.feedback + (r1.feedback && r1.feedback !== r2.feedback ? '\n\nFirst reviewer: ' + r1.feedback : '');
        review.suggestions = [...new Set([...r1.suggestions, ...r2.suggestions])];
        review.dual = { totals: [r1.total, r2.total], reviewers: [r1.reviewerId, r2.reviewerId], gap: Math.abs(r1.total - r2.total) };
        if (review.dual.gap > d.settings.dualReviewGap) { s.integrity.flags.push({ type: 'review_gap', severity: 'medium', detail: `Reviewers differed by ${review.dual.gap} points (${r1.total} vs ${r2.total}). Score is the average; please check.` }); delete s.integrity.clearedAt; notify(d, admins(d), 'integrity', `Dual review disagreement on ${t.title}`, 'admin-moderation.html?tab=integrity'); }
      }
      s.score = review;
      const total2 = review.total;
      (s.reviewLog = s.reviewLog || []).push({ at: nowISO(), by: u.id, action: 'scored', total: total2, authenticity });
      if (authenticity === 'concern') { s.integrity.flags.push({ type: 'reviewer_concern', severity: 'medium', detail: 'Reviewer concern: ' + String(authenticityNote).trim() }); delete s.integrity.clearedAt; notify(d, admins(d), 'integrity', `Reviewer raised an authenticity concern on ${t.title}`, 'admin-moderation.html?tab=integrity'); }
      s.status = 'scored';
      const cUid = candUserId(d, s.candidate);
      const app = d.applications.find(a => a.submissionId === s.id);
      if (app && ['submitted', 'in_progress', 'under_review'].includes(app.status)) { app.status = 'scored'; app.updatedAt = nowISO(); app.history.push({ status: 'scored', at: nowISO(), by: u.id, note: `Verified score ${total2}/100` }); }
      notify(d, cUid, 'score', `Your "${t.title}" was scored ${total2}/100`, `assessments.html?id=${s.id}`);
      if (app && app.referredBy) notify(d, orgMembers(d, app.referredBy, ['academy']), 'referral', `${d.candidates[s.candidate].name} scored ${total2}/100 on ${t.title}`, 'academy-reports.html');
      if (prevTotal == null) feed(d, s.candidate, 'score', `earned a verified ${total2}/100 on ${t.title}`, `candidate-profile.html?u=${s.candidate}`, { score: total2 });
      audit(d, prevTotal == null ? 'submission.score' : 'submission.rescore', s.id, `${prevTotal ?? '—'} → ${total2}`);
      return clone(s);
    });
  },
  // Reviewer opened the submission: candidate sees "Under review".
  markInReview(id) {
    const u = me(); if (!u || !['hr', 'interviewer', 'admin'].includes(u.role)) return;
    const d0 = load(), s0 = d0.submissions.find(x => x.id === id); if (!s0 || s0.status !== 'pending' || s0.reviewStartedAt) return;
    const t0 = taskOf(d0, s0.taskId); if (u.role !== 'admin' && t0.companyId !== u.orgId) return;
    tx(d => {
      const s = d.submissions.find(x => x.id === id); s.reviewStartedAt = nowISO(); s.reviewStartedBy = u.id;
      const app = d.applications.find(a => a.submissionId === id);
      if (app && app.status === 'submitted') { app.status = 'under_review'; app.updatedAt = nowISO(); app.history.push({ status: 'under_review', at: nowISO(), by: u.id, note: '' }); notify(d, candUserId(d, s.candidate), 'application', `Your ${taskOf(d, s.taskId).title} is now being reviewed`, 'my-applications.html'); }
    });
  },
  clearIntegrity(id, note) {
    const u = requireUser(['admin', 'hr', 'interviewer']);
    tx(d => { const s = d.submissions.find(x => x.id === id); if (!s) throw new URError('Not found', 'not_found'); s.integrity.clearedAt = nowISO(); s.integrity.clearedBy = u.id; s.integrity.clearNote = note || ''; audit(d, 'integrity.clear', id, note || ''); });
  },
  void(id, reason) {
    const u = requireUser(['admin']);
    if (!String(reason || '').trim()) throw new URError('Give a reason — the candidate will see it.', 'validation');
    tx(d => {
      const s = d.submissions.find(x => x.id === id); if (!s) throw new URError('Not found', 'not_found');
      s.status = 'void'; s.voidReason = reason.trim(); s.voidedAt = nowISO(); s.voidedBy = u.id;
      const app = d.applications.find(a => a.submissionId === s.id);
      if (app && !['hired', 'withdrawn'].includes(app.status)) { app.status = 'rejected'; app.updatedAt = nowISO(); app.history.push({ status: 'rejected', at: nowISO(), by: u.id, note: 'Submission voided by Unresume moderation' }); }
      const t = taskOf(d, s.taskId);
      notify(d, candUserId(d, s.candidate), 'score', `Your submission for "${t.title}" was voided by moderation`, `assessments.html?id=${s.id}`);
      if (t.companyId) notify(d, orgMembers(d, t.companyId, ['hr', 'interviewer']), 'moderation', `A submission for ${t.title} was voided by Unresume moderation`, '');
      audit(d, 'submission.void', id, reason);
    });
  },
};

/* ═══ applications & interviews ═══════════════════════════════════════════ */
const ALLOWED_MOVES = {
  scored: ['shortlisted', 'rejected'], submitted: ['rejected'], under_review: ['rejected'], shortlisted: ['interview', 'offer', 'rejected', 'scored'],
  interview: ['offer', 'rejected', 'shortlisted'], offer: ['hired', 'rejected', 'interview'], hired: [], rejected: ['shortlisted'],
};
function enrichApp(d, a) {
  const job = d.jobs.find(j => j.id === a.jobId);
  const c = d.candidates[a.candidate] || {};
  const s = a.submissionId ? d.submissions.find(x => x.id === a.submissionId) : null;
  const ivs = d.interviews.filter(i => i.applicationId === a.id);
  const st = computeStats(d, a.candidate);
  return { ...clone(a), job: job ? enrichJob(d, job) : null, candidateName: c.name, candidateSkills: c.skills, candidateUserId: c.userId, identityVerified: c.verification && c.verification.identity === 'verified',
    taskScore: hasScore(s) ? s.score.total : null, submission: s ? { id: s.id, status: s.status, submittedAt: s.submittedAt, flags: s.integrity.flags.length, cleared: !!s.integrity.clearedAt } : null,
    skillScore: st.skillScore, tasksVerified: st.tasksVerified, interviews: clone(ivs), academyName: a.referredBy ? (d.academies.find(x => x.id === a.referredBy) || {}).name : null };
}
function setAppStatus(d, app, status, by, note = '') {
  app.status = status; app.updatedAt = nowISO(); app.history.push({ status, at: nowISO(), by, note });
  const job = d.jobs.find(j => j.id === app.jobId), co = d.companies.find(c => c.id === job.companyId);
  const msg = { shortlisted: `You were shortlisted for ${job.title} at ${co.name}`, interview: `${co.name} moved you to the interview stage for ${job.title}`, offer: `🎉 ${co.name} made you an offer for ${job.title}`, hired: `Congratulations — you were hired as ${job.title} at ${co.name}`, rejected: `${co.name} decided not to proceed with your ${job.title} application`, scored: `Your ${job.title} application is back under consideration` }[status];
  if (msg) notify(d, candUserId(d, app.candidate), 'application', msg, 'my-applications.html');
  if (app.referredBy && ['shortlisted', 'offer', 'hired', 'rejected'].includes(status)) notify(d, orgMembers(d, app.referredBy, ['academy']), 'referral', `${d.candidates[app.candidate].name}: ${APP_STATUS[status].label} at ${co.name}`, 'placements.html');
  const st = d.students.find(s => s.candidate === app.candidate);
  const ref = st && d.referrals.find(r => r.studentId === st.id && r.jobId === app.jobId);
  if (ref) ref.status = status === 'hired' ? 'placed' : status === 'rejected' ? 'rejected' : 'applied';
  if (status === 'hired') {
    feed(d, app.candidate, 'hired', `was hired as ${job.title} at ${co.name}`, `candidate-profile.html?u=${app.candidate}`);
    if (st && !d.placements.some(p => p.studentId === st.id && p.companyId === co.id)) {
      d.placements.push({ id: uid('pl'), academyId: st.academyId, studentId: st.id, candidate: app.candidate, companyId: co.id, jobId: job.id, role: job.title, placedAt: nowISO(), salary: '', visible: true, source: 'application' });
      st.status = 'Placed'; convertStudentId(d, st);
      notify(d, orgMembers(d, st.academyId, ['academy']), 'placement', `${st.name} was hired by ${co.name}`, 'placements.html');
    }
  }
}
const applications = {
  list({ jobId, candidate, status, companyId } = {}) {
    const d = load(), u = me(); if (!u) return [];
    return d.applications.filter(a => {
      const job = d.jobs.find(j => j.id === a.jobId); if (!job) return false;
      if (u.role === 'candidate' && a.candidate !== u.username) return false;
      if (['hr', 'interviewer'].includes(u.role) && (job.companyId !== u.orgId || a.status === 'in_progress')) return false;
      if (u.role === 'academy') { const st = d.students.find(s => s.candidate === a.candidate && s.academyId === u.orgId); if (!st) return false; }
      if (jobId && a.jobId != jobId) return false;
      if (candidate && a.candidate !== candidate) return false;
      if (companyId && job.companyId !== companyId) return false;
      if (status && (Array.isArray(status) ? !status.includes(a.status) : a.status !== status)) return false;
      return true;
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(a => enrichApp(d, a));
  },
  get(id) { const r = applications.list().find(a => a.id === id); return r || null; },
  forJob(jobId) { const u = me(); return u && u.role === 'candidate' ? (applications.list({ jobId })[0] || null) : null; },
  move(id, status, note = '') {
    const u = requireUser(['hr', 'interviewer']);
    return tx(d => {
      const app = d.applications.find(a => a.id === id); if (!app) throw new URError('Application not found.', 'not_found');
      const job = d.jobs.find(j => j.id === app.jobId);
      if (job.companyId !== u.orgId) throw new URError('Not your company\'s application.', 'forbidden');
      if (u.role === 'interviewer' && !['shortlisted', 'rejected'].includes(status)) throw new URError('Only HR can move candidates to interview, offer or hired.', 'forbidden');
      if (app.status === status) return clone(app);
      if (!(ALLOWED_MOVES[app.status] || []).includes(status)) throw new URError(`Can't move from ${APP_STATUS[app.status].label} to ${APP_STATUS[status].label}.`, 'state');
      if (status === 'shortlisted' && app.status === 'submitted') throw new URError('Score the submission before shortlisting.', 'state');
      setAppStatus(d, app, status, u.id, note);
      audit(d, 'application.move', app.id, `${status}${note ? ': ' + note : ''}`);
      return clone(app);
    });
  },
  withdraw(id, reason = '') {
    const u = requireUser(['candidate']);
    tx(d => {
      const app = d.applications.find(a => a.id === id && a.candidate === u.username); if (!app) throw new URError('Application not found.', 'not_found');
      if (['hired', 'withdrawn', 'rejected'].includes(app.status)) throw new URError('This application can no longer be withdrawn.', 'state');
      app.status = 'withdrawn'; app.updatedAt = nowISO(); app.history.push({ status: 'withdrawn', at: nowISO(), by: u.id, note: reason });
      d.interviews.filter(i => i.applicationId === id && ['proposed', 'confirmed', 'reschedule'].includes(i.status)).forEach(i => { i.status = 'cancelled'; i.cancelReason = 'Candidate withdrew'; });
      const att = d.attempts.find(a => a.applicationId === id && a.status === 'active'); if (att) att.status = 'withdrawn';
      const job = d.jobs.find(j => j.id === app.jobId);
      notify(d, orgMembers(d, job.companyId, ['hr']), 'application', `${d.candidates[u.username].name} withdrew from ${job.title}`, 'hr-applications.html');
      audit(d, 'application.withdraw', id, reason);
    });
  },
};
const interviews = {
  list({ candidate, applicationId, upcoming } = {}) {
    const d = load(), u = me(); if (!u) return [];
    return d.interviews.filter(i => {
      if (u.role === 'candidate' && i.candidate !== u.username) return false;
      if (['hr', 'interviewer'].includes(u.role) && i.companyId !== u.orgId) return false;
      if (u.role === 'academy') return false;
      if (candidate && i.candidate !== candidate) return false;
      if (applicationId && i.applicationId !== applicationId) return false;
      if (upcoming && (new Date(i.scheduledAt) < Date.now() - HOUR || ['cancelled', 'completed'].includes(i.status))) return false;
      return true;
    }).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).map(i => {
      const app = d.applications.find(a => a.id === i.applicationId), job = app && d.jobs.find(j => j.id === app.jobId);
      const iv = d.users.find(x => x.id === i.interviewerId), co = d.companies.find(c => c.id === i.companyId);
      return { ...clone(i), candidateName: (d.candidates[i.candidate] || {}).name, jobTitle: job ? job.title : '', jobId: job ? job.id : null, interviewerName: iv ? iv.name : 'Unassigned', companyName: co ? co.name : '', companyLogo: co ? co.logo : '' };
    });
  },
  schedule({ applicationId, stage, scheduledAt, durationMin = 45, mode = 'Video call', location = '', interviewerId = '', notes = '' }) {
    const u = requireUser(['hr']);
    if (!String(stage || '').trim()) throw new URError('Name the interview stage.', 'validation');
    if (!scheduledAt || isNaN(new Date(scheduledAt))) throw new URError('Pick a date and time.', 'validation');
    if (new Date(scheduledAt) < new Date()) throw new URError('The interview time must be in the future.', 'validation');
    return tx(d => {
      const app = d.applications.find(a => a.id === applicationId); if (!app) throw new URError('Application not found.', 'not_found');
      const job = d.jobs.find(j => j.id === app.jobId); if (job.companyId !== u.orgId) throw new URError('Not your company\'s application.', 'forbidden');
      if (!['shortlisted', 'interview', 'offer'].includes(app.status)) throw new URError('Shortlist the candidate before scheduling an interview.', 'state');
      if (interviewerId && !d.users.some(x => x.id === interviewerId && x.orgId === u.orgId)) throw new URError('Interviewer must be on your team.', 'validation');
      const clash = interviewerId && d.interviews.find(i => i.interviewerId === interviewerId && ['proposed', 'confirmed'].includes(i.status) && Math.abs(new Date(i.scheduledAt) - new Date(scheduledAt)) < Math.max(i.durationMin, durationMin) * MIN);
      if (clash) throw new URError('That interviewer already has an interview at this time.', 'conflict');
      const iv = { id: uid('iv'), applicationId, candidate: app.candidate, companyId: u.orgId, stage: stage.trim(), scheduledAt: new Date(scheduledAt).toISOString(), durationMin: +durationMin, mode, location: location.trim(), interviewerId: interviewerId || null, status: 'proposed', notes: notes.trim(), createdBy: u.id, createdAt: nowISO(), feedback: '' };
      d.interviews.push(iv);
      if (app.status === 'shortlisted') setAppStatus(d, app, 'interview', u.id, iv.stage);
      notify(d, candUserId(d, app.candidate), 'interview', `${d.companies.find(c => c.id === u.orgId).name} proposed a ${iv.stage} — please confirm`, 'candidate-interviews.html');
      if (interviewerId && interviewerId !== u.id) notify(d, interviewerId, 'interview', `You're interviewing ${d.candidates[app.candidate].name} (${iv.stage})`, 'hr-interviews.html');
      audit(d, 'interview.schedule', iv.id, `${app.candidate} · ${iv.stage}`);
      return clone(iv);
    });
  },
  respond(id, action, note = '') {
    const u = requireUser(['candidate']);
    tx(d => {
      const iv = d.interviews.find(i => i.id === id && i.candidate === u.username); if (!iv) throw new URError('Interview not found.', 'not_found');
      if (!['proposed', 'confirmed', 'reschedule'].includes(iv.status)) throw new URError('This interview can no longer be changed.', 'state');
      if (action === 'confirm') iv.status = 'confirmed';
      else if (action === 'reschedule') { if (!note.trim()) throw new URError('Suggest times that work for you.', 'validation'); iv.status = 'reschedule'; iv.candidateNote = note.trim(); }
      else throw new URError('Unknown action.', 'validation');
      iv.respondedAt = nowISO();
      const name = d.candidates[u.username].name;
      notify(d, [iv.createdBy, iv.interviewerId].filter((x, i, arr) => x && arr.indexOf(x) === i), 'interview', action === 'confirm' ? `${name} confirmed the ${iv.stage}` : `${name} asked to reschedule the ${iv.stage}`, 'hr-interviews.html');
      audit(d, `interview.${action}`, id, note);
    });
  },
  update(id, { scheduledAt, durationMin, mode, location, interviewerId, stage }) {
    const u = requireUser(['hr']);
    tx(d => {
      const iv = d.interviews.find(i => i.id === id && i.companyId === u.orgId); if (!iv) throw new URError('Interview not found.', 'not_found');
      if (['completed', 'cancelled'].includes(iv.status)) throw new URError('This interview is closed.', 'state');
      if (scheduledAt) { if (new Date(scheduledAt) < new Date()) throw new URError('The interview time must be in the future.', 'validation'); iv.scheduledAt = new Date(scheduledAt).toISOString(); }
      if (durationMin) iv.durationMin = +durationMin; if (mode) iv.mode = mode; if (location != null) iv.location = location; if (interviewerId !== undefined) iv.interviewerId = interviewerId || null; if (stage) iv.stage = stage;
      iv.status = 'proposed';
      notify(d, candUserId(d, iv.candidate), 'interview', `${iv.stage} was rescheduled — please confirm the new time`, 'candidate-interviews.html');
      audit(d, 'interview.update', id);
    });
  },
  complete(id, { feedback, outcome }) {
    const u = requireUser(['hr', 'interviewer']);
    if (String(feedback || '').trim().length < 10) throw new URError('Add interview feedback (10+ characters).', 'validation');
    if (!['pass', 'fail', 'hold'].includes(outcome)) throw new URError('Choose an outcome.', 'validation');
    tx(d => {
      const iv = d.interviews.find(i => i.id === id && i.companyId === u.orgId); if (!iv) throw new URError('Interview not found.', 'not_found');
      if (iv.status === 'cancelled') throw new URError('This interview was cancelled.', 'state');
      iv.status = 'completed'; iv.feedback = feedback.trim(); iv.outcome = outcome; iv.completedAt = nowISO(); iv.completedBy = u.id;
      notify(d, orgMembers(d, iv.companyId, ['hr']).filter(x => x !== u.id), 'interview', `Feedback submitted for ${d.candidates[iv.candidate].name} (${iv.stage}): ${outcome}`, 'hr-interviews.html');
      audit(d, 'interview.complete', id, outcome);
    });
  },
  cancel(id, reason) {
    const u = requireUser(['hr']);
    if (!String(reason || '').trim()) throw new URError('Give the candidate a reason.', 'validation');
    tx(d => {
      const iv = d.interviews.find(i => i.id === id && i.companyId === u.orgId); if (!iv) throw new URError('Interview not found.', 'not_found');
      iv.status = 'cancelled'; iv.cancelReason = reason.trim();
      notify(d, candUserId(d, iv.candidate), 'interview', `${iv.stage} was cancelled: ${reason.trim()}`, 'candidate-interviews.html');
      audit(d, 'interview.cancel', id, reason);
    });
  },
};

/* ═══ disputes, reports, contact, verification ════════════════════════════ */
const disputes = {
  list({ status } = {}) {
    const d = load(), u = me(); if (!u) return [];
    return d.disputes.filter(x => (u.role === 'admin' || x.candidate === u.username) && (!status || x.status === status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(x => ({ ...clone(x), candidateName: (d.candidates[x.candidate] || {}).name, submission: enrichSub(d, d.submissions.find(s => s.id === x.submissionId), u) }));
  },
  open(submissionId, reason, details) {
    const u = requireUser(['candidate']);
    if (!reason) throw new URError('Choose a reason.', 'validation');
    if (String(details || '').trim().length < 30) throw new URError('Explain the issue in at least 30 characters, referring to the rubric where possible.', 'validation');
    return tx(d => {
      const s = d.submissions.find(x => x.id === submissionId && x.candidate === u.username); if (!s) throw new URError('Submission not found.', 'not_found');
      const isAppeal = s.status === 'void';
      if (s.status !== 'scored' && !isAppeal) throw new URError('Only scored or voided submissions can be disputed.', 'state');
      if (isAppeal && Date.now() - new Date(s.voidedAt || 0) > 30 * DAY) throw new URError('Integrity appeals must be raised within 30 days.', 'state');
      if (d.disputes.some(x => x.submissionId === submissionId && ['open', 'under_review'].includes(x.status))) throw new URError('You already have an open dispute for this submission.', 'duplicate');
      if (d.disputes.filter(x => x.submissionId === submissionId).length >= 1 && d.disputes.some(x => x.submissionId === submissionId && x.status !== 'open')) throw new URError('This score has already been reviewed after a dispute.', 'state');
      if (!isAppeal && Date.now() - new Date(s.score.scoredAt) > 30 * DAY) throw new URError('Disputes must be raised within 30 days of scoring.', 'state');
      const x = { id: uid('dsp'), kind: isAppeal ? 'integrity' : 'score', submissionId, candidate: u.username, reason, details: details.trim(), status: 'open', createdAt: nowISO(), resolution: '', resolvedAt: null, resolvedBy: null, originalScore: s.score ? s.score.total : null };
      d.disputes.push(x); if (!isAppeal) s.status = 'disputed';
      notify(d, admins(d), 'dispute', `New score dispute from ${d.candidates[u.username].name}`, 'admin-disputes.html');
      audit(d, 'dispute.open', x.id, submissionId);
      return clone(x);
    });
  },
  resolve(id, { decision, note, newScore }) {
    const u = requireUser(['admin']);
    if (!['upheld', 'adjusted', 'rejected', 'voided', 'reinstated'].includes(decision)) throw new URError('Choose a decision.', 'validation');
    if (String(note || '').trim().length < 10) throw new URError('Write a resolution note for the candidate.', 'validation');
    tx(d => {
      const x = d.disputes.find(y => y.id === id); if (!x) throw new URError('Dispute not found.', 'not_found');
      if (!['open', 'under_review'].includes(x.status)) throw new URError('Already resolved.', 'state');
      const s = d.submissions.find(y => y.id === x.submissionId), t = taskOf(d, s.taskId);
      if (decision === 'adjusted') {
        const n = Number(newScore); if (!Number.isInteger(n) || n < 0 || n > 100) throw new URError('New score must be a whole number 0–100.', 'validation');
        if (n === s.score.total) throw new URError('The new score is the same as the original.', 'validation');
        s.score.adjustedFrom = s.score.total; s.score.total = n; s.score.adjustedBy = u.id; s.score.adjustedAt = nowISO(); s.score.adjustNote = note.trim();
        s.status = 'scored';
      } else if (decision === 'voided') { s.status = 'void'; s.voidReason = note.trim(); s.voidedAt = nowISO(); }
      else if (decision === 'reinstated') {
        if (s.status !== 'void') throw new URError('Only voided submissions can be reinstated.', 'state');
        s.status = s.score ? 'scored' : 'pending'; s.reinstatedAt = nowISO(); s.integrity.clearedAt = nowISO(); s.integrity.clearedBy = u.id; s.integrity.clearNote = 'Appeal upheld: ' + note.trim();
        const app = d.applications.find(a => a.submissionId === s.id);
        if (app && app.status === 'rejected') { app.status = s.score ? 'scored' : 'submitted'; app.updatedAt = nowISO(); app.history.push({ status: app.status, at: nowISO(), by: u.id, note: 'Reinstated after integrity appeal' }); }
      }
      else if (s.status !== 'void') s.status = 'scored';
      x.status = decision === 'rejected' || decision === 'upheld' ? 'rejected' : 'resolved'; x.decision = decision; x.resolution = note.trim(); x.resolvedAt = nowISO(); x.resolvedBy = u.id;
      const label = { reinstated: 'submission reinstated', upheld: x.kind === 'integrity' ? 'void decision upheld' : 'original score upheld', rejected: x.kind === 'integrity' ? 'void decision upheld' : 'original score upheld', adjusted: `score adjusted to ${newScore}/100`, voided: 'submission voided' }[decision];
      notify(d, candUserId(d, x.candidate), 'score', `Your dispute on "${t.title}" was reviewed — ${label}`, `assessments.html?id=${s.id}`);
      if (t.companyId && decision !== 'rejected' && decision !== 'upheld') notify(d, orgMembers(d, t.companyId, ['hr', 'interviewer']), 'moderation', `Unresume ${label} for ${d.candidates[x.candidate].name} on ${t.title}`, '');
      audit(d, 'dispute.resolve', id, `${decision}: ${note}`);
    });
  },
  markReviewing(id) { requireUser(['admin']); tx(d => { const x = d.disputes.find(y => y.id === id); if (x && x.status === 'open') { x.status = 'under_review'; audit(d, 'dispute.review', id); } }); },
};
const reports = {
  create({ type, targetId, targetLabel, reason, details }) {
    const u = requireUser();
    if (!reason) throw new URError('Choose a reason.', 'validation');
    return tx(d => {
      if (d.reports.some(r => r.reporter === u.id && r.type === type && String(r.targetId) === String(targetId) && r.status === 'open')) throw new URError('You have already reported this. Our team is reviewing it.', 'duplicate');
      const r = { id: uid('rep'), type, targetId, targetLabel: targetLabel || '', reporter: u.id, reason, details: String(details || '').trim(), status: 'open', createdAt: nowISO() };
      d.reports.push(r);
      notify(d, admins(d), 'report', `New ${type} report: ${reason}`, 'admin-disputes.html?tab=reports');
      audit(d, 'report.create', r.id, `${type}:${targetId}`);
      return clone(r);
    });
  },
  list({ status } = {}) { requireUser(['admin']); const d = load(); return clone(d.reports.filter(r => !status || r.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))).map(r => ({ ...r, reporterName: (d.users.find(u => u.id === r.reporter) || {}).name || 'Unknown' })); },
  resolve(id, status, note) { requireUser(['admin']); if (!['resolved', 'dismissed'].includes(status)) throw new URError('Invalid status', 'validation'); tx(d => { const r = d.reports.find(x => x.id === id); r.status = status; r.resolution = note || ''; r.resolvedAt = nowISO(); notify(d, r.reporter, 'report', `Your report was ${status === 'resolved' ? 'actioned' : 'reviewed and closed'}`, ''); audit(d, `report.${status}`, id, note || ''); }); },
};
const contact = {
  create({ name, email, topic, message }) {
    required({ name, email, message }, [['name', 'Name'], ['email', 'Email'], ['message', 'Message']]);
    if (!validEmail(email)) throw new URError('Enter a valid email address.', 'validation');
    if (String(message).trim().length < 10) throw new URError('Message is too short.', 'validation');
    return tx(d => { const m = { id: uid('msg'), name: name.trim(), email: email.trim(), topic: topic || 'General Inquiry', message: message.trim(), status: 'open', createdAt: nowISO() }; d.contact.push(m); notify(d, admins(d), 'contact', `Contact form: ${m.topic} from ${m.name}`, 'admin-disputes.html?tab=contact'); return clone(m); });
  },
  list() { requireUser(['admin']); return clone(load().contact).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  close(id) { requireUser(['admin']); tx(d => { const m = d.contact.find(x => x.id === id); m.status = 'closed'; m.closedAt = nowISO(); audit(d, 'contact.close', id); }); },
};
const verifications = {
  list({ status = 'pending' } = {}) { requireUser(['admin']); return clone(load().verifications.filter(v => !status || v.status === status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  mine() { const u = me(); if (!u) return []; const target = u.role === 'candidate' ? u.username : u.orgId; return clone(load().verifications.filter(v => v.targetId === target)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  decide(id, approve, note) {
    requireUser(['admin']);
    if (!approve && !String(note || '').trim()) throw new URError('Explain why verification was rejected.', 'validation');
    tx(d => {
      const v = d.verifications.find(x => x.id === id); if (!v || v.status !== 'pending') throw new URError('Request not found or already decided.', 'state');
      v.status = approve ? 'approved' : 'rejected'; v.note = note || ''; v.decidedAt = nowISO();
      const result = approve ? 'verified' : 'rejected';
      if (v.kind === 'company') { const o = d.companies.find(x => x.id === v.targetId); o.verification = result; if (approve) o.verifiedAt = nowISO(); notify(d, orgMembers(d, o.id), 'verification', approve ? `${o.name} is now verified — you can publish jobs` : `Verification for ${o.name} was rejected: ${note}`, 'company-profile.html'); }
      if (v.kind === 'academy') { const o = d.academies.find(x => x.id === v.targetId); o.verification = result; if (approve) o.verifiedAt = nowISO(); notify(d, orgMembers(d, o.id), 'verification', approve ? `${o.name} is now verified` : `Verification for ${o.name} was rejected: ${note}`, 'settings.html'); }
      if (v.kind === 'identity') { const c = d.candidates[v.targetId]; c.verification.identity = approve ? 'verified' : 'none'; notify(d, c.userId, 'verification', approve ? 'Your identity is verified — a verified badge now shows on your profile' : `Identity verification was rejected: ${note}`, 'settings.html'); }
      audit(d, approve ? 'verification.approve' : 'verification.reject', v.targetId, note || '');
    });
  },
};

/* ═══ notifications & messages ════════════════════════════════════════════ */
const notifications = {
  list(limit) { const u = me(); if (!u) return []; const l = load().notifications.filter(n => n.to === u.id); return clone(limit ? l.slice(0, limit) : l); },
  unread() { const u = me(); return u ? load().notifications.filter(n => n.to === u.id && !n.read).length : 0; },
  markRead(id) { const u = me(); if (!u) return; tx(d => { const n = d.notifications.find(x => x.id === id && x.to === u.id); if (n) n.read = true; }); },
  markAllRead() { const u = me(); if (!u) return; tx(d => d.notifications.forEach(n => { if (n.to === u.id) n.read = true; })); },
};
function convView(d, c, u) {
  const otherId = c.participants.find(p => p !== u.id);
  const other = d.users.find(x => x.id === otherId) || { name: 'Deleted user' };
  const meta = (c.meta && c.meta[u.id]) || {};
  const cleared = meta.clearedAt ? new Date(meta.clearedAt) : null;
  const msgs = c.messages.filter(m => !cleared || new Date(m.at) > cleared);
  const readAt = c.readAt && c.readAt[u.id] ? new Date(c.readAt[u.id]) : new Date(0);
  const org = other.orgId ? (d.companies.find(x => x.id === other.orgId) || d.academies.find(x => x.id === other.orgId)) : null;
  const roleLabel = other.role === 'candidate' ? 'Candidate' : `${ROLES[other.role] ? ROLES[other.role].label : ''}${org ? ' · ' + org.name : ''}`;
  const blockedByThem = !!(c.meta && c.meta[otherId] && c.meta[otherId].blocked);
  const otherReadAt = c.readAt && c.readAt[otherId] ? c.readAt[otherId] : null;
  return { id: c.id, otherReadAt, otherId, otherName: other.name, otherRole: other.role, otherUsername: other.username || null, roleLabel, messages: clone(msgs), pinned: !!meta.pinned, muted: !!meta.muted, blocked: !!meta.blocked, blockedByThem,
    unread: msgs.filter(m => m.from !== u.id && new Date(m.at) > readAt).length + (meta.markedUnread ? 1 : 0), lastAt: msgs.length ? msgs[msgs.length - 1].at : c.createdAt };
}
function canMessage(d, from, to) {
  if (from.role === 'admin' || to.role === 'admin') return true;
  if (to.role === 'candidate') {
    const c = d.candidates[to.username]; const pref = c ? c.privacy.allowMessages : 'companies';
    if (pref === 'none') return false;
    if (from.role === 'candidate') return pref === 'everyone' && d.settings.allowCandidateChat;
    return true;
  }
  return true;
}
const messages = {
  list() { const u = me(); if (!u) return []; const d = load(); return d.conversations.filter(c => c.participants.includes(u.id)).map(c => convView(d, c, u)).sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastAt) - new Date(a.lastAt))); },
  unread() { return messages.list().reduce((a, c) => a + (c.muted ? 0 : c.unread), 0); },
  get(id) { const u = me(); const d = load(); const c = d.conversations.find(x => x.id === id && u && x.participants.includes(u.id)); return c ? convView(d, c, u) : null; },
  contacts(q = '') {
    const u = me(); if (!u) return []; const d = load();
    const ql = q.toLowerCase();
    return d.users.filter(x => x.id !== u.id && x.status === 'active' && x.role !== 'admin' && canMessage(d, u, x))
      .filter(x => u.role !== 'candidate' || x.role !== 'academy')
      .filter(x => !ql || x.name.toLowerCase().includes(ql) || (x.role === 'candidate' && (d.candidates[x.username] || { skills: [] }).skills.some(s => s.toLowerCase().includes(ql))))
      .map(x => { const org = x.orgId ? (d.companies.find(o => o.id === x.orgId) || d.academies.find(o => o.id === x.orgId)) : null; return { id: x.id, name: x.name, role: x.role, sub: x.role === 'candidate' ? (d.candidates[x.username] || { skills: [] }).skills.slice(0, 2).join(', ') : `${ROLES[x.role].label}${org ? ' · ' + org.name : ''}` }; })
      .slice(0, 50);
  },
  start(otherId) {
    const u = requireUser();
    return tx(d => {
      const other = d.users.find(x => x.id === otherId); if (!other || other.status !== 'active') throw new URError('User not found.', 'not_found');
      let c = d.conversations.find(x => x.participants.includes(u.id) && x.participants.includes(otherId));
      if (c) return c.id;
      if (!canMessage(d, u, other)) throw new URError(`${other.name} isn't accepting new messages${other.role === 'candidate' ? ' (privacy settings)' : ''}.`, 'privacy');
      c = { id: uid('conv'), participants: [u.id, otherId], messages: [], meta: {}, readAt: {}, createdAt: nowISO() };
      d.conversations.push(c);
      return c.id;
    });
  },
  send(convId, text) {
    const u = requireUser();
    const body = String(text || '').trim();
    if (!body) throw new URError('Message is empty.', 'validation');
    if (body.length > 4000) throw new URError('Message is too long (max 4000 characters).', 'validation');
    return tx(d => {
      const c = d.conversations.find(x => x.id === convId && x.participants.includes(u.id)); if (!c) throw new URError('Conversation not found.', 'not_found');
      const otherId = c.participants.find(p => p !== u.id);
      if (c.meta[u.id] && c.meta[u.id].blocked) throw new URError('Unblock this person to send messages.', 'blocked');
      if (c.meta[otherId] && c.meta[otherId].blocked) throw new URError("You can't message this person.", 'blocked');
      const m = { id: uid('m'), from: u.id, text: body, at: nowISO() };
      c.messages.push(m); c.readAt = c.readAt || {}; c.readAt[u.id] = m.at;
      if (!(c.meta[otherId] && c.meta[otherId].muted)) {
        const recent = d.notifications.find(n => n.to === otherId && n.type === 'message' && !n.read && n.link === `chat.html?c=${c.id}`);
        if (!recent) notify(d, otherId, 'message', `New message from ${u.name}`, `chat.html?c=${c.id}`);
      }
      return clone(m);
    });
  },
  markRead(convId) { const u = me(); if (!u) return; const d = load(); const c = d.conversations.find(x => x.id === convId); if (!c) return; const meta = (c.meta[u.id] || {}); const last = c.messages.length ? c.messages[c.messages.length - 1].at : null; if ((!last || (c.readAt[u.id] === last)) && !meta.markedUnread) return; tx(dd => { const cc = dd.conversations.find(x => x.id === convId); cc.readAt = cc.readAt || {}; if (last) cc.readAt[u.id] = last; if (cc.meta[u.id]) delete cc.meta[u.id].markedUnread; dd.notifications.forEach(n => { if (n.to === u.id && n.link === `chat.html?c=${convId}`) n.read = true; }); }); },
  setMeta(convId, patch) { const u = requireUser(); tx(d => { const c = d.conversations.find(x => x.id === convId && x.participants.includes(u.id)); if (!c) throw new URError('Conversation not found.', 'not_found'); c.meta[u.id] = { ...(c.meta[u.id] || {}), ...patch }; if (patch.blocked !== undefined) audit(d, patch.blocked ? 'message.block' : 'message.unblock', convId); }); },
  clear(convId) { messages.setMeta(convId, { clearedAt: nowISO() }); },
};

/* ═══ academy ══════════════════════════════════════════════════════════════ */
function convertStudentId(d, s) {
  if (s.idType === 'student' && (s.status === 'Placed' || s.status === 'Left Academy')) { s.idType = 'candidate'; s.recordId = `CAND-${d.seq.cand++}`; s.convertedAt = nowISO(); }
}
function studentView(d, s) {
  const st = s.candidate ? computeStats(d, s.candidate) : null;
  const batch = d.batches.find(b => b.id === s.batchId);
  const subs = s.candidate ? d.submissions.filter(x => x.candidate === s.candidate) : [];
  const apps = s.candidate ? d.applications.filter(a => a.candidate === s.candidate) : [];
  return { ...clone(s), batchName: batch ? batch.name : '—', course: batch ? batch.course : '—', skillScore: st ? st.skillScore : null, tasksVerified: st ? st.tasksVerified : 0, ranked: st ? st.ranked : false, tier: st ? st.tier : null,
    pendingReviews: subs.filter(x => x.status === 'pending').length, submissions: subs.length, lastActivity: subs.length ? subs.map(x => x.submittedAt).sort().pop() : null,
    activeApplications: apps.filter(a => !['rejected', 'withdrawn', 'expired', 'hired'].includes(a.status)).length, hired: apps.some(a => a.status === 'hired'),
    referrals: d.referrals.filter(r => r.studentId === s.id).length, avgTaskScore: st && st.tasksVerified ? st.mean : null };
}
const academy = {
  students({ batchId, status, q } = {}) {
    const u = requireUser(['academy']); const d = load();
    return d.students.filter(s => s.academyId === u.orgId && (!batchId || s.batchId === batchId) && (!status || s.status === status) && (!q || [s.name, s.email, s.recordId].some(v => String(v).toLowerCase().includes(q.toLowerCase())))).map(s => studentView(d, s));
  },
  addStudent({ name, email, batchId }) {
    const u = requireUser(['academy']);
    required({ name, email }, [['name', 'Full name'], ['email', 'Email']]);
    if (!validEmail(email)) throw new URError('Enter a valid email address.', 'validation');
    return tx(d => addStudentTx(d, u, { name, email, batchId }));
  },
  bulkAdd(rows, defaultBatchId) {
    const u = requireUser(['academy']);
    const result = { added: [], errors: [] };
    tx(d => {
      rows.forEach((r, i) => {
        try {
          const name = String(r.name || '').trim(), email = String(r.email || '').trim();
          if (!name || !email) throw new URError('name and email are required');
          if (!validEmail(email)) throw new URError(`invalid email "${email}"`);
          let batchId = defaultBatchId || null;
          if (r.batch) { const b = d.batches.find(x => x.academyId === u.orgId && (x.name.toLowerCase() === String(r.batch).trim().toLowerCase())); if (!b) throw new URError(`batch "${r.batch}" not found`); batchId = b.id; }
          result.added.push(addStudentTx(d, u, { name, email, batchId }, true));
        } catch (e) { result.errors.push({ row: i + 2, message: e.message }); }
      });
      if (result.added.length) audit(d, 'student.bulk_add', u.orgId, `${result.added.length} added, ${result.errors.length} errors`);
    });
    return result;
  },
  updateStudent(id, patch) {
    const u = requireUser(['academy']);
    return tx(d => {
      const s = d.students.find(x => x.id === id && x.academyId === u.orgId); if (!s) throw new URError('Student not found.', 'not_found');
      if (patch.status) { if (!['Active', 'Referred', 'Placed', 'Left Academy'].includes(patch.status)) throw new URError('Invalid status.', 'validation'); s.status = patch.status; convertStudentId(d, s); }
      if (patch.batchId !== undefined) s.batchId = patch.batchId || null;
      if (patch.name) s.name = patch.name.trim();
      audit(d, 'student.update', id, JSON.stringify(patch));
      return studentView(d, s);
    });
  },
  removeStudent(id) {
    const u = requireUser(['academy']);
    tx(d => { const s = d.students.find(x => x.id === id && x.academyId === u.orgId); if (!s) throw new URError('Student not found.', 'not_found'); if (d.placements.some(p => p.studentId === id)) throw new URError('Students with placements cannot be removed — set them to "Left Academy" instead.', 'state'); d.students = d.students.filter(x => x.id !== id); if (s.candidate && d.candidates[s.candidate]) d.candidates[s.candidate].academyId = null; audit(d, 'student.remove', id, s.name); });
  },
  batches() { const u = requireUser(['academy']); const d = load(); return clone(d.batches.filter(b => b.academyId === u.orgId)).map(b => { const st = d.students.filter(s => s.batchId === b.id).map(s => studentView(d, s)); const scored = st.filter(s => s.skillScore != null && s.tasksVerified); return { ...b, students: st.length, placed: st.filter(s => s.status === 'Placed').length, avgScore: scored.length ? Math.round(scored.reduce((a, s) => a + s.skillScore, 0) / scored.length) : null, linked: st.filter(s => s.candidate).length }; }); },
  saveBatch(input) {
    const u = requireUser(['academy']);
    required(input, [['name', 'Batch name'], ['course', 'Course']]);
    if (input.startDate && input.endDate && input.endDate < input.startDate) throw new URError('End date must be after the start date.', 'validation');
    return tx(d => {
      if (d.batches.some(b => b.academyId === u.orgId && b.name.toLowerCase() === input.name.trim().toLowerCase() && b.id !== input.id)) throw new URError('A batch with that name already exists.', 'duplicate');
      let b = input.id ? d.batches.find(x => x.id === input.id && x.academyId === u.orgId) : null;
      if (!b) { b = { id: uid('bt'), academyId: u.orgId, createdAt: nowISO() }; d.batches.push(b); }
      Object.assign(b, { name: input.name.trim(), course: input.course.trim(), startDate: input.startDate || '', endDate: input.endDate || '', capacity: Math.max(0, parseInt(input.capacity, 10) || 0) });
      audit(d, input.id ? 'batch.update' : 'batch.create', b.id, b.name);
      return clone(b);
    });
  },
  deleteBatch(id) { const u = requireUser(['academy']); tx(d => { if (d.students.some(s => s.batchId === id)) throw new URError('Move or remove the students in this batch first.', 'state'); d.batches = d.batches.filter(b => !(b.id === id && b.academyId === u.orgId)); audit(d, 'batch.delete', id); }); },
  refer(studentIds, jobId, note = '') {
    const u = requireUser(['academy']);
    return tx(d => {
      const ac = d.academies.find(a => a.id === u.orgId);
      if (ac.verification !== 'verified') throw new URError('Your academy must be verified before referring students.', 'unverified');
      const job = d.jobs.find(j => j.id == jobId); if (!job || job.status !== 'open') throw new URError('This job is not open.', 'closed');
      const used = d.referrals.filter(r => r.academyId === u.orgId && r.jobId === job.id).length;
      if (used + studentIds.length > job.referralSlots) throw new URError(`Only ${Math.max(0, job.referralSlots - used)} referral slot(s) left for this job.`, 'slots');
      const co = d.companies.find(c => c.id === job.companyId), made = [];
      studentIds.forEach(sid => {
        const s = d.students.find(x => x.id === sid && x.academyId === u.orgId); if (!s) throw new URError('Student not found.', 'not_found');
        if (s.status === 'Placed' || s.status === 'Left Academy') throw new URError(`${s.name} is no longer an active student.`, 'state');
        if (d.referrals.some(r => r.studentId === sid && r.jobId === job.id)) throw new URError(`${s.name} is already referred to this job.`, 'duplicate');
        d.referrals.push({ id: uid('ref'), academyId: u.orgId, studentId: sid, jobId: job.id, status: 'referred', note: note.trim(), createdAt: nowISO() });
        if (s.status === 'Active') s.status = 'Referred';
        if (s.candidate) { const cu = candUserId(d, s.candidate); notify(d, cu, 'referral', `${ac.name} referred you to ${job.title} at ${co.name} — start the task to apply`, `job-detail.html?id=${job.id}`); const app = d.applications.find(a => a.candidate === s.candidate && a.jobId === job.id); if (app && !app.referredBy) app.referredBy = u.orgId; }
        made.push(s.name);
      });
      notify(d, orgMembers(d, job.companyId, ['hr']), 'referral', `${ac.name} referred ${made.length} student${made.length > 1 ? 's' : ''} to ${job.title}`, 'hr-applications.html');
      audit(d, 'referral.create', job.id, made.join(', '));
      return made;
    });
  },
  referrals() { const u = requireUser(['academy']); const d = load(); return d.referrals.filter(r => r.academyId === u.orgId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => { const s = d.students.find(x => x.id === r.studentId) || {}; const job = d.jobs.find(j => j.id === r.jobId); const app = s.candidate && d.applications.find(a => a.candidate === s.candidate && a.jobId === r.jobId); return { ...clone(r), studentName: s.name, studentLinked: !!s.candidate, job: job ? enrichJob(d, job) : null, application: app ? { status: app.status, taskScore: (() => { const sb = app.submissionId && d.submissions.find(x => x.id === app.submissionId); return hasScore(sb) ? sb.score.total : null; })() } : null }; }); },
  referralUsage(jobId) { const u = me(); if (!u || u.role !== 'academy') return 0; return load().referrals.filter(r => r.academyId === u.orgId && r.jobId == jobId).length; },
  placements() { const u = requireUser(['academy']); const d = load(); return d.placements.filter(p => p.academyId === u.orgId).map(p => { const s = d.students.find(x => x.id === p.studentId) || {}; const co = d.companies.find(c => c.id === p.companyId) || {}; const st = p.candidate ? computeStats(d, p.candidate) : null; return { ...clone(p), studentName: s.name, companyName: co.name, companyLogo: co.logo, skillScore: st ? st.skillScore : null }; }).sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt)); },
  addPlacement({ studentId, companyName, role, placedAt, salary }) {
    const u = requireUser(['academy']);
    required({ studentId, companyName, role }, [['studentId', 'Student'], ['companyName', 'Company'], ['role', 'Role']]);
    return tx(d => {
      const s = d.students.find(x => x.id === studentId && x.academyId === u.orgId); if (!s) throw new URError('Student not found.', 'not_found');
      let co = d.companies.find(c => c.name.toLowerCase() === companyName.trim().toLowerCase());
      const p = { id: uid('pl'), academyId: u.orgId, studentId, candidate: s.candidate, companyId: co ? co.id : null, externalCompany: co ? null : companyName.trim(), jobId: null, role: role.trim(), placedAt: placedAt ? new Date(placedAt).toISOString() : nowISO(), salary: (salary || '').trim(), visible: true, source: 'manual', verified: false };
      d.placements.push(p); s.status = 'Placed'; convertStudentId(d, s);
      audit(d, 'placement.create', p.id, `${s.name} @ ${companyName}`);
      return clone(p);
    });
  },
  setPlacementVisibility(id, visible) { const u = requireUser(['academy']); tx(d => { const p = d.placements.find(x => x.id === id && x.academyId === u.orgId); if (p) p.visible = !!visible; }); },
  setAllPlacementVisibility(visible) { const u = requireUser(['academy']); tx(d => d.placements.forEach(p => { if (p.academyId === u.orgId) p.visible = !!visible; })); },
};
function addStudentTx(d, u, { name, email, batchId }, silent) {
  const em = email.trim().toLowerCase();
  if (d.students.some(s => s.academyId === u.orgId && s.email.toLowerCase() === em)) throw new URError(`${em} is already on your roster`, 'duplicate');
  if (batchId && !d.batches.some(b => b.id === batchId && b.academyId === u.orgId)) throw new URError('Batch not found', 'validation');
  const cu = d.users.find(x => x.email === em && x.role === 'candidate');
  // Linking to an existing candidate account needs the candidate's consent: they own their account and history.
  const s = { id: uid('st'), academyId: u.orgId, name: name.trim(), email: em, batchId: batchId || null, candidate: null, pendingCandidate: cu ? cu.username : null, consent: cu ? 'pending' : null, recordId: `STU-${d.seq.stu++}`, idType: 'student', status: 'Active', createdAt: nowISO() };
  d.students.unshift(s);
  if (cu) notify(d, cu.id, 'academy', `"${d.academies.find(a => a.id === u.orgId).name}" wants to link your account as student ${s.recordId} — review the request in Settings`, 'settings.html#academy');  if (!silent) audit(d, 'student.add', s.id, s.name);
  return clone(s);
}

/* ═══ team ═════════════════════════════════════════════════════════════════ */
const team = {
  list() { const u = requireUser(['hr', 'interviewer']); const d = load(); return { members: clone(d.users.filter(x => x.orgId === u.orgId && ['hr', 'interviewer'].includes(x.role))).map(m => ({ ...m, pwHash: undefined, reviews: d.submissions.filter(s => s.score && s.score.reviewerId === m.id).length, interviews: d.interviews.filter(i => i.interviewerId === m.id).length })), invites: clone(d.invites.filter(i => i.companyId === u.orgId && i.status === 'pending')) }; },
  invite(email, role) {
    const u = requireUser(['hr']);
    if (!validEmail(email)) throw new URError('Enter a valid email address.', 'validation');
    if (!['hr', 'interviewer'].includes(role)) throw new URError('Choose a role.', 'validation');
    return tx(d => {
      const em = email.trim().toLowerCase();
      if (d.users.some(x => x.email === em)) throw new URError('That email already has an Unresume account.', 'duplicate');
      if (d.invites.some(i => i.email === em && i.companyId === u.orgId && i.status === 'pending')) throw new URError('An invite is already pending for that email.', 'duplicate');
      const code = (u.orgId.replace(/^co-/, '').slice(0, 4) + '-' + Math.random().toString(36).slice(2, 7)).toUpperCase();
      const inv = { id: uid('inv'), companyId: u.orgId, email: em, role, code, status: 'pending', invitedBy: u.id, createdAt: nowISO() };
      d.invites.push(inv); audit(d, 'team.invite', em, role);
      return clone(inv);
    });
  },
  revoke(id) { const u = requireUser(['hr']); tx(d => { const i = d.invites.find(x => x.id === id && x.companyId === u.orgId); if (i) { i.status = 'revoked'; audit(d, 'team.revoke', i.email); } }); },
  setRole(userId, role) {
    const u = requireUser(['hr']);
    tx(d => {
      const m = d.users.find(x => x.id === userId && x.orgId === u.orgId); if (!m) throw new URError('Member not found.', 'not_found');
      if (m.id === u.id && role !== 'hr' && d.users.filter(x => x.orgId === u.orgId && x.role === 'hr' && x.status === 'active').length < 2) throw new URError('Your company needs at least one HR admin.', 'state');
      m.role = role; audit(d, 'team.role', userId, role); notify(d, userId, 'team', `Your role was changed to ${ROLES[role].label}`, '');
    });
  },
  remove(userId) {
    const u = requireUser(['hr']);
    if (userId === u.id) throw new URError("You can't remove yourself.", 'state');
    tx(d => { const m = d.users.find(x => x.id === userId && x.orgId === u.orgId); if (!m) throw new URError('Member not found.', 'not_found'); m.status = 'removed'; m.orgId = null; d.interviews.forEach(i => { if (i.interviewerId === userId && ['proposed', 'confirmed'].includes(i.status)) i.interviewerId = null; }); audit(d, 'team.remove', userId, m.name); });
  },
};

/* ═══ analytics ════════════════════════════════════════════════════════════ */
const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
const analytics = {
  company(companyId) {
    const d = load(), u = me(); companyId = companyId || (u && u.orgId);
    const js = d.jobs.filter(j => j.companyId === companyId);
    const apps = d.applications.filter(a => js.some(j => j.id === a.jobId) && a.status !== 'in_progress');
    const subs = apps.map(a => d.submissions.find(s => s.id === a.submissionId)).filter(Boolean);
    const scored = subs.filter(hasScore);
    const reached = st => apps.filter(a => a.history.some(h => h.status === st)).length;
    const hired = apps.filter(a => a.status === 'hired');
    const tth = hired.map(a => (new Date(a.history.find(h => h.status === 'hired').at) - new Date(a.createdAt)) / DAY);
    const ttr = scored.map(s => (new Date(s.score.scoredAt) - new Date(s.submittedAt)) / HOUR);
    return {
      openJobs: js.filter(j => j.status === 'open').length, totalJobs: js.length, applications: apps.length,
      pendingReview: subs.filter(s => s.status === 'pending').length, shortlisted: apps.filter(a => ['shortlisted', 'interview', 'offer', 'hired'].includes(a.status)).length,
      interviewsUpcoming: d.interviews.filter(i => i.companyId === companyId && ['proposed', 'confirmed', 'reschedule'].includes(i.status) && new Date(i.scheduledAt) > Date.now()).length,
      hired: hired.length, avgScore: avg(scored.map(s => s.score.total)), avgTimeToHireDays: avg(tth), avgReviewHours: avg(ttr),
      funnel: [['Submitted', apps.filter(a => a.history.some(h => h.status === 'submitted')).length], ['Scored', reached('scored')], ['Shortlisted', reached('shortlisted')], ['Interview', reached('interview')], ['Offer', reached('offer')], ['Hired', reached('hired')]],
      byJob: js.map(j => { const ja = apps.filter(a => a.jobId === j.id); const js2 = ja.map(a => d.submissions.find(s => s.id === a.submissionId)).filter(hasScore); return { id: j.id, title: j.title, status: j.status, applications: ja.length, avgScore: avg(js2.map(s => s.score.total)), shortlisted: ja.filter(a => ['shortlisted', 'interview', 'offer', 'hired'].includes(a.status)).length, hired: ja.filter(a => a.status === 'hired').length }; }),
      sources: { direct: apps.filter(a => !a.referredBy).length, academy: apps.filter(a => a.referredBy).length },
      integrityFlags: subs.filter(s => s.integrity.flags.length && !s.integrity.clearedAt).length,
      assessToInterview: reached('scored') ? Math.round(reached('interview') / reached('scored') * 100) : null, interviewToHire: reached('interview') ? Math.round(hired.length / reached('interview') * 100) : null,
      overdueReviews: subs.filter(s => s.status === 'pending' && Date.now() - new Date(s.submittedAt) > d.settings.reviewSlaDays * DAY).length, verifiedRouteApps: apps.filter(a => a.route === 'verified_score').length,
      scoreDist: [0, 50, 60, 70, 80, 90].map((lo, i, arr) => { const hi = arr[i + 1] ?? 101; return { label: i === 0 ? '<50' : `${lo}–${hi === 101 ? 100 : hi - 1}`, n: scored.filter(s => s.score.total >= lo && s.score.total < hi).length }; }),
    };
  },
  academy() {
    const u = requireUser(['academy']); const d = load();
    const st = d.students.filter(s => s.academyId === u.orgId).map(s => studentView(d, s));
    const placed = st.filter(s => s.status === 'Placed').length, exited = st.filter(s => s.status === 'Placed' || s.status === 'Left Academy').length;
    const refs = d.referrals.filter(r => r.academyId === u.orgId);
    const scoredStudents = st.filter(s => s.tasksVerified);
    return { students: st.length, active: st.filter(s => s.status === 'Active' || s.status === 'Referred').length, linked: st.filter(s => s.candidate).length, referred: refs.length,
      placed, placementRate: exited ? Math.round(placed / exited * 100) : null, placementBase: exited, avgSkillScore: scoredStudents.length ? Math.round(scoredStudents.reduce((a, s) => a + s.skillScore, 0) / scoredStudents.length) : null,
      pendingReviews: st.reduce((a, s) => a + s.pendingReviews, 0), referralOutcomes: ['referred', 'started', 'applied', 'placed', 'rejected'].map(k => [k, refs.filter(r => r.status === k).length]) };
  },
  platform() {
    const d = load();
    const cands = Object.values(d.candidates);
    const verified = cands.filter(c => computeStats(d, c.username).tasksVerified > 0).length;
    const finished = d.applications.filter(a => ['hired', 'rejected'].includes(a.status));
    return {
      candidates: cands.length, verifiedCandidates: verified, companies: d.companies.filter(c => c.verification === 'verified').length, academies: d.academies.filter(a => a.verification === 'verified').length,
      openJobs: jobs.list().length, tasksCompleted: d.submissions.filter(s => s.status === 'scored').length + cands.reduce((a, c) => a + (c.history || []).length, 0),
      hires: d.applications.filter(a => a.status === 'hired').length, placements: d.placements.length,
      hireRate: finished.length ? Math.round(finished.filter(a => a.status === 'hired').length / finished.length * 100) : null,
      users: d.users.length, pendingVerifications: d.verifications.filter(v => v.status === 'pending').length, openDisputes: d.disputes.filter(x => ['open', 'under_review'].includes(x.status)).length,
      openReports: d.reports.filter(r => r.status === 'open').length + d.contact.filter(c => c.status === 'open').length, flaggedSubmissions: d.submissions.filter(s => s.integrity.flags.length && !s.integrity.clearedAt && s.status !== 'void').length,
      pendingReviews: d.submissions.filter(s => s.status === 'pending').length, submissions: d.submissions.length,
      signupsByRole: Object.keys(ROLES).map(r => [ROLES[r].label, d.users.filter(u => u.role === r).length]),
      activity: [6, 5, 4, 3, 2, 1, 0].map(n => { const day = new Date(Date.now() - n * DAY); const key = day.toISOString().slice(0, 10); return { day: day.toLocaleDateString(undefined, { weekday: 'short' }), submissions: d.submissions.filter(s => s.submittedAt.slice(0, 10) === key).length, applications: d.applications.filter(a => a.createdAt.slice(0, 10) === key).length }; }),
    };
  },
};

/* ═══ admin ═══════════════════════════════════════════════════════════════ */
const admin = {
  users({ role, q = '', status } = {}) {
    requireUser(['admin']); const d = load();
    return d.users.filter(u => (!role || u.role === role || (role === 'company' && ['hr', 'interviewer'].includes(u.role))) && (!status || u.status === status) && (!q || [u.name, u.email, u.username].some(v => v && v.toLowerCase().includes(q.toLowerCase()))))
      .map(u => { const org = u.orgId && (d.companies.find(c => c.id === u.orgId) || d.academies.find(a => a.id === u.orgId)); return { ...clone(u), pwHash: undefined, orgName: org ? org.name : '', orgVerification: org ? org.verification : null, stats: u.role === 'candidate' ? computeStats(d, u.username) : null }; });
  },
  setUserStatus(userId, status, reason) {
    const me_ = requireUser(['admin']);
    if (!['active', 'suspended'].includes(status)) throw new URError('Invalid status.', 'validation');
    if (status === 'suspended' && !String(reason || '').trim()) throw new URError('Give a reason for the suspension.', 'validation');
    if (userId === me_.id) throw new URError("You can't suspend yourself.", 'state');
    tx(d => { const u = d.users.find(x => x.id === userId); if (!u) throw new URError('User not found.', 'not_found'); u.status = status; u.statusReason = reason || ''; audit(d, `user.${status}`, userId, reason || ''); });
  },
  setOrgVerification(kind, id, verification, note) {
    requireUser(['admin']);
    tx(d => { const o = d[kind === 'company' ? 'companies' : 'academies'].find(x => x.id === id); if (!o) throw new URError('Not found.', 'not_found'); o.verification = verification; if (verification !== 'verified' && kind === 'company') d.jobs.forEach(j => { if (j.companyId === id && j.status === 'open') j.status = 'closed'; }); notify(d, orgMembers(d, id), 'verification', `Your ${kind} verification status is now: ${verification}${note ? ' — ' + note : ''}`, kind === 'company' ? 'company-profile.html' : 'settings.html'); audit(d, `${kind}.verification`, id, `${verification} ${note || ''}`); });
  },
  moderateJob(id, action, reason) {
    requireUser(['admin']);
    if (action !== 'restore' && !String(reason || '').trim()) throw new URError('Give a reason — the company will see it.', 'validation');
    tx(d => {
      const j = d.jobs.find(x => x.id == id); if (!j) throw new URError('Job not found.', 'not_found');
      j.status = action === 'flag' ? 'flagged' : action === 'remove' ? 'removed' : 'closed'; j.moderation = { action, reason: reason || '', at: nowISO() };
      notify(d, orgMembers(d, j.companyId, ['hr']), 'moderation', action === 'restore' ? `"${j.title}" was restored (closed — reopen when ready)` : `"${j.title}" was ${action === 'flag' ? 'hidden pending review' : 'removed'}: ${reason}`, 'hr-jobs.html');
      audit(d, `job.moderate.${action}`, id, reason || '');
    });
  },
  moderateTask(id, action, reason) {
    requireUser(['admin']);
    if (action !== 'restore' && !String(reason || '').trim()) throw new URError('Give a reason.', 'validation');
    tx(d => {
      const t = taskOf(d, id); if (!t) throw new URError('Task not found.', 'not_found');
      t.status = action === 'flag' ? 'flagged' : action === 'remove' ? 'removed' : 'paused'; t.moderation = { action, reason: reason || '', at: nowISO() };
      if (action !== 'restore') d.jobs.forEach(j => { if (j.taskId === t.id && j.status === 'open') j.status = 'closed'; });
      if (t.companyId) notify(d, orgMembers(d, t.companyId, ['hr', 'interviewer']), 'moderation', action === 'restore' ? `Task "${t.title}" was restored (paused)` : `Task "${t.title}" was ${action === 'flag' ? 'flagged' : 'removed'}: ${reason}`, 'company-tasks.html');
      audit(d, `task.moderate.${action}`, id, reason || '');
    });
  },
  allJobs() { requireUser(['admin']); const d = load(); return d.jobs.map(j => enrichJob(d, j)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  allTasks() { requireUser(['admin']); return tasks.list(); },
  settings() { return clone(load().settings); },
  updateSettings(patch) {
    requireUser(['admin']);
    const num = (k, lo, hi) => { if (patch[k] === undefined) return; const v = Number(patch[k]); if (isNaN(v) || v < lo || v > hi) throw new URError(`${k} must be between ${lo} and ${hi}.`, 'validation'); patch[k] = v; };
    num('rankMinTasks', 1, 20); num('certificateThreshold', 0, 100); num('badgeMinTasks', 1, 20); num('badgeMinAvg', 0, 100); num('fastCompletionPct', 0, 100); num('similarityThreshold', 0.1, 1); num('focusLossThreshold', 1, 100); num('maxUploadMB', 1, 500);
    tx(d => { d.settings = { ...d.settings, ...patch }; audit(d, 'settings.update', 'platform', Object.keys(patch).join(', ')); });
  },
  auditLog({ q = '', actor = '' } = {}) { requireUser(['admin']); return clone(load().audit.filter(a => (!actor || a.actor === actor) && (!q || [a.action, a.target, a.details, a.actorName].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))))); },
};

/* ═══ feed ═════════════════════════════════════════════════════════════════ */
const feedApi = {
  list(type) { const d = load(); return clone(d.feed.filter(f => (!type || f.type === type) && d.candidates[f.actor] && d.candidates[f.actor].privacy.profileVisibility === 'public')).map(f => ({ ...f, actorName: d.candidates[f.actor].name, likes: (d.likes['fd:' + f.id] || []).length, liked: !!(me() && (d.likes['fd:' + f.id] || []).includes(me().id)) })); },
  like(id) { const u = requireUser(); return tx(d => { const k = 'fd:' + id; const arr = d.likes[k] = d.likes[k] || []; const i = arr.indexOf(u.id); if (i >= 0) arr.splice(i, 1); else arr.push(u.id); return i < 0; }); },
  likePortfolio(id) { const u = requireUser(); return tx(d => { const k = 'pf:' + id; const arr = d.likes[k] = d.likes[k] || []; const i = arr.indexOf(u.id); if (i >= 0) arr.splice(i, 1); else arr.push(u.id); return i < 0; }); },
  portfolioLikes(id) { const d = load(); const arr = d.likes['pf:' + id] || []; const u = me(); return { count: arr.length, liked: !!(u && arr.includes(u.id)) }; },
};

/* ═══ certificates (public verification) ══════════════════════════════════ */
const certificates = {
  // Returns { status: valid | expired | revoked, ...trace } or null when the ID doesn't exist.
  // Only the minimum personal data is exposed: name, task, score, issuer, dates.
  verify(certId) {
    const d = load(), id = String(certId || '').trim().toUpperCase();
    const validity = (d.settings.certificateValidityMonths || 36) * 30.4 * DAY;
    for (const c of Object.values(d.candidates)) {
      const st = computeStats(d, c.username);
      const cert = st.certificates.find(x => x.id === id);
      const trace = r => {
        const s = r.submissionId && d.submissions.find(x => x.id === r.submissionId), t = s && taskOf(d, s.taskId);
        const reviewer = s && s.score && d.users.find(u => u.id === s.score.reviewerId);
        return { assessmentId: t ? `T-${t.id}` : 'imported', submissionId: s ? s.id : null, reviewer: reviewer ? reviewer.name : (s ? 'Reviewer' : 'Partner company reviewer'), rubric: t ? t.rubric.map(x => `${x.criterion} (${x.points})`) : [], difficulty: t ? t.difficulty : r.difficulty, dualReviewed: !!(s && s.score && s.score.dual) };
      };
      if (cert) {
        const r = st.results.find(x => x.submissionId === cert.submissionId || ('UR-' + fnv32(c.username + '|' + x.id, 0x811c9dc5).toUpperCase()) === id) || {};
        const expired = Date.now() - new Date(cert.date) > validity;
        return { ...cert, status: expired ? 'expired' : 'valid', candidateName: c.name, username: c.privacy.profileVisibility === 'public' ? c.username : null, issuer: cert.companyId ? (d.companies.find(x => x.id === cert.companyId) || {}).name : 'Unresume', ...trace(r) };
      }
      // revoked: the certificate's submission was voided by moderation
      const voided = d.submissions.find(s => s.candidate === c.username && s.status === 'void' && s.score && ('UR-' + fnv32(c.username + '|' + s.id, 0x811c9dc5).toUpperCase()) === id);
      if (voided) { const t = taskOf(d, voided.taskId); return { id, status: 'revoked', title: t.title, candidateName: c.name, score: voided.score.total, date: voided.score.scoredAt, revokedAt: voided.voidedAt, issuer: t.companyId ? (d.companies.find(x => x.id === t.companyId) || {}).name : 'Unresume' }; }
    }
    return null;
  },
};

/* ═══ data export (GDPR-style "download my data") ═════════════════════════ */
function exportMine() {
  const u = requireUser(); const d = load();
  const out = { exportedAt: nowISO(), account: { ...clone(u), pwHash: undefined } };
  if (u.role === 'candidate') { out.profile = clone(d.candidates[u.username]); out.submissions = clone(d.submissions.filter(s => s.candidate === u.username)); out.applications = clone(d.applications.filter(a => a.candidate === u.username)); out.interviews = clone(d.interviews.filter(i => i.candidate === u.username)); out.disputes = clone(d.disputes.filter(x => x.candidate === u.username)); }
  out.messages = clone(d.conversations.filter(c => c.participants.includes(u.id)));
  out.notifications = clone(d.notifications.filter(n => n.to === u.id));
  return out;
}

/* ═══ Verified-score applications (reuse instead of re-testing) ═══════════ */
function eligibilityFor(d, job, username) {
  const reqs = job.acceptVerified || [];
  if (!reqs.length || !username) return { offered: !!reqs.length, met: false, rows: [] };
  const st = computeStats(d, username);
  const minN = d.settings.badgeMinTasks;
  const rows = reqs.map(r => { const sk = st.skills.find(x => x.skill === r.skill); return { skill: r.skill, minScore: r.minScore, score: sk ? sk.score : null, tasks: sk ? sk.count : 0, met: !!sk && sk.count >= minN && sk.score >= r.minScore }; });
  return { offered: true, met: rows.every(r => r.met), rows, minTasks: minN, qualify: qualifyPaths(d, rows.filter(r => !r.met).map(r => r.skill)) };
}
// Reusable standard assessments that build the verified score a job asks for.
function qualifyPaths(d, skills) {
  if (!skills.length) return [];
  return d.tasks.filter(t => t.kind === 'standard' && !t.jobId && t.status === 'published' && (t.skills || []).some(s => skills.includes(s)))
    .map(t => ({ id: t.id, title: t.title, skills: (t.skills || []).filter(s => skills.includes(s)), estimatedHours: t.estimatedHours, difficulty: t.difficulty })).slice(0, 4);
}
// Staged hiring: when a job's task is invite-only, candidates enter with verified scores and
// the company unlocks the longer assessment only for applicants it is seriously considering.
function taskAccessFor(d, job, username) {
  if (!job.inviteOnlyTask) return { open: true, via: 'open' };
  const app = username && d.applications.find(a => a.jobId === job.id && a.candidate === username && a.status !== 'withdrawn');
  if (app && app.taskRequested) return { open: true, via: 'requested' };
  if (app && (app.status === 'in_progress' || PIPELINE.includes(app.status))) return { open: true, via: 'shortlisted' };
  if (username && (d.jobInvites || []).some(i => i.jobId === job.id && i.username === username)) return { open: true, via: 'invited' };
  return { open: false, via: null, reason: app ? 'The company will invite you to this assessment if your application moves forward.' : 'This company assessment is by invitation. Apply with your verified scores first.' };
}
/* Candidate workload: how much unpaid assessment time is in flight. */
const workload = {
  mine() {
    const u = me(); if (!u || u.role !== 'candidate') return null;
    const d = load(); expireStale(d);
    const mineA = d.attempts.filter(a => a.candidate === u.username);
    const active = mineA.filter(a => a.status === 'active').map(a => { const t = taskOf(d, a.taskId) || {}; return { taskId: a.taskId, title: t.title, kind: t.kind, hours: t.estimatedHours || 0, deadlineAt: a.deadlineAt }; });
    const since = Date.now() - 30 * DAY;
    const recent = mineA.filter(a => new Date(a.startedAt) > since).map(a => taskOf(d, a.taskId) || {});
    return { active, activeHours: active.reduce((s, a) => s + a.hours, 0), activeCompany: active.filter(a => a.kind !== 'standard').length,
      limit: d.settings.maxActiveCompanyTasks || 2, last30Hours: recent.reduce((s, t) => s + (t.estimatedHours || 0), 0), last30Tasks: recent.length,
      verifiedApplies: d.applications.filter(a => a.candidate === u.username && a.route === 'verified_score').length };
  },
};
const verifiedApply = {
  eligibility(jobId) { const d = load(), u = me(), j = d.jobs.find(x => x.id == jobId); if (!j) return null; return eligibilityFor(d, j, u && u.role === 'candidate' ? u.username : null); },
  taskAccess(jobId) { const d = load(), u = me(), j = d.jobs.find(x => x.id == jobId); if (!j) return null; return taskAccessFor(d, j, u && u.role === 'candidate' ? u.username : null); },
  apply(jobId, note = '') {
    const u = requireUser(['candidate']);
    return tx(d => {
      const job = d.jobs.find(j => j.id == jobId); if (!job || job.status !== 'open') throw new URError('This job is not open.', 'closed');
      const el = eligibilityFor(d, job, u.username);
      if (!el.offered) throw new URError('This job does not accept existing verified scores.', 'state');
      if (!el.met) throw new URError('Your verified scores do not meet this job\'s requirements yet.', 'state');
      if (d.applications.some(a => a.jobId === job.id && a.candidate === u.username && a.status !== 'withdrawn')) throw new URError('You have already applied to this job.', 'duplicate');
      const st = d.students.find(s => s.candidate === u.username && s.idType === 'student');
      const ref = st && d.referrals.find(r => r.studentId === st.id && r.jobId === job.id);
      const now = nowISO();
      const app = { id: uid('app'), jobId: job.id, candidate: u.username, submissionId: null, route: 'verified_score', evidence: el.rows, note: String(note).slice(0, 500), status: 'scored', referredBy: ref ? ref.academyId : null, createdAt: now, updatedAt: now,
        history: [{ status: 'submitted', at: now, by: u.id, note: 'Applied with existing verified scores' }, { status: 'scored', at: now, by: null, note: el.rows.map(r => `${r.skill} ${r.score}/1000`).join(', ') }] };
      d.applications.push(app);
      if (ref) ref.status = 'applied';
      notify(d, orgMembers(d, job.companyId, ['hr', 'interviewer']), 'application', `${d.candidates[u.username].name} applied to ${job.title} with verified scores`, `hr-applications.html?id=${app.id}`);
      feed(d, u.username, 'submission', `applied to ${job.title} with verified scores`, `job-detail.html?id=${job.id}`);
      audit(d, 'application.verified_apply', app.id, job.title);
      return clone(app);
    });
  },
  // Company asks a verified-score applicant to also complete the company task.
  requestTask(appId, note = '') {
    const u = requireUser(['hr', 'interviewer']);
    tx(d => {
      const app = d.applications.find(a => a.id === appId); if (!app) throw new URError('Application not found.', 'not_found');
      const job = d.jobs.find(j => j.id === app.jobId); if (job.companyId !== u.orgId) throw new URError('Not your application.', 'forbidden');
      if (!job.taskId) throw new URError('Link a task to this job first.', 'state');
      if (app.taskRequested) throw new URError('Already requested.', 'state');
      app.taskRequested = { at: nowISO(), by: u.id, note }; app.history.push({ status: app.status, at: nowISO(), by: u.id, note: 'Company requested the role assessment' });
      notify(d, candUserId(d, app.candidate), 'application', `${d.companies.find(c => c.id === job.companyId).name} asked you to complete the ${taskOf(d, job.taskId).title} for ${job.title}`, `job-detail.html?id=${job.id}`);
      audit(d, 'application.request_task', appId, note);
    });
  },
};

/* ═══ Academy affiliation (candidate-controlled) ══════════════════════════ */
const affiliation = {
  requests() { const u = me(); if (!u || u.role !== 'candidate') return []; const d = load(); return d.students.filter(s => s.pendingCandidate === u.username && s.consent === 'pending').map(s => ({ id: s.id, recordId: s.recordId, academy: clone(d.academies.find(a => a.id === s.academyId)), batch: (d.batches.find(b => b.id === s.batchId) || {}).name || '' })); },
  current() { const u = me(); if (!u || u.role !== 'candidate') return null; const d = load(); const s = d.students.find(x => x.candidate === u.username && !['Left Academy'].includes(x.status)); return s ? { id: s.id, recordId: s.recordId, idType: s.idType, status: s.status, academy: clone(d.academies.find(a => a.id === s.academyId)) } : null; },
  respond(studentId, accept) {
    const u = requireUser(['candidate']);
    tx(d => {
      const s = d.students.find(x => x.id === studentId && x.pendingCandidate === u.username && x.consent === 'pending'); if (!s) throw new URError('Request not found.', 'not_found');
      const c = d.candidates[u.username];
      if (accept && d.students.some(x => x.candidate === u.username && x.status !== 'Left Academy')) throw new URError('You are already affiliated with an academy. Leave it first.', 'state');
      s.consent = accept ? 'accepted' : 'declined'; s.consentAt = nowISO();
      if (accept) { s.candidate = u.username; c.academyId = s.academyId; c.academyStatus = 'active'; }
      delete s.pendingCandidate;
      notify(d, orgMembers(d, s.academyId, ['academy']), 'academy', `${c.name} ${accept ? 'accepted' : 'declined'} your student link request (${s.recordId})`, 'manage-students.html');
      audit(d, accept ? 'affiliation.accept' : 'affiliation.decline', s.id);
    });
  },
  leave(reason = '') {
    const u = requireUser(['candidate']);
    tx(d => {
      const s = d.students.find(x => x.candidate === u.username && x.status !== 'Left Academy'); if (!s) throw new URError('You are not affiliated with an academy.', 'state');
      s.status = 'Left Academy'; convertStudentId(d, s); s.formerCandidate = u.username; s.candidate = null; s.leftAt = nowISO(); s.leftReason = reason;
      const c = d.candidates[u.username]; c.academyId = null; c.academyStatus = 'left';
      notify(d, orgMembers(d, s.academyId, ['academy']), 'academy', `${c.name} left your academy. Past referrals and placements stay attributed; you no longer see their new activity.`, 'manage-students.html');
      audit(d, 'affiliation.leave', s.id, reason);
    });
  },
};

/* ═══ Satisfaction feedback (real responses only) ═════════════════════════ */
const feedbackApi = {
  submit({ context, targetId, rating, comment = '' }) {
    const u = requireUser();
    const r = Number(rating);
    if (!['review', 'hire', 'platform'].includes(context)) throw new URError('Invalid context.', 'validation');
    if (!(r >= 1 && r <= 5)) throw new URError('Choose a rating from 1 to 5.', 'validation');
    tx(d => {
      d.feedback = d.feedback || [];
      if (d.feedback.some(x => x.by === u.id && x.context === context && x.targetId === targetId)) throw new URError('You already rated this.', 'duplicate');
      d.feedback.push({ id: uid('fb'), by: u.id, role: u.role, context, targetId, rating: r, comment: String(comment).slice(0, 500), at: nowISO() });
    });
  },
  mine(context, targetId) { const u = me(); return u ? clone((load().feedback || []).find(x => x.by === u.id && x.context === context && x.targetId === targetId)) || null : null; },
};

/* ═══ Assessment library: templates + rule-based draft assistant ══════════ */
const TEMPLATES = [
  { id: 'tpl-fe-screen', track: 'frontend', kind: 'screening', title: 'Frontend bug-fix screen', skills: ['React', 'TypeScript'], difficulty: 'Beginner', timeLimitMin: 120, estimatedHours: 1.5, aiPolicy: 'disclose', submissionTypes: ['ZIP File', 'Live URL'],
    brief: 'You get a small React app with three known bugs (listed in the README). Fix them and explain each fix in two or three sentences.', requirements: ['Fix all three bugs', 'Do not add new dependencies', 'Explain each fix in the README'],
    rubric: [{ criterion: 'Correctness', points: 50, description: 'All three bugs fixed without regressions' }, { criterion: 'Code Quality', points: 30, description: 'Minimal, readable changes' }, { criterion: 'Explanation', points: 20, description: 'Clear reasoning' }] },
  { id: 'tpl-fe-adv', track: 'frontend', kind: 'advanced', title: 'Frontend feature build', skills: ['React', 'CSS'], difficulty: 'Intermediate', timeLimitMin: 2880, estimatedHours: 5, aiPolicy: 'disclose', submissionTypes: ['ZIP File', 'Live URL'],
    brief: 'Build a responsive, accessible settings page from the provided mock API: profile form with validation, notification toggles and a save state.', requirements: ['Responsive from 320px', 'Form validation with clear errors', 'Loading, success and error states', 'README with decisions'],
    rubric: [{ criterion: 'Functionality', points: 30, description: 'All features work against the mock API' }, { criterion: 'UI/UX', points: 25, description: 'Layout, states, responsiveness' }, { criterion: 'Code Quality', points: 25, description: 'Structure and typing' }, { criterion: 'Accessibility', points: 20, description: 'Labels, focus, errors announced' }] },
  { id: 'tpl-be-screen', track: 'backend', kind: 'screening', title: 'API endpoint screen', skills: ['Node.js'], difficulty: 'Beginner', timeLimitMin: 120, estimatedHours: 1.5, aiPolicy: 'disclose', submissionTypes: ['ZIP File', 'Code File'],
    brief: 'Add a paginated GET /orders endpoint to the provided Express starter, with input validation and tests.', requirements: ['Cursor or offset pagination', 'Validate query params', 'At least three tests'],
    rubric: [{ criterion: 'Correctness', points: 45, description: 'Pagination and validation work' }, { criterion: 'Tests', points: 30, description: 'Meaningful cases' }, { criterion: 'Code Quality', points: 25, description: 'Clear, idiomatic' }] },
  { id: 'tpl-data-screen', track: 'data', kind: 'screening', title: 'SQL analysis screen', skills: ['SQL', 'Python'], difficulty: 'Beginner', timeLimitMin: 120, estimatedHours: 1.5, aiPolicy: 'disclose', submissionTypes: ['Code File', 'PDF'],
    brief: 'Answer five business questions with SQL against the provided sample database and summarise the findings in five bullet points.', requirements: ['One query per question', 'Results included', 'Five-bullet summary'],
    rubric: [{ criterion: 'Query Correctness', points: 50, description: 'Right answers' }, { criterion: 'Query Quality', points: 25, description: 'Readable, efficient SQL' }, { criterion: 'Insight', points: 25, description: 'Useful summary' }] },
  { id: 'tpl-design-adv', track: 'design', kind: 'advanced', title: 'Product design challenge', skills: ['Figma', 'UI/UX'], difficulty: 'Intermediate', timeLimitMin: 2880, estimatedHours: 5, aiPolicy: 'allowed', submissionTypes: ['Image / Screenshot', 'PDF', 'Live URL'],
    brief: 'Redesign the provided checkout flow to reduce drop-off. Deliver key screens and a one-page rationale.', requirements: ['3–5 key screens', 'Mobile first', 'One-page rationale'],
    rubric: [{ criterion: 'UX Flow', points: 35, description: 'Fewer steps, clear hierarchy' }, { criterion: 'Visual Design', points: 30, description: 'Polish and consistency' }, { criterion: 'Rationale', points: 20, description: 'Evidence-based decisions' }, { criterion: 'Detail', points: 15, description: 'States and edge cases' }] },
  { id: 'tpl-pm-screen', track: 'product', kind: 'screening', title: 'Product sense screen', skills: ['Product Strategy'], difficulty: 'Beginner', timeLimitMin: 120, estimatedHours: 1.5, aiPolicy: 'allowed', submissionTypes: ['PDF', 'Live URL'],
    brief: 'In one page, pick one metric you would improve for the described product, explain why, and propose two experiments.', requirements: ['One page max', 'One clear metric', 'Two experiments with success criteria'],
    rubric: [{ criterion: 'Problem framing', points: 40, description: 'Right metric, clear why' }, { criterion: 'Experiments', points: 40, description: 'Testable, measurable' }, { criterion: 'Communication', points: 20, description: 'Concise and structured' }] },
  { id: 'tpl-mobile-adv', track: 'mobile', kind: 'advanced', title: 'Mobile screen build', skills: ['Flutter', 'Dart'], difficulty: 'Intermediate', timeLimitMin: 2880, estimatedHours: 5, aiPolicy: 'disclose', submissionTypes: ['ZIP File', 'Video'],
    brief: 'Build one list + detail screen pair in Flutter against the provided JSON, with offline caching and pull-to-refresh.', requirements: ['List and detail screens', 'Offline cache', 'Short screen recording'],
    rubric: [{ criterion: 'Functionality', points: 35, description: 'Screens, cache, refresh' }, { criterion: 'UI Fidelity', points: 25, description: 'Polish and responsiveness' }, { criterion: 'Architecture', points: 25, description: 'State and structure' }, { criterion: 'Docs', points: 15, description: 'Recording and README' }] },
];
const library = {
  templates({ track, kind } = {}) { return clone(TEMPLATES.filter(t => (!track || t.track === track) && (!kind || t.kind === kind))); },
  standard() { return tasks.list({ practice: true, status: 'published' }); },
  /* Deterministic, rule-based drafting from a job's title/skills/level. Output is ALWAYS a draft:
     publishing requires a human to confirm they reviewed it (tasks.save enforces this).
     A production version would call an LLM API server-side (see BACKEND.md) under the same rule. */
  draft({ jobTitle = '', skills = [], kind = 'screening', difficulty = 'Intermediate' }) {
    skills = (Array.isArray(skills) ? skills : String(skills).split(',')).map(s => s.trim()).filter(Boolean);
    if (!skills.length) throw new URError('Add at least one skill so the draft targets the right track.', 'validation');
    const track = trackOf(skills[0]);
    const base = TEMPLATES.find(t => t.track === track && t.kind === kind) || TEMPLATES.find(t => t.kind === kind) || TEMPLATES[0];
    const role = jobTitle.trim() || `${(TRACKS[track] || { label: 'Generalist' }).label} role`;
    const caps = load().settings;
    return {
      title: `${role} — ${kind === 'screening' ? 'screening task' : 'work sample'}`,
      brief: `${base.brief}\n\nThis ${kind === 'screening' ? 'short screening task' : 'work sample'} for the ${role} position focuses on ${skills.join(', ')}. It uses provided starter material only and will not be used in our product.`,
      requirements: [...base.requirements], rubric: clone(base.rubric), skills, difficulty, kind,
      timeLimitMin: Math.min(base.timeLimitMin, caps.maxTimeLimitMin[kind]), estimatedHours: Math.min(base.estimatedHours, caps.maxEstimatedHours[kind]),
      aiPolicy: base.aiPolicy, submissionTypes: [...base.submissionTypes], source: 'generated', templateId: base.id,
    };
  },
};

/* ═══ Invite candidates found through verified scores ════════════════════ */
const jobInvites = {
  send(jobId, username, note = '') {
    const u = requireUser(['hr']);
    return tx(d => {
      const job = d.jobs.find(j => j.id == jobId && j.companyId === u.orgId); if (!job || job.status !== 'open') throw new URError('Choose one of your open jobs.', 'validation');
      const c = d.candidates[username]; if (!c) throw new URError('Candidate not found.', 'not_found');
      if (c.privacy.allowMessages === 'none') throw new URError(`${c.name} isn't accepting outreach from companies.`, 'privacy');
      if (d.applications.some(a => a.jobId === job.id && a.candidate === username && a.status !== 'withdrawn')) throw new URError(`${c.name} has already applied.`, 'duplicate');
      if ((d.jobInvites || []).some(i => i.jobId === job.id && i.username === username)) throw new URError('Already invited to this job.', 'duplicate');
      d.jobInvites = d.jobInvites || [];
      const inv = { id: uid('ji'), jobId: job.id, username, by: u.id, note: String(note).slice(0, 500), at: nowISO() };
      d.jobInvites.push(inv);
      const el = eligibilityFor(d, job, username);
      notify(d, c.userId, 'application', `${d.companies.find(x => x.id === job.companyId).name} invited you to apply for ${job.title}${el.met ? ' — you can apply with your verified scores' : ''}`, `job-detail.html?id=${job.id}`);
      audit(d, 'job.invite', job.id, username);
      return clone(inv);
    });
  },
  forJob(jobId) { return clone((load().jobInvites || []).filter(i => i.jobId == jobId)); },
};

/* ═══ Reviewer calibration: how each reviewer scores vs others on the same tasks ═ */
function calibration(d) {
  const scored = d.submissions.filter(hasScore);
  const taskMean = {}; scored.forEach(s => { (taskMean[s.taskId] = taskMean[s.taskId] || []).push(s.score.total); });
  Object.keys(taskMean).forEach(k => { const a = taskMean[k]; taskMean[k] = { mean: a.reduce((x, y) => x + y, 0) / a.length, n: a.length }; });
  const byRev = {};
  scored.forEach(s => { const r = s.score.reviewerId; (byRev[r] = byRev[r] || []).push({ total: s.score.total, delta: taskMean[s.taskId].n > 1 ? s.score.total - taskMean[s.taskId].mean : null }); });
  return Object.entries(byRev).map(([id, arr]) => {
    const u = d.users.find(x => x.id === id) || {}, org = u.orgId ? (d.companies.find(c => c.id === u.orgId) || {}).name : 'Unresume';
    const deltas = arr.map(a => a.delta).filter(x => x != null);
    return { reviewerId: id, name: u.name || id, org, reviews: arr.length, avgGiven: Math.round(arr.reduce((a, b) => a + b.total, 0) / arr.length * 10) / 10, avgDelta: deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length * 10) / 10 : null, comparable: deltas.length };
  }).sort((a, b) => Math.abs(b.avgDelta || 0) - Math.abs(a.avgDelta || 0));
}

/* ═══ Reminder "scheduler" (runs on page load for candidates; a cron/queue job in production) ═ */
function reminderTick() {
  const u = me(); if (!u || u.role !== 'candidate') return;
  const d = load(), c = d.candidates[u.username]; if (!c) return;
  const seen = (d.reminders || {})[u.id] || { deadlines: {}, jobs: {} };
  const dueSoon = d.attempts.filter(a => a.candidate === u.username && a.status === 'active' && a.deadlineAt && !seen.deadlines[a.id] && new Date(a.deadlineAt) - Date.now() < DAY && new Date(a.deadlineAt) > Date.now());
  const applied = new Set(d.applications.filter(a => a.candidate === u.username).map(a => a.jobId));
  const recs = d.jobs.filter(j => j.status === 'open' && !applied.has(j.id) && !seen.jobs[j.id] && j.skills.some(s => c.skills.includes(s)) && new Date(j.createdAt) > new Date(Date.now() - 14 * DAY)).slice(0, 3);
  if (!dueSoon.length && !recs.length) return;
  try {
    tx(dd => {
      dd.reminders = dd.reminders || {}; const r = dd.reminders[u.id] = dd.reminders[u.id] || { deadlines: {}, jobs: {} };
      dueSoon.forEach(a => { r.deadlines[a.id] = true; const t = taskOf(dd, a.taskId); notify(dd, u.id, 'submission', `Less than 24 hours left on ${t.title}`, `task-workplace.html?id=${t.id}`); });
      recs.forEach(j => { r.jobs[j.id] = true; const co = dd.companies.find(x => x.id === j.companyId) || {}; notify(dd, u.id, 'application', `Recommended for you: ${j.title} at ${co.name} (matches your skills)`, `job-detail.html?id=${j.id}`); });
    });
  } catch (e) {}
}

/* ═══ Product metrics (computed from stored activity — never fabricated) ═ */
function productMetrics(d) {
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const apps = d.applications;
  const reached = (a, st) => a.history.some(h => h.status === st);
  const started = d.attempts.length, completed = d.attempts.filter(a => a.status === 'submitted').length;
  const assessed = apps.filter(a => reached(a, 'scored'));
  const interviewed = apps.filter(a => reached(a, 'interview'));
  const hired = apps.filter(a => a.status === 'hired');
  const decided = apps.filter(a => ['hired', 'rejected'].includes(a.status));
  const hireDays = hired.map(a => (new Date(a.history.find(h => h.status === 'hired').at) - new Date(a.createdAt)) / DAY);
  const scored = d.submissions.filter(s => s.score && s.score.scoredAt);
  const reviewDays = scored.map(s => (new Date(s.score.scoredAt) - new Date(s.submittedAt)) / DAY);
  const hiresByCo = {}; hired.forEach(a => { const co = (d.jobs.find(j => j.id === a.jobId) || {}).companyId; hiresByCo[co] = (hiresByCo[co] || 0) + 1; });
  const hiringCos = Object.keys(hiresByCo).length, repeatCos = Object.values(hiresByCo).filter(n => n >= 2).length;
  const fb = d.feedback || [], fbBy = role => fb.filter(x => role === 'candidate' ? x.role === 'candidate' : ['hr', 'interviewer'].includes(x.role));
  const avgR = arr => arr.length ? Math.round(arr.reduce((a, x) => a + x.rating, 0) / arr.length * 10) / 10 : null;
  const overdue = d.submissions.filter(s => s.status === 'pending' && Date.now() - new Date(s.submittedAt) > d.settings.reviewSlaDays * DAY).length;
  return [
    { key: 'taskCompletion', label: 'Task completion rate', value: pct(completed, started), unit: '%', base: `${completed} of ${started} started attempts submitted` },
    { key: 'assessToInterview', label: 'Assessment → interview', value: pct(interviewed.length, assessed.length), unit: '%', base: `${interviewed.length} of ${assessed.length} assessed applications` },
    { key: 'interviewToHire', label: 'Interview → hire', value: pct(hired.filter(a => reached(a, 'interview')).length, interviewed.length), unit: '%', base: `${hired.length} hired of ${interviewed.length} interviewed` },
    { key: 'timeToHire', label: 'Average time to hire', value: hireDays.length ? Math.round(hireDays.reduce((a, b) => a + b, 0) / hireDays.length) : null, unit: ' days', base: `${hireDays.length} hire(s)` },
    { key: 'applicationSuccess', label: 'Application success rate', value: pct(hired.length, decided.length), unit: '%', base: `${hired.length} hired of ${decided.length} decided applications` },
    { key: 'repeatHiring', label: 'Company repeat-hiring rate', value: pct(repeatCos, hiringCos), unit: '%', base: `${repeatCos} of ${hiringCos} hiring companies hired 2+` },
    { key: 'reviewTurnaround', label: 'Review turnaround', value: reviewDays.length ? Math.round(reviewDays.reduce((a, b) => a + b, 0) / reviewDays.length * 10) / 10 : null, unit: ' days', base: `${reviewDays.length} reviews · ${overdue} overdue (> ${d.settings.reviewSlaDays}d)` },
    { key: 'verifiedApplyShare', label: 'Applications using verified scores', value: pct(apps.filter(a => a.route === 'verified_score').length, apps.length), unit: '%', base: 'no extra task needed' },
    { key: 'candidateSat', label: 'Candidate satisfaction', value: avgR(fbBy('candidate')), unit: '/5', base: `${fbBy('candidate').length} rating(s)` },
    { key: 'companySat', label: 'Company satisfaction', value: avgR(fbBy('company')), unit: '/5', base: `${fbBy('company').length} rating(s)` },
    { key: 'placements', label: 'Successful placements', value: hired.length + d.placements.filter(p => p.source === 'manual').length, unit: '', base: `${hired.length} hired on platform · ${d.placements.filter(p => p.source === 'manual').length} self-reported by academies` },
  ];
}

global.UR = {
  VERSION, URError, APP_STATUS, APP_FLOW, PIPELINE, SUB_STATUS, INTERVIEW_STATUS, TIERS, ROLES, INTEGRITY_LABEL,
  fmtDuration, tierFor, uid, TRACKS, trackOf, ASSESSMENT_KINDS, AI_POLICY, EXPERIENCE,
  verifiedApply, affiliation, feedback: feedbackApi, library, jobInvites, workload, metrics: () => productMetrics(load()),
  calibration: () => { requireUser(['admin']); return calibration(load()); }, reminderTick,
  auth, candidates, companies, academies, jobs, tasks, attempts, submissions, applications, interviews,
  disputes, reports, contact, verifications, notifications, messages, academy, team, analytics, admin,
  feed: feedApi, certificates, exportMine,
  settings: () => clone(load().settings),
  user: me,
  users: { get: id => { const u = load().users.find(x => x.id === id); return u ? { id: u.id, name: u.name, role: u.role, orgId: u.orgId, username: u.username, title: u.title } : null; } },
  reset() { localStorage.removeItem(KEY); db = null; load(); emit(); },
  storageMode: 'browser-localStorage',
};
})(window);
