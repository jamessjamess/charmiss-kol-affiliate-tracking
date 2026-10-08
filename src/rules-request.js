/* rules-request.js — CR-21 §3.4–3.6 · §4: one way for every request to change state, one way to say what changed.
   A request is a New campaign (the Campaign with its Phases) · a New phase (of an approved Campaign) · a Change (pending_change of an approved Campaign /
   Phase) · a Budget increase / decrease (a campaign_budget_changes row). Its states: draft → pending → approved (Return to draft and Withdraw to draft
   go back from pending · a draft may be deleted · a change / budget change may be cancelled) — never back from approved.
   requestTransition() is the only place a request changes state (and the only place that writes its approval events) · requestDiff() is the only diff
   (the Planner footer · What changed since last round). Each request carries submit_round · returned_reason / returned_by / returned_at (while it is a
   returned draft) · last_submitted { round, at, by, reason, values } (what the manager saw when it was returned — What changed compares with it).
   Pure functions; adds to KT.rules (load after rules-budget.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { trim, isBlank } = R;
  const RQ = C.request;
  const REQUEST_STATES = ['draft', 'pending', 'approved'];
  const MIN_REASON = 5;
  const round2 = n => Math.round(n * 100) / 100;
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const campaignOf = (state, id) => (state.campaigns || []).find(c => c.campaign_id === id) || null;
  const phaseOf = (state, id) => (state.phases || []).find(p => p.phase_id === id) || null;
  const budgetRows = state => (Array.isArray(state.campaign_budget_changes) ? state.campaign_budget_changes : (state.campaign_budget_changes = []));
  /* who a request belongs to: the one who made it (a draft) / sent it */
  const ownerOf = rec => { const a = (rec && rec.approval) || {}; return a.created_by || a.submitted_by || null; };

  /* ===================== a request by its id ===================== */
  /* 'campaign:<id>' · 'phase:<id>' · 'change:<campaign or phase id>' · 'budget:<change id>' (a card passes itself) →
     { id, type, kind, campaign_id, phase_id, change_id, rec, carrier, status, by, at, round, returned, note } (null when it is not there) */
  function requestOf(state, ref) {
    if (!ref) return null;
    const id = typeof ref === 'string' ? ref : ref.id;
    const at = String(id).indexOf(':'), kind = String(id).slice(0, at), key = String(id).slice(at + 1);
    const make = (type, rec, carrier, o) => Object.assign({ id, type, kind: null, campaign_id: null, phase_id: null, change_id: null, rec, carrier,
      round: carrier.submit_round || 0, returned: carrier.returned_at ? { reason: carrier.returned_reason || '', by: carrier.returned_by || null, at: carrier.returned_at } : null }, o);
    if (kind === 'campaign') {
      const c = campaignOf(state, key); if (!c) return null; const a = c.approval || {};
      return make('new_campaign', c, c, { campaign_id: key, status: c.approval_status || 'approved', by: ownerOf(c), at: a.submitted_at || a.created_at || '', note: a.note || null });
    }
    if (kind === 'phase') {
      const p = phaseOf(state, key); if (!p) return null; const a = p.approval || {};
      return make('new_phase', p, p, { campaign_id: p.campaign_id, phase_id: key, status: p.approval_status || 'approved', by: ownerOf(p), at: a.submitted_at || a.created_at || '', note: a.note || null });
    }
    if (kind === 'change') {
      const c = campaignOf(state, key), p = c ? null : phaseOf(state, key), rec = c || p; if (!rec || !rec.pending_change) return null;
      const pc = rec.pending_change;
      return make('change', rec, pc, { kind: p ? 'phase' : 'campaign', campaign_id: rec.campaign_id, phase_id: p ? key : null, status: pc.status || 'pending', by: pc.requested_by || null, at: pc.requested_at || '', note: pc.note || null });
    }
    if (kind === 'budget') {
      const x = budgetRows(state).find(b => b.change_id === key); if (!x) return null;
      return make('budget_' + x.type, x, x, { campaign_id: x.campaign_id, change_id: key, status: x.status, by: x.requested_by || null, at: x.requested_at || '', note: x.note || null });
    }
    return null;
  }
  /* the id of a request (for a record / a budget row) */
  const requestIdOf = (kind, key) => `${kind}:${key}`;

  /* ===================== what a request says (for requestDiff) ===================== */
  /* one entry: { label, value (compared), text (shown) } · g / gl: the Phase it is part of (an added / removed Phase is one line) */
  const E = (label, value, text, g, gl) => Object.assign({ label, value: isBlank(value) ? null : value, text: text != null ? text : isBlank(value) ? '—' : String(value) }, g ? { g, gl } : {});
  const moneyText = v => (v == null || v === '' || isNaN(v) ? '—' : R.baht(Number(v)));
  const productsText = (state, codes) => (codes || []).map(code => { const p = R.productByCode ? R.productByCode(state, code) : null; return p ? R.productShort(p) : code; }).join(', ') || '—';
  /* a plan: camp { campaign_name, budget_kol, products, note } (a key left out is not compared) · rows [{ phase_id | key, label, start_date, end_date, budget_kol, default_pillar }] */
  function planSnapshot(state, camp, rows) {
    const out = {};
    if (camp) {
      if (camp.campaign_name !== undefined) out.campaign_name = E(RQ.fName, trim(camp.campaign_name));
      if (camp.budget_kol !== undefined) { const b = R.money(camp.budget_kol); out.budget_kol = E(RQ.fBudget, b, moneyText(b)); }
      if (camp.products !== undefined) { const codes = (camp.products || []).slice().sort(); out.products = E(RQ.fProducts, codes.length ? codes : null, productsText(state, codes)); }
      if (camp.note !== undefined) out.note = E(RQ.fNote, trim(camp.note) || null);
    }
    if (rows) {
      const seqs = R.planSeqs(rows);
      rows.forEach((r, i) => {
        const g = 'ph:' + (r.phase_id || 'new' + (r.key || i)), name = R.phaseTitle(seqs[i], '');
        const ok = R.isISODate(r.start_date) && R.isISODate(r.end_date), b = R.money(r.budget_kol);
        out[g + ':period'] = E(RQ.fPhase(name, RQ.fPeriod), ok ? r.start_date + '|' + r.end_date : null, ok ? `${R.dmy(r.start_date)} – ${R.dmy(r.end_date)}` : '—', g, name);
        out[g + ':budget'] = E(RQ.fPhase(name, RQ.fPhaseBudget), b, moneyText(b), g, name);
        out[g + ':label'] = E(RQ.fPhase(name, RQ.fLabel), trim(r.label) || null, null, g, name);
        out[g + ':pillar'] = E(RQ.fPhase(name, RQ.fPillar), r.default_pillar || null, null, g, name);
      });
    }
    return out;
  }
  /* the rows of the Phases of a Campaign (all of them, or only these) */
  const phaseRows = list => list.map(p => ({ phase_id: p.phase_id, label: p.label || '', start_date: p.start_date, end_date: p.end_date, budget_kol: p.budget_kol, default_pillar: p.default_pillar || '' }));
  /* what a request is now (or what it was when it was sent — last_submitted.values) */
  function requestSnapshot(state, ref) {
    const req = requestOf(state, ref); if (!req) return {};
    if (req.type === 'new_campaign') {
      const c = req.rec;
      return planSnapshot(state, { campaign_name: c.campaign_name, budget_kol: c.budget_kol, products: R.campaignProductCodes(state, c.campaign_id), note: c.note || '' },
        phaseRows(R.sortPhases((state.phases || []).filter(p => p.campaign_id === c.campaign_id))));
    }
    if (req.type === 'new_phase') return planSnapshot(state, null, phaseRows([req.rec]));
    if (req.type === 'change') {
      const f = req.carrier.fields || {}, rec = req.rec, out = {};
      if (req.kind === 'phase') {
        const p = Object.assign({}, rec, f), name = R.phaseName(state, rec.phase_id);
        if (f.delete) out['ph:' + rec.phase_id + ':delete'] = E(RQ.fPhase(name, RQ.fRemove), true, RQ.yes);
        if (f.start_date !== undefined || f.end_date !== undefined) out.period = E(RQ.fPhase(name, RQ.fPeriod), p.start_date + '|' + p.end_date, `${R.dmy(p.start_date)} – ${R.dmy(p.end_date)}`);
        if (f.budget_kol !== undefined) out.budget = E(RQ.fPhase(name, RQ.fPhaseBudget), R.money(f.budget_kol), moneyText(f.budget_kol));
        ['label', 'default_pillar'].forEach(k => { if (f[k] !== undefined) out[k] = E(RQ.fPhase(name, k === 'label' ? RQ.fLabel : RQ.fPillar), f[k] || null); });
        return out;
      }
      return planSnapshot(state, Object.fromEntries(['campaign_name', 'budget_kol', 'products', 'note'].filter(k => f[k] !== undefined).map(k => [k, f[k]])), null);
    }
    const x = req.rec, out = { type: E(RQ.fType, x.type, C.budget.types[x.type] || x.type), amount: E(RQ.fAmount, Number(x.amount || 0), moneyText(x.amount)), reason: E(RQ.fReason, trim(x.reason) || null) };
    (x.allocations || []).forEach(a => { out['alloc:' + a.phase_id] = E(RQ.fAlloc(a.phase_id === R.UNALLOCATED ? C.budget.unallocated : R.phaseName(state, a.phase_id)), Number(a.amount || 0), moneyText(a.amount)); });
    return out;
  }
  /* before → after: [{ key, label, from, to, kind 'changed' | 'added' | 'removed' }] — nothing changed = [] */
  function requestDiff(before, after) {
    const a = before || {}, b = after || {}, out = [], done = new Set();
    const groups = m => new Set(Object.values(m).map(x => x.g).filter(Boolean));
    const ga = groups(a), gb = groups(b);
    Object.keys(Object.assign({}, a, b)).forEach(k => {
      const x = a[k], y = b[k], g = (x || y).g;
      if (g && (!ga.has(g) || !gb.has(g))) {
        if (done.has(g)) return; done.add(g);
        const add = gb.has(g), e = add ? y : x;
        out.push({ key: g, label: add ? RQ.added(e.gl) : RQ.removed(e.gl), from: add ? '—' : RQ.phaseLine(x.text, (a[g + ':budget'] || {}).text), to: add ? RQ.phaseLine(y.text, (b[g + ':budget'] || {}).text) : '—', kind: add ? 'added' : 'removed' });
        return;
      }
      if (same(x ? x.value : null, y ? y.value : null)) return;
      out.push({ key: k, label: (y || x).label, from: x ? x.text : '—', to: y ? y.text : '—', kind: 'changed' });
    });
    return out;
  }
  /* "3 changes · Phase 2 period · KOL budget" (the Planner footer) */
  const diffSummary = list => (list.length ? [RQ.nChanges(list.length)].concat(list.slice(0, 3).map(x => x.label)).join(' · ') + (list.length > 3 ? ' · …' : '') : '');

  /* ===================== the one way a request changes state ===================== */
  const fail = err => ({ ok: false, err, events: [] });
  const okEv = events => ({ ok: true, err: null, events });
  const clearReturned = car => Object.assign(car, { returned_reason: null, returned_by: null, returned_at: null });
  /* the Phases that go with a New campaign (none of them approved yet) */
  const ownPhases = (state, cid) => (state.phases || []).filter(p => p.campaign_id === cid && !R.isApproved(p));
  /* the record's state follows the request (a New campaign: its Phases too · its first budget row follows it — CR-18) */
  function setState(state, req, st, ctx) {
    const sent = st === 'pending' ? { submitted_by: ctx.user || null, submitted_at: ctx.now } : {};
    if (req.type === 'new_campaign') {
      const c = req.rec, ps = ownPhases(state, c.campaign_id);
      c.approval_status = st; c.approval = Object.assign({}, c.approval, sent);
      ps.forEach(p => { p.approval_status = st; p.approval = Object.assign({}, p.approval, sent); });
      if (R.syncInitial) R.syncInitial(state, c.campaign_id, ctx.user, ctx.now);
    } else if (req.type === 'new_phase') { req.rec.approval_status = st; req.rec.approval = Object.assign({}, req.rec.approval, sent); }
    else if (req.type === 'change') { req.carrier.status = st; if (st === 'pending') req.carrier.requested_at = ctx.now; }
    else { req.rec.status = st; if (st === 'pending') req.rec.requested_at = ctx.now; }
  }
  /* approved: the record takes it (a change is applied · a budget change moves the money) → the event */
  function applyApproved(state, req, ctx, ev, o) {
    const dec = { decided_by: ctx.user || null, decided_at: ctx.now, reason: null };
    if (req.type === 'new_campaign' || req.type === 'new_phase') {
      const list = req.type === 'new_campaign' ? [req.rec].concat(ownPhases(state, req.campaign_id)) : [req.rec];
      list.forEach(r => { r.approval_status = 'approved'; r.approval = Object.assign({}, r.approval, dec); });
      if (req.type === 'new_campaign' && R.syncInitial) R.syncInitial(state, req.campaign_id, ctx.user, ctx.now);
      return [ev('approved', { note: o.note })];
    }
    if (req.type === 'change') {
      const f = R.applyChange(state, req.kind, req.rec);
      if (req.kind !== 'phase' && f.budget_kol !== undefined && R.syncInitial) R.syncInitial(state, req.campaign_id, ctx.user, ctx.now);
      return [ev('change_approved', { fields: f, note: o.note })];
    }
    Object.assign(req.rec, { status: 'approved', decided_by: ctx.user || null, decided_at: ctx.now });
    R.applyBudgetChange(state, req.rec);
    return [ev('approved', { fields: { type: req.rec.type, amount: req.rec.amount, allocations: req.rec.allocations }, note: o.note })];
  }
  /* a draft deleted: a New campaign with its Phases, products and budget rows · a New phase · a change · a budget change */
  function removeDraft(state, req) {
    const clearPosts = ids => (state.deal_posts || []).forEach(p => { if (ids.has(p.phase_override)) p.phase_override = null; });
    if (req.type === 'new_campaign') {
      const cid = req.campaign_id, ids = new Set((state.phases || []).filter(p => p.campaign_id === cid).map(p => p.phase_id));
      state.phases = state.phases.filter(p => !ids.has(p.phase_id)); clearPosts(ids);
      state.campaigns = state.campaigns.filter(c => c.campaign_id !== cid);
      if (R.setCampaignProducts) R.setCampaignProducts(state, cid, []);
      if (R.dropBudgetChanges) R.dropBudgetChanges(state, cid);
    } else if (req.type === 'new_phase') { state.phases = state.phases.filter(p => p !== req.rec); clearPosts(new Set([req.phase_id])); }
    else if (req.type === 'change') req.rec.pending_change = null;
    else state.campaign_budget_changes = budgetRows(state).filter(x => x !== req.rec);
  }
  /* ref (an id / a card) · to 'draft' | 'pending' | 'approved' | 'cancelled' | 'deleted' · ctx { eventId(), now, user } ·
     o { reason (Return to draft — 5 characters or more), withdraw (Withdraw to draft), note (a note / the manager's comment), direct (Create / Apply at once) } →
     { ok, err, events } — the events are not pushed (the caller pushes them with the rest it writes)
     draft → draft = Save draft · draft → pending = Submit (Round +1 the first time and after a return · a withdrawn one keeps its Round) ·
     pending → draft = Return to draft (a reason) / Withdraw to draft · pending → approved = Approve (draft → approved only with o.direct: a manager's own) ·
     draft | pending → cancelled = Cancel request (a change / budget change) · draft → deleted = Delete draft · nothing leaves approved */
  function requestTransition(state, ref, to, ctx, o = {}) {
    const req = requestOf(state, ref); if (!req) return fail('not_found');
    const from = req.status, car = req.carrier;
    if (!REQUEST_STATES.includes(from)) return fail('closed');
    if (from === 'approved') return fail('approved');
    const ev = (name, x = {}) => R.approvalEvent(ctx, req.campaign_id, name, Object.assign({ from, phase_id: req.phase_id, requested_by: req.by, request: req.type, change_id: req.change_id, round: car.submit_round || 0 }, x));
    if (to === 'draft' && from === 'draft') return okEv([ev('draft_saved', { note: o.note })]);
    if (to === 'pending') {
      if (from !== 'draft') return fail('not_draft');
      const first = !(car.submit_round > 0);
      if (first || car.returned_at) car.submit_round = (car.submit_round || 0) + 1;
      clearReturned(car);
      if (trim(o.note) && req.type !== 'change' && !req.change_id) req.rec.approval = Object.assign({}, req.rec.approval, { note: trim(o.note) });
      else if (trim(o.note)) car.note = trim(o.note);
      setState(state, req, 'pending', ctx);
      return okEv([ev(first ? (req.type === 'change' ? 'change_requested' : 'submitted') : 'resubmitted', { note: o.note, fields: req.type === 'change' ? car.fields : null })]);
    }
    if (to === 'draft' && from === 'pending') {
      if (o.withdraw) { setState(state, req, 'draft', ctx); return okEv([ev('withdrawn')]); }
      const reason = trim(o.reason);
      if (reason.length < MIN_REASON) return fail('reason');
      if (R.looksSensitive(reason)) return fail('sensitive');
      car.last_submitted = { round: car.submit_round || 1, at: ctx.now, by: ctx.user || null, reason, values: requestSnapshot(state, req) };
      Object.assign(car, { returned_reason: reason, returned_by: ctx.user || null, returned_at: ctx.now });
      setState(state, req, 'draft', ctx);
      return okEv([ev('returned', { reason })]);
    }
    if (to === 'approved') {
      if (from !== 'pending' && !(from === 'draft' && o.direct)) return fail('not_pending');
      if (from === 'draft') { car.submit_round = car.submit_round || 1; clearReturned(car); }
      return okEv(applyApproved(state, req, ctx, ev, o));
    }
    if (to === 'cancelled') {
      if (req.type !== 'change' && !req.change_id) return fail('kind');
      const f = req.type === 'change' ? car.fields : { type: req.rec.type, amount: req.rec.amount, allocations: req.rec.allocations };
      if (req.type === 'change') req.rec.pending_change = null;
      else Object.assign(req.rec, { status: 'cancelled', decided_by: ctx.user || null, decided_at: ctx.now });
      return okEv([ev('change_cancelled', { fields: f })]);
    }
    if (to === 'deleted') {
      if (from !== 'draft') return fail('not_draft');
      const e = ev('draft_deleted', { fields: req.type === 'change' ? car.fields : null });
      removeDraft(state, req);
      return okEv([e]);
    }
    return fail('transition');
  }
  /* a Return to draft reason: 5 characters or more · no account / ID / phone numbers */
  function validateReturn(reason) {
    const t = trim(reason), errs = [];
    if (t.length < MIN_REASON) errs.push({ field: 'reason', msg: RQ.reasonMin(MIN_REASON) });
    else if (R.looksSensitive(t)) errs.push({ field: 'reason', msg: C.msg.sensitive });
    return { errs, warns: [], infos: [] };
  }

  /* ===================== the lists ===================== */
  const isAdmin = user => !!user && user.role === 'admin';
  const card = req => ({ id: req.id, type: req.type, kind: req.kind, campaign_id: req.campaign_id, phase_id: req.phase_id, change_id: req.change_id, by: req.by, at: req.at, note: req.note,
    round: req.round, status: req.status, returned: req.returned });
  /* every request in a state ('pending' · 'draft'), oldest first (a New phase of a Campaign that is not approved goes with its Campaign) */
  function requestsIn(state, st) {
    const out = [], add = id => { const r = requestOf(state, id); if (r && r.status === st) out.push(card(r)); };
    (state.campaigns || []).forEach(c => {
      if (!R.isApproved(c)) { add(requestIdOf('campaign', c.campaign_id)); return; }
      if (c.pending_change) add(requestIdOf('change', c.campaign_id));
      R.sortPhases((state.phases || []).filter(p => p.campaign_id === c.campaign_id)).forEach(p => {
        if (!R.isApproved(p)) add(requestIdOf('phase', p.phase_id)); else if (p.pending_change) add(requestIdOf('change', p.phase_id));
      });
    });
    budgetRows(state).filter(x => x.type !== 'initial').forEach(x => add(requestIdOf('budget', x.change_id)));
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
  }
  /* the drafts one person sees (their own · an Admin every one) — returned ones first (newest return first), then the newest */
  function draftRequests(state, user) {
    return requestsIn(state, 'draft').filter(r => isAdmin(user) || (user && r.by === user.user_id))
      .sort((a, b) => (b.returned ? 1 : 0) - (a.returned ? 1 : 0) || String((b.returned || {}).at || b.at).localeCompare(String((a.returned || {}).at || a.at)));
  }
  /* the decided ones, newest first — Approved · Returned (the old Rejected read as Returned) */
  function decidedFrom(state) {
    const OK = ['approved', 'change_approved'], BACK = ['returned', 'rejected', 'change_rejected'];
    return (state.campaign_events || []).filter(e => e.type === 'approval' && e.from === 'pending' && (OK.includes(e.to) || BACK.includes(e.to)))
      .map(e => {
        const ok = OK.includes(e.to);
        const type = e.change_id ? e.request || 'budget_' + ((e.fields || {}).type || 'increase') : e.request === 'change' || e.to.startsWith('change_') ? 'change' : e.phase_id ? 'new_phase' : 'new_campaign';
        return { id: 'ev:' + e.event_id, type, campaign_id: e.campaign_id, phase_id: e.phase_id || null, change_id: e.change_id || null, by: e.requested_by || null, decided_by: e.changed_by || null,
          decided_at: e.changed_at, result: ok ? 'approved' : 'returned', reason: ok ? null : e.note || null, note: ok ? e.note || null : null, fields: e.fields || null, round: e.round || 1, seq: Number(e.event_id) || 0 };
      }).sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)) || b.seq - a.seq);
  }
  /* a request's own approval rows, oldest first (History of the review) */
  function requestHistory(state, ref) {
    const req = requestOf(state, ref); if (!req) return [];
    return (state.campaign_events || []).filter(e => e.type === 'approval' && e.campaign_id === req.campaign_id && (req.change_id ? e.change_id === req.change_id
      : !e.change_id && (req.type === 'new_phase' ? e.phase_id === req.phase_id : req.type === 'change' ? (e.request === 'change' || String(e.to).startsWith('change_')) && (e.phase_id || null) === (req.phase_id || null)
        : !e.phase_id && e.request !== 'change' && !String(e.to).startsWith('change_'))))
      .sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
  }
  /* what changed since the round that was returned (Round 2 and on): the list + the reason of that round · null for Round 1 */
  function sinceLastRound(state, ref) {
    const req = requestOf(state, ref); if (!req) return null;
    const ls = req.carrier.last_submitted; if (!ls || !(req.round >= 2)) return null;
    return { round: ls.round, reason: ls.reason || '', by: ls.by || null, at: ls.at || null, changes: requestDiff(ls.values, requestSnapshot(state, req)) };
  }

  /* ===================== the Planner: Save draft vs Submit (U8) ===================== */
  /* mode 'draft': the Campaign name (not used by another) and nothing sensitive · 'submit': everything (KOL budget above ฿0 unless o.budgetLocked ·
     products for a Campaign that is not approved yet · the Phases) */
  function validatePlan(state, camp, rows, deletedIds, mode, o = {}) {
    if (mode === 'draft') {
      const v = R.validateCampaign(state, { campaign_id: camp.campaign_id || null, campaign_name: camp.campaign_name, note: camp.note });
      return { errs: v.errs, warns: [], infos: [] };
    }
    const res = R.validatePhasePlan(state, camp, rows, deletedIds || [], { pctUsed: false, budgetRequired: !o.budgetLocked });
    const c = camp.campaign_id ? campaignOf(state, camp.campaign_id) : null;
    const pr = R.checkCampaignProducts(state, c && R.isApproved(c) ? camp.campaign_id : null, camp.products || []);
    res.errs.push(...pr.errs); res.warns.push(...pr.warns);
    if (R.looksSensitive(camp.note)) res.errs.push({ field: 'note', msg: C.msg.sensitive });
    return res;
  }

  /* ===================== schema 20 ===================== */
  /* rejected → draft + returned_* (from the latest rejected event) · submit_round = the submitted events there are · approved ones untouched ·
     a change that was rejected → a returned draft change · twice → the same */
  function migrateV20(obj) {
    const evs = (obj.campaign_events || []).filter(e => e.type === 'approval').slice().sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
    const last = f => evs.filter(f).pop() || null, count = f => evs.filter(f).length;
    const isC = cid => e => e.campaign_id === cid && !e.phase_id && !e.change_id && e.request !== 'change';
    const isP = pid => e => e.phase_id === pid && !e.change_id && e.request !== 'change' && !String(e.to).startsWith('change_');
    const returnedOf = (e, a) => ({ returned_reason: (e && e.note) || (a && a.reason) || null, returned_by: (e && e.changed_by) || (a && a.decided_by) || null, returned_at: (e && e.changed_at) || (a && a.decided_at) || null });
    const fix = (rec, f, id) => {
      if (rec.approval_status === 'rejected') {
        Object.assign(rec, returnedOf(last(e => f(e) && e.to === 'rejected'), rec.approval), { approval_status: 'draft' });
        rec.submit_round = Math.max(1, count(e => f(e) && e.to === 'submitted'));
        rec.last_submitted = { round: rec.submit_round, at: rec.returned_at, by: rec.returned_by, reason: rec.returned_reason, values: requestSnapshot(obj, id) };
      } else if (rec.approval_status === 'pending' && rec.submit_round === undefined) rec.submit_round = Math.max(1, count(e => f(e) && e.to === 'submitted'));
      /* a change that was rejected (and nothing asked since) → a returned draft of that change · one that waits → status pending */
      const pc = rec.pending_change;
      if (pc && !pc.status) { pc.status = 'pending'; if (pc.submit_round === undefined) pc.submit_round = 1; }
      if (rec.change_rejected) {
        const cr = rec.change_rejected;
        if (!rec.pending_change) rec.pending_change = { status: 'draft', fields: cr.fields || {}, requested_by: cr.requested_by || null, requested_at: cr.decided_at || null, submit_round: 1,
          returned_reason: cr.reason || null, returned_by: cr.decided_by || null, returned_at: cr.decided_at || null };
        delete rec.change_rejected;
      }
    };
    (obj.campaigns || []).forEach(c => fix(c, isC(c.campaign_id), requestIdOf('campaign', c.campaign_id)));
    (obj.phases || []).forEach(p => fix(p, isP(p.phase_id), requestIdOf('phase', p.phase_id)));
    (obj.campaign_budget_changes || []).forEach(x => {
      if (x.status === 'rejected') {
        Object.assign(x, { status: 'draft', returned_reason: x.reject_reason || null, returned_by: x.decided_by || null, returned_at: x.decided_at || null, reject_reason: null, decided_by: null, decided_at: null });
        x.submit_round = Math.max(1, count(e => e.change_id === x.change_id && e.to === 'submitted'));
        if (x.type !== 'initial') x.last_submitted = { round: x.submit_round, at: x.returned_at, by: x.returned_by, reason: x.returned_reason, values: requestSnapshot(obj, requestIdOf('budget', x.change_id)) };
      } else if (x.status === 'pending' && x.submit_round === undefined) x.submit_round = Math.max(1, count(e => e.change_id === x.change_id && e.to === 'submitted'));
    });
    obj.schema_version = Math.max(obj.schema_version || 0, 20);
    return obj;
  }

  return { REQUEST_STATES, MIN_REASON, ownerOf, requestOf, requestIdOf, planSnapshot, requestSnapshot, requestDiff, diffSummary, requestTransition, validateReturn,
    requestsIn, draftRequests, decidedFrom, requestHistory, sinceLastRound, validatePlan, migrateV20 };
})(KT.rules, KT.content));
