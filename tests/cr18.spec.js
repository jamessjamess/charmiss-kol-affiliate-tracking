/* cr18.spec.js — CR-18 test cases (Phase Planner Budget % ↔ Amount · Adjust budget with approval · Budget history · schema 17) and the CR-17 v1.2
   rules (one card a request · the Status order · Undo of a decision), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate v17 ·
   test data is made up. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const user = (s, name) => s.users.find(u => u.display_name === name);
  const babe = s => user(s, 'Babe'), km = s => Object.assign({}, user(s, 'Admin'), { role: 'kol_manager', user_id: 'U900' });
  const camp = (s, id) => s.campaigns.find(c => c.campaign_id === id);
  const phase = (s, id) => s.phases.find(p => p.phase_id === id);
  const ctxOf = (s, who) => { let e = 0; const base = (s.campaign_events || []).length + 5000; return { eventId: () => base + e++, now: NOW, user: who || 'U003' }; };
  const used = (s, cid) => { const x = R.campaignSummary(s, cid); return Math.round(x.committed / x.budget * 100); };
  const kpis = s => R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
  const inc = (amount, allocations, reason) => ({ type: 'increase', amount, allocations, reason: reason || 'Sales are strong' });
  /* CR-21: a new record is a draft of its maker until R.requestTransition sends it (Staff) / makes it (a manager) */
  const addSent = (s, coll, rec, who, now, note) => { R.stampDraft(rec, who, now); s[coll].push(rec);
    const id = coll === 'campaigns' ? 'campaign:' + rec.campaign_id : 'phase:' + rec.phase_id, ctx = Object.assign(ctxOf(s, who.user_id), { now });
    s.campaign_events.push(...R.requestTransition(s, id, R.canApprove(who) ? 'approved' : 'pending', ctx, { direct: true, note }).events); return rec; };

  describe('CR-18 §3 · schema 17', () => {
    test('TC-01: a schema 16 file → 17 · one approved Initial row a Campaign (4) by "system" · every budget the same', () => {
      const s = fresh();
      assert.ok(s.schema_version >= 17);   // (CR-19 goes on to 18)
      const init = s.campaign_budget_changes.filter(x => x.type === 'initial');
      assert.deepEqual(init.map(x => [x.campaign_id, x.amount, x.status, x.requested_by]), [['CH', 850000, 'approved', 'system'], ['KS', 600000, 'approved', 'system'], ['AC', 400000, 'approved', 'system'], ['PH', 898400, 'approved', 'system']]);
      assert.deepEqual(init.find(x => x.campaign_id === 'KS').allocations, [{ phase_id: 'KS-P1', amount: 550000 }, { phase_id: 'KS-P2', amount: 50000 }]);
      assert.ok(!init.find(x => x.campaign_id === 'PH').allocations.some(a => a.phase_id === 'PH-P3'), 'PH Phase 3 has no budget · PH has nothing unallocated (898,400 = its Phases)');
      assert.deepEqual([camp(s, 'KS').budget_kol, used(s, 'KS'), kpis(s).money.budget], [600000, 57, 2748400]);
      const v16 = JSON.parse(JSON.stringify(s)); v16.schema_version = 16; delete v16.campaign_budget_changes;
      const m = S.migrate(v16, new Date(NOW)); assert.equal(m.schema_version, S.SCHEMA_VERSION); assert.equal(m.campaign_budget_changes.length, 4);
      const once = JSON.stringify(m); R.migrateV17(m, NOW); assert.equal(JSON.stringify(m), once, 'runs twice → the same');
      assert.deepEqual(R.budgetHistory(s, 'KS').map(r => [r.type, r.amount, r.after, r.status]), [['initial', 600000, 600000, 'approved']]);
    });
    test('a campaign with more in its Phases than its budget keeps the minus as Unallocated (made-up)', () => {
      const s = fresh(); s.campaigns.push({ campaign_id: 'XX', campaign_name: 'X', budget_kol: 100 }); s.phases.push({ phase_id: 'XX-1', campaign_id: 'XX', budget_kol: 150, start_date: '2026-11-01', end_date: '2026-11-02' });
      assert.deepEqual(R.initialAllocations(s, 'XX', 100), [{ phase_id: 'XX-1', amount: 150 }, { phase_id: 'unallocated', amount: -50 }]);
    });
  });

  describe('CR-18 §4.2 · Budget % ↔ Amount', () => {
    test('TC-03 / TC-04: ฿1,000,000 · Amount 100,000 → 10.00% · Budget % 25 → ฿250,000', () => {
      assert.deepEqual(R.budgetRow({ amount: '100,000', basis: 'amount' }, '1,000,000'), { amount: 100000, pct: 10 });
      assert.deepEqual(R.budgetRow({ pct: '25', basis: 'percent' }, 1000000), { amount: 250000, pct: 25 });
      assert.deepEqual(R.budgetRow({ pct: '33.333', basis: 'percent' }, 1000000).amount, 333330, 'whole baht');
    });
    test('TC-05 / TC-06: short → under (red) · over → over (red) · equal → even', () => {
      const rows = [{ amount: 100000, basis: 'amount' }, { pct: 25, basis: 'percent' }];
      assert.deepEqual((x => [x.state, x.allocated, x.diff])(R.phaseBudgetSync(1000000, rows)), ['under', 350000, 650000]);
      assert.deepEqual((x => [x.state, x.diff])(R.phaseBudgetSync(1000000, rows.concat([{ amount: 750000, basis: 'amount' }]))), ['over', -100000]);
      assert.equal(R.phaseBudgetSync(350000, rows.slice(0, 1).concat([{ amount: 250000, basis: 'amount' }])).state, 'even');
      const v = R.validatePhasePlan(fresh(), { campaign_id: null, campaign_name: 'New', budget_kol: 1000000 }, [
        { key: 'a', start_date: '2026-11-01', end_date: '2026-11-10', budget_kol: 100000 }, { key: 'b', start_date: '2026-11-11', end_date: '2026-11-20', budget_kol: 250000 }], []);
      assert.deepEqual(v.warns.map(w => [w.kind, w.red, w.msg]), [['under', true, C.planner.barUnder('฿650,000', '฿350,000', '฿1,000,000')]]);
      assert.equal(C.planner.barUnder('฿650,000', '฿350,000', '฿1,000,000'), 'Unallocated ฿650,000 · phases total ฿350,000 of ฿1,000,000');
      assert.equal(C.planner.mismatchBody('Unallocated ฿650,000'), "Phase budgets don't match the campaign budget (Unallocated ฿650,000). Save anyway?");
    });
    test('TC-07: the budget goes ฿1,000,000 → ฿2,000,000 · Phase 1 (Amount) stays ฿100,000 → 5.00% · Phase 2 (%) stays 25% → ฿500,000', () => {
      const rows = [{ amount: 100000, pct: 10, basis: 'amount' }, { amount: 250000, pct: 25, basis: 'percent' }];
      assert.deepEqual(R.phaseBudgetSync(2000000, rows).rows, [{ amount: 100000, pct: 5 }, { amount: 500000, pct: 25 }]);
    });
    test('TC-08: no Campaign budget → no % · the amount stays · "No campaign budget yet" (in English)', () => {
      const x = R.phaseBudgetSync('', [{ amount: 50000, pct: 10, basis: 'percent' }]);
      assert.deepEqual([x.state, x.rows[0].pct, x.rows[0].amount], ['nobudget', null, 50000]);
      assert.equal(C.planner.barNoBudget, "No campaign budget yet — percentages can't be calculated");
      assert.equal(C.msg.planPctNoBudget, C.planner.barNoBudget, 'the old Thai line is English now');
    });
    test('TC-09: Even ฿1,000,000 · 3 phases → 333,333 · 333,333 · 333,334 · Fill remaining', () => {
      assert.deepEqual(R.evenAmounts(1000000, 3), [333333, 333333, 333334]);
      assert.deepEqual(R.fillRemainingAmount(['100,000', 250000, ''], 2, 1000000), ['100,000', 250000, 650000]);
      assert.deepEqual(R.fillRemainingAmount([900000, 200000, ''], 2, 1000000)[2], 0, 'never below 0');
    });
  });

  describe('CR-18 §4.3 · Adjust budget', () => {
    test('TC-10 / TC-11 / TC-12: Staff asks Kiss Signal +฿100,000 into Phase 2 · ฿600,000 everywhere (Used 57%) until approved · 80,000 of 100,000 is not enough', () => {
      const s = fresh(), b = babe(s);
      const short = R.validateBudgetChange(s, 'KS', inc(100000, [{ phase_id: 'KS-P2', amount: '80,000' }]));
      assert.ok(short.errs.some(e => e.kind === 'alloc' && e.msg === C.budget.allocatedOf('฿80,000', '฿100,000')));
      assert.equal(C.budget.allocatedOf('฿80,000', '฿100,000'), 'Allocated ฿80,000 of ฿100,000');
      const d = inc(100000, [{ phase_id: 'KS-P2', amount: 100000 }]);
      assert.deepEqual(R.validateBudgetChange(s, 'KS', d).errs, []);
      const r = R.submitBudgetChange(s, 'KS', d, b, ctxOf(s, b.user_id));
      assert.deepEqual([r.rec.status, r.rec.change_id, r.events[0].to, r.events[0].change_id], ['pending', 'BG-0005', 'submitted', 'BG-0005']);
      assert.deepEqual([camp(s, 'KS').budget_kol, phase(s, 'KS-P2').budget_kol, used(s, 'KS'), R.pendingDelta(s, 'KS'), R.pendingPhaseDelta(s, 'KS', 'KS-P2')], [600000, 50000, 57, 100000, 100000]);
      const im = R.budgetChangeImpact(s, r.rec);
      assert.deepEqual([im.before, im.after, Math.round(im.usedBefore), Math.round(im.usedAfter)], [600000, 700000, 57, 49]);
      assert.deepEqual(R.approvalRequests(s).map(x => [x.type, x.campaign_id, x.by]), [['budget_increase', 'KS', b.user_id]]);
    });
    test('TC-13: Approve → ฿700,000 · Phase 2 ฿150,000 · Used 49% · Budget history 2 rows · the Dashboard budget too', () => {
      const s = fresh(), b = babe(s), r = R.submitBudgetChange(s, 'KS', inc(100000, [{ phase_id: 'KS-P2', amount: 100000 }]), b, ctxOf(s, b.user_id));
      const ev = R.approveRequest(s, R.approvalRequests(s)[0], ctxOf(s, 'U003'));
      assert.deepEqual([ev[0].to, ev[0].from, ev[0].requested_by, r.rec.status, r.rec.budget_before, r.rec.budget_after], ['approved', 'pending', b.user_id, 'approved', 600000, 700000]);
      assert.deepEqual([camp(s, 'KS').budget_kol, phase(s, 'KS-P2').budget_kol, used(s, 'KS'), kpis(s).money.budget], [700000, 150000, 49, 2848400]);
      assert.deepEqual(R.budgetHistory(s, 'KS').map(x => [x.type, x.signed, x.after, x.status]), [['initial', null, 600000, 'approved'], ['increase', 100000, 700000, 'approved']]);
      assert.equal(R.approvalCount(s), 0);
    });
    test('TC-14: Decrease Charming below committed ฿863,700 → "Can\'t go below committed ฿863,700" · a Phase below its committed too', () => {
      const s = fresh();
      const v = R.validateBudgetChange(s, 'CH', { type: 'decrease', amount: 10000, allocations: [{ phase_id: 'unallocated', amount: 10000 }], reason: 'x' });
      assert.ok(v.errs.some(e => e.msg === C.budget.belowCommitted('฿863,700')));
      assert.equal(C.budget.belowCommitted('฿863,700'), "Can't go below committed ฿863,700");
      const k = R.validateBudgetChange(s, 'KS', { type: 'decrease', amount: 50000, allocations: [{ phase_id: 'KS-P2', amount: 50000 }], reason: 'x' });
      assert.ok(k.errs.some(e => e.field === 'alloc_KS-P2'), 'KS Phase 2 has more committed than ฿0');
      assert.ok(R.validateBudgetChange(s, 'KS', { type: 'decrease', amount: 1000, allocations: [{ phase_id: 'unallocated', amount: 1000 }], reason: 'x' }).errs.some(e => e.field === 'alloc_unallocated'), 'nothing unallocated to take');
    });
    test('TC-15 (CR-21): Return to draft (reason "รอ Q4") → the budget stays · the one who asked sees why (My requests › Drafts · Decided)', () => {
      const s = fresh(), b = babe(s), r = R.submitBudgetChange(s, 'KS', inc(100000, [{ phase_id: 'KS-P2', amount: 100000 }]), b, ctxOf(s, b.user_id));
      s.campaign_events.push(...r.events);
      assert.equal(R.returnRequest(s, R.approvalRequests(s)[0], ' ', ctxOf(s)), null, 'a reason is needed');
      s.campaign_events.push(...R.returnRequest(s, R.approvalRequests(s)[0], 'รอ Q4', ctxOf(s)));
      assert.deepEqual([camp(s, 'KS').budget_kol, r.rec.status, r.rec.returned_reason], [600000, 'draft', 'รอ Q4']);
      assert.deepEqual(R.requestsFor(s, b, { state: 'decided' }).map(x => [x.type, x.result, x.reason]), [['budget_increase', 'returned', 'รอ Q4']]);
      assert.deepEqual(R.requestsFor(s, b, { state: 'drafts' }).map(x => [x.id, x.returned.reason]), [['budget:' + r.rec.change_id, 'รอ Q4']]);
      assert.ok(!R.budgetHistory(s, 'KS').some(x => x.change_id === r.rec.change_id), 'a draft is not in the Budget history');
    });
    test('TC-16: a KOL Manager adjusts → applied at once · the history says who approved (themself) · not a request', () => {
      const s = fresh(), k = km(s), r = R.submitBudgetChange(s, 'AC', inc(50000, [{ phase_id: 'unallocated', amount: 50000 }], 'top up'), k, ctxOf(s, k.user_id));
      assert.deepEqual([r.rec.status, r.rec.decided_by, camp(s, 'AC').budget_kol, R.approvalCount(s)], ['approved', 'U900', 450000, 0]);
      s.campaign_events.push(...r.events);
      assert.equal(R.decidedRequests(s).length, 0, 'applied at once — not a card in Decided');
    });
    test('TC-17: one request at a time · Cancel request', () => {
      const s = fresh(), b = babe(s), r = R.submitBudgetChange(s, 'KS', inc(100000, [{ phase_id: 'KS-P2', amount: 100000 }]), b, ctxOf(s, b.user_id));
      const v = R.validateBudgetChange(s, 'KS', inc(5000, [{ phase_id: 'unallocated', amount: 5000 }]));
      assert.ok(v.errs.some(e => e.kind === 'pending' && e.msg === '1 request pending'));
      assert.equal(R.cancelBudgetChange(s, r.rec.change_id, ctxOf(s))[0].to, 'change_cancelled');
      assert.deepEqual([r.rec.status, R.pendingBudgetChange(s, 'KS'), R.validateBudgetChange(s, 'KS', inc(5000, [{ phase_id: 'unallocated', amount: 5000 }])).errs], ['cancelled', null, []]);
    });
    test('TC-18: an increase all in Unallocated → the Phases keep their budgets · Unallocated ฿x at the Campaign', () => {
      const s = fresh(), b = babe(s);
      R.submitBudgetChange(s, 'KS', inc(80000, [{ phase_id: 'unallocated', amount: 80000 }]), b, ctxOf(s, b.user_id));
      R.approveRequest(s, R.approvalRequests(s)[0], ctxOf(s));
      assert.deepEqual([camp(s, 'KS').budget_kol, phase(s, 'KS-P1').budget_kol, phase(s, 'KS-P2').budget_kol, R.unallocatedOf(s, 'KS')], [680000, 550000, 50000, 80000]);
    });
    test('Split by current %: 100,000 over 550,000 / 50,000 · no Phase budget → Unallocated', () => {
      const s = fresh();
      assert.deepEqual(R.splitByCurrent(s, 'KS', '100,000'), [{ phase_id: 'KS-P1', amount: 91666 }, { phase_id: 'KS-P2', amount: 8334 }]);
      s.campaigns.push({ campaign_id: 'NB', campaign_name: 'No budget', budget_kol: null, approval_status: 'approved' });
      assert.deepEqual(R.splitByCurrent(s, 'NB', 1000), [{ phase_id: 'unallocated', amount: 1000 }]);
    });
    test('a new Campaign by Staff: its first budget waits with it · approved → approved (and stays)', () => {
      const s = fresh(), b = babe(s), c = { campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 300000 };
      addSent(s, 'campaigns', c, b, NOW, 'Please check the period');
      assert.equal(c.approval.note, 'Please check the period');
      const init = R.syncInitial(s, 'TA', b.user_id, NOW);
      assert.deepEqual([init.status, init.amount, init.allocations], ['pending', 300000, [{ phase_id: 'unallocated', amount: 300000 }]]);
      assert.deepEqual(R.approvalRequests(s).map(x => [x.type, x.note]), [['new_campaign', 'Please check the period']], 'the initial row is part of the New campaign card');
      R.approveRequest(s, R.approvalRequests(s)[0], ctxOf(s));
      assert.deepEqual([c.approval_status, init.status, init.decided_by], ['approved', 'approved', 'U003']);
    });
  });

  describe('CR-17 v1.2 · one card a request · the Status order', () => {
    test('the order (CR-21): Cancelled > Draft > Pending approval > On hold > the dates · the tabs in that order (no Draft tab)', () => {
      assert.deepEqual(R.CAMPAIGN_STATUSES, ['ongoing', 'not_started', 'pending', 'on_hold', 'complete', 'cancelled']);
      const ph = [{ start_date: '2026-10-01', end_date: '2026-10-31', approval_status: 'approved' }];
      const st = c => R.campaignEffectiveStatus(Object.assign({ campaign_id: 'x' }, c), ph, TD);
      assert.deepEqual([st({}), st({ approval_status: 'pending' }), st({ approval_status: 'pending', status_override: 'on_hold' }), st({ approval_status: 'draft', status_override: 'on_hold' }), st({ approval_status: 'draft', status_override: 'cancelled' })],
        ['ongoing', 'pending', 'pending', 'draft', 'cancelled']);
      assert.equal(R.phaseStatus({ approval_status: 'draft', start_date: '2026-10-01' }, TD), 'draft');
      assert.ok(!R.DASH_STATUS_DEFAULT.includes('draft'));
    });
    test('TC-20a: "Test Approve" 01/10–31/10 waits → Pending approval (not On going) · Started 7 days ago', () => {
      const s = fresh(), p = R.stampDraft({ phase_id: 'TA-P1', campaign_id: 'TA', start_date: '2026-10-01', end_date: '2026-10-31' }, babe(s), NOW); s.phases.push(p);
      const c = addSent(s, 'campaigns', { campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 1000 }, babe(s), NOW);
      assert.equal(R.campaignEffectiveStatus(c, s.phases.filter(x => x.campaign_id === 'TA'), TD), 'pending');
      assert.deepEqual(R.startTiming('2026-10-01', TD), { kind: 'ago', days: 7 });
      assert.equal(C.approval.startedAgo(7), 'Started 7 days ago');
      assert.deepEqual([R.startTiming('2026-11-01', TD), R.startTiming(TD, TD).kind], [{ kind: 'in', days: 24 }, 'today']);
    });
    test('TC-20 / TC-20b: one card a request, oldest first · a manager sees all · Staff only their own (My requests)', () => {
      const s = fresh(), b = babe(s), amp = user(s, 'Amp');
      addSent(s, 'campaigns', { campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 300000 }, b, '2026-10-06T03:00:00Z');
      addSent(s, 'phases', { phase_id: 'PH-NOV', campaign_id: 'PH', start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 10000 }, amp, '2026-10-07T03:00:00Z');
      R.requestChange(phase(s, 'KS-P2'), { end_date: '2026-11-15' }, b, NOW, 'one more fortnight');
      s.campaign_events.push(...R.requestTransition(s, 'change:KS-P2', 'pending', ctxOf(s, b.user_id)).events);
      assert.deepEqual(R.approvalRequests(s).map(x => [x.type, x.campaign_id, x.phase_id]), [['new_campaign', 'TA', null], ['new_phase', 'PH', 'PH-NOV'], ['change', 'KS', 'KS-P2']]);
      assert.equal(R.approvalCount(s), 3);
      assert.deepEqual(R.requestsFor(s, b, { state: 'pending' }).map(x => x.id), ['campaign:TA', 'change:KS-P2']);
      assert.deepEqual(R.requestsFor(s, km(s), { state: 'pending', type: 'new_phase' }).map(x => x.id), ['phase:PH-NOV']);
      assert.equal(R.requestById(s, 'change:KS-P2').note, 'one more fortnight');
      assert.deepEqual(R.newPhaseCheck(s, 'PH-NOV').overlaps, [], 'no overlap with the approved Phases');
      assert.equal(R.changeImpact(s, R.requestById(s, 'change:KS-P2')).moved, 0);
    });
    test('TC-20c / TC-22: each card is decided on its own · approving the New campaign leaves the others · Undo puts everything back', () => {
      const s = fresh(), b = babe(s);
      const c = addSent(s, 'campaigns', { campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 300000 }, b, NOW);
      R.requestChange(camp(s, 'KS'), { pillar_target: { awareness: 20, consideration: 30, conversion: 50 } }, b, NOW);
      s.campaign_events.push(...R.requestTransition(s, 'change:KS', 'pending', ctxOf(s, b.user_id)).events);
      const before = JSON.stringify(s), snap = R.decisionSnapshot(s, 'TA');
      const evs = R.approveRequest(s, R.requestById(s, 'campaign:TA'), ctxOf(s)); s.campaign_events.push(...evs);
      assert.deepEqual([c.approval_status, R.approvalRequests(s).map(x => x.id)], ['approved', ['change:KS']]);
      assert.deepEqual(R.decidedRequests(s).map(x => [x.type, x.result, x.by]), [['new_campaign', 'approved', b.user_id]]);
      R.restoreSnapshot(s, snap, evs.map(e => e.event_id));
      assert.equal(JSON.stringify(s), before, 'Undo: the same data as before');
      const ch = R.returnRequest(s, R.requestById(s, 'change:KS'), 'not now', ctxOf(s));
      assert.deepEqual([ch[0].to, camp(s, 'KS').pending_change.status, camp(s, 'KS').pending_change.returned_reason, camp(s, 'TA').approval_status], ['returned', 'draft', 'not now', 'pending']);
    });
    test('New campaign card: the budget of the Campaigns running at the same time (approved, overlapping)', () => {
      const s = fresh(); s.phases.push(R.stampDraft({ phase_id: 'TA-P1', campaign_id: 'TA', start_date: '2026-10-20', end_date: '2026-11-30' }, babe(s), NOW));
      addSent(s, 'campaigns', { campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 300000 }, babe(s), NOW);
      const x = R.sameTimeBudget(s, 'TA');
      assert.deepEqual([x.before, x.after, x.count, x.list.map(k => k.campaign_id)], [2348400, 2648400, 3, ['CH', 'KS', 'PH']], 'CH 850,000 (to 24/10) · KS 600,000 · PH 898,400 (to 31/10) — not AC (ended 04/10)');
    });
    test('CR-18 §4.1: a new deal takes the KOL\'s term only (not the Campaign\'s)', () => {
      const s = fresh(); camp(s, 'AC').default_payment_term = 'full_after_post';
      const k0 = s.kol_master.find(k => !R.isTerm(k.default_payment_term));
      assert.deepEqual(R.termPrefill(s, k0, 'AC'), { term: '', source: null });
      assert.equal(camp(s, 'AC').default_payment_term, 'full_after_post', 'the Campaign keeps its value');
    });
  });
});
