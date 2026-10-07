/* rules-golive.js — CR-11 R3: data that came from the old files (Imported) · the schema 12 upgrade · Settings › Go-live clean-up
   (+ Match with PR file) · Dashboard › Operations To do / Data health · Payments › To pay Hold / Release. Pure functions.
   Adds to KT.rules (load after rules-samples.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { isBlank, trim } = R;

  /* ===================== §4.6 — Imported ===================== */
  /* a deal from the old files (every deal of the seed) · its posts and shipments count with it */
  const isImported = d => !!d && Array.isArray(d.legacy_job_ids) && d.legacy_job_ids.length > 0;
  const isClosedDeal = d => !!d && (d.status === 'Complete' || d.status === 'Cancel');
  /* imported and closed: what it lacks is shown as "—", never as a warning, and is not counted anywhere */
  const isImportedClosed = d => isImported(d) && isClosedDeal(d);
  /* a shipment from the old files (or marked by the clean-up) that is Delivered: read only · empty fields are "—", not a warning */
  const isLegacyDelivered = sh => !!sh && sh.source === 'legacy' && sh.status === 'delivered';
  const goLive = L => (L && L.go_live) || { date: null };
  const goLiveDate = L => goLive(L).date || null;
  /* a post from before go-live − 30 days with no numbers: Not tracked (§4.12 · nobody collects them backwards) */
  const notTracked = (post, L) => { const g = goLiveDate(L); return !!g && R.isISODate(post.post_date) && post.post_date < R.addDays(g, -30) && !R.METRICS.some(k => post[k] != null && post[k] !== ''); };

  /* ===================== schema 11 → 12 ===================== */
  /* a Phase label with exactly one pillar word → that pillar ("Launch & Awareness" → Awareness · "Awareness & Consideration" → none) */
  function pillarFromLabel(label, pillars) {
    const words = String(label || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hit = (pillars || R.PILLARS).filter(p => words.includes(String(p).toLowerCase()));
    return hit.length === 1 ? hit[0] : null;
  }
  /* §3 — once, on load: go_live = the day it runs · shipments: purpose review + their deal's Campaign · Phase default pillar · Campaign default term ·
     D+7 metrics · pick lists — the deals are not touched */
  function migrateV12(obj, today) {
    const L = obj.lookups;
    if (!L.go_live) L.go_live = { date: today, completed_at: null, completed_by: null };
    const campOf = new Map((obj.deals || []).map(d => [d.deal_id, d.campaign_id]));
    (obj.sample_shipments || []).forEach(sh => {
      if (sh.purpose === undefined) sh.purpose = 'review';
      if (sh.campaign_id === undefined) sh.campaign_id = campOf.get(sh.deal_id) || null;
      if (sh.pick_list_id === undefined) sh.pick_list_id = null;
    });
    (obj.phases || []).forEach(p => { if (p.default_pillar === undefined) p.default_pillar = pillarFromLabel(p.label, L.pillar_list); });
    (obj.campaigns || []).forEach(c => { if (c.default_payment_term === undefined) c.default_payment_term = null; });
    if (!Array.isArray(L.metrics_checkpoints)) L.metrics_checkpoints = [7];
    if (!Array.isArray(obj.pick_lists)) obj.pick_lists = [];
  }

  /* ===================== §4.8 — Operations ===================== */
  const ofPic = pic => d => !pic || (pic === '__none' ? isBlank(d.pic) : d.pic === pic);
  const isOpen = d => d.status === 'List' || d.status === 'Inprocess';
  /* Data health of one PIC ('' = all PICs · '__none' = no PIC) · f = { pic, campaign } · never the imported deals that are closed ·
     → { items: [{ key, n, deals? | campaigns? | phases? | posts? }], total } (an item at 0 is left out) */
  function dataHealth(state, f = {}, today) {
    const pic = f.pic || '', inCamp = d => !f.campaign || d.campaign_id === f.campaign, mine = d => ofPic(pic)(d) && inCamp(d);
    const deals = state.deals.filter(mine), live = deals.filter(d => !isImportedClosed(d));
    const termNotSet = deals.filter(d => isOpen(d) && !R.isTerm(R.termOf(d)));
    const pillarNotSet = deals.filter(d => isOpen(d) && isBlank(d.pillar));
    const liveIds = new Set(live.map(d => d.deal_id));
    const postsNoDate = (state.deal_posts || []).filter(p => liveIds.has(p.deal_id) && !isBlank(p.post_link) && !R.isISODate(p.post_date));
    const postedNoDate = [...new Set(postsNoDate.map(p => p.deal_id))].map(id => deals.find(d => d.deal_id === id));
    /* Campaigns and Phases have no PIC: with one PIC picked, those where that PIC has a deal still going */
    const picCamps = pic ? new Set(state.deals.filter(d => ofPic(pic)(d) && !isClosedDeal(d)).map(d => d.campaign_id)) : null;
    const camps = state.campaigns.filter(c => (!f.campaign || c.campaign_id === f.campaign) && (!picCamps || picCamps.has(c.campaign_id)) && R.campaignEffectiveStatus(c, R.phasesOfCampaign(state, c.campaign_id), today) !== 'cancelled');
    const noProducts = camps.filter(c => !R.campaignProductCodes(state, c.campaign_id).length);
    const campIds = new Set(camps.map(c => c.campaign_id));
    const noBudget = (state.phases || []).filter(p => campIds.has(p.campaign_id) && isBlank(p.budget_kol));
    /* R6 §4.13 — the same post link on more than one post (a group counts once) */
    const dups = R.duplicatePostGroups ? R.duplicatePostGroups(state).filter(g => g.posts.some(p => liveIds.has(p.deal_id)) && (!pic && !f.campaign || g.posts.some(p => deals.some(d => d.deal_id === p.deal_id)))) : [];
    const items = [
      { key: 'termNotSet', n: termNotSet.length, deals: termNotSet },
      { key: 'pillarNotSet', n: pillarNotSet.length, deals: pillarNotSet },
      { key: 'postedNoDate', n: postedNoDate.length, deals: postedNoDate, posts: postsNoDate },
      { key: 'noProducts', n: noProducts.length, campaigns: noProducts },
      { key: 'noBudget', n: noBudget.length, phases: noBudget },
      { key: 'dupLinks', n: dups.length, groups: dups, deals: [...new Set(dups.flatMap(g => g.posts.map(p => p.deal_id)))].map(id => state.deals.find(d => d.deal_id === id)).filter(Boolean) },
    ].filter(x => x.n > 0);
    return { items, total: items.length };
  }
  /* To do › Docs to collect: the KOLs (payees) whose instalments owed now miss a document, on the deals this PIC looks after — one each */
  function docsToCollect(state, f = {}, today) {
    const pic = f.pic || '';
    const items = R.payQueue(state, today).items.filter(x => x.status === 'missing_docs' && (!pic || (pic === '__none' ? !x.pic : x.pic === pic)) && (!f.campaign || x.campaign_id === f.campaign));
    const by = new Map(); items.forEach(x => { const k = x.kol_id || (x.payee && x.payee.payee_id) || x.account_handle || x.key; if (!by.has(k)) by.set(k, []); by.get(k).push(x); });
    return [...by.entries()].map(([key, list]) => ({ key, kol: list[0].kol, payee: list[0].payee, items: list }));
  }

  /* ===================== §4.7 — Go-live clean-up ===================== */
  /* a name in the PR file vs a payee: lower case · no @ · no spaces */
  const normPrName = t => String(t == null ? '' : t).trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
  /* "1,234.50" · 1234.5 · "฿1,234" → 1234.5 (null when it is not a number) */
  const prAmount = v => { if (typeof v === 'number') return v; const t = String(v == null ? '' : v).replace(/[฿,\s]/g, ''); return t && !isNaN(t) ? Number(t) : null; };
  /* step 2 — what imported deals still owe (not in a run): the rows to clear */
  function cleanupLines(state, today) {
    return R.payQueue(state, today).items.filter(x => x.deal && isImported(x.deal) && !x.run_id && (x.status === 'ready' || x.status === 'missing_docs' || x.status === 'on_hold'));
  }
  /* step 3 — imported deals' shipments still To ship · a Complete deal is ticked (posted = the KOL had the product) */
  function cleanupShipments(state) {
    const dealOf = new Map(state.deals.map(d => [d.deal_id, d]));
    return (state.sample_shipments || []).filter(sh => sh.status === 'to_ship' && isImported(dealOf.get(sh.deal_id)))
      .map(sh => ({ sh, deal: dealOf.get(sh.deal_id), pick: (dealOf.get(sh.deal_id) || {}).status === 'Complete' }));
  }
  /* Match with PR file: rows [{sheet, row, name, amount, paid}] vs the step 2 lines → per row Matched (name and |amount − net| ≤ 1 or |amount − gross| ≤ 1) ·
     Check amount (the name only) · Not found · a line matches one row at most */
  function matchPrRows(lines, rows) {
    const byName = new Map();
    lines.forEach(x => [x.account_handle, x.kol && x.kol.display_name, x.payee && x.payee.account_handle].filter(Boolean).forEach(n => {
      const k = normPrName(n); if (!byName.has(k)) byName.set(k, []); if (!byName.get(k).includes(x)) byName.get(k).push(x); }));
    const used = new Set();
    return rows.map(r => {
      const cands = (byName.get(normPrName(r.name)) || []).filter(x => !used.has(x.key)), amt = prAmount(r.amount);
      if (!normPrName(r.name) || !cands.length) return { row: r, status: 'notfound' };
      const hit = amt == null ? null : cands.find(x => Math.abs(amt - x.tax.net) <= 1 || Math.abs(amt - x.tax.gross) <= 1);
      if (hit) { used.add(hit.key); return { row: r, status: 'matched', item: hit }; }
      return { row: r, status: 'amount', item: cands[0] };
    });
  }
  /* a paid date from the PR file: an Excel day number · dd/mm/yyyy · dd/mm/yy · yyyy-mm-dd (a Buddhist year − 543) → ISO | null */
  function prDate(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10); }
    const t = String(v == null ? '' : v).trim(); let m, y, mo, da;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
    else if ((m = /^(\d{1,2})[/.\-_](\d{1,2})[/.\-_](\d{2}|\d{4})$/.exec(t))) [da, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    else return null;
    if (y < 100) y += 2000; if (y > 2400) y -= 543;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    return R.isISODate(iso) && new Date(iso + 'T00:00:00Z').getUTCDate() === da ? iso : null;
  }
  /* the header row of a sheet: the first row with two or more text cells (0-based · -1 = none) */
  const prHeaderRow = rows => (rows || []).findIndex(r => (r || []).filter(c => typeof c === 'string' && c.trim()).length >= 2);
  /* a first guess of the three columns from the header texts → {name, amount, paid} (column indexes · -1 = not found) */
  function guessPrColumns(head) {
    const h = (head || []).map(c => String(c == null ? '' : c).toLowerCase());
    const find = (re, not) => h.findIndex((t, i) => re.test(t) && !(not || []).includes(i));
    const name = find(/ชื่อ|name|handle|ผู้รับ|kol/), amount = find(/net|amount|ยอด|จำนวนเงิน|total/, [name]);
    return { name, amount, paid: find(/paid|date|วันที่|วันโอน/, [name, amount]) };
  }
  /* the rows to match: each sheet chosen (sheet '' = all) after its header row → [{sheet, row (as in the file, from 1), name, amount, paid}] —
     only these three columns; nothing else of the file goes any further */
  function prRows(sheets, map) {
    const out = [];
    (sheets || []).filter(sh => !map.sheet || sh.name === map.sheet).forEach(sh => {
      const hr = prHeaderRow(sh.rows);
      sh.rows.forEach((r, i) => {
        if (i <= hr || !r) return;
        const name = map.name >= 0 ? r[map.name] : null, amount = map.amount >= 0 ? r[map.amount] : null;
        if ((name == null || String(name).trim() === '') && amount == null) return;
        out.push({ sheet: sh.name, row: i + 1, name: name == null ? '' : String(name), amount, paid: map.paid >= 0 ? prDate(r[map.paid]) : null });
      });
    });
    return out;
  }
  /* the note kept on a line paid outside the app: the file and where — never anything else from it */
  const prNote = (file, sheet, row) => C.golive.matchedNote(file, sheet, row);
  /* step 4 — the clean-up: lines → Mark paid outside app (a date and a note each) · shipments → Delivered (imported) · go_live done ·
     sel = { lines: [{item, date, note}], shipments: [shipment_id] } · ctx = {lineId(), eventId(), now, user} → events */
  function applyCleanup(state, sel, ctx) {
    const events = [];
    if (sel.goLiveDate && R.isISODate(sel.goLiveDate)) state.lookups.go_live = Object.assign({}, goLive(state.lookups), { date: sel.goLiveDate });
    (sel.lines || []).forEach(x => { events.push(...R.markPaidOutside(state, [x.item], x.date, x.note, ctx)); });
    const ids = new Set(sel.shipments || []);
    (state.sample_shipments || []).forEach(sh => {
      if (!ids.has(sh.shipment_id) || sh.status !== 'to_ship') return;
      events.push({ event_id: ctx.eventId(), deal_id: sh.deal_id, shipment_id: sh.shipment_id, type: 'shipment', from: 'to_ship', to: 'delivered', changed_at: ctx.now, changed_by: ctx.user || null, note: C.golive.deliveredImported });
      Object.assign(sh, { status: 'delivered', delivered_date: null, source: 'legacy', updated_by: ctx.user || null, updated_at: ctx.now });
    });
    const L = state.lookups; L.go_live = Object.assign({}, goLive(L), { completed_at: ctx.now, completed_by: ctx.user || null });
    return events;
  }
  /* Undo (CR-11 §4.7): what the clean-up touches, copied before it runs — kept in memory only, until the page reloads */
  const SNAP_KEYS = ['deals', 'payment_lines', 'sample_shipments', 'deal_events'];
  const cleanupSnapshot = state => Object.assign(JSON.parse(JSON.stringify(SNAP_KEYS.reduce((o, k) => Object.assign(o, { [k]: state[k] }), {}))), { go_live: Object.assign({}, goLive(state.lookups)) });
  function undoCleanup(state, snap) { SNAP_KEYS.forEach(k => { state[k] = JSON.parse(JSON.stringify(snap[k])); }); state.lookups.go_live = Object.assign({}, snap.go_live); }
  function validateCleanupLine(x) {
    const errs = [];
    if (!R.isISODate(x.date)) errs.push({ field: 'date', msg: M.cleanupDate });
    if (!trim(x.note)) errs.push({ field: 'note', msg: M.cleanupNote });
    else if (R.looksSensitive(x.note)) errs.push({ field: 'note', msg: M.sensitive });
    return { errs, warns: [], infos: [] };
  }

  /* ===================== §4.9 — To pay: Hold / Release ===================== */
  /* who may hold an instalment: the deal's PIC (Staff) · Admin · KOL Manager (the people who could request it before) */
  const canHold = (state, user, deal) => R.canRequest(state, user, deal);
  function validateHold(reason) {
    const errs = [];
    if (!trim(reason)) errs.push({ field: 'reason', msg: M.holdReason });
    else if (R.looksSensitive(reason)) errs.push({ field: 'reason', msg: M.sensitive });
    return { errs, warns: [], infos: [] };
  }
  /* Hold: a worked-out instalment gets a line On hold (made for it — Release takes it away again) · a line open → On hold ·
     not one in a run, paid or cancelled · ctx = {lineId(), eventId(), now, user} → { line, event } | null */
  function holdItem(state, item, reason, ctx) {
    let l = item.line;
    if (l && (l.run_id || ['paid', 'cancelled', 'on_hold'].includes(l.status))) return null;
    const from = item.status;
    if (!l) {
      l = R.newLine(state, item, { lineId: ctx.lineId(), agreed_amount: item.agreed, price_basis: item.price_basis, wht_rate: item.tax.wht_rate, pay_to: item.pay_to, user: ctx.user, now: ctx.now });
      l.hold_created = true; state.payment_lines.push(l);
    }
    Object.assign(l, { status: 'on_hold', hold_reason: trim(reason), hold_by: ctx.user || null, hold_at: ctx.now });
    return { line: l, event: { event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment_hold', from, to: 'on_hold', changed_at: ctx.now, changed_by: ctx.user || null, note: trim(reason) } };
  }
  /* Release: back to what it works out to (a line made by Hold goes, so the instalment is worked out from the deal again) → event */
  function releaseLine(state, line, today, ctx) {
    if (!line || line.status !== 'on_hold') return null;
    const reason = line.hold_reason;
    if (line.hold_created) state.payment_lines = state.payment_lines.filter(x => x !== line);
    else Object.assign(line, { status: 'open', hold_reason: null, hold_by: null, hold_at: null });
    const to = line.hold_created ? 'released' : R.lineStatus(state, line, today);
    return { event_id: ctx.eventId(), deal_id: line.deal_id || null, line_id: line.line_id, type: 'payment_hold', from: 'on_hold', to, changed_at: ctx.now, changed_by: ctx.user || null, note: reason || null };
  }

  return { prDate, prHeaderRow, guessPrColumns, prRows, cleanupSnapshot, undoCleanup, isImported, isClosedDeal, isImportedClosed, isLegacyDelivered, goLive, goLiveDate, notTracked, pillarFromLabel, migrateV12, dataHealth, docsToCollect,
    normPrName, prAmount, cleanupLines, cleanupShipments, matchPrRows, prNote, applyCleanup, validateCleanupLine, canHold, validateHold, holdItem, releaseLine };
})(KT.rules, KT.content));
