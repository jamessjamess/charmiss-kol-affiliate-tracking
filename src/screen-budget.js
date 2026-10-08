/* screen-budget.js — CR-18 §4.3: Adjust budget (Increase / Decrease · the amount over the Phases and Unallocated · a reason) — Staff Submit for approval,
   Admin / KOL Manager Apply at once · "+฿x pending" next to a budget that waits · the Budget history of a Campaign. Opened from the Campaign drawer, the
   Campaign row ⋯ and the Phase Planner (a panel in place there). → KT.budget */
KT.budget = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, commit, toast, checksHTML, userId } = U;
  const B = C.budget, AP = C.approval;
  const round2 = n => Math.round(n * 100) / 100;
  const sbaht = v => (v < 0 ? '−' : '+') + R.baht(Math.abs(v));
  const UN = R.UNALLOCATED;
  const campById = id => state().campaigns.find(c => c.campaign_id === id);
  const who = id => (id === 'system' ? B.system : id ? R.changedByName(state(), id) : '—');
  const day = iso => (iso ? R.dmy(R.dateOfTimestamp(iso)) : '—');
  /* who may ask / apply (Admin · KOL Manager · Staff) */
  const canAdjust = () => U.can('campaign.draft');

  /* ---------- "+฿100,000 pending" (yellow · who / when / why in the tooltip) — key: a Phase id or 'unallocated' (none = the Campaign) ---------- */
  function pendingTagHTML(cid, key) {
    const s = state(), x = R.pendingBudgetChange(s, cid); if (!x) return '';
    const v = key ? R.pendingPhaseDelta(s, cid, key) : R.pendingDelta(s, cid); if (!v) return '';
    return ` <span class="bpend" title="${esc(B.pendingTip(who(x.requested_by), day(x.requested_at), x.reason || ''))}">${esc(B.pendingTag(sbaht(v)))}</span>`;
  }

  /* ---------- Budget history (the Campaign drawer) ---------- */
  const typeChip = t => `<span class="bh-t ${t}">${esc(B.types[t] || t)}</span>`;
  const stChip = st => `<span class="st ${st === 'approved' ? 'complete' : st === 'pending' ? 'apending' : st === 'rejected' ? 'cancel' : 'faded not_started'}">${esc(B.statuses[st] || st)}</span>`;
  function historyHTML(cid) {
    const s = state(), rows = R.budgetHistory(s, cid);
    if (!rows.length) return `<div class="hint">${esc(B.noHistory)}</div>`;
    const phases = a => (a || []).map(x => `<div>${esc(`${x.phase_id === UN ? B.unallocated : R.phaseName(s, x.phase_id)} ${R.baht(x.amount)}`)}</div>`).join('');   // one line each, wrapped (never cut)
    return `<div class="tablewrap"><table class="tbl compact-sm bh-tbl"><thead><tr><th>${esc(B.hDate)}</th><th>${esc(B.hType)}</th><th class="num">${esc(B.hAmount)}</th><th class="num">${esc(B.hAfter)}</th>` +
      `<th>${esc(B.hPhases)}</th><th>${esc(B.hBy)}</th><th>${esc(B.hDecided)}</th><th>${esc(B.hStatus)}</th></tr></thead><tbody>` +
      rows.slice().reverse().map(r => `<tr class="${r.status === 'rejected' || r.status === 'cancelled' ? 'muted' : ''}"><td class="nowrap">${esc(day(r.date))}</td><td>${typeChip(r.type)}</td>` +
        `<td class="num nowrap">${esc(r.type === 'initial' ? R.baht(r.amount) : sbaht(r.signed))}</td><td class="num nowrap">${r.after == null ? '—' : `<span class="${r.status === 'pending' ? 'muted' : ''}">${R.baht(r.after)}</span>`}</td>` +
        `<td class="bh-ph">${phases(r.allocations)}</td><td class="nowrap">${esc(who(r.requested_by))}</td><td class="nowrap">${esc(r.status === 'approved' || r.status === 'rejected' ? who(r.decided_by) : '—')}</td>` +
        `<td>${stChip(r.status)}</td></tr>` +
        /* the Reason (and why it was rejected) on a line of its own under the row — the table stays inside the drawer */
        (r.reason || r.reject_reason ? `<tr class="bh-r${r.status === 'rejected' || r.status === 'cancelled' ? ' muted' : ''}"><td colspan="8" class="bh-why"><span class="muted">${esc(B.hReason)}:</span> ${esc(r.reason || '—')}${r.reject_reason ? ` · <span class="late">${esc(AP.rejectedColon(r.reject_reason))}</span>` : ''}</td></tr>` : '')).join('') +
      `</tbody></table></div>`;
  }

  /* ===================== Adjust budget ===================== */
  let ab = null;
  /* o: { opener, onDone(rec) } · inside an open modal (the Phase Planner) it is a panel in place with ← Back */
  function open(cid, o = {}) {
    if (!U.guard('campaign.draft')) return;
    const c = campById(cid); if (!c) return;
    ab = { cid, type: 'increase', amount: '', allocs: {}, reason: '', note: '', touched: new Set(), submitted: false, o, inPanel: U.modalOpen() };
    const body = bodyHTML(), btns = U.cmButtons(R.canApprove(U.actor()) ? B.apply : B.submit, 'ab_ok', { back: ab.inPanel });
    if (ab.inPanel) U.modalPanel({ title: B.title(c.campaign_name), body, left: `<div class="checks" id="ab_checks"></div>`, buttons: btns, back: o.back });
    else U.createModal({ size: 'M', title: B.title(c.campaign_name), opener: o.opener, focus: '[data-ab="amount"]', body, foot: [`<div class="checks" id="ab_checks"></div>`, btns],
      onClick: onClick, onClose: () => { ab = null; } });
    wire();
  }
  const ask = () => !R.canApprove(U.actor());
  function bodyHTML() {
    const s = state(), c = campById(ab.cid), sum = R.campaignSummary(s, ab.cid), m = R.moneyOf(sum.budget, sum.committed, 0, 0), waiting = R.pendingBudgetChange(s, ab.cid);
    const cur = `<div class="ab-cur"><div><span>${esc(B.budgetL)}</span><b>${sum.budget == null ? esc(B.noBudgetYet) : R.baht(sum.budget)}</b></div>` +
      `<div><span>${esc(B.committedL)}</span><b>${R.baht(sum.committed)}${m.usedPct == null ? '' : ` <span class="muted">(${esc(B.usedL(Math.round(m.usedPct) + '%'))})</span>`}</b></div>` +
      `<div><span>${esc(B.remainingL)}</span><b class="${m.remaining < 0 ? 'late' : ''}">${m.remaining == null ? '—' : R.baht(m.remaining)}</b></div></div>`;
    if (waiting) {
      const mine = waiting.requested_by === userId() || R.canApprove(U.actor());
      return `<section class="sec"><div class="sec-h"><span>${esc(B.current)}</span></div>${cur}</section><div class="check warn ab-wait">! <span>${esc(B.pendingN(1, sbaht(R.pendingDelta(s, ab.cid))))} · ${esc(B.pendingTip(who(waiting.requested_by), day(waiting.requested_at), waiting.reason || ''))}</span>` +
        `${mine ? ` <button type="button" class="btn small" data-abcancel="${esc(waiting.change_id)}">${esc(B.cancelRequest)}</button>` : ''}</div>`;
    }
    const rows = R.validateBudgetChange(s, ab.cid, draft()).rows;
    return `<section class="sec"><div class="sec-h"><span>${esc(B.current)}</span></div>${cur}</section>
      <div class="fields ab-f"><div class="field"><label>${esc(B.type)}</label><div class="seg" role="group" aria-label="${esc(B.type)}" id="ab_type">` +
        `<button type="button" data-abtype="increase" class="on" aria-pressed="true">${esc(B.increase)}</button><button type="button" data-abtype="decrease" aria-pressed="false"${sum.budget ? '' : ' disabled'}>${esc(B.decrease)}</button></div></div>
        <div class="field"><label for="ab_amount">${esc(B.amount)} <span class="req">*</span></label><input id="ab_amount" class="numin" data-ab="amount" inputmode="numeric" autocomplete="off" placeholder="0"><div class="hint" id="ab_new"></div></div></div>
      <div class="field ab-alloc"><div class="ab-ah"><label>${esc(B.allocateTo)}</label><span class="spacer"></span><button type="button" class="btn small" data-aball>${esc(B.allIn)}</button><button type="button" class="btn small" data-absplit>${esc(B.splitPct)}</button></div>
        <div class="tablewrap"><table class="tbl compact-sm ab-tbl"><thead><tr><th>${esc(B.colPhase)}</th><th class="num">${esc(B.colNow)}</th><th class="num" id="ab_colch">${esc(B.colChangeInc)}</th><th class="num">${esc(B.colNew)}</th></tr></thead><tbody>` +
        rows.map(r => `<tr data-abrow="${esc(r.key)}"><td>${r.key === UN ? `<span class="muted">${esc(B.unallocated)}</span>` : `<span class="dotc" style="background:${U.phaseVar(r.key)}"></span>${esc(R.phaseName(s, r.key))}`}</td>` +
          `<td class="num nowrap">${r.now == null ? '—' : R.baht(r.now)}</td><td class="num"><input class="numin ab-in" data-abal="${esc(r.key)}" data-key="alloc_${esc(r.key)}" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="${esc(`${r.key === UN ? B.unallocated : R.phaseName(s, r.key)} · ${B.amount}`)}"></td><td class="num nowrap" data-abnew>${r.now == null ? '—' : R.baht(r.now)}</td></tr>`).join('') +
        `</tbody></table></div><div id="ab_sum" class="ab-sum"></div></div>
      <div class="field"><label for="ab_reason">${esc(B.reason)} <span class="req">*</span></label><input id="ab_reason" data-ab="reason" data-key="reason" placeholder="${esc(B.reasonPh)}" autocomplete="off"></div>
      ${ask() ? `<div class="field"><label for="ab_note">${esc(B.note)} <span class="muted small">${esc(AP.noteOptional)}</span></label><textarea id="ab_note" data-ab="note" data-key="note" rows="2" placeholder="${esc(AP.notePh)}"></textarea></div>` : ''}
      ${c && !R.isApproved(c) ? `<div class="check warn">! <span>${esc(B.notApproved)}</span></div>` : ''}`;
  }
  const draft = () => ({ type: ab.type, amount: ab.amount, reason: ab.reason, note: ab.note, allocations: Object.entries(ab.allocs).map(([k, v]) => ({ phase_id: k, amount: v })) });
  function wire() {
    const root = $('cm_root'); if (!root) return;
    root.addEventListener('input', onInput);
    root.addEventListener('focusout', e => { const t = e.target; if (!ab || !t.classList || !t.classList.contains('numin')) return; const v = R.money(t.value); if (v != null && v >= 0) t.value = R.fmtNum(v); if (t.dataset.key || t.dataset.ab) ab.touched.add(t.dataset.key || t.dataset.ab); refresh(); });
    if (ab.inPanel) root.addEventListener('click', onClick);
    refresh();
  }
  function onInput(e) {
    if (!ab) return;
    const t = e.target;
    if (t.dataset.ab) ab[t.dataset.ab] = t.value;
    else if (t.dataset.abal) ab.allocs[t.dataset.abal] = t.value;
    else return;
    refresh();
  }
  /* what the rows / the totals / the button say now (typing keeps its focus) */
  function refresh() {
    if (!ab || !$('ab_checks')) return null;
    const s = state(), v = R.validateBudgetChange(s, ab.cid, draft()), ok = $('ab_ok');
    if (v.waiting) { $('ab_checks').innerHTML = ''; if (ok) ok.disabled = true; return v; }
    const dec = ab.type === 'decrease';
    if ($('ab_colch')) $('ab_colch').textContent = dec ? B.colChangeDec : B.colChangeInc;
    if ($('ab_new')) $('ab_new').textContent = v.amount > 0 ? B.newBudget(R.baht(v.newBudget)) : '';
    (v.rows || []).forEach(r => { const tr = document.querySelector(`[data-abrow="${CSS.escape(r.key)}"]`); if (!tr) return;
      const bad = v.errs.some(e => e.field === 'alloc_' + r.key);
      tr.querySelector('[data-abnew]').innerHTML = r.change ? `<b class="${bad ? 'late' : ''}">${R.baht(r.after)}</b>` : (r.now == null ? '—' : R.baht(r.now));
      tr.querySelector('input').classList.toggle('invalid', bad); });
    const alloc = v.errs.find(e => e.kind === 'alloc');
    if ($('ab_sum')) $('ab_sum').innerHTML = v.amount > 0 ? `<span class="${alloc ? 'late' : 'ok'}">${esc(B.allocatedOf(R.baht(v.allocated), R.baht(v.amount)))}</span>` : '';
    /* the messages: the allocation total as soon as an amount is typed · the rest once touched (or after Submit) */
    const show = e => ab.submitted || e.kind === 'alloc' || e.field.startsWith('alloc_') || ab.touched.has(e.field) || (e.field === 'amount' && !R.isBlank(ab.amount));
    $('ab_checks').innerHTML = checksHTML({ errs: v.errs.filter(show), warns: [], infos: [] }, '');
    document.querySelectorAll('#cm_root [data-ab]').forEach(el => el.classList.toggle('invalid', show({ field: el.dataset.ab, kind: '' }) && v.errs.some(e => e.field === el.dataset.ab)));
    if (ok) ok.disabled = v.errs.length > 0;
    return v;
  }
  function setAllocs(list) {
    ab.allocs = {};
    list.forEach(a => { ab.allocs[a.phase_id] = String(a.amount); });
    document.querySelectorAll('[data-abal]').forEach(i => { const v = ab.allocs[i.dataset.abal]; i.value = v ? R.fmtNum(Number(v)) : ''; });
    refresh();
  }
  function onClick(e) {
    if (!ab) return;
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.abtype) { ab.type = b.dataset.abtype; document.querySelectorAll('[data-abtype]').forEach(x => { const on = x.dataset.abtype === ab.type; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); refresh(); return; }
    if (b.dataset.aball != null) { const a = R.money(ab.amount); setAllocs(a > 0 ? [{ phase_id: UN, amount: Math.round(a) }] : []); return; }
    if (b.dataset.absplit != null) { setAllocs(R.splitByCurrent(state(), ab.cid, ab.amount)); return; }
    if (b.dataset.abcancel) { cancelRequest(b.dataset.abcancel); return; }
    if (b.id === 'ab_ok') submit();
  }
  const ctxOf = () => { let e = 0; const base = U.store.newCampaignEventId(); return { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }; };
  function submit() {
    if (!ab || !U.guard('campaign.draft')) return;
    ab.submitted = true;
    const v = refresh(); if (!v || v.errs.length) return;
    const s = state(), c = campById(ab.cid), r = R.submitBudgetChange(s, ab.cid, draft(), U.actor(), ctxOf());
    s.campaign_events.push(...r.events);
    commit(r.rec.status === 'approved' ? B.applied(c.campaign_name) : B.sent);
    done(r.rec);
  }
  function cancelRequest(id) {
    const s = state(), evs = R.cancelBudgetChange(s, id, ctxOf()); if (!evs.length) return;
    s.campaign_events.push(...evs); commit(B.cancelled);
    done(null);
  }
  /* back to where it came from (the Planner's own content · or closed) · the screen behind draws again */
  function done(rec) {
    const o = ab.o, inPanel = ab.inPanel; ab = null;
    if (inPanel) { if (o.back) o.back(); } else U.closeModal();
    if (o.onDone) o.onDone(rec);
  }

  return { open, pendingTagHTML, historyHTML, canAdjust, sbaht };
})();
