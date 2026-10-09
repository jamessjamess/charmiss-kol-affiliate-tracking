/* cr03.spec.js — CR-03 test cases (schema v3, Phase per post, money per post, Campaign budget), run by tests/test.html.
   "today" is always 05/10/2026. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TODAY = '2026-10-05';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const phasesOf = (s, cid) => s.phases.filter(p => p.campaign_id === cid);
  const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  function fakeStorage() {
    const m = new Map();
    return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  }
  /* a state as v2 saved it: deals carry phase_id, no v3 fields */
  function asV2(state) {
    const o = JSON.parse(JSON.stringify(state));
    o.schema_version = 2;
    o.deals.forEach(d => { d.phase_id = d.legacy_phase_id; delete d.campaign_id; delete d.legacy_phase_id; });
    o.deal_posts.forEach(p => { delete p.phase_override; });
    o.campaigns.forEach(c => { delete c.budget_kol; delete c.pillar_target; delete c.cta; });
    delete o.lookups.pillar_target_default;
    /* CR-04 (v4) fields did not exist in v2 either */
    delete o.users; delete o.meta; o.lookups.pic_list = SEED.lookups.pic_list.slice(); o.lookups.cta_list = [];
    return o;
  }
  const asV1 = state => {
    const o = asV2(state);
    o.schema_version = 1; delete o.deal_events;
    o.deals.forEach(d => { delete d.draft_rounds; delete d.script_required; delete d.payment_term; });
    o.kol_master.forEach(k => { delete k.default_payment_term; });
    return o;
  };
  /* Committed counts from Confirm QT onward; Shortlist / Contacted deals are "Shortlist" money (James, 05/10/2026) */
  const PHASE_COMMITTED = { 'CH-P1': 573050, 'CH-P2': 290650, 'KS-P1': 298700, 'KS-P2': 41700, 'AC-P1': 7800, 'PH-P1': 310600, 'PH-P2': 154779, 'PH-P3': 67500, 'PH-OCT': 38800 };
  const PHASE_SHORTLIST = { 'CH-P2': 5100, 'KS-P1': 5900, 'KS-P2': 2000, 'AC-P1': 76700, 'PH-P2': 2500, 'PH-OCT': 5800 };
  const PRIMARY_DEALS = { 'CH-P1': 61, 'CH-P2': 40, 'KS-P1': 71, 'KS-P2': 12, 'AC-P1': 29, 'PH-P1': 30, 'PH-P2': 23, 'PH-P3': 24, 'PH-OCT': 10 };
  function anchors(s) {
    const x = R.dealTiles(s, s.deals, { campaignId: null, phaseIds: null }, TODAY);
    assert.equal(s.deals.length, 305);
    assert.equal(x.count, 300);
    assert.equal(x.committed, 1783579);
    assert.equal(x.shortlist, 98000);
    assert.equal(x.committed + x.shortlist, 1881579, 'the old Committed is now Committed + Shortlist');
    assert.equal(x.budget, 2748400);
    assert.equal(x.paid, 774579);
    assert.equal(x.overdue, 1);   // CR-15: 11 → 5 (the 6 deals at Brief wait on Script) · CR-23 §3.2: → 1 (the last Draft waits on Approve, no due)
    assert.equal(x.unpaid, 130);
    const idx = R.phaseIndex(s);
    for (const [id, v] of Object.entries({ CH: 863700, KS: 340400, AC: 7800, PH: 571679 })) assert.equal(R.campaignSummary(s, id, idx).committed, v, 'committed ' + id);
    for (const [id, v] of Object.entries({ CH: 5100, KS: 7900, AC: 76700, PH: 8300 })) assert.equal(R.campaignSummary(s, id, idx).shortlist, v, 'shortlist ' + id);
    for (const [id, v] of Object.entries({ CH: 850000, KS: 600000, AC: 400000, PH: 898400 })) assert.equal(R.campaignSummary(s, id, idx).budget, v, 'budget ' + id);
    for (const [id, v] of Object.entries(PHASE_COMMITTED)) assert.equal(R.phaseCommitted(s, id, idx), v, 'phase ' + id);
    for (const [id, v] of Object.entries(PHASE_SHORTLIST)) assert.equal(R.phaseSummary(s, id, idx).shortlist, v, 'phase shortlist ' + id);
    for (const [id, v] of Object.entries(PRIMARY_DEALS)) assert.equal(R.phaseSummary(s, id, idx).activeCount, v, 'primary ' + id);
    ['CH', 'KS', 'AC', 'PH'].forEach(id => { const c = R.campaignSummary(s, id, idx); assert.equal(c.unscheduled, 0); assert.equal(c.needs, 0); assert.equal(c.needsPosts, 0); });
  }

  describe('CR-03 R1 · schema v3 and migration', () => {
    test('TC-01: seed loads as v3 — anchors §5.0; deals have campaign_id + legacy_phase_id, no phase_id', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() }), s = st.state;
      assert.equal(s.schema_version, S.SCHEMA_VERSION, 'v3 then v4 (CR-04)');
      assert.equal(s.deals.filter(d => 'phase_id' in d).length, 0);
      assert.equal(s.deals.filter(d => d.campaign_id && d.legacy_phase_id).length, 305);
      assert.deepEqual(countBy(s.deals, d => d.campaign_id), { CH: 101, KS: 83, AC: 31, PH: 90 });
      assert.deepEqual(s.campaigns.map(c => c.pillar_target), [null, null, null, null]);
      assert.deepEqual(s.lookups.pillar_target_default, { awareness: 10, consideration: 20, conversion: 70 });
      anchors(s);
    });
    test('TC-01: Phase committed sums to the total; primary-phase deals sum to 300', () => {
      assert.equal(Object.values(PHASE_COMMITTED).reduce((a, b) => a + b, 0), 1783579);
      assert.equal(Object.values(PHASE_SHORTLIST).reduce((a, b) => a + b, 0), 98000);
      assert.equal(Object.values(PRIMARY_DEALS).reduce((a, b) => a + b, 0), 300);
    });
    test('TC-02: 90 posts get a phase_override (outside 48 · no date 32 · overlap 10); the other 223 are auto', () => {
      const s = fresh(), kinds = {};
      s.deal_posts.forEach(p => { const d = deal(s, p.deal_id), r = R.resolvePostPhase(Object.assign({}, p, { phase_override: null }), phasesOf(s, d.campaign_id)); kinds[r.kind] = (kinds[r.kind] || 0) + 1;
        if (r.kind === 'auto') assert.equal(p.phase_override, null, p.post_id); else assert.equal(p.phase_override, d.legacy_phase_id, p.post_id); });
      assert.deepEqual(kinds, { auto: 223, outside: 48, none: 32, overlap: 10 });
      assert.equal(s.deal_posts.filter(p => p.phase_override).length, 90);
      const idx = R.phaseIndex(s);
      assert.equal([...idx.post.values()].filter(r => r.slot !== 'phase').length, 0, 'every post has a Phase after migration');
    });
    test('TC-03: 14 deals move to another primary Phase', () => {
      const s = fresh(), idx = R.phaseIndex(s);
      const moved = s.deals.filter(d => R.primaryPhase(idx, d.deal_id) !== d.legacy_phase_id).map(d => `${d.deal_id} ${d.legacy_phase_id}→${R.primaryPhase(idx, d.deal_id)}`);
      assert.deepEqual(moved, ['D000065 CH-P2→CH-P1', 'D000070 CH-P2→CH-P1', 'D000072 CH-P2→CH-P1', 'D000109 KS-P1→KS-P2', 'D000141 KS-P1→KS-P2', 'D000174 KS-P1→KS-P2',
        'D000248 PH-P2→PH-P3', 'D000250 PH-P2→PH-P3', 'D000257 PH-P2→PH-P3', 'D000259 PH-P2→PH-P3', 'D000268 PH-P2→PH-P3', 'D000269 PH-P2→PH-P3', 'D000275 PH-P2→PH-P3', 'D000277 PH-P2→PH-P3']);
    });
    test('TC-05: restoring v1 and v2 backups migrates them step by step to v3; anchors match', () => {
      for (const [label, make] of [['v1', asV1], ['v2', asV2]]) {
        const st = S.createStore({ seed: SEED, storage: fakeStorage() });
        const r = st.restore(JSON.stringify(make(fresh())), `old_${label}.json`);
        assert.equal(r.ok, true, label);
        assert.equal(st.state.schema_version, S.SCHEMA_VERSION, label);
        assert.equal(st.state.deal_posts.filter(p => p.phase_override).length, 90, label);
        anchors(st.state);
      }
    });
    test('migration keeps every date of deals and posts as it was', () => {
      const s = fresh(), DATE = /date$/;
      SEED.deals.forEach(o => { const d = deal(s, o.deal_id); Object.keys(o).filter(k => DATE.test(k)).forEach(k => assert.equal(d[k], o[k], o.deal_id + ' ' + k)); });
      SEED.deal_posts.forEach(o => { const p = s.deal_posts.find(x => x.post_id === o.post_id); ['post_date', 'expected_post_date'].forEach(k => assert.equal(p[k], o[k], o.post_id + ' ' + k)); });
    });
    test('v2 data in localStorage is migrated once and saved as v3', () => {
      const ls = fakeStorage(); ls.setItem(S.KEY, JSON.stringify(asV2(fresh())));
      const a = S.createStore({ seed: SEED, storage: ls });
      assert.equal(a.status.migratedFrom, 2);
      assert.equal(JSON.parse(ls.map.get(S.KEY)).schema_version, S.SCHEMA_VERSION);
      assert.equal(S.createStore({ seed: SEED, storage: ls }).status.migratedFrom, null);
    });
  });

  describe('CR-03 R1 · Phase of a post, money per post', () => {
    test('TC-04: resolvePostPhase — CH 10/09 auto CH-P1 · PH 03/09 overlap (PH-P1, PH-P2) · KS 10/08 outside · no date none', () => {
      const s = fresh(), at = (cid, d) => R.resolvePostPhase({ post_date: d, phase_override: null }, phasesOf(s, cid));
      assert.deepEqual([at('CH', '2026-09-10').kind, at('CH', '2026-09-10').phase], ['auto', 'CH-P1']);
      assert.deepEqual([at('PH', '2026-09-03').kind, at('PH', '2026-09-03').candidates], ['overlap', ['PH-P1', 'PH-P2']]);
      assert.equal(at('PH', '2026-09-03').slot, 'needs');
      assert.equal(at('KS', '2026-08-10').kind, 'outside');
      assert.deepEqual([at('KS', '2026-08-10').slot, at('KS', '2026-08-10').phase, at('KS', '2026-08-10').fallback], ['phase', 'KS-P1', 'first'], 'CR-23 §3.5: before the Campaign → its first Phase');
      assert.deepEqual([at('CH', null).kind, at('CH', null).slot], ['none', 'unscheduled']);
    });
    test('the post date falls back to its expected date', () => {
      const s = fresh(), r = R.resolvePostPhase({ post_date: null, expected_post_date: '2026-10-20', phase_override: null }, phasesOf(s, 'PH'));
      assert.deepEqual([r.kind, r.phase], ['auto', 'PH-OCT']);
    });
    test('phase_override: used for none / outside, only a candidate for overlap, never for auto (shown as not used)', () => {
      const s = fresh(), ph = phasesOf(s, 'PH'), r = (d, ov) => R.resolvePostPhase({ post_date: d, phase_override: ov }, ph);
      assert.deepEqual([r(null, 'PH-P3').phase, r(null, 'PH-P3').slot], ['PH-P3', 'phase']);
      assert.equal(r('2026-07-01', 'PH-P1').phase, 'PH-P1');
      assert.equal(r('2026-09-03', 'PH-P2').phase, 'PH-P2');
      assert.deepEqual([r('2026-09-03', 'PH-OCT').phase, r('2026-09-03', 'PH-OCT').slot, r('2026-09-03', 'PH-OCT').overrideUnused], [null, 'needs', true]);
      assert.deepEqual([r('2026-10-10', 'PH-P1').phase, r('2026-10-10', 'PH-P1').overrideUnused], ['PH-OCT', true]);
      assert.deepEqual([r('2026-07-01', 'CH-P1').phase, r('2026-07-01', 'CH-P1').fallback], ['PH-P1', 'first'], 'an override from another Campaign is ignored (CR-23 §3.5: before the Campaign → the first Phase)');
      assert.equal(R.canPickPhase(r('2026-10-10', null)), false);
      assert.deepEqual(R.pickablePhases(r('2026-09-03', null), ph).map(p => p.phase_id), ['PH-P1', 'PH-P2']);
    });
    test('postShare = total ÷ posts; a deal without posts is Unscheduled as a whole', () => {
      const s = fresh(), d = deal(s, 'D000150');
      assert.equal(R.postShare(d, R.postsOf(s, 'D000150')), 1500);
      s.deals.push(Object.assign({}, d, { deal_id: 'D999990', status: 'Inprocess', sub_status: 'Brief' }));
      const idx = R.phaseIndex(s);
      assert.equal(R.primaryPhase(idx, 'D999990'), R.UNSCHEDULED);
      assert.equal(R.campaignSummary(s, d.campaign_id, idx).unscheduled, R.totalCost(d));
    });
    test('primary phase = Phase of the earliest post; undated posts come last', () => {
      const s = fresh();
      s.deal_posts.push({ post_id: 'PX1', deal_id: 'D000296', post_date: null, expected_post_date: null, phase_override: null });
      s.deal_posts.push({ post_id: 'PX2', deal_id: 'D000296', post_date: '2026-09-20', phase_override: null });
      const idx = R.phaseIndex(s);
      assert.equal(R.primaryPhase(idx, 'D000296'), 'PH-P3');
      assert.equal(R.campaignSummary(s, 'PH', idx).committed, 571679, 'the Campaign total does not move');
      assert.equal(R.campaignSummary(s, 'PH', idx).unscheduled, 1666.67, 'one third of ฿5,000, to 2 decimals');
    });
    test('a Needs-phase post is a warning; a date far from the Campaign is an info (TC-08 / TC-09 basis)', () => {
      const s = fresh(), c = R.dealContext(s), d = s.deals.find(x => x.campaign_id === 'AC');
      /* CR-23 §3.5 — a post with its Post date outside the Campaign says so ("Post date 10/03 is before this campaign starts (29/09)") ·
         one not posted yet says nothing of its own (the deal's Post due does, once) */
      const acc = R.postsOf(s, d.deal_id)[0].account_id;
      const posts = R.postsOf(s, d.deal_id).concat([{ post_id: null, deal_id: d.deal_id, account_id: acc, post_date: '2026-03-10', expected_post_date: null, phase_override: null }]);
      const r = R.validateDeal(s, d, posts, TODAY, c), n = posts.length;
      assert.ok(r.warns.some(w => w.field === `post${n - 1}_post_date` && w.kind === 'post_outside' && w.msg === 'Post date 10/03 is before this campaign starts (29/09)'));
      assert.ok(r.infos.some(i => i.field === `post${n - 1}_post_date`));
      const due = R.postsOf(s, d.deal_id).concat([{ post_id: null, deal_id: d.deal_id, account_id: acc, post_date: null, expected_post_date: '2026-03-10', phase_override: null }]);
      assert.ok(!R.validateDeal(s, d, due, TODAY, c).warns.some(w => w.field === `post${n - 1}_phase_override` || w.field === `post${n - 1}_post_date`));
      const p49 = R.postsOf(s, 'D000049')[0];
      assert.equal(p49.expected_post_date, '2024-09-11');
      assert.equal(R.postFarOutside(p49, phasesOf(s, 'CH')), true);
      assert.equal(R.resolvePostPhase(p49, phasesOf(s, 'CH')).phase, 'CH-P1', 'still uses its override CH-P1');
    });
  });

  describe('CR-03 R2 · Phases change, posts follow; budgets; Deals and Pipeline', () => {
    test('TC-06: PH-P1 ends 02/09 → no overlap; the 10 overlap posts become auto (override shown as not used); PH total unchanged', () => {
      const s = fresh(), before = s.deal_posts.filter(p => { const d = deal(s, p.deal_id); return d.campaign_id === 'PH' && R.resolvePostPhase(p, phasesOf(s, 'PH')).kind === 'overlap'; }).map(p => p.post_id);
      assert.equal(before.length, 10);
      const p1 = s.phases.find(x => x.phase_id === 'PH-P1');
      assert.ok(!R.validatePhase(s, { ...p1, end_date: '2026-09-02' }).warns.some(w => /overlap/.test(w.msg)));
      p1.end_date = '2026-09-02';
      assert.deepEqual(R.phaseOverlaps(phasesOf(s, 'PH')), []);
      const idx = R.phaseIndex(s);
      before.forEach(id => { const r = idx.post.get(id); assert.equal(r.kind, 'auto', id); assert.equal(r.phase, 'PH-P2', id); assert.equal(r.overrideUnused, true, id); });
      const c = R.campaignSummary(s, 'PH', idx);
      assert.equal(c.committed + c.shortlist, 579979);
      assert.equal(c.committed, 571679);
    });
    test('TC-07: KS-P1 starts 10/08 → the KS posts of 10–16/08 become auto KS-P1; KS total unchanged', () => {
      const s = fresh(), ids = s.deal_posts.filter(p => { const d = deal(s, p.deal_id), e = R.postDateOf(p); return d.campaign_id === 'KS' && e >= '2026-08-10' && e <= '2026-08-16'; }).map(p => p.post_id);
      assert.equal(ids.length, 23, 'KS posts dated 10–16/08');
      s.phases.find(x => x.phase_id === 'KS-P1').start_date = '2026-08-10';
      const idx = R.phaseIndex(s);
      ids.forEach(id => { const r = idx.post.get(id); assert.equal(r.kind, 'auto', id); assert.equal(r.phase, 'KS-P1', id); });
      const c = R.campaignSummary(s, 'KS', idx);
      assert.equal(c.committed + c.shortlist, 348300);
    });
    test('TC-08: a new AC post dated 10/03/2026 needs a phase (⚠ +1, Phase to assign = 1) until AC-P1 is picked', () => {
      const s = fresh(), d = s.deals.find(x => x.campaign_id === 'AC' && x.status !== 'Cancel'), c = R.dealContext(s);
      const before = R.rowWarnings(s, d, TODAY, c).length;
      s.deal_posts.push({ post_id: 'PNEW1', deal_id: d.deal_id, account_id: R.postsOf(s, d.deal_id)[0].account_id, post_date: '2026-03-10', expected_post_date: null, post_link: null, phase_override: null });
      const c2 = R.dealContext(s);
      assert.equal(R.rowWarnings(s, d, TODAY, c2).length, before + 1);
      assert.equal(R.phaseAttention(s, {}).phaseToAssign, 0, 'CR-23 §3.5: before the Campaign → its first Phase (AC-P1) at once · the warning stays until a Phase is picked');
      s.deal_posts.find(p => p.post_id === 'PNEW1').phase_override = 'AC-P1';
      assert.equal(R.phaseAttention(s, {}).phaseToAssign, 0);
      assert.equal(R.rowWarnings(s, d, TODAY, R.dealContext(s)).length, before);
    });
    test('TC-10 / TC-11: 60% of CH (฿850,000) = ฿510,000 · CH to ฿1,000,000 keeping % recalculates the Phases', () => {
      const s = fresh();
      assert.equal(R.budgetFromPct(60, 850000), 510000);
      s.phases.find(p => p.phase_id === 'CH-P1').budget_kol = 510000;
      assert.equal(R.allocation(s, 'CH').state, 'over');
      const keep = (amount, was, now) => R.budgetFromPct(R.pctOfBudget(amount, was), now);
      assert.equal(keep(510000, 850000, 1000000), 600000);
      assert.equal(keep(350000, 850000, 1000000), 411765);
    });
    test('TC-12: Deals Phase = KS-P2 → deals with a post in KS-P2 · ฿41,700 (+ Shortlist ฿2,000) / ฿50,000', () => {
      const s = fresh(), c = R.dealContext(s), rows = R.filterDeals(s, { phases: ['KS-P2'] }, TODAY, c), t = R.dealTiles(s, rows, { phaseIds: ['KS-P2'] }, TODAY);
      assert.equal(rows.length, 12);
      assert.equal(t.committed, 41700);
      assert.equal(t.shortlist, 2000);
      assert.equal(t.budget, 50000);
    });
    test('Deals Phase = Needs phase / Unscheduled keeps deals with such a post (none in the seed)', () => {
      const s = fresh(), c = R.dealContext(s);
      assert.equal(R.filterDeals(s, { phases: [R.NEEDS] }, TODAY, c).length, 0);
      Object.assign(s.deal_posts.find(p => p.deal_id === 'D000296'), { post_date: '2026-09-03', phase_override: null });   // CR-23 §3.5: after the Campaign → its last Phase · in 2 Phases still needs one
      assert.deepEqual(R.filterDeals(s, { phases: [R.NEEDS] }, TODAY, R.dealContext(s)).map(d => d.deal_id), ['D000296']);
    });
    test('TC-15: Pipeline per Campaign — PH has 90 deals over every Phase; PH-OCT keeps 10', () => {
      const s = fresh(), idx = R.phaseIndex(s);
      assert.equal(R.scopeDeals(s, { campaignId: 'PH' }, idx).length, 90);
      assert.equal(R.scopeDeals(s, { campaignId: 'PH', phaseIds: ['PH-OCT'] }, idx).length, 10);
      const cols = R.pipeline(s, R.scopeDeals(s, { campaignId: 'PH' }, idx)).filter(x => x.count).map(x => x.step.sub_status);
      assert.ok(cols.includes('Post') && cols.includes('Cancel'));
    });
    test('TC-16: a Phase with posts (auto or picked) cannot be deleted', () => {
      const s = fresh();
      ['CH-P1', 'CH-P2', 'KS-P1', 'KS-P2', 'AC-P1', 'PH-P1', 'PH-P2', 'PH-P3', 'PH-OCT'].forEach(id => assert.equal(R.canDeletePhase(s, id), false, id));
    });
    test('Pillar not set: 252 deals (not Cancel) · filter value __none', () => {
      const s = fresh();
      assert.equal(R.phaseAttention(s, {}).pillarNotSet, 252);
      assert.equal(R.filterDeals(s, { pillar: '__none' }, TODAY, R.dealContext(s)).filter(d => d.status !== 'Cancel').length, 252);
    });
  });

  describe('CR-03 R3 · Pillar from Confirm QT, Set pillar', () => {
    const newDeal = s => { s.deals.push(Object.assign(JSON.parse(JSON.stringify(R.DEAL_TEMPLATE)), { deal_id: 'D999980', campaign_id: 'PH', kol_id: 'K0120', status: 'List', sub_status: 'Contacted', pic: 'Pang', payment_term: 'postpaid' })); return deal(s, 'D999980'); };
    test('TC-17: a new deal without a pillar cannot move to Confirm QT unless a pillar is picked in the dialog', () => {
      const s = fresh(), d = newDeal(s);
      const no = R.checkMove(s, d, 'Confirm QT', { date: TODAY });
      assert.ok(no.errs.some(e => e.code === 'pillar' && e.msg === C.msg.movePillarRequired));
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TODAY, pillar: 'Consideration', rateCard: '3000', cta: 'TikTok', ship: { method: 'warehouse', items: [{ tr_code: 'X1', qty: 1 }], ship_by: TODAY } }).errs, []);   // CR-20 §4.7: the rate card too · CR-22: the CTA and the samples · CR-23: Ship by
      const r = R.applyMove(s, d, 'Confirm QT', { date: TODAY, pillar: 'Consideration' }, { logId: 900, eventId: 3 });
      assert.equal(r.deal.pillar, 'Consideration');
      assert.deepEqual(r.events.map(e => [e.event_id, e.type, e.from, e.to]), [[3, 'pillar', null, 'Consideration']]);
      assert.deepEqual(R.checkMove(s, d, 'Shortlist', { date: TODAY, note: 'x' }).errs.filter(e => e.code === 'pillar'), [], 'before Confirm QT a pillar is not needed');
    });
    test('a new deal that starts at Confirm QT or later needs a pillar', () => {
      const s = fresh();
      assert.ok(R.checkNewDealPillar(s.lookups, { sub_status: 'Brief', pillar: null }).errs.some(e => e.msg === C.msg.pillarRequired));
      assert.deepEqual(R.checkNewDealPillar(s.lookups, { sub_status: 'Contacted', pillar: null }).errs, []);
      assert.deepEqual(R.checkNewDealPillar(s.lookups, { sub_status: 'Brief', pillar: 'Awareness' }).errs, []);
    });
    test('TC-18 (superseded by CR-20 §4.7): an imported deal past Confirm QT without a pillar / term fills them to move forward · back needs only a note', () => {
      const s = fresh(), d = deal(s, 'D000302');
      assert.equal(d.is_legacy, true);
      assert.equal(d.pillar, null);
      assert.deepEqual(R.checkMove(s, d, 'Draft 1', { date: TODAY }).errs.map(e => e.field), ['cta', 'pillar', 'payment_term'], 'CR-22: + the CTA');
      assert.deepEqual(R.checkMove(s, d, 'Draft 1', { date: TODAY, pillar: 'Awareness', paymentTerm: 'postpaid', cta: 'TikTok' }).errs, []);
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TODAY, note: 'redo' }).errs, []);
    });
    test('TC-19: Set pillar on 5 deals → 5 changes, 5 events; Undo restores each one', () => {
      const s = fresh(), five = s.deals.filter(d => !d.pillar).slice(0, 5);
      const r = R.pillarChanges(five, 'Awareness', { eventId: 1 });
      assert.equal(r.deals.length, 5);
      assert.ok(r.events.every(e => e.type === 'pillar' && e.from === null && e.to === 'Awareness'));
      const back = R.pillarChanges(r.deals, () => null, { eventId: 6, note: 'undo' });
      assert.equal(back.events.length, 5);
      assert.ok(back.deals.every(d => d.pillar === null));
    });
    test('TC-20: Needs attention — Pillar not set = 252 · Phase to assign = 0 (hidden)', () => {
      const a = R.phaseAttention(fresh(), {});
      assert.equal(a.pillarNotSet, 252);
      assert.equal(a.phaseToAssign, 0);
    });
  });

  describe('CR-03 R1 · Phases, Campaign budget, scopes', () => {
    test('overlapping Phases: PH-P1 and PH-P2 share 03/09–04/09 · editing PH-P1 warns', () => {
      const s = fresh();
      assert.deepEqual(R.phaseOverlaps(phasesOf(s, 'PH')), [{ a: 'PH-P1', b: 'PH-P2', from: '2026-09-03', to: '2026-09-04' }]);
      const p = s.phases.find(x => x.phase_id === 'PH-P1');
      assert.ok(R.validatePhase(s, { ...p }).warns.some(w => w.msg === C.msg.phaseOverlap('Phase 1 · Awareness & Consideration', 'Phase 2 · Consideration + Conversion', '03/09', '04/09')));
      assert.ok(!R.validatePhase(s, { ...p, end_date: '2026-09-02' }).warns.some(w => w.msg.includes('overlap')));
    });
    test('a Phase used by a post (by date or override) cannot be deleted', () => {
      const s = fresh();
      assert.equal(R.canDeletePhase(s, 'PH-P1'), false);
      s.phases.push({ phase_id: 'PH-P9', campaign_id: 'PH', label: 'Empty', start_date: '2026-12-01', end_date: '2026-12-31', budget_kol: null });
      assert.equal(R.canDeletePhase(s, 'PH-P9'), true);
      s.deal_posts[0].phase_override = 'PH-P9';
      assert.equal(R.canDeletePhase(s, 'PH-P9'), false, 'an override that is not used still holds the Phase');
    });
    test('scopes: whole Campaign = deal totals · Phases = post shares · budgets follow the scope', () => {
      const s = fresh(), idx = R.phaseIndex(s), ids = ['CH-P2', 'KS-P2', 'PH-OCT'];
      const deals = R.scopeDeals(s, { phaseIds: ids }, idx);
      assert.equal(deals.length, 62);
      assert.equal(R.scopeMoney(deals.filter(d => d.status !== 'Cancel'), { phaseIds: ids }, idx).committed, 371150);
      assert.equal(R.scopeMoney(deals.filter(d => d.status !== 'Cancel'), { phaseIds: ids }, idx).shortlist, 12900);
      assert.equal(R.scopeBudget(s, { phaseIds: ids }), 550000);
      assert.equal(R.scopeBudget(s, { campaignId: 'PH' }), 898400);
      assert.equal(R.scopeDeals(s, { campaignId: 'PH' }, idx).length, 90);
      assert.equal(R.scopePosts(s, { phaseIds: ['KS-P2'] }, idx).length, R.phaseSummary(s, 'KS-P2', idx).posts);
    });
    test('Campaign budget split: % ↔ ฿ and Allocated vs budget', () => {
      const s = fresh();
      assert.equal(R.budgetFromPct(60, 850000), 510000);
      assert.equal(Math.round(R.pctOfBudget(510000, 850000)), 60);
      assert.deepEqual(R.allocation(s, 'CH'), { state: 'even', allocated: 850000, budget: 850000, diff: 0 });
      s.phases.find(p => p.phase_id === 'CH-P1').budget_kol = 510000;
      assert.deepEqual(R.allocation(s, 'CH'), { state: 'over', allocated: 860000, budget: 850000, diff: -10000 });
      s.phases.find(p => p.phase_id === 'CH-P2').budget_kol = 300000;
      assert.equal(R.allocation(s, 'CH').state, 'unallocated');
    });
    test('Overview scope All keeps Posts 168 · Views 2,072,957', () => {
      const s = fresh(), sc = { campaignId: null, phaseIds: null }, [a, z] = R.overviewWindow(s, sc, TODAY), t = R.overviewTiles(s, sc, a, z, TODAY);
      assert.equal(t.posts, 168);
      assert.equal(t.views, 2072957);
      assert.equal(t.deals, 300);
    });
    test('posts CSV carries the Phase and where it came from', () => {
      const s = fresh(), c = R.dealContext(s), rows = R.postsRows(s, s.deal_posts, c);
      assert.deepEqual(countBy(rows, r => r.phase_source), { auto: 223, override: 90 });
      assert.ok(rows.every(r => r.phase_id && r.campaign_id));
      const d = R.dealsRows(s, [deal(s, 'D000065')], TODAY, c)[0];
      assert.equal(d.primary_phase_id, 'CH-P1');
      assert.equal(d.legacy_phase_id, 'CH-P2');
    });
  });

  describe('CR-03 R4 · Overview in Campaign mode', () => {
    test('TC-22: CH runs 01/09–24/10 · Day 35 of 54 · ended / not started', () => {
      const s = fresh(), [a, z] = R.scopeRange(s, { campaignId: 'CH' });
      assert.deepEqual([a, z], ['2026-09-01', '2026-10-24']);
      assert.deepEqual(R.rangeStatus(a, z, TODAY), { kind: 'running', day: 35, of: 54, from: a, to: z });
      assert.equal(R.rangeStatus(a, z, '2026-10-25').kind, 'ended');
      assert.deepEqual(R.rangeStatus(a, z, '2026-08-30'), { kind: 'not_started', days: 2, from: a, to: z });
      const p2 = s.phases.find(p => p.phase_id === 'CH-P2');
      assert.deepEqual(R.scopeRange(s, { phaseIds: ['CH-P2'] }), [p2.start_date, p2.end_date]);
    });
    test('TC-23: summary cards of CH (Committed from Confirm QT; Shortlist apart)', () => {
      const x = R.summaryCards(fresh(), { campaignId: 'CH' }, TODAY);
      assert.deepEqual(x.deals, { active: 101, list: 3, inprocess: 11, complete: 87, cancelled: 0, completedPct: 87 / 101 * 100 });
      assert.equal(Math.round(x.deals.completedPct), 86);
      assert.deepEqual(x.budget, { budget: 850000, committed: 863700, shortlist: 5100, paid: 233500, remaining: -13700, over: true });
      assert.equal(x.posts.posted, 70); assert.equal(x.posts.planned, 103);
      assert.deepEqual(x.posts.byPlatform.filter(p => p.posted).map(p => [p.platform, p.posted]), [['TikTok', 58], ['Instagram', 7], ['Facebook', 5]]);
      const e = x.engagement;
      assert.deepEqual([e.views, e.likes, e.comments, e.saves, e.shares], [1981690, 33420, 442, 4401, 1678]);
      assert.equal(e.er.toFixed(4), '0.0202');
      assert.equal(e.cpv.toFixed(3), '0.089');
      assert.deepEqual([e.withMetrics, e.posted, e.noDate], [18, 70, 3]);
    });
    test('TC-24: summary cards of PH — 3 cancelled apart · no metrics', () => {
      const x = R.summaryCards(fresh(), { campaignId: 'PH' }, TODAY);
      assert.equal(x.deals.active, 87); assert.equal(x.deals.cancelled, 3); assert.equal(x.deals.complete, 70);
      assert.deepEqual([x.budget.committed, x.budget.shortlist, x.budget.budget, x.budget.paid, x.budget.over], [571679, 8300, 898400, 431179, false]);
      assert.equal(x.budget.committed + x.budget.shortlist, 579979, 'the CR number = Committed + Shortlist');
      assert.deepEqual([x.posts.posted, x.posts.planned], [52, 87]);
      assert.deepEqual(x.posts.byPlatform.filter(p => p.posted).map(p => [p.platform, p.posted]), [['TikTok', 45], ['Facebook', 7]]);
      assert.equal(x.engagement, null);
    });
    test('TC-25: Phase budget of CH', () => {
      const x = R.phaseBudgetRows(fresh(), 'CH');
      assert.deepEqual(x.rows.map(r => [r.phase.phase_id, r.committed, r.budget, r.over]), [['CH-P1', 573050, 500000, true], ['CH-P2', 290650, 350000, false]]);
      assert.deepEqual(x.rows.map(r => r.shortlist), [0, 5100]);
      assert.equal(x.total.committed, 863700); assert.equal(x.total.shortlist, 5100); assert.equal(x.total.budget, 850000);
      assert.equal(x.total.committed + x.total.shortlist, 868800);
      assert.deepEqual(x.extra, []);
    });
    test('TC-26: Phase KS-P2 — budget ฿50,000 · Committed ฿41,700 (+ ฿2,000 Shortlist)', () => {
      const x = R.summaryCards(fresh(), { campaignId: 'KS', phaseIds: ['KS-P2'] }, TODAY);
      assert.deepEqual([x.budget.budget, x.budget.committed, x.budget.shortlist], [50000, 41700, 2000]);
      assert.equal(x.budget.committed + x.budget.shortlist, 43700);
    });
  });

  describe('CR-03 R5 · Activity by date, Allocation vs target, pillar targets', () => {
    const sumBins = (r, k) => r.bins.reduce((a, b) => a + b[k], 0);
    test('TC-27: PH runs 29/08–31/10 (64 days) → weekly · months Aug–Oct · overlap 03–04/09', () => {
      const s = fresh(), [a, z] = R.activityRange(s, { campaignId: 'PH' }, TODAY);
      assert.deepEqual([a, z], ['2026-08-29', '2026-10-31']);
      assert.equal(R.dayDiff(z, a) + 1, 64);
      assert.equal(R.autoGran(a, z), 'week');
      assert.equal(R.autoGran('2026-09-01', '2026-10-15'), 'day', '45 days is still daily');
      const r = R.activityBins(s, { campaignId: 'PH' }, a, z, 'week', 'posts', 'phase', TODAY);
      assert.deepEqual([...new Set(r.bins.map(b => b.key.slice(5, 7)))], ['08', '09', '10']);
      assert.deepEqual(R.activitySeries(s, { campaignId: 'PH' }, 'phase', TODAY).filter(x => !x.grey).map(x => x.key), ['PH-P1', 'PH-P2', 'PH-P3', 'PH-OCT']);
      assert.deepEqual(R.phaseOverlaps(phasesOf(s, 'PH')).map(o => [o.from, o.to]), [['2026-09-03', '2026-09-04']]);
    });
    test('TC-28 / TC-30: Color by Pillar keeps "Not set" · posts are posted or planned', () => {
      const s = fresh(), sc = { campaignId: 'CH' }, [a, z] = R.activityRange(s, sc, TODAY);
      assert.deepEqual(R.activitySeries(s, sc, 'pillar', TODAY).map(x => x.key), ['Awareness', 'Awareness & Consideration', 'Consideration', 'Conversion', R.NOT_SET]);   // CR-19 §4.6: 4 pillars
      const r = R.activityBins(s, sc, a, z, R.autoGran(a, z), 'posts', 'pillar', TODAY);
      assert.equal(sumBins(r, 'posted') + sumBins(r, 'planned') + r.undated.count + r.outside, 103, 'every post of CH is on the chart or counted apart');
      assert.ok(sumBins(r, 'planned') > 0, 'planned posts are shown');
      assert.ok(r.totals.some(t => t.key === R.NOT_SET));
    });
    test('TC-29: Spend of KS = ฿340,400 (Shortlist not spent) · has the week of 10/08', () => {
      const s = fresh(), sc = { campaignId: 'KS' }, [a, z] = R.activityRange(s, sc, TODAY);
      const r = R.activityBins(s, sc, a, z, 'week', 'spend', 'phase', TODAY);
      assert.equal(Math.round(sumBins(r, 'total') + r.undated.amount), 340400);
      assert.ok(r.bins.some(b => b.key === '2026-08-10' && b.total > 0));
      assert.equal(r.outside, 0);
    });
    test('TC-31: (CR-24 §3) Pillar allocation is gone — the KS mix of its committed money still rides on the portfolio row', () => {
      assert.equal(R.pillarAllocation, undefined);
      const row = R.portfolio(fresh(), '2026-01-01', '2026-12-31', TODAY, null).rows.find(r => r.campaign.campaign_id === 'KS');
      assert.deepEqual(['Awareness', 'Awareness & Consideration', 'Consideration', 'Conversion', R.NOT_SET].map(k => row.pillarMix[k].toFixed(1)), ['16.3', '0.0', '26.3', '21.5', '35.9']);
    });
    test('TC-32: targets must be whole numbers that add up to 100', () => {
      assert.deepEqual(R.validatePillarTarget({ awareness: 10, consideration: 20, conversion: 60 }).errs.map(e => e.msg), [C.msg.pillarTargetSum(90)]);
      assert.deepEqual(R.validatePillarTarget({ awareness: '10', consideration: '20', conversion: '70' }).errs, []);
      ['', -5, 101, 10.5, 'x'].forEach(v => assert.deepEqual(R.validatePillarTarget({ awareness: v, consideration: 20, conversion: 70 }).errs.map(e => e.msg), [C.msg.pillarTargetNumber], String(v)));
    });
    test('TC-33: the old targets stay in the data (CR-19 §4.7: not used any more) · a Campaign\'s own one is still read for old files', () => {
      const s = fresh();
      assert.deepEqual(s.lookups.pillar_target_default, { awareness: 10, consideration: 20, conversion: 70 });
      s.campaigns.find(c => c.campaign_id === 'CH').pillar_target = { awareness: 20, consideration: 30, conversion: 50 };
      assert.deepEqual(R.pillarTargetOf(s, 'CH'), { awareness: 20, consideration: 30, conversion: 50 });
      assert.deepEqual(R.pillarTargetOf(s, 'KS'), { awareness: 10, consideration: 20, conversion: 70 });
    });
    test('TC-34: All campaigns — Color by Campaign · posted in the default range = 168', () => {
      const s = fresh(), sc = { campaignId: null, phaseIds: null }, [a, z] = R.overviewWindow(s, sc, TODAY);
      assert.deepEqual(R.activitySeries(s, sc, 'campaign', TODAY).map(x => x.key).sort(), ['AC', 'CH', 'KS', 'PH']);
      const r = R.activityBins(s, sc, a, z, R.autoGran(a, z), 'posts', 'campaign', TODAY);
      assert.equal(sumBins(r, 'posted'), 168);
    });
  });
});
