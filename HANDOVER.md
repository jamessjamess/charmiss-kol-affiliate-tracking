# Charmiss KOL & Affiliate Tracker — Handover to Dev Team

> เอกสารส่งมอบงาน · สถานะ ณ 15/10/2026 · ล่าสุดคือ **CR-35** (schema **26**)
> อ่านไฟล์นี้ก่อน แล้วค่อยอ่าน `docs/` ตามหัวข้อที่ต้องแก้

---

## 0. สิ่งที่ต้องรู้ก่อนเริ่ม (5 ข้อ)

1. **เป็นเว็บ HTML ล้วน** — ไม่มี build, ไม่มี npm, ไม่มี framework, ไม่โหลดอะไรจาก CDN · เปิด `index.html` ด้วยการดับเบิลคลิกก็ใช้งานได้ (file://) · เจ้าของงานตั้งใจให้เป็นแบบนี้ **อย่าเพิ่ม framework / npm โดยไม่ตกลงกับ James ก่อน**
2. **ไม่มี backend** — ข้อมูลทั้งหมดอยู่ใน `localStorage` ของเบราว์เซอร์เครื่องนั้น (+ IndexedDB สำหรับรูป / ไฟล์เอกสาร) · ย้ายข้อมูลข้ามเครื่องได้ทาง **Backup / Restore (ไฟล์ JSON)** เท่านั้น
3. **ข้อมูลอ่อนไหว (เลขบัญชี · ที่อยู่ · เบอร์ · ชื่อจริง · ไฟล์เอกสาร) ต้องอยู่ใน Payee vault ที่เข้ารหัสเท่านั้น** — ห้ามถอดรหัสลง state / localStorage / Backup / log · ห้ามใช้ข้อมูลจริงใน test หรือ seed
4. **กฎธุรกิจทุกอย่างเป็น pure function ใน `src/rules-*.js`** (ไม่มี DOM) · หน้าจอ (`src/screen-*.js`) เรียกใช้เท่านั้น · ตัวเลข / สถานะเดียวกันต้องมาจากฟังก์ชันเดียว (เช่น `R.stageRequirements`, `R.gradeEngine`, `R.paymentReadiness`)
5. **ข้อความบนหน้าจอเป็นภาษาอังกฤษ อยู่ใน `src/content.js` ไฟล์เดียว** (toast / ข้อความแจ้งบางส่วนเป็นไทย) · อย่าเขียนข้อความลงในโค้ดหน้าจอตรง ๆ

---

## 1. ระบบคืออะไร

ระบบติดตามงาน KOL & Affiliate ของ Charmiss ครอบคลุมตั้งแต่วางแผน Campaign → หา KOL → ทำ Deal ตาม Journey → ส่งของตัวอย่าง → เก็บโพสต์และผลลัพธ์ → จ่ายเงิน → ให้เกรด Partner

| เมนู (side menu) | route | ใช้ทำอะไร |
|---|---|---|
| Dashboard | `#dashboard/all · campaign · ops · partners` | ภาพรวม All campaigns · By campaign · Operations (work queue · Review grade) · Partners (Grade mix · On-time posts · Engagement rate · Partner performance รายคน) |
| Campaign & Phase | `#campaigns` | Campaign / Phase · Phase Planner (งบ · Benchmarks) · Approvals |
| Deals | `#deals` | Table / Pipeline / Performance · Deal modal · Move stage · New deal |
| Payments | `#payments/tosubmit · submitted · confirmed` (Simple mode) | วางบิลเป็นรอบ PR · Accounting verify · Print PDF · Export PR |
| Shipments | `#shipments` | ของตัวอย่าง To ship / In transit / Delivered |
| KOL Master | `#kols` | รายชื่อ KOL / Affiliate · KOL profile modal (payee · ที่อยู่ · เกรด) |
| Settings | `#settings/<section>` | Lists (Journey · Pillar · CTA · Platform · Cancel reasons · KOL types · Partner types) · Tiers · Products · Performance · Grades · Samples · Payments · Operations mode · Data · Go-live |
| Role Management | `#roles` | ผู้ใช้และสิทธิ์ (admin เท่านั้น) |

ขนาดโค้ด: JavaScript ~25,650 บรรทัดใน `src/` (ไม่รวม `data/seed.js` 1.1 MB) · seed มี KOL 911 · deal 305 · โพสต์ 313 · campaign 4 · ผู้ใช้ 9

---

## 2. เปิดใช้งาน / Dev setup

- เปิด `index.html` ใน **Edge หรือ Chrome** (ทดสอบหลักบน Edge/Chromium) — ไม่ต้องมี server
- ถ้าต้องการ server (เช่นใช้ devtools บางอย่าง): `python -m http.server` ในโฟลเดอร์นี้ แล้วเปิด `http://localhost:8000`
- ครั้งแรกระบบโหลด seed (`data/seed.js`) แล้ว migrate ขึ้น schema ล่าสุดเอง และเก็บลง `localStorage`
- **เริ่มข้อมูลใหม่:** Settings › Data › Reset to seed (admin) หรือ ลบ key `charmiss_kol_tracker_v1` ใน devtools
- **สลับผู้ใช้ / ดูในบทบาทอื่น:** มุมล่างซ้าย (Switch user · View as role — admin)
- วันที่ "วันนี้" ใช้นาฬิกาเครื่อง (`R.todayISO()`, เวลาไทย)

---

## 3. โครงสร้างโฟลเดอร์

```
KOL Web Dev/
├─ index.html            ลำดับ <script> = ลำดับโหลด (สำคัญ — ดู §4)
├─ HANDOVER.md           ไฟล์นี้
├─ CHANGELOG.md          สรุปสั้น CR ละไม่กี่บรรทัด (ใหม่สุดอยู่บน)
├─ data/seed.js          window.KT_SEED — ข้อมูลตั้งต้น (สร้างจาก Data/KOL_seed_v2.json) · ห้ามแก้
├─ docs/
│   ├─ CR-23.md … CR-34.md   spec ของแต่ละ CR + "หมายเหตุการ implement" + "การตัดสินใจ" + ผลทดสอบ
│   ├─ DATA_MODEL.md         โครงข้อมูลทุก collection + migration ทุก schema
│   ├─ PAYMENTS.md           flow การจ่ายเงิน · ภาษี · vault
│   ├─ UI_PATTERNS.md        กติกาหน้าจอ (modal / drawer / ปุ่ม / ปิด / focus / สี)
│   └─ archive/              (ว่าง — ไฟล์ CHANGELOG-full-2026-10-07.md ที่ CHANGELOG.md อ้างถึงไม่มีแล้ว)
└─ src/
    ├─ content.js            ข้อความทุกคำบนหน้าจอ (KT.content)
    ├─ icons.js              ไอคอน SVG
    ├─ rules*.js             กฎธุรกิจ (pure functions → KT.rules)
    ├─ store.js              state · localStorage · migrate · Backup/Restore (KT.store)
    ├─ archive.js · photos.js · docfiles.js   IndexedDB (สำเนาเก่า · รูป · ไฟล์เอกสารเข้ารหัส)
    ├─ vault.js              เข้ารหัส payee (KT.vault)
    ├─ pdf.js · xlsx.js · export.js           สร้าง PDF / XLSX / ข้อมูล export
    ├─ ui.js · ui-range.js   ตัวช่วย UI ร่วม (KT.ui) — modal, drawer, date field, commit, toast …
    ├─ screen-*.js           หน้าจอแต่ละหน้า / แต่ละส่วน
    ├─ styles.css            CSS ทั้งหมด (token สี light/dark บน :root)
    └─ app.js                โครงหน้า · เมนู · routing (โหลดเป็นไฟล์สุดท้าย)
```

โฟลเดอร์ข้างเคียง (`G:\My Drive\[Charmiss] - KOL & Affiliate\`):
- `Data/` — spec ต้นฉบับทุก CR (`CR-xx_….md`), ไฟล์ข้อมูลต้นทาง, `KOL_Affiliate_Tracker_Handoff.md` (spec production Next.js + Supabase — ยังไม่เริ่ม ดู §13)
- `charmiss-kol-affiliate-tracking/` — **git repo** (สำเนาของ `KOL Web Dev` ที่ใช้ commit) · `KOL Web Dev/` คือที่แก้งานจริง
- ⚠️ `Data/PR 09_10_26.xlsx` และไฟล์ NPD / PR อื่น ๆ มี **ข้อมูลส่วนตัวจริง** — ห้ามเปิดใช้ใน dev / test, ห้าม commit, ห้ามคัดลอกค่าลงโค้ด / seed

---

## 4. สถาปัตยกรรม

### 4.1 Namespace เดียว `window.KT`
| ส่วน | อยู่ที่ | หน้าที่ |
|---|---|---|
| `KT.content` (`C`) | content.js | ข้อความ · label · ฟังก์ชันประกอบข้อความ (`C.pay.rounds.created(name, n)`) |
| `KT.rules` (`R`) | rules*.js | ทุกไฟล์ `Object.assign(KT.rules, (function (R, C) { … return {…}; })(KT.rules, KT.content))` — ไฟล์หลังเรียกฟังก์ชันของไฟล์ก่อนได้ |
| `KT.store` (`S`) | store.js | `createStore`, `migrate`, `fromSeed`, IDs, Backup / Restore |
| `KT.ui` (`U`) | ui.js | `state()`, `commit()`, `toast`, `createModal`, `openDrawer`, `popForm`, `dateHTML`, `can()`, `guard()`, `go()` … |
| `KT.screens.<page>` | screen-*.js | หน้าหลักแต่ละหน้า (`render(id)`) |
| โมดูลย่อย | screen-*.js | `KT.profile` (KOL modal) · `KT.move` (Move stage) · `KT.newDeal` / `KT.bulk` · `KT.planner` · `KT.payee` · `KT.docs` · `KT.print` · `KT.grades` · `KT.partners` · `KT.samples` · `KT.perf` · `KT.budget` · `KT.approvals` · `KT.golive` · `KT.packages` |

### 4.2 ลำดับโหลด (index.html)
`seed → content → icons → rules*.js → store → archive/vault/photos/docfiles/pdf/xlsx → export → ui → screen-*.js → app.js`
เพิ่มไฟล์ rules ใหม่ให้วางหลังไฟล์ที่มันเรียกใช้ · เพิ่มหน้าจอใหม่ให้วางก่อนไฟล์ที่เรียกมัน

### 4.3 การเปลี่ยนข้อมูล — ทางเดียวคือ `U.commit()`
```
หน้าจอ: guard('สิทธิ์') → แก้ state() ผ่านฟังก์ชันใน R (คืน events) → push events ลง log → commit(ข้อความ)
commit(): R.cancelDealLines → R.syncShipments → R.syncPackages → R.syncGrades → store.save() → banners → toast
```
- ทุกการเปลี่ยนสำคัญมี event: `deal_events` (deal / post / payment / payee / incident …), `deal_status_log` (Journey), `campaign_events` (Campaign / Phase / approval / benchmarks)
- งานที่ย้อนได้ใช้ `U.toastAction(…, 'Undo', fn, 10000)` (snapshot ก่อนแก้ แล้วคืนค่า)

### 4.4 การแสดงผล
- สร้าง HTML เป็น string แล้วใส่ `innerHTML` · **escape ทุกค่าด้วย `esc()`** · event ใช้ delegation บน container (`data-*` attribute)
- Container ตาม `docs/UI_PATTERNS.md`: สร้างใหม่ = `createModal` (S/M/L) · ดู/แก้ของเดิม = drawer หรือ Deal modal / KOL modal · ถามสั้น = `confirmDialog` · ฟอร์มสั้นข้างปุ่ม = `popForm`
- Deal modal เปิดทางเดียว: `KT.screens.deals.openDealModal(id, { tab, focus, after, nav })`

---

## 5. ข้อมูล

### 5.1 ที่เก็บ
| ที่ | key / ชื่อ | มีอะไร |
|---|---|---|
| localStorage | `charmiss_kol_tracker_v1` | state ทั้งก้อน (JSON) ~1.5 MB (หลังโหลด seed) จากโควต้า ~5 MB |
| localStorage | `charmiss_kol_tracker_<pref>` | ค่าส่วนตัวของผู้ดู (tab ที่เปิด, filter, theme …) — ไม่ใช่ข้อมูลงาน |
| sessionStorage | `charmiss_kol_tracker_view_as` | View as role ของ admin |
| IndexedDB | `charmiss_kol_tracker` | `kol_photos` · `step_images` (รูป) |
| IndexedDB | `charmiss_kol_tracker_docs` | `doc_files` (ไฟล์เอกสาร payee / จ่ายเงิน — **เข้ารหัส**) |
| IndexedDB | `charmiss_kol_tracker_archive` | สำเนาข้อมูลก่อนอัปเกรด schema (ย้ายออกจาก localStorage) |

### 5.2 State (schema 26)
`schema_version · lookups · meta · local` + collections:
`campaigns · phases · kol_master · kol_accounts · kol_rate_quotes · deals · deal_posts · deal_status_log · deal_events · users · campaign_events · products · campaign_products · deal_products · payee_profiles · payment_lines · payment_runs · sample_shipments · pick_lists · shipping_addresses · campaign_budget_changes · kol_packages · step_notes · deal_gencodes · deal_incidents · partner_grades · grade_history`

รายละเอียด field ทุกตัว → `docs/DATA_MODEL.md`

### 5.3 Migration
- `store.migrate(obj, now)` ไล่ `toV2 … toV26` ทีละขั้น (ครั้งเดียวต่อ schema) — ใช้กับ seed, localStorage และไฟล์ Backup เก่า
- **เพิ่ม schema ใหม่:** (1) เพิ่ม `R.migrateVxx(obj, …)` ใน rules ของเรื่องนั้น (ต้องรันซ้ำได้ผลเดิม · `schema_version = Math.max(…)`) (2) `toVxx` + บรรทัดใน `migrate()` (3) `SCHEMA_VERSION` (4) collection ใหม่ → `COLLECTIONS` + `ADDED_IN` + `C.counts` (5) ID ใหม่ → `ID_FORMATS` (6) เขียนใน `docs/DATA_MODEL.md`
- **ห้ามลบหรือเปลี่ยนค่าเงินเดิมใน migration** (เพิ่ม field ได้เท่านั้น)

### 5.4 ID
`K0001` KOL · `A00001` account · `Q00001` rate quote · `D000001` deal · `P000001` post · `PY-0001` payee · `AD-0001` ที่อยู่ · `PL-000001` แถวจ่าย · `PR-yyyy-mm-dd[-n]` รอบจ่าย · `SH000001` shipment · `PK0001` pick list · `U001` ผู้ใช้ · `GC-00001` gencode · `IN-0001` incident · `GH-00001` grade history · `DF-xxxxxxxxxxxx` ไฟล์เอกสาร — สร้างผ่าน `store.newId(kind)` (ตาราง `ID_FORMATS` ใน store.js · ยกเว้นรอบ PR ตั้งชื่อใน rules-ops.js และ `DF-` สุ่มใน docfiles.js)

### 5.5 นิยามเงิน (ใช้เหมือนกันทุกหน้า)
Budget → **Committed** (deal ตั้งแต่ Confirm QT ไม่ Cancel) → Used % → Remaining → **Pending** (Shortlist / Contacted) · **Actual (posted)** = Total cost ของ committed deal ที่โพสต์แรกอยู่ในช่วง · Total cost = `R.totalCost(deal)` · ภาษี = `R.calcPaymentTax` (ปัด half-up 2 ตำแหน่ง)

---

## 6. ความปลอดภัย / ข้อมูลส่วนตัว (ต้องรักษาไว้)

- **Payee vault** (`vault.js`): RSA-OAEP 3072 + AES-GCM · passphrase → PBKDF2 600,000 รอบ · ล็อกเองเมื่อไม่ใช้ 15 นาที · เข้ารหัสด้วย public key (กรอก/อัปโหลดได้แม้ vault ล็อก) · ถอดรหัสต้องปลดล็อก
- ข้อมูลใน vault: บัญชี (ชื่อบัญชี · ธนาคาร · เลขบัญชี) · Full name · ที่อยู่ตามบัตร · เบอร์ · ติดต่อ WHT · Tax ID · ที่อยู่ส่งของ · ไฟล์เอกสาร
- payee เก็บแบบไม่เข้ารหัสได้แค่ `bank_name`, `account_last4`, `details_filled` (ชื่อฟิลด์ที่กรอกแล้ว — ไม่มีค่า)
- **ไม่ถอดรหัสลง state / localStorage / Backup / event log / console** · ค่าที่ถอดรหัสอยู่ในหน่วยความจำชั่วคราวเท่านั้น (Export PR / Print / Preview)
- ชื่อไฟล์ที่อัปโหลดไม่เก็บ (อาจมีชื่อคน) → เก็บเป็น `<ชนิดเอกสาร>.<นามสกุล>`
- ช่องข้อความอิสระ (note, reason, ref) ผ่าน `R.looksSensitive()` — ปฏิเสธตัวเลขยาว (เลขบัญชี / บัตร / เบอร์)
- Export / Print ที่มีข้อมูลส่วนตัว: สิทธิ์ `payment.export` + passphrase · คนที่ไม่มี `payee.unlock` ปลดได้เฉพาะไฟล์นั้น แล้ว vault ล็อกกลับ
- ทดสอบด้วยข้อมูลสมมติเท่านั้น (ชื่อ "made-up", example.com, passphrase สมมติ)

---

## 7. บทบาทและสิทธิ์ (`src/rules-roles.js` → `PERMISSIONS`)

ตรวจสิทธิ์ด้วย `U.can(action)` ตอนวาดปุ่ม และ `U.guard(action)` อีกครั้งก่อนเขียนข้อมูล

| สิทธิ์ | Admin | KOL Manager | Staff | Viewer | Accounting |
|---|:-:|:-:|:-:|:-:|:-:|
| view (ทุกหน้า · export · backup) | ✓ | ✓ | ✓ | ✓ | ✓ |
| deal.edit · kol.edit · campaign.products · campaign.draft | ✓ | ✓ | ✓ | | |
| deal.money · kol.merge · campaign.edit (+ approve) · settings.lists | ✓ | ✓ | | | |
| settings.tiers · settings.ops · data.restore · roles · vault.admin · payment.reopen · golive.run | ✓ | | | | |
| payee.edit | ✓ | ✓ | ✓ | | ✓ |
| payment.request · shipment.edit · shipment.ship | ✓ | ✓ | ✓ | | |
| payee.unlock · payee.verify | ✓ | ✓ | | | ✓ |
| payee.import · payment.run · settings.payments · shipment.settings · **grade.review** | ✓ | ✓ | | | |
| payment.paid · golive.view | ✓ | | | | ✓ |
| payment.export | ✓ | ✓ | ✓ (Phase 1) | | ✓ |

Staff ทำงานได้เฉพาะ deal ที่ตัวเองเป็น PIC ในหลายจุด (metrics, mark paid ฯลฯ) · ผู้ใช้เป็นรายชื่อใน `users` — **ไม่มีระบบ login จริง** (สลับผู้ใช้ได้จากเมนู)

---

## 8. แผนที่โมดูล → ไฟล์ → เอกสาร

| เรื่อง | กฎ (rules) | หน้าจอ | อ่านเพิ่ม |
|---|---|---|---|
| Journey / Move stage (ช่องบังคับของแต่ละขั้น) | rules.js · rules-move.js (`stageRequirements`, `checkMove`, `applyMove`) · rules-journey.js | screen-move.js · screen-deals.js | CR-15, CR-20, CR-22, CR-23 |
| Deals · Pipeline · Performance | rules-deal.js · rules-metrics.js | screen-deals.js · screen-perf.js | CR-10, CR-13, CR-28 |
| New deal | rules-bulk.js · rules-fill.js | screen-newdeal.js · screen-bulk.js | CR-20, CR-25 |
| Campaign / Phase / Planner / Approval / Budget / Close | rules-phase.js · rules-approval.js · rules-request.js · rules-budget.js · rules-close.js | screen-campaign.js · screen-planner.js · screen-approvals.js · screen-budget.js | CR-17, CR-18, CR-21, CR-29 |
| KOL Master · Profile · Payee / ที่อยู่ | rules-kol.js · rules-profile.js · rules-perf.js · rules-io.js | screen-kol.js · screen-profile.js · screen-payee.js | CR-14, CR-16, CR-25 |
| Shipments / Samples | rules-samples.js · rules-ship.js | screen-samples.js · screen-shipments.js | CR-10, CR-22 |
| Payments (Simple: รอบ PR · Full: payment runs) | rules-pay.js · rules-ops.js · rules-package.js | screen-payments.js · screen-docs.js · screen-print.js | docs/PAYMENTS.md, CR-27, CR-32, CR-33 |
| Dashboard / Operations / Export | rules-dash.js · rules-overview.js | screen-overview.js · export.js | CR-24, CR-26, CR-29 |
| Partner Grade (= On time) · Benchmarks · Incident · Partners · Review grade | rules-grade.js (`gradeEngine` ตัวเดียว · `gradePosts` · `partnersData` · `levelOf` · `sortPartnerRows`) | screen-grades.js · screen-partners.js · screen-overview.js (Operations › Review grade) | CR-34 · CR-35 |
| Gencodes | rules-gencode.js | (ใน screen-deals.js) | CR-30 |
| Campaign products · Products given | rules-products.js | screen-campaign.js · screen-deals.js | CR-06, CR-23 |
| Payment term Package (โพสต์จ่ายล่วงหน้า) · Draft notes | rules-package.js | screen-packages.js | CR-20 |
| Role Management | rules-roles.js | screen-roles.js | CR-05, CR-09 |
| Go-live clean-up | rules-golive.js | screen-golive.js | CR-11 |
| Operations mode (Simple / Full) | rules-ops.js (`opsMode`, `isSimple`) | Settings › Operations mode | CR-17 |

---

## 9. Conventions

- **โค้ด:** IIFE + `'use strict'` · ไม่มี class · ไม่มี dependency ภายนอก · `const`/arrow functions · คอมเมนต์อธิบาย "ทำไม" สั้น ๆ พร้อมอ้าง CR (`/* CR-33 §3.4 — … */`)
- ⚠️ **คอมเมนต์ `//` กลางบรรทัดยาว** เคยกลืนโค้ดที่ต่อท้าย (เกิดจริง 3 ครั้ง) — ใส่ `//` เฉพาะท้ายบรรทัดที่จบคำสั่งแล้ว
- **วันที่:** ข้างในเป็น ISO `yyyy-mm-dd` · บนจอ `dd/mm/yyyy` (`R.dmy`) · ช่องวันที่ใช้ `U.dateHTML` (พิมพ์ได้ + ปฏิทิน)
- **ตัวเลข:** เก็บเป็น number · บนจอ `R.fmtNum` / `R.baht` / `R.fmtCompact` (฿1.2M — มี ฿ ในตัวแล้ว)
- **ข้อความ:** อังกฤษใน `content.js` · ข้อความที่มีตัวแปรเป็นฟังก์ชัน · ไม่ต่อ string ภาษาในโค้ดหน้าจอ
- **Layout:** ต้องใช้ได้ 390–1920 px โดยไม่มี scroll แนวนอนของหน้า · ห้ามตัดชื่อด้วย "…" (ให้ขึ้นบรรทัดใหม่) · Light / Dark อ่านได้ทั้งคู่ (สีใช้ token บน `:root` เท่านั้น เช่น `--ok`, `--warn`, `--err`, `--info`)
- **สีมีความหมาย:** สถานะ / เกรดต้องมีตัวอักษรกำกับเสมอ ไม่ใช้สีอย่างเดียว
- **ช่องบังคับของแต่ละขั้น Journey** มาจาก `R.stageRequirements()` เท่านั้น
- **ชื่อหน้า vs route:** `U.go()` / `U.canSeeTab()` ใช้ key ของหน้า (`overview · campaign · deals · payments · shipments · kol · settings · roles`) ส่วน URL ใช้ route (`#dashboard · #campaigns · … · #kols`) — เคยพลาด `go('kols')` (ต้องเป็น `go('kol')`) · ดู `C.tabs` ใน content.js
- `R.fmtCompact()` ใส่ ฿ ให้แล้ว — อย่าเติม ฿ ซ้ำ (เคยเกิด "฿฿" 2 ครั้ง)
- Path ที่มี `[Charmiss]` — ใน PowerShell ใช้ `-LiteralPath` (วงเล็บเหลี่ยมเป็น wildcard)

---

## 10. วิธีทำ CR (กระบวนการที่ใช้มาตลอด)

1. Spec อยู่ใน `Data/CR-xx_….md` (มี §Decisions สำหรับเรื่องที่ยังไม่ชัด — ใช้ค่าในตารางนั้น)
2. ลำดับงาน: **rules** (+ migration ถ้ามี) → **content.js** → **screen** → **styles.css** → ตรวจ
3. ตรวจ:
   - `node --check` ทุกไฟล์ใน `src/`
   - ทุก key ที่โค้ดเรียกใน `C.*` มีอยู่ใน content.js
   - unit ของ rules (โหลด `src/*.js` ใน Node `vm` พร้อม seed — rules ไม่ใช้ DOM จึงรันได้)
   - เปิดหน้าจอจริงที่ 390 / 1440 / 1920 · light / dark · ไม่มี error ใน console
   - regression หน้าเดิมที่โดนแก้
4. เอกสาร: `docs/CR-xx.md` (spec + หมายเหตุ implement + การตัดสินใจ + ผลทดสอบ) · `CHANGELOG.md` (ไม่กี่บรรทัด) · `docs/DATA_MODEL.md` (ถ้าแตะข้อมูล)
5. คัดลอกไฟล์ไป repo `charmiss-kol-affiliate-tracking` แล้ว commit

---

## 11. การทดสอบ

- **ใน repo ตอนนี้ไม่มี automated test** — โฟลเดอร์ `tests/` (670 เคส) ถูกเจ้าของงานสั่งลบเมื่อ 09/10/2026 · อย่าสร้างกลับโดยไม่ถาม
- ตั้งแต่ CR-29 ตรวจด้วยสคริปต์นอก repo (Node `vm` สำหรับ rules + headless Edge ผ่าน DevTools Protocol สำหรับหน้าจอ) — ผลทดสอบของแต่ละ CR อยู่ท้าย `docs/CR-xx.md` · ถ้าทีมต้องการสคริปต์เหล่านี้เป็นจุดตั้งต้น ขอได้
- **Smoke test ขั้นต่ำก่อนส่งงาน** (ทำมือ ~15 นาที):
  1. เปิดแอปครั้งแรก (localStorage ว่าง) — โหลด seed + migrate ไม่มี error
  2. Dashboard ทั้ง 4 tab · Deals (Table / Pipeline / Performance) · เปิด Deal modal ทุก tab
  3. Move stage 1 deal ไปขั้นถัดไป (ช่องบังคับขึ้นถูก) · Undo
  4. New deal จาก KOL Master 2 คน · Undo
  5. Payments: Create round → Accounting Verify → Confirm paid
  6. KOL Master → KOL profile ทุก tab
  7. Backup → Reset → Restore ได้ข้อมูลคืนครบ
  8. หน้าจอ 390 px และ Dark mode

---

## 12. ข้อจำกัด / Known issues

| เรื่อง | รายละเอียด |
|---|---|
| ข้อมูลอยู่เครื่องเดียว | ไม่มี sync ระหว่างคน / เครื่อง · localStorage ~5 MB (ใช้อยู่ ~1.5 MB — Settings › Data แสดงขนาดจริง) · ไฟล์เอกสาร / รูปอยู่ IndexedDB ของเครื่องนั้น |
| ไม่มี authentication จริง | ผู้ใช้เลือกจากรายชื่อ · สิทธิ์ป้องกันได้แค่ในหน้าจอ |
| PDF ทำเอง (`pdf.js`) | หน้าสรุปเป็นภาพ (ภาษาไทยถูก แต่เลือก / ค้นข้อความไม่ได้) · ไม่ได้ใช้ pdf-lib เพราะกติกาไม่ใช้ npm / CDN |
| Git repo อยู่บน Google Drive | Drive sync `.git` ทำให้มี `index.lock` / `index (1).lock` ค้าง (commit ไม่ผ่าน) · **แนะนำย้าย repo ออกนอก Drive** |
| Payments 2 โหมด | Simple (รอบ PR — ใช้งานจริง) กับ Full (payment runs แบบเดิม) ยังอยู่คู่กัน · สลับใน Settings › Operations mode |
| CHANGELOG ฉบับเต็มหาย | `CHANGELOG.md` บรรทัด 3 อ้าง `docs/archive/CHANGELOG-full-2026-10-07.md` แต่ไฟล์ไม่มีแล้ว — รายละเอียด CR-01…CR-22 ดูจาก spec ใน `Data/` แทน |
| เกรด = On time (CR-35) | ข้อมูลตั้งต้นส่วนใหญ่ "Not enough data" (มีโพสต์ที่มี Post due < 2 ชิ้น) · Settings › KOL performance › Grace days ยังใช้กับป้าย Reliable / Watch / Late ของ New deal (CR-07) — On time อื่นทั้งหมดใช้ Settings › Grades |

---

## 13. งานค้าง / ทางต่อ

| เรื่อง | สถานะ |
|---|---|
| CR-35 §6 + การตัดสินใจเพิ่ม A–K | ใส่ค่าแล้ว (docs/CR-35.md) — **รอ James ยืนยัน** · Engagement จะเข้าเกรดใน CR ถัดไปเมื่อมี metrics พอ |
| ดึง metrics จาก API (Phase 2) | ยังไม่ทำ · มี field `fetch_status` / `fetched_at` เตรียมไว้ |
| ปุ่ม "Open payment voucher" (เชื่อมระบบบัญชี) | ยังไม่ทำ · มี field `external_ref` / `voucher_status` บนรอบ / แถวจ่าย |
| PDF ด้วย pdf-lib + ฟอนต์ Sarabun | ทำได้ถ้าอนุญาตดาวน์โหลด library — เปลี่ยนเฉพาะ `screen-print.js` |
| Grade บนหน้า Partners | หน้า Partners ใช้ Suggested เมื่อยังไม่มี Confirmed (เส้นประ) · หน้าอื่นยัง Confirmed เท่านั้น — ถ้าจะให้ทุกหน้าเหมือนกันต้องตัดสินใจก่อน |
| CR-12 Help guide | ข้ามไว้ (`Data/CR-12_KOL_Help_Guide_Module.md`) |
| Production (multi-user, server) | spec อยู่ที่ `Data/KOL_Affiliate_Tracker_Handoff.md` (Next.js + Supabase, v1.0 05/10/2026) — **ยังไม่เริ่ม** · ระบบปัจจุบันใช้เป็น reference ของ UX และกฎธุรกิจได้ (rules-*.js ย้ายไปเป็น `lib/rules/*` ได้เกือบตรง ๆ) |

---

## 14. ประวัติ CR (ย่อ)

| CR | วันที่ | เรื่อง |
|---|---|---|
| 01 | 05/10 | HTML ล้วน + UI revise |
| 02–05 | 05/10 | Deals + Journey · Phase จากวันโพสต์ · Side menu · Roles · Phase Planner · นิยามเงิน |
| 06–07 | 06/10 | Campaign products · KOL performance · Dashboard refine · Price reference |
| 08–09 | 06/10 | **Payments module** · Payee vault · Payments refine · role Accounting |
| 10–11 | 06/10 | Deals › Performance · Samples · Create modal · Go-live clean-up · Shipments |
| 12 | — | Help guide — ข้าม |
| 13–14 | 07/10 | Dashboard order · Deals tabs · Status filter · Contact ID · Import template |
| 15–16 | 08/10 | Journey (Script / Draft 1–3 / Approve) · KOL profile modal · หลาย payee / ที่อยู่ · รูป |
| 17–19 | 08/10 | Simple ops mode · Campaign approval · Budget planner · Campaign timeline |
| 20–24 | 08/10 | New deal redesign · Draft / Approval · Deal modal stage inputs · Products given · Operations work queue |
| 25–31 | 09/10 | Partner type · Budget vs Actual · Payment docs · Deal modal tabs · KPI · Gencodes · Campaign mix |
| 32 | 09/10 | ที่อยู่ / payee ในหน้า · Ready to send · Export PR |
| 33 | 09/10 | Payee details บังคับ · ไฟล์เอกสารเข้ารหัส · **รอบ PR** · Accounting verify · Print PDF · Actual (posted) |
| 34 | 12/10 | **Partner Grade A–D** · Benchmarks · Metrics Auto / Import / Manual · Incident · Dashboard › Partners |
| — | 14/10 | Deals › Performance: Post due + On-time (Post date vs Post due) · ซ่อน Dashboard › Partners |
| — | 15/10 | Dashboard › Partners กลับมา: ตัวกรอง Partner / Grade / Tier · Partner performance รายคน |
| 35 | 15/10 | **Grade = On time** · Partners 3 การ์ด (donut) · Review grade ใน Operations · schema 26 |

รายละเอียดเต็ม: `CHANGELOG.md` และ `docs/CR-xx.md` (CR-23 ขึ้นไป) · spec เดิมทุกฉบับอยู่ใน `Data/`

---

## 15. ติดต่อ

- เจ้าของระบบ / ผู้อนุมัติ spec: **James (LOMR)**
- เรื่องที่อยู่ใน §Decisions ของ CR หรือ §13 ด้านบน — ถาม James ก่อนเปลี่ยน
