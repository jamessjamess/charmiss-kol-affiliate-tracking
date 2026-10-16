# Charmiss KOL & Affiliate Tracker — Handover to Dev Team

> เอกสารส่งมอบระบบ · สถานะ ณ 15/10/2026 · schema **26** · เจ้าของระบบ / ผู้อนุมัติ spec: **James (LOMR)**
> อ่านไฟล์นี้ให้จบก่อนแก้โค้ด — อธิบายว่าระบบทำงานอย่างไร โค้ดอยู่ตรงไหน กติกาที่ห้ามแตก และเรื่องที่ยังค้าง
> ประวัติการเปลี่ยนแปลงอยู่ที่ `CHANGELOG.md` · spec และการตัดสินใจของแต่ละ CR อยู่ที่ `docs/CR-xx.md`

---

## 0. สรุปสั้น (อ่านก่อน)

1. **เว็บ HTML ล้วน** — ไม่มี build, npm, framework หรือ CDN · เปิด `index.html` ได้เลย (file://) · เป็นความตั้งใจของเจ้าของ — **จะเพิ่ม framework / library ต้องตกลงกับ James ก่อน**
2. **ไม่มี backend** — ข้อมูลอยู่ใน `localStorage` ของเบราว์เซอร์เครื่องนั้น (+ IndexedDB สำหรับรูปและไฟล์เอกสาร) · ย้ายข้ามเครื่องด้วย Backup / Restore (JSON)
3. **ข้อมูลส่วนตัว (บัญชี · ที่อยู่ · เบอร์ · ชื่อจริง · ไฟล์เอกสาร) อยู่ใน Payee vault ที่เข้ารหัสเท่านั้น** — ห้ามถอดรหัสลง state / storage / Backup / log · ห้ามใช้ข้อมูลจริงใน test หรือ seed
4. **กฎธุรกิจทั้งหมดเป็น pure function ใน `src/rules-*.js`** (ไม่แตะ DOM) · หน้าจอ `src/screen-*.js` เรียกใช้ · ตัวเลขเดียวกันต้องมาจากฟังก์ชันเดียว (เช่น `R.stageRequirements`, `R.gradeEngine`, `R.totalCost`)
5. **ข้อความบนจอเป็นภาษาอังกฤษ อยู่ใน `src/content.js` ไฟล์เดียว** (toast บางส่วนเป็นไทย)
6. **แก้ข้อมูลทางเดียวคือ `U.commit()`** — ทุกการเปลี่ยนสำคัญมี event log และส่วนที่คำนวณต่อ (shipments · packages · grades) ถูก sync ใน commit

---

## 1. ระบบทำอะไร

ระบบติดตามงาน KOL & Affiliate ของ Charmiss ตั้งแต่ **วางแผน Campaign → เลือก KOL → ทำ Deal ตาม Journey → ส่งของตัวอย่าง → เก็บโพสต์และตัวเลข → จ่ายเงิน → ให้เกรด Partner**

| เมนู | route | ใช้ทำอะไร |
|---|---|---|
| Dashboard | `#dashboard/all · campaign · ops · partners` | ภาพรวมทุก Campaign · ราย Campaign · Operations (คิวงาน + Review grade) · Partners (เกรดและผลงานรายคน) |
| Campaign & Phase | `#campaigns` | Campaign / Phase · Phase Planner (งบ · Benchmarks) · Approvals |
| Deals | `#deals` | Table · Pipeline · Performance · Deal modal · Move stage · New deal |
| Payments | `#payments/tosubmit · submitted · confirmed` | วางบิลเป็นรอบ PR · Accounting ตรวจเอกสาร · ยืนยันจ่าย · Print / Export |
| Shipments | `#shipments` | ของตัวอย่าง: To ship · In transit · Delivered |
| KOL Master | `#kols` | รายชื่อ KOL / Affiliate · KOL modal (ข้อมูล · deals · ผลงาน · ราคา · payee / ที่อยู่) |
| Settings | `#settings/<section>` | Lists · Tier rules · Products · KOL performance · Grades · Shipments · Payments · Operations mode · Data · Go-live |
| Role Management | `#roles` | ผู้ใช้และบทบาท (Admin เท่านั้น) |

ผู้ใช้ 5 บทบาท: **Admin · KOL Manager · Staff · Viewer · Accounting** (รายละเอียด §8) · ไม่มี login จริง — เลือกผู้ใช้จากเมนูล่างซ้าย

ขนาด: JavaScript ~25,900 บรรทัดใน `src/` · seed (`data/seed.js` 1.1 MB): KOL 911 · บัญชีโซเชียล 928 · deal 305 · โพสต์ 313 · Campaign 4 · Phase 9 · ผู้ใช้ 9

---

## 2. เปิดใช้งาน

- เปิด `index.html` ใน **Edge หรือ Chrome** — ไม่ต้องมี server · (ถ้าอยากใช้ server: `python -m http.server` แล้วเปิด `http://localhost:8000`)
- ครั้งแรกระบบโหลด seed แล้ว migrate ขึ้น schema ล่าสุด และบันทึกลง `localStorage`
- เริ่มข้อมูลใหม่: Settings › Data › **Reset to seed** (Admin) หรือ ลบ key `charmiss_kol_tracker_v1`
- ดูในบทบาทอื่น: เมนูล่างซ้าย › **Switch user** หรือ **View as role** (Admin · เก็บใน sessionStorage — ปิดแท็บแล้วกลับเป็นบทบาทจริง)
- "วันนี้" = นาฬิกาเครื่อง เวลาไทย (`R.todayISO()`)

---

## 3. โครงสร้างโฟลเดอร์

```
KOL Web Dev/                    ← ที่แก้งานจริง
├─ index.html                   ลำดับ <script> = ลำดับโหลด (ดู §5.2)
├─ HANDOVER.md                  ไฟล์นี้
├─ CHANGELOG.md                 ประวัติแบบย่อ (ใหม่สุดอยู่บน)
├─ data/seed.js                 window.KT_SEED — ข้อมูลตั้งต้น (สร้างจาก Data/KOL_seed_v2.json) · ห้ามแก้
├─ docs/
│   ├─ CR-23.md … CR-35.md      spec + หมายเหตุการ implement + การตัดสินใจ + ผลทดสอบ ของแต่ละ CR
│   ├─ SYSTEM_DIAGRAM.drawio    ไดอะแกรมระบบ 6 หน้า (เปิดด้วย draw.io) — แก้ในไฟล์นี้ได้เลย
│   ├─ BUSINESS_OPERATIONS.drawio  ไดอะแกรมเชิงธุรกิจ: ใครทำอะไรในแต่ละช่วงงาน (swimlane)
│   ├─ DATA_MODEL.md            ทุก collection / field + migration ทุก schema
│   ├─ PAYMENTS.md              การเงิน: ภาษี · vault · Export PR · Full mode (ส่วน Simple mode ดู docs/CR-33.md)
│   └─ UI_PATTERNS.md           กติกาหน้าจอ: modal / drawer / ปุ่ม / ปิด / focus / สี
└─ src/
    ├─ content.js               ข้อความทุกคำบนจอ (KT.content)
    ├─ icons.js                 ไอคอน SVG
    ├─ rules*.js                กฎธุรกิจ (KT.rules) — 28 ไฟล์ แยกตามเรื่อง (§9)
    ├─ store.js                 state · localStorage · migrate · IDs · Backup / Restore (KT.store)
    ├─ archive.js · photos.js · docfiles.js     IndexedDB: สำเนาก่อนอัปเกรด · รูป · ไฟล์เอกสาร (เข้ารหัส)
    ├─ vault.js                 เข้ารหัสข้อมูล payee (KT.vault)
    ├─ pdf.js · xlsx.js · export.js             สร้าง PDF · XLSX · ข้อมูล Export
    ├─ ui.js · ui-range.js      ตัวช่วย UI ร่วม (KT.ui)
    ├─ screen-*.js              หน้าจอและส่วนย่อย
    ├─ styles.css               CSS ทั้งหมด · สีเป็น token บน :root (Light / Dark)
    └─ app.js                   โครงหน้า · เมนู · routing (โหลดเป็นไฟล์สุดท้าย)
```

โฟลเดอร์ข้างเคียง (`G:\My Drive\[Charmiss] - KOL & Affiliate\`):
- `charmiss-kol-affiliate-tracking/` — **git repo** (สำเนาของ `KOL Web Dev` ที่ใช้ commit ผ่าน GitHub Desktop) · แก้ใน `KOL Web Dev` แล้วคัดลอกไฟล์ที่เปลี่ยนไปก่อน commit
- `Data/` — spec ต้นฉบับของ CR · `KOL_seed_v2.json` · `KOL_Affiliate_Tracker_Handoff.md` (spec ระบบ production ในอนาคต — ดู §14)
- ⚠️ `Data/PR 09_10_26.xlsx` และไฟล์ PR / NPD อื่น ๆ มี **ข้อมูลส่วนตัวจริง** — ห้ามเปิดใช้ทำ dev / test · ห้าม commit · ห้ามคัดลอกค่าลงโค้ดหรือ seed

---

## 4. การทำงานของระบบ (business flow)

### 4.1 Campaign & Phase
- **Campaign** มีงบ KOL · ช่วงวันที่ · สถานะ: Draft → Pending approval → Not started / On going / Wrap-up → Complete (+ On hold · Cancelled)
- Campaign ใหม่และการปรับงบต้อง **อนุมัติ** (KOL Manager / Admin) — หน้า Approvals แสดง 1 การ์ด = 1 คำขอ · Return to draft / Resubmit ได้ · ประวัติงบอยู่ใน `campaign_budget_changes`
- **Phase** อยู่ใต้ Campaign · โพสต์เข้า Phase ตามวันที่โพสต์ (แก้เองได้ด้วย `phase_override`) · Phase ที่ยังไม่อนุมัติไม่นับ
- **Phase Planner:** แบ่งงบเป็น % หรือจำนวน · pillar (Awareness · Awareness & Consideration · Consideration · Conversion) · **Benchmarks** ของ Campaign (CPM · Consideration rate → Cost per consideration · ROAS · % clips target) ใช้กับการ์ด Benchmarks ใน Dashboard › By campaign
- ปิดงาน: Wrap-up → **Mark campaign complete**

### 4.2 Deals และ Journey
- **Deal** = KOL 1 คน ใน Campaign 1 Campaign · มีบัญชีโซเชียล · ราคา (rate · ค่าอื่น ๆ · ภาษี) · payment term · PIC (Assigned to)
- **Journey** (Settings › Lists › Journey steps):

  | สถานะ | ขั้น |
  |---|---|
  | List | Shortlist → Contacted → Confirm QT |
  | Inprocess | Brief → Script → Draft 1 → Draft 2 → Draft 3 → Approve |
  | Complete | Post |
  | Cancel | Cancel (ต้องมีเหตุผลจาก Settings › Lists › Cancel reasons) |

- ย้ายขั้นด้วย **Move stage** (หรือลากใน Pipeline) · ช่องที่ต้องกรอกในแต่ละขั้นมาจาก `R.stageRequirements()` ที่เดียว · ทุกการย้ายเขียน `deal_status_log`
- **นับเงิน:** Shortlist / Contacted = Pending · ตั้งแต่ Confirm QT = **Committed** (กินงบ) · Cancel = ปล่อยงบ, ยกเลิกแถวจ่ายที่ยังไม่จ่าย
- **New deal:** จาก KOL Master (เลือกหลายคน · ตัวกรอง Tier / Grade / Worked in) หรือ New KOL · เลือก Campaign · Phase · Assign to · Pillar · Start at · Products · partner เกรด D ต้องติ๊ก Add anyway
- **Deal modal** (ทางเปิดเดียว `KT.screens.deals.openDealModal`): Overview · Costs & payment · Timeline & content · Shipments & posts · History (+ Incidents)
- ส่วนเสริมของ deal: **Payment term Package** (โพสต์จ่ายล่วงหน้าใช้ข้าม Campaign) · **Gencodes** (โค้ดโฆษณา TikTok Spark / Meta พร้อมวันหมดอายุ) · **Draft notes** (ลิงก์ / รูปต่อขั้น Draft) · **Incident** (Late without notice · Missed brief · No-show · Breach of agreement · Other)

### 4.3 โพสต์และตัวเลข (metrics)
- โพสต์ของ deal มี **Post due** (`expected_post_date`) · **Posted on** (`post_date`) · ลิงก์ · Views · Likes · Comments · Shares · Saves (+ Reach · Impressions · Clicks · Sales · ROAS)
- เก็บตัวเลขตามรอบ **D+7** (Settings › KOL performance) · Operations แจ้งงาน "Enter metrics" เมื่อถึงรอบ
- ที่มาของตัวเลข: **Manual** (พิมพ์ในตาราง / Deal modal) · **Import** (Deals › ⋯ › Import metrics จาก CSV / XLSX หรือ Paste metrics) · **Auto** (เตรียม field ไว้ ยังไม่มีตัวดึงจาก API) · ค่า Manual ไม่ถูกทับเว้นแต่ติ๊ก Replace
- **Deals › Performance:** 1 แถวต่อโพสต์ · Post date · **Post due** · **On-time** ("3 d early" · "On due date" · "+4 d late") · Views · ER · Cost · CPV · KPI รวม (Posted · With metrics · Views · Engagement · ER · CPV · On time) · Group by · Columns · Export
- สูตร: ER = (likes + comments + shares + saves) ÷ views · CPV = cost ÷ views (เฉพาะโพสต์ที่มี views) · cost ของโพสต์ = ยอดรวม deal ÷ จำนวนโพสต์ · ลิงก์ซ้ำนับครั้งเดียว

### 4.4 Shipments (ของตัวอย่าง)
- สร้างเองเมื่อ deal ถึง Confirm QT (ถ้าต้องส่งของ) · สถานะ: To ship · Shipped · Delivered · Problem · Not required (+ KOL purchase)
- ที่อยู่จัดส่งอยู่ใน vault · ผู้ส่ง / ขนส่ง / tracking · Settings › Shipments (lead days · carriers · tracking link)
- Operations mode › Shipments = **Simple** (ทีม KOL บันทึกเอง) เป็นค่าปัจจุบัน

### 4.5 Payments (Simple mode — ค่าปัจจุบัน)
```
deal ถึงงวดจ่าย (ตาม payment term) ─► To submit ─► Create round (PR-yyyy-mm-dd) ─► Submitted ─► Confirm paid ─► Paid (confirmed)
                                      │ Pay to: Confirm payee          │ เฉพาะแถว Ready     │ Accounting: Verify / Return (เหตุผล)
                                      │ ต้องมี payee details + เอกสาร   │ Undo 10 วินาที      │ Print PDF · Export PR (.xlsx)
```
- **Payee details** (KOL modal › Payee & shipping หรือจากแถวจ่าย): ประเภท · WHT · ธนาคาร · เลขบัญชี · ชื่อ · ที่อยู่ตามบัตร (Company: Tax ID) — เข้ารหัสใน vault · เอกสาร (สำเนาบัตร · Book bank · ใบทะเบียน · ภ.พ.20 · Post proof) เป็นไฟล์เข้ารหัสหรือลิงก์ https
- **Create round** รับเฉพาะแถว Ready (แถวไม่พร้อมถูกข้ามพร้อมแจ้ง) · **Accounting** Verify ทีละแถว หรือ Return กลับ To submit · **Confirm paid** ทั้งรอบ (ติ๊กออกบางแถว = กลับ To submit) · Undo confirm ต้องมีเหตุผล
- **Print** = PDF ไฟล์เดียว (สรุปรอบ + เอกสาร) · **Export PR** = .xlsx · ข้อมูลส่วนตัวในไฟล์ต้องปลด vault
- ภาษี: `R.calcPaymentTax` (VAT / WHT · ปัด half-up 2 ตำแหน่ง) · ใบ 50 ทวิ ใน Accounting
- **Full mode** (payment runs แบบเดิม: To pay → Payment runs → Accounting) ยังใช้ได้ — สลับใน Settings › Operations mode · ใช้ข้อมูลชุดเดียวกัน

### 4.6 Partner Grade
- **เกรด = On time อย่างเดียว** (`R.gradeEngine` ตัวเดียว ทุกหน้าเรียกตัวนี้)
  - นับโพสต์ของ deal ที่ committed ที่มี **Post due** · 6 โพสต์ล่าสุดภายใน 6 เดือน
  - On time = Posted on ≤ Post due (+ Grace days, ค่าเริ่มต้น 0 = ช้า 1 วันคือ Late) · เลย Post due แล้วยังไม่โพสต์ = **Late (open)** · โพสต์ไม่มี Post due ไม่นับ (แสดงเป็น "No due")
  - **A** 100% · **B** ≥ 80% · **C** ≥ 60% · **D** ต่ำกว่านั้น หรือมี Incident **No-show / Breach** · นับได้ < 2 โพสต์ = **Not enough data**
  - **Engagement (ER) แสดงอย่างเดียว ไม่ใช้คิดเกรด** · Revisions แสดงใน KOL modal อย่างเดียว
  - เหตุผลหลัก (tooltip ของเกรดทุกที่): "On time 3/3" · "Late 2 of 5 posts · avg 3 days late" · "No-show on <Campaign>"
- **Suggested vs Confirmed:** ระบบคำนวณ Suggested ทุก commit · เกรดที่แสดงคือ **Confirmed** (คนยืนยัน) — ยกเว้น Dashboard › Partners ที่แสดง Suggested เป็นตัวอักษรเส้นประเมื่อยังไม่มี Confirmed
- **Review:** Suggested ≠ Confirmed → งาน **Review grade** ใน Dashboard › Operations (KOL Manager / Admin) → Grade review modal: **Confirm** หรือ **Override** (เลือก A–D + เหตุผล · ล็อก 90 วันหรือจนมีโพสต์ใหม่ 2 ชิ้น) · D ต้องมีคนยืนยันเสมอ · Staff / Viewer เปิดดูได้ (ปุ่ม View) แต่ยืนยันไม่ได้
- ตั้งค่า: Settings › Grades (เกณฑ์ A / B / C · Grace days · จำนวนโพสต์ / เดือน / ขั้นต่ำ · ล็อก Override · Incident ร้ายแรง = D) · ประวัติใน `grade_history`

### 4.7 Dashboard
| Tab | มีอะไร |
|---|---|
| **All campaigns** | KPI (Budget · Committed · Actual (posted) · Pending …) · Budget vs Actual รายเดือน · Portfolio · Timeline · Pillar / Tier / Platform mix · Packages · Draft notes · ช่วงเวลา + ตัวกรองสถานะ Campaign |
| **By campaign** | KPI ของ Campaign / Phase · Phase budget · Budget vs Actual · mix · Products given · Cancelled deals · Team workload · Benchmarks (clips beating benchmark) · Activity |
| **Operations** | คิวงานทั้งทีม: Overdue · Due this week · No due date · Stuck · Waiting on us · ตัวกรอง Assigned to / Campaigns / Waiting on · แถบ **Review grade (n)** สำหรับ KOL Manager / Admin · Stage flow · Team load · Data to fix |
| **Partners** | ตัวกรอง (ช่วงเวลา · Campaign · Pillar · Partner type · Partner · Grade · Tier) · **Grade mix** (donut · Count / Spend · คลิกชิ้น = กรองตาราง) · **On-time posts** · **Engagement rate** · **Partner performance** (Tier · Grade · Posts · On time · Avg days late · Views · ER · CPV · Spend · คลิกแถว = KOL modal) · Grade × Tier · Grade movement · Top performers · Watch list |

ทุก tab มี Export (.xlsx) · ตัวเลขเงินใช้นิยามเดียวกัน (§6.5)

### 4.8 KOL Master และ KOL modal
- รายชื่อ partner (KOL / Affiliate) · บัญชีโซเชียลหลายบัญชี · Tier จาก followers (Settings › Tier rules) · คอลัมน์ Grade (tooltip = เหตุผล) · Import CSV / XLSX · Merge ซ้ำ
- **KOL modal:** Overview (ข้อมูล · บัญชี · แถบสรุป Deals / Committed / Last worked / Grade) · Deals & history · **Performance** (เกรด · Suggested · On time · Avg days late · ER · Revisions · ประวัติเกรด · โพสต์ที่ใช้คิดเกรด · Completion · Avg views · CPV · โพสต์ทั้งหมด) · Rates (Price reference · Packages · Rate history) · Payee & shipping

### 4.9 Settings และ Data
- **Lists:** Journey steps · Pillar · CTA · Platform · Cancel reasons · KOL types · Partner types · **Tier rules** · **Products** · **KOL performance** (รอบเก็บ metrics · ค่า Reliable / Watch ของ New deal) · **Grades** · **Shipments** · **Payments** · **Operations mode** (Simple / Full) · **Data** (Backup · Restore · Reset to seed · ขนาดข้อมูล · ไฟล์เอกสาร) · **Go-live clean-up**
- **Backup** = JSON ทั้ง state (ไม่มีข้อมูลถอดรหัส · ติ๊กได้ว่าจะรวมไฟล์เอกสารที่เข้ารหัสหรือไม่) · **Restore** = แทนที่ทั้งหมด แล้ว migrate อัตโนมัติ (Admin)

---

## 5. สถาปัตยกรรม

### 5.1 Namespace เดียว `window.KT`
| ส่วน | ไฟล์ | หน้าที่ |
|---|---|---|
| `KT.content` (`C`) | content.js | ข้อความ · label · ฟังก์ชันประกอบข้อความ |
| `KT.rules` (`R`) | rules*.js | ทุกไฟล์ `Object.assign(KT.rules, (function (R, C) { … return {…}; })(KT.rules, KT.content))` — ไฟล์หลังเรียกของไฟล์ก่อนได้ |
| `KT.store` (`S`) | store.js | `createStore` · `migrate` · `fromSeed` · `newId` · Backup / Restore |
| `KT.ui` (`U`) | ui.js | `state()` · `commit()` · `toast` / `toastAction` · `createModal` · `openDrawer` · `popForm` · `multiSelect` · `dateHTML` · `can()` / `guard()` · `go()` |
| `KT.screens.<page>` | screen-*.js | หน้าหลัก (`render(id)`) |
| โมดูลย่อย | screen-*.js | `KT.profile` (KOL modal) · `KT.move` · `KT.newDeal` / `KT.bulk` · `KT.planner` · `KT.payee` · `KT.docs` · `KT.print` · `KT.grades` · `KT.partners` · `KT.perf` · `KT.samples` · `KT.budget` · `KT.approvals` · `KT.golive` · `KT.packages` |

### 5.2 ลำดับโหลด (index.html)
`seed → content → icons → rules*.js → store → archive · vault · photos · docfiles · pdf · xlsx → export → ui → screen-*.js → app.js`
ไฟล์ใหม่ให้วางหลังไฟล์ที่มันเรียกใช้ตอนโหลด (การเรียกตอนทำงานจริงไม่ติดลำดับ)

### 5.3 การเปลี่ยนข้อมูล
```
หน้าจอ: guard('สิทธิ์') → แก้ state() ผ่านฟังก์ชันใน R (คืน event) → push event → commit('ข้อความ')
commit(): R.cancelDealLines → R.syncShipments → R.syncPackages → R.syncGrades → store.save() → แถบเตือน → toast
```
- event: `deal_events` (deal · post · payment · payee · incident …) · `deal_status_log` (Journey) · `campaign_events` (Campaign · Phase · approval · benchmarks)
- งานที่ย้อนได้: `U.toastAction(ข้อความ, 'Undo', fn, ms)` (เก็บ snapshot ก่อนแก้)

### 5.4 การแสดงผล
- HTML เป็น string → `innerHTML` · **ทุกค่า escape ด้วย `esc()`** · event ใช้ delegation บน container + `data-*`
- container ตาม `docs/UI_PATTERNS.md`: สร้างใหม่ = `createModal` (S / M / L) · ดู / แก้ของเดิม = drawer หรือ Deal modal / KOL modal · ยืนยันสั้น = `confirmDialog` · ฟอร์มสั้นข้างปุ่ม = `popForm`
- ค่าส่วนตัวของผู้ดู (tab ที่เปิด · ตัวกรอง · คอลัมน์) เก็บผ่าน `U.pref` (localStorage `charmiss_kol_tracker_<key>`) — ไม่ใช่ข้อมูลงาน

---

## 6. ข้อมูล

### 6.1 ที่เก็บ
| ที่ | key | มีอะไร |
|---|---|---|
| localStorage | `charmiss_kol_tracker_v1` | state ทั้งก้อน (~1.5 MB หลังโหลด seed · โควต้า ~5 MB — Settings › Data แสดงขนาดจริง) |
| localStorage | `charmiss_kol_tracker_<pref>` | ค่าส่วนตัวของผู้ดู · theme |
| sessionStorage | `charmiss_kol_tracker_view_as` | View as role |
| IndexedDB | `charmiss_kol_tracker` | `kol_photos` · `step_images` |
| IndexedDB | `charmiss_kol_tracker_docs` | `doc_files` — ไฟล์เอกสารเข้ารหัส |
| IndexedDB | `charmiss_kol_tracker_archive` | สำเนาข้อมูลก่อนอัปเกรด schema |

### 6.2 State (schema 26)
`schema_version · lookups · meta · local` + 27 collections:
`campaigns · phases · kol_master · kol_accounts · kol_rate_quotes · deals · deal_posts · deal_status_log · deal_events · users · campaign_events · products · campaign_products · deal_products · payee_profiles · payment_lines · payment_runs · sample_shipments · pick_lists · shipping_addresses · campaign_budget_changes · kol_packages · step_notes · deal_gencodes · deal_incidents · partner_grades · grade_history`
ค่าตั้งค่าทั้งหมดอยู่ใน `lookups` (journey_steps · tier_rules · grade_rules · payment_settings · ops_mode …) · field ทุกตัว → `docs/DATA_MODEL.md`

### 6.3 Migration
- `store.migrate(obj, now)` ไล่ `toV2 … toV26` ทีละขั้น — ใช้กับ seed · localStorage · ไฟล์ Backup เก่า
- เพิ่ม schema: (1) `R.migrateVxx(obj, …)` ใน rules ของเรื่องนั้น (รันซ้ำได้ผลเดิม · `schema_version = Math.max(…)`) (2) `toVxx` + บรรทัดใน `migrate()` (3) `SCHEMA_VERSION` (4) collection ใหม่ → `COLLECTIONS` + `ADDED_IN` + `C.counts` (5) ID ใหม่ → `ID_FORMATS` (6) `docs/DATA_MODEL.md`
- **ห้ามลบหรือเปลี่ยนยอดเงินเดิมใน migration**

### 6.4 ID
`K0001` KOL · `A00001` account · `Q00001` rate quote · `D000001` deal · `P000001` post · `PY-0001` payee · `AD-0001` ที่อยู่ · `PL-000001` แถวจ่าย · `PR-yyyy-mm-dd[-n]` รอบจ่าย · `SH000001` shipment · `PK0001` pick list · `U001` ผู้ใช้ · `GC-00001` gencode · `IN-0001` incident · `GH-00001` grade history · `DF-xxxxxxxxxxxx` ไฟล์เอกสาร — สร้างผ่าน `store.newId(kind)` (ยกเว้นชื่อรอบ PR ใน rules-ops.js และ `DF-` ใน docfiles.js)

### 6.5 นิยามเงิน (ทุกหน้าใช้ชุดเดียว)
Budget → **Committed** (deal ตั้งแต่ Confirm QT ที่ไม่ Cancel) → Used % → Remaining · **Pending** = Shortlist / Contacted · **Actual (posted)** = ยอดของ committed deal ที่โพสต์แรกอยู่ในช่วง · ยอด deal = `R.totalCost(deal)` · ภาษี = `R.calcPaymentTax`

---

## 7. ความปลอดภัย / ข้อมูลส่วนตัว

- **Payee vault** (`vault.js`): RSA-OAEP 3072 + AES-GCM · passphrase → PBKDF2 600,000 รอบ · ล็อกเองเมื่อไม่ใช้ 15 นาที · บันทึกได้แม้ vault ล็อก (เข้ารหัสด้วย public key) · ถอดรหัสต้องปลดล็อก
- ใน vault: ชื่อบัญชี · ธนาคาร · เลขบัญชี · Full name · ที่อยู่ตามบัตร · เบอร์ · ผู้ติดต่อ WHT · Tax ID · ที่อยู่ส่งของ · ไฟล์เอกสาร
- นอก vault ได้แค่ `bank_name` · `account_last4` · `details_filled` (ชื่อช่องที่กรอกแล้ว ไม่มีค่า)
- **ไม่ถอดรหัสลง state / localStorage / Backup / event log / console** · ค่าที่ถอดรหัสอยู่ในหน่วยความจำชั่วคราวระหว่าง Export / Print / Preview เท่านั้น
- ชื่อไฟล์ที่อัปโหลดไม่เก็บ (อาจมีชื่อคน) → `<ชนิดเอกสาร>.<นามสกุล>`
- ช่องข้อความอิสระ (note · reason · ref) ผ่าน `R.looksSensitive()` — ปฏิเสธตัวเลขยาวแบบเลขบัญชี / บัตร / เบอร์
- ทดสอบด้วยข้อมูลสมมติเท่านั้น ("made-up" · example.com · passphrase สมมติ)

---

## 8. บทบาทและสิทธิ์ (`src/rules-roles.js` → `PERMISSIONS`)

ตรวจด้วย `U.can(action)` ตอนวาดปุ่ม และ `U.guard(action)` ซ้ำก่อนเขียนข้อมูล

| สิทธิ์ | Admin | KOL Manager | Staff | Viewer | Accounting |
|---|:-:|:-:|:-:|:-:|:-:|
| view (ทุกหน้า · export · backup) | ✓ | ✓ | ✓ | ✓ | ✓ |
| deal.edit · kol.edit · campaign.products · campaign.draft | ✓ | ✓ | ✓ | | |
| deal.money · kol.merge · campaign.edit (+ approve) · settings.lists | ✓ | ✓ | | | |
| settings.tiers · settings.ops · data.restore · roles · vault.admin · payment.reopen · golive.run | ✓ | | | | |
| payee.edit | ✓ | ✓ | ✓ | | ✓ |
| payment.request · shipment.edit · shipment.ship | ✓ | ✓ | ✓ | | |
| payee.unlock · payee.verify | ✓ | ✓ | | | ✓ |
| payee.import · payment.run · settings.payments · shipment.settings · grade.review (+ settings.grades) | ✓ | ✓ | | | |
| payment.paid · golive.view | ✓ | | | | ✓ |
| payment.export | ✓ | ✓ | ✓ | | ✓ |

Staff แก้ได้เฉพาะ deal ที่ตัวเองเป็น PIC ในหลายจุด (metrics · จ่ายเงิน) · Accounting เริ่มที่หน้า Payments และไม่เห็น Settings

---

## 9. แผนที่โค้ด

| เรื่อง | กฎ (rules) | หน้าจอ | อ่านเพิ่ม |
|---|---|---|---|
| Journey · Move stage | rules.js · rules-move.js (`stageRequirements` · `checkMove` · `applyMove`) · rules-journey.js | screen-move.js · screen-deals.js | CR-23 |
| Deals · Pipeline · Performance · metrics | rules-deal.js · rules-metrics.js (`perfRows` · `perfTiming`) | screen-deals.js · screen-perf.js | CR-28 |
| New deal | rules-bulk.js · rules-fill.js | screen-newdeal.js · screen-bulk.js | CR-25 |
| Campaign · Phase · Planner · Approval · Budget · Close | rules-phase.js · rules-approval.js · rules-request.js · rules-budget.js · rules-close.js | screen-campaign.js · screen-planner.js · screen-approvals.js · screen-budget.js | CR-29 |
| Products | rules-products.js | screen-campaign.js · screen-deals.js | CR-23 |
| KOL Master · KOL modal · Payee / ที่อยู่ | rules-kol.js · rules-profile.js · rules-perf.js · rules-io.js | screen-kol.js · screen-profile.js · screen-payee.js | CR-25, CR-32, CR-33 |
| Shipments | rules-samples.js · rules-ship.js | screen-samples.js · screen-shipments.js | CR-32 |
| Payments · ภาษี · เอกสาร · Print | rules-pay.js · rules-ops.js · rules-package.js | screen-payments.js · screen-docs.js · screen-print.js · pdf.js | CR-33, docs/PAYMENTS.md |
| Package · Draft notes | rules-package.js | screen-packages.js | CHANGELOG (CR-20) |
| Gencodes | rules-gencode.js | screen-deals.js | CR-30 |
| Partner Grade · Incidents · Benchmarks · Partners | rules-grade.js (`gradeEngine` · `gradePosts` · `syncGrades` · `partnersData`) | screen-grades.js · screen-partners.js | CR-34, CR-35 |
| Dashboard · Operations · Export | rules-dash.js · rules-overview.js (`workQueue`) | screen-overview.js · export.js | CR-24, CR-26, CR-29 |
| Roles · Go-live · Operations mode | rules-roles.js · rules-golive.js · rules-ops.js (`opsMode`) | screen-roles.js · screen-golive.js · screen-settings.js | — |

---

## 10. Conventions และจุดที่พลาดง่าย

- **โค้ด:** IIFE + `'use strict'` · ไม่มี class · ไม่มี dependency ภายนอก · คอมเมนต์สั้นอธิบาย "ทำไม" พร้อมอ้าง CR (`/* CR-35 §3.5 — … */`)
- **วันที่:** ข้างในเป็น ISO `yyyy-mm-dd` · บนจอ `dd/mm/yyyy` (`R.dmy`) · ช่องวันที่ใช้ `U.dateHTML`
- **ตัวเลข:** เก็บเป็น number · แสดงด้วย `R.fmtNum` / `R.baht` / `R.fmtCompact` — **`fmtCompact` ใส่ ฿ ให้แล้ว อย่าเติมซ้ำ**
- **ข้อความ:** อังกฤษใน `content.js` · ข้อความที่มีตัวแปรเป็นฟังก์ชัน
- **Layout:** ใช้ได้ 390–1920 px โดยหน้าไม่เลื่อนแนวนอน (ตารางกว้างเลื่อนในกรอบของมันได้) · **ห้ามตัดข้อความด้วย "…"** ให้ขึ้นบรรทัดใหม่ · Light / Dark อ่านได้ทั้งคู่ — สีใช้ token บน `:root` เท่านั้น (`--ok` · `--warn` · `--err` · `--info` …)
- **สีมีความหมาย:** สถานะ / เกรดต้องมีตัวอักษรหรือเครื่องหมายกำกับ ไม่ใช้สีอย่างเดียว
- **key ของหน้า ≠ route:** `U.go()` / `U.canSeeTab()` ใช้ key (`overview · campaign · deals · payments · shipments · kol · settings · roles`) ส่วน URL ใช้ route (`#dashboard · #campaigns · … · #kols`) — `go('kol')` ไม่ใช่ `go('kols')`
- **คอมเมนต์ `//` กลางบรรทัดยาว** กลืนโค้ดที่ต่อท้ายได้ — ใส่ `//` เฉพาะท้ายบรรทัดที่จบคำสั่งแล้ว
- **KOL modal ไม่ใช่ `<dialog>`** (`#kpm` · ใช้ `KT.profile.open / close / isOpen`) ส่วน modal อื่นใช้ `<dialog>` ผ่าน `createModal`
- Path มี `[Charmiss]` — ใน PowerShell ต้องใช้ `-LiteralPath` (วงเล็บเหลี่ยมเป็น wildcard)

---

## 11. วิธีทำงานต่อ (ขั้นตอนต่อ 1 การเปลี่ยนแปลง)

1. อ่าน spec (และ §Decisions) · เรื่องที่ยังไม่ชัดให้ถาม James หรือใช้ค่าที่กระทบน้อยที่สุดแล้วจดไว้
2. ลำดับ: **rules** (+ migration) → **content.js** → **screen** → **styles.css** → ตรวจ
3. ตรวจ: `node --check` ทุกไฟล์ · key ของ `C.*` ที่โค้ดเรียกมีจริง · unit ของ rules (โหลด `src/*.js` ใน Node `vm` พร้อม seed) · เปิดหน้าจอจริง 390 / 1440 / 1920 · Light / Dark · console ไม่มี error · หน้าเดิมที่แตะยังทำงาน
4. เอกสาร: `docs/CR-xx.md` (spec + หมายเหตุ + การตัดสินใจ + ผลทดสอบ) · `CHANGELOG.md` · `docs/DATA_MODEL.md` (ถ้าแตะข้อมูล) · อัปเดตไฟล์นี้ถ้าการทำงานหรือโครงสร้างเปลี่ยน
5. คัดลอกไฟล์ที่เปลี่ยนไป `charmiss-kol-affiliate-tracking/` แล้ว commit

---

## 12. การทดสอบ

- **ใน repo ไม่มี automated test** — เจ้าของงานให้ลบโฟลเดอร์ `tests/` ออกแล้ว · อย่าสร้างกลับโดยไม่ตกลง
- การตรวจใช้สคริปต์นอก repo (Node `vm` สำหรับ rules + headless Edge ผ่าน DevTools Protocol สำหรับหน้าจอ) · ผลของแต่ละ CR อยู่ท้าย `docs/CR-xx.md` · ขอสคริปต์ไปเป็นจุดตั้งต้นได้
- **Smoke test ก่อนส่งงาน** (~15 นาที):
  1. เปิดครั้งแรก (localStorage ว่าง) — โหลด seed + migrate ไม่มี error
  2. Dashboard ครบ 4 tab · Partners: คลิกชิ้น donut แล้วตารางกรอง
  3. Deals: Table / Pipeline / Performance · เปิด Deal modal ทุก tab · Move stage 1 deal (ช่องบังคับถูก) · Undo
  4. New deal จาก KOL Master 2 คน · Undo
  5. Payments: Create round → Verify (Accounting) → Confirm paid
  6. Operations (KOL Manager): Review grade → Confirm 1 คน แล้วหายจากคิว
  7. KOL modal ทุก tab · Settings › Grades เปลี่ยนเกณฑ์แล้วกลับค่าเดิม
  8. Backup → Reset → Restore ได้ข้อมูลครบ
  9. หน้าจอ 390 px และ Dark mode

---

## 13. ข้อจำกัดและสิ่งที่ควรรู้

| เรื่อง | รายละเอียด |
|---|---|
| ข้อมูลอยู่เครื่องเดียว | ไม่มี sync ระหว่างคน / เครื่อง · โควต้า localStorage ~5 MB · รูปและไฟล์เอกสารอยู่ใน IndexedDB ของเครื่องนั้น |
| ไม่มี authentication | ผู้ใช้เลือกจากรายชื่อ · สิทธิ์ป้องกันแค่บนหน้าจอ |
| PDF สร้างเอง (`pdf.js`) | หน้าสรุปเป็นภาพ (ภาษาไทยถูกต้อง แต่เลือก / ค้นข้อความไม่ได้) — ไม่ใช้ pdf-lib เพราะกติกาไม่มี library ภายนอก |
| Git repo บน Google Drive | Drive sync `.git` อาจทิ้ง `index.lock` ค้างจน commit ไม่ผ่าน (ลบไฟล์ lock แล้วลองใหม่) · แนะนำย้าย repo ออกนอก Drive |
| Payments 2 โหมด | Simple (ใช้จริง) กับ Full อยู่คู่กันบนข้อมูลชุดเดียว |
| Grace days 2 ที่ | Settings › **Grades** = On time ทุกที่ (เกรด · Partners · Deals › Performance) · Settings › **KOL performance** = ป้าย Reliable / Watch / Late ใน New deal เท่านั้น |
| เกรดที่แสดง | Dashboard › Partners แสดง Suggested (เส้นประ) เมื่อยังไม่มี Confirmed · หน้าอื่น (KOL Master · New deal · KOL modal) แสดง Confirmed เท่านั้น |
| ข้อมูลตั้งต้นของเกรด | partner ส่วนใหญ่ใน seed เป็น Not enough data (มีโพสต์ที่มี Post due ไม่ถึง 2 ชิ้น) · โพสต์เลย due ที่ยังไม่โพสต์นับเป็น Late (days late เพิ่มทุกวัน) |
| เอกสารที่ล้าสมัย | `docs/PAYMENTS.md` §7 อธิบาย Simple mode แบบเก่า (To pay / Sent / Paid) — flow ปัจจุบันดู §4.5 และ `docs/CR-33.md` · `CHANGELOG.md` อ้าง `docs/archive/CHANGELOG-full-2026-10-07.md` ที่ไม่มีแล้ว (ประวัติช่วงแรกดูจาก spec ใน `Data/`) |

---

## 14. เรื่องที่รอการตัดสินใจ / งานต่อ

| เรื่อง | สถานะ |
|---|---|
| การตัดสินใจของ CR-35 (เกณฑ์เกรด · grace · Late (open) · ข้อ A–K ใน `docs/CR-35.md`) | ใส่ค่าแล้ว — **รอ James ยืนยัน** |
| Engagement เข้ามาคิดเกรด | วางแผนไว้ CR ถัดไปเมื่อมี metrics พอ (ตอนนี้แสดงอย่างเดียว) |
| แสดง Suggested ทุกหน้าหรือไม่ | ตอนนี้เฉพาะ Dashboard › Partners — ต้องตัดสินใจก่อนเปลี่ยน |
| ดึง metrics อัตโนมัติจาก API | ยังไม่ทำ · field `metrics_source = auto` · `fetch_status` · `fetched_at` เตรียมไว้ |
| เชื่อมระบบบัญชี ("Open payment voucher") | ยังไม่ทำ · field `external_ref` · `voucher_status` บนรอบ / แถวจ่ายเตรียมไว้ |
| PDF ด้วย pdf-lib + ฟอนต์ไทย | ทำได้ถ้าอนุญาต library — เปลี่ยนเฉพาะ `screen-print.js` |
| Help guide ในระบบ | ยังไม่ทำ (spec: `Data/CR-12_KOL_Help_Guide_Module.md`) |
| ระบบ production (หลายผู้ใช้ · server) | spec: `Data/KOL_Affiliate_Tracker_Handoff.md` (Next.js + Supabase) — **ยังไม่เริ่ม** · `rules-*.js` เป็น pure function ย้ายไปใช้ฝั่ง server / client ได้เกือบตรง ๆ และใช้ระบบนี้เป็น reference ของ UX และกฎธุรกิจ |

---

## 15. เอกสารอ้างอิงและผู้ติดต่อ

- **`docs/SYSTEM_DIAGRAM.drawio`** — ไดอะแกรม 6 หน้า: Architecture · Business flow · Payments · Partner grade · Data model · Screens & code (เปิดด้วย draw.io desktop, app.diagrams.net › Open from Device / Google Drive หรือ VS Code extension "Draw.io Integration")
- **`docs/BUSINESS_OPERATIONS.drawio`** — มุมธุรกิจ / Operation: swimlane 5 บทบาท (Partner · Staff · KOL Manager · Accounting · ระบบ) × 8 ช่วงงาน + งานประจำวัน · จุดควบคุม · ตัวชี้วัด — เหมาะใช้อธิบายทีมธุรกิจและผู้ใช้ใหม่
- `docs/DATA_MODEL.md` — ข้อมูลทุก field · `docs/UI_PATTERNS.md` — กติกาหน้าจอ · `docs/PAYMENTS.md` — ภาษี / vault / Export · `docs/CR-23.md … CR-35.md` — spec และการตัดสินใจ · `CHANGELOG.md` — ประวัติ
- เจ้าของระบบ / ผู้อนุมัติ spec: **James (LOMR)** — เรื่องใน §14 และ §Decisions ของ CR ต้องถามก่อนเปลี่ยน
