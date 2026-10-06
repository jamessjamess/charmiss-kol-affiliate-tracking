/* ui-range.js — CR-10 §4.8: one field for a date range and its picker (no library).
   The field shows "01/12/2026 – 31/12/2026 · 31 days" and keeps the ISO dates in data-from / data-to. Apply writes them and sends one bubbling
   'change' from the field, so a screen reads both ends at once (el.dataset.from / .to). The picker: a header with the range ("1 Dec – 31 Dec 2026"),
   two months side by side (Mon … Sun), first click = start, second = end (a click before the start becomes the start), hover shows the range,
   ✎ types the dates (dd/mm/yyyy, checked by R.validateRange), arrows / PageUp / PageDown / Enter, Esc = Cancel; on a phone a full-screen sheet
   with the months one under another. Context for a field: el._rangeOpts = () => ({ band {from, to}, marks [{from, to, color, title}], min, max }).
   Adds to KT.ui: rangeHTML · setRange · openRange. */
Object.assign(KT.ui, (function (U) {
  'use strict';
  const { C, R, $, esc, today, ICON } = U;
  const G = C.range;
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthStart = d => d.slice(0, 8) + '01';
  const addMonths = (d, n) => { const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return iso(yy, mm + 1, 1); };
  const daysIn = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
  const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;   // Monday = 0
  const short = d => `${+d.slice(8, 10)} ${G.monthsShort[+d.slice(5, 7) - 1]}`;
  /* "1 Dec – 31 Dec 2026" · across years both carry the year · no end yet = "1 Dec – End date" */
  function bigText(a, b) {
    if (!a) return G.pick;
    if (!b) return `${short(a)} ${a.slice(0, 4)} – ${G.endDate}`;
    return a.slice(0, 4) === b.slice(0, 4) ? `${short(a)} – ${short(b)} ${b.slice(0, 4)}` : `${short(a)} ${a.slice(0, 4)} – ${short(b)} ${b.slice(0, 4)}`;
  }
  const fieldText = (a, b) => (a && b ? `${R.dmy(a)} – ${R.dmy(b)}` : '');

  /* ---------- the field ---------- */
  /* attrs: the caller's attributes (data-range, data-key …) · o = { label, clearable, disabled } */
  const rangeHTML = (attrs, from, to, o = {}) => {
    const n = R.rangeDays(from, to);
    return `<span class="drange dfield${o.disabled ? ' disabled' : ''}" ${attrs} data-from="${esc(from || '')}" data-to="${esc(to || '')}">` +
      `<button type="button" class="drange-t" aria-haspopup="dialog"${o.label ? ` aria-label="${esc(o.label)}"` : ''}${o.disabled ? ' disabled' : ''}>${ICON.calendar}` +
      `<span class="drange-v${from && to ? '' : ' ph'}">${esc(fieldText(from, to) || G.placeholder)}</span>${n ? `<span class="drange-n">${esc(G.days(n))}</span>` : ''}</button>` +
      (o.clearable && from ? `<button type="button" class="drange-x" aria-label="${esc(G.clear)}" title="${esc(G.clear)}">×</button>` : '') + `</span>`;
  };
  /* write a range into a field (the field re-draws its text) · fire = send 'change' */
  function setRange(el, from, to, fire) {
    el.dataset.from = from || ''; el.dataset.to = to || '';
    const n = R.rangeDays(from, to), v = el.querySelector('.drange-v');
    v.textContent = fieldText(from, to) || G.placeholder; v.classList.toggle('ph', !(from && to));
    let c = el.querySelector('.drange-n'); if (n) { if (!c) { c = document.createElement('span'); c.className = 'drange-n'; el.querySelector('.drange-t').appendChild(c); } c.textContent = G.days(n); } else if (c) c.remove();
    if (fire) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------- the picker ---------- */
  let P = null;   // { el, from, to, hover, view (first month shown), focus, typing, o, errs }
  const wide = () => innerWidth >= 720;
  function dlgEl() {
    let d = $('drp');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'drp'; d.className = 'drp'; d.setAttribute('aria-label', G.title); document.body.appendChild(d);
      d.addEventListener('cancel', e => { e.preventDefault(); close(); });
      d.addEventListener('click', onClick); d.addEventListener('keydown', onKey); d.addEventListener('input', onType);
      d.addEventListener('mouseover', e => { const b = e.target.closest('[data-d]'); if (P && P.from && !P.to && b && b.dataset.d !== P.hover) { P.hover = b.dataset.d; paintDays(); } });
      d.addEventListener('mousedown', e => { if (e.target === d) close(); });   // the backdrop
    }
    return d;
  }
  /* o (optional) = { from, to, anchor } to open with — e.g. "+ Add phase" opens on the day after the last Phase, waiting for the end */
  function openRange(el, o = {}) {
    if (!el || el.classList.contains('disabled')) return;
    const ctx = el._rangeOpts ? el._rangeOpts() || {} : {};
    const from = o.from !== undefined ? o.from : el.dataset.from || '', to = o.to !== undefined ? o.to : el.dataset.to || '';
    const focus = from || (ctx.band && ctx.band.from) || today();
    P = { el, anchor: o.anchor || null, from, to, hover: '', view: monthStart(focus), focus, typing: false, o: ctx, errs: [], startText: R.dmy(from), endText: R.dmy(to) };
    const d = dlgEl(); d.classList.toggle('sheet', !wide());
    draw();
    if (!d.open) d.showModal();
    place();
    focusDay();
  }
  function place() {
    const d = $('drp'); if (!wide()) { d.style.left = ''; d.style.top = ''; return; }
    const at = P.el.offsetParent || !P.anchor ? P.el : P.anchor;   // a hidden field opens from the button that asked (Custom)
    const r = at.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8)), below = r.bottom + 6, top = below + h > innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : Math.max(8, Math.min(below, innerHeight - h - 8));
    d.style.left = left + 'px'; d.style.top = top + 'px';
  }
  function close() {
    const d = $('drp'); if (d && d.open) d.close();
    const el = P && P.el, an = P && P.anchor; P = null;
    const back = el && el.isConnected && el.offsetParent ? el.querySelector('.drange-t') : an && an.isConnected ? an : null; if (back) back.focus();
  }
  function apply() {
    if (!P || !P.from || !P.to || P.errs.length) return;
    const { el, from, to } = P; close();
    if (el.isConnected) setRange(el, from, to, true);
  }
  const inRange = (d, a, b) => a && b && d >= a && d <= b;
  function dayClass(d) {
    const a = P.from, b = P.to || (P.from && P.hover && P.hover >= P.from ? P.hover : ''), o = P.o, c = [];
    if (d === P.from) c.push('start'); if (P.to && d === P.to) c.push('end'); else if (!P.to && b && d === b) c.push('end', 'prev');
    if (inRange(d, a, b) && d !== a && d !== b) c.push('in');
    if (!P.to && b && inRange(d, a, b)) c.push('prev');
    if (d === today()) c.push('today');
    if (o.band && inRange(d, o.band.from, o.band.to)) c.push('band');
    if ((o.min && d < o.min) || (o.max && d > o.max)) c.push('off');
    return c.join(' ');
  }
  const markOf = d => (P.o.marks || []).find(m => inRange(d, m.from, m.to));
  function monthHTML(m) {
    const n = daysIn(m), lead = dow(m), y = m.slice(0, 4), mi = +m.slice(5, 7) - 1;
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="drp-e"></span>';
    for (let i = 1; i <= n; i++) {
      const d = iso(y, mi + 1, i), mk = markOf(d), off = (P.o.min && d < P.o.min) || (P.o.max && d > P.o.max);
      cells += `<button type="button" class="drp-d ${dayClass(d)}${mk ? ' mk' : ''}" data-d="${d}" tabindex="${d === P.focus ? 0 : -1}"${off ? ' disabled' : ''}` +
        `${mk ? ` style="--mk:${mk.color}"` : ''} aria-label="${esc(`${G.dayLong[dow(d)]} ${i} ${G.months[mi]} ${y}${mk && mk.title ? ' · ' + mk.title : ''}`)}" aria-pressed="${d === P.from || d === P.to}"><span>${i}</span></button>`;
    }
    return `<div class="drp-m" data-m="${m}"><div class="drp-mt">${esc(`${G.months[mi]} ${y}`)}</div><div class="drp-g" role="grid">${G.dows.map(w => `<span class="drp-w">${esc(w)}</span>`).join('')}${cells}</div></div>`;
  }
  function monthsHTML() {
    if (wide()) return `<div class="drp-nav"><button type="button" class="icon-btn" data-nav="-1" aria-label="${esc(G.prev)}">‹</button><button type="button" class="icon-btn" data-nav="1" aria-label="${esc(G.next)}">›</button></div>` +
      `<div class="drp-ms">${monthHTML(P.view)}${monthHTML(addMonths(P.view, 1))}</div>`;
    /* a phone: 6 months back … 12 ahead, one under another */
    let out = ''; for (let i = -6; i <= 12; i++) out += monthHTML(addMonths(P.view, i));
    return `<div class="drp-ms vert">${out}</div>`;
  }
  function draw() {
    const d = $('drp'), ok = P.from && P.to && !P.errs.length;
    d.innerHTML = `<div class="drp-h"><div><div class="drp-l">${esc(G.selected)}</div><div class="drp-big" id="drp_big">${esc(bigText(P.from, P.to))}</div></div>` +
      `<button type="button" class="icon-btn drp-edit${P.typing ? ' on' : ''}" data-typing aria-pressed="${P.typing}" aria-label="${esc(P.typing ? G.showCalendar : G.typeDates)}" title="${esc(P.typing ? G.showCalendar : G.typeDates)}">${P.typing ? ICON.calendar : ICON.pencil}</button></div>` +
      (P.typing ? `<div class="drp-type"><div class="field"><label for="drp_s">${esc(G.start)}</label><input id="drp_s" inputmode="numeric" placeholder="${esc(C.common.datePh)}" value="${esc(P.startText)}" autocomplete="off"></div>` +
        `<div class="field"><label for="drp_e">${esc(G.end)}</label><input id="drp_e" inputmode="numeric" placeholder="${esc(C.common.datePh)}" value="${esc(P.endText)}" autocomplete="off"></div></div><div class="checks" id="drp_err"></div>` : '') +
      `<div class="drp-body" id="drp_body">${monthsHTML()}</div>` +
      `<div class="drp-f"><button type="button" class="btn" data-cancel>${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-apply${ok ? '' : ' disabled'}>${esc(G.apply)}</button></div>`;
    errs();
    if (!wide()) { const m = d.querySelector(`[data-m="${P.view}"]`); if (m) m.scrollIntoView({ block: 'start' }); }
  }
  /* repaint the days only (hover / a click) — keeps the scroll and the focus */
  function paintDays() {
    const d = $('drp');
    d.querySelectorAll('[data-d]').forEach(b => { const x = b.dataset.d, mk = markOf(x); b.className = `drp-d ${dayClass(x)}${mk ? ' mk' : ''}`; b.setAttribute('aria-pressed', String(x === P.from || x === P.to)); b.tabIndex = x === P.focus ? 0 : -1; });
    $('drp_big').textContent = bigText(P.from, P.to);
    d.querySelector('[data-apply]').disabled = !(P.from && P.to && !P.errs.length);
  }
  function errs() { const e = $('drp_err'); if (e) e.innerHTML = U.checksHTML({ errs: P.errs, warns: [], infos: [] }, ''); }
  function focusDay() { const b = $('drp') && $('drp').querySelector(`[data-d="${P.focus}"]`); if (b) b.focus(); }
  function pick(d) {
    if (!P.from || P.to) { P.from = d; P.to = ''; }
    else if (d < P.from) P.from = d;   // before the start: a new start, still waiting for the end
    else P.to = d;
    P.focus = d; P.hover = ''; P.errs = []; P.startText = R.dmy(P.from); P.endText = R.dmy(P.to);
    if (P.typing) { $('drp_s').value = P.startText; $('drp_e').value = P.endText; errs(); }
    paintDays();
  }
  function goTo(d) {
    P.focus = d;
    const m = monthStart(d);
    if (wide() && m !== P.view && m !== addMonths(P.view, 1)) { P.view = m < P.view ? m : addMonths(m, -1); $('drp_body').innerHTML = monthsHTML(); }
    else if (!wide() && !$('drp').querySelector(`[data-d="${d}"]`)) { P.view = m; $('drp_body').innerHTML = monthsHTML(); }
    paintDays(); focusDay();
  }
  function onClick(e) {
    if (!P) return;
    const day = e.target.closest('[data-d]'); if (day && !day.disabled) { pick(day.dataset.d); return; }
    const nv = e.target.closest('[data-nav]'); if (nv) { P.view = addMonths(P.view, +nv.dataset.nav); $('drp_body').innerHTML = monthsHTML(); return; }
    if (e.target.closest('[data-typing]')) { P.typing = !P.typing; draw(); place(); if (P.typing) $('drp_s').focus(); else focusDay(); return; }
    if (e.target.closest('[data-cancel]')) { close(); return; }
    if (e.target.closest('[data-apply]')) apply();
  }
  function onType(e) {
    if (!P || !P.typing || !['drp_s', 'drp_e'].includes(e.target.id)) return;
    P.startText = $('drp_s').value; P.endText = $('drp_e').value;
    const r = R.validateRange(P.startText, P.endText);
    P.errs = r.errs; P.from = r.from; P.to = r.to;
    const jump = e.target.id === 'drp_s' ? r.from : r.to;
    if (jump && R.isISODate(jump)) { P.focus = jump; const m = monthStart(jump); if (m !== P.view && m !== addMonths(P.view, 1)) { P.view = wide() && e.target.id === 'drp_e' ? addMonths(m, -1) : m; $('drp_body').innerHTML = monthsHTML(); } }
    errs(); paintDays();
  }
  function onKey(e) {
    if (!P) return;
    if (e.key === 'Enter' && e.target.closest('#drp_s, #drp_e')) { e.preventDefault(); apply(); return; }
    const day = e.target.closest('[data-d]'); if (!day) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); goTo(R.addDays(day.dataset.d, step)); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault(); const m = addMonths(day.dataset.d, e.key === 'PageUp' ? -1 : 1), dd = Math.min(+day.dataset.d.slice(8, 10), daysIn(m));
      goTo(m.slice(0, 8) + String(dd).padStart(2, '0')); return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!day.disabled) pick(day.dataset.d); }
  }
  /* every field on every page: click = open · × = clear */
  document.addEventListener('click', e => {
    const x = e.target.closest('.drange-x'); if (x) { const el = x.closest('.drange'); setRange(el, '', '', true); x.remove(); return; }
    const t = e.target.closest('.drange-t'); if (t) openRange(t.closest('.drange'));
  });
  addEventListener('resize', () => { if (P && $('drp') && $('drp').open) { $('drp').classList.toggle('sheet', !wide()); draw(); place(); } });

  return { rangeHTML, setRange, openRange };
})(KT.ui));
