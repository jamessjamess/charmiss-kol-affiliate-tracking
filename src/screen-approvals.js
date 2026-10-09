/* screen-approvals.js — CR-17 v1.2 §4.5 · CR-18 §4.3 · CR-21 §3.4–3.6: the Approvals tab of Campaign & Phase (#campaigns/approvals).
   A manager: Pending · Decided · My drafts (an Admin: every draft) · Staff (My requests): Drafts · Pending · Decided — returned drafts first.
   One card a request: name · type · who sent it · when · Round · Period / Budget / Phases · one button: Review (a draft: Edit · Delete draft / Cancel request).
   Review = the Approval review pop up: header (type · who · when · Round · ‹ ›) → What changed since last round → Campaign → Phases → Budget context →
   History → Decision (Comment · Return to draft · Approve — Approve works once the Decision is on screen; Jump to decision ↓) · the one who sent it reads
   it (Withdraw to draft) · after a decision the next request opens. No bulk approve. Every state change goes through R.requestTransition.
   Drawn by screen-campaign.js inside #cp_body. → KT.approvals */
KT.approvals = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, commit, toast, toastAction, checksHTML, userId, range, dm } = U;
  const AP = C.approval, B = C.budget, K = C.campaign;
  const ap = { state: null, stateUser: null, type: '' };
  let host = null, hooks = {}, rv = null;
  const mgr = () => R.canApprove(U.actor());
  const campById = id => state().campaigns.find(c => c.campaign_id === id);
  const phaseById = id => state().phases.find(p => p.phase_id === id);
  const who = id => (id === 'system' ? B.system : id ? R.changedByName(state(), id) : AP.someone);
  const day = iso => (iso ? R.dmy(R.dateOfTimestamp(iso)) : '—');
  const ago = iso => (iso ? AP.ago(Math.max(0, R.dayDiff(today(), R.dateOfTimestamp(iso)))) : '');
  const ctxOf = () => { let e = 0; const base = U.store.newCampaignEventId(); return { eventId: () => base + e++, now: new Date().toISOString(), user: userId(), today: today() }; };

  /* ---------- the returned drafts a person has not opened yet (the menu badge of Staff) — per person, in this browser ---------- */
  const seenKey = () => 'requests.seen.' + (userId() || '');
  const seenSet = () => { try { const v = JSON.parse(U.pref.get(seenKey(), '[]')); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); } };
  const seenTag = r => `${r.id}@${(r.returned || {}).at || ''}`;
  function markSeen(r) { if (!r || !r.returned) return; const set = seenSet(); set.add(seenTag(r)); U.pref.set(seenKey(), JSON.stringify([...set].slice(-200))); }
  const returnedUnseen = () => { const set = seenSet(); return R.returnedFor(state(), U.actor()).filter(r => !set.has(seenTag(r))).length; };

  /* the tab: Approvals n (a manager: every pending request) · My requests n (Staff: their pending ones) · null for anyone else */
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
  const fieldLabel = k => ({ budget_kol: K.colBudget, pillar_target: K.pillarTarget, start_date: AP.fStart, end_date: AP.fEnd, delete: AP.fDelete, campaign_name: AP.kName, note: AP.kNote, products: AP.kProducts, label: AP.colLabel, default_pillar: C.fill.defaultPillar }[k] || k);
  const productNames = codes => (codes || []).map(code => { const p = R.productByCode(state(), code); return p ? R.productShort(p) : code; }).join(', ');
  const fieldValue = (k, v) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? C.common.none : k === 'budget_kol' ? R.baht(Number(v)) : k === 'start_date' || k === 'end_date' ? R.dmy(v)
    : k === 'products' ? productNames(v) : k === 'pillar_target' ? R.PILLARS.filter(p => v[R.PILLAR_KEY[p]] != null).map(p => `${p} ${v[R.PILLAR_KEY[p]]}%`).join(' / ') : k === 'delete' ? AP.removePhase : String(v));
  /* a small timeline of a Campaign's Phases (the grey ordinal ramp of CR-13) */
  function miniTimeline(cid, only) {
    const s = state(), ps = R.sortPhases(s.phases.filter(p => p.campaign_id === cid && R.isISODate(p.start_date) && R.isISODate(p.end_date) && (!only || only(p))));
    if (!ps.length) return '';
    const from = ps[0].start_date, to = ps.map(p => p.end_date).sort().pop(), span = R.dayDiff(to, from) + 1, steps = R.phaseSteps(ps.length);
    return `<div class="apc-tl" aria-hidden="true">${ps.map((p, i) => `<span style="left:${R.dayDiff(p.start_date, from) / span * 100}%;width:${(R.dayDiff(p.end_date, p.start_date) + 1) / span * 100}%;background:${U.phaseVarAt(steps[i])}" title="${esc(`${R.phaseName(s, p.phase_id)} · ${dm(p.start_date)}–${dm(p.end_date)}`)}"></span>`).join('')}</div>`;
  }
  const periodLine = (a, z) => (a ? `${esc(range(a, z))} <span class="muted">(${esc(AP.days(R.dayDiff(z, a) + 1))} · ${esc(timingText(a))})</span>` : `<span class="muted">${esc(AP.noPeriod)}</span>`);
  const nameOf = r => { const s = state(), c = campById(r.campaign_id) || {}; return r.phase_id && phaseById(r.phase_id) && (r.type === 'new_phase' || r.type === 'change') ? `${R.phaseName(s, r.phase_id)} › ${c.campaign_name || ''}` : c.campaign_name || r.campaign_id; };
  const budgetRow = r => (state().campaign_budget_changes || []).find(b => b.change_id === r.change_id);

  /* ---------- the short facts of a card (Period · Budget · Phases) ---------- */
  function summaryHTML(r) {
    const s = state(), c = campById(r.campaign_id) || {};
    if (r.type === 'new_campaign') { const [a, z] = R.campaignSpan(s, r.campaign_id), n = s.phases.filter(p => p.campaign_id === r.campaign_id).length;
      return kvl(AP.kPeriod, periodLine(a, z)) + kvl(AP.kBudget, R.isBlank(c.budget_kol) ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(c.budget_kol)) + kvl(AP.kPhases, esc(R.fmtNum(n))) + miniTimeline(r.campaign_id); }
    if (r.type === 'new_phase') { const p = phaseById(r.phase_id) || {};
      return kvl(AP.kPeriod, periodLine(p.start_date, p.end_date)) + kvl(AP.kBudget, R.isBlank(p.budget_kol) ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(p.budget_kol)); }
    if (r.type === 'change') { const rec = r.kind === 'phase' ? phaseById(r.phase_id) : campById(r.campaign_id), f = ((rec || {}).pending_change || {}).fields || {};
      return Object.entries(f).slice(0, 3).map(([k, v]) => kvl(fieldLabel(k), `${esc(k === 'delete' ? '' : `${fieldValue(k, k === 'products' ? R.campaignProductCodes(s, r.campaign_id) : (rec || {})[k])} → `)}<b>${esc(fieldValue(k, v))}</b>`)).join('') +
        (Object.keys(f).length > 3 ? `<div class="muted small">+${Object.keys(f).length - 3}</div>` : ''); }
    if (r.type === 'close') { const [a, z] = R.campaignSpan(s, r.campaign_id), ck = ((c.close_request || {}).checklist) || R.closeChecklist(s, r.campaign_id, today());   // CR-29
      return kvl(AP.kPeriod, periodLine(a, z)) + kvl(AP.secOpen, esc(ck.outstanding ? [ck.openDeals ? C.close.openDeals(ck.openDeals) : '', ck.pay.n ? C.close.pay(ck.pay.n, R.baht(ck.pay.amount)) : ''].filter(Boolean).join(' · ') || C.close.items.some : C.close.items.none)); }
    const x = budgetRow(r); if (!x) return '';
    const im = R.budgetChangeImpact(s, x);
    return `<div class="apc-big">${esc(AP.budgetLine(im.before == null ? '฿0' : R.baht(im.before), R.baht(im.after), KT.budget.sbaht(im.delta)))}</div>` + kvl(AP.reasonL2, esc(x.reason || '—'));
  }

  /* ---------- a card ---------- */
  function cardHTML(r) {
    const decided = !!r.result, draft = !decided && r.status === 'draft', isMgr = mgr(), mine = r.by && r.by === userId();
    const round = decided ? r.round : r.round || (draft ? 0 : 1);
    const sub = decided ? AP.submittedBy(who(r.by), '').replace(/ · $/, '') : draft ? `${who(r.by)}${r.at ? ` · ${day(r.at)}` : ''}` : AP.submittedAgo(who(r.by), day(r.at), ago(r.at));
    const chip = draft ? `<span class="st adraft">${esc(r.returned ? AP.returnedChip : AP.draftChip)}</span>` : '';
    const head = `<div class="apc-h"><div class="apc-t"><b>${esc(nameOf(r))}</b> <span class="apt ${esc(r.type)}">${esc(AP.types[r.type] || r.type)}</span> ${chip}` +
      `<div class="muted small">${esc(sub)}${round ? ` · ${esc(AP.round(round))}` : ''}</div></div></div>`;
    let body = '', foot = '';
    if (decided) {
      const ok = r.result === 'approved';
      foot = `<span class="st ${ok ? 'complete' : 'adraft'}">${esc(ok ? AP.approvedRound(r.round || 1) : AP.returnedRound(r.round || 1))}</span> <span class="small">${esc(`${who(r.decided_by)} · ${day(r.decided_at)}`)}</span>` +
        (r.reason ? `<div class="check warn apc-why">↩ <span>${esc(r.reason)}</span></div>` : r.note ? `<div class="apc-note apc-why"><div>${esc(r.note)}</div></div>` : '');
    } else if (draft) {
      body = (r.returned ? `<div class="check err apc-why">✕ <span>${esc(r.type === 'change' ? AP.changeReturned(r.returned.reason) : AP.returnedBar(who(r.returned.by), day(r.returned.at), r.returned.reason))}</span></div>` : '') + summaryHTML(r);
      const del = r.type === 'change' || r.type === 'close' || r.change_id ? `<button type="button" class="btn small" data-apcancel="${esc(r.id)}">${esc(AP.cancelRequest)}</button>` : `<button type="button" class="btn small danger" data-apdelete="${esc(r.id)}">${esc(AP.deleteDraft)}</button>`;
      foot = `${del}<span class="spacer"></span><button type="button" class="btn small primary" data-apedit="${esc(r.id)}">${esc(AP.edit)}</button>`;
    } else {
      body = summaryHTML(r) + (r.note ? `<div class="apc-note"><span class="muted small">${esc(AP.noteFrom(who(r.by)))}</span><div>${esc(r.note)}</div></div>` : '');
      /* CR-27 §3.1 — Staff on their own request: View (Review means deciding it) */
      foot = `${!isMgr ? `<span class="muted small">${esc(AP.waitingFor)}</span>` : ''}<span class="spacer"></span><button type="button" class="btn small${isMgr ? ' primary' : ''}" data-apreview="${esc(r.id)}">${esc(isMgr ? AP.review : AP.view)}</button>`;
    }
    return `<article class="card apc${decided ? ' done' : ''}${draft && r.returned ? ' back' : ''}" data-apcard="${esc(r.id)}">${head}${body ? `<div class="apc-b">${body}</div>` : ''}<div class="apc-f">${foot}</div></article>`;
  }

  /* ---------- the view ---------- */
  /* Staff: Drafts · Pending · Decided · a manager: Pending · Decided · My drafts (an Admin: Drafts — every one) */
  const tabsFor = () => (mgr() ? ['pending', 'decided', 'drafts'] : ['drafts', 'pending', 'decided']);
  function render(el, o = {}) {
    host = el; hooks = o;
    const s = state(), me = U.actor(), isMgr = mgr();
    if (ap.stateUser !== userId() || !ap.state) { ap.stateUser = userId(); ap.state = isMgr ? 'pending' : R.draftRequests(s, me).some(r => r.returned) ? 'drafts' : 'pending'; }
    const list = R.requestsFor(s, me, { state: ap.state, type: ap.type });
    const n = { pending: R.requestsFor(s, me, { state: 'pending' }).length, drafts: R.requestsFor(s, me, { state: 'drafts' }).length };
    const label = { pending: AP.fPending, decided: AP.fDecided, drafts: isMgr ? (me.role === 'admin' ? AP.fDrafts : AP.fMyDrafts) : AP.fDrafts };
    const types = [['', AP.typeAll], ['new_campaign', AP.types.new_campaign], ['new_phase', AP.types.new_phase], ['change', AP.types.change], ['budget', AP.types.budget], ['close', AP.types.close]];   // CR-29
    const tools = `<div class="toolbar ap-tools"><div class="seg" role="group" aria-label="${esc(AP.typeL)}">` +
      tabsFor().map(k => `<button type="button" data-apstate="${k}" class="${ap.state === k ? 'on' : ''}" aria-pressed="${ap.state === k}">${esc(label[k])}${n[k] != null ? ` <span class="n">${R.fmtNum(n[k])}</span>` : ''}</button>`).join('') + `</div>` +
      `<select id="ap_type" aria-label="${esc(AP.typeL)}">${types.map(([v, l]) => `<option value="${v}"${ap.type === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><span class="spacer"></span></div>`;
    const empty = ap.type ? AP.emptyType : ap.state === 'decided' ? AP.emptyDecided : ap.state === 'drafts' ? AP.emptyDrafts : isMgr ? AP.emptyPending : AP.emptyMinePending;
    el.innerHTML = tools + (list.length ? `<div class="apc-grid">${list.map(cardHTML).join('')}</div>` : `<div class="card empty"><b>${esc(empty)}</b></div>`);
    el.onclick = onClick; el.onchange = onChange;
  }
  const redraw = () => { if (host && host.isConnected && U.currentTab() === 'campaign') render(host, hooks); if (hooks.after) hooks.after(); };
  function onChange(e) { if (e.target.id === 'ap_type') { ap.type = e.target.value; redraw(); } }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.apstate) { ap.state = b.dataset.apstate; redraw(); return; }
    if (b.dataset.apreview) { review(b.dataset.apreview, { opener: b, after: redraw }); return; }
    if (b.dataset.apedit) { editDraft(b.dataset.apedit, b); return; }
    if (b.dataset.apdelete) { deleteDraft(b.dataset.apdelete, redraw); return; }
    if (b.dataset.apcancel) { cancelReq(b.dataset.apcancel, redraw); }
  }

  /* ---------- a draft: Edit (the Phase Planner / Adjust budget) · Delete draft · Cancel request ---------- */
  function editDraft(id, opener) {
    const r = R.requestOf(state(), id); if (!r) return;
    markSeen(r); if (KT.ui.onCommit) KT.ui.onCommit();
    if (r.change_id) { KT.budget.open(r.campaign_id, { opener, changeId: r.change_id, onDone: () => redraw() }); return; }
    if (r.type === 'close') { KT.screens.campaign.openClose(r.campaign_id, { opener }); return; }   // CR-29: the Close campaign dialog
    KT.planner.open({ campaignId: r.campaign_id, focusPhase: r.phase_id || null, opener });
  }
  async function deleteDraft(id, after) {
    const s = state(), r = R.requestOf(s, id); if (!r || r.status !== 'draft') return;
    const name = nameOf(r);
    if (!(await U.confirmDialog(AP.deleteDraftTitle(name), AP.deleteDraftBody, AP.deleteDraft, true, C.common.cancel))) return;
    const x = R.requestTransition(s, id, 'deleted', ctxOf()); if (!x.ok) return;
    s.campaign_events.push(...x.events); commit(AP.draftDeleted(name)); (after || redraw)();
  }
  async function cancelReq(id, after) {
    const s = state(), r = R.requestOf(s, id); if (!r) return;
    const c = campById(r.campaign_id) || {};
    if (!(await U.confirmDialog(AP.cancelRequestTitle(c.campaign_name || ''), AP.cancelRequestBody, AP.cancelRequest, true, C.common.cancel))) return;
    const x = R.requestTransition(s, id, 'cancelled', ctxOf()); if (!x.ok) return;
    s.campaign_events.push(...x.events); commit(r.change_id ? B.cancelled : AP.requestCancelled); (after || redraw)();
  }
  /* Withdraw to draft: the one who sent it takes it back (the Round stays) */
  function withdraw(id, after) {
    const s = state(), r = R.requestOf(s, id); if (!r || r.status !== 'pending' || r.by !== userId()) return;
    const x = R.requestTransition(s, id, 'draft', ctxOf(), { withdraw: true }); if (!x.ok) return;
    s.campaign_events.push(...x.events); commit(AP.withdrawnToast(nameOf(r)));
    if (rv && U.modalOpen()) U.closeModal();
    (after || redraw)();
  }

  /* ===================== the Approval review pop up ===================== */
  const sec = (title, body, cls) => `<section class="sec rv-sec${cls ? ' ' + cls : ''}"><div class="sec-h"><span>${esc(title)}</span></div>${body}</section>`;
  /* Round 2 and on: what is different from the round that was returned (old → new) + why it was returned */
  function whatChangedHTML(r) {
    const x = R.sinceLastRound(state(), r.id); if (!x) return '';
    const list = x.changes.length ? `<ul class="rv-changes">${x.changes.map(d => `<li><span>${esc(d.label)}</span> <span class="muted">${esc(d.from)}</span> → <b>${esc(d.to)}</b></li>`).join('')}</ul>`
      : `<div class="hint">${esc(AP.nothingChanged)}</div>`;
    return sec(AP.secWhatChanged, list + (x.reason ? `<div class="check warn">↩ <span>${esc(AP.prevReason(x.round, x.reason))}</span></div>` : ''), 'rv-what');
  }
  function campaignHTML(r) {
    const s = state(), c = campById(r.campaign_id) || {}, [a, z] = R.campaignSpan(s, r.campaign_id), codes = R.campaignProductCodes(s, r.campaign_id);
    return sec(AP.secCampaign, kvl(AP.kName, esc(c.campaign_name || '—')) + kvl(AP.kPeriod, periodLine(a, z)) + kvl(AP.kBudget, R.isBlank(c.budget_kol) ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(c.budget_kol)) +
      kvl(AP.kProducts, codes.length ? esc(productNames(codes)) : '—') + kvl(AP.kNote, esc(c.note || '—')));
  }
  function phasesHTML(r) {
    const s = state(), c = campById(r.campaign_id) || {}, ps = R.sortPhases(s.phases.filter(p => p.campaign_id === r.campaign_id && (!R.isDraft(p) || p.phase_id === r.phase_id || R.isDraft(c))));
    if (!ps.length) return sec(AP.secPhases, `<div class="hint">${esc(K.noPhase)}</div>`);
    const b = R.isBlank(c.budget_kol) ? null : Number(c.budget_kol), tot = ps.reduce((t, p) => t + (Number(p.budget_kol) || 0), 0);
    const rows = ps.map(p => `<tr${p.phase_id === r.phase_id ? ' class="rv-hit"' : ''}><td><span class="dotc" style="background:${U.phaseVar(p.phase_id)}"></span>${esc(R.phaseName(s, p.phase_id))}${R.isApproved(p) ? '' : ` <span class="st apending">${esc(C.phaseStatus[R.phaseStatus(p, today())] || '')}</span>`}</td>` +
      `<td class="nowrap">${esc(range(p.start_date, p.end_date))}</td><td class="num">${R.isBlank(p.budget_kol) ? '—' : R.baht(p.budget_kol)}</td><td class="num">${b && !R.isBlank(p.budget_kol) ? `${Math.round(p.budget_kol / b * 1000) / 10}%` : '—'}</td></tr>`).join('');
    const un = b != null && b - tot > 0 ? `<tr class="pl-unal"><td>${esc(AP.kUnallocated)}</td><td></td><td class="num">${R.baht(b - tot)}</td><td class="num">${Math.round((b - tot) / b * 1000) / 10}%</td></tr>` : '';
    return sec(AP.secPhases, `<div class="tablewrap"><table class="tbl compact-sm ap-tbl"><thead><tr><th>${esc(AP.colPhase)}</th><th>${esc(AP.colPeriod)}</th><th class="num">${esc(AP.colBudget)}</th><th class="num">${esc(AP.colPct)}</th></tr></thead><tbody>${rows}${un}</tbody></table></div>` +
      miniTimeline(r.campaign_id, p => !R.isDraft(p) || p.phase_id === r.phase_id || R.isDraft(c)));
  }
  /* the request itself when it is not a whole Campaign: the change asked for · the new Phase · the budget change */
  function requestHTML(r) {
    const s = state();
    if (r.type === 'change') {
      const rec = r.kind === 'phase' ? phaseById(r.phase_id) : campById(r.campaign_id), f = ((rec || {}).pending_change || {}).fields || {}, x = R.changeImpact(s, r);
      return sec(AP.secRequest, `<div class="tablewrap"><table class="tbl compact-sm ap-tbl"><thead><tr><th>${esc(AP.colField)}</th><th>${esc(AP.colCurrent)}</th><th>${esc(AP.colRequested)}</th></tr></thead><tbody>` +
        Object.entries(f).map(([k, v]) => `<tr><td>${esc((r.kind === 'phase' ? `${R.phaseName(s, r.phase_id)} · ` : '') + fieldLabel(k))}</td><td>${esc(k === 'delete' ? '—' : fieldValue(k, k === 'products' ? R.campaignProductCodes(s, r.campaign_id) : (rec || {})[k]))}</td><td><b>${esc(fieldValue(k, v))}</b></td></tr>`).join('') +
        `</tbody></table></div>` + (r.kind === 'phase' ? `<div class="apc-imp">${esc(x.moved ? AP.postsMove(x.moved, x.deals) : AP.noMove)}</div>` : ''));
    }
    if (r.type === 'new_phase') return sec(AP.secRequest, summaryHTML(r));
    if (r.change_id) {
      const x = budgetRow(r); if (!x) return '';
      const im = R.budgetChangeImpact(s, x), pct = v => (v == null ? '—' : `${Math.round(v)}%`);
      return sec(AP.secRequest, `<div class="apc-big">${esc(AP.budgetLine(im.before == null ? '฿0' : R.baht(im.before), R.baht(im.after), KT.budget.sbaht(im.delta)))}</div>` +
        kvl(AP.committedL, `${R.baht(im.committed)} <span class="muted">· ${esc(AP.usedLine(pct(im.usedBefore), pct(im.usedAfter)))}</span>`) +
        `<div class="apc-sub">${esc(AP.allocTitle)}</div><div class="tablewrap"><table class="tbl compact-sm ap-tbl"><tbody>` +
        (x.allocations || []).map(a => `<tr><td>${a.phase_id === R.UNALLOCATED ? `<span class="muted">${esc(B.unallocated)}</span>` : esc(R.phaseName(s, a.phase_id))}</td><td class="num"><b>${esc(KT.budget.sbaht((x.type === 'decrease' ? -1 : 1) * a.amount))}</b></td></tr>`).join('') +
        `</tbody></table></div>` + kvl(AP.reasonL2, esc(x.reason || '—')));
    }
    return '';
  }
  /* CR-29 §3.5 — Close campaign: Period · Budget / Committed / Paid · what was open when it was sent and now · the Close note */
  function closeHTML(r) {
    const s = state(), c = campById(r.campaign_id) || {}, [a, z] = R.campaignSpan(s, r.campaign_id), m = R.campaignMoney(s, r.campaign_id), car = c.close_request || {}, I = C.close.items;
    const now = R.closeChecklist(s, r.campaign_id, today()), sent = car.checklist || null;
    const pct = v => (v == null ? '—' : `${Math.round(v)}%`), cell = (x, f) => (x ? f(x) : '—');
    const rows = [[I.openDeals, x => R.fmtNum(x.openDeals), x => x.openDeals], [I.pay, x => `${R.fmtNum(x.pay.n)} · ${R.baht(x.pay.amount)}`, x => x.pay.n], [I.ships, x => R.fmtNum(x.ships), x => x.ships],
      [I.metrics, x => R.fmtNum(x.metrics), x => x.metrics], [I.committed, x => `${R.baht(x.money.committed)} (${pct(x.money.usedPct)})`, () => 0]];
    const table = `<div class="tablewrap"><table class="tbl compact-sm ap-tbl cl-tbl"><thead><tr><th>${esc(AP.colItem)}</th><th class="num">${esc(AP.colAtSend)}</th><th class="num">${esc(AP.colNow)}</th></tr></thead><tbody>` +
      rows.map(([l, f, n]) => `<tr${n(now) ? ' class="cl-open"' : ''}><td>${esc(l)}</td><td class="num">${esc(cell(sent, f))}</td><td class="num"><b>${esc(f(now))}</b></td></tr>`).join('') + `</tbody></table></div>`;
    return sec(AP.secClose, kvl(AP.kName, esc(c.campaign_name || '—')) + kvl(AP.kPeriod, periodLine(a, z)) + kvl(AP.kBudget, m.budget == null ? `<span class="muted">${esc(K.noBudget)}</span>` : R.baht(m.budget)) +
        kvl(AP.kCommitted, `${R.baht(m.committed)} <span class="muted">· ${esc(pct(m.usedPct))}</span>`) + kvl(AP.kPaid, R.baht(m.paid || 0))) +
      sec(AP.secOpen, table + kvl(AP.kCloseNote, esc(car.note || '—')) + kvl(AP.kCancelOpen, esc(car.cancel_open ? `${C.request.yes} (${R.fmtNum(now.early)})` : C.request.no)));
  }
  /* Budget context: the approved Campaigns that run at the same time (their budgets) · Phases that overlap */
  function contextHTML(r) {
    const s = state(), x = R.sameTimeBudget(s, r.campaign_id), c = campById(r.campaign_id) || {};
    const list = x.list.length ? `<div class="tablewrap"><table class="tbl compact-sm ap-tbl"><tbody>${x.list.map(k => `<tr><td>${esc(k.name)}</td><td class="nowrap">${esc(k.span[0] ? range(k.span[0], k.span[1]) : '—')}</td><td class="num">${R.baht(k.budget)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="hint">${esc(AP.overlapsNone)}</div>`;
    const total = !R.isBlank(c.budget_kol) && r.type === 'new_campaign' ? `<div class="apc-imp">${esc(AP.sameTimeTotal(R.baht(x.before), R.baht(x.after)))}</div>` : '';
    const ov = r.type === 'new_phase' ? R.newPhaseCheck(s, r.phase_id).overlaps.map(o => ({ a: r.phase_id, b: o.phase_id, from: o.from, to: o.to }))
      : R.phaseOverlaps(s.phases.filter(p => p.campaign_id === r.campaign_id && R.isISODate(p.start_date) && R.isISODate(p.end_date)));
    const ovs = ov.map(o => `<div class="check warn">! <span>${esc(C.msg.phaseOverlap(R.phaseName(s, o.a), R.phaseName(s, o.b), dm(o.from), dm(o.to)))}</span></div>`).join('');
    return sec(AP.secBudgetCtx, list + total + ovs);
  }
  function historyHTML(r) {
    const evs = R.requestHistory(state(), r.id);
    return sec(AP.secHistory, evs.length ? `<ul class="rv-hist">${evs.map(e => `<li><span>${esc(AP.histLine(AP.hist[e.to] || e.to, who(e.changed_by), day(e.changed_at), e.round))}</span>${e.note ? `<div class="muted small">${esc(e.note)}</div>` : ''}</li>`).join('')}</ul>` : `<div class="hint">—</div>`);
  }
  function decisionHTML(r) {
    if (!rv.decide) {
      const mine = r.by === userId() && r.status === 'pending';
      return sec(AP.secDecision, `<div class="hint">${esc(AP.readOnly)}</div>${mine ? `<div class="btns rv-dbtns"><button type="button" class="btn" data-rvwithdraw>${esc(AP.withdraw)}</button></div>` : ''}`, 'rv-decision');
    }
    return sec(AP.secDecision, `<div class="field"><label for="rv_comment">${esc(AP.comment)}</label><textarea id="rv_comment" rows="3" placeholder="${esc(AP.commentPh)}">${esc(rv.comment || '')}</textarea><div class="hint">${esc(AP.commentHint)}</div></div>` +
      `<div class="checks" id="rv_checks"></div><div class="btns rv-dbtns"><span class="muted small rv-gate" id="rv_gate">${esc(AP.scrollToApprove)}</span><span class="spacer"></span>` +
      `<button type="button" class="btn" data-rvreturn disabled title="${esc(AP.returnHint)}">${esc(AP.returnToDraft)}</button><button type="button" class="btn primary" data-rvapprove disabled>${esc(AP.approve)}</button></div>`, 'rv-decision');
  }
  /* the requests ‹ › walks: the pending ones (a manager) · just this one (anyone else) */
  const queue = () => (rv && rv.decide ? R.approvalRequests(state()).map(r => r.id) : rv ? [rv.id] : []);
  function rvBody() {
    const s = state(), r = R.requestOf(s, rv.id);
    if (!r) return `<div class="card empty"><b>${esc(AP.notThere)}</b></div>`;
    const q = queue(), i = q.indexOf(rv.id), c = campById(r.campaign_id) || {};
    const head = `<div class="rv-head"><span class="apt ${esc(r.type)}">${esc(AP.types[r.type] || r.type)}</span><span>${esc(AP.submittedAgo(who(r.by), day(r.at), ago(r.at)))}</span><span class="st apending">${esc(AP.round(r.round || 1))}</span>` +
      (q.length > 1 && i >= 0 ? `<span class="spacer"></span><span class="rv-nav"><button type="button" class="icon-btn" data-rvnav="-1" aria-label="${esc(AP.prevReq)}" title="${esc(AP.prevReq)}"${i > 0 ? '' : ' disabled'}>‹</button><span class="muted small">${esc(AP.nOfM(i + 1, q.length))}</span>` +
        `<button type="button" class="icon-btn" data-rvnav="1" aria-label="${esc(AP.nextReq)}" title="${esc(AP.nextReq)}"${i < q.length - 1 ? '' : ' disabled'}>›</button></span>` : '') + `</div>` +
      (r.note ? `<div class="apc-note"><span class="muted small">${esc(AP.noteFrom(who(r.by)))}</span><div>${esc(r.note)}</div></div>` : '');
    rv.title = AP.reviewTitle(AP.types[r.type] || r.type, c.campaign_name || '');
    if (r.type === 'close') return head + whatChangedHTML(r) + closeHTML(r) + historyHTML(r) + decisionHTML(r) + (rv.decide ? `<button type="button" class="btn small rv-jump" data-rvjump>${esc(AP.jumpDecision)}</button>` : '');   // CR-29
    return head + whatChangedHTML(r) + campaignHTML(r) + (r.type === 'new_campaign' ? '' : requestHTML(r)) + phasesHTML(r) + contextHTML(r) + historyHTML(r) + decisionHTML(r) +
      (rv.decide ? `<button type="button" class="btn small rv-jump" data-rvjump>${esc(AP.jumpDecision)}</button>` : '');
  }
  /* o: { opener, after() } — a manager decides a pending one · anyone else reads it */
  function review(id, o = {}) {
    const r = R.requestOf(state(), id); if (!r) return;
    rv = { id, decide: mgr() && r.status === 'pending', after: o.after || null, comment: '', seen: false };
    U.createModal({ size: 'L', title: AP.reviewTitle(AP.types[r.type] || r.type, (campById(r.campaign_id) || {}).campaign_name || ''), opener: o.opener, focus: '#cm_btns .btn',
      isDirty: () => !!(rv && rv.comment && R.trim(rv.comment)), onClick: rvClick, onClose: () => { rv = null; },
      body: '', foot: ['', `<button type="button" class="btn" data-cmclose>${esc(C.common.close)}</button>`] });
    drawReview();
  }
  function drawReview() {
    if (!rv || !U.modalOpen()) return;
    const b = $('cm_body'); b.innerHTML = rvBody(); b.scrollTop = 0; b.classList.add('rv-body');
    const t = document.getElementById('cm_title'); if (t && rv.title) t.textContent = rv.title;
    rv.seen = false;
    b.onscroll = gate;
    const cm = $('rv_comment'); if (cm) cm.addEventListener('input', () => { rv.comment = cm.value; gate(); });
    setTimeout(gate, 0);
  }
  /* Approve works once the Decision is on screen (content that fits = at once) · Return to draft needs a reason of 5 characters or more */
  function gate() {
    if (!rv) return;
    const b = $('cm_body'), d = b && b.querySelector('.rv-decision'); if (!d) return;
    const bottom = b.getBoundingClientRect().bottom, top = d.getBoundingClientRect().top;
    if (top < bottom - 24 || b.scrollHeight <= b.clientHeight + 2) rv.seen = true;
    const ok = b.querySelector('[data-rvapprove]'), back = b.querySelector('[data-rvreturn]'), g = $('rv_gate'), j = b.querySelector('[data-rvjump]');
    if (ok) ok.disabled = !rv.seen;
    if (g) g.classList.toggle('hidden', rv.seen);
    if (j) j.classList.toggle('hidden', rv.seen);
    if (back) back.disabled = R.validateReturn(rv.comment).errs.length > 0;
  }
  function rvClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled || !rv) return;
    if (b.dataset.rvjump != null) { const d = $('cm_body').querySelector('.rv-decision'); if (d) { d.scrollIntoView({ block: 'end', behavior: 'smooth' }); setTimeout(() => { rv && (rv.seen = true); gate(); const c = $('rv_comment'); if (c) c.focus({ preventScroll: true }); }, 350); } return; }
    if (b.dataset.rvnav) { const q = queue(), i = q.indexOf(rv.id), next = q[i + Number(b.dataset.rvnav)]; if (next) { rv.id = next; rv.comment = ''; drawReview(); } return; }
    if (b.dataset.rvapprove != null) { decide('approve'); return; }
    if (b.dataset.rvreturn != null) { decide('return'); return; }
    if (b.dataset.rvwithdraw != null) withdraw(rv.id, rv.after || redraw);
  }
  /* Approve / Return to draft → the next request (none left: closed) · Undo for 10 s */
  function decide(kind) {
    if (!U.guard('campaign.approve') || !rv) return;
    const s = state(), r = R.requestOf(s, rv.id); if (!r || r.status !== 'pending') { drawReview(); return; }
    const q = queue(), at = q.indexOf(rv.id), name = nameOf(r), ctx = ctxOf(), snap = R.decisionSnapshot(s, r.campaign_id), comment = R.trim(rv.comment);
    if (kind === 'return') { const v = R.validateReturn(comment); if (v.errs.length) { $('rv_checks').innerHTML = checksHTML(v, ''); return; } }
    const cancelEarly = kind === 'approve' && r.type === 'close' && !!(r.carrier || {}).cancel_open;   // CR-29: read before the request is done
    const x = R.requestTransition(s, rv.id, kind === 'approve' ? 'approved' : 'draft', ctx, kind === 'approve' ? { note: comment } : { reason: comment });
    if (x.ok && cancelEarly) KT.screens.campaign.cancelEarlyDeals(r.campaign_id);
    if (!x.ok) { if ($('rv_checks')) $('rv_checks').innerHTML = checksHTML({ errs: [{ field: 'reason', msg: x.err === 'reason' ? C.request.reasonMin(R.MIN_REASON) : C.msg.sensitive }] }, ''); return; }
    s.campaign_events.push(...x.events);
    commit();
    const evIds = x.events.map(ev => ev.event_id);
    toastAction(kind === 'approve' ? AP.approvedToast(name) : AP.returnedToast(name), C.deal.undo, () => { R.restoreSnapshot(state(), snap, evIds); commit(AP.undone); redraw(); }, 10000);
    const rest = R.approvalRequests(state()).map(y => y.id), next = rest[Math.min(at, rest.length - 1)] || null;
    const after = rv.after;
    if (next) { rv.id = next; rv.comment = ''; drawReview(); }
    else U.closeModal();   // (the Undo toast stays — nothing else waits)
    (after || redraw)();
  }
  function reset() { ap.type = ''; }

  return { render, tabLabel, timingText, reset, review, withdraw, editDraft, deleteDraft, cancelReq, returnedUnseen, markSeen, state: ap };
})();
