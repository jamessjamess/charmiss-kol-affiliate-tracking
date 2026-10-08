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
  /* CR-14 §4.5 — the contact ID of a KOL (LINE ID · Agency + person · work e-mail · the handle used for DM) */
  const CONTACT_ID_MAX = 120;
  /* a phone number: without - spaces and + only digits, 9 or more */
  const looksLikePhone = t => /^\d{9,}$/.test(String(t == null ? '' : t).replace(/[-\s+]/g, ''));
  /* → 'phone' (a phone number, or 10+ digits anywhere — they belong in the Payee vault) · 'long' (over 120) · null */
  function contactIdProblem(v) {
    if (isBlank(v)) return null;
    if (looksLikePhone(v) || looksSensitive(v)) return 'phone';
    return String(v).trim().length > CONTACT_ID_MAX ? 'long' : null;
  }
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
  /* CR-20 §4.8 — a Package deal: its Rate card is paid with the package (package_paid, synced on save) · its own costs on top (extras) by its own line */
  const extrasOf = d => (termOf(d) === 'package' ? Math.max(0, totalCost(d) - num(d.rate_card)) : totalCost(d));
  const paidUp = d => (termOf(d) === 'package' ? !!d.package_paid && (extrasOf(d) <= 0 || !!d.paid_full) : !!d.paid_full);
  const paidEstimate = d => (termOf(d) === 'package' ? (d.package_paid ? num(d.rate_card) : 0) + (d.paid_full ? extrasOf(d) : d.paid_50 ? extrasOf(d) * 0.5 : 0)
    : d.paid_full ? totalCost(d) : d.paid_50 ? totalCost(d) * 0.5 : 0);
  /* the furthest payment tick reached (Docs → 50% → Paid) */
  const PAYMENT_PROGRESS = ['none', 'docs_done', 'paid_50', 'paid_full'];
  const paymentProgress = d => (d.paid_full ? 'paid_full' : d.paid_50 ? 'paid_50' : d.docs_done ? 'docs_done' : 'none');

  /* ===================== payment term (CR-02 §4.3) ===================== */
  const PAYMENT_TERMS = ['prepaid', 'split_50', 'postpaid', 'free', 'package'];   // CR-20 §4.8: + Package (a deal only — never a KOL's default)
  const BASIC_TERMS = PAYMENT_TERMS.filter(t => t !== 'package');
  const isTerm = t => PAYMENT_TERMS.includes(t);
  const termOf = d => (d && isTerm(d.payment_term) ? d.payment_term : null);
  /* the ticks that apply to a term (null = the old Docs → 50% → Paid track) */
  const paymentMilestones = term => (term === 'free' || term === 'package' ? [] : term === 'prepaid' || term === 'postpaid' ? ['docs_done', 'paid_full'] : ['docs_done', 'paid_50', 'paid_full']);
  /* "reached Brief" = In process or Complete (Brief is the first In process step) */
  const reachedBrief = d => d.status === 'Inprocess' || d.status === 'Complete';
  const PAYMENT_STATES = ['paid', 'deposit_paid', 'overdue', 'due', 'not_due', 'free'];
  /* `today` is part of the signature for date-based terms later; the current terms only look at the stage.
     Cancelled deals owe nothing: they are Paid, Free or Not due. */
  function paymentState(d, today) {
    const t = termOf(d);
    if (t === 'package') return paidUp(d) ? 'paid' : d.status === 'Complete' ? 'due' : 'not_due';   // CR-20 §4.8
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
  /* Draft n ↔ date_field approved_draft{n}_date (the field names stay from before CR-15) */
  const draftNo = s => { const m = /approved_draft(\d)_date/.exec((s && s.date_field) || ''); return m ? Number(m[1]) : null; };
  const postsOf = (state, dealId) => state.deal_posts.filter(p => p.deal_id === dealId);
  const postDone = p => !isBlank(p.post_date) && !isBlank(p.post_link);
  const postsPlanned = (state, dealId) => postsOf(state, dealId).length;
  const postsDone = (state, dealId) => postsOf(state, dealId).filter(postDone).length;
  const logsOf = (state, dealId) => state.deal_status_log.filter(l => l.deal_id === dealId).sort((a, b) => a.log_id - b.log_id);

  /* ---------- content plan (CR-02 §4.2 · CR-15 §4.1): [Shortlist] → [Contacted] → Confirm QT → Brief → Script → Draft 1…draft_rounds → Approve → Post ·
     a step's name = the last piece of work done, waiting for the next one · Script and Approve are in every deal's plan (no toggle · script_required unused) */
  const SCRIPT_STEP = 'Script';
  const APPROVE_STEP = 'Approve';
  const MAX_DRAFTS = 3;
  const isScriptStep = s => !!s && (s.date_field === 'script_date' || s.sub_status === SCRIPT_STEP);
  const isApproveStep = s => !!s && (s.date_field === 'approved_date' || s.sub_status === APPROVE_STEP);
  const planOf = d => {
    const n = Number(d && d.draft_rounds);
    return { drafts: Number.isInteger(n) && n >= 1 && n <= MAX_DRAFTS ? n : 1 };
  };
  /* Draft n belongs to the plan only while n ≤ draft_rounds; every other step always does */
  const inPlan = (s, plan) => { if (!s) return false; const n = draftNo(s); return n ? n <= plan.drafts : true; };
  /* Script · the planned Drafts · Approve are required for every deal even if the journey marks them optional */
  const requiredInPlan = (s, plan) => inPlan(s, plan) && (!s.is_optional || isScriptStep(s) || isApproveStep(s) || !!draftNo(s));
  /* the field a step is expected by: Script → expected_script_date · Draft n → expected_draft{n}_date · Approve → expected_approve_date (Post: its posts) */
  const expectedField = s => (!s ? null : s.expected_field || (draftNo(s) ? `expected_draft${draftNo(s)}_date` : isScriptStep(s) ? 'expected_script_date' : isApproveStep(s) ? 'expected_approve_date' : null));
  /* CR-15 §4.1 — the steps of one deal, in order, without Cancel (= planSteps) */
  const dealPlan = (lookups, deal) => planSteps(lookups, deal);
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
  /* CR-15 §4.3 — the date a deal is due by and the step it belongs to: the next step's expected date (Script · Draft k · Approve) · Post = the
     earliest expected date of a post not posted yet · Approve with no date of its own → the Post's (§9 #5) · Script with none → no due */
  function dueInfo(state, deal) {
    const L = state.lookups, { step } = nextStep(L, deal);
    if (!step) return { date: null, step: null };
    const postDue = () => postsOf(state, deal.deal_id).filter(p => isBlank(p.post_date)).map(p => p.expected_post_date).filter(Boolean).sort()[0] || null;
    if (isPostStep(step)) return { date: postDue(), step };
    const f = expectedField(step), own = f ? deal[f] || null : null;
    /* CR-20 §4.15 — Script with no date of its own: the Expected Draft 1 date asked at Brief is the next due · deals made in this app only
       (an imported deal — legacy_job_ids — keeps CR-15's "no Script due → no due", so its old Draft 1 dates do not turn Overdue) */
    if (!own && isScriptStep(step) && deal.expected_draft1_date && !(Array.isArray(deal.legacy_job_ids) && deal.legacy_job_ids.length)) { const d1 = stepsOf(L).find(s => draftNo(s) === 1); if (d1) return { date: deal.expected_draft1_date, step: d1 }; }
    if (own || !isApproveStep(step)) return { date: own, step };
    return { date: postDue(), step: stepsOf(L).find(isPostStep) || step };
  }
  const dueDate = (state, deal) => dueInfo(state, deal).date;
  const dueStep = (state, deal) => dueInfo(state, deal).step;
  /* CR-07 §4.3 / §4.9 — a step's short name = its name (CR-15: Script · Draft 1 · Approve already are short) */
  const stepShort = sub => String(sub || '');
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

  /* the plan a move leads to: opts.addRound lets a move to Draft k (k > plan) raise draft_rounds to k */
  const planAfterMove = (deal, to, opts) => {
    const plan = planOf(deal), k = draftNo(to);
    return opts && opts.addRound && k && k > plan.drafts ? { drafts: k } : plan;
  };
  /* CR-15 §4.2 — a move forward over steps of the plan: they are marked done on the day of the move (a log each, "auto-completed") —
     never when leaving Cancel or going into it */
  function skippedSteps(state, deal, toSub, opts) {
    const L = state.lookups, to = stepOf(L, toSub), from = stepOf(L, deal.sub_status);
    if (!to || isCancelStep(to) || (from && isCancelStep(from))) return [];
    const fromSort = from ? from.sort_order : -Infinity, after = planAfterMove(deal, to, opts);
    if (to.sort_order <= fromSort) return [];
    return stepsOf(L).filter(s => isActiveStep(s) && !isCancelStep(s) && requiredInPlan(s, after) && s.sort_order > fromSort && s.sort_order < to.sort_order);
  }
  /* checkMove · applyMove · dropPlan: rules-move.js (CR-20 — what a move needs comes from stageRequirements) */

  /* ---------- changing the content plan from the drawer (CR-02 §4.2) ---------- */
  const planValue = p => ({ draft_rounds: p.drafts });
  function planEvent(deal, next, ctx) {
    return { event_id: ctx.eventId, deal_id: deal.deal_id, type: 'plan', from: planValue(planOf(deal)), to: planValue(next),
      changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null };
  }
  /* what [−] [+] may do: rounds already passed cannot be removed ("passed" = the current step (or the step before Cancel) is at or after it,
     or its date is filled) · a Cancel whose step before is unknown keeps the plan as it is */
  function planLimits(state, deal) {
    const L = state.lookups, plan = planOf(deal);
    let cur = stepOf(L, deal.sub_status);
    if (cur && isCancelStep(cur)) {
      const prev = stepBeforeCancel(state, deal);
      if (!prev) return { minDrafts: plan.drafts, maxDrafts: MAX_DRAFTS };
      cur = stepOf(L, prev);
    }
    const curSort = cur ? cur.sort_order : -Infinity;
    let minDrafts = 1;
    stepsOf(L).forEach(s => {
      const n = draftNo(s);
      if (n && n <= plan.drafts && (s.sort_order <= curSort || !isBlank(deal[`approved_draft${n}_date`]))) minDrafts = Math.max(minDrafts, n);
    });
    return { minDrafts, maxDrafts: MAX_DRAFTS };
  }
  /* next: {drafts} */
  function checkPlan(state, deal, next) {
    const errs = [], lim = planLimits(state, deal);
    if (!Number.isInteger(next.drafts) || next.drafts < 1 || next.drafts > MAX_DRAFTS) errs.push(issue('draft_rounds', M.planDraftsRange(MAX_DRAFTS)));
    else if (next.drafts < lim.minDrafts) errs.push(issue('draft_rounds', M.planDraftsPassed(lim.minDrafts)));
    return { errs, warns: [], infos: [] };
  }
  /* → {deal, event} (no change → event null) · ctx: {eventId, now, note} */
  function applyPlan(deal, next, ctx) {
    const plan = planOf(deal);
    if (plan.drafts === next.drafts) return { deal, event: null };
    const to = { drafts: next.drafts };
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
  /* CR-17 §4.5 — a Campaign / Phase made by Staff waits for a manager (pending · rejected) · no approval_status (older data) = approved */
  const isApproved = x => !x || !x.approval_status || x.approval_status === 'approved';
  function phaseStatus(phase, today) {
    if (phase && phase.approval_status === 'rejected') return 'rejected';   // CR-17 v1.2: Rejected > Pending approval > the dates
    if (phase && !isApproved(phase)) return 'pending';   // CR-17: not a Phase yet
    if (!phase || !phase.start_date || today < phase.start_date) return 'not_started';
    if (phase.end_date && today > phase.end_date) return 'complete';
    return 'ongoing';
  }
  /* any Phase on going → On going · all not started → Not started · all ended → Complete · ended + not started (between Phases) → On going */
  function campaignStatus(phases, today) {
    const st = phases.map(p => phaseStatus(p, today)).filter(x => x !== 'pending' && x !== 'rejected');   // CR-17: a Phase waiting for approval (or rejected) does not count
    if (!st.length || st.every(s => s === 'not_started')) return 'not_started';
    if (st.every(s => s === 'complete')) return 'complete';
    return 'ongoing';
  }
  /* by start, then end; Phases with the same dates keep the order they were made (CR-06 §4.2 — the same order as their Phase number) */
  const sortPhases = phases => [...phases].sort((a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999'))
    || String(a.end_date || '9999').localeCompare(String(b.end_date || '9999')));
  /* CR-05 §4.7 — a Campaign may be put On hold or Cancelled (status_override); that wins over its dates */
  /* CR-17 §4.5 — + Pending approval · Rejected (a Campaign Staff made): not in the Dashboard by default · v1.2: the order of the tabs, and which wins —
     Cancelled > Rejected > Pending approval > On hold > by the dates (Not started · On going · Complete) */
  const CAMPAIGN_STATUSES = ['ongoing', 'not_started', 'pending', 'on_hold', 'complete', 'rejected', 'cancelled'];
  const CAMPAIGN_OVERRIDES = ['on_hold', 'cancelled'];
  const campaignEffectiveStatus = (campaign, phases, today) => (campaign && campaign.status_override === 'cancelled' ? 'cancelled'
    : campaign && campaign.approval_status === 'rejected' ? 'rejected' : campaign && !isApproved(campaign) ? 'pending'
    : campaign && CAMPAIGN_OVERRIDES.includes(campaign.status_override) ? campaign.status_override : campaignStatus(phases, today));
  /* a Campaign that takes no new deal: On hold · Cancelled → the message, else null */
  function campaignBlocksNew(state, campaignId) {
    const c = state.campaigns.find(x => x.campaign_id === campaignId); if (!c) return null;
    if (!isApproved(c)) return M.campaignNotApproved(c.campaign_name);   // CR-17 §4.5: no deal before a manager approves it
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
    const RANK = { ongoing: 0, not_started: 1, pending: 1.5, on_hold: 2, complete: 3, rejected: 3.5, cancelled: 4 };
    const info = new Map(campaigns.map(c => {
      const ps = phases.filter(p => p.campaign_id === c.campaign_id);
      const starts = ps.map(p => p.start_date).filter(Boolean).sort(), ends = ps.map(p => p.end_date).filter(Boolean).sort();
      return [c.campaign_id, { st: campaignEffectiveStatus(c, ps, today), start: starts[0] || '9999', end: ends[ends.length - 1] || '9999' }];
    }));
    return [...campaigns].sort((a, b) => {
      const x = info.get(a.campaign_id), y = info.get(b.campaign_id);
      if (x.st !== y.st) return RANK[x.st] - RANK[y.st];
      const c = x.st === 'ongoing' ? x.end.localeCompare(y.end) : x.st === 'not_started' || x.st === 'on_hold' || x.st === 'pending' ? x.start.localeCompare(y.start) : y.end.localeCompare(x.end);
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
    /* CR-14 §4.5 — the contact ID: never a phone number (that is in the Payee vault) · 120 characters at most · a channel without it = a reminder */
    const cp = contactIdProblem(draft.contact_id);
    if (cp === 'phone') errs.push(issue('contact_id', M.contactPhone));
    else if (cp === 'long') errs.push(issue('contact_id', M.contactLong(CONTACT_ID_MAX)));
    if (!isBlank(draft.contact_channel) && isBlank(draft.contact_id)) infos.push(issue('contact_id', M.contactMissing));
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
    brief_date: null, expected_script_date: null, script_date: null, expected_draft1_date: null, approved_draft1_date: null, expected_draft2_date: null, approved_draft2_date: null,
    expected_draft3_date: null, approved_draft3_date: null, expected_approve_date: null, approved_date: null, expected_post_date: null, link_brief: null, cta: null,
    cancel_reason: null, remark: null, legacy_job_ids: [], source_record_ids: [], is_legacy: false,
    draft_rounds: 1, payment_term: null, payee_id: null,   // CR-16: payee_id null = the KOL's default payee
    package_id: null, package_units: 1, package_paid: false, script_link: null,   // CR-20 §3
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
  /* ===================== CR-14 §4.2 — ui.multiSelect, the part without a screen ===================== */
  /* text to compare: one Unicode form · trimmed · no case (Thai is kept as it is) */
  const foldText = t => String(t == null ? '' : t).normalize('NFC').trim().toLowerCase();
  /* the options a search shows (by label, or o.search when given) */
  const msFilter = (options, q) => { const k = foldText(q); return !k ? options.slice() : options.filter(o => foldText(o.search != null ? o.search : o.label).includes(k)); };
  /* the values in the options' order */
  const msOrder = (options, set) => options.map(o => o.value).filter(v => set.has(v));
  /* tick / untick one value · min: the last ticked one(s) cannot go (the list stays as it was) */
  function msToggle(options, value, v, on, min) {
    const set = new Set(value || []);
    if (on) set.add(v);
    else if (!(set.has(v) && set.size <= (min || 0))) set.delete(v);
    return msOrder(options, set);
  }
  /* Select all: every option · with a search, the ones it shows are added to what is ticked */
  const msSelectAll = (options, value, q) => msOrder(options, new Set(msFilter(options, q).map(o => o.value).concat(value || [])));
  /* a ticked value that may not be taken off (it is the last of min) */
  const msLocked = (value, v, min) => !!min && (value || []).includes(v) && (value || []).length <= min;
  /* a value kept for each person in one JSON {userId: value} (deals.stateTab.v2 · dash.all.statuses) */
  function userPrefGet(json, uid) { try { const m = JSON.parse(json || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m[uid || ''] : undefined; } catch (e) { return undefined; } }
  function userPrefSet(json, uid, v) {
    let m = {}; try { m = JSON.parse(json || '{}') || {}; } catch (e) { m = {}; }
    if (typeof m !== 'object' || Array.isArray(m)) m = {};
    m[uid || ''] = v; return JSON.stringify(m);
  }
  function mergedKol(state, fromId, intoId) {
    const from = kolById(state, fromId), k = Object.assign({}, kolById(state, intoId));
    ['kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'contact_id', 'status_reason', 'default_payment_term'].forEach(f => { if (isBlank(k[f]) && !isBlank(from[f])) k[f] = from[f]; });
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
    COST_KEYS, totalCost, gencodeEndDate, isCancelled, paidEstimate, extrasOf, paidUp, PAYMENT_PROGRESS, paymentProgress, BASIC_TERMS,
    PAYMENT_TERMS, isTerm, termOf, paymentMilestones, reachedBrief, PAYMENT_STATES, paymentState, isOpenDeal, termEvent, applyTermToOpenDeals, checkNewDealTerm,
    picChange, picChanges, pillarChange, pillarChanges, fieldChange, fieldChanges, pillarStepReached, needsPillar, checkNewDealPillar, stageDots,
    stepsOf, stepOf, statusOf, isCancelStep, isPostStep, draftNo, postsOf, postDone, postsPlanned, postsDone, logsOf,
    SCRIPT_STEP, APPROVE_STEP, MAX_DRAFTS, isScriptStep, isApproveStep, expectedField, planOf, inPlan, requiredInPlan, planSteps, dealPlan, skippedSteps,
    nextStep, dueInfo, dueDate, dueStep, stepShort, isOverdue, daysInStep, stepBeforeCancel, planEvent, planLimits, checkPlan, applyPlan,
    validateCampaign, canDeleteCampaign, campaignIdFor, phaseIdFor, defaultPhaseId, defaultCampaignId,
    PHASE_STATUSES, phaseStatus, campaignStatus, sortPhases, sortCampaigns, orderedPhases, kolTerm,
    CAMPAIGN_STATUSES, CAMPAIGN_OVERRIDES, campaignEffectiveStatus, campaignBlocksNew, isApproved, campaignCancelled, validateCampaignStatus,
    KOL_STATUSES, GENDERS, CONTACT_CHANNELS, ACCOUNT_FIELDS, PRICE_KEYS, kolById, accountsOfKol, dealsOfKol, postsOnAccount, maxFollowers,
    sortQuotes, quotesOfKol, latestQuote, latestPricedQuote, prefillFromQuote, kolDealAverage, kolIndex,
    validateKol, accountComplete, validateQuote, DEAL_TEMPLATE, shortlistStep, openDealsInCampaign, checkAddToCampaign, planShortlist, shortlistDeal,
    mergePreview, mergedKol, applyMerge, CONTACT_ID_MAX, looksLikePhone, contactIdProblem, foldText, msFilter, msToggle, msSelectAll, msLocked, userPrefGet, userPrefSet,
  };
})(KT.content);
