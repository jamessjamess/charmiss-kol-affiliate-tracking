# CHANGELOG — Charmiss KOL Tracker

ฉบับย่อ: CR ละไม่กี่บรรทัด · รายละเอียดเต็ม (ไฟล์ · ฟังก์ชัน · การตัดสินใจ) อยู่ที่ `docs/archive/CHANGELOG-full-2026-10-07.md` · spec ของแต่ละ CR อยู่ที่ `docs/CR-xx.md`

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
