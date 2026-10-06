# Data model — Charmiss KOL Tracker

schema_version **11** (CR-10 · 06/10/2026) · ทั้งหมดอยู่ใน state เดียว (`localStorage` key `charmiss_kol_tracker_v1`) · Backup / Restore = JSON ทั้งก้อน
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
| `deal_events` | `event_id` | append-only: pic · plan · payment_term · `payment` (line เปลี่ยนสถานะ) · `payee_details_changed` (ไม่มีค่า) · **`metrics`** · **`sample`** (CR-10) | CR-02 |
| `sample_shipments` | `shipment_id` SH000001 | สินค้าตัวอย่างที่ส่งให้ KOL (หลายรายการต่อ deal) · items · ship by · สถานะ · carrier · tracking (CR-10 §4.14) | CR-10 |
| `users` | `user_id` | `display_name` · `email` · `role` · `is_pic` · `pic_name` · `active` · `meta.current_user_id` = คนที่ใช้งานในเบราว์เซอร์นี้ | CR-04 |
| `campaign_events` | `event_id` | append-only: Phase Planner · status · **products** (CR-09) | CR-05 |
| `products` · `campaign_products` · `deal_products` | `tr_code` | catalog สินค้า · สินค้าของ Campaign · สินค้าของ deal (qty) | CR-06 |
| `payee_profiles` | `payee_id` | ผู้รับเงิน (1 ต่อ KOL หรือ Affiliate / Other) · ประเภท / VAT / WHT · เอกสาร · `secure` = ข้อมูลส่วนบุคคลเข้ารหัส · เห็นแค่ธนาคาร + 4 ตัวท้าย · **`secure_ship`** = ที่อยู่จัดส่งเข้ารหัส + `shipping_on_file` (CR-10) | CR-08 |
| `payment_lines` | `line_id` | งวดที่ต้องจ่าย (deal / manual / legacy) · Gross · VAT · WHT · Net · `status` · `run_id` · `paid_date` · `wht_cert_sent_date` | CR-08 |
| `payment_runs` | `run_id` | รอบจ่าย (PR) · `pay_date` · `prepared_by` · `status` · `submitted_at` · **`returned_*`** (CR-09) | CR-08 |
| `lookups` | — | journey steps · pillar · CTA · platform · tier rules · KOL types · `payment_settings` · `payee_vault` (public key + private key ที่เข้ารหัสด้วย passphrase) · `metrics_stale_days` · `sample_settings` (CR-10) | CR-01 |

ข้อมูลส่วนบุคคล (ชื่อจริง · ที่อยู่ · โทร · ช่องทางส่งใบ 50 ทวิ · เลขบัญชี · เลขภาษี) อยู่ได้ที่เดียวคือ `payee_profiles.secure` (เข้ารหัส) และที่อยู่จัดส่ง (ผู้รับ · เบอร์ · ที่อยู่) ใน `payee_profiles.secure_ship` (เข้ารหัส · CR-10) — ไม่มี plain text ใน state, localStorage, Backup, seed, ไฟล์ export ของ Dashboard / Deals / Performance / Stage popup · ถอดรหัสในหน่วยความจำเฉพาะตอน Unlock (Export PR พร้อมข้อมูลผู้รับ · คอลัมน์ Send to ใน Accounting · Export shipping list) แล้วทิ้ง

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
| **11** | **CR-10 R6** | `sample_shipments` · `lookups.sample_settings` (ดูด้านล่าง) |

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
