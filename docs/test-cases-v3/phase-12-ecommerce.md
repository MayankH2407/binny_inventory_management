# Phase 12 — E-commerce Module

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `TC-EC-NNN` (all sections)
**Phase dependencies:** Phase 07 (child-box lifecycle), Phase 10 (master cartons). FREE/GENERATED boxes and ACTIVE cartons must exist.
**Refreshed:** 2026-06-09 (Session A12 — full re-author against current codebase)
**Realizing Playwright specs:** `32-ecommerce-module.spec.ts`, `36-ecommerce-scan-carton-and-stock.spec.ts`

---

## Known RBAC Discrepancies (document, do not fix)

1. **GET endpoints are auth-only (no permission gate):** `GET /ecommerce`, `GET /ecommerce/:id`, `GET /ecommerce/qr/:barcode`, `GET /ecommerce/:id/children`, `GET /ecommerce/:id/assortment`, and `GET /ecommerce/stock-summary` have **no `authorizePermission` middleware** — only `authenticate`. Any logged-in role (Supervisor, Warehouse Operator, Dispatch Operator) gets HTTP 200 from the API even though `ecommerce:*` is not in their seeded permissions.
2. **Frontend stock page (`/ecommerce/stock`) uses `useCan('ecommerce:read')` for rendering.** Since `ecommerce:read` is not seeded for non-Admin roles, the page renders an "Access Denied" card for Supervisor / Warehouse Operator / Dispatch Operator. The underlying API still returns 200 for those roles. Explicit TCs cover both layers.
3. **Admin seed does not include `ecommerce:*` rows in `role_permissions`.** Admin bypasses permission checks via the super-admin shortcut (`role_name === 'Admin'` in `authorizePermission`). So Admin always passes.
4. **Barcode format is `EC[6 alphanumeric]` (short format)** — not the legacy `BINNY-EC-<uuid>`. The old phase file listed the old format; corrected below.
5. **Create UI requires at least 1 scanned box before submitting** (frontend guard: `toast.error('Scan at least one child box')`). The API itself does not require boxes — `POST /ecommerce` with no `child_box_barcodes` creates a CREATED record.

---

## Shared Test Data Symbols

| Symbol | Meaning |
|---|---|
| `CB_FREE_1..N` | FREE child boxes |
| `CB_GEN_1` | GENERATED child box |
| `CB_PACKED_1` | PACKED child box (in a master carton) |
| `CB_SAMPLE_1` | SAMPLE-status child box (in a sample record) |
| `CB_EC_1` | Already in an e-commerce record (status ECOMMERCE) |
| `EC_ACTIVE_UUID` | An ACTIVE e-commerce record with ≥ 2 child boxes |
| `EC_CLOSED_UUID` | A CLOSED e-commerce record |
| `EC_CREATED_UUID` | A CREATED (empty) e-commerce record |
| `MC_ACTIVE_UUID` | An ACTIVE master carton with ≥ 2 PACKED child boxes |
| `MC_DISPATCHED_UUID` | A DISPATCHED master carton |
| `MC_EMPTY_UUID` | A CREATED master carton with zero packed boxes |
| API base | `http://localhost:5000/api/v1` |
| Barcode format | `EC[6 alphanumeric uppercase]` e.g. `ECAB12CD` |

---

## Table of Contents

1. [Section 1 — Create e-commerce record](#section-1--create-e-commerce-record-post-ecommerce)
2. [Section 2 — Add box to e-commerce record](#section-2--add-box-post-ecommerceadd-box)
3. [Section 3 — Scan carton to e-commerce record](#section-3--scan-carton-post-ecommercescan-carton)
4. [Section 4 — Remove box from e-commerce record](#section-4--remove-box-post-ecommerceremove-box)
5. [Section 5 — Close e-commerce record](#section-5--close-e-commerce-record-post-ecommerceidclose)
6. [Section 6 — Full unpack](#section-6--full-unpack-post-ecommerceidfull-unpack)
7. [Section 7 — Read endpoints](#section-7--read-endpoints)
8. [Section 8 — E-commerce stock summary](#section-8--e-commerce-stock-summary-get-ecommercestock-summary)
9. [Section 9 — Status lifecycle and mutual exclusivity](#section-9--status-lifecycle-and-mutual-exclusivity)
10. [Section 10 — Transaction log correctness](#section-10--transaction-log-correctness)
11. [Section 11 — UI smoke — list page](#section-11--ui-smoke--list-page-ecommerce)
12. [Section 12 — UI smoke — create page](#section-12--ui-smoke--create-page-ecommercecreate)
13. [Section 13 — UI smoke — detail page](#section-13--ui-smoke--detail-page-ecommerceid)
14. [Section 14 — UI smoke — stock page](#section-14--ui-smoke--stock-page-ecommercestock)

---

## Section 1 — Create e-commerce record (POST /ecommerce)

> **Permission gate:** `ecommerce:create`. Admin bypasses via super-admin. Supervisor / Warehouse Op / Dispatch Op get 403 by default.
> **Body schema (Zod):** `name` string min(1) max(200) required; `marketplace` string max(100) optional; `order_reference` string max(200) optional; `listing_sku` string max(100) optional; `mapped_date` ISO datetime or YYYY-MM-DD optional; `notes` string max(2000) optional; `child_box_barcodes` string array optional (transformed to UPPER).
> **On success:** HTTP 201. Response includes `qr_barcode` field (= the generated barcode). Barcode format `EC[6 alphanumeric]`.

### 1.1 — Happy path creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-001 | Admin | Create empty e-commerce record — name only | P0 | 1. Login as Admin. 2. `POST /api/v1/ecommerce` body `{"name": "Amazon Q4 Batch"}`. | HTTP 201. Response body `data`: `id` UUID, `ecommerce_barcode` matches `^EC[A-Z0-9]{6}$`, `name` = "Amazon Q4 Batch", `status` = "CREATED", `child_count` = 0, `marketplace` = null, `order_reference` = null, `listing_sku` = null, `mapped_date` = null, `notes` = null, `qr_barcode` present and equals `ecommerce_barcode`. `inventory_transactions` row `ECOMMERCE_CREATED` with notes containing the barcode. | Integration | Realizing: TC-EC-CREATE-001 in spec 32. `qr_barcode` field is set in service return. |
| TC-EC-002 | Admin | Create e-commerce record with all optional fields | P0 | 1. `POST /api/v1/ecommerce` body `{"name": "Flipkart May", "marketplace": "Flipkart", "order_reference": "FK-2026-001", "listing_sku": "BS-6-BLU-FK", "mapped_date": "2026-04-30", "notes": "Priority shipment"}`. | HTTP 201. `marketplace` = "Flipkart", `order_reference` = "FK-2026-001", `listing_sku` = "BS-6-BLU-FK", `mapped_date` = "2026-04-30", `notes` = "Priority shipment". | API | Realizing: TC-EC-CREATE-002 in spec 32. |
| TC-EC-003 | Admin | Create e-commerce record with initial FREE child boxes | P0 | 1. Pre-condition: 2 FREE boxes `CB_FREE_1` (barcode `CB_BAR_1`), `CB_FREE_2` (barcode `CB_BAR_2`). 2. `POST /api/v1/ecommerce` body `{"name": "Amazon Batch", "child_box_barcodes": ["<CB_BAR_1>", "<CB_BAR_2>"]}`. | HTTP 201. `status` = "ACTIVE". `child_count` = 2. Both boxes have `status` = "ECOMMERCE". `inventory_transactions`: 0 `ECOMMERCE_CREATED` rows (the code path with boxes does NOT write ECOMMERCE_CREATED; that transaction is only in the no-barcodes path). 2 `CHILD_ECOMMERCED` rows. `ecommerce_box_mapping` 2 rows. | Integration | Code path: when barcodes are provided, the create function does NOT write ECOMMERCE_CREATED — that row only appears in the simple (no-barcodes) path. |
| TC-EC-004 | Admin | Create with GENERATED box — auto-activates box | P0 | 1. `CB_GEN_1` is GENERATED. 2. `POST /api/v1/ecommerce` body `{"name": "Meesho Batch", "child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status` = "ACTIVE". `child_count` = 1. `CB_GEN_1` status = ECOMMERCE. `inventory_transactions`: `CHILD_ACTIVATED` (notes: "auto-activated (implicit activation during add to e-commerce record...)") then `CHILD_ECOMMERCED` for that box. | Integration | Auto-activation on GENERATED boxes in the create path. |
| TC-EC-005 | Admin | Exactly one ECOMMERCE_CREATED transaction when creating with no boxes | P0 | 1. Create empty e-commerce record (no `child_box_barcodes`). 2. Query `inventory_transactions WHERE transaction_type = 'ECOMMERCE_CREATED'` filtered to this barcode. | Exactly 1 row (no duplicate-INSERT bug). | Integration | Realizing: TC-EC-CREATE-003 in spec 32. The with-boxes path intentionally omits this transaction. |

### 1.2 — Role gates on create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-010 | Supervisor | Supervisor cannot create e-commerce record (default role) | P0 | 1. Login as Supervisor. 2. `POST /api/v1/ecommerce` body `{"name": "Sup EC"}`. | HTTP 403. `message` contains "Required permission: ecommerce:create". No record created. | API | Realizing: TC-EC-ROLE in spec 32. Default role — Admin can grant `ecommerce:create` via Role Manager. |
| TC-EC-011 | Warehouse Operator | Warehouse Operator cannot create e-commerce record (default role) | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/ecommerce` body `{"name": "WH EC"}`. | HTTP 403. `message` contains "Required permission: ecommerce:create". No record created. | API | Realizing: TC-EC-ROLE-002 in spec 32. |
| TC-EC-012 | Dispatch Operator | Dispatch Operator cannot create e-commerce record | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/ecommerce` body `{"name": "DP EC"}`. | HTTP 403. No record created. | API | Realizing: TC-EC-ROLE-001 in spec 32. |
| TC-EC-013 | Unauthenticated | No token returns 401 on create | P0 | 1. `POST /api/v1/ecommerce` body `{"name": "X"}` with no Authorization header. | HTTP 401. | API | `authenticate` middleware runs first. |

### 1.3 — Validation errors on create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-015 | Admin | Create with missing name returns 400 | P0 | 1. `POST /api/v1/ecommerce` body `{}`. | HTTP 400. Zod error: "Name is required" (min(1)). | API | |
| TC-EC-016 | Admin | Create with empty string name returns 400 | P0 | 1. `POST /api/v1/ecommerce` body `{"name": ""}`. | HTTP 400. Zod min(1) validation error on `name`. | API | |
| TC-EC-017 | Admin | Create with name exceeding 200 chars returns 400 | P1 | 1. `POST /api/v1/ecommerce` body `{"name": "<201-char string>"}`. | HTTP 400. Zod max(200) error. | API | |
| TC-EC-018 | Admin | Create with marketplace exceeding 100 chars returns 400 | P1 | 1. `POST /api/v1/ecommerce` body `{"name": "X", "marketplace": "<101-char string>"}`. | HTTP 400. Zod max(100) error. | API | |
| TC-EC-019 | Admin | Create with non-existent box barcode returns 404 | P0 | 1. `POST /api/v1/ecommerce` body `{"name": "X", "child_box_barcodes": ["NONEXISTENTBARCODE"]}`. | HTTP 404. "Child box with barcode NONEXISTENTBARCODE not found". No record created (rolled back). | API | |
| TC-EC-020 | Admin | Create with PACKED box returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. `POST /api/v1/ecommerce` body `{"name": "X", "child_box_barcodes": ["<CB_PACKED_BAR>"]}`. | HTTP 400. "Child box ... is currently PACKED and cannot be added to an e-commerce record. Only FREE or GENERATED boxes can be added." No record created. | API | |
| TC-EC-021 | Admin | Create with SAMPLE-status box returns 400 | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Include in create. | HTTP 400. "currently SAMPLE and cannot be added". No record created. | API | |
| TC-EC-022 | Admin | Create with ECOMMERCE-status box returns 400 | P0 | 1. `CB_EC_1` is ECOMMERCE. 2. Include in create. | HTTP 400. "currently ECOMMERCE and cannot be added". | API | |

---

## Section 2 — Add box (POST /ecommerce/add-box)

> **Permission gate:** `ecommerce:update`. Body: `{ child_box_id: UUID, ecommerce_record_id: UUID }`.
> **On success:** HTTP 200. Response `{ record: {...}, mapping: {...} }`. Box status → ECOMMERCE. `ecommerce_box_mapping` row inserted.

### 2.1 — Happy path add-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-030 | Admin | Admin adds FREE box to ACTIVE record | P0 | 1. `EC_ACTIVE_UUID` is ACTIVE, `child_count` = N. `CB_FREE_NEW` is FREE. 2. `POST /api/v1/ecommerce/add-box` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "ecommerce_record_id": "<EC_ACTIVE_UUID>"}`. | HTTP 200. `data.record.status` = "ACTIVE", `data.record.child_count` = N+1. `data.mapping.is_active` = true, `data.mapping.ecommerce_record_id` = `<EC_ACTIVE_UUID>`. Box status = ECOMMERCE. `inventory_transactions` row `CHILD_ECOMMERCED`. | Integration | Realizing: TC-EC-BOX-001 in spec 32. |
| TC-EC-031 | Admin | Add FREE box to CREATED record transitions it to ACTIVE | P0 | 1. `EC_CREATED_UUID` is CREATED (child_count = 0). `CB_FREE_A` is FREE. 2. Add-box request. | HTTP 200. `record.status` = "ACTIVE". `record.child_count` = 1. | Integration | CREATED → ACTIVE on first box. |
| TC-EC-032 | Admin | Add GENERATED box auto-activates it then marks ECOMMERCE | P0 | 1. `CB_GEN_2` is GENERATED, `EC_ACTIVE_UUID` is ACTIVE. 2. Add-box request. | HTTP 200. `CB_GEN_2` status = ECOMMERCE. `inventory_transactions`: `CHILD_ACTIVATED` (notes: "auto-activated ... during add to e-commerce record ...") then `CHILD_ECOMMERCED`. | Integration | |

### 2.2 — Role gates on add-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-035 | Supervisor | Supervisor cannot add box (default role) | P0 | 1. Login as Supervisor. 2. Valid add-box request. | HTTP 403. "Required permission: ecommerce:update". Box status unchanged. | API | Default role. Admin can grant `ecommerce:update` via Role Manager. |
| TC-EC-036 | Warehouse Operator | Warehouse Operator cannot add box | P0 | 1. Login as Warehouse Operator. 2. Valid add-box request. | HTTP 403. Box unchanged. | API | |
| TC-EC-037 | Dispatch Operator | Dispatch Operator cannot add box | P0 | 1. Login as Dispatch Operator. 2. Valid add-box request. | HTTP 403. | API | |
| TC-EC-038 | Unauthenticated | No token returns 401 on add-box | P0 | 1. `POST /api/v1/ecommerce/add-box` valid body, no Authorization. | HTTP 401. | API | |

### 2.3 — Guard failures on add-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-040 | Admin | Add box to CLOSED record returns 400 | P0 | 1. `EC_CLOSED_UUID` is CLOSED. `CB_FREE_B` is FREE. 2. Add-box request. | HTTP 400. "E-commerce record is CLOSED and cannot accept new child boxes". | API | Same error format for DISPATCHED. |
| TC-EC-041 | Admin | Add box to DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Add-box request. | HTTP 400. "E-commerce record is DISPATCHED and cannot accept new child boxes". | API | |
| TC-EC-042 | Admin | Add PACKED box returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. Add to e-commerce. | HTTP 400. "currently PACKED and cannot be added to an e-commerce record. Only FREE or GENERATED boxes can be added." | API | Realizing: TC-EC-BOX-003 in spec 32. |
| TC-EC-043 | Admin | Add SAMPLE-status box returns 400 | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Add to e-commerce. | HTTP 400. "currently SAMPLE and cannot be added". | API | |
| TC-EC-044 | Admin | Add ECOMMERCE-status box (already mapped) returns 400 | P0 | 1. `CB_EC_1` is ECOMMERCE in another record. 2. Add to this record. | HTTP 400. "currently ECOMMERCE and cannot be added". | API | |
| TC-EC-045 | Admin | Add non-existent child box returns 404 | P1 | 1. `child_box_id` = all-zeros UUID. | HTTP 404. "Child box not found". | API | |
| TC-EC-046 | Admin | Add box to non-existent record returns 404 | P1 | 1. `ecommerce_record_id` = all-zeros UUID, valid child box. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-047 | Admin | Non-UUID ids in add-box body return 400 | P1 | 1. `POST /api/v1/ecommerce/add-box` body `{"child_box_id": "bad", "ecommerce_record_id": "bad"}`. | HTTP 400. Zod UUID validation errors on both fields. | API | |

---

## Section 3 — Scan carton (POST /ecommerce/scan-carton)

> **Permission gate:** `ecommerce:update`. Body: `{ ecommerce_record_id: UUID, carton_barcode: string (min 1, uppercased) }`.
> **Effect (atomic transaction):** all `carton_child_mapping` rows for the carton are deactivated; boxes → ECOMMERCE; `ecommerce_box_mapping` rows inserted; carton `child_count` decremented (→ 0 if fully emptied; `status` → CREATED if was non-DISPATCHED and now empty); e-commerce record `child_count` grows (status → ACTIVE if was CREATED).
> **Transaction writes per box:** `CHILD_UNPACKED` (with `master_carton_id`, notes "scan-to-e-commerce") + `CHILD_ECOMMERCED` (notes "via carton ...").
> **Route order:** `/scan-carton` is a literal POST path — does NOT conflict with `/:id` since it's a different HTTP verb and path.

### 3.1 — Happy path scan-carton

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-050 | Admin | Scan active carton moves all packed boxes to e-commerce record | P0 | 1. `MC_ACTIVE_UUID` is ACTIVE with 4 PACKED boxes. `EC_ACTIVE_UUID` is ACTIVE with 2 boxes. 2. `POST /api/v1/ecommerce/scan-carton` body `{"ecommerce_record_id": "<EC_ACTIVE_UUID>", "carton_barcode": "<MC_BARCODE>"}`. | HTTP 200. `data.added` = 4. `data.cartonBarcode` = `<MC_BARCODE>`. `data.record.child_count` = 6. `data.record.status` = "ACTIVE". All 4 boxes now `status` = "ECOMMERCE". Master carton `child_count` = 0, `status` = "CREATED". `ecommerce_box_mapping` 4 new `is_active = true` rows. `carton_child_mapping` 4 rows `is_active = false`. | Integration | Realizing: TC-EC-SCAN-001 in spec 36. Atomicity: all-or-nothing transaction. |
| TC-EC-051 | Admin | Scan carton to CREATED record transitions it to ACTIVE | P0 | 1. `EC_CREATED_UUID` is CREATED (child_count = 0). `MC_ACTIVE_UUID` has 3 boxes. 2. scan-carton request. | HTTP 200. `data.record.status` = "ACTIVE". `data.record.child_count` = 3. `data.added` = 3. | Integration | Realizing: TC-EC-SCAN-002 in spec 36. |
| TC-EC-052 | Admin | Scan single-box carton empties carton and increments record | P0 | 1. Single-box carton. CREATED e-commerce record. 2. scan-carton request. | HTTP 200. `data.added` = 1. `data.record.child_count` = 1. Carton `child_count` = 0, status = "CREATED". Box status = ECOMMERCE. | Integration | Realizing: TC-EC-SCAN-002 variant in spec 36. |
| TC-EC-053 | Admin | Scan CLOSED carton (non-DISPATCHED) succeeds — moves boxes | P1 | 1. Carton is CLOSED (not DISPATCHED) with 2 boxes. Valid e-commerce record. 2. scan-carton request. | HTTP 200. Boxes moved. Carton `child_count` = 0. Status check: carton status code only blocks DISPATCHED, not CLOSED. | Integration | Code: only `carton.status === MASTER_CARTON_STATUS.DISPATCHED` throws. CLOSED carton is permitted. |
| TC-EC-054 | Admin | Scan-carton transaction integrity: CHILD_UNPACKED + CHILD_ECOMMERCED per box | P0 | 1. Scan carton with 2 boxes. 2. Query `inventory_transactions WHERE child_box_id IN (<box1>, <box2>) AND transaction_type IN ('CHILD_UNPACKED', 'CHILD_ECOMMERCED') ORDER BY created_at`. | For each box: one `CHILD_UNPACKED` row (has `master_carton_id`, notes contain "scan-to-e-commerce") immediately followed by one `CHILD_ECOMMERCED` row (notes contain "via carton"). 4 rows total. | Integration | Realizing: TC-EC-119-A from old file. |

### 3.2 — Role gates on scan-carton

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-058 | Supervisor | Supervisor cannot scan carton (default role) | P0 | 1. Login as Supervisor. Valid scan-carton request. | HTTP 403. "Required permission: ecommerce:update". Carton and record unchanged. | API | Default role. Admin can grant `ecommerce:update`. |
| TC-EC-059 | Warehouse Operator | Warehouse Operator cannot scan carton | P0 | 1. Login as Warehouse Operator. Valid scan-carton request. | HTTP 403. | API | |
| TC-EC-060 | Dispatch Operator | Dispatch Operator cannot scan carton | P0 | 1. Login as Dispatch Operator. Valid scan-carton request. | HTTP 403. | API | |
| TC-EC-061 | Unauthenticated | No token returns 401 on scan-carton | P0 | 1. `POST /api/v1/ecommerce/scan-carton` valid body, no Authorization. | HTTP 401. | API | |

### 3.3 — Guard failures on scan-carton

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-063 | Admin | Scan carton to CLOSED record returns 400 | P0 | 1. `EC_CLOSED_UUID` is CLOSED. Valid carton. 2. scan-carton request. | HTTP 400. "E-commerce record is CLOSED and cannot accept new child boxes". Carton unchanged. | API | Realizing: TC-EC-SCAN-004 in spec 36. |
| TC-EC-064 | Admin | Scan carton to DISPATCHED record returns 400 | P0 | 1. Dispatched e-commerce record. Valid carton. 2. scan-carton request. | HTTP 400. "E-commerce record is DISPATCHED and cannot accept new child boxes". | API | |
| TC-EC-065 | Admin | Scan DISPATCHED carton returns 400 | P0 | 1. `MC_DISPATCHED_UUID` is DISPATCHED. Valid e-commerce record. 2. scan-carton request. | HTTP 400. "Master carton <BARCODE> is DISPATCHED and cannot be moved to e-commerce". | API | Realizing: TC-EC-SCAN-005 in spec 36. |
| TC-EC-066 | Admin | Scan empty carton (no packed boxes) returns 400 | P0 | 1. `MC_EMPTY_UUID` has `child_count` = 0 (no active `carton_child_mapping` rows). Valid e-commerce record. 2. scan-carton request. | HTTP 400. "Master carton <BARCODE> has no packed child boxes to add". | API | Realizing: TC-EC-SCAN-003 in spec 36. |
| TC-EC-067 | Admin | Scan non-existent carton barcode returns 404 | P0 | 1. `POST /api/v1/ecommerce/scan-carton` body `{"ecommerce_record_id": "<EC_ACTIVE_UUID>", "carton_barcode": "NONEXISTENT"}`. | HTTP 404. "No master carton found with barcode NONEXISTENT". | API | |
| TC-EC-068 | Admin | scan-carton with missing carton_barcode returns 400 | P1 | 1. Body `{"ecommerce_record_id": "<UUID>"}` (no carton_barcode). | HTTP 400. Zod: "Carton barcode is required" (min(1)). | API | |
| TC-EC-069 | Admin | scan-carton with non-UUID ecommerce_record_id returns 400 | P1 | 1. Body `{"ecommerce_record_id": "not-a-uuid", "carton_barcode": "EC123456"}`. | HTTP 400. Zod UUID error on `ecommerce_record_id`. | API | |
| TC-EC-070 | Admin | Non-existent e-commerce record in scan-carton returns 404 | P1 | 1. Body `{"ecommerce_record_id": "<all-zeros-UUID>", "carton_barcode": "<VALID_MC_BARCODE>"}`. | HTTP 404. "E-commerce record not found". | API | |

---

## Section 4 — Remove box (POST /ecommerce/remove-box)

> **Permission gate:** `ecommerce:update`. Body: `{ child_box_id: UUID, ecommerce_record_id: UUID }`.
> **On success:** HTTP 200. Updated record returned. Box → FREE. `ecommerce_box_mapping` row `is_active = false, unmapped_at` set. `CHILD_UNECOMMERCED` transaction written.

### 4.1 — Happy path remove-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-080 | Admin | Admin removes box from ACTIVE record | P0 | 1. `CB_EC_A` is ECOMMERCE in `EC_ACTIVE_UUID`. 2. `POST /api/v1/ecommerce/remove-box` body `{"child_box_id": "<CB_EC_A_UUID>", "ecommerce_record_id": "<EC_ACTIVE_UUID>"}`. | HTTP 200. Response is updated record: `status` = "ACTIVE", `child_count` = prev-1. `CB_EC_A` status = FREE. `ecommerce_box_mapping` row `is_active = false`, `unmapped_at` populated. `inventory_transactions` row `CHILD_UNECOMMERCED`. | Integration | Realizing: TC-EC-BOX-002 in spec 32. |
| TC-EC-081 | Admin | Remove last box from ACTIVE record transitions to CREATED + ECOMMERCE_REOPENED | P0 | 1. `EC_ACTIVE_UUID` has `child_count` = 1. 2. Remove that box. | HTTP 200. `record.status` = "CREATED". `child_count` = 0. Box = FREE. `inventory_transactions`: `CHILD_UNECOMMERCED` + `ECOMMERCE_REOPENED` (notes: "reverted to CREATED (all boxes removed)"). | Integration | Code: `if (newChildCount === 0 && record.status === ACTIVE) → ECOMMERCE_REOPENED`. |
| TC-EC-082 | Admin | Remove from CLOSED record allowed (status stays CLOSED) | P1 | 1. `EC_CLOSED_UUID` CLOSED with 2 boxes. 2. Remove one box. | HTTP 200. Box = FREE. `child_count` decremented. `status` remains "CLOSED". `CHILD_UNECOMMERCED` written. No ECOMMERCE_REOPENED (guard only triggers when status was ACTIVE). | Integration | Code: the ECOMMERCE_REOPENED guard is `record.status === ACTIVE` only. |

### 4.2 — Role gates on remove-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-085 | Supervisor | Supervisor cannot remove box (default role) | P0 | 1. Login as Supervisor. Valid remove-box request. | HTTP 403. "Required permission: ecommerce:update". Box status unchanged. | API | |
| TC-EC-086 | Warehouse Operator | Warehouse Operator cannot remove box | P0 | 1. Login as Warehouse Operator. Valid remove-box request. | HTTP 403. | API | |
| TC-EC-087 | Dispatch Operator | Dispatch Operator cannot remove box | P0 | 1. Login as Dispatch Operator. Valid remove-box request. | HTTP 403. | API | |
| TC-EC-088 | Unauthenticated | No token returns 401 on remove-box | P0 | 1. `POST /api/v1/ecommerce/remove-box` valid body, no Authorization. | HTTP 401. | API | |

### 4.3 — Guard failures on remove-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-090 | Admin | Remove from DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Remove request. | HTTP 400. "Cannot remove box from a dispatched e-commerce record". | API | |
| TC-EC-091 | Admin | Remove box not mapped to record returns 404 | P1 | 1. `CB_FREE_1` is FREE (not in record). 2. Remove-box referencing this box and `EC_ACTIVE_UUID`. | HTTP 404. "Active mapping not found for this child box and e-commerce record". | API | |
| TC-EC-092 | Admin | Non-UUID ids in remove-box body return 400 | P1 | 1. `POST /api/v1/ecommerce/remove-box` body `{"child_box_id": "bad", "ecommerce_record_id": "bad"}`. | HTTP 400. Zod UUID validation errors. | API | |

---

## Section 5 — Close e-commerce record (POST /ecommerce/:id/close)

> **Permission gate:** `ecommerce:update`. Param: `id` UUID.
> **On success:** HTTP 200. `{ id, status: "CLOSED", closed_at: <ISO> }`. `ECOMMERCE_CLOSED` transaction written.

### 5.1 — Happy path close

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-100 | Admin | Admin closes ACTIVE e-commerce record | P0 | 1. `EC_ACTIVE_UUID` is ACTIVE with ≥ 1 box. 2. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/close`. | HTTP 200. `data.status` = "CLOSED". `data.closed_at` non-null ISO timestamp. `inventory_transactions` row `ECOMMERCE_CLOSED` (notes: "E-commerce record ... closed"). | Integration | Realizing: TC-EC-CLOSE-001 in spec 32. |

### 5.2 — Role gates on close

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-103 | Supervisor | Supervisor cannot close (default role) | P0 | 1. Login as Supervisor. Valid close request. | HTTP 403. "Required permission: ecommerce:update". Status unchanged. | API | |
| TC-EC-104 | Warehouse Operator | Warehouse Operator cannot close | P0 | 1. Login as Warehouse Operator. Valid close request. | HTTP 403. | API | |
| TC-EC-105 | Dispatch Operator | Dispatch Operator cannot close | P0 | 1. Login as Dispatch Operator. Valid close request. | HTTP 403. | API | |
| TC-EC-106 | Unauthenticated | No token returns 401 on close | P0 | 1. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/close` no Authorization. | HTTP 401. | API | |

### 5.3 — Guard failures on close

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-108 | Admin | Close already CLOSED record returns 400 | P0 | 1. `EC_CLOSED_UUID` is CLOSED. 2. Close again. | HTTP 400. "E-commerce record is already closed". | API | |
| TC-EC-109 | Admin | Close DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Close. | HTTP 400. "Cannot close a dispatched e-commerce record". | API | |
| TC-EC-110 | Admin | Close empty CREATED record returns 400 | P0 | 1. `EC_CREATED_UUID` has `child_count` = 0. 2. Close. | HTTP 400. "Cannot close an empty e-commerce record". | API | |
| TC-EC-111 | Admin | Close non-existent record returns 404 | P1 | 1. `POST /api/v1/ecommerce/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-112 | Admin | Close with non-UUID id returns 400 | P1 | 1. `POST /api/v1/ecommerce/not-a-uuid/close`. | HTTP 400. UUID validation error from Zod param schema. | API | |

---

## Section 6 — Full unpack (POST /ecommerce/:id/full-unpack)

> **Permission gate:** `ecommerce:update`. Param: `id` UUID.
> **On success:** HTTP 200. `{ id, status: "CREATED", child_count: 0 }`. All boxes → FREE. All `ecommerce_box_mapping` rows `is_active = false`. N × `CHILD_UNECOMMERCED` transactions written.

### 6.1 — Happy path full-unpack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-120 | Admin | Admin full-unpacks ACTIVE record | P0 | 1. `EC_ACTIVE_UUID` has 3 ECOMMERCE boxes. 2. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/full-unpack`. | HTTP 200. `data.status` = "CREATED". `data.child_count` = 0. All 3 boxes = FREE. 3 `ecommerce_box_mapping` rows `is_active = false`, `unmapped_at` set. 3 `CHILD_UNECOMMERCED` transactions. | Integration | Realizing: TC-EC-UNPACK-001 in spec 32. |
| TC-EC-121 | Admin | Full-unpack CLOSED record releases boxes | P1 | 1. `EC_CLOSED_UUID` CLOSED with 2 boxes. 2. Full-unpack. | HTTP 200. `status` = "CREATED". `child_count` = 0. Both boxes FREE. 2 `CHILD_UNECOMMERCED` transactions. | Integration | Full-unpack allowed on CLOSED status. |

### 6.2 — Role gates on full-unpack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-124 | Supervisor | Supervisor cannot full-unpack (default role) | P0 | 1. Login as Supervisor. Valid full-unpack request. | HTTP 403. "Required permission: ecommerce:update". Record unchanged. | API | |
| TC-EC-125 | Warehouse Operator | Warehouse Operator cannot full-unpack | P0 | 1. Login as Warehouse Operator. Valid full-unpack request. | HTTP 403. | API | |
| TC-EC-126 | Dispatch Operator | Dispatch Operator cannot full-unpack | P0 | 1. Login as Dispatch Operator. Valid full-unpack request. | HTTP 403. | API | |
| TC-EC-127 | Unauthenticated | No token returns 401 on full-unpack | P0 | 1. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/full-unpack` no Authorization. | HTTP 401. | API | |

### 6.3 — Guard failures on full-unpack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-129 | Admin | Full-unpack DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Full-unpack. | HTTP 400. "Cannot unpack a dispatched e-commerce record". | API | |
| TC-EC-130 | Admin | Full-unpack CREATED (empty) record returns 400 | P0 | 1. `EC_CREATED_UUID` child_count = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty e-commerce record". Code: `record.status === ECOMMERCE_STATUS.CREATED` check. | API | |
| TC-EC-131 | Admin | Full-unpack non-existent record returns 404 | P1 | 1. `POST /api/v1/ecommerce/00000000-0000-0000-0000-000000000000/full-unpack`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-132 | Admin | Full-unpack with non-UUID id returns 400 | P1 | 1. `POST /api/v1/ecommerce/not-a-uuid/full-unpack`. | HTTP 400. UUID validation error. | API | |

---

## Section 7 — Read endpoints

> **All GET endpoints are `authenticate`-only — no `authorizePermission` call.** Any logged-in role gets 200. This is the documented discrepancy (§ Known RBAC Discrepancies #1).

### 7.1 — GET /ecommerce (list)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-140 | Admin | Admin gets paginated ecommerce list | P0 | 1. `GET /api/v1/ecommerce`. | HTTP 200. `{ data: [...], total: <n>, page: 1, limit: 25 }`. Each item: `id`, `ecommerce_barcode`, `name`, `marketplace`, `order_reference`, `listing_sku`, `mapped_date`, `status`, `child_count`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`, `created_at`. | API | Realizing: TC-EC-LIST-001 in spec 32. |
| TC-EC-141 | Admin | GET /ecommerce?status=ACTIVE filters correctly | P1 | 1. `GET /api/v1/ecommerce?status=ACTIVE`. | All items `status` = "ACTIVE". `total` reflects count of ACTIVE records only. | API | Realizing: TC-EC-LIST-003 in spec 32. |
| TC-EC-142 | Admin | GET /ecommerce?marketplace=flip does partial ILIKE match | P0 | 1. Pre-condition: record with `marketplace` = "Flipkart". 2. `GET /api/v1/ecommerce?marketplace=flip`. | Returns records with marketplace matching ILIKE `%flip%`. Record with "Flipkart" appears. | API | Realizing: TC-EC-LIST-002 in spec 32. |
| TC-EC-143 | Admin | GET /ecommerce?search=<order_reference> matches | P1 | 1. Pre-condition: record with `order_reference` = "FK-2026-001". 2. `GET /api/v1/ecommerce?search=FK-2026-001`. | Records with `ecommerce_barcode`, `name`, or `order_reference` matching ILIKE `%FK-2026-001%` returned. | API | Three-field search. |
| TC-EC-144 | Admin | Pagination: page + limit parameters work | P1 | 1. `GET /api/v1/ecommerce?page=2&limit=5`. | Returns at most 5 records. `page` = 2. Correct offset applied. | API | |
| TC-EC-145 | Supervisor | Supervisor can list e-commerce records — GET auth-only discrepancy | P0 | 1. Login as Supervisor. 2. `GET /api/v1/ecommerce`. | HTTP 200. Records returned. No 403 despite no `ecommerce:*` permission. | API | **RBAC discrepancy:** GET has no `authorizePermission` gate. |
| TC-EC-146 | Warehouse Operator | Warehouse Operator can list e-commerce records — GET auth-only discrepancy | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/ecommerce`. | HTTP 200. | API | RBAC discrepancy documented. |
| TC-EC-147 | Dispatch Operator | Dispatch Operator can list e-commerce records — GET auth-only discrepancy | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/ecommerce`. | HTTP 200. | API | RBAC discrepancy documented. |
| TC-EC-148 | Unauthenticated | No token returns 401 on list | P0 | 1. `GET /api/v1/ecommerce` no Authorization. | HTTP 401. | API | |

### 7.2 — GET /ecommerce/:id (detail)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-150 | Admin | GET /ecommerce/:id returns record with child_boxes | P0 | 1. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>`. | HTTP 200. `{ id, ecommerce_barcode, status: "ACTIVE", child_count: <n>, child_boxes: [...] }`. `child_boxes` length = `child_count`. Each child_box: `child_box_id`, `barcode`, `status`: "ECOMMERCE", `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`. | API | |
| TC-EC-151 | Admin | GET /ecommerce/non-existent-UUID returns 404 | P1 | 1. `GET /api/v1/ecommerce/00000000-0000-0000-0000-000000000000`. | HTTP 404. "E-commerce record not found". | API | Route order: `/stock-summary` (literal) before `/:id` (param). |
| TC-EC-152 | Admin | GET /ecommerce/stock-summary not shadowed by /:id | P0 | 1. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. Stock summary array returned (not a 400 UUID error). | API | **Route order test.** `/stock-summary` registered before `/:id` in `ecommerce.routes.ts`. |
| TC-EC-153 | Supervisor | Supervisor can read detail — GET auth-only discrepancy | P0 | 1. Login as Supervisor. 2. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>`. | HTTP 200. Record returned. | API | RBAC discrepancy. |
| TC-EC-154 | Warehouse Operator | Warehouse Operator can read detail | P0 | 1. Login as Warehouse Operator. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-155 | Dispatch Operator | Dispatch Operator can read detail | P0 | 1. Login as Dispatch Operator. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-156 | Unauthenticated | No token returns 401 on detail | P0 | 1. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>` no Authorization. | HTTP 401. | API | |

### 7.3 — GET /ecommerce/qr/:barcode

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-160 | Admin | GET /ecommerce/qr/:barcode returns record by barcode | P0 | 1. `GET /api/v1/ecommerce/qr/<BARCODE>` (e.g. `ECAB12CD`). | HTTP 200. `data.ecommerce_barcode` matches the barcode. `data.child_boxes` present. | API | Realizing: TC-EC-QR-001 in spec 32. Barcode uppercased by Zod transform. |
| TC-EC-161 | Admin | GET /ecommerce/qr/nonexistent returns 404 | P1 | 1. `GET /api/v1/ecommerce/qr/ECNONEXIST`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-162 | Supervisor | Supervisor can get by barcode — auth-only discrepancy | P0 | 1. Login as Supervisor. `GET /api/v1/ecommerce/qr/<BARCODE>`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-163 | Warehouse Operator | Warehouse Operator can get by barcode | P0 | 1. Login as Warehouse Operator. `GET /api/v1/ecommerce/qr/<BARCODE>`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-164 | Dispatch Operator | Dispatch Operator can get by barcode | P0 | 1. Login as Dispatch Operator. `GET /api/v1/ecommerce/qr/<BARCODE>`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-165 | Unauthenticated | No token returns 401 on qr lookup | P0 | 1. `GET /api/v1/ecommerce/qr/<BARCODE>` no Authorization. | HTTP 401. | API | |

### 7.4 — GET /ecommerce/:id/children

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-170 | Admin | GET /ecommerce/:id/children returns active mappings only | P0 | 1. Record has 2 active + 1 inactive (previously removed) mapping. 2. `GET /api/v1/ecommerce/<EC_ID>/children`. | Array of 2 items. Each: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `mapped_at`. Inactive (is_active=false) mapping excluded. | API | |
| TC-EC-171 | Supervisor | Supervisor can read children — auth-only discrepancy | P0 | 1. Login as Supervisor. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>/children`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-172 | Warehouse Operator | Warehouse Operator can read children | P0 | 1. Login as Warehouse Operator. Same. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-173 | Dispatch Operator | Dispatch Operator can read children | P0 | 1. Login as Dispatch Operator. Same. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-174 | Unauthenticated | No token returns 401 on children | P0 | 1. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>/children` no Authorization. | HTTP 401. | API | |

### 7.5 — GET /ecommerce/:id/assortment

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-180 | Admin | GET /ecommerce/:id/assortment returns correct grouping | P0 | 1. Record has 2 Size-6 Blue boxes + 1 Size-7 Blue box (same article). 2. `GET /api/v1/ecommerce/<EC_ID>/assortment`. | Array: `[{ article_name, colour: "Blue", size: "6", mrp, count: 2 }, { article_name, colour: "Blue", size: "7", mrp, count: 1 }]`. Ordered by article_name, colour, size. | API | |
| TC-EC-181 | Admin | Assortment for non-existent record returns 404 | P1 | 1. `GET /api/v1/ecommerce/00000000-0000-0000-0000-000000000000/assortment`. | HTTP 404. "E-commerce record not found". | API | Service checks record existence before aggregation. |
| TC-EC-182 | Supervisor | Supervisor can read assortment — auth-only discrepancy | P0 | 1. Login as Supervisor. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>/assortment`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-183 | Warehouse Operator | Warehouse Operator can read assortment | P0 | 1. Login as Warehouse Operator. Same. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-184 | Dispatch Operator | Dispatch Operator can read assortment | P0 | 1. Login as Dispatch Operator. Same. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-185 | Unauthenticated | No token returns 401 on assortment | P0 | 1. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>/assortment` no Authorization. | HTTP 401. | API | |

---

## Section 8 — E-commerce stock summary (GET /ecommerce/stock-summary)

> **Route:** `GET /api/v1/ecommerce/stock-summary` (registered before `/:id` to prevent shadowing).
> **Auth:** `authenticate` only — **no permission gate**. Any authenticated user gets 200.
> **Frontend:** `/ecommerce/stock` page uses `useCan('ecommerce:read')` — non-Admin roles see "Access Denied" on the UI page even though the API returns 200 for them (documented discrepancy).
> **Response:** array of `{ product_id, article_name, colour, size, sku, mrp, allocated_boxes, allocated_pairs, available_boxes, available_pairs }`. `allocated` = ECOMMERCE status. `available` = FREE or GENERATED. Products with no ECOMMERCE/FREE/GENERATED boxes excluded (HAVING clause).

### 8.1 — API happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-190 | Admin | GET /ecommerce/stock-summary returns 200 with array | P0 | 1. Login as Admin. 2. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. `data.success` = true. `data.data` is an array. | API | Realizing: TC-EC-STOCK-001 in spec 36. |
| TC-EC-191 | Admin | Stock-summary rows have all required fields | P0 | 1. Pre-condition: ≥ 1 box in ECOMMERCE status. 2. `GET /api/v1/ecommerce/stock-summary`. | At least 1 row. Each row has `product_id`, `article_name`, `colour`, `size`, `sku`, `mrp`, `allocated_boxes`, `allocated_pairs`, `available_boxes`, `available_pairs`. | API | Realizing: TC-EC-STOCK-002 in spec 36. |
| TC-EC-192 | Admin | allocated_boxes increments when box added to e-commerce | P0 | 1. Note baseline `allocated_boxes` for product P. 2. Add a box of product P to an e-commerce record. 3. Re-query stock-summary. | Row for product P: `allocated_boxes` = baseline + 1. `available_boxes` decreased by 1 (box moved from FREE to ECOMMERCE). | Integration | Realizing: TC-EC-STOCK-003 in spec 36. |
| TC-EC-193 | Admin | GENERATED boxes counted as available_boxes | P1 | 1. Product B has 1 GENERATED box and no other boxes. 2. `GET /api/v1/ecommerce/stock-summary`. | Row for Product B appears: `available_boxes` = 1, `available_pairs` = 1, `allocated_boxes` = 0. | API | GENERATED treated as available. |
| TC-EC-194 | Admin | Products with only PACKED or DISPATCHED boxes excluded from summary | P1 | 1. Product C has only PACKED boxes (no FREE/ECOMMERCE/GENERATED). 2. `GET /api/v1/ecommerce/stock-summary`. | Product C absent from response. HAVING clause only includes ECOMMERCE/FREE/GENERATED. | API | |
| TC-EC-195 | Admin | allocated_pairs uses quantity column per box | P1 | 1. Product D has 1 ECOMMERCE box with `quantity` = 6 pairs. 2. `GET /api/v1/ecommerce/stock-summary`. | Row for Product D: `allocated_pairs` = 6 (SUM of quantity WHERE status = ECOMMERCE). | API | SQL: `SUM(cb.quantity) FILTER (WHERE cb.status = $1)`. |
| TC-EC-196 | Admin | Scan-carton increases allocated_boxes by carton size | P0 | 1. Note baseline allocated for product P. 2. Scan an ACTIVE carton with 3 boxes of product P. 3. Re-query stock-summary. | `allocated_boxes` for product P = baseline + 3. Master carton boxes now ECOMMERCE. | Integration | End-to-end: scan-carton → stock-summary reflection. |

### 8.2 — Role gates on stock-summary API (discrepancy: all roles 200)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-200 | Supervisor | Supervisor can call stock-summary API — auth-only discrepancy | P0 | 1. Login as Supervisor. 2. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. Array returned. No 403. | API | **RBAC discrepancy #1.** No `authorizePermission` on this GET route. |
| TC-EC-201 | Warehouse Operator | Warehouse Operator can call stock-summary API | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-202 | Dispatch Operator | Dispatch Operator can call stock-summary API | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. | API | RBAC discrepancy. |
| TC-EC-203 | Unauthenticated | No token returns 401 on stock-summary | P0 | 1. `GET /api/v1/ecommerce/stock-summary` no Authorization. | HTTP 401. | API | |

---

## Section 9 — Status lifecycle and mutual exclusivity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-210 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty record → CREATED. 2. Add box → ACTIVE. 3. Close → CLOSED. 4. Dispatch (Phase 13 scope) → DISPATCHED. | Each step transitions correctly. `child_count` consistent at each step. | Integration | |
| TC-EC-211 | Admin | Mutual exclusivity: PACKED box cannot be added | P0 | 1. `CB_PACKED_1` is PACKED. 2. Attempt add-box. | HTTP 400. "currently PACKED". | API | |
| TC-EC-212 | Admin | Mutual exclusivity: SAMPLE box cannot be added | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Attempt add-box. | HTTP 400. "currently SAMPLE". | API | |
| TC-EC-213 | Admin | Mutual exclusivity: ECOMMERCE box cannot be added to a second record | P0 | 1. `CB_EC_1` is in `EC_ACTIVE_UUID`. 2. Attempt to add same box to different active record. | HTTP 400. "currently ECOMMERCE". | API | |
| TC-EC-214 | Admin | ECOMMERCE boxes excluded from pairsInStock | P0 | 1. Record `pairsInStock` for product P. 2. Add 5 boxes of P to e-commerce. 3. Re-query stock. | pairsInStock decreased by 5. ECOMMERCE boxes not counted as free stock. | Integration | |
| TC-EC-215 | Admin | Removing box from e-commerce restores it to pairsInStock | P1 | 1. Add 3 boxes to e-commerce. Note pairsInStock. 2. Remove 1 box. 3. Re-query. | pairsInStock increases by 1. | Integration | |
| TC-EC-216 | Admin | No repack endpoint exists on e-commerce | P1 | 1. `POST /api/v1/ecommerce/repack` (does not exist in routes). | HTTP 404. Route not found. | API | By design — e-commerce has no repack flow. |
| TC-EC-217 | Admin | CREATED record cannot be closed (empty guard) | P0 | 1. `EC_CREATED_UUID` has `child_count` = 0. 2. Close. | HTTP 400. "Cannot close an empty e-commerce record". | API | |
| TC-EC-218 | Admin | CREATED record cannot be full-unpacked (empty guard) | P0 | 1. `EC_CREATED_UUID` has `child_count` = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty e-commerce record". | API | Code: checks `status === CREATED` (not `child_count`). |

---

## Section 10 — Transaction log correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-220 | Admin | Create (no boxes) writes ECOMMERCE_CREATED | P0 | 1. Create empty record. 2. Query `inventory_transactions WHERE transaction_type = 'ECOMMERCE_CREATED'` for barcode in notes. | 1 row. `performed_by` = creator id. `notes` contains barcode. No `child_box_id`. | Integration | |
| TC-EC-221 | Admin | Create (with boxes) does NOT write ECOMMERCE_CREATED | P1 | 1. Create record with `child_box_barcodes`. 2. Query ECOMMERCE_CREATED for this barcode. | 0 rows. The with-boxes code path does not call the ECOMMERCE_CREATED INSERT. | Integration | Code discrepancy between the two create paths — document as expected behavior. |
| TC-EC-222 | Admin | Add box writes CHILD_ECOMMERCED | P0 | 1. Add box. 2. Query `CHILD_ECOMMERCED` for that `child_box_id`. | 1 row. `performed_by` = actor. Notes contain child barcode and record barcode. | Integration | |
| TC-EC-223 | Admin | Add GENERATED box writes CHILD_ACTIVATED then CHILD_ECOMMERCED (ordered) | P0 | 1. Add GENERATED box. 2. Query transactions for child box ordered by `created_at`. | `CHILD_ACTIVATED` first, `CHILD_ECOMMERCED` second. | Integration | |
| TC-EC-224 | Admin | Scan-carton writes CHILD_UNPACKED + CHILD_ECOMMERCED per box | P0 | 1. Scan carton with 2 boxes. 2. Query transactions for both box IDs. | 4 rows total. For each box: `CHILD_UNPACKED` (has `master_carton_id`, notes "scan-to-e-commerce") then `CHILD_ECOMMERCED` (notes "via carton"). | Integration | |
| TC-EC-225 | Admin | Remove box writes CHILD_UNECOMMERCED | P0 | 1. Remove box. 2. Query `CHILD_UNECOMMERCED` for that box. | 1 row. | Integration | |
| TC-EC-226 | Admin | Remove last box writes ECOMMERCE_REOPENED | P0 | 1. Remove last box from ACTIVE record. 2. Query `ECOMMERCE_REOPENED`. | 1 row. Notes contain record barcode and "reverted to CREATED". | Integration | |
| TC-EC-227 | Admin | Close writes ECOMMERCE_CLOSED | P0 | 1. Close record. 2. Query `ECOMMERCE_CLOSED` for this record's barcode in notes. | 1 row. Notes: "E-commerce record ... closed". | Integration | |
| TC-EC-228 | Admin | Full-unpack writes N × CHILD_UNECOMMERCED | P0 | 1. Full-unpack record with 4 boxes. 2. Count `CHILD_UNECOMMERCED` rows for these box IDs. | 4 rows. Each references a different `child_box_id`. | Integration | |

---

## Section 11 — UI smoke — list page (/ecommerce)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-230 | Admin | /ecommerce list page loads | P0 | 1. Login as Admin. 2. Navigate to `/ecommerce`. 3. Wait for network idle. | Page loads. "E-commerce" heading visible. List/table shown. "Stock View" button visible (link to `/ecommerce/stock`). "Create E-commerce Record" button visible (Admin `canCreate` = true). | E2E | Realizing: TC-EC-UI-001 in spec 32. |
| TC-EC-231 | Admin | Marketplace filter input present and functional | P0 | 1. On `/ecommerce`, locate the marketplace filter input. 2. Type "Amazon". 3. Wait for debounce. | API request includes `marketplace=Amazon`. List refreshes with filtered results. | E2E | Realizing: TC-EC-LIST-002 in spec 32. |
| TC-EC-232 | Admin | Status filter dropdown filters list | P1 | 1. Select "ACTIVE" in the status filter dropdown. | All visible rows show ACTIVE status badge. | E2E | |
| TC-EC-233 | Admin | Search input searches by name/barcode/order-ref | P1 | 1. Enter partial order-reference in search box. 2. Wait for results. | Matching records shown. Non-matching records absent. | E2E | `placeholder="Search by barcode, name, or order reference..."` |
| TC-EC-234 | Supervisor | Supervisor sees "Stock View" button but not "Create" button | P1 | 1. Login as Supervisor. 2. Navigate to `/ecommerce`. | "Stock View" button visible. "Create E-commerce Record" button NOT visible (`canCreate` = false for Supervisor by default). | E2E | `useCan('ecommerce:create')` returns false for Supervisor with no ecommerce permission. |
| TC-EC-235 | Warehouse Operator | Warehouse Operator sees list without Create button | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/ecommerce`. | List loads. "Create E-commerce Record" NOT visible. "Stock View" visible. | E2E | AUTOMATION GAP: no non-Admin role smoke test in spec 32 for list page. |
| TC-EC-236 | Dispatch Operator | Dispatch Operator can access /ecommerce list | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/ecommerce`. | List page loads. | E2E | AUTOMATION GAP: no Dispatch Op smoke test. |
| TC-EC-237 | Admin | Clicking a row navigates to detail page | P1 | 1. Click on any row in the table. | Browser navigates to `/ecommerce/<id>`. Detail page loads. | E2E | `router.push(ROUTES.ECOMMERCE_DETAIL(record.id))`. |
| TC-EC-238 | Admin | Pagination controls appear when total > PAGE_SIZE | P2 | 1. Ensure > 25 ecommerce records exist. 2. Load list page. | "Previous" and "Next" buttons visible. "Page X of Y" label shown. | E2E | |

---

## Section 12 — UI smoke — create page (/ecommerce/create)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-240 | Admin | /ecommerce/create form has all required fields | P0 | 1. Login as Admin. 2. Navigate to `/ecommerce/create`. 3. Wait for load. | Form fields visible: Name (required, labeled "Name"), Marketplace (optional), Order Reference (optional), Listing SKU (optional), Mapped Date (date picker, defaults to today), Notes (textarea, optional). HID scanner input visible. "Use Camera Instead" toggle. | E2E | Realizing: TC-EC-UI-002 in spec 32. |
| TC-EC-241 | Admin | Submitting without scanning a box shows client-side error | P0 | 1. Fill Name field. 2. Leave scan list empty. 3. Click "Create E-commerce Record". | `toast.error('Scan at least one child box')` displayed. No API call made. | E2E | Frontend-only guard: `if (scannedItems.length === 0)`. |
| TC-EC-242 | Admin | Scanning a box appears in scanned items list | P1 | 1. On create page, type a FREE box barcode in the HID scanner input and press Enter. | Barcode appears in "Scanned Items" list with article/colour/size details. Counter shows "1 boxes". | E2E | Background fetch from `childBoxService.getByBarcode`. |
| TC-EC-243 | Admin | Scanning a non-FREE/GENERATED box shows error and removes from list | P1 | 1. Enter a PACKED box barcode. 2. Wait for background validation. | Toast error: "Box ... is PACKED — only FREE or GENERATED boxes can be added". Item removed from scanned list. | E2E | Frontend removes item after background status check. |
| TC-EC-244 | Admin | Duplicate scan rejected | P1 | 1. Scan same barcode twice. | Second scan: `toast.error('Already scanned')`. Item appears once. | E2E | `addItem` in scanStore returns false if already present. |
| TC-EC-245 | Admin | Create button disabled until name and at least 1 box | P1 | 1. On create page, verify Create button state. | Button disabled when `scannedItems.length === 0` or `!name.trim()`. | E2E | `disabled={scannedItems.length === 0 || !name.trim()}`. |
| TC-EC-246 | Admin | Successful create redirects to detail page | P0 | 1. Fill Name. 2. Scan 1 FREE box. 3. Click "Create E-commerce Record". | API returns 201. Page redirects to `/ecommerce/<new-id>`. Detail page loads showing new record. | E2E | `router.replace(ROUTES.ECOMMERCE_DETAIL(data.id))`. |
| TC-EC-247 | Supervisor | Supervisor cannot access create page (no create permission) | P1 | 1. Login as Supervisor. 2. Navigate directly to `/ecommerce/create`. | Page either redirects or shows "Access Denied" (depending on frontend guard). Create button absent on list page. | E2E | AUTOMATION GAP: frontend guard behavior for unauthorized direct URL access not tested in spec 32. |

---

## Section 13 — UI smoke — detail page (/ecommerce/[id])

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-250 | Admin | Detail page renders for ACTIVE record | P0 | 1. Login as Admin. 2. Navigate to `/ecommerce/<EC_ACTIVE_UUID>`. | Page loads. Barcode in header (`E-commerce: ECAB12CD`). Status card shows "ACTIVE". Name, marketplace (if set), order_reference shown. "Add Box", "Full Unpack", "Close Record" buttons visible. Child boxes table present. | E2E | Realizing: TC-EC-UI-003 in spec 32. |
| TC-EC-251 | Admin | "Add Box" section expands with HID scanner + carton scan input | P0 | 1. Click "Add Box" button. | Section expands. HID scanner input visible with placeholder "Scan or enter child box barcode...". "Or add a full carton" section below with "Master carton barcode..." input and "Add Carton" button. | E2E | Realizing: TC-EC-SCAN-UI-001 in spec 36. |
| TC-EC-252 | Admin | Carton scan input submits on Enter key | P1 | 1. Open "Add Box" section. 2. Type a carton barcode in the carton input. 3. Press Enter. | `handleScanCarton` called with the barcode. Success: toast "Added N box(es) from carton...". Record child_count updated. | E2E | `onKeyDown={(e) => { if (e.key === 'Enter') handleScanCarton(cartonBarcode); }}`. |
| TC-EC-253 | Admin | Carton scan with DISPATCHED carton shows error toast | P1 | 1. Open "Add Box". 2. Enter a DISPATCHED carton barcode. 3. Submit. | Toast error: "Master carton ... is DISPATCHED and cannot be moved to e-commerce". | E2E | API returns 400; frontend shows toast from `err?.response?.data?.message`. |
| TC-EC-254 | Admin | Close Record button visible only for ACTIVE record (as isManager) | P0 | 1. Admin on ACTIVE record detail. | "Close Record" visible. On CLOSED record: "Close Record" absent. | E2E | `canClose = record.status === 'ACTIVE' && isManager`. |
| TC-EC-255 | Admin | Close Record button triggers close and status updates | P0 | 1. Click "Close Record" on ACTIVE record. | Confirmation not required (no modal for close). API call to `/close`. Success toast. Record status becomes "CLOSED". "Close Record" button disappears. | E2E | |
| TC-EC-256 | Admin | Full Unpack shows confirmation modal with count | P0 | 1. Click "Full Unpack" button. | Modal opens: title "Full Unpack", description warns about freeing all boxes. Shows "This will unpack N child box(es)...". "Confirm Unpack" (danger) and "Cancel" buttons. | E2E | `showUnpackConfirm` state → Modal. |
| TC-EC-257 | Admin | Full Unpack from CREATED (child_count=0) button visible but API returns 400 | P1 | 1. Admin on CREATED record (no boxes). 2. Click "Full Unpack". 3. Confirm. | API returns 400 "Cannot unpack an empty e-commerce record". Toast error shown. Frontend's `canUnpack` includes CREATED status visually. | E2E | `canUnpack = CREATED || ACTIVE || CLOSED` in frontend — shows button even for empty CREATED records. |
| TC-EC-258 | Admin | Assortment summary shown if boxes exist | P1 | 1. ACTIVE record with 2 different-product boxes. 2. Navigate to detail. | "Assortment Summary" card visible. Table shows article, colour, size, MRP, qty. Total row at bottom. | E2E | `assortment.length > 0` condition. |
| TC-EC-259 | Admin | Remove box button visible only on ACTIVE record child box rows | P0 | 1. Admin on ACTIVE record. | X (remove) button visible in each child box row. On CLOSED/CREATED/DISPATCHED record: remove button absent. | E2E | `record.status === 'ACTIVE'` condition. |
| TC-EC-260 | Admin | Detail page shows all optional metadata fields when populated | P1 | 1. Record has `listing_sku`, `mapped_date`, `notes` set. 2. Navigate to detail. | "Listing SKU: ...", "Mapped Date: ...", "Notes: ..." all displayed in the Details card. | E2E | |
| TC-EC-261 | Warehouse Operator | Warehouse Operator on detail: no Add Box, no Close, no Full Unpack buttons | P0 | 1. Login as Warehouse Operator. 2. Navigate to ACTIVE record detail. | "Add Box" button absent (`canAddBox` checks record status, not permission — but the mutation will 403 anyway). "Close Record" absent (`isManager` = false for WH Op). "Full Unpack" absent (same). Page loads. | E2E | `isManager` = false for Warehouse Operator. `canClose = status === ACTIVE && isManager`. AUTOMATION GAP: non-Admin detail smoke tests absent from spec 32. |
| TC-EC-262 | Dispatch Operator | Dispatch Operator sees read-only detail page | P1 | 1. Login as Dispatch Operator. 2. Navigate to ACTIVE record. | Page loads. No write-action buttons visible. Child boxes table visible. | E2E | AUTOMATION GAP. |

---

## Section 14 — UI smoke — stock page (/ecommerce/stock)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-270 | Admin | "Stock View" button on list page navigates to /ecommerce/stock | P0 | 1. Login as Admin. 2. Navigate to `/ecommerce`. 3. Click "Stock View" button. | Browser navigates to `/ecommerce/stock`. Page loads. | E2E | Realizing: TC-EC-STOCK-UI-001 in spec 36. Uses `ROUTES.ECOMMERCE_STOCK`. |
| TC-EC-271 | Admin | /ecommerce/stock page renders summary cards and table | P0 | 1. Navigate to `/ecommerce/stock`. | Page loads. Two summary cards: "Allocated to e-commerce (Prs)" and "Available to assign (Prs)". Totals computed from row data. Per-product table shown with headers: Article, Colour, Size, SKU, MRP, "Allocated (Prs / Boxes)", "Available (Prs / Boxes)". | E2E | Realizing: TC-EC-STOCK-UI-002, -003 in spec 36. |
| TC-EC-272 | Admin | Stock page back link returns to /ecommerce | P1 | 1. Navigate to `/ecommerce/stock`. 2. Click "Back to E-commerce" link. | Browser navigates to `/ecommerce`. | E2E | `href={ROUTES.ECOMMERCE}`. |
| TC-EC-273 | Admin | Adding box to e-commerce record updates stock page | P0 | 1. Note allocated_pairs on stock page. 2. Add a FREE box to an e-commerce record. 3. Refresh `/ecommerce/stock`. | `allocated_pairs` increased by box quantity. `available_pairs` decreased. | E2E | |
| TC-EC-274 | Supervisor | /ecommerce/stock shows "Access Denied" for Supervisor (frontend gate) | P0 | 1. Login as Supervisor. 2. Navigate to `/ecommerce/stock`. | "Access Denied" card rendered: "You do not have permission to view e-commerce stock." (because `useCan('ecommerce:read')` = false for Supervisor). | E2E | **RBAC discrepancy #2.** Frontend gate fires; API would still return 200 for this role directly. |
| TC-EC-275 | Warehouse Operator | /ecommerce/stock shows "Access Denied" for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/ecommerce/stock`. | "Access Denied" card. `canRead` = false. | E2E | AUTOMATION GAP: non-Admin role stock page tests absent from spec 36. |
| TC-EC-276 | Dispatch Operator | /ecommerce/stock shows "Access Denied" for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/ecommerce/stock`. | "Access Denied" card. `canRead` = false. | E2E | AUTOMATION GAP. |
| TC-EC-277 | Admin | Empty stock state: no e-commerce/free/generated boxes → no table rows | P1 | 1. (Fresh environment with no relevant boxes.) 2. Navigate to `/ecommerce/stock`. | "No e-commerce or available stock to show yet." empty state rendered. Summary cards show 0. | E2E | |
| TC-EC-278 | Admin | Stock page fetches from API only when canRead is true | P1 | 1. Admin loads `/ecommerce/stock`. | `useApiQuery` enabled (canRead=true). API call to `GET /ecommerce/stock-summary` made. Rows rendered. | E2E | `enabled: canRead` in `useApiQuery`. |

---

## RBAC Discrepancy Summary

| Discrepancy | Actual behavior | Expected by matrix | TC covering it |
|---|---|---|---|
| All GET /ecommerce/* endpoints have no `authorizePermission` gate | All roles get 200 | Matrix implies read-only gated at `ecommerce:read` | TC-EC-145–148, 153–156, 162–165, 171–174, 182–185, 200–203 |
| `GET /ecommerce/stock-summary` — no permission gate | All roles 200 | ecommerce:read gated | TC-EC-200–203 |
| `/ecommerce/stock` frontend uses `useCan('ecommerce:read')` | Non-Admin roles see "Access Denied" in UI even though API returns 200 | Consistent with admin-only intent | TC-EC-274–276 |
| `ecommerce:read` not seeded for any role (Supervisor/WH/DO) | Frontend `useCan` returns false → stock page access denied | — | TC-EC-274–276 |

---

## Automation Gap Analysis

The following test scenarios have **no existing Playwright coverage** and should be added to `36-ecommerce-scan-carton-and-stock.spec.ts` or a new spec:

| Gap | Recommendation |
|---|---|
| Non-Admin roles viewing list and detail pages (E2E) | Add smoke tests for Supervisor / WH Op / Dispatch Op in spec 32 |
| Supervisor and WH Op seeing "Access Denied" on `/ecommerce/stock` | Add to spec 36 (TC-EC-274–276) |
| Carton scan UI — Enter key submission | Add to spec 36 `TC-EC-SCAN-UI` describe block |
| Carton scan toast for DISPATCHED/empty carton error | Add to spec 36 |
| Full Unpack modal confirmation flow (E2E) | Add to spec 32 |
| Close Record UX (button disappears after close, no modal) | Add to spec 32 |
| Remove box X button on ACTIVE vs absent on CLOSED | Add to spec 32 |
| `ECOMMERCE_CREATED` transaction absent when creating with boxes | Add to spec 32 integration tests |
| `ecommerce:read` not seeded — direct `useCan` = false for all non-Admin | AUTOMATION GAP: needs a test that logs in as Supervisor and asserts stock page shows "Access Denied" |
