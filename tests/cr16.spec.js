/* cr16.spec.js — CR-16 test cases (KOL profile modal · more than one payee / shipping address · profile photos · schema 15), run by tests/test.html.
   "today" is 08/10/2026 · the seed after migrate v15 · test data is made up (no real accounts or addresses) · money anchors stay those of CR-05 §5.0. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED, V } = t;
  const TD = '2026-10-08';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-08T03:00:00Z'));
  const FAST = 2000;   // PBKDF2 rounds in tests (the app uses 600,000)
  const SECURE = n => ({ key_id: 'k', wrapped_key: 'w' + n, iv: 'i' + n, ciphertext: 'c' + n });
  const ctxFor = s => { let e = 0; return { lineId: () => 'PL-' + String((s.payment_lines.length + 1)).padStart(6, '0'), eventId: () => 9000 + e++, now: '2026-10-08T03:00:00Z', user: 'U000' }; };
  /* a payee with made-up bank details on file and its documents in */
  const payeeFor = (s, kolId, o) => { const p = R.blankPayee(s, Object.assign({ payee_id: 'PY-' + String(s.payee_profiles.length + 1).padStart(4, '0'), kol_id: kolId }, o || {}));
    Object.assign(p, { secure: SECURE(s.payee_profiles.length), bank_name: 'KBank', account_last4: '7890', details_version: 1, docs: { id_copy: TD, bank_book: TD, company_cert: null, vat_cert: null } }, (o || {}).extra || {});
    s.payee_profiles.push(p); return p; };
  const addrFor = (s, kolId, label, def) => { const a = R.newAddress({ address_id: 'AD-' + String(s.shipping_addresses.length + 1).padStart(4, '0'), kol_id: kolId, label, is_default: !!def, secure: SECURE('a' + s.shipping_addresses.length), now: '2026-10-08T03:00:00Z', user: 'U000' });
    s.shipping_addresses.push(a); if (def) R.withDefault(s.shipping_addresses, 'address_id', a.address_id); return a; };
  function fakeStorage() {
    const m = new Map();
    return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  }
  /* a state as schema 14 saved it: one payee a KOL (no label / default / archived) · shipping details inside the payee (secure_ship) */
  function asV14(state) {
    const o = JSON.parse(JSON.stringify(state));
    o.schema_version = 14; delete o.shipping_addresses;
    o.deals.forEach(d => { delete d.payee_id; }); (o.sample_shipments || []).forEach(sh => { delete sh.address_id; }); o.kol_master.forEach(k => { delete k.photo; });
    o.payee_profiles = [
      { payee_id: 'PY-0001', kol_id: 'K0011', payee_type: 'individual', secure: SECURE(1), secure_ship: SECURE('s1'), shipping_on_file: true, created_at: '2026-09-01T03:00:00Z', created_by: 'U001', updated_at: '2026-09-02T03:00:00Z', updated_by: 'U001' },
      { payee_id: 'PY-0002', kol_id: 'K0001', payee_type: 'individual', secure: null },
      { payee_id: 'PY-0003', kol_id: null, account_handle: 'aff_test', payee_type: 'individual', secure: SECURE(3) },
    ];
    return o;
  }

  describe('CR-16 §3 · schema 15', () => {
    test('TC-01: a schema 14 file → 15 · a copy from before (replacing the v14 one) · every payee "Primary", the default, not archived · new fields null', () => {
      const ls = fakeStorage(), v14 = asV14(fresh());
      ls.setItem(S.KEY, JSON.stringify(v14)); ls.setItem(S.BEFORE14_KEY, '{"old":true}');
      const st = S.createStore({ seed: SEED, storage: ls, now: () => new Date('2026-10-08T03:00:00Z') }), s = st.state;
      assert.equal(s.schema_version, S.SCHEMA_VERSION, 'CR-17 moved it on');
      assert.equal(JSON.parse(ls.getItem(S.BEFORE15_KEY)).schema_version, 14, 'the data from before the upgrade');
      assert.equal(ls.getItem(S.BEFORE14_KEY), null, 'the v14 copy makes room for it');
      assert.ok(s.payee_profiles.every(p => p.label === 'Primary' && p.is_default === true && p.archived === false));
      assert.ok(s.deals.every(d => d.payee_id === null) && s.sample_shipments.every(sh => sh.address_id === null) && s.kol_master.every(k => k.photo === null));
      /* the shipping details became K0011's first address as they were (nothing decrypted) */
      assert.equal(s.shipping_addresses.length, 1);
      assert.deepEqual(Object.assign({}, s.shipping_addresses[0], { secure: null }), { address_id: 'AD-0001', kol_id: 'K0011', label: 'Primary', is_default: true, archived: false, secure: null,
        details_updated_at: '2026-09-02T03:00:00Z', details_updated_by: 'U001', created_at: '2026-09-01T03:00:00Z', created_by: 'U001' });
      assert.deepEqual(s.shipping_addresses[0].secure, SECURE('s1'));
      assert.ok(s.payee_profiles.every(p => !('secure_ship' in p) && !('shipping_on_file' in p)));
      assert.equal(st.beforeCopy() !== null, true);
    });
    test('migrateV15 twice → the same · two payees of one KOL: one default · shipping of both kept (first = default)', () => {
      const o = asV14(fresh());
      o.payee_profiles.push({ payee_id: 'PY-0004', kol_id: 'K0011', payee_type: 'company', secure: null, secure_ship: SECURE('s4'), shipping_on_file: true });
      R.migrateV15(o); const once = JSON.stringify(o); R.migrateV15(o);
      assert.equal(JSON.stringify(o), once);
      assert.deepEqual(o.payee_profiles.filter(p => p.kol_id === 'K0011').map(p => [p.payee_id, p.is_default]), [['PY-0001', true], ['PY-0004', false]]);
      assert.deepEqual(o.shipping_addresses.map(a => [a.address_id, a.kol_id, a.is_default]), [['AD-0001', 'K0011', true], ['AD-0002', 'K0011', false]]);
      assert.equal(o.payee_profiles.find(p => p.payee_id === 'PY-0003').is_default, true, 'a payee outside KOL Master is its own default');
    });
    test('§5.0 after migrate: the seed has no payee yet · shipping_addresses 0 · collections counted', () => {
      const s = fresh();
      assert.equal(s.schema_version, S.SCHEMA_VERSION, 'CR-17 moved it on');
      assert.deepEqual([s.payee_profiles.length, s.shipping_addresses.length], [0, 0]);
      assert.ok(S.COLLECTIONS.includes('shipping_addresses'));
    });
  });

  describe('CR-16 §4.1 · the profile', () => {
    test('TC-02 / §5.0: genygee28 (K0011) — Deals 3 · Latest ฿3,000 · Average ฿5,000 · On-time 100% (2 of 2) · Last worked 04/09/2026 · Charming Iconic Glow', () => {
      const s = fresh(), x = R.kolSummary(s, 'K0011', TD);
      assert.deepEqual([x.deals, x.latestRate, x.averageRate, x.perf.onTime, x.perf.measured, x.perf.rate, x.last, x.lastCampaign], [3, 3000, 5000, 2, 2, 1, '2026-09-04', 'Charming Iconic Glow']);
      assert.equal(x.committed, R.dealsOfKol(s, 'K0011').filter(d => d.status !== 'Cancel').reduce((a, d) => a + R.totalCost(d), 0), 'Committed = every deal not cancelled');
    });
    test('§5.0: kiaokoy_22 (K0001) — Deals 1 · ฿41,000 · Last worked 08/09/2026 · Posted (D000001)', () => {
      const s = fresh(), x = R.kolSummary(s, 'K0001', TD);
      assert.deepEqual([x.deals, x.committed, x.last], [1, 41000, '2026-09-08']);
      assert.deepEqual(R.dealsOfKol(s, 'K0001').map(d => [d.deal_id, d.status]), [['D000001', 'Complete']]);
      assert.equal(R.inHistory(R.dealsOfKol(s, 'K0001')[0], 'posted'), true);
    });
    test('TC-03: Rates — quoted + agreed in one list, newest first (no free / cancelled / ฿0) · Performance — every post of the KOL · Deals & history filters', () => {
      const s = fresh(), h = R.rateHistory(s, 'K0011');
      assert.deepEqual(h.map(x => [x.kind, x.date, x.total]), [['agreed', '2026-08-24', 4500], ['agreed', '2026-08-06', 5500], ['quoted', null, 3000]]);
      assert.ok(h.filter(x => x.kind === 'agreed').every(x => x.campaign && x.stage));
      assert.equal(R.kolPosts(s, 'K0011').length, 3);
      const deals = R.dealsOfKol(s, 'K0011'), n = f => deals.filter(d => R.inHistory(d, f)).length;
      assert.deepEqual(R.HISTORY_FILTERS.map(n), [3, 1, 2, 0], 'All · Open · Posted · Cancelled');
      /* a free job is no price */
      const d = s.deals.find(x => x.deal_id === 'D000011'); d.payment_term = 'free';
      assert.ok(!R.rateHistory(s, 'K0011').some(x => x.id === 'D000011'));
    });
    test('TC-04: ‹ › / ↑ ↓ follow the table order · none past either end · #kols/K0011/rates → { K0011, rates } (unknown tab → overview)', () => {
      const ids = ['K0003', 'K0011', 'K0001'];
      assert.deepEqual([R.kolNav(ids, 'K0011', 1), R.kolNav(ids, 'K0011', -1), R.kolNav(ids, 'K0001', 1), R.kolNav(ids, 'K0003', -1), R.kolNav(ids, 'K9999', 1)], ['K0001', 'K0003', null, null, null]);
      assert.deepEqual(R.profileRoute('K0011/rates'), { id: 'K0011', tab: 'rates' });
      assert.deepEqual(R.profileRoute('K0011'), { id: 'K0011', tab: 'overview' });
      assert.deepEqual(R.profileRoute('K0011/nope'), { id: 'K0011', tab: 'overview' });
      assert.deepEqual(R.PROFILE_TABS, ['overview', 'deals', 'performance', 'rates', 'payee']);
    });
  });

  describe('CR-16 §4.2 · more than one payee', () => {
    test('TC-08: + Add payee "Agency ABC" → 2 payees · Primary stays the default (listed first) · the label is checked', () => {
      const s = fresh(), a = payeeFor(s, 'K0011'), b = payeeFor(s, 'K0011', { label: 'Agency ABC', is_default: false });
      assert.deepEqual(R.payeesOfKol(s, 'K0011').map(p => p.label), ['Primary', 'Agency ABC']);
      assert.equal(R.defaultPayee(s, 'K0011').payee_id, a.payee_id);
      assert.equal(R.payeeOfKol(s, 'K0011').payee_id, a.payee_id, 'CR-08 callers get the default');
      const errs = v => R.validatePayeeLabel(s, 'K0011', v, null).map(e => e.msg);
      assert.equal(errs('').length, 1); assert.equal(errs('x'.repeat(41)).length, 1);
      assert.equal(errs('agency abc').length, 1, 'not twice for one KOL');
      assert.equal(errs('123-4-56789-0').length, 1, 'no account number in a label');
      assert.deepEqual(errs('Manager'), []);
      assert.deepEqual(R.validatePayeeLabel(s, 'K0011', 'Agency ABC', b.payee_id), [], 'its own label is fine');
      /* one default a KOL */
      R.withDefault(s.payee_profiles, 'payee_id', b.payee_id);
      assert.deepEqual(R.payeesOfKol(s, 'K0011').map(p => [p.label, p.is_default]), [['Agency ABC', true], ['Primary', false]]);
    });
    test('TC-09: Pay to = Agency ABC → deals.payee_id + deal_events payee · To pay shows the label · Missing docs from Agency ABC', () => {
      const s = fresh(); payeeFor(s, 'K0001');
      const ag = payeeFor(s, 'K0001', { label: 'Agency ABC', is_default: false, extra: { docs: { id_copy: null, bank_book: TD, company_cert: null, vat_cert: null } } });
      const item = () => R.payQueue(s, TD).items.find(x => x.deal_id === 'D000001');
      assert.deepEqual([item().payee.label, item().status, R.payeeTag(s, item().payee)], ['Primary', 'ready', ''], 'the default has every document');
      const d = s.deals.find(x => x.deal_id === 'D000001'), r = R.setDealPayee(s, d, ag.payee_id, { eventId: 77, now: new Date('2026-10-08T03:00:00Z'), user: 'U001' });
      assert.deepEqual([d.payee_id, r.event.type, r.event.from, r.event.to, r.event.deal_id], [ag.payee_id, 'payee', null, ag.payee_id, 'D000001']);
      assert.deepEqual([item().payee.payee_id, R.payeeTag(s, item().payee), item().status, item().missing], [ag.payee_id, 'Agency ABC', 'missing_docs', ['id_copy']]);
      assert.equal(R.setDealPayee(s, d, ag.payee_id, { eventId: 78 }), null, 'the same again: nothing');
      assert.equal(R.setDealPayee(s, d, 'PY-9999', { eventId: 79 }), null, 'not this KOL\'s payee');
      /* back to the default: null */
      R.setDealPayee(s, d, null, { eventId: 80 }); assert.equal(d.payee_id, null); assert.equal(R.payeeOfDeal(s, d).label, 'Primary');
      /* an archived payee is never used */
      d.payee_id = ag.payee_id; ag.archived = true; assert.equal(R.payeeOfDeal(s, d).label, 'Primary');
    });
    test('TC-10: a line in a run keeps its payee — a new default or Pay to does not move it · a stored line not in a run follows', () => {
      const s = fresh(), ctx = ctxFor(s), p1 = payeeFor(s, 'K0001'), p2 = payeeFor(s, 'K0001', { label: 'Agency ABC', is_default: false });
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U001' }); s.payment_runs.push(run);
      const x = R.payQueue(s, TD).items.find(i => i.deal_id === 'D000001');
      R.addToRun(s, run, [x], ctx);
      const l = s.payment_lines.find(i => i.deal_id === 'D000001');
      assert.deepEqual([l.payee_id, l.status, R.linePayeeLocked(l)], [p1.payee_id, 'in_run', true]);
      R.withDefault(s.payee_profiles, 'payee_id', p2.payee_id);
      const d = s.deals.find(i => i.deal_id === 'D000001'); R.setDealPayee(s, d, p2.payee_id, { eventId: 81 });
      assert.equal(R.payeeOfLine(s, l).payee_id, p1.payee_id, 'locked to the payee it went in with');
      /* out of the run: open again → it follows the deal's payee on the next change */
      R.removeFromRun(s, l, ctx); assert.equal(R.linePayeeLocked(l), false);
      R.setDealPayee(s, d, p1.payee_id, { eventId: 82 }); assert.equal(l.payee_id, p1.payee_id);
      R.setDealPayee(s, d, p2.payee_id, { eventId: 83 }); assert.equal(l.payee_id, p2.payee_id);
      assert.deepEqual([l.gross, l.net], [x.tax.gross, x.tax.net], 'same type and VAT → the same money');
    });
    test('TC-11: a payee a line used cannot be deleted — Archive only · the default cannot be archived · a new one can be deleted', () => {
      const s = fresh(), p1 = payeeFor(s, 'K0001'), p2 = payeeFor(s, 'K0001', { label: 'Agency ABC', is_default: false });
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U001' }); s.payment_runs.push(run);
      const d = s.deals.find(i => i.deal_id === 'D000001'); R.setDealPayee(s, d, p2.payee_id, { eventId: 84 });
      R.addToRun(s, run, [R.payQueue(s, TD).items.find(i => i.deal_id === 'D000001')], ctxFor(s));
      const a2 = R.payeeActions(s, p2), a1 = R.payeeActions(s, p1);
      assert.deepEqual([a2.used, a2.canDelete, a2.canArchive, a2.canSetDefault], [true, false, true, true]);
      assert.deepEqual([a1.canArchive, a1.canDelete], [false, false], 'the default: neither while another is there');
      const p3 = payeeFor(s, 'K0001', { label: 'Manager', is_default: false });
      assert.equal(R.payeeActions(s, p3).canDelete, true);
      p2.archived = true; assert.deepEqual([R.payeeActions(s, p2).canRestore, R.payeeActions(s, p2).canSetDefault], [true, false]);
      assert.ok(!R.payeesOfKol(s, 'K0001').includes(p2) && R.payeesOfKol(s, 'K0001', true).includes(p2));
    });
    test('a manual line (no deal) changes its own payee — only to a payee of the same KOL, not once in a run', () => {
      const s = fresh(), p1 = payeeFor(s, 'K0001'), p2 = payeeFor(s, 'K0001', { label: 'Agency ABC', is_default: false }), other = payeeFor(s, 'K0011');
      const line = { line_id: 'PL-000099', source: 'manual', deal_id: null, payee_id: p1.payee_id, kol_id: 'K0001', agreed_amount: 1000, price_basis: 'gross', wht_rate: 3, status: 'open', run_id: null };
      assert.equal(R.setLinePayee(s, line, other.payee_id), false);
      assert.equal(R.setLinePayee(s, line, p2.payee_id), true); assert.equal(line.payee_id, p2.payee_id);
      line.run_id = 'PR-2026-10-09'; assert.equal(R.setLinePayee(s, line, p1.payee_id), false);
    });
    test('Import payee details: payee_label (optional) is read · too long / an account number → error', () => {
      const s = fresh(), h = s.kol_accounts.find(a => a.kol_id === 'K0011').handle;
      const head = ['account_handle', 'payee_type', 'full_name', 'id_address', 'phone', 'wht_contact', 'bank_name', 'account_name', 'account_no', 'tax_id', 'docs_link', 'payee_label'];
      const row = label => [h, 'individual', 'Test Name', 'Test 1', '0800000000', 'test@example.com', 'KBank', 'Test Name', '1234567890', '', '', label];
      const plan = R.planPayeeImport(s, [head, row('Agency ABC')]);
      assert.deepEqual([plan.rows[0].kind, plan.rows[0].label], ['match', 'Agency ABC']);
      assert.ok(R.PAYEE_CSV_COLS.includes('payee_label'));
      assert.equal(R.planPayeeImport(s, [head, row('x'.repeat(41))]).rows[0].kind, 'error');
      assert.equal(R.planPayeeImport(s, [head, row('123-4-56789-0')]).rows[0].kind, 'error');
      assert.equal(R.planPayeeImport(s, [head.slice(0, 11), row('').slice(0, 11)]).rows[0].label, null, 'a file without the column still works');
    });
  });

  describe('CR-16 §4.3 · shipping addresses', () => {
    test('TC-13: + Add address "ออฟฟิศ" · Mark shipped to it → address_id kept · blank = the default then · the shipping list uses each shipment\'s', () => {
      const s = fresh(), sh = s.sample_shipments.find(x => x.status === 'to_ship'), deal = s.deals.find(d => d.deal_id === sh.deal_id), kolId = deal.kol_id;
      const home = addrFor(s, kolId, 'Primary', true), office = addrFor(s, kolId, 'ออฟฟิศ', false);
      assert.deepEqual(R.addressesOfKol(s, kolId).map(a => a.label), ['Primary', 'ออฟฟิศ']);
      assert.equal(R.addressOfShipment(s, sh).address_id, home.address_id, 'nothing picked → the default');
      R.updateShipment(sh, { kind: 'shipped', date: TD, carrier: 'Kerry', tracking: 'T1', address_id: office.address_id }, { eventId: 1, now: '2026-10-08T03:00:00Z', user: 'U001' });
      assert.equal(sh.address_id, office.address_id);
      R.pinAddress(s, sh); assert.equal(sh.address_id, office.address_id, 'what it went to stays');
      const sh2 = s.sample_shipments.find(x => x.status === 'to_ship' && x !== sh);
      const k2 = s.deals.find(d => d.deal_id === sh2.deal_id).kol_id, a2 = addrFor(s, k2, 'Primary', true);
      R.updateShipment(sh2, { kind: 'shipped', date: TD }, { eventId: 2, now: '2026-10-08T03:00:00Z' }); R.pinAddress(s, sh2);
      assert.equal(sh2.address_id, a2.address_id, 'blank = the default at Mark shipped');
      /* a new default later does not move a shipment that went */
      const a3 = addrFor(s, k2, 'Office', true); assert.equal(R.addressOfShipment(s, sh2).address_id, a2.address_id); void a3;
      /* Ship to ▾ lists the default first */
      assert.deepEqual(R.shipToOptions(s, kolId).map(o => o.label), ['Default · Primary', 'ออฟฟิศ']);
      /* a picked address of another KOL is not taken */
      const sh3 = s.sample_shipments.find(x => x.status === 'to_ship' && s.deals.find(d => d.deal_id === x.deal_id).kol_id !== kolId);
      R.pinAddress(s, sh3, office.address_id); assert.notEqual(sh3.address_id, office.address_id);
    });
    test('the address rules: recipient + address needed · labels checked · used = archive only · old shipping fields read the same', () => {
      const s = fresh(), a = addrFor(s, 'K0011', 'Primary', true), b = addrFor(s, 'K0011', 'Office', false);
      assert.deepEqual(R.validateShip({ recipient: '', phone: '', address: '' }).map(e => e.field), ['recipient', 'address']);
      assert.deepEqual(R.validateShip({ recipient: 'Test', phone: '', address: 'Test 1' }), []);
      assert.equal(R.validateAddressLabel(s, 'K0011', 'office', null).length, 1);
      assert.deepEqual(R.shipRecord({ recipient: ' A ', phone: '', address: ' B ' }), { recipient: 'A', phone: null, address: 'B' });
      assert.deepEqual(R.readShip({ ship_name: 'A', ship_phone: 'P', ship_address: 'B' }), { recipient: 'A', phone: 'P', address: 'B' });
      const sh = s.sample_shipments[0]; sh.address_id = b.address_id;
      assert.deepEqual([R.addressActions(s, b).canDelete, R.addressActions(s, b).canArchive, R.addressActions(s, a).canArchive], [false, true, false]);
    });
    test('Pick list Mark all shipped keeps each shipment\'s address', () => {
      const s = fresh(), list = s.sample_shipments.filter(x => x.status === 'to_ship').slice(0, 2);
      list.forEach(sh => addrFor(s, s.deals.find(d => d.deal_id === sh.deal_id).kol_id, 'Primary', true));
      const pl = R.newPickList(s, list.map(x => x.shipment_id), { id: 'PK-0001', name: 'Test', user: 'U001', now: '2026-10-08T03:00:00Z' }); s.pick_lists.push(pl);
      let e = 0; R.markAllShipped(s, pl, { date: TD, carrier: 'Kerry', trackings: ['T1', 'T2'] }, { eventId: () => 500 + e++, now: '2026-10-08T03:00:00Z', user: 'U001' });
      assert.ok(list.every(sh => sh.status === 'shipped' && sh.address_id && R.addressById(s, sh.address_id).kol_id === s.deals.find(d => d.deal_id === sh.deal_id).kol_id));
    });
  });

  describe('CR-16 §4.4 · photos', () => {
    test('TC-16: JPG / PNG / WebP up to 5 MB · 8 MB → size · PDF → type', () => {
      assert.equal(R.photoProblem({ type: 'image/png', size: 3 * 1024 * 1024 }), null);
      assert.equal(R.photoProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 }), null);
      assert.equal(R.photoProblem({ type: 'image/webp', size: 8 * 1024 * 1024 }), 'size');
      assert.equal(R.photoProblem({ type: 'application/pdf', size: 1000 }), 'type');
      assert.equal(R.photoProblem({ type: 'image/gif', size: 1000 }), 'type');
      assert.deepEqual([R.PHOTO_SIZE, R.PHOTO_QUALITY], [256, 0.8]);
    });
    test('TC-14: the square crop — the middle by default · moved by pan · zoom takes a smaller square · never outside the picture', () => {
      assert.deepEqual(R.cropSquare(1200, 800, 0, 0, 1), { sx: 200, sy: 0, side: 800 });
      assert.deepEqual(R.cropSquare(1200, 800, -1, 0, 1), { sx: 0, sy: 0, side: 800 });
      assert.deepEqual(R.cropSquare(1200, 800, 1, 1, 1), { sx: 400, sy: 0, side: 800 });
      assert.deepEqual(R.cropSquare(1200, 800, 0, 0, 2), { sx: 400, sy: 200, side: 400 });
      assert.deepEqual(R.cropSquare(1200, 800, 5, -5, 2), { sx: 800, sy: 0, side: 400 });
      assert.deepEqual(R.cropSquare(600, 900, 0, 0, 0.5), { sx: 0, sy: 150, side: 600 }, 'zoom under 1 = 1');
    });
  });

  describe('CR-16 TC-18 · nothing readable', () => {
    test('an address and a second payee are only ciphertext in the state and the Backup', async () => {
      const v = await V.setup('test passphrase 0001', { iterations: FAST, now: '2026-10-08T03:00:00Z', user: 'U000' });
      const ls = fakeStorage(), st = S.createStore({ seed: SEED, storage: ls, now: () => new Date('2026-10-08T03:00:00Z') }), s = st.state;
      s.lookups.payee_vault = v;
      const ship = { recipient: 'Testa Recipient', phone: '0899999999', address: '77/7 Testville Road' };
      s.shipping_addresses.push(R.newAddress({ address_id: 'AD-0001', kol_id: 'K0011', label: 'ออฟฟิศ', is_default: true, secure: await V.encrypt(v, R.shipRecord(ship)) }));
      const p = R.blankPayee(s, { payee_id: 'PY-0001', kol_id: 'K0011', label: 'Agency ABC' });
      p.secure = await V.encrypt(v, R.bankRecord({ account_name: 'Testb Holder', bank_name: 'KBank', account_no: '9876543210', full_name: 'Testb Holder', id_address: '1 Test Lane' })); s.payee_profiles.push(p);
      st.save();
      const text = st.backup().text + ls.getItem(S.KEY);
      ['Testa Recipient', '0899999999', 'Testville', 'Testb Holder', '9876543210', 'Test Lane'].forEach(x => assert.ok(!text.includes(x), x));
      assert.ok(text.includes('ออฟฟิศ') && text.includes('Agency ABC'), 'the labels are readable');
      assert.ok(await V.unlock(v, 'test passphrase 0001'));
      assert.deepEqual(R.readShip(await V.decrypt(s.shipping_addresses[0].secure)), ship);
      V.lock();
    });
    test('Restore of a backup with photos: the pictures are handed back, never kept in the state', () => {
      const ls = fakeStorage(), st = S.createStore({ seed: SEED, storage: ls, now: () => new Date('2026-10-08T03:00:00Z') });
      const obj = JSON.parse(st.backup().text); obj.photos = { K0011: 'data:image/webp;base64,AAAA' };
      const p = st.previewRestore(JSON.stringify(obj)); assert.equal(p.photos, 1);
      const r = st.restore(JSON.stringify(obj), 'b.json');
      assert.deepEqual(r.photos, { K0011: 'data:image/webp;base64,AAAA' });
      assert.ok(!('photos' in st.state) && !ls.getItem(S.KEY).includes('base64'));
      assert.equal(st.restore(st.backup().text, 'c.json').photos, null, 'without photos: nothing to write back');
    });
  });
});
