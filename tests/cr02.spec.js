/* cr02.spec.js — CR-02 test cases (schema v2, content plan, payment term, Campaign & Phase status), run by tests/test.html.
   "today" is always 05/10/2026. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TODAY = '2026-10-05';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const opts = (extra) => Object.assign({ date: TODAY, note: '' }, extra || {});
  function fakeStorage() {
    const m = new Map();
    return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  }
  /* a state as v1 saved it: no plan / term fields, no deal_events */
  function asV1(state) {
    const o = JSON.parse(JSON.stringify(state));
    o.schema_version = 1;
    delete o.deal_events;
    o.deals.forEach(d => { delete d.draft_rounds; delete d.script_required; delete d.payment_term; });
    o.kol_master.forEach(k => { delete k.default_payment_term; });
    /* and without the v3 fields (CR-03): deals carry phase_id again */
    o.deals.forEach(d => { if (d.legacy_phase_id !== undefined) d.phase_id = d.legacy_phase_id; delete d.campaign_id; delete d.legacy_phase_id; });
    o.deal_posts.forEach(p => { delete p.phase_override; });
    o.campaigns.forEach(c => { delete c.budget_kol; delete c.pillar_target; });
    delete o.lookups.pillar_target_default;
    return o;
  }
  const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const allPhases = s => s.phases.map(p => p.phase_id);

  describe('CR-02 R1 · schema v2 and migration', () => {
    test('TC-01: seed loads with the v2 fields — draft rounds 237 / 68 / 0, no Script, no term, no events', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() }), s = st.state;
      assert.ok(s.schema_version >= 2);
      assert.deepEqual(countBy(s.deals, d => d.draft_rounds), { 1: 237, 2: 68 });
      assert.equal(deal(s, 'D000001').draft_rounds, 2);
      assert.equal(s.deals.filter(d => d.script_required).length, 0);
      assert.equal(s.deals.filter(d => d.script_required === false).length, 305);
      assert.equal(s.deals.filter(d => d.payment_term === null).length, 305);
      assert.equal(s.kol_master.filter(k => k.default_payment_term === null).length, 911);
      assert.deepEqual(s.deal_events, []);
      assert.equal(st.counts().deal_events, 0);
    });
    test('TC-01: anchors §5.0 after migration', () => {
      const s = fresh(), x = R.dealTiles(s, s.deals, allPhases(s), TODAY);
      assert.equal(s.deals.length, 305);
      assert.equal(x.count, 300);
      assert.equal(x.committed + x.shortlist, 1881579, 'Committed + Shortlist (CR-03 split)');
      assert.equal(x.budget, 2748400);
      assert.equal(x.paid, 774579);
      assert.equal(x.overdue, 11);
      assert.equal(x.unpaid, 130);
      const expected = { CH: 868800, KS: 348300, AC: 84500, PH: 579979 };
      for (const [id, v] of Object.entries(expected)) { const c = R.campaignSummary(s, id); assert.equal(c.committed + c.shortlist, v, id); }
    });
    test('migration rules: Draft 3 date → 3 rounds · Approve Script in the log → Script · paid_50 → 50/50 · KOL default → deal', () => {
      const v1 = asV1(fresh());
      deal(v1, 'D000044').expected_draft3_date = '2026-10-20';
      v1.deal_status_log.push({ log_id: 9001, deal_id: 'D000044', from_sub_status: 'Brief', status: 'Inprocess', sub_status: 'Approve Script' });
      deal(v1, 'D000302').paid_50 = true;
      const k = v1.kol_master.find(x => x.kol_id === deal(v1, 'D000296').kol_id); k.default_payment_term = 'postpaid';
      const s = S.migrate(v1);
      assert.equal(deal(s, 'D000044').draft_rounds, 3);
      assert.equal(deal(s, 'D000044').script_required, true);
      assert.equal(deal(s, 'D000302').payment_term, 'split_50');
      assert.equal(deal(s, 'D000296').payment_term, 'postpaid');
      assert.equal(k.default_payment_term, 'postpaid', 'a default already there is kept');
    });
    test('TC-02: v1 data in localStorage → migrated once, edits kept, saved as v2; reopening does not migrate again', () => {
      const ls = fakeStorage(), v1 = asV1(fresh());
      deal(v1, 'D000044').remark = 'แก้ไว้ก่อน migrate';
      v1.phases.find(p => p.phase_id === 'PH-P3').budget_kol = 99000;
      ls.setItem(S.KEY, JSON.stringify(v1));
      const a = S.createStore({ seed: SEED, storage: ls });
      assert.equal(a.status.source, 'local');
      assert.equal(a.status.migratedFrom, 1);
      assert.equal(a.state.schema_version, S.SCHEMA_VERSION);
      assert.equal(deal(a.state, 'D000044').remark, 'แก้ไว้ก่อน migrate');
      assert.equal(a.state.phases.find(p => p.phase_id === 'PH-P3').budget_kol, 99000);
      assert.equal(JSON.parse(ls.map.get(S.KEY)).schema_version, S.SCHEMA_VERSION, 'saved right away');
      a.state.deals.find(d => d.deal_id === 'D000044').draft_rounds = 2; a.save();
      const b = S.createStore({ seed: SEED, storage: ls });
      assert.equal(b.status.migratedFrom, null);
      assert.equal(deal(b.state, 'D000044').draft_rounds, 2, 'not recalculated on the second open');
      assert.equal(deal(b.state, 'D000044').remark, 'แก้ไว้ก่อน migrate');
    });
    test('TC-03: restoring a v1 backup migrates it; counts match; new backups are v2', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage(), now: () => new Date('2026-10-05T03:04:00Z') });
      const v1 = asV1(fresh());
      v1.campaigns.push({ campaign_id: 'NW', campaign_name: 'New One', note: '' });
      const text = JSON.stringify(v1);
      const prev = st.previewRestore(text);
      assert.equal(prev.ok, true, 'a v1 backup has no deal_events and is still accepted');
      assert.equal(prev.counts.campaigns, 5);
      assert.equal(prev.counts.deal_events, 0);
      const r = st.restore(text, 'old_v1.json');
      assert.equal(r.ok, true);
      assert.equal(r.migratedFrom, 1);
      assert.equal(st.state.schema_version, S.SCHEMA_VERSION);
      assert.deepEqual(st.counts(), { campaigns: 5, phases: 9, kol_master: 911, kol_accounts: 928, kol_rate_quotes: 524, deals: 305, deal_posts: 313, deal_status_log: 770, deal_events: 0, users: 9, campaign_events: 0, products: 0, campaign_products: 0, deal_products: 0, payee_profiles: 0, payment_lines: 0, payment_runs: 0, sample_shipments: 214, pick_lists: 0 });   // CR-10 §3: the v11 migration
      assert.deepEqual(countBy(st.state.deals, d => d.draft_rounds), { 1: 237, 2: 68 });
      assert.equal(JSON.parse(st.backup().text).schema_version, S.SCHEMA_VERSION);
    });
    test('a v2 backup without deal_events is refused', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      const o = JSON.parse(JSON.stringify(st.state)); delete o.deal_events;
      assert.ok(st.previewRestore(JSON.stringify(o)).errors.includes('missing:deal_events'));
    });
    test('event IDs continue from the highest number', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      assert.equal(st.newEventId(), 1);
      st.state.deal_events.push({ event_id: 7 });
      assert.equal(st.newEventId(), 8);
    });
  });

  describe('CR-02 R1 · content plan', () => {
    test('plan steps: 1 round = Brief · Draft 1 · Post; Script / Draft 2 only when planned', () => {
      const s = fresh(), names = d => R.planSteps(s.lookups, d).map(x => x.sub_status);
      assert.deepEqual(names(deal(s, 'D000296')), ['Shortlist', 'Contacted', 'Confirm QT', 'Brief', 'Approve Draft 1', 'Post']);
      assert.deepEqual(names(deal(s, 'D000001')), ['Shortlist', 'Contacted', 'Confirm QT', 'Brief', 'Approve Draft 1', 'Approve Draft 2', 'Post']);
      assert.deepEqual(names({ ...deal(s, 'D000044'), draft_rounds: 3, script_required: true }).slice(3),
        ['Brief', 'Approve Script', 'Approve Draft 1', 'Approve Draft 2', 'Approve Draft 3', 'Post']);
      assert.deepEqual(R.planOf({ draft_rounds: 9 }), { drafts: 1, script: false }, 'bad values fall back to 1 round');
    });
    test('next step after the last planned Draft is Post; with 2 rounds Draft 1 → Draft 2', () => {
      const s = fresh(), L = s.lookups;
      assert.equal(R.nextStep(L, { sub_status: 'Approve Draft 1', draft_rounds: 1 }).step.sub_status, 'Post');
      assert.equal(R.nextStep(L, { sub_status: 'Approve Draft 1', draft_rounds: 2 }).step.sub_status, 'Approve Draft 2');
      assert.equal(R.nextStep(L, { sub_status: 'Approve Draft 2', draft_rounds: 2 }).step.sub_status, 'Post');
      /* D000051 plans 2 rounds: due = expected Draft 2 date */
      const d = deal(s, 'D000051');
      assert.equal(R.dueDate(s, d), '2026-09-20');
      assert.equal(R.isOverdue(s, d, TODAY), true);
    });
    test('TC-15 basis: D000044 (Brief, 1 round) → Approve Draft 2 is an error unless a round is added', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      const no = R.checkMove(s, d, 'Approve Draft 2', opts());
      assert.ok(no.errs.some(e => e.code === 'add_round' && e.msg === C.msg.moveDraftNotInPlan(2, 1)));
      const yes = R.checkMove(s, d, 'Approve Draft 2', opts({ addRound: true }));
      assert.deepEqual(yes.errs, []);
      assert.ok(yes.infos.some(i => i.msg === C.msg.moveAddsRound(1, 2)));
      assert.ok(yes.warns.some(w => w.msg === C.msg.moveSkip('Approve Draft 1')));
      const r = R.applyMove(s, d, 'Approve Draft 2', opts({ addRound: true }), { logId: 771, eventId: 1, now: new Date('2026-10-05T03:00:00Z') });
      assert.equal(r.deal.draft_rounds, 2);
      assert.equal(r.deal.sub_status, 'Approve Draft 2');
      assert.equal(r.log.sub_status, 'Approve Draft 2');
      assert.deepEqual(r.event, { event_id: 1, deal_id: 'D000044', type: 'plan', from: { draft_rounds: 1, script_required: false },
        to: { draft_rounds: 2, script_required: false }, changed_at: '2026-10-05T03:00:00.000Z', changed_by: null, note: null });
      assert.equal(d.draft_rounds, 1, 'the input deal is not changed');
      assert.equal(R.applyMove(s, d, 'Approve Draft 1', opts(), { logId: 772 }).event, null);
    });
    test('Script outside the plan is an error; skipping counts planned steps only', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.ok(R.checkMove(s, d, 'Approve Script', opts()).errs.some(e => e.msg === C.msg.moveScriptNotInPlan));
      assert.deepEqual(R.checkMove(s, { ...d, script_required: true }, 'Approve Script', opts()).errs, []);
      assert.ok(R.checkMove(s, { ...d, script_required: true }, 'Approve Draft 1', opts()).warns.some(w => w.msg === C.msg.moveSkip('Approve Script')));
      assert.deepEqual(R.checkMove(s, d, 'Approve Draft 1', opts()).warns, [], 'Script not planned → nothing skipped');
      const d1 = { ...d, sub_status: 'Approve Draft 1', draft_rounds: 2 };
      assert.ok(R.checkMove(s, d1, 'Post', opts()).warns.some(w => w.msg === C.msg.moveSkip('Approve Draft 2')));
    });
    test('TC-16 basis: rounds already passed cannot be removed; Script cannot be switched off once passed', () => {
      const s = fresh();
      assert.equal(R.planLimits(s, deal(s, 'D000001')).minDrafts, 2, 'Posted with 2 rounds');
      assert.equal(R.planLimits(s, { ...deal(s, 'D000001'), sub_status: 'Approve Draft 2', status: 'Inprocess' }).minDrafts, 2);
      assert.equal(R.planLimits(s, deal(s, 'D000051')).minDrafts, 1, 'at Draft 1 of 2 → may drop to 1');
      assert.ok(R.checkPlan(s, deal(s, 'D000001'), { drafts: 1, script: false }).errs.some(e => e.msg === C.msg.planDraftsPassed(2)));
      assert.deepEqual(R.checkPlan(s, deal(s, 'D000051'), { drafts: 1, script: false }).errs, []);
      assert.ok(R.checkPlan(s, deal(s, 'D000051'), { drafts: 4, script: false }).errs.length);
      const scripted = { ...deal(s, 'D000044'), script_required: true, sub_status: 'Approve Draft 1' };
      assert.equal(R.planLimits(s, scripted).scriptLocked, true);
      assert.ok(R.checkPlan(s, scripted, { drafts: 1, script: false }).errs.some(e => e.msg === C.msg.planScriptPassed));
      assert.equal(R.planLimits(s, { ...scripted, sub_status: 'Brief' }).scriptLocked, false);
      const lim = R.planLimits(s, deal(s, 'D000187'));
      assert.equal(lim.minDrafts, R.planOf(deal(s, 'D000187')).drafts, 'Cancel with unknown step before keeps the plan');
    });
    test('applyPlan returns the changed deal and a plan event; no change → no event', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      const r = R.applyPlan(d, { drafts: 2, script: true }, { eventId: 5, now: new Date('2026-10-05T03:00:00Z') });
      assert.equal(r.deal.draft_rounds, 2);
      assert.equal(r.deal.script_required, true);
      assert.equal(r.event.type, 'plan');
      assert.deepEqual(r.event.to, { draft_rounds: 2, script_required: true });
      assert.equal(R.applyPlan(d, { drafts: 1, script: false }, { eventId: 6 }).event, null);
    });
    test('date checks use planned rounds only; dates of a round outside the plan → info', () => {
      const s = fresh(), d = { ...deal(s, 'D000044'), expected_draft2_date: '2026-09-01' };
      const r = R.validateDeal(s, d, R.postsOf(s, 'D000044'), TODAY);
      assert.ok(!r.warns.some(w => w.msg === C.msg.draftLate(2, '01/09/2026')));
      assert.ok(r.infos.some(i => i.msg === C.msg.draftOutsidePlan(2, 1)));
      const r2 = R.validateDeal(s, { ...d, draft_rounds: 2 }, R.postsOf(s, 'D000044'), TODAY);
      assert.ok(r2.warns.some(w => w.msg === C.msg.draftLate(2, '01/09/2026')));
      assert.ok(!r2.infos.some(i => i.msg === C.msg.draftOutsidePlan(2, 2)));
    });
    test('seed data: no deal has dates outside its plan', () => {
      const s = fresh(), ctx = R.dealContext(s);
      const n = s.deals.filter(d => R.validateDeal(s, d, R.postsOfCtx(ctx, d.deal_id), TODAY, ctx).infos.some(i => /แต่แผนมี/.test(i.msg))).length;
      assert.equal(n, 0);
    });
  });

  describe('CR-02 R1 · payment term', () => {
    const base = { rate_card: 1000, docs_done: false, paid_50: false, paid_full: false };
    test('TC-06: paymentState', () => {
      assert.equal(R.paymentState({ ...base, payment_term: 'prepaid', status: 'Inprocess', sub_status: 'Brief' }, TODAY), 'overdue');
      assert.equal(R.paymentState({ ...base, payment_term: 'split_50', paid_50: true, status: 'Inprocess', sub_status: 'Approve Draft 1' }, TODAY), 'deposit_paid');
      assert.equal(R.paymentState({ ...base, payment_term: 'postpaid', status: 'Complete', sub_status: 'Post' }, TODAY), 'due');
      assert.equal(R.paymentState({ ...base, payment_term: 'free', status: 'Complete', sub_status: 'Post' }, TODAY), 'free');
      assert.equal(R.paymentState({ ...base, payment_term: null, paid_full: true, status: 'Inprocess', sub_status: 'Brief' }, TODAY), 'paid');
    });
    test('paymentState: more cases', () => {
      const st = (o) => R.paymentState({ ...base, ...o }, TODAY);
      assert.equal(st({ payment_term: 'prepaid', status: 'List', sub_status: 'Confirm QT' }), 'not_due');
      assert.equal(st({ payment_term: 'prepaid', status: 'Complete', sub_status: 'Post' }), 'overdue');
      assert.equal(st({ payment_term: 'split_50', status: 'Inprocess', sub_status: 'Brief' }), 'overdue', 'no deposit at Brief');
      assert.equal(st({ payment_term: 'split_50', paid_50: true, status: 'Complete', sub_status: 'Post' }), 'due');
      assert.equal(st({ payment_term: 'split_50', status: 'List', sub_status: 'Contacted' }), 'not_due');
      assert.equal(st({ payment_term: 'postpaid', status: 'Inprocess', sub_status: 'Approve Draft 1' }), 'not_due');
      assert.equal(st({ payment_term: null, status: 'Complete', sub_status: 'Post' }), 'due');
      assert.equal(st({ payment_term: null, status: 'Inprocess', sub_status: 'Brief' }), 'not_due');
      assert.equal(st({ payment_term: 'prepaid', status: 'Cancel', sub_status: 'Cancel' }), 'not_due', 'a cancelled deal owes nothing');
      assert.equal(st({ payment_term: 'prepaid', paid_full: true, status: 'Inprocess', sub_status: 'Brief' }), 'paid');
    });
    test('TC-10 basis: D000296 (term not set, paid) → Paid', () => {
      const s = fresh();
      assert.equal(R.paymentState(deal(s, 'D000296'), TODAY), 'paid');
      assert.equal(R.termOf(deal(s, 'D000296')), null);
    });
    test('milestones per term', () => {
      assert.deepEqual(R.paymentMilestones('prepaid'), ['docs_done', 'paid_full']);
      assert.deepEqual(R.paymentMilestones('split_50'), ['docs_done', 'paid_50', 'paid_full']);
      assert.deepEqual(R.paymentMilestones('postpaid'), ['docs_done', 'paid_full']);
      assert.deepEqual(R.paymentMilestones('free'), []);
      assert.deepEqual(R.paymentMilestones(null), ['docs_done', 'paid_50', 'paid_full']);
    });
    test('Unpaid = Complete, not Free, not paid in full (seed still 130); Free with a cost → info', () => {
      const s = fresh();
      assert.equal(s.deals.filter(R.isUnpaid).length, 130);
      const d = s.deals.find(R.isUnpaid);
      assert.equal(R.isUnpaid({ ...d, payment_term: 'free' }), false);
      const r = R.validateDeal(s, { ...d, payment_term: 'free' }, R.postsOf(s, d.deal_id), TODAY);
      assert.ok(r.infos.some(i => i.msg === C.msg.freeWithCost(R.baht(R.totalCost(d)))));
      assert.ok(R.validateDeal(s, { ...d, payment_term: 'weekly' }, R.postsOf(s, d.deal_id), TODAY).errs.some(e => e.msg === C.msg.termInvalid));
    });
    test('TC-17 basis: phriknit default 50/50 → applies to 1 open deal (D000296) with an event; shows Paid', () => {
      const s = fresh(), kolId = deal(s, 'D000296').kol_id;
      const r = R.applyTermToOpenDeals(s, kolId, 'split_50', { eventId: 1, now: new Date('2026-10-05T03:00:00Z') });
      assert.deepEqual(r.deals.map(d => d.deal_id), ['D000296']);
      assert.equal(r.deals[0].payment_term, 'split_50');
      assert.deepEqual(r.events.map(e => [e.event_id, e.type, e.from, e.to]), [[1, 'payment_term', null, 'split_50']]);
      assert.equal(R.paymentState(r.deals[0], TODAY), 'paid');
      assert.equal(deal(s, 'D000296').payment_term, null, 'state is not changed');
    });
    test('closed deals are not changed by Apply to open deals', () => {
      const s = fresh(), kolId = deal(s, 'D000001').kol_id;
      assert.ok(R.dealsOfKol(s, kolId).every(d => !R.isOpenDeal(d)));
      assert.equal(R.applyTermToOpenDeals(s, kolId, 'prepaid', { eventId: 1 }).deals.length, 0);
    });
    test('TC-18 basis: a new deal needs a term; it starts from the KOL default', () => {
      const s = fresh(), k = R.kolById(s, 'K0011');
      assert.ok(R.checkNewDealTerm({ payment_term: null }).errs.some(e => e.msg === C.msg.termRequired));
      assert.deepEqual(R.checkNewDealTerm({ payment_term: 'prepaid' }).errs, []);
      const a = R.shortlistDeal(s, 'K0011', { dealId: 'D000306', logId: 771, phaseId: 'KS-P2', pic: 'Ja', date: TODAY });
      assert.equal(a.deal.payment_term, null);
      assert.equal(a.deal.draft_rounds, 1);
      assert.equal(a.deal.script_required, false);
      k.default_payment_term = 'postpaid';
      assert.equal(R.shortlistDeal(s, 'K0011', { dealId: 'D000306', logId: 771, phaseId: 'KS-P2', pic: 'Ja', date: TODAY }).deal.payment_term, 'postpaid');
      assert.equal(R.shortlistDeal(s, 'K0011', { dealId: 'D000306', logId: 771, phaseId: 'KS-P2', pic: 'Ja', date: TODAY, paymentTerm: 'free' }).deal.payment_term, 'free');
      const n = R.newDeal(s, { dealId: 'D000306', logId: 771, phaseId: 'KS-P2', kolId: 'K0011', sub: 'Brief', pic: 'Ja', accountIds: [], postIds: [], date: TODAY });
      assert.equal(n.deal.payment_term, 'postpaid');
      assert.ok(R.validateKol(s, Object.assign({}, k, { default_payment_term: 'x', accounts: R.accountsOfKol(s, 'K0011') })).errs.some(e => e.msg === C.msg.termInvalid));
    });
    test('TC-20 basis: open deals without a term = 70 (List 37 + In process 33)', () => {
      const s = fresh();
      assert.equal(s.deals.filter(d => R.isOpenDeal(d) && !R.termOf(d)).length, 70);
    });
    test('deals CSV carries plan, term and the payment state', () => {
      const s = fresh(), row = R.dealsRows(s, [deal(s, 'D000296')], TODAY)[0];
      assert.ok(['draft_rounds', 'script_required', 'payment_term', 'payment_state'].every(k => R.DEALS_COLS.includes(k)));
      assert.equal(row.draft_rounds, 1);
      assert.equal(row.payment_term, null);
      assert.equal(row.payment_state, 'paid');
    });
  });

  describe('CR-02 R2 · Deals table rules', () => {
    const ongoing = s => R.orderedPhases(s.campaigns, s.phases, TODAY).filter(p => R.phaseStatus(p, TODAY) === 'ongoing').map(p => p.phase_id);
    test('TC-07 basis: default filter (On going phases) → All 62 · List 6 · In process 16 · Complete 40 · Cancelled 0', () => {
      const s = fresh(), rows = R.filterDeals(s, { phases: ongoing(s) }, TODAY, R.dealContext(s));
      assert.equal(rows.length, 62);
      assert.deepEqual(countBy(rows, d => d.status), { Complete: 40, Inprocess: 16, List: 6 });
    });
    test('TC-08 basis: All phases → 305 deals in 9 groups', () => {
      const s = fresh(), ids = R.orderedPhases(s.campaigns, s.phases, TODAY).map(p => p.phase_id);
      const rows = R.filterDeals(s, { phases: ids }, TODAY, R.dealContext(s));
      assert.equal(rows.length, 305);
      const idx = R.phaseIndex(s);
      assert.equal(new Set(rows.map(d => R.primaryPhase(idx, d.deal_id))).size, 9);
    });
    test('TC-09 basis: searching D000296 finds phriknit', () => {
      const s = fresh(), rows = R.filterDeals(s, { q: 'D000296' }, TODAY, R.dealContext(s));
      assert.deepEqual(rows.map(d => d.deal_id), ['D000296']);
      assert.equal(R.kolById(s, rows[0].kol_id).display_name, 'phriknit');
    });
    test('TC-10 basis: D000296 stage = Brief ● · Draft 1 ● · Post ◯ (1 round); payment Not set · Paid', () => {
      const s = fresh(), d = deal(s, 'D000296');
      assert.deepEqual(R.stageDots(s.lookups, d).map(x => [x.step.sub_status, x.state]), [['Brief', 'done'], ['Approve Draft 1', 'done'], ['Post', 'next']]);
      assert.equal(C.stage.draftOf(R.draftNo(R.stepOf(s.lookups, d.sub_status)), R.planOf(d).drafts), 'Draft 1 of 1');
      assert.equal(`${C.termShort[R.termOf(d) || 'none']} · ${C.payState[R.paymentState(d, TODAY)]}`, 'Not set · Paid');
    });
    test('TC-11 basis: D000001 stage = 4 dots (Brief · Draft 1 · Draft 2 · Post), all done', () => {
      const s = fresh(), dots = R.stageDots(s.lookups, deal(s, 'D000001'));
      assert.deepEqual(dots.map(x => x.step.sub_status), ['Brief', 'Approve Draft 1', 'Approve Draft 2', 'Post']);
      assert.ok(dots.every(x => x.state === 'done'));
    });
    test('stage dots: List and Cancel have none; Script adds a dot; the next step is a ring', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.deepEqual(R.stageDots(s.lookups, { ...d, status: 'List', sub_status: 'Contacted' }), []);
      assert.deepEqual(R.stageDots(s.lookups, { ...d, status: 'Cancel', sub_status: 'Cancel' }), []);
      assert.deepEqual(R.stageDots(s.lookups, { ...d, script_required: true, draft_rounds: 2 }).map(x => x.state), ['done', 'next', 'todo', 'todo', 'todo']);
    });
    test('TC-13 basis: PIC change → event; undo writes the reverse change marked undo', () => {
      const s = fresh(), d = deal(s, 'D000302');
      assert.equal(d.pic, null);
      const r = R.picChange(d, 'Amp', { eventId: 1, now: new Date('2026-10-05T03:00:00Z') });
      assert.equal(r.deal.pic, 'Amp');
      assert.deepEqual(r.event, { event_id: 1, deal_id: 'D000302', type: 'pic', from: null, to: 'Amp', changed_at: '2026-10-05T03:00:00.000Z', changed_by: null, note: null });
      const back = R.picChange(r.deal, null, { eventId: 2, note: 'undo' });
      assert.equal(back.deal.pic, null);
      assert.equal(back.event.note, 'undo');
      assert.equal(R.picChange(d, null, { eventId: 3 }), null, 'same PIC → nothing to record');
    });
    test('TC-14 basis: 3 deals → Pizza = 3 changes, 3 events; undo restores each one', () => {
      const s = fresh(), three = ['D000044', 'D000302', 'D000296'].map(id => deal(s, id)), before = new Map(three.map(d => [d.deal_id, d.pic]));
      const r = R.picChanges(three, 'Amp', { eventId: 10 });
      assert.equal(r.deals.length, 3);
      assert.deepEqual(r.events.map(e => e.event_id), [10, 11, 12]);
      const back = R.picChanges(r.deals, d => before.get(d.deal_id), { eventId: 13, note: 'undo' });
      assert.deepEqual(back.deals.map(d => d.pic), three.map(d => d.pic));
      assert.equal(R.picChanges(three, 'Pizza', { eventId: 1 }).deals.length, 2, 'D000296 is already Pizza');
    });
    test('filters: payment status, payment term (none = not set), open deals', () => {
      const s = fresh(), ctx = R.dealContext(s);
      assert.equal(R.filterDeals(s, { payState: 'paid' }, TODAY, ctx).length, 101);
      assert.equal(R.filterDeals(s, { term: 'none' }, TODAY, ctx).length, 305);
      assert.equal(R.filterDeals(s, { term: 'none', open: true }, TODAY, ctx).length, 70);
      assert.equal(R.filterDeals(s, { term: 'prepaid' }, TODAY, ctx).length, 0);
    });
    test('TC-12 basis: no platform letters in UI text; every platform has an icon', () => {
      assert.equal(C.platformShort, undefined);
      const texts = []; const walk = o => Object.values(o).forEach(v => { if (typeof v === 'string') texts.push(v); else if (v && typeof v === 'object') walk(v); });
      walk(C);
      assert.deepEqual(texts.filter(x => /(^|[^A-Za-z])(TT|IG|FB|L8|YT)([^A-Za-z]|$)/.test(x)), []);
      if (window.KT.icons) ['TikTok', 'Instagram', 'Facebook', 'X', 'Lemon8', 'YouTube', 'Other', 'Unknown'].forEach(p => assert.ok(/^<svg[^>]*viewBox="0 0 24 24"/.test(window.KT.icons.svg(p)), p));
    });
  });

  describe('CR-02 R3 · drawer, Move stage, payment term, Pipeline, Needs attention', () => {
    test('TC-15: Move to Draft 2 with + Add draft round → rounds 2, a plan event and a status log', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.ok(R.checkMove(s, d, 'Approve Draft 2', opts()).errs.some(e => e.code === 'add_round'));
      const r = R.applyMove(s, d, 'Approve Draft 2', opts({ addRound: true }), { logId: 771, eventId: 1 });
      assert.equal(r.deal.draft_rounds, 2);
      assert.equal(r.event.type, 'plan');
      assert.equal(r.log.sub_status, 'Approve Draft 2');
    });
    test('TC-16: Drafts − is blocked once Draft 2 is passed', () => {
      const s = fresh(), d = { ...deal(s, 'D000001') };
      assert.equal(R.planLimits(s, d).minDrafts, R.planOf(d).drafts);
    });
    test('TC-18: Add to phase needs a term; bulk add needs one for KOLs without a default', () => {
      const s = fresh();
      assert.ok(R.checkAddToCampaign(s, 'K0120', 'KS', 'Pang', '').errs.some(e => e.msg === C.msg.termRequired));
      assert.deepEqual(R.checkAddToCampaign(s, 'K0120', 'KS', 'Pang', 'prepaid').errs, []);
      const p = R.planShortlist(s, ['K0120', 'K0011'], 'PH', 'Amp', '');
      assert.ok(p.errs.some(e => e.msg === C.msg.addTermMissing(2)));
      R.kolById(s, 'K0120').default_payment_term = 'free';
      assert.equal(R.planShortlist(s, ['K0120', 'K0011'], 'PH', 'Amp', '').noTerm.length, 1);
    });
    test('TC-19: prepaid deal at Brief without payment → Prepaid · Overdue; Payment before brief = 1', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      d.payment_term = 'prepaid';
      assert.equal(R.paymentState(d, TODAY), 'overdue');
      assert.equal(R.paymentAttention(s, s.phases.map(p => p.phase_id), TODAY).beforeBrief, 1);
      assert.equal(R.filterDeals(s, { payState: 'overdue' }, TODAY, R.dealContext(s)).length, 1);
    });
    test('TC-20: Needs attention · Payment term not set = 70; Unpaid stays 130; Payment before brief = 0', () => {
      const s = fresh(), ids = s.phases.map(p => p.phase_id), pa = R.paymentAttention(s, ids, TODAY);
      assert.equal(pa.termNotSet, 70);
      assert.equal(pa.beforeBrief, 0);
      assert.equal(R.overviewTiles(s, ids, '2026-08-01', TODAY, TODAY).unpaid, 130);
    });
    test('TC-21: Pipeline PH-OCT has no Script / Draft 2 / Draft 3 column when no deal plans them', () => {
      const s = fresh(), cols = R.pipeline(s, 'PH-OCT').map(c => c.step.sub_status);
      const planned = s.deals.filter(d => d.phase_id === 'PH-OCT').map(d => R.planOf(d));
      assert.ok(planned.every(p => p.drafts === 1 && !p.script), 'seed: PH-OCT deals plan 1 round');
      assert.ok(!cols.includes('Approve Script') && !cols.includes('Approve Draft 2') && !cols.includes('Approve Draft 3'));
      assert.ok(cols.includes('Approve Draft 1') && cols.includes('Post'));
      deal(s, 'D000296').draft_rounds = 2;
      assert.ok(R.pipeline(s, 'PH-OCT').some(c => c.step.sub_status === 'Approve Draft 2'), 'a planned round brings its column back');
      assert.ok(R.pipeline(s, 'CH-P1').some(c => c.step.sub_status === 'Approve Draft 2'), 'CH-P1 has 2-round deals');
    });
    test('merging keeps the default term of the KOL that is removed when the kept one has none', () => {
      const s = fresh();
      R.kolById(s, 'K0002').default_payment_term = 'split_50';
      assert.equal(R.mergedKol(s, 'K0002', 'K0001').default_payment_term, 'split_50');
    });
  });

  describe('CR-02 R1 · Campaign & Phase status and order', () => {
    test('TC-04: Phase / Campaign status on 05/10/2026', () => {
      const s = fresh(), ph = id => R.phaseStatus(s.phases.find(p => p.phase_id === id), TODAY);
      ['CH-P2', 'KS-P2', 'PH-OCT'].forEach(id => assert.equal(ph(id), 'ongoing', id));
      ['CH-P1', 'KS-P1', 'AC-P1', 'PH-P1', 'PH-P2', 'PH-P3'].forEach(id => assert.equal(ph(id), 'complete', id));
      const cs = id => R.campaignStatus(s.phases.filter(p => p.campaign_id === id), TODAY);
      ['CH', 'KS', 'PH'].forEach(id => assert.equal(cs(id), 'ongoing', id));
      assert.equal(cs('AC'), 'complete');
    });
    test('status edges: start and end days are on going; between Phases is on going; no Phase is not started', () => {
      const p = { start_date: '2026-10-01', end_date: '2026-10-31' };
      assert.equal(R.phaseStatus(p, '2026-09-30'), 'not_started');
      assert.equal(R.phaseStatus(p, '2026-10-01'), 'ongoing');
      assert.equal(R.phaseStatus(p, '2026-10-31'), 'ongoing');
      assert.equal(R.phaseStatus(p, '2026-11-01'), 'complete');
      const done = { start_date: '2026-09-01', end_date: '2026-09-30' }, later = { start_date: '2026-11-01', end_date: '2026-11-30' };
      assert.equal(R.campaignStatus([done, later], TODAY), 'ongoing');
      assert.equal(R.campaignStatus([later], TODAY), 'not_started');
      assert.equal(R.campaignStatus([done], TODAY), 'complete');
      assert.equal(R.campaignStatus([], TODAY), 'not_started');
    });
    test('TC-05: sortCampaigns → CH, KS, PH, AC', () => {
      const s = fresh();
      assert.deepEqual(R.sortCampaigns(s.campaigns, s.phases, TODAY).map(c => c.campaign_id), ['CH', 'KS', 'PH', 'AC']);
    });
    test('sort: Not started by nearest start, Complete by latest end; Phases by start date', () => {
      const cs = [{ campaign_id: 'A', campaign_name: 'A' }, { campaign_id: 'B', campaign_name: 'B' }, { campaign_id: 'C', campaign_name: 'C' }, { campaign_id: 'D', campaign_name: 'D' }];
      const ps = [
        { phase_id: 'A-P1', campaign_id: 'A', start_date: '2026-12-01', end_date: '2026-12-31' },
        { phase_id: 'B-P1', campaign_id: 'B', start_date: '2026-11-01', end_date: '2026-11-30' },
        { phase_id: 'C-P1', campaign_id: 'C', start_date: '2026-01-01', end_date: '2026-01-31' },
        { phase_id: 'D-P1', campaign_id: 'D', start_date: '2026-03-01', end_date: '2026-03-31' },
      ];
      assert.deepEqual(R.sortCampaigns(cs, ps, TODAY).map(c => c.campaign_id), ['B', 'A', 'D', 'C']);
      const s = fresh();
      assert.deepEqual(R.sortPhases(s.phases.filter(p => p.campaign_id === 'PH')).map(p => p.phase_id), ['PH-P1', 'PH-P2', 'PH-P3', 'PH-OCT']);
    });
    test('TC-07 basis: on going Phases in group order = CH-P2, KS-P2, PH-OCT · 62 deals · ฿371,150 + Shortlist ฿12,900 / ฿550,000 (CR-03)', () => {
      const s = fresh();
      const ids = R.orderedPhases(s.campaigns, s.phases, TODAY).filter(p => R.phaseStatus(p, TODAY) === 'ongoing').map(p => p.phase_id);
      assert.deepEqual(ids, ['CH-P2', 'KS-P2', 'PH-OCT']);
      const deals = R.filterDeals(s, { phases: ids }, TODAY, R.dealContext(s)), x = R.dealTiles(s, deals, ids, TODAY);
      assert.equal(deals.length, 62);
      assert.deepEqual(countBy(deals, d => d.status), { Complete: 40, Inprocess: 16, List: 6 });
      assert.equal(x.committed, 371150);
      assert.equal(x.shortlist, 12900);
      assert.equal(x.budget, 550000);
      assert.equal(R.orderedPhases(s.campaigns, s.phases, TODAY).length, 9);
    });
  });
});
