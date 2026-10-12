/* rules-grade.js — CR-34 Partner Grade (A Excellent · B Good · C Needs improvement · D Do not rehire). Every score comes from here (R.gradeEngine):
     Benchmarks   a Campaign's (campaigns.benchmarks) over the defaults of Settings › Grades (lookups.grade_rules.bench) · Cost per consideration =
                  CPM ÷ (1,000 × rate) unless typed over
     Performance  a post's ratio against its pillar's benchmark (> 1 = better): Awareness CPM · Consideration CPCons · Awareness & Consideration the average
                  of the two · Conversion / an Affiliate ROAS · no pillar → the Phase's default pillar · no benchmark / no numbers → none
     Operation    a deal 0–100: on time (Draft / Post against their due) 50 · rounds (1 = full, −15 each round more) 30 · no Incident 20
     Grade        the latest 6 posts in 6 months (Settings) · fewer than 2 = Not enough data · no ratio (or fewer than 2) = Ops only · a serious Incident
                  (No-show · Breach) = D at once
   The grade a person confirmed (partner_grades.confirmed) is the one shown everywhere · a suggestion that differs waits in the review queue ·
   Override locks it 90 days or until 2 new posts · history in grade_history. Pure functions (no DOM, no storage). Adds to KT.rules. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, isISODate, trim, addDays, dayDiff, totalCost } = R;
  const GRADES = ['A', 'B', 'C', 'D'];
  const PILLAR_AW = 'Awareness', PILLAR_CO = 'Consideration', PILLAR_AC = 'Awareness & Consideration', PILLAR_CV = 'Conversion';
  const CONS_ACTIONS = ['likes', 'comments', 'shares', 'saves', 'clicks'];
  const INCIDENT_TYPES = ['late', 'missed_brief', 'no_show', 'breach', 'other'];
  const SERIOUS = ['no_show', 'breach'];
  const BENCH_KEYS = ['cpm', 'cons_rate', 'cpcons', 'roas', 'affiliate_roas', 'clips_target_pct'];
  const num = v => (v == null || v === '' || isNaN(v) ? null : Number(v));
  const pos = v => { const n = num(v); return n != null && n > 0 ? n : null; };
  const r2 = n => Math.round(n * 100) / 100, r4 = n => Math.round(n * 10000) / 10000;

  /* ===================== Settings › Grades ===================== */
  const GRADE_RULES_DEFAULT = { a_ratio: 1.25, a_ops: 85, b_ratio: 1.0, b_ops: 70, c_ratio: 0.7, c_ops: 50, w_perf: 60, w_ops: 40, posts: 6, months: 6, min_posts: 2,
    cons_actions: ['likes', 'comments', 'shares', 'saves'], lock_days: 90, lock_posts: 2, bench: { cpm: null, cons_rate: null, cpcons: null, roas: null, affiliate_roas: null, clips_target_pct: 20 } };
  function gradeRules(lookups) {
    const g = (lookups || {}).grade_rules || {}, d = GRADE_RULES_DEFAULT, out = {};
    Object.keys(d).forEach(k => { if (k === 'bench' || k === 'cons_actions') return; out[k] = num(g[k]) != null ? num(g[k]) : d[k]; });
    out.cons_actions = Array.isArray(g.cons_actions) && g.cons_actions.length ? g.cons_actions.filter(k => CONS_ACTIONS.includes(k)) : d.cons_actions.slice();
    out.bench = Object.assign({}, d.bench, Object.fromEntries(Object.entries(g.bench || {}).filter(([k, v]) => BENCH_KEYS.includes(k) && num(v) != null).map(([k, v]) => [k, num(v)])));
    return out;
  }
  /* the form (strings) → { errs } · thresholds A ≥ B ≥ C · weights 0–100 · posts 1–50 · months 1–24 · min 1–posts · actions ≥ 1 · benchmarks ≥ 0 (rate / target 0–100) */
  function validateGradeRules(d) {
    const M = C.grade.err, errs = [], bad = (k, msg) => errs.push({ field: k, msg });
    const n = k => num(d[k]), inRange = (k, a, z) => n(k) != null && n(k) >= a && n(k) <= z;
    ['a_ratio', 'b_ratio', 'c_ratio'].forEach(k => { if (!inRange(k, 0, 10)) bad(k, M.ratio); });
    ['a_ops', 'b_ops', 'c_ops', 'w_perf', 'w_ops'].forEach(k => { if (!inRange(k, 0, 100)) bad(k, M.pct); });
    if (!errs.length && !(n('a_ratio') >= n('b_ratio') && n('b_ratio') >= n('c_ratio') && n('a_ops') >= n('b_ops') && n('b_ops') >= n('c_ops'))) bad('a_ratio', M.order);
    if (!errs.some(e => /^w_/.test(e.field)) && n('w_perf') + n('w_ops') <= 0) bad('w_perf', M.weights);
    if (!inRange('posts', 1, 50) || !Number.isInteger(n('posts'))) bad('posts', M.posts);
    if (!inRange('months', 1, 24) || !Number.isInteger(n('months'))) bad('months', M.months);
    if (!inRange('min_posts', 1, 50) || !Number.isInteger(n('min_posts')) || (n('posts') && n('min_posts') > n('posts'))) bad('min_posts', M.minPosts);
    if (!inRange('lock_days', 1, 365) || !Number.isInteger(n('lock_days'))) bad('lock_days', M.lockDays);
    if (!Array.isArray(d.cons_actions) || !d.cons_actions.length) bad('cons_actions', M.actions);
    errs.push(...validateBenchmarks(d.bench || {}, 'bench_'));
    return { errs, warns: [], infos: [] };
  }
  /* benchmarks as typed (blank = not set) → errs: a number ≥ 0 · the rate and the clips target 0–100 */
  function validateBenchmarks(b, prefix = '') {
    const M = C.grade.err, errs = [];
    BENCH_KEYS.forEach(k => {
      const v = b[k]; if (isBlank(v)) return;
      const n = num(String(v).replace(/,/g, ''));
      if (n == null || n < 0) errs.push({ field: prefix + k, msg: M.number });
      else if ((k === 'cons_rate' || k === 'clips_target_pct') && n > 100) errs.push({ field: prefix + k, msg: M.pct });
    });
    return errs;
  }
  /* typed → stored ({ key: number | null }) */
  const benchRecord = b => Object.fromEntries(BENCH_KEYS.map(k => [k, isBlank((b || {})[k]) ? null : num(String(b[k]).replace(/,/g, ''))]));
  /* cost per consideration from CPM and the rate (%): ฿15 · 1% → ฿1.50 */
  const cpconsFrom = (cpm, ratePct) => (pos(cpm) != null && pos(ratePct) != null ? r4(cpm / (1000 * ratePct / 100)) : null);
  /* a Campaign's benchmarks: its own over the defaults · cpcons = typed or worked out · { …, cpconsAuto, own (any of its own) } */
  function benchmarksOf(state, campaignOrId) {
    const c = typeof campaignOrId === 'string' ? (state.campaigns || []).find(x => x.campaign_id === campaignOrId) : campaignOrId;
    const def = gradeRules(state.lookups).bench, own = (c && c.benchmarks) || {}, out = {};
    BENCH_KEYS.forEach(k => { out[k] = num(own[k]) != null ? num(own[k]) : def[k] != null ? def[k] : null; });
    const auto = cpconsFrom(out.cpm, out.cons_rate);
    out.cpconsAuto = num(own.cpcons) == null && (def.cpcons == null || num(own.cpm) != null || num(own.cons_rate) != null);
    if (out.cpconsAuto) out.cpcons = auto;
    out.own = BENCH_KEYS.some(k => num(own[k]) != null);
    return out;
  }

  /* ===================== a post: its numbers against the benchmark ===================== */
  const consActions = (p, keys) => { const ks = keys || GRADE_RULES_DEFAULT.cons_actions, have = ks.filter(k => num(p[k]) != null); return have.length ? have.reduce((a, k) => a + num(p[k]), 0) : null; };
  /* the pillar a post is measured by: the deal's · else its Phase's default pillar · an Affiliate partner is measured by ROAS */
  function pillarFor(state, deal, post, idx) {
    if (!isBlank(deal.pillar)) return deal.pillar;
    const ph = idx && idx.post && idx.post.get(post.post_id), pid = ph && ph.phase, p = pid ? (state.phases || []).find(x => x.phase_id === pid) : null;
    return p && !isBlank(p.default_pillar) ? p.default_pillar : null;
  }
  /* → { pillar, cost, reach, cpm, cpcons, roas, ratio, parts {aw, co, cv}, bench } — ratio null when it cannot be measured */
  function postRatio(state, deal, post, o = {}) {
    const rules = o.rules || gradeRules(state.lookups), b = o.bench || benchmarksOf(state, deal.campaign_id);
    const posts = o.posts || R.postsOf(state, deal.deal_id), cost = o.cost != null ? o.cost : R.postShare(deal, posts);
    const kol = o.kol || R.kolById(state, deal.kol_id), aff = !!kol && R.partnerTypeOf(kol) === 'affiliate';
    const pillar = aff ? 'Affiliate' : pillarFor(state, deal, post, o.idx || null);
    const reach = pos(post.reach), acts = consActions(post, rules.cons_actions);
    const cpm = reach && cost > 0 ? r4(cost / reach * 1000) : null, cpcons = acts && cost > 0 ? r4(cost / acts) : null;
    const roas = num(post.roas) != null ? num(post.roas) : num(post.sales) != null && cost > 0 ? r4(num(post.sales) / cost) : null;
    const aw = cpm && pos(b.cpm) ? r4(b.cpm / cpm) : null, co = cpcons && pos(b.cpcons) ? r4(b.cpcons / cpcons) : null;
    const target = aff ? pos(b.affiliate_roas) || pos(b.roas) : pos(b.roas), cv = roas != null && target ? r4(roas / target) : null;
    let ratio = null;
    if (pillar === PILLAR_AW) ratio = aw;
    else if (pillar === PILLAR_CO) ratio = co;
    else if (pillar === PILLAR_AC) { const both = [aw, co].filter(v => v != null); ratio = both.length ? r4(both.reduce((a, v) => a + v, 0) / both.length) : null; }
    else if (pillar === PILLAR_CV || pillar === 'Affiliate') ratio = cv;
    return { pillar, cost: r2(cost || 0), reach, actions: acts, cpm, cpcons, roas, ratio, parts: { aw, co, cv }, bench: b, target };
  }

  /* ===================== a deal: Operation 0–100 ===================== */
  /* on time = each Draft done (approved_draft{n}_date) by its expected date and each post by its expected date (+ grace days) · nothing to measure = full */
  function opsOfDeal(state, deal, o = {}) {
    const grace = o.grace != null ? o.grace : R.perfSettings(state.lookups).grace, posts = o.posts || R.postsOf(state, deal.deal_id);
    const inc = (o.incidents || incidentsOfDeal(state, deal.deal_id));
    let measured = 0, onTime = 0;
    [1, 2, 3].forEach(n => { const due = deal[`expected_draft${n}_date`], done = deal[`approved_draft${n}_date`]; if (isISODate(due) && isISODate(done)) { measured++; if (done <= addDays(due, grace)) onTime++; } });
    posts.forEach(p => { if (isISODate(p.expected_post_date) && isISODate(p.post_date)) { measured++; if (p.post_date <= addDays(p.expected_post_date, grace)) onTime++; } });
    const rounds = Math.max(1, Number(deal.draft_rounds) || 1);
    const tPart = measured ? 50 * onTime / measured : 50, rPart = Math.max(0, 30 - 15 * (rounds - 1)), iPart = inc.length ? 0 : 20;
    return { score: Math.round(tPart + rPart + iPart), onTime, measured, rounds, incidents: inc.length, serious: inc.filter(i => SERIOUS.includes(i.type)).length };
  }

  /* ===================== Incidents ===================== */
  const incidentsOfDeal = (state, dealId) => (state.deal_incidents || []).filter(i => i.deal_id === dealId && !i.deleted_at);
  const incidentsOfKol = (state, kolId) => (state.deal_incidents || []).filter(i => i.kol_id === kolId && !i.deleted_at);
  const isSerious = i => !!i && SERIOUS.includes(i.type);
  function validateIncident(d) {
    const M = C.grade.err, errs = [];
    if (!INCIDENT_TYPES.includes(d.type)) errs.push({ field: 'type', msg: M.incType });
    if (!isISODate(d.date)) errs.push({ field: 'date', msg: C.msg.dateInvalid(C.grade.inc.date) });
    if (d.type === 'other' && !trim(d.note)) errs.push({ field: 'note', msg: M.incNote });
    if (R.looksSensitive && R.looksSensitive(d.note)) errs.push({ field: 'note', msg: C.msg.sensitive });
    return { errs, warns: [], infos: [] };
  }
  /* → the record (IN-0001 by the caller) · and its event on the deal (type incident · to = the type · nothing more) */
  function newIncident(deal, d, ctx) {
    const rec = { incident_id: ctx.incidentId, deal_id: deal.deal_id, kol_id: deal.kol_id, type: d.type, date: d.date, note: trim(d.note) || null, created_by: ctx.user || null, created_at: ctx.now, deleted_at: null, deleted_by: null };
    return { rec, event: { event_id: ctx.eventId, deal_id: deal.deal_id, type: 'incident', from: null, to: d.type, changed_at: ctx.now, changed_by: ctx.user || null, note: rec.incident_id } };
  }
  function removeIncident(rec, ctx) {
    Object.assign(rec, { deleted_at: ctx.now, deleted_by: ctx.user || null });
    return { event_id: ctx.eventId, deal_id: rec.deal_id, type: 'incident', from: rec.type, to: null, changed_at: ctx.now, changed_by: ctx.user || null, note: rec.incident_id };
  }

  /* ===================== a partner: the grade ===================== */
  /* the index of one pass (sync · the dashboard) */
  function gradeIndex(state) {
    const postsBy = new Map(), dealsBy = new Map(), incBy = new Map();
    (state.deal_posts || []).forEach(p => { if (!postsBy.has(p.deal_id)) postsBy.set(p.deal_id, []); postsBy.get(p.deal_id).push(p); });
    (state.deals || []).forEach(d => { if (R.isCancelled(d)) return; if (!dealsBy.has(d.kol_id)) dealsBy.set(d.kol_id, []); dealsBy.get(d.kol_id).push(d); });
    (state.deal_incidents || []).forEach(i => { if (i.deleted_at) return; if (!incBy.has(i.deal_id)) incBy.set(i.deal_id, []); incBy.get(i.deal_id).push(i); });
    return { postsBy, dealsBy, incBy, phaseIdx: R.phaseIndex(state), rules: gradeRules(state.lookups), grace: R.perfSettings(state.lookups).grace, bench: new Map() };
  }
  const monthsBack = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
  /* status: graded · ops_only · not_enough · none (no deal) — suggested null unless graded / ops_only / a serious Incident (D) */
  function gradeEngine(state, kolId, today, ix) {
    ix = ix || gradeIndex(state);
    const rules = ix.rules, from = monthsBack(today, rules.months), kol = R.kolById(state, kolId), deals = ix.dealsBy.get(kolId) || [];
    if (!deals.length) return { kol_id: kolId, status: 'none', suggested: null, basis: [], posts: [] };
    const all = [];
    deals.forEach(d => { const ps = ix.postsBy.get(d.deal_id) || []; ps.forEach(p => { if (isISODate(p.post_date) && p.post_date <= today && p.post_date >= from) all.push({ post: p, deal: d, posts: ps }); }); });
    all.sort((a, b) => b.post.post_date.localeCompare(a.post.post_date) || String(b.post.post_id).localeCompare(String(a.post.post_id)));
    const basis = all.slice(0, rules.posts);
    const benchOf = cid => { if (!ix.bench.has(cid)) ix.bench.set(cid, benchmarksOf(state, cid)); return ix.bench.get(cid); };
    const rows = basis.map(x => Object.assign({ post_id: x.post.post_id, deal_id: x.deal.deal_id, campaign_id: x.deal.campaign_id, post_date: x.post.post_date },
      postRatio(state, x.deal, x.post, { rules, bench: benchOf(x.deal.campaign_id), posts: x.posts, kol, idx: ix.phaseIdx })));
    const dealIds = [...new Set(basis.map(x => x.deal.deal_id))];
    const ops = dealIds.map(id => { const d = deals.find(y => y.deal_id === id); return Object.assign({ deal_id: id }, opsOfDeal(state, d, { grace: ix.grace, posts: ix.postsBy.get(id) || [], incidents: ix.incBy.get(id) || [] })); });
    /* serious Incidents of the window (any deal of the partner — a No-show may have no post) */
    const serious = deals.flatMap(d => (ix.incBy.get(d.deal_id) || []).filter(i => isSerious(i) && (!isISODate(i.date) || (i.date >= from && i.date <= today))));
    const opsScore = ops.length ? Math.round(ops.reduce((a, x) => a + x.score, 0) / ops.length) : null;
    const ratios = rows.filter(r => r.ratio != null).map(r => r.ratio);
    const perf = ratios.length >= rules.min_posts ? r4(ratios.reduce((a, v) => a + v, 0) / ratios.length) : null;
    const onTime = ops.reduce((a, x) => a + x.onTime, 0), measured = ops.reduce((a, x) => a + x.measured, 0), avgRounds = ops.length ? r2(ops.reduce((a, x) => a + x.rounds, 0) / ops.length) : null;
    const pillars = [...new Set(rows.map(r => r.pillar).filter(Boolean))];
    const out = { kol_id: kolId, basis: rows.map(r => r.post_id), posts: rows, ops, perf_ratio: perf, ops_score: opsScore, ratios: ratios.length, onTime, measured, avgRounds, serious: serious.map(i => i.incident_id), pillars, from };
    let status, g = null;
    if (serious.length) { status = basis.length >= rules.min_posts ? (perf != null ? 'graded' : 'ops_only') : 'not_enough'; g = 'D'; }
    else if (basis.length < rules.min_posts) status = 'not_enough';
    else if (perf == null) { status = 'ops_only'; g = opsScore >= rules.a_ops ? 'A' : opsScore >= rules.b_ops ? 'B' : opsScore >= rules.c_ops ? 'C' : 'D'; }
    else {
      status = 'graded';
      g = perf >= rules.a_ratio && opsScore >= rules.a_ops ? 'A' : perf >= rules.b_ratio && opsScore >= rules.b_ops ? 'B' : perf < rules.c_ratio || opsScore < rules.c_ops ? 'D' : 'C';
    }
    const wSum = rules.w_perf + rules.w_ops || 1, perfScore = perf == null ? null : Math.min(100, perf / (rules.a_ratio || 1) * 100);
    out.score = perf == null ? opsScore : Math.round((rules.w_perf * perfScore + rules.w_ops * (opsScore || 0)) / wSum);
    return Object.assign(out, { status, suggested: g, reason: reasonParts(out, rules) });
  }
  /* the main reason in parts (the words are the screen's): [{k: 'perf', pct, pillar} · {k: 'ontime', n, of} · {k: 'rounds', n} · {k: 'serious', n} · {k: 'opsOnly'} · {k: 'few', n}] */
  function reasonParts(g, rules) {
    const out = [];
    if (g.serious.length) out.push({ k: 'serious', n: g.serious.length });
    if (g.perf_ratio != null) out.push({ k: 'perf', pct: Math.round((g.perf_ratio - 1) * 100), pillar: g.pillars.length === 1 ? g.pillars[0] : null });
    else if (g.basis.length >= rules.min_posts) out.push({ k: 'opsOnly', n: g.ratios });
    else out.push({ k: 'few', n: g.basis.length });
    if (g.measured) out.push({ k: 'ontime', n: g.onTime, of: g.measured });
    if (g.avgRounds != null) out.push({ k: 'rounds', n: g.avgRounds });
    return out;
  }

  /* ===================== the records (partner_grades) · review · history ===================== */
  const gradeOf = (state, kolId) => (state.partner_grades || []).find(g => g.kol_id === kolId) || null;
  /* the grade shown everywhere: the confirmed one · else null (Not graded) */
  const confirmedGrade = (state, kolId) => { const g = gradeOf(state, kolId); return g && GRADES.includes(g.confirmed) ? g.confirmed : null; };
  /* locked (an Override): until locked_until or until lock_posts new posts came after it · a serious Incident breaks it */
  function isLocked(rec, today, rules) {
    if (!rec || !rec.locked_until) return false;
    if (today > rec.locked_until) return false;
    const before = new Set(rec.locked_basis || []), fresh = (rec.basis_posts || []).filter(id => !before.has(id)).length;
    return fresh < ((rules && rules.lock_posts) || GRADE_RULES_DEFAULT.lock_posts);
  }
  /* waits for a person: a suggested grade (A–D) that is not the confirmed one · not while locked (a serious Incident's D always waits) */
  function needsReview(rec, today, rules) {
    if (!rec || !GRADES.includes(rec.suggested) || rec.suggested === rec.confirmed) return false;
    if ((rec.serious || []).length) return true;
    return !isLocked(rec, today, rules);
  }
  const SIG_KEYS = ['suggested', 'status', 'perf_ratio', 'ops_score', 'score'];
  /* every partner with a deal: the suggestion again (the ones whose numbers changed are written) → { changed [kol_id] } — the confirmed grade never moves here */
  function syncGrades(state, today, nowIso) {
    if (!Array.isArray(state.partner_grades)) state.partner_grades = [];
    const ix = gradeIndex(state), byKol = new Map(state.partner_grades.map(g => [g.kol_id, g])), changed = [];
    ix.dealsBy.forEach((deals, kolId) => {
      const g = gradeEngine(state, kolId, today, ix);
      let rec = byKol.get(kolId);
      const next = { suggested: g.suggested, status: g.status, perf_ratio: g.perf_ratio, ops_score: g.ops_score, score: g.score, basis_posts: g.basis, reason: g.reason, serious: g.serious };
      if (!rec) { rec = Object.assign({ kol_id: kolId, confirmed: null, override_reason: null, locked_until: null, locked_basis: null, reviewed_by: null, reviewed_at: null, computed_at: nowIso || null }, next); state.partner_grades.push(rec); byKol.set(kolId, rec); changed.push(kolId); return; }
      const same = SIG_KEYS.every(k => rec[k] === next[k]) && JSON.stringify(rec.basis_posts || []) === JSON.stringify(next.basis_posts) && JSON.stringify(rec.reason || []) === JSON.stringify(next.reason) && JSON.stringify(rec.serious || []) === JSON.stringify(next.serious);
      if (same) return;
      Object.assign(rec, next, { computed_at: nowIso || rec.computed_at || null }); changed.push(kolId);
    });
    /* a partner whose deals are all gone / cancelled: no suggestion (the confirmed grade stays) */
    state.partner_grades.forEach(rec => { if (!ix.dealsBy.has(rec.kol_id) && rec.status !== 'none') { Object.assign(rec, { suggested: null, status: 'none', basis_posts: [], reason: [], serious: [] }); changed.push(rec.kol_id); } });
    return { changed };
  }
  /* the queue: [{rec, kol}] newest first (a D first) */
  function reviewQueue(state, today) {
    const rules = gradeRules(state.lookups);
    return (state.partner_grades || []).filter(g => needsReview(g, today, rules)).map(rec => ({ rec, kol: R.kolById(state, rec.kol_id) })).filter(x => x.kol)
      .sort((a, b) => (b.rec.suggested === 'D') - (a.rec.suggested === 'D') || String(b.rec.computed_at || '').localeCompare(String(a.rec.computed_at || '')) || a.kol.display_name.localeCompare(b.kol.display_name, 'th'));
  }
  const canReview = user => !!user && R.can(user, 'grade.review');
  const histEntry = (rec, to, kind, reason, ctx) => ({ id: ctx.historyId, kol_id: rec.kol_id, from: rec.confirmed || null, to, suggested: rec.suggested || null, kind, reason: reason || null, by: ctx.user || null, at: ctx.now, perf_ratio: rec.perf_ratio, ops_score: rec.ops_score });
  /* Confirm: the suggestion becomes the grade */
  function confirmGrade(state, kolId, ctx) {
    const rec = gradeOf(state, kolId); if (!rec || !GRADES.includes(rec.suggested)) return null;
    const h = histEntry(rec, rec.suggested, 'confirm', null, ctx);
    Object.assign(rec, { confirmed: rec.suggested, override_reason: null, locked_until: null, locked_basis: null, reviewed_by: ctx.user || null, reviewed_at: ctx.now });
    (state.grade_history = state.grade_history || []).push(h);
    return h;
  }
  /* Override: another grade + a reason · locked lock_days or until lock_posts new posts */
  function overrideGrade(state, kolId, grade, reason, ctx) {
    const rec = gradeOf(state, kolId); if (!rec || !GRADES.includes(grade) || !trim(reason)) return null;
    const rules = gradeRules(state.lookups), h = histEntry(rec, grade, 'override', trim(reason), ctx);
    Object.assign(rec, { confirmed: grade, override_reason: trim(reason), locked_until: addDays(ctx.today, rules.lock_days), locked_basis: (rec.basis_posts || []).slice(), reviewed_by: ctx.user || null, reviewed_at: ctx.now });
    (state.grade_history = state.grade_history || []).push(h);
    return h;
  }
  const historyOf = (state, kolId) => (state.grade_history || []).filter(h => h.kol_id === kolId).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  /* up / down: A is the top · Not graded → a grade = new */
  const moveOf = h => (!h.from ? 'new' : GRADES.indexOf(h.to) < GRADES.indexOf(h.from) ? 'up' : GRADES.indexOf(h.to) > GRADES.indexOf(h.from) ? 'down' : 'same');

  /* ===================== Dashboard › Partners ===================== */
  /* f = { from, to, campaign, pillar, partner } · the partners of the committed deals (not cancelled · past Shortlist) of the Campaigns in the range →
     { rows [{kol, grade (confirmed | null), rec, spend, deals, tier, type}], kpi, mix, tierGrid, movement, top, watch } */
  function partnersData(state, f, today) {
    const camps = new Set(R.campaignsInRange(state, f.from, f.to, today, R.DASH_STATUS_DEFAULT || R.CAMPAIGN_STATUSES).map(c => c.campaign_id));
    const rules = state.lookups.tier_rules || [], byKol = new Map();
    (state.deals || []).forEach(d => {
      if (R.isCancelled(d) || R.isShortlist(state.lookups, d) || !camps.has(d.campaign_id)) return;
      if (f.campaign && d.campaign_id !== f.campaign) return;
      if (f.pillar && (d.pillar || '') !== f.pillar) return;
      const k = R.kolById(state, d.kol_id); if (!k) return;
      const type = R.partnerTypeOf(k) === 'affiliate' ? 'affiliate' : 'kol';
      if (f.partner && type !== f.partner) return;
      const x = byKol.get(k.kol_id) || { kol: k, type, spend: 0, deals: 0 }; byKol.set(k.kol_id, x);
      x.spend += totalCost(d); x.deals++;
    });
    const rows = [...byKol.values()].map(x => { const rec = gradeOf(state, x.kol.kol_id), accs = R.accountsOfKol(state, x.kol.kol_id);
      return Object.assign(x, { spend: r2(x.spend), rec, grade: rec && GRADES.includes(rec.confirmed) ? rec.confirmed : null, tier: R.tierOf(R.maxFollowers(accs), rules) || R.UNKNOWN_TIER, review: needsReview(rec, today, gradeRules(state.lookups)) }); });
    const graded = rows.filter(r => r.grade), spendAll = r2(rows.reduce((a, r) => a + r.spend, 0));
    const sumOf = l => r2(l.reduce((a, r) => a + r.spend, 0));
    const ab = graded.filter(r => r.grade === 'A' || r.grade === 'B'), cd = graded.filter(r => r.grade === 'C' || r.grade === 'D');
    const kpi = { graded: graded.length, partners: rows.length, notEnough: rows.filter(r => !r.grade && r.rec && r.rec.status === 'not_enough').length,
      abShare: graded.length ? ab.length / graded.length : null, abSpendShare: sumOf(graded) ? sumOf(ab) / sumOf(graded) : null,
      cdSpend: sumOf(cd), cdShare: spendAll ? sumOf(cd) / spendAll : null, spend: spendAll, review: rows.filter(r => r.review).length };
    const keys = GRADES.concat(['none']);
    const mix = ['kol', 'affiliate'].map(t => { const l = rows.filter(r => r.type === t);
      return { type: t, total: l.length, spend: sumOf(l), by: Object.fromEntries(keys.map(g => { const m = l.filter(r => (r.grade || 'none') === g); return [g, { n: m.length, spend: sumOf(m) }]; })) }; });
    const tiers = R.tierOrder(rules).concat([R.UNKNOWN_TIER]).filter((t, i, a) => a.indexOf(t) === i);
    const tierGrid = tiers.map(t => { const l = rows.filter(r => r.tier === t); return { tier: t, total: l.length, by: Object.fromEntries(keys.map(g => { const m = l.filter(r => (r.grade || 'none') === g); return [g, { n: m.length, spend: sumOf(m) }]; })) }; })
      .filter(r => r.total);
    const ids = new Set(rows.map(r => r.kol.kol_id));
    const moves = (state.grade_history || []).filter(h => ids.has(h.kol_id) && String(h.at).slice(0, 10) >= f.from && String(h.at).slice(0, 10) <= f.to).map(h => Object.assign({ move: moveOf(h), kol: R.kolById(state, h.kol_id) }, h))
      .filter(h => h.move !== 'same').sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const movement = { up: moves.filter(m => m.move === 'up').length, down: moves.filter(m => m.move === 'down').length, fresh: moves.filter(m => m.move === 'new').length, list: moves };
    const byScore = (a, b) => ((b.rec && b.rec.score) || 0) - ((a.rec && a.rec.score) || 0) || b.spend - a.spend;
    const top = rows.filter(r => r.grade === 'A').sort(byScore), watch = rows.filter(r => r.grade === 'C' || r.grade === 'D').sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || b.spend - a.spend);
    return { rows, kpi, mix, tierGrid, movement, top, watch };
  }

  /* ===================== Dashboard › By campaign: clips beating the benchmark ===================== */
  /* the posted posts of a Campaign (Phase) with their numbers → { rows [{post, deal, kol, …postRatio}], measured, beating, pct, target } */
  function campaignBenchmark(state, campaignId, phaseId, today) {
    const bench = benchmarksOf(state, campaignId), rules = gradeRules(state.lookups), idx = R.phaseIndex(state), rows = [];
    (state.deals || []).forEach(d => {
      if (d.campaign_id !== campaignId || R.isCancelled(d)) return;
      const posts = R.postsOf(state, d.deal_id), kol = R.kolById(state, d.kol_id);
      posts.forEach(p => {
        if (!isISODate(p.post_date) || p.post_date > today) return;
        if (phaseId && ((idx.post.get(p.post_id) || {}).phase !== phaseId)) return;
        rows.push(Object.assign({ post: p, deal: d, kol }, postRatio(state, d, p, { rules, bench, posts, kol, idx })));
      });
    });
    const measured = rows.filter(r => r.ratio != null), beating = measured.filter(r => r.ratio > 1).length;
    return { rows: rows.sort((a, b) => (b.ratio == null) - (a.ratio == null) || (b.ratio || 0) - (a.ratio || 0)), measured: measured.length, beating, pct: measured.length ? beating / measured.length : null, target: bench.clips_target_pct, bench };
  }

  /* ===================== Import metrics (CSV · Deals › ⋯) ===================== */
  /* the columns (any order · the header names of the template, other spellings too) */
  const IMPORT_COLS = { link: ['post link', 'link', 'post url', 'url'], deal: ['deal id', 'deal'], account: ['account', 'username', 'handle'], campaign: ['campaign'],
    day: ['day', 'checkpoint'], date: ['date', 'captured', 'captured on'], reach: ['reach'], impressions: ['impressions'], views: ['views', 'video views'], likes: ['likes'], comments: ['comments'],
    shares: ['shares'], saves: ['saves'], clicks: ['clicks', 'link clicks'], sales: ['sales', 'sales ฿', 'sales (฿)', 'revenue'], roas: ['roas'] };
  const IMPORT_NUM = ['reach', 'impressions', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'sales', 'roas'];
  const norm = v => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  /* rows = [[cells]] with the header first → { lines [{line, status: matched | nochange | manual | notfound | ambiguous | error | notyours, post, deal, values, reason}], counts } ·
     o = { user, replaceManual } — a post whose numbers were typed by hand (Manual) is left as it is unless replaceManual */
  function planMetricsImport(state, rows, o = {}) {
    const P = C.grade.imp, head = (rows[0] || []).map(norm), col = {};
    Object.entries(IMPORT_COLS).forEach(([k, names]) => { const i = head.findIndex(h => names.includes(h)); if (i >= 0) col[k] = i; });
    const lines = [], counts = { matched: 0, nochange: 0, manual: 0, notfound: 0, ambiguous: 0, error: 0, notyours: 0 };
    if (col.link == null && col.deal == null && col.account == null) return { lines, counts, error: P.noKeyCol };
    const byLink = new Map(); (state.deal_posts || []).forEach(p => { const k = R.normalizePostLink(p.post_link); if (k && !byLink.has(k)) byLink.set(k, p); });
    const deals = new Map((state.deals || []).map(d => [d.deal_id, d])), seen = new Set();
    rows.slice(1).forEach((cells, i) => {
      const get = k => (col[k] == null ? '' : trim(String(cells[col[k]] == null ? '' : cells[col[k]])));
      if (!cells.some(c => trim(String(c == null ? '' : c)))) return;
      const x = { line: i + 2, link: get('link'), dealId: get('deal'), values: {}, bad: [] };
      IMPORT_NUM.forEach(k => { const v = get(k); if (v === '') return;
        if (k === 'sales' || k === 'roas') { const n = num(v.replace(/[,฿\s]/g, '')); if (n == null || n < 0) x.bad.push(k); else x.values[k] = n; }
        else { const p = R.parseCount(v); if (p.error) x.bad.push(k); else x.values[k] = p.value; } });
      const day = get('day'); x.day = /30/.test(day) ? 30 : 7;
      const dt = get('date'), dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dt); x.date = isISODate(dt) ? dt : dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
      let post = null, why = null;
      if (x.bad.length) why = ['error', P.badNumber(x.bad.map(k => C.grade.metric[k] || k).join(', '))];
      else if (!Object.keys(x.values).length) why = ['error', P.noNumbers];
      else if (x.link) { post = byLink.get(R.normalizePostLink(x.link)) || null; if (!post) why = ['notfound', P.linkNotFound]; }
      else {
        let d = x.dealId ? deals.get(x.dealId.toUpperCase()) : null;
        if (!d && !x.dealId && get('account')) {
          const h = get('account').replace(/^@/, '').toLowerCase(), cq = norm(get('campaign'));
          const acc = (state.kol_accounts || []).filter(a => String(a.handle || '').toLowerCase() === h).map(a => a.account_id);
          const hits = (state.deals || []).filter(dd => !R.isCancelled(dd) && R.postsOf(state, dd.deal_id).some(p => acc.includes(p.account_id)) &&
            (!cq || norm(R.campaignName(state, dd.campaign_id)) === cq || norm(dd.campaign_id) === cq));
          if (hits.length === 1) d = hits[0]; else if (hits.length > 1) why = ['ambiguous', P.manyDeals(hits.length)];
        }
        if (!d && !why) why = ['notfound', x.dealId ? P.dealNotFound : P.accountNotFound];
        if (d && !why) {
          const posted = R.postsOf(state, d.deal_id).filter(p => R.isPosted(p, o.today || R.todayISO())).sort((a, b) => String(a.post_date || '').localeCompare(String(b.post_date || '')));
          const salesOnly = Object.keys(x.values).every(k => k === 'sales' || k === 'roas');
          if (posted.length === 1 || (salesOnly && posted.length)) post = posted[0];
          else why = posted.length ? ['ambiguous', P.dealHasPosts(posted.length)] : ['notfound', P.notPosted];
        }
      }
      if (!why && post) {
        const deal = deals.get(post.deal_id);
        if (seen.has(post.post_id)) why = ['ambiguous', P.twice];
        else if (o.user && !R.canEditMetrics(o.user, deal)) why = ['notyours', P.notYours];
        else {
          seen.add(post.post_id);
          const from = R.metricsOf(post), to = Object.assign({}, from, x.values), changed = Object.keys(x.values).filter(k => from[k] !== to[k]);
          if (!changed.length) why = ['nochange', P.noChange];
          else if (post.metrics_source === 'manual' && R.hasMetrics(post) && !o.replaceManual) why = ['manual', P.manual];
          Object.assign(x, { post, deal, from, to, changed });
        }
      }
      x.status = why ? why[0] : 'matched'; x.reason = why ? why[1] : null;
      counts[x.status]++; lines.push(x);
    });
    return { lines, counts };
  }
  const IMPORT_TEMPLATE = ['Post link', 'Deal ID', 'Account', 'Campaign', 'Day', 'Date', 'Reach', 'Impressions', 'Views', 'Likes', 'Comments', 'Shares', 'Saves', 'Clicks', 'Sales', 'ROAS'];

  /* ===================== schema 25 (CR-34 §4 — once) ===================== */
  /* metrics already there → Manual (the old file's numbers keep their "imported" status: metrics_legacy) · the new numbers null · deal_incidents ·
     partner_grades · grade_history · lookups.grade_rules (defaults) · no benchmark · the first suggestion of every partner (none confirmed → the ones
     with enough data wait for review) */
  function migrateV25(obj, nowIso, today) {
    (obj.deal_posts || []).forEach(p => {
      if (p.metrics_source === 'legacy') p.metrics_legacy = true;
      if (R.hasMetrics(p) || p.metrics_source) p.metrics_source = 'manual';
      if (p.metrics_source === 'paste') p.metrics_source = 'manual';
      ['reach', 'impressions', 'clicks', 'sales', 'roas', 'metrics_day', 'fetch_status', 'fetched_at'].forEach(k => { if (p[k] === undefined) p[k] = null; });
      if (p.metrics_day == null && R.hasMetrics(p)) p.metrics_day = 7;
    });
    (obj.campaigns || []).forEach(c => { if (c.benchmarks === undefined) c.benchmarks = null; });
    if (!Array.isArray(obj.deal_incidents)) obj.deal_incidents = [];
    if (!Array.isArray(obj.partner_grades)) obj.partner_grades = [];
    if (!Array.isArray(obj.grade_history)) obj.grade_history = [];
    obj.lookups = obj.lookups || {};
    if (!obj.lookups.grade_rules) obj.lookups.grade_rules = JSON.parse(JSON.stringify(GRADE_RULES_DEFAULT));
    obj.schema_version = Math.max(obj.schema_version || 0, 25);
    try { syncGrades(obj, today || String(nowIso || '').slice(0, 10) || R.todayISO(), nowIso); } catch (e) { /* the first sync on load does it */ }
    return obj;
  }

  return { GRADES, CONS_ACTIONS, INCIDENT_TYPES, SERIOUS_INCIDENTS: SERIOUS, BENCH_KEYS, GRADE_RULES_DEFAULT, gradeRules, validateGradeRules, validateBenchmarks, benchRecord, cpconsFrom, benchmarksOf,
    consActions, pillarFor, postRatio, opsOfDeal, incidentsOfDeal, incidentsOfKol, isSerious, validateIncident, newIncident, removeIncident, gradeIndex, gradeEngine, reasonParts,
    gradeOf, confirmedGrade, isLocked, needsReview, syncGrades, reviewQueue, canReview, confirmGrade, overrideGrade, historyOf, moveOf, partnersData, campaignBenchmark,
    IMPORT_COLS, IMPORT_TEMPLATE, planMetricsImport, migrateV25 };
})(KT.rules, KT.content));
