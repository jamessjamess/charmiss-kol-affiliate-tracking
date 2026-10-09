/* rules-deal.js — pure rules for Deals, posts, payment, the Template table, Pipeline, Overview, data checks and Lists.
   Adds to KT.rules (load after rules.js). No DOM, no storage. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim, num, isISODate, addDays, dayDiff, weekStart, normLink, tiktokDate, handleFromLink, platformFromLink, isHttpLink, totalCost } = R;
  const issue = (field, msg, kind) => (kind ? { field, msg, kind } : { field, msg });
  const OPEN = ['List', 'Inprocess'];
  const MONEY_KEYS = ['rate_card', 'gencode_expense', 'basket_fee', 'asset_fee', 'expediting_fee'];
  const METRIC_KEYS = ['views', 'likes', 'comments', 'saves', 'shares'];
  const DATE_KEYS = ['docs_done_date', 'paid_50_date', 'paid_full_date', 'gencode_start_date', 'delivery_date', 'brief_date',
    'expected_script_date', 'script_date', 'expected_draft1_date', 'approved_draft1_date', 'expected_draft2_date', 'approved_draft2_date', 'expected_draft3_date', 'approved_draft3_date',
    'expected_approve_date', 'approved_date', 'expected_post_date'];
  const POST_DATE_KEYS = ['expected_post_date', 'post_date', 'metrics_updated_at'];

  /* ===================== Lists (lookups) ===================== */
  /* simple lists may mark values inactive (still valid on old records, hidden for new picks) */
  const LIST_KEYS = ['pillar_list', 'cta_list', 'pic_list', 'platform_list'];
  const activeValues = (lookups, key) => { const off = new Set(((lookups.inactive_values || {})[key]) || []); return (lookups[key] || []).filter(v => !off.has(v)); };
  const isInactiveValue = (lookups, key, v) => (((lookups.inactive_values || {})[key]) || []).includes(v);
  function listValueUse(state, key, v) {
    if (key === 'pillar_list') return state.deals.filter(d => d.pillar === v).length;
    if (key === 'cta_list') return state.deals.filter(d => d.cta === v).length;
    if (key === 'pic_list') return state.deals.filter(d => d.pic === v).length + state.kol_master.filter(k => k.pic === v).length;
    if (key === 'platform_list') return state.kol_accounts.filter(a => a.platform === v).length;
    return 0;
  }
  function validateListValue(state, key, value) {
    const v = trim(value), errs = [];
    if (!v) errs.push(issue('value', M.listEmpty));
    else if ((state.lookups[key] || []).some(x => String(x).toLowerCase() === v.toLowerCase())) errs.push(issue('value', M.listDup(v)));
    return { errs, warns: [], infos: [] };
  }
  const stepUse = (state, sub) => state.deals.filter(d => d.sub_status === sub).length + state.deal_status_log.filter(l => l.sub_status === sub || l.from_sub_status === sub).length;
  const stepDealUse = (state, sub) => state.deals.filter(d => d.sub_status === sub).length;
  /* Post (Complete) and Cancel hold the journey together: they cannot be switched off or deleted */
  const stepLocked = step => step.status === 'Complete' || step.status === 'Cancel';
  /* CR-11 §4.13 #6 — the steps the stage rules name (Confirm QT: pillar / term / shipment · Brief · Draft 1 · Post: posts · Cancel): 🔒 in Settings ·
     the label can change, they cannot be deleted or turned off */
  const CORE_STEPS = ['Contacted', 'Confirm QT', 'Brief', 'Script', 'Draft 1', 'Approve', 'Post', 'Cancel'];   // CR-15 §4.5: + Script · Approve
  const isCoreStep = step => !!step && CORE_STEPS.includes(step.sub_status);
  function validateTiers(tiers) {
    const errs = [];
    if (!tiers.length) errs.push(issue('tier', M.tierNone));
    tiers.forEach((t, i) => {
      if (!trim(t.tier)) errs.push(issue(`tier${i}_tier`, M.tierName(i + 1)));
      if (isBlank(t.min_followers) || isNaN(t.min_followers) || Number(t.min_followers) < 0) errs.push(issue(`tier${i}_min`, M.tierMin(i + 1)));
    });
    const mins = tiers.map(t => Number(t.min_followers));
    if (tiers.length && !mins.includes(0)) errs.push(issue('tier', M.tierZero));
    if (new Set(mins).size !== mins.length) errs.push(issue('tier', M.tierDupMin));
    const names = tiers.map(t => trim(t.tier).toLowerCase());
    if (new Set(names).size !== names.length) errs.push(issue('tier', M.tierDupName));
    return { errs, warns: [], infos: [] };
  }

  /* ===================== shared lookups for many deals at once ===================== */
  function dealContext(state) {
    const postsByDeal = new Map(), linkIndex = new Map(), dealCountByCampaignKol = new Map(), committedByCampaign = new Map();
    state.deal_posts.forEach(p => {
      if (!postsByDeal.has(p.deal_id)) postsByDeal.set(p.deal_id, []);
      postsByDeal.get(p.deal_id).push(p);
      if (!isBlank(p.post_link)) { const k = normLink(p.post_link); if (!linkIndex.has(k)) linkIndex.set(k, []); linkIndex.get(k).push(p); }
    });
    state.deals.forEach(d => {
      const k = d.campaign_id + '|' + d.kol_id; dealCountByCampaignKol.set(k, (dealCountByCampaignKol.get(k) || 0) + 1);
      if (d.status !== 'Cancel' && !R.isShortlist(state.lookups, d)) committedByCampaign.set(d.campaign_id, (committedByCampaign.get(d.campaign_id) || 0) + totalCost(d));
    });
    const accountsByKol = new Map();
    state.kol_accounts.forEach(a => { if (!accountsByKol.has(a.kol_id)) accountsByKol.set(a.kol_id, []); accountsByKol.get(a.kol_id).push(a); });
    const rules = state.lookups.tier_rules || [], tiers = new Map(state.deals.map(d => [d.deal_id, dealTier(d, accountsByKol.get(d.kol_id) || [], postsByDeal.get(d.deal_id) || [], rules)]));
    return {
      postsByDeal, linkIndex, dealCountByCampaignKol, committedByCampaign, phaseIdx: R.phaseIndex(state), accountsByKol, tiers,
      deals: new Map(state.deals.map(d => [d.deal_id, d])),
      accounts: new Map(state.kol_accounts.map(a => [a.account_id, a])),
      kols: new Map(state.kol_master.map(k => [k.kol_id, k])),
      phases: new Map(state.phases.map(p => [p.phase_id, p])),
      campaigns: new Map(state.campaigns.map(c => [c.campaign_id, c])),
    };
  }
  const postsOfCtx = (ctx, dealId) => ctx.postsByDeal.get(dealId) || [];

  /* ===================== CR-04 §4.2 — deal tier ===================== */
  /* the account with the most followers among the accounts used in the deal's posts (the one hired);
     no posts yet → the KOL's account with the most followers · no followers anywhere → Unknown
     kolAccounts = the KOL's accounts · posts = the deal's posts → {tier, account, followers} */
  const UNKNOWN_TIER = 'Unknown';
  function dealTier(deal, kolAccounts, posts, tierRules) {
    const byId = new Map((kolAccounts || []).map(a => [a.account_id, a]));
    const used = (posts || []).map(p => byId.get(p.account_id)).filter(Boolean);
    const pool = (used.length ? used : (kolAccounts || [])).filter(a => Number(a.followers) > 0);
    const best = pool.reduce((m, a) => (!m || Number(a.followers) > Number(m.followers) ? a : m), null);
    if (!best) return { tier: UNKNOWN_TIER, account: null, followers: null };
    return { tier: R.tierOf(best.followers, tierRules) || UNKNOWN_TIER, account: best, followers: Number(best.followers) };
  }
  /* biggest tier first, Unknown last */
  const tierOrder = tierRules => [...(tierRules || [])].sort((a, b) => b.min_followers - a.min_followers).map(r => r.tier).concat([UNKNOWN_TIER]);
  /* followers range of a tier: [min, next tier's min) — null max for the top tier */
  function tierRange(tierRules, tier) {
    const list = [...(tierRules || [])].sort((a, b) => a.min_followers - b.min_followers), i = list.findIndex(r => r.tier === tier);
    if (i < 0) return null;
    return { min: list[i].min_followers, max: i + 1 < list.length ? list[i + 1].min_followers : null };
  }

  /* ===================== CR-04 §4.5 — what can be edited in the Deal drawer ===================== */
  /* the drawer's sections and their fields (Posts: every post's own fields) */
  const DEAL_SECTIONS = {
    header: ['campaign_id'],
    info: ['pic', 'pillar', 'cta', 'products', 'delivered', 'delivery_date', 'link_brief', 'script_link', 'remark', 'cancel_reason'],   // CR-20 §4.12: + Script link
    payment: ['payment_term', 'package_id', 'package_units', 'docs_done', 'docs_done_date', 'paid_50', 'paid_50_date', 'paid_full', 'paid_full_date'],   // CR-20 §4.8: + the package
    costs: ['rate_card', 'gencode_expense', 'gencode_period', 'gencode_start_date', 'basket_fee', 'asset_fee', 'expediting_fee'],
    timeline: ['brief_date', 'expected_script_date', 'script_date', 'expected_draft1_date', 'approved_draft1_date', 'expected_draft2_date', 'approved_draft2_date', 'expected_draft3_date', 'approved_draft3_date',
      'expected_approve_date', 'approved_date', 'expected_post_date'],
  };
  const POST_EDIT_FIELDS = ['account_id', 'expected_post_date', 'post_date', 'phase_override', 'post_link', 'gencode_code', 'views', 'likes', 'comments', 'saves', 'shares', 'metrics_updated_at'];
  const AUTO_FIELDS = ['total_cost', 'gencode_end_date', 'tier'];
  const SOURCE_FIELDS = ['legacy_job_ids', 'source_record_ids', 'created_at', 'updated_at'];
  const paymentRecorded = d => !!(d && (d.paid_50 || d.paid_full));
  /* fieldEditable(state, deal, field, user, post?) → {editable, reason, auto?, needsReason?} — reason = the lock tooltip */
  function fieldEditable(state, deal, field, user, post) {
    const LK = C.lock, L = state.lookups, lock = reason => ({ editable: false, reason });
    if (field === 'deal_id') return lock(LK.systemId);
    if (field === 'kol_id') return lock(LK.kol);
    if (AUTO_FIELDS.includes(field)) return { editable: false, auto: true, reason: LK.auto };
    if (SOURCE_FIELDS.includes(field)) return lock(LK.imported);
    if (field === 'status' || field === 'sub_status') return lock(LK.moveStage);
    if (!R.can(user, 'deal.edit')) return lock(LK.viewOnly);
    /* CR-05 §4.7: a cancelled Campaign keeps its deals as they are (Remark only) */
    if (R.campaignCancelled(state, deal.campaign_id) && field !== 'remark') return lock(LK.campaignCancelled);
    if (deal.status === 'Cancel' && field !== 'remark' && field !== 'cancel_reason') return lock(LK.cancelled);
    if (field === 'cancel_reason' && deal.status !== 'Cancel') return lock(LK.notCancelled);
    if (field === 'campaign_id') {
      if (!R.can(user, 'deal.campaign')) return lock(LK.campaignAdmin);
      const dated = R.postsOf(state, deal.deal_id).some(p => !isBlank(p.post_date) || !isBlank(p.expected_post_date));
      if (dated || R.pillarStepReached(L, deal.sub_status)) return lock(LK.campaignFixed);
      return { editable: true, reason: null };
    }
    if (field === 'payment_term' && deal.paid_full) return lock(LK.fullyPaid);
    /* CR-20 §4.8 — a Package deal's Rate card is the package's unit price × uses (choose another term for another price) */
    if (field === 'rate_card' && R.termOf(deal) === 'package') return { editable: false, auto: true, reason: C.move.fromPackage };
    if (DEAL_SECTIONS.costs.includes(field) && paymentRecorded(deal)) {
      if (!R.can(user, 'cost.override')) return lock(LK.paymentRecorded);
      return { editable: true, needsReason: true, reason: LK.paymentRecordedAdmin };
    }
    /* the date a step was done (Script · Draft n · Approve) is set by Move stage and can be corrected once the deal has reached it */
    if (/^(approved_draft\d_date|script_date|approved_date)$/.test(field)) {
      const st = R.stepsOf(L).find(x => x.date_field === field), cur = R.stepOf(L, deal.sub_status);
      if (!st || !cur || cur.sort_order < st.sort_order) return lock(LK.setByMove);
    }
    if (post && (field === 'account_id' || field === 'platform') && !isBlank(post.post_link)) return lock(LK.postHasLink);
    if (post && field === 'phase_override' && R.resolvePostPhase(post, R.phasesOfCampaign(state, deal.campaign_id)).kind === 'auto') return lock(LK.autoPhase);
    return { editable: true, reason: null };
  }
  /* a section shows ✎ when the person may edit deals and at least one of its fields is open */
  function sectionEditable(state, deal, sec, user) {
    if (!R.can(user, 'deal.edit')) return false;
    if (sec === 'posts') return deal.status !== 'Cancel' && !R.campaignCancelled(state, deal.campaign_id);
    return (DEAL_SECTIONS[sec] || []).some(f => fieldEditable(state, deal, f, user).editable);
  }
  /* the changed fields between two versions of a deal (arrays compared by value, '' = null) */
  const norm = v => (Array.isArray(v) ? JSON.stringify(v) : v === '' || v === undefined ? null : v);
  const diffFields = (before, after, fields) => fields.filter(f => norm(before[f]) !== norm(after[f])).map(f => ({ field: f, from: before[f] ?? null, to: after[f] ?? null }));
  /* posts: one change per post field ("P000046.post_date"), plus added / removed posts */
  function diffPosts(before, after) {
    const out = [], old = new Map(before.map(p => [p.post_id, p])), now = new Map(after.filter(p => p.post_id).map(p => [p.post_id, p]));
    after.forEach(p => { const o = p.post_id && old.get(p.post_id); if (!o) { out.push({ field: p.post_id || 'new', from: null, to: 'added' }); return; }
      diffFields(o, p, POST_EDIT_FIELDS).forEach(c => out.push({ field: `${p.post_id}.${c.field}`, from: c.from, to: c.to })); });
    before.forEach(p => { if (!now.has(p.post_id)) out.push({ field: p.post_id, from: 'removed', to: null }); });
    return out;
  }
  /* one Save in a section → one event: type 'edit', or 'cost' when an admin changes costs after a payment (note = the reason) */
  function editEvent(deal, changes, ctx, type) {
    return { event_id: ctx.eventId, deal_id: deal.deal_id, type: type || 'edit', from: Object.fromEntries(changes.map(c => [c.field, c.from])),
      to: Object.fromEntries(changes.map(c => [c.field, c.to])), changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null };
  }
  /* the pillar cannot be emptied once the deal reached Confirm QT (CR-03 §4.6) */
  const pillarCleared = (lookups, before, after) => !isBlank(before.pillar) && isBlank(after.pillar) && R.pillarStepReached(lookups, after.sub_status);

  /* ===================== CR-04 §4.7 — CTA = the Campaign's sales channel; a deal takes it and may differ ===================== */
  const campaignCta = (state, campaignId) => ((state.campaigns.find(c => c.campaign_id === campaignId) || {}).cta) || null;
  const ctaDiffers = (state, deal) => { const c = campaignCta(state, deal.campaign_id); return !!c && !isBlank(deal.cta) && deal.cta !== c; };
  /* the Campaign CTA changes from `from`: open deals of that Campaign that still carry `from` (none = no CTA) */
  const dealsWithCta = (state, campaignId, from) => state.deals.filter(d => d.campaign_id === campaignId && (d.status === 'List' || d.status === 'Inprocess') && (d.cta || null) === (from || null));

  /* ===================== CR-04 §4.8 — payment term of a new deal and the KOL default ===================== */
  /* 'kol' = the KOL's default · 'changed' = differs from it · 'none' = the KOL has no default */
  function termSource(kol, term) {
    const def = kol && R.isTerm(kol.default_payment_term) ? kol.default_payment_term : null;
    if (!def) return 'none';
    return term === def ? 'kol' : 'changed';
  }
  const termDiffers = (deal, kol) => { const def = kol && R.isTerm(kol.default_payment_term) ? kol.default_payment_term : null; return !!def && R.termOf(deal) !== def && R.termOf(deal) !== 'package'; };   // CR-20: a Package is never a KOL default

  /* ===================== CR-04 §4.3 — Group by ===================== */
  /* CR-09 §4.9 — one set of stage names, the journey steps of the Pipeline (lookups.journey_steps), the same in the Table groups, the Stage cell,
     the Pipeline columns, Move stage, the Stage popup, Filters and exports: Shortlist · Contacted · Confirm QT · Brief · Script ·
     Draft 1–3 · Approve · Post · Cancelled (CR-15). stageOf = the step the deal is at (its last step passed) */
  const stageOf = (lookups, d) => (d.status === 'Cancel' ? R.stepsOf(lookups).find(R.isCancelStep) : R.stepOf(lookups, d.sub_status)) || null;
  const stageName = st => (!st ? '' : R.isCancelStep(st) ? C.stage.cancelled : st.sub_status);
  function stageKey(lookups, d) { const st = stageOf(lookups, d); return st ? stageName(st) : d.status === 'Cancel' ? C.stage.cancelled : d.sub_status || ''; }
  const stageLabel = stageKey;
  /* every stage in journey order (Cancelled last) with its status */
  const stageOrder = lookups => R.stepsOf(lookups).map(st => ({ key: stageName(st), status: st.status, step: st }));
  /* the money of a stage — the same in a Table group header, a Pipeline column and the Stage popup:
     Shortlist / Contacted = pending · Cancelled = what those deals were worth · every other stage = committed */
  function stageMoney(state, deals) {
    const amount = deals.reduce((a, d) => a + totalCost(d), 0), d0 = deals[0];
    const kind = !d0 ? 'committed' : d0.status === 'Cancel' ? 'cancelled' : R.isShortlist(state.lookups, d0) ? 'pending' : 'committed';
    return { n: deals.length, amount, kind };
  }
  /* by: 'phase' | 'stage' | 'tier' | 'none' → [{key, rows}] in display order, empty groups left out */
  function groupDeals(state, deals, by, ctx, today) {
    if (by === 'none') return [{ key: null, rows: deals }];
    let keys, keyOf;
    if (by === 'stage') { keys = stageOrder(state.lookups).map(x => x.key); keyOf = d => stageKey(state.lookups, d); }
    else if (by === 'tier') { keys = tierOrder(state.lookups.tier_rules); keyOf = d => (ctx.tiers.get(d.deal_id) || {}).tier || UNKNOWN_TIER; }
    /* CR-06 §4.6: by PIC — the PIC list order, then '' = Unassigned */
    else if (by === 'pic') { keys = R.picNames(state, true).concat(['']); keyOf = d => d.pic || ''; }
    else { keys = R.orderedPhases(state.campaigns, state.phases, today).map(p => p.phase_id).concat([R.NEEDS, R.UNSCHEDULED]); keyOf = d => R.primaryPhase(ctx.phaseIdx, d.deal_id); }
    const by2 = new Map(keys.map(k => [k, []])), extra = [];
    deals.forEach(d => { const k = keyOf(d); if (by2.has(k)) by2.get(k).push(d); else { by2.set(k, [d]); extra.push(k); } });
    return keys.concat(extra).map(k => ({ key: k, rows: by2.get(k) })).filter(g => g.rows.length);
  }
  /* numbers for a Stage / Tier group header: deals · Committed (from Confirm QT) · Shortlist · overdue · average deal · views · CPV */
  function groupStats(state, deals, today, ctx) {
    const active = deals.filter(d => d.status !== 'Cancel');
    let committed = 0, shortlist = 0, views = 0, cost = 0;
    active.forEach(d => { const t = totalCost(d); if (R.isShortlist(state.lookups, d)) shortlist += t; else committed += t; });
    active.forEach(d => postsOfCtx(ctx, d.deal_id).forEach(p => { const v = Number(p.views) || 0; if (v > 0) { views += v; cost += ((ctx.phaseIdx.post.get(p.post_id) || {}).share || 0); } }));
    return { n: deals.length, active: active.length, committed, shortlist, overdue: deals.filter(d => R.isOverdue(state, d, today)).length,
      avg: active.length ? (committed + shortlist) / active.length : null, views, cpv: views ? cost / views : null };
  }
  const postPlatform = (ctx, p) => ((ctx.accounts.get(p.account_id) || {}).platform) || p.platform || '';

  /* ===================== payment (§6) ===================== */
  /* ticking fills today's date (editable); unticking clears it */
  const PAY_FLAGS = [['docs_done', 'docs_done_date'], ['paid_50', 'paid_50_date'], ['paid_full', 'paid_full_date']];
  function togglePayment(deal, flag, on, today) {
    const d = Object.assign({}, deal), pair = PAY_FLAGS.find(x => x[0] === flag);
    d[flag] = !!on;
    d[pair[1]] = on ? (deal[pair[1]] || today) : null;
    return d;
  }
  /* CR-02 §4.3: Free deals are never unpaid */
  const isUnpaid = d => d.status === 'Complete' && !R.paidUp(d) && R.termOf(d) !== 'free';   // CR-20: a package deal is paid with its package

  /* ===================== deal + post validation (§8) ===================== */
  const postLabel = (ctx, p, i) => { const a = ctx.accounts.get(p.account_id); return M.postN(i + 1, a ? `${a.platform} @${a.handle}` : ''); };
  /* d: deal as in the form (numbers may be strings) · posts: that deal's posts as in the form ·
     returns {errs, warns, infos, strict} — strict = errors if the deal were not legacy (used to clear is_legacy on save) */
  function validateDeal(state, d, posts, today, ctxIn) {
    const ctx = ctxIn || dealContext(state);
    const errs = [], warns = [], infos = [], strict = [];
    const legacy = !!d.is_legacy;
    const both = x => { errs.push(x); strict.push(x); };
    const completeness = x => { strict.push(x); if (!legacy) errs.push(x); };
    const L = state.lookups, camp = ctx.campaigns.get(d.campaign_id), kol = ctx.kols.get(d.kol_id), phases = R.phasesOfCampaign(state, d.campaign_id);
    const stored = d.deal_id ? ctx.deals.get(d.deal_id) : null, storedPosts = d.deal_id ? postsOfCtx(ctx, d.deal_id) : [];
    const storedPost = new Map(storedPosts.map(p => [p.post_id, p]));

    if (!d.campaign_id) both(issue('campaign_id', M.dealCampaignRequired)); else if (!camp) both(issue('campaign_id', M.dealCampaignMissing));
    if (!d.kol_id) both(issue('kol_id', M.dealKolRequired)); else if (!kol) both(issue('kol_id', M.dealKolMissing));
    if (!d.pic) completeness(issue('pic', M.dealPicRequired));
    if (!d.sub_status || !R.stepOf(L, d.sub_status)) both(issue('sub_status', M.dealStepRequired));
    MONEY_KEYS.forEach(k => { if (!isBlank(d[k]) && (isNaN(d[k]) || Number(d[k]) < 0)) both(issue(k, M.dealMoney(C.deal.f[k]))); });
    if (!isBlank(d.gencode_period) && (isNaN(d.gencode_period) || Number(d.gencode_period) < 0 || !Number.isInteger(Number(d.gencode_period)))) both(issue('gencode_period', M.dealPeriodInt));
    DATE_KEYS.forEach(k => { if (!isBlank(d[k]) && !isISODate(d[k])) both(issue(k, M.dateInvalid(C.deal.f[k]))); });
    ['remark', 'cancel_reason'].forEach(k => { if (R.looksSensitive(d[k])) both(issue(k, M.sensitive)); });   // CR-08 §4.4
    if (!isBlank(d.link_brief) && !isHttpLink(d.link_brief)) both(issue('link_brief', M.dealLinkFormat(C.deal.f.link_brief)));
    if (stored && stored.kol_id !== d.kol_id && storedPosts.length) both(issue('kol_id', M.dealKolLocked(storedPosts.length)));

    const seenInForm = new Map();
    posts.forEach((p, i) => {
      const f = k => `post${i}_${k}`, n = postLabel(ctx, p, i), acc = ctx.accounts.get(p.account_id);
      const orig = p.post_id ? storedPost.get(p.post_id) : null;
      if (!p.account_id) both(issue(f('account_id'), M.postAccountRequired(n)));
      else if (!acc || acc.kol_id !== d.kol_id) both(issue(f('account_id'), M.postAccountOther(n)));
      /* CR-10 §4.5: one reader for a count (12,500 · 12.5K · 1.3M) and the same warnings as Deals › Performance */
      METRIC_KEYS.forEach(k => { if (!isBlank(p[k]) && R.parseCount(p[k]).error) both(issue(f(k), M.postCount(n, k))); });
      if (METRIC_KEYS.every(k => isBlank(p[k]) || !R.parseCount(p[k]).error)) {
        const vals = Object.fromEntries(METRIC_KEYS.map(k => [k, isBlank(p[k]) ? null : R.parseCount(p[k]).value]));
        if (orig ? !R.sameMetrics(orig, vals) : true) R.metricsWarnings(orig, vals).forEach(w => warns.push(issue(f('views'), `${n}: ${w.msg}`)));
      }
      POST_DATE_KEYS.forEach(k => { if (!isBlank(p[k]) && !isISODate(p[k])) both(issue(f(k), M.dateInvalid(`${n} ${C.deal.f[k]}`))); });
      if (!isBlank(p.post_link)) {
        if (!isHttpLink(p.post_link)) both(issue(f('post_link'), M.postLinkFormat(n)));
        else {
          const key = normLink(p.post_link), changed = !orig || trim(orig.post_link) !== trim(p.post_link);
          /* stored posts of this deal are represented by the form itself, so only other deals can clash */
          const clash = (ctx.linkIndex.get(key) || []).find(x => x.deal_id !== d.deal_id);
          const twin = seenInForm.get(key);
          if (clash) {
            const cd = ctx.deals.get(clash.deal_id) || {}, ck = ctx.kols.get(cd.kol_id) || {};
            const msg = M.postDup(n, clash.deal_id, ck.display_name || '');
            if (changed || !(legacy || p.is_legacy || orig && orig.is_legacy)) both(issue(f('post_link'), msg));
            else { warns.push(issue(f('post_link'), M.postDupLegacy(n, clash.deal_id, ck.display_name || ''))); strict.push(issue(f('post_link'), msg)); }
          } else if (twin != null) both(issue(f('post_link'), M.postDupInDeal(n, twin)));
          seenInForm.set(key, i + 1);
          if (acc) {
            const h = handleFromLink(p.post_link);
            if (h && h !== String(acc.handle).toLowerCase()) warns.push(issue(f('post_link'), M.postLinkHandle(n, h, acc.handle)));
            const pl = platformFromLink(p.post_link);
            if (pl && acc.platform !== 'Other' && pl !== acc.platform) warns.push(issue(f('post_link'), M.postLinkPlatform(n, pl, acc.platform)));
          }
          const td = tiktokDate(p.post_link);
          if (td && isISODate(p.post_date) && Math.abs(dayDiff(td, p.post_date)) > 2) warns.push(issue(f('post_date'), M.postTiktokDate(n, R.dmy(td), R.dmy(p.post_date))));
        }
      }
      /* CR-03 §4.4 — the post's Phase comes from its date · CR-23 §3.5: only a post with its Post date says why (before / after the Campaign ·
         between Phases · in two Phases — Change date · Pick phase) until a Phase is picked · a post not posted yet: the deal's Post due (below) */
      if (camp && phases.length) {
        if (isISODate(p.post_date)) {
          const r = R.resolvePostPhase(p, phases), chk = R.postDateCheck(state, d.campaign_id, p.post_date);
          if (!(r.override && phases.some(x => x.phase_id === r.override) && !r.overrideUnused)) {   // (a Phase picked by hand settles it)
            if (['before', 'after', 'between'].includes(chk.kind)) warns.push(Object.assign(issue(f('post_date'), R.postDateText(chk, p.post_date, C.deal.postDateWord), 'post_outside'), { post: i }));
            else if (r.kind === 'overlap' && !r.phase) warns.push(Object.assign(issue(f('phase_override'), M.postInTwoPhases(n, R.dmy(p.post_date).slice(0, 5)), 'post_outside'), { post: i }));
          }
        }
        if (R.postFarOutside(p, phases)) infos.push(issue(f('post_date'), M.postFarOutside(n, R.dmy(R.postDateOf(p)))));
      }
      if (OPEN.includes(d.status) && isISODate(p.expected_post_date) && p.expected_post_date < today && isBlank(p.post_date))
        warns.push(issue(f('expected_post_date'), M.postLate(n, R.dmy(p.expected_post_date))));
      if (R.postDone(p) && isBlank(p.views)) infos.push(issue(f('views'), M.postNoViews(n)));
      if (METRIC_KEYS.some(k => !isBlank(p[k]) && Number(p[k]) > 0) && isBlank(p.metrics_updated_at)) infos.push(issue(f('metrics_updated_at'), M.metricsNoDate(n)));
    });

    /* CR-23 §3.5 — the Post due (not posted yet) outside the Campaign / between Phases: once for the deal ("Post due 25/10 is before …") */
    if (camp && phases.length && OPEN.includes(d.status) && isISODate(d.expected_post_date) && (!posts.length || posts.some(p => !R.postDone(p)))) {
      const t = R.postDateText(R.postDateCheck(state, d.campaign_id, d.expected_post_date), d.expected_post_date, C.deal.postDueWord);
      if (t) warns.push(issue('expected_post_date', t, 'post_due_outside'));
    }
    /* CR-06 §4.3 — products come from the Campaign's list · none picked once the deal reached Brief = info */
    const prods = Array.isArray(d.products) ? d.products : R.dealProductList(state, d.deal_id), kept = d.deal_id ? R.dealProductList(state, d.deal_id).map(x => x.tr_code) : [];
    R.validateDealProducts(state, d.campaign_id, prods, kept).forEach(both);
    if (d.campaign_id) prods.filter(x => !R.campaignHasProduct(state, d.campaign_id, x.tr_code) && kept.some(c => R.sameCode(c, x.tr_code)))
      .forEach(x => { const p = R.productByCode(state, x.tr_code); infos.push(issue('products', M.productKeptNotInCampaign(p ? R.productShort(p) : x.tr_code))); });
    const brief = R.stepOf(L, 'Brief'), cur = R.stepOf(L, d.sub_status);
    if (!prods.length && camp && OPEN.includes(d.status) && brief && cur && cur.sort_order >= brief.sort_order) infos.push(issue('products', M.noProductsSelected));
    const step = R.stepOf(L, d.sub_status);
    if (step && step.status === 'Complete') {
      if (!posts.length) completeness(issue('posts', M.completeNeedsPosts));
      else { const bad = posts.filter(p => !R.postDone(p)).length; if (bad) completeness(issue('posts', M.completePostsIncomplete(bad))); }
    }
    /* drafts expected but not approved yet — rounds in the deal's plan only (CR-02 §4.2) */
    const plan = R.planOf(d);
    if (OPEN.includes(d.status) && step) {
      [1, 2, 3].forEach(n => {
        if (n > plan.drafts) return;
        const ds = R.stepsOf(L).find(s => R.draftNo(s) === n);
        const exp = d[`expected_draft${n}_date`];
        if (ds && ds.active !== false && step.sort_order < ds.sort_order && isISODate(exp) && exp < today && isBlank(d[`approved_draft${n}_date`]))
          warns.push(issue(`expected_draft${n}_date`, M.draftLate(n, R.dmy(exp))));
      });
    }
    if ((d.paid_50 || d.paid_full) && !d.docs_done) warns.push(issue('docs_done', M.payNoDocs));
    if (d.paid_full && d.status === 'Cancel') warns.push(issue('paid_full', M.payCancelPaid));
    if (num(d.gencode_expense) > 0 && isBlank(d.gencode_period)) warns.push(issue('gencode_period', M.gencodeNoPeriod));
    [1, 2, 3].forEach(n => { const a = d[`approved_draft${n}_date`]; if (n <= plan.drafts && isISODate(a) && isISODate(d.brief_date) && a < d.brief_date) warns.push(issue(`approved_draft${n}_date`, M.draftBeforeBrief(n))); });
    [1, 2, 3].forEach(n => { if (n > plan.drafts && (!isBlank(d[`expected_draft${n}_date`]) || !isBlank(d[`approved_draft${n}_date`]))) infos.push(issue(`expected_draft${n}_date`, M.draftOutsidePlan(n, plan.drafts))); });
    if (!isBlank(d.payment_term) && !R.isTerm(d.payment_term)) both(issue('payment_term', M.termInvalid));
    if (R.termOf(d) === 'free' && totalCost(d) > 0) infos.push(issue('payment_term', M.freeWithCost(R.baht(totalCost(d)))));
    /* the budget check is on the Campaign (Phase budgets follow the posts, see Campaign & Phase) — not counted in the ⚠ column */
    const counts = x => !!x && x.status !== 'Cancel' && !R.isShortlist(L, x);
    if (camp && counts(d) && !isBlank(camp.budget_kol)) {
      const others = (ctx.committedByCampaign.get(d.campaign_id) || 0) - (counts(stored) && stored.campaign_id === d.campaign_id ? totalCost(stored) : 0);
      const after = others + totalCost(d);
      if (after > Number(camp.budget_kol)) warns.push(issue('budget', M.campaignOver(R.baht(after - Number(camp.budget_kol))), 'phase'));
    }
    if (d.campaign_id && d.kol_id) {
      const n = (ctx.dealCountByCampaignKol.get(d.campaign_id + '|' + d.kol_id) || 0) - (stored && stored.campaign_id === d.campaign_id && stored.kol_id === d.kol_id ? 1 : 0);
      if (n > 0) infos.push(issue('kol_id', M.addExisting(n)));
    }
    if (kol && kol.kol_status && kol.kol_status !== 'Active' && (!stored || stored.kol_id !== d.kol_id)) warns.push(issue('kol_id', M.addKolStatus(kol.display_name, kol.kol_status)));
    if (isUnpaid(d)) infos.push(issue('paid_full', M.completeUnpaid));
    /* CR-03 §4.6 — a reminder for deals at / after Confirm QT without a pillar (the error is on Move stage) */
    if (d.status !== 'Cancel' && isBlank(d.pillar) && step && R.pillarStepReached(L, d.sub_status) && !R.isImportedClosed(d)) infos.push(issue('pillar', M.pillarNotSetInfo));   // CR-11 §4.6
    return { errs, warns, infos, strict };
  }
  /* the deal's warnings except the Phase budget (that one lives on the Phase) — the ⚠ column shows the attention reasons since CR-13 §4.5 */
  const rowWarnings = (state, deal, today, ctx) => validateDeal(state, deal, postsOfCtx(ctx, deal.deal_id), today, ctx).warns.filter(w => w.kind !== 'phase');

  /* ===================== Template layout (KOL Template.xlsx, 36 columns) ===================== */
  const TEMPLATE_HEADERS = ['Pilar', 'Status', 'SubStatus', 'ทำเอกสารยัง', 'จ่ายแล้ว 50%', 'จ่ายแล้ว', 'Name Account', 'Tiktok', 'IG', 'FB', 'X', 'Lemon8',
    'PIC', 'Rate Card', 'Gencode_Expense', 'Gencode_period', 'Gencode_Start_date', 'ค่าติดตระกร้า', 'Asset', 'Expediting Fee', 'Total', 'Delivery', 'TR Code',
    'Brief Date', 'Expected Draft 1 Date', 'Approved Draft 1 Date', 'Expected Draft 2 Date', 'Approved Draft 2 Date', 'Expected Draft 3 Date', 'Approved Draft 3 Date',
    'Expected date post', 'Date Post', 'Link Brief', 'Link Post', 'Gencode', 'CTA'];
  const TEMPLATE_PLATFORMS = ['TikTok', 'Instagram', 'Facebook', 'X', 'Lemon8'];
  /* '' no plan · 'planned' at least one post not done · 'posted' all done */
  function platformMark(ctx, dealId, platform) {
    const ps = postsOfCtx(ctx, dealId).filter(p => (platform === 'other' ? !TEMPLATE_PLATFORMS.includes(postPlatform(ctx, p)) : postPlatform(ctx, p) === platform));
    return !ps.length ? '' : ps.every(R.postDone) ? 'posted' : 'planned';
  }
  function dealPostSummary(ctx, dealId) {
    const ps = postsOfCtx(ctx, dealId), dates = ps.map(p => p.post_date).filter(Boolean).sort();
    const sum = k => ps.reduce((s, p) => s + num(p[k]), 0);
    return { posts: ps, planned: ps.length, done: ps.filter(R.postDone).length, first: dates[0] || null, last: dates[dates.length - 1] || null,
      links: ps.filter(p => !isBlank(p.post_link)).length, views: sum('views'), likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares') };
  }
  /* one deal → the 36 Template cells (export form: booleans and platforms as "/", several posts joined by new lines) */
  function templateRow(state, d, ctx) {
    const ps = postsOfCtx(ctx, d.deal_id), k = ctx.kols.get(d.kol_id) || {}, slash = v => (v ? '/' : '');
    const plat = p => slash(ps.some(x => postPlatform(ctx, x) === p));
    return [d.pillar, d.status, d.sub_status, slash(d.docs_done), slash(d.paid_50), slash(d.paid_full), k.display_name,
      plat('TikTok'), plat('Instagram'), plat('Facebook'), plat('X'), plat('Lemon8'),
      d.pic, d.rate_card, d.gencode_expense, d.gencode_period, d.gencode_start_date, d.basket_fee, d.asset_fee, d.expediting_fee, totalCost(d),
      slash(d.delivered), R.dealTrCodes(state, d.deal_id).join('\n'), d.brief_date,
      d.expected_draft1_date, d.approved_draft1_date, d.expected_draft2_date, d.approved_draft2_date, d.expected_draft3_date, d.approved_draft3_date,
      d.expected_post_date, ps.map(p => p.post_date || '').join('\n').trim(), d.link_brief, ps.map(p => p.post_link || '').filter(Boolean).join('\n'),
      ps.map(p => p.gencode_code || '').filter(Boolean).join('\n'), d.cta].map(v => (v == null ? '' : v));
  }

  /* ===================== lists of deals: filters, tiles ===================== */
  function filterDeals(state, f, today, ctx) {
    const q = trim(f.q).toLowerCase().replace(/^@/, '');
    const idx = ctx.phaseIdx || R.phaseIndex(state);
    const inYear = f.year && f.year !== 'all' ? yearCampaignIds(state, f.year) : null;   // CR-21 §3.2: the Year of Deals (AND with the rest)
    /* CR-03 §4.5: a Phase filter keeps deals with at least one post in the Phase (keys __needs / __unscheduled work too) */
    const touches = (d, list) => { const keys = (idx.deal.get(d.deal_id) || { keys: new Set() }).keys; return list.some(k => keys.has(k)); };
    return state.deals.filter(d => {
      if (f.campaign && d.campaign_id !== f.campaign) return false;
      if (inYear && !inYear.has(d.campaign_id)) return false;
      if (f.phase && !touches(d, [f.phase])) return false;
      if (f.phases && !touches(d, f.phases)) return false;
      if (f.payState && R.paymentState(d, today) !== f.payState) return false;
      if (f.term && (R.termOf(d) || 'none') !== f.term) return false;
      if (f.open && !R.isOpenDeal(d)) return false;
      if (f.status && d.status !== f.status) return false;
      if (f.sub && d.sub_status !== f.sub) return false;
      if (f.pic && (f.pic === '__none' ? !isBlank(d.pic) : d.pic !== f.pic)) return false;
      if (f.pillar && (f.pillar === '__none' ? !isBlank(d.pillar) : d.pillar !== f.pillar)) return false;
      if (f.cta && (f.cta === '__none' ? !isBlank(d.cta) : d.cta !== f.cta)) return false;
      if (f.noImported && R.isImported(d)) return false;   // CR-11 §4.6: Include imported off
      if (f.tiers && f.tiers.length && !f.tiers.includes((ctx.tiers.get(d.deal_id) || {}).tier || UNKNOWN_TIER)) return false;
      if (f.payment && R.paymentProgress(d) !== f.payment) return false;
      if (f.overdue && !R.isOverdue(state, d, today)) return false;
      if (f.unpaid && !isUnpaid(d)) return false;
      /* "Needs attention" on the Overview: posted deals with a post that has no date · posts dated outside a window */
      if (f.noDate && !(d.status === 'Complete' && postsOfCtx(ctx, d.deal_id).some(p => !p.post_date))) return false;
      if (f.outside && !(d.status !== 'Cancel' && postsOfCtx(ctx, d.deal_id).some(p => p.post_date && (p.post_date < f.outside.from || p.post_date > f.outside.to)))) return false;
      if (q) {
        const k = ctx.kols.get(d.kol_id) || {};
        const hit = String(k.display_name || '').toLowerCase().includes(q) || state.kol_accounts.some(a => a.kol_id === d.kol_id && String(a.handle).toLowerCase().includes(q)) || d.deal_id.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }
  /* ===================== CR-06 §4.8 — Payments view ===================== */
  const PAY_TABS = ['due', 'overdue', 'upcoming', 'paid', 'all'];
  const PAY_GROUPS = ['prepaid', 'split_50', 'postpaid', 'free', 'none'];
  /* Due now = due by its term, not paid · Overdue = Prepaid / 50-50 past Brief, not paid · Upcoming = not due yet (a paid 50/50 deposit waits here) ·
     Paid = paid in full · Free deals have nothing to pay (All only) */
  function payTabOf(d, today) { const st = R.paymentState(d, today); return st === 'paid' ? 'paid' : st === 'due' ? 'due' : st === 'overdue' ? 'overdue' : st === 'free' ? null : 'upcoming'; }
  /* Outstanding = what is left to pay on a committed deal (Confirm QT on, not cancelled) */
  const outstandingOf = (lookups, d) => (d.status === 'Cancel' || R.isShortlist(lookups, d) ? 0 : Math.max(0, totalCost(d) - R.paidEstimate(d)));
  /* deals of the scope (cancelled left out) · tab counts · Committed / Paid (est.) / Outstanding */
  function paymentsView(state, deals, today) {
    const live = deals.filter(d => d.status !== 'Cancel'), counts = Object.fromEntries(PAY_TABS.map(k => [k, 0]));
    let committed = 0, paid = 0, outstanding = 0;
    live.forEach(d => {
      const t = payTabOf(d, today); if (t) counts[t]++;
      if (!R.isShortlist(state.lookups, d)) { committed += totalCost(d); outstanding += outstandingOf(state.lookups, d); }
      paid += R.paidEstimate(d);
    });
    counts.all = live.length;
    return { live, counts, committed, paid, outstanding };
  }
  /* the term group of a deal and the money of a group */
  const payGroupOf = d => R.termOf(d) || 'none';
  function payGroupTotals(state, deals) {
    let committed = 0, paid = 0, outstanding = 0;
    deals.forEach(d => { if (!R.isShortlist(state.lookups, d)) committed += totalCost(d); paid += R.paidEstimate(d); outstanding += outstandingOf(state.lookups, d); });
    return { n: deals.length, committed, paid, outstanding };
  }
  /* the ticks a term has in the Payments view: Docs · Deposit (50/50 only) · Paid — Free has none */
  const payFlags = term => (term === 'free' ? [] : term === 'split_50' ? ['docs_done', 'paid_50', 'paid_full'] : ['docs_done', 'paid_full']);

  /* CR-06 §4.7 dropPlan (a card dropped on a stage column): rules-move.js (CR-20 §4.9) */

  /* ===================== CR-13 §4.4 — Deals: state tabs = the groups of the Pipeline (CR-09 §4.10) · §4.5 attention chips ===================== */
  /* All (default) · List (Shortlist · Contacted · Confirm QT) · In process (Brief · Script · Draft 1–3 · Approve) · Complete (Post) · Cancelled */
  const DEAL_TABS = ['all', 'list', 'inprocess', 'complete', 'cancelled'];
  const TAB_OF_STATUS = { List: 'list', Inprocess: 'inprocess', Complete: 'complete', Cancel: 'cancelled' };
  const dealTabOf = d => TAB_OF_STATUS[d.status] || 'list';
  const inDealTab = (d, tab) => !tab || tab === 'all' || dealTabOf(d) === tab;
  /* what a deal needs done — the words of Dashboard › Operations › To do (CR-11 §4.8) · paying is the work of Payments, not of the deal (no Unpaid after posting) */
  const ATTENTION = ['overdue', 'needsPhase', 'shipOverdue', 'metricsDue', 'docs'];
  /* deal_id → the instalments owed now that miss a document (Payments › To pay, status Missing docs) */
  function docsByDeal(state, today) {
    const m = new Map();
    R.payQueue(state, today).items.forEach(x => { if (x.status === 'missing_docs' && x.deal_id) m.set(x.deal_id, (m.get(x.deal_id) || 0) + 1); });
    return m;
  }
  /* once a screen: posts at Metrics due (CR-11 §4.12) · instalments at Missing docs · shipments past Ship by (CR-11 §4.10), each by deal */
  function attentionContext(state, today) {
    const metrics = new Map(), ship = new Map();
    R.metricsDue(state, {}, today).forEach(x => metrics.set(x.deal.deal_id, (metrics.get(x.deal.deal_id) || 0) + 1));
    (state.sample_shipments || []).forEach(sh => { if (sh.deal_id && R.sampleStatus(sh, today) === 'overdue') ship.set(sh.deal_id, (ship.get(sh.deal_id) || 0) + 1); });
    return { metrics, ship, docs: R.isSimple && R.isSimple(state, 'payments') ? new Map() : docsByDeal(state, today) };   // CR-17 §4.4: documents do not block in Simple mode
  }
  /* → [{key, n, …}] in chip order · Overdue: the next step is late (CR-02 · List / In process) {step, due} · Needs phase: posts whose Phase the date
     cannot decide (CR-03) · Shipment overdue: shipments · Metrics due: posts · Docs to collect: instalments · a cancelled deal has none */
  function attentionReasons(state, d, today, ctx, actx) {
    if (d.status === 'Cancel') return [];
    const out = [], a = actx || attentionContext(state, today);
    if (R.isOverdue(state, d, today)) { const st = R.dueStep(state, d); out.push({ key: 'overdue', n: 1, step: st ? R.stageName(st) : '', due: R.dueDate(state, d) }); }
    const np = ((ctx || dealContext(state)).phaseIdx.deal.get(d.deal_id) || {}).needsPosts || 0;
    if (np > 0) out.push({ key: 'needsPhase', n: np });
    [['shipOverdue', a.ship], ['metricsDue', a.metrics], ['docs', a.docs]].forEach(([k, m]) => { const n = m.get(d.deal_id) || 0; if (n) out.push({ key: k, n }); });
    return out;
  }
  /* the numbers of a Deals screen · deals = the scope (Campaign · Phase · PIC · Filters · Search) · o = {tab, reason, actx}:
     counts = per tab, the scope with the chosen chip (a filter) · chips = per reason, the deals of the chosen tab (the chip itself left out, so
     each chip says what it would show) · why = deal_id → its reasons (the ⚠ column) */
  function dealTabs(state, deals, today, ctxIn, o) {
    const ctx = ctxIn || dealContext(state), opt = o || {}, actx = opt.actx || attentionContext(state, today), why = new Map();
    deals.forEach(d => { const r = attentionReasons(state, d, today, ctx, actx); if (r.length) why.set(d.deal_id, r); });
    const counts = Object.fromEntries(DEAL_TABS.map(k => [k, 0])), chips = Object.fromEntries(ATTENTION.map(k => [k, 0]));
    deals.forEach(d => {
      if (hasReason(d, opt.reason, why)) { counts.all++; counts[dealTabOf(d)]++; }
      if (inDealTab(d, opt.tab)) (why.get(d.deal_id) || []).forEach(x => { chips[x.key]++; });
    });
    return { counts, chips, why };
  }
  const hasReason = (d, reason, why) => !reason || (why.get(d.deal_id) || []).some(x => x.key === reason);
  /* §4.4 — the tab remembered for each person: one JSON {userId: tab} under deals.stateTab.v2 (the old open / needs values are not read) */
  const DEAL_TAB_KEY = 'deals.stateTab.v2';
  function dealTabPref(json, uid) {
    let m = {}; try { m = JSON.parse(json || '{}') || {}; } catch (e) { m = {}; }
    const v = m[uid || ''];
    return DEAL_TABS.includes(v) ? v : 'all';
  }
  function setDealTabPref(json, uid, tab) {
    let m = {}; try { m = JSON.parse(json || '{}') || {}; } catch (e) { m = {}; }
    if (typeof m !== 'object' || Array.isArray(m)) m = {};
    m[uid || ''] = DEAL_TABS.includes(tab) ? tab : 'all';
    return JSON.stringify(m);
  }
  /* an old link #deals?tab=… → { tab, reason }: open → All · needs_action → All + Overdue · a tab of today → that tab */
  function dealTabFromLink(v) {
    const t = String(v == null ? '' : v).toLowerCase().replace(/[\s_-]/g, '');
    if (DEAL_TABS.includes(t)) return { tab: t, reason: '' };
    if (t === 'needsaction' || t === 'needs') return { tab: 'all', reason: 'overdue' };
    return { tab: 'all', reason: '' };
  }
  /* the Campaign Deals opens with: the last one used (if it still exists) → the first On going in §4.7 order → the first */
  function defaultDealsCampaign(state, today, last, year) {
    if (last && state.campaigns.some(c => c.campaign_id === last && R.isApproved(c))) return last;
    const list = R.sortCampaigns(state.campaigns.filter(c => R.isApproved(c) && (!year || year === 'all' || campaignYear(state, c) === year)), state.phases, today);
    const c = list.find(x => R.campaignEffectiveStatus(x, R.phasesOfCampaign(state, x.campaign_id), today) === 'ongoing') || list[0];
    return c ? c.campaign_id : '';
  }

  /* ===================== CR-21 §3.2 — the Year of Deals ===================== */
  /* a Campaign's year = the year of its start_date (one that runs into the next year stays in the year it starts) · none → its earliest Phase
     (a draft Phase of an approved Campaign does not count) · no date at all → null (only under All years) */
  function campaignYear(state, c) {
    if (!c) return null;
    if (R.isISODate(c.start_date)) return c.start_date.slice(0, 4);
    const d = (state.phases || []).filter(p => p.campaign_id === c.campaign_id && R.isISODate(p.start_date) && (!R.isDraft(p) || R.isDraft(c))).map(p => p.start_date).sort()[0];
    return d ? d.slice(0, 4) : null;
  }
  /* the Year options: 'all' + the years that have an approved Campaign, newest first */
  function yearOptions(state) {
    const ys = new Set();
    (state.campaigns || []).filter(c => R.isApproved(c)).forEach(c => { const y = campaignYear(state, c); if (y) ys.add(y); });
    return ['all'].concat([...ys].sort().reverse());
  }
  /* the Campaigns of a year (every one for 'all') */
  const yearCampaignIds = (state, year) => new Set((state.campaigns || []).filter(c => !year || year === 'all' || campaignYear(state, c) === year).map(c => c.campaign_id));
  /* approved Campaigns still On going that started before the year (the grey bar "1 ongoing campaign started in 2026 · Show") */
  const ongoingBefore = (state, year, today) => (state.campaigns || []).filter(c => R.isApproved(c) && R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today) === 'ongoing')
    .map(c => ({ c, y: campaignYear(state, c) })).filter(x => x.y && x.y < year);
  /* the year Deals opens on for a person: the one they chose (still an option) · else this year */
  const dealYearPref = (state, saved, today) => { const opts = yearOptions(state); return saved && (saved === 'all' || opts.includes(saved)) ? saved : today.slice(0, 4); };

  /* CR-22 §3.6 — what an open deal still misses (the Deal modal's "Missing: …"): Assigned to · from Contacted: CTA · Rate card (not Free / Package) ·
     from Confirm QT: Pillar · Payment term — keys in that order */
  function dealMissing(state, d) {
    if (!d || d.status === 'Cancel' || d.status === 'Complete') return [];
    const L = state.lookups, st = R.stepOf(L, d.sub_status), at = name => { const x = R.stepOf(L, name); return !!st && !!x && st.sort_order >= x.sort_order; }, out = [];
    if (isBlank(d.pic)) out.push('pic');
    if (at('Contacted')) {
      if (isBlank(d.cta)) out.push('cta');
      const t = R.termOf(d); if (t !== 'free' && t !== 'package' && isBlank(d.rate_card)) out.push('rate_card');
    }
    if (at('Confirm QT')) { if (isBlank(d.pillar)) out.push('pillar'); if (!R.isTerm(R.termOf(d))) out.push('payment_term'); }
    return out;
  }

  /* scope: {campaignId, phaseIds} (an array = phaseIds) · whole Campaign → deal totals · Phases → the post shares in them (CR-03 §4.5) */
  function dealTiles(state, deals, scope, today, idxIn) {
    const idx = idxIn || R.phaseIndex(state), active = deals.filter(d => d.status !== 'Cancel'), money = R.scopeMoney(deals, scope, idx);
    return {
      count: active.length,
      committed: money.committed, shortlist: money.shortlist,
      budget: R.scopeBudget(state, scope),
      paid: money.paid,
      overdue: deals.filter(d => R.isOverdue(state, d, today)).length,
      unpaid: deals.filter(isUnpaid).length,
    };
  }

  /* ===================== Pipeline (§9.3) ===================== */
  /* dealsOrPhase: the deals on the board, or a phase_id (deals with a post in it) */
  function pipeline(state, dealsOrPhase) {
    const deals = Array.isArray(dealsOrPhase) ? dealsOrPhase : R.scopeDeals(state, { phaseIds: [dealsOrPhase] }, R.phaseIndex(state));
    const used = new Set(deals.map(d => d.sub_status));
    /* CR-02 §4.2: Draft 2–3 get a column only when a deal in the Phase plans them (or sits there) · Script and Approve always (CR-15) */
    const planned = s => !(R.draftNo(s) > 1) || deals.some(d => R.inPlan(s, R.planOf(d)));
    return R.stepsOf(state.lookups).filter(s => used.has(s.sub_status) || (s.active !== false && planned(s))).map(s => {
      const ds = deals.filter(d => d.sub_status === s.sub_status);
      return { step: s, deals: ds, count: ds.length, total: ds.reduce((x, d) => x + totalCost(d), 0) };
    });
  }

  /* ===================== Overview (§9.6) ===================== */
  /* default window: first Phase start → min(last Phase end, max(today, last post)) */
  /* scope: {campaignId, phaseIds} or an array of phase_ids (CR-03) */
  const scopePhases = (state, sc) => state.phases.filter(p => R.isApproved(p) && (sc.phaseIds ? sc.phaseIds.includes(p.phase_id) : !sc.campaignId || p.campaign_id === sc.campaignId));
  function overviewWindow(state, scope, today) {
    const sc = R.toScope(scope), ps = scopePhases(state, sc);
    if (!ps.length) return [today, today];
    const posts = R.scopePosts(state, sc, R.phaseIndex(state)).filter(p => p.post_date).map(p => p.post_date).sort();
    const start = ps.map(p => p.start_date).sort()[0], phaseEnd = ps.map(p => p.end_date).sort().pop();
    const lastPost = posts.length ? posts[posts.length - 1] : start;
    let end = [phaseEnd, lastPost > today ? lastPost : today].sort()[0];
    if (end < start) end = start;
    return [start, end];
  }
  /* posts per day / week (week starts Monday) from deal_posts with a post_date, deal not Cancel */
  function postBins(state, scope, from, to, gran) {
    if (!from || !to || to < from) return { bins: [], outside: [], noDate: 0, total: 0 };
    const keys = []; let cur = gran === 'week' ? weekStart(from) : from;
    while (cur <= to && keys.length <= 800) { keys.push(cur); cur = addDays(cur, gran === 'week' ? 7 : 1); }
    const map = new Map(keys.map(k => [k, { key: k, n: 0 }])), outside = [];
    const idx = R.phaseIndex(state), deals = new Map(R.scopeDeals(state, scope, idx).filter(d => d.status !== 'Cancel').map(d => [d.deal_id, d]));
    let noDate = 0, total = 0;
    R.scopePosts(state, scope, idx).forEach(p => {
      const d = deals.get(p.deal_id); if (!d) return;
      if (!p.post_date) { if (d.status === 'Complete') noDate++; return; }
      if (p.post_date < from || p.post_date > to) { outside.push({ post: p, deal: d }); return; }
      const b = map.get(gran === 'week' ? weekStart(p.post_date) : p.post_date); if (b) { b.n++; total++; }
    });
    outside.sort((a, b) => a.post.post_date.localeCompare(b.post.post_date));
    return { bins: keys.map(k => map.get(k)), outside, noDate, total };
  }
  function overviewTiles(state, scope, from, to, today) {
    const idx = R.phaseIndex(state), deals = R.scopeDeals(state, scope, idx), active = deals.filter(d => d.status !== 'Cancel');
    const activeIds = new Set(active.map(d => d.deal_id));
    const posts = R.scopePosts(state, scope, idx).filter(p => activeIds.has(p.deal_id));
    return {
      deals: active.length,
      posts: posts.filter(p => p.post_date && p.post_date >= from && p.post_date <= to).length,
      committed: R.scopeMoney(active, scope, idx).committed, shortlist: R.scopeMoney(active, scope, idx).shortlist,
      views: posts.reduce((s, p) => s + num(p.views), 0),
      overdue: deals.filter(d => R.isOverdue(state, d, today)).length,
      unpaid: deals.filter(isUnpaid).length,
    };
  }
  /* CR-02 §4.3 — Needs attention: prepaid / 50-50 deals past Brief without the payment · open deals without a term */
  function paymentAttention(state, scope, today) {
    const deals = R.scopeDeals(state, scope, R.phaseIndex(state));
    return {
      beforeBrief: deals.filter(d => (R.termOf(d) === 'prepaid' || R.termOf(d) === 'split_50') && R.paymentState(d, today) === 'overdue').length,
      termNotSet: deals.filter(d => R.isOpenDeal(d) && !R.termOf(d)).length,
    };
  }
  /* CR-03 §4.6 — Needs attention: posts that still need a Phase · deals (not Cancel) without a pillar */
  function phaseAttention(state, scope) {
    const idx = R.phaseIndex(state), deals = R.scopeDeals(state, scope, idx).filter(d => d.status !== 'Cancel');
    return {
      phaseToAssign: deals.reduce((a, d) => a + ((idx.deal.get(d.deal_id) || {}).needsPosts || 0), 0),
      pillarNotSet: deals.filter(d => isBlank(d.pillar)).length,
    };
  }
  /* deals per SubStatus (not Cancel), in journey order; Cancel counted separately */
  function funnel(state, scope) {
    const deals = R.scopeDeals(state, scope, R.phaseIndex(state));
    const rows = R.stepsOf(state.lookups).filter(s => s.status !== 'Cancel').map(s => ({ step: s, n: deals.filter(d => d.sub_status === s.sub_status).length }))
      .filter(r => r.step.active !== false || r.n);
    return { rows, cancel: deals.filter(d => d.status === 'Cancel').length, total: rows.reduce((s, r) => s + r.n, 0) };
  }
  const niceStep = raw => { const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

  /* ===================== data to check (§11) — shown in ตั้งค่า, never fixed automatically ===================== */
  function dataIssues(state) {
    const ctx = dealContext(state), out = { dupLinks: [], tiktok: [], swapped: [], pillar: [] };
    ctx.linkIndex.forEach(ps => { if (ps.length > 1) out.dupLinks.push(ps.map(p => ({ post: p, deal: ctx.deals.get(p.deal_id) }))); });
    state.deal_posts.forEach(p => {
      const td = tiktokDate(p.post_link);
      if (td && isISODate(p.post_date) && Math.abs(dayDiff(td, p.post_date)) > 2) out.tiktok.push({ post: p, deal: ctx.deals.get(p.deal_id), tiktok: td });
    });
    state.deals.forEach(d => {
      const [cs, ce] = R.campaignRange(state, d.campaign_id), ph = cs ? { start_date: cs, end_date: ce } : null, e = d.expected_post_date;
      if (ph && isISODate(e) && (e < ph.start_date || e > ph.end_date)) {
        const sw = `${e.slice(0, 4)}-${e.slice(8, 10)}-${e.slice(5, 7)}`;
        /* swapped day/month lands in the Phase (14-day margin) while the typed date is far outside */
        const lo = addDays(ph.start_date, -14), hi = addDays(ph.end_date, 14);
        if (isISODate(sw) && sw >= lo && sw <= hi && (e < lo || e > hi)) out.swapped.push({ deal: d, date: e, swapped: sw });
      }
      if (/Pillar เดิม:/.test(d.remark || '')) out.pillar.push({ deal: d });
    });
    return out;
  }

  /* ===================== new deal (§9.4) ===================== */
  /* opts: {dealId, logId, campaignId, kolId, sub, pic, prefill, accountIds, postIds[], phaseOverrides[], date, now, note, extra} → {deal, log, posts} */
  function newDeal(state, o) {
    const step = R.stepOf(state.lookups, o.sub);
    const deal = Object.assign(JSON.parse(JSON.stringify(R.DEAL_TEMPLATE)), { deal_id: o.dealId, campaign_id: o.campaignId, kol_id: o.kolId, status: step.status, sub_status: step.sub_status, pic: o.pic || null }, o.prefill || {}, o.extra || {});
    if (step.date_field && isBlank(deal[step.date_field])) deal[step.date_field] = o.date;
    if (!R.isTerm(deal.payment_term)) deal.payment_term = R.kolTerm(state, o.kolId);
    const posts = (o.accountIds || []).map((aid, i) => {
      const a = state.kol_accounts.find(x => x.account_id === aid) || {};
      return { post_id: o.postIds[i], deal_id: o.dealId, account_id: aid, platform: a.platform || null, expected_post_date: deal.expected_post_date || null, post_date: null, post_link: null,
        gencode_code: null, views: null, likes: null, comments: null, saves: null, shares: null, metrics_updated_at: null, legacy_job_id: null, is_legacy: false,
        phase_override: (o.phaseOverrides || [])[i] || null };
    });
    const log = { log_id: o.logId, deal_id: o.dealId, from_sub_status: null, status: step.status, sub_status: step.sub_status, effective_date: o.date,
      changed_at: (o.now || new Date()).toISOString(), changed_by: o.user || null, source: 'user', note: o.note || null };
    return { deal, log, posts };
  }
  const blankPost = (dealId, accountId, platform, expected) => ({ post_id: null, deal_id: dealId, account_id: accountId || '', platform: platform || null, expected_post_date: expected || null,
    post_date: null, post_link: null, gencode_code: null, views: null, likes: null, comments: null, saves: null, shares: null, metrics_updated_at: null, legacy_job_id: null, is_legacy: false,
    phase_override: null });

  /* ===================== CR-07 §4.4 — filters in use · Clear all filters ===================== */
  /* Deals: the Campaign (always one), View, Group by, state tab and sort are never filters */
  function blankDealFilter() { return { campaign: '', phaseSel: 'all', q: '', sub: '', pillar: '', cta: '', payState: '', term: '', open: false, noDate: false, outside: null, tiers: null }; }
  /* f = the Deals filter + pic ('all' · 'me' · a name · '__none') + reason (an attention chip, CR-13 §4.5) → the keys that differ from empty */
  function activeFilters(f) {
    const out = [];
    if (f.phaseSel && f.phaseSel !== 'all') out.push('phaseSel');
    if (f.pic && f.pic !== 'all') out.push('pic');
    if (trim(f.q)) out.push('q');
    if (f.tiers && f.tiers.length) out.push('tiers');
    ['sub', 'pillar', 'cta', 'term', 'payState', 'open', 'noDate', 'outside', 'reason', 'noImported'].forEach(k => { if (f[k]) out.push(k); });
    return out;
  }
  /* all of them back to empty at once — the Campaign stays · PIC = All PICs */
  function clearFilters(f) { return Object.assign(blankDealFilter(), { campaign: (f && f.campaign) || '', pic: 'all', reason: '' }); }
  /* KOL Master: the same rule (it has no Campaign) */
  const KOL_FILTER_KEYS = ['q', 'platform', 'tier', 'lastWorked', 'category', 'type', 'pic', 'status', 'term', 'history', 'source'];
  const activeKolFilters = f => KOL_FILTER_KEYS.filter(k => (k === 'q' ? !!trim(f.q) : Array.isArray(f[k]) ? f[k].length > 0 : !!f[k]));

  /* the wide drawers (CR-07 §4.7, CR-09 §4.12 / §4.17): KOL clamp(720px, 60% of the window, 1200px) · Deal clamp(680px, 50%, 1100px) ·
     or the width it was dragged to (560px … content − 320px) · the whole content area (window − menu) when less than 320px of the page would be left */
  function wideDrawerWidth(viewport, menuWidth, saved, pct, min, max) {
    const content = viewport - (menuWidth || 0), top = content - 320;
    if (top < 560) return content;
    const w = saved ? Math.min(Math.max(saved, 560), top) : Math.min(max, Math.max(min, Math.round(viewport * pct)));
    return content - w < 320 ? content : w;
  }
  /* CR-10 §4.13 — one rule for every detail drawer (Deal · KOL · Campaign · Phase Planner): clamp(720px, 60% of the window, 1200px) · the Planner
     at least 880px · a width dragged by hand (560px … window − 320px) is kept per kind · when the window would keep less than 320px beside it,
     the drawer takes the whole content area (window − menu) — 1920 → 1152 · 1440 → 864 · 1280 (menu open) → 768 · 1024 (rail) → the content area */
  function drawerWidth(kind, viewport, menuWidth, saved) {
    const content = viewport - (menuWidth || 0), min = kind === 'planner' ? 880 : 720;
    let w = saved ? Math.min(Math.max(saved, 560), viewport - 320) : Math.min(1200, Math.max(min, Math.round(viewport * 0.6)));
    if (kind === 'planner') w = Math.max(w, 880);
    return w < 560 || viewport - w < 320 || w > content ? content : w;
  }
  const kolDrawerWidth = (viewport, menuWidth, saved) => drawerWidth('kol', viewport, menuWidth, saved);
  const dealDrawerWidth = (viewport, menuWidth, saved) => drawerWidth('deal', viewport, menuWidth, saved);
  /* CR-09 §4.13 — the date the deal came to its stage (its last log at that step) · null when not recorded */
  function stageSince(state, d) {
    const st = stageOf(state.lookups, d); if (!st) return null;
    const logs = R.logsOf(state, d.deal_id).filter(l => l.sub_status === st.sub_status && l.effective_date);
    return logs.length ? logs[logs.length - 1].effective_date : (st.date_field && R.isISODate(d[st.date_field]) ? d[st.date_field] : null);   // else the step's own date on the deal
  }

  return {
    UNKNOWN_TIER, dealTier, tierOrder, tierRange, stageKey, stageOrder, stageOf, stageName, stageLabel, stageMoney, groupDeals, groupStats,
    DEAL_SECTIONS, POST_EDIT_FIELDS, AUTO_FIELDS, paymentRecorded, fieldEditable, sectionEditable, diffFields, diffPosts, editEvent, pillarCleared,
    campaignCta, ctaDiffers, dealsWithCta, termSource, termDiffers,
    MONEY_KEYS, METRIC_KEYS, DATE_KEYS, LIST_KEYS, activeValues, isInactiveValue, listValueUse, validateListValue, stepUse, stepDealUse, stepLocked, CORE_STEPS, isCoreStep, validateTiers,
    dealContext, postsOfCtx, postPlatform, PAY_FLAGS, togglePayment, isUnpaid, validateDeal, rowWarnings,
    PAY_TABS, PAY_GROUPS, payTabOf, outstandingOf, paymentsView, payGroupOf, payGroupTotals, payFlags,
    DEAL_TABS, dealTabOf, inDealTab, ATTENTION, docsByDeal, attentionContext, attentionReasons, dealTabs, hasReason, DEAL_TAB_KEY, dealTabPref, setDealTabPref, dealTabFromLink, defaultDealsCampaign,
    campaignYear, yearOptions, yearCampaignIds, ongoingBefore, dealYearPref, dealMissing,
    TEMPLATE_HEADERS, TEMPLATE_PLATFORMS, platformMark, dealPostSummary, templateRow, filterDeals, dealTiles,
    pipeline, overviewWindow, postBins, overviewTiles, paymentAttention, phaseAttention, funnel, niceStep, dataIssues, newDeal, blankPost,
    blankDealFilter, activeFilters, clearFilters, KOL_FILTER_KEYS, activeKolFilters, kolDrawerWidth, dealDrawerWidth, wideDrawerWidth, drawerWidth, stageSince,
  };

})(KT.rules, KT.content));
