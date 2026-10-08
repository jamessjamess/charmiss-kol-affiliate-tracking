/* cr11.spec.js — CR-11 test cases (Create modal · Go-live clean-up · Shipments · Fill-once …), run by tests/test.html.
   "today" is 06/10/2026 · the seed · money anchors stay those of CR-05 §5.0 and CR-08. The modal itself (size · dirty check · focus · keys)
   is checked in the browser; these are the rules behind it. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED, X, C } = t;
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-06T03:00:00Z'));
  const kolNamed = (s, name) => s.kol_master.find(k => k.display_name === name);

  describe('CR-11 R1 · New deal modal — the rules behind its panels', () => {
    test('§4.1 Add account (a panel in the modal): the KOL Master account checks — platform · handle · link · followers · not another KOL\'s', () => {
      const s = fresh(), k = kolNamed(s, 'genygee28'), other = s.kol_accounts.find(a => a.kol_id !== k.kol_id && a.platform === 'TikTok');
      const errs = a => R.validateAddAccount(s, k.kol_id, a).errs.map(e => e.field).sort();
      assert.deepEqual(errs({ platform: '', handle: '', followers: '', profile_link: '' }), ['aa_followers', 'aa_handle', 'aa_platform', 'aa_profile_link']);
      assert.deepEqual(errs({ platform: 'Instagram', handle: '@gen y', followers: '-1', profile_link: 'instagram.com/x' }), ['aa_followers', 'aa_handle', 'aa_profile_link']);
      assert.deepEqual(errs({ platform: 'TikTok', handle: other.handle.toUpperCase(), followers: '10', profile_link: 'https://www.tiktok.com/@' + other.handle }), ['aa_handle'], "another KOL's handle");
      assert.deepEqual(errs({ platform: 'Instagram', handle: 'genygee28_ig', followers: '12000', profile_link: 'https://www.instagram.com/genygee28_ig' }), []);
      const rec = R.newAccountRecord(k.kol_id, { platform: 'Instagram', handle: ' genygee28_ig ', followers: '12000', profile_link: 'https://www.instagram.com/genygee28_ig' }, 'A9999');
      assert.deepEqual(rec, { account_id: 'A9999', kol_id: k.kol_id, platform: 'Instagram', handle: 'genygee28_ig', profile_link: 'https://www.instagram.com/genygee28_ig', followers: 12000, is_legacy: false });
    });
    test('TC-04: genygee28 — the KOL card (Tier Micro) and the Price reference (Latest ฿3,000 · Average ฿5,000)', () => {
      const s = fresh(), k = kolNamed(s, 'genygee28'), accs = R.accountsOfKol(s, k.kol_id);
      assert.equal(R.tierOf(R.maxFollowers(accs), s.lookups.tier_rules), 'Micro');
      const ref = R.costReference(s, k.kol_id);
      assert.deepEqual([ref.latest.total, ref.average.total], [3000, 5000]);
    });
  });
  describe('CR-11 R3 · go-live · Imported · Data health · clean-up · Hold', () => {
    const TD = '2026-10-06', camp2 = (st, id) => st.campaigns.find(c => c.campaign_id === id).campaign_name.slice(0, 2);
    const ctxP = st => { let e = 0; return { lineId: () => S.createStore ? 'PL-9' + String(++e).padStart(5, '0') : 'x', eventId: () => 90000 + (++e), now: '2026-10-06T03:00:00Z', user: 'U000' }; };
    test('TC-21: schema 12 — go_live = the day it ran · KS Phase 1 Awareness · KS Phase 2 Conversion · shipments purpose review + their Campaign · deals untouched · runs once', () => {
      const st = fresh();
      assert.equal(st.schema_version, S.SCHEMA_VERSION); assert.ok(S.SCHEMA_VERSION >= 12);
      assert.deepEqual(st.lookups.go_live, { date: TD, completed_at: null, completed_by: null });
      const pill = st.phases.map(p => `${camp2(st, p.campaign_id)}:${p.label || ''}=${p.default_pillar}`);
      assert.deepEqual(pill.filter(x => !x.endsWith('=null')), ['Ki:Launch & Awareness=Awareness', 'Ki:Conversion=Conversion', 'Pe:Awareness & Consideration=Awareness & Consideration']);   // + CR-19 §4.6 (v18)
      assert.ok(st.sample_shipments.every(sh => sh.purpose === 'review' && sh.campaign_id === st.deals.find(d => d.deal_id === sh.deal_id).campaign_id && sh.pick_list_id === null));
      assert.ok(st.campaigns.every(c => c.default_payment_term === null));
      assert.deepEqual([st.lookups.metrics_checkpoints, st.pick_lists], [[7], []]);
      const v11 = JSON.parse(JSON.stringify(st)); v11.schema_version = 11; delete v11.lookups.go_live; delete v11.pick_lists; v11.phases.forEach(p => { delete p.default_pillar; });
      const m = S.migrate(JSON.parse(JSON.stringify(v11)), new Date('2026-11-02T03:00:00Z'));
      assert.deepEqual([m.schema_version, m.lookups.go_live.date], [S.SCHEMA_VERSION, '2026-11-02']);
      assert.deepEqual(m.deals, v11.deals, 'the deals keep every value');
      assert.equal(S.migrate(JSON.parse(JSON.stringify(m)), new Date('2027-01-01T03:00:00Z')).lookups.go_live.date, '2026-11-02', 'runs once');
    });
    test('§5.0 anchors — Imported 305 · open 70 (CH 14 · KS 10 · AC 29 · PH 17) · To pay Missing docs 125 lines ฿826,950.00 (unchanged)', () => {
      const st = fresh();
      assert.equal(st.deals.filter(R.isImported).length, 305);
      const open = st.deals.filter(d => !R.isImportedClosed(d)), by = {};
      open.forEach(d => { by[camp2(st, d.campaign_id)] = (by[camp2(st, d.campaign_id)] || 0) + 1; });
      assert.deepEqual([open.length, by], [70, { Ch: 14, Ki: 10, Ac: 29, Pe: 17 }]);
      const q = R.payQueue(st, TD), c = R.payCards(q.items, q.checks, TD);
      assert.deepEqual([c.missing.n, c.missing.gross, c.ready.gross, c.hold.gross], [125, 826950, 0, 0]);
    });
    test('TC-24 / TC-25: Data health (All PICs) — Payment term not set 70 · Pillar not set 67 · Campaigns without products 4 · Phases without budget 1 (PH Phase 3) · Posted without date 0 · 4 items', () => {
      const st = fresh(), h = R.dataHealth(st, {}, TD), n = Object.fromEntries(h.items.map(x => [x.key, x.n]));
      assert.deepEqual(n, { termNotSet: 70, pillarNotSet: 67, noProducts: 4, noBudget: 1 });
      assert.equal(h.total, 4);
      assert.equal(R.phaseName(st, h.items.find(x => x.key === 'noBudget').phases[0].phase_id), 'Phase 3');
      assert.ok(h.items.find(x => x.key === 'termNotSet').deals.every(d => !R.isImportedClosed(d)));
      const pz = R.dataHealth(st, { pic: 'Pizza' }, TD).items.find(x => x.key === 'termNotSet');
      assert.ok(pz.n > 0 && pz.deals.every(d => d.pic === 'Pizza'));
      /* the 25 posts with a link and no date all belong to closed imported deals */
      assert.equal(st.deal_posts.filter(p => p.post_link && !p.post_date).length, 25);
    });
    test('§4.6 Imported & closed · Not tracked (a post before go-live − 30 days with no numbers) · Docs to collect counts KOLs once', () => {
      const st = fresh(), done = st.deals.find(d => d.status === 'Complete'), open = st.deals.find(d => d.status === 'Inprocess');
      assert.deepEqual([R.isImportedClosed(done), R.isImportedClosed(open), R.isImported({ legacy_job_ids: [] })], [true, false, false]);
      assert.equal(R.notTracked({ post_date: '2026-08-01', views: null }, st.lookups), true);
      assert.equal(R.notTracked({ post_date: '2026-08-01', views: 10 }, st.lookups), false);
      assert.equal(R.notTracked({ post_date: '2026-09-20', views: null }, st.lookups), false);
      const docs = R.docsToCollect(st, {}, TD), lines = R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs');
      assert.equal(docs.reduce((a, x) => a + x.items.length, 0), lines.length);
      assert.equal(docs.length, new Set(lines.map(x => x.kol_id)).size);
    });
    test('TC-30: Match with PR file — name (case · @ · spaces) and amount within ฿1 of net or gross → Matched · the name only → Check amount · Not found', () => {
      const st = fresh(), lines = R.cleanupLines(st, TD), pick = lines.slice(0, 4), handle = x => x.account_handle;
      const rows = [
        { sheet: 'S1', row: 3, name: '@' + handle(pick[0]).toUpperCase(), amount: pick[0].tax.net.toLocaleString('en-US') },
        { sheet: 'S1', row: 4, name: ' ' + handle(pick[1]) + ' ', amount: pick[1].tax.gross + 0.6 },
        { sheet: 'S1', row: 5, name: handle(pick[2]), amount: String(pick[2].tax.net - 0.4) },
        { sheet: 'S1', row: 6, name: handle(pick[3]), amount: pick[3].tax.gross + 500 },
        { sheet: 'S1', row: 7, name: 'nobody_r3_test', amount: 1000 }];
      const m = R.matchPrRows(lines, rows);
      assert.deepEqual(m.map(x => x.status), ['matched', 'matched', 'matched', 'amount', 'notfound']);
      assert.deepEqual(m.slice(0, 3).map(x => x.item.key), pick.slice(0, 3).map(x => x.key));
      assert.equal(R.prNote('PR_test.xlsx', 'S1', 3), 'Matched with PR_test.xlsx · sheet S1 row 3');
      assert.deepEqual([R.prAmount('฿1,234.50'), R.prAmount('x'), R.normPrName(' @Ab C ')], [1234.5, null, 'abc']);
    });
    test('TC-31 / TC-32: clean-up — shipments of imported deals To ship (a Complete deal ticked, an open one not) · Apply → Paid outside app + Delivered (imported) + go_live done', () => {
      const st = fresh(), ships = R.cleanupShipments(st);
      assert.equal(ships.length, 8);
      assert.ok(ships.every(x => x.pick === (x.deal.status === 'Complete')));
      const lines = R.cleanupLines(st, TD).slice(0, 2), before = R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs').length;
      assert.deepEqual(R.validateCleanupLine({ date: '', note: ' ' }).errs.map(e => e.field), ['date', 'note']);
      const evs = R.applyCleanup(st, { lines: lines.map(x => ({ item: x, date: '2026-10-01', note: 'Paid in PR 01/10' })), shipments: [ships[0].sh.shipment_id] }, ctxP(st));
      assert.equal(R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs').length, before - 2);
      assert.ok(lines.every(x => st.payment_lines.some(l => l.deal_id === x.deal_id && l.milestone === x.milestone && l.status === 'paid' && l.paid_date === '2026-10-01' && l.source === 'legacy')));
      const sh = st.sample_shipments.find(x => x.shipment_id === ships[0].sh.shipment_id);
      assert.deepEqual([sh.status, sh.delivered_date, sh.source], ['delivered', null, 'legacy']);
      assert.ok(st.lookups.go_live.completed_at && st.lookups.go_live.completed_by === 'U000');
      assert.ok(evs.some(e => e.type === 'shipment') && evs.filter(e => e.type === 'payment').length === 2);
    });
    test('TC-28: Hold needs a reason · On hold (not into a run · counted On hold) · Release → back to what it works out to · 2 payment_hold events', () => {
      const st = fresh(), x = R.payQueue(st, TD).items.find(i => i.status === 'missing_docs');
      assert.deepEqual(R.validateHold(' ').errs.map(e => e.field), ['reason']);
      const ctx = ctxP(st), h = R.holdItem(st, x, 'waiting for a fix', ctx);
      assert.deepEqual([h.line.status, h.line.hold_reason, h.event.type, h.event.from, h.event.to], ['on_hold', 'waiting for a fix', 'payment_hold', 'missing_docs', 'on_hold']);
      const q = R.payQueue(st, TD), held = q.items.find(i => i.deal_id === x.deal_id && i.milestone === x.milestone);
      assert.equal(held.status, 'on_hold');
      assert.equal(R.payCards(q.items, q.checks, TD).hold.n, 1);
      const run = R.newRun(st, { pay_date: '2026-10-09', user: 'U000', now: 'x' }); st.payment_runs.push(run);
      assert.equal(R.addToRun(st, run, [held], ctx).length, 0, 'not into a run');
      const ev = R.releaseLine(st, h.line, TD, ctx);
      assert.deepEqual([ev.type, ev.from], ['payment_hold', 'on_hold']);
      assert.equal(R.payQueue(st, TD).items.find(i => i.deal_id === x.deal_id && i.milestone === x.milestone).status, 'missing_docs');
      assert.ok(!st.payment_lines.includes(h.line), 'the line Hold made goes');
    });
  });
  describe('CR-11 R3 · Imported "—" · Match with PR file (in memory) · clean-up Undo · Go-live permissions', () => {
    const TD = '2026-10-06';
    const ctxP = () => { let e = 0; return { lineId: () => 'PL-9' + String(++e).padStart(5, '0'), eventId: () => 90000 + (++e), now: '2026-10-06T03:00:00Z', user: 'U000' }; };
    test('TC-22: a Complete deal from the old files without a pillar — no "Pillar not set" reminder · a deal still open keeps it', () => {
      const s = fresh(), ctx = R.dealContext(s), info = d => R.validateDeal(s, d, R.postsOfCtx(ctx, d.deal_id), TD, ctx).infos.some(i => i.field === 'pillar');
      const done = s.deals.find(d => d.status === 'Complete' && !d.pillar), open = s.deals.find(d => d.status === 'Inprocess' && !d.pillar && R.pillarStepReached(s.lookups, d.sub_status));
      assert.deepEqual([info(done), info(open)], [false, true]);
    });
    test('TC-23: a Delivered shipment from the old files is read only (legacy) · Include imported off hides the imported deals', () => {
      const s = fresh(), old = s.sample_shipments.find(sh => sh.status === 'delivered');
      assert.deepEqual([R.isLegacyDelivered(old), R.isLegacyDelivered(s.sample_shipments.find(sh => sh.status === 'to_ship'))], [true, false]);
      assert.equal(s.sample_shipments.filter(R.isLegacyDelivered).length, 206);
      const ctx = R.dealContext(s), camp = s.deals[0].campaign_id;
      assert.equal(R.filterDeals(s, { campaign: camp, noImported: '1' }, TD, ctx).length, 0, 'every seed deal is imported');
      assert.ok(R.activeFilters({ noImported: '1' }).includes('noImported'));
    });
    test('PR file — dates (Excel day · dd/mm/yy · Buddhist year) · the header row · a first guess of the columns · only three columns go on', () => {
      assert.deepEqual([R.prDate(46304), R.prDate('09/10/26'), R.prDate('9/10/2569'), R.prDate('2026-10-09'), R.prDate('31/02/2026'), R.prDate('soon')],
        ['2026-10-09', '2026-10-09', '2026-10-09', '2026-10-09', null, null]);
      const rows = [['PR 09/10/26', null], ['No.', 'ชื่อ', 'เลขบัญชี', 'ยอดโอน (Net)', 'วันที่โอน'], [1, '@genygee28', '123-4-56789-0', 2910, '09/10/26'], [null, null]];
      assert.equal(R.prHeaderRow(rows), 1);
      assert.deepEqual(R.guessPrColumns(rows[1]), { name: 1, amount: 3, paid: 4 });
      const out = R.prRows([{ name: 'S1', rows }], Object.assign({ sheet: '' }, R.guessPrColumns(rows[1])));
      assert.deepEqual(out, [{ sheet: 'S1', row: 3, name: '@genygee28', amount: 2910, paid: '2026-10-09' }]);
      assert.ok(!JSON.stringify(out).includes('123-4-56789-0'), 'the account no. column is not taken');
    });
    test('TC-30: a test .xlsx read in memory (stored and deflated parts) and a .csv → Matched 3 · Check amount 1 · Not found 1', async () => {
      const st = fresh(), lines = R.cleanupLines(st, TD), pick = lines.slice(0, 4), h = x => x.account_handle;
      const body = [['Name', 'Bank account', 'Amount', 'Paid'], ['@' + h(pick[0]), '999-9-99999-9', pick[0].tax.net, '01/10/2026'], [h(pick[1]).toUpperCase(), '888-8-88888-8', pick[1].tax.gross, 46296],
        [' ' + h(pick[2]), '777-7-77777-7', String(pick[2].tax.net + 0.5), null], [h(pick[3]), '666-6-66666-6', pick[3].tax.gross + 900, null], ['nobody_r3_test', '555-5-55555-5', 1000, null]];
      const book = await X.read(X.workbook([{ name: 'PR test', rows: body }]));
      assert.deepEqual(book.sheets.map(x => x.name), ['PR test']);
      const map = Object.assign({ sheet: '' }, R.guessPrColumns(book.sheets[0].rows[0]));
      assert.deepEqual([map.name, map.amount, map.paid], [0, 2, 3]);
      const m = R.matchPrRows(lines, R.prRows(book.sheets, map));
      assert.deepEqual(m.map(x => x.status), ['matched', 'matched', 'matched', 'amount', 'notfound']);
      assert.deepEqual(m.slice(0, 2).map(x => x.row.paid), ['2026-10-01', '2026-10-01']);
      const csv = X.readCsv('Name,Amount\n"' + h(pick[0]) + '",' + pick[0].tax.gross + '\n', 'pr');
      assert.equal(R.matchPrRows(lines, R.prRows(csv.sheets, { sheet: '', name: 0, amount: 1, paid: -1 }))[0].status, 'matched');
      /* applied: only the note names the file — nothing else of it is in the data */
      const evs = R.applyCleanup(st, { lines: m.filter(x => x.status === 'matched').map(x => ({ item: x.item, date: x.row.paid || TD, note: R.prNote('PR_test.xlsx', x.row.sheet, x.row.row) })), shipments: [] }, ctxP());
      const text = JSON.stringify(st);
      assert.ok(text.includes('Matched with PR_test.xlsx · sheet PR test row 2'));
      ['999-9-99999-9', '888-8-88888-8', '777-7-77777-7', '555-5-55555-5', 'nobody_r3_test', 'Bank account'].forEach(v => assert.ok(!text.includes(v), v));
      assert.equal(evs.length, 3);
    });
    test('TC-32: Apply clean-up then Undo — To pay goes down by what was ticked · Undo puts back every line, shipment, event and go_live (completed_at empty)', () => {
      const st = fresh(), lines = R.cleanupLines(st, TD).slice(0, 3), ship = st.sample_shipments.find(sh => sh.status === 'to_ship');
      const before = R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs').length, snap = R.cleanupSnapshot(st), evN = st.deal_events.length;
      const evs = R.applyCleanup(st, { goLiveDate: '2026-10-01', lines: lines.map(x => ({ item: x, date: TD, note: 'Paid before go-live' })), shipments: [ship.shipment_id] }, ctxP());
      st.deal_events.push(...evs);
      assert.equal(R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs').length, before - 3);
      assert.deepEqual([st.lookups.go_live.date, !!st.lookups.go_live.completed_at, st.sample_shipments.find(x => x.shipment_id === ship.shipment_id).status], ['2026-10-01', true, 'delivered']);
      R.undoCleanup(st, snap);
      assert.equal(R.payQueue(st, TD).items.filter(x => x.status === 'missing_docs').length, before);
      assert.deepEqual([st.lookups.go_live.date, st.lookups.go_live.completed_at, st.sample_shipments.find(x => x.shipment_id === ship.shipment_id).status, st.deal_events.length], [TD, null, 'to_ship', evN]);
    });
    test('Go-live clean-up: Admin runs it · Accounting sees step 2 read only · nobody else', () => {
      const as = role => ({ user_id: 'X', role, active: true }), roles = ['admin', 'kol_manager', 'staff', 'viewer', 'accounting'];
      assert.deepEqual(roles.map(r => R.can(as(r), 'golive.run')), [true, false, false, false, false]);
      assert.deepEqual(roles.map(r => R.can(as(r), 'golive.view')), [true, false, false, false, true]);
    });
  });

  describe('CR-11 R5 · Metrics D+7 (§4.12)', () => {
    const TD = '2026-10-06', L = '2026-10-06';
    const post = (date, more) => Object.assign({ post_date: date, post_link: 'https://www.tiktok.com/@x/video/1', views: null }, more || {});
    test('TC-47: posted 25/09/2026, no metrics → Due (D+7 = 02/10) · counted in Metrics due · saved today → Collected', () => {
      const p = post('2026-09-25'), i = R.metricsInfo(p, TD, [7], L);
      assert.deepEqual([i.status, i.checkpointDate], ['due', '2026-10-02']);
      const s = fresh(), d = s.deals.find(x => x.status === 'Inprocess'), p2 = Object.assign(R.blankPost ? R.blankPost(d) : {}, { post_id: 'PS-T47', deal_id: d.deal_id, post_date: '2026-09-25', post_link: 'https://www.tiktok.com/@x/video/47' });
      const n0 = R.metricsDue(s, {}, TD).length; s.deal_posts.push(p2);
      assert.equal(R.metricsDue(s, {}, TD).length, n0 + 1);
      R.setMetrics(p2, { views: 100 }, { today: TD, now: 'x', user: 'U000', eventId: 1 }, 'paste');
      assert.equal(R.metricsStatus(p2, TD, R.metricsCheckpoints(s.lookups), R.goLiveDate(s.lookups)), 'collected');
      assert.equal(R.metricsDue(s, {}, TD).length, n0);
    });
    test('TC-48: posted 01/10/2026 → Waiting "D+7 on 08/10" · not Due · listed in Due in next 7 days as Collect metrics', () => {
      const i = R.metricsInfo(post('2026-10-01'), TD, [7], L);
      assert.deepEqual([i.status, i.nextDate, C.perfTab.waitingL(i.next, '08/10')], ['waiting', '2026-10-08', 'D+7 on 08/10']);
      const s = fresh(), d = s.deals.find(x => x.status === 'Inprocess');
      s.deal_posts.push({ post_id: 'PS-T48', deal_id: d.deal_id, post_date: '2026-10-01', post_link: 'https://www.tiktok.com/@x/video/48', views: null });
      assert.ok(R.metricsDues(s, {}, TD, 7).some(x => x.post.post_id === 'PS-T48' && x.due === '2026-10-08' && x.metrics));
    });
    test('TC-49: checkpoints 7, 30 · collected at D+7 and today ≥ D+30 → Due again · Settings takes "7, 30"', () => {
      const p = post('2026-09-01', { views: 500, metrics_source: 'manual', metrics_updated_at: '2026-09-09' });
      assert.deepEqual([R.metricsStatus(p, TD, [7], L), R.metricsStatus(p, TD, [7, 30], L)], ['collected', 'due']);
      assert.deepEqual([R.parseCheckpoints('7, 30').list, R.parseCheckpoints('30 7 7').list, !!R.parseCheckpoints('0').error, !!R.parseCheckpoints('').error], [[7, 30], [7, 30], true, true]);
      assert.deepEqual(R.metricsCheckpoints({ metrics_checkpoints: [30, 7] }), [7, 30]);
    });
    test('§4.6 Not tracked: before go-live − 30 days with no numbers · numbers from the old file = Imported · no date or no link = Not posted', () => {
      assert.deepEqual([R.metricsStatus(post('2026-09-05'), TD, [7], L), R.metricsStatus(post('2026-09-06'), TD, [7], L), R.metricsStatus(post('2026-08-01', { views: 9, metrics_source: 'legacy' }), TD, [7], L),
        R.metricsStatus(post(null), TD, [7], L), R.metricsStatus(post('2026-09-20', { post_link: '' }), TD, [7], L)], ['not_tracked', 'due', 'imported', 'not_posted', 'not_posted']);
    });
  });
  describe('CR-11 R4 · Shipments (§4.10)', () => {
    const TD = '2026-10-06';
    const as = (role, extra) => Object.assign({ user_id: 'UX', role, active: true }, extra || {});
    const withItems = st => { st.products.push({ tr_code: 'TR001', product_name: 'Lip', variant: '01', active: true }, { tr_code: 'TR002', product_name: 'Lip', variant: '02', active: true });
      st.sample_shipments.filter(x => x.status === 'to_ship').forEach((x, i) => { x.items = i % 2 ? [{ tr_code: 'TR001', qty: 2 }, { tr_code: 'TR002', qty: 1 }] : [{ tr_code: 'TR001', qty: 1 }]; }); return st; };
    test('TC-33: To ship (All campaigns) 8 = Overdue 7 + No ship-by date 1 · In transit 0 · Delivered 214 − 8 · Mine as Pizza 4', () => {
      const st = fresh(), rows = R.shipRows(st, TD), tab = R.shipTab(rows, 'to-ship', TD, false);
      assert.equal(tab.rows.length, 8);
      assert.deepEqual(tab.rows.map(R.toShipGroup), ['overdue', 'overdue', 'overdue', 'overdue', 'overdue', 'overdue', 'overdue', 'noShipBy']);
      const c = R.shipCards(rows);
      assert.deepEqual([c.overdue, c.this_week, c.in_transit, c.noShipBy, c.problem], [7, 0, 0, 1, 0]);
      assert.deepEqual(R.tabCounts(rows), { 'to-ship': 8, 'in-transit': 0, delivered: 206 });
      assert.equal(R.shipTab(R.filterShipRows(st, rows, { pic: 'Pizza' }), 'to-ship', TD).rows.length, 4);
      assert.ok(tab.rows.every(r => r.purpose === 'review' && r.campaign_id && r.deal));
      assert.equal(R.filterShipRows(st, rows, { q: tab.rows[0].kol.display_name.toUpperCase() }).some(r => r.sh === tab.rows[0].sh), true, 'search by KOL');
    });
    test('TC-35: Create pick list of 3 — Items summary per TR code · each gets the pick list · not twice · out again until shipped', () => {
      const st = withItems(fresh()), ids = R.shipTab(R.shipRows(st, TD), 'to-ship', TD).rows.slice(0, 3).map(r => r.sh.shipment_id);
      const list = ids.map(id => st.sample_shipments.find(x => x.shipment_id === id));
      assert.deepEqual(R.itemsSummary(list), (() => { const m = {}; list.forEach(x => x.items.forEach(i => { m[i.tr_code] = (m[i.tr_code] || 0) + i.qty; })); return Object.keys(m).sort().map(k => ({ tr_code: k, qty: m[k] })); })());
      assert.deepEqual(R.validatePickList(st, ids, ' ').errs.map(e => e.field), ['name']);
      const pl = R.newPickList(st, ids, { id: S.createStore ? 'PK0001' : 'PK0001', name: R.pickListName(TD), user: 'U000', now: 'x' });
      assert.equal(pl.name, 'Pick list 06/10');
      assert.ok(list.every(x => x.pick_list_id === 'PK0001') && st.pick_lists.length === 1);
      assert.deepEqual(R.validatePickList(st, ids.slice(0, 1), 'again').errs.map(e => e.field), ['rows'], 'already in a pick list');
      assert.equal(R.removeFromPickList(st, list[2]), true);
      assert.deepEqual([list[2].pick_list_id, pl.shipment_ids.length], [null, 2]);
    });
    test('TC-36: Mark all shipped — Kerry · 3 tracking lines pasted → In transit · tracking in row order · the Journey Shipment track says Shipped', () => {
      const st = withItems(fresh()), ids = R.shipTab(R.shipRows(st, TD), 'to-ship', TD).rows.slice(0, 3).map(r => r.sh.shipment_id);
      const pl = R.newPickList(st, ids, { id: 'PK0001', name: 'Batch', user: 'U000', now: 'x' }), lines = R.trackingLines('KER001\tx\nKER002\r\nKER003\n\n');
      assert.deepEqual(lines, ['KER001', 'KER002', 'KER003']);
      assert.deepEqual(R.validateMarkAll({ date: TD, carrier: '', trackings: lines }, 3).errs.map(e => e.field), ['carrier']);
      let e = 0; const evs = R.markAllShipped(st, pl, { date: TD, carrier: 'Kerry Express', trackings: lines }, { eventId: () => 80000 + (++e), now: 'x', user: 'U007' });
      assert.equal(evs.length, 3);
      const list = R.pickListShipments(st, pl);
      assert.deepEqual(list.map(x => [x.status, x.carrier, x.tracking_no]), [['shipped', 'Kerry Express', 'KER001'], ['shipped', 'Kerry Express', 'KER002'], ['shipped', 'Kerry Express', 'KER003']]);
      assert.equal(R.shipTab(R.shipRows(st, TD), 'in-transit', TD).rows.length, 3);
      assert.equal(R.sampleTrack(R.shipmentsOf(st, list[0].deal_id), TD).kind, 'shipped');
      assert.equal(R.removeFromPickList(st, list[0]), false, 'shipped: stays in its pick list');
      assert.equal(R.daysInTransit({ shipped_date: '2026-09-29' }, TD), 7);
    });
    test('TC-37: who may — Staff marks shipped any shipment · items / ship by only on their deals or what they made · Viewer / Accounting neither', () => {
      const st = fresh(), sh = st.sample_shipments.find(x => x.status === 'to_ship'), d = st.deals.find(x => x.deal_id === sh.deal_id);
      const other = as('staff', { is_pic: true, pic_name: d.pic === 'Amp' ? 'Babe' : 'Amp' }), pic = as('staff', { is_pic: true, pic_name: d.pic });
      assert.deepEqual([R.canShipWork(other), R.canShipWork(as('viewer')), R.canShipWork(as('accounting'))], [true, false, false]);
      assert.deepEqual([R.canEditShip(other, d, sh), R.canEditShip(pic, d, sh), R.canEditShip(as('kol_manager'), d, sh), R.canEditShip(as('viewer'), d, sh)], [false, !!d.pic, true, false]);
      assert.equal(R.canEditShip(other, null, Object.assign({}, sh, { deal_id: null, created_by: 'UX' })), true, 'a shipment they made');
    });
    test('TC-38: New shipment · Gifting · no deal — a purpose and a KOL needed · To ship · the Campaign chosen · no address in the shipment', () => {
      const st = fresh(), k = kolNamed(st, 'genygee28'), camp = st.campaigns[0].campaign_id;
      assert.deepEqual(R.validateNewShipment(st, { purpose: '', kol_id: '', items: [] }).errs.map(e => e.field), ['purpose', 'kol_id']);
      const d = { purpose: 'gifting', kol_id: k.kol_id, deal_id: '', campaign_id: camp, items: [{ tr_code: 'TR001', qty: 2 }], ship_by: '2026-10-10', note: 'launch event' };
      assert.deepEqual(R.validateNewShipment(st, d).errs, []);
      assert.deepEqual(R.validateNewShipment(st, Object.assign({}, d, { deal_id: st.deals.find(x => x.kol_id !== k.kol_id).deal_id })).errs.map(e => e.field), ['deal_id']);
      const sh = R.newManualShipment(st, d, { id: 'SH999999', user: 'U007', now: 'x' }); st.sample_shipments.push(sh);
      assert.deepEqual([sh.deal_id, sh.source, sh.purpose, sh.campaign_id, sh.status, sh.ship_by], [null, 'other', 'gifting', camp, 'to_ship', '2026-10-10']);
      assert.ok(!['address', 'ship_address', 'phone', 'recipient'].some(f => f in sh));
      const r = R.shipTab(R.shipRows(st, TD), 'to-ship', TD).rows.find(x => x.sh === sh);
      assert.deepEqual([r.deal, r.kol.kol_id, r.pic, R.toShipGroup(r)], [null, k.kol_id, 'Pizza', 'this_week']);
      assert.equal(R.syncShipments(st, { shipmentId: () => 'SHX', eventId: () => 1, now: 'x', user: 'U000' }).some(e => e.shipment_id === 'SH999999'), false, 'the reconcile leaves it alone');
    });
    test('TC-39 / TC-40: Delivered hides the 206 imported (Show imported) · Operations Shipments to ship for Pizza = 4 (with or without a deal)', () => {
      const st = fresh(), rows = R.shipRows(st, TD), d = R.shipTab(rows, 'delivered', TD, false);
      assert.deepEqual([d.rows.length, d.hidden, R.shipTab(rows, 'delivered', TD, true).rows.length], [0, 206, 206]);
      assert.deepEqual([R.shipmentsToShip(st, { pic: 'Pizza' }, TD).length, R.shipmentsToShip(st, {}, TD).length], [4, 7]);
      assert.ok(R.PERMISSIONS.some(p => p.key === 'shipment.ship') && C.roles.perm['shipment.ship']);
      assert.equal(C.samples.filter, 'Shipment status');
    });
  });
  describe('CR-11 R5 · fill once (§4.11)', () => {
    const TD = '2026-10-06', camp = (st, n) => st.campaigns.find(c => c.campaign_name.startsWith(n));
    const ctx = () => ({ eventId: 70000, now: new Date('2026-10-06T03:00:00Z'), user: 'U000', note: 'Default (Phase)' });
    test('TC-41: KS Phase 1 Awareness · Phase 2 Conversion (from the migration) · the others none', () => {
      const st = fresh(), ks = R.sortPhases(st.phases.filter(p => p.campaign_id === camp(st, 'Kiss').campaign_id));
      assert.deepEqual(ks.map(p => R.phaseDefaultPillar(st, p.phase_id)), ['Awareness', 'Conversion']);
      assert.ok(st.phases.filter(p => p.campaign_id !== camp(st, 'Kiss').campaign_id && p.phase_id !== 'PH-P1').every(p => R.phaseDefaultPillar(st, p.phase_id) === null));   // (CR-19: PH Phase 1 → Awareness & Consideration)
    });
    test('TC-42: New deal in KS Phase 1 → Pillar Awareness (From phase) · Auto by post date finds the Phase · no Phase default → nothing', () => {
      const st = fresh(), c = camp(st, 'Kiss'), [p1, p2] = R.sortPhases(st.phases.filter(p => p.campaign_id === c.campaign_id));
      assert.deepEqual(R.pillarPrefill(st, c.campaign_id, p1.phase_id, null), { pillar: 'Awareness', phase_id: p1.phase_id });
      assert.deepEqual(R.pillarPrefill(st, c.campaign_id, '', p2.start_date), { pillar: 'Conversion', phase_id: p2.phase_id });
      assert.equal(R.phaseOfDate(st, c.campaign_id, '2020-01-01'), null);
      assert.equal(R.pillarPrefill(st, camp(st, 'Charming').campaign_id, '', null), null);
      assert.equal(R.needsPillar(st.lookups, Object.assign({}, st.deals.find(d => d.status === 'List'), { pillar: 'Awareness', is_legacy: false }), 'Confirm QT'), false, 'Move to Confirm QT does not ask');
    });
    test('TC-43: Phase › Apply to n deals without pillar (imported too, not cancelled) → Pillar not set goes down · Undo puts it back', () => {
      const st = fresh(), c = camp(st, 'Kiss'), p1 = R.sortPhases(st.phases.filter(p => p.campaign_id === c.campaign_id))[0];
      const list = R.dealsWithoutPillar(st, p1.phase_id), idx = R.phaseIndex(st);
      assert.ok(list.length > 0 && list.every(d => !d.pillar && d.status !== 'Cancel' && R.primaryPhase(idx, d.deal_id) === p1.phase_id));
      const h0 = R.dataHealth(st, {}, TD).items.find(i => i.key === 'pillarNotSet').n, openN = list.filter(d => !R.isImportedClosed(d)).length;
      const before = new Map(list.map(d => [d.deal_id, d.pillar || null])), r = R.fieldChanges(list, 'pillar', 'Awareness', ctx());
      const put = x => { const at = new Map(st.deals.map((d, i) => [d.deal_id, i])); x.deals.forEach(d => { st.deals[at.get(d.deal_id)] = d; }); x.events.forEach(e => st.deal_events.push(e)); };
      put(r);
      assert.deepEqual([r.events.length, r.events[0].type, r.events[0].to], [list.length, 'pillar', 'Awareness']);
      assert.equal(R.dataHealth(st, {}, TD).items.find(i => i.key === 'pillarNotSet').n, h0 - openN);
      put(R.fieldChanges(r.deals.map(d => st.deals.find(x => x.deal_id === d.deal_id)), 'pillar', d => before.get(d.deal_id), Object.assign(ctx(), { note: 'undo' })));
      assert.equal(R.dataHealth(st, {}, TD).items.find(i => i.key === 'pillarNotSet').n, h0);
    });
    test('TC-44: AC default Postpaid › Apply to open deals without term — n = 29 · Payment term not set 70 → 41 · deals with a term are not touched', () => {
      const st = fresh(), ac = camp(st, 'Ac');
      ac.default_payment_term = 'postpaid';
      const withTerm = st.deals.find(d => d.campaign_id === ac.campaign_id && R.isOpenDeal(d));
      withTerm.payment_term = 'prepaid';
      const list = R.openDealsWithoutTerm(st, ac.campaign_id);
      assert.equal(list.length, 28, 'one of the 29 now has a term of its own');
      withTerm.payment_term = null;
      const all = R.openDealsWithoutTerm(st, ac.campaign_id); assert.equal(all.length, 29);
      const r = R.fieldChanges(all, 'payment_term', 'postpaid', ctx()), at = new Map(st.deals.map((d, i) => [d.deal_id, i]));
      r.deals.forEach(d => { st.deals[at.get(d.deal_id)] = d; });
      assert.equal(R.dataHealth(st, {}, TD).items.find(i => i.key === 'termNotSet').n, 41);
      assert.equal(r.events[0].type, 'payment_term');
    });
    test('TC-45: New deal term — the KOL default wins · (CR-18 §4.1: a Campaign no longer fills it) · neither → none · Bulk shortlist the same', () => {
      const st = fresh(), ac = camp(st, 'Ac'), k0 = st.kol_master.find(k => !R.isTerm(k.default_payment_term)), k1 = Object.assign({}, k0, { default_payment_term: 'prepaid' });
      assert.deepEqual(R.termPrefill(st, k0, ac.campaign_id), { term: '', source: null });
      ac.default_payment_term = 'postpaid';
      assert.deepEqual([R.termPrefill(st, k0, ac.campaign_id), R.termPrefill(st, k1, ac.campaign_id), R.termPrefill(st, null, ac.campaign_id)],
        [{ term: '', source: null }, { term: 'prepaid', source: 'kol' }, { term: '', source: null }]);
      const free = st.kol_master.find(k => !R.isTerm(k.default_payment_term) && !st.deals.some(d => d.kol_id === k.kol_id && d.campaign_id === ac.campaign_id) && k.kol_status !== 'Blacklist');
      assert.equal(R.bulkShortlistPlan(st, [free.kol_id], ac.campaign_id, { pic: 'me', me: 'Pizza' }).create[0].term, null);
    });
    test('TC-46: a Campaign with one product → picked for you (Only product in campaign) · two → none', () => {
      const st = fresh(), c = st.campaigns[0];
      st.products.push({ tr_code: 'TR-ONE', product_name: 'One', active: true }, { tr_code: 'TR-TWO', product_name: 'Two', active: true });
      R.setCampaignProducts(st, c.campaign_id, ['TR-ONE']);
      assert.equal(R.onlyProduct(st, c.campaign_id), 'TR-ONE');
      R.setCampaignProducts(st, c.campaign_id, ['TR-ONE', 'TR-TWO']);
      assert.equal(R.onlyProduct(st, c.campaign_id), null);
      assert.equal(R.onlyProduct(st, ''), null);
    });
    test('Allocation note: more than half of the spend without a pillar → "Most spend has no pillar"', () => {
      const st = fresh(), a = R.pillarAllocation(st, camp(st, 'Charming').campaign_id);
      assert.equal(R.mostSpendNoPillar(a.actual), a.actual.money[R.NOT_SET] / a.actual.total > 0.5);
      assert.deepEqual([R.mostSpendNoPillar({ total: 100, money: { [R.NOT_SET]: 51 } }), R.mostSpendNoPillar({ total: 100, money: { [R.NOT_SET]: 50 } }), R.mostSpendNoPillar({ total: 0, money: {} })], [true, false, false]);
    });
  });
  describe('CR-11 R6 · UI polish (§4.13)', () => {
    const TD = '2026-10-06';
    test('TC-52: core steps — Contacted · Confirm QT · Brief · Script · Draft 1 · Approve · Post · Cancel are locked (CR-15 §4.5) · the others are not', () => {
      const st = fresh(), steps = R.stepsOf(st.lookups);
      assert.deepEqual(steps.filter(R.isCoreStep).map(x => x.sub_status), ['Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Approve', 'Post', 'Cancel']);
      assert.deepEqual(steps.filter(x => !R.isCoreStep(x)).map(x => x.sub_status), ['Shortlist', 'Draft 2', 'Draft 3']);
    });
    test('TC-54: duplicate post links — gunnogun twice in Kiss Signal → both flagged (the first counts) · filter · Views of the Campaign count it once', () => {
      const st = fresh(), groups = R.duplicatePostGroups(st);
      assert.equal(groups.length, 4);
      const ks = st.campaigns.find(c => c.campaign_name.startsWith('Kiss')), rows = R.perfRows(st, st.deals.filter(d => d.campaign_id === ks.campaign_id), TD, R.dealContext(st));
      const gun = rows.filter(r => r.kol && r.kol.display_name === 'gunnogun' && r.dup);
      assert.deepEqual(gun.map(r => [r.post.post_id, r.dup.first, r.views]), [['P000127', true, 12800], ['P000128', false, 12800]]);
      assert.equal(R.filterPerfRows(rows, { dup: '1' }).length, rows.filter(r => r.dup).length);
      const m = R.perfMetricsOf(rows), all = rows.reduce((a, r) => a + (r.views || 0), 0);
      assert.deepEqual([m.posted, all - m.views], [rows.length, 12800]);
      /* the groups are of closed deals from the old files: not in Data health (§4.6) — Data health stays 4 items */
      assert.equal(R.dataHealth(st, {}, TD).total, 4);
      const open = st.deals.find(d => d.deal_id === 'D000125'); open.status = 'Inprocess';
      assert.equal(R.dataHealth(st, {}, TD).items.find(i => i.key === 'dupLinks').n, 1, 'an open deal with a duplicate link counts');
    });
    test('TC-55: Role Management matrix in groups — Dashboard · Deals · Shipments · Payments · KOL Master · Settings · every row in one group', () => {
      const g = R.permGroups();
      assert.deepEqual(g.map(x => x.module), ['dashboard', 'deals', 'shipments', 'payments', 'kol', 'settings']);
      assert.equal(g.reduce((a, x) => a + x.rows.length, 0), R.PERMISSIONS.length);
      assert.ok(R.PERMISSIONS.every(p => R.PERM_MODULE[p.key]), 'every permission has a module');
      assert.ok(g.every(x => C.roles.modules[x.module]));
    });
  });
});
