/* cr20.spec.js — CR-20 test cases (New deal From KOL Master / New KOL · Worked in · Deal modal · Move stage by target (stageRequirements) ·
   Payment term Package · Costs at Confirm QT · Brief / Script link · Draft notes · Draft → Post · Next expected · schema 19), run by tests/test.html.
   "today" is 08/10/2026 · the seed after migrate v19 · test data is made up (the "D000324" of the spec = a new Shortlist deal of 07_liuliuly). */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, E, SEED } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const nextLog = s => s.deal_status_log.reduce((m, l) => Math.max(m, l.log_id), 0) + 1;
  const nextEv = s => s.deal_events.reduce((m, e) => Math.max(m, Number(e.event_id) || 0), 0) + 1;
  const thai = v => /[ก-ฺเ-๛]/.test(String(v || ''));   // Thai letters (the ฿ sign is fine)
  /* a new Shortlist deal in Charming (07_liuliuly · no pillar · no term · no rate) — the spec's D000324 */
  function shortlistDeal(s, kolId = 'K0715') {
    const id = 'D' + String(s.deals.length + 900).padStart(6, '0');
    const out = R.newDeal(s, { dealId: id, logId: nextLog(s), campaignId: 'CH', kolId, sub: 'Shortlist', pic: 'Pang', accountIds: [], postIds: [], date: TD, now: new Date(NOW), user: 'U000' });
    s.deals.push(out.deal); s.deal_status_log.push(out.log);
    return out.deal;
  }
  /* a move the way the dialog does it (state changed, like screen-move.js apply) */
  function move(s, d, to, f) {
    let pn = 900000;
    const r = R.applyMove(s, d, to, Object.assign({ date: TD, today: TD }, f || {}), { logId: nextLog(s), quoteId: 'Q99999', eventId: nextEv(s), now: new Date(NOW), user: 'U000', postId: () => 'P' + pn++ });
    s.deals[s.deals.indexOf(d)] = r.deal; r.logs.forEach(l => s.deal_status_log.push(l)); r.events.forEach(e => s.deal_events.push(e));
    if (r.quote) s.kol_rate_quotes.push(r.quote);
    if (r.posts) s.deal_posts = s.deal_posts.filter(p => p.deal_id !== d.deal_id).concat(r.posts);
    if (r.note) R.putStepNote(s, r.note);
    R.syncPackages(s);
    return r;
  }
  const pkgOf = (s, o) => { const p = R.newPackage(s, Object.assign({ kol_id: 'K0094', name: '10 posts · ฿20,000', units_total: 10, price_total: 20000, start_date: TD }, o || {}), { now: new Date(NOW), user: 'U000' }); s.kol_packages.push(p); return p; };
  const ctxPay = s => { let e = 0, ln = 0; return { lineId: () => 'PL-' + String((s.payment_lines.length + 1 + ln++)).padStart(6, '0'), eventId: () => 9000 + e++, now: NOW, user: 'U000' }; };
  const committed = (s, cid) => R.dealContext(s).committedByCampaign.get(cid) || 0;

  describe('CR-20 §3 · schema 19', () => {
    test('TC-31: a schema 18 file → 19 · kol_packages · step_notes · deals package_id / package_units / script_link · Package is a payment term · the money anchors stay', () => {
      const v18 = JSON.parse(JSON.stringify(fresh()));
      v18.schema_version = 18; delete v18.kol_packages; delete v18.step_notes;
      v18.deals.forEach(d => { delete d.package_id; delete d.package_units; delete d.script_link; delete d.package_paid; });
      const s = S.migrate(v18, new Date(NOW));
      assert.equal(s.schema_version, 19); assert.equal(S.SCHEMA_VERSION, 19);
      assert.deepEqual(s.kol_packages, []); assert.deepEqual(s.step_notes, []);
      assert.ok(s.deals.every(d => d.package_id === null && d.package_units === 1 && d.script_link === null && d.package_paid === false));
      assert.ok(R.PAYMENT_TERMS.includes('package') && R.isTerm('package') && !R.BASIC_TERMS.includes('package'));
      assert.equal(C.term.package, 'Package');
      const k = R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
      assert.equal(Math.round(k.money.committed), 1783579); assert.equal(Math.round(k.paid.paid), 774579); assert.equal(Math.round(k.money.pending), 98000);
      assert.equal(committed(s, 'CH'), 863700, 'Charming committed ฿863,700 → remaining −฿13,700');
      const again = S.migrate(JSON.parse(JSON.stringify(s)), new Date(NOW));
      assert.equal(again.schema_version, 19, 'twice = the same');
    });
    test('Backup carries the packages and the notes (the images only with Include photos & draft images)', () => {
      const s = fresh(); pkgOf(s);
      R.putStepNote(s, R.stepNoteRecord('D000099', 'draft_1', { note: 'cut 2s', links: ['https://drive.example/x'], image_ids: ['IMG1'] }, { now: new Date(NOW), user: 'U000' }));
      const back = S.migrate(JSON.parse(JSON.stringify(s)), new Date(NOW));
      assert.equal(back.kol_packages.length, 1); assert.equal(back.step_notes.length, 1);
      assert.ok(S.COLLECTIONS.includes('kol_packages') && S.COLLECTIONS.includes('step_notes'));
      assert.equal(C.data.includePhotos, 'Include photos & draft images');
    });
  });

  describe('CR-20 §4.2–4.3 · From KOL Master · Worked in', () => {
    const base = { q: '', platform: '', tier: '', type: '', category: '', owner: '', status: '', lastWorked: '', perf: '', workedIn: [], postedOnly: false, notIn: false };
    test('TC-02: Worked in Kiss Signal + Not in this campaign yet → 66 KOLs · + Posted only → 57', () => {
      const s = fresh();
      const f = Object.assign({}, base, { workedIn: ['KS'], notIn: true });
      assert.equal(R.kolPickerFilter(s, f, 'CH', TD).length, 66);
      assert.equal(R.kolPickerFilter(s, Object.assign({}, f, { postedOnly: true }), 'CH', TD).length, 57);
      assert.ok(R.kolPickerFilter(s, f, 'CH', TD).every(r => !r.inCamp));
      assert.deepEqual(R.pickerActive(f), ['workedIn', 'notIn'], 'Worked in counts for Clear all filters');
    });
    test('TC-03: genygee28 — Rate = ฿3,000 (Latest) · Avg ฿5,000', () => {
      const s = fresh(), ref = R.costReference(s, 'K0011');
      assert.equal(ref.latest.values.rate_card, 3000); assert.equal(ref.average.total, 5000);
    });
    test('TC-04 / TC-05: three deals with a rate and Post due 25/10 → Shortlist · rate_card · expected_post_date · the post in Phase 2 (Auto by post date)', () => {
      const s = fresh(), ids = ['K0715', 'K0425', 'K0011'];
      ids.forEach((kolId, i) => {
        const acc = R.accountsOfKol(s, kolId)[0];
        const out = R.newDeal(s, { dealId: 'D' + (990000 + i), logId: nextLog(s), campaignId: 'CH', kolId, sub: 'Shortlist', pic: 'Pang', prefill: { rate_card: 3000, expected_post_date: '2026-10-25' },
          accountIds: [acc.account_id], postIds: ['P99' + i], phaseOverrides: [null], date: TD, now: new Date(NOW), user: 'U000' });
        s.deals.push(out.deal); s.deal_status_log.push(out.log); out.posts.forEach(p => s.deal_posts.push(p));
      });
      const made = s.deals.filter(d => d.deal_id >= 'D990000');
      assert.equal(made.length, 3);
      assert.ok(made.every(d => d.sub_status === 'Shortlist' && d.rate_card === 3000 && d.expected_post_date === '2026-10-25'));
      assert.equal(s.deal_posts.find(p => p.post_id === 'P990').expected_post_date, '2026-10-25', 'the post planned on the Post due');
      const ph = R.resolvePostPhase({ expected_post_date: '2026-10-20', post_date: null, phase_override: null }, R.phasesOfCampaign(s, 'CH'));   // TC-04: Post due 20/10
      assert.equal(ph.phase, 'CH-P2'); assert.equal(R.phaseName(s, 'CH-P2'), 'Phase 2 · Charmiss X Fourth');
    });
    test('TC-06 / TC-30: Start at Confirm QT — the rows without a rate / term are found by the same rule (R.checkMove on the deal it would make)', () => {
      const s = fresh(), pseudo = kolId => Object.assign(JSON.parse(JSON.stringify(R.DEAL_TEMPLATE)), { kol_id: kolId, campaign_id: 'CH', pillar: 'Awareness' });
      const rows = ['K0715', 'K0425'].map(k => R.checkMove(s, pseudo(k), 'Confirm QT', { date: TD, pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '' }).errs.map(e => e.field));
      assert.deepEqual(rows, [['rate_card'], ['rate_card']]);
      assert.equal(C.bulk.rowsNeed(2, C.bulk.needRate), '2 rows need a rate');
      assert.deepEqual(R.checkMove(s, pseudo('K0715'), 'Confirm QT', { date: TD, pillar: 'Awareness', paymentTerm: '', rateCard: '3000' }).errs.map(e => e.field), ['payment_term']);
      assert.deepEqual(R.checkMove(s, pseudo('K0715'), 'Contacted', { date: TD }).errs, [], 'Contacted: Rate / term optional');
      assert.deepEqual(R.checkMove(s, pseudo('K0715'), 'Shortlist', { date: TD }).errs, []);
    });
    test('TC-07: the budget words are English · no Thai in the New deal / Move stage messages', () => {
      assert.equal(C.msg.campaignOver('฿13,700'), 'Adding this will exceed the campaign KOL budget by ฿13,700');
      const keys = ['movePillarRequired', 'moveTermRequired', 'moveRateRequired', 'moveGencodeDays', 'movePostLink', 'moveExpectedDraft1', 'moveExpectedBefore', 'linkHttps', 'moveBackNote', 'moveCancelReason',
        'moveSame', 'moveDateRequired', 'moveNoPosts', 'pillarRequired', 'termRequired', 'dealPicRequired', 'kolNameRequired', 'packageRequired', 'packageUnits'];
      keys.forEach(k => assert.ok(!thai(C.msg[k]), k));
      ['moveLeaveCancelOnly', 'movePostsIncomplete', 'moveDraftNotInPlan', 'moveStepsOrder', 'packageNotEnough', 'accPlatform', 'accLink', 'accFollowers', 'dealMoney', 'dateInvalid', 'moveExpectedAfterDue'].forEach(k => assert.ok(!thai(C.msg[k]('x', 'y')), k));
      Object.values(C.move).forEach(v => assert.ok(!thai(typeof v === 'function' ? v(1, 2) : typeof v === 'object' ? JSON.stringify(v) : v)));
      Object.values(C.bulk).filter(v => typeof v === 'string').forEach(v => assert.ok(!thai(v), v));
      assert.equal(C.bulk.tabMaster, 'From KOL Master'); assert.equal(C.bulk.tabNewKol, 'New KOL'); assert.equal(C.bulk.kolOwner, 'KOL owner'); assert.equal(C.bulk.assignTo, 'Assign to');
      assert.equal(C.deal.f.pic, 'Assigned to'); assert.equal(C.deal.pic, 'Assigned to');
      assert.equal(C.bulk.tabSingle, undefined); assert.equal(C.bulk.tabBulk, undefined); assert.equal(C.deal.addingTo, undefined, 'no "Adding to …" line'); assert.equal(C.bulk.addN, undefined, 'no "Add n to shortlist"');
    });
    test('TC-08: New KOL with a name already in KOL Master → findDuplicateKol (Use this KOL)', () => {
      const s = fresh(), dup = R.findDuplicateKol(s, 'genygee28', '');
      assert.equal(dup.kol.kol_id, 'K0011');
    });
    test('TC-09: a new KOL needs a name and, per account, link · platform · handle · followers (R.validateKol)', () => {
      const s = fresh(), r = R.validateKol(s, { kol_id: null, display_name: '', accounts: [{ account_id: null, platform: '', handle: '', profile_link: '', followers: '' }] });
      const f = r.errs.map(e => e.field);
      ['display_name', 'acc0_platform', 'acc0_handle', 'acc0_profile_link', 'acc0_followers'].forEach(k => assert.ok(f.includes(k), k));
      assert.ok(r.errs.every(e => !thai(e.msg)));
    });
  });

  describe('CR-20 §4.7 · stageRequirements — the one rule', () => {
    test('TC-17: Shortlist → Contacted — Date only · Rate and Payment term optional', () => {
      const s = fresh(), d = shortlistDeal(s), q = R.stageRequirements(s, d, 'Contacted', {});
      assert.equal(q.kind, 'forward'); assert.equal(q.fields.date, 'req'); assert.equal(q.fields.rate_card, 'opt'); assert.equal(q.fields.payment_term, 'opt'); assert.ok(!q.fields.pillar);
      assert.deepEqual(R.checkMove(s, d, 'Contacted', { date: TD }).errs, []);
      assert.equal(R.dropPlan(s, d, 'Contacted', TD).kind, 'instant', 'an optional step on the way, nothing to fill');
    });
    test('TC-18: → Confirm QT with nothing → Pillar · Payment term · Rate card (English) · Move is never blocked by the rule itself (errors after Move = the screen)', () => {
      const s = fresh(), d = shortlistDeal(s), r = R.checkMove(s, d, 'Confirm QT', { date: TD });
      assert.deepEqual(r.errs.map(e => e.field), ['pillar', 'payment_term', 'rate_card']);
      assert.deepEqual(r.errs.map(e => e.msg), ['Choose a pillar to move to Confirm QT or later', 'Choose a payment term to move to Confirm QT or later', 'Enter the rate card to move to Confirm QT or later']);
      assert.equal(R.dropPlan(s, d, 'Confirm QT', TD).kind, 'dialog');
    });
    test('TC-19: → Confirm QT · Awareness · Prepaid · Rate card 3,000 · Post due 20/10 → Total ฿3,000 · remaining −฿13,700 → −฿16,700 · Undo = the deal as before', () => {
      const s = fresh(), d = shortlistDeal(s), before = JSON.stringify(d);
      const f = { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000', postDue: '2026-10-20' };
      assert.deepEqual(R.moveBudget(s, d, 'Confirm QT', f), { before: -13700, after: -16700, total: 3000 });
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f)).errs, []);
      const r = move(s, d, 'Confirm QT', f), nd = deal(s, d.deal_id);
      assert.equal(nd.sub_status, 'Confirm QT'); assert.equal(nd.rate_card, 3000); assert.equal(R.totalCost(nd), 3000); assert.equal(nd.expected_post_date, '2026-10-20');
      assert.equal(nd.pillar, 'Awareness'); assert.equal(nd.payment_term, 'prepaid');
      assert.ok(r.events.some(e => e.type === 'pillar') && r.events.some(e => e.type === 'payment_term'));
      assert.equal(committed(s, 'CH'), 866700);
      assert.equal(JSON.parse(before).sub_status, 'Shortlist', 'the input deal is not changed (Undo puts this copy back)');
    });
    test('TC-20: babyjeno_2 (Contacted · Rate 2,300) → Confirm QT: only Pillar (+ term) asked · the rate is there', () => {
      const s = fresh(), d = deal(s, 'D000099');
      d.payment_term = 'prepaid';
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TD }).errs.map(e => e.field), ['pillar']);
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TD, pillar: 'Consideration' }).errs, []);
    });
    test('a deal past Confirm QT with something missing (imported) must fill it to go forward · back only needs a note', () => {
      const s = fresh(), d = s.deals.find(x => x.sub_status === 'Brief' && R.isBlank(x.pillar));
      const q = R.stageRequirements(s, d, 'Script', {});
      assert.ok(q.qt, 'the Confirm QT details are asked');
      assert.ok(R.checkMove(s, d, 'Script', { date: TD }).errs.some(e => e.field === 'pillar'));
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TD, note: 'redo' }).errs, []);
    });
  });

  describe('CR-20 §4.11 · Costs at Confirm QT', () => {
    test('TC-32: Rate card 3,000 + Gencode 1,000 without days → "Enter how many days the Gencode runs" · 30 days + Asset 500 → Total ฿4,500 · −฿13,700 → −฿18,200', () => {
      const s = fresh(), d = shortlistDeal(s), f = { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000', costs: { gencode_expense: '1000', gencode_period: '' } };
      const r = R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f));
      assert.deepEqual(r.errs.map(e => e.msg), ['Enter how many days the Gencode runs']);
      Object.assign(f.costs, { gencode_period: '30', asset_fee: '500', expediting_fee: '0' });
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f)).errs, []);
      assert.deepEqual(R.moveBudget(s, d, 'Confirm QT', f), { before: -13700, after: -18200, total: 4500 });
      move(s, d, 'Confirm QT', Object.assign({ postDue: '2026-10-20' }, f));
      const nd = deal(s, d.deal_id);
      assert.equal(R.totalCost(nd), 4500); assert.equal(nd.gencode_period, 30); assert.equal(nd.gencode_start_date, '2026-10-20', 'Gencode start = Post due when left empty');
    });
    test('TC-33: Rate card empty → cannot move · 0 → can (Total = the other costs) · Free needs no rate', () => {
      const s = fresh(), d = shortlistDeal(s), f = { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '', costs: { asset_fee: '500' } };
      assert.ok(R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f)).errs.some(e => e.msg.startsWith('Enter the rate card')));
      f.rateCard = '0';
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f)).errs, []);
      assert.equal(R.moveBudget(s, d, 'Confirm QT', f).total, 500);
      assert.equal(R.stageRequirements(s, d, 'Confirm QT', { paymentTerm: 'free' }).fields.rate_card, 'opt');
    });
  });

  describe('CR-20 §4.8 · Payment term Package', () => {
    test('TC-21: babyjeno_2 "10 posts · ฿20,000" → unit ฿2,000 · Active · Remaining 10 · Payments: one row ฿20,000 To pay', () => {
      const s = fresh(), p = pkgOf(s);
      assert.equal(p.package_id, 'PKG000001'); assert.equal(R.unitPrice(p), 2000);
      assert.equal(R.packageStatus(s, p, TD), 'active'); assert.equal(R.packageRemaining(s, p), 10);
      const row = R.payQueue(s, TD).items.find(x => x.package_id === p.package_id);
      assert.equal(row.agreed, 20000); assert.equal(row.milestone, 'package'); assert.equal(row.project_label, 'Package · babyjeno_2 · 10 posts'); assert.equal(R.packagePayStatus(s, p), 'to_pay');
      assert.deepEqual(R.validatePackage(s, { kol_id: 'K0094', name: '', units_total: '0', price_total: '', start_date: TD }).errs.map(e => e.field), ['name', 'units_total', 'price_total']);
    });
    test('TC-22: D000099 → Confirm QT with the package → Rate locked ฿2,000 · Remaining 9 · Committed +฿2,000 · no row of its own · Package not paid yet', () => {
      const s = fresh(), p = pkgOf(s), d = deal(s, 'D000099'), before = committed(s, 'CH');
      const f = { pillar: 'Awareness', paymentTerm: 'package', packageId: p.package_id, packageUnits: '1' };
      assert.equal(R.stageRequirements(s, d, 'Confirm QT', f).fields.rate_card, 'auto');
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', Object.assign({ date: TD }, f)).errs, []);
      move(s, d, 'Confirm QT', f);
      const nd = deal(s, 'D000099');
      assert.equal(nd.rate_card, 2000); assert.equal(nd.package_id, p.package_id); assert.equal(R.packageRemaining(s, p), 9);
      assert.equal(committed(s, 'CH') - before, 2000);
      assert.deepEqual(R.dueLines(s, nd, TD), [], 'paid with the package — no instalment of its own');
      assert.equal(nd.package_paid, false); assert.equal(R.paymentState(nd, TD), 'not_due');
      assert.equal(R.fieldEditable(s, nd, 'rate_card', s.users[0]).editable, false, 'the rate card is the package\'s');
    });
    test('TC-23: Cancel D000099 → Remaining back to 10 · TC-24: a used-up package blocks · not offered', () => {
      const s = fresh(), p = pkgOf(s, { units_total: 1, name: '1 post · ฿2,000', price_total: 2000 }), d = deal(s, 'D000099');
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'package', packageId: p.package_id, packageUnits: '1' });
      assert.equal(R.packageRemaining(s, p), 0); assert.equal(R.packageStatus(s, p, TD), 'used_up');
      const other = shortlistDeal(s, 'K0094');
      const r = R.checkMove(s, other, 'Confirm QT', { date: TD, pillar: 'Awareness', paymentTerm: 'package', packageId: p.package_id, packageUnits: '1' });
      assert.ok(r.errs.some(e => e.msg === 'Not enough left in this package (0 left) — choose another payment term or add a package'));
      assert.ok(!R.packageChoices(s, 'K0094', TD, other).some(x => x.pkg.package_id === p.package_id), 'not in the list');
      move(s, deal(s, 'D000099'), 'Cancel', { cancelReason: 'KOL busy' });
      assert.equal(R.packageRemaining(s, p), 1); assert.equal(R.packageStatus(s, p, TD), 'active');
    });
    test('TC-25: Mark paid the package row → the deals using it are Paid via package · Dashboard Paid +2,000 · Prepaid package balance = the posts not used', () => {
      const s = fresh(), p = pkgOf(s), d = deal(s, 'D000099');
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'package', packageId: p.package_id, packageUnits: '1' });
      const k0 = R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
      const row = R.payQueue(s, TD).items.find(x => x.package_id === p.package_id);
      R.markItemsPaid(s, [row], { date: TD, ref: 'TT-1' }, ctxPay(s)); R.syncPackages(s, { eventId: () => 9100, now: new Date(NOW), user: 'U000' });
      assert.equal(R.packagePayStatus(s, p), 'paid'); assert.equal(p.payment_status, 'paid'); assert.equal(p.paid_date, TD);
      const nd = deal(s, 'D000099');
      assert.equal(nd.package_paid, true); assert.equal(R.paymentState(nd, TD), 'paid'); assert.equal(R.paidEstimate(nd), 2000);
      const k1 = R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
      assert.equal(Math.round(k1.paid.paid - k0.paid.paid), 2000);
      assert.equal(R.packageBalance(s), 18000, '9 posts × ฿2,000 not used yet');
      assert.ok(!R.payQueue(s, TD).items.some(x => x.package_id === p.package_id), 'paid → not in To pay');
    });
    test('TC-34: Package + Asset 500 → Rate ฿2,000 · Total ฿2,500 · its own row ฿500 (extras, owed at Confirm QT)', () => {
      const s = fresh(), p = pkgOf(s), d = deal(s, 'D000099');
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'package', packageId: p.package_id, packageUnits: '1', costs: { asset_fee: '500' } });
      const nd = deal(s, 'D000099');
      assert.equal(R.totalCost(nd), 2500); assert.equal(R.extrasOf(nd), 500);
      const lines = R.dueLines(s, nd, TD);
      assert.deepEqual(lines.map(l => [l.milestone, l.amount, l.reached]), [['extras', 500, true]]);
      assert.equal(C.pkg.plusExtras(R.baht(2000), R.baht(500)), 'Package ฿2,000 + extras ฿500');
    });
    test('Export › Packages: KOL · Name · Posts · Price · Unit price · Used · Remaining · Status · Payment — no personal data', () => {
      const s = fresh(); pkgOf(s);
      const t = E.rowsFor('packages', { state: s, today: TD });
      assert.deepEqual(t.header, ['KOL', 'Name', 'Posts', 'Price', 'Unit price', 'Used', 'Remaining', 'Status', 'Payment']);
      assert.deepEqual(t.rows[0], ['babyjeno_2', '10 posts · ฿20,000', 10, 20000, 2000, 0, 10, 'Active', 'To pay']);
    });
  });

  describe('CR-20 §4.9 · moves over many steps · drag', () => {
    test('TC-26: Shortlist → Brief: the steps completed by the move = Confirm QT · Brief (Contacted offered, not asked) · the Confirm QT details needed', () => {
      const s = fresh(), d = shortlistDeal(s), q = R.stageRequirements(s, d, 'Brief', {});
      assert.deepEqual(q.skipped.map(x => x.sub_status), ['Confirm QT']);
      assert.equal(q.contacted.sub_status, 'Contacted');
      assert.ok(q.qt && q.crossesQt);
      assert.equal(R.dropPlan(s, d, 'Brief', TD).kind, 'dialog');
    });
    test('TC-27: a Confirm QT date after the Brief date → order error · fixed → both logged on their dates', () => {
      const s = fresh(), d = shortlistDeal(s);
      const f = { date: '2026-10-07', pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000', steps: { 'Confirm QT': '2026-10-08' }, expected: { expected_draft1_date: '2026-10-15' } };
      assert.ok(R.checkMove(s, d, 'Brief', f).errs.some(e => e.field === 'date' && e.msg === C.msg.moveDateBeforeSteps));
      f.steps['Confirm QT'] = '2026-10-06';
      assert.deepEqual(R.checkMove(s, d, 'Brief', f).errs, []);
      const r = move(s, d, 'Brief', f);
      assert.deepEqual(r.logs.map(l => [l.sub_status, l.effective_date]), [['Confirm QT', '2026-10-06'], ['Brief', '2026-10-07']]);
      assert.equal(deal(s, d.deal_id).brief_date, '2026-10-07');
      assert.ok(R.checkMove(s, shortlistDeal(s), 'Brief', Object.assign({}, f, { steps: { 'Confirm QT': '2026-10-09' }, date: '2026-10-09' })).errs.some(e => e.msg === C.msg.moveStepFuture('Confirm QT')), 'not in the future');
    });
    test('TC-28 / TC-43: Confirm QT (complete) → Brief straight away when Expected Draft 1 is there · opens the dialog when it is not', () => {
      const s = fresh(), d = shortlistDeal(s);
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000' });
      assert.equal(R.dropPlan(s, deal(s, d.deal_id), 'Brief', TD).kind, 'dialog', 'TC-43: no Expected Draft 1');
      deal(s, d.deal_id).expected_draft1_date = '2026-10-15';
      assert.equal(R.dropPlan(s, deal(s, d.deal_id), 'Brief', TD).kind, 'instant', 'TC-28');
    });
    test('TC-29: Shortlist → Post: the same dialog with Post (link · date) + the Confirm QT details + the steps passed', () => {
      const s = fresh(), d = shortlistDeal(s), q = R.stageRequirements(s, d, 'Post', {});
      assert.ok(q.post && q.approve && q.qt);
      assert.deepEqual(q.skipped.map(x => x.sub_status), ['Confirm QT', 'Brief', 'Script', 'Draft 1']);
      assert.equal(R.dropPlan(s, d, 'Post', TD).kind, 'dialog', 'no longer blocked by the missing link — the dialog asks for it');
    });
  });

  describe('CR-20 §4.12–4.14 · links · Draft notes · Draft → Post', () => {
    test('TC-35: → Brief with a Brief link · → Script with a Script link · a link without https → "Use a link that starts with https://"', () => {
      const s = fresh(), d = shortlistDeal(s);
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000' });
      const f = { expected: { expected_draft1_date: '2026-10-15' }, linkBrief: 'www.x.com' };
      assert.ok(R.checkMove(s, deal(s, d.deal_id), 'Brief', Object.assign({ date: TD }, f)).errs.some(e => e.field === 'link_brief' && e.msg === 'Use a link that starts with https://'));
      f.linkBrief = 'https://www.x.com/brief';
      move(s, deal(s, d.deal_id), 'Brief', f);
      move(s, deal(s, d.deal_id), 'Script', { scriptLink: 'https://www.x.com/script' });
      const nd = deal(s, d.deal_id);
      assert.equal(nd.link_brief, 'https://www.x.com/brief'); assert.equal(nd.script_link, 'https://www.x.com/script');
    });
    test('TC-36 / TC-37: → Draft 1 with a note, 2 links, 3 images → 📎 2 · 🖼 3 · a 7th image refused · edit later (an image less) → 🖼 2 · step_note_updated', () => {
      const s = fresh(), d = shortlistDeal(s);
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000' });
      move(s, deal(s, d.deal_id), 'Brief', { expected: { expected_draft1_date: '2026-10-15' } });
      move(s, deal(s, d.deal_id), 'Script', {});
      const notes = { note: 'hook first 3s', links: ['https://drive.example/a', 'https://drive.example/b'], image_ids: ['IMG1', 'IMG2', 'IMG3'] };
      const r = move(s, deal(s, d.deal_id), 'Draft 1', { notes });
      const n = R.stepNoteOf(s, d.deal_id, 'draft_1');
      assert.deepEqual(R.noteCounts(n), { links: 2, images: 3 }); assert.equal(C.notes.counts(2, 3), '📎 2 · 🖼 3');
      assert.ok(r.events.some(e => e.type === 'step_note_updated'));
      assert.ok(R.validateStepNote({ note: '', links: [], image_ids: ['1', '2', '3', '4', '5', '6', '7'] }).errs.some(e => e.msg === C.msg.noteImagesMax(6)));
      const rec = R.stepNoteRecord(d.deal_id, 'draft_1', Object.assign({}, n, { image_ids: ['IMG1', 'IMG3'], note: 'hook first 2s' }), { now: new Date(NOW), user: 'U000' });
      const before = R.putStepNote(s, rec), ev = R.stepNoteEvent(d.deal_id, 'draft_1', before, rec, { eventId: 1, now: new Date(NOW), user: 'U000' });
      assert.deepEqual(R.noteCounts(R.stepNoteOf(s, d.deal_id, 'draft_1')), { links: 2, images: 2 });
      assert.equal(ev.type, 'step_note_updated'); assert.deepEqual([ev.from.images, ev.to.images], [3, 2]);
      move(s, deal(s, d.deal_id), 'Script', { note: 'back' });
      assert.ok(R.stepNoteOf(s, d.deal_id, 'draft_1'), 'moving back keeps the notes');
    });
    test('TC-38 / TC-39 / TC-40: Draft 1 (plan 3) → Post: Draft 2 / 3 Not needed · Approve date · Posted link · Post date — no link → error · Post before Approve → error · done → plan 1', () => {
      const s = fresh(), d = shortlistDeal(s);
      move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000' });
      move(s, deal(s, d.deal_id), 'Brief', { expected: { expected_draft1_date: '2026-10-15' } });
      move(s, deal(s, d.deal_id), 'Script', {});
      deal(s, d.deal_id).draft_rounds = 3;
      move(s, deal(s, d.deal_id), 'Draft 1', {});
      const cur = deal(s, d.deal_id), q = R.stageRequirements(s, cur, 'Post', {});
      assert.deepEqual(q.drafts, [2, 3]); assert.ok(q.approve && q.post);
      const acc = R.accountsOfKol(s, cur.kol_id)[0].account_id;
      const f = { drafts: { 2: 'not_needed', 3: 'not_needed' }, approveDate: TD, posts: [{ post_id: null, account_id: acc, link: '' }] };
      assert.ok(R.checkMove(s, cur, 'Post', Object.assign({ date: TD }, f)).errs.some(e => e.msg === 'Add the posted link to move to Post'));
      f.posts[0].link = 'https://www.tiktok.com/@07_liuliuly/video/7555000000000000000';
      f.approveDate = '2026-10-08';
      assert.ok(R.checkMove(s, cur, 'Post', Object.assign({}, f, { date: '2026-10-07' })).errs.some(e => e.msg === C.msg.movePostBeforeApprove), 'TC-40');
      assert.deepEqual(R.checkMove(s, cur, 'Post', Object.assign({ date: TD }, f)).errs, []);
      const before = JSON.parse(JSON.stringify(cur));
      move(s, cur, 'Post', f);
      const nd = deal(s, d.deal_id);
      assert.equal(nd.sub_status, 'Post'); assert.equal(nd.draft_rounds, 1); assert.equal(nd.approved_date, TD);
      assert.ok(R.postsOf(s, d.deal_id).some(p => p.post_link === f.posts[0].link && p.post_date === TD));
      assert.equal(before.draft_rounds, 3, 'Undo puts the deal (plan 3) back');
      assert.equal(C.move.checklist.link, 'Posted link');
    });
  });

  describe('CR-20 §4.15 · Next expected', () => {
    const atQt = s => { const d = shortlistDeal(s); move(s, d, 'Confirm QT', { pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '3000', postDue: '2026-10-20' }); return deal(s, d.deal_id); };
    test('TC-41: → Brief without Expected Draft 1 → "Enter the expected Draft 1 date" · +7d = 15/10 → moves · Due 15/10', () => {
      const s = fresh(), d = atQt(s);
      assert.deepEqual(R.stageRequirements(s, d, 'Brief', {}).next, [{ field: 'expected_draft1_date', req: true }, { field: 'expected_script_date', req: false }]);
      assert.ok(R.checkMove(s, d, 'Brief', { date: TD }).errs.some(e => e.msg === 'Enter the expected Draft 1 date'));
      move(s, d, 'Brief', { expected: { expected_draft1_date: R.addDays(TD, 7) } });
      const nd = deal(s, d.deal_id);
      assert.equal(nd.expected_draft1_date, '2026-10-15');
      move(s, nd, 'Script', {});
      assert.equal(R.dueDate(s, deal(s, d.deal_id)), '2026-10-15', 'the card shows Due 15/10');
    });
    test('TC-42: Brief → Script (one step) with Expected Draft 1 → at once', () => {
      const s = fresh(), d = atQt(s);
      move(s, d, 'Brief', { expected: { expected_draft1_date: '2026-10-15' } });
      assert.equal(R.dropPlan(s, deal(s, d.deal_id), 'Script', TD).kind, 'instant');
    });
    test('TC-44: Script → Draft 1 (plan 1) → Expected approve date + "+ Add Draft 2 round" → plan 2 · Expected Draft 2 date · empty is fine', () => {
      const s = fresh(), d = atQt(s);
      move(s, d, 'Brief', { expected: { expected_draft1_date: '2026-10-15' } }); move(s, deal(s, d.deal_id), 'Script', {});
      const cur = deal(s, d.deal_id);
      let q = R.stageRequirements(s, cur, 'Draft 1', {});
      assert.deepEqual(q.next, [{ field: 'expected_approve_date', req: false }]); assert.deepEqual(q.nextRound, { k: 2, on: false });
      q = R.stageRequirements(s, cur, 'Draft 1', { nextRound: true });
      assert.deepEqual(q.next, [{ field: 'expected_draft2_date', req: false }]);
      assert.deepEqual(R.checkMove(s, cur, 'Draft 1', { date: TD, nextRound: true }).errs, []);
      move(s, cur, 'Draft 1', { nextRound: true });
      assert.equal(deal(s, d.deal_id).draft_rounds, 2);
      assert.equal(C.move.addRound(2), '+ Add Draft 2 round');
    });
    test('TC-45: Draft 1 → Draft 2 (plan 3) · Expected Draft 3 = 20/10 → saved · Due 20/10', () => {
      const s = fresh(), d = atQt(s);
      move(s, d, 'Brief', { expected: { expected_draft1_date: '2026-10-15' } }); move(s, deal(s, d.deal_id), 'Script', {});
      deal(s, d.deal_id).draft_rounds = 3; move(s, deal(s, d.deal_id), 'Draft 1', {});
      move(s, deal(s, d.deal_id), 'Draft 2', { expected: { expected_draft3_date: '2026-10-20' } });
      assert.equal(deal(s, d.deal_id).expected_draft3_date, '2026-10-20'); assert.equal(R.dueDate(s, deal(s, d.deal_id)), '2026-10-20');
    });
    test('TC-46 / TC-47: an expected date before the move date → error · after the Post due → a warning only', () => {
      const s = fresh(), d = atQt(s);
      const before = R.checkMove(s, d, 'Brief', { date: TD, expected: { expected_draft1_date: '2026-10-05' } });
      assert.ok(before.errs.some(e => e.msg === "Expected date can't be before the move date"));
      const after = R.checkMove(s, d, 'Brief', { date: TD, expected: { expected_draft1_date: '2026-10-25' } });
      assert.deepEqual(after.errs, []); assert.ok(after.warns.some(w => w.msg === 'After the post due (20/10)'));
    });
    test('an old date the deal already had (shown unchanged in the dialog) never blocks · the same field changed to a past date does', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { payment_term: 'postpaid', gencode_period: 30 });   // no pillar → the Confirm QT details (with Post due 07/09/2026, the past) are shown
      assert.equal(d.expected_post_date, '2026-09-07');
      assert.equal(R.stageRequirements(s, d, 'Draft 1', {}).fields.expected_post_date, 'opt');
      assert.deepEqual(R.checkMove(s, d, 'Draft 1', { date: TD, pillar: 'Awareness', postDue: '2026-09-07' }).errs, []);
      assert.ok(R.checkMove(s, d, 'Draft 1', { date: TD, pillar: 'Awareness', postDue: '2026-09-08' }).errs.some(e => e.code === 'expected_before'));
    });
    test('TC-48: Shortlist → Draft 1 asks only the Next expected of Draft 1 (approve), not Expected Draft 1 of the steps passed', () => {
      const s = fresh(), d = shortlistDeal(s), q = R.stageRequirements(s, d, 'Draft 1', {});
      assert.deepEqual(q.next.map(x => x.field), ['expected_approve_date']);
      assert.ok(!('expected_draft1_date' in q.fields));
      assert.deepEqual(q.skipped.map(x => x.sub_status), ['Confirm QT', 'Brief', 'Script']);
    });
  });
});
