/* screen-overview.js — Dashboard (CR-05 §4.6), three tabs (#dashboard/all · /campaign · /ops, the last one remembered):
   All campaigns — date presets This year · This quarter · This month · Last month · Custom (CR-07 §4.1) · 5 KPI cards · Activity by campaign | KOL tier mix ·
                   Campaign portfolio with Days left · a download on each table / chart card and an Export of the whole tab (CR-09 §4.1–4.5)
   By campaign   — one Campaign (and Phase): summary cards · Activity by date · Phase budget · Pillar allocation (CR-19, was Allocation vs target) · Workload by PIC — one full row each (CR-07 §4.2)
   Operations    — one PIC first (CR-07 §4.3), then Campaign / Tier · queue cards · the chosen queue as a table · Active pipeline · Due in next 7 days
   Money is said one way everywhere: Budget → Committed → Used % → Remaining → Pending (§4.5). → KT.screens.overview */
KT.screens.overview = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, pref, info, ICON, shortNum, bahtShort, stepTitle, dateHTML, setDate, downloadCSV, openDialog, closeDialog, go, pfIcon, phaseChip, dm, optionsHTML, can, initials, toast } = U;
  const O = C.overview, MN = C.money;
  const TABS = ['all', 'campaign', 'ops'];
  const ov = {
    tab: TABS.includes(pref.get('dashtab', 'all')) ? pref.get('dashtab', 'all') : 'all',
    all: Object.assign({ measure: 'posts', view: 'chart', custom: null, statuses: null, stUser: null, tierMeasure: 'spend', tierView: 'chart', pillarMeasure: 'spend', pillarView: 'chart', sort: null }, savedPreset()),
    camp: { campaign: '', phase: '', gran: 'day', measure: 'posts', colorBy: null, colorFor: null, view: 'chart' },
    ops: { campaign: '', pic: null, tier: '', queue: null, limit: 50, selected: new Set() },
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
    $('ov_body').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const tr = e.target.closest('tr[data-gocamp]'); if (tr && e.target === tr) tr.click(); });
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
    if (ov.all.stUser !== uid) { ov.all.stUser = uid; ov.all.statuses = R.normDashStatuses(R.userPrefGet(pref.get(R.DASH_STATUS_KEY, ''), uid)); }
    return ov.all.statuses;
  }
  function setStatuses(v) { statusesNow(); ov.all.statuses = R.normDashStatuses(v); pref.set(R.DASH_STATUS_KEY, R.userPrefSet(pref.get(R.DASH_STATUS_KEY, ''), U.userId() || '', ov.all.statuses)); }
  /* the dot of each status = the colour of its status chip */
  const STATUS_DOT = { ongoing: 'var(--st-prog)', not_started: 'outline', on_hold: 'var(--warn)', complete: 'var(--st-done)', cancelled: 'var(--st-cancel)' };
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
    $('ov_body').innerHTML = `<div class="kpis k5" id="ov_kpis">${kpiCards(k)}</div>` +
      `<div class="card ov-full ov-port"><div class="card-head"><h3>${esc(O.portfolioTitle)}</h3><div class="btns ov-ctl">${dlMenu('portfolio')}</div></div><div id="ov_port"></div></div>` +
      `<div class="ov-r3">${tlCard()}</div><div class="ov-r4">${pillarCard()}${tierCard()}</div>`;
    renderPortfolio(); renderTl(s, from, to); renderPillar(s, from, to); renderTier(s, from, to);
  }
  /* what the export rows of this tab are worked out from (KT.export) — the same as the screen */
  const allX = () => { const [from, to] = allRange(); return { state: state(), from, to, today: td(), statuses: statusesNow(), measure: ov.all.measure, sort: ov.all.sort }; };
  const campX = () => ({ state: state(), campaignId: ov.camp.campaign, phaseId: ov.camp.phase, today: td(), gran: ov.camp.gran || 'day', measure: ov.camp.measure, colorBy: ov.camp.colorBy || 'tier' });
  const opsX = () => ({ state: state(), f: opsFilter(), picLabel: picLabelOf(opsPicNow()), today: td(), queue: ov.ops.queue });
  const tabOfWidget = w => Object.keys(KT.export.TABS).find(t => KT.export.TABS[t].includes(w));
  const xOfTab = t => (t === 'campaign' ? campX() : t === 'ops' ? opsX() : allX());
  /* what a file name says about the scope: the preset · the Campaign (and Phase) · the PIC */
  function scopeOf(t) {
    const s = state();
    if (t === 'campaign') { const c = R.campaignOf(s, ov.camp.campaign) || {}; return { file: KT.export.safeName(c.campaign_name + (ov.camp.phase ? ' ' + R.phaseName(s, ov.camp.phase) : '')), text: `${c.campaign_name || ''} › ${ov.camp.phase ? R.phaseName(s, ov.camp.phase) : O.allPhases}` }; }
    if (t === 'ops') { const f = opsFilter(), lab = picLabelOf(opsPicNow()); return { file: KT.export.safeName(lab), text: [`${O.picLabel}: ${lab}`, f.campaign ? `${O.campaign}: ${R.campaignName(s, f.campaign)}` : '', f.tier ? `${O.tierLabel}: ${f.tier}` : ''].filter(Boolean).join(' · ') }; }
    const [from, to] = allRange(), A = ov.all;
    return { file: KT.export.scopeName(A.preset, from, to), text: `${A.preset === 'custom' ? O.presets.custom : O.presets[A.preset]} · ${R.dmy(from)} – ${R.dmy(to)}` };
  }
  /* CR-09 §4.1 Row 1 — 5 KPI cards, no buttons (ⓘ only) */
  function kpiCards(k) {
    const c = k.campaigns, d = k.deals, m = k.money, p = k.paid, PS = C.phaseStatus;
    const card = (label, tip, v, body) => `<div class="kpi"><div class="l">${U.labelInfo(label, tip, label)}</div><div class="v">${v}</div>${body}</div>`;
    const seg = (n, cls, label) => (n ? `<span class="${cls}" style="flex:${n}" title="${esc(`${label} ${n}`)}"></span>` : '');
    const stLine = ['ongoing', 'not_started', 'complete', 'on_hold', 'cancelled'].filter(st => c.by[st]).map(st => `${PS[st]} ${c.by[st]}`).join(' · ');
    const campaigns = card(O.kCampaigns, O.kCampaignsTip, R.fmtNum(c.n), `<div class="sub">${esc(stLine)}</div>` +
      (c.next ? `<div class="sub muted">${esc(O.nextToEnd(c.next.campaign.campaign_name, KT.export.daysText(c.next.left)))}</div>` : ''));
    const deals = card(O.deals, O.kDealsTip, R.fmtNum(d.n), `<div class="sbar">${seg(d.list, 'list', C.status.List)}${seg(d.inprocess, 'progress', C.status.Inprocess)}${seg(d.complete, 'done', C.status.Complete)}</div>` +
      `<div class="slegend"><span><i class="list"></i>${esc(C.status.List)} ${R.fmtNum(d.list)}</span><span><i class="progress"></i>${esc(C.status.Inprocess)} ${R.fmtNum(d.inprocess)}</span><span><i class="done"></i>${esc(C.status.Complete)} ${R.fmtNum(d.complete)}</span></div>`);
    const committed = card(O.committed, MN.committed, `${R.baht(m.committed)} <small>${m.budget == null ? esc(O.noBudget) : esc(O.of(R.baht(m.budget)))}</small>`,
      (m.usedPct != null ? `<div class="bar"><span class="${m.usedPct > 100 ? 'over' : ''}" style="width:${Math.min(100, m.usedPct)}%"></span></div><div class="sub${m.usedPct > 100 ? ' late' : ''}">${esc(O.usedPct(Math.round(m.usedPct)))}</div>` : '') +
      `<div class="sub muted">${esc(m.remaining != null && m.remaining < 0 ? O.overPend(R.baht(-m.remaining), R.baht(m.pending)) : O.remPend(m.remaining == null ? '—' : R.baht(m.remaining), R.baht(m.pending)))}</div>`);
    const paid = card(O.kPaid, O.kPaidTip, R.baht(p.paid), (p.pct != null ? `<div class="bar paidbar" title="${esc(O.paidPctLine(Math.round(p.pct), R.baht(p.outstanding)))}"><span style="width:${Math.min(100, p.pct)}%"></span></div>` : '') +
      `<div class="sub">${esc(O.paidPctLine(p.pct == null ? 0 : Math.round(p.pct), R.baht(p.outstanding)))}</div>`);
    const kols = card(O.kKols, O.kKolsTip, R.fmtNum(k.kols.n), `<div class="sub">${esc(O.kolsLine(R.fmtNum(k.kols.deals), k.kols.avg == null ? '—' : R.baht(k.kols.avg)))}</div>`);
    return campaigns + deals + committed + paid + kols;
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
      t.rows.map(r => row(r)).join('') + (t.total ? row(t.total, 'total') : '') + `</tbody></table>`;
  }
  function downloadWidget(w, fmt) {
    const tab = tabOfWidget(w), t = KT.export.rowsFor(w, xOfTab(tab)), name = KT.export.fileName(O.file[w], scopeOf(tab).file, td(), fmt);
    if (fmt === 'csv') { downloadCSV(name, t.header, t.rows.concat(t.total ? [t.total] : [])); return; }
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
  /* Campaign portfolio (Row 3) — Days left · Deals · every column sorts (Days left: On going fewest first) */
  const PCOLS = () => [{ k: 'campaign', l: O.colCampaign }, { k: 'status', l: O.colStatus }, { k: 'period', l: O.colPeriod },
    { k: 'days', l: O.colDaysLeft, num: 1, tip: { h: O.colDaysLeft, d: O.daysLeftTip } }, { k: 'budget', l: MN.budget.h, num: 1, tip: MN.budget },
    { k: 'committed', l: MN.committed.h, num: 1, tip: MN.committed }, { k: 'used', l: MN.used.h, cls: 'usedh', tip: MN.used },
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
        `<td class="num">${daysCell(r.days)}</td><td class="num">${r.budget == null ? `<span class="muted">${esc(O.noBudget)}</span>` : R.baht(r.budget)}${KT.budget.pendingTagHTML(r.campaign.campaign_id) ? `<div>${KT.budget.pendingTagHTML(r.campaign.campaign_id)}</div>` : ''}</td><td class="num">${R.baht(r.committed)}</td><td>${usedBar72(r.usedPct)}</td>` +
        `<td class="num">${remainingText(r.remaining)}</td><td class="num${r.pending ? '' : ' muted'}">${r.pending ? R.baht(r.pending) : '—'}</td><td class="num">${R.fmtNum(r.deals)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td></td><td></td><td></td><td class="num">${t.budget == null ? '—' : R.baht(t.budget)}</td><td class="num">${R.baht(t.committed)}</td><td>${usedBar72(t.usedPct)}</td>` +
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
  const tierCard = () => mixCard('tmix', O.tierTitle, O.tierTip, 'tact', 'tmix', 'tiermix', 'ov_tmix');
  const pillarCard = () => mixCard('pmix', O.pillarTitle, O.pillarTip, 'pmixact', 'pmix', 'pillarmix', 'ov_pmix');
  const donutHTML = (id, label) => `<div class="tm-wrap"><div class="tm-donut chartbox" id="${id}_box"><svg id="${id}_svg" role="img" aria-label="${esc(label)}"></svg><div class="tip" id="${id}_tip"></div></div><table class="tm-leg" id="${id}_leg"></table></div>`;
  const tierHTML = id => donutHTML(id, O.tierTitle);
  function renderTier(s, from, to) {
    const A = ov.all, m = R.tierMix(s, from, to, td(), statusesNow());
    document.querySelectorAll('#ov_body [data-tmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.tierMeasure));
    $('ov_body').querySelector('[data-tact="table"]').classList.toggle('on', A.tierView === 'table');
    ov.lastTier = m;
    if (A.tierView === 'table') { $('ov_tmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor('tiermix', allX()))}</div>`; return; }
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
  function expandTier() {
    const m = ov.lastTier, [from, to] = allRange(); if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.tierTitle)} · ${esc(R.dmy(from))} – ${esc(R.dmy(to))}</div><div class="dlg-b tm-big">${tierHTML('ovx_tm')}</div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, 'mid');
    $('ovx_close').addEventListener('click', closeDialog);
    drawDonut('ovx_tm', m, ov.all.tierMeasure, 260);
  }
  /* ---------- CR-13 §4.2 — Pillar mix (Row 4, left): where the committed money went, by pillar, against the target ---------- */
  const PILLAR_VAR = ['--pl-aw', '--pl-ac', '--pl-co', '--pl-cv'];   // CR-19: R.PILLARS order
  const pillarColor = k => (R.PILLARS.includes(k) ? css(PILLAR_VAR[R.PILLARS.indexOf(k)]) : css('--series-grey'));
  const pctTxt = v => (v == null ? '—' : `${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(1)}%`);
  function renderPillar(s, from, to) {
    const A = ov.all, m = R.pillarMix(s, from, to, td(), statusesNow());
    document.querySelectorAll('#ov_body [data-pmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.pillarMeasure));
    $('ov_body').querySelector('[data-pmixact="table"]').classList.toggle('on', A.pillarView === 'table');
    ov.lastPillar = m;
    const note = pillarNote(m);
    if (A.pillarView === 'table') { $('ov_pmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor('pillarmix', allX()))}</div>` + note; return; }
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
    const m = ov.lastPillar, [from, to] = allRange(); if (!m) return;
    openDialog(`<div class="dlg-h">${esc(O.pillarTitle)} · ${esc(R.dmy(from))} – ${esc(R.dmy(to))}</div><div class="dlg-b tm-big">${donutHTML('ovx_pm', O.pillarTitle)}${pillarNote(m)}</div>
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
  const TL_LEGEND = ['ongoing', 'not_started', 'pending', 'on_hold', 'complete', 'cancelled'];
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
    const undated = m.measure === 'spend' ? m.undated.amount : m.undated.count;
    $('ov_tlfoot').textContent = [undated ? (m.measure === 'spend' ? O.undatedSpend(R.baht(undated)) : O.undatedPosts(undated)) : '', m.outside ? O.outsideRange(m.outside) : '',
      m.outsidePeriod ? O.outsidePeriod(m.outsidePeriod) : ''].filter(Boolean).join(' · ');
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
      <div class="card ov-full"><div class="card-head"><h3>${U.labelInfo(O.allocTitle, O.allocTip, O.allocTitle)}</h3><div class="btns ov-ctl">${dlMenu('allocation')}</div></div><div id="ov_alloc"></div></div>
      <div class="card ov-full"><div class="card-head"><h3>${esc(O.workloadTitle)}</h3><div class="btns ov-ctl">${dlMenu('workload')}</div></div><div id="ov_cwork"></div></div>`;
    const scope = campScope();
    renderCards(s, scope); renderActivity(s, scope); renderPhaseBudget(s); renderAllocation(s); renderCampaignWorkload(s, scope);
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
      pb.extra.map(x => `<tr class="click extra${x.key === R.NEEDS ? ' warn' : ''}" data-godeals="${esc(x.key)}"><td class="pname"><span>${esc(x.key === R.NEEDS ? O.needsPhase : O.unscheduled)}</span></td><td></td><td></td><td class="num">${R.baht(x.committed)}</td><td></td><td></td><td></td><td class="num">${x.posts ? R.fmtNum(x.posts) : ''}</td></tr>`).join('');
    const t = pb.total;
    $('ov_pbudget').innerHTML = `<div class="tablewrap"><table class="tbl compact-sm pbudget"><thead><tr><th class="pname">${esc(O.colPhase)}</th><th>${esc(O.colPeriod)}</th><th class="num">${esc(MN.budget.h)}</th>` +
      `<th class="num">${esc(MN.committed.h)} ${info(MN.committed)}</th><th>${esc(MN.used.h)} ${info(MN.used)}</th><th class="num">${esc(MN.remaining.h)} ${info(MN.remaining)}</th><th class="num">${esc(MN.pending.h)} ${info(MN.pending)}</th><th class="num">${esc(O.colPosts)}</th></tr></thead><tbody>${rows}` +
      row(O.campaignTotal, '', '', t.budget, null, t.committed, t.shortlist, t.posts, 'total', null) + `</tbody></table></div>`;
  }
  function renderAllocation(s) {
    const a = R.pillarAllocation(s, ov.camp.campaign), keys = R.PILLARS.concat([R.NOT_SET]);
    const col = k => (k === R.NOT_SET ? css('--series-grey') : css(PILLAR_VAR[R.PILLARS.indexOf(k)]));
    const lab = k => (k === R.NOT_SET ? O.pillarNotSet : k);
    /* CR-07 §4.2: every segment says its ฿ and % (Target ฿ = its % of what is committed) */
    const bar = (pct, money) => `<div class="abar">${keys.map(k => (pct[k] ? `<span class="${k === R.NOT_SET ? 'tex' : ''}" style="flex:${pct[k]};background-color:${col(k)}" title="${esc(`${lab(k)} · ${Math.round(pct[k])}% · ${R.baht(Math.round(money ? money[k] : pct[k] / 100 * a.actual.total))}`)}"></span>` : '')).join('')}</div>`;
    /* CR-19 §4.7 — Pillar allocation: what is, for the Campaign and each Phase (no Target bar, no pp) */
    const line = (label, body, cls) => `<div class="arow2${cls ? ' ' + cls : ''}"><div class="al">${label}</div>${body}</div>`;
    const camp = R.campaignOf(s, ov.camp.campaign) || {};
    $('ov_alloc').innerHTML = `<div class="slegend alegend">${keys.map(k => `<span><i class="${k === R.NOT_SET ? 'tex' : ''}" style="background-color:${col(k)}"></i>${esc(lab(k))}</span>`).join('')}</div>` +
      line(`<b>${esc(camp.campaign_name || '')}</b>`, bar(a.actual.pct, a.actual.money)) +
      a.phases.map(p => line(`<span class="dotc" style="background:${U.phaseColor(null, p.phase.phase_id)}"></span>${esc(R.phaseName(s, p.phase.phase_id))}`, p.total ? bar(p.pct, p.money) : `<span class="muted small">${esc(O.noCommitted)}</span>`, p.phase.phase_id === ov.camp.phase ? 'sel' : '')).join('') +
      /* CR-11 §4.11 — most of the spend has no pillar: say so, with the way to fix it once (a default pillar per Phase) */
      (R.mostSpendNoPillar(a.actual) ? `<div class="alloc-note check warn">! <span>${esc(C.fill.mostNoPillar)} ·</span>` +
        (U.can('campaign.edit') ? `<button type="button" class="link" data-allocplan="${esc(ov.camp.campaign)}">${esc(C.fill.setDefaults)}</button>` : `<span>${esc(C.fill.setDefaults)}</span>`) + `</div>` : '');
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-allocplan]'); if (b && KT.planner) KT.planner.open({ campaignId: b.dataset.allocplan, opener: b }); });
  /* CR-07 §4.2 — Workload by PIC of this Campaign (and Phase): most open deals first · Total · your row lit · a row opens Operations on that PIC */
  function renderCampaignWorkload(s, scope) {
    const rows = R.workloadByPic(s, scope, td()), sum = k => rows.reduce((a, r) => a + r[k], 0), mine = R.picName(U.me());
    $('ov_cwork').innerHTML = !rows.length ? `<div class="hint">${esc(O.noActive)}</div>` : `<div class="tablewrap"><table class="tbl compact-sm wl"><thead><tr><th>${esc(O.picLabel)}</th><th class="num">${esc(O.colOpen)}</th><th class="num">${esc(O.queues.overdue)}</th><th class="num">${esc(O.docsToCollect)}</th><th class="num">${esc(O.colCommittedOpen)} ${info(MN.committed)}</th></tr></thead><tbody>` +
      rows.map(r => `<tr class="click${r.pic && r.pic === mine ? ' selected' : ''}" tabindex="0" data-gopic="${esc(r.pic || '__none')}" title="${esc(O.workloadTip)}"><td>${r.pic ? `<span class="picplain"><span class="av sm">${esc(initials(r.pic))}</span><span class="nm">${esc(r.pic)}</span></span>` : `<span class="muted">${esc(O.noPic)}</span>`}</td>` +
        `<td class="num">${R.fmtNum(r.open)}</td><td class="num${r.overdue ? ' late' : ''}">${R.fmtNum(r.overdue)}</td><td class="num">${R.fmtNum(r.docs)}</td><td class="num">${R.baht(r.committed)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td class="num">${R.fmtNum(sum('open'))}</td><td class="num">${R.fmtNum(sum('overdue'))}</td><td class="num">${R.fmtNum(sum('docs'))}</td><td class="num">${R.baht(sum('committed'))}</td></tr></tbody></table></div>`;
  }
  function expand() {
    if (ov.tab === 'all') { expandTl(); return; }   // CR-19 §4.3: Show all of the Campaign timeline
    const md = ov.lastModel; if (!md) return;
    openDialog(`<div class="dlg-h">${esc(O.activityTitle)} · ${esc(R.dmy(md.from))} – ${esc(R.dmy(md.to))}</div><div class="dlg-b"><div class="legend">${$('ov_legend').innerHTML}</div><div class="chartbox" id="ovx_box"><svg id="ovx_svg" role="img"></svg><div class="tip" id="ovx_tip"></div></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, true);
    $('ovx_close').addEventListener('click', closeDialog);
    renderActivityChart($('ovx_svg'), $('ovx_box'), $('ovx_tip'), md, 440);
  }
  /* ===================== Tab 3 — Operations ===================== */
  /* CR-09 §4.6 — All PICs or one PIC: the one picked (remembered per user) · else you when you are a PIC · else All PICs ('__all') */
  const opsPicKey = () => 'opspic_' + (U.userId() || '');
  const opsPicNow = () => R.opsPic(state(), U.me(), ov.ops.pic != null && ov.ops.picFor === U.userId() ? ov.ops.pic : pref.get(opsPicKey(), ''));   // a Switch user brings that person's own choice
  const opsFilter = () => { const p = opsPicNow(); return { campaign: ov.ops.campaign, pic: p === '__all' ? '' : p, tier: ov.ops.tier }; };
  const picLabelOf = p => (p === '__none' ? O.noPic : p === '__all' ? O.allPicsOps : p);
  function choosePic(p) { Object.assign(ov.ops, { pic: p || null, picFor: U.userId() }); pref.set(opsPicKey(), p || ''); Object.assign(ov.ops, { queue: null, limit: 50 }); ov.ops.selected.clear(); renderOps(); }
  function opsTabLabel() { const b = document.querySelector('#ov_tabs [data-tab2="ops"]'), p = opsPicNow(); if (b) b.textContent = O.opsOf(picLabelOf(p)); }
  const picSelect = (id, p) => `<select id="${id}" aria-label="${esc(O.picLabel)}" data-combo="pic"><option value="__all" data-special${p === '__all' ? ' selected' : ''}>${esc(O.allPicsOps)}</option>` +
    R.picNames(state()).map(n => `<option value="${esc(n)}"${n === p ? ' selected' : ''}>${esc(n)}</option>`).join('') + `<option value="__none"${p === '__none' ? ' selected' : ''}>${esc(O.noPic)}</option></select>`;
  function renderOps() {
    const s = state(), f = opsFilter(), p = opsPicNow(), mine = R.picName(U.me()) && R.picNames(s).includes(R.picName(U.me())) ? R.picName(U.me()) : null;
    opsTabLabel();
    $('ov_tools').innerHTML = `<label class="tlab">${esc(O.picLabel)} ${picSelect('ov_opic', p)}</label>` +
      (mine && p !== mine ? `<button type="button" class="btn small" data-backme>${esc(O.backToMe)}</button>` : '') +
      `<select id="ov_ocamp" aria-label="${esc(O.campaign)}" data-combo="campaign">${U.campaignOptionsHTML(f.campaign, O.allCampaigns)}</select>` +
      `<label class="tlab">${esc(O.tierLabel)} <select id="ov_otier">${optionsHTML(R.tierOrder(s.lookups.tier_rules), f.tier, O.allTiers)}</select></label>` +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-export="ops" title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>`;
    U.enhanceCombos($('ov_tools'));
    /* CR-11 §4.8 — Row 1 To do (work with a date) · Row 2 Data health (folds, remembered per person) · a card or an item opens its table below */
    const ctx = R.dealContext(s), Q = R.opsQueues(s, f, td(), ctx), H = R.dataHealth(s, f, td());
    const toShip = R.shipmentsToShip(s, f, td()), docs = R.docsToCollect(s, f, td()), mDue = R.metricsDue ? R.metricsDue(s, f, td()) : null;
    /* CR-17 §4.4 — Simple payments: Payments to confirm (Sent more than 7 days, not paid) in place of Docs to collect · Approvals for those who approve */
    const simplePay = R.isSimple(s, 'payments'), confirm = simplePay ? R.paymentsToConfirm(s, f, td()) : null, approver = R.canApprove(U.actor());
    const hItem = k => H.items.find(x => x.key === k);
    if (ov.ops.queue && ov.ops.queue.startsWith('h:') && !hItem(ov.ops.queue.slice(2))) ov.ops.queue = null;
    if (ov.ops.queue === 'overdue' && !Q.overdue.length) ov.ops.queue = null;
    if (ov.ops.queue === null && Q.overdue.length) ov.ops.queue = 'overdue';
    const card = (attrs, n, label, on, go) => `<button type="button" class="qcard${on ? ' on' : ''}${go ? ' pay' : ''}" ${attrs}${on ? ' aria-pressed="true"' : ''}><span class="n">${R.fmtNum(n)}</span><span class="t">${esc(label)}${go ? ' →' : ''}</span></button>`;
    const todo = card('data-queue="overdue"', Q.overdue.length, O.queues.overdue, ov.ops.queue === 'overdue') +
      card('data-gosamples', toShip.length, O.toShip, false, true) +
      (simplePay ? card('data-gopay="sent"', confirm.length, O.paymentsToConfirm, false, true) : card('data-gopay="missing"', docs.length, O.docsToCollect, false, true)) +
      (mDue ? card('data-gometrics', mDue.length, O.metricsDue, false, true) : '') + (approver ? card('data-goapprove', R.approvalCount(s), O.approvals, false, true) : '');
    const open = pref.get('opshealth_' + (U.userId() || ''), '0') === '1' || (ov.ops.queue || '').startsWith('h:');
    const health = `<details class="card ops-health${H.total ? '' : ' good'}" id="ov_health"${open && H.total ? ' open' : ''}><summary><span class="chev${open ? ' open' : ''}">${ICON.chevron}</span>` +
      `<b>${esc(H.total ? O.healthN(H.total) : O.allGood)}</b>${H.total ? '' : ' <span class="ok">✓</span>'}</summary>` +
      (H.total ? `<div class="qcards hl-items">${H.items.map(x => card(`data-queue="h:${x.key}"`, x.n, O.healthItems[x.key], ov.ops.queue === 'h:' + x.key)).join('')}</div><div class="hint">${esc(O.healthHint)}</div>` : '') + `</details>`;
    const qk = ov.ops.queue, hk = qk && qk.startsWith('h:') ? qk.slice(2) : null, it = hk ? hItem(hk) : null;
    const qTitle = hk ? O.healthItems[hk] : qk ? O.queues[qk] : '', qN = hk ? it.n : qk ? Q[qk].length : 0, dealQueue = qk === 'overdue' || (it && it.deals);
    $('ov_body').innerHTML = `<div class="ops-todo"><div class="ops-h">${esc(O.todo)}</div><div class="qcards">${todo}</div></div>${health}` +
      (qk ? `<div class="card" style="margin:16px 0"><div class="card-head"><h3>${esc(qTitle)} <span class="muted">${R.fmtNum(qN)}</span></h3>` +
        `<div class="btns ov-ctl">${qk === 'overdue' ? dlMenu('queue') : ''}</div><div class="btns hidden" id="ov_qbulk"><b id="ov_qselN"></b>${can('deal.edit') && dealQueue ? `<button type="button" class="btn small" data-qbulk="pic">${esc(C.deal.reassign)}</button><button type="button" class="btn small" data-qbulk="pillar">${esc(C.deal.setPillar)}</button><button type="button" class="btn small" data-qbulk="term">${esc(O.setTerm)}</button>` : ''}<button type="button" class="btn small ghost" data-qclear>${esc(C.deal.clear)}</button></div></div><div id="ov_qtable"></div></div>` : '') +
      `<div class="ov-half"><div class="card"><div class="card-head"><h3>${esc(O.pipelineTitle)}</h3></div><div class="hbars" id="ov_pipe"></div><div class="foot-note" id="ov_pipeFoot"></div></div>` +
      `<div class="card"><div class="card-head"><h3>${esc(O.dueTitle)}</h3></div><div id="ov_due"></div></div></div>`;
    if (hk === 'noProducts') renderCampaignQueue(s, it.campaigns);
    else if (hk === 'noBudget') renderPhaseQueue(s, it.phases);
    else if (hk) renderQueue(s, it.deals, ctx, healthIssue(s, hk, it, ctx));
    else if (qk) renderQueue(s, Q[qk], ctx);
    renderOpsPipeline(s, f, ctx); renderDue(s, f, ctx);
  }
  /* the issue of a Data health deal */
  function healthIssue(s, key, it, ctx) {
    if (key === 'postedNoDate') return d => O.issueNoDatePosts(it.posts.filter(p => p.deal_id === d.deal_id).length);
    if (key === 'dupLinks') return d => O.issueDup((it.groups.find(g => g.posts.some(p => p.deal_id === d.deal_id)) || {}).link || '');
    return () => O.healthItems[key];
  }
  /* Phases without budget: Campaign · Phase · Period · Plan phases */
  function renderPhaseQueue(s, phases) {
    const edit = can('campaign.edit');
    $('ov_qtable').innerHTML = `<div class="tablewrap" style="max-height:480px"><table class="tbl qtbl"><thead><tr><th>${esc(O.colCampaign)}</th><th>${esc(O.colPhase)}</th><th>${esc(C.campaign.colPeriod)}</th><th>${esc(O.colIssue)}</th><th></th></tr></thead><tbody>` +
      phases.map(p => `<tr><td><b>${esc(R.campaignName(s, p.campaign_id))}</b></td><td>${esc(R.phaseName(s, p.phase_id))}</td><td>${esc(p.start_date ? `${dm(p.start_date)} – ${dm(p.end_date)}` : '')}</td><td>${esc(O.issueNoBudget)}</td>` +
        `<td>${edit ? `<button type="button" class="btn small" data-addprod="${esc(p.campaign_id)}">${esc(O.healthFix.noBudget)}</button>` : ''}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  function renderQueue(s, deals, ctx, issueOf) {
    const rows = issueOf ? deals.map(d => ({ deal: d, rank: 0, issue: issueOf(d) })) : R.queueRows(s, ov.ops.queue, deals, td(), ctx), shown = rows.slice(0, ov.ops.limit), edit = can('deal.edit'), D2 = KT.screens.deals;
    [...ov.ops.selected].forEach(id => { if (!deals.some(d => d.deal_id === id)) ov.ops.selected.delete(id); });
    const where = d => { const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), c = ctx.campaigns.get(d.campaign_id) || {}; return `${c.campaign_name || ''}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`; };
    $('ov_qtable').innerHTML = `<div class="tablewrap" style="max-height:480px"><table class="tbl qtbl"><thead><tr>${edit ? `<th class="cb"><input type="checkbox" id="ov_qall" aria-label="${esc(C.deal.selectAll)}"></th>` : ''}` +
      `<th>${esc(O.colKol)}</th><th>${esc(O.colCampaignPhase)}</th><th>${esc(O.colStage)}</th><th>${esc(O.picLabel)}</th><th>${esc(O.colIssue)}</th><th class="num">${esc(O.colTotal)}</th><th></th></tr></thead><tbody>` +
      shown.map(r => { const d = r.deal, k = ctx.kols.get(d.kol_id) || {};
        return `<tr data-qid="${esc(d.deal_id)}">${edit ? `<td class="cb"><input type="checkbox" data-qsel="${esc(d.deal_id)}"${ov.ops.selected.has(d.deal_id) ? ' checked' : ''} aria-label="${esc(k.display_name || d.deal_id)}"></td>` : ''}` +
          `<td class="kn"><b>${U.nameHTML(k.display_name || d.kol_id)}</b></td><td class="muted cph">${esc(where(d))}</td><td>${U.stageCell(d, R.logsOf(s, d.deal_id))}</td><td>${D2.picCell(d)}</td>` +
          `<td class="iss${ov.ops.queue === 'overdue' ? ' late' : ''}" title="${esc(r.issue)}">${esc(r.issue)}</td><td class="num">${R.baht(R.totalCost(d))}</td><td><button type="button" class="btn small" data-open="${esc(d.deal_id)}">${esc(O.open)}</button></td></tr>`; }).join('') +
      `</tbody></table></div>` + (rows.length > shown.length ? `<div class="loadmore"><button type="button" class="btn" data-qmore>${esc(C.deal.loadMore(rows.length - shown.length))}</button></div>` : '');
    qBulk();
  }
  /* CR-06 §4.3 — Campaigns without products: Campaign · Status · Period · Deals · Add products (Phase Planner) */
  function renderCampaignQueue(s, list) {
    const P = C.products, t = td(), edit = can('campaign.edit');
    $('ov_qtable').innerHTML = `<div class="tablewrap" style="max-height:480px"><table class="tbl qtbl"><thead><tr><th>${esc(O.colCampaign)}</th><th>${esc(O.colStatus)}</th><th>${esc(C.campaign.colPeriod)}</th><th class="num">${esc(C.campaign.colDeals)}</th><th></th></tr></thead><tbody>` +
      R.sortCampaigns(list, s.phases, t).map(c => { const ps = R.phasesOfCampaign(s, c.campaign_id), [a, z] = R.scopeRange(s, { campaignId: c.campaign_id }), n = s.deals.filter(d => d.campaign_id === c.campaign_id && !R.isCancelled(d)).length;
        return `<tr><td><b>${esc(c.campaign_name)}</b></td><td>${phaseChip(R.campaignEffectiveStatus(c, ps, t))}</td><td>${esc(a ? `${dm(a)} – ${dm(z)}` : '')}</td><td class="num">${R.fmtNum(n)}</td>` +
          `<td>${edit ? `<button type="button" class="btn small" data-addprod="${esc(c.campaign_id)}">${esc(P.addProducts)}</button>` : ''}</td></tr>`; }).join('') + `</tbody></table></div>`;
  }
  function qBulk() {
    const n = ov.ops.selected.size, bar = $('ov_qbulk'); if (!bar) return;
    bar.classList.toggle('hidden', !n); $('ov_qselN').textContent = C.deal.selected(n);
  }
  function renderOpsPipeline(s, f, ctx) {
    const deals = R.opsDeals(s, f, ctx);
    const rows = R.stepsOf(s.lookups).filter(st => st.status === 'List' || st.status === 'Inprocess').map(st => ({ st, n: deals.filter(d => d.sub_status === st.sub_status).length })).filter(r => r.n);
    const max = Math.max(1, ...rows.map(r => r.n));
    $('ov_pipe').innerHTML = rows.map(r => `<button type="button" class="hbar" data-sub="${esc(r.st.sub_status)}" title="${esc(`${r.st.sub_status} · ${stepTitle(r.st.sub_status)}: ${r.n}`)}">` +
      `<span class="lb">${esc(r.st.sub_status)}</span><span class="tr"><span class="fb" style="width:${Math.max(2, r.n / max * 100)}%"></span><span class="fv">${R.fmtNum(r.n)}</span></span></button>`).join('') || `<div class="muted">${esc(O.noActive)}</div>`;
    $('ov_pipeFoot').textContent = O.pipeFoot(R.fmtNum(deals.filter(d => d.status === 'Complete').length), R.fmtNum(deals.filter(d => d.status === 'Cancel').length));
  }
  /* CR-07 §4.3 — Due in next 7 days: date (Today / Tomorrow / dd/mm) · KOL · Campaign › Phase · the step due · Open */
  function renderDue(s, f, ctx) {
    const t = td(), rows = R.upcomingDues(s, f, t, 7, ctx).concat(R.sampleDues(s, f, t, 7), R.metricsDues(s, f, t, 7)).sort((a, b) => a.due.localeCompare(b.due) || a.deal.deal_id.localeCompare(b.deal.deal_id));   // + Ship sample (CR-10 §4.14) · Collect metrics (CR-11 §4.12)
    const when = d => (d === t ? O.dueToday : d === R.addDays(t, 1) ? O.dueTomorrow : dm(d));
    const where = d => { const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), c = ctx.campaigns.get(d.campaign_id) || {}; return `${c.campaign_name || ''}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`; };
    const allPics = !f.pic;   // All PICs: who each deal belongs to (CR-09 §4.6)
    $('ov_due').innerHTML = !rows.length ? `<div class="muted">${esc(O.dueNone)}</div>` : `<div class="tablewrap"><table class="tbl compact-sm duet"><thead><tr><th>${esc(O.colDue)}</th><th>${esc(O.colKol)}</th><th>${esc(O.colCampaignPhase)}</th><th>${esc(O.colStep)}</th>${allPics ? `<th>${esc(O.picLabel)}</th>` : ''}<th></th></tr></thead><tbody>` +
      rows.map(r => { const d = r.deal, k = ctx.kols.get(d.kol_id) || {};
        return `<tr><td class="nowrap${r.due === t ? ' warn' : ''}">${esc(when(r.due))}</td><td class="kn"><b>${U.nameHTML(k.display_name || d.kol_id)}</b></td><td class="muted cph">${esc(where(d))}</td><td class="nowrap">${esc(r.metrics ? O.collectMetrics : r.sample ? C.samples.shipSample : R.stepShort(r.step ? r.step.sub_status : ''))}</td>${allPics ? `<td>${esc(d.pic || O.noPic)}</td>` : ''}` +
          `<td><button type="button" class="btn small" data-open="${esc(d.deal_id)}">${esc(O.open)}</button></td></tr>`; }).join('') + `</tbody></table></div>`;
  }

  /* ===================== events ===================== */
  function onToolsClick(e) {
    const ex = e.target.closest('[data-export]'); if (ex) { exportTab(ex.dataset.export); return; }
    const p = e.target.closest('[data-preset]');
    if (p) {
      if (p.dataset.preset === 'custom') { const [a, z] = allRange(); U.openRange($('ov_crange'), { from: a, to: z, anchor: p }); return; }
      Object.assign(ov.all, { preset: p.dataset.preset, from: '', to: '', custom: null }); savePreset(); renderAll(); return;
    }
    if (e.target.closest('[data-backme]')) { choosePic(R.picName(U.me())); return; }
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
    else if (t.id === 'ov_ocamp') { ov.ops.campaign = t.value; ov.ops.limit = 50; renderOps(); }
    else if (t.id === 'ov_opic') choosePic(t.value);
    else if (t.id === 'ov_otier') { ov.ops.tier = t.value; ov.ops.limit = 50; renderOps(); }
    else if (t.id === 'ov_crange' && R.isISODate(t.dataset.from) && R.isISODate(t.dataset.to)) { Object.assign(ov.all, { preset: 'custom', from: t.dataset.from, to: t.dataset.to, custom: null }); savePreset(); renderAll(); }
  }
  function onBodyClick(e) {
    const D2 = KT.screens.deals;
    const dl = e.target.closest('[data-dl]'); if (dl) { const d = dl.closest('details'); if (d) d.open = false; downloadWidget(dl.dataset.w, dl.dataset.dl); return; }
    const ps = e.target.closest('[data-psort]'); if (ps) { const k = ps.dataset.psort, so = ov.all.sort; ov.all.sort = so && so.key === k ? (so.dir === 'asc' ? { key: k, dir: 'desc' } : null) : { key: k, dir: 'asc' }; renderPortfolio(); return; }
    const tm = e.target.closest('[data-tmix] button'); if (tm) { ov.all.tierMeasure = tm.dataset.v; renderTier(state(), ...allRange()); return; }
    const pmx = e.target.closest('[data-pmix] button'); if (pmx) { ov.all.pillarMeasure = pmx.dataset.v; renderPillar(state(), ...allRange()); return; }
    const pma = e.target.closest('[data-pmixact]'); if (pma) { if (pma.dataset.pmixact === 'table') { ov.all.pillarView = ov.all.pillarView === 'table' ? 'chart' : 'table'; renderPillar(state(), ...allRange()); } else expandPillar(); return; }
    const ta = e.target.closest('[data-tact]'); if (ta) { if (ta.dataset.tact === 'table') { ov.all.tierView = ov.all.tierView === 'table' ? 'chart' : 'table'; renderAll(); } else expandTier(); return; }
    const sw = e.target.closest('[data-swim] button'); if (sw) { ov.all.measure = sw.dataset.v; renderAll(); return; }
    const sa = e.target.closest('[data-sact]'); if (sa) { const a = sa.dataset.sact; if (a === 'table') { ov.all.view = ov.all.view === 'table' ? 'chart' : 'table'; renderAll(); } else if (a === 'csv') downloadActivity(); else expand(); return; }
    const gc = e.target.closest('[data-gocamp]'); if (gc) { Object.assign(ov.camp, { campaign: gc.dataset.gocamp, phase: '' }); ov.tab = 'campaign'; render(); return; }
    const ctl = e.target.closest('[data-ctl] button'); if (ctl) { const k = ctl.closest('[data-ctl]').dataset.ctl; ov.camp[k] = ctl.dataset.v; if (k === 'colorBy') pref.set(colorKey(), ctl.dataset.v); renderCampaign(); return; }
    const act = e.target.closest('[data-act]'); if (act) { const a = act.dataset.act; if (a === 'table') { ov.camp.view = ov.camp.view === 'table' ? 'chart' : 'table'; renderCampaign(); } else if (a === 'expand') expand(); return; }
    const gp = e.target.closest('[data-gopic]'); if (gp) { pref.set(opsPicKey(), gp.dataset.gopic); Object.assign(ov.ops, { pic: gp.dataset.gopic, picFor: U.userId(), campaign: ov.camp.campaign, queue: null, limit: 50 }); ov.ops.selected.clear(); ov.tab = 'ops'; render(); window.scrollTo(0, 0); return; }
    const gd = e.target.closest('[data-godeals]'); if (gd) { go('deals', { filter: { campaign: ov.camp.campaign, phaseSel: gd.dataset.godeals } }); return; }
    /* Operations */
    const ap = e.target.closest('[data-addprod]'); if (ap) { go('campaign', { planCampaign: ap.dataset.addprod }); return; }
    /* CR-11 §4.10 — Shipments › To ship of that PIC (and Campaign) */
    const gsm = e.target.closest('[data-gosamples]'); if (gsm) { const f = opsFilter(); go('shipments', { tab: 'to-ship', campaign: f.campaign || '', pic: f.pic || 'all', status: '', purpose: '', q: '' }); return; }
    const gpy = e.target.closest('[data-gopay]'); if (gpy) { const f = opsFilter(); go('payments', gpy.dataset.gopay === 'sent' ? { tab: 'sent', pic: f.pic, campaign: f.campaign || '' } : { tab: 'topay', pic: f.pic, campaign: f.campaign || '', queue: gpy.dataset.gopay }); return; }
    if (e.target.closest('[data-goapprove]')) { go('campaign', { approvals: true }); return; }   // CR-17 §4.5
    const q = e.target.closest('[data-queue]'); if (q) { ov.ops.queue = ov.ops.queue === q.dataset.queue && !q.dataset.queue.startsWith('h:') ? ov.ops.queue : q.dataset.queue; ov.ops.limit = 50; ov.ops.selected.clear(); renderOps(); return; }
    if (e.target.id === 'ov_qall') { const on = e.target.checked; document.querySelectorAll('#ov_qtable [data-qsel]').forEach(c => { c.checked = on; on ? ov.ops.selected.add(c.dataset.qsel) : ov.ops.selected.delete(c.dataset.qsel); }); qBulk(); return; }
    const qs = e.target.closest('[data-qsel]'); if (qs) { qs.checked ? ov.ops.selected.add(qs.dataset.qsel) : ov.ops.selected.delete(qs.dataset.qsel); qBulk(); return; }
    if (e.target.closest('[data-qmore]')) { ov.ops.limit += 50; renderOps(); return; }
    if (e.target.closest('[data-qclear]')) { ov.ops.selected.clear(); renderOps(); return; }
    const qb = e.target.closest('[data-qbulk]'); if (qb) { const ids = [...ov.ops.selected]; ov.ops.selected.clear(); if (qb.dataset.qbulk === 'term') D2.openSetDetails(ids, { term: true, after: renderOps }); else D2.openBulkField(qb.dataset.qbulk, ids); return; }
    const hs = e.target.closest('#ov_health > summary'); if (hs) { setTimeout(() => { const d = $('ov_health'); if (!d) return; pref.set('opshealth_' + (U.userId() || ''), d.open ? '1' : '0'); const c = d.querySelector('summary .chev'); if (c) c.classList.toggle('open', d.open); }, 0); return; }
    /* Deals shows one Campaign: the chosen one, else the Campaign with the most posts due */
    const gm = e.target.closest('[data-gometrics]'); if (gm) { const f = opsFilter(), due = R.metricsDue(state(), f, td()), by = new Map(); due.forEach(x => by.set(x.deal.campaign_id, (by.get(x.deal.campaign_id) || 0) + 1));
      const camp = f.campaign || ([...by.entries()].sort((a, b) => b[1] - a[1])[0] || [''])[0]; go('deals', { perf: { campaign: camp, pic: f.pic || 'all', status: 'due' } }); return; }
    const pc = e.target.closest('[data-pic]'); if (pc) { D2.openPicMenu(pc, 'pic'); return; }
    const op = e.target.closest('[data-open]'); if (op) { go('deals', { deal: op.dataset.open }); return; }
    const sub = e.target.closest('[data-sub]'); if (sub) { const f = opsFilter(); go('deals', { filter: { campaign: f.campaign, phaseSel: 'all', sub: sub.dataset.sub, pic: f.pic || 'all', tiers: f.tier ? [f.tier] : null } }); }
  }

  function reset() {
    Object.assign(ov.all, savedPreset(), { custom: null });
    Object.assign(ov.camp, { campaign: '', phase: '', gran: 'day', colorFor: null });
    Object.assign(ov.ops, { campaign: '', pic: null, tier: '', queue: null, limit: 50 }); ov.ops.selected.clear();
  }
  return { render, reset };
})();
