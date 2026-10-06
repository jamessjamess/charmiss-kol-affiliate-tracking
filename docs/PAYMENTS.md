# Payments — Charmiss KOL Tracker (CR-08)

The Payments page (side menu, between Deals and KOL Master) is where payments to KOLs, affiliates and others are prepared, sent to Accounting and recorded.
It replaces the old Deals › Payments view (CR-06 §4.8) and the Docs / Deposit / Paid ticks on a deal (CR-02 §4.3).
Spec: `docs/CR-08.md` (v1.1). Rules: `src/rules-pay.js` (pure functions, tests in `tests/cr08.spec.js`). Screens: `src/screen-payments.js`, `src/screen-payee.js`, Settings › Payments.

---

## 1. Flow

```
Deal reaches Confirm QT / Complete
        │  (worked out by the payment term — nothing is stored yet)
        ▼
To pay ── Request payment (PIC) ──► open line ──┐
        └── Add to run (Admin / KOL Manager) ───┴─► In run (Draft run) ──► Submit ──► Submitted ──► Mark paid ──► Paid ──► WHT cert sent
                                                         │  Checks: ✕ blocks Submit · ! warns · i info          │                │
                                                         └── Export PR (.xlsx) for Accounting ◄──────────────────┘          History tab
```

| Step | Where | Who | What happens |
|---|---|---|---|
| Instalments owed | To pay | everyone (read) | `dueLines` works out each instalment from the deal's payment term (below). It is *virtual* until someone requests it or adds it to a run. |
| Request payment | To pay row · Deal drawer › Payment | Admin · KOL Manager · Staff (own deals) | Stores a line (`open`) with the agreed amount, price basis, WHT rate, Pay to (Payee / Reimburse staff) and note. |
| Add manual line | To pay `+ Add manual line` | Admin · KOL Manager · Staff | Affiliate / Other payments that are not deals: pick a payee (or `+ New payee`), Campaign or a typed project, amount, basis, WHT, due date. Not counted in Committed. Its PIC is the person who added it. |
| Add to run | To pay bulk | Admin · KOL Manager | Into a Draft run or a new one (`PR-yyyy-mm-dd`, the next run weekday; a second run that day gets `-2`). A virtual instalment is stored first. |
| Checks | Run detail | — | ✕ (Submit blocked): documents / bank details missing · Gross ≤ 0 · the same instalment in another run or already paid · Reimburse without a staff member · bank details must be verified. ! : term not set · 10,000 and above (Accounting to confirm) · amount differs from the deal · cancelled line / deal · bank details changed after submit (export again). i : WHT borne by company · reimburse. |
| Submit | Run detail | Admin · KOL Manager | Lines → `submitted`, the payee details version is noted, the deals get `docs_done`. |
| Export PR | Run detail | Admin · KOL Manager | `PR_dd_mm_yy.xlsx` (§4). |
| Mark paid | Run detail (all or ticked) | Admin · KOL Manager | Lines → `paid` with the date; the deal flags follow (§5); the run is Paid when every line is. |
| Close run | Run detail | Admin · KOL Manager | Paid → Closed. |
| Reopen run · Undo paid | Run detail | Admin | Back to Draft / back to Submitted, with a reason; the deals follow. |
| Mark paid outside app | To pay bulk | Admin · KOL Manager | For old work already paid before Payments: date + note (required). Lines are stored as `source: legacy`, `paid`, no run; the deals follow. |
| Cancel line | To pay bulk | Admin · KOL Manager | Reason required; the instalment does not come back. |
| Deal cancelled | anywhere a deal moves to Cancel | — | On save, its lines that are not paid become `cancelled` with reason "Deal cancelled" (a `payment` event each). A paid line stays and To pay › Needs check shows "Paid on a cancelled deal". |
| WHT certificate (50 ทวิ) | History | Admin · KOL Manager | Card "WHT cert not sent n" (paid, WHT > 0, no date) · tick lines → `Mark WHT cert sent` (date). |
| WHT summary | History | everyone (read) | CSV for Accounting (ภ.ง.ด.): `month, payee_type, payee_id, account_handle, gross, wht_rate, wht` — one row a month per payee and rate, by paid date in the chosen range. No names, addresses or account numbers. |

Dashboard › Operations shows two extra cards for the chosen PIC when they are not zero: **Payment docs missing n** and **Ready to pay n** → Payments › To pay with that PIC and queue.

### Instalments by payment term (`dueLines`)

| Term | Instalments |
|---|---|
| Prepaid | Full — owed at Confirm QT |
| 50/50 (`split_50`) | Deposit = half of the total (rounded half up to the baht) at Confirm QT · Final = the rest at Complete |
| Pay after post / Not set | Full at Complete (Not set shows "Term not set") |
| Free · cancelled deal · ฿0 deal | nothing (a ฿0 deal that is owed something is in Needs check) |

Due date = the date the deal reached that step. The status on screen: Paid · Cancelled · In run (Draft run) · Submitted · Not due (date ahead) · Missing docs · Ready.

### Documents needed

- Individual: ID copy · bank book · bank details. Company: company certificate · bank book (+ VAT certificate when VAT registered) · bank details.
- Final, or Full after posting: post evidence (a post link on the deal).
- Reimburse staff: nothing from the payee (the staff member is paid back).

---

## 2. Tax (`calcPaymentTax`)

Settings › Payments (defaults — **confirm with Accounting**): VAT 7% · WHT threshold ฿1,000 · WHT rates 0 / 1 / 2 / 3 / 5% · default WHT Individual 3% / Company 3% · bands 1,000 and 10,000 · run weekday Friday.

```
amount    = agreed amount, rounded to the satang (half up)
gross     = amount                                    (price basis Gross — agreed before WHT)
          = amount / (1 − rate)                       (price basis Net — the payee gets the amount; only when amount ≥ threshold and rate > 0)
vat       = gross × 7%  when the payee is VAT registered, else 0
wht       = gross × rate  when gross ≥ threshold, else 0
net       = gross + vat − wht                         (what is transferred)
borne     = gross − amount on Net basis               ("WHT borne by company")
band      = gross < 1,000 → Under 1,000 · < 10,000 → 1,000–9,999 · else 10,000 and above
```

Every step is rounded half up to 2 decimals. Example: Net 1,000 at 3% → Gross 1,030.93 · WHT 30.93 · Net 1,000.00 · borne 30.93. Affiliate 1,800 Gross at 3% → WHT 54.00 · Net 1,746.00.

---

## 3. Payee details and the vault

A payee belongs to one KOL (KOL drawer › Payee) or stands alone (Affiliate / Other, made from `+ New payee`). Readable fields: account handle, payee type, VAT registered, default WHT, price basis, bank name, **last 4 digits** of the account, document dates, documents folder link.

The personal fields — real name, address on the ID card, phone, email / address for the WHT certificate, full account number, tax ID — are **only stored encrypted** in `payee.secure`.

**Vault (`src/vault.js`, Web Crypto in the browser)**
- Set up (Admin, Settings › Payments): an RSA-OAEP 3072 key pair. The private key is wrapped with AES-GCM 256 from the passphrase (PBKDF2-SHA-256, 600,000 rounds, 16-byte salt). The passphrase is never stored.
- Saving bank details needs no passphrase: each record gets its own AES-GCM key, encrypted with the public key.
- **Unlock** (Admin · KOL Manager) to see the full details or to export the PR with them. The key is kept in memory only (not extractable). It locks after 15 minutes without use, on Lock, on Switch user, on Restore and on reload. A bar shows "🔓 Payee details unlocked · Lock".
- Change passphrase (Admin): the same key, wrapped again.
- **Forgotten passphrase** → Reset vault (Admin, type RESET): every payee loses its encrypted details (bank name, last 4 and document dates stay); set up a new vault and enter or import the details again.
- Import payee details (Admin · KOL Manager): CSV with `account_handle, payee_type, full_name, id_address, phone, wht_contact, bank_name, account_name, account_no, tax_id, docs_link` (template in Settings › Payments). Rows are matched by handle (`@` and case ignored) to a KOL account, or to a payee outside KOL Master; a handle that matches nothing becomes a new payee. The preview shows Match / New / Error per row. Details are encrypted in the browser and the file is not kept.
- Who holds the passphrase: the people who prepare runs and Accounting; the Admin sets it up. Do not send it in chat or files.

**Verify after a change.** When bank details are replaced on a payee who has already been paid, the payee is marked *needs verification* (and a `payee_details_changed` event is written, without values). A run with that payee shows ✕ "verify the new bank details with the KOL" until an Admin / KOL Manager clicks **Mark as verified** (after checking with the KOL by phone or chat). Details changed after a run was submitted show ! "export the PR again".

---

## 4. Export PR (.xlsx)

`src/xlsx.js` writes the file itself (zip "store" + SpreadsheetML, no library, nothing from a CDN). File name `PR_dd_mm_yy.xlsx` from the pay date.

- One sheet per band that has lines — `ยอดน้อยกว่า 1,000 ddmmyy` · `ยอด 1,000-9,999 ddmmyy` · `ยอด 10,000 ขึ้นไป ddmmyy` — with the 21 Thai columns Accounting uses, a total row (SUM of Gross / VAT / WHT / Net) and a **Summary** sheet.
- Type: KOL (deal, legacy) · AFF (Affiliate) · Other. Link: documents folder + post links + note, and "Reimburse: <name>" for a reimbursement.
- The six personal columns (name, address, phone, WHT contact, bank, account number) are filled only when the vault is unlocked; the decrypted values exist in memory for the download and are cleared right after. Locked → "Unlock and export" or "Export without payee details" (the Summary says so).
- The `.xlsx` holds personal data: keep it where Accounting keeps the PR files, not in chat.

---

## 5. Data (schema 8)

The full schema is described at the top of `src/store.js`. Schema 7 → 8 is a migration on load (idempotent; old Backup JSON files too): it adds the three collections and `lookups.payment_settings`, `lookups.payee_vault = null`. No line is made by the migration — To pay works them out from the deals.

| Collection | Key fields |
|---|---|
| `payee_profiles` | `payee_id` PY-0001 · `kol_id` (null = not a KOL) · `account_handle` · `payee_type` individual / company · `vat_registered` · `default_wht_rate` · `price_basis` gross / net · `bank_name` · `account_last4` · `docs {id_copy, bank_book, company_cert, vat_cert}` (date received) · `docs_link` · `secure {key_id, wrapped_key, iv, ciphertext}` · `details_version` · `needs_verification` · `verified_at/by` · `created_by/at` · `updated_by/at` |
| `payment_lines` | `line_id` PL-000001 · `source` deal / legacy / affiliate / other · `deal_id` · `milestone` deposit / final / full / manual · `payee_id` · `kol_id` · `account_handle` · `campaign_id` · `project_label` · `payee_type` · `pay_to` payee / reimburse · `reimburse_user` · `price_basis` · `agreed_amount` · `gross` · `vat` · `wht_rate` · `wht` · `net` · `due_date` · `docs_check` · `status` open / in_run / submitted / paid / cancelled · `run_id` · `printed` · `paid_date` · `wht_cert_sent_date` · `cancel_reason` · `payee_version_at_submit` · `note` · `created_by/at` |
| `payment_runs` | `run_id` PR-2026-10-09 · `pay_date` · `prepared_by` · `status` draft / submitted / paid / closed · `submitted_at` · `note` · `created_at` |
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

- Real name, address, phone, email / WHT address, full account number and tax ID live **only** encrypted in `payee.secure`. Never in plain text in the saved state, `localStorage`, the Backup JSON, the seed, test fixtures or `console`.
- Notes, reasons, project names, handles and links are checked by `rules.looksSensitive` (10+ digits in a row) and refused. Restore removes such values (`R.scrubSensitive`) and says so.
- The Payments CSV and the WHT summary have no personal data. Only the PR export (unlocked) has it.
- Do not open `Data/PR 09_10_26.xlsx` to copy data. Tests use made-up values only.
- Roles are a UI guide (CR-04), not a security control. What protects the personal data is the vault passphrase.
