/* rules-gencode.js — CR-30 §3.1: the Gencodes a KOL sends (TikTok Spark code · Meta ad code) kept on the deal — one deal many codes, each may be linked to a
   post. Pasted as a block: one non-empty line = one code (trimmed) · the same code twice (in the block or already kept) = skipped · its type from its form
   (# … = → TikTok Spark · fbadcode- → Meta · anything else = Other, kept with a grey "Unrecognised code format"). Valid until = Gencode start + Gencode days
   (R.gencodeEndDate) · Active / Expiring (3 days or fewer) / Expired. A code is shown short (#c88F2o…Kg=) with Copy — never in full in a table, the
   Dashboard or a general export (a count only) · the log keeps its first 6 characters. Pure functions; adds to KT.rules (load after rules-deal.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { trim, isISODate, addDays, dayDiff, num } = R;
  const GENCODE_TYPES = ['tiktok_spark', 'meta', 'other'];
  const EXPIRING_DAYS = 3;
  /* the type of a code from its form */
  function gencodeType(code) {
    const c = trim(code);
    if (/^#\S+=$/.test(c)) return 'tiktok_spark';
    if (/^fbadcode-\S+$/i.test(c)) return 'meta';
    return 'other';
  }
  /* the platforms a type goes with (a post on one of them is its default) */
  const TYPE_PLATFORMS = { tiktok_spark: ['TikTok'], meta: ['Facebook', 'Instagram'], other: [] };
  /* a pasted block → { codes [{ code, type }], dupes (skipped), blank (empty lines) } · existing = the codes kept already (strings) */
  function parseGencodes(text, existing) {
    const seen = new Set((existing || []).map(x => trim(x))), codes = [];
    let dupes = 0, blank = 0;
    String(text || '').split(/\r?\n/).forEach(line => {
      const c = trim(line);
      if (!c) { blank++; return; }
      if (seen.has(c)) { dupes++; return; }
      seen.add(c); codes.push({ code: c, type: gencodeType(c) });
    });
    return { codes, dupes, blank };
  }
  /* short on screen: #c88F2o…Kg= · fbadcode-a1B2…xyZ · a short code stays whole */
  function shortCode(code) {
    const c = String(code || '');
    const head = /^fbadcode-/i.test(c) ? 13 : 7;
    return c.length <= head + 5 ? c : `${c.slice(0, head)}…${c.slice(-3)}`;
  }
  /* what the log keeps of a code: its first 6 characters */
  const logCode = code => String(code || '').slice(0, 6);
  const gencodesAll = state => (Array.isArray(state.deal_gencodes) ? state.deal_gencodes : (state.deal_gencodes = []));
  /* a deal's codes (not deleted), oldest first */
  const gencodesOf = (state, dealId) => (state.deal_gencodes || []).filter(g => g.deal_id === dealId && !g.deleted_at)
    .sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)) || String(a.code_id).localeCompare(String(b.code_id)));
  const gencodeCount = (state, dealId) => gencodesOf(state, dealId).length;
  /* valid until (Gencode start + Gencode days) · status Active / Expiring / Expired (no date = Active) */
  function gencodeValidity(deal, today) {
    const until = R.gencodeEndDate(deal);
    if (!until) return { until: null, status: 'active', left: null };
    const left = dayDiff(until, today);
    return { until, left, status: left < 0 ? 'expired' : left <= EXPIRING_DAYS ? 'expiring' : 'active' };
  }
  /* the post a new code goes to by default: the first post on its platform without a code yet (taken = post ids used in this block) · none = null */
  function defaultGencodePost(state, deal, type, taken) {
    const plats = TYPE_PLATFORMS[type] || [], used = new Set(gencodesOf(state, deal.deal_id).map(g => g.post_id).filter(Boolean).concat(taken || []));
    const accs = new Map((state.kol_accounts || []).map(a => [a.account_id, a]));
    const p = R.postsOf(state, deal.deal_id).find(x => !used.has(x.post_id) && plats.includes(((accs.get(x.account_id) || {}).platform) || x.platform || ''));
    return p ? p.post_id : null;
  }
  /* rows for the preview: each code with its type and the post it goes to */
  function gencodePreview(state, deal, text) {
    const r = parseGencodes(text, gencodesOf(state, deal.deal_id).map(g => g.code)), taken = [];
    const rows = r.codes.map(x => { const post = defaultGencodePost(state, deal, x.type, taken); if (post) taken.push(post); return Object.assign({ post_id: post }, x); });
    return { rows, dupes: r.dupes, blank: r.blank };
  }
  /* a record · o { id, dealId, postId, type, code, now, user } */
  const newGencode = o => ({ code_id: o.id, deal_id: o.dealId, post_id: o.postId || null, type: GENCODE_TYPES.includes(o.type) ? o.type : gencodeType(o.code), code: trim(o.code),
    received_at: o.now, created_by: o.user || null, deleted_at: null });
  /* a deal_events row: gencode_added · gencode_copied · gencode_deleted · gencode_edited (only the first 6 characters of the code) */
  const gencodeEvent = (ctx, dealId, kind, code, note) => ({ event_id: ctx.eventId(), deal_id: dealId, type: kind, from: null, to: logCode(code), changed_at: ctx.now, changed_by: ctx.user || null, note: note || null });
  /* the codes of a block saved on a deal → { records, events } (the caller pushes them) · rows [{ code, type, post_id }] */
  function addGencodes(state, deal, rows, ctx) {
    const have = new Set(gencodesOf(state, deal.deal_id).map(g => g.code)), records = [], events = [];
    rows.forEach(x => {
      const c = trim(x.code); if (!c || have.has(c)) return; have.add(c);
      records.push(newGencode({ id: ctx.codeId(), dealId: deal.deal_id, postId: x.post_id || null, type: x.type, code: c, now: ctx.now, user: ctx.user }));
      events.push(gencodeEvent(ctx, deal.deal_id, 'gencode_added', c, x.post_id || null));
    });
    return { records, events };
  }
  /* an edit: the code (not the same as another of the deal) · its type · its post */
  function validateGencode(state, rec, code) {
    const c = trim(code), errs = [];
    if (!c) errs.push({ field: 'code', msg: C.gencode.codeRequired });
    else if (gencodesOf(state, rec.deal_id).some(g => g.code_id !== rec.code_id && g.code === c)) errs.push({ field: 'code', msg: C.gencode.duplicate });
    return { errs, warns: c && gencodeType(c) === 'other' ? [{ field: 'code', msg: C.gencode.unknownFormat }] : [], infos: [] };
  }
  /* a deal that paid for a Gencode and has posted, with no code yet (the Missing bar · Operations › Collect gencode) — due = first post date + 3 days */
  function needsGencode(state, deal, today) {
    if (!deal || R.isCancelled(deal) || !(num(deal.gencode_expense) > 0) || gencodeCount(state, deal.deal_id)) return null;
    const posted = R.postsOf(state, deal.deal_id).filter(p => R.isPosted ? R.isPosted(p, today) : isISODate(p.post_date));
    if (!posted.length && deal.status !== 'Complete') return null;
    const first = posted.map(p => p.post_date).filter(isISODate).sort()[0] || null;
    return { first, due: first ? addDays(first, 3) : today };
  }
  /* Export › Gencodes (Manager / Admin): every code with its deal, KOL, campaign, post and validity — a file for the ads team */
  function gencodeExportRows(state, today) {
    const deals = new Map(state.deals.map(d => [d.deal_id, d])), posts = new Map((state.deal_posts || []).map(p => [p.post_id, p])), accs = new Map((state.kol_accounts || []).map(a => [a.account_id, a]));
    return (state.deal_gencodes || []).filter(g => !g.deleted_at && deals.has(g.deal_id)).map(g => {
      const d = deals.get(g.deal_id), p = g.post_id ? posts.get(g.post_id) : null, a = p ? accs.get(p.account_id) : null, v = gencodeValidity(d, today);
      return { g, deal: d, kol: (R.kolById(state, d.kol_id) || {}).display_name || d.kol_id, campaign: R.campaignName(state, d.campaign_id) || '', post: p, account: a, validity: v };
    }).sort((x, y) => String(x.campaign).localeCompare(String(y.campaign)) || String(x.kol).localeCompare(String(y.kol)) || String(x.g.received_at).localeCompare(String(y.g.received_at)));
  }

  /* ===================== schema 23 (CR-30 §4) ===================== */
  /* deal_gencodes [] · deals + other_fee (0) · other_fee_note (null) · kol_accounts.handle = the username (no @, no spaces) — the money does not change */
  function migrateV23(obj) {
    if (!Array.isArray(obj.deal_gencodes)) obj.deal_gencodes = [];
    (obj.deals || []).forEach(d => { if (d.other_fee === undefined) d.other_fee = 0; if (d.other_fee_note === undefined) d.other_fee_note = null; });
    (obj.kol_accounts || []).forEach(a => { if (typeof a.handle === 'string') a.handle = R.cleanUsername(a.handle); });
    obj.schema_version = Math.max(obj.schema_version || 0, 23);
    return obj;
  }

  return { GENCODE_TYPES, GENCODE_EXPIRING_DAYS: EXPIRING_DAYS, gencodeType, parseGencodes, shortCode, gencodeLogCode: logCode, gencodesAll, gencodesOf, gencodeCount, gencodeValidity,
    defaultGencodePost, gencodePreview, newGencode, gencodeEvent, addGencodes, validateGencode, needsGencode, gencodeExportRows, migrateV23 };
})(KT.rules, KT.content));
