/* rules-io.js — CSV export rows (§10) and the KOL CSV import plan (§7.4). Pure functions; adds to KT.rules. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim, num, totalCost } = R;

  /* ===================== CSV text ===================== */
  /* rows: objects keyed by header, or arrays · null → empty · booleans → true/false · arrays → "a | b" */
  function toCSV(header, rows) {
    const cell = v => {
      if (v == null) return '';
      if (Array.isArray(v)) v = v.join(' | ');
      const s = typeof v === 'boolean' ? String(v) : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = r => (Array.isArray(r) ? r : header.map(h => r[h])).map(cell).join(',');
    return [header.map(cell).join(','), ...rows.map(line)].join('\r\n');
  }
  /* RFC 4180-ish: quotes, doubled quotes, commas and new lines inside quotes, CRLF/LF, BOM */
  function parseCSV(text) {
    const s = String(text || '').replace(/^﻿/, ''), rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(c => trim(c) !== ''));
  }

  /* ===================== Looker / analysis CSVs (§10.1) ===================== */
  const DEALS_COLS = ['deal_id', 'campaign_id', 'campaign_name', 'primary_phase_id', 'primary_phase_name', 'phase_ids', 'legacy_phase_id', 'kol_id', 'kol_name', 'partner_type', 'kol_tier', 'tier_followers', 'pillar', 'status', 'sub_status', 'journey_sort',
    'draft_rounds', 'payment_term', 'commit_type', 'docs_done', 'docs_done_date', 'paid_50', 'paid_50_date', 'paid_full', 'paid_full_date', 'payment_state', 'pic', 'rate_card', 'gencode_expense', 'gencode_period',
    'gencode_start_date', 'gencode_end_date', 'basket_fee', 'asset_fee', 'expediting_fee', 'total_cost', 'delivered', 'delivery_date', 'products', 'brief_date', 'expected_script_date', 'script_date',
    'expected_draft1_date', 'approved_draft1_date', 'expected_draft2_date', 'approved_draft2_date', 'expected_draft3_date', 'approved_draft3_date', 'expected_approve_date', 'approved_date', 'expected_post_date',
    'link_brief', 'cta', 'posts_planned', 'posts_done', 'first_post_date', 'last_post_date', 'views', 'likes', 'comments', 'saves', 'shares', 'next_step', 'due_date',
    'is_overdue', 'cancel_reason', 'remark', 'is_legacy'];
  const POSTS_COLS = ['post_id', 'deal_id', 'campaign_id', 'campaign_name', 'phase_id', 'phase_name', 'phase_seq', 'phase_label', 'phase_source', 'phase_override', 'post_share', 'kol_id', 'kol_name', 'account_id', 'platform', 'handle', 'followers', 'tier', 'expected_post_date',
    'post_date', 'post_link', 'gencode_code', 'views', 'likes', 'comments', 'saves', 'shares', 'metrics_updated_at', 'deal_status', 'deal_sub_status'];
  const LOG_COLS = ['log_id', 'deal_id', 'campaign_id', 'campaign_name', 'kol_name', 'from_sub_status', 'status', 'sub_status', 'effective_date', 'changed_at', 'source', 'note'];
  const KOL_COLS = ['kol_id', 'display_name', 'partner_type', 'kol_category', 'kol_type', 'gender', 'pic', 'kol_status', 'status_reason', 'contact_channel', 'contact_id', 'account_count', 'platforms',
    'max_followers', 'tier', 'deal_count', 'latest_quote_total', 'latest_quote_source', 'last_worked', 'last_campaign', 'sources', 'note'];
  const ACCOUNT_COLS = ['account_id', 'kol_id', 'kol_name', 'platform', 'handle', 'profile_link', 'followers', 'tier', 'post_count', 'is_legacy'];
  const QUOTE_COLS = ['quote_id', 'kol_id', 'kol_name', 'account_id', 'platform', 'handle', 'quoted_at', 'source', 'source_row', 'rate_card', 'gencode_expense',
    'gencode_period', 'basket_fee', 'asset_fee', 'expediting_fee', 'total', 'note'];

  function dealsRows(state, deals, today, ctxIn) {
    const ctx = ctxIn || R.dealContext(state);
    return deals.map(d => {
      const c = ctx.campaigns.get(d.campaign_id) || {}, k = ctx.kols.get(d.kol_id) || {}, step = R.stepOf(state.lookups, d.sub_status) || {};
      const info = ctx.phaseIdx.deal.get(d.deal_id) || { primary: null, keys: new Set() }, p = ctx.phases.get(info.primary) || {};
      const sum = R.dealPostSummary(ctx, d.deal_id), nx = R.nextStep(state.lookups, d).step;
      return Object.assign({}, d, {
        campaign_id: d.campaign_id, campaign_name: c.campaign_name, primary_phase_id: p.phase_id || null, primary_phase_name: p.phase_id ? R.phaseName(state, p.phase_id) : null, products: R.dealProductsCsv(state, d.deal_id),
        phase_ids: [...info.keys].filter(x => ctx.phases.has(x)), kol_name: k.display_name, partner_type: R.partnerTypeLabel(state.lookups, R.partnerTypeOf(k)), journey_sort: step.sort_order,   // CR-25
        kol_tier: (ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER, tier_followers: (ctx.tiers.get(d.deal_id) || {}).followers ?? null,
        commit_type: d.status === 'Cancel' ? 'cancelled' : R.isShortlist(state.lookups, d) ? 'shortlist' : 'committed',
        payment_state: R.paymentState(d, today), gencode_end_date: R.gencodeEndDate(d), total_cost: totalCost(d),
        posts_planned: sum.planned, posts_done: sum.done, first_post_date: sum.first, last_post_date: sum.last,
        views: sum.views, likes: sum.likes, comments: sum.comments, saves: sum.saves, shares: sum.shares,
        next_step: nx ? nx.sub_status : null, due_date: R.dueDate(state, d), is_overdue: R.isOverdue(state, d, today),
      });
    });
  }
  /* CR-06 §4.8 — Payments CSV (for accounting): one row per deal, the term and due status in words */
  const PAYMENTS_COLS = ['deal_id', 'kol_name', 'campaign_name', 'phase_name', 'payment_term', 'total', 'docs_date', 'deposit_date', 'paid_date', 'outstanding', 'due_status', 'pic'];
  function paymentsRows(state, deals, today, ctxIn) {
    const ctx = ctxIn || R.dealContext(state);
    return deals.map(d => {
      const p = R.primaryPhase(ctx.phaseIdx, d.deal_id), term = R.termOf(d) || 'none';
      return { deal_id: d.deal_id, kol_name: (ctx.kols.get(d.kol_id) || {}).display_name || null, campaign_name: (ctx.campaigns.get(d.campaign_id) || {}).campaign_name || null,
        phase_name: ctx.phases.has(p) ? R.phaseName(state, p) : null, payment_term: C.term[term], total: totalCost(d),
        docs_date: d.docs_done ? d.docs_done_date || null : null, deposit_date: term === 'split_50' && d.paid_50 ? d.paid_50_date || null : null,
        paid_date: d.paid_full ? d.paid_full_date || null : null, outstanding: R.outstandingOf(state.lookups, d), due_status: C.payState[R.paymentState(d, today)], pic: d.pic || null };
    });
  }
  function postsRows(state, posts, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), rules = state.lookups.tier_rules || [];
    return posts.map(x => {
      const d = ctx.deals.get(x.deal_id) || {}, k = ctx.kols.get(d.kol_id) || {}, a = ctx.accounts.get(x.account_id) || {}, r = ctx.phaseIdx.post.get(x.post_id) || { slot: 'unscheduled' };
      /* phase_source: auto (from the date) · override (picked) · unscheduled · needs (CR-03 §4.2) */
      const source = r.phase ? (r.kind === 'auto' ? 'auto' : 'override') : r.slot;
      return Object.assign({}, x, { campaign_id: d.campaign_id, campaign_name: (ctx.campaigns.get(d.campaign_id) || {}).campaign_name || null, phase_id: r.phase || null,
        phase_name: r.phase ? R.phaseName(state, r.phase) : null, phase_seq: r.phase && ctx.phases.has(r.phase) ? R.phaseSeq(state.phases, ctx.phases.get(r.phase)) : null,
        phase_label: r.phase ? (ctx.phases.get(r.phase) || {}).label || null : null, phase_source: source, phase_override: x.phase_override || null,
        post_share: r.share == null ? null : Math.round(r.share * 100) / 100, kol_id: d.kol_id, kol_name: k.display_name, platform: a.platform || x.platform,
        handle: a.handle, followers: a.followers, tier: R.tierOf(a.followers, rules), deal_status: d.status, deal_sub_status: d.sub_status });
    });
  }
  function logRows(state, logs, ctxIn) {
    const ctx = ctxIn || R.dealContext(state);
    return logs.map(l => { const d = ctx.deals.get(l.deal_id) || {}; return Object.assign({}, l, { campaign_id: d.campaign_id, campaign_name: (ctx.campaigns.get(d.campaign_id) || {}).campaign_name || null, kol_name: (ctx.kols.get(d.kol_id) || {}).display_name }); });
  }
  function kolRows(state, kols) {
    const ix = R.kolIndex(state), rules = state.lookups.tier_rules || [], pidx = R.perfIndex(state);
    return kols.map(k => {
      const accs = ix.accounts.get(k.kol_id) || [], mf = R.maxFollowers(accs), q = (ix.quotes.get(k.kol_id) || [])[0], last = R.lastWorkedInfo(state, k.kol_id, pidx);
      return Object.assign({}, k, { kol_type: R.kolTypeLabel(state.lookups, k.kol_type) || null, partner_type: R.partnerTypeLabel(state.lookups, R.partnerTypeOf(k)), contact_id: k.contact_id || null, account_count: accs.length, platforms: [...new Set(accs.map(a => a.platform))], max_followers: mf, tier: R.tierOf(mf, rules),
        deal_count: (ix.deals.get(k.kol_id) || []).length, latest_quote_total: q ? totalCost(q) || null : null, latest_quote_source: q ? q.source : null,
        last_worked: last ? last.date : null, last_campaign: last ? R.campaignName(state, last.campaignId) || null : null });   // CR-14 §4.4 — the same as the screen
    });
  }
  function accountRows(state, accounts) {
    const ix = R.kolIndex(state), kols = new Map(state.kol_master.map(k => [k.kol_id, k])), rules = state.lookups.tier_rules || [];
    return accounts.map(a => Object.assign({}, a, { kol_name: (kols.get(a.kol_id) || {}).display_name, tier: R.tierOf(a.followers, rules), post_count: ix.postsByAccount.get(a.account_id) || 0 }));
  }
  function quoteRows(state, quotes) {
    const kols = new Map(state.kol_master.map(k => [k.kol_id, k])), accs = new Map(state.kol_accounts.map(a => [a.account_id, a]));
    return quotes.map(q => { const a = accs.get(q.account_id) || {};
      return Object.assign({}, q, { kol_name: (kols.get(q.kol_id) || {}).display_name, platform: a.platform, handle: a.handle, total: totalCost(q) || null }); });
  }
  /* §10.2 one row per deal: deal_id, Phase (the primary Phase, CR-03), then the 36 Template columns in order */
  function templateExport(state, deals, ctxIn) {
    const ctx = ctxIn || R.dealContext(state), prim = d => { const id = R.primaryPhase(ctx.phaseIdx, d.deal_id); return ctx.phases.has(id) ? id : ''; };
    return { header: ['deal_id', 'Phase'].concat(R.TEMPLATE_HEADERS), rows: deals.map(d => [d.deal_id, prim(d)].concat(R.templateRow(state, d, ctx))) };
  }

  /* ===================== KOL import (§7.4 · CR-14 §4.6) ===================== */
  /* the template of today (KOL_Master_Import_Template · sheet KOL_Import): 11 columns in this order — the first 4 are required ·
     CR-25: + partner_type (optional: KOL · Affiliate · Both, any case · blank = KOL · anything else = an error for the row) */
  const TEMPLATE_COLS = ['display_name', 'platform', 'profile_link', 'followers', 'kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'contact_id', 'partner_type'];
  const IMPORT_REQUIRED = ['display_name', 'platform', 'profile_link', 'followers'];
  /* every column read (any order · no case · spaces cut): the template + the old file's prices and note (16 columns) */
  const IMPORT_COLS = TEMPLATE_COLS.concat(['rate_card', 'gencode_expense', 'gencode_period', 'basket_fee', 'asset_fee', 'expediting_fee', 'note']);
  const importHead = h => String(h == null ? '' : h).replace(/^\uFEFF/, '').trim().toLowerCase();
  /* a count as typed: "125,000" → "125000" (blank → '') */
  const importNum = v => String(v == null ? '' : v).replace(/[,\s]/g, '');
  /* the template as a CSV (UTF-8 with BOM, the header only) */
  const templateCSV = () => '\uFEFF' + TEMPLATE_COLS.join(',') + '\r\n';
  /* handle from a profile link: TikTok/IG/X rule first, else the first path part (Facebook page, Lemon8 @name, YouTube @name) */
  function handleFromAnyLink(url) {
    const h = R.handleFromLink(url); if (h) return h;
    try {
      const u = new URL(String(url).trim());
      if (/profile\.php$/i.test(u.pathname) && u.searchParams.get('id')) return u.searchParams.get('id');
      const seg = u.pathname.split('/').filter(Boolean).find(x => !['p', 'reel', 'reels', 'watch', 'share', 'stories', 'channel', 'c', 'user', 'pages'].includes(x.toLowerCase()));
      return seg ? decodeURIComponent(seg).replace(/^@/, '') : '';
    } catch (e) { return ''; }
  }
  /* text rows (first row = header) → a plan per row: match · new_account (needs a tick) · new_kol · error */
  function planImport(state, table) {
    const head = (table[0] || []).map(importHead);
    const missing = IMPORT_REQUIRED.filter(c => !head.includes(c));
    if (missing.length) return { headerError: M.importMissingCol(missing), rows: [], ignored: [] };
    /* a column the app does not know is skipped and named in the report */
    const ignored = [...new Set(head.filter(h => h && !IMPORT_COLS.includes(h)))];
    const fileNew = new Map();   // a new KOL made by an earlier row of this file: its name → that row
    const L = state.lookups, platforms = L.platform_list || [];
    const accKey = new Map(state.kol_accounts.map(a => [a.platform + '|' + String(a.handle).toLowerCase(), a]));
    const seen = new Map(), out = [];
    table.slice(1).forEach((cells, i) => {
      const n = i + 2, row = {};
      if (!(cells || []).some(c => trim(c))) return;   // an empty row (the template keeps 500 of them)
      head.forEach((h, j) => { if (IMPORT_COLS.includes(h) && !(h in row)) row[h] = trim(cells[j]); });
      row.followers = importNum(row.followers);
      R.PRICE_KEYS.forEach(k => { if (row[k] != null) row[k] = importNum(row[k]); });
      const errs = [], warns = [];
      const name = row.display_name;
      if (!name) errs.push(M.importNoName);
      let platform = platforms.find(p => p.toLowerCase() === String(row.platform || '').toLowerCase()) || '';
      if (row.platform && !platform) warns.push(M.importPlatformUnknown(row.platform));
      if (!row.profile_link) errs.push(M.importNoLink);
      else if (!R.isHttpLink(row.profile_link)) errs.push(M.importBadLink);
      if (!platform && row.profile_link) platform = R.platformFromLink(row.profile_link);
      if (!platform && R.isHttpLink(row.profile_link)) errs.push(M.importNoPlatform);
      const handle = R.isHttpLink(row.profile_link) ? handleFromAnyLink(row.profile_link) : '';
      if (R.isHttpLink(row.profile_link) && !handle) errs.push(M.importNoHandle);
      if (!isBlank(row.followers) && (isNaN(row.followers) || Number(row.followers) < 0)) errs.push(M.importNumber('followers'));
      R.PRICE_KEYS.forEach(k => { if (!isBlank(row[k]) && (isNaN(row[k]) || Number(row[k]) < 0)) errs.push(M.importNumber(k)); });
      /* CR-07 §4.6: Type = a preset (label or alias, any case) · anything else → Not set, kept in the note as "Old type: …" */
      const typeKey = R.matchKolType(row.kol_type, L.kol_type_list), oldType = !isBlank(row.kol_type) && !typeKey ? row.kol_type : null;
      if (oldType) warns.push(C.kolTypes.importUnknown(oldType));
      const clean = { kol_category: row.kol_category || null, kol_type: typeKey, kol_type_legacy: isBlank(row.kol_type) ? null : row.kol_type, oldType, note: row.note || null };
      if (R.looksSensitive(clean.note)) { clean.note = null; warns.push(M.importSensitive('note')); }   // CR-08 §4.4
      /* CR-25 — partner_type: blank = KOL · a word that is not KOL / Affiliate / Both → the row is not imported */
      clean.partner_type = R.parsePartnerType(row.partner_type, L); clean.partnerGiven = !isBlank(row.partner_type);
      if (!clean.partner_type) { clean.partner_type = 'kol'; errs.push(C.partner.importBad(row.partner_type)); }
      /* CR-14 §4.5 — a phone number in contact_id: the row is not imported · longer than 120: left out */
      clean.contact_id = row.contact_id || null;
      const cp = R.contactIdProblem(clean.contact_id);
      if (cp === 'phone') { clean.contact_id = null; errs.push(M.importPhone); }
      else if (cp === 'long') { clean.contact_id = null; warns.push(M.importIgnored('contact_id', row.contact_id.slice(0, 20) + '…')); }
      [['gender', R.GENDERS], ['pic', R.picNames(state)], ['contact_channel', R.CONTACT_CHANNELS]].forEach(([k, list]) => {
        if (isBlank(row[k])) { clean[k] = null; return; }
        const v = list.find(x => x.toLowerCase() === row[k].toLowerCase());
        if (v) clean[k] = v; else { clean[k] = null; warns.push(M.importIgnored(k, row[k])); }
      });
      let kind = 'error', kol = null, account = null;
      if (!errs.length) {
        const key = platform + '|' + handle.toLowerCase();
        if (seen.has(key)) errs.push(M.importDupRow(seen.get(key)));
        else {
          seen.set(key, n);
          account = accKey.get(key) || null;
          if (account) { kind = 'match'; kol = state.kol_master.find(k => k.kol_id === account.kol_id) || null; }
          else {
            const same = state.kol_master.filter(k => trim(k.display_name).toLowerCase() === name.toLowerCase());
            if (same.length > 1) warns.push(M.importManyNames(same.map(k => k.kol_id).join(', ')));
            kind = same.length === 1 || (!same.length && fileNew.has(name.toLowerCase())) ? 'new_account' : 'new_kol';
            kol = same.length === 1 ? same[0] : null;
            if (isBlank(row.followers)) { errs.push(M.importNoFollowers); kind = 'error'; }
          }
        }
      }
      if (errs.length) kind = 'error';
      /* the same name as a new KOL further up this file → an account of that KOL (ticked like any new account) */
      const ofRow = kind === 'new_account' && !kol ? fileNew.get(name.toLowerCase()) : null;
      if (kind === 'new_kol') fileNew.set(name.toLowerCase(), n);
      /* existing values are never overwritten (CR-01) — a different contact ID in the file is said so */
      if (kol && !isBlank(kol.contact_id) && clean.contact_id && clean.contact_id !== kol.contact_id) warns.push(M.importKeptContact);
      const prices = {}; R.PRICE_KEYS.forEach(k => { if (!isBlank(row[k]) && !isNaN(row[k])) prices[k] = Number(row[k]); });
      out.push({ n, name, platform, handle, link: row.profile_link, followers: isBlank(row.followers) || isNaN(row.followers) ? null : Number(row.followers),
        clean, prices, kind, kol, account, ofRow, errs, warns, needsConfirm: kind === 'new_account' });
    });
    return { headerError: null, rows: out, ignored };
  }
  const nextIdIn = (prefix, arr, key, width) => prefix + String(arr.reduce((m, x) => Math.max(m, parseInt(String(x[key]).replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(width, '0');
  /* → the new collections + a summary; rows of kind new_account are applied only when their row number is in `confirmed` */
  function applyImport(state, plan, confirmed, fileName, today) {
    const kols = state.kol_master.map(k => Object.assign({}, k, { sources: (k.sources || []).slice() }));
    const accounts = state.kol_accounts.map(a => Object.assign({}, a));
    const quotes = state.kol_rate_quotes.slice();
    const sum = { match: 0, new_account: 0, new_kol: 0, skipped: 0, error: 0, quotes: 0 }, made = new Map();   // the KOLs this file made, by name
    const fill = (k, clean) => {
      const hadType = !isBlank(k.kol_type);
      ['kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'contact_id', 'note'].forEach(f => { if (isBlank(k[f]) && !isBlank(clean[f])) k[f] = clean[f]; });
      if (isBlank(k.partner_type) && clean.partnerGiven) k.partner_type = clean.partner_type;   // CR-25: a KOL with none (= KOL) takes the file's · one already set stays
      if (!hadType && clean.oldType) k.note = R.withOldType(k.note, clean.oldType);
    };
    const addSource = k => { if (!k.sources.includes(fileName)) k.sources.push(fileName); };
    const addQuote = (r, kolId, accountId) => {
      if (!Object.keys(r.prices).length) return;
      const q = { quote_id: nextIdIn('Q', quotes, 'quote_id', 5), kol_id: kolId, account_id: accountId, quoted_at: today, source: M.importSource(fileName), source_row: r.n };
      R.PRICE_KEYS.forEach(k => { q[k] = r.prices[k] != null ? r.prices[k] : null; });
      q.note = null;
      quotes.push(q); sum.quotes++;
    };
    plan.rows.forEach(r => {
      if (r.kind === 'error') { sum.error++; return; }
      if (r.kind === 'new_account' && !confirmed.has(r.n)) { sum.skipped++; return; }
      if (r.kind === 'match') {
        const a = accounts.find(x => x.account_id === r.account.account_id), k = kols.find(x => x.kol_id === a.kol_id);
        if (r.followers != null && (a.followers == null || r.followers > Number(a.followers))) a.followers = r.followers;
        if (isBlank(a.profile_link)) a.profile_link = r.link;
        fill(k, r.clean); addSource(k); addQuote(r, k.kol_id, a.account_id); sum.match++;
        return;
      }
      let k = r.kind === 'new_account' ? (r.kol ? kols.find(x => x.kol_id === r.kol.kol_id) : made.get(r.name.toLowerCase())) : null;
      if (k) fill(k, r.clean);
      else {
        k = { kol_id: nextIdIn('K', kols, 'kol_id', 4), display_name: r.name, kol_category: r.clean.kol_category, kol_type: r.clean.kol_type, kol_type_legacy: r.clean.kol_type_legacy, gender: r.clean.gender,
          pic: r.clean.pic, kol_status: 'Active', status_reason: null, contact_channel: r.clean.contact_channel, contact_id: r.clean.contact_id || null,
          note: r.clean.oldType ? R.withOldType(r.clean.note, r.clean.oldType) : r.clean.note, sources: [], partner_type: r.clean.partner_type };
        kols.push(k); made.set(r.name.toLowerCase(), k);
      }
      addSource(k);
      const a = { account_id: nextIdIn('A', accounts, 'account_id', 5), kol_id: k.kol_id, platform: r.platform, handle: r.handle, profile_link: r.link, followers: r.followers, is_legacy: false };
      accounts.push(a);
      addQuote(r, k.kol_id, a.account_id);
      sum[r.kind]++;
    });
    return { kol_master: kols, kol_accounts: accounts, kol_rate_quotes: quotes, summary: sum };
  }

  return { toCSV, parseCSV, DEALS_COLS, POSTS_COLS, LOG_COLS, KOL_COLS, ACCOUNT_COLS, QUOTE_COLS, PAYMENTS_COLS,
    dealsRows, paymentsRows, postsRows, logRows, kolRows, accountRows, quoteRows, templateExport,
    TEMPLATE_COLS, IMPORT_REQUIRED, IMPORT_COLS, templateCSV, handleFromAnyLink, planImport, applyImport };
})(KT.rules, KT.content));
