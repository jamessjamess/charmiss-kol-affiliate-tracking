/* screen-profile.js — CR-16 §4.1: the KOL profile — a large modal (L) with five tabs in place of the KOL drawer:
   Overview · Deals & history · Performance · Rates · Payee & shipping. The header stays on top (photo · name + copy · ID · Tier · Status ·
   platforms + followers · PIC · Add to campaign · Edit · ‹ › · ✕), the summary line under it, Edit in place on Overview (Save / Cancel at the bottom).
   It opens over any page (z-index 35 — under the Deal drawer (40), so a deal opened here sits on top of it; the create modals and dialogs
   are in the top layer) · route #kols/K0011/overview: a history entry of its own, so the browser's Back closes it · the tab is remembered per
   person · ‹ › and ↑ ↓ walk the KOL Master table as it is filtered and sorted · leaving unsaved edits asks "Discard changes?" first. → KT.profile */
KT.profile = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, checksHTML, kv, field, range, stageChip, ICON, pfIcon, tierRules, distinct, optionsHTML, activeList,
    dateHTML, openDialog, closeDialog, userId, can, guard, picList, pref } = U;
  const T = C.kol, P = C.perf, PF = C.profile, KTY = C.kolTypes;
  const TAB_KEY = 'kolprofile.tab';
  const pm = { open: false, id: null, tab: 'overview', mode: 'view', draft: null, touched: new Set(), dirty: false, pushed: false, base: '', backDeal: null, hist: 'all', ids: null, opener: null };
  let wrap = null;
  const box = () => $('kpm_box');
  const editing = () => pm.mode === 'edit';
  const dealOver = () => !!(U.drawerOwner() && U.drawerOwner().kind === 'deal' && KT.screens.deals.isOver && KT.screens.deals.isOver());
  const statusChip = st => (st === 'Blacklist' ? `<span class="st cancel">${esc(st)}</span>` : st === 'Inactive' ? `<span class="st muted">${esc(st)}</span>` : `<span class="st done">${esc(st || 'Active')}</span>`);
  const sec = (title, body, extra) => `<section class="sec"><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;
  const routeOf = () => `kol/${pm.id}/${pm.tab}`;
  const CAMERA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h2l1-1.5h5l1 1.5h2v7h-11z"/><circle cx="8" cy="8.8" r="2.2"/></svg>';
  const listIds = () => (typeof pm.ids === 'function' ? pm.ids() : pm.ids) || null;

  /* ===================== the frame (made once) ===================== */
  function ensure() {
    if (wrap) return;
    wrap = document.createElement('div'); wrap.className = 'kpm-wrap hidden'; wrap.id = 'kpm';
    wrap.innerHTML = `<div class="kpm-overlay" data-kpm-close></div><div class="kpm" id="kpm_box" role="dialog" aria-modal="true" aria-labelledby="kpm_title" tabindex="-1"></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('keydown', onKey);
    /* §4.4 — a picture dropped on the header (photo editors only) */
    wrap.addEventListener('dragover', e => { if (!canPhoto() || !e.target.closest('.kpm-top')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; box().classList.add('drop'); });
    wrap.addEventListener('dragleave', e => { if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) box().classList.remove('drop'); });
    wrap.addEventListener('drop', e => { box().classList.remove('drop'); if (!canPhoto() || !e.target.closest('.kpm-top')) return; e.preventDefault(); const f = [...(e.dataTransfer.files || [])][0]; if (f) pickedPhoto(f); });
    /* … or pasted (Ctrl / ⌘ + V) while the profile is open and nothing is being typed */
    document.addEventListener('paste', e => {
      if (!pm.open || !canPhoto() || U.modalOpen() || U.dlg.open || editing() || (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]'))) return;
      const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.kind === 'file' && /^image\//.test(x.type)); if (!it) return;
      e.preventDefault(); pickedPhoto(it.getAsFile());
    });
  }
  const shell = () => $('shell');
  function setInert(on) { const sh = shell(); if (sh) { if (on) sh.setAttribute('inert', ''); else sh.removeAttribute('inert'); } }

  /* ===================== open · close · the address ===================== */
  function rememberedTab() { const t = R.userPrefGet(pref.get(TAB_KEY, ''), userId() || ''); return R.PROFILE_TABS.includes(t) ? t : 'overview'; }
  function rememberTab(t) { pref.set(TAB_KEY, R.userPrefSet(pref.get(TAB_KEY, ''), userId() || '', t)); }
  /* o = { tab, edit, backDeal, ids (the order for ‹ › — an array or a function), opener } → true when it opened */
  async function open(kolId, o = {}) {
    const s = state(); if (!kolId || !R.kolById(s, kolId)) return false;
    if (pm.open && pm.id !== kolId && !(await leaveOK())) return false;
    ensure();
    const first = !pm.open;
    if (first && U.drawerOwner()) U.suspendDrawer();   // the drawer of the page under it waits (unsaved edits are kept)
    if (!first && dealOver()) U.closeDrawer();
    Object.assign(pm, { id: kolId, mode: 'view', draft: null, dirty: false });
    pm.touched.clear();
    if (first) Object.assign(pm, { open: true, hist: 'all', ids: o.ids || null, opener: o.opener || document.activeElement, backDeal: o.backDeal || null, pushed: false, base: location.hash || '#' + C.tabs[0].route });
    else if (o.backDeal !== undefined) pm.backDeal = o.backDeal || null;
    pm.tab = R.PROFILE_TABS.includes(o.tab) ? o.tab : first ? rememberedTab() : pm.tab;
    if (first) {
      const route = '#' + U.toRoute(routeOf());
      if (location.hash !== route) { history.pushState(null, '', route); pm.pushed = true; }
      else pm.base = '#' + U.toRoute('kol');   // opened from its own address (a link · reload)
      wrap.classList.remove('hidden'); document.body.classList.add('kpm-open'); setInert(true);
    }
    draw();
    if (o.edit && can('kol.edit')) startEdit();
    if (KT.screens.kol.markSelected) KT.screens.kol.markSelected();
    if (first) setTimeout(() => { if (pm.open) box().focus(); }, 0);
    return true;
  }
  /* unsaved edits → "Discard changes?" · true = it may go on (the edits are dropped) */
  async function leaveOK() {
    if (!editing()) return true;
    if (pm.dirty && !(await U.confirmDialog(C.common.discardTitle, C.common.discardBody, C.common.discard, true, C.common.keepEditing))) return false;
    Object.assign(pm, { mode: 'view', draft: null, dirty: false }); pm.touched.clear();
    return true;
  }
  async function requestClose(o = {}) { if (!pm.open) return true; if (!(await leaveOK())) return false; close(o); return true; }
  /* ✕ · Esc · the backdrop: back to the address it came from (Back of the browser when it added one) · o.quiet: no history step (role change, Restore) */
  function close(o = {}) {
    if (!pm.open) return;
    const pushed = pm.pushed, base = pm.base;
    teardown();
    if (o.viaHistory) return;   // the browser has moved already
    if (pushed && !o.quiet) { history.back(); return; }   // the page under it is drawn again by the hashchange
    history.replaceState(null, '', base); if (!o.noRefresh) U.refresh();
  }
  function teardown() {
    const opener = pm.opener;
    if (dealOver()) U.closeDrawer();
    Object.assign(pm, { open: false, id: null, mode: 'view', draft: null, dirty: false, pushed: false, backDeal: null, ids: null, opener: null });
    pm.touched.clear();
    if (!wrap) return;
    wrap.classList.add('hidden'); box().innerHTML = ''; document.body.classList.remove('kpm-open'); setInert(false);
    if (KT.screens.kol.markSelected) KT.screens.kol.markSelected();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  }
  /* app.js asks before drawing a page for a new address · true = go on · false = the profile kept it */
  async function onHashChange(h) {
    if (!pm.open) return true;
    const r = h.tab === 'kol' ? R.profileRoute(h.id) : null;
    if (r && r.id === pm.id) { if (r.tab !== pm.tab && (await leaveOK())) { pm.tab = r.tab; draw(); } return false; }
    if (!(await leaveOK())) { history.pushState(null, '', '#' + U.toRoute(routeOf())); return false; }   // Keep editing: stay
    close({ viaHistory: true });
    return true;
  }
  function setRoute() { const r = '#' + U.toRoute(routeOf()); if (location.hash !== r) history.replaceState(null, '', r); }

  /* ===================== drawing ===================== */
  function draw(keepScroll) {
    if (!pm.open) return;
    const s = state(), k = R.kolById(s, pm.id); if (!k) { close({ quiet: true }); return; }
    const b0 = $('kpm_body'), top = keepScroll && b0 ? b0.scrollTop : 0;
    box().innerHTML = headHTML(s, k) + `<div class="kpm-b" id="kpm_body" role="tabpanel" aria-labelledby="kpm_tab_${pm.tab}" tabindex="-1">${bodyHTML(s, k)}</div>` + (editing() ? footHTML() : '');
    box().classList.toggle('editing', editing());
    if (editing()) { wireForm(); check(); }
    else { KT.payee.fillSecure(box()); U.fitJourney(box()); }
    if (keepScroll) $('kpm_body').scrollTop = top;
    setRoute();
  }
  function photoHTML(k) {
    const av = U.avatarHTML(k, 'lg');
    if (!canPhoto()) return `<span class="kpm-av">${av}</span>`;
    const off = !KT.photos.available(), has = !!KT.photos.url(k.kol_id);
    return `<details class="menu kpm-photo"><summary class="kpm-av" title="${esc(PF.photo)}" aria-label="${esc(PF.photo)}">${av}<span class="kpm-cam" aria-hidden="true">${CAMERA}</span></summary><div class="menu-list">` +
      `<span class="mi-wrap"${off ? ` title="${esc(PF.photoOff)}"` : ''}><button type="button" class="mi" data-act="photoUpload"${off ? ' disabled' : ''}>${esc(PF.uploadPhoto)}</button></span>` +
      (has ? `<button type="button" class="mi danger" data-act="photoRemove">${esc(PF.removePhoto)}</button>` : '') +
      `<div class="mh kpm-phint">${esc(off ? PF.photoOff : PF.photoHint)}</div>${off ? '' : `<div class="mh kpm-phint">${esc(PF.photoDrop)}</div>`}</div></details>`;
  }
  function headHTML(s, k) {
    const accs = R.accountsOfKol(s, k.kol_id), mf = R.maxFollowers(accs), td = today(), sum = R.kolSummary(s, k.kol_id, td);
    const ids = listIds(), i = ids ? ids.indexOf(k.kol_id) : -1;
    const navBtn = (dir, on) => `<button type="button" class="icon-btn" data-kpm-nav="${dir}"${on ? '' : ' disabled'} aria-label="${esc(dir < 0 ? PF.prevKol : PF.nextKol)}" title="${esc(dir < 0 ? PF.prevKol : PF.nextKol)}">${dir < 0 ? '‹' : '›'}</button>`;
    const acts = (editing() ? '' : (can('deal.edit') ? `<button type="button" class="btn primary" data-act="addPhase">${esc(T.addToPhase)}</button>` : '') + (can('kol.edit') ? `<button type="button" class="btn" data-act="edit">${esc(T.edit)}</button>` : '')) +
      (editing() && can('kol.merge') ? `<details class="menu"><summary class="icon-btn" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right"><button type="button" class="mi" data-act="merge">${esc(T.merge)}</button></div></details>` : '') +
      (i >= 0 ? `<span class="kpm-nav">${navBtn(-1, i > 0)}${navBtn(1, i < ids.length - 1)}</span>` : '') +
      `<button type="button" class="icon-btn" data-kpm-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;
    const nPosts = R.kolPosts(s, k.kol_id).length, nRates = R.rateHistory(s, k.kol_id).length, nPay = R.payeesOfKol(s, k.kol_id).length, nAddr = R.addressesOfKol(s, k.kol_id).length;
    const count = { overview: '', deals: R.fmtNum(sum.deals), performance: R.fmtNum(nPosts), rates: R.fmtNum(nRates), payee: `${nPay} · ${nAddr}` };
    const tip = { payee: PF.payeeCount(nPay, nAddr) };
    const tabs = R.PROFILE_TABS.map(t => `<button type="button" role="tab" id="kpm_tab_${t}" data-kpm-tab="${t}" aria-selected="${t === pm.tab}" aria-controls="kpm_body"${t === pm.tab ? ' class="on"' : ''}${tip[t] ? ` title="${esc(tip[t])}"` : ''}>` +
      `${esc(PF.tabs[t])}${count[t] !== '' ? `<span class="n">${esc(count[t])}</span>` : ''}</button>`).join('');
    return `<div class="kpm-h">${pm.backDeal ? `<button type="button" class="link small kpm-back" data-backdeal>${esc(T.backToDeal(pm.backDeal))}</button>` : ''}
      <div class="kpm-top">${photoHTML(k)}
        <div class="t"><h2 id="kpm_title">${U.nameHTML(k.display_name)}${U.copyBtnHTML(k.display_name)}</h2>
          <div class="dr-sub"><span>${esc(k.kol_id)}</span><span class="chip">${esc(T.tierMax(R.tierOf(mf, tierRules()) || '—'))}</span>${statusChip(k.kol_status)}` +
          `<span class="pfs">${[...new Set(accs.map(a => a.platform))].map(p => pfIcon(p)).join('')}</span><span>${esc(T.followersShort(R.fmtNum(mf) || '—'))}</span>${k.pic ? `<span title="${esc(C.bulk.kolOwnerTip)}">${esc(T.picOf(k.pic))}</span>` : ''}${KT.packages.chipHTML(k.kol_id)}</div></div>
        <div class="kpm-acts">${acts}</div></div>
      <div class="kpm-sum">${summaryHTML(s, sum, td)}</div>
      <div class="stabs kpm-tabs" role="tablist" aria-label="${esc(PF.tabsLabel)}">${tabs}</div></div>`;
  }
  /* Deals n · Committed ฿ (not cancelled) · Last worked · Last campaign · On-time · Latest rate */
  function summaryHTML(s, sum, td) {
    const it = (l, v, title) => `<span class="ks"${title ? ` title="${esc(title)}"` : ''}><span class="l">${esc(l)}</span><b>${v}</b></span>`;
    return it(PF.sDeals, esc(R.fmtNum(sum.deals))) + it(PF.sCommitted, esc(R.baht(sum.committed)), PF.committedTip) +
      it(P.colLastWorked, sum.last ? esc(R.dmy(sum.last)) : '—', sum.last ? P.daysAgo(R.dayDiff(td, sum.last)) : '') +
      it(T.colLastCampaign, sum.lastCampaign ? esc(sum.lastCampaign) : '—') +
      it(P.colOnTime, sum.perf.measured ? U.reliabilityChip(sum.perf) : `<span class="muted">${esc(P.noData)}</span>`) +
      it(PF.sLatest, sum.latestRate != null ? esc(R.baht(sum.latestRate)) : '—');
  }
  function bodyHTML(s, k) {
    if (editing()) return formHTML();
    if (pm.tab === 'deals') return dealsHTML(s, k);
    if (pm.tab === 'performance') return perfTabHTML(s, k);
    if (pm.tab === 'rates') return ratesHTML(s, k);
    if (pm.tab === 'payee') return KT.payee.tabHTML(k);
    return overviewHTML(s, k);
  }
  const footHTML = () => `<div class="kpm-f"><div class="checks" id="km_checks"></div>` +
    `<div class="btns"><button type="button" class="btn" data-act="cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(C.common.save)}</button></div></div>`;

  /* ---------- Overview: Profile · Accounts · Current deals ---------- */
  function miniStepper(s, d) {
    const cur = R.stepOf(s.lookups, d.sub_status), curSort = cur ? cur.sort_order : -Infinity;
    return `<div class="stepper-mini" aria-hidden="true">` + R.planSteps(s.lookups, d).map(st =>
      `<span class="${st.sort_order < curSort ? 'done' : st.sort_order === curSort ? 'cur' : ''}" title="${esc(st.sub_status)}"></span>`).join('') + `</div>`;
  }
  /* CR-14 §4.5 — Contact: "LINE · kolsample.a" + copy (the ID only) · nothing = — */
  function contactKv(k) {
    const id = R.trim(k.contact_id), txt = [k.contact_channel, id].filter(Boolean).join(' · ');
    return `<div class="kv kcontact"><span>${esc(T.contact)}</span><b>${txt ? `<span class="kct">${esc(txt)}</span>${id ? U.copyBtnHTML(id, T.copyContact) : ''}` : '<span class="muted">—</span>'}</b></div>`;
  }
  function overviewHTML(s, k) {
    const O = C.kolOptions, rules = tierRules(), td = today(), accs = R.accountsOfKol(s, k.kol_id), deals = R.dealsOfKol(s, k.kol_id);
    const pidx = R.phaseIndex(s), campById = new Map(s.campaigns.map(c => [c.campaign_id, c]));
    const profile = kv(C.partner.field, R.partnerTypeLabel(s.lookups, R.partnerTypeOf(k))) + kv(T.category, k.kol_category) + kv(T.type, R.kolTypeLabel(s.lookups, k.kol_type)) + kv(T.gender, k.gender ? O.gender[k.gender] : '') + contactKv(k) +
      kv(T.kolStatus, (k.kol_status || 'Active') + (k.status_reason ? ` · ${k.status_reason}` : '')) + kv(T.defaultTerm, C.term[R.isTerm(k.default_payment_term) ? k.default_payment_term : 'none']) + kv(T.note, k.note) +
      `<div class="kv"><span>${esc(T.source)}</span><b class="chips" style="justify-content:flex-end">${(k.sources || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</b></div>`;
    const accounts = accs.map(a => { const n = R.postsOnAccount(s, a.account_id);
      return `<div class="kv"><span>${pfIcon(a.platform)} ${a.profile_link ? `<a href="${esc(a.profile_link)}" target="_blank" rel="noopener">@${esc(a.handle)}</a>` : `@${esc(a.handle)}`}` +
        `${a.is_legacy ? ` <span class="badge-legacy" title="${esc(T.legacyTip)}">${esc(T.incomplete)}</span>` : ''}</span><b>${esc(T.followersTier(R.fmtNum(a.followers) || '—', R.tierOf(a.followers, rules) || '—'))} · ${esc(T.posts(n))}</b></div>`; }).join('');
    const open = deals.filter(d => d.status === 'List' || d.status === 'Inprocess');
    const current = open.length ? open.map(d => {
      const ph = R.primaryPhase(pidx, d.deal_id), c = campById.get(d.campaign_id) || {}, due = R.dueDate(s, d), late = R.isOverdue(s, d, td);
      const phName = ph && s.phases.some(p => p.phase_id === ph) ? R.phaseName(s, ph) : '';
      return `<div class="post click" data-deal="${esc(d.deal_id)}" tabindex="0" role="button"><div class="top"><span><b>${esc(d.deal_id)}</b> · ${esc(c.campaign_name || '')}${phName ? ` › ${esc(phName)}` : ''}</span>${stageChip(d)}</div>${miniStepper(s, d)}` +
        `${due ? `<div class="${late ? 'late' : 'muted'} small">${esc(T.due(R.dmy(due)))}</div>` : ''}</div>`;
    }).join('') : `<div class="hint">${esc(T.noOpenDeal)}</div>`;
    return `<div class="kpm-2"><div class="kpm-col">${sec(T.secProfile, profile)}</div>` +
      `<div class="kpm-col">${sec(T.secAccounts(accs.length), accounts || `<div class="hint">${esc(C.common.none)}</div>`, can('kol.edit') ? `<button type="button" class="btn small" data-act="addAccount">${esc(T.addAccount)}</button>` : '')}` +
      `${sec(T.secCurrent, current)}</div></div>`;
  }

  /* ---------- Deals & history: by Campaign · All / Open / Posted / Cancelled ---------- */
  function dealsHTML(s, k) {
    const deals = R.dealsOfKol(s, k.kol_id);
    if (!deals.length) return `<div class="card empty"><b>${esc(T.noHistory)}</b></div>`;
    const counts = Object.fromEntries(R.HISTORY_FILTERS.map(f => [f, deals.filter(d => R.inHistory(d, f)).length]));
    const shown = deals.filter(d => R.inHistory(d, pm.hist));
    const seg = `<div class="seg kpm-seg" role="group" aria-label="${esc(PF.histFilter)}">${R.HISTORY_FILTERS.map(f => `<button type="button" data-hist="${f}"${f === pm.hist ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>${esc(PF.hist[f])} <span class="muted">${counts[f]}</span></button>`).join('')}</div>`;
    const active = deals.filter(d => !R.isCancelled(d)), camps = new Set(deals.map(d => d.campaign_id || '-'));
    const head = `<div class="kpm-bar">${seg}<span class="hint">${esc(T.histSummary(deals.length, camps.size, R.baht(active.reduce((x, d) => x + R.totalCost(d), 0))))}</span></div>`;
    if (!shown.length) return head + `<div class="card empty"><b>${esc(PF.histNone)}</b></div>`;
    const pidx = R.phaseIndex(s), phaseById = new Map(s.phases.map(p => [p.phase_id, p])), campById = new Map(s.campaigns.map(c => [c.campaign_id, c]));
    const postsBy = new Map(); s.deal_posts.forEach(p => { if (!postsBy.has(p.deal_id)) postsBy.set(p.deal_id, []); postsBy.get(p.deal_id).push(p); });
    const byCamp = new Map(); shown.forEach(d => { const c = d.campaign_id || '-'; if (!byCamp.has(c)) byCamp.set(c, []); byCamp.get(c).push(d); });
    const startOf = d => String((phaseById.get(R.primaryPhase(pidx, d.deal_id)) || {}).start_date || '');
    const latest = list => list.map(startOf).sort().pop() || '';
    const rows = [...byCamp.entries()].sort((a, b) => latest(b[1]).localeCompare(latest(a[1]))).map(([cid, list]) => {
      const c = campById.get(cid) || {}, sumC = list.filter(d => !R.isCancelled(d)).reduce((x, d) => x + R.totalCost(d), 0);
      return `<tr class="grp"><td colspan="5"><b>${esc(c.campaign_name || cid)}</b> <span class="muted small">${esc(PF.campSum(list.length, R.baht(sumC)))}</span></td></tr>` +
        list.sort((a, b) => startOf(b).localeCompare(startOf(a)) || b.deal_id.localeCompare(a.deal_id)).map(d => {
          const ph = phaseById.get(R.primaryPhase(pidx, d.deal_id)), dates = (postsBy.get(d.deal_id) || []).map(x => x.post_date).filter(Boolean).sort();
          return `<tr class="click" data-deal="${esc(d.deal_id)}" tabindex="0"><td><b>${esc(d.deal_id)}</b></td><td>${ph ? `${esc(R.phaseName(s, ph.phase_id))}${ph.start_date ? ` <span class="muted small">${range(ph.start_date, ph.end_date)}</span>` : ''}` : `<span class="muted">${esc(C.deal.unscheduled)}</span>`}</td>` +
            `<td>${stageChip(d)}</td><td class="num">${R.isCancelled(d) ? `<s class="muted">${esc(R.baht(R.totalCost(d)))}</s>` : esc(R.baht(R.totalCost(d)))}</td><td class="nowrap">${dates.length ? range(dates[0], dates[dates.length - 1]) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('');
    }).join('');
    return head + `<div class="tablewrap"><table class="tbl compact-sm kpm-htbl"><thead><tr><th>${esc(PF.colDeal)}</th><th>${esc(PF.colPhase)}</th><th>${esc(PF.colStage)}</th><th class="num">${esc(PF.colAmount)}</th><th>${esc(PF.colPosted)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Performance: the numbers (CR-06 §4.4) · every post · the late ones ---------- */
  function lastPhaseName(s, li) {
    const idx = R.phaseIndex(s), id = (idx.post.get(li.postId) || {}).phase || R.primaryPhase(idx, li.dealId);
    return s.phases.some(p => p.phase_id === id) ? R.phaseName(s, id) : '';
  }
  function perfHTML(s, k, td) {
    const p = R.kolPerformance(s, k.kol_id, td), li = R.lastWorkedInfo(s, k.kol_id), last = li ? li.date : null, pct = v => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`);
    const line = (l, v, cls) => `<div class="kv${cls ? ' ' + cls : ''}"><span>${esc(l)}</span><b>${v}</b></div>`;
    const head = `<div class="perf-head">${U.reliabilityChip(p)}<span class="muted small">${esc(p.measured ? P.postsOf(p.onTime, p.measured) : P.noData)}</span></div>`;
    const rows = line(P.onTime, esc(p.measured ? `${pct(p.rate)} (${P.ofN(p.onTime, p.measured)})` : '—')) +
      line(P.avgDelay, esc(p.avgDelay == null ? '—' : P.days(p.avgDelay))) + line(P.latePosts, esc(R.fmtNum(p.late))) +
      line(P.overdueNow, p.overdue ? `<span class="late">${esc(R.fmtNum(p.overdue))}</span>` : '0') +
      line(P.avgDrafts, esc(p.avgDrafts == null ? '—' : String(Math.round(p.avgDrafts * 10) / 10))) +
      line(P.completion, esc(p.completion == null ? '—' : `${pct(p.completion)} (${P.ofN(p.completeDeals, p.dealsPastList)})`)) +
      line(P.avgViews, esc(p.avgViews == null ? '—' : U.shortNum(p.avgViews))) + line(P.er, esc(p.er == null ? '—' : `${(Math.round(p.er * 10000) / 100).toFixed(2)}%`)) +
      line(P.cpv, esc(p.cpv == null ? '—' : `฿${p.cpv < 1 ? p.cpv.toFixed(3) : p.cpv.toFixed(2)}`)) +
      line(P.colLastWorked, last ? esc(`${R.dmy(last)} · ${P.daysAgo(R.dayDiff(td, last))}`) : '—') +
      line(T.colLastCampaign, li ? `<span title="${esc(T.lastCampTip(R.campaignName(s, li.campaignId) || '', lastPhaseName(s, li)))}">${esc(R.campaignName(s, li.campaignId) || '')}</span>` : '—');
    const acc = new Map(s.kol_accounts.map(a => [a.account_id, a])), idx = R.phaseIndex(s), where = l => { const r = idx.post.get(l.post.post_id), c = s.campaigns.find(x => x.campaign_id === l.deal.campaign_id) || {};
      return `${c.campaign_name || ''}${r && r.phase ? ` › ${R.phaseName(s, r.phase)}` : ''}`; };
    const late = p.latePosts.length ? `<div class="tablewrap"><table class="tbl compact-sm"><thead><tr><th>${esc(P.colWhere)}</th><th></th><th>${esc(P.colExpected)}</th><th>${esc(P.colPosted)}</th><th class="num">${esc(P.colLate)}</th></tr></thead><tbody>` +
      p.latePosts.map(l => { const a = acc.get(l.post.account_id) || {}; return `<tr class="click" data-deal="${esc(l.deal.deal_id)}" tabindex="0"><td title="${esc(where(l))}">${esc(where(l))}</td><td>${pfIcon(a.platform || l.post.platform || 'Other')}</td>` +
        `<td>${esc(R.dmy(l.expected))}</td><td>${esc(R.dmy(l.posted))}</td><td class="num late">${esc(P.plusDays(l.days))}</td></tr>`; }).join('') + `</tbody></table></div>`
      : p.measured ? `<div class="hint" style="margin-top:6px">${esc(P.noLate)}</div>` : '';
    return { numbers: head + rows, late };
  }
  function perfTabHTML(s, k) {
    const td = today(), ph = perfHTML(s, k, td), posts = R.kolPosts(s, k.kol_id), st = R.perfSettings(s.lookups);
    const table = posts.length ? `<div class="tablewrap"><table class="tbl compact-sm kpm-ptbl"><thead><tr><th>${esc(PF.colCampaign)}</th><th></th><th>${esc(PF.colPostDate)}</th><th class="num">${esc(PF.colViews)}</th><th class="num">${esc(PF.colEr)}</th><th>${esc(PF.colLink)}</th></tr></thead><tbody>` +
      posts.map(x => `<tr class="click" data-deal="${esc(x.deal.deal_id)}" tabindex="0"><td>${esc(x.campaign)} <span class="muted small">${esc(x.deal.deal_id)}</span></td><td>${pfIcon(x.platform || 'Other')}</td>` +
        `<td class="nowrap">${x.date ? esc(R.dmy(x.date)) : `<span class="muted">${esc(x.expected ? PF.plannedFor(R.dmy(x.expected)) : PF.notPosted)}</span>`}</td>` +
        `<td class="num">${x.views != null ? esc(U.shortNum(x.views)) : '<span class="muted">—</span>'}</td><td class="num">${x.er != null ? esc(`${(Math.round(x.er * 10000) / 100).toFixed(2)}%`) : '<span class="muted">—</span>'}</td>` +
        `<td>${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener" data-nodeal>${esc(PF.openPost)} ↗</a>` : '<span class="muted">—</span>'}</td></tr>`).join('') + `</tbody></table></div>`
      : `<div class="hint">${esc(PF.noPosts)}</div>`;
    return `<div class="kpm-2"><div class="kpm-col">${sec(P.sec, ph.numbers, U.info({ h: P.info.h, d: P.info.d(st.grace, st.minPosts), f: P.info.f }))}</div>` +
      `<div class="kpm-col">${ph.late ? sec(P.latePosts, ph.late) : ''}</div></div>` + sec(PF.postsN(posts.length), table);
  }

  /* ---------- Rates: Price reference (CR-07) · Rate history (quoted + agreed, newest first) ---------- */
  function ratesHTML(s, k) {
    const PR = C.priceRef, ref = R.costReference(s, k.kol_id), list = R.rateHistory(s, k.kol_id), acc = new Map(s.kol_accounts.map(a => [a.account_id, a]));
    const L5 = PR.rows, parts = q => R.COST_KEYS.filter(f => !R.isBlank(q[f])).map(f => `${L5[f]} ${R.fmtNum(q[f])}`).join(' · ');
    const refHTML = `<div class="kpm-ref"><div class="kpm-refc"><span class="l">${esc(PR.latest)}</span><b>${ref.latest ? esc(R.baht(ref.latest.total)) : '—'}</b>` +
      `<span class="muted small">${esc(ref.latest ? [ref.latest.source, ref.latest.date ? R.dmy(ref.latest.date) : PR.dateNotRecorded].filter(Boolean).join(' · ') : PR.noRate)}</span></div>` +
      `<div class="kpm-refc"><span class="l tiph" title="${esc(U.tipText(PR.info))}">${esc(PR.average)}</span><b>${ref.average ? esc(R.baht(ref.average.total)) : '—'}</b>` +
      `<span class="muted small">${esc((ref.average ? PR.deals(ref.average.n) : PR.noPaid) + (ref.freeExcluded ? ` · ${PR.freeExcluded(ref.freeExcluded)}` : ''))}</span></div></div>`;
    const quotes = new Map(R.quotesOfKol(s, k.kol_id).map(q => [q.quote_id, q]));
    const rows = list.map(x => {
      const q = x.kind === 'quoted' ? quotes.get(x.id) : null, a = q && acc.get(q.account_id);
      const what = x.kind === 'quoted' ? `<span>${esc(x.source || '')}</span>${x.note ? `<span class="sub">${esc(x.note)}</span>` : ''}` : `<span>${esc(x.campaign)}</span><span class="sub">${esc(x.id)}</span>`;
      return `<tr${x.kind === 'agreed' ? ` class="click" data-deal="${esc(x.id)}" tabindex="0"` : ''}${q ? ` title="${esc([a ? `${a.platform} @${a.handle}` : '', parts(q)].filter(Boolean).join('\n'))}"` : ''}>` +
        `<td class="nowrap">${x.date ? esc(R.dmy(x.date)) : `<span class="muted">${esc(T.undated)}</span>`}</td><td><span class="chip${x.kind === 'agreed' ? ' ok-chip' : ''}">${esc(PF.kind[x.kind])}</span></td>` +
        `<td class="qsrc">${what}</td><td>${x.kind === 'agreed' ? esc(x.stage) : ''}</td><td class="num"><b>${esc(R.baht(x.total))}</b></td></tr>`;
    }).join('');
    const table = list.length ? `<div class="tablewrap"><table class="tbl compact-sm kpm-rtbl"><thead><tr><th>${esc(T.qDate)}</th><th>${esc(PF.colKind)}</th><th>${esc(PF.colFrom)}</th><th>${esc(PF.colStage)}</th><th class="num">${esc(T.qTotal)}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="hint">${esc(PF.noRates)}</div>`;
    /* CR-20 §4.8 — Rates › Packages (prepaid posts used across Campaigns) between the Price reference and the Rate history */
    return sec(PR.title, refHTML) + KT.packages.sectionHTML(k) + sec(PF.rateHistory, `<p class="hint" style="margin-top:0">${esc(PF.rateHistoryHint)}</p>` + table, can('kol.edit') ? `<button type="button" class="btn small" data-act="addQuote">${esc(T.addRate)}</button>` : '');
  }

  /* ===================== Edit (Overview, in place) ===================== */
  const blankAccount = () => ({ account_id: null, platform: '', handle: '', profile_link: '', followers: '', is_legacy: false });
  function startEdit() {
    const s = state(), k = R.kolById(s, pm.id); if (!k || !guard('kol.edit')) return;
    const draft = Object.assign({ status_reason: '' }, k);
    ['kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'contact_id', 'note', 'status_reason', 'default_payment_term'].forEach(f => { if (draft[f] == null) draft[f] = ''; });
    draft.kol_status = draft.kol_status || 'Active';
    draft.partner_type = R.partnerTypeOf(k);   // CR-25 (blank = KOL)
    draft.accounts = R.accountsOfKol(s, k.kol_id).map(a => Object.assign({}, a, { profile_link: a.profile_link || '', followers: a.followers == null ? '' : String(a.followers) }));
    Object.assign(pm, { mode: 'edit', draft, dirty: false, tab: 'overview' }); pm.touched.clear();
    draw();
    const f = $('f_display_name'); if (f) f.focus();
  }
  function cancelEdit() { Object.assign(pm, { mode: 'view', draft: null, dirty: false }); pm.touched.clear(); draw(); }
  function accountEditHTML(a, i) {
    const s = state(), used = a.account_id ? R.postsOnAccount(s, a.account_id) : 0, key = k => `acc${i}_${k}`;
    const fld = (k, label, input, wide) => `<div class="field${wide ? ' wide' : ''}"><label for="f_${key(k)}">${esc(label)} <span class="req">*</span></label>${input}</div>`;
    return `<div class="acc-edit" data-i="${i}">
      <div class="top"><span>${esc(T.accountN(i + 1))}${a.account_id ? ` <span class="muted small">${esc(a.account_id)}</span>` : ''}${a.is_legacy ? ` <span class="badge-legacy">${esc(T.incomplete)}</span>` : ''}</span>
        <button type="button" class="link" data-del="${i}"${used ? ` disabled title="${esc(T.cannotDeleteAccount(used))}"` : ''}>${esc(T.removeAccount)}</button></div>
      ${a.is_legacy ? `<div class="hint" style="margin-bottom:6px">${esc(T.legacyHint)}</div>` : ''}
      <div class="fields">
        ${fld('profile_link', T.fLink, `<input type="url" id="f_${key('profile_link')}" data-a="profile_link" data-key="${key('profile_link')}" value="${esc(a.profile_link)}" placeholder="https://www.tiktok.com/@account" autocomplete="off">`, 1)}
        ${fld('platform', T.platform, `<select id="f_${key('platform')}" data-a="platform" data-key="${key('platform')}">${optionsHTML(activeList('platform_list', a.platform), a.platform, T.choose)}</select>`)}
        ${fld('handle', T.fHandle, `<input id="f_${key('handle')}" data-a="handle" data-key="${key('handle')}" value="${esc(a.handle)}" placeholder="${esc(T.handlePh)}" autocomplete="off">`)}
        ${fld('followers', T.colFollowers, `<input type="number" min="0" step="1" inputmode="numeric" id="f_${key('followers')}" data-a="followers" data-key="${key('followers')}" value="${esc(a.followers)}">`)}
        <div class="field"><label>${esc(T.tier)}</label><input readonly data-tier value="${esc(R.tierOf(a.followers, tierRules()))}"></div>
      </div></div>`;
  }
  function formHTML() {
    const s = state(), O = C.kolOptions, d = pm.draft;
    const inp = (f, extra = '') => `<input id="f_${f}" data-f="${f}" data-key="${f}" value="${esc(d[f])}" autocomplete="off"${extra}>`;
    const selF = (f, items, ph) => `<select id="f_${f}" data-f="${f}" data-key="${f}">${optionsHTML(items, d[f], ph)}</select>`;
    return `<div class="kpm-edit">${sec(T.secProfile, `<div class="fields">
          ${field('display_name', T.fName, inp('display_name', ` placeholder="${esc(T.namePh)}"`), { req: 1, wide: 1 })}
          ${field('partner_type', C.partner.field, U.partnerSegHTML('data-ptf', d.partner_type, { id: 'f_partner_type' }), { req: 1, wide: 1 })}
          ${field('kol_category', T.category, inp('kol_category', ' list="km_dl_cat"'))}
          ${field('kol_type', T.type, selF('kol_type', R.kolTypeList(s.lookups).filter(t => t.active !== false || t.key === d.kol_type).map(t => ({ value: t.key, label: R.kolTypeLabel(s.lookups, t.key) })), KTY.notSet),
            { hint: d.kol_type_legacy && d.kol_type_legacy !== R.kolTypeLabel(s.lookups, d.kol_type) ? esc(KTY.oldValue(d.kol_type_legacy)) : '' })}
          ${field('gender', T.gender, selF('gender', R.GENDERS.map(g => ({ value: g, label: O.gender[g] })), T.choose))}
          ${field('pic', T.pic, selF('pic', picList(d.pic), T.choose))}
          ${field('contact_channel', T.contact, selF('contact_channel', R.CONTACT_CHANNELS, T.choose))}
          ${field('contact_id', T.contactId, inp('contact_id', ` placeholder="${esc(T.contactIdPh[d.contact_channel || ''] || T.contactIdPh[''])}" maxlength="${R.CONTACT_ID_MAX}"`), { hint: esc(T.contactIdHint) })}
          ${field('kol_status', T.kolStatus, selF('kol_status', R.KOL_STATUSES))}
          ${field('default_payment_term', T.defaultTerm, selF('default_payment_term', R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), C.term.none))}
          <div class="field wide${d.kol_status === 'Active' ? ' hidden' : ''}" id="km_reason"><label for="f_status_reason">${esc(T.reason)}</label>${inp('status_reason', ` placeholder="${esc(T.reasonPh)}"`)}</div>
          ${field('note', T.note, `<textarea id="f_note" data-f="note" data-key="note">${esc(d.note)}</textarea>`, { wide: 1 })}
        </div>
        <datalist id="km_dl_cat">${distinct(s.kol_master.map(k => k.kol_category)).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`)}
        ${sec(T.secAccounts(d.accounts.length), d.accounts.map(accountEditHTML).join(''), `<button type="button" class="btn small" data-act="addAcc">${esc(T.addAccount)}</button>`)}</div>`;
  }
  function wireForm() {
    const root = box(), d = pm.draft;
    root.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      const h = () => {
        if (pm.draft !== d) return;
        d[f] = el.value; pm.dirty = true;
        if (f === 'kol_status') $('km_reason').classList.toggle('hidden', el.value === 'Active');
        if (f === 'contact_channel') { const ci = $('f_contact_id'); if (ci) ci.placeholder = T.contactIdPh[el.value] || T.contactIdPh['']; }   // CR-14 §4.5
        check();
      };
      el.addEventListener('input', h);
      el.addEventListener('change', () => { h(); pm.touched.add(el.dataset.key); check(); });
      el.addEventListener('blur', () => { pm.touched.add(el.dataset.key); check(); });
    });
    root.querySelectorAll('[data-ptf]').forEach(b => b.addEventListener('click', () => { if (pm.draft !== d) return; d.partner_type = U.partnerSegPick(b, 'data-ptf'); pm.dirty = true; check(); }));   // CR-25
    root.querySelectorAll('.acc-edit').forEach(row => {
      const a = d.accounts[+row.dataset.i];
      row.querySelectorAll('[data-a]').forEach(el => {
        const k = el.dataset.a;
        const h = () => {
          if (pm.draft !== d) return;
          a[k] = el.value; pm.dirty = true;
          if (k === 'profile_link') {   // paste a profile link → fill handle / platform when still empty
            const hh = R.handleFromLink(el.value), pp = R.platformFromLink(el.value);
            if (hh && R.isBlank(a.handle)) { a.handle = hh; row.querySelector('[data-a="handle"]').value = hh; }
            if (pp && !a.platform && (state().lookups.platform_list || []).includes(pp)) { a.platform = pp; row.querySelector('[data-a="platform"]').value = pp; }
          }
          row.querySelector('[data-tier]').value = R.tierOf(a.followers, tierRules());
          check();
        };
        el.addEventListener('input', h);
        el.addEventListener('change', () => { h(); pm.touched.add(el.dataset.key); check(); });
        el.addEventListener('blur', () => { pm.touched.add(el.dataset.key); check(); });
      });
    });
  }
  function check() {
    if (!editing() || !pm.draft || !$('km_checks')) return;   // a late blur / change after Save or Cancel
    const root = box(), res = R.validateKol(state(), pm.draft);
    $('km_checks').innerHTML = checksHTML(res, C.common.ok);
    root.querySelectorAll('[data-key]').forEach(el => el.classList.toggle('invalid', pm.touched.has(el.dataset.key) && res.errs.some(e => e.field === el.dataset.key)));
    root.querySelector('[data-act="save"]').disabled = res.errs.length > 0;
  }
  async function save() {
    if (!guard('kol.edit')) return;
    const s = state(), d = pm.draft, res = R.validateKol(s, d);
    if (res.errs.length) { res.errs.forEach(x => pm.touched.add(x.field)); check(); return; }
    const kolId = d.kol_id, old = R.kolById(s, kolId); if (!old) return;
    const val = v => R.trim(v) || null;
    const rec = { kol_id: kolId, display_name: R.trim(d.display_name), kol_category: val(d.kol_category), kol_type: val(d.kol_type), gender: d.gender || null,
      pic: d.pic || null, kol_status: d.kol_status || 'Active', status_reason: d.kol_status && d.kol_status !== 'Active' ? val(d.status_reason) : null,
      contact_channel: d.contact_channel || null, contact_id: val(d.contact_id), note: val(d.note), sources: old.sources || [],
      default_payment_term: R.isTerm(d.default_payment_term) ? d.default_payment_term : null,
      partner_type: R.partnerTypeOf(d) === R.partnerTypeOf(old) ? (old.partner_type == null ? null : old.partner_type) : R.partnerTypeOf(d) };   // CR-25: untouched stays as it was (blank = KOL)
    const termChanged = (R.isTerm(old.default_payment_term) ? old.default_payment_term : null) !== rec.default_payment_term;
    Object.assign(old, rec);
    const keep = new Set(d.accounts.map(a => a.account_id).filter(Boolean));
    s.kol_accounts = s.kol_accounts.filter(a => a.kol_id !== kolId || keep.has(a.account_id));
    d.accounts.forEach(a => {
      const vals = { platform: a.platform, handle: R.trim(a.handle), profile_link: val(a.profile_link), followers: R.isBlank(a.followers) ? null : Number(a.followers) };
      const orig = a.account_id ? s.kol_accounts.find(x => x.account_id === a.account_id) : null;
      if (!orig) s.kol_accounts.push(Object.assign({ account_id: store.newId('account'), kol_id: kolId }, vals, { is_legacy: false }));
      else if (R.ACCOUNT_FIELDS.some(k => R.trim(orig[k]) !== R.trim(a[k]))) Object.assign(orig, vals, { is_legacy: !R.accountComplete(vals) });
    });
    Object.assign(pm, { mode: 'view', draft: null, dirty: false }); pm.touched.clear();
    commit(T.saved(kolId));
    listChanged(); draw();
    /* CR-02 §4.3 — a new default can be copied to this KOL's open deals (List / In process) */
    if (!termChanged) return;
    const open = s.deals.filter(x => x.kol_id === kolId && R.isOpenDeal(x) && R.termOf(x) !== rec.default_payment_term);
    if (!open.length || !(await U.confirmDialog(T.applyTitle(open.length), T.applyBody(C.term[rec.default_payment_term || 'none']), T.applyOk))) return;
    const r = R.applyTermToOpenDeals(s, kolId, rec.default_payment_term, { eventId: store.newEventId(), now: new Date(), user: userId() });
    const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
    r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
    commit(T.applied(r.deals.length)); listChanged(); draw(true);
  }
  const listChanged = () => { if (KT.screens.kol.refreshList) KT.screens.kol.refreshList(); };

  /* ===================== clicks · keys ===================== */
  async function switchTab(t) {
    if (t === pm.tab && !editing()) return;
    if (!(await leaveOK())) return;
    pm.tab = t; rememberTab(t); draw();
    const b = $('kpm_tab_' + t); if (b) b.focus();
  }
  async function step(dir) {
    const id = R.kolNav(listIds() || [], pm.id, dir); if (!id) return;
    if (!(await leaveOK())) return;
    await open(id, {});
    const tr = document.querySelector(`#km_body tr[data-id="${CSS.escape(id)}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' });
    const b = box().querySelector(`[data-kpm-nav="${dir}"]`); if (b && !b.disabled) b.focus(); else box().focus();
  }
  const rerender = () => { if (pm.open) { draw(true); listChanged(); } };
  function onClick(e) {
    if (e.target.closest('[data-kpm-close]')) { requestClose(); return; }
    const t = e.target.closest('[data-kpm-tab]'); if (t) { switchTab(t.dataset.kpmTab); return; }
    const nv = e.target.closest('[data-kpm-nav]'); if (nv) { if (!nv.disabled) step(+nv.dataset.kpmNav); return; }
    if (e.target.closest('[data-backdeal]')) { backToDeal(); return; }
    const hf = e.target.closest('[data-hist]'); if (hf) { pm.hist = hf.dataset.hist; draw(true); return; }
    /* §4.2 · §4.3 — the Payee & shipping tab */
    if (!editing() && pm.tab === 'payee' && KT.payee.onClick(e, R.kolById(state(), pm.id), rerender)) return;
    if (!editing() && pm.tab === 'rates' && KT.packages.click(e, pm.id, rerender)) return;   // CR-20 §4.8
    if (e.target.closest('a[href]')) return;
    const dl = e.target.closest('[data-deal]'); if (dl && !editing()) { openDeal(dl.dataset.deal); return; }
    const del = e.target.closest('[data-del]');
    if (del) { if (del.disabled) return; pm.draft.accounts.splice(+del.dataset.del, 1); pm.dirty = true; draw(true); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const m = b.closest('details'); if (m) m.open = false;
    const act = b.dataset.act;
    if (act === 'edit') startEdit();
    else if (act === 'cancel') cancelEdit();
    else if (act === 'save') save();
    else if (act === 'addAcc') {
      pm.draft.accounts.push(blankAccount()); pm.dirty = true; draw(true);
      const rows = box().querySelectorAll('.acc-edit'), last = rows[rows.length - 1];
      last.scrollIntoView({ block: 'nearest' }); last.querySelector('input').focus();
    }
    else if (act === 'merge') openMerge();
    else if (act === 'addQuote') openQuote(b);
    else if (act === 'addAccount') openAddAccount(b);
    else if (act === 'photoUpload') pickPhotoFile();
    else if (act === 'photoRemove') removePhoto();
    /* CR-20 §4.2 — Add to campaign: New deal › From KOL Master with this KOL in the Selected panel */
    else if (act === 'addPhase') { const id = pm.id; KT.screens.deals.openNewDeal({ tab: 'master', kolId: id, opener: b, after: () => { listChanged(); if (pm.open && pm.id === id) draw(true); } }); }
  }
  function onKey(e) {
    if (!pm.open) return;
    if (e.key === 'Escape') {
      if (U.drawerOwner()) return;   // the Deal drawer on top closes first (ui.js)
      const m = e.target.closest && e.target.closest('details.menu[open]'); if (m) { m.open = false; e.preventDefault(); return; }
      e.preventDefault(); requestClose(); return;
    }
    const typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
    /* ↑ ↓: the KOL before / after (not while typing · with unsaved edits "Discard changes?" first) */
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !typing && !e.altKey && !e.ctrlKey && !e.metaKey && listIds()) { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); return; }
    /* ← → move between the tabs while one has the focus */
    const tb = e.target.closest && e.target.closest('[data-kpm-tab]');
    if (tb && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); const i = R.PROFILE_TABS.indexOf(tb.dataset.kpmTab), n = R.PROFILE_TABS.length; switchTab(R.PROFILE_TABS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]); return; }
    const row = e.target.closest && e.target.closest('[data-deal][tabindex]');
    if (row && (e.key === 'Enter' || e.key === ' ') && !typing) { e.preventDefault(); openDeal(row.dataset.deal); return; }
    if (e.key !== 'Tab') return;
    const f = [...box().querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(x => x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || a === box())) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  /* CR-20 §4.6 — a deal takes this modal's place (never two layers): the Deal modal with "‹ Back to <KOL>" (this tab again) */
  async function openDeal(id) {
    if (!(await leaveOK())) return;
    const back = { kolId: pm.id, tab: pm.tab, name: (R.kolById(state(), pm.id) || {}).display_name || pm.id };
    close({ quiet: true, noRefresh: true });
    KT.screens.deals.openDealModal(id, { backKol: back, after: () => listChanged(), source: 'kol' });
  }
  function backToDeal() {
    const id = pm.backDeal;
    if (pm.pushed && pm.base === '#' + U.toRoute('deals/' + id)) { requestClose(); return; }   // it came from that deal: Back shows it again
    leaveOK().then(ok => { if (!ok) return; close({ quiet: true }); KT.screens.deals.openDealModal(id, { source: 'kol' }); });   // CR-27 §3.3: over this page
  }

  /* ===================== dialogs (over the profile) ===================== */
  const PRICE_LABEL = () => ({ rate_card: T.qRate, gencode_expense: T.qGencode, gencode_period: T.qGencodeDays, basket_fee: T.qBasket, asset_fee: T.qAsset, expediting_fee: T.qExpedite });
  function openQuote(opener) {
    if (!guard('kol.edit')) return;
    const s = state(), k = R.kolById(s, pm.id), accs = R.accountsOfKol(s, k.kol_id);
    const q = { kol_id: k.kol_id, account_id: accs.length === 1 ? accs[0].account_id : '', quoted_at: today(), source: T.quoteSourceDefault, note: '' };
    R.PRICE_KEYS.forEach(f => { q[f] = ''; });
    const num = f => `<div class="field"><label for="q_${f}">${esc(PRICE_LABEL()[f])}</label><input type="number" min="0" step="1" id="q_${f}" data-q="${f}"></div>`;
    U.createModal({ size: 'M', title: T.quoteTitle(k.display_name), opener, foot: [`<div class="checks" id="q_checks"></div>`, U.cmButtons(T.addRateOk, 'q_ok')], body: `
      <div class="fields">
        <div class="field wide"><label for="q_account_id">${esc(T.qAccount)}</label><select id="q_account_id" data-q="account_id">${optionsHTML(accs.map(a => ({ value: a.account_id, label: `${a.platform} @${a.handle}` })), q.account_id, T.noAccount)}</select></div>
        <div class="field"><label>${esc(T.qDate)}</label>${dateHTML('id="q_quoted_at" data-q="quoted_at"', q.quoted_at, { label: T.qDate })}</div>
        <div class="field"><label for="q_source">${esc(T.qSource)}</label><input id="q_source" data-q="source" value="${esc(q.source)}"></div>
        ${R.PRICE_KEYS.map(num).join('')}
        <div class="field wide"><label for="q_note">${esc(T.qNote)}</label><input id="q_note" data-q="note"></div>
      </div>` });
    const chk = () => { const res = R.validateQuote(s, q); $('q_checks').innerHTML = checksHTML(res, ''); $('q_ok').disabled = res.errs.length > 0; return res; };
    $('cm_root').querySelectorAll('[data-q]').forEach(el => { el.addEventListener('input', () => { q[el.dataset.q] = el.value; chk(); }); el.addEventListener('change', () => { q[el.dataset.q] = el.value; chk(); }); });
    $('q_ok').addEventListener('click', () => {
      if (chk().errs.length) return;
      const rec = { quote_id: store.newId('quote'), kol_id: k.kol_id, account_id: q.account_id || null, quoted_at: q.quoted_at, source: R.trim(q.source), source_row: null };
      R.PRICE_KEYS.forEach(f => { rec[f] = R.isBlank(q[f]) ? null : Number(q[f]); });
      rec.note = R.trim(q.note) || null;
      s.kol_rate_quotes.push(rec);
      U.closeModal(); commit(T.rateSaved(rec.quote_id)); rerender();
    });
    chk();
  }
  /* + Add account (M, over the profile): the KOL Master account checks */
  function openAddAccount(opener) {
    if (!guard('kol.edit')) return;
    const k = R.kolById(state(), pm.id); if (!k) return;
    const a = { draft: { platform: '', handle: '', followers: '', profile_link: '' }, touched: new Set(), submitted: false };
    U.createModal({ size: 'M', title: C.deal.aaTitle(k.display_name), opener, body: U.accountFieldsHTML(a.draft), foot: [`<div class="checks" id="aa_checks"></div>`, U.cmButtons(C.deal.aaCreate, 'aa_ok')] });
    const root = $('cm_root'), chk = () => U.accountCheck(root, k.kol_id, a);
    U.wireAccount(root, a, chk); chk();
    $('aa_ok').addEventListener('click', () => {
      a.submitted = true; if (chk().errs.length || !guard('kol.edit')) return;
      const rec = R.newAccountRecord(k.kol_id, a.draft, store.newId('account')); state().kol_accounts.push(rec);
      U.closeModal(); commit(C.deal.aaDone(rec.handle)); rerender();
    });
  }
  function openMerge() {
    if (!guard('kol.merge')) return;
    const s = state(), cur = R.kolById(s, pm.id);
    const label = k => `${k.display_name} (${k.kol_id})`;
    openDialog(`<div class="dlg-h">${esc(T.mergeTitle(cur.display_name))}</div><div class="dlg-b">
      <div class="field"><label for="mg_pick">${esc(T.mergePick)}</label><input id="mg_pick" list="mg_list" autocomplete="off">
        <datalist id="mg_list">${s.kol_master.filter(k => k.kol_id !== cur.kol_id).map(k => `<option value="${esc(k.display_name)} · ${esc(k.kol_id)}">`).join('')}</datalist></div>
      <div id="mg_keep" style="margin-top:12px"></div><div class="checks" id="mg_prev" style="margin-top:12px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mg_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mg_ok" disabled>${esc(T.mergeConfirm)}</button></div>`);
    let otherId = null, keepId = null;
    const resolve = v => {
      const m = /(K\d+)\s*$/i.exec(v.trim()), byId = m && R.kolById(s, m[1].toUpperCase());
      if (byId && byId.kol_id !== cur.kol_id) return byId.kol_id;
      const byName = s.kol_master.filter(k => k.kol_id !== cur.kol_id && k.display_name.toLowerCase() === v.trim().toLowerCase());
      return byName.length === 1 ? byName[0].kol_id : null;
    };
    const refresh = () => {
      if (!otherId) { $('mg_keep').innerHTML = ''; $('mg_prev').innerHTML = ''; $('mg_ok').disabled = true; return; }
      const other = R.kolById(s, otherId), into = R.kolById(s, keepId), fromId = keepId === cur.kol_id ? otherId : cur.kol_id, from = R.kolById(s, fromId);
      $('mg_keep').innerHTML = `<label>${esc(T.mergeKeep)}</label>` + [other, cur].map(k =>
        `<label class="tick block"><input type="radio" name="mg_k" value="${esc(k.kol_id)}"${k.kol_id === keepId ? ' checked' : ''}> ${esc(label(k))}</label>`).join('');
      $('mg_keep').querySelectorAll('input[name="mg_k"]').forEach(r => r.addEventListener('change', () => { keepId = r.value; refresh(); }));
      const p = R.mergePreview(s, fromId, keepId);
      $('mg_prev').innerHTML = `<div class="check info">i <span>${esc(T.mergeExplain(label(from), label(into)))}</span></div>` +
        `<div class="check info">i <span>${esc(T.mergeMoves(p.accounts, p.deals, p.quotes))}</span></div>` + checksHTML(p, '') +
        (editing() ? `<div class="check warn">! <span>${esc(T.mergeUnsaved)}</span></div>` : '');
      $('mg_ok').disabled = p.errs.length > 0;
    };
    $('mg_pick').addEventListener('input', e => { otherId = resolve(e.target.value); keepId = otherId; refresh(); });
    $('mg_cancel').addEventListener('click', closeDialog);
    $('mg_ok').addEventListener('click', () => {
      if (!otherId) return;
      const intoId = keepId, fromId = keepId === cur.kol_id ? otherId : cur.kol_id;
      if (R.mergePreview(s, fromId, intoId).errs.length) return;
      const fromPhoto = (R.kolById(s, fromId) || {}).photo || null;
      Object.assign(s, R.applyMerge(s, fromId, intoId));
      if (KT.screens.kol.unselect) KT.screens.kol.unselect(fromId);
      /* §4.4 — the removed KOL's photo goes to the one kept when that one has none (else it is dropped) */
      if (KT.photos.url(fromId)) KT.photos.move(fromId, intoId).then(moved => { const kk = R.kolById(state(), intoId); if (moved && kk && !kk.photo) { kk.photo = fromPhoto; commit(); } });
      Object.assign(pm, { mode: 'view', id: intoId, draft: null, dirty: false }); pm.touched.clear();
      closeDialog(); commit(T.mergeDone(fromId, intoId));
      listChanged(); draw();
    });
    $('mg_pick').focus();
  }

  /* ===================== §4.4 — the profile photo ===================== */
  const canPhoto = () => can('kol.edit');
  function pickPhotoFile() {
    if (!KT.photos.available()) { toast(PF.photoOff); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = R.PHOTO_TYPES.join(',');
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) pickedPhoto(f); });
    inp.click();
  }
  /* a file from Upload / drop / paste → checked (JPG · PNG · WebP · ≤ 5 MB) → the crop dialog */
  async function pickedPhoto(f) {
    if (!pm.open || !canPhoto()) return;
    if (!KT.photos.available()) { toast(PF.photoOff); return; }
    const bad = R.photoProblem(f);
    if (bad) { toast(bad === 'size' ? PF.photoTooBig(R.fmtNum(Math.round(f.size / 1048576 * 10) / 10)) : PF.photoType); return; }
    let pic; try { pic = await KT.photos.load(f); } catch (e) { toast(PF.photoType); return; }
    cropDialog(pm.id, pic);
  }
  /* drag the picture in the circle · zoom · Save = 256 × 256 WebP into IndexedDB (kol_master.photo keeps the size only) */
  function cropDialog(kolId, pic) {
    const k = R.kolById(state(), kolId), img = pic.img, W = img.naturalWidth, H = img.naturalHeight, BOX = 240;
    const st = { x: 0, y: 0, z: 1 };
    U.createModal({ size: 'S', title: PF.cropTitle(k.display_name), onClose: () => URL.revokeObjectURL(pic.url),
      foot: [`<span class="muted small">${esc(PF.photoHint)}</span>`, U.cmButtons(PF.savePhoto, 'cr_ok')],
      body: `<div class="crop"><div class="crop-box" id="cr_box" style="width:${BOX}px;height:${BOX}px" aria-label="${esc(PF.cropDrag)}"><img id="cr_img" src="${esc(pic.url)}" alt="" draggable="false"><span class="crop-ring" aria-hidden="true"></span></div>
        <label class="crop-zoom"><span>${esc(PF.zoom)}</span><input type="range" id="cr_zoom" min="1" max="3" step="0.01" value="1" aria-label="${esc(PF.zoom)}"></label>
        <p class="hint">${esc(PF.cropDrag)}</p></div>` });
    const el = $('cr_img'), cbox = $('cr_box');
    const place = () => {
      const c = R.cropSquare(W, H, st.x, st.y, st.z), sc = BOX / c.side;
      el.style.width = W * sc + 'px'; el.style.height = H * sc + 'px'; el.style.transform = `translate(${-c.sx * sc}px,${-c.sy * sc}px)`;
    };
    place();
    $('cr_zoom').addEventListener('input', e => { st.z = Number(e.target.value) || 1; place(); });
    cbox.addEventListener('pointerdown', e => {
      e.preventDefault(); cbox.setPointerCapture(e.pointerId);
      const c0 = R.cropSquare(W, H, st.x, st.y, st.z), sc = BOX / c0.side, x0 = e.clientX, y0 = e.clientY, sx0 = c0.sx, sy0 = c0.sy;
      const roomX = (W - c0.side) / 2, roomY = (H - c0.side) / 2;
      const move = ev => { const sx = sx0 - (ev.clientX - x0) / sc, sy = sy0 - (ev.clientY - y0) / sc;
        st.x = roomX ? Math.max(-1, Math.min(1, (sx - roomX) / roomX)) : 0; st.y = roomY ? Math.max(-1, Math.min(1, (sy - roomY) / roomY)) : 0; place(); };
      const up = () => { cbox.removeEventListener('pointermove', move); cbox.removeEventListener('pointerup', up); cbox.removeEventListener('pointercancel', up); };
      cbox.addEventListener('pointermove', move); cbox.addEventListener('pointerup', up); cbox.addEventListener('pointercancel', up);
    });
    /* the arrow keys move it too (keyboard) */
    cbox.tabIndex = 0;
    cbox.addEventListener('keydown', e => { const d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation(); st.x = Math.max(-1, Math.min(1, st.x + d[0])); st.y = Math.max(-1, Math.min(1, st.y + d[1])); place(); });
    $('cr_ok').addEventListener('click', async () => {
      if (!guard('kol.edit')) return;
      $('cr_ok').disabled = true;
      try {
        const blob = await KT.photos.render(img, st, st.z);
        await KT.photos.put(kolId, blob);
        const rec = R.kolById(state(), kolId); if (rec) rec.photo = { updated_at: new Date().toISOString(), updated_by: userId(), w: R.PHOTO_SIZE, h: R.PHOTO_SIZE, bytes: blob.size };
        U.closeModal(); commit(PF.photoSaved(R.fmtNum(Math.round(blob.size / 102.4) / 10)));
      } catch (e) { $('cr_ok').disabled = false; toast(PF.photoFailed); }
    });
  }
  async function removePhoto() {
    if (!guard('kol.edit')) return;
    const id = pm.id; if (!(await U.confirmDialog(PF.removeTitle, PF.removeBody, PF.removePhoto, true))) return;
    await KT.photos.remove(id);
    const k = R.kolById(state(), id); if (k) k.photo = null;
    commit(PF.photoRemoved);
  }
  /* a photo saved / removed → every place that shows it */
  KT.photos.onChange(() => { if (pm.open) draw(true); listChanged(); });
  /* the vault locks / unlocks: the Payee & shipping tab is drawn again (decrypted details never stay on screen once locked) */
  KT.vault.onChange(() => { if (pm.open && !editing()) draw(true); });

  /* after Restore / Reset / another person: closed without a history step */
  function reset() { if (pm.open) close({ quiet: true, noRefresh: true }); }
  return { open, close, requestClose, reset, onHashChange, isOpen: () => pm.open, currentId: () => (pm.open ? pm.id : null), isEditing: () => pm.open && editing(), redraw: () => draw(true), tab: () => pm.tab };
})();
