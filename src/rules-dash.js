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
  /* the Campaigns whose dates touch [from, to] (Cancelled only when asked) — the same rows as the Campaign portfolio */
  function portfolioKpis(state, from, to, today, includeCancelled) {
    const p = R.portfolio(state, from, to, today, includeCancelled), rows = p.rows.filter(r => includeCancelled || r.status !== 'cancelled');
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
  function tierMix(state, from, to, today, includeCancelled, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), rules = state.lookups.tier_rules || [];
    const ids = new Set(R.campaignsInRange(state, from, to, today, includeCancelled).map(c => c.campaign_id));
    const by = new Map(R.tierOrder(rules).map(t => [t, { tier: t, range: t === R.UNKNOWN_TIER ? null : R.tierRange(rules, t), deals: 0, spend: 0 }]));
    state.deals.filter(d => ids.has(d.campaign_id) && !isCancelled(d) && !R.isShortlist(state.lookups, d)).forEach(d => {
      const t = (ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER, x = by.get(t) || by.get(R.UNKNOWN_TIER);
      x.deals++; x.spend = round2(x.spend + totalCost(d));
    });
    const rows = [...by.values()], total = { deals: rows.reduce((a, x) => a + x.deals, 0), spend: round2(rows.reduce((a, x) => a + x.spend, 0)) };
    rows.forEach(x => { x.spendPct = total.spend ? x.spend / total.spend * 100 : 0; x.dealsPct = total.deals ? x.deals / total.deals * 100 : 0; });
    return { rows, total };
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

  return { daysLeft, daysLeftRank, campaignItem, portfolioKpis, tierMix, timeAxis };
})(KT.rules, KT.content));
