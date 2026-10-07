/* cr07.spec.js — CR-07 test cases (Dashboard refine, Clear all filters, Price reference, Type presets, Journey timeline), run by tests/test.html.
   "today" is 06/10/2026 in this CR. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TD = '2026-10-06';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-06T03:00:00Z'));

  describe('CR-07 R1 · Dashboard — All campaigns · By campaign', () => {
    test('TC-01: presets This year (first) · This quarter · This month · Last month — no Last 30 / 90 days', () => {
      assert.deepEqual(R.PRESETS, ['this_year', 'this_quarter', 'this_month', 'last_month']);
      assert.deepEqual(R.PRESETS.map(k => C.overview.presets[k]), ['This year', 'This quarter', 'This month', 'Last month']);
    });
    test('dateRangePreset: whole calendar periods (today 06/10/2026) · January → last December', () => {
      assert.deepEqual(['this_year', 'this_quarter', 'this_month', 'last_month'].map(k => R.dateRangePreset(k, TD)),
        [['2026-01-01', '2026-12-31'], ['2026-10-01', '2026-12-31'], ['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-09-30']]);
      assert.deepEqual(R.dateRangePreset('last_month', '2027-01-15'), ['2026-12-01', '2026-12-31']);
      assert.deepEqual(R.dateRangePreset('this_quarter', '2026-02-28'), ['2026-01-01', '2026-03-31']);
      assert.deepEqual(R.dateRangePreset('this_month', '2028-02-10'), ['2028-02-01', '2028-02-29'], 'leap year');
    });
    test('TC-02 / §5.0: Posts by preset — This year 192 · This quarter 0 · This month 0 · Last month 100 · money unchanged', () => {
      const s = fresh(), posts = k => R.allKpis(s, ...R.dateRangePreset(k, TD), TD).posts;
      assert.deepEqual(R.PRESETS.map(posts), [192, 0, 0, 100]);
      const k = R.allKpis(s, ...R.dateRangePreset('this_year', TD), TD);
      assert.deepEqual([k.committed, k.pending, k.budget, k.remaining], [1783579, 98000, 2748400, 964821]);
    });
    test('TC-05: Kiss Signal engagement — metrics on 10 of 70 posts', () => {
      const e = R.summaryCards(fresh(), { campaignId: 'KS' }, TD).engagement;
      assert.deepEqual([e.withMetrics, e.posted], [10, 70]);
    });
    test('TC-06: Kiss Signal Phase budget — Committed ฿298,700 / ฿41,700 · Campaign ฿340,400', () => {
      const pb = R.phaseBudgetRows(fresh(), 'KS');
      assert.deepEqual(pb.rows.map(r => r.committed), [298700, 41700]);
      assert.equal(pb.total.committed, 340400);
    });
    test('TC-08 / §5.0: Workload by PIC of Kiss Signal — Pizza 7 · Ja 3 · Total 10 (List 4 + In process 6)', () => {
      const s = fresh(), w = R.workloadByPic(s, { campaignId: 'KS' }, TD);
      assert.deepEqual(w.filter(r => r.open).map(r => [r.pic, r.open]), [['Pizza', 7], ['Ja', 3]]);
      assert.equal(w.reduce((a, r) => a + r.open, 0), 10);
      const open = s.deals.filter(d => d.campaign_id === 'KS' && R.isOpenDeal(d));
      assert.deepEqual([open.filter(d => d.status === 'List').length, open.filter(d => d.status === 'Inprocess').length], [4, 6]);
      assert.ok(R.workloadByPic(s, { campaignId: 'KS', phaseIds: ['KS-P2'] }, TD).reduce((a, r) => a + r.open, 0) <= 10, 'a Phase narrows it');
    });
  });

  describe('CR-07 R2 · Operations — one PIC first · Due in next 7 days', () => {
    const userOf = (s, name) => s.users.find(u => u.display_name === name);
    test('TC-09 / TC-10: Operations opens on you when you are a PIC (Amp) · on nobody for Admin (not a PIC)', () => {
      const s = fresh();
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), ''), 'Amp');
      assert.equal(R.opsPic(s, userOf(s, 'Admin'), ''), '__all', 'CR-09 §4.6: not a PIC → All PICs');
      assert.equal(R.opsPic(s, null, ''), '__all');
    });
    test('TC-11: a PIC picked (remembered) wins · one that is no longer an active PIC falls back to the default', () => {
      const s = fresh();
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), 'Pizza'), 'Pizza');
      assert.equal(R.opsPic(s, userOf(s, 'Admin'), 'Pizza'), 'Pizza');
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), '__none'), '__none', 'deals without a PIC');
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), 'Nobody'), 'Amp');
      userOf(s, 'Pizza').active = false;
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), 'Pizza'), 'Amp', 'inactive PIC');
      assert.equal(R.opsPic(s, userOf(s, 'Admin'), 'Pizza'), '__all');
    });
    test('TC-12: the PIC list has active PICs only (no "All")', () => {
      assert.deepEqual(R.picNames(fresh()), ['Amp', 'Babe', 'Dream', 'Ja', 'Lucky', 'Pang', 'Pizza']);
    });
    test('TC-13: Due in next 7 days — the seed has nothing due 06/10 – 13/10/2026', () => {
      const s = fresh();
      R.picNames(s).concat(['__none']).forEach(p => assert.deepEqual(R.upcomingDues(s, p, TD, 7), [], p));
    });
    test('TC-13: only the chosen PIC · due today … today + 7 · by date · the step that is due', () => {
      const s = fresh(), deal = id => s.deals.find(d => d.deal_id === id), pending = id => s.deal_posts.filter(p => p.deal_id === id && !p.post_date);
      deal('D000291').expected_draft1_date = '2026-10-08';                         // Amp · Brief → Draft 1
      pending('D000287').forEach(p => { p.expected_post_date = TD; });            // Amp · Draft 1 → Post, today
      pending('D000270').forEach(p => { p.expected_post_date = '2026-10-13'; });  // Amp · last day of the window
      pending('D000290').forEach(p => { p.expected_post_date = '2026-10-14'; });  // Amp · one day too late
      deal('D000114').expected_draft1_date = '2026-10-07';                         // Pizza
      const rows = R.upcomingDues(s, 'Amp', TD, 7);
      assert.deepEqual(rows.map(r => [r.deal.deal_id, r.due, R.stepShort(r.step.sub_status)]),
        [['D000287', TD, 'Post'], ['D000291', '2026-10-08', 'Draft 1'], ['D000270', '2026-10-13', 'Post']]);
      assert.deepEqual(R.upcomingDues(s, 'Pizza', TD, 7).map(r => r.deal.deal_id), ['D000114']);
      assert.deepEqual(R.upcomingDues(s, { pic: 'Amp', campaign: 'XX' }, TD, 7), [], 'the Campaign scope narrows it');
      assert.deepEqual(R.upcomingDues(s, 'Amp', '2026-10-07', 7).map(r => r.deal.deal_id), ['D000291', 'D000270', 'D000290'], 'a past due date drops out');
    });
    test('stepShort: Approve Draft 2 → Draft 2 · Approve Script → Script · Post → Post', () => {
      assert.deepEqual(['Approve Draft 2', 'Approve Script', 'Post', 'Confirm QT'].map(R.stepShort), ['Draft 2', 'Script', 'Post', 'Confirm QT']);
    });
  });

  describe('CR-07 R3 · Clear all filters · KOL drawer width', () => {
    const blank = () => Object.assign(R.blankDealFilter(), { campaign: 'CH', pic: 'all', reason: '' });
    test('activeFilters: nothing in use on a fresh Deals page (All PICs) · the Campaign is never a filter', () => {
      assert.deepEqual(R.activeFilters(blank()), []);
      assert.deepEqual(R.activeFilters(Object.assign(blank(), { campaign: 'KS' })), []);
    });
    test('TC-14 / TC-18: PIC (also "Me"), Phase, Search, chips, panel values and a Needs action reason all count', () => {
      assert.deepEqual(R.activeFilters(Object.assign(blank(), { pic: 'Amp', sub: 'Brief' })), ['pic', 'sub']);
      assert.deepEqual(R.activeFilters(Object.assign(blank(), { pic: 'me' })), ['pic'], 'TC-18: the default Me is a filter too');
      assert.deepEqual(R.activeFilters(Object.assign(blank(), { phaseSel: 'CH-P1', q: '  nano ', tiers: ['Nano'], pillar: '__none', cta: 'x', term: 'free', payState: 'due', open: true, noDate: true, outside: { from: 'a', to: 'b' }, reason: 'overdue' })),
        ['phaseSel', 'q', 'tiers', 'pillar', 'cta', 'term', 'payState', 'open', 'noDate', 'outside', 'reason']);
      assert.deepEqual(R.activeFilters(Object.assign(blank(), { q: '   ' })), [], 'blank search');
    });
    test('TC-15: Clear all filters keeps the Campaign · Phase All · PIC All · no chips · empty search → Charming open 14 (CR-13: List 3 + In process 11) · All 101', () => {
      const c = R.clearFilters(Object.assign(blank(), { phaseSel: 'CH-P1', pic: 'Amp', sub: 'Brief', q: 'abc', tiers: ['Nano'], reason: 'overdue' }));
      assert.equal(c.campaign, 'CH'); assert.equal(c.phaseSel, 'all'); assert.equal(c.pic, 'all'); assert.equal(c.q, ''); assert.equal(c.reason, '');
      assert.deepEqual(R.activeFilters(c), []);
      const s = fresh(), t = R.dealTabs(s, R.filterDeals(s, Object.assign({}, c, { pic: '' }), TD, R.dealContext(s)), TD);
      assert.deepEqual([t.counts.list + t.counts.inprocess, t.counts.all], [14, 101]);
    });
    test('TC-19: KOL Master filters in use · cleared = 911 KOLs', () => {
      const f = { q: 'ka', platform: '', tier: 'Nano', lastWorked: '', category: '', type: 'Beauty', pic: '', status: '', term: '', history: '', source: '' };
      assert.deepEqual(R.activeKolFilters(f), ['q', 'tier', 'type']);
      assert.deepEqual(R.activeKolFilters(Object.assign({}, f, { q: ' ', tier: '', type: [] })), [], 'blank search · empty multi-select');
      assert.deepEqual(R.activeKolFilters(Object.assign({}, f, { q: '', tier: '', type: ['beauty'] })), ['type']);
      assert.equal(fresh().kol_master.length, 911);
    });
    test('TC-20 / TC-21: drawer widths — CR-10 §4.13: every detail drawer 60% · 1920 → 1152 · 1440 → 864 · 1280 (menu open) → 768 · 1024 (rail) → the content area · 390 → the screen', () => {
      assert.equal(R.dealDrawerWidth(1920, 240), 1152);
      assert.equal(R.dealDrawerWidth(1440, 240), 864);
      assert.equal(R.dealDrawerWidth(1280, 240), 768);
      assert.equal(R.dealDrawerWidth(1024, 64), 960);
      assert.equal(R.dealDrawerWidth(390, 0), 390);
      assert.equal(R.dealDrawerWidth(2560, 240), 1200, 'at most 1200px');
    });
    test('TC-22: a dragged width is kept (560px … window − 320px — CR-10 §4.13)', () => {
      assert.equal(R.kolDrawerWidth(1920, 240, 900), 900);
      assert.equal(R.kolDrawerWidth(1920, 240, 400), 560, 'at least 560px');
      assert.equal(R.kolDrawerWidth(1920, 240, 1700), 1600, 'leaves 320px of the window');
      assert.equal(R.kolDrawerWidth(1440, 240, 900), 900);
      assert.equal(R.kolDrawerWidth(1024, 64, 900), 704);
      assert.equal(R.kolDrawerWidth(800, 64, 900), 736, 'too narrow for any drawer beside the page → the content area');
    });
  });

  describe('CR-07 R4 · Price reference · KOL Type presets (schema 7)', () => {
    const kolNamed = (s, n) => s.kol_master.find(k => k.display_name === n);
    const ref = (s, n, ex) => R.costReference(s, kolNamed(s, n).kol_id, ex);
    const brief = r => [r.latest ? [r.latest.total, r.latest.source, r.latest.date] : null, r.note, r.average ? [r.average.values.rate_card, r.average.values.gencode_expense, r.average.values.basket_fee, r.average.total, r.average.n] : null, r.freeExcluded];
    test('TC-25 / §5.0: genygee28 — Latest ฿3,000 Kiss Signal / Main KOL (no date) · Average ฿4,500 + ฿250 + ฿250 = ฿5,000 of 2 deals (D000211 Contacted left out)', () => {
      const s = fresh(), r = ref(s, 'genygee28');
      assert.deepEqual(brief(r), [[3000, 'Kiss Signal / Main KOL', null], null, [4500, 250, 250, 5000, 2], 0]);
      assert.deepEqual(r.average.dealIds, ['D000011', 'D000119']);
      assert.deepEqual(R.costRefRows(r), ['rate_card', 'gencode_expense', 'basket_fee', 'total']);
    });
    test('TC-28 / §5.0: sundayary · leev202 · memebowwiee · kiaokoy_22', () => {
      const s = fresh();
      assert.deepEqual(brief(ref(s, 'sundayary')), [[6500, 'Perfect Heart / KOL Master', null], null, [5000, 250, 0, 5250, 2], 0]);
      assert.deepEqual(ref(s, 'sundayary').latest.values, { rate_card: 6000, gencode_expense: 500, basket_fee: 0, asset_fee: 0, expediting_fee: 0 });
      assert.deepEqual(brief(ref(s, 'leev202')), [[2500, 'Perfect Heart / KOL Master', null], null, [3000, 0, 0, 3000, 1], 1]);
      assert.deepEqual(brief(ref(s, 'memebowwiee')), [null, null, [850, 0, 0, 850, 2], 1], 'no rate → Use of Latest is off');
      assert.deepEqual(brief(ref(s, 'kiaokoy_22')), [null, 'Ratecard: รออัพเดต', [38000, 3000, 0, 41000, 1], 0]);
    });
    test('Average: a Free term job is left out like a ฿0 job · the deal being edited is not its own reference', () => {
      const s = fresh(); s.deals.find(d => d.deal_id === 'D000011').payment_term = 'free';
      assert.deepEqual(brief(ref(s, 'genygee28')), [[3000, 'Kiss Signal / Main KOL', null], null, [5000, 500, 0, 5500, 1], 1]);
      assert.equal(ref(fresh(), 'genygee28', 'D000119').average.total, 4500);
    });
    test('TC-26: Use Average then Rate card 4,800 → Rate card 4,800 · Gencode 250 · Basket fee 250 · Total ฿5,300', () => {
      const d = Object.assign({}, ref(fresh(), 'genygee28').average.values, { rate_card: 4800 });
      assert.equal(R.totalCost(d), 5300);
    });
    test('TC-30: no cost typed → "Cost not set" (counts ฿0) · moving to Confirm QT at ฿0 asks first (not for Free, not at Contacted)', () => {
      const s = fresh(), d = Object.assign({}, s.deals.find(x => x.sub_status === 'Shortlist'), { rate_card: null, gencode_expense: null, basket_fee: null, asset_fee: null, expediting_fee: null, payment_term: 'postpaid' });
      assert.equal(R.costNotSet(d), true); assert.equal(R.totalCost(d), 0);
      assert.equal(R.zeroCostMove(s, d, 'Confirm QT'), true);
      assert.equal(R.zeroCostMove(s, d, 'Brief'), true, 'jumping past Confirm QT too');
      assert.equal(R.zeroCostMove(s, d, 'Contacted'), false);
      assert.equal(R.zeroCostMove(s, d, 'Cancel'), false);
      assert.equal(R.zeroCostMove(s, Object.assign({}, d, { payment_term: 'free' }), 'Confirm QT'), false);
      assert.equal(R.costNotSet(Object.assign({}, d, { payment_term: 'free' })), false);
      assert.equal(R.zeroCostMove(s, Object.assign({}, d, { rate_card: 3000 }), 'Confirm QT'), false);
      assert.equal(R.zeroCostMove(s, Object.assign({}, d, { sub_status: 'Confirm QT', status: 'List' }), 'Brief'), false, 'already past Confirm QT');
    });
    test('TC-31: KOL drawer › Rates summary of genygee28 — Latest rate ฿3,000 · Average ฿5,000 (2 deals)', () => {
      const r = ref(fresh(), 'genygee28'), P = C.priceRef;
      assert.equal(`${P.summaryLatest(R.baht(r.latest.total))} · ${P.summaryAvg(R.baht(r.average.total), r.average.n)}`, 'Latest rate ฿3,000 · Average ฿5,000 (2 deals)');
    });
    const typeCounts = s => { const m = R.kolTypeCounts(s); return R.kolTypeList(s.lookups).map(t => `${t.label} ${m.get(t.key) || 0}`).concat([`Not set ${m.get('')}`]); };
    const EXPECT = ['Beauty 98', 'K-beauty 22', 'Beauty expert 16', 'Make-up artist 8', 'Swatch & selling 15', 'Benefit review 7', 'Student 15', 'Lifestyle 6', 'Outdoor & activity 15', 'Fan 11', 'Overseas-based 3', 'Not set 695'];
    test('TC-32 / §5.0: schema 7 · Type counts after the migration (911 KOLs) · money unchanged', () => {
      const s = fresh();
      assert.ok(s.schema_version >= 7, 'CR-08 moved it on to 8');
      assert.deepEqual(typeCounts(s), EXPECT);
      assert.equal(s.kol_master.length, 911);
      const k = R.allKpis(s, ...R.dateRangePreset('this_year', TD), TD);
      assert.deepEqual([k.committed, k.pending, k.budget, k.remaining], [1783579, 98000, 2748400, 964821]);
    });
    test('TC-33: nanomona777 → Beauty (old "Mass Beauty") · hiweverytimenoy → Not set, note "Old type: แพง"', () => {
      const s = fresh(), a = kolNamed(s, 'nanomona777'), b = kolNamed(s, 'hiweverytimenoy');
      assert.deepEqual([a.kol_type, a.kol_type_legacy, R.kolTypeLabel(s.lookups, a.kol_type)], ['beauty', 'Mass Beauty', 'Beauty']);
      assert.deepEqual([b.kol_type, b.kol_type_legacy, b.note], [null, 'แพง', 'Old type: แพง']);
      const c = s.kol_master.find(k => k.kol_type_legacy === 'ไม่ต้องใช้อีก ');
      assert.equal(c.note.split('\n').pop(), 'Old type: ไม่ต้องใช้อีก', 'trimmed in the note');
    });
    test('TC-34: running the migration again changes nothing (no second "Old type")', () => {
      const s = fresh(), before = JSON.stringify(s.kol_master);
      s.kol_master.forEach(k => R.migrateKolType(k, s.lookups.kol_type_list));
      assert.equal(JSON.stringify(s.kol_master), before);
      assert.equal(R.withOldType('Old type: แพง', 'แพง'), 'Old type: แพง');
      assert.equal(R.withOldType('ติดต่อทาง LINE', ' แพง '), 'ติดต่อทาง LINE\nOld type: แพง');
      assert.deepEqual(typeCounts(S.migrate(JSON.parse(JSON.stringify(s)))), EXPECT);
    });
    test('TC-35: the Type filter offers the 11 presets (sort order) + Not set — no free text', () => {
      const s = fresh(), list = R.kolTypeList(s.lookups).filter(t => t.active !== false);
      assert.deepEqual(list.map(t => t.label), ['Beauty', 'K-beauty', 'Beauty expert', 'Make-up artist', 'Swatch & selling', 'Benefit review', 'Student', 'Lifestyle', 'Outdoor & activity', 'Fan', 'Overseas-based']);
      assert.ok(!s.kol_master.some(k => k.kol_type && !R.kolTypeOf(s.lookups, k.kol_type)), 'every KOL type is a preset key');
    });
    test('TC-36: add "Skincare" (key from the label) · deactivate Overseas-based → "(inactive)" · Beauty cannot be deleted (98 KOLs)', () => {
      const s = fresh(), L = s.lookups;
      assert.deepEqual(R.validateKolType(L.kol_type_list, 'Skincare', [], null).errs, []);
      assert.equal(R.kolTypeKeyFor('Skincare', L.kol_type_list), 'skincare');
      assert.equal(R.kolTypeKeyFor('Beauty', L.kol_type_list), 'beauty_2');
      assert.equal(R.kolTypeKeyFor('สายสกินแคร์', L.kol_type_list), 'type_2');
      assert.equal(R.validateKolType(L.kol_type_list, ' mass beauty ', [], null).errs[0].field, 'label', 'an alias of Beauty');
      assert.equal(R.validateKolType(L.kol_type_list, 'Skincare', ['Korea'], null).errs[0].field, 'aliases');
      assert.deepEqual(R.validateKolType(L.kol_type_list, 'Beauty', ['Mass'], 'beauty').errs, [], 'its own label / aliases');
      R.kolTypeOf(L, 'overseas').active = false;
      assert.equal(R.kolTypeLabel(L, 'overseas'), 'Overseas-based (inactive)');
      assert.equal(R.kolTypeUse(s, 'overseas'), 3);
      assert.equal(R.kolTypeUse(s, 'beauty'), 98);
      assert.deepEqual(R.splitAliases('Korea, K-pop\nkorea ,, '), ['Korea', 'K-pop', 'korea']);
    });
    test('TC-37: Import — "mass beauty" → Beauty · "xyz" → Not set + note "Old type: xyz" + a line in the report', () => {
      const s = fresh(), head = R.IMPORT_COLS;
      const row = (name, link, type) => head.map(c => ({ display_name: name, platform: 'TikTok', profile_link: link, followers: '1000', kol_type: type }[c] || ''));
      const plan = R.planImport(s, [head, row('Type Test A', 'https://www.tiktok.com/@type_test_a', 'mass beauty'), row('Type Test B', 'https://www.tiktok.com/@type_test_b', 'xyz')]);
      assert.deepEqual(plan.rows.map(r => [r.kind, r.clean.kol_type]), [['new_kol', 'beauty'], ['new_kol', null]]);
      assert.ok(plan.rows[1].warns.includes('Type not recognised: xyz → moved to note'));
      const out = R.applyImport(s, plan, new Set(), 'test.csv', TD), a = out.kol_master.find(k => k.display_name === 'Type Test A'), b = out.kol_master.find(k => k.display_name === 'Type Test B');
      assert.deepEqual([a.kol_type, a.kol_type_legacy, a.note], ['beauty', 'mass beauty', null]);
      assert.deepEqual([b.kol_type, b.kol_type_legacy, b.note], [null, 'xyz', 'Old type: xyz']);
      assert.equal(R.matchKolType('  MAKE  UP ARTIST (gen z) ', s.lookups.kol_type_list), 'makeup_artist');
    });
    test('TC-38: a schema 6 Backup is restored as schema 7 with the same Type counts', () => {
      const v7 = fresh(), v6 = JSON.parse(JSON.stringify(v7));
      v6.schema_version = 6; delete v6.lookups.kol_type_list;
      v6.kol_master.forEach(k => { k.kol_type = k.kol_type_legacy; delete k.kol_type_legacy; if (k.note) k.note = k.note.split('\n').filter(l => !l.startsWith('Old type: ')).join('\n') || null; });
      const mem = new Map(), storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
      const st = S.createStore({ seed: SEED, storage, now: () => new Date('2026-10-06T03:00:00Z') });
      const res = st.restore(JSON.stringify(v6), 'kol_tracker_backup_v6.json');
      assert.equal(res.ok, true); assert.equal(res.migratedFrom, 6);
      assert.equal(st.state.schema_version, S.SCHEMA_VERSION, 'v6 → v7 → (CR-08) v8');
      assert.deepEqual(typeCounts(st.state), EXPECT);
      assert.equal(JSON.stringify(st.state.kol_master.map(k => [k.kol_type, k.kol_type_legacy, k.note])), JSON.stringify(v7.kol_master.map(k => [k.kol_type, k.kol_type_legacy, k.note])));
    });
  });

  describe('CR-07 R5 · Journey timeline (SLA) · payment track', () => {
    const tl = (s, d) => R.dealTimeline(s.lookups, d, R.logsOf(s, d.deal_id), R.postsOf(s, d.deal_id), TD);
    const row = x => [x.short, x.state, x.date, x.days, x.late_days, x.overdue_days, x.waiting];
    const dealOf = (s, id) => s.deals.find(d => d.deal_id === id);
    test('TC-42 / §5.0: D000119 — Confirm QT done (no date) · Brief 06/08 · Draft 1 done (no date) · Draft 2 14/08 ⏱ 8 d on time · Post 15/08 ⏱ 1 d · Brief → Post 9 d', () => {
      const s = fresh(), t = tl(s, dealOf(s, 'D000119'));
      assert.deepEqual(t.steps.map(row), [['Confirm QT', 'nodate', null, null, null, null, null], ['Brief', 'done', '2026-08-06', null, null, null, null],
        ['Draft 1', 'nodate', null, null, null, null, null], ['Draft 2', 'done', '2026-08-14', 8, null, null, null], ['Post', 'done', '2026-08-15', 1, null, null, null]]);
      assert.deepEqual(t.summary, { kind: 'complete', days: 9 });
      assert.ok(t.steps.every(x => !x.late_days), 'no late label');
    });
    test('TC-43 / §5.0: D000044 — Brief 03/09 done · Draft 1 waiting 33 d (no expected) · Post due 07/09, 29 d overdue · payment track Docs → 50% → Paid', () => {
      const s = fresh(), d = dealOf(s, 'D000044'), t = tl(s, d);
      assert.deepEqual(t.steps.map(row), [['Confirm QT', 'nodate', null, null, null, null, null], ['Brief', 'done', '2026-09-03', null, null, null, null],
        ['Draft 1', 'current', null, null, null, null, 33], ['Post', 'overdue', null, null, null, 29, null]]);
      assert.equal(t.steps[3].expected, '2026-09-07');
      assert.deepEqual(t.summary, { kind: 'progress', days: 33 });
      const p = R.paymentTimeline(d, TD);
      assert.deepEqual([p.term, p.state, p.items.map(x => [x.flag, x.done])], [null, 'not_due', [['docs_done', false], ['paid_50', false], ['paid_full', false]]]);
    });
    test('TC-44: Draft 1 approved 3 days after its expected date → done late "+3 d late"', () => {
      const s = fresh(), d = Object.assign({}, dealOf(s, 'D000044'), { sub_status: 'Approve Draft 1', expected_draft1_date: '2026-09-10', approved_draft1_date: '2026-09-13' });
      const x = tl(s, d).steps.find(y => y.short === 'Draft 1');
      assert.deepEqual([x.state, x.date, x.late_days, x.days], ['late', '2026-09-13', 3, 10]);
      assert.equal(C.journey.late(x.late_days), '+3 d late');
      const cur = tl(s, Object.assign({}, dealOf(s, 'D000044'), { expected_draft1_date: '2026-10-01' })).steps.find(y => y.short === 'Draft 1');
      assert.deepEqual([cur.state, cur.waiting, cur.overdue_days], ['current', 33, 5], 'a waiting step past its expected date');
    });
    test('TC-45: Script + 3 drafts = 8 steps (Shortlist / Contacted only when the deal was there)', () => {
      const s = fresh(), d = Object.assign({}, dealOf(s, 'D000044'), { draft_rounds: 3, script_required: true });
      const t = tl(s, d);
      assert.deepEqual(t.steps.map(x => x.short), ['Confirm QT', 'Brief', 'Script', 'Draft 1', 'Draft 2', 'Draft 3', 'Post']);
      const logs = R.logsOf(s, 'D000044').concat([{ log_id: 1, deal_id: 'D000044', sub_status: 'Contacted', effective_date: '2026-08-20' }]);
      assert.deepEqual(R.dealTimeline(s.lookups, d, logs, R.postsOf(s, 'D000044'), TD).steps.map(x => x.short), ['Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Draft 2', 'Draft 3', 'Post']);
    });
    test('TC-46: a cancelled deal stops at the step it reached, then "Cancelled" with its date and reason', () => {
      const s = fresh(), d = Object.assign({}, dealOf(s, 'D000044'), { status: 'Cancel', sub_status: 'Cancel', cancel_reason: 'KOL ไม่ตอบ' });
      const logs = R.logsOf(s, 'D000044').concat([{ log_id: 99999, deal_id: 'D000044', from_sub_status: 'Brief', sub_status: 'Cancel', effective_date: '2026-09-20', note: null }]);
      const t = R.dealTimeline(s.lookups, d, logs, R.postsOf(s, 'D000044'), TD);
      assert.deepEqual(t.steps.map(x => [x.short, x.state]), [['Confirm QT', 'nodate'], ['Brief', 'done']]);
      assert.deepEqual([t.cancelled.date, t.cancelled.reason, t.summary], ['2026-09-20', 'KOL ไม่ตอบ', null]);
    });
    test('payment track by term: prepaid · split_50 · postpaid · free', () => {
      const d = Object.assign({}, dealOf(fresh(), 'D000044'));
      const items = t => R.paymentTimeline(Object.assign({}, d, { payment_term: t }), TD).items.map(x => `${x.flag}${x.when ? '@' + x.when : ''}`);
      assert.deepEqual(items('prepaid'), ['docs_done', 'paid_full@before_brief']);
      assert.deepEqual(items('split_50'), ['docs_done', 'paid_50@before_brief', 'paid_full@after_post']);
      assert.deepEqual(items('postpaid'), ['docs_done', 'paid_full@after_post']);
      assert.deepEqual(items('free'), []);
      assert.equal(R.paymentTimeline(Object.assign({}, d, { payment_term: 'prepaid' }), TD).state, 'overdue');
    });
  });
});
