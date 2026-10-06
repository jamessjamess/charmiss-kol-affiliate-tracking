/* rules-journey.js — CR-07 §4.9: a deal's Journey as a timeline (like an SLA) — the date each step was passed, the days between
   steps, on time / late against the expected date, the step being waited on — and the payment track under it.
   Pure functions; adds to KT.rules (load after rules-kol.js). Move stage, the content plan and payment_state do not change. */
Object.assign(KT.rules, (function (R) {
  'use strict';
  const { dayDiff, termOf } = R;

  /* the dates a step can have besides the status log: Brief = brief_date · Draft n = approved_draft{n}_date · Post = the latest post date */
  function fieldDate(st, deal, posts) {
    const n = R.draftNo(st);
    if (n) return deal[`approved_draft${n}_date`] || null;
    if (R.isPostStep(st)) return (posts || []).map(p => p.post_date).filter(Boolean).sort().pop() || null;
    return st.date_field ? deal[st.date_field] || null : null;
  }
  /* what a step is expected by: Draft n = expected_draft{n}_date · Post = expected_post_date (else the earliest expected date of a post not posted yet) */
  function expectedOf(st, deal, posts) {
    const n = R.draftNo(st);
    if (n) return deal[`expected_draft${n}_date`] || null;
    if (R.isPostStep(st)) return deal.expected_post_date || (posts || []).filter(p => !p.post_date).map(p => p.expected_post_date).filter(Boolean).sort()[0] || null;
    return null;
  }
  /* the step a cancelled deal had reached: the move into Cancel says it, else the last other log, else the last step with a date */
  function reachedBeforeCancel(lookups, deal, logs, posts) {
    for (let i = logs.length - 1; i >= 0; i--) { const l = logs[i]; if (l.sub_status === 'Cancel' && l.from_sub_status && l.from_sub_status !== 'Cancel') return l.from_sub_status; }
    const other = logs.filter(l => l.sub_status !== 'Cancel').pop(); if (other) return other.sub_status;
    const dated = R.planSteps(lookups, deal).filter(st => !R.isCancelStep(st) && fieldDate(st, deal, posts)).pop();
    return dated ? dated.sub_status : null;
  }

  /* → { steps: [{ sub, short, state, date, expected, days, late_days, overdue_days, waiting, log }], cancelled: {date, reason} | null,
         summary: {kind: 'complete' | 'progress', days} | null }
     state: done · late · nodate (passed) · current (the step being waited on; overdue_days once its expected date is gone) · upcoming · overdue (upcoming, past its expected date).
     Shortlist and Contacted show only when the deal was there (a log) or is there now. */
  function dealTimeline(lookups, deal, logs, posts, today) {
    logs = (logs || []).slice().sort((a, b) => a.log_id - b.log_id);
    const cancelled = deal.status === 'Cancel';
    const reachedSub = cancelled ? reachedBeforeCancel(lookups, deal, logs, posts) : deal.sub_status;
    const reached = reachedSub ? R.stepOf(lookups, reachedSub) : null, refSort = reached ? reached.sort_order : -Infinity;
    const qt = R.stepOf(lookups, 'Confirm QT'), qtSort = qt ? qt.sort_order : -Infinity;
    const logged = new Set(logs.map(l => l.sub_status));
    const plan = R.planSteps(lookups, deal).filter(st => !R.isCancelStep(st) &&
      (st.sort_order >= qtSort || logged.has(st.sub_status) || st.sub_status === reachedSub));
    const next = cancelled ? null : R.nextStep(lookups, deal).step;
    const complete = deal.status === 'Complete';
    const steps = [];
    let lastDate = null;
    for (const st of plan) {
      if (cancelled && st.sort_order > refSort) break;
      const passed = complete || st.sort_order <= refSort;
      const ls = logs.filter(l => l.sub_status === st.sub_status && l.effective_date), log = ls.pop() || logs.filter(l => l.sub_status === st.sub_status).pop() || null;
      const expected = expectedOf(st, deal, posts);
      const x = { sub: st.sub_status, short: R.stepShort(st.sub_status), state: 'upcoming', date: null, expected, days: null, late_days: null, overdue_days: null, waiting: null, log };
      if (passed) {
        x.date = (log && log.effective_date) || fieldDate(st, deal, posts);
        if (!x.date) x.state = 'nodate';
        else {
          if (lastDate) x.days = dayDiff(x.date, lastDate);
          x.late_days = expected && x.date > expected ? dayDiff(x.date, expected) : null;
          x.state = x.late_days ? 'late' : 'done';
          lastDate = x.date;
        }
      } else {
        if (next && st.sub_status === next.sub_status) { x.state = 'current'; if (lastDate) x.waiting = dayDiff(today, lastDate); }
        if (expected && today > expected) { x.overdue_days = dayDiff(today, expected); if (x.state !== 'current') x.state = 'overdue'; }
      }
      steps.push(x);
    }
    let cancel = null;
    if (cancelled) { const cl = logs.filter(l => l.sub_status === 'Cancel'), c = cl.filter(l => l.effective_date).pop() || cl.pop() || null; cancel = { date: c ? c.effective_date || null : null, reason: deal.cancel_reason || null, log: c }; }
    const brief = steps.find(x => x.sub === 'Brief'), post = steps.find(x => R.isPostStep(R.stepOf(lookups, x.sub)));
    let summary = null;
    if (!cancelled && complete && brief && brief.date && post && post.date) summary = { kind: 'complete', days: dayDiff(post.date, brief.date) };
    else if (!cancelled && !complete && brief && brief.date && deal.status === 'Inprocess') summary = { kind: 'progress', days: dayDiff(today, brief.date) };
    return { steps, cancelled: cancel, summary };
  }

  /* the payment track (CR-02 §4.3 terms): prepaid / postpaid = Docs → Paid · split_50 = Docs → Deposit 50% → Paid · no term = Docs → 50% → Paid ·
     free = nothing to track · when it is owed: prepaid Paid and split_50 Deposit before Brief · postpaid and split_50 Paid after Post ·
     state = payment_state (overdue · due · paid …) */
  function paymentTimeline(deal, today) {
    const term = termOf(deal), state = R.paymentState(deal, today);
    if (term === 'free') return { term, state, items: [] };
    const when = flag => (flag === 'paid_full' && term === 'prepaid') || (flag === 'paid_50' && term === 'split_50') ? 'before_brief'
      : flag === 'paid_full' && (term === 'postpaid' || term === 'split_50') ? 'after_post' : null;
    const items = R.paymentMilestones(term).map(flag => ({ flag, done: !!deal[flag], date: deal[flag + '_date'] || null, when: when(flag) }));
    return { term, state, items };
  }

  return { dealTimeline, paymentTimeline };
})(KT.rules));
