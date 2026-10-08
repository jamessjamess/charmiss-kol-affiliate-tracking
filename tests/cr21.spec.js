/* cr21.spec.js — CR-21 test cases (Collapse all / Sort · Deals Year · Save draft · Approval review · Return to draft / Resubmit · Edit = Phase Planner ·
   schema 20), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate v20 · test data is made up (Pang = Staff · Admin reviews ·
   "Campaign Jan 2027" 01/01–31/03/2027 · KOL budget ฿2,000,000 · 3 Phases · Products Test 1, Test 2). */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const user = (s, name) => s.users.find(u => u.display_name === name);
  const camp = (s, id) => s.campaigns.find(c => c.campaign_id === id);
  const ids = list => list.map(c => c.campaign_id);
  let evn = 70000;
  const ctxBy = who => ({ eventId: () => evn++, now: NOW, user: who ? who.user_id : 'U000' });
  const kpis = s => R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
  /* Pang's "Campaign Jan 2027": a draft with 3 Phases and 2 products (made up) */
  function janDraft(s) {
    const pang = user(s, 'Pang');
    ['TEST1', 'TEST2'].forEach((code, i) => { if (!s.products.some(p => p.tr_code === code)) s.products.push({ tr_code: code, product_name: `Test ${i + 1}`, variant: null, active: true }); });
    const c = R.stampDraft({ campaign_id: 'CMP-0901', campaign_name: 'Campaign Jan 2027', budget_kol: 2000000, note: null, cta: null, default_payment_term: null, status_override: null }, pang, NOW);
    s.campaigns.push(c);
    [['2027-01-01', '2027-01-31', 600000], ['2027-02-01', '2027-02-28', 800000], ['2027-03-01', '2027-03-31', 600000]].forEach(([a, z, b], i) =>
      s.phases.push(R.stampDraft({ phase_id: `PHS-090${i + 1}`, campaign_id: c.campaign_id, label: null, start_date: a, end_date: z, budget_kol: b, default_pillar: null }, pang, NOW)));
    R.setCampaignProducts(s, c.campaign_id, ['TEST1', 'TEST2']);
    R.syncInitial(s, c.campaign_id, pang.user_id, NOW);
    return c;
  }
  const go = (s, id, to, who, o) => { const r = R.requestTransition(s, id, to, ctxBy(who), o); s.campaign_events.push(...r.events); return r; };

  describe('CR-21 §3.1 · Sort (U1)', () => {
    test('U1: Status (On going by start date first · Acne Fade Concealer last) · Start date earliest / latest · ties by name', () => {
      const s = fresh();
      assert.deepEqual(ids(R.sortCampaigns(s.campaigns, s.phases, TD, 'status')), ['KS', 'PH', 'CH', 'AC'], 'On going 3 by start (17/08 · 29/08 · 01/09) → Complete');
      const early = ids(R.sortCampaigns(s.campaigns, s.phases, TD, 'start_asc')), late = ids(R.sortCampaigns(s.campaigns, s.phases, TD, 'start_desc'));
      assert.deepEqual(early, ['KS', 'PH', 'CH', 'AC']);
      assert.deepEqual(late, early.slice().reverse(), 'latest first = earliest first reversed');
      s.campaigns.push({ campaign_id: 'ZZ', campaign_name: 'Zeta', approval_status: 'approved' }, { campaign_id: 'AA', campaign_name: 'Alpha', approval_status: 'approved' }, { campaign_id: 'NN', campaign_name: 'No dates', approval_status: 'approved' });
      s.phases.push({ phase_id: 'ZZ-1', campaign_id: 'ZZ', start_date: '2026-11-01', end_date: '2026-11-30', approval_status: 'approved' }, { phase_id: 'AA-1', campaign_id: 'AA', start_date: '2026-11-01', end_date: '2026-11-15', approval_status: 'approved' });
      camp(s, 'KS').status_override = 'on_hold';
      assert.deepEqual(ids(R.sortCampaigns(s.campaigns, s.phases, TD, 'start_asc')).slice(-4), ['AC', 'AA', 'ZZ', 'NN'], 'the same start → by name · no start last');
      assert.deepEqual(ids(R.sortCampaigns(s.campaigns, s.phases, TD, 'status')), ['PH', 'CH', 'AA', 'ZZ', 'NN', 'KS', 'AC'], 'On going → Not started (start, then name · none last) → On hold → Complete');
      assert.deepEqual(R.SORT_MODES, ['status', 'start_asc', 'start_desc']);
    });
  });

  describe('CR-21 §3.2 · Deals › Year (U2 · U3)', () => {
    test('U2: campaignYear by start_date · one that runs into the next year = the year it starts · else its earliest Phase · yearOptions = [All years, 2026] · Draft / Pending not counted', () => {
      const s = fresh();
      assert.equal(R.campaignYear(s, camp(s, 'CH')), '2026');
      assert.deepEqual(R.yearOptions(s), ['all', '2026']);
      s.campaigns.push({ campaign_id: 'XY', campaign_name: 'Cross year', approval_status: 'approved' });
      s.phases.push({ phase_id: 'XY-1', campaign_id: 'XY', start_date: '2026-11-01', end_date: '2027-01-31', approval_status: 'approved' });
      assert.equal(R.campaignYear(s, camp(s, 'XY')), '2026', '01/11/2026 – 31/01/2027 is 2026 only');
      s.campaigns.push({ campaign_id: 'SD', campaign_name: 'Own start', start_date: '2025-12-20', approval_status: 'approved' });
      s.phases.push({ phase_id: 'SD-1', campaign_id: 'SD', start_date: '2026-01-05', end_date: '2026-02-01', approval_status: 'approved' });
      assert.equal(R.campaignYear(s, camp(s, 'SD')), '2025', 'its own start_date first');
      s.campaigns.push({ campaign_id: 'ND', campaign_name: 'No dates', approval_status: 'approved' });
      assert.equal(R.campaignYear(s, camp(s, 'ND')), null, 'no date: only under All years');
      const c = janDraft(s);
      assert.deepEqual(R.yearOptions(s), ['all', '2026', '2025'], 'a draft 2027 does not count');
      go(s, 'campaign:' + c.campaign_id, 'pending', user(s, 'Pang'));
      assert.deepEqual(R.yearOptions(s), ['all', '2026', '2025'], 'a pending 2027 does not count');
      go(s, 'campaign:' + c.campaign_id, 'approved', user(s, 'Admin'));
      assert.deepEqual(R.yearOptions(s), ['all', '2027', '2026', '2025'], 'approved → 2027, newest first');
      assert.equal(R.dealYearPref(s, '', TD), '2026', 'first time: this year');
      assert.equal(R.dealYearPref(s, '2019', TD), '2026', 'a year that is no longer there → this year');
      assert.equal(R.dealYearPref(s, 'all', TD), 'all');
    });
    test('U3: the deals of a Year — 2026 = 305 = All years · 2027 = none · the money of a Year', () => {
      const s = fresh(), ctx = R.dealContext(s);
      const n = y => R.filterDeals(s, { year: y }, TD, ctx).length;
      assert.deepEqual([n('2026'), n('all'), n(undefined), n('2027')], [305, 305, 305, 0]);
      assert.equal(R.filterDeals(s, { year: '2026', campaign: 'CH' }, TD, ctx).length, R.filterDeals(s, { campaign: 'CH' }, TD, ctx).length, 'AND with the Campaign');
      assert.equal(R.scopeBudget(s, { campaignIds: [...R.yearCampaignIds(s, '2026')] }), 2748400, 'the budgets of the 2026 Campaigns');
      assert.deepEqual(R.ongoingBefore(s, '2027', TD).map(x => [x.c.campaign_id, x.y]), [['CH', '2026'], ['KS', '2026'], ['PH', '2026']], 'On going ones of 2026 seen from 2027');
      assert.deepEqual(R.ongoingBefore(s, '2026', TD), []);
    });
  });

  describe('CR-21 §3.4–3.6 · requestTransition (U4) · requestDiff (U5)', () => {
    test('U4: draft → pending · pending → draft (returned needs a reason / withdrawn) · pending → approved · never back from approved · the Round', () => {
      const s = fresh(), pang = user(s, 'Pang'), admin = user(s, 'Admin'), c = janDraft(s), id = 'campaign:' + c.campaign_id;
      assert.deepEqual([c.approval_status, c.submit_round, c.approval.created_by], ['draft', 0, pang.user_id]);
      assert.deepEqual(go(s, id, 'draft', pang).events.map(e => e.to), ['draft_saved'], 'Save draft again');
      let r = go(s, id, 'pending', pang);
      assert.deepEqual([r.ok, c.approval_status, c.submit_round, r.events[0].to, s.phases.filter(p => p.campaign_id === c.campaign_id).map(p => p.approval_status)], [true, 'pending', 1, 'submitted', ['pending', 'pending', 'pending']]);
      assert.equal(R.syncInitial(s, c.campaign_id, pang.user_id, NOW).status, 'pending', 'its first budget waits with it');
      assert.equal(go(s, id, 'pending', pang).err, 'not_draft');
      assert.equal(go(s, id, 'draft', admin).err, 'reason', 'Return to draft needs a reason');
      assert.equal(go(s, id, 'draft', admin, { reason: 'ลดงบ' }).err, 'reason', '4 characters are not enough');
      r = go(s, id, 'draft', admin, { reason: 'ลดงบเหลือ 1,500,000 บาท' });
      assert.deepEqual([r.events[0].to, c.approval_status, c.returned_reason, c.returned_by, c.last_submitted.round, c.last_submitted.values.budget_kol.text], ['returned', 'draft', 'ลดงบเหลือ 1,500,000 บาท', admin.user_id, 1, '฿2,000,000']);
      assert.deepEqual(R.draftRequests(s, pang).map(x => [x.id, x.returned.reason]), [[id, 'ลดงบเหลือ 1,500,000 บาท']], 'Pang sees it in Drafts (Returned)');
      assert.deepEqual(R.returnedFor(s, pang).length, 1);
      c.budget_kol = 1500000;
      r = go(s, id, 'pending', pang);
      assert.deepEqual([r.events[0].to, c.submit_round, c.returned_at], ['resubmitted', 2, null], 'Resubmit → Round 2');
      r = go(s, id, 'draft', pang, { withdraw: true });
      assert.deepEqual([r.events[0].to, c.approval_status, c.submit_round], ['withdrawn', 'draft', 2], 'Withdraw to draft: the Round stays');
      go(s, id, 'pending', pang);
      assert.equal(c.submit_round, 2, 'sent again after a withdraw: still Round 2');
      r = go(s, id, 'approved', admin, { note: 'ok' });
      assert.deepEqual([r.events[0].to, r.events[0].round, c.approval_status, s.phases.filter(p => p.campaign_id === c.campaign_id).every(p => p.approval_status === 'approved')], ['approved', 2, 'approved', true]);
      assert.equal(go(s, id, 'draft', admin, { reason: 'too late now' }).err, 'approved', 'never back from approved');
      assert.equal(go(s, id, 'deleted', admin).err, 'approved');
      assert.deepEqual(R.decidedRequests(s).map(x => [x.type, x.result, x.round]).slice(0, 2), [['new_campaign', 'approved', 2], ['new_campaign', 'returned', 1]]);
      assert.deepEqual(R.requestHistory(s, id).map(e => e.to), ['draft_saved', 'submitted', 'returned', 'resubmitted', 'withdrawn', 'resubmitted', 'approved']);
    });
    test('U4: Delete draft · a change and a budget change (Return · Cancel request · Approve) · a manager\'s own draft → approved at once', () => {
      const s = fresh(), pang = user(s, 'Pang'), admin = user(s, 'Admin'), c = janDraft(s);
      const r = go(s, 'campaign:' + c.campaign_id, 'deleted', pang);
      assert.deepEqual([r.events[0].to, !!camp(s, c.campaign_id), s.phases.some(p => p.campaign_id === c.campaign_id), R.campaignProductCodes(s, c.campaign_id), (s.campaign_budget_changes || []).some(x => x.campaign_id === c.campaign_id)], ['draft_deleted', false, false, [], false]);
      const ks = camp(s, 'KS');
      R.requestChange(ks, { products: ['TEST1'] }, pang, NOW, '', { products: [] });
      assert.deepEqual([ks.pending_change.status, R.approvalCount(s)], ['draft', 0], 'a new change starts as a draft');
      go(s, 'change:KS', 'pending', pang);
      assert.deepEqual([R.approvalRequests(s).map(x => x.id), R.campaignProductCodes(s, 'KS')], [['change:KS'], []], 'it waits · the Campaign keeps what it has');
      go(s, 'change:KS', 'draft', admin, { reason: 'Use Test 2 too' });
      assert.deepEqual([ks.pending_change.status, ks.pending_change.returned_reason, R.campaignProductCodes(s, 'KS')], ['draft', 'Use Test 2 too', []], 'returned: the old values stay');
      ks.pending_change.fields.products = ['TEST1', 'TEST2'];
      go(s, 'change:KS', 'pending', pang);
      assert.equal(ks.pending_change.submit_round, 2);
      go(s, 'change:KS', 'approved', admin);
      assert.deepEqual([R.campaignProductCodes(s, 'KS'), ks.pending_change], [['TEST1', 'TEST2'], null], 'approved: the products change');
      R.requestChange(ks, { note: 'x' }, pang, NOW); go(s, 'change:KS', 'pending', pang);
      assert.deepEqual(go(s, 'change:KS', 'cancelled', pang).events.map(e => e.to), ['change_cancelled']); assert.equal(ks.pending_change, null, 'Cancel request');
      const b = R.submitBudgetChange(s, 'KS', { type: 'increase', amount: 50000, allocations: [{ phase_id: 'unallocated', amount: 50000 }], reason: 'Second round' }, pang, ctxBy(pang), { draft: true });
      assert.deepEqual([b.rec.status, b.events[0].to, R.pendingBudgetChange(s, 'KS')], ['draft', 'draft_saved', null], 'Save draft (budget)');
      const b2 = R.submitBudgetChange(s, 'KS', { type: 'increase', amount: 60000, allocations: [{ phase_id: 'unallocated', amount: 60000 }], reason: 'Second round' }, pang, ctxBy(pang), { changeId: b.rec.change_id });
      assert.deepEqual([b2.rec.change_id, b2.rec.status, b2.rec.amount, b2.rec.submit_round], [b.rec.change_id, 'pending', 60000, 1], 'the same draft is sent');
      go(s, 'budget:' + b.rec.change_id, 'approved', admin);
      assert.equal(ks.budget_kol, 660000);
      const mine = R.stampDraft({ campaign_id: 'CMP-0902', campaign_name: 'Admin draft', budget_kol: 1000 }, admin, NOW); s.campaigns.push(mine);
      assert.deepEqual([go(s, 'campaign:CMP-0902', 'approved', admin).err, go(s, 'campaign:CMP-0902', 'approved', admin, { direct: true }).ok, go(s, 'campaign:CMP-0902', 'approved', admin, { direct: true }).err],
        ['not_pending', true, 'approved'], 'a draft is approved only directly — once');
      const m2 = R.stampDraft({ campaign_id: 'CMP-0903', campaign_name: 'Admin draft 2', budget_kol: 1000 }, admin, NOW); s.campaigns.push(m2);
      assert.deepEqual([go(s, 'campaign:CMP-0903', 'approved', admin, { direct: true }).events[0].from, m2.approval_status], ['draft', 'approved'], 'Create campaign from a draft');
      assert.equal(R.decidedRequests(s).filter(x => x.campaign_id === 'CMP-0903').length, 0, 'not a decided card');
    });
    test('U5: requestDiff — old vs new → the fields · nothing changed = [] · an added / removed Phase is one line · What changed since last round', () => {
      const s = fresh(), pang = user(s, 'Pang'), admin = user(s, 'Admin'), c = janDraft(s), id = 'campaign:' + c.campaign_id;
      const before = R.requestSnapshot(s, id);
      assert.deepEqual(R.requestDiff(before, R.requestSnapshot(s, id)), []);
      c.budget_kol = 1500000;
      assert.deepEqual(R.requestDiff(before, R.requestSnapshot(s, id)).map(d => [d.label, d.from, d.to]), [['KOL budget', '฿2,000,000', '฿1,500,000']]);
      c.budget_kol = 2000000;
      const rows = s.phases.filter(p => p.campaign_id === c.campaign_id).map(p => ({ phase_id: p.phase_id, label: p.label, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol }));
      const a = R.planSnapshot(s, { campaign_name: c.campaign_name }, rows);
      const b = R.planSnapshot(s, { campaign_name: c.campaign_name }, rows.slice(0, 2).concat([{ key: 'k9', start_date: '2027-04-01', end_date: '2027-04-30', budget_kol: 1 }]).map((r, i) => (i === 1 ? Object.assign({}, r, { end_date: '2027-02-27' }) : r)));
      assert.deepEqual(R.requestDiff(a, b).map(d => d.label), ['Phase 2 period', 'Phase 3 removed', 'Phase 3 added']);
      assert.equal(R.diffSummary(R.requestDiff(a, b)), '3 changes · Phase 2 period · Phase 3 removed · Phase 3 added');
      go(s, id, 'pending', pang); assert.equal(R.sinceLastRound(s, id), null, 'Round 1: nothing to compare');
      go(s, id, 'draft', admin, { reason: 'ลดงบเหลือ 1,500,000 บาท' });
      c.budget_kol = 1500000; go(s, id, 'pending', pang);
      const w = R.sinceLastRound(s, id);
      assert.deepEqual([w.round, w.reason, w.changes.map(d => `${d.label} ${d.from} → ${d.to}`)], [1, 'ลดงบเหลือ 1,500,000 บาท', ['KOL budget ฿2,000,000 → ฿1,500,000']]);
    });
  });

  describe('CR-21 §4 · schema 20 (U6)', () => {
    test('U6: a schema 19 file → 20 · rejected → draft + returned_* (latest rejected event) · submit_round · approved untouched · the money anchors stay', () => {
      const v19 = JSON.parse(JSON.stringify(fresh())); v19.schema_version = 19;
      v19.campaigns.push({ campaign_id: 'RJ', campaign_name: 'Rejected one', budget_kol: 1000, approval_status: 'rejected', pending_change: null,
        approval: { submitted_by: 'U006', submitted_at: '2026-10-01T03:00:00Z', decided_by: 'U000', decided_at: '2026-10-02T03:00:00Z', reason: 'old reason' } });
      v19.phases.push({ phase_id: 'RJ-1', campaign_id: 'RJ', start_date: '2027-01-01', end_date: '2027-01-31', budget_kol: 1000, approval_status: 'rejected', approval: { submitted_by: 'U006' }, pending_change: null });
      v19.campaign_events.push({ event_id: 9001, campaign_id: 'RJ', type: 'approval', from: null, to: 'submitted', changed_at: '2026-09-30T03:00:00Z', changed_by: 'U006', note: null },
        { event_id: 9002, campaign_id: 'RJ', type: 'approval', from: 'pending', to: 'rejected', changed_at: '2026-10-01T03:00:00Z', changed_by: 'U000', note: 'too big' },
        { event_id: 9003, campaign_id: 'RJ', type: 'approval', from: 'rejected', to: 'submitted', changed_at: '2026-10-01T05:00:00Z', changed_by: 'U006', note: null },
        { event_id: 9004, campaign_id: 'RJ', type: 'approval', from: 'pending', to: 'rejected', changed_at: '2026-10-02T03:00:00Z', changed_by: 'U000', note: 'still too big' });
      v19.campaign_budget_changes.push({ change_id: 'BG-0099', campaign_id: 'KS', type: 'increase', amount: 5000, allocations: [{ phase_id: 'unallocated', amount: 5000 }], reason: 'x', status: 'rejected',
        requested_by: 'U006', requested_at: '2026-10-01T03:00:00Z', decided_by: 'U000', decided_at: '2026-10-02T03:00:00Z', reject_reason: 'not now' });
      const ks = v19.campaigns.find(c => c.campaign_id === 'KS'); ks.change_rejected = { fields: { budget_kol: 700000 }, requested_by: 'U006', decided_by: 'U000', decided_at: '2026-10-03T03:00:00Z', reason: 'no' };
      const approvedBefore = JSON.stringify(v19.campaigns.filter(c => ['CH', 'AC', 'PH'].includes(c.campaign_id)));
      const s = S.migrate(v19, new Date(NOW));
      const rj = s.campaigns.find(c => c.campaign_id === 'RJ');
      assert.ok(s.schema_version === S.SCHEMA_VERSION && S.SCHEMA_VERSION >= 20);   // (later CRs: on to the newest in the same pass)
      assert.deepEqual([rj.approval_status, rj.returned_reason, rj.returned_by, rj.returned_at, rj.submit_round], ['draft', 'still too big', 'U000', '2026-10-02T03:00:00Z', 2]);
      assert.deepEqual([s.phases.find(p => p.phase_id === 'RJ-1').approval_status, rj.last_submitted.round], ['draft', 2]);
      const bg = s.campaign_budget_changes.find(x => x.change_id === 'BG-0099');
      assert.deepEqual([bg.status, bg.returned_reason, bg.returned_by, bg.submit_round], ['draft', 'not now', 'U000', 1]);
      const k = s.campaigns.find(c => c.campaign_id === 'KS');
      assert.deepEqual([k.change_rejected, k.pending_change.status, k.pending_change.returned_reason, k.budget_kol], [undefined, 'draft', 'no', 600000], 'a rejected change → a returned draft');
      assert.equal(JSON.stringify(s.campaigns.filter(c => ['CH', 'AC', 'PH'].includes(c.campaign_id))), approvedBefore, 'approved ones untouched');
      assert.ok(!JSON.stringify(s.campaigns.concat(s.phases).map(x => x.approval_status)).includes('rejected'));
      const kk = kpis(s);
      assert.deepEqual([Math.round(kk.money.committed), Math.round(kk.paid.paid), Math.round(kk.money.pending)], [1783579, 774579, 98000], 'the CR-05 money anchors');
      const again = S.migrate(JSON.parse(JSON.stringify(s)), new Date(NOW));
      assert.equal(JSON.stringify(again.campaigns), JSON.stringify(s.campaigns), 'twice = the same');
    });
  });

  describe('CR-21 · drafts and pending ones are not counted (U7) · Save draft vs Submit (U8)', () => {
    test('U7: a draft / pending Campaign is not in the Dashboard, Committed or the Campaigns a deal can take', () => {
      const s = fresh(), before = kpis(s), pang = user(s, 'Pang'), c = janDraft(s);
      s.deals.push(Object.assign({}, s.deals[0], { deal_id: 'D009999', campaign_id: c.campaign_id }));
      assert.equal(R.campaignEffectiveStatus(c, s.phases.filter(p => p.campaign_id === c.campaign_id), TD), 'draft');
      const inDash = st => R.campaignsInRange(s, '2026-01-01', '2027-12-31', TD, st).map(x => x.campaign_id);
      assert.ok(!inDash(R.CAMPAIGN_STATUSES).includes(c.campaign_id), 'a draft is never on the Dashboard (any status)');
      assert.deepEqual(kpis(s).campaigns.n, before.campaigns.n);
      assert.equal(R.phaseIndex(s).campaign.get(c.campaign_id).committed > 0, true, 'the made-up deal has money');
      assert.equal(R.scopeBudget(s, {}), 2748400, 'the budget of every Campaign leaves the draft out');
      assert.ok(R.campaignBlocksNew(s, c.campaign_id), 'no deal can be added');
      assert.deepEqual(R.phasesOfCampaign(s, c.campaign_id), [], 'its Phases are not offered');
      assert.ok(!R.yearOptions(s).includes('2027'));
      go(s, 'campaign:' + c.campaign_id, 'pending', pang);
      assert.ok(!inDash(R.DASH_STATUS_DEFAULT).includes(c.campaign_id), 'pending: not in the default Status');
      assert.ok(R.campaignBlocksNew(s, c.campaign_id));
      assert.equal(R.defaultDealsCampaign(s, TD, c.campaign_id, '2027'), '', 'Deals does not open on it');
    });
    test('U8: Save draft needs only a name (not used by another) · Submit checks everything', () => {
      const s = fresh(), rows = [{ key: 'k1', start_date: '', end_date: '', budget_kol: '' }];
      const fields = r => r.errs.map(e => e.field);
      assert.deepEqual(fields(R.validatePlan(s, { campaign_name: 'Campaign Jan 2027', budget_kol: null, products: [] }, rows, [], 'draft')), []);
      assert.deepEqual(fields(R.validatePlan(s, { campaign_name: '  ', budget_kol: null, products: [] }, rows, [], 'draft')), ['campaign_name']);
      assert.deepEqual(fields(R.validatePlan(s, { campaign_name: 'charming iconic glow', products: [] }, rows, [], 'draft')), ['campaign_name'], 'the name of another Campaign');
      const full = fields(R.validatePlan(s, { campaign_name: 'Campaign Jan 2027', budget_kol: null, products: [] }, rows, [], 'submit'));
      ['budget_kol', 'products'].forEach(f => assert.ok(full.includes(f), f));
      assert.ok(full.some(f => /^row0_/.test(f)), 'the Phase rows too');
      const ok = R.validatePlan(s, { campaign_name: 'Campaign Jan 2027', budget_kol: 2000000, products: ['TEST1'] }, [{ key: 'k1', start_date: '2027-01-01', end_date: '2027-03-31', budget_kol: 2000000 }], [], 'submit');
      assert.deepEqual(fields(ok), []);
      assert.equal(R.validateReturn('ลดงบ').errs.length, 1); assert.equal(R.validateReturn('ลดงบเหลือ 1,500,000 บาท').errs.length, 0);
      assert.equal(C.approval.scrollToApprove, 'Scroll to the end to approve');
      assert.ok(!Object.values(C.phaseStatus).includes('Rejected') && !Object.values(C.budget.statuses).includes('Rejected'), 'no Rejected in the UI words');
    });
  });
});
