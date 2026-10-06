/* rules-kol.js — CR-07 §4.5–4.6: KOL Type presets (lookups.kol_type_list, migration v7, import) and the Price reference
   (Latest rate · Average of past deals) used where costs are typed by hand. Pure functions; adds to KT.rules (load after rules-roles.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, trim, totalCost, isCancelled, termOf } = R;
  const KT_ = C.kolTypes;

  /* ===================== KOL Type presets (§4.6) ===================== */
  /* the starting list: aliases are the old free-text values (and what an import may say) — matched trimmed, any case */
  const KOL_TYPE_DEFAULT = [
    { key: 'beauty', label: 'Beauty', aliases: ['Mass Beauty', 'Beauty', 'Mass', 'lisa makeup', 'KOL ที่เคยทำคุชชั่นชมพู'], sort_order: 10 },
    { key: 'k_beauty', label: 'K-beauty', aliases: ['KOL สายแบรนด์เกา', 'Korea', 'รีวิว Korea Brand'], sort_order: 20 },
    { key: 'beauty_expert', label: 'Beauty expert', aliases: ['Profession-based KOLs'], sort_order: 30 },
    { key: 'makeup_artist', label: 'Make-up artist', aliases: ['MAKE UP ARTIST (GEN Z)', 'MAKE UP ARTIST (GEN Y)', 'MUA'], sort_order: 40 },
    { key: 'swatch_selling', label: 'Swatch & selling', aliases: ['สวอช และขายสินค้า', 'เทียบสีคุชชั่น', 'ex. คุชชั่นที่เจอแล้วอยากรีบมาป้ายยา'], sort_order: 50 },
    { key: 'benefit_review', label: 'Benefit review', aliases: ['เล่าเบเน', 'เล่าเบเน/ คิวได้ ตค'], sort_order: 60 },
    { key: 'student', label: 'Student', aliases: ['Student'], sort_order: 70 },
    { key: 'lifestyle', label: 'Lifestyle', aliases: ['Lifestyle', 'real life', 'Cosplay'], sort_order: 80 },
    { key: 'outdoor_activity', label: 'Outdoor & activity', aliases: ['Outdoor', 'Activity', 'ทดลองใช้จริง ไป outdoor'], sort_order: 90 },
    { key: 'fan', label: 'Fan', aliases: ['ไปคอนโฟร์ท', 'Charmiss Fan', 'lisa fan', 'content lisa', 'เคยใช้ CHY'], sort_order: 100 },
    { key: 'overseas', label: 'Overseas-based', aliases: ['Taiwan / Los Angeles', 'Japan', 'Thai , Base USA'], sort_order: 110 },
  ];
  const kolTypeDefault = () => KOL_TYPE_DEFAULT.map(t => Object.assign({}, t, { aliases: t.aliases.slice(), active: true }));
  const typeNorm = v => trim(v).replace(/\s+/g, ' ').toLowerCase();
  /* text (an old value or an import cell) → the key of the preset whose label or alias it is · null */
  function matchKolType(text, list) {
    const t = typeNorm(text); if (!t) return null;
    const hit = (list || []).find(x => typeNorm(x.label) === t || x.key === t || (x.aliases || []).some(a => typeNorm(a) === t));
    return hit ? hit.key : null;
  }
  const kolTypeList = L => ((L && L.kol_type_list) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const kolTypeOf = (L, key) => ((L && L.kol_type_list) || []).find(x => x.key === key) || null;
  /* on screen: "Beauty" · "Overseas-based (inactive)" · '' = Not set (a key no longer in the list shows as it is) */
  function kolTypeLabel(L, key) {
    if (isBlank(key)) return '';
    const t = kolTypeOf(L, key);
    return t ? (t.active === false ? KT_.inactiveLabel(t.label) : t.label) : String(key);
  }
  /* note + "Old type: …" on its own line, once */
  function withOldType(note, legacy) {
    const v = trim(legacy); if (!v) return note == null ? null : note;
    const line = KT_.oldTypeNote(v);
    if (String(note || '').split('\n').some(l => trim(l) === line)) return note;
    return trim(note) ? `${note}\n${line}` : line;
  }
  /* migration v6 → v7 for one KOL (idempotent): keep the old text, set the key, or move a value that is not a type into the note */
  function migrateKolType(k, list) {
    if (k.kol_type_legacy !== undefined) return k;
    const old = isBlank(k.kol_type) ? null : k.kol_type;
    k.kol_type_legacy = old;
    const key = matchKolType(old, list);
    k.kol_type = key;
    if (!key && old) k.note = withOldType(k.note, old);
    return k;
  }
  /* how many KOLs use each key (+ '' = Not set) */
  function kolTypeCounts(state) {
    const m = new Map([['', 0]]);
    (state.kol_master || []).forEach(k => { const v = isBlank(k.kol_type) ? '' : k.kol_type; m.set(v, (m.get(v) || 0) + 1); });
    return m;
  }
  const kolTypeUse = (state, key) => (state.kol_master || []).filter(k => k.kol_type === key).length;
  /* a new key from the label (fixed afterwards): "Skincare" → skincare · Thai only → type_n */
  function kolTypeKeyFor(label, list) {
    const base = trim(label).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'type';
    const used = new Set((list || []).map(x => x.key));
    if (!used.has(base) && base !== 'type') return base;
    let n = 2; while (used.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }
  /* Settings › KOL types: a label is needed and must not be another type's label or alias */
  function validateKolType(list, label, aliases, key) {
    const errs = [], l = typeNorm(label), others = (list || []).filter(x => x.key !== key);
    if (!l) errs.push({ field: 'label', msg: KT_.labelRequired });
    else if (others.some(x => typeNorm(x.label) === l || (x.aliases || []).some(a => typeNorm(a) === l))) errs.push({ field: 'label', msg: KT_.labelTaken(trim(label)) });
    const dup = (aliases || []).map(trim).filter(Boolean).find(a => others.some(x => typeNorm(x.label) === typeNorm(a) || (x.aliases || []).some(b => typeNorm(b) === typeNorm(a))));
    if (dup) errs.push({ field: 'aliases', msg: KT_.aliasTaken(dup) });
    return { errs, warns: [], infos: [] };
  }
  const splitAliases = text => [...new Set(String(text || '').split(/[\n,]+/).map(trim).filter(Boolean))];

  /* ===================== Price reference (§4.5) ===================== */
  const COST_KEYS = R.COST_KEYS;   // Rate card · Gencode · Basket fee · Asset fee · Expediting fee
  const costsOf = o => Object.fromEntries(COST_KEYS.map(k => [k, isBlank(o[k]) || isNaN(o[k]) ? 0 : Number(o[k])]));
  const sumOf = v => COST_KEYS.reduce((a, k) => a + (v[k] || 0), 0);
  /* Latest rate = the newest quote with a rate card (§4 order: quoted_at newest, undated last, then the highest quote_id) ·
     note = a newer quote without a number (or the only kind there is) that says something ·
     Average of past deals = this KOL's agreed prices: Confirm QT onward, not cancelled, not free (term Free or ฿0) —
     per field (blank = 0), rounded to the baht; excludeDealId leaves the deal being edited out */
  function costReference(state, kolId, excludeDealId) {
    const quotes = R.quotesOfKol(state, kolId), lq = quotes.find(q => !isBlank(q.rate_card) && !isNaN(q.rate_card)) || null;
    const latest = lq ? { values: costsOf(lq), source: lq.source || '', date: lq.quoted_at || null, quoteId: lq.quote_id } : null;
    if (latest) latest.total = sumOf(latest.values);
    const newer = quotes.slice(0, lq ? quotes.indexOf(lq) : quotes.length).find(q => !isBlank(q.note));
    const agreed = R.dealsOfKol(state, kolId).filter(d => d.deal_id !== excludeDealId && !isCancelled(d) && !R.isShortlist(state.lookups, d));
    const paid = agreed.filter(d => termOf(d) !== 'free' && totalCost(d) > 0);
    let average = null;
    if (paid.length) {
      const values = Object.fromEntries(COST_KEYS.map(k => [k, Math.round(paid.reduce((a, d) => a + costsOf(d)[k], 0) / paid.length)]));
      average = { values, total: sumOf(values), n: paid.length, dealIds: paid.map(d => d.deal_id) };
    }
    return { latest, note: newer ? trim(newer.note) : null, average, freeExcluded: agreed.length - paid.length };
  }
  /* rows to show: Rate card and Total always · the others when either column has a value */
  const costRefRows = ref => COST_KEYS.filter(k => k === 'rate_card' || [ref.latest, ref.average].some(c => c && c.values[k])).concat(['total']);
  const hasCosts = d => COST_KEYS.some(k => !isBlank(d[k]));
  /* a deal with no cost typed in yet and not a free job → "Cost not set" (counts ฿0) */
  const costNotSet = d => !hasCosts(d) && termOf(d) !== 'free';
  /* moving to Confirm QT (or later) from before it while the total is ฿0 and the job is not Free → ask first (a warning, not a block) */
  function zeroCostMove(state, deal, toSub) {
    const L = state.lookups, to = R.stepOf(L, toSub), qt = R.stepOf(L, 'Confirm QT'), cur = R.stepOf(L, deal.sub_status);
    if (!to || !qt || R.isCancelStep(to) || to.sort_order < qt.sort_order) return false;
    if (cur && !R.isCancelStep(cur) && cur.sort_order >= qt.sort_order) return false;
    return totalCost(deal) === 0 && termOf(deal) !== 'free';
  }

  return { KOL_TYPE_DEFAULT, kolTypeDefault, matchKolType, kolTypeList, kolTypeOf, kolTypeLabel, withOldType, migrateKolType, kolTypeCounts, kolTypeUse,
    kolTypeKeyFor, validateKolType, splitAliases, costReference, costRefRows, hasCosts, costNotSet, zeroCostMove };
})(KT.rules, KT.content));
