/* rules-move.js — CR-20 §4.7 · §4.9 · §4.11–4.15: a move asks for what its target stage needs.
   stageRequirements(state, deal, target, form) is the ONE place that says which fields a move to a stage needs (req) or may take (opt) —
   the Move stage dialog, drag & drop (dropPlan), Move to… for many deals and New deal (Start at) all ask it; checkMove / applyMove work from it.
   form (all optional — what is not given comes from the deal): { date, today, note, cancelReason, addRound, nextRound, pillar, paymentTerm, packageId,
   packageUnits, rateCard, costs {gencode_expense, gencode_period, gencode_start_date, asset_fee, expediting_fee}, postDue, linkBrief, scriptLink,
   expected {field: date}, steps {sub_status: date}, alsoContacted, contactedDate, drafts {k: 'done' | 'not_needed'}, approveDate,
   posts [{post_id | account_id, link}], notes {note, links, image_ids} }.
   Adds to KT.rules (load after rules-package.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { isBlank, trim, isISODate, num, dmy } = R;
  const issue = (field, msg, code) => (code ? { field, msg, code } : { field, msg });
  const QT = 'Confirm QT';
  const isHttps = v => /^https:\/\/\S+$/i.test(trim(v));
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const COST_FORM = ['gencode_expense', 'gencode_period', 'gencode_start_date', 'asset_fee', 'expediting_fee'];
  const MONEY_FORM = ['rate_card', 'gencode_expense', 'asset_fee', 'expediting_fee'];
  const EXPECTED = ['expected_script_date', 'expected_draft1_date', 'expected_draft2_date', 'expected_draft3_date', 'expected_approve_date', 'expected_post_date'];
  const LABEL = () => ({ rate_card: C.move.rateCard, gencode_expense: C.move.gencodeCost, gencode_period: C.move.gencodeDays, gencode_start_date: C.move.gencodeStart,
    asset_fee: C.move.assetFee, expediting_fee: C.move.expeditingFee, expected_post_date: C.move.postDue, expected_script_date: C.move.expScript, expected_approve_date: C.move.expApprove,
    expected_draft1_date: C.move.expDraft(1), expected_draft2_date: C.move.expDraft(2), expected_draft3_date: C.move.expDraft(3) });
  const isBriefStep = s => !!s && s.date_field === 'brief_date';

  /* the deal as it would be with what the form holds (a value not in the form = the deal's own) · a Package term: Rate card = unit price × uses */
  function valuesOf(state, deal, f) {
    f = f || {};
    const v = Object.assign({}, deal);
    if (has(f, 'pillar') && !isBlank(f.pillar)) v.pillar = f.pillar;
    if (has(f, 'paymentTerm')) v.payment_term = isBlank(f.paymentTerm) ? null : f.paymentTerm;
    if (has(f, 'packageId')) v.package_id = f.packageId || null;
    if (has(f, 'packageUnits')) v.package_units = f.packageUnits;
    if (has(f, 'rateCard')) v.rate_card = f.rateCard;
    COST_FORM.forEach(k => { if (f.costs && has(f.costs, k)) v[k] = f.costs[k]; });
    if (R.termOf(v) !== 'package') { v.package_id = null; v.package_units = 1; }
    else { const p = R.packageById(state, v.package_id), n = Number(v.package_units); if (p && Number.isInteger(n) && n >= 1) v.rate_card = round2(R.unitPrice(p) * n); }
    if (has(f, 'postDue')) v.expected_post_date = f.postDue || null;
    if (has(f, 'linkBrief')) v.link_brief = trim(f.linkBrief) || null;
    if (has(f, 'scriptLink')) v.script_link = trim(f.scriptLink) || null;
    EXPECTED.forEach(k => { if (f.expected && has(f.expected, k)) v[k] = f.expected[k] || null; });
    return v;
  }
  /* what Confirm QT needs that the deal itself still lacks (Free: no rate needed · Package: the package gives the rate) */
  function qtGaps(state, d) {
    const t = R.termOf(d), out = [];
    if (isBlank(d.pillar)) out.push('pillar');
    if (!R.isTerm(t)) out.push('payment_term');
    if (t === 'package' && !R.packageById(state, d.package_id)) out.push('package_id');
    if (t !== 'package' && t !== 'free' && isBlank(d.rate_card)) out.push('rate_card');
    if (num(d.gencode_expense) > 0 && isBlank(d.gencode_period)) out.push('gencode_period');
    return out;
  }
  /* the drafts of the plan once the move is done: + the target round (addRound) · + the next round (§4.15 nextRound) · Post: the planned drafts not
     done yet are Not needed unless marked Done (§4.14 — only when the form says so: Move to… keeps the plan and marks them done) */
  function planAfter(state, deal, to, f) {
    const L = state.lookups, k = R.draftNo(to), base = R.planOf(deal).drafts;
    let drafts = base;
    if (f && f.addRound && k && k > drafts) drafts = k;
    if (f && f.nextRound && k && k === drafts && k < R.MAX_DRAFTS) drafts = k + 1;
    if (f && f.drafts && R.isPostStep(to)) {
      const from = R.stepOf(L, deal.sub_status), fromSort = from ? from.sort_order : -Infinity;
      let keep = 1;
      R.stepsOf(L).forEach(s => { const n = R.draftNo(s); if (n && n <= base && (s.sort_order <= fromSort || !isBlank(deal[`approved_draft${n}_date`]) || f.drafts[n] === 'done' || n === 1)) keep = Math.max(keep, n); });
      drafts = keep;
    }
    return { drafts };
  }
  /* §4.15 — the date the KOL is expected to hand in the next piece of work (no new fields: CR-15's) */
  function nextExpected(state, to, plan) {
    const k = R.draftNo(to);
    if (isBriefStep(to)) return [{ field: 'expected_draft1_date', req: true }, { field: 'expected_script_date', req: false }];
    if (R.isScriptStep(to)) return [{ field: 'expected_draft1_date', req: true }];
    if (k) return plan.drafts > k ? [{ field: `expected_draft${k + 1}_date`, req: false }] : [{ field: 'expected_approve_date', req: false }];
    if (R.isApproveStep(to)) return [{ field: 'expected_post_date', req: false }];
    return [];
  }

  /* ===================== the one rule: what a move to `toSub` needs ===================== */
  /* → { kind: same · forward · back · cancel · leaveCancel · unknown, to, from, v (the values), fields {key: 'req' | 'opt' | 'auto'}, qt (Confirm QT details shown),
       crossesQt, skipped [steps to date], contacted (offer Also mark Contacted), drafts [k] (Post: Done on / Not needed), approve, post, next [{field, req}],
       nextRound {k, on} (+ Add Draft k round), notesDraft (k), plan {drafts} } */
  function stageRequirements(state, deal, toSub, f) {
    f = f || {};
    const L = state.lookups, to = R.stepOf(L, toSub), from = R.stepOf(L, deal.sub_status), v = valuesOf(state, deal, f);
    const out = { kind: 'unknown', to, from, v, fields: {}, qt: false, crossesQt: false, skipped: [], contacted: null, drafts: [], approve: false, post: false, next: [], nextRound: null, notesDraft: null, plan: R.planOf(deal) };
    if (!to) return out;
    const set = (k, r) => { if (out.fields[k] !== 'req') out.fields[k] = r; };
    const fromSort = from ? from.sort_order : -Infinity;
    set('date', 'req');
    if (deal.sub_status === toSub) { out.kind = 'same'; return out; }
    if (from && R.isCancelStep(from)) { out.kind = 'leaveCancel'; set('note', 'req'); return out; }
    if (R.isCancelStep(to)) { out.kind = 'cancel'; set('cancel_reason', 'req'); set('note', 'opt'); return out; }
    if (to.sort_order < fromSort) { out.kind = 'back'; set('note', 'req'); return out; }
    out.kind = 'forward'; set('note', 'opt');
    const qt = R.stepOf(L, QT), qtSort = qt ? qt.sort_order : Infinity, term = R.termOf(v), plan = planAfter(state, deal, to, f);
    out.plan = plan;
    if (to.sort_order < qtSort) {
      /* Contacted: Rate and Payment term may be filled (§4.7) */
      set('rate_card', term === 'package' ? 'auto' : 'opt'); set('payment_term', 'opt');
      if (term === 'package') { set('package_id', 'req'); set('package_units', 'req'); }
    } else {
      out.crossesQt = fromSort < qtSort;
      out.qt = out.crossesQt || qtGaps(state, deal).length > 0;
      if (out.qt) {
        /* Confirm QT (§4.7 · §4.11): Pillar · Payment term (Package → the package) · Rate card (0 is fine · the package sets it · Free needs none) ·
           Gencode cost > 0 → Gencode days · Asset · Expediting · Post due */
        set('pillar', 'req'); set('payment_term', 'req');
        if (term === 'package') { set('package_id', 'req'); set('package_units', 'req'); set('rate_card', 'auto'); }
        else set('rate_card', term === 'free' ? 'opt' : 'req');
        set('gencode_expense', 'opt');
        if (num(v.gencode_expense) > 0) { set('gencode_period', 'req'); set('gencode_start_date', 'opt'); }
        set('asset_fee', 'opt'); set('expediting_fee', 'opt'); set('expected_post_date', 'opt');
      }
    }
    /* §4.9 — the steps a forward move passes: each gets a date (Contacted is offered, not asked) */
    const between = R.stepsOf(L).filter(s => s.active !== false && !R.isCancelStep(s) && s.sort_order > fromSort && s.sort_order < to.sort_order);
    out.contacted = between.find(s => s.sub_status === 'Contacted' && !R.requiredInPlan(s, plan)) || null;
    if (R.isPostStep(to)) {
      /* §4.14 — to Post: the planned drafts not done (Draft 2 / 3) are Done on <date> or Not needed · Approve has its own date · the posted link(s) */
      const base = R.planOf(deal);
      out.drafts = between.filter(s => R.draftNo(s) >= 2 && R.draftNo(s) <= base.drafts && isBlank(deal[s.date_field])).map(s => R.draftNo(s));
      out.approve = between.some(R.isApproveStep);
      out.skipped = between.filter(s => R.requiredInPlan(s, base) && !R.isApproveStep(s) && !out.drafts.includes(R.draftNo(s)));
      out.post = !deal.is_legacy;
      if (out.approve) set('approve_date', 'req');
      if (out.post) set('posts', 'req');
    } else out.skipped = between.filter(s => R.requiredInPlan(s, plan));
    /* §4.12 — Brief link / Script link when the move reaches or passes Brief / Script */
    const brief = R.stepsOf(L).find(isBriefStep), script = R.stepsOf(L).find(R.isScriptStep);
    if (brief && brief.sort_order > fromSort && brief.sort_order <= to.sort_order) set('link_brief', 'opt');
    if (script && script.sort_order > fromSort && script.sort_order <= to.sort_order) set('script_link', 'opt');
    /* §4.13 — Draft n: its notes */
    if (R.draftNo(to)) { out.notesDraft = R.draftNo(to); set('notes', 'opt'); }
    /* §4.15 — Next expected (the target's only; none for Post) */
    if (!R.isPostStep(to)) {
      out.next = nextExpected(state, to, plan);
      out.next.forEach(x => set(x.field, x.req ? 'req' : 'opt'));
      const k = R.draftNo(to), without = planAfter(state, deal, to, Object.assign({}, f, { nextRound: false }));
      if (k && without.drafts === k && k < R.MAX_DRAFTS) out.nextRound = { k: k + 1, on: !!f.nextRound };
    }
    return out;
  }
  /* what is required and missing on the deal itself (no form) — drag & drop moves at once only when this is empty (§4.9) */
  function missingRequired(state, deal, toSub) {
    const req = stageRequirements(state, deal, toSub, {}), F = req.fields, v = req.v, out = [];
    if (req.kind !== 'forward') return [req.kind];
    if (req.skipped.length || req.drafts.length || req.approve) out.push('steps');
    if (F.pillar === 'req' && isBlank(v.pillar)) out.push('pillar');
    if (F.payment_term === 'req' && !R.isTerm(R.termOf(v))) out.push('payment_term');
    if (F.package_id === 'req' && !R.packageById(state, v.package_id)) out.push('package_id');
    if (F.rate_card === 'req' && isBlank(v.rate_card)) out.push('rate_card');
    if (F.gencode_period === 'req' && isBlank(v.gencode_period)) out.push('gencode_period');
    req.next.forEach(x => { if (x.req && isBlank(v[x.field])) out.push(x.field); });
    if (req.post) { const ps = R.postsOf(state, deal.deal_id); if (!ps.length || !ps.every(R.postDone)) out.push('posts'); }
    return out;
  }

  /* ===================== the checks of a move ===================== */
  /* the dates a forward move writes, in order: [Contacted] · the steps passed · [Draft 2 / 3 done] · [Approve] — {name, field, date, given} */
  function stepDates(state, deal, req, f) {
    const L = state.lookups, out = [], given = k => !!f.steps && has(f.steps, k);
    const at = (s, d) => (given(s.sub_status) ? f.steps[s.sub_status] : d);
    if (req.contacted && f.alsoContacted) out.push({ name: req.contacted.sub_status, step: req.contacted, field: `step:${req.contacted.sub_status}`, date: has(f, 'contactedDate') ? f.contactedDate : at(req.contacted, f.date), given: has(f, 'contactedDate') || given(req.contacted.sub_status) });
    const extra = R.isPostStep(req.to) ? req.drafts.filter(k => !f.drafts || f.drafts[k] === 'done').map(k => R.stepsOf(L).find(s => R.draftNo(s) === k)).filter(Boolean) : [];
    req.skipped.concat(extra).sort((a, b) => a.sort_order - b.sort_order).forEach(s => out.push({ name: s.sub_status, step: s, field: `step:${s.sub_status}`, date: at(s, f.date), given: given(s.sub_status) }));
    if (req.approve) { const ap = R.stepsOf(L).find(R.isApproveStep); out.push({ name: ap.sub_status, step: ap, field: 'approve_date', date: has(f, 'approveDate') ? f.approveDate : at(ap, f.date), given: has(f, 'approveDate'), approve: true }); }
    return out;
  }
  /* §5.2 — before moving a deal to another stage · → { errs, warns, infos, req } (req = stageRequirements) */
  function checkMove(state, deal, toSub, opts) {
    const f = opts || {}, errs = [], warns = [], infos = [];
    const L = state.lookups, req = stageRequirements(state, deal, toSub, f), to = req.to, v = req.v, F = req.fields, td = f.today || R.todayISO();
    const out = () => ({ errs, warns, infos, req });
    if (!to) { errs.push(issue('to', M.moveStepUnknown)); return out(); }
    if (R.campaignCancelled(state, deal.campaign_id)) errs.push(issue('to', M.campaignCancelledEdit));
    if (to.active === false) errs.push(issue('to', M.moveStepInactive));
    if (req.kind === 'same') errs.push(issue('to', M.moveSame));
    if (!isISODate(f.date)) errs.push(issue('date', M.moveDateRequired));
    if (R.looksSensitive(f.note)) errs.push(issue('note', M.sensitive));
    if (R.looksSensitive(f.cancelReason)) errs.push(issue('cancel_reason', M.sensitive));
    const note = trim(f.note), plan = R.planOf(deal), k = R.draftNo(to);
    /* CR-02 §4.2 — Draft k beyond the plan: the round is added with the move (ticked) */
    if ((req.kind === 'forward' || req.kind === 'back') && k && k > plan.drafts) {
      if (!f.addRound) errs.push(issue('to', M.moveDraftNotInPlan(k, plan.drafts), 'add_round'));
      else infos.push(issue('to', M.moveAddsRound(plan.drafts, k)));
    }
    if (req.kind === 'leaveCancel') {
      const prev = R.stepBeforeCancel(state, deal);
      if (prev) { if (toSub !== prev) errs.push(issue('to', M.moveLeaveCancelOnly(prev))); }
      else infos.push(issue('to', M.moveLeaveCancelUnknown));
      if (!note) errs.push(issue('note', M.moveLeaveCancelNote));
    } else if (req.kind === 'cancel') { if (!trim(f.cancelReason)) errs.push(issue('cancel_reason', M.moveCancelReason)); }
    else if (req.kind === 'back') { if (!note) errs.push(issue('note', M.moveBackNote)); }
    if (req.kind !== 'forward') return out();
    const LB = LABEL();
    /* §4.7 · §4.11 — Confirm QT details */
    if (F.pillar === 'req' && isBlank(v.pillar)) errs.push(issue('pillar', M.movePillarRequired, 'pillar'));
    if (F.payment_term === 'req' && !R.isTerm(R.termOf(v))) errs.push(issue('payment_term', M.moveTermRequired, 'term'));
    else if (!isBlank(v.payment_term) && !R.isTerm(v.payment_term)) errs.push(issue('payment_term', M.termInvalid));
    if (F.package_id === 'req') {
      const p = R.packageById(state, v.package_id), units = Number(v.package_units);
      if (!p || p.kol_id !== deal.kol_id) errs.push(issue('package_id', M.packageRequired, 'package'));
      else if (!Number.isInteger(units) || units < 1) errs.push(issue('package_units', M.packageUnits));
      else {
        const st = R.packageStatus(state, p, td), own = deal.package_id === p.package_id, left = R.packageRemaining(state, p, deal.deal_id);
        if (!own && (st === 'archived' || st === 'expired')) errs.push(issue('package_id', M.packageInactive));
        else if (R.pillarStepReached(L, toSub) && units > left) errs.push(issue('package_id', M.packageNotEnough(Math.max(0, left)), 'package_left'));
      }
    }
    if (F.rate_card === 'req' && isBlank(v.rate_card)) errs.push(issue('rate_card', M.moveRateRequired, 'rate'));
    MONEY_FORM.forEach(x => { if (F[x] && F[x] !== 'auto' && !isBlank(v[x]) && (isNaN(v[x]) || Number(v[x]) < 0)) errs.push(issue(x, M.moveMoney(LB[x]))); });
    if (F.gencode_period === 'req') {
      if (isBlank(v.gencode_period)) errs.push(issue('gencode_period', M.moveGencodeDays, 'gencode'));
      else if (!Number.isInteger(Number(v.gencode_period)) || Number(v.gencode_period) < 1) errs.push(issue('gencode_period', M.moveDays));
    }
    if (F.gencode_start_date && !isBlank(v.gencode_start_date) && !isISODate(v.gencode_start_date)) errs.push(issue('gencode_start_date', M.dateInvalid(LB.gencode_start_date)));
    /* §4.12 — links */
    ['link_brief', 'script_link'].forEach(x => { if (F[x] && !isBlank(v[x]) && !isHttps(v[x])) errs.push(issue(x, M.linkHttps)); });
    /* §4.15 — next expected: the required one · never before the move date · after the Post due only warns */
    const moveDate = f.date, postDue = v.expected_post_date;
    /* (a date the deal already had is only checked for being there — the ones typed or changed in the form are checked against the move date) */
    const given = x => (x === 'expected_post_date' ? has(f, 'postDue') : !!f.expected && has(f.expected, x)) && (v[x] || null) !== (deal[x] || null);   // typed / changed in the form (a date the deal already had, shown as it is, never blocks)
    const expField = (x, required) => {
      const val = v[x];
      if (isBlank(val)) { if (required) errs.push(issue(x, x === 'expected_draft1_date' ? M.moveExpectedDraft1 : M.dateInvalid(LB[x]), 'expected')); return; }
      if (!isISODate(val)) { errs.push(issue(x, M.dateInvalid(LB[x]))); return; }
      if (given(x) && isISODate(moveDate) && val < moveDate) { errs.push(issue(x, M.moveExpectedBefore, 'expected_before')); return; }
      if (x !== 'expected_post_date' && isISODate(postDue) && val > postDue) warns.push(issue(x, M.moveExpectedAfterDue(dmy(postDue).slice(0, 5))));
    };
    req.next.forEach(x => expField(x.field, x.req));
    if (F.expected_post_date && !req.next.some(x => x.field === 'expected_post_date') && has(f, 'postDue')) expField('expected_post_date', false);
    /* §4.9 · §4.14 — the dates of the steps passed: given, in order, none in the future · the move's date not before them */
    const dates = stepDates(state, deal, req, f);
    let prev = null;
    dates.forEach(x => {
      if (!isISODate(x.date)) { errs.push(issue(x.field, x.approve ? M.moveApproveDate : M.moveStepDate(x.name))); return; }
      if (x.given && x.date > td) errs.push(issue(x.field, M.moveStepFuture(x.name)));
      if (prev && x.date < prev.date) errs.push(issue(x.field, x.approve && R.draftNo(prev.step) ? M.moveApproveOrder(R.draftNo(prev.step), dmy(prev.date).slice(0, 5)) : M.moveStepsOrder(prev.name, x.name)));
      prev = x;
    });
    if (req.approve) {
      /* the approve date is not before the last draft already done */
      const ap = dates.find(x => x.approve), lastDone = R.stepsOf(L).filter(s => R.draftNo(s) && R.draftNo(s) <= req.plan.drafts && !dates.some(x => x.step === s) && isISODate(deal[s.date_field])).pop();
      if (ap && isISODate(ap.date) && lastDone && ap.date < deal[lastDone.date_field] && !errs.some(e => e.field === 'approve_date')) errs.push(issue('approve_date', M.moveApproveOrder(R.draftNo(lastDone), dmy(deal[lastDone.date_field]).slice(0, 5))));
    }
    const last = dates[dates.length - 1];
    if (last && isISODate(last.date) && isISODate(moveDate) && moveDate < last.date) errs.push(issue('date', R.isPostStep(to) && last.approve ? M.movePostBeforeApprove : M.moveDateBeforeSteps));
    if (f.drafts && R.isPostStep(to)) req.drafts.forEach(n => { if (f.drafts[n] === 'done' && req.drafts.some(j => j < n && f.drafts[j] !== 'done')) errs.push(issue(`step:Draft ${n}`, M.moveDraftDone(n))); });
    if (!f.steps && (req.skipped.length || req.drafts.length || req.approve)) {   /* Move to… for many deals (no dialog): the steps passed are marked done that day */
      const old = R.skippedSteps(state, deal, toSub, f);
      if (old.length) warns.push(issue('to', M.moveAutoDone(isISODate(f.date) ? dmy(f.date).slice(0, 5) : '', old.map(s => s.sub_status).join(', ')), 'auto_done'));
    }
    /* §4.14 — Post: the posted link(s) (https · not saved in another deal) · a post date not in the future */
    if (req.post) {
      if (f.posts) {
        const done = R.postsOf(state, deal.deal_id).filter(R.postDone);
        if (!f.posts.length && !done.length) errs.push(issue('posts', M.movePostLink, 'posts'));   // a post already posted is enough
        const seen = new Map();
        f.posts.forEach((r, i) => {
          const fld = `post${i}_link`;
          if (!r.post_id && !r.account_id) errs.push(issue(`post${i}_account`, M.postAccountRequired(M.postN(i + 1))));
          if (isBlank(r.link)) { errs.push(issue(fld, M.movePostLink, 'posts')); return; }
          if (!isHttps(r.link)) { errs.push(issue(fld, M.linkHttps)); return; }
          const key = R.normLink(r.link);
          if (seen.has(key)) { errs.push(issue(fld, M.postDupInDeal(M.postN(i + 1), seen.get(key) + 1))); return; }
          seen.set(key, i);
          const other = state.deal_posts.find(p => p.deal_id !== deal.deal_id && p.post_link && R.normLink(p.post_link) === key);
          if (other) errs.push(issue(fld, M.postDup(M.postN(i + 1), other.deal_id, ((R.kolById(state, (state.deals.find(x => x.deal_id === other.deal_id) || {}).kol_id) || {}).display_name) || '')));
        });
        if (isISODate(moveDate) && moveDate > td) errs.push(issue('date', M.movePostFuture));
      } else {
        const posts = R.postsOf(state, deal.deal_id);
        if (!posts.length) errs.push(issue('to', M.moveNoPosts));
        else { const bad = posts.filter(p => !R.postDone(p)).length; if (bad) errs.push(issue('to', M.movePostsIncomplete(bad))); }
      }
    }
    /* §4.13 — the draft's notes */
    if (req.notesDraft && f.notes) R.validateStepNote(f.notes).errs.forEach(e => errs.push(issue('note_' + e.field, e.msg)));
    return out();
  }

  /* ===================== the move itself (state is not touched — the caller adds what comes back) ===================== */
  /* ctx: { now, logId, quoteId, eventId, user, postId() } → { deal, log (the move's), logs (every log, in order), quote | null, event (plan) | null, events,
     posts (the deal's posts after, or null when they did not change), note (a step_notes record, or null) } */
  function applyMove(state, deal, toSub, opts, ctx) {
    const f = opts || {}, L = state.lookups, req = stageRequirements(state, deal, toSub, f), to = req.to, v = req.v;
    const d = Object.assign({}, deal, { sub_status: toSub, status: to.status });
    const stamp = (ctx.now || new Date()).toISOString();
    let eid = ctx.eventId || 0, lid = ctx.logId || 0;
    const ev = () => eid++;
    const evCtx = () => ({ eventId: ev(), now: ctx.now, user: ctx.user });
    const forward = req.kind === 'forward';
    /* the plan (a round added · the next round · drafts Not needed) */
    const planBefore = R.planOf(deal), planNow = forward || req.kind === 'back' ? req.plan : planBefore;
    let event = null;
    if (planNow.drafts !== planBefore.drafts) { d.draft_rounds = planNow.drafts; event = R.planEvent(deal, planNow, evCtx()); }
    /* the values of the form */
    let pillarEv = null, termEv = null;
    if (forward) {
      if (!isBlank(v.pillar) && (deal.pillar || null) !== v.pillar) { d.pillar = v.pillar; pillarEv = R.fieldChange(deal, 'pillar', v.pillar, evCtx()).event; }
      const t = R.isTerm(v.payment_term) ? v.payment_term : null;
      if (t && R.termOf(deal) !== t) { d.payment_term = t; termEv = R.termEvent(deal, t, evCtx()); }
      d.package_id = t === 'package' ? v.package_id || null : null;
      d.package_units = t === 'package' ? Number(v.package_units) || 1 : 1;
      if (t !== 'package') d.package_paid = false;
      const money = x => (isBlank(x) ? null : Number(x));
      if (has(f, 'rateCard') || t === 'package') d.rate_card = money(v.rate_card);
      COST_FORM.forEach(x => { if (f.costs && has(f.costs, x)) d[x] = x === 'gencode_start_date' ? v[x] || null : money(v[x]); });
      if (num(d.gencode_expense) > 0 && isBlank(d.gencode_start_date) && f.costs && has(f.costs, 'gencode_expense') && isISODate(v.expected_post_date)) d.gencode_start_date = v.expected_post_date;   // §4.11: Gencode start = Post due when left empty
      ['expected_post_date', 'link_brief', 'script_link'].concat(EXPECTED).forEach(x => { if (v[x] !== deal[x] && (has(f, 'postDue') || has(f, 'linkBrief') || has(f, 'scriptLink') || (f.expected && has(f.expected, x)))) d[x] = v[x] || null; });
    }
    /* the logs: [Contacted] · the steps passed (their dates) · [drafts done] · [Approve] · the move */
    const logs = [];
    let lastSub = deal.sub_status || null;
    const mkLog = (st, date, note) => { const l = { log_id: lid++, deal_id: deal.deal_id, from_sub_status: lastSub, status: st.status, sub_status: st.sub_status, effective_date: date,
      changed_at: stamp, changed_by: ctx.user || null, source: 'user', note: note || null }; logs.push(l); lastSub = st.sub_status; return l; };
    if (forward) stepDates(state, deal, req, f).forEach(x => {
      mkLog(x.step, x.date, x.given ? M.completedByMove : M.autoCompleted);
      if (x.step.date_field && (x.given || isBlank(d[x.step.date_field]))) d[x.step.date_field] = x.date;
    });
    if (to.date_field && isBlank(deal[to.date_field])) d[to.date_field] = f.date;
    if (R.isCancelStep(to)) d.cancel_reason = trim(f.cancelReason);
    else if (R.isCancelled(deal)) d.cancel_reason = null;
    const notes = [];
    if (R.isCancelStep(to)) notes.push(trim(f.cancelReason));
    if (trim(f.note)) notes.push(trim(f.note));
    const log = mkLog(to, f.date, notes.join(' · ') || null);
    /* a rate quote when the deal reaches Confirm QT with a rate (CR-07) — not for a package (its price is the package's) */
    let quote = null;
    if (forward && req.crossesQt && !isBlank(d.rate_card) && R.termOf(d) !== 'package') {
      const qtLog = logs.find(l => l.sub_status === QT) || log;
      const accs = [...new Set(R.postsOf(state, deal.deal_id).map(p => p.account_id).filter(Boolean))];
      quote = { quote_id: ctx.quoteId, kol_id: deal.kol_id, account_id: accs.length === 1 ? accs[0] : null, quoted_at: qtLog.effective_date, source: M.quoteFromDeal(deal.deal_id), source_row: null, note: null };
      R.COST_KEYS.forEach(x => { quote[x] = isBlank(d[x]) ? null : Number(d[x]); });
      quote.gencode_period = isBlank(d.gencode_period) ? null : Number(d.gencode_period);
    }
    /* posts: the posted links (Post) · a new Post due goes to the posts planned on the old one (or none) */
    const before = R.postsOf(state, deal.deal_id);
    let list = before.map(p => Object.assign({}, p)), postsChanged = false;
    if (forward && R.isPostStep(to) && f.posts) {
      const keep = new Set(f.posts.filter(r => r.post_id).map(r => r.post_id));
      list = list.filter(p => R.postDone(p) || keep.has(p.post_id));
      f.posts.forEach(r => {
        if (r.post_id) { const p = list.find(x => x.post_id === r.post_id); if (p) { p.post_link = trim(r.link) || p.post_link; if (isBlank(p.post_date)) p.post_date = f.date; } return; }
        const a = state.kol_accounts.find(x => x.account_id === r.account_id) || {};
        list.push(Object.assign(R.blankPost(deal.deal_id, r.account_id, a.platform || null, d.expected_post_date || null),
          { post_id: ctx.postId ? ctx.postId() : null, post_link: trim(r.link), post_date: f.date, metrics_source: null, metrics_updated_by: null }));
      });
      postsChanged = true;
    }
    if ((d.expected_post_date || null) !== (deal.expected_post_date || null)) list.forEach(p => {
      if (isBlank(p.post_date) && (isBlank(p.expected_post_date) || p.expected_post_date === deal.expected_post_date)) { p.expected_post_date = d.expected_post_date || null; postsChanged = true; }
    });
    /* one edit event for the values the move changed (pillar / term have their own) */
    let editEv = null;
    const fields = ['package_id', 'package_units', 'rate_card'].concat(COST_FORM, ['expected_post_date', 'link_brief', 'script_link'], EXPECTED.filter(x => x !== 'expected_post_date'));
    const changes = R.diffFields(deal, d, [...new Set(fields)]).concat(postsChanged ? R.diffPosts(before, list) : []);
    if (changes.length) editEv = R.editEvent(deal, changes, Object.assign(evCtx(), { note: null }), 'edit');
    /* §4.13 — the draft's notes */
    let rec = null, noteEv = null;
    if (forward && req.notesDraft && f.notes) {
      const key = R.draftKey(req.notesDraft), old = R.stepNoteOf(state, deal.deal_id, key);
      rec = R.stepNoteRecord(deal.deal_id, key, f.notes, { now: ctx.now, user: ctx.user });
      if (R.sameNote(old, rec) || (!old && R.stepNoteEmpty(rec))) rec = null;
      else noteEv = R.stepNoteEvent(deal.deal_id, key, old, rec, evCtx());
    }
    return { deal: d, log, logs, quote, event, events: [event, pillarEv, termEv, editEv, noteEv].filter(Boolean), posts: postsChanged ? list : null, note: rec };
  }

  /* ===================== §4.9 — a card dropped on a stage ===================== */
  /* → {kind: 'same' | 'instant' | 'dialog' | 'blocked', msg}: instant = one step forward (the next of the plan, or an optional step on the way) with
     nothing required missing (date = today) · dialog = the Move stage dialog on that target (back · Cancel · steps passed · something to fill) ·
     blocked = a cancelled Campaign · a switched-off step · Cancel → only its step before */
  function dropPlan(state, deal, toSub, today) {
    const L = state.lookups, to = R.stepOf(L, toSub), from = R.stepOf(L, deal.sub_status);
    const blocked = msg => ({ kind: 'blocked', msg });
    if (!to || deal.sub_status === toSub) return { kind: 'same' };
    if (R.campaignCancelled(state, deal.campaign_id)) return blocked(M.campaignCancelledEdit);
    if (to.active === false) return blocked(M.moveStepInactive);
    if (from && R.isCancelStep(from)) { const prev = R.stepBeforeCancel(state, deal); return prev && toSub !== prev ? blocked(M.moveLeaveCancelOnly(prev)) : { kind: 'dialog' }; }
    const nx = R.nextStep(L, deal), one = (nx.step && nx.step.sub_status === toSub) || nx.optional.some(s => s.sub_status === toSub);
    if (one && !missingRequired(state, deal, toSub).length) {
      const r = checkMove(state, deal, toSub, { date: today, today });
      if (!r.errs.length) return { kind: 'instant' };   // a warning (e.g. a date after the Post due the deal already had) does not stop it
    }
    return { kind: 'dialog' };
  }

  /* Campaign remaining before → after this move (only when it crosses into Confirm QT · null without a budget) — Total cost of the form */
  function moveBudget(state, deal, toSub, f) {
    const req = stageRequirements(state, deal, toSub, f);
    if (req.kind !== 'forward' || !req.crossesQt) return null;
    const c = state.campaigns.find(x => x.campaign_id === deal.campaign_id);
    if (!c || isBlank(c.budget_kol)) return null;
    const ctx = R.dealContext(state), committed = ctx.committedByCampaign.get(c.campaign_id) || 0, before = round2(Number(c.budget_kol) - committed);
    const v = req.v, total = R.COST_KEYS.reduce((a, x) => a + (isBlank(v[x]) || isNaN(v[x]) ? 0 : Number(v[x])), 0);
    return { before, after: round2(before - total), total };
  }

  return { stageRequirements, missingRequired, valuesOf, qtGaps, nextExpected, stepDates, checkMove, applyMove, dropPlan, moveBudget, planAfterMoveForm: planAfter };
})(KT.rules, KT.content));
