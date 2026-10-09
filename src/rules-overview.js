/* rules-overview.js — CR-03 §4.7: numbers for the Overview in Campaign mode (summary cards, Phase budget, Activity by date,
   Pillar allocation). Adds to KT.rules (load after rules-deal.js). No DOM, no storage.
   CR-19 §4.6–4.7 — 4 pillars (+ Awareness & Consideration) · no pillar target any more (campaigns.pillar_target and
   lookups.pillar_target_default stay in the data, unused) · migrateV18.
   scope = {campaignId, phaseIds} as in rules-phase.js. Money "Committed" counts from Confirm QT on; Shortlist is apart. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, totalCost, isCancelled, addDays, dayDiff, weekStart } = R;
  const round2 = n => Math.round(n * 100) / 100;
  /* CR-19 §4.6 — the order everywhere: Awareness → Awareness & Consideration → Consideration → Conversion (+ Not set) */
  const AWARE_CONSIDER = 'Awareness & Consideration';
  const PILLARS = ['Awareness', AWARE_CONSIDER, 'Consideration', 'Conversion'];
  const PILLAR_KEY = { Awareness: 'awareness', [AWARE_CONSIDER]: 'awareness_consideration', Consideration: 'consideration', Conversion: 'conversion' };
  /* the short name for a chip / a narrow axis ("Aware + Consider") · the full one everywhere else */
  const pillarShort = p => (C.pillarShort && C.pillarShort[p]) || p;
  const NOT_SET = '__none';

  /* the Phase's place in its Campaign (by start date) — its colour slot, fixed whatever is filtered */
  function phaseSlot(state, phaseId) {
    const p = state.phases.find(x => x.phase_id === phaseId); if (!p) return -1;
    return R.sortPhases(state.phases.filter(x => x.campaign_id === p.campaign_id)).findIndex(x => x.phase_id === phaseId);
  }
  /* CR-13 §4.3 — Phase colours are an ordinal ramp of 6 greys: n Phases of a Campaign take the steps round(linspace(1, 6, n)) ·
     1 Phase → step 4 · more than 6 → steps 1–6, then 6 for the rest (the name tells them apart) */
  function phaseSteps(n) {
    if (!(n > 0)) return [];
    if (n === 1) return [4];
    if (n > 6) return [1, 2, 3, 4, 5, 6].concat(Array(n - 6).fill(6));
    return Array.from({ length: n }, (_, i) => Math.round(1 + i * 5 / (n - 1)));
  }
  /* the step of a Phase: its place by start date among the Phases of its Campaign (not the Phases shown — a filter never changes it) */
  function phaseStep(state, phaseId) {
    const p = state.phases.find(x => x.phase_id === phaseId); if (!p) return null;
    const list = R.sortPhases(state.phases.filter(x => x.campaign_id === p.campaign_id));
    return phaseSteps(list.length)[list.findIndex(x => x.phase_id === phaseId)] || null;
  }
  const campaignSlot = (state, campaignId, today) => R.sortCampaigns(state.campaigns, state.phases, today).findIndex(c => c.campaign_id === campaignId);

  /* the date range of a scope: the Phase, else the Campaign (first start → last end) */
  function scopeRange(state, scope) {
    const sc = R.toScope(scope);
    const ps = state.phases.filter(p => R.isApproved(p) && (sc.phaseIds ? sc.phaseIds.includes(p.phase_id) : !sc.campaignId || p.campaign_id === sc.campaignId));
    const starts = ps.map(p => p.start_date).filter(Boolean).sort(), ends = ps.map(p => p.end_date).filter(Boolean).sort();
    return starts.length ? [starts[0], ends[ends.length - 1]] : [null, null];
  }
  /* read-only line in Campaign mode: running "Day 35 of 54" · ended · not started */
  function rangeStatus(from, to, today) {
    if (!from || !to) return null;
    if (today < from) return { kind: 'not_started', days: dayDiff(from, today), from, to };
    if (today > to) return { kind: 'ended', from, to };
    return { kind: 'running', day: dayDiff(today, from) + 1, of: dayDiff(to, from) + 1, from, to };
  }

  /* ---------- summary cards (CR-03 §4.7 Row 1) ---------- */
  function summaryCards(state, scope, today) {
    const idx = R.phaseIndex(state), deals = R.scopeDeals(state, scope, idx), active = deals.filter(d => !isCancelled(d));
    const count = st => active.filter(d => d.status === st).length;
    const money = R.scopeMoney(active, scope, idx), budget = R.scopeBudget(state, scope);
    const activeIds = new Set(active.map(d => d.deal_id)), posts = R.scopePosts(state, scope, idx).filter(p => activeIds.has(p.deal_id));
    const acc = new Map(state.kol_accounts.map(a => [a.account_id, a])), platformOf = p => (acc.get(p.account_id) || {}).platform || p.platform || 'Other';
    const posted = posts.filter(p => p.post_date);
    const byPlatform = new Map();
    posts.forEach(p => { const k = platformOf(p); const x = byPlatform.get(k) || { platform: k, posted: 0, planned: 0 }; x.planned++; if (p.post_date) x.posted++; byPlatform.set(k, x); });
    /* engagement over every post that has metrics (posted or not); the caption counts posted posts ·
       CR-10 §4.3: the sums, ER and CPV come from R.postMetrics — the function Deals › Performance uses */
    const num = v => Number(v) || 0, withViews = posts.filter(p => num(p.views) > 0);
    const E = R.postMetrics(withViews.map(p => ({ post: p, cost: (idx.post.get(p.post_id) || {}).share || 0 })));
    const sum = k => E[k], views = E.views;
    const complete = count('Complete');
    return {
      deals: { active: active.length, list: count('List'), inprocess: count('Inprocess'), complete, cancelled: deals.length - active.length,
        completedPct: active.length ? complete / active.length * 100 : 0 },
      budget: { budget, committed: money.committed, shortlist: money.shortlist, paid: R.scopeMoney(deals, scope, idx).paid,
        remaining: budget == null ? null : round2(budget - money.committed), over: budget != null && money.committed > budget },
      posts: { posted: posted.length, planned: posts.length, byPlatform: [...byPlatform.values()].sort((a, b) => b.posted - a.posted || b.planned - a.planned) },
      engagement: views ? {
        views, likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares'),
        er: E.er, cpv: E.cpv,
        withMetrics: posted.filter(p => num(p.views) > 0).length, posted: posted.length, noDate: withViews.filter(p => !p.post_date).length,
      } : null,
    };
  }

  /* ---------- Phase budget table (Row 3) ---------- */
  function phaseBudgetRows(state, campaignId) {
    const idx = R.phaseIndex(state), c = R.campaignOf(state, campaignId) || {}, cs = R.campaignSummary(state, campaignId, idx);
    const rows = R.sortPhases(R.phasesOfCampaign(state, campaignId)).map((p, i) => {
      const x = R.phaseSummary(state, p.phase_id, idx);
      return { phase: p, slot: i, budget: x.budget, budgetPct: R.pctOfBudget(x.budget, c.budget_kol), shortlist: x.shortlist, committed: x.committed, paid: x.paid, posts: x.posts, over: x.over };
    });
    const extra = [];
    /* CR-26 §3.4 — "n deals have no post date": the committed deals with money in Unscheduled */
    if (cs.unscheduled > 0) extra.push({ key: R.UNSCHEDULED, committed: cs.unscheduled,
      deals: state.deals.filter(d => d.campaign_id === campaignId && !isCancelled(d) && !R.isShortlist(state.lookups, d) && ((idx.deal.get(d.deal_id) || { keys: new Set() }).keys.has(R.UNSCHEDULED))).length });
    if (cs.needs > 0 || cs.needsPosts > 0) extra.push({ key: R.NEEDS, committed: cs.needs, posts: cs.needsPosts });
    const posts = R.scopePosts(state, { campaignId }, idx).length;
    return { rows, extra, total: { budget: cs.budget, shortlist: cs.shortlist, committed: cs.committed, paid: cs.paid, posts, over: cs.budget != null && cs.committed > cs.budget } };
  }

  /* ---------- Activity by date (Row 2) ----------
     measure 'posts' (count) | 'spend' (post shares of committed deals) · colorBy 'phase' | 'pillar' | 'campaign'
     a post sits on its post date (posted) or its expected date (planned); undated ones are listed apart */
  function activityRange(state, scope, today) {
    const [from, to] = scopeRange(state, scope);
    if (!from) return [addDays(today, -29), today];
    /* widen for posts just outside (a date far away is usually a typo and stays off the chart) */
    const idx = R.phaseIndex(state), dates = R.scopePosts(state, scope, idx).map(R.postDateOf).filter(Boolean)
      .filter(d => dayDiff(from, d) <= 60 && dayDiff(d, to) <= 60).sort();
    return [dates.length && dates[0] < from ? dates[0] : from, dates.length && dates[dates.length - 1] > to ? dates[dates.length - 1] : to];
  }
  const autoGran = (from, to) => (dayDiff(to, from) + 1 <= 45 ? 'day' : 'week');
  /* period [start, end] (CR-19 §4.2, optional): what falls outside the Campaign's own dates is also kept apart (outPosted / outPlanned · outsidePeriod posts)
     · first / last: the earliest and latest date placed in the bins */
  function activityBins(state, scope, from, to, gran, measure, colorBy, today, period) {
    const idx = R.phaseIndex(state), deals = new Map(R.scopeDeals(state, scope, idx).filter(d => !isCancelled(d)).map(d => [d.deal_id, d]));
    const tiers = colorBy === 'tier' ? R.dealContext(state).tiers : null;   // CR-09 §4.4 — colour by the deal's KOL tier
    const keys = []; let cur = gran === 'week' ? weekStart(from) : from;
    while (cur <= to && keys.length <= 800) { keys.push(cur); cur = addDays(cur, gran === 'week' ? 7 : 1); }
    const bins = new Map(keys.map(k => [k, { key: k, series: {}, posted: 0, planned: 0, total: 0, outPosted: 0, outPlanned: 0 }]));
    const totals = new Map(), undated = { count: 0, amount: 0 }; let outside = 0, outsidePeriod = 0, first = null, last = null;
    const seriesOf = (d, r) => (colorBy === 'pillar' ? (PILLARS.includes(d.pillar) ? d.pillar : NOT_SET) : colorBy === 'tier' ? ((tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER)
      : colorBy === 'campaign' ? d.campaign_id : (r.phase || (r.slot === 'unscheduled' ? R.UNSCHEDULED : R.NEEDS)));
    R.scopePosts(state, scope, idx).forEach(p => {
      const d = deals.get(p.deal_id); if (!d) return;
      const r = idx.post.get(p.post_id) || {}, sl = R.isShortlist(state.lookups, d);
      const v = measure === 'spend' ? (sl ? 0 : r.share || 0) : 1;
      if (measure === 'spend' && !v) return;
      const date = R.postDateOf(p), k = seriesOf(d, r), isPosted = !!p.post_date;
      const t = totals.get(k) || { key: k, posted: 0, planned: 0 }; totals.set(k, t);
      if (!date) { undated.count++; undated.amount += v; t.planned += v; return; }
      const bk = gran === 'week' ? weekStart(date) : date, b = bins.get(bk);
      if (!b) { outside++; if (isPosted) t.posted += v; else t.planned += v; return; }
      const sv = b.series[k] || (b.series[k] = { posted: 0, planned: 0 });
      if (isPosted) { sv.posted += v; b.posted += v; t.posted += v; } else { sv.planned += v; b.planned += v; t.planned += v; }
      b.total += v;
      if (period && (date < period[0] || date > period[1])) { outsidePeriod++; if (isPosted) b.outPosted += v; else b.outPlanned += v; }
      if (!first || date < first) first = date; if (!last || date > last) last = date;
    });
    /* deals without posts have their whole cost undated */
    if (measure === 'spend') deals.forEach(d => { if (!R.postsOf(state, d.deal_id).length && !R.isShortlist(state.lookups, d)) { undated.amount += totalCost(d); } });
    return { bins: keys.map(k => bins.get(k)), totals: [...totals.values()], undated, outside, outsidePeriod, first, last };
  }
  /* series in a fixed order with their colour slot: Phases by start date · Campaigns by §4.8 · pillars; grey keys last */
  function activitySeries(state, scope, colorBy, today) {
    const sc = R.toScope(scope), grey = [R.NEEDS, R.UNSCHEDULED, NOT_SET];
    if (colorBy === 'pillar') return PILLARS.map((p, i) => ({ key: p, slot: i, kind: 'pillar', label: p })).concat([{ key: NOT_SET, grey: true, label: C.overview.pillarNotSet }]);
    if (colorBy === 'tier') return R.tierOrder(state.lookups.tier_rules).map((t, i) => ({ key: t, slot: i, kind: 'tier', label: t, grey: t === R.UNKNOWN_TIER }));
    if (colorBy === 'campaign') return R.sortCampaigns(state.campaigns, state.phases, today).map((c, i) => ({ key: c.campaign_id, slot: i, label: c.campaign_name, kind: 'campaign' }));
    const ps = state.phases.filter(p => R.isApproved(p) && (!sc.campaignId || p.campaign_id === sc.campaignId));
    return R.sortPhases(ps).map(p => ({ key: p.phase_id, slot: phaseSlot(state, p.phase_id), label: R.phaseName(state, p.phase_id), kind: 'phase' }))
      .concat(grey.filter(k => k !== NOT_SET).map(k => ({ key: k, grey: true })));
  }

  /* ---------- pillar targets (CR-19 §4.7: no target on screen any more — the old target data and these two helpers are kept for old files / old tests ·
     CR-24 §3: the Pillar allocation card, its sheet and its sum are gone — Pillar mix in All campaigns stays) ---------- */
  const DEFAULT_TARGET = { awareness: 10, consideration: 20, conversion: 70 };
  /* the share of each pillar within the money that has a pillar (Not set left out) · money {Awareness, …} */
  function pillarShares(money) {
    const set = PILLARS.reduce((a, p) => a + (Number(money[p]) || 0), 0);
    const pct = Object.fromEntries(PILLARS.map(p => [p, set ? (Number(money[p]) || 0) / set * 100 : null]));
    return { set, pct };
  }
  const pillarTargetOf = (state, campaignId) => { const c = R.campaignOf(state, campaignId); return (c && c.pillar_target) || state.lookups.pillar_target_default || DEFAULT_TARGET; };
  /* targets are whole numbers 0–100 that add up to 100 */
  function validatePillarTarget(t) {
    const errs = [], vals = Object.keys(DEFAULT_TARGET).map(k => t && t[k]);   // (the three keys an old target has)
    if (vals.some(v => isBlank(v) || !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 100)) errs.push({ field: 'pillar_target', msg: M.pillarTargetNumber });
    else if (vals.reduce((a, v) => a + Number(v), 0) !== 100) errs.push({ field: 'pillar_target', msg: M.pillarTargetSum(vals.reduce((a, v) => a + Number(v), 0)) });
    return { errs, warns: [], infos: [] };
  }
  /* ===================== CR-05 §4.5 — money, said one way everywhere ===================== */
  /* Budget → Committed (deals from Confirm QT on, not cancelled) → Used % → Remaining → Pending (Shortlist / Contacted) · Paid (est.) */
  const moneyOf = (budget, committed, pending, paid) => ({ budget, committed, usedPct: budget ? committed / budget * 100 : null,
    remaining: budget == null ? null : round2(budget - committed), pending, paid });
  function campaignMoney(state, campaignId, idx) {
    const x = R.campaignSummary(state, campaignId, idx || R.phaseIndex(state));
    return Object.assign(moneyOf(x.budget, x.committed, x.shortlist, x.paid), { deals: x.activeDeals });
  }
  /* several Campaigns: budgets add up (a Campaign without one adds nothing; none at all → no budget) */
  function moneyTotal(list) {
    const withBudget = list.filter(m => m.budget != null), sum = k => list.reduce((a, m) => a + (m[k] || 0), 0);
    return Object.assign(moneyOf(withBudget.length ? withBudget.reduce((a, m) => a + m.budget, 0) : null, sum('committed'), sum('pending'), sum('paid')), { deals: sum('deals') });
  }

  /* ===================== CR-05 §4.6 / CR-07 §4.1 — Dashboard › All campaigns ===================== */
  /* whole calendar periods, so the Activity also shows what is planned later in the period (Posts / Views count posted dates only) */
  const PRESETS = ['this_year', 'this_quarter', 'this_month', 'last_month'];
  const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function dateRangePreset(key, today) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    if (key === 'this_quarter') { const a = Math.floor((m - 1) / 3) * 3 + 1; return [isoOf(y, a, 1), isoOf(y, a + 2, lastDayOf(y, a + 2))]; }
    if (key === 'this_month') return [isoOf(y, m, 1), isoOf(y, m, lastDayOf(y, m))];
    if (key === 'last_month') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return [isoOf(yy, mm, 1), isoOf(yy, mm, lastDayOf(yy, mm))]; }
    return [`${y}-01-01`, `${y}-12-31`];
  }
  /* the CR-05 rolling windows still answer (old links); every other name is a CR-07 period */
  function presetRange(key, today) {
    if (key === 'last30') return [addDays(today, -29), today];
    if (key === 'last90') return [addDays(today, -89), today];
    return dateRangePreset(key, today);
  }
  const campaignStatusOf = (state, c, today) => (R.campaignEffectiveStatus ? R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today) : R.campaignStatus(R.phasesOfCampaign(state, c.campaign_id), today));
  /* CR-14 §4.1 — All campaigns › Status: the effective status of a Campaign today (CR-05 §4.7) · default = all but Cancelled ·
     statuses = a list, or the old includeCancelled (true = all · false = the default) */
  /* CR-29 §3.5: + Wrap-up (in the default) · a list saved before it (dash.all.statuses) that had Complete gets Wrap-up too — what was Complete by its
     dates is Wrap-up now (upgradeDashStatuses) · saved under a new key so a later choice without Wrap-up stays as it was chosen */
  const DASH_STATUS_KEY = 'dash.all.statuses.v29', DASH_STATUS_KEY_OLD = 'dash.all.statuses';
  const DASH_STATUS_DEFAULT = ['ongoing', 'wrap_up', 'not_started', 'on_hold', 'complete'];
  const upgradeDashStatuses = v => (Array.isArray(v) && v.includes('complete') && !v.includes('wrap_up') ? v.concat(['wrap_up']) : v);
  const statusSet = x => new Set(Array.isArray(x) ? x : x === true ? R.CAMPAIGN_STATUSES : DASH_STATUS_DEFAULT);
  /* a stored / linked list → the statuses that exist, in §4.7 order · nothing valid → the default */
  function normDashStatuses(v) { const set = new Set(Array.isArray(v) ? v : []), out = R.CAMPAIGN_STATUSES.filter(k => set.has(k)); return out.length ? out : DASH_STATUS_DEFAULT.slice(); }
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  /* the words on the button: default · all · 1–2 names · n selected */
  function dashStatusText(v) {
    const list = normDashStatuses(v);
    if (sameList(list, R.CAMPAIGN_STATUSES)) return { kind: 'all', n: list.length, list };
    if (sameList(list, DASH_STATUS_DEFAULT)) return { kind: 'default', n: list.length, list };
    return { kind: list.length <= 2 ? 'names' : 'count', n: list.length, list };
  }
  const isDefaultStatuses = v => sameList(normDashStatuses(v), DASH_STATUS_DEFAULT);
  /* how many Campaigns of each status touch the range (every status, whatever is picked) */
  function statusCounts(state, from, to, today) {
    const out = Object.fromEntries(R.CAMPAIGN_STATUSES.map(k => [k, 0]));
    campaignsInRange(state, from, to, today, R.CAMPAIGN_STATUSES).forEach(c => { const st = campaignStatusOf(state, c, today); out[st] = (out[st] || 0) + 1; });
    return out;
  }
  /* Campaigns whose dates touch [from, to] and whose status is picked — the scope of every widget of All campaigns */
  function campaignsInRange(state, from, to, today, statuses) {
    const ok = statusSet(statuses);
    return R.sortCampaigns(state.campaigns, state.phases, today).filter(c => {
      if (!ok.has(campaignStatusOf(state, c, today))) return false;
      const [a, z] = campaignDates(state, c);
      return !!a && a <= to && z >= from;
    });
  }
  /* the dates of a Campaign: its approved Phases · one that waits (CR-17) — its own Phases (they wait with it) */
  const campaignDates = (state, c) => (R.isApproved(c) ? scopeRange(state, { campaignId: c.campaign_id }) : R.campaignSpan(state, c.campaign_id));
  /* ===================== schema 18 (CR-19 §4.6) ===================== */
  /* pillar_list: Awareness & Consideration after Awareness · a Phase with no default pillar whose name says both "Awareness" and "Consideration"
     gets it (seed: Perfect Heart Phase 1) · deals are not touched · twice → the same */
  function migrateV18(obj) {
    const L = obj.lookups || (obj.lookups = {});
    const list = Array.isArray(L.pillar_list) ? L.pillar_list : (L.pillar_list = PILLARS.filter(p => p !== AWARE_CONSIDER));
    if (!list.includes(AWARE_CONSIDER)) { const i = list.indexOf('Awareness'); list.splice(i >= 0 ? i + 1 : 0, 0, AWARE_CONSIDER); }
    (obj.phases || []).forEach(p => {
      if (!isBlank(p.default_pillar)) return;
      const t = `${p.label || ''} ${p.phase_name || ''}`;
      if (/awareness/i.test(t) && /consideration/i.test(t)) p.default_pillar = AWARE_CONSIDER;
    });
    obj.schema_version = Math.max(obj.schema_version || 0, 18);
    return obj;
  }
  /* posts of a Campaign's live deals posted inside [from, to] (and their views) */
  function postsIn(state, campaignId, from, to) {
    const live = new Set(state.deals.filter(d => d.campaign_id === campaignId && !isCancelled(d)).map(d => d.deal_id));
    const ps = state.deal_posts.filter(p => live.has(p.deal_id) && p.post_date && p.post_date >= from && p.post_date <= to);
    return { posts: ps.length, views: ps.reduce((a, p) => a + (Number(p.views) || 0), 0) };
  }
  /* the pillar mix of a Campaign's committed money (post shares) in % — the portfolio rows carry it (CR-24 §3: the Pillar allocation card is gone) */
  function campaignPillarPct(state, campaignId, idx) {
    const m = Object.assign(Object.fromEntries(PILLARS.map(p => [p, 0])), { [NOT_SET]: 0 });
    state.deals.forEach(d => { if (d.campaign_id !== campaignId || isCancelled(d)) return; const info = idx.deal.get(d.deal_id); if (!info) return;
      const k = d.pillar && PILLARS.includes(d.pillar) ? d.pillar : NOT_SET; info.share.forEach(v => { m[k] += v; }); });
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, total ? v / total * 100 : 0]));
  }
  /* Row 2 — Campaign portfolio: money of the whole Campaign · posts / views inside the range · pillar mix of the committed money */
  function portfolio(state, from, to, today, statuses) {
    const idx = R.phaseIndex(state);
    const rows = campaignsInRange(state, from, to, today, statuses).map(c => {
      const [a, z] = scopeRange(state, { campaignId: c.campaign_id }), m = campaignMoney(state, c.campaign_id, idx), p = postsIn(state, c.campaign_id, from, to);
      return Object.assign({ campaign: c, status: campaignStatusOf(state, c, today), from: a, to: z, posts: p.posts, views: p.views, pillarMix: campaignPillarPct(state, c.campaign_id, idx) }, m);
    });
    /* the Total = the rows on screen (CR-14: the picked statuses decide, Cancelled too when it is picked) */
    return { rows, total: Object.assign(moneyTotal(rows), { posts: rows.reduce((s, r) => s + r.posts, 0), views: rows.reduce((s, r) => s + r.views, 0) }) };
  }
  /* Row 1 — the 4 KPIs: deals / money of the Campaigns in range · posts / views posted in range */
  function allKpis(state, from, to, today, statuses) {
    const p = portfolio(state, from, to, today, statuses);
    return Object.assign({ campaigns: p.rows.length }, p.total);
  }
  /* Row 3 — Activity by campaign: one lane per Campaign on a shared x axis and one y scale */
  function swimlanes(state, from, to, gran, measure, today, statuses) {
    const lanes = campaignsInRange(state, from, to, today, statuses).map(c => {
      const r = activityBins(state, { campaignId: c.campaign_id }, from, to, gran, measure, 'campaign', today);
      const bins = r.bins.map(b => ({ key: b.key, posted: b.posted, planned: b.planned, total: b.total }));
      return { campaign: c, slot: campaignSlot(state, c.campaign_id, today), bins, posted: bins.reduce((a, b) => a + b.posted, 0), planned: bins.reduce((a, b) => a + b.planned, 0), undated: r.undated, outside: r.outside };
    });
    const keys = lanes.length ? lanes[0].bins.map(b => b.key) : [];
    return { keys, lanes, max: Math.max(0, ...lanes.flatMap(l => l.bins.map(b => b.total))) };
  }

  /* ===================== CR-05 §4.6 — Dashboard › Operations ===================== */
  /* noProducts (CR-06 §4.3) lists Campaigns, not deals */
  const QUEUES = ['overdue', 'unpaid', 'beforeBrief', 'termNotSet', 'pillarNotSet', 'noDate', 'needsPhase', 'outside', 'noProducts'];
  /* filters: campaign ('' = all) · pic ('' = all, '__none' = no PIC) · tier ('' = all) */
  function opsDeals(state, f, ctx) {
    return state.deals.filter(d => (!f.campaign || d.campaign_id === f.campaign) && (!f.pic || (f.pic === '__none' ? isBlank(d.pic) : d.pic === f.pic)) &&
      (!f.tier || ((ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER) === f.tier));
  }
  /* the deals in each queue (same rules as CR-02 / CR-03 Needs attention) */
  function opsQueues(state, f, today, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), idx = ctx.phaseIdx, deals = opsDeals(state, f, ctx), live = deals.filter(d => !isCancelled(d));
    const posts = d => R.postsOfCtx(ctx, d.deal_id), phases = new Map();
    const phasesOf = cid => { if (!phases.has(cid)) phases.set(cid, R.phasesOfCampaign(state, cid)); return phases.get(cid); };
    return {
      overdue: deals.filter(d => R.isOverdue(state, d, today)),
      unpaid: deals.filter(R.isUnpaid),
      beforeBrief: deals.filter(d => (R.termOf(d) === 'prepaid' || R.termOf(d) === 'split_50') && R.paymentState(d, today) === 'overdue'),
      termNotSet: deals.filter(d => R.isOpenDeal(d) && !R.termOf(d)),
      pillarNotSet: live.filter(d => isBlank(d.pillar)),
      noDate: deals.filter(d => d.status === 'Complete' && posts(d).some(p => !p.post_date)),
      needsPhase: live.filter(d => ((idx.deal.get(d.deal_id) || {}).needsPosts || 0) > 0),
      outside: live.filter(d => posts(d).some(p => R.postFarOutside(p, phasesOf(d.campaign_id), 60))),
      noProducts: R.campaignsWithoutProducts(state, f.campaign),
    };
  }
  /* a queue as table rows: the issue in words and the order (most urgent first) */
  function queueRows(state, key, deals, today, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), M2 = C.ops, posts = d => R.postsOfCtx(ctx, d.deal_id);
    const lastPosted = d => posts(d).map(p => p.post_date).filter(Boolean).sort().pop() || null;
    const rows = deals.map(d => {
      const due = R.dueDate(state, d), nx = R.dueStep(state, d);
      if (key === 'overdue') { const late = due ? dayDiff(today, due) : 0; return { deal: d, rank: late, issue: M2.issueOverdue(nx ? nx.sub_status : '', R.dmy(due), late) }; }
      if (key === 'unpaid') { const lp = lastPosted(d); return { deal: d, rank: lp ? dayDiff(today, lp) : 0, issue: lp ? M2.issueUnpaid(R.dmy(lp), dayDiff(today, lp)) : M2.issueUnpaidNoDate }; }
      if (key === 'beforeBrief') return { deal: d, rank: d.brief_date ? dayDiff(today, d.brief_date) : 0, issue: M2.issueBeforeBrief(C.term[R.termOf(d)]) };
      if (key === 'termNotSet') return { deal: d, rank: due ? -dayDiff(due, today) : -9999, issue: M2.issueTerm };
      if (key === 'pillarNotSet') return { deal: d, rank: 0, issue: M2.issuePillar };
      if (key === 'noDate') { const n = posts(d).filter(p => !p.post_date).length; return { deal: d, rank: n, issue: M2.issueNoDate(n) }; }
      if (key === 'needsPhase') { const n = (ctx.phaseIdx.deal.get(d.deal_id) || {}).needsPosts || 0; return { deal: d, rank: n, issue: M2.issueNeeds(n) }; }
      const p = posts(d).find(x => R.postFarOutside(x, R.phasesOfCampaign(state, d.campaign_id), 60));
      return { deal: d, rank: 0, issue: M2.issueOutside(R.dmy(p ? p.post_date || p.expected_post_date : null)) };
    });
    return rows.sort((a, b) => b.rank - a.rank || a.deal.deal_id.localeCompare(b.deal.deal_id));
  }
  /* CR-07 §4.3 — Due in next 7 days: open deals of the scope (f = {pic, campaign, tier} or a PIC name) whose due date
     (the next step's expected date, CR-02 §5.3) falls on today … today + days · by date → [{ deal, due, step }] */
  function upcomingDues(state, f, today, days, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), end = R.addDays(today, days == null ? 7 : days), scope = typeof f === 'string' ? { pic: f } : (f || {});
    return opsDeals(state, scope, ctx).filter(R.isOpenDeal).map(d => ({ deal: d, due: R.dueDate(state, d), step: R.dueStep(state, d) }))
      .filter(x => x.due && x.due >= today && x.due <= end)
      .sort((a, b) => a.due.localeCompare(b.due) || a.deal.deal_id.localeCompare(b.deal.deal_id));
  }
  /* ===================== CR-14 §4.3 — Campaign & Phase › Search ===================== */
  /* tree [{name, phases: [{name, …}], …}] → what to show: the Campaign name matches → it with every Phase (match 'campaign') · only Phase names
     match → the Campaign as context (its numbers stay whole) with those Phases, shown open (match 'phase') · no query → as it is (match null) */
  function filterCampaignTree(tree, query) {
    const q = R.foldText(query);
    if (!q) return tree.map(x => Object.assign({}, x, { match: null }));
    return tree.map(x => {
      if (R.foldText(x.name).includes(q)) return Object.assign({}, x, { match: 'campaign' });
      const phases = (x.phases || []).filter(p => R.foldText(p.name).includes(q));
      return phases.length ? Object.assign({}, x, { phases, match: 'phase' }) : null;
    }).filter(Boolean);
  }
  /* a text cut where the search is found (no case) → [{t, hit}] — the screen marks the hits */
  function highlightParts(text, query) {
    const t = String(text == null ? '' : text).normalize('NFC'), q = R.foldText(query);
    if (!q) return [{ t, hit: false }];
    const low = t.toLowerCase(), out = [];
    let i = 0;
    for (let j = low.indexOf(q); j >= 0; j = low.indexOf(q, i)) { if (j > i) out.push({ t: t.slice(i, j), hit: false }); out.push({ t: t.slice(j, j + q.length), hit: true }); i = j + q.length; }
    if (i < t.length) out.push({ t: t.slice(i), hit: false });
    return out;
  }
  /* Workload by PIC: open deals · overdue · Docs to collect (deals with an instalment at Missing docs, CR-13 §4.5) · committed of the open deals (no PIC = its own row) */
  function workload(state, f, today, ctxIn) {
    const ctx = ctxIn || R.dealContext(state);
    return workloadOf(state, opsDeals(state, Object.assign({}, f, { pic: '' }), ctx), today);
  }
  /* CR-07 §4.2 — the same table for one Campaign (and its chosen Phases): scope {campaignId, phaseIds} */
  const workloadByPic = (state, scope, today, idx) => workloadOf(state, R.scopeDeals(state, scope, idx || R.phaseIndex(state)), today);
  function workloadOf(state, deals, today) {
    const by = new Map(), docs = R.docsByDeal(state, today);
    deals.forEach(d => {
      const k = d.pic || '', w = by.get(k) || { pic: k || null, open: 0, overdue: 0, docs: 0, committed: 0 }; by.set(k, w);
      if (R.isOpenDeal(d)) { w.open++; if (!R.isShortlist(state.lookups, d)) w.committed += totalCost(d); }
      if (R.isOverdue(state, d, today)) w.overdue++;
      if (d.status !== 'Cancel' && docs.has(d.deal_id)) w.docs++;
    });
    return [...by.values()].filter(w => w.open || w.overdue || w.docs).sort((a, b) => b.open - a.open || String(a.pic || '~').localeCompare(String(b.pic || '~'), 'th'));
  }

  /* ===================== CR-23 §3.1 — Products given (Dashboard › By campaign · its Export sheet) ===================== */
  /* the pieces sent per product, by method · only shipments of deals not cancelled (Not required = nothing was given) · a shipment with no
     products is one "Product not recorded" row (its pieces are not known: 0 in the totals) · o = { campaignId, phaseId, phaseIndex (to keep the
     deals of that Phase — R.phaseIndex) } → { total, kols, byMethod {npd, warehouse, self_purchase}, reimbursed, rows [{tr_code, total, npd,
     warehouse, self_purchase, delivered, toShip, kols}], notRecorded {shipments, kols, delivered, toShip} | null, shipments (counted) } */
  const GIVEN_DONE = ['delivered', 'purchased'], GIVEN_OPEN = ['to_ship', 'shipped', 'kol_purchase', 'problem'];
  function productsGiven(deals, shipments, o) {
    o = o || {};
    const keep = new Map((deals || []).filter(d => d.status !== 'Cancel' && (!o.campaignId || d.campaign_id === o.campaignId) &&
      (!o.phaseId || !o.phaseIndex || ((o.phaseIndex.deal.get(d.deal_id) || {}).keys || new Set()).has(o.phaseId))).map(d => [d.deal_id, d]));
    const list = (shipments || []).filter(sh => sh.deal_id && keep.has(sh.deal_id) && sh.status !== 'not_required');
    const rows = new Map(), allKols = new Set(), byMethod = { npd: 0, warehouse: 0, self_purchase: 0 };
    let none = null, reimbursed = 0;
    const methodOf = sh => (byMethod[sh.method] !== undefined ? sh.method : 'warehouse');
    list.forEach(sh => {
      const kol = sh.kol_id || keep.get(sh.deal_id).kol_id, m = methodOf(sh), done = GIVEN_DONE.includes(sh.status), open = GIVEN_OPEN.includes(sh.status);
      if (m === 'self_purchase' && !isBlank(sh.purchase_amount)) reimbursed += Number(sh.purchase_amount) || 0;
      const items = (sh.items || []).filter(x => x && x.tr_code);
      if (!items.length) {
        none = none || { shipments: 0, kolSet: new Set(), delivered: 0, toShip: 0 };
        none.shipments++; none.kolSet.add(kol); if (done) none.delivered++; else if (open) none.toShip++;
        return;
      }
      items.forEach(x => {
        const q = Math.max(0, Math.round(Number(x.qty) || 0)); if (!q) return;
        const r = rows.get(x.tr_code) || { tr_code: x.tr_code, total: 0, npd: 0, warehouse: 0, self_purchase: 0, delivered: 0, toShip: 0, kolSet: new Set() };
        r.total += q; r[m] += q; if (done) r.delivered += q; else if (open) r.toShip += q; r.kolSet.add(kol); rows.set(x.tr_code, r);
        byMethod[m] += q; allKols.add(kol);
      });
    });
    const out = [...rows.values()].sort((a, b) => b.total - a.total || String(a.tr_code).localeCompare(String(b.tr_code))).map(r => { const { kolSet, ...x } = r; return Object.assign(x, { kols: kolSet.size }); });
    return { total: byMethod.npd + byMethod.warehouse + byMethod.self_purchase, kols: allKols.size, byMethod, reimbursed: Math.round(reimbursed * 100) / 100, rows: out,
      notRecorded: none ? { shipments: none.shipments, kols: none.kolSet.size, delivered: none.delivered, toShip: none.toShip } : null, shipments: list.length };
  }
  const productsGivenFor = (state, scope) => { const sc = R.toScope(scope);
    return productsGiven(state.deals, state.sample_shipments, { campaignId: sc.campaignId, phaseId: sc.phaseIds && sc.phaseIds.length === 1 ? sc.phaseIds[0] : null, phaseIndex: sc.phaseIds ? R.phaseIndex(state) : null }); };

  /* ===================== CR-23 §3.7 — Cancelled deals (Dashboard › By campaign · its Export sheet) ===================== */
  /* o = { campaignId, phaseId, phaseIndex, lookups } → { n, released, reasons [{key, label, n}] (most first), rows [{deal, stage (when it was cancelled ·
     from the log), date, key, label, detail, value (Total cost — only past Confirm QT, else null), pic}] (newest first) } */
  function cancelledReport(deals, log, o) {
    o = o || {};
    const L = o.lookups || {}, qt = R.stepOf(L, 'Confirm QT'), byDeal = new Map();
    (log || []).forEach(l => { if (!byDeal.has(l.deal_id)) byDeal.set(l.deal_id, []); byDeal.get(l.deal_id).push(l); });
    const rows = (deals || []).filter(d => d.status === 'Cancel' && (!o.campaignId || d.campaign_id === o.campaignId) &&
      (!o.phaseId || !o.phaseIndex || ((o.phaseIndex.deal.get(d.deal_id) || {}).keys || new Set()).has(o.phaseId))).map(d => {
      const ls = (byDeal.get(d.deal_id) || []).slice().sort((a, b) => (Number(a.log_id) || 0) - (Number(b.log_id) || 0));
      let at = null, i = ls.length - 1;
      for (; i >= 0; i--) if (ls[i].sub_status === 'Cancel') { at = ls[i]; break; }
      const stage = at ? at.from_sub_status && at.from_sub_status !== 'Cancel' ? at.from_sub_status : (ls.slice(0, i).reverse().find(l => l.sub_status !== 'Cancel') || {}).sub_status || null : null;
      const st = stage ? R.stepOf(L, stage) : null, past = !!(st && qt && st.sort_order >= qt.sort_order);
      const date = at ? at.effective_date || String(at.changed_at || '').slice(0, 10) || null : null;
      const key = d.cancel_reason_key || R.CANCEL_OTHER;
      return { deal: d, stage, date, key, label: R.cancelReasonLabel(L, key), detail: d.cancel_reason || null, value: past ? totalCost(d) : null, pic: d.pic || null };
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.deal.deal_id).localeCompare(String(a.deal.deal_id)));
    const reasons = [...new Map(rows.map(r => [r.key, { key: r.key, label: r.label, n: rows.filter(x => x.key === r.key).length }])).values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    return { n: rows.length, released: Math.round(rows.reduce((a, r) => a + (r.value || 0), 0) * 100) / 100, reasons, rows };
  }
  const cancelledReportFor = (state, scope) => { const sc = R.toScope(scope);
    return cancelledReport(state.deals, state.deal_status_log, { campaignId: sc.campaignId, phaseId: sc.phaseIds && sc.phaseIds.length === 1 ? sc.phaseIds[0] : null, phaseIndex: sc.phaseIds ? R.phaseIndex(state) : null, lookups: state.lookups }); };

  /* ===================== CR-24 — Operations = Work queue ===================== */
  /* every piece of work still open is one row (§4.1) · the due is R.dueDate's (deals) · Shortlist is a list, not work · a deal Cancelled / Posted has
     no deal work (its payment / metrics still do) · Stuck = in the same stage longer than lookups.ops_stuck_days (default 7) and not Overdue */
  const STUCK_DAYS = 7;
  const stuckDaysOf = lookups => { const n = Number((lookups || {}).ops_stuck_days); return Number.isInteger(n) && n >= 1 && n <= 365 ? n : STUCK_DAYS; };
  const WORK_BUCKETS = ['overdue', 'today', 'week', 'later', 'none'];
  const workBucket = (due, today) => (!due ? 'none' : due < today ? 'overdue' : due === today ? 'today' : due <= addDays(today, 7) ? 'week' : 'later');
  const WORK_KINDS = ['deal', 'shipment', 'payment', 'metrics', 'gencode', 'close', 'approval'];   // CR-29 (S): + Close campaign   // CR-30: + Collect gencode
  /* the day a deal came into its stage: its last log into that stage (with a date) · else the stage's own date (Brief · Draft k …) · null when not known
     (deals from the old files have neither) */
  function stageSince(state, deal) {
    const logs = R.logsOf(state, deal.deal_id);
    for (let i = logs.length - 1; i >= 0; i--) if (logs[i].sub_status === deal.sub_status) { const t = logs[i].effective_date || String(logs[i].changed_at || '').slice(0, 10); if (R.isISODate(t)) return t; break; }
    const st = R.stepOf(state.lookups, deal.sub_status);
    return st && st.date_field && R.isISODate(deal[st.date_field]) ? deal[st.date_field] : null;
  }
  const daysSince = (iso, today) => (R.isISODate(iso) && iso <= today ? dayDiff(today, iso) : null);
  /* the deal's own next piece of work: what (from its next step) · who · due (R.dueDate) · the field "Set date" fills */
  function dealWork(state, d) {
    const L = state.lookups, cur = R.stepOf(L, d.sub_status), ct = R.stepOf(L, 'Contacted');
    if (!cur || !R.isOpenDeal(d) || (ct && cur.sort_order < ct.sort_order)) return null;   // Shortlist is not work (§6 #3)
    const nx = R.nextStep(L, d).step; if (!nx) return null;
    const k = R.draftNo(nx);
    const a = nx.sub_status === 'Confirm QT' ? { action: 'confirm_qt', waiting: 'us' } : nx.date_field === 'brief_date' ? { action: 'send_brief', waiting: 'us' }
      : R.isScriptStep(nx) ? { action: 'script', waiting: 'kol' } : k ? { action: 'draft', n: k, waiting: 'kol' } : R.isApproveStep(nx) ? { action: 'approve', waiting: 'us' }
      : R.isPostStep(nx) ? { action: 'post', waiting: 'kol' } : { action: 'next', waiting: 'us', step: nx.sub_status };
    const field = R.isPostStep(nx) ? 'expected_post_date' : R.expectedField(nx);
    return Object.assign(a, { next: nx.sub_status, due: R.dueDate(state, d), field: field || null });
  }
  /* o = { person ('' everyone · '__none' · a PIC), campaignIds (null = all), waitingOn ('' · 'us' · 'kol'), today, viewer (the user: Approvals only for
     those who approve) } → rows [{ kind, key, deal, kol_id, campaign_id, stage, action, n, waiting, due, bucket, field, since, inStage, stuck, pic, ref }]
     (Overdue → Today → This week → Later → No due date · inside: the due, then the longest in stage) */
  function workQueue(state, o) {
    o = o || {};
    const today = o.today || R.todayISO(), stuckN = stuckDaysOf(state.lookups), rows = [];
    const deals = new Map(state.deals.map(d => [d.deal_id, d]));
    const push = r => { r.bucket = workBucket(r.due, today); r.stuck = r.kind === 'deal' && r.inStage != null && r.inStage > stuckN && r.bucket !== 'overdue'; rows.push(r); };
    state.deals.forEach(d => { const w = dealWork(state, d); if (!w) return; const since = stageSince(state, d);
      push(Object.assign({ kind: 'deal', key: 'deal:' + d.deal_id, deal: d, kol_id: d.kol_id, campaign_id: d.campaign_id, stage: d.sub_status, pic: d.pic || null, since, inStage: daysSince(since, today), ref: d }, w)); });
    /* the samples: To ship (by its Ship by) · Shipped (Confirm delivery — no due) */
    (state.sample_shipments || []).forEach(sh => {
      const st = sh.status; if (!['to_ship', 'problem', 'shipped'].includes(st) || R.isLegacyDelivered(sh)) return;
      const d = sh.deal_id ? deals.get(sh.deal_id) || null : null; if (d && R.isCancelled(d)) return;
      const ship = st !== 'shipped', since = ship ? String(sh.created_at || '').slice(0, 10) || null : sh.shipped_date || null;
      push({ kind: 'shipment', key: (ship ? 'ship:' : 'dlv:') + sh.shipment_id, deal: d, kol_id: sh.kol_id || (d && d.kol_id) || null, campaign_id: sh.campaign_id || (d && d.campaign_id) || null, stage: d ? d.sub_status : null,
        action: ship ? 'ship' : 'deliver', waiting: 'us', due: ship ? R.shipByDate(sh) : null, field: ship ? 'ship_by_date' : null, pic: R.shipPic(state, sh, d) || null, since, inStage: daysSince(since, today), ref: sh });
    });
    /* the money owed now (To pay · Ready / Missing docs) */
    R.payQueue(state, today).items.filter(x => x.status === 'ready' || x.status === 'missing_docs').forEach(x => {
      const posted = x.deal ? R.firstPostDate(state, x.deal) : null;   // CR-26 §3.5: work after the post counts from the post
      push({ kind: 'payment', key: 'pay:' + x.key, deal: x.deal || null, kol_id: x.kol_id, campaign_id: x.campaign_id || null, stage: x.deal ? x.deal.sub_status : null, action: 'pay', waiting: 'us',
        due: x.due_date || null, field: null, pic: x.pic || null, since: x.due_date || null, inStage: daysSince(x.due_date, today), sincePost: daysSince(posted, today), ref: x });
    });
    /* the numbers of a post past its checkpoint (CR-11) */
    if (R.metricsDue) R.metricsDue(state, {}, today).forEach(m => {
      push({ kind: 'metrics', key: 'met:' + m.post.post_id, deal: m.deal, kol_id: m.deal.kol_id, campaign_id: m.deal.campaign_id, stage: m.deal.sub_status, action: 'metrics', waiting: 'us',
        due: m.info.checkpointDate || null, field: null, pic: m.deal.pic || null, since: m.info.checkpointDate || null, inStage: daysSince(m.info.checkpointDate, today), sincePost: daysSince(m.post.post_date, today), ref: m.post });
    });
    /* CR-30 §3.1 — Collect gencode: a Gencode paid for, posted, no code yet — waiting on the KOL · due = the first post date + 3 days */
    if (R.needsGencode) state.deals.forEach(d => { const g = R.needsGencode(state, d, today); if (!g) return;
      push({ kind: 'gencode', key: 'gc:' + d.deal_id, deal: d, kol_id: d.kol_id, campaign_id: d.campaign_id, stage: d.sub_status, action: 'gencode', waiting: 'kol', due: g.due, field: null,
        pic: d.pic || null, since: g.first, inStage: daysSince(g.first, today), sincePost: daysSince(g.first, today), ref: d }); });
    /* CR-29 §3.5 (S) — Close campaign: a Campaign in Wrap-up more than 7 days (its End date + 7 passed · not asked yet) · waiting on us · due = End date + 7 ·
       for those who may close it or ask (a manager · Staff) */
    if (!o.viewer || R.can(o.viewer, 'campaign.draft') || (R.canApprove && R.canApprove(o.viewer))) (state.campaigns || []).forEach(c => {
      if (!R.campaignEffectiveStatus || R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today) !== 'wrap_up' || (R.closeRequested && R.closeRequested(c))) return;
      const end = campaignDates(state, c)[1]; if (!R.isISODate(end)) return;
      const due = addDays(end, 7); if (!(today > due)) return;
      push({ kind: 'close', key: 'close:' + c.campaign_id, deal: null, kol_id: null, campaign_id: c.campaign_id, stage: null, action: 'close_campaign', waiting: 'us', due, field: null,
        pic: null, approver: true, since: end, inStage: daysSince(end, today), ref: c });
    });
    /* requests waiting for approval — only for those who approve (due: sent + 2 days) */
    if (o.viewer && R.canApprove && R.canApprove(o.viewer)) R.approvalRequests(state).forEach(q => {
      const at = String(q.at || '').slice(0, 10) || null;
      push({ kind: 'approval', key: 'apr:' + q.id, deal: null, kol_id: null, campaign_id: q.campaign_id || null, stage: null, action: 'review', waiting: 'us', due: at ? addDays(at, 2) : null, field: null,
        pic: null, approver: true, since: at, inStage: daysSince(at, today), ref: q });
    });
    const camps = Array.isArray(o.campaignIds) ? new Set(o.campaignIds) : null, person = o.person || '', mine = o.viewer ? R.picName(o.viewer) : null;
    return rows.filter(r => (!camps || !r.campaign_id || camps.has(r.campaign_id)) && (!o.waitingOn || r.waiting === o.waitingOn) &&
      (!person || (r.approver ? person === mine : person === '__none' ? isBlank(r.pic) : r.pic === person)))
      .sort((a, b) => WORK_BUCKETS.indexOf(a.bucket) - WORK_BUCKETS.indexOf(b.bucket) || String(a.due || '').localeCompare(String(b.due || '')) || (b.inStage || 0) - (a.inStage || 0) || a.key.localeCompare(b.key));
  }
  /* "Draft 2 from KOL" · "Pay KOL" … (the table and its sheet say it the same way) */
  const workActionText = r => { const f = C.overview.wq.action[r.action]; return typeof f === 'function' ? f(r.action === 'draft' ? r.n : r.next) : f || r.action; };
  /* §4.2 — the 5 numbers over the rows given (the filters already on) */
  function workSummary(rows) {
    const n = f => rows.filter(f).length, us = rows.filter(r => r.waiting === 'us');
    return { overdue: n(r => r.bucket === 'overdue'), week: n(r => r.bucket === 'today' || r.bucket === 'week'), none: n(r => r.bucket === 'none'), noneKol: n(r => r.bucket === 'none' && r.waiting === 'kol'),
      stuck: n(r => r.stuck), us: us.length, usBy: Object.fromEntries(WORK_KINDS.map(k => [k, us.filter(r => r.kind === k).length])), total: rows.length };
  }
  /* the rows a tile / a stage keeps */
  const WORK_TILES = ['overdue', 'week', 'none', 'stuck', 'us'];
  const workTileHas = (tile, r) => (tile === 'overdue' ? r.bucket === 'overdue' : tile === 'week' ? r.bucket === 'today' || r.bucket === 'week' : tile === 'none' ? r.bucket === 'none' : tile === 'stuck' ? r.stuck : tile === 'us' ? r.waiting === 'us' : true);
  /* §4.5 — a row a person: open deals · Overdue · Due this week · No due date · Stuck · Waiting on us (most overdue first) ·
     CR-26 §3.4: o = the filters of the page ({campaignIds, person, today}) → Open deals is counted by R.teamWorkload (the By campaign table) */
  function teamLoad(state, rows, o) {
    const by = new Map(), at = k => by.get(k) || (by.set(k, { pic: k || null, open: new Set(), overdue: 0, week: 0, none: 0, stuck: 0, us: 0 }), by.get(k));
    rows.filter(r => !r.approver).forEach(r => { const w = at(r.pic || '');
      if (r.deal && R.isOpenDeal(r.deal)) w.open.add(r.deal.deal_id);
      if (r.bucket === 'overdue') w.overdue++; else if (r.bucket === 'today' || r.bucket === 'week') w.week++; else if (r.bucket === 'none') w.none++;
      if (r.stuck) w.stuck++; if (r.waiting === 'us') w.us++; });
    if (o) {
      const camps = Array.isArray(o.campaignIds) ? new Set(o.campaignIds) : null, person = o.person || '';
      const tw = R.teamWorkload(state, state.deals.filter(d => (!camps || camps.has(d.campaign_id)) && (!person || (person === '__none' ? isBlank(d.pic) : d.pic === person))), o.today || R.todayISO());
      tw.forEach(t => { if (t.open) { const w = at(t.pic || ''); w.open = new Set(); w.openN = t.open; } });
      by.forEach(w => { if (w.openN == null) w.openN = (tw.find(t => (t.pic || '') === (w.pic || '')) || { open: 0 }).open; w.open = new Set(); });
    }
    return [...by.values()].map(w => { const n = w.openN != null ? w.openN : w.open.size; delete w.openN; return Object.assign(w, { open: n }); })
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open || String(a.pic || '~').localeCompare(String(b.pic || '~'), 'th'));
  }
  /* §4.4 — Stage flow: Shortlist … Approve · deals in it · their average days in it · Stuck · + Posted / Cancelled (o = {person, campaignIds, today}) */
  function stageFlow(state, o) {
    o = o || {};
    const today = o.today || R.todayISO(), stuckN = stuckDaysOf(state.lookups), camps = Array.isArray(o.campaignIds) ? new Set(o.campaignIds) : null, person = o.person || '';
    const deals = state.deals.filter(d => (!camps || camps.has(d.campaign_id)) && (!person || (person === '__none' ? isBlank(d.pic) : d.pic === person)));
    const steps = R.stepsOf(state.lookups).filter(s => s.active !== false && (s.status === 'List' || s.status === 'Inprocess'));
    return { steps: steps.map(st => { const ds = deals.filter(d => d.sub_status === st.sub_status && R.isOpenDeal(d)), days = ds.map(d => daysSince(stageSince(state, d), today)).filter(x => x != null);
        return { step: st, n: ds.length, avg: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
          stuck: ds.filter(d => { const n = daysSince(stageSince(state, d), today); return n != null && n > stuckN && !R.isOverdue(state, d, today); }).length }; }),
      posted: deals.filter(d => d.status === 'Complete').length, cancelled: deals.filter(d => d.status === 'Cancel').length };
  }
  /* §4.6 — Data to fix: a row a thing to fix (the Missing words of CR-22 · a shipment with no Ship by · a post outside its Campaign (CR-23) · Data health) */
  function dataToFix(state, o) {
    o = o || {};
    const today = o.today || R.todayISO(), camps = Array.isArray(o.campaignIds) ? new Set(o.campaignIds) : null, person = o.person || '';
    const mine = d => (!camps || camps.has(d.campaign_id)) && (!person || (person === '__none' ? isBlank(d.pic) : d.pic === person));
    const deals = state.deals.filter(d => mine(d) && !R.isImportedClosed(d)), rows = [];
    deals.forEach(d => { const miss = R.dealMissing(state, d).filter(k => k !== 'gencode'); if (miss.length) rows.push({ kind: 'missing', deal: d, keys: miss }); });   // CR-30: Gencode is work (Collect gencode), not data
    const dealOf = new Map(state.deals.map(d => [d.deal_id, d]));
    (state.sample_shipments || []).forEach(sh => { if (sh.status !== 'to_ship' || R.shipByDate(sh) || R.isLegacyDelivered(sh)) return; const d = sh.deal_id ? dealOf.get(sh.deal_id) : null;
      if (d ? !mine(d) || R.isCancelled(d) : (camps && sh.campaign_id && !camps.has(sh.campaign_id))) return; rows.push({ kind: 'noShipBy', deal: d, shipment: sh }); });
    deals.filter(d => !R.isCancelled(d)).forEach(d => { const ph = R.phasesOfCampaign(state, d.campaign_id); if (!ph.length) return;
      R.postsOf(state, d.deal_id).forEach((p, i) => { if (!R.isISODate(p.post_date)) return; const r = R.resolvePostPhase(p, ph);
        if (r.override && ph.some(x => x.phase_id === r.override) && !r.overrideUnused) return;
        const t = R.postDateText(R.postDateCheck(state, d.campaign_id, p.post_date), p.post_date, C.deal.postDateWord); if (t) rows.push({ kind: 'postOutside', deal: d, post: p, index: i, text: t }); }); });
    const H = R.dataHealth(state, { pic: person, campaign: '' }, today);
    H.items.filter(x => !['termNotSet', 'pillarNotSet'].includes(x.key)).forEach(x => {
      if (x.deals) x.deals.filter(d => d && (!camps || camps.has(d.campaign_id))).forEach(d => rows.push({ kind: x.key, deal: d }));
      else if (x.campaigns) x.campaigns.filter(c => !camps || camps.has(c.campaign_id)).forEach(c => rows.push({ kind: x.key, campaign: c }));
      else if (x.phases) x.phases.filter(ph => !camps || camps.has(ph.campaign_id)).forEach(ph => rows.push({ kind: x.key, phase: ph }));
    });
    return rows;
  }
  /* the Campaigns of the Campaign filter: approved · the default = the ones not Complete (nor cancelled) */
  const opsCampaigns = state => state.campaigns.filter(c => R.isApproved(c));
  const opsCampaignsDefault = (state, today) => opsCampaigns(state).filter(c => !['complete', 'cancelled'].includes(R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today))).map(c => c.campaign_id);

  return { PILLARS, PILLAR_KEY, NOT_SET, AWARE_CONSIDER, STUCK_DAYS, stuckDaysOf, WORK_BUCKETS, workBucket, WORK_KINDS, WORK_TILES, workTileHas, stageSince, dealWork, workQueue, workActionText, workSummary, teamLoad, stageFlow, dataToFix, opsCampaigns, opsCampaignsDefault, productsGiven, productsGivenFor, cancelledReport, cancelledReportFor, pillarShort, campaignDates, migrateV18, phaseSlot, campaignSlot, scopeRange, rangeStatus, summaryCards, phaseBudgetRows,
    activityRange, autoGran, activityBins, activitySeries, DEFAULT_TARGET, pillarTargetOf, validatePillarTarget,
    portfolioScope: campaignsInRange, DASH_STATUS_KEY, DASH_STATUS_KEY_OLD, upgradeDashStatuses, DASH_STATUS_DEFAULT, normDashStatuses, dashStatusText, isDefaultStatuses, statusCounts, filterCampaignTree, highlightParts,
    phaseSteps, phaseStep, pillarShares,
    moneyOf, campaignMoney, moneyTotal, PRESETS, dateRangePreset, presetRange, workloadByPic, campaignsInRange, portfolio, allKpis, swimlanes, QUEUES, opsDeals, opsQueues, queueRows, upcomingDues, workload };
})(KT.rules, KT.content));
