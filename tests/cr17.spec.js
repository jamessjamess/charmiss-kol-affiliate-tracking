/* cr17.spec.js — CR-17 test cases (Operations mode Simple / Full · Mark paid / Sent / Mark unpaid · Shipped / Delivered in one click ·
   Campaign / Phase approval · schema 16), run by tests/test.html. "today" is 08/10/2026 · the seed after migrate v16 · test data is made up. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED } = t;
  const TD = '2026-10-08';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-08T03:00:00Z'));
  const user = (s, name) => s.users.find(u => u.display_name === name);
  const ctxFor = s => { let e = 0, ln = 0; return { lineId: () => 'PL-' + String((s.payment_lines.length + 1 + ln++)).padStart(6, '0'), eventId: () => 9000 + e++, now: '2026-10-08T03:00:00Z', user: 'U001' }; };
  const DUE = ['ready', 'missing_docs', 'in_run'];
  const due = s => R.payQueue(s, TD).items.filter(x => DUE.includes(x.status));
  const sent = s => R.payQueue(s, TD).items.filter(x => x.status === 'submitted');
  const gross = list => R.round2(list.reduce((a, x) => a + x.tax.gross, 0));
  const kpis = s => R.portfolioKpis(s, '2026-01-01', '2026-12-31', TD, false);
  const paidMonth = s => R.round2((s.payment_lines || []).filter(l => l.status === 'paid' && String(l.paid_date).slice(0, 7) === TD.slice(0, 7)).reduce((a, l) => a + l.gross, 0));
  const camp = (s, id) => s.campaigns.find(c => c.campaign_id === id);
  const aCtx = s => { let e = 0; const base = (s.campaign_events || []).length + 1000; return { eventId: () => base + e++, now: '2026-10-08T03:00:00Z', user: 'U003' }; };

  describe('CR-17 §3 · schema 16', () => {
    test('TC-01: a schema 15 file → 16 · ops_mode simple / simple · Campaigns / Phases approved · a line With Accounting gets sent_at · anchors', () => {
      const v15 = JSON.parse(JSON.stringify(fresh()));
      v15.schema_version = 15; delete v15.lookups.ops_mode;
      v15.campaigns.forEach(c => { delete c.approval_status; delete c.approval; delete c.pending_change; });
      v15.phases.forEach(p => { delete p.approval_status; delete p.approval; delete p.pending_change; });
      v15.payment_runs = [{ run_id: 'PR-2026-10-02', pay_date: '2026-10-02', prepared_by: 'U000', status: 'submitted', submitted_at: '2026-10-01T09:00:00Z', note: null, created_at: null }];
      v15.payment_lines = [{ line_id: 'PL-000001', deal_id: null, milestone: 'manual', run_id: 'PR-2026-10-02', status: 'submitted', gross: 100, vat: 0, wht: 0, net: 100 }];
      const s = S.migrate(v15, new Date('2026-10-08T03:00:00Z'));
      assert.equal(s.schema_version, S.SCHEMA_VERSION);   // (CR-18 goes on to 17)
      assert.deepEqual(s.lookups.ops_mode, { payments: 'simple', shipments: 'simple' });
      assert.equal(s.payment_lines[0].sent_at, '2026-10-01T09:00:00Z');
      assert.deepEqual(['paid_by', 'paid_ref', 'sent_by', 'unpaid_reason'].map(k => s.payment_lines[0][k]), [null, null, null, null]);
      assert.ok(s.campaigns.every(c => c.approval_status === 'approved' && c.pending_change === null) && s.phases.every(p => p.approval_status === 'approved'));
      const once = JSON.stringify(s); R.migrateV16(s); assert.equal(JSON.stringify(s), once, 'runs twice → the same');
    });
    test('§5.0 anchors: To pay 125 lines · ฿826,950.00 · Sent 0 · Paid this month ฿0.00 · Dashboard Paid ฿774,579 · Outstanding ฿1,009,000', () => {
      const s = fresh(), k = kpis(s);
      assert.deepEqual([due(s).length, gross(due(s)), sent(s).length, paidMonth(s)], [125, 826950, 0, 0]);
      assert.deepEqual([k.paid.paid, k.paid.outstanding], [774579, 1009000]);
    });
    test('TC-17: after migrate the seed\'s 4 Campaigns and 9 Phases are Approved · the Dashboard does not move', () => {
      const s = fresh();
      assert.deepEqual([s.campaigns.length, s.phases.length], [4, 9]);
      assert.ok(s.campaigns.concat(s.phases).every(x => x.approval_status === 'approved' && R.isApproved(x)));
      assert.deepEqual([kpis(s).campaigns.n, kpis(s).deals.n, kpis(s).money.committed], [4, 300, 1783579]);
    });
  });

  describe('CR-17 §4.1 · Operations mode', () => {
    test('opsMode: simple by default · Full / Simple per kind · a wrong value does nothing · the data is the same either way', () => {
      const s = fresh(), before = JSON.stringify([s.payment_lines, s.payment_runs, s.sample_shipments]);
      assert.deepEqual([R.opsMode(s, 'payments'), R.opsMode(s, 'shipments'), R.isSimple(s, 'payments')], ['simple', 'simple', true]);
      assert.equal(R.setOpsMode(s, 'payments', 'full'), true); assert.equal(R.opsMode(s, 'payments'), 'full'); assert.equal(R.opsMode(s, 'shipments'), 'simple');
      assert.equal(R.setOpsMode(s, 'payments', 'nope'), false); assert.equal(R.opsMode(s, 'payments'), 'full');
      assert.equal(R.opsMode({ lookups: {} }, 'shipments'), 'simple', 'older data → Simple');
      assert.equal(JSON.stringify([s.payment_lines, s.payment_runs, s.sample_shipments]), before);
    });
  });

  describe('CR-17 §4.2 · Payments — Simple', () => {
    test('TC-03 / TC-04: Staff (PIC) marks the Full instalment of their deal paid → Paid · paid_full · Dashboard Paid + the deal · Outstanding −; not another PIC\'s', () => {
      const s = fresh(), amp = user(s, 'Amp'), ja = user(s, 'Ja');
      const x = due(s).find(i => i.deal && i.deal.pic === 'Amp' && i.milestone === 'full'), other = due(s).find(i => i.deal && i.deal.pic === 'Ja');
      assert.equal(R.canPaySimple(s, amp, x), true); assert.equal(R.canPaySimple(s, amp, other), false, 'TC-04: no button');
      assert.equal(R.canPaySimple(s, user(s, 'Earn'), other), true, 'Accounting may'); assert.equal(R.canPaySimple(s, Object.assign({}, amp, { role: 'viewer' }), x), false, 'a Viewer may not');
      const k0 = kpis(s), total = R.totalCost(x.deal);
      const r = R.markItemsPaid(s, [x], { date: TD, ref: 'PR-2026-10-10' }, ctxFor(s));
      const l = s.payment_lines.find(i => i.deal_id === x.deal_id && i.milestone === 'full'), d = s.deals.find(i => i.deal_id === x.deal_id);
      assert.deepEqual([r.n, r.events.length, l.status, l.paid_date, l.paid_by, l.paid_ref, d.paid_full], [1, 1, 'paid', TD, 'U001', 'PR-2026-10-10', true]);
      const k1 = kpis(s);
      assert.deepEqual([k1.paid.paid - k0.paid.paid, k0.paid.outstanding - k1.paid.outstanding], [total, total]);
      assert.equal(R.simplePayTrack(s, d, TD).state, 'paid');
      assert.equal(paidMonth(s), l.gross);
    });
    test('TC-05: Mark paid while documents are missing — no error (documents never block) · Docs n/m tells what is there', () => {
      const s = fresh(), x = due(s)[0];
      assert.equal(x.status, 'missing_docs');
      const tl = R.docsTally(s, x);
      assert.ok(tl.need >= 3 && tl.have < tl.need && tl.missing.includes('bank_details'));
      assert.equal(R.markItemsPaid(s, [x], { date: TD }, ctxFor(s)).n, 1);
    });
    test('TC-06: 5 rows › Export for accounting › Yes → a run "Sent 08/10" With Accounting · the 5 in Sent · header Sent ฿ · No → nothing changed', () => {
      const s = fresh(), five = due(s).slice(0, 5), before = JSON.stringify([s.payment_lines, s.payment_runs]);
      const r = R.sendToAccounting(s, five, { date: TD }, ctxFor(s));
      assert.deepEqual([r.run.label, r.run.status, r.run.auto, R.runStatusKey(r.run), r.lines.length], ['Sent 08/10', 'submitted', 'simple', 'with_accounting', 5]);
      assert.ok(r.lines.every(l => l.status === 'submitted' && l.sent_at === '2026-10-08T03:00:00Z' && l.sent_by === 'U001' && l.run_id === r.run.run_id));
      assert.deepEqual([sent(s).length, gross(sent(s)), due(s).length], [5, gross(five), 120]);
      assert.ok(sent(s).every(x => R.simpleBucket(x) === 'sent'));
      R.undoSend(s, r.undo);
      assert.equal(JSON.stringify([s.payment_lines, s.payment_runs]), before, 'No: as it was');
    });
    test('TC-07: Sent › Mark paid 5 rows (ref) → Paid · paid_ref · the run Paid · Undo (10 s) → Sent again, the deals as before', () => {
      const s = fresh(), ctx = ctxFor(s), r = R.sendToAccounting(s, due(s).slice(0, 5), { date: TD }, ctx);
      const flags = JSON.stringify(s.deals.map(d => [d.paid_full, d.paid_50]));
      const m = R.markItemsPaid(s, sent(s), { date: '2026-10-10', ref: 'PR-2026-10-10' }, ctx);
      assert.ok(r.lines.every(l => l.status === 'paid' && l.paid_ref === 'PR-2026-10-10' && l.paid_date === '2026-10-10'));
      assert.equal(r.run.status, 'paid');
      R.undoMarkPaid(s, m.undo, ctx);
      assert.ok(r.lines.every(l => l.status === 'submitted' && l.paid_ref === null && l.paid_date === null));
      assert.deepEqual([r.run.status, sent(s).length, JSON.stringify(s.deals.map(d => [d.paid_full, d.paid_50]))], ['submitted', 5, flags]);
      /* a row worked out from the deal: Undo takes its new line away and the deal's flags back */
      const x = due(s)[0], m2 = R.markItemsPaid(s, [x], { date: TD }, ctx), n = s.payment_lines.length;
      R.undoMarkPaid(s, m2.undo, ctx);
      assert.equal(s.payment_lines.length, n - 1); assert.equal(JSON.stringify(s.deals.map(d => [d.paid_full, d.paid_50])), flags);
    });
    test('TC-08: Admin Mark unpaid (a reason) → back to To pay · the deal\'s flag goes back · Dashboard Paid down · Staff cannot', () => {
      const s = fresh(), ctx = ctxFor(s), x = due(s).find(i => i.milestone === 'full');
      R.markItemsPaid(s, [x], { date: TD }, ctx);
      const l = s.payment_lines.find(i => i.deal_id === x.deal_id && i.milestone === 'full'), k1 = kpis(s);
      assert.equal(R.canUnpay(user(s, 'Amp')), false); assert.equal(R.canUnpay(user(s, 'Admin')), true); assert.equal(R.canUnpay(user(s, 'Earn')), true);
      assert.equal(R.markUnpaid(s, l, '', ctx), null, 'a reason is needed');
      const ev = R.markUnpaid(s, l, 'paid to the wrong account', ctx);
      assert.deepEqual([ev[0].from, ev[0].to, l.status, l.paid_date, l.unpaid_reason, l.run_id], ['paid', 'open', 'open', null, 'paid to the wrong account', null]);
      assert.equal(s.deals.find(d => d.deal_id === x.deal_id).paid_full, false);
      assert.equal(k1.paid.paid - kpis(s).paid.paid, R.totalCost(x.deal));
      assert.ok(due(s).some(i => i.key === l.line_id), 'in To pay again');
    });
    test('TC-09: Payments → Full: the Sent lines are a run With Accounting · Paid stays Paid · no data lost · and back', () => {
      const s = fresh(), ctx = ctxFor(s), r = R.sendToAccounting(s, due(s).slice(0, 3), { date: TD }, ctx);
      R.markItemsPaid(s, due(s).slice(0, 1), { date: TD }, ctx);
      const snap = JSON.stringify([s.payment_lines, s.payment_runs]);
      R.setOpsMode(s, 'payments', 'full');
      assert.equal(R.runStatusKey(s.payment_runs.find(x => x.run_id === r.run.run_id)), 'with_accounting');
      assert.equal(R.runLines(s, r.run.run_id).length, 3);
      assert.equal(JSON.stringify([s.payment_lines, s.payment_runs]), snap);
      R.setOpsMode(s, 'payments', 'simple'); assert.equal(sent(s).length, 3);
    });
    test('Sent › Move back to To pay · an automatic run left empty goes · Payments to confirm = Sent more than 7 days', () => {
      const s = fresh(), ctx = ctxFor(s), r = R.sendToAccounting(s, due(s).slice(0, 2), { date: TD }, ctx);
      r.lines[0].sent_at = '2026-09-28T03:00:00Z';
      assert.deepEqual(R.paymentsToConfirm(s, {}, TD).map(x => x.key), [r.lines[0].line_id]);
      assert.equal(R.sentDays(s, r.lines[0], TD), 10);
      R.moveBackToPay(s, r.lines[0], ctx); R.moveBackToPay(s, r.lines[1], ctx);
      assert.equal(s.payment_runs.some(x => x.run_id === r.run.run_id), false);
      assert.equal(sent(s).length, 0);
    });
    test('Go-live "Mark paid outside app" uses the same Mark paid (the lines it makes are legacy, no run)', () => {
      const s = fresh(), two = due(s).slice(0, 2), ev = R.markPaidOutside(s, two, '2026-09-30', 'จ่ายก่อนมีระบบ', ctxFor(s));
      assert.equal(ev.length, 2);
      assert.ok(s.payment_lines.every(l => l.source === 'legacy' && l.status === 'paid' && l.run_id === null && l.note === 'จ่ายก่อนมีระบบ'));
    });
    test('WHT certificate ticked on the row · unticked', () => {
      const s = fresh(), x = due(s).find(i => i.tax.wht > 0); R.markItemsPaid(s, [x], { date: TD }, ctxFor(s));
      const l = s.payment_lines[0];
      assert.equal(R.setWhtSent(l, TD), true); assert.equal(l.wht_cert_sent_date, TD);
      R.setWhtSent(l, null); assert.equal(l.wht_cert_sent_date, null);
    });
  });

  describe('CR-17 §4.3 · Shipments — Simple', () => {
    const toShip = s => s.sample_shipments.find(x => x.status === 'to_ship');
    test('TC-10: Shipped without carrier / tracking → in transit · the Journey track says Shipped', () => {
      const s = fresh(), sh = toShip(s), ctx = ctxFor(s);
      const ev = R.shipQuick(s, sh, 'shipped', { date: TD }, ctx);
      assert.deepEqual([ev.length, sh.status, sh.shipped_date, sh.carrier, sh.tracking_no], [1, 'shipped', TD, null, null]);
      assert.equal(R.tabOfStatus(R.sampleStatus(sh, TD)), 'in-transit');
      assert.equal(R.sampleTrack(R.shipmentsOf(s, sh.deal_id), TD).kind, 'shipped');
      assert.equal(R.shipQuick(s, sh, 'shipped', { date: TD }, ctx), null, 'twice: nothing');
    });
    test('TC-11: Shipped & delivered → Delivered at once, both dates · Undo delivered → Shipped', () => {
      const s = fresh(), sh = toShip(s), ctx = ctxFor(s);
      const ev = R.shipQuick(s, sh, 'both', { date: '2026-10-07', carrier: 'Kerry' }, ctx);
      assert.deepEqual([ev.length, sh.status, sh.shipped_date, sh.delivered_date, sh.carrier], [2, 'delivered', '2026-10-07', '2026-10-07', 'Kerry']);
      R.undoDelivered(sh, ctx);
      assert.deepEqual([sh.status, sh.delivered_date, sh.shipped_date], ['shipped', null, '2026-10-07']);
      assert.equal(R.shipQuick(s, sh, 'delivered', { date: TD }, ctx).length, 1); assert.equal(sh.status, 'delivered');
    });
  });

  describe('CR-17 §4.5 · Campaign / Phase approval', () => {
    const babe = s => user(s, 'Babe'), km = s => Object.assign({}, user(s, 'Admin'), { role: 'kol_manager', user_id: 'U900' });
    /* CR-21: a new record starts as a draft of its maker · Submit (Staff) / Create (a manager) through R.requestTransition */
    const ctxBy = (s, who) => Object.assign(aCtx(s), { user: who.user_id });
    const send = (s, id, who) => s.campaign_events.push(...R.requestTransition(s, id, R.canApprove(who) ? 'approved' : 'pending', ctxBy(s, who), { direct: true }).events);
    const newCampaign = (s, who) => { const c = R.stampDraft({ campaign_id: 'TA', campaign_name: 'Test Approve', budget_kol: 100000, cta: null, note: null, status_override: null }, who, '2026-10-08T03:00:00Z'); s.campaigns.push(c);
      s.phases.push(R.stampDraft({ phase_id: 'TA-P1', campaign_id: 'TA', label: null, start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 100000 }, who, '2026-10-08T03:00:00Z'));
      send(s, 'campaign:TA', who); return c; };
    test('the matrix: Staff draft · Admin / KOL Manager approve · Viewer / Accounting neither', () => {
      const s = fresh();
      assert.deepEqual(['admin', 'kol_manager', 'staff', 'viewer', 'accounting'].map(r => [R.canDraft({ role: r }), R.canApprove({ role: r })]),
        [[true, true], [true, true], [true, false], [false, false], [false, false]]);
      assert.equal(R.can(babe(s), 'campaign.edit'), false);
    });
    test('TC-18 / TC-19: Staff (Babe) makes "Test Approve" → Pending approval · not in the Dashboard (default Status) · no deal can be added', () => {
      const s = fresh(), c = newCampaign(s, babe(s));
      assert.deepEqual([c.approval_status, c.approval.submitted_by, R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, 'TA'), TD)], ['pending', babe(s).user_id, 'pending']);
      assert.deepEqual([kpis(s).campaigns.n, kpis(s).money.budget], [4, 2748400], 'not counted');
      assert.ok(R.campaignBlocksNew(s, 'TA'));
      assert.ok(R.bulkShortlistPlan(s, [s.kol_master[0].kol_id], 'TA', {}).errs.some(e => e.field === 'campaign_id'), 'Bulk shortlist: blocked too');
      assert.deepEqual(R.phasesOfCampaign(s, 'TA'), [], 'its Phase is not offered');
      assert.ok(R.CAMPAIGN_STATUSES.includes('pending') && !R.DASH_STATUS_DEFAULT.includes('pending'));
    });
    test('TC-20 / TC-21 / TC-22 (CR-21): the queue counts 1 · Return to draft needs a reason · Resubmit → Pending (Round 2) · Approve → deals can be added · approval rows', () => {
      const s = fresh(), c = newCampaign(s, babe(s)), ctx = aCtx(s);
      assert.equal(R.approvalCount(s), 1); assert.equal(R.approvalRequests(s)[0].type, 'new_campaign');
      assert.equal(R.returnRequest(s, 'campaign:TA', '  ', ctx), null, 'no reason → nothing');
      s.campaign_events.push(...R.returnRequest(s, 'campaign:TA', 'budget too high', ctx));
      assert.deepEqual([c.approval_status, c.returned_reason, s.phases.find(p => p.phase_id === 'TA-P1').approval_status, R.approvalCount(s)], ['draft', 'budget too high', 'draft', 0]);
      send(s, 'campaign:TA', babe(s));
      assert.deepEqual([c.approval_status, c.submit_round, R.approvalCount(s)], ['pending', 2, 1]);
      s.campaign_events.push(...R.approveRequest(s, 'campaign:TA', ctx));
      assert.deepEqual([c.approval_status, s.phases.find(p => p.phase_id === 'TA-P1').approval_status, R.campaignBlocksNew(s, 'TA'), kpis(s).campaigns.n], ['approved', 'approved', null, 5], 'approved: deals can be added · counted in the Dashboard');
      assert.deepEqual(s.campaign_events.filter(e => e.campaign_id === 'TA' && e.type === 'approval').map(e => e.to), ['submitted', 'returned', 'resubmitted', 'approved']);
      assert.equal(R.phasesOfCampaign(s, 'TA').length, 1);
    });
    test('TC-23: Staff asks Kiss Signal ฿600,000 → ฿700,000 · ฿600,000 everywhere until approved · Approve → ฿700,000 · Reject → stays', () => {
      const s = fresh(), ks = camp(s, 'KS'), b = babe(s);
      const sp = R.splitChange(ks, { campaign_name: 'Kiss Signal Lip Gloss', budget_kol: 700000, cta: ks.cta }, R.KEY_CAMPAIGN, b);
      assert.deepEqual(sp.ask, { budget_kol: 700000 });
      R.requestChange(ks, sp.ask, b, '2026-10-08T03:00:00Z'); send(s, 'change:KS', b);
      assert.deepEqual([ks.budget_kol, R.campaignSummary(s, 'KS').budget, ks.pending_change.fields.budget_kol], [600000, 600000, 700000]);
      assert.equal(R.approvalRequests(s)[0].type, 'change');
      const s2 = JSON.parse(JSON.stringify(s));
      R.approveRequest(s, 'change:KS', aCtx(s)); assert.deepEqual([ks.budget_kol, ks.pending_change], [700000, null]);
      const ev = R.returnRequest(s2, 'change:KS', 'not this quarter', aCtx(s2)), ks2 = camp(s2, 'KS');
      assert.deepEqual([ks2.budget_kol, ks2.pending_change.status, ev[0].to, ks2.pending_change.returned_reason], [600000, 'draft', 'returned', 'not this quarter'], 'CR-21: returned to its maker as a draft');
    });
    test('TC-24: Staff adds a Phase 01/11–30/11 to Perfect Heart → Pending · a post in that time does not go into it until approved', () => {
      const s = fresh(), d = s.deals.find(x => x.campaign_id === 'PH' && x.status !== 'Cancel');
      s.deal_posts.push({ post_id: 'P999999', deal_id: d.deal_id, account_id: null, platform: 'TikTok', expected_post_date: '2026-11-15', post_date: null, phase_override: null });
      const p = R.stampDraft({ phase_id: 'PH-NOV', campaign_id: 'PH', label: 'Nov', start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 50000 }, babe(s), '2026-10-08T03:00:00Z'); s.phases.push(p);
      send(s, 'phase:PH-NOV', babe(s));
      assert.equal(p.approval_status, 'pending');
      assert.notEqual(R.phaseIndex(s).post.get('P999999').phase, 'PH-NOV');
      assert.equal(R.campaignSummary(s, 'PH').allocated, R.campaignSummary(fresh(), 'PH').allocated, 'its budget is not counted');
      assert.equal(R.approvalRequests(s)[0].type, 'new_phase');
      R.approveRequest(s, 'phase:PH-NOV', aCtx(s));
      assert.equal(R.phaseIndex(s).post.get('P999999').phase, 'PH-NOV');
    });
    test('TC-25 / TC-26: Staff change name · CTA · note at once · a KOL Manager\'s Campaign is approved at once · a Phase asked to go is removed on approval', () => {
      const s = fresh(), ks = camp(s, 'KS');
      const sp = R.splitChange(ks, { campaign_name: 'KS renamed', cta: 'Shop now', note: 'n', budget_kol: 600000 }, R.KEY_CAMPAIGN, babe(s));
      assert.deepEqual([sp.ask, sp.now.campaign_name, sp.now.cta], [{}, 'KS renamed', 'Shop now']);
      const c = R.stampDraft({ campaign_id: 'KM', campaign_name: 'By KM' }, km(s), '2026-10-08T03:00:00Z'); s.campaigns.push(c); send(s, 'campaign:KM', km(s));
      assert.deepEqual([c.approval_status, c.approval.decided_by], ['approved', 'U900']);
      const p = { phase_id: 'X-1', campaign_id: 'KS', start_date: '2026-12-01', end_date: '2026-12-10', approval_status: 'approved' }; s.phases.push(p);
      R.requestChange(p, { delete: true }, babe(s), '2026-10-08T03:00:00Z'); send(s, 'change:X-1', babe(s));
      assert.equal(R.pendingOf(s, 'KS').changes[0].fields[0].key, 'delete');
      R.approveRequest(s, 'change:X-1', aCtx(s));
      assert.ok(!s.phases.some(x => x.phase_id === 'X-1'));
      assert.equal(R.validateReturn('').errs.length, 1); assert.equal(R.validateReturn('123-4-56789-0').errs.length, 1);
    });
  });
});
