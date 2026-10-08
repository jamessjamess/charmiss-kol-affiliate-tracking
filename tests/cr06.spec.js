/* cr06.spec.js — CR-06 test cases (products, Phase names by place …), run by tests/test.html. "today" is always 05/10/2026. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TD = '2026-10-05';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const names = (s, cid) => R.sortPhases(s.phases.filter(p => p.campaign_id === cid)).map(p => R.phaseName(s, p.phase_id));
  function fakeStorage() { const m = new Map(); return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
  /* a catalog of three products, two of them in Charming Iconic Glow */
  function withProducts(s) {
    s.products.push({ tr_code: 'TR-001', product_name: 'Cushion', variant: '01 Light', active: true }, { tr_code: 'TR-002', product_name: 'Cushion', variant: '02 Natural', active: true },
      { tr_code: 'TR-003', product_name: 'Lip Gloss', variant: null, active: true });
    R.setCampaignProducts(s, 'CH', ['TR-001', 'TR-002']);
    return s;
  }

  describe('CR-06 R1 · schema v6, Phase names by place', () => {
    test('migration v5 → v6: products collections empty · phase_name gone (label kept) · KOL performance settings', () => {
      const s = fresh();
      assert.ok(s.schema_version >= 6, 'CR-07 moved it on to 7');
      assert.deepEqual([s.products, s.campaign_products, s.deal_products], [[], [], []]);
      assert.ok(s.phases.every(p => !('phase_name' in p) && 'label' in p));
      assert.ok(s.deals.every(d => !('tr_codes' in d)));
      assert.deepEqual([s.lookups.ontime_grace_days, s.lookups.reliability_min_posts], [1, 2]);
    });
    test('TC-03: names after the migration — "Phase {n}" by start date + the old name as label', () => {
      const s = fresh();
      assert.deepEqual(names(s, 'PH'), ['Phase 1 · Awareness & Consideration', 'Phase 2 · Consideration + Conversion', 'Phase 3', 'Phase 4 · October']);
      assert.deepEqual(names(s, 'AC'), ['Phase 1 · KOL 30 Acc']);
      assert.deepEqual(names(s, 'CH'), ['Phase 1 · Launch', 'Phase 2 · Charmiss X Fourth']);
      assert.deepEqual(names(s, 'KS'), ['Phase 1 · Launch & Awareness', 'Phase 2 · Conversion']);
      assert.deepEqual(['Phase 1 · Launch', 'Phase 3', 'October', 'KOL 30 Acc', 'phase 2·x', '', null].map(R.labelFromName), ['Launch', null, 'October', 'KOL 30 Acc', 'x', null, null]);
    });
    test('the number follows the start date · same dates keep the order the Phases were made · a label never changes the number', () => {
      const s = fresh(), ks = s.phases.filter(p => p.campaign_id === 'KS');
      s.phases.push({ phase_id: 'PHS-0001', campaign_id: 'KS', label: 'Teaser', start_date: '2026-08-01', end_date: '2026-08-10', budget_kol: null });
      assert.deepEqual(names(s, 'KS'), ['Phase 1 · Teaser', 'Phase 2 · Launch & Awareness', 'Phase 3 · Conversion'], 'an earlier Phase moves the others up');
      s.phases.push({ phase_id: 'PHS-0002', campaign_id: 'KS', label: null, start_date: '2026-08-01', end_date: '2026-08-10', budget_kol: null });
      assert.equal(R.phaseName(s, 'PHS-0002'), 'Phase 2', 'same dates → made later = later number');
      assert.equal(ks.length, 2);
      assert.deepEqual(R.planSeqs([{ start_date: '2026-12-11' }, { start_date: '2026-11-01' }, { start_date: '' }, { start_date: '2026-11-21' }]), [3, 1, 4, 2]);
    });
    test('TC-01 / TC-02 basis: titles use names · no "ID will be" · rendered names have no Campaign / Phase IDs (§4.1 regex)', () => {
      const s = fresh(), ID = /\b[A-Z]{2,4}-P\d+\b|\b[A-Z]{2,3} · /;
      assert.equal(C.campaign.editTitle('Charming Iconic Glow'), 'Edit Charming Iconic Glow');
      assert.equal(C.campaign.idWillBe, undefined);
      s.phases.forEach(p => { assert.ok(!ID.test(R.phaseName(s, p.phase_id)), p.phase_id); assert.ok(!ID.test(R.phaseLabel(s, p.phase_id, false)), p.phase_id); });
      assert.ok(!ID.test(C.campaign.phaseTitle(3, 'Launch')));
    });
    test('Phase Planner: overlap names and the impact list use "Phase n · label" · labels may repeat', () => {
      const s = fresh(), row = (label, a, z) => ({ key: label + a, phase_id: null, label, start_date: a, end_date: z, budget_kol: 10 });
      const v = R.validatePhasePlan(s, { campaign_id: null, campaign_name: 'New', budget_kol: 100 }, [row('B', '2026-11-08', '2026-11-12'), row('A', '2026-11-01', '2026-11-10')], []);
      assert.deepEqual(v.warns.filter(w => w.kind !== 'under').map(w => w.msg), [C.msg.phaseOverlap('Phase 2 · B', 'Phase 1 · A', '08/11', '10/11')]);   // (CR-18: + the red Unallocated line)
      assert.deepEqual(R.validatePhasePlan(s, { campaign_id: null, campaign_name: 'New', budget_kol: 100 }, [row('Same', '2026-11-01', '2026-11-05'), row('Same', '2026-11-06', '2026-11-08')], []).errs, []);
      const rows = R.sortPhases(s.phases.filter(p => p.campaign_id === 'PH')).map(p => ({ key: p.phase_id, phase_id: p.phase_id, label: p.label, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol }));
      assert.deepEqual(R.planImpact(s, 'PH', rows, []).rows.map(r => r.name), names(s, 'PH'));
    });
    test('CSV: posts carry phase_name (as shown) · phase_seq · phase_label · deals carry products', () => {
      const s = fresh(), row = R.postsRows(s, s.deal_posts.filter(p => p.deal_id === 'D000044'), R.dealContext(s))[0];
      assert.ok(['phase_seq', 'phase_label'].every(k => R.POSTS_COLS.includes(k)));
      assert.deepEqual([row.phase_id, row.phase_name, row.phase_seq, row.phase_label], ['CH-P1', 'Phase 1 · Launch', 1, 'Launch']);
      assert.ok(R.DEALS_COLS.includes('products') && !R.DEALS_COLS.includes('tr_codes'));
    });
    test('Restore takes a v5 backup with tr_codes → products, Campaign products and deal products (qty 1)', () => {
      const v5 = JSON.parse(JSON.stringify(fresh()));
      v5.schema_version = 5; delete v5.products; delete v5.campaign_products; delete v5.deal_products;
      v5.phases.forEach(p => { p.phase_name = R.phaseName(fresh(), p.phase_id); delete p.label; });
      v5.deals.forEach(d => { d.tr_codes = []; });
      v5.deals.find(d => d.deal_id === 'D000044').tr_codes = ['TR-9', ' tr-9 ', 'TR-10'];
      v5.deals.find(d => d.deal_id === 'D000098').tr_codes = ['TR-9'];
      const st = S.createStore({ seed: SEED, storage: fakeStorage() }), res = st.restore(JSON.stringify(v5), 'v5.json');
      assert.equal(res.ok, true); assert.equal(res.migratedFrom, 5);
      const s = st.state;
      assert.deepEqual(s.products.map(p => [p.tr_code, p.product_name]), [['TR-9', 'TR-9'], ['TR-10', 'TR-10']]);
      assert.deepEqual(R.campaignProductCodes(s, 'CH'), ['TR-9', 'TR-10']);
      assert.deepEqual(s.deal_products.map(x => [x.deal_id, x.tr_code, x.qty]), [['D000044', 'TR-9', 1], ['D000044', 'TR-10', 1], ['D000098', 'TR-9', 1]]);
      assert.deepEqual(names(s, 'PH'), names(fresh(), 'PH'), 'names survive the round trip');
      assert.ok(s.deals.every(d => !('tr_codes' in d)));
    });
  });

  describe('CR-06 R1 · products', () => {
    test('catalog: TR code and name are required · a TR code is unique (case and outer spaces ignored)', () => {
      const s = withProducts(fresh());
      assert.deepEqual(R.validateProduct(s, { tr_code: '', product_name: '' }, true).errs.map(e => e.field), ['tr_code', 'product_name']);
      assert.deepEqual(R.validateProduct(s, { tr_code: ' tr-001 ', product_name: 'X' }, true).errs.map(e => e.msg), [C.msg.productCodeDup('TR-001', 'Cushion')]);
      assert.deepEqual(R.validateProduct(s, { tr_code: 'TR-001', product_name: 'Renamed' }, false).errs, [], 'editing keeps its own code');
      assert.equal(R.productLabel(R.productByCode(s, 'tr-002')), 'TR-002 · Cushion · 02 Natural');
      assert.deepEqual(R.productUse(s, 'TR-001'), { campaigns: 1, deals: 0 });
      assert.equal(R.canDeleteProduct(s, 'TR-001'), false); assert.equal(R.canDeleteProduct(s, 'TR-003'), true);
    });
    test('TC-04: Import CSV 3 rows, one TR code twice → new 2 · duplicate 1 · apply adds 2', () => {
      const s = fresh(), csv = 'tr_code,product_name,variant\nTR-100,Cushion,01\nTR-101,Lip Gloss,\ntr-100,Cushion again,02\n';
      const plan = R.planProductImport(s, R.parseCSV(csv));
      assert.equal(plan.headerError, null);
      assert.deepEqual(plan.rows.map(r => r.kind), ['new', 'new', 'duplicate']);
      assert.deepEqual(R.importCounts(plan), { new: 2, update: 0, same: 0, duplicate: 1, error: 0 });
      const out = R.applyProductImport(s, plan);
      assert.deepEqual(out.products.map(p => [p.tr_code, p.product_name, p.variant]), [['TR-100', 'Cushion', '01'], ['TR-101', 'Lip Gloss', null]]);
      s.products = out.products;
      const again = R.planProductImport(s, R.parseCSV('product_name,tr_code\nCushion,TR-100\nGloss,TR-101\n,TR-102\n'));
      assert.deepEqual(again.rows.map(r => r.kind), ['update', 'update', 'error'], 'variant differs → update · no name → error');
      assert.ok(R.planProductImport(s, R.parseCSV('code,name\nA,B')).headerError);
    });
    test('TC-05: a new Campaign needs a product · an old one without products only warns', () => {
      const s = withProducts(fresh());
      assert.deepEqual(R.checkCampaignProducts(s, null, []).errs.map(e => e.msg), [C.msg.campaignProductsRequired]);
      assert.deepEqual(R.checkCampaignProducts(s, null, ['TR-003']).errs, []);
      const old = R.checkCampaignProducts(s, 'KS', []);
      assert.deepEqual([old.errs, old.warns.map(w => w.msg)], [[], [C.msg.campaignNoProducts]]);
    });
    test('TC-06: the 4 Campaigns have no products → queue "Campaign without products" = 4 · a cancelled Campaign is left out', () => {
      const s = fresh();
      assert.equal(R.campaignsWithoutProducts(s).length, 4);
      assert.equal(R.opsQueues(s, { campaign: '', pic: '', tier: '' }, TD).noProducts.length, 4);
      withProducts(s);
      assert.deepEqual(R.campaignsWithoutProducts(s).map(c => c.campaign_id).sort(), ['AC', 'KS', 'PH']);
      s.campaigns.find(c => c.campaign_id === 'AC').status_override = 'cancelled';
      assert.equal(R.campaignsWithoutProducts(s).length, 2);
      assert.equal(R.opsQueues(s, { campaign: 'KS', pic: '', tier: '' }, TD).noProducts.length, 1, 'the Campaign filter applies');
    });
    test('TC-07: a deal picks only its Campaign\'s products · qty whole ≥ 1 · Template TR Code = codes one per line · Deals CSV products', () => {
      const s = withProducts(fresh()), d = deal(s, 'D000044');
      assert.equal(d.campaign_id, 'CH');
      assert.deepEqual(R.validateDealProducts(s, 'CH', [{ tr_code: 'TR-001', qty: '1' }, { tr_code: 'TR-002', qty: 3 }]), []);
      assert.deepEqual(R.validateDealProducts(s, 'CH', [{ tr_code: 'TR-003', qty: 1 }, { tr_code: 'TR-001', qty: '0' }, { tr_code: 'TR-002', qty: '1.5' }]).map(e => [e.field, e.msg]),
        [['product0_qty', C.msg.productNotInCampaign('Lip Gloss')], ['product1_qty', C.msg.productQty('Cushion · 01 Light')], ['product2_qty', C.msg.productQty('Cushion · 02 Natural')]]);
      R.setDealProducts(s, 'D000044', [{ tr_code: 'TR-001', qty: 2 }, { tr_code: 'TR-002', qty: 1 }]);
      const col = R.TEMPLATE_HEADERS.indexOf('TR Code');
      assert.equal(R.templateRow(s, d, R.dealContext(s))[col], 'TR-001\nTR-002');
      assert.equal(R.dealsRows(s, [d], TD)[0].products, 'TR-001×2, TR-002×1');
      assert.equal(R.dealProductsText(s, R.dealProductList(s, 'D000044')), 'Cushion · 01 Light × 2, Cushion · 02 Natural × 1');
      const res = R.validateDeal(s, Object.assign({}, d, { products: [{ tr_code: 'TR-003', qty: 1 }] }), R.postsOf(s, d.deal_id), TD);
      assert.ok(res.errs.some(e => e.field === 'product0_qty'), 'validateDeal checks the products in the form');
    });
    test('TC-08: a product a deal uses cannot leave its Campaign (the message counts the deals)', () => {
      const s = withProducts(fresh());
      R.setDealProducts(s, 'D000044', [{ tr_code: 'TR-001', qty: 1 }]);
      R.setDealProducts(s, 'D000098', [{ tr_code: 'TR-001', qty: 1 }]);
      assert.deepEqual(R.productDealsInCampaign(s, 'CH', 'tr-001').sort(), ['D000044', 'D000098']);
      /* CR-09 §4.7: a product deals use may leave (asked first) — a warning, the deals keep it */
      assert.deepEqual(R.checkCampaignProducts(s, 'CH', ['TR-002']).errs, []);
      assert.deepEqual(R.checkCampaignProducts(s, 'CH', ['TR-002']).warns.map(e => e.msg), [C.msg.productRemovedUsed('Cushion · 01 Light', 2)]);
      assert.deepEqual(R.checkCampaignProducts(s, 'CH', ['TR-001']).errs, [], 'TR-002 is not used — it can go');
    });
    test('"No products selected" is info for an open deal at Brief or later · products planned for the Posts card', () => {
      const s = withProducts(fresh()), d = deal(s, 'D000098');
      assert.equal(d.sub_status, 'Brief');
      assert.ok(R.validateDeal(s, d, R.postsOf(s, d.deal_id), TD).infos.some(i => i.msg === C.msg.noProductsSelected));
      R.setDealProducts(s, 'D000098', [{ tr_code: 'TR-002', qty: 4 }]);
      assert.ok(!R.validateDeal(s, d, R.postsOf(s, d.deal_id), TD).infos.some(i => i.msg === C.msg.noProductsSelected));
      assert.deepEqual(R.productsPlanned(s, 'CH'), { items: 2, units: 4 });
      assert.equal(C.products.line(2, 4), 'Products: 2 items · 4 units planned');
    });
    test('anchors stay: CR-05 §5.0 money is the same after v6', () => {
      const s = fresh(), m = R.moneyTotal(s.campaigns.map(c => R.campaignMoney(s, c.campaign_id)));
      assert.deepEqual([m.budget, m.committed, m.pending], [2748400, 1783579, 98000]);
    });
  });

  describe('CR-06 R2 · Phase Planner: Number of phases, Split dates evenly, presets, running number', () => {
    test('TC-09: 01/11–31/12/2026 into 3 → 01/11–20/11 · 21/11–10/12 · 11/12–31/12 (back to back, the last takes the extra day)', () => {
      assert.deepEqual(R.splitDates('2026-11-01', '2026-12-31', 3), [{ start_date: '2026-11-01', end_date: '2026-11-20' }, { start_date: '2026-11-21', end_date: '2026-12-10' }, { start_date: '2026-12-11', end_date: '2026-12-31' }]);
      assert.deepEqual(R.splitDates('2026-11-01', '2026-11-01', 1), [{ start_date: '2026-11-01', end_date: '2026-11-01' }]);
      assert.equal(R.splitDates('2026-11-01', '2026-11-02', 3), null, 'shorter than the count');
      assert.equal(R.splitDates('2026-11-10', '2026-11-01', 2), null);
      const parts = R.splitDates('2026-01-01', '2026-12-31', 12);
      assert.ok(parts.every((p, i) => !i || p.start_date === R.addDays(parts[i - 1].end_date, 1)), 'no gap, no overlap');
    });
    test('TC-10: Even with ฿100,000 → 33.33 / 33.33 / 33.34 % · ฿33,333 / ฿33,333 / ฿33,334', () => {
      assert.deepEqual(R.presetSplit('even', 3, 100000), { pcts: [33.33, 33.33, 33.34], amounts: [33333, 33333, 33334] });
      assert.deepEqual(R.presetSplit('even', 3, ''), { pcts: [33.33, 33.33, 33.34], amounts: null }, 'no budget → % only');
      assert.deepEqual(R.evenAmounts(850000, 4), [212500, 212500, 212500, 212500]);
    });
    test('TC-11: Launch-heavy → 20 / 65 / 15 (only for 3 phases) · amounts add up to the budget', () => {
      assert.deepEqual(R.presetSplit('launch', 3, 100000), { pcts: [20, 65, 15], amounts: [20000, 65000, 15000] });
      assert.equal(R.presetSplit('launch', 4, 100000), null);
      const x = R.presetSplit('launch', 3, 898401);
      assert.equal(x.amounts.reduce((a, v) => a + v, 0), 898401);
    });
    test('TC-12: Phase 3 starting before Phase 1 becomes Phase 1 — labels stay with their rows', () => {
      const rows = [{ label: 'Teaser', start_date: '2026-11-01', end_date: '2026-11-20' }, { label: 'Launch', start_date: '2026-11-21', end_date: '2026-12-10' }, { label: 'Sustain', start_date: '2026-10-20', end_date: '2026-10-31' }];
      const seqs = R.planSeqs(rows);
      assert.deepEqual(seqs, [2, 3, 1]);
      assert.deepEqual(rows.map((r, i) => R.phaseTitle(seqs[i], r.label)), ['Phase 2 · Teaser', 'Phase 3 · Launch', 'Phase 1 · Sustain']);
    });
    test("TC-13: fewer phases drops the last rows — not a Phase with posts ('Phase 4 · October has posts — can't remove')", () => {
      const s = fresh(), rows = R.sortPhases(s.phases.filter(p => p.campaign_id === 'PH')).map(p => ({ key: p.phase_id, phase_id: p.phase_id, label: p.label, start_date: p.start_date, end_date: p.end_date }));
      const has = r => !!r.phase_id && !R.canDeletePhase(s, r.phase_id);
      const x = R.resizePlan(rows, 3, has);
      assert.deepEqual([x.remove, x.err && x.err.msg], [[], C.msg.planRemoveHasPosts('Phase 4 · October')]);
      const fresh3 = [{ key: 'a', phase_id: null, label: '', start_date: '2026-11-01', end_date: '2026-11-10' }, { key: 'b', phase_id: null, label: '', start_date: '2026-11-11', end_date: '2026-11-20' }, { key: 'c', phase_id: 'PH-OCT', label: '', start_date: '2026-11-21', end_date: '2026-11-30' }];
      assert.equal(R.resizePlan(fresh3, 2, has).err.msg, C.msg.planRemoveHasPosts('Phase 3'));
      fresh3[2].phase_id = null;
      assert.deepEqual(R.resizePlan(fresh3, 2, has).remove.map(r => r.key), ['c']);
      assert.deepEqual(R.resizePlan(fresh3, 5, has), { remove: [], add: 2, err: null });
    });
    test('TC-14: Number of phases = 13 (or 0, 2.5, blank) is an error · 1–12 are fine', () => {
      [13, 0, 2.5, '', 'x'].forEach(v => assert.equal(R.checkPhaseCount(v).msg, C.msg.planCountRange(12), String(v)));
      [1, 12, '3'].forEach(v => assert.equal(R.checkPhaseCount(v), null));
      assert.equal(R.resizePlan([], 13, () => false).err.field, 'count');
    });
    test('a Phase added before the others renumbers them — the Impact preview says "Phase 1 · … will become Phase 2 · …"', () => {
      const s = fresh(), rows = R.sortPhases(s.phases.filter(p => p.campaign_id === 'KS')).map(p => ({ key: p.phase_id, phase_id: p.phase_id, label: p.label, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol }));
      rows.push({ key: 'new', phase_id: null, label: 'Teaser', start_date: '2026-08-01', end_date: '2026-08-10', budget_kol: '' });
      assert.deepEqual(R.planImpact(s, 'KS', rows, []).renumber.map(r => C.planner.renumber(r.from, r.to)),
        ['Phase 1 · Launch & Awareness will become Phase 2 · Launch & Awareness', 'Phase 2 · Conversion will become Phase 3 · Conversion']);
      assert.deepEqual(R.planImpact(s, 'KS', rows.slice(0, 2), []).renumber, [], 'no new Phase → no renumbering');
    });
  });

  describe('CR-06 R3 · KOL performance, Last worked', () => {
    const team = s => { const all = R.kolPerfAll(s, TD), list = [...all.values()]; return { all, list, measured: list.filter(x => x.perf.measured) }; };
    test('§5.0 anchors: 184 posts measured · 173 on time (94.0%) · 160 KOLs → Reliable 17 · Watch 0 · Late 2 · Not enough data 141', () => {
      const s = fresh(), t = team(s), sum = k => t.measured.reduce((a, x) => a + x.perf[k], 0);
      assert.deepEqual([sum('measured'), sum('onTime'), (sum('onTime') / sum('measured') * 100).toFixed(1), t.measured.length], [184, 173, '94.0', 160]);
      const by = b => t.measured.filter(x => x.perf.badge === b).length;
      assert.deepEqual(R.BADGES.map(by), [17, 0, 2, 141]);
      const late = [...t.all.entries()].filter(([, x]) => x.perf.badge === 'late').map(([id]) => s.kol_master.find(k => k.kol_id === id).display_name).sort();
      assert.deepEqual(late, ['babimaofad', 'isukiuna']);
    });
    test('TC-16 / TC-17: Last worked — 3 months 224 · 3–6 months 4 · 6–12 months 10 · Over 1 year 3 (K0048 posted in 2024) · Never 670', () => {
      const s = fresh(), t = team(s), n = b => t.list.filter(x => x.bucket === b).length;
      assert.deepEqual(R.LAST_WORKED.map(n), [224, 4, 10, 3, 670]);
      assert.ok(t.all.get('K0048').bucket === 'over' && t.all.get('K0048').last.startsWith('2024'));
      assert.deepEqual(['2026-07-06', '2026-07-05', '2026-04-06', '2026-04-05', '2025-10-05', '2025-10-04', '2026-12-01', null].map(d => R.lastWorkedBucket(d, TD)), ['m3', 'm6', 'm6', 'm12', 'm12', 'over', 'm3', 'never']);
    });
    test('TC-18: babimaofad — 50% (1 of 2) · Late · one late post in the list', () => {
      const s = fresh(), id = s.kol_master.find(k => k.display_name === 'babimaofad').kol_id, p = R.kolPerformance(s, id, TD);
      assert.deepEqual([p.measured, p.onTime, p.rate, p.badge, p.latePosts.length], [2, 1, 0.5, 'late', 1]);
      assert.ok(p.latePosts[0].days > 1 && p.avgDelay === p.latePosts[0].days);
    });
    test('TC-19: genygee28 — 100% (2 of 2) · Reliable · Last worked 04/09/2026', () => {
      const s = fresh(), id = s.kol_master.find(k => k.display_name === 'genygee28').kol_id, p = R.kolPerformance(s, id, TD);
      assert.deepEqual([p.measured, p.onTime, p.badge, R.lastWorked(s, id)], [2, 2, 'reliable', '2026-09-04']);
    });
    test('TC-20: grace 0 days → recalculated, never higher than with 1 day · minimum posts changes Not enough data', () => {
      const s = fresh(), before = team(s).measured.reduce((a, x) => a + x.perf.onTime, 0);
      s.lookups.ontime_grace_days = 0;
      const after = team(s).measured.reduce((a, x) => a + x.perf.onTime, 0);
      assert.ok(after <= before, `${after} ≤ ${before}`);
      s.lookups.ontime_grace_days = 1; s.lookups.reliability_min_posts = 1;
      assert.equal(team(s).measured.filter(x => x.perf.badge === 'none').length, 0);
      assert.deepEqual(R.validatePerfSettings({ ontime_grace_days: '0', reliability_min_posts: '2' }).errs, []);
      assert.deepEqual(R.validatePerfSettings({ ontime_grace_days: '-1', reliability_min_posts: '0' }).errs.map(e => e.field), ['ontime_grace_days', 'reliability_min_posts']);
    });
    test('the other metrics: cancelled deals are left out · completion counts deals past List · CPV / ER over posts with views', () => {
      const s = fresh(), id = s.kol_master.find(k => k.display_name === 'genygee28').kol_id, p = R.kolPerformance(s, id, TD);
      assert.ok(p.completion === null || (p.completion >= 0 && p.completion <= 1));
      assert.equal(R.kolPerformance(s, 'K-none', TD).badge, 'none');
      assert.equal(R.lastWorked(s, 'K-none'), null);
      const k = s.kol_master.find(x => R.lastWorked(s, x.kol_id)), deals = s.deals.filter(d => d.kol_id === k.kol_id);
      deals.forEach(d => { d.status = 'Cancel'; });
      assert.equal(R.lastWorked(s, k.kol_id), null, 'only cancelled deals → Never');
    });
  });

  describe('CR-06 R4 · Deals: one Campaign, PIC, state tabs, Needs action', () => {
    const scoped = (s, pic) => R.filterDeals(s, { campaign: 'CH', pic }, TD, R.dealContext(s));
    test('TC-22: the first On going Campaign (Charming Iconic Glow) unless another was used last', () => {
      const s = fresh();
      assert.equal(R.defaultDealsCampaign(s, TD, null), 'CH');
      assert.equal(R.defaultDealsCampaign(s, TD, 'PH'), 'PH');
      assert.equal(R.defaultDealsCampaign(s, TD, 'GONE'), 'CH', 'a Campaign that is gone is ignored');
    });
    /* CR-13 §4.4 supersedes the tabs Open · Needs action · Complete · Cancelled · All → All · List · In process · Complete · Cancelled
       (Open = List + In process) · Needs action → attention chips without Unpaid after posting (cr13.spec.js TC-13 / TC-15) */
    test('TC-26 (CR-13 · CR-15): Charming, All PICs — All 101 · List 3 + In process 11 (= the 14 open) · Complete 87 · Cancelled 0 · Overdue 2', () => {
      const s = fresh(), t = R.dealTabs(s, scoped(s, ''), TD, null, { tab: 'all' });
      assert.deepEqual(R.DEAL_TABS.map(k => t.counts[k]), [101, 3, 11, 87, 0]);
      assert.equal(t.chips.overdue, 2, 'CR-15: pangxnstory (Brief) waits on Script — no due date yet');
      const rows = scoped(s, '');
      assert.equal(rows.filter(d => R.hasReason(d, 'overdue', t.why)).length, 2);
      assert.equal(rows.filter(d => R.inDealTab(d, 'list') || R.inDealTab(d, 'inprocess')).every(d => d.status === 'List' || d.status === 'Inprocess'), true);
    });
    test('TC-23 / TC-24 (CR-13): Me (Ja) open 9 · Pang open 3 · Unassigned open 1 (List + In process)', () => {
      const s = fresh(), open = pic => { const c = R.dealTabs(s, scoped(s, pic), TD).counts; return c.list + c.inprocess; };
      assert.deepEqual([open('Ja'), open('Pang'), open('__none')], [9, 3, 1]);
    });
    test('TC-27: Group by KOL Tier inside the open deals keeps the 14 · Group by PIC ends with Unassigned', () => {
      const s = fresh(), ctx = R.dealContext(s), rows = scoped(s, ''), open = rows.filter(d => R.inDealTab(d, 'list') || R.inDealTab(d, 'inprocess'));
      const byTier = R.groupDeals(s, open, 'tier', ctx, TD);
      assert.equal(byTier.reduce((a, g) => a + g.rows.length, 0), 14);
      const byPic = R.groupDeals(s, open, 'pic', ctx, TD);
      assert.equal(byPic.reduce((a, g) => a + g.rows.length, 0), 14);
      assert.equal(byPic[byPic.length - 1].key, '', 'Unassigned last');
      assert.deepEqual(R.attentionReasons(s, s.deals.find(d => d.deal_id === 'D000098'), TD, ctx).map(x => x.key), ['shipOverdue'], 'CR-13 §4.5: its sample is past Ship by · CR-15: at Brief it waits on Script (no due)');
    });
    test('summary of the scope: Committed ฿863,700 / ฿850,000 · Pending ฿5,100 · Paid ฿233,500', () => {
      const s = fresh(), ctx = R.dealContext(s), t = R.dealTiles(s, scoped(s, ''), { campaignId: 'CH', phaseIds: null }, TD, ctx.phaseIdx);
      assert.deepEqual([t.committed, t.budget, t.shortlist, t.paid], [863700, 850000, 5100, 233500]);
    });
  });

  describe('CR-06 R5 · Pipeline drag & drop', () => {
    const dealOf = (s, name) => { const k = s.kol_master.find(x => x.display_name === name); return s.deals.find(d => d.kol_id === k.kol_id && (d.status === 'List' || d.status === 'Inprocess')); };
    test('TC-29 (CR-15 TC-05): nanomona777 (Brief) → Script goes straight away · → Draft 1 opens Move stage (Script is marked done the same day)', () => {
      const s = fresh(), d = dealOf(s, 'nanomona777');
      assert.equal(d.sub_status, 'Brief');
      /* the seed deal has no Pillar (its old pillar sits in Remark) → §4.7: the dialog asks for it first */
      assert.deepEqual(R.dropPlan(s, d, 'Draft 1', TD), { kind: 'dialog' });
      Object.assign(d, { pillar: 'Awareness', payment_term: 'postpaid', gencode_period: 30, expected_draft1_date: '2026-10-15' });   // CR-20 §4.7 · §4.15: the term, and the expected Draft 1 date that Script asks for
      assert.deepEqual(R.dropPlan(s, d, 'Script', TD), { kind: 'instant' });
      assert.deepEqual(R.dropPlan(s, d, 'Draft 1', TD), { kind: 'dialog' }, 'a step passed on the way → the dialog says so');
      assert.ok(R.checkMove(s, d, 'Draft 1', { date: TD }).warns.some(w => w.msg === C.msg.moveAutoDone(R.dmy(TD).slice(0, 5), 'Script')));
      const r = R.applyMove(s, d, 'Draft 1', { date: TD, note: '' }, { logId: 999, quoteId: 'Q9', eventId: 9, now: new Date(), user: 'U000' });
      assert.deepEqual([r.deal.sub_status, r.deal.approved_draft1_date, r.deal.script_date, r.log.from_sub_status], ['Draft 1', TD, TD, 'Script']);
      assert.deepEqual(r.logs.map(l => [l.sub_status, l.note]), [['Script', C.msg.autoCompleted], ['Draft 1', null]]);
      assert.deepEqual(R.dropPlan(s, d, 'Brief', TD), { kind: 'same' });
    });
    test('TC-30: tuckpx (Draft 2) back to Brief opens Move stage (a note is needed)', () => {
      const s = fresh(), d = dealOf(s, 'tuckpx');
      assert.equal(d.sub_status, 'Draft 2');
      assert.equal(R.dropPlan(s, d, 'Brief', TD).kind, 'dialog');
      assert.ok(R.checkMove(s, d, 'Brief', { date: TD }).errs.some(e => e.msg === C.msg.moveBackNote));
      assert.equal(R.dropPlan(s, d, 'Cancel', TD).kind, 'dialog', 'Cancel needs a reason');
    });
    test('TC-31 (CR-20 §4.9 · §4.14): Post while a post has no link / date → the Move stage dialog asks for the posted link (no longer blocked)', () => {
      const s = fresh(), d = dealOf(s, 'tuckpx'), posts = R.postsOf(s, d.deal_id), bad = posts.filter(p => !R.postDone(p)).length;
      assert.ok(bad > 0);
      assert.deepEqual(R.dropPlan(s, d, 'Post', TD), { kind: 'dialog' });
      assert.ok(R.stageRequirements(s, d, 'Post', {}).post);
      assert.equal(C.msg.dropPostsMissing(1), '1 post missing link/date');
    });
    test('TC-32: a Draft beyond the plan opens Move stage with "+ Add draft round" · skipping steps asks too · a cancelled Campaign blocks', () => {
      const s = fresh(), d = dealOf(s, 'nanomona777');
      assert.equal(R.planOf(d).drafts < 3, true);
      assert.equal(R.dropPlan(s, d, 'Draft 3', TD).kind, 'dialog');
      assert.equal(R.checkMove(s, d, 'Draft 3', { date: TD }).errs[0].code, 'add_round');
      s.campaigns.find(c => c.campaign_id === d.campaign_id).status_override = 'cancelled';
      assert.equal(R.dropPlan(s, d, 'Draft 1', TD).kind, 'blocked');
    });
  });

  describe('CR-06 R6 · Payments view', () => {
    const ch = s => R.filterDeals(s, { campaign: 'CH' }, TD, R.dealContext(s));
    test('TC-34: Charming, All PICs — Committed ฿863,700 · Paid ฿233,500 · Outstanding ฿630,200 · every deal is in Not set', () => {
      const s = fresh(), pv = R.paymentsView(s, ch(s), TD);
      assert.deepEqual([pv.committed, pv.paid, pv.outstanding], [863700, 233500, 630200]);
      assert.deepEqual(R.PAY_GROUPS.map(g => pv.live.filter(d => R.payGroupOf(d) === g).length), [0, 0, 0, 0, 101]);
      assert.deepEqual(R.PAY_TABS.map(k => pv.counts[k]), [62, 0, 14, 25, 101]);
    });
    test('TC-35: three deals set to 50/50 move to that group · only 50/50 has the Deposit step', () => {
      const s = fresh(), ids = ch(s).slice(0, 3).map(d => d.deal_id);
      s.deals.forEach(d => { if (ids.includes(d.deal_id)) d.payment_term = 'split_50'; });
      const pv = R.paymentsView(s, ch(s), TD);
      assert.deepEqual(pv.live.filter(d => R.payGroupOf(d) === 'split_50').map(d => d.deal_id).sort(), ids.sort());
      assert.deepEqual(R.PAY_GROUPS.map(g => R.payFlags(g).includes('paid_50')), [false, true, false, false, false]);
      assert.deepEqual(R.payFlags('free'), []);
    });
    test('TC-36: ticking Paid takes the deal total off Outstanding · a paid 50/50 deposit takes half', () => {
      const s = fresh(), d = ch(s).find(x => x.status === 'Complete' && !x.paid_full && R.totalCost(x) > 0), before = R.paymentsView(s, ch(s), TD).outstanding;
      const paid = R.togglePayment(d, 'paid_full', true, TD);
      assert.equal(paid.paid_full_date, TD);
      s.deals[s.deals.indexOf(d)] = paid;
      assert.equal(before - R.paymentsView(s, ch(s), TD).outstanding, R.totalCost(d));
      assert.equal(R.payTabOf(paid, TD), 'paid');
      const half = Object.assign({}, d, { payment_term: 'split_50', paid_50: true, paid_full: false });
      assert.equal(R.outstandingOf(s.lookups, half), R.totalCost(d) / 2);
    });
    test('TC-37: Payments CSV has the §4.8 columns', () => {
      const s = fresh(), rows = R.paymentsRows(s, ch(s).slice(0, 2), TD);
      assert.deepEqual(R.PAYMENTS_COLS, ['deal_id', 'kol_name', 'campaign_name', 'phase_name', 'payment_term', 'total', 'docs_date', 'deposit_date', 'paid_date', 'outstanding', 'due_status', 'pic']);
      assert.deepEqual(Object.keys(rows[0]), R.PAYMENTS_COLS);
      assert.equal(rows[0].payment_term, C.term.none);
      assert.ok(R.toCSV(R.PAYMENTS_COLS, rows).startsWith(R.PAYMENTS_COLS.join(',')));
    });
  });
});
