# Phase 06 — Products: Bulk CSV Upload

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3 (refreshed 2026-06-09)
**Phase:** 06 of 33
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (test server)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (test server)
**Last updated:** 2026-06-09 — full refresh against current codebase

> **Scope of this phase:** `POST /products/bulk-upload` (CSV upload) and `GET /products/bulk-upload/sample` (sample CSV download) only.
> The size-range bulk-create endpoint (`POST /products/bulk-size-range`) was covered in **phase-05-products-crud.md** and is NOT repeated here.
> E2E tests reference `frontend/e2e/15-bulk-upload.spec.ts` and `frontend/e2e/39-product-csv-cap-and-batch.spec.ts`.

---

## Table of Contents

1. [Route order — static `/bulk-upload/sample` before `/:id`](#section-1-route-order--static-bulk-uploadsample-before-id)
2. [RBAC matrix for bulk-upload routes](#section-2-rbac-matrix-for-bulk-upload-routes)
3. [Sample CSV download (GET /products/bulk-upload/sample)](#section-3-sample-csv-download)
4. [Bulk upload — happy path (POST /products/bulk-upload)](#section-4-bulk-upload--happy-path)
5. [Casing normalisation in bulk path](#section-5-casing-normalisation-in-bulk-path)
6. [SKU serial assignment](#section-6-sku-serial-assignment)
7. [Per-row validation errors](#section-7-per-row-validation-errors)
8. [Duplicate detection (DB ANY() + intra-batch Set)](#section-8-duplicate-detection)
9. [Env-gated row cap (default 500 / live 2000)](#section-9-env-gated-row-cap)
10. [Chunk-failure degrade to per-row](#section-10-chunk-failure-degrade-to-per-row)
11. [Result report ordering](#section-11-result-report-ordering)
12. [Authentication — 401 on all routes](#section-12-authentication--401-on-all-routes)
13. [RBAC — 403 deny cases](#section-13-rbac--403-deny-cases)
14. [E2E — Bulk Import modal (frontend)](#section-14-e2e--bulk-import-modal)
15. [Audit log — single summary entry](#section-15-audit-log--single-summary-entry)

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `ADMIN_EMAIL` | `admin@binny.com` (or equivalent seeded admin) |
| `SUPERVISOR_EMAIL` | `supervisor@binny.com` |
| `WAREHOUSE_EMAIL` | `warehouse@binny.com` |
| `DISPATCH_EMAIL` | `dispatch@binny.com` |
| `VALID_HEADERS` | `article_code,article_name,colour,size,mrp,section,category` |
| `FULL_HEADERS` | `article_code,article_name,colour,size,mrp,section,category,location,description,article_group,hsn_code,size_from,size_to` |
| `VALID_CATEGORIES` | `Gents`, `Ladies`, `Boys`, `Girls` |
| `VALID_LOCATIONS` | `VKIA`, `MIA`, `F540` |
| `DEFAULT_CAP` | `500` (when `PRODUCT_CSV_MAX_ROWS` not set) |
| `LIVE_CAP` | `2000` (set via `PRODUCT_CSV_MAX_ROWS=2000` on live server) |

### Minimal valid 2-row CSV

```
article_code,article_name,colour,size,mrp,section,category
TST-001,Test Sandal,Black,8,499,Hawaii,Gents
TST-002,Test Sandal,White,6,399,PU,Ladies
```

---

## Section 1: Route order — static `/bulk-upload/sample` before `/:id`

> **Why:** Express matches routes in registration order. `GET /bulk-upload/sample` must be registered **before** `GET /:id`; otherwise Express interprets `"bulk-upload"` as the `:id` param and routes to `getProductById`. Verified in `product.routes.ts` lines 19–23 (sample) then lines 71–75 (`:id`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-001 | Admin | `/bulk-upload/sample` resolves to sample-CSV handler (not getProductById) | P0 | 1. Login as Admin. 2. `GET /api/v1/products/bulk-upload/sample` with valid JWT. | HTTP 200. `Content-Type` is `text/csv` (not JSON). Response body starts with a CSV header row, not a JSON product object. No `"Product not found"` error. | API | Realizing spec: `15-bulk-upload.spec.ts` `TC-BULK-001`. Route order guard: sample registered at line 19, `/:id` at line 71. |
| TC-PBULK-002 | Admin | `GET /products/bulk-upload` (without `/sample`) returns 404 or method-not-allowed | P1 | 1. Login as Admin. 2. `GET /api/v1/products/bulk-upload` (no `/sample` suffix). | HTTP 404 or 405. The server does NOT attempt to resolve `"bulk-upload"` as a product ID. | API | AUTOMATION GAP — no spec currently asserts the bare `/bulk-upload` path. |

---

## Section 2: RBAC matrix for bulk-upload routes

> Source of truth: `product.routes.ts` — `GET /bulk-upload/sample` requires `products:read`; `POST /bulk-upload` requires `products:create`. Seeded permissions from `001_roles.ts`:
>
> | Role | `products:read` | `products:create` |
> |---|:---:|:---:|
> | Admin | ✓ (super-admin bypass) | ✓ |
> | Supervisor | ✓ | ✓ |
> | Warehouse Operator | ✓ | ✗ |
> | Dispatch Operator | ✓ | ✗ |
>
> **Matrix discrepancy vs old file:** The previous version of this file (2026-04-30) incorrectly asserted that Warehouse Operator and Dispatch Operator could NOT access `GET /bulk-upload/sample` (returning 403). In reality both roles hold `products:read` and therefore receive **200** on the sample-CSV endpoint. The old 403 TCs (`TC-PROD-103`, `TC-PROD-104`) were wrong and are removed here.

---

## Section 3: Sample CSV download

### 3.1 — Authorised roles (all four roles hold `products:read`)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-010 | Admin | Admin downloads sample CSV — 200 + text/csv | P0 | 1. Login as Admin, capture JWT. 2. `GET /api/v1/products/bulk-upload/sample` with `Authorization: Bearer <JWT>`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition` header contains `filename=product_upload_sample.csv`. Body is non-empty UTF-8 text. | API | Realizing spec: `TC-BULK-001`. |
| TC-PBULK-011 | Supervisor | Supervisor downloads sample CSV — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 200. Same CSV content as TC-PBULK-010. | API | Realizing spec: `TC-BULK-001` (runs as Admin; Supervisor path is AUTOMATION GAP). |
| TC-PBULK-012 | Warehouse Operator | Warehouse Operator downloads sample CSV — 200 (has products:read) | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 200. Valid CSV. | API | AUTOMATION GAP — old file incorrectly expected 403; Warehouse Op holds `products:read`. |
| TC-PBULK-013 | Dispatch Operator | Dispatch Operator downloads sample CSV — 200 (has products:read) | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 200. Valid CSV. | API | AUTOMATION GAP — same correction as TC-PBULK-012. |

### 3.2 — CSV content validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-020 | Admin | Sample CSV contains all 13 expected columns | P0 | 1. Download sample as in TC-PBULK-010. 2. Parse the first line as CSV. | Header row contains exactly 13 columns: `article_code`, `article_name`, `colour`, `size`, `mrp`, `section`, `category`, `location`, `description`, `article_group`, `hsn_code`, `size_from`, `size_to`. No extra or missing columns. | API | Realizing spec: `TC-BULK-002`. Column order defined in `downloadSampleCsv`. |
| TC-PBULK-021 | Admin | Sample CSV contains at least 2 data rows | P1 | 1. Download sample. 2. Count non-header lines. | At least 2 data rows present. Each row has 13 comma-separated fields. Rows represent realistic product data (not all empty strings). | API | Controller hard-codes 3 sample rows. |
| TC-PBULK-022 | Admin | Sample CSV filename is `product_upload_sample.csv` | P1 | 1. Download sample. 2. Inspect `Content-Disposition` header. | Header: `attachment; filename=product_upload_sample.csv`. | API | `downloadSampleCsv` sets this header explicitly. |

---

## Section 4: Bulk upload — happy path

### 4.1 — Admin uploads valid CSV

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-030 | Admin | Admin uploads 2-row valid CSV — both rows created | P0 | 1. Login as Admin. 2. Build CSV with `FULL_HEADERS` + 2 unique rows (`TST-HAPPY-001`/`Black`/`8`/`Gents`/`Hawaii` and `TST-HAPPY-002`/`White`/`6`/`Ladies`/`PU`). 3. `POST /api/v1/products/bulk-upload` as `multipart/form-data` field `file`. | HTTP 201. Body: `{"success":true,"data":{"created":2,"errors":[]}}`. Both products exist in DB with correct field values. | API | Realizing spec: `TC-BULK-003`. Response code 201 per `sendSuccess(res, result, ..., 201)`. |
| TC-PBULK-031 | Admin | Upload accepts optional columns in any order | P1 | 1. Login as Admin. 2. CSV header order: `mrp,category,article_name,colour,size,section,article_code` (shuffled). One data row. 3. Upload. | HTTP 201. `created=1`. Column-order is irrelevant; service normalises header keys to lowercase. | API | `parse(buffer, {columns: true, trim: true})` then `row[key.toLowerCase().trim()]`. |
| TC-PBULK-032 | Admin | Upload with all 13 columns (including optional) persists optional fields | P1 | 1. Login as Admin. 2. CSV row includes `location=VKIA`, `description=Test desc`, `article_group=Premium`, `hsn_code=6402`, `size_from=6`, `size_to=10`. 3. Upload. | HTTP 201. `created=1`. Product in DB has `location='VKIA'`, `description='Test desc'`, `article_group='Premium'`, `hsn_code='6402'`, `size_from='6'`, `size_to='10'`. | API | AUTOMATION GAP — no existing spec verifies optional-column storage. |
| TC-PBULK-033 | Supervisor | Supervisor uploads valid 2-row CSV — both created | P1 | 1. Login as Supervisor. 2. Upload 2-row valid CSV with unique article codes. | HTTP 201. `created=2`, `errors=[]`. | API | Supervisor holds `products:create`; should succeed. Realizing spec: `TC-BULK-003` (admin only). |

### 4.2 — Multipart field name

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-034 | Admin | Upload using field name `file` succeeds | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-upload` with `multipart/form-data`, field name `file`, valid CSV content. | HTTP 201. Products created. | API | `csvUpload.single('file')` — field MUST be `file`. |
| TC-PBULK-035 | Admin | Upload using wrong field name returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-upload` with field name `csv` (not `file`). | HTTP 400. `{"success":false,"message":"No CSV file provided"}`. No products created. | API | Controller guard: `if (!file) { res.status(400).json(...) }`. AUTOMATION GAP. |

---

## Section 5: Casing normalisation in bulk path

> The service applies the same casing helpers used in the single-product path:
> - `article_name`, `colour`, `section`, `article_group` → **Title Case** via `toTitleCase()`.
> - `article_code` → **uppercase** via `.trim().toUpperCase()`.
> - `category` → **canonical casing** (case-insensitive lookup against `['Gents','Ladies','Boys','Girls']`).
> - `location` → **canonical casing** (case-insensitive lookup against `['VKIA','MIA','F540']`).
> - HTML tags in `article_name` and `description` are stripped by `stripHtml()`.
> - Case normalisation happens in Pass 1 (before SKU computation), so the SKU reflects the normalised values.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-040 | Admin | article_name in ALL CAPS → stored as Title Case | P0 | 1. Login as Admin. 2. CSV row: `article_name=ALIA PLUS`, other fields valid. 3. Upload. | HTTP 201. Product in DB: `article_name='Alia Plus'`. | API | `toTitleCase('ALIA PLUS') = 'Alia Plus'`. AUTOMATION GAP. |
| TC-PBULK-041 | Admin | article_name in all lowercase → stored as Title Case | P0 | 1. Login as Admin. 2. CSV row: `article_name=alia plus`, other fields valid. 3. Upload. | HTTP 201. Product in DB: `article_name='Alia Plus'`. | API | AUTOMATION GAP. |
| TC-PBULK-042 | Admin | colour in ALLCAPS → stored as Title Case | P1 | 1. Login as Admin. 2. CSV row: `colour=BLACK`. 3. Upload. | HTTP 201. Product in DB: `colour='Black'`. | API | `toTitleCase('BLACK') = 'Black'`. AUTOMATION GAP. |
| TC-PBULK-043 | Admin | section in lowercase → stored as Title Case | P1 | 1. Login as Admin. 2. CSV row: `section=hawaii`. 3. Upload. | HTTP 201. Product in DB: `section='Hawaii'`. | API | AUTOMATION GAP. |
| TC-PBULK-044 | Admin | article_code in lowercase → stored as uppercase | P0 | 1. Login as Admin. 2. CSV row: `article_code=art-001`. 3. Upload. | HTTP 201. Product in DB: `article_code='ART-001'`. | API | `.trim().toUpperCase()`. AUTOMATION GAP. |
| TC-PBULK-045 | Admin | category `ladies` (lowercase) → stored as canonical `Ladies`, no error | P0 | 1. Login as Admin. 2. CSV row: `category=ladies`. 3. Upload. | HTTP 201. `created=1`, `errors=[]`. Product in DB: `category='Ladies'`. | API | `canonicalCategory` does case-insensitive match and returns canonical value. AUTOMATION GAP. |
| TC-PBULK-046 | Admin | category `GENTS` (uppercase) → stored as canonical `Gents`, no error | P0 | 1. Login as Admin. 2. CSV row: `category=GENTS`. 3. Upload. | HTTP 201. `created=1`. Product in DB: `category='Gents'`. | API | AUTOMATION GAP. |
| TC-PBULK-047 | Admin | location `vkia` (lowercase) → stored as canonical `VKIA`, no error | P1 | 1. Login as Admin. 2. CSV row: `location=vkia`. 3. Upload. | HTTP 201. `created=1`. Product in DB: `location='VKIA'`. | API | `canonicalLocation` case-insensitive. AUTOMATION GAP. |
| TC-PBULK-048 | Admin | location `mia` → stored as `MIA` | P1 | 1. Login as Admin. 2. CSV row: `location=mia`. 3. Upload. | HTTP 201. Product in DB: `location='MIA'`. | API | AUTOMATION GAP. |
| TC-PBULK-049 | Admin | HTML in article_name is stripped, remainder Title-Cased | P1 | 1. Login as Admin. 2. CSV row: `article_name=<b>Alia</b> Plus`. 3. Upload. | HTTP 201. Product in DB: `article_name='Alia Plus'` (tags stripped, then Title-Cased). | API | `stripHtml` removes `<b>` tags. AUTOMATION GAP. |
| TC-PBULK-050 | Admin | article_group in lowercase → stored as Title Case | P1 | 1. Login as Admin. 2. CSV row: `article_group=summer`. 3. Upload. | HTTP 201. Product in DB: `article_group='Summer'`. | API | `toTitleCase` applied to article_group in Pass 1. AUTOMATION GAP. |
| TC-PBULK-051 | Admin | Normalised names affect SKU key — mixed-case inputs produce same SKU as canonical-case inputs | P0 | 1. Ensure no existing products for article `Test Sandal` / `Black` / `Gents` / `Hawaii`. 2. Upload CSV row with `article_name=TEST SANDAL`, `colour=BLACK`, `category=gents`, `section=hawaii`. 3. After upload, note the SKU. 4. Independently compute expected SKU: `HAWAII-TEST-SANDAL-GENTS-01-BLACK`. | HTTP 201. Stored SKU = `HAWAII-TEST-SANDAL-GENTS-01-BLACK`. Normalisation happens before SKU key derivation. | API | SKU key = `normSection-normArticle-normCategory-serial-normColour`; all normalised to uppercase with spaces→hyphens. AUTOMATION GAP. |

---

## Section 6: SKU serial assignment

> **Algorithm (Pass 2):** One `GROUP BY` query fetches existing count per `(normSection, normArticle, normCategory, normColour)` combo. A `running` Map tracks intra-batch usage. Serial = `(existing_count + running_offset) + 1`. SKU = `SECTION-ARTICLE-CATEGORY-NN-COLOUR` where `NN` is zero-padded to 2 digits.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-060 | Admin | First product in a combo gets serial 01 | P0 | 1. Ensure no products exist for `Hawaii / Test Article A / Gents / Red`. 2. Upload a single row: `article_name=Test Article A`, `colour=Red`, `category=Gents`, `section=Hawaii`. | HTTP 201. Product SKU = `HAWAII-TEST-ARTICLE-A-GENTS-01-RED`. | API | `serial = 0 (existing) + 1 = 1`; padded to `01`. AUTOMATION GAP. |
| TC-PBULK-061 | Admin | Subsequent product in same combo gets serial 02 | P1 | 1. Pre-condition: one product exists for `Hawaii / Test Article B / Gents / Blue` (serial 01). 2. Upload another row with the same combo (different size). | HTTP 201. New product SKU ends in `…-02-BLUE`. | API | `serial = 1 (existing) + 1 = 2`. AUTOMATION GAP. |
| TC-PBULK-062 | Admin | Multiple rows in same batch for same combo get consecutive serials | P0 | 1. Ensure combo `Hawaii / Batch Serial / Gents / Green` has 0 existing products. 2. Upload a 3-row CSV with the same `article_name=Batch Serial`, `colour=Green`, `section=Hawaii`, `category=Gents` but different sizes. | HTTP 201. `created=3`. SKUs are `HAWAII-BATCH-SERIAL-GENTS-01-GREEN`, `…-02-GREEN`, `…-03-GREEN`. No serial collision. | API | `running` Map increments within batch before DB write; prevents duplicate serial assignment. AUTOMATION GAP. |
| TC-PBULK-063 | Admin | Old-casing rows and new-casing rows for same combo share the same serial sequence | P0 | 1. Create a product via single-create with `article_name='Mixed Case'`, `colour='NAVY'`, `section='Hawaii'`, `category='Gents'` — service normalises to `Mixed Case`/`Navy`/`Hawaii`/`Gents`, SKU includes serial 01. 2. Upload a CSV row with `article_name=mixed case`, `colour=navy`, `section=HAWAII`, `category=GENTS`. | HTTP 201. New row's serial is 02 (increments from existing normalised combo). SKU = `HAWAII-MIXED-CASE-GENTS-02-NAVY`. | API | `GROUP BY` uses `UPPER(REPLACE(...))` so normalised keys match regardless of stored casing. AUTOMATION GAP. |
| TC-PBULK-064 | Admin | Distinct combos get independent serial sequences | P1 | 1. Upload 2-row CSV: row 1 is `Hawaii/Combo A/Gents/Red`, row 2 is `PU/Combo B/Ladies/Blue`. Both combos have 0 existing products. | HTTP 201. `created=2`. Row 1 SKU ends `…-01-RED`; Row 2 SKU ends `…-01-BLUE`. Serials are independent. | API | AUTOMATION GAP. |
| TC-PBULK-065 | Admin | Serial zero-padded to 2 digits up to 9; no zero-padding from 10 | P1 | 1. Pre-condition: 9 products exist for `Hawaii / Pad Test / Gents / Gold` (serials 01–09). 2. Upload one more row with the same combo. | HTTP 201. New product SKU = `HAWAII-PAD-TEST-GENTS-10-GOLD` (no leading zero at 10). | API | `String(10).padStart(2,'0') = '10'`. AUTOMATION GAP. |

---

## Section 7: Per-row validation errors

> Validation happens in **Pass 1** (memory only, no DB). Invalid rows are pushed to `errors[]` with `{row, status:'error', article_name, error}` and the loop continues. Remaining valid rows are processed normally. The whole upload returns HTTP 201 even when some rows fail.
>
> `rowNum = i + 2` (1-indexed; row 1 = header, data starts at row 2).

### 7.1 — Required-column missing (structural — whole request rejected)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-070 | Admin | CSV missing `article_code` column → 409 (whole file rejected) | P0 | 1. Login as Admin. 2. CSV header: `article_name,colour,size,mrp,section,category` (no `article_code`). 3. Upload. | HTTP 409. `{"success":false,"message":"Missing required columns: article_code. Download the sample file for reference."}`. No products created. | API | Realizing spec: `TC-BULK-004`. Missing-column check runs before row processing; throws `ConflictError` → 409. |
| TC-PBULK-071 | Admin | CSV missing `article_name` column → 409 | P0 | 1. Login as Admin. 2. CSV header omits `article_name`. 3. Upload. | HTTP 409. Error message references `article_name`. | API | Same structural check. |
| TC-PBULK-072 | Admin | CSV missing multiple required columns → 409 listing all missing | P0 | 1. Login as Admin. 2. CSV has only `article_code,colour` columns. 3. Upload. | HTTP 409. Error message lists all 5 missing columns: `article_name, size, mrp, section, category` (in the order they appear in `requiredCols`). | API | `missingCols.join(', ')`. AUTOMATION GAP. |
| TC-PBULK-073 | Admin | CSV with only header row, no data → 409 "CSV file is empty" | P0 | 1. Login as Admin. 2. CSV = header line only, no data rows. 3. Upload. | HTTP 409. `message` contains `"CSV file is empty. Please add product rows below the header."`. | API | Realizing spec: `TC-BULK-005`. `records.length === 0` check before column check. |
| TC-PBULK-074 | Admin | Completely empty file (no header) → 409 invalid CSV | P1 | 1. Login as Admin. 2. Upload an empty `.csv` file (0 bytes). | HTTP 409. `message` contains `"Invalid CSV format"` or similar parse error. | API | `csv-parse` throws; caught and re-thrown as `ConflictError`. AUTOMATION GAP. |

### 7.2 — Per-row required-field errors (row continues to errors[]; valid rows still processed)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-080 | Admin | Row with blank `article_code` → row error; other rows created | P1 | 1. Login as Admin. 2. 3-row CSV: row 2 has `article_code=` (empty). Rows 1, 3 are valid. 3. Upload. | HTTP 201. `created=2`. `errors` has 1 entry: `{row:3, status:'error', error:'article_code is empty'}`. Rows 1, 3 in DB. | API | `rowNum = i+2`; 0-indexed row 1 (second data row) = rowNum 3. AUTOMATION GAP. |
| TC-PBULK-081 | Admin | Row with blank `article_name` → row error | P1 | 1. Login as Admin. 2. Row has `article_name=` (empty). 3. Upload alongside 1 valid row. | HTTP 201. `created=1`. Error entry for the blank-name row: `error:'article_name is empty'`. | API | AUTOMATION GAP. |
| TC-PBULK-082 | Admin | Row with blank `colour` → row error | P1 | 1. Login as Admin. 2. Row with `colour=`. 3. Upload. | HTTP 201. `errors` has entry `error:'colour is empty'`. | API | AUTOMATION GAP. |
| TC-PBULK-083 | Admin | Row with blank `size` → row error | P1 | 1. Login as Admin. 2. Row with `size=`. 3. Upload. | HTTP 201. Row error: `error:'size is empty'`. | API | AUTOMATION GAP. |
| TC-PBULK-084 | Admin | Row with blank `section` → row error | P1 | 1. Login as Admin. 2. Row with `section=`. 3. Upload. | HTTP 201. Row error: `error:'section is empty'`. | API | AUTOMATION GAP. |
| TC-PBULK-085 | Admin | Row with blank `category` → row error | P1 | 1. Login as Admin. 2. Row with `category=`. 3. Upload. | HTTP 201. Row error: `error:'category is empty'`. | API | AUTOMATION GAP. |
| TC-PBULK-086 | Admin | Row with multiple blank required fields → single error entry containing all messages | P1 | 1. Login as Admin. 2. Row with `article_code=` AND `colour=` (two blanks). 3. Upload. | HTTP 201. One `errors` entry for that row. `error` field contains both messages: `'article_code is empty; colour is empty'`. | API | `rowErrors.join('; ')`. AUTOMATION GAP. |

### 7.3 — MRP validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-090 | Admin | Row with non-numeric MRP → row error; other rows created | P1 | 1. Login as Admin. 2. 2-row CSV: row 1 valid, row 2 has `mrp=abc`. 3. Upload. | HTTP 201. `created=1`. `errors[0]`: `{row:3, error:'mrp must be a positive number'}`. | API | Realizing spec: `TC-BULK-007`. |
| TC-PBULK-091 | Admin | Row with negative MRP → row error | P1 | 1. Login as Admin. 2. Row with `mrp=-100`. 3. Upload alongside 1 valid row. | HTTP 201. `created=1`. Error: `'mrp must be a positive number'`. | API | Realizing spec: `TC-BULK-007`. `mrp <= 0` check. |
| TC-PBULK-092 | Admin | Row with zero MRP → row error | P1 | 1. Login as Admin. 2. Row with `mrp=0`. 3. Upload. | HTTP 201. Error: `'mrp must be a positive number'`. | API | `mrp <= 0`. AUTOMATION GAP. |
| TC-PBULK-093 | Admin | Row with blank MRP → row error | P1 | 1. Login as Admin. 2. Row with `mrp=` (empty). 3. Upload. | HTTP 201. Error: `'mrp must be a positive number'`. | API | `!row.mrp?.trim()` branch. AUTOMATION GAP. |
| TC-PBULK-094 | Admin | Row with decimal MRP → accepted | P1 | 1. Login as Admin. 2. Row with `mrp=99.5`. 3. Upload. | HTTP 201. `created=1`. `errors=[]`. Product MRP stored as `99.5`. | API | `parseFloat('99.5')` = 99.5 > 0; valid. AUTOMATION GAP. |

### 7.4 — Category and location validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-100 | Admin | Row with invalid category → row error; other rows created | P0 | 1. Login as Admin. 2. 2-row CSV: row 1 valid (`category=Gents`); row 2 has `category=Toddler`. 3. Upload. | HTTP 201. `created=1`. `errors[0]`: `{row:3, error:'category must be one of: Gents, Ladies, Boys, Girls'}`. | API | Realizing spec: `TC-BULK-006`. |
| TC-PBULK-101 | Admin | Row with valid category in any case → normalised and accepted (no row error) | P0 | 1. Login as Admin. 2. Rows with `category=gents`, `category=LADIES`, `category=Boys`. All other fields valid, unique article codes. 3. Upload. | HTTP 201. `created=3`. `errors=[]`. All rows stored with canonical casing: `Gents`, `Ladies`, `Boys`. | API | AUTOMATION GAP. |
| TC-PBULK-102 | Admin | Row with invalid location → row error; row with valid location accepted | P1 | 1. Login as Admin. 2. Row 1: `location=JAIPUR` (invalid). Row 2: `location=VKIA` (valid). Both other fields unique. 3. Upload. | HTTP 201. `created=1`. `errors[0]`: `{row:2, error:'location must be one of: VKIA, MIA, F540'}`. Row 2 created with `location='VKIA'`. | API | AUTOMATION GAP. |
| TC-PBULK-103 | Admin | Row with blank location → location stored as NULL (optional field) | P1 | 1. Login as Admin. 2. Row with `location=` (empty string in optional column). 3. Upload. | HTTP 201. `created=1`. Product in DB has `location=NULL`. | API | `canonicalLocation` only called if `row.location?.trim()` is truthy; blank skips validation, stores null. AUTOMATION GAP. |

### 7.5 — article_code length constraint

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-110 | Admin | article_code exceeding 20 characters → row error | P1 | 1. Login as Admin. 2. Row with `article_code=ABCDEFGHIJKLMNOPQRSTU` (21 chars). 3. Upload alongside 1 valid row. | HTTP 201. `created=1`. Error: `'article_code exceeds 20 characters'` for the long-code row. | API | `row.article_code.trim().length > 20` check in Pass 1. AUTOMATION GAP. |
| TC-PBULK-111 | Admin | article_code of exactly 20 characters → accepted | P1 | 1. Login as Admin. 2. Row with `article_code=ABCDEFGHIJKLMNOPQRST` (20 chars). 3. Upload. | HTTP 201. `created=1`. `errors=[]`. | API | Boundary: 20 is inclusive. AUTOMATION GAP. |

---

## Section 8: Duplicate detection

> **Pass 3 algorithm:** One `SELECT sku FROM products WHERE sku = ANY($1::text[])` fetches all existing SKUs matching any candidate. An intra-batch `Set<string>` (`seenInBatch`) catches within-batch duplicates. Both lead to per-row errors with `Duplicate SKU: <sku> already exists`.

### 8.1 — DB-level duplicate (SKU already in products table)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-120 | Admin | Upload row whose computed SKU matches an existing product → row error, others created | P0 | 1. Pre-condition: product `Hawaii / Dup Test / Gents / Red / size 8` exists (SKU `HAWAII-DUP-TEST-GENTS-01-RED`). 2. Upload 2-row CSV: row 1 is `article_name=Dup Test`, `colour=Red`, `section=Hawaii`, `category=Gents`, `size=8` (same combo → same SKU). Row 2 is a new unique combo. 3. Upload. | HTTP 201. `created=1`. `errors[0]`: `{status:'error', sku:'HAWAII-DUP-TEST-GENTS-01-RED', error:'Duplicate SKU: HAWAII-DUP-TEST-GENTS-01-RED already exists'}`. Row 2 created. | API | `ANY()` check after serial assignment. AUTOMATION GAP. |
| TC-PBULK-121 | Admin | Multiple rows in same upload all duplicating DB → all rows reported as errors | P1 | 1. Pre-condition: 2 existing products with known SKUs A and B. 2. Upload 2-row CSV whose computed SKUs are A and B. | HTTP 201. `created=0`. `errors` has 2 entries, one per row. | API | AUTOMATION GAP. |

### 8.2 — Intra-batch duplicate (same SKU appears twice in the same CSV)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-130 | Admin | Two rows in the same CSV produce the same SKU → second row reported as duplicate | P0 | 1. Ensure combo `Hawaii / Intra Dup / Gents / Blue` has 0 existing products. 2. Upload 2-row CSV: both rows have same `article_name=Intra Dup`, `colour=Blue`, `section=Hawaii`, `category=Gents`, same effective size (so same SKU). | HTTP 201. `created=1`. `errors[0]` for the second row: `error:'Duplicate SKU: … already exists'`. First row created. | API | `seenInBatch` Set catches the collision. AUTOMATION GAP. |
| TC-PBULK-131 | Admin | Same combo, different sizes → different SKU serials → no intra-batch collision | P0 | 1. Ensure combo `Hawaii / Multi Size / Gents / Yellow` has 0 existing products. 2. Upload 3-row CSV: same name/colour/section/category but sizes 6, 7, 8. | HTTP 201. `created=3`. `errors=[]`. SKUs are `…-01-…`, `…-02-…`, `…-03-…` respectively (different serials because `running` increments per combo). | API | Different serial → different SKU → no collision. AUTOMATION GAP. |

### 8.3 — Mixed CSV (some new, some duplicates)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-132 | Admin | 5-row CSV with 2 DB dups and 3 new rows → 3 created, 2 errors | P1 | 1. Pre-condition: SKUs X and Y exist in DB. 2. Upload 5-row CSV: rows 1, 3 compute to X and Y; rows 2, 4, 5 are new unique combos. | HTTP 201. `created=3`. `errors` has 2 entries (rows 1, 3 with dup messages). | API | AUTOMATION GAP. |

---

## Section 9: Env-gated row cap

> Backend: `const maxRows = Number(process.env.PRODUCT_CSV_MAX_ROWS) || 500`. Checked after `records.length === 0` check, before column check.
> Frontend: `const MAX_CSV_ROWS = Number(process.env.NEXT_PUBLIC_PRODUCT_CSV_MAX) || 500`. Used in modal display copy only (does not block the `fetch` call).
> Error type: `ConflictError` → HTTP **409**.

### 9.1 — Default cap (500)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-140 | Admin | 501-row CSV rejected with cap error | P0 | 1. Backend with no `PRODUCT_CSV_MAX_ROWS` set (default 500). 2. Login as Admin. 3. Upload CSV with 501 data rows. | HTTP 409. `message`: `"CSV contains 501 rows. Maximum allowed is 500 per upload."`. No products created. | API | Realizing spec: `TC-PCAP-OVER-001`. Error message template: `` `CSV contains ${records.length} rows. Maximum allowed is ${maxRows} per upload.` `` |
| TC-PBULK-141 | Admin | Cap error message includes actual row count and maximum (500) | P0 | 1. Upload 502-row CSV. | HTTP 409. `message` contains `"502"` AND `"500"`. | API | Realizing spec: `TC-PCAP-OVER-002`. |
| TC-PBULK-142 | Admin | 500-row CSV accepted (boundary is inclusive) | P0 | 1. Upload exactly 500-row CSV (unique codes). | HTTP 201. `created=500`. `errors=[]`. | API | Realizing spec: `TC-PCAP-OVER-003`. `records.length > maxRows` (strict greater-than) → 500 passes. Timeout: 60 s. |
| TC-PBULK-143 | Admin | 499-row CSV accepted (below cap) | P1 | 1. Upload 499-row CSV. | HTTP 201. `created=499`. `errors=[]`. | API | AUTOMATION GAP. |

### 9.2 — Env-gated raised cap (2000 on live server)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-150 | Admin | With `PRODUCT_CSV_MAX_ROWS=2000`, 501-row CSV succeeds | P1 | 1. Set `PRODUCT_CSV_MAX_ROWS=2000`. Restart backend. 2. Upload 501-row CSV. | HTTP 201. `created=501`. No cap error. | API | Live env setting; `maxRows` becomes 2000. AUTOMATION GAP. |
| TC-PBULK-151 | Admin | With `PRODUCT_CSV_MAX_ROWS=2000`, 2000-row CSV accepted (boundary) | P1 | 1. `PRODUCT_CSV_MAX_ROWS=2000`. 2. Upload 2000-row CSV. | HTTP 201. `created=2000` (or `created + errors = 2000`). No cap error. | API | Boundary at 2000. AUTOMATION GAP. |
| TC-PBULK-152 | Admin | With `PRODUCT_CSV_MAX_ROWS=2000`, 2001-row CSV rejected | P1 | 1. `PRODUCT_CSV_MAX_ROWS=2000`. 2. Upload 2001-row CSV. | HTTP 409. `message` contains `"2001"` AND `"2000"`. | API | AUTOMATION GAP. |

### 9.3 — Frontend cap enforcement

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-160 | Admin | Bulk Import modal displays correct cap count from `NEXT_PUBLIC_PRODUCT_CSV_MAX` | P1 | 1. Frontend built with default `NEXT_PUBLIC_PRODUCT_CSV_MAX` unset (defaults to 500). 2. Login as Admin. 3. Navigate to `/products`. 4. Click "Bulk Import". 5. Read the modal text. | Modal copy reads `"Maximum 500 rows per upload"`. | E2E | `MAX_CSV_ROWS = Number(process.env.NEXT_PUBLIC_PRODUCT_CSV_MAX) \|\| 500`. Frontend shows the cap in UI text; does NOT block file selection or submission. AUTOMATION GAP — no existing spec checks the modal copy value. |

---

## Section 10: Chunk-failure degrade to per-row

> **Pass 4:** Rows are split into chunks of 500 (`CHUNK=500`). Each chunk is `INSERT … VALUES (…),(…),…` inside a `BEGIN/COMMIT`. On chunk-level failure (e.g. unexpected DB constraint not caught in Pass 1/3) the client does `ROLLBACK`, then falls back to **individual per-row** `INSERT` statements. Rows that succeed in the per-row fallback are counted in `created`; rows that fail get an error entry with the DB error message.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-170 | Admin | 35-row valid CSV succeeds via single batch | P1 | 1. `PRODUCT_CSV_MAX_ROWS=2000`. 2. Login as Admin. 3. Upload 35-row valid CSV (35 < CHUNK=500 → single batch). | HTTP 201. `created=35`. `errors=[]`. | API | Realizing spec: `TC-PCAP-BATCH-001`. |
| TC-PBULK-171 | Admin | 50-row valid CSV succeeds via single batch | P1 | 1. Same as TC-PBULK-170 but 50 rows. | HTTP 201. `created=50`. `errors=[]`. | API | Realizing spec: `TC-PCAP-BATCH-002`. |
| TC-PBULK-172 | Admin | 600-row valid CSV creates all 600 (spans 2 chunks: 500 + 100) | P1 | 1. `PRODUCT_CSV_MAX_ROWS=2000`. 2. Upload 600 unique valid rows. | HTTP 201. `created=600`. `errors=[]`. Two chunk transactions committed. | Integration | AUTOMATION GAP — no existing spec exercises the 2-chunk path. |
| TC-PBULK-173 | Admin | Chunk failure degrades: 3 rows in chunk, one causes DB error after Pass-3 — other 2 still created | P1 | 1. Login as Admin. 2. Construct a 3-row CSV where Pass-1 and Pass-3 validations all pass, but row 2 would violate a DB-level constraint not visible to the service (simulate by injecting a conflicting INSERT before the bulk request, so Pass-3 `ANY()` misses it due to timing). 3. Upload. | HTTP 201. `created=2` (rows 1, 3). `errors[0]` for row 2 contains the DB error message. | Integration | Chunk `ROLLBACK` triggers per-row fallback; rows 1 and 3 succeed individually. Requires controlled DB state. AUTOMATION GAP. |

---

## Section 11: Result report ordering

> **Pass 5:** `errors.sort((a, b) => a.row - b.row)`. Even if rows were processed out of order (per-row fallback), the error report is sorted ascending by row number.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-180 | Admin | Error entries in response are sorted ascending by row number | P0 | 1. Upload a 5-row CSV where rows 3 and 1 (in that order of processing) have errors (row 1 has bad category; row 3 has bad MRP). Rows 2, 4, 5 are valid. | HTTP 201. `errors[0].row = 2` (row 1 is header; first data row = row 2), `errors[1].row = 4` (third data row = row 4). `created=3`. | API | `errors.sort((a,b) => a.row - b.row)`. Row numbers are header-offset by +2 so data row 0 = row 2. AUTOMATION GAP. |
| TC-PBULK-181 | Admin | Successful rows in `created` count even when error rows exist | P0 | 1. Upload 5-row CSV with 2 invalid rows and 3 valid rows. | HTTP 201. `data.created = 3`. `data.errors.length = 2`. | API | AUTOMATION GAP. |

---

## Section 12: Authentication — 401 on all routes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-190 | Unauthenticated | GET sample CSV without JWT → 401 | P0 | 1. `GET /api/v1/products/bulk-upload/sample` with no `Authorization` header. | HTTP 401. `{"success":false,"message":"Authentication required"}` (or equivalent). No CSV returned. | API | `authenticate` middleware runs before `authorizePermission`. |
| TC-PBULK-191 | Unauthenticated | POST bulk-upload without JWT → 401 | P0 | 1. `POST /api/v1/products/bulk-upload` with valid CSV multipart but no `Authorization` header. | HTTP 401. No products created. | API | |
| TC-PBULK-192 | Unauthenticated | POST bulk-upload with expired JWT → 401 | P1 | 1. Obtain a JWT. 2. Advance system clock or wait for token expiry (3600 s). 3. `POST /api/v1/products/bulk-upload` with expired token. | HTTP 401. `"jwt expired"` or similar. No products created. | API | Token expiry = 3600 s. AUTOMATION GAP. |
| TC-PBULK-193 | Unauthenticated | GET sample CSV with malformed JWT → 401 | P1 | 1. `GET /api/v1/products/bulk-upload/sample` with `Authorization: Bearer not-a-real-token`. | HTTP 401. | API | AUTOMATION GAP. |

---

## Section 13: RBAC — 403 deny cases

> `POST /bulk-upload` requires `products:create`. From `001_roles.ts`: Warehouse Operator and Dispatch Operator do NOT hold `products:create`. Admin bypasses via role name check. Supervisor holds `products:create`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-200 | Warehouse Operator | Warehouse Operator cannot POST bulk-upload → 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/products/bulk-upload` with valid 2-row CSV. | HTTP 403. `{"success":false,"message":"Required permission: products:create"}`. No products created. | API | Warehouse Op lacks `products:create`. |
| TC-PBULK-201 | Dispatch Operator | Dispatch Operator cannot POST bulk-upload → 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/products/bulk-upload` with valid 2-row CSV. | HTTP 403. No products created. | API | |

---

## Section 14: E2E — Bulk Import modal

> Realizing specs: `15-bulk-upload.spec.ts` (UI + API), `39-product-csv-cap-and-batch.spec.ts` (cap + batch API).

### 14.1 — Modal access and UI elements

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-210 | Admin | "Bulk Import" button visible on `/products` for Admin | P0 | 1. Login as Admin. 2. Navigate to `/products`. | "Bulk Import" button (Upload icon) is visible in the page header action area. | E2E | Realizing spec: `TC-BULK-008`. Guard: `canCreate` (derived from `products:create`). |
| TC-PBULK-211 | Supervisor | "Bulk Import" button visible for Supervisor | P1 | 1. Login as Supervisor. 2. Navigate to `/products`. | "Bulk Import" button visible. | E2E | Supervisor holds `products:create`. AUTOMATION GAP — `15-bulk-upload.spec.ts` uses Admin only. |
| TC-PBULK-212 | Warehouse Operator | "Bulk Import" button NOT visible for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/products`. | No "Bulk Import" button visible. Page displays the product table (read-only). | E2E | `canCreate = false` for Warehouse Op. AUTOMATION GAP. |
| TC-PBULK-213 | Dispatch Operator | "Bulk Import" button NOT visible for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/products`. | No "Bulk Import" button visible. | E2E | AUTOMATION GAP. |
| TC-PBULK-214 | Admin | Clicking "Bulk Import" opens modal with expected elements | P0 | 1. Login as Admin. Navigate to `/products`. 2. Click "Bulk Import". | Modal opens with title "Bulk Import Products". Contains: (a) "Download sample CSV" card with "Download" button; (b) required-columns info text; (c) maximum-rows text showing 500; (d) file `input[accept=".csv"]`; (e) "Upload & Create Products" button (initially disabled); (f) "Cancel" button. | E2E | Realizing spec: `TC-BULK-008`. |
| TC-PBULK-215 | Admin | File input accepts only `.csv` files | P1 | 1. Open Bulk Import modal. 2. Inspect the `<input type="file">` element. | Input has `accept=".csv"`. Browser file picker filters to `.csv` files. | E2E | `accept=".csv"` attribute set in modal JSX. AUTOMATION GAP. |

### 14.2 — Sample download from modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-220 | Admin | Clicking "Download" in modal triggers authenticated fetch of sample CSV | P0 | 1. Open Bulk Import modal as Admin. 2. Click "Download" button. | Browser downloads a file named `product_upload_sample.csv`. File is valid CSV with 13-column header. | E2E | `handleDownloadSample` uses `fetch(url, {headers: {Authorization: Bearer token}})` then `URL.createObjectURL`. AUTOMATION GAP — `TC-BULK-008` does not click Download. |

### 14.3 — File selection and upload flow

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-230 | Admin | Attaching a CSV file shows filename in modal | P1 | 1. Open Bulk Import modal. 2. Attach a valid CSV file `test_products.csv`. | Filename `test_products.csv` appears below the drop zone. "Upload & Create Products" button becomes enabled. | E2E | `{bulkFile && <p className="mt-2 text-sm">{bulkFile.name}</p>}`. AUTOMATION GAP. |
| TC-PBULK-231 | Admin | Upload valid CSV — success banner shows created count | P0 | 1. Open Bulk Import modal. 2. Attach a 2-row valid CSV. 3. Click "Upload & Create Products". | `POST /api/v1/products/bulk-upload` called. Results panel replaces file input: green banner "2 products created successfully". Product table refreshes (new rows visible). Toast: "2 products created successfully". | E2E | Realizing spec: `TC-BULK-003` (API only). E2E part is AUTOMATION GAP. |
| TC-PBULK-232 | Admin | Upload CSV with row errors — error panel lists row numbers and messages | P1 | 1. Open modal. 2. Attach CSV with 1 valid row and 1 row with `category=Invalid`. 3. Click Upload. | Results panel shows: "1 products created successfully" (green). Error section: "1 rows failed", row 3, error message referencing category. Valid row in product table. | E2E | Realizing spec: `TC-BULK-006`. UI: `bulkResult.errors.map(err => Row {err.row}: {err.error})`. AUTOMATION GAP at UI level. |
| TC-PBULK-233 | Admin | After results shown, "Upload Another File" resets state | P1 | 1. Complete a successful upload (results panel visible). 2. Click "Upload Another File" button. | Results panel disappears. File input and "Upload & Create Products" button reappear. `bulkResult` state reset to null. `bulkFile` cleared. | E2E | `setBulkResult(null); setBulkFile(null); bulkFileRef.current.value = ''`. AUTOMATION GAP. |
| TC-PBULK-234 | Admin | "Cancel" button closes modal and resets state | P1 | 1. Open modal, attach a file. 2. Click "Cancel". | Modal closes. No upload triggered. If reopened, modal is in initial empty state. | E2E | `closeBulkModal` clears `bulkFile`, `bulkResult`, resets file ref. AUTOMATION GAP. |
| TC-PBULK-235 | Admin | Upload & Create button disabled when no file selected | P1 | 1. Open modal. 2. Do not attach a file. 3. Observe the "Upload & Create Products" button state. | Button is disabled (`disabled={!bulkFile \|\| bulkUploading}`). Clicking it has no effect. | E2E | AUTOMATION GAP. |

### 14.4 — Blocked access (no Bulk Import modal reachable)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-240 | Warehouse Operator | Warehouse Operator visiting `/products` sees "Access Denied" panel | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/products`. | The page renders an "Access Denied" message (Tag icon, heading "Access Denied", text "Only administrators and supervisors can manage products."). No product table, no Bulk Import button. | E2E | `if (!isManager) return <AccessDeniedPanel>`. `isManager = useAuth().isManager` which checks role. AUTOMATION GAP. |
| TC-PBULK-241 | Dispatch Operator | Dispatch Operator visiting `/products` sees "Access Denied" panel | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/products`. | Same "Access Denied" panel as TC-PBULK-240. | E2E | AUTOMATION GAP. |

---

## Section 15: Audit log — single summary entry

> **Pass 5:** After all inserts, one `createAuditLog` call with `action='BULK_UPLOAD_PRODUCTS'`, `entityType='product'`, `newValues={created, errors: errors.length, source:'csv_bulk_upload'}`. This is ONE entry per upload (not N entries for N rows), which differs from single-product creation (one audit per product).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PBULK-250 | Admin | Bulk upload produces exactly one audit log entry (not one per row) | P0 | 1. Login as Admin. 2. Upload 5-row valid CSV. 3. Query `audit_logs WHERE action = 'BULK_UPLOAD_PRODUCTS' ORDER BY created_at DESC LIMIT 1`. | One audit log entry: `action='BULK_UPLOAD_PRODUCTS'`, `entity_type='product'`, `new_values.created=5`, `new_values.errors=0`, `new_values.source='csv_bulk_upload'`. No `entity_id` (summary, not product-specific). | Integration | Not 5 individual `CREATE_PRODUCT` entries. AUTOMATION GAP. |
| TC-PBULK-251 | Admin | Audit log entry captures error count when some rows fail | P1 | 1. Upload 5-row CSV with 2 invalid rows. 2. Query latest `BULK_UPLOAD_PRODUCTS` audit log. | `new_values.created=3`, `new_values.errors=2`. | Integration | AUTOMATION GAP. |

---

## Automation gap summary

| Gap ID | Affected TCs | Recommended new spec / location |
|---|---|---|
| GAP-PBULK-01 | TC-PBULK-002 | Add `TC-BULK-009` in `15-bulk-upload.spec.ts`: assert `GET /products/bulk-upload` returns non-2xx |
| GAP-PBULK-02 | TC-PBULK-011–013 | Extend `TC-BULK-001` in `15-bulk-upload.spec.ts` to run for all 4 roles including Warehouse Op and Dispatch Op (expected 200) |
| GAP-PBULK-03 | TC-PBULK-032 | Add `TC-BULK-010` in `15-bulk-upload.spec.ts`: upload row with optional fields; verify DB storage |
| GAP-PBULK-04 | TC-PBULK-035 | Add `TC-BULK-011`: POST with wrong field name (`csv`) → 400 |
| GAP-PBULK-05 | TC-PBULK-040–051 | New spec `40-product-csv-casing.spec.ts`: casing normalisation assertions (upload with mixed-case inputs, verify DB values) |
| GAP-PBULK-06 | TC-PBULK-060–065 | Add to `39-product-csv-cap-and-batch.spec.ts`: SKU serial tests for same combo, cross-combo, intra-batch sequence |
| GAP-PBULK-07 | TC-PBULK-072–074, TC-PBULK-080–086, TC-PBULK-092–094, TC-PBULK-103, TC-PBULK-110–111 | Extend `15-bulk-upload.spec.ts` with per-row error variant tests |
| GAP-PBULK-08 | TC-PBULK-120–132 | New spec `41-product-csv-dedup.spec.ts`: DB-level and intra-batch duplicate detection |
| GAP-PBULK-09 | TC-PBULK-150–152, TC-PBULK-172–173 | Extend `39-product-csv-cap-and-batch.spec.ts` with env-override cap tests (require backend restart or env injection) |
| GAP-PBULK-10 | TC-PBULK-180–181 | Add error-sort assertion to `15-bulk-upload.spec.ts` |
| GAP-PBULK-11 | TC-PBULK-192–193 | Extend `16-rbac-auth.spec.ts` with expired/malformed JWT on bulk-upload |
| GAP-PBULK-12 | TC-PBULK-211–213, TC-PBULK-215, TC-PBULK-220, TC-PBULK-230–235, TC-PBULK-240–241 | New E2E spec `42-product-bulk-modal.spec.ts`: full UI flow for all roles |
| GAP-PBULK-13 | TC-PBULK-250–251 | Extend backend integration suite: audit log assertion after bulk upload |
