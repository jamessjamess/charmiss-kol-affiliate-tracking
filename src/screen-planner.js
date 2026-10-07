/* screen-planner.js — Phase Planner (CR-05 §4.4 · CR-11 §4.5: the create modal L — Campaign on the left, Phases on the right): the Campaign fields,
   an editable Phase table (% | ฿ for the whole table), the budget bar, a timeline preview and, when editing, what happens
   to the posts. Everything is saved together (an error anywhere saves nothing). Opened from Campaign & Phase. → KT.planner
   CR-06: a Phase is "Phase {n}" by its start date (+ an optional Label) · the Campaign's products (a new Campaign needs one) ·
   Campaign period + Number of phases + Split dates evenly · allocation presets Even / Launch-heavy / Custom · rows stay in date order */
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
    if (!guard('campaign.edit')) return;
    if (U.modalOpen()) U.closeModal();
    const s = state(), c = o.campaignId ? s.campaigns.find(x => x.campaign_id === o.campaignId) : null;
    const t = R.pillarTargetOf(s, c ? c.campaign_id : null);
    const phases = c ? R.sortPhases(s.phases.filter(p => p.campaign_id === c.campaign_id)) : [];
    pl = {
      mode: c ? 'edit' : 'new', campaignId: c ? c.campaign_id : null,
      camp: { campaign_name: c ? c.campaign_name : '', cta: c ? c.cta || '' : '', budget_kol: c && c.budget_kol != null ? String(c.budget_kol) : '',
        default_payment_term: c && R.isTerm(c.default_payment_term) ? c.default_payment_term : '',   // CR-11 §4.11
        ownTarget: !!(c && c.pillar_target), target: Object.fromEntries(R.PILLARS.map(p => [R.PILLAR_KEY[p], String(t[R.PILLAR_KEY[p]])])),
        products: c ? R.campaignProductCodes(s, c.campaign_id) : [] },
      rows: phases.map(p => ({ key: 'k' + (++seq), phase_id: p.phase_id, label: p.label || '', start_date: p.start_date || '', end_date: p.end_date || '', amount: p.budget_kol == null ? '' : String(p.budget_kol), pct: '', default_pillar: p.default_pillar || '' })),
      unit: c && !num(c.budget_kol) ? 'amount' : 'pct', deleted: [], touched: new Set(), submitted: false, dirty: false, focusRow: null,
      /* the period only helps plan (not saved): an existing Campaign starts with its Phases' dates; typing it makes the count re-split the dates */
      period: { start: phases.map(p => p.start_date).filter(Boolean).sort()[0] || '', end: phases.map(p => p.end_date).filter(Boolean).sort().pop() || '' },
      preset: 'custom', countErr: null, moved: null,
    };
    if (!pl.rows.length || o.addRow) addRow(false);
    fromAmounts();
    const me = pl, fi = o.focusPhase ? pl.rows.findIndex(r => r.phase_id === o.focusPhase) : -1, last = pl.rows.length - 1;
    /* the first thing to fill: a new Campaign's name · New phase: the new row's period (its picker opens on the day after the last Phase) · a Phase: its row */
    const focusSel = me.mode === 'new' && !o.addRow ? '[data-c="campaign_name"]' : o.addRow ? `[data-row="${last}"] .drange-t` : fi >= 0 ? `[data-row="${fi}"] [data-k="label"]` : null;
    me.m = U.createModal({ size: 'L', title: c ? K.title(c.campaign_name) : K.newTitle, sub: K.sub, opener: o.opener, focus: () => focusSel,
      isDirty: () => !!me.dirty, onClick, redraw: () => { if (pl === me) render(); },
      onClose: () => { if (pl === me) pl = null; if (U.currentTab() === 'campaign') setHash('campaign'); } });
    box().addEventListener('input', onInput); box().addEventListener('change', onChange);
    box().addEventListener('focusin', e => { const r = e.target.closest('[data-row]'); if (r && pl) pl.focusRow = +r.dataset.row; });
    render();
    if (o.addRow && pl.mode === 'edit') setTimeout(() => { const r = pl && pl.rows[last], el = r && box() && box().querySelector(`[data-row="${last}"] .drange`); if (el && r.start_date) U.openRange(el, { from: r.start_date, to: '' }); }, 40);
  }
  const isOpen = () => !!pl;
  function reopen() { if (pl) render(); }
  function focusRow(i) {
    const el = i < 0 ? box().querySelector('[data-c="campaign_name"]') : box().querySelector(`[data-row="${i}"] [data-k="label"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  }
  /* % ↔ ฿: the column typed in leads, the other is worked out from the Campaign budget */
  const budget = () => num(pl.camp.budget_kol);
  /* a % worked out from ฿ keeps its exact value (pctExact) so going back to ฿ gives the same amount (91.67% of ฿600,000 stays ฿550,000) */
  function fromAmounts() { const b = budget(); pl.rows.forEach(r => { const p = R.isBlank(r.amount) || !b ? null : R.pctOfBudget(r.amount, b); r.pct = p == null ? '' : String(round2(p)); r.pctExact = p; }); }
  const pctOf = r => (r.pctExact != null && String(round2(r.pctExact)) === String(r.pct) ? r.pctExact : r.pct);
  function fromPcts() { const b = budget(); pl.rows.forEach(r => { r.amount = R.isBlank(r.pct) || b == null ? '' : String(R.budgetFromPct(pctOf(r), b)); }); }
  /* the Campaign budget changed: a preset is laid out again, otherwise the leading column stays and the other follows */
  function sync() { if (pl.preset !== 'custom' && applyPreset(pl.preset)) return; if (pl.unit === 'pct') fromPcts(); else fromAmounts(); }
  /* one row typed in: only that row follows */
  function syncRow(r) {
    const b = budget();
    if (pl.unit === 'pct') { r.pctExact = null; r.amount = R.isBlank(r.pct) || b == null ? '' : String(R.budgetFromPct(r.pct, b)); }
    else { const p = R.isBlank(r.amount) || !b ? null : R.pctOfBudget(r.amount, b); r.pct = p == null ? '' : String(round2(p)); r.pctExact = p; }
  }
  /* Even / Launch-heavy: % and ฿ of every row at once (฿ in whole baht, the last row takes the rest) */
  function applyPreset(key) {
    const x = R.presetSplit(key, pl.rows.length, pl.camp.budget_kol); if (!x) return false;
    pl.unit = 'pct'; pl.preset = key;
    pl.rows.forEach((r, i) => { r.pct = String(x.pcts[i]); r.pctExact = null; r.amount = x.amounts ? String(x.amounts[i]) : ''; });
    return true;
  }
  /* rows in Phase order (start, end, then the order they were added) — "Phase n" = the row's place */
  function sortRows() {
    const before = pl.rows.slice(), seqs = R.planSeqs(planRows());
    pl.rows = before.map((r, i) => ({ r, s: seqs[i] })).sort((a, b) => a.s - b.s).map(x => x.r);
    return pl.rows.some((r, i) => r !== before[i]);
  }
  /* a new Campaign with a period: the dates follow the period and the count by themselves (an existing one uses Split dates evenly) */
  const autoSplit = () => pl.mode === 'new' && periodOk();
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
    if (pl.preset === 'launch' && pl.rows.length !== 3) pl.preset = 'custom';
    if (pl.preset !== 'custom') applyPreset(pl.preset);   // new rows start empty; the others keep what they had
    pl.dirty = true;
    return true;
  }
  function addRow(rerender = true) {
    const last = pl.rows[pl.rows.length - 1];
    pl.rows.push({ key: 'k' + (++seq), phase_id: null, label: '', start_date: last && R.isISODate(last.end_date) ? R.addDays(last.end_date, 1) : '', end_date: '', amount: '', pct: '' });
    pl.dirty = true;
    /* CR-10 §4.8: + Add phase opens the new row's picker on the day after the last Phase, waiting for the end */
    if (rerender) { render(); const r = pl.rows[pl.rows.length - 1], el = box().querySelector(`[data-row="${pl.rows.length - 1}"] .drange`); if (el && r.start_date) U.openRange(el, { from: r.start_date, to: '' }); else focusRow(pl.rows.length - 1); }
  }
  const planRows = () => pl.rows.map(r => ({ key: r.key, phase_id: r.phase_id, label: r.label, start_date: r.start_date, end_date: r.end_date, budget_kol: r.amount, budget_pct: pl.unit === 'pct' ? r.pct : '', default_pillar: r.default_pillar || '' }));
  const campDraft = () => ({ campaign_id: pl.campaignId, campaign_name: pl.camp.campaign_name, budget_kol: pl.camp.budget_kol });
  function validate() {
    const res = R.validatePhasePlan(state(), campDraft(), planRows(), pl.deleted, { pctUsed: pl.unit === 'pct' && pl.rows.some(r => !R.isBlank(r.pct)) });
    if (pl.camp.ownTarget) res.errs.push(...R.validatePillarTarget(pl.camp.target).errs);
    const pr = R.checkCampaignProducts(state(), pl.campaignId, pl.camp.products);
    res.errs.push(...pr.errs); res.warns.push(...pr.warns);
    if (pl.countErr) res.errs.unshift(pl.countErr);
    return res;
  }
  /* "Phase n" of each row by its start date (CR-06 §4.2) */
  const rowNames = () => { const seqs = R.planSeqs(planRows()); return pl.rows.map((r, i) => R.phaseTitle(seqs[i], '')); };
  const rowTitle = (r, i) => { const seqs = R.planSeqs(planRows()); return R.phaseTitle(seqs[i], r.label); };

  /* ===================== draw ===================== */
  const sec = (title, body, extra, id) => `<section class="sec"${id ? ` id="${id}"` : ''}><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;
  function rowHTML(r, i) {
    const s = state(), canDel = !r.phase_id || R.canDeletePhase(s, r.phase_id), inp = pl.unit === 'pct' ? 'pct' : 'amount';
    return `<tr data-row="${i}"${r.key === pl.moved ? ' class="moved"' : ''}><td class="pl-seq" data-seqname>${esc(rowNames()[i])}</td>
      <td><input data-k="label" data-key="row${i}_label" value="${esc(r.label)}" placeholder="${esc(K.labelPh)}" aria-label="${esc(K.colLabel)}" autocomplete="off"></td>
      <td class="pl-per">${U.rangeHTML(`data-range="row" data-key="row${i}_start" data-key2="row${i}_end"`, R.isISODate(r.start_date) ? r.start_date : '', R.isISODate(r.end_date) ? r.end_date : '', { label: `${rowNames()[i]} · ${K.colPeriod}` })}</td>
      <td class="num" data-days></td>
      <td><input type="number" min="0" step="${inp === 'pct' ? '0.01' : '1'}" inputmode="decimal" data-k="${inp}" data-key="row${i}_budget" value="${esc(r[inp])}" aria-label="${esc(inp === 'pct' ? K.colBudgetPct : K.colBudgetAmt)}"></td>
      <td class="num" data-other></td>
      <td><select data-k="default_pillar" data-key="row${i}_pillar" aria-label="${esc(`${rowNames()[i]} · ${C.fill.defaultPillar}`)}">${optionsHTML(activeList('pillar_list', r.default_pillar || null), r.default_pillar || '', C.fill.none)}</select></td>
      <td><details class="menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}" title="${esc(C.app.more)}">⋯</summary><div class="menu-list right">
        <button type="button" class="mi" data-dup="${i}">${esc(K.dup)}</button>
        <button type="button" class="mi danger" data-del="${i}"${canDel ? '' : ` disabled aria-disabled="true" title="${esc(K.hasPosts)}"`}>${esc(K.del)}${canDel ? '' : ` <span class="muted small">· ${esc(K.hasPosts)}</span>`}</button></div></details></td></tr>`;
  }
  function html() {
    const c = pl.camp, isNew = pl.mode === 'new', pct = pl.unit === 'pct';
    const campaign = `<div class="fields">
        ${field('campaign_name', CK.fName, `<input id="f_campaign_name" data-c="campaign_name" data-key="campaign_name" value="${esc(c.campaign_name)}" placeholder="${esc(CK.namePh)}" autocomplete="off">`, { req: 1, wide: 1 })}
        ${field('cta', CK.fCta, `<select id="f_cta" data-c="cta">${optionsHTML(activeList('cta_list', c.cta), c.cta || '', C.common.none)}</select>`)}
        ${field('default_payment_term', C.fill.defaultTerm, `<select id="f_default_payment_term" data-c="default_payment_term">${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), c.default_payment_term || '', C.fill.none)}</select>`, { hint: esc(C.fill.defaultTermHint) })}
        ${field('budget_kol', CK.fCampaignBudget, `<input type="number" min="0" step="1" inputmode="numeric" id="f_budget_kol" data-c="budget_kol" data-key="budget_kol" value="${esc(c.budget_kol)}">`)}
        ${field('products', K.fProducts, U.productPickerHTML('pl_products', c.products, code => (pl.campaignId ? R.productDealsInCampaign(state(), pl.campaignId, code).length : 0)), { req: isNew, wide: 1, hint: esc(K.productsHint) })}
        <div class="field wide"><label class="tick"><input type="checkbox" data-owntarget${c.ownTarget ? ' checked' : ''}> ${esc(CK.ownTarget)}</label>
          <div class="fields three" style="margin-top:6px">${R.PILLARS.map(p => `<div class="field"><label>${esc(p)} (%)</label><input type="number" min="0" max="100" step="1" inputmode="numeric" data-ptc="${R.PILLAR_KEY[p]}" value="${esc(c.target[R.PILLAR_KEY[p]])}"${c.ownTarget ? '' : ' disabled'}></div>`).join('')}</div></div>
      </div>`;
    const n = pl.rows.length, presets = [['even', K.presetEven]].concat(n === 3 ? [['launch', K.presetLaunch]] : []).concat([['custom', K.presetCustom]]);
    const plan = `<div class="pl-plan">
        <div class="field"><label>${esc(K.period)}</label><div class="pl-period">${U.rangeHTML('data-range="period" data-key="period"', pl.period.start, pl.period.end, { label: K.period, clearable: true })}</div><div class="hint">${esc(K.periodHint)}</div></div>
        <div class="field"><label for="pl_count">${esc(K.count)}</label><span class="stepper-n pl-count"><button type="button" class="icon-btn" data-count="-1" aria-label="${esc(K.fewer)}"${n <= 1 ? ' disabled' : ''}>−</button>` +
          `<input type="number" id="pl_count" min="1" max="${R.MAX_PHASES}" step="1" inputmode="numeric" data-key="count" value="${n}"><button type="button" class="icon-btn" data-count="1" aria-label="${esc(K.more)}"${n >= R.MAX_PHASES ? ' disabled' : ''}>+</button></span></div>
        <div class="field"><label>&nbsp;</label><button type="button" class="btn small" data-splitdates title="${esc(K.splitDatesTip)}">${esc(K.splitDates)}</button></div>
      </div>
      <div class="btns pl-tools"><span class="muted small">${esc(K.allocation)}</span><div class="seg" role="group" aria-label="${esc(K.allocation)}">${presets.map(([k, l]) => `<button type="button" data-preset="${k}" class="${pl.preset === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` +
        `<div class="seg" role="group" aria-label="${esc(K.unit)}"><button type="button" data-unit="pct" class="${pct ? 'on' : ''}">%</button><button type="button" data-unit="amount" class="${pct ? '' : 'on'}">฿</button></div>` +
        `<button type="button" class="btn small" data-fill title="${esc(K.fillTip)}">${esc(K.fill)}</button></div>`;
    const table = plan + `<div class="tablewrap"><table class="tbl pl-tbl"><thead><tr><th>${esc(K.colName)}</th><th>${esc(K.colLabel)}</th><th>${esc(K.colPeriod)}</th><th class="num">${esc(K.colDays)}</th>` +
      `<th>${esc(pct ? K.colBudgetPct : K.colBudgetAmt)}</th><th class="num">${esc(pct ? K.colAmount : K.colPct)}</th><th title="${esc(C.fill.defaultPillarHint)}">${esc(C.fill.defaultPillar)}</th><th></th></tr></thead><tbody>${pl.rows.map(rowHTML).join('')}</tbody></table></div>` +
      `<div class="btns" style="margin-top:8px"><button type="button" class="btn small" data-add>${esc(K.add)}</button></div><div class="pl-bar" id="pl_bar"></div>`;
    return { body: `<div class="pl-grid"><div class="pl-l">${sec(K.secCampaign, campaign)}</div><div class="pl-r">${sec(K.secPhases, table)}${sec(K.secTimeline, `<div id="pl_tl"></div>`)}` +
        `${isNew ? '' : sec(K.secImpact, `<div id="pl_impact"></div>`, '', 'pl_impactSec')}</div></div>`,
      left: `<div class="checks" id="pl_checks"></div>`,
      buttons: `<button type="button" class="btn" data-cmclose>${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-plsave>${esc(isNew ? K.createCampaign : K.savePhases)}</button>` };
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
    const marks = () => { const order = sortedKeys(); return pl.rows.map((r, i) => (okRow(r) ? { key: r.key, from: r.start_date, to: r.end_date, color: `var(--ph${(order.indexOf(r.key) % 8) + 1})`, title: rowTitle(r, i) } : null)).filter(Boolean); };
    const band = () => (R.isISODate(pl.period.start) && R.isISODate(pl.period.end) ? { from: pl.period.start, to: pl.period.end } : null);
    b.querySelectorAll('.drange[data-range="row"]').forEach(el => { const key = pl.rows[+el.closest('[data-row]').dataset.row].key; el._rangeOpts = () => ({ band: band(), marks: marks().filter(m => m.key !== key) }); });
    const pe = b.querySelector('.drange[data-range="period"]'); if (pe) pe._rangeOpts = () => ({ marks: marks() });
    refresh();
  }

  /* ===================== live parts (typing never loses focus) ===================== */
  function refresh() {
    if (!mine() || !$('pl_checks')) return;   // a panel in place (New product) is showing
    const b = box(), res = validate(), show = f => pl.submitted || pl.touched.has(f), names = rowNames();
    pl.rows.forEach((r, i) => {
      const tr = b.querySelector(`[data-row="${i}"]`); if (!tr) return;
      tr.querySelector('[data-seqname]').textContent = names[i];
      const ok = R.isISODate(r.start_date) && R.isISODate(r.end_date) && r.end_date >= r.start_date;
      tr.querySelector('[data-days]').textContent = ok ? R.fmtNum(R.dayDiff(r.end_date, r.start_date) + 1) : '—';
      tr.querySelector('[data-other]').textContent = pl.unit === 'pct' ? (R.isBlank(r.amount) ? '—' : R.baht(Number(r.amount))) : (R.isBlank(r.pct) ? '—' : `${round2(Number(r.pct))}%`);
    });
    const shown = Object.assign({}, res, { errs: res.errs.filter(e => show(e.field) || e.field === 'rows' || e === pl.countErr), warns: res.warns.filter(w => w.field !== 'products' || show('products')) });
    $('pl_checks').innerHTML = checksHTML(shown, res.errs.length ? '' : C.common.ok);
    b.querySelectorAll('[data-key]').forEach(el => {
      const keys = [el.dataset.key, el.dataset.key2].filter(Boolean), bad = keys.some(k => show(k) && res.errs.some(e => e.field === k)), w = el.closest('.dfield') || el;
      w.classList.toggle('invalid', bad); el.classList.toggle('invalid', bad);
    });
    b.querySelector('[data-plsave]').disabled = pl.submitted && res.errs.length > 0;
    $('pl_bar').innerHTML = barHTML();
    $('pl_tl').innerHTML = timelineHTML();
    if ($('pl_impact')) impact();
    return res;
  }
  /* the budget bar: one square bar split by Phase colour against the Campaign budget, the part over it in red */
  function barHTML() {
    const t = R.planTotals(campDraft(), planRows()), scale = Math.max(t.budget || 0, t.allocated) || 1;
    const order = sortedKeys(), seg = pl.rows.map((r, i) => ({ r, i, v: num(r.amount) || 0 })).filter(x => x.v > 0);
    const segs = seg.map(x => `<span style="width:${x.v / scale * 100}%;background:var(--ph${(order.indexOf(x.r.key) % 8) + 1})" title="${esc(`${rowTitle(x.r, x.i)} · ${R.baht(x.v)}`)}"></span>`).join('');
    const over = t.budget != null && t.diff < 0, mark = t.budget != null ? `<i class="pl-cap" style="left:${t.budget / scale * 100}%"></i>` : '';
    const overlay = over ? `<b class="pl-over" style="left:${t.budget / scale * 100}%;width:${-t.diff / scale * 100}%"></b>` : '';
    const text = t.budget == null ? `<span class="muted">${esc(K.allocatedNoBudget(R.baht(t.allocated)))}</span>`
      : `<span>${esc(K.allocated(R.baht(t.allocated), R.baht(t.budget), Math.round(t.pct)))}</span>` +
        (over ? ` · <b class="late">${esc(K.overBy(R.baht(-t.diff)))}</b>` : t.diff > 0 ? ` · <span class="muted">${esc(K.unallocated(R.baht(t.diff)))}</span>` : '');
    return `<div class="pl-track">${segs}${overlay}${mark}</div><div class="pl-text">${text}</div>`;
  }
  const okRow = r => R.isISODate(r.start_date) && R.isISODate(r.end_date) && r.start_date <= r.end_date;
  const sortedKeys = () => pl.rows.filter(okRow).slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0)).map(r => r.key).concat(pl.rows.filter(r => !okRow(r)).map(r => r.key));
  /* timeline preview: month ticks · one lane with every Phase (overlaps hatched, gaps dashed) · a row per Phase */
  function timelineHTML() {
    const rows = pl.rows.filter(okRow); if (!rows.length) return `<div class="hint">${esc(K.noDates)}</div>`;
    const from = rows.map(r => r.start_date).sort()[0], to = rows.map(r => r.end_date).sort().pop(), span = R.dayDiff(to, from) + 1;
    const x = iso => R.dayDiff(iso, from) / span * 100, w = (a, b) => (R.dayDiff(b, a) + 1) / span * 100, order = sortedKeys();
    const color = r => `var(--ph${(order.indexOf(r.key) % 8) + 1})`;
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
    if (t.dataset.c) { pl.camp[t.dataset.c] = t.value; if (t.dataset.c === 'budget_kol') sync(); }
    else if (t.dataset.ptc) pl.camp.target[t.dataset.ptc] = t.value;
    else if (t.dataset.pp) { pl.period[t.dataset.pp] = t.value === 'invalid' ? '' : t.value; }
    else if (t.id === 'pl_count') return;
    else if (tr && t.dataset.k) {
      const r = pl.rows[+tr.dataset.row];
      r[t.dataset.k] = t.value === 'invalid' ? 'invalid' : t.value;
      if (t.dataset.k === 'pct' || t.dataset.k === 'amount') { pl.preset = 'custom'; syncRow(r); box().querySelectorAll('[data-preset]').forEach(x => x.classList.toggle('on', x.dataset.preset === 'custom')); }
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
    if (t.dataset.owntarget != null) { pl.camp.ownTarget = t.checked; box().querySelectorAll('[data-ptc]').forEach(i => { i.disabled = !t.checked; }); }
    if (t.dataset.c === 'cta') pl.camp.cta = t.value;
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
    if (b.dataset.unit) { if (pl.unit !== b.dataset.unit) { pl.unit = b.dataset.unit; sync(); render(); } return; }
    if (b.dataset.add != null) { pl.countErr = null; addRow(); return; }
    if (b.dataset.dup != null) {
      const r = pl.rows[+b.dataset.dup], days = okRow(r) ? R.dayDiff(r.end_date, r.start_date) : null;
      const start = okRow(r) ? R.addDays(r.end_date, 1) : '';
      const copy = { key: 'k' + (++seq), phase_id: null, label: K.copyLabel(r.label), start_date: start, end_date: start && days != null ? R.addDays(start, days) : '', amount: r.amount, pct: r.pct };
      pl.rows.splice(+b.dataset.dup + 1, 0, copy); sortRows(); pl.preset = 'custom';
      pl.dirty = true; render(); focusRow(pl.rows.indexOf(copy)); return;
    }
    if (b.dataset.del != null) {
      const r = pl.rows[+b.dataset.del]; if (r.phase_id && !R.canDeletePhase(state(), r.phase_id)) return;
      if (r.phase_id) pl.deleted.push(r.phase_id);
      pl.rows.splice(+b.dataset.del, 1); pl.countErr = null; pl.dirty = true; render(); return;
    }
    if (b.dataset.count) { setCount(pl.rows.length + Number(b.dataset.count)); render(); return; }
    if (b.dataset.splitdates != null) { pl.countErr = null; if (splitIntoPeriod(false)) pl.dirty = true; render(); return; }
    if (b.dataset.preset) {
      if (b.dataset.preset === 'custom') pl.preset = 'custom'; else applyPreset(b.dataset.preset);
      pl.dirty = true; render(); return;
    }
    if (b.dataset.fill != null) {
      pl.preset = 'custom';
      if (pl.unit !== 'pct') { pl.unit = 'pct'; fromAmounts(); }
      const i = pl.focusRow != null && pl.focusRow < pl.rows.length ? pl.focusRow : pl.rows.length - 1;
      R.fillRemaining(pl.rows.map(r => r.pct), i).forEach((v, j) => { pl.rows[j].pct = String(v); });
      fromPcts(); pl.dirty = true; render(); focusRow(i); return;
    }
    if (b.dataset.plsave != null) save();
  }

  /* ===================== save: all or nothing ===================== */
  async function save() {
    if (!guard('campaign.edit')) return;
    const res = validate();
    if (res.errs.length) { pl.submitted = true; refresh(); return; }
    const over = res.warns.find(w => w.kind === 'over');
    if (over && !(await confirmDialog(K.saveAnywayTitle, over.msg, K.saveAnyway))) return;
    const s = state(), now = new Date(), c0 = pl.camp, rows = planRows();
    const target = c0.ownTarget ? Object.fromEntries(Object.entries(c0.target).map(([k, v]) => [k, Number(v)])) : null;
    const fields = { campaign_name: R.trim(c0.campaign_name), cta: c0.cta || null, budget_kol: num(c0.budget_kol), pillar_target: target, default_payment_term: R.isTerm(c0.default_payment_term) ? c0.default_payment_term : null };
    let c, oldCta = null;
    if (pl.mode === 'new') {
      c = Object.assign({ campaign_id: R.campaignIdFor(fields.campaign_name, s.campaigns), note: null, status_override: null, status_reason: null, status_changed_at: null }, fields);
      s.campaigns.push(c);
    } else { c = s.campaigns.find(x => x.campaign_id === pl.campaignId); oldCta = c.cta || null; Object.assign(c, fields); }
    const snap = list => list.map(p => ({ phase_id: p.phase_id, label: p.label || null, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol, default_pillar: p.default_pillar || null }));
    const before = snap(s.phases.filter(p => p.campaign_id === c.campaign_id)), productsBefore = R.campaignProductCodes(s, c.campaign_id);
    const gone = new Set(pl.deleted);
    s.phases = s.phases.filter(p => !gone.has(p.phase_id));
    s.deal_posts.forEach(p => { if (gone.has(p.phase_override)) p.phase_override = null; });
    rows.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).forEach(r => {
      const rec = { campaign_id: c.campaign_id, label: R.trim(r.label) || null, start_date: r.start_date, end_date: r.end_date, budget_kol: num(r.budget_kol), default_pillar: r.default_pillar || null };
      const p = r.phase_id && s.phases.find(x => x.phase_id === r.phase_id);
      if (p) Object.assign(p, rec); else s.phases.push(Object.assign({ phase_id: R.phaseIdFor(c.campaign_id, s.phases) }, rec));
    });
    R.setCampaignProducts(s, c.campaign_id, c0.products);
    s.campaign_events.push({ event_id: store.newCampaignEventId(), campaign_id: c.campaign_id, type: 'phase_plan', from: { phases: before, products: productsBefore },
      to: { campaign: fields, phases: snap(s.phases.filter(p => p.campaign_id === c.campaign_id)), products: c0.products.slice() }, changed_at: now.toISOString(), changed_by: userId(), note: null });
    /* the CTA changed: offer it to the open deals that still use the old one (CR-04 §4.7) */
    if (pl.mode === 'edit' && oldCta !== fields.cta) {
      const same = R.dealsWithCta(s, c.campaign_id, oldCta);
      if (same.length && await confirmDialog(CK.ctaApplyTitle(same.length), CK.ctaApplyBody(oldCta || C.common.none, fields.cta || C.common.none, same.length), CK.ctaApplyOk)) {
        const r = R.fieldChanges(same, 'cta', fields.cta, { eventId: store.newEventId(), now, user: userId(), note: CK.ctaNote });
        const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
        r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
      }
    }
    const id = c.campaign_id, isNew = pl.mode === 'new';
    pl.dirty = false;
    /* CR-11 §4.2 — a new Campaign: "Campaign created · Open" · Plan phases: saved, back to the drawer it came from */
    if (isNew) commit(); else commit(K.saved(c.campaign_name));
    U.closeModal();
    if (KT.screens.campaign.afterPlan) KT.screens.campaign.afterPlan(id, isNew);
    if (isNew) toastAction(C.common.created(K.campaignThing), C.common.open, () => { if (KT.screens.campaign.openCampaign) KT.screens.campaign.openCampaign(id); }, 8000);
  }

  return { open, isOpen, reopen };
})();
