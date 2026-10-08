/* screen-planner.js — Phase Planner (CR-05 §4.4 · CR-11 §4.5: the create modal L — Campaign on the left, Phases on the right): the Campaign fields,
   an editable Phase table (% | ฿ for the whole table), the budget bar, a timeline preview and, when editing, what happens
   to the posts. Everything is saved together (an error anywhere saves nothing). Opened from Campaign & Phase. → KT.planner
   CR-06: a Phase is "Phase {n}" by its start date (+ an optional Label) · the Campaign's products (a new Campaign needs one) ·
   Campaign period + Number of phases + Split dates evenly · allocation presets Even / Launch-heavy / Custom · rows stay in date order
   CR-17 §4.5 — Staff plan too: a new Campaign is "Submit for approval" · on an approved Campaign their Budget · Pillar target · Phase dates / budgets /
   new / removed Phases are asked for (shown here as asked) · name · CTA · products change at once · a Rejected one is saved and Resubmitted.
   CR-18 §4.1–4.2 — the Campaign: name → KOL budget → Products → Pillar target (no CTA / Default payment term here — what a Campaign has stays) ·
   an approved Campaign's budget is read here and changed with Adjust budget · each Phase row takes Budget % or Amount (the one typed last leads,
   the money is saved) · Even / Fill remaining in baht · the bar: green = the budget · red = short / over (Save asks first) · yellow = no budget ·
   Unallocated under the last Phase · Note to approver for Staff.
   CR-19 §4.7–4.8 — no pillar target · KOL budget * (above ฿0) before Create campaign / Submit for approval / Save.
   CR-21 §3.4 · §3.6–3.7 — Cancel · Save draft · Submit for approval (Staff) / Create campaign (a manager): a draft needs only its name, the full check is
   grey until Submit / Create (red after) · closing with changes asks Save as draft? · Edit of any Campaign opens here ("Edit <name>", Note too, each Phase
   by the basis it was saved with) · the footer says what changed ("3 changes · Phase 2 period · …" — nothing = a grey "No changes") · the buttons follow
   the Campaign: a draft → Save draft / Submit (Resubmit when it was returned, with the red Returned bar) · your own pending one → "Editing moves this back
   to draft" + Resubmit · an approved one → Staff: Submit changes for approval (one request — the Campaign keeps what it has until it is approved) /
   a manager: Save changes · a Phase with deals cannot be removed · deals that would move Phase are named before saving.
   Every state change goes through R.requestTransition. */
KT.planner = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, toastAction, checksHTML, field, dm, optionsHTML, activeList, dateHTML, ICON, confirmDialog, guard, userId, setHash } = U;
  const K = C.planner, CK = C.campaign;
  let pl = null, seq = 0;
  const round2 = n => Math.round(n * 100) / 100;
  const num = v => (R.isBlank(v) || isNaN(v) ? null : Number(v));
  /* CR-11 §4.5 — the modal (L): New campaign · New phase · Plan phases · one at a time, the page behind waits */
  const box = () => $('cm_root');
  const mine = () => !!pl && !!pl.m && !!box();

  /* ===================== open ===================== */
  /* o: {campaignId (none = a new Campaign), addRow, focusPhase, opener} */
  function open(o = {}) {
    if (!guard('campaign.draft')) return;   // CR-17: Staff too
    if (U.modalOpen()) U.closeModal();
    const s = state(), c = o.campaignId ? s.campaigns.find(x => x.campaign_id === o.campaignId) : null, me = U.actor(), uid = userId();
    const status = !c ? 'new' : R.isDraft(c) ? 'draft' : !R.isApproved(c) ? 'pending' : 'approved';
    /* CR-17 — for someone who asks: what they asked for shows (a Phase they asked to remove is left out) */
    const asker = !R.canApprove(me), ask = r => (asker && r && r.pending_change && r.pending_change.requested_by === uid ? r.pending_change.fields : {});
    /* a draft Phase of an approved Campaign is only its maker's (an Admin sees every one) */
    const seen = p => !R.isDraft(p) || R.isDraft(c) || R.ownerOf(p) === uid || me.role === 'admin';
    const phases = c ? R.sortPhases(s.phases.filter(p => p.campaign_id === c.campaign_id && seen(p) && !ask(p).delete)) : [];
    const ca = c ? ask(c) : {}, cv = k => (ca[k] !== undefined ? ca[k] : c[k]);
    const budgetOf = v => (v == null ? '' : String(v));
    pl = {
      mode: c ? 'edit' : 'new', status, campaignId: c ? c.campaign_id : null,
      camp: { campaign_name: c ? cv('campaign_name') || '' : '', budget_kol: c ? budgetOf(cv('budget_kol')) : '', products: c ? (ca.products || R.campaignProductCodes(s, c.campaign_id)).slice() : [], note: c ? cv('note') || '' : '' },
      /* CR-21 §3.7 — each Phase by the basis it was saved with (Budget % or Amount) */
      rows: phases.map(p => { const a = ask(p), v = k => (a[k] !== undefined ? a[k] : p[k]);
        return { key: 'k' + (++seq), phase_id: p.phase_id, label: v('label') || '', start_date: v('start_date') || '', end_date: v('end_date') || '', amount: v('budget_kol') == null ? '' : String(v('budget_kol')), pct: '',
          basis: p.budget_basis === 'percent' ? 'percent' : 'amount', default_pillar: v('default_pillar') || '', waiting: !R.isApproved(p) || !!p.pending_change }; }),
      note: '', deleted: [], touched: new Set(), submitted: null, dirty: false, focusRow: null,
      /* the period only helps plan (not saved): an existing Campaign starts with its Phases' dates; typing it makes the count re-split the dates */
      period: { start: phases.map(p => p.start_date).filter(Boolean).sort()[0] || '', end: phases.map(p => p.end_date).filter(Boolean).sort().pop() || '' },
      countErr: null, moved: null,
    };
    /* the % of a Budget % row from its saved amount (the amount stays as it was) · the others follow the budget */
    pl.rows.forEach(r => { if (r.basis === 'percent') { const b = budget(), a = R.money(r.amount); r.pct = b && a != null ? pctText(round2(a / b * 100)) : ''; } else syncRow(r); });
    pl.base = snapNow();   // what the footer compares with (CR-21: "3 changes · …")
    if (!pl.rows.length || o.addRow) addRow(false);
    const me2 = pl, fi = o.focusPhase ? pl.rows.findIndex(r => r.phase_id === o.focusPhase) : -1, last = pl.rows.length - 1;
    /* the first thing to fill: a new Campaign's name · New phase: the new row's period (its picker opens on the day after the last Phase) · a Phase: its row */
    const focusSel = me2.mode === 'new' && !o.addRow ? '[data-c="campaign_name"]' : o.addRow ? `[data-row="${last}"] .drange-t` : fi >= 0 ? `[data-row="${fi}"] [data-k="label"]` : null;
    me2.m = U.createModal({ size: 'L', title: c ? K.editTitle(c.campaign_name) : K.newTitle, sub: K.sub, opener: o.opener, focus: () => focusSel,
      isDirty: () => !!me2.dirty, onClick, redraw: () => { if (pl === me2) render(); }, askClose: canDraftNow() ? askClose : null,
      onClose: () => { if (pl === me2) pl = null; if (U.currentTab() === 'campaign') setHash('campaign'); } });
    box().addEventListener('input', onInput); box().addEventListener('change', onChange);
    box().addEventListener('focusin', e => { const r = e.target.closest('[data-row]'); if (r && pl) pl.focusRow = +r.dataset.row; });
    /* CR-18 §4.2 — money boxes show their commas once left (1,000,000) */
    box().addEventListener('focusout', e => { const t = e.target; if (!pl || !t.classList || !t.classList.contains('numin') || t.dataset.k === 'pct') return; const v = R.money(t.value); if (v != null && v >= 0) t.value = R.fmtNum(v); });
    render();
    if (o.addRow && pl.mode === 'edit') setTimeout(() => { const r = pl && pl.rows[last], el = r && box() && box().querySelector(`[data-row="${last}"] .drange`); if (el && r.start_date) U.openRange(el, { from: r.start_date, to: '' }); }, 40);
  }
  /* CR-21 §3.4 — closing with changes: Save as draft? (Save draft · Discard · Keep editing) — true = close */
  async function askClose() {
    const AP = C.approval;
    const k = await U.choiceDialog(AP.saveAsDraftTitle, AP.saveAsDraftBody, [{ key: 'keep', label: AP.keepEditing }, { key: 'discard', label: AP.discard, cls: 'danger' }, { key: 'save', label: AP.saveDraft, cls: 'primary' }]);
    if (k === 'discard') return true;
    if (k === 'save' && pl) await save('draft');
    return false;   // (Save draft closes it when it saved)
  }
  const isOpen = () => !!pl;
  function reopen() { if (pl) render(); }
  function focusRow(i) {
    const el = i < 0 ? box().querySelector('[data-c="campaign_name"]') : box().querySelector(`[data-row="${i}"] [data-k="label"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  }
  /* CR-18 §4.2 — Budget % ↔ Amount: the one typed last leads (basis), the other follows the Campaign budget (R.phaseBudgetSync) */
  const budget = () => R.money(pl.camp.budget_kol);
  const pctText = v => (v == null ? '' : Number(v).toFixed(2));
  const amtText = v => (v == null ? '' : String(v));
  function syncRow(r) { const x = R.budgetRow(r, pl.camp.budget_kol); if (r.basis === 'percent' && budget()) r.amount = amtText(x.amount); else r.pct = pctText(x.pct); }
  /* the Campaign budget changed (or the plan opened): every row by its basis */
  function sync() { pl.rows.forEach(syncRow); }
  /* Even (any count, the last row takes the rest) · Launch-heavy 20 / 65 / 15 (3 phases): the money of every row at once */
  function applyPreset(key) {
    const b = budget(); if (!b) return false;
    if (key === 'even') { R.evenAmounts(b, pl.rows.length).forEach((a, i) => Object.assign(pl.rows[i], { amount: String(a), basis: 'amount' })); }
    else { const x = R.presetSplit(key, pl.rows.length, b); if (!x) return false; pl.rows.forEach((r, i) => Object.assign(r, { pct: String(x.pcts[i]), basis: 'percent' })); }
    sync();
    return true;
  }
  /* CR-21 — what the plan says now (R.planSnapshot · the footer diff · R.requestDiff) */
  const snapNow = () => R.planSnapshot(state(), { campaign_name: pl.camp.campaign_name, budget_kol: budgetLocked() ? undefined : pl.camp.budget_kol, products: pl.camp.products, note: pl.camp.note }, planRows());
  const diffNow = () => R.requestDiff(pl.base, snapNow());
  /* rows in Phase order (start, end, then the order they were added) — "Phase n" = the row's place */
  function sortRows() {
    const before = pl.rows.slice(), seqs = R.planSeqs(planRows());
    pl.rows = before.map((r, i) => ({ r, s: seqs[i] })).sort((a, b) => a.s - b.s).map(x => x.r);
    return pl.rows.some((r, i) => r !== before[i]);
  }
  /* a new Campaign with a period: the dates follow the period and the count by themselves (an existing one uses Split dates evenly) */
  const autoSplit = () => (pl.mode === 'new' || pl.status === 'draft') && periodOk();   // (CR-21: a draft plans like a new one)
  const periodOk = () => R.isISODate(pl.period.start) && R.isISODate(pl.period.end) && pl.period.end >= pl.period.start;
  /* the period cut into the rows (in their order) */
  function splitIntoPeriod(silent) {
    if (!periodOk()) { if (!silent) pl.countErr = { field: 'period', msg: C.msg.planPeriodNeeded }; return false; }
    const parts = R.splitDates(pl.period.start, pl.period.end, pl.rows.length);
    if (!parts) { if (!silent) pl.countErr = { field: 'period', msg: C.msg.planPeriodShort(pl.rows.length) }; return false; }
    pl.rows.forEach((r, i) => Object.assign(r, parts[i]));
    return true;
  }
  /* Number of phases: more = rows at the end · fewer = the last rows go (not a Phase with posts) */
  function setCount(v) {
    const x = R.resizePlan(planRows(), Number(v), r => !!r.phase_id && !R.canDeletePhase(state(), r.phase_id));
    if (x.err) { pl.countErr = x.err; return false; }
    pl.countErr = null;
    const gone = new Set(x.remove.map(r => r.key));
    pl.rows.filter(r => gone.has(r.key) && r.phase_id).forEach(r => pl.deleted.push(r.phase_id));
    pl.rows = pl.rows.filter(r => !gone.has(r.key));
    for (let i = 0; i < x.add; i++) addRow(false);
    if (autoSplit()) splitIntoPeriod(true);
    pl.dirty = true;
    return true;
  }
  function addRow(rerender = true) {
    const last = pl.rows[pl.rows.length - 1];
    pl.rows.push({ key: 'k' + (++seq), phase_id: null, label: '', start_date: last && R.isISODate(last.end_date) ? R.addDays(last.end_date, 1) : '', end_date: '', amount: '', pct: '', basis: 'amount' });
    pl.dirty = true;
    /* CR-10 §4.8: + Add phase opens the new row's picker on the day after the last Phase, waiting for the end */
    if (rerender) { render(); const r = pl.rows[pl.rows.length - 1], el = box().querySelector(`[data-row="${pl.rows.length - 1}"] .drange`); if (el && r.start_date) U.openRange(el, { from: r.start_date, to: '' }); else focusRow(pl.rows.length - 1); }
  }
  /* the money of a row ('' / a number · "1,000" reads as 1000 · anything else stays as typed so it is flagged) */
  const moneyOf = v => { const m = R.money(v); return m == null ? (R.isBlank(v) ? '' : v) : m; };
  const planRows = () => pl.rows.map(r => ({ key: r.key, phase_id: r.phase_id, label: r.label, start_date: r.start_date, end_date: r.end_date, budget_kol: moneyOf(r.amount), budget_pct: r.basis === 'percent' ? r.pct : '', default_pillar: r.default_pillar || '' }));
  const campDraft = () => ({ campaign_id: pl.campaignId, campaign_name: pl.camp.campaign_name, budget_kol: moneyOf(pl.camp.budget_kol), products: pl.camp.products, note: pl.camp.note });
  /* CR-18 §4.1 — an approved Campaign's budget is the approved one: read here, changed with Adjust budget */
  const budgetLocked = () => { const c = campNow(); return !!c && R.isApproved(c) && !R.isBlank(c.budget_kol); };   // (CR-19: an approved one with no budget yet takes it here)
  /* CR-21 §3.4 — mode 'draft': the name only · else everything (CR-19 §4.8: the KOL budget above ฿0 — an approved budget is read-only here) */
  function validate(mode) {
    const res = R.validatePlan(state(), campDraft(), planRows(), pl.deleted, mode === 'draft' ? 'draft' : 'submit', { budgetLocked: budgetLocked() });
    if (pl.countErr && mode !== 'draft') res.errs.unshift(pl.countErr);
    return res;
  }
  /* "Phase n" of each row by its start date (CR-06 §4.2) */
  const rowNames = () => { const seqs = R.planSeqs(planRows()); return pl.rows.map((r, i) => R.phaseTitle(seqs[i], '')); };
  /* CR-13 §4.3 — the grey of a row: its place by date among the rows of the plan (the same ramp as everywhere) */
  const phaseVarOf = key => { const order = sortedKeys(); return U.phaseVarAt(R.phaseSteps(order.length)[order.indexOf(key)]); };
  const rowTitle = (r, i) => { const seqs = R.planSeqs(planRows()); return R.phaseTitle(seqs[i], r.label); };

  /* ===================== draw ===================== */
  const sec = (title, body, extra, id) => `<section class="sec"${id ? ` id="${id}"` : ''}><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;
  function rowHTML(r, i) {
    const s = state(), canDel = !r.phase_id || R.canDeletePhase(s, r.phase_id), noB = !budget(), hasDeals = canDel ? '' : K.hasDeals(R.phaseDealCount(s, r.phase_id));
    return `<tr data-row="${i}"${r.key === pl.moved ? ' class="moved"' : ''}><td class="pl-seq"><span class="dotc" style="background:${phaseVarOf(r.key)}"></span><span data-seqname>${esc(rowNames()[i])}</span>${r.waiting ? ` <span class="st apending ap-chg" title="${esc(C.approval.changePendingTip)}">${esc(C.approval.waitingShort)}</span>` : ''}</td>
      <td><input data-k="label" data-key="row${i}_label" value="${esc(r.label)}" placeholder="${esc(K.labelPh)}" aria-label="${esc(K.colLabel)}" autocomplete="off"></td>
      <td class="pl-per">${U.rangeHTML(`data-range="row" data-key="row${i}_start" data-key2="row${i}_end"`, R.isISODate(r.start_date) ? r.start_date : '', R.isISODate(r.end_date) ? r.end_date : '', { label: `${rowNames()[i]} · ${K.colPeriod}` })}</td>
      <td class="num" data-days></td>
      <td class="num"><input class="numin pl-pct" inputmode="decimal" data-k="pct" data-key="row${i}_budget" value="${noB ? '' : esc(r.pct)}" placeholder="${noB ? '—' : '0.00'}"${noB ? ` disabled title="${esc(K.addBudgetFirst)}"` : ''} aria-label="${esc(`${rowNames()[i]} · ${K.colBudgetPct}`)}" autocomplete="off"></td>
      <td class="num"><input class="numin pl-amt" inputmode="numeric" data-k="amount" data-key="row${i}_budget" value="${esc(R.money(r.amount) != null ? R.fmtNum(R.money(r.amount)) : r.amount)}" placeholder="0" aria-label="${esc(`${rowNames()[i]} · ${K.colAmount}`)}" autocomplete="off"></td>
      <td><select data-k="default_pillar" data-key="row${i}_pillar" aria-label="${esc(`${rowNames()[i]} · ${C.fill.defaultPillar}`)}">${optionsHTML(activeList('pillar_list', r.default_pillar || null), r.default_pillar || '', C.fill.none)}</select></td>
      <td><details class="menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}" title="${esc(C.app.more)}">⋯</summary><div class="menu-list right">
        <button type="button" class="mi" data-dup="${i}">${esc(K.dup)}</button>
        <button type="button" class="mi danger" data-del="${i}"${canDel ? '' : ` disabled aria-disabled="true" title="${esc(hasDeals)}"`}>${esc(K.del)}${canDel ? '' : ` <span class="muted small">· ${esc(hasDeals)}</span>`}</button></div></details></td></tr>`;
  }
  function html() {
    const c = pl.camp, isNew = pl.mode === 'new', locked = budgetLocked();
    const budgetField = locked
      ? `<div class="field wide"><label>${esc(CK.fCampaignBudget)}</label><div class="ro-budget"><b>${R.isBlank(c.budget_kol) ? '—' : R.baht(R.money(c.budget_kol))}</b>${KT.budget.pendingTagHTML(pl.campaignId)}` +
        `${KT.budget.canAdjust() && (campNow() || {}).status_override !== 'cancelled' ? ` <button type="button" class="btn small" data-pladjust>${esc(CK.adjustBudget)}</button>` : ''}</div><div class="hint">${esc(C.budget.readOnlyHint)}</div></div>`
      : field('budget_kol', CK.fCampaignBudget, `<input class="numin" inputmode="numeric" id="f_budget_kol" data-c="budget_kol" data-key="budget_kol" value="${esc(R.money(c.budget_kol) != null ? R.fmtNum(R.money(c.budget_kol)) : c.budget_kol)}" placeholder="0" autocomplete="off">`, { req: 1, wide: 1, hint: esc(CK.campaignBudgetHint) });
    const campaign = `<div class="fields">
        ${field('campaign_name', CK.fName, `<input id="f_campaign_name" data-c="campaign_name" data-key="campaign_name" value="${esc(c.campaign_name)}" placeholder="${esc(CK.namePh)}" autocomplete="off">`, { req: 1, wide: 1 })}
        ${budgetField}
        ${field('products', K.fProducts, U.productPickerHTML('pl_products', c.products, code => (pl.campaignId ? R.productDealsInCampaign(state(), pl.campaignId, code).length : 0)), { req: isNew, wide: 1, hint: esc(K.productsHint) })}
        ${field('note', K.fNote, `<textarea id="f_note" data-c="note" data-key="cnote" rows="2" placeholder="${esc(K.notePh)}">${esc(c.note)}</textarea>`, { wide: 1 })}
        ${asking() ? `<div class="field wide"><label for="pl_note">${esc(C.approval.noteL)} <span class="muted small">${esc(C.approval.noteOptional)}</span></label><textarea id="pl_note" data-plnote data-key="note" rows="2" placeholder="${esc(C.approval.notePh)}">${esc(pl.note)}</textarea></div>` : ''}
      </div>`;
    const n = pl.rows.length, noB = !budget(), dis = noB ? ` disabled title="${esc(K.addBudgetFirst)}"` : '';
    const plan = `<div class="pl-plan">
        <div class="field"><label>${esc(K.period)}</label><div class="pl-period">${U.rangeHTML('data-range="period" data-key="period"', pl.period.start, pl.period.end, { label: K.period, clearable: true })}</div><div class="hint">${esc(K.periodHint)}</div></div>
        <div class="field"><label for="pl_count">${esc(K.count)}</label><span class="stepper-n pl-count"><button type="button" class="icon-btn" data-count="-1" aria-label="${esc(K.fewer)}"${n <= 1 ? ' disabled' : ''}>−</button>` +
          `<input type="number" id="pl_count" min="1" max="${R.MAX_PHASES}" step="1" inputmode="numeric" data-key="count" value="${n}"><button type="button" class="icon-btn" data-count="1" aria-label="${esc(K.more)}"${n >= R.MAX_PHASES ? ' disabled' : ''}>+</button></span></div>
        <div class="field"><label>&nbsp;</label><button type="button" class="btn small" data-splitdates title="${esc(K.splitDatesTip)}">${esc(K.splitDates)}</button></div>
      </div>
      <div class="btns pl-tools"><span class="muted small">${esc(K.allocation)}</span><button type="button" class="btn small" data-preset="even"${noB ? dis : ` title="${esc(K.evenTip)}"`}>${esc(K.even)}</button>` +
        (n === 3 ? `<button type="button" class="btn small" data-preset="launch"${dis}>${esc(K.presetLaunch)}</button>` : '') +
        `<button type="button" class="btn small" data-fill${noB ? dis : ` title="${esc(K.fillTip)}"`}>${esc(K.fillRemaining)}</button></div>`;
    const table = plan + `<div class="tablewrap"><table class="tbl pl-tbl"><thead><tr><th>${esc(K.colName)}</th><th>${esc(K.colLabel)}</th><th>${esc(K.colPeriod)}</th><th class="num">${esc(K.colDays)}</th>` +
      `<th class="num">${esc(K.colBudgetPct)}</th><th class="num">${esc(K.colAmount)}</th><th title="${esc(C.fill.defaultPillarHint)}">${esc(C.fill.defaultPillar)}</th><th></th></tr></thead><tbody>${pl.rows.map(rowHTML).join('')}</tbody><tfoot id="pl_foot"></tfoot></table></div>` +
      `<div class="btns" style="margin-top:8px"><button type="button" class="btn small" data-add>${esc(K.add)}</button></div><div class="pl-bar" id="pl_bar"></div>`;
    return { body: `${barsHTML()}<div class="pl-grid"><div class="pl-l">${sec(K.secCampaign, campaign)}</div><div class="pl-r">${sec(K.secPhases, table)}${sec(K.secTimeline, `<div id="pl_tl"></div>`)}` +
        `${isNew ? '' : sec(K.secImpact, `<div id="pl_impact"></div>`, '', 'pl_impactSec')}</div></div>`,
      left: `${hint() ? `<div class="hint pl-aphint">${esc(hint())}</div>` : ''}<div class="pl-diff muted small" id="pl_diff"></div><div class="checks" id="pl_checks"></div>`,
      buttons: `<button type="button" class="btn" data-cmclose>${esc(C.common.cancel)}</button>` +
        (canDraftNow() ? `<button type="button" class="btn" data-pldraft>${esc(C.approval.saveDraft)}</button>` : '') +
        `<button type="button" class="btn primary" data-plsave>${esc(saveLabel())}</button>` };
  }
  /* CR-21 §3.6 — the bars on top: Returned by … — reason · Change returned — reason (+ Cancel request) · Editing moves this back to draft */
  function barsHTML() {
    const AP = C.approval, s = state(), c = campNow(); if (!c) return '';
    const day = iso => (iso ? R.dmy(R.dateOfTimestamp(iso)) : '');
    if (pl.status === 'draft' && c.returned_at) return `<div class="check err pl-bar-top">✕ <span>${esc(AP.returnedBar(R.changedByName(s, c.returned_by), day(c.returned_at), c.returned_reason || ''))}</span></div>`;
    if (ownPending()) return `<div class="check warn pl-bar-top">! <span>${esc(AP.editingMovesBack)}</span></div>`;
    const back = myChanges().filter(r => r.returned);
    if (pl.status === 'approved' && back.length) return `<div class="check err pl-bar-top">✕ <span>${esc(AP.changeReturned(back[0].returned.reason))}</span> <button type="button" class="btn small" data-plcancelreq>${esc(AP.cancelRequest)}</button></div>`;
    return '';
  }
  /* CR-17 §4.5 · CR-21 §3.7 — the words of the buttons for this person and this Campaign */
  const asking = () => !R.canApprove(U.actor());
  const campNow = () => (pl.campaignId ? state().campaigns.find(x => x.campaign_id === pl.campaignId) : null);
  const ownPending = () => pl.status === 'pending' && asking() && R.ownerOf(campNow()) === userId();
  /* the requests of mine on this (approved) Campaign: its change · its Phases' changes · my new Phases */
  const myChanges = () => (pl.campaignId ? R.requestsIn(state(), 'draft').concat(R.requestsIn(state(), 'pending')).filter(r => r.campaign_id === pl.campaignId && r.by === userId() && (r.type === 'change' || r.type === 'new_phase')) : []);
  /* someone else's draft / pending request: Staff only look (its maker or a manager changes it) */
  const othersRequest = () => asking() && (pl.status === 'draft' || pl.status === 'pending') && R.ownerOf(campNow()) !== userId();
  /* Save draft is there for a new / draft Campaign, your own pending one and a Staff edit of an approved one (not a manager's direct edit) */
  const canDraftNow = () => pl && (pl.status === 'new' || pl.status === 'draft' || ownPending() || (pl.status === 'approved' && asking()));
  function saveLabel() {
    const AP = C.approval, c = campNow();
    if (pl.status === 'new') return asking() ? AP.submit : K.createCampaign;
    if (pl.status === 'draft') return asking() ? (c && c.returned_at ? AP.resubmitFor : AP.submit) : K.createCampaign;
    if (pl.status === 'pending') return ownPending() ? AP.resubmitFor : AP.saveChanges;
    return asking() ? AP.submitChanges : AP.saveChanges;
  }
  function hint() {
    if (!asking()) return '';
    if (pl.status === 'new' || pl.status === 'draft') return C.approval.needsApproval;
    return pl.status === 'approved' ? C.approval.askHint : '';
  }
  function render() {
    if (!mine()) return;
    const v = html();
    pl.m.setBody(v.body, true); pl.m.setFoot(v.left, v.buttons);
    const b = box();
    setHash(pl.campaignId ? 'campaign/' + pl.campaignId : 'campaign');
    if (pl.moved) { const k = pl.moved; setTimeout(() => { if (pl && pl.moved === k) { pl.moved = null; const tr = box().querySelector('tr.moved'); if (tr) tr.classList.remove('moved'); } }, 1000); }
    U.wireProductPicker($('pl_products'), { get: () => pl.camp.products, set: codes => { pl.camp.products = codes; pl.dirty = true; pl.touched.add('products'); refresh(); },
      locked: code => (pl.campaignId ? R.productDealsInCampaign(state(), pl.campaignId, code).length : 0), canNew: U.can('campaign.edit'), askUsed: true });
    /* CR-10 §4.8 — what each date range picker shows: the Campaign period in grey, the other Phases underlined in their colours */
    const marks = () => pl.rows.map((r, i) => (okRow(r) ? { key: r.key, from: r.start_date, to: r.end_date, color: phaseVarOf(r.key), title: rowTitle(r, i) } : null)).filter(Boolean);
    const band = () => (R.isISODate(pl.period.start) && R.isISODate(pl.period.end) ? { from: pl.period.start, to: pl.period.end } : null);
    b.querySelectorAll('.drange[data-range="row"]').forEach(el => { const key = pl.rows[+el.closest('[data-row]').dataset.row].key; el._rangeOpts = () => ({ band: band(), marks: marks().filter(m => m.key !== key) }); });
    const pe = b.querySelector('.drange[data-range="period"]'); if (pe) pe._rangeOpts = () => ({ marks: marks() });
    refresh();
  }

  /* ===================== live parts (typing never loses focus) ===================== */
  function refresh() {
    if (!mine() || !$('pl_checks')) return;   // a panel in place (New product) is showing
    const b = box(), res = validate(pl.submitted === 'draft' ? 'draft' : 'submit'), show = f => !!pl.submitted || pl.touched.has(f), names = rowNames();
    pl.rows.forEach((r, i) => {
      const tr = b.querySelector(`[data-row="${i}"]`); if (!tr) return;
      tr.querySelector('[data-seqname]').textContent = names[i];
      const ok = R.isISODate(r.start_date) && R.isISODate(r.end_date) && r.end_date >= r.start_date;
      tr.querySelector('[data-days]').textContent = ok ? R.fmtNum(R.dayDiff(r.end_date, r.start_date) + 1) : '—';
      /* the column not being typed in follows (CR-18 §4.2) */
      const pi = tr.querySelector('[data-k="pct"]'), ai = tr.querySelector('[data-k="amount"]'), a = document.activeElement;
      if (pi && pi !== a) pi.value = budget() ? r.pct : '';
      if (ai && ai !== a) { const m = R.money(r.amount); ai.value = m != null ? R.fmtNum(m) : r.amount; }
    });
    const sy = R.phaseBudgetSync(pl.camp.budget_kol, pl.rows);
    $('pl_foot').innerHTML = sy.state === 'under' ? `<tr class="pl-unal"><td>${esc(K.unallocatedRow)}</td><td></td><td></td><td></td><td class="num">${esc(pctText(sy.diff / sy.budget * 100))}</td><td class="num">${R.baht(sy.diff)}</td><td></td><td></td></tr>` : '';
    /* CR-21 §3.4 — red only after Submit / Create (or Save draft without a name) · before that the full check is a grey hint */
    const warns = res.warns.filter(w => w.field !== 'products' || show('products')).concat(moveWarn());
    const red = !!pl.submitted, shown = Object.assign({}, res, { errs: res.errs.filter(e => red || e === pl.countErr), warns });
    $('pl_checks').innerHTML = red ? checksHTML(shown, '') : U.checksSoftHTML(Object.assign({}, res, { warns }), '');
    b.querySelectorAll('[data-key]').forEach(el => {
      const keys = [el.dataset.key, el.dataset.key2].filter(Boolean), bad = red && keys.some(k => res.errs.some(e => e.field === k)), w = el.closest('.dfield') || el;
      w.classList.toggle('invalid', bad); el.classList.toggle('invalid', bad);
    });
    /* the footer says what changed (an existing Campaign) · nothing → a grey "No changes" */
    const diff = pl.mode === 'edit' ? diffNow() : [], none = pl.mode === 'edit' && !diff.length && !canSendAsIs();
    $('pl_diff').textContent = R.diffSummary(diff);
    const sv = b.querySelector('[data-plsave]'); sv.disabled = none || (red && pl.submitted !== 'draft' && res.errs.length > 0); sv.textContent = none ? C.approval.noChanges : saveLabel(); sv.classList.toggle('nochg', none);
    const dr = b.querySelector('[data-pldraft]'); if (dr) dr.disabled = othersRequest() || (pl.status !== 'new' && pl.status !== 'draft' && !diff.length);
    if (othersRequest()) { sv.disabled = true; $('pl_diff').textContent = C.approval.readOnly; }
    $('pl_bar').innerHTML = barHTML();
    $('pl_tl').innerHTML = timelineHTML();
    if ($('pl_impact')) impact();
    return res;
  }
  /* a draft (or my returned change) may be sent as it is — the rest needs a change first */
  const canSendAsIs = () => pl.status === 'draft' || (pl.status === 'approved' && asking() && myChanges().some(r => r.status === 'draft'));
  /* CR-21 §3.7 — deals whose posts would fall into another Phase (named before saving, orange) */
  function moveWarn() {
    if (pl.mode !== 'edit') return [];
    const s = state(), stored = new Map(s.phases.filter(p => p.campaign_id === pl.campaignId).map(p => [p.phase_id, p]));
    const changed = pl.deleted.length || pl.rows.some(r => { const p = r.phase_id && stored.get(r.phase_id); return !p ? okRow(r) : p.start_date !== r.start_date || p.end_date !== r.end_date; });
    if (!changed) return [];
    const x = R.planImpact(s, pl.campaignId, planRows(), pl.deleted);
    return x.movedDeals ? [{ field: 'move', msg: K.dealsMove(x.movedDeals) }] : [];
  }
  /* the budget bar: one square bar split by Phase colour against the Campaign budget, the part over it in red */
  function barHTML() {
    const t = R.planTotals(campDraft(), planRows()), scale = Math.max(t.budget || 0, t.allocated) || 1, sy = R.phaseBudgetSync(pl.camp.budget_kol, pl.rows);
    const seg = pl.rows.map((r, i) => ({ r, i, v: R.money(r.amount) || 0 })).filter(x => x.v > 0);
    const segs = seg.map(x => `<span style="width:${x.v / scale * 100}%;background:${phaseVarOf(x.r.key)}" title="${esc(`${rowTitle(x.r, x.i)} · ${R.baht(x.v)}`)}"></span>`).join('');
    const over = t.budget != null && t.diff < 0, mark = t.budget != null ? `<i class="pl-cap" style="left:${t.budget / scale * 100}%"></i>` : '';
    const overlay = over ? `<b class="pl-over" style="left:${t.budget / scale * 100}%;width:${-t.diff / scale * 100}%"></b>` : '';
    /* CR-18 §4.2 — green = the budget · red = short / over · yellow = no Campaign budget */
    const text = sy.state === 'nobudget' ? `<span class="pl-msg muted">${esc(K.budgetFirst)}</span>`   // CR-19 §4.8: grey until the KOL budget is typed
      : sy.state === 'even' ? `<span class="pl-msg ok">✓ ${esc(K.barEven(R.baht(sy.allocated), R.baht(sy.budget)))}</span>`
      : sy.state === 'over' ? `<span class="pl-msg err">! ${esc(K.barOver(R.baht(-sy.diff)))}</span>`
      : `<span class="pl-msg err">! ${esc(K.barUnder(R.baht(sy.diff), R.baht(sy.allocated), R.baht(sy.budget)))}</span>`;
    return `<div class="pl-track">${segs}${overlay}${mark}</div><div class="pl-text">${text}</div>`;
  }
  const okRow = r => R.isISODate(r.start_date) && R.isISODate(r.end_date) && r.start_date <= r.end_date;
  const sortedKeys = () => pl.rows.filter(okRow).slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0)).map(r => r.key).concat(pl.rows.filter(r => !okRow(r)).map(r => r.key));
  /* timeline preview: month ticks · one lane with every Phase (overlaps hatched, gaps dashed) · a row per Phase */
  function timelineHTML() {
    const rows = pl.rows.filter(okRow); if (!rows.length) return `<div class="hint">${esc(K.noDates)}</div>`;
    const from = rows.map(r => r.start_date).sort()[0], to = rows.map(r => r.end_date).sort().pop(), span = R.dayDiff(to, from) + 1;
    const x = iso => R.dayDiff(iso, from) / span * 100, w = (a, b) => (R.dayDiff(b, a) + 1) / span * 100, order = sortedKeys();
    const color = r => phaseVarOf(r.key);
    let months = '', d = from.slice(0, 8) + '01';
    while (d <= to) { if (d >= from) months += `<span class="pl-m" style="left:${x(d)}%">${esc(C.overview.months[+d.slice(5, 7) - 1])}</span>`; d = R.addDays(d.slice(0, 8) + '28', 7).slice(0, 8) + '01'; }
    const ov = R.phaseOverlaps(rows.map(r => Object.assign({}, r, { phase_id: r.key })));
    let lane = rows.map(r => `<span class="pl-seg" style="left:${x(r.start_date)}%;width:${w(r.start_date, r.end_date)}%;background:${color(r)}"></span>`).join('');
    lane += ov.map(o => `<span class="pl-hatch" style="left:${x(o.from)}%;width:${w(o.from, o.to)}%" title="${esc(K.overlapTip(R.dmy(o.from), R.dmy(o.to)))}"></span>`).join('');
    let cover = null;
    rows.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).forEach(r => {
      if (cover && r.start_date > R.addDays(cover, 1)) lane += `<span class="pl-gap" style="left:${x(R.addDays(cover, 1))}%;width:${w(R.addDays(cover, 1), R.addDays(r.start_date, -1))}%" title="${esc(K.gapTip(R.dmy(R.addDays(cover, 1)), R.dmy(R.addDays(r.start_date, -1))))}"></span>`;
      if (!cover || r.end_date > cover) cover = r.end_date;
    });
    const list = order.map(k => pl.rows.findIndex(r => r.key === k)).filter(i => okRow(pl.rows[i])).map(i => { const r = pl.rows[i], name = rowTitle(r, i); return `<div class="pl-row"><span class="pl-name" title="${esc(name)}">${esc(name)}</span>` +
      `<span class="pl-track2"><span class="pl-seg" style="left:${x(r.start_date)}%;width:${w(r.start_date, r.end_date)}%;background:${color(r)}" title="${esc(`${dm(r.start_date)} – ${dm(r.end_date)}`)}"></span></span></div>`; }).join('');
    return `<div class="pl-tl"><div class="pl-row"><span class="pl-name"></span><span class="pl-months">${months}</span></div>` +
      `<div class="pl-row"><span class="pl-name muted small">${esc(K.allPhases)}</span><span class="pl-track2 lane">${lane}</span></div>${list}</div>`;
  }
  /* edit mode: what the new dates do to the posts (CR-03 resolvePostPhase / committed per Phase) */
  function impact() {
    const s = state(), stored = new Map(s.phases.filter(p => p.campaign_id === pl.campaignId).map(p => [p.phase_id, p]));
    const changed = pl.deleted.length || pl.rows.some(r => { const p = r.phase_id && stored.get(r.phase_id); return !p ? okRow(r) : p.start_date !== r.start_date || p.end_date !== r.end_date; });
    if (!changed) { $('pl_impact').innerHTML = `<div class="hint">${esc(K.noDateChange)}</div>`; return; }
    const x = R.planImpact(s, pl.campaignId, planRows(), pl.deleted);
    const lines = [x.moved ? K.moved(x.moved) : K.noMove].concat(x.toAuto ? [K.toAuto(x.toAuto)] : []).concat(x.needs ? [K.needs(x.needs)] : []);
    $('pl_impact').innerHTML = `<p class="pl-impact-l">${lines.map(esc).join(' · ')}</p>` +
      (x.renumber.length ? `<ul class="pl-renum">${x.renumber.map(r => `<li>${esc(K.renumber(r.from, r.to))}</li>`).join('')}</ul>` : '') +
      `<div class="tablewrap"><table class="tbl compact-sm"><thead><tr><th>${esc(K.colName)}</th><th class="num">${esc(K.colBefore)}</th><th class="num">${esc(K.colAfter)}</th></tr></thead><tbody>` +
      x.rows.map(r => `<tr${r.before !== r.after ? ' class="chg"' : ''}><td>${esc(r.name || '—')}</td><td class="num">${R.baht(r.before)}</td><td class="num">${R.baht(r.after)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(K.total)}</td><td class="num">${R.baht(x.totalBefore)}</td><td class="num">${R.baht(x.totalAfter)}</td></tr></tbody></table></div>`;
  }

  /* ===================== events ===================== */
  function onInput(e) {
    if (!mine()) return;
    const t = e.target, tr = t.closest('[data-row]');
    if (t.dataset.c) { const had = !!budget(); pl.camp[t.dataset.c] = t.value; if (t.dataset.c === 'budget_kol') { sync(); if (had !== !!budget()) { pl.dirty = true; render(); const el = $('f_budget_kol'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } return; } } }
    else if (t.dataset.plnote != null) { pl.note = t.value; pl.dirty = true; return; }
    else if (t.dataset.pp) { pl.period[t.dataset.pp] = t.value === 'invalid' ? '' : t.value; }
    else if (t.id === 'pl_count') return;
    else if (tr && t.dataset.k) {
      const r = pl.rows[+tr.dataset.row];
      r[t.dataset.k] = t.value === 'invalid' ? 'invalid' : t.value;
      if (t.dataset.k === 'pct' || t.dataset.k === 'amount') { r.basis = t.dataset.k === 'pct' ? 'percent' : 'amount'; syncRow(r); }
    } else return;
    pl.dirty = true; refresh();
  }
  function onChange(e) {
    if (!mine()) return;
    const t = e.target;
    /* CR-10 §4.8 — a range picker applied: both ends at once */
    if (t.dataset && t.dataset.range === 'period') { pl.period = { start: t.dataset.from, end: t.dataset.to }; pl.touched.add('period'); pl.countErr = null; if (autoSplit()) { splitIntoPeriod(true); sortRows(); } pl.dirty = true; render(); return; }
    if (t.dataset && t.dataset.range === 'row') {
      const r = pl.rows[+t.closest('[data-row]').dataset.row]; r.start_date = t.dataset.from; r.end_date = t.dataset.to;
      pl.touched.add(t.dataset.key); pl.touched.add(t.dataset.key2); if (pl.countErr && pl.countErr.field === 'count') pl.countErr = null;
      pl.dirty = true; if (sortRows()) pl.moved = r.key; render(); return;
    }
    if (t.dataset.key) pl.touched.add(t.dataset.key);
    /* a count out of 1–12 stays in the box (marked) · a Phase with posts that cannot go puts the count back */
    if (t.id === 'pl_count') { const typed = t.value, ok = setCount(typed); render(); if (!ok && R.checkPhaseCount(typed)) $('pl_count').value = typed; return; }
    if (t.dataset.pp) { pl.period[t.dataset.pp] = t.value === 'invalid' ? '' : t.value; pl.countErr = null; if (autoSplit()) { splitIntoPeriod(true); sortRows(); } pl.dirty = true; render(); return; }
    if (pl.countErr && pl.countErr.field === 'count' && t.dataset.k) pl.countErr = null;
    onInput(e);
    /* a date changed: the rows go back into date order and the one that moved lights up */
    const tr = t.closest('[data-row]');
    if (tr && (t.dataset.k === 'start_date' || t.dataset.k === 'end_date')) {
      const r = pl.rows[+tr.dataset.row];
      if (sortRows()) { pl.moved = r.key; render(); const i = pl.rows.indexOf(r), el = box().querySelector(`[data-row="${i}"] [data-k="${t.dataset.k}"]`); if (el) el.closest('.dfield').querySelector('.dtext').focus(); return; }
    }
    pl.dirty = true; refresh();
  }
  async function onClick(e) {
    if (!mine()) return;
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const m = b.closest('details'); if (m) m.open = false;
    if (b.dataset.pladjust != null) { openAdjust(b); return; }
    if (b.dataset.add != null) { pl.countErr = null; addRow(); return; }
    if (b.dataset.dup != null) {
      const r = pl.rows[+b.dataset.dup], days = okRow(r) ? R.dayDiff(r.end_date, r.start_date) : null;
      const start = okRow(r) ? R.addDays(r.end_date, 1) : '';
      const copy = { key: 'k' + (++seq), phase_id: null, label: K.copyLabel(r.label), start_date: start, end_date: start && days != null ? R.addDays(start, days) : '', amount: r.amount, pct: r.pct, basis: r.basis };
      pl.rows.splice(+b.dataset.dup + 1, 0, copy); sortRows();
      pl.dirty = true; render(); focusRow(pl.rows.indexOf(copy)); return;
    }
    if (b.dataset.del != null) {
      const r = pl.rows[+b.dataset.del]; if (r.phase_id && !R.canDeletePhase(state(), r.phase_id)) return;
      if (r.phase_id) pl.deleted.push(r.phase_id);
      pl.rows.splice(+b.dataset.del, 1); pl.countErr = null; pl.dirty = true; render(); return;
    }
    if (b.dataset.count) { setCount(pl.rows.length + Number(b.dataset.count)); render(); return; }
    if (b.dataset.splitdates != null) { pl.countErr = null; if (splitIntoPeriod(false)) pl.dirty = true; render(); return; }
    if (b.dataset.preset) { if (applyPreset(b.dataset.preset)) { pl.dirty = true; render(); } return; }
    if (b.dataset.fill != null) {
      const i = pl.focusRow != null && pl.focusRow < pl.rows.length ? pl.focusRow : pl.rows.length - 1;
      const amounts = R.fillRemainingAmount(pl.rows.map(r => r.amount), i, budget());
      Object.assign(pl.rows[i], { amount: String(amounts[i]), basis: 'amount' }); syncRow(pl.rows[i]);
      pl.dirty = true; render(); focusRow(i); return;
    }
    if (b.dataset.plsave != null) save(pl.status === 'approved' || (pl.status === 'pending' && !ownPending()) ? (asking() ? 'submit' : 'apply') : asking() ? 'submit' : 'create');
    if (b.dataset.pldraft != null) save('draft');
    if (b.dataset.plcancelreq != null) cancelMine();
  }
  /* Change returned → Cancel request: my changes on this Campaign go (it keeps what it has) */
  async function cancelMine() {
    const AP = C.approval, c = campNow(); if (!c) return;
    if (!(await confirmDialog(AP.cancelRequestTitle(c.campaign_name), AP.cancelRequestBody, AP.cancelRequest, true, C.common.keepEditing))) return;
    const s = state(), ctx = ctxOf(), evs = [];
    myChanges().filter(r => r.type === 'change').forEach(r => evs.push(...R.requestTransition(s, r.id, 'cancelled', ctx).events));
    if (!evs.length) return;
    s.campaign_events.push(...evs); pl.dirty = false; commit(C.approval.requestCancelled); U.closeModal();
    if (KT.screens.campaign.afterPlan) KT.screens.campaign.afterPlan(c.campaign_id, false);
  }
  const ctxOf = () => { let e = 0; const base = store.newCampaignEventId(); return { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }; };

  /* CR-18 §4.3 — Adjust budget from the plan: a panel in place · applied at once (a manager) → the plan takes the new budget and Phase amounts */
  function openAdjust(opener) {
    const me = pl, cid = pl.campaignId; if (!cid) return;
    KT.budget.open(cid, { opener, back: () => { if (pl === me) render(); }, onDone: rec => {
      if (pl !== me || !rec || rec.status !== 'approved') return;
      const sg = rec.type === 'decrease' ? -1 : 1, c = campNow();
      pl.camp.budget_kol = c && c.budget_kol != null ? String(c.budget_kol) : '';
      (rec.allocations || []).forEach(a => { const r = pl.rows.find(x => x.phase_id === a.phase_id); if (r) Object.assign(r, { amount: String((R.money(r.amount) || 0) + sg * a.amount), basis: 'amount' }); });
      sync(); render();
    } });
  }

  /* ===================== save: all or nothing ===================== */
  /* how: 'draft' (Save draft) · 'submit' (Submit / Resubmit / Submit changes — Staff) · 'create' (Create campaign — a manager) · 'apply' (Save changes — a manager) */
  async function save(how) {
    if (!guard('campaign.draft') || !pl) return;
    const res = validate(how === 'draft' ? 'draft' : 'submit');
    if (res.errs.length) { pl.submitted = how === 'draft' ? 'draft' : 'submit'; refresh(); return; }
    /* CR-18 §4.2 — Phase budgets short of / over the Campaign budget: asked once (Save anyway · Keep editing keeps everything) */
    const off = how !== 'draft' && res.warns.find(w => w.kind === 'over' || w.kind === 'under');
    if (off) { const t = R.planTotals(campDraft(), planRows()), what = off.kind === 'over' ? K.barOver(R.baht(-t.diff)) : K.unallocated(R.baht(t.diff));
      if (!(await confirmDialog(K.mismatchTitle, K.mismatchBody(what), K.saveAnyway, false, K.keepEditing))) return; }
    const s = state(), me = U.actor(), ctx = ctxOf(), nowIso = ctx.now, events = [], AP = C.approval, c0 = pl.camp, rows = planRows(), note = asking() ? R.trim(pl.note) : '';
    const tr = (id, to, o) => { const r = R.requestTransition(s, id, to, ctx, o); events.push(...r.events); return r; };
    const isNew = pl.mode === 'new', st = pl.status, ask = st === 'approved' && asking();
    const fields = Object.assign({ campaign_name: R.trim(c0.campaign_name), note: R.trim(c0.note) || null }, budgetLocked() ? {} : { budget_kol: R.money(c0.budget_kol) });
    const snap = list => list.map(p => ({ phase_id: p.phase_id, label: p.label || null, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol, default_pillar: p.default_pillar || null }));
    const rowRec = r => ({ label: R.trim(r.label) || null, start_date: r.start_date, end_date: r.end_date, budget_kol: num(r.budget_kol), default_pillar: r.default_pillar || null, budget_basis: r.budget_pct !== '' ? 'percent' : 'amount' });
    let c, id, direct = false, round = 0;
    if (isNew) {
      c = R.stampDraft(Object.assign({ campaign_id: R.campaignIdFor(fields.campaign_name, s.campaigns), cta: null, default_payment_term: null, status_override: null, status_reason: null, status_changed_at: null }, fields), me, nowIso);
      s.campaigns.push(c);
    } else c = campNow();
    if (!c) return;
    id = c.campaign_id;
    const before = snap(s.phases.filter(p => p.campaign_id === id)), productsBefore = R.campaignProductCodes(s, id);
    if (ask) {
      /* CR-21 §3.7 — Staff on an approved Campaign: one request (the Campaign keeps what it has until it is approved) — a change of the Campaign
         (name · note · products · a budget it never had), of each approved Phase (label · period · budget · default pillar · removal) · new Phases */
      const curProducts = R.campaignProductCodes(s, id);
      const norm = v => JSON.stringify(Array.isArray(v) ? v.slice().sort() : v === '' || v == null ? null : v);
      const askOf = (rec, want, keys, cur = {}) => Object.fromEntries(keys.filter(k => want[k] !== undefined && norm(k in cur ? cur[k] : rec[k]) !== norm(want[k])).map(k => [k, want[k]]));
      const putAsk = (rec, key, want) => {
        const rid = R.requestIdOf('change', key), pc = rec.pending_change;
        if (pc && pc.status === 'pending') tr(rid, 'draft', { withdraw: true });
        if (!Object.keys(want).length) { if (rec.pending_change) tr(rid, 'cancelled'); return; }
        if (!rec.pending_change) rec.pending_change = { status: 'draft', fields: {}, requested_by: me.user_id, requested_at: nowIso, submit_round: 0, returned_reason: null, returned_by: null, returned_at: null, last_submitted: null };
        Object.assign(rec.pending_change, { fields: want, requested_by: me.user_id, requested_at: nowIso }, note ? { note } : {});
        tr(rid, how === 'draft' ? 'draft' : 'pending', { note });
      };
      putAsk(c, id, askOf(c, Object.assign({}, fields, { products: c0.products.slice() }), R.KEY_CAMPAIGN_PLAN, { products: curProducts }));
      pl.deleted.forEach(pid => { const p = s.phases.find(x => x.phase_id === pid); if (!p) return;
        if (R.isApproved(p)) putAsk(p, pid, { delete: true });
        else { if (p.approval_status === 'pending') tr(R.requestIdOf('phase', pid), 'draft', { withdraw: true }); tr(R.requestIdOf('phase', pid), 'deleted'); } });
      rows.forEach(r => {
        const want = rowRec(r), p = r.phase_id && s.phases.find(x => x.phase_id === r.phase_id);
        if (p && R.isApproved(p)) { putAsk(p, p.phase_id, askOf(p, want, ['label', 'start_date', 'end_date', 'budget_kol', 'default_pillar'])); if (!p.pending_change) p.budget_basis = want.budget_basis; return; }
        let np = p;
        if (np) { if (np.approval_status === 'pending') tr(R.requestIdOf('phase', np.phase_id), 'draft', { withdraw: true }); Object.assign(np, want); }
        else { np = R.stampDraft(Object.assign({ phase_id: R.phaseIdFor(id, s.phases), campaign_id: id }, want), me, nowIso); s.phases.push(np); }
        tr(R.requestIdOf('phase', np.phase_id), how === 'draft' ? 'draft' : 'pending', { note });
      });
    } else {
      /* a new / draft Campaign, your own pending one, or a manager's edit: the records take it now */
      if (ownPending()) tr(R.requestIdOf('campaign', id), 'draft', { withdraw: true });
      Object.assign(c, fields);
      const gone = new Set(pl.deleted);
      s.phases = s.phases.filter(p => !gone.has(p.phase_id));
      s.deal_posts.forEach(p => { if (gone.has(p.phase_override)) p.phase_override = null; });
      const newPhases = [];
      rows.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).forEach(r => {
        const rec = Object.assign({ campaign_id: id }, rowRec(r)), p = r.phase_id && s.phases.find(x => x.phase_id === r.phase_id);
        if (p) Object.assign(p, rec);
        else { const np = Object.assign({ phase_id: R.phaseIdFor(id, s.phases) }, rec); R.stampDraft(np, me, nowIso); if (R.isApproved(c)) newPhases.push(np); else np.approval_status = c.approval_status; s.phases.push(np); }
      });
      R.setCampaignProducts(s, id, c0.products);
      /* a manager's new Phases of an approved Campaign are there at once */
      newPhases.forEach(np => tr(R.requestIdOf('phase', np.phase_id), 'approved', { direct: true }));
      if (R.isDraft(c) || isNew) {
        const to = how === 'draft' ? 'draft' : how === 'create' || !asking() ? 'approved' : 'pending';
        direct = to === 'approved';
        tr(R.requestIdOf('campaign', id), to, { direct, note });
      }
      events.push({ event_id: ctx.eventId(), campaign_id: id, type: 'phase_plan', from: { phases: before, products: productsBefore },
        to: { campaign: fields, phases: snap(s.phases.filter(p => p.campaign_id === id)), products: c0.products.slice() }, changed_at: nowIso, changed_by: userId(), note: null });
    }
    s.campaign_events.push(...events);
    /* CR-18 §3 — the first budget of a Campaign that is not approved yet follows it · CR-19: an approved one that had none */
    if (!R.isApproved(c) || !(s.campaign_budget_changes || []).some(x => x.campaign_id === id)) R.syncInitial(s, id, userId(), nowIso);
    round = (s.campaigns.find(x => x.campaign_id === id) || {}).submit_round || 1;
    pl.dirty = false;
    const name = c.campaign_name;
    const msg = how === 'draft' ? AP.draftSaved(name) : ask ? AP.changeSent : how === 'submit' ? AP.sentRound(name, round) : isNew || direct ? null : AP.changesSaved(name);
    if (msg) commit(msg); else commit();
    U.closeModal();
    if (KT.screens.campaign.afterPlan) KT.screens.campaign.afterPlan(id, isNew);
    if ((isNew || direct) && how === 'create') toastAction(C.common.created(K.campaignThing), C.common.open, () => { if (KT.screens.campaign.openCampaign) KT.screens.campaign.openCampaign(id); }, 8000);
  }

  return { open, isOpen, reopen };
})();
