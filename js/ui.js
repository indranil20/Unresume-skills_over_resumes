/* Shared UI helpers — window.UI
   Toasts, modals, confirm dialogs, states (empty / loading / error), pills,
   avatars, formatting, CSV export and small accessible SVG charts. */
(function (global) {
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const GRADS = ['linear-gradient(135deg,#38bdf8,#2563eb)', 'linear-gradient(135deg,#8b5cf6,#6d28d9)', 'linear-gradient(135deg,#e879f9,#a855f7)', 'linear-gradient(135deg,#2dd4bf,#0d9488)', 'linear-gradient(135deg,#fbbf24,#f97316)', 'linear-gradient(135deg,#818cf8,#4f46e5)'];
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const grad = key => GRADS[hash(String(key || '')) % GRADS.length];
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (name, size = 36, key) => `<span class="u-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .36)}px;background:${grad(key || name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const icon = (name, size = 18, fill) => `<span class="material-symbols-rounded" style="font-size:${size}px${fill ? ";font-variation-settings:'FILL' 1" : ''}" aria-hidden="true">${name}</span>`;

const fmtDate = (iso, o = { day: 'numeric', month: 'short', year: 'numeric' }) => iso ? new Date(iso).toLocaleDateString(undefined, o) : '—';
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000, f = s < 0, a = Math.abs(s);
  const v = a < 60 ? 'just now' : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : a < 2592000 ? `${Math.round(a / 86400)}d` : fmtDate(iso);
  if (v === 'just now' || v.includes(' ')) return v;
  return f ? `in ${v}` : `${v} ago`;
}
const fmtBytes = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const param = k => new URLSearchParams(location.search).get(k);
const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;

const pill = (label, tint = 'gray', ic) => `<span class="d-pill ${tint}">${ic ? icon(ic, 14, true) : ''}${esc(label)}</span>`;
const appPill = st => { const s = UR.APP_STATUS[st] || { label: st, tint: 'gray' }; return pill(s.label, s.tint, s.icon); };
const subPill = sub => { const s = UR.SUB_STATUS[sub.status] || { label: sub.status, tint: 'gray' }; return pill(s.label, s.tint, sub.status === 'scored' ? 'verified' : null); };
const tierPill = t => pill(t.name, t.tint, t.icon);
const verifiedScore = (score, small) => `<span class="v-score${small ? ' sm' : ''}" title="Verified score — awarded by a company reviewer against a published rubric">${icon('verified', small ? 14 : 16, true)}${score}<small>/100</small></span>`;

/* ── states ── */
const empty = (ic, title, text = '', action = '') => `<div class="d-empty"><div class="d-empty-icon">${icon(ic, 30)}</div><div><div class="d-empty-title">${esc(title)}</div>${text ? `<div class="d-empty-text">${text}</div>` : ''}</div>${action}</div>`;
const loading = (text = 'Loading…') => `<div class="d-loading" role="status"><span class="spinner dark"></span>${esc(text)}</div>`;
const errorBox = (msg, retry) => `<div class="d-error" role="alert">${icon('error', 20, true)}<div style="flex:1">${esc(msg)}</div>${retry ? `<button class="see-all" onclick="${retry}">Retry</button>` : ''}</div>`;

/* ── toast ── */
let toastEl, toastT;
function toast(msg, kind = 'success') {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'd-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
  const ic = { success: 'check_circle', error: 'error', info: 'info' }[kind] || 'info';
  toastEl.className = `d-toast ${kind}`;
  toastEl.innerHTML = `${icon(ic, 20, true)}<span>${esc(msg)}</span>`;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), kind === 'error' ? 4200 : 2600);
}
/* Run an action; show its error instead of a false success. */
async function run(fn, success) {
  try { const r = await fn(); if (success) toast(typeof success === 'function' ? success(r) : success); return r; }
  catch (e) { console.error(e); toast(e.message || 'Something went wrong.', 'error'); throw e; }
}
const safe = fn => (...a) => run(() => fn(...a)).catch(() => {});

/* ── modal ── */
let modalStack = [];
function modal({ title, sub = '', icon: ic, body, submitLabel = 'Save', cancelLabel = 'Cancel', onSubmit, wide, danger, hideFooter, onOpen }) {
  const bg = document.createElement('div');
  bg.className = 'd-modal-bg open';
  bg.innerHTML = `<form class="d-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt-${modalStack.length}" novalidate>
    <div class="d-modal-head">${ic ? `<span class="sec-icon ${danger ? 'tint-red' : 'tint-purple'}" style="width:44px;height:44px;border-radius:14px">${icon(ic, 22, true)}</span>` : ''}
      <div style="min-width:0;flex:1"><h3 id="mt-${modalStack.length}">${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
      <button type="button" class="d-modal-close" data-close aria-label="Close">${icon('close', 22)}</button></div>
    <div class="d-modal-body pad">${body}<div class="m-error" hidden></div></div>
    ${hideFooter ? '' : `<div class="d-modal-foot"><span style="margin-right:auto"></span><button type="button" class="d-btn-ghost" data-close>${esc(cancelLabel)}</button>${onSubmit ? `<button type="submit" class="cta-btn${danger ? ' danger' : ''}" style="padding:12px 18px">${esc(submitLabel)}</button>` : ''}</div>`}
  </form>`;
  document.body.appendChild(bg);
  const form = bg.querySelector('form'), errEl = bg.querySelector('.m-error');
  const close = () => { bg.remove(); modalStack = modalStack.filter(m => m !== close); };
  modalStack.push(close);
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('button[type=submit]'); const label = btn.innerHTML;
    errEl.hidden = true; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const keep = await onSubmit(data, form);
      if (keep !== false) close();
    } catch (err) {
      errEl.hidden = false; errEl.innerHTML = `${icon('error', 18, true)}<span>${esc(err.message || 'Something went wrong')}</span>`;
      btn.disabled = false; btn.innerHTML = label;
    }
  });
  setTimeout(() => { const f = form.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus(); if (onOpen) onOpen(form); }, 30);
  return { close, form };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1](); });

function confirmDialog({ title, text = '', confirmLabel = 'Confirm', danger = false, input = null, icon: ic }) {
  return new Promise(resolve => {
    let done = false;
    const m = modal({
      title, icon: ic || (danger ? 'warning' : 'help'), danger, submitLabel: confirmLabel,
      body: `${text ? `<p class="m-text">${text}</p>` : ''}${input ? field({ name: 'value', label: input.label, type: input.type || 'textarea', placeholder: input.placeholder || '', required: input.required, value: input.value || '', options: input.options }) : ''}`,
      onSubmit: data => {
        if (input && input.required && !String(data.value || '').trim()) throw new Error(`${input.label} is required.`);
        done = true; resolve({ ok: true, value: data.value }); return true;
      },
    });
    const origClose = m.close;
    m.form.parentElement.addEventListener('click', e => { if (!done && (e.target === m.form.parentElement || e.target.closest('[data-close]'))) resolve({ ok: false }); });
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { if (!done) resolve({ ok: false }); document.removeEventListener('keydown', esc_); } });
    return origClose;
  });
}

/* ── form fields ── */
function field({ name, label, type = 'text', value = '', placeholder = '', required = false, options, hint = '', min, max, step, rows = 4 }) {
  const req = required ? ' required' : '';
  const id = `f-${name}-${Math.random().toString(36).slice(2, 6)}`;
  let control;
  if (type === 'textarea') control = `<textarea class="tc-textarea" id="${id}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}"${req}>${esc(value)}</textarea>`;
  else if (type === 'select') control = `<select class="tc-select" id="${id}" name="${name}"${req}>${(options || []).map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  else control = `<div class="input-wrap"><input id="${id}" type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}"${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''}${step != null ? ` step="${step}"` : ''}${req}></div>`;
  return `<div class="form-field"><label class="form-label" for="${id}">${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>${control}${hint ? `<div class="f-hint">${hint}</div>` : ''}</div>`;
}
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/* ── CSV export ── */
function csv(filename, headers, rows) {
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/* ── charts (single series, brand hue, hover tooltip, table fallback) ── */
let tipEl;
function tip(e, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
  if (!html) { tipEl.classList.remove('show'); return; }
  tipEl.innerHTML = html; tipEl.classList.add('show');
  const x = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8), y = Math.max(8, e.clientY - tipEl.offsetHeight - 12);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => tip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', e => tip(e, null));
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); tip({ clientX: r.left + r.width / 2, clientY: r.top }, el.getAttribute('data-tip')); });
    el.addEventListener('blur', e => tip(e, null));
  });
}
/* Horizontal bars: [{label, value, note}] */
function hbars(el, data, { max, suffix = '', empty: emptyText = 'No data yet' } = {}) {
  if (!data.length || data.every(d => !d.value)) { el.innerHTML = `<div class="chart-empty">${esc(emptyText)}</div>`; return; }
  const m = max || Math.max(...data.map(d => d.value), 1);
  el.innerHTML = `<div class="hbars">${data.map(d => `<div class="hbar-row"><span class="hbar-lbl">${esc(d.label)}</span><span class="hbar-track"><span class="hbar-fill" tabindex="0" data-tip="<b>${esc(d.label)}</b><br>${d.value}${suffix}${d.note ? ' · ' + esc(d.note) : ''}" style="width:${Math.max(d.value ? 2 : 0, d.value / m * 100)}%"></span></span><span class="hbar-val">${d.value}${suffix}</span></div>`).join('')}</div>`;
  bindTips(el);
}
/* Line chart over time: [{label, value}] with y in [0, yMax] */
function line(el, data, { yMax = 100, suffix = '', height = 180 } = {}) {
  if (data.length < 2) { el.innerHTML = `<div class="chart-empty">${data.length ? 'One verified score so far — progression appears after your second.' : 'No verified scores yet'}</div>`; return; }
  const W = 600, H = height, pl = 34, pr = 12, pt = 12, pb = 26;
  const xs = i => pl + i * (W - pl - pr) / (data.length - 1), ys = v => pt + (1 - v / yMax) * (H - pt - pb);
  const grid = [0, .25, .5, .75, 1].map(f => { const v = Math.round(yMax * f); return `<line x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}" class="g"/><text x="${pl - 6}" y="${ys(v) + 4}" class="ax" text-anchor="end">${v}</text>`; }).join('');
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(d.value).toFixed(1)}`).join('');
  const step = Math.ceil(data.length / 6);
  const xl = data.map((d, i) => i % step === 0 || i === data.length - 1 ? `<text x="${xs(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(d.short || '')}</text>` : '').join('');
  const pts = data.map((d, i) => `<circle cx="${xs(i)}" cy="${ys(d.value)}" r="4.5" class="pt" tabindex="0" data-tip="<b>${esc(d.label)}</b><br>${d.value}${suffix}${d.date ? ' · ' + esc(d.date) : ''}"/><circle cx="${xs(i)}" cy="${ys(d.value)}" r="14" class="hit" data-tip="<b>${esc(d.label)}</b><br>${d.value}${suffix}${d.date ? ' · ' + esc(d.date) : ''}"/>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img" aria-label="Line chart of ${data.length} points">${grid}<path d="${path}" class="ln"/>${xl}${pts}</svg>`;
  bindTips(el);
}
/* Vertical column chart: [{label, value}] */
function columns(el, data, { suffix = '', height = 160 } = {}) {
  if (!data.length || data.every(d => !d.value)) { el.innerHTML = `<div class="chart-empty">No data yet</div>`; return; }
  const m = Math.max(...data.map(d => d.value), 1);
  el.innerHTML = `<div class="cols" style="height:${height}px">${data.map(d => `<div class="col"><span class="col-val">${d.value || ''}</span><span class="col-bar" tabindex="0" data-tip="<b>${esc(d.label)}</b><br>${d.value}${suffix}" style="height:${d.value ? Math.max(3, d.value / m * 100) : 0}%"></span><span class="col-lbl">${esc(d.label)}</span></div>`).join('')}</div>`;
  bindTips(el);
}
function scoreRing(value, max, label) {
  const r = 34, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, value / max));
  return `<div class="score-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#eeedfd" stroke-width="7"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="#4f46e5" stroke-width="7" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 40 40)"/></svg><div class="score-inner"><div class="score-num">${value}</div><div class="score-max">/${max}</div></div></div>${label ? `<span class="sr-only">${esc(label)}: ${value} of ${max}</span>` : ''}`;
}

/* ── misc ── */
function onChange(fn) { let t; global.addEventListener('ur:change', () => { clearTimeout(t); t = setTimeout(fn, 30); }); }
function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function sortBy(arr, key, dir = 'desc') { const m = dir === 'asc' ? 1 : -1; return [...arr].sort((a, b) => { const x = typeof key === 'function' ? key(a) : a[key], y = typeof key === 'function' ? key(b) : b[key]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * m; }); }
function tabs(container, onSelect) {
  container.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    container.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
    onSelect(b.dataset.tab);
    try { const u = new URL(location.href); u.searchParams.set('tab', b.dataset.tab); history.replaceState(null, '', u); } catch (e) {}
  }));
}

global.UI = { esc, grad, initials, avatar, icon, fmtDate, fmtDateTime, timeAgo, fmtBytes, param, plural, pill, appPill, subPill, tierPill, verifiedScore,
  empty, loading, errorBox, toast, run, safe, modal, confirm: confirmDialog, field, toLocalInput, csv, parseCSV, hbars, line, columns, scoreRing, bindTips, onChange, debounce, sortBy, tabs };
})(window);
