/* cr22.spec.js — CR-22 test cases (no Rate filled in for you · Last rate card · CTA from Contacted · Sample shipment at Confirm QT (NPD · Warehouse ·
   KOL buys own) · Product purchase · the Deal modal's Missing line · schema 21), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate
   v21 · test data is made up: "Campaign Nov - Dec" (Products Test 1, Test 2 · budget ฿2,000,000) · D000317 helppaoduay at Confirm QT ฿100,000 ·
   D000318 helppaoduay Contacted (no rate) · D000319 j.chatae Contacted (no rate · no Assigned to · no CTA). */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const kolBy = (s, n) => s.kol_master.find(k => k.display_name === n);
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const nextLog = s => s.deal_status_log.reduce((m, l) => Math.max(m, Number(l.log_id) || 0), 0) + 1;
  const nextEv = s => s.deal_events.reduce((m, e) => Math.max(m, Number(e.event_id) || 0), 0) + 1;
  const kpis = s => R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
  /* the made-up Campaign and deals of §5 */
  function setup() {
    const s = fresh();
    ['TEST1', 'TEST2'].forEach((code, i) => s.products.push({ tr_code: code, product_name: `Test ${i + 1}`, variant: null, active: true }));
    s.campaigns.push({ campaign_id: 'CMP-0901', campaign_name: 'Campaign Nov - Dec', budget_kol: 2000000, approval_status: 'approved', status_override: null, cta: null, note: null });
    s.phases.push({ phase_id: 'PHS-0901', campaign_id: 'CMP-0901', label: null, start_date: '2026-11-01', end_date: '2026-12-31', budget_kol: 2000000, approval_status: 'approved' });
    R.setCampaignProducts(s, 'CMP-0901', ['TEST1', 'TEST2']);
    const mk = (id, kol, sub, pic, date) => { const out = R.newDeal(s, { dealId: id, logId: nextLog(s), campaignId: 'CMP-0901', kolId: kolBy(s, kol).kol_id, sub, pic, accountIds: [], postIds: [], date, now: new Date(NOW), user: 'U000' });
      s.deals.push(out.deal); s.deal_status_log.push(out.log); return out.deal; };
    const d17 = mk('D000317', 'helppaoduay', 'Confirm QT', 'Amp', '2026-10-07'); Object.assign(d17, { rate_card: 100000, payment_term: 'prepaid', pillar: 'Awareness', cta: 'TikTok' });
    mk('D000318', 'helppaoduay', 'Contacted', 'Amp', '2026-10-08');
    mk('D000319', 'j.chatae', 'Contacted', null, '2026-10-08');
    return s;
  }
  const qtForm = o => Object.assign({ date: TD, today: TD, pillar: 'Awareness', paymentTerm: 'prepaid', rateCard: '100000', cta: 'TikTok', ship: { method: 'warehouse', items: [{ tr_code: 'TEST1', qty: '2' }] } }, o || {});
  const move = (s, d, to, f) => {
    let sid = 900; const r = R.applyMove(s, d, to, f, { logId: nextLog(s), quoteId: 'Q99999', eventId: nextEv(s), now: new Date(NOW), user: 'U000', shipmentId: () => 'SH' + String(++sid).padStart(6, '0') });
    s.deals[s.deals.indexOf(d)] = r.deal; r.logs.forEach(l => s.deal_status_log.push(l)); r.events.forEach(e => s.deal_events.push(e)); if (r.quote) s.kol_rate_quotes.push(r.quote); if (r.shipment) s.sample_shipments.push(r.shipment);
    return r;
  };

  describe('CR-22 §3.1 · Last rate card (U1)', () => {
    test('U1: lastRateCard — the newest deal with a rate above ฿0 · not this deal · none = null · never an average', () => {
      const s = setup(), k = kolBy(s, 'helppaoduay').kol_id;
      assert.deepEqual(R.lastRateCard(s, k, 'D000318'), { amount: 100000, deal_id: 'D000317', campaign_id: 'CMP-0901', date: '2026-10-07' }, 'D000317 (07/10) is newer than D000216 (฿70,000)');
      assert.equal(R.lastRateCard(s, k, 'D000317').amount, 70000, 'without D000317: its deal in Perfect Heart');
      assert.equal(R.lastRateCard(s, kolBy(s, 'j.chatae').kol_id, 'D000319').amount, 7500);
      const lone = s.kol_master.find(x => !s.deals.some(d => d.kol_id === x.kol_id && Number(d.rate_card) > 0));
      assert.equal(R.lastRateCard(s, lone.kol_id, null), null, 'no rate on file');
      deal(s, 'D000317').rate_card = 0;
      assert.equal(R.lastRateCard(s, k, 'D000318').amount, 70000, '฿0 is not a rate');
      assert.equal(C.move.lastRate('฿100,000', 'Campaign Nov - Dec', '07/10/2026'), 'Last rate card ฿100,000 · Campaign Nov - Dec · 07/10/2026');
      assert.equal(C.move.noRate, 'No rate on file');
    });
  });

  describe('CR-22 §3.2–3.3 · stageRequirements (U2)', () => {
    test('U2: Contacted → Date + CTA · Confirm QT → + Pillar · Payment term · Rate card · Method · Products (≥1) · Gencode days with a Gencode cost', () => {
      const s = setup(), d19 = deal(s, 'D000319'), d18 = deal(s, 'D000318'), shortl = R.shortlistStep(s.lookups).sub_status;
      const fresh19 = Object.assign({}, d19, { sub_status: shortl, status: 'List' });
      const c = R.stageRequirements(s, fresh19, 'Contacted', {}).fields;
      assert.deepEqual([c.date, c.cta, c.rate_card, c.ship_method], ['req', 'req', 'opt', undefined]);
      assert.deepEqual(R.checkMove(s, fresh19, 'Contacted', { date: TD, today: TD }).errs.map(e => e.msg), ['Choose a CTA to move to Contacted or later']);
      assert.deepEqual(R.checkMove(s, fresh19, 'Contacted', { date: TD, today: TD, cta: 'TikTok' }).errs, []);
      const q = R.stageRequirements(s, d18, 'Confirm QT', {});
      assert.deepEqual(['pillar', 'payment_term', 'rate_card', 'ship_method', 'ship_items', 'cta'].map(k => q.fields[k]), ['req', 'req', 'req', 'req', 'req', 'req']);
      assert.equal(q.fields.gencode_period, undefined);
      assert.equal(R.stageRequirements(s, d18, 'Confirm QT', { costs: { gencode_expense: '500' } }).fields.gencode_period, 'req');
      const errs = R.checkMove(s, d18, 'Confirm QT', { date: TD, today: TD }).errs.map(e => e.msg);
      ['Choose a CTA to move to Contacted or later', 'Choose how the samples are sent', 'Choose at least one product'].forEach(m => assert.ok(errs.includes(m), m));
      assert.deepEqual(R.checkMove(s, d18, 'Confirm QT', qtForm()).errs, []);
      assert.ok(R.checkMove(s, d18, 'Confirm QT', qtForm({ ship: { method: 'npd', items: [{ tr_code: 'TEST1', qty: '0' }] } })).errs.some(e => e.field === 'ship_items'), 'Qty 1 or more');
      assert.ok(R.missingRequired(s, d18, 'Confirm QT').includes('shipment'), 'a drag to Confirm QT opens the dialog');
      assert.ok(!R.checkMove(s, d19, 'Shortlist', { date: TD, today: TD, note: 'back' }).errs.some(e => e.field === 'cta'), 'back: no CTA asked');
      const r = move(s, d18, 'Confirm QT', qtForm());
      assert.deepEqual([r.shipment.method, r.shipment.status, r.shipment.items, r.deal.cta], ['warehouse', 'to_ship', [{ tr_code: 'TEST1', qty: 2 }], 'TikTok']);
      const nd = deal(s, 'D000318'), next = R.nextStep(s.lookups, nd).step.sub_status, req = R.stageRequirements(s, nd, next, {});
      assert.deepEqual([req.ship, req.shipSummary && req.shipSummary.shipment_id], [false, r.shipment.shipment_id], 'a deal with a shipment: not asked again');
    });
  });

  describe('CR-22 §3.3 · KOL buys own (U3)', () => {
    test('U3: KOL buys own ฿500 → KOL purchase · Total cost +฿500 · Committed of the Campaign +฿500 at Confirm QT · Mark purchased', () => {
      const a = setup(), b = setup();
      move(a, deal(a, 'D000318'), 'Confirm QT', qtForm());
      const r = move(b, deal(b, 'D000318'), 'Confirm QT', qtForm({ ship: { method: 'self_purchase', items: [{ tr_code: 'TEST2', qty: 1 }], purchase_amount: '500' } }));
      assert.deepEqual([r.shipment.status, r.shipment.purchase_amount, r.deal.product_purchase_fee, R.totalCost(r.deal)], ['kol_purchase', 500, 500, 100500]);
      const committed = s => R.dealContext(s).committedByCampaign.get('CMP-0901') || 0;
      assert.equal(committed(b) - committed(a), 500);
      assert.equal(R.sampleStatus(r.shipment, TD), 'kol_purchase');
      assert.equal(R.tabOfStatus('kol_purchase'), 'to-ship');
      R.updateShipment(r.shipment, { kind: 'purchased', date: TD }, { eventId: 1, now: NOW, user: 'U000' });
      assert.deepEqual([r.shipment.status, r.shipment.purchased_date, R.tabOfStatus(R.sampleStatus(r.shipment, TD)), R.openShipment(r.shipment)], ['purchased', TD, 'delivered', false]);
      assert.equal(R.quotesOfKol(b, kolBy(b, 'helppaoduay').kol_id)[0].product_purchase_fee, undefined, 'the rate quote does not carry the purchase');
      const c = setup(), r2 = move(c, deal(c, 'D000318'), 'Confirm QT', qtForm({ ship: { method: 'self_purchase', items: [{ tr_code: 'TEST2', qty: 1 }] } }));
      c.deals[c.deals.indexOf(r2.deal)] = Object.assign({}, r2.deal, { status: 'Cancel', sub_status: 'Cancelled' });
      R.syncShipments(c, { shipmentId: () => 'SH999999', eventId: () => 1, now: NOW, user: 'U000' });
      assert.equal(r2.shipment.status, 'not_required', 'a cancelled deal: KOL purchase → Not required');
      assert.deepEqual(R.SHIP_METHODS, ['npd', 'warehouse', 'self_purchase']);
      assert.deepEqual(['npd', 'warehouse', 'self_purchase'].map(k => R.shipMethodLabel(c.lookups, k)), ['NPD', 'Warehouse', 'KOL buys own']);
    });
    test('the Deal modal\'s Missing line: D000319 → Assigned to · CTA · Rate card · Confirm QT adds Pillar / Payment term', () => {
      const s = setup();
      assert.deepEqual(R.dealMissing(s, deal(s, 'D000319')), ['pic', 'cta', 'rate_card']);
      assert.deepEqual(R.dealMissing(s, deal(s, 'D000317')), []);
      assert.deepEqual(R.dealMissing(s, Object.assign({}, deal(s, 'D000318'), { sub_status: 'Confirm QT', status: 'Inprocess', cta: 'TikTok', payment_term: null })), ['rate_card', 'pillar', 'payment_term']);
      assert.deepEqual(['pic', 'cta', 'rate_card'].map(k => C.deal.missingKey[k]), ['Assigned to', 'CTA', 'Rate card']);
      assert.equal(C.msg.dealsPicRequired, 'Choose who the deals are assigned to');
    });
  });

  describe('CR-22 §4 · schema 21 (U4)', () => {
    test('U4: a schema 20 file → 21 · every shipment Warehouse · items from the deal\'s products · Product purchase null · the money anchors stay', () => {
      const v20 = JSON.parse(JSON.stringify(fresh())); v20.schema_version = 20; delete v20.lookups.shipment_methods;
      v20.sample_shipments.forEach(sh => { delete sh.method; delete sh.purchase_amount; delete sh.purchased_date; });
      v20.deals.forEach(d => { delete d.product_purchase_fee; });
      const one = v20.sample_shipments[0]; one.items = []; v20.deal_products.push({ deal_id: one.deal_id, tr_code: 'ZZ1', qty: 3, note: null });
      const s = S.migrate(v20, new Date(NOW));
      assert.deepEqual([s.schema_version, S.SCHEMA_VERSION], [21, 21]);
      assert.ok(s.sample_shipments.every(sh => sh.method === 'warehouse' && sh.purchase_amount === null));
      assert.deepEqual(s.sample_shipments[0].items, [{ tr_code: 'ZZ1', qty: 1 }], 'the deal\'s products, qty 1');
      assert.ok(s.deals.every(d => d.product_purchase_fee === null));
      assert.deepEqual(s.lookups.shipment_methods.map(m => m.key), ['npd', 'warehouse', 'self_purchase']);
      const k = kpis(s);
      assert.deepEqual([Math.round(k.money.committed), Math.round(k.paid.paid), Math.round(k.money.pending)], [1783579, 774579, 98000], 'the CR-05 money anchors');
      const again = S.migrate(JSON.parse(JSON.stringify(s)), new Date(NOW));
      assert.equal(JSON.stringify(again.sample_shipments), JSON.stringify(s.sample_shipments), 'twice = the same');
    });
  });
});
