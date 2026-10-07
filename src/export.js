/* export.js — CR-09 §4.5: the rows behind each Dashboard widget. The table view, the download (.xlsx / CSV) and the whole-tab Export all
   read them, so a file says what the screen says. Numbers stay numbers (no ฿, no commas) · % as a decimal (0.65) · dates dd/mm/yyyy ·
   a Total row where the widget has one. Nothing comes from the Payee vault. No DOM — the screen downloads. → KT.export
   x (All campaigns) = { state, from, to, today, inclCancel, measure ('posts' | 'spend'), sort {key, dir} }
   x (By campaign)   = { state, campaignId, phaseId, today, gran ('day' | 'week'), measure, colorBy ('pillar' | 'tier') }
   x (Operations)    = { state, f {pic ('' = all), campaign, tier}, picLabel, today, queue }
   x (Performance, CR-10 §4.7) = { state, rows (R.perfRows as on screen: scope · filters · sort), cols (the columns that are on) } */
KT.export = (function (R, C) {
  'use strict';
  const O = C.overview, MN = C.money;
  const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
  const dec = pct => (pct == null ? null : Math.round(pct * 100) / 10000);   // 64.9 % → 0.649
  const dmy = d => (d ? R.dmy(d) : '');
  const statusLabel = st => C.phaseStatus[st] || st || '';
  const daysText = d => (d.kind === 'left' ? O.daysLeft.left(d.n) : d.kind === 'starts' ? O.daysLeft.starts(d.n) : O.daysLeft[d.kind]);
  /* in a file: the number of days for an On going Campaign (0 on its last day), the words otherwise */
  const daysCell = d => (d.kind === 'left' ? d.n : d.kind === 'last' ? 0 : d.kind === 'none' ? '' : daysText(d));
  const followers = x => (!x.range ? O.noFollowers : O.followers(R.fmtNum(x.range.min), x.range.max == null ? null : R.fmtNum(x.range.max - 1)));

  /* ===================== All campaigns ===================== */
  /* Campaign portfolio (§4.1 Row 3): the rows on screen, in the order on screen */
  const SORTS = {
    campaign: r => r.campaign.campaign_name.toLowerCase(), status: r => statusLabel(r.status), period: r => r.from || '', days: r => R.daysLeftRank(r.days),
    budget: r => (r.budget == null ? -Infinity : r.budget), committed: r => r.committed, used: r => (r.usedPct == null ? -Infinity : r.usedPct),
    remaining: r => (r.remaining == null ? -Infinity : r.remaining), pending: r => r.pending, deals: r => r.deals,
  };
  const cmp = (a, b) => (Array.isArray(a) ? (a[0] - b[0]) || (a[1] - b[1]) : typeof a === 'string' ? a.localeCompare(b, 'th') : a - b);
  function portfolioModel(x) {
    const p = R.portfolio(x.state, x.from, x.to, x.today, x.inclCancel);
    const rows = p.rows.map(r => Object.assign({}, r, { days: R.daysLeft({ status: r.status, from: r.from, to: r.to }, x.today) }));
    if (x.sort && SORTS[x.sort.key]) { const f = SORTS[x.sort.key], k = x.sort.dir === 'desc' ? -1 : 1; rows.sort((a, b) => k * cmp(f(a), f(b))); }
    return { rows, total: p.total };
  }
  function portfolio(x) {
    const m = portfolioModel(x), t = m.total;
    return { key: 'portfolio', name: O.sheet.portfolio,
      header: [O.colCampaign, O.colStatus, O.colFrom, O.colTo, O.colDaysLeft, MN.budget.h, MN.committed.h, MN.used.h, MN.remaining.h, MN.pending.h, O.deals],
      rows: m.rows.map(r => [r.campaign.campaign_name, statusLabel(r.status), dmy(r.from), dmy(r.to), daysCell(r.days), r.budget, r2(r.committed), dec(r.usedPct), r2(r.remaining), r2(r.pending), r.deals]),
      total: [O.colTotal, '', '', '', '', t.budget, r2(t.committed), dec(t.usedPct), r2(t.remaining), r2(t.pending), t.deals] };
  }
  /* KOL tier mix (§4.1 Row 2): every tier with a committed deal — spend and deals with their shares */
  function tiermix(x) {
    const m = R.tierMix(x.state, x.from, x.to, x.today, x.inclCancel);
    return { key: 'tiermix', name: O.sheet.tiermix,
      header: [O.tierLabel, O.colFollowers, O.mSpend, `${O.mSpend} %`, O.mDeals, `${O.mDeals} %`],
      rows: m.rows.filter(t => t.deals).map(t => [t.tier, followers(t), r2(t.spend), dec(t.spendPct), t.deals, dec(t.dealsPct)]),
      total: [O.colTotal, '', r2(m.total.spend), m.total.spend ? 1 : 0, m.total.deals, m.total.deals ? 1 : 0] };
  }
  /* CR-13 §4.2 — Pillar mix: the rows of the card (Not set last) · % of total · Target and the gap of the share within the deals with a pillar (Spend) */
  function pillarmix(x) {
    const m = R.pillarMix(x.state, x.from, x.to, x.today, x.inclCancel), lab = k => (k === R.NOT_SET ? O.notSet : k);
    return { key: 'pillarmix', name: O.sheet.pillarmix,
      header: [O.pillarLabel, O.mSpend, `${O.mSpend} %`, O.mDeals, `${O.mDeals} %`, `${O.target} %`, `${O.delta} (pp)`],
      rows: m.rows.map(p => [lab(p.pillar), r2(p.spend), dec(p.spendPct), p.deals, dec(p.dealsPct), p.target == null ? '' : dec(p.target), p.gap.spend == null ? '' : Math.round(p.gap.spend * 10) / 10]),
      total: [O.colTotal, r2(m.total.spend), m.total.spend ? 1 : 0, m.total.deals, m.total.deals ? 1 : 0, '', ''] };
  }
  /* Activity by campaign (§4.2): a row per bar (week or day), a column per Campaign */
  function activity(x) {
    const ax = R.timeAxis(x.from, x.to), m = R.swimlanes(x.state, x.from, x.to, ax.gran, x.measure, x.today, x.inclCancel);
    const v = n => (x.measure === 'spend' ? r2(n) : n);
    return { key: 'activity', name: O.sheet.activity, gran: ax.gran,
      header: [ax.gran === 'week' ? O.colWeekStart : O.colDay].concat(m.lanes.map(l => l.campaign.campaign_name), [O.colTotal]),
      rows: m.keys.map((k, i) => [dmy(k)].concat(m.lanes.map(l => v(l.bins[i].total)), [v(m.lanes.reduce((a, l) => a + l.bins[i].total, 0))])),
      total: [O.colTotal].concat(m.lanes.map(l => v(l.posted + l.planned)), [v(m.lanes.reduce((a, l) => a + l.posted + l.planned, 0))]) };
  }
  /* the 5 KPI cards as Card · Metric · Value */
  function summary(x) {
    const k = R.portfolioKpis(x.state, x.from, x.to, x.today, x.inclCancel), rows = [];
    const add = (card, metric, value) => rows.push([card, metric, value]);
    add(O.kCampaigns, O.kCampaigns, k.campaigns.n);
    ['ongoing', 'not_started', 'complete', 'on_hold', 'cancelled'].forEach(st => { if (k.campaigns.by[st]) add(O.kCampaigns, statusLabel(st), k.campaigns.by[st]); });
    if (k.campaigns.next) add(O.kCampaigns, O.nextToEndL, `${k.campaigns.next.campaign.campaign_name} · ${daysText(k.campaigns.next.left)}`);
    add(O.deals, O.deals, k.deals.n); add(O.deals, C.status.List, k.deals.list); add(O.deals, C.status.Inprocess, k.deals.inprocess); add(O.deals, C.status.Complete, k.deals.complete);
    add(O.committed, MN.committed.h, r2(k.money.committed)); add(O.committed, MN.budget.h, k.money.budget); add(O.committed, MN.used.h, dec(k.money.usedPct));
    add(O.committed, MN.remaining.h, r2(k.money.remaining)); add(O.committed, MN.pending.h, r2(k.money.pending));
    add(O.kPaid, O.kPaid, r2(k.paid.paid)); add(O.kPaid, O.pctOfCommitted, dec(k.paid.pct)); add(O.kPaid, O.outstanding, r2(k.paid.outstanding));
    add(O.kKols, O.kKols, k.kols.n); add(O.kKols, O.committedDeals, k.kols.deals); add(O.kKols, O.avgPerDeal, k.kols.avg);
    return { key: 'summary', name: O.sheet.summary, header: [O.colCard, O.colMetric, O.colValue], rows, total: null };
  }

  /* ===================== By campaign (§4.4–4.5) ===================== */
  const campScope = x => ({ campaignId: x.campaignId, phaseIds: x.phaseId ? [x.phaseId] : null });
  /* the 4 summary cards */
  function summaryCamp(x) {
    const c = R.summaryCards(x.state, campScope(x), x.today), D = c.deals, B = c.budget, P = c.posts, En = c.engagement, rows = [];
    const add = (card, metric, value) => rows.push([card, metric, value]), m = R.moneyOf(B.budget, B.committed, B.shortlist, B.paid);
    add(O.deals, O.deals, D.active); add(O.deals, C.status.List, D.list); add(O.deals, C.status.Inprocess, D.inprocess); add(O.deals, C.status.Complete, D.complete); add(O.deals, C.status.Cancel || 'Cancelled', D.cancelled);
    add(O.committed, MN.committed.h, r2(m.committed)); add(O.committed, MN.budget.h, m.budget); add(O.committed, MN.used.h, dec(m.usedPct)); add(O.committed, MN.remaining.h, r2(m.remaining));
    add(O.committed, MN.pending.h, r2(m.pending)); add(O.committed, O.kPaid, r2(m.paid));
    add(O.posts, O.colPosted, P.posted); add(O.posts, O.planned, P.planned); P.byPlatform.forEach(b => add(O.posts, b.platform, b.posted));
    if (En) [['views', O.views], ['likes', O.likes], ['comments', O.comments], ['saves', O.saves], ['shares', O.shares]].forEach(([k, l]) => add(O.engagement, l, En[k]));
    return { key: 'summary_camp', name: O.sheet.summary, header: [O.colCard, O.colMetric, O.colValue], rows, total: null };
  }
  /* Activity by date: a row per day / week, a column per colour group (Pillar or KOL tier) · Posted · Planned · Total */
  function activityCamp(x) {
    const sc = campScope(x), [from, to] = R.activityRange(x.state, sc, x.today), gran = x.gran || 'day';
    const d = R.activityBins(x.state, sc, from, to, gran, x.measure, x.colorBy, x.today), tot = new Map(d.totals.map(t => [t.key, t]));
    const series = R.activitySeries(x.state, sc, x.colorBy, x.today).filter(sr => tot.has(sr.key) && tot.get(sr.key).posted + tot.get(sr.key).planned > 0);
    const v = n => (x.measure === 'spend' ? r2(n) : n), cell = (b, k) => { const s = b.series[k]; return s ? v(s.posted + s.planned) : 0; };
    return { key: 'activity_camp', name: O.sheet.activityCamp, gran,
      header: [gran === 'week' ? O.colWeekStart : O.colDay].concat(series.map(sr => sr.label), [O.colPosted, O.planned, O.colTotal]),
      rows: d.bins.map(b => [dmy(b.key)].concat(series.map(sr => cell(b, sr.key)), [v(b.posted), v(b.planned), v(b.total)])),
      total: [O.colTotal].concat(series.map(sr => v(d.bins.reduce((a, b) => a + cell(b, sr.key), 0))), [v(d.bins.reduce((a, b) => a + b.posted, 0)), v(d.bins.reduce((a, b) => a + b.planned, 0)), v(d.bins.reduce((a, b) => a + b.total, 0))]) };
  }
  function phaseBudget(x) {
    const pb = R.phaseBudgetRows(x.state, x.campaignId), mo = (b, c) => R.moneyOf(b, c, 0, 0);
    const rows = pb.rows.map(r => { const m = mo(r.budget, r.committed); return [R.phaseName(x.state, r.phase.phase_id), dmy(r.phase.start_date), dmy(r.phase.end_date), r.budget, r2(r.committed), dec(m.usedPct), r2(m.remaining), r2(r.shortlist), r.posts]; })
      .concat(pb.extra.map(e => [e.key === R.NEEDS ? O.needsPhase : O.unscheduled, '', '', null, r2(e.committed), null, null, null, e.posts || null]));
    const t = pb.total, mt = mo(t.budget, t.committed);
    return { key: 'phasebudget', name: O.sheet.phasebudget,
      header: [O.colPhase, O.colFrom, O.colTo, MN.budget.h, MN.committed.h, MN.used.h, MN.remaining.h, MN.pending.h, O.colPosts],
      rows, total: [O.campaignTotal, '', '', t.budget, r2(t.committed), dec(mt.usedPct), r2(mt.remaining), r2(t.shortlist), t.posts] };
  }
  function allocation(x) {
    const a = R.pillarAllocation(x.state, x.campaignId), keys = R.PILLARS.concat([R.NOT_SET]), lab = k => (k === R.NOT_SET ? O.pillarNotSet : k);
    const row = (label, pct, money, total) => [label].concat(keys.map(k => dec(pct[k] || 0)), keys.map(k => (money ? r2(money[k] || 0) : null)), [total == null ? null : r2(total)]);
    const camp = R.campaignOf(x.state, x.campaignId) || {};
    return { key: 'allocation', name: O.sheet.allocation,
      header: [O.colRow].concat(keys.map(k => `${lab(k)} %`), keys.map(k => lab(k)), [O.colTotal]),
      rows: [row(O.target, Object.assign({ [R.NOT_SET]: 0 }, a.target.pct), null, null), row(O.actualOf(camp.campaign_name || ''), a.actual.pct, a.actual.money, a.actual.total)]
        .concat(a.phases.map(p => row(R.phaseName(x.state, p.phase.phase_id), p.pct, p.money, p.total))), total: null };
  }
  function workload(x) {
    const rows = R.workloadByPic(x.state, campScope(x), x.today), sum = k => rows.reduce((a, r) => a + r[k], 0);
    return { key: 'workload', name: O.sheet.workload, header: [O.picLabel, O.colOpen, O.queues.overdue, O.docsToCollect, O.colCommittedOpen],
      rows: rows.map(r => [r.pic || O.noPic, r.open, r.overdue, r.docs, r2(r.committed)]), total: [O.colTotal, sum('open'), sum('overdue'), sum('docs'), r2(sum('committed'))] };
  }

  /* ===================== Operations (§4.6) ===================== */
  const whereOf = (s, ctx, d) => { const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), c = ctx.campaigns.get(d.campaign_id) || {}; return `${c.campaign_name || ''}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`; };
  /* CR-11 §4.8 — To do · Data health: the numbers of the tab (R.dataHealth, the same function) */
  function summaryOps(x) {
    const s = x.state, ctx = R.dealContext(s), Q = R.opsQueues(s, x.f, x.today, ctx), H = R.dataHealth(s, x.f, x.today), rows = [[O.picLabel, O.picLabel, x.picLabel]];
    const hk = x.queue && x.queue.startsWith('h:') ? x.queue.slice(2) : null;
    if (x.queue) rows.push([O.sheet.queue, O.queueShown, hk ? O.healthItems[hk] : O.queues[x.queue]]);
    rows.push([O.todo, O.queues.overdue, Q.overdue.length], [O.todo, O.toShip, R.shipmentsToShip(s, x.f, x.today).length], [O.todo, O.docsToCollect, R.docsToCollect(s, x.f, x.today).length]);
    if (R.metricsDue) rows.push([O.todo, O.metricsDue, R.metricsDue(s, x.f, x.today).length]);
    H.items.forEach(i => rows.push([O.health, O.healthItems[i.key], i.n]));
    if (!H.total) rows.push([O.health, O.allGood, 0]);
    return { key: 'summary_ops', name: O.sheet.summary, header: [O.colCard, O.colMetric, O.colValue], rows, total: null };
  }
  function queue(x) {
    const s = x.state, ctx = R.dealContext(s), Q = R.opsQueues(s, x.f, x.today, ctx), name = O.sheet.queue;
    const hk = x.queue && x.queue.startsWith('h:') ? x.queue.slice(2) : null, it = hk ? R.dataHealth(s, x.f, x.today).items.find(i => i.key === hk) : null;
    const camps = it && it.campaigns, phases = it && it.phases;
    if (camps) return { key: 'queue', name, header: [O.colCampaign, O.colStatus, O.colFrom, O.colTo, O.deals],
      rows: R.sortCampaigns(camps, s.phases, x.today).map(c => { const [a, z] = R.scopeRange(s, { campaignId: c.campaign_id }); return [c.campaign_name, statusLabel(R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, c.campaign_id), x.today)), dmy(a), dmy(z), s.deals.filter(d => d.campaign_id === c.campaign_id && !R.isCancelled(d)).length]; }), total: null };
    if (phases) return { key: 'queue', name, header: [O.colCampaign, O.colPhase, O.colFrom, O.colTo, O.colIssue],
      rows: phases.map(p => [R.campaignName(s, p.campaign_id), R.phaseName(s, p.phase_id), dmy(p.start_date), dmy(p.end_date), O.issueNoBudget]), total: null };
    const deals = it ? it.deals : Q.overdue;
    const rows = it ? deals.map(d => ({ deal: d, issue: O.healthItems[hk] })) : R.queueRows(s, 'overdue', deals, x.today, ctx);
    return { key: 'queue', name, header: [O.colKol, O.colCampaignPhase, O.colStage, O.picLabel, O.colIssue, O.colTotal],
      rows: rows.map(r => [(ctx.kols.get(r.deal.kol_id) || {}).display_name || r.deal.kol_id, whereOf(s, ctx, r.deal), r.deal.sub_status, r.deal.pic || '', r.issue, r2(R.totalCost(r.deal))]),
      total: [O.colTotal, '', '', '', rows.length, r2(rows.reduce((a, r) => a + R.totalCost(r.deal), 0))] };
  }
  function pipeline(x) {
    const s = x.state, ctx = R.dealContext(s), deals = R.opsDeals(s, x.f, ctx);
    const rows = R.stepsOf(s.lookups).filter(st => st.status === 'List' || st.status === 'Inprocess').map(st => [st.sub_status, deals.filter(d => d.sub_status === st.sub_status).length]).filter(r => r[1]);
    return { key: 'pipeline', name: O.sheet.pipeline, header: [O.colStage, O.deals],
      rows: rows.concat([[C.status.Complete, deals.filter(d => d.status === 'Complete').length], [C.status.Cancel || 'Cancelled', deals.filter(d => d.status === 'Cancel').length]]), total: null };
  }
  function due(x) {
    const s = x.state, ctx = R.dealContext(s), rows = R.upcomingDues(s, x.f, x.today, 7, ctx);
    return { key: 'due', name: O.sheet.due, header: [O.colDue, O.colKol, O.colCampaignPhase, O.colStep, O.picLabel],
      rows: rows.map(r => [dmy(r.due), (ctx.kols.get(r.deal.kol_id) || {}).display_name || r.deal.kol_id, whereOf(s, ctx, r.deal), R.stepShort(r.step ? r.step.sub_status : ''), r.deal.pic || '']), total: null };
  }

  /* ===================== Deals › Performance (CR-10 §4.7) ===================== */
  /* the columns that are on (Post → the full link at the end) + Account after KOL + Post link + Post ID · a Total row (ER / CPV / CPE weighted) */
  function performance(x) {
    const s = x.state, P = C.perfTab, cols = x.cols.filter(k => k !== 'post'), r4 = v => (v == null ? null : Math.round(v * 10000) / 10000);
    const phaseOf = k => (!k ? '' : k === R.NEEDS ? C.deal.needsPhase : k === R.UNSCHEDULED ? C.deal.unscheduled : R.phaseName(s, k));
    const value = (k, r) => {
      const p = r.post;
      switch (k) {
        case 'tier': return r.tier; case 'platform': return r.platform; case 'post_date': return dmy(p.post_date); case 'expected': return dmy(p.expected_post_date);
        case 'er': return r4(r.er); case 'cost': return r2(r.cost); case 'cpv': return r4(r.cpv); case 'cpe': return r2(r.cpe); case 'vpf': return r2(r.vpf);
        case 'updated': return r.status === 'collected' ? dmy(String(p.metrics_updated_at || '').slice(0, 10)) || P.status.collected
          : r.status === 'waiting' && r.minfo ? P.waitingL(r.minfo.next, dmy(r.minfo.nextDate)) : P.status[r.status] || '';   // CR-11 §4.12
        case 'pic': return r.pic; case 'phase': return phaseOf(r.phase); case 'gencode': return p.gencode_code || ''; case 'pillar': return r.deal.pillar || '';
        case 'ontime': return r.lateDays == null ? '' : r.lateDays ? P.late(r.lateDays) : P.onTime;
        default: return r[k];
      }
    };
    const header = cols.flatMap(k => (k === 'kol' ? [P.col.kol, P.account] : [P.col[k]])).concat([P.postLink, P.postId]);
    const rows = x.rows.map(r => cols.flatMap(k => (k === 'kol' ? [(r.kol && r.kol.display_name) || r.deal.kol_id, r.handle ? '@' + r.handle : ''] : [value(k, r)])).concat([r.post.post_link || '', r.post.post_id]));
    const m = R.perfMetricsOf(x.rows);
    const tot = k => (['views', 'likes', 'comments', 'shares', 'saves', 'engagement'].includes(k) ? m[k] : k === 'cost' ? r2(m.cost) : k === 'er' ? r4(m.er) : k === 'cpv' ? r4(m.cpv) : k === 'cpe' ? r2(m.cpe) : '');
    return { key: 'performance', name: P.sheet, header, rows, total: cols.flatMap(k => (k === 'kol' ? [P.total, P.postsN(x.rows.length)] : [tot(k)])).concat(['', '']) };
  }

  const WIDGETS = { performance, summary, activity, tiermix, pillarmix, portfolio, summary_camp: summaryCamp, activity_camp: activityCamp, phasebudget: phaseBudget, allocation, workload,
    summary_ops: summaryOps, queue, pipeline, due };
  const rowsFor = (widget, x) => WIDGETS[widget](x);
  /* the whole tab (§4.5): one sheet per widget, the Summary first */
  /* CR-13 §4.1: the sheets of All campaigns in the order of the screen */
  const TABS = { all: ['summary', 'portfolio', 'activity', 'pillarmix', 'tiermix'], campaign: ['summary_camp', 'activity_camp', 'phasebudget', 'allocation', 'workload'], ops: ['summary_ops', 'queue', 'pipeline', 'due'] };
  const tabTables = (tab, x) => TABS[tab].map(w => rowsFor(w, x));

  /* ===================== files ===================== */
  /* meta = {tab, scope, at, by}: the lines on top of the Summary sheet */
  function sheetOf(t, meta) {
    const top = meta ? [[O.meta.tab, meta.tab], [O.meta.scope, meta.scope], [O.meta.exported, meta.at], [O.meta.by, meta.by], []] : [];
    const bold = r => r.map(v => (v == null || v === '' ? '' : { v, bold: true }));
    const rows = top.map(r => (r.length ? [{ v: r[0], bold: true }, r[1]] : r)).concat([bold(t.header)], t.rows.map(r => r.map(v => (v == null ? '' : v))), t.total ? [bold(t.total)] : []);
    return { name: t.name, rows, widths: t.header.map((h, i) => (i ? Math.max(12, Math.min(28, String(h).length + 4)) : 30)), freeze: top.length + 1 };
  }
  const csvOf = t => R.toCSV(t.header, t.rows.concat(t.total ? [t.total] : []).map(r => r.map(v => (v == null ? '' : v))));
  /* <Card>_<scope>_<yyyy-mm-dd>: a preset by its name (This-year), a custom range by its dates */
  const scopeName = (preset, from, to) => (preset && preset !== 'custom' && O.presets[preset] ? O.presets[preset].replace(/\s+/g, '-') : `${from}_${to}`);
  /* a name in a file name: letters, digits and Thai kept · the rest become "-" */
  const safeName = t => String(t || '').replace(/[^\p{L}\p{N}\p{M}]+/gu, '-').replace(/^-+|-+$/g, '') || 'All';
  const fileName = (card, scope, today, ext) => `${card}_${scope}_${today}.${ext}`;

  return { rowsFor, tabTables, TABS, portfolioModel, sheetOf, csvOf, scopeName, safeName, fileName, daysText, followers };
})(KT.rules, KT.content);
