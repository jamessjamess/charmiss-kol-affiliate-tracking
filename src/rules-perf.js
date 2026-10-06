/* rules-perf.js — CR-06 §4.4–4.5: KOL performance (does the KOL post on time?) and Last worked. Adds to KT.rules
   (load after rules-products.js). No DOM, no storage. Only deals that are not cancelled count.
     On-time rate   posts posted by expected_post_date + grace ÷ posts that have both dates (grace: lookups.ontime_grace_days, 1)
     Avg delay      days after expected_post_date, over the late posts · Late posts = posted after expected + grace
     Overdue now    open deals' posts whose expected date has passed and that are not posted
     Avg draft rounds  draft_rounds of Complete deals · Completion = Complete ÷ deals past List
     Views / post · ER · CPV over the posts with views (CR-03: ER = interactions ÷ views · CPV = their share of the deal cost ÷ views)
     Badge          Reliable ≥ 90% · Watch 70–89% · Late < 70% · Not enough data with fewer measured posts than lookups.reliability_min_posts (2)
   Last worked = the latest post_date of the KOL's posts, else the latest expected_post_date, else Never (no deal that is not cancelled). */
Object.assign(KT.rules, (function (R) {
  'use strict';
  const { isBlank, isISODate, addDays, dayDiff, totalCost } = R;
  const num = v => Number(v) || 0;
  const setting = (v, d) => (isBlank(v) || isNaN(v) ? d : Number(v));
  const perfSettings = lookups => ({ grace: setting((lookups || {}).ontime_grace_days, 1), minPosts: setting((lookups || {}).reliability_min_posts, 2) });
  const BADGES = ['reliable', 'watch', 'late', 'none'];
  const badgeOf = (rate, measured, minPosts) => (measured < minPosts || rate == null ? 'none' : rate >= 0.9 ? 'reliable' : rate >= 0.7 ? 'watch' : 'late');

  /* one pass: kol_id → {deals (not cancelled), posts [{post, deal}]} */
  function perfIndex(state) {
    const byKol = new Map(), postsBy = new Map();
    state.deal_posts.forEach(p => { if (!postsBy.has(p.deal_id)) postsBy.set(p.deal_id, []); postsBy.get(p.deal_id).push(p); });
    state.deals.forEach(d => {
      if (d.status === 'Cancel') return;
      const x = byKol.get(d.kol_id) || { deals: [], posts: [] }; byKol.set(d.kol_id, x);
      x.deals.push(d); (postsBy.get(d.deal_id) || []).forEach(p => x.posts.push({ post: p, deal: d, share: totalCost(d) / (postsBy.get(d.deal_id) || [1]).length }));
    });
    return byKol;
  }
  /* → the metrics of one KOL (null values when there is nothing to measure) */
  function kolPerformance(state, kolId, today, idx) {
    const set = perfSettings(state.lookups), x = (idx || perfIndex(state)).get(kolId) || { deals: [], posts: [] };
    const measured = x.posts.filter(({ post: p }) => isISODate(p.post_date) && isISODate(p.expected_post_date));
    const late = measured.filter(({ post: p }) => p.post_date > addDays(p.expected_post_date, set.grace))
      .map(({ post: p, deal: d }) => ({ post: p, deal: d, expected: p.expected_post_date, posted: p.post_date, days: dayDiff(p.post_date, p.expected_post_date) }))
      .sort((a, b) => b.days - a.days || String(a.post.post_id).localeCompare(String(b.post.post_id)));
    const onTime = measured.length - late.length, rate = measured.length ? onTime / measured.length : null;
    const open = d => d.status === 'List' || d.status === 'Inprocess';
    const overdue = x.posts.filter(({ post: p, deal: d }) => open(d) && isISODate(p.expected_post_date) && p.expected_post_date < today && !p.post_date).length;
    const complete = x.deals.filter(d => d.status === 'Complete'), pastList = x.deals.filter(d => d.status !== 'List');
    const withViews = x.posts.filter(({ post: p }) => num(p.views) > 0), sum = k => withViews.reduce((a, { post: p }) => a + num(p[k]), 0), views = sum('views');
    return {
      measured: measured.length, onTime, late: late.length, rate, latePosts: late,
      avgDelay: late.length ? late.reduce((a, l) => a + l.days, 0) / late.length : null,
      overdue, avgDrafts: complete.length ? complete.reduce((a, d) => a + num(d.draft_rounds || 1), 0) / complete.length : null,
      completion: pastList.length ? complete.length / pastList.length : null, completeDeals: complete.length, dealsPastList: pastList.length,
      postsWithViews: withViews.length, avgViews: withViews.length ? views / withViews.length : null,
      er: views ? (sum('likes') + sum('comments') + sum('saves') + sum('shares')) / views : null,
      cpv: views ? withViews.reduce((a, w) => a + w.share, 0) / views : null,
      badge: badgeOf(rate, measured.length, set.minPosts), grace: set.grace, minPosts: set.minPosts,
    };
  }
  /* Last worked: the latest post date, else the latest expected post date · null = Never */
  function lastWorked(state, kolId, idx) {
    const x = (idx || perfIndex(state)).get(kolId); if (!x || !x.deals.length) return null;
    const posted = x.posts.map(w => w.post.post_date).filter(isISODate).sort().pop();
    return posted || x.posts.map(w => w.post.expected_post_date).filter(isISODate).sort().pop() || null;
  }
  /* the Last worked filter: 3 months = 91 days · 6 = 182 · 12 = 365 (a date still ahead counts as the last 3 months) */
  const LAST_WORKED = ['m3', 'm6', 'm12', 'over', 'never'];
  function lastWorkedBucket(date, today) {
    if (!date) return 'never';
    const ago = dayDiff(today, date);
    return ago <= 91 ? 'm3' : ago <= 182 ? 'm6' : ago <= 365 ? 'm12' : 'over';
  }
  /* the whole team at once (KOL Master): kol_id → {perf, last, bucket} */
  function kolPerfAll(state, today) {
    const idx = perfIndex(state), out = new Map();
    state.kol_master.forEach(k => { const last = lastWorked(state, k.kol_id, idx); out.set(k.kol_id, { perf: kolPerformance(state, k.kol_id, today, idx), last, bucket: lastWorkedBucket(last, today) }); });
    return out;
  }
  /* Settings › KOL performance: grace 0–30 whole days · minimum posts 1–20 */
  function validatePerfSettings(d) {
    const M = KT.content.msg, errs = [], n = v => Number(v);
    if (isBlank(d.ontime_grace_days) || !Number.isInteger(n(d.ontime_grace_days)) || n(d.ontime_grace_days) < 0 || n(d.ontime_grace_days) > 30) errs.push({ field: 'ontime_grace_days', msg: M.perfGrace });
    if (isBlank(d.reliability_min_posts) || !Number.isInteger(n(d.reliability_min_posts)) || n(d.reliability_min_posts) < 1 || n(d.reliability_min_posts) > 20) errs.push({ field: 'reliability_min_posts', msg: M.perfMinPosts });
    if (d.metrics_stale_days !== undefined && (isBlank(d.metrics_stale_days) || !Number.isInteger(n(d.metrics_stale_days)) || n(d.metrics_stale_days) < 1 || n(d.metrics_stale_days) > 365)) errs.push({ field: 'metrics_stale_days', msg: M.perfStale });   // CR-10
    return { errs, warns: [], infos: [] };
  }

  return { perfSettings, BADGES, badgeOf, perfIndex, kolPerformance, lastWorked, LAST_WORKED, lastWorkedBucket, kolPerfAll, validatePerfSettings };
})(KT.rules));
