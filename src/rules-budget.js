/* rules-budget.js — CR-18 §3 · §4.2 · §4.3: a Campaign's budget over time and the Phase Planner's Budget % ↔ Amount.
   campaign_budget_changes: initial (the first budget) · increase · decrease — each with allocations to Phases / 'unallocated', a reason and a status
   (draft · pending · approved · cancelled — CR-21: a returned one is a draft again). campaigns.budget_kol = the approved total (initial + increases − decreases) and phases.budget_kol = the
   approved Phase budgets: both change only when a change is approved. Staff ask (pending, one at a time per Campaign) · Admin / KOL Manager apply at
   once (it is still in the history). Every money number elsewhere keeps using the approved budget — a pending one only shows as "+฿x pending".
   CR-21 — Save draft too · every state change goes through R.requestTransition (rules-request.js).
   Pure functions; adds to KT.rules (load after rules-approval.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, trim } = R;
  const B = C.budget;
  const round2 = n => Math.round(n * 100) / 100;
  const issue = (field, msg, kind) => (kind ? { field, msg, kind } : { field, msg });
  const BUDGET_TYPES = ['initial', 'increase', 'decrease'];
  const BUDGET_STATUSES = ['draft', 'pending', 'approved', 'cancelled'];
  const UNALLOCATED = 'unallocated';
  /* "1,000,000" / 1000000 / '' → a number or null */
  const money = v => { if (v == null || v === '') return null; const t = String(v).replace(/,/g, '').trim(); return t === '' || isNaN(t) ? null : Number(t); };
  const changes = state => (Array.isArray(state.campaign_budget_changes) ? state.campaign_budget_changes : (state.campaign_budget_changes = []));
  const nextChangeId = list => 'BG-' + String(list.reduce((m, x) => Math.max(m, parseInt(String(x.change_id).replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(4, '0');
  const campaignOf = (state, id) => (state.campaigns || []).find(c => c.campaign_id === id) || null;
  const phaseOf = (state, id) => (state.phases || []).find(p => p.phase_id === id) || null;
  const approvedPhases = (state, cid) => R.sortPhases((state.phases || []).filter(p => p.campaign_id === cid && R.isApproved(p)));
  const sign = x => (x.type === 'decrease' ? -1 : 1);
  const byTime = (a, b) => String(a.requested_at || '').localeCompare(String(b.requested_at || '')) || String(a.change_id).localeCompare(String(b.change_id));

  /* ---------- what there is ---------- */
  const budgetChangesOf = (state, cid) => changes(state).filter(x => x.campaign_id === cid).sort(byTime);
  /* the increase / decrease that waits (one at a time per Campaign — §4.3) */
  const pendingBudgetChange = (state, cid) => changes(state).find(x => x.campaign_id === cid && x.status === 'pending' && x.type !== 'initial') || null;
  const pendingBudgetChanges = state => changes(state).filter(x => x.status === 'pending' && x.type !== 'initial');
  /* + / − ฿ a pending change would bring to the Campaign · to one Phase (or 'unallocated') */
  const pendingDelta = (state, cid) => { const x = pendingBudgetChange(state, cid); return x ? sign(x) * Number(x.amount || 0) : 0; };
  function pendingPhaseDelta(state, cid, key) {
    const x = pendingBudgetChange(state, cid); if (!x) return 0;
    return (x.allocations || []).filter(a => a.phase_id === key).reduce((s, a) => s + sign(x) * Number(a.amount || 0), 0);
  }
  /* the approved Campaign budget not given to a Phase (null without a budget) */
  function unallocatedOf(state, cid) {
    const c = campaignOf(state, cid); if (!c || isBlank(c.budget_kol)) return null;
    return round2(Number(c.budget_kol) - approvedPhases(state, cid).reduce((a, p) => a + (Number(p.budget_kol) || 0), 0));
  }

  /* ---------- the first budget (initial) ---------- */
  /* the Phase budgets, the rest Unallocated (left out when it is 0) */
  function initialAllocations(state, cid, budget) {
    const ps = (state.phases || []).filter(p => p.campaign_id === cid && !isBlank(p.budget_kol)).map(p => ({ phase_id: p.phase_id, amount: Number(p.budget_kol) }));
    const rest = round2(Number(budget) - ps.reduce((a, x) => a + x.amount, 0));
    return rest ? ps.concat([{ phase_id: UNALLOCATED, amount: rest }]) : ps;
  }
  /* a Campaign made (or still waiting) keeps one initial row that follows it: its budget and Phase budgets · its approval status
     (Approve / Reject / Resubmit). An approved Campaign's initial is history and is left alone. → the row (or null without a budget) */
  function syncInitial(state, cid, userId, now) {
    const c = campaignOf(state, cid); if (!c) return null;
    const list = changes(state), at = list.findIndex(x => x.campaign_id === cid && x.type === 'initial');
    let rec = at >= 0 ? list[at] : null;
    if (rec && rec.status === 'approved' && rec.decided_at && R.isApproved(c) && rec.locked) return rec;
    const budget = isBlank(c.budget_kol) ? null : Number(c.budget_kol);
    if (budget == null) { if (rec && rec.status !== 'approved') list.splice(at, 1); return rec && rec.status === 'approved' ? rec : null; }
    const st = c.approval_status === 'draft' ? 'draft' : R.isApproved(c) ? 'approved' : 'pending', a = c.approval || {};
    if (!rec) { rec = { change_id: nextChangeId(list), campaign_id: cid, type: 'initial', requested_by: a.submitted_by || userId || null, requested_at: a.submitted_at || now || null }; list.push(rec); }
    Object.assign(rec, { amount: budget, allocations: initialAllocations(state, cid, budget), reason: rec.reason || null, note: rec.note || null, status: st,
      decided_by: st === 'approved' ? a.decided_by || userId || null : null, decided_at: st === 'approved' ? a.decided_at || now || null : null,
      reject_reason: null, budget_before: null, budget_after: st === 'approved' ? budget : null });
    if (st === 'approved') rec.locked = true;
    return rec;
  }

  /* ---------- Adjust budget (§4.3) ---------- */
  /* d = { type 'increase' | 'decrease', amount, allocations [{ phase_id | 'unallocated', amount }], reason, note } →
     { errs, warns, infos, amount, allocated, newBudget, rows [{ key, now, change, after, committed }] } */
  function validateBudgetChange(state, cid, d, idxIn) {
    const errs = [], c = campaignOf(state, cid), dec = d.type === 'decrease', sgn = dec ? -1 : 1;
    if (!c) return { errs: [issue('campaign', B.noCampaign)], warns: [], infos: [], rows: [] };
    if (!R.isApproved(c)) errs.push(issue('campaign', B.notApproved));
    const waiting = pendingBudgetChange(state, cid); if (waiting) errs.push(issue('pending', B.onePending(1), 'pending'));
    const amount = money(d.amount);
    if (amount == null) errs.push(issue('amount', isBlank(d.amount) ? B.amountRequired : B.amountInvalid));
    else if (amount <= 0) errs.push(issue('amount', B.amountRequired));
    const idx = idxIn || R.phaseIndex(state), budget = Number(c.budget_kol) || 0;
    const allocs = (d.allocations || []).map(a => ({ key: a.phase_id, amount: money(a.amount) }));
    allocs.forEach(a => { if (a.amount != null && a.amount < 0) errs.push(issue('alloc_' + a.key, B.amountInvalid)); });
    const allocated = round2(allocs.reduce((s, a) => s + (a.amount > 0 ? a.amount : 0), 0));
    if (amount > 0 && allocated !== round2(amount)) errs.push(issue('allocations', B.allocatedOf(R.baht(allocated), R.baht(amount)), 'alloc'));
    const newBudget = round2(budget + sgn * (amount > 0 ? amount : 0)), committed = round2((idx.campaign.get(cid) || {}).committed || 0);
    if (dec && amount > 0 && newBudget < committed) errs.push(issue('amount', B.belowCommitted(R.baht(committed))));
    const un = unallocatedOf(state, cid) || 0;
    const rows = approvedPhases(state, cid).map(p => ({ key: p.phase_id, now: isBlank(p.budget_kol) ? null : Number(p.budget_kol), committed: round2((idx.phase.get(p.phase_id) || {}).committed || 0) }))
      .concat([{ key: UNALLOCATED, now: un, committed: 0 }])
      .map(r => { const a = allocs.find(x => x.key === r.key), ch = a && a.amount > 0 ? a.amount : 0; return Object.assign(r, { change: ch, after: round2((r.now || 0) + sgn * ch) }); });
    if (dec) rows.forEach(r => {
      if (!r.change) return;
      if (r.key === UNALLOCATED) { if (r.change > Math.max(0, un)) errs.push(issue('alloc_' + r.key, B.onlyUnallocated(R.baht(Math.max(0, un))))); }
      else if (r.after < r.committed) errs.push(issue('alloc_' + r.key, B.belowCommitted(R.baht(r.committed))));
    });
    if (!trim(d.reason)) errs.push(issue('reason', B.reasonRequired));
    else if (R.looksSensitive(d.reason)) errs.push(issue('reason', C.msg.sensitive));
    if (trim(d.note) && R.looksSensitive(d.note)) errs.push(issue('note', C.msg.sensitive));
    return { errs, warns: [], infos: [], amount, allocated, newBudget, budget, committed, rows, waiting };
  }
  /* Split by current %: the amount over the Phases by their budgets now (whole baht, the last one takes the rest) · no Phase budget → Unallocated */
  function splitByCurrent(state, cid, amount) {
    const a = Math.round(money(amount) || 0), ps = approvedPhases(state, cid).filter(p => Number(p.budget_kol) > 0);
    if (!a) return [];
    if (!ps.length) return [{ phase_id: UNALLOCATED, amount: a }];
    const tot = ps.reduce((s, p) => s + Number(p.budget_kol), 0), out = ps.map(p => ({ phase_id: p.phase_id, amount: Math.floor(a * Number(p.budget_kol) / tot) }));
    out[out.length - 1].amount += a - out.reduce((s, x) => s + x.amount, 0);
    return out.filter(x => x.amount > 0);
  }
  /* the change on the Campaign and its Phases (Unallocated stays at the Campaign) */
  function applyBudgetChange(state, rec) {
    const c = campaignOf(state, rec.campaign_id); if (!c) return;
    const sgn = sign(rec);
    rec.budget_before = isBlank(c.budget_kol) ? null : Number(c.budget_kol);
    c.budget_kol = round2((Number(c.budget_kol) || 0) + sgn * Number(rec.amount || 0));
    (rec.allocations || []).forEach(a => { if (a.phase_id === UNALLOCATED) return; const p = phaseOf(state, a.phase_id); if (p) p.budget_kol = round2((Number(p.budget_kol) || 0) + sgn * Number(a.amount || 0)); });
    rec.budget_after = c.budget_kol;
  }
  /* the row of an Adjust budget (a draft until requestTransition moves it) · d = { type, amount, allocations, reason, note } */
  const fieldsOf = d => ({ type: d.type === 'decrease' ? 'decrease' : 'increase', amount: round2(money(d.amount) || 0),
    allocations: (d.allocations || []).map(a => ({ phase_id: a.phase_id, amount: round2(money(a.amount) || 0) })).filter(a => a.amount > 0), reason: trim(d.reason), note: trim(d.note) || null });
  /* Save draft · Submit (Staff → pending) · Apply (Admin · KOL Manager → approved at once) · o.draft = Save draft · o.changeId = the draft it continues ·
     me = the user · ctx = { eventId(), now, user } → { rec, events, err } */
  function submitBudgetChange(state, cid, d, me, ctx, o = {}) {
    const c = campaignOf(state, cid);
    let rec = o.changeId ? changes(state).find(x => x.change_id === o.changeId && x.campaign_id === cid) : null;
    const events = [];
    if (rec && rec.status === 'pending') { const w = R.requestTransition(state, 'budget:' + rec.change_id, 'draft', ctx, { withdraw: true }); events.push(...w.events); }
    if (!rec || rec.status !== 'draft') {
      rec = { change_id: nextChangeId(changes(state)), campaign_id: cid, status: 'draft', budget_before: null, budget_after: null, requested_by: me.user_id, requested_at: ctx.now,
        decided_by: null, decided_at: null, reject_reason: null, submit_round: 0, returned_reason: null, returned_by: null, returned_at: null, last_submitted: null };
      changes(state).push(rec);
    }
    Object.assign(rec, fieldsOf(d), { budget_before: isBlank(c.budget_kol) ? null : Number(c.budget_kol) });
    const to = o.draft ? 'draft' : R.canApprove(me) ? 'approved' : 'pending';
    const r = R.requestTransition(state, 'budget:' + rec.change_id, to, ctx, { direct: to === 'approved', note: rec.note });
    events.push(...r.events);
    return { rec, events, err: r.err };
  }
  const approveBudgetChange = (state, changeId, ctx) => R.requestTransition(state, 'budget:' + changeId, 'approved', ctx).events;
  const cancelBudgetChange = (state, changeId, ctx) => R.requestTransition(state, 'budget:' + changeId, 'cancelled', ctx).events;
  /* the draft of one person on a Campaign (the one Adjust budget opens again) */
  const budgetDraftOf = (state, cid, userId) => changes(state).filter(x => x.campaign_id === cid && x.status === 'draft' && x.type !== 'initial' && x.requested_by === userId).pop() || null;
  /* Used % before → after a change (the card of a budget request) */
  function budgetChangeImpact(state, rec, idxIn) {
    const c = campaignOf(state, rec.campaign_id) || {}, idx = idxIn || R.phaseIndex(state), committed = round2((idx.campaign.get(rec.campaign_id) || {}).committed || 0);
    const before = isBlank(c.budget_kol) ? null : Number(c.budget_kol), after = round2((before || 0) + sign(rec) * Number(rec.amount || 0));
    return { before, after, delta: sign(rec) * Number(rec.amount || 0), committed, usedBefore: before ? committed / before * 100 : null, usedAfter: after ? committed / after * 100 : null };
  }
  /* Budget history (the Campaign drawer): date · type · ฿ · budget after · Phases · asked by · decided by · status · reason (oldest first · CR-21: no drafts) */
  function budgetHistory(state, cid) {
    let run = 0;
    return budgetChangesOf(state, cid).filter(x => x.status !== 'draft').map(x => {
      const signed = x.type === 'initial' ? null : sign(x) * Number(x.amount || 0);
      let after = null;
      if (x.status === 'approved') { run = x.type === 'initial' ? Number(x.amount || 0) : round2(run + signed); after = run; }
      else if (x.status === 'pending') after = x.type === 'initial' ? Number(x.amount || 0) : round2(run + signed);
      return { change_id: x.change_id, date: x.decided_at && x.status === 'approved' ? x.decided_at : x.requested_at, type: x.type, amount: Number(x.amount || 0), signed, after,
        allocations: x.allocations || [], requested_by: x.requested_by, decided_by: x.decided_by, status: x.status, reason: x.reason || null, reject_reason: x.reject_reason || null, note: x.note || null };
    });
  }
  /* a draft Campaign deleted: its budget rows go with it */
  function dropBudgetChanges(state, cid) { state.campaign_budget_changes = changes(state).filter(x => x.campaign_id !== cid); }

  /* ---------- §4.2 — the Phase table: Budget % ↔ Amount ---------- */
  /* a row keeps what was typed last (basis 'amount' | 'percent') and the other follows the Campaign budget · the money is what is saved
     (% → ฿ in whole baht · ฿ → % to two decimals) · no Campaign budget → no % (the amount stays) */
  function budgetRow(row, budget) {
    const b = money(budget), a = money(row.amount), p = money(row.pct);
    if (b == null || !b) return { amount: a, pct: null };
    if (row.basis === 'percent') return { amount: p == null ? null : Math.round(b * p / 100), pct: p };
    return { amount: a, pct: a == null ? null : round2(a / b * 100) };
  }
  /* rows [{ amount, pct, basis }] + the Campaign budget → { rows [{ amount, pct }], budget, allocated, diff, pct, state 'even' | 'under' | 'over' | 'nobudget' } */
  function phaseBudgetSync(budget, rows) {
    const b = money(budget), out = (rows || []).map(r => budgetRow(r, b)), allocated = round2(out.reduce((s, r) => s + (r.amount || 0), 0));
    const diff = b == null ? null : round2(b - allocated);
    return { rows: out, budget: b, allocated, diff, pct: b ? round2(allocated / b * 100) : null, state: b == null ? 'nobudget' : diff === 0 ? 'even' : diff > 0 ? 'under' : 'over' };
  }
  /* Fill remaining: row i gets what the others leave of the budget (never below 0) */
  const fillRemainingAmount = (amounts, i, budget) => { const b = money(budget) || 0, rest = amounts.reduce((s, x, k) => s + (k === i ? 0 : money(x) || 0), 0); return amounts.map((v, k) => (k === i ? Math.max(0, Math.round(b - rest)) : v)); };

  /* ---------- schema 17 ---------- */
  /* every Campaign with a budget gets its initial row (approved · by "system") · the numbers do not change · twice → the same */
  function migrateV17(obj, now) {
    if (!Array.isArray(obj.campaign_budget_changes)) obj.campaign_budget_changes = [];
    const list = obj.campaign_budget_changes, at = now || new Date().toISOString();
    (obj.campaigns || []).forEach(c => {
      if (isBlank(c.budget_kol) || list.some(x => x.campaign_id === c.campaign_id && x.type === 'initial')) return;
      const st = c.approval_status === 'rejected' ? 'rejected' : !c.approval_status || c.approval_status === 'approved' ? 'approved' : 'pending';   // (CR-21: migrateV20 reads rejected)
      list.push({ change_id: nextChangeId(list), campaign_id: c.campaign_id, type: 'initial', amount: Number(c.budget_kol), allocations: initialAllocations(obj, c.campaign_id, c.budget_kol),
        reason: null, note: null, status: st, budget_before: null, budget_after: st === 'approved' ? Number(c.budget_kol) : null,
        requested_by: 'system', requested_at: at, decided_by: st === 'approved' ? 'system' : null, decided_at: st === 'approved' ? at : null, reject_reason: null, locked: st === 'approved' });
    });
    obj.schema_version = Math.max(obj.schema_version || 0, 17);
    return obj;
  }

  return { BUDGET_TYPES, BUDGET_STATUSES, UNALLOCATED, money, budgetChangesOf, pendingBudgetChange, pendingBudgetChanges, pendingDelta, pendingPhaseDelta, unallocatedOf,
    initialAllocations, syncInitial, validateBudgetChange, splitByCurrent, applyBudgetChange, submitBudgetChange, approveBudgetChange, cancelBudgetChange, budgetDraftOf,
    budgetChangeImpact, budgetHistory, dropBudgetChanges, budgetRow, phaseBudgetSync, fillRemainingAmount, migrateV17 };
})(KT.rules, KT.content));
