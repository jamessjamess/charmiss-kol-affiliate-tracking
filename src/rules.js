/* rules.js — pure business rules for KOL Tracker (no DOM, no storage). → KT.rules
   Every function takes plain data and returns plain data, so tests/test.html can check them. */
KT.rules = (function (C) {
  'use strict';
  const M = C.msg;
  const TZ = 'Asia/Bangkok';

  /* ===================== values, format, dates ===================== */
  const isBlank = v => v == null || (typeof v === 'string' && v.trim() === '');
  const trim = v => (v == null ? '' : String(v).trim());
  /* CR-08 §4.4 — free text must not carry an account or ID number: 10+ digits in a row once '-' and spaces are taken out (links are skipped) */
  const looksSensitive = v => !isBlank(v) && /\d{10,}/.test(String(v).replace(/https?:\/\/\S+/gi, '|').replace(/[-\s]/g, ''));
  const num = v => (isBlank(v) || isNaN(v)) ? 0 : Number(v);
  const fmtNum = n => (isBlank(n) || isNaN(n)) ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const baht = n => { const v = Number(n) || 0; return (v < 0 ? '-' : '') + '฿' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const dmy = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const todayISO = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: TZ });
  const isISODate = s => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  };
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  const weekStart = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
  /* timestamp (ISO, UTC) → 'dd/mm/yyyy HH:mm' in Bangkok time */
  const fmtDateTime = ts => {
    if (!ts) return '';
    const d = new Date(ts); if (isNaN(d)) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  };
  /* timestamp → 'YYYY-MM-DD' in Bangkok time */
  const dateOfTimestamp = ts => { if (!ts) return null; const d = new Date(ts); return isNaN(d) ? null : todayISO(d); };

  /* ===================== links (same results as KOL_Entry_Mockup.html) ===================== */
  const TRACKING_PARAMS = /^(utm_.*|is_from_webapp|sender_device|web_id|_r|_t|lang|igsh|igshid|mibextid|si|share_.*)$/i;
  /* compare links without tracking params; keep real params (e.g. facebook story.php?story_fbid=...) */
  const normLink = u => {
    try {
      const x = new URL(String(u).trim());
      [...x.searchParams.keys()].forEach(k => { if (TRACKING_PARAMS.test(k)) x.searchParams.delete(k); });
      const host = x.host.toLowerCase().replace(/^www\./, '');
      let path = x.pathname.replace(/\/+$/, '');
      if (host === 'tiktok.com' || host === 'm.tiktok.com') path = path.toLowerCase(); // full TikTok URLs are safe to lowercase; short links (vt./vm.) are case-sensitive
      const q = x.searchParams.toString();
      return host + path + (q ? '?' + q : '');
    } catch (e) { return String(u || '').trim(); }
  };
  /* TikTok video ID: the first 32 bits are the upload's unix timestamp */
  const tiktokDate = url => {
    const m = String(url || '').match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d{15,20})/i);
    if (!m) return null;
    try { const sec = Number(BigInt(m[1]) >> 32n); return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: TZ }); } catch (e) { return null; }
  };
  const isShortTiktok = url => /(vt|vm)\.tiktok\.com/i.test(String(url || ''));
  const handleFromLink = url => {
    const m = String(url || '').match(/(?:tiktok\.com\/@|instagram\.com\/|x\.com\/|twitter\.com\/)([A-Za-z0-9._-]+)/i);
    return m && !['reel', 'p', 'share', 'stories'].includes(m[1].toLowerCase()) ? m[1].toLowerCase() : '';
  };
  const platformFromLink = url => {
    const u = String(url || '').toLowerCase();
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('instagram.com')) return 'Instagram';
    if (u.includes('facebook.com') || u.includes('fb.com')) return 'Facebook';
    if (u.includes('x.com') || u.includes('twitter.com')) return 'X';
    if (u.includes('lemon8')) return 'Lemon8';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    return '';
  };
  const isHttpLink = s => /^https?:\/\/\S+$/i.test(trim(s));

  /* ===================== tier ===================== */
  const tierOf = (followers, tierRules) => {
    if (isBlank(followers) || isNaN(followers)) return '';
    const f = Number(followers);
    let t = '';
    [...(tierRules || [])].sort((a, b) => a.min_followers - b.min_followers).forEach(r => { if (f >= r.min_followers) t = r.tier; });
    return t;
  };

  /* ===================== costs & payment ===================== */
  const COST_KEYS = ['rate_card', 'gencode_expense', 'basket_fee', 'asset_fee', 'expediting_fee'];
  const totalCost = d => COST_KEYS.reduce((s, k) => s + num(d && d[k]), 0);
  const gencodeEndDate = d => (d && isISODate(d.gencode_start_date) && num(d.gencode_period) > 0)
    ? addDays(d.gencode_start_date, Math.round(num(d.gencode_period)) - 1) : null;
  const isCancelled = d => !!d && d.status === 'Cancel';
  /* paid_full → total · paid_50 only → half of total (estimate: the legacy files have no paid amounts) */
  const paidEstimate = d => (d.paid_full ? totalCost(d) : d.paid_50 ? totalCost(d) * 0.5 : 0);
  /* the furthest payment tick reached (Docs → 50% → Paid) */
  const PAYMENT_PROGRESS = ['none', 'docs_done', 'paid_50', 'paid_full'];
  const paymentProgress = d => (d.paid_full ? 'paid_full' : d.paid_50 ? 'paid_50' : d.docs_done ? 'docs_done' : 'none');

  /* ===================== payment term (CR-02 §4.3) ===================== */
  const PAYMENT_TERMS = ['prepaid', 'split_50', 'postpaid', 'free'];
  const isTerm = t => PAYMENT_TERMS.includes(t);
  const termOf = d => (d && isTerm(d.payment_term) ? d.payment_term : null);
  /* the ticks that apply to a term (null = the old Docs → 50% → Paid track) */
  const paymentMilestones = term => (term === 'free' ? [] : term === 'prepaid' || term === 'postpaid' ? ['docs_done', 'paid_full'] : ['docs_done', 'paid_50', 'paid_full']);
  /* "reached Brief" = In process or Complete (Brief is the first In process step) */
  const reachedBrief = d => d.status === 'Inprocess' || d.status === 'Complete';
  const PAYMENT_STATES = ['paid', 'deposit_paid', 'overdue', 'due', 'not_due', 'free'];
  /* `today` is part of the signature for date-based terms later; the current terms only look at the stage.
     Cancelled deals owe nothing: they are Paid, Free or Not due. */
  function paymentState(d, today) {
    const t = termOf(d);
    if (d.paid_full) return 'paid';
    if (t === 'free') return 'free';
    if (d.status === 'Cancel') return 'not_due';
    if (t === 'prepaid' && reachedBrief(d)) return 'overdue';
    if (t === 'split_50' && !d.paid_50 && reachedBrief(d)) return 'overdue';
    if (t === 'split_50' && d.paid_50 && d.status !== 'Complete') return 'deposit_paid';
    if (d.status === 'Complete') return 'due';
    return 'not_due';
  }
  /* open = not closed yet (List or In process) */
  const isOpenDeal = d => d.status === 'List' || d.status === 'Inprocess';
  const termEvent = (deal, to, ctx) => ({ event_id: ctx.eventId, deal_id: deal.deal_id, type: 'payment_term', from: termOf(deal), to: to || null,
    changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null });
  /* KOL default changed → "Apply to n open deals?" · ctx: {eventId (first id), now, note} → {deals: changed copies, events} */
  function applyTermToOpenDeals(state, kolId, term, ctx) {
    const deals = [], events = [];
    state.deals.filter(d => d.kol_id === kolId && isOpenDeal(d) && termOf(d) !== (term || null)).forEach(d => {
      events.push(termEvent(d, term, Object.assign({}, ctx, { eventId: ctx.eventId + events.length })));
      deals.push(Object.assign({}, d, { payment_term: term || null }));
    });
    return { deals, events };
  }
  /* PIC changed in the table (CR-02 §4.7) → {deal, event}, or null when it is the same person.
     ctx: {eventId, now, note} — note 'undo' marks the change that reverses an earlier one */
  function picChange(deal, pic, ctx) {
    const from = deal.pic || null, to = pic || null;
    if (from === to) return null;
    return { deal: Object.assign({}, deal, { pic: to }),
      event: { event_id: ctx.eventId, deal_id: deal.deal_id, type: 'pic', from, to, changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null } };
  }
  /* several deals to one PIC (or back to each one's own value with `picOf`) → {deals, events}; unchanged deals are left out */
  function picChanges(deals, picOf, ctx) { return fieldChanges(deals, 'pic', picOf, ctx); }
  /* CR-03 §4.6 — pillar changed (bulk Set pillar, inline) → deal_events type 'pillar' */
  const pillarChange = (deal, pillar, ctx) => fieldChange(deal, 'pillar', pillar, ctx);
  const pillarChanges = (deals, pillarOf, ctx) => fieldChanges(deals, 'pillar', pillarOf, ctx);
  function fieldChange(deal, field, value, ctx) {
    const from = deal[field] || null, to = value || null;
    if (from === to) return null;
    return { deal: Object.assign({}, deal, { [field]: to }),
      event: { event_id: ctx.eventId, deal_id: deal.deal_id, type: field, from, to, changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null } };
  }
  function fieldChanges(deals, field, valueOf, ctx) {
    const out = { deals: [], events: [] };
    deals.forEach(d => {
      const r = fieldChange(d, field, typeof valueOf === 'function' ? valueOf(d) : valueOf, Object.assign({}, ctx, { eventId: ctx.eventId + out.events.length }));
      if (r) { out.deals.push(r.deal); out.events.push(r.event); }
    });
    return out;
  }
  /* CR-03 §4.6 — from Confirm QT on, a deal needs a pillar; imported (legacy) deals are only reminded */
  const pillarStepReached = (lookups, sub) => { const qt = stepOf(lookups, 'Confirm QT'), st = stepOf(lookups, sub); return !!st && !isCancelStep(st) && (!qt || st.sort_order >= qt.sort_order); };
  const needsPillar = (lookups, deal, toSub) => !deal.is_legacy && isBlank(deal.pillar) && pillarStepReached(lookups, toSub);
  /* a new deal that starts at Confirm QT or later must have a pillar */
  const checkNewDealPillar = (lookups, d) => ({ errs: needsPillar(lookups, d, d.sub_status) ? [issue('pillar', M.pillarRequired)] : [], warns: [], infos: [] });
  /* a new deal (New deal / Add to shortlist) must have a term before it is saved */
  const checkNewDealTerm = d => ({ errs: isTerm(d.payment_term) ? [] : [issue('payment_term', M.termRequired)], warns: [], infos: [] });

  /* ===================== Journey ===================== */
  const isActiveStep = s => s && s.active !== false;
  const stepsOf = lookups => [...((lookups && lookups.journey_steps) || [])].sort((a, b) => a.sort_order - b.sort_order);
  const stepOf = (lookups, sub) => stepsOf(lookups).find(s => s.sub_status === sub) || null;
  const statusOf = (lookups, sub) => (stepOf(lookups, sub) || {}).status || null;
  const isCancelStep = s => !!s && s.status === 'Cancel';
  const isPostStep = s => !!s && s.status === 'Complete';
  /* Approve Draft n ↔ date_field approved_draft{n}_date */
  const draftNo = s => { const m = /approved_draft(\d)_date/.exec((s && s.date_field) || ''); return m ? Number(m[1]) : null; };
  const postsOf = (state, dealId) => state.deal_posts.filter(p => p.deal_id === dealId);
  const postDone = p => !isBlank(p.post_date) && !isBlank(p.post_link);
  const postsPlanned = (state, dealId) => postsOf(state, dealId).length;
  const postsDone = (state, dealId) => postsOf(state, dealId).filter(postDone).length;
  const logsOf = (state, dealId) => state.deal_status_log.filter(l => l.deal_id === dealId).sort((a, b) => a.log_id - b.log_id);

  /* ---------- content plan (CR-02 §4.2): Brief → [Approve Script] → Approve Draft 1…draft_rounds → Post ---------- */
  const SCRIPT_STEP = 'Approve Script';
  const MAX_DRAFTS = 3;
  const isScriptStep = s => !!s && s.sub_status === SCRIPT_STEP;
  const planOf = d => {
    const n = Number(d && d.draft_rounds);
    return { drafts: Number.isInteger(n) && n >= 1 && n <= MAX_DRAFTS ? n : 1, script: !!(d && d.script_required) };
  };
  /* Script and Draft n belong to the plan only when planned; every other step always does */
  const inPlan = (s, plan) => { if (!s) return false; if (isScriptStep(s)) return plan.script; const n = draftNo(s); return n ? n <= plan.drafts : true; };
  /* planned Script / Draft steps are required for this deal even if the journey marks them optional */
  const requiredInPlan = (s, plan) => inPlan(s, plan) && (!s.is_optional || isScriptStep(s) || !!draftNo(s));
  /* the deal's journey without Cancel: active steps in its plan, plus the current step whatever it is */
  const planSteps = (lookups, deal) => {
    const plan = planOf(deal);
    return stepsOf(lookups).filter(s => !isCancelStep(s) && ((isActiveStep(s) && inPlan(s, plan)) || s.sub_status === deal.sub_status));
  };

  /* Stage column (CR-02 §4.5): one dot per planned step from Brief to Post — done (passed or current) · next · todo.
     List and Cancel have no dots. */
  function stageDots(lookups, deal) {
    if (deal.status !== 'Inprocess' && deal.status !== 'Complete') return [];
    const cur = stepOf(lookups, deal.sub_status), curSort = cur ? cur.sort_order : -Infinity, nx = nextStep(lookups, deal).step;
    return planSteps(lookups, deal).filter(s => s.status === 'Inprocess' || s.status === 'Complete')
      .map(s => ({ step: s, state: s.sort_order <= curSort ? 'done' : nx && s.sub_status === nx.sub_status ? 'next' : 'todo' }));
  }

  /* next = first active step after the current one that the plan requires; optional steps on the way are offered too */
  function nextStep(lookups, deal) {
    const cur = stepOf(lookups, deal.sub_status);
    if (cur && (isCancelStep(cur) || isPostStep(cur))) return { step: null, optional: [] };
    const plan = planOf(deal), curSort = cur ? cur.sort_order : -Infinity;
    const after = stepsOf(lookups).filter(s => isActiveStep(s) && !isCancelStep(s) && s.sort_order > curSort && inPlan(s, plan));
    const step = after.find(s => requiredInPlan(s, plan)) || null;
    const optional = after.filter(s => !requiredInPlan(s, plan) && (!step || s.sort_order < step.sort_order));
    return { step, optional };
  }
  function dueDate(state, deal) {
    const { step } = nextStep(state.lookups, deal);
    if (!step) return null;
    const n = draftNo(step);
    if (n) return deal[`expected_draft${n}_date`] || null;
    if (isPostStep(step)) {
      const pending = postsOf(state, deal.deal_id).filter(p => isBlank(p.post_date)).map(p => p.expected_post_date).filter(Boolean).sort();
      return pending[0] || null;
    }
    return null;
  }
  /* CR-07 §4.3 / §4.9 — a step's short name: Approve Draft 1 → Draft 1 · Approve Script → Script */
  const stepShort = sub => String(sub || '').replace(/^Approve\s+/, '');
  const isOverdue = (state, deal, today) => {
    const due = dueDate(state, deal);
    return !!due && due < today && (deal.status === 'List' || deal.status === 'Inprocess');
  };
  /* days since the latest log of the current step that carries a date */
  function daysInStep(state, deal, today) {
    const logs = logsOf(state, deal.deal_id);
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (l.sub_status !== deal.sub_status) break;
      const d = l.effective_date || (l.changed_at ? dateOfTimestamp(l.changed_at) : null);
      if (d) return dayDiff(today, d);
    }
    return null;
  }
  /* the step a deal was in right before it was cancelled (null = unknown, e.g. imported as Cancel) */
  function stepBeforeCancel(state, deal) {
    const logs = logsOf(state, deal.deal_id);
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (l.sub_status === 'Cancel' && l.from_sub_status && l.from_sub_status !== 'Cancel') return l.from_sub_status;
    }
    return null;
  }

  const issue = (field, msg, code) => (code ? { field, msg, code } : { field, msg });

  /* the plan a move leads to: opts.addRound lets a move to Approve Draft k (k > plan) raise draft_rounds to k */
  const planAfterMove = (deal, to, opts) => {
    const plan = planOf(deal), k = draftNo(to);
    return opts && opts.addRound && k && k > plan.drafts ? { drafts: k, script: plan.script } : plan;
  };
  /* §5.2 — checks before moving a deal to another SubStatus. opts: {date, note, cancelReason, addRound} */
  function checkMove(state, deal, toSub, opts = {}) {
    const errs = [], warns = [], infos = [];
    const L = state.lookups, to = stepOf(L, toSub), from = stepOf(L, deal.sub_status);
    if (!to) { errs.push(issue('to', M.moveStepUnknown)); return { errs, warns, infos }; }
    if (campaignCancelled(state, deal.campaign_id)) errs.push(issue('to', M.campaignCancelledEdit));
    if (!isActiveStep(to)) errs.push(issue('to', M.moveStepInactive));
    if (deal.sub_status === toSub) errs.push(issue('to', M.moveSame));
    if (!isISODate(opts.date)) errs.push(issue('date', M.moveDateRequired));
    if (looksSensitive(opts.note)) errs.push(issue('note', M.sensitive));
    if (looksSensitive(opts.cancelReason)) errs.push(issue('cancel_reason', M.sensitive));
    const note = trim(opts.note), plan = planOf(deal), after = planAfterMove(deal, to, opts), k = draftNo(to);
    /* CR-02 §4.2 — a step outside the plan: Draft k can be reached by adding rounds (max 3); Script is switched on in the plan first */
    if (!isCancelStep(to) && !(from && isCancelStep(from)) && deal.sub_status !== toSub) {
      if (k && k > plan.drafts) {
        if (!opts.addRound) errs.push(issue('to', M.moveDraftNotInPlan(k, plan.drafts), 'add_round'));
        else infos.push(issue('to', M.moveAddsRound(plan.drafts, k)));
      } else if (isScriptStep(to) && !plan.script) errs.push(issue('to', M.moveScriptNotInPlan));
    }
    if (from && isCancelStep(from)) {
      const prev = stepBeforeCancel(state, deal);
      if (prev) { if (toSub !== prev) errs.push(issue('to', M.moveLeaveCancelOnly(prev))); }
      else infos.push(issue('to', M.moveLeaveCancelUnknown));
      if (!note) errs.push(issue('note', M.moveLeaveCancelNote));
    } else if (isCancelStep(to)) {
      if (!trim(opts.cancelReason)) errs.push(issue('cancel_reason', M.moveCancelReason));
    } else {
      const fromSort = from ? from.sort_order : -Infinity;
      if (to.sort_order > fromSort) {
        const skipped = stepsOf(L).filter(s => isActiveStep(s) && requiredInPlan(s, after) && !isCancelStep(s) && s.sort_order > fromSort && s.sort_order < to.sort_order);
        if (skipped.length) warns.push(issue('to', M.moveSkip(skipped.map(s => s.sub_status).join(', '))));
      } else if (to.sort_order < fromSort && !note) {
        errs.push(issue('note', M.moveBackNote));
      }
    }
    if (isPostStep(to) && !deal.is_legacy) {
      const posts = postsOf(state, deal.deal_id);
      if (!posts.length) errs.push(issue('to', M.moveNoPosts));
      else { const bad = posts.filter(p => !postDone(p)).length; if (bad) errs.push(issue('to', M.movePostsIncomplete(bad))); }
    }
    const n = draftNo(to);
    if (n && isBlank(deal[`expected_draft${n}_date`])) infos.push(issue('to', M.moveNoExpectedDraft(n)));
    /* CR-03 §4.6 — the Move dialog has a Pillar field for this */
    if (isBlank(deal.pillar) && isBlank(opts.pillar) && pillarStepReached(state.lookups, toSub)) {
      if (deal.is_legacy) infos.push(issue('pillar', M.pillarNotSetInfo));
      else errs.push(issue('pillar', M.movePillarRequired, 'pillar'));
    }
    /* CR-10 §4.12 — from Confirm QT on a deal needs a payment term (the Move dialog has a field for it · imported deals are only reminded) */
    const fromSub = from && isCancelStep(from) ? stepBeforeCancel(state, deal) : deal.sub_status;   // leaving Cancel: where it was before
    if (!isTerm(termOf(deal)) && !isTerm(opts.paymentTerm) && fromSub && pillarStepReached(state.lookups, toSub) && !pillarStepReached(state.lookups, fromSub)) {   // crossing into Confirm QT
      if (deal.is_legacy) infos.push(issue('payment_term', M.termNotSetInfo));
      else errs.push(issue('payment_term', M.moveTermRequired, 'term'));
    }
    return { errs, warns, infos };
  }

  /* §5.2 — result of a move (does not touch state). ctx: {now: Date, logId, quoteId, eventId}
     returns {deal, log, quote|null, event|null}; the caller appends log/quote/event and replaces the deal.
     event = the plan change when opts.addRound raised draft_rounds */
  function applyMove(state, deal, toSub, opts, ctx) {
    const to = stepOf(state.lookups, toSub);
    const d = Object.assign({}, deal, { sub_status: toSub, status: to.status });
    const plan = planOf(deal), after = planAfterMove(deal, to, opts);
    let event = null;
    if (after.drafts !== plan.drafts) {
      d.draft_rounds = after.drafts;
      event = planEvent(deal, after, { eventId: ctx.eventId, now: ctx.now, user: ctx.user });
    }
    if (to.date_field && isBlank(deal[to.date_field])) d[to.date_field] = opts.date;
    if (isCancelStep(to)) d.cancel_reason = trim(opts.cancelReason);
    else if (isCancelled(deal)) d.cancel_reason = null;
    const notes = [];
    if (isCancelStep(to)) notes.push(trim(opts.cancelReason));
    if (trim(opts.note)) notes.push(trim(opts.note));
    const log = {
      log_id: ctx.logId, deal_id: deal.deal_id, from_sub_status: deal.sub_status || null,
      status: to.status, sub_status: toSub, effective_date: opts.date,
      changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, source: 'user',
      note: notes.join(' · ') || null,
    };
    let quote = null;
    if (toSub === 'Confirm QT' && !isBlank(deal.rate_card)) {
      const accs = [...new Set(postsOf(state, deal.deal_id).map(p => p.account_id).filter(Boolean))];
      quote = { quote_id: ctx.quoteId, kol_id: deal.kol_id, account_id: accs.length === 1 ? accs[0] : null, quoted_at: opts.date,
        source: M.quoteFromDeal(deal.deal_id), source_row: null, note: null };
      COST_KEYS.forEach(k => { quote[k] = isBlank(deal[k]) ? null : Number(deal[k]); });
      quote.gencode_period = isBlank(deal.gencode_period) ? null : Number(deal.gencode_period);
    }
    /* a pillar picked in the Move dialog is saved with the move (and logged) */
    let pillarEvent = null, termEv = null;
    if (isBlank(deal.pillar) && !isBlank(opts.pillar)) {
      d.pillar = opts.pillar;
      pillarEvent = fieldChange(deal, 'pillar', opts.pillar, { eventId: (ctx.eventId || 0) + (event ? 1 : 0), now: ctx.now, user: ctx.user }).event;
    }
    /* CR-10 §4.12 — a payment term picked in the Move dialog is saved with the move (and logged) */
    if (!isTerm(termOf(deal)) && isTerm(opts.paymentTerm)) {
      d.payment_term = opts.paymentTerm;
      termEv = termEvent(deal, opts.paymentTerm, { eventId: (ctx.eventId || 0) + (event ? 1 : 0) + (pillarEvent ? 1 : 0), now: ctx.now, user: ctx.user });
    }
    return { deal: d, log, quote, event, events: [event, pillarEvent, termEv].filter(Boolean) };
  }

  /* ---------- changing the content plan from the drawer (CR-02 §4.2) ---------- */
  const planValue = p => ({ draft_rounds: p.drafts, script_required: p.script });
  function planEvent(deal, next, ctx) {
    return { event_id: ctx.eventId, deal_id: deal.deal_id, type: 'plan', from: planValue(planOf(deal)), to: planValue(next),
      changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null };
  }
  /* what the [−] [+] and Script toggle may do: rounds already passed cannot be removed, Script cannot be switched off once passed.
     "passed" = the current step (or the step before Cancel) is at or after it, or its approved date is filled.
     A Cancel whose step before is unknown keeps the plan as it is. */
  function planLimits(state, deal) {
    const L = state.lookups, plan = planOf(deal);
    let cur = stepOf(L, deal.sub_status);
    if (cur && isCancelStep(cur)) {
      const prev = stepBeforeCancel(state, deal);
      if (!prev) return { minDrafts: plan.drafts, maxDrafts: MAX_DRAFTS, scriptLocked: plan.script };
      cur = stepOf(L, prev);
    }
    const curSort = cur ? cur.sort_order : -Infinity;
    let minDrafts = 1, scriptLocked = false;
    stepsOf(L).forEach(s => {
      const n = draftNo(s);
      if (n && n <= plan.drafts && (s.sort_order <= curSort || !isBlank(deal[`approved_draft${n}_date`]))) minDrafts = Math.max(minDrafts, n);
      if (isScriptStep(s) && plan.script && s.sort_order <= curSort) scriptLocked = true;
    });
    return { minDrafts, maxDrafts: MAX_DRAFTS, scriptLocked };
  }
  /* next: {drafts, script} */
  function checkPlan(state, deal, next) {
    const errs = [], lim = planLimits(state, deal), plan = planOf(deal);
    if (!Number.isInteger(next.drafts) || next.drafts < 1 || next.drafts > MAX_DRAFTS) errs.push(issue('draft_rounds', M.planDraftsRange(MAX_DRAFTS)));
    else if (next.drafts < lim.minDrafts) errs.push(issue('draft_rounds', M.planDraftsPassed(lim.minDrafts)));
    if (plan.script && !next.script && lim.scriptLocked) errs.push(issue('script_required', M.planScriptPassed));
    return { errs, warns: [], infos: [] };
  }
  /* → {deal, event} (no change → event null) · ctx: {eventId, now, note} */
  function applyPlan(deal, next, ctx) {
    const plan = planOf(deal);
    if (plan.drafts === next.drafts && plan.script === !!next.script) return { deal, event: null };
    const to = { drafts: next.drafts, script: !!next.script };
    return { deal: Object.assign({}, deal, planValue(to)), event: planEvent(deal, to, ctx) };
  }

  /* ===================== Campaign & Phase ===================== */
  function validateCampaign(state, draft) {
    const errs = [], warns = [], infos = [];
    const name = trim(draft.campaign_name);
    if (looksSensitive(draft.note)) errs.push(issue('note', M.sensitive));
    if (!name) errs.push(issue('campaign_name', M.campaignNameRequired));
    else {
      const dup = state.campaigns.find(c => c.campaign_id !== draft.campaign_id && trim(c.campaign_name).toLowerCase() === name.toLowerCase());
      if (dup) errs.push(issue('campaign_name', M.campaignNameDup(dup.campaign_name)));
    }
    return { errs, warns, infos };
  }
  const canDeleteCampaign = (state, campaignId) => state.phases.filter(p => p.campaign_id === campaignId).length === 0;
  /* CR-05 §3: new Campaigns / Phases get internal IDs CMP-0001 … / PHS-0001 … (never shown; the seed's CH, CH-P1 … stay) */
  const nextCode = (prefix, list, key) => prefix + String(list.reduce((m, x) => { const r = new RegExp('^' + prefix + '(\\d+)$').exec(x[key] || ''); return r ? Math.max(m, Number(r[1])) : m; }, 0) + 1).padStart(4, '0');
  const campaignIdFor = (name, campaigns) => nextCode('CMP-', campaigns, 'campaign_id');
  const phaseIdFor = (campaignId, phases) => nextCode('PHS-', phases, 'phase_id');
  /* §9.3 default Phase: the latest one that today falls in, else the one with the latest start_date */
  function defaultPhaseId(state, today) {
    const byStart = [...state.phases].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    const now = byStart.find(p => p.start_date <= today && today <= p.end_date);
    return (now || byStart[0] || {}).phase_id || null;
  }
  /* CR-03: a deal belongs to a Campaign — the default is the Campaign of the default Phase */
  const defaultCampaignId = (state, today) => { const p = state.phases.find(x => x.phase_id === defaultPhaseId(state, today)); return p ? p.campaign_id : ((state.campaigns[0] || {}).campaign_id || null); };

  /* CR-02 §4.8 — status from the dates (never typed) */
  const PHASE_STATUSES = ['ongoing', 'not_started', 'complete'];
  function phaseStatus(phase, today) {
    if (!phase || !phase.start_date || today < phase.start_date) return 'not_started';
    if (phase.end_date && today > phase.end_date) return 'complete';
    return 'ongoing';
  }
  /* any Phase on going → On going · all not started → Not started · all ended → Complete · ended + not started (between Phases) → On going */
  function campaignStatus(phases, today) {
    const st = phases.map(p => phaseStatus(p, today));
    if (!st.length || st.every(s => s === 'not_started')) return 'not_started';
    if (st.every(s => s === 'complete')) return 'complete';
    return 'ongoing';
  }
  /* by start, then end; Phases with the same dates keep the order they were made (CR-06 §4.2 — the same order as their Phase number) */
  const sortPhases = phases => [...phases].sort((a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999'))
    || String(a.end_date || '9999').localeCompare(String(b.end_date || '9999')));
  /* CR-05 §4.7 — a Campaign may be put On hold or Cancelled (status_override); that wins over its dates */
  const CAMPAIGN_STATUSES = ['ongoing', 'not_started', 'on_hold', 'complete', 'cancelled'];
  const CAMPAIGN_OVERRIDES = ['on_hold', 'cancelled'];
  const campaignEffectiveStatus = (campaign, phases, today) => (campaign && CAMPAIGN_OVERRIDES.includes(campaign.status_override) ? campaign.status_override : campaignStatus(phases, today));
  /* a Campaign that takes no new deal: On hold · Cancelled → the message, else null */
  function campaignBlocksNew(state, campaignId) {
    const c = state.campaigns.find(x => x.campaign_id === campaignId); if (!c) return null;
    return c.status_override === 'on_hold' ? M.campaignOnHold(c.campaign_name) : c.status_override === 'cancelled' ? M.campaignCancelledNew(c.campaign_name) : null;
  }
  const campaignCancelled = (state, campaignId) => { const c = state.campaigns.find(x => x.campaign_id === campaignId); return !!c && c.status_override === 'cancelled'; };
  /* putting a Campaign on hold / cancelling it needs a reason */
  function validateCampaignStatus(to, reason) {
    const errs = [];
    if (to && !CAMPAIGN_OVERRIDES.includes(to)) errs.push(issue('status', M.campaignStatusUnknown));
    if (to && !trim(reason)) errs.push(issue('status_reason', M.campaignStatusReason));
    return { errs, warns: [], infos: [] };
  }
  /* On going (end soonest first) → Not started (start soonest first) → On hold → Complete (latest end first) → Cancelled · ties: start, then name */
  function sortCampaigns(campaigns, phases, today) {
    const RANK = { ongoing: 0, not_started: 1, on_hold: 2, complete: 3, cancelled: 4 };
    const info = new Map(campaigns.map(c => {
      const ps = phases.filter(p => p.campaign_id === c.campaign_id);
      const starts = ps.map(p => p.start_date).filter(Boolean).sort(), ends = ps.map(p => p.end_date).filter(Boolean).sort();
      return [c.campaign_id, { st: campaignEffectiveStatus(c, ps, today), start: starts[0] || '9999', end: ends[ends.length - 1] || '9999' }];
    }));
    return [...campaigns].sort((a, b) => {
      const x = info.get(a.campaign_id), y = info.get(b.campaign_id);
      if (x.st !== y.st) return RANK[x.st] - RANK[y.st];
      const c = x.st === 'ongoing' ? x.end.localeCompare(y.end) : x.st === 'not_started' || x.st === 'on_hold' ? x.start.localeCompare(y.start) : y.end.localeCompare(x.end);
      return c || x.start.localeCompare(y.start) || String(a.campaign_name).localeCompare(String(b.campaign_name));
    });
  }
  /* every Phase in display order: Campaigns by sortCampaigns, then Phases by start date (used for groups and dropdowns) */
  const orderedPhases = (campaigns, phases, today) =>
    sortCampaigns(campaigns, phases, today).flatMap(c => sortPhases(phases.filter(p => p.campaign_id === c.campaign_id)));

  /* ===================== KOL Master ===================== */
  const KOL_STATUSES = ['Active', 'Inactive', 'Blacklist'];
  const GENDERS = ['Female', 'Male', 'Other'];
  const CONTACT_CHANNELS = ['LINE', 'TikTok', 'Instagram', 'Facebook', 'Email', 'Agency', 'Other'];
  const ACCOUNT_FIELDS = ['platform', 'handle', 'profile_link', 'followers'];
  const PRICE_KEYS = ['rate_card', 'gencode_expense', 'gencode_period', 'basket_fee', 'asset_fee', 'expediting_fee'];

  const kolById = (state, id) => state.kol_master.find(k => k.kol_id === id) || null;
  const accountsOfKol = (state, kolId) => state.kol_accounts.filter(a => a.kol_id === kolId);
  const dealsOfKol = (state, kolId) => state.deals.filter(d => d.kol_id === kolId);
  const postsOnAccount = (state, accountId) => state.deal_posts.filter(p => p.account_id === accountId).length;
  const maxFollowers = accounts => {
    const f = accounts.map(a => a.followers).filter(v => !isBlank(v) && !isNaN(v)).map(Number);
    return f.length ? Math.max(...f) : null;
  };
  /* §4 latest price: newest quoted_at first, undated (null) last; ties → highest quote_id */
  const idNum = id => parseInt(String(id).replace(/\D/g, ''), 10) || 0;
  const sortQuotes = qs => [...qs].sort((a, b) => {
    if ((a.quoted_at || null) !== (b.quoted_at || null)) {
      if (!a.quoted_at) return 1;
      if (!b.quoted_at) return -1;
      return a.quoted_at < b.quoted_at ? 1 : -1;
    }
    return idNum(b.quote_id) - idNum(a.quote_id);
  });
  const quotesOfKol = (state, kolId) => sortQuotes(state.kol_rate_quotes.filter(q => q.kol_id === kolId));
  const latestQuote = (state, kolId) => quotesOfKol(state, kolId)[0] || null;
  /* the values used to prefill a new deal come from the latest quote that has a rate card */
  const latestPricedQuote = (state, kolId) => quotesOfKol(state, kolId).find(q => !isBlank(q.rate_card)) || null;
  const prefillFromQuote = q => { const o = {}; if (q) PRICE_KEYS.forEach(k => { if (!isBlank(q[k])) o[k] = Number(q[k]); }); return o; };
  /* average total of this KOL's earlier deals (not Cancel, total > 0) */
  function kolDealAverage(state, kolId, excludeDealId) {
    const t = dealsOfKol(state, kolId).filter(d => !isCancelled(d) && d.deal_id !== excludeDealId).map(totalCost).filter(v => v > 0);
    return { avg: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null, n: t.length };
  }
  /* one pass over the data for list screens (911 KOLs) */
  function kolIndex(state) {
    const group = (arr, key) => { const m = new Map(); arr.forEach(x => { const k = x[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
    const quotes = group(state.kol_rate_quotes, 'kol_id');
    quotes.forEach((v, k) => quotes.set(k, sortQuotes(v)));
    const postsByAccount = new Map();
    state.deal_posts.forEach(p => postsByAccount.set(p.account_id, (postsByAccount.get(p.account_id) || 0) + 1));
    return { accounts: group(state.kol_accounts, 'kol_id'), deals: group(state.deals, 'kol_id'), quotes, postsByAccount,
      phases: new Map(state.phases.map(p => [p.phase_id, p])) };
  }
  /* latest Phase a KOL worked in (by Phase start date) — a deal counts in its primary Phase (CR-03 §4.2) */
  function latestPhaseOf(deals, phases, idx) {
    let best = null;
    deals.forEach(d => { const p = phases.get(((idx && idx.deal.get(d.deal_id)) || {}).primary); if (p && (!best || String(p.start_date) > String(best.start_date))) best = p; });
    return best;
  }

  /* §7.1 — draft: {kol_id, display_name, …, accounts: [{account_id, platform, handle, profile_link, followers, is_legacy}]}
     Accounts that are new or changed must be complete; untouched (legacy) accounts are left as they are. */
  function validateKol(state, draft) {
    const errs = [], warns = [], infos = [];
    const name = trim(draft.display_name), accounts = draft.accounts || [];
    if (!name) errs.push(issue('display_name', M.kolNameRequired));
    if (!accounts.length) errs.push(issue('accounts', M.kolNoAccount));
    if (draft.kol_status === 'Blacklist' && !trim(draft.status_reason)) errs.push(issue('status_reason', M.kolBlacklistReason));
    ['note', 'status_reason'].forEach(k => { if (looksSensitive(draft[k])) errs.push(issue(k, M.sensitive)); });
    if (!isBlank(draft.default_payment_term) && !isTerm(draft.default_payment_term)) errs.push(issue('default_payment_term', M.termInvalid));
    const stored = new Map(state.kol_accounts.map(a => [a.account_id, a]));
    accounts.forEach((a, i) => {
      const n = i + 1, f = k => `acc${i}_${k}`, handle = trim(a.handle);
      const orig = a.account_id ? stored.get(a.account_id) : null;
      const changed = !orig || ACCOUNT_FIELDS.some(k => trim(orig[k]) !== trim(a[k]));
      if (!changed) return;
      if (!a.platform) errs.push(issue(f('platform'), M.accPlatform(n)));
      if (!handle) errs.push(issue(f('handle'), M.accHandle(n)));
      else if (/\s/.test(handle) || handle.startsWith('@')) errs.push(issue(f('handle'), M.accHandleFormat(n)));
      if (isBlank(a.profile_link)) errs.push(issue(f('profile_link'), M.accLink(n)));
      else if (!isHttpLink(a.profile_link)) errs.push(issue(f('profile_link'), M.accLinkFormat(n)));
      if (isBlank(a.followers)) errs.push(issue(f('followers'), M.accFollowers(n)));
      else if (isNaN(a.followers) || Number(a.followers) < 0) errs.push(issue(f('followers'), M.accFollowersFormat(n)));
      if (a.platform && handle) {
        const twin = accounts.findIndex((b, j) => j !== i && b.platform === a.platform && trim(b.handle).toLowerCase() === handle.toLowerCase());
        if (twin >= 0) errs.push(issue(f('handle'), M.accDupInList(n, twin + 1)));
        const other = state.kol_accounts.find(x => x.kol_id !== draft.kol_id && x.platform === a.platform && trim(x.handle).toLowerCase() === handle.toLowerCase());
        if (other) errs.push(issue(f('handle'), M.accTaken(n, handle, a.platform, (kolById(state, other.kol_id) || {}).display_name, other.kol_id)));
      }
      if (!isBlank(a.profile_link)) {
        const h = handleFromLink(a.profile_link);
        if (h && handle && h !== handle.toLowerCase()) warns.push(issue(f('profile_link'), M.accLinkHandle(n, h, handle)));
        const p = platformFromLink(a.profile_link);
        if (p && a.platform && a.platform !== 'Other' && p !== a.platform) warns.push(issue(f('profile_link'), M.accLinkPlatform(n, p, a.platform)));
      }
    });
    if (draft.kol_id) {
      const keep = new Set(accounts.map(a => a.account_id).filter(Boolean));
      accountsOfKol(state, draft.kol_id).forEach(a => {
        if (keep.has(a.account_id)) return;
        const used = postsOnAccount(state, a.account_id);
        if (used) errs.push(issue('accounts', M.accDeleteUsed(a.handle, a.platform, used)));
      });
    }
    const dup = name && state.kol_master.find(k => k.kol_id !== draft.kol_id && trim(k.display_name).toLowerCase() === name.toLowerCase());
    if (dup) warns.push(issue('display_name', M.kolNameDup(dup.kol_id)));
    return { errs, warns, infos };
  }
  /* an account counts as legacy only while it stays untouched and incomplete */
  const accountComplete = a => !!a.platform && !isBlank(a.handle) && isHttpLink(a.profile_link) && !isBlank(a.followers) && !isNaN(a.followers);

  /* §7.2 — a rate quote typed by the user */
  function validateQuote(state, q) {
    const errs = [], warns = [], infos = [];
    if (!isISODate(q.quoted_at)) errs.push(issue('quoted_at', M.quoteDateInvalid));
    if (!trim(q.source)) errs.push(issue('source', M.quoteSourceRequired));
    const label = { rate_card: C.kol.qRate, gencode_expense: C.kol.qGencode, gencode_period: C.kol.qGencodeDays, basket_fee: C.kol.qBasket, asset_fee: C.kol.qAsset, expediting_fee: C.kol.qExpedite };
    PRICE_KEYS.forEach(k => { if (!isBlank(q[k]) && (isNaN(q[k]) || Number(q[k]) < 0)) errs.push(issue(k, M.quoteNumber(label[k]))); });
    if (PRICE_KEYS.every(k => isBlank(q[k])) && !trim(q.note)) errs.push(issue('rate_card', M.quoteEmpty));
    if (q.account_id && !state.kol_accounts.some(a => a.account_id === q.account_id && a.kol_id === q.kol_id)) errs.push(issue('account_id', M.quoteAccountOther));
    ['note', 'source'].forEach(k => { if (looksSensitive(q[k])) errs.push(issue(k, M.sensitive)); });
    return { errs, warns, infos };
  }

  /* §7.3 — a deal created from KOL Master starts at List / Shortlist with the KOL's PIC and the latest priced quote */
  const DEAL_TEMPLATE = {
    deal_id: null, campaign_id: null, legacy_phase_id: null, kol_id: null, pillar: null, status: null, sub_status: null,
    docs_done: false, docs_done_date: null, paid_50: false, paid_50_date: null, paid_full: false, paid_full_date: null,
    pic: null, rate_card: null, gencode_expense: null, gencode_period: null, gencode_start_date: null,
    basket_fee: null, asset_fee: null, expediting_fee: null, delivered: false, delivery_date: null,
    brief_date: null, expected_draft1_date: null, approved_draft1_date: null, expected_draft2_date: null, approved_draft2_date: null,
    expected_draft3_date: null, approved_draft3_date: null, expected_post_date: null, link_brief: null, cta: null,
    cancel_reason: null, remark: null, legacy_job_ids: [], source_record_ids: [], is_legacy: false,
    draft_rounds: 1, script_required: false, payment_term: null,
  };
  /* a new deal takes the KOL's default payment term (null = not set yet) */
  const kolTerm = (state, kolId) => { const k = kolById(state, kolId); return k && isTerm(k.default_payment_term) ? k.default_payment_term : null; };
  /* Shortlist if it is active, otherwise the first active step */
  const shortlistStep = lookups => { const s = stepOf(lookups, 'Shortlist'); return isActiveStep(s) ? s : stepsOf(lookups).find(x => isActiveStep(x) && !isCancelStep(x)) || null; };
  const openDealsInCampaign = (state, kolId, campaignId) => state.deals.filter(d => d.kol_id === kolId && d.campaign_id === campaignId && !isCancelled(d));
  /* CR-03: a deal is added to a Campaign · term: the payment term chosen in the dialog (CR-02 §4.3 — a new deal needs one) */
  function checkAddToCampaign(state, kolId, campaignId, pic, term) {
    const errs = [], warns = [], infos = [], k = kolById(state, kolId) || {};
    if (!campaignId || !state.campaigns.some(c => c.campaign_id === campaignId)) errs.push(issue('campaign_id', M.addCampaignRequired));
    else if (campaignBlocksNew(state, campaignId)) errs.push(issue('campaign_id', campaignBlocksNew(state, campaignId)));
    if (!pic) errs.push(issue('pic', M.addPicRequired));
    if (!isTerm(term)) errs.push(issue('payment_term', M.termRequired));
    if (k.kol_status && k.kol_status !== 'Active') warns.push(issue('kol', M.addKolStatus(k.display_name, k.kol_status)));
    const n = campaignId ? state.deals.filter(d => d.kol_id === kolId && d.campaign_id === campaignId).length : 0;
    if (n) infos.push(issue('campaign_id', M.addExisting(n)));
    return { errs, warns, infos };
  }
  /* bulk: KOLs that already have a deal (not Cancel) in the Campaign are skipped */
  /* userPic (CR-04 §4.6): the current user's PIC name — when set it is every new deal's PIC */
  function planShortlist(state, kolIds, campaignId, picFallback, termFallback, userPic) {
    const errs = [], warns = [], add = [], skip = [];
    if (!campaignId || !state.campaigns.some(c => c.campaign_id === campaignId)) errs.push(issue('campaign_id', M.addCampaignRequired));
    else if (campaignBlocksNew(state, campaignId)) errs.push(issue('campaign_id', campaignBlocksNew(state, campaignId)));
    kolIds.forEach(id => {
      const k = kolById(state, id); if (!k) return;
      const existing = campaignId ? openDealsInCampaign(state, id, campaignId) : [];
      if (existing.length) { skip.push({ kol: k, dealIds: existing.map(d => d.deal_id) }); return; }
      add.push(k);
      if (k.kol_status && k.kol_status !== 'Active') warns.push(issue('kol', M.addKolStatus(k.display_name, k.kol_status)));
    });
    const noPic = userPic ? [] : add.filter(k => !k.pic);
    if (noPic.length && !picFallback) errs.push(issue('pic', M.addPicMissing(noPic.map(k => k.display_name).join(', '))));
    const noTerm = add.filter(k => !isTerm(k.default_payment_term));
    if (noTerm.length && !isTerm(termFallback)) errs.push(issue('payment_term', M.addTermMissing(noTerm.length)));
    return { errs, warns, infos: [], add, skip, noTerm };
  }
  /* ctx: {dealId, logId, campaignId, pic, paymentTerm, costs, date, now, note} → {deal, log} */
  function shortlistDeal(state, kolId, ctx) {
    const step = shortlistStep(state.lookups);
    const deal = Object.assign(JSON.parse(JSON.stringify(DEAL_TEMPLATE)),
      { deal_id: ctx.dealId, campaign_id: ctx.campaignId, kol_id: kolId, status: step.status, sub_status: step.sub_status, pic: ctx.pic || null,
        cta: ((state.campaigns.find(c => c.campaign_id === ctx.campaignId) || {}).cta) || null,
        payment_term: isTerm(ctx.paymentTerm) ? ctx.paymentTerm : kolTerm(state, kolId) },
      ctx.costs || {});   // CR-07 §4.5: no prefill — only what was typed (bulk add: none)
    const log = { log_id: ctx.logId, deal_id: ctx.dealId, from_sub_status: null, status: step.status, sub_status: step.sub_status,
      effective_date: ctx.date, changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, source: 'user', note: ctx.note || null };
    return { deal, log };
  }

  /* §7.5 merge `fromId` into `intoId`: what moves, and the record that stays */
  function mergePreview(state, fromId, intoId) {
    const errs = [], warns = [], infos = [];
    const from = kolById(state, fromId), into = kolById(state, intoId);
    if (!from || !into) errs.push(issue('kol', C.kol.mergeNotFound));
    else if (fromId === intoId) errs.push(issue('kol', M.mergeSame));
    else {
      if (from.kol_status && from.kol_status !== 'Active' && from.kol_status !== into.kol_status) warns.push(issue('kol', M.mergeStatus(from.display_name, from.kol_status)));
      if (from.pic && into.pic && from.pic !== into.pic) infos.push(issue('pic', M.mergePic(into.pic, from.pic)));
    }
    return {
      errs, warns, infos,
      accounts: accountsOfKol(state, fromId).length,
      deals: dealsOfKol(state, fromId).length,
      quotes: state.kol_rate_quotes.filter(q => q.kol_id === fromId).length,
    };
  }
  function mergedKol(state, fromId, intoId) {
    const from = kolById(state, fromId), k = Object.assign({}, kolById(state, intoId));
    ['kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'status_reason', 'default_payment_term'].forEach(f => { if (isBlank(k[f]) && !isBlank(from[f])) k[f] = from[f]; });
    k.sources = [...new Set([...(k.sources || []), ...(from.sources || [])])];
    k.note = [trim(k.note) || trim(from.note), M.mergedFrom(from.kol_id, from.display_name)].filter(Boolean).join(' · ');
    return k;
  }
  /* the collections after merging (new arrays; the caller swaps them into state) */
  function applyMerge(state, fromId, intoId) {
    const kol = mergedKol(state, fromId, intoId);
    const move = x => (x.kol_id === fromId ? Object.assign({}, x, { kol_id: intoId }) : x);
    return {
      kol_master: state.kol_master.filter(k => k.kol_id !== fromId).map(k => (k.kol_id === intoId ? kol : k)),
      kol_accounts: state.kol_accounts.map(move),
      deals: state.deals.map(move),
      kol_rate_quotes: state.kol_rate_quotes.map(move),
    };
  }

  return {
    TZ, looksSensitive, isBlank, trim, num, fmtNum, baht, dmy, todayISO, isISODate, addDays, dayDiff, weekStart, fmtDateTime, dateOfTimestamp,
    TRACKING_PARAMS, normLink, tiktokDate, isShortTiktok, handleFromLink, platformFromLink, isHttpLink,
    tierOf,
    COST_KEYS, totalCost, gencodeEndDate, isCancelled, paidEstimate, PAYMENT_PROGRESS, paymentProgress,
    PAYMENT_TERMS, isTerm, termOf, paymentMilestones, reachedBrief, PAYMENT_STATES, paymentState, isOpenDeal, termEvent, applyTermToOpenDeals, checkNewDealTerm,
    picChange, picChanges, pillarChange, pillarChanges, fieldChange, fieldChanges, pillarStepReached, needsPillar, checkNewDealPillar, stageDots,
    stepsOf, stepOf, statusOf, isCancelStep, isPostStep, draftNo, postsOf, postDone, postsPlanned, postsDone, logsOf,
    SCRIPT_STEP, MAX_DRAFTS, isScriptStep, planOf, inPlan, requiredInPlan, planSteps,
    nextStep, dueDate, stepShort, isOverdue, daysInStep, stepBeforeCancel, checkMove, applyMove, planEvent, planLimits, checkPlan, applyPlan,
    validateCampaign, canDeleteCampaign, campaignIdFor, phaseIdFor, defaultPhaseId, defaultCampaignId,
    PHASE_STATUSES, phaseStatus, campaignStatus, sortPhases, sortCampaigns, orderedPhases, kolTerm,
    CAMPAIGN_STATUSES, CAMPAIGN_OVERRIDES, campaignEffectiveStatus, campaignBlocksNew, campaignCancelled, validateCampaignStatus,
    KOL_STATUSES, GENDERS, CONTACT_CHANNELS, ACCOUNT_FIELDS, PRICE_KEYS, kolById, accountsOfKol, dealsOfKol, postsOnAccount, maxFollowers,
    sortQuotes, quotesOfKol, latestQuote, latestPricedQuote, prefillFromQuote, kolDealAverage, kolIndex, latestPhaseOf,
    validateKol, accountComplete, validateQuote, DEAL_TEMPLATE, shortlistStep, openDealsInCampaign, checkAddToCampaign, planShortlist, shortlistDeal,
    mergePreview, mergedKol, applyMerge,
  };
})(KT.content);
