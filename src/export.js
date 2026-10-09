/* export.js — CR-09 §4.5: the rows behind each Dashboard widget. The table view, the download (.xlsx / CSV) and the whole-tab Export all
   read them, so a file says what the screen says. Numbers stay numbers (no ฿, no commas) · % as a decimal (0.65) · dates dd/mm/yyyy ·
   a Total row where the widget has one. Nothing comes from the Payee vault. No DOM — the screen downloads. → KT.export
   x (All campaigns) = { state, from, to, today, statuses (CR-14: the Status picked · the old inclCancel still answers), measure ('posts' | 'spend'), sort {key, dir} }
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
  const stOf = x => (x.statuses != null ? x.statuses : x.inclCancel);   // CR-14 §4.1
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
    const p = R.portfolio(x.state, x.from, x.to, x.today, stOf(x));
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
    const m = R.tierMix(x.state, x.from, x.to, x.today, stOf(x));
    return { key: 'tiermix', name: O.sheet.tiermix,
      header: [O.tierLabel, O.colFollowers, O.mSpend, `${O.mSpend} %`, O.mDeals, `${O.mDeals} %`],
      rows: m.rows.filter(t => t.deals).map(t => [t.tier, followers(t), r2(t.spend), dec(t.spendPct), t.deals, dec(t.dealsPct)]),
      total: [O.colTotal, '', r2(m.total.spend), m.total.spend ? 1 : 0, m.total.deals, m.total.deals ? 1 : 0] };
  }
  /* CR-13 §4.2 — Pillar mix: the rows of the card (Not set last) · % of total (CR-19 §4.7: no Target / Δ) */
  function pillarmix(x) {
    const m = R.pillarMix(x.state, x.from, x.to, x.today, stOf(x)), lab = k => (k === R.NOT_SET ? O.notSet : k);
    return { key: 'pillarmix', name: O.sheet.pillarmix,
      header: [O.pillarLabel, O.mSpend, `${O.mSpend} %`, O.mDeals, `${O.mDeals} %`],
      rows: m.rows.map(p => [lab(p.pillar), r2(p.spend), dec(p.spendPct), p.deals, dec(p.dealsPct)]),
      total: [O.colTotal, r2(m.total.spend), m.total.spend ? 1 : 0, m.total.deals, m.total.deals ? 1 : 0] };
  }
  /* CR-19 §4.5 — Campaign timeline: a row per Campaign per bar (week from Monday, or day — the bars on screen) · Posted · Planned (posts) · Spend */
  function timeline(x) {
    const p = R.campaignTimeline(x.state, x.from, x.to, 'posts', x.today, stOf(x)), sp = R.campaignTimeline(x.state, x.from, x.to, 'spend', x.today, stOf(x));
    const spendOf = new Map(sp.rows.map(r => [r.campaign.campaign_id, r]));
    const rows = [];
    p.rows.forEach(r => { const s = spendOf.get(r.campaign.campaign_id);
      r.bins.forEach((b, i) => rows.push([r.campaign.campaign_name, statusLabel(r.status), dmy(r.start), dmy(r.end), dmy(b.key), b.posted, b.planned, r2(s ? s.bins[i].total : 0)])); });
    const sum = (list, f) => list.reduce((a, r) => a + f(r), 0);
    return { key: 'timeline', name: O.sheet.timeline, gran: p.gran,
      header: [O.colCampaign, O.colStatus, O.colStart, O.colEnd, p.gran === 'week' ? O.colWeekMon : O.colDayL, O.colPosted, O.planned, O.colSpendL],
      rows, total: [O.colTotal, '', '', '', '', sum(p.rows, r => r.posted), sum(p.rows, r => r.planned), r2(sum(sp.rows, r => r.posted + r.planned))] };
  }
  /* the table view of the card: one row a Campaign — Campaign · Status · Start · End · Posts posted · Posts planned · Spend · First post · Last post */
  function timelineTable(x) {
    const p = R.campaignTimeline(x.state, x.from, x.to, 'posts', x.today, stOf(x)), sp = R.campaignTimeline(x.state, x.from, x.to, 'spend', x.today, stOf(x));
    const spendOf = new Map(sp.rows.map(r => [r.campaign.campaign_id, r])), sum = (list, f) => list.reduce((a, r) => a + f(r), 0);
    return { key: 'timelinetable', name: O.sheet.timeline,
      header: [O.colCampaign, O.colStatus, O.colStart, O.colEnd, O.colPostsPosted, O.colPostsPlanned, O.colSpendL, O.colFirstPost, O.colLastPost],
      rows: p.rows.map(r => { const s = spendOf.get(r.campaign.campaign_id); return [r.campaign.campaign_name, statusLabel(r.status), dmy(r.start), dmy(r.end), r.posted, r.planned, r2(s ? s.posted + s.planned : 0), dmy(r.first), dmy(r.last)]; }),
      total: [O.colTotal, '', '', '', sum(p.rows, r => r.posted), sum(p.rows, r => r.planned), r2(sum(sp.rows, r => r.posted + r.planned)), '', ''] };
  }
  /* Activity by campaign (§4.2): a row per bar (week or day), a column per Campaign — (CR-19: replaced on screen by the Campaign timeline; kept for old links) */
  function activity(x) {
    const ax = R.timeAxis(x.from, x.to), m = R.swimlanes(x.state, x.from, x.to, ax.gran, x.measure, x.today, stOf(x));
    const v = n => (x.measure === 'spend' ? r2(n) : n);
    return { key: 'activity', name: O.sheet.activity, gran: ax.gran,
      header: [ax.gran === 'week' ? O.colWeekStart : O.colDay].concat(m.lanes.map(l => l.campaign.campaign_name), [O.colTotal]),
      rows: m.keys.map((k, i) => [dmy(k)].concat(m.lanes.map(l => v(l.bins[i].total)), [v(m.lanes.reduce((a, l) => a + l.bins[i].total, 0))])),
      total: [O.colTotal].concat(m.lanes.map(l => v(l.posted + l.planned)), [v(m.lanes.reduce((a, l) => a + l.posted + l.planned, 0))]) };
  }
  /* the 4 KPI cards as Card · Metric · Value (CR-26 §3.1: no Deals card — its numbers sit under KOL & Affiliate engaged) */
  function summary(x) {
    const k = R.portfolioKpis(x.state, x.from, x.to, x.today, stOf(x)), rows = [];
    const add = (card, metric, value) => rows.push([card, metric, value]);
    add(O.kCampaigns, O.kCampaigns, k.campaigns.n);
    ['ongoing', 'not_started', 'complete', 'on_hold', 'cancelled'].forEach(st => { if (k.campaigns.by[st]) add(O.kCampaigns, statusLabel(st), k.campaigns.by[st]); });
    if (k.campaigns.next) add(O.kCampaigns, O.nextToEndL, `${k.campaigns.next.campaign.campaign_name} · ${daysText(k.campaigns.next.left)}`);
    add(O.committed, MN.committed.h, r2(k.money.committed)); add(O.committed, MN.budget.h, k.money.budget); add(O.committed, MN.used.h, dec(k.money.usedPct));
    add(O.committed, MN.remaining.h, r2(k.money.remaining)); add(O.committed, MN.pending.h, r2(k.money.pending));
    add(O.kPaid, O.kPaid, r2(k.paid.paid)); add(O.kPaid, O.pctOfCommitted, dec(k.paid.pct)); add(O.kPaid, O.outstanding, r2(k.paid.outstanding));
    const E = O.kEngaged;
    add(E, O.partnersL, k.kols.n); R.partnerTypesOf(x.state.lookups).forEach(t => add(E, t.label, k.kols.byType[t.key]));
    add(E, O.committedDeals, k.kols.deals); add(E, O.avgPerDeal, k.kols.avg); add(E, O.notCommitted, k.kols.notCommitted);
    add(E, O.allDealsL, k.deals.n); add(E, C.status.List, k.deals.list); add(E, C.status.Inprocess, k.deals.inprocess); add(E, C.status.Complete, k.deals.complete);
    return { key: 'summary', name: O.sheet.summary, header: [O.colCard, O.colMetric, O.colValue], rows, total: null };
  }

  /* CR-26 §3.2 — Budget vs Actual by month (R.budgetVsActualByMonth, the same as the card): Month · Budget · Posted · Upcoming · Late · Variance · Actual % · Status */
  const monthName = k => `${O.months[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const bvaOf = x => (x.campaignId ? R.budgetVsActualByMonth(x.state, { campaignId: x.campaignId, phaseId: x.phaseId || null, today: x.today })
    : R.budgetVsActualByMonth(x.state, { from: x.from, to: x.to, statuses: stOf(x), today: x.today }));
  function budgetActual(x) {
    const b = bvaOf(x), B = O.bva, t = b.total, act = t.posted + t.upcoming + t.late;
    return { key: x.campaignId ? 'budgetactual_camp' : 'budgetactual', name: O.sheet.budgetactual,
      header: [B.col.month, B.col.budget, B.col.posted, B.col.upcoming, B.col.late, B.col.variance, B.col.pct, B.col.status],
      rows: b.months.map(m => [monthName(m.key), r2(m.budget), r2(m.posted), r2(m.upcoming), r2(m.late), r2(m.variance), dec(m.pct), m.status ? `${B.statusWord[m.status]} ${R.fmtNum(Math.round(m.amount))}` : '']),
      total: [O.colTotal, r2(t.budget), r2(t.posted), r2(t.upcoming), r2(t.late), r2(act - t.budget), t.budget ? dec(act / t.budget * 100) : null, ''] };
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
  /* CR-26 §3.4 — Team workload (R.teamWorkload, the same as the card) */
  function workload(x) {
    const T = O.team, rows = R.teamWorkload(x.state, R.scopeDeals(x.state, campScope(x), R.phaseIndex(x.state)), x.today), t = R.teamWorkloadTotal(rows), K = ['partners', 'open', 'posted', 'postOverdue', 'noPostDue', 'cancelled'];
    return { key: 'workload', name: O.sheet.workload, header: [T.col.pic].concat(K.map(k => T.col[k]), [T.col.committed, T.col.docs]),
      rows: rows.map(r => [r.pic || T.notAssigned].concat(K.map(k => r[k]), [r2(r.committed), r.docs])), total: [O.colTotal].concat(K.map(k => t[k]), [r2(t.committed), t.docs]) };
  }

  /* CR-23 §3.1 — Products given (the same numbers as the card: R.productsGiven) · no personal data */
  function productsGiven(x) {
    const s = x.state, g = R.productsGivenFor(s, campScope(x)), ml = k => R.shipMethodLabel(s.lookups, k), name = c => { const p = R.productByCode(s, c); return p ? R.productShort(p) : ''; };
    const sum = k => g.rows.reduce((a, r) => a + r[k], 0), nr = g.notRecorded;
    return { key: 'products', name: O.sheet.products, header: [O.colTrCode, O.colProduct, O.colTotal, ml('npd'), ml('warehouse'), ml('self_purchase'), O.colDelivered, O.colToShip, O.colKols],
      rows: g.rows.map(r => [r.tr_code, name(r.tr_code), r.total, r.npd, r.warehouse, r.self_purchase, r.delivered, r.toShip, r.kols])
        .concat(nr ? [['', `${O.notRecorded} (${O.notRecordedN(nr.shipments)})`, null, null, null, null, null, null, nr.kols]] : []),
      total: [O.colTotal, '', g.total, g.byMethod.npd, g.byMethod.warehouse, g.byMethod.self_purchase, sum('delivered'), sum('toShip'), g.kols] };
  }
  /* CR-23 §3.7 — Cancelled (the columns of the card: R.cancelledReport) · no personal data */
  function cancelled(x) {
    const s = x.state, c = R.cancelledReportFor(s, campScope(x));
    return { key: 'cancelled', name: O.sheet.cancelled, header: [O.colKol, O.colDealId, O.colCancelledAt, O.colCancelledOn, O.colReason, O.colDetail, O.colValue, O.colAssigned],
      rows: c.rows.map(r => [(R.kolById(s, r.deal.kol_id) || {}).display_name || r.deal.kol_id, r.deal.deal_id, r.stage || '', dmy(r.date), r.label, r.detail || '', r.value == null ? null : r2(r.value), r.pic || '']),
      total: [O.colTotal, c.n, '', '', '', '', r2(c.released), ''] };
  }

  /* ===================== Operations (§4.6) ===================== */
  /* CR-24 — Summary: the filters · the 5 numbers of the Work queue · Data to fix (R.workQueue / R.workSummary / R.dataToFix, the same as the screen) */
  function summaryOps(x) {
    const s = x.state, W = O.wq, sum = R.workSummary(R.workQueue(s, x.opts)), fix = R.dataToFix(s, x.opts);
    const rows = [[W.assigned, W.assigned, x.picLabel], [W.campaigns, W.campaigns, x.campLabel], [W.waiting, W.waiting, x.waitLabel]];
    R.WORK_TILES.forEach(k => rows.push([W.summaryCard, W.tiles[k], sum[k]]));
    rows.push([W.summaryCard, W.title, sum.total], [W.fixCard, W.fixCard, fix.length]);
    return { key: 'summary_ops', name: O.sheet.summary, header: [O.colCard, O.colMetric, O.colValue], rows, total: null };
  }
  /* CR-24 §4.7 — Work queue: the columns of the table (no personal data) */
  function workQueue(x) {
    const s = x.state, W = O.wq, rows = R.workQueue(s, x.opts);
    return { key: 'workqueue', name: O.sheet.workqueue, header: [W.col.bucket, W.col.due, W.col.kol, W.col.campaign, W.col.stage, W.col.action, W.col.waiting, W.col.inStage, W.col.stuck, W.col.pic],
      rows: rows.map(r => [W.sec[r.bucket], dmy(r.due), r.kind === 'approval' ? W.approval : (R.kolById(s, r.kol_id) || {}).display_name || r.kol_id || '', r.campaign_id ? R.campaignName(s, r.campaign_id) : '',
        r.stage || '', R.workActionText(r), W.w[r.waiting], r.sincePost != null ? W.sincePost(r.sincePost) : r.inStage, r.stuck ? W.tiles.stuck : '', r.pic || '']), total: null };   // CR-26 §3.5
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

  /* ===================== CR-20 §4.8 · §4.13 — Packages · Draft notes (counts only — no images, no personal data) ===================== */
  function packages(x) {
    const s = x.state, PK = C.pkg;
    const rows = (s.kol_packages || []).slice().sort((a, b) => String(a.package_id).localeCompare(String(b.package_id))).map(p => [((R.kolById(s, p.kol_id) || {}).display_name) || p.kol_id, R.packageLabel(p), p.units_total,
      r2(p.price_total), r2(R.unitPrice(p)), R.packageUsed(s, p.package_id), Math.max(0, R.packageRemaining(s, p)), PK.status[R.packageStatus(s, p, x.today)], PK.pay[R.packagePayStatus(s, p)]]);
    return { key: 'packages', name: PK.sheet, header: PK.exportCols, rows, total: null };
  }
  function draftnotes(x) {
    const s = x.state, NT = C.notes;
    const rows = (s.step_notes || []).slice().sort((a, b) => (a.deal_id + a.step_key).localeCompare(b.deal_id + b.step_key)).map(n => [n.deal_id, `Draft ${String(n.step_key).replace(/\D/g, '')}`, (n.links || []).length, (n.image_ids || []).length, dmy(String(n.updated_at || '').slice(0, 10))]);
    return { key: 'draftnotes', name: NT.sheet, header: NT.exportCols, rows, total: null };
  }

  const WIDGETS = { packages, draftnotes, performance, summary, activity, timeline, timelinetable: timelineTable, tiermix, pillarmix, portfolio, summary_camp: summaryCamp, activity_camp: activityCamp, phasebudget: phaseBudget, products: productsGiven, cancelled, workload, budgetactual: budgetActual, budgetactual_camp: budgetActual,
    summary_ops: summaryOps, workqueue: workQueue };
  const rowsFor = (widget, x) => WIDGETS[widget](x);
  /* the whole tab (§4.5): one sheet per widget, the Summary first */
  /* CR-13 §4.1: the sheets of All campaigns in the order of the screen */
  /* CR-19 §4.5: Campaign timeline in place of Activity */
  /* CR-20: + Packages · Draft notes (counts) at the end */
  const TABS = { all: ['summary', 'budgetactual', 'portfolio', 'timeline', 'pillarmix', 'tiermix', 'packages', 'draftnotes'], campaign: ['summary_camp', 'activity_camp', 'phasebudget', 'budgetactual_camp', 'products', 'cancelled', 'workload'], ops: ['summary_ops', 'workqueue'] };   // CR-24: no Pillar allocation · Operations = Work queue · CR-26: + Budget vs Actual (after the KPI · after Phase budget)
  const tabTables = (tab, x) => TABS[tab].map(w => rowsFor(w, x));

  /* ===================== files ===================== */
  /* meta = {tab, scope, at, by}: the lines on top of the Summary sheet */
  function sheetOf(t, meta) {
    const top = meta ? [[O.meta.tab, meta.tab], [O.meta.scope, meta.scope]].concat(meta.status ? [[O.meta.status, meta.status]] : [], [[O.meta.exported, meta.at], [O.meta.by, meta.by], []]) : [];
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

  return { rowsFor, tabTables, TABS, portfolioModel, monthName, sheetOf, csvOf, scopeName, safeName, fileName, daysText, followers };
})(KT.rules, KT.content);
