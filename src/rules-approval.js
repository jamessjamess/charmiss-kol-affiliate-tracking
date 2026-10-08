/* rules-approval.js — CR-17 §4.5: Staff create Campaigns / Phases too · Admin / KOL Manager approve them before deals can be added.
   approval_status draft · pending · approved (a record without one = approved) · approval { created_by, created_at, submitted_by, submitted_at, decided_by,
   decided_at, reason, note } · pending_change { status draft | pending, fields, requested_by, requested_at, note } = what Staff asked to change on an
   approved one — it has no effect until it is approved. Every decision is a campaign_events row (type 'approval').
   v1.2 — one request = one card: New campaign · New phase · Change · (CR-18) Budget increase / decrease, each decided on its own.
   CR-21 — every state change of a request goes through R.requestTransition (rules-request.js): this file keeps who may do what, what a Staff edit asks
   for, the lists of cards, Undo of a decision and what a card says. There is no Rejected any more: Return to draft (a reason) → Resubmit.
   Pure functions; adds to KT.rules (load after rules-profile.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { trim } = R;
  const round2 = n => Math.round(n * 100) / 100;
  const APPROVAL_STATUSES = ['draft', 'pending', 'approved'];
  const isApproved = R.isApproved;
  /* who decides (§9 #7) · who may draft (Staff too) */
  const canApprove = user => R.can(user, 'campaign.approve');
  const canDraft = user => R.can(user, 'campaign.draft');
  /* the parts of an approved Campaign / Phase whose change Staff only ask for — the rest changes at once (CR-18: the budget changes through Adjust budget ·
     CR-21 §3.7: in the Phase Planner a Staff edit of an approved Campaign is one request — name · note · products too) */
  const KEY_CAMPAIGN = ['budget_kol', 'pillar_target'];
  const KEY_CAMPAIGN_PLAN = ['campaign_name', 'note', 'products', 'budget_kol', 'pillar_target'];
  const KEY_PHASE = ['start_date', 'end_date', 'budget_kol'];
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const campaignOf = (state, id) => (state.campaigns || []).find(c => c.campaign_id === id) || null;
  const phaseOf = (state, id) => (state.phases || []).find(p => p.phase_id === id) || null;
  /* a campaign_events row · to = draft_saved · submitted · resubmitted · withdrawn · returned · approved · draft_deleted · change_requested ·
     change_approved · change_cancelled (old data: rejected · change_rejected) · o: from · phase_id · fields · reason / note · requested_by (who asked) ·
     request (the card type) · change_id (CR-18 budget) · round (CR-21) */
  const approvalEvent = (ctx, campaignId, to, o = {}) => Object.assign({ event_id: ctx.eventId(), campaign_id: campaignId, type: 'approval', from: o.from || null, to,
    phase_id: o.phase_id || null, fields: o.fields || null, changed_at: ctx.now, changed_by: ctx.user || null, note: trim(o.reason || o.note) || null },
  o.requested_by ? { requested_by: o.requested_by } : {}, o.request ? { request: o.request } : {}, o.change_id ? { change_id: o.change_id } : {}, o.round ? { round: o.round } : {});

  /* CR-21 — a new Campaign / Phase starts as a draft of the one who made it (Save draft keeps it there · Submit / Create moves it on — requestTransition) */
  function stampDraft(rec, user, now) {
    Object.assign(rec, { approval_status: 'draft', pending_change: null, submit_round: 0, returned_reason: null, returned_by: null, returned_at: null, last_submitted: null,
      approval: { created_by: (user || {}).user_id || null, created_at: now, submitted_by: null, submitted_at: null } });
    return rec;
  }
  /* fields → { now (changes at once), ask (key fields that differ — a request) } for an approved record and a person who may not approve */
  function splitChange(rec, fields, keys, user) {
    if (canApprove(user) || !isApproved(rec)) return { now: Object.assign({}, fields), ask: {} };
    const now = {}, ask = {};
    Object.entries(fields).forEach(([k, v]) => { if (keys.includes(k)) { if (!same(rec[k], v)) ask[k] = v; } else now[k] = v; });
    return { now, ask };
  }
  /* what is asked is kept on the record as one change (a second ask adds to it; asking for today's value again drops that field) — a new one is a draft
     (requestTransition sends it) · cur: today's values when they are not on the record (products) */
  function requestChange(rec, ask, user, now, note, cur = {}) {
    const fields = Object.assign({}, (rec.pending_change || {}).fields || {}, ask);
    Object.keys(fields).forEach(k => { if (k !== 'delete' && same(k in cur ? cur[k] : rec[k], fields[k])) delete fields[k]; });
    const was = rec.pending_change || {};
    rec.pending_change = Object.keys(fields).length ? Object.assign({}, was, { fields, requested_by: user.user_id, requested_at: now, status: was.status || 'draft' }, trim(note) || was.note ? { note: trim(note) || was.note } : {}) : null;
    return rec.pending_change;
  }
  /* what waits on a Campaign: itself · its Phases that wait · requested changes (field · now · asked) · (CR-18) a budget change — pending ones only */
  function pendingOf(state, campaignId) {
    const c = campaignOf(state, campaignId); if (!c) return null;
    const phases = (state.phases || []).filter(p => p.campaign_id === campaignId);
    const waits = rec => !!rec.pending_change && (rec.pending_change.status || 'pending') === 'pending';
    const diff = rec => Object.entries((rec.pending_change || {}).fields || {}).map(([k, v]) => ({ key: k, from: k === 'delete' ? null : k === 'products' ? R.campaignProductCodes(state, campaignId) : rec[k], to: v }));
    const changes = [].concat(waits(c) ? [{ kind: 'campaign', id: c.campaign_id, rec: c, fields: diff(c) }] : [],
      phases.filter(p => waits(p) && isApproved(p)).map(p => ({ kind: 'phase', id: p.phase_id, rec: p, fields: diff(p) })));
    const budget = R.pendingBudgetChange ? R.pendingBudgetChange(state, campaignId) : null;
    return { campaign: c, status: c.approval_status || 'approved', newPhases: isApproved(c) ? phases.filter(p => p.approval_status === 'pending') : [], changes, budget,
      waiting: c.approval_status === 'pending' || (isApproved(c) && phases.some(p => p.approval_status === 'pending')) || changes.length > 0 || !!budget };
  }

  /* ===================== the cards (one a request) ===================== */
  const REQUEST_TYPES = ['new_campaign', 'new_phase', 'change', 'budget_increase', 'budget_decrease'];
  /* the pending ones, oldest first ({ id, type, kind, campaign_id, phase_id, change_id, by, at, note, round }) */
  const approvalRequests = state => R.requestsIn(state, 'pending');
  const approvalCount = state => approvalRequests(state).length;
  const requestById = (state, id) => approvalRequests(state).find(r => r.id === id) || null;
  const decidedRequests = state => R.decidedFrom(state);
  /* the cards one person sees · f = { state 'pending' | 'decided' | 'drafts', type } — a manager: every pending / decided one · anyone else their own ·
     drafts: their own (an Admin every one) */
  function requestsFor(state, user, f = {}) {
    const all = f.state === 'drafts' ? R.draftRequests(state, user) : f.state === 'decided' ? decidedRequests(state) : approvalRequests(state);
    const mine = f.state === 'drafts' || canApprove(user) ? all : all.filter(r => r.by && user && r.by === user.user_id);
    return f.type ? mine.filter(r => (f.type === 'budget' ? r.type.startsWith('budget_') : r.type === f.type)) : mine;
  }
  /* the returned drafts of one person (the badge of Staff: the ones not opened yet are counted by the screen) */
  const returnedFor = (state, user) => R.draftRequests(state, user).filter(r => r.returned && user && r.by === user.user_id);
  /* Approve one card → events ([] when it cannot) · note: the manager's comment */
  const approveRequest = (state, req, ctx, note) => R.requestTransition(state, req, 'approved', ctx, { note }).events;
  /* Return to draft one card (a reason of 5 characters or more — null without one) → events */
  function returnRequest(state, req, reason, ctx) {
    const r = R.requestTransition(state, req, 'draft', ctx, { reason });
    return r.err === 'reason' || r.err === 'sensitive' ? null : r.events;
  }
  /* the change asked for → onto the record (a Phase asked to go is removed when no post uses it · products → the Campaign's products) */
  function applyChange(state, kind, rec) {
    const f = (rec.pending_change || {}).fields || {};
    if (kind === 'phase' && f.delete) { if (R.canDeletePhase(state, rec.phase_id)) { state.phases = state.phases.filter(p => p !== rec); state.deal_posts.forEach(p => { if (p.phase_override === rec.phase_id) p.phase_override = null; }); } }
    else Object.keys(f).forEach(k => { if (k === 'products') { if (R.setCampaignProducts) R.setCampaignProducts(state, rec.campaign_id, f.products || []); } else if (k !== 'delete') rec[k] = f[k]; });
    rec.pending_change = null;
    return f;
  }

  /* ---------- Undo of a decision (10 s): the Campaign as it was ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  function decisionSnapshot(state, campaignId) {
    const ids = new Set((state.phases || []).filter(p => p.campaign_id === campaignId).map(p => p.phase_id));
    return { campaignId, campaign: clone(campaignOf(state, campaignId)), phases: (state.phases || []).filter(p => p.campaign_id === campaignId).map(clone), order: (state.phases || []).map(p => p.phase_id),
      posts: (state.deal_posts || []).filter(p => ids.has(p.phase_override)).map(p => [p.post_id, p.phase_override]),
      budget: (state.campaign_budget_changes || []).filter(x => x.campaign_id === campaignId).map(clone),
      products: (state.campaign_products || []).filter(x => x.campaign_id === campaignId).map(clone) };
  }
  /* back to the snapshot · eventIds: the rows the decision wrote (they go) */
  function restoreSnapshot(state, snap, eventIds) {
    const at = state.campaigns.findIndex(c => c.campaign_id === snap.campaignId);
    if (at >= 0) state.campaigns[at] = clone(snap.campaign); else state.campaigns.push(clone(snap.campaign));
    const mine = new Map(snap.phases.map(p => [p.phase_id, clone(p)])), others = state.phases.filter(p => p.campaign_id !== snap.campaignId), byId = new Map(others.map(p => [p.phase_id, p]));
    const out = snap.order.map(id => mine.get(id) || byId.get(id)).filter(Boolean), seen = new Set(out.map(p => p.phase_id));
    state.phases = out.concat(others.filter(p => !seen.has(p.phase_id)));
    const over = new Map(snap.posts); state.deal_posts.forEach(p => { if (over.has(p.post_id)) p.phase_override = over.get(p.post_id); });
    if (Array.isArray(state.campaign_budget_changes)) state.campaign_budget_changes = state.campaign_budget_changes.filter(x => x.campaign_id !== snap.campaignId).concat(snap.budget.map(clone))
      .sort((a, b) => String(a.change_id).localeCompare(String(b.change_id)));
    if (snap.products && Array.isArray(state.campaign_products)) state.campaign_products = state.campaign_products.filter(x => x.campaign_id !== snap.campaignId).concat(snap.products.map(clone));
    const gone = new Set(eventIds || []); state.campaign_events = state.campaign_events.filter(e => !gone.has(e.event_id));
  }

  /* ---------- what a card says ---------- */
  /* when it runs against today: Starts in n days · Starts today · Started n days ago (null without a date) */
  function startTiming(start, today) {
    if (!start || !today) return null;
    const d = R.dayDiff(start, today);
    return d > 0 ? { kind: 'in', days: d } : d === 0 ? { kind: 'today', days: 0 } : { kind: 'ago', days: -d };
  }
  /* the dates of a Campaign with every Phase (waiting ones too) */
  function campaignSpan(state, campaignId) {
    const ps = (state.phases || []).filter(p => p.campaign_id === campaignId);
    return [ps.map(p => p.start_date).filter(Boolean).sort()[0] || null, ps.map(p => p.end_date).filter(Boolean).sort().pop() || null];
  }
  /* New campaign: the budget of the approved Campaigns running in the same period (not cancelled) · before → after · list (CR-21: the Budget context) */
  function sameTimeBudget(state, campaignId) {
    const c = campaignOf(state, campaignId) || {}, [a, z] = campaignSpan(state, campaignId);
    const others = (state.campaigns || []).filter(k => k.campaign_id !== campaignId && isApproved(k) && k.status_override !== 'cancelled' && !R.isBlank(k.budget_kol)).filter(k => {
      if (!a || !z) return true;
      const [s, e] = campaignSpan(state, k.campaign_id); return s && e && s <= z && e >= a;
    });
    const before = round2(others.reduce((s, k) => s + Number(k.budget_kol), 0));
    return { before, after: round2(before + (Number(c.budget_kol) || 0)), count: others.length, list: others.map(k => ({ campaign_id: k.campaign_id, name: k.campaign_name, budget: Number(k.budget_kol), span: campaignSpan(state, k.campaign_id) })) };
  }
  /* New phase: overlaps with the approved Phases · the Phase budgets with it against the Campaign budget */
  function newPhaseCheck(state, phaseId) {
    const p = phaseOf(state, phaseId) || {}, c = campaignOf(state, p.campaign_id) || {};
    const approved = (state.phases || []).filter(q => q.campaign_id === p.campaign_id && q.phase_id !== phaseId && isApproved(q));
    const overlaps = R.phaseOverlaps([p].concat(approved)).filter(o => o.a === phaseId || o.b === phaseId).map(o => ({ phase_id: o.a === phaseId ? o.b : o.a, from: o.from, to: o.to }));
    const total = round2(approved.concat([p]).reduce((s, q) => s + (Number(q.budget_kol) || 0), 0)), budget = R.isBlank(c.budget_kol) ? null : Number(c.budget_kol);
    return { overlaps, total, budget, over: budget != null && total > budget };
  }
  /* Change: posts that would move Phase if it were approved */
  function changeImpact(state, req) {
    const rec = req.kind === 'phase' ? phaseOf(state, req.phase_id) : campaignOf(state, req.campaign_id); if (!rec || !rec.pending_change) return { moved: 0 };
    const f = rec.pending_change.fields;
    if (req.kind !== 'phase' || !(f.start_date || f.end_date || f.delete)) return { moved: 0 };
    const phases = f.delete ? state.phases.filter(p => p !== rec) : state.phases.map(p => (p === rec ? Object.assign({}, p, f) : p));
    const before = R.phaseIndex(state), after = R.phaseIndex(Object.assign({}, state, { phases }));
    const ids = new Set(state.deals.filter(d => d.campaign_id === req.campaign_id).map(d => d.deal_id)), key = r => (!r ? null : r.phase || r.slot);
    let moved = 0; const deals = new Set();
    state.deal_posts.filter(p => ids.has(p.deal_id)).forEach(p => { const b = before.post.get(p.post_id), a = after.post.get(p.post_id); if (b && a && key(b) !== key(a)) { moved++; deals.add(p.deal_id); } });
    return { moved, deals: deals.size };
  }

  /* ===================== schema 16 ===================== */
  /* every Campaign / Phase there is now: approved · no request (§3) — runs twice → the same (CR-21: rejected is read by migrateV20) */
  function migrateApprovals(obj) {
    const OK = APPROVAL_STATUSES.concat(['rejected']);
    (obj.campaigns || []).forEach(c => { if (!OK.includes(c.approval_status)) c.approval_status = 'approved'; if (c.approval === undefined) c.approval = null; if (c.pending_change === undefined) c.pending_change = null; });
    (obj.phases || []).forEach(p => { if (!OK.includes(p.approval_status)) p.approval_status = 'approved'; if (p.approval === undefined) p.approval = null; if (p.pending_change === undefined) p.pending_change = null; });
    return obj;
  }

  return { APPROVAL_STATUSES, canApprove, canDraft, KEY_CAMPAIGN, KEY_CAMPAIGN_PLAN, KEY_PHASE, approvalEvent, stampDraft, splitChange, requestChange, pendingOf, approvalCount,
    REQUEST_TYPES, approvalRequests, decidedRequests, requestsFor, returnedFor, requestById, approveRequest, returnRequest, applyChange,
    decisionSnapshot, restoreSnapshot, startTiming, campaignSpan, sameTimeBudget, newPhaseCheck, changeImpact, migrateApprovals };
})(KT.rules, KT.content));
