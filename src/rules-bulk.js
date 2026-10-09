/* rules-bulk.js — CR-10 R4 (§4.10–4.12): New deal › Single KOL — find a KOL from what was typed, and the KOL Master record it would
   duplicate · Bulk shortlist — who becomes a Shortlist deal in a Campaign and who is skipped · the guard before Confirm QT (a payment term) ·
   Set details for many deals (only the fields ticked). Pure functions. Adds to KT.rules (load after rules-metrics.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { isBlank, trim, isTerm } = R;
  const MAX_BULK = 200;
  /* a name or handle for comparing: case, a leading @ and spaces do not count */
  const normKey = t => String(t == null ? '' : t).trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
  const handlesOf = (state, kolId) => state.kol_accounts.filter(a => a.kol_id === kolId).map(a => a.handle).filter(Boolean);

  /* §4.10 — the KOL box: names and @handles that hold the text (exact first, then starts with, then contains) */
  function kolMatches(state, text, limit) {
    const q = normKey(text); if (!q) return [];
    const by = new Map(); state.kol_accounts.forEach(a => { if (!by.has(a.kol_id)) by.set(a.kol_id, []); by.get(a.kol_id).push(a.handle); });
    return state.kol_master.map(k => {
      const keys = [k.display_name].concat(by.get(k.kol_id) || []).map(normKey);
      const score = keys.includes(q) ? 0 : keys.some(x => x.startsWith(q)) ? 1 : keys.some(x => x.includes(q)) ? 2 : -1;
      return score < 0 ? null : { k, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score || a.k.display_name.localeCompare(b.k.display_name, 'th')).slice(0, limit || 20).map(x => x.k);
  }
  /* CR-30 §3.5 — a profile link for comparing: no scheme · no www. / m. · no query or # · no / at the end · lower case */
  const profileKey = link => String(link == null ? '' : link).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^(www|m)\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  /* §4.10 — a KOL already in KOL Master with this name or handle (as a name or as a handle) — CR-30: or this profile link → {kol, handle, link} | null */
  function findDuplicateKol(state, name, handle, link) {
    const keys = [normKey(name), normKey(handle)].filter(Boolean), lk = profileKey(link);
    const byLink = lk ? state.kol_accounts.find(x => x.profile_link && profileKey(x.profile_link) === lk) : null;
    if (byLink) { const kl = R.kolById(state, byLink.kol_id); if (kl) return { kol: kl, handle: byLink.handle || '', link: true }; }
    if (!keys.length) return null;
    const k = state.kol_master.find(x => keys.includes(normKey(x.display_name)));
    const a = k ? null : state.kol_accounts.find(x => keys.includes(normKey(x.handle)));
    const kol = k || (a && R.kolById(state, a.kol_id)); if (!kol) return null;
    return { kol, handle: (a && a.handle) || handlesOf(state, kol.kol_id)[0] || '' };
  }
  /* the Create KOL form from what was typed: the name and handle without the @ in front · TikTok · PIC = you · Partner type KOL (CR-25) */
  const createKolDraft = (text, user) => { const t = trim(text).replace(/^@+/, ''); return { display_name: t, platform: '', handle: t.replace(/\s+/g, ''), followers: '', profile_link: '',   // CR-30: the platform from the link
    kol_type: '', kol_category: '', gender: '', contact_channel: '', contact_id: '', pic: R.picName(user) || '', default_payment_term: '', partner_type: 'kol' }; };

  /* §4.10 — Create KOL from New deal: Name and PIC are needed · a handle without spaces or @ · followers ≥ 0 · a link that is a link ·
     CR-30 §3.5: Partner type KOL / Affiliate (Both is set later) · Platform * · Profile link * (https://) · Username * (taken from the link · no @) */
  function validateCreateKol(state, x) {
    const errs = [], h = trim(x.handle), NK = C.newKol;
    if (!trim(x.display_name)) errs.push({ field: 'ck_display_name', msg: M.kolNameRequired });
    if (!trim(x.pic)) errs.push({ field: 'ck_pic', msg: M.ckPicRequired });
    if (!['kol', 'affiliate'].includes(x.partner_type == null ? 'kol' : x.partner_type)) errs.push({ field: 'ck_partner_type', msg: C.partner.required });   // CR-25 §3.1 · CR-30: no Both here
    if (!x.platform) errs.push({ field: 'ck_platform', msg: NK.platformRequired });
    if (isBlank(x.profile_link)) errs.push({ field: 'ck_profile_link', msg: NK.linkRequired });
    else if (!/^https:\/\/\S+$/i.test(trim(x.profile_link))) errs.push({ field: 'ck_profile_link', msg: NK.linkHttps });
    if (!h) errs.push({ field: 'ck_handle', msg: NK.usernameRequired });
    else if (/\s/.test(h) || h.startsWith('@')) errs.push({ field: 'ck_handle', msg: M.accHandleFormat(1) });
    if (!isBlank(x.followers) && (isNaN(x.followers) || Number(x.followers) < 0)) errs.push({ field: 'ck_followers', msg: M.accFollowersFormat(1) });
    if (!isBlank(x.default_payment_term) && !isTerm(x.default_payment_term)) errs.push({ field: 'ck_default_payment_term', msg: M.termInvalid });
    const cp = R.contactIdProblem(x.contact_id);   // CR-14 §4.5
    if (cp) errs.push({ field: 'ck_contact_id', msg: cp === 'phone' ? M.contactPhone : M.contactLong(R.CONTACT_ID_MAX) });
    return { errs, warns: [], infos: [] };
  }
  /* the KOL Master rows it makes (sources ['manual']) · an account only when a handle was given */
  function createKolRecords(x, ids) {
    const v = t => trim(t) || null;
    const kol = { kol_id: ids.kolId, display_name: trim(x.display_name), kol_category: v(x.kol_category), kol_type: v(x.kol_type), gender: x.gender || null, pic: v(x.pic),
      kol_status: 'Active', status_reason: null, contact_channel: x.contact_channel || null, contact_id: v(x.contact_id), note: null, sources: ['manual'],
      default_payment_term: isTerm(x.default_payment_term) ? x.default_payment_term : null, kol_type_legacy: null, partner_type: R.partnerTypeOf(x) };
    const account = trim(x.handle) || trim(x.profile_link) ? { account_id: ids.accountId, kol_id: ids.kolId, platform: x.platform || null, handle: R.cleanUsername(x.handle) || R.usernameFromLink(x.profile_link) || '', profile_link: v(x.profile_link),
      followers: isBlank(x.followers) ? null : Number(x.followers), is_legacy: false } : null;
    return { kol, account };
  }

  /* §4.11 — kolIds → { create [{kol, pic, term}], skip [{kol, reason}], warns [{kol, msg}], errs } · reasons: in_campaign (a deal there, not cancelled) · blacklisted
     o = { pic: 'me' | 'kol' | a PIC name, me (your PIC name or ''), max } · KOL's PIC empty → you */
  function bulkShortlistPlan(state, kolIds, campaignId, o = {}) {
    const errs = [], create = [], skip = [], warns = [];
    if (!campaignId || !state.campaigns.some(c => c.campaign_id === campaignId)) errs.push({ field: 'campaign_id', msg: M.addCampaignRequired });
    else if (R.campaignBlocksNew(state, campaignId)) errs.push({ field: 'campaign_id', msg: R.campaignBlocksNew(state, campaignId) });
    if (kolIds.length > (o.max || MAX_BULK)) errs.push({ field: 'kols', msg: M.bulkMax(o.max || MAX_BULK) });
    const inCamp = new Set(state.deals.filter(d => d.campaign_id === campaignId && !R.isCancelled(d)).map(d => d.kol_id));
    const picFor = k => (o.pic === 'kol' ? k.pic || o.me || null : o.pic === 'me' || !o.pic ? o.me || null : o.pic);
    kolIds.forEach(id => {
      const k = R.kolById(state, id); if (!k) return;
      if (inCamp.has(id)) { skip.push({ kol: k, reason: 'in_campaign' }); return; }
      if (k.kol_status === 'Blacklist') { skip.push({ kol: k, reason: 'blacklisted' }); return; }
      if (k.kol_status === 'Inactive') warns.push({ kol: k, msg: M.addKolStatus(k.display_name, k.kol_status) });
      create.push({ kol: k, pic: picFor(k), term: R.termPrefill(state, k, campaignId).term || null });   // CR-11 §4.11: the KOL's default → the Campaign's
    });
    return { errs, create, skip, warns };
  }
  /* the deals of a plan · ctx = {batchId, dealIds [], logIds [], date, now, user, pillar} · costs empty (CR-07: no prefill) · no posts yet */
  function bulkShortlistDeals(state, plan, campaignId, ctx) {
    return plan.create.map((x, i) => {
      const r = R.shortlistDeal(state, x.kol.kol_id, { dealId: ctx.dealIds[i], logId: ctx.logIds[i], campaignId, pic: x.pic, paymentTerm: x.term, date: ctx.date, now: ctx.now, user: ctx.user, note: C.bulk.logNote });
      Object.assign(r.deal, { created_batch_id: ctx.batchId, pillar: ctx.pillar || null, draft_rounds: 1, payment_term: x.term });
      return r;
    });
  }
  /* Undo of a batch: the deals of the batch nobody has changed since (same as created) */
  const batchUntouched = (state, batchId, made) => state.deals.filter(d => d.created_batch_id === batchId && made.has(d.deal_id) && JSON.stringify(d) === made.get(d.deal_id));

  /* §4.12 — may a deal go to this stage now? (CR-20: what the stage needs comes from R.stageRequirements, through R.checkMove) · a total of ฿0 that is not Free (warning, CR-07) */
  function canMoveToStage(state, deal, toSub) {
    const r = R.checkMove(state, deal, toSub, { date: R.todayISO() }), warns = [];
    const errs = r.errs.filter(e => ['payment_term', 'pillar', 'rate_card', 'package_id'].includes(e.field)).map(e => Object.assign({ kind: e.field === 'payment_term' ? 'term' : e.field }, e));
    if (R.zeroCostMove(state, deal, toSub)) warns.push({ field: 'total', kind: 'zero', msg: C.priceRef.zeroTitle });
    return { errs, warns };
  }
  /* CR-20 §4.2–4.3 — New deal › From KOL Master: the KOLs that match every filter (AND) · Worked in = a deal (not cancelled) in at least one of those
     Campaigns · Posted only = one that reached Post there · Not in this campaign yet · f = { q, platform, tier, type, category, owner (KOL owner), status,
     lastWorked, perf, workedIn [campaign_id], postedOnly, notIn } → [{ k, accs, mf, tier, pf, inCamp }] by name */
  function kolPickerFilter(state, f, campaignId, today, perfIn) {
    const rules = state.lookups.tier_rules || [], q = normKey(f.q), perf = perfIn || R.kolPerfAll(state, today);
    const accBy = new Map(); state.kol_accounts.forEach(a => { if (!accBy.has(a.kol_id)) accBy.set(a.kol_id, []); accBy.get(a.kol_id).push(a); });
    const inCamp = new Set(state.deals.filter(d => d.campaign_id === campaignId && !R.isCancelled(d)).map(d => d.kol_id));
    const wi = (f.workedIn || []).filter(Boolean);
    const worked = wi.length ? new Set(state.deals.filter(d => wi.includes(d.campaign_id) && !R.isCancelled(d) && (!f.postedOnly || d.status === 'Complete')).map(d => d.kol_id)) : null;
    return state.kol_master.map(k => {
      const accs = accBy.get(k.kol_id) || [], mf = R.maxFollowers(accs), tier = R.tierOf(mf, rules) || R.UNKNOWN_TIER, pf = perf.get(k.kol_id) || {};
      if (q && ![k.display_name].concat(accs.map(a => a.handle)).some(v => normKey(v).includes(q))) return null;
      if ((f.platform && !accs.some(a => a.platform === f.platform)) || (f.tier && tier !== f.tier) || (f.type && (k.kol_type || '') !== f.type) || (f.category && k.kol_category !== f.category) ||
        (f.owner && (k.pic || '') !== (f.owner === '__none' ? '' : f.owner)) || (f.status && (k.kol_status || 'Active') !== f.status) || (f.lastWorked && pf.bucket !== f.lastWorked) ||
        (f.perf && ((pf.perf || {}).badge || 'none') !== f.perf) || (f.notIn && inCamp.has(k.kol_id)) || (worked && !worked.has(k.kol_id)) ||
        (f.partner && !R.partnerMatch(k, f.partner))) return null;   // CR-25: Partner type (Both is in KOL and in Affiliate)
      return { k, accs, mf, tier, pf, inCamp: inCamp.has(k.kol_id) };
    }).filter(Boolean).sort((a, b) => a.k.display_name.localeCompare(b.k.display_name, 'th'));
  }
  /* the filters that count for Clear all filters (Not in this campaign yet is one too) */
  const PICKER_KEYS = ['q', 'partner', 'platform', 'tier', 'type', 'category', 'owner', 'status', 'lastWorked', 'perf', 'workedIn', 'postedOnly', 'notIn'];
  const pickerActive = f => PICKER_KEYS.filter(k => (Array.isArray(f[k]) ? f[k].length > 0 : k === 'q' ? !!trim(f.q) : !!f[k]));
  /* §4.12 — Set details: only the fields ticked (PIC · Pillar · Payment term · Phase · CTA) · one event a deal for what really changed
     fields = {pic?, pillar?, payment_term?, cta?} (Phase is set on the deal's posts by the caller) → [{deal (new), changes [{field, from, to}]}] */
  const DETAIL_FIELDS = ['pic', 'pillar', 'payment_term', 'cta'];
  function setDetailsPlan(deals, fields) {
    return deals.map(d => {
      const next = Object.assign({}, d), changes = [];
      DETAIL_FIELDS.forEach(f => { if (!(f in fields)) return; const v = isBlank(fields[f]) ? null : fields[f]; if ((d[f] || null) !== v) { changes.push({ field: f, from: d[f] || null, to: v }); next[f] = v; } });
      return { deal: next, changes };
    }).filter(x => x.changes.length);
  }

  /* CR-11 §4.1 — New deal › Add account (a panel in the modal): the same checks as an account in KOL Master (platform · handle · profile link ·
     followers · not another KOL's) · fields aa_platform / aa_handle / aa_profile_link / aa_followers */
  function validateAddAccount(state, kolId, a) {
    const k = R.kolById(state, kolId), accs = state.kol_accounts.filter(x => x.kol_id === kolId), pre = `acc${accs.length}_`;
    const res = R.validateKol(state, { kol_id: kolId, display_name: (k && k.display_name) || '-', accounts: accs.concat([Object.assign({ account_id: null }, a)]) });
    const mine = e => String(e.field || '').startsWith(pre), map = e => ({ field: 'aa_' + e.field.slice(pre.length), msg: e.msg });
    return { errs: (k ? [] : [{ field: 'aa_kol', msg: M.kolNameRequired }]).concat(res.errs.filter(mine).map(map)), warns: res.warns.filter(mine).map(map), infos: [] };
  }
  /* the kol_accounts row */
  const newAccountRecord = (kolId, a, id) => ({ account_id: id, kol_id: kolId, platform: a.platform, handle: trim(a.handle), profile_link: trim(a.profile_link) || null,
    followers: isBlank(a.followers) ? null : Number(a.followers), is_legacy: false });

  return { profileKey, kolPickerFilter, PICKER_KEYS, pickerActive, MAX_BULK, normKey, kolMatches, findDuplicateKol, createKolDraft, validateCreateKol, createKolRecords, bulkShortlistPlan, bulkShortlistDeals, batchUntouched, canMoveToStage, DETAIL_FIELDS, setDetailsPlan,
    validateAddAccount, newAccountRecord };
})(KT.rules, KT.content));
