# Payments — Charmiss KOL Tracker (CR-08 · CR-09)

The Payments page (side menu, between Deals and KOL Master) is where payments to KOLs, affiliates and others are prepared, sent to Accounting and recorded.
It replaces the old Deals › Payments view (CR-06 §4.8) and the Docs / Deposit / Paid ticks on a deal (CR-02 §4.3).
Spec: `docs/CR-08.md` (v1.1) · CR-09 §4.14–4.16 (`docs/CR-09.md`: Group by Amount · tabs To pay / Payment runs / Accounting · role Accounting). Rules: `src/rules-pay.js` (pure functions, tests in `tests/cr08.spec.js`, `tests/cr09.spec.js`). Screens: `src/screen-payments.js`, `src/screen-payee.js`, Settings › Payments.

## Tabs and who uses them (CR-09)

| Tab | Who | Answers | Content |
|---|---|---|---|
| **To pay** | PICs · the KOL team | Which instalments are due and what is missing | Queue cards · Group by Readiness / **Amount** / PIC / Campaign (fold / unfold, remembered per person) · Status column with "Missing n" popover · bulk **Create payment run** / Add to run / Cancel line · Payments CSV (to look at only — not the file for Accounting) |
| **Payment runs** | Whoever prepares the run · KOL Manager | What is in this Friday's run and has it gone to Accounting | Runs (status filter, Closed hidden by default) · run detail: Draft / Returned can be changed and sent with **Submit to Accounting**; With Accounting / Paid / Closed are read only (Open in Accounting · Reopen as Draft = Admin) |
| **Accounting** | The accounts team · Admin | What to transfer and which WHT certificates to send | Cards To transfer (runs · ฿ net) · WHT certs to send · Paid this month · **Runs to pay** (Open · Export PR · Mark paid · Return to team · Close run) · **WHT certificates** (Mark sent · Send to while unlocked · WHT summary) · **Paid** (the old History · This month by default · Mark paid outside app) |

Each tab name has an ⓘ with its one-line question. An old link `#payments/history` opens Accounting. Admin and Accounting work in the Accounting tab; KOL Manager, Staff and Viewer see it read only (Export PR without payee details still works).

**Role Accounting** (CR-09 §4.16): not a PIC · no Settings or Role Management · lands on Payments › Accounting (first open and Switch user) · reads Dashboard, Campaign & Phase, Deals and KOL Master · may edit the Payee section (Unlock · Replace bank details · Mark as verified) · Mark paid · Mark paid outside app · Return to team · Mark WHT cert sent · WHT summary · Close run. KOL Manager no longer marks paid — the person who prepares a run is not the one who confirms the transfer. The first accounting user, **Earn**, is added by the schema 9 migration.

---

## 1. Flow

```
Deal reaches Confirm QT / Complete
        │  (worked out by the payment term — nothing is stored yet)
        ▼
To pay ── Request payment (PIC) ──► open line ──┐
        └── Create payment run / Add to run ────┴─► In run (Draft run) ──► Submit to Accounting ──► With Accounting ──► Mark paid ──► Paid ──► Close run
             (Admin / KOL Manager)                    │  Checks: ✕ blocks Submit · ! · i    ▲                       │     (Admin / Accounting)
                                                      │                                     └── Returned (Draft) ◄──┘  Return to team (reason)
                                                      └── Export PR (.xlsx) — anyone · payee details only when unlocked
Accounting tab › WHT certificates: Mark sent  ·  Accounting tab › Paid: every paid line · Mark paid outside app
```

| Step | Where | Who | What happens |
|---|---|---|---|
| Instalments owed | To pay | everyone (read) | `dueLines` works out each instalment from the deal's payment term (below). It is *virtual* until someone requests it or adds it to a run. |
| Request payment | To pay row · Deal drawer › Payment | Admin · KOL Manager · Staff (own deals) | Stores a line (`open`) with the agreed amount, price basis, WHT rate, Pay to (Payee / Reimburse staff) and note. |
| Add manual line | To pay `+ Add manual line` | Admin · KOL Manager · Staff | Affiliate / Other payments that are not deals: pick a payee (or `+ New payee`), Campaign or a typed project, amount, basis, WHT, due date. Not counted in Committed. Its PIC is the person who added it. |
| Create payment run · Add to run | To pay bulk | Admin · KOL Manager | **Create payment run**: Pay date (the next run weekday) + Prepared by → a new Draft run `PR-yyyy-mm-dd` (a second run that day gets `-2`) with the ticked lines, opened. **Add to run ▾**: into a Draft run that is there. A virtual instalment is stored first. |
| Checks | Run detail | — | ✕ (Submit blocked): documents / bank details missing · Gross ≤ 0 · the same instalment in another run or already paid · Reimburse without a staff member · bank details must be verified. ! : term not set · 10,000 and above (Accounting to confirm) · amount differs from the deal · cancelled line / deal · bank details changed after submit (export again). i : WHT borne by company · reimburse. |
| Submit to Accounting | Payment runs › run | Admin · KOL Manager | Lines → `submitted` (shown as **With Accounting** everywhere), the payee details version is noted, the deals get `docs_done`. The team sees the run read only from then on. |
| Export PR | Run detail (Payment runs · Accounting) | everyone who sees the run | `PR_dd_mm_yy_<run id>.xlsx` (§4) · payee details only for Admin · KOL Manager · Accounting after Unlock. |
| Mark paid | Accounting › Runs to pay · run (all or ticked) | Admin · Accounting | Lines → `paid` with the date; the deal flags follow (§5); the run is Paid when every line is. |
| Return to team | Accounting › Runs to pay · run | Admin · Accounting | Reason required → the run is a Draft again, labelled **Returned**, with a yellow bar "Returned by X on dd/mm/yyyy — reason" in Payment runs; its lines go back to In run. Submit to Accounting again clears it. |
| Close run | Accounting › Runs to pay | Admin · Accounting | Paid → Closed (usually after the WHT certificates are sent). |
| Reopen run · Undo paid | Payment runs (Reopen as Draft) · Accounting run (⋯ Undo paid) | Admin | Back to Draft / back to Submitted, with a reason; the deals follow. |
| Mark paid outside app | Accounting › Paid (secondary button) | Admin · Accounting | For old work already paid before Payments: pick the lines (owed, not in a run), then date + note (required). Lines are stored as `source: legacy`, `paid`, no run; the deals follow. |
| Cancel line | To pay bulk | Admin · KOL Manager | Reason required; the instalment does not come back. |
| Deal cancelled | anywhere a deal moves to Cancel | — | On save, its lines that are not paid become `cancelled` with reason "Deal cancelled" (a `payment` event each). A paid line stays and To pay › Needs check shows "Paid on a cancelled deal". |
| WHT certificate (50 ทวิ) | Accounting › WHT certificates | Admin · Accounting | Paid lines with WHT > 0 and no sent date (card "WHT certs to send n") · tick → `Mark sent` (date) · **Send to** = the WHT contact, decrypted in memory only while the vault is unlocked. |
| WHT summary | Accounting › WHT certificates | Admin · Accounting | CSV for Accounting (ภ.ง.ด.): `month, payee_type, payee_id, account_handle, gross, wht_rate, wht` — one row a month per payee and rate, by paid date in the chosen range. No names, addresses or account numbers. |

Dashboard › Operations shows two extra cards for the chosen PIC when they are not zero: **Payment docs missing n** and **Ready to pay n** → Payments › To pay with that PIC and queue.

### Instalments by payment term (`dueLines`)

| Term | Instalments |
|---|---|
| Prepaid | Full — owed at Confirm QT |
| 50/50 (`split_50`) | Deposit = half of the total (rounded half up to the baht) at Confirm QT · Final = the rest at Complete |
| Pay after post / Not set | Full at Complete (Not set shows "Term not set") |
| Free · cancelled deal · ฿0 deal | nothing (a ฿0 deal that is owed something is in Needs check) |

Due date = the date the deal reached that step. The status on screen: Paid · Cancelled · In run (Draft run) · With Accounting (stored `submitted`) · Not due (date ahead) · Missing docs · Ready.

### Documents needed

- Individual: ID copy · bank book · bank details. Company: company certificate · bank book (+ VAT certificate when VAT registered) · bank details.
- Final, or Full after posting: post evidence (a post link on the deal).
- Reimburse staff: nothing from the payee (the staff member is paid back).

---

## 2. Tax (`calcPaymentTax`)

Settings › Payments (defaults — **confirm with Accounting**): VAT 7% · WHT threshold ฿1,000 · WHT rates 0 / 1 / 2 / 3 / 5% · default WHT Individual 3% / Company 3% · amount ranges 1,000 and 10,000 (stored as `bands`) · run weekday Friday.

```
amount    = agreed amount, rounded to the satang (half up)
gross     = amount                                    (price basis Gross — agreed before WHT)
          = amount / (1 − rate)                       (price basis Net — the payee gets the amount; only when amount ≥ threshold and rate > 0)
vat       = gross × 7%  when the payee is VAT registered, else 0
wht       = gross × rate  when gross ≥ threshold, else 0
net       = gross + vat − wht                         (what is transferred)
borne     = gross − amount on Net basis               ("WHT borne by company")
amount    = gross < 1,000 → Under ฿1,000 (No WHT) · < 10,000 → ฿1,000 – ฿9,999 · else ฿10,000 and above (Separate approval)
```

Every step is rounded half up to 2 decimals. Example: Net 1,000 at 3% → Gross 1,030.93 · WHT 30.93 · Net 1,000.00 · borne 30.93. Affiliate 1,800 Gross at 3% → WHT 54.00 · Net 1,746.00.

---

## 3. Payee details and the vault

A payee belongs to one KOL (KOL drawer › Payee) or stands alone (Affiliate / Other, made from `+ New payee`). Readable fields: account handle, payee type, VAT registered, default WHT, price basis, bank name, **last 4 digits** of the account, document dates, documents folder link.

The personal fields — real name, address on the ID card, phone, email / address for the WHT certificate, full account number, tax ID — are **only stored encrypted** in `payee.secure`.

**Shipping details (CR-10 §4.14)** — recipient name, phone and shipping address for product samples — are encrypted with the same vault into `payee.secure_ship` (a separate record, so saving them never needs the passphrase or touches the bank details) and the payee only shows the flag `shipping_on_file` ("Address on file" / "No address"). They are entered in KOL drawer › **Payee & shipping** or Deal drawer › Samples (Admin · KOL Manager · Accounting · Staff for their own KOLs); a KOL without a payee gets a blank one. The full details are shown, and added to Deals › Samples › Export shipping list (Recipient · Phone · Address), only while the vault is unlocked by someone with `payee.unlock`.

**Vault (`src/vault.js`, Web Crypto in the browser)**
- Set up (Admin, Settings › Payments): an RSA-OAEP 3072 key pair. The private key is wrapped with AES-GCM 256 from the passphrase (PBKDF2-SHA-256, 600,000 rounds, 16-byte salt). The passphrase is never stored.
- Saving bank details needs no passphrase: each record gets its own AES-GCM key, encrypted with the public key.
- **Unlock** (Admin · KOL Manager · Accounting) to see the full details or to export the PR with them. The key is kept in memory only (not extractable). It locks after 15 minutes without use, on Lock, on Switch user, on Restore and on reload. A bar shows "🔓 Payee details unlocked · Lock".
- Change passphrase (Admin): the same key, wrapped again.
- **Forgotten passphrase** → Reset vault (Admin, type RESET): every payee loses its encrypted details (bank name, last 4 and document dates stay); set up a new vault and enter or import the details again.
- Import payee details (Admin · KOL Manager): CSV with `account_handle, payee_type, full_name, id_address, phone, wht_contact, bank_name, account_name, account_no, tax_id, docs_link` (template in Settings › Payments). Rows are matched by handle (`@` and case ignored) to a KOL account, or to a payee outside KOL Master; a handle that matches nothing becomes a new payee. The preview shows Match / New / Error per row. Details are encrypted in the browser and the file is not kept.
- Who holds the passphrase: the people who prepare runs and Accounting; the Admin sets it up. Do not send it in chat or files.

**Verify after a change.** When bank details are replaced on a payee who has already been paid, the payee is marked *needs verification* (and a `payee_details_changed` event is written, without values). A run with that payee shows ✕ "verify the new bank details with the KOL" until an Admin / KOL Manager / Accounting clicks **Mark as verified** (after checking with the KOL by phone or chat). Details changed after a run was submitted show ! "export the PR again".

---

## 4. Export PR (.xlsx)

`src/xlsx.js` writes the file itself (zip "store" + SpreadsheetML, no library, nothing from a CDN). File name `PR_dd_mm_yy_<run id>.xlsx` from the pay date and the run (e.g. `PR_09_10_26_PR-2026-10-09.xlsx`, CR-09).

- Every sheet starts with the run line **"รอบจ่าย: PR-2026-10-09 · วันจ่าย 09/10/2026"** (row 1); the column headers are row 2 (frozen with it) and the lines start at row 3.

- One sheet per band that has lines — `ยอดน้อยกว่า 1,000 ddmmyy` · `ยอด 1,000-9,999 ddmmyy` · `ยอด 10,000 ขึ้นไป ddmmyy` — with the 21 Thai columns Accounting uses, a total row (SUM of Gross / VAT / WHT / Net) and a **Summary** sheet.
- Type: KOL (deal, legacy) · AFF (Affiliate) · Other. Link: documents folder + post links + note, and "Reimburse: <name>" for a reimbursement.
- The six personal columns (name, address, phone, WHT contact, bank, account number) are filled only when the vault is unlocked; the decrypted values exist in memory for the download and are cleared right after. Locked → "Unlock and export" or "Export without payee details" (the Summary says so).
- The `.xlsx` holds personal data: keep it where Accounting keeps the PR files, not in chat.

---

## 5. Data (schema 8 · 9 · 11)

The full schema is described at the top of `src/store.js` and in `docs/DATA_MODEL.md`. Schema 8 → 9 (CR-09) adds role `accounting`, the user Earn and `payment_runs.returned_*`. Schema 10 → 11 (CR-10) adds `payee.secure_ship` / `shipping_on_file` (no migration needed — empty until entered) with `sample_shipments`. Schema 7 → 8 is a migration on load (idempotent; old Backup JSON files too): it adds the three collections and `lookups.payment_settings`, `lookups.payee_vault = null`. No line is made by the migration — To pay works them out from the deals.

| Collection | Key fields |
|---|---|
| `payee_profiles` | `payee_id` PY-0001 · `kol_id` (null = not a KOL) · `account_handle` · `payee_type` individual / company · `vat_registered` · `default_wht_rate` · `price_basis` gross / net · `bank_name` · `account_last4` · `docs {id_copy, bank_book, company_cert, vat_cert}` (date received) · `docs_link` · `secure {key_id, wrapped_key, iv, ciphertext}` · `secure_ship` (same shape · shipping details, CR-10) · `shipping_on_file` · `details_version` · `needs_verification` · `verified_at/by` · `created_by/at` · `updated_by/at` |
| `payment_lines` | `line_id` PL-000001 · `source` deal / legacy / affiliate / other · `deal_id` · `milestone` deposit / final / full / manual · `payee_id` · `kol_id` · `account_handle` · `campaign_id` · `project_label` · `payee_type` · `pay_to` payee / reimburse · `reimburse_user` · `price_basis` · `agreed_amount` · `gross` · `vat` · `wht_rate` · `wht` · `net` · `due_date` · `docs_check` · `status` open / in_run / submitted / paid / cancelled · `run_id` · `printed` · `paid_date` · `wht_cert_sent_date` · `cancel_reason` · `payee_version_at_submit` · `note` · `created_by/at` |
| `payment_runs` | `run_id` PR-2026-10-09 · `pay_date` · `prepared_by` · `status` draft / submitted / paid / closed (labels Draft · Returned · With Accounting · Paid · Closed — `rules.runStatusLabel`) · `submitted_at` · `returned_reason` · `returned_at` · `returned_by` (CR-09) · `note` · `created_at` |
| `lookups.payment_settings` | `vat_rate` · `wht_threshold` · `wht_rates` · `default_wht_individual` · `default_wht_company` · `bands` · `run_weekday` |
| `lookups.payee_vault` | `key_id` · `public_key_jwk` · `wrapped_private_key` · `salt` · `iv` · `iterations` · `created_at/by` · `passphrase_changed_at` |
| `deal_events` | `payment` (`line_id`, from → to, note) on every line status change · `payee_details_changed` (`deal_id` null, `payee_id`, no values) |

**Deal flags follow the lines** (`syncDealPayment`; cancelled lines are ignored):
- a paid Final / Full line → `paid_full` + `paid_full_date` (the latest paid date); a Final / Full line that is not paid → `paid_full` false;
- a paid Deposit line → `paid_50` + date; on a 50/50 deal a paid Final also sets `paid_50`; a Deposit line that is not paid → `paid_50` false;
- Submit → `docs_done` + date.
So Dashboard Paid (est.), Unpaid and every money figure keep their meaning. Committed only counts deals — manual lines never change it.

---

## 6. Personal data (PDPA) — rules for the code and for tests

- Real name, address, phone, email / WHT address, full account number and tax ID live **only** encrypted in `payee.secure` — and the shipping recipient, phone and address only in `payee.secure_ship` (CR-10). Never in plain text in the saved state, `localStorage`, the Backup JSON, the seed, test fixtures or `console`.
- Notes, reasons, project names, handles and links are checked by `rules.looksSensitive` (10+ digits in a row) and refused. Restore removes such values (`R.scrubSensitive`) and says so.
- The Payments CSV and the WHT summary have no personal data. Only the PR export and the shipping list (both unlocked) have it — the Dashboard, Deals, Performance and Stage popup exports never do.
- Do not open `Data/PR 09_10_26.xlsx` to copy data. Tests use made-up values only.
- Roles are a UI guide (CR-04), not a security control. What protects the personal data is the vault passphrase.
