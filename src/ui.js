/* ui.js — shared UI for every screen: store, banners, dialogs, the side drawer, menus, dd/mm/yyyy date fields,
   number formats, navigation and the header ⋯ actions (Backup / Restore / Export all). → KT.ui
   Screens live in screen-*.js and register on KT.screens; app.js wires the header and tabs. */
KT.ui = (function () {
  'use strict';
  const C = KT.content, R = KT.rules, S = KT.store;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => R.todayISO();

  /* ===================== storage ===================== */
  function browserStorage() { try { return window.localStorage || null; } catch (e) { return null; } }
  const store = S.createStore({ seed: window.KT_SEED, storage: browserStorage() });
  const state = () => store.state;
  let otherTabChanged = false;
  /* per-viewer conveniences (theme, table column set) — never the data itself */
  const pref = {
    get(k, d) { try { const v = localStorage.getItem('charmiss_kol_tracker_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('charmiss_kol_tracker_' + k, v); } catch (e) { /* not remembered */ } },
  };

  /* ===================== the current user (CR-04 §4.4 — what each person sees and can edit on screen) ===================== */
  const me = () => R.currentUser(state());
  const userId = () => (me() || {}).user_id || null;   // changed_by is always the real person
  /* CR-05 §4.2 — "View as role": sessionStorage only (closing the tab returns to the real role); memory when the browser refuses */
  const ROLE_KEY = 'charmiss_kol_tracker_view_as';
  let roleMem = null;
  const roleOverride = {
    get() { try { const v = sessionStorage.getItem(ROLE_KEY); return v || null; } catch (e) { return roleMem; } },
    set(v) { roleMem = v || null; try { if (v) sessionStorage.setItem(ROLE_KEY, v); else sessionStorage.removeItem(ROLE_KEY); } catch (e) { /* kept in memory */ } },
  };
  const actor = () => R.actingAs(me(), roleOverride.get());
  const viewingAs = () => { const u = me(), a = actor(); return u && a && a.role !== u.role ? a.role : null; };
  const can = action => R.can(actor(), action);
  /* asked again right before writing: a control may still be on screen from before a Switch user */
  const guard = action => { if (can(action)) return true; toast(C.roles.noPermission); return false; };
  /* PIC dropdowns (users ticked "Is PIC", active) — keep the value already chosen */
  const picList = keep => { const l = R.picNames(state()); return keep && !l.includes(keep) ? l.concat([keep]) : l; };
  const canSeeTab = key => (key === 'roles' ? can('roles') : key === 'settings' ? (actor() || {}).role !== 'accounting' : true);   // CR-09 §4.16

  /* every change goes through here: persist, refresh banners, optional toast */
  function commit(msg) {
    /* CR-08 §4.3 — a deal moved to Cancel (Deals · Move · a cancelled campaign): its payment lines not paid become Cancelled ("Deal cancelled") */
    const s = state();
    if (s && (s.payment_lines || []).length) { let e = 0; const evs = R.cancelDealLines(s, { eventId: () => store.newEventId() + e++, now: new Date().toISOString(), user: userId() }); if (evs.length) s.deal_events.push(...evs); }
    /* CR-10 §4.14 — Samples: a deal at Confirm QT gets a To ship · a cancelled deal's To ship → Not required · Ship by follows the deal's dates */
    if (s && Array.isArray(s.sample_shipments)) { let e = 0; const evs = R.syncShipments(s, { shipmentId: () => store.newId('shipment'), eventId: () => store.newEventId() + e++, now: new Date().toISOString(), user: userId() }); if (evs.length) s.deal_events.push(...evs); }
    /* CR-20 §4.8 — a package's payment status follows its line · a deal knows whether its package is paid (Dashboard Paid / Pending) */
    if (s && Array.isArray(s.kol_packages)) { let e = 0; const evs = R.syncPackages(s, { eventId: () => store.newEventId() + e++, now: new Date(), user: userId() }); if (evs.length) s.deal_events.push(...evs); }
    store.save(); renderBanners(); if (msg) toast(msg);
    /* CR-31 §2.7 — no room: the copies kept aside go to IndexedDB, then it is saved again (the red bar goes once it is) */
    if (!store.status.canSave && /quota/i.test(String(store.status.lastError || '')) && !commit.freeing) {
      commit.freeing = true; store.offloadCopies().then(r => { commit.freeing = false; if (r.moved.length) { store.save(); renderBanners(); } }).catch(() => { commit.freeing = false; });
    }
    if (api.onCommit) api.onCommit();   // CR-17: the side menu's badge (Approvals)
  }

  /* ===================== formats ===================== */
  const trimZeros = s => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  /* KPI style: 1,881,579 → 1.88M · 774,579 → 774.6K */
  function shortNum(n) {
    const v = Number(n) || 0, a = Math.abs(v), sign = v < 0 ? '-' : '';
    if (a >= 1e6) return sign + trimZeros((a / 1e6).toFixed(2)) + 'M';
    if (a >= 1e3) return sign + trimZeros((a / 1e3).toFixed(1)) + 'K';
    return sign + Math.round(a).toLocaleString('en-US');
  }
  const bahtShort = n => (Number(n) < 0 ? '-' : '') + '฿' + shortNum(Math.abs(Number(n) || 0));
  const dm = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const initials = name => { const t = String(name || '').trim(); return t ? Array.from(t)[0].toUpperCase() : '?'; };
  /* CR-16 §4.4 — a KOL's photo (this browser's IndexedDB, KT.photos) or the letter circle as before · cls '' (32px in KOL Master) · 'lg' (64px) · 'md' · 'sm' */
  const avatarHTML = (k, cls) => { const url = k && KT.photos && KT.photos.url(k.kol_id);
    return `<span class="av${cls ? ' ' + cls : ''}${url ? ' ph' : ''}">${url ? `<img src="${esc(url)}" alt="" decoding="async">` : esc(initials(k && k.display_name))}</span>`; };
  const range = (a, b) => (!a ? '' : !b || a === b ? R.dmy(a) : `${R.dmy(a)} – ${R.dmy(b)}`);
  /* platform icon (CR-02 §4.6) — state: 'posted' (full colour) · 'planned' (faded) · '' (plain, e.g. KOL accounts) */
  const pfIcon = (platform, state, tip) => `<span class="pfi${state ? ' ' + state : ''}" title="${esc(tip || platform)}" role="img" aria-label="${esc(tip || platform)}">${KT.icons.svg(platform)}</span>`;
  const tierRules = () => state().lookups.tier_rules || [];
  const distinct = arr => [...new Set(arr.filter(v => !R.isBlank(v)))].sort((a, b) => String(a).localeCompare(String(b), 'th'));
  /* journey step name on screen = the Template value; the editable Thai label is its tooltip */
  const stepLabel = sub => sub || '';
  const stepTitle = sub => { const s = R.stepOf(state().lookups, sub); return (s && s.label_th) || sub || ''; };
  const STATUS_CLS = { List: 'list', Inprocess: 'progress', Complete: 'done', Cancel: 'cancel' };
  const stChip = (status, n) => `<span class="st ${STATUS_CLS[status] || ''}">${esc(C.status[status] || status)}${n != null ? ` ${n}` : ''}</span>`;
  /* Stage = "<Status> · <SubStatus>"; Complete reads "Posted", Cancel reads "Cancelled" */
  const stageText = d => (d.status === 'Complete' ? C.stage.posted : d.status === 'Cancel' ? C.stage.cancelled : `${C.status[d.status] || d.status} · ${d.sub_status}`);
  const stageChip = d => `<span class="st ${STATUS_CLS[d.status] || ''}" title="${esc(stepTitle(d.sub_status))}">${esc(stageText(d))}</span>`;
  /* Stage column (CR-02 §4.5): List → grey chip · In process → dots + Brief / Script / Draft n of m · Complete → dots + Posted · Cancel → red chip */
  /* CR-09 §4.9: the journey step's own name everywhere · "(1 of 2)" in grey when the deal plans more than one draft */
  const stageLabel = d => R.stageLabel(state().lookups, d);
  function stageOfPlan(d) {
    const st = R.stageOf(state().lookups, d), n = st && d.status === 'Inprocess' ? R.draftNo(st) : 0, m = R.planOf(d).drafts;
    return n && m > 1 ? C.stage.ofPlan(n, m) : '';
  }
  /* tooltip (CR-07 §4.9): the same data as the Journey timeline, one line per step — date · ⏱ days · late / waiting / overdue */
  function planTip(d, logs) {
    const s = state(), JR = C.journey, t = R.dealTimeline(s.lookups, d, logs || R.logsOf(s, d.deal_id), R.postsOf(s, d.deal_id), today());
    const passed = x => ['done', 'late', 'nodate'].includes(x.state);
    return t.steps.map(x => [x.short, x.date ? R.dmy(x.date) : passed(x) ? JR.dateNotRecorded : x.expected ? JR.due(R.dmy(x.expected)) : '–',
      x.days != null ? JR.took(x.days) : '', x.late_days ? JR.late(x.late_days) : '', x.state === 'current' && x.waiting != null ? JR.waiting(x.waiting) : '',
      x.overdue_days ? JR.overdue(x.overdue_days) : ''].filter(Boolean).join(' · ') + (x.state === 'current' ? ' ◀' : ''))
      .concat(t.cancelled ? [JR.cancelled(t.cancelled.date ? R.dmy(t.cancelled.date) : '') + (t.cancelled.reason ? ` · ${t.cancelled.reason}` : '')] : []).join('\n');
  }
  function stageCell(d, logs) {
    const dots = R.stageDots(state().lookups, d), cls = STATUS_CLS[d.status] || '', tip = esc(planTip(d, logs));
    if (!dots.length) return `<span class="st ${cls}" title="${tip}">${esc(stageLabel(d))}</span>`;
    const of = stageOfPlan(d);
    return `<span class="stage ${cls}" title="${tip}"><span class="dots">${dots.map(x => `<i class="${x.state}"></i>`).join('')}</span><span class="lbl">${esc(stageLabel(d))}${of ? ` <span class="muted">${esc(of)}</span>` : ''}</span></span>`;
  }
  /* Phase / Campaign status chip (CR-02 §4.8): On going blue · Not started grey outline · Complete pale green */
  const PHASE_CLS = { ongoing: 'progress', wrap_up: 'wrap', not_started: 'outline', complete: 'done', on_hold: 'hold', cancelled: 'cancel', pending: 'apending', draft: 'adraft' };   // CR-29: Wrap-up (light orange)   // CR-17: Pending approval (yellow) · CR-21: Draft (grey)
  const phaseChip = st => `<span class="st ${PHASE_CLS[st] || ''}">${esc(C.phaseStatus[st] || st)}</span>`;
  /* Payment column (CR-02 §4.3): small grey term · coloured state; tooltip = the term's ticks with dates */
  const PAY_CLS = { paid: 'ok', deposit_paid: 'info', overdue: 'err', due: 'warn', not_due: 'muted', free: 'muted' };
  function payTicks(d) {
    const term = R.termOf(d);
    return R.paymentMilestones(term).map(f => ({ flag: f, label: f === 'paid_50' && term === 'split_50' ? C.payStep.deposit : C.payStep[f], on: !!d[f], date: d[f + '_date'] }));
  }
  function payCell(d, td) {
    const term = R.termOf(d), st = R.paymentState(d, td);
    /* CR-11 §4.6 — a closed deal from the old files with no term: "—", not "Not set" */
    if (!term && R.isImportedClosed(d)) return `<span class="pay muted" title="${esc(C.golive.imported)}">${esc(C.common.none)}</span>`;
    const tip = payTicks(d).map(x => `${x.label}: ${x.on ? R.dmy(x.date) || '✓' : '—'}`).join('\n') || C.payState[st];
    return `<span class="pay" title="${esc(tip)}"><span class="t">${esc(C.termShort[term || 'none'])}</span>${st === 'free' ? '' : ` · <b class="${PAY_CLS[st]}">${esc(C.payState[st])}</b>`}</span>`;
  }
  /* CR-13 §4.3 — the colour of a Phase: an ordinal grey ramp, the step from its place by start date in its Campaign (R.phaseStep) ·
     the same Phase is the same grey everywhere (By campaign band · Phase budget · Allocation · Phase Planner · Campaign & Phase table) ·
     mode 'light' | 'dark' (default: the theme on screen) · phaseVar = the same as a CSS token, for HTML that follows a theme switch by itself */
  const PHASE_RAMP = { light: ['#a3a19a', '#8a8881', '#72716b', '#5b5a55', '#4a4945', '#3a3936'], dark: ['#5f5e58', '#75736d', '#8b8982', '#a2a098', '#bbb9b1', '#d6d4cc'] };
  const themeMode = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const phaseColorAt = (step, mode) => PHASE_RAMP[mode || themeMode()][Math.min(6, Math.max(1, step || 4)) - 1];
  const phaseColor = (campaignId, phaseId, mode) => phaseColorAt(R.phaseStep(state(), phaseId), mode);
  const phaseVarAt = step => `var(--phs${Math.min(6, Math.max(1, step || 4))})`;
  const phaseVar = phaseId => phaseVarAt(R.phaseStep(state(), phaseId));
  /* CR-11 §4.13 #4 — a KOL name / @handle may break only after _ . - (and at spaces), never inside a word: "thapear.<wbr>thapear" */
  const nameHTML = n => esc(n == null ? '' : n).replace(/([._-])(?=[^._\-\s])/g, '$1<wbr>');
  /* a gap in percentage points, one way everywhere (CR-13 · CR-19: no target on screen any more): +15.4pp · −36.5pp · ±0.0pp */
  const ppText = v => (v == null || isNaN(v) ? '—' : `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${Math.abs(v).toFixed(1)}pp`);
  /* ⓘ (CR-05 §4.6): a button that opens a small popover — heading, what the number means and how it is worked out.
     info(body, heading) · or info(C.money.committed) for the money words of §4.5 ({h, d, f}) */
  const info = (body, heading) => {
    const o = typeof body === 'object' && body ? body : { h: heading || '', d: body || '' };
    return `<button type="button" class="info" data-info-h="${esc(o.h || '')}" data-info-d="${esc(o.d || '')}" data-info-f="${esc(o.f || '')}" aria-label="${esc(o.h || C.common.about)}" aria-expanded="false">ⓘ</button>`;
  };
  /* CR-11 §4.13 #2 — ⓘ only where the number is worked out (Committed · Pending · Paid · Remaining · ER · CPV · CPE · Days left, or a formula given) ·
     any other label carries its explanation as the tooltip of its text */
  const FORMULA_WORDS = ['Committed', 'Pending', 'Paid', 'Remaining', 'ER', 'CPV', 'CPE', 'Days left'];
  const infoObj = (body, heading) => (typeof body === 'object' && body ? body : { h: heading || '', d: body || '' });
  const isFormulaInfo = o => !!o.f || FORMULA_WORDS.some(w => String(o.h || '') === w || String(o.h || '').startsWith(w + ' '));
  const tipText = o => [o.d, o.f].filter(Boolean).join(' — ');
  const labelInfo = (label, body, heading) => { const o = infoObj(body, heading || label); return isFormulaInfo(o) ? `${esc(label)} ${info(o)}` : `<span class="tiph" title="${esc(tipText(o))}">${esc(label)}</span>`; };
  let infoBtn = null;
  function closeInfo(focusBack) { const p = $('infoPop'); if (p) p.remove(); if (infoBtn) { infoBtn.setAttribute('aria-expanded', 'false'); if (focusBack) infoBtn.focus(); } infoBtn = null; }
  function openInfo(btn) {
    closeInfo(); infoBtn = btn; btn.setAttribute('aria-expanded', 'true');
    const p = document.createElement('div'); p.id = 'infoPop'; p.className = 'infopop'; p.setAttribute('role', 'dialog'); p.tabIndex = -1;
    p.setAttribute('aria-label', btn.dataset.infoH || C.common.about);
    p.innerHTML = (btn.dataset.infoH ? `<b>${esc(btn.dataset.infoH)}</b>` : '') + `<p>${esc(btn.dataset.infoD)}</p>` + (btn.dataset.infoF ? `<p class="f">${esc(btn.dataset.infoF)}</p>` : '');
    document.body.appendChild(p);
    const r = btn.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - w - 8)) + 'px';
    p.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    p.focus();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button.info[data-info-d]');
    if (b) { e.preventDefault(); e.stopPropagation(); if (infoBtn === b) closeInfo(); else openInfo(b); return; }
    if (infoBtn && !e.target.closest('#infoPop')) closeInfo();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && infoBtn) { e.stopPropagation(); closeInfo(true); } }, true);
  document.addEventListener('scroll', e => { if (infoBtn && !(e.target.closest && e.target.closest('#infoPop'))) closeInfo(); }, true);
  const ICON = {
    calendar: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>',
    table: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M2 9.5h12M6 6v7.5"/></svg>',
    chart: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13.5V8M6.5 13.5V4M10 13.5V7M13.5 13.5V2.5"/></svg>',
    download: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11"/></svg>',
    expand: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
    pencil: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>',
    filter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M4.5 8h7M7 12.5h2"/></svg>',
    /* side menu (CR-04 §4.1): outline 20px */
    nav: {
      dashboard: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="7" rx="1.5"/><rect x="11" y="3" width="6" height="4" rx="1.5"/><rect x="11" y="9" width="6" height="8" rx="1.5"/><rect x="3" y="12" width="6" height="5" rx="1.5"/></svg>',
      campaign: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 17.5V3M4.5 3.5h10.5l-2.2 3.6 2.2 3.6H4.5"/></svg>',
      deals: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3.5" width="12" height="14" rx="2"/><path d="M7.5 3.5V2.5h5v1M7 8.5h6M7 11.5h6M7 14.5h3.5"/></svg>',
      payments: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 2 15V5a1.5 1.5 0 0 1 1.5-1.5H14v3"/><path d="M17 10h-3a1.5 1.5 0 0 0 0 3h3"/></svg>',
      kol: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M13 4.2a3 3 0 0 1 0 5.6M15.2 12.4c1.2.7 2 2 2.3 4.1"/></svg>',
      settings: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h8M15 5.5h2M3 10h3M10 10h7M3 14.5h9M16 14.5h1"/><circle cx="13" cy="5.5" r="2"/><circle cx="8" cy="10" r="2"/><circle cx="14" cy="14.5" r="2"/></svg>',
      shipments: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5 10 3l7 3.5v7.2L10 17l-7-3.3z"/><path d="M3 6.5 10 10l7-3.5M10 10v7M6.5 4.8l7 3.4"/></svg>',   // CR-11 §4.10
      roles: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5z"/><path d="m7.5 10 1.8 1.8 3.5-3.5"/></svg>',
    },
  };

  /* ===================== small helpers ===================== */
  /* CR-10 §4.10: a toast over an open dialog lives inside it (dialogs sit on top of the page) — always in the frame, bottom centre */
  const toastHost = t => { const d = [$('drp'), $('dlg'), $('cmodal')].find(x => x && x.open), host = d || document.body; if (t.parentNode !== host) host.appendChild(t); };
  /* a dialog about to be redrawn or closed gives the toast back to the page first (else innerHTML would take it away) */
  const rescueToast = box => { const t = $('toast'); if (t && box && box.contains(t)) document.body.appendChild(t); };
  function toast(msg) { const t = $('toast'); toastHost(t); t.classList.remove('act'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
  /* a toast with one action button (e.g. Undo), open for `ms` */
  /* CR-31 §2.5: more = [{ label, fn }] — more buttons after the first (e.g. Undo · Add note) */
  function toastAction(msg, label, fn, ms = 5000, more) {
    const t = $('toast'); clearTimeout(t._h); toastHost(t);
    const acts = [{ label, fn }].concat(more || []);
    t.innerHTML = `<span>${esc(msg)}</span>` + acts.map((a, i) => `<button type="button" class="tact" data-tact="${i}">${esc(a.label)}</button>`).join('');
    t.classList.add('show', 'act');
    const hide = () => t.classList.remove('show', 'act');
    t.querySelectorAll('.tact').forEach(b => { b.onclick = () => { clearTimeout(t._h); hide(); acts[+b.dataset.tact].fn(); }; });
    t._h = setTimeout(hide, ms);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  /* CSV for Excel / Looker: UTF-8 with BOM */
  function downloadCSV(name, header, rows, quiet) {
    download(name, '﻿' + R.toCSV(header, rows), 'text/csv;charset=utf-8');
    if (!quiet) toast(C.io.exported(name, rows.length));
  }
  /* CR-21 §3.4 — before the first Submit / Create the full check is a grey hint (red only after it) */
  const checksSoftHTML = (res, okText) => checksHTML({ errs: [], warns: res.warns || [], infos: (res.errs || []).map(x => ({ field: x.field, msg: x.msg })).concat(res.infos || []) }, okText);
  const checksHTML = (res, okText) => {
    /* one line per message (two fields can raise the same one) */
    const once = list => list.filter((x, i) => list.findIndex(y => y.msg === x.msg) === i);
    const errs = once(res.errs || []), warns = once(res.warns || []), infos = once(res.infos || []);
    return ((!errs.length && !warns.length && okText) ? `<div class="check ok">✓ <span>${esc(okText)}</span></div>` : '') +
      errs.map(x => `<div class="check err">✕ <span>${esc(x.msg)}</span></div>`).join('') +
      warns.map(x => `<div class="check ${x.red ? 'err' : 'warn'}">! <span>${esc(x.msg)}</span></div>`).join('') +   // CR-18: a red warning (does not block)
      infos.map(x => `<div class="check info">i <span>${esc(x.msg)}</span></div>`).join('');
  };
  const kv = (label, value, cls) => `<div class="kv"><span>${esc(label)}</span><b${cls ? ` class="${cls}"` : ''}>${R.isBlank(value) ? `<span class="muted">${C.common.none}</span>` : esc(value)}</b></div>`;
  const field = (key, label, input, o = {}) =>
    `<div class="field${o.wide ? ' wide' : ''}${o.cls ? ' ' + o.cls : ''}"><label for="f_${key}">${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}</label>${input}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
  const optionsHTML = (items, value, placeholder) => (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') +
    items.map(i => { const v = typeof i === 'object' ? i.value : i, l = typeof i === 'object' ? i.label : i; return `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  /* a list from lookups without its inactive values — but keep the value already chosen */
  const activeList = (key, keep) => R.activeValues(state().lookups, key).concat(keep && !R.activeValues(state().lookups, key).includes(keep) ? [keep] : []);
  function phaseOptionsHTML(selected, placeholder, campaignId, withCampaign) {
    const s = state();
    /* Campaigns in CR-02 §4.8 order, Phases by start date */
    return (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') + R.sortCampaigns(s.campaigns, s.phases, today()).filter(c => !campaignId || c.campaign_id === campaignId).map(c => {
      const ps = R.sortPhases(R.phasesOfCampaign(s, c.campaign_id));   // CR-17: a Phase waiting for approval is not offered
      const all = withCampaign ? `<option value="c:${esc(c.campaign_id)}" data-special${selected === 'c:' + c.campaign_id ? ' selected' : ''}>${esc(C.common.allOf(c.campaign_name))}</option>` : '';
      return ps.length || withCampaign ? `<optgroup label="${esc(c.campaign_name)}">${all}${ps.map(p => phaseOptionHTML(p, selected)).join('')}</optgroup>` : '';
    }).join('');
  }

  const narrow = () => matchMedia('(max-width:760px)').matches;
  /* sort helper: rows by a key function, blanks last, then a tie-breaker */
  function sortBy(rows, key, dir, tie) {
    const m = dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = key(a), y = key(b), bx = x == null || x === '', by = y == null || y === '';
      if (bx !== by) return bx ? 1 : -1;
      if (!bx && x !== y) return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')) * m;
      return tie ? tie(a, b) : 0;
    });
  }

  /* ===================== dd/mm/yyyy date field ===================== */
  /* A typed dd/mm/yyyy box + calendar button. The hidden input carries the ISO value and the caller's attributes
     (id, data-f …), and receives the input/change events, so screens read ISO exactly as before. */
  function parseDmy(text) {
    const t = String(text || '').trim(); if (!t) return '';
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(t) || /^(\d{2})(\d{2})(\d{4})$/.exec(t);
    if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3], iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return R.isISODate(iso) ? iso : null;
  }
  const dateHTML = (attrs, iso, o = {}) => `<span class="dfield${o.disabled ? ' disabled' : ''}"><input type="text" class="dtext" inputmode="numeric" placeholder="${esc(C.common.datePh)}" value="${esc(R.dmy(iso))}" autocomplete="off"${o.label ? ` aria-label="${esc(o.label)}"` : ''}${o.disabled ? ' disabled' : ''}>` +
    `<button type="button" class="dpick" tabindex="-1" aria-label="${esc(C.common.pickDate)}"${o.disabled ? ' disabled' : ''}>${ICON.calendar}</button><input type="date" class="dnative" tabindex="-1" aria-hidden="true"><input type="hidden" ${attrs} value="${esc(iso || '')}"></span>`;
  const hiddenOf = wrap => wrap.querySelector('input[type=hidden]');
  function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  function setDate(hidden, iso) { if (!hidden) return; hidden.value = iso || ''; const w = hidden.closest('.dfield'); if (w) w.querySelector('.dtext').value = R.dmy(iso); }
  function setDateDisabled(hidden, off) { const w = hidden.closest('.dfield'); if (!w) return; w.classList.toggle('disabled', off); w.querySelectorAll('.dtext,.dpick').forEach(x => { x.disabled = off; }); hidden.disabled = off; }
  document.addEventListener('input', e => {
    if (!e.target.classList || !e.target.classList.contains('dtext')) return;
    const h = hiddenOf(e.target.closest('.dfield')), iso = parseDmy(e.target.value);
    h.value = iso === null ? 'invalid' : iso;
    h.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.classList) return;
    if (t.classList.contains('dtext')) {
      const h = hiddenOf(t.closest('.dfield')), iso = parseDmy(t.value);
      if (iso) t.value = R.dmy(iso);
      h.value = iso === null ? 'invalid' : iso;
      h.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (t.classList.contains('dnative')) {
      const h = hiddenOf(t.closest('.dfield'));
      setDate(h, t.value); fire(h);
    }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.dpick'); if (!b || b.disabled) return;
    const w = b.closest('.dfield'), n = w.querySelector('.dnative'), h = hiddenOf(w);
    n.value = R.isISODate(h.value) ? h.value : '';
    try { n.showPicker(); } catch (err) { n.focus(); n.click(); }
  });

  /* ===================== CR-14 §4.2 — ui.multiSelect: one multi-select for every list of values ===================== */
  /* multiSelect(o) → HTML · the screen may draw it again whenever it likes — what is open and the search typed stay here, by o.id.
     o = { id, options [{value, label, sub (grey text: a count), chip (HTML on the right), dot (a colour · 'outline')}], value [values],
           label (the words on the button), aria, title, searchable (default: more than 7 options), placeholder,
           defaultValue (→ Reset instead of Clear), min (1: the last tick cannot go · minTip), inline (no button: the list sits in a Filters panel),
           onChange(values) } · a value changes at once (no Apply) · Esc or a click outside closes it · ↑ ↓ move · Space ticks.
     Its own classes only (.ms…): no rule of a toolbar / search box reaches inside (the CR-14 bug: .toolbar .search made the box 280px tall) */
  const MS = new Map();
  const SEARCH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>';
  const msSearchable = o => (o.searchable != null ? !!o.searchable : o.options.length > 7);
  function multiSelect(o) {
    const st = Object.assign({ open: false, q: '' }, MS.get(o.id) || {}, { o });
    MS.set(o.id, st);
    const MC = C.ms, value = o.value || [], search = msSearchable(o), open = !!o.inline || st.open;
    const shown = new Set(R.msFilter(o.options, search ? st.q : '').map(x => String(x.value)));
    const opt = x => {
      const on = value.includes(x.value), locked = R.msLocked(value, x.value, o.min);
      const dot = !x.dot ? '' : x.dot === 'outline' ? '<span class="ms-dot outline"></span>' : `<span class="ms-dot" style="background:${x.dot}"></span>`;
      return `<label class="ms-opt${shown.has(String(x.value)) ? '' : ' hidden'}"${locked && o.minTip ? ` title="${esc(o.minTip)}"` : ''}>` +
        `<input type="checkbox" data-msv="${esc(x.value)}"${on ? ' checked' : ''}${locked ? ' aria-disabled="true" data-mslock' : ''}>${dot}` +
        `<span class="ms-name">${esc(x.label)}</span>${x.sub != null && x.sub !== '' ? `<span class="ms-sub">${esc(x.sub)}</span>` : ''}${x.chip || ''}</label>`;
    };
    const pop = `<div class="ms-pop${open ? ' open' : ''}" role="group" aria-label="${esc(o.aria || o.label || '')}">` +
      (search ? `<div class="ms-qw">${SEARCH_ICON}<input type="text" class="ms-q" data-msq value="${esc(st.q)}" placeholder="${esc(o.placeholder || MC.search)}" aria-label="${esc(o.placeholder || MC.search)}" autocomplete="off"></div>` : '') +
      `<div class="ms-list">${o.options.map(opt).join('')}<div class="ms-none${shown.size ? ' hidden' : ''}">${esc(MC.noMatches)}</div></div>` +
      `<div class="ms-foot"><button type="button" class="btn small ghost" data-msall>${esc(MC.selectAll)}</button><button type="button" class="btn small ghost" data-msclear>${esc(o.defaultValue ? MC.reset : MC.clear)}</button></div></div>`;
    return `<div class="ms${o.inline ? ' inline' : ''}" data-ms="${esc(o.id)}">` +
      (o.inline ? '' : `<button type="button" class="ms-trigger" data-mst aria-haspopup="true" aria-expanded="${open}"${o.title ? ` title="${esc(o.title)}"` : ''}><span class="ms-l">${esc(o.label)}</span><span class="ms-caret" aria-hidden="true">▾</span></button>`) +
      pop + '</div>';
  }
  /* the words on a button: none → allText · one → its label · more → "n selected" */
  const msLabel = (value, options, allText) => (!value.length ? allText : value.length === 1 ? ((options.find(x => x.value === value[0]) || {}).label || '') : C.ms.nSelected(value.length));
  const msRoot = el => (el && el.closest ? el.closest('[data-ms]') : null);
  const msState = root => (root ? MS.get(root.dataset.ms) : null);
  /* below the button, its left edge · past the right of the window → its right edge */
  function msPlace(root) {
    const pop = root.querySelector('.ms-pop'); if (!pop || root.classList.contains('inline')) return;
    pop.classList.remove('right');
    if (pop.getBoundingClientRect().right > document.documentElement.clientWidth - 8) pop.classList.add('right');
  }
  function msOpen(root, on) {
    const st = msState(root); if (!st || root.classList.contains('inline')) return;
    st.open = on;
    const pop = root.querySelector('.ms-pop'), t = root.querySelector('[data-mst]');
    pop.classList.toggle('open', on); if (t) t.setAttribute('aria-expanded', String(on));
    if (on) { msPlace(root); const f = root.querySelector('[data-msq]') || root.querySelector('.ms-opt:not(.hidden) [data-msv]'); if (f) f.focus(); }
  }
  const msCloseAll = except => document.querySelectorAll('.ms:not(.inline) .ms-pop.open').forEach(p => { const r = msRoot(p); if (r !== except) msOpen(r, false); });
  /* a new value → the screen (it draws again) → the focus back where it was */
  function msSet(root, values, focusValue) {
    const st = msState(root); if (!st) return;
    const id = root.dataset.ms;
    st.o.value = values;
    st.o.onChange(values);
    const again = document.querySelector(`[data-ms="${CSS.escape(id)}"]`); if (!again) return;
    msPlace(again);
    const el = focusValue != null ? again.querySelector(`[data-msv="${CSS.escape(focusValue)}"]`) : again.querySelector('[data-msq]');
    if (el && again !== root) el.focus();
  }
  document.addEventListener('click', e => {
    const root = msRoot(e.target);
    msCloseAll(root);
    const st = msState(root); if (!st) return;
    if (e.target.closest('[data-mst]')) { msOpen(root, !st.open); return; }
    if (e.target.closest('[data-msall]')) { msSet(root, R.msSelectAll(st.o.options, st.o.value, msSearchable(st.o) ? st.q : '')); return; }
    if (e.target.closest('[data-msclear]')) { msSet(root, st.o.defaultValue ? st.o.defaultValue.slice() : st.o.min ? (st.o.value || []).slice(0, st.o.min) : []); return; }
    if (e.target.closest('input[data-mslock]')) e.preventDefault();   // the last one stays ticked (its tooltip says why)
  });
  document.addEventListener('change', e => {
    const cb = e.target.closest ? e.target.closest('input[data-msv]') : null; if (!cb) return;
    const root = msRoot(cb), st = msState(root); if (!st) return;
    msSet(root, R.msToggle(st.o.options, st.o.value, st.o.options.map(x => x.value).find(v => String(v) === cb.dataset.msv), cb.checked, st.o.min), cb.dataset.msv);
  });
  /* the search filters the list where it is (the box keeps its focus and caret) */
  document.addEventListener('input', e => {
    if (!e.target.matches || !e.target.matches('[data-msq]')) return;
    const root = msRoot(e.target), st = msState(root); if (!st) return;
    st.q = e.target.value;
    const shown = new Set(R.msFilter(st.o.options, st.q).map(x => String(x.value)));
    root.querySelectorAll('.ms-opt').forEach(l => l.classList.toggle('hidden', !shown.has(l.querySelector('[data-msv]').dataset.msv)));
    root.querySelector('.ms-none').classList.toggle('hidden', shown.size > 0);
  });
  document.addEventListener('keydown', e => {
    const root = msRoot(e.target), st = msState(root); if (!st) return;
    if (e.key === 'Escape' && st.open && !root.classList.contains('inline')) { e.preventDefault(); e.stopPropagation(); msOpen(root, false); const t = root.querySelector('[data-mst]'); if (t) t.focus(); return; }
    if (e.key === 'Enter' && e.target.matches('[data-msq]')) { e.preventDefault(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (e.target.matches('[data-mst]')) { if (e.key === 'ArrowDown') { e.preventDefault(); msOpen(root, true); } return; }
    const items = [...root.querySelectorAll('.ms-opt:not(.hidden) [data-msv]')]; if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(e.target), q = root.querySelector('[data-msq]');
    const next = e.key === 'ArrowDown' ? items[i < 0 ? 0 : Math.min(items.length - 1, i + 1)] : i <= 0 ? q || items[0] : items[i - 1];
    next.focus();
  }, true);

  /* ===================== searchable combobox (CR-05 §4.3) ===================== */
  /* enhances <select data-combo>: the select stays the source of truth (value, change event, disabled, hidden) and the
     box searches its options by name. Option data: data-st = status chip · data-range = dates (grey) · data-special = a choice
     on top (All …) · data-hide = only when searching (Cancelled) · <optgroup> = a group header. data-combo-new="campaign" →
     "+ New campaign" when nothing matches (for people who may create one). */
  const fold = t => String(t || '').toLocaleLowerCase('th').trim();
  const SELECT_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  function enhanceCombo(sel) {
    if (sel._combo) { sel._combo.sync(); return sel._combo; }
    const box = document.createElement('div'), lid = (sel.id || 'cb' + Math.random().toString(36).slice(2)) + '_list';
    box.className = 'combo';
    box.innerHTML = `<input type="text" class="combo-in" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${lid}" autocomplete="off" spellcheck="false">` +
      `<span class="combo-caret" aria-hidden="true">▾</span><div class="combo-list hidden" role="listbox" id="${lid}"></div>`;
    sel.insertAdjacentElement('afterend', box); sel.classList.add('combo-src'); sel.tabIndex = -1;
    const inp = box.querySelector('.combo-in'), list = box.querySelector('.combo-list');
    if (sel.getAttribute('aria-label')) inp.setAttribute('aria-label', sel.getAttribute('aria-label'));
    if (sel.id) { inp.id = sel.id + '_q'; const lab = document.querySelector(`label[for="${sel.id}"]`); if (lab) lab.setAttribute('for', inp.id); }
    let open = false, active = -1, q = '', shown = [];
    const item = (o, group) => ({ value: o.value, label: o.dataset.label || o.textContent, st: o.dataset.st || '', range: o.dataset.range || '', special: o.dataset.special != null, hide: o.dataset.hide != null, group,
      off: o.disabled || o.dataset.off != null, tip: o.dataset.tip || '' });   // CR-17: greyed, cannot be chosen (Pending approval)
    const read = () => [...sel.children].flatMap(ch => (ch.tagName === 'OPTGROUP' ? [...ch.children].map(o => item(o, ch.label)) : [item(ch, null)]));
    const mark = label => { const i = q ? fold(label).indexOf(fold(q)) : -1; return i < 0 ? esc(label) : `${esc(label.slice(0, i))}<mark>${esc(label.slice(i, i + q.length))}</mark>${esc(label.slice(i + q.length))}`; };
    function sync() {
      const o = sel.selectedOptions[0];
      if (!open) inp.value = o ? (o.dataset.label || o.textContent) : '';
      inp.disabled = sel.disabled; box.classList.toggle('disabled', sel.disabled);
      box.classList.toggle('hidden', sel.classList.contains('hidden'));
    }
    function render() {
      const all = read(), match = x => (q ? fold(x.label).includes(fold(q)) : !x.hide);
      shown = all.filter(x => match(x) && (!q || !x.special || fold(x.label).includes(fold(q))));
      if (active >= shown.length) active = shown.length - 1;
      let lastGroup = null;
      list.innerHTML = shown.map((x, i) => {
        const head = x.group && x.group !== lastGroup ? `<div class="combo-g">${esc(x.group)}</div>` : ''; lastGroup = x.group;
        return head + `<div class="combo-o${i === active ? ' on' : ''}${x.value === sel.value ? ' sel' : ''}${x.special ? ' sp' : ''}${x.off ? ' off' : ''}" role="option" id="${lid}_${i}" data-i="${i}" aria-selected="${x.value === sel.value}"${x.off ? ` aria-disabled="true" title="${esc(x.tip)}"` : ''}>` +
          `<span class="combo-l">${mark(x.label)}</span>${x.st ? phaseChip(x.st) : ''}${x.range ? `<span class="combo-r">${esc(x.range)}</span>` : ''}</div>`;
      }).join('') || `<div class="combo-empty">${esc((sel.dataset.combo === 'phase' ? C.combo.noPhase : sel.dataset.combo === 'pic' ? C.combo.noPic : C.combo.noCampaign)(q))}</div>` +
        (sel.dataset.comboNew === 'campaign' && can('campaign.edit') ? `<button type="button" class="btn small" data-combonew>${esc(C.campaign.newCampaignBtn)}</button>` : '');
      inp.setAttribute('aria-activedescendant', active >= 0 ? `${lid}_${active}` : '');
      const on = list.querySelector('.combo-o.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function openList() { if (open || sel.disabled) return; open = true; q = ''; active = Math.max(0, read().filter(x => !x.hide).findIndex(x => x.value === sel.value)); list.classList.remove('hidden'); inp.setAttribute('aria-expanded', 'true'); render(); inp.select(); }
    function close() { if (!open) return; open = false; q = ''; list.classList.add('hidden'); inp.setAttribute('aria-expanded', 'false'); sync(); }
    function choose(i) {
      const x = shown[i]; if (!x || x.off) return;
      const changed = x.value !== sel.value; SELECT_VALUE.set.call(sel, x.value); close();
      if (changed) fire(sel);
    }
    inp.addEventListener('focus', openList);
    inp.addEventListener('click', openList);
    inp.addEventListener('input', () => { if (!open) openList(); q = inp.value; active = 0; render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) openList(); active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); render(); }
      else if (e.key === 'Enter') { if (open) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Tab') close();
    });
    list.addEventListener('mousedown', e => { e.preventDefault(); const o = e.target.closest('[data-i]'); if (o) choose(+o.dataset.i); else if (e.target.closest('[data-combonew]')) { close(); inp.blur(); go('campaign', { newCampaign: true }); } });
    inp.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) close(); }, 0));
    /* code that sets the select's value / options / disabled keeps the box in step */
    Object.defineProperty(sel, 'value', { configurable: true, get() { return SELECT_VALUE.get.call(this); }, set(v) { SELECT_VALUE.set.call(this, v); if (!open) sync(); } });
    new MutationObserver(() => (open ? render() : sync())).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
    sel._combo = { sync, open: openList, close, input: inp };
    sync();
    return sel._combo;
  }
  const enhanceCombos = root => (root || document).querySelectorAll('select[data-combo]').forEach(enhanceCombo);
  /* <option>s for a Campaign combobox: name · status · dates, in sortCampaigns order (Cancelled only when searching) */
  /* o.forDeal (New deal · Bulk shortlist · Add to campaign · a deal's Campaign): a Campaign not approved yet is there, greyed with its chip, and cannot be picked (CR-17 §4.5) */
  /* CR-19 §4.6 — a pillar's colour (Awareness · Awareness & Consideration · Consideration · Conversion — in that order) · Not set = grey ·
     a chip with its colour and its short name ("Aware + Consider"), the full name in the tooltip */
  const PILLAR_VARS = ['--pl-aw', '--pl-ac', '--pl-co', '--pl-cv'];
  const pillarVar = p => { const i = R.PILLARS.indexOf(p); return i >= 0 ? `var(${PILLAR_VARS[i]})` : 'var(--series-grey)'; };
  const pillarChipHTML = (p, short) => (p ? `<span class="plc" title="${esc(p)}"><i style="background:${pillarVar(p)}"></i>${esc(short ? R.pillarShort(p) : p)}</span>` : '');
  /* CR-19 — the Gantt of Campaign & Phase › Timeline, shared with Dashboard › Campaign timeline: a range [from, to] laid out in % ·
     head = the tick labels (R.timeAxis ticks) with their grid line · grid = the grid lines of a row · today = the dashed Today line */
  function ganttAxis(from, to, ticks, today) {
    const days = R.dayDiff(R.addDays(to, 1), from), pct = iso => R.dayDiff(iso, from) / days * 100, inside = (ticks || []).filter(t => t.date >= from && t.date <= to);
    return { from, to, days, pct,
      head: inside.map(t => `<span class="gt-tick" style="left:${pct(t.date)}%">${esc(t.label)}</span><i class="gt-grid" style="left:${pct(t.date)}%"></i>`).join(''),
      grid: inside.map(t => `<i class="gt-grid" style="left:${pct(t.date)}%"></i>`).join(''),
      today: today && today >= from && today <= to ? `<i class="gt-today" style="left:${pct(today)}%"></i>` : '' };
  }
  /* CR-17 — the dates of a Campaign that waits for approval: its own Phases (they wait too) */
  const allDates = (s, cid) => { const ps = s.phases.filter(p => p.campaign_id === cid && !R.isDraft(p));
    return [ps.map(p => p.start_date).filter(Boolean).sort()[0] || null, ps.map(p => p.end_date).filter(Boolean).sort().pop() || null]; };
  /* o: { forDeal (a Campaign that waits is shown, not picked), year (CR-21 §3.2: only the Campaigns of that year — 'all' / none = every one) } ·
     CR-21: a draft is never a choice (it is only on its maker's My requests) */
  function campaignOptionsHTML(selected, placeholder, o = {}) {
    const s = state(), td = today(), years = o.year && o.year !== 'all' ? R.yearCampaignIds(s, o.year) : null;
    const list = s.campaigns.filter(c => !R.isDraft(c) && (!years || years.has(c.campaign_id) || c.campaign_id === selected));
    return (placeholder != null ? `<option value="" data-special>${esc(placeholder)}</option>` : '') + R.sortCampaigns(list, s.phases, td).map(c => {
      const st = R.campaignEffectiveStatus ? R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, c.campaign_id), td) : R.campaignStatus(R.phasesOfCampaign(s, c.campaign_id), td), [a, z] = R.isApproved(c) ? R.scopeRange(s, { campaignId: c.campaign_id }) : allDates(s, c.campaign_id);
      const closed = o.forDeal && R.isApproved(c) && R.isClosed(c) && st !== 'cancelled' && c.campaign_id !== selected;   // CR-29 §3.5: Complete — no new deal
      const chip = st, off = (o.forDeal && !R.isApproved(c) && c.campaign_id !== selected) || closed;
      return `<option value="${esc(c.campaign_id)}" data-st="${chip}" data-range="${esc(a ? `${dm(a)} – ${dm(z)}` : '')}"${st === 'cancelled' ? ' data-hide' : ''}` +
        `${off ? ` disabled data-off data-tip="${esc(closed ? C.close.isComplete : C.approval.waiting)}"` : ''}${c.campaign_id === selected ? ' selected' : ''}>${esc(c.campaign_name)}</option>`;
    }).join('');
  }
  /* one Phase <option>: name · status · dates */
  const phaseOptionHTML = (p, selected, label) => `<option value="${esc(p.phase_id)}" data-st="${R.phaseStatus(p, today())}" data-range="${esc(`${dm(p.start_date)} – ${dm(p.end_date)}`)}"${p.phase_id === selected ? ' selected' : ''}>${esc(label || R.phaseName(state(), p.phase_id))}</option>`;

  /* CR-06 §4.4 — reliability: "Reliable · 100%" / "Not enough data" (never colour alone) */
  function reliabilityChip(p, short) {
    const PF = C.perf, b = PF.badge[p.badge], pct = p.rate == null ? null : Math.round(p.rate * 1000) / 10;
    const tip = p.measured ? PF.postsOf(p.onTime, p.measured) : PF.noData;
    /* CR-11 §4.6 — not enough data is not a warning: a faint "—" that says what it needs */
    if (p.badge === 'none') return `<span class="rel rel-none faint" title="${esc(C.kol.perfNeeds(R.perfSettings(state().lookups).minPosts))}${p.measured ? ` · ${esc(tip)}` : ''}">${esc(C.common.none)}</span>`;
    return `<span class="rel rel-${p.badge}" title="${esc(tip)}">${esc(p.badge === 'none' || short || pct == null ? b : PF.badgeLine(b, pct))}</span>`;
  }

  /* ===================== CR-25 — Partner type (KOL · Affiliate · Both) ===================== */
  /* the small chip beside a name (New deal · Pipeline card · Deal modal): AFF · KOL+AFF · nothing for a KOL (§6 #6) */
  function partnerChipHTML(k) {
    const t = R.partnerTypeOf(k); if (t === 'kol') return '';
    return `<span class="ptc ptc-${t}" title="${esc(C.partner.chipTip(R.partnerTypeLabel(state().lookups, t)))}">${esc(C.partner.chip[t])}</span>`;
  }
  /* KOL Master › Partner: the word (KOL grey · Affiliate · Both) */
  const partnerTagHTML = k => { const t = R.partnerTypeOf(k); return `<span class="ptag ptag-${t}">${esc(R.partnerTypeLabel(state().lookups, t))}</span>`; };
  /* the buttons of Partner type: KOL · Affiliate · Both (forms) · o.all → All first ('' — filters) · o.keys → only these */
  function partnerSegHTML(attr, value, o = {}) {
    const items = (o.all ? [{ key: '', label: C.partner.all }] : []).concat(R.partnerTypesOf(state().lookups).filter(t => !o.keys || o.keys.includes(t.key))), v = value || '';
    return `<div class="seg ptseg"${o.id ? ` id="${o.id}"` : ''} role="radiogroup" aria-label="${esc(C.partner.field)}">` +
      items.map(t => `<button type="button" role="radio" ${attr}="${esc(t.key)}" class="${t.key === v ? 'on' : ''}" aria-checked="${t.key === v}">${esc(t.label)}</button>`).join('') + `</div>`;
  }
  /* one press: that button on, the others off → its key */
  function partnerSegPick(btn, attr) {
    btn.parentElement.querySelectorAll('button').forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    return btn.getAttribute(attr) || '';
  }

  /* ===================== product picker (CR-06 §4.3) ===================== */
  /* several products of the catalog, searched by TR code or name (active products only) · chips with × (a product that deals
     use cannot be taken off: locked(code) → number of deals) · "+ New product" adds to the catalog right away (canNew) */
  const markQ = (label, q) => { const i = q ? fold(label).indexOf(fold(q)) : -1; return i < 0 ? esc(label) : `${esc(label.slice(0, i))}<mark>${esc(label.slice(i, i + q.length))}</mark>${esc(label.slice(i + q.length))}`; };
  function productChipsHTML(codes, locked, askUsed) {
    const s = state(), P = C.products;
    return codes.map(code => {
      const p = R.productByCode(s, code) || { tr_code: code, product_name: code }, n = (locked && locked(code)) || 0;
      return `<span class="pchip" title="${esc(R.productLabel(p))}"><b>${esc(p.tr_code)}</b><span class="pn">${esc(R.productShort(p))}</span>${p.active === false ? `<span class="muted small">${esc(P.inactiveTag)}</span>` : ''}` +
        `<button type="button" class="x" data-pprm="${esc(code)}"${n && askUsed ? ` data-used="${n}" title="${esc(P.usedByDeals(n))}" aria-label="${esc(`${P.remove} ${p.tr_code} · ${P.usedByDeals(n)}`)}"` : n ? ` disabled title="${esc(P.usedByDeals(n))}" aria-label="${esc(P.usedByDeals(n))}"` : ` aria-label="${esc(`${P.remove} ${p.tr_code}`)}"`}>×</button></span>`;
    }).join('');
  }
  function productPickerHTML(id, codes, locked, askUsed) {
    return `<div class="ppick" id="${id}"><div class="pchips" data-pchips>${productChipsHTML(codes, locked, askUsed)}</div>` +
      `<div class="combo"><input type="text" class="combo-in" id="${id}_q" data-key="products" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}_list" placeholder="${esc(C.products.pickerPh)}" autocomplete="off" spellcheck="false">` +
      `<div class="combo-list hidden" role="listbox" id="${id}_list"></div></div></div>`;
  }
  /* api: {get: () => codes, set: codes (the picker redraws its chips itself), locked, canNew, askUsed (CR-09 §4.7: a product deals use can go, after a question)} */
  function wireProductPicker(root, api) {
    const inp = root.querySelector('.combo-in'), list = root.querySelector('.combo-list'), chips = root.querySelector('[data-pchips]'), P = C.products;
    let open = false, active = 0, q = '', shown = [];
    const redraw = () => { chips.innerHTML = productChipsHTML(api.get(), api.locked, api.askUsed); };
    function render() {
      const picked = api.get();
      shown = (state().products || []).filter(p => p.active !== false && !picked.some(c => R.sameCode(c, p.tr_code)) && (!q || fold(R.productLabel(p)).includes(fold(q)))).slice(0, 60);
      if (active >= shown.length) active = shown.length - 1;
      list.innerHTML = (shown.map((p, i) => `<div class="combo-o${i === active ? ' on' : ''}" role="option" id="${list.id}_${i}" data-i="${i}"><span class="combo-l">${markQ(R.productLabel(p), q)}</span></div>`).join('') ||
        `<div class="combo-empty">${esc(q ? P.pickerNoMatch(q) : P.empty)}</div>`) + (api.canNew ? `<button type="button" class="btn small" data-pnew>${esc(P.newProduct)}</button>` : '');
      inp.setAttribute('aria-activedescendant', active >= 0 ? `${list.id}_${active}` : '');
      const on = list.querySelector('.combo-o.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    const openList = () => { if (open) return; open = true; active = 0; list.classList.remove('hidden'); inp.setAttribute('aria-expanded', 'true'); render(); };
    const close = () => { if (!open) return; open = false; q = ''; inp.value = ''; list.classList.add('hidden'); inp.setAttribute('aria-expanded', 'false'); };
    const add = code => { api.set(api.get().concat([code])); redraw(); };
    function choose(i) { const p = shown[i]; if (!p) return; add(p.tr_code); q = ''; inp.value = ''; active = 0; render(); }
    inp.addEventListener('focus', openList);
    inp.addEventListener('click', openList);
    inp.addEventListener('input', () => { if (!open) openList(); q = inp.value; active = 0; render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) openList(); active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); render(); }
      else if (e.key === 'Enter') { if (open) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Backspace' && !inp.value) { const codes = api.get(), last = codes[codes.length - 1]; if (last && !((api.locked && api.locked(last)) || 0)) { api.set(codes.slice(0, -1)); redraw(); } }   // a product deals use: only with its ×
      else if (e.key === 'Tab') close();
    });
    list.addEventListener('mousedown', e => {
      e.preventDefault();
      const o = e.target.closest('[data-i]'); if (o) { choose(+o.dataset.i); return; }
      if (e.target.closest('[data-pnew]')) { const text = q; close(); inp.blur(); openNewProduct(text, code => add(code)); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 0));
    chips.addEventListener('click', async e => {
      const b = e.target.closest('[data-pprm]'); if (!b || b.disabled) return;
      const code = b.dataset.pprm, n = Number(b.dataset.used) || 0;
      if (n) { const p = R.productByCode(state(), code) || { tr_code: code, product_name: code }; if (!(await confirmDialog(P.removeUsedTitle(R.productShort(p)), P.removeUsedBody(n), P.removeAnyway, true))) return; }
      api.set(api.get().filter(c => c !== code)); redraw(); inp.focus();
    });
    return { redraw };
  }
  /* "+ New product" (CR-11 §4.3: modal M · a panel in place when another modal is open): TR code + name (+ variant) → into the catalog now ·
     then(code) · o.created(code) = after a stand-alone create (Settings › Products lights the row up) */
  function openNewProduct(text, then, o = {}) {
    if (!can('products.edit') && !can('campaign.edit') && !can('campaign.products')) { toast(C.roles.noPermission); return; }
    const P = C.products, t = R.trim(text || ''), d = { tr_code: /\s/.test(t) ? '' : t, product_name: /\s/.test(t) ? t : '', variant: '' }, touched = new Set();
    const inPanel = cm.open && !!cmo;
    const body = `<div class="fields">` +
      field('np_code', P.colCode, `<input id="f_np_code" data-np="tr_code" data-key="tr_code" value="${esc(d.tr_code)}" placeholder="${esc(P.codePh)}" autocomplete="off">`, { req: 1 }) +
      field('np_variant', P.colVariant, `<input id="f_np_variant" data-np="variant" value="" placeholder="${esc(P.variantPh)}" autocomplete="off">`) +
      field('np_name', P.colName, `<input id="f_np_name" data-np="product_name" data-key="product_name" value="${esc(d.product_name)}" placeholder="${esc(P.namePh)}" autocomplete="off">`, { req: 1, wide: 1 }) + `</div>`;
    const left = `<div class="checks" id="np_checks"></div>`, buttons = cmButtons(P.createProduct, 'np_ok', { back: inPanel });
    const owner = inPanel ? cmo : null;
    if (inPanel) modalPanel({ title: P.newTitle, body, left, buttons });
    else createModal({ size: 'M', title: P.newTitle, body, foot: [left, buttons], focus: d.tr_code ? '#f_np_name' : '#f_np_code' });
    const chk = all => {
      const res = R.validateProduct(state(), d, true), errs = res.errs.filter(e => all || touched.has(e.field));
      $('np_checks').innerHTML = checksHTML({ errs, warns: [], infos: [] }, '');
      cm.querySelectorAll('[data-np][data-key]').forEach(el => el.classList.toggle('invalid', errs.some(e => e.field === el.dataset.key)));
      return res;
    };
    cm.querySelectorAll('[data-np]').forEach(el => {
      el.addEventListener('input', () => { d[el.dataset.np] = el.value; chk(false); });
      el.addEventListener('change', () => { touched.add(el.dataset.np); chk(false); });
    });
    $('np_ok').addEventListener('click', () => {
      if (chk(true).errs.length) return;
      const p = R.newProduct(d); state().products.push(p); commit();
      if (inPanel) { if (then) then(p.tr_code); if (owner && owner.redraw && cmo === owner) owner.redraw(); toast(P.added(p.tr_code)); return; }
      closeModal(); if (then) then(p.tr_code);
      if (o.created) o.created(p.tr_code); else toast(P.added(p.tr_code));
    });
  }
  /* ===================== CR-11 §4.3 — create forms used by more than one modal ===================== */
  /* Create KOL (New deal › Create KOL · KOL Master › + New KOL): name · platform + handle · followers · link · type · category · gender ·
     contact · PIC · default term · c = { draft, touched, submitted, anyway } (R.createKolDraft) · the buttons are data-act ckCreate / ckUse */
  /* CR-30 §3.5 — two columns: who (Name · Partner type KOL / Affiliate · Platform * · Profile link * · Username * taken from the link · Followers) · details
     (Type · Category · Gender · Contact on one row · PIC · Default term) · o.vault: Payee & shipping (optional, locked until the vault is unlocked) under them */
  function kolCreateHTML(x, o = {}) {
    const L = state().lookups, CK = C.bulk.ck, NK = C.newKol;
    const inp = (k, type, extra) => `<input${type ? ` type="${type}"` : ''} id="f_ck_${k}" data-ck="${k}" data-key="ck_${k}" value="${esc(x[k] == null ? '' : x[k])}" autocomplete="off"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''}${extra || ''}>`;
    const sel = (k, items, ph) => `<select id="f_ck_${k}" data-ck="${k}" data-key="ck_${k}">${optionsHTML(items, x[k], ph)}</select>`;
    const types = (L.kol_type_list || []).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label }));
    const contact = `<div class="nk-contact">${sel('contact_channel', R.CONTACT_CHANNELS.map(v => ({ value: v, label: v })), CK.notSet)}` +
      `<input id="f_ck_contact_id" data-ck="contact_id" data-key="ck_contact_id" value="${esc(x.contact_id == null ? '' : x.contact_id)}" placeholder="${esc(C.kol.contactIdPh[x.contact_channel || ''] || NK.contactPh)}" maxlength="${R.CONTACT_ID_MAX}" autocomplete="off" aria-label="${esc(C.kol.contactId)}"></div>`;
    return `<div id="ck_dup"></div><div class="nk-grid"><div class="nk-col"><div class="fields one">
        ${field('ck_display_name', CK.name, inp('display_name'), { req: 1 })}
        ${field('ck_partner_type', C.partner.field, partnerSegHTML('data-ckpt', x.partner_type === 'affiliate' ? 'affiliate' : 'kol', { id: 'f_ck_partner_type', keys: ['kol', 'affiliate'] }), { req: 1 })}
        ${field('ck_platform', CK.platform, sel('platform', (L.platform_list || []).map(v => ({ value: v, label: v })), CK.choose), { req: 1 })}
        ${field('ck_profile_link', CK.profileLink, inp('profile_link', 'url', ' placeholder="https://www.tiktok.com/@account"'), { req: 1 })}
        ${field('ck_handle', CK.handle, inp('handle', '', ` placeholder="${esc(CK.handleHint)}"`), { req: 1, hint: `<span id="ck_uhelp">${x._autoHandle ? esc(NK.usernameAuto) : ''}</span>` })}
        ${field('ck_followers', CK.followers, inp('followers', 'number'))}
      </div></div><div class="nk-col"><div class="fields one">
        ${field('ck_kol_type', CK.type, sel('kol_type', types, CK.notSet))}${field('ck_kol_category', CK.category, inp('kol_category'))}
        ${field('ck_gender', CK.gender, sel('gender', R.GENDERS.map(v => ({ value: v, label: v })), CK.notSet))}
        ${field('ck_contact_id', CK.contact, contact, { hint: esc(C.kol.contactIdHint) })}
        ${field('ck_pic', CK.pic, sel('pic', picList(x.pic).map(v => ({ value: v, label: v })), CK.choose), { req: 1 })}
        ${field('ck_default_payment_term', CK.term, sel('default_payment_term', R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), C.term.none), { hint: esc(o_termHint(x)) })}
      </div></div></div>${o.vault && KT.payee ? KT.payee.nkVaultHTML('ck') : ''}`;
  }
  const o_termHint = x => (x && x._forDeal === false ? '' : C.bulk.ck.termHint);
  /* the checks (shown after Create, or a field left) · a KOL with that name / handle already: "Use this KOL" or tick Create anyway → {res, dup} */
  function kolCreateCheck(root, c) {
    const s = state(), res = R.validateCreateKol(s, c.draft), dup = R.findDuplicateKol(s, c.draft.display_name, c.draft.handle, c.draft.profile_link), CK = C.bulk.ck;
    $('ck_dup').innerHTML = dup ? `<div class="ck-dup"><span>${esc(dup.link ? C.newKol.alreadyLink(dup.kol.display_name, dup.handle) : CK.already(dup.kol.display_name, dup.handle))}</span><button type="button" class="btn small" data-act="ckUse" data-kolid="${esc(dup.kol.kol_id)}">${esc(CK.useThis)}</button>` +
      `<label class="tick small"><input type="checkbox" data-ckanyway${c.anyway ? ' checked' : ''}> ${esc(CK.createAnyway)}</label></div>` : '';
    /* CR-30 §3.5 — Payee & shipping: a part that is started must be complete */
    if (root.querySelector('[data-nkv]') && KT.payee) res.errs.push(...KT.payee.nkVaultCheck(KT.payee.nkVaultRead(root)));
    const show = c.submitted ? res.errs : [];   // CR-30 §3.5: the errors only after Create (none in red when the form opens)
    root.querySelectorAll('[data-nkv]').forEach(el => el.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)));
    $('ck_checks').innerHTML = checksHTML({ errs: show, warns: [], infos: [] }, '');
    root.querySelectorAll('[data-ck]').forEach(el => el.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)));
    const btn = root.querySelector('[data-act="ckCreate"]'); if (btn) btn.disabled = (c.submitted && res.errs.length > 0) || (!!dup && !c.anyway);
    return { res, dup };
  }
  /* after(): something changed (the caller marks itself dirty and runs the check) */
  function wireKolCreate(root, c, after) {
    root.querySelectorAll('[data-ck]').forEach(el => {
      const h = () => {
        const k = el.dataset.ck; c.draft[k] = el.value;
        if (k === 'contact_channel') { const ci = root.querySelector('[data-ck="contact_id"]'); if (ci) ci.placeholder = C.kol.contactIdPh[el.value] || C.newKol.contactPh; }   // CR-14 §4.5
        if (k === 'handle') { c.draft._autoHandle = false; const hp = $('ck_uhelp'); if (hp) hp.textContent = ''; }
        if (k === 'platform') c.draft._autoPlatform = false;
        /* CR-30 §3.5 — the profile link fills the Platform and the Username (while they are empty or were filled from the link) */
        if (k === 'profile_link') {
          const pp = R.platformFromLink(el.value), uu = R.usernameFromLink(el.value), pi = root.querySelector('[data-ck="platform"]'), hi = root.querySelector('[data-ck="handle"]');
          if (pp && (state().lookups.platform_list || []).includes(pp) && (!c.draft.platform || c.draft._autoPlatform)) { c.draft.platform = pp; c.draft._autoPlatform = true; if (pi) pi.value = pp; }
          if (uu && (R.isBlank(c.draft.handle) || c.draft._autoHandle)) { c.draft.handle = uu; c.draft._autoHandle = true; if (hi) hi.value = uu; const hp = $('ck_uhelp'); if (hp) hp.textContent = C.newKol.usernameAuto; }
        }
        after();
      };
      el.addEventListener('input', h); el.addEventListener('change', () => { c.touched.add(el.dataset.key); h(); });
    });
    root._ck = { c, after };
    if (!root.dataset.ckWired) {
      root.dataset.ckWired = '1'; root.addEventListener('change', e => { if (e.target.matches('[data-ckanyway]') && root._ck) { root._ck.c.anyway = e.target.checked; root._ck.after(); } });
      root.addEventListener('click', e => { const b = e.target.closest('[data-ckpt]'); if (b && root._ck) { root._ck.c.draft.partner_type = partnerSegPick(b, 'data-ckpt'); root._ck.after(); } });   // CR-25
      root.addEventListener('input', e => { if (e.target.matches('[data-nkv]') && root._ck) root._ck.after(); });   // CR-30: Payee & shipping
      /* CR-30 — Unlock to add: the vault's own dialog, then the section again (nothing typed is kept while locked) */
      root.addEventListener('click', e => { if (!e.target.closest('[data-nkvunlock]') || !KT.payee) return; KT.payee.unlockDialog(() => { const v = root.querySelector('.nk-vault'); if (v) { v.outerHTML = KT.payee.nkVaultHTML(v.id.replace(/_vault$/, '')); } if (root._ck) root._ck.after(); }); });
    }
  }
  /* Add account (New deal panel · KOL drawer › + Add account): platform · handle · followers · profile link — the KOL Master checks (R.validateAddAccount) */
  function accountFieldsHTML(x) {
    const s = state(), CK = C.bulk.ck;
    const inp = (f, type) => `<input${type ? ` type="${type}"` : ''} id="f_aa_${f}" data-aa="${f}" data-key="aa_${f}" value="${esc(x[f])}" autocomplete="off"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''}>`;
    return `<div class="fields">${field('aa_platform', CK.platform, `<select id="f_aa_platform" data-aa="platform" data-key="aa_platform">${optionsHTML((s.lookups.platform_list || []).map(v => ({ value: v, label: v })), x.platform, CK.choose)}</select>`, { req: 1 })}` +
      `${field('aa_handle', CK.handle, inp('handle'), { req: 1, hint: esc(CK.handleHint) })}${field('aa_followers', CK.followers, inp('followers', 'number'), { req: 1 })}${field('aa_profile_link', CK.profileLink, inp('profile_link', 'url'), { req: 1 })}</div>`;
  }
  /* a = { draft, touched, submitted } → res (shown in #aa_checks) */
  function accountCheck(root, kolId, a) {
    const res = R.validateAddAccount(state(), kolId, a.draft), show = res.errs.filter(e => a.submitted || a.touched.has(e.field));
    $('aa_checks').innerHTML = checksHTML({ errs: show, warns: res.warns, infos: [] }, '');
    root.querySelectorAll('[data-aa]').forEach(el => el.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)));
    return res;
  }
  function wireAccount(root, a, after) {
    root.querySelectorAll('[data-aa]').forEach(el => {
      const h = () => {
        a.draft[el.dataset.aa] = el.value;
        if (el.dataset.aa === 'profile_link') {   // a profile link fills the handle / platform while they are empty (as in KOL Master)
          const hh = R.handleFromLink(el.value), pp = R.platformFromLink(el.value), hi = root.querySelector('[data-aa="handle"]'), pi = root.querySelector('[data-aa="platform"]');
          if (hh && R.isBlank(a.draft.handle)) { a.draft.handle = hh; if (hi) hi.value = hh; }
          if (pp && !a.draft.platform && (state().lookups.platform_list || []).includes(pp)) { a.draft.platform = pp; if (pi) pi.value = pp; }
        }
        after();
      };
      el.addEventListener('input', h); el.addEventListener('change', () => { a.touched.add(el.dataset.key); h(); }); el.addEventListener('blur', () => { a.touched.add(el.dataset.key); after(); });
    });
  }
  /* a CSV / text file as text: UTF-8, else Thai Windows (Excel without UTF-8) */
  async function readText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-874').decode(buf); }
  }

  /* ===================== dialog ===================== */
  const dlg = $('dlg');
  /* wide: true = up to 1100px · 'mid' = up to 820px (CR-07: Add to campaign with its Price reference) */
  function openDialog(html, wide) { rescueToast(dlg); dlg.innerHTML = html; dlg.classList.toggle('wide', wide === true); dlg.classList.toggle('mid', wide === 'mid'); dlg.classList.toggle('xl', wide === 'xl'); if (!dlg.open) dlg.showModal(); }
  function closeDialog() { if (dlg.open) dlg.close(); }
  /* CR-21 — a question with more than two answers (Save as draft? Save draft · Discard · Keep editing) · buttons [{ key, label, cls }] (the last = primary) →
     the key of the one pressed (null when it is closed) */
  function choiceDialog(title, body, buttons) {
    return new Promise(resolve => {
      openDialog(`<div class="dlg-h">${esc(title)}</div><div class="dlg-b">${esc(body)}</div>
        <div class="dlg-f">${buttons.map(b => `<button type="button" class="btn${b.cls ? ' ' + b.cls : ''}" data-r="${esc(b.key)}">${esc(b.label)}</button>`).join('')}</div>`);
      const done = v => { dlg.removeEventListener('close', onClose); closeDialog(); resolve(v); };
      const onClose = () => done(null);
      dlg.addEventListener('close', onClose);
      dlg.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => done(b.dataset.r)));
      const p = dlg.querySelector('.btn.primary'); if (p) p.focus();
    });
  }
  function confirmDialog(title, body, okLabel, danger, noLabel) {
    return new Promise(resolve => {
      openDialog(`<div class="dlg-h">${esc(title)}</div><div class="dlg-b">${esc(body)}</div>
        <div class="dlg-f"><button type="button" class="btn" data-r="0">${esc(noLabel || C.common.cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button></div>`);
      const done = v => { dlg.removeEventListener('close', onClose); closeDialog(); resolve(v); };
      const onClose = () => done(false);
      dlg.addEventListener('close', onClose);
      dlg.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => done(b.dataset.r === '1')));
    });
  }

  /* ===================== CR-11 §4.1–4.2 — the create modal: every "new" thing opens in the middle of the screen ===================== */
  /* (a drawer stays for viewing / editing what exists · a short question is a confirm dialog) · one at a time, its own <dialog> so
     "Discard changes?" can sit on top of it · o = { size 'S' | 'M' | 'L', title | tabs [{key, label}] + tab, sub, onTab(key), onClick(e),
     isDirty(), onClose(), opener } → { root, body(), setBody(html, keepScroll, cls), setSub(text), setFoot(leftHTML, buttonsHTML), setTab(key),
     requestClose(), close(), focusFirst() } · data-cmclose (✕ · Cancel) / Esc / the backdrop ask first when something was typed ·
     Ctrl / ⌘ + Enter = the primary button · Tab stays inside · focus goes back to the button that opened it */
  const cm = $('cmodal');
  let cmo = null, cmAsking = false;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const focusables = el => [...el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length > 0);
  const cmHead = o => (o.tabs ? `<div class="stabs cm-tabs" role="tablist">${o.tabs.map(t => `<button type="button" role="tab" id="cm_tab_${esc(t.key)}" data-cmtab="${esc(t.key)}" aria-selected="${t.key === o.tab}"${t.key === o.tab ? ' class="on"' : ''}>${esc(t.label)}</button>`).join('')}</div>`
    : `<h2 class="cm-title" id="cm_title">${esc(o.title || '')}</h2>`);
  /* the standard footer: Cancel (or Back inside a panel) · extra buttons · the primary button (id) */
  const cmButtons = (ok, id, o = {}) => `<button type="button" class="btn"${o.back ? ' data-cmback' : ' data-cmclose'}>${esc(o.cancel || (o.back ? C.common.back : C.common.cancel))}</button>${o.extra || ''}` +
    `<button type="button" class="btn ${o.danger ? 'danger' : 'primary'}" id="${id}"${o.attrs || ''}>${esc(ok)}</button>`;
  /* §4.1 — making something else on the way (a product while planning) replaces the modal's content: "← Back" and its own footer ·
     o = { title, sub, body, left, buttons, back() (draws the modal's own content again — the owner's o.redraw by default) } */
  function modalPanel(o) {
    if (!cm.open || !cmo) return false;
    const h = cmHandle();
    /* CR-27 §3.1 — o.replaceHeader: the panel's title takes the modal's header (no stacked "Edit … · Phase Planner · …") — Back puts it back */
    if (o.replaceHeader) {
      const t = $('cm_title'), sub = $('cm_sub'), keep = { t: t ? t.textContent : '', s: sub && !sub.classList.contains('hidden') ? sub.textContent : '' }, back0 = o.back || cmo.redraw || null;
      if (t) t.textContent = o.title; h.setSub('');
      o = Object.assign({}, o, { back: () => { if ($('cm_title')) $('cm_title').textContent = keep.t; h.setSub(keep.s); if (back0) back0(); } });
    }
    h.setBody(`<button type="button" class="link nd-back" data-cmback>← ${esc(o.backLabel || C.common.back)}</button>${o.replaceHeader ? '' : `<h3 class="nd-ph">${esc(o.title)}</h3>`}${o.sub ? `<p class="muted small nd-psub">${esc(o.sub)}</p>` : ''}${o.body}`);
    h.setFoot(o.left || '', o.buttons || '');
    cmo.back = o.back || cmo.redraw || null;
    setTimeout(focusFirstInModal, 0);
    return true;
  }
  function cmHandle() {
    return {
      get root() { return $('cm_root'); }, body: () => $('cm_body'),
      setBody(html, keepScroll, cls) { const b = $('cm_body'); if (!b) return; const top = b.scrollTop; rescueToast(b); b.className = 'cm-b' + (cls ? ' ' + cls : ''); b.innerHTML = html; b.scrollTop = keepScroll ? top : 0; },
      setSub(t) { const el = $('cm_sub'); if (!el) return; el.textContent = t || ''; el.classList.toggle('hidden', !t); },
      setFoot(left, buttons) { if (!$('cm_fl')) return; $('cm_fl').innerHTML = left || ''; $('cm_btns').innerHTML = buttons || ''; },
      setTab(key) { if (!cmo) return; cmo.tab = key; cm.querySelectorAll('[data-cmtab]').forEach(b => { const on = b.dataset.cmtab === key; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); cm.setAttribute('aria-labelledby', 'cm_tab_' + key); },
      requestClose: requestCloseModal, close: closeModal, focusFirst: focusFirstInModal,
    };
  }
  function createModal(o) {
    if (cm.open) closeModal();
    cmo = Object.assign({ size: 'M' }, o); cmo.opener = o.opener || document.activeElement;
    rescueToast(cm);
    cm.className = 'cmodal cm-' + String(cmo.size).toLowerCase();
    cm.innerHTML = `<div class="cm-root" id="cm_root"><div class="cm-h">${cmHead(cmo)}<button type="button" class="icon-btn cm-x" data-cmclose aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button></div>` +
      `<div class="cm-sub hidden" id="cm_sub"></div><div class="cm-b" id="cm_body"></div><div class="cm-f"><div class="cm-fl" id="cm_fl"></div><div class="btns" id="cm_btns"></div></div></div>`;
    cm.setAttribute('aria-modal', 'true'); cm.setAttribute('aria-labelledby', cmo.tabs ? 'cm_tab_' + cmo.tab : 'cm_title');
    const h = cmHandle();
    if (cmo.sub) h.setSub(cmo.sub);
    if (cmo.body != null) h.setBody(cmo.body);
    if (cmo.foot) h.setFoot(cmo.foot[0], cmo.foot[1]);
    /* a modal without its own isDirty: anything typed after it opened counts */
    cmo.typed = false; cmo.ready = false;
    const mark = () => { if (cmo && cmo.ready) cmo.typed = true; };
    $('cm_root').addEventListener('input', mark); $('cm_root').addEventListener('change', mark);
    $('cm_root').addEventListener('click', e => {
      if (e.target.closest('[data-cmclose]')) { requestCloseModal(); return; }
      if (e.target.closest('[data-cmback]')) { const back = cmo && cmo.back; if (cmo) cmo.back = null; if (back) back(); return; }
      const t = e.target.closest('[data-cmtab]'); if (t) { if (cmo && t.dataset.cmtab !== cmo.tab) { h.setTab(t.dataset.cmtab); if (cmo.onTab) cmo.onTab(t.dataset.cmtab); } return; }
      if (cmo && cmo.onClick) cmo.onClick(e);
    });
    document.body.classList.add('cm-open');   // the page behind does not scroll
    cm.showModal();
    setTimeout(() => { if (cmo) cmo.ready = true; focusFirstInModal(); }, 0);   // after the caller has drawn the body
    return h;
  }
  /* the field to fill first: o.focus (a selector, or a function giving one) · else the first field of the body that does not open a list
     on focus (a combobox would pop its list open) · else the primary button */
  function focusFirstInModal() {
    if (!cm.open) return;
    const want = cmo && cmo.focus && (typeof cmo.focus === 'function' ? cmo.focus() : cmo.focus), w = want && cm.querySelector(want);
    if (w && w.getClientRects().length && !w.disabled) { w.focus(); return; }
    const b = $('cm_body'), f = b && focusables(b).find(x => x.matches('input:not([type="checkbox"]):not([type="radio"]):not(.combo-in),select:not(.combo-src),textarea'));
    const p = [...cm.querySelectorAll('#cm_btns .btn.primary')].filter(x => !x.disabled).pop();
    (f || p || cm.querySelector('[data-cmclose]')).focus();
  }
  async function requestCloseModal() {
    if (!cm.open || cmAsking) return false;
    if (cmo && (cmo.isDirty ? cmo.isDirty() : cmo.typed)) {
      /* CR-21 §3.4 — a modal may ask its own question (the Phase Planner: Save as draft?) · true = close it */
      cmAsking = true; const ok = cmo.askClose ? await cmo.askClose() : await confirmDialog(C.common.discardTitle, C.common.discardBody, C.common.discard, true, C.common.keepEditing); cmAsking = false;
      if (!ok) { focusFirstInModal(); return false; }
    }
    closeModal(); return true;
  }
  /* closes without asking (after Create, or after Discard) */
  function closeModal() {
    const o = cmo; cmo = null;
    rescueToast(cm);
    if (cm.open) cm.close();
    cm.innerHTML = ''; cm.className = 'cmodal'; document.body.classList.remove('cm-open');
    if (o && o.onClose) o.onClose();
    if (o && o.opener && o.opener.isConnected && typeof o.opener.focus === 'function') o.opener.focus();
  }
  cm.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestCloseModal(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const p = [...cm.querySelectorAll('#cm_btns .btn.primary')].filter(x => !x.disabled).pop(); if (p) { e.preventDefault(); p.click(); } return; }
    if (e.key !== 'Tab' || !$('cm_root')) return;
    const f = focusables($('cm_root')); if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !cm.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !cm.contains(a))) { e.preventDefault(); first.focus(); }
  });
  cm.addEventListener('cancel', e => { e.preventDefault(); requestCloseModal(); });
  /* the backdrop is the dialog itself outside its box */
  cm.addEventListener('click', e => { if (e.target !== cm) return; const r = cm.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) requestCloseModal(); });

  /* ===================== side drawer (one at a time) ===================== */
  /* owner: {isDirty(): bool, onClose(): void} — the screen that filled #drawer_content */
  const drawer = { owner: null };
  /* CR-10 §4.13 — owner.kind 'deal' · 'kol' · 'campaign' · 'planner': 60% wide (R.drawerWidth), resizable from the left edge, each kind remembers its own
     width (ui.drawerWidth.<kind>; the CR-07 / CR-09 keys are read once) · the page beside stays usable, except under the Phase Planner (it holds a plan) */
  /* CR-20 §4.6 — a deal opens as a modal (L · ~1120px · 90vh · the page faded behind), not a side drawer */
  const WIDE = { kol: { legacy: 'ui.kolDrawerWidth' }, campaign: {}, planner: { modal: true } };
  const wideOf = () => { const k = drawer.owner && drawer.owner.kind; return k && WIDE[k] ? Object.assign({ kind: k, key: 'ui.drawerWidth.' + k, width: (v, m, s) => R.drawerWidth(k, v, m, s) }, WIDE[k]) : null; };
  const isKol = () => !!wideOf();
  const RESIZE_HANDLE = () => `<div class="dr-resize" data-dr-resize title="${esc(C.common.resizeDrawer)}" aria-hidden="true"></div>`;
  const savedWideWidth = () => { const W = wideOf(), v = W ? +pref.get(W.key, '') || (W.legacy ? +pref.get(W.legacy, '') : 0) : 0; return v > 0 ? v : null; };
  function sizeDrawer(width) {
    const el = $('drawer_content'), W = wideOf(), wide = !!W, kind = drawer.owner && drawer.owner.kind, dm = kind === 'deal';
    const modal = dm || !wide || !!W.modal;
    $('drawer').classList.toggle('nonmodal', !modal); $('drawer').classList.toggle('dmodal', dm); el.classList.toggle('wide', wide); el.classList.toggle('kol', kind === 'kol'); el.classList.toggle('dm', dm); el.setAttribute('aria-modal', String(modal));
    document.body.classList.toggle('drawer-open', !!drawer.owner && modal);
    if (!wide) { el.style.width = ''; el.classList.toggle('two', dm && window.innerWidth >= 768); return; }   // the deal: two columns from 768px, one (full screen) below
    const vw = window.innerWidth, cw = Math.round(document.querySelector('.app-main').getBoundingClientRect().width) || vw;
    const w = width || W.width(vw, vw - cw, savedWideWidth());
    el.style.width = w + 'px'; el.classList.toggle('two', w >= 720);   // two columns from 720px (CR-10 §4.13)
  }
  function openDrawer(owner, html) {
    drawer.owner = owner;
    $('drawer_content').innerHTML = html + (isKol() ? RESIZE_HANDLE() : '');
    $('drawer').classList.remove('hidden');
    sizeDrawer();
  }
  function fillDrawer(html) { $('drawer_content').innerHTML = html + (isKol() ? RESIZE_HANDLE() : ''); }
  function hideDrawer() {
    $('drawer').classList.add('hidden'); $('drawer_content').innerHTML = '';
    sizeDrawer();
  }
  function closeDrawer() {
    const o = drawer.owner; drawer.owner = null;
    hideDrawer();
    if (o && o.onClose) o.onClose();
  }
  /* leaving the tab: hide without closing, so a screen can keep unsaved edits and show them again */
  function suspendDrawer() {
    const o = drawer.owner; drawer.owner = null;
    hideDrawer();
    if (o && o.onSuspend) o.onSuspend();
  }
  /* drag the left edge: 560px … content − 320px, remembered · double-click = half the screen again */
  $('drawer').addEventListener('pointerdown', e => {
    const h = e.target.closest('[data-dr-resize]'); if (!h || !isKol()) return;
    e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('on');
    const vw = window.innerWidth, cw = Math.round(document.querySelector('.app-main').getBoundingClientRect().width) || vw;
    let w = null;
    const W = wideOf(), move = ev => { w = W.width(vw, vw - cw, Math.round(vw - ev.clientX)); sizeDrawer(w); };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); h.classList.remove('on'); if (w) pref.set(W.key, String(w)); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  $('drawer').addEventListener('dblclick', e => { if (e.target.closest('[data-dr-resize]') && isKol()) { const W = wideOf(); pref.set(W.key, ''); if (W.legacy) pref.set(W.legacy, ''); sizeDrawer(); } });   // = 60% again
  document.addEventListener('kt:contentresize', () => { if (isKol()) sizeDrawer(); });
  window.addEventListener('resize', () => { if (drawer.owner && drawer.owner.kind === 'deal') sizeDrawer(); });

  /* ===================== CR-07 §4.9 — the Journey timeline + payment track ===================== */
  const JR = C.journey;
  const PASSED = ['done', 'late', 'nodate'];
  /* one circle per step (✓ done · ⏳ waiting · empty upcoming · ✕ cancelled) with its date and days under it; the circle opens the details */
  /* o.notes (CR-20 §4.13): a Draft step opens its notes and shows 📎 n · 🖼 n · Brief / Script show 🔗 when the deal has the link (§4.12) */
  function journeyHTML(d, logs, posts, o = {}) {
    const s = state(), t = R.dealTimeline(s.lookups, d, logs, posts, today()), td = today();
    const by = x => (x.log && x.log.changed_by !== undefined ? R.changedByName(s, x.log.changed_by) : '');
    const li = t.steps.map((x, i) => {
      const nx = t.steps[i + 1], seg = nx ? (PASSED.includes(nx.state) ? ' seg-on' : '') : t.cancelled ? ' seg-cancel' : '';
      const lines = [];
      if (x.date) lines.push(esc(dm(x.date)));
      if (x.state === 'nodate') lines.push(`<span class="jt-nr" title="${esc(JR.dateNotRecorded)}">—</span>`);   // CR-15 §4.4: data from before — not a warning
      if (x.days != null) lines.push(esc(JR.took(x.days)));
      if (x.late_days) lines.push(`<b class="jt-bad">${esc(JR.late(x.late_days))}</b>`);
      if (x.state === 'current' && x.waiting != null) lines.push(esc(JR.waiting(x.waiting)));
      if ((x.state === 'current' || x.state === 'upcoming' || x.state === 'overdue') && x.expected) lines.push(x.overdue_days ? `<b class="jt-bad">${esc(`${JR.due(dm(x.expected))} · ${JR.overdue(x.overdue_days)}`)}</b>` : esc(JR.due(dm(x.expected))));
      if (x.state === 'upcoming' && !x.expected) lines.push('–');
      const icon = x.state === 'current' ? '⏳' : x.state === 'nodate' ? '—' : PASSED.includes(x.state) ? '✓' : x.state === 'overdue' ? '!' : '';
      const detail = [PASSED.includes(x.state) ? (x.date ? JR.passedOn(R.dmy(x.date)) : JR.dateNotRecorded) : JR.notYet, x.expected ? JR.expected(R.dmy(x.expected)) : JR.noExpected, by(x) ? JR.by(by(x)) : ''].filter(Boolean).join(' · ');
      const st = R.stepOf(s.lookups, x.sub), dn = R.draftNo(st), link = st && st.date_field === 'brief_date' ? d.link_brief : R.isScriptStep(st) ? d.script_link : null;
      if (link && R.isHttpLink(link)) lines.push(`<a class="jt-link" href="${esc(link)}" target="_blank" rel="noopener" title="${esc(st.date_field === 'brief_date' ? C.deal.f.link_brief : C.deal.scriptLink)}" aria-label="${esc(st.date_field === 'brief_date' ? C.deal.f.link_brief : C.deal.scriptLink)}">🔗</a>`);
      const nc = dn && d.deal_id ? R.noteCounts(R.stepNoteOf(s, d.deal_id, R.draftKey(dn))) : null, ncText = nc ? C.notes.counts(nc.links, nc.images) : '';
      if (ncText) lines.push(`<span class="jt-nc">${esc(ncText)}</span>`);
      const btn = o.notes && dn && d.deal_id ? `<button type="button" class="jt-c jt-note" data-notes="${dn}" title="${esc(C.notes.title(dn))}" aria-label="${esc(`${x.short}: ${JR.state[x.state]} · ${C.notes.title(dn)}`)}">${icon}</button>`
        : `<button type="button" class="info jt-c" data-info-h="${esc(`${x.sub} · ${stepTitle(x.sub)}`)}" data-info-d="${esc(detail)}" data-info-f="${esc((x.log && x.log.note) || '')}" aria-label="${esc(`${x.short}: ${JR.state[x.state]}`)}" aria-expanded="false">${icon}</button>`;
      return `<li class="jt-s ${x.state}${x.overdue_days ? ' od' : ''}${seg}">${btn}` +
        `<div class="jt-t"><b>${esc(x.short)}</b>${lines.map(l => `<span>${l}</span>`).join('')}</div></li>`;
    });
    if (t.cancelled) {
      const c = t.cancelled, label = JR.cancelled(c.date ? dm(c.date) : '');
      li.push(`<li class="jt-s cancelled"><button type="button" class="info jt-c" data-info-h="${esc(JR.cancelled(c.date ? R.dmy(c.date) : ''))}" data-info-d="${esc(c.reason || C.common.none)}" data-info-f="${esc((c.log && c.log.note) || '')}" aria-label="${esc(label)}" aria-expanded="false">✕</button>` +
        `<div class="jt-t"><b title="${esc(c.reason || '')}">${esc(label)}</b></div></li>`);
    }
    const sum = t.summary ? (t.summary.kind === 'complete' ? JR.briefToPost(t.summary.days) : JR.inProgress(t.summary.days)) : '';
    return { html: `<ol class="jt" data-n="${li.length}">${li.join('')}</ol>`, summary: sum, td };
  }
  /* the payment track: the term on the left, then Docs → (Deposit 50% | 50%) → Paid with dates, coloured by payment_state */
  function payTrackHTML(d) {
    const p = R.paymentTimeline(d, today());
    if (p.term === 'package') { const pk = R.packageById(state(), d.package_id), paid = !!d.package_paid;   // CR-20 §4.8
      return `<div class="pt"><span class="pt-term" title="${esc(JR.payment)}">${esc(C.termShort.package)}</span><span class="muted small">${esc(pk ? R.packageLabel(pk) : C.common.none)}</span>` +
        `<b class="pt-st ${paid ? 'ok' : 'warn'}">${esc(paid ? C.pkg.paidVia : C.pkg.notPaid)}</b></div>`; }
    if (p.term === 'free') return `<div class="pt"><span class="pt-term">${esc(JR.payment)}</span><span class="chip">${esc(C.termShort.free)}</span></div>`;
    if (d.deal_id && R.isSimple(state(), 'payments')) return simpleTrackHTML(d, p);   // CR-17 §4.4
    const label = f => (f === 'paid_50' ? (p.term === 'split_50' ? C.payStep.deposit : C.payStep.paid_50) : C.payStep[f]);
    return `<div class="pt"><span class="pt-term" title="${esc(JR.payment)}">${esc(C.termShort[p.term || 'none'])}</span><ol class="pt-list">` +
      p.items.map(x => `<li class="pt-s${x.done ? ' on' : ''}"><span class="pt-c">${x.done ? '✓' : ''}</span><span class="pt-l">${esc(label(x.flag))}</span>` +
        `<span class="muted">${x.done ? esc(x.date ? dm(x.date) : '✓') : '—'}</span>${x.when ? `<span class="pt-when">${esc(JR[x.when])}</span>` : ''}</li>`).join('') +
      `</ol><b class="pt-st ${PAY_CLS[p.state] || ''}">${esc(C.payState[p.state])}</b></div>`;
  }
  /* CR-17 §4.4 — Simple mode: To pay → Sent dd/mm → Paid dd/mm (the term on the left, the state on the right) */
  function simpleTrackHTML(d, p) {
    const t = R.simplePayTrack(state(), d, today()), CP = C.pay.simple;
    const step = (on, label, date) => `<li class="pt-s${on ? ' on' : ''}"><span class="pt-c">${on ? '✓' : ''}</span><span class="pt-l">${esc(label)}</span><span class="muted">${on && date ? esc(dm(date)) : '—'}</span></li>`;
    const stTxt = { paid: CP.trackPaid, sent: CP.trackSent, to_pay: CP.trackToPay, not_due: C.payState.not_due, none: C.payState.not_due }[t.state];
    return `<div class="pt"><span class="pt-term" title="${esc(JR.payment)}">${esc(C.termShort[p.term || 'none'])}</span><ol class="pt-list">` +
      step(t.owed > 0 || !!t.sent || !!t.paid, CP.trackToPay, null) + step(!!t.sent, CP.trackSent, t.sent) + step(t.allPaid, CP.trackPaid, t.paid) +
      `</ol><b class="pt-st ${t.state === 'paid' ? 'ok' : t.state === 'sent' ? 'info' : t.state === 'to_pay' ? 'warn' : 'muted'}">${esc(stTxt)}</b></div>`;
  }
  /* ===================== CR-17 — a small form beside a row button (Mark paid · Shipped · Delivered) ===================== */
  /* o = { title, body (html), ok (label), onOk(root) → true when done (it closes), focus (selector) } · Enter = Confirm · Esc / a click outside = close */
  let popf = null;
  function closePopForm() { if (popf) { const m = popf; popf = null; m.remove(); } }
  function popForm(anchor, o) {
    closePopForm();
    const m = document.createElement('div'); m.className = 'menu-list floating popform'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', o.title);
    m.innerHTML = `<div class="pf-h">${esc(o.title)}</div><div class="pf-b">${o.body}</div><div class="checks pf-chk"></div>` +
      `<div class="pf-f"><button type="button" class="btn small" data-pfx>${esc(C.common.cancel)}</button><button type="button" class="btn small primary" data-pfok>${esc(o.ok)}</button></div>`;
    (anchor && anchor.closest('dialog') || document.body).appendChild(m);
    popf = m; m._anchor = anchor;
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3 };
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = (r.bottom + m.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + 'px';
    const ok = () => { const done = o.onOk(m); if (done !== false) closePopForm(); };
    m.addEventListener('click', e => { if (e.target.closest('[data-pfx]')) { closePopForm(); if (anchor && anchor.isConnected) anchor.focus(); } else if (e.target.closest('[data-pfok]')) ok(); });
    m.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopForm(); if (anchor && anchor.isConnected) anchor.focus(); }
      else if (e.key === 'Enter' && !e.target.closest('textarea') && !e.target.closest('.dpick')) { e.preventDefault(); ok(); }
    });
    const f = (o.focus && m.querySelector(o.focus)) || m.querySelector('[data-pfok]'); if (f) f.focus();
    return m;
  }
  /* the error under the fields of the open form */
  const popFormError = (m, msg) => { const c = m.querySelector('.pf-chk'); if (c) c.innerHTML = msg ? `<div class="check err">✕ <span>${esc(msg)}</span></div>` : ''; };
  document.addEventListener('mousedown', e => { if (popf && !popf.contains(e.target) && !(popf._anchor && popf._anchor.contains(e.target)) && !e.target.closest('.dpop,.cal')) closePopForm(); }, true);
  /* across when the section is wide enough for the steps (64px each — CR-10 §4.13: a 60% drawer is always across, even Script + 3 drafts), else down */
  function fitJourney(root) { (root || document).querySelectorAll('.jt').forEach(el => { el.classList.remove('vert'); el.classList.toggle('vert', el.clientWidth < (+el.dataset.n || 1) * 64); }); }
  document.addEventListener('kt:contentresize', () => fitJourney(document));
  window.addEventListener('resize', () => fitJourney(document));

  /* ===================== CR-07 §4.8 — copy a KOL name ===================== */
  /* the Clipboard API, else a hidden textarea + execCommand (some browsers on file://) → true / false */
  async function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* try the old way */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }
  const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
  const copyBtnHTML = (name, label) => `<button type="button" class="copybtn" data-copyname="${esc(name)}" title="${esc(label || C.copy.name)}" aria-label="${esc(label ? `${label} ${name}` : C.copy.aria(name))}">${COPY_ICON}</button>`;
  /* the click stops here: copying never opens the row's drawer */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-copyname]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const name = b.dataset.copyname;
    if (await copyText(name)) { b.classList.add('ok'); b.innerHTML = '✓'; clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('ok'); b.innerHTML = COPY_ICON; }, 1500); toast(C.copy.copied(name)); }
    else toast(C.copy.failed);
  }, true);

  /* ===================== CR-07 §4.5 — Price reference beside the five cost fields ===================== */
  const PR = C.priceRef;
  /* o: {excludeDealId, free} → Latest rate · Average of past deals, one Use button per column (cost inputs carry data-cost="<field>") */
  function priceRefHTML(kolId, o = {}) {
    if (!kolId) return '';
    const ref = R.costReference(state(), kolId, o.excludeDealId), rows = R.costRefRows(ref);
    const val = (c, k) => (!c ? `<span class="muted">—</span>` : k === 'total' ? `<b>${R.baht(c.total)}</b>` : c.values[k] ? R.fmtNum(c.values[k]) : `<span class="muted">0</span>`);
    const latestSub = ref.latest ? [ref.latest.source, ref.latest.date ? R.dmy(ref.latest.date) : PR.dateNotRecorded].filter(Boolean).join(' · ') : PR.noRate;
    const avgSub = (ref.average ? PR.deals(ref.average.n) : PR.noPaid) + (ref.freeExcluded ? ` · ${PR.freeExcluded(ref.freeExcluded)}` : '');
    const head = (key, c, label, sub, extra) => `<th><div class="pref-h"><span${extra ? ` class="tiph" title="${esc(extra)}"` : ''}>${esc(label)}</span>` +   // CR-11 §4.13 #2: the explanation on hover
      `<button type="button" class="btn small" data-useref="${key}"${c ? '' : ' data-empty'}${!c || o.free ? ' disabled' : ''} title="${esc(PR.useTip(label))}">${esc(PR.use)}</button></div>` +
      `<div class="pref-sub">${esc(sub)}</div>${key === 'latest' && ref.note ? `<div class="pref-sub">${esc(PR.note(ref.note))}</div>` : ''}</th>`;
    return `<div class="pref${o.free ? ' off' : ''}" data-pref="${esc(kolId)}" data-ex="${esc(o.excludeDealId || '')}"${o.free ? ` title="${esc(PR.freeTip)}"` : ''}><div class="pref-t">${esc(PR.title)}</div>` +
      `<table class="pref-tbl"><thead><tr><th></th>${head('latest', ref.latest, PR.latest, latestSub)}${head('average', ref.average, PR.average, avgSub, tipText(PR.info))}</tr></thead><tbody>` +
      rows.map(k => `<tr${k === 'total' ? ' class="tot"' : ''}><th scope="row">${esc(PR.rows[k])}</th><td class="num">${val(ref.latest, k)}</td><td class="num">${val(ref.average, k)}</td></tr>`).join('') +
      `</tbody></table><div class="pref-ask hidden" role="alert"></div></div>`;
  }
  /* the job is Free → the box is greyed and Use is off */
  function priceRefFree(root, free) {
    const box = root && root.querySelector('.pref'); if (!box) return;
    box.classList.toggle('off', !!free); if (free) box.title = PR.freeTip; else box.removeAttribute('title');
    box.querySelectorAll('[data-useref]').forEach(b => { b.disabled = !!free || b.hasAttribute('data-empty'); });
    if (free) { const a = box.querySelector('.pref-ask'); a.classList.add('hidden'); a.innerHTML = ''; }
  }
  /* "Latest rate ฿3,000 · Average ฿5,000 (2 deals)" */
  function priceRefSummary(kolId, excludeDealId) {
    const ref = R.costReference(state(), kolId, excludeDealId);
    return [ref.latest ? PR.summaryLatest(R.baht(ref.latest.total)) : PR.noRate, ref.average ? PR.summaryAvg(R.baht(ref.average.total), ref.average.n) : PR.noPaid].join(' · ');
  }
  /* Use fills the five fields of the same form (0 → empty, still editable); typed costs are replaced only after "Replace current costs?" */
  document.addEventListener('click', e => {
    const box = e.target.closest('.pref'); if (!box) return;
    const ask = box.querySelector('.pref-ask'), form = box.closest('.costwrap') || box.parentElement;
    const inputs = () => Object.fromEntries([...form.querySelectorAll('[data-cost]')].map(el => [el.dataset.cost, el]));
    const closeAsk = () => { ask.classList.add('hidden'); ask.innerHTML = ''; };
    const fill = key => {
      const c = R.costReference(state(), box.dataset.pref, box.dataset.ex || undefined)[key]; if (!c) return;
      const ins = inputs();
      R.COST_KEYS.forEach(k => { const el = ins[k]; if (!el) return; el.value = c.values[k] ? String(c.values[k]) : ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      closeAsk();
    };
    const use = e.target.closest('[data-useref]');
    if (use) {
      if (use.disabled) return;
      const ins = inputs();
      if (!R.COST_KEYS.some(k => ins[k] && !R.isBlank(ins[k].value) && Number(ins[k].value) !== 0)) { fill(use.dataset.useref); return; }
      ask.innerHTML = `<span>${esc(PR.replaceTitle)}</span><button type="button" class="btn small" data-refno>${esc(C.common.cancel)}</button><button type="button" class="btn small primary" data-refyes="${use.dataset.useref}">${esc(PR.replace)}</button>`;
      ask.classList.remove('hidden'); ask.querySelector('[data-refyes]').focus(); return;
    }
    if (e.target.closest('[data-refno]')) { closeAsk(); return; }
    const yes = e.target.closest('[data-refyes]'); if (yes) fill(yes.dataset.refyes);
  });
  /* the five cost inputs: data-cost, placeholder 0 */
  const costInput = (id, f, v, extra) => `<input type="number" min="0" step="1" inputmode="numeric" id="${id}" data-cost="${f}" placeholder="${esc(PR.zeroPh)}" value="${esc(v == null ? '' : v)}"${extra || ''} autocomplete="off">`;

  /* ===================== CR-07 §4.4 — the chip row of Deals and KOL Master ===================== */
  /* chips: [[key, text]] (× removes that one) · "Clear all filters" at the end while any filter is on (nFilters ≥ 1) */
  function filterChips(el, chips, nFilters) {
    el.innerHTML = chips.map(([k, t]) => `<span class="fchip">${esc(t)}<button type="button" data-unset="${esc(k)}" aria-label="${esc(C.common.removeFilter(t))}">×</button></span>`).join('') +
      (nFilters ? `<button type="button" class="btn small ghost fclear" data-clearfilters>${ICON.close}<span>${esc(C.common.clearAllFilters)}</span></button>` : '');
    el.classList.toggle('hidden', !chips.length && !nFilters);
  }
  /* the empty list: what is in use + the same Clear all filters */
  const noMatchHTML = (title, used) => `<div class="card empty"><b>${esc(title)}</b>` + (used.length ? `<div class="fused muted small">${esc(C.common.filtersUsed)} ${esc(used.join(' · '))}</div>` +
    `<button type="button" class="btn fclear" data-clearfilters>${ICON.close}<span>${esc(C.common.clearAllFilters)}</span></button>` : '') + `</div>`;
  async function requestCloseDrawer() {
    const o = drawer.owner;
    if (o && o.isDirty && o.isDirty() && !(await confirmDialog(C.common.discardTitle, C.common.discardBody, C.common.discard, true))) return false;
    closeDrawer(); return true;
  }
  $('drawer').addEventListener('click', e => { if (e.target.closest('[data-dr-close]')) requestCloseDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.owner && !dlg.open && !cm.open) requestCloseDrawer(); });
  /* the hash remembers the page and the open record (#deals/D000044) without adding history entries ·
     screens pass their key ('kol/K0011'); the hash shows the route ('kols/K0011') */
  const toRoute = h => { const [k, ...rest] = String(h || '').split('/'), t = C.tabs.find(x => x.key === k); return [t ? t.route : k].concat(rest).join('/'); };
  const setHash = h => { const r = toRoute(h); if (location.hash.slice(1) !== r) history.replaceState(null, '', '#' + r); };

  /* CR-25 — a popover that would run past the window opens toward the left (KOL Master's Filters sits further right with Partner type) */
  document.addEventListener('toggle', e => {
    const d = e.target; if (!d || !d.matches || !d.matches('details.menu') || !d.open) return;
    const p = d.querySelector(':scope > .popover'); if (!p) return;
    p.style.left = ''; p.style.right = '';
    if (getComputedStyle(p).position !== 'fixed' && p.getBoundingClientRect().right > innerWidth - 8) { p.style.left = 'auto'; p.style.right = '0'; }
  }, true);
  /* close any open menu / popover when clicking elsewhere */
  document.addEventListener('click', e => {
    document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
  });

  /* ===================== banners (errors only) ===================== */
  function renderBanners() {
    const st = store.status, B = C.banner, out = [];
    if (st.corrupt) out.push({ cls: 'err', text: B.corrupt });
    if (!st.canSave) out.push({ cls: 'err', text: B.cannotSave, sub: B.cannotSaveDetail, act: 'backup' });
    if (otherTabChanged) out.push({ cls: 'warn', text: B.otherTab, act: 'reload' });
    $('banners').innerHTML = out.map(b => `<div class="banner ${b.cls}"><div><b>${esc(b.text)}</b>${b.sub ? `<div class="sub">${esc(b.sub)}</div>` : ''}</div>` +
      (b.act === 'backup' ? `<button type="button" class="btn small" data-act="backup">${esc(B.backupNow)}</button>` : '') +
      (b.act === 'reload' ? `<button type="button" class="btn small" data-act="reload">${esc(B.reload)}</button>` : '') + `</div>`).join('');
    /* backup reminder: only a dot on the ⋯ menu */
    const days = S.daysSinceBackup(state(), today());
    $('moreDot').classList.toggle('hidden', !(st.canSave && (days == null || days > 7)));
  }
  $('banners').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'backup') doBackup();
    if (b.dataset.act === 'reload') location.reload();
  });
  /* an unexpected error should never fail silently */
  /* "ResizeObserver loop …" is the browser saying a size change waits for the next frame — not an error of the app */
  window.addEventListener('error', e => { if (/ResizeObserver loop/.test(e.message || '')) return; toast(C.common.error(e.message || '')); });
  window.addEventListener('storage', e => { if (e.key === S.KEY) { otherTabChanged = true; renderBanners(); } });

  /* ===================== Backup / Restore / Reset / Export all ===================== */
  /* CR-16 §4.4 — with photos in this browser: Include photos (on) · the size of the file with / without them first */
  function doBackup() {
    const ph = KT.photos && KT.photos.available() ? KT.photos.totals() : { n: 0, bytes: 0 };
    if (!ph.n) { saveBackup(false); return; }
    const K = C.data, plain = store.sizeChars ? store.sizeChars() : 0, withPh = plain + Math.ceil(ph.bytes * 4 / 3) + ph.n * 40;
    const mb = n => R.fmtNum(Math.max(0.1, Math.round(n / 104857.6) / 10));
    const sizeText = on => K.backupSize(mb(on ? withPh : plain));
    createModal({ size: 'S', title: K.backupTitle, foot: ['', cmButtons(K.backupDownload, 'bk_ok')],
      body: `<label class="tick block"><input type="checkbox" id="bk_photos" checked> ${esc(K.includePhotos)}</label>` +
        `<p class="hint">${esc(K.includePhotosHint(R.fmtNum(ph.n), ph.bytes < 1048576 ? `${R.fmtNum(Math.max(1, Math.round(ph.bytes / 1024)))} KB` : `${mb(ph.bytes)} MB`))}</p><p class="muted small" id="bk_size">${esc(sizeText(true))}</p>` });
    $('bk_photos').addEventListener('change', e => { $('bk_size').textContent = sizeText(e.target.checked); });
    $('bk_ok').addEventListener('click', async () => { const on = $('bk_photos').checked; $('bk_ok').disabled = true; await saveBackup(on); closeModal(); });
  }
  async function saveBackup(withPhotos) {
    const b = store.backup();
    let text = b.text;
    if (withPhotos) { const photos = await KT.photos.exportAll(); if (Object.keys(photos).length) text = text.replace(/}\s*$/, () => `,"photos":${JSON.stringify(photos)}}`); }   // base64 pictures under "photos" (never in localStorage)
    if (withPhotos && KT.photos.exportStepImages) { const imgs = await KT.photos.exportStepImages(); if (Object.keys(imgs).length) text = text.replace(/}\s*$/, () => `,"step_images":${JSON.stringify(imgs)}}`); }   // CR-20 §4.13: the draft images too
    download(b.filename, text, 'application/json');
    renderBanners();
    if (api.currentTab() === 'settings') api.refresh();
    toast(C.data.backupDone(b.filename));
  }
  const restoreErrText = code => { const E = C.data.restoreErr; return code.startsWith('missing:') ? E.missing(code.slice(8)) : (E[code] || code); };
  function openRestore() {
    if (!guard('data.restore')) return;
    const K = C.data; let text = null, fileName = null;
    openDialog(`<div class="dlg-h">${esc(K.restoreTitle)}</div>
      <div class="dlg-b"><div class="field"><label for="rs_file">${esc(K.restorePick)}</label><input type="file" id="rs_file" accept=".json,application/json"></div><div id="rs_preview" style="margin-top:12px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="rs_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="rs_ok" disabled>${esc(K.restoreConfirm)}</button></div>`);
    $('rs_cancel').addEventListener('click', closeDialog);
    $('rs_file').addEventListener('change', async e => {
      const f = e.target.files[0]; $('rs_ok').disabled = true; text = null;
      if (!f) { $('rs_preview').innerHTML = ''; return; }
      fileName = f.name;
      const t = await f.text(), p = store.previewRestore(t);
      if (!p.ok) { $('rs_preview').innerHTML = `<div class="check err">✕ <span>${esc(K.restoreBad)}: ${esc(p.errors.map(restoreErrText).join(' · '))}</span></div>`; return; }
      text = t;
      $('rs_preview').innerHTML = `<p class="muted small">${esc(K.restoreFileInfo(f.name, p.backupAt ? R.fmtDateTime(p.backupAt) : ''))}</p>
        <div class="check warn">! <span>${esc(K.restorePreview)}</span></div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th></th><th class="num">${esc(K.restoreColNow)}</th><th class="num">${esc(K.restoreColFile)}</th></tr></thead><tbody>` +
        S.COLLECTIONS.map(k => `<tr><td>${esc(C.counts[k])}</td><td class="num">${R.fmtNum(p.current[k])}</td><td class="num">${R.fmtNum(p.counts[k])}</td></tr>`).join('') +
        `<tr><td>${esc(K.photosRow)}</td><td class="num">${R.fmtNum(KT.photos && KT.photos.available() ? KT.photos.totals().n : 0)}</td><td class="num">${p.photos ? R.fmtNum(p.photos) : `<span class="muted" title="${esc(K.photosKept)}">—</span>`}</td></tr>` + `</tbody></table></div>`;
      $('rs_ok').disabled = false;
    });
    $('rs_ok').addEventListener('click', () => {
      if (!text || !guard('data.restore')) return;
      const r = store.restore(text, fileName);
      if (!r.ok) { toast(K.restoreBad); return; }
      closeDialog(); api.afterDataReplaced(K.restoreDone + (r.scrubbed ? ' · ' + C.msg.restoreScrubbed(r.scrubbed) : ''));
      /* CR-16 §4.4 — a backup with photos writes them back (a backup without keeps the ones in this browser) */
      if (r.photos && KT.photos.available()) KT.photos.importAll(r.photos).then(n => { if (n) toast(K.photosRestored(R.fmtNum(n))); });
      if (r.stepImages && KT.photos.available()) KT.photos.importStepImages(r.stepImages);   // CR-20 §4.13
    });
  }
  function openReset() {
    if (!guard('data.restore')) return;
    const K = C.data;
    openDialog(`<div class="dlg-h">${esc(K.resetTitle)}</div>
      <div class="dlg-b"><div class="check warn">! <span>${esc(K.resetExplain)}</span></div>
        <div class="field" style="margin-top:12px"><label for="rt_word">${esc(K.resetType)}</label><input id="rt_word" autocomplete="off" spellcheck="false"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="rt_backup">${esc(K.backupFirst)}</button><span class="spacer"></span>
        <button type="button" class="btn" id="rt_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn danger" id="rt_ok" disabled>${esc(K.resetConfirm)}</button></div>`);
    $('rt_word').addEventListener('input', e => { $('rt_ok').disabled = e.target.value.trim() !== K.resetWord; });
    $('rt_backup').addEventListener('click', doBackup);
    $('rt_cancel').addEventListener('click', closeDialog);
    $('rt_ok').addEventListener('click', () => {
      if ($('rt_word').value.trim() !== K.resetWord || !guard('data.restore')) return;
      store.reset(); closeDialog(); api.afterDataReplaced(K.resetDone);
    });
  }
  /* the six analysis CSVs (§10.1) */
  function exportAll() {
    const s = state(), ctx = R.dealContext(s), td = today();
    downloadCSV('deals.csv', R.DEALS_COLS, R.dealsRows(s, s.deals, td, ctx), true);
    downloadCSV('deal_posts.csv', R.POSTS_COLS, R.postsRows(s, s.deal_posts, ctx), true);
    downloadCSV('deal_status_log.csv', R.LOG_COLS, R.logRows(s, s.deal_status_log, ctx), true);
    downloadCSV('kol_master.csv', R.KOL_COLS, R.kolRows(s, s.kol_master), true);
    downloadCSV('kol_accounts.csv', R.ACCOUNT_COLS, R.accountRows(s, s.kol_accounts), true);
    downloadCSV('kol_rate_quotes.csv', R.QUOTE_COLS, R.quoteRows(s, s.kol_rate_quotes), true);
    toast(C.io.exportedAll);
  }

  /* ===================== navigation between screens ===================== */
  /* go('deals', {deal: 'D000123'}) — the target screen reads its params once with takeParams() */
  const pending = {};
  function go(tab, params) {
    pending[tab] = params || null;
    if (api.currentTab() === tab) api.refresh(); else location.hash = toRoute(tab);
  }
  function takeParams(tab) { const p = pending[tab]; pending[tab] = null; return p; }
  /* the query of an address (#deals?tab=open) → { link: {tab: 'open'} } for that screen, read once like go() params */
  function linkParams(tab, q) { pending[tab] = Object.assign({}, pending[tab] || {}, { link: q || {} }); }

  const api = {
    C, R, S, $, esc, today, store, state, pref, commit, toast, me, userId, filterChips, noMatchHTML, sizeDrawer, priceRefHTML, priceRefFree, priceRefSummary, costInput, journeyHTML, payTrackHTML, fitJourney, copyText, copyBtnHTML, actor, viewingAs, roleOverride, can, guard, picList, canSeeTab, toastAction, download, downloadCSV, checksHTML, checksSoftHTML, kv, field, range, stChip, stageChip, stageText,
    stageLabel, stageCell, planTip, PAY_CLS, payTicks, payCell, STATUS_CLS, PHASE_CLS, phaseChip,
    ganttAxis, pillarVar, pillarChipHTML, shortNum, bahtShort, dm, initials, avatarHTML, nameHTML, PHASE_RAMP, phaseColor, phaseColorAt, phaseVar, phaseVarAt, ppText, info, labelInfo, isFormulaInfo, infoObj, tipText, ICON, pfIcon, tierRules, distinct, stepLabel, stepTitle, optionsHTML, activeList, phaseOptionsHTML, campaignOptionsHTML, narrow, sortBy,
    dateHTML, setDate, setDateDisabled, parseDmy,
    multiSelect, msLabel, enhanceCombo, enhanceCombos, phaseOptionHTML, popForm, closePopForm, popFormError, productPickerHTML, productChipsHTML, wireProductPicker, openNewProduct, readText, reliabilityChip,
    partnerChipHTML, partnerTagHTML, partnerSegHTML, partnerSegPick,
    kolCreateHTML, kolCreateCheck, wireKolCreate, accountFieldsHTML, accountCheck, wireAccount,
    dlg, openDialog, closeDialog, confirmDialog, choiceDialog, createModal, modalOpen: () => cm.open, closeModal, requestCloseModal, modalPanel, cmButtons, openDrawer, fillDrawer, closeDrawer, suspendDrawer, requestCloseDrawer, drawerOwner: () => drawer.owner, setHash, toRoute,
    renderBanners, doBackup, openRestore, openReset, exportAll, go, takeParams, linkParams,
    currentTab: () => null,          // set by app.js
    refresh: () => {},               // set by app.js: re-render the current tab
    afterDataReplaced: () => {},     // set by app.js
  };
  return api;
})();
KT.screens = KT.screens || {};
