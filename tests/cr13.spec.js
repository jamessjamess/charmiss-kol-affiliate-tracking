/* cr13.spec.js — CR-13 test cases (Dashboard order · Pillar mix · Phase greys · Deals tabs), run by tests/test.html.
   "today" is 07/10/2026 · the seed · This year · All PICs · money anchors stay those of CR-05 §5.0 / CR-09 §5.0. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED, C, E } = t;
  const TD = '2026-10-07';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-07T03:00:00Z'));
  const camp = (s, n) => s.campaigns.find(c => c.campaign_name.startsWith(n));
  const year = () => R.presetRange('this_year', TD);

  describe('CR-13 R1 · Pillar mix · All campaigns order · Phase greys', () => {
    test('TC-02 / TC-05: Pillar mix — Spend ฿1,783,579 (Awareness 55,500 · Consideration 89,600 · Conversion 73,200 · Not set 1,565,279 = 87.8%) · Deals 263 (11 · 22 · 14 · 216) · Not set last', () => {
      const s = fresh(), [f, to] = year(), m = R.pillarMix(s, f, to, TD, false);
      assert.deepEqual(m.rows.map(x => x.pillar), ['Awareness', 'Consideration', 'Conversion', R.NOT_SET]);
      assert.deepEqual(m.rows.map(x => x.spend), [55500, 89600, 73200, 1565279]);
      assert.deepEqual(m.rows.map(x => x.deals), [11, 22, 14, 216]);
      assert.deepEqual([m.total.spend, m.total.deals], [1783579, 263]);
      assert.deepEqual(m.rows.map(x => x.spendPct.toFixed(1)), ['3.1', '5.0', '4.1', '87.8']);
      const tm = R.tierMix(s, f, to, TD, false);
      assert.deepEqual([tm.total.spend, tm.total.deals], [m.total.spend, m.total.deals], 'the same scope as the KOL tier mix');
    });
    test('TC-03: against the target 10 / 20 / 70 — of the ฿218,300 with a pillar 25.4% · 41.0% · 33.5% → +15.4pp · +21.0pp · −36.5pp · Not set has no target', () => {
      const s = fresh(), [f, to] = year(), m = R.pillarMix(s, f, to, TD, false);
      assert.equal(m.set.spend, 218300);
      assert.deepEqual(m.rows.map(x => x.target), [10, 20, 70, null]);
      assert.deepEqual(m.rows.slice(0, 3).map(x => x.ofSet.spend.toFixed(1)), ['25.4', '41.0', '33.5']);
      assert.deepEqual(m.rows.map(x => x.gap.spend == null ? '—' : (x.gap.spend > 0 ? '+' : x.gap.spend < 0 ? '−' : '±') + Math.abs(x.gap.spend).toFixed(1) + 'pp'), ['+15.4pp', '+21.0pp', '−36.5pp', '—']);
      /* the same function as Allocation vs target */
      const sh = R.pillarShares({ Awareness: 55500, Consideration: 89600, Conversion: 73200 }, R.pillarTargetOf(s, null));
      assert.deepEqual(m.rows.slice(0, 3).map(x => x.gap.spend), R.PILLARS.map(p => sh.gap[p]));
    });
    test('TC-04: more than half of the spend with no pillar → the line, pointing at the Campaign with the most of it', () => {
      const s = fresh(), [f, to] = year(), m = R.pillarMix(s, f, to, TD, false);
      assert.equal(m.notSetPct.toFixed(1), '87.8');
      assert.equal(m.mostNoPillar, camp(s, 'Charming').campaign_id);
      assert.equal(C.overview.noPillarLine('87.8'), '87.8% of spend has no pillar');
    });
    test('portfolio target — each Campaign\'s own target weighted by its budget · none with a budget → plain average', () => {
      const s = fresh(), a = camp(s, 'Charming'), b = camp(s, 'Kiss');
      a.pillar_target = { awareness: 40, consideration: 30, conversion: 30 }; a.budget_kol = 300000;
      b.pillar_target = null; b.budget_kol = 100000;
      const tg = R.portfolioPillarTarget(s, [a, b]);
      assert.deepEqual([tg.awareness, tg.consideration, tg.conversion], [32.5, 27.5, 40]);
      a.budget_kol = null; b.budget_kol = null;
      const avg = R.portfolioPillarTarget(s, [a, b]);
      assert.deepEqual([avg.awareness, avg.consideration, avg.conversion], [25, 25, 50]);
    });
    test('TC-06: Export of All campaigns — Summary · Campaign portfolio · Activity · Pillar mix · KOL tier mix · Pillar mix = the card', () => {
      const s = fresh(), [f, to] = year(), x = { state: s, from: f, to, today: TD, inclCancel: false, measure: 'posts', sort: null };
      const tables = E.tabTables('all', x);
      assert.deepEqual(tables.map(tb => tb.name), ['Summary', 'Campaign portfolio', 'Activity', 'Pillar mix', 'KOL tier mix']);
      const pm = tables[3];
      assert.deepEqual(pm.rows.map(r => [r[0], r[1], r[3]]), [['Awareness', 55500, 11], ['Consideration', 89600, 22], ['Conversion', 73200, 14], ['Not set', 1565279, 216]]);
      assert.deepEqual(pm.rows.map(r => r[6]), [15.4, 21, -36.5, '']);
      assert.deepEqual([pm.total[1], pm.total[3]], [1783579, 263]);
    });
    test('TC-08 / TC-09: Phase steps — round(linspace(1, 6, n)) · 1 → [4] · 7 → 1–6 then 6 · Kiss Signal 1 · 6 · Perfect Heart 1 · 3 · 4 · 6', () => {
      assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(R.phaseSteps), [[4], [1, 6], [1, 4, 6], [1, 3, 4, 6], [1, 2, 4, 5, 6], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 6]]);
      const s = fresh(), steps = n => R.sortPhases(R.phasesOfCampaign(s, camp(s, n).campaign_id)).map(p => R.phaseStep(s, p.phase_id));
      assert.deepEqual(steps('Kiss'), [1, 6]);
      assert.deepEqual(steps('Perfect'), [1, 3, 4, 6]);
      assert.deepEqual(steps('Charming'), [1, 6]);
      assert.deepEqual(steps('Acne'), [4]);
    });
    test('TC-10: the step of a Phase comes from its Campaign — a filter (one Phase shown) does not change it', () => {
      const s = fresh(), ph = R.sortPhases(R.phasesOfCampaign(s, camp(s, 'Perfect').campaign_id));
      assert.equal(R.phaseStep(s, ph[2].phase_id), 4);
      assert.equal(R.phaseStep(s, 'NOPE'), null);
    });
  });

  describe('CR-13 R2 · Deals state tabs = the Pipeline groups · attention chips', () => {
    const scoped = (s, n, pic) => R.filterDeals(s, Object.assign(R.blankDealFilter(), { campaign: camp(s, n).campaign_id, pic: pic || '' }), TD, R.dealContext(s));
    const nameOf = (s, d) => (R.kolById(s, d.kol_id) || {}).display_name;
    test('TC-13: Charming Iconic Glow — All 101 · List 3 · In process 11 · Complete 87 · Cancelled 0 · All first (the default) · names of the Pipeline groups', () => {
      const s = fresh(), t = R.dealTabs(s, scoped(s, 'Charming'), TD, null, { tab: 'all' });
      assert.deepEqual(R.DEAL_TABS, ['all', 'list', 'inprocess', 'complete', 'cancelled']);
      assert.deepEqual(R.DEAL_TABS.map(k => t.counts[k]), [101, 3, 11, 87, 0]);
      const D = C.deal;
      assert.deepEqual([D.tabs.list, D.tabs.inprocess, D.tabs.complete, D.tabs.cancelled], [C.status.List, C.status.Inprocess, C.status.Complete, C.status.Cancel]);
      assert.equal(R.dealTabPref('', 'U1'), 'all', 'nothing remembered → All');
    });
    test('the tab is remembered for each person under deals.stateTab.v2 · the old values open / needs are not read', () => {
      let json = R.setDealTabPref('', 'U1', 'complete');
      json = R.setDealTabPref(json, 'U2', 'inprocess');
      assert.equal(R.DEAL_TAB_KEY, 'deals.stateTab.v2');
      assert.deepEqual([R.dealTabPref(json, 'U1'), R.dealTabPref(json, 'U2'), R.dealTabPref(json, 'U3')], ['complete', 'inprocess', 'all']);
      assert.deepEqual([R.dealTabPref('{"U1":"open"}', 'U1'), R.dealTabPref('{"U1":"needs"}', 'U1'), R.dealTabPref('not json', 'U1')], ['all', 'all', 'all']);
    });
    test('TC-14: In process + Group by Stage → only Brief / Approve … in Pipeline order · All → every step, Cancelled last', () => {
      const s = fresh(), ctx = R.dealContext(s), rows = scoped(s, 'Perfect');
      const order = R.stageOrder(s.lookups), inproc = order.filter(x => x.status === 'Inprocess').map(x => x.key);
      const g = R.groupDeals(s, rows.filter(d => R.inDealTab(d, 'inprocess')), 'stage', ctx, TD).map(x => x.key);
      assert.ok(g.length > 0 && g.every(k => inproc.includes(k)));
      assert.deepEqual(g, inproc.filter(k => g.includes(k)), 'Pipeline order');
      const all = R.groupDeals(s, rows, 'stage', ctx, TD).map(x => x.key);
      assert.equal(all[all.length - 1], C.stage.cancelled, 'Perfect Heart has 3 cancelled — last');
      assert.deepEqual(all, order.map(x => x.key).filter(k => all.includes(k)));
    });
    test('TC-15: chips in All — Overdue 3 (pangxnstory · sanggannualpong · tuckpx) · no Unpaid after posting · the chip filters · Clear all takes it off', () => {
      const s = fresh(), rows = scoped(s, 'Charming'), t = R.dealTabs(s, rows, TD, null, { tab: 'all' });
      assert.deepEqual(R.ATTENTION, ['overdue', 'needsPhase', 'shipOverdue', 'metricsDue', 'docs']);
      assert.equal(t.chips.overdue, 3);
      assert.ok(!('unpaid' in t.chips) && !('payOverdue' in t.chips));
      assert.deepEqual(rows.filter(d => R.hasReason(d, 'overdue', t.why)).map(d => nameOf(s, d)).sort(), ['pangxnstory', 'sanggannualpong', 'tuckpx']);
      /* the chip is a filter: the tabs count with it */
      const on = R.dealTabs(s, rows, TD, null, { tab: 'all', reason: 'overdue' });
      assert.deepEqual(R.DEAL_TABS.map(k => on.counts[k]), [3, 0, 3, 0, 0]);
      assert.ok(R.activeFilters({ reason: 'overdue' }).includes('reason'));
      assert.equal(R.clearFilters({ campaign: 'CH', reason: 'overdue' }).reason, '');
      assert.ok(!Object.values(C.deal.attn).includes('Unpaid after posting') && !Object.values(C.deal.tabs).includes('Needs action') && !Object.values(C.deal.tabs).includes('Open'));
    });
    test('TC-16: Complete — Docs to collect / Metrics due, no Overdue · ⚠ = the reasons of the chips only · hover "Metrics due · 1 post"', () => {
      const s = fresh(), rows = scoped(s, 'Charming'), t = R.dealTabs(s, rows, TD, null, { tab: 'complete' });
      assert.equal(t.chips.overdue, 0);
      assert.ok(t.chips.docs > 0 && t.chips.metricsDue > 0);
      const done = rows.filter(d => d.status === 'Complete' && t.why.has(d.deal_id));
      assert.ok(done.every(d => t.why.get(d.deal_id).every(x => R.ATTENTION.includes(x.key) && x.key !== 'overdue')));
      /* the numbers per chip in this tab = the deals with that reason in this tab */
      R.ATTENTION.forEach(k => assert.equal(t.chips[k], rows.filter(d => R.inDealTab(d, 'complete') && R.hasReason(d, k, t.why)).length, k));
      const D = C.deal.attnTip;
      assert.equal(D.metricsDue(1), 'Metrics due · 1 post');
      assert.equal(D.docs(2), 'Docs to collect · 2 instalments');
      assert.equal(D.overdue('Brief', '01/10/2026'), 'Overdue · Brief due 01/10/2026');
      /* a cancelled deal needs nothing done */
      const d = rows.find(x => x.status === 'Complete'); d.status = 'Cancel';
      assert.deepEqual(R.attentionReasons(s, d, TD, R.dealContext(s)), []);
    });
    test('Docs to collect = deals with an instalment at Missing docs (Payments › To pay) · Shipment overdue = a shipment past its Ship by', () => {
      const s = fresh(), rows = scoped(s, 'Charming'), docs = R.docsByDeal(s, TD);
      const missing = new Set(R.payQueue(s, TD).items.filter(x => x.status === 'missing_docs').map(x => x.deal_id));
      assert.deepEqual([...docs.keys()].sort(), [...missing].sort());
      const t = R.dealTabs(s, rows, TD, null, { tab: 'all' });
      assert.equal(t.chips.docs, rows.filter(d => missing.has(d.deal_id)).length);
      const late = new Set((s.sample_shipments || []).filter(sh => R.sampleStatus(sh, TD) === 'overdue').map(sh => sh.deal_id));
      assert.equal(t.chips.shipOverdue, rows.filter(d => late.has(d.deal_id)).length);
      assert.equal(t.chips.shipOverdue, 2);
    });
    test('TC-17: old links — ?tab=needs_action → All + Overdue · ?tab=open → All, no chip · a tab of today → that tab', () => {
      assert.deepEqual(R.dealTabFromLink('needs_action'), { tab: 'all', reason: 'overdue' });
      assert.deepEqual(R.dealTabFromLink('open'), { tab: 'all', reason: '' });
      assert.deepEqual(R.dealTabFromLink('in_process'), { tab: 'inprocess', reason: '' });
      assert.deepEqual(R.dealTabFromLink('Complete'), { tab: 'complete', reason: '' });
      assert.deepEqual(R.dealTabFromLink(undefined), { tab: 'all', reason: '' });
    });
    test('TC-18: Workload by PIC — Docs to collect instead of Unpaid after posting (the screen and the Export)', () => {
      const s = fresh(), w = R.workloadByPic(s, { campaignId: camp(s, 'Kiss').campaign_id }, TD);
      assert.ok(w.every(r => 'docs' in r && !('unpaid' in r)));
      const docs = R.docsByDeal(s, TD), kiss = s.deals.filter(d => d.campaign_id === camp(s, 'Kiss').campaign_id && d.status !== 'Cancel');
      assert.equal(w.reduce((a, r) => a + r.docs, 0), kiss.filter(d => docs.has(d.deal_id)).length);
      const x = { state: s, campaignId: camp(s, 'Kiss').campaign_id, phaseId: '', today: TD, gran: 'day', measure: 'posts', colorBy: 'tier' };
      const wl = E.tabTables('campaign', x).find(tb => tb.name === C.overview.sheet.workload);
      assert.deepEqual(wl.header, ['PIC', 'Open deals', 'Overdue', 'Docs to collect', 'Committed (open)']);
    });
    test('TC-19: a person\'s scope (PIC) — the same tabs, counted in that scope · they add up to All', () => {
      const s = fresh(), t = R.dealTabs(s, scoped(s, 'Charming', 'Ja'), TD);
      assert.equal(t.counts.all, t.counts.list + t.counts.inprocess + t.counts.complete + t.counts.cancelled);
      assert.equal(t.counts.list + t.counts.inprocess, 9);
    });
  });
});
