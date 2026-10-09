/* rules-close.js — CR-29 §3.5: a Campaign is Complete only when someone closes it (closed_at). Past its End date and not closed = Wrap-up (late posts,
   payments and metrics go on). Mark as complete → the Close campaign dialog: what is still open (warns, never blocks) · a Close note (required when
   something is open) · optionally cancel the open deals that have not reached Confirm QT. Staff ask (a request of type close — R.requestTransition,
   carried by campaign.close_request) · a KOL Manager / Admin closes at once · Reopen (Manager / Admin, a reason) → the status by the dates again.
   After close: no new deal (R.campaignBlocksNew) · no Adjust budget · the deals there are still work. Pure functions; adds to KT.rules
   (load after rules-request.js, before store.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { trim, isBlank } = R;
  const campaignOf = (state, id) => (state.campaigns || []).find(c => c.campaign_id === id) || null;
  const round2 = n => Math.round(n * 100) / 100;

  /* ---------- what is still open in a Campaign (the checklist of the dialog · the review: at send time and now) ---------- */
  /* { openDeals, early (open, before Confirm QT — the ones that may be cancelled with it), pay { n, amount } (every payment not paid yet), ships (shipments
     not delivered), metrics (posts whose numbers are due), money { budget, committed, usedPct }, outstanding (how many of the 4 are not 0) } */
  function closeChecklist(state, campaignId, today) {
    const deals = (state.deals || []).filter(d => d.campaign_id === campaignId), live = deals.filter(d => !R.isCancelled(d)), ids = new Set(live.map(d => d.deal_id));
    const open = live.filter(R.isOpenDeal), early = open.filter(d => R.isShortlist(state.lookups, d));
    const pq = R.payQueue ? R.payQueue(state, today).items.filter(x => x.campaign_id === campaignId && x.status !== 'paid' && x.status !== 'cancelled') : [];
    const ships = (state.sample_shipments || []).filter(sh => ids.has(sh.deal_id) && R.openShipment(sh) && sh.status !== 'not_required');
    const metrics = R.metricsDue ? R.metricsDue(state, { campaign: campaignId }, today).length : 0;
    const m = R.campaignMoney ? R.campaignMoney(state, campaignId) : { budget: null, committed: 0, usedPct: null };
    const out = { openDeals: open.length, early: early.length, earlyIds: early.map(d => d.deal_id), pay: { n: pq.length, amount: round2(pq.reduce((a, x) => a + ((x.tax || {}).gross || 0), 0)) },
      ships: ships.length, metrics, money: { budget: m.budget, committed: m.committed, usedPct: m.usedPct } };
    out.outstanding = [out.openDeals, out.pay.n, out.ships, out.metrics].filter(n => n > 0).length;
    return out;
  }
  /* the numbers kept with a request when it is sent (the review shows them next to now) */
  const checklistSnapshot = x => ({ openDeals: x.openDeals, early: x.early, pay: Object.assign({}, x.pay), ships: x.ships, metrics: x.metrics, money: Object.assign({}, x.money), outstanding: x.outstanding });

  /* ---------- who may ---------- */
  /* Mark as complete: an approved Campaign On going / Wrap-up (not closed · not cancelled · not on hold · nothing asked yet) · Staff ask · a manager closes */
  function canMarkComplete(state, c, today) {
    if (!c || !R.isApproved(c) || R.isClosed(c)) return false;
    const st = R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today);
    return st === 'ongoing' || st === 'wrap_up';
  }
  const canReopen = (c, user) => !!c && R.isClosed(c) && c.status_override !== 'cancelled' && R.canApprove(user);

  /* ---------- the dialog: note required when something is open · nothing sensitive ---------- */
  function validateClose(check, note) {
    const errs = [], t = trim(note);
    if (check && check.outstanding > 0 && !t) errs.push({ field: 'close_note', msg: C.close.noteRequired });
    if (t && R.looksSensitive(t)) errs.push({ field: 'close_note', msg: C.msg.sensitive });
    return { errs, warns: [], infos: [] };
  }
  function validateReopen(reason) {
    const t = trim(reason), errs = [];
    if (!t) errs.push({ field: 'reopen_reason', msg: C.close.reasonRequired });
    else if (R.looksSensitive(t)) errs.push({ field: 'reopen_reason', msg: C.msg.sensitive });
    return { errs, warns: [], infos: [] };
  }

  /* ---------- the request (Staff): campaign.close_request = { status draft | pending, note, cancel_open, requested_by, requested_at, checklist (at send),
     submit_round, returned_*, last_submitted } — the same carrier fields as a pending_change (CR-21) ---------- */
  function newCloseRequest(c, user, now, note, cancelOpen) {
    const was = c.close_request || {};
    c.close_request = Object.assign({ submit_round: 0, returned_reason: null, returned_by: null, returned_at: null, last_submitted: null, checklist: null }, was,
      { status: was.status || 'draft', note: trim(note) || null, cancel_open: !!cancelOpen, requested_by: (user || {}).user_id || was.requested_by || null, requested_at: now });
    return c.close_request;
  }
  const closeRequested = c => !!c && !!c.close_request && c.close_request.status === 'pending';

  /* ---------- close · reopen (the record; the events are pushed by the caller — R.requestTransition for a request) ---------- */
  /* o { by, at, note } — the Campaign is Complete from now · the request (if any) is done */
  function applyClose(c, o) {
    Object.assign(c, { closed_at: o.at, closed_by: o.by || null, close_note: trim(o.note) || null });
    c.close_request = null;
    return c;
  }
  /* back to the status by its dates · the close stays on record as an event */
  function applyReopen(c, o) {
    Object.assign(c, { closed_at: null, closed_by: null, close_note: null, reopened_at: o.at, reopened_by: o.by || null, reopen_reason: trim(o.reason) || null });
    return c;
  }
  /* a campaign_events row (type status: closed · reopened) */
  const statusEvent = (ctx, campaignId, to, note, o = {}) => Object.assign({ event_id: ctx.eventId(), campaign_id: campaignId, type: 'status', from: o.from || null, to, changed_at: ctx.now, changed_by: ctx.user || null, note: trim(note) || null },
    o.requested_by ? { requested_by: o.requested_by } : {});

  /* ---------- schema 22 ---------- */
  /* a Campaign that was Complete by its dates (its End date before the day the data is loaded · not cancelled / on hold / waiting) → closed on its End date
     by "system" (it stays Complete) · one not ended yet is untouched · every Campaign gets the new fields (null) · twice → the same */
  function migrateV22(obj, today) {
    (obj.campaigns || []).forEach(c => {
      ['closed_at', 'closed_by', 'close_note', 'reopened_at', 'reopened_by', 'reopen_reason', 'close_request'].forEach(k => { if (c[k] === undefined) c[k] = null; });
      if (c.closed_at || c.status_override || !R.isApproved(c)) return;
      const ps = (obj.phases || []).filter(p => p.campaign_id === c.campaign_id);
      if (R.campaignStatus(ps, today) !== 'complete') return;
      const end = ps.filter(p => R.isApproved(p) && R.isISODate(p.end_date)).map(p => p.end_date).sort().pop();
      if (!end || end >= today) return;
      Object.assign(c, { closed_at: end, closed_by: 'system' });
    });
    obj.schema_version = Math.max(obj.schema_version || 0, 22);
    return obj;
  }

  return { closeChecklist, checklistSnapshot, canMarkComplete, canReopen, validateClose, validateReopen, newCloseRequest, closeRequested, applyClose, applyReopen, closeStatusEvent: statusEvent, migrateV22 };
})(KT.rules, KT.content));
