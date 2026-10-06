# CHANGELOG — Charmiss KOL Tracker

## CR-08 · 06/10/2026 — Payments module · Payment line รายงวด · Payment run รายสัปดาห์ (PR) · VAT / WHT · Payee details เข้ารหัส · Export PR (.xlsx) · ใบ 50 ทวิ

Spec: `docs/CR-08.md` (v1.1) · schema_version **7 → 8** (Restore รับ backup v1–v8 · migration ตอนโหลด ไม่สร้าง line) · ตัวเลขเงินเท่ากับ CR-05 §5.0 (Committed ฿1,783,579 · Pending ฿98,000 · Budget ฿2,748,400 · Remaining ฿964,821 · Paid (est.) ฿774,579) · Unpaid 130 · anchors ของ CR-08 §5.0 ตรงทั้งหมด (To pay 125 งวด · ฿826,950 · today = 06/10/2026) · วิธีใช้ / สูตร / ข้อห้าม: `docs/PAYMENTS.md`

**Schema 8 · ภาษี · งวด · Payee profile · Payee vault (R1)** — ไฟล์ใหม่ `src/rules-pay.js` · `src/vault.js` · `src/screen-payee.js`
- collections ใหม่ `payee_profiles` · `payment_lines` · `payment_runs` · `lookups.payment_settings` (VAT 7 · WHT threshold 1,000 · rates 0/1/2/3/5 · default 3/3 · bands 1,000 / 10,000 · run Friday) · `lookups.payee_vault`
- `calcPaymentTax`: Gross / Net basis (Net ≥ threshold gross-up) · VAT เมื่อจด VAT · WHT เมื่อ Gross ≥ threshold · ปัด half up ถึงสตางค์ · `dueLines` งวดตาม Payment term (Prepaid · 50/50 · หลังโพสต์ · Not set · Free / ฿0 / Cancel = ไม่มีงวด)
- Payee section ใน KOL drawer (ซ้าย) + dialog Payee details: ประเภท · VAT · WHT default · Price basis · เอกสาร (วันที่ได้รับ) · Docs link · Bank details เข้ารหัส (เห็นแค่ธนาคาร + 4 ตัวท้าย) · Unlock เพื่อดู / แก้ · Replace
- Payee vault (Web Crypto ในเบราว์เซอร์): RSA-OAEP 3072 + AES-GCM 256 · passphrase → PBKDF2-SHA-256 600,000 รอบ · ไม่เก็บ passphrase · ล็อกเองเมื่อไม่ใช้ 15 นาที / Switch user / Restore / reload · แถบ "🔓 Payee details unlocked · Lock" · Settings › Payments: Set up · Change passphrase · Reset vault · Import payee details (CSV) + template
- กันข้อมูลส่วนบุคคล: `rules.looksSensitive` (เลข 10 หลักขึ้นไป) ใน note / reason / remark / link ของ KOL · Quote · Deal · Campaign · Move · Import KOL · Restore ลบค่าที่เข้าข่ายแล้วแจ้ง (`restoreScrubbed`)
- สิทธิ์ใหม่: payee.edit · payee.unlock · payee.verify · vault.admin · payee.import · payment.request · payment.manual · payment.run · payment.paid · payment.reopen · settings.payments

**To pay · Request payment (R2)** — ไฟล์ใหม่ `src/screen-payments.js`
- side menu **Payments** (ระหว่าง Deals กับ KOL Master): หัวหน้า Due now · In runs · Paid this month · tabs To pay / Runs / History (จำ tab) · แถบเดียวกันทั้ง 3 tab: PIC (Me / All / ชื่อ / Unassigned · จำต่อคน) · Campaign · Source · Search · chips + Clear all filters
- To pay: queue cards Ready · Missing docs · Upcoming (14 วัน) · Needs check (deal ฿0 · จ่ายแล้วแต่ deal Cancel) · Group by Readiness / PIC / Campaign / Band · ตาราง KOL (+ Copy) · Campaign › Phase · Milestone · Due · Gross · WHT · Net · Docs (chip Missing → dialog Payee / Posts) · Status · PIC · Payments CSV (ไม่มีข้อมูลส่วนบุคคล)
- Request payment (PIC ของ deal · Admin / KOL Manager): ยอด · basis · WHT · Pay to (Payee / Reimburse staff) · note · กล่องภาษี · Deal drawer › Payment แสดงงวดของ deal + Request / Open run
- Deals เหลือ View `Table · Pipeline` (Payments view, ติ๊กจ่าย, bulk pay และ export payments ย้ายออก · ค่าที่จำไว้เป็น payments เปิดหน้า Payments)

**Payment runs · Export PR · Verify (R3)** — ไฟล์ใหม่ `src/xlsx.js`
- Runs: New run `PR-yyyy-mm-dd` (วัน run ถัดไป · ซ้ำวันเดียวกัน `-2`) · Add to run จาก To pay (Draft ที่มี / New run) · run detail: Pay date · Prepared by · Checks (✕ บล็อก Submit · ! · i — คำเตือนซ้ำกันรวมเป็นบรรทัดเดียวพร้อมรายชื่อ · คลิกไปที่แถว) · ตารางแยก Band · Printed · ⋯ Remove / Edit amount / Move back / Undo paid · Submit → Mark paid (ทั้ง run / ที่ติ๊ก) → Close · Reopen (Admin)
- Mark paid sync กลับ deal: `paid_50` / `paid_full` + วันที่ · Submit = `docs_done` · deal_events type `payment` ทุกครั้งที่สถานะ line เปลี่ยน
- Export PR `PR_dd_mm_yy.xlsx` (writer เขียนเอง zip store + SpreadsheetML · ไม่มี library / CDN): sheet ตาม Band 21 คอลัมน์ภาษาไทย + แถวรวม SUM + Summary · ข้อมูลผู้รับ 6 คอลัมน์ใส่เฉพาะตอน Unlock (ถอดรหัสในหน่วยความจำแล้วล้างทันที) · Locked → Unlock and export / Export without payee details
- เปลี่ยน bank details หลังเคยจ่าย → ✕ ต้อง Mark as verified (Admin / KOL Manager) ก่อน Submit · เปลี่ยนหลัง Submit → ! export ใหม่ · Reset vault: ทุก payee เสีย bank details ที่เข้ารหัส (ธนาคาร / 4 ตัวท้าย / เอกสารยังอยู่)

**History · ใบ 50 ทวิ · Manual line · นอกแอป · Cancel · Dashboard (R4)**
- History: line ที่ Paid · presets This year / This quarter / This month / Last month / Custom (ตามวันที่จ่าย) · Run · แถบ PIC / Campaign / Source / Search เดียวกัน · คอลัมน์ Paid date · Run (หรือ "Paid outside app") · KOL / Account · Campaign · Milestone · Gross · WHT · Net · WHT cert (✓ วันที่ / Not sent) · PIC · card **WHT cert not sent n** · bulk **Mark WHT cert sent** (วันที่) · **WHT summary (CSV)** month · payee_type · payee_id · account_handle · gross · wht_rate · wht (ไม่มีชื่อจริง / ที่อยู่ / เลขบัญชี) · ไม่มีรายการเพราะ filter → "No paid lines match these filters" + Clear all filters
- **+ Add manual line** (Admin · KOL Manager · Staff): Source Affiliate / Other · Payee (ทุก payee + **+ New payee** = dialog Payee ที่มีช่อง Payee name / account) · Campaign หรือพิมพ์ Project · Agreed · basis · WHT (ตาม payee) · Due · Pay to / Reimburse · Note · Type ใน PR = AFF / Other · ไม่กระทบ Committed · PIC = คนที่เพิ่ม · Staff สร้าง payee นอก KOL Master ได้ (เป็นของคนที่สร้าง)
- To pay bulk: **Mark paid outside app** (วันที่ + note บังคับ · source legacy · ไม่สร้าง run · deal sync) · **Cancel line** (เหตุผลบังคับ · งวดนั้นไม่กลับมา)
- deal ถูก Cancel (Deals · Move · Campaign ถูกยกเลิก): ตอนบันทึก line ที่ยังไม่ Paid → Cancelled "Deal cancelled" + event · run แสดง ! · line ที่ Paid แล้วอยู่ใน Needs check
- Dashboard › Operations ของ PIC ที่เลือก: card **Payment docs missing n** / **Ready to pay n** (แสดงเมื่อไม่เป็น 0) → Payments › To pay พร้อม PIC + queue
- Viewer: อ่านได้ทุก tab · ไม่มี Request / Manual line / ติ๊กเลือก / New run / Add to run / Export PR / Submit / Mark paid / Unlock

**Tests / docs**
- `tests/cr08.spec.js` · ทั้งหมด 349 ข้อ · ปรับ test เดิมตามที่ CR-08 แทน (จำนวน collections · PERMISSIONS · schema ≥ 7 · ข้อยกเว้น PII สำหรับหัวคอลัมน์ PR / ป้าย bank details)
- `docs/PAYMENTS.md` (ใหม่): flow · งวดตาม term · สูตรภาษี · vault / ลืม passphrase / import CSV · Verify · Export PR · Data model schema 8 + กติกา sync deal flags · ข้อห้าม PDPA — โครงข้อมูลทั้งหมดอยู่ที่หัวไฟล์ `src/store.js` (โปรเจกต์นี้ไม่มี `docs/DATA_MODEL.md` ตามแนวทาง CR-07)
- `docs/CR-08.md` = v1.1 (ฉบับที่ James ส่งในแชท · `Data/CR-08_KOL_Payments_Module.md` ยังเป็น v1.0) · หมายเหตุ CR-08 ใน CR-06 §4.8 และ CR-02 §4.3 (ทั้ง `Data/` และ `docs/`)
- ไม่ได้เปิด `Data/PR 09_10_26.xlsx` · test ใช้ข้อมูลสมมติ · `data/KOL_seed_v2.json` ไม่ถูกแก้

## CR-07 · 06/10/2026 — Dashboard refine · Clear all filters · KOL drawer 50% · Price reference แทน prefill · KOL Type presets · Copy ชื่อ KOL · Journey timeline แบบ SLA

Spec: `docs/CR-07.md` (rev 1.2) · schema_version **6 → 7** (Restore รับ backup v1–v7) · ตัวเลขเงินเท่ากับ CR-05 §5.0 (Committed ฿1,783,579 · Pending ฿98,000 · Budget ฿2,748,400 · Remaining ฿964,821) · anchors ของ CR-07 §5.0 ตรงทั้งหมด (today = 06/10/2026)

**Dashboard — All campaigns · By campaign (R1)**
- presets This year (เริ่มต้น) · This quarter · This month · Last month · Custom — ช่วงปฏิทินเต็ม (`rules.dateRangePreset`) · จำ preset ล่าสุด · ลิงก์เก่าที่เป็น Last 30 / 90 days ยังเปิดได้
- Campaign portfolio ไม่มี Pillar mix · ชื่อ Campaign ขึ้น 2 บรรทัดได้ · Activity by campaign: ชื่อ Campaign ขึ้นบรรทัดใหม่แทนการตัด "…" · ป้ายเดือนไม่ทับกัน · แถบ Phase แสดงชื่อเต็ม / "Phase n" / ไม่แสดง (ไม่ตัด "…")
- By campaign: Engagement ไม่มี ER / CPV (2 คู่ต่อแถว ตัวเลขชิดขวา) · Phase budget เต็มแถว (ชื่อ Phase เต็ม · ไม่มีคอลัมน์ Paid · แคบกว่า 900px เลื่อนในกรอบ + ตรึงคอลัมน์ Phase) · Allocation vs target เต็มแถว (label บรรทัดบน · legend ด้านบน · tooltip ฿ และ %) · Workload by PIC ของ Campaign นี้อยู่ล่างสุด (คลิกแถว = Operations ของ PIC นั้น + Campaign นี้)

**Dashboard — Operations (R2)**
- เลือก PIC ก่อน (ซ้ายสุด) → Campaign → Tier · ค่าเริ่มต้น = ตัวเอง (ถ้าเป็น PIC) · Admin / คนที่ไม่ใช่ PIC เห็น "Select a PIC to see their work" · ไม่มี All PICs (มี No PIC) · "Back to me" · จำ PIC ที่เลือกต่อคน · หัว tab "Operations · Amp"
- Workload by PIC ย้ายออก → **Due in next 7 days** (`rules.upcomingDues`): deal ของ PIC ที่ครบกำหนดวันนี้ – 7 วันข้างหน้า (Today / Tomorrow / dd/mm · KOL · Campaign › Phase · ขั้น · Open) · ชื่อ Campaign › Phase ในตารางคิวขึ้นบรรทัดใหม่แทนการตัด

**Clear all filters · KOL drawer (R3)**
- `rules.activeFilters` / `rules.clearFilters`: Deals — Phase · PIC (รวม Me) · Search · chip ย่อย · ค่าใน Filters · เหตุผลใน Needs action นับเป็น filter (Campaign · View · Group by · state tab · sort ไม่นับ) · ปุ่ม "Clear all filters" ท้ายแถว chip และใน empty state ("No deals match these filters" + รายการ filter) · "Filters · n" · ล้างแล้วจำ All PICs
- PIC ค่าเดียว: dropdown / chip / filter อ่านค่าเดียวกัน (ชื่อตัวเอง = Me) · PIC ที่จำไว้แต่ไม่ active แล้ว → ค่าเริ่มต้น · KOL Master ใช้แถว chip + Clear all filters แบบเดียวกัน
- KOL drawer กว้าง clamp(680px, 50% ของจอ, 1100px) · เหลือหน้าน้อยกว่า 320px = เต็มพื้นที่เนื้อหา · ลากขอบซ้ายปรับ 560px – (เนื้อหา − 320px) จำค่า · double-click = 50% · ไม่บังหน้า (คลิก KOL แถวอื่นได้ เนื้อหาเปลี่ยนทันที) · 2 คอลัมน์ (Profile · Accounts | Rates · Performance · Current deals + History เต็มแถว) · header: tier · status · Performance · platform + followers · ชื่อไม่ถูกตัด · Deal / Campaign / Planner drawer เหมือนเดิม

**Price reference · KOL Type presets (R4)** — ไฟล์ใหม่ `src/rules-kol.js`
- ไม่ prefill ค่าใช้จ่าย: Add to campaign (มีช่อง 5 ค่า + Total) · New deal · Deal › Costs ✎ มีกล่อง **Price reference** ข้างช่องกรอก (ใต้ช่องเมื่อแคบกว่า 640px): Latest rate (quote ล่าสุดที่มีตัวเลข + source · วันที่ / "Date not recorded" · "Note: …") · Average of past deals (Confirm QT ขึ้นไป · ไม่ Cancel · ไม่ Free / ฿0 · "n deals · k free jobs excluded") · ปุ่ม Use (ช่องมีค่าแล้วถาม "Replace current costs?") · term Free = กล่องเทา Use ปิด
- ตาราง Deals: deal ที่ยังไม่ใส่ราคา = "Cost not set" (นับ ฿0) · ขยับไป Confirm QT ตอน Total ฿0 และ term ไม่ใช่ Free → "Total is ฿0. Enter costs or set Payment term to Free." (Continue / Cancel) · Add to campaign หลายคน = deal ราคาว่าง
- KOL drawer › Rates: "Latest rate ฿x · Average ฿y (n deals)" + ประวัติราคา (วันที่ · source + note · total)
- `lookups.kol_type_list` 11 presets (Beauty 98 · K-beauty 22 · Beauty expert 16 · Make-up artist 8 · Swatch & selling 15 · Benefit review 7 · Student 15 · Lifestyle 6 · Outdoor & activity 15 · Fan 11 · Overseas-based 3 · Not set 695) · migration v7: `kol_type` = key · `kol_type_legacy` = ค่าเดิม · ค่าที่ไม่ใช่ประเภท → Not set + note "Old type: …" (ครั้งเดียว)
- KOL Master: ตัวกรอง Type เลือกได้หลายค่า + Not set พร้อมจำนวน · คอลัมน์ "Category · Type" · drawer › Profile แสดง label · ✎ เป็น select preset + "Old value: …" · Settings › KOL types (เพิ่ม · แก้ label / aliases · ลาก / ↑ ↓ เรียง · Deactivate = "(inactive)" · ลบได้เฉพาะที่ไม่มี KOL ใช้) · Import KOL match label / alias · ไม่ match = Not set + note + แถวใน report "Type not recognised: … → moved to note" · Export KOLs ใช้ label

**Copy ชื่อ KOL · Journey timeline (R5)** — ไฟล์ใหม่ `src/rules-journey.js`
- ปุ่ม Copy ต่อท้ายชื่อ KOL (ตาราง: hover / focus · จอสัมผัสแสดงตลอด · KOL drawer header แสดงตลอด) · copy เฉพาะชื่อ · ไม่เปิด drawer · ✓ 1.5 วินาที + "Copied: …" · `ui.copyText` (Clipboard API → textarea + execCommand → "Couldn't copy")
- Deal drawer › Journey = timeline แบบ SLA (`rules.dealTimeline`): ✓ วันที่ · ⏱ n d · "+n d late" · "Date not recorded" · ขั้นปัจจุบัน ⏳ "Waiting n d" · "Due dd/mm · n d overdue" (แดง) · Cancelled ✕ + เหตุผล · เส้นเขียว = ผ่านแล้ว · คลิกวงกลม = รายละเอียด (วันที่ · expected · ใครบันทึก · note) · สรุป "Brief → Post: n d" / "In progress n d since Brief" · แนวตั้งเมื่อพื้นที่ไม่พอ (ขั้น × 76px)
- Payment track (`rules.paymentTimeline`) ใต้ timeline: term · Docs → Deposit 50% / 50% → Paid · Before Brief / After Post · สีตาม payment_state · Stage tooltip ในตาราง Deals ใช้ข้อมูลชุดเดียวกัน · Content plan / Move stage เหมือนเดิม

**Tests / docs**
- `tests/cr07.spec.js` · ทั้งหมด 306 ข้อ · CR-01 TC-17 (prefill ฿6,500) และ CR-05 TC-27 (presets) ปรับตาม CR-07
- โครงข้อมูล schema 7 อยู่ที่หัวไฟล์ `src/store.js` (โปรเจกต์นี้ไม่มี `docs/DATA_MODEL.md`) · หมายเหตุ CR-07 ใน CR-01 §4–§5 / §7.2 / §9.5 · CR-02 §4.2–4.3 · CR-05 §4.6 · CR-06 §4.9

## CR-06 · 06/10/2026 — Campaign Products · Phase Planner แบ่งตามจำนวน + Running number · KOL Performance + Last worked · Deals flow ใหม่ (Scope, state tabs, drag & drop, Payments) · Responsive menu

Spec: `docs/CR-06.md` (rev 1.2) · schema_version **5 → 6** (Restore รับ backup v1–v6) · ตัวเลขเงินเท่ากับ CR-05 §5.0 · anchors ของ CR-06 §5.0 ตรงทั้งหมด

**สินค้า + ชื่อ Phase (R1)**
- `products` (TR code ห้ามซ้ำ ไม่สนตัวพิมพ์ / ช่องว่างหัวท้าย) · `campaign_products` · `deal_products` (qty ≥ 1) · `deals.tr_codes` เดิม → สินค้า + qty 1 แล้วลบ (seed ไม่มี)
- Settings › Products: ค้นหา · เพิ่ม · แก้ชื่อ / variant · ปิด Active · ลบได้เฉพาะที่ไม่มีใครใช้ · Import CSV (`tr_code, product_name, variant`) แสดง New / Update name / No change / Duplicate / Cannot import ก่อนยืนยัน
- Campaign: ช่อง Products ใน Phase Planner และฟอร์ม Edit (ค้นจาก TR code หรือชื่อ · "+ New product" เข้า catalog ทันที) · Campaign ใหม่ต้องมีสินค้า · Campaign เดิมที่ยังไม่มี = chip "No products" + คิว Operations "Campaign without products" (ปุ่ม Add products เปิด Planner) · เอาสินค้าที่ deal ใช้อยู่ออกไม่ได้ (บอกจำนวน deal)
- Deal › Products (แทน TR codes): เลือกจากสินค้าของ Campaign + qty · ย้าย Campaign แล้วสินค้าที่ไม่อยู่ใน Campaign ใหม่หลุดออก (บันทึกใน History) · Info "No products selected" เมื่อ deal เปิดอยู่และถึง Brief · Template คอลัมน์ TR Code = รหัสคั่นบรรทัด · `deals.csv` เพิ่ม `products` (TR×qty) · By campaign › การ์ด Posts มีบรรทัด "Products: n items · m units planned"
- ชื่อ Phase ไม่เก็บแล้ว: `phases.label` + ชื่อที่แสดง "Phase {n} · {label}" (n ตามวันเริ่ม → วันจบ → ลำดับที่สร้าง) · `posts.csv` เพิ่ม `phase_seq`, `phase_label`
- อนาคต: `deal_products.qty` คือจุดเริ่มของการเบิกสินค้า (requisition) — ยังไม่ทำใน CR นี้

**Phase Planner (R2)**
- Campaign period (ช่วยวางแผน ไม่บันทึก) · Number of phases 1–12 (− / +) · Split dates evenly (ต่อกันไม่ทับไม่เว้น วันที่เหลือไปแถวสุดท้าย) — Campaign ใหม่ที่มี period แบ่งวันให้เองเมื่อเปลี่ยนจำนวน
- ลดจำนวน = ลบแถวท้ายตามลำดับ Phase · Phase ที่มีโพสต์ลบไม่ได้ ("Phase 4 · October has posts — can't remove")
- Allocation: Even (฿ หารเท่า เศษไปแถวสุดท้าย) · Launch-heavy 20 / 65 / 15 (เมื่อมี 3 Phase) · Custom · เปลี่ยนงบ Campaign แล้ว preset จัดใหม่ · % ที่คำนวณจาก ฿ เก็บค่าละเอียดไว้ (฿ ไม่เพี้ยนจากการปัด %)
- แก้วันที่แล้วแถวเรียงตามวันเริ่มทันที (แถวที่ย้ายมีไฮไลต์ 1 วินาที) · คอลัมน์ Phase = ชื่อตามลำดับ · Label พิมพ์เอง · Impact preview บอก "Phase 2 will become Phase 3"

**KOL Performance + Last worked (R3)** — `src/rules-perf.js`
- On-time rate · Avg delay · Late posts · Overdue now · Avg draft rounds · Completion · Avg views / ER / CPV (ไม่นับ deal ที่ Cancel) · badge Reliable / Watch / Late / Not enough data (มีข้อความเสมอ)
- KOL Master: คอลัมน์ On-time และ Last worked (sort ได้) · ตัวกรอง Last worked (3 / 3–6 / 6–12 เดือน / เกิน 1 ปี / Never) · KOL drawer › Performance (ก่อน History) + ตารางโพสต์ที่ช้า + ⓘ · badge ใน New deal และ Add to campaign
- Settings › KOL performance: Grace days (1) · Minimum posts (2) · คลิกหัวคอลัมน์ซ้ำแล้วสลับทิศทางได้ทุกคอลัมน์

**Deals (R4–R6)**
- View tabs Table · Pipeline · Payments (จำค่า) · Scope: Campaign ครั้งละ 1 (ไม่มี All campaigns · จำอันล่าสุด · ไม่งั้น On going อันแรก) + status chip → Phase (All phases / On going / Phase ของ Campaign นั้น) → PIC (Me / All PICs / ชื่อ / Unassigned — PIC เริ่มที่ Me · จำค่าต่อคน · chip ลบได้) → Search → Filters (Tier, Pillar, CTA, Payment term, Sub-status) → ⋯ (Export · Compact | Template)
- Group by Stage (เริ่มต้น) / Phase / KOL Tier / PIC / None → state tabs Open (เริ่มต้น) · Needs action (chip: Overdue · Unpaid after posting · Payment overdue · Needs phase) · Complete · Cancelled · All → บรรทัดเงิน Committed / Budget · Pending · Paid · ปุ่ม ⊞/⊟ แทน Expand all / Collapse all · คอลัมน์ PIC ซ่อนเมื่อเลือกคนเดียว
- Pipeline: ลากการ์ดไปขั้นอื่น = Move stage — ขั้นถัดไปตามแผนย้ายทันที (วันที่ = วันนี้ · Undo 5 วินาที) · ถอยหลัง / Cancel / ข้ามขั้น / ยังไม่มี Pillar / Draft เกินแผน → เปิด Move stage ที่ขั้นนั้น (Cancel = การ์ดอยู่ที่เดิม) · Post ที่โพสต์ยังไม่ครบ → วางไม่ได้ (กรอบแดง + บอกเหตุผล) · คอลัมน์ Draft ที่ไม่มีใครวางแผนโผล่ (พับ) ระหว่างลาก · ⋯ › Move to… สำหรับคีย์บอร์ด / มือถือ · Viewer ลากไม่ได้
- Payments: Due now (เริ่มต้น) · Overdue · Upcoming · Paid · All · Committed · Paid · Outstanding (= Committed − Paid ของ deal ตั้งแต่ Confirm QT) · กลุ่มตาม Payment term · ติ๊ก Docs / Deposit (50/50) / Paid ในตาราง (วันนี้ · Undo · บันทึก event) · ติ๊ก Paid ตอนยังไม่มี term → ถาม term หรือ Skip · Bulk: Mark docs done · Mark paid (เลือกวันที่) · Set payment term · Payments CSV

**Responsive (R7)**
- ≥ 1280px เมนูเปิด / rail ตามที่เลือก (จำค่า) · 768–1279px rail อัตโนมัติ » เปิดทับเนื้อหา (คลิกนอก / Esc / เลือกเมนูแล้วปิด) · < 768px ☰ เหมือนเดิม · ความกว้างเมนูเลื่อน 200ms
- ResizeObserver ที่พื้นที่เนื้อหา: `main[data-cw]` = xl / l / m / s · event `kt:contentresize` หลังเมนูเลื่อนเสร็จ → Dashboard / Campaign & Phase วาดใหม่ (หน้าไม่กระโดด)
- l: Platforms = ไอคอนแรก + "+n" · m: KPI 2 ต่อแถว · layout 2 คอลัมน์เหลือ 1 · Search เต็มแถว · คอลัมน์ KOL / Name ค้างตอนเลื่อนตาราง · s: 1 ต่อแถว · drawer เต็มพื้นที่เนื้อหาเมื่อเหลือหน้าน้อยกว่า 320px · KOL Master ทุกคอลัมน์พอดี 1200px

**Tests**
- `tests/cr06.spec.js` · ทั้งหมด 269 ข้อ · ไฟล์ใหม่ `src/rules-products.js`, `src/rules-perf.js`

## CR-05 · 05/10/2026 — KOL Manager + View as role · ไม่มี ID Campaign/Phase บนจอ + Searchable combobox · Phase Planner · นิยามเงิน + Dashboard 3 tabs · Campaign & Phase Table/Timeline + On hold/Cancelled

Spec: `docs/CR-05.md` · schema_version **4 → 5** (Restore รับ backup v1–v5) · ตัวเลขเท่ากับ CR-03 §5.0 / CR-04 §5.0 (อ่านเป็น Committed + Pending)

**Roles (R1)**
- role ใหม่ **KOL Manager** (`kol_manager`): ทำได้ทุกอย่างของ staff + Campaign & Phase / Phase Planner / งบ · แก้ Costs หลังจ่าย · เปลี่ยน Campaign ของ deal · Merge KOL / ลบ · Settings › Lists · ทำไม่ได้: Tier rules · Restore / Reset · Role Management · ไม่มีใครถูกตั้งเป็น KOL Manager ให้อัตโนมัติ
- `PERMISSIONS` แต่ละแถวมี `actions[]` · ตาราง Permissions ในหน้า Role Management มี 4 คอลัมน์ · `effectiveRole`, `actingAs`
- **View as role** (เฉพาะคนที่เป็น admin จริง) ในเมนูการ์ด user: แถบ "Viewing as …" + "Back to Admin" · เก็บใน sessionStorage (`charmiss_kol_tracker_view_as`) ไม่อยู่ใน state / Backup · Switch user = ล้างค่านี้ · `changed_by` ยังเป็นคนจริง

**ไม่มี ID บนจอ + combobox (R2)**
- ทุกหน้าแสดงชื่อ Campaign / Phase (ชื่อ Phase ซ้ำข้าม Campaign = "Campaign › Phase") · CSV ยังมี `campaign_id`, `phase_id` คู่กับ `campaign_name`, `phase_name` (posts.csv · status log)
- Campaign / Phase ใหม่ได้ ID ภายใน `CMP-0001` / `PHS-0001` … (ID ใน seed เดิมคงไว้) · `campaigns.short_code` ถูกลบ
- ชื่อ Campaign ห้ามซ้ำ (ไม่สนตัวพิมพ์ / ช่องว่างหัวท้าย) · ข้อความตรวจที่ซ้ำกันแสดงครั้งเดียว และขึ้นเมื่อแตะช่องนั้นแล้วหรือกด Save
- Searchable combobox ทุกช่องที่เลือก Campaign / Phase: ค้นจากชื่อ (ไทยได้) · status chip + ช่วงวันที่ · ↑ ↓ Enter Esc · Cancelled ซ่อนจนกว่าจะค้น · "+ New campaign" (เมื่อมีสิทธิ์)

**Phase Planner (R3)** — `src/screen-planner.js`
- drawer กว้าง: ข้อมูล Campaign + ตาราง Phase (ชื่อ · Start · End · Days · Budget % | ฿) · Add / Duplicate / Delete (ลบไม่ได้ถ้า Phase มีโพสต์) · Split evenly · Fill remaining
- Budget bar (Allocated of budget) · Timeline preview (ช่วงที่ทับกัน = ลายเส้น) · Impact preview (โพสต์ที่จะเปลี่ยน Phase / กลับเป็น auto)
- Save ทั้งชุดหรือไม่ save เลย · เกินงบ = ถาม "Save anyway?" · บันทึก `campaign_events` type `phase_plan` · ตั้ง CTA ครั้งแรก = ถามว่าจะใส่ให้ deal ที่เปิดอยู่และยังไม่มี CTA ไหม
- ฟอร์ม Phase เดิมเอาออก (ฟอร์ม Edit ของ Campaign ยังใช้แก้ note / budget / CTA / pillar target)

**เงิน + Dashboard (R4)**
- นิยามเดียวทุกหน้า (§4.5) ลำดับ Budget · Committed · Used % · Remaining · Pending (+ Paid) · ตัวเงิน "Shortlist" เปลี่ยนชื่อเป็น **Pending** · ⓘ เปิด popover (นิยาม + สูตร)
- bar ทุกแบบมุมเหลี่ยม (กราฟ · progress · budget · timeline)
- Dashboard 3 tabs `#dashboard/all` · `/campaign` · `/ops`:
  - All campaigns: This month · Last 30 days · Last 90 days (ค่าเริ่ม) · This year · Custom (Apply / Cancel) · Include cancelled · KPI · Campaign portfolio · Activity by campaign (swimlane)
  - By campaign: Dashboard เดิม (เลือก Campaign / Phase ด้วย combobox)
  - Operations: queue cards (Overdue · Unpaid after posting · Payment term not set · Pillar not set · Posted without date · Post date outside phase) · ตาราง queue (เลือกหลายแถว → Reassign / Set pillar · PIC inline) · Active pipeline · Workload by PIC

**Campaign & Phase (R5)**
- Table | Timeline (จำค่าไว้) ใช้ Year · Search · Status tabs (On going · Not started · On hold · Complete · Cancelled) · Include cancelled ร่วมกัน
- Table: Name (≥ 320px ขึ้นบรรทัดใหม่ได้) · Status · Period · Budget · Committed · Used % · Remaining · Pending · Deals · % ของงบ Campaign อยู่ใน popover ของ Budget ของ Phase · Total ไม่รวม Cancelled
- Timeline: Gantt เต็มความกว้าง · Month | Quarter · Today · Name / Status ค้างไว้ตอนเลื่อน (มือถือค้างแค่ Name)
- Campaign drawer: Put on hold / Cancel campaign (ต้องใส่เหตุผล) / Resume · On hold = เพิ่ม deal ใหม่ไม่ได้ (deal เดิมแก้ได้) · Cancelled = deal ที่ยังเปิด (List / In process) ถูก Cancel ด้วยเหตุผลเดียวกัน, deal แก้ได้แค่ Remark, ไม่นับใน Total · บันทึก `campaign_events` type `status`

**Tests**
- `tests/cr05.spec.js` · ทั้งหมด 228 ข้อ · ไฟล์ใหม่ `src/screen-planner.js` · collection ใหม่ `campaign_events`

## CR-04 · 05/10/2026 — Side menu + Dashboard · Deal tier + Group by · Role Management · แก้ Deal ราย section + field lock · PIC / CTA / Payment term defaults

Spec: `docs/CR-04.md` · schema_version **3 → 4** · ตัวเลขทั้งหมดเท่ากับ CR-03 §5.0

**App shell (R1)**
- Side menu 232px (ยุบเหลือ 64px ได้ จำค่าไว้ · tooltip ตอนยุบ): Dashboard · Campaign & Phase · Deals · KOL Master · Settings · Role Management (admin) · ไม่มี tab bar ด้านบนแล้ว
- ล่าง side menu: การ์ด user ปัจจุบัน (Switch user) · ◐ · ⋯ (จุดเตือน backup อยู่ที่ ⋯) · มือถือ < 768px: top bar ☰ + ชื่อหน้า เปิด menu เป็น drawer
- Overview เปลี่ยนชื่อเป็น **Dashboard** · route ใหม่ `#dashboard` `#campaigns` `#deals` `#kols` `#settings` `#roles` · route เดิม (`#overview` `#kol/…` `#campaign/…`) ถูกเปลี่ยนเป็น route ใหม่ให้เอง
- ทุกหน้ามี page header: ชื่อหน้า + ปุ่มหลักชิดขวา (+ New deal / + New KOL ย้ายออกจาก toolbar)

**Deals (R2)**
- Deal tier = tier ของบัญชีที่ followers สูงสุดในบรรดาบัญชีที่ใช้ในโพสต์ของ deal (ยังไม่มีโพสต์ = บัญชีใหญ่สุดของ KOL · ไม่มี followers = Unknown) · chip ต่อท้ายชื่อ KOL + tooltip · คอลัมน์ Tier ใน Template view (export Template ไม่มี) · `deals.csv` เพิ่ม `kol_tier`, `tier_followers`
- Tier filter (เลือกได้หลายค่า) ใน Deals และ Pipeline · Status tabs / Summary strip / หัวกลุ่มนับตาม filter
- Group by: Phase · Stage · KOL Tier · None (จำค่าแยก Compact / Template · ยังไม่เลือก = Phase เมื่อหลาย Phase, Stage เมื่อ Phase เดียว) · Expand all / Collapse all · Stage › Cancelled ยุบไว้
- หัวกลุ่ม Stage: status chip · n deals · ฿Committed (+ Shortlist) · overdue · หัวกลุ่ม Tier: ช่วง followers · n deals · ฿Committed (+ Shortlist) · ค่าเฉลี่ยต่อ deal · Views · CPV

**Users & roles (R3)**
- `users` (Admin + 1 คนต่อชื่อใน PIC list เดิม) · `meta.current_user_id` · ไม่มีรหัสผ่าน — Switch user จากการ์ดล่าง side menu
- Role Management (admin): ตาราง user · drawer ดูก่อนแก้ · Permissions matrix แบบอ่านอย่างเดียว · ข้อความ "not a security control" ที่หัวหน้านี้ที่เดียว
- กติกา: ชื่อต้องมี · email ต้องลงท้าย @lomr.co.th · ชื่อ PIC ห้ามซ้ำ · Admin คนสุดท้ายเปลี่ยน role / ปิดไม่ได้ · ปิด PIC ที่ยังมี deal เปิดอยู่ = Warning + Reassign PIC… · เปลี่ยนชื่อ PIC = ถามพร้อมจำนวนแล้วเปลี่ยนใน deals และ KOL ให้
- สิทธิ์ (`rules.can`) ถามทั้งตอนวาดปุ่มและก่อนเขียนข้อมูล: viewer ดูและ export ได้อย่างเดียว · staff แก้ deal / KOL ได้ แต่ Campaign & Phase, Settings, Restore / Reset, Role Management ไม่ได้
- PIC list มาจาก users (is_pic + active) · Settings › Lists ไม่มี PIC แล้ว (มีลิงก์ไป Role Management) · `changed_by` ใน status log และ deal_events = user ปัจจุบัน · History แสดงชื่อ (ของเดิม = System import) · Filters › My deals

**Deal drawer + defaults (R4)**
- ไม่มีปุ่ม Edit รวมแล้ว: ✎ ที่หัวแต่ละ section (Payment · Deal · Costs · Timeline · Posts · Campaign ที่หัว drawer) เปิดแก้ทีละ section · กด ✎ อีก section ขณะยังไม่ Save = ถาม Discard changes?
- `rules.fieldEditable` + 🔒 พร้อมเหตุผล: KOL / deal ID แก้ไม่ได้ · Campaign เฉพาะ admin ก่อนมีโพสต์ที่มีวันที่และก่อน Confirm QT · Payment term ล็อกเมื่อจ่ายครบ · Costs หลังมีการจ่าย: staff ล็อก, admin แก้ได้ต้องใส่เหตุผล (event `cost`) · Approved draft date ล็อกจนกว่าจะผ่านขั้นนั้น · โพสต์ที่มีลิงก์แล้วเปลี่ยนบัญชีไม่ได้ · Total / Gencode end / Tier = Auto · deal ที่ Cancel แก้ได้แค่ Remark และ Cancel reason
- ทุก Save = deal_events type `edit` (from / to ราย field) แสดงใน History · เอาติ๊กจ่ายเงินออกต้องยืนยัน
- New deal / Add to campaign / bulk shortlist: PIC = คุณ (ถ้าเป็น PIC) → PIC ของ KOL · มีป้าย "You" / "KOL default"
- CTA เป็นค่าของ Campaign (`campaigns.cta`, cta_list ตั้งต้น 4 ค่า) · deal ใหม่ได้ CTA ของ Campaign และแก้ได้ ("Differs from campaign") · เปลี่ยน CTA ของ Campaign แล้วถาม Apply to open deals · Filters › CTA · chip ในตาราง Campaign & Phase และหัว Dashboard
- Payment term ของ deal ใหม่มาจาก KOL Master ("From KOL Master") · เปลี่ยนแล้วขึ้น "Changed for this deal" + "Also update KOL default" · KOL ยังไม่มี term = ต้องเลือก + "Save as this KOL's default" ติ๊กไว้ · drawer แสดง "Differs from KOL default"

**Tests**
- `tests/cr04.spec.js` · ทั้งหมด 204 ข้อ · ไฟล์ใหม่ `src/rules-roles.js`, `src/screen-roles.js`

## CR-03 · 05/10/2026 — Phase จัดอัตโนมัติจากวันโพสต์ · งบ Campaign แบ่งเป็น % · Pillar บังคับ + Allocation

Spec: `docs/CR-03.md` · schema_version **2 → 3**

**Data (R1)**
- Deal ผูก `campaign_id` (ไม่มี `phase_id` แล้ว) · `deals.legacy_phase_id` เก็บ phase เดิมไว้อ้างอิง · `deal_posts.phase_override` · `campaigns.budget_kol` (= ผลรวมงบ Phase เดิม) · `campaigns.pillar_target` · `lookups.pillar_target_default` (10/20/70) · deal_events เพิ่ม type `pillar`
- Migration v2 → v3 ใน `src/store.js` (อธิบายไว้หัวไฟล์) · seed ไม่แก้ · วันที่ของ deal / post ไม่แก้ · โพสต์ที่วันที่ตัดสิน Phase ไม่ได้ (ไม่มีวัน · อยู่นอกทุก Phase · Phase ทับกัน) ได้ `phase_override` = phase เดิม (90 โพสต์) → ยอดรวม Campaign ไม่เปลี่ยน
- Phase ของโพสต์ = override ถ้ามี · ไม่งั้น Phase เดียวที่ครอบวันโพสต์ (ยังไม่โพสต์ใช้วันที่คาดว่าจะโพสต์) · ไม่มีวัน = Unscheduled · ไม่ตรง / ตรงหลาย Phase = Needs phase
- เงินต่อโพสต์ = total ÷ จำนวนโพสต์ของ deal · Primary phase = Phase ของโพสต์แรก (ใช้จัดกลุ่ม)
- **Committed นับตั้งแต่ Confirm QT** · deal ที่ Shortlist / Contacted แยกเป็น "Shortlist" (James 05/10/2026) · Committed + Shortlist = ยอดเดิม ฿1,881,579
- Rules ใหม่: `src/rules-phase.js` (resolvePostPhase, phaseIndex, scopes, campaignSummary, allocation) · `src/rules-overview.js` (summary cards, Phase budget, Activity by date, pillar targets)

**Campaign & Phase · Deals (R2)**
- Campaign มี KOL budget · งบ Phase ใส่เป็น % หรือ ฿ · ตาราง: Budget (+ Unallocated / Over-allocated) · Shortlist · Committed · แถว Unscheduled / Needs phase · Phase ทับกัน = ลายทแยงใน timeline + warning
- เปลี่ยนงบ Campaign แล้วถาม Keep phase % / Keep phase amounts
- Deal drawer › Posts: Phase จากวันที่ + เลือกเองเมื่อวันที่ตัดสินไม่ได้ · New deal เลือก Campaign (ไม่ต้องเลือก Phase)
- Deals: จัดกลุ่มตาม Primary phase · "+n phase" · filter Needs phase / Unscheduled · Pipeline ต่อ Campaign + เลือก Phase ได้หลายอัน
- ห้ามลบ Phase ที่มีโพสต์ใช้อยู่ (ทั้งตามวันที่และเลือกเอง)

**Pillar (R3)**
- Deal ใหม่ต้องมี Pillar ตั้งแต่ Confirm QT (Move stage มีช่องเลือก Pillar) · deal เดิมที่ยังไม่มี Pillar แสดงเป็น info ไม่บล็อก
- Set pillar หลายแถว + Undo · Pilar แก้ inline ใน Template view · Needs attention: Phase to assign · Pillar not set

**Overview (R4–R5)**
- Campaign → Phase filter แยกกัน · All campaigns ใช้ date presets เดิม · เลือก Campaign แล้วแสดงช่วงวัน "Day n of m"
- โหมด Campaign: Summary cards (Deals · Budget · Posts · Engagement) · Activity by date · Phase budget · Allocation vs target · Active pipeline + Needs attention ตามขอบเขต
- Activity by date: Posts | Spend · Color by Phase / Pillar (All campaigns: Campaign / Pillar) · Daily | Weekly อัตโนมัติ (≤ 45 วัน = Daily) · Phase strip (ทับกัน = ลายทแยง) · แกน X 2 ชั้น · เส้น Today · Planned = สีจาง + ขอบ · tooltip · table · CSV · expand · Spend ไม่นับ Shortlist
- Settings › Pillar targets (ค่าเริ่มต้น · บันทึกเมื่อรวม = 100) · Campaign › Edit ตั้ง target ของตัวเองได้

**Export / Tests**
- `deals.csv` เพิ่ม `campaign_id`, `primary_phase_id`, `primary_phase_name`, `phase_ids`, `legacy_phase_id`, `commit_type` · `posts.csv` เพิ่ม `phase_id` (ที่ใช้จริง), `phase_source`, `phase_override`, `post_share` · log มี `campaign_id`
- `tests/cr03.spec.js` · ทั้งหมด 177 ข้อ

## CR-02 · 05/10/2026 — Deals · Journey ตามแผน · Payment term · Campaign & Phase Timeline

Spec: `docs/CR-02.md` · schema_version **1 → 2**

**Data (R1)**
- Field ใหม่: `deals.draft_rounds` (1–3) · `deals.script_required` · `deals.payment_term` (prepaid · split_50 · postpaid · free · null) · `kol_master.default_payment_term` · collection ใหม่ `deal_events` (append-only: `pic` · `plan` · `payment_term`)
- Migration อยู่ใน `src/store.js` (อธิบายไว้หัวไฟล์) ทำครั้งเดียวตอนโหลด seed / ข้อมูลในเครื่อง / Backup v1 แล้วบันทึกเป็น v2 ทันที · เพิ่ม field อย่างเดียว ไม่ลบหรือเปลี่ยนค่าเดิม · seed ไม่แก้
- Rules ใหม่: Content plan (ขั้นนอกแผนไม่นับ · Move ไป Draft เกินแผนต้อง Add draft round) · `paymentState(deal, today)` · `phaseStatus` / `campaignStatus` / `sortCampaigns` · Unpaid ไม่นับ Free
- ฟังก์ชันเดิม `paymentState` (Docs → 50% → Paid) เปลี่ยนชื่อเป็น `paymentProgress`

**Deals (R2)**
- Toolbar: Campaign → Phase (ค่าเริ่มต้น On going phases) · หลาย Phase = จัดกลุ่มตาม Phase พร้อมหัวกลุ่ม (สถานะ · ช่วงวัน · จำนวน deal · ยอด/งบ) กาง/หุบได้ · Pipeline ใช้ Phase เดียว
- Compact: ☐ · KOL · Stage (จุดตามแผน + Brief / Script / Draft n of m / Posted) · Platforms · PIC · Total · Payment (term · state) · Next due · ⚠ — ไม่มีคอลัมน์ Phase และบรรทัด deal ID
- ไอคอน Platform (`src/icons.js`: Simple Icons CC0 · Lemon8 = มะนาว · Other = ลิงก์) ใช้ทุกหน้า ไม่มีตัวย่อ TT / IG / FB / L8
- PIC แก้ในตาราง + Reassign PIC หลายแถว + Undo 5 วินาที · ทุกการเปลี่ยนเป็น deal_events
- Filters › Payment status และ Payment term

**Drawer · Move stage · Payment term (R3)**
- Journey แสดงเฉพาะขั้นในแผน · บรรทัด Content plan: Drafts [−] [+] · Script (ไม่ต้องกด Edit)
- Payment: term + state + ติ๊กเฉพาะที่ใช้กับ term · แก้ term ในโหมด Edit
- History รวม status log กับ deal_events
- Move stage: "+ Add draft round" เพิ่มรอบแล้วขยับในครั้งเดียว
- New deal / Add to phase / Add to phase shortlist: ต้องมี Payment term · มี "Save as this KOL's default"
- KOL Master: Default payment term (ดู · แก้ · Filter) · เปลี่ยนแล้วถาม "Apply to n open deals?"
- Pipeline: คอลัมน์ Script / Draft 2–3 แสดงเมื่อมี deal ใน Phase วางแผนไว้
- Overview › Needs attention: Payment before brief · Payment term not set

**Campaign & Phase (R4)**
- Status คำนวณจากวันที่ · Year (ค่าเริ่มต้นปีปัจจุบัน) · Status tabs · Search · เรียงตาม §4.8
- ตาราง: Name · Status · Period · Budget · Committed (+ usage bar) · Deals · แถวรวมตาม filter
- Gantt timeline ด้านขวา (เส้น Today + ปุ่ม Today · คลิกแท่งเปิด drawer) · มือถือสลับ Table | Timeline

**Export / Tests**
- `deals.csv` เพิ่ม `draft_rounds`, `script_required`, `payment_term` · คอลัมน์ `payment_state` เป็นค่าใหม่ (paid · deposit_paid · overdue · due · not_due · free)
- `tests/cr02.spec.js` · `tests/test.html` รันทุกไฟล์ใน `window.KT_SPECS`

## CR-01 + UI Revise Prompt A, B · 05/10/2026

Baseline: HTML ล้วน (ดับเบิลคลิก `index.html`) · Deals / KOL Master / Campaign & Phase / Settings / Overview · ข้อมูลใน localStorage · Backup / Restore
