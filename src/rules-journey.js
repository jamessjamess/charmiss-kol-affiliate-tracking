/* rules-journey.js — CR-07 §4.9: a deal's Journey as a timeline (like an SLA) — the date each step was passed, the days between
   steps, on time / late against the expected date, the step being waited on — and the payment track under it.
   Pure functions; adds to KT.rules (load after rules-kol.js). Move stage, the content plan and payment_state do not change. */
Object.assign(KT.rules, (function (R) {
  'use strict';
  const { dayDiff, termOf } = R;

  /* the dates a step can have besides the status log: Brief = brief_date · Script = script_date · Draft n = approved_draft{n}_date · Approve = approved_date ·
     Post = the latest post date */
  function fieldDate(st, deal, posts) {
    const n = R.draftNo(st);
    if (n) return deal[`approved_draft${n}_date`] || null;
    if (R.isPostStep(st)) return (posts || []).map(p => p.post_date).filter(Boolean).sort().pop() || null;
    return st.date_field ? deal[st.date_field] || null : null;
  }
  /* what a step is expected by: Script / Draft n / Approve = its expected field (R.expectedField) · Post = expected_post_date (else the earliest
     expected date of a post not posted yet) */
  function expectedOf(st, deal, posts) {
    if (R.isPostStep(st)) return deal.expected_post_date || (posts || []).filter(p => !p.post_date).map(p => p.expected_post_date).filter(Boolean).sort()[0] || null;
    const f = R.expectedField(st);
    return f ? deal[f] || null : null;
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

  /* ===================== CR-15 §3 — schema 14: the journey of today ===================== */
  /* a step's name = the last piece of work done, waiting for the next one · label_th says it in Thai (editable in Settings) */
  const JOURNEY_V14 = [
    { sort_order: 10, status: 'List', sub_status: 'Shortlist', is_optional: true, date_field: null, expected_field: null, label_th: 'คัดรายชื่อแล้ว รอติดต่อ', proposed: true },
    { sort_order: 20, status: 'List', sub_status: 'Contacted', is_optional: true, date_field: null, expected_field: null, label_th: 'ติดต่อ / ขอ rate แล้ว รอยืนยัน', proposed: true },
    { sort_order: 30, status: 'List', sub_status: 'Confirm QT', is_optional: false, date_field: null, expected_field: null, label_th: 'ยืนยันใบเสนอราคาแล้ว รอส่ง Brief', proposed: false },
    { sort_order: 40, status: 'Inprocess', sub_status: 'Brief', is_optional: false, date_field: 'brief_date', expected_field: null, label_th: 'ส่ง Brief แล้ว รอ KOL ส่ง Script', proposed: false },
    { sort_order: 50, status: 'Inprocess', sub_status: 'Script', is_optional: false, date_field: 'script_date', expected_field: 'expected_script_date', label_th: 'ตรวจ Script แล้ว รอ KOL ทำ Draft 1', proposed: false },
    { sort_order: 60, status: 'Inprocess', sub_status: 'Draft 1', is_optional: false, date_field: 'approved_draft1_date', expected_field: 'expected_draft1_date', label_th: 'ส่ง feedback Draft 1 แล้ว รอ KOL แก้ / ทำต่อ', proposed: false },
    { sort_order: 70, status: 'Inprocess', sub_status: 'Draft 2', is_optional: true, date_field: 'approved_draft2_date', expected_field: 'expected_draft2_date', label_th: 'ส่ง feedback Draft 2 แล้ว', proposed: false },
    { sort_order: 80, status: 'Inprocess', sub_status: 'Draft 3', is_optional: true, date_field: 'approved_draft3_date', expected_field: 'expected_draft3_date', label_th: 'ส่ง feedback Draft 3 แล้ว', proposed: false },
    { sort_order: 90, status: 'Inprocess', sub_status: 'Approve', is_optional: false, date_field: 'approved_date', expected_field: 'expected_approve_date', label_th: 'อนุมัติงานแล้ว รอ KOL โพสต์', proposed: false },
    { sort_order: 100, status: 'Complete', sub_status: 'Post', is_optional: false, date_field: null, expected_field: 'expected_post_date', label_th: 'โพสต์แล้ว', proposed: false },
    { sort_order: 110, status: 'Cancel', sub_status: 'Cancel', is_optional: false, date_field: null, expected_field: null, label_th: 'ยกเลิก', proposed: false },
  ];
  /* the old names → today's (the data keeps every date; only the names move) */
  const STEP_RENAMES = { 'Approve Script': 'Script', 'Approve Draft 1': 'Draft 1', 'Approve Draft 2': 'Draft 2', 'Approve Draft 3': 'Draft 3' };
  /* the labels the old journey came with — any other label was typed by someone and is kept */
  const OLD_LABELS = { Shortlist: 'คัดรายชื่อไว้', Contacted: 'ติดต่อ/ขอ rate แล้ว', 'Confirm QT': 'ยืนยันใบเสนอราคา', Brief: 'ส่ง Brief แล้ว', 'Approve Script': 'อนุมัติ Script',
    'Approve Draft 1': 'อนุมัติ Draft 1', 'Approve Draft 2': 'อนุมัติ Draft 2', 'Approve Draft 3': 'อนุมัติ Draft 3', Post: 'โพสต์ครบ', Cancel: 'ยกเลิก' };
  const NEW_DATE_FIELDS = ['expected_script_date', 'script_date', 'expected_approve_date', 'approved_date'];
  /* v13 → v14: journey_steps = JOURNEY_V14 (a label someone typed stays with its step · Shortlist / Contacted keep active · steps added by hand stay) ·
     sub_status renamed in deals and in deal_status_log (from / to · dates untouched) · the 4 new date fields (null) · runs twice → the same */
  function migrateV14(obj) {
    const L = obj.lookups = obj.lookups || {}, old = Array.isArray(L.journey_steps) ? L.journey_steps : [];
    const rename = v => (v && STEP_RENAMES[v]) || v;
    const known = new Set(JOURNEY_V14.map(s => s.sub_status).concat(Object.keys(STEP_RENAMES)));
    const byNew = new Map(old.map(s => [rename(s.sub_status), s]));
    const steps = JOURNEY_V14.map(n => {
      const out = Object.assign({}, n), o = byNew.get(n.sub_status);
      if (o) {
        const lab = String(o.label_th || '').trim();
        if (lab && lab !== OLD_LABELS[o.sub_status] && lab !== o.sub_status && lab !== n.sub_status) out.label_th = lab;
        if (n.is_optional && o.active === false) out.active = false;   // only a step that may be off stays off
      }
      return out;
    });
    old.filter(s => !known.has(s.sub_status)).forEach(s => steps.push(Object.assign({}, s)));
    L.journey_steps = steps;
    (obj.deals || []).forEach(d => {
      d.sub_status = rename(d.sub_status);
      NEW_DATE_FIELDS.forEach(f => { if (d[f] === undefined) d[f] = null; });
    });
    (obj.deal_status_log || []).forEach(l => { l.sub_status = rename(l.sub_status); l.from_sub_status = rename(l.from_sub_status); });
    obj.schema_version = 14;
    return obj;
  }

  return { dealTimeline, paymentTimeline, JOURNEY_V14, STEP_RENAMES, migrateV14 };
})(KT.rules));
