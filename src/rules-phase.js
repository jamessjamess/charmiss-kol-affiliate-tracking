/* rules-phase.js — CR-03: the Phase of each post comes from its date, money is split per post,
   Phase / Campaign totals, overlapping Phases, Campaign budget. Adds to KT.rules (load after rules.js, before rules-deal.js).
   No DOM, no storage.

   resolvePostPhase(post, phasesOfCampaign) — date = post_date, else the post's expected_post_date:
     auto     the date is in exactly one Phase            → that Phase (phase_override is not used)
     none     no date                                     → phase_override, else Unscheduled
     outside  a date that is in no Phase                  → phase_override, else Needs phase
     overlap  a date in more than one Phase               → phase_override if it is one of them, else Needs phase
   postShare = deal total ÷ the deal's posts · Phase committed = shares of posts in the Phase (deal not Cancel)
   Campaign committed = totals of its deals (not Cancel) = every Phase + Unscheduled + Needs phase
   Shortlist (James, 05/10/2026): a deal before Confirm QT (Shortlist, Contacted) is not committed yet — its money is
   counted apart as "Shortlist" everywhere Committed is shown; budget usage uses Committed only
   Primary phase of a deal = Phase of its earliest post (undated last) — only used to group the Deals table */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim, isISODate, totalCost, paidEstimate, isCancelled, baht, addDays, dayDiff } = R;
  const issue = (field, msg, kind) => (kind ? { field, msg, kind } : { field, msg });
  const UNSCHEDULED = '__unscheduled', NEEDS = '__needs';
  const round2 = n => Math.round(n * 100) / 100;

  const postDateOf = p => (p && (p.post_date || p.expected_post_date)) || null;
  /* CR-06 §4.2 — a Phase is named by its place, never typed: "Phase {seq}" + " · {label}" when it has one ·
     seq = order by start date within its Campaign (same start → end date, then the order the Phases were made) */
  const phaseTitle = (seq, label) => C.campaign.phaseTitle(seq, trim(label));
  /* seq of every row (rows without dates go last, in their order) — Phases of one Campaign, or the rows of a plan */
  function planSeqs(rows) {
    const key = (r, k) => String(r[k] || '9999');
    const order = rows.map((r, i) => i).sort((a, b) => key(rows[a], 'start_date').localeCompare(key(rows[b], 'start_date')) || key(rows[a], 'end_date').localeCompare(key(rows[b], 'end_date')) || a - b);
    const out = []; order.forEach((i, k) => { out[i] = k + 1; }); return out;
  }
  function phaseSeq(phases, p) { const sib = phases.filter(x => x.campaign_id === p.campaign_id); return planSeqs(sib)[sib.indexOf(p)] || 0; }
  const phaseTitleOf = (phases, p) => phaseTitle(phaseSeq(phases, p), p.label);
  /* migration v6: the old phase_name → label · "Phase n · x" → x · "Phase n" → none · anything else is kept whole */
  function labelFromName(name) {
    const n = trim(name); if (!n) return null;
    const m = /^phase\s*\d+\s*·\s*(.+)$/i.exec(n); if (m) return trim(m[1]) || null;
    return /^phase\s*\d+$/i.test(n) ? null : n;
  }
  /* CR-05 §4.3 — the screen shows names, never IDs · a Phase name used by more than one Campaign gets "<Campaign> › <Phase>"
     where the Campaign is not already clear (inContext = the Campaign is shown nearby) */
  const phaseName = (state, id) => { if (id === UNSCHEDULED) return C.deal.unscheduled; if (id === NEEDS) return C.deal.needsPhase; const p = state.phases.find(x => x.phase_id === id); return p ? phaseTitleOf(state.phases, p) : id || ''; };
  function phaseLabel(state, id, inContext) {
    const p = state.phases.find(x => x.phase_id === id); if (!p) return phaseName(state, id);
    const name = phaseTitleOf(state.phases, p);
    if (inContext) return name;
    const shared = state.phases.some(x => x.phase_id !== id && x.campaign_id !== p.campaign_id && phaseTitleOf(state.phases, x).toLowerCase() === name.toLowerCase());
    return shared ? `${(state.campaigns.find(c => c.campaign_id === p.campaign_id) || {}).campaign_name || ''} › ${name}` : name;
  }
  const campaignName = (state, id) => ((state.campaigns.find(c => c.campaign_id === id) || {}).campaign_name) || '';
  /* List steps before Confirm QT */
  function isShortlist(lookups, d) {
    if (!d || d.status !== 'List') return false;
    const qt = R.stepOf(lookups, 'Confirm QT'), cur = R.stepOf(lookups, d.sub_status);
    return !qt || !cur || cur.sort_order < qt.sort_order;
  }
  /* CR-17 §4.5 — the Phases that count (approved): posts resolve into them, budgets add up, pickers list them · a Phase waiting for approval is left out */
  const phasesOfCampaign = (state, campaignId) => state.phases.filter(p => p.campaign_id === campaignId && R.isApproved(p));
  const campaignOf = (state, campaignId) => state.campaigns.find(c => c.campaign_id === campaignId) || null;
  const inRange = (p, d) => !!p.start_date && !!p.end_date && p.start_date <= d && d <= p.end_date;

  /* → {kind, candidates, phase (effective, or null), slot: 'phase' | 'unscheduled' | 'needs', override, overrideUnused} */
  function resolvePostPhase(post, phases) {
    const d = postDateOf(post), ov = post.phase_override || null, valid = id => !!id && phases.some(p => p.phase_id === id);
    let r;
    if (!d) r = { kind: 'none', candidates: [], phase: valid(ov) ? ov : null };
    else {
      const hit = phases.filter(p => inRange(p, d)).map(p => p.phase_id);
      if (hit.length === 1) r = { kind: 'auto', candidates: hit, phase: hit[0] };
      else if (!hit.length) r = { kind: 'outside', candidates: [], phase: valid(ov) ? ov : null };
      else r = { kind: 'overlap', candidates: hit, phase: ov && hit.includes(ov) ? ov : null };
    }
    r.slot = r.phase ? 'phase' : r.kind === 'none' ? 'unscheduled' : 'needs';
    r.override = ov;
    /* an override is shown faded when the date now decides (auto) or it is not one of the overlapping Phases */
    r.overrideUnused = !!ov && (r.kind === 'auto' || (r.kind === 'overlap' && !r.candidates.includes(ov)));
    return r;
  }
  /* the override is only offered when the date cannot decide */
  const canPickPhase = r => r.kind !== 'auto';
  const pickablePhases = (r, phases) => (r.kind === 'overlap' ? phases.filter(p => r.candidates.includes(p.phase_id)) : phases);
  const postShare = (deal, posts) => (posts.length ? totalCost(deal) / posts.length : 0);
  const byPostDate = (a, b) => { const x = postDateOf(a), y = postDateOf(b); if (x !== y) { if (!x) return 1; if (!y) return -1; return x < y ? -1 : 1; } return String(a.post_id).localeCompare(String(b.post_id)); };

  /* one pass over deals + posts:
     post:     post_id → resolvePostPhase result + share
     deal:     deal_id → {primary, keys (Phases + __unscheduled / __needs it touches), share Map, paid Map, needsPosts}
     phase:    phase_id → {committed, paid, posts, dealIds, primaryDeals}
     campaign: campaign_id → {committed, paid, unscheduled, needs, needsPosts, unscheduledPosts} */
  function phaseIndex(state) {
    const phasesBy = new Map(), postsBy = new Map();
    state.phases.forEach(p => { if (!R.isApproved(p)) return; if (!phasesBy.has(p.campaign_id)) phasesBy.set(p.campaign_id, []); phasesBy.get(p.campaign_id).push(p); });   // CR-17: resolvePostPhase skips a pending Phase
    state.deal_posts.forEach(p => { if (!postsBy.has(p.deal_id)) postsBy.set(p.deal_id, []); postsBy.get(p.deal_id).push(p); });
    const blankPhase = () => ({ committed: 0, shortlist: 0, paid: 0, posts: 0, dealIds: new Set(), primaryDeals: new Set() });
    const blankCamp = () => ({ committed: 0, shortlist: 0, paid: 0, unscheduled: 0, needs: 0, needsPosts: 0, unscheduledPosts: 0 });
    const post = new Map(), deal = new Map(), phase = new Map(state.phases.map(p => [p.phase_id, blankPhase()])), campaign = new Map(state.campaigns.map(c => [c.campaign_id, blankCamp()]));
    state.deals.forEach(d => {
      const phs = phasesBy.get(d.campaign_id) || [], ps = (postsBy.get(d.deal_id) || []).slice().sort(byPostDate);
      const active = !isCancelled(d), sl = active && isShortlist(state.lookups, d), counted = active && !sl;
      const total = totalCost(d), paid = paidEstimate(d), n = ps.length;
      if (!campaign.has(d.campaign_id)) campaign.set(d.campaign_id, blankCamp());
      const c = campaign.get(d.campaign_id);
      /* share = committed money per key · slShare = shortlist money per key */
      const info = { primary: UNSCHEDULED, keys: new Set(), share: new Map(), slShare: new Map(), paid: new Map(), needsPosts: 0, shortlist: sl };
      const bump = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
      const add = (key, share, pshare) => { info.keys.add(key); bump(info.share, key, counted ? share : 0); bump(info.slShare, key, sl ? share : 0); bump(info.paid, key, pshare); };
      if (counted) c.committed += total;
      if (sl) c.shortlist += total;
      c.paid += paid;
      if (!n) { add(UNSCHEDULED, total, paid); if (counted) c.unscheduled += total; }
      ps.forEach(p => {
        const r = resolvePostPhase(p, phs), share = total / n, pshare = paid / n;
        r.share = share; post.set(p.post_id, r);
        const key = r.phase || (r.slot === 'unscheduled' ? UNSCHEDULED : NEEDS);
        add(key, share, pshare);
        if (r.phase) {
          const ph = phase.get(r.phase) || (phase.set(r.phase, blankPhase()), phase.get(r.phase));
          ph.posts++; ph.dealIds.add(d.deal_id); if (counted) ph.committed += share; if (sl) ph.shortlist += share; ph.paid += pshare;
        } else if (r.slot === 'unscheduled') { if (counted) c.unscheduled += share; if (active) c.unscheduledPosts++; }
        else if (active) { if (counted) c.needs += share; c.needsPosts++; info.needsPosts++; }
      });
      if (n) { const r = post.get(ps[0].post_id); info.primary = r.phase || (r.slot === 'unscheduled' ? UNSCHEDULED : NEEDS); }
      if (phase.has(info.primary)) phase.get(info.primary).primaryDeals.add(d.deal_id);
      deal.set(d.deal_id, info);
    });
    return { post, deal, phase, campaign };
  }
  const primaryPhase = (idx, dealId) => ((idx.deal.get(dealId) || {}).primary) || UNSCHEDULED;

  /* ---------- scopes (Deals strip, Overview): {campaignId|null, phaseIds|null} · phaseIds null = whole Campaign(s) ---------- */
  const toScope = x => (Array.isArray(x) ? { campaignId: null, phaseIds: x } : Object.assign({ campaignId: null, phaseIds: null }, x || {}));
  /* deals of the Campaign · with Phases: deals with at least one post in them (the special keys __needs / __unscheduled work too) */
  function scopeDeals(state, scopeIn, idx) {
    const sc = toScope(scopeIn), set = sc.phaseIds ? new Set(sc.phaseIds) : null;
    return state.deals.filter(d => (!sc.campaignId || d.campaign_id === sc.campaignId) && (!set || [...(idx.deal.get(d.deal_id) || { keys: [] }).keys].some(k => set.has(k))));
  }
  /* posts of those deals · with Phases: only the posts whose Phase is in the set */
  function scopePosts(state, scopeIn, idx) {
    const sc = toScope(scopeIn), set = sc.phaseIds ? new Set(sc.phaseIds) : null;
    const deals = new Set(scopeDeals(state, sc, idx).map(d => d.deal_id));
    return state.deal_posts.filter(p => { if (!deals.has(p.deal_id)) return false; if (!set) return true; const r = idx.post.get(p.post_id); return !!r && set.has(r.phase || (r.slot === 'unscheduled' ? UNSCHEDULED : NEEDS)); });
  }
  /* committed / shortlist / paid of some deals inside a scope: whole Campaign = deal totals · Phases = the shares in those Phases */
  function scopeMoney(deals, scopeIn, idx) {
    const sc = toScope(scopeIn);
    let committed = 0, shortlist = 0, paid = 0;
    deals.forEach(d => {
      const info = idx.deal.get(d.deal_id); if (!info) return;
      const keys = sc.phaseIds || [...info.keys];
      keys.forEach(k => { committed += info.share.get(k) || 0; shortlist += info.slShare.get(k) || 0; paid += info.paid.get(k) || 0; });
    });
    return { committed: round2(committed), shortlist: round2(shortlist), paid: round2(paid) };
  }
  /* budget of a scope: whole = Campaign budgets · Phases = Phase budgets (null when none is set) */
  function scopeBudget(state, scopeIn) {
    const sc = toScope(scopeIn), num = list => { const v = list.filter(x => !isBlank(x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    if (!sc.phaseIds) return num(state.campaigns.filter(c => !sc.campaignId || c.campaign_id === sc.campaignId).map(c => c.budget_kol));
    const set = new Set(sc.phaseIds);
    return num(state.phases.filter(p => set.has(p.phase_id) && R.isApproved(p)).map(p => p.budget_kol));
  }

  /* ---------- Phase / Campaign summaries ---------- */
  function phaseSummary(state, phaseId, idxIn) {
    const idx = idxIn || phaseIndex(state), p = state.phases.find(x => x.phase_id === phaseId) || {}, ph = idx.phase.get(phaseId);
    const deals = ph ? state.deals.filter(d => ph.primaryDeals.has(d.deal_id)) : [];
    const counts = { List: 0, Inprocess: 0, Complete: 0, Cancel: 0 };
    deals.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
    const committed = ph ? round2(ph.committed) : 0, budget = isBlank(p.budget_kol) ? null : Number(p.budget_kol);
    return {
      budget, committed, shortlist: ph ? round2(ph.shortlist) : 0, paid: ph ? round2(ph.paid) : 0,
      remaining: budget == null ? null : budget - committed, over: budget != null && committed > budget,
      counts, dealCount: deals.length, activeCount: deals.length - counts.Cancel, posts: ph ? ph.posts : 0, dealsWithPosts: ph ? ph.dealIds.size : 0,
    };
  }
  const phaseCommitted = (state, phaseId, idx) => phaseSummary(state, phaseId, idx).committed;
  function campaignSummary(state, campaignId, idxIn) {
    const idx = idxIn || phaseIndex(state), c = campaignOf(state, campaignId) || {}, x = idx.campaign.get(campaignId) || {};
    /* CR-17 — a Campaign that waits shows its own Phases (they wait with it): its period and what is allocated; an approved one counts approved Phases only */
    const phases = R.isApproved(c) ? phasesOfCampaign(state, campaignId) : R.sortPhases(state.phases.filter(p => p.campaign_id === campaignId)), deals = state.deals.filter(d => d.campaign_id === campaignId);
    const allocatedList = phases.filter(p => !isBlank(p.budget_kol)).map(p => Number(p.budget_kol));
    return {
      phaseCount: phases.length,
      start: phases.map(p => p.start_date).filter(Boolean).sort()[0] || null,
      end: phases.map(p => p.end_date).filter(Boolean).sort().pop() || null,
      budget: isBlank(c.budget_kol) ? null : Number(c.budget_kol),
      allocated: allocatedList.length ? allocatedList.reduce((a, b) => a + b, 0) : null,
      committed: round2(x.committed || 0), shortlist: round2(x.shortlist || 0), paid: round2(x.paid || 0),
      unscheduled: round2(x.unscheduled || 0), needs: round2(x.needs || 0), needsPosts: x.needsPosts || 0,
      activeDeals: deals.filter(d => !isCancelled(d)).length, dealCount: deals.length,
    };
  }
  const campaignRange = (state, campaignId) => { const s = campaignSummary(state, campaignId); return [s.start, s.end]; };
  /* a Phase cannot be deleted while a post uses it — by date or by phase_override (CR-03 §4.3) */
  function canDeletePhase(state, phaseId, idxIn) {
    const idx = idxIn || phaseIndex(state), ph = idx.phase.get(phaseId);
    return !(ph && ph.posts) && !state.deal_posts.some(p => p.phase_override === phaseId);
  }

  /* ---------- overlapping Phases (allowed, with a warning) ---------- */
  function phaseOverlaps(phases) {
    const out = [], ok = phases.filter(p => isISODate(p.start_date) && isISODate(p.end_date) && p.start_date <= p.end_date);
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
      const a = ok[i], b = ok[j], from = a.start_date > b.start_date ? a.start_date : b.start_date, to = a.end_date < b.end_date ? a.end_date : b.end_date;
      if (from <= to) out.push({ a: a.phase_id, b: b.phase_id, from, to });
    }
    return out;
  }
  const dmShort = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  function validatePhase(state, draft) {
    const errs = [], warns = [], infos = [];
    if (!draft.campaign_id) errs.push(issue('campaign_id', M.phaseCampaignRequired));
    else if (!state.campaigns.some(c => c.campaign_id === draft.campaign_id)) errs.push(issue('campaign_id', M.phaseCampaignMissing));
    let datesOk = false;
    if (isBlank(draft.start_date) || isBlank(draft.end_date)) {
      if (isBlank(draft.start_date)) errs.push(issue('start_date', M.phaseDatesRequired));
      if (isBlank(draft.end_date)) errs.push(issue('end_date', M.phaseDatesRequired));
    } else if (!isISODate(draft.start_date) || !isISODate(draft.end_date)) {
      errs.push(issue(isISODate(draft.start_date) ? 'end_date' : 'start_date', M.phaseDateInvalid));
    } else if (draft.end_date < draft.start_date) errs.push(issue('end_date', M.phaseEndBeforeStart));
    else datesOk = true;
    const budgetBlank = isBlank(draft.budget_kol);
    if (!budgetBlank && (isNaN(draft.budget_kol) || Number(draft.budget_kol) < 0)) errs.push(issue('budget_kol', M.phaseBudgetInvalid));
    if (budgetBlank) warns.push(issue('budget_kol', M.phaseNoBudget));
    if (datesOk && draft.campaign_id) {
      /* the Campaign as it would be after saving */
      const id = draft.phase_id || '__draft', me = { phase_id: id, campaign_id: draft.campaign_id, start_date: draft.start_date, end_date: draft.end_date, budget_kol: draft.budget_kol };
      const others = state.phases.filter(p => p.phase_id !== draft.phase_id);
      const label = pid => (pid === '__draft' ? C.campaign.thisPhase : phaseName(state, pid));
      phaseOverlaps([me].concat(others.filter(p => p.campaign_id === draft.campaign_id))).filter(o => o.a === id || o.b === id)
        .forEach(o => warns.push(issue('end_date', M.phaseOverlap(label(o.a), label(o.b), dmShort(o.from), dmShort(o.to)))));
      const now = phaseIndex(state), after = phaseIndex(Object.assign({}, state, { phases: others.concat([me]) }));
      const more = ((after.campaign.get(draft.campaign_id) || {}).needsPosts || 0) - ((now.campaign.get(draft.campaign_id) || {}).needsPosts || 0);
      if (more > 0) warns.push(issue('end_date', M.phaseCreatesNeeds(more)));
      const committed = round2((after.phase.get(id) || { committed: 0 }).committed);
      if (!budgetBlank && !isNaN(draft.budget_kol) && Number(draft.budget_kol) < committed)
        warns.push(issue('budget_kol', M.phaseBudgetBelowCommitted(baht(draft.budget_kol), baht(committed))));
    }
    return { errs, warns, infos };
  }

  /* ---------- CR-05 §4.4 Phase Planner: a Campaign and all its Phases checked together ---------- */
  /* rows: [{key, phase_id|null, label, start_date, end_date, budget_kol}] (budget_kol = ฿ or '') · campaign: {campaign_id|null, campaign_name, budget_kol} */
  const numOrNull = v => (isBlank(v) || isNaN(v) ? null : Number(v));
  function planTotals(campaign, rows) {
    const budget = numOrNull(campaign.budget_kol), allocated = rows.reduce((a, r) => a + (numOrNull(r.budget_kol) || 0), 0);
    return { budget, allocated, diff: budget == null ? null : budget - allocated, pct: budget ? allocated / budget * 100 : null };
  }
  /* Split evenly: n shares of 100% (two decimals, the last one takes the rounding) */
  function splitEvenly(n) {
    if (!n) return [];
    const base = Math.floor(10000 / n) / 100, out = Array(n).fill(base);
    out[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;
    return out;
  }
  /* ---------- CR-06 §4.2: Number of phases · Split dates evenly · allocation presets ---------- */
  const MAX_PHASES = 12;
  /* 1–12 whole phases → null, else the error */
  function checkPhaseCount(v) { const n = Number(v); return isBlank(v) || !Number.isInteger(n) || n < 1 || n > MAX_PHASES ? issue('count', M.planCountRange(MAX_PHASES)) : null; }
  /* the period cut into n back-to-back parts (no overlap, no gap) · the last part takes the days left over · null when it cannot */
  function splitDates(from, to, n) {
    if (!isISODate(from) || !isISODate(to) || to < from || !(n >= 1)) return null;
    const days = dayDiff(to, from) + 1; if (days < n) return null;
    const base = Math.floor(days / n), out = [];
    let start = from;
    for (let i = 0; i < n; i++) { const end = i === n - 1 ? to : addDays(start, base - 1); out.push({ start_date: start, end_date: end }); start = addDays(end, 1); }
    return out;
  }
  /* ฿ split into n whole amounts, the last one takes what is left (฿100,000 / 3 → 33,333 · 33,333 · 33,334) */
  const evenAmounts = (budget, n) => { const b = Math.round(Number(budget)), base = Math.floor(b / n); return Array.from({ length: n }, (_, i) => (i === n - 1 ? b - base * (n - 1) : base)); };
  /* presets: even (any n) · launch = Launch-heavy 20 / 65 / 15 (3 phases only) → {pcts, amounts (null without a budget)} or null */
  const PRESETS = ['even', 'launch', 'custom'];
  function presetSplit(key, n, budget) {
    const pcts = key === 'even' ? splitEvenly(n) : key === 'launch' && n === 3 ? [20, 65, 15] : null;
    if (!pcts) return null;
    const b = numOrNull(budget);
    if (b == null) return { pcts, amounts: null };
    const amounts = key === 'even' ? evenAmounts(b, n) : pcts.map(p => Math.round(p / 100 * b));
    amounts[n - 1] += Math.round(b) - amounts.reduce((a, x) => a + x, 0);
    return { pcts, amounts };
  }
  /* rows (in Phase order) → n rows: more = n − rows blank rows at the end · fewer = the last rows go, never one whose Phase has posts
     hasPosts(row) → true when it cannot go · → {remove: rows that go, add: count, err} */
  function resizePlan(rows, n, hasPosts) {
    const bad = checkPhaseCount(n); if (bad) return { remove: [], add: 0, err: bad };
    const seqs = planSeqs(rows), order = rows.map((r, i) => i).sort((a, b) => seqs[a] - seqs[b]);
    if (n >= rows.length) return { remove: [], add: n - rows.length, err: null };
    const gone = order.slice(n).map(i => rows[i]), stuck = gone.map(r => ({ r, i: rows.indexOf(r) })).find(x => hasPosts(x.r));
    if (stuck) return { remove: [], add: 0, err: issue('count', M.planRemoveHasPosts(phaseTitle(seqs[stuck.i], stuck.r.label))) };
    return { remove: gone, add: 0, err: null };
  }
  /* Fill remaining: the chosen row gets what the others leave of 100% (never below 0) */
  const fillRemaining = (pcts, i) => pcts.map((v, j) => (j === i ? Math.max(0, Math.round((100 - pcts.reduce((a, x, k) => a + (k === i ? 0 : Number(x) || 0), 0)) * 100) / 100) : v));
  const rowOk = r => isISODate(r.start_date) && isISODate(r.end_date) && r.start_date <= r.end_date;
  /* deletedIds: Phases taken out of the plan · opts.pctUsed: % typed while the Campaign has no budget */
  function validatePhasePlan(state, campaign, rows, deletedIds, opts = {}) {
    const errs = [], warns = [], infos = [];
    errs.push(...R.validateCampaign(state, { campaign_id: campaign.campaign_id || null, campaign_name: campaign.campaign_name }).errs);
    if (!isBlank(campaign.budget_kol) && (isNaN(campaign.budget_kol) || Number(campaign.budget_kol) < 0)) errs.push(issue('budget_kol', M.phaseBudgetInvalid));
    /* CR-19 §4.8 — a Campaign is created / sent for approval with a KOL budget above ฿0 */
    else if (opts.budgetRequired && (isBlank(campaign.budget_kol) || !(Number(campaign.budget_kol) > 0))) errs.push(issue('budget_kol', C.planner.budgetRequired));
    rows.forEach((r, i) => {
      if (isBlank(r.start_date) || isBlank(r.end_date)) {
        if (isBlank(r.start_date)) errs.push(issue(`row${i}_start`, M.phaseDatesRequired));
        if (isBlank(r.end_date)) errs.push(issue(`row${i}_end`, M.phaseDatesRequired));
      } else if (!isISODate(r.start_date) || !isISODate(r.end_date)) errs.push(issue(isISODate(r.start_date) ? `row${i}_end` : `row${i}_start`, M.phaseDateInvalid));
      else if (r.end_date < r.start_date) errs.push(issue(`row${i}_end`, M.phaseEndBeforeStart));
      if (!isBlank(r.budget_kol) && (isNaN(r.budget_kol) || Number(r.budget_kol) < 0)) errs.push(issue(`row${i}_budget`, M.phaseBudgetInvalid));
      if (!isBlank(r.budget_pct) && (isNaN(r.budget_pct) || Number(r.budget_pct) < 0)) errs.push(issue(`row${i}_budget`, M.phaseBudgetInvalid));
    });
    (deletedIds || []).forEach(id => { if (!canDeletePhase(state, id)) errs.push(issue('rows', M.planDeleteHasPosts(phaseName(state, id)))); });
    const t = planTotals(campaign, rows);
    /* CR-18 §4.2 — the Phase budgets against the Campaign budget: short or over = red (Save asks first, it does not block) · no budget = yellow */
    if (t.budget != null && rows.length && t.diff < 0) warns.push(Object.assign(issue('budget', C.planner.barOver(baht(-t.diff)), 'over'), { red: true }));
    if (t.budget != null && rows.length && t.diff > 0) warns.push(Object.assign(issue('budget', C.planner.barUnder(baht(t.diff), baht(t.allocated), baht(t.budget)), 'under'), { red: true }));
    if (t.budget == null && opts.pctUsed) warns.push(issue('budget_kol', M.planPctNoBudget));
    const seqs = planSeqs(rows), ok = rows.map((r, i) => Object.assign({}, r, { phase_id: 'row' + i })).filter(rowOk), nameOf = id => { const i = +id.slice(3); return phaseTitle(seqs[i], rows[i].label); };
    phaseOverlaps(ok).forEach(o => warns.push(issue('rows', M.phaseOverlap(nameOf(o.a), nameOf(o.b), dmShort(o.from), dmShort(o.to)))));
    /* gaps between Phases: posts dated there will need a Phase picked */
    let cover = null;
    ok.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).forEach(r => {
      if (cover && r.start_date > addDays(cover, 1)) infos.push(issue('rows', M.planGap(dmShort(addDays(cover, 1)), dmShort(addDays(r.start_date, -1)))));
      if (!cover || r.end_date > cover) cover = r.end_date;
    });
    return { errs, warns, infos };
  }
  /* what the plan does to the Campaign's posts: moved Phase · back to the Phase of their date · need a Phase now · committed per Phase before → after */
  function planImpact(state, campaignId, rows, deletedIds) {
    const before = phaseIndex(state), del = new Set(deletedIds || []);
    const seqs = planSeqs(rows), planned = rows.map((r, i) => ({ r, i })).filter(x => rowOk(x.r)).map(({ r, i }) => ({ phase_id: r.phase_id || 'new:' + r.key, campaign_id: campaignId, label: trim(r.label) || null, name: phaseTitle(seqs[i], r.label), start_date: r.start_date, end_date: r.end_date, budget_kol: numOrNull(r.budget_kol) }));
    const after = phaseIndex(Object.assign({}, state, { phases: state.phases.filter(p => p.campaign_id !== campaignId).concat(planned), deal_posts: state.deal_posts.map(p => (del.has(p.phase_override) ? Object.assign({}, p, { phase_override: null }) : p)) }));
    const ids = new Set(state.deals.filter(d => d.campaign_id === campaignId).map(d => d.deal_id));
    const keyOf = r => (!r ? null : r.phase || r.slot);
    let moved = 0, toAuto = 0, needs = 0;
    state.deal_posts.filter(p => ids.has(p.deal_id)).forEach(p => {
      const b = before.post.get(p.post_id), a = after.post.get(p.post_id); if (!b || !a) return;
      if (keyOf(b) !== keyOf(a)) moved++;
      if (b.kind !== 'auto' && a.kind === 'auto') toAuto++;
      if (a.slot === 'needs' && b.slot !== 'needs') needs++;
    });
    const money = (idx, id) => Math.round(((idx.phase.get(id) || {}).committed || 0) * 100) / 100;
    const list = planned.map(p => ({ key: p.phase_id, name: p.name, before: money(before, p.phase_id), after: money(after, p.phase_id) }))
      .concat(state.phases.filter(p => p.campaign_id === campaignId && del.has(p.phase_id)).map(p => ({ key: p.phase_id, name: phaseName(state, p.phase_id), before: money(before, p.phase_id), after: 0 })));
    const tot = (idx) => { const c = idx.campaign.get(campaignId) || {}; return Math.round(((c.committed || 0) + (c.shortlist || 0)) * 100) / 100; };
    /* CR-06 §4.2: a Phase that gets another number ("Phase 2 will become Phase 3") */
    const renumber = rows.map((r, i) => ({ r, i })).filter(x => x.r.phase_id && state.phases.some(p => p.phase_id === x.r.phase_id))
      .map(({ r, i }) => ({ from: phaseName(state, r.phase_id), to: phaseTitle(seqs[i], r.label), was: phaseSeq(state.phases, state.phases.find(p => p.phase_id === r.phase_id)), now: seqs[i] }))
      .filter(x => x.was !== x.now).sort((a, b) => a.was - b.was);
    return { moved, toAuto, needs, rows: list, totalBefore: tot(before), totalAfter: tot(after), renumber };
  }

  /* ---------- Campaign budget split (CR-03 §4.3) ---------- */
  const budgetFromPct = (pct, campaignBudget) => (isBlank(pct) || isBlank(campaignBudget) ? null : Math.round(Number(pct) / 100 * Number(campaignBudget)));
  const pctOfBudget = (amount, campaignBudget) => (isBlank(amount) || isBlank(campaignBudget) || !Number(campaignBudget) ? null : Number(amount) / Number(campaignBudget) * 100);
  /* Allocated (sum of Phase budgets) against the Campaign budget: 'unallocated' · 'over' · 'even' · null when there is no Campaign budget */
  function allocation(state, campaignId) {
    const s = campaignSummary(state, campaignId);
    if (s.budget == null) return { state: null, allocated: s.allocated, budget: null, diff: null };
    const allocated = s.allocated || 0, diff = s.budget - allocated;
    return { state: diff > 0 ? 'unallocated' : diff < 0 ? 'over' : 'even', allocated, budget: s.budget, diff };
  }
  /* a post date far from every Phase of the Campaign is usually a mistyped year (CR-03 §4.4) */
  function postFarOutside(post, phases, days = 60) {
    const d = postDateOf(post); if (!d) return false;
    const starts = phases.map(p => p.start_date).filter(Boolean).sort(), ends = phases.map(p => p.end_date).filter(Boolean).sort();
    if (!starts.length) return false;
    return dayDiff(starts[0], d) > days || dayDiff(d, ends[ends.length - 1]) > days;
  }

  return {
    UNSCHEDULED, NEEDS, postDateOf, phaseTitle, planSeqs, phaseSeq, phaseTitleOf, labelFromName, phaseName, phaseLabel, campaignName, isShortlist, phasesOfCampaign, campaignOf, resolvePostPhase, canPickPhase, pickablePhases, postShare, byPostDate,
    phaseIndex, primaryPhase, toScope, scopeDeals, scopePosts, scopeMoney, scopeBudget,
    phaseSummary, phaseCommitted, campaignSummary, campaignRange, canDeletePhase, phaseOverlaps, validatePhase,
    budgetFromPct, pctOfBudget, allocation, postFarOutside, planTotals, splitEvenly, fillRemaining, validatePhasePlan, planImpact,
    MAX_PHASES, checkPhaseCount, splitDates, evenAmounts, PRESETS, presetSplit, resizePlan,
  };
})(KT.rules, KT.content));
