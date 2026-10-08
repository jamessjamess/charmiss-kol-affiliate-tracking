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
      kols: { n: new Set(committedDeals.map(d => d.kol_id)).size, deals: committedDeals.length, avg: committedDeals.length ? Math.round(t.committed / committedDeals.length) : null },
    };
  }

  /* ===================== KOL tier mix (§4.1) ===================== */
  /* committed deals (Confirm QT on, not cancelled) of the Campaigns in range by the deal's tier (CR-04 §4.2) — Mega → … → Nano → Unknown,
     each with its followers range, spend, deals and their shares */
  function tierMix(state, from, to, today, statuses, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), rules = state.lookups.tier_rules || [];
    const ids = new Set(R.campaignsInRange(state, from, to, today, statuses).map(c => c.campaign_id));
    const by = new Map(R.tierOrder(rules).map(t => [t, { tier: t, range: t === R.UNKNOWN_TIER ? null : R.tierRange(rules, t), deals: 0, spend: 0 }]));
    state.deals.filter(d => ids.has(d.campaign_id) && !isCancelled(d) && !R.isShortlist(state.lookups, d)).forEach(d => {
      const t = (ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER, x = by.get(t) || by.get(R.UNKNOWN_TIER);
      x.deals++; x.spend = round2(x.spend + totalCost(d));
    });
    const rows = [...by.values()], total = { deals: rows.reduce((a, x) => a + x.deals, 0), spend: round2(rows.reduce((a, x) => a + x.spend, 0)) };
    rows.forEach(x => { x.spendPct = total.spend ? x.spend / total.spend * 100 : 0; x.dealsPct = total.deals ? x.deals / total.deals * 100 : 0; });
    return { rows, total };
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
  function pillarMix(state, from, to, today, statuses) {
    const camps = R.campaignsInRange(state, from, to, today, statuses), ids = new Set(camps.map(c => c.campaign_id));
    const keys = R.PILLARS.concat([R.NOT_SET]), by = new Map(keys.map(k => [k, { pillar: k, deals: 0, spend: 0 }])), noneBy = new Map();
    state.deals.filter(d => ids.has(d.campaign_id) && !isCancelled(d) && !R.isShortlist(state.lookups, d)).forEach(d => {
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
     Complete (ended last first) → Rejected → Cancelled */
  const TL_RANK = { ongoing: 0, pending: 1, not_started: 2, on_hold: 3, complete: 4, rejected: 5, cancelled: 6 };
  function timelineOrder(rows) {
    const k = (a, b) => String(a || '9999').localeCompare(String(b || '9999'));
    return rows.slice().sort((a, b) => (TL_RANK[a.status] - TL_RANK[b.status])
      || (a.status === 'ongoing' ? k(a.end, b.end) || k(a.start, b.start) : a.status === 'complete' || a.status === 'cancelled' || a.status === 'rejected' ? k(b.end, a.end) : k(a.start, b.start))
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

  return { campaignActivityBuckets, timelineOrder, campaignTimeline, portfolioPillarTarget, pillarMix, daysLeft, daysLeftRank, campaignItem, portfolioKpis, tierMix, timeAxis, validateRange, rangeDays, fitRange };
})(KT.rules, KT.content));
