/* rules-metrics.js — CR-10 post performance: which posts count as posted, the numbers of a set of posts (postMetrics — Deals › Performance
   and the Dashboard's Engagement read the same function, so they always agree), the metrics status of a post, reading a typed or pasted
   count and matching pasted post links. Cost of a post = R.postShare (CR-03: the deal's total split evenly over its posts).
   null metrics = no data yet (≠ 0). Pure functions. Adds to KT.rules (load after rules-dash.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, isISODate, trim, dayDiff } = R;
  const METRICS = ['views', 'likes', 'comments', 'shares', 'saves'];   // the order on screen and in a paste (§4.6)
  const ENGAGE = ['likes', 'comments', 'shares', 'saves'];
  const PERF_PLATFORMS = ['TikTok', 'Instagram', 'Facebook', 'X', 'YouTube', 'Lemon8', 'Other'];
  const METRICS_STATUSES = ['none', 'imported', 'updated', 'stale'];
  const val = v => (v == null || v === '' || isNaN(v) ? null : Number(v));
  const n0 = v => val(v) || 0;
  const engagementOf = p => ENGAGE.reduce((a, k) => a + n0(p[k]), 0);
  const hasMetrics = p => val(p.views) != null;
  /* §4.1 — posted = a post date on or before today, or a link (an old post with a link and no date counts) */
  const isPosted = (p, today) => (isISODate(p.post_date) && p.post_date <= today) || !isBlank(p.post_link);
  const metricsStaleDays = lookups => { const v = Number((lookups || {}).metrics_stale_days); return v > 0 ? Math.round(v) : 14; };

  /* §4.3 — items [{post, cost}] → the numbers of the set:
     views / likes / … = sums (null = 0) · engagement = likes + comments + shares + saves ·
     ER = Σ engagement ÷ Σ views and CPV = Σ cost ÷ Σ views over posts with views > 0 · CPE = Σ cost ÷ Σ engagement over posts with engagement > 0 */
  function postMetrics(items) {
    const list = items || [], sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const withViews = list.filter(x => n0(x.post.views) > 0), withEng = list.filter(x => engagementOf(x.post) > 0);
    const out = { posted: list.length, noDate: list.filter(x => !isISODate(x.post.post_date)).length, withMetrics: list.filter(x => hasMetrics(x.post)).length,
      withViews: withViews.length, cost: sum(list, x => x.cost || 0), costViews: sum(withViews, x => x.cost || 0) };
    METRICS.forEach(k => { out[k] = sum(list, x => n0(x.post[k])); });
    out.engagement = ENGAGE.reduce((a, k) => a + out[k], 0);
    const vViews = sum(withViews, x => n0(x.post.views)), eViews = sum(withViews, x => engagementOf(x.post)), eng = sum(withEng, x => engagementOf(x.post));
    out.er = vViews ? eViews / vViews : null;
    out.cpv = vViews ? out.costViews / vViews : null;
    out.cpe = eng ? sum(withEng, x => x.cost || 0) / eng : null;
    return out;
  }

  /* §4.3 — No metrics · Imported (old file, no update date) · Updated (within staleDays) · Stale */
  function metricsStatus(p, today, staleDays) {
    if (!hasMetrics(p)) return 'none';
    const at = String(p.metrics_updated_at || '').slice(0, 10);
    if (p.metrics_source === 'legacy' || !isISODate(at)) return 'imported';
    return dayDiff(today, at) <= (staleDays > 0 ? staleDays : 14) ? 'updated' : 'stale';
  }

  /* §4.5 — a count as typed or pasted: 1300000 · 1,300,000 · 1.3M · 33.4K · 1.2k → a whole number · blank → null (clears it) ·
     negative, words or a fraction without K / M → {error} */
  function parseCount(text) {
    const t = trim(text == null ? '' : String(text)).replace(/[,\s]/g, '');
    if (!t) return { value: null };
    const m = t.match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
    if (!m || (!m[2] && m[1].includes('.'))) return { error: C.msg.countInvalid };
    return { value: Math.round(Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1)) };
  }

  /* §4.6 — a link as typed or pasted, for matching: no scheme needed · the host in lower case without www. · no #… · no / at the end ·
     no query string — except where the post is in the query (facebook …/permalink.php?story_fbid= · youtube /watch?v=) */
  function normalizePostLink(u) {
    let t = trim(u == null ? '' : String(u)).split('#')[0];
    if (!t) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
    const n = R.normLink(t), i = n.indexOf('?'), base = (i < 0 ? n : n.slice(0, i)).replace(/\/+$/, '');
    return i >= 0 && /(\.php|\/watch)$/i.test(base) ? base + n.slice(i) : base;
  }

  /* ===================== Deals › Performance (§4.1–4.4) ===================== */
  /* one row per posted post of the deals given (cancelled deals left out) · the tier and followers are the posting account's (§9 #3) */
  function perfRows(state, deals, today, ctx) {
    const rules = state.lookups.tier_rules || [], stale = metricsStaleDays(state.lookups), grace = R.perfSettings(state.lookups).grace, rows = [];
    (deals || []).forEach(d => {
      if (R.isCancelled(d)) return;
      const posts = R.postsOfCtx(ctx, d.deal_id), cost = R.postShare(d, posts);
      posts.forEach(p => {
        if (!isPosted(p, today)) return;
        const a = ctx.accounts.get(p.account_id) || null, followers = a && Number(a.followers) > 0 ? Number(a.followers) : null;
        const pl = R.postPlatform(ctx, p), r = (ctx.phaseIdx && ctx.phaseIdx.post.get(p.post_id)) || {}, views = val(p.views), eng = engagementOf(p);
        const late = isISODate(p.post_date) && isISODate(p.expected_post_date) ? dayDiff(p.post_date, p.expected_post_date) : null;
        rows.push({ key: p.post_id, post: p, deal: d, kol: ctx.kols.get(d.kol_id) || null, account: a, handle: (a && a.handle) || '',
          platform: PERF_PLATFORMS.includes(pl) ? pl : 'Other', tier: followers ? (R.tierOf(followers, rules) || R.UNKNOWN_TIER) : R.UNKNOWN_TIER, followers,
          phase: r.phase || (r.slot === 'unscheduled' ? R.UNSCHEDULED : r.slot === 'needs' ? R.NEEDS : null), status: metricsStatus(p, today, stale), cost,
          views, likes: val(p.likes), comments: val(p.comments), shares: val(p.shares), saves: val(p.saves), engagement: hasMetrics(p) || eng ? eng : null,
          er: views > 0 ? eng / views : null, cpv: views > 0 ? cost / views : null, cpe: eng > 0 ? cost / eng : null, vpf: views != null && followers ? views / followers : null,
          lateDays: late == null ? null : late > grace ? late : 0, pic: d.pic || '' });
      });
    });
    return rows;
  }
  const blankPerfFilter = () => ({ platform: '', tier: '', mstatus: '', link: '' });
  const PERF_FILTER_KEYS = ['platform', 'tier', 'mstatus', 'link'];
  /* f = {q (KOL · @handle · deal ID · post link), platform, tier, mstatus, link ('has' | 'none')} */
  function filterPerfRows(rows, f) {
    const q = trim(f.q).toLowerCase().replace(/^@/, '');
    return rows.filter(r => {
      if (f.platform && r.platform !== f.platform) return false;
      if (f.tier && r.tier !== f.tier) return false;
      if (f.mstatus && r.status !== f.mstatus) return false;
      if (f.link === 'has' && isBlank(r.post.post_link)) return false;
      if (f.link === 'none' && !isBlank(r.post.post_link)) return false;
      if (q && ![r.kol && r.kol.display_name, r.handle, r.deal.deal_id, r.post.post_link].some(v => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  /* sort: any column · empty values always last · ties: more views first, then the post ID */
  function sortPerfRows(rows, key, dir, tierRules) {
    const tiers = R.tierOrder(tierRules), k = dir === 'asc' ? 1 : -1;
    const get = {
      kol: r => ((r.kol && r.kol.display_name) || '').toLowerCase(), tier: r => tiers.indexOf(r.tier), platform: r => PERF_PLATFORMS.indexOf(r.platform),
      post: r => (isBlank(r.post.post_link) ? 0 : 1), post_date: r => r.post.post_date || null, updated: r => (r.status === 'none' ? null : String(r.post.metrics_updated_at || '')),
      pic: r => r.pic || null, phase: r => r.phase || null, gencode: r => (isBlank(r.post.gencode_code) ? 0 : 1), pillar: r => r.deal.pillar || null,
      expected: r => r.post.expected_post_date || null, ontime: r => r.lateDays,
    }[key] || (r => r[key]);
    const empty = v => v == null || v === '';
    return rows.slice().sort((a, b) => {
      const x = get(a), y = get(b);
      if (empty(x) || empty(y)) { if (empty(x) && !empty(y)) return 1; if (!empty(x) && empty(y)) return -1; }
      else { const c = typeof x === 'string' ? x.localeCompare(y, 'th') : x - y; if (c) return k * c; }
      return n0(b.views) - n0(a.views) || String(a.key).localeCompare(String(b.key));
    });
  }
  /* §4.4 — groups in their order: Post tier (Mega → Unknown) · Platform · Phase (the Campaign's order, then Needs phase / Unscheduled) · PIC (A → Z, Unassigned last) */
  function groupPerfRows(state, rows, by) {
    if (!by || by === 'none') return [{ key: '', rows }];
    const keyOf = { tier: r => r.tier, platform: r => r.platform, phase: r => r.phase || R.NEEDS, pic: r => r.pic }[by];
    const m = new Map(); rows.forEach(r => { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    let order;
    if (by === 'tier') order = R.tierOrder(state.lookups.tier_rules);
    else if (by === 'platform') order = PERF_PLATFORMS;
    else if (by === 'phase') { const ids = new Set(rows.map(r => r.deal.campaign_id)); order = R.sortPhases(state.phases.filter(p => ids.has(p.campaign_id))).map(p => p.phase_id).concat([R.NEEDS, R.UNSCHEDULED]); }
    else order = [...m.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'th')).concat(['']);
    return order.filter(k => m.has(k)).map(k => ({ key: k, rows: m.get(k) })).concat([...m.keys()].filter(k => !order.includes(k)).map(k => ({ key: k, rows: m.get(k) })));
  }
  const perfMetricsOf = rows => postMetrics(rows.map(r => ({ post: r.post, cost: r.cost })));

  /* ===================== updating metrics (§4.5–4.6) ===================== */
  const metricsOf = p => Object.fromEntries(METRICS.map(k => [k, val((p || {})[k])]));
  const sameMetrics = (a, b) => METRICS.every(k => val((a || {})[k]) === val((b || {})[k]));
  /* warnings — saved anyway: a like / comment / share / save count above views · views lower than the last update */
  function metricsWarnings(before, after) {
    const w = [], v = val(after.views), b = val((before || {}).views);
    if (v != null && ENGAGE.some(k => val(after[k]) != null && val(after[k]) > v)) w.push({ kind: 'engHigh', msg: C.msg.metricsEngHigh });
    if (b != null && v != null && v < b) w.push({ kind: 'viewsDown', msg: C.msg.metricsViewsDown(R.fmtNum(b)) });
    return w;
  }
  /* write values on the post (keys left out keep theirs) → its 'metrics' event (from / to = the five values) ·
     ctx = {today, now, user, eventId, note} · source 'manual' | 'paste' */
  function setMetrics(post, values, ctx, source) {
    const from = metricsOf(post), to = Object.assign({}, from);
    METRICS.forEach(k => { if (Object.prototype.hasOwnProperty.call(values, k)) to[k] = val(values[k]); });
    METRICS.forEach(k => { post[k] = to[k]; });
    Object.assign(post, { metrics_updated_at: ctx.today, metrics_updated_by: ctx.user || null, metrics_source: source || 'manual' });
    return { event_id: ctx.eventId, deal_id: post.deal_id, post_id: post.post_id, type: 'metrics', from, to, changed_at: ctx.now || null, changed_by: ctx.user || null, note: ctx.note || null };
  }
  /* who may change a post's metrics: Admin · KOL Manager · Staff on deals they are the PIC of — Viewer / Accounting read only */
  const canEditMetrics = (user, deal) => !!user && !!deal && R.can(user, 'deal.edit') && (user.role !== 'staff' || (!!R.picName(user) && deal.pic === R.picName(user)));

  /* §4.6 — a paste from a sheet: one post a line · cells by Tab (a sheet copy) or comma · Post link · Views · Likes · Comments · Shares · Saves ·
     a header line or not · a blank cell keeps the value · links match the posts in scope (rows = perfRows) by normalizePostLink ·
     → { lines [{line, link, status: matched | nochange | notfound | error | notyours, row, from, to, changed [keys], warns, reason}], counts } */
  function planPaste(text, rows, user) {
    const P = C.perfTab.paste, byLink = new Map();
    rows.forEach(r => { const k = normalizePostLink(r.post.post_link); if (k) { if (!byLink.has(k)) byLink.set(k, []); byLink.get(k).push(r); } });
    const lines = [], counts = { matched: 0, nochange: 0, notfound: 0, error: 0, notyours: 0 };
    let first = true;
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      if (!trim(raw)) return;
      const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map(c => trim(c));
      const head = first && !/[./]/.test(cells[0]); first = false;
      if (head) return;   // "Post link · Views · …"
      const x = { line: i + 1, link: cells[0] || '', values: {}, bad: [], changed: [], warns: [] };
      METRICS.forEach((k, j) => { const c = cells[j + 1]; if (c == null || c === '') return; const p = parseCount(c); if (p.error) x.bad.push(`${C.perfTab.col[k]} "${c}"`); else x.values[k] = p.value; });
      if (!x.link) Object.assign(x, { status: 'error', reason: P.noLink });
      else if (x.bad.length) Object.assign(x, { status: 'error', reason: P.badNumber(x.bad.join(', ')) });
      else {
        const hit = (byLink.get(normalizePostLink(x.link)) || [])[0];
        if (!hit) Object.assign(x, { status: 'notfound', reason: P.notFoundWhy });
        else {
          x.row = hit; x.from = metricsOf(hit.post); x.to = Object.assign({}, x.from, x.values);
          x.changed = METRICS.filter(k => x.to[k] !== x.from[k]);
          if (!canEditMetrics(user, hit.deal)) Object.assign(x, { status: 'notyours', reason: P.notYoursWhy });
          else if (!x.changed.length) x.status = 'nochange';
          else { x.status = 'matched'; x.warns = metricsWarnings(x.from, x.to); }
        }
      }
      counts[x.status]++; lines.push(x);
    });
    return { lines, counts };
  }
  /* Copy template: the header + every post link in scope, one a line, ready to fill in a sheet and paste back */
  const pasteTemplate = rows => [[C.perfTab.paste.colLink].concat(METRICS.map(k => C.perfTab.col[k])).join('\t')]
    .concat([...new Set(rows.map(r => trim(r.post.post_link)).filter(Boolean))]).join('\n');

  return { METRICS, ENGAGE, PERF_PLATFORMS, METRICS_STATUSES, engagementOf, hasMetrics, isPosted, metricsStaleDays, postMetrics, metricsStatus, parseCount,
    normalizePostLink, perfRows, blankPerfFilter, PERF_FILTER_KEYS, filterPerfRows, sortPerfRows, groupPerfRows, perfMetricsOf,
    metricsOf, sameMetrics, metricsWarnings, setMetrics, canEditMetrics, planPaste, pasteTemplate };
})(KT.rules, KT.content));
