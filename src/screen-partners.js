/* screen-partners.js — CR-34 §3.6 · CR-35: Dashboard › Partners — the partners of the committed deals in range.
   Filters: date · Campaign · Pillar · Partner type · Partner (one or more) · Grade · Tier (+ Clear filters) · Export.
   Row 1 (§3.2): Grade mix (donut · Count / Spend · a part or a legend line → the table shows that grade) · On-time posts · Engagement rate.
   Row 2 (§3.3): Partner performance — one row a partner: Tier · Grade · Posts · On time · Avg days late · Views · ER · CPV · Spend (a row → the KOL modal ›
   Performance). Row 3: Grade × Tier (a number → the table filtered) | Grade movement. Row 4: Top performers (A) | Watch list (C / D).
   Grade = the confirmed one, else the suggested one (dashed) · its tooltip = the main reason · Review grade lives in Operations (§3.5).
   Numbers: R.partnersData (R.gradeEngine · R.perfRows). Drawn into the Dashboard's #ov_tools / #ov_body. → KT.partners */
KT.partners = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, pref, can, optionsHTML, ICON, toast } = U;
  const G = C.grade, P = C.grade.part, T = C.grade.part.t, O = C.overview;
  const KEYS = ['A', 'B', 'C', 'D', 'none'];
  const DOT = { A: 'var(--ok)', B: 'var(--info)', C: 'var(--warn)', D: 'var(--err)', none: 'outline' };
  const pp = { preset: (v => (R.PRESETS.includes(v) ? v : 'this_year'))(pref.get('partpreset', 'this_year')), from: '', to: '', campaign: '', pillar: '', partner: '',
    kols: [], levels: [], tiers: [], measure: 'n', sort: { key: 'grade', dir: 'asc' } };
  const range = () => (pp.preset === 'custom' && pp.from && pp.to ? [pp.from, pp.to] : R.presetRange(pp.preset, today()));
  const filt = () => { const [from, to] = range(); return { from, to, campaign: pp.campaign, pillar: pp.pillar, partner: pp.partner, kols: pp.kols, levels: pp.levels, tiers: pp.tiers }; };
  const anyFilter = () => !!(pp.campaign || pp.pillar || pp.partner || pp.kols.length || pp.levels.length || pp.tiers.length);
  const gradeName = g => (g === 'none' ? P.notGraded : `${g} · ${G.names[g]}`);
  const money = v => (R.fmtCompact ? R.fmtCompact(v) : R.baht(v));   // ฿1.2M (fmtCompact writes the ฿)
  const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const pct2 = v => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
  const DASH = '<span class="muted">—</span>';

  /* ---------- the toolbar: the choices of Partner · Grade · Tier come from the partners in scope (date · Campaign · Pillar · Partner type) ---------- */
  function toolsHTML(d) {
    const s = state(), [from, to] = range(), pool = d.pool, cnt = f => pool.filter(f).length;
    const presets = R.PRESETS.concat(['custom']).map(p => `<button type="button" data-pppreset="${p}" class="${pp.preset === p ? 'on' : ''}">${esc(O.presets[p])}</button>`).join('');
    const camps = R.campaignsInRange(s, from, to, today(), R.DASH_STATUS_DEFAULT).map(c => ({ value: c.campaign_id, label: c.campaign_name }));
    const handles = id => R.accountsOfKol(s, id).map(a => a.handle ? '@' + a.handle : '').join(' ');
    const kolOpts = pool.slice().sort((a, b) => String(a.kol.display_name).localeCompare(String(b.kol.display_name), 'th'))
      .map(r => ({ value: r.kol.kol_id, label: r.kol.display_name, sub: r.grade ? r.grade + (r.gradeSrc === 'suggested' ? '?' : '') : '—', search: `${r.kol.display_name} ${handles(r.kol.kol_id)}` }));
    const gradeOpts = KEYS.map(g => ({ value: g, label: gradeName(g), sub: R.fmtNum(cnt(r => (r.grade || 'none') === g)), dot: DOT[g] }));
    const tierOpts = R.tierOrder(s.lookups.tier_rules || []).filter((t, i, a) => a.indexOf(t) === i).map(t => ({ value: t, label: t, sub: R.fmtNum(cnt(r => r.tier === t)) })).filter(o => o.sub !== '0');
    const ms = (id, options, key, all, aria, more) => U.multiSelect(Object.assign({ id, options, value: pp[key], label: U.msLabel(pp[key], options, all), aria, searchable: false,
      onChange: v => { pp[key] = v; render(); } }, more || {}));
    return `<div class="seg" id="pp_preset">${presets}</div><span class="muted small">${esc(`${R.dmy(from)} – ${R.dmy(to)}`)}</span>` +
      `<label class="tlab">${esc(P.campaign)} <select id="pp_camp">${optionsHTML(camps, pp.campaign, P.allCampaigns)}</select></label>` +
      `<label class="tlab">${esc(P.pillar)} <select id="pp_pillar">${optionsHTML(R.PILLARS || [], pp.pillar, P.allPillars)}</select></label>` +
      `<span class="tlab">${esc(P.partner)} ${U.partnerSegHTML('data-pppt', pp.partner, { all: true, keys: ['kol', 'affiliate'], id: 'pp_pt' })}</span>` +
      `<span class="tlab">${esc(P.who)} ${ms('pp_kols', kolOpts, 'kols', P.allWho, P.who, { searchable: true, placeholder: P.whoSearch })}</span>` +
      `<span class="tlab">${esc(P.grade)} ${ms('pp_levels', gradeOpts, 'levels', P.allGrades, P.grade)}</span>` +
      `<span class="tlab">${esc(P.tierCol)} ${ms('pp_tiers', tierOpts, 'tiers', P.allTiers, P.tierCol)}</span>` +
      (anyFilter() ? `<button type="button" class="btn small ghost" data-ppclear>× ${esc(P.clear)}</button>` : '') +
      `<span class="spacer"></span><button type="button" class="btn small ov-export" data-ppexport title="${esc(O.exportTip)}">${ICON.download}<span>${esc(O.exportTab)}</span></button>` +
      `<span class="hidden">${U.rangeHTML('id="pp_crange"', from, to, { label: O.presets.custom })}</span>`;
  }

  /* ---------- Row 1 (§3.2): Grade mix · On-time posts · Engagement rate ---------- */
  /* the donut: one part a grade (a 2px gap between parts) · the total in the middle · the legend carries the numbers · a part or a line → that grade */
  function mixHTML(d) {
    const m = pp.measure, val = x => (m === 'spend' ? x.spend : x.n), total = d.donut.reduce((a, x) => a + val(x), 0), R0 = 46, CIRC = 2 * Math.PI * R0;
    const on = g => pp.levels.length === 1 && pp.levels[0] === g;
    let at = 0;
    const parts = total ? d.donut.filter(x => val(x) > 0).map((x, i, list) => {
      const len = val(x) / total * CIRC, gap = list.length > 1 ? Math.min(2, len / 2) : 0, seg = `<circle class="dn-seg dn-${x.g.toLowerCase()}${on(x.g) ? ' on' : ''}" cx="60" cy="60" r="${R0}" ` +
        `stroke-dasharray="${(len - gap).toFixed(2)} ${(CIRC - len + gap).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" data-ppslice="${x.g}"><title>${esc(P.mixTip(gradeName(x.g), R.fmtNum(x.n), R.baht(x.spend), x.sug))}</title></circle>`;
      at += len; return seg; }).join('') : `<circle class="dn-empty" cx="60" cy="60" r="${R0}"></circle>`;
    const mid = `<text x="60" y="58" class="dn-v">${esc(m === 'spend' ? money(total) : R.fmtNum(total))}</text><text x="60" y="75" class="dn-l">${esc(P.mixCenter[m])}</text>`;
    const legend = `<div class="dn-legend">${d.donut.map(x => `<button type="button" class="dn-lg${on(x.g) ? ' on' : ''}" data-ppslice="${x.g}" title="${esc(P.mixPick(gradeName(x.g)))}" aria-pressed="${on(x.g)}">` +
      `<i class="gs gs-${x.g.toLowerCase()}"></i><span class="dn-name">${esc(gradeName(x.g))}</span><b>${esc(m === 'spend' ? money(x.spend) : R.fmtNum(x.n))}</b></button>`).join('')}</div>`;
    return `<div class="card pp-kc"><div class="card-head"><h3>${U.labelInfo(P.mixTitle, P.mixInfo, P.mixTitle)}</h3><div class="btns ov-ctl"><div class="seg" data-ppmeasure role="group" aria-label="${esc(P.mixTitle)}">` +
      `<button type="button" data-v="n" class="${m === 'n' ? 'on' : ''}">${esc(P.count)}</button><button type="button" data-v="spend" class="${m === 'spend' ? 'on' : ''}">${esc(P.spend)}</button></div></div></div>` +
      `<div class="dn-wrap"><svg class="dn" viewBox="0 0 120 120" role="img" aria-label="${esc(P.mixTitle)}"><g transform="rotate(-90 60 60)">${parts}</g>${mid}</svg>${legend}</div></div>`;
  }
  function onTimeHTML(d) {
    const k = d.kpi.ontime, b = R.gradeRules(state().lookups).b;
    const body = k.measured ? `<div class="pp-big${k.onTime * 100 < b * k.measured ? ' late' : ''}">${esc(pct(k.rate))}</div><div class="pp-sub">${esc(P.kOnTimeSub(R.fmtNum(k.onTime), R.fmtNum(k.measured)))}</div>` +
      `<div class="pp-prog" role="img" aria-label="${esc(P.kOnTimeSub(k.onTime, k.measured))}"><i style="width:${(k.rate * 100).toFixed(1)}%"></i></div>` +
      `<div class="muted small">${esc(k.late ? P.kOnTimeLate(k.avgLate) : P.kOnTimeNoLate)}</div>`
      : `<div class="pp-big muted">—</div><div class="pp-sub">${esc(P.kOnTimeNone)}</div>`;
    return `<div class="card pp-kc"><div class="card-head"><h3>${U.labelInfo(P.kOnTime, P.kOnTimeTip, P.kOnTime)}</h3></div>${body}</div>`;
  }
  function engagementHTML(d) {
    const e = d.kpi.engagement;
    const body = e.er != null ? `<div class="pp-big">${esc(pct2(e.er))}</div><div class="pp-sub">${esc(P.kErSub(e.posts))}</div>` : `<div class="pp-big muted">—</div><div class="pp-sub">${esc(P.kErNone)}</div>`;
    return `<div class="card pp-kc"><div class="card-head"><h3>${U.labelInfo(P.kEr, P.kErTip, P.kEr)}</h3></div>${body}</div>`;
  }

  /* ---------- Row 2 (§3.3): Partner performance (a row → the KOL modal › Performance) ---------- */
  const COLS = [['partner'], ['tier'], ['grade'], ['posts', 1], ['ontime', 1], ['late', 1], ['views', 1], ['er', 1], ['cpv', 1], ['spend', 1]];
  function cellHTML(k, r, s, b) {
    const rec = r.rec || {}, ot = r.ot;
    switch (k) {
      case 'partner': return `<td class="pp-who sticky"><span class="kname"><b>${U.nameHTML(r.kol.display_name)}</b>${U.partnerChipHTML(r.kol)}</span><span class="muted small">${esc(T.dealsN(r.deals))}</span></td>`;
      case 'tier': return `<td><span class="chip">${esc(r.tier)}</span></td>`;
      /* the whole reason in the tooltip · a serious Incident (No-show / Breach) = a red chip beside the grade */
      case 'grade': return `<td class="pp-lvl"${rec.reason && rec.reason.length ? ` title="${esc(KT.grades.reasonText(rec.reason, s))}"` : ''}>${KT.grades.levelHTML(s, r.kol.kol_id)}` +
        `${(rec.serious || []).length ? ` <span class="chip err-chip" title="${esc(T.seriousTip)}">${esc(T.serious(rec.serious.length))}</span>` : ''}</td>`;
      case 'posts': return `<td class="num">${r.posted ? esc(R.fmtNum(r.posted)) : DASH}</td>`;
      case 'ontime': return `<td class="num">${ot.measured ? `<span class="${ot.onTime * 100 < b * ot.measured ? 'late' : ''}" title="${esc(T.ontimeTip(ot.onTime, ot.measured, ot.late, ot.avgLate))}">${esc(`${ot.onTime}/${ot.measured}`)}</span>` : DASH}</td>`;
      case 'late': return `<td class="num">${ot.avgLate == null ? DASH : esc(String(ot.avgLate))}</td>`;
      case 'views': return `<td class="num">${r.views == null ? DASH : `<span title="${esc(R.fmtNum(r.views))}">${esc(U.shortNum(r.views))}</span>`}</td>`;
      case 'er': return `<td class="num">${r.er == null ? DASH : esc(pct2(r.er))}</td>`;
      case 'cpv': return `<td class="num">${r.cpv == null ? DASH : esc('฿' + r.cpv.toFixed(3))}</td>`;
      case 'spend': return `<td class="num">${esc(R.baht(r.spend))}</td>`;
      default: return '<td></td>';
    }
  }
  function tableHTML(d) {
    const s = state(), b = R.gradeRules(s.lookups).b, rows = R.sortPartnerRows(d.rows, pp.sort.key, pp.sort.dir, s.lookups.tier_rules || []);
    const th = ([k, num]) => `<th class="${num ? 'num ' : ''}${k === 'partner' ? 'pp-who sticky ' : ''}sort" data-ppsort="${k}"${T.tip[k] ? ` title="${esc(T.tip[k])}"` : ''}>` +
      `${esc(T.col[k])}${pp.sort.key === k ? `<span class="arr">${pp.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
    const body = rows.map(r => `<tr class="click" data-ppkol="${esc(r.kol.kol_id)}" tabindex="0" title="${esc(T.rowTip)}">${COLS.map(c => cellHTML(c[0], r, s, b)).join('')}</tr>`).join('');
    return `<div class="card pp-perf" id="pp_table"><div class="card-head"><h3>${esc(T.title)} <span class="muted small">${R.fmtNum(rows.length)}</span></h3></div>` +
      (rows.length ? `<div class="tablewrap pp-twrap"><table class="tbl compact-sm pp-tbl"><thead><tr>${COLS.map(th).join('')}</tr></thead><tbody>${body}</tbody></table></div>`
        : `<div class="hint">${esc(P.none)}</div>`) + `</div>`;
  }

  /* ---------- Rows 3–4 ---------- */
  /* Grade × Tier: count · spend in each cell (a click → Partner performance filtered to that grade and tier) */
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
      rows.map(r => `<tr class="click" data-ppkol="${esc(r.kol.kol_id)}" tabindex="0"><td><span class="kname"><b>${U.nameHTML(r.kol.display_name)}</b>${U.partnerChipHTML(r.kol)}</span></td><td>${KT.grades.levelHTML(s, r.kol.kol_id)}</td>` +
        `<td class="${kind === 'top' ? '' : 'small'}">${esc(kind === 'top' ? r.tier : KT.grades.reasonText(r.rec ? r.rec.reason : [], s))}</td><td class="num">${esc(R.baht(r.spend))}</td>` +
        (add ? `<td><button type="button" class="btn small" data-ppadd="${esc(r.kol.kol_id)}">${esc(P.addTo)}</button></td>` : '') + `</tr>`).join('') + `</tbody></table></div>`
      : `<div class="hint">${esc(P.none)}</div>`;
    return `<div class="card"><div class="card-head"><h3>${esc(kind === 'top' ? P.topTitle : P.watchTitle)} <span class="muted small">${R.fmtNum((kind === 'top' ? d.top : d.watch).length)}</span></h3></div>${body}</div>`;
  }
  /* a pick that is no longer in scope (another Campaign · Pillar · type) is dropped */
  function prune(d) {
    const ids = new Set(d.pool.map(r => r.kol.kol_id)), tiers = new Set(d.pool.map(r => r.tier));
    const k = pp.kols.filter(id => ids.has(id)), t = pp.tiers.filter(x => tiers.has(x)), changed = k.length !== pp.kols.length || t.length !== pp.tiers.length;
    pp.kols = k; pp.tiers = t;
    return changed;
  }
  function render() {
    const s = state(), [from, to] = range();
    if (pp.campaign && !R.campaignsInRange(s, from, to, today(), R.DASH_STATUS_DEFAULT).some(c => c.campaign_id === pp.campaign)) pp.campaign = '';
    let d = R.partnersData(s, filt(), today());
    if (prune(d)) d = R.partnersData(s, filt(), today());
    $('ov_tools').innerHTML = toolsHTML(d);
    $('ov_body').innerHTML = `<div class="pp-cards" id="pp_kpis">${mixHTML(d)}${onTimeHTML(d)}${engagementHTML(d)}</div>${tableHTML(d)}` +
      `<div class="ov-r4 pp-r">${tierHTML(d)}${moveHTML(d)}</div><div class="ov-r4 pp-r">${listHTML(d, 'top')}${listHTML(d, 'watch')}</div>`;
    const cr = $('pp_crange'); if (cr) cr.addEventListener('change', e => { const x = e.target.dataset; if (R.isISODate(x.from) && R.isISODate(x.to)) { Object.assign(pp, { preset: 'custom', from: x.from, to: x.to }); render(); } });
  }
  const toTable = () => { const tb = $('pp_table'); if (tb && tb.scrollIntoView) tb.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  /* the Dashboard hands its events here while the tab is Partners → true when handled */
  function toolsClick(e) {
    const p = e.target.closest('[data-pppreset]');
    if (p) { if (p.dataset.pppreset === 'custom') { const [a, z] = range(); U.openRange($('pp_crange'), { from: a, to: z, anchor: p }); return true; }
      Object.assign(pp, { preset: p.dataset.pppreset, from: '', to: '' }); pref.set('partpreset', pp.preset); render(); return true; }
    const pt = e.target.closest('[data-pppt]'); if (pt) { pp.partner = U.partnerSegPick(pt, 'data-pppt'); render(); return true; }
    if (e.target.closest('[data-ppclear]')) { Object.assign(pp, { campaign: '', pillar: '', partner: '', kols: [], levels: [], tiers: [] }); render(); return true; }
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
    /* a part of the donut / a legend line → the table shows that grade (again → all grades) */
    const sl = e.target.closest('[data-ppslice]'); if (sl) { const g = sl.dataset.ppslice; pp.levels = pp.levels.length === 1 && pp.levels[0] === g ? [] : [g]; render(); if (pp.levels.length) toTable(); return true; }
    const so = e.target.closest('[data-ppsort]'); if (so) { const k = so.dataset.ppsort;
      pp.sort = { key: k, dir: pp.sort.key === k ? (pp.sort.dir === 'asc' ? 'desc' : 'asc') : ['partner', 'tier', 'grade', 'cpv', 'late'].includes(k) ? 'asc' : 'desc' }; render(); return true; }
    const c = e.target.closest('[data-ppcell]'); if (c) { Object.assign(pp, { levels: [c.dataset.ppcell], tiers: [c.dataset.pptier], kols: [] }); render(); toTable(); return true; }
    const a = e.target.closest('[data-ppadd]'); if (a) { KT.bulk.open({ kolIds: [a.dataset.ppadd] }); return true; }
    const k = e.target.closest('[data-ppkol]'); if (k && !e.target.closest('button,a')) { KT.profile.open(k.dataset.ppkol, { tab: 'performance', opener: k }); return true; }
    return false;
  }
  /* Export: the sheet Partners (the partners on screen, in the table's order · grade · confirmed · suggested · the numbers) */
  function exportTab() {
    const [from, to] = range(), now = new Date(), td = today(), t = KT.export.rowsFor('partners', { state: state(), f: filt(), today: td, sort: pp.sort });
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
