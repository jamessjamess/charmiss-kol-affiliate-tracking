/* screen-perf.js — CR-10 §4.1–4.7: Deals › Performance. KPI strip (Posted · With metrics · Views · Engagement · ER · CPV) → toolbar
   (Group by · Expand / Collapse all · Columns · Export) → one row per posted post with a Total row (and one under each group).
   The Deals screen owns the scope bar (Campaign · Phase · PIC · Search · Filters · chips · Clear all filters) and calls render(el, o):
   o = { s, td, ctx, deals (Campaign + PIC), phaseIds (null = all), f {q, platform, tier, mstatus, link}, campaignId, used, setFilter(k, v), openPost(dealId, postId) }
   Numbers come from R.perfRows / R.perfMetricsOf (rules-metrics.js) — the same as the Dashboard.
   R2 (§4.5–4.6): Views … Saves are edited in the cell (Enter = save and go down · Tab = save and go right · Esc = cancel) and pasted from a sheet
   (Paste metrics: preview, then Apply) · one Undo for each save · who may: R.canEditMetrics. → KT.perf */
KT.perf = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, pref, toast, toastAction, userId, ICON, pfIcon, downloadCSV, openDialog, closeDialog, store, state } = U;
  const P = C.perfTab;
  /* §4.2 columns: the first 15 are on by default · KOL is always there · the choice is kept per person */
  const COLS = ['kol', 'tier', 'platform', 'post', 'post_date', 'views', 'likes', 'comments', 'shares', 'saves', 'er', 'cost', 'cpv', 'updated', 'pic',
    'phase', 'followers', 'vpf', 'engagement', 'cpe', 'gencode', 'pillar', 'expected', 'ontime'];
  const DEFAULT_COLS = COLS.slice(0, 15);
  const NUM = new Set(['views', 'likes', 'comments', 'shares', 'saves', 'er', 'cost', 'cpv', 'followers', 'vpf', 'engagement', 'cpe']);
  const GROUPS = ['none', 'tier', 'platform', 'phase', 'pic'];
  const pv = { sort: { key: 'views', dir: 'desc' }, sorted: [], all: [], byKey: new Map(), o: null, editing: null, paste: null };
  const me = () => userId() || '';
  function colsOn() {
    try { const v = JSON.parse(pref.get('perfcols_' + me(), 'null')); if (Array.isArray(v)) return COLS.filter(k => k === 'kol' || v.includes(k)); } catch (e) { /* default */ }
    return DEFAULT_COLS.slice();
  }
  const setCols = list => pref.set('perfcols_' + me(), JSON.stringify(list));
  const groupBy = () => { const v = pref.get('perfgroup_' + me(), 'none'); return GROUPS.includes(v) ? v : 'none'; };
  const foldKey = () => `perffold_${me()}_${groupBy()}`;
  const folded = () => { try { return new Set(JSON.parse(pref.get(foldKey(), '[]'))); } catch (e) { return new Set(); } };
  const setFolded = set => pref.set(foldKey(), JSON.stringify([...set]));

  /* ---------- formats: null = "—" (no data), never 0 ---------- */
  const DASH = '<span class="muted">—</span>';
  const num = v => (v == null ? DASH : R.fmtNum(v));
  const pct = v => (v == null ? DASH : (v * 100).toFixed(2) + '%');
  const thb = (v, d) => (v == null ? DASH : '฿' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pctText = v => (v == null ? '—' : (v * 100).toFixed(2) + '%');
  const thbText = (v, d) => (v == null ? '—' : '฿' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  function groupLabel(s, by, k) {
    if (by === 'phase') return k === R.NEEDS ? C.deal.needsPhase : k === R.UNSCHEDULED ? C.deal.unscheduled : R.phaseName(s, k);
    if (by === 'pic') return k || P.unassigned;
    return k;
  }
  const kolName = r => (r.kol && r.kol.display_name) || r.deal.kol_id;

  function cellHTML(k, r, s) {
    const p = r.post;
    switch (k) {
      case 'kol': return `<td class="pf-kol stk"><span class="kname"><b>${U.nameHTML(kolName(r))}</b>${U.copyBtnHTML(kolName(r))}</span>${r.handle ? `<span class="pf-h">@${esc(r.handle)}</span>` : ''}</td>`;
      case 'tier': return `<td><span class="chip">${esc(r.tier)}</span></td>`;
      case 'platform': return `<td class="c">${pfIcon(r.platform, 'posted', r.platform)}</td>`;
      case 'post': return `<td>${r.dup ? `<span class="chip warn-chip pf-dup" title="${esc(r.dup.first ? P.dupFirstTip(r.dup.n) : P.dupTip(r.dup.n))}">${esc(P.dupLink)}</span> ` : ''}${p.post_link ? `<a class="pf-open" href="${esc(p.post_link)}" target="_blank" rel="noopener" title="${esc(P.openTip)}">${esc(P.open)} ↗</a>`
        : `<button type="button" class="chip pf-nolink" data-pfnolink title="${esc(P.noLinkTip)}">${esc(P.noLink)}</button>`}</td>`;
      case 'post_date': case 'expected': { const d = k === 'post_date' ? p.post_date : p.expected_post_date; return `<td class="nowrap">${d ? esc(R.dmy(d)) : DASH}</td>`; }
      case 'views': case 'likes': case 'comments': case 'shares': case 'saves': {
        const ok = R.canEditMetrics(U.actor(), r.deal), ro = !ok && U.actor() && U.actor().role === 'staff';
        return `<td class="num${ok ? ' pf-ed' : ''}" data-mcell="${k}"${ok ? ' data-edit tabindex="-1"' : ro ? ` title="${esc(P.editOnlyPic)}"` : ''}>${num(r[k])}</td>`;
      }
      case 'er': return `<td class="num">${pct(r.er)}</td>`;
      case 'cost': return `<td class="num">${thb(r.cost, 0)}</td>`;
      case 'cpv': return `<td class="num">${thb(r.cpv, 3)}</td>`;
      case 'cpe': return `<td class="num">${thb(r.cpe, 2)}</td>`;
      case 'followers': case 'engagement': return `<td class="num">${num(r[k])}</td>`;
      case 'vpf': return `<td class="num">${r.vpf == null ? DASH : r.vpf.toFixed(1) + '×'}</td>`;
      case 'updated': return `<td class="nowrap">${statusHTML(r, s)}</td>`;
      case 'pic': return `<td>${r.pic ? esc(r.pic) : DASH}</td>`;
      case 'phase': return `<td>${r.phase ? esc(groupLabel(s, 'phase', r.phase)) : DASH}</td>`;
      case 'gencode': return `<td>${p.gencode_code ? `<span title="${esc(P.gencodeTip(R.dmy(R.gencodeEndDate(r.deal))))}">${esc(P.gencodeYes)}</span>` : DASH}</td>`;
      case 'pillar': return `<td>${r.deal.pillar ? KT.ui.pillarChipHTML(r.deal.pillar, true) : DASH}</td>`;
      case 'ontime': return `<td class="nowrap">${r.lateDays == null ? DASH : r.lateDays ? `<span class="pf-late">${esc(P.late(r.lateDays))}</span>` : esc(P.onTime)}</td>`;
      default: return '<td></td>';
    }
  }
  /* CR-11 §4.12 — the metrics status: Due (amber) · Waiting "D+7 on dd/mm" · Collected (the day saved) · Not posted · Not tracked · Imported (grey) */
  function statusHTML(r, s) {
    const p = r.post, i = r.minfo || {}, d = R.dmy(String(p.metrics_updated_at || '').slice(0, 10)), who = p.metrics_updated_by ? R.changedByName(s, p.metrics_updated_by) : '', dm = x => R.dmy(x).slice(0, 5);
    switch (r.status) {
      case 'due': return `<span class="chip pf-due" title="${esc(P.dueTip(i.checkpoint, R.dmy(i.checkpointDate), d))}">${esc(P.status.due)}</span>`;
      case 'waiting': return `<span class="muted small" title="${esc(P.status.waiting)}">${esc(P.waitingL(i.next, dm(i.nextDate)))}</span>`;
      case 'collected': return `<span class="pf-col" title="${esc(P.collectedTip(d, who, i.checkpoint))}">${esc(d || P.status.collected)}</span>`;
      case 'not_tracked': return `<span class="muted" title="${esc(P.notTrackedTip(R.dmy(R.addDays(R.goLiveDate(s.lookups), -30))))}">${esc(P.status.not_tracked)}</span>`;
      case 'imported': return `<span class="muted" title="${esc(P.importedTip)}">${esc(P.status.imported)}</span>`;
      default: return `<span class="muted" title="${esc(P.notPostedTip)}">${esc(P.status.not_posted)}</span>`;
    }
  }
  /* the Total row (and one under each group): sums · ER / CPV / CPE weighted (§4.3), not the mean of the rows */
  function totalHTML(cols, rows, label, cls) {
    const m = R.perfMetricsOf(rows);
    return `<tr class="total${cls ? ' ' + cls : ''}">` + cols.map(k => {
      if (k === 'kol') return `<td class="pf-kol stk"><b>${esc(label)}</b> <span class="muted small">${esc(P.postsN(rows.length))}</span></td>`;
      if (['views', 'likes', 'comments', 'shares', 'saves', 'engagement'].includes(k)) return `<td class="num"><b>${R.fmtNum(m[k])}</b></td>`;
      if (k === 'er') return `<td class="num"><b>${pctText(m.er)}</b></td>`;
      if (k === 'cost') return `<td class="num"><b>${thbText(m.cost, 0)}</b></td>`;
      if (k === 'cpv') return `<td class="num"><b>${thbText(m.cpv, 3)}</b></td>`;
      if (k === 'cpe') return `<td class="num"><b>${thbText(m.cpe, 2)}</b></td>`;
      return '<td></td>';
    }).join('') + `</tr>`;
  }

  /* ---------- render ---------- */
  function render(el, o) {
    pv.o = o;
    const { s, td, ctx } = o, cols = colsOn(), by = groupBy();
    const all = R.perfRows(s, o.deals, td, ctx).filter(r => !o.phaseIds || o.phaseIds.includes(r.phase));
    const rows = R.filterPerfRows(all, o.f), m = R.perfMetricsOf(rows);
    const sorted = R.sortPerfRows(rows, pv.sort.key, pv.sort.dir, s.lookups.tier_rules);
    pv.sorted = sorted; pv.all = all; pv.byKey = new Map(all.map(r => [r.key, r]));
    const dueN = rows.filter(r => r.status === 'due').length, ntN = rows.filter(r => r.status === 'not_tracked').length;
    const card = (key, value, sub, extra) => `<div class="pf-k${extra ? ' ' + extra : ''}"${key === 'withMetrics' && dueN ? ` role="button" tabindex="0" data-pfkpi="due" title="${esc(P.showNoMetrics)}"` : ''}>` +
      `<span class="l">${U.labelInfo(P.kpi[key].h, P.kpi[key])}</span><span class="v">${value}</span><span class="s">${sub || '&nbsp;'}</span></div>`;
    const kpis = `<div class="pf-kpis">` +
      card('posted', R.fmtNum(m.posted), m.noDate ? esc(P.noDate(m.noDate)) : '') +
      card('withMetrics', R.fmtNum(m.withMetrics), m.posted ? esc(P.pctPosted(Math.round(m.withMetrics / m.posted * 100))) : '', dueN ? 'click' : '') +
      card('views', `<span title="${esc(R.fmtNum(m.views))}">${esc(U.shortNum(m.views))}</span>`) +
      card('engagement', `<span title="${esc(R.fmtNum(m.engagement))}">${esc(U.shortNum(m.engagement))}</span>`) +
      card('er', esc(pctText(m.er)), m.withViews ? esc(P.onViews(m.withViews)) : '') +
      card('cpv', esc(thbText(m.cpv, 3)), m.withViews ? esc(P.costOn(R.baht(m.costViews))) : '') + `</div>` +
      /* CR-11 §4.6: the posts nobody collects (before go-live − 30 days, no numbers) — a small line, the formulas do not change */
      (ntN ? `<div class="pf-nt muted small">${esc(P.notTrackedLine(R.dmy(R.addDays(R.goLiveDate(s.lookups), -30)), R.fmtNum(ntN)))}</div>` : '');
    /* CR-14 §4.2 — Columns: the one multi-select (KOL always shows · Reset = the default columns · one column at least) */
    const colMenu = `<span class="pf-colmenu">${U.multiSelect({ id: 'pf_cols', options: COLS.filter(k => k !== 'kol').map(k => ({ value: k, label: P.col[k] })), value: cols.filter(k => k !== 'kol'),
      label: P.columns, aria: P.columns, searchable: false, defaultValue: DEFAULT_COLS.filter(k => k !== 'kol'), min: 1, minTip: P.minCol,
      onChange: v => { setCols(['kol'].concat(v)); pv.o.rerender(); } })}</span>`;
    const dlMenu = `<details class="menu"><summary class="btn small">${ICON.download}<span>${esc(P.export)}</span></summary><div class="menu-list right">` +
      `<button type="button" class="mi" data-pfdl="xlsx">${esc(C.overview.dlXlsx)}</button><button type="button" class="mi" data-pfdl="csv">${esc(C.overview.dlCsv)}</button></div></details>`;
    const groups = R.groupPerfRows(s, sorted, by), shut = folded();
    const tools = `<div class="toolbar pf-tools"><label class="tlab">${esc(P.groupBy)} <select id="pf_group">${GROUPS.map(g => `<option value="${g}"${g === by ? ' selected' : ''}>${esc(P.groupOpt[g])}</option>`).join('')}</select></label>` +
      (by !== 'none' && groups.length > 1 ? `<button type="button" class="btn small ghost" data-pfall="expand">${esc(P.expandAll)}</button><button type="button" class="btn small ghost" data-pfall="collapse">${esc(P.collapseAll)}</button>` : '') +
      `<span class="spacer"></span>${U.can('deal.edit') ? `<button type="button" class="btn small" data-pfpaste>${esc(P.pasteMetrics)}</button>` : ''}${colMenu}${dlMenu}</div>`;
    if (!all.length) { el.innerHTML = kpis + `<div class="card empty"><b>${esc(P.empty)}</b><span class="muted small">${esc(P.emptyHint)}</span></div>`; return; }
    if (!rows.length) { el.innerHTML = kpis + tools + U.noMatchHTML(P.noMatch, o.used || []); return; }
    const head = cols.map(k => `<th class="${k === 'kol' ? 'pf-kol stk ' : ''}${NUM.has(k) ? 'num ' : ''}sort" data-pfsort="${k}"${P.colTip[k] ? ` title="${esc(P.colTip[k])}"` : ''}>${esc(P.col[k])}` +
      `${pv.sort.key === k ? `<span class="arr">${pv.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`).join('');
    const rowHTML = r => `<tr class="click" tabindex="0" data-perfrow="${esc(r.key)}" data-deal="${esc(r.deal.deal_id)}">${cols.map(k => cellHTML(k, r, s)).join('')}</tr>`;
    const body = by === 'none' ? sorted.map(rowHTML).join('') : groups.map(g => {
      const gm = R.perfMetricsOf(g.rows), open = !shut.has(String(g.key));
      return `<tr class="ghead pf-gh"><td colspan="${cols.length}"><button type="button" class="gh" data-pffold="${esc(g.key)}" aria-expanded="${open}"><span class="chev${open ? ' open' : ''}">${ICON.chevron}</span>` +
        `<b class="gname">${esc(groupLabel(s, by, g.key))}</b><span class="muted">${esc(P.groupLine(g.rows.length, R.fmtNum(gm.views), pctText(gm.er), thbText(gm.cpv, 3)))}</span></button></td></tr>` +
        (open ? g.rows.map(rowHTML).join('') + totalHTML(cols, g.rows, P.total, 'sub') : '');
    }).join('');
    el.innerHTML = kpis + tools + `<div class="tablewrap pf-wrap"><table class="tbl pf-tbl"><thead><tr>${head}</tr></thead><tbody>${body}${totalHTML(cols, rows, P.total)}</tbody></table></div>`;
  }

  /* ---------- events (from #dl_body while the view is Performance) ---------- */
  function click(e) {
    const o = pv.o; if (!o) return false;
    if (e.target.closest('.pf-in')) return true;
    const ed = e.target.closest('[data-mcell][data-edit]'); if (ed) { startEdit(ed); return true; }
    if (e.target.closest('[data-pfpaste]')) { openPaste(e.target.closest('[data-pfpaste]')); return true; }
    if (e.target.closest('a') || e.target.closest('[data-copyname]') || e.target.closest('.info')) return true;
    if (e.target.closest('details.menu > summary') || e.target.closest('[data-ms]')) return true;   // the Columns multi-select looks after itself
    const k = e.target.closest('[data-pfkpi]'); if (k) { o.setFilter('mstatus', k.dataset.pfkpi); return true; }
    const so = e.target.closest('[data-pfsort]'); if (so) { const key = so.dataset.pfsort; pv.sort = { key, dir: pv.sort.key === key ? (pv.sort.dir === 'asc' ? 'desc' : 'asc') : (NUM.has(key) || key === 'updated' || key === 'post_date' ? 'desc' : 'asc') }; o.rerender(); return true; }
    const f = e.target.closest('[data-pffold]'); if (f) { const set = folded(), g = f.dataset.pffold; set.has(g) ? set.delete(g) : set.add(g); setFolded(set); o.rerender(); return true; }
    const a = e.target.closest('[data-pfall]'); if (a) { setFolded(a.dataset.pfall === 'collapse' ? new Set(R.groupPerfRows(o.s, pv.sorted, groupBy()).map(g => String(g.key))) : new Set()); o.rerender(); return true; }
    const d = e.target.closest('[data-pfdl]'); if (d) { const m = d.closest('details'); if (m) m.open = false; exportRows(d.dataset.pfdl); return true; }
    const row = e.target.closest('[data-perfrow]'); if (row) { o.openPost(row.dataset.deal, row.dataset.perfrow); return true; }
    return false;
  }
  function change(e) {
    const o = pv.o; if (!o) return;
    if (e.target.id === 'pf_group') { pref.set('perfgroup_' + me(), e.target.value); o.rerender(); return; }
  }
  function keydown(e) {
    if (e.target.classList && e.target.classList.contains('pf-in')) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pv.editing = null; pv.o.rerender(); return true; }
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? 'up' : 'down'); return true; }
      if (e.key === 'Tab') { e.preventDefault(); commitEdit(e.shiftKey ? 'left' : 'right'); return true; }
      return false;
    }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-mcell][data-edit]')) { startEdit(e.target); return true; }
    if (e.key === 'Enter' && !e.target.closest('button,input,a,select')) { const k = e.target.closest('[data-pfkpi]'); if (k) { pv.o.setFilter('mstatus', k.dataset.pfkpi); return true; } const r = e.target.closest('[data-perfrow]'); if (r) { pv.o.openPost(r.dataset.deal, r.dataset.perfrow); return true; } }
    return false;
  }
  /* ---------- §4.5 the cell editor ---------- */
  const metricCols = () => colsOn().filter(k => R.METRICS.includes(k));
  function startEdit(td) {
    const tr = td.closest('tr'), r = pv.byKey.get(tr.dataset.perfrow), k = td.dataset.mcell;
    if (!r || !R.canEditMetrics(U.actor(), r.deal)) return;
    const cur = r.post[k] == null ? '' : String(r.post[k]);
    pv.editing = { key: r.key, k, orig: cur };
    td.classList.add('editing');
    td.innerHTML = `<input class="pf-in" value="${esc(cur)}" inputmode="numeric" autocomplete="off" aria-label="${esc(`${P.col[k]} — ${kolName(r)}`)}">`;
    const inp = td.querySelector('input'); inp.focus(); inp.select();
    inp.addEventListener('blur', () => { if (pv.editing && pv.editing.key === r.key && pv.editing.k === k) commitEdit(null); });
  }
  function startEditAt(key, k) { const td = document.querySelector(`#dl_body tr[data-perfrow="${CSS.escape(key)}"] [data-mcell="${k}"][data-edit]`); if (td) startEdit(td); }
  /* the next cell: down / up in the same column · right / left along Views … Saves, then the next / previous row */
  function neighbour(ed, move) {
    const keys = [...document.querySelectorAll('#dl_body tr[data-perfrow]')].map(tr => tr.dataset.perfrow), cols = metricCols();
    let i = keys.indexOf(ed.key), j = cols.indexOf(ed.k);
    if (move === 'down') i++; else if (move === 'up') i--;
    else if (move === 'right') { j++; if (j >= cols.length) { j = 0; i++; } }
    else if (move === 'left') { j--; if (j < 0) { j = cols.length - 1; i--; } }
    return i >= 0 && i < keys.length && cols[j] ? { key: keys[i], k: cols[j] } : null;
  }
  function commitEdit(move) {
    const ed = pv.editing; if (!ed) return;
    const inp = document.querySelector('#dl_body .pf-in'), text = inp ? inp.value : ed.orig, parsed = R.parseCount(text);
    if (parsed.error) { if (inp) { inp.classList.add('invalid'); inp.title = parsed.error; inp.focus(); } toast(parsed.error); return; }
    const next = move ? neighbour(ed, move) : null, r = pv.byKey.get(ed.key);
    pv.editing = null;
    if (r && (r.post[ed.k] == null ? null : Number(r.post[ed.k])) !== parsed.value) saveValues([{ post: r.post, values: { [ed.k]: parsed.value } }], 'manual');
    else pv.o.rerender();
    if (next) startEditAt(next.key, next.k);
  }
  /* save, one event a post, and offer Undo (5 s) — warnings ride along in the same message */
  function saveValues(list, source, done) {
    const s = state(), td = U.today(), user = userId(), now = new Date().toISOString(), base = store.newEventId(), snaps = [], warns = new Set();
    list.forEach((x, i) => {
      const post = s.deal_posts.find(p => p.post_id === x.post.post_id); if (!post) return;
      snaps.push({ id: post.post_id, values: R.metricsOf(post), at: post.metrics_updated_at, by: post.metrics_updated_by, source: post.metrics_source });
      const before = R.metricsOf(post);
      s.deal_events.push(R.setMetrics(post, x.values, { today: td, now, user, eventId: base + i }, source));
      R.metricsWarnings(before, post).forEach(w => warns.add(w.msg));
    });
    U.commit();
    pv.o.rerender();
    const msg = (done || P.saved(snaps.length)) + (warns.size ? ' · ' + [...warns].join(' · ') : '');
    toastAction(msg, C.deal.undo, () => undo(snaps), warns.size ? 8000 : 5000);
  }
  function undo(snaps) {
    const s = state(), base = store.newEventId(), now = new Date().toISOString(), user = userId();
    snaps.forEach((sn, i) => {
      const post = s.deal_posts.find(p => p.post_id === sn.id); if (!post) return;
      const ev = R.setMetrics(post, sn.values, { today: sn.at, now, user, eventId: base + i, note: 'undo' }, sn.source);
      Object.assign(post, { metrics_updated_at: sn.at, metrics_updated_by: sn.by, metrics_source: sn.source });
      s.deal_events.push(ev);
    });
    U.commit(P.undone); pv.o.rerender();
  }

  /* ---------- §4.6 Paste metrics ---------- */
  /* CR-11 §4.3 — the create modal (L): paste · preview · Apply */
  function openPaste(opener) {
    if (!U.guard('deal.edit')) return;
    pv.paste = { text: '', plan: null };
    U.createModal({ size: 'L', title: P.pasteMetrics, opener, focus: '#pf_paste', isDirty: () => !!R.trim(pv.paste && pv.paste.text),
      body: `<p class="hint" style="margin-top:0">${esc(P.paste.help)}</p>
      <div class="pf-pastebar"><button type="button" class="btn small" id="pf_copytpl">${esc(P.paste.copyTemplate)}</button><span class="muted small">${esc(P.paste.copyTip(new Set(pv.all.filter(r => r.post.post_link).map(r => r.post.post_link)).size))}</span></div>
      <textarea id="pf_paste" rows="6" spellcheck="false" placeholder="${esc(P.paste.placeholder)}"></textarea><div id="pf_prev"></div>`,
      foot: ['', U.cmButtons(P.paste.apply(0), 'pf_apply', { attrs: ' disabled' })] });
    let t;
    $('pf_paste').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { pv.paste.text = e.target.value; drawPreview(); }, 120); });
    $('pf_copytpl').addEventListener('click', () => U.copyText(R.pasteTemplate(pv.all)).then(ok => toast(ok ? P.paste.copied : C.copy.failed)));
    $('pf_apply').addEventListener('click', applyPaste);
  }
  function drawPreview() {
    const plan = R.planPaste(pv.paste.text, pv.all, U.actor()), c = plan.counts;
    pv.paste.plan = plan;
    $('pf_apply').disabled = !c.matched; $('pf_apply').textContent = P.paste.apply(c.matched);
    if (!plan.lines.length) { $('pf_prev').innerHTML = ''; return; }
    const cellOf = (x, k) => {
      if (!x.from) return `<td class="num">${x.values[k] == null ? '' : esc(R.fmtNum(x.values[k]))}</td>`;
      const a = x.from[k], b = x.to[k], ch = x.changed.includes(k);
      return `<td class="num">${ch ? `<span class="muted">${a == null ? '—' : esc(R.fmtNum(a))}</span> → <b>${b == null ? '—' : esc(R.fmtNum(b))}</b>` : (a == null ? DASH : esc(R.fmtNum(a)))}</td>`;
    };
    $('pf_prev').innerHTML = `<div class="pf-psum">${['matched', 'notfound', 'nochange', 'error', 'notyours'].filter(k => k === 'matched' || c[k]).map(k => `<span class="pf-pc ${k}">${esc(P.paste.count[k])} <b>${c[k]}</b></span>`).join('')}</div>` +
      `<div class="tablewrap pf-pwrap"><table class="tbl compact-sm"><thead><tr><th class="num">#</th><th>${esc(P.col.kol)}</th><th>${esc(P.col.platform)}</th>${R.METRICS.map(k => `<th class="num">${esc(P.col[k])}</th>`).join('')}<th>${esc(P.paste.result)}</th></tr></thead><tbody>` +
      plan.lines.map(x => `<tr class="pf-pl ${x.status}"><td class="num muted">${x.line}</td><td>${x.row ? `<b>${esc(kolName(x.row))}</b>` : `<span class="muted small pf-plink">${esc(x.link)}</span>`}</td>` +
        `<td>${x.row ? pfIcon(x.row.platform, 'posted', x.row.platform) : ''}</td>${R.METRICS.map(k => cellOf(x, k)).join('')}` +
        `<td class="pf-pres">${esc(P.paste.status[x.status])}${x.reason ? ` <span class="muted small">${esc(x.reason)}</span>` : ''}${x.warns.length ? ` <span class="pf-pw">! ${esc(x.warns.map(w => w.msg).join(' · '))}</span>` : ''}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  function applyPaste() {
    const plan = pv.paste && pv.paste.plan; if (!plan || !U.guard('deal.edit')) return;
    const list = plan.lines.filter(x => x.status === 'matched').map(x => ({ post: x.row.post, values: x.values }));
    U.closeModal();
    if (list.length) saveValues(list, 'paste', P.paste.done(list.length));
  }

  /* §4.7 — the rows on screen (scope · filters · sort), the columns that are on + the full post link and post ID · numbers stay numbers */
  function exportRows(fmt) {
    const o = pv.o, s = o.s, camp = (s.campaigns.find(c => c.campaign_id === o.campaignId) || {}).campaign_name;
    const t = KT.export.rowsFor('performance', { state: s, rows: pv.sorted, cols: colsOn() });
    const name = KT.export.fileName(P.file, KT.export.safeName(camp), o.td, fmt);
    if (fmt === 'csv') { downloadCSV(name, t.header, t.rows.concat([t.total])); return; }
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf(t)]), KT.xlsx.MIME); toast(C.io.exported(name, t.rows.length));
  }

  return { render, click, change, keydown, openPaste, startEditAt, COLS, DEFAULT_COLS, colsOn, _pv: pv };
})();
