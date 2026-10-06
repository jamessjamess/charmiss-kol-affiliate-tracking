/* cr09.spec.js — CR-09 test cases (Dashboard · Campaign & Phase · Deals · Payments refine), run by tests/test.html.
   "today" is 06/10/2026 · the seed's 4 Campaigns · money anchors stay those of CR-05 §5.0. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED, X, E } = t;
  const TD = '2026-10-06';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-06T03:00:00Z'));
  const O = C.overview;
  const thisYear = () => R.presetRange('this_year', TD);

  describe('CR-09 R1 · All campaigns: KPI cards · KOL tier mix · Days left · time axis · Export', () => {
    test('TC-01: 5 cards (This year) — Campaigns 4 (On going 3 · Complete 1) · Next to end Charming 18 days · Deals 300 · Committed / Paid / KOLs engaged', () => {
      const s = fresh(), [from, to] = thisYear(), k = R.portfolioKpis(s, from, to, TD, false);
      assert.deepEqual([k.campaigns.n, k.campaigns.by], [4, { ongoing: 3, complete: 1 }]);
      assert.deepEqual([k.campaigns.next.campaign.campaign_name, k.campaigns.next.left], ['Charming Iconic Glow', { kind: 'left', n: 18, soon: false }]);
      assert.deepEqual(k.deals, { n: 300, list: 37, inprocess: 33, complete: 230 });
      assert.deepEqual([k.money.committed, k.money.budget, Math.round(k.money.usedPct), k.money.remaining, k.money.pending], [1783579, 2748400, 65, 964821, 98000]);
      assert.deepEqual([k.paid.paid, Math.round(k.paid.pct), k.paid.outstanding], [774579, 43, 1009000]);
      assert.deepEqual(k.kols, { n: 237, deals: 263, avg: 6782 });
      assert.equal(E.daysText(k.campaigns.next.left), '18 days left');
    });
    test('TC-03: KOL tier mix — Spend ฿1,783,579 (Mega → Nano, no Unknown spend) · Deals 263 (Unknown 1) · order Mega → Unknown', () => {
      const s = fresh(), [from, to] = thisYear(), m = R.tierMix(s, from, to, TD, false);
      assert.deepEqual(m.rows.map(x => x.tier), ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano', 'Unknown']);
      assert.deepEqual(m.rows.map(x => x.spend), [169500, 968679, 148400, 427000, 70000, 0]);
      assert.deepEqual(m.rows.map(x => x.spendPct.toFixed(1)), ['9.5', '54.3', '8.3', '23.9', '3.9', '0.0']);
      assert.deepEqual(m.rows.map(x => x.deals), [9, 73, 31, 108, 41, 1]);
      assert.deepEqual(m.total, { deals: 263, spend: 1783579 });
      assert.equal(E.followers(m.rows[1]), '100,000–999,999');
      assert.equal(E.followers(m.rows[0]), '1,000,000+');
    });
    test('TC-06: Days left — Charming 18 · Kiss Signal 25 · Perfect Heart 25 · Acne Fade — · On going first when sorted', () => {
      const s = fresh(), [from, to] = thisYear();
      const m = E.portfolioModel({ state: s, from, to, today: TD, inclCancel: false, sort: { key: 'days', dir: 'asc' } });
      assert.deepEqual(m.rows.map(r => [r.campaign.campaign_name, E.daysText(r.days)]),
        [['Charming Iconic Glow', '18 days left'], ['Kiss Signal Lip Gloss', '25 days left'], ['Perfect Heart ซอง 7-11', '25 days left'], ['Acne Fade Concealer', '—']]);
      const kinds = [[{ status: 'ongoing', to: '2026-10-06' }, 'Last day'], [{ status: 'ongoing', to: '2026-10-12' }, '6 days left'], [{ status: 'not_started', from: '2026-10-09' }, 'Starts in 3 days'],
        [{ status: 'on_hold', to: '2026-12-01' }, 'On hold'], [{ status: 'cancelled' }, '—'], [{ status: 'complete', to: '2026-10-04' }, '—']];
      kinds.forEach(([item, txt]) => assert.equal(E.daysText(R.daysLeft(item, TD)), txt, txt));
      assert.equal(R.daysLeft({ status: 'ongoing', to: '2026-10-12' }, TD).soon, true, '7 days or fewer');
    });
    test('TC-04 / TC-05: time axis — This year = weeks, ticks on the 1st of Jan … Dec · Last month = days, ticks on Mondays "7 Sep" … · 10 days = every day', () => {
      const y = R.timeAxis('2026-01-01', '2026-12-31');
      assert.deepEqual([y.gran, y.mode], ['week', 'month']);
      assert.deepEqual(y.ticks.map(x => x.label), O.months);
      assert.ok(y.ticks.every(x => x.date.endsWith('-01')));
      const lm = R.timeAxis(...R.presetRange('last_month', TD));
      assert.deepEqual([lm.gran, lm.mode, lm.ticks.map(x => x.label)], ['day', 'monday', ['7 Sep', '14 Sep', '21 Sep', '28 Sep']]);
      assert.deepEqual(R.timeAxis('2026-10-01', '2026-10-03').ticks.map(x => x.label), ['Thu 1', 'Fri 2', 'Sat 3']);
      assert.deepEqual(R.timeAxis('2026-11-01', '2027-03-31').ticks.map(x => x.label), ['Nov', 'Dec', 'Jan 27', 'Feb', 'Mar'], 'a range across a year names it on January');
      assert.equal(R.timeAxis('2026-10-01', '2026-12-31').gran, 'day', 'This quarter (92 days) = days');
    });
    test('TC-07: Campaign portfolio rows — numbers stay numbers · % as a decimal · dd/mm/yyyy · Total ฿2,748,400 / ฿1,783,579 / ฿964,821 / ฿98,000', () => {
      const s = fresh(), [from, to] = thisYear(), t = E.rowsFor('portfolio', { state: s, from, to, today: TD, inclCancel: false });
      assert.deepEqual(t.header, ['Campaign', 'Status', 'From', 'To', 'Days left', 'Budget', 'Committed', 'Used %', 'Remaining', 'Pending', 'Deals']);
      assert.deepEqual(t.rows[0], ['Charming Iconic Glow', 'On going', '01/09/2026', '24/10/2026', 18, 850000, 863700, 1.0161, -13700, 5100, 101]);
      assert.deepEqual(t.total, ['Total', '', '', '', '', 2748400, 1783579, 0.649, 964821, 98000, 300]);
      const csv = E.csvOf(t);
      assert.ok(csv.includes('Total,,,,,2748400,1783579,0.649,964821,98000,300'));
      assert.ok(!/฿/.test(csv));
      assert.equal(E.fileName('Campaign_portfolio', E.scopeName('this_year', from, to), TD, 'xlsx'), 'Campaign_portfolio_This-year_2026-10-06.xlsx');
      assert.equal(E.scopeName('custom', '2026-09-01', '2026-09-30'), '2026-09-01_2026-09-30');
    });
    test('TC-08: Export the tab — one workbook, 4 sheets (Summary · Activity · KOL tier mix · Campaign portfolio) · Summary starts with the tab, scope, date and who', () => {
      const s = fresh(), [from, to] = thisYear(), x = { state: s, from, to, today: TD, inclCancel: false, measure: 'posts' };
      const tables = E.tabTables('all', x), meta = { tab: 'All campaigns', scope: 'This year · 01/01/2026 – 31/12/2026', at: '06/10/2026 10:00', by: 'Admin' };
      assert.deepEqual(tables.map(t => t.name), ['Summary', 'Activity', 'KOL tier mix', 'Campaign portfolio']);
      const sheets = tables.map((t, i) => E.sheetOf(t, i ? null : meta));
      assert.deepEqual(sheets[0].rows.slice(0, 4).map(r => [r[0].v, r[1]]), [['Tab', 'All campaigns'], ['Scope', meta.scope], ['Exported', '06/10/2026 10:00'], ['Exported by', 'Admin']]);
      const val = metric => tables[0].rows.find(r => r[1] === metric)[2];
      assert.deepEqual([val('Campaigns'), val('Deals'), val('Committed'), val('Paid'), val('Outstanding'), val('KOLs engaged'), val('Avg per deal')], [4, 300, 1783579, 774579, 1009000, 237, 6782]);
      const act = tables[1];
      assert.equal(act.header[0], 'Week starting');
      assert.equal(act.rows.length, 53);
      assert.equal(act.total[act.total.length - 1], act.rows.reduce((a, r) => a + r[r.length - 1], 0), 'the Total row adds the weeks up');
      const bytes = X.workbook(sheets), td = new TextDecoder(), text = td.decode(bytes);
      ['Summary', 'Activity', 'KOL tier mix', 'Campaign portfolio'].forEach(n => assert.ok(text.includes(`name="${n}"`), n));
      assert.ok(!/Payee|account_no|full_name/.test(JSON.stringify(tables)), 'nothing from the Payee vault');
    });
    test('TC-02 / anchors: the numbers of the cards are those of the portfolio and of CR-05 §5.0', () => {
      const s = fresh(), [from, to] = thisYear(), p = R.portfolio(s, from, to, TD, false), k = R.portfolioKpis(s, from, to, TD, false);
      assert.deepEqual([p.total.committed, p.total.pending, p.total.budget, p.total.remaining, p.total.paid], [k.money.committed, k.money.pending, k.money.budget, k.money.remaining, k.paid.paid]);
      const inclC = R.portfolioKpis(s, from, to, TD, true);
      assert.equal(inclC.campaigns.n, 4, 'no Cancelled Campaign in the seed');
    });
  });

  describe('CR-09 R2 · By campaign: Daily · Color by Pillar / KOL Tier · Days left · Export · Operations All PICs', () => {
    const charming = s => s.campaigns.find(c => c.campaign_name === 'Charming Iconic Glow');
    const campX = (s, o) => Object.assign({ state: s, campaignId: charming(s).campaign_id, phaseId: '', today: TD, gran: 'day', measure: 'posts', colorBy: 'tier' }, o || {});
    const userOf = (s, n) => s.users.find(u => u.display_name === n);
    test('TC-09: Color by = KOL Tier (Mega → Unknown) or Pillar — no Phase · bars by the deal\'s tier', () => {
      const s = fresh(), sc = { campaignId: charming(s).campaign_id };
      assert.deepEqual(R.activitySeries(s, sc, 'tier', TD).map(x => x.label), ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano', 'Unknown']);
      assert.deepEqual(R.activitySeries(s, sc, 'pillar', TD).map(x => x.label), ['Awareness', 'Consideration', 'Conversion', 'Pillar not set']);
      const [from, to] = R.activityRange(s, sc, TD), d = R.activityBins(s, sc, from, to, 'day', 'posts', 'tier', TD);
      assert.ok(d.totals.every(t => ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano', 'Unknown'].includes(t.key)));
      assert.equal(d.totals.reduce((a, t) => a + t.posted + t.planned, 0), d.bins.reduce((a, b) => a + b.total, 0) + d.undated.count + d.outside);
    });
    test('TC-11: Charming by Pillar = only "Pillar not set" (no pillar set yet)', () => {
      const t = E.rowsFor('activity_camp', campX(fresh(), { colorBy: 'pillar' }));
      assert.deepEqual(t.header, ['Date', 'Pillar not set', 'Posted', 'Planned', 'Total']);
    });
    test('TC-13: the range line of Charming — "01/09/2026 – 24/10/2026 · Day 36 of 54 · 18 days left"', () => {
      const s = fresh(), st = R.rangeStatus(...R.scopeRange(s, { campaignId: charming(s).campaign_id }), TD);
      assert.equal(`${O.rangeRunning(R.dmy(st.from), R.dmy(st.to), st.day, st.of)} · ${E.daysText(R.daysLeft({ status: 'ongoing', from: st.from, to: st.to }, TD))}`, '01/09/2026 – 24/10/2026 · Day 36 of 54 · 18 days left');
    });
    test('TC-14: Export By campaign (Charming) — 5 sheets · Phase budget total ฿863,700 · Workload by PIC Open 14', () => {
      const tables = E.tabTables('campaign', campX(fresh()));
      assert.deepEqual(tables.map(t => t.name), ['Summary', 'Activity by date', 'Phase budget', 'Allocation vs target', 'Workload by PIC']);
      assert.equal(tables[2].total[4], 863700);
      assert.equal(tables[4].total[1], 14);
      assert.deepEqual(tables[1].header.slice(0, 2), ['Date', 'Mega'], 'Daily · by KOL tier');
      assert.equal(E.rowsFor('activity_camp', campX(fresh(), { gran: 'week' })).header[0], 'Week starting');
      assert.ok(!/Payee|account_no|full_name/.test(JSON.stringify(tables)));
    });
    test('TC-15 / TC-16: Operations starts on the user when a PIC (Amp) · else All PICs (Admin) · All PICs = no PIC filter', () => {
      const s = fresh();
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), ''), 'Amp');
      assert.equal(R.opsPic(s, userOf(s, 'Admin'), ''), '__all');
      assert.equal(R.opsPic(s, userOf(s, 'Amp'), '__all'), '__all', 'chosen and remembered');
      const all = R.opsQueues(s, { pic: '', campaign: '', tier: '' }, TD), amp = R.opsQueues(s, { pic: 'Amp', campaign: '', tier: '' }, TD);
      assert.ok(all.overdue.length > amp.overdue.length && amp.overdue.every(d => all.overdue.includes(d)));
    });
    test('TC-47: Export Operations (Amp) — Summary · Queue · Active pipeline · Due in next 7 days · the numbers on screen', () => {
      const s = fresh(), x = { state: s, f: { pic: 'Amp', campaign: '', tier: '' }, picLabel: 'Amp', today: TD, queue: 'overdue' };
      const tables = E.tabTables('ops', x), Q = R.opsQueues(s, x.f, TD);
      assert.deepEqual(tables.map(t => t.name), ['Summary', 'Queue', 'Active pipeline', 'Due in next 7 days']);
      assert.equal(tables[1].rows.length, Q.overdue.length);
      assert.deepEqual(tables[0].rows.find(r => r[1] === O.queues.unpaid), [O.queuesL, O.queues.unpaid, Q.unpaid.length]);
      assert.equal(tables[0].rows.find(r => r[1] === O.payDocsMissing)[2], 18);
    });
  });

  describe('CR-09 R3 · Campaign & Phase: Staff edit Products · Days left · migration v9', () => {
    const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
    const withProducts = s => { s.products.push({ tr_code: 'TR-001', product_name: 'Cushion', variant: '01 Light', active: true }, { tr_code: 'TR-002', product_name: 'Cushion', variant: '02 Natural', active: true });
      R.setCampaignProducts(s, 'CH', ['TR-001', 'TR-002']); return s; };
    const as = role => ({ user_id: 'X', role, active: true });
    test('TC-17 / TC-18: Campaign products — Admin · KOL Manager · Staff (not Viewer, not Accounting) · the rest of a Campaign stays Admin / KOL Manager', () => {
      assert.deepEqual(['admin', 'kol_manager', 'staff', 'viewer', 'accounting'].map(r => R.can(as(r), 'campaign.products')), [true, true, true, false, false]);
      assert.deepEqual(['admin', 'kol_manager', 'staff'].map(r => R.can(as(r), 'campaign.edit')), [true, true, false]);
      assert.ok(C.roles.perm['campaign.products'], 'a row in the Role Management matrix');
    });
    test('TC-48: a new product goes into the catalog and the Campaign · a campaign_events "products" row (from / to TR codes)', () => {
      const s = withProducts(fresh());
      assert.deepEqual(R.validateProduct(s, { tr_code: 'TEST-001', product_name: 'Test product' }, true).errs, []);
      s.products.push({ tr_code: 'TEST-001', product_name: 'Test product', variant: null, active: true });
      const before = R.campaignProductCodes(s, 'CH'), after = before.concat(['TEST-001']);
      R.setCampaignProducts(s, 'CH', after);
      s.campaign_events.push({ event_id: 1, campaign_id: 'CH', type: 'products', from: { products: before }, to: { products: after }, changed_at: '2026-10-06T03:00:00Z', changed_by: 'U001', note: null });
      assert.deepEqual(R.campaignProductCodes(s, 'CH'), ['TR-001', 'TR-002', 'TEST-001']);
      assert.equal(R.changedByName(s, s.campaign_events[0].changed_by), 'Amp');
      assert.equal(C.campaign.productsUpdated('06/10/2026', 'Amp'), 'Updated 06/10/2026 by Amp');
    });
    test('TC-49: a product deals use leaves the Campaign only after a question — a warning, the deal keeps it (info "Product not in campaign")', () => {
      const s = withProducts(fresh()), d = s.deals.find(x => x.campaign_id === 'CH' && R.isOpenDeal(x));
      R.setDealProducts(s, d.deal_id, [{ tr_code: 'TR-002', qty: 1 }]);
      const chk = R.checkCampaignProducts(s, 'CH', ['TR-001']);
      assert.deepEqual([chk.errs.length, chk.warns.length], [0, 1]);
      assert.equal(C.products.removeUsedBody(1), '1 deal use this product. Remove anyway? (those deals keep it)');
      R.setCampaignProducts(s, 'CH', ['TR-001']);
      assert.equal(R.dealProductList(s, d.deal_id).length, 1, 'deal_products stay');
      const v = R.validateDeal(s, Object.assign({}, d, { products: R.dealProductList(s, d.deal_id) }), R.postsOf(s, d.deal_id), TD);
      assert.ok(!v.errs.some(e => /TR-002|02 Natural/.test(e.msg)), 'not an error on the deal');
      assert.ok(v.infos.some(e => e.msg === C.msg.productKeptNotInCampaign('Cushion · 02 Natural')));
      assert.ok(R.validateDealProducts(s, 'CH', [{ tr_code: 'TR-002', qty: 1 }], []).length, 'a new pick must still be in the list');
    });
    test('TC-19: Days left of Phases — On going n days (7 or fewer = soon) · Complete — · a Campaign on hold says On hold', () => {
      const s = fresh(), ph = s.phases.filter(p => p.campaign_id === 'CH'), item = p => ({ status: R.phaseStatus(p, TD), from: p.start_date, to: p.end_date });
      assert.deepEqual(R.sortPhases(ph).map(p => E.daysText(R.daysLeft(item(p), TD))), ['—', '18 days left']);
      assert.equal(R.daysLeft({ status: 'ongoing', from: '2026-10-01', to: '2026-10-10' }, TD).soon, true);
      assert.equal(E.daysText(R.daysLeft({ status: 'on_hold' }, TD)), 'On hold');
      const c = s.campaigns.find(x => x.campaign_id === 'CH');
      assert.deepEqual(R.daysLeft(R.campaignItem(s, c, TD), TD), { kind: 'left', n: 18, soon: false });
    });
    test('TC-50: migration v9 (localStorage schema 8 and a schema 8 Backup) — schema 9 · campaign_events kept · Earn (Accounting) once · a deleted Earn stays deleted · money unchanged', () => {
      const v8 = JSON.parse(JSON.stringify(fresh()));
      v8.schema_version = 8; v8.users = v8.users.filter(u => u.display_name !== 'Earn'); delete v8.campaign_events;
      const m = S.migrate(JSON.parse(JSON.stringify(v8)));
      assert.deepEqual([m.schema_version, m.campaign_events, m.users.filter(u => u.display_name === 'Earn').map(u => [u.user_id, u.role, u.is_pic, u.active])], [9, [], [['U008', 'accounting', false, true]]]);
      const store = memStorage(), now = () => new Date('2026-10-06T03:00:00Z'), st = S.createStore({ seed: SEED, storage: store, now });
      const backup = Object.assign({}, v8, { campaign_events: [] });   // a real v8 Backup has the list (since v5)
      const r = st.restore(JSON.stringify(backup), 'kol_tracker_backup_v8.json');
      assert.deepEqual([r.ok, r.migratedFrom, st.state.schema_version], [true, 8, 9]);
      st.state.users = st.state.users.filter(u => u.display_name !== 'Earn'); st.save();
      const again = S.createStore({ seed: SEED, storage: store, now });
      assert.equal(again.state.users.some(u => u.display_name === 'Earn'), false, 'not added back');
      const s = fresh(), t = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD);
      assert.deepEqual([t.committed, t.unpaid, t.paid], [1783579, 130, 774579]);
      assert.deepEqual([R.payQueue(s, TD).items.filter(x => x.status !== 'not_due').length, R.round2(R.payQueue(s, TD).items.filter(x => x.status !== 'not_due').reduce((a, x) => a + x.tax.gross, 0))], [125, 826950]);
    });
  });
});
