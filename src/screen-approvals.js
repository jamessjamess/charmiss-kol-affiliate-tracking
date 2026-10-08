/* screen-approvals.js — CR-17 v1.2 §4.5 · CR-18 §4.3: the Approvals tab of Campaign & Phase (#campaigns/approvals). One card a request, oldest first:
   New campaign · New phase · Change · Budget increase / decrease — the short facts a manager needs (Period with how soon it starts · Budget · Phases with
   a small timeline · Pillar target · Products · CTA · overlaps · Field / Current / Requested · Used % before → after) · Approve / Reject (a reason) /
   Open details. Pending · Decided · Type · Approve selected · Undo for 10 s. Admin / KOL Manager see every request; Staff see their own (My requests).
   Drawn by screen-campaign.js inside #cp_body. → KT.approvals */
KT.approvals = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, commit, toastAction, checksHTML, userId, range, dm } = U;
  const AP = C.approval, B = C.budget, K = C.campaign;
  const ap = { state: 'pending', type: '', sel: new Set() };
  let host = null, hooks = {};
  const mgr = () => R.canApprove(U.actor());
  const campById = id => state().campaigns.find(c => c.campaign_id === id);
  const phaseById = id => state().phases.find(p => p.phase_id === id);
  const who = id => (id === 'system' ? B.system : id ? R.changedByName(state(), id) : AP.someone);
  const day = iso => (iso ? R.dmy(R.dateOfTimestamp(iso)) : '—');
  const ago = iso => (iso ? AP.ago(Math.max(0, R.dayDiff(today(), R.dateOfTimestamp(iso)))) : '');
  /* the tab: Approvals n (a manager: every request) · My requests n (Staff: their own) · null for anyone else */
  function tabLabel() {
    const me = U.actor(); if (!R.canDraft(me) && !R.canApprove(me)) return null;
    const n = R.requestsFor(state(), me, { state: 'pending' }).length;
    return { text: mgr() ? AP.tabApprovals : AP.tabMine, n };
  }
  /* "Starts in 24 days" · "Starts today" · "Started 7 days ago" */
  function timingText(start) {
    const t = R.startTiming(start, today()); if (!t) return '';
    return t.kind === 'in' ? AP.startsIn(t.days) : t.kind === 'today' ? AP.startsToday : AP.startedAgo(t.days);
  }
  const kvl = (k, v, cls) => `<div class="kv${cls ? ' ' + cls : ''}"><span>${esc(k)}</span><b>${v}</b></div>`;
  const targetText = cid => { const c = campById(cid) || {}, t = R.pillarTargetOf(state(), cid); return `${R.PILLARS.filter(p => t[R.PILLAR_KEY[p]] != null).map(p => t[R.PILLAR_KEY[p]]).join(' / ')}${c.pillar_target ? '' : ` (${K.targetDefault})`}`; };
  const fieldLabel = k => ({ budget_kol: K.colBudget, pillar_target: K.pillarTarget, start_date: AP.fStart, end_date: AP.fEnd, delete: AP.fDelete }[k] || k);
  const fieldValue = (k, v) => (v == null || v === '' ? C.common.none : k === 'budget_kol' ? R.baht(Number(v)) : k === 'start_date' || k === 'end_date' ? R.dmy(v)
    : k === 'pillar_target' ? R.PILLARS.filter(p => v[R.PILLAR_KEY[p]] != null).map(p => `${p} ${v[R.PILLAR_KEY[p]]}%`).join(' / ') : k === 'delete' ? AP.removePhase : String(v));
  /* a small timeline of a Campaign's Phases (the grey ordinal ramp of CR-13) */
  function miniTimeline(cid) {
    const s = state(), ps = R.sortPhases(s.phases.filter(p => p.campaign_id === cid && R.isISODate(p.start_date) && R.isISODate(p.end_date)));
    if (!ps.length) return '';
    const from = ps[0].start_date, to = ps.map(p => p.end_date).sort().pop(), span = R.dayDiff(to, from) + 1, steps = R.phaseSteps(ps.length);
    return `<div class="apc-tl" aria-hidden="true">${ps.map((p, i) => `<span style="left:${R.dayDiff(p.start_date, from) / span * 100}%;width:${(R.dayDiff(p.end_date, p.start_date) + 1) / span * 100}%;background:${U.phaseVarAt(steps[i])}" title="${esc(`${R.phaseName(s, p.phase_id)} · ${dm(p.start_date)}–${dm(p.end_date)}`)}"></span>`).join('')}</div>`;
  }
  const periodLine = (a, z) => (a ? `${esc(range(a, z))} <span class="muted">(${esc(AP.days(R.dayDiff(z, a) + 1))} · ${esc(timingText(a))})</span>` : `<span class="muted">${esc(AP.noPeriod)}</span>`);
  const nameOf = r => { const s = state(), c = campById(r.campaign_id) || {}; return r.phase_id && (r.type === 'new_phase' || r.type === 'change') ? `${R.phaseName(s, r.phase_id)} › ${c.campaign_name || ''}` : c.campaign_name || r.campaign_id; };

  /* ---------- the body of a pending card ---------- */
  function newCampaignBody(r) {
    const s = state(), c = campById(r.campaign_id) || {}, [a, z] = R.campaignSpan(s, r.campaign_id), ps = s.phases.filter(p => p.campaign_id === r.campaign_id);
    const prods = R.campaignProductCodes(s, r.campaign_id).map(code => { const p = R.productByCode(s, code); return p ? R.productShort(p) : code; });
    const impact = R.sameTimeBudget(s, r.campaign_id);
    return kvl(AP.kPeriod, periodLine(a, z)) + kvl(AP.kBudget, R.isBlank(c.budget_kol) ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(c.budget_kol)) +
      kvl(AP.kPhases, esc(R.fmtNum(ps.length))) + miniTimeline(r.campaign_id) +
      kvl(AP.kProducts, prods.length ? `${esc(R.fmtNum(prods.length))} <span class="muted">· ${esc(prods.slice(0, 3).join(', '))}${prods.length > 3 ? ` +${prods.length - 3}` : ''}</span>` : '—') +
      kvl(AP.kCta, esc(c.cta || '—')) +
      (!R.isBlank(c.budget_kol) ? `<div class="apc-imp">${esc(AP.sameTime(R.baht(impact.before), R.baht(impact.after)))}</div>` : '');
  }
  function newPhaseBody(r) {
    const s = state(), p = phaseById(r.phase_id) || {}, x = R.newPhaseCheck(s, r.phase_id);
    return kvl(AP.kPeriod, periodLine(p.start_date, p.end_date)) + kvl(AP.kBudget, R.isBlank(p.budget_kol) ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(p.budget_kol)) +
      x.overlaps.map(o => `<div class="check warn">! <span>${esc(AP.overlaps(R.phaseName(s, o.phase_id), dm(o.from), dm(o.to)))}</span></div>`).join('') +
      `<div class="apc-imp${x.over ? ' late' : ''}">${esc(x.budget == null ? AP.noCampaignBudget : AP.phaseTotal(R.baht(x.total), R.baht(x.budget)))}${x.over ? ` · ${esc(AP.phaseOver(R.baht(x.total - x.budget)))}` : ''}</div>`;
  }
  function changeTable(fields, rec) {
    return `<div class="tablewrap"><table class="tbl compact-sm ap-tbl"><thead><tr><th>${esc(AP.colField)}</th><th>${esc(AP.colCurrent)}</th><th>${esc(AP.colRequested)}</th></tr></thead><tbody>` +
      Object.entries(fields || {}).map(([k, v]) => `<tr><td>${esc(fieldLabel(k))}</td><td>${esc(k === 'delete' || !rec ? '—' : k === 'pillar_target' && rec[k] == null && rec.campaign_id ? targetText(rec.campaign_id) : fieldValue(k, rec[k]))}</td><td><b>${esc(fieldValue(k, v))}</b></td></tr>`).join('') + `</tbody></table></div>`;   // (no own target = the default one)
  }
  function changeBody(r) {
    const s = state(), rec = r.kind === 'phase' ? phaseById(r.phase_id) : campById(r.campaign_id); if (!rec || !rec.pending_change) return '';
    const x = R.changeImpact(s, r);
    return changeTable(rec.pending_change.fields, rec) + (r.kind === 'phase' ? `<div class="apc-imp">${esc(x.moved ? AP.postsMove(x.moved, x.deals) : AP.noMove)}</div>` : '');
  }
  function budgetBody(r) {
    const s = state(), x = (s.campaign_budget_changes || []).find(b => b.change_id === r.change_id); if (!x) return '';
    const im = R.budgetChangeImpact(s, x), pct = v => (v == null ? '—' : `${Math.round(v)}%`);
    return `<div class="apc-big">${esc(AP.budgetLine(im.before == null ? '฿0' : R.baht(im.before), R.baht(im.after), KT.budget.sbaht(im.delta)))}</div>` +
      kvl(AP.committedL, `${R.baht(im.committed)} <span class="muted">· ${esc(AP.usedLine(pct(im.usedBefore), pct(im.usedAfter)))}</span>`) +
      `<div class="apc-sub">${esc(AP.allocTitle)}</div><div class="tablewrap"><table class="tbl compact-sm ap-tbl"><tbody>` +
      (x.allocations || []).map(a => `<tr><td>${a.phase_id === R.UNALLOCATED ? `<span class="muted">${esc(B.unallocated)}</span>` : esc(R.phaseName(s, a.phase_id))}</td><td class="num"><b>${esc(KT.budget.sbaht((x.type === 'decrease' ? -1 : 1) * a.amount))}</b></td></tr>`).join('') +
      `</tbody></table></div>` + kvl(AP.reasonL2, esc(x.reason || '—'));
  }
  const BODY = { new_campaign: newCampaignBody, new_phase: newPhaseBody, change: changeBody, budget_increase: budgetBody, budget_decrease: budgetBody };

  /* ---------- a card ---------- */
  function cardHTML(r) {
    const decided = !!r.result, isMgr = mgr(), mine = r.by && r.by === userId();
    const pick = !decided && isMgr ? `<label class="apc-cb"><input type="checkbox" data-apsel="${esc(r.id)}"${ap.sel.has(r.id) ? ' checked' : ''} aria-label="${esc(AP.selectCard)}"></label>` : '';
    const head = `<div class="apc-h">${pick}<div class="apc-t"><b>${esc(nameOf(r))}</b> <span class="apt ${esc(r.type)}">${esc(AP.types[r.type] || r.type)}</span>` +
      `<div class="muted small">${esc(decided ? AP.submittedBy(who(r.by), '') .replace(/ · $/, '') : AP.submittedAgo(who(r.by), day(r.at), ago(r.at)))}</div></div></div>`;
    let body = '', foot = '';
    if (!decided) {
      body = (BODY[r.type] || (() => ''))(r) + (r.note ? `<div class="apc-note"><span class="muted small">${esc(AP.noteFrom(who(r.by)))}</span><div>${esc(r.note)}</div></div>` : '');
      const cancel = (r.type === 'change' || r.change_id) && (mine || isMgr) ? `<button type="button" class="btn small" data-apcancel="${esc(r.id)}">${esc(AP.cancelRequest)}</button>` : '';
      foot = `<button type="button" class="btn small" data-apopen="${esc(r.id)}">${esc(AP.openDetails)}</button>${cancel}<span class="spacer"></span>` +
        (isMgr ? `<button type="button" class="btn small" data-apreject="${esc(r.id)}">${esc(AP.reject)}</button><button type="button" class="btn small primary" data-apapprove="${esc(r.id)}">${esc(AP.approve)}</button>` : `<span class="muted small">${esc(AP.waitingFor)}</span>`);
    } else {
      const ok = r.result === 'approved';
      body = (r.type === 'change' && r.fields ? changeTable(r.fields, null) : '') + (r.change_id && r.fields ? kvl(AP.kBudget, esc(KT.budget.sbaht((r.fields.type === 'decrease' ? -1 : 1) * Number(r.fields.amount || 0)))) : '');
      foot = `<span class="st ${ok ? 'complete' : 'cancel'}">${esc(ok ? C.budget.statuses.approved : C.phaseStatus.rejected)}</span> <span class="small">${esc(ok ? AP.approvedBy(who(r.decided_by), day(r.decided_at)) : AP.rejectedByLine(who(r.decided_by), day(r.decided_at)))}</span>` +
        `<span class="spacer"></span><button type="button" class="btn small" data-apopen="${esc(r.id)}">${esc(AP.openDetails)}</button>` +
        (!ok && r.reason ? `<div class="check err apc-why">✕ <span>${esc(AP.rejectedColon(r.reason))}</span></div>` : '');
    }
    return `<article class="card apc${decided ? ' done' : ''}" data-apcard="${esc(r.id)}">${head}<div class="apc-b">${body}</div><div class="apc-f">${foot}</div></article>`;
  }

  /* ---------- the view ---------- */
  function render(el, o = {}) {
    host = el; hooks = o;
    const s = state(), me = U.actor(), isMgr = mgr();
    const list = R.requestsFor(s, me, { state: ap.state, type: ap.type });
    ap.sel.forEach(id => { if (!list.some(r => r.id === id)) ap.sel.delete(id); });
    const nPending = R.requestsFor(s, me, { state: 'pending' }).length;
    const types = [['', AP.typeAll], ['new_campaign', AP.types.new_campaign], ['new_phase', AP.types.new_phase], ['change', AP.types.change], ['budget', AP.types.budget]];
    const tools = `<div class="toolbar ap-tools"><div class="seg" role="group" aria-label="${esc(AP.typeL)}"><button type="button" data-apstate="pending" class="${ap.state === 'pending' ? 'on' : ''}">${esc(AP.fPending)} <span class="n">${R.fmtNum(nPending)}</span></button>` +
      `<button type="button" data-apstate="decided" class="${ap.state === 'decided' ? 'on' : ''}">${esc(AP.fDecided)}</button></div>` +
      `<select id="ap_type" aria-label="${esc(AP.typeL)}">${types.map(([v, l]) => `<option value="${v}"${ap.type === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><span class="spacer"></span>` +
      (isMgr && ap.state === 'pending' ? `<button type="button" class="btn small primary" data-apbulk${ap.sel.size ? '' : ' disabled'}>${esc(AP.approveSelected(ap.sel.size))}</button>` : '') + `</div>`;
    const empty = ap.type ? AP.emptyType : ap.state === 'decided' ? AP.emptyDecided : isMgr ? AP.emptyPending : AP.emptyMine;
    el.innerHTML = tools + (list.length ? `<div class="apc-grid">${list.map(cardHTML).join('')}</div>` : `<div class="card empty"><b>${esc(empty)}</b></div>`);
    el.onclick = onClick; el.onchange = onChange;
  }
  const redraw = () => { if (host && host.isConnected) render(host, hooks); if (hooks.after) hooks.after(); };
  function onChange(e) {
    const t = e.target;
    if (t.id === 'ap_type') { ap.type = t.value; ap.sel.clear(); redraw(); return; }
    if (t.dataset.apsel) { t.checked ? ap.sel.add(t.dataset.apsel) : ap.sel.delete(t.dataset.apsel); const b = host.querySelector('[data-apbulk]'); if (b) { b.disabled = !ap.sel.size; b.textContent = AP.approveSelected(ap.sel.size); } }
  }
  const findReq = id => R.requestById(state(), id);
  const ctxOf = () => { let e = 0; const base = U.store.newCampaignEventId(); return { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }; };
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.apstate) { ap.state = b.dataset.apstate; ap.sel.clear(); redraw(); return; }
    if (b.dataset.apopen) { openDetails(b.dataset.apopen); return; }
    if (b.dataset.apapprove) { decide([b.dataset.apapprove]); return; }
    if (b.dataset.apbulk != null) { decide([...ap.sel]); return; }
    if (b.dataset.apreject) { reject(b.dataset.apreject, b); return; }
    if (b.dataset.apcancel) { cancel(b.dataset.apcancel); }
  }
  function openDetails(id) {
    const r = findReq(id) || R.decidedRequests(state()).find(x => x.id === id); if (!r || !hooks.open) return;
    if (r.phase_id && phaseById(r.phase_id)) hooks.open('phase', r.phase_id); else hooks.open('campaign', r.campaign_id);
  }
  /* Approve one or more cards (one Undo for all of them) */
  function decide(ids) {
    if (!U.guard('campaign.approve') || !ids.length) return;
    const s = state(), snaps = new Map(), evIds = [];
    let n = 0;
    ids.forEach(id => {
      const r = findReq(id); if (!r) return;
      if (!snaps.has(r.campaign_id)) snaps.set(r.campaign_id, R.decisionSnapshot(s, r.campaign_id));
      const evs = R.approveRequest(s, r, ctxOf()); if (!evs.length) return;
      s.campaign_events.push(...evs); evs.forEach(x => evIds.push(x.event_id)); n++;
    });
    if (!n) return;
    ap.sel.clear();
    const one = ids.length === 1 ? findDecidedName(ids[0]) : null;
    commit(); redraw();
    toastAction(one ? AP.approved(one) : AP.approvedN(n), C.deal.undo, () => undo(snaps, evIds), 10000);
  }
  const findDecidedName = id => { const [kind, key] = id.split(':'); const s = state();
    if (kind === 'phase') return R.phaseName(s, key); if (kind === 'budget') { const x = (s.campaign_budget_changes || []).find(b => b.change_id === key); return x ? (campById(x.campaign_id) || {}).campaign_name : key; }
    const p = phaseById(key); return p ? R.phaseName(s, key) : (campById(key) || {}).campaign_name || key; };
  function undo(snaps, evIds) {
    const s = state(); [...snaps.values()].reverse().forEach(sn => R.restoreSnapshot(s, sn, evIds));
    commit(AP.undone); redraw();
  }
  /* Reject one card — a reason is needed */
  function reject(id, opener) {
    if (!U.guard('campaign.approve')) return;
    const r = findReq(id); if (!r) return;
    const name = nameOf(r);
    U.createModal({ size: 'S', title: AP.rejectTitle(name), opener, focus: '#ap_reason', foot: [`<div class="checks" id="ap_checks"></div>`, U.cmButtons(AP.reject, 'ap_ok', { danger: true, attrs: ' disabled' })],
      body: `<p class="hint" style="margin-top:0">${esc(AP.rejectHint)}</p><div class="field"><label for="ap_reason">${esc(AP.reasonL)} <span class="req">*</span></label><textarea id="ap_reason" rows="3"></textarea></div>` });
    const chk = () => { const v = R.validateDecision($('ap_reason').value); $('ap_ok').disabled = v.errs.length > 0; return v; };
    $('ap_reason').addEventListener('input', () => { chk(); $('ap_checks').innerHTML = ''; });
    $('ap_ok').addEventListener('click', () => {
      const v = chk(); if (v.errs.length) { $('ap_checks').innerHTML = checksHTML(v, ''); return; }
      if (!U.guard('campaign.approve')) return;
      const s = state(), req = findReq(id); if (!req) { U.closeModal(); return; }
      const snap = R.decisionSnapshot(s, req.campaign_id), evs = R.rejectRequest(s, req, $('ap_reason').value, ctxOf()); if (!evs || !evs.length) return;
      s.campaign_events.push(...evs); U.closeModal(); commit(); redraw();
      toastAction(AP.rejectedOne(name), C.deal.undo, () => undo(new Map([[req.campaign_id, snap]]), evs.map(x => x.event_id)), 10000);
    });
  }
  /* Cancel request (a change / a budget change — the one who asked, or a manager) */
  function cancel(id) {
    const s = state(), r = findReq(id); if (!r) return;
    const evs = r.change_id ? R.cancelBudgetChange(s, r.change_id, ctxOf()) : R.cancelRequest(s, r.kind, r.kind === 'phase' ? r.phase_id : r.campaign_id, ctxOf());
    if (!evs.length) return;
    s.campaign_events.push(...evs); commit(r.change_id ? B.cancelled : AP.requestCancelled); redraw();
  }
  function reset() { ap.sel.clear(); }

  return { render, tabLabel, timingText, reset, state: ap };
})();
