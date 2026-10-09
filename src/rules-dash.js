/* rules-dash.js — CR-09 Dashboard numbers: the All campaigns KPI cards (portfolioKpis), the KOL tier mix (tierMix), Days left of a
   Campaign or Phase (daysLeft) and the one-row time axis the activity charts share (timeAxis). Pure functions on the state; money keeps the
   CR-05 §4.5 meaning (Committed = deals from Confirm QT on, not cancelled · Pending = Shortlist / Contacted · Paid = Paid (est.)).
   Adds to KT.rules (load after rules-pay.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { dayDiff, addDays, isCancelled, totalCost } = R;
  const round2 = n => Math.round(n * 100) / 100;

  /* ===================== Days left (§4.3) — item {status, from, to} ===================== */
  /* On going → n days left (the last day = "Last day" · 7 or fewer = soon) · Not started → Starts in n days · On hold · Complete / Cancelled → — */
  function daysLeft(item, today) {
    const st = item && item.status;
    if (st === 'ongoing' && item.to) { const n = dayDiff(item.to, today); return n <= 0 ? { kind: 'last', n: 0, soon: true } : { kind: 'left', n, soon: n <= 7 }; }
    if (st === 'not_started' && item.from) return { kind: 'starts', n: Math.max(0, dayDiff(item.from, today)), soon: false };
    if (st === 'on_hold') return { kind: 'hold', n: null, soon: false };
    return { kind: 'none', n: null, soon: false };
  }
  /* sort order of a Days left column: On going (fewest days first) → Not started → On hold → Complete / Cancelled */
  const daysLeftRank = d => [{ last: 0, left: 0, starts: 1, hold: 2 }[d.kind] ?? 3, d.n == null ? 0 : d.n];
  const campaignItem = (state, c, today) => { const [from, to] = R.scopeRange(state, { campaignId: c.campaign_id }); return { status: R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today), from, to }; };

  /* ===================== All campaigns — the 5 KPI cards (§4.1) ===================== */
  /* the Campaigns whose dates touch [from, to] and whose status is picked (CR-14 §4.1) — the same rows as the Campaign portfolio */
  function portfolioKpis(state, from, to, today, statuses) {
    const p = R.portfolio(state, from, to, today, statuses), rows = p.rows;
    const ids = new Set(rows.map(r => r.campaign.campaign_id)), by = {};
    rows.forEach(r => { by[r.status] = (by[r.status] || 0) + 1; });
    /* Next to end: the On going Campaign whose last day comes first */
    const next = rows.filter(r => r.status === 'ongoing' && r.to).sort((a, b) => a.to.localeCompare(b.to) || a.campaign.campaign_name.localeCompare(b.campaign.campaign_name))[0] || null;
    const deals = state.deals.filter(d => ids.has(d.campaign_id) && !isCancelled(d)), count = st => deals.filter(d => d.status === st).length;
    const committedDeals = deals.filter(d => !R.isShortlist(state.lookups, d)), t = p.total;
    return {
      campaigns: { n: rows.length, by, next: next ? { campaign: next.campaign, left: daysLeft({ status: 'ongoing', from: next.from, to: next.to }, today) } : null },
      deals: { n: deals.length, list: count('List'), inprocess: count('Inprocess'), complete: count('Complete') },
      money: { budget: t.budget, committed: t.committed, usedPct: t.usedPct, remaining: t.remaining, pending: t.pending },
      paid: { paid: t.paid, pct: t.committed ? t.paid / t.committed * 100 : null, outstanding: round2(t.committed - t.paid) },
      kols: { n: new Set(committedDeals.map(d => d.kol_id)).size, deals: committedDeals.length, avg: committedDeals.length ? Math.round(t.committed / committedDeals.length) : null,
        byType: R.partnerCounts([...new Set(committedDeals.map(d => d.kol_id))].map(id => R.kolById(state, id) || { kol_id: id })),   // CR-26 §3.1: partners once, by Partner type
        notCommitted: deals.length - committedDeals.length },   // Shortlist / Contacted — in the 401, not in the 278
    };
  }

  /* ===================== KOL tier mix (§4.1) ===================== */
  /* committed deals (Confirm QT on, not cancelled) of the Campaigns in range by the deal's tier (CR-04 §4.2) — Mega → … → Nano → Unknown,
     each with its followers range, spend, deals and their shares */
  /* CR-31 §2.1 — the committed deals of a scope: the Campaigns in a range (All campaigns) · one Campaign, or a Phase of it (By campaign) */
  const committedOf = (state, list) => list.filter(d => !isCancelled(d) && !R.isShortlist(state.lookups, d));
  const rangeDeals = (state, from, to, today, statuses) => { const ids = new Set(R.campaignsInRange(state, from, to, today, statuses).map(c => c.campaign_id)); return committedOf(state, state.deals.filter(d => ids.has(d.campaign_id))); };
  function campaignMixDeals(state, campaignId, phaseId) {
    if (!campaignId) return [];
    const list = phaseId ? R.scopeDeals(state, { campaignId, phaseIds: [phaseId] }, R.phaseIndex(state)) : state.deals.filter(d => d.campaign_id === campaignId);
    return committedOf(state, list);
  }
  function tierMix(state, from, to, today, statuses, ctxIn) { return tierMixOf(state, rangeDeals(state, from, to, today, statuses), ctxIn); }
  function tierMixOf(state, deals, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), rules = state.lookups.tier_rules || [];
    const by = new Map(R.tierOrder(rules).map(t => [t, { tier: t, range: t === R.UNKNOWN_TIER ? null : R.tierRange(rules, t), deals: 0, spend: 0 }]));
    deals.forEach(d => {
      const t = (ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER, x = by.get(t) || by.get(R.UNKNOWN_TIER);
      x.deals++; x.spend = round2(x.spend + totalCost(d));
    });
    const rows = [...by.values()], total = { deals: rows.reduce((a, x) => a + x.deals, 0), spend: round2(rows.reduce((a, x) => a + x.spend, 0)) };
    rows.forEach(x => { x.spendPct = total.spend ? x.spend / total.spend * 100 : 0; x.dealsPct = total.deals ? x.deals / total.deals * 100 : 0; });
    return { rows, total };
  }

  /* ===================== CR-29 §3.4 — Platform mix: committed deals by the platform of the account they are on ===================== */
  /* the same scope as the KOL tier mix (committed deals of the Campaigns in range) · a deal's platform = the platform of the account used in its posts —
     posts on more than one platform: the account the deal's tier comes from (the most followers among them — CR-04 §4.2), so every deal is in one row and
     Spend adds up to Committed · no post with an account = Not set · rows TikTok · Instagram · Facebook · X · Lemon8 · YouTube · Other (any other) · Not set */
  const PLATFORM_ROWS = ['TikTok', 'Instagram', 'Facebook', 'X', 'Lemon8', 'YouTube'];
  const PLATFORM_OTHER = 'Other';
  function dealPlatform(state, d, ctx) {
    const accs = (ctx.postsByDeal.get(d.deal_id) || []).map(p => ctx.accounts.get(p.account_id)).filter(Boolean);
    if (!accs.length) return { platform: R.NOT_SET, multi: false };
    const plats = new Set(accs.map(a => a.platform || ''));
    const best = accs.reduce((m, a) => (!m || Number(a.followers) > Number(m.followers) ? a : m), null) || accs[0];
    const p = best.platform || '';
    return { platform: PLATFORM_ROWS.includes(p) ? p : PLATFORM_OTHER, multi: plats.size > 1 };
  }
  function platformMix(state, from, to, today, statuses, ctxIn) { return platformMixOf(state, rangeDeals(state, from, to, today, statuses), ctxIn); }
  function platformMixOf(state, deals, ctxIn) {
    const ctx = ctxIn || R.dealContext(state);
    const keys = PLATFORM_ROWS.concat([PLATFORM_OTHER, R.NOT_SET]), by = new Map(keys.map(k => [k, { platform: k, deals: 0, spend: 0 }]));
    let multi = 0;
    deals.forEach(d => {
      const x = dealPlatform(state, d, ctx), row = by.get(x.platform);
      row.deals++; row.spend = round2(row.spend + totalCost(d)); if (x.multi) multi++;
    });
    const all = [...by.values()], total = { deals: all.reduce((a, x) => a + x.deals, 0), spend: round2(all.reduce((a, x) => a + x.spend, 0)) };
    all.forEach(x => { x.spendPct = total.spend ? x.spend / total.spend * 100 : 0; x.dealsPct = total.deals ? x.deals / total.deals * 100 : 0; });
    return { rows: all.filter(x => x.deals > 0), total, multi };
  }

  /* ===================== CR-13 §4.2 — Pillar mix: where the committed money went, by pillar ===================== */
  /* the target of a portfolio: each Campaign's pillar target (its own, else Settings' default) weighted by its budget ·
     no Campaign with a budget → a plain average · none → the default */
  function portfolioPillarTarget(state, campaigns) {
    const keys = ['awareness', 'consideration', 'conversion'], list = campaigns || [];
    if (!list.length) return Object.assign({}, R.pillarTargetOf(state, null));
    const w = c => (Number(c.budget_kol) > 0 ? Number(c.budget_kol) : 0), sumW = list.reduce((a, c) => a + w(c), 0);
    const weightOf = c => (sumW ? w(c) / sumW : 1 / list.length);
    return Object.fromEntries(keys.map(k => [k, list.reduce((a, c) => a + Number(R.pillarTargetOf(state, c.campaign_id)[k]) * weightOf(c), 0)]));
  }
  /* the same scope as the KPI cards and the KOL tier mix: committed deals (Confirm QT on, not cancelled) of the Campaigns whose dates touch the range ·
     rows Awareness → Consideration → Conversion → Not set (always last) · % of total · % of the money that has a pillar and its gap to the target
     (R.pillarShares — the same as Pillar allocation) · CR-19: no target · mostNoPillar: the Campaign with the most spend without a pillar */
  function pillarMix(state, from, to, today, statuses) { return pillarMixOf(state, rangeDeals(state, from, to, today, statuses)); }
  function pillarMixOf(state, deals) {
    const keys = R.PILLARS.concat([R.NOT_SET]), by = new Map(keys.map(k => [k, { pillar: k, deals: 0, spend: 0 }])), noneBy = new Map();
    deals.forEach(d => {
      const k = R.PILLARS.includes(d.pillar) ? d.pillar : R.NOT_SET, x = by.get(k);
      x.deals++; x.spend = round2(x.spend + totalCost(d));
      if (k === R.NOT_SET) noneBy.set(d.campaign_id, (noneBy.get(d.campaign_id) || 0) + totalCost(d));
    });
    const rows = [...by.values()], total = { deals: rows.reduce((a, x) => a + x.deals, 0), spend: round2(rows.reduce((a, x) => a + x.spend, 0)) };
    /* CR-19 §4.7 — what is, no target: % of total (and of the money that has a pillar) */
    const money = k => Object.fromEntries(rows.map(x => [x.pillar, x[k]]));
    const sh = { spend: R.pillarShares(money('spend')), deals: R.pillarShares(money('deals')) };
    rows.forEach(x => {
      x.spendPct = total.spend ? x.spend / total.spend * 100 : 0; x.dealsPct = total.deals ? x.deals / total.deals * 100 : 0;
      const set = x.pillar !== R.NOT_SET;
      x.ofSet = { spend: set ? sh.spend.pct[x.pillar] : null, deals: set ? sh.deals.pct[x.pillar] : null };
    });
    const none = by.get(R.NOT_SET), worst = [...noneBy.entries()].sort((a, b) => b[1] - a[1])[0];
    return { rows, total, set: { spend: round2(sh.spend.set), deals: sh.deals.set }, notSetPct: total.spend ? none.spend / total.spend * 100 : 0,
      mostNoPillar: worst ? worst[0] : null };
  }

  /* ===================== CR-19 §4.2–4.3 — Campaign timeline (All campaigns, Row 3) ===================== */
  /* one Campaign in the range: its bars (R.activityBins — the same numbers as before) with what falls outside its own dates kept apart */
  function campaignActivityBuckets(state, c, from, to, gran, measure, today) {
    const [start, end] = R.campaignDates(state, c);
    const r = R.activityBins(state, { campaignId: c.campaign_id }, from, to, gran, measure, 'campaign', today, start ? [start, end] : null);
    const bins = r.bins.map(b => ({ key: b.key, posted: b.posted, planned: b.planned, total: b.total, outPosted: b.outPosted, outPlanned: b.outPlanned }));
    return { start, end, gran, bins, posted: bins.reduce((a, b) => a + b.posted, 0), planned: bins.reduce((a, b) => a + b.planned, 0),
      undated: r.undated, outside: r.outside, outsidePeriod: r.outsidePeriod, first: r.first, last: r.last };
  }
  /* the order of the rows (§4.3): On going (ends soonest, then starts first) → Pending approval → Not started (starts soonest) → On hold →
     Complete (ended last first) → Cancelled (CR-21: a draft is never a row) */
  const TL_RANK = { ongoing: 0, wrap_up: 0.5, pending: 1, not_started: 2, on_hold: 3, complete: 4, draft: 5, cancelled: 6 };   // CR-29: Wrap-up (ended last first) after On going
  function timelineOrder(rows) {
    const k = (a, b) => String(a || '9999').localeCompare(String(b || '9999'));
    return rows.slice().sort((a, b) => (TL_RANK[a.status] - TL_RANK[b.status])
      || (a.status === 'ongoing' ? k(a.end, b.end) || k(a.start, b.start) : a.status === 'complete' || a.status === 'cancelled' || a.status === 'wrap_up' ? k(b.end, a.end) : k(a.start, b.start))
      || String(a.campaign.campaign_name).localeCompare(String(b.campaign.campaign_name)));
  }
  /* the card: a row a Campaign (status · dates · Phase starts · bars · money for the tooltip) · bars by week when the range is longer than 45 days,
     else by day · one scale for every row (max) · the footer numbers */
  function campaignTimeline(state, from, to, measure, today, statuses) {
    const gran = R.autoGran(from, to), idx = R.phaseIndex(state);
    const rows = timelineOrder(R.campaignsInRange(state, from, to, today, statuses).map(c => {
      const status = R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today), b = campaignActivityBuckets(state, c, from, to, gran, measure, today);
      const own = R.sortPhases(state.phases.filter(p => p.campaign_id === c.campaign_id && (R.isApproved(c) ? R.isApproved(p) : true) && R.isISODate(p.start_date)));
      return Object.assign({ campaign: c, status, phases: own.map(p => ({ phase_id: p.phase_id, start: p.start_date, end: p.end_date })),
        money: R.campaignMoney(state, c.campaign_id, idx), days: daysLeft({ status, from: b.start, to: b.end }, today) }, b);
    }));
    let keys = rows.length ? rows[0].bins.map(b => b.key) : [];
    if (!keys.length) { let cur = gran === 'week' ? R.weekStart(from) : from; while (cur <= to && keys.length <= 800) { keys.push(cur); cur = addDays(cur, gran === 'week' ? 7 : 1); } }
    const sum = f => rows.reduce((a, r) => a + f(r), 0);
    return { from, to, gran, measure, keys, rows, max: Math.max(0, ...rows.flatMap(r => r.bins.map(b => b.total))),
      undated: { count: sum(r => r.undated.count), amount: sum(r => r.undated.amount) }, outside: sum(r => r.outside), outsidePeriod: sum(r => r.outsidePeriod) };
  }

  /* ===================== Time axis (§4.2) — one row, one format for the range shown ===================== */
  /* gran (the bars) given or worked out: longer than 92 days = weeks (from Monday) · else days.
     ticks (and their grid lines): > 92 days = the 1st of each month "Jan" (a range that crosses a year says "Jan 27" on January) ·
     15–92 days (or weeks) = Mondays "5 Oct" · 14 days or fewer in days = every day "Mon 5" */
  function timeAxis(from, to, gran) {
    const O = C.overview, len = dayDiff(to, from) + 1, bars = gran || (len > 92 ? 'week' : 'day');
    const mode = len > 92 ? 'month' : bars === 'day' && len <= 14 ? 'day' : 'monday';
    const start = bars === 'week' ? R.weekStart(from) : from, end = bars === 'week' ? addDays(R.weekStart(to), 6) : to, ticks = [];
    if (mode === 'month') {
      /* the 1st of each month inside the range chosen (not the padded first / last week) */
      const crossYear = from.slice(0, 4) !== to.slice(0, 4);
      let y = +from.slice(0, 4), m = +from.slice(5, 7), d;
      if (from.slice(8) !== '01') { m++; if (m > 12) { m = 1; y++; } }
      for (d = `${y}-${String(m).padStart(2, '0')}-01`; d <= to; ) {
        ticks.push({ date: d, label: O.months[m - 1] + (crossYear && m === 1 ? ' ' + String(y).slice(2) : '') });
        m++; if (m > 12) { m = 1; y++; } d = `${y}-${String(m).padStart(2, '0')}-01`;
      }
    } else {
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const wd = new Date(d + 'T00:00:00Z').getUTCDay();
        if (mode === 'day' || wd === 1) ticks.push({ date: d, label: mode === 'day' ? `${O.dows[wd]} ${+d.slice(8)}` : `${+d.slice(8)} ${O.months[+d.slice(5, 7) - 1]}` });
      }
    }
    return { gran: bars, mode, start, end, ticks };
  }

  /* ===================== CR-10 §4.8 — a date range, picked or typed ===================== */
  /* start / end as ISO or dd/mm/yyyy (blank = not chosen yet) → {from, to, errs [{field: 'start' | 'end', msg}]} ·
     a date that cannot be read = "Use dd/mm/yyyy" · an end before the start = "End date must be on or after start date" */
  function validateRange(start, end) {
    const errs = [];
    const read = v => { const t = String(v == null ? '' : v).trim(); if (!t) return ''; if (R.isISODate(t)) return t;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (!m) return null; const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return R.isISODate(iso) ? iso : null; };
    const from = read(start), to = read(end);
    if (from === null) errs.push({ field: 'start', msg: C.msg.rangeFormat });
    if (to === null) errs.push({ field: 'end', msg: C.msg.rangeFormat });
    if (from && to && to < from) errs.push({ field: 'end', msg: C.msg.rangeOrder });
    return { from: from || '', to: to || '', errs };
  }
  /* the days a range covers, both ends counted (null when not a range) */
  const rangeDays = (from, to) => (R.isISODate(from) && R.isISODate(to) && to >= from ? dayDiff(to, from) + 1 : null);
  /* CR-10 §4.9 — Timeline "Fit": the earliest start − 7 days … the latest end + 7 days of the Campaigns picked (their Phases) */
  function fitRange(state, campaignIds) {
    const set = new Set(campaignIds || []), ds = state.phases.filter(p => set.has(p.campaign_id));
    const from = ds.map(p => p.start_date).filter(R.isISODate).sort()[0], to = ds.map(p => p.end_date).filter(R.isISODate).sort().pop();
    return from && to ? { from: addDays(from, -7), to: addDays(to, 7) } : null;
  }

  /* ===================== CR-26 §3.2 — Budget vs Actual by month (Post date, not the day it was paid) ===================== */
  const monthKey = iso => iso.slice(0, 7);
  const monthEnd = key => { const [y, m] = key.split('-').map(Number); return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
  const nextMonth = key => { const [y, m] = key.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const daysIn = (a, z) => (a > z ? 0 : dayDiff(z, a) + 1);
  const addMonths = (iso, n) => { const [y, m] = iso.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}-01`; };
  /* the part of an amount spread evenly over the days [start, end] that falls in [a, z] */
  const shareIn = (x, a, z) => { const n = daysIn(x.start, x.end), d = daysIn(x.start > a ? x.start : a, x.end < z ? x.end : z); return n && d ? x.amount * d / n : 0; };
  /* Post due: the earliest expected date of a post not posted yet · else the deal's own */
  const postDueOf = (state, d) => R.postsOf(state, d.deal_id).filter(p => R.isBlank(p.post_date)).map(p => p.expected_post_date).filter(R.isISODate).sort()[0] || (R.isISODate(d.expected_post_date) ? d.expected_post_date : null);
  const firstPostDate = (state, d) => R.postsOf(state, d.deal_id).map(p => p.post_date).filter(R.isISODate).sort()[0] || null;
  /* the plan: each Phase's budget over its days · the Campaign budget no Phase has (all of it when no Phase has one) over the Campaign's days ·
     a Phase chosen → that Phase only */
  function budgetItems(state, camps, phaseId) {
    const out = [];
    camps.forEach(c => {
      const phs = R.phasesOfCampaign(state, c.campaign_id).filter(p => R.isISODate(p.start_date) && R.isISODate(p.end_date) && p.end_date >= p.start_date);
      const money = p => (R.isBlank(p.budget_kol) ? 0 : Number(p.budget_kol) || 0);
      if (phaseId) { const p = phs.find(x => x.phase_id === phaseId); if (p && money(p) > 0) out.push({ amount: money(p), start: p.start_date, end: p.end_date, campaign_id: c.campaign_id }); return; }
      let allocated = 0;
      phs.forEach(p => { if (money(p) > 0) { allocated += money(p); out.push({ amount: money(p), start: p.start_date, end: p.end_date, campaign_id: c.campaign_id }); } });
      const total = R.isBlank(c.budget_kol) ? 0 : Number(c.budget_kol) || 0, [a, z] = R.campaignRange(state, c.campaign_id);
      if (total - allocated > 0 && R.isISODate(a) && R.isISODate(z)) out.push({ amount: total - allocated, start: a, end: z, campaign_id: c.campaign_id, unallocated: true });
    });
    return out;
  }
  const OVER = 1.05, BEHIND = 0.85;   // §6 #3
  /* the words of a month (or of "to date"): Over > 105% of the plan · Behind < 85% (months that have passed) · in between nothing */
  function bvaStatus(actual, budget, past) {
    if (actual > budget * OVER && actual - budget >= 1) return { status: 'over', amount: round2(actual - budget) };
    if (past && budget > 0 && actual < budget * BEHIND) return { status: 'behind', amount: round2(budget - actual) };
    return { status: null, amount: 0 };
  }
  /* o = { from, to, statuses, today, campaignId?, phaseId? } → { months [{ key, from, to, budget, posted, upcoming, late, actual, variance, pct, status, amount,
     past, current, camps [{campaign_id, amount}] (most first) }], cum [{ key, budget, posted, plus }], total, noDate {amount, deals}, outside, toDate, rest }
     Budget = the plan (budgetItems) · Posted = the Total cost of a committed deal in the month of its first Post date · not posted yet → the month of its
     Post due: Upcoming, or Late once that day has passed · neither date → No post date (not on the chart) · Variance: a month that has passed = Posted − Budget,
     this month and later = Posted + Upcoming + Late − Budget */
  function budgetVsActualByMonth(state, o) {
    const today = o.today || R.todayISO(), L = state.lookups;
    let camps = o.campaignId ? [R.campaignOf(state, o.campaignId)].filter(Boolean) : R.campaignsInRange(state, o.from, o.to, today, o.statuses);
    camps = camps.filter(c => R.isApproved(c));
    const ids = new Set(camps.map(c => c.campaign_id)), items = budgetItems(state, camps, o.phaseId || null);
    const idx = o.phaseId ? R.phaseIndex(state) : null;
    const deals = state.deals.filter(d => ids.has(d.campaign_id) && !isCancelled(d) && !R.isShortlist(L, d) && (!o.phaseId || R.primaryPhase(idx, d.deal_id) === o.phaseId));
    /* each committed deal: where it sits */
    const placed = deals.map(d => { const first = firstPostDate(state, d), due = first ? null : postDueOf(state, d);
      return { d, amount: totalCost(d), date: first || due, kind: first ? 'posted' : !due ? 'none' : due < today ? 'late' : 'upcoming' }; });
    /* the months: the range given · By campaign (no range given) = the Campaign's / Phase's own months, widened to the months its deals sit in */
    let from = o.from, to = o.to;
    if (!from || !to) {
      const [a, z] = o.phaseId ? (() => { const p = state.phases.find(x => x.phase_id === o.phaseId) || {}; return [p.start_date, p.end_date]; })() : R.campaignRange(state, o.campaignId);
      /* a date more than 3 months before / after (a typo, an old import) stays off the chart and is counted in outside */
      const lo = R.isISODate(a) ? addMonths(a, -3) : null, hi = R.isISODate(z) ? addMonths(z, 3) : null;
      const ds = placed.filter(x => x.date && (!lo || x.date >= lo) && (!hi || x.date <= hi)).map(x => x.date).concat([a, z].filter(R.isISODate)).sort();
      from = ds.length ? ds[0].slice(0, 7) + '-01' : today.slice(0, 7) + '-01'; to = ds.length ? monthEnd(monthKey(ds[ds.length - 1])) : monthEnd(monthKey(today));
    }
    const months = [], cur = monthKey(today);
    for (let k = monthKey(from); k <= monthKey(to) && months.length < 60; k = nextMonth(k)) {
      const a = `${k}-01` < from ? from : `${k}-01`, z = monthEnd(k) > to ? to : monthEnd(k);
      months.push({ key: k, from: a, to: z, budget: 0, posted: 0, upcoming: 0, late: 0, past: k < cur, current: k === cur, campBy: new Map() });
    }
    const at = new Map(months.map(m => [m.key, m]));
    items.forEach(x => months.forEach(m => { m.budget += shareIn(x, m.from, m.to); }));
    const noDate = { amount: 0, deals: 0 }, outside = { amount: 0, deals: 0 };
    placed.forEach(x => {
      if (x.kind === 'none') { noDate.amount += x.amount; noDate.deals++; return; }
      const m = x.date >= from && x.date <= to ? at.get(monthKey(x.date)) : null;
      if (!m) { outside.amount += x.amount; outside.deals++; return; }
      m[x.kind] += x.amount; m.campBy.set(x.d.campaign_id, (m.campBy.get(x.d.campaign_id) || 0) + x.amount);
    });
    let cb = 0, cp = 0, cx = 0;
    const cum = [];
    months.forEach(m => {
      ['budget', 'posted', 'upcoming', 'late'].forEach(k2 => { m[k2] = round2(m[k2]); });
      m.actual = round2(m.past ? m.posted : m.posted + m.upcoming + m.late);
      m.variance = round2(m.actual - m.budget);
      m.pct = m.budget ? m.actual / m.budget * 100 : null;
      Object.assign(m, bvaStatus(m.actual, m.budget, m.past));
      m.camps = [...m.campBy.entries()].map(([campaign_id, amount]) => ({ campaign_id, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
      delete m.campBy;
      cb += m.budget; cp += m.posted; cx += m.posted + m.upcoming + m.late;
      cum.push({ key: m.key, budget: round2(cb), posted: round2(cp), plus: round2(cx) });
    });
    const sum = k2 => round2(months.reduce((a, m) => a + m[k2], 0));
    const total = { budget: sum('budget'), posted: sum('posted'), upcoming: sum('upcoming'), late: sum('late') };
    /* To date: the plan up to today (by the day) vs what was posted by today · Rest: the plan after today vs the committed upcoming */
    let toDate = null, rest = null;
    if (today >= from) {
      const end = today < to ? today : to, planned = round2(items.reduce((a, x) => a + shareIn(x, from, end), 0));
      const posted = round2(placed.filter(x => x.kind === 'posted' && x.date >= from && x.date <= end).reduce((a, x) => a + x.amount, 0));
      toDate = Object.assign({ planned, posted, pct: planned ? posted / planned * 100 : null }, bvaStatus(posted, planned, true));
    }
    if (today < to) {
      const start = today >= from ? addDays(today, 1) : from;
      rest = { planned: round2(items.reduce((a, x) => a + shareIn(x, start, to), 0)), upcoming: total.upcoming };
    }
    return { from, to, months, cum, total, noDate: { amount: round2(noDate.amount), deals: noDate.deals }, outside: { amount: round2(outside.amount), deals: outside.deals }, toDate, rest,
      campaigns: camps.map(c => c.campaign_id) };
  }

  /* ===================== CR-26 §3.4 — Team workload: a row a person (By campaign · Operations › Team load count open deals with it) ===================== */
  /* deals → [{ pic (null = Not assigned), partners (KOLs once, not cancelled), open (List / In process), posted (Complete), postOverdue (open · Post due before
     today), noPostDue (open · no Post due), cancelled, committed (committed money, not cancelled), docs (Docs to collect) }] · most open deals first */
  function teamWorkload(state, deals, today) {
    const by = new Map(), docs = R.docsByDeal(state, today), L = state.lookups;
    const at = k => by.get(k) || (by.set(k, { pic: k || null, kols: new Set(), open: 0, posted: 0, postOverdue: 0, noPostDue: 0, cancelled: 0, committed: 0, docs: 0 }), by.get(k));
    deals.forEach(d => {
      const w = at(d.pic || '');
      if (isCancelled(d)) { w.cancelled++; return; }
      w.kols.add(d.kol_id);
      if (!R.isShortlist(L, d)) w.committed += totalCost(d);
      if (docs.has(d.deal_id)) w.docs++;
      if (d.status === 'Complete') { w.posted++; return; }
      if (!R.isOpenDeal(d)) return;
      w.open++;
      const due = postDueOf(state, d);
      if (!due) w.noPostDue++; else if (due < today) w.postOverdue++;
    });
    return [...by.values()].map(w => Object.assign(w, { partners: w.kols.size, kolIds: w.kols, committed: round2(w.committed) }))
      .sort((a, b) => b.open - a.open || (a.pic ? 0 : 1) - (b.pic ? 0 : 1) || String(a.pic || '').localeCompare(String(b.pic || ''), 'th'));
  }
  /* the Total row (partners once across people) */
  function teamWorkloadTotal(rows) {
    const t = { partners: new Set(rows.flatMap(r => [...r.kolIds])).size };
    ['open', 'posted', 'postOverdue', 'noPostDue', 'cancelled', 'docs'].forEach(k => { t[k] = rows.reduce((a, r) => a + r[k], 0); });
    t.committed = round2(rows.reduce((a, r) => a + r.committed, 0));
    return t;
  }

  return { budgetVsActualByMonth, budgetItems, postDueOf, firstPostDate, BVA_OVER: OVER, BVA_BEHIND: BEHIND, bvaStatus, teamWorkload, teamWorkloadTotal,
    campaignActivityBuckets, timelineOrder, campaignTimeline, portfolioPillarTarget, pillarMix, PLATFORM_ROWS, PLATFORM_OTHER, dealPlatform, platformMix,
    campaignMixDeals, tierMixOf, pillarMixOf, platformMixOf, daysLeft, daysLeftRank, campaignItem, portfolioKpis, tierMix, timeAxis, validateRange, rangeDays, fitRange };
})(KT.rules, KT.content));
