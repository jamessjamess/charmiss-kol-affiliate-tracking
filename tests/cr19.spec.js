/* cr19.spec.js — CR-19 test cases (Dashboard › Campaign timeline · Pillar "Awareness & Consideration" · no Pillar target · KOL budget needed ·
   schema 18), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate v18 · test data is made up. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, E, SEED } = t;
  const TD = '2026-10-08', NOW = '2026-10-08T03:00:00Z', AC = 'Awareness & Consideration';
  const fresh = () => S.fromSeed(SEED, new Date(NOW));
  const year = () => ['2026-01-01', '2026-12-31'];
  const ids = m => m.rows.map(r => r.campaign.campaign_id);
  const babe = s => s.users.find(u => u.display_name === 'Babe');

  describe('CR-19 §4.2–4.5 · Campaign timeline', () => {
    test('TC-01 / §5.0: 4 rows — Charming (ends 24/10) → Kiss Signal (31/10 · from 17/08) → Perfect Heart (31/10 · from 29/08) → Acne Fade (Complete) · by week', () => {
      const s = fresh(), m = R.campaignTimeline(s, ...year(), 'posts', TD, R.DASH_STATUS_DEFAULT);
      assert.deepEqual(ids(m), ['CH', 'KS', 'PH', 'AC']);
      assert.deepEqual(m.rows.map(r => r.status), ['ongoing', 'ongoing', 'ongoing', 'complete']);
      assert.equal(m.gran, 'week'); assert.equal(m.keys[0], '2025-12-29', 'Mon-first');
      assert.ok(m.rows.every(r => r.bins.length === m.keys.length));
      assert.equal(m.max, Math.max(...m.rows.flatMap(r => r.bins.map(b => b.total))), 'one scale for every row');
    });
    test('the numbers are the old Activity by campaign ones (posts and spend, This year) · the footer numbers too', () => {
      const s = fresh(), [f, to] = year();
      ['posts', 'spend'].forEach(meas => {
        const m = R.campaignTimeline(s, f, to, meas, TD, R.DASH_STATUS_DEFAULT), old = R.swimlanes(s, f, to, 'week', meas, TD, R.DASH_STATUS_DEFAULT);
        const byId = new Map(old.lanes.map(l => [l.campaign.campaign_id, l]));
        m.rows.forEach(r => { const l = byId.get(r.campaign.campaign_id);
          assert.equal(Math.round(r.posted * 100), Math.round(l.posted * 100), `${meas} posted ${r.campaign.campaign_id}`);
          assert.equal(Math.round(r.planned * 100), Math.round(l.planned * 100), `${meas} planned ${r.campaign.campaign_id}`);
          assert.equal(r.outside, l.outside); });
        assert.equal(m.outside, old.lanes.reduce((a, l) => a + l.outside, 0));
        assert.equal(Math.round(m.undated.amount), Math.round(old.lanes.reduce((a, l) => a + l.undated.amount, 0)));
      });
    });
    test('TC-03: Kiss Signal — 17/08 to 31/10 · its Phase 2 starts 01/09 (the line)', () => {
      const r = R.campaignTimeline(fresh(), ...year(), 'posts', TD, false).rows.find(x => x.campaign.campaign_id === 'KS');
      assert.deepEqual([r.start, r.end], ['2026-08-17', '2026-10-31']);
      assert.deepEqual(r.phases.filter(p => p.start > r.start).map(p => p.start), ['2026-09-01']);
    });
    test('TC-05: Last month (30 days ≤ 45) → a bar a day', () => {
      const [f, to] = R.presetRange('last_month', TD), m = R.campaignTimeline(fresh(), f, to, 'posts', TD, false);
      assert.deepEqual([f, to, m.gran, m.keys.length], ['2026-09-01', '2026-09-30', 'day', 30]);
      assert.equal(R.campaignTimeline(fresh(), '2026-09-01', '2026-10-16', 'posts', TD, false).gran, 'week', '46 days → weeks');
    });
    test('TC-06: Acne Fade Concealer (29/09–04/10) — the posts outside its dates are kept apart and counted', () => {
      const r = R.campaignTimeline(fresh(), ...year(), 'posts', TD, false).rows.find(x => x.campaign.campaign_id === 'AC');
      const out = r.bins.reduce((a, b) => a + b.outPosted + b.outPlanned, 0);
      assert.ok(r.outsidePeriod > 0 && out === r.outsidePeriod, `outside the campaign period: ${r.outsidePeriod}`);
      assert.deepEqual([r.start, r.end], ['2026-09-29', '2026-10-04']);
      assert.equal(C.overview.outsidePeriod(2), '2 posts outside the campaign period');
    });
    test('TC-07 / TC-08: a Campaign not started yet (no posts) and one waiting for approval — their order and their dates', () => {
      const s = fresh();
      s.campaigns.push({ campaign_id: 'NX', campaign_name: 'Next Year Glow', budget_kol: 100000, approval_status: 'approved' });
      s.phases.push({ phase_id: 'NX-1', campaign_id: 'NX', start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 100000, approval_status: 'approved' });
      s.phases.push(R.stampDraft({ phase_id: 'TA-1', campaign_id: 'TA', start_date: '2026-10-01', end_date: '2026-10-31' }, babe(s), NOW));
      s.campaigns.push(R.stampDraft({ campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 300000 }, babe(s), NOW));
      R.requestTransition(s, 'campaign:TA', 'pending', { eventId: () => 9000, now: NOW, user: babe(s).user_id });   // (CR-21: a draft is sent)
      const def = R.campaignTimeline(s, ...year(), 'posts', TD, R.DASH_STATUS_DEFAULT);
      assert.deepEqual(ids(def), ['CH', 'KS', 'PH', 'NX', 'AC'], 'a waiting one is not in the default Status');
      const all = R.campaignTimeline(s, ...year(), 'posts', TD, R.DASH_STATUS_DEFAULT.concat(['pending']));
      assert.deepEqual(ids(all), ['CH', 'KS', 'PH', 'TA', 'NX', 'AC'], 'On going → Pending approval → Not started → Complete');
      const nx = all.rows.find(r => r.campaign.campaign_id === 'NX'), ta = all.rows.find(r => r.campaign.campaign_id === 'TA');
      assert.deepEqual([nx.status, nx.posted + nx.planned, nx.days.kind, nx.days.n], ['not_started', 0, 'starts', 24]);
      assert.deepEqual([ta.status, ta.start, ta.end], ['pending', '2026-10-01', '2026-10-31'], 'its own Phase gives its dates');
    });
    test('TC-02: 25 Campaigns (made up) — 25 rows, one scale', () => {
      const s = fresh();
      for (let i = 1; i <= 21; i++) {
        const id = 'Z' + String(i).padStart(2, '0'), st = `2026-${String(1 + (i % 11)).padStart(2, '0')}-01`;
        s.campaigns.push({ campaign_id: id, campaign_name: `Test campaign ${i}`, budget_kol: 1000, approval_status: 'approved' });
        s.phases.push({ phase_id: id + '-1', campaign_id: id, start_date: st, end_date: R.addDays(st, 20), budget_kol: 1000, approval_status: 'approved' });
      }
      const m = R.campaignTimeline(s, ...year(), 'posts', TD, R.DASH_STATUS_DEFAULT);
      assert.equal(m.rows.length, 25);
      assert.equal(C.overview.timelineSub(25, '08/10'), '25 campaigns · Today 08/10');
    });
    test('TC-09 / TC-11: Spend → bars in ฿ · the table view and the sheet say what the chart says', () => {
      const s = fresh(), [f, to] = year(), x = { state: s, from: f, to, today: TD, statuses: R.DASH_STATUS_DEFAULT, measure: 'posts' };
      const p = R.campaignTimeline(s, f, to, 'posts', TD, R.DASH_STATUS_DEFAULT), sp = R.campaignTimeline(s, f, to, 'spend', TD, R.DASH_STATUS_DEFAULT);
      const tt = E.rowsFor('timelinetable', x), sh = E.rowsFor('timeline', x);
      assert.deepEqual(tt.header, ['Campaign', 'Status', 'Start', 'End', 'Posts posted', 'Posts planned', 'Spend', 'First post', 'Last post']);
      assert.deepEqual(tt.rows.map(r => [r[0], r[4], r[5]]), p.rows.map(r => [r.campaign.campaign_name, r.posted, r.planned]));
      assert.deepEqual(tt.rows.map(r => Math.round(r[6])), sp.rows.map(r => Math.round(r.posted + r.planned)));
      assert.equal(sh.name, 'Campaign timeline'); assert.equal(sh.rows.length, p.rows.length * p.keys.length);
      const ks = sh.rows.filter(r => r[0] === 'Kiss Signal Lip Gloss');
      assert.equal(ks.reduce((a, r) => a + r[5] + r[6], 0), p.rows.find(r => r.campaign.campaign_id === 'KS').posted + p.rows.find(r => r.campaign.campaign_id === 'KS').planned);
    });
  });

  describe('CR-19 §4.6 · Pillar Awareness & Consideration', () => {
    test('TC-13: a schema 17 file → 18 · pillar_list of 4 in order · Perfect Heart Phase 1 → Awareness & Consideration · deals untouched · twice the same', () => {
      const s = fresh();
      assert.equal(s.schema_version, S.SCHEMA_VERSION);   // (CR-20 goes on to 19)
      assert.deepEqual(s.lookups.pillar_list, ['Awareness', AC, 'Consideration', 'Conversion']);
      assert.deepEqual(R.PILLARS, s.lookups.pillar_list);
      assert.equal(s.phases.find(p => p.phase_id === 'PH-P1').default_pillar, AC);
      const v17 = JSON.parse(JSON.stringify(s)); v17.schema_version = 17; v17.lookups.pillar_list = ['Awareness', 'Consideration', 'Conversion']; v17.phases.find(p => p.phase_id === 'PH-P1').default_pillar = null;
      const dealsBefore = JSON.stringify(v17.deals), m = S.migrate(v17, new Date(NOW));
      assert.deepEqual([m.schema_version, m.lookups.pillar_list, m.phases.find(p => p.phase_id === 'PH-P1').default_pillar], [S.SCHEMA_VERSION, ['Awareness', AC, 'Consideration', 'Conversion'], AC]);
      assert.equal(JSON.stringify(m.deals), dealsBefore, 'no deal changed');
      const once = JSON.stringify(m); R.migrateV18(m); assert.equal(JSON.stringify(m), once);
      assert.equal(R.pillarShort(AC), 'Aware + Consider'); assert.equal(R.pillarShort('Awareness'), 'Awareness');
    });
    test('TC-14: a deal set to Awareness & Consideration → a row of its own in Pillar mix · % add up to 100', () => {
      const s = fresh(), d = s.deals.find(x => x.campaign_id === 'KS' && x.status !== 'Cancel' && !R.isShortlist(s.lookups, x) && !x.pillar);
      d.pillar = AC;
      const m = R.pillarMix(s, ...year(), TD, false), row = m.rows.find(x => x.pillar === AC);
      assert.deepEqual([row.deals, row.spend], [1, R.totalCost(d)]);
      assert.equal(Math.round(m.rows.reduce((a, x) => a + x.spendPct, 0) * 10) / 10, 100);
      assert.deepEqual(m.rows.map(x => x.pillar), ['Awareness', AC, 'Consideration', 'Conversion', R.NOT_SET]);
      assert.equal(R.isPillarValue(s.lookups, AC), true, 'a value a deal may have (form · inline · bulk · Move to Post)');
    });
    test('TC-15 / TC-16: Pillar mix and Pillar allocation say what is — no Target, no Δ', () => {
      const s = fresh(), m = R.pillarMix(s, ...year(), TD, false);
      assert.deepEqual(m.rows.map(x => x.spend), [55500, 0, 89600, 73200, 1565279]);
      assert.ok(m.rows.every(x => x.target === undefined && x.gap === undefined));
      /* CR-24 §3 — Pillar allocation is gone (card · sheet · sum) · Pillar mix stays */
      assert.equal(R.pillarAllocation, undefined);
      assert.ok(!E.TABS.campaign.includes('allocation') && E.TABS.all.includes('pillarmix'));
    });
  });

  describe('CR-19 §4.7–4.8 · no Pillar target · KOL budget needed', () => {
    test('TC-17: the old targets stay in the data, nothing shows them', () => {
      const s = fresh();
      assert.deepEqual(s.lookups.pillar_target_default, { awareness: 10, consideration: 20, conversion: 70 });
      assert.ok(s.campaigns.every(c => c.pillar_target === null));
      assert.equal(C.settings.navTargets, undefined); assert.equal(C.campaign.ownTarget, undefined);
    });
    test('TC-18 / TC-19: Create campaign / Submit for approval needs a KOL budget above ฿0 — "Enter the KOL budget"', () => {
      const s = fresh(), row = { key: 'a', start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: '' };
      const v = b => R.validatePhasePlan(s, { campaign_id: null, campaign_name: 'Budget Needed', budget_kol: b }, [row], [], { budgetRequired: true }).errs.filter(e => e.field === 'budget_kol').map(e => e.msg);
      assert.deepEqual(v(''), ['Enter the KOL budget']);
      assert.deepEqual(v(0), ['Enter the KOL budget'], 'above ฿0');
      assert.deepEqual(v(500000), []);
      assert.deepEqual(R.validatePhasePlan(s, { campaign_id: null, campaign_name: 'Old way', budget_kol: '' }, [row], []).errs.filter(e => e.field === 'budget_kol'), [], 'only when asked for');
      assert.equal(C.planner.budgetFirst, 'Enter the KOL budget to use Budget %');
    });
  });
});
