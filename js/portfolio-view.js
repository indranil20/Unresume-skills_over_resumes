/* Portfolio item details popup.
   PortfolioView.open(username, itemId) — shows the task, the submitted output and the
   verified score for one portfolio item. What is shown is decided by
   UR.candidates.portfolioItem(), which applies the item's visibility rules. */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s) => `<span class="ms" aria-hidden="true"${s ? ` style="font-size:${s}px"` : ''}>${n}</span>`;
  const date = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const size = b => b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? esc(u) : null;
  let lastFocus = null;

  function close() {
    const bg = document.querySelector('.pv-bg'); if (!bg) return;
    bg.remove(); document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.pv-bg')) close(); });

  function linkBtn(href, icon, label) { const h = safeUrl(href); return h ? `<a class="pv-link" href="${h}" target="_blank" rel="noopener noreferrer">${ic(icon)}${esc(label)}${ic('open_in_new', 14)}</a>` : ''; }

  function body(v) {
    const p = v.item, t = v.task, s = v.submission, sc = v.score, h = v.history;
    const parts = [];
    if (p.description) parts.push(`<div class="pv-sec"><h4>${ic('notes', 15)}About this work</h4><p>${esc(p.description)}</p></div>`);

    if (t) {
      parts.push(`<div class="pv-sec"><h4>${ic('assignment', 15)}The task</h4>
        <div class="pv-chips" style="margin-bottom:12px">
          <span class="pv-chip">${ic('apartment')}${esc(t.company)}${t.jobTitle ? ' · ' + esc(t.jobTitle) : ''}</span>
          <span class="pv-chip">${ic('category')}${esc(t.kindLabel)}</span>
          ${t.difficulty ? `<span class="pv-chip">${ic('signal_cellular_alt')}${esc(t.difficulty)}</span>` : ''}
          ${t.estimatedHours ? `<span class="pv-chip">${ic('schedule')}~${t.estimatedHours}h</span>` : ''}
          ${t.aiPolicy ? `<span class="pv-chip">${ic('smart_toy')}${esc(t.aiPolicy)}</span>` : ''}
        </div>
        ${t.brief ? `<p>${esc(t.brief)}</p>` : `<div class="pv-note">${ic('lock')}<div>The brief for this task is confidential to ${esc(t.company)}. Recruiters signed in to Unresume can see it.</div></div>`}
        ${t.requirements.length ? `<ul class="pv-list" style="margin-top:12px">${t.requirements.map(r => `<li>${ic('check')}${esc(r)}</li>`).join('')}</ul>` : ''}
        ${t.skills.length ? `<div class="pv-chips" style="margin-top:12px">${t.skills.map(x => `<span class="pv-chip">${esc(x)}</span>`).join('')}</div>` : ''}
      </div>`);
    }

    if (sc) {
      parts.push(`<div class="pv-sec"><h4>${ic('verified', 15)}Verified score</h4>
        <div class="pv-score">
          <div class="pv-total"><b>${sc.total}</b><small>out of 100</small><div style="font-size:11.5px;color:var(--text3);margin-top:6px">Scored ${date(sc.scoredAt)}${sc.dual ? '<br>Two independent reviewers' : ''}</div></div>
          <div class="pv-crit">${sc.breakdown.map(b => `<div class="pv-row"><span>${esc(b.criterion)}</span><span class="pv-bar"><i style="width:${b.max ? Math.round(b.awarded / b.max * 100) : 0}%"></i></span><span>${b.awarded}/${b.max}</span></div>`).join('')}</div>
        </div></div>`);
      if (sc.strengths) parts.push(`<div class="pv-sec"><h4>${ic('thumb_up', 15)}What the reviewer liked</h4><p class="pv-quote">${esc(sc.strengths)}</p></div>`);
      if (sc.feedback) parts.push(`<div class="pv-sec"><h4>${ic('rate_review', 15)}Reviewer feedback <span style="text-transform:none;letter-spacing:0;font-weight:600">· only you can see this</span></h4><p class="pv-quote">${esc(sc.feedback)}</p>
        ${sc.suggestions.length ? `<ul class="pv-list" style="margin-top:10px">${sc.suggestions.map(x => `<li>${ic('lightbulb')}${esc(x)}</li>`).join('')}</ul>` : ''}</div>`);
    } else if (s && s.status === 'pending') {
      parts.push(`<div class="pv-note">${ic('hourglass_top')}<div>This submission is waiting for a reviewer. The verified score appears here once it's scored.</div></div>`);
    } else if (h) {
      parts.push(`<div class="pv-sec"><h4>${ic('verified', 15)}Verified result</h4><div class="pv-chips">
        ${h.score != null ? `<span class="pv-chip">${ic('grade')}${h.score}/100</span>` : ''}<span class="pv-chip">${ic('psychology')}${esc(h.skill)}</span>
        ${h.difficulty ? `<span class="pv-chip">${ic('signal_cellular_alt')}${esc(h.difficulty)}</span>` : ''}<span class="pv-chip">${ic('event')}${date(h.date)}</span></div>
        <p style="margin-top:10px;font-size:13px;color:var(--text3)">Reviewed by: ${esc(h.reviewer || 'Partner company reviewer')}. This result was imported before detailed rubric breakdowns were recorded.</p></div>`);
    } else if (p.type === 'task' && !v.owner) {
      parts.push(`<div class="pv-note">${ic('visibility_off')}<div>${esc(v.candidate.name)} keeps their scores private.</div></div>`);
    }

    if (s) {
      const links = [linkBtn(s.outputUrl, 'public', 'Open live output'), linkBtn(s.links.repo, 'code', 'Source code'), linkBtn(s.links.design, 'design_services', 'Design file')].filter(Boolean).join('');
      parts.push(`<div class="pv-sec"><h4>${ic('inventory_2', 15)}Submitted work</h4>
        ${links ? `<div class="pv-links" style="margin-bottom:12px">${links}</div>` : ''}
        ${s.files.map(f => `<div class="pv-file"><span class="pv-file-ic">${ic(f.slot === 'output' ? 'description' : 'lock')}</span><div style="min-width:0;flex:1"><b>${esc(f.name)}</b><small>${f.slot === 'output' ? 'Final output' : 'Working file — private to the candidate and reviewers'} · ${size(f.size)} · submitted ${date(s.submittedAt)}</small><small title="SHA-256 fingerprint recorded at submission">SHA-256 ${esc(String(f.sha256 || '').slice(0, 16))}…</small></div></div>`).join('')}
        ${s.files.length ? `<div class="pv-note" style="margin-top:10px">${ic('info')}<div>File downloads need secure file storage, which comes with the backend. The file's name, size and fingerprint are recorded so it can be checked later.</div></div>` : ''}
        ${!links && !s.files.length ? '<p style="color:var(--text3)">No files or links were attached.</p>' : ''}
        ${s.aiDisclosure ? `<div class="pv-note" style="margin-top:10px">${ic('smart_toy')}<div><b>AI-use disclosure:</b> ${esc(s.aiDisclosure)}</div></div>` : ''}
      </div>`);
    } else if (p.url) {
      parts.push(`<div class="pv-sec"><h4>${ic('link', 15)}Project link</h4><div class="pv-links">${linkBtn(p.url, 'open_in_new', 'Open project')}</div>
        <div class="pv-note warn" style="margin-top:12px">${ic('info')}<div>${p.type === 'personal' ? 'Personal project' : 'External work'} — added by the candidate and not reviewed or scored by Unresume.</div></div></div>`);
    }
    return parts.join('');
  }

  function open(username, itemId) {
    let v;
    try { v = UR.candidates.portfolioItem(username, itemId); }
    catch (e) { if (window.UI && UI.toast) UI.toast(e.message, 'error'); else alert(e.message); return; }
    close();
    lastFocus = document.activeElement;
    const p = v.item;
    const typeLabel = p.type === 'task' ? 'Verified task' : p.type === 'personal' ? 'Personal project' : 'External work';
    const bg = document.createElement('div');
    bg.className = 'pv-bg';
    bg.innerHTML = `<div class="pv" role="dialog" aria-modal="true" aria-labelledby="pv-title">
      <div class="pv-cover">
        <button type="button" class="pv-close" aria-label="Close">${ic('close', 20)}</button>
        <span class="pv-type${p.type === 'task' ? '' : ' ext'}">${ic(p.type === 'task' ? 'task_alt' : p.type === 'personal' ? 'person' : 'link', 14)}${typeLabel}</span>
        <h2 class="pv-title" id="pv-title">${esc(p.title)}</h2>
        <div class="pv-by">by <a href="candidate-profile.html?u=${encodeURIComponent(v.candidate.username)}">${esc(v.candidate.name)}</a>${v.candidate.headline ? ' · ' + esc(v.candidate.headline) : ''} · added ${date(p.createdAt)}${v.owner ? ` · visible to ${{ public: 'everyone', recruiters: 'recruiters only', private: 'only you' }[v.visibility]}` : ''}</div>
      </div>
      <div class="pv-body">${body(v) || '<p style="color:var(--text3)">No further details for this item.</p>'}</div>
    </div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('.pv-close')) close(); });
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    bg.querySelector('.pv-close').focus();
  }

  window.PortfolioView = { open, close };
})();
