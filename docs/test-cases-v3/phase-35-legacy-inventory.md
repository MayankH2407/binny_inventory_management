# Phase 35 — Legacy Inventory

**Module code:** `LEG`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-06-09

> **Key facts verified from code (2026-06-09):**
>
> **Routes (`masterCarton.routes.ts`):**
> - `GET /master-cartons/legacy-upload/sample` — `authorizePermission('cartons:read')` — all 4 seeded roles have `cartons:read` → 200.
> - `POST /master-cartons/legacy-upload` — `authorizePermission('cartons:create')` — Admin ✓, Supervisor ✓, Warehouse Operator ✓, Dispatch Operator ✗ (403). Unauthenticated → 401.
> - `POST /master-cartons/:id/open-legacy` — `authorizePermission('packing:unpack')` — Admin ✓, Supervisor ✓, Warehouse Operator ✓, Dispatch Operator ✗ (403). Unauthenticated → 401.
> - Route order: `/legacy-upload/sample` and `/legacy-upload` declared **before** `/:id` to avoid shadowing — order-sensitive, must be tested.
> - `GET /master-cartons` (list) — `authenticate` only, no permission gate → all 4 roles 200.
>
> **`bulkCreateLegacyCartons` (`legacyCarton.service.ts`):**
> - Required CSV headers (case-insensitive): `SECTION`, `CATEGORY`, `ARTICLE GROUP (SIZE GROUP)`, `MASTER CARTON QUANTITY`.
> - Empty CSV (no data rows) → `ConflictError` → HTTP 409.
> - Missing required column → `ConflictError` → HTTP 409.
> - Sum of qty > 20 000 → `ConflictError` → HTTP 409.
> - Per-row: qty = 0 → **skipped** (not an error); increments `rows_skipped_zero`.
> - Per-row: qty negative or non-numeric → **error** row; row still counted in errors array.
> - Per-row: section not in `product_sections` → stored verbatim, **warning** appended.
> - Per-row: existing legacy section in DB → **warning** ("re-upload is additive") + cartons created.
> - Per-row: category not in `['Gents','Ladies','Boys','Girls']` → stored verbatim, **warning**.
> - Successful rows: each qty-N row inserts N master carton rows with `is_legacy = true`, `status = 'CLOSED'`, `child_count = 0`, `max_capacity = 50`.
> - Writes **audit log** per row (`BULK_CREATE_LEGACY_CARTONS`).
> - Writes **NO `inventory_transactions`** — the transaction trail starts at `openLegacyCarton`.
> - Response shape: `{ cartons_created, rows_processed, rows_skipped_zero, warnings[], errors[] }`.
> - HTTP **201** on success (controller calls `sendSuccess(..., 201)`).
> - Partial success: rows with errors are excluded; successfully processed rows are committed independently per row.
>
> **`openLegacyCarton` (`masterCarton.service.ts`):**
> - Requires `is_legacy = true`; non-legacy carton → `BadRequestError` → HTTP 400.
> - Non-existent carton ID → `NotFoundError` → HTTP 404.
> - On success: sets `is_legacy = false`, `status = 'CREATED'`, `child_count = 0`; retains barcode, `section`/`category`/`article_group`/`size_group` for provenance.
> - Writes one `inventory_transactions` row of type `LEGACY_CARTON_OPENED`.
> - Writes one `audit_logs` row (`OPEN_LEGACY_CARTON`).
> - Does **NOT** auto-create any child boxes — operator must generate labels and scan them in.
> - HTTP 200 on success.
>
> **`getMasterCartons` list with `includeLegacy`:**
> - Default (`includeLegacy` absent): `is_legacy = false` filter applied — legacy cartons **hidden**.
> - `includeLegacy=true`: `is_legacy = true` filter — shows only legacy cartons.
> - Neither `true` nor `false` value: treated as undefined → defaults to hide legacy.
>
> **Frontend:**
> - `LegacyUploadButton` (`components/inventory/LegacyUploadButton.tsx`): gated by `useCan('cartons:create')` — returns `null` (hidden entirely) for Dispatch Operator.
> - Button placement: `/inventory` page (`PageHeader` action slot).
> - Modal: sample CSV download button, file picker (`.csv` accept), Upload & Create Cartons button, result panel showing `cartons_created`, `rows_processed`, `rows_skipped_zero`, `warnings[]`, `errors[]`.
> - Result panel replaces file picker; "Upload Another File" button resets to file picker.
> - Sample CSV downloaded via authenticated `fetch()` (not plain `<a href>`) using `localStorage` token.
> - Master Cartons list page (`/master-cartons`): "Show legacy" checkbox (off by default); when checked sends `includeLegacy=true`; legacy rows show amber **Legacy** badge.
> - Detail page (`/master-cartons/[id]`): legacy carton shows amber info banner + **Open for Repacking** button (gated by `canUnpack` = `packing:unpack`); normal Full Unpack button hidden while `is_legacy = true`.
> - Open for Repacking: confirmation modal → `POST /:id/open-legacy`; on success, banner disappears, button disappears, Add Boxes becomes available.
> - No existing Playwright spec covers legacy upload or open-for-repacking (confirmed: no `43-*` or `legacy-*` spec file exists).
>
> **Discrepancy notes:**
> - `GET /master-cartons` list has **no permission gate** (`authenticate` only) → all 4 roles can list cartons including legacy via `includeLegacy=true` parameter. Encode as explicit TCs.
> - `GET /master-cartons/:id` (detail) similarly auth-only — all roles can view a legacy carton detail page by URL.
> - `POST /legacy-upload` controller sends HTTP **201** (not 200) — confirm in API TCs.

---

## Table of Contents

- [Section 35.1 — Sample CSV download (GET /legacy-upload/sample)](#section-351--sample-csv-download)
- [Section 35.2 — Bulk legacy upload — Happy path](#section-352--bulk-legacy-upload--happy-path)
- [Section 35.3 — Bulk upload — Per-row validation](#section-353--bulk-upload--per-row-validation)
- [Section 35.4 — Bulk upload — Zero-qty rows skipped (not errored)](#section-354--bulk-upload--zero-qty-rows-skipped-not-errored)
- [Section 35.5 — Bulk upload — Whole-file validation](#section-355--bulk-upload--whole-file-validation)
- [Section 35.6 — Bulk upload — Duplicate section warning (additive behaviour)](#section-356--bulk-upload--duplicate-section-warning-additive-behaviour)
- [Section 35.7 — Bulk upload — Result report panel (all four fields)](#section-357--bulk-upload--result-report-panel-all-four-fields)
- [Section 35.8 — Bulk upload — RBAC](#section-358--bulk-upload--rbac)
- [Section 35.9 — Bulk upload — Audit trail (no inventory_transactions)](#section-359--bulk-upload--audit-trail-no-inventory_transactions)
- [Section 35.10 — includeLegacy list toggle](#section-3510--includelegacy-list-toggle)
- [Section 35.11 — Legacy badge on list row](#section-3511--legacy-badge-on-list-row)
- [Section 35.12 — Legacy carton detail page (opaque count-level state)](#section-3512--legacy-carton-detail-page-opaque-count-level-state)
- [Section 35.13 — Open for Repacking — Happy path](#section-3513--open-for-repacking--happy-path)
- [Section 35.14 — Open for Repacking — Guard: non-legacy carton rejected](#section-3514--open-for-repacking--guard-non-legacy-carton-rejected)
- [Section 35.15 — Open for Repacking — RBAC](#section-3515--open-for-repacking--rbac)
- [Section 35.16 — Open for Repacking — Audit and transaction trail](#section-3516--open-for-repacking--audit-and-transaction-trail)
- [Section 35.17 — Post-open workflow: operator scans child boxes in](#section-3517--post-open-workflow-operator-scans-child-boxes-in)
- [Section 35.18 — Frontend E2E: LegacyUploadButton modal](#section-3518--frontend-e2e-legacyuploadbutton-modal)
- [Section 35.19 — Frontend E2E: Open for Repacking modal](#section-3519--frontend-e2e-open-for-repacking-modal)
- [Section 35.20 — Order-sensitive route: /legacy-upload/sample not shadowed by /:id](#section-3520--order-sensitive-route)

---

## Section 35.1 — Sample CSV download

> `GET /master-cartons/legacy-upload/sample` — permission `cartons:read` — all 4 seeded roles hold this permission.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-001 | Admin | Admin downloads sample CSV — 200 with correct headers | P0 | 1. Login as Admin, obtain token. 2. `GET /api/v1/master-cartons/legacy-upload/sample` with `Authorization: Bearer <token>`. | HTTP 200; `Content-Type: text/csv`; `Content-Disposition` contains `legacy_carton_upload_sample.csv`; CSV first line = `SECTION,CATEGORY,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY`. | API | AUTOMATION GAP — no Playwright spec; recommend `43-legacy-inventory.spec.ts` |
| TC-LEG-002 | Supervisor | Supervisor downloads sample CSV — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/master-cartons/legacy-upload/sample` with Supervisor token. | HTTP 200; CSV returned (Supervisor holds `cartons:read`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-003 | Warehouse Operator | Warehouse Operator downloads sample CSV — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/master-cartons/legacy-upload/sample` with WH-Op token. | HTTP 200; CSV returned (Warehouse Operator holds `cartons:read`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-004 | Dispatch Operator | Dispatch Operator downloads sample CSV — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/master-cartons/legacy-upload/sample` with Dispatch-Op token. | HTTP 200; CSV returned (Dispatch Operator holds `cartons:read`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-005 | Unauthenticated | Unauthenticated request for sample CSV — 401 | P0 | 1. `GET /api/v1/master-cartons/legacy-upload/sample` with no Authorization header. | HTTP 401. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-006 | Admin | Sample CSV body contains two example data rows | P1 | 1. `GET /api/v1/master-cartons/legacy-upload/sample` as Admin. 2. Parse the returned CSV. | CSV has exactly 3 lines (header + 2 data rows). Row 2: `Hawaii,Ladies,ALIA PLUS (4-8),16`. Row 3: `Hawaii,Gents,BUSKER 01-20 (6-10),0`. | API | Confirms sample includes a zero-qty row as illustration. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.2 — Bulk legacy upload — Happy path

> `POST /master-cartons/legacy-upload` — permission `cartons:create`. Response HTTP 201.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-010 | Admin | Admin uploads valid CSV with two rows — cartons created | P0 | 1. Login as Admin. 2. Build CSV: header `SECTION,CATEGORY,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY` + row `Hawaii,Ladies,ALIA PLUS (4-8),3` + row `Hawaii,Gents,BUSKER 01-20 (6-10),2`. 3. `POST /api/v1/master-cartons/legacy-upload` multipart/form-data, field `file` = the CSV file. | HTTP 201; `data.cartons_created === 5`; `data.rows_processed === 2`; `data.rows_skipped_zero === 0`; `data.warnings` is array (may be non-empty if section already exists); `data.errors` is empty array. DB: 5 new rows in `master_cartons` with `is_legacy = true`, `status = 'CLOSED'`, `child_count = 0`, `max_capacity = 50`. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-011 | Admin | Each created legacy carton has a unique barcode | P0 | 1. Upload CSV with row `Hawaii,Ladies,TEST (4-6),4`. 2. Query: `SELECT carton_barcode FROM master_cartons WHERE is_legacy = true AND article_group = 'TEST' ORDER BY created_at DESC LIMIT 4`. | 4 rows returned; all 4 barcodes are distinct; each starts with `MC`. | Integration | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-012 | Admin | Legacy carton carries article_group and size_group parsed from CSV | P0 | 1. Upload row `Hawaii,Ladies,ALIA PLUS (4-8),1`. 2. Query the created carton. | `article_group = 'ALIA PLUS'`; `size_group = '4-8'`; `section = 'Hawaii'`; `category = 'Ladies'`. | Integration | Parser: last balanced `(...)` group = size_group; everything before = article_group. AUTOMATION GAP |
| TC-LEG-013 | Admin | Article group with no parentheses stored as article_group with null size_group | P1 | 1. Upload row `Hawaii,Gents,PLAIN SLIPPER,2`. | `article_group = 'PLAIN SLIPPER'`; `size_group` is null. | Integration | parseArticleGroup: no `(...)` → size_group null. AUTOMATION GAP |
| TC-LEG-014 | Admin | Article group with suffix after closing paren parsed correctly | P1 | 1. Upload row `Hawaii,Boys,MOGLI (6-8)K,1`. | `article_group = 'MOGLIK'`; `size_group = '6-8'`. | Integration | afterParen `K` appended to beforeParen per parser logic. AUTOMATION GAP |
| TC-LEG-015 | Supervisor | Supervisor uploads valid CSV — 201 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/master-cartons/legacy-upload` with 1-row CSV (`Hawaii,Ladies,SUPER TEST (3-5),1`). | HTTP 201; `data.cartons_created === 1`. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-016 | Warehouse Operator | Warehouse Operator uploads valid CSV — 201 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/legacy-upload` with 1-row CSV. | HTTP 201; `data.cartons_created === 1`. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.3 — Bulk upload — Per-row validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-020 | Admin | Negative quantity row is an error (not skipped) | P0 | 1. Upload CSV with row `Hawaii,Ladies,ALIA PLUS (4-8),-1`. | HTTP 201 (partial); `data.cartons_created === 0`; `data.errors` has one entry with `row: 2` and `error` containing `"Invalid quantity"`. | API | qty < 0: `isNaN(qty) || qty < 0` check → error. Distinct from qty = 0 (skip). AUTOMATION GAP |
| TC-LEG-021 | Admin | Non-numeric quantity row is an error | P0 | 1. Upload CSV with row `Hawaii,Ladies,ALIA PLUS (4-8),abc`. | HTTP 201; `data.errors[0].row === 2`; error text mentions invalid quantity `"abc"`. | API | `parseInt('abc', 10)` = NaN → error branch. AUTOMATION GAP |
| TC-LEG-022 | Admin | Unknown section stored verbatim with warning (not an error) | P1 | 1. Upload row `UNKNOWNSECTION,Ladies,TEST (3-5),1`. | HTTP 201; `data.cartons_created === 1`; `data.errors` is empty; `data.warnings` contains one entry mentioning `"UNKNOWNSECTION"` and `"did not match any known section"`. DB: carton row has `section = 'UNKNOWNSECTION'`. | API | normalizeSection: unmatched → stored verbatim + warning. AUTOMATION GAP |
| TC-LEG-023 | Admin | Unknown category stored verbatim with warning (not an error) | P1 | 1. Upload row `Hawaii,Infants,TEST (3-5),1`. | HTTP 201; `data.cartons_created === 1`; `data.warnings` contains entry mentioning `"Infants"` and `"did not match any known category"`. DB: `category = 'Infants'`. | API | normalizeCategory: not in `['Gents','Ladies','Boys','Girls']` → warning. AUTOMATION GAP |
| TC-LEG-024 | Admin | Section matching is case-insensitive | P1 | 1. Ensure section `Hawaii` exists. 2. Upload row `hawaii,Ladies,TEST (3-5),1`. | HTTP 201; `data.cartons_created === 1`; no "did not match" warning; DB carton has `section = 'Hawaii'` (canonical casing). | API | `LOWER(name) = LOWER($1)` → canonical stored. AUTOMATION GAP |
| TC-LEG-025 | Admin | Category matching is case-insensitive | P1 | 1. Upload row `Hawaii,ladies,TEST (3-5),1`. | HTTP 201; `data.cartons_created === 1`; no category warning; DB `category = 'Ladies'` (canonical form). | API | AUTOMATION GAP |
| TC-LEG-026 | Admin | Mixed valid and error rows — partial success | P0 | 1. Upload 3-row CSV: row 2 valid (qty 2), row 3 invalid qty (`-3`), row 4 valid (qty 1). | HTTP 201; `data.cartons_created === 3`; `data.rows_processed === 2`; `data.errors` has one entry (`row: 3`); DB has 3 new legacy cartons; errored row is not in DB. | API | Per-row transaction: each row committed independently. AUTOMATION GAP |
| TC-LEG-027 | Admin | Error row entry includes section, category, article_group | P1 | 1. Upload row `Hawaii,Ladies,ALIA PLUS (4-8),-1`. | `data.errors[0]` has `section = 'Hawaii'`, `category = 'Ladies'`, `article_group = 'ALIA PLUS'`, `status = 'error'`. | API | LegacyRowResult interface fields. AUTOMATION GAP |

---

## Section 35.4 — Bulk upload — Zero-qty rows skipped (not errored)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-030 | Admin | Zero-qty row is skipped — not an error | P0 | 1. Upload 2-row CSV: row 2 `Hawaii,Ladies,ALIA PLUS (4-8),0`; row 3 `Hawaii,Gents,BUSKER (6-10),2`. | HTTP 201; `data.cartons_created === 2`; `data.rows_processed === 1`; `data.rows_skipped_zero === 1`; `data.errors` is empty. | API | `qty === 0` → `rows_skipped_zero++; continue` — not pushed to errors. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-031 | Admin | All rows zero-qty — no cartons created but 201 returned | P1 | 1. Upload CSV with 3 rows all having `MASTER CARTON QUANTITY = 0`. | HTTP 201; `data.cartons_created === 0`; `data.rows_processed === 0`; `data.rows_skipped_zero === 3`; `data.errors` empty; DB: no new legacy carton rows. | API | `rows_skipped_zero` increments for each; no ConflictError (empty check is on records.length not on qty sum). AUTOMATION GAP |
| TC-LEG-032 | Admin | Zero-qty row in sample CSV file does not cause an error message | P1 | 1. Download the sample CSV via `GET /legacy-upload/sample`. 2. Upload the downloaded sample CSV as-is. | HTTP 201; `data.rows_skipped_zero === 1` (the `0`-qty Busker row); `data.errors` empty; `data.cartons_created === 16` (the Hawaii/Ladies row with qty 16). | API | Validates the sample file is self-consistent. AUTOMATION GAP |
| TC-LEG-033 | Admin | UI result panel shows rows_skipped_zero count when non-zero | P1 | 1. Navigate to `/inventory` as Admin. 2. Click "Upload Existing Stock". 3. Upload CSV containing one zero-qty row and one normal row. 4. Submit. | After upload, green result card shows `· 1 skipped (zero qty)` text in the subline. | E2E | LegacyUploadButton: `{result.rows_skipped_zero > 0 ? ' · ${rows_skipped_zero} skipped (zero qty)' : ''}`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.5 — Bulk upload — Whole-file validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-040 | Admin | No file attached — 400 | P0 | 1. `POST /api/v1/master-cartons/legacy-upload` with no `file` field in multipart body. | HTTP 400; `message: "No CSV file provided"`. | API | Controller check: `if (!file) → 400`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-041 | Admin | Empty CSV (header only, no data rows) — 409 | P0 | 1. Upload CSV containing only the header line. | HTTP 409; `message` contains "CSV file is empty". | API | `records.length === 0` → `ConflictError`. AUTOMATION GAP |
| TC-LEG-042 | Admin | CSV with no header at all parsed as single data row — error | P1 | 1. Upload CSV containing only `Hawaii,Ladies,ALIA PLUS (4-8),2` (no header row). | HTTP 409; service throws `ConflictError` for missing required headers (header key check fails when `records[0]` keys are the raw first-row values). | API | csv-parse `columns: true` treats first row as headers; none match required headers. AUTOMATION GAP |
| TC-LEG-043 | Admin | Missing required column (CATEGORY absent) — 409 | P0 | 1. Upload CSV with header `SECTION,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY` (no CATEGORY column). | HTTP 409; `message` contains `"Missing required columns"` and mentions `"category"`. | API | `missingHeaders` check; columns are matched case-insensitively. AUTOMATION GAP |
| TC-LEG-044 | Admin | Total qty > 20000 across file — 409 | P0 | 1. Upload CSV with rows totalling 20001 (e.g., one row with qty 20001). | HTTP 409; `message` contains `"20,000"` and `"Split into multiple files"`. | API | Sum check before per-row loop; counts only valid positive qty values. AUTOMATION GAP |
| TC-LEG-045 | Admin | Total qty exactly 20000 — accepted | P1 | 1. Upload CSV with exactly 20000 total qty (e.g., 4 rows × 5000). | HTTP 201; `data.cartons_created === 20000`. | API | Boundary: `totalQty > 20000` (strict greater-than). AUTOMATION GAP |
| TC-LEG-046 | Admin | Malformed CSV (binary/corrupt file) — 409 | P1 | 1. `POST /api/v1/master-cartons/legacy-upload` with a binary file (e.g., a PNG renamed to .csv). | HTTP 409; `message` contains "Invalid CSV format". | API | `csv-parse` throws → caught → ConflictError. AUTOMATION GAP |
| TC-LEG-047 | Admin | CSV with extra unknown columns — accepted (extra columns ignored) | P2 | 1. Upload CSV with header `SECTION,CATEGORY,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY,NOTES` and one valid data row. | HTTP 201; `data.cartons_created === <qty>`; extra column silently ignored. | API | Required header check is additive (`missingHeaders`), not exclusive. AUTOMATION GAP |
| TC-LEG-048 | Admin | Column header matching is case-insensitive | P1 | 1. Upload CSV with header `section,category,article group (size group),master carton quantity` (all lowercase). | HTTP 201; no missing-column error; cartons created normally. | API | `headerKeys = headers.map(h => h.toLowerCase().trim())` then compared lowercase. AUTOMATION GAP |

---

## Section 35.6 — Bulk upload — Duplicate section warning (additive behaviour)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-050 | Admin | Re-uploading same section adds cartons and emits warning | P0 | 1. Upload CSV with `Hawaii,Ladies,ALIA PLUS (4-8),2`. 2. Upload same CSV again. | Second upload: HTTP 201; `data.cartons_created === 2`; `data.warnings` contains one entry mentioning `"Hawaii"` and `"already has legacy cartons"` and `"additive"`; DB has 4 total legacy cartons for that section. | API | `existingSections` checked per row; re-upload is additive. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-051 | Admin | Warning does not block row creation | P0 | 1. Same as TC-LEG-050 step 2. | `data.cartons_created === 2` (warning does not reduce created count). | API | Warning path does not `continue` or push to errors. AUTOMATION GAP |
| TC-LEG-052 | Admin | New section (no prior legacy cartons) — no duplicate warning | P1 | 1. Upload CSV with a section name that has zero existing legacy cartons. | `data.warnings` does not contain "already has legacy cartons". | API | `existingSections` set is built from `SELECT DISTINCT section WHERE is_legacy = true`. AUTOMATION GAP |

---

## Section 35.7 — Bulk upload — Result report panel (all four fields)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-060 | Admin | API response always returns all four result fields | P0 | 1. Upload any valid CSV. | Response `data` object has exactly: `cartons_created` (integer ≥ 0), `rows_processed` (integer ≥ 0), `rows_skipped_zero` (integer ≥ 0), `warnings` (array), `errors` (array). | API | LegacyUploadResult interface. AUTOMATION GAP |
| TC-LEG-061 | Admin | cartons_created equals sum of qty across non-error, non-zero rows | P0 | 1. Upload 3-row CSV: qty 3, 0, 2. Row 2 (qty 3) and row 4 (qty 2) are valid; row 3 (qty 0) is skipped. | `data.cartons_created === 5`; `data.rows_processed === 2`; `data.rows_skipped_zero === 1`. | API | AUTOMATION GAP |
| TC-LEG-062 | Admin | errors array contains one entry per failed row | P0 | 1. Upload CSV with 2 error rows (qty -1, qty -2) and 1 valid row (qty 1). | `data.errors.length === 2`; `data.errors[0].row === 2`; `data.errors[1].row === 3`; `data.cartons_created === 1`. | API | AUTOMATION GAP |
| TC-LEG-063 | Admin | warnings array contains one entry per warning trigger per row | P1 | 1. Upload CSV: row with unknown section (1 warning), row with unknown category (1 warning), row that is duplicate section (1 warning). | `data.warnings.length === 3` (or more if section also triggers duplicate warning). Each warning string references its row number. | API | One warning appended per normalisation mismatch per row. AUTOMATION GAP |

---

## Section 35.8 — Bulk upload — RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-070 | Admin | Admin POST /legacy-upload — 201 | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/legacy-upload` with valid 1-row CSV. | HTTP 201; carton created. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-071 | Supervisor | Supervisor POST /legacy-upload — 201 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/master-cartons/legacy-upload` with valid 1-row CSV. | HTTP 201; carton created (Supervisor holds `cartons:create`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-072 | Warehouse Operator | Warehouse Operator POST /legacy-upload — 201 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/legacy-upload` with valid 1-row CSV. | HTTP 201; carton created (Warehouse Operator holds `cartons:create`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-073 | Dispatch Operator | Dispatch Operator POST /legacy-upload — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/legacy-upload` with valid 1-row CSV. | HTTP 403; no carton created (Dispatch Operator does NOT hold `cartons:create`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-074 | Unauthenticated | Unauthenticated POST /legacy-upload — 401 | P0 | 1. `POST /api/v1/master-cartons/legacy-upload` with no Authorization header. | HTTP 401. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-075 | Dispatch Operator | LegacyUploadButton hidden for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/inventory`. | "Upload Existing Stock" button is absent from the page (component returns `null` when `useCan('cartons:create')` is false). | E2E | `if (!canCreate) return null`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-076 | Admin | LegacyUploadButton visible for Admin | P0 | 1. Login as Admin. 2. Navigate to `/inventory`. | "Upload Existing Stock" button is visible in the page header action area. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-077 | Supervisor | LegacyUploadButton visible for Supervisor | P1 | 1. Login as Supervisor. 2. Navigate to `/inventory`. | "Upload Existing Stock" button is visible. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-078 | Warehouse Operator | LegacyUploadButton visible for Warehouse Operator | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/inventory`. | "Upload Existing Stock" button is visible. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.9 — Bulk upload — Audit trail (no inventory_transactions)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-080 | Admin | Bulk upload writes audit log entry per row, NOT per carton | P0 | 1. Upload CSV with 2 valid rows (qty 3, qty 2). 2. Query: `SELECT * FROM audit_logs WHERE action = 'BULK_CREATE_LEGACY_CARTONS' ORDER BY created_at DESC LIMIT 10`. | Exactly 2 new audit rows (one per CSV row, not per carton). Each row has `entity_type = 'master_carton'`; `new_values.quantity` equals the row's qty; `new_values.cartons_created` equals the row's qty. | Integration | Service calls `createAuditLog` once per row after transaction COMMIT. AUTOMATION GAP |
| TC-LEG-081 | Admin | Bulk upload writes NO inventory_transactions rows | P0 | 1. Note current count: `SELECT COUNT(*) FROM inventory_transactions`. 2. Upload CSV with 2 valid rows (qty 5 total). 3. `SELECT COUNT(*) FROM inventory_transactions` again. | Count is unchanged — no `inventory_transactions` rows inserted by the legacy upload. | Integration | Verified: `bulkCreateLegacyCartons` never inserts into `inventory_transactions`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-082 | Admin | Error rows do NOT produce audit log entries | P1 | 1. Upload CSV with one valid row (qty 1) and one error row (qty -1). 2. Query audit_logs for `BULK_CREATE_LEGACY_CARTONS`. | Only 1 new audit entry (for the valid row); no audit entry for the error row. | Integration | Audit is written in `try` after `COMMIT`; error rows hit the `catch` + `ROLLBACK` path. AUTOMATION GAP |

---

## Section 35.10 — includeLegacy list toggle

> `GET /master-cartons` — auth-only, no permission gate. `includeLegacy` query parameter.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-090 | Admin | GET /master-cartons default — legacy cartons excluded | P0 | 1. Ensure at least one legacy carton exists. 2. `GET /api/v1/master-cartons` (no `includeLegacy` param). | HTTP 200; response `data` contains no rows where `is_legacy === true`. | API | Default: `conditions.push('mc.is_legacy = false')`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-091 | Admin | GET /master-cartons?includeLegacy=true — only legacy cartons returned | P0 | 1. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200; all rows in `data` have `is_legacy === true`; non-legacy cartons absent. | API | `is_legacy = true` filter applied exclusively. AUTOMATION GAP |
| TC-LEG-092 | Admin | GET /master-cartons?includeLegacy=false — non-legacy only | P1 | 1. `GET /api/v1/master-cartons?includeLegacy=false`. | HTTP 200; all rows have `is_legacy === false`. | API | Explicit false → `mc.is_legacy = false` condition. AUTOMATION GAP |
| TC-LEG-093 | Supervisor | All 4 roles can list cartons including legacy (auth-only gate) | P0 | 1. Login as Supervisor. 2. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200 (Supervisor has no `cartons:read` explicit requirement; route is auth-only). | API | **Discrepancy:** list route has no `authorizePermission` gate. AUTOMATION GAP |
| TC-LEG-094 | Warehouse Operator | Warehouse Operator can list legacy cartons | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200. | API | AUTOMATION GAP |
| TC-LEG-095 | Dispatch Operator | Dispatch Operator can list legacy cartons | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200. | API | AUTOMATION GAP |
| TC-LEG-096 | Unauthenticated | Unauthenticated GET /master-cartons — 401 | P0 | 1. `GET /api/v1/master-cartons?includeLegacy=true` with no token. | HTTP 401. | API | AUTOMATION GAP |
| TC-LEG-097 | Admin | Frontend "Show legacy" checkbox off by default | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons`. | "Show legacy" checkbox is unchecked; no legacy cartons visible in list. | E2E | `useState(false)` default. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-098 | Admin | Checking "Show legacy" toggles to legacy-only view | P0 | 1. Navigate to `/master-cartons`. 2. Check the "Show legacy" checkbox. | Checkbox becomes checked; list re-fetches with `includeLegacy=true`; page resets to 1; legacy cartons appear in list. | E2E | `setShowLegacy(e.target.checked); setPage(1)`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-099 | Admin | Unchecking "Show legacy" reverts to normal carton list | P1 | 1. Check "Show legacy". 2. Uncheck it. | List returns to non-legacy cartons only; no legacy rows. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.11 — Legacy badge on list row

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-100 | Admin | Legacy badge appears on legacy carton rows in list | P0 | 1. Navigate to `/master-cartons`. 2. Check "Show legacy". 3. Observe the list. | Each legacy row shows an amber "Legacy" badge (amber-100 background, amber-300 border, amber-800 text, text-[10px]) adjacent to the carton barcode. | E2E | Badge rendered both in desktop table cell and mobile card. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-101 | Admin | Legacy badge absent on normal (non-legacy) carton rows | P0 | 1. Navigate to `/master-cartons` with "Show legacy" unchecked (default). | No amber "Legacy" badge visible anywhere in the list. | E2E | `{carton.is_legacy && <span>Legacy</span>}` conditional. AUTOMATION GAP |
| TC-LEG-102 | Admin | Status badge on legacy row shows CLOSED | P1 | 1. Show legacy list. 2. Observe status badge on a legacy carton. | Status badge shows "CLOSED" (legacy cartons are created with `status = 'CLOSED'`). | E2E | DB insert sets `status = 'CLOSED'` for all legacy cartons. AUTOMATION GAP |

---

## Section 35.12 — Legacy carton detail page (opaque count-level state)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-110 | Admin | Legacy carton detail shows amber info banner | P0 | 1. Navigate to a legacy carton's detail page (`/master-cartons/<id>`). | Amber banner visible: "Legacy (pre-go-live) carton" heading; body text explains count-only record, instructs to click "Open for Repacking". | E2E | `{carton.is_legacy && <div className="border border-amber-300 ...">}`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-111 | Admin | Legacy carton detail shows child_count = 0 in capacity card | P1 | 1. Navigate to a legacy carton's detail page. | Capacity card shows `0 / 50` (child_count = 0; max_capacity = 50; no individual child boxes). | E2E | `child_count = 0` on legacy insert. AUTOMATION GAP |
| TC-LEG-112 | Admin | Legacy carton detail "Child Boxes" panel shows empty | P1 | 1. Navigate to a legacy carton's detail page. | "Child Boxes (0)" heading; "No child boxes in this carton." empty state shown. | E2E | No `carton_child_mapping` rows for legacy carton. AUTOMATION GAP |
| TC-LEG-113 | Admin | Legacy carton detail "Open for Repacking" button visible when canUnpack | P0 | 1. Login as Admin (`packing:unpack`). 2. Navigate to legacy carton detail. | "Open for Repacking" primary button visible in page header action area. | E2E | `{canUnpack && carton.is_legacy && <Button>Open for Repacking</Button>}`. AUTOMATION GAP |
| TC-LEG-114 | Admin | Legacy carton detail "Full Unpack" button hidden | P0 | 1. Navigate to legacy carton detail as Admin. | "Full Unpack" (danger) button is NOT visible (it is guarded by `!carton.is_legacy`). | E2E | `{canUnpack && statusAllowsUnpack && !carton.is_legacy && <Button>Full Unpack</Button>}`. AUTOMATION GAP |
| TC-LEG-115 | Admin | Legacy carton detail "Add Boxes" button hidden while is_legacy | P1 | 1. Navigate to legacy carton detail as Admin. | "Add Boxes" button is NOT visible (guarded by `statusAllowsAddBoxes` which requires `status === 'ACTIVE' || status === 'CREATED'`; legacy carton has `status = 'CLOSED'`). | E2E | `statusAllowsAddBoxes = status === 'ACTIVE' || status === 'CREATED'`; legacy = CLOSED → false. AUTOMATION GAP |
| TC-LEG-116 | Dispatch Operator | Dispatch Operator sees legacy detail but no "Open for Repacking" button | P0 | 1. Login as Dispatch Operator. 2. Navigate to a legacy carton detail page by URL. | Page loads (auth-only GET); amber banner visible; "Open for Repacking" button absent (Dispatch Operator lacks `packing:unpack`). | E2E | `canUnpack = useCan('packing:unpack')` = false for Dispatch Op. AUTOMATION GAP |
| TC-LEG-117 | Admin | GET /master-cartons/:id returns legacy carton with is_legacy = true | P0 | 1. `GET /api/v1/master-cartons/<legacy-carton-id>` as Admin. | HTTP 200; `data.is_legacy === true`; `data.status === 'CLOSED'`; `data.child_boxes` is empty array. | API | AUTOMATION GAP |

---

## Section 35.13 — Open for Repacking — Happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-120 | Admin | Admin opens legacy carton — 200, becomes CREATED non-legacy | P0 | 1. Create a legacy carton via upload (qty 1). Note its UUID. 2. `POST /api/v1/master-cartons/<id>/open-legacy` as Admin. | HTTP 200; `data.is_legacy === false`; `data.status === 'CREATED'`; `data.child_count === 0`. DB row: `is_legacy = false`, `status = 'CREATED'`, `child_count = 0`. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-121 | Admin | Opened carton retains barcode, section, category, article_group, size_group | P1 | 1. Open a legacy carton (TC-LEG-120). 2. Fetch the carton: `GET /api/v1/master-cartons/<id>`. | `carton_barcode` unchanged; `section`, `category`, `article_group`, `size_group` values retained (provenance preserved). | API | Service: `SET is_legacy = false, status = 'CREATED', child_count = 0` — other columns unchanged. AUTOMATION GAP |
| TC-LEG-122 | Admin | Opened carton no longer appears in legacy-only list | P0 | 1. Open legacy carton. 2. `GET /api/v1/master-cartons?includeLegacy=true`. | Opened carton is absent (its `is_legacy = false` now). | API | AUTOMATION GAP |
| TC-LEG-123 | Admin | Opened carton appears in default (non-legacy) list | P1 | 1. Open legacy carton. 2. `GET /api/v1/master-cartons` (no `includeLegacy`). | Opened carton IS present in results (`is_legacy = false` → passes `mc.is_legacy = false` filter). | API | AUTOMATION GAP |
| TC-LEG-124 | Supervisor | Supervisor opens legacy carton — 200 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 200; `data.is_legacy === false` (Supervisor holds `packing:unpack`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-125 | Warehouse Operator | Warehouse Operator opens legacy carton — 200 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 200 (Warehouse Operator holds `packing:unpack`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |

---

## Section 35.14 — Open for Repacking — Guard: non-legacy carton rejected

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-130 | Admin | Opening a normal (non-legacy) carton — 400 | P0 | 1. Create a normal master carton via `POST /master-cartons`. Note its id. 2. `POST /api/v1/master-cartons/<id>/open-legacy` as Admin. | HTTP 400; `message: "Only legacy cartons can be opened for repacking"`. DB: carton unchanged. | API | `if (!carton.is_legacy) throw BadRequestError(...)`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-131 | Admin | Opening an already-opened (is_legacy=false) carton — 400 | P0 | 1. Open a legacy carton once (TC-LEG-120). 2. `POST /api/v1/master-cartons/<id>/open-legacy` a second time. | HTTP 400; same "Only legacy cartons" message (the carton is now `is_legacy = false`). | API | Idempotency guard. AUTOMATION GAP |
| TC-LEG-132 | Admin | Non-existent carton ID — 404 | P0 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/open-legacy` as Admin. | HTTP 404; `message: "Master carton not found"`. | API | `NotFoundError` from service. AUTOMATION GAP |

---

## Section 35.15 — Open for Repacking — RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-140 | Admin | Admin POST /:id/open-legacy — 200 | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 200. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-141 | Supervisor | Supervisor POST /:id/open-legacy — 200 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 200 (Supervisor holds `packing:unpack`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-142 | Warehouse Operator | Warehouse Operator POST /:id/open-legacy — 200 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 200 (Warehouse Operator holds `packing:unpack`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-143 | Dispatch Operator | Dispatch Operator POST /:id/open-legacy — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/<legacy-id>/open-legacy`. | HTTP 403; carton remains `is_legacy = true` (Dispatch Operator does NOT hold `packing:unpack`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-144 | Unauthenticated | Unauthenticated POST /:id/open-legacy — 401 | P0 | 1. `POST /api/v1/master-cartons/<legacy-id>/open-legacy` with no Authorization header. | HTTP 401. | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-145 | Dispatch Operator | "Open for Repacking" button absent for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Navigate to a legacy carton detail page by URL. | "Open for Repacking" button is NOT rendered (`canUnpack` = false). | E2E | `useCan('packing:unpack')` = false for Dispatch Op. AUTOMATION GAP |

---

## Section 35.16 — Open for Repacking — Audit and transaction trail

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-150 | Admin | open-legacy writes one LEGACY_CARTON_OPENED inventory_transaction | P0 | 1. Open a legacy carton. 2. Query: `SELECT * FROM inventory_transactions WHERE master_carton_id = '<id>' AND transaction_type = 'LEGACY_CARTON_OPENED'`. | Exactly 1 row; `transaction_type = 'LEGACY_CARTON_OPENED'`; `master_carton_id` = opened carton's id; `performed_by` = opener's user_id; `notes` contains the carton barcode and "opened for repacking". | Integration | This is the FIRST inventory_transactions row for this carton (upload wrote none). AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-151 | Admin | open-legacy writes one audit_log entry | P0 | 1. Open a legacy carton. 2. Query: `SELECT * FROM audit_logs WHERE action = 'OPEN_LEGACY_CARTON' AND entity_id = '<id>'`. | 1 row; `action = 'OPEN_LEGACY_CARTON'`; `entity_type = 'master_carton'`; `new_values` contains `{is_legacy: false, status: 'CREATED'}`. | Integration | AUTOMATION GAP |
| TC-LEG-152 | Admin | Before open-legacy, carton has zero inventory_transactions | P1 | 1. Upload a legacy carton and note its id. 2. Query: `SELECT COUNT(*) FROM inventory_transactions WHERE master_carton_id = '<id>'`. | Count = 0 (bulk upload writes no transactions). | Integration | Confirms the "trail starts at open" contract. AUTOMATION GAP |
| TC-LEG-153 | Admin | open-legacy transaction is visible in scan/trace timeline | P1 | 1. Open a legacy carton with barcode `MC######`. 2. Navigate to `/scan` or `/traceability`. 3. Scan or enter `MC######`. | Timeline includes a `LEGACY_CARTON_OPENED` event with timestamp and performer. | E2E | Traceability pulls from `inventory_transactions`. AUTOMATION GAP |

---

## Section 35.17 — Post-open workflow: operator scans child boxes in

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-160 | Admin | After open-legacy, Add Boxes section becomes available | P0 | 1. Open a legacy carton via UI confirmation modal. 2. Observe the detail page after success toast. | Amber banner disappears; "Open for Repacking" button disappears; "Add Boxes" button appears (status is now CREATED → `statusAllowsAddBoxes = true`, `canPack = true`). | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-161 | Admin | Opened carton does NOT auto-create child boxes | P0 | 1. Open a legacy carton (qty=5 means 5 separate DB rows). 2. `GET /api/v1/master-cartons/<id>/children`. | HTTP 200; `data` is empty array (`[]`). No child boxes automatically created. | API | Service sets `child_count = 0`; no insert into `child_boxes` or `carton_child_mapping`. AUTOMATION GAP |
| TC-LEG-162 | Admin | Operator scans FREE child box into opened carton | P0 | 1. Open legacy carton (now CREATED). 2. Create a FREE child box. 3. Via Add Boxes + HID scan, scan the child box barcode. | Child box status → PACKED; carton `child_count` increments to 1; carton status → ACTIVE; CHILD_PACKED transaction written. | E2E | Normal pack-by-barcode flow after open. AUTOMATION GAP |
| TC-LEG-163 | Admin | Opened carton can be closed after boxes are packed | P1 | 1. Open legacy carton. 2. Pack at least one child box into it. 3. Click "Close Carton". | Carton status → CLOSED; CARTON_CLOSED transaction written. | E2E | Normal close flow. AUTOMATION GAP |
| TC-LEG-164 | Admin | Opened carton can be dispatched | P1 | 1. Open legacy carton → pack boxes → close carton. 2. Create a dispatch using this carton. | Dispatch created successfully; carton status → DISPATCHED. | Integration | Post-open carton is a normal trackable carton — no special dispatch handling. AUTOMATION GAP |

---

## Section 35.18 — Frontend E2E: LegacyUploadButton modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-170 | Admin | "Upload Existing Stock" button opens modal | P0 | 1. Login as Admin, navigate to `/inventory`. 2. Click "Upload Existing Stock". | Modal opens with title "Upload Existing Stock (Legacy CSV)"; description paragraph visible; "Download sample CSV" section visible; file picker visible; Upload & Create Cartons button disabled (no file selected). | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-171 | Admin | Sample download button in modal triggers authenticated fetch | P1 | 1. Open LegacyUploadButton modal. 2. Click "Download" button. | Browser downloads a file named `legacy_stock_upload_sample.csv`; download uses `fetch()` with `Authorization: Bearer <token>` header (not a plain anchor). | E2E | `handleDownloadSample`: uses `fetch` + `URL.createObjectURL`. AUTOMATION GAP |
| TC-LEG-172 | Admin | File picker accepts only .csv files | P1 | 1. Open modal. 2. Try to select a .xlsx file via file picker. | File picker filter (`accept=".csv"`) prevents .xlsx from being offered; if injected, the upload API returns 409. | Manual | `accept=".csv"` attribute on input. |
| TC-LEG-173 | Admin | Selecting CSV file enables Upload button and shows filename | P0 | 1. Open modal. 2. Select a valid CSV file. | "Upload & Create Cartons" button becomes enabled; file name displayed below the drag-drop area. | E2E | `{file && <p>{file.name}</p>}`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-174 | Admin | Successful upload shows result panel (replaces file picker) | P0 | 1. Open modal. 2. Select valid CSV (1 row, qty 3). 3. Click "Upload & Create Cartons". | File picker area disappears; green result card appears showing "3 legacy cartons created"; "1 row processed"; no warnings or errors sections. Toast shows "3 legacy cartons created". | E2E | `{result && ...}` replaces `{!result && ...}`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-175 | Admin | Result panel shows warnings section when warnings present | P1 | 1. Upload CSV with one row whose section is unknown. | Amber warnings panel appears in result view; shows `1 warning` heading; lists the warning text. | E2E | `{result.warnings.length > 0 && <div>...</div>}`. AUTOMATION GAP |
| TC-LEG-176 | Admin | Result panel shows errors section when errors present | P1 | 1. Upload CSV with one valid row (qty 1) and one error row (qty -1). | Green result card shows "1 legacy carton created". Red errors section shows "1 row failed"; error entry shows `Row 3` and the error message. Toast shows error count. | E2E | AUTOMATION GAP |
| TC-LEG-177 | Admin | "Upload Another File" resets modal to file picker | P0 | 1. Upload any file, see result panel. 2. Click "Upload Another File". | Result panel disappears; file picker reappears; Upload & Create Cartons button disabled; file input cleared. | E2E | Sets `result(null)`, `setFile(null)`, clears `fileRef`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-178 | Admin | "Close" button in result panel closes modal and resets state | P0 | 1. Upload file, see result. 2. Click "Close". | Modal closes; reopening shows fresh file picker (no stale result). | E2E | `closeModal()` sets `showModal(false)`, `setResult(null)`, `setFile(null)`. AUTOMATION GAP |
| TC-LEG-179 | Admin | Cancel button (pre-upload) closes modal | P1 | 1. Open modal, select file. 2. Click "Cancel". | Modal closes; no upload performed. | E2E | AUTOMATION GAP |
| TC-LEG-180 | Admin | Modal description mentions 20,000 carton cap | P2 | 1. Open modal. | Info text "Maximum 20,000 cartons per upload file." is visible. | E2E | Static text in modal. AUTOMATION GAP |

---

## Section 35.19 — Frontend E2E: Open for Repacking modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-190 | Admin | Clicking "Open for Repacking" opens confirmation modal | P0 | 1. Navigate to a legacy carton detail page as Admin. 2. Click "Open for Repacking". | Modal opens with title "Open for Repacking"; description text visible; amber info box shows the carton barcode and explains no child boxes auto-created. Cancel and "Open Carton" buttons present. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-191 | Admin | Cancel in confirmation modal closes without action | P0 | 1. Open confirmation modal. 2. Click "Cancel". | Modal closes; carton `is_legacy` remains `true`; amber banner still visible. | E2E | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-192 | Admin | Confirming "Open Carton" triggers POST open-legacy and shows success toast | P0 | 1. Open confirmation modal. 2. Click "Open Carton". | `POST /api/v1/master-cartons/<id>/open-legacy` called; success toast "Carton opened for repacking — now generate child-box labels and scan them in"; modal closes; page refreshes; amber banner gone; "Add Boxes" button appears. | E2E | `successMessage` from `useApiMutation`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-193 | Admin | "Open Carton" button shows loading state during request | P1 | 1. Open confirmation modal. 2. Click "Open Carton" on a slow network. | Button shows loading spinner (`isLoading={isOpeningLegacy}`); buttons disabled during inflight request. | E2E | AUTOMATION GAP |
| TC-LEG-194 | Admin | Open-legacy invalidates master-cartons and inventory-breakdown query caches | P1 | 1. Open legacy carton. | After success: master-carton list re-fetches (carton moves from legacy list to normal list); inventory drill-down data re-fetches (legacy count decremented). | E2E | `invalidateKeys: ['master-carton', 'master-cartons', 'inventory-breakdown', 'dashboard-stats']`. AUTOMATION GAP |

---

## Section 35.20 — Order-sensitive route: /legacy-upload/sample not shadowed by /:id

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-LEG-200 | Admin | GET /legacy-upload/sample resolved correctly before /:id | P0 | 1. `GET /api/v1/master-cartons/legacy-upload/sample` as Admin. | HTTP 200 with CSV content (not 404 "carton not found" for ID `legacy-upload`). | API | Route declared before `GET /:id`. AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-201 | Admin | POST /legacy-upload resolved correctly before /:id routes | P0 | 1. `POST /api/v1/master-cartons/legacy-upload` with valid CSV as Admin. | HTTP 201 with `LegacyUploadResult` body (not 404 for ID `legacy-upload`). | API | AUTOMATION GAP — `43-legacy-inventory.spec.ts` |
| TC-LEG-202 | Admin | GET /master-cartons/<real-uuid> still resolves correctly | P0 | 1. Create a normal master carton, note its `<uuid>`. 2. `GET /api/v1/master-cartons/<uuid>`. | HTTP 200 with carton data (not confused with legacy-upload routes). | API | Regression: confirms `/:id` still works after legacy route insertion. AUTOMATION GAP |

---

*Total: 89 test cases*

---

## Automation gap summary

No Playwright spec currently covers legacy inventory. Every TC in this file is marked **AUTOMATION GAP**.

**Recommended new spec:** `frontend/e2e/43-legacy-inventory.spec.ts`

**Coverage to implement in `43-legacy-inventory.spec.ts`:**

1. **API-mode (Playwright `request`):** all RBAC allow/deny assertions for `POST /legacy-upload` (4 roles + unauth), `GET /legacy-upload/sample` (4 roles + unauth), `POST /:id/open-legacy` (4 roles + unauth); whole-file validation errors (409); per-row validation; zero-qty skip; `rows_skipped_zero`; `warnings`; no `inventory_transactions` written; `LEGACY_CARTON_OPENED` transaction written on open; route order (TC-LEG-200 / 201 / 202).
2. **E2E browser:** `LegacyUploadButton` hidden for Dispatch Operator, visible for Admin/Supervisor/Warehouse Op; modal open → sample download → file select → upload → result panel (created / skipped / warnings / errors); "Upload Another File" reset; "Close" reset; `includeLegacy` checkbox on `/master-cartons` (off by default, toggle shows legacy badge, untoggle removes); legacy carton detail amber banner; "Open for Repacking" button present/absent by role; confirmation modal flow; post-open "Add Boxes" available.

---

## Per-role TC count

| Role | TCs |
|------|-----|
| Admin | 76 |
| Supervisor | 8 |
| Warehouse Operator | 8 |
| Dispatch Operator | 8 |
| Unauthenticated | 5 |
| **Total** | **89** (some TCs cover multiple roles in a single row; counted by primary role) |

> Note: Many Admin TCs implicitly validate behaviour that Supervisor / Warehouse Operator share (same `cartons:create` and `packing:unpack` paths). The three dedicated per-role positive TCs for Supervisor and Warehouse Operator (TC-LEG-015/016, TC-LEG-071/072, TC-LEG-124/125, TC-LEG-141/142) confirm they exercise the same code paths.

---

## Matrix discrepancies documented

1. **`GET /master-cartons` list is auth-only (no permission gate)** — all 4 roles including Dispatch Operator can list legacy cartons via `?includeLegacy=true`. Encoded as explicit TCs (TC-LEG-093 through 095). This is not a defect — document and test actual behaviour.
2. **`GET /master-cartons/:id` detail is auth-only** — all 4 roles can view any legacy carton detail by UUID (TC-LEG-116 documents the Dispatch Operator case). Encoded as explicit TC.
3. **`POST /legacy-upload` returns HTTP 201**, not 200 — encoded in TC-LEG-010 / TC-LEG-015 / TC-LEG-016. Controller explicitly passes `201` to `sendSuccess`.
4. **Sample CSV includes a zero-qty row** (qty = 0 for the Busker row) — this is intentional illustration, not a defect. TC-LEG-032 validates that uploading the sample file as-is produces the correct `rows_skipped_zero = 1` result.
5. **Legacy upload writes NO `inventory_transactions`** — the transaction audit trail for a legacy carton begins at `openLegacyCarton` (TC-LEG-081, TC-LEG-152). All inventory aggregation that counts legacy cartons operates on the `is_legacy = true` flag, not on transactions.
