/* screen-overview.js — Dashboard (CR-05 §4.6), three tabs (#dashboard/all · /campaign · /ops, the last one remembered):
   All campaigns — date presets This year · This quarter · This month · Last month · Custom (CR-07 §4.1) · 5 KPI cards · Activity by campaign | KOL tier mix ·
                   Campaign portfolio with Days left · a download on each table / chart card and an Export of the whole tab (CR-09 §4.1–4.5)
   By campaign   — one Campaign (and Phase): summary cards · Activity by date · Phase budget · Allocation vs target · Workload by PIC — one full row each (CR-07 §4.2)
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
    all: Object.assign({ measure: 'posts', view: 'chart', custom: null, inclCancel: false, tierMeasure: 'spend', tierView: 'chart', sort: null }, savedPreset()),
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
  function allRange() { return ov.all.preset === 'custom' && ov.all.from && ov.all.to ? [ov.all.from, ov.all.to] : R.presetRange(ov.all.preset, td()); }
  function renderAll() {
    const s = state(), [from, to] = allRange(), A = ov.all;
    const presets = R.PRESETS.concat(['custom']).map(p => `<button type="button" data-preset="${p}" class="${A.preset === p ? 'on' : ''}">${esc(O.presets[p])}</button>`).join('');
    $('ov_tools').innerHTML = `<div class="seg" id="ov_preset">${presets}</div>` +
      (A.preset === 'custom' ? `<span class="fchip">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}<button type="button" data-clearcustom aria-label="${esc(C.deal.remove)}">×</button></span>` : `<span class="muted small">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}</span>`) +
      `<label class="tick small"><input type="checkbox" id="ov_inclCancel"${A.inclCancel ? ' checked' : ''}> ${esc(C.campaign.includeCancelled)}</label>` +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-export="all" title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>` +
      `<div class="popover cpop${A.custom ? '' : ' hidden'}" id="ov_customPop"><div class="fields">${'<div class="field"><label>' + esc(O.from) + '</label>' + dateHTML('id="ov_cfrom"', A.custom ? A.custom.from : from, { label: O.from }) + '</div>'}` +
      `${'<div class="field"><label>' + esc(O.to) + '</label>' + dateHTML('id="ov_cto"', A.custom ? A.custom.to : to, { label: O.to }) + '</div>'}</div>` +
      `<div class="checks" id="ov_cchk"></div><div class="btns"><button type="button" class="btn small" data-ccancel>${esc(C.common.cancel)}</button><button type="button" class="btn small primary" data-capply>${esc(O.apply)}</button></div></div>`;
    const k = R.portfolioKpis(s, from, to, td(), A.inclCancel);
    $('ov_body').innerHTML = `<div class="kpis k5" id="ov_kpis">${kpiCards(k)}</div><div class="ov-r2">${swimCard()}${tierCard()}</div>` +
      `<div class="card ov-full"><div class="card-head"><h3>${esc(O.portfolioTitle)}</h3><div class="btns ov-ctl">${dlMenu('portfolio')}</div></div><div id="ov_port"></div></div>`;
    renderSwim(s, from, to); renderTier(s, from, to); renderPortfolio(); fitSwim();
  }
  /* Row 2 cards share one height (§4.1): when the KOL tier mix is the taller one the lanes grow into the room (no blank band under the chart) */
  function fitSwim() {
    const md = ov.lastSwim, box = $('ov_swimbox'), svg = $('ov_swim');
    if (!md || ov.all.view !== 'chart' || !box || !md.lanes.length) return;
    const free = box.clientHeight - svg.getBoundingClientRect().height;
    if (free > 4) { md.laneExtra = Math.min(60, (md.laneExtra || 0) + free / md.lanes.length); drawSwim(svg, box, $('ov_swimtip'), md); }
  }
  /* what the export rows of this tab are worked out from (KT.export) — the same as the screen */
  const allX = () => { const [from, to] = allRange(); return { state: state(), from, to, today: td(), inclCancel: ov.all.inclCancel, measure: ov.all.measure, sort: ov.all.sort }; };
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
    return { file: KT.export.scopeName(A.preset, from, to), text: `${A.preset === 'custom' ? O.presets.custom : O.presets[A.preset]} · ${R.dmy(from)} – ${R.dmy(to)}${A.inclCancel ? ` · ${C.campaign.includeCancelled}` : ''}` };
  }
  /* CR-09 §4.1 Row 1 — 5 KPI cards, no buttons (ⓘ only) */
  function kpiCards(k) {
    const c = k.campaigns, d = k.deals, m = k.money, p = k.paid, PS = C.phaseStatus;
    const card = (label, tip, v, body) => `<div class="kpi"><div class="l">${esc(label)} ${info(tip, label)}</div><div class="v">${v}</div>${body}</div>`;
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
    const meta = { tab: O.tabs[tab], scope: sc.text, at: `${R.dmy(td())} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, by: (U.me() || {}).display_name || '' };
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
      return `<th class="${c.num ? 'num' : ''}${c.cls ? ' ' + c.cls : ''}"${on ? ` aria-sort="${so.dir === 'desc' ? 'descending' : 'ascending'}"` : ''}>${c.tip && c.num ? info(c.tip) + ' ' : ''}${btn}${c.tip && !c.num ? ' ' + info(c.tip) : ''}</th>`; };
    const t = m.total;
    $('ov_port').innerHTML = `<div class="tablewrap"><table class="tbl port"><thead><tr>${PCOLS().map(th).join('')}</tr></thead><tbody>` +
      m.rows.map(r => `<tr class="click" tabindex="0" data-gocamp="${esc(r.campaign.campaign_id)}"><td class="nm"><b>${esc(r.campaign.campaign_name)}</b></td><td>${phaseChip(r.status)}</td><td class="nowrap">${esc(r.from ? `${dm(r.from)} – ${dm(r.to)}` : '')}</td>` +
        `<td class="num">${daysCell(r.days)}</td><td class="num">${r.budget == null ? `<span class="muted">${esc(O.noBudget)}</span>` : R.baht(r.budget)}</td><td class="num">${R.baht(r.committed)}</td><td>${usedBar72(r.usedPct)}</td>` +
        `<td class="num">${remainingText(r.remaining)}</td><td class="num${r.pending ? '' : ' muted'}">${r.pending ? R.baht(r.pending) : '—'}</td><td class="num">${R.fmtNum(r.deals)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td></td><td></td><td></td><td class="num">${t.budget == null ? '—' : R.baht(t.budget)}</td><td class="num">${R.baht(t.committed)}</td><td>${usedBar72(t.usedPct)}</td>` +
        `<td class="num">${remainingText(t.remaining)}</td><td class="num">${R.baht(t.pending)}</td><td class="num">${R.fmtNum(t.deals)}</td></tr></tbody></table></div>`;
  }
  /* KOL tier mix (Row 2, right) — donut of committed deals by tier · Spend / Deals · total in the middle · legend table beside it */
  const TIER_VAR = { Mega: 'mega', Macro: 'macro', 'Mid-tier': 'mid', Micro: 'micro', Nano: 'nano' };
  const tierColor = t => (TIER_VAR[t] ? css(`--tier-${TIER_VAR[t]}`) : css('--series-grey'));
  const tierCard = () => `<div class="card tmix"><div class="card-head"><h3>${esc(O.tierTitle)} ${info(O.tierTip, O.tierTitle)}</h3><div class="btns ov-ctl">
      <button type="button" class="icon-btn" data-tact="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>${dlMenu('tiermix')}
      <button type="button" class="icon-btn" data-tact="expand" title="${esc(O.expand)}" aria-label="${esc(O.expand)}">${ICON.expand}</button></div></div>
    <div class="tm-ctl"><div class="seg" data-tmix="measure"><button type="button" data-v="spend">${esc(O.mSpend)}</button><button type="button" data-v="deals">${esc(O.mDeals)}</button></div></div><div id="ov_tmix" class="tm-body"></div></div>`;
  const tierHTML = id => `<div class="tm-wrap"><div class="tm-donut chartbox" id="${id}_box"><svg id="${id}_svg" role="img" aria-label="${esc(O.tierTitle)}"></svg><div class="tip" id="${id}_tip"></div></div><table class="tm-leg" id="${id}_leg"></table></div>`;
  function renderTier(s, from, to) {
    const A = ov.all, m = R.tierMix(s, from, to, td(), A.inclCancel);
    document.querySelectorAll('#ov_body [data-tmix] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.tierMeasure));
    $('ov_body').querySelector('[data-tact="table"]').classList.toggle('on', A.tierView === 'table');
    ov.lastTier = m;
    if (A.tierView === 'table') { $('ov_tmix').innerHTML = `<div class="tablewrap">${tableOf(KT.export.rowsFor('tiermix', allX()))}</div>`; return; }
    $('ov_tmix').innerHTML = tierHTML('ov_tm');
    drawDonut('ov_tm', m, A.tierMeasure, 148);
  }
  /* square-ended ring slices with a 2px surface gap · Unknown = grey texture · hover / focus = tier · ฿ · deals · % */
  function drawDonut(id, m, meas, S) {
    const svg = $(id + '_svg'), tip = $(id + '_tip'), box = $(id + '_box'), cSurf = css('--surface');
    const val = x => (meas === 'spend' ? x.spend : x.deals), pctOf = x => (meas === 'spend' ? x.spendPct : x.dealsPct);
    const rows = m.rows.filter(x => val(x) > 0), total = meas === 'spend' ? m.total.spend : m.total.deals;
    const cx = S / 2, cy = S / 2, ro = S / 2 - 2, ri = ro * 0.62;
    svg.setAttribute('viewBox', `0 0 ${S} ${S}`); svg.setAttribute('width', S); svg.setAttribute('height', S);
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const arc = (a0, a1) => { const big = a1 - a0 > Math.PI ? 1 : 0; return `M${pt(ro, a0)} A${ro} ${ro} 0 ${big} 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${big} 0 ${pt(ri, a0)} Z`; };
    const fillOf = x => (x.tier === R.UNKNOWN_TIER ? `url(#${id}_tex)` : tierColor(x.tier));
    const text = x => O.tierSlice(x.tier, R.baht(x.spend), x.deals, pctOf(x).toFixed(1));
    let a = -Math.PI / 2, paths = '';
    rows.forEach((x, i) => {
      const sweep = val(x) / total * Math.PI * 2, a1 = a + sweep;
      const d = sweep >= Math.PI * 2 - 1e-6 ? arc(a, a + Math.PI) + arc(a + Math.PI, a + Math.PI * 2 - 1e-4) : arc(a, a1);
      paths += `<path class="sl" data-i="${i}" data-a="${(a + a1) / 2}" d="${d}" fill="${fillOf(x)}" stroke="${cSurf}" stroke-width="2" tabindex="0" aria-label="${esc(text(x))}"/>`;
      a = a1;
    });
    const defs = `<defs><pattern id="${id}_tex" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${css('--series-grey')}"/><rect width="2" height="6" fill="${cSurf}" opacity=".7"/></pattern></defs>`;
    const center = total ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="tm-c${S > 200 ? ' big' : ''}">${esc(meas === 'spend' ? bahtShort(total) : O.centerDeals(total))}</text>` : '';
    svg.innerHTML = defs + (rows.length ? paths : `<circle cx="${cx}" cy="${cy}" r="${(ro + ri) / 2}" fill="none" stroke="${css('--surface-3')}" stroke-width="${ro - ri}"/>`) + center;
    $(id + '_leg').innerHTML = `<thead><tr><th>${esc(O.tierLabel)}</th><th>${esc(O.colFollowers)}</th><th class="num">${esc(meas === 'spend' ? O.mSpend : O.mDeals)}</th><th class="num">%</th></tr></thead><tbody>` +
      rows.map(x => `<tr><td><span class="tn"><i class="sw${x.tier === R.UNKNOWN_TIER ? ' tex' : ''}" style="background-color:${tierColor(x.tier)}"></i>${esc(x.tier)}</span></td><td class="rg">${esc(KT.export.followers(x))}</td>` +
        `<td class="num">${esc(meas === 'spend' ? R.baht(x.spend) : R.fmtNum(x.deals))}</td><td class="num">${pctOf(x).toFixed(1)}%</td></tr>`).join('') + `</tbody>`;
    const show = el => {
      const x = rows[+el.dataset.i], am = +el.dataset.a, r = (ro + ri) / 2, rect = box.getBoundingClientRect(), sc = rect.width ? Math.min(1, rect.width / S) : 1;
      tip.textContent = ''; const t = document.createElement('div'); t.className = 'r tot'; t.textContent = text(x); tip.appendChild(t);
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
  /* Activity by campaign — one swimlane per Campaign, a shared x axis and one y scale */
  const swimCard = () => `<div class="card swim"><div class="card-head"><h3>${esc(O.swimTitle)}</h3><div class="btns ov-ctl">
      <div class="seg" data-swim="measure"><button type="button" data-v="posts">${esc(O.mPosts)}</button><button type="button" data-v="spend">${esc(O.mSpend)}</button></div>
      <button type="button" class="icon-btn" data-sact="table" title="${esc(O.tableView)}" aria-label="${esc(O.tableView)}">${ICON.table}</button>
      ${dlMenu('activity')}
      <button type="button" class="icon-btn" data-sact="expand" title="${esc(O.expand)}" aria-label="${esc(O.expand)}">${ICON.expand}</button></div></div>
    <div class="legend"><span class="lg"><i style="background:var(--text-2)"></i>${esc(O.colPosted)}</span><span class="lg"><i class="planned"></i>${esc(O.planned)}</span></div>
    <div class="chartbox" id="ov_swimbox"><svg id="ov_swim" role="img" aria-label="${esc(O.swimTitle)}"></svg><div class="tip" id="ov_swimtip"></div></div>
    <div class="tablewrap hidden" id="ov_swimtable" style="max-height:320px"></div><div class="foot-note" id="ov_swimfoot"></div></div>`;
  function swimModel(s, from, to) {
    /* CR-09 §4.2: bars by week when the range is longer than 92 days, else by day — the axis says it one way */
    const axis = R.timeAxis(from, to), gran = axis.gran, m = R.swimlanes(s, from, to, gran, ov.all.measure, td(), ov.all.inclCancel);
    m.lanes.forEach(l => { l.color = l.slot >= 0 && l.slot < 8 ? css(`--ph${l.slot + 1}`) : css('--series-grey'); });
    return Object.assign(m, { from, to, gran, axis, measure: ov.all.measure, td: td() });
  }
  function renderSwim(s, from, to) {
    const m = swimModel(s, from, to), A = ov.all;
    document.querySelectorAll('#ov_body [data-swim] button').forEach(b => b.classList.toggle('on', b.dataset.v === A.measure));
    $('ov_body').querySelector('[data-sact="table"]').classList.toggle('on', A.view === 'table');
    $('ov_swimbox').classList.toggle('hidden', A.view !== 'chart'); $('ov_swimtable').classList.toggle('hidden', A.view !== 'table');
    drawSwim($('ov_swim'), $('ov_swimbox'), $('ov_swimtip'), m);
    if (A.view === 'table') $('ov_swimtable').innerHTML = tableOf(KT.export.rowsFor('activity', allX()));
    const undated = m.lanes.reduce((a, l) => a + (m.measure === 'spend' ? l.undated.amount : l.undated.count), 0), outside = m.lanes.reduce((a, l) => a + l.outside, 0);
    $('ov_swimfoot').textContent = [undated ? (m.measure === 'spend' ? O.undatedSpend(R.baht(undated)) : O.undatedPosts(undated)) : '', outside ? O.outsideRange(outside) : ''].filter(Boolean).join(' · ');
    ov.lastSwim = m;
  }
  function drawSwim(svg, box, tip, md) {
    tip.classList.remove('show');
    const LANE = 56 + (md.laneExtra || 0), LABEL = Math.min(170, Math.max(110, (box.clientWidth || 800) * 0.18)), W = Math.max(320, box.clientWidth || 800), m = { l: LABEL, r: 12, t: 8, b: 26 };
    /* a campaign name wraps onto more lines (never cut with …) and its lane grows to fit */
    const names = md.lanes.map(l => wrapText(l.campaign.campaign_name, LABEL - 14)), LH = names.map(t => Math.max(LANE, 14 * t.length + 34));
    const tops = LH.map((x, i) => m.t + LH.slice(0, i).reduce((a, y) => a + y, 0));
    const H = m.t + LH.reduce((a, y) => a + y, 0) + m.b, iw = W - m.l - m.r, cGrid = css('--grid'), cAxis = css('--muted'), cAcc = css('--accent');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    if (!md.lanes.length || !md.keys.length) { svg.setAttribute('height', 80); svg.innerHTML = `<text x="${W / 2}" y="40" text-anchor="middle" class="axis">${esc(O.noCampaignInRange)}</text>`; return; }
    const n = md.keys.length, band = iw / n, bw = Math.max(2, Math.min(18, band * 0.7)), step = md.gran === 'week' ? 7 : 1, inner = LANE - 14;
    const max = Math.max(1, md.max), y0 = i => tops[i] + LH[i] - 6, h = v => v / max * inner;
    let g = '', marks = '', hits = '';
    md.lanes.forEach((l, i) => {
      const top = tops[i], nl = names[i], ny = top + (nl.length > 1 ? 16 : 22);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y0(i)}" y2="${y0(i)}" stroke="${cGrid}"/>` +
        `<text x="8" y="${ny}" class="axis lane-n${l.posted + l.planned ? '' : ' empty'}">${nl.map((t, k) => `<tspan x="8" dy="${k ? 14 : 0}">${esc(t)}</tspan>`).join('')}</text><text x="8" y="${ny + 14 * (nl.length - 1) + 16}" class="axis">${esc(O.laneCount(fmtV(l.posted + l.planned, md.measure), md.measure))}</text>`;
      l.bins.forEach((b, j) => {
        const x = m.l + band * j + band / 2 - bw / 2;
        if (b.posted) marks += `<rect x="${x}" y="${y0(i) - h(b.posted)}" width="${bw}" height="${h(b.posted)}" fill="${l.color}"/>`;
        if (b.planned) { const hp = h(b.planned), yb = y0(i) - h(b.posted) - (b.posted ? 2 : 0); marks += `<rect x="${x}" y="${yb - hp}" width="${bw}" height="${hp}" fill="${l.color}" fill-opacity=".4" stroke="${l.color}" stroke-width="1"/>`; }
        if (b.total) hits += `<rect class="hit" data-l="${i}" data-b="${j}" x="${m.l + band * j}" y="${top}" width="${band}" height="${LH[i]}" tabindex="0" aria-label="${esc(`${l.campaign.campaign_name} · ${binTitle(b.key, md.gran)}: ${fmtV(b.total, md.measure)}`)}"/>`;
      });
    });
    /* x axis (CR-09 §4.2): one row — each tick has its grid line and its label sits on it; a label that would touch the one before is left out */
    const xOfD = d => m.l + (R.dayDiff(d, md.keys[0]) + (md.gran === 'day' ? 0.5 : 0)) / step * band;
    const pts = md.axis.ticks.map(tk => ({ tk, x: xOfD(tk.date) })).filter(p => p.x >= m.l - 0.5 && p.x <= W - m.r + 0.5);
    const gap = pts.length > 1 ? Math.min(...pts.slice(1).map((p, i) => p.x - pts[i].x)) : Infinity, wMax = Math.max(0, ...pts.map(p => p.tk.label.length * 6 + 2));
    const every = Math.max(1, Math.ceil((wMax + 8) / gap));
    let labels = '';
    pts.forEach((p, i) => {
      labels += `<line x1="${p.x}" x2="${p.x}" y1="${m.t}" y2="${H - m.b}" stroke="${cGrid}"/>`;
      if (i % every) return;
      const w = p.tk.label.length * 6 + 2, anchor = p.x - w / 2 < m.l ? 'start' : p.x + w / 2 > W - m.r ? 'end' : 'middle';
      labels += `<text x="${p.x}" y="${H - m.b + 16}" text-anchor="${anchor}" class="axis">${esc(p.tk.label)}</text>`;
    });
    let now = '';
    if (md.td >= md.keys[0] && md.td <= R.addDays(md.keys[n - 1], step - 1)) {
      const tx = m.l + R.dayDiff(md.td, md.keys[0]) / step * band + band / step / 2;
      now = `<line x1="${tx}" x2="${tx}" y1="${m.t}" y2="${H - m.b}" stroke="${cAcc}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${tx + 4}" y="${m.t + 10}" class="axis today-l">${esc(O.today)}</text>`;
    }
    svg.innerHTML = g + labels + `<g>${hits}</g><g style="pointer-events:none">${marks}</g><line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="${cAxis}"/>` + now;
    const show = (i, j) => {
      const l = md.lanes[i], b = l.bins[j]; tip.textContent = '';
      const add = (cls, t) => { const el = document.createElement('div'); el.className = cls; el.textContent = t; tip.appendChild(el); };
      add('d', binTitle(b.key, md.gran)); add('r tot', l.campaign.campaign_name); add('d', O.postedPlanned(fmtV(b.posted, md.measure), fmtV(b.planned, md.measure)));
      const rect = box.getBoundingClientRect(), sc = rect.width / W; let left = (m.l + band * j + band / 2) * sc + 12;
      if (left + 200 > rect.width) left = (m.l + band * j + band / 2) * sc - 210;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = tops[i] * sc + 'px'; tip.classList.add('show');
    };
    svg.querySelectorAll('.hit').forEach(r => { const i = +r.dataset.l, j = +r.dataset.b;
      r.addEventListener('pointerenter', () => show(i, j)); r.addEventListener('focus', () => show(i, j));
      r.addEventListener('pointerleave', () => tip.classList.remove('show')); r.addEventListener('blur', () => tip.classList.remove('show')); });
  }
  /* whole words per line (a word longer than a line breaks inside it) — names are never cut */
  const wrapText = (t, w) => {
    const n = Math.max(4, Math.floor(w / 7)), out = [];
    String(t).split(/ +/).forEach(word => {
      while (word.length > n) { out.push(word.slice(0, n)); word = word.slice(n); }
      const last = out.length ? out[out.length - 1] : null;
      if (last != null && last.length + 1 + word.length <= n) out[out.length - 1] = last + ' ' + word; else out.push(word);
    });
    return out;
  };
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
      <div class="card ov-full"><div class="card-head"><h3>${esc(O.allocTitle)}</h3><div class="btns ov-ctl">${dlMenu('allocation')}</div></div><div id="ov_alloc"></div></div>
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
    const deals = `<div class="kpi scard"><div class="l">${esc(O.deals)} ${info(O.dealsTip, O.deals)}</div><div class="v">${R.fmtNum(D1.active)}</div>` +
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
    const posts = `<div class="kpi scard"><div class="l">${esc(O.posts)} ${info(O.postsCardTip, O.posts)}</div><div class="v">${R.fmtNum(P.posted)} <small>${esc(O.ofPlanned(R.fmtNum(P.planned)))}</small></div>` +
      `<div class="pfrow">${P.byPlatform.map(x => `<span class="${x.posted ? '' : 'muted'}" title="${esc(O.platformTip(x.platform, x.posted, x.planned))}">${pfIcon(x.platform, x.posted ? 'posted' : 'planned', O.platformTip(x.platform, x.posted, x.planned))} ${esc(x.platform)} ${x.posted}</span>`).join('')}</div>` +
      productsLine(s, scope) + `</div>`;
    const kv2 = (l, v) => `<span class="k">${esc(l)}</span><b>${esc(v)}</b>`;
    const eng = `<div class="kpi scard"><div class="l">${esc(O.engagement)} ${info(O.engagementTip, O.engagement)}</div>` + (E ? `<div class="egrid">` +
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
    if (item.kind === 'pillar') return css(['--pl-aw', '--pl-co', '--pl-cv'][item.slot]);
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
      return `<span class="lg" title="${esc(O.legendTip(x.label, fmtV(t.posted, m.measure), fmtV(t.planned, m.measure)))}"><i class="${x.grey ? 'tex' : ''}" style="background-color:${x.color}"></i>${esc(x.label)} <b>${esc(fmtV(t.posted + t.planned, m.measure))}</b></span>`; }).join('') +
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
    const cBand = css('--band'), cSep = css('--muted');
    md.strip.forEach(p => {
      const a = Math.max(m.l, xOf(p.from)), z = Math.min(W - m.r, xOf(R.addDays(p.to, 1))); if (z <= a) return;
      strip += `<rect x="${a + 1}" y="${m.t - 12}" width="${Math.max(1, z - a - 2)}" height="6" fill="${cBand}"><title>${esc(`${p.label} · ${R.dmy(p.from)} – ${R.dmy(p.to)}`)}</title></rect>` +
        (stripLabel(p.label, z - a - 4) ? `<text x="${a + 2}" y="${m.t - 16}" class="axis strip-l">${esc(stripLabel(p.label, z - a - 4))}</text>` : '');
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
    const row = (name, dot, period, budget, pct, committed, pending, posts, cls) => {
      const m = R.moneyOf(budget, committed, pending, 0);
      return `<tr class="${cls || ''}"><td class="pname">${dot}<span>${esc(name)}</span></td><td class="nowrap">${period}</td>` +
        `<td class="num" title="${esc(pct == null ? '' : O.pctOfCampaign(Math.round(pct)))}">${money(budget)}</td><td class="num"><span class="${m.remaining < 0 ? 'late' : ''}">${R.baht(committed)}</span></td>` +
        `<td>${budget != null ? usedBar(m.usedPct) : '<span class="muted">—</span>'}</td><td class="num">${remainingText(m.remaining)}</td><td class="num muted">${pending ? R.baht(pending) : '—'}</td><td class="num">${posts == null ? '' : R.fmtNum(posts)}</td></tr>`;
    };
    const rows = pb.rows.map(r => row(R.phaseName(s, r.phase.phase_id), `<span class="dotc" style="background:${colorOf({ slot: r.slot, kind: 'phase' })}"></span>`, `${esc(dm(r.phase.start_date))}–${esc(dm(r.phase.end_date))}`,
      r.budget, r.budgetPct, r.committed, r.shortlist, r.posts, r.phase.phase_id === ov.camp.phase ? 'selected' : '')).join('') +
      pb.extra.map(x => `<tr class="click extra${x.key === R.NEEDS ? ' warn' : ''}" data-godeals="${esc(x.key)}"><td class="pname"><span>${esc(x.key === R.NEEDS ? O.needsPhase : O.unscheduled)}</span></td><td></td><td></td><td class="num">${R.baht(x.committed)}</td><td></td><td></td><td></td><td class="num">${x.posts ? R.fmtNum(x.posts) : ''}</td></tr>`).join('');
    const t = pb.total;
    $('ov_pbudget').innerHTML = `<div class="tablewrap"><table class="tbl compact-sm pbudget"><thead><tr><th class="pname">${esc(O.colPhase)}</th><th>${esc(O.colPeriod)}</th><th class="num">${esc(MN.budget.h)}</th>` +
      `<th class="num">${esc(MN.committed.h)} ${info(MN.committed)}</th><th>${esc(MN.used.h)} ${info(MN.used)}</th><th class="num">${esc(MN.remaining.h)} ${info(MN.remaining)}</th><th class="num">${esc(MN.pending.h)} ${info(MN.pending)}</th><th class="num">${esc(O.colPosts)}</th></tr></thead><tbody>${rows}` +
      row(O.campaignTotal, '', '', t.budget, null, t.committed, t.shortlist, t.posts, 'total') + `</tbody></table></div>`;
  }
  function renderAllocation(s) {
    const a = R.pillarAllocation(s, ov.camp.campaign), keys = R.PILLARS.concat([R.NOT_SET]);
    const col = k => (k === R.NOT_SET ? css('--series-grey') : css(['--pl-aw', '--pl-co', '--pl-cv'][R.PILLARS.indexOf(k)]));
    const lab = k => (k === R.NOT_SET ? O.pillarNotSet : k);
    /* CR-07 §4.2: every segment says its ฿ and % (Target ฿ = its % of what is committed) */
    const bar = (pct, money) => `<div class="abar">${keys.map(k => (pct[k] ? `<span class="${k === R.NOT_SET ? 'tex' : ''}" style="flex:${pct[k]};background-color:${col(k)}" title="${esc(`${lab(k)} · ${Math.round(pct[k])}% · ${R.baht(Math.round(money ? money[k] : pct[k] / 100 * a.actual.total))}`)}"></span>` : '')).join('')}</div>`;
    const pp = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}pp`);
    const gap = `<div class="agap">${R.PILLARS.map(p => `<span title="${esc(O.gapTip)}"><i style="background:${col(p)}"></i>${esc(p)} <b class="${Math.abs(a.actual.gap[p] || 0) >= 10 ? 'warn' : ''}">${esc(pp(a.actual.gap[p]))}</b></span>`).join('')}</div>`;
    const line = (label, body, cls) => `<div class="arow2${cls ? ' ' + cls : ''}"><div class="al">${label}</div>${body}</div>`;
    const camp = R.campaignOf(s, ov.camp.campaign) || {};
    $('ov_alloc').innerHTML = `<div class="slegend alegend">${keys.map(k => `<span><i class="${k === R.NOT_SET ? 'tex' : ''}" style="background-color:${col(k)}"></i>${esc(lab(k))}</span>`).join('')}</div>` +
      line(esc(O.target), bar(a.target.pct)) +
      line(`<b>${esc(O.actualOf(camp.campaign_name || ''))}</b>`, bar(a.actual.pct, a.actual.money) + gap) +
      a.phases.map(p => line(esc(R.phaseName(s, p.phase.phase_id)), p.total ? bar(p.pct, p.money) : `<span class="muted small">${esc(O.noCommitted)}</span>`, p.phase.phase_id === ov.camp.phase ? 'sel' : '')).join('');
  }
  /* CR-07 §4.2 — Workload by PIC of this Campaign (and Phase): most open deals first · Total · your row lit · a row opens Operations on that PIC */
  function renderCampaignWorkload(s, scope) {
    const rows = R.workloadByPic(s, scope, td()), sum = k => rows.reduce((a, r) => a + r[k], 0), mine = R.picName(U.me());
    $('ov_cwork').innerHTML = !rows.length ? `<div class="hint">${esc(O.noActive)}</div>` : `<div class="tablewrap"><table class="tbl compact-sm wl"><thead><tr><th>${esc(O.picLabel)}</th><th class="num">${esc(O.colOpen)}</th><th class="num">${esc(O.queues.overdue)}</th><th class="num">${esc(O.queues.unpaid)}</th><th class="num">${esc(O.colCommittedOpen)} ${info(MN.committed)}</th></tr></thead><tbody>` +
      rows.map(r => `<tr class="click${r.pic && r.pic === mine ? ' selected' : ''}" tabindex="0" data-gopic="${esc(r.pic || '__none')}" title="${esc(O.workloadTip)}"><td>${r.pic ? `<span class="picplain"><span class="av sm">${esc(initials(r.pic))}</span><span class="nm">${esc(r.pic)}</span></span>` : `<span class="muted">${esc(O.noPic)}</span>`}</td>` +
        `<td class="num">${R.fmtNum(r.open)}</td><td class="num${r.overdue ? ' late' : ''}">${R.fmtNum(r.overdue)}</td><td class="num">${R.fmtNum(r.unpaid)}</td><td class="num">${R.baht(r.committed)}</td></tr>`).join('') +
      `<tr class="total"><td>${esc(O.colTotal)}</td><td class="num">${R.fmtNum(sum('open'))}</td><td class="num">${R.fmtNum(sum('overdue'))}</td><td class="num">${R.fmtNum(sum('unpaid'))}</td><td class="num">${R.baht(sum('committed'))}</td></tr></tbody></table></div>`;
  }
  function expand() {
    const md = ov.tab === 'all' ? ov.lastSwim : ov.lastModel; if (!md) return;
    openDialog(`<div class="dlg-h">${esc(ov.tab === 'all' ? O.swimTitle : O.activityTitle)} · ${esc(R.dmy(md.from))} – ${esc(R.dmy(md.to))}</div><div class="dlg-b">${ov.tab === 'all' ? '' : `<div class="legend">${$('ov_legend').innerHTML}</div>`}<div class="chartbox" id="ovx_box"><svg id="ovx_svg" role="img"></svg><div class="tip" id="ovx_tip"></div></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ovx_close">${esc(C.common.close)}</button></div>`, true);
    $('ovx_close').addEventListener('click', closeDialog);
    if (ov.tab === 'all') drawSwim($('ovx_svg'), $('ovx_box'), $('ovx_tip'), Object.assign({}, md, { laneExtra: 0 })); else renderActivityChart($('ovx_svg'), $('ovx_box'), $('ovx_tip'), md, 440);
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
    const ctx = R.dealContext(s), Q = R.opsQueues(s, f, td(), ctx);
    const keys = R.QUEUES.filter(k => Q[k].length);
    if (!ov.ops.queue || !keys.includes(ov.ops.queue)) ov.ops.queue = keys[0] || null;
    /* CR-08 §4.8 — payments of this PIC: documents missing · ready to pay (open Payments › To pay with that filter) */
    const pq = R.payQueue(s, td()).items.filter(x => (!f.pic || (f.pic === '__none' ? !x.pic : x.pic === f.pic)) && (!f.campaign || x.campaign_id === f.campaign));
    const payCards = [['missing', 'missing_docs', O.payDocsMissing], ['ready', 'ready', O.payReady]].map(([q, st, label]) => [q, pq.filter(x => x.status === st).length, label]).filter(c => c[1])
      .map(([q, n, label]) => `<button type="button" class="qcard pay" data-gopay="${q}"><span class="n">${R.fmtNum(n)}</span><span class="t">${esc(label)} →</span></button>`).join('');
    const cards = keys.map(k => `<button type="button" class="qcard${k === ov.ops.queue ? ' on' : ''}" data-queue="${k}" aria-pressed="${k === ov.ops.queue}"><span class="n">${R.fmtNum(Q[k].length)}</span><span class="t">${esc(O.queues[k])}</span></button>`).join('');
    $('ov_body').innerHTML = `<div class="qcards">${cards || `<div class="allclear">✓ ${esc(O.allClear)}</div>`}${payCards}</div>` +
      (ov.ops.queue ? `<div class="card" style="margin:16px 0"><div class="card-head"><h3>${esc(O.queues[ov.ops.queue])} <span class="muted">${R.fmtNum(Q[ov.ops.queue].length)}</span></h3>` +
        `<div class="btns ov-ctl">${dlMenu('queue')}</div><div class="btns hidden" id="ov_qbulk"><b id="ov_qselN"></b>${can('deal.edit') ? `<button type="button" class="btn small" data-qbulk="pic">${esc(C.deal.reassign)}</button><button type="button" class="btn small" data-qbulk="pillar">${esc(C.deal.setPillar)}</button>` : ''}<button type="button" class="btn small ghost" data-qclear>${esc(C.deal.clear)}</button></div></div><div id="ov_qtable"></div></div>` : '') +
      `<div class="ov-half"><div class="card"><div class="card-head"><h3>${esc(O.pipelineTitle)}</h3></div><div class="hbars" id="ov_pipe"></div><div class="foot-note" id="ov_pipeFoot"></div></div>` +
      `<div class="card"><div class="card-head"><h3>${esc(O.dueTitle)}</h3></div><div id="ov_due"></div></div></div>`;
    if (ov.ops.queue === 'noProducts') renderCampaignQueue(s, Q.noProducts); else if (ov.ops.queue) renderQueue(s, Q[ov.ops.queue], ctx);
    renderOpsPipeline(s, f, ctx); renderDue(s, f, ctx);
  }
  function renderQueue(s, deals, ctx) {
    const rows = R.queueRows(s, ov.ops.queue, deals, td(), ctx), shown = rows.slice(0, ov.ops.limit), edit = can('deal.edit'), D2 = KT.screens.deals;
    [...ov.ops.selected].forEach(id => { if (!deals.some(d => d.deal_id === id)) ov.ops.selected.delete(id); });
    const where = d => { const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), c = ctx.campaigns.get(d.campaign_id) || {}; return `${c.campaign_name || ''}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`; };
    $('ov_qtable').innerHTML = `<div class="tablewrap" style="max-height:480px"><table class="tbl qtbl"><thead><tr>${edit ? `<th class="cb"><input type="checkbox" id="ov_qall" aria-label="${esc(C.deal.selectAll)}"></th>` : ''}` +
      `<th>${esc(O.colKol)}</th><th>${esc(O.colCampaignPhase)}</th><th>${esc(O.colStage)}</th><th>${esc(O.picLabel)}</th><th>${esc(O.colIssue)}</th><th class="num">${esc(O.colTotal)}</th><th></th></tr></thead><tbody>` +
      shown.map(r => { const d = r.deal, k = ctx.kols.get(d.kol_id) || {};
        return `<tr data-qid="${esc(d.deal_id)}">${edit ? `<td class="cb"><input type="checkbox" data-qsel="${esc(d.deal_id)}"${ov.ops.selected.has(d.deal_id) ? ' checked' : ''} aria-label="${esc(k.display_name || d.deal_id)}"></td>` : ''}` +
          `<td><b>${esc(k.display_name || d.kol_id)}</b></td><td class="muted cph">${esc(where(d))}</td><td>${U.stageCell(d, R.logsOf(s, d.deal_id))}</td><td>${D2.picCell(d)}</td>` +
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
    const t = td(), rows = R.upcomingDues(s, f, t, 7, ctx);
    const when = d => (d === t ? O.dueToday : d === R.addDays(t, 1) ? O.dueTomorrow : dm(d));
    const where = d => { const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), c = ctx.campaigns.get(d.campaign_id) || {}; return `${c.campaign_name || ''}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`; };
    const allPics = !f.pic;   // All PICs: who each deal belongs to (CR-09 §4.6)
    $('ov_due').innerHTML = !rows.length ? `<div class="muted">${esc(O.dueNone)}</div>` : `<div class="tablewrap"><table class="tbl compact-sm duet"><thead><tr><th>${esc(O.colDue)}</th><th>${esc(O.colKol)}</th><th>${esc(O.colCampaignPhase)}</th><th>${esc(O.colStep)}</th>${allPics ? `<th>${esc(O.picLabel)}</th>` : ''}<th></th></tr></thead><tbody>` +
      rows.map(r => { const d = r.deal, k = ctx.kols.get(d.kol_id) || {};
        return `<tr><td class="nowrap${r.due === t ? ' warn' : ''}">${esc(when(r.due))}</td><td><b>${esc(k.display_name || d.kol_id)}</b></td><td class="muted cph">${esc(where(d))}</td><td class="nowrap">${esc(R.stepShort(r.step ? r.step.sub_status : ''))}</td>${allPics ? `<td>${esc(d.pic || O.noPic)}</td>` : ''}` +
          `<td><button type="button" class="btn small" data-open="${esc(d.deal_id)}">${esc(O.open)}</button></td></tr>`; }).join('') + `</tbody></table></div>`;
  }

  /* ===================== events ===================== */
  function onToolsClick(e) {
    const ex = e.target.closest('[data-export]'); if (ex) { exportTab(ex.dataset.export); return; }
    const p = e.target.closest('[data-preset]');
    if (p) {
      if (p.dataset.preset === 'custom') { const [a, z] = allRange(); ov.all.custom = { from: a, to: z }; renderAll(); const c = $('ov_customPop'); if (c) c.querySelector('.dtext').focus(); return; }
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
    else if (t.id === 'ov_inclCancel') { ov.all.inclCancel = t.checked; renderAll(); }
    else if (t.id === 'ov_cfrom' || t.id === 'ov_cto') { if (ov.all.custom) ov.all.custom[t.id === 'ov_cfrom' ? 'from' : 'to'] = t.value; }   // nothing changes until Apply
  }
  function onBodyClick(e) {
    const D2 = KT.screens.deals;
    const dl = e.target.closest('[data-dl]'); if (dl) { const d = dl.closest('details'); if (d) d.open = false; downloadWidget(dl.dataset.w, dl.dataset.dl); return; }
    const ps = e.target.closest('[data-psort]'); if (ps) { const k = ps.dataset.psort, so = ov.all.sort; ov.all.sort = so && so.key === k ? (so.dir === 'asc' ? { key: k, dir: 'desc' } : null) : { key: k, dir: 'asc' }; renderPortfolio(); return; }
    const tm = e.target.closest('[data-tmix] button'); if (tm) { ov.all.tierMeasure = tm.dataset.v; renderTier(state(), ...allRange()); fitSwim(); return; }
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
    const gpy = e.target.closest('[data-gopay]'); if (gpy) { const f = opsFilter(); go('payments', { tab: 'topay', pic: f.pic, campaign: f.campaign || '', queue: gpy.dataset.gopay }); return; }
    const q = e.target.closest('[data-queue]'); if (q) { ov.ops.queue = q.dataset.queue; ov.ops.limit = 50; ov.ops.selected.clear(); renderOps(); return; }
    if (e.target.id === 'ov_qall') { const on = e.target.checked; document.querySelectorAll('#ov_qtable [data-qsel]').forEach(c => { c.checked = on; on ? ov.ops.selected.add(c.dataset.qsel) : ov.ops.selected.delete(c.dataset.qsel); }); qBulk(); return; }
    const qs = e.target.closest('[data-qsel]'); if (qs) { qs.checked ? ov.ops.selected.add(qs.dataset.qsel) : ov.ops.selected.delete(qs.dataset.qsel); qBulk(); return; }
    if (e.target.closest('[data-qmore]')) { ov.ops.limit += 50; renderOps(); return; }
    if (e.target.closest('[data-qclear]')) { ov.ops.selected.clear(); renderOps(); return; }
    const qb = e.target.closest('[data-qbulk]'); if (qb) { const ids = [...ov.ops.selected]; ov.ops.selected.clear(); D2.openBulkField(qb.dataset.qbulk, ids); return; }
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
