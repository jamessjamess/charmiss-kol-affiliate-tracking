/* store.js — state persistence for KOL Tracker.
   First open: SEED → localStorage (key charmiss_kol_tracker_v1); afterwards localStorage is the source.
   Every storage call is wrapped in try/catch: when the browser refuses to store (private mode, quota),
   the app keeps working in memory and status.canSave turns false so the UI can warn. → KT.store

   schema_version 2 (CR-02) — migrate() upgrades the seed, saved data and v1 backups once, when they are loaded.
   It only adds fields; nothing is removed or changed:
     deals.draft_rounds      3 if a Draft 3 date or SubStatus Approve Draft 3 · 2 the same for Draft 2 · else 1
     deals.script_required   true if the status log ever shows Approve Script
     deals.payment_term      'split_50' if paid_50 · else the KOL's default · else null (= Not set)
     kol_master.default_payment_term   null (the team fills it in KOL Master)
     deal_events             new, empty (append-only: type pic | plan | payment_term, from, to, changed_at, note)

   schema_version 3 (CR-03) — a deal belongs to a Campaign; each post gets its Phase from its date (rules-phase.js resolvePostPhase):
     deals.campaign_id       the Campaign of the old phase_id · deals.legacy_phase_id = the old phase_id · deals.phase_id is removed
     deal_posts.phase_override   the old phase_id when the date cannot decide (no date · outside every Phase · Phases overlap), else null
     campaigns.budget_kol    sum of its Phase budgets · campaigns.pillar_target = null (use the default)
     lookups.pillar_target_default   {awareness: 10, consideration: 20, conversion: 70}
   Phase of a post (resolvePostPhase): phase_override if set, else the one Phase of the deal's Campaign whose dates hold the
   post date (or the expected date while not posted) · no date = Unscheduled · no Phase or several = Needs phase.
   Dates of deals and posts are never changed.

   schema_version 4 (CR-04) — people and roles:
     users                   new: U000 "Admin" (admin) + one staff user per name of the old lookups.pic_list (is_pic, pic_name = that name;
                             a name switched off in Settings becomes an inactive user) · lookups.pic_list is removed (the PIC list comes from users)
     meta.current_user_id    U000 · the person working in this browser (Switch user in the side menu) — a Restore keeps it when that user exists
     lookups.cta_list        TikTok · All Channel · Eveandboy · 7-11 when empty · campaigns.cta = null (the team sets it)
     deal_status_log / deal_events.changed_by = the current user from now on; older rows keep null ("System import")
   Roles decide what each person sees and can edit on screen in this file only; anyone with the file can still change the data.

   schema_version 5 (CR-05) — users.role may also be 'kol_manager' · campaigns.short_code is removed (if any) ·
     campaigns.status_override / status_reason / status_changed_at = null (On hold · Cancelled, set in the Campaign drawer)
     campaign_events   new, empty (append-only: the Phase Planner's saves · status changes)
     new IDs: Campaign CMP-0001 … · Phase PHS-0001 … (internal, never on screen; the seed's CH, CH-P1 … stay)
   "View as role" (an admin seeing the app as KOL Manager / Staff / Viewer) is kept in sessionStorage only — never in this state or a Backup.

   schema_version 6 (CR-06) — products and Phase names by place:
     products            new: {tr_code (unique, case and outer spaces ignored), product_name, variant, active} — Settings › Products
     campaign_products   new: {campaign_id, tr_code, sort_order} · deal_products new: {deal_id, tr_code, qty ≥ 1, note}
                         (qty is where a product requisition would start later — not built in CR-06)
     deals.tr_codes      → products (product_name = the code) + campaign_products + deal_products (qty 1), then removed (the seed has none)
     phases.phase_name   → phases.label ("Phase 2 · Conversion" → "Conversion" · "Phase 3" → none · "October" → "October"), then removed:
                         the name on screen is "Phase {seq}" + " · {label}", seq = order by start date in the Campaign (rules-phase.js phaseTitleOf)
     lookups.ontime_grace_days = 1 · lookups.reliability_min_posts = 2 (KOL performance)
   schema_version 7 (CR-07) — KOL Type presets:
     lookups.kol_type_list   new: [{key, label, aliases[], active, sort_order}] (rules-kol.js KOL_TYPE_DEFAULT) — Settings › KOL types;
                             key is made from the first label and never changes · aliases = old words / import values that mean this type
     kol_master.kol_type     now the key of a preset, or null (Not set) — it was free text
     kol_master.kol_type_legacy  new: the old text (null when there was none) — kept for checking, not shown in the table;
                             an old value that is not a type becomes Not set and is added to the note as "Old type: …" (once)
   schema_version 8 (CR-08) — Payments:
     payee_profiles      new: {payee_id PY-0001, kol_id? (one per KOL; null = a payee outside KOL Master, e.g. Affiliate), account_handle, payee_type (individual | company),
                         vat_registered, default_wht_rate, price_basis (gross | net), bank_name, account_last4, docs {id_copy, bank_book, company_cert, vat_cert} = date received | null,
                         docs_link, secure {key_id, wrapped_key, iv, ciphertext} | null (vault.js — name, address, phone, WHT contact, account number, tax ID, encrypted),
                         details_version, details_updated_at/by, needs_verification, verified_at/by, created_by/at, updated_at/by} — no personal data in plain text
     payment_lines       new (filled from CR-08 R2): one row per payment (an instalment of a deal, or a manual line)
     payment_runs        new (filled from CR-08 R3): the weekly payment run (PR)
     lookups.payment_settings  vat_rate 7 · wht_threshold 1000 · wht_rates [0,1,2,3,5] · default WHT individual 3 / company 3 · bands [1000, 10000] · run_weekday 5 (Friday)
     lookups.payee_vault       null until an admin sets it up: {key_id, public_key_jwk, wrapped_private_key, salt, iv, iterations 600000, created_at/by, passphrase_changed_at} —
                         the private key is encrypted with the passphrase, which is never stored
     deal_events         type 'payee_details_changed' (deal_id null, payee_id; no values) · 'payment' (from R3)
     the deal flags docs_done / paid_50 / paid_full (+ dates) stay as they are — every money figure is unchanged
   schema_version 9 (CR-09) — Accounting:
     campaign_events     type 'products' {from: {products: [tr_code]}, to: {products}} also when Staff change a Campaign's products (§4.7) — the list is made when missing
     users.role          + 'accounting' · the migration adds Earn (Accounting, not a PIC) once — a user deleted later is not added back
     payment_runs        + returned_reason · returned_at · returned_by (Accounting sends a run back to the team; empty = never returned)
   schema_version 10 (CR-10) — post performance:
     deal_posts          + metrics_source ('manual' | 'paste' | 'legacy' | null) · metrics_updated_by (user id | null) — a post that has metrics but no
                         metrics_updated_at becomes 'legacy' (shown "Imported") · views … saves stay whole numbers ≥ 0 or null (null = no data ≠ 0)
     lookups.metrics_stale_days = 14 (Settings › Lists) · deal_events type 'metrics' (from / to = the five values) from CR-10 R2
   schema_version 11 (CR-10 R6) — Samples:
     sample_shipments    new: {shipment_id SH000001, deal_id, kol_id, items [{tr_code, qty}], ship_by, status (to_ship | shipped | delivered | problem | not_required),
                         ship_by_overridden, shipped_date, carrier, tracking_no, delivered_date, problem_reason, not_required_reason, source (auto | manual | legacy), note,
                         created_by/at, updated_by/at} — a deal with delivered = true gets a Delivered (legacy) shipment, an open deal from Confirm QT on gets a To ship (auto)
                         (rules-samples.js migrateSamples) · deals.delivered / delivery_date stay and follow the shipments from now on (ui.commit → R.syncShipments)
     lookups.sample_settings  lead_days 7 · carriers · tracking_url {carrier: 'https://…{tracking}'}
     payee_profiles.secure_ship  the shipping details (recipient · phone · address) encrypted like the bank details · shipping_on_file true / false
   schema_version 12 (CR-11 R3) — go-live · shipments · fill-once (rules-golive.js migrateV12):
     lookups.go_live     {date (the day this upgrade ran — Settings › Go-live clean-up can change it), completed_at, completed_by} — what came from the old files
                         and is closed shows "—" instead of a warning (rules.isImportedClosed) · the data is never cut by this date
     payment_lines.status  + 'on_hold' (hold_reason · hold_by · hold_at · hold_created when Hold made the line) — To pay › Hold / Release
     sample_shipments    + purpose ('review' for all of them) · campaign_id (the deal's) · pick_list_id · deal_id may be empty and source 'other' (Shipments › New shipment)
     pick_lists          new: {pick_list_id PK0001, name, shipment_ids [], created_by, created_at}
     phases.default_pillar  a label with exactly one pillar word → that pillar (seed: KS Phase 1 Awareness · KS Phase 2 Conversion) · else null — deals untouched
     campaigns.default_payment_term = null · lookups.metrics_checkpoints = [7] (days after the post)
     deal_events         type 'payment_hold' (from → to, note = the reason) · 'shipment'
     the stored data from before is kept once in localStorage (charmiss_kol_tracker_v1_before_v12) — Settings › Data can download it
   schema_version 13 (CR-14) — kol_master.contact_id (LINE ID · Agency + person · work e-mail · DM handle · never a phone number) = null for every KOL
                         (rules-kol.js migrateV13 · nothing is read from the notes)
   schema_version 14 (CR-15) — the journey of today (rules-journey.js migrateV14): lookups.journey_steps = Shortlist · Contacted · Confirm QT · Brief ·
                         Script · Draft 1–3 · Approve · Post · Cancel (a label someone typed stays with its step) · sub_status Approve Script → Script ·
                         Approve Draft n → Draft n in deals and deal_status_log (dates untouched) · deals + expected_script_date · script_date ·
                         expected_approve_date · approved_date (null) · deals.script_required is no longer used (kept) ·
                         a copy of the data from before stays in localStorage (charmiss_kol_tracker_v1_before_v14)
   schema_version 15 (CR-16) — rules-profile.js migrateV15: payee_profiles + label ("Primary") · is_default (one a KOL) · archived ·
                         shipping_addresses (new: address_id AD-0001 · kol_id · label · is_default · archived · secure {recipient · phone · address},
                         encrypted) — the shipping details a payee held (secure_ship) move there as they are (never decrypted) ·
                         deals.payee_id · sample_shipments.address_id · kol_master.photo (metadata; the picture is in IndexedDB kol_photos) = null ·
                         a copy of the data from before replaces the v14 one (charmiss_kol_tracker_v1_before_v15)
   schema_version 16 (CR-17) — rules-ops.js migrateV16: lookups.ops_mode simple / simple · payment_lines paid_by · paid_ref · sent_at (= the run's submitted_at
                         when it was With Accounting) · sent_by · unpaid_reason · campaigns / phases approval_status 'approved' · approval · pending_change null
   schema_version 17 (CR-18) — rules-budget.js migrateV17: campaign_budget_changes (new: change_id BG-0001 · campaign_id · type initial / increase / decrease ·
                         amount · allocations [{ phase_id | 'unallocated', amount }] · reason · note · status pending / approved / rejected / cancelled ·
                         requested_by · requested_at · decided_by · decided_at · reject_reason · budget_before · budget_after) — one approved initial row
                         (by "system") for every Campaign with a budget · campaigns.budget_kol = the approved total · phases.budget_kol = approved
   schema_version 18 (CR-19) — rules-overview.js migrateV18: lookups.pillar_list + "Awareness & Consideration" (after Awareness) · a Phase with no
                         default_pillar whose label says Awareness and Consideration gets it · campaigns.pillar_target / lookups.pillar_target_default kept, unused
   schema_version 19 (CR-20) — rules-package.js migrateV19: kol_packages (new: package_id PKG000001 · kol_id · name · units_total · price_total · start_date ·
                         valid_until · payee_id · payment_status to_pay / sent / paid · paid_date · note · archived · created_by · created_at · updated_at) ·
                         step_notes (new: deal_id + step_key draft_1 / draft_2 / draft_3 · note · links [] · image_ids [] · updated_by · updated_at — the images
                         themselves are in IndexedDB step_images, never here) · deals + package_id null · package_units 1 · package_paid false · script_link null ·
                         payment_lines + package_id null · payment term 'package' (R.PAYMENT_TERMS)
   schema_version 20 (CR-21) — rules-request.js migrateV20: campaigns / phases approval_status draft · pending · approved (rejected → draft + returned_reason /
                         returned_by / returned_at from the latest rejected event · submit_round = the submitted events · last_submitted = what was returned) ·
                         pending_change + status draft / pending (+ submit_round · returned_* · last_submitted) — a rejected change (change_rejected) → a returned draft ·
                         campaign_budget_changes.status draft · pending · approved · cancelled (rejected → draft + returned_*) · approved records untouched ·
                         campaign_events approval + draft_saved · resubmitted · withdrawn · returned · draft_deleted · round
   schema_version 21 (CR-22) — rules-samples.js migrateV21: sample_shipments + method npd / warehouse / self_purchase (every one there is: warehouse) ·
                         items = the deal's products (qty 1) when it had none · purchase_amount null · purchased_date null · status + kol_purchase / purchased ·
                         deals + product_purchase_fee null (in Total cost) · lookups.shipment_methods [{ key, label }] — the money does not change */

KT.store = (function (R) {
  'use strict';
  const KEY = 'charmiss_kol_tracker_v1';
  const CORRUPT_KEY = KEY + '_corrupt';
  const BEFORE_KEY = KEY + '_before_v12';   // CR-11 §3: the data as it was before schema 12
  const BEFORE14_KEY = KEY + '_before_v14';   // CR-15 §3: … and before schema 14
  const BEFORE15_KEY = KEY + '_before_v15';   // CR-16 §3: … and before schema 15 (it takes the place of the v14 copy — room in localStorage)
  const THEME_KEY = 'charmiss_kol_tracker_theme';
  const SCHEMA_VERSION = 21;
  const QUOTA_MB = 5;
  const COLLECTIONS = ['campaigns', 'phases', 'kol_master', 'kol_accounts', 'kol_rate_quotes', 'deals', 'deal_posts', 'deal_status_log', 'deal_events', 'users', 'campaign_events', 'products', 'campaign_products', 'deal_products', 'payee_profiles', 'payment_lines', 'payment_runs', 'sample_shipments', 'pick_lists', 'shipping_addresses', 'campaign_budget_changes', 'kol_packages', 'step_notes'];
  /* collections that older versions do not have yet (they are created by migrate) */
  const ADDED_IN = { deal_events: 2, users: 4, campaign_events: 5, products: 6, campaign_products: 6, deal_products: 6, payee_profiles: 8, payment_lines: 8, payment_runs: 8, sample_shipments: 11, pick_lists: 12, shipping_addresses: 15, campaign_budget_changes: 17, kol_packages: 19, step_notes: 19 };
  /* client-side IDs continue from the highest number in use */
  const ID_FORMATS = {
    kol: { prefix: 'K', coll: 'kol_master', key: 'kol_id', width: 4 },
    account: { prefix: 'A', coll: 'kol_accounts', key: 'account_id', width: 5 },
    quote: { prefix: 'Q', coll: 'kol_rate_quotes', key: 'quote_id', width: 5 },
    deal: { prefix: 'D', coll: 'deals', key: 'deal_id', width: 6 },
    payee: { prefix: 'PY-', coll: 'payee_profiles', key: 'payee_id', width: 4 },
    address: { prefix: 'AD-', coll: 'shipping_addresses', key: 'address_id', width: 4 },   // CR-16 §4.3
    line: { prefix: 'PL-', coll: 'payment_lines', key: 'line_id', width: 6 },
    post: { prefix: 'P', coll: 'deal_posts', key: 'post_id', width: 6 },
    user: { prefix: 'U', coll: 'users', key: 'user_id', width: 3 },
    shipment: { prefix: 'SH', coll: 'sample_shipments', key: 'shipment_id', width: 6 },
    pickList: { prefix: 'PK', coll: 'pick_lists', key: 'pick_list_id', width: 4 },
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const blankLocal = () => ({ created_at: null, last_backup_at: null, last_saved_at: null, restored_at: null, restored_from: null });

  /* the seed is v1 data (KOL_seed_v2.json is never edited); migrate brings it to the current version */
  function fromSeed(seed, now = new Date()) {
    const s = {
      schema_version: 1,
      seed_generated_at: (seed.meta && seed.meta.generated_at) || null,
      local: Object.assign(blankLocal(), { created_at: now.toISOString() }),
      lookups: clone(seed.lookups || {}),
    };
    COLLECTIONS.forEach(k => { if (!ADDED_IN[k]) s[k] = clone(seed[k] || []); });
    return migrate(s, now);
  }
  /* error codes (text lives in content.js settings.restoreErr) */
  function shapeErrors(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['not_object'];
    if (typeof obj.schema_version !== 'number') return ['schema_missing'];
    if (obj.schema_version > SCHEMA_VERSION) return ['schema_newer'];
    const errs = [];
    if (!obj.lookups || !Array.isArray(obj.lookups.journey_steps)) errs.push('missing:lookups');
    COLLECTIONS.forEach(k => { if ((ADDED_IN[k] || 1) <= obj.schema_version && !Array.isArray(obj[k])) errs.push('missing:' + k); });
    return errs;
  }
  /* v1 → v2 (see the top of this file) */
  /* (old data: the step names of before CR-15 — v14 renames them later) */
  const draftRoundsOf = d => (d.expected_draft3_date || d.approved_draft3_date || d.sub_status === 'Approve Draft 3') ? 3
    : (d.expected_draft2_date || d.approved_draft2_date || d.sub_status === 'Approve Draft 2') ? 2 : 1;
  function toV2(obj) {
    const script = new Set(), OLD_SCRIPT = 'Approve Script';
    obj.deal_status_log.forEach(l => { if (l.sub_status === OLD_SCRIPT || l.from_sub_status === OLD_SCRIPT) script.add(l.deal_id); });
    const kolTerm = new Map();
    obj.kol_master.forEach(k => {
      if (k.default_payment_term === undefined) k.default_payment_term = null;
      kolTerm.set(k.kol_id, R.isTerm(k.default_payment_term) ? k.default_payment_term : null);
    });
    obj.deals.forEach(d => {
      if (d.draft_rounds == null) d.draft_rounds = draftRoundsOf(d);
      if (d.script_required == null) d.script_required = script.has(d.deal_id);
      if (d.payment_term === undefined) d.payment_term = d.paid_50 ? 'split_50' : (kolTerm.get(d.kol_id) || null);
    });
    if (!Array.isArray(obj.deal_events)) obj.deal_events = [];
    obj.schema_version = 2;
  }
  /* v2 → v3 (see the top of this file) */
  const PILLAR_TARGET_DEFAULT = { awareness: 10, consideration: 20, conversion: 70 };
  function toV3(obj) {
    const phaseOf = new Map(obj.phases.map(p => [p.phase_id, p])), phasesBy = new Map();
    obj.phases.forEach(p => { if (!phasesBy.has(p.campaign_id)) phasesBy.set(p.campaign_id, []); phasesBy.get(p.campaign_id).push(p); });
    obj.deals.forEach(d => {
      if (d.campaign_id === undefined) { const p = phaseOf.get(d.phase_id); d.campaign_id = p ? p.campaign_id : null; }
      if (d.legacy_phase_id === undefined) d.legacy_phase_id = d.phase_id || null;
    });
    const dealOf = new Map(obj.deals.map(d => [d.deal_id, d]));
    obj.deal_posts.forEach(p => {
      if (p.phase_override !== undefined) return;
      const d = dealOf.get(p.deal_id), r = d ? R.resolvePostPhase(Object.assign({}, p, { phase_override: null }), phasesBy.get(d.campaign_id) || []) : null;
      p.phase_override = r && r.kind !== 'auto' && d.legacy_phase_id ? d.legacy_phase_id : null;
    });
    obj.campaigns.forEach(c => {
      if (c.budget_kol === undefined) {
        const b = obj.phases.filter(p => p.campaign_id === c.campaign_id && !R.isBlank(p.budget_kol)).map(p => Number(p.budget_kol));
        c.budget_kol = b.length ? b.reduce((x, y) => x + y, 0) : null;
      }
      if (c.pillar_target === undefined) c.pillar_target = null;
    });
    if (!obj.lookups.pillar_target_default) obj.lookups.pillar_target_default = Object.assign({}, PILLAR_TARGET_DEFAULT);
    obj.deals.forEach(d => { delete d.phase_id; });
    obj.schema_version = 3;
  }
  /* v3 → v4 (see the top of this file) */
  const CTA_DEFAULT = ['TikTok', 'All Channel', 'Eveandboy', '7-11'];
  const ADMIN_USER = { user_id: 'U000', display_name: 'Admin', email: null, role: 'admin', is_pic: false, pic_name: null, active: true };
  function toV4(obj) {
    const L = obj.lookups;
    if (!Array.isArray(obj.users)) {
      const off = new Set(((L.inactive_values || {}).pic_list) || []);
      obj.users = [Object.assign({}, ADMIN_USER)].concat((L.pic_list || []).map((name, i) => ({ user_id: 'U' + String(i + 1).padStart(3, '0'), display_name: name, email: null,
        role: 'staff', is_pic: true, pic_name: name, active: !off.has(name) })));
    }
    delete L.pic_list;
    if (L.inactive_values) delete L.inactive_values.pic_list;
    obj.meta = Object.assign({ current_user_id: ADMIN_USER.user_id }, obj.meta || {});
    if (!Array.isArray(L.cta_list) || !L.cta_list.length) L.cta_list = CTA_DEFAULT.slice();
    obj.campaigns.forEach(c => { if (c.cta === undefined) c.cta = null; });
    obj.schema_version = 4;
  }
  /* v4 → v5 (see the top of this file) */
  function toV5(obj) {
    obj.campaigns.forEach(c => {
      delete c.short_code;
      ['status_override', 'status_reason', 'status_changed_at'].forEach(k => { if (c[k] === undefined) c[k] = null; });
    });
    if (obj.meta) delete obj.meta.role_override;
    if (!Array.isArray(obj.campaign_events)) obj.campaign_events = [];
    obj.schema_version = 5;
  }
  /* v5 → v6 (see the top of this file) */
  function toV6(obj) {
    ['products', 'campaign_products', 'deal_products'].forEach(k => { if (!Array.isArray(obj[k])) obj[k] = []; });
    const byKey = new Map(obj.products.map(p => [R.trim(p.tr_code).toLowerCase(), p]));
    obj.deals.forEach(d => {
      (Array.isArray(d.tr_codes) ? d.tr_codes : []).map(R.trim).filter(Boolean).forEach(code => {
        const key = code.toLowerCase();
        if (!byKey.has(key)) { const p = { tr_code: code, product_name: code, variant: null, active: true }; obj.products.push(p); byKey.set(key, p); }
        const tr = byKey.get(key).tr_code;
        if (d.campaign_id && !obj.campaign_products.some(x => x.campaign_id === d.campaign_id && x.tr_code === tr))
          obj.campaign_products.push({ campaign_id: d.campaign_id, tr_code: tr, sort_order: obj.campaign_products.filter(x => x.campaign_id === d.campaign_id).length + 1 });
        if (!obj.deal_products.some(x => x.deal_id === d.deal_id && x.tr_code === tr)) obj.deal_products.push({ deal_id: d.deal_id, tr_code: tr, qty: 1, note: null });
      });
      delete d.tr_codes;
    });
    obj.phases.forEach(p => { if (p.label === undefined) p.label = R.labelFromName(p.phase_name); delete p.phase_name; });
    if (obj.lookups.ontime_grace_days == null) obj.lookups.ontime_grace_days = 1;
    if (obj.lookups.reliability_min_posts == null) obj.lookups.reliability_min_posts = 2;
    obj.schema_version = 6;
  }
  /* v6 → v7 (see the top of this file) — a KOL already done (kol_type_legacy present) is left alone */
  function toV7(obj) {
    if (!Array.isArray(obj.lookups.kol_type_list)) obj.lookups.kol_type_list = R.kolTypeDefault();
    obj.kol_master.forEach(k => R.migrateKolType(k, obj.lookups.kol_type_list));
    obj.schema_version = 7;
  }
  /* v7 → v8 (see the top of this file) — no payment line is made here: To pay works them out from the deals (CR-08 §3) */
  function toV8(obj) {
    ['payee_profiles', 'payment_lines', 'payment_runs'].forEach(k => { if (!Array.isArray(obj[k])) obj[k] = []; });
    if (!obj.lookups.payment_settings) obj.lookups.payment_settings = R.paymentSettingsDefault();
    if (obj.lookups.payee_vault === undefined) obj.lookups.payee_vault = null;
    obj.schema_version = 8;
  }
  /* v8 → v9 (see the top of this file) — runs once (schema_version), so a deleted Earn stays deleted */
  function toV9(obj) {
    if (!Array.isArray(obj.campaign_events)) obj.campaign_events = [];
    if (!Array.isArray(obj.users)) obj.users = [];
    if (!obj.users.some(u => R.trim(u.display_name).toLowerCase() === 'earn')) {
      const n = obj.users.reduce((m, u) => Math.max(m, Number(String(u.user_id).replace(/\D/g, '')) || 0), 0) + 1;
      obj.users.push({ user_id: 'U' + String(n).padStart(3, '0'), display_name: 'Earn', email: null, role: 'accounting', is_pic: false, pic_name: null, active: true });
    }
    obj.schema_version = 9;
  }
  /* v9 → v10 (see the top of this file) — the metric values are not touched */
  function toV10(obj) {
    (obj.deal_posts || []).forEach(p => {
      const has = R.METRICS.some(k => p[k] != null && p[k] !== '');
      if (p.metrics_source === undefined) p.metrics_source = has && !p.metrics_updated_at ? 'legacy' : null;
      if (p.metrics_updated_by === undefined) p.metrics_updated_by = null;
    });
    if (obj.lookups.metrics_stale_days == null) obj.lookups.metrics_stale_days = 14;
    obj.schema_version = 10;
  }
  /* v10 → v11 (see the top of this file) */
  function toV11(obj) { R.migrateSamples(obj); obj.schema_version = 11; }
  /* v11 → v12 (see the top of this file) — go_live = the Bangkok date of the upgrade */
  function toV12(obj, now) { R.migrateV12(obj, R.dateOfTimestamp((now || new Date()).toISOString())); obj.schema_version = 12; }
  /* v12 → v13 (CR-14 §3) */
  function toV13(obj) { R.migrateV13(obj); }
  /* v13 → v14 (CR-15 §3) */
  function toV14(obj) { R.migrateV14(obj); }
  /* v14 → v15 (CR-16 §3) */
  function toV15(obj) { R.migrateV15(obj); }
  /* v15 → v16 (CR-17 §3): ops_mode simple / simple · payment lines paid_by / paid_ref / sent_at / sent_by / unpaid_reason · Campaigns / Phases approved */
  function toV16(obj) { R.migrateV16(obj); }
  /* v16 → v17 (CR-18 §3): campaign_budget_changes · an approved initial row for every Campaign with a budget (the numbers do not change) */
  function toV17(obj, now) { R.migrateV17(obj, (now || new Date()).toISOString()); }
  /* v17 → v18 (CR-19 §4.6): pillar_list + Awareness & Consideration · Phase default pillars that say it · deals untouched */
  function toV18(obj) { R.migrateV18(obj); }
  /* v18 → v19 (CR-20 §3): kol_packages · step_notes · deals package_id / package_units / package_paid / script_link · payment_lines package_id */
  function toV19(obj) { R.migrateV19(obj); }
  /* v19 → v20 (CR-21 §4): Return to draft instead of Rejected · submit rounds · draft requests */
  function toV20(obj) { R.migrateV20(obj); }
  /* v20 → v21 (CR-22 §4): the shipment method · KOL buys own · Product purchase */
  function toV21(obj) { R.migrateV21(obj); }
  /* upgrade older saved states step by step, once · now: when it runs (the go-live date of v12) */
  function migrate(obj, now) {
    if (obj.schema_version === 1) toV2(obj);
    if (obj.schema_version === 2) toV3(obj);
    if (obj.schema_version === 3) toV4(obj);
    if (obj.schema_version === 4) toV5(obj);
    if (obj.schema_version === 5) toV6(obj);
    if (obj.schema_version === 6) toV7(obj);
    if (obj.schema_version === 7) toV8(obj);
    if (obj.schema_version === 8) toV9(obj);
    if (obj.schema_version === 9) toV10(obj);
    if (obj.schema_version === 10) toV11(obj);
    if (obj.schema_version === 11) toV12(obj, now);
    if (obj.schema_version === 12) toV13(obj);
    if (obj.schema_version === 13) toV14(obj);
    if (obj.schema_version === 14) toV15(obj);
    if (obj.schema_version === 15) toV16(obj);
    if (obj.schema_version === 16) toV17(obj, now);
    if (obj.schema_version === 17) toV18(obj);
    if (obj.schema_version === 18) toV19(obj);
    if (obj.schema_version === 19) toV20(obj);
    if (obj.schema_version === 20) toV21(obj);
    obj.local = Object.assign(blankLocal(), obj.local || {});
    return obj;
  }
  const counts = state => Object.fromEntries(COLLECTIONS.map(k => [k, (state[k] || []).length]));
  function nextId(prefix, arr, key, width) {
    const n = arr.reduce((m, x) => Math.max(m, parseInt(String(x[key]).replace(/\D/g, ''), 10) || 0), 0) + 1;
    return prefix + String(n).padStart(width, '0');
  }
  const nextNumber = (arr, key) => arr.reduce((m, x) => Math.max(m, Number(x[key]) || 0), 0) + 1;
  /* kol_tracker_backup_YYYYMMDD_HHmm.json (Bangkok time) */
  function backupFilename(now = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: R.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(now).map(x => [x.type, x.value]));
    return `kol_tracker_backup_${p.year}${p.month}${p.day}_${p.hour === '24' ? '00' : p.hour}${p.minute}.json`;
  }
  /* days since last backup (null = never) */
  const daysSinceBackup = (state, today) => state.local && state.local.last_backup_at ? R.dayDiff(today, R.dateOfTimestamp(state.local.last_backup_at)) : null;

  /* opts: {seed, storage (localStorage or null), now: () => Date} */
  function createStore(opts) {
    const seed = opts.seed, storage = opts.storage || null, now = opts.now || (() => new Date());
    const status = { canSave: !!storage, source: null, corrupt: false, lastError: null, migratedFrom: null };
    let state = null, raw = null, readFailed = false;

    function save() {
      /* could not read what is stored → never write over it */
      if (!storage || readFailed) { status.canSave = false; return false; }
      try {
        state.local.last_saved_at = now().toISOString();
        storage.setItem(KEY, JSON.stringify(state));
        status.canSave = true; status.lastError = null;
        return true;
      } catch (e) { status.canSave = false; status.lastError = String(e && e.name || e); return false; }
    }

    if (storage) {
      try { raw = storage.getItem(KEY); } catch (e) { readFailed = true; status.canSave = false; status.lastError = String(e && e.name || e); }
    }
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        const errs = shapeErrors(obj);
        if (errs.length) throw new Error(errs[0]);
        const was = obj.schema_version;
        /* CR-11 §3 — before the go-live upgrade, a copy of what was stored stays aside (once; no room = no copy, the upgrade still runs) */
        if (was < 12) { try { if (!storage.getItem(BEFORE_KEY)) storage.setItem(BEFORE_KEY, raw); status.beforeCopy = BEFORE_KEY; } catch (_) { status.beforeCopy = null; } }
        /* CR-15 §3 — and before the journey upgrade (v14) */
        if (was < 15) { try { if (!storage.getItem(BEFORE15_KEY)) { storage.removeItem(BEFORE14_KEY); storage.setItem(BEFORE15_KEY, raw); } status.beforeCopy = BEFORE15_KEY; } catch (_) { /* no room: the upgrade still runs */ } }
        state = migrate(obj, now()); status.source = 'local';
        /* save the upgraded data right away so the next open does not migrate again */
        if (was < SCHEMA_VERSION) { status.migratedFrom = was; save(); }
      } catch (e) {
        status.corrupt = true; state = null;
        try { storage.setItem(CORRUPT_KEY, raw); } catch (_) { /* no room for a copy: leave the original until the next change */ }
      }
    }
    if (!state) {
      state = fromSeed(seed, now()); status.source = 'seed';
      if (!status.corrupt) save();
    }

    function backup() {
      state.local.last_backup_at = now().toISOString();
      save();
      return { filename: backupFilename(now()), text: JSON.stringify(state) };
    }
    function previewRestore(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { return { ok: false, errors: ['not_json'] }; }
      const errors = shapeErrors(obj);
      if (errors.length) return { ok: false, errors };
      const photos = obj.photos && typeof obj.photos === 'object' && !Array.isArray(obj.photos) ? Object.keys(obj.photos).length : 0;   // CR-16 §4.4
      return { ok: true, counts: counts(obj), current: counts(state), backupAt: obj.local && obj.local.last_backup_at, photos, obj };
    }
    function restore(text, fileName) {
      const p = previewRestore(text);
      if (!p.ok) return p;
      const was = p.obj.schema_version, me = state && state.meta && state.meta.current_user_id;
      /* CR-16 §4.4 — the pictures of a backup "with photos" go back to IndexedDB (ui.js), never into the state / localStorage */
      const photos = p.photos ? p.obj.photos : null; delete p.obj.photos;
      const stepImages = p.obj.step_images && typeof p.obj.step_images === 'object' && !Array.isArray(p.obj.step_images) ? p.obj.step_images : null; delete p.obj.step_images;   // CR-20 §4.13
      state = migrate(p.obj, now());
      const scrubbed = R.scrubSensitive(state);   // CR-08 §4.4
      /* the person in this browser stays the same when the backup has that user (active) */
      if (me && (state.users || []).some(u => u.user_id === me && u.active !== false)) state.meta.current_user_id = me;
      state.local.restored_at = now().toISOString();
      state.local.restored_from = fileName || null;
      status.corrupt = false;
      save();
      return { ok: true, counts: counts(state), migratedFrom: was < SCHEMA_VERSION ? was : null, scrubbed, photos, stepImages };
    }
    function reset() {
      const keepBackupAt = state.local.last_backup_at;
      state = fromSeed(seed, now());
      state.local.last_backup_at = keepBackupAt;
      status.corrupt = false;
      save();
    }
    function newId(kind) { const f = ID_FORMATS[kind]; return nextId(f.prefix, state[f.coll], f.key, f.width); }
    /* the copy kept before an upgrade (text — the newest: before v14, else before v12) · null when there is none */
    function beforeCopy() { try { return storage ? storage.getItem(BEFORE15_KEY) || storage.getItem(BEFORE14_KEY) || storage.getItem(BEFORE_KEY) : null; } catch (e) { return null; } }

    return {
      get state() { return state; },
      status, save, backup, previewRestore, restore, reset, newId, beforeCopy,
      newLogId: () => nextNumber(state.deal_status_log, 'log_id'),
      newEventId: () => nextNumber(state.deal_events, 'event_id'),
      newCampaignEventId: () => nextNumber(state.campaign_events, 'event_id'),
      counts: () => counts(state),
      sizeChars: () => JSON.stringify(state).length,
    };
  }

  return { KEY, CORRUPT_KEY, BEFORE_KEY, BEFORE14_KEY, BEFORE15_KEY, THEME_KEY, SCHEMA_VERSION, QUOTA_MB, COLLECTIONS, ADDED_IN, ID_FORMATS, PILLAR_TARGET_DEFAULT, CTA_DEFAULT, ADMIN_USER,
    fromSeed, shapeErrors, migrate, counts, nextId, nextNumber, backupFilename, daysSinceBackup, createStore };
})(KT.rules);
