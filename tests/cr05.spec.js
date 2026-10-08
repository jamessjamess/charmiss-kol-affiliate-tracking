/* cr05.spec.js — CR-05 test cases (KOL Manager, View as role, schema v5 …), run by tests/test.html. "today" is always 05/10/2026. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const user = (s, name) => s.users.find(u => u.display_name === name);
  function fakeStorage() { const m = new Map(); return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }

  describe('CR-05 R1 · KOL Manager, View as role, schema v5', () => {
    test('TC-02: the matrix has 4 roles and the rows of §4.1', () => {
      assert.deepEqual(R.ROLES.slice(0, 4), ['admin', 'kol_manager', 'staff', 'viewer']);   // CR-09 §4.16 adds Accounting after these
      const grid = R.PERMISSIONS.filter(p => !['campaign.products', 'campaign.draft', 'settings.ops'].includes(p.key)).slice(0, 10)   /* CR-17 adds campaign.draft (Staff) · settings.ops */.map(p => [p.key].concat(R.ROLES.slice(0, 4).map(r => (p[r] ? 1 : 0))));   // CR-08 §4.9 adds the Payments rows after these · CR-09 §4.7 Campaign products
      assert.deepEqual(grid, [
        ['view', 1, 1, 1, 1], ['deal.edit', 1, 1, 1, 0], ['kol.edit', 1, 1, 1, 0], ['deal.money', 1, 1, 0, 0], ['kol.merge', 1, 1, 0, 0],
        ['campaign.edit', 1, 1, 0, 0], ['settings.lists', 1, 1, 0, 0], ['settings.tiers', 1, 0, 0, 0], ['data.restore', 1, 0, 0, 0], ['roles', 1, 0, 0, 0]]);
      R.PERMISSIONS.forEach(p => assert.ok(C.roles.perm[p.key], 'label for ' + p.key));
      assert.equal(C.roles.role.kol_manager, 'KOL Manager');
    });
    test('TC-01 basis: Dream as KOL Manager — campaigns, lists, costs after payment (with a reason) · no Tier rules / Restore / Role Management', () => {
      const s = fresh(), D = Object.assign(user(s, 'Dream'), { role: 'kol_manager' });
      ['campaign.edit', 'settings.lists', 'cost.override', 'deal.campaign', 'kol.merge', 'deal.edit', 'kol.edit', 'export', 'backup'].forEach(a => assert.equal(R.can(D, a), true, a));
      ['settings.tiers', 'data.restore', 'roles'].forEach(a => assert.equal(R.can(D, a), false, a));
      assert.deepEqual(R.fieldEditable(s, deal(s, 'D000296'), 'rate_card', D), { editable: true, needsReason: true, reason: C.lock.paymentRecordedAdmin });
      assert.equal(R.validateUser(s, Object.assign({}, D)).errs.length, 0, 'kol_manager is a valid role');
      assert.equal(R.picName(D), 'Dream', 'a KOL Manager can still be a PIC');
    });
    test('effectiveRole / actingAs: only a real admin can view as another role · changed_by stays the real person', () => {
      const s = fresh(), A = user(s, 'Admin'), P = user(s, 'Pang');
      assert.equal(R.effectiveRole(A, 'staff'), 'staff');
      assert.equal(R.effectiveRole(A, null), 'admin');
      assert.equal(R.effectiveRole(A, 'nonsense'), 'admin');
      assert.equal(R.effectiveRole(P, 'admin'), 'staff', 'a staff member cannot raise their role');
      const v = R.actingAs(A, 'viewer');
      assert.equal(v.role, 'viewer'); assert.equal(v.user_id, 'U000'); assert.equal(A.role, 'admin', 'the user record is not changed');
      assert.equal(R.can(v, 'deal.edit'), false);
      assert.equal(R.actingAs(A, null), A);
      const r = R.applyMove(s, deal(s, 'D000044'), 'Draft 1', { date: '2026-10-05', note: '', pillar: 'Awareness' }, { logId: 9999, quoteId: 'Q99999', eventId: 1, now: new Date(), user: A.user_id });
      assert.equal(r.log.changed_by, 'U000', 'TC-04: the log carries the admin, not the role');
    });
    test('migration v4 → v5: short_code removed · status fields null · no role_override anywhere in the state or a Backup (TC-08)', () => {
      const s = fresh();
      assert.ok(s.schema_version >= 5);
      assert.ok(s.campaigns.every(c => c.status_override === null && c.status_reason === null && c.status_changed_at === null && !('short_code' in c)));
      const v4 = JSON.parse(JSON.stringify(s)); v4.schema_version = 4; v4.campaigns.forEach(c => { c.short_code = c.campaign_id; delete c.status_override; delete c.status_reason; delete c.status_changed_at; });
      v4.meta.role_override = 'viewer';
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      const res = st.restore(JSON.stringify(v4), 'v4.json');
      assert.equal(res.ok, true); assert.equal(res.migratedFrom, 4);
      assert.ok(st.state.campaigns.every(c => !('short_code' in c) && c.status_override === null));
      assert.equal('role_override' in st.state.meta, false);
      assert.equal(st.backup().text.includes('role_override'), false);
      assert.equal(S.migrate(JSON.parse(JSON.stringify(SEED.meta ? Object.assign({}, v4) : v4))).schema_version, S.SCHEMA_VERSION);
    });
  });

  describe('CR-05 R2 · names instead of IDs, internal IDs, unique names', () => {
    test('phaseName / phaseLabel: names only · a name shared by two Campaigns reads "<Campaign> › <Phase>" without context', () => {
      const s = fresh();
      assert.equal(R.phaseName(s, 'PH-OCT'), 'Phase 4 · October', 'CR-06: names by place');
      assert.equal(R.phaseName(s, R.NEEDS), C.deal.needsPhase);
      assert.equal(R.phaseLabel(s, 'CH-P1', false), 'Phase 1 · Launch', 'unique name');
      s.phases.find(p => p.phase_id === 'KS-P1').label = 'Launch';
      assert.equal(R.phaseLabel(s, 'CH-P1', false), 'Charming Iconic Glow › Phase 1 · Launch');
      assert.equal(R.phaseLabel(s, 'CH-P1', true), 'Phase 1 · Launch');
      assert.equal(R.campaignName(s, 'KS'), 'Kiss Signal Lip Gloss');
    });
    test('TC-17 basis: new IDs are CMP-0001 / PHS-0001 and count on', () => {
      const s = fresh();
      assert.equal(R.campaignIdFor('Anything', s.campaigns), 'CMP-0001');
      assert.equal(R.phaseIdFor('CMP-0001', s.phases), 'PHS-0001');
      s.campaigns.push({ campaign_id: 'CMP-0001' }); s.phases.push({ phase_id: 'PHS-0001' }, { phase_id: 'PHS-0002' });
      assert.equal(R.campaignIdFor('x', s.campaigns), 'CMP-0002');
      assert.equal(R.phaseIdFor('x', s.phases), 'PHS-0003');
    });
    test('TC-16: a Campaign name already used (case and spaces ignored) is an error naming it', () => {
      const s = fresh();
      assert.deepEqual(R.validateCampaign(s, { campaign_name: 'kiss signal lip gloss ' }).errs.map(e => e.msg), [C.msg.campaignNameDup('Kiss Signal Lip Gloss')]);
      assert.deepEqual(R.validateCampaign(s, { campaign_id: 'KS', campaign_name: 'Kiss Signal Lip Gloss' }).errs, [], 'its own name');
    });
    test('TC-10: CSVs keep the IDs next to the names', () => {
      ['campaign_id', 'campaign_name', 'primary_phase_id', 'primary_phase_name'].forEach(k => assert.ok(R.DEALS_COLS.includes(k), 'deals ' + k));
      ['campaign_id', 'campaign_name', 'phase_id', 'phase_name'].forEach(k => assert.ok(R.POSTS_COLS.includes(k), 'posts ' + k));
      const s = fresh(), row = R.postsRows(s, [s.deal_posts.find(p => p.deal_id === 'D000044')], R.dealContext(s))[0];
      assert.deepEqual([row.campaign_id, row.campaign_name, row.phase_id, row.phase_name], ['CH', 'Charming Iconic Glow', 'CH-P1', 'Phase 1 · Launch']);
    });
    test('TC-14: Campaign order on 05/10/2026 — On going first, Complete last', () => {
      const s = fresh();
      assert.deepEqual(R.sortCampaigns(s.campaigns, s.phases, '2026-10-05').map(c => c.campaign_name), ['Charming Iconic Glow', 'Kiss Signal Lip Gloss', 'Perfect Heart ซอง 7-11', 'Acne Fade Concealer']);
    });
  });

  describe('CR-05 R3 · Phase Planner rules', () => {
    const row = (name, a, z, amt, extra) => Object.assign({ key: name, phase_id: null, label: name, start_date: a, end_date: z, budget_kol: amt }, extra || {});
    const camp = (name, budget) => ({ campaign_id: null, campaign_name: name, budget_kol: budget });
    test('TC-17: ฿1,000,000 · 60 / 20 / 20 % → ฿600,000 / ฿200,000 / ฿200,000 · allocated 100% · no warning', () => {
      const s = fresh(), amts = [60, 20, 20].map(p => R.budgetFromPct(p, 1000000));
      assert.deepEqual(amts, [600000, 200000, 200000]);
      const rows = [row('Phase 1', '2026-11-01', '2026-11-15', amts[0]), row('Phase 2', '2026-11-16', '2026-11-30', amts[1]), row('Phase 3', '2026-12-01', '2026-12-15', amts[2])];
      const t = R.planTotals(camp('New Campaign', 1000000), rows);
      assert.deepEqual([t.allocated, t.diff, t.pct], [1000000, 0, 100]);
      const v = R.validatePhasePlan(s, camp('New Campaign', 1000000), rows, []);
      assert.deepEqual([v.errs, v.warns, v.infos], [[], [], []]);
    });
    test('TC-18: 60 / 30 / 20 % → "Over budget by ฿100,000" is a warning to confirm, not an error', () => {
      const s = fresh(), rows = [600000, 300000, 200000].map((a, i) => row('P' + i, `2026-11-0${i * 3 + 1}`, `2026-11-0${i * 3 + 2}`, a));
      const v = R.validatePhasePlan(s, camp('New Campaign', 1000000), rows, []);
      assert.deepEqual(v.errs, []);
      assert.deepEqual(v.warns.map(w => [w.kind, w.msg, w.red]), [['over', C.planner.barOver('฿100,000'), true]]);   // CR-18 §4.2: red, in English
    });
    test('TC-20: Split evenly · Fill remaining', () => {
      assert.deepEqual(R.splitEvenly(4), [25, 25, 25, 25]);
      assert.deepEqual(R.splitEvenly(3), [33.33, 33.33, 33.34]);
      assert.deepEqual(R.fillRemaining(['50', '20', ''], 2), ['50', '20', 30]);
      assert.deepEqual(R.fillRemaining([70, 50, 0], 2), [70, 50, 0], 'never below 0');
    });
    test('TC-23: end before start is an error (CR-06: labels may repeat) · TC-22: a Phase with posts cannot be deleted', () => {
      const s = fresh();
      const v = R.validatePhasePlan(s, camp('X', 100), [row('Same', '2026-11-01', '2026-11-05', 10), row('same ', '2026-11-10', '2026-11-08', 10)], []);
      assert.deepEqual(v.errs.map(e => [e.field, e.msg]), [['row1_end', C.msg.phaseEndBeforeStart]]);
      const blank = R.validatePhasePlan(s, camp('', null), [row('', '', '', '')], []);
      assert.deepEqual(blank.errs.map(e => e.field), ['campaign_name', 'row0_start', 'row0_end']);
      assert.deepEqual(R.validatePhasePlan(s, { campaign_id: 'PH', campaign_name: 'Perfect Heart ซอง 7-11', budget_kol: 898400 }, [], ['PH-P1']).errs.map(e => e.msg), [C.msg.planDeleteHasPosts('Phase 1 · Awareness & Consideration')]);
      assert.equal(R.validatePhasePlan(s, camp('X', null), [row('A', '2026-11-01', '2026-11-05', '', { budget_pct: '-5' })], []).errs[0].field, 'row0_budget');
    });
    test('overlap and gap are reported by name · % without a Campaign budget warns · unallocated is info', () => {
      const s = fresh();
      const v = R.validatePhasePlan(s, camp('X', 1000), [row('A', '2026-11-01', '2026-11-10', 200), row('B', '2026-11-08', '2026-11-12', 300), row('C', '2026-11-20', '2026-11-25', 100)], []);
      assert.deepEqual(v.warns.map(w => w.msg), [C.planner.barUnder('฿400', '฿600', '฿1,000'), C.msg.phaseOverlap('Phase 1 · A', 'Phase 2 · B', '08/11', '10/11')]);   // CR-18: short of the budget = red
      assert.deepEqual(v.infos.map(i => i.msg), [C.msg.planGap('13/11', '19/11')]);
      assert.deepEqual(R.validatePhasePlan(s, camp('X', ''), [row('A', '2026-11-01', '2026-11-10', '', { budget_pct: '50' })], [], { pctUsed: true }).warns.map(w => w.msg), [C.msg.planPctNoBudget]);
      assert.equal(R.validatePhasePlan(s, camp('Kiss Signal Lip Gloss', 1), [], []).errs[0].msg, C.msg.campaignNameDup('Kiss Signal Lip Gloss'));
    });
    test('TC-21: PH Phase 1 ends 02/09 → overlap gone, 10 posts back to their date, PH total (committed + pending) ฿579,979 unchanged', () => {
      const s = fresh(), rows = R.sortPhases(s.phases.filter(p => p.campaign_id === 'PH')).map(p => row(p.label, p.start_date, p.end_date, p.budget_kol, { key: p.phase_id, phase_id: p.phase_id }));
      rows[0].end_date = '2026-09-02';
      const v = R.validatePhasePlan(s, { campaign_id: 'PH', campaign_name: 'Perfect Heart ซอง 7-11', budget_kol: 898400 }, rows, []);
      assert.equal(v.warns.filter(w => /overlap/.test(w.msg)).length, 0);
      const x = R.planImpact(s, 'PH', rows, []);
      assert.equal(x.toAuto, 10);
      assert.equal(x.needs, 0);
      assert.deepEqual([x.totalBefore, x.totalAfter], [579979, 579979]);
      assert.equal(x.rows.find(r => r.key === 'PH-P1').before, 310600);
      assert.equal(x.rows.reduce((a, r) => a + r.after, 0), x.rows.reduce((a, r) => a + r.before, 0), 'committed only moves between Phases');
    });
  });

  describe('CR-05 R4 · money words, Dashboard tabs, Operations', () => {
    const TD = '2026-10-05';
    test('§5.0: Budget → Committed → Used % → Remaining → Pending per Campaign and in total', () => {
      const s = fresh(), m = id => { const x = R.campaignMoney(s, id); return [x.budget, x.committed, Math.round(x.usedPct), x.remaining, x.pending, x.deals]; };
      assert.deepEqual(m('CH'), [850000, 863700, 102, -13700, 5100, 101]);
      assert.deepEqual(m('KS'), [600000, 340400, 57, 259600, 7900, 83]);
      assert.deepEqual(m('PH'), [898400, 571679, 64, 326721, 8300, 87]);
      assert.deepEqual(m('AC'), [400000, 7800, 2, 392200, 76700, 29]);
      const t = R.moneyTotal(['CH', 'KS', 'PH', 'AC'].map(id => R.campaignMoney(s, id)));
      assert.deepEqual([t.budget, t.committed, Math.round(t.usedPct), t.remaining, t.pending, t.deals], [2748400, 1783579, 65, 964821, 98000, 300]);
      assert.equal(t.committed + t.pending, 1881579, 'Committed + Pending = the CR-03 total');
      assert.deepEqual(R.moneyOf(null, 5, 1, 0), { budget: null, committed: 5, usedPct: null, remaining: null, pending: 1, paid: 0 });
      assert.equal(R.phaseSummary(s, 'CH-P2').committed + R.phaseSummary(s, 'CH-P2').shortlist, 295750, 'Phase: Committed + Pending = the old anchor');
    });
    test('TC-27: presets — Last 90 days = 08/07/2026 – 05/10/2026 (default) · Posts 191', () => {
      assert.deepEqual(R.presetRange('last90', TD), ['2026-07-08', TD]);
      assert.deepEqual(R.presetRange('last30', TD), ['2026-09-06', TD]);
      /* CR-07 §4.1 replaced the presets with whole calendar periods (this_month / this_year now end on the period's last day) */
      assert.deepEqual(R.presetRange('this_month', TD), ['2026-10-01', '2026-10-31']);
      const k = R.allKpis(fresh(), '2026-07-08', TD, TD);
      assert.deepEqual([k.campaigns, k.deals, k.posts, k.committed, k.budget, k.pending], [4, 300, 191, 1783579, 2748400, 98000]);
    });
    test('TC-30 / TC-31: KPI Committed 65% used · ฿964,821 remaining · portfolio rows in §4.8 order', () => {
      const s = fresh(), p = R.portfolio(s, '2026-07-08', TD, TD);
      assert.deepEqual(p.rows.map(r => r.campaign.campaign_name), ['Charming Iconic Glow', 'Kiss Signal Lip Gloss', 'Perfect Heart ซอง 7-11', 'Acne Fade Concealer']);
      assert.deepEqual(p.rows.map(r => r.remaining), [-13700, 259600, 326721, 392200]);
      assert.equal(Math.round(p.total.usedPct), 65);
      assert.equal(p.total.posts, 191);
      const mix = p.rows.find(r => r.campaign.campaign_id === 'KS').pillarMix;
      assert.ok(Math.abs(Object.values(mix).reduce((a, v) => a + v, 0) - 100) < 1e-9);
      assert.equal(R.portfolio(s, '2025-01-01', '2025-01-31', TD).rows.length, 0, 'no campaign in that range');
    });
    test('TC-32: Activity by campaign — 4 lanes in order, one y scale', () => {
      const s = fresh(), m = R.swimlanes(s, '2026-07-08', TD, R.autoGran('2026-07-08', TD), 'posts', TD);
      assert.deepEqual(m.lanes.map(l => l.campaign.campaign_id), ['CH', 'KS', 'PH', 'AC']);
      assert.ok(m.lanes.every(l => l.bins.length === m.keys.length));
      assert.equal(m.max, Math.max(...m.lanes.flatMap(l => l.bins.map(b => b.total))));
      assert.equal(m.lanes.reduce((a, l) => a + l.bins.reduce((x, b) => x + b.posted, 0), 0), 191, 'posted in range = the KPI');
    });
    test('TC-34: Operations (PIC All) — queue sizes · Overdue most late first', () => {
      const s = fresh(), Q = R.opsQueues(s, { campaign: '', pic: '', tier: '' }, TD);
      assert.deepEqual(R.QUEUES.map(k => [k, Q[k].length]), [['overdue', 5], ['unpaid', 130], ['beforeBrief', 0], ['termNotSet', 70], ['pillarNotSet', 252], ['noDate', 48], ['needsPhase', 0], ['outside', 24], ['noProducts', 4]], 'CR-06 adds the Campaign queue noProducts');
      const rows = R.queueRows(s, 'overdue', Q.overdue, TD);
      /* CR-15: D000098 (Brief) waits on Script, which has no due date — the most late is now D000051's Draft 2 */
      assert.equal(rows[0].deal.deal_id, 'D000051');
      assert.equal(rows[0].issue, C.ops.issueOverdue('Draft 2', '20/09/2026', 15));
      assert.ok(R.queueRows(s, 'overdue', Q.overdue, TD).some(r => r.issue === C.ops.issueOverdue('Post', '24/09/2026', 11)), 'Draft 1 (1 round) → Approve with no date → the Post due');
      assert.ok(rows.every((r, i) => !i || rows[i - 1].rank >= r.rank));
    });
    test('TC-35 / TC-36: Pang only sees Pang · Workload open deals add up to 70', () => {
      const s = fresh(), Q = R.opsQueues(s, { campaign: '', pic: 'Pang', tier: '' }, TD);
      assert.deepEqual([Q.overdue.length, Q.unpaid.length, Q.pillarNotSet.length], [1, 13, 39]);
      assert.ok(R.QUEUES.filter(k => k !== 'noProducts').every(k => Q[k].every(d => d.pic === 'Pang')), 'deal queues (noProducts lists Campaigns)');
      const w = R.workload(s, { campaign: '', pic: '', tier: '' }, TD);
      assert.equal(w.reduce((a, r) => a + r.open, 0), 70);
      assert.deepEqual(w.map(r => [r.pic, r.open]), [['Dream', 28], ['Pizza', 13], ['Ja', 12], ['Amp', 9], [null, 5], ['Pang', 3]]);
      assert.equal(R.opsDeals(s, { pic: '__none' }, R.dealContext(s)).length, 5);
    });
  });

  describe('CR-05 R5 · Campaign status On hold / Cancelled', () => {
    const TD = '2026-10-05';
    const camp = (s, id) => s.campaigns.find(c => c.campaign_id === id);
    test('TC-40 basis: On hold wins over the dates · no new deal / Add to phase · existing deals stay editable', () => {
      const s = fresh(), ph = camp(s, 'PH'), A = user(s, 'Admin');
      Object.assign(ph, { status_override: 'on_hold', status_reason: 'รอสินค้า' });
      assert.equal(R.campaignEffectiveStatus(ph, R.phasesOfCampaign(s, 'PH'), TD), 'on_hold');
      assert.equal(R.campaignBlocksNew(s, 'PH'), C.msg.campaignOnHold('Perfect Heart ซอง 7-11'));
      assert.ok(R.checkAddToCampaign(s, s.kol_master[0].kol_id, 'PH', 'Pang', 'postpaid').errs.some(e => e.msg === C.msg.campaignOnHold('Perfect Heart ซอง 7-11')));
      assert.ok(R.planShortlist(s, [s.kol_master[0].kol_id], 'PH', 'Pang', 'postpaid').errs.length > 0);
      const d = s.deals.find(x => x.campaign_id === 'PH' && x.status === 'Inprocess');
      assert.equal(R.fieldEditable(s, d, 'remark', A).editable, true);
      assert.equal(R.fieldEditable(s, d, 'pic', A).editable, true, 'on hold: old deals still editable');
      assert.equal(R.campaignBlocksNew(s, 'CH'), null);
    });
    test('TC-41 basis: Cancelled — deals keep only Remark, no Move stage · a reason is required', () => {
      const s = fresh(), ac = camp(s, 'AC'), A = user(s, 'Admin');
      Object.assign(ac, { status_override: 'cancelled', status_reason: 'ยกเลิกโปรเจกต์' });
      const d = s.deals.find(x => x.campaign_id === 'AC' && x.status !== 'Cancel');
      assert.equal(R.fieldEditable(s, d, 'remark', A).editable, true);
      assert.deepEqual(R.fieldEditable(s, d, 'pic', A), { editable: false, reason: C.lock.campaignCancelled });
      assert.equal(R.sectionEditable(s, d, 'posts', A), false);
      assert.ok(R.checkMove(s, d, 'Cancel', { date: TD, cancelReason: 'x' }).errs.some(e => e.msg === C.msg.campaignCancelledEdit));
      assert.equal(R.campaignBlocksNew(s, 'AC'), C.msg.campaignCancelledNew('Acne Fade Concealer'));
      assert.deepEqual(R.validateCampaignStatus('on_hold', ' ').errs.map(e => e.msg), [C.msg.campaignStatusReason]);
      assert.deepEqual(R.validateCampaignStatus('cancelled', 'ok').errs, []);
      assert.deepEqual(R.validateCampaignStatus(null, '').errs, [], 'Resume needs no reason');
    });
    test('TC-43: order On going → Not started → On hold → Complete → Cancelled · cancelled out of the totals unless asked', () => {
      const s = fresh();
      camp(s, 'KS').status_override = 'on_hold'; camp(s, 'AC').status_override = 'cancelled';
      s.campaigns.push({ campaign_id: 'CMP-0001', campaign_name: 'Next Launch', budget_kol: 100, status_override: null });
      s.phases.push({ phase_id: 'PHS-0001', campaign_id: 'CMP-0001', label: 'P1', start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 100 });
      assert.deepEqual(R.sortCampaigns(s.campaigns, s.phases, TD).map(c => c.campaign_id), ['CH', 'PH', 'CMP-0001', 'KS', 'AC']);
      assert.deepEqual(R.CAMPAIGN_STATUSES, ['ongoing', 'not_started', 'pending', 'on_hold', 'complete', 'rejected', 'cancelled']);   // CR-17 v1.2: + Pending approval · Rejected in the order of the tabs
      const p = R.portfolio(s, '2026-07-08', TD, TD), pAll = R.portfolio(s, '2026-07-08', TD, TD, true);
      assert.equal(p.rows.some(r => r.campaign.campaign_id === 'AC'), false);
      assert.equal(pAll.total.committed - p.total.committed, 7800, 'Include cancelled adds Acne back');
    });
  });
});
