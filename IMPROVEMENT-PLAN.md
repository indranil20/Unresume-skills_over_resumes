# Product improvement plan — credibility, friction, trust

Second improvement pass, built on top of the dashboards described in `AUDIT.md`. Nothing was restarted or duplicated; new rules live in `js/store.js` (the backend stand-in) and the existing pages were extended.

Status key: ✅ done · 🟡 partial / needs backend · ⏭ deliberately deferred

## Priorities
- **P0 (trust & effort):** scoring framework, verified-score applications, effort caps, AI policy, appeals, academy consent, recruiter-only visibility
- **P1 (efficiency & fairness):** template library + draft assistant, track leaderboards, review SLA, invites, metrics, login lockout
- **P2 (business):** proposed pricing, plan display

## 1. Candidate assessment friction
| Requirement | Status | Where |
|---|---|---|
| Don't force long tasks for every job | ✅ | Jobs can list `acceptVerified` (skill + min score). Qualifying candidates **apply with existing verified scores**, no new task (`UR.verifiedApply`, job-detail "Skip the task…") |
| Reusable verified skill assessments | ✅ | **Standard assessments** (Unresume-reviewed, e.g. React Component, Figma UI, CSS, Python). Library tab in Assessments |
| Companies accept existing scores | ✅ | Job editor field "Accept existing verified scores"; HR sees the evidence; can *optionally* request the role task |
| Screening vs company-specific assessments | ✅ | Task type: Screening (≤2h effort, ≤4h window), Company assessment (≤8h effort, ≤3 days), Standard (≤4h) |
| Show time, deadline, requirements | ✅ | Job page + workplace gate show type, ~effort, time window, deadline, AI policy |
| Assessment status & progress | ✅ | Journey stepper on job page; application steppers; Assessments page |
| Prevent excessive unpaid work | ✅ | Effort/time caps enforced on publish; companies must confirm "assessment exercise, not production work"; candidates can report exploitative tasks |

## 2. Verified score credibility
| Requirement | Status | Notes |
|---|---|---|
| Transparent, standardized framework | ✅ | Documented in `leaderboard.html#how`, `BACKEND.md`, code comment above `verifiedResults()` |
| How assessment scores roll up | ✅ | Track score = 10 × difficulty-weighted mean of best verified score per task |
| Difficulty levels & weighting | ✅ | Beginner ×0.8, Intermediate ×1.0, Advanced ×1.25 (admin-configurable) |
| Separate by skill category | ✅ | Six **tracks**; headline score is the primary track and always labelled; profile shows every track |
| Rubrics, feedback, history | ✅ | Existing breakdown + feedback; review log + authenticity record stored per score |
| Disputes & reassessment | ✅ | Score disputes ("Dispute / request re-review"), **integrity appeals**, **retakes** of standard assessments after 30-day cooldown |
| Prevent manipulation / unfair evaluation | ✅ | Best-attempt-only, cooldown, rubric locked after first submission, company can't rescore, disputes decided by Unresume, reviewer code of conduct |
| Reviewer calibration across companies | ⏭ | Needs volume data; noted for Enterprise (calibration reports) |

## 3. Company adoption & efficiency
| Requirement | Status | Notes |
|---|---|---|
| Templates / assessment library | ✅ | 7 templates across tracks + standard assessments, one click into the task builder |
| Simpler job + assessment creation | ✅ | Template → edit → publish; caps shown live |
| Shortlist using existing scores | ✅ | Verified-score applications land as "Scored" (ready to shortlist); Talent Search **Invite to job** |
| Comparison by relevant skills | ✅ | Existing Compare page (job-skill coverage row) |
| Pipeline application → hire | ✅ | Existing pipeline + verified route |
| Time-to-hire, conversion | ✅ | HR analytics: assessment→interview, interview→hire, time-to-hire, overdue reviews |
| Reduce reviewer workload | ✅ | Verified-score route skips reviews; templates have ready rubrics; SLA visibility |
| AI-assisted drafting with human approval | 🟡 | **Rule-based** draft assistant today; publishing a drafted task requires an explicit "I reviewed every section" confirmation (enforced in the store). LLM drafting needs `POST /api/tasks/draft` (see BACKEND.md) under the same rule |

## 4. Integrity & fraud prevention
| Requirement | Status | Notes |
|---|---|---|
| Plagiarism / similarity checks | 🟡 | File-hash, URL, note-text similarity, timing, tab-switch signals. Code/image similarity needs backend engines |
| Source-code / project authenticity review | ✅ | Reviewer records authenticity: own work / walkthrough needed / concern |
| Flag for manual investigation | ✅ | Concerns + automated flags → admin Integrity queue |
| Clear AI policy | ✅ | Per-task policy (allowed / disclose / not allowed), disclosure captured on submit, shown to reviewers; Terms §3 |
| AI ≠ automatic cheating | ✅ | Stated in workplace, reviewer guidelines and Terms |
| Review & verification records | ✅ | Score review log, authenticity, clear notes, audit log |
| Fair appeals | ✅ | Integrity appeals → different moderator → reinstate / uphold |
| No automatic bans | ✅ | Nothing in the code suspends or voids automatically; only admins act, with reasons |

## 5. Leaderboard fairness
✅ Track leaderboards and skill views (no cross-track ranking) · ✅ experience-level filter · ✅ difficulty weighting & best-attempt normalisation · ✅ methodology explained · ✅ eligibility thresholds · ✅ opt-out (Settings → Privacy) · ⏭ "role" leaderboards are the tracks (Frontend, Backend…); job-title leaderboards deferred until there's enough data per role.

## 6. Privacy, security, IP
✅ Portfolio visibility **Public / Recruiters only / Only me** (enforced in the store, not just hidden in UI) · ✅ confidential tasks (outputs can't go public) · ✅ IP & permitted-use terms · ✅ working files restricted to candidate + owning company · ✅ reports on jobs, profiles, chats · ✅ role checks on every store call · ✅ login lockout after 5 failures + notification · 🟡 2FA, real session management and encryption need the backend auth service.

## 7. Trust between candidates and companies
✅ Verified company profiles & badges · ✅ "genuine opening" signals on job pages (verified, active recruiter, hires made, typical review time) · ✅ report exploitative tasks · ✅ unpaid-work safeguards (caps + fair-use confirmation) · ✅ reviewer responsibilities + 5-day review target with overdue flags · ✅ transparent statuses · ✅ disputes & appeals.

## 8. Academy & student independence
✅ Candidates own accounts and history · ✅ **consent required** before an academy links an account (request → accept/decline in Settings) · ✅ candidates can **leave** an academy (ID converts, academy loses access to new activity) · ✅ referral attribution kept and shown on applications · ✅ academies can't edit candidate accounts.

## 9. Monetization readiness
✅ `pricing.html` — Free / Professional / Enterprise + academy partnership, marked **"Proposed pricing — not active"**; company profile shows "Free (beta)". No payment gateway, no enforced limits. Candidate access stays free.

## 10. Product analytics
✅ Admin "Product success metrics": task completion, assessment→interview, interview→hire, time-to-hire, application success, company repeat-hiring, review turnaround (+ overdue), verified-score application share, candidate & company satisfaction (from real 1–5 ratings collected after reviews and hires), placements. Values show "—" when there's no data; CSV export.

## 11. Simplicity
The core journey (Discover → Apply → Assessment → Verified score → Shortlist → Interview → Hired) is shown as a stepper on every job page; verified-score applications remove the assessment step entirely when a candidate already qualifies.

## Testing
- Framework suite (35 checks): track scoring, difficulty weights, track/skill/experience leaderboards, verified-score apply + duplicates + task request, effort/time caps, fair-use, drafted-task human-review gate, AI disclosure, recruiter-only visibility, authenticity concern, integrity appeal → reinstate, retake cooldown, academy consent/leave, login lockout, metrics never fabricated.
- Original workflow suite (32 checks) still passes.
- 67 page loads across all roles: 0 JavaScript errors.

## Deferred / needs backend
LLM drafting; code & image similarity engines; 2FA and session management; payment & plan enforcement; reviewer calibration analytics; email delivery for invites and affiliation requests.
