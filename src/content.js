/* content.js — every on-screen string for KOL Tracker. UI labels are English; toasts and validation messages are Thai. → KT.content */
window.KT = window.KT || {};
KT.content = (function () {
  'use strict';

  const C = {
    app: {
      title: 'Charmiss KOL Tracker',
      darkMode: 'Dark mode', lightMode: 'Light mode', more: 'More',
      backup: 'Backup data', restore: 'Restore data', exportAll: 'Export all CSV',
      mainMenu: 'Main menu', openMenu: 'Open menu', collapseMenu: 'Collapse menu', expandMenu: 'Expand menu',
    },

    /* CR-04 §4.1 — side menu, in this order · key = the screen · route = the hash */
    tabs: [
      { key: 'overview', route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { key: 'campaign', route: 'campaigns', label: 'Campaign & Phase', icon: 'campaign' },
      { key: 'deals', route: 'deals', label: 'Deals', icon: 'deals' },
      { key: 'payments', route: 'payments', label: 'Payments', icon: 'payments' },   // CR-08
      { key: 'shipments', route: 'shipments', label: 'Shipments', icon: 'shipments' },   // CR-11 §4.10
      { key: 'kol', route: 'kols', label: 'KOL Master', icon: 'kol' },
      { key: 'settings', route: 'settings', label: 'Settings', icon: 'settings' },
      { key: 'roles', route: 'roles', label: 'Role Management', icon: 'roles' },   // admin only
    ],

    /* CR-05 §4.6 — Operations: the issue of a deal in a queue */
    ops: {
      issueOverdue: (step, date, n) => `${step || 'Next step'} due ${date} · ${n}d late`, issueUnpaid: (date, n) => `Posted ${date} · ${n} days unpaid`, issueUnpaidNoDate: 'Posted · not paid',
      issueBeforeBrief: t => `${t}: payment is due before the brief`, issueTerm: 'No payment term', issuePillar: 'No pillar',
      issueNoDate: n => `${n} post${n === 1 ? '' : 's'} without a post date`, issueNeeds: n => `${n} post${n === 1 ? '' : 's'} need a phase`, issueOutside: d => `Post date ${d} is far from the campaign`,
    },

    /* CR-05 §4.5 — the money words, the same on every page (ⓘ popovers) */
    money: {
      budget: { h: 'Budget', d: 'The KOL budget of the Campaign — or of the Phases when you look at Phases.' },
      committed: { h: 'Committed', d: 'Money of deals that reached Confirm QT or later and are not cancelled. This is what the budget is used for.', f: 'Sum of deal totals · Confirm QT onward · not cancelled' },
      used: { h: 'Used %', d: 'How much of the budget is committed.', f: 'Committed ÷ Budget' },
      remaining: { h: 'Remaining', d: 'Budget left after what is committed. Below zero (red) means over budget.', f: 'Budget − Committed' },
      pending: { h: 'Pending', d: 'Money of deals still at Shortlist or Contacted — not confirmed yet, so not counted as using the budget.', f: 'Sum of deal totals · Shortlist / Contacted' },
      paid: { h: 'Paid (est.)', d: 'Estimated money paid: a fully paid deal counts in full, a 50% deposit counts half.' },
      outstanding: { h: 'Outstanding', d: 'What is still to pay on committed deals (Confirm QT or later, not cancelled).', f: 'Committed − Paid (est.)' },
    },

    /* CR-05 §4.4 — Phase Planner */
    planner: {
      newTitle: 'New campaign', title: n => `Plan phases · ${n}`, sub: 'Phase Planner', planPhases: 'Plan phases', chooseTitle: 'New phase', next: 'Next',
      createCampaign: 'Create campaign', savePhases: 'Save phases', campaignThing: 'Campaign', chooseSub: 'Pick the Campaign — its Phase Planner opens with a new row',
      secCampaign: 'Campaign', secPhases: 'Phases', secTimeline: 'Timeline', secImpact: 'Impact on posts',
      /* CR-06 §4.2 */
      period: 'Campaign period', periodHint: 'Helps plan the phases · not saved', count: 'Number of phases', fewer: 'Fewer phases', more: 'More phases',
      splitDates: 'Split dates evenly', splitDatesTip: 'Cut the campaign period into equal back-to-back phases', allocation: 'Allocation',
      presetEven: 'Even', presetLaunch: 'Launch-heavy 20 / 65 / 15', presetCustom: 'Custom', renumber: (a, b) => `${a} will become ${b}`,
      unit: 'Budget as', colName: 'Phase', colLabel: 'Label', labelPh: 'Optional, e.g. Launch', colStart: 'Start', colEnd: 'End', colPeriod: 'Period', colDays: 'Days', colBudgetPct: 'Budget %', colBudgetAmt: 'Budget ฿', colAmount: 'Amount', colPct: '% of campaign',
      add: '+ Add phase', fill: 'Fill remaining', fillTip: 'The row you are in gets what is not allocated yet',
      dup: 'Duplicate', del: 'Delete', hasPosts: "Has posts — can't delete", copyLabel: n => (n ? `${n} (copy)` : ''),
      allocated: (a, b, p) => `Allocated ${a} of ${b} (${p}%)`, allocatedNoBudget: a => `Allocated ${a} · no campaign budget`, unallocated: x => `Unallocated ${x}`, overBy: x => `Over budget by ${x}`,
      saveAnywayTitle: 'Save anyway?', saveAnyway: 'Save anyway', saved: n => `บันทึกแผน ${n} แล้ว`,
      noDates: 'Add dates to see the timeline', allPhases: 'All phases', overlapTip: (a, b) => `Overlap ${a} – ${b}`, gapTip: (a, b) => `No phase ${a} – ${b}`,
      noDateChange: 'No date changed yet', moved: n => `${n} post${n === 1 ? '' : 's'} will move phase`, noMove: 'No post moves phase',
      toAuto: n => `${n} post${n === 1 ? '' : 's'} go back to the phase of their date`, needs: n => `${n} post${n === 1 ? '' : 's'} will need a phase`,
      colBefore: 'Committed before', colAfter: 'After', total: 'Campaign (incl. pending)',
      /* CR-06 §4.3 */
      fProducts: 'Products', productsHint: 'Products this Campaign sells · a new Campaign needs at least one',
    },

    /* CR-06 §4.4–4.5 — KOL performance (posts on time?) · Last worked */
    perf: {
      colOnTime: 'On-time', colLastWorked: 'Last worked', sec: 'Performance',
      badge: { reliable: 'Reliable', watch: 'Watch', late: 'Late', none: 'Not enough data' },
      badgeLine: (b, pct) => `${b} · ${pct}%`, ofN: (k, n) => `${k} of ${n}`,
      daysAgo: n => (n === 0 ? 'today' : n < 0 ? `in ${-n} day${n === -1 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'} ago`),
      lastAll: 'Last worked: any', last: { m3: 'Last 3 months', m6: '3–6 months', m12: '6–12 months', over: 'Over 1 year', never: 'Never worked' },
      onTime: 'On-time', avgDelay: 'Avg delay', latePosts: 'Late posts', overdueNow: 'Overdue now', avgDrafts: 'Avg draft rounds', completion: 'Completion',
      avgViews: 'Avg views / post', er: 'ER', cpv: 'CPV', days: n => `${Math.round(n * 10) / 10} day${n === 1 ? '' : 's'}`, plusDays: n => `+${n} day${n === 1 ? '' : 's'}`,
      lateTitle: 'Late posts', colWhere: 'Campaign › Phase', colExpected: 'Expected', colPosted: 'Posted', colLate: 'Late by',
      noLate: 'No late posts', noData: 'No post has both an expected and a post date yet', postsOf: (k, n) => `${k} of ${n} posts on time`,
      info: { h: 'On-time', d: (g, m) => `A post is on time when it is posted by its expected post date + ${g} day${g === 1 ? '' : 's'} grace. Reliable ≥ 90% · Watch 70–89% · Late below 70% · Not enough data with fewer than ${m} measured posts. Cancelled deals are left out.`,
        f: 'Posts on time ÷ posts with both an expected and a post date' },
      navSettings: 'KOL performance', grace: 'Grace days', graceHint: 'Days after the expected post date that still count as on time',
      minPosts: 'Minimum posts', minPostsHint: 'Fewer measured posts than this = Not enough data',
      checkpoints: 'Metrics checkpoints (days after the post)', checkpointsHint: 'e.g. 7 or 7, 30 — a post is Due on these days until numbers are saved on or after the day', saved: 'บันทึกเกณฑ์ KOL performance แล้ว',
    },

    /* CR-06 §4.3 — product catalog (TR codes from TRCLOUD) · products of a Campaign · products of a deal */
    products: {
      title: 'Products', colCode: 'TR code', colName: 'Product name', colVariant: 'Variant', colUsed: 'Used in campaigns', colActive: 'Active',
      hint: 'TR codes from TRCLOUD. A product used by a Campaign or a deal cannot be deleted — switch it off instead.',
      add: '+ Add product', importCsv: 'Import CSV', search: 'Search TR code or name', empty: 'No products yet', noMatch: 'No products match',
      codePh: 'TR code', namePh: 'Product name', variantPh: 'Variant (optional)', del: 'Delete', usedIn: n => `${n} campaign${n === 1 ? '' : 's'}`, unused: 'not used',
      inUse: (c, d) => `Used by ${c} campaign${c === 1 ? '' : 's'} and ${d} deal${d === 1 ? '' : 's'} — switch it off instead`, codeFixed: 'TR code cannot be changed',
      saved: 'บันทึกสินค้าแล้ว', added: c => `เพิ่มสินค้า ${c} แล้ว`, deleted: c => `ลบสินค้า ${c} แล้ว`,
      importTitle: 'Import products from CSV', importSample: 'Download sample file', importCols: cols => `CSV columns: ${cols} (the TRCLOUD export)`,
      importKind: { new: 'New', update: 'Update name', same: 'No change', duplicate: 'Duplicate', error: 'Cannot import' },
      importSummary: c => `New ${c.new} · Update name ${c.update} · No change ${c.same} · Duplicate ${c.duplicate} · Cannot import ${c.error}`,
      importApply: 'Import', importRow: 'Row', importNoRows: 'No data rows in this file', importDone: c => `นำเข้าสินค้าแล้ว: ใหม่ ${c.new} · เปลี่ยนชื่อ ${c.update} · ข้าม ${c.same + c.duplicate + c.error}`,
      pickerPh: 'Search TR code or product name', pickerNoMatch: q => `No product matches '${q}'`, newProduct: '+ New product', newTitle: 'New product', createProduct: 'Create product', thing: 'Product',
      remove: 'Remove', usedByDeals: n => `Used by ${n} deal${n === 1 ? '' : 's'}`, inactiveTag: 'off',
      removeUsedTitle: name => `Remove ${name}?`, removeUsedBody: n => `${n} deal${n === 1 ? '' : 's'} use this product. Remove anyway? (those deals keep it)`, removeAnyway: 'Remove',
      noProductsChip: 'No products', noProductsTip: 'This Campaign has no products yet — add them with Plan phases or Edit',
      dealAdd: '+ Add product', dealChoose: 'Choose a product', qty: 'Qty', dealNone: 'No products selected', dealNoCampaignProducts: 'This Campaign has no products yet',
      line: (n, m) => `Products: ${n} item${n === 1 ? '' : 's'} · ${m} unit${m === 1 ? '' : 's'} planned`,
      addProducts: 'Add products', dealsN: n => `${n} deal${n === 1 ? '' : 's'}`,
    },

    /* CR-05 §4.3 — searchable combobox */
    combo: { noCampaign: q => `No campaign matches '${q}'`, noPhase: q => `No phase matches '${q}'`, noPic: q => `No PIC matches '${q}'` },

    /* CR-07 §4.6 — KOL Type presets (lookups.kol_type_list) */
    kolTypes: {
      notSet: 'Not set', inactiveLabel: l => `${l} (inactive)`, oldTypeNote: v => `Old type: ${v}`, oldValue: v => `Old value: ${v}`,
      labelRequired: 'ใส่ชื่อ Type', labelTaken: l => `"${l}" เป็นชื่อหรือคำค้นของ Type อื่นแล้ว`, aliasTaken: a => `คำ "${a}" เป็นของ Type อื่นแล้ว`,
      hint: 'The Type list of KOL Master. Aliases are the old words (and import values) that mean this type. Drag a row (or use ↑ ↓) to change the order.',
      colLabel: 'Label', colAliases: 'Aliases', colKols: 'KOLs', colActive: 'Active', add: '+ Add type', addTitle: 'New KOL type', addOk: 'Add type', addPh: 'New type label', aliasesPh: 'Aliases, comma-separated',
      del: 'Delete', inUse: n => `${n} KOL${n === 1 ? '' : 's'} use this type — deactivate it instead`, saved: 'บันทึก KOL types แล้ว', added: l => `เพิ่ม Type ${l} แล้ว`, deleted: l => `ลบ Type ${l} แล้ว`,
      moveUp: 'Move up', moveDown: 'Move down', drag: 'Drag to reorder',
      importUnknown: v => `Type not recognised: ${v} → moved to note`,
    },
    /* CR-07 §4.9 — the Journey timeline (like an SLA) and the payment track */
    journey: {
      took: n => `⏱ ${n} d`, late: n => `+${n} d late`, overdue: n => `${n} d overdue`, waiting: n => `Waiting ${n} d`, due: d => `Due ${d}`,
      dateNotRecorded: 'Not recorded', cancelled: d => (d ? `Cancelled ${d}` : 'Cancelled'), briefToPost: n => `Brief → Post: ${n} d`, inProgress: n => `In progress ${n} d since Brief`,
      passedOn: d => `Passed ${d}`, expected: d => `Expected ${d}`, by: n => `By ${n}`, noExpected: 'No expected date', notYet: 'Not reached yet',
      state: { done: 'Done', late: 'Done late', nodate: 'Done (no date)', current: 'In progress', upcoming: 'Upcoming', overdue: 'Overdue', cancelled: 'Cancelled' },
      before_brief: 'Before Brief', after_post: 'After Post', payment: 'Payment',
    },
    /* CR-07 §4.8 — copy a KOL name */
    copy: { name: 'Copy name', aria: n => `Copy name ${n}`, copied: n => `Copied: ${n}`, failed: "Couldn't copy" },
    /* CR-14 §4.2 — ui.multiSelect */
    ms: { search: 'Search', noMatches: 'No matches', selectAll: 'Select all', clear: 'Clear', reset: 'Reset', nSelected: n => `${n} selected` },
    /* CR-07 §4.5 — costs are typed by hand, next to a Price reference */
    priceRef: {
      title: 'Price reference', latest: 'Latest rate', average: 'Average of past deals', use: 'Use', useTip: l => `Fill the five costs with ${l}`,
      dateNotRecorded: 'Date not recorded', noRate: 'No rate on file', noPaid: 'No paid deals yet', note: n => `Note: ${n}`,
      deals: n => `${n} deal${n === 1 ? '' : 's'}`, freeExcluded: n => `${n} free job${n === 1 ? '' : 's'} excluded`,
      info: { h: 'Average of past deals', d: 'Average of agreed prices (Confirm QT onward). Free jobs, ฿0 jobs and cancelled deals are excluded.' },
      rows: { rate_card: 'Rate card', gencode_expense: 'Gencode', basket_fee: 'Basket fee', asset_fee: 'Asset fee', expediting_fee: 'Expediting fee', total: 'Total' },
      replaceTitle: 'Replace current costs?', replaceBody: 'ค่าที่กรอกไว้จะถูกแทนด้วยค่าจากคอลัมน์นี้ (แก้ต่อได้)', replace: 'Replace',
      freeTip: 'Payment term is Free — nothing to fill',
      summaryLatest: x => `Latest rate ${x}`, summaryAvg: (x, n) => `Average ${x} (${n} deal${n === 1 ? '' : 's'})`,
      costNotSet: 'Cost not set', costs: 'Costs', zeroPh: '0',
      zeroTitle: 'Total is ฿0', zeroBody: 'Enter costs or set Payment term to Free.', zeroContinue: 'Continue',
    },

    /* CR-04 §4.5 — why a field cannot be edited (tooltip of 🔒) */
    lock: {
      systemId: 'System ID', kol: "KOL can't be changed. Cancel this deal and create a new one.",
      campaignAdmin: 'Only an admin or a KOL Manager can move a deal to another Campaign', campaignFixed: 'Has posts / confirmed — create a new deal instead',
      moveStage: 'Use Move stage', viewOnly: 'View only', cancelled: 'Cancelled — reopen with Move stage first', notCancelled: 'Only for cancelled deals',
      fullyPaid: 'Fully paid', paymentRecorded: 'Payment recorded — ask an admin or a KOL Manager', paymentRecordedAdmin: 'Payment recorded — a reason is needed to change costs',
      setByMove: 'Set by Move stage', campaignCancelled: 'The campaign is cancelled', postHasLink: 'Delete this post and add a new one', autoPhase: 'Auto from post date', imported: 'Imported record', auto: 'Auto',
    },

    /* CR-04 §4.4 — users and roles (on-screen permissions of this file) */
    roles: {
      title: 'Role Management', addUser: '+ Add user',
      disclaimer: 'Roles control what each person sees and can edit in this file. They are not a security control — anyone with the file can change data. Real access control comes with the online version.',
      colName: 'Name', colEmail: 'Email', colRole: 'Role', colPic: 'PIC', colStatus: 'Status', colDeals: 'Deals as PIC', colLast: 'Last active',
      role: { admin: 'Admin', kol_manager: 'KOL Manager', staff: 'Staff', viewer: 'Viewer', accounting: 'Accounting' },
      viewAsRole: 'View as role', viewingAs: r => `Viewing as ${r}`, viewingAsCard: (n, r) => `${n} · viewing as ${r}`, backTo: r => `Back to ${r}`,
      active: 'Active', inactive: 'Inactive', you: 'You', never: 'No changes yet',
      noAccess: "You don't have access to this page", noPermission: 'สิทธิ์ของคุณทำรายการนี้ไม่ได้',
      systemImport: 'System import', byLine: n => `by ${n}`,
      switchUser: 'Switch user', switched: n => `ตอนนี้ใช้งานในชื่อ ${n}`,
      newTitle: 'New user', editTitle: n => `Edit ${n}`, addOk: 'Add user', thing: 'User', edit: 'Edit', userTag: 'User', secDetails: 'Details',
      fName: 'Name', fEmail: 'Email', emailPh: 'name@lomr.co.th', fRole: 'Role', fIsPic: 'Is PIC', fIsPicHint: 'Shows in every PIC dropdown',
      fPicName: 'PIC name', fPicNameHint: 'The name on deals and KOLs (default = Name)', fActive: 'Active', fActiveHint: 'Inactive users leave the dropdowns; their name stays on old records',
      reassign: 'Reassign PIC…', reassignTitle: (n, from) => `Reassign ${n} open deals of ${from}`, reassignTo: 'New PIC', reassignOk: 'Reassign',
      reassignAsk: (n, from, to) => `ย้าย PIC ของ ${n} deals ที่ยังไม่ปิดจาก ${from} ไปเป็น ${to}?`, reassigned: (n, to) => `ย้าย ${n} deals ไปให้ ${to} แล้ว`,
      renameTitle: 'Rename PIC', renameBody: (a, b, d, k) => `เปลี่ยนชื่อ PIC "${a}" เป็น "${b}" ใน ${d} deals และ ${k} KOLs?`, renameOk: 'Rename',
      saved: n => `บันทึก ${n} แล้ว`,
      permTitle: 'Permissions', permAction: 'Action',
      perm: { view: 'See every page (except Role Management) · Export CSV · Backup', 'deal.edit': 'Create / edit deals, posts, Move stage, payment, PIC inline, Set pillar',
        'kol.edit': 'Create / edit KOLs, accounts, rates · Import KOL CSV', 'deal.money': "Change costs after a payment (with a reason) · move a deal to another Campaign",
        'kol.merge': 'Merge KOL · delete deals / KOLs', 'campaign.products': 'Campaign products · + New product (into the catalog)', 'campaign.edit': 'Approve / Reject Campaigns & Phases (CR-17) · change budget, period, pillar target and phases at once · On hold / Cancelled',
        'settings.lists': 'Settings › Lists (Journey steps, Pillar, CTA, Platform) · Pillar targets · Products', 'settings.tiers': 'Settings › Tier rules',
        'data.restore': 'Restore / Reset to seed', roles: 'Role Management',
        /* CR-08 §4.9 */
        'payee.edit': 'Payee section: type / tax · documents · enter / replace bank details (encrypted) — Staff: their own KOLs / payees',
        'payment.request': 'Hold / Release a payment · manual line — Staff: deals they are the PIC of',
        'payee.unlock': 'Unlock payee details (see them in full) · Export PR with payee details', 'payee.verify': 'Mark bank details as verified',
        'vault.admin': 'Payee vault: set up · change passphrase · reset', 'payee.import': 'Import payee details (CSV)',
        'payment.run': 'Payment runs: create · add / remove lines · edit amount · submit · export PR', 'payment.paid': 'Mark paid · mark paid outside the app · Return to team · WHT certificate sent · WHT summary · close run',
        'payment.reopen': 'Reopen a run · undo Paid', 'settings.payments': 'Settings › Payments',
        'golive.run': 'Go-live clean-up: run it · Apply · Undo', 'golive.view': 'Go-live clean-up: see the payments step (read only)',
        'shipment.edit': 'New shipment · items · ship-by date · Mark as not required — Staff: deals they are the PIC of, shipments they made',
        'shipment.ship': 'Create pick list · Mark shipped / delivered · Report problem (every shipment)', 'shipment.settings': 'Settings › Shipments' },
      modules: { dashboard: 'Dashboard', deals: 'Deals · Campaign & Phase', shipments: 'Shipments', payments: 'Payments', kol: 'KOL Master', settings: 'Settings' },   // CR-11 §4.13 #8
      managePic: 'Manage PIC in Role Management', settingsReadOnly: 'Only an admin or a KOL Manager can change these lists', tiersReadOnly: 'Only an admin can change Tier rules',
    },

    common: {
      save: 'Save', cancel: 'Cancel', close: 'Close', none: '—',
      ok: 'Ready to save',
      blockWhileEditing: 'Save or cancel the edit first',
      savedToast: label => `บันทึก ${label} แล้ว`,
      deletedToast: label => `ลบ ${label} แล้ว`,
      days: n => `${n} days`,
      error: msg => `เกิดข้อผิดพลาด: ${msg} — ลองโหลดหน้าใหม่ ถ้ายังเป็นอยู่ให้กด Backup แล้วแจ้งทีม`,
      allOf: id => `All ${id}`,
      datePh: 'dd/mm/yyyy', pickDate: 'Pick a date',
      about: 'About this number',
      discardTitle: 'Discard changes?', discardBody: 'What you typed and did not save will be lost.', discard: 'Discard', keepEditing: 'Keep editing', back: 'Back',
      /* CR-11 §4.2 — after Create: "<Thing> created · Open" */
      created: thing => `${thing} created`, open: 'Open',
      /* CR-07 §4.4 — the chip row of Deals and KOL Master */
      clearAllFilters: 'Clear all filters', removeFilter: t => `Remove ${t}`, searchChip: q => `Search: “${q}”`, filtersUsed: 'Filters in use:',
      /* CR-07 §4.7 — the KOL drawer's left edge */
      resizeDrawer: 'Drag to resize · double-click for half the screen',
    },

    banner: {
      cannotSave: 'บันทึกลงเครื่องไม่ได้ — กด Backup ก่อนปิดหน้า',
      cannotSaveDetail: 'เบราว์เซอร์ไม่ยอมให้เก็บข้อมูล (อาจเปิดแบบส่วนตัว/Incognito หรือพื้นที่เต็ม) การแก้ไขจะหายเมื่อปิดหน้านี้',
      corrupt: 'ข้อมูลที่เก็บในเครื่องอ่านไม่ได้ จึงโหลดข้อมูลตั้งต้นแทน (เก็บสำเนาข้อมูลเดิมไว้แล้ว) — ถ้ามีไฟล์ Backup ให้กด Restore',
      otherTab: 'ข้อมูลถูกแก้จากอีกแท็บหนึ่ง — โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด',
      reload: 'Reload', backupNow: 'Backup now',
      firstLoad: 'โหลดข้อมูลตั้งต้นแล้ว',
    },

    counts: { campaigns: 'Campaigns', phases: 'Phases', kol_master: 'KOLs', kol_accounts: 'Accounts', kol_rate_quotes: 'Rates', deals: 'Deals', deal_posts: 'Posts', deal_status_log: 'Status log', deal_events: 'Change log', users: 'Users', campaign_events: 'Campaign log', products: 'Products', campaign_products: 'Campaign products', deal_products: 'Deal products', kol_packages: 'Packages', step_notes: 'Draft notes',
      payee_profiles: 'Payees', payment_lines: 'Payment lines', payment_runs: 'Payment runs' },

    /* CR-08 — Payments (R1: settings) */
    pay: {
      set: { title: 'Tax & payment runs', vat: 'VAT rate (%)', threshold: 'WHT threshold (฿)', thresholdHint: 'WHT is withheld from this amount (gross) up', rates: 'WHT rates (%)', ratesHint: 'Comma-separated, e.g. 0, 1, 2, 3, 5',
        defInd: 'Default WHT · Individual', defCo: 'Default WHT · Company', band1: 'Amount ranges · first limit (฿)', band2: 'Amount ranges · second limit (฿)', bandsHint: 'Payment runs group lines: under band 1 · band 1 – band 2 · band 2 and above',
        weekday: 'Payment run day', accounting: 'Confirm tax settings with Accounting.', saved: 'บันทึก Payment settings แล้ว' },
      weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      milestone: { deposit: 'Deposit', final: 'Final', full: 'Full', manual: 'Manual', package: 'Package', extras: 'Extras' },
      /* CR-08 §4.2 / §4.5 — Payments page · To pay */
      title: 'Payments', tabs: { topay: 'To pay', runs: 'Payment runs', accounting: 'Accounting' },
      /* CR-09 §4.15 — who uses each tab · the Accounting tab */
      tabTip: { topay: 'Which instalments are due and what is missing', runs: "What is in this Friday's run and has it gone to Accounting", accounting: 'What to transfer and which WHT certificates to send' },
      createRun: 'Create payment run', createRunTitle: n => (n ? `Create a payment run · ${n} line${n === 1 ? '' : 's'}` : 'New payment run'), createRunOk: 'Create run', runThing: 'Payment run', csvTip: 'To send to Accounting, create a payment run',
      submitAcc: 'Submit to Accounting', returnToTeam: 'Return to team', returnTitle: id => `Return ${id} to the team`, returnedDone: id => `ส่ง ${id} คืนทีมแล้ว`,
      returnedBanner: (who, d, why) => `Returned by ${who} on ${d} — ${why}`, openInAcc: 'Open in Accounting', backToAcc: 'Accounting',
      runFilterAll: 'All but Closed', statusL: 'Status',
      accCards: { transfer: n => `To transfer · ${n} run${n === 1 ? '' : 's'}`, wht: 'WHT certs to send', paid: 'Paid this month' },
      runsToPay: 'Runs to pay', noRunsToPay: 'No run is waiting for Accounting', whtCerts: 'WHT certificates', noWhtToSend: 'Every WHT certificate has been sent', paidSec: 'Paid',
      markSent: 'Mark sent', sendTo: 'Send to', sendToLocked: 'Unlock to see', open: 'Open', outsidePickTitle: 'Mark paid outside the app — pick the lines',
      dueNow: 'Due now', inRuns: 'In runs', paidMonth: 'Paid this month',
      pic: 'PIC', campaign: 'Campaign', allCampaigns: 'All campaigns', source: 'Source', allSources: 'All', sources: { deal: 'Deals', affiliate: 'Affiliate', other: 'Other', legacy: 'Paid outside app', package: 'Package' },
      search: 'Search KOL, @handle or payee ID', cards: { ready: 'Ready', missing: 'Missing docs', hold: 'On hold', upcoming: 'Upcoming 14 days', check: 'Needs check' },
      groupBy: { readiness: 'Readiness', amount: 'Amount', pic: 'PIC', campaign: 'Campaign' }, csv: 'Payments CSV',
      /* CR-09 §4.14 — Amount ranges · fold · one Status column */
      amountUnder: x => `Under ${x}`, amountFrom: x => `${x} and above`, amountNote: ['No WHT', '', 'Separate approval'], expandAll: 'Expand all', collapseAll: 'Collapse all',
      missingN: n => `Missing ${n}`, rowMenu: 'More', openDeal: 'Open deal', payeeDetails: 'Payee details', missingTitle: 'Missing',
      status: { not_due: 'Not due', missing_docs: 'Missing docs', ready: 'Ready', on_hold: 'On hold', in_run: 'In run', submitted: 'With Accounting', paid: 'Paid', cancelled: 'Cancelled' },
      postEvidence: 'Post evidence', noCampaign: 'No campaign', empty: 'Nothing to pay here',
      /* CR-11 §4.9 — no Request step: owed + documents = Ready · Hold when it should not be paid yet */
      hold: 'Hold', release: 'Release', holdTitle: (n, m) => `Hold · ${n} · ${m}`, holdOk: 'Hold', holdReasonL: 'Reason', holdPh: 'Work not finished · waiting for a fix · a new amount…',
      holdHint: 'It stays in To pay, marked On hold, and cannot go into a run until it is released.', heldDone: n => `พักการจ่าย ${n} แล้ว`, releasedDone: n => `ปล่อย ${n} กลับเข้าคิวแล้ว`,
      holdNoRun: 'On hold — release it before adding it to a run', heldBy: (who, d) => `Held by ${who} · ${d}`,
      sumReady: 'Ready', sumMissing: 'Missing docs', sumHold: 'On hold', statusAll: 'Owed now',
      filterStatus: { ready: 'Ready', missing: 'Missing docs', hold: 'On hold', upcoming: 'Upcoming 14 days', check: 'Needs check' },
      runSearch: 'Search run no. or KOL', accSearch: 'Search run no. or KOL', payDateRange: 'Pay date', view: 'View',
      accViews: { transfer: 'To transfer', wht: 'WHT certs to send', paid: 'Paid' },
      emptyTopay: 'Nothing is owed right now', noRunsStatus: st => `No runs ${st === 'Closed' ? 'closed yet' : st === 'With Accounting' ? 'with Accounting' : `in ${st}`}`, noRunsMatch: 'No runs match these filters',
      noTransfer: 'No runs with Accounting', noWhtMatch: 'No WHT certificates match these filters',
      holdOnlyPic: 'Only Admin, KOL Manager or the PIC of this deal can hold or release this payment',   // CR-11 §4.9: no Request step
      termNotSet: 'Term not set', termNotSetTip: 'Paid in full when the deal is Complete — set the payment term on the deal',
      groupLine: (n, g, w, net) => `${n} line${n === 1 ? '' : 's'} · Gross ${g} · WHT ${w} · Net ${net}`, totalLine: n => `Total · ${n} line${n === 1 ? '' : 's'}`,
      col: { kol: 'KOL', campaign: 'Campaign › Phase', milestone: 'Milestone', due: 'Due', gross: 'Gross', wht: 'WHT', net: 'Net', docs: 'Docs', status: 'Status', pic: 'PIC', issue: 'Issue' },
      noChecks: 'Nothing to check', checks: { zero: '฿0 deal — enter its costs or set the term to Free', paid_cancelled: 'Paid on a cancelled deal' },
      bankFromPayee: 'Bank details come from the payee — nothing to type here',
      agreed: 'Agreed amount (฿)', whtRate: 'WHT rate', payTo: 'Pay to', payToPayee: 'Payee', payToReimburse: 'Reimburse staff', reimburseUser: 'Staff who paid', chooseUser: 'Choose a person',
      note: 'Note', vat: 'VAT', borne: x => `WHT borne by company ${x}`,
      noRuns: 'No payment runs yet', noHistory: 'No payments yet', noHistoryMatch: 'No paid lines match these filters',
      /* CR-08 §4.6 — runs */
      /* CR-08 §4.8 — history · WHT certificates · manual lines */
      paidDate: 'Paid date', allRunsOpt: 'All', whtSummary: 'WHT summary (CSV)', whtNotSent: 'WHT cert not sent', whtCert: 'WHT cert', notSent: 'Not sent', markWhtSent: 'Mark WHT cert sent',
      markWhtSentTitle: n => `Mark WHT certificate sent · ${n} line${n === 1 ? '' : 's'}`, sentOn: 'Sent on', whtSentDone: n => `บันทึกส่งใบ 50 ทวิ ${n} รายการ`,
      addManual: '+ Add manual line', manualTitle: 'Add manual line (Affiliate / Other)', payee: 'Payee', choosePayee: 'Choose a payee', newPayee: '+ New payee',
      projectPh: 'When there is no Campaign', addManualOk: 'Add line', manualAdded: id => `เพิ่ม ${id} แล้ว`,
      paidOutside: 'Mark paid outside app', outsideTitle: n => `Mark ${n} line${n === 1 ? '' : 's'} paid outside the app`, outsideHint: 'For work already paid before Payments — no run is made, the deals are updated.',
      noteRequired: 'ใส่หมายเหตุ', outsideDone: n => `บันทึกจ่ายนอกแอป ${n} รายการ`, cancelLine: 'Cancel line', cancelTitle: n => `Cancel ${n} line${n === 1 ? '' : 's'}`, cancelledN: n => `ยกเลิก ${n} รายการ`,
      dealCancelled: 'Deal cancelled',
      checkGroups: { term: names => `Payment term not set on the deal: ${names}`, big: names => `10,000 and above — Accounting to confirm: ${names}` },
      runStatus: { draft: 'Draft', returned: 'Returned', with_accounting: 'With Accounting', submitted: 'With Accounting', paid: 'Paid', closed: 'Closed' }, newRun: '+ New run', newRunOn: (d, dm) => `New run · ${d} ${dm}`, addToRun: 'Add to run',
      payDate: 'Pay date', preparedBy: 'Prepared by', lines: 'Lines', allRuns: 'All runs', addLines: 'Add lines', exportPr: 'Export PR', submit: 'Submit', fixErrors: 'Fix the ✕ items first',
      markPaid: 'Mark paid', markPaidSel: 'Mark selected paid', reopen: 'Reopen as Draft', closeRun: 'Close run', runEmpty: 'No lines in this run yet',
      no: 'No.', project: 'Project', account: 'Account', type: 'Type', printed: 'Printed', bandLine: (n, g, v, w, net) => `${n} line${n === 1 ? '' : 's'} · Gross ${g} · VAT ${v} · WHT ${w} · Net ${net}`,
      removeFromRun: 'Remove from run', editAmount: 'Edit amount', moveBack: 'Move back to To pay', undoPaid: 'Undo Paid', reason: 'Reason', reasonRequired: 'ใส่เหตุผล',
      runCreated: id => `สร้าง ${id} แล้ว`, addedToRun: (n, id) => `เพิ่ม ${n} รายการเข้า ${id} แล้ว`, submitted: id => `Submit ${id} แล้ว`, markPaidTitle: (n, id) => `Mark ${n} line${n === 1 ? '' : 's'} paid · ${id}`,
      paidOnDate: 'Paid on', paidDone: n => `บันทึกจ่ายแล้ว ${n} รายการ`, removed: 'เอาออกจาก run แล้ว', movedBack: 'ย้ายกลับไป To pay แล้ว', undone: 'ยกเลิก Paid แล้ว', reopened: 'เปิด run เป็น Draft อีกครั้งแล้ว',
      closed: id => `ปิด ${id} แล้ว`, editAmountTitle: n => `Edit amount · ${n}`, amountSaved: 'บันทึกยอดแล้ว',
      exportTitle: id => `Export PR · ${id}`, exportLocked: 'Payee details are locked. Unlock to fill name, address, phone, WHT contact, bank and account number — or export without them.',
      exportWithout: 'Export without payee details', unlockExport: 'Unlock and export', exported: f => `ดาวน์โหลด ${f} แล้ว`, missingBankN: n => `Missing bank details: ${n}`,
      dealPay: 'Instalments', dealPayNone: 'Nothing to pay on this deal', run: 'Run', paidOn: 'Paid', paidFromPayments: 'Docs and payments are recorded in Payments (they update this deal)',
      /* CR-08 §4.7 — the PR file (headers in Thai, as Accounting uses them) */
      prCols: ['No.', 'Project', 'ชื่อ Account', 'Type', 'ชื่อ-นามสกุล', 'ที่อยู่ตามบัตรประชาชน', 'เบอร์โทรศัพท์', 'Email หรือ ที่อยู่ สำหรับส่งใบ WHT', 'ส่งแล้ว (Earn)', 'ธนาคาร', 'เลขบัญชี',
        'จำนวนเงิน', 'VAT 7%', 'WHT', 'WHT rate', 'จำนวนเงินที่ต้องชำระ', 'Link (สำเนาบัตร หน้า Bookbank หลักฐานการลงคลิปพร้อมวันที่ลงงาน)', 'PIC', 'Print (สำหรับดรีม)', 'Payee ID', 'Line ID'],
      prSheet: ['ยอดน้อยกว่า 1,000', 'ยอด 1,000-9,999', 'ยอด 10,000 ขึ้นไป'], prTotal: 'รวม', prRunLine: (id, d) => `รอบจ่าย: ${id} · วันจ่าย ${d}`, prReimburse: n => `Reimburse: ${n}`,
      prSummary: { title: 'Payment run', run: 'Run', payDate: 'Pay date', preparedBy: 'Prepared by', head: ['Amount', 'Lines', 'จำนวนเงิน', 'VAT 7%', 'WHT', 'จำนวนเงินที่ต้องชำระ'],
        borne: 'WHT borne by company', noPayee: 'Payee details not included' },
    },
    /* CR-08 §4.4 — Payee profile · Bank details (encrypted) · Documents */
    payee: {
      sec: 'Payee & shipping', title: n => `Payee details · ${n}`, addOk: 'Add payee', newPayeeTitle: 'New payee', handle: 'Payee name / account', handlePh: 'e.g. the affiliate account', none: 'No payee details yet', add: 'Add payee details', edit: 'Edit payee details',
      groupTax: 'Tax & terms', groupBank: 'Bank details', groupBankHint: 'Encrypted in this browser before it is saved — only people with the vault passphrase can read it', groupDocs: 'Documents',
      type: 'Payee type', types: { individual: 'Individual', company: 'Company' }, vat: 'VAT registered', wht: 'Default WHT rate', basis: 'Price basis', bases: { gross: 'Gross (agreed before WHT)', net: 'Net (agreed after WHT — the company bears it)' },
      basisShort: { gross: 'Gross', net: 'Net' }, noVat: 'No VAT', vatShort: 'VAT', whtShort: r => `WHT ${r}%`,
      bank: { account_name: 'Account holder name', bank_name: 'Bank', account_no: 'Account number', full_name: 'Full name (ID card / company name)', id_address: 'Address on ID card / company address',
        phone: 'Phone', wht_contact: 'WHT certificate contact (email or address)', tax_id: 'Tax ID (optional)' },
      docs: { id_copy: 'ID copy', bank_book: 'Bank book', company_cert: 'Company certificate', vat_cert: 'VAT certificate (ภ.พ.20)' }, docsLink: 'Docs folder', docsLinkPh: 'https://drive.google.com/…', openFolder: 'Open folder ↗',
      bankLine: (b, l) => `${b || 'Bank'} ···${l}`, updatedBy: (d, n) => `Updated ${d} by ${n}`, noBank: 'No bank details yet',
      docsOnFile: 'Docs on file', missing: list => `Missing: ${list}`, missingBank: 'Bank details', received: d => `received ${d}`,
      saved: 'Saved', savedLast4: (b, l) => `Saved · ${b || ''} ···${l}`, replace: 'Replace bank details', replaceHint: 'Type the whole set again — the saved details are replaced',
      keepSaved: 'Keep saved details', unlockToView: 'Unlock to view', unlockToEdit: 'Unlock to edit',
      show: 'Show', hide: 'Hide', copyField: l => `Copy ${l}`, copiedField: l => `Copied ${l}`,
      vaultNotSetUp: 'Payee vault not set up', setUpVault: 'Set up vault', noCrypto: "This browser can't encrypt payee details",
      needsVerify: (d, n) => `Bank details changed ${d} by ${n} — verify with KOL`, verifiedBy: (d, n) => `Verified ${d} by ${n}`, markVerified: 'Mark as verified', verified: 'ยืนยันข้อมูลบัญชีแล้ว',
      savedToast: n => `บันทึก Payee ของ ${n} แล้ว`, nothingChanged: 'ไม่มีอะไรเปลี่ยน', encrypting: 'Encrypting…', noPermission: 'Only Admin, KOL Manager or the PIC of this KOL can change payee details',
      banks: ['Kasikorn Bank (KBank)', 'Siam Commercial Bank (SCB)', 'Bangkok Bank (BBL)', 'Krungthai Bank (KTB)', 'Krungsri (BAY)', 'TMBThanachart (ttb)', 'Government Savings Bank (GSB)', 'Kiatnakin Phatra (KKP)', 'UOB', 'CIMB Thai', 'LH Bank', 'BAAC'],
    },
    /* CR-08 §4.4 — Payee vault */
    vault: {
      title: 'Payee vault', notSetUp: 'Not set up', setUpOn: (d, n) => `Set up ${d} by ${n}`, withDetails: n => `${n} payee${n === 1 ? '' : 's'} with bank details`,
      setUp: 'Set up', setUpTitle: 'Set up the payee vault', setUpExplain: 'Bank details are encrypted with this passphrase. Give it only to the people who prepare payment runs and to Accounting — never in chat or a file. It cannot be recovered.',
      pass: 'Passphrase', pass2: 'Type it again', passHint: 'At least 12 characters', passShort: 'ใช้อย่างน้อย 12 ตัวอักษร', passMismatch: 'สองช่องไม่ตรงกัน',
      working: 'Working… (this takes a few seconds)', setUpDone: 'ตั้ง Payee vault แล้ว',
      change: 'Change passphrase', changeTitle: 'Change the vault passphrase', oldPass: 'Current passphrase', newPass: 'New passphrase', changed: 'เปลี่ยน passphrase แล้ว',
      unlock: 'Unlock payee details', unlockTitle: 'Unlock payee details', unlockExplain: 'Locks again after 15 minutes without use, on Switch user or when the page reloads.',
      unlockOk: 'Unlock', wrong: 'Wrong passphrase', unlocked: 'Payee details unlocked', lock: 'Lock', locked: 'ล็อก Payee details แล้ว',
      importBtn: 'Import payee details (CSV)', importTitle: 'Import payee details (CSV)', template: 'Download CSV template', importCols: c => `Columns: ${c}`,
      importExplain: 'Each row is encrypted as soon as it is imported. The file is not kept.', colRow: 'Row', colHandle: 'Account', colMatch: 'Match', colAction: 'Action',
      matchKol: n => `KOL ${n}`, noKol: 'No KOL with this handle', actNew: 'New payee', actSkip: 'Skip', actReplace: 'Replace', actAdd: 'Add', hasDetails: 'has bank details',
      importOk: 'Import', importing: (i, n) => `Encrypting ${i} of ${n}…`, importDone: (m, n, k) => `Matched ${m} · New payee ${n} · Skipped ${k}`,
      onlyAdmin: 'Only an admin can set up the vault or change its passphrase',
      reset: 'Reset vault', resetTitle: 'Reset the payee vault', resetExplain: 'For a forgotten passphrase only. Every saved bank detail is deleted and cannot be recovered — bank names, last 4 digits and documents stay. Set the vault up again, then enter the details again.',
      resetType: 'Type RESET to confirm', resetWord: 'RESET', resetDone: n => `ล้าง Payee vault แล้ว (ลบข้อมูลบัญชี ${n} ราย)`,
    },
    status: { List: 'List', Inprocess: 'In process', Complete: 'Complete', Cancel: 'Cancelled' },
    stage: { posted: 'Posted', cancelled: 'Cancelled', script: 'Script', draftOf: (n, m) => `Draft ${n} of ${m}`, ofPlan: (n, m) => `(${n} of ${m})` },
    payment: { none: 'Not started', docs_done: 'Docs done', paid_50: '50% paid', paid_full: 'Paid' },
    /* CR-02 §3.1 / §4.3 */
    term: { prepaid: 'Prepaid', split_50: '50/50', postpaid: 'Pay after post', free: 'Free', package: 'Package', none: 'Not set' },
    payState: { paid: 'Paid', deposit_paid: 'Deposit paid', overdue: 'Overdue', due: 'Due', not_due: 'Not due', free: 'Free' },
    termShort: { prepaid: 'Prepaid', split_50: '50/50', postpaid: 'After post', free: 'Free', package: 'Package', none: 'Not set' },
    payStep: { docs_done: 'Docs', paid_50: '50%', deposit: 'Deposit 50%', paid_full: 'Paid' },
    /* CR-02 §4.8 */
    phaseStatus: { ongoing: 'On going', not_started: 'Not started', complete: 'Complete', on_hold: 'On hold', cancelled: 'Cancelled' },

    overview: {
      title: 'Dashboard',
      /* CR-05 §4.6 — tabs · All campaigns · Operations */
      tabs: { all: 'All campaigns', campaign: 'By campaign', ops: 'Operations' },
      /* CR-14 §4.1 — Status (instead of Include cancelled) */
      statusL: 'Status', statusBtn: v => `Status: ${v}`, statusAllExcept: 'All except cancelled', statusAll: 'All', statusMin: 'Select at least one status',
      statusTip: 'The status of each campaign today · every card, table and chart of this tab follows it',
      presets: { this_year: 'This year', this_quarter: 'This quarter', this_month: 'This month', last_month: 'Last month', custom: 'Custom', last30: 'Last 30 days', last90: 'Last 90 days' },
      apply: 'Apply', customInvalid: 'ใส่วันเริ่มและวันสิ้นสุดให้ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)',
      inCampaigns: n => `in ${n} campaign${n === 1 ? '' : 's'}`,
      dealsTipAll: 'Deals that are not cancelled, in the campaigns whose dates touch the chosen range.',
      postsTipAll: 'Posts with a post date inside the chosen range.', viewsTipAll: 'Views of the posts posted inside the chosen range.',
      usedLine: (p, r) => `${p}% used · ${r} remaining`, usedOver: (p, o) => `${p}% used · over by ${o}`, pendingLine: x => `+ ${x} pending`,
      portfolioTitle: 'Campaign portfolio', noCampaignInRange: 'No campaign runs in this range', noCampaign: 'No campaign yet',
      colCampaign: 'Campaign', colStatus: 'Status', colPillarMix: 'Pillar mix', pctOfCampaign: p => `${p}% of campaign budget`,
      swimTitle: 'Activity by campaign', laneCount: (v, m) => (m === 'spend' ? v : `${v} posts`),
      /* CR-11 §4.8 — To do (work with a date) · Data health (folds) */
      todo: 'To do', toShip: 'Shipments to ship', docsToCollect: 'Docs to collect', metricsDue: 'Metrics due', docsKols: n => `${n} KOL${n === 1 ? '' : 's'}`,
      health: 'Data health', healthN: n => `Data health · ${n} item${n === 1 ? '' : 's'}`, allGood: 'Data health · All good',
      healthItems: { termNotSet: 'Payment term not set', pillarNotSet: 'Pillar not set', postedNoDate: 'Posted without date', noProducts: 'Campaigns without products', noBudget: 'Phases without budget', dupLinks: 'Duplicate post links' },
      healthFix: { termNotSet: 'Set payment term', pillarNotSet: 'Set pillar', postedNoDate: 'Open in Performance', noProducts: 'Add products', noBudget: 'Plan phases', dupLinks: 'Open in Performance' },
      healthHint: 'Not counted: deals from the old files that are already Complete or Cancelled',
      setTerm: 'Set payment term', colPhase: 'Phase', issueNoBudget: 'No budget', issueNoDatePosts: n => `${n} post${n === 1 ? '' : 's'} with a link but no post date`, issueDup: l => `Same link: ${l}`,
      queues: { overdue: 'Overdue', unpaid: 'Unpaid after posting', beforeBrief: 'Payment due before brief', termNotSet: 'Payment term not set',
        pillarNotSet: 'Pillar not set', noDate: 'Posted without date', needsPhase: 'Needs phase', outside: 'Post date outside phase', noProducts: 'Campaign without products' },
      colKol: 'KOL', colCampaignPhase: 'Campaign › Phase', colStage: 'Stage', colIssue: 'Issue', open: 'Open',
      workloadTitle: 'Workload by PIC', colOpen: 'Open deals', colCommittedOpen: 'Committed (open)',
      picLabel: 'PIC', tierLabel: 'Tier', allPics: 'All', noPic: 'No PIC', allTiers: 'All',
      scope: 'Campaign / Phase', all: 'All campaigns',
      thisPhase: 'This phase', last30: 'Last 30 days', custom: 'Custom', from: 'From', to: 'To',
      deals: 'Deals', dealsTip: 'Excludes cancelled',
      committed: 'Committed', committedTip: 'Total of deals that are not cancelled, against the phase budgets', of: x => `of ${x}`, noBudget: 'no budget',
      posts: 'Posts', postsTip: 'Posts with a post date in the selected range', views: 'Views',
      chartTitle: 'Posts by date', daily: 'Daily', weekly: 'Weekly', tableView: 'Table view', downloadCsv: 'Download CSV', expand: 'Expand',
      colDay: 'Date', colWeek: 'Week', colPosts: 'Posts', noPosts: 'No posts in this range', pickRange: 'Pick a date range', tipPosts: 'Posts',
      weekOf: (a, b) => `Week ${a} – ${b}`,
      pipelineTitle: 'Active pipeline', noActive: 'No active deals',
      pipeFoot: (done, cancel) => `Completed ${done} · Cancelled ${cancel}`,
      attentionTitle: 'Needs attention',
      attnOverdue: 'Overdue', attnBeforeBrief: 'Payment before brief', attnTermNotSet: 'Payment term not set', attnPhaseToAssign: 'Phase to assign', attnPillarNotSet: 'Pillar not set', attnNoDate: 'Posted without date', attnOutside: (a, b) => `Post date outside ${a} – ${b}`,
      allClear: 'All clear',
      /* CR-03 §4.7 — Campaign / Phase filters, summary cards, Activity by date, Phase budget, Pillar allocation (CR-19) */
      campaign: 'Campaign', phase: 'Phase', allCampaigns: 'All campaigns', allPhases: 'All phases',
      rangeRunning: (a, b, d, n) => `${a} – ${b} · Day ${d} of ${n}`, rangeEnded: d => `Ended ${d}`, rangeStarts: (d, n) => `Starts ${d} · in ${n} day${n === 1 ? '' : 's'}`,
      activityTitle: 'Activity by date', mPosts: 'Posts', mSpend: 'Spend', colorBy: 'Color by', byPhase: 'Phase', byCampaign: 'Campaign', byPillar: 'Pillar',
      phaseBudgetTitle: 'Phase budget', allocTitle: 'Pillar allocation', actualOf: n => `Actual · ${n}`, workloadTip: 'Open a PIC in Operations',
      shortlistTip: 'Deals at Shortlist or Contacted — not counted in Committed', shortlistLine: x => `+ ${x} pending`,
      completedLine: (n, p) => `${n} completed · ${p}%`, cancelledN: n => `${n} cancelled`, budgetCard: 'Budget', paidOfCommitted: 'Dark = Paid (est.) · light = Committed',
      paidLine: x => `Paid ${x}`, overBy: x => `Over by ${x}`, remainingLine: x => `Remaining ${x}`,
      postsCardTip: 'Posts with a post date, of every post planned in this scope', ofPlanned: n => `of ${n} planned`,
      platformTip: (p, a, b) => `${p} · ${a} posted · ${b} planned`,
      engagement: 'Engagement', engagementTip: 'ER = (likes + comments + saves + shares) ÷ views · CPV = cost of the posts with views ÷ views',
      likes: 'Likes', comments: 'Comments', saves: 'Saves', shares: 'Shares', er: 'ER', cpv: 'CPV',
      metricsOn: (a, b) => `Metrics on ${a} of ${b} posts`, metricsNoDate: n => `+${n} without post date`, noMetrics: 'No metrics yet',
      needsPhase: 'Needs phase', unscheduled: 'Unscheduled', pillarNotSet: 'Pillar not set',
      legendTip: (l, a, b) => `${l} · posted ${a} · planned ${b}`, planned: 'Planned', postedPlanned: (a, b) => `Posted ${a} · planned ${b}`,
      colPosted: 'Posted', colTotal: 'Total',
      undatedSpend: x => `${x} without a post date (not on the chart)`, undatedPosts: n => `${n} post${n === 1 ? '' : 's'} without a date (not on the chart)`,
      outsideChart: n => `${n} post${n === 1 ? '' : 's'} dated far from the Campaign (not on the chart)`,
      outsideRange: n => `${n} post${n === 1 ? '' : 's'} dated outside this range (not on the chart)`,
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], today: 'Today',
      colPhase: 'Phase', colPeriod: 'Period', colBudgetPct: 'Budget %', colBudget: 'Budget', colShortlist: 'Pending', colCommitted: 'Committed', colPaid: 'Paid (est.)',
      usedOfBudget: p => `${p}% of the budget`, plusShortlist: x => `+ ${x} pending`,
      /* CR-07 §4.3 — Operations shows one PIC */
      opsOf: n => `Operations · ${n}`, selectPic: 'Select a PIC to see their work', selectPicPh: 'Select PIC', backToMe: 'Back to me',
      payDocsMissing: 'Payment docs missing', payReady: 'Ready to pay',
      /* CR-09 §4.1–4.5 — All campaigns: 5 KPI cards · KOL tier mix · Days left · time axis · Export */
      dows: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      kCampaigns: 'Campaigns', kCampaignsTip: 'Campaigns whose dates touch the chosen range (Cancelled not counted unless ticked).',
      nextToEnd: (name, left) => `Next to end: ${name} · ${left}`, nextToEndL: 'Next to end', pctOfCommitted: '% of committed',
      kDealsTip: 'Deals that are not cancelled, in the Campaigns of this range — by status.',
      usedPct: p => `${p}% used`, remPend: (r, p) => `Remaining ${r} · Pending ${p}`, overPend: (o, p) => `Over by ${o} · Pending ${p}`,
      kPaid: 'Paid', kPaidTip: 'Paid (est.) — from the paid flags of the deals, which follow their payment lines (CR-08).',
      paidPctLine: (pct, out) => `${pct}% of committed · Outstanding ${out}`, outstanding: 'Outstanding',
      kKols: 'KOLs engaged', kKolsTip: 'KOLs with at least one deal from Confirm QT on (not cancelled) · Avg = Committed ÷ committed deals.',
      kolsLine: (n, avg) => `${n} committed deals · Avg ${avg} per deal`, avgPerDeal: 'Avg per deal', committedDeals: 'Committed deals',
      tierTitle: 'KOL tier mix', tierTip: 'Committed deals (Confirm QT on, not cancelled) by the KOL tier of the deal.',
      mDeals: 'Deals', centerDeals: n => `${n} deal${n === 1 ? '' : 's'}`, colFollowers: 'Followers', colShare: 'Share',
      followers: (a, b) => (b == null ? `${a}+` : `${a}–${b}`), noFollowers: 'No followers on file',
      tierSlice: (tier, money, n, pct) => `${tier} · ${money} · ${n} deal${n === 1 ? '' : 's'} · ${pct}%`,
      /* CR-13 §4.2 — Pillar mix */
      pillarTitle: 'Pillar mix', pillarTip: 'Committed deals (Confirm QT on, not cancelled) of the campaigns in this range, by the pillar of the deal.',
      pillarLabel: 'Pillar', pctTotal: '% of total',
      pillarSlice: (p, money, n, pct) => `${p} · ${money} · ${n} deal${n === 1 ? '' : 's'} · ${pct}% of total`,
      noPillarLine: pct => `${pct}% of spend has no pillar`, setDefaults: 'Set default pillar per phase', notSet: 'Not set',
      colDaysLeft: 'Days left', daysLeftTip: 'On going: days to the last day · Not started: days to the start.',
      daysLeft: { left: n => `${n} day${n === 1 ? '' : 's'} left`, last: 'Last day', starts: n => `Starts in ${n} day${n === 1 ? '' : 's'}`, hold: 'On hold', none: '—' },
      exportTab: 'Export', exportTip: 'One Excel file: a sheet for each part of this tab', download: 'Download', dlXlsx: 'Download Excel (.xlsx)', dlCsv: 'Download CSV',
      sheet: { summary: 'Summary', activity: 'Activity', tiermix: 'KOL tier mix', pillarmix: 'Pillar mix', portfolio: 'Campaign portfolio', activityCamp: 'Activity by date', phasebudget: 'Phase budget',
        allocation: 'Pillar allocation', workload: 'Workload by PIC', queue: 'Queue', pipeline: 'Active pipeline', due: 'Due in next 7 days' },
      file: { summary: 'Summary', activity: 'Activity_by_campaign', tiermix: 'KOL_tier_mix', portfolio: 'Campaign_portfolio', tab_all: 'Dashboard_All_campaigns',
        activity_camp: 'Activity_by_date', phasebudget: 'Phase_budget', allocation: 'Pillar_allocation', workload: 'Workload_by_PIC', tab_campaign: 'Dashboard_By_campaign',
        queue: 'Operations_queue', tab_ops: 'Dashboard_Operations' },
      colRow: 'Row', queuesL: 'Queues', queueShown: 'Queue shown', byTier: 'KOL Tier', allPicsOps: 'All PICs', phaseTip: p => `Phase · ${p}`,
      meta: { tab: 'Tab', scope: 'Scope', status: 'Status', exported: 'Exported', by: 'Exported by' }, colCard: 'Card', colMetric: 'Metric', colValue: 'Value',
      colFrom: 'From', colTo: 'To', colWeekStart: 'Week starting', sortBy: l => `Sort by ${l}`,
      dueTitle: 'Due in next 7 days', dueNone: 'Nothing due in the next 7 days', collectMetrics: 'Collect metrics', dueToday: 'Today', dueTomorrow: 'Tomorrow', colDue: 'Due', colStep: 'Step',
      campaignTotal: 'Campaign', target: 'Target', actual: 'Actual', gapTip: 'Actual share of the deals with a pillar, minus the target (percentage points)', noCommitted: 'Nothing committed',
    },

    deal: {
      title: 'Deals',
      /* CR-04 §4.2–4.3 — deal tier, Tier filter, Group by */
      tier: 'Tier', allTiers: 'All', tiersN: n => `${n} tiers`, colTier: 'Tier', myDeals: 'My deals',
      /* CR-04 §4.5–4.8 — drawer sections, sources of defaults */
      editSec: t => `Edit ${t}`, secSource: 'Source', legacyJobs: 'Old job IDs', sourceRecords: 'Source rows',
      campaignMoveHint: 'Possible only before the deal has a dated post or reaches Confirm QT', costReason: 'Reason for the change',
      ctaDiffers: 'Differs from campaign', ctaCampaign: c => `Campaign CTA: ${c}`, ctaFromCampaign: c => `From campaign · ${c}`, ctaNotSet: 'Not set',
      termDiffers: 'Differs from KOL default', kolTerm: t => `KOL default: ${t}`, termFromKol: 'From KOL Master', termChanged: 'Changed for this deal', alsoUpdateKol: 'Also update KOL default',
      picYou: 'You', picKol: 'KOL default',
      untickTitle: l => `Remove ${l}?`, untickBody: l => `เอาเครื่องหมาย ${l} ออก — วันที่จ่ายของรายการนี้จะหายไป`, untickOk: 'Remove',
      createKolOpt: t => `+ Create KOL "${t}"`, moveTermHint: 'Needed from Confirm QT on — saved with the move',
      histEdit: 'Edited', histMetrics: id => `Metrics ${id}`, histCost: 'Costs changed after payment', histCta: (a, b) => `CTA ${a || '—'} → ${b || '—'}`, postWord: 'Post', postAdded: 'added', postRemoved: 'removed',
      tierTip: (h, n) => `Based on @${h} · ${n} followers`, tierUnknownTip: 'No followers recorded for this KOL',
      groupBy: 'Group by', groupByOpt: { stage: 'Stage', phase: 'Phase', tier: 'KOL Tier', pic: 'Assigned to', none: 'None' }, expandAll: 'Expand all groups', collapseAll: 'Collapse all groups',
      /* CR-06 §4.6 */
      views: { table: 'Table', pipeline: 'Pipeline', payments: 'Payments', samples: 'Samples', performance: 'Performance' },
      /* CR-06 §4.8 — Payments view */
      pay: {
        tabs: { due: 'Due now', overdue: 'Overdue', upcoming: 'Upcoming', paid: 'Paid', all: 'All' },
        colDocs: 'Docs', colDeposit: 'Deposit', colPaid: 'Paid', colOutstanding: 'Outstanding', colDue: 'Due status',
        groupLine: (n, c, p, o) => `${n} deal${n === 1 ? '' : 's'} · committed ${c} · paid ${p} · outstanding ${o}`,
        markDocs: 'Mark docs done', markPaid: 'Mark paid', setTerm: 'Set payment term', exportPayments: 'Payments CSV',
        markPaidTitle: n => `Mark ${n} deal${n === 1 ? '' : 's'} paid`, paidOn: 'Paid on', termForNone: n => `Payment term for the ${n} deal${n === 1 ? '' : 's'} without one`, keepNotSet: 'Keep Not set',
        setTermTitle: n => `Set the payment term of ${n} deal${n === 1 ? '' : 's'}`, term: 'Payment term', apply: 'Apply',
        askTitle: 'Payment term not set', askBody: n => `${n} has no payment term yet. Choose one first, or skip and keep it Not set.`, skip: 'Skip', setAndPay: 'Set term & mark paid',
        ticked: (label, n) => `${label} ✓ · ${n}`, unticked: (label, n) => `${label} ✗ · ${n}`, undone: 'ย้อนการจ่ายเงินแล้ว',
        docsDone: n => `ทำเอกสารแล้ว ${n} deals`, paidDone: n => `บันทึกจ่ายแล้ว ${n} deals`, termDone: (t, n) => `ตั้ง Payment term เป็น ${t} ให้ ${n} deals แล้ว`,
        skipped: n => `ข้าม ${n} deals ที่แก้ไม่ได้`, noPay: 'Nothing to pay',
      },
      openStage: k => `Open ${k} in a large view`, showAll: n => `Show all ${n}`, noCancelled: 'No cancelled deals', postedLane: 'Posted', noPosted: 'No posted deals',
      /* CR-09 §4.13 — Stage popup */
      colDaysIn: 'Days in stage', colWarnings: 'Needs doing', popSearch: 'Search KOL, PIC or deal ID', popMoveTo: 'Move to', popNext: 'next', popMove: 'Move',
      popExport: 'Export', popNone: 'No deals at this stage', backTo: k => `← Back to ${k}`,
      popMoved: (n, left, to) => `ย้าย ${n} deal ไป ${to}` + (left ? ` · ${left} deal ต้องย้ายทีละรายการด้วย Move stage` : ''),
      movedTo: s => `Moved to ${s}`, moveUndone: 'Move undone', moveToMenu: 'Move to…', cardMenu: 'Card actions', dragHint: 'Drag a card to another stage, or use ⋯ › Move to…', picMe: n => `Me (${n})`, allPics: 'All PICs', unassigned: 'Unassigned', density: 'View density', paidShort: 'Paid',
      /* CR-13 §4.4 — state tabs = the groups of the Pipeline · §4.5 attention chips (the words of Dashboard › Operations › To do) */
      tabs: { all: 'All', list: 'List', inprocess: 'In process', complete: 'Complete', cancelled: 'Cancelled' },
      attn: { overdue: 'Overdue', needsPhase: 'Needs phase', shipOverdue: 'Shipment overdue', metricsDue: 'Metrics due', docs: 'Docs to collect' },
      attnTip: {
        overdue: (step, due) => `Overdue · ${step ? step + ' ' : ''}due ${due}`, needsPhase: n => `Needs phase · ${n} post${n === 1 ? '' : 's'}`,
        shipOverdue: n => `Shipment overdue · ${n} shipment${n === 1 ? '' : 's'}`, metricsDue: n => `Metrics due · ${n} post${n === 1 ? '' : 's'}`,
        docs: n => `Docs to collect · ${n} instalment${n === 1 ? '' : 's'}`,
      },
      attnLabel: 'Needs doing', openInPayments: 'Open in Payments',
      groupOverdue: n => `${n} overdue`, avgDeal: x => `avg ${x} / deal`, groupViews: x => `Views ${x}`, groupCpv: x => `CPV ฿${x}`,
      followersRange: (a, b) => `${a} – ${b}`, followersFrom: a => `${a}+`, noFollowers: 'No followers',
      f: {
        campaign_id: 'Campaign', phase_id: 'Phase', phase_override: 'Phase', kol_id: 'KOL', sub_status: 'Stage', pillar: 'Pillar', pic: 'Assigned to', cta: 'CTA', products: 'Products',
        delivered: 'Product delivered', delivery_date: 'Delivery date', link_brief: 'Brief link', remark: 'Remark', cancel_reason: 'Cancel reason',
        rate_card: 'Rate card', gencode_expense: 'Gencode fee', gencode_period: 'Gencode days', gencode_start_date: 'Gencode start', gencode_end_date: 'Gencode end',
        basket_fee: 'Basket fee', asset_fee: 'Asset fee', expediting_fee: 'Expediting fee', total_cost: 'Total',
        docs_done: 'Docs done', docs_done_date: 'Docs date', paid_50: '50% paid', paid_50_date: '50% paid date', paid_full: 'Paid', paid_full_date: 'Paid date',
        brief_date: 'Brief', expected_script_date: 'Script due', script_date: 'Script date', expected_draft1_date: 'Draft 1 due', approved_draft1_date: 'Draft 1 date', expected_draft2_date: 'Draft 2 due',
        approved_draft2_date: 'Draft 2 date', expected_draft3_date: 'Draft 3 due', approved_draft3_date: 'Draft 3 date', expected_approve_date: 'Approve due', approved_date: 'Approve date', expected_post_date: 'Post due',
        account_id: 'Account', post_date: 'Posted on', post_link: 'Post link', gencode_code: 'Gencode', views: 'Views', likes: 'Likes', comments: 'Comments',
        saves: 'Saves', shares: 'Shares', metrics_updated_at: 'Metrics as of',
      },
      viewTable: 'Table', viewPipeline: 'Pipeline',
      search: 'Search KOL, @handle or deal ID', searchPerf: 'Search KOL, @handle, deal ID or post link', phase: 'Phase', allPhases: 'All phases',
      campaign: 'Campaign', allCampaigns: 'All campaigns', ongoingPhases: 'On going phases', chooseCampaign: 'Choose a campaign',
      needsPhase: 'Needs phase', unscheduled: 'Unscheduled', campaignBudget: 'Campaign budget', campaignNoBudget: 'This campaign has no KOL budget yet',
      choosePhase: 'Choose a phase', picked: 'picked', phasePickedTip: 'Picked by hand — the date cannot decide the Phase', phaseFromDate: 'Phase from the date:',
      overrideUnused: ph => `Not used — date now falls in ${ph}`, noDateYet: 'No date yet — you may pick the Phase now',
      needsPhaseOutside: 'The date is in no Phase of this Campaign — pick one', needsPhaseOverlap: 'The date is in more than one Phase — pick one',
      otherPosts: 'Posts without a phase', pillarNotSet: 'Not set', phasesN: n => `${n} phases`, plusPhase: n => `+${n} phase${n === 1 ? '' : 's'}`,
      setPillar: 'Set pillar', setPillarTitle: n => `Set pillar · ${n} deal${n === 1 ? '' : 's'}`, choosePillar: 'Choose a pillar',
      setPillarAsk: (n, p) => `Set pillar of ${n} deal${n === 1 ? '' : 's'} to ${p}?`, pillarChanged: (p, n) => (n > 1 ? `ตั้ง Pillar ของ ${n} deals เป็น ${p} แล้ว` : `Pillar set to ${p}`),
      pillarUndone: 'ยกเลิกการเปลี่ยน Pillar แล้ว', histPillar: (a, b) => `Pillar ${a || '—'} → ${b || '—'}`, changePillar: 'Change pillar', setPillarBtn: 'Set',
      shortlist: 'Pending', shortlistTip: 'Deals at Shortlist or Contacted — not committed yet (not counted in Committed)', plusShortlist: x => `+ ${x} pending`,
      groupDeals: n => `${n} deal${n === 1 ? '' : 's'}`, groupToggle: 'Show or hide this phase', budgetOf: (c, b) => `${c} / ${b}`,
      selectAll: 'Select all rows that match the filters', selectRow: name => `Select ${name}`, selected: n => `${n} selected`,
      reassign: 'Reassign PIC', exportSelected: 'Export selected', clear: 'Clear',
      assign: 'Assign', changePic: 'Change PIC', reassignTitle: n => `Reassign PIC · ${n} deal${n === 1 ? '' : 's'}`, choosePic: 'Choose a person',
      reassignAsk: (n, p) => `Change PIC of ${n} deal${n === 1 ? '' : 's'} to ${p}?`, reassignOk: 'Change PIC',
      picChanged: (p, n) => (n > 1 ? `เปลี่ยน PIC ของ ${n} deals เป็น ${p} แล้ว` : `PIC changed to ${p}`), picUndone: 'ยกเลิกการเปลี่ยน PIC แล้ว', undo: 'Undo',
      filters: 'Filters', any: 'Any', subStatus: 'Sub-status', pic: 'Assigned to', pillar: 'Pillar', payment: 'Payment', payState: 'Payment status', term: 'Payment term',
      clearAll: 'Clear all', remove: 'Remove',
      chipOpen: 'Open deals', chipNoDate: 'Posted without date', chipNoPostDate: 'Committed · no post date',  includeImported: 'Include imported', chipNoImported: 'Imported: hidden', chipOutside: (a, b) => `Post date outside ${a} – ${b}`,
      export: 'Export', exportDeals: 'Deals CSV', exportPosts: 'Posts CSV', exportTemplate: 'Template layout',
      newDeal: '+ New deal', all: 'All',
      committed: 'Committed', noBudget: 'no budget', paidEst: 'Paid (est.)', overdue: 'Overdue',
      columns: 'Columns', compact: 'Compact', template: 'Template',
      colKol: 'KOL', colPhase: 'Phase', colStage: 'Stage', colPlatforms: 'Platforms', colPic: 'Assigned to', colTotal: 'Total', colPayment: 'Payment', colNextDue: 'Next due',
      warnTip: 'What needs doing — the reasons of the chips above (Overdue · Needs phase · Shipment overdue · Metrics due · Docs to collect)',
      noMatch: 'No deals match these filters', clearFilters: 'Clear filters',
      loadMore: n => `Load more (${n})`, late: n => `${n}d late`,
      legacy: 'Imported', legacyTip: 'Imported from old files',
      links: n => `${n} link${n === 1 ? '' : 's'}`,
      tipPosted: (p, d) => `${p} · posted ${d}`, tipPlanned: (p, d) => `${p} · planned${d ? ` ${d}` : ''}`,
      collapse: 'Collapse', expand: 'Expand',
      /* drawer */
      move: 'Move stage', edit: 'Edit', openKol: 'Open in KOL Master', open: 'Open',
      secJourney: 'Journey', secPayment: 'Payment', secDeal: 'Deal', secCosts: 'Costs', secTimeline: 'Timeline', secPosts: n => `Posts (${n})`, secHistory: 'History',
      gencodeRange: 'Gencode period', posted: 'Posted', planned: 'Planned', asOf: d => `as of ${d}`, noPosts: 'No posts yet',
      budget: 'Budget', committedOthers: 'Committed (other deals)', thisDeal: 'This deal', remaining: 'Remaining',
      noHistory: 'No history yet', histFrom: (a, b) => `${a || '—'} → ${b}`,
      histPic: (a, b) => `Assigned to ${a || '—'} → ${b || '—'}`, histTerm: (a, b) => `Payment term ${a} → ${b}`,
      histPlan: (a, b) => `Content plan ${a} → ${b}`, planText: n => `${n} draft${n === 1 ? '' : 's'}`, histUndo: 'Undo',
      source: { user: 'User', legacy_derived: 'From old files', legacy_import: 'Import snapshot' },
      newTitle: 'New deal', editTitle: id => `Edit ${id}`, kolSearch: 'Type a KOL name or ID', newKol: '+ New KOL',
      startStep: 'Start at', stage: 'Stage', moveInView: 'Use Move stage (in view mode) to change the stage', none: '—',
      useFirstPost: 'Use first post date', showDraft23: '+ Draft 2 / 3',
      postAccounts: 'Accounts to post from (one post each)', chooseKolFirst: 'Choose a KOL first', addPost: '+ Add post', addAccount: '+ Add an account to this KOL',
      saveNext: 'Save & next', postN: n => `Post ${n}`, removePost: 'Remove post', otherAccount: id => `${id} (another KOL)`, chooseAccount: 'Choose an account',
      tiktokHint: 'Paste a full TikTok link and the post date is read from the video ID', tiktokDate: d => `Video ID says posted on ${d}`, useThisDate: 'Use this date',
      shortLink: 'Short links (vt.tiktok.com) do not carry the date — use the full video link to check it',
      created: id => `${id} created`, saved: id => `${id} saved`,
      /* CR-11 §4.4 — New deal in the create modal (L): Deal on the left · KOL & cost on the right */
      createDeal: 'Create deal', createNext: 'Create & next', dealThing: 'Deal',   // (CR-20: no "Adding to …" line)
      phaseField: 'Phase', phaseAuto: 'Auto by post date', phaseHint: 'The Phase of the posts ticked below · Auto = from each post date',
      kolCardEmpty: 'Choose a KOL to see the accounts, tier and track record', cardTier: 'Tier', cardPerf: 'Performance', cardLast: 'Last worked', cardNever: 'Never',
      cardNoAccount: 'No account yet', secKolCost: 'KOL & cost',
      noProductsYet: 'This campaign has no products yet', addProductsToCampaign: '+ Add products to campaign',
      apTitle: c => `Products of ${c}`, apSub: 'The products this Campaign uses — then back to the new deal', apSave: 'Save products', apSaved: c => `Products of ${c} saved`,
      aaTitle: k => `Add account · ${k}`, aaSub: 'A new account of this KOL — then back to the new deal', aaCreate: 'Add account', aaDone: h => `Account @${h} added`,
      backToNew: '← Back to the new deal',
      addPostTitle: k => `Add post · ${k}`, addPostSub: id => `To deal ${id}`, addPostOk: 'Add post', postAdded: id => `Post added to ${id}`,
      /* move stage */
      moveTitle: (id, kol) => `Move stage · ${id} · ${kol}`, moveFrom: 'Now:', moveTo: 'Move to', chooseStep: 'Choose a stage', moveDate: 'Date',
      moveReason: 'Cancel reason', moveNote: 'Note', moveNoteHint: 'Required when moving back or out of Cancelled', moveConfirm: 'Move',
      moveDone: (id, step) => `${id} → ${step}`, moveNext: 'next', moveOptional: 'optional',
      moveNotPlanned: 'not in plan', addRound: '+ Add draft round (adds the round and moves in one step)',
      /* content plan + payment term (CR-02) */
      contentPlan: 'Content plan', drafts: 'Drafts', planAlways: 'Script and Approve are in every plan', dueOf: (st, d) => `${st} due ${d}`, fewerDrafts: 'One draft round fewer', moreDrafts: 'One more draft round',
      cannotFewer: n => `Rounds up to Draft ${n} are already passed`, maxDrafts: n => `${n} rounds at most`,
      planSaved: t => `Content plan: ${t}`, chooseTerm: 'Choose a term', saveAsDefault: "Save as this KOL's default",
      freeNoPay: 'Free — no payment to track',
    },

    kol: {
      title: 'KOL Master', count: (k, a) => `${k} KOLs · ${a} accounts`, countOf: (n, t) => `${n} of ${t} KOLs`,
      search: 'Search name or @handle', platform: 'Platform', tier: 'Tier', allPlatforms: 'All platforms', allTiers: 'All tiers',
      filters: 'Filters', any: 'Any', clearAll: 'Clear all', remove: 'Remove',
      defaultTerm: 'Default payment term', term: 'Payment term', chooseTerm: 'Choose a term', termFromKol: "From this KOL's default",
      saveAsDefault: "Save as this KOL's default", saveAsTheirDefault: 'Save as their default', termFallback: 'Payment term for KOLs without one',
      bulkPicYou: p => `PIC of every new deal: ${p} (you)`,
      applyTitle: n => `Apply to ${n} open deal${n === 1 ? '' : 's'}?`, applyBody: t => `เปลี่ยน Payment term ของ deal ที่ยังไม่ปิด (List / In process) ของ KOL นี้เป็น ${t} — deal ที่ปิดแล้วไม่เปลี่ยน`,
      applyOk: 'Apply', applied: n => `เปลี่ยน Payment term ของ ${n} deals แล้ว`,
      category: 'Category', type: 'Type', pic: 'PIC', kolStatus: 'KOL status', dealHistory: 'Deal history', hasDeals: 'Has deals', noDeals: 'No deals', source: 'Source',
      importCsv: 'Import CSV', exportKols: 'Export KOLs', exportAccounts: 'Export accounts', exportRates: 'Export rates', newKol: '+ New KOL',
      selected: n => `${n} selected`, bulkAdd: 'Add to campaign…', clear: 'Clear', selectAll: 'Select all rows that match the filters',
      colKol: 'KOL', colPlatforms: 'Platforms', colFollowers: 'Followers', colTier: 'Tier', colCategory: 'Category', colCategoryType: 'Category · Type', colPic: 'PIC', colRate: 'Latest rate', colDeals: 'Deals', colLastCampaign: 'Last campaign', lastCampTip: (c, p) => (p ? `${c} › ${p}` : c), searchType: 'Search type',
      noMatch: 'No KOLs match these filters', clearFilters: 'Clear filters', loadMore: n => `Load more (${n})`,
      backToDeal: id => (id === '__new__' ? '← Back to the new deal' : `← Back to ${id}`),
      /* drawer */
      tierMax: t => `Tier ${t}`, picOf: p => `PIC ${p}`, followersShort: n => `${n} followers`, addToPhase: 'Add to campaign', edit: 'Edit',
      secProfile: 'Profile', secAccounts: n => `Accounts (${n})`, secRates: n => `Rates (${n})`, secCurrent: 'Current deals', secHistory: 'History',
      gender: 'Gender', contact: 'Contact', note: 'Note',
      /* CR-14 §4.5 — the contact ID (what the channel needs to reach the KOL) · never a phone number */
      contactId: 'Contact ID', contactIdHint: 'LINE ID · Agency + contact person · work e-mail · no phone numbers (they go in the Payee vault)',
      contactIdPh: { LINE: 'LINE ID', Agency: 'Agency name + contact person', Email: 'Work e-mail', TikTok: 'TikTok handle for DM', Instagram: 'Instagram handle for DM', Facebook: 'Facebook name for DM', Other: 'Contact ID', '': 'Contact ID' },
      hasContact: 'Has contact ID', missingContact: 'Missing contact ID', copyContact: 'Copy contact ID',
      incomplete: 'Incomplete', legacyTip: 'Imported without link or followers', followersTier: (f, t) => `${f} · ${t}`, posts: n => `${n} post${n === 1 ? '' : 's'}`,
      addRate: '+ Add rate', qDate: 'Date', qSource: 'Source', qAccount: 'Account', qRate: 'Rate card', qGencode: 'Gencode fee', qGencodeDays: 'Gencode days',
      qBasket: 'Basket fee', qAsset: 'Asset fee', qExpedite: 'Expediting fee', qTotal: 'Total', qNote: 'Note', undated: 'No date',
      due: d => `Next due ${d}`, noOpenDeal: 'No open deals', noHistory: 'No deals yet',
      histSummary: (n, c, total) => `${n} deals in ${c} campaigns · ${total} (not cancelled)`,
      /* edit */
      newTitle: 'New KOL', editTitle: x => `Edit ${x}`, merge: 'Merge with another KOL…',
      fName: 'Name', namePh: 'Name the team uses', choose: 'Choose', reason: 'Status reason', reasonPh: 'e.g. missed the brief several times',
      addAccount: '+ Add account', accountN: n => `Account ${n}`, removeAccount: 'Remove', cannotDeleteAccount: n => `มีโพสต์ผูกอยู่ ${n} โพสต์ ลบไม่ได้`,
      legacyHint: 'This imported account is incomplete — if you change it, fill in every field', fLink: 'Profile link', fHandle: 'Handle', handlePh: 'Filled from the link',
      sourceManual: 'Added in KOL Tracker', saved: id => `บันทึก ${id} แล้ว`,
      /* rate dialog */
      quoteTitle: name => `Add rate · ${name}`, noAccount: 'No specific account', quoteSourceDefault: 'Manual', rateSaved: id => `เพิ่มราคา ${id} แล้ว`, addRateOk: 'Add rate',
      thing: 'KOL', lockedFrom: 'Opened from KOL Master', perfNeeds: n => `Needs ${n}+ posts with a post date and a due date`, change: 'Change', newSub: 'A new KOL in KOL Master — add more accounts and rates from its profile',
      /* add to phase */
      addTitle: name => `Add ${name} to a campaign`, campaign: 'Campaign', chooseCampaign: 'Choose a campaign', startsAt: step => `The deal starts at ${step}`, createDeal: 'Create deal',
      createdOne: (id, step) => `สร้าง ${id} (${step}) แล้ว`, shortlistNote: 'Added from KOL Master',
      bulkTitle: n => `Add ${n} KOLs to a campaign shortlist`, picFallback: 'PIC for KOLs without one',
      willAdd: n => `Will add ${n}`, willSkip: n => `Will skip ${n} (already have an open deal in this campaign)`, addN: n => `Add ${n}`,
      resultTitle: 'Added to shortlist', resultAdded: n => `เพิ่มแล้ว ${n} คน`, resultSkipped: n => `ข้าม ${n} คน`,
      /* merge */
      mergeTitle: name => `Merge ${name} with another KOL`, mergePick: 'Other KOL (type a name or ID)', mergeKeep: 'Keep', mergeConfirm: 'Merge',
      mergeExplain: (a, b) => `${a} will be merged into ${b}, then removed`, mergeMoves: (a, d, q) => `Moves ${a} accounts · ${d} deals · ${q} rates`,
      mergeUnsaved: 'Unsaved changes in this form will not be kept', mergeNotFound: 'ยังไม่ได้เลือก KOL อีกคน', mergeDone: (a, b) => `รวม ${a} เข้า ${b} แล้ว`,
    },

    kolOptions: { gender: { Female: 'Female', Male: 'Male', Other: 'Other' } },

    /* CR-25 — Partner type of a KOL (KOL · Affiliate · Both) · the words can change in Settings › Lists (lookups.partner_types) */
    partner: {
      field: 'Partner type', col: 'Partner', nav: 'Partner types', all: 'All', allPartners: 'All partners',
      types: { kol: 'KOL', affiliate: 'Affiliate', both: 'Both' },
      chip: { affiliate: 'AFF', both: 'KOL+AFF' }, chipTip: l => `Partner type: ${l}`,
      count: (n, parts, a) => `${n} partners (${parts}) · ${a} accounts`,
      setBulk: 'Set partner type…', setTitle: n => `Set partner type · ${n} KOL${n === 1 ? '' : 's'}`, setOk: 'Set',
      setDone: (n, l) => `ตั้ง Partner type ของ ${n} คนเป็น ${l} แล้ว`, setSame: 'ทุกคนที่เลือกเป็นค่านี้อยู่แล้ว',
      hint: 'The words can change. The three types stay: KOL · Affiliate · Both (does both — counts in the KOL and the Affiliate filters).',
      label: 'Label', saved: 'บันทึก Partner types แล้ว', used: n => `${n} KOL${n === 1 ? '' : 's'}`,
      importBad: v => `partner_type “${v}” — use KOL, Affiliate or Both (blank = KOL)`, required: 'Choose a partner type',
    },

    campaign: {
      /* CR-11 §4.13 #5 — the Timeline legend */
      legend: { title: 'Legend', campaign: 'Campaign (all its Phases)', ongoing: 'On going', planned: 'Planned', complete: 'Complete', hold: 'On hold', cancelled: 'Cancelled',
        over: 'Over budget (red border)', overlap: 'Phases overlap', today: 'Today' },
      title: 'Campaign & Phase', newMenu: '+ New', newCampaign: 'New campaign', newPhase: 'New phase',
      colName: 'Name', colPeriod: 'Period', colBudget: 'Budget', colCommitted: 'Committed', colUsage: 'Usage', colPaid: 'Paid (est.)', colDeals: 'Deals',
      committedTip: 'Total of deals that are not cancelled', paidTip: 'Fully paid counts 100%, 50% paid counts half', dealsTip: 'Excludes cancelled',
      total: 'Total', dealsN: n => `${n} deals`, noBudget: 'No budget', noPhase: 'No phases yet', noCampaign: 'No campaigns yet', collapse: 'Collapse', expand: 'Expand',
      campaignTag: 'Campaign', phaseTag: 'Phase', addPhase: 'Add phase', edit: 'Edit', delete: 'Delete',
      secDetails: 'Details', secPhases: n => `Phases (${n})`, secBudget: 'Budget', secDeals: 'Deals by status',
      remaining: 'Remaining', noBudgetSet: 'No KOL budget set for this phase', overBudget: x => `เกินงบ ${x}`, budgetNote: 'Budget from the old files header — not confirmed yet',
      deleteCampaign: 'Delete campaign', deletePhase: 'Delete phase',
      cannotDeleteCampaign: n => `Has ${n} phases — cannot delete`, cannotDeletePhase: n => `Used by ${n} posts — cannot delete`,
      confirmDelete: label => `ลบ ${label} ใช่ไหม? ลบแล้วกู้คืนไม่ได้ (ยกเว้นจากไฟล์ Backup)`,
      newCampaignTitle: 'New campaign', editTitle: name => `Edit ${name}`,
      fName: 'Campaign name', namePh: 'e.g. Charming Iconic Glow', fNote: 'Note', fCampaign: 'Campaign', chooseCampaign: 'Choose a campaign',
      /* CR-06 §4.2 — the name of a Phase is its place by start date + its label */
      phaseTitle: (n, label) => `Phase ${n}${label ? ` · ${label}` : ''}`, fLabel: 'Label', secProducts: n => `Products (${n})`,
      /* CR-09 §4.7 */
      editProducts: 'Edit products', addProductsTip: 'Add the products of this Campaign', onlyAdminKm: 'Only Admin or KOL Manager can edit this',
      productsUpdated: (d, who) => `Updated ${d} by ${who}`, nothingChanged: 'ไม่มีอะไรเปลี่ยน', productsSaved: n => `บันทึกสินค้าของ ${n} แล้ว`,
      fStart: 'Start', fEnd: 'End', fBudget: 'KOL budget (฿)', thisPhase: 'This phase',
      /* CR-02 §4.8 — status, year, search, timeline */
      year: 'Year', allYears: 'All years', all: 'All', search: 'Search campaign or phase', colStatus: 'Status',
      noMatch: 'No campaigns match', clearFilters: 'Clear filters', noSearchMatch: q => `No campaigns or phases match "${q}"`, clearSearch: 'Clear search', viewTable: 'Table', viewTimeline: 'Timeline', today: 'Today', timeline: 'Timeline',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      daysLeft: n => `${n} day${n === 1 ? '' : 's'} left`, endsToday: 'Ends today', startsIn: n => `Starts in ${n} day${n === 1 ? '' : 's'}`, ended: 'Ended',
      budgetOf: (c, b) => `${c} / ${b}`,
      /* CR-03 §4.3 — Campaign budget split, Unscheduled / Needs phase, Shortlist */
      colShortlist: 'Pending', shortlistTip: 'Deals at Shortlist or Contacted — not counted in Committed', allocated: 'Allocated to phases',
      unallocated: x => `Unallocated ${x}`, overAllocated: x => `Over-allocated ${x}`, allocatedOf: (a, b) => `Allocated ${a} of ${b}`,
      unscheduledRow: 'Unscheduled', needsRow: 'Needs phase', postsN: n => `${n} post${n === 1 ? '' : 's'}`,
      fCampaignBudget: 'KOL budget (฿)', campaignBudgetHint: 'Phase budgets can be set as a % of this', pctAndAmount: (p, a) => `${p} · ${a}`,
      pctNeedsBudget: 'Set the Campaign KOL budget first to type a %',
      budgetChangedTitle: 'Campaign budget changed', budgetChangedBody: 'Phases of this Campaign have budgets. Keep their % of the Campaign (amounts are recalculated) or keep their amounts?',
      keepPct: 'Keep phase %', keepAmounts: 'Keep phase amounts',
      newCampaignBtn: '+ New campaign',
      /* CR-05 §4.7 — Table | Timeline · On hold / Cancelled */
      includeCancelled: 'Include cancelled', zoom: 'Zoom', zoomMonth: 'Month', zoomQuarter: 'Quarter', zoomFit: 'Fit', zoomFitTip: 'From a week before the first Phase to a week after the last one of the Campaigns shown',
      campFilter: 'Campaign', allCampaigns: 'All campaigns', searchCampaign: 'Search campaign', campChip: n => `Campaign: ${n}`, totalWithCancelled: 'Total (incl. cancelled)',
      phaseBudgetNoCampaign: 'The campaign has no budget to compare with', pctOfCampaign: (p, b) => `${p}% of campaign budget (${b})`, budgetOfPhase: n => `Budget of ${n}`,
      putOnHold: 'Put on hold', cancelCampaign: 'Cancel campaign', resume: 'Resume campaign', statusReason: 'Reason',
      holdTitle: n => `Put ${n} on hold`, cancelTitle: n => `Cancel ${n}`,
      holdBody: 'No new deal can be added while the campaign is on hold. Deals already in it can still be edited.',
      cancelBody: 'A cancelled campaign takes no new deal, its deals can only get a remark, and it leaves the totals unless “Include cancelled” is on.',
      cancelOpenDeals: n => `${n} open deal${n === 1 ? '' : 's'} (List / In process) will be cancelled with the same reason`,
      cancelWithDeals: n => `Cancel campaign and ${n} deal${n === 1 ? '' : 's'}`, cancelNote: n => `Campaign cancelled: ${n}`,
      statusLine: (st, reason, date) => `${st}${date ? ` since ${date}` : ''} · ${reason}`,
      statusSaved: (n, st) => `${n}: ${st} แล้ว`, resumed: n => `${n} กลับมาทำงานตามวันที่แล้ว`,
      fCta: 'CTA', ctaHint: 'Where this Campaign sends people to buy · new deals take it', ctaTip: 'CTA of the Campaign', ctaLabel: c => `CTA · ${c}`,
      ctaApplyTitle: n => `Apply to ${n} open deal${n === 1 ? '' : 's'}?`, ctaApplyBody: (a, b, n) => `${n} deals ที่ยังไม่ปิดยังใช้ CTA "${a}" — เปลี่ยนเป็น "${b}" ด้วยไหม`,
      ctaApplyOk: 'Apply', ctaApplied: n => `เปลี่ยน CTA ของ ${n} deals แล้ว`, ctaNote: 'campaign CTA',
      pillarTarget: 'Pillar target', targetDefault: 'default',
    },

    settings: {
      title: 'Settings', lists: 'Lists', dataGroup: 'Data',
      navJourney: 'Journey steps', navPillar: 'Pillar', navCta: 'CTA', navPic: 'PIC', navPlatform: 'Platform', navTiers: 'Tier rules', navProducts: 'Products', navPerf: 'KOL performance', navKolTypes: 'KOL types', navPayments: 'Payments', navData: 'Data',
      storageLine: 'Data is saved in this browser only. Back up regularly.',
      lastBackup: 'Last backup', never: 'Never', dataSize: 'Data size', sizeOf: (mb, q) => `${mb} MB of about ${q} MB`,
      backupNow: 'Backup now', restore: 'Restore…', reset: 'Reset to seed',
    },

    lists: {
      journeyHint: 'Label is the tooltip shown on stages. Steps in use cannot be deleted — switch them off instead.',
      order: 'Order', status: 'Status', step: 'Stage', label: 'Label', optional: 'Optional', active: 'Active', del: 'Delete',
      locked: 'Post and Cancel hold the journey together — they cannot be switched off or deleted', coreStep: 'Used by stage rules — the label can change; it cannot be switched off or deleted', stepInUse: n => `In use by ${n} records`,
      usedBy: n => `${n} in use`, unused: 'not used', inUse: n => `In use by ${n} records — switch it off instead`, ctaEmpty: 'No values yet',
      addPh: 'New value', add: '+ Add', saved: 'บันทึก Lists แล้ว', addTitle: t => `Add to ${t}`, addOk: 'Add', value: 'Value', added: v => `เพิ่ม ${v} แล้ว`,
      tierHint: 'Tier = the highest tier whose minimum is not above the followers. Saved when every row is valid.',
      tierName: 'Tier name', tierMin: 'Minimum followers', addTier: '+ Add tier',
    },

    issues: {
      title: 'Data issues',
      note: 'Found from the current data and never fixed automatically — decide and fix them in the deal.',
      dup: n => `Duplicate post links (${n})`, tiktok: n => `Post date differs from the TikTok video ID (${n})`,
      swapped: n => `Post due dates with day/month swapped (${n})`, pillar: n => `Old pillar moved into remark (${n})`, none: 'None',
      tiktokLine: (pd, td) => `entered ${pd} · video ID ${td}`, swappedLine: (d, s) => `${d} → probably ${s}`,
    },

    io: {
      exported: (name, n) => `Export ${name} (${n} แถว)`, exportedAll: 'Export CSV ทั้ง 6 ไฟล์แล้ว',
      importTitle: 'Import KOLs (CSV or the Excel template)', downloadTemplate: 'Download template', templateDone: 'Downloaded KOL_Master_Import_Template.csv',
      importCols: (req, opt) => `Required columns: ${req} · optional: ${opt} (any order)`,
      importRules: 'Followers only go up · existing values are never overwritten (contact ID too) · old files with rates still create a rate record',
      importIgnoredCol: c => `Ignored column: ${c}`,
      importKind: { match: 'Matches account', new_account: 'New account', new_kol: 'New KOL', error: 'Cannot import' },
      importConfirmCol: 'Confirm', importRow: 'Row', cName: 'Name', cPlatform: 'Platform', cHandle: 'Handle', cFollowers: 'Followers', cRate: 'Rate card', cNotes: 'Notes',
      importSummary: (m, a, k, e) => `Matches ${m} · New accounts ${a} · New KOLs ${k} · Cannot import ${e}`,
      importTick: 'Tick each "New account" row to confirm (name matches an existing KOL on a new platform)',
      importApply: 'Import', importNoRows: 'No data rows in this file',
      importDone: s => `นำเข้าแล้ว: ตรงกับบัญชีเดิม ${s.match} · บัญชีใหม่ ${s.new_account} · KOL ใหม่ ${s.new_kol} · เพิ่มราคา ${s.quotes} · ข้าม ${s.skipped + s.error}`,
    },

    data: {
      backupDone: name => `ดาวน์โหลด ${name} แล้ว`,
      restoreTitle: 'Restore from backup', restorePick: 'Backup file (.json)',
      restorePreview: 'ข้อมูลในเครื่องตอนนี้จะถูกแทนที่ทั้งหมด — ตรวจจำนวนก่อนยืนยัน', restoreColNow: 'Now', restoreColFile: 'In file',
      restoreFileInfo: (name, when) => `${name}${when ? ` · backed up ${when}` : ''}`, restoreConfirm: 'Restore', restoreDone: 'Restore ข้อมูลแล้ว', restoreBad: 'ไฟล์นี้ใช้ Restore ไม่ได้',
      restoreErr: {
        not_json: 'อ่านไฟล์ไม่ได้ (ไม่ใช่ JSON)',
        not_object: 'ไม่ใช่ไฟล์ Backup ของ KOL Tracker',
        schema_missing: 'ไม่ใช่ไฟล์ Backup ของ KOL Tracker — ถ้าจะกลับไปใช้ข้อมูลตั้งต้นให้กด Reset to seed',
        schema_newer: 'ไฟล์นี้มาจาก KOL Tracker เวอร์ชันที่ใหม่กว่า ให้เปิดด้วยไฟล์เวอร์ชันล่าสุด',
        missing: k => `ข้อมูลในไฟล์ไม่ครบ (${k})`,
      },
      resetTitle: 'Reset to seed', resetExplain: 'ข้อมูลทั้งหมดในเครื่องนี้จะถูกแทนด้วยข้อมูลตั้งต้น การแก้ไขทั้งหมดจะหาย ควร Backup ก่อน',
      resetType: 'Type RESET to confirm', resetWord: 'RESET', resetConfirm: 'Reset', resetDone: 'Reset เป็นข้อมูลตั้งต้นแล้ว', backupFirst: 'Backup first',
    },

    /* CR-10 §4.10–4.12 — New deal tabs · Create KOL · Bulk shortlist · Move to / Set details for many deals */
    bulk: {
      tabMaster: 'From KOL Master', tabNewKol: 'New KOL',
      campaign: 'Campaign', chooseCampaign: 'Choose a Campaign', phase: 'Phase', autoPhase: 'Auto by post date', pic: 'PIC', picMe: n => `Me (${n})`, picMeNone: 'Me',
      picKol: "KOL's PIC", pillar: 'Pillar', stage: 'Stage', stageTip: 'Bulk adds start at Shortlist. Move them forward later.',
      type: 'Type', category: 'Category', picCol: 'PIC', status: 'Status', perf: 'Performance', any: 'Any', notInCampaign: 'Not in this campaign yet',
      colKol: 'KOL', colFollowers: 'Followers', colRate: 'Latest rate', inCampaign: 'In this campaign',
      selectPage: 'Select this page', pageSelected: n => `${n} on this page selected`, selectAllMatching: n => `Select all ${n} matching`, allSelected: n => `All ${n} matching selected`,
      clearSel: 'Clear selection', selectedN: n => `Selected ${n}`, noneSelected: 'Tick KOLs on the left', remove: n => `Remove ${n}`,
      willAdd: n => `Will add ${n}`, willSkip: n => `Skip ${n}`, maxPerBatch: n => `Max ${n} per batch`,
      pageOf: (a, b, n) => `Page ${a} of ${b} · ${n} KOLs`,
      /* CR-25 §3.2 — the quick row + Filters (n) that folds the rest */
      filtersN: n => (n ? `Filters (${n})` : 'Filters'), filtersTip: 'Show or hide the other filters', moreChips: n => `+${n} more`, countN: n => `${n} KOLs`,
      previewTitle: 'Add to shortlist', previewLine: (n, c, m) => `Create ${n} deal${n === 1 ? '' : 's'} in ${c}${m ? ` · Skip ${m}` : ''}`, reason: 'Why skipped',
      skipReason: { in_campaign: 'Already in this campaign', blacklisted: 'Blacklisted' },
      previewHint: 'Shortlist deals start without costs, so Pending does not change. Payment term comes from each KOL (it can stay empty until Confirm QT).',
      back: 'Back', confirm: n => `Confirm · create ${n}`, added: n => `${n} deal${n === 1 ? '' : 's'} added`, undone: n => `Undone — ${n} deal${n === 1 ? '' : 's'} removed`,
      logNote: 'Bulk shortlist',
      moveTo: 'Move to…', setDetails: 'Set details', moveTitle: n => `Move ${n} deal${n === 1 ? '' : 's'}`, moveHint: 'Each deal moves today when Move stage would let it; one that needs something first stays and is listed.',
      moveResult: (n, m, st) => `Moved ${n} to ${st}${m ? ` · Blocked ${m}` : ''}`, blockedTerm: n => `(${n} Payment term not set)`, blockedOther: n => `${n} need the Move stage dialog`,
      blockedRights: 'Only the PIC can move this deal', setTermFor: n => `Set payment term for ${n}`,
      sd: { title: n => `Set details · ${n} deal${n === 1 ? '' : 's'}`, hint: 'Only the ticked fields change; the others stay as they are.', apply: n => `Apply to ${n}`,
        nothing: 'Tick at least one field', done: n => `อัปเดตรายละเอียด ${n} deals แล้ว` },
      ck: { title: 'Create KOL', sub: 'A new KOL in KOL Master — then back to the new deal', back: 'Back to the new deal', name: 'Name', platform: 'Platform', handle: 'Handle',
        handleHint: 'Without @', followers: 'Followers', profileLink: 'Profile link', type: 'Type', category: 'Category', gender: 'Gender', contact: 'Contact',
        pic: 'PIC', term: 'Default payment term', termHint: 'Used for this deal too', choose: 'Choose', notSet: 'Not set', create: 'Create KOL',
        already: (n, h) => `Already in KOL Master: ${n}${h ? ` (@${h})` : ''}`, useThis: 'Use this KOL', createAnyway: 'Create anyway', created: n => `KOL created: ${n}` },
    },
    /* CR-11 §4.6–4.7 — data from the old files · Settings › Go-live clean-up */
    golive: {
      nav: 'Go-live clean-up', title: 'Go-live clean-up', intro: 'One place to set the data from the old files straight, once: what was already paid and what the KOLs already have.',
      start: 'Start clean-up', again: 'Run again', lastRun: (d, who) => `Last run ${d} by ${who}`, notRun: 'Not run yet', goLiveOn: d => `Go-live ${d}`,
      banner: 'Old work still shows as owed or to ship — set it straight once in Go-live clean-up', bannerGo: 'Go-live clean-up', bannerDismiss: 'Dismiss',
      steps: ['Go-live date', 'Payments', 'Shipments', 'Review & apply'], stepOf: (n, m) => `Step ${n} of ${m}`, next: 'Next', back: 'Back',
      dateL: 'Go-live date', dateHint: 'The day the team started working in this app. Older posts with no numbers are "Not tracked"; nothing is deleted.',
      payHint: 'Instalments of imported deals that still show as owed. Tick the ones already paid — they become Paid outside app with the date and note.',
      payNone: 'No imported deal is owed anything', matchPr: 'Match with PR file', matchPrHint: 'A paid PR file (.xlsx or .csv): pick the name and amount columns — nothing else is read in.',
      colName: 'Name / handle', colAmount: 'Amount', colPaid: 'Paid date (optional)', none: '—', sheet: 'Sheet', applyMatch: 'Match', matchSum: (m, a, n) => `Matched ${m} · Check amount ${a} · Not found ${n}`,
      status: { matched: 'Matched', amount: 'Check amount', notfound: 'Not found' }, fileRows: n => `${n} rows read`, readFail: 'This file could not be read — save it as .xlsx or .csv',
      paidDate: 'Paid date', note: 'Note', notePh: 'e.g. Paid in PR 09/10/26', noteHint: 'Used for the ticked lines without a match note',
      vaultLink: 'Payee details for many KOLs at once: Settings › Payments › Import payee details',
      shipHint: 'Shipments of imported deals still To ship. A Complete deal is ticked: the KOL posted, so they had the product.', shipNone: 'No imported shipment is waiting',
      deliveredImported: 'Delivered (imported) · Go-live clean-up', markDelivered: 'Mark delivered (imported)',
      review: (n, amt, m) => `${n} line${n === 1 ? '' : 's'} · ${amt} → Paid outside app · ${m} shipment${m === 1 ? '' : 's'} → Delivered (imported)`, backupFirst: 'A Backup file downloads before anything changes.',
      apply: 'Apply clean-up', applied: (n, m) => `Clean-up เสร็จแล้ว: จ่ายนอกแอป ${n} รายการ · ส่งของแล้ว ${m} shipment`, undone: 'ยกเลิก clean-up แล้ว — ข้อมูลกลับเป็นแบบเดิม',
      matchedNote: (file, sheet, row) => `Matched with ${file} · sheet ${sheet} row ${row}`, readOnly: 'Accounting: read only',
      imported: 'Imported · not tracked before go-live', importedTag: 'Imported', notTracked: 'Not tracked', notTrackedLine: (d, n) => `Not tracked (before ${d}) ${n}`,
      includeImported: 'Include imported', showImported: n => `Show imported (${n})`, hideImported: 'Hide imported',
      beforeCopy: v => `A copy of your data from before the upgrade (schema ${v}) is kept in this browser`, beforeCopyDl: 'Download it',
      importedN: 'Imported deals', importedLine: (n, open) => `${n} from the old files · ${open} still open`, stillOwed: 'Old work to set straight',
      owedLine: (n, amt, m) => `${n} lines owed · ${amt} · ${m} shipments to ship`, lastRunL: 'Last run', viewPayments: 'See the payments step',
      undo: 'Undo', undoLast: 'Undo the last clean-up', undoHint: 'Undo works until the page is reloaded — after that, use the Backup file it downloaded.',
      colMatch: 'PR file', paidFromFile: d => `paid ${d}`, groupLine: (n, amt) => `${n} line${n === 1 ? '' : 's'} · ${amt}`, selLine: (n, amt) => `${n} selected · ${amt}`,
      allSheets: 'All sheets', notMatchedRows: n => `Rows of the file not matched (${n})`, fileRowLine: (sheet, row, name, amt) => `${sheet} row ${row} · ${name} · ${amt}`,
      reviewMatched: n => `${n} of them matched with the PR file`,
    },
    /* CR-10 §4.14 — Samples (product samples sent to KOLs) */
    samples: {
      title: 'Shipments', sec: 'Shipments', trackL: 'Shipment', status: { overdue: 'Overdue', this_week: 'Ship this week', to_ship: 'To ship', shipped: 'Shipped', delivered: 'Delivered', problem: 'Problem', not_required: 'Not required' },
      queue: { overdue: 'Overdue', this_week: 'Ship this week', shipped: 'Shipped (in transit)', delivered: 'Delivered', noShipBy: 'No ship-by date' },
      col: { kol: 'KOL', stage: 'Stage', items: 'Items', shipBy: 'Ship by', status: 'Status', carrier: 'Carrier', tracking: 'Tracking no.', shipped: 'Shipped', delivered: 'Delivered', address: 'Address', pic: 'PIC', phase: 'Campaign › Phase', qty: 'Qty' },
      addShipment: 'Add shipment', edit: 'Edit', markShipped: 'Mark shipped', markDelivered: 'Mark delivered', reportProblem: 'Report problem', notRequired: 'Mark as not required', del: 'Delete',
      setShipBy: 'Set ship-by date', resetAuto: 'Reset to auto', setShipByBulk: 'Set ship-by', noProducts: 'No products selected', noShipments: 'No shipment yet',
      addressOnFile: 'Address on file', noAddress: 'No address', onFile: 'On file', missing: 'Missing', shippingDetails: 'Shipping details', shipName: 'Recipient name', shipPhone: 'Phone', shipAddress: 'Shipping address',
      shippingHint: '🔒 Saved encrypted in the Payee vault — shown in full only while Payee details are unlocked', needVault: 'Set up the Payee vault first (Settings › Payments)',
      shippingSaved: 'บันทึกที่อยู่จัดส่งแล้ว (เข้ารหัส)', unlockToSee: 'Unlock to see',
      dateNotRecorded: 'Date not recorded', shippedOn: 'Shipped on', deliveredOn: 'Delivered on', reason: 'Reason', problemPh: 'Returned · lost · damaged…',
      groupBy: 'Group by', groupOpt: { status: 'Status', pic: 'PIC', phase: 'Phase' }, empty: 'No shipments in this scope', noMatch: 'No shipments match these filters',
      selected: n => `${n} selected`, exportList: 'Export shipping list', sheet: 'Shipping list', file: 'Shipping-list', recipient: 'Recipient', phone: 'Phone', address: 'Address',
      bulkShippedTitle: n => `Mark ${n} shipment${n === 1 ? '' : 's'} shipped`, bulkDeliveredTitle: n => `Mark ${n} shipment${n === 1 ? '' : 's'} delivered`, shipByTitle: n => `Ship by · ${n} shipment${n === 1 ? '' : 's'}`,
      notRequiredTitle: n => `Not required · ${n} shipment${n === 1 ? '' : 's'}`, problemTitle: 'Report a problem', addTitle: 'Add shipment', editTitle: id => `Edit ${id}`,
      done: n => (n === 1 ? 'อัปเดต shipment แล้ว' : `อัปเดต ${n} shipments แล้ว`), added: id => `เพิ่ม ${id} แล้ว`, deleted: 'ลบ shipment แล้ว', autoNote: 'Confirm QT', dealCancelled: 'Deal cancelled',
      track: { to_ship: d => (d ? `To ship (by ${d})` : 'To ship'), this_week: d => `To ship (by ${d})`, overdue: (d, n) => `Ship by ${d} · ${n} d overdue`, shipped: (d, c) => `Shipped ${d}${c ? ` · ${c}` : ''}`,
        delivered: d => (d ? `Delivered ${d}` : 'Delivered'), problem: 'Problem', not_required: 'Not required' },
      icon: (st, d) => (d ? `Ship by ${d} · ${st}` : `Shipment · ${st}`), filter: 'Shipment status', toShipCard: 'Shipments to ship', shipSample: 'Ship', onlyPic: "Only the deal's PIC, a KOL Manager or an Admin can change shipments",
      onlyEdit: "Items, ship-by date and Not required: the deal's PIC, whoever made the shipment, a KOL Manager or an Admin", openIn: 'Open in Shipments', editItems: 'Edit items',
      settings: { nav: 'Shipments', lead: 'Lead days before Draft 1', leadHint: 'Ship by = Draft 1 (or the expected post date) minus these days', carriers: 'Carriers', carriersHint: 'One per line',
        tracking: 'Tracking link per carrier', trackingHint: 'A link with {tracking}, e.g. https://th.kerryexpress.com/th/track/?track={tracking}', saved: 'บันทึกการตั้งค่า Shipments แล้ว' },
    },
    /* CR-11 §4.11 — fill once, carried on */
    fill: {
      defaultPillar: 'Default pillar', defaultTerm: 'Default payment term', none: 'None',
      defaultPillarHint: 'New deals in this Phase start with it · deals already made are not changed until you Apply',
      defaultTermHint: "New deals of this Campaign start with it when the KOL has no default of their own",
      fromPhase: 'From phase', fromCampaign: 'From campaign', onlyProduct: 'Only product in campaign',
      applyPillar: n => `Apply to ${n} deal${n === 1 ? '' : 's'} without pillar`, applyPillarTitle: n => `Set the pillar of ${n} deal${n === 1 ? '' : 's'}?`,
      applyPillarBody: (p, phase, n) => `${n} deal${n === 1 ? '' : 's'} of ${phase} without a pillar (imported ones too) get ${p}. Deals that have a pillar are not touched.`,
      applyTerm: n => `Apply to ${n} open deal${n === 1 ? '' : 's'} without term`, applyTermTitle: n => `Set the payment term of ${n} open deal${n === 1 ? '' : 's'}?`,
      applyTermBody: (t, n) => `${n} open deal${n === 1 ? '' : 's'} with no payment term get ${t}. Deals that have a term are not touched.`, apply: 'Apply',
      pillarApplied: (n, p) => `ตั้ง pillar ${p} ให้ ${n} deals แล้ว`, termApplied: (n, t) => `ตั้ง payment term ${t} ให้ ${n} deals แล้ว`, undone: 'ยกเลิกแล้ว — กลับเป็นค่าเดิม',
      pillarSaved: (p, ph) => `Default pillar ของ ${ph}: ${p}`, termSaved: t => `Default payment term: ${t}`, note: 'Default (Phase)',
      mostNoPillar: 'Most spend has no pillar', setDefaults: 'Set default pillar per phase', planPhases: 'Plan phases',
    },
    /* CR-11 §4.10 — Shipments (the side menu page) */
    ship: {
      title: 'Shipments', tabs: { 'to-ship': 'To ship', 'in-transit': 'In transit', delivered: 'Delivered' }, choose: 'Choose…',
      newShipment: '+ New shipment', newTitle: 'New shipment', create: 'Create shipment', created: id => `Shipment ${id} created`,
      campaign: 'Campaign', allCampaigns: 'All campaigns', pic: 'PIC', allPics: 'All PICs', mine: 'Mine', noPic: 'No PIC', purpose: 'Purpose', allPurposes: 'All purposes',
      search: 'Search KOL, @handle, shipment ID or tracking no.', filters: 'Filters', status: 'Status',
      purposes: { review: 'Review sample', gifting: 'Gifting / PR', replacement: 'Replacement', affiliate: 'Affiliate', other: 'Other' },
      cards: { overdue: 'Overdue', this_week: 'Ship this week', in_transit: 'In transit', noShipBy: 'No ship-by date', problem: 'Problem' },
      groups: { overdue: 'Overdue', this_week: 'Ship this week', later: 'Later', noShipBy: 'No ship-by date', problem: 'Problem' },
      col: { shipBy: 'Ship by', kol: 'KOL', campaignPhase: 'Campaign › Phase', purpose: 'Purpose', items: 'Items × qty', address: 'Address', pic: 'PIC', status: 'Status',
        pickList: 'Pick list', shipped: 'Shipped', carrier: 'Carrier', tracking: 'Tracking no.', days: 'Days in transit', delivered: 'Delivered' },
      daysN: n => `${n} d`, slowTip: n => `More than ${n} days in transit`, noDeal: 'No deal',
      bulk: { pick: 'Create pick list', shipped: 'Mark shipped', shipBy: 'Set ship-by', notRequired: 'Mark as not required', delivered: 'Mark delivered', clear: 'Clear' },
      selected: n => `${n} selected`, menu: 'Actions', openDeal: 'Open deal', removePick: 'Remove from pick list', reship: 'Add re-shipment', del: 'Delete',
      showImported: n => `Show imported (${n})`, hideImported: 'Hide imported', importedNote: 'Imported from the old files — read only',
      empty: { 'to-ship': 'Nothing to ship', 'in-transit': 'Nothing in transit', delivered: 'Nothing delivered yet' }, noMatch: 'No shipments match these filters',
      pickDefault: d => `Pick list ${d}`, pickTitle: n => `Create pick list · ${n} parcel${n === 1 ? '' : 's'}`, pickName: 'Name', itemsSummary: 'Items summary', parcels: n => `${n} parcel${n === 1 ? '' : 's'}`,
      pickCreated: name => `สร้าง ${name} แล้ว`, pickLists: n => `Pick lists (${n})`, noPickLists: 'No pick list yet', pickOpen: 'Open pick list', noItems: 'No products on these shipments',
      print: 'Print', exportList: 'Export shipping list', markAll: 'Mark all shipped', markAllTitle: (name, n) => `Mark all shipped · ${name} · ${n} parcel${n === 1 ? '' : 's'}`,
      trackingPaste: 'Tracking nos. — one a line, in the order of the rows (paste a column from a sheet)', trackingPh: 'KER000000001\nKER000000002', shippedN: n => `ส่งแล้ว ${n} shipment`,
      allShipped: 'Every parcel of this pick list is shipped', createdBy: (who, d) => `Made by ${who} · ${d}`, removed: 'เอาออกจาก pick list แล้ว', tick: 'Packed',
      seeList: 'See shipping list', addrLocked: 'Addresses are shown only while Payee details are unlocked',
      recipient: 'Recipient KOL', recipientHint: 'Every recipient is a KOL in KOL Master — the address is in the KOL drawer › Payee & shipping', createKol: '+ Create KOL',
      deal: 'Deal', noDealOpt: 'No deal', dealHint: 'Optional — a deal of this KOL', campaignHint: 'From the deal · without one, choose it (optional)',
      items: 'Items', itemsHint: 'From the deal or the Campaign · any product can be added', qty: 'Qty', note: 'Note', notePh: 'e.g. a second colour · for the launch event',
      addressOnFile: 'Address on file', noAddress: 'No address', addAddress: 'Add it in the KOL drawer', drawerTitle: id => `Shipment ${id}`, madeBy: 'Made by',
      onlyProduct: 'Only product in campaign',
    },
    /* CR-10 §4.8 — date range picker */
    range: {
      title: 'Pick a date range', selected: 'Selected range', pick: 'Start date – End date', endDate: 'End date', placeholder: 'dd/mm/yyyy – dd/mm/yyyy',
      days: n => `${n} day${n === 1 ? '' : 's'}`, clear: 'Clear dates', apply: 'Apply', start: 'Start', end: 'End', prev: 'Previous month', next: 'Next month',
      typeDates: 'Type the dates', showCalendar: 'Show the calendar',
      dows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], dayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
    /* CR-10 — Deals › Performance (one row per posted post) */
    perfTab: {
      kpi: {
        posted: { h: 'Posted', d: 'Posts of the deals in scope that went live: a post date on or before today, or a post link.' },
        withMetrics: { h: 'With metrics', d: 'Posted posts that have Views. Click to see the posts due for metrics.' },
        views: { h: 'Views', d: 'All views of the posted posts in scope.' },
        engagement: { h: 'Engagement', d: 'Likes + comments + shares + saves.' },
        er: { h: 'ER', d: 'Engagement rate of posts that have views.', f: 'Σ (likes + comments + shares + saves) ÷ Σ views — posts with views only' },
        cpv: { h: 'CPV', d: 'Cost per view of posts that have views.', f: 'Σ cost ÷ Σ views — cost of a post = the deal total ÷ its number of posts' },
      },
      noDate: n => `${n} without post date`, pctPosted: p => `${p}% of posted`, onViews: n => `on ${n} post${n === 1 ? '' : 's'} with views`, costOn: x => `Cost ${x} on posts with views`,
      showNoMetrics: 'Show posts due for metrics',
      col: { kol: 'KOL', tier: 'Tier', platform: 'Platform', post: 'Post', post_date: 'Post date', views: 'Views', likes: 'Likes', comments: 'Comments', shares: 'Shares',
        saves: 'Saves', er: 'ER', cost: 'Cost', cpv: 'CPV', updated: 'Metrics', pic: 'PIC', phase: 'Phase', followers: 'Followers', vpf: 'Views / followers',
        engagement: 'Engagement', cpe: 'CPE', gencode: 'Gencode', pillar: 'Pillar', expected: 'Expected post', ontime: 'On-time' },
      colTip: { tier: "Tier of the account that posted (its followers)", vpf: 'Views ÷ followers of the account — how far the clip went beyond its fans', cost: 'The deal total ÷ its number of posts', cpe: 'Cost ÷ engagement' },
      groupBy: 'Group by', groupOpt: { none: 'None', tier: 'Post tier', platform: 'Platform', phase: 'Phase', pic: 'PIC' }, expandAll: 'Expand all', collapseAll: 'Collapse all',
      columns: 'Columns', minCol: 'Keep at least one column', export: 'Export',
      open: 'Open', openTip: 'Open the post in a new tab', noLink: 'No link', noLinkTip: 'No post link — open the deal to add it',
      /* CR-11 §4.12 — collected at checkpoints (D+7 …) */
      status: { due: 'Due', waiting: 'Waiting', collected: 'Collected', not_posted: 'Not posted', not_tracked: 'Not tracked', imported: 'Imported' },
      updatedTip: (d, who) => `Metrics updated ${d}${who ? ` by ${who}` : ''}`, importedTip: 'From the old file — no update date',
      waitingL: (n, d) => `D+${n} on ${d}`, dueTip: (n, d, upd) => `D+${n} was ${d} · ${upd ? `last saved ${upd}` : 'no numbers yet'}`, collectedTip: (d, who, n) => `Saved ${d}${who ? ` by ${who}` : ''}${n ? ` · D+${n} done` : ''}`,
      notPostedTip: 'No post date or no post link yet', notTrackedTip: d => `Posted before ${d} with no numbers — not collected backwards`,
      notTrackedLine: (d, n) => `Not tracked (before ${d}) ${n}`, includeImported: 'Include imported', importedOff: 'Imported: hidden',
      onTime: 'On time', late: n => `+${n} d late`, gencodeYes: 'Yes', gencodeTip: d => (d ? `Expires ${d}` : 'No end date'), unassigned: 'Unassigned',
      filters: { platform: 'Platform', tier: 'Post tier', mstatus: 'Metrics status', link: 'Post link', has: 'Has link', none: 'No link', dup: 'Duplicate link' },
      /* CR-11 §4.13 #7 */
      dupLink: 'Duplicate link', dupTip: n => `The same link is on ${n} posts — this one is not added to Views / ER (the first one is)`, dupFirstTip: n => `The same link is on ${n} posts — counted once, here`,
      groupLine: (n, v, er, cpv) => `${n} post${n === 1 ? '' : 's'} · Views ${v} · ER ${er} · CPV ${cpv}`, total: 'Total', postsN: n => `${n} post${n === 1 ? '' : 's'}`,
      empty: 'No posted content in this scope', emptyHint: 'Posts show here once they have a post date or a post link.', noMatch: 'No posts match these filters',
      sheet: 'Performance', file: 'Performance', postLink: 'Post link', postId: 'Post ID', account: 'Account',
      /* R2 — updating metrics */
      pasteMetrics: 'Paste metrics', editOnlyPic: "Only the deal's PIC, a KOL Manager or an Admin can update these numbers",
      saved: n => `บันทึก metrics แล้ว ${n} โพสต์`, undone: 'ยกเลิกการแก้ metrics แล้ว',
      paste: {
        help: 'Copy rows from Google Sheets or Excel and paste them here: Post link · Views · Likes · Comments · Shares · Saves (a header line is fine · a blank cell keeps the number). Links are matched to the posts in this scope.',
        placeholder: 'https://www.tiktok.com/@name/video/…\t12500\t830\t21\t40\t95', copyTemplate: 'Copy template', copyTip: n => `The header and the ${n} post link${n === 1 ? '' : 's'} in this scope`,
        copied: 'คัดลอก template แล้ว — วางในชีทแล้วเติมตัวเลข', colLink: 'Post link', apply: n => (n ? `Apply ${n}` : 'Apply'), result: 'Result',
        count: { matched: 'Matched', notfound: 'Not found', nochange: 'No change', error: 'Errors', notyours: 'Not your deal' },
        status: { matched: 'Matched', notfound: 'Not found', nochange: 'No change', error: 'Error', notyours: 'Not your deal' },
        noLink: 'No post link in the first column', badNumber: x => `Not a whole number: ${x}`, notFoundWhy: 'No post with this link in the current scope',
        notYoursWhy: 'You are not the PIC of this deal', done: n => `อัปเดต metrics ${n} โพสต์แล้ว`,
      },
    },

    msg: {
      countInvalid: 'Enter a whole number, e.g. 12,500 or 12.5K',
      moveTermRequired: 'Choose a payment term to move to Confirm QT or later', termNotSetInfo: 'Payment term not set (imported deal)',
      bulkMax: n => `Max ${n} per batch`, ckPicRequired: 'Choose a PIC',
      /* CR-14 §4.5 / §4.6 — contact ID · import */
      contactPhone: "Phone numbers can't be saved here. Use Payee vault.", contactLong: n => `Contact ID can be up to ${n} characters`,
      contactMissing: 'Add the contact ID so the team can reach this KOL',
      importMissingCol: cols => `Missing required column${cols.length > 1 ? 's' : ''}: ${cols.join(', ')}`, importPhone: 'Phone number in contact_id', importKeptContact: 'Kept existing contact ID',
      sampleReason: 'Give a reason', shipPurpose: 'Choose a purpose', shipKol: 'Choose the recipient (a KOL in KOL Master)', shipDeal: 'This deal is not of that KOL',
      shipCarrier: 'Choose the carrier', shipMoreLines: (l, n) => `${l} tracking lines for ${n} parcels — the extra lines are left out`, shipNoTracking: n => `${n} parcel${n === 1 ? '' : 's'} without a tracking no.`,
      pickName: 'Give the pick list a name', pickNone: 'Select the shipments to pack', pickNotOpen: 'Only shipments still to ship and not in another pick list', holdReason: 'Give the reason for the hold', cleanupDate: 'Paid date: use dd/mm/yyyy', cleanupNote: 'Add a note (where it was paid)', sampleLead: 'Lead days: 0–60', sampleTracking: 'A tracking link starts with http and has {tracking} in it',
      rangeFormat: 'Use dd/mm/yyyy', rangeOrder: 'End date must be on or after start date',
      metricsEngHigh: 'Engagement is higher than views — check the numbers', metricsViewsDown: x => `Views are lower than the last update (${x})`,
      postCount: (n, k) => `${n} ${({ views: 'Views', likes: 'Likes', comments: 'Comments', saves: 'Saves', shares: 'Shares' })[k] || k}: Enter a whole number, e.g. 12,500 or 12.5K`,
      perfStale: 'Metrics stale after: 1–365 days', perfCheckpoints: 'Checkpoints: whole days 1–365, separated by commas',
      campaignNameRequired: 'ยังไม่ได้ใส่ชื่อ Campaign',
      planOver: x => `Phase budgets exceed the campaign budget by ${x}`, planUnallocated: x => `Unallocated ${x}`,
      planPctNoBudget: 'ยังไม่ได้ใส่งบ Campaign — งบ Phase ที่เป็น % ยังคำนวณเป็นเงินไม่ได้',
      planCountRange: max => `Number of phases must be a whole number 1–${max}`, planRemoveHasPosts: n => `${n} has posts — can't remove`,
      planPeriodNeeded: 'ใส่ Campaign period (วันเริ่ม–วันสิ้นสุด) ก่อน', planPeriodShort: n => `Campaign period สั้นกว่า ${n} วัน — แบ่งเป็น ${n} Phase ไม่ได้`,
      planGap: (a, b) => `ไม่มี Phase ช่วง ${a}–${b} — โพสต์ในช่วงนี้ต้องเลือก Phase เอง`, planDeleteHasPosts: n => `ลบ ${n} ไม่ได้ เพราะมีโพสต์ใช้อยู่`,
      campaignNameDup: n => `มี Campaign ชื่อ "${n}" แล้ว`,
      phaseCampaignRequired: 'ยังไม่ได้เลือก Campaign',
      phaseCampaignMissing: 'ไม่พบ Campaign นี้',
      phaseDatesRequired: 'ใส่วันเริ่มและวันสิ้นสุด',
      phaseDateInvalid: 'วันที่ไม่ถูกต้อง',
      phaseEndBeforeStart: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',
      phaseBudgetInvalid: 'งบต้องเป็นตัวเลข 0 ขึ้นไป',
      phaseNoBudget: 'ยังไม่ได้ใส่งบ KOL (เว้นไว้ก่อนได้)',
      phaseBudgetBelowCommitted: (budget, committed) => `งบ ${budget} น้อยกว่ายอดผูกพันตอนนี้ ${committed}`,
      phaseOverlap: (a, b, from, to) => `${a} and ${b} overlap ${from}–${to} — posts in this range need a phase`,
      phaseCreatesNeeds: n => `หลังบันทึก จะมีโพสต์ ${n} รายการที่ต้องเลือก Phase เอง`,
      /* CR-06 §4.3 — products */
      perfGrace: 'Grace days ต้องเป็นจำนวนเต็ม 0–30', perfMinPosts: 'Minimum posts ต้องเป็นจำนวนเต็ม 1–20',
      dropPostsMissing: n => `${n} post${n === 1 ? '' : 's'} missing link/date`,
      productCodeRequired: 'ยังไม่ได้ใส่ TR code', productNameRequired: 'ยังไม่ได้ใส่ชื่อสินค้า', productCodeDup: (c, n) => `มี TR code "${c}" แล้ว (${n})`,
      productImportRename: old => `ชื่อเดิม: ${old}`,
      campaignProductsRequired: 'Campaign ใหม่ต้องมีสินค้าอย่างน้อย 1 รายการ', campaignNoProducts: 'Campaign นี้ยังไม่มีสินค้า — เพิ่มได้ภายหลัง',
      productUsedByDeals: (name, n) => `เอา ${name} ออกไม่ได้ เพราะมี ${n} deals เลือกสินค้านี้อยู่`,
      productNotInCampaign: name => `${name} is not a product of this campaign`,
      productRemovedUsed: (name, n) => `${name} มี ${n} deals เลือกอยู่ — deal เหล่านั้นยังเก็บสินค้านี้ไว้`, productKeptNotInCampaign: name => `Product not in campaign: ${name}`, productQty: name => `${name}: qty is a whole number of 1 or more`,
      noProductsSelected: 'No products selected',

      moveStepUnknown: 'Choose a stage',
      moveStepInactive: 'This stage is switched off in Settings',
      moveSame: 'The deal is at this stage already',
      moveDateRequired: 'Enter the date (dd/mm/yyyy)',
      moveAutoDone: (date, names) => `These steps will be marked done on ${date}: ${names}`, autoCompleted: 'auto-completed', completedByMove: 'completed by this move',
      moveBackNote: 'Add a note to move back',
      moveCancelReason: 'Give the cancel reason',
      moveLeaveCancelOnly: step => `A cancelled deal can only go back to where it was (${step})`,
      moveLeaveCancelNote: 'Add a note to bring the deal back',
      moveLeaveCancelUnknown: 'The stage before Cancel is not recorded (old data) — any stage can be picked',
      moveNoPosts: 'Add the posted link to move to Post',
      movePostsIncomplete: n => `${n} post${n === 1 ? '' : 's'} still without a link and post date`,
      moveNoExpectedDraft: n => `No expected Draft ${n} date yet`,
      pillarCannotClear: "The pillar can't be cleared from Confirm QT on",
      campaignOnHold: n => `${n} is on hold — no new deals for now`, campaignCancelledNew: n => `${n} is cancelled — no new deals`,
      campaignCancelledEdit: 'This campaign is cancelled — its deals take only a remark', campaignStatusReason: 'ใส่เหตุผล', campaignStatusUnknown: 'สถานะไม่ถูกต้อง',
      costReasonRequired: 'Paid already — give the reason for the change',
      userNameRequired: 'ต้องใส่ชื่อ', userEmailDomain: d => `Email ต้องลงท้ายด้วย ${d}`, userRoleRequired: 'ต้องเลือก Role',
      userPicTaken: n => `ชื่อ PIC "${n}" มีคนใช้แล้ว`, userLastAdmin: 'ต้องมี Admin ที่ใช้งานอยู่อย่างน้อย 1 คน — เปลี่ยน Role หรือปิดคนนี้ไม่ได้',
      userOpenDeals: (n, c) => `${n} ยังเป็น PIC ของ ${c} deals ที่ยังไม่ปิด — ย้าย PIC ก่อนหรือหลังก็ได้`,
      userPicRename: (a, b, d, k) => `ชื่อ PIC จะเปลี่ยนจาก ${a} เป็น ${b} ใน ${d} deals และ ${k} KOLs`,
      pillarTargetNumber: 'Target ของแต่ละ Pillar ต้องเป็นตัวเลข 0–100', pillarTargetSum: n => `Target ต้องรวมกันได้ 100% (ตอนนี้ ${n}%)`,
      movePillarRequired: 'Choose a pillar to move to Confirm QT or later',
      pillarRequired: 'Choose a pillar to start at Confirm QT or later',
      pillarNotSetInfo: 'Pillar not set',
      moveDraftNotInPlan: (k, m) => `The plan has ${m} draft round${m === 1 ? '' : 's'} — tick Add draft round to move to Draft ${k}`,
      moveAddsRound: (m, k) => `Draft rounds ${m} → ${k}`,
      planDraftsRange: max => `Draft rounds: 1–${max}`,
      planDraftsPassed: n => `Draft ${n} is passed already — the plan can't have fewer rounds`,
      quoteFromDeal: id => `deal:${id}`,

      kolNameRequired: 'Enter the display name',
      kolNoAccount: 'Add at least one account',
      kolBlacklistReason: 'สถานะ Blacklist ต้องใส่เหตุผล',
      kolNameDup: id => `A KOL with this name exists (${id}) — if it is the same person, add the account there or merge later`,
      accPlatform: n => `Account ${n}: choose the platform`,
      accHandle: n => `Account ${n}: enter the handle`,
      accHandleFormat: n => `Account ${n}: a handle has no spaces and no @ in front`,
      accLink: n => `Account ${n}: enter the profile link`,
      accLinkFormat: n => `Account ${n}: use one link that starts with https://`,
      accFollowers: n => `Account ${n}: enter the followers`,
      accFollowersFormat: n => `Account ${n}: followers is a number of 0 or more`,
      accDupInList: (n, m) => `Account ${n}: the same as account ${m}`,
      accTaken: (n, handle, platform, name, id) => `Account ${n}: @${handle} on ${platform} belongs to ${name} (${id})`,
      accLinkHandle: (n, h, handle) => `Account ${n}: the link is @${h}, not ${handle}`,
      accLinkPlatform: (n, p, platform) => `Account ${n}: the link is ${p}, not ${platform}`,
      accDeleteUsed: (handle, platform, n) => `ลบบัญชี @${handle} (${platform}) ไม่ได้ เพราะมีโพสต์ผูกอยู่ ${n} โพสต์`,

      quoteDateInvalid: 'วันที่ไม่ถูกต้อง',
      quoteNumber: label => `${label} ต้องเป็นตัวเลข 0 ขึ้นไป`,
      quoteEmpty: 'ใส่ราคาอย่างน้อย 1 ช่อง หรือใส่หมายเหตุ',
      quoteSourceRequired: 'ใส่ที่มาของราคา',
      quoteAccountOther: 'บัญชีนี้ไม่ใช่ของ KOL คนนี้',

      addCampaignRequired: 'Choose a campaign',
      addPicRequired: 'ยังไม่ได้เลือก PIC',
      addPicMissing: names => `ยังไม่มี PIC: ${names} — เลือก PIC สำหรับคนกลุ่มนี้`,
      addTermMissing: n => `${n} คนยังไม่มี Payment term — เลือก Payment term สำหรับคนกลุ่มนี้`,
      addKolStatus: (name, status) => `${name} is ${status}`,
      addExisting: n => `KOL นี้มี deal ใน Campaign นี้แล้ว ${n} รายการ`,

      mergeSame: 'เลือก KOL คนอื่น (ไม่ใช่คนเดียวกัน)',
      mergeStatus: (name, status) => `${name} มีสถานะ ${status} — สถานะของคนที่คงไว้จะไม่เปลี่ยน`,
      mergePic: (keep, other) => `PIC ต่างกัน: คงไว้ ${keep} (อีกคนเป็น ${other})`,
      mergedFrom: (id, name) => `รวมจาก ${id} (${name})`,

      /* Deals (§8) */
      postN: (n, label) => `Post ${n}${label ? ` (${label})` : ''}`,
      dealCampaignRequired: 'Choose a campaign',
      dealCampaignMissing: 'This campaign is not in the list',
      dealKolRequired: 'Choose a KOL',
      dealKolMissing: 'This KOL is not in KOL Master — pick one from the list or add a new KOL',
      dealPicRequired: 'Choose who the deal is assigned to',
      dealStepRequired: 'Choose a stage',
      dealMoney: label => `${label}: enter ฿0 or more`,
      dealPeriodInt: 'Gencode days: a whole number of 0 or more',
      dateInvalid: label => `${label}: use dd/mm/yyyy`,
      dealLinkFormat: label => `${label}: use one link that starts with https://`,
      dealKolLocked: n => `เปลี่ยน KOL ของ deal นี้ไม่ได้ เพราะมีโพสต์แล้ว ${n} รายการ`,
      postAccountRequired: n => `${n}: choose the account`,
      postAccountOther: n => `${n}: this account is not of the deal's KOL`,
      postNumber: (n, k) => `${n}: ${({ views: 'Views', likes: 'Likes', comments: 'Comments', saves: 'Saves', shares: 'Shares' })[k] || k} ต้องเป็นตัวเลข 0 ขึ้นไป`,
      postLinkFormat: n => `${n}: use one link that starts with https:// (more clips = more posts)`,
      postDup: (n, dealId, kol) => `${n}: this link is already saved in ${dealId} (${kol}) — saving it again counts the work twice`,
      postDupLegacy: (n, dealId, kol) => `${n}: ลิงก์ซ้ำกับ ${dealId} (${kol}) ในข้อมูลเดิม — รอ James ตัดสินว่าจะเก็บแถวไหน`,
      postDupInDeal: (n, m) => `${n}: the same link as post ${m} of this deal`,
      postLinkHandle: (n, h, handle) => `${n}: ลิงก์เป็นของ @${h} ไม่ตรงกับบัญชี @${handle}`,
      postLinkPlatform: (n, p, platform) => `${n}: ลิงก์เป็นของ ${p} แต่บัญชีเป็น ${platform}`,
      postTiktokDate: (n, td, pd) => `${n}: ตาม ID ของคลิปโพสต์วันที่ ${td} แต่กรอกไว้ ${pd}`,
      postNeedsPhase: n => `${n}: the date is not in exactly one phase — pick the phase of this post`,
      postFarOutside: (n, d) => `${n}: ${d} is more than 60 days outside the campaign — check the year`,
      postLate: (n, d) => `${n}: post due ${d} and not posted yet`,
      postNoViews: n => `${n}: โพสต์แล้วแต่ยังไม่มี Views (กรอกทีหลังได้)`,
      metricsNoDate: n => `${n}: มียอดแต่ยังไม่มีวันที่อัปเดตยอด — ตอนบันทึกจะใส่วันนี้ให้`,
      completeNeedsPosts: 'สถานะ Complete ต้องมีโพสต์อย่างน้อย 1 รายการ',
      completePostsIncomplete: n => `สถานะ Complete แต่โพสต์ยังไม่ครบ ${n} รายการ (ต้องมีทั้งวันที่โพสต์และลิงก์)`,
      draftLate: (n, d) => `Draft ${n} was due ${d} and is not in yet`,
      payNoDocs: 'ติ๊กจ่ายเงินแล้ว แต่ยังไม่ได้ติ๊กทำเอกสาร',
      payCancelPaid: 'จ่ายครบแล้ว แต่ deal เป็น Cancel',
      gencodeNoPeriod: 'Enter how many days the Gencode runs',
      draftBeforeBrief: n => `The Draft ${n} date is before the Brief date`,
      campaignOver: amount => `Adding this will exceed the campaign KOL budget by ${amount}`,
      completeUnpaid: 'Complete แล้วแต่ยังไม่จ่ายครบ',
      draftOutsidePlan: (n, m) => `มีวันที่ Draft ${n} แต่แผนมี ${m} รอบ`,
      termRequired: 'Choose a payment term',
      termInvalid: 'Choose a payment term from the list',
      freeWithCost: amount => `Free แต่มีค่าใช้จ่าย ${amount}`,

      /* Lists */
      listEmpty: 'ใส่ค่าก่อน',
      listDup: v => `มี "${v}" อยู่แล้ว`,
      tierNone: 'ต้องมี Tier อย่างน้อย 1 ระดับ',
      tierName: i => `Tier แถวที่ ${i}: ยังไม่ได้ใส่ชื่อ`,
      tierMin: i => `Tier แถวที่ ${i}: Followers ขั้นต่ำต้องเป็นตัวเลข 0 ขึ้นไป`,
      tierZero: 'ต้องมี Tier ที่เริ่มจาก 0 followers',
      tierDupMin: 'Followers ขั้นต่ำซ้ำกัน',
      tierDupName: 'ชื่อ Tier ซ้ำกัน',

      /* KOL import */
      importHeader: cols => `ไฟล์ไม่มีคอลัมน์ ${cols} (ดูไฟล์ตัวอย่าง)`,
      importNoName: 'ไม่มีชื่อ KOL',
      importNoLink: 'ไม่มีลิงก์โปรไฟล์',
      importBadLink: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://',
      importNoPlatform: 'ไม่รู้ว่าเป็น Platform ไหน (ใส่ช่อง platform)',
      importPlatformUnknown: v => `Platform "${v}" ไม่อยู่ในรายการ จะใช้ Platform จากลิงก์แทน`,
      importNoHandle: 'อ่านชื่อบัญชีจากลิงก์ไม่ได้',
      importNumber: k => `${k} ต้องเป็นตัวเลข 0 ขึ้นไป`,
      importIgnored: (k, v) => `${k} "${v}" ไม่อยู่ในรายการ จะไม่นำเข้าช่องนี้`,
      /* CR-08 §4.4 — account / ID numbers belong in Payee › Bank details only */
      sensitive: 'This looks like an account or ID number. Put it in Payee › Bank details (encrypted).',
      importSensitive: k => `${k} ดูเหมือนเลขบัญชี / เลขบัตร — ไม่นำเข้าช่องนี้ (ใส่ใน Payee › Bank details)`,
      restoreScrubbed: n => `ตัดค่าที่ดูเหมือนเลขบัญชี / เลขบัตรออก ${n} ช่อง`,
      /* CR-08 — Settings › Payments · payee */
      payPercent: l => `${l} ต้องเป็นตัวเลข 0–100`, payAmount: l => `${l} ต้องเป็นตัวเลข 0 ขึ้นไป`, payRates: 'ใส่อัตรา WHT เป็นตัวเลข 0–99 คั่นด้วยจุลภาค',
      payDefaultRate: 'อัตรา WHT เริ่มต้นต้องอยู่ในรายการอัตราที่เลือกได้', payBands: 'ขอบช่วงยอดต้องมากกว่า 0 และช่วงที่สองต้องมากกว่าช่วงแรก', payWeekday: 'เลือกวันในสัปดาห์',
      payeeType: 'เลือกประเภทผู้รับเงิน (Individual / Company)', payeeBasis: 'เลือก Price basis (Gross / Net)', payeeLink: 'ลิงก์โฟลเดอร์เอกสารต้องขึ้นต้นด้วย http',
      payeeRequired: l => `ใส่ ${l}`, payeeAccountNo: 'เลขบัญชีต้องเป็นตัวเลข 6–15 หลัก (มี - หรือเว้นวรรคได้)', payeeTaxId: 'เลขผู้เสียภาษีต้องมี 13 หลัก',
      payeeImportNoHandle: 'ไม่มี account_handle', payeeImportDup: 'handle ซ้ำกับแถวก่อนหน้า',
      payAmountPositive: 'ยอดต้องมากกว่า 0', payReimburseUser: 'เลือกพนักงานที่สำรองจ่าย',
      payManualSource: 'เลือก Affiliate หรือ Other', payManualPayee: 'เลือกผู้รับเงิน (หรือสร้าง payee ใหม่)', payManualProject: 'เลือก Campaign หรือพิมพ์ชื่อ Project', payManualDue: 'ใส่วันที่ครบกำหนดจ่าย',
      /* CR-08 §4.6 — run checks */
      runMissing: (n, list) => `${n}: Missing ${list}`, runVerify: n => `${n}: Bank details changed — verify with the KOL before submitting`,
      runGross: n => `${n}: Gross must be more than 0`, runDup: (n, where) => `${n}: this instalment is also in ${where}`,
      runAmount: (n, a, b) => `${n}: amount ${a} differs from the deal (${b})`, runTerm: n => `${n}: payment term not set on the deal`,
      runBig: n => `${n}: 10,000 and above — Accounting to confirm`, runChangedAfter: n => `${n}: Bank details changed after submit — re-export PR`,
      runBorne: (n, x) => `${n}: net basis — WHT borne by company ${x}`, runReimburse: (n, who) => `${n}: Reimburse ${who}`,
      runCancelled: (n, r) => `${n}: line cancelled${r ? ` (${r})` : ''}`, runDealCancelled: n => `${n}: the deal is cancelled`,
      importDupRow: n => `ซ้ำกับแถวที่ ${n} ในไฟล์`,
      importManyNames: ids => `มี KOL ชื่อนี้หลายคน (${ids}) จึงสร้างเป็น KOL ใหม่ — ถ้าเป็นคนเดียวกันใช้ "รวมกับ KOL อื่น…" ทีหลัง`,
      importNoFollowers: 'บัญชีใหม่ต้องมี followers',
      importSource: file => `import:${file}`,
    },
  };

  /* ===================== CR-16 — the KOL profile (modal L + tabs) · more than one payee / shipping address · profile photos ===================== */
  C.profile = {
    tabs: { overview: 'Overview', deals: 'Deals & history', performance: 'Performance', rates: 'Rates', payee: 'Payee & shipping' }, tabsLabel: 'KOL profile',
    payeeCount: (p, a) => `${p} payee${p === 1 ? '' : 's'} · ${a} address${a === 1 ? '' : 'es'}`,
    prevKol: 'Previous KOL (↑)', nextKol: 'Next KOL (↓)',
    sDeals: 'Deals', sCommitted: 'Committed', committedTip: 'Every deal of this KOL that is not cancelled', sLatest: 'Latest rate',
    histFilter: 'Show', hist: { all: 'All', open: 'Open', posted: 'Posted', cancelled: 'Cancelled' }, histNone: 'No deals here',
    campSum: (n, total) => `${n} deal${n === 1 ? '' : 's'} · ${total}`,
    colDeal: 'Deal', colPhase: 'Phase', colStage: 'Stage', colAmount: '฿', colPosted: 'Post date', colCampaign: 'Campaign', colPostDate: 'Post date', colViews: 'Views', colEr: 'ER', colLink: 'Link',
    plannedFor: d => `Planned ${d}`, notPosted: 'Not posted', openPost: 'Open', noPosts: 'No posts yet', postsN: n => `Posts (${n})`,
    rateHistory: 'Rate history', rateHistoryHint: 'What was quoted (rate quotes) and what was agreed in a deal, newest first — free jobs and cancelled deals are not counted',
    kind: { quoted: 'Quoted', agreed: 'Agreed' }, colKind: 'Kind', colFrom: 'Source / Campaign', noRates: 'No rates yet',
    photo: 'Profile photo', uploadPhoto: 'Upload photo', removePhoto: 'Remove photo', photoHint: "Use the KOL's public profile picture only",
    photoDrop: 'Or drop a picture here · paste one (Ctrl / ⌘ + V)', photoOff: "Photos aren't available in this browser",
    photoType: 'ใช้ได้เฉพาะไฟล์ JPG · PNG · WebP', photoTooBig: mb => `ไฟล์ใหญ่ ${mb} MB — ใช้ได้ไม่เกิน 5 MB`, photoFailed: 'บันทึกรูปไม่ได้ — ลองอีกครั้ง',
    cropTitle: n => `Profile photo · ${n}`, cropDrag: 'Drag the picture to place it in the circle', zoom: 'Zoom', savePhoto: 'Save photo',
    photoSaved: kb => `บันทึกรูปโปรไฟล์แล้ว (${kb} KB)`, removeTitle: 'Remove photo?', removeBody: 'รูปจะถูกลบจากเบราว์เซอร์นี้ แสดงเป็นวงกลมตัวอักษรแทน', photoRemoved: 'ลบรูปโปรไฟล์แล้ว',
  };
  Object.assign(C.payee, {
    primary: 'Primary', default: 'Default', defaultTip: 'Used when a deal does not pick another payee / address', defaultOpt: l => `Default · ${l}`,
    payeesN: n => `Payees (${n})`, addressesN: n => `Shipping addresses (${n})`, addPayeeBtn: '+ Add payee', addAddressBtn: '+ Add address',
    noAddresses: 'No shipping address yet', addressHint: 'Each shipment picks one (Ship to) — blank = the default when it is marked shipped',
    lockedNote: 'Bank details and addresses are encrypted', editBtn: 'Edit', setDefault: 'Set as default', archive: 'Archive', restore: 'Restore', del: 'Delete', archived: 'Archived',
    showArchived: n => `Show archived (${n})`, hideArchived: n => `Hide archived (${n})`,
    cannotArchiveDefault: 'Set another payee as default first', cannotArchiveDefaultAddr: 'Set another address as default first',
    cannotDeleteUsed: (l, d) => `Used by ${[l ? `${l} payment line${l === 1 ? '' : 's'}` : '', d ? `${d} deal${d === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} — archive it instead`,
    cannotDeleteDefault: 'Set another one as default first', cannotDeleteAddr: n => `Used by ${n} shipment${n === 1 ? '' : 's'} — archive it instead`, addrUsed: n => `Used by ${n} shipment${n === 1 ? '' : 's'}`,
    defaultSet: l => `ตั้ง ${l} เป็น default แล้ว`, archivedToast: l => `Archive ${l} แล้ว`, restoredToast: l => `กู้ ${l} กลับมาแล้ว`, deletedToast: l => `ลบ ${l} แล้ว`,
    deleteTitle: l => `Delete ${l}?`, deleteBody: 'ลบ payee นี้ถาวร (ยังไม่เคยใช้ใน payment line หรือ deal)', deleteAddrBody: 'ลบที่อยู่นี้ถาวร (ยังไม่เคยใช้ใน shipment)',
    label: 'Label', labelPh: 'e.g. Self · Agency ABC · Manager', labelHint: 'A name for the team — no account numbers or full names', makeDefault: 'Set as default',
    addrLabelPh: 'e.g. Home · Office · Agency', recipient: 'Recipient', replaceAddress: 'Replace address', replaceAddressHint: 'Type the whole address again — the saved one is replaced',
    addAddressTitle: n => `Add address · ${n}`, editAddressTitle: l => `Edit address · ${l}`, addAddressOk: 'Add address',
  });
  Object.assign(C.samples, {
    shipTo: 'Ship to', shipToDefault: 'Default (when marked shipped)', shipToDefaultL: 'Ship to (default)', noDetails: l => `${l} (no details)`, defaultOpt: l => `Default · ${l}`,
    addAddress: 'Add address', shipToHint: "One of the KOL's shipping addresses — kept on the shipment once it is shipped", shipToMany: "Each shipment goes to its own address (else its KOL's default)",
  });
  Object.assign(C.deal, {
    payTo: 'Pay to', payToDefault: 'Default', payToLocked: n => `${n} payment line${n === 1 ? '' : 's'} already in a run keep${n === 1 ? 's' : ''} its payee`,
    payToSaved: l => `เปลี่ยนผู้รับเงินเป็น ${l} แล้ว`, histPayee: (a, b) => `Pay to: ${a} → ${b}`,
  });
  Object.assign(C.pay, {
    changePayee: 'Change payee', changePayeeTitle: n => `Change payee · ${n}`, changePayeeSub: id => `For ${id} — its lines not in a run follow · the deal's Pay to changes too`,
    payToTip: "Paid to this payee (not the KOL's default)", payeeChanged: l => `เปลี่ยนผู้รับเงินเป็น ${l} แล้ว`,
  });
  Object.assign(C.data, {
    backupTitle: 'Backup', backupDownload: 'Download backup', includePhotos: 'Include photos & draft images', includePhotosHint: (n, size) => `${n} profile photo${n === 1 ? '' : 's'} and draft image${n === 1 ? '' : 's'} (${size}) in this browser — added to the file so a restore elsewhere gets them back`,
    backupSize: mb => `About ${mb} MB`, photosRow: 'Photos', photosKept: 'No photos in the file — the ones in this browser stay', photosRestored: n => `ใส่รูปโปรไฟล์กลับ ${n} รูปแล้ว`,
  });
  Object.assign(C.settings, { photos: 'Photos', photosLine: (n, mb) => `Photos ${n} · ${mb} MB` });
  Object.assign(C.vault, {
    shipWaiting: n => `${n} shipping address${n === 1 ? '' : 'es'} waiting to move · Unlock to finish`,
    actAnother: 'Add as another payee', actReplaceDefault: l => `Replace default (${l})`, importLabel: 'Imported',
  });
  Object.assign(C.msg, {
    labelRequired: 'ใส่ Label', labelLong: n => `Label ยาวได้ไม่เกิน ${n} ตัวอักษร`, labelTaken: v => `KOL นี้มี "${v}" อยู่แล้ว`,
    shipRecipient: 'ใส่ชื่อผู้รับ', shipAddress: 'ใส่ที่อยู่จัดส่ง', payeeImportLabel: 'payee_label ยาวเกิน 40 ตัวอักษร หรือดูเหมือนเลขบัญชี / เลขบัตร',
  });
  C.counts.shipping_addresses = 'Shipping addresses';
  /* ===================== CR-17 — Operations mode (Simple / Full) · Campaign / Phase approval ===================== */
  Object.assign(C.phaseStatus, { pending: 'Pending approval' });
  C.approval = {
    waiting: 'Waiting for manager approval', waitingShort: 'Waiting', submit: 'Submit for approval', resubmit: 'Resubmit',
    needsApproval: 'A manager needs to approve this before deals can be added', askHint: 'Budget, period, pillar target and phase changes wait for a manager’s approval — name, CTA, products and note change now',
    sent: 'Sent for approval', changeSent: 'Change sent for approval', submittedBy: (n, d) => `Submitted by ${n} · ${d}`,
    reason: r => `Reason: ${r}`,
    changePending: 'Change pending', changePendingTip: 'A change waits for a manager — the numbers on screen are today’s until it is approved',
    changeTitle: 'Change pending', colWhat: 'What', colNow: 'Now', colAsked: 'Asked for', changeBy: (n, d) => `Asked by ${n} · ${d}`,
    fStart: 'Start', fEnd: 'End', fDelete: 'Remove', removePhase: 'Remove this phase',
    phasesN: 'Phases', impact: 'Budget of approved campaigns', impactLine: (a, b) => `${a} → ${b}`, newPhases: n => `New phase${n === 1 ? '' : 's'} (${n})`,
    approve: 'Approve', cancelRequest: 'Cancel request', del: 'Delete',
    waitHint: 'Deals can be added once a manager approves it',
    requestCancelled: 'Request cancelled',
    badge: n => `${n} waiting for approval`, approvals: 'Approvals',
  };
  Object.assign(C.msg, {
    campaignNotApproved: n => `${n} ยังรอผู้จัดการอนุมัติ — ยังเพิ่ม Deal ไม่ได้`,
  });
  Object.assign(C.pay.tabs, { sent: 'Sent', paid: 'Paid' });
  Object.assign(C.pay.tabTip, { sent: 'Sent to accounting, not paid yet', paid: 'Paid · WHT certificates' });
  C.pay.sentRunLabel = d => `Sent ${d}`;
  C.pay.simple = {
    sumDue: 'Due now', sumSent: 'Sent, not yet paid', sumPaid: 'Paid this month',
    cards: { due: 'Due', hold: 'On hold', upcoming: 'Upcoming 14 days', check: 'Needs check' },
    filterStatus: { due: 'Due', hold: 'On hold', upcoming: 'Upcoming 14 days', check: 'Needs check' },
    status: { due: 'Due', not_due: 'Not due', on_hold: 'On hold', in_run: 'In a run', sent: 'Sent', paid: 'Paid' },
    markPaid: 'Mark paid', markUnpaid: 'Mark unpaid', confirm: 'Confirm', ref: 'Ref', optional: '(optional)', refPh: 'PR no. · transfer no. — no account numbers',
    markPaidOne: (n, m) => `Mark paid · ${n} · ${m}`, markPaidN: n => `Mark ${n} payment${n === 1 ? '' : 's'} as paid`, sameForAll: 'The same date and ref for every row',
    paidDone: n => `Marked ${n} payment${n === 1 ? '' : 's'} as paid`, undone: 'ย้อนกลับแล้ว', noneToPay: 'ไม่มีรายการที่คุณบันทึกว่าจ่ายแล้วได้',
    onlyManagers: 'Mark unpaid: Admin, KOL Manager or Accounting', unpaidTitle: n => `Mark unpaid · ${n}`, unpaidDone: 'กลับไปที่ To pay แล้ว',
    exportAcc: 'Export for accounting', exportAgain: 'Export again', noneToSend: 'ไม่มีรายการที่ส่งบัญชีได้',
    missingTitle: n => `${n} line${n === 1 ? ' has' : 's have'} missing documents`, missingBody: 'เอกสารไม่ครบไม่ขวางการจ่าย — Export ต่อได้ (ตามไปเก็บเอกสารภายหลัง)', exportAnyway: 'Export anyway',
    sentAsk: n => `Mark ${n} line${n === 1 ? '' : 's'} as sent to accounting?`, sentAskBody: 'They move to Sent and wait there until someone marks them paid.', sentYes: 'Yes, mark as sent', sentNo: 'No',
    sentDone: (n, l) => `ส่งบัญชีแล้ว ${n} รายการ (${l})`, moveBack: 'Move back to To pay', movedBack: 'ย้ายกลับไป To pay แล้ว',
    docsN: (a, b) => `Docs ${a}/${b}`, heldTip: 'On hold — release it first',
    colSent: 'Sent', waitingDays: n => `${n} d`, sentHint: 'Sent to accounting and waiting to be paid — more than 7 days in yellow', noSent: 'Nothing waiting at accounting',
    colPaidBy: 'Paid by', byAccounting: 'Accounting', markWht: 'Mark WHT cert sent', whtSentOn: d => `WHT certificate sent ${d}`, whtCleared: 'ล้างวันที่ส่งใบ 50 ทวิแล้ว', export: 'Export',
    trackToPay: 'To pay', trackSent: 'Sent', trackPaid: 'Paid',
  };
  C.samples.quick = {
    shipped: 'Shipped', delivered: 'Delivered', both: 'Shipped & delivered', markShipped: 'Mark shipped', markDelivered: 'Mark delivered',
    shippedOne: n => `Shipped · ${n}`, shippedN: n => `Mark ${n} shipment${n === 1 ? '' : 's'} shipped`, bothOne: n => `Shipped & delivered · ${n}`, bothN: n => `Shipped & delivered · ${n}`,
    deliveredOne: n => `Delivered · ${n}`, deliveredN: n => `Mark ${n} shipment${n === 1 ? '' : 's'} delivered`, confirm: 'Confirm', optional: '(optional)',
    noAddressOk: 'Send it anyway — the address can be agreed on LINE', changeAddress: 'Change address', editTracking: 'Edit tracking', undoDelivered: 'Undo delivered',
    done: (n, k) => `${k === 'delivered' ? 'Delivered' : k === 'both' ? 'Shipped & delivered' : 'Shipped'} · ${n}`, undone: 'กลับเป็น Shipped แล้ว',
  };
  C.settings.navOpsMode = 'Operations mode';
  C.settings.ops = {
    lead: 'How payments and shipments are recorded. Switching keeps every payment and shipment — the same data is shown another way.',
    simple: 'Your team records when payments are made and samples are shipped', full: 'Payment runs and the Accounting tab handle payments; pick lists for shipping',
    mode: { simple: 'Simple', full: 'Full' }, kind: { payments: 'Payments', shipments: 'Shipments' },
    hint: { payments: { simple: 'To pay · Sent · Paid — Mark paid on the row', full: 'To pay · Payment runs · Accounting' }, shipments: { simple: 'Shipped / Delivered on the row · pick lists in ⋯', full: 'Dialogs and pick lists' } },
    safe: 'Lines already sent show as a run With Accounting in Full mode · Paid stays Paid.', saved: (k, m) => `${k}: ${m} mode`,
  };
  Object.assign(C.overview, { paymentsToConfirm: 'Payments to confirm', approvals: 'Approvals' });
  Object.assign(C.roles.perm, {
    'campaign.draft': 'Create Campaign & Phase (waits for approval) · change name, CTA, products, note · ask for budget / period / pillar target / phase changes',
    'settings.ops': 'Settings › Operations mode',
  });
  /* ===================== CR-17 v1.2 — the Approvals page (one card a request) · Status order · Note to approver ===================== */
  Object.assign(C.approval, {
    tabApprovals: 'Approvals', tabMine: 'My requests', fPending: 'Pending', fDecided: 'Decided', typeL: 'Type', typeAll: 'All types',
    types: { new_campaign: 'New campaign', new_phase: 'New phase', change: 'Change', budget_increase: 'Budget increase', budget_decrease: 'Budget decrease', budget: 'Budget' },
    submittedAgo: (n, d, ago) => `Submitted by ${n} · ${d} · ${ago}`, ago: n => (n <= 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago`),
    startsIn: n => `Starts in ${n} day${n === 1 ? '' : 's'}`, startsToday: 'Starts today', startedAgo: n => `Started ${n} day${n === 1 ? '' : 's'} ago`, startsOn: d => `Starts ${d}`,
    days: n => `${n} day${n === 1 ? '' : 's'}`, kPeriod: 'Period', kBudget: 'Budget', kPhases: 'Phases', kPillar: 'Pillar target', kProducts: 'Products', kCta: 'CTA', kImpact: 'Impact', kCampaign: 'Campaign',
    sameTime: (a, b) => `Budget of campaigns running at the same time ${a} → ${b}`, noPeriod: 'No dates yet',
    overlaps: (n, a, b) => `Overlaps ${n} on ${a}–${b}`, phaseTotal: (a, b) => `Phase budgets ${a} of ${b} campaign budget`, phaseOver: x => `Over the campaign budget by ${x}`, noCampaignBudget: 'The campaign has no budget',
    colField: 'Field', colCurrent: 'Current', colRequested: 'Requested', postsMove: (n, d) => `${n} post${n === 1 ? '' : 's'} of ${d} deal${d === 1 ? '' : 's'} will move phase`, noMove: 'No post moves phase',
    approvedBy: (n, d) => `Approved by ${n} · ${d}`,
    emptyPending: 'Nothing is waiting for approval', emptyMine: 'You have no requests waiting', emptyDecided: 'Nothing decided yet', emptyType: 'No request of this type',
    undone: 'Undone',
    noteL: 'Note to approver', noteOptional: '(optional)', notePh: 'Anything the approver should know', noteFrom: n => `Note from ${n}`,
    budgetLine: (a, b, d) => `Current ${a} → New ${b} (${d})`, usedLine: (a, b) => `Used ${a} → ${b}`, committedL: 'Committed', allocTitle: 'Allocations', reasonL2: 'Reason',
    someone: 'Someone', waitingFor: 'Waiting for a manager',
  });
  C.budget = {
    adjust: 'Adjust budget', title: n => `Adjust budget · ${n}`, secBudget: 'Budget',
    current: 'Current', budgetL: 'Budget', committedL: 'Committed', usedL: p => `Used ${p}`, remainingL: 'Remaining',
    pendingN: (n, x) => `${n} request pending ${x}`, type: 'Type', increase: 'Increase', decrease: 'Decrease', amount: 'Amount', newBudget: x => `New budget ${x}`,
    allocateTo: 'Allocate to', colPhase: 'Phase', colNow: 'Current', colChangeInc: '+ ฿', colChangeDec: '− ฿', colNew: 'New', unallocated: 'Unallocated',
    allIn: 'Put all in Unallocated', splitPct: 'Split by current %', reason: 'Reason', reasonPh: 'e.g. Sales are strong — a second round of KOLs', note: 'Note to approver',
    submit: 'Submit for approval', apply: 'Apply', cancelRequest: 'Cancel request',
    allocatedOf: (a, b) => `Allocated ${a} of ${b}`, belowCommitted: x => `Can't go below committed ${x}`, onlyUnallocated: x => `Only ${x} is unallocated`,
    amountRequired: 'Enter an amount above ฿0', amountInvalid: 'Numbers only, ฿0 or more', reasonRequired: 'Add a reason', onePending: n => `${n} request pending`,
    notApproved: 'The campaign is waiting for approval — change its budget in the Phase Planner', noCampaign: 'Campaign not found',
    pendingTag: x => `${x} pending`, pendingTip: (n, d, r) => `Asked by ${n} · ${d}${r ? ` · ${r}` : ''}`,
    history: 'Budget history', hDate: 'Date', hType: 'Type', hAmount: '฿', hAfter: 'Budget after', hPhases: 'Phases', hBy: 'Requested by', hDecided: 'Approved by', hStatus: 'Status', hReason: 'Reason',
    types: { initial: 'Initial', increase: 'Increase', decrease: 'Decrease' }, statuses: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' },
    system: 'System', noHistory: 'No budget yet', readOnlyHint: 'The approved budget — change it with Adjust budget',
    sent: 'ส่งคำขอปรับงบให้อนุมัติแล้ว', applied: n => `ปรับงบ ${n} แล้ว`, cancelled: 'ยกเลิกคำขอปรับงบแล้ว', noBudgetYet: 'No budget yet',
  };
  Object.assign(C.planner, {
    colAmount: 'Amount (฿)', colBudgetPct: 'Budget %', addBudgetFirst: 'Add the campaign budget first', even: 'Even', fillRemaining: 'Fill remaining',
    evenTip: 'The same amount for every phase — what is left over goes to the last one', fillTip: 'The row you are in (or the last one) gets what is not allocated yet',
    barEven: (a, b) => `Allocated ${a} of ${b} (100%)`, barUnder: (u, t, b) => `Unallocated ${u} · phases total ${t} of ${b}`, barOver: x => `Over budget by ${x}`,
    barNoBudget: "No campaign budget yet — percentages can't be calculated", mismatchTitle: "Phase budgets don't match the campaign budget",
    mismatchBody: x => `Phase budgets don't match the campaign budget (${x}). Save anyway?`, keepEditing: 'Keep editing', unallocatedRow: 'Unallocated',
    budgetReadOnly: 'Approved budget', launch: 'Launch-heavy',
  });
  C.msg.planPctNoBudget = "No campaign budget yet — percentages can't be calculated";
  C.approval.askHint = 'Period, pillar target and phase changes wait for a manager’s approval (the budget: Adjust budget) — the rest changes now';
  Object.assign(C.campaign, { adjustBudget: 'Adjust budget', rowMenu: n => `More for ${n}` });
  Object.assign(C.overview, { unallocatedRow: 'Unallocated' });
  Object.assign(C.roles.perm, {
    'campaign.draft': 'Create Campaign & Phase (waits for approval) · change name, CTA, products, note · ask for period / pillar target / phase changes · Adjust budget (waits for approval)',
    'campaign.edit': 'Approve / Reject Campaigns, Phases and budget changes · change period, pillar target and phases at once · Adjust budget at once · On hold / Cancelled',
  });
  /* ===================== CR-19 — Campaign timeline · Pillar Awareness & Consideration · no Pillar target · KOL budget needed ===================== */
  C.pillarShort = { 'Awareness & Consideration': 'Aware + Consider' };
  Object.assign(C.overview, {
    timelineTitle: 'Campaign timeline', timelineSub: (n, d) => `${n} campaign${n === 1 ? '' : 's'} · Today ${d}`,
    timelineTip: 'Each row is a campaign: its dates (the status colour), a thin line where a phase starts, and its posts by week (by day for 45 days or less) — the same scale on every row.',
    outsidePeriod: n => `${n} post${n === 1 ? '' : 's'} outside the campaign period`, rowPosts: n => `${n} post${n === 1 ? '' : 's'}`,
    colStart: 'Start', colEnd: 'End', colPostsPosted: 'Posts posted', colPostsPlanned: 'Posts planned', colSpendL: 'Spend', colFirstPost: 'First post', colLastPost: 'Last post',
    colWeekMon: 'Week (Mon)', colDayL: 'Day', tlWeek: (a, b) => `${a}–${b}`, tlPhase: p => `Phase · ${p}`, tlPhaseStart: (p, d) => `${p} starts ${d}`,
    tlSpan: { period: 'Period', status: 'Status', budget: 'Budget', committed: 'Committed', used: 'Used', posts: 'Posts' }, tlOutside: 'outside the campaign period',
    showAll: 'Show all', allocTip: 'Committed money of this campaign (and each phase) by the pillar of the deal — what is, no target.',
  });
  Object.assign(C.overview.sheet, { timeline: 'Campaign timeline' });
  Object.assign(C.overview.file, { timeline: 'Campaign_timeline' });
  Object.assign(C.planner, { budgetRequired: 'Enter the KOL budget', budgetFirst: 'Enter the KOL budget to use Budget %' });
  /* ===================== CR-20 — New deal (From KOL Master · New KOL) · Deal modal · Move stage by target · Package · Draft notes ===================== */
  Object.assign(C.bulk, {
    assignTo: 'Assign to', assignHint: 'Owner of the new deals', me: n => `Me (${n})`, kolOwner: 'KOL owner', kolOwnerTip: 'The PIC who looks after this KOL in KOL Master',
    startAt: 'Start at', workedIn: 'Worked in', workedInAny: 'Any campaign', postedOnly: 'Posted only', colLastCampaign: 'Last campaign',
    selectedH: n => `Selected (${n})`, colRate: 'Latest rate', rate: 'Rate (฿)', postDue: 'Post due', toPhase: p => `→ ${p}`, term: 'Payment term', uses: 'Uses',
    setPostDueAll: 'Set post due for all', setDueTitle: 'Post due for every selected KOL', apply: 'Apply',
    remainingLine: (a, b) => `Remaining ${a} → after adding ${b}`, noBudgetLine: 'This campaign has no KOL budget yet',
    willAddSkip: (n, m) => `Will add ${n} · Skip ${m}${m ? ' (already in campaign / blacklisted)' : ''}`, withoutDue: n => `${n} without post due`,
    rowsNeed: (n, what) => `${n} row${n === 1 ? ' needs' : 's need'} ${what}`, needRate: 'a rate', needTerm: 'a payment term', needPackage: 'a package',
    addDeals: n => `Add ${n} deal${n === 1 ? '' : 's'}`, addOpenFirst: 'Add & open first', removeRow: n => `Remove ${n}`,
    secKol: 'New KOL', secKolSub: 'Saved to KOL Master', secDealD: 'Deal', addAnotherAccount: '+ Add another account', removeAccount: 'Remove',
    createKolDeal: 'Create KOL & deal', createNextKol: 'Create & next', kolDealCreated: (n, id) => `${n} added to KOL Master · ${id} created`,
    alreadyIn: n => `Already in KOL Master: ${n}`, useThisKol: 'Use this KOL', tierAuto: 'Tier',
  });
  Object.assign(C.deal, {
    prevDeal: 'Previous deal (←)', nextDeal: 'Next deal (→)', navOf: (i, n) => `${i} of ${n}`, backToKol: k => `‹ Back to ${k}`, dealModal: 'Deal',
    pkgBadge: 'PKG', pkgTip: 'Paid through a package', scriptLink: 'Script link', openLink: 'Open link',
  });
  Object.assign(C.deal.f, { script_link: 'Script link', package_id: 'Package', package_units: 'Uses' });
  C.move = {
    title: (id, kol) => `Move stage · ${id} · ${kol}`, now: 'Now:', to: 'Move to', date: 'Date', postDate: 'Post date', note: 'Note', reason: 'Cancel reason', move: 'Move', cancel: 'Cancel',
    secQt: 'Confirm QT details', secCosts: 'Costs', secSteps: 'Steps completed by this move', alsoContacted: 'Also mark Contacted', secNext: 'Next expected', secLinks: 'Links', secPost: 'Post',
    stepsHint: 'Each step gets a date — in order, none in the future', drafts: 'Drafts in the plan',
    rateCard: 'Rate card (฿)', gencodeCost: 'Gencode cost (฿)', gencodeDays: 'Gencode days', gencodeStart: 'Gencode start', assetFee: 'Asset fee (฿)', expeditingFee: 'Expediting fee (฿)', totalCost: 'Total cost',
    includesBasket: x => `Includes basket fee ${x}`, zeroHint: '฿0 = no fee, product only', totalLine: x => `Total ${x}`,
    budgetLine: (a, b) => `Campaign remaining ${a} → ${b} after this move`, toPhase: p => `→ ${p}`,
    term: 'Payment term', chooseTerm: 'Choose a term', pillar: 'Pillar', choosePillar: 'Choose a pillar', postDue: 'Post due',
    package: 'Package', choosePackage: 'Choose a package', uses: 'Uses', fromPackage: 'From package', willUse: (n, left) => `Will use ${n} · ${left} left`, newPackage: '+ New package',
    pkgOption: (label, left) => `${label} — ${left} left`,
    expDraft: k => `Expected Draft ${k} date`, expScript: 'Expected script date', expApprove: 'Expected approve date', plusDays: n => `+${n}d`,
    addRound: k => `+ Add Draft ${k} round`, removeRound: 'Remove', addTargetRound: k => `Add Draft ${k} to the plan`,
    notNeeded: 'Not needed', doneOn: 'Done on', approveDate: 'Approve date', postedLink: 'Posted link', addPostRow: '+ Add another post', removePostRow: 'Remove', markDelivered: 'Mark sample as delivered',
    account: 'Account', chooseAccount: 'Choose an account', briefLink: 'Brief link', scriptLink: 'Script link', linkPh: 'https://',
    checklist: { costs: 'Costs', approve: 'Approve date', link: 'Posted link', brief: 'Brief link', script: 'Script link' },
    errBox: n => `${n} thing${n === 1 ? '' : 's'} to fix before moving`, done: (id, step) => `${id} → ${step}`, undone: 'Move undone',
  };
  Object.assign(C.msg, {
    moveRateRequired: 'Enter the rate card to move to Confirm QT or later', moveGencodeDays: 'Enter how many days the Gencode runs',
    movePostLink: 'Add the posted link to move to Post', moveExpectedDraft1: 'Enter the expected Draft 1 date',
    moveExpectedBefore: "Expected date can't be before the move date", moveExpectedAfterDue: d => `After the post due (${d})`,
    linkHttps: 'Use a link that starts with https://', moveMoney: label => `${label}: enter ฿0 or more`, moveDays: 'Gencode days: a whole number of 1 or more',
    moveStepDate: s => `Enter the date of ${s}`, moveStepsOrder: (a, b) => `${b} can't be before ${a}`, moveStepFuture: s => `${s} can't be in the future`,
    moveDateBeforeSteps: "The date can't be before the steps it completes", moveApproveDate: 'Enter the approve date',
    moveApproveOrder: (n, d) => `The approve date can't be before Draft ${n} (${d})`, movePostBeforeApprove: "The post date can't be before the approve date",
    movePostFuture: "The post date can't be in the future", moveDraftDone: k => `Draft ${k} is done — the drafts before it are done too`,
    packageRequired: 'Choose a package', packageUnits: 'Uses: a whole number of 1 or more', packageInactive: 'This package can no longer be used',
    packageNotEnough: n => `Not enough left in this package (${n} left) — choose another payment term or add a package`,
    pkgName: 'Give the package a name', pkgUnits: 'Posts: a whole number of 1 or more', pkgPrice: 'Total price: enter an amount above ฿0',
    pkgBelowUsed: n => `Posts can't be fewer than used (${n})`, pkgValid: "Valid until can't be before the start date", pkgStart: 'Start date: use dd/mm/yyyy', pkgPayee: 'This payee is not of this KOL',
    noteImagesMax: n => `Up to ${n} images per draft`, noteNotImage: 'Only image files can be added', noteLinks: 'Links: one link that starts with https:// each',
    rowsRate: n => `${n} row${n === 1 ? ' needs' : 's need'} a rate`,
  });
  C.pkg = {
    sec: 'Packages', hint: 'Prepaid posts for this KOL — any campaign can use them', none: 'No packages yet', add: '+ Add package', edit: 'Edit', archive: 'Archive',
    col: { name: 'Name', posts: 'Posts', price: 'Price', unit: 'Unit price', used: 'Used', remaining: 'Remaining', valid: 'Valid until', payment: 'Payment', status: 'Status', kol: 'KOL' },
    status: { active: 'Active', used_up: 'Used up', expired: 'Expired', archived: 'Archived' }, unused: n => `${n} unused`,
    pay: { to_pay: 'To pay', sent: 'Sent', paid: 'Paid' },
    addTitle: k => `Add package · ${k}`, editTitle: n => `Edit ${n}`, fName: 'Name', fPosts: 'Posts', fPrice: 'Total price (฿)', fUnit: 'Unit price', fStart: 'Start date',
    fValid: 'Valid until', fPayee: 'Payee', fNote: 'Note', payeeDefault: 'Default payee', defaultName: (n, p) => `${n} posts · ${p}`, save: 'Save', create: 'Add package',
    created: n => `Package added: ${n}`, saved: n => `Package saved: ${n}`, archived: n => `Package archived: ${n}`,
    archiveAsk: n => `Archive ${n}?`, archiveBody: 'It can no longer be picked for a deal. Deals that use it keep it.',
    chip: n => `Package · ${n} left`, label: (n, p) => `${n} posts · ${p}`, payRow: (k, n) => `Package · ${k} · ${n} posts`,
    paidVia: 'Paid via package', notPaid: 'Package not paid yet', cardLine: (label, used, left) => `Package · ${label} · Used ${used} · ${left} left`, plusExtras: (a, b) => `Package ${a} + extras ${b}`,
    balance: 'Prepaid package balance', balanceTip: 'Paid packages × posts not used yet — not counted in any campaign',
    hist: { package_created: 'Package added', package_updated: 'Package changed', package_archived: 'Package archived', package_paid: 'Package paid' },
    sheet: 'Packages', exportCols: ['KOL', 'Name', 'Posts', 'Price', 'Unit price', 'Used', 'Remaining', 'Status', 'Payment'],
  };
  C.notes = {
    title: n => `Draft ${n} notes`, note: 'Note', notePh: 'What the KOL sent · what to change', links: 'Links', addLink: '+ Add link', images: 'Images', addImages: 'Add images',
    dropHint: 'Choose files, drop them here, or paste (Ctrl / ⌘ + V)', warn: 'Content screenshots only — no ID cards, bank details or personal documents',
    counts: (l, i) => [l ? `📎 ${l}` : '', i ? `🖼 ${i}` : ''].filter(Boolean).join(' · '), panel: (n, d) => `Draft ${n}${d ? ` · ${d}` : ''}`,
    edit: 'Edit', save: 'Save', cancel: 'Cancel', close: 'Close', none: 'No notes for this draft yet', saved: n => `Draft ${n} notes saved`,
    delImage: 'Delete image', delAsk: 'Delete this image?', delBody: 'It is removed from this browser.', delOk: 'Delete', prev: 'Previous image', next: 'Next image',
    imagesOff: "Images aren't available in this browser (IndexedDB is off)", removeLink: 'Remove link', imageN: (i, n) => `${i} / ${n}`, histNote: n => `Draft ${n} notes`,
    sheet: 'Draft notes', exportCols: ['Deal', 'Draft', 'Links', 'Images', 'Updated'],
  };
  Object.assign(C.pay, { packageBalance: 'Prepaid package balance' });
  /* ===================== CR-21 — Collapse all / Sort · Deals Year · Save draft · Approval review · Return to draft / Resubmit · Edit = Phase Planner ===================== */
  C.phaseStatus.draft = 'Draft';
  C.budget.statuses = { draft: 'Draft', pending: 'Pending', approved: 'Approved', cancelled: 'Cancelled' };
  C.request = {
    fName: 'Name', fBudget: 'KOL budget', fProducts: 'Products', fNote: 'Note', fPeriod: 'period', fPhaseBudget: 'budget', fLabel: 'label', fPillar: 'default pillar', fRemove: 'removal',
    fPhase: (name, what) => `${name} ${what}`, yes: 'Yes', fType: 'Type', fAmount: 'Amount', fReason: 'Reason', fAlloc: n => `Allocation · ${n}`,
    added: n => `${n} added`, removed: n => `${n} removed`, phaseLine: (period, budget) => [period, budget].filter(x => x && x !== '—').join(' · ') || '—',
    nChanges: n => `${n} change${n === 1 ? '' : 's'}`, reasonMin: n => `Add a reason (${n} characters or more)`,
  };
  Object.assign(C.approval, {
    saveDraft: 'Save draft', resubmitFor: 'Resubmit for approval', submitChanges: 'Submit changes for approval', saveChanges: 'Save changes', noChanges: 'No changes',
    review: 'Review', reviewRequest: 'Review request', withdraw: 'Withdraw to draft', returnToDraft: 'Return to draft', returnedChip: 'Returned', draftChip: 'Draft',
    round: n => `Round ${n}`, edit: 'Edit', deleteDraft: 'Delete draft', fDrafts: 'Drafts', fMyDrafts: 'My drafts',
    pendingBar: (n, d, r) => `Pending approval · Submitted by ${n} · ${d} · Round ${r}`, returnedBar: (n, d, r) => `Returned by ${n} · ${d} — ${r}`,
    changeReturned: r => `Change returned — ${r}`, editingMovesBack: 'Editing moves this back to draft', returnedRound: n => `Returned · Round ${n}`, approvedRound: n => `Approved · Round ${n}`,
    secWhatChanged: 'What changed since last round', prevReason: (n, r) => `Returned in Round ${n}: ${r}`, nothingChanged: 'Nothing changed since the last round',
    secCampaign: 'Campaign', secPhases: 'Phases', secBudgetCtx: 'Budget context', secHistory: 'History', secDecision: 'Decision', secRequest: 'Request',
    comment: 'Comment', commentHint: 'Optional to approve · needed to return it (5 characters or more)', commentPh: 'What should change, or a note for the record',
    scrollToApprove: 'Scroll to the end to approve', jumpDecision: 'Jump to decision ↓', readOnly: 'Read only — waiting for Admin / KOL Manager',
    prevReq: 'Previous request', nextReq: 'Next request', nOfM: (i, n) => `${i} of ${n}`, reviewTitle: (t, n) => `${t} · ${n}`,
    approvedToast: n => `Approved ${n}`, returnedToast: n => `Returned ${n} to draft`, withdrawnToast: n => `${n} moved back to draft`, allDone: 'Nothing else is waiting for approval',
    deleteDraftTitle: n => `Delete draft ${n}?`, deleteDraftBody: 'The draft and its phases are deleted. This can’t be undone.', draftDeleted: n => `Draft deleted · ${n}`,
    cancelRequestTitle: n => `Cancel the request on ${n}?`, cancelRequestBody: 'The campaign keeps what it has now.',
    draftSaved: n => `Draft saved · ${n}`, sentRound: (n, r) => `${n} sent for approval · Round ${r}`, changesSaved: n => `Changes saved · ${n}`,
    saveAsDraftTitle: 'Save as draft?', saveAsDraftBody: 'You have changes that are not saved yet.', discard: 'Discard', keepEditing: 'Keep editing',
    emptyDrafts: 'No drafts', emptyMinePending: 'Nothing of yours is waiting for approval', badgeReturned: n => `${n} returned to you`,
    hist: { draft_saved: 'Draft saved', submitted: 'Submitted', resubmitted: 'Resubmitted', withdrawn: 'Withdrawn to draft', returned: 'Returned to draft', approved: 'Approved',
      change_requested: 'Submitted', change_approved: 'Approved', change_cancelled: 'Request cancelled', draft_deleted: 'Draft deleted', rejected: 'Returned to draft', change_rejected: 'Returned to draft' },
    histLine: (what, n, d, r) => `${what} · ${n} · ${d}${r ? ` · Round ${r}` : ''}`, overlapsNone: 'No other approved campaign runs at the same time',
    kName: 'Name', kNote: 'Note', kUnallocated: 'Unallocated', colPhase: 'Phase', colLabel: 'Label', colPeriod: 'Period', colBudget: 'Budget', colPct: '%',
    sameTimeRow: (n, a, b) => `${n} · ${a} – ${b}`, sameTimeTotal: (a, b) => `With this one ${a} → ${b}`, notThere: 'This request is no longer waiting',
    returnHint: 'The request goes back to its maker as a draft with your reason',
  });
  Object.assign(C.campaign, {
    collapseAll: 'Collapse all', expandAll: 'Expand all', sortL: 'Sort', sorts: { status: 'Status', start_asc: 'Start date · earliest first', start_desc: 'Start date · latest first' },
    nPhases: n => `${n} phase${n === 1 ? '' : 's'}`, editIt: 'Edit',
  });
  Object.assign(C.planner, {
    editTitle: n => `Edit ${n}`, hasDeals: n => `Has ${n} deal${n === 1 ? '' : 's'} — move them first`, dealsMove: n => `${n} deal${n === 1 ? '' : 's'} will move to another phase`,
    fNote: 'Note', notePh: 'Anything the team should know about this campaign',
  });
  /* the Campaign / Phase / Plan checks the Phase Planner shows (English, as every UI label) */
  Object.assign(C.msg, {
    campaignNameRequired: 'Enter the campaign name', campaignNameDup: n => `A campaign named "${n}" already exists`,
    planPeriodNeeded: 'Enter the campaign period (start – end) first',
    planPeriodShort: n => `The campaign period is shorter than ${n} days — it can't be split into ${n} phases`,
    planGap: (a, b) => `No phase covers ${a}–${b} — posts in that range need a phase picked by hand`, planDeleteHasPosts: n => `${n} has posts — it can't be deleted`,
    phaseCampaignRequired: 'Choose a campaign', phaseCampaignMissing: 'Campaign not found', phaseDatesRequired: 'Enter the start and end dates', phaseDateInvalid: 'The date is not valid',
    phaseEndBeforeStart: 'The end date must be on or after the start date', phaseBudgetInvalid: 'The budget is a number of 0 or more', phaseNoBudget: 'No KOL budget yet (it can wait)',
    phaseBudgetBelowCommitted: (budget, committed) => `Budget ${budget} is below what is committed now (${committed})`, phaseCreatesNeeds: n => `After saving, ${n} post${n === 1 ? '' : 's'} will need a phase picked by hand`,
    campaignProductsRequired: 'A new campaign needs at least 1 product', campaignNoProducts: 'This campaign has no products yet — they can be added later',
    productUsedByDeals: (name, n) => `${name} can't be removed — ${n} deals use it`, productRemovedUsed: (name, n) => `${n} deals use ${name} — they keep it`,
    campaignNotApproved: n => `${n} is waiting for a manager's approval — no deal can be added yet`,
  });
  Object.assign(C.deal, {
    year: 'Year', allYears: 'All years', allCampaignsIn: y => `All campaigns in ${y}`, showingYear: y => `Showing ${y} campaigns`,
    ongoingBefore: (n, y) => `${n} ongoing campaign${n === 1 ? '' : 's'} started in ${y}`, show: 'Show',
  });
  Object.assign(C.roles.perm, {
    'campaign.draft': 'Create Campaign & Phase as a draft · submit it for approval · ask for changes · Adjust budget (waits for approval)',
    'campaign.edit': 'Approve / Return to draft Campaigns, Phases and budget changes · change them at once · Adjust budget at once · On hold / Cancelled',
  });
  /* ===================== CR-22 — Rate card not filled for you · CTA at Contacted · Sample shipment at Confirm QT · New KOL from a search · Deal modal tabs ===================== */
  C.samples.method = { npd: 'NPD', warehouse: 'Warehouse', self_purchase: 'KOL buys own' };
  Object.assign(C.samples.status, { kol_purchase: 'KOL purchase', purchased: 'Purchased' });
  Object.assign(C.samples, {
    markPurchased: 'Mark purchased', unmarkPurchased: 'Undo purchased', purchasedOn: 'Purchased on', colMethod: 'Method', allMethods: 'All methods', methodsTitle: 'Shipment methods',
    methodsHint: 'The words people see · the keys stay the same', methodsSaved: 'Shipment methods saved', purchasedDone: n => `Purchased · ${n}`,
    summary: (m, items, st) => [m, items, st].filter(Boolean).join(' · '),
  });
  Object.assign(C.msg, {
    moveCtaRequired: 'Choose a CTA to move to Contacted or later', shipMethodRequired: 'Choose how the samples are sent', shipItemsRequired: 'Choose at least one product',
    shipQtyWhole: 'Qty is a whole number of 1 or more', dealsPicRequired: 'Choose who the deals are assigned to',
  });
  Object.assign(C.move, {
    cta: 'CTA', chooseCta: 'Choose a CTA', chooseMethod: 'Choose a method', lastRate: (x, c, d) => `Last rate card ${x}${c ? ` · ${c}` : ''}${d ? ` · ${d}` : ''}`, noRate: 'No rate on file', useLastTip: 'Put this rate in the box',
    secShip: 'Sample shipment', method: 'Method', products: 'Products', qty: 'Qty', shipTo: 'Ship to', chooseLater: 'Choose later', purchaseAmount: 'Purchase amount (฿)',
    purchaseHint: 'Paid back to the KOL — added to Total cost as Product purchase', shipNote: 'Shipment note', noCampaignProducts: 'This campaign has no products yet — add them in Campaign & Phase',
    shipExists: 'Sample shipment', editShip: 'Edit', productPurchase: 'Product purchase',
  });
  Object.assign(C.bulk, { createNewKol: q => `Create "${q}" as new KOL`, noKolMatch: q => `No KOLs match "${q}"`, clearOther: 'Clear other filters', ctaAll: 'CTA', methodAll: 'Sample method' });
  Object.assign(C.deal, {
    tabs2: { overview: 'Overview', costs: 'Costs & payment', timeline: 'Timeline & content', ships: 'Shipments & posts', history: 'History' },
    missing: 'Missing:', missingKey: { pic: 'Assigned to', cta: 'CTA', rate_card: 'Rate card', pillar: 'Pillar', payment_term: 'Payment term' }, assign: 'Assign',
    cardDeal: 'Deal', cardMoney: 'Money', cardNext: 'Next', nextStep: 'Next step', nextDue: 'Due', postDueL: 'Post due', shipmentL: 'Shipment', payStatus: 'Payment status',
    colStep: 'Step', colExpected: 'Expected', colDone: 'Done', colLinks: 'Links / notes', noNext: 'Nothing next',
  });
  /* ===================== CR-23 — Products given · Cancelled report · Next due · Drag to Post / Cancel · Ship by · Post date outside the Campaign · Deal modal ===================== */
  C.cancel = {
    reasons: { kol_declined: 'KOL declined', price: 'Price not agreed', no_response: 'No response from KOL', schedule: "Schedule doesn't fit", content: 'Content not approved', brand_change: 'Brand / campaign change', other: 'Other' },
    title: (id, kol) => `Cancel deal · ${id} · ${kol}`, reason: 'Reason', chooseReason: 'Choose a reason', detail: 'Detail', detailHint: 'Needed when the reason is Other', date: 'Date',
    impact: 'What this does', releases: x => `Releases ${x} from the campaign budget`, alsoShip: 'Also cancel the sample shipment', stays: x => `Stays as it is: ${x}`,
    pkgReturns: n => `Returns ${n} use${n === 1 ? '' : 's'} to the package`, paidWarn: w => `Payment already ${w} — follow up with accounting`, sent: 'sent', paid: 'paid', nothing: 'Nothing else changes',
    ok: 'Cancel deal', keep: 'Keep deal', errBox: n => `${n} thing${n === 1 ? '' : 's'} to fix before cancelling`,
    /* Settings › Lists */
    nav: 'Cancel reasons', hint: 'The reasons people pick when they cancel a deal · Other always stays (it asks for a detail)', label: 'Reason', add: '+ Add reason', addPh: 'e.g. KOL went with a competitor',
    saved: 'Cancel reasons saved', used: n => `${n} deal${n === 1 ? '' : 's'}`, otherFixed: 'Other is always there', dup: 'This reason is already in the list', empty: 'Enter a reason',
  };
  Object.assign(C.msg, {
    cancelReasonRequired: 'Choose a reason', cancelDetailRequired: 'Add a detail — the reason is Other',
    shipByRequired: 'Enter the ship-by date', shipByBeforeMove: l => `${l} can't be before the move date`, shipByAfterDraft1: 'After the Draft 1 due — the KOL may not have the product in time',
    movePostDueRequired: 'Enter the post due', moveExpectedScript: 'Enter the expected script date', moveExpectedDraft: k => `Enter the expected Draft ${k} date`,
    dateBeforeCampaign: (d, s) => `${d} is before this campaign starts (${s})`, dateAfterCampaign: (d, e) => `${d} is after this campaign ends (${e})`, dateBetweenPhases: d => `${d} falls between phases`,
    postInTwoPhases: (n, d) => `${n}: ${d} is in more than one phase — pick the phase of this post`,
    /* §3.8 #7 — the Deal modal's bars in English */
    payNoDocs: "Marked as paid, but documents aren't checked yet", payCancelPaid: 'Fully paid, but the deal is cancelled', completeUnpaid: 'Complete, but not fully paid yet',
    completeNeedsPosts: 'Complete needs at least 1 post', completePostsIncomplete: n => `Complete, but ${n} post${n === 1 ? ' is' : 's are'} not done yet (each needs a post date and a link)`,
    dealKolLocked: n => `The KOL can't change — this deal already has ${n} post${n === 1 ? '' : 's'}`, draftOutsidePlan: (n, m) => `Has a Draft ${n} date, but the plan has ${m} round${m === 1 ? '' : 's'}`,
    freeWithCost: a => `Free, but it has costs of ${a}`, metricsNoDate: n => `${n}: has numbers but no "as of" date — today is used when saved`,
    postDupLegacy: (n, id, kol) => `${n}: the same link as ${id} (${kol}) in the old data — James decides which row stays`, postLinkHandle: (n, h, handle) => `${n}: the link is @${h}'s, not @${handle}`,
    postLinkPlatform: (n, p, pl) => `${n}: the link is ${p}, but the account is ${pl}`, postNoViews: n => `${n}: posted but no Views yet (they can be added later)`,
    postTiktokDate: (n, td, pd) => `${n}: the clip ID says it was posted on ${td}, but ${pd} is entered`,
  });
  Object.assign(C.move, {
    shipBy: 'Ship by', buyBy: 'Buy by', suggested: (d, n, from) => `Suggested: ${d} (${n} day${n === 1 ? '' : 's'} before the ${from === 'draft1' ? 'Draft 1 due' : 'post due'})`, suggestTip: 'Put this date in the box',
    doneCosts: x => `✓ Costs ${x}`, doneQt: '✓ Confirm QT details', doneShip: m => `✓ Shipment ${m}`, doneSteps: '✓ Steps', expandTip: 'Open to change', enterHint: 'Enter = Move',
  });
  Object.assign(C.samples, {
    shipByNotSet: 'Ship by not set', setShort: 'Set', noShipByBar: n => `${n} shipment${n === 1 ? ' has' : 's have'} no ship-by date`, setDates: 'Set dates',
    shipByOn: d => `Ship by ${d}`, buyByOn: d => `Buy by ${d}`, shippedLine: d => `Shipped ${d}`, deliveredLine: d => `Delivered ${d}`, purchasedOn2: d => `Purchased ${d}`, clearShipBy: 'Clear',
  });
  Object.assign(C.deal, {
    postDateWord: 'Post date', postDueWord: 'Post due', changeDate: 'Change date', pickPhase: 'Pick phase', noDueDate: 'No due date', viewCosts: 'View costs ›', viewTimeline: 'View timeline ›',
    useShipProducts: 'Use shipment products', shipProductsSet: id => `${id}: products set from its shipment`, dropPost: 'Drop to mark as posted', dropCancel: 'Drop to cancel',
  });
  Object.assign(C.overview, {
    productsTitle: 'Products given', productsTip: 'The pieces sent (or bought by the KOL) per product — deals not cancelled · from the sample shipments',
    totalPieces: 'Total pieces', toKols: n => `to ${n} KOL${n === 1 ? '' : 's'}`, pctOfTotal: p => `${p}% of total`, reimbursed: x => `${x} reimbursed`,
    colProduct: 'Product', colTrCode: 'TR code', colDelivered: 'Delivered', colToShip: 'To ship', colKols: 'KOLs', notRecorded: 'Product not recorded', notRecordedN: n => `${n} shipment${n === 1 ? '' : 's'}`,
    noProductsSent: "No products sent yet — they're recorded when a deal moves to Confirm QT", productRowTip: 'Open these shipments',
    cancelledTitle: 'Cancelled deals', cancelledLine: (n, x) => `${n} cancelled · ${x} released`, colDealId: 'Deal ID', colCancelledAt: 'Cancelled at', colCancelledOn: 'Cancelled on',
    colReason: 'Reason', colDetail: 'Detail', colValue: 'Value', colAssigned: 'Assigned to', noCancelled: 'No cancelled deals in this campaign', allReasons: 'All',
  });
  Object.assign(C.overview.sheet, { products: 'Products given', cancelled: 'Cancelled' });
  Object.assign(C.overview.file, { products: 'Products_given', cancelled: 'Cancelled_deals' });
  /* ===================== CR-24 — Operations = Work queue · no Pillar allocation ===================== */
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  C.overview.wq = {
    assigned: 'Assigned to', everyone: 'Everyone', unassigned: 'Unassigned', campaigns: 'Campaigns', campDefault: 'Not complete', campAll: n => `All (${n})`, campN: n => pl(n, 'campaign'),
    campDefaultBtn: 'Not complete', campAllBtn: 'All', waiting: 'Waiting on', w: { all: 'All', us: 'Us', kol: 'KOL' },
    tiles: { overdue: 'Overdue', week: 'Due this week', none: 'No due date', stuck: 'Stuck', us: 'Waiting on us' }, noneKol: n => `${n} waiting on KOL`,
    usPart: { shipment: n => pl(n, 'shipment'), payment: n => pl(n, 'payment'), metrics: n => `${n} metrics`, approval: n => pl(n, 'approval') },
    title: 'Work queue', sec: { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later', none: 'No due date' },
    col: { due: 'Due', kol: 'KOL', campaign: 'Campaign', stage: 'Stage', action: 'Next action', waiting: 'Waiting on', inStage: 'In stage', pic: 'Assigned to', bucket: 'Section', stuck: 'Stuck' },
    dueLate: n => `${n} d overdue`, dueToday: 'Today', dueIn: n => `in ${n} d`, days: n => `${n} d`, stuck: n => `Stuck ${n} d`,
    action: { confirm_qt: 'Confirm quotation', send_brief: 'Send brief', script: 'Script from KOL', draft: n => `Draft ${n} from KOL`, approve: 'Approve content', post: 'Post from KOL',
      next: st => st, ship: 'Ship samples', deliver: 'Confirm delivery', pay: 'Pay KOL', metrics: 'Enter metrics', review: 'Review request' },
    btn: { move: 'Move stage', shipped: 'Mark shipped', delivered: 'Mark delivered', paid: 'Mark paid', metrics: 'Enter metrics', review: 'Review', setDate: 'Set date' },
    setTitle: l => `Set ${l}`, dateSet: (l, d) => `${l} set to ${d}`, approval: 'Approval',
    empty: 'Nothing waiting — every piece of work is done', emptyFilter: 'Nothing here with this filter', clearFilter: 'Show all',
    flowTitle: 'Stage flow', avg: n => `avg ${n} d`, stuckN: n => `${n} stuck`, flowFoot: (p, c) => `Posted ${p} · Cancelled ${c}`, flowTip: 'Keep this stage in the Work queue',
    teamTitle: 'Team load', teamTip: 'Show this person’s work', teamCol: { pic: 'Assigned to', open: 'Open deals', overdue: 'Overdue', week: 'Due this week', none: 'No due date', stuck: 'Stuck', us: 'Waiting on us' },
    fixTitle: n => `Data to fix (${n})`, fix: 'Fix', fixNone: 'Nothing to fix',
    fixKind: { missing: k => `Missing: ${k}`, noShipBy: 'Ship by not set', postedNoDate: 'Posted without date', noProducts: 'Campaign without products', noBudget: 'Phase without budget', dupLinks: 'Duplicate post link' },
    stuckDays: 'Stuck after (days)', stuckHint: 'A deal in the same stage longer than this (and not Overdue) shows "Stuck" in Operations', stuckInvalid: 'Enter whole days from 1 to 365', stuckSaved: 'Stuck days saved',
    summaryCard: 'Summary', fixCard: 'Data to fix',
  };
  Object.assign(C.overview.sheet, { workqueue: 'Work queue' });
  Object.assign(C.overview.file, { workqueue: 'Work_queue' });
  /* CR-26 — Dashboard: 4 KPI cards (KOL & Affiliate engaged) · Budget vs Actual by month · Team workload · Operations (since post) */
  Object.assign(C.overview, {
    kEngaged: 'KOL & Affiliate engaged', kEngagedTip: 'Partners (each counted once) with at least one committed deal — from Confirm QT on, not cancelled.',
    engagedDeals: (n, avg) => `${n} committed deals · Avg ${avg} per deal`, notCommittedLine: n => `+${n} in List, not committed yet`,
    dealsDef: (all, list, prog, done, committed, not) => ({ h: 'Committed deals',
      d: `${all} deals are not cancelled: List ${list} · In process ${prog} · Complete ${done} (Shortlist and Contacted included). ${committed} of them are committed — from Confirm QT on (the Committed of CR-05). The other ${not} are Shortlist / Contacted, not agreed yet.`,
      f: 'Avg = Committed ÷ committed deals' }),
    notCommitted: 'Not committed yet', allDealsL: 'Deals not cancelled', partnersL: 'Partners',
    bva: {
      title: 'Budget vs Actual by month',
      tip: 'Budget = each Phase budget spread over its days (Campaign budget no Phase has: over the Campaign’s days). Actual = the Total cost of a committed deal in the month of its first Post date — not the day it is paid. Not posted yet: Upcoming in the month of its Post due, Late once that day has passed.',
      monthly: 'Monthly', cumulative: 'Cumulative', modeL: 'View',
      legend: { budget: 'Budget', posted: 'Posted', upcoming: 'Upcoming', late: 'Late (Post due passed)', cumBudget: 'Budget (cumulative)', cumPosted: 'Posted (cumulative)', cumPlus: 'Posted + upcoming' },
      over: a => `Over ${a}`, behind: a => `Behind ${a}`,
      toDate: (p, b, pct) => `To date: Posted ${p} of ${b} planned (${pct}%)`,
      rest: (label, u, b) => `${label}: ${u} committed upcoming vs ${b} planned`, restYear: 'Rest of year', restPeriod: 'Rest of period', restCampaign: 'Rest of campaign',
      noDate: a => `${a} committed has no post date`, setDates: 'Set dates', outside: (a, n) => `${a} (${n} deal${n === 1 ? '' : 's'}) posted or due outside these months`,
      tip2: { budget: 'Budget', posted: 'Posted', upcoming: 'Upcoming', late: 'Late', variance: 'Variance', top: 'Top campaigns' },
      col: { month: 'Month', budget: 'Budget', posted: 'Posted', upcoming: 'Upcoming', late: 'Late', variance: 'Variance', pct: 'Actual %', status: 'Status' },
      statusWord: { over: 'Over', behind: 'Behind' }, empty: 'No budget and no committed deals in these months', expandTitle: (t, a, b) => `${t} · ${a} – ${b}`,
    },
    team: {
      title: 'Team workload', tip: 'Open this person’s deals of the Campaign in Deals', notAssigned: 'Not assigned', assign: 'Assign', assignTip: 'Deals of this Campaign with nobody assigned',
      col: { pic: 'Assigned to', partners: 'Partners', open: 'Open deals', posted: 'Posted', postOverdue: 'Post overdue', noPostDue: 'No post due', cancelled: 'Cancelled', committed: 'Committed', docs: 'Docs to collect' },
      colTip: { partners: 'KOLs / Affiliates (each once) with a deal not cancelled', open: 'Not posted, not cancelled', postOverdue: 'Open deals whose Post due has passed', noPostDue: 'Open deals with no Post due', committed: 'Committed money of the deals not cancelled' },
      empty: 'No deals in this Campaign yet',
    },
    unscheduledDeals: n => `${n} deal${n === 1 ? ' has' : 's have'} no post date`, setDates: 'Set dates',
  });
  C.overview.wq.sincePost = n => `since post ${n} d`;
  /* CR-27 §3.2 — Payment details · Documents (a checklist, no files) · Send to accounting from the row */
  /* CR-27 §3.3 — the Deal modal over the page it was opened from */
  Object.assign(C.deal, { openInDeals: 'Open in Deals', openInDealsTip: 'Go to the Deals page with this deal' });
  C.samples.addProducts = 'Add products';
  /* CR-27 §3.1 — Campaign & Phase */
  Object.assign(C.planner, { todo: n => `${n} thing${n === 1 ? '' : 's'} to finish`, todoTip: 'What still needs filling in — click one to go to it' });
  Object.assign(C.approval, { view: 'View' });
  C.pay.docs = {
    title: 'Documents', received: 'Received', date: 'Received on', note: 'Note', link: 'Link', notePh: 'Note', linkPh: 'https:// (Google Drive …)', openLink: 'Open link',
    add: '+ Add document', namePh: 'Document name', addOk: 'Add', markAll: 'Mark all received', remove: 'Remove',
    hint: 'Link to where the file is kept — don’t type ID card or bank account numbers here',
    nameRequired: 'Name the document', noNumbers: 'ID card or bank account numbers don’t go here', linkHttps: 'A link starts with https://',
    saved: 'บันทึกเอกสารแล้ว', bulkDone: n => `ติ๊กเอกสารครบแล้ว ${n} รายการ`, none: 'This payment needs no documents (it reimburses staff)',
    auto: { payee: 'On file in the payee profile', bank_details: 'Bank details are in the vault', post_evidence: 'Every post has its link and date' },
    checkDocs: 'Check documents', markDocs: 'Mark docs received',
  };
  C.pay.details = {
    title: 'Payment details', amount: 'Amount', milestone: 'Milestone', due: 'Due date', gross: 'Gross', wht: r => `WHT ${r}%`, net: 'Net', payTo: 'Pay to', change: 'Change',
    noPayee: 'No payee yet', status: 'Status', history: 'History', noHistory: 'Nothing yet', openDeal: 'Open deal', prev: 'Previous payment', next: 'Next payment', navOf: (i, n) => `${i} of ${n}`,
    steps: { topay: 'To pay', sent: 'Sent to accounting', paid: 'Paid' }, dueOn: d => `Due ${d}`, noDue: 'No due date yet',
    stepLine: (d, ref, who) => [d, ref ? `Ref ${ref}` : '', who ? `by ${who}` : ''].filter(Boolean).join(' · '),
    hold: 'Hold', release: 'Release', moveBack: 'Move back', moveBackTitle: 'Move back to To pay', unpaid: 'Mark unpaid', heldLine: (r, who) => `On hold: ${r}${who ? ` · by ${who}` : ''}`,
    fullMode: 'Full mode: payment runs move it (Payments › Payment runs)',
    ev: { open: 'To pay', submitted: 'Sent to accounting', paid: 'Paid', on_hold: 'On hold', released: 'Released', cancelled: 'Cancelled', in_run: 'In a run', not_due: 'Not due', ready: 'To pay', missing_docs: 'To pay' },
    evDocs: (a, b) => `Documents ${a} → ${b}`, evUndo: 'Undo',
  };
  Object.assign(C.pay.simple, {
    send: 'Send', sendAcc: 'Send to accounting', sendOne: (n, m) => `Send to accounting · ${n} · ${m}`, sendN: n => `Send ${n} payments to accounting`, sendOk: 'Send',
    sentDoneN: n => `ส่งบัญชีแล้ว ${n} รายการ`, flow: 'To pay → Send to accounting (optional) → Paid', sentOn: 'Sent on',
  });
  Object.assign(C.overview.sheet, { budgetactual: 'Budget vs Actual', workload: 'Team workload' });
  Object.assign(C.overview.file, { budgetactual: 'Budget_vs_Actual', budgetactual_camp: 'Budget_vs_Actual', workload: 'Team_workload' });
  return C;
})();
