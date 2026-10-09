/* cr15.spec.js — CR-15 test cases (Journey: Script in every deal · Draft 1–3 · Approve · schema 14), run by tests/test.html.
   "today" is 08/10/2026 · the seed after migrate v14 · money anchors stay those of CR-05 §5.0 / CR-13 §5.0. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED, C } = t;
  const TD = '2026-10-08';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-08T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const byKol = (s, name) => { const k = s.kol_master.find(x => x.display_name === name); return s.deals.find(d => d.kol_id === k.kol_id && d.status !== 'Cancel' && d.status !== 'Complete'); };
  const count = (list, key) => list.reduce((m, x) => { m[x[key]] = (m[x[key]] || 0) + 1; return m; }, {});
  const OLD = { Script: 'Approve Script', 'Draft 1': 'Approve Draft 1', 'Draft 2': 'Approve Draft 2', 'Draft 3': 'Approve Draft 3' };
  /* a state as schema 13 saved it: the old journey and names, no new date fields */
  function asV13(state) {
    const o = JSON.parse(JSON.stringify(state)), back = v => OLD[v] || v;
    o.lookups.journey_steps = JSON.parse(JSON.stringify(SEED.lookups.journey_steps));
    o.deals.forEach(d => { d.sub_status = back(d.sub_status); ['expected_script_date', 'script_date', 'expected_approve_date', 'approved_date'].forEach(f => { delete d[f]; }); });
    o.deal_status_log.forEach(l => { l.sub_status = back(l.sub_status); l.from_sub_status = back(l.from_sub_status); });
    o.schema_version = 13;
    return o;
  }
  function fakeStorage() {
    const m = new Map();
    return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  }

  describe('CR-15 §3 · schema 14 — the journey of today', () => {
    test('TC-01 / §5.0: In process 33 = Brief 26 · Draft 1 6 · Draft 2 1 · Script 0 · Approve 0 · log Draft 1 73 · Draft 2 45 · 770 rows · no "Approve …" left', () => {
      const s = fresh();
      assert.equal(s.schema_version, S.SCHEMA_VERSION, 'CR-16 moved it on to 15');
      const inproc = s.deals.filter(d => d.status === 'Inprocess');
      assert.equal(inproc.length, 33);
      assert.deepEqual(count(inproc, 'sub_status'), { Brief: 26, 'Draft 1': 6, 'Draft 2': 1 });
      assert.equal(s.deal_status_log.length, 770);
      const lc = count(s.deal_status_log, 'sub_status');
      assert.deepEqual([lc['Draft 1'], lc['Draft 2'], lc.Script || 0, lc.Approve || 0], [73, 45, 0, 0]);
      assert.ok(!JSON.stringify([s.deals.map(d => d.sub_status), s.deal_status_log.map(l => [l.sub_status, l.from_sub_status]), s.lookups.journey_steps]).includes('Approve '));
      assert.deepEqual(R.stepsOf(s.lookups).map(x => x.sub_status), ['Shortlist', 'Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Draft 2', 'Draft 3', 'Approve', 'Post', 'Cancel']);
      assert.ok(s.deals.every(d => ['expected_script_date', 'script_date', 'expected_approve_date', 'approved_date'].every(f => d[f] === null)));
    });
    test('TC-01: a schema 13 file → 14 · every date stays · a copy of the data before is kept · money anchors do not move', () => {
      const s = fresh(), v13 = asV13(s), ls = fakeStorage();
      ls.setItem(S.KEY, JSON.stringify(v13));
      const st = S.createStore({ seed: SEED, storage: ls, now: () => new Date('2026-10-08T03:00:00Z') }), up = st.state;
      assert.equal(up.schema_version, S.SCHEMA_VERSION);
      /* CR-16: the copy is kept under the newest key (before v15) */
      assert.ok(ls.getItem(S.BEFORE15_KEY), 'the data from before the upgrade');
      assert.equal(JSON.parse(ls.getItem(S.BEFORE15_KEY)).schema_version, 13);
      const dates = o => o.deals.map(d => R.DATE_KEYS.filter(k => !['expected_script_date', 'script_date', 'expected_approve_date', 'approved_date'].includes(k)).map(k => d[k]));
      assert.deepEqual(dates(up), dates(v13));
      assert.deepEqual(up.deal_status_log.map(l => [l.log_id, l.effective_date, l.changed_at]), v13.deal_status_log.map(l => [l.log_id, l.effective_date, l.changed_at]));
      assert.deepEqual(up.deals.map(d => d.sub_status), s.deals.map(d => d.sub_status));
      const ph = s.phases.map(p => p.phase_id), a = R.dealTiles(up, up.deals, { campaignId: null, phaseIds: ph }, TD), b = R.dealTiles(s, s.deals, { campaignId: null, phaseIds: ph }, TD);
      assert.deepEqual([a.committed, a.shortlist, a.paid], [b.committed, b.shortlist, b.paid]);
      assert.equal(a.committed + a.shortlist, 1881579, 'CR-05 §5.0 (Committed + Pending)');
    });
    test('migrate v14 run twice gives the same · TC-02: a label typed for Approve Draft 1 ("D1 ok") stays with Draft 1 · a step added by hand stays', () => {
      const s = fresh(), once = R.migrateV14(JSON.parse(JSON.stringify(s)));
      assert.deepEqual(once.lookups.journey_steps, s.lookups.journey_steps);
      assert.deepEqual(once.deals, s.deals);
      const v13 = asV13(s);
      v13.lookups.journey_steps.find(x => x.sub_status === 'Approve Draft 1').label_th = 'D1 ok';
      v13.lookups.journey_steps.push({ sort_order: 95, status: 'Inprocess', sub_status: 'Legal check', is_optional: true, date_field: null, label_th: 'ตรวจกฎหมาย' });
      const up = R.migrateV14(v13);
      assert.equal(R.stepOf(up.lookups, 'Draft 1').label_th, 'D1 ok');
      assert.equal(R.stepOf(up.lookups, 'Draft 2').label_th, 'ส่ง feedback Draft 2 แล้ว', 'an untouched label takes the new one');
      assert.ok(R.stepOf(up.lookups, 'Legal check'));
      assert.equal(R.stepOf(up.lookups, 'Approve Draft 1'), null);
    });
  });

  describe('CR-15 §4.1–4.3 · the plan · moves · due', () => {
    test('TC-04: a new deal (1 round) — Confirm QT → Brief → Script → Draft 1 → Approve → Post · 5 dots · no Script switch', () => {
      const s = fresh(), d = Object.assign({}, R.DEAL_TEMPLATE, { deal_id: 'DX', status: 'Inprocess', sub_status: 'Brief', draft_rounds: 1 });
      assert.deepEqual(R.dealPlan(s.lookups, d).map(x => x.sub_status).slice(2), ['Confirm QT', 'Brief', 'Script', 'Draft 1', 'Approve', 'Post']);
      assert.equal(R.stageDots(s.lookups, d).length, 5);
      assert.ok(!('script_required' in R.DEAL_TEMPLATE) && !('script' in R.planOf(d)));
      assert.deepEqual(R.stageOrder(s.lookups).map(x => [x.key, x.status]).slice(3, 9), [['Brief', 'Inprocess'], ['Script', 'Inprocess'], ['Draft 1', 'Inprocess'], ['Draft 2', 'Inprocess'], ['Draft 3', 'Inprocess'], ['Approve', 'Inprocess']]);
    });
    test('TC-05: nanomona777 Brief → Draft 1 — "These steps will be marked done on 08/10: Script" · script_date 08/10 · 2 logs (Script auto-completed, Draft 1)', () => {
      const s = fresh(), d = Object.assign(byKol(s, 'nanomona777'), { pillar: 'Awareness', payment_term: 'postpaid', gencode_period: 30, cta: 'TikTok' });   // CR-20 §4.7: the term and the Gencode days too
      assert.equal(d.sub_status, 'Brief');
      const chk = R.checkMove(s, d, 'Draft 1', { date: TD });
      assert.deepEqual(chk.errs, []);
      assert.ok(chk.warns.some(w => w.msg === 'These steps will be marked done on 08/10: Script'));
      const r = R.applyMove(s, d, 'Draft 1', { date: TD, note: '' }, { logId: 771, now: new Date('2026-10-08T03:00:00Z') });
      assert.deepEqual([r.deal.script_date, r.deal.approved_draft1_date, r.deal.sub_status], [TD, TD, 'Draft 1']);
      assert.deepEqual(r.logs.map(l => [l.log_id, l.from_sub_status, l.sub_status, l.effective_date, l.note]), [[771, 'Brief', 'Script', TD, 'auto-completed'], [772, 'Script', 'Draft 1', TD, null]]);
      assert.equal(r.log, r.logs[1]);
    });
    test('TC-06: tuckpx (Draft 2 of 2) → Approve straight away · approved_date today · In process · payment and samples as they were', () => {
      const s = fresh(), d = byKol(s, 'tuckpx');
      assert.deepEqual([d.sub_status, R.planOf(d).drafts], ['Draft 2', 2]);
      assert.deepEqual(R.dropPlan(s, d, 'Approve', TD), { kind: 'dialog' }, 'the seed deal has no pillar: the dialog asks for it (CR-03)');
      Object.assign(d, { pillar: 'Conversion', payment_term: 'postpaid', cta: 'TikTok' });   // CR-20 §4.7: the term too · CR-22: a CTA
      assert.deepEqual(R.dropPlan(s, d, 'Approve', TD), { kind: 'instant' });
      const r = R.applyMove(s, d, 'Approve', { date: TD, note: '' }, { logId: 771 });
      assert.deepEqual([r.deal.sub_status, r.deal.status, r.deal.approved_date, r.logs.length], ['Approve', 'Inprocess', TD, 1]);
      assert.equal(R.paymentState(r.deal, TD), R.paymentState(d, TD));
      assert.equal(R.needsSample(s.lookups, r.deal), R.needsSample(s.lookups, d));
      assert.deepEqual(R.dealTabs(s, [r.deal], TD).counts.inprocess, 1, 'CR-13 tab In process');
    });
    test('TC-07 / TC-08: Approve → Post needs every post linked and dated (as before) · Draft 1 (1 round) → Post marks Approve done', () => {
      const s = fresh(), d = Object.assign(byKol(s, 'sanggannualpong'), { pillar: 'Awareness', payment_term: 'postpaid' });   // CR-20 §4.7: the term too
      assert.equal(d.sub_status, 'Draft 1');
      const app = Object.assign({}, d, { sub_status: 'Approve' });
      const posts = R.postsOf(s, d.deal_id);
      assert.ok(posts.some(p => !R.postDone(p)), 'seed: a post without link / date');
      assert.ok(R.checkMove(s, app, 'Post', { date: TD }).errs.some(e => e.msg === C.msg.movePostsIncomplete(posts.filter(p => !R.postDone(p)).length)));
      assert.ok(R.checkMove(s, { ...d, draft_rounds: 1 }, 'Post', { date: TD }).warns.some(w => w.msg === 'These steps will be marked done on 08/10: Approve'));
      posts.forEach(p => { p.post_date = '2026-10-07'; p.post_link = 'https://www.tiktok.com/@x/video/1'; });
      const r = R.applyMove(s, { ...d, draft_rounds: 1 }, 'Post', { date: TD, note: '' }, { logId: 800 });
      assert.deepEqual([r.deal.status, r.deal.approved_date, r.logs.map(l => l.sub_status)], ['Complete', TD, ['Approve', 'Post']]);
    });
    test('TC-09: at Brief with Script due yesterday → Overdue · Next due "Script · 1d late" · in Operations › Overdue', () => {
      const s = fresh(), d = byKol(s, 'nanomona777');
      assert.equal(R.dueDate(s, d), null, 'no Script due → no due (§4.3)');
      d.expected_script_date = '2026-10-07';
      assert.deepEqual([R.dueDate(s, d), R.dueStep(s, d).sub_status, R.isOverdue(s, d, TD)], ['2026-10-07', 'Script', true]);
      assert.equal(`${R.stepShort(R.dueStep(s, d).sub_status)} · ${C.deal.late(R.dayDiff(TD, R.dueDate(s, d)))}`, 'Script · 1d late');
      assert.ok(R.opsQueues(s, { campaign: '', pic: '', tier: '' }, TD).overdue.includes(d));
    });
    test('TC-10: the last Draft without an Approve due → the due is the Post\'s · with one → the Approve\'s · Draft k → its own', () => {
      const s = fresh(), d = deal(s, 'D000287');   // Draft 1 of 1
      assert.deepEqual([d.sub_status, R.planOf(d).drafts], ['Draft 1', 1]);
      /* CR-23 §3.2 — Approve is our own work: no date of its own → no due (was: the Post's) */
      assert.deepEqual([R.dueDate(s, d), R.dueStep(s, d).sub_status, R.isOverdue(s, d, TD)], [null, 'Approve', false]);
      d.expected_approve_date = '2026-10-20';
      assert.deepEqual([R.dueDate(s, d), R.dueStep(s, d).sub_status], ['2026-10-20', 'Approve']);
      const two = Object.assign({}, d, { draft_rounds: 2, expected_draft2_date: '2026-10-15' });
      assert.deepEqual([R.dueDate(s, two), R.dueStep(s, two).sub_status], ['2026-10-15', 'Draft 2']);
      assert.equal(R.expectedField(R.stepOf(s.lookups, 'Script')), 'expected_script_date');
    });
    test('TC-11: a Complete deal of the seed — Script and Approve show "—" (not recorded), never as a warning', () => {
      const s = fresh(), d = deal(s, 'D000119'), t = R.dealTimeline(s.lookups, d, R.logsOf(s, d.deal_id), R.postsOf(s, d.deal_id), TD);
      const x = n => t.steps.find(y => y.sub === n);
      assert.deepEqual([x('Script').state, x('Approve').state, x('Script').date, x('Approve').date], ['nodate', 'nodate', null, null]);
      assert.ok(t.steps.every(y => !y.late_days && !y.overdue_days));
      assert.equal(C.journey.dateNotRecorded, 'Not recorded');
    });
    test('TC-12: Move to Draft 3 with 1 round → the error of before + "+ Add draft round"', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000287'), { pillar: 'Awareness', payment_term: 'postpaid', cta: 'TikTok' });   // Draft 1 of 1 · CR-20 §4.7: the term too · CR-22: a CTA
      assert.ok(R.checkMove(s, d, 'Draft 3', { date: TD }).errs.some(e => e.code === 'add_round' && e.msg === C.msg.moveDraftNotInPlan(3, 1)));
      const ok = R.checkMove(s, d, 'Draft 3', { date: TD, addRound: true });
      assert.deepEqual(ok.errs, []);
      assert.ok(ok.warns.some(w => w.msg === 'These steps will be marked done on 08/10: Draft 2'));
    });
    test('§4.5 core steps: Contacted · Confirm QT · Brief · Script · Draft 1 · Approve · Post · Cancel', () => {
      const s = fresh();
      assert.deepEqual(R.stepsOf(s.lookups).filter(R.isCoreStep).map(x => x.sub_status), ['Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Approve', 'Post', 'Cancel']);
      assert.ok([R.stepOf(s.lookups, 'Script'), R.stepOf(s.lookups, 'Approve')].every(x => R.isCoreStep(x) && !x.is_optional));
    });
    test('TC-14: Deals tabs (CR-13) of Charming — In process 11 as before · Stage options include Script and Approve', () => {
      const s = fresh(), ch = s.campaigns.find(c => c.campaign_name.startsWith('Charming')).campaign_id;
      const rows = R.filterDeals(s, Object.assign(R.blankDealFilter(), { campaign: ch, pic: '' }), TD, R.dealContext(s));
      assert.deepEqual(R.DEAL_TABS.map(k => R.dealTabs(s, rows, TD).counts[k]), [101, 3, 11, 87, 0]);
      assert.deepEqual(count(rows.filter(d => d.status === 'Inprocess'), 'sub_status'), { Brief: 9, 'Draft 1': 1, 'Draft 2': 1 });
      const sub = R.stepsOf(s.lookups).map(x => x.sub_status);
      assert.ok(sub.includes('Script') && sub.includes('Approve'));
      assert.equal(R.stageLabel(s.lookups, byKol(s, 'tuckpx')), 'Draft 2');
    });
  });
});
