# Phase 08 — Child Box: Bulk Operations

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3
**Phase:** 08 of 20
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (portal)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (portal)
**Last updated:** 2026-04-30

---

## Context — all bulk endpoints produce GENERATED boxes (Apr 27 mod)

`POST /child-boxes/bulk`, `POST /child-boxes/bulk-multi-size`, and `POST /child-boxes/bulk-upload` all insert boxes with `status = 'GENERATED'`. Tests that previously expected `"FREE"` are now updated to expect `"GENERATED"`.

The `POST /child-boxes/bulk-upload` CSV uploader (Apr 27 mod) has the following caps enforced server-side before any inserts:
- 1 000 rows maximum per CSV file.
- 5 000 total boxes across all rows (sum of `count` column).
- Per-row: `count` max 500, `quantity` max 10 000 (defaults to 1).

Route registration: `GET /child-boxes/bulk-upload/sample` and `POST /child-boxes/bulk-upload` are registered **before** `/:id` routes so they are not shadowed by the param matcher.

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `PRODUCT_UUID_A` | Active product — `sku = HAWAII-BUSKER-GENTS-01-WHITE`, size 6 |
| `PRODUCT_UUID_B` | Active product — same article, colour White, size 7 |
| `PRODUCT_UUID_C` | Active product — same article, colour White, size 8 |
| `INACTIVE_PRODUCT_UUID` | Active product deactivated in Phase 05 |
| `SKU_A` | The `sku` of `PRODUCT_UUID_A` — used in CSV rows |
| `SKU_B` | The `sku` of `PRODUCT_UUID_B` |

### Sample bulk-upload CSV (4 data rows)

```
sku,quantity,count
HAWAII-BUSKER-GENTS-01-WHITE,1,3
HAWAII-BUSKER-GENTS-01-WHITE-SIZE7,1,2
HAWAII-BUSKER-GENTS-01-WHITE-SIZE8,1,1
```

*(Replace SKU values with real SKUs from Phase 05 setup before running.)*

---

## Phase 08: Child Box Bulk Operations

### Section 1: Bulk Create — Single Product (POST /child-boxes/bulk)

#### 1.1 — Success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-201 | Admin | Admin bulk-creates 5 boxes — all GENERATED | P0 | 1. Login as Admin, save JWT. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":5}`. | HTTP 201. Response `data` is array of exactly 5 objects. Each: `status="GENERATED"`, `barcode` starts `"BINNY-CB-"`, `product_id=PRODUCT_UUID_A`, `size="6"`, `colour="White"`, `mrp="299.00"`. Each `id` is unique. All barcodes are unique. | API | All bulk paths produce GENERATED |
| TC-CB-202 | Admin | Admin bulk-creates 1 box (count=1) | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":1}`. | HTTP 201. `data` array has exactly 1 item. `status="GENERATED"`. | API | |
| TC-CB-203 | Admin | Admin bulk-creates 500 boxes (max count) | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":500}`. | HTTP 201. `data` array has exactly 500 items. All `status="GENERATED"`. All barcodes unique. Single DB transaction wraps all 500 inserts (verify via rollback test TC-CB-207). | API | Max allowed is 500 |
| TC-CB-204 | Supervisor | Supervisor bulk-creates boxes | P1 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":3}`. | HTTP 201. 3 items returned, all `status="GENERATED"`. | API | |
| TC-CB-205 | Warehouse Operator | Warehouse Operator bulk-creates boxes | P1 | 1. Login as `warehouse@binny.com`. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":2}`. | HTTP 201. 2 items, all `status="GENERATED"`. | API | |

---

#### 1.2 — Denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-206 | Dispatch Operator | Dispatch Operator cannot bulk-create | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":3}`. | HTTP 403. Forbidden. No child boxes created. | API | |

---

#### 1.3 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-207 | Admin | count=0 returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":0}`. | HTTP 400. Error: `"Count must be at least 1"`. | API | |
| TC-CB-208 | Admin | count=501 returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":501}`. | HTTP 400. Error: `"Cannot create more than 500 child boxes at once"`. | API | Zod max(500) |
| TC-CB-209 | Admin | Non-existent product_id returns 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"00000000-0000-0000-0000-000000000000","count":3}`. | HTTP 404. Error: `"Product not found or inactive"`. | API | |
| TC-CB-210 | Admin | Inactive product returns 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<INACTIVE_PRODUCT_UUID>","count":3}`. | HTTP 404. Error: `"Product not found or inactive"`. No boxes created. | API | |
| TC-CB-211 | Admin | Missing product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"count":3}`. | HTTP 400. Validation error referencing `product_id`. | API | |
| TC-CB-212 | Admin | Bulk create writes CHILD_CREATED per box | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":3}`. Note 3 returned `id`s. 3. `SELECT transaction_type, COUNT(*) FROM inventory_transactions WHERE child_box_id IN (<id1>,<id2>,<id3>) GROUP BY transaction_type`. | 3 rows with `transaction_type='CHILD_CREATED'`. One per box. Notes contain `"Bulk child box generated"`. | Integration | |
| TC-CB-213 | Admin | Bulk create writes audit_log (BULK_CREATE_CHILD_BOX) | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":4}`. 3. `SELECT * FROM audit_log WHERE action='BULK_CREATE_CHILD_BOX' ORDER BY created_at DESC LIMIT 1`. | 1 audit_log row: `action='BULK_CREATE_CHILD_BOX'`, `new_values` contains `{product_id, quantity, count:4}`. | Integration | |

---

### Section 2: Bulk Multi-Size (POST /child-boxes/bulk-multi-size)

#### 2.1 — Success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-220 | Admin | Admin bulk-multi-size 3 sizes — all GENERATED | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"sizes":[{"size":"6","count":2},{"size":"7","count":2},{"size":"8","count":1}]}`. | HTTP 201. `data` array has exactly 5 items. 2 items with `size="6"`, 2 with `size="7"`, 1 with `size="8"`. All `status="GENERATED"`. All barcodes start `"BINNY-CB-"` and are unique. | API | |
| TC-CB-221 | Admin | Single-size entry in multi-size | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"6","count":3}]}`. | HTTP 201. 3 items, all `size="6"`, all `status="GENERATED"`. | API | |
| TC-CB-222 | Supervisor | Supervisor bulk-multi-size succeeds | P1 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"6","count":1},{"size":"7","count":1}]}`. | HTTP 201. 2 items. | API | |
| TC-CB-223 | Warehouse Operator | Warehouse Operator bulk-multi-size succeeds | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"8","count":1}]}`. | HTTP 201. 1 item, `size="8"`, `status="GENERATED"`. | API | |
| TC-CB-224 | Admin | Dispatch Operator cannot call bulk-multi-size | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"6","count":1}]}`. | HTTP 403. Forbidden. | API | |

---

#### 2.2 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-225 | Admin | Non-existent size returns 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"99","count":1}]}`. | HTTP 404. Error contains `"No product found for size "99""`. No boxes created. | API | |
| TC-CB-226 | Admin | Total count across sizes > 500 returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body sizes: `[{"size":"6","count":300},{"size":"7","count":201}]` (total=501). | HTTP 400. Error: `"Total count across all sizes must not exceed 500"`. No boxes created. | API | |
| TC-CB-227 | Admin | Total count = 500 (boundary) succeeds | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body sizes: `[{"size":"6","count":250},{"size":"7","count":250}]`. | HTTP 201. 500 items returned. All `status="GENERATED"`. | API | |
| TC-CB-228 | Admin | Empty sizes array returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[]}`. | HTTP 400. Error: `"At least one size must be specified"`. | API | Zod min(1) on sizes array |
| TC-CB-229 | Admin | Missing product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body omits `product_id`. | HTTP 400. Validation error referencing `product_id`. | API | |
| TC-CB-230 | Admin | Multi-size writes audit_log (BULK_MULTI_SIZE_CREATE_CHILD_BOX) | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` with `sizes:[{"size":"6","count":2}]`. 3. Check audit_log. | `audit_log` row with `action='BULK_MULTI_SIZE_CREATE_CHILD_BOX'`, `new_values.total_count=2`. | Integration | |

---

### Section 3: Sample CSV Download (GET /child-boxes/bulk-upload/sample)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-231 | Admin | Admin downloads child-box sample CSV | P0 | 1. Login as Admin, save JWT. 2. `GET /api/v1/child-boxes/bulk-upload/sample` with `Authorization: Bearer <JWT>`. | HTTP 200. `Content-Type: text/csv` or `application/octet-stream`. Response body is a valid CSV. First line header contains: `sku`, `quantity`, `count`. At least 1 sample data row present (spec says 4-line CSV). | API | Registered before `/:id` to avoid path collision |
| TC-CB-232 | Supervisor | Supervisor downloads sample CSV | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200. Valid CSV with correct columns. | API | |
| TC-CB-233 | Warehouse Operator | Warehouse Operator cannot download CB sample CSV | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 403. Forbidden. No file returned. | API | |
| TC-CB-234 | Dispatch Operator | Dispatch Operator cannot download CB sample CSV | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 403. Forbidden. | API | |
| TC-CB-235 | Any | Unauthenticated sample download returns 401 | P0 | 1. `GET /api/v1/child-boxes/bulk-upload/sample` with no auth header. | HTTP 401. | API | |

---

### Section 4: CSV Bulk Upload (POST /child-boxes/bulk-upload) — Apr 27 mod

#### 4.1 — Success cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-240 | Admin | Admin uploads valid 3-row CSV — all boxes created as GENERATED | P0 | 1. Login as Admin. 2. Create CSV `cb-upload.csv`: `sku,quantity,count\n<SKU_A>,1,3\n<SKU_B>,1,2\n<SKU_A>,2,1`. 3. `POST /api/v1/child-boxes/bulk-upload` as multipart/form-data, field `file` = the CSV. | HTTP 200. Response: `{"totalRows":3,"created":6,"errors":[],"createdBarcodes":["BINNY-CB-...","BINNY-CB-...",…]}`. `createdBarcodes` array has exactly 6 entries (3+2+1). All are unique strings starting `"BINNY-CB-"`. 6 rows in `child_boxes` table all with `status="GENERATED"`. | API | `createdBarcodes` array is for label printing |
| TC-CB-241 | Admin | Upload CSV with quantity column omitted — defaults to 1 | P1 | 1. Login as Admin. 2. CSV: `sku,count\n<SKU_A>,2`. 3. `POST /api/v1/child-boxes/bulk-upload`. | HTTP 200. `created = 2`. Both boxes have `quantity = 1`. | API | Zod default(1) for quantity |
| TC-CB-242 | Supervisor | Supervisor uploads valid CSV | P1 | 1. Login as Supervisor. 2. Upload 1-row CSV: `sku,count\n<SKU_A>,3`. | HTTP 200. `created = 3`. 3 boxes with `status="GENERATED"`. | API | |
| TC-CB-243 | Admin | Response structure — all four fields present | P0 | 1. Login as Admin. 2. Upload any valid CSV. | HTTP 200. Response body has exactly these top-level fields: `totalRows` (integer), `created` (integer), `errors` (array), `createdBarcodes` (array of strings). `totalRows` equals CSV row count. `created + errors.length <= totalRows`. | API | |
| TC-CB-244 | Admin | Upload CSV — each row's transaction is independent (bad row does not roll back good rows) | P0 | 1. Login as Admin. 2. CSV row 1: `<SKU_A>,1,3` (valid). Row 2: `BADSKU-999,1,2` (non-existent SKU). Row 3: `<SKU_B>,1,1` (valid). 3. Upload. | HTTP 200. `totalRows=3`. `created=4` (3+1). `errors` has 1 entry: `{row:2, sku:"BADSKU-999", error:"Product with SKU \"BADSKU-999\" not found"}`. `createdBarcodes` has 4 barcodes (from rows 1 and 3). Row 2 is skipped, rows 1 and 3 committed independently. | API | Each row has its own DB transaction |

---

#### 4.2 — Cap enforcement

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-245 | Admin | 1001-row CSV rejected before any processing | P0 | 1. Login as Admin. 2. Generate a CSV with 1001 data rows (all valid SKUs). 3. `POST /api/v1/child-boxes/bulk-upload`. | HTTP 409. Error: `"Maximum 1000 rows per upload"`. `created = 0`. No child boxes created. | API | Cap enforced at line 361 of `childBox.service.ts` |
| TC-CB-246 | Admin | 1000-row CSV (boundary) accepted | P1 | 1. Login as Admin. 2. Generate a CSV with exactly 1000 rows, each `count=1`. All valid SKUs. 3. Upload. | HTTP 200. `totalRows = 1000`. `created = 1000` (assuming no row errors). No error about row limit. | API | Boundary: 1000 rows is allowed |
| TC-CB-247 | Admin | Total boxes > 5000 rejected before inserts | P0 | 1. Login as Admin. 2. CSV: 2 rows — row 1: `<SKU_A>,1,3000`; row 2: `<SKU_B>,1,3000` (total = 6000). 3. Upload. | HTTP 409. Error: `"Total boxes across all rows must not exceed 5000"`. `created = 0`. No boxes created. | API | Pre-validation loop at line 372–384 of service |
| TC-CB-248 | Admin | Total boxes = 5000 (boundary) accepted | P1 | 1. Login as Admin. 2. CSV: 1 row `<SKU_A>,1,5000`. 3. Upload. | HTTP 200. `created = 5000`. No cap error. | API | Boundary: 5000 boxes is allowed |
| TC-CB-249 | Admin | count per row > 500 is rejected in per-row validation | P0 | 1. Login as Admin. 2. CSV: row 1: `<SKU_A>,1,501`. 3. Upload. | HTTP 200. `created = 0`. `errors` has 1 entry for row 1 referencing count max 500. | API | Zod `max(500)` on count field |

---

#### 4.3 — Per-row validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-250 | Admin | Row with non-existent SKU reported in errors | P0 | 1. Login as Admin. 2. CSV: `sku,count\nNOEXIST-SKU,3`. 3. Upload. | HTTP 200. `created=0`. `errors[0]`: `{row:1, sku:"NOEXIST-SKU", error:"Product with SKU \"NOEXIST-SKU\" not found"}`. `createdBarcodes = []`. | API | |
| TC-CB-251 | Admin | Row with inactive product SKU reported in errors | P0 | 1. Login as Admin. 2. Pre-condition: `INACTIVE_PRODUCT_UUID` with a known SKU `SKU_INACTIVE`. 3. CSV: `sku,count\n<SKU_INACTIVE>,1`. 4. Upload. | HTTP 200. `created=0`. `errors[0]`: `{row:1, sku:"<SKU_INACTIVE>", error:"Product \"<SKU_INACTIVE>\" is inactive"}`. | API | |
| TC-CB-252 | Admin | Row with count=0 reported in errors | P1 | 1. Login as Admin. 2. CSV: `sku,count\n<SKU_A>,0`. 3. Upload. | HTTP 200. `errors[0]` references row 1 with count validation error. `created=0`. | API | Zod min(1) for count |
| TC-CB-253 | Admin | Row with non-numeric count reported in errors | P1 | 1. Login as Admin. 2. CSV: `sku,count\n<SKU_A>,abc`. 3. Upload. | HTTP 200. `errors[0]` references row 1. `created=0`. | API | Zod coerce.number fails |
| TC-CB-254 | Admin | Row with empty SKU reported in errors | P1 | 1. Login as Admin. 2. CSV: `sku,count\n,3`. 3. Upload. | HTTP 200. `errors[0]` references row 1: `"SKU is required"`. | API | Zod min(1) on sku |
| TC-CB-255 | Admin | Multiple error rows — all errors reported, valid rows created | P0 | 1. Login as Admin. 2. CSV: row 1 valid (`<SKU_A>,1`), row 2 bad (`BADSKU,5`), row 3 bad (count=abc), row 4 valid (`<SKU_B>,2`). 3. Upload. | HTTP 200. `totalRows=4`. `created=3` (1+2). `errors` has 2 entries: row 2 (not found) and row 3 (invalid count). `createdBarcodes` has 3 entries. | API | |

---

#### 4.4 — File-level validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-256 | Admin | Missing required column `sku` returns 409 | P0 | 1. Login as Admin. 2. CSV with header `count,quantity` (no `sku`). 3. Upload. | HTTP 409. Error: `"Missing required columns: sku"`. `created=0`. | API | Header check requires `sku` + `count` |
| TC-CB-257 | Admin | Missing required column `count` returns 409 | P0 | 1. Login as Admin. 2. CSV with header `sku,quantity` (no `count`). 3. Upload. | HTTP 409. Error: `"Missing required columns: count"`. | API | |
| TC-CB-258 | Admin | Both `sku` and `count` missing returns 409 | P0 | 1. Login as Admin. 2. CSV with header `quantity` only. 3. Upload. | HTTP 409. Error: `"Missing required columns: sku, count"`. | API | |
| TC-CB-259 | Admin | Empty CSV (header only) returns 409 | P0 | 1. Login as Admin. 2. CSV with only `sku,count` header and no data rows. 3. Upload. | HTTP 409. Error: `"CSV file is empty"` or similar. | API | |
| TC-CB-260 | Admin | Invalid CSV format (not parseable) returns 409 | P1 | 1. Login as Admin. 2. Upload a binary `.xlsx` file via the `file` field. | HTTP 409 or 400. Error: `"Invalid CSV format"`. | API | `csv-parse/sync` throws; caught as ConflictError |
| TC-CB-261 | Admin | Upload without file field returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-upload` with empty multipart body. | HTTP 400. Error indicating file is required. | API | |

---

#### 4.5 — Role denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-262 | Warehouse Operator | Warehouse Operator cannot use CSV bulk upload | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk-upload` with a valid CSV. | HTTP 403. Forbidden. No boxes created. | API | CSV upload is Admin+Supervisor only |
| TC-CB-263 | Dispatch Operator | Dispatch Operator cannot use CSV bulk upload | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk-upload` with a valid CSV. | HTTP 403. Forbidden. | API | |

---

#### 4.6 — createdBarcodes response field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-264 | Admin | createdBarcodes array contains exactly the created barcodes | P0 | 1. Login as Admin. 2. Upload CSV: row 1 `<SKU_A>,1,2` (creates 2), row 2 `BADSKU,1,1` (errors), row 3 `<SKU_B>,1,3` (creates 3). | HTTP 200. `created=5`. `createdBarcodes` has exactly 5 entries. All entries start `"BINNY-CB-"`. Entries from row 2 are absent. Each barcode corresponds to a real `child_boxes` row (verify via `GET /api/v1/child-boxes/qr/<barcode>`). | Integration | |
| TC-CB-265 | Admin | createdBarcodes is empty when all rows fail | P1 | 1. Login as Admin. 2. Upload CSV with 3 rows all having non-existent SKUs. | HTTP 200. `created=0`. `createdBarcodes=[]`. `errors` has 3 entries. | API | |

---

### Section 5: E2E — Child Boxes page bulk import flow

#### 5.1 — Bulk Import modal (manager-only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-201 | Admin | Bulk Import button visible on child-boxes page | P0 | 1. Login as Admin. Navigate to `/child-boxes`. | "Bulk Import" button visible next to "Generate Labels". | E2E | `isManager` guard |
| TC-CB-E2E-202 | Supervisor | Supervisor sees Bulk Import button | P0 | 1. Login as Supervisor. Navigate to `/child-boxes`. | "Bulk Import" button visible. | E2E | |
| TC-CB-E2E-203 | Warehouse Operator | Warehouse Operator does not see Bulk Import button | P0 | 1. Login as Warehouse Operator. Navigate to `/child-boxes`. | "Bulk Import" button NOT visible. "Generate Labels" button IS visible. | E2E | |
| TC-CB-E2E-204 | Admin | Bulk Import opens modal with correct elements | P0 | 1. Navigate to `/child-boxes` as Admin. 2. Click "Bulk Import". | Modal opens. Contains: title "Bulk Import" (or equivalent). "Download Sample" link/button. File input (drag-drop zone or click-to-select). Upload button (initially enabled or disabled pending file). | E2E | |
| TC-CB-E2E-205 | Admin | Download Sample in modal downloads CSV file | P1 | 1. Open Bulk Import modal. 2. Click "Download Sample". | Browser downloads `child-boxes-bulk-upload-sample.csv`. File is valid CSV with columns `sku`, `quantity` (optional), `count`. | E2E | `handleDownloadSample` uses `fetch` + `Blob` + anchor click |

---

#### 5.2 — Upload and results panel

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-206 | Admin | Attach CSV and upload — success results shown | P0 | 1. Open Bulk Import modal. 2. Select/drop a valid 3-row CSV. 3. Click Upload. | `POST /api/v1/child-boxes/bulk-upload` called. Results panel appears: "3 child boxes created" (or equivalent count). `errors` section empty or hidden. Child boxes table refreshes (new GENERATED boxes appear). | E2E | |
| TC-CB-E2E-207 | Admin | Upload with errors — error rows shown in results | P1 | 1. Open Bulk Import modal. 2. Attach CSV with 1 bad row + 2 good rows. 3. Upload. | Results panel shows `created = 2`, error section lists row with bad SKU and its error message. "Download Created Barcodes" button appears. | E2E | |
| TC-CB-E2E-208 | Admin | Success toast shown after upload | P1 | 1. Upload valid CSV. | Toast message: `"<n> child boxes created"`. | E2E | `toast.success` in `handleBulkUpload` |
| TC-CB-E2E-209 | Admin | Error toast shown when all rows fail | P1 | 1. Upload CSV where all rows have non-existent SKUs. | Toast: `"<n> rows had errors — see details below"`. No success toast. | E2E | |

---

#### 5.3 — Download Created Barcodes button

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-210 | Admin | "Download Created Barcodes" button appears after successful upload | P0 | 1. Upload valid CSV via Bulk Import modal. 2. Results panel shown. | A button labelled "Download Created Barcodes" is visible in the results panel. | E2E | Appears when `bulkResult.createdBarcodes.length > 0` |
| TC-CB-E2E-211 | Admin | Clicking Download Created Barcodes triggers CSV download | P0 | 1. After successful bulk upload, click "Download Created Barcodes". | Browser downloads a file named `child-boxes-created-YYYY-MM-DD.csv` (where YYYY-MM-DD = today's date). File contains a header row `barcode` and one barcode per subsequent line. Barcodes match those returned in `createdBarcodes` from the API. | E2E | `handleDownloadCreatedBarcodes` builds in-browser CSV via Blob |
| TC-CB-E2E-212 | Admin | Downloaded barcodes CSV has correct format | P1 | 1. Open `child-boxes-created-YYYY-MM-DD.csv` downloaded in TC-CB-E2E-211. | Row 1: `barcode` (header). Rows 2+: `BINNY-CB-<uuid>` entries. Each is a valid barcode matching a box in the DB. | Manual | |
| TC-CB-E2E-213 | Admin | Download Created Barcodes button absent when no barcodes created | P1 | 1. Upload CSV where all rows fail (no boxes created). | `bulkResult.createdBarcodes` is empty. "Download Created Barcodes" button is NOT visible. | E2E | Guard: `bulkResult.createdBarcodes.length > 0` |
| TC-CB-E2E-214 | Admin | Closing and reopening bulk modal resets state | P1 | 1. Upload CSV, observe results. 2. Close modal. 3. Click "Bulk Import" again. | Modal opens fresh: no file selected, no results panel, no error entries, "Download Created Barcodes" absent. | E2E | `closeBulkModal` resets `bulkResult` and `bulkFile` |

---

#### 5.4 — Drag-drop file input

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-215 | Admin | Drag-drop CSV into upload zone attaches file | P2 | 1. Open Bulk Import modal. 2. Drag a valid `.csv` file over the upload zone and drop it. | File is accepted. File name displayed in the modal (or upload zone changes to show file). Upload button becomes active. | E2E | |
| TC-CB-E2E-216 | Admin | Upload zone rejects non-CSV file via drag-drop | P2 | 1. Open Bulk Import modal. 2. Drag a `.xlsx` file into the upload zone. | File rejected or warning shown. Upload button not activated. | E2E | |

---

### Section 6: Route registration sanity (GET /child-boxes/bulk-upload/sample before /:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-270 | Admin | /child-boxes/bulk-upload/sample not matched as /:id param | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200 (sample CSV returned). Response is NOT a 400 "Invalid child box ID format" error (which would indicate Express matched `bulk-upload` as the `:id` parameter). | API | Sample and bulk-upload routes are registered before `/:id` route in `childBox.routes.ts` |
| TC-CB-271 | Admin | POST /child-boxes/bulk-upload not matched as /:id param | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-upload` with a valid CSV. | HTTP 200 (bulk upload result). NOT 400 "Invalid child box ID format". | API | |
