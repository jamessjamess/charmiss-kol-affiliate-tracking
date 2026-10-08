# UI patterns — Charmiss KOL Tracker

How screens are built so every page behaves the same. Labels are English in `src/content.js`; messages and toasts may be Thai. Started with CR-11 (06/10/2026).

## 1. Which container (CR-11 §4.1)

| What the person does | Container | Why |
|---|---|---|
| **Make something new** — New · Add · Create · Import · Plan | **Create modal** in the middle of the screen (`ui.createModal`) | One job at a time, room to work, the page behind waits |
| **Look at / change something that exists** — click a row or a card | **Drawer** on the right, 60% wide (CR-10 §4.13) | The list stays in view; you can move from one record to the next |
| A short question — Discard changes? · Delete? · Remove anyway? | **Confirm dialog** (small, `ui.confirmDialog`) | — |
| **The main job of a page** (CR-17) | **A button on the row** (Mark paid · Shipped · Delivered) — never only in ⋯ · its few fields in a small form beside it (§13) | One click for the work done most |
| **Exception — a KOL** (CR-16 §4.1) | **KOL profile modal L + tabs** (`KT.profile`, §12) | A KOL has many kinds of data; one long drawer was hard to search · Deal / Campaign / Shipment stay drawers |

- Adding a **child** while a drawer is open (an account or a rate in the KOL drawer, a post or a shipment in the Deal drawer) opens a modal over the drawer — one layer only. Closing it goes back to the same drawer, which shows the new item.
- **Never a modal on top of a modal.** Making something else on the way (Create KOL inside New deal, New product inside the Phase Planner, Add account / Add products inside New deal) replaces the modal's content with a **panel**: "← Back …", its own footer, then back to the form with everything typed still there (`ui.modalPanel`, or the screen's own panel).
- A flow that needs another create flow first (Add manual line → + New payee) steps aside: the first modal closes keeping what was typed, the second opens, and the first comes back with the new item picked.

## 2. `ui.createModal(o)` — sizes and parts

| Size | Width | Height | Used for |
|---|---|---|---|
| **L** | 90vw, at most 1400px | 85vh | New deal (Single KOL · Bulk shortlist) · Phase Planner (New campaign · New phase · Plan phases) · imports with a preview · Paste metrics |
| **M** | 720px | as tall as the content, at most 85vh | New KOL · New product · Add account · Add rate · Add post · Add shipment · Add manual line · Add user · Set up the vault · Payee details |
| **S** | 480px | as tall as the content | Create payment run / New run · + Add in Settings (list value, KOL type) · New phase › choose a Campaign |

- Under 768px every size is full screen; the footer stays at the bottom.
- **Header** (sticky): a modal with tabs uses the tabs as its title (New deal: `Single KOL · Bulk shortlist`) · otherwise the title (`New KOL`) · ✕ on the right · a grey line under it for the context (`Adding to <Campaign>`, `Phase Planner`).
- **Body**: scrolls inside, 24px padding · an L form may use two columns (New deal: Deal | KOL & cost · Planner: Campaign 40% | Phases 60%, one column when the modal is under 1100px).
- **Footer** (sticky): left = the checks (✕ ! i) — shown after the primary button is pressed or after a field is left, never on a fresh form · right = `Cancel` · a second button when there is one (`Create & next`) · the primary button.
- **Primary button words**: **Create …** / **Add …** for something new (`Create deal` · `Create KOL` · `Create campaign` · `Create product` · `Create run` · `Add n to shortlist` · `Add account` · `Add rate` · `Add post` · `Add shipment` · `Add line` · `Add user` · `Add type`) · the action itself where that is clearer (`Import`, `Set up`, `Next`, `Apply n`) · **Save** only for changing what exists (forms in a drawer, `Save phases`, `Save products`, Payee details of a payee that exists).
- `role="dialog"` · `aria-modal="true"` · `aria-labelledby` = the title or the open tab.

## 3. Closing, keys and focus

- **Discard check**: something typed (`o.isDirty()`, or any input / change in the modal when the screen gives none) and ✕ / Esc / Cancel / a click on the backdrop → "Discard changes?" with **Discard** / **Keep editing**. Nothing typed → closes at once. A click on the backdrop never closes a modal with something typed in it without asking.
- **Keys**: the first field to fill gets the focus when the modal opens (the screen can name it — New deal focuses the KOL box, not the Campaign list that opens on focus) · Tab and Shift+Tab stay inside the modal · Esc = close (through the Discard check; an open list or picker closes first) · Ctrl / ⌘ + Enter = the primary button.
- On close the focus goes back to the button that opened the modal.
- The page behind does not scroll and cannot be clicked while a modal is open.

## 4. After Create

- The modal closes · toast **"<Thing> created · Open"** inside the frame (`Deal created`, `Campaign created`, `KOL created`, `User created`) · the new row in the list behind lights up for 5 seconds (the list shows enough rows to reach it) · `Open` = the drawer of what was made.
- `Create & next` (New deal) keeps the modal open with a fresh form that carries Campaign · Phase · Start at · PIC · Pillar · CTA.
- Child items made over a drawer (account, rate, post, shipment) just close the modal and show the item in the drawer, with a short toast.

## 5. Imported = "—", not a warning (CR-11 §4.6)

- A deal from the old files (`legacy_job_ids`) that is Complete or Cancelled shows what it lacks as a grey **"—"** with the tooltip *Imported · not tracked before go-live* — no "Not set" chip, no Set pillar button, no "Date not recorded", no inputs, not counted in Data health.
- A deal from the old files that is still open is real work: it is warned about and counted like a new one.
- Money is never hidden: owed instalments of old work stay in To pay until the Go-live clean-up (or a payment) clears them.
- Performance: a post from before go-live − 30 days with no numbers is **Not tracked** (one small line under the KPIs) · not enough data for a reliability badge = a faint "—" that says what is needed.

## 6. Deal = what was agreed · Shipments / Payments = queues across Campaigns (CR-11 §4.9–4.10)

- The Deal drawer keeps the agreement and what it needs (shipments to make, instalments) — one deal, one Campaign.
- **Shipments** and **Payments** are where the work is done, across every Campaign, with their own scope bar (Campaign · PIC + Mine · …), queue cards and bulk actions.
- Rows of a work queue are **text** — no dropdown or input in a row · a change goes through ⋯ or a bulk dialog · a click on the row opens the record (the Deal drawer at the right section).
- A link goes both ways: Deal drawer › *Open in Shipments* · a Shipments row › its deal.

## 7. Labels, ⓘ and names (CR-11 §4.13)

- **ⓘ** only next to a number that is worked out (Committed · Pending · Paid · Remaining · Used % · ER · CPV · CPE · Days left — or any explanation with a formula) · every other header / card carries its explanation as the **tooltip of its text** (`ui.labelInfo`).
- **Names** (KOL · @handle) wrap only after `_ . -` or a space (`ui.nameHTML` puts `<wbr>` there) — never inside a word, never cut with "…".
- **Chips under a toolbar** show only what the Filters panel set — a value already visible in a dropdown (PIC · Phase) gets no chip · *Clear all* sits in the toolbar.
- **Prefilled values** say where they came from with a small chip (*From phase* · *From campaign* · *Only product in campaign*) · a value the person picked is never overwritten.

## 8. Phase colours — an ordinal grey ramp (CR-13 §4.3)

A Phase is a step in time, not a category → one hue (grey), light → strong in Phase order (start date within its Campaign).
`ui.phaseColor(campaignId, phaseId, mode)` (SVG) · `ui.phaseVar(phaseId)` (= CSS `var(--phs1…6)`, follows the theme by itself).

| Step | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Light | `#a3a19a` | `#8a8881` | `#72716b` | `#5b5a55` | `#4a4945` | `#3a3936` |
| Dark | `#5f5e58` | `#75736d` | `#8b8982` | `#a2a098` | `#bbb9b1` | `#d6d4cc` |

- n Phases → steps `round(linspace(1, 6, n))` (`rules.phaseSteps`): 1 → [4] · 2 → [1, 6] · 3 → [1, 4, 6] · 4 → [1, 3, 4, 6] · 5 → [1, 2, 4, 5, 6] · 7+ → 1–6 then 6.
- The step belongs to the Phase in its Campaign (`rules.phaseStep`) — a filter that shows fewer Phases never repaints them.
- The Phase **name** is the identifier (next to the dot / above the band, in secondary ink) — the colour only says early vs late.
- **Data colours are never used for a Phase**: Tier (`--tier-*`), Pillar (`--pl-*`), Campaign (`--ph1…8`, categorical) and status colours stay with their own data.
- Not changed: Campaign & Phase › Timeline bars (status colours) · All campaigns › Activity by campaign (one categorical colour per Campaign).
- Validated (ordinal) on `#fcfcfb` and `#1a1a19` — do not change a value without running the validator again.

## 9. Deals — state tabs = the Pipeline groups · attention chips (CR-13 §4.4–4.5)

- **Tabs say where a deal is**: All (default, first) · List · In process · Complete · Cancelled — the names and the colours (dot · underline) of the Pipeline groups (`--g-list` · `--g-prog` · `--g-done` · `--g-cancel`). A tab at 0 stays (faint) so none moves · on a phone the tabs wrap, none is cut.
- The numbers count the scope (Campaign · Phase · PIC · Filters · Search · the chip). The Pipeline view has no tabs (its columns are the stages).
- The tab is remembered for each person: localStorage `charmiss_kol_tracker_deals.stateTab.v2` = `{userId: tab}` · old links `#deals?tab=open` → All · `?tab=needs_action` → All + Overdue.
- **Chips say what needs doing** (under the tabs · only those above 0 in the chosen tab · one at a time · a filter, so *Clear all* takes it off): Overdue · Needs phase · Shipment overdue · Metrics due · Docs to collect (+ *Open in Payments*) — the same words as Dashboard › Operations › To do.
- Paying is the work of Payments, not of the deal: no *Unpaid after posting* / *Payment overdue* in Deals. The **⚠ column** = how many chip reasons a deal has · hover lists them ("Metrics due · 1 post") · a cancelled deal has none. Other checks of a deal (late draft · post link …) stay in its drawer.

## 10. `ui.multiSelect(o)` — one multi-select for every list of values (CR-14 §4.2)

`U.multiSelect({ id, options: [{value, label, sub, chip, dot}], value, label, searchable, placeholder, defaultValue, min, minTip, inline, onChange })` → HTML. The screen may draw it again at any time; what is open and the search typed stay in the component (by `id`). Pure parts in `rules.js`: `msFilter` · `msToggle` · `msSelectAll` · `msLocked`.

| Part | Rule |
|---|---|
| Button | as tall as the other controls of the row (36px · 30px next to small buttons) · `All …` / one name / `n selected` (`U.msLabel`) · ▾ |
| Popover | ≥ the button and ≥ 280px wide (as wide as its longest line, up to 380px) · 400px high at most · under the button, left edge (past the window → right edge) · above tabs and tables · on a phone: full width (16px gutters) under the button |
| Search | when more than 7 options (or `searchable: true`) · one line, 32px · magnifier · focused on open · filters at once (no case · Thai) · nothing → "No matches" |
| List | checkbox + name (wraps, never cut) + count / status chip on the right (a chip never shrinks) · scrolls inside |
| Footer | `Select all` · `Clear` (or `Reset` when there is a default) |
| Value | changes on every tick (no Apply) · `min: 1` → the last tick stays, its tooltip says why |
| Close · keys | a click outside · Esc (focus back to the button) · ↑ ↓ move · Space ticks |
| In a Filters panel | `inline: true` — the list without a button (Deals › Tier · KOL Master › Type) |

Its own classes only (`.ms…`). **Never style a toolbar control with a descendant selector** — `.toolbar .search{flex:1 1 240px}` also hit the search box inside a popover of the toolbar; the popover is a column flexbox, so 240px became the box's *height* (the CR-14 bug). Toolbar rules are `.toolbar > .search`.

Used by: Dashboard › All campaigns › Status · Campaign & Phase › Campaign (Table and Timeline) · Deals › Filters › Tier · KOL Master › Filters › Type · Deals › Performance › Columns.

## 11. How a CR is run (CR-14 §0.3 — every CR from now on)

One go, start to finish: no stop after a round, no waiting for James in between · an unclear point takes the CR's §9 Decisions, else the choice with the least impact, and goes in the report · at the end `node --test` + every TC · **one report**: failed TCs · not done · decided by Claude. (CR-12 Help is skipped.)

## 12. KOL profile — modal L + tabs (CR-16 §4.1)

| Part | How |
|---|---|
| Container | `KT.profile` (`src/screen-profile.js`) — an overlay at z-index 35: **under** the Deal drawer (40), so a deal opened from it sits on top and closing the drawer comes back; create modals / dialogs are in the top layer above both · the page behind is `inert` |
| Header (sticky) | photo 64px (click = Upload / Remove · drop a file on the header · paste) · name + copy · ID · Tier · Status · platforms + followers · PIC · `Add to campaign` · `Edit` · ‹ › · ✕ |
| Summary | Deals · Committed (not cancelled) · Last worked · Last campaign · On-time · Latest rate — under the header on every tab |
| Tabs | Overview · Deals & history (All / Open / Posted / Cancelled) · Performance (+ every post) · Rates (Price reference + Rate history: quoted + agreed) · Payee & shipping · counts on the tabs · ← → between tabs · the last tab is remembered per person |
| Edit | in place on Overview, Save / Cancel at the bottom · closing · another tab · ‹ › / ↑ ↓ with unsaved edits → "Discard changes?" |
| Route | `#kols/K0011/overview` — its own history entry (pushState): Back closes it, ✕ goes back (history.back) · tab / KOL changes replace it · a link or reload opens it on KOL Master |
| Opened from | KOL Master row (‹ › / ↑ ↓ walk that table as filtered) · the KOL name in the Deal drawer (that drawer waits underneath) · Payments › Missing: Bank details / Payee details (opens at Payee & shipping) |
| Mobile < 768px | full screen · the tab strip scrolls sideways |

## 13. The main action is a button on the row (CR-17)

| Part | How |
|---|---|
| Button | the page's main job for that row, visible (`btn small primary`): Payments › To pay / Sent **Mark paid** · Shipments **Shipped** / **Delivered** · Deal drawer › Payment / Shipments the same · Pipeline card ⋯ › Mark shipped / delivered · ⋯ keeps the rest (Hold · Change payee · Shipped & delivered · Change address · Mark unpaid …) |
| Small form | `ui.popForm(anchor, { title, body, ok, onOk, focus })` — next to the button: a date (today) and the optional fields · **Enter** = Confirm · Esc / a click outside = close · errors under the fields (`ui.popFormError`) · inside a dialog it opens in that dialog |
| Undo | a change of money says so with **Undo** for 10 seconds (`toastAction`) — Mark paid |
| Who | the button is drawn only for someone who may do it (Viewer: the status only) |
| Waiting for approval | chip **Pending approval** (yellow, `st apending`) · **Rejected** (red) · **Change pending** on an approved one · in a picker the Campaign is greyed with its chip and cannot be chosen (`campaignOptionsHTML(…, { forDeal: true })` · combobox `data-off` + tooltip) |
| Count in the side menu | `.nbadge` on the corner of the icon (open or folded menu) — the label keeps its full width, never cut · Campaign & Phase: Campaigns waiting for a decision, only for those who approve |

## 14. A request waits for a manager (CR-17 v1.2 · CR-18)

| Part | How |
|---|---|
| Where | Campaign & Phase › tab **Approvals n** (managers) / **My requests n** (Staff) · `#campaigns/approvals` · the badge on the menu icon and Operations › Approvals open it |
| Card | one request, oldest first · head: name + type chip (New campaign · New phase · Change · Budget increase / decrease) + "Submitted by · date · n days ago" · the short facts of its type · Note from the requester · foot: Open details · Cancel request (own change) · Reject · **Approve** |
| Decide | Approve on the card (or tick several → Approve selected) · Reject asks a reason (S modal) · a toast with **Undo** for 10 s puts the Campaign back as it was |
| Waiting money | the approved number stays everywhere · next to it a yellow "+฿x pending" (tooltip: who · when · why) |

## 15. Money boxes (CR-18)
- Right-aligned, commas once the box is left (`input.numin` · "1,000,000" reads as 1000000 · `R.money`) · a minus or letters = the field's error
- Two boxes for one value (Budget % · Amount): the one typed last leads (`basis`), the other follows; the money is what is saved
- A total that does not match (short / over) is **red but does not block**: a red line in the footer checks (`issue.red`) and "Save anyway?" (`Save anyway` / `Keep editing`) on Save · a sum that must match exactly (Adjust budget allocations) disables the button instead

## 16. A chart where the number of Campaigns keeps growing (CR-19)
- **Never a colour a Campaign** — a categorical palette runs out (8 hues) and the 9th repeats · the row's **name** says which Campaign · colour says the **status** (the light bars of Campaign & Phase › Timeline: On going blue · Not started grey · Complete green · Pending approval / Rejected / On hold hatched · Cancelled struck)
- One ink for the data (posts / spend) on every row, on **one scale**, so rows can be compared · Planned faded with an edge · data outside the Campaign's own dates at half strength
- Compact rows (40px), a fixed height (10 rows) that scrolls inside the card with the axis and the name column sticky · a **Show all** to see every row · a table view with the same numbers
- Gantt pieces are shared, not rewritten: `ui.ganttAxis` · `.tbl.gantt` · `.gt-row` · `.gbar`

## 17. A form that asks only what its target needs (CR-20)
- **One rule, many screens:** what a stage needs lives in `R.stageRequirements()` — the Move stage dialog, drag & drop, Move to… for many deals and New deal (Start at) all ask it; a screen never keeps its own list of required fields
- **Errors after the button:** a fresh dialog shows no red · the primary button is never faded · pressing it outlines every field that is missing and lists them once in a box above the footer · warnings (after the Post due · over the campaign budget) show as you type
- **One transaction, one Undo:** a move writes the stage, the dates of the steps it passes, the values typed, the posts and the notes together · the toast's Undo puts every part back (snapshot of the deal, its posts, notes and shipments)
- **A record opens in a modal (L)** with ‹ › for the list it came from (the lane of the Pipeline · the rows of the Table) and ← → keys · opened from another modal it takes that modal's place with "‹ Back to …" — never two layers
- **Pick many, fill little:** a picker table on the left, a Selected panel on the right with the few fields that matter per row (Rate · Post due) and panel tools (Set … for all · Use latest · Clear) · the panel goes under the table on a phone
