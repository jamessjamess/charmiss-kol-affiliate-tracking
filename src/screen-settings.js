/* screen-settings.js — Settings: Lists (Journey steps, Pillar, CTA, Platform, Tier rules, Products) edited inline (CR-19: no Pillar targets),
   and Data (backup info, Backup / Restore / Reset, Data issues). The PIC list lives in Role Management (CR-04 §4.4). → KT.screens.settings */
KT.screens.settings = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, S, $, esc, today, store, state, commit, toast, checksHTML, kv, stChip, setHash, doBackup, openRestore, openReset, go, can, openDialog, closeDialog, downloadCSV } = U;
  const K = C.settings, LS = C.lists, P = C.products, KTY = C.kolTypes;
  const SECTIONS = [['journey', K.navJourney], ['pillar_list', K.navPillar], ['cta_list', K.navCta], ['platform_list', K.navPlatform], ['kol_types', K.navKolTypes], ['tiers', K.navTiers], ['products', K.navProducts], ['perf', K.navPerf], ['samples', C.samples.settings.nav], ['payments', K.navPayments], ['opsmode', K.navOpsMode], ['data', K.navData], ['golive', C.golive.nav]];   // CR-17 §4.1: Operations mode
  const LIST_SECTIONS = SECTIONS.filter(x => x[0] !== 'data' && x[0] !== 'golive' && x[0] !== 'opsmode');
  const st = { section: 'journey', tiers: null, targets: null, pq: '', perf: null, pay: null };

  function render(id) {
    if (!SECTIONS.some(([k]) => k === st.section)) st.section = SECTIONS[0][0];   // (CR-19: Pillar targets is gone)
    const sec = $('tab-settings');
    if (id && SECTIONS.some(x => x[0] === id)) st.section = id;
    if (!sec.dataset.built) {
      sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(K.title)}</h1></div>
        <select class="set-select" id="set_select" aria-label="${esc(K.title)}"></select>
        <div class="set-layout"><nav class="set-nav" id="set_nav"></nav><div id="set_body"></div></div>`;
      $('set_nav').addEventListener('click', e => { if (e.target.closest('[data-goroles]')) { go('roles'); return; } const b = e.target.closest('[data-sec]'); if (b) go2(b.dataset.sec); });
      $('set_select').addEventListener('change', e => go2(e.target.value));
      $('set_body').addEventListener('click', bodyClick);
      $('set_body').addEventListener('change', bodyChange);
      /* CR-07 §4.6 — drag a KOL type by its grip to another place */
      let dragKey = null;
      $('set_body').addEventListener('pointerdown', e => { const g = e.target.closest('.kt-grip'); if (g && can('settings.lists')) g.closest('tr').draggable = true; });
      $('set_body').addEventListener('dragstart', e => { const tr = e.target.closest && e.target.closest('tr[data-kt]'); if (!tr) return; dragKey = tr.dataset.kt; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); } catch (x) { /* some browsers */ } tr.classList.add('dragging'); });
      $('set_body').addEventListener('dragover', e => { if (dragKey && e.target.closest('tr[data-kt]')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
      $('set_body').addEventListener('drop', e => {
        const tr = e.target.closest('tr[data-kt]'); if (!dragKey || !tr) return; e.preventDefault();
        const key = dragKey, rows = [...$('set_body').querySelectorAll('tr[data-kt]')], to = rows.indexOf(tr), r = tr.getBoundingClientRect();
        const from = rows.findIndex(x => x.dataset.kt === key), after = e.clientY > r.top + r.height / 2;
        dragKey = null; moveKolType(key, Math.max(0, Math.min(rows.length - 1, to + (after && to < from ? 1 : !after && to > from ? -1 : 0))));
      });
      $('set_body').addEventListener('dragend', e => { dragKey = null; const tr = e.target.closest && e.target.closest('tr[data-kt]'); if (tr) { tr.draggable = false; tr.classList.remove('dragging'); } });
      $('set_body').addEventListener('input', e => {
        if (e.target.matches('[data-psearch]')) { st.pq = e.target.value; $('pr_body').innerHTML = productRowsHTML(); }
        if (e.target.dataset.pf2 && can('settings.lists')) { st.perf[e.target.dataset.pf2] = e.target.value; perfCheck(); }
        if (st.smp && can('settings.lists') && (e.target.dataset.ss || e.target.dataset.sst)) { if (e.target.dataset.ss) st.smp[e.target.dataset.ss] = e.target.value; else st.smp.tracking_url[e.target.dataset.sst] = e.target.value; samplesCheck(); }
      });
      sec.dataset.built = '1';
    }
    $('set_nav').innerHTML = `<div class="grp">${esc(K.lists)}</div>` + LIST_SECTIONS.map(navBtn).join('') +
      (can('roles') ? `<button type="button" class="link small set-piclink" data-goroles>${esc(C.roles.managePic)}</button>` : '') +
      `<div class="grp">${esc(K.dataGroup)}</div>` + navBtn(SECTIONS.find(x => x[0] === 'opsmode')) + navBtn(SECTIONS.find(x => x[0] === 'data')) + navBtn(SECTIONS.find(x => x[0] === 'golive'));   // CR-11 §4.7 · CR-17
    $('set_select').innerHTML = SECTIONS.map(([k, l]) => `<option value="${k}"${k === st.section ? ' selected' : ''}>${esc(l)}</option>`).join('');
    setHash('settings/' + st.section);
    $('set_body').innerHTML = st.section === 'data' ? dataHTML() : st.section === 'golive' ? KT.golive.settingsHTML() : st.section === 'journey' ? journeyHTML() : st.section === 'tiers' ? tiersHTML() : st.section === 'products' ? productsHTML() : st.section === 'perf' ? perfHTML() : st.section === 'samples' ? samplesHTML() : st.section === 'kol_types' ? kolTypesHTML() : st.section === 'payments' ? paymentsHTML() : st.section === 'opsmode' ? opsModeHTML() : listHTML(st.section);
    if (st.section === 'perf') perfCheck();
    if (st.section === 'samples') samplesCheck();
    if (st.section === 'tiers') tiersCheck();
    /* CR-04 §4.4 — Lists and Pillar targets are read-only for everyone but an admin */
    if (st.section !== 'data' && st.section !== 'golive' && !can(editAction())) {
      $('set_body').querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; });
      const card = $('set_body').querySelector('.card'); if (card) card.insertAdjacentHTML('afterbegin', `<div class="hint ro-note">${esc(st.section === 'tiers' ? C.roles.tiersReadOnly : C.roles.settingsReadOnly)}</div>`);
      $('set_body').querySelectorAll('[data-psearch]').forEach(el => { el.disabled = false; });   // anyone can search the catalog
      $('set_body').querySelectorAll('.vault-btns button').forEach(el => { el.disabled = false; });   // CR-08: unlock / template are their own permissions
    }
  }
  /* CR-05 §4.1: Tier rules — admin · the other Lists, Pillar targets and Products (CR-06) — admin and KOL Manager */
  const editAction = () => (st.section === 'tiers' ? 'settings.tiers' : st.section === 'products' ? 'products.edit' : st.section === 'payments' ? 'settings.payments' : st.section === 'samples' ? 'shipment.settings' : st.section === 'opsmode' ? 'settings.ops' : 'settings.lists');
  const navBtn = ([k, l]) => `<button type="button" data-sec="${k}" class="${k === st.section ? 'on' : ''}">${esc(l)}</button>`;
  function go2(section) { st.section = section; st.tiers = null; st.targets = null; st.perf = null; st.pay = null; st.smp = null; render(); }

  /* ===================== CR-17 §4.1 — Operations mode (Admin): Payments · Shipments, Simple / Full · the data stays the same ===================== */
  function opsModeHTML() {
    const s = state(), O = K.ops;
    const row = kind => { const now = R.opsMode(s, kind);
      return `<div class="ops-row"><div class="ops-k"><b>${esc(O.kind[kind])}</b><span class="hint">${esc(O.hint[kind][now])}</span></div>` +
        `<div class="seg" role="group" aria-label="${esc(O.kind[kind])}">${R.OPS_MODES.map(m => `<button type="button" data-opsm="${kind}:${m}" class="${now === m ? 'on' : ''}" aria-pressed="${now === m}">${esc(O.mode[m])}</button>`).join('')}</div></div>`; };
    return `<div class="card"><div class="card-head"><h3>${esc(K.navOpsMode)}</h3></div><p class="hint" style="margin-top:0">${esc(O.lead)}</p>` +
      `<dl class="ops-def"><dt>${esc(O.mode.simple)}</dt><dd>${esc(O.simple)}</dd><dt>${esc(O.mode.full)}</dt><dd>${esc(O.full)}</dd></dl>` +
      row('payments') + row('shipments') + `<p class="hint">${esc(O.safe)}</p></div>`;
  }

  /* ===================== Data ===================== */
  function dataHTML() {
    const s = state(), mb = store.sizeChars() / 1024 / 1024, ok = store.status.canSave;
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>${esc(K.navData)}</h3></div>
        <p class="muted" style="margin:0 0 12px">${esc(K.storageLine)}</p>
        ${ok ? '' : `<div class="check err" style="margin-bottom:12px">✕ <span>${esc(C.banner.cannotSave)}</span></div>`}
        ${kv(K.lastBackup, s.local.last_backup_at ? R.fmtDateTime(s.local.last_backup_at) : K.never, s.local.last_backup_at ? '' : 'over')}
        ${kv(K.dataSize, K.sizeOf(mb.toFixed(2), S.QUOTA_MB))}
        ${kv(K.photos, KT.photos.available() ? K.photosLine(R.fmtNum(KT.photos.totals().n), (KT.photos.totals().bytes / 1048576).toFixed(2)) : C.profile.photoOff)}
        <div class="btns" style="margin-top:16px"><button type="button" class="btn primary" data-act="backup">${esc(K.backupNow)}</button>
          ${can('data.restore') ? `<button type="button" class="btn" data-act="restore">${esc(K.restore)}</button><button type="button" class="btn danger" data-act="reset">${esc(K.reset)}</button>` : ''}</div>
        ${KT.golive.beforeCopyHTML()}
      </div>
      <div class="card"><div class="card-head"><h3>${esc(C.issues.title)}</h3></div>${issuesHTML()}</div>`;
  }
  function issuesHTML() {
    const s = state(), I = C.issues, x = R.dataIssues(s), kol = d => ((R.kolById(s, d.kol_id) || {}).display_name || '');
    const dl = d => `<button type="button" class="link" data-deal="${esc(d.deal_id)}">${esc(d.deal_id)}</button> ${esc(kol(d))}`;
    const part = (title, items) => `<details class="sec" style="margin-bottom:8px"${items.length ? '' : ''}><summary><span>${esc(title)}</span><span class="chev">${U.ICON.chevron}</span></summary>` +
      (items.length ? `<ul class="issues">${items.join('')}</ul>` : `<div class="hint">${esc(I.none)}</div>`) + `</details>`;
    return `<p class="hint" style="margin-top:0">${esc(I.note)}</p>` +
      part(I.dup(x.dupLinks.length), x.dupLinks.map(g => `<li>${g.map(y => dl(y.deal)).join(' · ')}</li>`)) +
      part(I.tiktok(x.tiktok.length), x.tiktok.map(y => `<li>${dl(y.deal)} · ${esc(I.tiktokLine(R.dmy(y.post.post_date), R.dmy(y.tiktok)))}</li>`)) +
      part(I.swapped(x.swapped.length), x.swapped.map(y => `<li>${dl(y.deal)} · ${esc(I.swappedLine(R.dmy(y.date), R.dmy(y.swapped)))}</li>`)) +
      part(I.pillar(x.pillar.length), x.pillar.map(y => `<li>${dl(y.deal)} · <span class="muted">${esc(y.deal.remark)}</span></li>`));
  }

  /* ===================== Lists (inline) ===================== */
  function journeyHTML() {
    const s = state(), steps = R.stepsOf(s.lookups);
    return `<div class="card"><div class="card-head"><h3>${esc(K.navJourney)}</h3></div><p class="hint" style="margin-top:0">${esc(LS.journeyHint)}</p>
      <div class="tablewrap"><table class="tbl"><thead><tr><th class="num">${esc(LS.order)}</th><th>${esc(LS.status)}</th><th>${esc(LS.step)}</th><th>${esc(LS.label)}</th><th>${esc(LS.optional)}</th><th>${esc(LS.active)}</th><th></th></tr></thead><tbody>` +
      /* CR-11 §4.13 #6 — the steps the stage rules use (R.CORE_STEPS): 🔒 · the label can change · never deleted or turned off */
      steps.map(j => { const core = R.isCoreStep(j), locked = R.stepLocked(j) || core, used = R.stepUse(s, j.sub_status), why = core ? LS.coreStep : LS.locked;
        return `<tr data-step="${esc(j.sub_status)}"${core ? ' class="core"' : ''}><td class="num">${j.sort_order}</td><td>${stChip(j.status)}</td><td>${esc(j.sub_status)}${core ? ` <span class="corelock" title="${esc(LS.coreStep)}" aria-label="${esc(LS.coreStep)}">🔒</span>` : ''}</td>` +
          `<td style="max-width:none"><input data-s="label_th" value="${esc(j.label_th || '')}" aria-label="${esc(LS.label)}" style="min-width:160px"></td>` +
          `<td class="c"><input type="checkbox" data-s="is_optional"${j.is_optional ? ' checked' : ''}${locked ? ` disabled title="${esc(why)}"` : ''} aria-label="${esc(LS.optional)}"></td>` +
          `<td class="c"><input type="checkbox" data-s="active"${j.active !== false ? ' checked' : ''}${locked ? ` disabled title="${esc(why)}"` : ''} aria-label="${esc(LS.active)}"></td>` +
          `<td><button type="button" class="link" data-s="delete"${locked || used ? ` disabled title="${esc(locked ? why : LS.stepInUse(used))}"` : ''}>${esc(LS.del)}</button></td></tr>`; }).join('') +
      `</tbody></table></div></div>`;
  }
  function listHTML(key) {
    const s = state(), L = s.lookups, vals = L[key] || [], title = SECTIONS.find(x => x[0] === key)[1];
    return `<div class="card"><div class="card-head"><h3>${esc(title)}</h3>${can(editAction()) ? `<div class="btns"><button type="button" class="btn small" data-act="laddopen">${esc(LS.add)}</button></div>` : ''}</div>
      ${vals.map(v => { const used = R.listValueUse(s, key, v), off = R.isInactiveValue(L, key, v);
        return `<div class="lrow" data-v="${esc(v)}"><span class="grow" title="${esc(v)}">${esc(v)}</span><span class="muted small">${esc(used ? LS.usedBy(used) : LS.unused)}</span>
          <label class="tick"><input type="checkbox" data-l="active"${off ? '' : ' checked'}> ${esc(LS.active)}</label>
          <button type="button" class="link" data-l="delete"${used ? ` disabled title="${esc(LS.inUse(used))}"` : ''}>${esc(LS.del)}</button></div>`; }).join('') || `<div class="hint">${esc(key === 'cta_list' ? LS.ctaEmpty : C.common.none)}</div>`}
      <div class="checks" id="ls_checks" style="margin-top:8px"></div></div>`;
  }
  function tiersHTML() {
    if (!st.tiers) st.tiers = (state().lookups.tier_rules || []).map(t => ({ tier: t.tier, min_followers: String(t.min_followers) }));
    return `<div class="card"><div class="card-head"><h3>${esc(K.navTiers)}</h3></div><p class="hint" style="margin-top:0">${esc(LS.tierHint)}</p>
      ${st.tiers.map((t, i) => `<div class="lrow" data-tier="${i}"><input data-t="tier" value="${esc(t.tier)}" aria-label="${esc(LS.tierName)}" placeholder="${esc(LS.tierName)}">
        <input type="number" min="0" step="1" data-t="min_followers" value="${esc(t.min_followers)}" aria-label="${esc(LS.tierMin)}" placeholder="${esc(LS.tierMin)}">
        <button type="button" class="link" data-t="delete">${esc(LS.del)}</button></div>`).join('')}
      <div class="btns" style="margin-top:8px"><button type="button" class="btn small" data-t="add">${esc(LS.addTier)}</button></div>
      <div class="checks" id="ls_checks" style="margin-top:8px"></div></div>`;
  }
  /* tiers are saved as soon as the whole set is valid */
  function tiersCheck() {
    const res = R.validateTiers(st.tiers);
    $('ls_checks').innerHTML = checksHTML(res, '');
    if (!res.errs.length) {
      const next = st.tiers.map(t => ({ tier: R.trim(t.tier), min_followers: Number(t.min_followers) })).sort((a, b) => a.min_followers - b.min_followers);
      if (can('settings.tiers') && JSON.stringify(next) !== JSON.stringify(state().lookups.tier_rules)) { state().lookups.tier_rules = next; commit(LS.saved); }
    }
    return res;
  }
  /* ===================== KOL performance (CR-06 §4.4): grace days · minimum posts — saved as soon as both are valid ===================== */
  function perfHTML() {
    const L = state().lookups, PF = C.perf;
    if (!st.perf) st.perf = { ontime_grace_days: String(R.perfSettings(L).grace), reliability_min_posts: String(R.perfSettings(L).minPosts), metrics_checkpoints: R.metricsCheckpoints(L).join(', ') };
    const inp = (k, label, hint, text) => `<div class="field"><label for="pf_${k}">${esc(label)}</label><input ${text ? 'type="text" inputmode="numeric" autocomplete="off"' : 'type="number" min="0" step="1" inputmode="numeric"'} id="pf_${k}" data-pf2="${k}" value="${esc(st.perf[k])}"><div class="hint">${esc(hint)}</div></div>`;
    return `<div class="card"><div class="card-head"><h3>${esc(K.navPerf)}</h3></div><p class="hint" style="margin-top:0">${esc(PF.info.d(R.perfSettings(L).grace, R.perfSettings(L).minPosts))}</p>
      <div class="fields">${inp('ontime_grace_days', PF.grace, PF.graceHint)}${inp('reliability_min_posts', PF.minPosts, PF.minPostsHint)}${inp('metrics_checkpoints', PF.checkpoints, PF.checkpointsHint, true)}</div><div class="checks" id="ls_checks" style="margin-top:8px"></div></div>`;
  }
  function perfCheck() {
    const res = R.validatePerfSettings(st.perf);
    $('ls_checks').innerHTML = checksHTML(res, '');
    $('set_body').querySelectorAll('[data-pf2]').forEach(i => i.classList.toggle('invalid', res.errs.some(e => e.field === i.dataset.pf2)));
    if (!res.errs.length && can('settings.lists')) {
      /* CR-11 §4.12: checkpoints replace "stale after" (metrics_stale_days is kept as it was) */
      const L = state().lookups, g = Number(st.perf.ontime_grace_days), m = Number(st.perf.reliability_min_posts), cp = R.parseCheckpoints(st.perf.metrics_checkpoints).list;
      if (L.ontime_grace_days !== g || L.reliability_min_posts !== m || JSON.stringify(R.metricsCheckpoints(L)) !== JSON.stringify(cp)) { L.ontime_grace_days = g; L.reliability_min_posts = m; L.metrics_checkpoints = cp; commit(C.perf.saved); }
    }
    return res;
  }

  /* ===================== Samples (CR-10 §4.14): lead days · carriers · a tracking link per carrier — saved as soon as valid ===================== */
  function samplesHTML() {
    const L = state().lookups, S = R.sampleSettings(L), T = C.samples.settings, ro = can('settings.lists') ? '' : ' disabled';
    if (!st.smp) st.smp = { lead_days: String(S.lead_days), carriers: S.carriers.join('\n'), tracking_url: Object.assign({}, S.tracking_url) };
    const carriers = st.smp.carriers.split('\n').map(x => R.trim(x)).filter(Boolean);
    return `<div class="card"><div class="card-head"><h3>${esc(T.nav)}</h3></div><div class="fields">
        <div class="field"><label for="ss_lead">${esc(T.lead)}</label><input type="number" min="0" max="60" step="1" inputmode="numeric" id="ss_lead" data-ss="lead_days" value="${esc(st.smp.lead_days)}"${ro}><div class="hint">${esc(T.leadHint)}</div></div>
        <div class="field wide"><label for="ss_car">${esc(T.carriers)}</label><textarea id="ss_car" data-ss="carriers" rows="${Math.min(12, Math.max(6, carriers.length + 1))}"${ro}>${esc(st.smp.carriers)}</textarea><div class="hint">${esc(T.carriersHint)}</div></div>
        <div class="field wide"><label>${esc(T.tracking)}</label><div class="ss-trk">${carriers.map(c => `<label class="sm-trkrow"><span>${esc(c)}</span><input data-sst="${esc(c)}" value="${esc(st.smp.tracking_url[c] || '')}" placeholder="https://…{tracking}" autocomplete="off"${ro}></label>`).join('')}</div><div class="hint">${esc(T.trackingHint)}</div></div>
      </div><div class="checks" id="ls_checks" style="margin-top:8px"></div></div>`;
  }
  function samplesCheck() {
    const carriers = st.smp.carriers.split('\n').map(x => R.trim(x)).filter(Boolean), tracking = {};
    carriers.forEach(c => { if (R.trim(st.smp.tracking_url[c])) tracking[c] = R.trim(st.smp.tracking_url[c]); });
    const res = R.validateSampleSettings({ lead_days: st.smp.lead_days, tracking_url: tracking });
    $('ls_checks').innerHTML = checksHTML(res, '');
    if (!res.errs.length && can('settings.lists') && carriers.length) {
      const L = state().lookups, next = { lead_days: Number(st.smp.lead_days), carriers, tracking_url: tracking };
      if (JSON.stringify(L.sample_settings || {}) !== JSON.stringify(next)) { L.sample_settings = next; commit(C.samples.settings.saved); }
    }
    return res;
  }

  /* ===================== KOL types (CR-07 §4.6): the Type presets of KOL Master ===================== */
  function kolTypesHTML() {
    const s = state(), list = R.kolTypeList(s.lookups), counts = R.kolTypeCounts(s);
    return `<div class="card"><div class="card-head"><h3>${esc(K.navKolTypes)} <span class="muted">${R.fmtNum(list.length)}</span></h3>${can(editAction()) ? `<div class="btns"><button type="button" class="btn small" data-act="ktaddopen">${esc(KTY.add)}</button></div>` : ''}</div><p class="hint" style="margin-top:0">${esc(KTY.hint)}</p>
      <div class="tablewrap"><table class="tbl compact-sm kt-tbl"><thead><tr><th></th><th>${esc(KTY.colLabel)}</th><th>${esc(KTY.colAliases)}</th><th class="num">${esc(KTY.colKols)}</th><th>${esc(KTY.colActive)}</th><th></th></tr></thead><tbody>` +
      list.map((t, i) => { const n = counts.get(t.key) || 0;
        return `<tr data-kt="${esc(t.key)}"${t.active === false ? ' class="faded-row"' : ''}><td class="kt-move"><span class="kt-grip" title="${esc(KTY.drag)}" aria-hidden="true">⋮⋮</span>` +
          `<button type="button" class="icon-btn sm" data-ktmove="-1" aria-label="${esc(`${KTY.moveUp} · ${t.label}`)}"${i ? '' : ' disabled'}>↑</button><button type="button" class="icon-btn sm" data-ktmove="1" aria-label="${esc(`${KTY.moveDown} · ${t.label}`)}"${i < list.length - 1 ? '' : ' disabled'}>↓</button></td>` +
          `<td style="max-width:none"><input data-ktf="label" value="${esc(t.label)}" aria-label="${esc(`${KTY.colLabel} · ${t.label}`)}"></td>` +
          `<td style="max-width:none"><input data-ktf="aliases" value="${esc((t.aliases || []).join(', '))}" placeholder="${esc(KTY.aliasesPh)}" aria-label="${esc(`${KTY.colAliases} · ${t.label}`)}"></td>` +
          `<td class="num">${R.fmtNum(n)}</td><td class="c"><input type="checkbox" data-ktf="active"${t.active === false ? '' : ' checked'} aria-label="${esc(`${KTY.colActive} · ${t.label}`)}"></td>` +
          `<td><button type="button" class="link" data-ktdel${n ? ` disabled title="${esc(KTY.inUse(n))}"` : ''}>${esc(KTY.del)}</button></td></tr>`; }).join('') +
      `</tbody></table></div>
      <div class="checks" id="ls_checks" style="margin-top:8px"></div></div>`;
  }
  const ktList = () => state().lookups.kol_type_list;
  const renumber = list => list.forEach((t, i) => { t.sort_order = (i + 1) * 10; });
  function moveKolType(key, toIndex) {
    const list = R.kolTypeList(state().lookups), from = list.findIndex(t => t.key === key); if (from < 0 || toIndex < 0 || toIndex >= list.length || toIndex === from) return;
    const [t] = list.splice(from, 1); list.splice(toIndex, 0, t); renumber(list); commit(KTY.saved); render();
  }
  function kolTypeChange(t) {
    const key = t.closest('[data-kt]').dataset.kt, type = ktList().find(x => x.key === key); if (!type) return;
    if (t.dataset.ktf === 'active') { type.active = t.checked; commit(KTY.saved); render(); return; }
    const label = t.dataset.ktf === 'label' ? t.value : type.label, aliases = t.dataset.ktf === 'aliases' ? R.splitAliases(t.value) : type.aliases;
    const res = R.validateKolType(ktList(), label, aliases, key);
    $('ls_checks').innerHTML = checksHTML(res, ''); t.classList.toggle('invalid', res.errs.length > 0);
    if (res.errs.length) return;
    type.label = R.trim(label); type.aliases = aliases; commit(KTY.saved); render();
  }

  /* ===================== Payments (CR-08 §4.8): tax · bands · run day — and the Payee vault ===================== */
  function paymentsHTML() {
    const s = state(), S = R.paySettings(s.lookups), PS = C.pay.set, VT = C.vault, v = s.lookups.payee_vault, V = KT.vault;
    if (!st.pay) st.pay = { vat_rate: String(S.vat_rate), wht_threshold: String(S.wht_threshold), wht_rates: S.wht_rates.join(', '), default_wht_individual: String(S.default_wht_individual),
      default_wht_company: String(S.default_wht_company), band1: String(S.bands[0]), band2: String(S.bands[1]), run_weekday: String(S.run_weekday) };
    const inp = (k, label, hint) => `<div class="field"><label for="ps_${k}">${esc(label)}</label><input id="ps_${k}" data-ps="${k}" value="${esc(st.pay[k])}" inputmode="decimal" autocomplete="off">${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
    const rates = S.wht_rates.map(r => ({ value: String(r), label: `${r}%` }));
    const sel = (k, label, items) => `<div class="field"><label for="ps_${k}">${esc(label)}</label><select id="ps_${k}" data-ps="${k}">${U.optionsHTML(items, st.pay[k])}</select></div>`;
    const withDetails = (s.payee_profiles || []).filter(p => p.secure).length, waiting = (s.payee_profiles || []).filter(p => p.secure_ship).length;   // CR-16: 0 once schema 15 has moved them
    const status = !V.available() ? `<div class="check warn">! <span>${esc(C.payee.noCrypto)}</span></div>`
      : !v ? `<p style="margin:0"><b>${esc(VT.notSetUp)}</b></p>` : `<p style="margin:0"><b>${esc(VT.setUpOn(R.dmy(String(v.created_at || '').slice(0, 10)), R.changedByName(s, v.created_by)))}</b> · ${esc(VT.withDetails(withDetails))}</p>`;
    const unlocked = v && V.isUnlocked(v);
    const btns = !V.available() ? '' : [
      !v && can('vault.admin') ? `<button type="button" class="btn primary small" data-act="vsetup">${esc(VT.setUp)}</button>` : '',
      v && can('payee.unlock') ? (unlocked ? `<button type="button" class="btn small" data-act="vlock">${esc(VT.lock)}</button>` : `<button type="button" class="btn small" data-act="vunlock">${esc(VT.unlock)}</button>`) : '',
      v && can('vault.admin') ? `<button type="button" class="btn small" data-act="vchange">${esc(VT.change)}</button>` : '',
      v && can('vault.admin') ? `<button type="button" class="btn small danger" data-act="vreset">${esc(VT.reset)}</button>` : '',
      v && can('payee.import') ? `<button type="button" class="btn small" data-act="vimport">${esc(VT.importBtn)}</button>` : '',
      `<button type="button" class="btn small ghost" data-act="vtemplate">${esc(VT.template)}</button>`].join('');
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>${esc(PS.title)}</h3></div><p class="hint" style="margin-top:0">${esc(PS.accounting)}</p>${waiting ? `<div class="check warn">! <span>${esc(VT.shipWaiting(waiting))}</span></div>` : ''}
      <div class="fields">${inp('vat_rate', PS.vat)}${inp('wht_threshold', PS.threshold, PS.thresholdHint)}${inp('wht_rates', PS.rates, PS.ratesHint)}
        ${sel('default_wht_individual', PS.defInd, rates)}${sel('default_wht_company', PS.defCo, rates)}
        ${inp('band1', PS.band1)}${inp('band2', PS.band2, PS.bandsHint)}${sel('run_weekday', PS.weekday, C.pay.weekdays.map((d, i) => ({ value: String(i), label: d })))}</div>
      <div class="checks" id="ls_checks" style="margin-top:8px"></div></div>
      <div class="card"><div class="card-head"><h3>🔒 ${esc(VT.title)}</h3></div>${status}
        <p class="hint">${esc(C.payee.groupBankHint)}</p><div class="btns vault-btns">${btns}</div>
        ${v && !can('vault.admin') ? `<p class="hint">${esc(VT.onlyAdmin)}</p>` : ''}</div>`;
  }
  function payCheck() {
    const res = R.validatePaymentSettings(st.pay);
    $('ls_checks').innerHTML = checksHTML(res, '');
    $('set_body').querySelectorAll('[data-ps]').forEach(i => i.classList.toggle('invalid', res.errs.some(e => e.field === i.dataset.ps || (e.field === 'bands' && /^band/.test(i.dataset.ps)))));
    if (res.errs.length || !can('settings.payments')) return res;
    const L = state().lookups, before = JSON.stringify(R.paySettings(L));
    if (JSON.stringify(res.value) !== before) {
      const ratesChanged = JSON.stringify(res.value.wht_rates) !== JSON.stringify(R.paySettings(L).wht_rates);
      L.payment_settings = res.value; commit(C.pay.set.saved);
      if (ratesChanged) { st.pay = null; render(); }
    }
    return res;
  }
  /* CR-08 §4.4 — payee details from a CSV: each row is encrypted as soon as it is imported; the file is not kept */
  function openPayeeImport(opener) {
    if (!U.guard('payee.import')) return;
    const VT = C.vault, V = KT.vault; let plan = null;
    /* the file is read in memory only; closing the modal forgets it (CR-08 §6) */
    const forget = () => { plan = null; const f = $('pv_file'); if (f) f.value = ''; };
    U.createModal({ size: 'L', title: VT.importTitle, opener, isDirty: () => !!plan, onClose: forget, foot: [`<div class="checks" id="pv_checks"></div>`, U.cmButtons(VT.importOk, 'pv_ok', { attrs: ' disabled' })],
      body: `<div class="toolbar"><input type="file" id="pv_file" accept=".csv,text/csv" style="width:auto"><button type="button" class="btn small" id="pv_tpl">${esc(VT.template)}</button></div>
      <p class="hint">${esc(VT.importExplain)} ${esc(VT.importCols(R.PAYEE_CSV_COLS.join(', ')))}</p><div id="pv_prev"></div>` });
    $('pv_tpl').addEventListener('click', () => downloadCSV('payee_details_template.csv', R.PAYEE_CSV_COLS, [], true));
    $('pv_file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      plan = R.planPayeeImport(state(), R.parseCSV(await f.text()));
      if (plan.headerError) { $('pv_prev').innerHTML = `<div class="check err">✕ <span>${esc(plan.headerError)}</span></div>`; $('pv_ok').disabled = true; return; }
      /* CR-16 §4.2 — a KOL with a payee already: Add as another payee (payee_label) · Replace default · Skip */
      const st0 = state(), opt = (v, l, on) => `<option value="${v}"${on ? ' selected' : ''}>${esc(l)}</option>`;
      const action = r => { if (r.kind === 'error') return `<span class="muted">${esc(VT.actSkip)}</span>`;
        if (r.kind === 'new') return `<select data-pvact="${r.n}">${opt('new', VT.actNew)}${opt('skip', VT.actSkip)}</select>`;
        const def = R.payeeOfKol(st0, r.kol.kol_id); if (!def) return `<span>${esc(VT.actAdd)}</span>`;
        const another = !!r.label && R.trim(r.label).toLowerCase() !== R.trim(def.label).toLowerCase(), pick = another ? 'another' : r.has_details ? 'skip' : 'replace';
        return `<select data-pvact="${r.n}" aria-label="${esc(VT.colAction)}">${opt('another', VT.actAnother, pick === 'another')}${opt('replace', VT.actReplaceDefault(def.label || C.payee.primary), pick === 'replace')}${opt('skip', VT.actSkip, pick === 'skip')}</select>`; };
      $('pv_prev').innerHTML = `<div class="tablewrap" style="max-height:52vh"><table class="tbl compact-sm"><thead><tr><th class="num">${esc(VT.colRow)}</th><th>${esc(VT.colHandle)}</th><th>${esc(VT.colMatch)}</th><th>${esc(VT.colAction)}</th></tr></thead><tbody>` +
        plan.rows.map(r => `<tr><td class="num">${r.n}</td><td>@${esc(r.handle)}${r.label ? ` <span class="chip">${esc(r.label)}</span>` : ''}</td><td>${r.kind === 'error' ? `<span class="late">${esc(r.errs.join(' · '))}</span>` : r.kol ? esc(VT.matchKol(r.kol.display_name)) + (r.has_details ? ` <span class="muted small">(${esc(VT.hasDetails)})</span>` : '') : `<span class="muted">${esc(VT.noKol)}</span>`}</td><td>${action(r)}</td></tr>`).join('') + `</tbody></table></div>`;
      $('pv_ok').disabled = !plan.rows.some(r => r.kind !== 'error');
    });
    $('pv_ok').addEventListener('click', async () => {
      if (!plan || !U.guard('payee.import')) return;
      const vault = state().lookups.payee_vault, act = r => { const el = $('pv_prev').querySelector(`[data-pvact="${r.n}"]`); return r.kind === 'error' ? 'skip' : el ? el.value : 'add'; };
      const todo = plan.rows.filter(r => act(r) !== 'skip'), sum = { matched: 0, created: 0, skipped: plan.rows.length - todo.length };
      $('pv_ok').disabled = true;
      for (let i = 0; i < todo.length; i++) {
        const r = todo[i]; $('pv_ok').textContent = C.vault.importing(i + 1, todo.length);
        const secure = await V.encrypt(vault, r.details), s = state(), now = new Date().toISOString(), uid = U.userId();
        const how = act(r);
        let p = how === 'another' ? null : r.kol ? R.payeeOfKol(s, r.kol.kol_id) : r.payee;
        if (!p) {
          /* a new payee (the KOL's first = its default "Primary" · another = not the default, with its label made unique) */
          const first = !r.kol || !R.payeesOfKol(s, r.kol.kol_id).length;
          let label = R.trim(r.label) || (first ? C.payee.primary : VT.importLabel), k = 2;
          const taken = v => r.kol && R.validatePayeeLabel(s, r.kol.kol_id, v, null).length > 0;
          while (taken(label) && k < 100) label = `${(R.trim(r.label) || VT.importLabel).slice(0, R.PAYEE_LABEL_MAX - 4)} ${k++}`;
          p = R.blankPayee(s, { payee_id: U.store.newId('payee'), kol_id: r.kol ? r.kol.kol_id : null, account_handle: r.handle, payee_type: r.payee_type, label, is_default: first, user: uid, now }); s.payee_profiles.push(p);
        }
        const replaced = !!p.secure;
        Object.assign(p, { payee_type: r.payee_type, secure, bank_name: r.details.bank_name, account_last4: R.last4(r.details.account_no), docs_link: r.docs_link || p.docs_link,
          details_version: (p.details_version || 0) + 1, details_updated_at: now, details_updated_by: uid, updated_at: now, updated_by: uid });
        if (replaced && R.payeeHasPaid(s, p.payee_id)) Object.assign(p, { needs_verification: true, verified_at: null, verified_by: null });
        s.deal_events.push({ event_id: U.store.newEventId(), deal_id: null, payee_id: p.payee_id, type: 'payee_details_changed', from: null, to: null, changed_at: now, changed_by: uid, note: null });
        r.details = null;
        if (r.kol) sum.matched++; else sum.created++;
      }
      forget(); U.closeModal(); commit(C.vault.importDone(sum.matched, sum.created, sum.skipped)); render();
    });
  }

  /* ===================== Products (CR-06 §4.3): the catalog of TR codes ===================== */
  function productsHTML() {
    const n = (state().products || []).length;
    return `<div class="card"><div class="card-head"><h3>${esc(K.navProducts)} <span class="muted">${R.fmtNum(n)}</span></h3><div class="btns"><button type="button" class="btn small" data-act="pimport">${esc(P.importCsv)}</button>` +
        `<button type="button" class="btn small primary" data-act="pnew">${esc(P.newProduct)}</button></div></div>
      <p class="hint" style="margin-top:0">${esc(P.hint)}</p>
      <div class="checks" id="ls_checks" style="margin:8px 0"></div>
      <input type="search" class="pr-search" data-psearch value="${esc(st.pq)}" placeholder="${esc(P.search)}" aria-label="${esc(P.search)}">
      <div class="tablewrap" style="margin-top:8px;max-height:calc(100vh - 360px)"><table class="tbl compact-sm pr-tbl"><thead><tr><th>${esc(P.colCode)}</th><th>${esc(P.colName)}</th><th>${esc(P.colVariant)}</th><th class="num">${esc(P.colUsed)}</th><th>${esc(P.colActive)}</th><th></th></tr></thead>
        <tbody id="pr_body">${productRowsHTML()}</tbody></table></div></div>`;
  }
  function productRowsHTML() {
    const s = state(), q = R.trim(st.pq).toLowerCase();
    const list = (s.products || []).filter(p => !q || R.productLabel(p).toLowerCase().includes(q)).sort((a, b) => String(a.tr_code).localeCompare(String(b.tr_code)));
    if (!list.length) return `<tr><td colspan="6" class="muted">${esc(q ? P.noMatch : P.empty)}</td></tr>`;
    return list.map(p => { const u = R.productUse(s, p.tr_code), used = u.campaigns || u.deals;
      return `<tr data-pc="${esc(p.tr_code)}"${p.active === false ? ' class="faded-row"' : ''}><td title="${esc(P.codeFixed)}"><b>${esc(p.tr_code)}</b></td>` +
        `<td style="max-width:none"><input data-pf="product_name" value="${esc(p.product_name)}" aria-label="${esc(`${P.colName} ${p.tr_code}`)}"></td>` +
        `<td style="max-width:none"><input data-pf="variant" value="${esc(p.variant || '')}" aria-label="${esc(`${P.colVariant} ${p.tr_code}`)}"></td>` +
        `<td class="num">${u.campaigns ? esc(P.usedIn(u.campaigns)) : `<span class="muted">${esc(P.unused)}</span>`}</td>` +
        `<td class="c"><input type="checkbox" data-pf="active"${p.active === false ? '' : ' checked'} aria-label="${esc(`${P.colActive} ${p.tr_code}`)}"></td>` +
        `<td><button type="button" class="link" data-pdel${used ? ` disabled title="${esc(P.inUse(u.campaigns, u.deals))}"` : ''}>${esc(P.del)}</button></td></tr>`; }).join('');
  }
  function productChange(t) {
    const tr = t.closest('[data-pc]'), p = R.productByCode(state(), tr.dataset.pc); if (!p) return;
    if (t.dataset.pf === 'active') { p.active = t.checked; tr.classList.toggle('faded-row', !t.checked); commit(P.saved); return; }
    const v = R.trim(t.value);
    if (t.dataset.pf === 'product_name' && !v) { $('ls_checks').innerHTML = checksHTML({ errs: [{ msg: C.msg.productNameRequired }] }, ''); t.value = p.product_name; return; }
    p[t.dataset.pf] = v || null; $('ls_checks').innerHTML = ''; commit(P.saved);
  }
  /* Import CSV (tr_code, product_name, variant): preview new / update name / no change / duplicate / error, then apply */
  function openProductImport(opener) {
    if (!U.guard('products.edit')) return;
    let plan = null;
    U.createModal({ size: 'L', title: P.importTitle, opener, isDirty: () => !!plan, foot: ['', U.cmButtons(P.importApply, 'pi_ok', { attrs: ' disabled' })],
      body: `<div class="toolbar"><input type="file" id="pi_file" accept=".csv,text/csv" style="width:auto"><button type="button" class="btn small" id="pi_sample">${esc(P.importSample)}</button></div>
      <p class="hint">${esc(P.importCols(R.PRODUCT_IMPORT_COLS.join(', ')))}</p><div id="pi_prev"></div>` });
    const KIND_CLS = { new: 'done', update: 'warn', same: 'muted', duplicate: 'muted', error: 'cancel' };
    const show = () => {
      if (plan.headerError) { $('pi_prev').innerHTML = checksHTML({ errs: [{ msg: plan.headerError }] }, ''); $('pi_ok').disabled = true; return; }
      const c = R.importCounts(plan);
      $('pi_prev').innerHTML = plan.rows.length ? `<div class="check info">i <span>${esc(P.importSummary(c))}</span></div>` +
        `<div class="tablewrap" style="max-height:52vh;margin-top:8px"><table class="tbl compact-sm"><thead><tr><th>${esc(P.importRow)}</th><th></th><th>${esc(P.colCode)}</th><th>${esc(P.colName)}</th><th>${esc(P.colVariant)}</th><th></th></tr></thead><tbody>` +
        plan.rows.map(r => `<tr><td>${r.n}</td><td><span class="st ${KIND_CLS[r.kind]}">${esc(P.importKind[r.kind])}</span></td><td>${esc(r.tr_code)}</td><td>${esc(r.product_name)}</td><td>${esc(r.variant || '')}</td>` +
          `<td class="${r.kind === 'error' ? 'late' : 'muted'}" title="${esc(r.msg || '')}">${esc(r.msg || '')}</td></tr>`).join('') + `</tbody></table></div>`
        : `<div class="hint">${esc(P.importNoRows)}</div>`;
      $('pi_ok').disabled = !(c.new + c.update);
    };
    $('pi_sample').addEventListener('click', () => downloadCSV('products_sample.csv', R.PRODUCT_IMPORT_SAMPLE[0], R.PRODUCT_IMPORT_SAMPLE.slice(1)));
    $('pi_file').addEventListener('change', async e => {
      const f = e.target.files[0]; plan = null; $('pi_ok').disabled = true; $('pi_prev').innerHTML = ''; if (!f) return;
      plan = R.planProductImport(state(), R.parseCSV(await U.readText(f))); show();
    });
    $('pi_ok').addEventListener('click', () => {
      if (!plan || plan.headerError) return;
      const out = R.applyProductImport(state(), plan);
      state().products = out.products; U.closeModal(); commit(P.importDone(out.counts)); render();
    });
  }

  function bodyChange(e) {
    if (!can(editAction())) return;
    const t = e.target, L = state().lookups;
    if (t.dataset.pf && t.closest('[data-pc]')) { productChange(t); return; }
    if (t.dataset.ktf && t.closest('[data-kt]')) { kolTypeChange(t); return; }
    if (t.dataset.ps) { st.pay[t.dataset.ps] = t.value; payCheck(); return; }
    if (t.dataset.pf2) { st.perf[t.dataset.pf2] = t.value; perfCheck(); return; }
    if (t.dataset.ss === 'carriers' && st.smp) { st.smp.carriers = t.value; samplesCheck(); render(); return; }   // the tracking fields follow the list
    const row = t.closest('[data-step]');
    if (row && t.dataset.s) {
      const step = L.journey_steps.find(j => j.sub_status === row.dataset.step);
      if (t.dataset.s === 'label_th') step.label_th = R.trim(t.value) || step.sub_status;
      const fixed = R.stepLocked(step) || R.isCoreStep(step);   // CR-11 §4.13 #6: never off, never optional
      if (t.dataset.s === 'is_optional' && !fixed) step.is_optional = t.checked;
      if (t.dataset.s === 'active' && !fixed) step.active = t.checked;
      commit(LS.saved); return;
    }
    const lr = t.closest('[data-v]');
    if (lr && t.dataset.l === 'active') {
      const key = st.section, v = lr.dataset.v; L.inactive_values = L.inactive_values || {};
      const off = L.inactive_values[key] || [];
      L.inactive_values[key] = t.checked ? off.filter(x => x !== v) : off.concat([v]);
      commit(LS.saved); render(); return;
    }
    const tr = t.closest('[data-tier]');
    if (tr && t.dataset.t) { st.tiers[+tr.dataset.tier][t.dataset.t] = t.value; tiersCheck(); }
  }
  function bodyClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (KT.golive.settingsClick(e, () => render())) return;   // CR-11 §4.7
    if (b.dataset.deal) { go('deals', { deal: b.dataset.deal }); return; }
    const act = b.dataset.act;
    if (act === 'backup') { doBackup(); return; }
    const om = e.target.closest('[data-opsm]');
    if (om) { if (!U.guard('settings.ops')) return; const [kind, mode] = om.dataset.opsm.split(':'); if (R.opsMode(state(), kind) === mode) return; R.setOpsMode(state(), kind, mode); commit(K.ops.saved(K.ops.kind[kind], K.ops.mode[mode])); render(); return; }
    if (act === 'restore') { openRestore(); return; }
    /* CR-08 — the Payee vault (each action asks for its own permission) */
    if (act === 'vtemplate') { downloadCSV('payee_details_template.csv', R.PAYEE_CSV_COLS, [], true); return; }
    if (act === 'vunlock') { KT.payee.unlockDialog(() => render()); return; }
    if (act === 'vlock') { KT.vault.lock(); toast(C.vault.locked); render(); return; }
    if (act === 'vsetup') { KT.payee.setupDialog(() => render(), b); return; }
    if (act === 'vchange') { KT.payee.changeDialog(() => render()); return; }
    if (act === 'vreset') { KT.payee.resetDialog(() => render()); return; }
    if (act === 'vimport') { openPayeeImport(b); return; }
    if (act === 'reset') { openReset(); return; }
    if (!can(editAction())) return;
    if (act === 'pnew') { U.openNewProduct('', null, { created: code => { render(); flashRow(`[data-pc="${CSS.escape(code)}"]`); U.toast(P.added(code)); } }); return; }
    if (act === 'ktaddopen') { openAddKolType(b); return; }
    if (act === 'laddopen') { openAddListValue(b); return; }
    if (b.dataset.ktmove) { const key = b.closest('[data-kt]').dataset.kt, list = R.kolTypeList(state().lookups); moveKolType(key, list.findIndex(t => t.key === key) + Number(b.dataset.ktmove)); return; }
    if (b.dataset.ktdel != null) {
      const key = b.closest('[data-kt]').dataset.kt, s = state(), t = ktList().find(x => x.key === key); if (!t || R.kolTypeUse(s, key)) return;
      s.lookups.kol_type_list = ktList().filter(x => x.key !== key); commit(KTY.deleted(t.label)); render(); return;
    }
    if (act === 'pimport') { openProductImport(b); return; }
    if (b.dataset.pdel != null) {
      const code = b.closest('[data-pc]').dataset.pc, s = state(); if (!R.canDeleteProduct(s, code)) return;
      s.products = s.products.filter(p => !R.sameCode(p.tr_code, code)); commit(P.deleted(code)); render(); return;
    }
    const L = state().lookups;
    if (b.dataset.s === 'delete') { const sub = b.closest('[data-step]').dataset.step, st0 = R.stepOf(L, sub); if (st0 && (R.stepLocked(st0) || R.isCoreStep(st0))) return; L.journey_steps = L.journey_steps.filter(j => j.sub_status !== sub); commit(LS.saved); render(); return; }
    if (b.dataset.l === 'delete') { const key = st.section, v = b.closest('[data-v]').dataset.v; L[key] = (L[key] || []).filter(x => x !== v);
      if (L.inactive_values && L.inactive_values[key]) L.inactive_values[key] = L.inactive_values[key].filter(x => x !== v); commit(LS.saved); render(); return; }
    if (b.dataset.t === 'delete') { st.tiers.splice(+b.closest('[data-tier]').dataset.tier, 1); $('set_body').innerHTML = tiersHTML(); tiersCheck(); return; }
    if (b.dataset.t === 'add') { st.tiers.push({ tier: '', min_followers: '' }); $('set_body').innerHTML = tiersHTML(); tiersCheck(); }
  }
  /* ===================== CR-11 §4.3 — + Add in Settings: a create modal (S) ===================== */
  /* a value of Pillar · CTA · Platform (Settings › Lists) */
  function openAddListValue(opener) {
    if (!U.guard(editAction())) return;
    const key = st.section, title = SECTIONS.find(x => x[0] === key)[1];
    U.createModal({ size: 'S', title: LS.addTitle(title), opener, foot: [`<div class="checks" id="la_checks"></div>`, U.cmButtons(LS.addOk, 'la_ok')],
      body: `<div class="field"><label for="la_v">${esc(LS.value)} <span class="req">*</span></label><input id="la_v" placeholder="${esc(LS.addPh)}" autocomplete="off"></div>` });
    const go2 = () => {
      const v = $('la_v').value, res = R.validateListValue(state(), key, v);
      $('la_checks').innerHTML = checksHTML(res, ''); $('la_v').classList.toggle('invalid', res.errs.length > 0);
      if (res.errs.length || !U.guard(editAction())) return;
      const L = state().lookups; L[key] = (L[key] || []).concat([R.trim(v)]); U.closeModal(); commit(LS.added(R.trim(v))); render(); flashRow(`[data-v="${CSS.escape(R.trim(v))}"]`);
    };
    $('la_ok').addEventListener('click', go2);
    $('la_v').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  }
  /* a KOL type preset: label + aliases */
  function openAddKolType(opener) {
    if (!U.guard(editAction())) return;
    U.createModal({ size: 'S', title: KTY.addTitle, opener, foot: [`<div class="checks" id="kt_checks"></div>`, U.cmButtons(KTY.addOk, 'kt_ok')],
      body: `<div class="fields one"><div class="field"><label for="kt_label">${esc(KTY.colLabel)} <span class="req">*</span></label><input id="kt_label" placeholder="${esc(KTY.addPh)}" autocomplete="off"></div>` +
        `<div class="field"><label for="kt_aliases">${esc(KTY.colAliases)}</label><input id="kt_aliases" placeholder="${esc(KTY.aliasesPh)}" autocomplete="off"></div></div>` });
    $('kt_ok').addEventListener('click', () => {
      const label = $('kt_label').value, aliases = R.splitAliases($('kt_aliases').value), res = R.validateKolType(ktList(), label, aliases, null);
      $('kt_checks').innerHTML = checksHTML(res, ''); $('kt_label').classList.toggle('invalid', res.errs.some(x => x.field === 'label'));
      if (res.errs.length || !U.guard(editAction())) return;
      const list = ktList(), t = { key: R.kolTypeKeyFor(label, list), label: R.trim(label), aliases, active: true, sort_order: Math.max(0, ...list.map(x => x.sort_order || 0)) + 10 };
      list.push(t); U.closeModal(); commit(KTY.added(t.label)); render(); flashRow(`[data-kt="${CSS.escape(t.key)}"]`);
    });
  }
  /* the new row lit up (5 s) */
  function flashRow(sel) { setTimeout(() => { const el = $('set_body').querySelector(sel); if (!el) return; el.classList.add('flash'); el.scrollIntoView({ block: 'nearest' }); setTimeout(() => el.classList.remove('flash'), 5000); }, 50); }

  function reset() { st.tiers = null; st.targets = null; }
  return { render, reset };
})();
