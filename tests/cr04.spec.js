/* cr04.spec.js — CR-04 test cases (deal tier, Group by, users / roles, field locks, defaults), run by tests/test.html.
   "today" is always 05/10/2026. Money: Committed counts from Confirm QT on and Shortlist is apart (CR-03, James 05/10/2026),
   so the CR's tier money (= the old Committed) is Committed + Shortlist here. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const TODAY = '2026-10-05';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const ALL = { campaignId: null, phaseIds: null };

  describe('CR-04 R2 · deal tier, Tier filter, Group by', () => {
    test('§5.0 anchors: deal tier of every deal · tier money · CH', () => {
      const s = fresh(), ctx = R.dealContext(s), tierOf = d => ctx.tiers.get(d.deal_id).tier;
      assert.deepEqual(countBy(s.deals, tierOf), { Mega: 10, Macro: 85, 'Mid-tier': 36, Micro: 125, Nano: 47, Unknown: 2 });
      assert.deepEqual(countBy(s.deals.filter(d => d.campaign_id === 'CH'), tierOf), { Mega: 4, Macro: 19, 'Mid-tier': 11, Micro: 38, Nano: 27, Unknown: 2 });
      const money = {};
      R.groupDeals(s, s.deals, 'tier', ctx, TODAY).forEach(g => { const x = R.groupStats(s, g.rows, TODAY, ctx); money[g.key] = [x.committed, x.shortlist]; });
      assert.deepEqual(money, { Mega: [169500, 0], Macro: [968679, 38600], 'Mid-tier': [148400, 12300], Micro: [427000, 39200], Nano: [70000, 7900], Unknown: [0, 0] });
      const sum = Object.values(money).reduce((a, [c, l]) => a + c + l, 0);
      assert.equal(sum, 1881579, 'Committed + Shortlist by tier = the CR-03 total');
    });
    test('dealTier: the biggest account used in the posts · no posts → the KOL · no followers → Unknown', () => {
      const rules = SEED.lookups.tier_rules, accs = [{ account_id: 'A1', handle: 'small', followers: 12000 }, { account_id: 'A2', handle: 'big', followers: 150000 }];
      assert.equal(R.dealTier({}, accs, [{ account_id: 'A1' }], rules).tier, 'Micro', 'the account hired, not the biggest one');
      assert.equal(R.dealTier({}, accs, [{ account_id: 'A1' }, { account_id: 'A2' }], rules).account.handle, 'big');
      assert.deepEqual(R.dealTier({}, accs, [], rules).followers, 150000);
      assert.equal(R.dealTier({}, accs, [], rules).tier, 'Macro');
      assert.deepEqual(R.dealTier({}, [{ account_id: 'A3', followers: null }], [], rules), { tier: 'Unknown', account: null, followers: null });
      assert.equal(R.dealTier({}, [{ account_id: 'A1', followers: 0 }, { account_id: 'A2', followers: 2000000 }], [{ account_id: 'A1' }], rules).tier, 'Unknown', 'the used account has no followers');
      assert.deepEqual(R.tierOrder(rules), ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano', 'Unknown']);
      assert.deepEqual(R.tierRange(rules, 'Macro'), { min: 100000, max: 1000000 });
      assert.deepEqual(R.tierRange(rules, 'Mega'), { min: 1000000, max: null });
      assert.equal(R.tierRange(rules, 'Unknown'), null);
    });
    test('TC-06: All campaigns · All phases · Tier = Macro → 85 deals · Committed ฿968,679 + Shortlist ฿38,600 (= ฿1,007,279)', () => {
      const s = fresh(), ctx = R.dealContext(s), rows = R.filterDeals(s, { tiers: ['Macro'] }, TODAY, ctx);
      assert.equal(rows.length, 85);
      const x = R.dealTiles(s, rows, ALL, TODAY, ctx.phaseIdx);
      assert.equal(x.committed, 968679); assert.equal(x.shortlist, 38600);
      assert.equal(x.committed + x.shortlist, 1007279);
      assert.equal(R.filterDeals(s, { tiers: ['Mega', 'Unknown'] }, TODAY, ctx).length, 12);
      assert.equal(R.filterDeals(s, { tiers: [] }, TODAY, ctx).length, 305, 'an empty choice = no filter');
    });
    test('TC-07 / TC-08: Group by KOL Tier and Stage (no empty groups)', () => {
      const s = fresh(), ctx = R.dealContext(s);
      assert.deepEqual(R.groupDeals(s, s.deals, 'tier', ctx, TODAY).map(g => [g.key, g.rows.length]), [['Mega', 10], ['Macro', 85], ['Mid-tier', 36], ['Micro', 125], ['Nano', 47], ['Unknown', 2]]);
      assert.deepEqual(R.groupDeals(s, s.deals, 'stage', ctx, TODAY).map(g => [g.key, g.rows.length]), [['Contacted', 37], ['Brief', 26], ['Approve Draft 1', 6], ['Approve Draft 2', 1], ['Post', 230], ['Cancelled', 5]]);   // CR-09 §4.9: the journey step names
      assert.deepEqual(R.stageOrder(s.lookups).map(x => x.key), ['Shortlist', 'Contacted', 'Confirm QT', 'Brief', 'Approve Script', 'Approve Draft 1', 'Approve Draft 2', 'Approve Draft 3', 'Post', 'Cancelled']);
      assert.deepEqual(R.groupDeals(s, s.deals, 'none', ctx, TODAY).map(g => g.rows.length), [305]);
      const ph = R.groupDeals(s, s.deals, 'phase', ctx, TODAY);
      assert.equal(ph.reduce((a, g) => a + g.rows.length, 0), 305);
      assert.equal(ph.find(g => g.key === 'CH-P1').rows.filter(d => d.status !== 'Cancel').length, 61);
      const brief = R.groupStats(s, R.groupDeals(s, s.deals, 'stage', ctx, TODAY).find(g => g.key === 'Brief').rows, TODAY, ctx);
      assert.ok(brief.overdue > 0 && brief.shortlist === 0);
    });
    test('stageKey = the journey step name (CR-09 §4.9 replaces Script · Draft n · Posted) · Cancelled', () => {
      const L = SEED.lookups;
      assert.equal(R.stageKey(L, { status: 'Inprocess', sub_status: 'Approve Script' }), 'Approve Script');
      assert.equal(R.stageKey(L, { status: 'Inprocess', sub_status: 'Approve Draft 3' }), 'Approve Draft 3');
      assert.equal(R.stageKey(L, { status: 'Complete', sub_status: 'Post' }), 'Post');
      assert.equal(R.stageKey(L, { status: 'Cancel', sub_status: 'Cancel' }), 'Cancelled');
      assert.equal(R.stageKey(L, { status: 'List', sub_status: 'Confirm QT' }), 'Confirm QT');
    });
    test('TC-10: genygee28 is Micro, based on @genygee28 · 33,700 followers', () => {
      const s = fresh(), ctx = R.dealContext(s), k = s.kol_master.find(x => x.display_name === 'genygee28');
      const ds = s.deals.filter(d => d.kol_id === k.kol_id);
      assert.ok(ds.length > 0);
      ds.forEach(d => { const x = ctx.tiers.get(d.deal_id); assert.equal(x.tier, 'Micro'); assert.equal(x.account.handle, 'genygee28'); assert.equal(x.followers, 33700); });
    });
    test('TC-11 / TC-12: Deals CSV has kol_tier + tier_followers · the Template export keeps its columns · the Pipeline follows the Tier filter', () => {
      const s = fresh(), ctx = R.dealContext(s);
      assert.ok(R.DEALS_COLS.includes('kol_tier') && R.DEALS_COLS.includes('tier_followers'));
      const row = R.dealsRows(s, [deal(s, 'D000044')], TODAY, ctx)[0];
      assert.equal(row.kol_tier, ctx.tiers.get('D000044').tier);
      const t = R.templateExport(s, s.deals.slice(0, 3), ctx);
      assert.equal(t.header.length, R.TEMPLATE_HEADERS.length + 2, 'Template headers + deal_id + Phase');
      assert.ok(!t.header.includes('Tier'));
      const mega = R.filterDeals(s, { campaign: 'CH', tiers: ['Mega'] }, TODAY, ctx);
      assert.equal(mega.length, 4);
      assert.ok(R.pipeline(s, mega).every(c => c.deals.every(d => ctx.tiers.get(d.deal_id).tier === 'Mega')));
    });
  });

  describe('CR-04 R3 · users, roles, PIC list, changed_by', () => {
    const user = (s, name) => s.users.find(u => u.display_name === name);
    const as = (s, name) => Object.assign(s, { meta: Object.assign({}, s.meta, { current_user_id: user(s, name).user_id }) });
    function fakeStorage() { const m = new Map(); return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
    test('TC-13: migration v4 — Admin + 7 PIC users · current user = Admin · the PIC dropdown shows the 7 names · CTA list seeded', () => {
      const s = fresh();
      assert.equal(s.schema_version, S.SCHEMA_VERSION);
      assert.deepEqual(s.users.map(u => [u.user_id, u.display_name, u.role, u.is_pic, u.pic_name, u.email, u.active]), [
        ['U000', 'Admin', 'admin', false, null, null, true], ['U001', 'Amp', 'staff', true, 'Amp', null, true], ['U002', 'Babe', 'staff', true, 'Babe', null, true],
        ['U003', 'Dream', 'staff', true, 'Dream', null, true], ['U004', 'Ja', 'staff', true, 'Ja', null, true], ['U005', 'Lucky', 'staff', true, 'Lucky', null, true],
        ['U006', 'Pang', 'staff', true, 'Pang', null, true], ['U007', 'Pizza', 'staff', true, 'Pizza', null, true],
        ['U008', 'Earn', 'accounting', false, null, null, true]]);   // CR-09 §3: migration v9 adds Earn (Accounting)
      assert.equal(s.meta.current_user_id, 'U000');
      assert.equal(R.currentUser(s).display_name, 'Admin');
      assert.deepEqual(R.picNames(s), ['Amp', 'Babe', 'Dream', 'Ja', 'Lucky', 'Pang', 'Pizza']);
      assert.equal(s.lookups.pic_list, undefined, 'the PIC list comes from users');
      assert.deepEqual(s.lookups.cta_list, ['TikTok', 'All Channel', 'Eveandboy', '7-11']);
      assert.ok(s.campaigns.every(c => c.cta === null));
      assert.equal(s.deals.filter(d => d.pic === 'Ja').length, 74, 'deal PICs are not touched');
    });
    test('permission matrix (§4.4, rows of CR-05 §4.1): admin · staff · viewer', () => {
      const s = fresh(), A = user(s, 'Admin'), P = user(s, 'Pang'), V = { user_id: 'U099', role: 'viewer', active: true };
      const ACT = ['view', 'export', 'backup', 'deal.edit', 'kol.edit', 'cost.override', 'deal.campaign', 'kol.merge', 'campaign.edit', 'settings.lists', 'settings.tiers', 'data.restore', 'roles'];
      const row = u => ACT.filter(a => R.can(u, a));
      assert.deepEqual(row(A), ACT);
      assert.deepEqual(row(P), ['view', 'export', 'backup', 'deal.edit', 'kol.edit']);
      assert.deepEqual(row(V), ['view', 'export', 'backup']);
      assert.equal(R.can(Object.assign({}, A, { active: false }), 'view'), false, 'an inactive user can do nothing');
      assert.equal(R.can(null, 'view'), false);
      assert.equal(R.can(A, 'no.such.action'), false);
    });
    test('TC-14 / TC-15 basis: the current user follows meta · an unknown or inactive user falls back to the first active admin', () => {
      const s = as(fresh(), 'Pang');
      assert.equal(R.currentUser(s).display_name, 'Pang');
      assert.equal(R.can(R.currentUser(s), 'roles'), false);
      user(s, 'Pang').active = false;
      assert.equal(R.currentUser(s).display_name, 'Admin');
      s.meta.current_user_id = 'U999';
      assert.equal(R.currentUser(s).display_name, 'Admin');
    });
    test('TC-16: a status change made as Pang carries changed_by = Pang · History names · imported rows read "System import"', () => {
      const s = as(fresh(), 'Pang'), d = deal(s, 'D000044'), me = R.currentUser(s);
      const r = R.applyMove(s, d, 'Approve Draft 1', { date: TODAY, note: '', pillar: 'Awareness' }, { logId: 9999, quoteId: 'Q99999', eventId: 1, now: new Date('2026-10-05T03:00:00Z'), user: me.user_id });
      assert.equal(r.log.changed_by, 'U006');
      assert.ok(r.events.every(e => e.changed_by === 'U006'));
      assert.equal(R.changedByName(s, r.log.changed_by), 'Pang');
      assert.equal(R.changedByName(s, s.deal_status_log[0].changed_by), C.roles.systemImport);
      const pic = R.fieldChanges([d], 'pic', 'Amp', { eventId: 5, now: new Date(), user: me.user_id });
      assert.equal(pic.events[0].changed_by, 'U006');
      s.deal_status_log.push(r.log);
      assert.equal(R.lastActive(s, 'U006'), '2026-10-05T03:00:00.000Z');
      assert.equal(R.lastActive(s, 'U001'), null);
    });
    test('TC-17: My deals as Pang = deals with PIC Pang', () => {
      const s = as(fresh(), 'Pang'), ctx = R.dealContext(s), mine = R.filterDeals(s, { pic: R.picName(R.currentUser(s)) }, TODAY, ctx);
      assert.equal(mine.length, 39);
      assert.ok(mine.every(d => d.pic === 'Pang'));
      assert.equal(R.picName(user(s, 'Admin')), null, 'Admin is not a PIC: no My deals');
    });
    test('TC-18 / TC-19: the last admin keeps the role and stays active · e-mail must end with @lomr.co.th', () => {
      const s = fresh(), A = user(s, 'Admin');
      const v = d => R.validateUser(s, Object.assign({}, A, d)).errs.map(e => e.msg);
      assert.deepEqual(v({ role: 'staff' }), [C.msg.userLastAdmin]);
      assert.deepEqual(v({ active: false }), [C.msg.userLastAdmin]);
      assert.deepEqual(v({ email: 'a@gmail.com' }), [C.msg.userEmailDomain('@lomr.co.th')]);
      assert.deepEqual(v({ email: 'james@LOMR.co.th' }), []);
      assert.deepEqual(v({ display_name: ' ' }), [C.msg.userNameRequired]);
      s.users.push({ user_id: 'U008', display_name: 'Boss', email: null, role: 'admin', is_pic: false, pic_name: null, active: true });
      assert.deepEqual(v({ role: 'staff' }), [], 'another admin exists');
    });
    test('TC-20: switching off Dream (PIC of open deals) warns with the count · Dream leaves the dropdown, deals keep the name', () => {
      const s = fresh(), D = user(s, 'Dream'), open = s.deals.filter(d => d.pic === 'Dream' && (d.status === 'List' || d.status === 'Inprocess')).length;
      assert.ok(open > 0);
      const w = R.validateUser(s, Object.assign({}, D, { active: false })).warns;
      assert.equal(w.length, 1); assert.equal(w[0].kind, 'reassign'); assert.equal(w[0].count, open);
      assert.equal(w[0].msg, C.msg.userOpenDeals('Dream', open));
      D.active = false;
      assert.equal(R.picNames(s).includes('Dream'), false);
      assert.equal(R.picNames(s, true).includes('Dream'), true, 'filters still offer it');
      assert.equal(s.deals.filter(d => d.pic === 'Dream').length, 30);
      assert.deepEqual(R.validateUser(s, Object.assign({}, user(s, 'Lucky'), { active: false })).warns, [], 'Lucky has no open deals');
    });
    test('TC-21 basis: a PIC name already taken is an error · renaming Ja counts the deals and KOLs', () => {
      const s = fresh(), J = user(s, 'Ja');
      assert.deepEqual(R.validateUser(s, Object.assign({}, J, { pic_name: 'pang' })).errs.map(e => e.msg), [C.msg.userPicTaken('pang')]);
      assert.deepEqual(R.picRenameCount(s, 'Ja'), { deals: 74, kols: 146 });
      assert.deepEqual(R.validateUser(s, Object.assign({}, J, { pic_name: 'Jaja' })).infos.map(i => i.msg), [C.msg.userPicRename('Ja', 'Jaja', 74, 146)]);
      const x = R.dealTiles(s, s.deals, ALL, TODAY);
      const r = R.fieldChanges(s.deals.filter(d => d.pic === 'Ja'), 'pic', 'Jaja', { eventId: 1, now: new Date(), note: 'rename' });
      assert.equal(r.deals.length, 74);
      const at = new Map(s.deals.map((d, i) => [d.deal_id, i])); r.deals.forEach(d => { s.deals[at.get(d.deal_id)] = d; });
      const y = R.dealTiles(s, s.deals, ALL, TODAY);
      assert.deepEqual([y.committed, y.shortlist, y.paid], [x.committed, x.shortlist, x.paid], 'money does not move');
    });
    test('TC-22: restoring a v3 backup migrates it to v4 with the users of §3.2 · the current user in this browser stays', () => {
      const v3 = JSON.parse(JSON.stringify(fresh()));
      v3.schema_version = 3; delete v3.users; delete v3.meta; v3.lookups.pic_list = SEED.lookups.pic_list.slice(); v3.lookups.cta_list = []; v3.campaigns.forEach(c => { delete c.cta; });
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      st.state.meta.current_user_id = 'U006';
      const r = st.restore(JSON.stringify(v3), 'old_v3.json');
      assert.equal(r.ok, true); assert.equal(r.migratedFrom, 3);
      assert.equal(st.state.schema_version, S.SCHEMA_VERSION);
      assert.equal(st.state.users.length, 9, '+ Earn from migration v9 (CR-09)');
      assert.equal(st.state.meta.current_user_id, 'U006', 'Pang exists in the backup');
      const w = S.createStore({ seed: SEED, storage: fakeStorage() }); w.state.meta.current_user_id = 'U042';
      w.restore(JSON.stringify(v3), 'x.json');
      assert.equal(w.state.meta.current_user_id, 'U000');
      assert.deepEqual(S.shapeErrors(Object.assign({}, fresh(), { users: undefined })), ['missing:users'], 'a v4 file must have users');
    });
    test('§4.6 defaultPic: you (an active PIC) · else the KOL\'s PIC · else none', () => {
      const s = fresh(), k = s.kol_master.find(x => x.display_name === 'genygee28');
      assert.deepEqual(R.defaultPic(user(s, 'Pang'), k), { pic: 'Pang', source: 'user' });
      assert.deepEqual(R.defaultPic(user(s, 'Admin'), k), { pic: 'Ja', source: 'kol' });
      assert.deepEqual(R.defaultPic(user(s, 'Admin'), Object.assign({}, k, { pic: null })), { pic: null, source: null });
      assert.deepEqual(R.defaultPic(Object.assign({}, user(s, 'Pang'), { active: false }), k), { pic: 'Ja', source: 'kol' });
    });
  });

  describe('CR-04 R4 · field locks, section edits, CTA, payment term', () => {
    const user = (s, name) => s.users.find(u => u.display_name === name);
    const viewer = { user_id: 'U099', display_name: 'Vee', role: 'viewer', active: true };
    const fe = (s, id, f, who, post) => R.fieldEditable(s, deal(s, id), f, who, post);
    test('TC-23: D000044 (not paid) — KOL / deal ID locked · Total, Gencode end, Tier = Auto · every section but Payment-locked fields is open', () => {
      const s = fresh(), A = user(s, 'Admin');
      assert.deepEqual(fe(s, 'D000044', 'kol_id', A), { editable: false, reason: C.lock.kol });
      assert.equal(fe(s, 'D000044', 'deal_id', A).reason, C.lock.systemId);
      ['total_cost', 'gencode_end_date', 'tier'].forEach(f => assert.deepEqual(fe(s, 'D000044', f, A), { editable: false, auto: true, reason: C.lock.auto }, f));
      assert.equal(fe(s, 'D000044', 'sub_status', A).reason, C.lock.moveStage);
      ['info', 'payment', 'costs', 'timeline', 'posts'].forEach(k => assert.equal(R.sectionEditable(s, deal(s, 'D000044'), k, A), true, k));
      assert.equal(fe(s, 'D000044', 'rate_card', A).editable, true);
      assert.equal(fe(s, 'D000044', 'rate_card', A).needsReason, undefined);
      assert.equal(fe(s, 'D000044', 'campaign_id', A).reason, C.lock.campaignFixed, 'it has a dated post');
      assert.equal(fe(s, 'D000044', 'campaign_id', user(s, 'Pang')).reason, C.lock.campaignAdmin);
    });
    test('TC-24 basis: one Save → one edit event with from / to of the changed fields only', () => {
      const s = fresh(), d = deal(s, 'D000044'), after = Object.assign({}, d, { rate_card: 6000, basket_fee: 500 });
      const ch = R.diffFields(d, after, R.DEAL_SECTIONS.costs);
      assert.deepEqual(ch, [{ field: 'rate_card', from: 5000, to: 6000 }, { field: 'basket_fee', from: null, to: 500 }]);
      const e = R.editEvent(d, ch, { eventId: 7, now: new Date('2026-10-05T03:00:00Z'), user: 'U006' });
      assert.deepEqual(e, { event_id: 7, deal_id: 'D000044', type: 'edit', from: { rate_card: 5000, basket_fee: null }, to: { rate_card: 6000, basket_fee: 500 },
        changed_at: '2026-10-05T03:00:00.000Z', changed_by: 'U006', note: null });
      assert.deepEqual(R.diffFields({ tr_codes: ['A'], remark: null }, { tr_codes: ['A'], remark: '' }, ['tr_codes', 'remark']), [], "'' and null are the same · arrays by value");
      const posts = R.postsOf(s, 'D000044'), edited = posts.map(p => Object.assign({}, p, { views: 1200 })).concat([{ post_id: 'P999999', deal_id: 'D000044' }]);
      assert.deepEqual(R.diffPosts(posts, edited), [{ field: 'P000046.views', from: null, to: 1200 }, { field: 'P999999', from: null, to: 'added' }]);
      assert.deepEqual(R.diffPosts(posts, []), [{ field: 'P000046', from: 'removed', to: null }]);
    });
    test('TC-25 / TC-26: D000296 (paid) — staff: costs locked "Payment recorded" · term locked "Fully paid" · admin: costs open with a reason', () => {
      const s = fresh(), P = user(s, 'Pang'), A = user(s, 'Admin');
      R.DEAL_SECTIONS.costs.forEach(f => assert.deepEqual(fe(s, 'D000296', f, P), { editable: false, reason: C.lock.paymentRecorded }, f));
      assert.deepEqual(fe(s, 'D000296', 'payment_term', P), { editable: false, reason: C.lock.fullyPaid });
      assert.deepEqual(fe(s, 'D000296', 'payment_term', A), { editable: false, reason: C.lock.fullyPaid });
      assert.equal(R.sectionEditable(s, deal(s, 'D000296'), 'costs', P), false, 'no ✎ on Costs for staff');
      assert.deepEqual(fe(s, 'D000296', 'rate_card', A), { editable: true, needsReason: true, reason: C.lock.paymentRecordedAdmin });
      const e = R.editEvent(deal(s, 'D000296'), [{ field: 'rate_card', from: 5000, to: 5500 }], { eventId: 1, now: new Date(), user: 'U000', note: 'ตกลงราคาใหม่' }, 'cost');
      assert.equal(e.type, 'cost'); assert.equal(e.note, 'ตกลงราคาใหม่');
      assert.equal(R.paymentRecorded(deal(s, 'D000044')), false);
    });
    test('TC-28: Approved draft dates follow Move stage · TC-29: a post with a link keeps its account · Phase from the date is Auto', () => {
      const s = fresh(), A = user(s, 'Admin');
      assert.equal(deal(s, 'D000098').sub_status, 'Brief');
      ['approved_draft1_date', 'approved_draft2_date'].forEach(f => assert.deepEqual(fe(s, 'D000098', f, A), { editable: false, reason: C.lock.setByMove }, f));
      assert.equal(fe(s, 'D000098', 'expected_draft2_date', A).editable, true);
      const d296 = deal(s, 'D000296');
      assert.equal(R.fieldEditable(s, d296, 'approved_draft1_date', A).editable, true, 'Draft 1 is passed (back-dating)');
      const p = s.deal_posts.find(x => x.deal_id === 'D000001' && x.post_link);
      assert.deepEqual(fe(s, 'D000001', 'account_id', A, p), { editable: false, reason: C.lock.postHasLink });
      ['post_date', 'post_link', 'views'].forEach(f => assert.equal(fe(s, 'D000001', f, A, p).editable, true, f));
      assert.deepEqual(fe(s, 'D000044', 'phase_override', A, R.postsOf(s, 'D000044')[0]), { editable: false, reason: C.lock.autoPhase });
      assert.equal(fe(s, 'D000001', 'legacy_job_ids', A).reason, C.lock.imported);
    });
    test('TC-30: a viewer has no ✎ · a cancelled deal: only Remark and Cancel reason', () => {
      const s = fresh(), A = user(s, 'Admin');
      ['info', 'payment', 'costs', 'timeline', 'posts', 'header'].forEach(k => assert.equal(R.sectionEditable(s, deal(s, 'D000044'), k, viewer), false, k));
      assert.equal(fe(s, 'D000044', 'remark', viewer).reason, C.lock.viewOnly);
      const c = s.deals.find(d => d.status === 'Cancel');
      assert.equal(R.fieldEditable(s, c, 'remark', A).editable, true);
      assert.equal(R.fieldEditable(s, c, 'cancel_reason', A).editable, true);
      assert.equal(R.fieldEditable(s, c, 'pic', A).reason, C.lock.cancelled);
      assert.equal(R.sectionEditable(s, c, 'info', A), true);
      assert.equal(R.sectionEditable(s, c, 'costs', A), false);
      assert.equal(R.fieldEditable(s, deal(s, 'D000044'), 'cancel_reason', A).editable, false);
    });
    test('the Campaign can change only for an admin, before Confirm QT and before any dated post', () => {
      const s = fresh(), A = user(s, 'Admin');
      const d = s.deals.find(x => x.sub_status === 'Contacted' && !R.postsOf(s, x.deal_id).some(p => p.post_date || p.expected_post_date));
      assert.ok(d, 'a Contacted deal without dated posts');
      assert.equal(R.fieldEditable(s, d, 'campaign_id', A).editable, true);
      assert.equal(R.sectionEditable(s, d, 'header', A), true);
      assert.equal(R.fieldEditable(s, Object.assign({}, d, { sub_status: 'Confirm QT' }), 'campaign_id', A).reason, C.lock.campaignFixed);
    });
    test('pillar cannot be emptied once the deal reached Confirm QT', () => {
      const L = SEED.lookups;
      assert.equal(R.pillarCleared(L, { pillar: 'Awareness', sub_status: 'Brief' }, { pillar: null, sub_status: 'Brief' }), true);
      assert.equal(R.pillarCleared(L, { pillar: 'Awareness', sub_status: 'Contacted' }, { pillar: '', sub_status: 'Contacted' }), false);
      assert.equal(R.pillarCleared(L, { pillar: null, sub_status: 'Brief' }, { pillar: null, sub_status: 'Brief' }), false);
    });
    test('TC-31 / TC-32 basis: bulk shortlist — your PIC for every deal · else the KOL\'s · new deals take the Campaign CTA', () => {
      const s = fresh(), k = s.kol_master.find(x => x.display_name === 'genygee28'), noPic = s.kol_master.find(x => !x.pic);
      assert.equal(R.planShortlist(s, [noPic.kol_id], 'PH', '', 'postpaid').errs.length, 1, 'a KOL without PIC needs the fallback');
      assert.equal(R.planShortlist(s, [noPic.kol_id], 'PH', '', 'postpaid', 'Pang').errs.length, 0, 'your PIC covers it');
      s.campaigns.find(c => c.campaign_id === 'PH').cta = '7-11';
      const r = R.shortlistDeal(s, k.kol_id, { dealId: 'D999990', logId: 1, campaignId: 'PH', pic: 'Pang', paymentTerm: 'postpaid', date: TODAY, now: new Date(), user: 'U006' });
      assert.equal(r.deal.cta, '7-11');
      assert.equal(r.log.changed_by, 'U006');
    });
    test('TC-33 / TC-34: CTA of the Campaign · "Differs from campaign" · open deals that still use the old CTA', () => {
      const s = fresh(), ph = s.campaigns.find(c => c.campaign_id === 'PH');
      assert.equal(R.campaignCta(s, 'PH'), null);
      ph.cta = '7-11';
      const d = Object.assign({}, deal(s, 'D000296'), { cta: '7-11' });
      assert.equal(R.ctaDiffers(s, d), false);
      assert.equal(R.ctaDiffers(s, Object.assign({}, d, { cta: 'TikTok' })), true);
      assert.equal(R.ctaDiffers(s, Object.assign({}, d, { cta: null })), false, 'no CTA on the deal = nothing to compare');
      const open = s.deals.filter(x => x.campaign_id === 'PH' && (x.status === 'List' || x.status === 'Inprocess'));
      assert.equal(R.dealsWithCta(s, 'PH', null).length, open.length, 'every open PH deal has no CTA yet');
      open.slice(0, 5).forEach(x => { x.cta = '7-11'; });
      assert.equal(R.dealsWithCta(s, 'PH', '7-11').length, 5);
      const ctx = R.dealContext(s);
      assert.equal(R.filterDeals(s, { cta: '7-11' }, TODAY, ctx).length, 5);
      assert.equal(R.filterDeals(s, { cta: '__none' }, TODAY, ctx).length, 300);
    });
    test('TC-35 / TC-36 basis: the term of a new deal — from KOL Master · changed for this deal · the KOL has none', () => {
      const s = fresh(), k = s.kol_master.find(x => x.display_name === 'genygee28');
      assert.equal(R.termSource(k, ''), 'none');
      k.default_payment_term = 'split_50';
      assert.equal(R.termSource(k, 'split_50'), 'kol');
      assert.equal(R.termSource(k, 'prepaid'), 'changed');
      assert.equal(R.termDiffers({ payment_term: 'prepaid' }, k), true);
      assert.equal(R.termDiffers({ payment_term: 'split_50' }, k), false);
      assert.equal(R.termDiffers({ payment_term: 'prepaid' }, Object.assign({}, k, { default_payment_term: null })), false);
    });
  });
});
