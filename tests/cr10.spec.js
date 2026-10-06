/* cr10.spec.js — CR-10 test cases (Deals › Performance · metrics · …), run by tests/test.html.
   "today" is 06/10/2026 · the seed · money anchors stay those of CR-05 §5.0. */
(window.KT_SPECS = window.KT_SPECS || []).push(function (t) {
  'use strict';
  const { describe, test, assert, R, S, C, SEED, E } = t;
  const TD = '2026-10-06';
  const fresh = () => S.fromSeed(SEED, new Date('2026-10-06T03:00:00Z'));
  const camp = (s, name) => s.campaigns.find(c => c.campaign_name.startsWith(name));
  const perf = (s, name) => { const ctx = R.dealContext(s), c = camp(s, name); return R.perfRows(s, s.deals.filter(d => d.campaign_id === c.campaign_id), TD, ctx); };

  describe('CR-10 R1 · migration v10 · postMetrics · Deals › Performance', () => {
    test('TC-01: schema 9 → 10 — posts with metrics and no update date become "legacy" · stale days 14 · money anchors unchanged', () => {
      const v9 = JSON.parse(JSON.stringify(fresh()));
      v9.schema_version = 9; delete v9.lookups.metrics_stale_days; v9.deal_posts.forEach(p => { delete p.metrics_source; delete p.metrics_updated_by; });
      const m = S.migrate(JSON.parse(JSON.stringify(v9)));
      assert.equal(m.schema_version, S.SCHEMA_VERSION); assert.ok(S.SCHEMA_VERSION >= 10);
      const withM = m.deal_posts.filter(p => R.METRICS.some(k => p[k] != null));
      assert.ok(withM.length > 0 && withM.every(p => p.metrics_source === 'legacy'));
      assert.ok(m.deal_posts.filter(p => !R.METRICS.some(k => p[k] != null)).every(p => p.metrics_source === null && p.metrics_updated_by === null));
      assert.equal(m.lookups.metrics_stale_days, 14);
      assert.deepEqual(m.deal_posts.map(p => p.views), v9.deal_posts.map(p => p.views), 'metric values are not touched');
      const tl = R.dealTiles(m, m.deals, m.phases.map(p => p.phase_id), TD);
      assert.deepEqual([tl.committed, tl.paid], [1783579, 774579]);
      const again = S.migrate(JSON.parse(JSON.stringify(m)));
      assert.deepEqual(again.deal_posts.map(p => p.metrics_source), m.deal_posts.map(p => p.metrics_source), 'runs once');
    });
    test('TC-02: Deals view tabs Table · Pipeline · Performance', () => {
      assert.deepEqual(['table', 'pipeline', 'performance'].map(v => C.deal.views[v]), ['Table', 'Pipeline', 'Performance']);
      assert.ok(C.perf && C.perf.last && C.perfTab && C.perfTab.kpi, 'the CR-06 KOL performance labels stay next to the CR-10 ones');
    });
    test('TC-03 / TC-04: Charming — Posted 86 (16 without date) · With metrics 21 · Views 1,981,690 · Engagement 39,941 · ER 2.02% · CPV ฿0.089 · top row muknutkamon 1,300,000 Imported', () => {
      const s = fresh(), rows = perf(s, 'Charming'), m = R.perfMetricsOf(rows);
      assert.deepEqual([m.posted, m.noDate, m.withMetrics, m.views, m.likes, m.comments, m.shares, m.saves, m.engagement], [86, 16, 21, 1981690, 33420, 442, 1678, 4401, 39941]);
      assert.deepEqual([(m.er * 100).toFixed(2), m.costViews, m.cpv.toFixed(3), Math.round(m.withMetrics / m.posted * 100)], ['2.02', 177000, '0.089', 24]);
      const top = R.sortPerfRows(rows, 'views', 'desc', s.lookups.tier_rules)[0];
      assert.deepEqual([top.kol.display_name, top.platform, top.views, top.post.post_date, top.status], ['muknutkamon/ไข่มุกแม่น้องหนาว', 'TikTok', 1300000, null, 'imported']);
      /* weighted, not the mean of the rows */
      const withViews = rows.filter(r => r.views > 0), mean = withViews.reduce((a, r) => a + r.er, 0) / withViews.length;
      assert.notEqual(mean.toFixed(4), m.er.toFixed(4));
    });
    test('TC-05: Kiss Signal 79 · 10 · 91,267 · ER 1.68% · CPV ฿0.387 · Perfect Heart 52 · 0 → ER / CPV none · Acne Fade 0 posted', () => {
      const s = fresh(), k = R.perfMetricsOf(perf(s, 'Kiss')), ph = R.perfMetricsOf(perf(s, 'Perfect')), a = perf(s, 'Acne');
      assert.deepEqual([k.posted, k.withMetrics, k.views, (k.er * 100).toFixed(2), k.cpv.toFixed(3)], [79, 10, 91267, '1.68', '0.387']);
      assert.deepEqual([ph.posted, ph.withMetrics, ph.er, ph.cpv], [52, 0, null, null]);
      assert.equal(a.length, 0);
      assert.equal(C.perfTab.empty, 'No posted content in this scope');
    });
    test('TC-06: a post without metrics — every metric null (not 0) · status No metrics', () => {
      const s = fresh(), r = perf(s, 'Charming').find(x => x.views == null);
      assert.deepEqual([r.views, r.likes, r.comments, r.shares, r.saves, r.er, r.cpv, r.status], [null, null, null, null, null, null, null, 'none']);
    });
    test('TC-07: Metrics status = No metrics → 65 · cleared → 86 · the other filters and search', () => {
      const s = fresh(), rows = perf(s, 'Charming'), f = Object.assign({ q: '' }, R.blankPerfFilter());
      assert.equal(R.filterPerfRows(rows, Object.assign({}, f, { mstatus: 'none' })).length, 65);
      assert.equal(R.filterPerfRows(rows, f).length, 86);
      assert.equal(R.filterPerfRows(rows, Object.assign({}, f, { platform: 'Instagram' })).length, 7);
      assert.equal(R.filterPerfRows(rows, Object.assign({}, f, { link: 'none' })).length + R.filterPerfRows(rows, Object.assign({}, f, { link: 'has' })).length, 86);
      assert.equal(R.filterPerfRows(rows, Object.assign({}, f, { q: '@muknut' })).length, 1);
      assert.equal(R.filterPerfRows(rows, Object.assign({}, f, { q: 'video/' })).length, R.filterPerfRows(rows, f).filter(r => /video\//i.test(r.post.post_link || '')).length, 'post link');
    });
    test('TC-08: Group by Platform — TikTok 71 · Instagram 7 · Facebook 5 · X 3 · tier groups Mega → Unknown', () => {
      const s = fresh(), rows = perf(s, 'Charming');
      assert.deepEqual(R.groupPerfRows(s, rows, 'platform').map(g => [g.key, g.rows.length]), [['TikTok', 71], ['Instagram', 7], ['Facebook', 5], ['X', 3]]);
      const tiers = R.groupPerfRows(s, rows, 'tier').map(g => g.key), order = R.tierOrder(s.lookups.tier_rules);
      assert.deepEqual(tiers, order.filter(t => tiers.includes(t)));
      assert.equal(R.groupPerfRows(s, rows, 'none')[0].rows.length, 86);
    });
    test('TC-11: Export — 86 rows + Total · full post link and post ID · numbers are numbers · no personal data', () => {
      const s = fresh(), rows = R.sortPerfRows(perf(s, 'Charming'), 'views', 'desc', s.lookups.tier_rules), t = E.rowsFor('performance', { state: s, rows, cols: ['kol', 'tier', 'platform', 'post', 'post_date', 'views', 'likes', 'comments', 'shares', 'saves', 'er', 'cost', 'cpv', 'updated', 'pic'] });
      assert.equal(t.rows.length, 86);
      assert.deepEqual(t.header.slice(0, 3), ['KOL', 'Account', 'Tier']);
      assert.deepEqual(t.header.slice(-2), ['Post link', 'Post ID']);
      const vi = t.header.indexOf('Views'), er = t.header.indexOf('ER');
      assert.equal(t.rows[0][vi], 1300000); assert.equal(typeof t.rows[0][er], 'number');
      assert.equal(t.total[vi], 1981690); assert.equal(t.total[er], 0.0202);
      assert.ok(t.rows.every(r => r[r.length - 1].startsWith('P')));
      assert.equal(E.fileName(C.perfTab.file, E.safeName('Charming Iconic Glow'), TD, 'xlsx'), 'Performance_Charming-Iconic-Glow_2026-10-06.xlsx');
    });
    test('TC-12: Dashboard › By campaign (Charming) and Performance — the same Views / Likes / Comments / Saves / Shares', () => {
      const s = fresh(), c = camp(s, 'Charming'), d = R.summaryCards(s, { campaignId: c.campaign_id }, TD).engagement, m = R.perfMetricsOf(perf(s, 'Charming'));
      assert.deepEqual(['views', 'likes', 'comments', 'saves', 'shares'].map(k => d[k]), ['views', 'likes', 'comments', 'saves', 'shares'].map(k => m[k]));
      assert.deepEqual([d.withMetrics, d.posted, d.noDate], [18, 70, 3], 'Metrics on 18 of 70 posts · +3 without post date');
    });
    test('metrics status · count parsing · post links (§4.3, §4.5, §4.6)', () => {
      const p = { views: 10, metrics_source: 'manual', metrics_updated_at: '2026-09-30' };
      assert.deepEqual([R.metricsStatus({ views: null }, TD, 14), R.metricsStatus({ views: 5, metrics_source: 'legacy' }, TD, 14), R.metricsStatus(p, TD, 14), R.metricsStatus(p, TD, 5)],
        ['none', 'imported', 'updated', 'stale']);
      assert.deepEqual(['1300000', '1,300,000', '1.3M', '33.4K', '1.2k', '12.5K', ' '].map(x => R.parseCount(x).value), [1300000, 1300000, 1300000, 33400, 1200, 12500, null]);
      ['-5', 'abc', '12.5', '1.2.3'].forEach(x => assert.equal(R.parseCount(x).error, 'Enter a whole number, e.g. 12,500 or 12.5K', x));
      assert.equal(R.normalizePostLink('https://www.TikTok.com/@pst.marina119/video/7683451360452365576?is_from_webapp=1&sender_device=pc'), R.normalizePostLink('tiktok.com/@pst.marina119/video/7683451360452365576/'));
      assert.equal(R.normalizePostLink('https://m.facebook.com/x#c'), 'm.facebook.com/x');
      assert.equal(R.normalizePostLink('https://facebook.com/permalink.php?story_fbid=9&id=2'), 'facebook.com/permalink.php?story_fbid=9&id=2', 'the post is in the query');
    });
  });

  describe('CR-10 R2 · update metrics inline · Paste metrics · Deal drawer · Stale', () => {
    const user = (s, id) => s.users.find(u => u.user_id === id);
    const ctx = () => ({ today: TD, now: '2026-10-06T03:00:00Z', user: 'U001', eventId: 9001 });
    test('TC-13: Amp (Staff) sets Views of a post in her deal to "12.5K" → 12,500 · updated today by Amp · manual · a metrics event · the KPI strip follows', () => {
      const s = fresh(), amp = user(s, 'U001'), rows = perf(s, 'Perfect'), r = rows.find(x => x.deal.pic === 'Amp');   // Amp's posted deals are in Perfect Heart
      assert.ok(R.canEditMetrics(amp, r.deal));
      const before = R.perfMetricsOf(rows).views, old = r.post.views || 0, v = R.parseCount('12.5K').value;
      const ev = R.setMetrics(r.post, { views: v }, ctx(), 'manual');
      assert.deepEqual([r.post.views, r.post.metrics_updated_at, r.post.metrics_updated_by, r.post.metrics_source], [12500, TD, 'U001', 'manual']);
      assert.deepEqual([ev.type, ev.post_id, ev.from.views, ev.to.views, ev.changed_by], ['metrics', r.post.post_id, old || null, 12500, 'U001']);
      assert.equal(R.perfMetricsOf(perf(s, 'Perfect')).views, before - old + 12500);
      assert.equal(R.metricsStatus(r.post, TD, 14), 'updated');
    });
    test('TC-14 / TC-20: who may edit — Admin · KOL Manager · Staff on own deals · not another PIC\'s deal · not Viewer / Accounting', () => {
      const s = fresh(), rows = perf(s, 'Perfect'), mine = rows.find(x => x.deal.pic === 'Amp').deal, other = rows.find(x => x.deal.pic && x.deal.pic !== 'Amp').deal;
      assert.deepEqual([R.canEditMetrics(user(s, 'U001'), mine), R.canEditMetrics(user(s, 'U001'), other)], [true, false]);
      assert.deepEqual(['admin', 'kol_manager', 'viewer', 'accounting'].map(role => R.canEditMetrics({ role, active: true }, other)), [true, true, false, false]);
      assert.ok(R.can({ role: 'viewer', active: true }, 'export'), 'Viewer / Accounting still export');
    });
    test('TC-15 / TC-16: "-5" / "abc" → the error · likes above views and views going down → warnings (saved anyway)', () => {
      assert.equal(R.parseCount('-5').error, 'Enter a whole number, e.g. 12,500 or 12.5K');
      assert.equal(R.parseCount('abc').error, 'Enter a whole number, e.g. 12,500 or 12.5K');
      assert.deepEqual(R.metricsWarnings({ views: 1000 }, { views: 900, likes: 950 }).map(w => w.msg), ['Engagement is higher than views — check the numbers', 'Views are lower than the last update (1,000)']);
      assert.deepEqual(R.metricsWarnings({ views: 1000 }, { views: 1200, likes: 50 }), []);
    });
    test('TC-18: paste 3 lines — P000001 (link + ?is_from_webapp=1) · an unknown link · bad numbers → Matched 1 · Not found 1 · Errors 1 · Apply → paste', () => {
      const s = fresh(), rows = perf(s, 'Charming'), p1 = rows.find(r => r.post.post_id === 'P000001');
      assert.ok(p1 && p1.post.post_link, 'P000001 is posted in Charming with a link');
      const link = p1.post.post_link.split('?')[0] + '?is_from_webapp=1&sender_device=pc';
      const text = ['Post link\tViews\tLikes\tComments\tShares\tSaves', `${link}\t45,000\t1.2K\t30\t12\t88`, 'https://www.tiktok.com/@nobody/video/1\t10\t1\t0\t0\t0', `${link}\tabc\t-5\t\t\t`].join('\n');
      const plan = R.planPaste(text, rows, user(s, 'U000'));
      assert.deepEqual(plan.counts, { matched: 1, nochange: 0, notfound: 1, error: 1, notyours: 0 });
      const m = plan.lines.find(x => x.status === 'matched');
      assert.deepEqual([m.row.post.post_id, m.to.views, m.to.likes, m.changed.includes('views')], ['P000001', 45000, 1200, true]);
      R.setMetrics(m.row.post, m.values, ctx(), 'paste');
      assert.deepEqual([p1.post.views, p1.post.metrics_source], [45000, 'paste']);
      assert.equal(R.planPaste(`${link}\t45000`, perf(s, 'Charming'), user(s, 'U000')).counts.nochange, 1, 'the same numbers again = No change');
      const notMine = rows.find(r => r.deal.pic && r.deal.pic !== 'Amp' && r.post.post_link);
      assert.equal(R.planPaste(`${notMine.post.post_link}\t5`, rows, user(s, 'U001')).counts.notyours, 1, 'Staff: not your deal');
    });
    test('TC-19: Copy template — the header + every post link in scope', () => {
      const s = fresh(), rows = perf(s, 'Charming'), t = R.pasteTemplate(rows).split('\n');
      assert.equal(t[0], 'Post link\tViews\tLikes\tComments\tShares\tSaves');
      assert.equal(t.length - 1, new Set(rows.filter(r => r.post.post_link).map(r => r.post.post_link.trim())).size);
    });
    test('TC-21: Deal drawer › Posts — the same reader and warnings (12.5K saves · -5 is an error)', () => {
      const s = fresh(), ctxD = R.dealContext(s), d = s.deals.find(x => x.deal_id === 'D000001'), posts = R.postsOf(s, d.deal_id).map(p => Object.assign({}, p));
      posts[0].views = '12.5K';
      assert.ok(!R.validateDeal(s, d, posts, TD, ctxD).errs.some(e => /views/.test(e.field)));
      posts[0].views = '-5';
      assert.ok(R.validateDeal(s, d, posts, TD, ctxD).errs.some(e => e.msg.endsWith('Enter a whole number, e.g. 12,500 or 12.5K')));
      posts[0].views = '1'; posts[0].likes = '50';
      assert.ok(R.validateDeal(s, d, posts, TD, ctxD).warns.some(w => /Engagement is higher than views/.test(w.msg)));
    });
    test('TC-22: updated more than 14 days ago → Stale · 30 days in Settings → Updated', () => {
      const s = fresh(), p = perf(s, 'Charming')[0].post;
      R.setMetrics(p, { views: 100 }, Object.assign(ctx(), { today: '2026-09-15' }), 'manual');
      assert.equal(R.metricsStatus(p, TD, R.metricsStaleDays(s.lookups)), 'stale');
      s.lookups.metrics_stale_days = 30;
      assert.equal(R.metricsStatus(p, TD, R.metricsStaleDays(s.lookups)), 'updated');
      assert.equal(R.validatePerfSettings({ ontime_grace_days: '1', reliability_min_posts: '2', metrics_stale_days: '0' }).errs[0].field, 'metrics_stale_days');
      assert.equal(R.filterPerfRows(R.perfRows(s, s.deals.filter(d => d.deal_id === p.deal_id), TD, R.dealContext(s)), { mstatus: 'updated' }).length >= 1, true);
    });
  });

  describe('CR-10 R3 · date range picker rules · Timeline Fit', () => {
    test('TC-23 / TC-25: a range — 01/12/2026 – 31/12/2026 is 31 days · typed end before start → error · wrong format → "Use dd/mm/yyyy"', () => {
      assert.deepEqual(R.validateRange('01/12/2026', '31/12/2026'), { from: '2026-12-01', to: '2026-12-31', errs: [] });
      assert.equal(R.rangeDays('2026-12-01', '2026-12-31'), 31);
      assert.deepEqual(R.validateRange('01/12/2026', '31/10/2026').errs, [{ field: 'end', msg: 'End date must be on or after start date' }]);
      assert.deepEqual(R.validateRange('2026-12-01', '').errs, [], 'no end yet is not an error (Apply waits)');
      assert.deepEqual(R.validateRange('32/12/2026', '1-1-2027').errs.map(e => [e.field, e.msg]), [['start', 'Use dd/mm/yyyy'], ['end', 'Use dd/mm/yyyy']]);
      assert.equal(R.rangeDays('2026-12-31', '2026-12-01'), null);
    });
    test('TC-32: Timeline Fit for Charming Iconic Glow + Acne Fade Concealer → 25/08/2026 – 31/10/2026', () => {
      const s = fresh(), ids = ['Charming', 'Acne'].map(n => camp(s, n).campaign_id);
      assert.deepEqual(R.fitRange(s, ids), { from: '2026-08-25', to: '2026-10-31' });
      assert.equal(R.fitRange(s, []), null);
    });
    test('TC-26 basis: a Phase that ends before it starts stops the Planner from saving', () => {
      const s = fresh(), c = camp(s, 'Charming'), ph = R.sortPhases(s.phases.filter(p => p.campaign_id === c.campaign_id));
      const rows = ph.map((p, i) => ({ key: 'k' + i, phase_id: p.phase_id, label: p.label, start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol, budget_pct: '' }));
      rows[0] = Object.assign({}, rows[0], { start_date: '2026-12-01', end_date: '2026-10-31' });
      assert.ok(R.validatePhasePlan(s, { campaign_id: c.campaign_id, campaign_name: c.campaign_name, budget_kol: c.budget_kol }, rows, [], {}).errs.length > 0);
    });
  });
  describe('CR-10 R4 · New deal (Single KOL · Create KOL · Bulk shortlist) · guard before Confirm QT · Set details', () => {
    const megaIds = s => { const rules = s.lookups.tier_rules; return s.kol_master.filter(k => R.tierOf(R.maxFollowers(R.accountsOfKol(s, k.kol_id)), rules) === 'Mega').map(k => k.kol_id); };
    const ctxB = (s, n) => ({ batchId: 'B1', dealIds: Array.from({ length: n }, (_, i) => 'D9' + String(i).padStart(5, '0')), logIds: Array.from({ length: n }, (_, i) => 90000 + i), date: TD, now: new Date('2026-10-06T03:00:00Z'), user: 'U000', pillar: null });
    test('TC-35 / TC-36: Create KOL from "james_001" — name and handle prefilled (no @) · PIC = you · KOL Master gets it with sources manual', () => {
      const s = fresh(), amp = s.users.find(u => u.user_id === 'U001'), x = R.createKolDraft('@james_001', amp);
      assert.deepEqual([x.display_name, x.handle, x.platform, x.pic], ['james_001', 'james_001', 'TikTok', 'Amp']);
      assert.deepEqual(R.validateCreateKol(s, x).errs, []);
      assert.equal(R.validateCreateKol(s, Object.assign({}, x, { display_name: ' ', pic: '' })).errs.map(e => e.field).join(), 'ck_display_name,ck_pic');
      const r = R.createKolRecords(x, { kolId: 'K9999', accountId: 'A99999' });
      assert.deepEqual([r.kol.kol_id, r.kol.display_name, r.kol.sources, r.kol.pic, r.account.handle, r.account.kol_id], ['K9999', 'james_001', ['manual'], 'Amp', 'james_001', 'K9999']);
      assert.equal(R.findDuplicateKol(s, 'james_001', 'james_001'), null);
      assert.equal(R.createKolRecords(Object.assign({}, x, { handle: '' }), { kolId: 'K9999', accountId: 'A1' }).account, null, 'no handle → no account');
    });
    test('TC-37: "@AmyKitiya" → Already in KOL Master: amykitiya (K0002) · the KOL box finds it by name or @handle', () => {
      const s = fresh(), dup = R.findDuplicateKol(s, '@AmyKitiya', 'AmyKitiya');
      assert.deepEqual([dup.kol.kol_id, dup.kol.display_name], ['K0002', 'amykitiya']);
      assert.equal(R.kolMatches(s, ' @AMYkitiya ', 5)[0].kol_id, 'K0002');
      assert.equal(C.bulk.ck.already('amykitiya', 'amykitiya'), 'Already in KOL Master: amykitiya (@amykitiya)');
      assert.equal(C.deal.createKolOpt('james_001'), '+ Create KOL "james_001"');
    });
    test('TC-39 / TC-40 / TC-41: Bulk shortlist Mega into Charming — 43 Mega · 4 there already → Create 39 · Skip 4 · deals 101 → 140 · Pending unchanged · Undo', () => {
      const s = fresh(), ch = camp(s, 'Charming').campaign_id, mega = megaIds(s);
      assert.equal(mega.length, 43);
      const inCh = new Set(s.deals.filter(d => d.campaign_id === ch && d.status !== 'Cancel').map(d => d.kol_id));
      assert.equal(mega.filter(id => !inCh.has(id)).length, 39, 'Not in this campaign yet');
      const plan = R.bulkShortlistPlan(s, mega, ch, { pic: 'me', me: '' });
      assert.deepEqual([plan.errs.length, plan.create.length, plan.skip.length, plan.skip.every(x => x.reason === 'in_campaign')], [0, 39, 4, true]);
      const before = s.deals.filter(d => d.campaign_id === ch).length, tl0 = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD);
      assert.equal(before, 101);
      const made = R.bulkShortlistDeals(s, plan, ch, ctxB(s, 39));
      made.forEach(x => { s.deals.push(x.deal); s.deal_status_log.push(x.log); });
      assert.equal(s.deals.filter(d => d.campaign_id === ch).length, 140);
      assert.ok(made.every(x => x.deal.sub_status === R.shortlistStep(s.lookups).sub_status && x.deal.created_batch_id === 'B1' && R.totalCost(x.deal) === 0 && x.deal.draft_rounds === 1));
      const tl1 = R.dealTiles(s, s.deals, s.phases.map(p => p.phase_id), TD);
      assert.deepEqual([tl1.committed, tl1.shortlist], [tl0.committed, tl0.shortlist], 'Committed and Pending unchanged');
      const snap = new Map(made.map(x => [x.deal.deal_id, JSON.stringify(x.deal)]));
      s.deals.find(d => d.deal_id === made[0].deal.deal_id).pic = 'Ja';   // someone changed one in the meantime
      const undo = new Set(R.batchUntouched(s, 'B1', snap).map(d => d.deal_id));
      assert.equal(undo.size, 38, 'a deal changed since is kept');
      s.deals = s.deals.filter(d => !undo.has(d.deal_id));
      assert.equal(s.deals.filter(d => d.campaign_id === ch).length, 102);
    });
    test("TC-43 / TC-47: PIC = KOL's PIC (empty → me) · Blacklist skipped · more than 200 → error", () => {
      const s = fresh(), ch = camp(s, 'Charming').campaign_id, ids = s.kol_master.slice(0, 260).map(k => k.kol_id);
      const p = R.bulkShortlistPlan(s, ids.slice(0, 40), ch, { pic: 'kol', me: 'Amp' });
      p.create.forEach(x => assert.equal(x.pic, x.kol.pic || 'Amp'));
      const k = s.kol_master.find(x => !s.deals.some(d => d.kol_id === x.kol_id && d.campaign_id === ch)); k.kol_status = 'Blacklist';
      assert.equal(R.bulkShortlistPlan(s, [k.kol_id], ch, {}).skip[0].reason, 'blacklisted');
      assert.equal(R.bulkShortlistPlan(s, ids, ch, {}).errs[0].msg, 'Max 200 per batch');
    });
    test('TC-44: Set details — only the ticked fields change (Payment term After post · Pillar Awareness)', () => {
      const s = fresh(), deals = s.deals.filter(d => d.campaign_id === camp(s, 'Charming').campaign_id).slice(0, 5);
      const out = R.setDetailsPlan(deals, { payment_term: 'postpaid', pillar: 'Awareness' });
      out.forEach(x => { assert.ok(x.changes.every(c => ['payment_term', 'pillar'].includes(c.field))); assert.deepEqual([x.deal.payment_term, x.deal.pillar, x.deal.pic], ['postpaid', 'Awareness', deals.find(d => d.deal_id === x.deal.deal_id).pic]); });
      assert.ok(R.PAYMENT_TERMS.includes('postpaid'));
    });
    test('TC-45 / TC-46: Confirm QT needs a payment term — the guard, the Move dialog field and the drop (dialog, not instant)', () => {
      const s = fresh(), ch = camp(s, 'Charming').campaign_id, k = s.kol_master.find(x => !s.deals.some(d => d.kol_id === x.kol_id && d.campaign_id === ch) && !R.isTerm(x.default_payment_term));
      const made = R.bulkShortlistDeals(s, R.bulkShortlistPlan(s, [k.kol_id], ch, {}), ch, ctxB(s, 1))[0];
      s.deals.push(made.deal); s.deal_status_log.push(made.log); made.deal.pillar = 'Awareness';
      assert.equal(made.deal.payment_term, null, 'empty is fine at Shortlist');
      assert.deepEqual(R.canMoveToStage(s, made.deal, 'Confirm QT').errs.map(e => e.kind), ['term']);
      assert.deepEqual(R.canMoveToStage(s, made.deal, 'Contacted').errs, []);
      assert.ok(R.checkMove(s, made.deal, 'Confirm QT', { date: TD }).errs.some(e => e.field === 'payment_term'));
      assert.ok(!R.checkMove(s, made.deal, 'Confirm QT', { date: TD, paymentTerm: 'prepaid' }).errs.some(e => e.field === 'payment_term'));
      const r = R.applyMove(s, made.deal, 'Confirm QT', { date: TD, paymentTerm: 'prepaid' }, { logId: 1, quoteId: 'Q1', eventId: 50, now: new Date(), user: 'U000' });
      assert.deepEqual([r.deal.payment_term, r.events.some(e => e.type === 'payment_term' && e.to === 'prepaid')], ['prepaid', true]);
      assert.equal(R.dropPlan(s, made.deal, 'Confirm QT', TD).kind, 'dialog');
      assert.equal(R.canMoveToStage(s, Object.assign({}, made.deal, { payment_term: 'postpaid' }), 'Confirm QT').warns[0].kind, 'zero', 'a ฿0 total only warns');
    });
  });
  describe('CR-10 R5 · every detail drawer 60%', () => {
    test('TC-48 / TC-50 / TC-51: Deal · KOL · Campaign 1440 → 864 · 1920 → 1152 · Planner ≥ 880 · 1280 (menu open) → 768 · 1024 (rail) / 390 → the content area', () => {
      ['deal', 'kol', 'campaign'].forEach(k => assert.deepEqual([R.drawerWidth(k, 1440, 232), R.drawerWidth(k, 1920, 232), R.drawerWidth(k, 1280, 232), R.drawerWidth(k, 1024, 64), R.drawerWidth(k, 390, 0)], [864, 1152, 768, 960, 390], k));
      assert.deepEqual([R.drawerWidth('planner', 1440, 232), R.drawerWidth('planner', 1920, 232), R.drawerWidth('planner', 1280, 232)], [880, 1152, 880]);
      assert.equal(R.drawerWidth('deal', 1440, 232, 700), 700, 'a width dragged by hand is kept');
    });
  });
  describe('CR-10 R6 · Samples', () => {
    let n = 0;
    const ctxS = s => ({ shipmentId: () => 'SH9' + String(++n).padStart(5, '0'), eventId: () => 80000 + n, now: '2026-10-06T03:00:00Z', user: 'U000' });
    test('TC-52: schema 10 → 11 — Delivered (legacy) 206 (120 dated + 86 "Date not recorded") · To ship (auto) 8 = Overdue 7 + no ship-by 1 · deals.delivered unchanged · runs once', () => {
      const s = fresh(), list = s.sample_shipments;
      assert.equal(s.schema_version, S.SCHEMA_VERSION); assert.ok(S.SCHEMA_VERSION >= 11);
      const leg = list.filter(x => x.source === 'legacy'), auto = list.filter(x => x.source === 'auto');
      assert.deepEqual([leg.length, leg.filter(x => x.delivered_date).length, leg.filter(x => !x.delivered_date).length, leg.every(x => x.status === 'delivered')], [206, 120, 86, true]);
      assert.deepEqual([auto.length, auto.filter(x => R.sampleStatus(x, TD) === 'overdue').length, auto.filter(x => !x.ship_by).length], [8, 7, 1]);
      assert.deepEqual(s.lookups.sample_settings.lead_days, 7);
      const v10 = JSON.parse(JSON.stringify(s)); v10.schema_version = 10; delete v10.sample_shipments; delete v10.lookups.sample_settings;
      const m = S.migrate(JSON.parse(JSON.stringify(v10)));
      assert.equal(m.sample_shipments.length, 214);
      assert.deepEqual(m.deals.map(d => [d.delivered, d.delivery_date]), v10.deals.map(d => [d.delivered, d.delivery_date]), 'the deals keep their values');
      R.syncShipments(m, ctxS(m));
      assert.deepEqual(m.deals.map(d => [!!d.delivered, d.delivery_date || null]), v10.deals.map(d => [!!d.delivered, d.delivery_date || null]), 'and the sync keeps them');
      assert.equal(S.migrate(JSON.parse(JSON.stringify(m))).sample_shipments.length, 214, 'runs once');
    });
    test('TC-53: Perfect Heart — Overdue 5 · No ship-by date 1 · Overdue first in the group order · Charming 2 · Kiss 0', () => {
      const s = fresh(), rowsOf = name => R.sampleRows(s, s.deals.filter(d => d.campaign_id === camp(s, name).campaign_id), TD).filter(r => r.sh.source === 'auto');
      const c = R.sampleCounts(rowsOf('Perfect'));
      assert.deepEqual([c.overdue, c.noShipBy], [5, 1]);
      assert.equal(R.SAMPLE_STATUSES[0], 'overdue');
      assert.deepEqual(rowsOf('Charming').map(r => [(R.kolById(s, r.deal.kol_id) || {}).display_name, r.sh.ship_by]).sort(), [['pangxnstory', '2026-06-10'], ['pearriepai', '2026-09-27']]);
      assert.equal(rowsOf('Kiss').length, 0);
    });
    test('TC-54 / TC-55: a deal reaching Confirm QT (Draft 1 expected 20/10 · 2 products) → To ship by 13/10 · Ship this week · 30/10 → 23/10 · set by hand → stays · Reset to auto', () => {
      const s = fresh(), d = s.deals.find(x => x.status === 'List' && !R.shipmentsOf(s, x.deal_id).length);
      Object.assign(d, { sub_status: 'Confirm QT', status: R.stepOf(s.lookups, 'Confirm QT').status, expected_draft1_date: '2026-10-20' });
      s.deal_products.push({ deal_id: d.deal_id, tr_code: 'TR1', qty: 2, note: null }, { deal_id: d.deal_id, tr_code: 'TR2', qty: 1, note: null });
      const evs = R.syncShipments(s, ctxS(s)), sh = R.shipmentsOf(s, d.deal_id)[0];
      assert.deepEqual([evs.length >= 1, sh.status, sh.source, sh.ship_by, R.itemsText(sh.items), R.sampleStatus(sh, TD)], [true, 'to_ship', 'auto', '2026-10-13', 'TR1×2, TR2×1', 'this_week']);
      d.expected_draft1_date = '2026-10-30'; R.syncShipments(s, ctxS(s));
      assert.equal(sh.ship_by, '2026-10-23');
      R.updateShipment(sh, { kind: 'ship_by', date: '2026-10-15' }, { now: 'x', user: 'U000', eventId: 1 }); d.expected_draft1_date = '2026-11-30'; R.syncShipments(s, ctxS(s));
      assert.deepEqual([sh.ship_by, sh.ship_by_overridden], ['2026-10-15', true]);
      R.updateShipment(sh, { kind: 'ship_by', date: null }, { now: 'x', user: 'U000', eventId: 2 }); R.syncShipments(s, ctxS(s));
      assert.deepEqual([sh.ship_by, sh.ship_by_overridden], ['2026-11-23', false]);
      assert.equal(R.syncShipments(s, ctxS(s)).length, 0, 'nothing new the second time');
    });
    test('TC-56 / TC-57: Mark shipped (Kerry · tracking) → Shipped · Mark delivered → Delivered and deals.delivered = true · a cancelled deal → Not required "Deal cancelled"', () => {
      const s = fresh(), shs = s.sample_shipments.filter(x => x.source === 'auto').slice(0, 3), c = { now: '2026-10-06T03:00:00Z', user: 'U000', eventId: 5 };
      shs.forEach((sh, i) => R.updateShipment(sh, { kind: 'shipped', date: TD, carrier: 'Kerry Express', tracking: 'KE' + i }, c));
      R.updateShipment(shs[0], { kind: 'delivered', date: '2026-10-07' }, c); R.syncShipments(s, ctxS(s));
      assert.deepEqual(shs.map(x => R.sampleStatus(x, TD)), ['delivered', 'shipped', 'shipped']);
      assert.deepEqual([shs[1].carrier, shs[1].tracking_no], ['Kerry Express', 'KE1']);
      const d0 = s.deals.find(d => d.deal_id === shs[0].deal_id); assert.deepEqual([d0.delivered, d0.delivery_date], [true, '2026-10-07']);
      assert.ok(R.validateShipment({ kind: 'problem', reason: ' ' }, TD).errs.length);
      const t = s.sample_shipments.find(x => x.source === 'auto' && x.status === 'to_ship'), dt = s.deals.find(d => d.deal_id === t.deal_id);
      dt.status = 'Cancel'; dt.sub_status = 'Cancel'; R.syncShipments(s, ctxS(s));
      assert.deepEqual([t.status, t.not_required_reason], ['not_required', 'Deal cancelled']);
      const track = R.sampleTrack(R.shipmentsOf(s, shs[1].deal_id), TD);
      assert.deepEqual([track.kind, track.carrier], ['shipped', 'Kerry Express']);
    });
    test('TC-60 / TC-61: Operations — Samples to ship for Pizza = 4 · Ship sample in the due list · Viewer / Accounting cannot change shipments', () => {
      const s = fresh();
      assert.equal(R.samplesToShip(s, { pic: 'Pizza' }, TD).length, 4);
      assert.equal(R.samplesToShip(s, { pic: '' }, TD).length, 7);
      const d = s.deals.find(x => x.deal_id === R.samplesToShip(s, { pic: 'Pizza' }, TD)[0].deal.deal_id);
      assert.deepEqual(['admin', 'kol_manager', 'viewer', 'accounting'].map(role => R.canEditShipment({ role, active: true }, d)), [true, true, false, false]);
      assert.deepEqual([R.canEditShipment(s.users.find(u => u.display_name === 'Pizza'), d), R.canEditShipment(s.users.find(u => u.display_name === 'Amp'), d)], [true, false]);
      const sh = s.sample_shipments.find(x => x.source === 'auto' && x.ship_by); sh.ship_by = R.addDays(TD, 3);
      assert.ok(R.sampleDues(s, {}, TD, 7).some(r => r.sample.shipment_id === sh.shipment_id));
      assert.equal(R.trackingLink({ tracking_url: { 'Kerry Express': 'https://track.example/?t={tracking}' } }, 'Kerry Express', 'KE 1'), 'https://track.example/?t=KE%201');
    });
    test('§4.14 / §6: shipping details only encrypted (secure_ship) · Reset vault clears them (No address) · never in Backup as text', () => {
      const s = fresh(), k = s.kol_master[0], p = R.blankPayee(s, { payee_id: 'PY-T1', kol_id: k.kol_id, user: 'U000', now: 'x' });
      Object.assign(p, { secure_ship: { key_id: 'k', wrapped_key: 'w', iv: 'i', ciphertext: 'c' }, shipping_on_file: true }); s.payee_profiles.push(p);
      assert.ok(!Object.keys(p).some(x => /^ship_(name|phone|address)$/.test(x)));
      R.resetVault(s);
      assert.deepEqual([p.secure_ship, p.shipping_on_file], [null, false]);
    });
  });
});
