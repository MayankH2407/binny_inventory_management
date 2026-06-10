# Phase 08 — Child Box: Bulk Operations

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3 (refreshed 2026-06-09)
**Phase:** 08
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (test)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (test)
**Playwright spec:** `frontend/e2e/29-childbox-bulk-upload.spec.ts`
**Last updated:** 2026-06-09

---

## Contents

1. [Context and architecture notes](#context-and-architecture-notes)
2. [RBAC matrix for child-box bulk endpoints](#rbac-matrix-for-child-box-bulk-endpoints)
3. [Known matrix discrepancies](#known-matrix-discrepancies)
4. [Shared test fixtures](#shared-test-fixtures)
5. [Section 1 — Bulk Single-Size (`POST /child-boxes/bulk`)](#section-1--bulk-single-size-post-child-boxesbulk)
6. [Section 2 — Bulk Multi-Size (`POST /child-boxes/bulk-multi-size`)](#section-2--bulk-multi-size-post-child-boxesbulk-multi-size)
7. [Section 3 — Batched barcode generation (`generateUniqueBarcodes`)](#section-3--batched-barcode-generation-generateuniquebarcodes)
8. [Section 4 — Sample CSV download (`GET /child-boxes/bulk-upload/sample`)](#section-4--sample-csv-download-get-child-boxesbulk-uploadsample)
9. [Section 5 — CSV Bulk Upload (`POST /child-boxes/bulk-upload`)](#section-5--csv-bulk-upload-post-child-boxesbulk-upload)
10. [Section 6 — Route registration sanity](#section-6--route-registration-sanity)
11. [Section 7 — E2E: Generate Labels page (`/child-boxes/generate`)](#section-7--e2e-generate-labels-page-child-boxesgenerate)
12. [Section 8 — E2E: Bulk Import modal on `/child-boxes`](#section-8--e2e-bulk-import-modal-on-child-boxes)

---

## Context and architecture notes

### Barcode format
All child-box barcodes follow the **short format** `CB######` where `######` is 6 Crockford Base32 characters drawn from the alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no `I`, `L`, `O`, `U`). Example: `CB3K9MQP`. The legacy `BINNY-CB-` prefix does **not** exist in the current codebase; any test expecting that prefix is stale.

### Two barcode-generation paths
| Endpoint | Generator used | Collision-check method |
|---|---|---|
| `POST /child-boxes/bulk` | `generateUniqueBarcode` (per-iteration loop) | One `SELECT ... WHERE barcode = $1 LIMIT 1` per box per attempt |
| `POST /child-boxes/bulk-multi-size` | `generateUniqueBarcodes` (batch) | One `SELECT ... WHERE barcode = ANY($1)` per round; in-memory `seen` set prevents intra-batch duplicates |
| `POST /child-boxes/bulk-upload` (per-row inner loop) | `generateUniqueBarcode` (per-iteration) | Same as `/bulk` |

### Batch architecture of `/bulk-multi-size`
1. Flatten `sizes × count` → `flat[]` array of product rows.
2. Generate all UUIDs upfront (`uuidv4()` × N).
3. Call `generateUniqueBarcodes('CB', N, client)` → one batch DB round per collision set (up to `MAX_ATTEMPTS = 10` rounds).
4. Single multi-row `INSERT INTO child_boxes … VALUES (…),(…)…`.
5. Single multi-row `INSERT INTO inventory_transactions … VALUES (…),(…)…`.
6. `COMMIT`.
7. Audit log written outside the transaction (one entry, `BULK_MULTI_SIZE_CREATE_CHILD_BOX`).
8. **No per-box QR PNG generated** — `qr_data_uri` is `''` in the returned objects. Client-side label rendering uses the barcode string, not a pre-generated PNG.

### Per-generation cap
| Endpoint | Cap value | Source |
|---|---|---|
| `/bulk` | **500** (fixed) | Zod `max(500)` in `createBulkChildBoxSchema` |
| `/bulk-multi-size` | **500** default; **1 500** on live | `process.env.CHILD_BOX_MAX_PER_GENERATION \|\| 500`; FE reads `NEXT_PUBLIC_CHILD_BOX_MAX \|\| 500` |
| `/bulk-upload` per-row | **500** per row | Zod `max(500)` on `count` field |
| `/bulk-upload` total | **5 000** boxes | Pre-validation loop in service |
| `/bulk-upload` rows | **1 000** rows | Pre-validation check |

### Transaction model
- **`/bulk`**: All N boxes in one `BEGIN … COMMIT`; one `BULK_CREATE_CHILD_BOX` audit log after commit.
- **`/bulk-multi-size`**: All N boxes in one `BEGIN … COMMIT`; one `BULK_MULTI_SIZE_CREATE_CHILD_BOX` audit log after commit.
- **`/bulk-upload`**: Each CSV row in its own `BEGIN … COMMIT`; one `CREATE_CHILD_BOX` audit log **per box** (not per row, not one summary).

### HTTP response codes
| Endpoint | Success | Error |
|---|---|---|
| `POST /child-boxes/bulk` | **201** | 400 validation, 404 product, 400 cap |
| `POST /child-boxes/bulk-multi-size` | **201** | 400 validation, 404 product/size, 400 cap |
| `POST /child-boxes/bulk-upload` | **201** | 400 no-file, 409 cap/format/headers |
| `GET /child-boxes/bulk-upload/sample` | **200** | — |

---

## RBAC matrix for child-box bulk endpoints

| Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `child_boxes:create` (used by `/bulk`, `/bulk-multi-size`, `/bulk-upload`) | ✓ | ✓ | ✓ | ✗ |
| `child_boxes:read` (used by sample GET) | ✓ | ✓ | ✓ | ✓ |

Source: `backend/seeds/001_roles.ts`.

---

## Known matrix discrepancies

> These are **documentation findings** — encode as explicit expected-result TCs, not bugs to fix.

1. **Sample CSV download (`child_boxes:read`) is reachable by ALL four roles including Warehouse Operator and Dispatch Operator.** The old phase-08 file (pre-refresh) incorrectly asserted 403 for Warehouse Operator (TC-CB-233) and Dispatch Operator (TC-CB-234). Actual route: `authorizePermission('child_boxes:read')`, and Warehouse Op + Dispatch Op both hold that permission in seeds.

2. **CSV bulk upload (`child_boxes:create`) is reachable by Warehouse Operator.** The old file's TC-CB-262 incorrectly asserted Warehouse Operator gets 403 on `POST /bulk-upload`. Warehouse Op holds `child_boxes:create`.

3. **The per-generation cap for `/bulk-multi-size` is env-gated (500 default, 1 500 on live); the `/bulk` single-size cap is fixed at 500 via Zod and is NOT env-gated.** Clients on the live server with a permissive `CHILD_BOX_MAX_PER_GENERATION=1500` can still only do 500 via `/bulk`.

4. **`qr_data_uri` is empty string (`''`) in all `/bulk-multi-size` responses.** The generate page renders barcodes client-side. There is no per-box PNG round-trip.

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `PRODUCT_UUID_A` | Active product — article `HAWAII-BUSKER-GENTS-01`, colour `White`, size `6` |
| `PRODUCT_UUID_B` | Same article + colour, size `7` (sibling of A) |
| `PRODUCT_UUID_C` | Same article + colour, size `8` (sibling of A) |
| `INACTIVE_PRODUCT_UUID` | A product deactivated in Phase 05 |
| `SKU_A` | SKU of `PRODUCT_UUID_A` |
| `SKU_B` | SKU of `PRODUCT_UUID_B` |
| `SKU_INACTIVE` | SKU of `INACTIVE_PRODUCT_UUID` |

### Sample bulk-upload CSV (3 data rows)

```
sku,quantity,count
BFW-MEN-CASUAL-RED-7,1,50
BFW-MEN-CASUAL-RED-8,1,40
BFW-MEN-CASUAL-BLUE-9,1,30
```

*(Replace with real SKUs from Phase 05 before running.)*

---

## Section 1 — Bulk Single-Size (`POST /child-boxes/bulk`)

### 1.1 — Happy path, RBAC allow

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-001 | Admin | Admin bulk-creates 5 boxes — all GENERATED, short barcodes | P0 | 1. Login as Admin, save JWT. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":5}`. | HTTP 201. `success=true`. `data` is array of exactly 5 objects. Each has `status="GENERATED"`. Each `barcode` matches regex `^CB[0-9A-HJKMNP-TV-Z]{6}$`. Each `product_id=PRODUCT_UUID_A`. Each `size="6"`, `colour="White"`. All 5 `id` values unique. All 5 barcodes unique. | API; E2E (spec 29) | Short barcode format `CB######`; no `BINNY-CB-` prefix |
| TC-CBULK-002 | Admin | count=1 boundary — single box returned | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":1}`. | HTTP 201. `data` array length = 1. `status="GENERATED"`. `barcode` matches `^CB[0-9A-HJKMNP-TV-Z]{6}$`. | API | |
| TC-CBULK-003 | Admin | count=500 boundary — 500 boxes returned, all unique barcodes | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":500}`. | HTTP 201. `data` array length = 500. All `status="GENERATED"`. All barcodes unique. Regex `^CB[0-9A-HJKMNP-TV-Z]{6}$` matches all. | API | Max allowed by Zod `max(500)` |
| TC-CBULK-004 | Supervisor | Supervisor bulk-creates boxes (child_boxes:create allowed) | P1 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":3}`. | HTTP 201. 3 items, all `status="GENERATED"`. | API | Supervisor holds `child_boxes:create` |
| TC-CBULK-005 | Warehouse Operator | Warehouse Operator bulk-creates boxes (child_boxes:create allowed) | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":2}`. | HTTP 201. 2 items, all `status="GENERATED"`. | API | Warehouse Op holds `child_boxes:create` |

### 1.2 — RBAC deny and Unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-010 | Dispatch Operator | Dispatch Operator cannot bulk-create — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"count":3}`. | HTTP 403. `success=false`. No child boxes created. | API | Dispatch Op lacks `child_boxes:create` |
| TC-CBULK-011 | Unauthenticated | No token — 401 | P0 | 1. `POST /api/v1/child-boxes/bulk` with no `Authorization` header. | HTTP 401. | API | AUTOMATION GAP — no spec 29 test for unauth on `/bulk` |

### 1.3 — Validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-015 | Admin | count=0 — 400 validation error | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":0}`. | HTTP 400. Error references `count` — "Count must be a whole number" or "Count must be at least 1". | API | Zod `.positive()` |
| TC-CBULK-016 | Admin | count=501 — 400, cap exceeded | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","count":501}`. | HTTP 400. Error: `"Cannot create more than 500 child boxes at once"`. No boxes created. | API | Zod `max(500)` — fixed cap, NOT env-gated |
| TC-CBULK-017 | Admin | count=501 with CHILD_BOX_MAX_PER_GENERATION=1500 — still 400 | P1 | Pre-condition: env var `CHILD_BOX_MAX_PER_GENERATION=1500` set. 1. `POST /api/v1/child-boxes/bulk` body `count=501`. | HTTP 400. Same cap error. The env var does NOT affect `/bulk` (Zod schema is hardcoded). | API; Integration | Confirms the env cap only applies to `/bulk-multi-size` |
| TC-CBULK-018 | Admin | Non-existent product_id — 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"00000000-0000-0000-0000-000000000000","count":3}`. | HTTP 404. Error: `"Product not found or inactive"`. | API | |
| TC-CBULK-019 | Admin | Inactive product — 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"<INACTIVE_PRODUCT_UUID>","count":3}`. | HTTP 404. Error: `"Product not found or inactive"`. No boxes created. | API | Service checks `is_active = true` |
| TC-CBULK-020 | Admin | Missing product_id — 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"count":3}`. | HTTP 400. Validation error referencing `product_id`. | API | Zod UUID required |
| TC-CBULK-021 | Admin | Invalid UUID format for product_id — 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` body: `{"product_id":"not-a-uuid","count":3}`. | HTTP 400. Error: `"Invalid product ID format"`. | API | Zod `.uuid()` |

### 1.4 — Integrity and audit

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-025 | Admin | Each box gets one CHILD_CREATED inventory transaction | P1 | 1. `POST /child-boxes/bulk` count=3. Note 3 returned IDs. 2. `SELECT transaction_type, notes FROM inventory_transactions WHERE child_box_id IN (<id1>,<id2>,<id3>)`. | 3 rows, all `transaction_type='CHILD_CREATED'`. Notes contain `"Bulk child box generated"` and the barcode. | Integration | One CHILD_CREATED per box |
| TC-CBULK-026 | Admin | One BULK_CREATE_CHILD_BOX audit log written after commit | P1 | 1. `POST /child-boxes/bulk` count=4. 2. `SELECT * FROM audit_log WHERE action='BULK_CREATE_CHILD_BOX' ORDER BY created_at DESC LIMIT 1`. | 1 row. `action='BULK_CREATE_CHILD_BOX'`. `new_values` contains `{product_id, quantity, count:4}`. Audit is written after transaction COMMIT (not inside). | Integration | Single summary audit, not per-box |
| TC-CBULK-027 | Admin | Transaction rollback on error — no partial boxes created | P1 | 1. Login as Admin. 2. Arrange a scenario that will fail mid-batch (e.g., DB constraint violation via mock or deliberate duplicate barcode injection in test env). Alternatively verify via manual inspection that failed bulk calls leave 0 boxes. | On a failed `createBulkChildBoxes` call, ROLLBACK is issued and 0 boxes exist in `child_boxes` for that batch. | Integration; Manual | The service wraps all inserts in `BEGIN…COMMIT`; `ROLLBACK` in catch |
| TC-CBULK-028 | Admin | quantity field persisted correctly per box | P1 | 1. `POST /child-boxes/bulk` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":12,"count":2}`. | Both returned boxes have `quantity=12`. Confirmed in DB. | API | |

---

## Section 2 — Bulk Multi-Size (`POST /child-boxes/bulk-multi-size`)

### 2.1 — Happy path, RBAC allow

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-050 | Admin | Admin multi-size 3 sizes — all GENERATED, correct counts, short barcodes | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1,"sizes":[{"size":"6","count":2},{"size":"7","count":2},{"size":"8","count":1}]}`. | HTTP 201. `data` array length = 5. 2 items `size="6"`, 2 `size="7"`, 1 `size="8"`. All `status="GENERATED"`. All barcodes match `^CB[0-9A-HJKMNP-TV-Z]{6}$`. All barcodes unique. `qr_data_uri=""` for all (no PNG generated). | API | Batched barcode gen path; no per-box QR |
| TC-CBULK-051 | Admin | Single-size entry in multi-size body | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[{"size":"6","count":3}]}`. | HTTP 201. 3 items, all `size="6"`, all `status="GENERATED"`. | API | |
| TC-CBULK-052 | Admin | quantity defaults to 1 when omitted | P1 | 1. `POST /bulk-multi-size` body with no `quantity` field, sizes `[{"size":"6","count":2}]`. | HTTP 201. Both boxes have `quantity=1`. | API | Zod `.default(1)` |
| TC-CBULK-053 | Admin | Sibling lookup uses article_name + colour, not product_id | P1 | 1. Use PRODUCT_UUID_B (size 7, same article+colour as A). 2. `POST /bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_B>","sizes":[{"size":"6","count":1},{"size":"7","count":1},{"size":"8","count":1}]}`. | HTTP 201. 3 boxes — one each for sizes 6, 7, 8. Each has the correct `product_id` for its size (not all pointing to PRODUCT_UUID_B). | API | Service resolves siblings by `article_name + colour + is_active=true` |
| TC-CBULK-054 | Supervisor | Supervisor bulk-multi-size succeeds | P1 | 1. Login as Supervisor. 2. `POST /bulk-multi-size` body: sizes `[{"size":"6","count":1},{"size":"7","count":1}]`. | HTTP 201. 2 items. | API | |
| TC-CBULK-055 | Warehouse Operator | Warehouse Operator bulk-multi-size succeeds | P1 | 1. Login as Warehouse Operator. 2. `POST /bulk-multi-size` body: sizes `[{"size":"8","count":1}]`. | HTTP 201. 1 item, `size="8"`, `status="GENERATED"`. | API | |

### 2.2 — RBAC deny and Unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-060 | Dispatch Operator | Dispatch Operator cannot call bulk-multi-size — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk-multi-size` body: sizes `[{"size":"6","count":1}]`. | HTTP 403. No boxes created. | API | |
| TC-CBULK-061 | Unauthenticated | No token — 401 | P0 | 1. `POST /api/v1/child-boxes/bulk-multi-size` with no `Authorization` header. | HTTP 401. | API | AUTOMATION GAP — no spec 29 test for unauth on `/bulk-multi-size` |

### 2.3 — Validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-065 | Admin | Non-existent size — 404 | P0 | 1. Login as Admin. 2. `POST /bulk-multi-size` body: sizes `[{"size":"99","count":1}]`. | HTTP 404. Error contains `"No product found for size \"99\""`. No boxes created. | API | Service validates each size against sibling map |
| TC-CBULK-066 | Admin | Total count across sizes > 500 (default cap) — 400 | P0 | 1. Login as Admin (env default: 500). 2. `POST /bulk-multi-size` sizes `[{"size":"6","count":300},{"size":"7","count":201}]` (total=501). | HTTP 400. Error: `"Total count across all sizes must not exceed 500"`. No boxes created. | API | Env-gated cap: `process.env.CHILD_BOX_MAX_PER_GENERATION \|\| 500` |
| TC-CBULK-067 | Admin | Total count = 500 (boundary) succeeds | P0 | 1. Login as Admin. 2. `POST /bulk-multi-size` sizes `[{"size":"6","count":250},{"size":"7","count":250}]`. | HTTP 201. 500 items. All `status="GENERATED"`. | API | |
| TC-CBULK-068 | Admin | Total count > 1500 with CHILD_BOX_MAX_PER_GENERATION=1500 — 400 | P1 | Pre-condition: set `CHILD_BOX_MAX_PER_GENERATION=1500` in server env. 1. `POST /bulk-multi-size` sizes summing to 1501. | HTTP 400. Error: `"Total count across all sizes must not exceed 1500"`. | API; Integration | Live env cap verification |
| TC-CBULK-069 | Admin | Total count = 1500 (boundary at live cap) — 201 | P1 | Pre-condition: `CHILD_BOX_MAX_PER_GENERATION=1500`. 1. `POST /bulk-multi-size` sizes summing to exactly 1500. | HTTP 201. 1500 items returned. | API; Integration | AUTOMATION GAP — no spec 29 env-gated cap test |
| TC-CBULK-070 | Admin | Empty sizes array — 400 | P1 | 1. `POST /bulk-multi-size` body: `{"product_id":"<PRODUCT_UUID_A>","sizes":[]}`. | HTTP 400. Error: `"At least one size must be specified"`. | API | Zod `.min(1)` on sizes array |
| TC-CBULK-071 | Admin | sizes array > 50 entries — 400 | P2 | 1. `POST /bulk-multi-size` body with 51 size entries. | HTTP 400. Error referencing max 50 sizes. | API | Zod `.max(50)` |
| TC-CBULK-072 | Admin | Missing product_id — 400 | P0 | 1. `POST /bulk-multi-size` body omits `product_id`. | HTTP 400. Validation error referencing `product_id`. | API | |
| TC-CBULK-073 | Admin | Inactive product used as base — 404 | P0 | 1. `POST /bulk-multi-size` body: `{"product_id":"<INACTIVE_PRODUCT_UUID>","sizes":[{"size":"6","count":1}]}`. | HTTP 404. Error: `"Product not found or inactive"`. | API | Base product lookup checks `is_active=true` |
| TC-CBULK-074 | Admin | count=0 in a size entry — 400 | P1 | 1. `POST /bulk-multi-size` body: sizes `[{"size":"6","count":0}]`. | HTTP 400. Error referencing `count` — "Count must be at least 1". | API | Zod `.positive()` on each size count |

### 2.4 — Integrity and audit

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-080 | Admin | Multi-row INSERT for child_boxes (single DB round-trip) | P1 | 1. `POST /bulk-multi-size` sizes `[{"size":"6","count":2},{"size":"7","count":2}]`. Monitor DB query log or verify via performance: 4 boxes created in a single `INSERT INTO child_boxes … VALUES (…),(…),(…),(…) RETURNING *`. | DB receives one `INSERT … VALUES (v1),(v2),(v3),(v4)` for child_boxes. Not 4 individual INSERTs. Likewise one multi-row INSERT for inventory_transactions. | Integration; Manual | Batched architecture; no per-box round-trips |
| TC-CBULK-081 | Admin | Each box gets one CHILD_CREATED inventory transaction | P1 | 1. `POST /bulk-multi-size` sizes `[{"size":"6","count":2}]`. Note 2 returned IDs. 2. `SELECT transaction_type, notes FROM inventory_transactions WHERE child_box_id IN (<id1>,<id2>)`. | 2 rows, `transaction_type='CHILD_CREATED'`. Notes contain `"Multi-size bulk child box generated"` and barcodes. | Integration | |
| TC-CBULK-082 | Admin | One BULK_MULTI_SIZE_CREATE_CHILD_BOX audit log written after COMMIT | P1 | 1. `POST /bulk-multi-size` sizes `[{"size":"6","count":3}]`. 2. `SELECT * FROM audit_log WHERE action='BULK_MULTI_SIZE_CREATE_CHILD_BOX' ORDER BY created_at DESC LIMIT 1`. | 1 row. `new_values` contains `{product_id, quantity, sizes:[…], total_count:3}`. | Integration | Single audit per batch, not per box |
| TC-CBULK-083 | Admin | ROLLBACK on error — zero boxes for that batch | P1 | Arrange a mid-batch failure (e.g., DB unavailable partway). | ROLLBACK issued; 0 boxes from that batch in `child_boxes`. | Integration; Manual | `try/catch` wraps BEGIN…COMMIT |
| TC-CBULK-084 | Admin | qr_data_uri is empty string in all returned boxes | P0 | 1. `POST /bulk-multi-size` sizes `[{"size":"6","count":3}]`. Inspect `data[*].qr_data_uri`. | All `qr_data_uri` are `""` (empty string). No PNG data URIs. | API | Perf optimization: client renders QR from barcode string |

---

## Section 3 — Batched barcode generation (`generateUniqueBarcodes`)

> These TCs cover the `barcodeGenerator.ts` batch logic used by `/bulk-multi-size`. The per-iteration `generateUniqueBarcode` path (used by `/bulk` and `/bulk-upload`) is covered indirectly by barcode-uniqueness assertions in Sections 1 and 5.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-100 | Admin | All generated barcodes are globally unique across the batch | P0 | 1. `POST /bulk-multi-size` sizes summing to 100 boxes. 2. Collect all 100 barcodes from response. | All 100 values are distinct strings. No two barcodes in the batch are identical. | API | In-memory `seen` Set prevents intra-batch duplicates before DB check |
| TC-CBULK-101 | Admin | Barcodes match short format `CB######` | P0 | 1. `POST /bulk-multi-size` sizes `[{"size":"6","count":5}]`. 2. Inspect each `data[i].barcode`. | Each barcode matches `^CB[0-9A-HJKMNP-TV-Z]{6}$`. Length = 8. Prefix = `"CB"`. No `"BINNY-CB-"` or UUID. | API | Crockford Base32 alphabet (`ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'`) |
| TC-CBULK-102 | Admin | Batch-generated barcodes do not collide with pre-existing barcodes | P1 | 1. Pre-create several boxes with known barcodes (via single-create or earlier bulk). 2. `POST /bulk-multi-size` count=50. 3. Verify none of the 50 new barcodes equal any pre-existing barcode. | 0 barcode collisions with existing `child_boxes.barcode` values. | Integration | `ANY($1::text[])` DB check in batch generator |
| TC-CBULK-103 | Admin | MAX_ATTEMPTS guard: after 10 failed rounds the service throws | P2 | Simulate (in a test environment) a scenario where collision rate is 100%: mock `query` to always return every candidate as "taken". | Service throws `Error: "Failed to generate N unique CB barcodes after 10 rounds"`. HTTP 500 returned. | Integration; Manual | `MAX_ATTEMPTS = 10` in `barcodeGenerator.ts` |
| TC-CBULK-104 | Admin | generateUniqueBarcode (single, used by /bulk) — per-barcode SELECT check | P1 | 1. `POST /bulk` count=3. 2. All 3 barcodes unique and match `^CB[0-9A-HJKMNP-TV-Z]{6}$`. | Each barcode unique. Each verified by its own `SELECT 1 FROM child_boxes WHERE barcode=$1 LIMIT 1` before insert (per `generateUniqueBarcode` loop). | API; Integration | Separate path from batch generator |
| TC-CBULK-105 | Admin | generateUniqueBarcode (single) MAX_ATTEMPTS guard | P2 | Mock DB to always return candidate as taken. Call `generateUniqueBarcode('CB')`. | Throws `Error: "Failed to generate unique CB barcode after 10 attempts"`. | Integration; Manual | `MAX_ATTEMPTS=10` per-barcode path |

---

## Section 4 — Sample CSV download (`GET /child-boxes/bulk-upload/sample`)

### 4.1 — RBAC allow (all 4 roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-120 | Admin | Admin downloads sample CSV — 200 | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/bulk-upload/sample` with `Authorization: Bearer <JWT>`. | HTTP 200. `Content-Type` includes `text/csv` or `application/octet-stream`. `Content-Disposition` header includes `child-boxes-bulk-upload-sample.csv`. Body is valid CSV. | API; E2E (TC-CB-ROLE-001 in spec 29) | |
| TC-CBULK-121 | Supervisor | Supervisor downloads sample CSV — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200. Valid CSV. | API | Supervisor holds `child_boxes:read` |
| TC-CBULK-122 | Warehouse Operator | Warehouse Operator downloads sample CSV — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200. Valid CSV. **Not 403.** | API | MATRIX DISCREPANCY: Old file said 403; actual code uses `child_boxes:read` which WH Op holds |
| TC-CBULK-123 | Dispatch Operator | Dispatch Operator downloads sample CSV — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200. Valid CSV. **Not 403.** | API | MATRIX DISCREPANCY: Old file said 403; Dispatch Op holds `child_boxes:read` |

### 4.2 — Unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-125 | Unauthenticated | No token — 401 | P0 | 1. `GET /api/v1/child-boxes/bulk-upload/sample` with no `Authorization` header. | HTTP 401. | API | |

### 4.3 — CSV content

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-127 | Admin | Sample CSV header contains sku, quantity, count | P0 | 1. Download sample CSV. 2. Parse first line. | Header columns include exactly `sku`, `quantity`, `count` (case-insensitive, order-irrelevant). | API; E2E (TC-CB-CSV-002 in spec 29) | |
| TC-CBULK-128 | Admin | Sample CSV has exactly 3 data rows (4 lines total) | P0 | 1. Download sample CSV. 2. Count non-empty lines. | 4 lines: 1 header + 3 data rows. | API; E2E (TC-CB-CSV-003 in spec 29) | Controller hardcodes 3 sample rows |
| TC-CBULK-129 | Admin | Sample CSV data rows contain realistic SKU values | P1 | 1. Download sample CSV. 2. Inspect data rows. | Each row has a non-empty SKU, integer quantity, integer count. Sample data rows use recognizable patterns (e.g., `BFW-MEN-CASUAL-RED-7`). | Manual | |

---

## Section 5 — CSV Bulk Upload (`POST /child-boxes/bulk-upload`)

### 5.1 — Happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-150 | Admin | 3-row CSV — 6 boxes created, all GENERATED, short barcodes | P0 | 1. Login as Admin. 2. CSV: `sku,quantity,count\n<SKU_A>,1,2\n<SKU_B>,1,2\n<SKU_A>,1,2`. 3. `POST /api/v1/child-boxes/bulk-upload` multipart/form-data field `file`. | HTTP 201. `data.created=6`. `data.errors=[]`. `data.totalRows=3`. `data.createdBarcodes` array length=6. All barcodes match `^CB[0-9A-HJKMNP-TV-Z]{6}$`. All 6 unique. | API; E2E (TC-CB-UPLOAD-001 in spec 29) | HTTP 201 (not 200 as old file stated) |
| TC-CBULK-151 | Admin | Uploaded boxes have status GENERATED in DB | P0 | 1. Upload 1-row CSV `<SKU_A>,1,2`. 2. `GET /api/v1/child-boxes/qr/<barcode>` for each returned barcode. | Each box has `status="GENERATED"`. | API; E2E (TC-CB-UPLOAD-002 in spec 29) | |
| TC-CBULK-152 | Admin | quantity column omitted — defaults to 1 | P1 | 1. CSV: `sku,count\n<SKU_A>,2`. 3. Upload. | HTTP 201. `created=2`. Both boxes have `quantity=1`. | API | Zod `default(1)` on quantity field |
| TC-CBULK-153 | Admin | Response structure has all four required fields | P0 | 1. Upload any valid CSV. | HTTP 201. Response has exactly these top-level `data` fields: `totalRows` (int), `created` (int), `errors` (array), `createdBarcodes` (string[]). `totalRows` = data-row count. | API | Controller: `sendSuccess(res, result, …, 201)` |
| TC-CBULK-154 | Supervisor | Supervisor uploads valid CSV — 201 | P1 | 1. Login as Supervisor. 2. Upload 1-row CSV. | HTTP 201. `created > 0`. | API | Supervisor holds `child_boxes:create` |
| TC-CBULK-155 | Warehouse Operator | Warehouse Operator uploads valid CSV — 201 | P0 | 1. Login as Warehouse Operator. 2. Upload 1-row CSV: `<SKU_A>,1,1`. | HTTP 201. `created=1`. **Not 403.** | API | MATRIX DISCREPANCY: Old file said 403 (TC-CB-262); WH Op holds `child_boxes:create` |

### 5.2 — Per-row isolation (bad row does not roll back good rows)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-160 | Admin | Bad row 2 does not prevent rows 1 and 3 from committing | P0 | 1. CSV row 1: `<SKU_A>,1,3` (valid). Row 2: `BADSKU-999,1,2` (non-existent). Row 3: `<SKU_B>,1,1` (valid). Upload. | HTTP 201. `totalRows=3`. `created=4` (3+1). `errors` has 1 entry: `{row:2, sku:"BADSKU-999", error:"Product with SKU \"BADSKU-999\" not found"}`. `createdBarcodes` has 4 entries. | API; E2E (TC-CB-ERR-001 in spec 29) | Each row uses its own DB transaction |
| TC-CBULK-161 | Admin | All rows fail — created=0, createdBarcodes=[] | P1 | 1. CSV with 3 rows all having non-existent SKUs. Upload. | HTTP 201. `created=0`. `createdBarcodes=[]`. `errors` has 3 entries. | API | |
| TC-CBULK-162 | Admin | Multiple error types in same upload — all reported | P0 | 1. CSV: row 1 valid, row 2 bad SKU, row 3 count=0 (validation), row 4 valid. | HTTP 201. `totalRows=4`. `created = row1_count + row4_count`. `errors` has 2 entries: row 2 (not found) and row 3 (validation). `createdBarcodes` has correct count. | API | |

### 5.3 — Cap enforcement

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-170 | Admin | 1001-row CSV rejected — 409 before any processing | P0 | 1. Generate 1001-row CSV (all valid SKUs). Upload. | HTTP 409. `data.created=0` or no `data`. Message: `"Maximum 1000 rows per upload"`. No child boxes created. | API; E2E (TC-CB-ERR-002 in spec 29) | Checked BEFORE per-row loop |
| TC-CBULK-171 | Admin | 1000-row CSV (boundary) — accepted, no row-cap error | P1 | 1. 1000-row CSV, each `count=1`, all valid SKUs. Upload. | HTTP 201. `totalRows=1000`. No "Maximum 1000 rows" error. `created` up to 1000 (minus any per-row errors). | API | |
| TC-CBULK-172 | Admin | Total boxes > 5000 — 409 before any inserts | P0 | 1. CSV: row 1 `<SKU_A>,1,3000`; row 2 `<SKU_B>,1,3000` (total=6000). Upload. | HTTP 409. Message: `"Total boxes across all rows must not exceed 5000"`. `created=0`. | API; E2E (TC-CB-ERR-003 in spec 29) | Pre-validation loop in service |
| TC-CBULK-173 | Admin | Total boxes = 5000 (boundary) — accepted | P1 | 1. CSV: 1 row `<SKU_A>,1,5000`. Upload. | HTTP 201. `created=5000`. No total-cap error. | API | |
| TC-CBULK-174 | Admin | count per row > 500 — per-row Zod validation error, other rows proceed | P0 | 1. CSV: row 1 `<SKU_A>,1,501`. Row 2 `<SKU_B>,1,2` (valid). Upload. | HTTP 201. `errors` has 1 entry for row 1 (count exceeds 500). `created=2`. | API | Zod `max(500)` on count — per-row, not a global 409 |

### 5.4 — Per-row validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-180 | Admin | Non-existent SKU — error reported | P0 | 1. CSV: `sku,count\nNOEXIST-SKU,3`. Upload. | HTTP 201. `created=0`. `errors[0]`: `{row:1, sku:"NOEXIST-SKU", error:"Product with SKU \"NOEXIST-SKU\" not found"}`. `createdBarcodes=[]`. | API | |
| TC-CBULK-181 | Admin | Inactive product SKU — error reported | P0 | 1. CSV: `sku,count\n<SKU_INACTIVE>,1`. Upload. | HTTP 201. `created=0`. `errors[0]`: `{row:1, sku:"<SKU_INACTIVE>", error:"Product \"<SKU_INACTIVE>\" is inactive"}`. | API | Service checks `is_active` after lookup |
| TC-CBULK-182 | Admin | count=0 — Zod error reported | P1 | 1. CSV: `sku,count\n<SKU_A>,0`. Upload. | HTTP 201. `errors[0]` for row 1 with count validation error. `created=0`. | API | Zod `min(1)` |
| TC-CBULK-183 | Admin | Non-numeric count — Zod coerce error reported | P1 | 1. CSV: `sku,count\n<SKU_A>,abc`. Upload. | HTTP 201. `errors[0]` for row 1. `created=0`. | API | Zod `coerce.number()` |
| TC-CBULK-184 | Admin | Empty SKU — error: "SKU is required" | P1 | 1. CSV: `sku,count\n,3`. Upload. | HTTP 201. `errors[0]` for row 1: error contains `"SKU is required"`. | API | Zod `.min(1, 'SKU is required')` |

### 5.5 — File-level validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-190 | Admin | Missing `sku` column — 409 | P0 | 1. CSV header `count,quantity` (no `sku`). Upload. | HTTP 409. Message: `"Missing required columns: sku"`. `created=0`. | API | |
| TC-CBULK-191 | Admin | Missing `count` column — 409 | P0 | 1. CSV header `sku,quantity` (no `count`). Upload. | HTTP 409. Message: `"Missing required columns: count"`. | API | |
| TC-CBULK-192 | Admin | Both sku and count missing — 409, both listed | P0 | 1. CSV header `quantity` only. Upload. | HTTP 409. Message: `"Missing required columns: sku, count"`. | API | |
| TC-CBULK-193 | Admin | Empty CSV (header only, no data rows) — 409 | P0 | 1. CSV: `sku,count` with no data rows. Upload. | HTTP 409. Message: `"CSV file is empty. Please add child box rows below the header."`. | API | |
| TC-CBULK-194 | Admin | Invalid CSV file (binary xlsx) — 409 | P1 | 1. Upload a `.xlsx` binary file as the `file` field with `mimeType text/csv`. | HTTP 409 or 400. Message: `"Invalid CSV format"`. | API | `csv-parse/sync` throws; caught as `ConflictError` |
| TC-CBULK-195 | Admin | No file field — 400 | P0 | 1. `POST /api/v1/child-boxes/bulk-upload` with empty multipart body (no `file` field). | HTTP 400. Message: `"No CSV file provided"`. | API | Controller checks `req.file` |
| TC-CBULK-196 | Admin | Wrong MIME type (.txt extension) rejected by multer | P1 | 1. Upload CSV content with MIME type `text/plain` and filename `upload.txt`. | HTTP 4xx. Not 201. | API; E2E (TC-CB-ERR-004 in spec 29) | `csvUpload` middleware enforces MIME |
| TC-CBULK-197 | Admin | Oversized file (>10 MB) — 4xx from multer | P2 | 1. Upload an ~11 MB file. | HTTP 413 or other 4xx. Not 201. | API; E2E (TC-CB-ERR-006 in spec 29) | Multer size limit |

### 5.6 — RBAC deny and Unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-200 | Dispatch Operator | Dispatch Operator cannot use CSV bulk upload — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk-upload` with valid CSV. | HTTP 403. No boxes created. | API; E2E (TC-CB-ROLE-003 in spec 29) | Dispatch Op lacks `child_boxes:create` |
| TC-CBULK-201 | Unauthenticated | No token — 401 | P0 | 1. `POST /api/v1/child-boxes/bulk-upload` with no auth header. | HTTP 401. | API | |

### 5.7 — createdBarcodes response field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-205 | Admin | createdBarcodes contains exactly the created barcodes | P0 | 1. CSV: row 1 `<SKU_A>,1,2`, row 2 `BADSKU,1,1` (error), row 3 `<SKU_B>,1,3`. Upload. | HTTP 201. `created=5`. `createdBarcodes` length=5. Entries from row 2 absent. All entries match `^CB[0-9A-HJKMNP-TV-Z]{6}$`. Each corresponds to a real DB row (verify via `GET /qr/<barcode>`). | Integration | |
| TC-CBULK-206 | Admin | createdBarcodes empty when all rows fail | P1 | 1. CSV with 3 rows all non-existent SKUs. Upload. | HTTP 201. `created=0`. `createdBarcodes=[]`. `errors` has 3 entries. | API | |

### 5.8 — Audit log for CSV upload

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-210 | Admin | One CREATE_CHILD_BOX audit log per box (not per row, not one summary) | P1 | 1. Upload CSV: 1 row `<SKU_A>,1,3` (creates 3 boxes). Note 3 returned IDs. 2. `SELECT COUNT(*) FROM audit_log WHERE action='CREATE_CHILD_BOX' AND entity_id IN (<id1>,<id2>,<id3>)`. | COUNT=3. Each box has its own `CREATE_CHILD_BOX` audit entry with `new_values.source='csv_bulk_upload'`. | Integration | Per-box audit, not a single bulk summary |
| TC-CBULK-211 | Admin | Audit log new_values contains source field | P1 | 1. Upload 1-row CSV `<SKU_A>,1,1`. 2. Inspect the `audit_log` entry for the created box. | `new_values.source = 'csv_bulk_upload'`. `new_values` also contains `{product_id, sku, quantity, barcode}`. | Integration | |
| TC-CBULK-212 | Admin | CHILD_CREATED inventory transaction per box with CSV note | P0 | 1. Upload 1-row CSV. Note barcode. 2. Look up box ID. 3. `SELECT notes FROM inventory_transactions WHERE child_box_id = $1 AND transaction_type = 'CHILD_CREATED'`. | `notes` contains `"CSV bulk import: child box generated (label printed) with barcode <barcode>"`. | Integration | E2E (TC-CB-UPLOAD-003 in spec 29) |

---

## Section 6 — Route registration sanity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-220 | Admin | `/child-boxes/bulk-upload/sample` not matched as `/:id` param | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200. CSV returned. NOT 400 "Invalid child box ID format". The string `bulk-upload` is not treated as a UUID `:id`. | API | Sample and bulk-upload routes registered before `/:id` in `childBox.routes.ts` |
| TC-CBULK-221 | Admin | `POST /child-boxes/bulk-upload` not shadowed by `/:id` param matcher | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-upload` with valid CSV. | HTTP 201 (bulk-upload result). NOT 400 "Invalid child box ID format". | API | |
| TC-CBULK-222 | Admin | `POST /child-boxes/bulk` is distinct from `POST /child-boxes/bulk-multi-size` | P1 | 1. `POST /api/v1/child-boxes/bulk` with no `sizes` field, body has `count`. 2. `POST /api/v1/child-boxes/bulk-multi-size` with `sizes` array and no `count`. | Each endpoint responds correctly to its own schema. `/bulk` rejects `sizes` input (or ignores it); `/bulk-multi-size` rejects `count` input without `sizes`. | API | Route ordering sanity |

---

## Section 7 — E2E: Generate Labels page (`/child-boxes/generate`)

### 7.1 — Access control

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-250 | Admin | Admin can access `/child-boxes/generate` | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes/generate`. | Page loads. Form visible. No redirect. | E2E | `useCan('child_boxes:create')` check |
| TC-CBULK-251 | Supervisor | Supervisor can access `/child-boxes/generate` | P1 | 1. Login as Supervisor. 2. Navigate to `/child-boxes/generate`. | Page loads. Form visible. | E2E | |
| TC-CBULK-252 | Warehouse Operator | Warehouse Operator can access `/child-boxes/generate` | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/child-boxes/generate`. | Page loads. Form visible. | E2E | |
| TC-CBULK-253 | Dispatch Operator | Dispatch Operator redirected away from `/child-boxes/generate` | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/child-boxes/generate`. | Redirected to `/inventory` (via `router.replace(ROUTES.INVENTORY)` when `!canCreate`). Page does not render the form. | E2E | `useCan('child_boxes:create')` is false for Dispatch Op |

### 7.2 — Form flow — article, colour, size selection

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-255 | Admin | Searchable article dropdown filters by article name | P1 | 1. On `/child-boxes/generate`. 2. Type a partial article name in the search box. | Dropdown narrows to matching articles. Non-matching articles disappear. | E2E | `searchTerm` filter in `articleOptions` useMemo |
| TC-CBULK-256 | Admin | Selecting an article loads colour selector | P1 | 1. Select an article from dropdown. | Colour selector appears below. Available colours loaded from `GET /products/colours/{productId}`. | E2E | |
| TC-CBULK-257 | Admin | Selecting a colour loads size grid | P1 | 1. Select article, then select a colour. | Size grid table appears with columns: Size, MRP, No. of Labels. Sizes loaded from `GET /products/sizes/{productId}`. | E2E | Sizes sorted numerically |
| TC-CBULK-258 | Admin | Sizes sorted numerically ascending | P1 | 1. Select article+colour for a product with sizes 6, 7, 8, 9, 10. | Sizes displayed in numeric order: 6, 7, 8, 9, 10. | E2E | `parseFloat` sort in `sortedSizes` |
| TC-CBULK-259 | Admin | Summary card shows total labels and selected sizes | P1 | 1. Enter counts in size grid: size 6=3, size 7=2. | Summary card appears: "Sizes selected: 6 (×3), 7 (×2)". "Total labels: 5". | E2E | `sizeSummary` computed field |
| TC-CBULK-260 | Admin | Confirm & Generate button disabled when total = 0 | P1 | 1. Navigate to generate page. Ensure size grid visible. Leave all counts at 0. | "Confirm & Generate" button is disabled. | E2E | `disabled={sizeSummary.total === 0 \|\| !effectiveProductId}` |

### 7.3 — Frontend cap enforcement

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-265 | Admin | Total labels > 500 shows validation error (default cap) | P0 | Pre-condition: `NEXT_PUBLIC_CHILD_BOX_MAX` not set (defaults to 500). 1. Enter size counts summing to 501. 2. Click "Confirm & Generate". | Form validation error: `"Total labels must not exceed 500"`. API call NOT made. | E2E | FE reads `Number(process.env.NEXT_PUBLIC_CHILD_BOX_MAX) \|\| 500` |
| TC-CBULK-266 | Admin | Total labels = 500 is accepted by FE (boundary) | P1 | 1. Enter size counts summing to exactly 500. 2. Click "Confirm & Generate". | No client-side validation error. API call made. | E2E | |
| TC-CBULK-267 | Admin | FE cap of 1500 on live build (NEXT_PUBLIC_CHILD_BOX_MAX=1500) | P1 | Pre-condition: frontend built with `NEXT_PUBLIC_CHILD_BOX_MAX=1500`. 1. Enter counts summing to 1001. 2. Submit. | No FE error for 1001 (within 1500 cap). API called. Backend accepts up to 1500. | E2E; Integration | AUTOMATION GAP — env-gated cap test not in spec 29 |

### 7.4 — Success state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-270 | Admin | Successful generation shows "Labels Generated" screen | P0 | 1. Fill form with valid article/colour/sizes. 2. Submit. | Page transitions to success state: "Labels Generated" header, count badge, size breakdown badges (e.g., "Size 6 × 3"). Green check icon visible. | E2E | `generatedBoxes.length > 0` triggers success render |
| TC-CBULK-271 | Admin | Success screen shows first 16 barcode previews | P1 | 1. Generate 20+ boxes. 2. Inspect success screen. | At most 16 barcode cards shown. Remaining count shown as "+N more". Each card shows barcode text (short `CB######` format) and SKU/size. | E2E | `generatedBoxes.slice(0, 16)` + "+N more" |
| TC-CBULK-272 | Admin | "Print Labels" button calls printChildBoxLabels | P1 | 1. After successful generation, click "Print Labels". | `printChildBoxLabels(generatedBoxes)` called. Print dialog triggered (or label HTML rendered for print). No per-box QR PNG fetch needed (barcodes available immediately). | E2E | |
| TC-CBULK-273 | Admin | "Generate More" button resets form | P1 | 1. After generation success. 2. Click "Generate More". | Form state resets: `generatedBoxes=[]`, `productId=''`, `sizeQuantities={}`, `quantity=1`. Page returns to form view. | E2E | |
| TC-CBULK-274 | Admin | Success toast shown after generation | P0 | 1. Submit valid form. | Toast: `"Child boxes created successfully"`. | E2E | `successMessage` in `useApiMutation` options |

### 7.5 — Validation errors in form

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-278 | Admin | No product selected — validation error | P1 | 1. Click "Confirm & Generate" without selecting a product. | Error: `"Please select a product"` below the article dropdown. | E2E | `if (!effectiveProductId)` |
| TC-CBULK-279 | Admin | Quantity < 1 — validation error | P1 | 1. Set quantity to 0. 2. Submit. | Error: `"Quantity must be at least 1"` below the quantity field. | E2E | |
| TC-CBULK-280 | Admin | No sizes entered — validation error | P1 | 1. Select article+colour. Leave all size counts at 0. 2. Submit. | Error: `"Enter at least one size quantity"`. | E2E | `if (sizeSummary.total === 0)` |

---

## Section 8 — E2E: Bulk Import modal on `/child-boxes`

### 8.1 — Visibility by role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-300 | Admin | "Bulk Import" button visible on `/child-boxes` | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes`. | "Bulk Import" button visible. | E2E; E2E (TC-CB-UI-001 in spec 29) | `isManager` guard on page |
| TC-CBULK-301 | Supervisor | Supervisor sees "Bulk Import" button | P0 | 1. Login as Supervisor. 2. Navigate to `/child-boxes`. | "Bulk Import" button visible. | E2E | |
| TC-CBULK-302 | Warehouse Operator | Warehouse Operator does NOT see "Bulk Import" button | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/child-boxes`. | "Bulk Import" button NOT visible. "Generate Labels" button IS visible. | E2E | `isManager` check (not pure RBAC — UI hides it from non-managers even though WH Op can call the API) |
| TC-CBULK-303 | Dispatch Operator | Dispatch Operator does NOT see "Bulk Import" button | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/child-boxes`. | "Bulk Import" button NOT visible. | E2E | |

### 8.2 — Modal elements

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-308 | Admin | Bulk Import opens modal with file input | P0 | 1. On `/child-boxes` as Admin. 2. Click "Bulk Import". | Modal opens. Contains file input (`input[type="file"]`). | E2E; E2E (TC-CB-UI-002 in spec 29) | |
| TC-CBULK-309 | Admin | Modal contains "Download Sample" element | P0 | 1. Open Bulk Import modal. | A button or link labelled "Download" visible in the modal. | E2E; E2E (TC-CB-UI-004 in spec 29) | Triggers `GET /child-boxes/bulk-upload/sample` |
| TC-CBULK-310 | Admin | "Download Sample" triggers CSV download | P1 | 1. Open Bulk Import modal. 2. Click "Download Sample" / "Download". | Browser downloads `child-boxes-bulk-upload-sample.csv`. File contains `sku`, `quantity`, `count` columns and 3 data rows. | E2E | |

### 8.3 — Upload and results

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-315 | Admin | Valid CSV upload shows success indicator | P0 | 1. Open Bulk Import modal. 2. Attach a valid 1-row CSV. 3. Click Upload/Import. | `POST /child-boxes/bulk-upload` returns 201. Results panel shows success (e.g., "N child boxes created" or success text). Table refreshes with new GENERATED boxes. | E2E; E2E (TC-CB-UI-003 in spec 29) | |
| TC-CBULK-316 | Admin | Upload with errors shows error rows in results | P1 | 1. CSV: 1 bad row (BADSKU) + 2 good rows. Upload. | Results panel: `created = 2`, error section lists the bad-SKU row and its error message. | E2E | |
| TC-CBULK-317 | Admin | Success toast shown after upload | P1 | 1. Upload valid CSV. | Toast shown containing "created" or "success". | E2E | |
| TC-CBULK-318 | Admin | "Download Created Barcodes" button appears after successful upload | P0 | 1. Upload valid CSV (results show at least 1 created). | "Download Created Barcodes" button visible in results panel. | E2E | Guard: `bulkResult.createdBarcodes.length > 0` |
| TC-CBULK-319 | Admin | "Download Created Barcodes" downloads barcode CSV file | P0 | 1. After successful upload, click "Download Created Barcodes". | Browser downloads file named `child-boxes-created-YYYY-MM-DD.csv`. File has `barcode` header row. Subsequent rows are `CB######` barcodes. | E2E | In-browser Blob CSV |
| TC-CBULK-320 | Admin | Download Created Barcodes absent when all rows fail | P1 | 1. Upload CSV where all rows fail. | "Download Created Barcodes" button NOT visible. `createdBarcodes=[]`. | E2E | |
| TC-CBULK-321 | Admin | Closing and reopening modal resets state | P1 | 1. Upload CSV, observe results. 2. Close modal. 3. Click "Bulk Import" again. | Modal opens fresh: no file selected, no results, no error entries, "Download Created Barcodes" absent. | E2E | `closeBulkModal` resets `bulkResult` + `bulkFile` |

### 8.4 — Drag-drop and file type rejection

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CBULK-325 | Admin | Drag-drop CSV accepted | P2 | 1. Open Bulk Import modal. 2. Drag a `.csv` file into upload zone. Drop it. | File accepted. Filename displayed or upload zone reflects it. Upload button activates. | E2E | |
| TC-CBULK-326 | Admin | Drag-drop non-CSV file rejected or warned | P2 | 1. Open Bulk Import modal. 2. Drag a `.xlsx` file into upload zone. | File rejected or warning shown. Upload button not activated. | E2E | |

---

## Automation gap summary

| Gap ID | Endpoint / scenario | Recommended spec | Priority |
|---|---|---|---|
| GAP-CBULK-01 | `POST /child-boxes/bulk` — unauthenticated 401 | Add to spec 29 (TC-CB-ROLE section) | P0 |
| GAP-CBULK-02 | `POST /child-boxes/bulk-multi-size` — unauthenticated 401 | Add to spec 29 | P0 |
| GAP-CBULK-03 | `GET /child-boxes/bulk-upload/sample` — Warehouse Operator gets 200 (corrected from old 403) | Update TC-CB-ROLE-002 in spec 29 | P0 |
| GAP-CBULK-04 | `POST /child-boxes/bulk-upload` — Warehouse Operator gets 201 (corrected from old 403) | Update spec 29 ROLE section | P0 |
| GAP-CBULK-05 | `POST /child-boxes/bulk-multi-size` — env-gated 1500 cap test (CHILD_BOX_MAX_PER_GENERATION=1500) | New spec or env-aware test in spec 29 | P1 |
| GAP-CBULK-06 | Frontend generate page — env-gated FE cap (NEXT_PUBLIC_CHILD_BOX_MAX=1500) | New E2E spec | P1 |
| GAP-CBULK-07 | `POST /child-boxes/bulk-multi-size` — `qr_data_uri=""` assertion | Add to spec 29 or new API spec | P1 |
| GAP-CBULK-08 | Batched INSERT vs per-row INSERT — DB query count verification | Manual / DB query log assertion | P2 |
