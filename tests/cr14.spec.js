/* cr14.spec.js — CR-14 test cases (Status filter · ui.multiSelect · Campaign tree search · Last campaign · contact_id · Import template), run by tests/test.html.
   "today" is 07/10/2026 · the seed · This year · money anchors stay those of CR-05 §5.0 / CR-09 §5.0 / CR-13 §5.0 with the default Status. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, SEED, C, E } = t;
  const TD = '2026-10-07';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-07T03:00:00Z'));
  const camp = (s, n) => s.campaigns.find(c => c.campaign_name.startsWith(n));
  const year = () => R.presetRange('this_year', TD);
  const kpis = (s, st) => { const [f, to] = year(), k = R.portfolioKpis(s, f, to, TD, st); return [k.campaigns.n, k.deals.n, k.money.committed, k.money.budget, k.money.remaining, k.money.pending]; };

  describe('CR-14 §4.1 · Dashboard › All campaigns › Status', () => {
    test('TC-01: the default (all but Cancelled) = the numbers of before · 4 campaigns · 300 deals · ฿1,783,579 / ฿2,748,400 · Remaining ฿964,821 · Pending ฿98,000', () => {
      const s = fresh();
      assert.deepEqual(R.DASH_STATUS_DEFAULT, ['ongoing', 'not_started', 'on_hold', 'complete']);
      assert.deepEqual(kpis(s, R.DASH_STATUS_DEFAULT), [4, 300, 1783579, 2748400, 964821, 98000]);
      assert.deepEqual(kpis(s, R.DASH_STATUS_DEFAULT), kpis(s, false), 'the same as the old "Include cancelled" off');
      assert.equal(R.dashStatusText(R.DASH_STATUS_DEFAULT).kind, 'default');
      assert.equal(R.DASH_STATUS_KEY, 'dash.all.statuses');
    });
    test('TC-02: On going only — 3 campaigns (Charming · Kiss Signal · Perfect Heart) · 271 deals · ฿1,775,779 of ฿2,348,400 · Remaining ฿572,621 · Pending ฿21,300 · every widget', () => {
      const s = fresh(), [f, to] = year(), st = ['ongoing'];
      assert.deepEqual(kpis(s, st), [3, 271, 1775779, 2348400, 572621, 21300]);
      assert.deepEqual(R.portfolioScope(s, f, to, TD, st).map(c => c.campaign_name.split(' ')[0]), ['Charming', 'Kiss', 'Perfect']);
      const p = R.portfolio(s, f, to, TD, st);
      assert.equal(p.rows.length, 3); assert.equal(p.total.committed, 1775779, 'the Total row of the portfolio');
      assert.equal(R.swimlanes(s, f, to, 'week', 'posts', TD, st).lanes.length, 3);
      assert.equal(R.pillarMix(s, f, to, TD, st).total.spend, 1775779);
      assert.equal(R.tierMix(s, f, to, TD, st).total.spend, 1775779);
    });
    test('TC-03: Complete only — Acne Fade Concealer · 29 deals · ฿7,800 of ฿400,000 · Pending ฿76,700 · one lane', () => {
      const s = fresh(), [f, to] = year();
      assert.deepEqual(kpis(s, ['complete']).filter((v, i) => i !== 4), [1, 29, 7800, 400000, 76700]);
      assert.equal(R.swimlanes(s, f, to, 'week', 'posts', TD, ['complete']).lanes[0].campaign.campaign_name, camp(s, 'Acne').campaign_name);
    });
    test('TC-04 / TC-05: the last status cannot be taken off · Cancelled added → "All", the same numbers (no cancelled campaign in the seed)', () => {
      const opts = R.CAMPAIGN_STATUSES.map(k => ({ value: k, label: C.phaseStatus[k] }));
      assert.deepEqual(R.msToggle(opts, ['ongoing'], 'ongoing', false, 1), ['ongoing']);
      assert.equal(R.msLocked(['ongoing'], 'ongoing', 1), true);
      assert.equal(R.msLocked(['ongoing', 'complete'], 'ongoing', 1), false);
      assert.equal(C.overview.statusMin, 'Select at least one status');
      const all = ['cancelled', 'pending'].reduce((v, k) => R.msToggle(opts, v, k, true, 1), R.DASH_STATUS_DEFAULT);   // CR-17: + Pending approval for "All" (CR-21: no Rejected)
      assert.deepEqual(all, R.CAMPAIGN_STATUSES);
      assert.equal(R.dashStatusText(all).kind, 'all');
      const s = fresh(); assert.deepEqual(kpis(s, all), kpis(s, R.DASH_STATUS_DEFAULT));
      assert.deepEqual(R.statusCounts(s, ...year(), TD), { ongoing: 3, not_started: 0, pending: 0, on_hold: 0, complete: 1, cancelled: 0 });
    });
    test('the words on the button: default · All · 1–2 names · "n selected" · nothing valid → the default', () => {
      const w = v => { const x = R.dashStatusText(v); return x.kind === 'default' ? C.overview.statusAllExcept : x.kind === 'all' ? C.overview.statusAll : x.kind === 'names' ? x.list.map(k => C.phaseStatus[k]).join(', ') : C.ms.nSelected(x.n); };
      assert.equal(C.overview.statusBtn(w(R.DASH_STATUS_DEFAULT)), 'Status: All except cancelled');
      assert.equal(C.overview.statusBtn(w(R.CAMPAIGN_STATUSES)), 'Status: All');
      assert.equal(C.overview.statusBtn(w(['ongoing'])), 'Status: On going');
      assert.equal(C.overview.statusBtn(w(['complete', 'ongoing'])), 'Status: On going, Complete', 'in §4.7 order');
      assert.equal(C.overview.statusBtn(w(['ongoing', 'on_hold', 'complete'])), 'Status: 3 selected');
      assert.deepEqual(R.normDashStatuses([]), R.DASH_STATUS_DEFAULT);
      assert.deepEqual(R.normDashStatuses(['nope']), R.DASH_STATUS_DEFAULT);
    });
    test('TC-06: kept for each person (one JSON {userId: list}) · Reset = the default', () => {
      let json = R.userPrefSet('', 'U000', ['ongoing']);
      json = R.userPrefSet(json, 'U007', ['complete']);
      assert.deepEqual([R.normDashStatuses(R.userPrefGet(json, 'U000')), R.normDashStatuses(R.userPrefGet(json, 'U007')), R.normDashStatuses(R.userPrefGet(json, 'U001'))],
        [['ongoing'], ['complete'], R.DASH_STATUS_DEFAULT]);
      assert.equal(R.userPrefGet('not json', 'U000'), undefined);
      assert.equal(R.isDefaultStatuses(['ongoing']), false);
    });
    test('TC-07: Export of the tab with On going — the Summary sheet says "Status: On going" under the range · the numbers = the screen', () => {
      const s = fresh(), [f, to] = year(), x = { state: s, from: f, to, today: TD, statuses: ['ongoing'], measure: 'posts', sort: null };
      const tables = E.tabTables('all', x), sum = tables[0];
      assert.ok(sum.rows.some(r => r[1] === C.overview.deals && r[2] === 271));
      assert.ok(sum.rows.some(r => r[1] === C.money.committed.h && r[2] === 1775779));
      const sheet = E.sheetOf(sum, { tab: 'All campaigns', scope: 'This year · 01/01/2026 – 31/12/2026', status: 'On going', at: '07/10/2026 10:00', by: 'Admin' });
      const row = sheet.rows.find(r => r[0] && r[0].v === C.overview.meta.status);
      assert.equal(row[1], 'On going');
      assert.equal(tables[1].rows.length, 3, 'Campaign portfolio');
    });
  });

  describe('CR-14 §4.2 · ui.multiSelect — the part without a screen', () => {
    const opts = [{ value: 'CH', label: 'Charming Iconic Glow' }, { value: 'KS', label: 'Kiss Signal Lip Gloss' }, { value: 'PH', label: 'Perfect Heart ซอง 7-11' }, { value: 'AC', label: 'Acne Fade Concealer' }];
    test('TC-09: search "kiss" → Kiss Signal Lip Gloss · no case · trimmed · Thai · nothing → empty (No matches)', () => {
      assert.deepEqual(R.msFilter(opts, 'kiss').map(o => o.value), ['KS']);
      assert.deepEqual(R.msFilter(opts, '  KISS ').map(o => o.value), ['KS']);
      assert.deepEqual(R.msFilter(opts, 'ซอง').map(o => o.value), ['PH']);
      assert.equal(R.msFilter(opts, '').length, 4, 'the word removed → all again');
      assert.equal(R.msFilter(opts, 'zzz').length, 0);
      assert.equal(C.ms.noMatches, 'No matches');
    });
    test('tick · Select all (a search adds what it shows) · Clear · the order of the options stays', () => {
      assert.deepEqual(R.msToggle(opts, ['PH'], 'CH', true), ['CH', 'PH']);
      assert.deepEqual(R.msToggle(opts, ['CH', 'PH'], 'CH', false), ['PH']);
      assert.deepEqual(R.msToggle(opts, ['CH'], 'CH', false, 0), [], 'no minimum: it can be empty (= All campaigns)');
      assert.deepEqual(R.msSelectAll(opts, [], ''), ['CH', 'KS', 'PH', 'AC']);
      assert.deepEqual(R.msSelectAll(opts, ['AC'], 'kiss'), ['KS', 'AC']);
    });
  });

  describe('CR-14 §4.3 · Campaign & Phase › Search (R.filterCampaignTree)', () => {
    const tree = s => R.sortCampaigns(s.campaigns, s.phases, TD).map(c => ({ c, name: c.campaign_name, phases: R.sortPhases(s.phases.filter(p => p.campaign_id === c.campaign_id)).map(p => ({ p, name: R.phaseName(s, p.phase_id) })) }));
    const view = r => r.map(x => `${x.c.campaign_name.split(' ')[0]}:${x.match}:${x.phases.map(p => p.name.split(' · ')[0]).join('+')}`);
    test('TC-10: "Kiss" → Kiss Signal with Phase 1 · Phase 2 · its Total ฿600,000 / ฿340,400', () => {
      const s = fresh(), r = R.filterCampaignTree(tree(s), 'Kiss');
      assert.deepEqual(view(r), ['Kiss:campaign:Phase 1+Phase 2']);
      const t = R.moneyTotal(r.map(x => R.campaignMoney(s, x.c.campaign_id, R.phaseIndex(s))));
      assert.deepEqual([t.budget, t.committed], [600000, 340400]);
    });
    test('TC-11: "launch" → Charming (Phase 1 · Launch) + Kiss Signal (Phase 1 · Launch & Awareness) · the words found are marked', () => {
      const s = fresh(), r = R.filterCampaignTree(tree(s), 'launch');
      assert.deepEqual(r.map(x => [x.c.campaign_name.split(' ')[0], x.match, x.phases.map(p => p.name)]), [['Charming', 'phase', ['Phase 1 · Launch']], ['Kiss', 'phase', ['Phase 1 · Launch & Awareness']]]);
      assert.deepEqual(R.highlightParts('Phase 1 · Launch & Awareness', 'launch'), [{ t: 'Phase 1 · ', hit: false }, { t: 'Launch', hit: true }, { t: ' & Awareness', hit: false }]);
    });
    test('TC-12 / TC-13: "zzz" → nothing (No campaigns or phases match) · "Phase 3" → Perfect Heart with Phase 3 only · no query → as it is', () => {
      const s = fresh();
      assert.equal(R.filterCampaignTree(tree(s), 'zzz').length, 0);
      assert.equal(C.campaign.noSearchMatch('zzz'), 'No campaigns or phases match "zzz"');
      assert.deepEqual(view(R.filterCampaignTree(tree(s), '  phase 3 ')), ['Perfect:phase:Phase 3']);
      assert.deepEqual(R.filterCampaignTree(tree(s), '').map(x => x.match), [null, null, null, null]);
      assert.deepEqual(view(R.filterCampaignTree(tree(s), 'ซอง')).map(v => v.split(':')[0]), ['Perfect']);
    });
  });

  describe('CR-14 §4.4 · KOL Master › Last campaign', () => {
    const kol = (s, n) => s.kol_master.find(k => k.display_name === n);
    test('TC-14: the Campaign of the deal that gave Last worked — kiaokoy_22 · genygee28 (not Acne Fade Concealer) · bbingtiktokqueen = Charming Iconic Glow', () => {
      const s = fresh(), idx = R.phaseIndex(s);
      ['kiaokoy_22', 'genygee28', 'bbingtiktokqueen'].forEach(n => {
        const i = R.lastWorkedInfo(s, kol(s, n).kol_id);
        assert.equal(R.campaignName(s, i.campaignId), 'Charming Iconic Glow', n);
        assert.equal(i.date, R.lastWorked(s, kol(s, n).kol_id), 'the same day as Last worked');
        assert.equal(s.deals.find(d => d.deal_id === i.dealId).campaign_id, i.campaignId);
        assert.ok(s.deal_posts.some(p => p.post_id === i.postId && p.deal_id === i.dealId && (p.post_date === i.date || p.expected_post_date === i.date)));
      });
      const g = R.lastWorkedInfo(s, kol(s, 'genygee28').kol_id);
      assert.equal(g.date, '2026-09-04');
      assert.equal(R.phaseName(s, idx.post.get(R.lastWorkedInfo(s, kol(s, 'kiaokoy_22').kol_id).postId).phase), 'Phase 1 · Launch');
      assert.equal(C.kol.lastCampTip('Charming Iconic Glow', 'Phase 1 · Launch'), 'Charming Iconic Glow › Phase 1 · Launch');
      assert.equal(R.lastWorkedInfo(s, 'K-none'), null, 'never worked → — on screen');
    });
    test('TC-15: Export KOL Master — Last campaign · contact_channel · contact_id, the same values as the screen', () => {
      const s = fresh(), k = kol(s, 'genygee28');
      ['last_campaign', 'contact_channel', 'contact_id'].forEach(c => assert.ok(R.KOL_COLS.includes(c), c));
      const row = R.kolRows(s, [k])[0];
      assert.deepEqual([row.last_campaign, row.last_worked, row.contact_id], ['Charming Iconic Glow', '2026-09-04', null]);
      assert.equal(C.kol.colLastCampaign, 'Last campaign');
      assert.ok(!('colLastPhase' in C.kol));
    });
  });

  describe('CR-14 §4.5 · contact_id · schema 13', () => {
    test('TC-16: a schema 12 file loads as 13 · contact_id = null for all 911 KOLs · the other numbers do not move', () => {
      const s = fresh();
      assert.ok(S.SCHEMA_VERSION >= 13, 'later CRs move it on (CR-15: 14 · CR-16: 15)');
      assert.equal(s.schema_version, S.SCHEMA_VERSION);
      assert.equal(s.kol_master.length, 911);
      assert.equal(s.kol_master.filter(k => k.contact_id === null).length, 911);
      const v12 = JSON.parse(JSON.stringify(s)); v12.schema_version = 12; v12.kol_master.forEach(k => { delete k.contact_id; });
      const up = S.migrate(v12, new Date('2026-10-07T03:00:00Z'));
      assert.equal(up.schema_version, S.SCHEMA_VERSION);
      assert.ok(up.kol_master.every(k => k.contact_id === null));
      assert.deepEqual(kpis(up, R.DASH_STATUS_DEFAULT), [4, 300, 1783579, 2748400, 964821, 98000]);
    });
    test('TC-17 / TC-18: LINE + "kolsample.a" saves · "081-234-5678" → "Phone numbers can\'t be saved here. Use Payee vault." · 120 characters at most · a channel without an ID = a reminder', () => {
      const s = fresh(), k = s.kol_master.find(x => x.kol_id === 'K0011');
      const draft = o => Object.assign({}, k, { accounts: R.accountsOfKol(s, k.kol_id).map(a => Object.assign({}, a)) }, o);
      assert.deepEqual(R.validateKol(s, draft({ contact_channel: 'LINE', contact_id: 'kolsample.a' })).errs, []);
      const bad = R.validateKol(s, draft({ contact_channel: 'LINE', contact_id: '081-234-5678' }));
      assert.deepEqual(bad.errs.map(e => [e.field, e.msg]), [['contact_id', "Phone numbers can't be saved here. Use Payee vault."]]);
      assert.equal(R.validateKol(s, draft({ contact_id: 'x'.repeat(121) })).errs[0].field, 'contact_id');
      assert.ok(R.validateKol(s, draft({ contact_channel: 'LINE', contact_id: '' })).infos.some(i => i.msg === 'Add the contact ID so the team can reach this KOL'));
      assert.equal(R.validateCreateKol(s, Object.assign(R.createKolDraft('new one', { display_name: 'Ja', is_pic: true, pic_name: 'Ja' }), { pic: 'Ja', contact_id: '+66 81 234 5678' })).errs[0].field, 'ck_contact_id');
    });
    test('looksLikePhone: digits only after - spaces + are taken out, 9 or more · 10+ digits inside a text are refused too', () => {
      assert.deepEqual(['081-234-5678', '+66 81 234 5678', '0812345678', '02 123 4567'].map(R.looksLikePhone), [true, true, true, true]);
      assert.deepEqual(['kolsample.a', '12345678', 'Sample Agency · คุณเอ', 'kol@mail.com'].map(R.looksLikePhone), [false, false, false, false]);
      assert.equal(R.contactIdProblem('LINE 0812345678'), 'phone');
      assert.equal(R.contactIdProblem('Sample Agency · คุณเอ'), null);
      assert.equal(R.contactIdProblem(''), null);
    });
  });

  describe('CR-14 §4.6 · Import KOL — the new template', () => {
    const HEAD = 'display_name,platform,profile_link,followers,kol_category,kol_type,gender,pic,contact_channel,contact_id';
    const EXAMPLE = [HEAD,
      'kol_sample_a,TikTok,https://www.tiktok.com/@kol_sample_a,125000,หน้าสวย,Beauty,Female,Ja,LINE,kolsample.a',
      'kol_sample_a,Instagram,https://www.instagram.com/kol_sample_a,48000,หน้าสวย,Beauty,Female,Ja,LINE,kolsample.a',
      'kol_sample_b,Lemon8,https://www.lemon8-app.com/@kol_sample_b,9200,Korea Brand Lover,K-beauty,Female,Pizza,Agency,Sample Agency · คุณเอ'].join('\n');
    test('TC-19: the 3 rows of the Example sheet → new KOL 2 · new account 1 (Instagram of kol_sample_a, ticked) · no rate · contact_id saved', () => {
      const s = fresh(), plan = R.planImport(s, R.parseCSV(EXAMPLE));
      assert.equal(plan.headerError, null);
      assert.deepEqual(plan.rows.map(r => [r.name, r.kind, r.needsConfirm]), [['kol_sample_a', 'new_kol', false], ['kol_sample_a', 'new_account', true], ['kol_sample_b', 'new_kol', false]]);
      assert.equal(plan.rows[1].ofRow, 2);
      const out = R.applyImport(s, plan, new Set([3]), 'KOL_Master_Import_Template.csv', TD);
      assert.deepEqual([out.summary.new_kol, out.summary.new_account, out.summary.quotes, out.summary.skipped], [2, 1, 0, 0]);
      const a = out.kol_master.filter(k => k.display_name === 'kol_sample_a'), b = out.kol_master.find(k => k.display_name === 'kol_sample_b');
      assert.equal(a.length, 1, 'one KOL with two accounts');
      assert.deepEqual(out.kol_accounts.filter(x => x.kol_id === a[0].kol_id).map(x => x.platform), ['TikTok', 'Instagram']);
      assert.deepEqual([a[0].contact_channel, a[0].contact_id, b.contact_channel, b.contact_id], ['LINE', 'kolsample.a', 'Agency', 'Sample Agency · คุณเอ']);
      assert.equal(out.kol_rate_quotes.length, s.kol_rate_quotes.length);
      const skip = R.applyImport(s, plan, new Set(), 'x.csv', TD);
      assert.deepEqual([skip.summary.new_kol, skip.summary.skipped], [2, 1], 'not ticked → left out');
    });
    test('TC-20: an old file (16 columns with rates and note) still works — a rate record is made', () => {
      const s = fresh(), old = 'display_name,platform,profile_link,followers,kol_category,kol_type,gender,pic,contact_channel,rate_card,gencode_expense,gencode_period,basket_fee,asset_fee,expediting_fee,note\n' +
        'old_file_kol,TikTok,https://www.tiktok.com/@old_file_kol,15000,,,,,,5000,,,,,,from the old sheet';
      const plan = R.planImport(s, R.parseCSV(old));
      assert.deepEqual([plan.headerError, plan.rows[0].kind, plan.ignored.length], [null, 'new_kol', 0]);
      const out = R.applyImport(s, plan, new Set(), 'old.csv', TD);
      assert.equal(out.summary.quotes, 1);
      assert.equal(out.kol_master.find(k => k.display_name === 'old_file_kol').note, 'from the old sheet');
    });
    test('TC-21: no profile_link column → stops before the preview "Missing required column: profile_link" · an unknown column is skipped and named', () => {
      const s = fresh();
      assert.equal(R.planImport(s, [['display_name', 'platform', 'followers']]).headerError, 'Missing required column: profile_link');
      assert.equal(R.planImport(s, [['display_name']]).headerError, 'Missing required columns: platform, profile_link, followers');
      const plan = R.planImport(s, R.parseCSV(HEAD + ',nickname\nx_kol,TikTok,https://www.tiktok.com/@x_kol,10,,,,,,,nick'));
      assert.deepEqual(plan.ignored, ['nickname']);
      assert.equal(C.io.importIgnoredCol('nickname'), 'Ignored column: nickname');
    });
    test('TC-22: a row with contact_id "0812345678" → that row cannot be imported · the others can · no phone number is stored', () => {
      const s = fresh(), plan = R.planImport(s, R.parseCSV(HEAD + '\nphone_kol,TikTok,https://www.tiktok.com/@phone_kol,10,,,,,LINE,0812345678\nfine_kol,TikTok,https://www.tiktok.com/@fine_kol,10,,,,,LINE,fine.kol'));
      assert.deepEqual(plan.rows.map(r => r.kind), ['error', 'new_kol']);
      assert.ok(plan.rows[0].errs.includes('Phone number in contact_id'));
      const out = R.applyImport(s, plan, new Set(), 'x.csv', TD);
      assert.equal(out.summary.new_kol, 1);
      assert.equal(JSON.stringify(out.kol_master).includes('0812345678'), false);
    });
    test('TC-23: a KOL that has a contact ID keeps it — the preview says "Kept existing contact ID"', () => {
      const s = fresh(), k = s.kol_master.find(x => x.kol_id === 'K0001'), acc = R.accountsOfKol(s, 'K0001')[0];
      k.contact_id = 'old.id'; k.contact_channel = 'LINE';
      const plan = R.planImport(s, R.parseCSV(`${HEAD}\n${k.display_name},${acc.platform},${acc.profile_link || 'https://www.tiktok.com/@' + acc.handle},10,,,,,LINE,new.id`));
      assert.equal(plan.rows[0].kind, 'match');
      assert.ok(plan.rows[0].warns.includes('Kept existing contact ID'));
      const out = R.applyImport(s, plan, new Set(), 'x.csv', TD);
      assert.equal(out.kol_master.find(x => x.kol_id === 'K0001').contact_id, 'old.id');
    });
    test('TC-24: "125,000" followers and a UTF-8 BOM — read as 125000, the first header is not broken · empty rows are skipped', () => {
      const s = fresh(), plan = R.planImport(s, R.parseCSV('﻿' + HEAD + '\nbom_kol,TikTok,https://www.tiktok.com/@bom_kol,"125,000",,,,,,\n,,,,,,,,,\n'));
      assert.equal(plan.headerError, null);
      assert.equal(plan.rows.length, 1);
      assert.deepEqual([plan.rows[0].kind, plan.rows[0].followers], ['new_kol', 125000]);
      const xlsxLike = R.planImport(s, [HEAD.split(','), ['xl_kol', 'TikTok', 'https://www.tiktok.com/@xl_kol', '9200', '', '', '', '', '', ''], ['', '', '', '', '', '', '', '', '', '']]);
      assert.deepEqual(xlsxLike.rows.map(r => r.kind), ['new_kol'], 'the Excel template keeps 500 empty rows');
    });
    test('TC-25: Download template = the 10 columns of KOL_Master_Import_Template.csv, UTF-8 with BOM', () => {
      assert.deepEqual(R.TEMPLATE_COLS, HEAD.split(','));
      assert.deepEqual(R.IMPORT_REQUIRED, ['display_name', 'platform', 'profile_link', 'followers']);
      const csv = R.templateCSV();
      assert.equal(csv.charCodeAt(0), 0xFEFF);
      assert.deepEqual(R.parseCSV(csv)[0], HEAD.split(','));
      assert.equal(C.io.downloadTemplate, 'Download template');
    });
  });
});
