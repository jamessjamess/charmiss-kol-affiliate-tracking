/* screen-partners.js — CR-34 §3.6: Dashboard › Partners — the partners of the committed deals in range (filters: date · Campaign · Pillar · Partner type) ·
   4 KPI cards (as All campaigns: Graded partners · A + B share · Spend on C + D · Waiting for review) · Grade mix (KOL · Affiliate — count or spend) ·
   Grade × Tier (a number → KOL Master with that grade and tier) · Grade movement · Top performers (A · Add to campaign) · Watch list (C / D · the main reason) ·
   Review queue (5 · View all). The grade shown is the confirmed one (R.partnersData · R.gradeEngine). Drawn into the Dashboard's #ov_tools / #ov_body. → KT.partners */
KT.partners = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, pref, can, go, optionsHTML, ICON, toast } = U;
  const G = C.grade, P = C.grade.part, O = C.overview;
  const KEYS = ['A', 'B', 'C', 'D', 'none'];
  const pp = { preset: (v => (R.PRESETS.includes(v) ? v : 'this_year'))(pref.get('partpreset', 'this_year')), from: '', to: '', campaign: '', pillar: '', partner: '', measure: 'n' };
  const range = () => (pp.preset === 'custom' && pp.from && pp.to ? [pp.from, pp.to] : R.presetRange(pp.preset, today()));
  const filt = () => { const [from, to] = range(); return { from, to, campaign: pp.campaign, pillar: pp.pillar, partner: pp.partner }; };
  const gradeName = g => (g === 'none' ? P.notGraded : `${g} · ${G.names[g]}`);
  const money = v => (R.fmtCompact ? R.fmtCompact(v) : R.baht(v));   // ฿1.2M (fmtCompact writes the ฿)
  const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);

  function toolsHTML() {
    const s = state(), [from, to] = range();
    const presets = R.PRESETS.concat(['custom']).map(p => `<button type="button" data-pppreset="${p}" class="${pp.preset === p ? 'on' : ''}">${esc(O.presets[p])}</button>`).join('');
    const camps = R.campaignsInRange(s, from, to, today(), R.DASH_STATUS_DEFAULT).map(c => ({ value: c.campaign_id, label: c.campaign_name }));
    if (pp.campaign && !camps.some(c => c.value === pp.campaign)) pp.campaign = '';
    return `<div class="seg" id="pp_preset">${presets}</div><span class="muted small">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}</span>` +
      `<label class="tlab">${esc(P.campaign)} <select id="pp_camp">${optionsHTML(camps, pp.campaign, P.allCampaigns)}</select></label>` +
      `<label class="tlab">${esc(P.pillar)} <select id="pp_pillar">${optionsHTML(R.PILLARS || [], pp.pillar, P.allPillars)}</select></label>` +
      `<span class="tlab">${esc(P.partner)} ${U.partnerSegHTML('data-pppt', pp.partner, { all: true, keys: ['kol', 'affiliate'], id: 'pp_pt' })}</span>` +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-ppexport title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>` +
      `<span class="hidden">${U.rangeHTML('id="pp_crange"', from, to, { label: O.presets.custom })}</span>`;
  }
  const kpiCard = o => `<div class="kpi kc"><div class="l">${U.labelInfo(o.label, o.tip, o.label)}</div><div class="v"><span class="vn">${o.value}</span>${o.suffix ? ` <small>${esc(o.suffix)}</small>` : ''}</div>` +
    `<div class="kbar" role="img" aria-label="${esc(o.caption)}" title="${esc(o.caption)}">${o.bar || ''}</div><div class="cap" title="${esc(o.caption)}">${esc(o.caption)}</div></div>`;
  const seg = (w, cls) => (w > 0 ? `<i class="${cls}" style="width:${Math.max(0.6, Math.min(100, w)).toFixed(2)}%"></i>` : '');
  function kpisHTML(d) {
    const k = d.kpi, all = d.rows.length || 1, by = g => d.rows.filter(r => (r.grade || 'none') === g).length;
    return kpiCard({ label: P.kGraded, tip: P.kGradedTip, value: R.fmtNum(k.graded), suffix: '', caption: P.kGradedCap(R.fmtNum(k.partners), R.fmtNum(k.notEnough)),
        bar: KEYS.map(g => seg(by(g) / all * 100, 'gs gs-' + g.toLowerCase())).join('') }) +
      kpiCard({ label: P.kAB, tip: P.kABTip, value: pct(k.abShare), caption: P.kABCap(pct(k.abSpendShare)), bar: seg((k.abShare || 0) * 100, 'gs gs-a') }) +
      kpiCard({ label: P.kCD, tip: P.kCDTip, value: esc(R.baht(k.cdSpend)), caption: P.kCDCap(pct(k.cdShare)), bar: seg((k.cdShare || 0) * 100, 'gs gs-d') }) +
      kpiCard({ label: P.kReview, tip: P.kReviewTip, value: R.fmtNum(k.review), caption: P.kReviewCap, bar: '' });
  }
  /* Grade mix: one bar a partner type · Count or Spend · the letters under it (never colour only) */
  function mixHTML(d) {
    const m = pp.measure, val = (x, g) => (m === 'spend' ? x.by[g].spend : x.by[g].n), tot = x => (m === 'spend' ? x.spend : x.total);
    const rows = d.mix.filter(x => x.total || !pp.partner).map(x => { const t = tot(x) || 1;
      return `<div class="gmix-row"><span class="gmix-l">${esc(P[x.type])} <span class="muted small">${R.fmtNum(x.total)}</span></span><span class="gmix-bar">` +
        KEYS.map(g => { const v = val(x, g); return v ? `<i class="gs gs-${g.toLowerCase()}" style="width:${(v / t * 100).toFixed(2)}%" title="${esc(P.mixTip(gradeName(g), R.fmtNum(x.by[g].n), R.baht(x.by[g].spend)))}">${v / t >= 0.08 ? `<b>${g === 'none' ? '—' : g}</b>` : ''}</i>` : ''; }).join('') +
        `</span><span class="gmix-n muted small">${esc(m === 'spend' ? money(x.spend) : R.fmtNum(x.total))}</span></div>`; }).join('');
    const legend = `<div class="legend gmix-legend">${KEYS.map(g => `<span class="lg"><i class="gs gs-${g.toLowerCase()}"></i>${esc(gradeName(g))}</span>`).join('')}</div>`;
    return `<div class="card"><div class="card-head"><h3>${esc(P.mixTitle)}</h3><div class="btns ov-ctl"><div class="seg" data-ppmeasure role="group" aria-label="${esc(P.mixTitle)}">` +
      `<button type="button" data-v="n" class="${m === 'n' ? 'on' : ''}">${esc(P.count)}</button><button type="button" data-v="spend" class="${m === 'spend' ? 'on' : ''}">${esc(P.spend)}</button></div></div></div>` +
      (d.rows.length ? rows + legend : `<div class="hint">${esc(P.none)}</div>`) + `</div>`;
  }
  /* Grade × Tier: count · spend in each cell (a click → KOL Master filtered) */
  function tierHTML(d) {
    if (!d.tierGrid.length) return `<div class="card"><div class="card-head"><h3>${esc(P.tierTitle)}</h3></div><div class="hint">${esc(P.none)}</div></div>`;
    return `<div class="card"><div class="card-head"><h3>${U.labelInfo(P.tierTitle, P.tierTip, P.tierTitle)}</h3></div><div class="tablewrap"><table class="tbl compact-sm gt-tbl"><thead><tr><th>${esc(P.tierCol)}</th>` +
      KEYS.map(g => `<th class="num">${g === 'none' ? esc(P.notGraded) : KT.grades.letterHTML(g)}</th>`).join('') + `</tr></thead><tbody>` +
      d.tierGrid.map(r => `<tr><td>${esc(r.tier)}</td>` + KEYS.map(g => { const c = r.by[g];
        return `<td class="num">${c.n ? `<button type="button" class="link gt-cell" data-ppcell="${esc(g)}" data-pptier="${esc(r.tier)}" title="${esc(P.tierTip)}"><b>${R.fmtNum(c.n)}</b><span class="muted small">${esc(money(c.spend))}</span></button>` : '<span class="muted">—</span>'}</td>`; }).join('') + `</tr>`).join('') +
      `</tbody></table></div></div>`;
  }
  function moveHTML(d) {
    const m = d.movement, list = m.list.slice(0, 8), s = state();
    return `<div class="card"><div class="card-head"><h3>${esc(P.moveTitle)}</h3></div><div class="gmove-sum"><span class="ok">↑ ${R.fmtNum(m.up)} ${esc(P.up)}</span><span class="late">↓ ${R.fmtNum(m.down)} ${esc(P.down)}</span><span class="muted">${R.fmtNum(m.fresh)} ${esc(P.fresh)}</span></div>` +
      (list.length ? `<ul class="gmove-list">${list.map(h => `<li><span class="dt">${esc(R.dmy(String(h.at).slice(0, 10)))}</span><b>${esc(h.kol ? h.kol.display_name : h.kol_id)}</b>` +
        `<span>${h.from ? KT.grades.letterHTML(h.from) : `<span class="muted">${esc(P.notGraded)}</span>`} → ${KT.grades.letterHTML(h.to)}</span><span class="muted small">${esc(G.histKind[h.kind] || h.kind)} · ${esc(R.changedByName(s, h.by))}</span></li>`).join('')}</ul>`
        : `<div class="hint">${esc(P.noMoves)}</div>`) + `</div>`;
  }
  function listHTML(d, kind) {
    const s = state(), rows = (kind === 'top' ? d.top : d.watch).slice(0, 8), add = kind === 'top' && can('deal.edit');
    const body = rows.length ? `<div class="tablewrap"><table class="tbl compact-sm gp-tbl"><thead><tr><th>${esc(P.partnerCol)}</th><th>${esc(P.gradeCol)}</th><th>${esc(kind === 'top' ? P.tierCol : P.reasonCol)}</th><th class="num">${esc(P.spendCol)}</th>${add ? '<th></th>' : ''}</tr></thead><tbody>` +
      rows.map(r => `<tr class="click" data-ppkol="${esc(r.kol.kol_id)}" tabindex="0"><td><span class="kname"><b>${U.nameHTML(r.kol.display_name)}</b>${U.partnerChipHTML(r.kol)}</span></td><td>${KT.grades.chipHTML(s, r.kol.kol_id, { noWait: true })}</td>` +
        `<td class="${kind === 'top' ? '' : 'small'}">${esc(kind === 'top' ? r.tier : KT.grades.reasonText(r.rec ? r.rec.reason : []))}</td><td class="num">${esc(R.baht(r.spend))}</td>` +
        (add ? `<td><button type="button" class="btn small" data-ppadd="${esc(r.kol.kol_id)}">${esc(P.addTo)}</button></td>` : '') + `</tr>`).join('') + `</tbody></table></div>`
      : `<div class="hint">${esc(P.none)}</div>`;
    return `<div class="card"><div class="card-head"><h3>${esc(kind === 'top' ? P.topTitle : P.watchTitle)} <span class="muted small">${R.fmtNum((kind === 'top' ? d.top : d.watch).length)}</span></h3></div>${body}</div>`;
  }
  function reviewHTML() {
    const s = state(), q = R.reviewQueue(s, today()), list = q.slice(0, 5), ok = R.canReview(U.actor());
    return `<div class="card"><div class="card-head"><h3>${esc(P.reviewTitle)} <span class="muted small">${R.fmtNum(q.length)}</span></h3>${q.length ? `<div class="btns ov-ctl"><button type="button" class="btn small" data-ppqueue>${esc(G.rev.viewAll(q.length))}</button></div>` : ''}</div>` +
      (list.length ? `<ul class="grq-list">${list.map(x => `<li><span class="kname"><b>${U.nameHTML(x.kol.display_name)}</b>${U.partnerChipHTML(x.kol)}</span><span>${R.GRADES.includes(x.rec.confirmed) ? KT.grades.letterHTML(x.rec.confirmed) : `<span class="muted small">${esc(G.notGraded)}</span>`} → ${KT.grades.letterHTML(x.rec.suggested)}</span>` +
        `<span class="muted small grq-why">${esc(KT.grades.reasonText(x.rec.reason))}</span><button type="button" class="btn small${ok ? ' primary' : ''}" data-ppreview="${esc(x.kol.kol_id)}">${esc(P.review)}</button></li>`).join('')}</ul>`
        : `<div class="hint">${esc(G.rev.empty)}</div>`) + `</div>`;
  }
  function render() {
    $('ov_tools').innerHTML = toolsHTML();
    const d = R.partnersData(state(), filt(), today());
    $('ov_body').innerHTML = `<div class="kpis k4 kc4" id="pp_kpis">${kpisHTML(d)}</div><div class="ov-r4 pp-r">${mixHTML(d)}${tierHTML(d)}</div>` +
      `<div class="ov-r4 pp-r">${listHTML(d, 'top')}${listHTML(d, 'watch')}</div><div class="ov-r4 pp-r">${moveHTML(d)}${reviewHTML()}</div>`;
    const cr = $('pp_crange'); if (cr) cr.addEventListener('change', e => { const x = e.target.dataset; if (R.isISODate(x.from) && R.isISODate(x.to)) { Object.assign(pp, { preset: 'custom', from: x.from, to: x.to }); render(); } });
  }
  /* the Dashboard hands its events here while the tab is Partners → true when handled */
  function toolsClick(e) {
    const p = e.target.closest('[data-pppreset]');
    if (p) { if (p.dataset.pppreset === 'custom') { const [a, z] = range(); U.openRange($('pp_crange'), { from: a, to: z, anchor: p }); return true; }
      Object.assign(pp, { preset: p.dataset.pppreset, from: '', to: '' }); pref.set('partpreset', pp.preset); render(); return true; }
    const pt = e.target.closest('[data-pppt]'); if (pt) { pp.partner = U.partnerSegPick(pt, 'data-pppt'); render(); return true; }
    if (e.target.closest('[data-ppexport]')) { exportTab(); return true; }
    return false;
  }
  function toolsChange(e) {
    const t = e.target;
    if (t.id === 'pp_camp') { pp.campaign = t.value; render(); return true; }
    if (t.id === 'pp_pillar') { pp.pillar = t.value; render(); return true; }
    return false;
  }
  function bodyClick(e) {
    const ms = e.target.closest('[data-ppmeasure] button'); if (ms) { pp.measure = ms.dataset.v; render(); return true; }
    const c = e.target.closest('[data-ppcell]'); if (c) { go('kol', { grade: c.dataset.ppcell, tier: c.dataset.pptier }); return true; }
    const a = e.target.closest('[data-ppadd]'); if (a) { KT.bulk.open({ kolIds: [a.dataset.ppadd] }); return true; }
    const rv = e.target.closest('[data-ppreview]'); if (rv) { KT.grades.review(rv.dataset.ppreview, { opener: rv, after: () => { if (U.currentTab() === 'overview') render(); } }); return true; }
    if (e.target.closest('[data-ppqueue]')) { KT.grades.openQueue({ after: () => { if (U.currentTab() === 'overview') render(); } }); return true; }
    const k = e.target.closest('[data-ppkol]'); if (k && !e.target.closest('button,a')) { KT.profile.open(k.dataset.ppkol, { tab: 'performance', opener: k }); return true; }
    return false;
  }
  /* Export: the sheet Partners (every partner in scope · the confirmed grade · the suggested one · the numbers) */
  function exportTab() {
    const [from, to] = range(), now = new Date(), td = today(), t = KT.export.rowsFor('partners', { state: state(), f: filt(), today: td });
    const scope = `${pp.preset === 'custom' ? O.presets.custom : O.presets[pp.preset]} · ${R.dmy(from)} – ${R.dmy(to)}`;
    const meta = { tab: P.tab, scope, at: `${R.dmy(td)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, by: (U.me() || {}).display_name || '' };
    const name = KT.export.fileName('Dashboard_Partners', KT.export.scopeName(pp.preset, from, to), td, 'xlsx');
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf(t, meta)]), KT.xlsx.MIME);
    toast(C.io.exported(name, 1));
  }
  /* CR-34 §3.7 — Dashboard › By campaign: "Clips beating benchmark 23% (target 20%)" + each posted clip's CPM · CPCons · ROAS against the benchmark */
  function campaignBenchHTML(s, campaignId, phaseId) {
    const B = G.camp, x = R.campaignBenchmark(s, campaignId, phaseId, today()), b = x.bench, any = ['cpm', 'cpcons', 'roas', 'affiliate_roas'].some(k => b[k] != null);
    const head = `<div class="cb-head"><b class="cb-pct${x.pct != null && x.target != null && x.pct * 100 >= x.target ? ' ok' : x.pct != null ? ' late' : ''}">${esc(B.clips(pct(x.pct)))}</b>` +
      `${x.target != null ? `<span class="muted">(${esc(B.target(`${x.target}%`))})</span>` : ''}<span class="muted small">${esc(x.measured ? B.beating(x.beating, x.measured) : B.noMeasured)}</span></div>`;
    const money2 = v => (v == null ? '<span class="muted">—</span>' : `฿${Number(v).toFixed(2)}`);
    const withNums = x.rows.filter(r => r.cpm != null || r.cpcons != null || r.roas != null);   // the clips that have numbers
    const rows = withNums.slice(0, 40).map(r => `<tr class="click" data-pbdeal="${esc(r.deal.deal_id)}" tabindex="0"><td><b>${esc(r.kol ? r.kol.display_name : '')}</b> <span class="muted small">${esc(R.dmy(r.post.post_date))}</span></td>` +
      `<td>${r.pillar ? (U.pillarChipHTML ? U.pillarChipHTML(r.pillar === 'Affiliate' ? r.pillar : r.pillar) : esc(r.pillar)) : '<span class="muted">—</span>'}</td><td class="num">${esc(R.baht(r.cost))}</td><td class="num">${r.reach != null ? esc(R.fmtNum(r.reach)) : '<span class="muted">—</span>'}</td>` +
      `<td class="num">${money2(r.cpm)}</td><td class="num">${money2(r.cpcons)}</td><td class="num">${r.roas != null ? esc(r.roas.toFixed(2)) : '<span class="muted">—</span>'}</td>` +
      `<td class="num"><b class="${r.ratio == null ? 'muted' : r.ratio > 1 ? 'ok' : 'late'}">${r.ratio == null ? '—' : esc(KT.grades.ratioText(r.ratio))}</b></td></tr>`).join('');
    return `<div class="card ov-full cb-card"><div class="card-head"><h3>${esc(B.title)}</h3></div>${any ? head : `<div class="hint">${esc(B.noBench)}</div>`}` +
      (withNums.length ? `<div class="tablewrap" style="max-height:360px"><table class="tbl compact-sm cb-tbl"><thead><tr><th>${esc(B.colKol)}</th><th>${esc(B.colPillar)}</th><th class="num">${esc(B.colCost)}</th><th class="num">${esc(B.colReach)}</th>` +
        `<th class="num">${esc(B.colCpm)}</th><th class="num">${esc(B.colCpcons)}</th><th class="num">${esc(B.colRoas)}</th><th class="num">${esc(B.colRatio)}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="hint">${esc(B.noNumbers)}</div>`) + `</div>`;
  }
  return { render, toolsClick, toolsChange, bodyClick, campaignBenchHTML, _pp: pp };
})();
