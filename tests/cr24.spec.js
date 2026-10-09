/* cr24.spec.js — CR-24 test cases (Operations = Work queue: the rows of rules.workQueue · due groups · Stuck · the filters · Summary · Team load ·
   Stage flow · Data to fix · no Pillar allocation), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate · test data is made up:
   "Campaign Nov - Dec" with one deal at each stage (D000401 …) for Amp. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED, E } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z', W = C.overview.wq;
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const kolBy = (s, n) => s.kol_master.find(k => k.display_name === n);
  const nextLog = s => s.deal_status_log.reduce((m, l) => Math.max(m, Number(l.log_id) || 0), 0) + 1;
  const user = (s, role) => s.users.find(u => u.role === role && u.active !== false);
  /* the made-up Campaign: a deal a stage (Amp) — the log date = when it came into that stage */
  function setup() {
    const s = fresh();
    s.campaigns.push({ campaign_id: 'CMP-0901', campaign_name: 'Campaign Nov - Dec', budget_kol: 2000000, approval_status: 'approved', status_override: null, cta: null, note: null });
    s.phases.push({ phase_id: 'PHS-0901', campaign_id: 'CMP-0901', label: null, start_date: '2026-11-01', end_date: '2026-12-31', budget_kol: 2000000, approval_status: 'approved' });
    const kols = s.kol_master.slice(0, 12);
    const mk = (id, i, sub, date, extra) => { const out = R.newDeal(s, { dealId: id, logId: nextLog(s), campaignId: 'CMP-0901', kolId: kols[i].kol_id, sub, pic: 'Amp', accountIds: [], postIds: [], date, now: new Date(NOW), user: 'U000', extra: extra || {} });
      s.deals.push(out.deal); s.deal_status_log.push(out.log); return out.deal; };
    mk('D000401', 0, 'Shortlist', '2026-10-01');
    mk('D000402', 1, 'Contacted', '2026-10-06');
    mk('D000403', 2, 'Confirm QT', '2026-09-20', { pillar: 'Awareness', payment_term: 'postpaid', rate_card: 1000 });   // 18 days in stage → Stuck
    mk('D000404', 3, 'Brief', '2026-10-05', { expected_script_date: '2026-10-07', expected_draft1_date: '2026-10-12' });   // Script due yesterday → Overdue
    mk('D000405', 4, 'Script', '2026-10-06', { expected_draft1_date: TD });   // Draft 1 due today
    mk('D000406', 5, 'Draft 1', '2026-10-06', { draft_rounds: 2, expected_draft2_date: '2026-10-11' });   // Draft 2 in 3 days
    mk('D000407', 6, 'Draft 1', '2026-10-07', { draft_rounds: 1 });   // the last Draft → Approve (no date)
    mk('D000408', 7, 'Approve', '2026-10-07', { expected_post_date: '2026-10-25' });   // Post later (its planned post carries the Post due)
    s.deal_posts.push({ post_id: 'P904080', deal_id: 'D000408', account_id: null, platform: 'TikTok', post_date: null, expected_post_date: '2026-10-25', post_link: null, phase_override: null });
    const c = mk('D000409', 8, 'Cancel', '2026-10-07'); c.status = 'Cancel';
    return s;
  }
  const rowOf = (rows, id, kind) => rows.find(r => (kind ? r.kind === kind : r.kind === 'deal') && r.deal && r.deal.deal_id === id);

  describe('CR-24 §4.1 · the Work queue rows (U1)', () => {
    test('U1: stage → Next action · Waiting on · Due (R.dueDate) · Shortlist and Cancel are not work', () => {
      const s = setup(), rows = R.workQueue(s, { person: 'Amp', campaignIds: ['CMP-0901'], today: TD });
      const got = id => { const r = rowOf(rows, id); return r ? [R.workActionText(r), r.waiting, r.due] : null; };
      assert.equal(got('D000401'), null, 'Shortlist is a list, not work');
      assert.equal(got('D000409'), null, 'Cancel');
      assert.deepEqual(got('D000402'), ['Confirm quotation', 'us', null]);
      assert.deepEqual(got('D000403'), ['Send brief', 'us', null]);
      assert.deepEqual(got('D000404'), ['Script from KOL', 'kol', '2026-10-07']);
      assert.deepEqual(got('D000405'), ['Draft 1 from KOL', 'kol', TD]);
      assert.deepEqual(got('D000406'), ['Draft 2 from KOL', 'kol', '2026-10-11']);
      assert.deepEqual(got('D000407'), ['Approve content', 'us', null]);
      assert.deepEqual(got('D000408'), ['Post from KOL', 'kol', '2026-10-25']);
      rows.filter(r => r.kind === 'deal').forEach(r => assert.equal(r.due, R.dueDate(s, r.deal), r.deal.deal_id + ': the due is R.dueDate\'s'));
      assert.deepEqual([rowOf(rows, 'D000404').field, rowOf(rows, 'D000407').field, rowOf(rows, 'D000403').field], ['expected_script_date', 'expected_approve_date', null], 'what "Set date" fills');
    });
    test('U1: shipments (Ship samples by its Ship by · Confirm delivery) · payments owed now · metrics due · approvals (Admin / KOL Manager only)', () => {
      const s = setup(), d = s.deals.find(x => x.deal_id === 'D000403');
      s.sample_shipments.push(Object.assign(R.newShipment({ id: 'SH904031', deal: d, items: [{ tr_code: 'X', qty: 1 }], shipByDate: '2026-10-09', method: 'npd' }), { campaign_id: 'CMP-0901' }),
        Object.assign(R.newShipment({ id: 'SH904032', deal: d, items: [], status: 'shipped', method: 'warehouse' }), { campaign_id: 'CMP-0901', shipped_date: '2026-10-01' }));
      const admin = user(s, 'admin'), staff = user(s, 'staff');
      const all = R.workQueue(s, { today: TD, viewer: admin }), mine = R.workQueue(s, { today: TD, viewer: staff });
      const ship = all.filter(r => r.kind === 'shipment' && r.campaign_id === 'CMP-0901').map(r => [r.ref.shipment_id, R.workActionText(r), r.waiting, r.due, r.bucket]);
      assert.deepEqual(ship, [['SH904031', 'Ship samples', 'us', '2026-10-09', 'week'], ['SH904032', 'Confirm delivery', 'us', null, 'none']]);
      const pay = all.filter(r => r.kind === 'payment');
      assert.ok(pay.length > 0 && pay.every(r => R.workActionText(r) === 'Pay KOL' && r.waiting === 'us' && ['ready', 'missing_docs'].includes(r.ref.status)));
      assert.deepEqual(all.filter(r => r.kind === 'metrics').length, R.metricsDue(s, {}, TD).length);
      assert.ok(all.filter(r => r.kind === 'metrics').every(r => R.workActionText(r) === 'Enter metrics' && r.due === R.addDays(r.ref.post_date, 7)));
      s.campaigns.push({ campaign_id: 'CMP-0902', campaign_name: 'Waiting', budget_kol: 1000, approval_status: 'pending', approval: { submitted_at: '2026-10-05T03:00:00Z', created_by: 'U006' }, status_override: null });
      const a1 = R.workQueue(s, { today: TD, viewer: admin }).filter(r => r.kind === 'approval'), a2 = R.workQueue(s, { today: TD, viewer: staff }).filter(r => r.kind === 'approval');
      assert.equal(a2.length, 0, 'Staff never see approvals');
      assert.ok(a1.length >= 1 && a1.every(r => R.workActionText(r) === 'Review request' && r.waiting === 'us'));
      assert.ok(mine.every(r => r.kind !== 'approval'));
    });
  });

  describe('CR-24 §4.1–4.3 · due groups · Stuck (U2) · filters (U3)', () => {
    test('U2: Overdue · Today · This week · Later · No due date · Stuck after ops_stuck_days (7) and never when Overdue', () => {
      const s = setup(), rows = R.workQueue(s, { person: 'Amp', campaignIds: ['CMP-0901'], today: TD }), b = id => rowOf(rows, id).bucket;
      assert.deepEqual(['D000404', 'D000405', 'D000406', 'D000408', 'D000402'].map(b), ['overdue', 'today', 'week', 'later', 'none']);
      assert.deepEqual(rows.filter(r => r.kind === 'deal').map(r => r.bucket), rows.filter(r => r.kind === 'deal').map(r => r.bucket).slice().sort((x, y) => R.WORK_BUCKETS.indexOf(x) - R.WORK_BUCKETS.indexOf(y)), 'the order of the groups');
      const st = rowOf(rows, 'D000403');
      assert.deepEqual([st.inStage, st.stuck], [18, true]);
      assert.equal(W.stuck(st.inStage), 'Stuck 18 d');
      const late = Object.assign(s.deals.find(x => x.deal_id === 'D000404'), {}); s.deal_status_log.find(l => l.deal_id === 'D000404').effective_date = '2026-09-01';
      const r2 = rowOf(R.workQueue(s, { person: 'Amp', today: TD }), 'D000404');
      assert.deepEqual([r2.inStage > 7, r2.bucket, r2.stuck], [true, 'overdue', false], 'Overdue is not Stuck');
      s.lookups.ops_stuck_days = 30;
      assert.equal(rowOf(R.workQueue(s, { person: 'Amp', today: TD }), 'D000403').stuck, false, 'Settings › Operations: 30 days');
      assert.equal(R.stuckDaysOf({}), 7);
      assert.deepEqual([R.workBucket(null, TD), R.workBucket('2026-10-15', TD), R.workBucket('2026-10-16', TD)], ['none', 'week', 'later']);
      assert.ok(late);
    });
    test('U3: Assigned to · Campaigns · Waiting on work together (AND)', () => {
      const s = setup(), admin = user(s, 'admin');
      const q = o => R.workQueue(s, Object.assign({ today: TD, viewer: admin }, o));
      const amp = q({ person: 'Amp', campaignIds: ['CMP-0901'] });
      assert.ok(amp.length && amp.every(r => r.pic === 'Amp' && r.campaign_id === 'CMP-0901'));
      const kol = q({ person: 'Amp', campaignIds: ['CMP-0901'], waitingOn: 'kol' });
      assert.deepEqual(kol.map(r => r.deal.deal_id).sort(), ['D000404', 'D000405', 'D000406', 'D000408']);
      assert.ok(q({ person: 'Amp', campaignIds: ['CMP-0901'], waitingOn: 'us' }).every(r => r.waiting === 'us'));
      assert.equal(q({ person: 'Pang', campaignIds: ['CMP-0901'] }).length, 0);
      assert.ok(q({ person: '' }).length > q({ person: 'Amp' }).length);
      assert.ok(q({ person: '__none' }).every(r => !r.pic));
      assert.deepEqual(R.opsCampaignsDefault(s, TD).sort(), ['CH', 'CMP-0901', 'KS', 'PH'], 'the default Campaigns: approved, not Complete');
    });
  });

  describe('CR-24 §4.2 · §4.4–4.6 · Summary · Team load (U4) · Stage flow · Data to fix', () => {
    test('U4: the Summary adds up to the Work queue · Waiting on us by kind · Team load the same numbers per person', () => {
      const s = setup(), rows = R.workQueue(s, { today: TD, viewer: user(s, 'admin') }), sum = R.workSummary(rows);
      assert.equal(sum.total, rows.length);
      assert.equal(sum.overdue, rows.filter(r => r.bucket === 'overdue').length);
      assert.equal(sum.week, rows.filter(r => r.bucket === 'today' || r.bucket === 'week').length);
      assert.equal(sum.none, rows.filter(r => r.bucket === 'none').length);
      assert.equal(sum.us, Object.values(sum.usBy).reduce((a, b) => a + b, 0));
      assert.equal(sum.usBy.payment, rows.filter(r => r.kind === 'payment').length);
      const team = R.teamLoad(s, rows), add = k => team.reduce((a, w) => a + w[k], 0), noApr = rows.filter(r => !r.approver), s2 = R.workSummary(noApr);
      assert.deepEqual([add('overdue'), add('week'), add('none'), add('stuck'), add('us')], [s2.overdue, s2.week, s2.none, s2.stuck, s2.us]);
      assert.ok(team.every((w, i) => !i || team[i - 1].overdue >= w.overdue), 'most overdue first');
      assert.deepEqual(R.WORK_TILES.map(k => rows.filter(r => R.workTileHas(k, r)).length), [sum.overdue, sum.week, sum.none, sum.stuck, sum.us]);
    });
    test('anchor (seed · Amp): 9 open deals — Contacted 1 · Brief 4 · Draft 1 4 · Posted 63 · Cancelled 3 · Brief = Script from KOL · Draft 1 (1 round) = Approve content', () => {
      const s = fresh(), rows = R.workQueue(s, { person: 'Amp', today: TD }), deals = rows.filter(r => r.kind === 'deal'), by = {};
      deals.forEach(r => { by[r.stage] = (by[r.stage] || 0) + 1; });
      assert.deepEqual([deals.length, by], [9, { Contacted: 1, Brief: 4, 'Draft 1': 4 }]);
      assert.ok(deals.filter(r => r.stage === 'Brief').every(r => R.workActionText(r) === 'Script from KOL' && r.waiting === 'kol' && r.bucket === 'none'));
      assert.ok(deals.filter(r => r.stage === 'Draft 1').every(r => R.workActionText(r) === 'Approve content' && r.waiting === 'us'));
      const f = R.stageFlow(s, { person: 'Amp', today: TD });
      assert.deepEqual([f.steps.find(x => x.step.sub_status === 'Brief').n, f.steps.find(x => x.step.sub_status === 'Draft 1').n, f.posted, f.cancelled], [4, 4, 63, 3]);
      assert.deepEqual(f.steps.map(x => x.step.sub_status), ['Shortlist', 'Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Draft 2', 'Draft 3', 'Approve']);
    });
    test('Stage flow: avg days · Stuck · Data to fix: Missing (CR-22) · no Ship by · a post outside its Campaign (CR-23)', () => {
      const s = setup(), f = R.stageFlow(s, { person: 'Amp', campaignIds: ['CMP-0901'], today: TD }), at = k => f.steps.find(x => x.step.sub_status === k);
      assert.deepEqual([at('Confirm QT').n, at('Confirm QT').avg, at('Confirm QT').stuck, at('Shortlist').n], [1, 18, 1, 1]);
      const d = s.deals.find(x => x.deal_id === 'D000403');
      s.sample_shipments.push(Object.assign(R.newShipment({ id: 'SH904033', deal: d, items: [], method: 'npd' }), { campaign_id: 'CMP-0901' }));
      s.deal_posts.push({ post_id: 'P904081', deal_id: 'D000408', account_id: null, platform: 'TikTok', post_date: '2026-10-07', expected_post_date: '2026-10-07', post_link: 'https://www.tiktok.com/@x/video/1', phase_override: null });
      const fix = R.dataToFix(s, { person: 'Amp', campaignIds: ['CMP-0901'], today: TD }), kinds = fix.map(x => x.kind);
      assert.ok(kinds.includes('missing') && kinds.includes('noShipBy') && kinds.includes('postOutside'));
      assert.deepEqual(fix.find(x => x.kind === 'missing' && x.deal.deal_id === 'D000402').keys, ['cta', 'rate_card']);
      assert.equal(fix.find(x => x.kind === 'postOutside').text, 'Post date 07/10 is before this campaign starts (01/11)');
    });
    test('§3 · §4.7 — no Pillar allocation (card · sheet · sum) · Export Operations = Summary + Work queue · the tab is "Operations"', () => {
      assert.equal(R.pillarAllocation, undefined);
      assert.deepEqual(E.TABS.campaign, ['summary_camp', 'activity_camp', 'phasebudget', 'products', 'cancelled', 'workload']);
      assert.deepEqual(E.TABS.ops, ['summary_ops', 'workqueue']);
      const s = setup(), x = { state: s, opts: { person: 'Amp', campaignIds: ['CMP-0901'], today: TD }, picLabel: 'Amp', campLabel: '1 campaign', waitLabel: 'All', today: TD };
      const wq = E.rowsFor('workqueue', x);
      assert.deepEqual(wq.header, ['Section', 'Due', 'KOL', 'Campaign', 'Stage', 'Next action', 'Waiting on', 'In stage', 'Stuck', 'Assigned to']);
      assert.equal(wq.rows.length, R.workQueue(s, x.opts).length);
      assert.equal(C.overview.tabs.ops, 'Operations');
      assert.equal(fresh().lookups.ops_stuck_days, 7, 'put in at load (no schema change)');
    });
  });
});
