/* app.js — the page shell (CR-04 §4.1): side menu (pages · user · ◐ · ⋯), mobile top bar + menu drawer, routing and start-up.
   CR-06 §4.9: ≥ 1280px the menu is open or a 64px rail as the person chose · 768–1279px always a rail whose » opens the menu over
   the content · < 768px the top bar ☰ · the content area tells the screens its width (data-cw on <main>, event kt:contentresize).
   The hash keeps the page and the open record: #deals/D000044 · #kols/K0011 · #campaigns/CH-P1.
   Screens keep their own keys (overview, kol, campaign …); C.tabs maps each key to its route, and the old routes
   (#overview, #kol, #campaign) are rewritten to the new ones. */
(function () {
  'use strict';
  const { C, $, esc, store, toast, renderBanners, closeDrawer, drawerOwner, doBackup, openRestore, exportAll, pref, ICON } = KT.ui;
  const shell = $('shell');
  const mobile = () => matchMedia('(max-width:767px)').matches;

  /* ===================== theme (per-viewer convenience) ===================== */
  function applyTheme(t) {
    const r = document.documentElement;
    if (t === 'dark') r.dataset.theme = 'dark'; else delete r.dataset.theme;
    const label = t === 'dark' ? C.app.lightMode : C.app.darkMode;
    $('themeBtn').querySelector('.lb').textContent = label;
    $('themeBtn').setAttribute('aria-label', label);
    navTips();
  }
  $('themeBtn').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(t); pref.set('theme', t);
    if (current === 'overview') showTab('overview');   // chart colours come from the theme
  });

  /* ===================== ⋯ menu ===================== */
  const renderMore = () => {
    $('moreList').innerHTML = `<button type="button" class="mi" data-m="backup">${esc(C.app.backup)}</button>` +
      (KT.ui.can('data.restore') ? `<button type="button" class="mi" data-m="restore">${esc(C.app.restore)}</button>` : '') +
      `<button type="button" class="mi" data-m="export">${esc(C.app.exportAll)}</button>`;
  };
  $('moreBtn').querySelector('.lb').textContent = C.app.more;
  $('moreList').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    $('moreMenu').open = false; closeNav();
    if (b.dataset.m === 'backup') doBackup();
    if (b.dataset.m === 'restore') openRestore();
    if (b.dataset.m === 'export') exportAll();
  });

  /* ===================== current user card · Switch user (CR-04 §4.4, no passwords) ===================== */
  const RK = C.roles;
  function renderUser() {
    const s = KT.ui.state(), u = KT.ui.me() || {}, others = (s.users || []).filter(x => x.active !== false);
    const as = KT.ui.viewingAs(), role = as || u.role;
    $('userCard').innerHTML = `<details class="menu sn-more" id="userMenu"><summary class="sn-item sn-user" aria-label="${esc(RK.switchUser)}">` +
      `<span class="ic"><span class="av sm">${esc(KT.ui.initials(u.display_name))}</span></span><span class="lb"><span class="un" title="${esc(as ? RK.viewingAsCard(u.display_name, RK.role[as]) : u.display_name || '')}">${esc(as ? RK.viewingAsCard(u.display_name, RK.role[as]) : u.display_name || '')}</span><span class="rchip ${esc(role || '')}">${esc(RK.role[role] || '')}</span></span></summary>` +
      `<div class="menu-list up" id="userList"><div class="mh">${esc(RK.switchUser)}</div>` +
      others.map(x => `<button type="button" class="mi${x.user_id === u.user_id ? ' on' : ''}" data-user="${esc(x.user_id)}"><span class="av sm">${esc(KT.ui.initials(x.display_name))}</span><span class="grow">${esc(x.display_name)}</span><span class="muted small">${esc(RK.role[x.role] || '')}</span></button>`).join('') +
      /* CR-05 §4.2: only for a real admin (still there while viewing as another role, to come back) */
      (u.role === 'admin' ? `<div class="mh sep">${esc(RK.viewAsRole)}</div>` + KT.ui.R.ROLES.map(r => `<button type="button" class="mi${r === role ? ' on' : ''}" data-viewas="${r}"><span class="rchip ${r}">${esc(RK.role[r])}</span></button>`).join('') : '') +
      `</div></details>`;
    /* the bar above the content while an admin views as another role */
    $('viewAs').classList.toggle('hidden', !as);
    $('viewAs').innerHTML = as ? `<span>${esc(RK.viewingAs(RK.role[as]))}</span><button type="button" class="btn small" data-viewas="admin">${esc(RK.backTo(RK.role.admin))}</button>` : '';
  }
  async function setViewAs(role) {
    if ((KT.ui.me() || {}).role !== 'admin') return;
    if (drawerOwner() && !(await KT.ui.requestCloseDrawer())) return;
    KT.ui.roleOverride.set(role === 'admin' ? null : role);
    if (current && !KT.ui.canSeeTab(current)) location.hash = C.tabs[0].route;
    showTab(current, parseHash().id);
  }
  $('viewAs').addEventListener('click', e => { if (e.target.closest('[data-viewas]')) setViewAs('admin'); });
  /* CR-08 §4.4 — while payee details are unlocked a bar says so, with Lock */
  const vaultBar = document.createElement('div');
  vaultBar.id = 'vaultBar'; vaultBar.className = 'vaultbar hidden'; vaultBar.setAttribute('role', 'status');
  $('viewAs').insertAdjacentElement('afterend', vaultBar);
  const drawVaultBar = on => { vaultBar.classList.toggle('hidden', !on); vaultBar.innerHTML = on ? `<span>🔓 ${esc(C.vault.unlocked)}</span><button type="button" class="btn small" data-vlock>${esc(C.vault.lock)}</button>` : ''; };
  vaultBar.addEventListener('click', e => { if (e.target.closest('[data-vlock]')) { KT.vault.lock(); toast(C.vault.locked); } });
  KT.vault.onChange(drawVaultBar);
  $('userCard').addEventListener('click', async e => {
    const va = e.target.closest('[data-viewas]'); if (va) { $('userMenu').open = false; closeNav(); setViewAs(va.dataset.viewas); return; }
    const b = e.target.closest('[data-user]'); if (!b) return;
    $('userMenu').open = false; closeNav();
    const s = KT.ui.state(), u = KT.ui.R.userById(s, b.dataset.user);
    if (!u || u.user_id === (KT.ui.me() || {}).user_id) return;
    /* the open drawer was drawn for the previous person */
    if (drawerOwner() && !(await KT.ui.requestCloseDrawer())) return;
    s.meta = Object.assign({}, s.meta, { current_user_id: u.user_id });
    KT.vault.lock();   // CR-08 §4.4: the next person unlocks for themselves
    KT.ui.roleOverride.set(null);   // a View as role belongs to the admin who chose it
    KT.ui.commit(RK.switched(u.display_name));
    if (u.role === 'accounting') { KT.ui.go('payments', { tab: 'accounting' }); return; }   // CR-09 §4.16: the accounts team starts on Accounting
    showTab(current, parseHash().id);
  });

  /* ===================== side menu: open / rail / over the content (CR-06 §4.9) · drawer (mobile) ===================== */
  const wideMQ = matchMedia('(min-width:1280px)'), mobileMQ = matchMedia('(max-width:767px)');
  const railAuto = () => !mobileMQ.matches && !wideMQ.matches;
  const over = () => shell.classList.contains('navover');
  /* tooltips only while the labels are hidden (rail) */
  function navTips() {
    const off = !shell.classList.contains('collapsed') || over() || mobile();
    shell.querySelectorAll('.sidenav .sn-item').forEach(b => { const l = b.querySelector('.lb'); if (off) b.removeAttribute('title'); else b.title = l ? l.textContent : ''; });
    const shut = shell.classList.contains('collapsed') && !over();
    $('navCollapse').title = shut ? C.app.expandMenu : C.app.collapseMenu; $('navCollapse').setAttribute('aria-label', $('navCollapse').title);
    $('navCollapse').setAttribute('aria-expanded', String(!shut));
  }
  /* the person's choice counts from 1280px · below that the rail is automatic */
  function applyNavMode() {
    closeNav();
    shell.classList.toggle('rail-auto', railAuto());
    shell.classList.toggle('collapsed', railAuto() || (wideMQ.matches && pref.get('navcollapsed', '0') === '1'));
    navTips();
  }
  function setCollapsed(on) { shell.classList.toggle('collapsed', on); pref.set('navcollapsed', on ? '1' : '0'); navTips(); }
  function openOver() { shell.classList.add('navover'); $('navOverlay').classList.remove('hidden'); $('navOverlay').classList.add('clear'); navTips(); const a = shell.querySelector('.sn-item.active'); if (a) a.focus(); }
  $('navCollapse').addEventListener('click', () => { if (railAuto()) { if (over()) closeNav(); else openOver(); } else setCollapsed(!shell.classList.contains('collapsed')); });
  function openNav() { shell.classList.add('navopen'); $('navOverlay').classList.remove('hidden'); const a = shell.querySelector('.sn-item.active'); if (a) a.focus(); }
  /* closes the mobile drawer and the menu opened over the content */
  function closeNav() { const was = over(); shell.classList.remove('navopen', 'navover'); $('navOverlay').classList.add('hidden'); $('navOverlay').classList.remove('clear'); if (was) navTips(); }
  $('navOpen').addEventListener('click', openNav);
  $('navOverlay').addEventListener('click', closeNav);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (shell.classList.contains('navopen') || over())) closeNav(); });
  mobileMQ.addEventListener('change', applyNavMode);
  wideMQ.addEventListener('change', applyNavMode);
  /* the content area's own width (not the window's): breakpoints for the screens + one event after the menu has finished moving */
  const appMain = document.querySelector('.app-main'), mainEl = document.querySelector('main');
  const cwOf = w => (w >= 1200 ? 'xl' : w >= 900 ? 'l' : w >= 600 ? 'm' : 's');
  let lastW = 0, cwT = null;
  function applyWidth(w) {
    mainEl.dataset.cw = cwOf(w);
    const root = document.documentElement;
    root.style.setProperty('--content-w', w + 'px');
    /* a drawer that would leave less than 320px of the page fills the content area */
    root.classList.toggle('drawer-full', w < 560 + 320); root.classList.toggle('drawer-full-wide', w < 880 + 320);
    clearTimeout(cwT); cwT = setTimeout(() => document.dispatchEvent(new CustomEvent('kt:contentresize', { detail: { width: w } })), 150);
  }
  /* the classes change the layout, so they are set in the next frame (not inside the observer's own step) */
  new ResizeObserver(entries => {
    const w = Math.round(entries[0].contentRect.width); if (!w || w === lastW) return; lastW = w;
    requestAnimationFrame(() => applyWidth(w));
  }).observe(appMain);
  applyWidth(Math.round(appMain.getBoundingClientRect().width) || lastW);

  /* ===================== pages + hash ===================== */
  let current = null;
  const tabOf = key => C.tabs.find(t => t.key === key);
  /* a route (or an old key) → the screen key; old routes are rewritten in place */
  function parseHash() {
    /* CR-13 §4.4 — a query (#deals?tab=needs_action) goes to the screen once as link params and leaves the address */
    const raw = location.hash.slice(1), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi);
    const [seg, ...rest] = path.split('/'), id = rest.join('/') || null;
    const byRoute = C.tabs.find(t => t.route === seg), byKey = !byRoute && C.tabs.find(t => t.key === seg), hit = byRoute || byKey;
    if (hit && qi >= 0) KT.ui.linkParams(hit.key, Object.fromEntries(new URLSearchParams(raw.slice(qi + 1))));
    if (byKey || (hit && qi >= 0)) history.replaceState(null, '', '#' + [hit.route].concat(rest).join('/'));
    return { tab: (hit || {}).key, id };
  }
  const visibleTabs = () => C.tabs.filter(t => !KT.ui.canSeeTab || KT.ui.canSeeTab(t.key));
  function renderNav() {
    renderUser(); renderMore();
    $('nav').innerHTML = visibleTabs().map(t => `<button type="button" class="sn-item${t.key === current ? ' active' : ''}" data-tab="${t.key}"${t.key === current ? ' aria-current="page"' : ''}>` +
      `<span class="ic">${ICON.nav[t.icon] || ''}</span><span class="lb">${esc(t.label)}</span></button>`).join('');
    navTips();
  }
  function showTab(key, id) {
    if (!KT.screens[key]) key = C.tabs[0].key;
    const prev = current; current = key;
    if (prev !== key && drawerOwner()) KT.ui.suspendDrawer();
    renderNav();
    $('topTitle').textContent = (tabOf(key) || {}).label || '';
    document.title = `${(tabOf(key) || {}).label || ''} · ${C.app.title}`;
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + key));
    KT.screens[key].render(id || null);
  }
  $('nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    closeNav();
    if (current === b.dataset.tab) { if (drawerOwner()) KT.ui.requestCloseDrawer(); }
    else location.hash = tabOf(b.dataset.tab).route;
  });
  window.addEventListener('hashchange', () => { const h = parseHash(); showTab(h.tab, h.id); });
  KT.ui.currentTab = () => current;
  KT.ui.refresh = () => showTab(current);
  KT.ui.renderNav = renderNav;
  /* after Restore / Reset every screen's selection may point at records that no longer exist */
  KT.ui.afterDataReplaced = msg => {
    KT.vault.lock();
    if (drawerOwner()) closeDrawer();
    Object.values(KT.screens).forEach(s => { if (s.reset) s.reset(); });
    KT.ui.setHash(current); renderBanners(); showTab(current); toast(msg);
  };

  /* ===================== start ===================== */
  $('brand').textContent = C.app.title;
  $('navOpen').setAttribute('aria-label', C.app.openMenu); $('navOpen').title = C.app.openMenu;
  $('sidenav').setAttribute('aria-label', C.app.mainMenu);
  applyNavMode();
  applyTheme(pref.get('theme', 'light'));
  renderBanners();
  const h = parseHash();
  if (!h.tab && (KT.ui.me() || {}).role === 'accounting') { history.replaceState(null, '', '#payments/accounting'); Object.assign(h, { tab: 'payments', id: 'accounting' }); }
  if (!h.tab) history.replaceState(null, '', '#' + C.tabs[0].route);
  showTab(h.tab, h.id);
  if (store.status.source === 'seed' && !store.status.corrupt) toast(C.banner.firstLoad);
})();
