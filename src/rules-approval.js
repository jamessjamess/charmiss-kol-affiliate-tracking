/* rules-approval.js — CR-17 §4.5: Staff create Campaigns / Phases too · Admin / KOL Manager approve them before deals can be added.
   approval_status pending · approved · rejected (a record without one = approved) · approval { submitted_by, submitted_at, decided_by, decided_at, reason, note } ·
   pending_change { fields, requested_by, requested_at, note } = what Staff asked to change on an approved one (Period · Pillar target · Phases) —
   it has no effect until it is approved. Every decision is a campaign_events row (type 'approval').
   v1.2 — one request = one card (approvalRequests): New campaign · New phase · Change · (CR-18) Budget increase / decrease, each decided on its own
   (approveRequest / rejectRequest), the decided ones from the events (decidedRequests), Undo with a snapshot of the Campaign.
   Pure functions; adds to KT.rules (load after rules-profile.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { trim } = R;
  const round2 = n => Math.round(n * 100) / 100;
  const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
  const isApproved = R.isApproved;
  /* who decides (§9 #7) · who may draft (Staff too) */
  const canApprove = user => R.can(user, 'campaign.approve');
  const canDraft = user => R.can(user, 'campaign.draft');
  /* the parts of an approved Campaign / Phase whose change Staff only ask for (§9 #8) — the rest changes at once
     (CR-18: a Campaign budget changes through Adjust budget — budget_kol stays here for anything that still sends it) */
  const KEY_CAMPAIGN = ['budget_kol', 'pillar_target'];
  const KEY_PHASE = ['start_date', 'end_date', 'budget_kol'];
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const campaignOf = (state, id) => (state.campaigns || []).find(c => c.campaign_id === id) || null;
  const phaseOf = (state, id) => (state.phases || []).find(p => p.phase_id === id) || null;
  /* a campaign_events row · to = submitted · approved · rejected · change_requested · change_approved · change_rejected · change_cancelled ·
     o: from · phase_id · fields · reason / note · requested_by (who asked) · request (the card type) · change_id (CR-18 budget) */
  const approvalEvent = (ctx, campaignId, to, o = {}) => Object.assign({ event_id: ctx.eventId(), campaign_id: campaignId, type: 'approval', from: o.from || null, to,
    phase_id: o.phase_id || null, fields: o.fields || null, changed_at: ctx.now, changed_by: ctx.user || null, note: trim(o.reason || o.note) || null },
  o.requested_by ? { requested_by: o.requested_by } : {}, o.request ? { request: o.request } : {}, o.change_id ? { change_id: o.change_id } : {});
  const event = approvalEvent;

  /* a new Campaign / Phase: approved at once for someone who may approve (§4.5 "ผู้ที่อนุมัติได้สร้างเอง") · else Pending approval */
  function stampNew(rec, user, now, note) {
    const ok = canApprove(user);
    Object.assign(rec, { approval_status: ok ? 'approved' : 'pending', pending_change: null,
      approval: ok ? { submitted_by: user.user_id, submitted_at: now, decided_by: user.user_id, decided_at: now, reason: null } : Object.assign({ submitted_by: user.user_id, submitted_at: now }, trim(note) ? { note: trim(note) } : {}) });
    return rec.approval_status;
  }
  /* fields → { now (changes at once), ask (key fields that differ — a request) } for an approved record and a person who may not approve */
  function splitChange(rec, fields, keys, user) {
    if (canApprove(user) || !isApproved(rec)) return { now: Object.assign({}, fields), ask: {} };
    const now = {}, ask = {};
    Object.entries(fields).forEach(([k, v]) => { if (keys.includes(k)) { if (!same(rec[k], v)) ask[k] = v; } else now[k] = v; });
    return { now, ask };
  }
  /* a request is kept on the record (a second one adds to it) · asking for today's value again drops that field */
  function requestChange(rec, ask, user, now, note) {
    const fields = Object.assign({}, (rec.pending_change || {}).fields || {}, ask);
    Object.keys(fields).forEach(k => { if (k !== 'delete' && same(rec[k], fields[k])) delete fields[k]; });
    const was = rec.pending_change || {};
    rec.pending_change = Object.keys(fields).length ? Object.assign({ fields, requested_by: user.user_id, requested_at: now }, trim(note) || was.note ? { note: trim(note) || was.note } : {}) : null;
    return rec.pending_change;
  }
  /* what is waiting on a Campaign: itself (pending / rejected) · its Phases that are · requested changes (field · now · asked) · (CR-18) a budget change */
  function pendingOf(state, campaignId) {
    const c = campaignOf(state, campaignId); if (!c) return null;
    const phases = (state.phases || []).filter(p => p.campaign_id === campaignId);
    const diff = rec => Object.entries((rec.pending_change || {}).fields || {}).map(([k, v]) => ({ key: k, from: k === 'delete' ? null : rec[k], to: v }));
    const changes = [].concat(c.pending_change ? [{ kind: 'campaign', id: c.campaign_id, rec: c, fields: diff(c) }] : [],
      phases.filter(p => p.pending_change && isApproved(p)).map(p => ({ kind: 'phase', id: p.phase_id, rec: p, fields: diff(p) })));
    const budget = R.pendingBudgetChange ? R.pendingBudgetChange(state, campaignId) : null;
    return { campaign: c, status: c.approval_status || 'approved', newPhases: phases.filter(p => p.approval_status === 'pending'), rejectedPhases: phases.filter(p => p.approval_status === 'rejected'), changes, budget,
      waiting: c.approval_status === 'pending' || phases.some(p => p.approval_status === 'pending') || changes.length > 0 || !!budget };
  }
  /* the queue of a manager by Campaign (newest request first) — kind new · phases · change · budget */
  function approvalQueue(state) {
    return (state.campaigns || []).map(c => pendingOf(state, c.campaign_id)).filter(x => x && x.waiting)
      .map(x => ({ campaign_id: x.campaign.campaign_id, name: x.campaign.campaign_name, kind: x.status === 'pending' ? 'new' : x.newPhases.length ? 'phases' : x.changes.length ? 'change' : 'budget',
        at: [(x.campaign.approval || {}).submitted_at].concat(x.newPhases.map(p => (p.approval || {}).submitted_at), x.changes.map(ch => ch.rec.pending_change.requested_at), x.budget ? [x.budget.requested_at] : []).filter(Boolean).sort().pop() || '' }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /* ===================== v1.2 — one request = one card ===================== */
  /* the types of card · the pending ones, oldest first ({ id, type, campaign_id, phase_id, change_id, by, at, note }) */
  const REQUEST_TYPES = ['new_campaign', 'new_phase', 'change', 'budget_increase', 'budget_decrease'];
  function approvalRequests(state) {
    const out = [];
    (state.campaigns || []).forEach(c => {
      if (c.approval_status === 'pending') { const a = c.approval || {}; out.push({ id: 'campaign:' + c.campaign_id, type: 'new_campaign', campaign_id: c.campaign_id, phase_id: null, by: a.submitted_by || null, at: a.submitted_at || '', note: a.note || null }); return; }
      if (!isApproved(c)) return;   // a Rejected one waits for its maker, not for a manager
      if (c.pending_change) { const pc = c.pending_change; out.push({ id: 'change:' + c.campaign_id, type: 'change', kind: 'campaign', campaign_id: c.campaign_id, phase_id: null, by: pc.requested_by || null, at: pc.requested_at || '', note: pc.note || null }); }
      R.sortPhases((state.phases || []).filter(p => p.campaign_id === c.campaign_id)).forEach(p => {
        if (p.approval_status === 'pending') { const a = p.approval || {}; out.push({ id: 'phase:' + p.phase_id, type: 'new_phase', campaign_id: c.campaign_id, phase_id: p.phase_id, by: a.submitted_by || null, at: a.submitted_at || '', note: a.note || null }); }
        else if (p.pending_change && isApproved(p)) { const pc = p.pending_change; out.push({ id: 'change:' + p.phase_id, type: 'change', kind: 'phase', campaign_id: c.campaign_id, phase_id: p.phase_id, by: pc.requested_by || null, at: pc.requested_at || '', note: pc.note || null }); }
      });
    });
    (R.pendingBudgetChanges ? R.pendingBudgetChanges(state) : []).forEach(x => out.push({ id: 'budget:' + x.change_id, type: 'budget_' + x.type, campaign_id: x.campaign_id, phase_id: null, change_id: x.change_id, by: x.requested_by || null, at: x.requested_at || '', note: x.note || null }));
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
  }
  const approvalCount = state => approvalRequests(state).length;
  const requestById = (state, id) => approvalRequests(state).find(r => r.id === id) || null;
  /* the decided ones, newest first — from the approval events (a New campaign approved with its Phases is one card) */
  function decidedRequests(state) {
    /* (a budget change a manager applied at once was never a request: from null) */
    return (state.campaign_events || []).filter(e => e.type === 'approval' && ['approved', 'rejected', 'change_approved', 'change_rejected'].includes(e.to) && (e.from === 'pending' || e.to.startsWith('change_')))
      .map(e => {
        const ok = e.to === 'approved' || e.to === 'change_approved';
        const type = e.change_id ? e.request || 'budget_' + ((e.fields || {}).type || 'increase') : e.to.startsWith('change_') ? 'change' : e.phase_id ? 'new_phase' : 'new_campaign';
        return { id: 'ev:' + e.event_id, type, campaign_id: e.campaign_id, phase_id: e.phase_id || null, change_id: e.change_id || null, by: e.requested_by || null, decided_by: e.changed_by || null, decided_at: e.changed_at,
          result: ok ? 'approved' : 'rejected', reason: ok ? null : e.note || null, fields: e.fields || null };
      }).sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)));
  }
  /* the cards one person sees: a manager all of them · anyone else their own (My requests) · f = { state 'pending' | 'decided', type } */
  function requestsFor(state, user, f = {}) {
    const all = f.state === 'decided' ? decidedRequests(state) : approvalRequests(state);
    const mine = canApprove(user) ? all : all.filter(r => r.by && user && r.by === user.user_id);
    return f.type ? mine.filter(r => (f.type === 'budget' ? r.type.startsWith('budget_') : r.type === f.type)) : mine;
  }
  const followInitial = (state, id, ctx) => { if (R.syncInitial) R.syncInitial(state, id, ctx.user, ctx.now); };
  /* Approve one card → events */
  function approveRequest(state, req, ctx) {
    if (!req) return [];
    const dec = { decided_by: ctx.user || null, decided_at: ctx.now, reason: null };
    if (req.type === 'new_campaign') return approveCampaign(state, req.campaign_id, ctx, { only: 'campaign' });
    if (req.type === 'new_phase') {
      const p = phaseOf(state, req.phase_id); if (!p || p.approval_status !== 'pending') return [];
      p.approval_status = 'approved'; p.approval = Object.assign({}, p.approval, dec);
      return [event(ctx, p.campaign_id, 'approved', { from: 'pending', phase_id: p.phase_id, requested_by: req.by, request: req.type })];
    }
    if (req.type === 'change') {
      const rec = req.kind === 'phase' ? phaseOf(state, req.phase_id) : campaignOf(state, req.campaign_id); if (!rec || !rec.pending_change) return [];
      const by = rec.pending_change.requested_by, f = applyChange(state, req.kind, rec);
      if (req.kind !== 'phase' && f.budget_kol !== undefined) followInitial(state, req.campaign_id, ctx);   // CR-19: a Campaign that had no budget gets its Initial row
      return [event(ctx, req.campaign_id, 'change_approved', { phase_id: req.kind === 'phase' ? req.phase_id : null, fields: f, requested_by: by, request: 'change' })];
    }
    if (req.change_id && R.approveBudgetChange) return R.approveBudgetChange(state, req.change_id, ctx);
    return [];
  }
  /* Reject one card (a reason is needed — null without one) → events */
  function rejectRequest(state, req, reason, ctx) {
    if (!trim(reason)) return null;
    if (!req) return [];
    const dec = { decided_by: ctx.user || null, decided_at: ctx.now, reason: trim(reason) };
    if (req.type === 'new_campaign') return rejectCampaign(state, req.campaign_id, reason, ctx, { only: 'campaign' });
    if (req.type === 'new_phase') {
      const p = phaseOf(state, req.phase_id); if (!p || p.approval_status !== 'pending') return [];
      p.approval_status = 'rejected'; p.approval = Object.assign({}, p.approval, dec);
      return [event(ctx, p.campaign_id, 'rejected', { from: 'pending', phase_id: p.phase_id, reason, requested_by: req.by, request: req.type })];
    }
    if (req.type === 'change') {
      const rec = req.kind === 'phase' ? phaseOf(state, req.phase_id) : campaignOf(state, req.campaign_id); if (!rec || !rec.pending_change) return [];
      const f = rec.pending_change.fields, by = rec.pending_change.requested_by; rec.pending_change = null; rec.change_rejected = Object.assign({ fields: f, requested_by: by }, dec);
      return [event(ctx, req.campaign_id, 'change_rejected', { phase_id: req.kind === 'phase' ? req.phase_id : null, fields: f, reason, requested_by: by, request: 'change' })];
    }
    if (req.change_id && R.rejectBudgetChange) return R.rejectBudgetChange(state, req.change_id, reason, ctx);
    return [];
  }
  /* the change asked for → onto the record (a Phase asked to go is removed when no post uses it) */
  function applyChange(state, kind, rec) {
    const f = (rec.pending_change || {}).fields || {};
    if (kind === 'phase' && f.delete) { if (R.canDeletePhase(state, rec.phase_id)) { state.phases = state.phases.filter(p => p !== rec); state.deal_posts.forEach(p => { if (p.phase_override === rec.phase_id) p.phase_override = null; }); } }
    else Object.keys(f).forEach(k => { if (k !== 'delete') rec[k] = f[k]; });
    rec.pending_change = null;
    return f;
  }
  /* Approve (a whole Campaign — the drawer banner): itself when pending · its pending Phases · every change asked for · a budget change → events
     o.only 'campaign' = a New campaign card: the Campaign with its Phases (changes / budget of an approved one are cards of their own) */
  function approveCampaign(state, campaignId, ctx, o = {}) {
    const x = pendingOf(state, campaignId); if (!x || !x.waiting) return [];
    const events = [], dec = { decided_by: ctx.user || null, decided_at: ctx.now, reason: null }, by = (x.campaign.approval || {}).submitted_by || null;
    if (x.status === 'pending') { x.campaign.approval_status = 'approved'; x.campaign.approval = Object.assign({}, x.campaign.approval, dec); events.push(event(ctx, campaignId, 'approved', { from: 'pending', requested_by: by, request: 'new_campaign' })); }
    if (o.only === 'campaign' && x.status !== 'pending') return events;
    x.newPhases.forEach(p => { p.approval_status = 'approved'; p.approval = Object.assign({}, p.approval, dec); if (x.status !== 'pending') events.push(event(ctx, campaignId, 'approved', { from: 'pending', phase_id: p.phase_id, requested_by: (p.approval || {}).submitted_by, request: 'new_phase' })); });
    if (x.status === 'pending') followInitial(state, campaignId, ctx);
    if (o.only === 'campaign') return events;
    x.changes.forEach(ch => { const rb = ch.rec.pending_change.requested_by, f = applyChange(state, ch.kind, ch.rec); events.push(event(ctx, campaignId, 'change_approved', { phase_id: ch.kind === 'phase' ? ch.id : null, fields: f, requested_by: rb, request: 'change' })); });
    if (x.budget && R.approveBudgetChange) events.push(...R.approveBudgetChange(state, x.budget.change_id, ctx));
    return events;
  }
  /* Reject (a reason is needed): a pending Campaign and its Phases → Rejected · pending Phases of an approved one → Rejected · asked changes dropped · a budget change rejected */
  function rejectCampaign(state, campaignId, reason, ctx, o = {}) {
    if (!trim(reason)) return null;
    const x = pendingOf(state, campaignId); if (!x || !x.waiting) return [];
    const events = [], dec = { decided_by: ctx.user || null, decided_at: ctx.now, reason: trim(reason) }, by = (x.campaign.approval || {}).submitted_by || null;
    if (x.status === 'pending') { x.campaign.approval_status = 'rejected'; x.campaign.approval = Object.assign({}, x.campaign.approval, dec); events.push(event(ctx, campaignId, 'rejected', { from: 'pending', reason, requested_by: by, request: 'new_campaign' })); }
    if (o.only === 'campaign' && x.status !== 'pending') return events;
    x.newPhases.forEach(p => { p.approval_status = 'rejected'; p.approval = Object.assign({}, p.approval, dec); if (x.status !== 'pending') events.push(event(ctx, campaignId, 'rejected', { from: 'pending', phase_id: p.phase_id, reason, requested_by: (p.approval || {}).submitted_by, request: 'new_phase' })); });
    if (x.status === 'pending') followInitial(state, campaignId, ctx);
    if (o.only === 'campaign') return events;
    x.changes.forEach(ch => { const f = ch.rec.pending_change.fields, rb = ch.rec.pending_change.requested_by; ch.rec.pending_change = null; ch.rec.change_rejected = Object.assign({ fields: f, requested_by: rb }, dec); events.push(event(ctx, campaignId, 'change_rejected', { phase_id: ch.kind === 'phase' ? ch.id : null, fields: f, reason, requested_by: rb, request: 'change' })); });
    if (x.budget && R.rejectBudgetChange) events.push(...(R.rejectBudgetChange(state, x.budget.change_id, reason, ctx) || []));
    return events;
  }
  /* Resubmit (after Rejected): the Campaign and its rejected Phases wait again */
  function resubmitCampaign(state, campaignId, ctx, note) {
    const c = campaignOf(state, campaignId); if (!c) return [];
    const phases = (state.phases || []).filter(p => p.campaign_id === campaignId && p.approval_status === 'rejected');
    if (c.approval_status !== 'rejected' && !phases.length) return [];
    const sub = Object.assign({ submitted_by: ctx.user || null, submitted_at: ctx.now }, trim(note) ? { note: trim(note) } : {});
    if (c.approval_status === 'rejected') { c.approval_status = 'pending'; c.approval = Object.assign({ previous: c.approval }, sub); followInitial(state, campaignId, ctx); }
    phases.forEach(p => { p.approval_status = 'pending'; p.approval = Object.assign({ previous: p.approval }, sub); });
    return [event(ctx, campaignId, 'submitted', { from: 'rejected', note })];
  }
  /* Cancel request: the person who asked (or a manager) drops a change that waits */
  function cancelRequest(state, kind, id, ctx) {
    const rec = kind === 'phase' ? phaseOf(state, id) : campaignOf(state, id); if (!rec || !rec.pending_change) return [];
    const f = rec.pending_change.fields; rec.pending_change = null;
    return [event(ctx, kind === 'phase' ? rec.campaign_id : id, 'change_cancelled', { phase_id: kind === 'phase' ? id : null, fields: f })];
  }
  /* a Reject reason: needed · no account / ID / phone numbers */
  function validateDecision(reason) {
    const errs = [];
    if (!trim(reason)) errs.push({ field: 'reason', msg: M.rejectReason });
    else if (R.looksSensitive(reason)) errs.push({ field: 'reason', msg: M.sensitive });
    return { errs, warns: [], infos: [] };
  }

  /* ---------- Undo of a decision (10 s): the Campaign as it was ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  function decisionSnapshot(state, campaignId) {
    const ids = new Set((state.phases || []).filter(p => p.campaign_id === campaignId).map(p => p.phase_id));
    return { campaignId, campaign: clone(campaignOf(state, campaignId)), phases: (state.phases || []).filter(p => p.campaign_id === campaignId).map(clone), order: (state.phases || []).map(p => p.phase_id),
      posts: (state.deal_posts || []).filter(p => ids.has(p.phase_override)).map(p => [p.post_id, p.phase_override]),
      budget: (state.campaign_budget_changes || []).filter(x => x.campaign_id === campaignId).map(clone) };
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
  /* New campaign: the budget of the approved Campaigns running in the same period (not cancelled) · before → after */
  function sameTimeBudget(state, campaignId) {
    const c = campaignOf(state, campaignId) || {}, [a, z] = campaignSpan(state, campaignId);
    const others = (state.campaigns || []).filter(k => k.campaign_id !== campaignId && isApproved(k) && k.status_override !== 'cancelled' && !R.isBlank(k.budget_kol)).filter(k => {
      if (!a || !z) return true;
      const [s, e] = campaignSpan(state, k.campaign_id); return s && e && s <= z && e >= a;
    });
    const before = round2(others.reduce((s, k) => s + Number(k.budget_kol), 0));
    return { before, after: round2(before + (Number(c.budget_kol) || 0)), count: others.length };
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
  /* every Campaign / Phase there is now: approved · no request (§3) — runs twice → the same */
  function migrateApprovals(obj) {
    (obj.campaigns || []).forEach(c => { if (!APPROVAL_STATUSES.includes(c.approval_status)) c.approval_status = 'approved'; if (c.approval === undefined) c.approval = null; if (c.pending_change === undefined) c.pending_change = null; });
    (obj.phases || []).forEach(p => { if (!APPROVAL_STATUSES.includes(p.approval_status)) p.approval_status = 'approved'; if (p.approval === undefined) p.approval = null; if (p.pending_change === undefined) p.pending_change = null; });
    return obj;
  }

  return { APPROVAL_STATUSES, canApprove, canDraft, KEY_CAMPAIGN, KEY_PHASE, approvalEvent, stampNew, splitChange, requestChange, pendingOf, approvalQueue, approvalCount,
    REQUEST_TYPES, approvalRequests, decidedRequests, requestsFor, requestById, approveRequest, rejectRequest,
    approveCampaign, rejectCampaign, resubmitCampaign, cancelRequest, validateDecision, decisionSnapshot, restoreSnapshot,
    startTiming, campaignSpan, sameTimeBudget, newPhaseCheck, changeImpact, migrateApprovals };
})(KT.rules, KT.content));
