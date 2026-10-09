# Data model — Charmiss KOL Tracker

schema_version **19** (CR-20 · 08/10/2026) · ทั้งหมดอยู่ใน state เดียว (`localStorage` key `charmiss_kol_tracker_v1`) · Backup / Restore = JSON ทั้งก้อน
ที่มาข้อมูลตั้งต้น: `data/KOL_seed_v2.json` → `data/seed.js` (ห้ามแก้) · การอัปเกรดทำใน `src/store.js` `migrate()` ตอนโหลด (seed · localStorage · Backup เก่า v1–v10) — ทำครั้งเดียวตาม `schema_version` · เพิ่ม field เท่านั้น ไม่ลบข้อมูลเงิน

## Collections

| Collection | key | เนื้อหาหลัก | ตั้งแต่ |
|---|---|---|---|
| `campaigns` | `campaign_id` | ชื่อ · ช่วงวันที่ · status (+ `status_override` On hold / Cancelled) · `budget_kol` · `pillar_target` · `cta` | CR-01 |
| `phases` | `phase_id` | `campaign_id` · ช่วงวันที่ · `budget_kol` · `label` (ชื่อบนจอ = "Phase {seq} · {label}") | CR-01 |
| `kol_master` · `kol_accounts` · `kol_rate_quotes` | `kol_id` · `account_id` · quote id | KOL · บัญชีแต่ละ platform (followers → tier) · ราคาเสนอ · `kol_type` (preset key) · `default_payment_term` | CR-01 |
| `deals` | `deal_id` | KOL · `campaign_id` · status / `sub_status` (ขั้น journey) · ค่าใช้จ่าย · `payment_term` · `pillar` · PIC · flag `docs_done` / `paid_50` / `paid_full` (+ วันที่ — sync จาก Payment line) | CR-01 |
| `deal_posts` | post id | deal · platform · วันที่โพสต์ / คาด · `phase_override` · metrics `views` · `likes` · `comments` · `shares` · `saves` (จำนวนเต็ม ≥ 0 หรือ null = ยังไม่มีข้อมูล ≠ 0) · `metrics_updated_at` · **`metrics_updated_by`** · **`metrics_source`** (CR-10) | CR-01 |
| `deal_status_log` | `log_id` | ประวัติ Move stage (`sub_status` · `effective_date` · `changed_by`) | CR-01 |
| `deal_events` | `event_id` | append-only: pic · plan · payment_term · `payment` (line เปลี่ยนสถานะ) · `payee_details_changed` (ไม่มีค่า) · **`metrics`** · **`sample`** (CR-10) · **`payee`** (Pay to · CR-16) | CR-02 |
| `pick_lists` | `pick_list_id` PK0001 | รอบแพ็กของ: `name` · `shipment_ids` · `created_by` / `created_at` (CR-11 §4.10) | CR-11 |
| `sample_shipments` | `shipment_id` SH000001 | สินค้าตัวอย่างที่ส่งให้ KOL (หลายรายการต่อ deal) · items · ship by · สถานะ · carrier · tracking (CR-10 §4.14) | CR-10 |
| `users` | `user_id` | `display_name` · `email` · `role` · `is_pic` · `pic_name` · `active` · `meta.current_user_id` = คนที่ใช้งานในเบราว์เซอร์นี้ | CR-04 |
| `campaign_events` | `event_id` | append-only: Phase Planner · status · **products** (CR-09) · **approval** (CR-17) | CR-05 |
| `campaign_budget_changes` | `change_id` BG-0001 | งบ Campaign ตามเวลา: initial · increase · decrease · allocations ลง Phase / Unallocated · status pending / approved / rejected / cancelled (CR-18) | CR-18 |
| `products` · `campaign_products` · `deal_products` | `tr_code` | catalog สินค้า · สินค้าของ Campaign · สินค้าของ deal (qty) | CR-06 |
| `payee_profiles` | `payee_id` | ผู้รับเงิน (**หลายรายการต่อ KOL** — `label` · `is_default` (1 ต่อ KOL) · `archived` · CR-16 — หรือ Affiliate / Other) · ประเภท / VAT / WHT · เอกสาร · `secure` = ข้อมูลส่วนบุคคลเข้ารหัส · เห็นแค่ธนาคาร + 4 ตัวท้าย · (`secure_ship` ของ CR-10 ย้ายไป `shipping_addresses` ใน schema 15) | CR-08 |
| `shipping_addresses` | `address_id` AD-0001 | ที่อยู่ส่งของของ KOL (หลายที่ · `label` · `is_default` · `archived`) · `secure` {recipient · phone · address} เข้ารหัส (CR-16) | CR-16 |
| `payment_lines` | `line_id` | งวดที่ต้องจ่าย (deal / manual / legacy) · Gross · VAT · WHT · Net · `status` · `run_id` · `paid_date` · `wht_cert_sent_date` | CR-08 |
| `payment_runs` | `run_id` | รอบจ่าย (PR) · `pay_date` · `prepared_by` · `status` · `submitted_at` · **`returned_*`** (CR-09) | CR-08 |
| `lookups` | — | journey steps · pillar · CTA · platform · tier rules · KOL types · `payment_settings` · `payee_vault` (public key + private key ที่เข้ารหัสด้วย passphrase) · `metrics_stale_days` · `sample_settings` (CR-10) | CR-01 |

ข้อมูลส่วนบุคคล (ชื่อจริง · ที่อยู่ · โทร · ช่องทางส่งใบ 50 ทวิ · เลขบัญชี · เลขภาษี) อยู่ได้ที่เดียวคือ `payee_profiles.secure` (เข้ารหัส) และที่อยู่จัดส่ง (ผู้รับ · เบอร์ · ที่อยู่) ใน `shipping_addresses.secure` (เข้ารหัส · CR-16 · เดิม `payee_profiles.secure_ship` CR-10) — ไม่มี plain text ใน state, localStorage, Backup, seed, ไฟล์ export ของ Dashboard / Deals / Performance / Stage popup · ถอดรหัสในหน่วยความจำเฉพาะตอน Unlock (Export PR พร้อมข้อมูลผู้รับ · คอลัมน์ Send to ใน Accounting · Export shipping list) แล้วทิ้ง

## schema_version — ประวัติ

| v | CR | เปลี่ยน |
|---|---|---|
| 2 | CR-02 | `deals.draft_rounds` · `script_required` · `payment_term` · `kol_master.default_payment_term` · `deal_events` |
| 3 | CR-03 | deal อยู่ใต้ Campaign (`deals.campaign_id`) · Phase ของโพสต์มาจากวันที่ (`phase_override`) · `campaigns.budget_kol` / `pillar_target` |
| 4 | CR-04 | `users` (แทน `lookups.pic_list`) · `meta.current_user_id` · `lookups.cta_list` |
| 5 | CR-05 | role `kol_manager` · `campaigns.status_override` · `campaign_events` · ID ใหม่ CMP- / PHS- |
| 6 | CR-06 | `products` · `campaign_products` · `deal_products` · `phases.label` |
| 7 | CR-07 | `lookups.kol_type_list` · `kol_master.kol_type` เป็น preset key + `kol_type_legacy` |
| 8 | CR-08 | `payee_profiles` · `payment_lines` · `payment_runs` · `lookups.payment_settings` · `lookups.payee_vault` |
| 9 | CR-09 | ดูด้านล่าง |
| 10 | CR-10 R1 | `deal_posts.metrics_source` / `metrics_updated_by` · `lookups.metrics_stale_days` |
| 11 | CR-10 R6 | `sample_shipments` · `lookups.sample_settings` (ดูด้านล่าง) |
| 12 | CR-11 R3 | `lookups.go_live` · `payment_lines` on_hold · `sample_shipments.purpose / campaign_id / pick_list_id` · `pick_lists` · `phases.default_pillar` · `campaigns.default_payment_term` · `lookups.metrics_checkpoints` (ดูด้านล่าง) |
| 13 | CR-14 | `kol_master.contact_id` (ดูด้านล่าง) |
| 14 | CR-15 | journey_steps ใหม่ · ชื่อขั้น Script / Draft 1–3 / Approve · deals + 4 ฟิลด์วันที่ (ดูด้านล่าง) |
| 15 | CR-16 | payee หลายรายการ · `shipping_addresses` · `deals.payee_id` · `sample_shipments.address_id` · `kol_master.photo` (ดูด้านล่าง) |
| 16 | CR-17 | `lookups.ops_mode` · payment_lines `paid_by` / `paid_ref` / `sent_at` / `sent_by` / `unpaid_reason` · campaigns / phases `approval_status` · `approval` · `pending_change` (ดูด้านล่าง) |
| 17 | CR-18 | `campaign_budget_changes` · `campaigns.budget_kol` = งบที่อนุมัติแล้วรวม (ดูด้านล่าง) |
| 18 | CR-19 | `lookups.pillar_list` 4 ค่า (+ Awareness & Consideration) · pillar target เลิกใช้ (ดูด้านล่าง) |
| **19** | **CR-20** | `kol_packages` · `step_notes` · deals `package_id` / `package_units` / `package_paid` / `script_link` · payment term Package (ดูด้านล่าง) |

## CR-09 — schema 8 → 9

| ที่ | เปลี่ยน | หมายเหตุ |
|---|---|---|
| `campaign_events` | type **`products`**: `{campaign_id, from: {products: [tr_code]}, to: {products: [...]}, changed_by, changed_at}` | บันทึกทุกครั้งที่แก้ Products ของ Campaign (Staff แก้ได้ · §4.7) · Campaign drawer แสดง "Updated dd/mm/yyyy by X" · migration สร้าง list ว่างถ้ายังไม่มี |
| `users.role` | + **`accounting`** (label "Accounting") | ไม่เป็น PIC · ไม่เห็น Settings / Role Management · หน้าแรก Payments › Accounting |
| `users` | migration เพิ่ม `{user_id: 'U008' (เลขถัดไป), display_name: 'Earn', email: null, role: 'accounting', is_pic: false, pic_name: null, active: true}` | เฉพาะเมื่อยังไม่มี user ชื่อ Earn · รันครั้งเดียวตอนอัปเกรดเป็น v9 — ลบ Earn ทีหลังแล้วไม่ถูกเพิ่มกลับ |
| `payment_runs` | + `returned_reason` · `returned_at` · `returned_by` | Accounting ส่งรอบคืนทีม (Return to team) · ว่าง = ไม่เคยถูกส่งคืน · Submit to Accounting อีกครั้งล้างค่า (ประวัติอยู่ใน `deal_events` type payment ของแต่ละ line) |
| `lookups.payment_settings.bands` | key เดิม · บนจอเรียก "Amount ranges" | Group by Amount (§4.14) |

**Migration v8 → v9** (`store.js` `toV9` · localStorage และ Backup JSON เก่า): 1) `campaign_events = []` ถ้ายังไม่มี · 2) เพิ่ม Earn ถ้ายังไม่มี user ชื่อ Earn · 3) `payment_runs` เดิมไม่เติม field · 4) `schema_version = 9` — ตัวเลขเงิน, To pay และ seed ไม่เปลี่ยน

### Run status — ค่าที่เก็บ vs label (`rules.runStatusKey` / `runStatusLabel`)

| `status` ที่เก็บ | เงื่อนไข | key | Label |
|---|---|---|---|
| `draft` | `returned_at` ว่าง | draft | Draft |
| `draft` | มี `returned_at` | returned | Returned (+ แถบ "Returned by X on dd/mm/yyyy — reason") |
| `submitted` | — | with_accounting | With Accounting |
| `paid` | — | paid | Paid (ตั้งเองเมื่อทุก line ที่ไม่ Cancelled เป็น Paid) |
| `closed` | — | closed | Closed |

Line status `submitted` แสดงเป็น "With Accounting" ทุกที่ (To pay · Deal drawer · Payment track) · ค่าที่เก็บของ line และ run ไม่เปลี่ยนจาก CR-08

### Return to team (`rules.returnRun(state, run, reason, ctx)`)
- line ที่ `submitted` → `in_run` (event type payment from submitted → in_run · note = เหตุผล)
- run → `status: 'draft'` + `returned_reason` (trim) · `returned_at` · `returned_by`
- `submitRun` ล้าง `returned_*` แล้วตั้ง `status: 'submitted'`

## CR-10 — schema 9 → 10 → 11

### Performance metrics (schema 10)

| ที่ | เปลี่ยน | หมายเหตุ |
|---|---|---|
| `deal_posts.metrics_source` | `'manual'` (แก้ในตาราง / Deal drawer) · `'paste'` (Paste metrics) · `'legacy'` (มี metrics แต่ไม่มี `metrics_updated_at` ตอน migrate) · null | ใหม่ |
| `deal_posts.metrics_updated_by` | user id \| null | ใหม่ · `metrics_updated_at` = วันที่แก้ (เดิม) |
| `lookups.metrics_stale_days` | 14 (1–365) | Settings › KOL performance "Metrics stale after (days)" · โพสต์ที่ metrics เก่ากว่านี้ = Stale (`rules.metricsStatus`) |
| `deal_events` type **`metrics`** | `{deal_id, post_id, from: {views, likes, comments, shares, saves}, to: {...}, note}` | ทุกครั้งที่แก้ metrics · Undo บันทึก event ใหม่ (note `undo`) ไม่ลบของเดิม |
| `deals.created_batch_id` | string \| null | ใส่เมื่อสร้างจาก Bulk shortlist (Undo / highlight) · ข้อมูลเดิม = ไม่มี field (ไม่ migrate) |
| `kol_master.sources` | ค่าใหม่ `'manual'` | KOL ที่สร้างจาก New deal › Create KOL / KOL Master เอง |

**Migration v9 → v10** (`store.js` `toV10`): 1) `deal_posts` ที่มี metrics อย่างน้อย 1 ช่องแต่ไม่มี `metrics_updated_at` → `metrics_source = 'legacy'` · ที่เหลือ null · `metrics_updated_by = null` · 2) `lookups.metrics_stale_days = 14` · 3) `schema_version = 10`

ตัวเลขผลงาน (Dashboard Engagement · Deals › Performance · Export) คำนวณจาก `rules.postMetrics(items[{post, cost}])` ตัวเดียว — ต้นทุนต่อโพสต์ = `rules.postShare` · ER = Engagement ÷ Views ของโพสต์ที่มี Views · CPV = Cost ÷ Views · CPE = Cost ÷ Engagement (ถ่วงน้ำหนัก)

### Samples (schema 11)

| ที่ | field | หมายเหตุ |
|---|---|---|
| `sample_shipments` (ใหม่) | `shipment_id` SH000001 · `deal_id` · `kol_id` · `items` [{`tr_code`, `qty`}] · `ship_by` · `ship_by_overridden` · `status` `to_ship` / `shipped` / `delivered` / `problem` / `not_required` · `shipped_date` · `carrier` · `tracking_no` · `delivered_date` · `problem_reason` · `not_required_reason` · `source` `auto` / `manual` / `legacy` · `note` · `created_by/at` · `updated_by/at` | หลาย shipment ต่อ deal ได้ (ส่งซ้ำ / ส่งเพิ่ม) |
| `lookups.sample_settings` (ใหม่) | `lead_days` 7 (0–60) · `carriers` [Kerry Express · Flash Express · Thailand Post · J&T Express · Lalamove · Grab · Messenger · Hand delivered · Other] · `tracking_url` {carrier: `https://…{tracking}`} | Settings › Samples (Admin / KOL Manager) |
| `payee_profiles.secure_ship` | `{key_id, wrapped_key, iv, ciphertext}` ของ `{ship_name, ship_phone, ship_address}` | เข้ารหัสด้วย Payee vault เหมือน `secure` แต่แยกเป็นอีก record (บันทึกได้โดยไม่ต้อง Unlock และไม่แตะข้อมูลบัญชี) · Reset vault ล้างด้วย |
| `payee_profiles.shipping_on_file` | bool | แสดง "Address on file" / "No address" โดยไม่ต้องถอดรหัส |
| `deal_events` type **`sample`** | `{deal_id, shipment_id, from, to, note}` (สถานะ shipment) | ทุกครั้งที่สร้าง / เปลี่ยนสถานะ shipment |
| `deals.delivered` · `deals.delivery_date` | คงไว้ แต่**คำนวณจาก shipment** (`rules.syncShipments`): delivered = มี shipment Delivered · delivery_date = delivered_date ล่าสุด | Template view / export เดิมไม่เปลี่ยน · ไม่มีช่องให้แก้ใน Deal drawer แล้ว |

**สถานะบนจอ** (`rules.sampleStatus(shipment, today)`): ยังไม่ส่ง → Overdue (ship_by < วันนี้) · Ship this week (ship_by ภายใน 7 วัน) · To ship (ship_by ไกลกว่านั้นหรือว่าง) · มี shipped_date → Shipped · มี delivered_date / status delivered → Delivered · Problem · Not required

**Ship by** (`rules.shipBy(deal, settings)`) = (`expected_draft1_date` ถ้ามี ไม่งั้น `expected_post_date`) − `lead_days` · ไม่มีทั้งสองวัน = ว่าง · `ship_by_overridden = true` → ไม่คำนวณใหม่ (Reset to auto ล้าง)

**ทุก commit** (`ui.commit` → `rules.syncShipments`): deal ที่ถึง Confirm QT ขึ้นไป ไม่ Cancel / Complete และยังไม่มี shipment → สร้าง To ship (`source = auto` · items = deal_products) · deal Cancel → shipment To ship เป็น Not required "Deal cancelled" (ที่ส่งแล้วคงไว้) · ship_by ตามวันที่ของ deal (ถ้าไม่ override) · sync `deals.delivered` / `delivery_date` · มี shipment แล้ว (รวม Not required) จะไม่สร้างใหม่

**Migration v10 → v11** (`store.js` `toV11` → `rules.migrateSamples`): 1) deal `delivered = true` → shipment `delivered` (`delivered_date = delivery_date` · ว่าง = "Date not recorded" · `source = legacy`) — seed 206 รายการ (120 มีวันที่ · 86 ไม่มี) · 2) deal ไม่ Cancel · ขั้น Confirm QT ขึ้นไป · ยังไม่ Complete · ไม่มี shipment → `to_ship` (`source = auto`) — seed 8 รายการ (Overdue 7 · ไม่มี ship-by 1) · 3) deal Complete ที่ไม่มีข้อมูลส่งของ → ไม่สร้าง · 4) `lookups.sample_settings` default · 5) `schema_version = 11` — ตัวเลขเงินและค่า `deals.delivered` / `delivery_date` เดิมไม่เปลี่ยน

## CR-11 — schema 11 → 12

migration `rules.migrateV12(obj, today)` (เรียกจาก `store.migrate` ครั้งเดียว · ใช้กับ Backup เก่าด้วย · deal ไม่ถูกแตะ) · ก่อนอัปเกรด ข้อมูลที่เก็บไว้ถูกสำเนา 1 ชุดที่ localStorage `charmiss_kol_tracker_v1_before_v12` (`store.beforeCopy()` · Settings › Data ดาวน์โหลดได้)

| ที่ | field | ค่า / ความหมาย |
|---|---|---|
| `lookups.go_live` | `{date, completed_at, completed_by}` | `date` = วันที่อัปเกรด (Go-live clean-up เปลี่ยนได้) · ใช้แค่บอกว่าอะไร "ไม่ได้ติดตามในแอป" (โพสต์ก่อน date − 30 วันที่ไม่มีตัวเลข = Not tracked) · ไม่ตัดข้อมูลทิ้ง · `completed_*` = รัน clean-up แล้ว |
| `payment_lines.status` | + `on_hold` | Hold (`hold_reason` · `hold_by` · `hold_at` · `hold_created` = line ที่ Hold สร้างขึ้น → Release แล้วลบทิ้ง ให้งวดคิดจาก deal ใหม่) · ไม่เข้า run |
| `sample_shipments` | `purpose` | `review` (ทุกแถวเดิม) · `gifting` · `replacement` · `affiliate` · `other` |
| | `campaign_id` | Campaign ของ deal · shipment ที่ไม่ผูก deal เลือกเองได้ (หรือ null) |
| | `pick_list_id` | pick list ที่อยู่ (อยู่ได้ 1 อัน · เอาออกได้จนกว่าจะ Shipped) |
| | `deal_id` = null · `source` = `other` | New shipment ที่ไม่ผูก deal · `kol_id` = ผู้รับ (KOL ใน KOL Master เสมอ · ที่อยู่อยู่ใน Payee vault) |
| `pick_lists` | ใหม่ | `{pick_list_id, name, shipment_ids [], created_by, created_at}` |
| `phases.default_pillar` | pillar หรือ null | ตั้งจากชื่อ Phase ที่มีคำ Pillar คำเดียว (seed: KS Phase 1 Awareness · KS Phase 2 Conversion) · ส่งต่อให้ New deal / Bulk shortlist · `Apply to n deals without pillar` |
| `campaigns.default_payment_term` | term หรือ null | ส่งต่อให้ New deal / Bulk shortlist เมื่อ KOL ไม่มี default · `Apply to n open deals without term` |
| `lookups.metrics_checkpoints` | `[7]` | วันหลังโพสต์ที่ต้องเก็บ metrics (Settings เพิ่ม 30 ได้) · `metrics_stale_days` เก็บไว้ ไม่ใช้แล้ว |
| `deal_events.type` | + `payment_hold` · `shipment` | Hold / Release (from → to · note = เหตุผล) · shipment ใหม่ / clean-up Delivered (imported) |
| `campaign_events.type` | + `default_pillar` | ตั้ง Default pillar ใน Phase drawer |

**Go-live clean-up** เขียนเฉพาะ: `payment_lines` (Paid outside app · `source` legacy · note "Matched with <file> · sheet … row …" หรือ note ที่พิมพ์) · `sample_shipments` (Delivered · `delivered_date` ว่าง · `source` legacy) · `lookups.go_live` · `deal_events` — **ไม่มีคอลัมน์อื่นจากไฟล์ PR** (ชื่อผู้รับ · เลขบัญชี ฯลฯ) ใน state / Backup / log

## CR-14 — schema 12 → 13

| Field | ค่า |
|---|---|
| `kol_master.contact_id` (ใหม่) | string \| null · ≤ 120 ตัวอักษร · ตีความตาม `contact_channel` (LINE → LINE ID · Agency → ชื่อ Agency + ผู้ติดต่อ · Email → อีเมลงาน · TikTok / Instagram / Facebook → handle ที่ใช้ DM) · **ห้ามเบอร์โทร** (`rules.looksLikePhone`: ตัด `-` ช่องว่าง `+` แล้วเป็นตัวเลขล้วน ≥ 9 หลัก · และตัวเลข 10 หลักขึ้นไปในข้อความ) — เบอร์ / ที่อยู่ / เลขบัญชีอยู่ใน Payee vault เท่านั้น |

**Migration v13** (`rules-kol.js migrateV13` · เรียกจาก `store.migrate`): ทุก KOL `contact_id = null` · `schema_version = 13` · ไม่ดึงจาก note
**ค่าที่จำต่อ user (localStorage · ไม่อยู่ใน state / Backup):** `charmiss_kol_tracker_dash.all.statuses` = `{userId: [status…]}` (Dashboard › All campaigns › Status) · `charmiss_kol_tracker_deals.stateTab.v2` = `{userId: tab}` (CR-13)
**Export KOL Master** (`kol_master.csv`): + `contact_id` · `last_worked` · `last_campaign` (Campaign ของ deal เดียวกับ Last worked)

## CR-15 — schema 13 → 14 (Journey)

**`lookups.journey_steps`** — ชื่อขั้น = งานล่าสุดที่ทำเสร็จแล้ว รอขั้นถัดไป (`rules-journey.js JOURNEY_V14`)

| sort | sub_status | status | บังคับ | date_field | expected_field |
|---|---|---|---|---|---|
| 10 | Shortlist | List | — | — | — |
| 20 | Contacted | List | — | — | — |
| 30 | Confirm QT | List | ✓ | — | — |
| 40 | Brief | Inprocess | ✓ | `brief_date` | — |
| 50 | **Script** | Inprocess | ✓ | `script_date` | `expected_script_date` |
| 60 | **Draft 1** | Inprocess | ✓ | `approved_draft1_date` | `expected_draft1_date` |
| 70 | **Draft 2** | Inprocess | ตาม `draft_rounds` | `approved_draft2_date` | `expected_draft2_date` |
| 80 | **Draft 3** | Inprocess | ตาม `draft_rounds` | `approved_draft3_date` | `expected_draft3_date` |
| 90 | **Approve** | Inprocess | ✓ | `approved_date` | `expected_approve_date` |
| 100 | Post | Complete | ✓ | (deal_posts) | `expected_post_date` / posts |
| 110 | Cancel | Cancel | — | — | — |

| Field | ค่า |
|---|---|
| `deals.expected_script_date` · `script_date` · `expected_approve_date` · `approved_date` (ใหม่) | date \| null · วันที่ของขั้น Script / Approve (date ถูกตั้งโดย Move stage · แก้ได้เมื่อถึงขั้นนั้นแล้ว) |
| `approved_draftN_date` | ชื่อฟิลด์เดิม (ไม่ rename ข้อมูล) · UI = "Draft N date" |
| `deals.script_required` | **deprecated** — ไม่ใช้แล้ว (เก็บไว้ในข้อมูลเก่า · deal ใหม่ไม่เขียน · ไม่อยู่ใน Export) |

**Migration v14** (`rules-journey.js migrateV14` · เรียกจาก `store.migrate` · รันซ้ำได้ผลเดิม): journey_steps = ตารางข้างบน (label_th ที่ผู้ใช้แก้เองคงไว้กับขั้นเดิม · ขั้นที่เพิ่มเองคงไว้) · `sub_status` / `from_sub_status`: Approve Script → Script · Approve Draft n → Draft n ใน `deals` และ `deal_status_log` (วันที่ไม่แตะ) · 4 ฟิลด์ใหม่ = null · สำเนาข้อมูลก่อน upgrade อยู่ใน localStorage `charmiss_kol_tracker_v1_before_v14` (Settings › Data ดาวน์โหลดได้)
**ข้ามขั้น** (`rules.skippedSteps`): ขั้นในแผนที่ข้ามไปข้างหน้า → `date_field` = วันที่ย้าย + `deal_status_log` 1 แถวต่อขั้น (note `auto-completed`) ก่อนแถวของการย้าย

## CR-16 — schema 14 → 15 (payee / ที่อยู่หลายรายการ · รูปโปรไฟล์)

| Field | ค่า |
|---|---|
| `payee_profiles.kol_id` | **ไม่ unique แล้ว** — 1 KOL มีหลาย payee (`rules.payeesOfKol` · default ก่อน แล้วตาม label) |
| `payee_profiles.label` | ≤ 40 ตัวอักษร · ห้ามเลขบัญชี / เลขบัตร / เบอร์ · ไม่ซ้ำใน KOL เดียวกัน (`validatePayeeLabel`) · ของเดิม = "Primary" |
| `payee_profiles.is_default` | 1 ต่อ KOL (`rules.withDefault`) · payee แรกเป็น default อัตโนมัติ · `rules.payeeOfKol` = default (ผู้เรียกของ CR-08 ได้ default) |
| `payee_profiles.archived` | payee ที่มี payment line / deal ใช้แล้ว ลบไม่ได้ → Archive · default archive ไม่ได้ (`payeeActions`) |
| `deals.payee_id` | null = default ของ KOL · `rules.payeeOfDeal` · เปลี่ยนด้วย `rules.setDealPayee` → deal_events `payee` (from / to) · line ที่ยังไม่เข้า run ตามไปด้วย (คิดภาษีใหม่ด้วยสูตรเดิม · WHT ที่ยืนยันแล้วคงไว้) |
| `payment_lines.payee_id` | ล็อกเมื่ออยู่ใน run / submitted / paid (`linePayeeLocked`) · `payeeOfLine` = line → deal → default |
| `shipping_addresses` | `address_id` (AD-0001) · `kol_id` · `label` · `is_default` · `archived` · `secure` {recipient, phone, address} · `details_updated_at/by` · `created_at/by` |
| `sample_shipments.address_id` | null = default ของ KOL · Mark shipped บันทึกที่อยู่ที่ใช้จริง (`rules.pinAddress`) · `addressOfShipment` |
| `kol_master.photo` | `{ updated_at, updated_by, w, h, bytes }` \| null · ตัวรูปอยู่ใน **IndexedDB** `charmiss_kol_tracker` › store `kol_photos` (key = kol_id · Blob WebP 256×256 q0.8) — ไม่อยู่ใน localStorage / state |

**Migration v15** (`rules-profile.js migrateV15` · เรียกจาก `store.migrate` · รันซ้ำได้ผลเดิม · สำเนาก่อน upgrade `charmiss_kol_tracker_v1_before_v15` แทนที่สำเนา v14): payee ทุกรายการ label "Primary" · default 1 ต่อ KOL · archived false · **`secure_ship` → `shipping_addresses`** 1 รายการต่อ payee (label "Primary" · default ถ้าเป็นที่แรกของ KOL) โดยย้าย ciphertext ทั้งก้อน (ไม่ถอดรหัส · ไม่ต้อง Unlock — `secure_ship` เป็น record เข้ารหัสแยกอยู่แล้ว) แล้วลบ `secure_ship` / `shipping_on_file` · `deals.payee_id` · `sample_shipments.address_id` · `kol_master.photo` = null
**อ่านที่อยู่:** `rules.readShip` รับทั้งรูปแบบใหม่ {recipient, phone, address} และของ CR-10 {ship_name, ship_phone, ship_address}
**Backup with photos:** ไฟล์ JSON มี key `photos` { kol_id: data URL } เพิ่ม · `store.restore` ตัดออกก่อน migrate แล้วคืนให้ ui เขียนลง IndexedDB · ไม่มี `photos` = รูปในเครื่องคงอยู่

## CR-17 — schema 15 → 16 (Simple mode · Campaign approval)

| Field | ค่า |
|---|---|
| `lookups.ops_mode` | `{ payments: 'simple' \| 'full', shipments: 'simple' \| 'full' }` · default simple / simple · `rules.opsMode(state, kind)` (rules-ops.js) เป็นที่เดียวที่หน้าจอถาม |
| `payment_lines.paid_by` · `paid_ref` | คนที่กด Mark paid · เลขอ้างอิง (PR no. / ใบโอน — ห้ามเลขบัญชี: `looksSensitive`) |
| `payment_lines.sent_at` · `sent_by` | ตอน Export for accounting (Simple) — line อยู่ใน run ที่สร้างอัตโนมัติ `auto: 'simple'` · `label: 'Sent dd/mm'` · status `submitted` (= With Accounting ใน Full) |
| `payment_lines.unpaid_reason` | ตอน Mark unpaid (line กลับเป็น open · ออกจาก run · flag ของ deal ถอยตาม `syncDealPayment`) |
| `campaigns` / `phases` `.approval_status` | `pending` · `approved` · `rejected` · ไม่มีค่า = approved (`rules.isApproved`) |
| `.approval` | `{ submitted_by, submitted_at, decided_by, decided_at, reason }` (+ `previous` หลัง Resubmit) |
| `.pending_change` | `{ fields: { budget_kol, pillar_target \| start_date, end_date, budget_kol \| delete }, requested_by, requested_at }` \| null — ยังไม่มีผลจนกว่าจะ Approve · Reject → `change_rejected` { fields, reason, decided_by, decided_at } |
| `campaign_events.type 'approval'` | `to` = submitted · approved · rejected · change_requested · change_approved · change_rejected · change_cancelled · `phase_id` · `fields` · `note` = เหตุผล |

**สถานะ:** `campaignEffectiveStatus` = `'pending'` เมื่อ Campaign ยังไม่อนุมัติ (pending / rejected) → อยู่ใน `CAMPAIGN_STATUSES` แต่ไม่อยู่ใน `DASH_STATUS_DEFAULT` (ไม่นับ Dashboard) · `phaseStatus` = `'pending'` · `campaignBlocksNew` = ข้อความ "ยังรอผู้จัดการอนุมัติ" (New deal · Bulk shortlist · Add to campaign) · `phasesOfCampaign` / `phaseIndex` / `scopeBudget` / `scopeRange` / `scopePhases` / pillar prefill ใช้เฉพาะ Phase ที่อนุมัติ (โพสต์ไม่ resolve เข้า Phase pending · ไม่นับงบ)
**Migration v16** (`rules-ops.js migrateV16` + `rules-approval.js migrateApprovals` · รันซ้ำได้ผลเดิม): ops_mode simple / simple · line ใน run ที่ไม่ใช่ draft (submitted / paid) ได้ `sent_at` = `submitted_at` ของ run · ฟิลด์ใหม่ = null · Campaign / Phase ทั้งหมด approved · `pending_change` null

**CR-17 v1.2 (schema ไม่เปลี่ยน):** `approval.note` · `pending_change.note` (Note to approver) · แถว `campaign_events` approval เพิ่ม `requested_by` (ผู้ขอ) · `request` (new_campaign · new_phase · change · budget_increase · budget_decrease) · `change_id` (งบ) — ใช้สร้างการ์ด Decided / My requests · `phaseStatus` = `'rejected'` สำหรับ Phase ที่ถูกตีกลับ · `campaignEffectiveStatus`: Cancelled > Rejected > Pending approval > On hold > วันที่

## CR-18 — schema 16 → 17 (งบ Campaign ตามเวลา)

| Field | ค่า |
|---|---|
| `campaign_budget_changes.change_id` | `BG-0001` … |
| `.campaign_id` · `.type` | Campaign · `initial` (งบแรก) · `increase` · `decrease` |
| `.amount` | บาท (บวกเสมอ — ทิศทางมาจาก type) |
| `.allocations` | `[{ phase_id \| 'unallocated', amount }]` รวมเท่ากับ amount (Initial = งบ Phase + ส่วนต่าง · ส่วนต่างติดลบได้เมื่อ Phase รวมเกินงบ) |
| `.reason` · `.note` | เหตุผล (บังคับ · ห้ามเลขบัญชี) · Note to approver |
| `.status` | `pending` · `approved` · `rejected` · `cancelled` — ค้างได้ 1 รายการ (increase / decrease) ต่อ Campaign |
| `.requested_by` / `_at` · `.decided_by` / `_at` · `.reject_reason` | ผู้ขอ (`system` = migrate) · ผู้อนุมัติ (Apply ของผู้จัดการ = ตัวเอง) · เหตุผลที่ตีกลับ |
| `.budget_before` · `.budget_after` | งบ Campaign ก่อน / หลังตอนอนุมัติ |
| `campaigns.budget_kol` | **งบที่อนุมัติแล้วรวม** (initial + increase − decrease) — เปลี่ยนตอนอนุมัติเท่านั้น · Used % / Remaining / Dashboard ใช้ค่านี้ |
| `phases.budget_kol` | งบ Phase ที่อนุมัติแล้ว — Adjust budget เพิ่ม / ลดตาม allocations ตอนอนุมัติ · ส่วน Unallocated อยู่ระดับ Campaign (`rules.unallocatedOf`) |

**แถว Initial ของ Campaign ใหม่ / ที่ยังไม่อนุมัติ** ตามตัว Campaign (`rules.syncInitial`): แก้งบใน Planner / drawer → amount + allocations ตาม · Approve / Reject / Resubmit → status ตาม · อนุมัติแล้ว = ล็อก (`locked`)
**Migration v17** (`rules-budget.js migrateV17` · รันซ้ำได้ผลเดิม): `campaign_budget_changes = []` ถ้ายังไม่มี · Campaign ที่มี `budget_kol` และยังไม่มี Initial → แถว Initial approved (requested_by / decided_by `system`) · `schema_version = 17` · ตัวเลขงบทุกหน้าไม่เปลี่ยน (seed: CH ฿850,000 · KS ฿600,000 · AC ฿400,000 · PH ฿898,400)

## CR-19 — schema 17 → 18 (Pillar · ไม่มี pillar target)

| Field | ค่า |
|---|---|
| `lookups.pillar_list` | **Awareness → Awareness & Consideration → Consideration → Conversion** (`R.PILLARS` ลำดับเดียวกัน · ชื่อสั้น `R.pillarShort` "Aware + Consider") · `deals.pillar` / `phases.default_pillar` ใช้ค่าใดค่าหนึ่งหรือว่าง (= Not set) |
| `phases.default_pillar` | migration ตั้ง Awareness & Consideration ให้ Phase ที่ว่างและ label มีทั้ง 2 คำ (seed: PH-P1) |
| `campaigns.pillar_target` · `lookups.pillar_target_default` | **deprecated** — เก็บไว้ไม่ลบ ไม่แสดง / ไม่ใช้คำนวณ (`R.pillarTargetOf` / `validatePillarTarget` ยังอ่านไฟล์เก่าได้) |

**Migration v18** (`rules-overview.js migrateV18` · รันซ้ำได้ผลเดิม): แทรก Awareness & Consideration หลัง Awareness ใน pillar_list ถ้ายังไม่มี · default pillar ตามข้างบน · ไม่แตะ deal · `schema_version = 18`

## CR-20 — schema 18 → 19 (Package · Draft notes · Script link)

| ที่ | Field | ค่า |
|---|---|---|
| **kol_packages** (ใหม่) | `package_id` PKG000001… · `kol_id` · `name` · `units_total` (≥1) · `price_total` (฿) · `start_date` · `valid_until` (null ได้) · `payee_id` (null = default payee ของ KOL) · `payment_status` to_pay / sent / paid · `paid_date` · `note` · `archived` · `created_by` · `created_at` · `updated_at` | ค่าคำนวณ (ไม่เก็บ): unit price = price ÷ posts · used = Σ `package_units` ของ deal ที่ term Package · ถึง Confirm QT · ไม่ Cancel · remaining · status Active / Used up / Expired / Archived · `payment_status` / `paid_date` ตามแถวจ่ายของ package (`R.syncPackages` ทุก commit) |
| `deals` | `package_id` (null) · `package_units` (1) · `package_paid` (false — ค่าที่ sync จาก package ใช้คิด Paid) · `script_link` (null · https) | Package: `rate_card` = unit price × uses (ล็อก) · `payment_term` = `'package'` |
| `payment_lines` | `package_id` (null) · `source: 'package'` · milestone `package` (ยอดเต็มของ package · deal_id null) · milestone `extras` (ค่าใช้จ่ายเพิ่มของ deal Package) | แถวของ package เกิดเมื่อมีการกด Mark paid / Export for accounting (ก่อนนั้นเป็นแถวที่คำนวณ) |
| **step_notes** (ใหม่) | `deal_id` + `step_key` (draft_1 · draft_2 · draft_3) · `note` · `links` [https] · `image_ids` [] · `updated_by` · `updated_at` | log `deal_events` type `step_note_updated` (from / to = จำนวนลิงก์ / รูป) |
| IndexedDB `charmiss_kol_tracker` v2 › **step_images** (ใหม่) | `image_id` · `deal_id` · `step_key` · `blob` (WebP q0.8 · ด้านยาว ≤ 1600px) · `w` · `h` · `bytes` · `created_at` | ไม่อยู่ใน localStorage / state · Backup "Include photos & draft images" ใส่เป็น `step_images` ในไฟล์ |
| `deal_events` | type `package_created` · `package_updated` · `package_archived` · `package_paid` (deal_id null · `package_id`) · `step_note_updated` | |
| payment term | `R.PAYMENT_TERMS` + `package` (ท้ายรายการ · ไม่ใช่ default ของ KOL) | ไม่มี `lookups.payment_terms` ในข้อมูล (term อยู่ใน code) |

**Migration v19** (`rules-package.js migrateV19` · รันซ้ำได้ผลเดิม): สร้าง `kol_packages` / `step_notes` ว่าง · ใส่ค่าเริ่มของ field ใหม่ใน deals / payment_lines · seed ไม่มี package → Committed ฿1,783,579 · Paid ฿774,579 · Pending ฿98,000 เท่าเดิม

## CR-21 — schema 19 → 20 (Draft · Return to draft · Round)

| ที่ | Field | ค่า |
|---|---|---|
| `campaigns` / `phases` | `approval_status` **draft** · pending · approved (ไม่มี rejected) · `approval` + `created_by` / `created_at` · `submit_round` (0 = ยังไม่เคยส่ง) · `returned_reason` / `returned_by` / `returned_at` (ระหว่างเป็น draft ที่ถูกส่งกลับ) · `last_submitted` { round · at · by · reason · values } | `values` = `R.requestSnapshot` ตอนถูกส่งกลับ → What changed since last round · Phase ของ New campaign ตามสถานะ Campaign · `phases.budget_basis` (percent / amount — Planner เปิดตามนี้) |
| `pending_change` | + `status` draft / pending · `submit_round` · `returned_*` · `last_submitted` | fields อาจมี `campaign_name` · `note` · `products` (CR-21 §3.7) · approve → `R.applyChange` (products → campaign_products) |
| `campaign_budget_changes` | `status` draft · pending · approved · cancelled + `submit_round` · `returned_*` · `last_submitted` | Budget history ไม่แสดง draft |
| `campaign_events` (approval) | to + `draft_saved` · `resubmitted` · `withdrawn` · `returned` · `draft_deleted` · field `round` | เขียนโดย `R.requestTransition` เท่านั้น |
| localStorage (ต่อผู้ใช้) | `campaignTable.sort.<uid>` / `.collapsed.<uid>` · `campaignTimeline.sort.<uid>` / `.collapsed.<uid>` · `deals.year.<uid>` · `requests.seen.<uid>` | try/catch · ไม่มี = ค่าเริ่ม |

**Migration v20** (`rules-request.js migrateV20` · รันซ้ำได้ผลเดิม): rejected → draft + `returned_*` จาก event rejected ล่าสุด (สำรอง: `approval.reason / decided_by / decided_at`) · `submit_round` = จำนวน event submitted (อย่างน้อย 1) · `last_submitted` = ค่าปัจจุบัน · `change_rejected` → `pending_change` draft ที่ถูกส่งกลับ · budget change rejected → draft · approved ไม่แตะ · seed ไม่มีคำขอ → Committed ฿1,783,579 · Paid ฿774,579 · Pending ฿98,000 เท่าเดิม

## CR-22 — schema 20 → 21 (Shipment method · KOL buys own · Product purchase)

| ที่ | Field | ค่า |
|---|---|---|
| `sample_shipments` | + `method` npd · warehouse · self_purchase · `purchase_amount` (null · KOL buys own) · `purchased_date` · status + `kol_purchase` / `purchased` · `items` [{ tr_code, qty }] (key เดิม `tr_code` = product code) · `source` + `move` / `new_deal` | KOL purchase อยู่ tab To ship (กลุ่มท้าย) · Purchased อยู่ tab Delivered · deal Cancel → Not required |
| `deals` | + `product_purchase_fee` (null) | = purchase_amount ของ shipment KOL buys own · รวมใน `R.totalCost` → Committed / Payments · ไม่เข้า rate quote |
| `lookups.shipment_methods` (ใหม่) | [{ key, label }] npd · warehouse · self_purchase | แก้ label ได้ที่ Settings › Samples (key คงที่) |
| localStorage (ต่อผู้ใช้) | `dealModal.tab.<uid>` (overview · costs · timeline · ships · history) | try/catch |

**Migration v21** (`rules-samples.js migrateV21` · รันซ้ำได้ผลเดิม): shipment เดิมทั้งหมด method = warehouse · items ว่าง → สินค้าของ deal (qty 1) · purchase_amount / purchased_date null · deals.product_purchase_fee null · ไม่แตะยอดเงิน → Committed ฿1,783,579 · Paid ฿774,579 · Pending ฿98,000 เท่าเดิม

## CR-23 — schema คงที่ 21 (Ship by ที่คนตั้ง · เหตุผล Cancel)

| ที่ | Field | ค่า |
|---|---|---|
| `sample_shipments` | + `ship_by_date` (null = Ship by not set) | วันที่คนตั้ง (Move stage · New deal · Deal modal · Shipments) = due ของ shipment (`R.shipByDate`) · `ship_by` เดิมเป็นค่าคำนวณ CR-10 → ใช้เป็น hint "Suggested" เท่านั้น (ค่าที่คนแก้เอง ✎ / shipment ไม่มี deal ยังนับ) |
| `deals` | + `cancel_reason_key` (null = Other) | key จาก `lookups.cancel_reasons` · `cancel_reason` (เดิม) = Detail · ออกจาก Cancel → ล้างทั้งคู่ |
| `lookups.cancel_reasons` (ใหม่) | [{ key, label, active }] kol_declined · price · no_response · schedule · content · brand_change · other | ใส่ค่า default ตอนโหลดถ้ายังไม่มี (`store.migrate` ทุกครั้ง · ไม่ขึ้น schema) · Settings › Lists › Cancel reasons (Other คงที่) |

ไม่มี migration · ไม่แตะยอดเงิน · stage ตอนยกเลิกอ่านจาก `deal_status_log` (log ไป Cancel → `from_sub_status`)

## CR-24 — schema คงที่ 21 (Operations = Work queue)

| ที่ | Field | ค่า |
|---|---|---|
| `lookups.ops_stuck_days` (ใหม่) | จำนวนวัน (1–365 · default 7) | deal อยู่ขั้นเดิมนานกว่านี้และยังไม่ Overdue = Stuck · ใส่ 7 ตอนโหลดถ้ายังไม่มี (`store.migrate` · ไม่ขึ้น schema) · Settings › Operations mode |
| localStorage (ต่อผู้ใช้) | `opspic_<uid>` (เดิม) · `opscamps_<uid>` (JSON · null = default) · `opswait_<uid>` ('' · us · kol) · `opsfold_<uid>` (section ที่พับ) | try/catch |

ไม่มี migration · ไม่แตะยอดเงิน · Pillar allocation (`R.pillarAllocation`) ถูกตัด — portfolio ของ All campaigns ยังมี pillar mix ของแต่ละ Campaign

