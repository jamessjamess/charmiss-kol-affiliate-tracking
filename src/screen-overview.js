/* screen-overview.js — Dashboard (CR-05 §4.6), three tabs (#dashboard/all · /campaign · /ops, the last one remembered):
   All campaigns — date presets This year · This quarter · This month · Last month · Custom (CR-07 §4.1) · 5 KPI cards · Activity by campaign | KOL tier mix ·
                   Campaign portfolio with Days left · a download on each table / chart card and an Export of the whole tab (CR-09 §4.1–4.5)
   By campaign   — one Campaign (and Phase): summary cards · Activity by date · Phase budget · Pillar allocation (CR-19, was Allocation vs target) · Workload by PIC — one full row each (CR-07 §4.2)
   Operations    — one PIC first (CR-07 §4.3), then Campaign / Tier · queue cards · the chosen queue as a table · Active pipeline · Due in next 7 days
   CR-26 — All campaigns: 4 KPI cards (KOL & Affiliate engaged) → Budget vs Actual by month → portfolio … · By campaign: + Budget vs Actual after Phase budget ·
   Team workload (R.teamWorkload) in place of Workload by PIC
   Money is said one way everywhere: Budget → Committed → Used % → Remaining → Pending (§4.5). → KT.screens.overview */
KT.screens.overview = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, pref, info, ICON, shortNum, bahtShort, stepTitle, dateHTML, setDate, downloadCSV, openDialog, closeDialog, go, pfIcon, phaseChip, dm, optionsHTML, can, initials, toast } = U;
  const O = C.overview, MN = C.money;
  const TABS = ['all', 'campaign', 'ops'];
  const ov = {
    tab: TABS.includes(pref.get('dashtab', 'all')) ? pref.get('dashtab', 'all') : 'all',
    all: Object.assign({ measure: 'posts', view: 'chart', custom: null, statuses: null, stUser: null, tierMeasure: 'spend', tierView: 'chart', pillarMeasure: 'spend', pillarView: 'chart', platformMeasure: 'spend', platformView: 'chart', sort: null }, savedPreset()),
    camp: { campaign: '', phase: '', gran: 'day', measure: 'posts', colorBy: null, colorFor: null, view: 'chart' },
    ops: { pic: null, picFor: null, tile: '', stage: '', camps: null, campsFor: null, waiting: '', waitFor: null, folded: new Set(), foldFor: null, byKey: null, fix: null },   // CR-24
    bva: { mode: 'monthly', view: 'chart' },   // CR-26 §3.2
  };
  const td = () => today();
  /* CR-07 §4.1: the last preset is remembered (a Custom range with its dates) */
  function savedPreset() {
    try { const v = JSON.parse(pref.get('dashpreset', 'null')); if (v && (R.PRESETS.includes(v.preset) || (v.preset === 'custom' && R.isISODate(v.from) && R.isISODate(v.to)))) return { preset: v.preset, from: v.from || '', to: v.to || '' }; } catch (e) { /* default */ }
    return { preset: 'this_year', from: '', to: '' };
  }
  const savePreset = () => pref.set('dashpreset', JSON.stringify({ preset: ov.all.preset, from: ov.all.from, to: ov.all.to }));

  /* ===================== shell ===================== */
  /* keep = drawn again for a new width (the bars stay as they were); opening the tab starts By campaign on Daily (CR-09 §4.4) */
  function render(id, keep) {
    const sec = $('tab-overview');
    if (!sec.dataset.built) build(sec);
    if (TABS.includes(id)) ov.tab = id;
    if (ov.tab === 'campaign' && !keep) ov.camp.gran = 'day';
    pref.set('dashtab', ov.tab);
    U.setHash('overview/' + ov.tab);
    sec.querySelectorAll('#ov_tabs [data-tab2]').forEach(b => { const on = b.dataset.tab2 === ov.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    opsTabLabel();
    if (ov.tab === 'all') renderAll(); else if (ov.tab === 'campaign') renderCampaign(); else renderOps();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(O.title)}</h1></div>
      <div class="stabs dtabs" id="ov_tabs" role="tablist">${TABS.map(t => `<button type="button" role="tab" data-tab2="${t}">${esc(O.tabs[t])}</button>`).join('')}</div>
      <div class="toolbar" id="ov_tools"></div><div id="ov_body"></div>`;
    $('ov_tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab2]'); if (b) { ov.tab = b.dataset.tab2; render(); } });
    $('ov_tools').addEventListener('click', onToolsClick);
    $('ov_tools').addEventListener('change', onToolsChange);
    $('ov_body').addEventListener('click', onBodyClick);
    /* CR-19 §4.4 — Tab goes through the rows · Enter = a click */
    $('ov_body').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const tr = e.target.closest('tr[data-gocamp], tr[data-wqrow], tr[data-wqpic], tr[data-goteam]'); if (tr && e.target === tr) tr.click(); });
    /* CR-06 §4.9: drawn again for the content's new width (menu folded / opened, window resized) — the page stays where it was */
    document.addEventListener('kt:contentresize', () => { if (U.currentTab() !== 'overview') return; const y = window.scrollY; render(null, true); window.scrollTo(0, y); });
    sec.dataset.built = '1';
  }
  /* money cell helpers (§4.5) */
  const usedBar = (pct, w) => (pct == null ? `<span class="muted">—</span>` : `<span class="used"><span class="ub" style="width:${w || 56}px"><span class="${pct > 100 ? 'over' : ''}" style="width:${Math.min(100, pct)}%"></span></span><span class="${pct > 100 ? 'late' : ''}">${Math.round(pct)}%</span></span>`);
  const remainingText = v => (v == null ? `<span class="muted">—</span>` : v < 0 ? `<span class="late">−${R.baht(-v)}</span>` : R.baht(v));
  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const fmtV = (v, measure) => (measure === 'spend' ? bahtShort(v) : R.fmtNum(Math.round(v)));
  const binTitle = (k, gran) => (gran === 'week' ? O.weekOf(R.dmy(k), R.dmy(R.addDays(k, 6))) : R.dmy(k));

  /* ===================== Tab 1 — All campaigns ===================== */
  /* CR-14 §4.1 — Status (multi-select, instead of Include cancelled): the effective status today · default all but Cancelled · kept for each person */
  function statusesNow() {
    const uid = U.userId() || '';
    if (ov.all.stUser !== uid) { ov.all.stUser = uid; const v = R.userPrefGet(pref.get(R.DASH_STATUS_KEY, ''), uid); ov.all.statuses = R.normDashStatuses(v !== undefined ? v : R.upgradeDashStatuses(R.userPrefGet(pref.get(R.DASH_STATUS_KEY_OLD, ''), uid))); }   // CR-29
    return ov.all.statuses;
  }
  function setStatuses(v) { statusesNow(); ov.all.statuses = R.normDashStatuses(v); pref.set(R.DASH_STATUS_KEY, R.userPrefSet(pref.get(R.DASH_STATUS_KEY, ''), U.userId() || '', ov.all.statuses)); }
  /* the dot of each status = the colour of its status chip */
  const STATUS_DOT = { ongoing: 'var(--st-prog)', wrap_up: 'var(--st-wrap)', not_started: 'outline', on_hold: 'var(--warn)', complete: 'var(--st-done)', cancelled: 'var(--st-cancel)' };
  /* the words after "Status:" — on the button 3 or more read "3 selected", in a file every name */
  function statusWords(v, full) {
    const t = R.dashStatusText(v);
    return t.kind === 'default' ? O.statusAllExcept : t.kind === 'all' ? O.statusAll : t.kind === 'names' || full ? t.list.map(k => C.phaseStatus[k]).join(', ') : C.ms.nSelected(t.n);
  }
  function statusMenu(s, from, to) {
    const v = statusesNow(), n = R.statusCounts(s, from, to, td());
    return U.multiSelect({ id: 'ov_status', options: R.CAMPAIGN_STATUSES.map(k => ({ value: k, label: C.phaseStatus[k], sub: R.fmtNum(n[k] || 0), dot: STATUS_DOT[k] })),
      value: v, label: O.statusBtn(statusWords(v)), aria: O.statusL, title: O.statusTip, searchable: false, defaultValue: R.DASH_STATUS_DEFAULT, min: 1, minTip: O.statusMin,
      onChange: x => { setStatuses(x); renderAll(); } });
  }
  function allRange() { return ov.all.preset === 'custom' && ov.all.from && ov.all.to ? [ov.all.from, ov.all.to] : R.presetRange(ov.all.preset, td()); }
  function renderAll() {
    const s = state(), [from, to] = allRange(), A = ov.all;
    const presets = R.PRESETS.concat(['custom']).map(p => `<button type="button" data-preset="${p}" class="${A.preset === p ? 'on' : ''}">${esc(O.presets[p])}</button>`).join('');
    $('ov_tools').innerHTML = `<div class="seg" id="ov_preset">${presets}</div>` +
      (A.preset === 'custom' ? `<span class="fchip">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}<button type="button" data-clearcustom aria-label="${esc(C.deal.remove)}">×</button></span>` : `<span class="muted small">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}</span>`) +
      statusMenu(s, from, to) +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-export="all" title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>` +
      `<span class="hidden">${U.rangeHTML('id="ov_crange"', from, to, { label: O.presets.custom })}</span>`;   // CR-10 §4.8: Custom opens the range picker — nothing changes until Apply
    const k = R.portfolioKpis(s, from, to, td(), statusesNow());
    /* CR-13 §4.1 — top to bottom: the totals → each Campaign → when → where the money went (Pillar · Tier) */
    $('ov_body').innerHTML = `<div class="kpis k4 kc4" id="ov_kpis">${kpiCards(k)}</div>` + bvaCard('budgetactual') +   // CR-26 §3.3 · CR-29 §3.1 one card layout
      `<div class="card ov-full ov-port"><div class="card-head"><h3>${esc(O.portfolioTitle)}</h3><div class="btns ov-ctl">${dlMenu('portfolio')}</div></div><div id="ov_port"></div></div>` +
      `<div class="ov-r3">${tlCard()}</div><div class="ov-r4 r3">${pillarCard()}${tierCard()}${platformCard()}</div>`;   // CR-29 §3.4: + Platform mix (3 equal cards)
    renderBva(); renderPortfolio(); renderTl(s, from, to); renderPillar(s, from, to); renderTier(s, from, to); renderPlatform(s, from, to);
  }
  /* what the export rows of this tab are worked out from (KT.export) — the same as the screen */
  const allX = () => { const [from, to] = allRange(); return { state: state(), from, to, today: td(), statuses: statusesNow(), measure: ov.all.measure, sort: ov.all.sort, preset: ov.all.preset }; };
  const campX = () => ({ state: state(), campaignId: ov.camp.campaign, phaseId: ov.camp.phase, today: td(), gran: ov.camp.gran || 'day', measure: ov.camp.measure, colorBy: ov.camp.colorBy || 'tier' });
  const opsX = () => ({ state: state(), opts: opsOpts(), picLabel: picLabelOf(opsPicNow()), campLabel: campLabel(), waitLabel: O.wq.w[waitingNow() || 'all'], today: td() });   // CR-24
  const tabOfWidget = w => Object.keys(KT.export.TABS).find(t => KT.export.TABS[t].includes(w));
  const xOfTab = t => (t === 'campaign' ? campX() : t === 'ops' ? opsX() : allX());
  /* what a file name says about the scope: the preset · the Campaign (and Phase) · the PIC */
  function scopeOf(t) {
    const s = state();
    if (t === 'campaign') { const c = R.campaignOf(s, ov.camp.campaign) || {}; return { file: KT.export.safeName(c.campaign_name + (ov.camp.phase ? ' ' + R.phaseName(s, ov.camp.phase) : '')), text: `${c.campaign_name || ''} › ${ov.camp.phase ? R.phaseName(s, ov.camp.phase) : O.allPhases}` }; }
    if (t === 'ops') { const W = O.wq, lab = picLabelOf(opsPicNow()); return { file: KT.export.safeName(lab), text: [`${W.assigned}: ${lab}`, `${W.campaigns}: ${campLabel()}`, `${W.waiting}: ${W.w[waitingNow() || 'all']}`].join(' · ') }; }   // CR-24
    const [from, to] = allRange(), A = ov.all;
    return { file: KT.export.scopeName(A.preset, from, to), text: `${A.preset === 'custom' ? O.presets.custom : O.presets[A.preset]} · ${R.dmy(from)} – ${R.dmy(to)}` };
  }
  /* CR-09 §4.1 Row 1 — KPI cards, no buttons (ⓘ only) · CR-26 §3.1: 4 — Campaigns · Committed · Paid · KOL & Affiliate engaged (no Deals card) ·
     CR-29 §3.1 — one card (kpiCard): Label ⓘ · the value (+ a small grey suffix) · a 6px bar · one caption line (cut with … — the whole line in its
     tooltip · money short ฿5.46M, in full in the tooltip) — the 4 rows are one grid with the cards (subgrid), so the bars sit on one line */
  const kpiCard = o => `<div class="kpi kc"><div class="l">${U.labelInfo(o.label, o.tip, o.label)}</div>` +
    `<div class="v"${o.valueTip ? ` title="${esc(o.valueTip)}"` : ''}><span class="vn">${o.value}</span>${o.suffix ? ` <small>${esc(o.suffix)}</small>` : ''}</div>` +
    `<div class="kbar" role="img" aria-label="${esc(o.barTip || o.caption)}" title="${esc(o.barTip || o.caption)}">${o.bar}</div>` +
    `<div class="cap" title="${esc(o.capTip || o.caption)}">${o.capHTML || esc(o.caption)}</div></div>`;
  const seg = (w, cls, style) => (w > 0 ? `<i class="${cls}" style="width:${Math.max(0.6, Math.min(100, w)).toFixed(2)}%${style ? ';' + style : ''}"></i>` : '');
  /* the order of the status parts (bar · caption) — the Campaign timeline's colours */
  const KPI_ST = ['ongoing', 'wrap_up', 'not_started', 'pending', 'on_hold', 'complete', 'cancelled'];
  function kpiCards(k) {
    const c = k.campaigns, d = k.deals, m = k.money, a = k.actual, PS = C.phaseStatus, X = R.fmtCompact;
    const sts = KPI_ST.filter(st => c.by[st]);
    const campaigns = kpiCard({ label: O.kCampaigns, tip: O.kCampaignsTip, value: R.fmtNum(c.n),
      bar: sts.map(st => seg(c.by[st] / Math.max(1, c.n) * 100, 'ks ' + st)).join(''),
      caption: sts.map(st => `${c.by[st]} ${PS[st]}`).join(' · ') || O.noCampaignInRange,
      capHTML: sts.length ? sts.map(st => `<span class="cd"><i class="dot ${st}"></i>${esc(`${c.by[st]} ${PS[st]}`)}</span>`).join('<span class="sep"> · </span>') : null });
    /* Committed: used (green · red over 100%) + Pending as a faint part after it */
    const used = m.usedPct == null ? 0 : m.usedPct, pendPct = m.budget ? m.pending / m.budget * 100 : 0;
    const comCap = m.budget == null ? O.kc.noBudget(X(m.pending)) : m.remaining < 0 ? O.kc.over(Math.round(used), X(-m.remaining), X(m.pending)) : O.kc.used(Math.round(used), X(m.remaining), X(m.pending));
    const comTip = m.budget == null ? O.kc.noBudget(R.baht(m.pending)) : m.remaining < 0 ? O.kc.over(Math.round(used), R.baht(-m.remaining), R.baht(m.pending)) : O.kc.used(Math.round(used), R.baht(m.remaining), R.baht(m.pending));
    const committed = kpiCard({ label: O.committed, tip: MN.committed, value: R.baht(m.committed), suffix: m.budget == null ? O.noBudget : O.of(R.baht(m.budget)),
      bar: m.budget == null ? '' : seg(used, 'ok' + (used > 100 ? ' over' : '')) + seg(Math.min(pendPct, Math.max(0, 100 - used)), 'pend'),
      barTip: comTip, caption: comCap, capTip: comTip, capHTML: m.remaining != null && m.remaining < 0 ? `<span class="late">${esc(comCap)}</span>` : null });
    /* CR-33 §3.9 — Actual (posted) instead of Paid: the bar = % of committed · "฿x submitted for payment · ฿y not submitted" */
    const actCap = O.kc.actual(X(a.submitted), X(a.notSubmitted)), actTip = O.kc.actualTip(Math.round(a.pct || 0), R.baht(a.submitted), R.baht(a.notSubmitted), R.baht(a.notPosted));
    const paid = kpiCard({ label: O.kActual, tip: O.kActualTip, value: R.baht(a.actual), bar: seg(a.pct || 0, 'ok'), barTip: actTip, caption: actCap, capTip: actTip,
      capHTML: O.kc.actualParts(X(a.submitted), X(a.notSubmitted)).map(t => `<span class="cdw">${esc(t)}</span>`).join('<span class="sep"> · </span>') });   // two parts: the caption goes onto two lines rather than "…"
    /* partners once (committed deals) · the bar: committed deals (dark) vs in List (faint — Shortlist / Contacted) · KOL / Affiliate in the value's tooltip ·
       an Affiliate there → the caption says KOL n · Affiliate n (CR-29 §6 #2) */
    const kk = k.kols, types = R.partnerTypesOf(state().lookups).map(t => `${t.label} ${R.fmtNum(kk.byType[t.key])}`).join(' · ');
    const def = O.dealsDef(R.fmtNum(d.n), R.fmtNum(d.list), R.fmtNum(d.inprocess), R.fmtNum(d.complete), R.fmtNum(kk.deals), R.fmtNum(kk.notCommitted));
    const allDeals = kk.deals + kk.notCommitted, avg = kk.avg == null ? '—' : R.baht(kk.avg), aff = (kk.byType.affiliate || 0) > 0;   // CR-32 §2.4: no Both
    const engCap = aff ? O.kc.engagedTypes(types, avg)
      : O.kc.engaged(R.fmtNum(kk.deals), R.fmtNum(allDeals), avg);
    const engaged = kpiCard({ label: O.kEngaged, tip: O.kEngagedTip, value: R.fmtNum(kk.n), suffix: O.kc.partners, valueTip: types,
      bar: seg(kk.deals / Math.max(1, allDeals) * 100, 'com') + seg(kk.notCommitted / Math.max(1, allDeals) * 100, 'lst'), barTip: O.kc.engagedBar(R.fmtNum(kk.deals), R.fmtNum(kk.notCommitted)),
      caption: engCap, capTip: `${engCap}\n${def.d}\n${def.f}` });
    return campaigns + committed + paid + engaged;
  }
  /* a download button on a table / chart card: Excel or CSV of exactly what the card shows (CR-09 §4.5) */
  const dlMenu = w => `<details class="menu dlmenu"><summary class="icon-btn" title="${esc(O.download)}" aria-label="${esc(O.download)}">${ICON.download}</summary><div class="menu-list right">` +
    `<button type="button" class="mi" data-dl="xlsx" data-w="${w}">${esc(O.dlXlsx)}</button><button type="button" class="mi" data-dl="csv" data-w="${w}">${esc(O.dlCsv)}</button></div></details>`;
  /* the export rows as a table on screen (the table view of a chart card) */
  function tableOf(t) {
    const pctCol = h => /%$/.test(String(h)), isNum = i => t.rows.some(r => typeof r[i] === 'number') || (t.total && typeof t.total[i] === 'number');
    const fmt = (v, h) => (v == null || v === '' ? '' : typeof v !== 'number' ? esc(v) : pctCol(h) ? `${(v * 100).toFixed(1)}%` : esc(R.fmtNum(Math.round(v * 100) / 100)));
    const row = (r, cls) => `<tr${cls ? ` class="${cls}"` : ''}>${r.map((v, i) => `<td${isNum(i) ? ' class="num"' : ''}>${fmt(v, t.header[i])}</td>`).join('')}</tr>`;
    return `<table class="tbl compact-sm"><thead><tr>${t.header.map((h, i) => `<th${isNum(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
      t.rows.map(r => row(r)).join('') + (t.total ? row(t.total, 'total') : '') + (t.extra || []).map(r => row(r, 'sumrow')).join('') + `</tbody></table>`;   // CR-29: summary rows
  }
  function downloadWidget(w, fmt) {
    const tab = tabOfWidget(w), t = KT.export.rowsFor(w, xOfTab(tab)), name = KT.export.fileName(O.file[w], scopeOf(tab).file, td(), fmt);
    if (fmt === 'csv') { downloadCSV(name, t.header, t.rows.concat(t.total ? [t.total] : [], t.extra || [])); return; }
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf(t)]), KT.xlsx.MIME); toast(C.io.exported(name, t.rows.length));
  }
  /* Export (the whole tab): one .xlsx, a sheet per widget · Summary first with the tab, scope, when and who */
  function exportTab(tab) {
    const now = new Date(), sc = scopeOf(tab);
    const meta = { tab: O.tabs[tab], scope: sc.text, at: `${R.dmy(td())} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, by: (U.me() || {}).display_name || '',
      status: tab === 'all' ? statusWords(statusesNow(), true) : null };   // CR-14 §4.1: the Status line under the range
    const name = KT.export.fileName(O.file['tab_' + tab], sc.file, td(), 'xlsx'), tables = KT.export.tabTables(tab, xOfTab(tab));
    U.download(name, KT.xlsx.workbook(tables.map((t, i) => KT.export.sheetOf(t, i ? null : meta))), KT.xlsx.MIME);
    toast(C.io.exported(name, tables.length));
  }
  /* ===================== CR-26 §3.2 — Budget vs Actual by month (All campaigns after the KPI · By campaign after Phase budget) ===================== */
  const bvaCard = w => { const B = O.bva;
    return `<div class="card ov-full bva-card" data-bvaw="${w}"><div class="card-head"><h3>${U.labelInfo(B.title, B.tip, B.title)}</h3><div class="btns ov-ctl">` +
      `<div class="legend bva-legend" id="bva_legend"></div>` +   // CR-29 §3.2: the legend beside Monthly / Cumulative (wraps under when narrow)
      `<div class="seg" data-bvamode role="group" aria-label="${esc(B.modeL)}"><button type="button" data-v="monthly">${esc(B.monthly)}</button><button type="button" data-v="cumulative">${esc(B.cumulative)}</button></div>` +
      `<button type="button" class="icon-btn" data-bvaact="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>${dlMenu(w)}` +
      `<button type="button" class="icon-btn" data-bvaact="expand" title="${esc(O.expand)}" aria-label="${esc(O.expand)}">${ICON.expand}</button></div></div>` +
      `<div class="bva-sum" id="bva_sum"></div>` +
      `<div class="chartbox bva-box" id="bva_box"><svg id="bva_svg" role="img" aria-label="${esc(B.title)}"></svg><div class="tip" id="bva_tip"></div></div>` +
      `<div class="tablewrap hidden" id="bva_table" style="max-height:360px"></div><div class="foot-note bva-foot" id="bva_foot"></div></div>`; };
  const bvaWidget = () => (ov.tab === 'campaign' ? 'budgetactual_camp' : 'budgetactual');
  function bvaModel() {
    if (ov.tab === 'campaign') return R.budgetVsActualByMonth(state(), { campaignId: ov.camp.campaign, phaseId: ov.camp.phase || null, today: td() });
    const [from, to] = allRange(); return R.budgetVsActualByMonth(state(), { from, to, statuses: statusesNow(), today: td() });
  }
  const signBaht = v => (v > 0 ? '+' : v < 0 ? '−' : '') + R.baht(Math.abs(v));
  const monthLabel = (k, md) => { const short = O.months[Number(k.slice(5, 7)) - 1]; return md.from.slice(0, 4) === md.to.slice(0, 4) ? short : `${short} ${k.slice(2, 4)}`; };
  const restLabel = () => (ov.tab === 'campaign' ? O.bva.restCampaign : ov.all.preset === 'this_year' ? O.bva.restYear : O.bva.restPeriod);
  /* CR-29 §3.2 — one line: To date ฿1.20M of ฿2.96M (40%) · Behind ฿1.76M (orange) / Over (red) / On plan (grey, 85–105%) · "To date" has the full
     amounts and the Rest of year in its tooltip (and the table view has both as rows) */
  function bvaSumHTML(md) {
    const B = O.bva, t = md.toDate, X = R.fmtCompact;
    /* nothing to date yet (a Campaign that has not started): its Rest of campaign / year on the line instead */
    if (!t) return md.rest ? `<span title="${esc(B.rest(restLabel(), R.baht(md.rest.upcoming), R.baht(md.rest.planned)))}">${esc(B.restShort(restLabel(), X(md.rest.upcoming), X(md.rest.planned)))}</span>` : '';
    const pct = t.pct == null ? '—' : Math.round(t.pct);
    const full = [B.toDate(R.baht(t.posted), R.baht(t.planned), pct)].concat(t.status ? [B[t.status](R.baht(t.amount))] : [], md.rest ? [B.rest(restLabel(), R.baht(md.rest.upcoming), R.baht(md.rest.planned))] : []).join('\n');
    const st = t.status ? `<b class="bva-${t.status}">${esc(B[t.status](X(t.amount)))}</b>` : t.pct != null && t.planned > 0 ? `<span class="bva-onplan">${esc(B.onPlan)}</span>` : '';
    return `<span class="bva-tdl" tabindex="0" title="${esc(full)}">${esc(B.toDateL)}</span> ${esc(B.toDateLine(X(t.posted), X(t.planned), pct))}${st ? ` · ${st}` : ''}`;
  }
  function bvaLegendHTML(mode) {
    const L = O.bva.legend, sw = (cls, t) => `<span><i class="${cls}"></i>${esc(t)}</span>`;
    return mode === 'cumulative' ? sw('bl-line ink', L.cumBudget) + sw('bl-area', L.cumPosted) + sw('bl-line dash', L.cumPlus)
      : sw('bl-posted', L.posted) + sw('bl-up', L.upcoming) + sw('bl-late', L.late) + sw('bl-line ink', L.budget) +
        `<span class="bl-sign"><b class="bva-behind">−฿</b>&nbsp;${esc(L.behind)} · <b class="bva-over">+฿</b>&nbsp;${esc(L.over)}</span>`;   // CR-29: the month labels are numbers only
  }
  function renderBva() {
    const box = $('bva_box'); if (!box) return;
    const md = bvaModel(), B = O.bva, V = ov.bva; ov.bvaModel = md;
    document.querySelectorAll('[data-bvamode] button').forEach(b => { const on = b.dataset.v === V.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const tb = document.querySelector('[data-bvaact="table"]'); if (tb) tb.classList.toggle('on', V.view === 'table');
    $('bva_sum').innerHTML = bvaSumHTML(md);
    $('bva_legend').innerHTML = bvaLegendHTML(V.mode);
    const table = V.view === 'table'; box.classList.toggle('hidden', table); $('bva_table').classList.toggle('hidden', !table); $('bva_legend').classList.toggle('hidden', table);
    if (table) $('bva_table').innerHTML = tableOf(KT.export.rowsFor(bvaWidget(), xOfTab(ov.tab)));
    else drawBva($('bva_svg'), box, $('bva_tip'), md, V.mode, 300);
    $('bva_foot').innerHTML = bvaFootHTML(md);
  }
  /* CR-29 §3.2 — one grey line under the chart: ฿207K not on chart · Set dates ⓘ (what is not there: no post date · posted / due outside these months) */
  function bvaFootHTML(md) {
    const B = O.bva, off = md.noDate.amount + md.outside.amount; if (!(off > 0)) return '';
    const d = [md.noDate.amount > 0 ? B.noDate(R.baht(md.noDate.amount)) : '', md.outside.amount > 0 ? B.outside(R.baht(md.outside.amount), md.outside.deals) : ''].filter(Boolean).join(' · ');
    return `<span>${esc(B.notOnChart(R.fmtCompact(off)))}</span>${md.noDate.amount > 0 ? ` · <button type="button" class="link" data-bvaset>${esc(B.setDates)}</button>` : ''} ${info({ h: B.notOnChartH, d })}`;
  }
  /* a bar's top end rounded (4px), its foot square on the baseline */
  const topRound = (x, y, w, h, r) => { const k = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`; };
  function drawBva(svg, box, tip, md, mode, H) {
    tip.classList.remove('show');
    const B = O.bva, cGrid = css('--grid'), cAxis = css('--muted'), cInk = css('--text'), cBlue = css('--st-prog'), cSurf = css('--surface'), cAcc = css('--accent'), cOver = css('--err'), cBehind = css('--warn');
    const months = md.months, W = Math.max(300, box.clientWidth || 800), m = { l: 58, r: 14, t: 16, b: 46 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    const t0 = md.total;
    if (!months.length || !(t0.budget || t0.posted || t0.upcoming || t0.late)) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="axis">${esc(B.empty)}</text>`; return; }
    const band = iw / months.length, bw = Math.max(6, Math.min(40, band * 0.56)), cx = i => m.l + band * i + band / 2;
    const vals = mode === 'cumulative' ? md.cum.flatMap(c => [c.budget, c.plus]) : months.flatMap(x => [x.budget, x.posted + x.upcoming + x.late]);
    const maxV = Math.max(1, ...vals), yStep = R.niceStep(maxV / 4), yMax = yStep * Math.max(1, Math.ceil(maxV * 1.08 / yStep)), y = v => m.t + ih - v / yMax * ih;
    let g = `<defs><pattern id="bvaLate" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${cSurf}"/><rect width="2.5" height="6" fill="${cBlue}"/></pattern></defs>`;
    for (let v = 0; v <= yMax + 1e-9; v += yStep) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${cGrid}" stroke-width="1"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${esc(bahtShort(v))}</text>`;
    /* the month names (thinned when narrow) · under each the words Over / Behind (a dot when there is no room) */
    const every = Math.max(1, Math.ceil(30 / band)), roomy = band >= 64;
    let labels = '';
    months.forEach((x, i) => {
      if (!(i % every)) labels += `<text x="${cx(i)}" y="${H - m.b + 16}" text-anchor="middle" class="axis${x.current ? ' bva-cur' : ''}">${esc(monthLabel(x.key, md))}</text>`;
      if (!x.status) return;
      const col = x.status === 'over' ? cOver : cBehind, words = (x.status === 'over' ? '+' : '\u2212') + R.fmtCompact(x.amount);   // CR-29: −฿143K / +฿4K (the words once in the legend)
      labels += roomy ? `<text x="${cx(i)}" y="${H - m.b + 32}" text-anchor="middle" class="axis bva-st ${x.status}" fill="${col}">${esc(words)}</text>`
        : `<circle cx="${cx(i)}" cy="${H - m.b + 28}" r="3.5" fill="${col}"><title>${esc(words)}</title></circle>`;
    });
    let marks = '';
    if (mode === 'cumulative') {
      const pts = k => md.cum.map((c, i) => [cx(i), y(c[k])]), line = a => a.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join('');
      const pp = pts('posted'), base = y(0);
      marks += `<path d="${line(pp)}L${pp[pp.length - 1][0]},${base}L${pp[0][0]},${base}Z" fill="${cBlue}" fill-opacity=".16"/>` +
        `<path d="${line(pp)}" fill="none" stroke="${cBlue}" stroke-width="2"/>` +
        `<path d="${line(pts('plus'))}" fill="none" stroke="${cBlue}" stroke-width="2" stroke-dasharray="6 4"/>` +
        `<path d="${line(pts('budget'))}" fill="none" stroke="${cInk}" stroke-width="2"/>`;
      ['budget', 'posted'].forEach(k => pts(k).forEach(q => { marks += `<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="${k === 'budget' ? cInk : cBlue}" stroke="${cSurf}" stroke-width="2"/>`; }));
    } else {
      months.forEach((x, i) => {
        const x0 = cx(i) - bw / 2, segs = [['posted', x.posted], ['upcoming', x.upcoming], ['late', x.late]].filter(q => q[1] > 0);
        let acc = 0;
        segs.forEach((q, j) => {
          const y0 = y(acc), y1 = y(acc + q[1]); acc += q[1];
          const h = Math.max(0, y0 - y1 - (j ? 2 : 0)); if (h <= 0) return;   // 2px surface gap between stacked parts
          const d = j === segs.length - 1 ? topRound(x0, y1, bw, h, 4) : `M${x0},${y1}h${bw}v${h}h${-bw}Z`;
          marks += q[0] === 'posted' ? `<path d="${d}" fill="${cBlue}"/>` : q[0] === 'upcoming' ? `<path d="${d}" fill="${cBlue}" fill-opacity=".3" stroke="${cBlue}" stroke-width="1"/>`
            : `<path d="${d}" fill="url(#bvaLate)" stroke="${cBlue}" stroke-width="1"/>`;
        });
        /* Budget: a dark tick across the month (no second bar) */
        if (x.budget > 0) marks += `<line x1="${x0 - 6}" x2="${x0 + bw + 6}" y1="${y(x.budget)}" y2="${y(x.budget)}" stroke="${cInk}" stroke-width="2.5" stroke-linecap="round"/>`;
      });
    }
    /* Today */
    let now = '';
    const ci = months.findIndex(x => x.current);
    if (ci >= 0) { const x = months[ci], n = R.dayDiff(x.to, x.from) + 1, tx = m.l + band * ci + band * Math.min(1, (R.dayDiff(td(), x.from) + 0.5) / n);
      now = `<line x1="${tx}" x2="${tx}" y1="${m.t}" y2="${m.t + ih}" stroke="${cAcc}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${tx + 4}" y="${m.t + 10}" class="axis today-l">${esc(O.today)}</text>`; }
    const hits = months.map((x, i) => `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" tabindex="0" aria-label="${esc(KT.export.monthName(x.key))}: ${esc(R.baht(x.actual))} / ${esc(R.baht(x.budget))}"/>`).join('');
    svg.innerHTML = g + `<g>${hits}</g><g style="pointer-events:none">${marks}</g><line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="${cAxis}" stroke-width="1"/>` + labels + now;
    const show = i => {
      const x = months[i], c = md.cum[i], T2 = B.tip2; tip.textContent = '';
      const add = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; tip.appendChild(el); return el; };
      const row = (l, v) => { const r = document.createElement('div'); r.className = 'r'; const a = document.createElement('span'); a.textContent = l; const b = document.createElement('b'); b.textContent = v; r.appendChild(a); r.appendChild(b); tip.appendChild(r); };
      add('d', KT.export.monthName(x.key));
      row(T2.budget, R.baht(x.budget)); row(T2.posted, R.baht(x.posted)); if (x.upcoming) row(T2.upcoming, R.baht(x.upcoming)); if (x.late) row(T2.late, R.baht(x.late));
      const v = add('r tot', ''); v.textContent = `${T2.variance} ${signBaht(x.variance)}`;
      if (x.status) add(`d bva-${x.status}`, B[x.status](R.baht(x.amount)));
      if (mode === 'cumulative') add('d', `${B.legend.cumBudget} ${R.baht(c.budget)} · ${B.legend.cumPosted} ${R.baht(c.posted)} · ${B.legend.cumPlus} ${R.baht(c.plus)}`);
      if (x.camps.length) { add('d', T2.top); x.camps.slice(0, 3).forEach(q => row(R.campaignName(state(), q.campaign_id) || q.campaign_id, R.baht(q.amount))); }
      const rect = box.getBoundingClientRect(), scale = rect.width / W; let left = cx(i) * scale + 12;
      if (left + 230 > rect.width) left = cx(i) * scale - 240;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px'; tip.classList.add('show');
    };
    svg.querySelectorAll('.hit').forEach(h => { const i = +h.dataset.i;
      h.addEventListener('pointerenter', () => show(i)); h.addEventListener('focus', () => show(i));
      h.addEventListener('pointerleave', () => tip.classList.remove('show')); h.addEventListener('blur', () => tip.classList.remove('show')); });
  }
  function expandBva() {
    const md = ov.bvaModel || bvaModel(), B = O.bva;
    openDialog(`<div class="dlg-h">${esc(B.expandTitle(B.title, R.dmy(md.from), R.dmy(md.to)))}</div><div class="dlg-b"><div class="bva-sum">${bvaSumHTML(md)}</div><div class="legend bva-legend">${bvaLegendHTML(ov.bva.mode)}</div>` +
      `<div class="chartbox bva-box" id="bvax_box"><svg id="bvax_svg" role="img" aria-label="${esc(B.title)}"></svg><div class="tip" id="bvax_tip"></div></div><div class="foot-note bva-foot">${bvaFootHTML(md)}</div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="bvax_close">${esc(C.common.close)}</button></div>`, true);
    $('bvax_close').addEventListener('click', closeDialog);
    drawBva($('bvax_svg'), $('bvax_box'), $('bvax_tip'), md, ov.bva.mode, 460);
  }
  /* Set dates → Deals: the committed deals with no Post date and no Post due (the ones off the chart) · this Campaign / every Campaign · any PIC */
  const goNoDate = () => go('deals', { filter: { campaign: ov.tab === 'campaign' ? ov.camp.campaign : '__all', phaseSel: 'all', noPostDate: true, pic: 'all' } });

  /* Campaign portfolio (Row 3) — Days left · Deals · every column sorts (Days left: On going fewest first) */
  const PCOLS = () => [{ k: 'campaign', l: O.colCampaign }, { k: 'status', l: O.colStatus }, { k: 'period', l: O.colPeriod },
    { k: 'days', l: O.colDaysLeft, num: 1, tip: { h: O.colDaysLeft, d: O.daysLeftTip } }, { k: 'budget', l: MN.budget.h, num: 1, tip: MN.budget },
    { k: 'committed', l: MN.committed.h, num: 1, tip: MN.committed }, { k: 'actual', l: O.colActual, num: 1, tip: { h: O.colActual, d: O.kActualTip } }, { k: 'used', l: MN.used.h, cls: 'usedh', tip: MN.used },
    { k: 'remaining', l: MN.remaining.h, num: 1, tip: MN.remaining }, { k: 'pending', l: MN.pending.h, num: 1, tip: MN.pending }, { k: 'deals', l: O.deals, num: 1 }];
  const daysCell = d => `<span class="dleft ${d.kind}${d.soon ? ' soon' : ''}">${esc(KT.export.daysText(d))}</span>`;
  /* Used %: a 72px bar on the left and the % in a fixed 48px on the right — the same in every row (CR-09 §4.8) */
  const usedBar72 = pct => (pct == null ? `<span class="muted">—</span>` : `<span class="used u72"><span class="ub"><span class="${pct > 100 ? 'over' : ''}" style="width:${Math.min(100, pct)}%"></span></span><span class="pc${pct > 100 ? ' late' : ''}">${Math.round(pct)}%</span></span>`);
  function renderPortfolio() {
    const m = KT.export.portfolioModel(allX()), so = ov.all.sort || {};
    if (!m.rows.length) { $('ov_port').innerHTML = `<div class="hint">${esc(O.noCampaignInRange)}</div>`; return; }
    const th = c => { const on = so.key === c.k, ar = on ? (so.dir === 'desc' ? '▼' : '▲') : '';
      const btn = `<button type="button" class="thsort" data-psort="${c.k}" title="${esc(O.sortBy(c.l))}">${esc(c.l)}${ar ? `<span class="ar">${ar}</span>` : ''}</button>`;
      const fx = c.tip && U.isFormulaInfo(c.tip);   // CR-11 §4.13 #2: ⓘ for a formula · else the header's tooltip
      return `<th class="${c.num ? 'num' : ''}${c.cls ? ' ' + c.cls : ''}"${on ? ` aria-sort="${so.dir === 'desc' ? 'descending' : 'ascending'}"` : ''}${c.tip && !fx ? ` title="${esc(U.tipText(c.tip))}"` : ''}>${fx && c.num ? info(c.tip) + ' ' : ''}${btn}${fx && !c.num ? ' ' + info(c.tip) : ''}</th>`; };
    const t = m.total;
    $('ov_port').innerHTML = `<div class="tablewrap"><table class="tbl port"><thead><tr>${PCOLS().map(th).join('')}</tr></thead><tbody>` +
      m.rows.map(r => `<tr class="click" tabindex="0" data-gocamp="${esc(r.campaign.campaign_id)}"><td class="nm"><b>${esc(r.campaign.campaign_name)}</b></td><td>${phaseChip(r.status)}</td><td class="nowrap">${esc(r.from ? `${dm(r.from)} – ${dm(r.to)}` : '')}</td>` +
        `<td class="num">${daysCell(r.days)}</td><td class="num">${r.budget == null ? `<span class="muted">${esc(O.noBudget)}</span>` : R.baht(r.budget)}${KT.budget.pendingTagHTML(r.campaign.campaign_id) ? `<div>${KT.budget.pendingTagHTML(r.campaign.campaign_id)}</div>` : ''}</td><td class="num">${R.baht(r.committed)}</td><td class="num${r.actual ? '' : ' muted'}">${r.actual ? R.baht(r.actual) : '—'}</td><td>${usedBar72(r.usedPct)}</td>` +
        `<td class="num">${remainingText(r.remaining)}</td><td class="num${r.pending ? '' : ' muted'}">${r.pending ? R.baht(r.pending) : '—'}</td><td class="num">${R.fmtNum(r.deals)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td></td><td></td><td></td><td class="num">${t.budget == null ? '—' : R.baht(t.budget)}</td><td class="num">${R.baht(t.committed)}</td><td class="num">${R.baht(t.actual || 0)}</td><td>${usedBar72(t.usedPct)}</td>` +
        `<td class="num">${remainingText(t.remaining)}</td><td class="num">${R.baht(t.pending)}</td><td class="num">${R.fmtNum(t.deals)}</td></tr></tbody></table></div>`;
  }
  /* KOL tier mix (CR-13 Row 4, right) — donut of committed deals by tier · Spend / Deals · total in the middle · legend table beside it */
  const TIER_VAR = { Mega: 'mega', Macro: 'macro', 'Mid-tier': 'mid', Micro: 'micro', Nano: 'nano' };
  const tierColor = t => (TIER_VAR[t] ? css(`--tier-${TIER_VAR[t]}`) : css('--series-grey'));
  /* the two donut cards share one skeleton (CR-13 §4.2): head · table / download / expand · Spend | Deals · donut + legend table */
  const mixCard = (cls, title, tip, act, seg, dl, bodyId) => `<div class="card ${cls}"><div class="card-head"><h3>${U.labelInfo(title, tip, title)}</h3><div class="btns ov-ctl">
      <button type="button" class="icon-btn" data-${act}="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>${dlMenu(dl)}
      <button type="button" class="icon-btn" data-${act}="expand" title="${esc(O.expand)}" aria-label="${esc(O.expand)}">${ICON.expand}</button></div></div>
    <div class="tm-ctl"><div class="seg" data-${seg}="measure"><button type="button" data-v="spend">${esc(O.mSpend)}</button><button type="button" data-v="deals">${esc(O.mDeals)}</button></div></div><div id="${bodyId}" class="tm-body"></div></div>`;
  /* CR-31 §2.1 — the same 3 cards in By campaign (one Campaign · its Phase): the widget keys end _camp there (their own download / sheet) */
  const mixW = base => (ov.tab === 'campaign' ? base + '_camp' : base);
  const campMixDeals = s => R.campaignMixDeals(s, ov.camp.campaign, ov.camp.phase || null);
  const mixTitleScope = () => { if (ov.tab === 'campaign') return scopeOf('campaign').text; const [from, to] = allRange(); return `${R.dmy(from)} – ${R.dmy(to)}`; };
  const tierCard = () => mixCard('tmix', O.tierTitle, O.tierTip, 'tact', 'tmix', mixW('tiermix'), 'ov_tmix');
  const pillarCard = () => mixCard('pmix', O.pillarTitle, O.pillarTip, 'pmixact', 'pmix', mixW('pillarmix'), 'ov_pmix');
  const donutHTML = (id, label) => `<div class="tm-wrap"><div class="tm-donut chartbox" id="${id}_box"><svg id="${id}_svg" role="img" aria-label="${esc(label)}"></svg><div class="tip" id="${id}_tip"></div></div><table class="tm-leg" id="${id}_leg"></table></div>`;
  const tierHTML = id => donutHTML(id, O.tierTitle);
  function renderTier(s, from, to) {
    const A = ov.all, m = ov.tab === 'campaign' ? R.tierMixOf(s, campMixDeals(s)) : R.tierMix(s, from, to, td(), statusesNow());
    document.querySelectorAll('#ov_body [data-tmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.tierMeasure));
    $('ov_body').querySelector('[data-tact="table"]').classList.toggle('on', A.tierView === 'table');
    ov.lastTier = m;
    if (A.tierView === 'table') { $('ov_tmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor(mixW('tiermix'), xOfTab(ov.tab)))}</div>`; return; }
    $('ov_tmix').innerHTML = tierHTML('ov_tm');
    drawDonut('ov_tm', m, A.tierMeasure, 148);
  }
  function drawDonut(id, m, meas, S) {
    const val = x => (meas === 'spend' ? x.spend : x.deals), pctOf = x => (meas === 'spend' ? x.spendPct : x.dealsPct);
    const rows = m.rows.filter(x => val(x) > 0), total = meas === 'spend' ? m.total.spend : m.total.deals;
    drawRing(id, rows.map(x => ({ value: val(x), tex: x.tier === R.UNKNOWN_TIER, fill: tierColor(x.tier), tip: O.tierSlice(x.tier, R.baht(x.spend), x.deals, pctOf(x).toFixed(1)) })), total, meas, S);
    $(id + '_leg').innerHTML = `<thead><tr><th>${esc(O.tierLabel)}</th><th>${esc(O.colFollowers)}</th><th class="num">${esc(meas === 'spend' ? O.mSpend : O.mDeals)}</th><th class="num">%</th></tr></thead><tbody>` +
      rows.map(x => `<tr><td><span class="tn"><i class="sw${x.tier === R.UNKNOWN_TIER ? ' tex' : ''}" style="background-color:${tierColor(x.tier)}"></i>${esc(x.tier)}</span></td><td class="rg">${esc(KT.export.followers(x))}</td>` +
        `<td class="num">${esc(meas === 'spend' ? R.baht(x.spend) : R.fmtNum(x.deals))}</td><td class="num">${pctOf(x).toFixed(1)}%</td></tr>`).join('') + `</tbody>`;
  }
  /* a donut: square-ended slices with a 2px surface gap · tex = grey texture (Unknown tier · Not set) · total in the middle · hover / focus = the slice in words */
  function drawRing(id, slices, total, meas, S) {
    const svg = $(id + '_svg'), tip = $(id + '_tip'), box = $(id + '_box'), cSurf = css('--surface');
    const cx = S / 2, cy = S / 2, ro = S / 2 - 2, ri = ro * 0.62;
    svg.setAttribute('viewBox', `0 0 ${S} ${S}`); svg.setAttribute('width', S); svg.setAttribute('height', S);
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const arc = (a0, a1) => { const big = a1 - a0 > Math.PI ? 1 : 0; return `M${pt(ro, a0)} A${ro} ${ro} 0 ${big} 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${big} 0 ${pt(ri, a0)} Z`; };
    let a = -Math.PI / 2, paths = '';
    slices.forEach((x, i) => {
      const sweep = x.value / total * Math.PI * 2, a1 = a + sweep;
      const d = sweep >= Math.PI * 2 - 1e-6 ? arc(a, a + Math.PI) + arc(a + Math.PI, a + Math.PI * 2 - 1e-4) : arc(a, a1);
      paths += `<path class="sl" data-i="${i}" data-a="${(a + a1) / 2}" d="${d}" fill="${x.tex ? `url(#${id}_tex)` : x.fill}" stroke="${cSurf}" stroke-width="2" tabindex="0" aria-label="${esc(x.tip)}"/>`;
      a = a1;
    });
    const defs = `<defs><pattern id="${id}_tex" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${css('--series-grey')}"/><rect width="2" height="6" fill="${cSurf}" opacity=".7"/></pattern></defs>`;
    const center = total ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="tm-c${S > 200 ? ' big' : ''}">${esc(meas === 'spend' ? bahtShort(total) : O.centerDeals(total))}</text>` : '';
    svg.innerHTML = defs + (slices.length ? paths : `<circle cx="${cx}" cy="${cy}" r="${(ro + ri) / 2}" fill="none" stroke="${css('--surface-3')}" stroke-width="${ro - ri}"/>`) + center;
    const show = el => {
      const x = slices[+el.dataset.i], am = +el.dataset.a, r = (ro + ri) / 2, rect = box.getBoundingClientRect(), sc = rect.width ? Math.min(1, rect.width / S) : 1;
      tip.textContent = ''; const t = document.createElement('div'); t.className = 'r tot'; t.textContent = x.tip; tip.appendChild(t);
      tip.style.left = Math.max(0, (cx + r * Math.cos(am)) * sc + 8) + 'px'; tip.style.top = Math.max(0, (cy + r * Math.sin(am)) * sc - 10) + 'px'; tip.classList.add('show');
    };
    svg.querySelectorAll('.sl').forEach(el => {
      el.addEventListener('pointerenter', () => show(el)); el.addEventListener('focus', () => show(el));
      el.addEventListener('pointerleave', () => tip.classList.remove('show')); el.addEventListener('blur', () => tip.classList.remove('show'));
    });
  }
  /* ---------- CR-29 §3.4 — Platform mix (Row 4, right): committed deals by the platform of their account · Spend | Deals · donut + table ·
     one ink ramp (a fixed step a platform — the Tier card beside it has the colours) · Not set = the grey texture ---------- */
  const PF_STEP = { TikTok: 1, Instagram: 2, Facebook: 3, X: 4, Lemon8: 5, YouTube: 6, Other: 7 };
  const platformColor = k => (PF_STEP[k] ? css(`--pf-${PF_STEP[k]}`) : css('--series-grey'));
  const platformCard = () => mixCard('fmix', O.platformTitle, O.pfMixTip, 'fmixact', 'fmix', mixW('platformmix'), 'ov_fmix');
  const pfLabel = k => (k === R.NOT_SET ? O.notSet : k);
  function renderPlatform(s, from, to) {
    const A = ov.all, m = ov.tab === 'campaign' ? R.platformMixOf(s, campMixDeals(s)) : R.platformMix(s, from, to, td(), statusesNow());
    document.querySelectorAll('#ov_body [data-fmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.platformMeasure));
    $('ov_body').querySelector('[data-fmixact="table"]').classList.toggle('on', A.platformView === 'table');
    ov.lastPlatform = m;
    const note = m.multi ? `<div class="foot-note pf-note">${esc(O.platformMulti(m.multi))}</div>` : '';
    if (A.platformView === 'table') { $('ov_fmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor(mixW('platformmix'), xOfTab(ov.tab)))}</div>` + note; return; }
    $('ov_fmix').innerHTML = donutHTML('ov_fm', O.platformTitle) + note;
    drawPlatform('ov_fm', m, A.platformMeasure, 148);
  }
  function drawPlatform(id, m, meas, S) {
    const val = x => (meas === 'spend' ? x.spend : x.deals), pctOf = x => (meas === 'spend' ? x.spendPct : x.dealsPct), total = meas === 'spend' ? m.total.spend : m.total.deals;
    const rows = m.rows.filter(x => val(x) > 0);
    drawRing(id, rows.map(x => ({ value: val(x), tex: x.platform === R.NOT_SET, fill: platformColor(x.platform), tip: O.platformSlice(pfLabel(x.platform), R.baht(x.spend), x.deals, pctOf(x).toFixed(1)) })), total, meas, S);
    /* Platform · Deals · Spend · % (of what is shown) */
    $(id + '_leg').innerHTML = `<thead><tr><th>${esc(O.platformLabel)}</th><th class="num">${esc(O.mDeals)}</th><th class="num">${esc(O.mSpend)}</th><th class="num">%</th></tr></thead><tbody>` +
      m.rows.map(x => `<tr><td><span class="tn"><i class="sw${x.platform === R.NOT_SET ? ' tex' : ''}" style="background-color:${platformColor(x.platform)}"></i>${x.platform === R.NOT_SET ? '' : U.pfIcon(x.platform)}${esc(pfLabel(x.platform))}</span></td>` +
        `<td class="num">${esc(R.fmtNum(x.deals))}</td><td class="num">${esc(R.baht(x.spend))}</td><td class="num">${pctOf(x).toFixed(1)}%</td></tr>`).join('') + `</tbody>`;
  }
  function expandPlatform() {
    const m = ov.lastPlatform; if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.platformTitle)} · ${esc(mixTitleScope())}</div><div class="dlg-b tm-big">${donutHTML('ovx_fm', O.platformTitle)}</div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, 'mid');
    $('ovx_close').addEventListener('click', closeDialog);
    drawPlatform('ovx_fm', m, ov.all.platformMeasure, 260);
  }
  function expandTier() {
    const m = ov.lastTier; if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.tierTitle)} · ${esc(mixTitleScope())}</div><div class="dlg-b tm-big">${tierHTML('ovx_tm')}</div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, 'mid');
    $('ovx_close').addEventListener('click', closeDialog);
    drawDonut('ovx_tm', m, ov.all.tierMeasure, 260);
  }
  /* ---------- CR-13 §4.2 — Pillar mix (Row 4, left): where the committed money went, by pillar, against the target ---------- */
  const PILLAR_VAR = ['--pl-aw', '--pl-ac', '--pl-co', '--pl-cv'];   // CR-19: R.PILLARS order
  const pillarColor = k => (R.PILLARS.includes(k) ? css(PILLAR_VAR[R.PILLARS.indexOf(k)]) : css('--series-grey'));
  const pctTxt = v => (v == null ? '—' : `${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(1)}%`);
  function renderPillar(s, from, to) {
    const A = ov.all, m = ov.tab === 'campaign' ? R.pillarMixOf(s, campMixDeals(s)) : R.pillarMix(s, from, to, td(), statusesNow());
    document.querySelectorAll('#ov_body [data-pmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.pillarMeasure));
    $('ov_body').querySelector('[data-pmixact="table"]').classList.toggle('on', A.pillarView === 'table');
    ov.lastPillar = m;
    const note = pillarNote(m);
    if (A.pillarView === 'table') { $('ov_pmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor(mixW('pillarmix'), xOfTab(ov.tab)))}</div>` + note; return; }
    $('ov_pmix').innerHTML = donutHTML('ov_pm', O.pillarTitle) + note;
    drawPillar('ov_pm', m, A.pillarMeasure, 148);
  }
  /* most of the money with no pillar: the chart cannot be trusted yet — say so, and where it is fixed once (CR-11 §4.11) */
  const pillarNote = m => (m.notSetPct > 50 ? `<div class="check warn pm-note">! <span>${esc(O.noPillarLine((Math.round(m.notSetPct * 10) / 10).toFixed(1)))} ·</span>` +
    (U.can('campaign.edit') && m.mostNoPillar ? `<button type="button" class="link" data-allocplan="${esc(m.mostNoPillar)}">${esc(O.setDefaults)}</button>` : `<span>${esc(O.setDefaults)}</span>`) + `</div>` : '');
  function drawPillar(id, m, meas, S) {
    const val = x => (meas === 'spend' ? x.spend : x.deals), pctOf = x => (meas === 'spend' ? x.spendPct : x.dealsPct), total = meas === 'spend' ? m.total.spend : m.total.deals;
    const label = k => (k === R.NOT_SET ? O.notSet : k), rows = m.rows.filter(x => val(x) > 0);
    drawRing(id, rows.map(x => ({ value: val(x), tex: x.pillar === R.NOT_SET, fill: pillarColor(x.pillar),
      tip: O.pillarSlice(label(x.pillar), R.baht(x.spend), x.deals, pctOf(x).toFixed(1)) })), total, meas, S);
    /* CR-19 §4.7 — Pillar · Spend (or Deals) · % of total (no Target / Δ) */
    $(id + '_leg').innerHTML = `<thead><tr><th>${esc(O.pillarLabel)}</th><th class="num">${esc(meas === 'spend' ? O.mSpend : O.mDeals)}</th><th class="num">${esc(O.pctTotal)}</th></tr></thead><tbody>` +
      m.rows.map(x => `<tr><td><span class="tn"><i class="sw${x.pillar === R.NOT_SET ? ' tex' : ''}" style="background-color:${pillarColor(x.pillar)}"></i>${esc(label(x.pillar))}</span></td>` +
        `<td class="num">${esc(meas === 'spend' ? R.baht(x.spend) : R.fmtNum(x.deals))}</td><td class="num">${pctOf(x).toFixed(1)}%</td></tr>`).join('') + `</tbody>`;
  }
  function expandPillar() {
    const m = ov.lastPillar; if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.pillarTitle)} · ${esc(mixTitleScope())}</div><div class="dlg-b tm-big">${donutHTML('ovx_pm', O.pillarTitle)}${pillarNote(m)}</div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, 'mid');
    $('ovx_close').addEventListener('click', closeDialog);
    drawPillar('ovx_pm', m, ov.all.pillarMeasure, 260);
  }
  /* ---------- CR-19 §4 — Campaign timeline (Row 3): one row a Campaign (40px) — its dates in the colour of its status (the Gantt of Campaign & Phase ›
     Timeline: U.ganttAxis · .gantt · .gbar), a thin line where a Phase starts, its posts by week (by day for 45 days or less — R.campaignTimeline,
     the numbers of R.activityBins) on one scale for every row, in one ink (never a colour a Campaign) · what falls outside the Campaign's dates is
     faded · 10 rows, then it scrolls inside the card with the axis on top · Show all = every row ---------- */
  const tlCard = () => `<div class="card ctl-card"><div class="card-head"><h3>${U.labelInfo(O.timelineTitle, O.timelineTip, O.timelineTitle)}</h3><div class="btns ov-ctl">
      <div class="seg" data-swim="measure"><button type="button" data-v="posts">${esc(O.mPosts)}</button><button type="button" data-v="spend">${esc(O.mSpend)}</button></div>
      <button type="button" class="icon-btn" data-sact="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>
      ${dlMenu('timeline')}
      <button type="button" class="icon-btn" data-sact="expand" title="${esc(O.showAll)}" aria-label="${esc(O.showAll)}">${ICON.expand}</button></div></div>
    <div class="ctl-sub" id="ov_tlsub"></div><div class="ctl-box" id="ov_tlbox"></div><div class="foot-note" id="ov_tlfoot"></div></div>`;
  const TL_LEGEND = ['ongoing', 'wrap_up', 'not_started', 'pending', 'on_hold', 'complete', 'cancelled'];
  /* the line under the title: n campaigns · Today · the status colours there are (always On going · Not started · Pending approval · Complete) · Posted · Planned */
  const tlLegend = m => { const has = new Set(m.rows.map(r => r.status));
    return TL_LEGEND.filter(k => ['ongoing', 'not_started', 'pending', 'complete'].includes(k) || has.has(k)).map(k => `<span class="lg"><i class="gbar span ${k}"></i>${esc(C.phaseStatus[k])}</span>`).join('') +
      `<span class="lg"><i class="ctl-b p"></i>${esc(O.colPosted)}</span><span class="lg"><i class="ctl-b pl"></i>${esc(O.planned)}</span>`; };
  function renderTl(s, from, to) {
    const A = ov.all, m = R.campaignTimeline(s, from, to, A.measure, td(), statusesNow());
    ov.lastTl = m;
    document.querySelectorAll('#ov_body [data-swim] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.measure));
    $('ov_body').querySelector('[data-sact="table"]').classList.toggle('on', A.view === 'table');
    $('ov_tlsub').innerHTML = `<span class="ctl-n">${esc(O.timelineSub(m.rows.length, dm(td())))}</span><span class="legend ctl-leg">${tlLegend(m)}</span>`;
    if (A.view === 'table') $('ov_tlbox').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor('timelinetable', allX()))}</div>`;
    else { $('ov_tlbox').innerHTML = tlHTML(s, m, false); wireTl($('ov_tlbox'), m); }
    /* CR-29 §3.3 — one line: "76 posts not shown" + ⓘ (no date · dated outside this range · outside the campaign period) · nothing → no line */
    const mp = m.measure === 'posts' ? m : R.campaignTimeline(s, from, to, 'posts', td(), statusesNow());   // the posts, whatever the measure
    const nd = mp.undated.count || 0, n = nd + (mp.outside || 0) + (mp.outsidePeriod || 0);
    $('ov_tlfoot').innerHTML = n ? `<span>${esc(O.notShown(R.fmtNum(n)))}</span> ${info({ h: O.notShownH, d: [nd ? O.undatedPosts(nd) + (m.measure === 'spend' && m.undated.amount ? ` (${R.baht(m.undated.amount)})` : '') : '',
      mp.outside ? O.outsideRange(mp.outside) : '', mp.outsidePeriod ? O.outsidePeriodFaded(mp.outsidePeriod) : ''].filter(Boolean).join(' · ') })}` : '';
  }
  function tlHTML(s, m, all) {
    if (!m.rows.length) return `<div class="hint">${esc(O.noCampaignInRange)}</div>`;
    const ax = U.ganttAxis(m.from, m.to, R.timeAxis(m.from, m.to, m.gran).ticks, td()), step = m.gran === 'week' ? 7 : 1, end1 = R.addDays(m.to, 1);
    const max = Math.max(1, m.max), H = 16, binL = k => ax.pct(k < m.from ? m.from : k), binR = k => ax.pct(R.addDays(k, step) > end1 ? end1 : R.addDays(k, step));
    const rows = m.rows.map((r, i) => {
      const span = r.start && r.end && r.end >= m.from && r.start <= m.to ? (() => { const l = ax.pct(r.start < m.from ? m.from : r.start), w = ax.pct(R.addDays(r.end > m.to ? m.to : r.end, 1)) - l;
        return `<span class="gbar span ${r.status}" data-tlspan="${i}" style="left:${l}%;width:${Math.max(0.4, w)}%"></span>`; })() : '';
      /* a Phase that starts after the Campaign does: a thin line there (no colour) */
      const lines = r.phases.filter(p => p.start > r.start && p.start >= m.from && p.start <= m.to)
        .map(p => `<i class="ctl-ph" style="left:${ax.pct(p.start)}%" title="${esc(O.tlPhaseStart(R.phaseName(s, p.phase_id), R.dmy(p.start)))}"></i>`).join('');
      const bars = r.bins.map((b, j) => {
        if (!b.total) return '';
        const l = binL(b.key), w = Math.max(0, binR(b.key) - l); let y = 0;
        const seg = (v, cls) => { if (!(v > 0)) return ''; const h = Math.max(1, v / max * H), out = `<i class="ctl-b ${cls}" style="left:calc(${l}% + 1px);width:max(1px,calc(${w}% - 2px));bottom:${10 + y}px;height:${h}px"></i>`; y += h; return out; };
        return seg(b.posted - b.outPosted, 'p') + seg(b.outPosted, 'p out') + seg(b.planned - b.outPlanned, 'pl') + seg(b.outPlanned, 'pl out') +
          `<i class="ctl-hit" data-tlr="${i}" data-tlb="${j}" style="left:${l}%;width:${w}%"></i>`;
      }).join('');
      const lab = m.measure === 'spend' ? R.baht(r.posted + r.planned) : O.rowPosts(R.fmtNum(r.posted + r.planned));
      return `<tr class="click ctl-r" tabindex="0" data-gocamp="${esc(r.campaign.campaign_id)}" aria-label="${esc(`${r.campaign.campaign_name} · ${C.phaseStatus[r.status] || ''} · ${lab}`)}">` +
        `<td class="gn"><b>${esc(r.campaign.campaign_name)}</b><div class="ctl-meta">${phaseChip(r.status)} <span class="muted">${esc(lab)}</span></div></td>` +
        `<td class="gtl"><div class="gt-row">${ax.grid}${ax.today}${span}${lines}${bars}</div></td><td class="gd num">${daysCell(r.days)}</td></tr>`;
    }).join('');
    return `<div class="ctl-scroll${all ? ' all' : ''}"><table class="tbl gantt ctl"><thead><tr><th class="gn">${esc(O.colCampaign)}</th><th class="gtl"><div class="gt-head">${ax.head}</div></th>` +
      `<th class="gd num">${esc(O.colDaysLeft)}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="ctl-shade"></div><div class="tip" data-tltip></div>`;
  }
  /* the tooltips (a bar: its week · Phase · posted / planned — the Campaign's dates: period · status · money · posts) · the shade that says there is more below */
  function wireTl(box, m) {
    const tip = box.querySelector('[data-tltip]'), sc = box.querySelector('.ctl-scroll'), s = state();
    const more = () => box.classList.toggle('more', !!sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 2);
    if (sc) { sc.addEventListener('scroll', () => { more(); tip.classList.remove('show'); }); more(); }
    const fmt = v => (m.measure === 'spend' ? R.baht(v) : R.fmtNum(Math.round(v)));
    const place = el => { const b = box.getBoundingClientRect(), r = el.getBoundingClientRect(); let left = r.left - b.left + r.width / 2 + 10; if (left + 230 > b.width) left = Math.max(0, r.left - b.left - 236);
      tip.style.left = left + 'px'; tip.style.top = Math.max(0, r.top - b.top) + 'px'; tip.classList.add('show'); };
    const lines = list => { tip.textContent = ''; list.forEach(([cls, t]) => { const el = document.createElement('div'); el.className = cls; el.textContent = t; tip.appendChild(el); }); };
    const phaseAt = (r, d) => { const p = r.phases.find(x => x.start <= d && (!x.end || x.end >= d)); return p ? R.phaseName(s, p.phase_id) : '—'; };
    const show = el => {
      if (el.dataset.tlb != null) {
        const r = m.rows[+el.dataset.tlr], b = r.bins[+el.dataset.tlb], mid = m.gran === 'week' ? R.addDays(b.key, 3) : b.key;
        const out = b.outPosted + b.outPlanned;
        lines([['d', binTitle(b.key, m.gran)], ['r tot', r.campaign.campaign_name], ['d', O.tlPhase(phaseAt(r, mid))], ['d', O.postedPlanned(fmt(b.posted), fmt(b.planned))]].concat(out ? [['d', `${fmt(out)} ${O.tlOutside}`]] : []));
      } else {
        const r = m.rows[+el.dataset.tlspan], mo = r.money, T = O.tlSpan;
        lines([['r tot', r.campaign.campaign_name], ['d', `${T.period} ${r.start ? `${R.dmy(r.start)} – ${R.dmy(r.end)}` : '—'}`], ['d', `${T.status} ${C.phaseStatus[r.status] || r.status}`],
          ['d', `${T.budget} ${mo.budget == null ? '—' : R.baht(mo.budget)} · ${T.committed} ${R.baht(mo.committed)} · ${T.used} ${mo.usedPct == null ? '—' : Math.round(mo.usedPct) + '%'}`],
          ['d', `${T.posts} ${R.fmtNum(r.posted + r.planned)}${m.measure === 'spend' ? ' ฿' : ''}`]]);
      }
      place(el);
    };
    box.addEventListener('pointerover', e => { const el = e.target.closest('.ctl-hit, [data-tlspan]'); if (el) show(el); else tip.classList.remove('show'); });
    box.addEventListener('pointerleave', () => tip.classList.remove('show'));
  }
  /* Show all: every row, no scroll (the full screen dialog) */
  function expandTl() {
    const m = ov.lastTl; if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.timelineTitle)} · ${esc(R.dmy(m.from))} – ${esc(R.dmy(m.to))}</div><div class="dlg-b"><div class="ctl-sub">${$('ov_tlsub').innerHTML}</div><div class="ctl-box" id="ovx_tl">${tlHTML(state(), m, true)}</div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, 'xl');
    $('ovx_close').addEventListener('click', closeDialog);
    wireTl($('ovx_tl'), m);
    $('ovx_tl').addEventListener('click', e => { const tr = e.target.closest('[data-gocamp]'); if (!tr) return; closeDialog(); Object.assign(ov.camp, { campaign: tr.dataset.gocamp, phase: '' }); ov.tab = 'campaign'; render(); });
  }
  /* a Phase strip shows its full name, or only "Phase n" when that is all that fits, or nothing (never cut with …; the legend and tooltip carry the name) */
  const stripLabel = (t, w) => [t, String(t).split(' · ')[0]].find(x => x.length * 6 <= w) || '';

  /* ===================== Tab 2 — By campaign ===================== */
  function campScope() { return { campaignId: ov.camp.campaign || null, phaseIds: ov.camp.campaign && ov.camp.phase ? [ov.camp.phase] : null }; }
  function renderCampaign() {
    const s = state(), P = ov.camp;
    /* a Campaign is always chosen: the first one in §4.8 order */
    if (!P.campaign || !R.campaignOf(s, P.campaign)) {
      const c = R.sortCampaigns(s.campaigns, s.phases, td()).find(x => !R.campaignEffectiveStatus || R.campaignEffectiveStatus(x, R.phasesOfCampaign(s, x.campaign_id), td()) !== 'cancelled');
      P.campaign = c ? c.campaign_id : ''; P.phase = '';
    }
    if (P.phase && !s.phases.some(p => p.phase_id === P.phase && p.campaign_id === P.campaign)) P.phase = '';
    /* Color by: Pillar · KOL Tier — KOL Tier first (most deals have no pillar yet) · remembered per person */
    if (P.colorFor !== U.userId() || !COLOR_BY.includes(P.colorBy)) { const v = pref.get(colorKey(), ''); P.colorBy = COLOR_BY.includes(v) ? v : 'tier'; P.colorFor = U.userId(); }
    const ps = P.campaign ? R.sortPhases(R.phasesOfCampaign(s, P.campaign)) : [];
    const st = R.rangeStatus(...R.scopeRange(s, campScope()), td()), cta = R.campaignCta(s, P.campaign);
    $('ov_tools').innerHTML = `<select id="ov_camp" aria-label="${esc(O.campaign)}" data-combo="campaign" data-combo-new="campaign">${U.campaignOptionsHTML(P.campaign, null)}</select>` +
      `<select id="ov_phase" aria-label="${esc(O.phase)}" data-combo="phase"><option value="" data-special>${esc(O.allPhases)}</option>${ps.map(p => U.phaseOptionHTML(p, P.phase)).join('')}</select>` +
      `<span class="muted small" id="ov_range">${esc(!st ? '' : st.kind === 'running' ? `${O.rangeRunning(R.dmy(st.from), R.dmy(st.to), st.day, st.of)} · ${KT.export.daysText(R.daysLeft({ status: 'ongoing', from: st.from, to: st.to }, td()))}` : st.kind === 'ended' ? O.rangeEnded(R.dmy(st.to)) : O.rangeStarts(R.dmy(st.from), st.days))}` +
      `${cta ? ` <span class="ctachip" title="${esc(C.campaign.ctaTip)}">${esc(C.campaign.ctaLabel(cta))}</span>` : ''}</span>` +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-export="campaign" title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>`;
    U.enhanceCombos($('ov_tools'));
    if (!P.campaign) { $('ov_body').innerHTML = `<div class="card empty"><b>${esc(O.noCampaign)}</b></div>`; return; }
    $('ov_body').innerHTML = `<div class="kpis cards4" id="ov_cards"></div>${activityCard()}
      <div class="card ov-full"><div class="card-head"><h3>${esc(O.phaseBudgetTitle)}</h3><div class="btns ov-ctl">${dlMenu('phasebudget')}</div></div><div id="ov_pbudget"></div></div>
      ${bvaCard('budgetactual_camp')}
      <div class="ov-r4 r3 camp-mix">${pillarCard()}${tierCard()}${platformCard()}</div>
      <div class="card ov-full"><div class="card-head"><h3>${U.labelInfo(O.productsTitle, O.productsTip, O.productsTitle)}</h3><div class="btns ov-ctl">${dlMenu('products')}</div></div><div id="ov_products"></div></div>
      <div class="card ov-full"><div class="card-head"><h3>${esc(O.cancelledTitle)}</h3><div class="btns ov-ctl">${dlMenu('cancelled')}</div></div><div id="ov_cancelled"></div></div>
      <div class="card ov-full"><div class="card-head"><h3>${U.labelInfo(O.team.title, O.team.tip, O.team.title)}</h3><div class="btns ov-ctl">${dlMenu('workload')}</div></div><div id="ov_cwork"></div></div>`;
    const scope = campScope();
    if (P.reasonFor !== P.campaign + '|' + P.phase) { P.reason = ''; P.reasonFor = P.campaign + '|' + P.phase; }   // the reason chip is per Campaign / Phase
    renderCards(s, scope); renderActivity(s, scope); renderPhaseBudget(s); renderBva(); renderPillar(s); renderTier(s); renderPlatform(s); renderProductsGiven(s, scope); renderCancelled(s, scope); renderCampaignWorkload(s, scope);   // CR-31 §2.1: + the mix row
  }
  const activityCard = () => `<div class="card"><div class="card-head"><h3>${esc(O.activityTitle)}</h3>
      <div class="btns ov-ctl">
        <div class="seg" data-ctl="measure"><button type="button" data-v="posts">${esc(O.mPosts)}</button><button type="button" data-v="spend">${esc(O.mSpend)}</button></div>
        <span class="muted small">${esc(O.colorBy)}</span><div class="seg" data-ctl="colorBy"><button type="button" data-v="pillar">${esc(O.byPillar)}</button><button type="button" data-v="tier">${esc(O.byTier)}</button></div>
        <div class="seg" data-ctl="gran"><button type="button" data-v="day">${esc(O.daily)}</button><button type="button" data-v="week">${esc(O.weekly)}</button></div>
        <button type="button" class="icon-btn" data-act="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>
        ${dlMenu('activity_camp')}
        <button type="button" class="icon-btn" data-act="expand" title="${esc(O.expand)}" aria-label="${esc(O.expand)}">${ICON.expand}</button></div></div>
      <div class="legend" id="ov_legend"></div>
      <div class="chartbox" id="ov_chartbox"><svg id="ov_svg" role="img" aria-label="${esc(O.activityTitle)}"></svg><div class="tip" id="ov_tip"></div></div>
      <div class="tablewrap hidden" id="ov_tablewrap" style="max-height:300px"></div>
      <div class="foot-note" id="ov_actFoot"></div></div>`;
  /* "Products: n items · m units planned" — the Campaign's products and the qty its deals picked (in the Phases when some are chosen) */
  function productsLine(s, scope) {
    const sc = R.toScope(scope); if (!sc.campaignId) return '';
    const x = R.productsPlanned(s, sc.campaignId, sc.phaseIds ? R.scopeDeals(s, sc, R.phaseIndex(s)).map(d => d.deal_id) : null);
    return `<div class="sub muted">${esc(C.products.line(x.items, x.units))}</div>`;
  }
  function renderCards(s, scope) {
    const c = R.summaryCards(s, scope, td()), D1 = c.deals, B = c.budget, P = c.posts, E = c.engagement;
    const seg = (n, cls, label) => (n ? `<span class="${cls}" style="flex:${n}" title="${esc(`${label} ${n}`)}"></span>` : '');
    const deals = `<div class="kpi scard"><div class="l">${U.labelInfo(O.deals, O.dealsTip, O.deals)}</div><div class="v">${R.fmtNum(D1.active)}</div>` +
      `<div class="sub">${esc(O.completedLine(R.fmtNum(D1.complete), Math.round(D1.completedPct)))}</div>` +
      `<div class="sbar">${seg(D1.list, 'list', C.status.List)}${seg(D1.inprocess, 'progress', C.status.Inprocess)}${seg(D1.complete, 'done', C.status.Complete)}</div>` +
      `<div class="slegend"><span><i class="list"></i>${esc(C.status.List)} ${D1.list}</span><span><i class="progress"></i>${esc(C.status.Inprocess)} ${D1.inprocess}</span><span><i class="done"></i>${esc(C.status.Complete)} ${D1.complete}</span></div>` +
      (D1.cancelled ? `<div class="sub muted">${esc(O.cancelledN(D1.cancelled))}</div>` : '') + `</div>`;
    /* §4.5: Committed of Budget · Used % · Remaining · + Pending · Paid */
    const m = R.moneyOf(B.budget, B.committed, B.shortlist, B.paid), paidPct = B.budget ? Math.min(100, B.paid / B.budget * 100) : 0;
    const budget = `<div class="kpi scard"><div class="l">${esc(O.committed)} ${info(MN.committed)}</div><div class="v">${R.baht(m.committed)} <small>${m.budget == null ? esc(O.noBudget) : esc(O.of(R.baht(m.budget)))}</small></div>` +
      (m.usedPct != null ? `<div class="bar2" title="${esc(O.paidOfCommitted)}"><span class="c${m.remaining < 0 ? ' over' : ''}" style="width:${Math.min(100, m.usedPct)}%"></span><span class="p" style="width:${paidPct}%"></span></div>` +
        `<div class="sub">${m.remaining < 0 ? `<b class="late">${esc(O.usedOver(Math.round(m.usedPct), R.baht(-m.remaining)))}</b>` : esc(O.usedLine(Math.round(m.usedPct), R.baht(m.remaining)))}</div>` : '') +
      `<div class="sub muted">${esc(O.pendingLine(R.baht(m.pending)))} ${info(MN.pending)} · ${esc(O.paidLine(R.baht(m.paid)))}</div></div>`;
    const posts = `<div class="kpi scard"><div class="l">${U.labelInfo(O.posts, O.postsCardTip, O.posts)}</div><div class="v">${R.fmtNum(P.posted)} <small>${esc(O.ofPlanned(R.fmtNum(P.planned)))}</small></div>` +
      `<div class="pfrow">${P.byPlatform.map(x => `<span class="${x.posted ? '' : 'muted'}" title="${esc(O.platformTip(x.platform, x.posted, x.planned))}">${pfIcon(x.platform, x.posted ? 'posted' : 'planned', O.platformTip(x.platform, x.posted, x.planned))} ${esc(x.platform)} ${x.posted}</span>`).join('')}</div>` +
      productsLine(s, scope) + `</div>`;
    const kv2 = (l, v) => `<span class="k">${esc(l)}</span><b>${esc(v)}</b>`;
    const eng = `<div class="kpi scard"><div class="l">${U.labelInfo(O.engagement, O.engagementTip, O.engagement)}</div>` + (E ? `<div class="egrid">` +
      kv2(O.views, shortNum(E.views)) + kv2(O.likes, shortNum(E.likes)) + kv2(O.comments, shortNum(E.comments)) + kv2(O.saves, shortNum(E.saves)) +
      kv2(O.shares, shortNum(E.shares)) +
      `</div><div class="sub muted">${esc(O.metricsOn(E.withMetrics, E.posted))}${E.noDate ? ` · ${esc(O.metricsNoDate(E.noDate))}` : ''}</div>` : `<div class="v muted small-v">${esc(O.noMetrics)}</div>`) + `</div>`;
    $('ov_cards').innerHTML = deals + budget + posts + eng;
  }
  const PALETTE_N = 8;
  const COLOR_BY = ['pillar', 'tier'], colorKey = () => 'actcolor_' + (U.userId() || '');
  function colorOf(item) {
    if (item.grey) return css('--series-grey');
    if (item.kind === 'tier') return tierColor(item.key);
    if (item.kind === 'pillar') return css(PILLAR_VAR[item.slot]);
    if (item.kind === 'phase') return U.phaseColor(null, item.key);   // CR-13 §4.3: the ordinal grey of the Phase, never a data colour
    return item.slot >= 0 && item.slot < PALETTE_N ? css(`--ph${item.slot + 1}`) : css('--series-grey');
  }
  const keyLabel = k => (k === R.NEEDS ? O.needsPhase : k === R.UNSCHEDULED ? O.unscheduled : k === R.NOT_SET ? O.pillarNotSet : k);
  function activityModel(s, scope) {
    const P = ov.camp, [from, to] = R.activityRange(s, scope, td()), gran = P.gran || 'day', axis = R.timeAxis(from, to, gran);
    const data = R.activityBins(s, scope, from, to, gran, P.measure, P.colorBy, td());
    const series = R.activitySeries(s, scope, P.colorBy, td()).map(x => Object.assign(x, { color: colorOf(x), label: P.colorBy === 'phase' && !x.grey ? R.phaseName(s, x.key) : x.label || keyLabel(x.key) }));
    const tot = new Map(data.totals.map(t => [t.key, t]));
    const used = series.filter(x => tot.has(x.key) && (tot.get(x.key).posted + tot.get(x.key).planned) > 0);
    /* CR-09 §4.4 — the Phases as a grey band (one Phase chosen = only that one), not as bar colours */
    const strip = R.sortPhases(R.phasesOfCampaign(s, P.campaign)).filter(p => !P.phase || p.phase_id === P.phase).map(p => ({ key: p.phase_id, label: R.phaseName(s, p.phase_id), from: p.start_date, to: p.end_date }));
    return { from, to, gran, axis, bins: data.bins, series: used, totals: tot, undated: data.undated, outside: data.outside, strip, overlaps: R.phaseOverlaps(R.phasesOfCampaign(s, P.campaign)), td: td(), measure: P.measure };
  }
  function renderActivity(s, scope) {
    const m = activityModel(s, scope), P = ov.camp;
    document.querySelectorAll('#ov_body [data-ctl]').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === (g.dataset.ctl === 'gran' ? m.gran : P[g.dataset.ctl]))));
    $('ov_body').querySelector('[data-act="table"]').classList.toggle('on', P.view === 'table');
    $('ov_chartbox').classList.toggle('hidden', P.view !== 'chart'); $('ov_tablewrap').classList.toggle('hidden', P.view !== 'table');
    const postedAll = m.bins.reduce((a, b) => a + b.posted, 0), plannedAll = m.bins.reduce((a, b) => a + b.planned, 0);
    $('ov_legend').innerHTML = m.series.map(x => { const t = m.totals.get(x.key);
      return `<span class="lg" title="${esc(O.legendTip(x.label, fmtV(t.posted, m.measure), fmtV(t.planned, m.measure)))}"><i class="${x.grey ? 'tex' : ''}" style="background-color:${x.color}"></i>${esc(x.kind === 'campaign' && x.label.length > 24 ? x.key : x.label)} <b>${esc(fmtV(t.posted + t.planned, m.measure))}</b></span>`; }).join('') +   // CR-11 §4.13 #10: a long Campaign name → its code (the name on hover)
      `<span class="lg"><i class="planned"></i>${esc(O.planned)}</span><span class="lg muted">${esc(O.postedPlanned(fmtV(postedAll, m.measure), fmtV(plannedAll, m.measure)))}</span>`;
    renderActivityChart($('ov_svg'), $('ov_chartbox'), $('ov_tip'), m, 250);
    if (P.view === 'table') $('ov_tablewrap').innerHTML = tableOf(KT.export.rowsFor('activity_camp', campX()));
    const notes = [];
    if (m.undated.count || m.undated.amount) notes.push(m.measure === 'spend' ? O.undatedSpend(R.baht(m.undated.amount)) : O.undatedPosts(m.undated.count));
    if (m.outside) notes.push(O.outsideChart(m.outside));
    $('ov_actFoot').textContent = notes.join(' · ');
    ov.lastModel = m;
  }
  /* square stacked columns (≤ 24px, 2px gaps) · planned = 40% + outline · Phase strip above · 2-row x axis · dashed Today line · one peak label */
  function renderActivityChart(svg, box, tip, md, H) {
    tip.classList.remove('show');
    const cGrid = css('--grid'), cAxis = css('--muted'), cSurf = css('--surface'), cAcc = css('--accent');
    const W = Math.max(300, box.clientWidth || 800), m = { l: md.measure === 'spend' ? 48 : 34, r: 12, t: 30, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    const bins = md.bins;
    if (!bins.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="axis">${esc(O.noPosts)}</text>`; return; }
    const step = md.gran === 'week' ? 7 : 1, start = bins[0].key, band = iw / bins.length, bw = Math.max(2, Math.min(24, band * 0.72));
    const xOf = iso => m.l + R.dayDiff(iso, start) / step * band;
    const maxV = Math.max(...bins.map(b => b.total), 0);
    const yStep = md.measure === 'spend' ? R.niceStep(Math.max(1, maxV) / 4) : Math.max(1, R.niceStep(Math.max(1, maxV) / 4));
    const yMax = yStep * Math.max(1, Math.ceil(maxV * 1.12 / yStep)), y = v => m.t + ih - (v / yMax) * ih;
    let g = `<defs><pattern id="ovTex" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${css('--series-grey')}"/><rect width="2" height="6" fill="${cSurf}" opacity=".7"/></pattern>` +
      `<pattern id="ovHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="2" height="5" fill="${css('--text')}" opacity=".55"/></pattern></defs>`;
    for (let v = 0; v <= yMax + 1e-9; v += yStep) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${cGrid}" stroke-width="1"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${esc(fmtV(v, md.measure))}</text>`;
    let strip = '';
    const cSep = css('--muted');
    /* CR-13 §4.3 — each Phase in its own grey (= its dot in Phase budget) · 6px · 2px apart · the name in the secondary ink after an 8px dot */
    md.strip.forEach(p => {
      const a = Math.max(m.l, xOf(p.from)), z = Math.min(W - m.r, xOf(R.addDays(p.to, 1))); if (z <= a) return;
      const col = U.phaseColor(null, p.key), lab = stripLabel(p.label, z - a - 16);
      strip += `<rect x="${a + 1}" y="${m.t - 12}" width="${Math.max(1, z - a - 2)}" height="6" fill="${col}"><title>${esc(`${p.label} · ${R.dmy(p.from)} – ${R.dmy(p.to)}`)}</title></rect>` +
        (lab ? `<circle cx="${a + 6}" cy="${m.t - 20}" r="4" fill="${col}"/><text x="${a + 13}" y="${m.t - 16}" class="axis strip-l">${esc(lab)}</text>` : '');
      const xs = xOf(p.from);
      if (xs > m.l + 1 && xs < W - m.r) strip += `<line class="phase-sep" x1="${xs}" x2="${xs}" y1="${m.t - 12}" y2="${m.t + ih}" stroke="${cSep}" stroke-opacity=".55" stroke-dasharray="3 3"/>`;
    });
    md.overlaps.forEach(o => { const a = Math.max(m.l, xOf(o.from)), z = Math.min(W - m.r, xOf(R.addDays(o.to, 1))); if (z > a) strip += `<rect x="${a}" y="${m.t - 12}" width="${z - a}" height="6" fill="url(#ovHatch)"><title>${esc(C.msg.phaseOverlap(R.phaseName(state(), o.a), R.phaseName(state(), o.b), dm(o.from), dm(o.to)))}</title></rect>`; });
    let marks = '', hits = '';
    bins.forEach((b, i) => {
      const x = m.l + band * i + band / 2 - bw / 2; let acc = 0;
      const segs = [];
      md.series.forEach(sr => { const v = b.series[sr.key]; if (!v) return; if (v.posted) segs.push({ sr, v: v.posted, planned: false }); if (v.planned) segs.push({ sr, v: v.planned, planned: true }); });
      segs.forEach((sg, j) => {
        const y0 = y(acc), y1 = y(acc + sg.v); acc += sg.v;
        const h = Math.max(0, y0 - y1 - (j ? 2 : 0));   // 2px surface gap between stacked segments
        if (h <= 0) return;
        const fill = sg.sr.grey ? 'url(#ovTex)' : sg.sr.color, attrs = sg.planned ? `fill="${fill}" fill-opacity=".4" stroke="${sg.sr.color}" stroke-width="1"` : `fill="${fill}"`;
        marks += `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" ${attrs}/>`;
      });
      hits += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" tabindex="0" aria-label="${esc(binTitle(b.key, md.gran))}: ${esc(fmtV(b.total, md.measure))}"/>`;
    });
    /* x axis (CR-09 §4.2): one row from timeAxis — each tick has its grid line and its label sits on it, thinned evenly */
    const xOfD = d => m.l + (R.dayDiff(d, start) + (md.gran === 'day' ? 0.5 : 0)) / step * band;
    const pts = md.axis.ticks.map(tk => ({ tk, x: xOfD(tk.date) })).filter(p => p.x >= m.l - 0.5 && p.x <= W - m.r + 0.5);
    const gap = pts.length > 1 ? Math.min(...pts.slice(1).map((p, i) => p.x - pts[i].x)) : Infinity, every = Math.max(1, Math.ceil((Math.max(0, ...pts.map(p => p.tk.label.length * 6 + 2)) + 8) / gap));
    let labels = '';
    pts.forEach((p, i) => {
      g += `<line x1="${p.x}" x2="${p.x}" y1="${m.t}" y2="${m.t + ih}" stroke="${cGrid}"/>`;
      if (i % every) return;
      const w = p.tk.label.length * 6 + 2, anchor = p.x - w / 2 < m.l ? 'start' : p.x + w / 2 > W - m.r ? 'end' : 'middle';
      labels += `<text x="${p.x}" y="${H - m.b + 16}" text-anchor="${anchor}" class="axis">${esc(p.tk.label)}</text>`;
    });
    const peak = bins.reduce((a, b) => (b.total > a.total ? b : a), bins[0]);
    if (peak.total > 0) { const i = bins.indexOf(peak); labels += `<text class="peak" x="${m.l + band * i + band / 2}" y="${y(peak.total) - 6}" text-anchor="middle">${esc(fmtV(peak.total, md.measure))}</text>`; }
    let now = '';
    if (md.td >= bins[0].key && md.td <= R.addDays(bins[bins.length - 1].key, step - 1)) {
      const tx = xOf(md.td) + band / step / 2;
      now = `<line x1="${tx}" x2="${tx}" y1="${m.t - 4}" y2="${m.t + ih}" stroke="${cAcc}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${tx + 4}" y="${m.t + 10}" class="axis today-l">${esc(O.today)}</text>`;
    }
    svg.innerHTML = g + strip + `<g>${hits}</g><g style="pointer-events:none">${marks}</g><line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="${cAxis}" stroke-width="1"/>` + labels + now;
    const show = i => {
      const b = bins[i]; tip.textContent = '';
      const add = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; tip.appendChild(el); return el; };
      add('d', binTitle(b.key, md.gran));
      const ph = md.strip.find(p => p.from <= R.addDays(b.key, step - 1) && p.to >= b.key); if (ph) add('d', O.phaseTip(ph.label));
      md.series.forEach(sr => { const v = b.series[sr.key]; if (!v) return;
        const r = document.createElement('div'); r.className = 'r'; const sp = document.createElement('span'), sw = document.createElement('i'); sw.style.background = sr.color; sp.appendChild(sw);
        sp.appendChild(document.createTextNode(sr.label)); const bb = document.createElement('b'); bb.textContent = fmtV(v.posted + v.planned, md.measure); r.appendChild(sp); r.appendChild(bb); tip.appendChild(r); });
      add('r tot', `${O.colTotal} ${fmtV(b.total, md.measure)}`);
      add('d', O.postedPlanned(fmtV(b.posted, md.measure), fmtV(b.planned, md.measure)));
      const rect = box.getBoundingClientRect(), scale = rect.width / W; let left = (m.l + band * i + band / 2) * scale + 12;
      if (left + 190 > rect.width) left = (m.l + band * i + band / 2) * scale - 200;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px'; tip.classList.add('show');
    };
    svg.querySelectorAll('.hit').forEach(h => {
      const i = +h.dataset.i;
      h.addEventListener('pointerenter', () => show(i)); h.addEventListener('focus', () => show(i));
      h.addEventListener('pointerleave', () => tip.classList.remove('show')); h.addEventListener('blur', () => tip.classList.remove('show'));
    });
  }
  /* Phase budget — one full row (CR-07 §4.2): Phase (full name) · Period · Budget · Committed · Used % · Remaining · Pending · Posts */
  function renderPhaseBudget(s) {
    const pb = R.phaseBudgetRows(s, ov.camp.campaign), money = v => (v == null ? '—' : R.baht(v));
    const cid = ov.camp.campaign;
    /* CR-18 §4.3 — "+฿x pending" next to a budget that waits (the Campaign · a Phase · Unallocated) */
    const row = (name, dot, period, budget, pct, committed, pending, posts, cls, pkey) => {
      const m = R.moneyOf(budget, committed, pending, 0), tag = KT.budget.pendingTagHTML(cid, pkey);
      return `<tr class="${cls || ''}"><td class="pname">${dot}<span>${esc(name)}</span></td><td class="nowrap">${period}</td>` +
        `<td class="num" title="${esc(pct == null ? '' : O.pctOfCampaign(Math.round(pct)))}">${money(budget)}${tag ? `<div>${tag}</div>` : ''}</td><td class="num"><span class="${m.remaining < 0 ? 'late' : ''}">${R.baht(committed)}</span></td>` +
        `<td>${budget != null ? usedBar(m.usedPct) : '<span class="muted">—</span>'}</td><td class="num">${remainingText(m.remaining)}</td><td class="num muted">${pending ? R.baht(pending) : '—'}</td><td class="num">${posts == null ? '' : R.fmtNum(posts)}</td></tr>`;
    };
    const rows = pb.rows.map(r => row(R.phaseName(s, r.phase.phase_id), `<span class="dotc" style="background:${colorOf({ kind: 'phase', key: r.phase.phase_id })}"></span>`, `${esc(dm(r.phase.start_date))}–${esc(dm(r.phase.end_date))}`,
      r.budget, r.budgetPct, r.committed, r.shortlist, r.posts, r.phase.phase_id === ov.camp.phase ? 'selected' : '', r.phase.phase_id)).join('') +
      /* CR-18 §4.3 — the Campaign budget no Phase has: a grey row under the last Phase */
      ((un => (un > 0 || R.pendingPhaseDelta(s, cid, R.UNALLOCATED) ? `<tr class="extra unal"><td class="pname"><span>${esc(O.unallocatedRow)}</span></td><td></td><td class="num">${R.baht(Math.max(0, un || 0))}${KT.budget.pendingTagHTML(cid, R.UNALLOCATED) ? `<div>${KT.budget.pendingTagHTML(cid, R.UNALLOCATED)}</div>` : ''}</td><td></td><td></td><td></td><td></td><td></td></tr>` : ''))(R.unallocatedOf(s, cid))) +
      pb.extra.map(x => `<tr class="click extra${x.key === R.NEEDS ? ' warn' : ''}" data-godeals="${esc(x.key)}"><td class="pname"><span>${esc(x.key === R.NEEDS ? O.needsPhase : O.unscheduled)}</span>` +
        (x.key === R.UNSCHEDULED && x.deals ? `<div class="muted small pb-nodate">${esc(O.unscheduledDeals(x.deals))} · <button type="button" class="link" data-godeals="${esc(x.key)}">${esc(O.setDates)}</button></div>` : '') + `</td><td></td><td></td><td class="num">${R.baht(x.committed)}</td><td></td><td></td><td></td><td class="num">${x.posts ? R.fmtNum(x.posts) : ''}</td></tr>`).join('');
    const t = pb.total;
    $('ov_pbudget').innerHTML = `<div class="tablewrap"><table class="tbl compact-sm pbudget"><thead><tr><th class="pname">${esc(O.colPhase)}</th><th>${esc(O.colPeriod)}</th><th class="num">${esc(MN.budget.h)}</th>` +
      `<th class="num">${esc(MN.committed.h)} ${info(MN.committed)}</th><th>${esc(MN.used.h)} ${info(MN.used)}</th><th class="num">${esc(MN.remaining.h)} ${info(MN.remaining)}</th><th class="num">${esc(MN.pending.h)} ${info(MN.pending)}</th><th class="num">${esc(O.colPosts)}</th></tr></thead><tbody>${rows}` +
      row(O.campaignTotal, '', '', t.budget, null, t.committed, t.shortlist, t.posts, 'total', null) + `</tbody></table></div>`;
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-allocplan]'); if (b && KT.planner) KT.planner.open({ campaignId: b.dataset.allocplan, opener: b }); });
  /* CR-23 §3.1 — Products given: 4 tiles (no chart) · a row a product (most first) · Product not recorded (grey) · Total (KOLs once) · a row → Shipments */
  function renderProductsGiven(s, scope) {
    const x = R.productsGivenFor(s, scope), box = $('ov_products'); if (!box) return;
    if (!x.shipments) { box.innerHTML = `<div class="hint">${esc(O.noProductsSent)}</div>`; return; }
    const dash = '<span class="muted">—</span>', n = v => (v ? R.fmtNum(v) : dash), pct = v => (x.total ? O.pctOfTotal(Math.round(v / x.total * 100)) : '—');
    const ml = k => R.shipMethodLabel(s.lookups, k);
    const tile = (l, v, sub) => `<div class="kpi pg-tile"><div class="l">${esc(l)}</div><div class="v">${v}</div><div class="sub muted">${esc(sub)}</div></div>`;
    const tiles = `<div class="kpis cards4 pg-tiles">${tile(O.totalPieces, R.fmtNum(x.total), O.toKols(x.kols))}${tile(ml('npd'), R.fmtNum(x.byMethod.npd), pct(x.byMethod.npd))}` +
      `${tile(ml('warehouse'), R.fmtNum(x.byMethod.warehouse), pct(x.byMethod.warehouse))}${tile(ml('self_purchase'), R.fmtNum(x.byMethod.self_purchase), O.reimbursed(R.baht(x.reimbursed)))}</div>`;
    const prod = code => { const p = R.productByCode(s, code); return `<span class="pg-code">${esc(code)}</span>${p ? ` <span>${esc(R.productShort(p))}</span>` : ''}`; };
    const sum = k => x.rows.reduce((a, r) => a + r[k], 0), nr = x.notRecorded;
    const rows = x.rows.map(r => `<tr class="click" tabindex="0" data-goship="${esc(r.tr_code)}" data-toship="${r.toShip}" title="${esc(O.productRowTip)}"><td class="pg-prod">${prod(r.tr_code)}</td><td class="num"><b>${R.fmtNum(r.total)}</b></td>` +
      `<td class="num">${n(r.npd)}</td><td class="num">${n(r.warehouse)}</td><td class="num">${n(r.self_purchase)}</td><td class="num">${n(r.delivered)}</td><td class="num">${n(r.toShip)}</td><td class="num">${R.fmtNum(r.kols)}</td></tr>`).join('') +
      (nr ? `<tr class="click extra pg-none" tabindex="0" data-goship="__none" data-toship="${nr.toShip}" title="${esc(O.productRowTip)}"><td class="pg-prod">${esc(O.notRecorded)} <span class="muted small">· ${esc(O.notRecordedN(nr.shipments))}</span></td>` +
        `<td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${R.fmtNum(nr.kols)}</td></tr>` : '') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td class="num">${R.fmtNum(x.total)}</td><td class="num">${n(x.byMethod.npd)}</td><td class="num">${n(x.byMethod.warehouse)}</td><td class="num">${n(x.byMethod.self_purchase)}</td>` +
      `<td class="num">${n(sum('delivered'))}</td><td class="num">${n(sum('toShip'))}</td><td class="num">${R.fmtNum(x.kols)}</td></tr>`;
    box.innerHTML = tiles + `<div class="tablewrap"><table class="tbl compact-sm pgtbl"><thead><tr><th>${esc(O.colProduct)}</th><th class="num">${esc(O.colTotal)}</th><th class="num">${esc(ml('npd'))}</th><th class="num">${esc(ml('warehouse'))}</th>` +
      `<th class="num">${esc(ml('self_purchase'))}</th><th class="num">${esc(O.colDelivered)}</th><th class="num">${esc(O.colToShip)}</th><th class="num">${esc(O.colKols)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  /* CR-23 §3.7 — Cancelled deals: "n cancelled · ฿x released" + a chip a reason (a click keeps that reason) · the table (newest first) · a row → the Deal modal */
  function renderCancelled(s, scope) {
    const x = R.cancelledReportFor(s, scope), box = $('ov_cancelled'), P = ov.camp; if (!box) return;
    if (!x.n) { box.innerHTML = `<div class="hint">${esc(O.noCancelled)}</div>`; return; }
    if (P.reason && !x.reasons.some(r => r.key === P.reason)) P.reason = '';
    const dash = '<span class="muted">—</span>', list = P.reason ? x.rows.filter(r => r.key === P.reason) : x.rows;
    const chips = x.reasons.map(r => `<button type="button" class="chipbtn${P.reason === r.key ? ' on' : ''}" data-cxreason="${esc(r.key)}" aria-pressed="${P.reason === r.key}">${esc(r.label)} <span class="n">${r.n}</span></button>`).join('');
    box.innerHTML = `<div class="cx-top"><b>${esc(O.cancelledLine(R.fmtNum(x.n), R.baht(x.released)))}</b><span class="cx-chips">${chips}</span></div>` +
      `<div class="tablewrap"><table class="tbl compact-sm cxtbl"><thead><tr><th>${esc(O.colKol)}</th><th>${esc(O.colDealId)}</th><th>${esc(O.colCancelledAt)}</th><th>${esc(O.colCancelledOn)}</th>` +
      `<th>${esc(O.colReason)}</th><th>${esc(O.colDetail)}</th><th class="num">${esc(O.colValue)}</th><th>${esc(O.colAssigned)}</th></tr></thead><tbody>` +
      list.map(r => { const k = R.kolById(s, r.deal.kol_id) || {};
        return `<tr class="click" tabindex="0" data-cxdeal="${esc(r.deal.deal_id)}"><td><span class="cx-kol">${k.kol_id ? U.avatarHTML(k, 'sm') : ''}<b class="nm">${esc(k.display_name || r.deal.kol_id)}</b></span></td><td class="nowrap">${esc(r.deal.deal_id)}</td>` +
          `<td class="nowrap">${r.stage ? esc(r.stage) : dash}</td><td class="nowrap">${r.date ? esc(R.dmy(r.date)) : dash}</td><td>${esc(r.label)}</td><td class="cx-detail"${r.detail ? ` title="${esc(r.detail)}"` : ''}>${r.detail ? esc(r.detail) : dash}</td>` +
          `<td class="num">${r.value == null ? dash : R.baht(r.value)}</td><td>${r.pic ? esc(r.pic) : dash}</td></tr>`; }).join('') + `</tbody></table></div>`;
  }
  /* CR-26 §3.4 — Team workload of this Campaign (and Phase): a row a person (R.teamWorkload — Operations › Team load counts open deals with it) ·
     most open deals first · Not assigned + Assign · Total · a row → Deals of this Campaign and that person */
  function renderCampaignWorkload(s, scope) {
    const T = O.team, rows = R.teamWorkload(s, R.scopeDeals(s, scope, R.phaseIndex(s)), td()), t = R.teamWorkloadTotal(rows), mine = R.picName(U.me());
    const n = (v, cls) => `<td class="num${cls && v ? ' ' + cls : ''}">${v ? R.fmtNum(v) : '<span class="muted">0</span>'}</td>`;
    const th = (k, num) => `<th${num ? ' class="num"' : ''}${T.colTip[k] ? ` title="${esc(T.colTip[k])}"` : ''}>${esc(T.col[k])}</th>`;
    const cells = r => n(r.partners) + n(r.open) + n(r.posted) + n(r.postOverdue, 'late') + n(r.noPostDue) + n(r.cancelled) + `<td class="num">${R.baht(r.committed)}</td>` + n(r.docs);
    $('ov_cwork').innerHTML = !rows.length ? `<div class="hint">${esc(T.empty)}</div>` : `<div class="tablewrap"><table class="tbl compact-sm wl teamwl"><thead><tr>${th('pic')}` +
      ['partners', 'open', 'posted', 'postOverdue', 'noPostDue', 'cancelled', 'committed', 'docs'].map(k => th(k, 1)).join('') + `</tr></thead><tbody>` +
      rows.map(r => `<tr class="click${r.pic && r.pic === mine ? ' selected' : ''}" tabindex="0" data-goteam="${esc(r.pic || '__none')}" title="${esc(T.tip)}"><td>` +
        (r.pic ? `<span class="picplain"><span class="av sm">${esc(initials(r.pic))}</span><span class="nm">${esc(r.pic)}</span></span>`
          : `<span class="tw-na"><span class="muted">${esc(T.notAssigned)}</span> <button type="button" class="link small" data-goteam="__none" title="${esc(T.assignTip)}">${esc(T.assign)}</button></span>`) + `</td>${cells(r)}</tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td>${cells(t)}</tr></tbody></table></div>`;
  }
  function expand() {
    if (ov.tab === 'all') { expandTl(); return; }   // CR-19 §4.3: Show all of the Campaign timeline
    const md = ov.lastModel; if (!md) return;
    openDialog(`<div class="dlg-h">${esc(O.activityTitle)} · ${esc(R.dmy(md.from))} – ${esc(R.dmy(md.to))}</div><div class="dlg-b"><div class="legend">${$('ov_legend').innerHTML}</div><div class="chartbox" id="ovx_box"><svg id="ovx_svg" role="img"></svg><div class="tip" id="ovx_tip"></div></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, true);
    $('ovx_close').addEventListener('click', closeDialog);
    renderActivityChart($('ovx_svg'), $('ovx_box'), $('ovx_tip'), md, 440);
  }
  /* ===================== Tab 3 — Operations = Work queue (CR-24) ===================== */
  /* Assigned to (you when a PIC · Everyone for Admin / KOL Manager) · Campaigns (approved · default: the ones not Complete) · Waiting on (All · Us · KOL) ·
     Summary (5 tiles — a click keeps those rows) · Work queue by due (Overdue · Today · This week · Later · No due date — each folds) with the work on its
     row · Stage flow (a click keeps that stage) · Team load (Everyone) · Data to fix — the filters and the folds are remembered per person */
  const WQ = () => O.wq;
  const opsPicKey = () => 'opspic_' + (U.userId() || '');
  const opsKey = k => `ops${k}_${U.userId() || ''}`;
  const isManager = () => ['admin', 'kol_manager'].includes((U.actor() || {}).role);
  const opsPicNow = () => R.opsPic(state(), U.me(), ov.ops.pic != null && ov.ops.picFor === U.userId() ? ov.ops.pic : pref.get(opsPicKey(), ''));   // a Switch user brings that person's own choice
  const personOf = p => (p === '__all' ? '' : p);
  const picLabelOf = p => (p === '__none' ? WQ().unassigned : p === '__all' ? WQ().everyone : p);
  const readJSON = (k, dflt) => { try { const v = JSON.parse(pref.get(k, 'null')); return v == null ? dflt : v; } catch (e) { return dflt; } };
  /* the Campaigns kept: the ones picked (remembered) · else the default (approved, not Complete) */
  function opsCamps() {
    const s = state(), all = R.opsCampaigns(s).map(c => c.campaign_id);
    if (ov.ops.campsFor !== U.userId()) { const v = readJSON(opsKey('camps'), null); ov.ops.camps = Array.isArray(v) ? v : null; ov.ops.campsFor = U.userId(); }
    return ov.ops.camps ? ov.ops.camps.filter(id => all.includes(id)) : R.opsCampaignsDefault(s, td());
  }
  const setCamps = v => { ov.ops.camps = v; ov.ops.campsFor = U.userId(); pref.set(opsKey('camps'), v ? JSON.stringify(v) : 'null'); };
  const waitingNow = () => { if (ov.ops.waitFor !== U.userId()) { const v = pref.get(opsKey('wait'), ''); ov.ops.waiting = ['', 'us', 'kol'].includes(v) ? v : ''; ov.ops.waitFor = U.userId(); } return ov.ops.waiting; };
  const foldedNow = () => { if (ov.ops.foldFor !== U.userId()) { const v = readJSON(opsKey('fold'), []); ov.ops.folded = new Set(Array.isArray(v) ? v : []); ov.ops.foldFor = U.userId(); } return ov.ops.folded; };
  const opsOpts = () => ({ person: personOf(opsPicNow()), campaignIds: opsCamps(), waitingOn: waitingNow(), today: td(), viewer: U.actor() });
  const opsFilter = () => { const p = opsPicNow(); return { campaign: '', pic: p === '__all' ? '' : p }; };   // (the {pic, campaign} the older helpers take)
  function choosePic(p) { Object.assign(ov.ops, { pic: p || null, picFor: U.userId(), tile: '', stage: '' }); pref.set(opsPicKey(), p || ''); renderOps(); }
  /* §4.7 — the tab says "Operations" (the person is in the filter) */
  function opsTabLabel() { const b = document.querySelector('#ov_tabs [data-tab2="ops"]'); if (b) b.textContent = O.tabs.ops; }
  const campLabel = () => { const W = WQ(), n = opsCamps().length, all = R.opsCampaigns(state()).length; return !ov.ops.camps ? W.campDefault : n === all ? W.campAll(all) : W.campN(n); };
  function renderOps() {
    const s = state(), W = WQ(), p = opsPicNow(), me = R.picName(U.me()), mine = me && R.picNames(s).includes(me) ? me : null, wait = waitingNow();
    opsTabLabel();
    const picked = new Set(opsCamps()), def = new Set(R.opsCampaignsDefault(s, td()));
    const stWord = c => C.phaseStatus[R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, c.campaign_id), td())] || '';
    $('ov_tools').innerHTML = `<label class="tlab">${esc(W.assigned)} <select id="ov_opic" aria-label="${esc(W.assigned)}">` +
        (isManager() || p === '__all' ? `<option value="__all"${p === '__all' ? ' selected' : ''}>${esc(W.everyone)}</option>` : '') +
        R.picNames(s).map(n => `<option value="${esc(n)}"${n === p ? ' selected' : ''}>${esc(n)}</option>`).join('') + `<option value="__none"${p === '__none' ? ' selected' : ''}>${esc(W.unassigned)}</option></select></label>` +
      (mine && p !== mine ? `<button type="button" class="btn small" data-backme>${esc(O.backToMe)}</button>` : '') +
      `<details class="menu wq-camps" id="ov_ocamps"><summary class="btn">${esc(W.campaigns)}: <span id="ov_ocampl">${esc(campLabel())}</span></summary><div class="popover wq-camppop">` +
        `<div class="btns"><button type="button" class="btn small" data-wqcamp="default">${esc(W.campDefaultBtn)}</button><button type="button" class="btn small" data-wqcamp="all">${esc(W.campAllBtn)}</button></div>` +
        R.opsCampaigns(s).map(c => `<label class="tick"><input type="checkbox" data-wqc="${esc(c.campaign_id)}"${picked.has(c.campaign_id) ? ' checked' : ''}> ${esc(c.campaign_name)}${def.has(c.campaign_id) ? '' : ` <span class="muted small">· ${esc(stWord(c))}</span>`}</label>`).join('') + `</div></details>` +
      `<span class="tlab wq-wl">${esc(W.waiting)}</span><div class="seg wq-wait" role="group" aria-label="${esc(W.waiting)}">${['', 'us', 'kol'].map(k => `<button type="button" data-wqwait="${k}" class="${wait === k ? 'on' : ''}" aria-pressed="${wait === k}">${esc(W.w[k || 'all'])}</button>`).join('')}</div>` +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-export="ops" title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>`;
    renderOpsBody();
  }
  /* the page under the filters (a tile · a stage · a fold · a done piece of work redraw only this) */
  function renderOpsBody() {
    const s = state(), W = WQ(), o = opsOpts(), all = R.workQueue(s, o), sum = R.workSummary(all), t = ov.ops.tile || '', stg = ov.ops.stage || '';
    const rows = all.filter(r => (!t || R.workTileHas(t, r)) && (!stg || r.stage === stg));
    ov.ops.byKey = new Map(all.map(r => [r.key, r]));
    const tile = (k, n, sub) => `<button type="button" class="wq-tile t-${k}${t === k ? ' on' : ''}${n ? '' : ' zero'}" data-wqtile="${k}" aria-pressed="${t === k}"><span class="n">${R.fmtNum(n)}</span><span class="t">${esc(W.tiles[k])}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</button>`;
    const usParts = ['shipment', 'payment', 'metrics', 'close', 'approval'].filter(k => sum.usBy[k]).map(k => W.usPart[k](sum.usBy[k])).join(' · ');
    const tiles = `<div class="wq-tiles">${tile('overdue', sum.overdue)}${tile('week', sum.week)}${tile('none', sum.none, sum.noneKol ? W.noneKol(sum.noneKol) : '')}${tile('stuck', sum.stuck)}${tile('us', sum.us, usParts)}</div>`;
    const everyone = !o.person, team = everyone && isManager() ? R.teamLoad(s, all, o) : null, fix = R.dataToFix(s, o);   // CR-26 §3.4: open deals by R.teamWorkload
    ov.ops.fix = fix;
    const chip = t || stg ? `<span class="wq-fchip">${esc(t ? W.tiles[t] : stg)}<button type="button" class="icon-btn" data-wqclear aria-label="${esc(W.clearFilter)}" title="${esc(W.clearFilter)}">${ICON.close}</button></span>` : '';
    $('ov_body').innerHTML = tiles + `<div class="card wq-card"><div class="card-head"><h3>${esc(W.title)} <span class="muted">${R.fmtNum(rows.length)}</span></h3>${chip}<div class="btns ov-ctl">${dlMenu('workqueue')}</div></div>${queueHTML(s, rows, everyone)}</div>` +
      `<div class="card wq-flowcard"><div class="card-head"><h3>${esc(W.flowTitle)}</h3></div>${flowHTML(R.stageFlow(s, o))}</div>` +
      (team ? `<div class="card"><div class="card-head"><h3>${esc(W.teamTitle)}</h3></div>${teamHTML(team)}</div>` : '') + fixHTML(s, fix);
  }
  /* §4.3 — a section a due group (an empty one is left out) · a row a piece of work */
  function queueHTML(s, rows, showPic) {
    const W = WQ(), t0 = td();
    if (!rows.length) return `<div class="hint wq-empty">${esc(ov.ops.tile || ov.ops.stage ? W.emptyFilter : W.empty)}</div>`;
    const folded = foldedNow();
    return R.WORK_BUCKETS.map(b => { const list = rows.filter(r => r.bucket === b); if (!list.length) return '';
      return `<details class="wq-sec s-${b}" data-wqsec="${b}"${folded.has(b) ? '' : ' open'}><summary><span class="chev">${ICON.chevron}</span><b>${esc(W.sec[b])}</b> <span class="n">${R.fmtNum(list.length)}</span></summary>` +
        `<div class="tablewrap"><table class="tbl compact-sm wqtbl"><thead><tr><th>${esc(W.col.due)}</th><th>${esc(W.col.kol)}</th><th>${esc(W.col.campaign)}</th><th>${esc(W.col.stage)}</th><th>${esc(W.col.action)}</th>` +
        `<th>${esc(W.col.waiting)}</th><th class="num">${esc(W.col.inStage)}</th>${showPic ? `<th>${esc(W.col.pic)}</th>` : ''}<th></th></tr></thead><tbody>` +
        list.map(r => rowHTML(s, r, showPic, t0)).join('') + `</tbody></table></div></details>`; }).join('');
  }
  const reqTitle = (s, q) => [R.campaignName(s, q.campaign_id), q.phase_id ? R.phaseName(s, q.phase_id) : ''].filter(Boolean).join(' › ');
  const canSet = (s, r) => (r.kind === 'shipment' ? R.canEditShip(U.actor(), r.deal, r.ref) : can('deal.edit') && !R.campaignCancelled(s, r.campaign_id));
  function rowHTML(s, r, showPic, t0) {
    const W = WQ(), k = r.kol_id ? R.kolById(s, r.kol_id) || {} : null, dash = '<span class="muted">—</span>';
    const due = r.due ? (r.bucket === 'overdue' ? `<span class="late">${esc(W.dueLate(R.dayDiff(t0, r.due)))}</span>` : r.bucket === 'today' ? `<b class="wq-today">${esc(W.dueToday)}</b>` : `<span title="${esc(R.dmy(r.due))}">${esc(W.dueIn(R.dayDiff(r.due, t0)))}</span>`) : dash;
    const setDate = !r.due && r.field && canSet(s, r) ? ` <button type="button" class="link small" data-wqset="${esc(r.key)}">${esc(W.btn.setDate)}</button>` : '';
    const who = r.kind === 'approval' ? `<b class="nm">${esc(W.approval)}</b>` : r.kind === 'close' ? `<b class="nm">${esc(W.campaignWord)}</b>` : k ? `<span class="wq-kol">${k.kol_id ? U.avatarHTML(k, 'sm') : ''}<b class="nm">${esc(k.display_name || r.kol_id)}</b></span>` : dash;
    const action = esc(R.workActionText(r)) + (r.kind === 'approval' ? ` <span class="muted small">· ${esc(reqTitle(s, r.ref))}</span>` : '');
    /* CR-26 §3.5 — Pay KOL / Enter metrics: days since the post (not days in the stage) */
    const inStage = (r.sincePost != null ? `<span class="wq-sp">${esc(W.sincePost(r.sincePost))}</span>` : r.inStage != null ? esc(W.days(r.inStage)) : dash) + (r.stuck ? ` <span class="chip wq-stuck">${esc(W.stuck(r.inStage))}</span>` : '');
    return `<tr class="click wq-row k-${r.kind}" tabindex="0" data-wqrow="${esc(r.key)}"><td class="nowrap wq-due">${due}${setDate}</td><td class="wq-k">${who}</td><td class="wq-c">${r.campaign_id ? esc(R.campaignName(s, r.campaign_id)) : dash}</td>` +
      `<td class="nowrap wq-st">${r.stage ? esc(r.stage) : dash}</td><td class="wq-a">${action}</td><td class="wq-wc"><span class="chip wq-w w-${r.waiting}">${esc(W.w[r.waiting])}</span></td>` +
      `<td class="num nowrap wq-in">${inStage}</td>${showPic ? `<td class="wq-p">${r.pic ? esc(r.pic) : dash}</td>` : ''}<td class="wq-b">${btnHTML(s, r)}</td></tr>`;
  }
  /* the work on the row (always shown): Move stage · Mark shipped / delivered · Mark paid · Enter metrics · Review */
  function btnHTML(s, r) {
    const W = WQ(), b = (label, on) => (on ? `<button type="button" class="btn small" data-wqact="${esc(r.key)}">${esc(label)}</button>` : '');
    if (r.kind === 'deal') return b(W.btn.move, can('deal.edit') && !R.campaignCancelled(s, r.campaign_id));
    if (r.kind === 'shipment') return b(r.action === 'ship' ? W.btn.shipped : W.btn.delivered, R.canShipWork(U.actor()));
    /* CR-26 §3.5 — Mark paid on the row (the CR-17 popover): who may, as on Payments — Simple mode: Admin · KOL Manager · Accounting · Staff on their own deals */
    if (r.kind === 'payment') return b(W.btn.paid, R.isSimple(s, 'payments') ? R.canPaySimple(s, U.actor(), r.ref) && r.ref.status !== 'on_hold' : can('payment.paid'));
    if (r.kind === 'metrics') return b(W.btn.metrics, can('deal.edit'));
    if (r.kind === 'gencode') return b(W.btn.gencode, can('deal.edit') && !R.campaignCancelled(s, r.campaign_id));   // CR-30
    if (r.kind === 'close') return b(R.canApprove(U.actor()) ? W.btn.closeCamp : W.btn.requestClose, can('campaign.draft') || can('campaign.edit'));   // CR-29 (S)
    return b(W.btn.review, R.canApprove(U.actor()));
  }
  /* §4.4 — Shortlist → … → Approve: deals · avg days · stuck */
  function flowHTML(f) {
    const W = WQ(), stg = ov.ops.stage || '';
    return `<div class="wq-flow">` + f.steps.map(x => `<button type="button" class="wq-step${stg === x.step.sub_status ? ' on' : ''}${x.n ? '' : ' zero'}" data-wqstage="${esc(x.step.sub_status)}" aria-pressed="${stg === x.step.sub_status}" title="${esc(W.flowTip)}">` +
      `<span class="sn">${esc(x.step.sub_status)}</span><span class="n">${R.fmtNum(x.n)}</span><span class="avg">${x.avg == null ? '&nbsp;' : esc(W.avg(x.avg))}</span><span class="stk${x.stuck ? ' on' : ''}">${x.stuck ? esc(W.stuckN(x.stuck)) : '&nbsp;'}</span></button>`).join('') +
      `</div><div class="foot-note">${esc(W.flowFoot(R.fmtNum(f.posted), R.fmtNum(f.cancelled)))}</div>`;
  }
  /* §4.5 — a row a person (Everyone) · a click = that person */
  function teamHTML(list) {
    const W = WQ(), T = W.teamCol, n = v => (v ? R.fmtNum(v) : '<span class="muted">0</span>');
    return `<div class="tablewrap"><table class="tbl compact-sm wqteam"><thead><tr><th>${esc(T.pic)}</th><th class="num">${esc(T.open)}</th><th class="num">${esc(T.overdue)}</th><th class="num">${esc(T.week)}</th><th class="num">${esc(T.none)}</th><th class="num">${esc(T.stuck)}</th><th class="num">${esc(T.us)}</th></tr></thead><tbody>` +
      list.map(w => `<tr class="click" tabindex="0" data-wqpic="${esc(w.pic || '__none')}" title="${esc(W.teamTip)}"><td>${w.pic ? `<span class="picplain"><span class="av sm">${esc(initials(w.pic))}</span><span class="nm">${esc(w.pic)}</span></span>` : `<span class="muted">${esc(W.unassigned)}</span>`}</td>` +
        `<td class="num">${n(w.open)}</td><td class="num${w.overdue ? ' late' : ''}">${n(w.overdue)}</td><td class="num">${n(w.week)}</td><td class="num">${n(w.none)}</td><td class="num">${n(w.stuck)}</td><td class="num">${n(w.us)}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  /* §4.6 — Data to fix (open when 10 or fewer) · Fix → the field */
  function fixHTML(s, rows) {
    const W = WQ(), n = rows.length, kolOf = d => (d ? (R.kolById(s, d.kol_id) || {}).display_name || d.kol_id : '');
    const text = x => (x.kind === 'missing' ? W.fixKind.missing(x.keys.map(k => C.deal.missingKey[k] || k).join(' · ')) : x.kind === 'postOutside' ? x.text : W.fixKind[x.kind] || C.overview.healthItems[x.kind] || x.kind);
    const who = x => (x.deal ? `<b class="nm">${esc(kolOf(x.deal))}</b> <span class="muted small">${esc(x.deal.deal_id)}</span>` : x.shipment ? `<span class="muted small">${esc(x.shipment.shipment_id)}</span>`
      : x.campaign ? `<b>${esc(x.campaign.campaign_name)}</b>` : x.phase ? `<b>${esc(R.campaignName(s, x.phase.campaign_id))} › ${esc(R.phaseName(s, x.phase.phase_id))}</b>` : '');
    return `<details class="card wq-fix" id="ov_wqfix"${n && n <= 10 ? ' open' : ''}><summary><span class="chev">${ICON.chevron}</span><b>${esc(W.fixTitle(R.fmtNum(n)))}</b></summary>` +
      (n ? `<ul class="wq-fixlist">${rows.map((x, i) => `<li><span class="wq-fixw">${who(x)}</span><span class="wq-fixt">${esc(text(x))}</span><button type="button" class="link" data-wqfix="${i}">${esc(W.fix)}</button></li>`).join('')}</ul>` : `<div class="hint">${esc(W.fixNone)}</div>`) + `</details>`;
  }
  /* the work of a row */
  function wqAct(btn) {
    const r = ov.ops.byKey && ov.ops.byKey.get(btn.dataset.wqact); if (!r) return;
    const after = () => { if (U.currentTab() === 'overview' && ov.tab === 'ops') renderOpsBody(); };
    if (r.kind === 'deal') { KT.move.open(r.deal.deal_id, r.next, { opener: btn, onDone: after }); return; }
    if (r.kind === 'shipment') { KT.samples.quick(r.action === 'ship' ? 'shipped' : 'delivered', [r.ref.shipment_id], btn, after); return; }
    if (r.kind === 'payment') { KT.screens.payments.markPaid(btn, [r.ref.key], after); return; }
    if (r.kind === 'metrics') { go('deals', { perf: { campaign: r.deal.campaign_id, pic: 'all', status: 'due', q: r.deal.deal_id } }); return; }
    if (r.kind === 'close') { KT.screens.campaign.openClose(r.campaign_id, { opener: btn, after }); return; }   // CR-29 (S)
    if (r.kind === 'gencode') { KT.screens.deals.openDealModal(r.deal.deal_id, { tab: 'shipments', after, source: 'ops' }); KT.screens.deals.gencodeAdd(); return; }   // CR-30: + Add codes over the deal
    if (r.kind === 'approval') KT.approvals.review(r.ref.id, { opener: btn, after });
  }
  /* a row → its deal (the tab of the work) · a shipment with no deal → Shipments · a request → Review */
  function wqOpen(key) {
    const r = ov.ops.byKey && ov.ops.byKey.get(key); if (!r) return;
    const after = () => { if (U.currentTab() === 'overview' && ov.tab === 'ops') renderOpsBody(); };
    if (r.kind === 'approval') { KT.approvals.review(r.ref.id, { after }); return; }
    if (r.kind === 'close') { KT.screens.campaign.openCampaign(r.campaign_id); return; }   // CR-29 (S): the Campaign's panel
    if (!r.deal) { if (r.kind === 'shipment') location.hash = '#shipments/' + r.ref.shipment_id; return; }
    /* CR-28 §3 mapping: Ship samples / metrics → Shipments & posts (no Ship by → that cell) · Pay KOL → Costs & payment · a deal's next date (Set date · Post due) → Timeline */
    const tab = r.kind === 'shipment' || r.kind === 'metrics' || r.kind === 'gencode' ? 'shipments' : r.kind === 'payment' ? 'costs' : r.kind === 'deal' && r.field ? 'timeline' : 'overview';
    const focus = r.kind === 'shipment' && !r.due ? 'ship_by' : r.kind === 'deal' && r.field ? r.field : null;
    KT.screens.deals.openDealModal(r.deal.deal_id, { after, tab, focus, source: 'ops', nav: [...new Set([...document.querySelectorAll('#ov_body tr[data-wqrow]')].map(tr => ((ov.ops.byKey.get(tr.dataset.wqrow) || {}).deal || {}).deal_id).filter(Boolean))] });
  }
  /* "Set date": the date of that step (Script · Draft k · Approve · Post due) or the Ship by — at once, in a small form */
  const fieldLabel = f => (f === 'ship_by_date' ? C.samples.col.shipBy : f === 'expected_script_date' ? C.move.expScript : f === 'expected_approve_date' ? C.move.expApprove : f === 'expected_post_date' ? C.move.postDue : C.move.expDraft(Number(String(f).replace(/\D/g, ''))));
  function wqSetDate(btn) {
    const r = ov.ops.byKey && ov.ops.byKey.get(btn.dataset.wqset); if (!r || !r.field) return;
    const W = WQ(), label = fieldLabel(r.field);
    U.popForm(btn, { title: W.setTitle(label), ok: C.common.save, focus: '.dtext', body: `<div class="field"><label for="wq_date">${esc(label)}</label>${U.dateHTML('id="wq_date"', R.addDays(td(), 1), { label })}</div>`,
      onOk: m => {
        const v = m.querySelector('#wq_date').value; if (!R.isISODate(v)) { U.popFormError(m, C.msg.dateInvalid(label)); return false; }
        if (!U.guard(r.kind === 'shipment' ? 'shipment.edit' : 'deal.edit')) return false;
        const s2 = state(), now = new Date();
        if (r.kind === 'shipment') { const sh = (s2.sample_shipments || []).find(x => x.shipment_id === r.ref.shipment_id); if (sh) s2.deal_events.push(R.updateShipment(sh, { kind: 'ship_by', date: v }, { eventId: U.store.newEventId(), now: now.toISOString(), user: U.userId() })); }
        else setDealDate(s2, r.deal.deal_id, r.field, v, now);
        U.commit(W.dateSet(label, R.dmy(v))); renderOpsBody(); return true;
      } });
  }
  function setDealDate(s, id, field, v, now) {
    const d = s.deals.find(x => x.deal_id === id); if (!d) return;
    const before = Object.assign({}, d); d[field] = v;
    /* a new Post due goes to the posts planned on the old one (as Move stage does) */
    if (field === 'expected_post_date') R.postsOf(s, id).forEach(p => { if (R.isBlank(p.post_date) && (R.isBlank(p.expected_post_date) || p.expected_post_date === before.expected_post_date)) p.expected_post_date = v; });
    const ch = R.diffFields(before, d, [field]); if (ch.length) s.deal_events.push(R.editEvent(before, ch, { eventId: U.store.newEventId(), now, user: U.userId(), note: null }, 'edit'));
  }
  /* Fix → the field in the Deal modal · the Ship by · the Phase Planner */
  function wqFix(i) {
    const x = (ov.ops.fix || [])[i]; if (!x) return;
    const after = () => { if (U.currentTab() === 'overview' && ov.tab === 'ops') renderOpsBody(); }, D2 = KT.screens.deals;
    if (x.kind === 'missing') { D2.openDealModal(x.deal.deal_id, { after, missing: x.keys[0], source: 'ops' }); return; }
    if (x.kind === 'noShipBy') { KT.samples.action('ship_by', [x.shipment.shipment_id], after); return; }
    if (x.kind === 'postOutside') { D2.openDealModal(x.deal.deal_id, { after, postfix: { kind: 'date', post: x.index }, source: 'ops' }); return; }
    if (x.deal) { D2.openDealModal(x.deal.deal_id, { after, tab: 'shipments', source: 'ops' }); return; }
    const cid = x.campaign ? x.campaign.campaign_id : x.phase ? x.phase.campaign_id : null; if (cid) go('campaign', { planCampaign: cid });
  }
  /* a fold of a section, remembered */
  function wqFold(sec) { setTimeout(() => { const f = foldedNow(), k = sec.dataset.wqsec; if (sec.open) f.delete(k); else f.add(k); pref.set(opsKey('fold'), JSON.stringify([...f])); }, 0); }

  /* ===================== events ===================== */
  function onToolsClick(e) {
    const ex = e.target.closest('[data-export]'); if (ex) { exportTab(ex.dataset.export); return; }
    const p = e.target.closest('[data-preset]');
    if (p) {
      if (p.dataset.preset === 'custom') { const [a, z] = allRange(); U.openRange($('ov_crange'), { from: a, to: z, anchor: p }); return; }
      Object.assign(ov.all, { preset: p.dataset.preset, from: '', to: '', custom: null }); savePreset(); renderAll(); return;
    }
    if (e.target.closest('[data-backme]')) { choosePic(R.picName(U.me())); return; }
    /* CR-24 §4.7 — Campaigns: the default (not Complete) · all · Waiting on: All · Us · KOL */
    const wc = e.target.closest('[data-wqcamp]'); if (wc) { setCamps(wc.dataset.wqcamp === 'all' ? R.opsCampaigns(state()).map(c => c.campaign_id) : null); renderOps(); const m = $('ov_ocamps'); if (m) m.open = true; return; }
    const ww = e.target.closest('[data-wqwait]'); if (ww) { ov.ops.waiting = ww.dataset.wqwait; ov.ops.waitFor = U.userId(); pref.set(opsKey('wait'), ov.ops.waiting); renderOps(); return; }
    if (e.target.closest('[data-clearcustom]')) { Object.assign(ov.all, { preset: 'this_year', from: '', to: '', custom: null }); savePreset(); renderAll(); return; }
    if (e.target.closest('[data-ccancel]')) { ov.all.custom = null; renderAll(); return; }
    if (e.target.closest('[data-capply]')) {
      const a = $('ov_cfrom').value, z = $('ov_cto').value;
      if (!R.isISODate(a) || !R.isISODate(z) || z < a) { $('ov_cchk').innerHTML = `<div class="check err">✕ <span>${esc(O.customInvalid)}</span></div>`; return; }
      Object.assign(ov.all, { preset: 'custom', from: a, to: z, custom: null }); savePreset(); renderAll();
    }
  }
  function onToolsChange(e) {
    const t = e.target;
    if (t.id === 'ov_camp') { Object.assign(ov.camp, { campaign: t.value, phase: '' }); renderCampaign(); }
    else if (t.id === 'ov_phase') { Object.assign(ov.camp, { phase: t.value }); renderCampaign(); }
    else if (t.id === 'ov_opic') choosePic(t.value);
    /* CR-24 §4.7 — a Campaign ticked / unticked (the menu stays open) */
    else if (t.dataset.wqc) { const set = new Set(opsCamps()); if (t.checked) set.add(t.dataset.wqc); else set.delete(t.dataset.wqc);
      setCamps(R.opsCampaigns(state()).map(c => c.campaign_id).filter(id => set.has(id))); ov.ops.stage = ''; if ($('ov_ocampl')) $('ov_ocampl').textContent = campLabel(); renderOpsBody(); }
    else if (t.id === 'ov_crange' && R.isISODate(t.dataset.from) && R.isISODate(t.dataset.to)) { Object.assign(ov.all, { preset: 'custom', from: t.dataset.from, to: t.dataset.to, custom: null }); savePreset(); renderAll(); }
  }
  function onBodyClick(e) {
    const D2 = KT.screens.deals;
    const dl = e.target.closest('[data-dl]'); if (dl) { const d = dl.closest('details'); if (d) d.open = false; downloadWidget(dl.dataset.w, dl.dataset.dl); return; }
    const ps = e.target.closest('[data-psort]'); if (ps) { const k = ps.dataset.psort, so = ov.all.sort; ov.all.sort = so && so.key === k ? (so.dir === 'asc' ? { key: k, dir: 'desc' } : null) : { key: k, dir: 'asc' }; renderPortfolio(); return; }
    const tm = e.target.closest('[data-tmix] button'); if (tm) { ov.all.tierMeasure = tm.dataset.v; renderTier(state(), ...allRange()); return; }
    const pmx = e.target.closest('[data-pmix] button'); if (pmx) { ov.all.pillarMeasure = pmx.dataset.v; renderPillar(state(), ...allRange()); return; }
    const pma = e.target.closest('[data-pmixact]'); if (pma) { if (pma.dataset.pmixact === 'table') { ov.all.pillarView = ov.all.pillarView === 'table' ? 'chart' : 'table'; renderPillar(state(), ...allRange()); } else expandPillar(); return; }
    const fmx = e.target.closest('[data-fmix] button'); if (fmx) { ov.all.platformMeasure = fmx.dataset.v; renderPlatform(state(), ...allRange()); return; }   // CR-29 §3.4
    const fma = e.target.closest('[data-fmixact]'); if (fma) { if (fma.dataset.fmixact === 'table') { ov.all.platformView = ov.all.platformView === 'table' ? 'chart' : 'table'; renderPlatform(state(), ...allRange()); } else expandPlatform(); return; }
    const ta = e.target.closest('[data-tact]'); if (ta) { if (ta.dataset.tact === 'table') { ov.all.tierView = ov.all.tierView === 'table' ? 'chart' : 'table'; renderTier(state(), ...allRange()); } else expandTier(); return; }
    const sw = e.target.closest('[data-swim] button'); if (sw) { ov.all.measure = sw.dataset.v; renderAll(); return; }
    const sa = e.target.closest('[data-sact]'); if (sa) { const a = sa.dataset.sact; if (a === 'table') { ov.all.view = ov.all.view === 'table' ? 'chart' : 'table'; renderAll(); } else if (a === 'csv') downloadActivity(); else expand(); return; }
    const gc = e.target.closest('[data-gocamp]'); if (gc) { Object.assign(ov.camp, { campaign: gc.dataset.gocamp, phase: '' }); ov.tab = 'campaign'; render(); return; }
    const ctl = e.target.closest('[data-ctl] button'); if (ctl) { const k = ctl.closest('[data-ctl]').dataset.ctl; ov.camp[k] = ctl.dataset.v; if (k === 'colorBy') pref.set(colorKey(), ctl.dataset.v); renderCampaign(); return; }
    const act = e.target.closest('[data-act]'); if (act) { const a = act.dataset.act; if (a === 'table') { ov.camp.view = ov.camp.view === 'table' ? 'chart' : 'table'; renderCampaign(); } else if (a === 'expand') expand(); return; }
    const gp = e.target.closest('[data-gopic]'); if (gp) { pref.set(opsPicKey(), gp.dataset.gopic); Object.assign(ov.ops, { pic: gp.dataset.gopic, picFor: U.userId(), tile: '', stage: '' }); ov.tab = 'ops'; render(); window.scrollTo(0, 0); return; }
    const gd = e.target.closest('[data-godeals]'); if (gd) { go('deals', { filter: { campaign: ov.camp.campaign, phaseSel: gd.dataset.godeals, pic: 'all' } }); return; }   // (CR-26: any PIC)
    /* CR-26 — Budget vs Actual: Monthly / Cumulative · table view · expand · Set dates · Team workload: a row → Deals of that person (Not assigned → nobody) */
    const bm = e.target.closest('[data-bvamode] button'); if (bm) { ov.bva.mode = bm.dataset.v; renderBva(); return; }
    const ba = e.target.closest('[data-bvaact]'); if (ba) { if (ba.dataset.bvaact === 'table') { ov.bva.view = ov.bva.view === 'table' ? 'chart' : 'table'; renderBva(); } else expandBva(); return; }
    if (e.target.closest('[data-bvaset]')) { goNoDate(); return; }
    const gt = e.target.closest('[data-goteam]'); if (gt) { go('deals', { filter: { campaign: ov.camp.campaign, phaseSel: ov.camp.phase || 'all', pic: gt.dataset.goteam } }); return; }
    /* CR-23 §3.1 — a product → Shipments of this Campaign (+ Phase) and that product (To ship while some are, else Delivered) */
    const gs = e.target.closest('[data-goship]'); if (gs) { const open = Number(gs.dataset.toship) > 0;
      go('shipments', { tab: open ? 'to-ship' : 'delivered', campaign: ov.camp.campaign, phase: ov.camp.phase || '', product: gs.dataset.goship, pic: 'all', status: '', purpose: '', method: '', q: '', imported: !open }); return; }
    /* CR-23 §3.7 — a reason chip keeps that reason · a row opens the deal */
    const cr = e.target.closest('[data-cxreason]'); if (cr) { ov.camp.reason = ov.camp.reason === cr.dataset.cxreason ? '' : cr.dataset.cxreason; renderCancelled(state(), campScope()); return; }
    const cd = e.target.closest('[data-cxdeal]'); if (cd) { KT.screens.deals.openDealModal(cd.dataset.cxdeal, { after: () => renderCampaign(), source: 'dashboard', nav: [...document.querySelectorAll('#ov_cancelled [data-cxdeal]')].map(x => x.dataset.cxdeal) }); return; }
    /* CR-24 — Operations: a tile / a stage keeps those rows · Show all · a section folds · the work of a row · Set date · a row → its deal · a person · Fix */
    const wt = e.target.closest('[data-wqtile]'); if (wt) { ov.ops.tile = ov.ops.tile === wt.dataset.wqtile ? '' : wt.dataset.wqtile; ov.ops.stage = ''; renderOpsBody(); return; }
    if (e.target.closest('[data-wqclear]')) { ov.ops.tile = ''; ov.ops.stage = ''; renderOpsBody(); return; }
    const wst = e.target.closest('[data-wqstage]'); if (wst) { const k = wst.dataset.wqstage;
      if (k === (R.shortlistStep(state().lookups) || {}).sub_status) { const p = opsPicNow(); go('deals', { filter: { campaign: opsCamps()[0] || '', phaseSel: 'all', pic: p === '__all' ? 'all' : p }, view: 'pipeline' }); return; }   // Shortlist: Deals › Pipeline
      ov.ops.stage = ov.ops.stage === k ? '' : k; ov.ops.tile = ''; renderOpsBody(); return; }
    const sec = e.target.closest('.wq-sec > summary'); if (sec) { wqFold(sec.parentElement); return; }
    const wa = e.target.closest('[data-wqact]'); if (wa) { wqAct(wa); return; }
    const wsd = e.target.closest('[data-wqset]'); if (wsd) { wqSetDate(wsd); return; }
    const wp = e.target.closest('[data-wqpic]'); if (wp) { choosePic(wp.dataset.wqpic); window.scrollTo(0, 0); return; }
    const wf = e.target.closest('[data-wqfix]'); if (wf) { wqFix(+wf.dataset.wqfix); return; }
    const wr = e.target.closest('tr[data-wqrow]'); if (wr && !e.target.closest('button,a,input,select')) { wqOpen(wr.dataset.wqrow); return; }
  }

  function reset() {
    Object.assign(ov.all, savedPreset(), { custom: null });
    Object.assign(ov.camp, { campaign: '', phase: '', gran: 'day', colorFor: null });
    Object.assign(ov.ops, { pic: null, picFor: null, tile: '', stage: '', campsFor: null, waitFor: null, foldFor: null });
  }
  return { render, reset };
})();
