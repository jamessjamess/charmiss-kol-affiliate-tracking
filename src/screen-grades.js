/* screen-grades.js — CR-34: the Grade on screen (one chip everywhere: A green · B blue · C yellow · D red · the letter always written · its tooltip = the
   main reason, CR-35 §2: "On time 3/3" · "Late 2 of 5 posts · avg 3 days late" · "No-show on <Campaign>") · Grade review (one card a partner: Suggested ·
   Confirmed now · On time · Avg days late · ER · the posts used (Posted on · Post due · Days late …) · Confirm · Override with a reason — KOL Manager / Admin ·
   anyone else: View, no buttons) · Incidents of a deal (+ Incident · No-show / Breach = suggested D at once) · Deals › ⋯ › Import metrics (CSV / XLSX · Manual
   is kept unless Replace manual values) · a post's numbers: where they came from (Auto · Import · Manual) and their ratio against the benchmark.
   Every grade comes from R.gradeEngine. → KT.grades */
KT.grades = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, store, commit, toast, toastAction, can, guard, userId, dateHTML, optionsHTML, openDialog, closeDialog, confirmDialog } = U;
  const G = C.grade;
  const CLS = { A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d' };
  const rulesNow = () => R.gradeRules(state().lookups);

  /* ===================== the chip ===================== */
  /* a letter in its colour (the name beside it when o.name) · tip = its whole meaning */
  const letterHTML = (g, o = {}) => (R.GRADES.includes(g) ? `<span class="gchip ${CLS[g]}${o.cls ? ' ' + o.cls : ''}" title="${esc(o.tip || G.chipTip(g, G.names[g]))}">${g}${o.name ? `<span class="gname">${esc(G.names[g])}</span>` : ''}</span>` : '');
  /* the grade of a partner as shown everywhere: the confirmed one · else "—" (Not graded / Not enough data) · a waiting suggestion = a small ring after it */
  function chipHTML(s, kolId, o = {}) {
    const rec = R.gradeOf(s, kolId), g = rec && R.GRADES.includes(rec.confirmed) ? rec.confirmed : null, wait = !!rec && R.needsReview(rec, today(), R.gradeRules(s.lookups));
    const why = rec ? reasonText(rec.reason, s) : '';
    const sug = wait ? ` <span class="gsug ${CLS[rec.suggested]}" title="${esc(G.suggestedTip(rec.suggested, G.names[rec.suggested]) + (why ? ` · ${why}` : ''))}">${esc(rec.suggested)}?</span>` : '';
    if (g) return letterHTML(g, { name: o.name, tip: G.chipTip(g, G.names[g]) + (why ? ` · ${why}` : '') + (rec.locked_until ? ` · ${G.lockedUntil(R.dmy(rec.locked_until))}` : '') }) + (o.noWait ? '' : sug);
    const text = !rec || rec.status === 'none' ? G.notGraded : rec.status === 'not_enough' ? G.notEnough : G.notGraded;
    const tip = !rec || rec.status === 'none' ? G.notGraded : rec.status === 'not_enough' ? (why || G.notEnoughTip(rulesNow().min_posts)) : G.notGradedTip;
    return `<span class="gchip g-none" title="${esc(tip)}">${o.name ? esc(text) : '—'}</span>` + (o.noWait ? '' : sug);
  }
  /* 15/10/2026 — Dashboard › Partners: the level = the confirmed chip (+ the ring of a waiting suggestion) · else the suggested letter, dashed, with
     "Suggested" · else the status in words (Not enough data · Not graded) */
  function levelHTML(s, kolId) {
    const rec = R.gradeOf(s, kolId), lv = R.levelOf(rec);
    if (lv.src === 'suggested') return `<span class="lvl">${letterHTML(lv.level, { cls: 'sug', tip: G.suggestedTip(lv.level, G.names[lv.level]) + (rec.reason && rec.reason.length ? ` · ${reasonText(rec.reason, s)}` : '') })}<span class="lvl-s">${esc(G.suggested)}</span></span>`;
    return chipHTML(s, kolId, { name: !lv.level, noWait: !lv.level });
  }
  /* the main reason in words (CR-35 §2) · s for a Campaign's name */
  function reasonText(parts, s) {
    return (parts || []).map(p => { const f = G.reason[p.k]; if (!f) return '';
      if (p.k === 'serious') return f(G.inc.types[p.type] || p.type, p.campaign_id ? R.campaignName(s || state(), p.campaign_id) : '');
      if (p.k === 'late') return f(p.n, p.of, p.avg);
      return p.k === 'ontime' ? f(p.n, p.of) : f(p.n); }).filter(Boolean).join(' · ');
  }
  const reasonOf = (s, kolId) => { const rec = R.gradeOf(s, kolId); return rec ? reasonText(rec.reason, s) : ''; };
  const pct2 = v => `${(v * 100).toFixed(2)}%`;
  /* CR-35 — On time · Avg days late · ER (· Revisions in the KOL modal) */
  function numsHTML(g, rounds) {
    return `<div class="grv-nums"><span title="${esc(G.ontimeTip)}">${esc(G.ontimeL)} <b class="${g.late ? 'late' : ''}">${g.measured ? esc(`${g.onTime}/${g.measured}`) : '—'}</b></span>` +
      `<span>${esc(G.avgLateL)} <b>${g.avgLate == null ? '—' : esc(String(g.avgLate))}</b></span>` +
      `<span title="${esc(G.erTip)}">${esc(G.erL)} <b>${g.er == null ? '—' : esc(pct2(g.er))}</b></span>` +
      (rounds ? `<span title="${esc(G.revisionsTip)}">${esc(G.revisionsL)} <b>${g.avgRounds == null ? '—' : esc(String(g.avgRounds))}</b></span>` : '') + `</div>`;
  }
  /* CR-35 §3.5 — the posts the grade counts (+ the ones without a Post due, shown, not counted): Posted on · Post due · Days late · Campaign · Pillar · Cost · Views · ER */
  function postsUsedHTML(s, g, clickable) {
    const rows = (g.posts || []).concat(g.nodue || []), dash = '<span class="muted">—</span>';
    if (!rows.length) return '';
    const tr = p => `<tr class="${clickable ? 'click' : ''}${p.due ? '' : ' grv-nodue'}"${clickable ? ` data-deal="${esc(p.deal_id)}" tabindex="0"` : ''}${p.due ? '' : ` title="${esc(G.notCounted)}"`}>` +
      `<td class="nowrap">${p.post_date ? esc(R.dmy(p.post_date)) : `<span class="late">${esc(G.notPosted)}</span>`}</td>` +
      `<td class="nowrap">${p.due ? esc(R.dmy(p.due)) : `<span class="muted">${esc(G.noDue)}</span>`}</td>` +
      `<td class="num">${p.days_late == null ? dash : `<b class="${p.late ? 'late' : 'ok'}">${esc(String(p.days_late))}</b>`}</td>` +
      `<td>${esc(R.campaignName(s, p.campaign_id) || '')}</td><td>${p.pillar ? U.pillarChipHTML(p.pillar) : dash}</td><td class="num">${esc(R.baht(p.cost))}</td>` +
      `<td class="num">${p.views != null ? esc(R.fmtNum(p.views)) : dash}</td><td class="num">${p.er != null ? esc(pct2(p.er)) : dash}</td></tr>`;
    return `<div class="tablewrap"><table class="tbl compact-sm grv-posts"><thead><tr><th>${esc(G.postedOn)}</th><th>${esc(G.postDue)}</th><th class="num">${esc(G.daysLate)}</th>` +
      `<th>${esc(G.campaignL)}</th><th>${esc(G.pillarL)}</th><th class="num">${esc(G.costL)}</th><th class="num">${esc(G.viewsL)}</th><th class="num">${esc(G.erL)}</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }
  const ratioText = r => (r == null ? '—' : G.ratioX(r));
  const pctOf = r => Math.round((r - 1) * 100);

  /* ===================== Grade review ===================== */
  /* o = { kolId (this one only — even when nothing waits), opener, after } */
  function openQueue(o = {}) {
    const me = { editing: null, m: null };
    /* 15/10/2026 — Set grade: one partner with nothing to confirm (or o.edit) → straight to choosing a grade */
    if (o.kolId && R.canReview(U.actor())) { const r0 = R.gradeOf(state(), o.kolId);
      if (r0 && (o.edit || !(R.GRADES.includes(r0.suggested) && r0.suggested !== r0.confirmed))) Object.assign(me, { editing: o.kolId, pick: R.GRADES.includes(r0.suggested) ? r0.suggested : '', why: '' }); }
    const title = () => (o.kolId ? G.rev.titleOne((R.kolById(state(), o.kolId) || {}).display_name || o.kolId) : G.rev.title(R.reviewQueue(state(), today()).length));
    me.m = U.createModal({ size: 'L', title: title(), opener: o.opener, isDirty: () => !!me.editing, onClick: e => click(e), onClose: () => { if (o.after) o.after(); },
      foot: ['', `<button type="button" class="btn" data-cmclose>${esc(C.common.close)}</button>`], body: '' });
    const draw = () => {
      const s = state(), td = today(), list = o.kolId ? [{ rec: R.gradeOf(s, o.kolId), kol: R.kolById(s, o.kolId) }].filter(x => x.rec && x.kol) : R.reviewQueue(s, td);
      const ro = !R.canReview(U.actor());
      me.m.setBody(`<p class="hint" style="margin-top:0">${esc(G.rev.dAlways)} · ${esc(G.window(rulesNow().window_posts, rulesNow().window_months))}</p>` +
        (list.length ? `<div class="grv-list">${list.map(x => cardHTML(s, x.rec, x.kol, ro)).join('')}</div>` : `<div class="card empty"><b>${esc(G.rev.empty)}</b></div>`), true);
      if ($('cm_title')) $('cm_title').textContent = title();
    };
    me.draw = draw;
    function cardHTML(s, rec, kol, ro) {
      const accs = R.accountsOfKol(s, kol.kol_id), tier = R.tierOf(R.maxFollowers(accs), s.lookups.tier_rules || []) || R.UNKNOWN_TIER;
      const g = R.gradeEngine(s, kol.kol_id, today()), ed = me.editing === kol.kol_id;
      const posts = postsUsedHTML(s, g, false);
      const form = ed ? `<div class="grv-form" data-grvform="${esc(kol.kol_id)}"><div class="field"><label>${esc(G.rev.newGrade)} <span class="req">*</span></label><div class="seg grv-seg" role="group">` +
          R.GRADES.map(x => `<button type="button" data-grvpick="${x}" class="${me.pick === x ? 'on' : ''}">${letterHTML(x, { name: true })}</button>`).join('') + `</div></div>` +
          `<div class="field"><label for="grv_why">${esc(G.rev.reasonL)} <span class="req">*</span></label><textarea id="grv_why" rows="2" placeholder="${esc(G.rev.reasonPh)}">${esc(me.why || '')}</textarea></div>` +
          `<div class="checks" id="grv_err"></div><div class="btns"><button type="button" class="btn" data-grvcancel>${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-grvsave="${esc(kol.kol_id)}">${esc(G.rev.save)}</button></div></div>` : '';
      const btns = ro ? `<div class="hint ro-note grv-ro">${esc(G.rev.viewOnly)}</div>` : `<div class="btns grv-btns">${R.GRADES.includes(rec.suggested) && rec.suggested !== rec.confirmed ? `<button type="button" class="btn primary" data-grvok="${esc(kol.kol_id)}">${esc(G.rev.confirm)} ${letterHTML(rec.suggested)}</button>` : ''}` +
        `<button type="button" class="btn" data-grvover="${esc(kol.kol_id)}">${esc(R.GRADES.includes(rec.suggested) || R.GRADES.includes(rec.confirmed) ? G.rev.override : G.rev.setGrade)}</button><button type="button" class="link small" data-grvkol="${esc(kol.kol_id)}">${esc(G.rev.openKol)} ↗</button></div>`;
      return `<div class="card grv-card" data-grv="${esc(kol.kol_id)}"><div class="grv-h"><span class="grv-who">${U.avatarHTML(kol, 'sm')}<b>${U.nameHTML(kol.display_name)}</b>${U.partnerChipHTML(kol)} <span class="chip">${esc(tier)}</span></span>` +
          `<span class="grv-g"><span class="muted small">${esc(G.rev.newSug)}</span>${R.GRADES.includes(rec.suggested) ? letterHTML(rec.suggested, { name: true }) : `<span class="gchip g-none">${esc(G.status[rec.status] || G.notGraded)}</span>`}` +
          `<span class="muted small">${esc(G.rev.oldGrade)}</span>${R.GRADES.includes(rec.confirmed) ? letterHTML(rec.confirmed, { name: true }) : `<span class="gchip g-none">${esc(G.notGraded)}</span>`}</span></div>` +
        `<div class="grv-reason">${esc(reasonText(g.reason, s))}</div>` + numsHTML(g, false).replace(/<\/div>$/, '') +
          (rec.locked_until ? `<span class="muted small">${esc(G.lockedUntil(R.dmy(rec.locked_until)))}</span>` : '') + `</div>` +
        (posts ? `<details class="grv-pd"${o.kolId ? ' open' : ''}><summary>${esc(G.basisPosts(g.posts.length))}</summary>${posts}</details>` : '') + btns + form + `</div>`;
    }
    function click(e) {
      const t = e.target, s = state(), ctx = () => ({ user: userId(), now: new Date().toISOString(), today: today(), historyId: store.newId('gradeHistory') });
      const ok = t.closest('[data-grvok]'); if (ok) { if (!guard('grade.review')) return true; const id = ok.dataset.grvok, k = R.kolById(s, id), h = R.confirmGrade(s, id, ctx()); if (h) { commit(G.rev.confirmed(k.display_name, h.to)); if (o.kolId) U.closeModal(); else draw(); } return true; }
      const ov = t.closest('[data-grvover]'); if (ov) { if (!guard('grade.review')) return true; me.editing = ov.dataset.grvover; me.pick = (R.gradeOf(s, me.editing) || {}).suggested || ''; me.why = ''; draw(); const w = $('grv_why'); if (w) w.focus(); return true; }
      const pk = t.closest('[data-grvpick]'); if (pk) { me.why = ($('grv_why') || {}).value || ''; me.pick = pk.dataset.grvpick; draw(); return true; }
      if (t.closest('[data-grvcancel]')) { me.editing = null; draw(); return true; }
      const sv = t.closest('[data-grvsave]'); if (sv) {
        if (!guard('grade.review')) return true;
        const why = R.trim(($('grv_why') || {}).value || ''), err = $('grv_err');
        if (!R.GRADES.includes(me.pick) || !why || R.looksSensitive(why)) { if (err) err.innerHTML = `<div class="check err">✕ <span>${esc(!R.GRADES.includes(me.pick) ? G.rev.newGrade : R.looksSensitive(why) ? C.msg.sensitive : G.rev.reasonReq)}</span></div>`; return true; }
        const id = sv.dataset.grvsave, k = R.kolById(s, id), h = R.overrideGrade(s, id, me.pick, why, ctx()); me.editing = null;
        if (h) { commit(G.rev.overridden(k.display_name, h.to)); if (o.kolId) U.closeModal(); else draw(); }
        return true;
      }
      const kl = t.closest('[data-grvkol]'); if (kl) { const id = kl.dataset.grvkol; U.closeModal(); KT.profile.open(id, { tab: 'performance' }); return true; }
      return false;
    }
    draw();
    if (me.editing) { const w = $('grv_why'); if (w) w.focus(); }
    return me;
  }

  /* ===================== KOL modal › Performance: the grade · On time · Avg days late · ER · Revisions · history · the posts used (CR-35 §3.6) ===================== */
  function profileHTML(s, kolId) {
    const rec = R.gradeOf(s, kolId), g = R.gradeEngine(s, kolId, today()), hist = R.historyOf(s, kolId), rules = rulesNow();
    const wait = !!rec && R.needsReview(rec, today(), rules), rev = R.canReview(U.actor());
    /* KOL Manager / Admin: Review grade · Override · Set grade — anyone else: View (the card, no buttons) */
    const btn = !rec ? '' : rev ? `<button type="button" class="btn small${wait ? ' primary' : ''}" data-grvopen="${esc(kolId)}">${esc(wait ? G.rev.due : R.GRADES.includes(rec.confirmed) || R.GRADES.includes(rec.suggested) ? G.rev.override : G.rev.setGrade)}</button>`
      : `<button type="button" class="btn small" data-grvopen="${esc(kolId)}">${esc(G.rev.view)}</button>`;
    const head = `<div class="gp-head">${rec && R.GRADES.includes(rec.confirmed) ? letterHTML(rec.confirmed, { name: true, cls: 'big' }) : `<span class="gchip g-none big">${esc(!rec || rec.status === 'none' ? G.notGraded : rec.status === 'not_enough' ? G.notEnough : G.notGraded)}</span>`}` +
      `<span class="gp-sug"><span class="muted small">${esc(G.suggested)}</span> ${R.GRADES.includes(g.suggested) ? letterHTML(g.suggested, { name: true }) : `<span class="muted">${esc(G.status[g.status] || '—')}</span>`}` +
      `${wait ? ` <span class="chip warn-chip">${esc(G.waiting)}</span>` : ''}</span>${btn}</div>`;
    const lock = rec && rec.locked_until ? `<div class="muted small">${esc(G.lockedUntil(R.dmy(rec.locked_until)))}</div>` : '';
    const reason = g.reason && g.reason.length ? `<div class="hint gp-reason">${esc(reasonText(g.reason, s))} · ${esc(G.window(rules.window_posts, rules.window_months))}</div>` : '';
    const histHTML = hist.length ? `<ul class="hist-log gp-hist">${hist.map(h => `<li><span class="dt">${esc(R.dmy(String(h.at).slice(0, 10)))}</span><span>${h.from ? letterHTML(h.from) : `<span class="muted">${esc(G.notGraded)}</span>`} → ${letterHTML(h.to)} <span class="muted small">${esc(G.histKind[h.kind] || h.kind)}</span></span>` +
      `<span class="muted">${esc(R.changedByName(s, h.by))}${h.reason ? ` · ${esc(h.reason)}` : ''}</span></li>`).join('')}</ul>` : `<div class="hint">${esc(G.noHistory)}</div>`;
    return { head: head + numsHTML(g, true) + lock + reason, history: histHTML, posts: postsUsedHTML(s, g, true), n: (g.posts || []).length };
  }

  /* ===================== Incidents (Deal modal › History) ===================== */
  const incLabel = t => G.inc.types[t] || t;
  function incidentsHTML(s, d) {
    const list = R.incidentsOfDeal(s, d.deal_id).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), edit = can('deal.edit');
    const rows = list.map(i => `<li class="inc-row${R.isSerious(i) ? ' serious' : ''}"><span class="dt">${esc(R.dmy(i.date))}</span><b>${esc(incLabel(i.type))}</b>${R.isSerious(i) ? ` <span class="chip err-chip">${esc('D')}</span>` : ''}` +
      `${i.note ? `<span class="muted">${esc(i.note)}</span>` : ''}<span class="muted small">${esc(G.inc.by(R.changedByName(s, i.created_by), R.dmy(String(i.created_at || '').slice(0, 10))))}</span>` +
      (edit ? `<button type="button" class="link small danger" data-incrm="${esc(i.incident_id)}">${esc(G.inc.remove)}</button>` : '') + `</li>`).join('');
    return `<section class="sec" id="dm_incidents"><div class="sec-h"><span>${esc(G.inc.sec)}</span>${edit ? `<button type="button" class="btn small sec-add" data-incadd="${esc(d.deal_id)}">${esc(G.inc.add)}</button>` : ''}</div>` +
      (list.length ? `<ul class="inc-list">${rows}</ul>` : `<div class="hint">${esc(G.inc.none)}</div>`) + `</section>`;
  }
  /* the Deal modal's clicks of this section → true when handled */
  function dealClick(e, after) {
    const a = e.target.closest('[data-incadd]'); if (a) { incidentDialog(a.dataset.incadd, a, after); return true; }
    const r = e.target.closest('[data-incrm]'); if (r) { removeIncidentAsk(r.dataset.incrm, after); return true; }
    return false;
  }
  function incidentDialog(dealId, opener, after) {
    if (!guard('deal.edit')) return;
    const d = state().deals.find(x => x.deal_id === dealId); if (!d) return;
    const pf = U.popForm(opener, { title: G.inc.title, ok: G.inc.save, focus: '#inc_type',
      body: `<div class="field"><label for="inc_type">${esc(G.inc.type)} <span class="req">*</span></label><select id="inc_type">${optionsHTML(R.INCIDENT_TYPES.map(t => ({ value: t, label: incLabel(t) })), '', G.inc.choose)}</select></div>` +
        `<div class="check warn hidden" id="inc_serious">! <span>${esc(G.inc.serious)}</span></div>` +
        `<div class="field"><label>${esc(G.inc.date)} <span class="req">*</span></label>${dateHTML('id="inc_date"', today(), { label: G.inc.date })}</div>` +
        `<div class="field"><label for="inc_note">${esc(G.inc.note)}</label><textarea id="inc_note" rows="2" placeholder="${esc(G.inc.notePh)}"></textarea></div>`,
      onOk: m => {
        const v = { type: m.querySelector('#inc_type').value, date: m.querySelector('#inc_date').value, note: m.querySelector('#inc_note').value }, res = R.validateIncident(v);
        if (res.errs.length) { U.popFormError(m, res.errs[0].msg); return false; }
        if (!guard('deal.edit')) return false;
        const s = state(), d2 = s.deals.find(x => x.deal_id === dealId); if (!d2) return true;
        const out = R.newIncident(d2, v, { incidentId: store.newId('incident'), eventId: store.newEventId(), user: userId(), now: new Date().toISOString() });
        s.deal_incidents.push(out.rec); s.deal_events.push(out.event); commit(G.inc.saved); if (after) after();
        return true;
      } });
    const m = pf || document.querySelector('.popform'); if (m) m.querySelector('#inc_type').addEventListener('change', e => { const w = m.querySelector('#inc_serious'); if (w) w.classList.toggle('hidden', !R.SERIOUS_INCIDENTS.includes(e.target.value)); });
  }
  async function removeIncidentAsk(id, after) {
    if (!guard('deal.edit')) return;
    if (!(await confirmDialog(G.inc.removeTitle, G.inc.removeBody, G.inc.remove, true))) return;
    const s = state(), rec = (s.deal_incidents || []).find(i => i.incident_id === id && !i.deleted_at); if (!rec) return;
    s.deal_events.push(R.removeIncident(rec, { eventId: store.newEventId(), user: userId(), now: new Date().toISOString() })); commit(G.inc.removed); if (after) after();
  }

  /* ===================== a post's numbers: where from · against the benchmark ===================== */
  function sourceHTML(p) {
    if (!R.hasMetrics(p) && p.sales == null && p.roas == null) return '';
    const src = p.metrics_legacy ? 'manual' : p.metrics_source || 'manual', at = String(p.metrics_updated_at || '').slice(0, 10);
    return `<span class="msrc ms-${esc(src)}" title="${esc(G.sourceTip(G.source[src] || src, at ? R.dmy(at) : '', p.metrics_day))}">${esc(G.source[src] || src)}${at ? ` · ${esc(R.dmy(at).slice(0, 5))}` : ''}</span>`;
  }
  /* "CPM ฿12.00 · 1.25× benchmark" for the pillar it is graded by */
  function ratioHTML(s, d, p) {
    if (!R.isPosted(p, today())) return '';
    const r = R.postRatio(s, d, p, {});
    const what = r.pillar === 'Awareness' ? [G.cpm, r.cpm, true] : r.pillar === 'Consideration' ? [G.cpcons, r.cpcons, true] : r.pillar === 'Conversion' || r.pillar === 'Affiliate' ? [G.roas, r.roas, false]
      : r.pillar === 'Awareness & Consideration' ? [`${G.cpm} · ${G.cpcons}`, null, true] : null;
    if (!what) return '';
    if (r.ratio == null) return `<span class="pratio muted small" title="${esc(G.noRatio)}">${esc(what[0])} — ${esc(r.bench && (r.bench.cpm || r.bench.cpcons || r.bench.roas) ? G.noRatio : G.noBench)}</span>`;
    const actual = what[1] == null ? '' : what[2] ? `฿${what[1].toFixed(2)}` : what[1].toFixed(2);
    return `<span class="pratio ${r.ratio >= 1 ? 'ok' : 'late'}" title="${esc(G.vsBench(pctOf(r.ratio)))}">${esc(G.ratioLine(what[0], actual, ratioText(r.ratio)))}</span>`;
  }

  /* ===================== Deals › ⋯ › Import metrics ===================== */
  async function tableOf(f) {
    if (!/\.xlsx$/i.test(f.name)) return R.parseCSV(await U.readText(f));
    const book = await KT.xlsx.read(new Uint8Array(await f.arrayBuffer())), sheets = book.sheets || [];
    const sh = sheets.find(x => (x.rows[0] || []).some(v => /post link|deal id/i.test(String(v == null ? '' : v)))) || sheets[0];
    return sh ? sh.rows.map(r => r.map(v => (v == null ? '' : String(v)))) : [];
  }
  function openImport(opener, after) {
    if (!guard('deal.edit')) return;
    const P = G.imp, me = { rows: null, plan: null, replace: false };
    U.createModal({ size: 'L', title: P.title, opener, isDirty: () => !!me.plan && me.plan.counts.matched > 0,
      foot: [`<div class="muted small" id="mi_sum"></div>`, U.cmButtons(P.apply(0), 'mi_ok', { attrs: ' disabled' })],
      body: `<div class="toolbar"><input type="file" id="mi_file" accept=".csv,text/csv,.xlsx" style="width:auto" aria-label="${esc(P.pick)}"><button type="button" class="btn small" id="mi_tpl">${U.ICON.download}<span>${esc(P.template)}</span></button>` +
        `<label class="tick small" title="${esc(P.replaceManualTip)}"><input type="checkbox" id="mi_replace"> ${esc(P.replaceManual)}</label></div><p class="hint">${esc(P.hint)}</p><div id="mi_prev"></div>` });
    $('mi_tpl').addEventListener('click', () => { U.download('Metrics_Import_Template.csv', '﻿' + R.toCSV([R.IMPORT_TEMPLATE]), 'text/csv;charset=utf-8'); toast(P.templateDone); });
    const show = () => {
      if (!me.rows) return;
      me.plan = R.planMetricsImport(state(), me.rows, { user: U.actor(), replaceManual: me.replace, today: today() });
      const pl = me.plan, s = state(), n = pl.counts.matched;
      $('mi_sum').textContent = pl.error ? '' : P.counts(pl.counts);
      const okB = $('mi_ok'); okB.textContent = P.apply(n); okB.disabled = !n;
      if (pl.error) { $('mi_prev').innerHTML = `<div class="check err">✕ <span>${esc(pl.error)}</span></div>`; return; }
      if (!pl.lines.length) { $('mi_prev').innerHTML = `<div class="hint">${esc(P.empty)}</div>`; return; }
      const who = x => { if (!x.post) return esc(x.link || x.dealId || ''); const k = R.kolById(s, x.deal.kol_id); return `<b>${esc(k ? k.display_name : '')}</b> <span class="muted small">${esc(x.deal.deal_id)}</span>`; };
      const change = x => (x.changed && x.changed.length ? x.changed.map(k => `${G.metric[k] || k} ${x.from[k] == null ? '' : R.fmtNum(x.from[k]) + ' → '}${R.fmtNum(x.to[k])}`).join(' · ') : '');
      $('mi_prev').innerHTML = `<div class="tablewrap" style="max-height:52vh"><table class="tbl compact-sm mi-tbl"><thead><tr><th class="num">${esc(P.colLine)}</th><th>${esc(P.colPost)}</th><th>${esc(P.colStatus)}</th><th>${esc(P.colChange)}</th></tr></thead><tbody>` +
        pl.lines.map(x => `<tr class="mi-${esc(x.status)}"><td class="num">${x.line}</td><td>${who(x)}</td><td><span class="chip${x.status === 'matched' ? ' ok-chip' : x.status === 'manual' || x.status === 'nochange' ? '' : ' warn-chip'}">${esc(P.st[x.status])}</span></td>` +
          `<td class="small">${esc(x.status === 'matched' ? change(x) : x.reason || '')}</td></tr>`).join('') + `</tbody></table></div>`;
    };
    $('mi_replace').addEventListener('change', e => { me.replace = e.target.checked; show(); });
    $('mi_file').addEventListener('change', async e => {
      const f = e.target.files[0]; me.rows = null; me.plan = null; $('mi_prev').innerHTML = ''; $('mi_ok').disabled = true; if (!f) return;
      try { me.rows = await tableOf(f); } catch (x) { $('mi_prev').innerHTML = `<div class="check err">✕ <span>${esc(P.readError)}</span></div>`; return; }
      show();
    });
    $('mi_ok').addEventListener('click', () => {
      if (!me.plan || !guard('deal.edit')) return;
      const s = state(), td = today(), now = new Date().toISOString(), uid = userId(), lines = me.plan.lines.filter(x => x.status === 'matched');
      const snaps = [], base = store.newEventId();
      lines.forEach((x, i) => { const p = s.deal_posts.find(q => q.post_id === x.post.post_id); if (!p) return;
        snaps.push({ id: p.post_id, values: R.metricsOf(p), at: p.metrics_updated_at, by: p.metrics_updated_by, source: p.metrics_source, day: p.metrics_day, legacy: p.metrics_legacy });
        s.deal_events.push(R.setMetrics(p, x.values, { today: x.date || td, now, user: uid, eventId: base + i, day: x.day }, 'import')); });
      U.closeModal(); commit(); if (after) after();
      toastAction(P.done(snaps.length), C.deal.undo, () => {
        const st = state(); snaps.forEach(sn => { const p = st.deal_posts.find(q => q.post_id === sn.id); if (!p) return; R.METRICS_ALL.forEach(k => { p[k] = sn.values[k]; });
          Object.assign(p, { metrics_updated_at: sn.at, metrics_updated_by: sn.by, metrics_source: sn.source, metrics_day: sn.day, metrics_legacy: sn.legacy }); });
        commit(P.undone); if (after) after();
      }, 10000);
    });
  }

  return { CLS, letterHTML, chipHTML, levelHTML, reasonText, reasonOf, numsHTML, postsUsedHTML, ratioText, profileHTML, openQueue, review: (kolId, o = {}) => openQueue(Object.assign({}, o, { kolId })), incidentsHTML, dealClick, incidentDialog, sourceHTML, ratioHTML, openImport };
})();
