/* rules.spec.js — test cases, run by tests/test.html (double-click; no Node needed).
   Each spec file adds itself to window.KT_SPECS; the runner passes {describe, test, assert, R, S, C, SEED}. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED } = t;
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-05T03:00:00Z'));
  const deal = (s, id) => s.deals.find(d => d.deal_id === id);
  const TODAY = '2026-10-05';
  const PII = /phone|address|ที่อยู่|เบอร์/i;

  /* in-memory localStorage; `fail` makes setItem / getItem throw like private mode or a full quota */
  function fakeStorage(fail = {}) {
    const m = new Map();
    return {
      map: m,
      getItem(k) { if (fail.get) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
      setItem(k, v) { if (fail.set) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
      removeItem(k) { m.delete(k); },
    };
  }

  describe('links (same as mockup)', () => {
    test('normLink removes tracking params, www, trailing slash', () => {
      const a = 'https://www.tiktok.com/@jobimjb/video/7686848235146693908?is_from_webapp=1&sender_device=pc';
      assert.equal(R.normLink(a), 'tiktok.com/@jobimjb/video/7686848235146693908');
      assert.equal(R.normLink('https://www.instagram.com/p/DcJC8Oxk3tc/?igsh=ZGR5'), 'instagram.com/p/DcJC8Oxk3tc');
      assert.equal(R.normLink('https://x.com/tTukablythe/status/2089?s=20&utm_source=x'), 'x.com/tTukablythe/status/2089?s=20');
    });
    test('normLink keeps real params (facebook story) — different posts are not duplicates', () => {
      const a = R.normLink('https://www.facebook.com/story.php?story_fbid=1&id=2');
      const b = R.normLink('https://www.facebook.com/story.php?story_fbid=3&id=2');
      assert.notEqual(a, b);
      assert.equal(a, 'facebook.com/story.php?story_fbid=1&id=2');
    });
    test('normLink lowercases full TikTok paths only; short links keep case', () => {
      assert.equal(R.normLink('https://www.tiktok.com/@AbC/video/1'), R.normLink('https://tiktok.com/@abc/video/1/'));
      assert.notEqual(R.normLink('https://vt.tiktok.com/ZSAbCd/'), R.normLink('https://vt.tiktok.com/zsabcd/'));
      assert.equal(R.normLink('not a url '), 'not a url');
    });
    test('TC-09 basis: ?lang=th link equals the D000060 post link', () => {
      const s = fresh(), p = s.deal_posts.find(x => x.deal_id === 'D000060');
      assert.equal(R.normLink('https://www.tiktok.com/@jobimjb/video/7686848235146693908?lang=th'), R.normLink(p.post_link));
    });
    test('TC-10 basis: tiktokDate reads 18/09/2026 from the video id', () => {
      assert.equal(R.tiktokDate('https://www.tiktok.com/@jobimjb/video/7686848235146693999'), '2026-09-18');
      assert.equal(R.dmy(R.tiktokDate('https://www.tiktok.com/@jobimjb/video/7686848235146693999')), '18/09/2026');
      assert.equal(R.tiktokDate('https://vt.tiktok.com/ZSAbCd/'), null);
      assert.equal(R.tiktokDate('https://www.instagram.com/p/x'), null);
      assert.equal(R.isShortTiktok('https://vt.tiktok.com/ZSAbCd/'), true);
    });
    test('handleFromLink / platformFromLink', () => {
      assert.equal(R.handleFromLink('https://www.tiktok.com/@KiaoKoy_22/video/1'), 'kiaokoy_22');
      assert.equal(R.handleFromLink('https://www.instagram.com/genygee28/'), 'genygee28');
      assert.equal(R.handleFromLink('https://www.instagram.com/reel/abc'), '');
      assert.equal(R.handleFromLink('https://x.com/someoneelse/status/1'), 'someoneelse');
      assert.equal(R.platformFromLink('https://www.lemon8-app.com/@x/1'), 'Lemon8');
      assert.equal(R.platformFromLink('https://fb.com/x'), 'Facebook');
      assert.equal(R.platformFromLink('https://youtu.be/x'), 'YouTube');
      assert.equal(R.platformFromLink('https://example.com'), '');
    });
  });

  describe('tier', () => {
    const rules = SEED.lookups.tier_rules;
    test('tierOf boundaries', () => {
      assert.equal(R.tierOf(0, rules), 'Nano');
      assert.equal(R.tierOf(5200, rules), 'Nano');
      assert.equal(R.tierOf(9999, rules), 'Nano');
      assert.equal(R.tierOf(10000, rules), 'Micro');
      assert.equal(R.tierOf(33700, rules), 'Micro');
      assert.equal(R.tierOf(50000, rules), 'Mid-tier');
      assert.equal(R.tierOf(100000, rules), 'Macro');
      assert.equal(R.tierOf(1000000, rules), 'Mega');
      assert.equal(R.tierOf(null, rules), '');
      assert.equal(R.tierOf('', rules), '');
    });
  });

  describe('costs & payment', () => {
    test('TC-04 basis: D000150 total ฿6,000 (not ×4 posts) and 4 posts', () => {
      const s = fresh(), d = deal(s, 'D000150');
      assert.equal(R.totalCost(d), 6000);
      assert.equal(R.postsPlanned(s, 'D000150'), 4);
      assert.deepEqual(R.postsOf(s, 'D000150').map(p => s.kol_accounts.find(a => a.account_id === p.account_id).platform).sort(), ['Instagram', 'Lemon8', 'TikTok', 'X']);
    });
    test('totalCost: null = 0, sums the five fee fields', () => {
      assert.equal(R.totalCost({ rate_card: 1000, gencode_expense: null, basket_fee: 200, asset_fee: '', expediting_fee: 50 }), 1250);
      assert.equal(R.totalCost({}), 0);
    });
    test('TC-13 basis: gencode 01/10/2026 + 30 days → 30/10/2026', () => {
      assert.equal(R.gencodeEndDate({ gencode_start_date: '2026-10-01', gencode_period: 30 }), '2026-10-30');
      assert.equal(R.gencodeEndDate({ gencode_start_date: '2026-10-01', gencode_period: 0 }), null);
      assert.equal(R.gencodeEndDate({ gencode_start_date: null, gencode_period: 30 }), null);
    });
    test('paidEstimate and paymentProgress (the furthest tick)', () => {
      const d = { rate_card: 10000 };
      assert.equal(R.paidEstimate({ ...d }), 0);
      assert.equal(R.paidEstimate({ ...d, paid_50: true }), 5000);
      assert.equal(R.paidEstimate({ ...d, paid_50: true, paid_full: true }), 10000);
      assert.equal(R.paymentProgress({}), 'none');
      assert.equal(R.paymentProgress({ docs_done: true }), 'docs_done');
      assert.equal(R.paymentProgress({ docs_done: true, paid_50: true }), 'paid_50');
      assert.equal(R.paymentProgress({ paid_full: true }), 'paid_full');
    });
  });

  describe('seed acceptance', () => {
    test('TC-01: collection counts after first load', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      assert.deepEqual(st.counts(), { campaigns: 4, phases: 9, kol_master: 911, kol_accounts: 928, kol_rate_quotes: 524, deals: 305, deal_posts: 313, deal_status_log: 770, deal_events: 0, users: 9, campaign_events: 0, products: 0, campaign_products: 0, deal_products: 0, payee_profiles: 0, payment_lines: 0, payment_runs: 0, sample_shipments: 214 }, 'CR-04 … CR-10: users, campaign_events, products, payments and sample shipments come with the migrations');
    });
    test('TC-02: committed per Phase (not counting Cancel) — by post since CR-03', () => {
      const s = fresh();
      const expected = { 'CH-P1': 573050, 'CH-P2': 290650, 'KS-P1': 298700, 'KS-P2': 41700, 'AC-P1': 7800, 'PH-P1': 310600, 'PH-P2': 154779, 'PH-P3': 67500, 'PH-OCT': 38800 };
      for (const [id, v] of Object.entries(expected)) assert.equal(R.phaseCommitted(s, id), v, id);
    });
    test('TC-14 basis: CH-P1 is over budget by ฿73,050 (CR-03 committed by post)', () => {
      const x = R.phaseSummary(fresh(), 'CH-P1');
      assert.equal(x.over, true);
      assert.equal(R.baht(-x.remaining), '฿73,050');
    });
    test('phaseSummary counts deals per Status', () => {
      const x = R.phaseSummary(fresh(), 'CH-P1');
      assert.equal(x.counts.Inprocess + x.counts.Complete + x.counts.List + x.counts.Cancel, x.dealCount);
      assert.equal(x.activeCount, x.dealCount - x.counts.Cancel);
    });
  });

  describe('journey', () => {
    test('statusOf derives Status from SubStatus', () => {
      const L = SEED.lookups;
      assert.equal(R.statusOf(L, 'Shortlist'), 'List');
      assert.equal(R.statusOf(L, 'Approve Draft 2'), 'Inprocess');
      assert.equal(R.statusOf(L, 'Post'), 'Complete');
      assert.equal(R.statusOf(L, 'Cancel'), 'Cancel');
    });
    test('seed deals: status matches the journey table', () => {
      const s = fresh();
      s.deals.forEach(d => assert.equal(R.statusOf(s.lookups, d.sub_status), d.status, d.deal_id));
    });
    test('nextStep skips optional steps but offers them; Script / Draft 2–3 follow the deal plan (CR-02)', () => {
      const { step, optional } = R.nextStep(SEED.lookups, { sub_status: 'Brief' });
      assert.equal(step.sub_status, 'Approve Draft 1');
      assert.deepEqual(optional.map(s => s.sub_status), [], 'Script is not in a default plan');
      assert.equal(R.nextStep(SEED.lookups, { sub_status: 'Brief', script_required: true }).step.sub_status, 'Approve Script');
      assert.deepEqual(R.nextStep(SEED.lookups, { sub_status: 'Shortlist' }).optional.map(s => s.sub_status), ['Contacted']);
      assert.equal(R.nextStep(SEED.lookups, { sub_status: 'Shortlist' }).step.sub_status, 'Confirm QT');
      assert.equal(R.nextStep(SEED.lookups, { sub_status: 'Approve Draft 1' }).step.sub_status, 'Post');
      assert.equal(R.nextStep(SEED.lookups, { sub_status: 'Post' }).step, null);
      assert.equal(R.nextStep(SEED.lookups, { sub_status: 'Cancel' }).step, null);
    });
    test('TC-15 basis: D000114 due 12/08/2026 → overdue', () => {
      const s = fresh(), d = deal(s, 'D000114');
      assert.equal(R.dueDate(s, d), '2026-08-12');
      assert.equal(R.isOverdue(s, d, TODAY), true);
      assert.equal(R.isOverdue(s, d, '2026-08-12'), false);
    });
    test('due date for the Post step = earliest expected date of posts not yet posted', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      s.deal_posts.push({ post_id: 'PX1', deal_id: 'D000044', expected_post_date: '2026-09-20', post_date: null });
      s.deal_posts.push({ post_id: 'PX2', deal_id: 'D000044', expected_post_date: '2026-09-10', post_date: null });
      const d2 = { ...d, sub_status: 'Approve Draft 1', status: 'Inprocess' };
      assert.equal(R.dueDate(s, d2), '2026-09-10');
    });
    test('completed / cancelled deals are never overdue', () => {
      const s = fresh();
      assert.equal(R.isOverdue(s, deal(s, 'D000001'), TODAY), false);
      assert.equal(R.isOverdue(s, deal(s, 'D000289'), TODAY), false);
    });
    test('a log without a timestamp has no date (never 01/01/1970)', () => {
      assert.equal(R.dateOfTimestamp(null), null);
      assert.equal(R.dateOfTimestamp(''), null);
      assert.equal(R.dateOfTimestamp('2026-10-05T03:00:00Z'), '2026-10-05');
    });
    test('daysInStep uses the latest dated log of the current step', () => {
      const s = fresh();
      assert.equal(R.daysInStep(s, deal(s, 'D000114'), TODAY), R.dayDiff(TODAY, '2026-08-06'));
    });
    test('TC-05 basis: D000044 Brief → Approve Draft 1 fills approved_draft1_date and logs the move', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      const opts = { date: TODAY, note: '' };
      const chk = R.checkMove(s, d, 'Approve Draft 1', opts);
      assert.deepEqual(chk.errs, []);
      assert.ok(chk.infos.some(i => i.msg === C.msg.moveNoExpectedDraft(1)));
      const r = R.applyMove(s, d, 'Approve Draft 1', opts, { logId: 771, quoteId: 'Q00525', now: new Date('2026-10-05T03:00:00Z') });
      assert.equal(r.deal.sub_status, 'Approve Draft 1');
      assert.equal(r.deal.status, 'Inprocess');
      assert.equal(r.deal.approved_draft1_date, TODAY);
      assert.equal(r.log.from_sub_status, 'Brief');
      assert.equal(r.log.sub_status, 'Approve Draft 1');
      assert.equal(r.log.source, 'user');
      assert.equal(r.quote, null);
      assert.equal(d.sub_status, 'Brief', 'applyMove must not mutate the input deal');
    });
    test('a date already filled is kept', () => {
      const s = fresh(), d = { ...deal(s, 'D000044'), approved_draft1_date: '2026-09-04' };
      const r = R.applyMove(s, d, 'Approve Draft 1', { date: TODAY }, { logId: 1 });
      assert.equal(r.deal.approved_draft1_date, '2026-09-04');
    });
    test('TC-06 basis: moving back needs a note', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.ok(R.checkMove(s, d, 'Confirm QT', { date: TODAY }).errs.some(e => e.msg === C.msg.moveBackNote));
      assert.deepEqual(R.checkMove(s, d, 'Confirm QT', { date: TODAY, note: 'KOL ขอแก้ราคา' }).errs, []);
      const r = R.applyMove(s, d, 'Confirm QT', { date: TODAY, note: 'KOL ขอแก้ราคา' }, { logId: 1, quoteId: 'Q00525' });
      assert.equal(r.log.note, 'KOL ขอแก้ราคา');
    });
    test('TC-07 basis: Cancel needs a reason', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.ok(R.checkMove(s, d, 'Cancel', { date: TODAY }).errs.some(e => e.msg === C.msg.moveCancelReason));
      assert.deepEqual(R.checkMove(s, d, 'Cancel', { date: TODAY, cancelReason: 'KOL ไม่ว่าง' }).errs, []);
      const r = R.applyMove(s, d, 'Cancel', { date: TODAY, cancelReason: 'KOL ไม่ว่าง' }, { logId: 1 });
      assert.equal(r.deal.status, 'Cancel');
      assert.equal(r.deal.cancel_reason, 'KOL ไม่ว่าง');
    });
    test('TC-08 basis: Post needs every post to have date + link', () => {
      const s = fresh();
      s.deals.push({ deal_id: 'D999999', phase_id: 'KS-P2', kol_id: 'K0120', status: 'List', sub_status: 'Shortlist', is_legacy: false });
      assert.ok(R.checkMove(s, deal(s, 'D999999'), 'Post', { date: TODAY }).errs.some(e => e.msg === C.msg.moveNoPosts));
      s.deal_posts.push({ post_id: 'P999999', deal_id: 'D999999', account_id: 'A00001', post_date: null, post_link: null });
      assert.ok(R.checkMove(s, deal(s, 'D999999'), 'Post', { date: TODAY }).errs.some(e => e.msg === C.msg.movePostsIncomplete(1)));
      assert.equal(C.msg.movePostsIncomplete(1).startsWith('โพสต์ยังไม่ครบ 1 รายการ'), true);
    });
    test('legacy deals may go to Post with incomplete posts', () => {
      const s = fresh();
      s.deals.push({ deal_id: 'D999998', phase_id: 'KS-P2', kol_id: 'K0120', status: 'Inprocess', sub_status: 'Brief', is_legacy: true });
      s.deal_posts.push({ post_id: 'P999998', deal_id: 'D999998', post_date: null, post_link: '' });
      assert.ok(!R.checkMove(s, deal(s, 'D999998'), 'Post', { date: TODAY }).errs.some(e => e.msg === C.msg.movePostsIncomplete(1)));
    });
    test('skipping a required step is a warning, not an error', () => {
      const s = fresh();
      s.deals.push({ deal_id: 'D999997', campaign_id: 'KS', kol_id: 'K0120', status: 'List', sub_status: 'Shortlist', pillar: 'Awareness', payment_term: 'postpaid' });   // CR-10 §4.12: a term is needed into Confirm QT
      const r = R.checkMove(s, deal(s, 'D999997'), 'Approve Draft 1', { date: TODAY });
      assert.deepEqual(r.errs, []);
      assert.ok(r.warns.some(w => w.msg === C.msg.moveSkip('Confirm QT, Brief')));
    });
    test('leaving Cancel: only back to the step before, with a note', () => {
      const s = fresh();
      s.deals.push({ deal_id: 'D999996', campaign_id: 'KS', kol_id: 'K0120', status: 'Cancel', sub_status: 'Cancel', cancel_reason: 'x', pillar: 'Awareness' });
      s.deal_status_log.push({ log_id: 9001, deal_id: 'D999996', from_sub_status: 'Brief', status: 'Cancel', sub_status: 'Cancel' });
      const d = deal(s, 'D999996');
      assert.ok(R.checkMove(s, d, 'Approve Draft 1', { date: TODAY, note: 'กลับมาทำต่อ' }).errs.some(e => e.msg === C.msg.moveLeaveCancelOnly('Brief')));
      assert.ok(R.checkMove(s, d, 'Brief', { date: TODAY }).errs.some(e => e.msg === C.msg.moveLeaveCancelNote));
      assert.deepEqual(R.checkMove(s, d, 'Brief', { date: TODAY, note: 'กลับมาทำต่อ' }).errs, []);
      assert.equal(R.applyMove(s, d, 'Brief', { date: TODAY, note: 'กลับมาทำต่อ' }, { logId: 1 }).deal.cancel_reason, null);
    });
    test('leaving an imported Cancel (step before unknown) is allowed with a note', () => {
      const s = fresh(), d = deal(s, 'D000187');
      const r = R.checkMove(s, d, 'Contacted', { date: TODAY, note: 'ติดต่อใหม่' });
      assert.deepEqual(r.errs, []);
      assert.ok(r.infos.some(i => i.msg === C.msg.moveLeaveCancelUnknown));
    });
    test('Confirm QT with a rate card creates a rate quote', () => {
      const s = fresh(), d = { ...deal(s, 'D000114'), sub_status: 'Contacted', status: 'List' };
      const r = R.applyMove(s, d, 'Confirm QT', { date: TODAY }, { logId: 1, quoteId: 'Q00525' });
      assert.equal(r.quote.quote_id, 'Q00525');
      assert.equal(r.quote.source, 'deal:D000114');
      assert.equal(r.quote.quoted_at, TODAY);
      assert.equal(r.quote.rate_card, 6000);
      assert.equal(r.quote.account_id, 'A00237');
    });
    test('moving needs a valid date and a known step', () => {
      const s = fresh(), d = Object.assign(deal(s, 'D000044'), { pillar: 'Awareness' });   // CR-03: a pillar is needed from Confirm QT on
      assert.ok(R.checkMove(s, d, 'Approve Draft 1', { date: '' }).errs.some(e => e.field === 'date'));
      assert.ok(R.checkMove(s, d, 'Nope', { date: TODAY }).errs.length);
      assert.ok(R.checkMove(s, d, 'Brief', { date: TODAY }).errs.some(e => e.msg === C.msg.moveSame));
    });
  });

  describe('Campaign & Phase', () => {
    test('campaign name required and unique (case-insensitive)', () => {
      const s = fresh();
      assert.ok(R.validateCampaign(s, { campaign_name: ' ' }).errs.length);
      assert.ok(R.validateCampaign(s, { campaign_name: 'kiss signal lip gloss' }).errs.some(e => e.msg === C.msg.campaignNameDup('Kiss Signal Lip Gloss')));
      assert.deepEqual(R.validateCampaign(s, { campaign_id: 'KS', campaign_name: 'Kiss Signal Lip Gloss' }).errs, []);
    });
    test('phase rules: required, dates, budget (CR-06: no typed name — the label is optional)', () => {
      const s = fresh(), ok = { campaign_id: 'KS', label: null, start_date: '2026-11-01', end_date: '2026-11-30', budget_kol: 100000 };
      assert.deepEqual(R.validatePhase(s, ok).errs, []);
      assert.ok(R.validatePhase(s, { ...ok, end_date: '2026-10-31' }).errs.some(e => e.msg === C.msg.phaseEndBeforeStart));
      assert.ok(R.validatePhase(s, { ...ok, budget_kol: -1 }).errs.some(e => e.msg === C.msg.phaseBudgetInvalid));
      assert.deepEqual(R.validatePhase(s, { ...ok, label: 'Conversion' }).errs, [], 'the same label as another Phase is fine');
      assert.ok(R.validatePhase(s, { ...ok, campaign_id: '' }).errs.some(e => e.field === 'campaign_id'));
      assert.ok(R.validatePhase(s, { ...ok, start_date: '' }).errs.some(e => e.field === 'start_date'));
      assert.ok(R.validatePhase(s, { ...ok, budget_kol: null }).warns.some(w => w.msg === C.msg.phaseNoBudget));
    });
    test('editing a phase: budget below committed and posts that would need a phase are warnings', () => {
      const s = fresh(), p = s.phases.find(x => x.phase_id === 'CH-P1');
      const r = R.validatePhase(s, { ...p, budget_kol: 50000, end_date: '2026-09-05' });
      assert.deepEqual(r.errs, []);
      assert.ok(r.warns.some(w => w.field === 'budget_kol'));
      assert.ok(r.warns.some(w => w.field === 'end_date'));
    });
    test('cannot delete a phase with deals / a campaign with phases', () => {
      const s = fresh();
      assert.equal(R.canDeletePhase(s, 'CH-P1'), false);
      assert.equal(R.canDeleteCampaign(s, 'CH'), false);
      s.phases.push({ phase_id: 'KS-P3', campaign_id: 'KS' });
      assert.equal(R.canDeletePhase(s, 'KS-P3'), true);
    });
    test('IDs: campaign initials, phase {campaign}-P{n}', () => {
      const s = fresh();
      /* CR-05 §3: internal CMP- / PHS- IDs (the seed's IDs stay) */
      assert.equal(R.campaignIdFor('Charming Iconic Glow', s.campaigns), 'CMP-0001');
      assert.equal(R.campaignIdFor('x', s.campaigns.concat([{ campaign_id: 'CMP-0007' }])), 'CMP-0008');
      assert.equal(R.phaseIdFor('KS', s.phases), 'PHS-0001');
      assert.equal(R.phaseIdFor('PH', s.phases.concat([{ phase_id: 'PHS-0012' }])), 'PHS-0013');
    });
  });

  describe('store (localStorage)', () => {
    test('first open saves the seed under charmiss_kol_tracker_v1 with schema_version', () => {
      const ls = fakeStorage();
      const st = S.createStore({ seed: SEED, storage: ls });
      assert.equal(st.status.source, 'seed');
      assert.equal(st.status.canSave, true);
      const saved = JSON.parse(ls.map.get('charmiss_kol_tracker_v1'));
      assert.equal(saved.schema_version, S.SCHEMA_VERSION);
      assert.ok(st.sizeChars() < 4 * 1024 * 1024, 'state must stay under ~4 MB');
    });
    test('TC-03a: an edit survives a reload', () => {
      const ls = fakeStorage();
      const a = S.createStore({ seed: SEED, storage: ls });
      a.state.phases.find(p => p.phase_id === 'PH-P3').budget_kol = 99000;
      a.save();
      const b = S.createStore({ seed: SEED, storage: ls });
      assert.equal(b.status.source, 'local');
      assert.equal(b.state.phases.find(p => p.phase_id === 'PH-P3').budget_kol, 99000);
    });
    test('TC-03b: Backup → Reset → Restore brings the data back', () => {
      const ls = fakeStorage();
      const st = S.createStore({ seed: SEED, storage: ls, now: () => new Date('2026-10-05T03:04:00Z') });
      st.state.campaigns.push({ campaign_id: 'NW', campaign_name: 'New One', note: '' });
      st.save();
      const before = st.counts();
      const b = st.backup();
      assert.equal(b.filename, 'kol_tracker_backup_20261005_1004.json');
      st.reset();
      assert.equal(st.counts().campaigns, 4);
      assert.equal(st.state.local.last_backup_at, '2026-10-05T03:04:00.000Z', 'reset keeps the last backup time');
      const prev = st.previewRestore(b.text);
      assert.equal(prev.ok, true);
      assert.equal(prev.counts.campaigns, 5);
      assert.equal(prev.current.campaigns, 4);
      assert.equal(st.restore(b.text, b.filename).ok, true);
      assert.deepEqual(st.counts(), before);
      assert.equal(st.state.local.restored_from, b.filename);
      assert.equal(S.createStore({ seed: SEED, storage: ls }).counts().campaigns, 5);
    });
    test('restore refuses non-backup files', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      assert.deepEqual(st.previewRestore('nope').errors, ['not_json']);
      assert.deepEqual(st.previewRestore(JSON.stringify(SEED)).errors, ['schema_missing']);
      assert.deepEqual(st.previewRestore(JSON.stringify({ schema_version: 99 })).errors, ['schema_newer']);
      assert.ok(st.previewRestore(JSON.stringify({ schema_version: 1, lookups: { journey_steps: [] } })).errors.includes('missing:deals'));
    });
    test('TC-26 basis: setItem throws → app keeps the data in memory, canSave = false', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage({ set: true }) });
      assert.equal(st.status.canSave, false);
      assert.equal(st.counts().deals, 305);
      st.state.deals[0].remark = 'แก้ในหน่วยความจำ';
      assert.equal(st.save(), false);
      assert.equal(st.state.deals[0].remark, 'แก้ในหน่วยความจำ');
      assert.equal(st.backup().text.includes('แก้ในหน่วยความจำ'), true, 'backup still works');
    });
    test('TC-26 basis: storage unavailable (getItem throws / null) → seed in memory', () => {
      const a = S.createStore({ seed: SEED, storage: fakeStorage({ get: true }) });
      assert.equal(a.status.canSave, false);
      assert.equal(a.counts().kol_master, 911);
      const b = S.createStore({ seed: SEED, storage: null });
      assert.equal(b.status.canSave, false);
      assert.equal(b.save(), false);
    });
    test('unreadable saved data → seed + a copy of the old text', () => {
      const ls = fakeStorage();
      ls.setItem(S.KEY, '{broken');
      const st = S.createStore({ seed: SEED, storage: ls });
      assert.equal(st.status.corrupt, true);
      assert.equal(ls.map.get(S.CORRUPT_KEY), '{broken');
      assert.equal(ls.map.get(S.KEY), '{broken', 'the old text stays until the next change');
      assert.equal(st.counts().deals, 305);
    });
    test('IDs continue from the highest number', () => {
      const st = S.createStore({ seed: SEED, storage: fakeStorage() });
      assert.equal(st.newId('deal'), 'D000306');
      assert.equal(st.newId('post'), 'P000314');
      assert.equal(st.newId('kol'), 'K0912');
      assert.equal(st.newId('quote'), 'Q00525');
      assert.equal(st.newLogId(), 771);
    });
    test('backup reminder: days since last backup', () => {
      const s = fresh();
      assert.equal(S.daysSinceBackup(s, TODAY), null);
      s.local.last_backup_at = '2026-09-27T10:00:00Z';
      assert.equal(S.daysSinceBackup(s, TODAY), 8);
    });
  });

  describe('KOL Master (Round 2)', () => {
    const kolDraft = (s, id) => Object.assign({}, R.kolById(s, id), { accounts: R.accountsOfKol(s, id).map(a => Object.assign({}, a)) });
    test('TC-16 basis: genygee28 (K0011) — 3 deals in 3 campaigns, 2 quotes, latest ฿3,000', () => {
      const s = fresh(), deals = R.dealsOfKol(s, 'K0011');
      assert.deepEqual(deals.map(d => d.legacy_phase_id).sort(), ['AC-P1', 'CH-P1', 'KS-P1']);
      assert.deepEqual(deals.map(d => d.campaign_id).sort(), ['AC', 'CH', 'KS']);
      const q = R.quotesOfKol(s, 'K0011');
      assert.deepEqual(q.map(x => x.quote_id), ['Q00263', 'Q00022']);
      assert.equal(q[1].note, 'Ratecard: รออัพเดต');
      assert.equal(R.baht(R.totalCost(R.latestQuote(s, 'K0011'))), '฿3,000');
    });
    test('latest quote: dated before undated, then highest quote_id; prefill uses the latest one with a rate card', () => {
      const qs = [{ quote_id: 'Q00002', quoted_at: null, rate_card: 9 }, { quote_id: 'Q00001', quoted_at: '2026-01-01', rate_card: null }, { quote_id: 'Q00003', quoted_at: null, rate_card: null }];
      assert.deepEqual(R.sortQuotes(qs).map(q => q.quote_id), ['Q00001', 'Q00003', 'Q00002']);
      const s = fresh();
      s.kol_rate_quotes.push({ quote_id: 'Q09999', kol_id: 'K0120', quoted_at: '2026-10-01', rate_card: null, note: 'รอ' });
      assert.equal(R.latestQuote(s, 'K0120').quote_id, 'Q09999');
      assert.equal(R.latestPricedQuote(s, 'K0120').quote_id, 'Q00231');
    });
    test('TC-17 basis: bojittiwa (K0120) → KS creates List/Shortlist, PIC Pang · costs empty, ฿6,500 is the Latest rate (CR-07 §4.5)', () => {
      const s = fresh(), k = R.kolById(s, 'K0120');
      assert.deepEqual(R.checkAddToCampaign(s, 'K0120', 'KS', k.pic, 'postpaid').errs, []);
      const { deal, log } = R.shortlistDeal(s, 'K0120', { dealId: 'D000306', logId: 771, campaignId: 'KS', pic: k.pic, date: TODAY, note: 'x' });
      assert.equal(deal.status, 'List');
      assert.equal(deal.sub_status, 'Shortlist');
      assert.equal(deal.pic, 'Pang');
      /* CR-07 §4.5 replaced the prefill: the fields stay empty and ฿6,500 shows as the Latest rate */
      assert.equal(deal.rate_card, null);
      assert.equal(R.totalCost(deal), 0);
      assert.equal(R.costReference(s, 'K0120').latest.total, 6500);
      assert.deepEqual(Object.keys(deal).sort(), Object.keys(s.deals[0]).sort(), 'same fields as seed deals');
      assert.equal(log.from_sub_status, null);
      assert.equal(log.sub_status, 'Shortlist');
      assert.equal(log.effective_date, TODAY);
    });
    test('add to Campaign: campaign and PIC required; existing deal → info; Blacklist → warning', () => {
      const s = fresh();
      assert.ok(R.checkAddToCampaign(s, 'K0120', '', 'Pang').errs.some(e => e.field === 'campaign_id'));
      assert.ok(R.checkAddToCampaign(s, 'K0120', 'KS', '').errs.some(e => e.field === 'pic'));
      assert.ok(R.checkAddToCampaign(s, 'K0233', 'KS', 'Pizza').infos.some(i => i.msg === C.msg.addExisting(1)));
      R.kolById(s, 'K0120').kol_status = 'Blacklist';
      assert.ok(R.checkAddToCampaign(s, 'K0120', 'KS', 'Pang').warns.length);
    });
    test('TC-18 basis: sundayary + bojittiwa → KS adds 1, skips sundayary (D000115)', () => {
      const s = fresh(), plan = R.planShortlist(s, ['K0233', 'K0120'], 'KS', '', 'postpaid');
      assert.deepEqual(plan.errs, []);
      assert.deepEqual(plan.add.map(k => k.display_name), ['bojittiwa']);
      assert.deepEqual(plan.skip.map(x => [x.kol.display_name, x.dealIds]), [['sundayary', ['D000115']]]);
    });
    test('bulk add: KOLs without PIC need a fallback PIC', () => {
      const s = fresh();
      R.kolById(s, 'K0120').pic = null;
      assert.ok(R.planShortlist(s, ['K0120'], 'KS', '').errs.some(e => e.field === 'pic'));
      assert.deepEqual(R.planShortlist(s, ['K0120'], 'KS', 'Amp', 'postpaid').errs, []);
    });
    test('default Phase = latest one that today falls in', () => {
      assert.equal(R.defaultPhaseId(fresh(), TODAY), 'PH-OCT');
      assert.equal(R.defaultPhaseId(fresh(), '2027-01-01'), 'PH-OCT');
      assert.equal(R.defaultPhaseId(fresh(), '2026-08-20'), 'KS-P1');
    });
    test('TC-19 basis: a new KOL using TikTok @KIAOKOY_22 is refused (case-insensitive)', () => {
      const s = fresh();
      const r = R.validateKol(s, { kol_id: null, display_name: 'ใหม่', kol_status: 'Active',
        accounts: [{ account_id: null, platform: 'TikTok', handle: 'KIAOKOY_22', profile_link: 'https://www.tiktok.com/@KIAOKOY_22', followers: '100' }] });
      assert.ok(r.errs.some(e => e.msg.includes('เป็นของ kiaokoy_22 (K0001) อยู่แล้ว')), JSON.stringify(r.errs));
    });
    test('KOL rules: name, ≥1 account, complete new accounts, Blacklist reason', () => {
      const s = fresh();
      const r = R.validateKol(s, { kol_id: null, display_name: '', kol_status: 'Blacklist', status_reason: '', accounts: [] });
      ['display_name', 'accounts', 'status_reason'].forEach(f => assert.ok(r.errs.some(e => e.field === f), f));
      const r2 = R.validateKol(s, { kol_id: null, display_name: 'x', kol_status: 'Active',
        accounts: [{ account_id: null, platform: '', handle: '@bad name', profile_link: 'www.x.com', followers: '-1' }] });
      ['acc0_platform', 'acc0_handle', 'acc0_profile_link', 'acc0_followers'].forEach(f => assert.ok(r2.errs.some(e => e.field === f), f));
    });
    test('KOL rules: untouched legacy accounts pass; touching them requires completion', () => {
      const s = fresh(), legacy = s.kol_accounts.find(a => a.is_legacy);
      const d = kolDraft(s, legacy.kol_id);
      assert.deepEqual(R.validateKol(s, d).errs, []);
      const i = d.accounts.findIndex(a => a.account_id === legacy.account_id);
      d.accounts[i].handle = legacy.handle + 'x';
      assert.ok(R.validateKol(s, d).errs.length > 0, 'a touched legacy account must be completed');
      assert.equal(R.accountComplete(legacy), false);
    });
    test('KOL rules: cannot remove an account with posts; duplicate in list; link mismatch and same name warn', () => {
      const s = fresh(), d = kolDraft(s, 'K0001');
      d.accounts = [];
      assert.ok(R.validateKol(s, d).errs.some(e => e.msg.startsWith('ลบบัญชี @kiaokoy_22')));
      const d2 = kolDraft(s, 'K0011');
      d2.accounts.push({ account_id: null, platform: 'TikTok', handle: 'GENYGEE28', profile_link: 'https://www.tiktok.com/@genygee28', followers: '1' });
      assert.ok(R.validateKol(s, d2).errs.some(e => e.msg === C.msg.accDupInList(2, 1)));
      const d3 = kolDraft(s, 'K0011');
      d3.accounts.push({ account_id: null, platform: 'Instagram', handle: 'genygee28', profile_link: 'https://www.tiktok.com/@someoneelse', followers: '5200' });
      const r3 = R.validateKol(s, d3);
      assert.deepEqual(r3.errs, []);
      assert.ok(r3.warns.some(w => w.msg === C.msg.accLinkHandle(2, 'someoneelse', 'genygee28')));
      assert.ok(r3.warns.some(w => w.msg === C.msg.accLinkPlatform(2, 'TikTok', 'Instagram')));
      const r4 = R.validateKol(s, { kol_id: null, display_name: 'GenyGee28', kol_status: 'Active', accounts: [{ account_id: null, platform: 'X', handle: 'gg', profile_link: 'https://x.com/gg', followers: '1' }] });
      assert.ok(r4.warns.some(w => w.msg === C.msg.kolNameDup('K0011')));
    });
    test('tier of an added IG account (5,200) is Nano while the KOL max stays Micro', () => {
      const s = fresh(), accs = R.accountsOfKol(s, 'K0011').concat([{ followers: 5200 }]);
      assert.equal(R.tierOf(5200, s.lookups.tier_rules), 'Nano');
      assert.equal(R.tierOf(R.maxFollowers(accs), s.lookups.tier_rules), 'Micro');
    });
    test('quote rules', () => {
      const s = fresh(), base = { kol_id: 'K0011', account_id: 'A00011', quoted_at: TODAY, source: 'บันทึกเอง' };
      assert.ok(R.validateQuote(s, Object.assign({}, base)).errs.some(e => e.msg === C.msg.quoteEmpty));
      assert.deepEqual(R.validateQuote(s, Object.assign({ rate_card: '4000' }, base)).errs, []);
      assert.ok(R.validateQuote(s, Object.assign({ rate_card: '-1' }, base)).errs.length);
      assert.ok(R.validateQuote(s, Object.assign({ note: 'x' }, base, { account_id: 'A00001' })).errs.some(e => e.field === 'account_id'));
    });
    test('TC-20 basis: merging B into A moves accounts, deals and quotes; B is gone; TC-02 totals unchanged', () => {
      const s = fresh(), before = {};
      s.phases.forEach(p => { before[p.phase_id] = R.phaseCommitted(s, p.phase_id); });
      const p = R.mergePreview(s, 'K0233', 'K0011');
      assert.deepEqual(p.errs, []);
      assert.deepEqual([p.accounts, p.deals, p.quotes], [1, 2, 2]);
      Object.assign(s, R.applyMerge(s, 'K0233', 'K0011'));
      assert.equal(R.kolById(s, 'K0233'), null);
      assert.equal(s.kol_master.length, 910);
      assert.equal(R.accountsOfKol(s, 'K0011').length, 2);
      assert.equal(R.dealsOfKol(s, 'K0011').length, 5);
      assert.equal(R.quotesOfKol(s, 'K0011').length, 4);
      s.phases.forEach(x => assert.equal(R.phaseCommitted(s, x.phase_id), before[x.phase_id], x.phase_id));
      const k = R.kolById(s, 'K0011');
      assert.ok(k.note.includes('รวมจาก K0233 (sundayary)'));
      assert.ok(k.sources.includes('Perfect Heart / KOL Master'));
      assert.equal(k.pic, 'Ja', 'the kept KOL keeps its own PIC');
      assert.ok(R.mergePreview(s, 'K0011', 'K0011').errs.length);
    });
  });

  describe('Deals (Round 3)', () => {
    const ctxOf = s => R.dealContext(s);
    const postsOf = (s, id) => R.postsOf(s, id).map(p => Object.assign({}, p));
    test('TC-04: D000150 — 4 posts, ● on IG / X / Lemon8 / TikTok, total ฿6,000, Template platforms "/"', () => {
      const s = fresh(), c = ctxOf(s);
      assert.deepEqual(['TikTok', 'Instagram', 'Facebook', 'X', 'Lemon8'].map(p => R.platformMark(c, 'D000150', p)), ['posted', 'posted', '', 'posted', 'posted']);
      const row = R.templateRow(s, deal(s, 'D000150'), c);
      assert.deepEqual(row.slice(7, 12), ['/', '/', '', '/', '/']);
      assert.equal(row[20], 6000);
      assert.equal(row[31].split('\n').length, 4, 'Date Post has one line per post');
    });
    test('TC-09: a new post with the D000060 link plus ?lang=th is a duplicate', () => {
      const s = fresh(), d = deal(s, 'D000044'), posts = postsOf(s, 'D000044');
      posts[0].post_link = 'https://www.tiktok.com/@jobimjb/video/7686848235146693908?lang=th';
      const r = R.validateDeal(s, d, posts, TODAY);
      assert.ok(r.errs.some(e => e.field === 'post0_post_link' && e.msg.includes('D000060') && e.msg.includes('jobimjb')), JSON.stringify(r.errs));
    });
    test('TC-11: D000001 cannot change KOL (has posts); a post account must belong to the KOL', () => {
      const s = fresh(), d = Object.assign({}, deal(s, 'D000001'), { kol_id: 'K0011' });
      const r = R.validateDeal(s, d, postsOf(s, 'D000001'), TODAY);
      assert.ok(r.errs.some(e => e.msg === C.msg.dealKolLocked(1)));
      assert.ok(r.errs.some(e => e.field === 'post0_account_id'));
    });
    test('TC-12: ticking paid 50% without documents → date = today and a warning', () => {
      const s = fresh(), d = R.togglePayment(deal(s, 'D000044'), 'paid_50', true, TODAY);
      assert.equal(d.paid_50, true);
      assert.equal(d.paid_50_date, TODAY);
      assert.ok(R.validateDeal(s, d, postsOf(s, 'D000044'), TODAY).warns.some(w => w.msg === C.msg.payNoDocs));
      const off = R.togglePayment(d, 'paid_50', false, TODAY);
      assert.equal(off.paid_50_date, null);
    });
    test('TC-14: D000001 — Campaign over budget ฿13,700 is shown but not counted in the ⚠ column (CR-03)', () => {
      const s = fresh(), c = ctxOf(s), d = deal(s, 'D000001');
      const r = R.validateDeal(s, d, R.postsOfCtx(c, 'D000001'), TODAY, c);
      const phase = r.warns.filter(w => w.kind === 'phase');
      assert.deepEqual(phase.map(w => w.msg), [C.msg.campaignOver('฿13,700')]);
      assert.equal(R.rowWarnings(s, d, TODAY, c).length, r.warns.length - 1);
    });
    test('TC-15: D000114 is found by the overdue filter', () => {
      const s = fresh();
      assert.ok(R.filterDeals(s, { overdue: true }, TODAY, ctxOf(s)).some(d => d.deal_id === 'D000114'));
      assert.ok(!R.filterDeals(s, { overdue: true }, TODAY, ctxOf(s)).some(d => d.status === 'Complete'));
    });
    test('stored data: no deal is blocked by errors (legacy rows are exempt from completeness only)', () => {
      const s = fresh(), c = ctxOf(s);
      s.deals.forEach(d => assert.deepEqual(R.validateDeal(s, d, R.postsOfCtx(c, d.deal_id), TODAY, c).errs, [], d.deal_id));
      const legacy = s.deals.filter(d => d.is_legacy);
      assert.ok(legacy.some(d => R.validateDeal(s, d, R.postsOfCtx(c, d.deal_id), TODAY, c).strict.length > 0), 'legacy rows keep strict errors');
    });
    test('Complete without date/link: error for normal deals, allowed for legacy', () => {
      const s = fresh(), d = deal(s, 'D000150'), posts = postsOf(s, 'D000150');
      posts[0].post_link = '';
      assert.ok(R.validateDeal(s, d, posts, TODAY).errs.some(e => e.msg === C.msg.completePostsIncomplete(1)));
      assert.deepEqual(R.validateDeal(s, Object.assign({}, d, { is_legacy: true }), posts, TODAY).errs, []);
      assert.ok(R.validateDeal(s, Object.assign({}, d, { pic: '' }), posts.slice(1), TODAY).errs.some(e => e.field === 'pic'));
    });
    test('duplicate links in the legacy data warn while untouched, and block once edited', () => {
      const s = fresh(), d = deal(s, 'D000076'), posts = postsOf(s, 'D000076');
      const r = R.validateDeal(s, d, posts, TODAY);
      assert.deepEqual(r.errs, []);
      assert.ok(r.warns.some(w => w.msg.includes('D000077')));
      posts[0].post_link = posts[0].post_link.split('?')[0] + '?lang=th';   // edited, but still the same post after normLink
      assert.ok(R.validateDeal(s, d, posts, TODAY).errs.some(e => e.msg.includes('D000077')));
    });
    test('money ≥ 0, whole-day Gencode, single links, draft before brief', () => {
      const s = fresh(), d = Object.assign({}, deal(s, 'D000044'), { rate_card: '-5', gencode_period: '2.5', link_brief: 'a b', approved_draft1_date: '2026-09-01' });
      const r = R.validateDeal(s, d, postsOf(s, 'D000044'), TODAY);
      ['rate_card', 'gencode_period', 'link_brief'].forEach(f => assert.ok(r.errs.some(e => e.field === f), f));
      assert.ok(r.warns.some(w => w.msg === C.msg.draftBeforeBrief(1)));
    });
    test('new deal: start step date, one post per ticked account with the deal expected date', () => {
      const s = fresh();
      const o = R.newDeal(s, { dealId: 'D000306', logId: 771, phaseId: 'KS-P2', kolId: 'K0011', sub: 'Brief', pic: 'Ja',
        extra: { expected_post_date: '2026-10-20', rate_card: 3000 }, accountIds: ['A00011'], postIds: ['P000314'], date: TODAY });
      assert.equal(o.deal.status, 'Inprocess');
      assert.equal(o.deal.brief_date, TODAY);
      assert.equal(o.posts.length, 1);
      assert.equal(o.posts[0].expected_post_date, '2026-10-20');
      assert.equal(o.posts[0].platform, 'TikTok');
      assert.equal(o.log.sub_status, 'Brief');
    });
    test('tiles for CH-P1: committed vs budget (deals with a post in CH-P1, shares of those posts)', () => {
      const s = fresh(), rows = R.filterDeals(s, { phase: 'CH-P1' }, TODAY, ctxOf(s)), t = R.dealTiles(s, rows, ['CH-P1'], TODAY);
      assert.equal(t.count, 61);
      assert.equal(t.committed, 573050);
      assert.equal(t.budget, 500000);
    });
  });

  describe('Pipeline · Overview · Export · Import · Lists (Round 4)', () => {
    test('TC-21: Pipeline CH-P1 — Brief 2 · Approve Draft 1 1 · Post 58 (deals with a post in CH-P1)', () => {
      const cols = R.pipeline(fresh(), 'CH-P1').filter(c => c.count).map(c => [c.step.sub_status, c.count]);
      assert.deepEqual(cols, [['Brief', 2], ['Approve Draft 1', 1], ['Post', 58]]);
    });
    test('TC-22: Template export header = deal_id, Phase + the 36 Template columns', () => {
      const s = fresh(), t = R.templateExport(s, s.deals, R.dealContext(s));
      assert.equal(t.header.length, 38);
      assert.deepEqual(t.header.slice(0, 3), ['deal_id', 'Phase', 'Pilar']);
      assert.ok(t.header.includes('Brief Date') && t.header.includes('Approved Draft 1 Date'));
      assert.equal(t.rows.length, 305);
      assert.ok(t.rows.every(r => r.length === 38));
    });
    test('CSV writes quotes, commas and new lines safely; the parser reads them back', () => {
      const csv = R.toCSV(['a', 'b', 'c'], [{ a: 'x,y', b: 'line1\nline2', c: true }, ['q"q', null, ['p', 'r']]]);
      assert.deepEqual(R.parseCSV('﻿' + csv), [['a', 'b', 'c'], ['x,y', 'line1\nline2', 'true'], ['q"q', '', 'p | r']]);
    });
    test('Looker CSV rows carry the computed columns', () => {
      const s = fresh(), c = R.dealContext(s), row = R.dealsRows(s, [deal(s, 'D000114')], TODAY, c)[0];
      assert.equal(row.is_overdue, true);
      assert.equal(row.due_date, '2026-08-12');
      assert.equal(row.next_step, 'Approve Draft 1');
      assert.equal(row.campaign_id, 'KS');
      assert.equal(R.postsRows(s, R.postsOf(s, 'D000150'), c)[0].kol_name, R.kolById(s, deal(s, 'D000150').kol_id).display_name);
    });
    test('TC-23: import preview — match / new KOL / new account (needs a tick)', () => {
      const s = fresh(), csv = 'display_name,platform,profile_link,followers,rate_card\n' +
        'kiaokoy_22,TikTok,https://www.tiktok.com/@kiaokoy_22,1500000,40000\n' +
        'คนใหม่,TikTok,https://www.tiktok.com/@brand_new_kol,12000,5000\n' +
        'genygee28,Instagram,https://www.instagram.com/genygee28,5200,\n' +
        ',TikTok,https://www.tiktok.com/@x,1,';
      const plan = R.planImport(s, R.parseCSV(csv));
      assert.equal(plan.headerError, null);
      assert.deepEqual(plan.rows.map(r => r.kind), ['match', 'new_kol', 'new_account', 'error']);
      assert.equal(plan.rows[2].needsConfirm, true);
      const skipped = R.applyImport(s, plan, new Set(), 'list.csv', TODAY);
      assert.equal(skipped.summary.new_account, 0);
      assert.equal(skipped.summary.skipped, 1);
      const out = R.applyImport(s, plan, new Set([plan.rows[2].n]), 'list.csv', TODAY);
      assert.deepEqual([out.summary.match, out.summary.new_kol, out.summary.new_account, out.summary.quotes], [1, 1, 1, 2]);
      assert.equal(out.kol_master.length, 912);
      assert.equal(out.kol_accounts.find(a => a.account_id === 'A00001').followers, 1500000, 'followers go up only');
      assert.ok(out.kol_accounts.some(a => a.kol_id === 'K0011' && a.platform === 'Instagram'));
      const q = out.kol_rate_quotes[out.kol_rate_quotes.length - 1];
      assert.equal(q.source, 'import:list.csv');
      assert.equal(q.quoted_at, TODAY);
      assert.ok(out.kol_master.find(k => k.kol_id === 'K0001').sources.includes('list.csv'));
      assert.equal(s.kol_master.length, 911, 'the input state is not changed');
    });
    test('import: missing columns, bad links and duplicate rows are reported', () => {
      const s = fresh();
      assert.ok(R.planImport(s, [['name']]).headerError);
      const plan = R.planImport(s, R.parseCSV('display_name,profile_link,followers\na,notalink,1\nb,https://www.tiktok.com/@dupe,1\nc,https://www.tiktok.com/@dupe,1'));
      assert.deepEqual(plan.rows.map(r => r.kind), ['error', 'new_kol', 'error']);
      assert.equal(R.handleFromAnyLink('https://www.facebook.com/somepage/'), 'somepage');
      assert.equal(R.handleFromAnyLink('https://www.lemon8-app.com/@ttukablythe_'), 'ttukablythe_');
    });
    test('TC-24: funnel = 300 deals (Cancel 5 separate); posts outside the default window list D000041 first', () => {
      const s = fresh(), all = s.phases.map(p => p.phase_id), f = R.funnel(s, all);
      assert.equal(f.total, 300);
      assert.equal(f.cancel, 5);
      const [from, to] = R.overviewWindow(s, all, TODAY);
      assert.deepEqual([from, to], ['2026-08-17', TODAY]);
      const b = R.postBins(s, all, from, to, 'day');
      assert.equal(b.outside[0].deal.deal_id, 'D000041');
      assert.equal(b.bins.reduce((x, y) => x + y.n, 0), b.total);
      const w = R.postBins(s, all, from, to, 'week');
      assert.equal(new Date(w.bins[0].key + 'T00:00:00Z').getUTCDay(), 1, 'weeks start on Monday');
      assert.equal(w.total, b.total);
    });
    test('TC-25 basis: Brief is in use (cannot delete); Post/Cancel are locked; list values in use', () => {
      const s = fresh();
      assert.ok(R.stepUse(s, 'Brief') > 0);
      assert.equal(R.stepLocked(R.stepOf(s.lookups, 'Post')), true);
      assert.equal(R.stepLocked(R.stepOf(s.lookups, 'Approve Script')), false);
      assert.equal(R.stepUse(s, 'Approve Script'), 0);
      /* CR-04: the PIC list moved to Role Management — the same rules on the other lists */
      assert.ok(R.listValueUse(s, 'platform_list', 'TikTok') > 0);
      assert.equal(R.listValueUse(s, 'cta_list', 'Eveandboy'), 0);
      s.lookups.inactive_values = { cta_list: ['Eveandboy'] };
      assert.equal(R.activeValues(s.lookups, 'cta_list').includes('Eveandboy'), false);
      assert.ok(R.validateListValue(s, 'cta_list', 'eveandboy').errs.length);
    });
    test('tier rules: one tier must start at 0; no duplicates', () => {
      assert.deepEqual(R.validateTiers(fresh().lookups.tier_rules).errs, []);
      assert.ok(R.validateTiers([{ tier: 'A', min_followers: 10 }]).errs.some(e => e.msg === C.msg.tierZero));
      assert.ok(R.validateTiers([{ tier: 'A', min_followers: 0 }, { tier: 'a', min_followers: 0 }]).errs.length >= 2);
    });
    test('data to check: 4 duplicate pairs, D000041 TikTok date, AC-P1 swapped dates', () => {
      const x = R.dataIssues(fresh());
      assert.deepEqual(x.dupLinks.map(g => g.map(y => y.deal.deal_id).sort().join('/')).sort(), ['D000076/D000077', 'D000125/D000126', 'D000136/D000164', 'D000139/D000175']);
      assert.deepEqual(x.tiktok.map(y => y.deal.deal_id), ['D000041']);
      assert.ok(x.swapped.length >= 20 && x.swapped.every(y => y.deal.campaign_id === 'AC'));
      assert.ok(x.pillar.length > 0);
    });
  });

  describe('no personal data', () => {
    test('TC-27 basis: seed and UI text have no phone / address', () => {
      assert.equal(PII.test(JSON.stringify(SEED)), false);
      const texts = [];
      const walk = o => { if (typeof o === 'string') texts.push(o); else if (typeof o === 'function') texts.push(String(o)); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
      /* CR-08: the only exceptions are the labels of the encrypted Payee bank details, the PR column headers Accounting uses and the export dialog
         that names them — the values are never stored in plain text */
      /* CR-10 §4.14: the labels of the encrypted shipping details (recipient · phone · address) too */
      walk(Object.assign({}, C, { payee: Object.assign({}, C.payee, { bank: {} }), pay: Object.assign({}, C.pay, { prCols: [], exportLocked: '' }), samples: {} }));
      assert.equal(texts.some(x => PII.test(x)), false);
    });
  });
});
