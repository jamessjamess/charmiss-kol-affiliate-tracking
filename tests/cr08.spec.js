/* cr08.spec.js — CR-08 test cases (Payments module: tax, instalments, payee profiles, the encrypted Payee vault), run by tests/test.html.
   "today" is 06/10/2026. Every name, address and account number here is made up. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED, V } = t;
  const TD = '2026-10-06';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-06T03:00:00Z'));
  const FAKE = { account_name: 'Somchai Testdee', bank_name: 'KBank', account_no: '123-4-56789-0', full_name: 'Somchai Testdee', id_address: '99/9 Test Road, Bangkok 10000',
    phone: '0800000000', wht_contact: 'somchai.test@example.com', tax_id: '' };
  const FAST = 2000;   // PBKDF2 rounds in tests (the app uses 600,000)
  const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

  describe('CR-08 R1 · schema 8 · tax · instalments · payee profile · guard', () => {
    test('TC-01: schema 8 · payee_profiles / payment_lines / payment_runs empty · settings · vault not set up · money unchanged', () => {
      const s = fresh();
      assert.ok(s.schema_version >= 8, 'CR-09 moves on to 9');
      assert.deepEqual([s.payee_profiles, s.payment_lines, s.payment_runs], [[], [], []]);
      assert.deepEqual(s.lookups.payment_settings, { vat_rate: 7, wht_threshold: 1000, wht_rates: [0, 1, 2, 3, 5], default_wht_individual: 3, default_wht_company: 3, bands: [1000, 10000], run_weekday: 5 });
      assert.equal(s.lookups.payee_vault, null);
      const k = R.allKpis(s, ...R.dateRangePreset('this_year', TD), TD);
      assert.deepEqual([k.committed, k.pending, k.budget, k.remaining], [1783579, 98000, 2748400, 964821]);
      const x = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD);
      assert.deepEqual([x.paid, x.unpaid], [774579, 130]);
    });
    test('TC-02: a schema 7 Backup is migrated once — a reload changes nothing', () => {
      const v7 = JSON.parse(JSON.stringify(fresh()));
      v7.schema_version = 7; delete v7.payee_profiles; delete v7.payment_lines; delete v7.payment_runs; delete v7.lookups.payment_settings; delete v7.lookups.payee_vault;
      const store = memStorage(), now = () => new Date('2026-10-06T03:00:00Z');
      const st = S.createStore({ seed: SEED, storage: store, now });
      const r = st.restore(JSON.stringify(v7), 'kol_tracker_backup_v7.json');
      assert.deepEqual([r.ok, r.migratedFrom, r.scrubbed], [true, 7, 0]);
      const again = S.createStore({ seed: SEED, storage: store, now });
      assert.deepEqual([again.status.source, again.status.migratedFrom, again.state.schema_version], ['local', null, S.SCHEMA_VERSION]);
      assert.deepEqual([again.state.payee_profiles.length, again.state.payment_lines.length, again.state.payment_runs.length], [0, 0, 0]);
      assert.deepEqual(S.migrate(JSON.parse(JSON.stringify(again.state))).lookups.payment_settings, again.state.lookups.payment_settings);
    });
    test('TC-03 / §5.0: calcPaymentTax', () => {
      const tax = (agreed_amount, o) => { const x = R.calcPaymentTax(Object.assign({ agreed_amount, price_basis: 'gross', payee_type: 'individual', vat_registered: false, wht_rate: 3 }, o)); return [x.gross, x.vat, x.wht, x.net]; };
      assert.deepEqual(tax(800), [800, 0, 0, 800]);
      assert.deepEqual(tax(1500), [1500, 0, 45, 1455]);
      assert.deepEqual(tax(8500, { payee_type: 'company', vat_registered: true, wht_rate: 2 }), [8500, 595, 170, 8925]);
      assert.deepEqual(tax(1000, { price_basis: 'net' }), [1030.93, 0, 30.93, 1000]);
      assert.deepEqual(tax(2000, { price_basis: 'net' }), [2061.86, 0, 61.86, 2000]);
      assert.deepEqual(tax(1200, { price_basis: 'net' }), [1237.11, 0, 37.11, 1200]);
      assert.deepEqual(tax(900, { price_basis: 'net' }), [900, 0, 0, 900]);
      assert.equal(R.calcPaymentTax({ agreed_amount: 2000, payee_type: 'company' }).wht_rate, 3, 'empty rate = the default of the payee type');
      assert.deepEqual([R.round2(1.005), R.round2(2499.5), R.round2(-1.005)], [1.01, 2499.5, -1.01]);
      assert.deepEqual([999, 1000, 9999.99, 10000].map(g => R.bandOf(g)), [0, 1, 1, 2]);
    });
    test('TC-04: dueLines — split_50 4,999 → 2,500 / 2,499 · 5,000 → 2,500 / 2,500 · prepaid · postpaid · free · ฿0', () => {
      const s = fresh(), base = s.deals.find(d => d.deal_id === 'D000044');   // In process · Brief
      const at = (o, sub, status) => R.dueLines(s, Object.assign({}, base, { rate_card: 4999, gencode_expense: null, basket_fee: null, asset_fee: null, expediting_fee: null, paid_50: false, paid_full: false }, o, { sub_status: sub || base.sub_status, status: status || base.status }), TD);
      const brief = (x => x.map(l => [l.milestone, l.amount, l.reached]));
      assert.deepEqual(brief(at({ payment_term: 'split_50' })), [['deposit', 2500, true], ['final', 2499, false]]);
      assert.deepEqual(brief(at({ payment_term: 'split_50', rate_card: 5000 })), [['deposit', 2500, true], ['final', 2500, false]]);
      assert.deepEqual(brief(at({ payment_term: 'split_50' }, 'Contacted', 'List')), [['deposit', 2500, false], ['final', 2499, false]], 'not at Confirm QT yet');
      assert.deepEqual(brief(at({ payment_term: 'prepaid' })), [['full', 4999, true]]);
      assert.deepEqual(brief(at({ payment_term: 'postpaid' })), [['full', 4999, false]]);
      assert.deepEqual(brief(at({ payment_term: 'postpaid' }, 'Post', 'Complete')), [['full', 4999, true]]);
      assert.deepEqual(at({ payment_term: 'free' }), []);
      assert.deepEqual(at({ payment_term: 'postpaid', rate_card: null }, 'Post', 'Complete'), [], '฿0 deal: no instalment (Needs check)');
      const paidDep = at({ payment_term: 'split_50', paid_50: true, paid_50_date: '2026-09-05' });
      assert.deepEqual(paidDep.map(l => [l.milestone, l.paid, l.paid_date]), [['deposit', true, '2026-09-05'], ['final', false, null]]);
      assert.equal(at({ payment_term: null }, 'Post', 'Complete')[0].term_not_set, true);
    });
    test('§5.0: what is owed after the migration — 125 instalments · ฿826,950 · bands 9 / 103 / 13 · 5 ฿0 deals · WHT ฿24,619.50 · Net ฿802,330.50', () => {
      const s = fresh(), lines = s.deals.flatMap(d => R.dueLines(s, d, TD)).filter(l => l.reached && !l.paid);
      assert.equal(lines.length, 125);
      assert.equal(R.round2(lines.reduce((a, l) => a + l.amount, 0)), 826950);
      assert.ok(lines.every(l => l.term_not_set && l.milestone === 'full'));
      const band = b => lines.filter(l => R.bandOf(l.amount) === b);
      assert.deepEqual([0, 1, 2].map(b => [band(b).length, band(b).reduce((a, l) => a + l.amount, 0)]), [[9, 6300], [103, 402650], [13, 418000]]);
      const tx = lines.map(l => R.calcPaymentTax({ agreed_amount: l.amount, price_basis: 'gross', payee_type: 'individual', vat_registered: false }));
      assert.deepEqual([R.round2(tx.reduce((a, x) => a + x.wht, 0)), R.round2(tx.reduce((a, x) => a + x.net, 0))], [24619.5, 802330.5]);
      const by = f => { const m = {}; lines.forEach(l => { const d = s.deals.find(x => x.deal_id === l.deal_id), k = f(d); m[k] = (m[k] || 0) + 1; }); return m; };
      assert.deepEqual(by(d => d.pic), { Ja: 55, Pizza: 40, Amp: 18, Pang: 12 });
      assert.deepEqual(by(d => d.campaign_id), { CH: 59, KS: 48, PH: 18 });
      assert.equal(s.deals.filter(d => d.status === 'Complete' && !d.paid_full && R.totalCost(d) === 0 && R.termOf(d) !== 'free').length, 5);
    });
    test('TC-06: an account or ID number in a note / remark / reason cannot be saved', () => {
      ['123-4-56789-0', '1 2345 67890 12 3', 'โอนเข้า 1234567890 นะ', '1234567890123'].forEach(v => assert.equal(R.looksSensitive(v), true, v));
      ['Phase 1 · 2026', '฿5,000 + ฿1,000', '06/10/2026', 'https://www.tiktok.com/@a/video/7412345678901234567', 'โทรกลับ 081-234', '', null].forEach(v => assert.equal(R.looksSensitive(v), false, String(v)));
      const s = fresh(), k = Object.assign({}, s.kol_master[0], { note: 'บัญชี 123-4-56789-0', accounts: R.accountsOfKol(s, s.kol_master[0].kol_id) });
      assert.ok(R.validateKol(s, k).errs.some(e => e.field === 'note' && e.msg === C.msg.sensitive));
      const d = Object.assign({}, s.deals.find(x => x.deal_id === 'D000044'), { remark: 'เลขบัตร 1234567890123' });
      assert.ok(R.validateDeal(s, d, R.postsOf(s, 'D000044'), TD).errs.some(e => e.field === 'remark' && e.msg === C.msg.sensitive));
      assert.ok(R.checkMove(s, s.deals.find(x => x.deal_id === 'D000044'), 'Approve Draft 1', { date: TD, note: '1234567890' }).errs.some(e => e.field === 'note'));
      const st = fresh(); st.kol_master[0].note = '1234567890'; st.deals[0].remark = 'acc 123-4-56789-0'; st.deals[1].remark = 'ok';
      assert.equal(R.scrubSensitive(st), 2); assert.deepEqual([st.kol_master[0].note, st.deals[0].remark, st.deals[1].remark], [null, null, 'ok']);
      assert.equal(R.scrubSensitive(fresh()), 0, 'the seed has none');
    });
    test('TC-07: Individual with ID copy + Bank book dates + bank details → docs on file · "···7890"', () => {
      const s = fresh(), p = R.blankPayee(s, { payee_id: 'PY-0001', kol_id: 'K0011', user: 'U000', now: '2026-10-06T03:00:00Z' });
      assert.deepEqual([p.account_handle, p.payee_type, p.default_wht_rate, p.price_basis, p.secure], ['genygee28', 'individual', 3, 'gross', null]);
      assert.deepEqual(R.payeeDocsMissing(p), ['id_copy', 'bank_book', 'bank_details']);
      p.docs.id_copy = '2026-10-01'; p.docs.bank_book = '2026-10-01'; p.secure = { key_id: 'x', wrapped_key: 'x', iv: 'x', ciphertext: 'x' }; p.account_last4 = R.last4(FAKE.account_no);
      assert.deepEqual([R.payeeDocsMissing(p), p.account_last4], [[], '7890']);
      assert.equal(C.payee.bankLine('KBank', p.account_last4), 'KBank ···7890');
      const co = Object.assign({}, p, { payee_type: 'company', vat_registered: true });
      assert.deepEqual(R.payeeDocsMissing(co), ['company_cert', 'vat_cert']);
      assert.deepEqual(R.validateBankDetails(FAKE).errs, []);
      assert.deepEqual(R.validateBankDetails(Object.assign({}, FAKE, { account_no: '12-34', tax_id: '123' })).errs.map(e => e.field), ['b_account_no', 'b_tax_id']);
      assert.deepEqual(R.validatePayee(s, Object.assign({}, p, { docs_link: 'acc 1234567890' })).errs.map(e => e.field), ['docs_link']);
      assert.deepEqual(Object.keys(R.bankRecord(FAKE)), R.BANK_FIELDS);
    });
    test('who may change a payee: Admin / KOL Manager any · Staff only the KOLs they are PIC of (or payees they created) · Viewer none', () => {
      const s = fresh(), u = n => s.users.find(x => x.display_name === n), amp = u('Amp');
      const ampKol = s.kol_master.find(k => k.pic === 'Amp'), other = s.kol_master.find(k => k.pic === 'Ja');
      assert.equal(R.canEditPayee(s, u('Admin'), null, other), true);
      assert.equal(R.canEditPayee(s, amp, null, ampKol), true);
      assert.equal(R.canEditPayee(s, amp, null, other), false);
      assert.equal(R.canEditPayee(s, amp, { created_by: amp.user_id, kol_id: null }, null), true);
      assert.equal(R.canEditPayee(s, Object.assign({}, amp, { role: 'viewer' }), null, ampKol), false);
      assert.deepEqual(['payee.unlock', 'payee.verify', 'payee.import', 'payment.run', 'payment.paid', 'settings.payments'].map(a => R.can(amp, a)), [false, false, false, false, false, false]);
      assert.deepEqual(['vault.admin', 'payment.reopen'].map(a => R.can(Object.assign({}, amp, { role: 'kol_manager' }), a)), [false, false]);
      assert.deepEqual(['vault.admin', 'payment.reopen', 'payee.unlock'].map(a => R.can(u('Admin'), a)), [true, true, true]);
    });
    test('Settings › Payments: valid values are kept · wrong ones are named', () => {
      const ok = R.validatePaymentSettings({ vat_rate: '7', wht_threshold: '1000', wht_rates: '0, 1, 2, 3, 5', default_wht_individual: '3', default_wht_company: '3', band1: '1000', band2: '10000', run_weekday: '5' });
      assert.deepEqual([ok.errs, ok.value], [[], R.PAYMENT_SETTINGS_DEFAULT]);
      const bad = R.validatePaymentSettings({ vat_rate: '120', wht_threshold: '-1', wht_rates: '1, x', default_wht_individual: '3', default_wht_company: '1', band1: '5000', band2: '1000', run_weekday: '9' });
      assert.deepEqual(bad.errs.map(e => e.field), ['vat_rate', 'wht_threshold', 'wht_rates', 'default_wht_individual', 'bands', 'run_weekday'], 'company default 1 is among the rates given');
    });
  });

  describe('CR-08 R1 · Payee vault (encrypted in the browser)', () => {
    const setUp = () => V.setup('test passphrase 0001', { iterations: FAST, now: '2026-10-06T03:00:00Z', user: 'U000' });
    test('TC-31: Set up keeps the public key and the wrapped private key — never the passphrase · 600,000 rounds by default', async () => {
      const v = await setUp();
      assert.deepEqual(Object.keys(v).sort(), ['created_at', 'created_by', 'iterations', 'iv', 'key_id', 'passphrase_changed_at', 'public_key_jwk', 'salt', 'wrapped_private_key']);
      assert.equal(v.public_key_jwk.kty, 'RSA'); assert.ok(!('d' in v.public_key_jwk), 'no private part in the JWK');
      assert.ok(!JSON.stringify(v).includes('test passphrase 0001'));
      assert.equal(V.ITERATIONS, 600000);
    });
    test('TC-32: saving needs no passphrase — secure is ciphertext with none of the values in it', async () => {
      V.lock();
      const v = await setUp(), sec = await V.encrypt(v, R.bankRecord(FAKE)), json = JSON.stringify(sec);
      assert.deepEqual(Object.keys(sec).sort(), ['ciphertext', 'iv', 'key_id', 'wrapped_key']);
      ['Somchai', '123-4-56789-0', '1234567890', '0800000000', 'Test Road', 'example.com'].forEach(x => assert.ok(!json.includes(x), x));
      assert.equal(await V.decrypt(sec), null, 'locked: nothing to read');
    });
    test('TC-33: Unlock with the right passphrase reads every field · a wrong one changes nothing', async () => {
      V.lock();
      const v = await setUp(), sec = await V.encrypt(v, R.bankRecord(FAKE));
      assert.equal(await V.unlock(v, 'wrong passphrase 999'), false);
      assert.equal(V.isUnlocked(v), false);
      assert.equal(await V.unlock(v, 'test passphrase 0001'), true);
      assert.deepEqual(await V.decrypt(sec), R.bankRecord(FAKE));
      V.lock();
    });
    test('TC-34: 15 minutes without use locks it (Lock and a reload do too)', async () => {
      const v = await setUp();
      assert.equal(await V.unlock(v, 'test passphrase 0001'), true);
      const t0 = performance.now();
      V.idleCheck(t0 + V.IDLE_MS - 60000); assert.equal(V.isUnlocked(v), true, '14 minutes');
      V.idleCheck(t0 + V.IDLE_MS + 1000); assert.equal(V.isUnlocked(v), false, '15 minutes');
      await V.unlock(v, 'test passphrase 0001'); V.lock(); assert.equal(V.isUnlocked(v), false);
    });
    test('TC-35: Change passphrase — the new one opens the same records, the old one no longer does · a copy of the data (Backup) opens too', async () => {
      V.lock();
      const v = await setUp(), sec = await V.encrypt(v, R.bankRecord(FAKE));
      assert.equal(await V.changePassphrase(v, 'not it at all 00', 'new passphrase 2026'), null);
      const v2 = await V.changePassphrase(v, 'test passphrase 0001', 'new passphrase 2026', { now: '2026-10-07T03:00:00Z' });
      assert.deepEqual([v2.key_id, v2.public_key_jwk.n === v.public_key_jwk.n, v2.passphrase_changed_at], [v.key_id, true, '2026-10-07T03:00:00Z']);
      assert.equal(await V.unlock(v2, 'test passphrase 0001'), false);
      const copy = JSON.parse(JSON.stringify({ vault: v2, secure: sec }));   // what a Backup carries to another browser
      assert.equal(await V.unlock(copy.vault, 'new passphrase 2026'), true);
      assert.deepEqual(await V.decrypt(copy.secure), R.bankRecord(FAKE));
      V.lock();
    });
    test('TC-36: payee-details CSV — 2 handles match KOLs · 1 is a new payee · each row encrypted · no plain text in the state', async () => {
      V.lock();
      const s = fresh(), v = await setUp(), head = R.PAYEE_CSV_COLS;
      const row = (h, no) => head.map(c => ({ account_handle: h, payee_type: 'individual', full_name: 'Test Person ' + no, id_address: 'Test address ' + no, phone: '0800000000', wht_contact: 'test@example.com',
        bank_name: 'KBank', account_name: 'Test Person ' + no, account_no: '000-0-0000' + no, tax_id: '', docs_link: '' }[c]));
      const plan = R.planPayeeImport(s, [head, row('@genygee28', '1'), row('Sundayary', '2'), row('affiliate_test_x', '3')]);
      assert.deepEqual(plan.rows.map(r => [r.kind, r.kol ? r.kol.display_name : null, r.has_details]), [['match', 'genygee28', false], ['match', 'sundayary', false], ['new', null, false]]);
      let id = 0;
      for (const r of plan.rows) {
        const p = r.payee || R.blankPayee(s, { payee_id: 'PY-000' + (++id), kol_id: r.kol ? r.kol.kol_id : null, account_handle: r.handle, user: 'U000' });
        if (!r.payee) s.payee_profiles.push(p);
        p.secure = await V.encrypt(v, r.details); p.bank_name = r.details.bank_name; p.account_last4 = R.last4(r.details.account_no);
      }
      assert.equal(s.payee_profiles.filter(p => p.secure).length, 3);
      assert.deepEqual(s.payee_profiles.map(p => [p.kol_id, p.account_handle, p.account_last4]), [['K0011', 'genygee28', '0001'], ['K0233', 'sundayary', '0002'], [null, 'affiliate_test_x', '0003']]);
      const json = JSON.stringify(s);
      ['Test Person', 'Test address', '000-0-0000', 'test@example.com'].forEach(x => assert.ok(!json.includes(x), x));
      assert.equal(R.planPayeeImport(s, [['account_handle']]).headerError, C.msg.importHeader('account_no'));
      assert.ok(R.planPayeeImport(s, [head, row('genygee28', '1'), row('GENYGEE28', '9')]).rows[1].errs.includes(C.msg.payeeImportDup));
    });
  });

  describe('CR-08 R2 · To pay · Request payment · Deal drawer', () => {
    const DUE = ['ready', 'missing_docs', 'in_run', 'submitted'];
    const due = (s, f) => R.payQueue(s, TD).items.filter(x => DUE.includes(x.status) && (!f || f(x)));
    const gross = list => R.round2(list.reduce((a, x) => a + x.tax.gross, 0));
    const withPayee = (s, kolId, o) => { const p = R.blankPayee(s, { payee_id: 'PY-' + kolId, kol_id: kolId }); Object.assign(p, { secure: { key_id: 'k', wrapped_key: 'w', iv: 'i', ciphertext: 'c' }, bank_name: 'KBank', account_last4: '7890', docs: { id_copy: TD, bank_book: TD, company_cert: null, vat_cert: null } }, o || {}); s.payee_profiles.push(p); return p; };
    test('TC-09 / §5.0: To pay after the migration — 125 lines · ฿826,950.00 · all Missing docs · Ready 0 · Needs check 5 (฿0 deals) · bands · PIC · Campaign', () => {
      const s = fresh(), q = R.payQueue(s, TD), c = R.payCards(q.items, q.checks, TD), list = due(s);
      assert.deepEqual([list.length, gross(list)], [125, 826950]);
      assert.deepEqual([c.ready.n, c.missing.n, c.missing.gross, c.check.n], [0, 125, 826950, 5]);
      assert.ok(list.every(x => x.status === 'missing_docs' && x.term_not_set && x.missing.includes('bank_details')));
      assert.deepEqual(q.checks.map(x => x.kind), ['zero', 'zero', 'zero', 'zero', 'zero']);
      assert.deepEqual([0, 1, 2].map(b => { const l = list.filter(x => x.band === b); return [l.length, gross(l)]; }), [[9, 6300], [103, 402650], [13, 418000]]);
      const by = k => list.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
      assert.deepEqual(by('pic'), { Ja: 55, Pizza: 40, Amp: 18, Pang: 12 });
      assert.deepEqual(by('campaign_id'), { CH: 59, KS: 48, PH: 18 });
      assert.deepEqual([R.round2(list.reduce((a, x) => a + x.tax.wht, 0)), R.round2(list.reduce((a, x) => a + x.tax.net, 0))], [24619.5, 802330.5]);
      assert.ok(list.every(x => x.virtual), 'nothing is stored until someone requests it');
    });
    test('TC-10: Amp (Staff) — her own lines: 18', () => { assert.equal(due(fresh(), x => x.pic === 'Amp').length, 18); });
    test('TC-11: a payee with documents on file → Ready · a post without a link → "Missing: Post evidence"', () => {
      const s = fresh(), x0 = due(s)[0], kolId = x0.kol_id;
      withPayee(s, kolId);
      const x1 = due(s).find(x => x.key === x0.key);
      assert.deepEqual([x1.status, x1.missing], ['ready', []]);
      s.deal_posts.find(p => p.deal_id === x0.deal_id).post_link = null;
      const x2 = due(s).find(x => x.key === x0.key);
      assert.deepEqual([x2.status, x2.missing], ['missing_docs', ['post_evidence']]);
      const co = R.payeeOfKol(s, kolId); co.payee_type = 'company'; co.vat_registered = true;
      assert.deepEqual(R.docsRequired(s, Object.assign({}, x2), co), ['company_cert', 'vat_cert', 'post_evidence']);
      assert.deepEqual(R.payeeDocsMissing(null), ['id_copy', 'bank_book', 'bank_details']);
    });
    test('TC-12: Deal drawer › Payment of a Complete deal not paid — one Full instalment, Missing docs, nothing stored yet', () => {
      const s = fresh(), d = s.deals.find(x => x.status === 'Complete' && !x.paid_full && R.totalCost(x) > 0);
      const items = R.dealPayItems(s, d, TD);
      assert.deepEqual(items.map(x => [x.milestone, x.tax.gross, x.status, x.virtual]), [['full', R.totalCost(d), 'missing_docs', true]]);
      const paid = s.deals.find(x => x.paid_full && R.totalCost(x) > 0);
      assert.deepEqual(R.dealPayItems(s, paid, TD).map(x => x.status), ['paid'], 'paid before Payments existed (its flag)');
    });
    test('TC-13: Staff request payment only on deals they are PIC of · Viewer never', () => {
      const s = fresh(), u = n => s.users.find(x => x.display_name === n), mine = s.deals.find(d => d.pic === 'Amp'), other = s.deals.find(d => d.pic === 'Ja');
      assert.deepEqual([R.canRequest(s, u('Amp'), mine), R.canRequest(s, u('Amp'), other), R.canRequest(s, u('Admin'), other)], [true, false, true]);
      assert.equal(R.canRequest(s, Object.assign({}, u('Amp'), { role: 'viewer' }), mine), false);
    });
    test('TC-37: two instalments of one KOL (Deposit + Final) use the one payee — bank details once · Request payment has no bank fields', () => {
      const s = fresh(), d = s.deals.find(x => x.status === 'Complete' && !x.paid_full && R.totalCost(x) > 0);
      d.payment_term = 'split_50'; d.paid_50 = false;
      withPayee(s, d.kol_id);
      const items = R.dealPayItems(s, d, TD);
      assert.deepEqual(items.map(x => [x.milestone, x.status, x.missing]), [['deposit', 'ready', []], ['final', 'ready', []]]);
      const line = R.newLine(s, items[0], { lineId: 'PL-000001', agreed_amount: items[0].agreed, price_basis: 'gross', wht_rate: 3, user: 'U000', now: '2026-10-06T03:00:00Z' });
      assert.equal(line.payee_id, 'PY-' + d.kol_id);
      ['account_no', 'account_name', 'full_name', 'id_address', 'phone', 'bank_name', 'secure'].forEach(k => assert.ok(!(k in line), k));
      assert.deepEqual([line.status, line.gross, line.wht, line.net], ['open', items[0].agreed, R.round2(items[0].agreed * 0.03), R.round2(items[0].agreed * 0.97)]);
      s.payment_lines.push(line);
      const after = R.dealPayItems(s, d, TD);
      assert.deepEqual(after.map(x => [x.milestone, x.virtual, x.status]), [['deposit', false, 'ready'], ['final', true, 'ready']]);
      assert.equal(R.payQueue(s, TD).items.filter(x => x.deal_id === d.deal_id).length, 2, 'a stored line replaces its worked-out instalment');
    });
    test('Request payment: amount > 0 · basis · a WHT rate from the list · reimburse names the person · no account numbers in the note', () => {
      const s = fresh(), ok = { agreed_amount: '1500', price_basis: 'gross', wht_rate: '3', pay_to: 'payee', note: '' };
      assert.deepEqual(R.validateRequest(s, ok).errs, []);
      assert.deepEqual(R.validateRequest(s, Object.assign({}, ok, { agreed_amount: '0', wht_rate: '4', pay_to: 'reimburse', note: 'acc 1234567890' })).errs.map(e => e.field), ['agreed_amount', 'wht_rate', 'reimburse_user', 'note']);
      const net = R.taxOf(s, { agreed_amount: 1000, price_basis: 'net', wht_rate: 3 }, null);
      assert.deepEqual([net.gross, net.wht, net.net], [1030.93, 30.93, 1000]);
    });
  });

  describe('CR-08 R3 · payment runs · checks · Mark paid · Export PR · verify · reset', () => {
    const { X } = t;
    const ctxFor = s => { let e = 0; return { lineId: () => 'PL-' + String((s.payment_lines.length + 1)).padStart(6, '0'), eventId: () => 9000 + e++, now: '2026-10-06T03:00:00Z', user: 'U000' }; };
    const payeeFor = (s, kolId, o) => { const p = R.blankPayee(s, { payee_id: 'PY-' + kolId, kol_id: kolId }); Object.assign(p, { secure: { key_id: 'k', wrapped_key: 'w', iv: 'i', ciphertext: 'c' }, bank_name: 'KBank', account_last4: '7890', details_version: 1,
      docs: { id_copy: TD, bank_book: TD, company_cert: null, vat_cert: null }, docs_link: 'https://drive.google.com/drive/folders/test' }, o || {}); s.payee_profiles.push(p); return p; };
    /* the seed: 125 instalments owed; give the first n KOLs a payee so their lines are Ready */
    const setUp = n => {
      const s = fresh(), items = R.payQueue(s, TD).items.filter(x => x.status === 'missing_docs' && !x.missing.includes('post_evidence'));
      const ready = items.slice(0, n); ready.forEach(x => { if (!R.payeeOfKol(s, x.kol_id)) payeeFor(s, x.kol_id); });
      const run = R.newRun(s, { pay_date: R.nextRunDate(TD, 5), user: 'U001', now: '2026-10-06T03:00:00Z' }); s.payment_runs.push(run);
      const fresh2 = R.payQueue(s, TD).items; return { s, run, ready: ready.map(x => fresh2.find(y => y.key === x.key)), missing: fresh2.filter(x => x.status === 'missing_docs' && !ready.some(r => r.kol_id === x.kol_id)) };
    };
    test('TC-14: New run — PR-2026-10-09 (the next Friday) · prepared by the user · Draft · a second run that day gets -2', () => {
      const { s, run } = setUp(0);
      assert.deepEqual([run.run_id, run.pay_date, run.prepared_by, run.status], ['PR-2026-10-09', '2026-10-09', 'U001', 'draft']);
      assert.equal(R.runIdFor(s, '2026-10-09'), 'PR-2026-10-09-2');
      assert.deepEqual([R.nextRunDate('2026-10-09', 5), R.nextRunDate('2026-10-06', 1)], ['2026-10-16', '2026-10-12']);
    });
    test('TC-15: 3 Ready + 1 Missing docs → no Submit (the ✕ names that line) · removed → Submit · docs_done on the deals', () => {
      const { s, run, ready, missing } = setUp(3), ctx = ctxFor(s);
      assert.ok(ready.every(x => x.status === 'ready'));
      R.addToRun(s, run, ready.concat([missing[0]]), ctx);
      const lines = R.runLines(s, run.run_id), bad = lines.find(l => l.deal_id === missing[0].deal_id);
      assert.deepEqual(lines.map(l => l.status), ['in_run', 'in_run', 'in_run', 'in_run']);
      const chk = R.runChecks(s, run, TD);
      assert.deepEqual(chk.errs.map(e => e.line_id), [bad.line_id]);
      assert.equal(R.submitRun(s, run, TD, ctx), null);
      R.removeFromRun(s, bad, ctx);
      assert.deepEqual([bad.status, bad.run_id], ['open', null]);
      const ev = R.submitRun(s, run, TD, ctx);
      assert.ok(ev && ev.length === 3);
      assert.deepEqual([run.status, R.runLines(s, run.run_id).map(l => [l.status, l.payee_version_at_submit])], ['submitted', [['submitted', 1], ['submitted', 1], ['submitted', 1]]]);
      const d = s.deals.find(x => x.deal_id === ready[0].deal_id); assert.deepEqual([d.docs_done, d.docs_done_date || TD], [true, d.docs_done_date || TD]);
    });
    test('TC-16: the same instalment in a second run → ✕ duplicate in that run', () => {
      const { s, run, ready } = setUp(1), ctx = ctxFor(s);
      R.addToRun(s, run, ready, ctx);
      const run2 = R.newRun(s, { pay_date: '2026-10-16', user: 'U000' }); s.payment_runs.push(run2);
      const again = R.payQueue(s, TD).items.find(x => x.deal_id === ready[0].deal_id);
      R.addToRun(s, run2, [again], ctx);
      assert.equal(R.runChecks(s, run, TD).errs.length, 1, 'the first run sees it too');
      assert.ok(R.runChecks(s, run2, TD).errs[0].msg.includes(run.run_id));
    });
    test('TC-17: Export PR without payee details — PR_09_10_26.xlsx · a sheet per band with lines + Summary · six personal columns empty · totals = the run', () => {
      const { s, run, ready } = setUp(3), ctx = ctxFor(s); R.addToRun(s, run, ready, ctx);
      const sheets = R.prSheets(s, run, null), t = R.runTotals(R.runLines(s, run.run_id));
      assert.equal(R.prFileName(run.pay_date), 'PR_09_10_26.xlsx');
      assert.deepEqual(sheets.map(x => x.name.replace(/ \d{6}$/, '')).slice(-1), ['Summary']);
      assert.ok(sheets.slice(0, -1).every(x => /^ยอด/.test(x.name) && x.name.endsWith('091026')));
      const rows = sheets.slice(0, -1).flatMap(x => x.rows.slice(1, -1));
      assert.equal(rows.length, 3);
      rows.forEach(r => [4, 5, 6, 7, 9, 10].forEach(c => assert.equal(r[c], '')));
      assert.equal(R.round2(rows.reduce((a, r) => a + r[11].v, 0)), t.gross);
      assert.equal(R.round2(rows.reduce((a, r) => a + r[15].v, 0)), t.net);
      const last = sheets[0].rows[sheets[0].rows.length - 1];
      assert.deepEqual([last[11].v, last[15].v], [`SUM(L2:L${sheets[0].rows.length - 1})`, `SUM(P2:P${sheets[0].rows.length - 1})`]);
      assert.ok(sheets[sheets.length - 1].rows.some(r => r[0] && r[0].v === C.pay.prSummary.noPayee));
      assert.deepEqual(C.pay.prCols.length, 21);
    });
    test('TC-18: unlocked — the six columns come from the decrypted details · Link = docs folder + post links', () => {
      const { s, run, ready } = setUp(1), ctx = ctxFor(s); R.addToRun(s, run, ready, ctx);
      const p = R.payeeOfKol(s, ready[0].kol_id), rec = { full_name: 'Test Person', id_address: 'Test address', phone: '0800000000', wht_contact: 'test@example.com', bank_name: 'KBank', account_no: '000-0-00001' };
      const row = R.prSheets(s, run, new Map([[p.payee_id, rec]]))[0].rows[1];
      assert.deepEqual([4, 5, 6, 7, 9, 10].map(c => row[c]), ['Test Person', 'Test address', '0800000000', 'test@example.com', 'KBank', '000-0-00001']);
      assert.ok(row[16].startsWith('https://drive.google.com/drive/folders/test\n') && row[16].includes('tiktok'));
      assert.deepEqual([row[3], row[8].v, row[18].v, row[19], row[20]], ['KOL', false, false, p.payee_id, R.runLines(s, run.run_id)[0].line_id]);
    });
    test('TC-19: Mark paid 09/10/2026 — lines Paid · deals paid_full with the date · Unpaid −3 · Paid (est.) + their totals · the run is Paid', () => {
      const { s, run, ready } = setUp(3), ctx = ctxFor(s); R.addToRun(s, run, ready, ctx); R.submitRun(s, run, TD, ctx);
      const before = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD);
      R.markPaid(s, run, null, '2026-10-09', ctx);
      assert.ok(R.runLines(s, run.run_id).every(l => l.status === 'paid' && l.paid_date === '2026-10-09'));
      ready.forEach(x => { const d = s.deals.find(y => y.deal_id === x.deal_id); assert.deepEqual([d.paid_full, d.paid_full_date], [true, '2026-10-09']); });
      const after = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD), sum = R.round2(ready.reduce((a, x) => a + x.agreed, 0));
      assert.deepEqual([before.unpaid - after.unpaid, after.paid - before.paid], [3, sum]);
      assert.equal(run.status, 'paid');
    });
    test('TC-20: Admin undoes Paid on one line (reason) → its deal is unpaid again · a deal_events "payment" row', () => {
      const { s, run, ready } = setUp(2), ctx = ctxFor(s); R.addToRun(s, run, ready, ctx); R.submitRun(s, run, TD, ctx); R.markPaid(s, run, null, '2026-10-09', ctx);
      const l = R.runLines(s, run.run_id)[0], ev = R.undoPaid(s, l, 'โอนผิดวัน', ctx), d = s.deals.find(x => x.deal_id === l.deal_id);
      assert.deepEqual([l.status, l.paid_date, d.paid_full, d.paid_full_date, run.status], ['submitted', null, false, null, 'submitted']);
      assert.deepEqual([ev[0].type, ev[0].from, ev[0].to, ev[0].note, ev[0].deal_id], ['payment', 'paid', 'submitted', 'โอนผิดวัน', l.deal_id]);
      const split = Object.assign({}, d, { payment_term: 'split_50', paid_50: false, paid_full: false });
      assert.deepEqual(['paid_50', 'paid_full'].map(k => R.syncDealPayment(split, [{ deal_id: d.deal_id, milestone: 'final', status: 'paid', paid_date: '2026-10-09' }])[k]), [true, true], '50/50: Final paid → both');
    });
    test('TC-21: net basis 1,000 → Gross 1,030.93 · i "WHT borne by company 30.93"', () => {
      const { s, run, ready } = setUp(1), ctx = ctxFor(s);
      const line = R.newLine(s, ready[0], { lineId: 'PL-000099', agreed_amount: 1000, price_basis: 'net', wht_rate: 3, user: 'U000', now: TD });
      line.run_id = run.run_id; line.status = 'in_run'; s.payment_lines.push(line);
      assert.deepEqual([line.gross, line.wht, line.net], [1030.93, 30.93, 1000]);
      assert.ok(R.runChecks(s, run, TD).infos.some(i => i.msg.includes('30.93')));
      assert.equal(R.runTotals([line]).borne, 30.93);
      assert.ok(R.runChecks(s, run, TD).warns.some(w => w.line_id === line.line_id && /differs/.test(w.msg)), 'its amount differs from the deal');
    });
    test('TC-22: a line of 10,000 and above sits in that band with ! Accounting to confirm', () => {
      const { s, run } = setUp(0), ctx = ctxFor(s), big = R.payQueue(s, TD).items.find(x => x.tax.gross >= 10000);
      payeeFor(s, big.kol_id); R.addToRun(s, run, [R.payQueue(s, TD).items.find(x => x.key === big.key)], ctx);
      const l = R.runLines(s, run.run_id)[0];
      assert.equal(R.bandOf(l.gross), 2);
      assert.ok(R.runChecks(s, run, TD).warns.some(w => w.msg === C.msg.runBig(l.account_handle)));
      assert.ok(R.prSheets(s, run, null)[0].name.startsWith('ยอด 10,000 ขึ้นไป'));
    });
    test('TC-39: bank details replaced after a paid line → ✕ verify · Mark as verified → Submit', () => {
      const { s, run, ready } = setUp(1), ctx = ctxFor(s);
      R.addToRun(s, run, ready, ctx); R.submitRun(s, run, TD, ctx); R.markPaid(s, run, null, '2026-10-09', ctx);
      const p = R.payeeOfKol(s, ready[0].kol_id);
      assert.equal(R.payeeHasPaid(s, p.payee_id), true);
      Object.assign(p, { details_version: 2, needs_verification: true });   // what the Payee dialog does on Replace
      const d = s.deals.find(x => x.deal_id === ready[0].deal_id); d.payment_term = 'split_50';
      const run2 = R.newRun(s, { pay_date: '2026-10-16', user: 'U000' }); s.payment_runs.push(run2);
      const l2 = R.newLine(s, Object.assign({}, ready[0], { milestone: 'deposit' }), { lineId: 'PL-000098', agreed_amount: 100, price_basis: 'gross', wht_rate: 3 });
      Object.assign(l2, { run_id: run2.run_id, status: 'in_run' }); s.payment_lines.push(l2);
      assert.ok(R.runChecks(s, run2, TD).errs.some(e => e.verify && e.msg === C.msg.runVerify(l2.account_handle)));
      Object.assign(p, { needs_verification: false, verified_by: 'U000' });
      assert.ok(!R.runChecks(s, run2, TD).errs.some(e => e.verify));
    });
    test('TC-40: bank details changed after Submit → ! re-export PR', () => {
      const { s, run, ready } = setUp(1), ctx = ctxFor(s); R.addToRun(s, run, ready, ctx); R.submitRun(s, run, TD, ctx);
      R.payeeOfKol(s, ready[0].kol_id).details_version = 2;
      assert.ok(R.runChecks(s, run, TD).warns.some(w => w.msg === C.msg.runChangedAfter(ready[0].account_handle)));
    });
    test('TC-41: Reset vault — every payee loses its bank details (bank name, last 4, documents stay) · the vault is gone', () => {
      const { s } = setUp(3); s.lookups.payee_vault = { key_id: 'VK-x' };
      const n = R.resetVault(s);
      assert.equal(n, 3); assert.equal(s.lookups.payee_vault, null);
      assert.ok(s.payee_profiles.every(p => p.secure === null && p.account_last4 === '7890' && p.docs.id_copy === TD));
      assert.ok(R.payQueue(s, TD).items.filter(x => x.status !== 'not_due').every(x => x.missing.includes('bank_details')));
    });
    test('xlsx writer: a stored zip with the right CRCs · sheet names cleaned · formulas and TRUE / FALSE', () => {
      const bytes = X.workbook([{ name: 'ยอด 1,000-9,999 091026', rows: [['No.', 'Amount'], [1, { v: 1234.5, money: true }], ['', { v: 'SUM(B2:B2)', t: 'f' }], [{ v: true, t: 'b' }]] }, { name: 'a/b?c', rows: [['x']] }]);
      const dv = new DataView(bytes.buffer), td = new TextDecoder();
      assert.equal(dv.getUint32(0, true), 0x04034b50);
      const files = []; let p = 0;
      while (dv.getUint32(p, true) === 0x04034b50) {
        const crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true);
        const name = td.decode(bytes.subarray(p + 30, p + 30 + nlen)), data = bytes.subarray(p + 30 + nlen, p + 30 + nlen + size);
        assert.equal(X.crc32(data), crc, name); files.push([name, td.decode(data)]); p += 30 + nlen + size;
      }
      assert.deepEqual(files.map(f => f[0]), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
      const wb = files[2][1], sh = files[5][1];
      assert.ok(wb.includes('name="ยอด 1,000-9,999 091026"') && wb.includes('name="a b c"'));
      assert.ok(sh.includes('<c r="B2" s="2"><v>1234.5</v></c>') && sh.includes('<f>SUM(B2:B2)</f>') && sh.includes('<c r="A4" t="b"><v>1</v></c>'));
      assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
      assert.deepEqual([X.colName(0), X.colName(25), X.colName(26), X.colName(20)], ['A', 'Z', 'AA', 'U']);
    });
  });

  describe('CR-08 R4 · History · WHT certificates · manual lines · outside the app · cancel · permissions', () => {
    const ctxFor = s => { let e = 0; return { lineId: () => 'PL-' + String((s.payment_lines.length + 1)).padStart(6, '0'), eventId: () => 9000 + e++, now: '2026-10-06T03:00:00Z', user: 'U000' }; };
    const payeeFor = (s, kolId, o) => { const p = R.blankPayee(s, Object.assign({ payee_id: 'PY-' + (kolId || 'X' + s.payee_profiles.length), kol_id: kolId, account_handle: 'aff_test' }, o || {}));
      Object.assign(p, { secure: { key_id: 'k', wrapped_key: 'w', iv: 'i', ciphertext: 'c' }, bank_name: 'KBank', account_last4: '7890', details_version: 1, docs: { id_copy: TD, bank_book: TD, company_cert: null, vat_cert: null } }); s.payee_profiles.push(p); return p; };
    /* n Ready lines in a run, submitted and paid on 09/10/2026 */
    const paidRun = n => {
      const s = fresh(), ctx = ctxFor(s), items = R.payQueue(s, TD).items.filter(x => x.status === 'missing_docs' && !x.missing.includes('post_evidence')).slice(0, n);
      items.forEach(x => { if (!R.payeeOfKol(s, x.kol_id)) payeeFor(s, x.kol_id); });
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U000' }); s.payment_runs.push(run);
      const fresh2 = R.payQueue(s, TD).items; R.addToRun(s, run, items.map(x => fresh2.find(y => y.key === x.key)), ctx); R.submitRun(s, run, TD, ctx); R.markPaid(s, run, null, '2026-10-09', ctx);
      return { s, run, ctx };
    };
    const manual = (s, o) => Object.assign({ source: 'affiliate', payee_id: '', campaign_id: 'CH', project_label: '', agreed_amount: 1800, price_basis: 'gross', wht_rate: '3', due_date: TD, pay_to: 'payee', reimburse_user: '', note: '' }, o || {});
    test('TC-23: Mark WHT cert sent on 2 lines → they leave "WHT cert not sent" · a line with WHT 0 is never in it', () => {
      const { s } = paidRun(4), paid = R.paidLines(s);
      paid[3].wht = 0; paid[3].wht_rate = 0;
      const before = R.whtNotSent(paid);
      assert.equal(before.length, 3);
      assert.ok(!before.includes(paid[3]));
      R.markWhtSent(before.slice(0, 2), '2026-10-10');
      assert.deepEqual(R.whtNotSent(R.paidLines(s)).map(l => l.line_id), [before[2].line_id]);
      assert.deepEqual(before.slice(0, 2).map(l => l.wht_cert_sent_date), ['2026-10-10', '2026-10-10']);
      R.markWhtSent([paid[3]], '2026-10-10'); assert.equal(paid[3].wht_cert_sent_date, null, 'no certificate when nothing was withheld');
    });
    test('TC-24: WHT summary — one row a month per payee and rate · its columns only (no real name, address or account number)', () => {
      const { s } = paidRun(3), rows = R.whtSummary(s, R.paidLines(s));
      assert.deepEqual(R.WHT_SUMMARY_COLS, ['month', 'payee_type', 'payee_id', 'account_handle', 'gross', 'wht_rate', 'wht']);
      assert.ok(rows.length === 3 && rows.every(r => r.month === '2026-10' && Object.keys(r).join() === R.WHT_SUMMARY_COLS.join()));
      assert.equal(R.round2(rows.reduce((a, r) => a + r.wht, 0)), R.round2(R.paidLines(s).reduce((a, l) => a + l.wht, 0)));
      const text = JSON.stringify(rows);
      ['Somchai', 'Test Road', '123-4-56789-0', '7890'].forEach(x => assert.ok(!text.includes(x), x));
    });
    test('TC-25: manual line Affiliate 1,800 · 3% → Gross 1,800 · WHT 54 · Net 1,746 · Type AFF in the PR · Committed of the Campaign unchanged', () => {
      const s = fresh(), ctx = ctxFor(s), p = payeeFor(s, null);
      const before = R.dealTiles(s, s.deals, s.phases.map(x => x.phase_id), TD);
      const o = manual(s, { payee_id: p.payee_id });
      assert.deepEqual(R.validateManual(s, o).errs, []);
      assert.ok(R.validateManual(s, manual(s, { payee_id: '' })).errs.some(e => e.field === 'payee_id'));
      assert.ok(R.validateManual(s, manual(s, { payee_id: p.payee_id, campaign_id: '', project_label: '' })).errs.some(e => e.field === 'project_label'));
      assert.ok(R.validateManual(s, manual(s, { payee_id: p.payee_id, source: 'deal' })).errs.some(e => e.field === 'source'));
      const l = R.newManualLine(s, Object.assign(o, { lineId: ctx.lineId(), user: 'U001', now: TD })); s.payment_lines.push(l);
      assert.deepEqual([l.source, l.deal_id, l.milestone, l.gross, l.wht, l.net, l.account_handle, l.project_label], ['affiliate', null, 'manual', 1800, 54, 1746, 'aff_test', 'Charming Iconic Glow']);
      const it = R.payItem(s, TD, { line: l });
      assert.deepEqual([it.status, it.pic], ['ready', 'Amp'], 'the person who added it is its PIC');
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U000' }); s.payment_runs.push(run); R.addToRun(s, run, [it], ctx);
      assert.equal(R.prSheets(s, run, null)[0].rows[1][3], 'AFF');
      const after = R.dealTiles(s, s.deals, s.phases.map(x => x.phase_id), TD);
      assert.deepEqual([after.committed, after.unpaid, after.paid], [before.committed, before.unpaid, before.paid]);
      assert.deepEqual([before.committed, before.unpaid], [1783579, 130]);
    });
    test('TC-26: Pay to = Reimburse staff (Dream) → the PR Link says "Reimburse: Dream" · Paid syncs the deal as usual', () => {
      const s = fresh(), ctx = ctxFor(s), x = R.payQueue(s, TD).items.find(i => i.status === 'missing_docs' && !i.missing.includes('post_evidence'));
      const l = R.newLine(s, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: 'gross', wht_rate: 3, pay_to: 'reimburse', reimburse_user: 'U003', user: 'U000', now: TD }); s.payment_lines.push(l);
      assert.equal(R.payItem(s, TD, { line: l }).status, 'ready', 'no payee documents when a staff member is paid back');
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U000' }); s.payment_runs.push(run);
      R.addToRun(s, run, [R.payItem(s, TD, { line: l })], ctx);
      assert.ok(R.prSheets(s, run, null)[0].rows[1][16].split('\n').includes('Reimburse: Dream'));
      R.submitRun(s, run, TD, ctx); R.markPaid(s, run, null, '2026-10-09', ctx);
      const d = s.deals.find(y => y.deal_id === x.deal_id);
      assert.ok(d.paid_full || d.paid_50);
    });
    test('TC-27: Mark paid outside app on 10 old lines (note required) → source legacy · no run · the deals are updated · To pay −10', () => {
      const s = fresh(), ctx = ctxFor(s), DUE = ['ready', 'missing_docs', 'in_run', 'submitted'];
      const due = () => R.payQueue(s, TD).items.filter(x => DUE.includes(x.status));
      const ten = due().slice(0, 10), before = R.dealTiles(s, s.deals, s.phases.map(x => x.phase_id), TD), n = due().length;
      const ev = R.markPaidOutside(s, ten, '2026-09-30', 'จ่ายแล้วก่อนมีระบบ', ctx);
      assert.equal(ev.length, 10);
      const lines = s.payment_lines; assert.equal(lines.length, 10);
      assert.ok(lines.every(l => l.source === 'legacy' && l.status === 'paid' && l.run_id === null && l.paid_date === '2026-09-30' && l.note === 'จ่ายแล้วก่อนมีระบบ'));
      assert.equal(s.payment_runs.length, 0);
      assert.equal(due().length, n - 10);
      const after = R.dealTiles(s, s.deals, s.phases.map(x => x.phase_id), TD);
      assert.ok(after.unpaid < before.unpaid && after.paid > before.paid);
      assert.deepEqual([ev[0].type, ev[0].to, ev[0].note], ['payment', 'paid', 'จ่ายแล้วก่อนมีระบบ']);
      assert.equal(R.payQueue(s, TD).items.filter(x => x.source === 'legacy' && x.status === 'paid').length, 0, 'a paid line is not on To pay');
    });
    test('TC-28: a deal with a line In run is cancelled → the line is Cancelled "Deal cancelled" · the run shows a warning · Cancel line keeps a reason', () => {
      const s = fresh(), ctx = ctxFor(s), x = R.payQueue(s, TD).items.find(i => i.status === 'missing_docs' && !i.missing.includes('post_evidence'));
      payeeFor(s, x.kol_id);
      const run = R.newRun(s, { pay_date: '2026-10-09', user: 'U000' }); s.payment_runs.push(run);
      R.addToRun(s, run, [R.payQueue(s, TD).items.find(i => i.key === x.key)], ctx);
      const l = R.runLines(s, run.run_id)[0]; assert.equal(l.status, 'in_run');
      s.deals.find(d => d.deal_id === x.deal_id).status = 'Cancel';
      const ev = R.cancelDealLines(s, ctx);
      assert.deepEqual([l.status, l.cancel_reason, ev.length, ev[0].to], ['cancelled', C.pay.dealCancelled, 1, 'cancelled']);
      assert.ok(R.runChecks(s, run, TD).warns.some(w => w.line_id === l.line_id));
      assert.equal(R.cancelDealLines(s, ctx).length, 0, 'once only');
      const y = R.payQueue(s, TD).items.find(i => i.status === 'missing_docs');
      R.cancelLines(s, [y], 'ซ้ำกับงานเก่า', ctx);
      const ly = s.payment_lines.find(z => z.deal_id === y.deal_id && z.milestone === y.milestone);
      assert.deepEqual([ly.status, ly.cancel_reason], ['cancelled', 'ซ้ำกับงานเก่า']);
      assert.ok(!R.payQueue(s, TD).items.some(i => i.key === y.key && i.status !== 'cancelled'), 'it does not come back');
    });
    test('TC-29: Dashboard › Operations (PIC Amp) — Payment docs missing 18 · Ready to pay 0 · labels', () => {
      const s = fresh(), amp = R.payQueue(s, TD).items.filter(x => x.pic === 'Amp');
      assert.deepEqual([amp.filter(x => x.status === 'missing_docs').length, amp.filter(x => x.status === 'ready').length], [18, 0]);
      assert.deepEqual([C.overview.payDocsMissing, C.overview.payReady], ['Payment docs missing', 'Ready to pay']);
    });
    test('TC-30: Viewer — sees Payments · no Request / Manual line / Add to run / Export PR / Mark paid / WHT cert · a Staff adds a manual line, not a run', () => {
      const viewer = { user_id: 'V', role: 'viewer' }, staff = { user_id: 'U001', role: 'staff', display_name: 'Amp' };
      ['payee.edit', 'payment.request', 'payment.manual', 'payment.run', 'payment.paid', 'payment.reopen', 'payee.unlock', 'settings.payments'].forEach(a => assert.equal(R.can(viewer, a), false, a));
      assert.deepEqual(['payment.manual', 'payment.run', 'payment.paid'].map(a => R.can(staff, a)), [true, false, false]);
      const s = fresh();
      assert.equal(R.canEditPayee(s, viewer, null, null), false);
      assert.equal(R.canEditPayee(s, staff, null, null), true, 'a new payee outside KOL Master');
      assert.equal(R.canRequest(s, viewer, s.deals[0]), false);
    });
  });
});
