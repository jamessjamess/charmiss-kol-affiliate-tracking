# CHANGELOG — Charmiss KOL Tracker

ฉบับย่อ: CR ละไม่กี่บรรทัด · รายละเอียดเต็ม (ไฟล์ · ฟังก์ชัน · การตัดสินใจ) อยู่ที่ `docs/archive/CHANGELOG-full-2026-10-07.md` · spec ของแต่ละ CR อยู่ที่ `docs/CR-xx.md`

## CR-22 v1.0 · 08/10/2026 — Rate ไม่เติมให้เอง · CTA ตอน Contacted · Sample shipment ตอน Confirm QT · ค้นไม่เจอ → New KOL · Deal modal tabs · Assign to บังคับ
schema **20 → 21** · tests **627**
- **Rate card** ว่างเสมอ (เว้น deal มีของตัวเอง) + hint **Last rate card ฿x · Campaign · วันที่** คลิกเพื่อใส่ · ไม่มี Avg · ตัด Use latest rates / Clear rates
- **CTA \*** ตั้งแต่ Contacted (Move stage · New deal ในแถบหัว) · **Sample shipment** ตอน Confirm QT: Method (NPD · Warehouse · KOL buys own) · Products × Qty · Ship to · Purchase amount → สร้างรายการใน Shipments (KOL buys own = KOL purchase → Mark purchased · ยอดเข้า Total cost เป็น Product purchase) · Shipments มีคอลัมน์ / ตัวกรอง Method
- **New deal:** ค้นไม่เจอ → Create "<คำค้น>" as new KOL · Assign to บังคับ (Admin ต้องเลือก)
- **Deal modal** กว้าง min(1400px, 94vw) · header มี Tier · Assigned to · แถบ Missing คลิกไปช่อง · 5 tabs (Overview · Costs & payment · Timeline & content · Shipments & posts · History) จำต่อผู้ใช้ · จาก Payments / Shipments เปิด tab ที่ตรง

## CR-21 v3.0 · 08/10/2026 — Collapse all / Sort · Deals Year · Save draft · Approval review · Return to draft / Resubmit · Edit = Phase Planner
schema **19 → 20** · tests **622**
- **Campaign & Phase:** Sort (Status · Start date earliest / latest) + Collapse all / Expand all บน Table และ Timeline (จำแยกต่อผู้ใช้ · แถวที่พับมีเส้นแบ่ง Phase + "n phases") · ⋯ Edit · Draft ไม่แสดงในตาราง / Timeline / Dashboard / New deal
- **Deals › Year** (All years + ปีของ Campaign ที่ Approved · "All campaigns in 2026" · ทุก view / export / ตัวนับกรองตามปี · แถบ ongoing ปีก่อน · ลิงก์จากหน้าอื่นตั้งปีตาม Campaign)
- **Save draft** (Planner · Adjust budget · ต้องมีแค่ชื่อ · ตรวจเต็มสีเทาจนกด Submit · Save as draft? ตอนปิด) · **My requests / Approvals** Drafts · Pending · Decided · การ์ดปุ่มเดียว **Review** → **Approval review pop up** (What changed since last round · Approve ใช้ได้เมื่อเลื่อนถึง Decision · ตัด Approve selected)
- **Return to draft** (เหตุผล ≥ 5 ตัว) → Resubmit (Round +1) · Withdraw to draft · ไม่มีคำว่า Rejected · ทุกการเปลี่ยนสถานะผ่าน `rules.requestTransition()` · diff ผ่าน `rules.requestDiff()`
- **Edit = Phase Planner** (prefill · Note · footer "n changes · …" / No changes · Phase ที่มี deal ลบไม่ได้ · KOL budget อ่านอย่างเดียว) · drawer ตัดฟอร์มแก้ด้านข้าง · Plan phases · CTA / Default payment term

## CR-20 v1.3 · 08/10/2026 — New deal (From KOL Master · New KOL) · Deal modal · Move stage ตามปลายทาง · Package · Draft notes
schema **18 → 19** · tests **613**
- **New deal:** tab **From KOL Master** (default · 1 หรือหลาย KOL · แผง Selected: Rate · Post due → Phase · Payment term / Package เมื่อเริ่ม Contacted / Confirm QT · Set post due for all · Use latest rates · Add n deals / Add & open first · งบภาษาอังกฤษ) · ตัวกรอง **Worked in** + Posted only · tab **New KOL** (KOL ใหม่ + deal ละเอียด · ตรวจซ้ำ "Use this KOL") · แถบหัวร่วม Campaign · Phase · **Assign to** · Pillar · Start at · Products · ไม่มี "Adding to" / CTA · คำ **KOL owner** / **Assigned to**
- **Deal modal** (L · ‹ › · ←/→ · Back to <KOL>) แทน side drawer · Journey 🔗 Brief / Script · 📎 / 🖼 ใต้ Draft
- **Move stage:** กติกาเดียว `rules.stageRequirements()` (dialog · ลาก · New deal) · Contacted: Rate / term optional · Confirm QT: Pillar · term · **Rate card** · Gencode days · **Costs + Total** · ขั้นที่ข้ามพร้อมวันที่ · Brief / Script link · **Draft notes** (Note · Links · รูป ≤ 6 ใน IndexedDB) · **Draft → Post** (Not needed · Approve · Posted link) · **Next expected** (+3d +5d +7d · Add Draft round) · error หลังกด Move · Undo ทั้งหมด
- **Payment term Package:** KOL modal › Rates › Packages · ตัดยอดตั้งแต่ Confirm QT · คืนเมื่อ Cancel · Payments แถวเดียวต่อ package · Prepaid package balance · Export sheet Packages · badge PKG

## CR-19 v1.1 · 08/10/2026 — Campaign timeline · Pillar Awareness & Consideration · ตัด Pillar target · KOL budget บังคับ
schema **17 → 18** · tests **577**
- **Dashboard › All campaigns:** การ์ด **Campaign timeline** แทน Activity by campaign — 1 แถว = 1 Campaign (40px) · แถบช่วงวันที่สีอ่อนตามสถานะ (Gantt เดิมของ Campaign & Phase) · เส้นแบ่ง Phase · แท่งโพสต์รายสัปดาห์ (≤ 45 วัน = รายวัน) สีหมึกเดียวสเกลเดียว · นอกช่วง Campaign จาง · 10 แถวแล้วเลื่อนในการ์ด (แกนติดบน) · Show all · Posts / Spend · Table view · sheet `Campaign timeline` · คลิกแถว = By campaign
- **Pillar** ใหม่ "Awareness & Consideration" (สั้น "Aware + Consider" · สีเขียว `#008300`) — ลำดับ Awareness → A&C → Consideration → Conversion · chip สีในตาราง Deals · migration v18 ตั้ง default pillar ของ Perfect Heart Phase 1
- **ตัด Pillar target ทั้งระบบ** (Planner · drawer · Settings · Pillar mix Target / Δ · Allocation vs target → **Pillar allocation**) — ข้อมูลเดิมไม่ลบ
- **KOL budget \*** ต้อง > ฿0 ก่อน Create campaign / Submit for approval (กรอบแดง "Enter the KOL budget")

## CR-18 v1.0 · 08/10/2026 — Phase Planner งบ % / Amount · Adjust budget (ขออนุมัติ) · Budget history
schema **16 → 17** · tests **564**
- **Phase Planner:** ตัด CTA · Default payment term (ค่าเดิมไม่ลบ) · ลำดับ Name → KOL budget → Products → Pillar target · ตาราง Phase กรอก **Budget %** หรือ **Amount** ก็ได้ (ช่องที่พิมพ์ล่าสุดนำ · เก็บเป็นเงิน) · Even / Fill remaining เป็นเงิน · แถบงบ เขียว = ตรง · แดง = ขาด / เกิน (Save ถามก่อน) · เหลือง = ยังไม่มีงบ · แถว Unallocated · New deal ไม่ prefill CTA / term จาก Campaign
- **Adjust budget** (Campaign drawer · row ⋯ · Planner): Increase / Decrease · แบ่งลง Phase / Unallocated · เหตุผล · Staff = Submit for approval (การ์ด Budget increase / decrease ใน Approvals) · Admin / KOL Manager = Apply ทันที · ห้ามต่ำกว่า Committed · ค้างได้ทีละ 1 คำขอ · ระหว่างรอแสดง "+฿x pending" (ตัวเลขเงินใช้งบที่อนุมัติแล้ว) · **Budget history** ใน Campaign drawer
- `campaign_budget_changes` ใหม่ · migration v17 = แถว Initial ต่อ Campaign · ตัวเลขทุกหน้าเท่าเดิม

## CR-17 v1.2 · 08/10/2026 — หน้า Approvals (1 การ์ด = 1 คำขอ) · ลำดับ Status
- Campaign & Phase › tab **Approvals n** (ผู้จัดการ) / **My requests n** (Staff) · route `#campaigns/approvals` · การ์ด New campaign · New phase · Change · Budget พร้อมรายละเอียดสั้น (Period + เริ่มเมื่อไร · Budget · Phases + timeline เล็ก · Pillar target · Products · CTA · ผลกระทบ) · Pending / Decided · Type · Approve selected · Reject (เหตุผล) · Undo 10 วิ · Note to approver
- Status: On going · Not started · **Pending approval** · On hold · Complete · **Rejected** · Cancelled (tab ที่เป็น 0 ซ่อน) · ใต้ chip Pending approval บอก "Started 7 days ago" / "Starts 01/11"

## CR-17 v1.1 · 08/10/2026 — Simple mode (ทีม KOL บันทึกจ่ายแล้ว / ส่งแล้วเอง) · Campaign approval
schema **15 → 16** · tests **542**
- **Settings › Operations mode** (Admin): Payments · Shipments แยกกัน `Simple` / `Full` · default Simple · ข้อมูลชุดเดียว (สลับไป-กลับไม่หาย) · `rules.opsMode(state, kind)`
- **Payments Simple:** tabs To pay · Sent · Paid · ปุ่ม **Mark paid** บนแถว (popover Paid date · Ref · Undo 10 วิ) · Export for accounting → PR เดิม → "Mark n lines as sent?" → run "Sent dd/mm" (With Accounting) · Mark unpaid (Admin / KOL Manager / Accounting · เหตุผล) · Docs n/m ไม่ขวาง · Deal drawer มี Mark paid / unpaid · Payments to confirm ใน Operations · Journey To pay → Sent → Paid
- **Shipments Simple:** ปุ่ม Shipped / Delivered บนแถว (popover วันที่ · carrier จำต่อ user · tracking ไม่บังคับ) · Shipped & delivered · Undo delivered · Change address · pick list อยู่ใน ⋯ · Deal drawer + Pipeline card ⋯ Mark shipped / delivered
- **Campaign approval:** Staff สร้าง Campaign / Phase ได้ (Submit for approval) · ขอแก้ Budget / Period / Pillar target / Phase ของที่อนุมัติแล้ว (Change pending) · Admin / KOL Manager Approve / Reject (เหตุผล) · Resubmit · badge + tab Pending approval + Operations › Approvals · ยังไม่อนุมัติ = เพิ่ม Deal ไม่ได้ · ไม่นับ Dashboard · Phase pending ไม่รับโพสต์ / ไม่นับงบ

## CR-16 v1.0 · 08/10/2026 — KOL profile modal · หลาย Payee / ที่อยู่ · รูปโปรไฟล์
schema **14 → 15** · tests **521**
- KOL เปิดเป็น **modal L + 5 tabs** (Overview · Deals & history · Performance · Rates · Payee & shipping) แทน drawer · header + แถบสรุป · ‹ › / ↑ ↓ ตามตารางที่กรอง · route `#kols/K0011/overview` (Back ปิด) · จำ tab ต่อ user · Deal drawer ซ้อนเหนือ modal · Payments chip "Missing: Bank details" เปิดที่ tab Payee & shipping
- **หลาย payee ต่อ KOL** (`label` · ★ default · `archived`) · Deal drawer › **Pay to** (`deals.payee_id` + deal_events `payee`) · To pay แสดง label · ⋯ Change payee · line ใน run ล็อก payee · ใช้แล้วลบไม่ได้ → Archive · Import payee มี `payee_label` + Add as another / Replace default / Skip
- **`shipping_addresses`** หลายที่ต่อ KOL (เข้ารหัส) · **Ship to** ใน Mark shipped / Edit / New shipment · ตาราง Shipments คอลัมน์ Address · Export shipping list / Print ใช้ที่อยู่ของแต่ละ shipment · migrate ย้าย shipping เดิม (ciphertext) ตอนโหลด
- **รูปโปรไฟล์** 256×256 WebP ใน IndexedDB `kol_photos` (Upload · ลากวาง · วาง · Remove · ครอป) · ตาราง / modal / New deal / Deal drawer · Backup "Include photos" · Restore เขียนรูปกลับ · Settings › Photos n · x MB

## CR-15 v1.0 · 08/10/2026 — Journey: Script ทุก Deal · Draft 1–3 · ขั้น Approve
schema **13 → 14** · tests **501**
- ขั้นใหม่: Shortlist · Contacted · Confirm QT · Brief · **Script** · **Draft 1–3** · **Approve** · Post (ชื่อขั้น = งานล่าสุดที่ทำเสร็จ) · Script และ Approve อยู่ในแผนของทุก deal (ตัด toggle Script)
- migrate v14 เปลี่ยนแค่ชื่อขั้นใน deals / log (วันที่ไม่แตะ · label ที่แก้เองคงไว้ · เก็บสำเนาก่อน upgrade) · ฟิลด์ใหม่ script_date · expected_script_date · approved_date · expected_approve_date
- ข้ามขั้นไปข้างหน้า = ขั้นที่ข้ามทำเสร็จวันที่ย้าย + log "auto-completed" · Due: Script / Draft k / Approve (ว่าง = due ของ Post) · Next due บอกชื่อขั้น
- Pipeline: คอลัมน์ว่างทุกคอลัมน์ยุบเป็นแถบ 40px · Journey: ขั้นที่ผ่านแต่ไม่มีวันที่ = "—" (Not recorded) · core steps + Script · Approve

## CR-14 v1.0 · 07/10/2026 — Status filter · multiSelect · ค้นหา Campaign & Phase · Last campaign · Contact ID · Import template
schema **12 → 13** · tests **488** · **CR-12 (Help) ข้ามทั้งฉบับ** · ตั้งแต่ CR นี้ทุก CR รันจบในครั้งเดียว รายงานครั้งเดียว
- Dashboard › All campaigns: ตัวกรอง **Status** แบบ multi-select แทน Include cancelled (default ทุกค่ายกเว้น Cancelled · จำต่อ user `dash.all.statuses` · Export มีบรรทัด Status)
- `ui.multiSelect` ตัวเดียวทุกที่ (Campaign & Phase · Dashboard Status · Deals Tier · KOL Type · Performance Columns) · แก้ bug ช่องค้นหาสูง 280px (root cause: `.toolbar .search{flex:1 1 240px}` โดน input ใน popover แบบ column flex)
- Campaign & Phase › Search: ชื่อ Campaign → ทุก Phase · ชื่อ Phase → Campaign + Phase ที่ตรง (กางให้) · highlight · empty state + Clear search
- KOL Master: `Last phase` → **Last campaign** (deal เดียวกับ Last worked) · `contact_id` (LINE ID / Agency / อีเมลงาน · ห้ามเบอร์โทร) ใน drawer · New KOL · Filters · Search · Export
- Import KOL: Template 10 คอลัมน์ (บังคับ 4) · ไฟล์เก่า 16 คอลัมน์ยังใช้ได้ · อ่าน .xlsx ได้ · Download template · ชื่อซ้ำในไฟล์ = บัญชีใหม่ของ KOL เดียวกัน

## CR-13 v1.0 · 07/10/2026 — All campaigns เรียงใหม่ · Pillar mix · สี Phase ชุดเดียว · Deals tabs
schema **12** (ไม่เปลี่ยน) · tests **464**
- Dashboard › All campaigns: KPI → Campaign portfolio → Activity by campaign (เต็มแถว) → **Pillar mix** + KOL tier mix (1 : 1) · Export 5 sheet ตามลำดับจอ
- Pillar mix donut (Spend / Deals) เทียบ target ถ่วง Budget · Δ หมึกรอง · Not set > 50% → บรรทัดไป Plan phases
- สี Phase = ramp เทา 6 ขั้น (อ่อน → เข้มตามลำดับ Phase) ใช้ทุกจุด: Phase band · Phase budget · Allocation · Phase Planner · Campaign & Phase table
- Deals: tabs **All · List · In process · Complete · Cancelled** (= กลุ่ม Pipeline · default All · จำต่อ user `deals.stateTab.v2`) · ตัด Needs action → chips Overdue · Needs phase · Shipment overdue · Metrics due · Docs to collect
- ตัด Unpaid after posting ออกจาก Deals · ⚠ = จำนวนเหตุผลจาก chip · Workload by PIC ใช้ Docs to collect · ลิงก์เก่า `#deals?tab=needs_action` → All + Overdue

## CR-11 v1.1 · 06/10/2026 — Create modal · Go-live clean-up · Shipments · กรอกครั้งเดียว · UI polish
schema **11 → 12** · tests **448**
- ทุกการสร้างใหม่เป็น modal (S / M / L) · New deal = Single KOL + Bulk shortlist ใน modal เดียว · Phase Planner เป็น modal L
- ข้อมูลจากไฟล์เดิมที่ปิดแล้ว แสดง "—" แทนคำเตือน · Settings › Go-live clean-up (Match with PR file อ่านในหน่วยความจำ · Backup ก่อน Apply · Undo)
- Operations: To do + Data health · Payments: ตัด Request · เพิ่ม Hold / Release · ตัวกรองแยกต่อ tab
- หน้า **Shipments** ใน side menu (To ship · In transit · Delivered · pick list · New shipment) แทน Deals › Samples
- Default pillar ต่อ Phase · Default payment term ต่อ Campaign · สินค้าเดียวเลือกให้ · Metrics รอบ D+7
- UI polish: Deals toolbar 2 แถว · ⓘ เฉพาะสูตร · Pipeline lane Posted · ชื่อไม่ตัดกลางคำ · Timeline legend · ลิงก์โพสต์ซ้ำนับครั้งเดียว · Role matrix จัดกลุ่ม

## CR-10 · 06/10/2026 — Deals › Performance · Date range picker · Bulk shortlist · Drawer 60% · Samples
schema **9 → 11** · tests **413**
- Deals › Performance: 1 แถวต่อโพสต์ · KPI · แก้ metrics ในตาราง + Paste metrics
- Date range picker · Timeline filter / Fit · New deal Single / Bulk shortlist · drawer 60% ปรับกว้างได้
- Samples (ส่งสินค้าตัวอย่าง) · ที่อยู่จัดส่งเข้ารหัสใน Payee vault

## CR-09 · 06/10/2026 — Dashboard · Campaign & Phase · Deals · Payments refine · role Accounting
schema **8 → 9** · tests **380**
- Dashboard All campaigns 5 KPI · Activity · KOL tier mix · Export ทุก widget · Days left
- Payments tabs To pay / Payment runs / Accounting · Return to team · role **Accounting**

## CR-08 · 06/10/2026 — Payments module
schema **7 → 8** · tests **349**
- Payment line รายงวด · Payment run (PR) · VAT / WHT · Payee details เข้ารหัส (vault) · Export PR (.xlsx) · ใบ 50 ทวิ

## CR-07 · 06/10/2026 — Dashboard refine · Clear all filters · Price reference · KOL Type presets · Journey timeline
schema **6 → 7** · tests **306**
- Operations เลือก PIC ก่อน · Clear all filters · Price reference แทน prefill ราคา · Copy ชื่อ KOL

## CR-06 · 06/10/2026 — Campaign Products · Phase Planner · KOL Performance · Deals flow ใหม่ · Responsive
schema **5 → 6** · tests **269**
- สินค้าของ Campaign / deal · Phase Planner แบ่งตามจำนวน · KOL Performance + Last worked · Pipeline drag & drop

## CR-05 · 05/10/2026 — KOL Manager + View as role · combobox · Phase Planner · นิยามเงิน · Dashboard 3 tabs
schema **4 → 5** · tests **228**
- role KOL Manager · ไม่มี ID บนจอ · Budget → Committed → Used % → Remaining → Pending · Campaign On hold / Cancelled

## CR-04 · 05/10/2026 — Side menu · Deal tier + Group by · Role Management · แก้ Deal ราย section
schema **3 → 4** · tests **204**
- users / roles · field lock · ค่าเริ่มต้น PIC / CTA / Payment term

## CR-03 · 05/10/2026 — Phase จากวันโพสต์ · งบ Campaign เป็น % · Pillar + Allocation
schema **2 → 3** · tests **177**

## CR-02 · 05/10/2026 — Deals · Journey ตามแผน · Payment term · Campaign & Phase Timeline
schema **1 → 2** · tests **132**

## CR-01 + UI Revise Prompt A, B · 05/10/2026
HTML ล้วน (ดับเบิลคลิก `index.html`) · Deals / KOL Master / Campaign & Phase / Settings / Overview · ข้อมูลใน localStorage · Backup / Restore
