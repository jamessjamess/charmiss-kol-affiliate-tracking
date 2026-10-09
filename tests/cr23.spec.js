/* cr23.spec.js — CR-23 test cases (Products given · Cancelled report · Next expected always required / no Expected approve · Ship by set by a
   person · a Post due / Post date outside the Campaign · the Cancel reasons), run by tests/test.html. "today" is 08/10/2026 · the seed after
   migrate · test data is made up: "Campaign Nov - Dec" (01/11–31/12 · Products Test 1, Test 2) · D000374 3decox (Posted · NPD shipment with the old
   ship-by sum 04/10 · Post 1 on 08/10) · D000375 มีเรื่องช้อปกับMemew (Confirm QT · Post due 25/10) · D000323 tack2543 (Shortlist). */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED, E } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const kolBy = (s, n) => s.kol_master.find(k => k.display_name === n);
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const nextLog = s => s.deal_status_log.reduce((m, l) => Math.max(m, Number(l.log_id) || 0), 0) + 1;
  const nextEv = s => s.deal_events.reduce((m, e) => Math.max(m, Number(e.event_id) || 0), 0) + 1;
  const ctx = s => ({ logId: nextLog(s), quoteId: 'Q99999', eventId: nextEv(s), now: new Date(NOW), user: 'U000', shipmentId: () => 'SH900001' });
  /* the made-up Campaign and deals of §5 */
  function setup() {
    const s = fresh();
    ['TEST1', 'TEST2'].forEach((code, i) => s.products.push({ tr_code: code, product_name: `Test ${i + 1}`, variant: null, active: true }));
    s.campaigns.push({ campaign_id: 'CMP-0901', campaign_name: 'Campaign Nov - Dec', budget_kol: 2000000, approval_status: 'approved', status_override: null, cta: null, note: null });
    s.phases.push({ phase_id: 'PHS-0901', campaign_id: 'CMP-0901', label: null, start_date: '2026-11-01', end_date: '2026-12-31', budget_kol: 2000000, approval_status: 'approved' });
    R.setCampaignProducts(s, 'CMP-0901', ['TEST1', 'TEST2']);
    const mk = (id, kol, sub, pic, date) => { const out = R.newDeal(s, { dealId: id, logId: nextLog(s), campaignId: 'CMP-0901', kolId: kolBy(s, kol).kol_id, sub, pic, accountIds: [], postIds: [], date, now: new Date(NOW), user: 'U000' });
      s.deals.push(out.deal); s.deal_status_log.push(out.log); return out.deal; };
    const d74 = mk('D000374', '3decox', 'Post', 'Amp', '2026-10-08');
    Object.assign(d74, { status: 'Complete', rate_card: 1000, payment_term: 'prepaid', pillar: 'Awareness', cta: 'TikTok' });
    s.deal_posts.push({ post_id: 'P903741', deal_id: 'D000374', account_id: null, platform: 'TikTok', post_date: '2026-10-08', expected_post_date: '2026-10-08', post_link: 'https://www.tiktok.com/@3decox/video/1', phase_override: null });
    s.sample_shipments.push(Object.assign(R.newShipment({ id: 'SH903741', deal: d74, items: [{ tr_code: 'TEST1', qty: 1 }], shipBy: '2026-10-04', status: 'to_ship', source: 'move', method: 'npd' }), { purpose: 'review', campaign_id: 'CMP-0901' }));
    const d75 = mk('D000375', 'มีเรื่องช้อปกับMemew', 'Confirm QT', 'Amp', '2026-10-07');
    Object.assign(d75, { rate_card: 5000, payment_term: 'prepaid', pillar: 'Awareness', cta: 'TikTok', expected_post_date: '2026-10-25' });
    s.sample_shipments.push(Object.assign(R.newShipment({ id: 'SH903751', deal: d75, items: [{ tr_code: 'TEST1', qty: 1 }, { tr_code: 'TEST2', qty: 1 }], shipByDate: '2026-10-12', status: 'to_ship', source: 'move', method: 'npd' }), { purpose: 'review', campaign_id: 'CMP-0901' }));
    mk('D000323', 'tack2543', 'Shortlist', 'Amp', '2026-10-08');
    return s;
  }

  describe('CR-23 §3.1 · Products given (U1)', () => {
    test('U1: Test 1 ×2 Warehouse Delivered · Test 1 ×1 NPD To ship · Test 2 ×3 KOL buys own ฿500 Purchased · a cancelled deal · a shipment with no items', () => {
      const d = (id, st) => ({ deal_id: id, kol_id: 'K' + id, campaign_id: 'C1', status: st || 'Inprocess' });
      const deals = [d('A'), d('B'), d('C'), d('D', 'Cancel'), d('E'), { deal_id: 'F', kol_id: 'KF', campaign_id: 'C2', status: 'Inprocess' }];
      const sh = (deal_id, method, status, items, extra) => Object.assign({ shipment_id: 'S' + deal_id, deal_id, kol_id: 'K' + deal_id, method, status, items }, extra || {});
      const ships = [sh('A', 'warehouse', 'delivered', [{ tr_code: 'TEST1', qty: 2 }]), sh('B', 'npd', 'to_ship', [{ tr_code: 'TEST1', qty: 1 }]),
        sh('C', 'self_purchase', 'purchased', [{ tr_code: 'TEST2', qty: 3 }], { purchase_amount: 500 }), sh('D', 'warehouse', 'to_ship', [{ tr_code: 'TEST1', qty: 5 }]),
        sh('E', 'warehouse', 'to_ship', []), sh('F', 'npd', 'delivered', [{ tr_code: 'TEST1', qty: 9 }])];
      const g = R.productsGiven(deals, ships, { campaignId: 'C1' });
      assert.deepEqual([g.total, g.byMethod.npd, g.byMethod.warehouse, g.byMethod.self_purchase, g.reimbursed, g.kols], [6, 1, 2, 3, 500, 3]);
      assert.equal(g.byMethod.npd + g.byMethod.warehouse + g.byMethod.self_purchase, g.total, 'the methods add up to Total');
      assert.deepEqual(g.rows.map(r => [r.tr_code, r.total, r.npd, r.warehouse, r.self_purchase, r.delivered, r.toShip, r.kols]), [['TEST1', 3, 1, 2, 0, 2, 1, 2], ['TEST2', 3, 0, 0, 3, 3, 0, 1]]);
      assert.deepEqual(g.notRecorded, { shipments: 1, kols: 1, delivered: 0, toShip: 1 }, 'Product not recorded');
      assert.ok(!g.rows.some(r => r.total === 5 || r.total === 9), 'the cancelled deal and the other Campaign are not counted');
      ships.push(sh('G', 'npd', 'not_required', [{ tr_code: 'TEST2', qty: 4 }])); deals.push(d('G'));
      assert.equal(R.productsGiven(deals, ships, { campaignId: 'C1' }).total, 6, 'Not required = nothing given');
      assert.deepEqual(R.productsGiven([], [], {}), { total: 0, kols: 0, byMethod: { npd: 0, warehouse: 0, self_purchase: 0 }, reimbursed: 0, rows: [], notRecorded: null, shipments: 0 });
    });
    test('the seed (anchor): Charming Iconic Glow — 48 shipments, none with products recorded (46 KOLs · 46 delivered · 2 to ship) → 0 pieces · no cancelled deals', () => {
      const s = fresh(), g = R.productsGivenFor(s, { campaignId: 'CH' });
      assert.deepEqual([g.total, g.kols, g.shipments, g.rows.length], [0, 0, 48, 0]);
      assert.deepEqual(g.notRecorded, { shipments: 48, kols: 46, delivered: 46, toShip: 2 });
      assert.deepEqual([R.cancelledReportFor(s, { campaignId: 'CH' }).n, R.cancelledReportFor(s, { campaignId: 'PH' }).n], [0, 3]);
      const s2 = setup(), g2 = R.productsGivenFor(s2, { campaignId: 'CMP-0901' });
      assert.deepEqual([g2.total, g2.byMethod.npd, g2.rows.map(r => [r.tr_code, r.total])], [3, 3, [['TEST1', 2], ['TEST2', 1]]]);
      assert.deepEqual(R.productsGivenFor(s2, { campaignId: 'CMP-0901', phaseIds: ['PHS-0901'] }).total, 1, 'the Phase filter: the deals of that Phase (D000375 has no post yet — Unscheduled)');
    });
  });

  describe('CR-23 §3.2 · Next expected (U2) · due (U3)', () => {
    test('U2: Draft k with Draft k+1 in the plan → Expected Draft k+1 required · the last Draft → Post due (no Expected approve) · Approve → Post due required', () => {
      const s = setup(), d = Object.assign(deal(s, 'D000375'), { sub_status: 'Brief', status: 'Inprocess', draft_rounds: 2, expected_draft1_date: '2026-10-12' });
      assert.deepEqual(R.stageRequirements(s, d, 'Draft 1', {}).next, [{ field: 'expected_draft2_date', req: true }]);
      assert.deepEqual(R.checkMove(s, d, 'Draft 1', { date: TD }).errs.map(e => e.msg), ['Enter the expected Draft 2 date']);
      const d1 = Object.assign({}, d, { sub_status: 'Draft 1' });
      const last = R.stageRequirements(s, d1, 'Draft 2', {});
      assert.deepEqual([last.next, last.nextRound], [[{ field: 'expected_post_date', req: false }], { k: 3, on: false }]);
      assert.ok(!('expected_approve_date' in last.fields), 'Expected approve is never asked');
      assert.deepEqual(R.checkMove(s, d1, 'Draft 2', { date: TD, postDue: '2026-10-25' }).errs, [], 'the Post due (filled with the deal\'s) is not required');
      const on = R.stageRequirements(s, d1, 'Draft 2', { nextRound: true });
      assert.deepEqual(on.next, [{ field: 'expected_draft3_date', req: true }], '+ Add Draft 3 round → Expected Draft 3 required');
      assert.deepEqual(R.checkMove(s, d1, 'Draft 2', { date: TD, nextRound: true }).errs.map(e => e.msg), ['Enter the expected Draft 3 date']);
      /* §3.2 the example: D000374-like Draft 1 → Draft 2 ☑ Add Draft 2 to the plan (plan 1) */
      const p1 = Object.assign({}, d1, { draft_rounds: 1 }), add = R.stageRequirements(s, p1, 'Draft 2', { addRound: true });
      assert.deepEqual([add.next, add.nextRound], [[{ field: 'expected_post_date', req: false }], { k: 3, on: false }]);
      const d3 = Object.assign({}, d1, { sub_status: 'Draft 2' }), ap = R.stageRequirements(s, d3, 'Approve', {});
      assert.deepEqual(ap.next, [{ field: 'expected_post_date', req: true }]);
      assert.ok(R.checkMove(s, Object.assign({}, d3, { expected_post_date: null }), 'Approve', { date: TD, postDue: '' }).errs.some(e => e.msg === 'Enter the post due'));
      assert.deepEqual(R.checkMove(s, d3, 'Approve', { date: TD }).errs, [], 'the deal\'s Post due is there');
    });
    test('U3: Approve with no expected date → no due, never Overdue · a shipment is due by ship_by_date only (the old sum is not)', () => {
      const s = setup(), d = Object.assign(deal(s, 'D000375'), { sub_status: 'Draft 1', status: 'Inprocess', draft_rounds: 1 });
      assert.deepEqual([R.dueDate(s, d), R.dueStep(s, d).sub_status, R.isOverdue(s, d, TD)], [null, 'Approve', false]);
      d.expected_approve_date = '2026-10-01';
      assert.deepEqual([R.dueDate(s, d), R.isOverdue(s, d, TD)], ['2026-10-01', true]);
      const sh = R.shipmentsOf(s, 'D000374')[0];
      assert.deepEqual([sh.ship_by, R.shipByDate(sh), R.sampleStatus(sh, TD)], ['2026-10-04', null, 'to_ship'], 'T6: D000374 is not Overdue (its ship by came from the sum)');
      sh.ship_by_date = '2026-10-04';
      assert.equal(R.sampleStatus(sh, TD), 'overdue', 'a date a person set is a due');
      assert.deepEqual(R.sampleDues(s, { campaign: 'CMP-0901' }, TD, 7).map(x => x.due), ['2026-10-12'], 'Due in next 7 days: the ship-by dates set');
      assert.deepEqual(R.shipBySuggest(Object.assign({}, d, { expected_draft1_date: null, expected_post_date: '2026-10-25' }), s.lookups.sample_settings), { date: '2026-10-18', days: 7, from: 'post' }, '"Suggested: 18/10 (7 days before the post due)"');
      assert.equal(C.move.suggested('18/10', 7, 'post'), 'Suggested: 18/10 (7 days before the post due)');
    });
    test('§3.4 Ship by at Confirm QT: required for NPD / Warehouse (no default) · not before the move · after the Draft 1 due warns · Buy by optional', () => {
      const s = setup(), d = deal(s, 'D000323'), f = o => Object.assign({ date: TD, pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000', cta: 'TikTok', ship: Object.assign({ method: 'npd', items: [{ tr_code: 'TEST1', qty: 1 }] }, o) });
      const req = R.stageRequirements(s, d, 'Confirm QT', f({}));
      assert.equal(req.fields.ship_by, 'req');
      assert.ok(R.checkMove(s, d, 'Confirm QT', f({})).errs.some(e => e.field === 'ship_by' && e.msg === 'Enter the ship-by date'));
      assert.ok(R.checkMove(s, d, 'Confirm QT', f({ ship_by: '2026-10-07' })).errs.some(e => e.msg === "Ship by can't be before the move date"));
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', f({ ship_by: '2026-10-15' })).errs, []);
      const late = R.checkMove(s, Object.assign({}, d, { expected_draft1_date: '2026-10-12' }), 'Confirm QT', f({ ship_by: '2026-10-15' }));
      assert.ok(late.warns.some(w => w.msg === 'After the Draft 1 due — the KOL may not have the product in time') && !late.errs.length);
      assert.equal(R.stageRequirements(s, d, 'Confirm QT', f({ method: 'self_purchase' })).fields.ship_by, 'opt', 'Buy by is not required');
      const r = R.applyMove(s, d, 'Confirm QT', f({ ship_by: '2026-10-15' }), ctx(s));
      assert.deepEqual([r.shipment.ship_by_date, r.shipment.ship_by, R.shipByDate(r.shipment)], ['2026-10-15', null, '2026-10-15']);
      assert.deepEqual(r.products, [{ tr_code: 'TEST1', qty: 1 }], '§3.8 #3: a deal with no Products takes the shipment\'s');
      assert.equal(KT_summary(s, r.shipment), 'NPD · Test 1 ×1 · Ship by 15/10');
    });
  });
  /* the one shipment line (screen-samples.js) needs the DOM-free parts only: method · products · Ship by */
  function KT_summary(s, sh) {
    const items = sh.items.map(x => { const p = R.productByCode(s, x.tr_code); return `${p ? R.productShort(p) : x.tr_code} ×${x.qty}`; }).join(', ');
    return C.samples.summary(R.shipMethodLabel(s.lookups, sh.method), items, C.samples.shipByOn(R.dmy(R.shipByDate(sh)).slice(0, 5)));
  }

  describe('CR-23 §3.5 · a Post due / Post date outside the Campaign (U4)', () => {
    test('U4: before / after / between / in a Phase · the Phase falls back to the first / the last · the words', () => {
      const s = setup();
      s.phases = s.phases.filter(p => p.phase_id !== 'PHS-0901').concat([
        { phase_id: 'PHS-0911', campaign_id: 'CMP-0901', label: null, start_date: '2026-11-01', end_date: '2026-11-20', budget_kol: 1000000, approval_status: 'approved' },
        { phase_id: 'PHS-0912', campaign_id: 'CMP-0901', label: null, start_date: '2026-12-01', end_date: '2026-12-31', budget_kol: 1000000, approval_status: 'approved' }]);
      const chk = iso => R.postDateCheck(s, 'CMP-0901', iso);
      assert.deepEqual([chk('2026-10-25').kind, chk('2026-10-25').phase, chk('2026-10-25').start], ['before', 'PHS-0911', '2026-11-01']);
      assert.deepEqual([chk('2027-01-05').kind, chk('2027-01-05').phase, chk('2027-01-05').end], ['after', 'PHS-0912', '2026-12-31']);
      assert.deepEqual([chk('2026-11-25').kind, chk('2026-11-25').phase], ['between', null]);
      assert.deepEqual([chk('2026-11-10').kind, chk('2026-11-10').phase], ['in', 'PHS-0911']);
      assert.equal(chk(null).kind, 'none');
      assert.equal(R.postDateText(chk('2026-10-25'), '2026-10-25'), '25/10 is before this campaign starts (01/11)');
      assert.equal(R.postDateText(chk('2027-01-05'), '2027-01-05'), '05/01 is after this campaign ends (31/12)');
      assert.equal(R.postDateText(chk('2026-11-25'), '2026-11-25', 'Post due'), 'Post due 25/11 falls between phases');
      assert.equal(R.postDateText(chk('2026-11-10'), '2026-11-10'), '');
      const ph = R.phasesOfCampaign(s, 'CMP-0901'), at = d => R.resolvePostPhase({ post_date: null, expected_post_date: d, phase_override: null }, ph);
      assert.deepEqual([at('2026-10-25').phase, at('2026-10-25').fallback, at('2027-01-05').phase, at('2027-01-05').fallback, at('2026-11-25').slot], ['PHS-0911', 'first', 'PHS-0912', 'last', 'needs']);
    });
    test('T6 basis: D000374 — "Post date 08/10 is before this campaign starts (01/11)" (+ Change date · Pick phase) · a picked Phase settles it · D000375 — "Post due 25/10 …" · no Thai', () => {
      const s = setup(), c = R.dealContext(s);
      const w = R.validateDeal(s, deal(s, 'D000374'), R.postsOf(s, 'D000374'), TD, c).warns.filter(x => x.kind === 'post_outside');
      assert.deepEqual(w.map(x => [x.msg, x.post]), [['Post date 08/10 is before this campaign starts (01/11)', 0]]);
      R.postsOf(s, 'D000374')[0].phase_override = 'PHS-0901';
      assert.equal(R.validateDeal(s, deal(s, 'D000374'), R.postsOf(s, 'D000374'), TD, R.dealContext(s)).warns.filter(x => x.kind === 'post_outside').length, 0);
      const w75 = R.validateDeal(s, deal(s, 'D000375'), [], TD, c).warns.filter(x => x.kind === 'post_due_outside');
      assert.deepEqual(w75.map(x => x.msg), ['Post due 25/10 is before this campaign starts (01/11)']);
      const all = R.validateDeal(s, Object.assign({}, deal(s, 'D000375'), { paid_full: true, docs_done: false }), [], TD, c);
      assert.ok(all.warns.some(x => x.msg === "Marked as paid, but documents aren't checked yet"), '§3.8 #7');
      assert.ok(![...all.errs, ...all.warns, ...all.infos].some(x => /[฀-๿]/.test(x.msg)), 'no Thai in the Deal modal\'s bars');
    });
  });

  describe('CR-23 §3.6 · Cancel (U5) · Cancelled report (U6)', () => {
    test('U5: a reason is required · Other needs a Detail · releases the budget · the shipment To ship cancelled when ticked · a package use comes back · the state is not touched (Undo)', () => {
      const s = setup(), d = deal(s, 'D000375');
      assert.deepEqual(R.cancelReasonsOf(s.lookups).map(r => r.key), ['kol_declined', 'price', 'no_response', 'schedule', 'content', 'brand_change', 'other']);
      assert.deepEqual(R.cancelReasonsOf(s.lookups).map(r => r.label), ['KOL declined', 'Price not agreed', 'No response from KOL', "Schedule doesn't fit", 'Content not approved', 'Brand / campaign change', 'Other']);
      assert.deepEqual(R.checkMove(s, d, 'Cancel', { date: TD, cancelReasonKey: '' }).errs.map(e => e.msg), ['Choose a reason']);
      assert.deepEqual(R.checkMove(s, d, 'Cancel', { date: TD, cancelReasonKey: 'other', cancelReason: ' ' }).errs.map(e => e.msg), ['Add a detail — the reason is Other']);
      assert.deepEqual(R.checkMove(s, d, 'Cancel', { date: TD, cancelReasonKey: 'price' }).errs, []);
      const x = R.cancelImpact(s, d);
      assert.deepEqual([x.release, x.toCancel.map(sh => sh.shipment_id), x.kept.length, x.pkg, x.paid], [5000, ['SH903751'], 0, null, null]);
      assert.equal(C.cancel.releases(R.baht(x.release)), 'Releases ฿5,000 from the campaign budget');
      assert.equal(R.cancelImpact(s, deal(s, 'D000323')).release, 0, 'before Confirm QT: nothing to release');
      const before = JSON.stringify(s);
      const r = R.applyMove(s, d, 'Cancel', { date: TD, cancelReasonKey: 'price', cancelReason: 'Asked ฿8,000' }, ctx(s));
      assert.equal(JSON.stringify(s), before, 'nothing changes until the caller applies it — the dialog\'s Undo puts back what it saved');
      assert.deepEqual([r.deal.status, r.deal.cancel_reason_key, r.deal.cancel_reason, r.log.note], ['Cancel', 'price', 'Asked ฿8,000', 'Price not agreed: Asked ฿8,000']);
      assert.deepEqual(r.shipments.map(sh => [sh.shipment_id, sh.status, sh.not_required_reason]), [['SH903751', 'not_required', 'Deal cancelled']]);
      assert.ok(r.events.some(e => e.type === 'sample' && e.to === 'not_required'));
      assert.deepEqual(R.applyMove(s, d, 'Cancel', { date: TD, cancelReasonKey: 'price', cancelShipments: false }, ctx(s)).shipments, [], 'unticked: the shipment stays');
      /* a package deal: the use comes back · money already paid: a warning (never a block) */
      const pk = R.newPackage(s, { kol_id: d.kol_id, name: 'P', units_total: 10, price_total: 20000, start_date: TD }, { now: new Date(NOW), user: 'U000' }); s.kol_packages = (s.kol_packages || []).concat([pk]);
      Object.assign(d, { payment_term: 'package', package_id: pk.package_id, package_units: 2, paid_full: true });
      const left = R.packageRemaining(s, pk), y = R.cancelImpact(s, d);
      assert.deepEqual([y.pkg && y.pkg.units, y.paid], [2, 'paid']);
      s.deals[s.deals.indexOf(d)] = R.applyMove(s, d, 'Cancel', { date: TD, cancelReasonKey: 'kol_declined' }, ctx(s)).deal;
      assert.equal(R.packageRemaining(s, pk), left + 2, 'Returns 2 uses to the package');
      assert.equal(C.cancel.pkgReturns(1), 'Returns 1 use to the package');
      const l = R.applyMove(s, deal(s, 'D000375'), 'Confirm QT', { date: TD, note: 'กลับมาทำต่อ' }, ctx(s)).deal;
      assert.deepEqual([l.cancel_reason, l.cancel_reason_key], [null, null], 'leaving Cancel clears both');
    });
    test('U6: the stage when it was cancelled (from the log) · Value only past Confirm QT · a count a reason · a deal cancelled before CR-23 = Other · newest first', () => {
      const s = setup(), go = (id, key, detail, date) => { const r = R.applyMove(s, deal(s, id), 'Cancel', { date, cancelReasonKey: key, cancelReason: detail }, ctx(s));
        s.deals[s.deals.indexOf(deal(s, id))] = r.deal; r.logs.forEach(x => s.deal_status_log.push(x)); };
      go('D000375', 'content', '', '2026-10-06'); go('D000323', 'no_response', 'Line read, no reply', '2026-10-07');
      const old = s.deals.find(x => x.deal_id === 'D000374'); Object.assign(old, { status: 'Cancel', sub_status: 'Cancel', cancel_reason: 'ไม่ตอบ', cancel_reason_key: null });
      const x = R.cancelledReport(s.deals, s.deal_status_log, { campaignId: 'CMP-0901', lookups: s.lookups });
      assert.deepEqual(x.rows.map(r => [r.deal.deal_id, r.stage, r.date, r.label, r.detail, r.value]), [['D000323', 'Shortlist', '2026-10-07', 'No response from KOL', 'Line read, no reply', null],
        ['D000375', 'Confirm QT', '2026-10-06', 'Content not approved', null, 5000], ['D000374', null, null, 'Other', 'ไม่ตอบ', null]]);
      assert.deepEqual([x.n, x.released], [3, 5000]);
      assert.deepEqual(x.reasons.map(r => [r.label, r.n]), [['Content not approved', 1], ['No response from KOL', 1], ['Other', 1]]);
      assert.equal(C.overview.cancelledLine(3, R.baht(5000)), '3 cancelled · ฿5,000 released');
      const sheet = E.rowsFor('cancelled', { state: s, campaignId: 'CMP-0901', phaseId: '', today: TD });
      assert.deepEqual([sheet.name, sheet.header.length, sheet.rows.length, sheet.total[6]], ['Cancelled', 8, 3, 5000]);
      assert.equal(E.rowsFor('products', { state: s, campaignId: 'CMP-0901', phaseId: '', today: TD }).name, 'Products given');
    });
    test('the default reasons are put in at load (no schema change) · a new one sits before Other', () => {
      const s = fresh();
      assert.equal(s.schema_version, 21);
      assert.equal(s.lookups.cancel_reasons.length, 7);
      const v = JSON.parse(JSON.stringify(s)); delete v.lookups.cancel_reasons;
      assert.equal(S.migrate(v, new Date(NOW)).lookups.cancel_reasons.length, 7);
      s.lookups.cancel_reasons.splice(6, 0, { key: 'r1', label: 'Went with a competitor', active: true });
      assert.deepEqual(R.cancelReasonsOf(s.lookups).slice(-2).map(r => r.key), ['r1', 'other']);
      assert.equal(R.cancelReasonLabel(s.lookups, null), 'Other');
    });
  });
});
