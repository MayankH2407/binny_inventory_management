# Phase 12 — E-commerce Module

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `EC` (API/Integration), `EC-E2E` (browser E2E)
**Phase dependencies:** Phase 07 (child box lifecycle). FREE and GENERATED boxes must exist.
**Last updated:** 2026-04-30

---

## Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `CB_FREE_1..N` | FREE child boxes |
| `CB_GEN_1` | GENERATED child box (barcode `CB_GEN_BAR`) |
| `CB_PACKED_1` | PACKED child box (in a master carton) |
| `CB_SAMPLE_1` | SAMPLE-status child box (in a sample record) |
| `CB_EC_1` | Already in an e-commerce record (status ECOMMERCE) |
| `EC_ACTIVE_UUID` | An ACTIVE e-commerce record with ≥ 2 child boxes |
| `EC_CLOSED_UUID` | A CLOSED e-commerce record |
| `EC_CREATED_UUID` | A CREATED (empty) e-commerce record |
| API base | `http://localhost:5000/api/v1` |
| Barcode prefix | `BINNY-EC-<uuid>` |

---

## Section 1 — Create e-commerce record (POST /ecommerce)

### 1.1 — Role-gated creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-001 | Admin | Admin creates empty e-commerce record with name only | P0 | 1. Login as Admin. 2. `POST /api/v1/ecommerce` body `{"name": "Amazon Q4 Batch"}`. | HTTP 201. Response: `{ id: <uuid>, ecommerce_barcode: "BINNY-EC-<uuid>", name: "Amazon Q4 Batch", status: "CREATED", child_count: 0, marketplace: null, order_reference: null, listing_sku: null, mapped_date: null, notes: null, created_by: <admin_user_id>, qr_barcode: "BINNY-EC-<uuid>" }`. `ecommerce_barcode` starts with `"BINNY-EC-"`. `inventory_transactions` row `ECOMMERCE_CREATED` with `notes` containing the barcode. | Integration | Note: response field is `qr_barcode` (from service `return {..., qr_barcode: ecommerceBarcode}`). |
| TC-EC-002 | Admin | Admin creates e-commerce record with all optional fields | P0 | 1. `POST /api/v1/ecommerce` body `{"name": "Flipkart May", "marketplace": "Flipkart", "order_reference": "FK-2026-001", "listing_sku": "BS-6-BLU-FK", "mapped_date": "2026-04-30", "notes": "Priority shipment"}`. | HTTP 201. All fields populated: `marketplace = "Flipkart"`, `order_reference = "FK-2026-001"`, `listing_sku = "BS-6-BLU-FK"`, `mapped_date` = "2026-04-30", `notes = "Priority shipment"`. | API | |
| TC-EC-003 | Admin | Admin creates e-commerce record with initial child boxes | P0 | 1. Pre-condition: 2 FREE boxes `CB_BAR_1`, `CB_BAR_2`. 2. `POST /api/v1/ecommerce` body `{"name": "Amazon Batch", "child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_2>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 2`. Both boxes have `status = "ECOMMERCE"`. `inventory_transactions`: 1 `ECOMMERCE_CREATED` row + 2 `CHILD_ECOMMERCED` rows. | Integration | |
| TC-EC-004 | Admin | Create with GENERATED box — auto-activates box | P0 | 1. `CB_GEN_1` is GENERATED. 2. `POST /api/v1/ecommerce` body `{"name": "Meesho Batch", "child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 1`. `CB_GEN_1` status = ECOMMERCE. `inventory_transactions`: `CHILD_ACTIVATED` then `CHILD_ECOMMERCED` for `CB_GEN_1`, in order. | Integration | |
| TC-EC-005 | Supervisor | Supervisor creates e-commerce record | P1 | 1. Login as Supervisor. 2. `POST /api/v1/ecommerce` body `{"name": "Sup EC"}`. | HTTP 201. `status = "CREATED"`. | API | |
| TC-EC-006 | Warehouse Operator | Warehouse Operator creates e-commerce record | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/ecommerce` body `{"name": "WH EC"}`. | HTTP 201. | API | |
| TC-EC-007 | Dispatch Operator | Dispatch Operator cannot create e-commerce record | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/ecommerce` body `{"name": "DP EC"}`. | HTTP 403. No record created. | API | |

### 1.2 — Validation errors on create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-008 | Admin | Create with missing name returns 400 | P0 | 1. `POST /api/v1/ecommerce` body `{}`. | HTTP 400. "Name is required". | API | |
| TC-EC-009 | Admin | Create with empty name returns 400 | P0 | 1. `POST /api/v1/ecommerce` body `{"name": ""}`. | HTTP 400. Name min(1) validation. | API | |
| TC-EC-010 | Admin | Create with PACKED box returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. `POST /api/v1/ecommerce` body `{"name": "X", "child_box_barcodes": ["<CB_PACKED_BAR>"]}`. | HTTP 400. "currently PACKED and cannot be added to an e-commerce record". No record created. | API | |
| TC-EC-011 | Admin | Create with SAMPLE-status box returns 400 | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Add to ecommerce. | HTTP 400. "currently SAMPLE and cannot be added". | API | |
| TC-EC-012 | Admin | Create with ECOMMERCE-status box returns 400 | P0 | 1. `CB_EC_1` is ECOMMERCE. 2. `POST /api/v1/ecommerce` body `{"name": "X", "child_box_barcodes": ["<CB_EC_BAR>"]}`. | HTTP 400. "currently ECOMMERCE and cannot be added". | API | |
| TC-EC-013 | Admin | Create with non-existent barcode returns 404 | P0 | 1. `POST /api/v1/ecommerce` body `{"name": "X", "child_box_barcodes": ["BINNY-CB-00000000-0000-0000-0000-000000000000"]}`. | HTTP 404. "Child box with barcode ... not found". No record created. | API | |
| TC-EC-014 | Admin | Name exceeding 200 chars returns 400 | P1 | 1. `POST /api/v1/ecommerce` body `{"name": "<201 chars>"}`. | HTTP 400. Zod max(200) error. | API | |
| TC-EC-015 | Admin | marketplace exceeding 100 chars returns 400 | P1 | 1. `POST /api/v1/ecommerce` body `{"name": "X", "marketplace": "<101 chars>"}`. | HTTP 400. Zod max(100) error. | API | |

---

## Section 2 — Add box to e-commerce (POST /ecommerce/add-box)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-020 | Admin | Admin adds FREE box to ACTIVE e-commerce record | P0 | 1. `EC_ACTIVE_UUID` is ACTIVE. `CB_FREE_NEW` is FREE. 2. `POST /api/v1/ecommerce/add-box` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "ecommerce_record_id": "<EC_ACTIVE_UUID>"}`. | HTTP 200. Response: `{ record: { id: <EC_ACTIVE_UUID>, status: "ACTIVE", child_count: <prev+1> }, mapping: { ecommerce_record_id: <EC_ACTIVE_UUID>, child_box_id: <CB_FREE_NEW_UUID>, is_active: true } }`. Child box status = ECOMMERCE. `inventory_transactions` row `CHILD_ECOMMERCED`. | Integration | |
| TC-EC-021 | Admin | Add FREE box to CREATED record transitions to ACTIVE | P0 | 1. `EC_CREATED_UUID` is CREATED (child_count = 0). `CB_FREE_A` is FREE. 2. Add-box request. | HTTP 200. `record.status = "ACTIVE"`. `record.child_count = 1`. | Integration | CREATED → ACTIVE on first box. |
| TC-EC-022 | Admin | Add GENERATED box auto-activates it | P0 | 1. `CB_GEN_2` is GENERATED, `EC_ACTIVE_UUID` is ACTIVE. 2. Add-box request. | HTTP 200. `CB_GEN_2` status = ECOMMERCE. `inventory_transactions`: `CHILD_ACTIVATED` then `CHILD_ECOMMERCED` for `CB_GEN_2`. | Integration | |
| TC-EC-023 | Supervisor | Supervisor adds box to e-commerce record | P1 | 1. Login as Supervisor. Valid add-box request. | HTTP 200. Box = ECOMMERCE. | API | |
| TC-EC-024 | Warehouse Operator | Warehouse Operator adds box | P1 | 1. Login as Warehouse Operator. Valid request. | HTTP 200. | API | |
| TC-EC-025 | Dispatch Operator | Dispatch Operator cannot add box | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/ecommerce/add-box` valid body. | HTTP 403. | API | |
| TC-EC-026 | Admin | Add box to CLOSED record returns 400 | P0 | 1. `EC_CLOSED_UUID` is CLOSED. `CB_FREE_B` is FREE. 2. Add-box request. | HTTP 400. "E-commerce record is CLOSED and cannot accept new child boxes". | API | |
| TC-EC-027 | Admin | Add box to DISPATCHED record returns 400 | P0 | 1. Dispatched e-commerce record. 2. Add-box request. | HTTP 400. "E-commerce record is DISPATCHED and cannot accept new child boxes". | API | |
| TC-EC-028 | Admin | Add PACKED box returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. Add to e-commerce. | HTTP 400. "currently PACKED and cannot be added to an e-commerce record". | API | |
| TC-EC-029 | Admin | Add SAMPLE-status box to e-commerce returns 400 | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Add to e-commerce. | HTTP 400. "currently SAMPLE". | API | |
| TC-EC-030 | Admin | Add ECOMMERCE-status box (already mapped) returns 400 | P0 | 1. `CB_EC_1` is ECOMMERCE in another record. 2. Add to this record. | HTTP 400. "currently ECOMMERCE". | API | |
| TC-EC-031 | Admin | Add non-existent child box returns 404 | P1 | 1. `child_box_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "Child box not found". | API | |
| TC-EC-032 | Admin | Add box to non-existent e-commerce record returns 404 | P1 | 1. `ecommerce_record_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-033 | Admin | Add box with non-UUID ids returns 400 | P1 | 1. `POST /api/v1/ecommerce/add-box` body `{"child_box_id": "bad", "ecommerce_record_id": "bad"}`. | HTTP 400. Zod UUID errors. | API | |

---

## Section 3 — Remove box from e-commerce (POST /ecommerce/remove-box)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-040 | Admin | Admin removes box from ACTIVE record | P0 | 1. `CB_EC_A` is ECOMMERCE in `EC_ACTIVE_UUID`. 2. `POST /api/v1/ecommerce/remove-box` body `{"child_box_id": "<CB_EC_A_UUID>", "ecommerce_record_id": "<EC_ACTIVE_UUID>"}`. | HTTP 200. Response is updated record: `{ status: "ACTIVE", child_count: <prev-1> }`. `CB_EC_A` status = FREE. `ecommerce_box_mapping` row `is_active = false`, `unmapped_at` populated. `inventory_transactions` row `CHILD_UNECOMMERCED`. | Integration | |
| TC-EC-041 | Admin | Remove last box from ACTIVE record → CREATED + ECOMMERCE_REOPENED | P0 | 1. `EC_ACTIVE_UUID` has `child_count = 1`. 2. Remove that box. | HTTP 200. `record.status = "CREATED"`. `child_count = 0`. Box = FREE. `inventory_transactions`: `CHILD_UNECOMMERCED` + `ECOMMERCE_REOPENED` for this record. | Integration | Code: `if (newChildCount === 0 && record.status === ACTIVE) → ECOMMERCE_REOPENED`. |
| TC-EC-042 | Admin | Remove from CLOSED record is allowed | P1 | 1. `EC_CLOSED_UUID` CLOSED with boxes. 2. Remove one box. | HTTP 200. Box = FREE. `child_count` decremented. Status remains CLOSED. `inventory_transactions`: `CHILD_UNECOMMERCED`. | Integration | Only DISPATCHED blocks remove. |
| TC-EC-043 | Admin | Remove from DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Remove request. | HTTP 400. "Cannot remove box from a dispatched e-commerce record". | API | |
| TC-EC-044 | Supervisor | Supervisor removes box from e-commerce record | P1 | 1. Login as Supervisor. Valid remove-box request. | HTTP 200. Box = FREE. | API | |
| TC-EC-045 | Warehouse Operator | Warehouse Operator removes box | P1 | 1. Login as Warehouse Operator. Valid request. | HTTP 200. | API | |
| TC-EC-046 | Dispatch Operator | Dispatch Operator cannot remove box | P0 | 1. Login as Dispatch Operator. Remove-box request. | HTTP 403. | API | |
| TC-EC-047 | Admin | Remove box not mapped to record returns 404 | P1 | 1. `CB_FREE_1` is FREE (not in record). 2. Remove-box referencing this box and `EC_ACTIVE_UUID`. | HTTP 404. "Active mapping not found for this child box and e-commerce record". | API | |

---

## Section 4 — Close e-commerce record (POST /ecommerce/:id/close)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-050 | Admin | Admin closes ACTIVE e-commerce record | P0 | 1. `EC_ACTIVE_UUID` is ACTIVE with ≥ 1 box. 2. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/close`. | HTTP 200. `{ id: <EC_ACTIVE_UUID>, status: "CLOSED", closed_at: <ISO timestamp> }`. `closed_at` non-null. `inventory_transactions` row `ECOMMERCE_CLOSED`. | Integration | |
| TC-EC-051 | Supervisor | Supervisor closes e-commerce record | P1 | 1. Login as Supervisor. Active record with boxes. 2. Close. | HTTP 200. `status = "CLOSED"`. | API | |
| TC-EC-052 | Warehouse Operator | Warehouse Operator cannot close | P0 | 1. Login as Warehouse Operator. 2. Close request. | HTTP 403. Status unchanged. | API | |
| TC-EC-053 | Dispatch Operator | Dispatch Operator cannot close | P0 | 1. Login as Dispatch Operator. 2. Close request. | HTTP 403. | API | |
| TC-EC-054 | Admin | Close already CLOSED record returns 400 | P0 | 1. `EC_CLOSED_UUID` is CLOSED. 2. Close again. | HTTP 400. "E-commerce record is already closed". | API | |
| TC-EC-055 | Admin | Close DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Close. | HTTP 400. "Cannot close a dispatched e-commerce record". | API | |
| TC-EC-056 | Admin | Close empty (CREATED) record returns 400 | P0 | 1. `EC_CREATED_UUID` has `child_count = 0`. 2. Close. | HTTP 400. "Cannot close an empty e-commerce record". | API | |
| TC-EC-057 | Admin | Close non-existent record returns 404 | P1 | 1. `POST /api/v1/ecommerce/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-058 | Admin | Close with non-UUID id returns 400 | P1 | 1. `POST /api/v1/ecommerce/not-a-uuid/close`. | HTTP 400. UUID validation error. | API | |

---

## Section 5 — Full unpack (POST /ecommerce/:id/full-unpack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-060 | Admin | Admin full-unpacks ACTIVE record | P0 | 1. `EC_ACTIVE_UUID` has 3 ECOMMERCE boxes. 2. `POST /api/v1/ecommerce/<EC_ACTIVE_UUID>/full-unpack`. | HTTP 200. `{ id: <EC_ACTIVE_UUID>, status: "CREATED", child_count: 0 }`. All 3 boxes = FREE. All 3 `ecommerce_box_mapping` rows `is_active = false`, `unmapped_at` populated. 3 `CHILD_UNECOMMERCED` rows in `inventory_transactions`. | Integration | |
| TC-EC-061 | Admin | Full-unpack CLOSED record releases boxes | P1 | 1. `EC_CLOSED_UUID` CLOSED with 2 boxes. 2. Full-unpack. | HTTP 200. `status = "CREATED"`. `child_count = 0`. Both boxes FREE. | Integration | |
| TC-EC-062 | Admin | Full-unpack DISPATCHED record returns 400 | P0 | 1. Dispatched record. 2. Full-unpack. | HTTP 400. "Cannot unpack a dispatched e-commerce record". | API | |
| TC-EC-063 | Admin | Full-unpack CREATED (empty) record returns 400 | P0 | 1. `EC_CREATED_UUID` child_count = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty e-commerce record". | API | |
| TC-EC-064 | Warehouse Operator | Warehouse Operator can full-unpack | P1 | 1. Login as Warehouse Operator. Valid full-unpack. | HTTP 200. | API | |
| TC-EC-065 | Dispatch Operator | Dispatch Operator cannot full-unpack | P0 | 1. Login as Dispatch Operator. Full-unpack request. | HTTP 403. | API | |

---

## Section 6 — Read endpoints

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-070 | Admin | GET /ecommerce returns paginated list | P0 | 1. `GET /api/v1/ecommerce`. | HTTP 200. `{ data: [...], total: <n>, page: 1, limit: 25 }`. Each item: `id`, `ecommerce_barcode`, `name`, `marketplace`, `order_reference`, `listing_sku`, `mapped_date`, `status`, `child_count`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`, `created_at`. | API | |
| TC-EC-071 | Admin | GET /ecommerce?status=ACTIVE filters | P1 | 1. `GET /api/v1/ecommerce?status=ACTIVE`. | All items `status = "ACTIVE"`. | API | |
| TC-EC-072 | Admin | GET /ecommerce?marketplace=Amazon filters | P0 | 1. `GET /api/v1/ecommerce?marketplace=Amazon`. | All items have `marketplace ILIKE '%Amazon%'`. | API | Unique to ecommerce vs sample (no marketplace filter on sample). |
| TC-EC-073 | Admin | GET /ecommerce?marketplace=<partial> does partial match | P1 | 1. `GET /api/v1/ecommerce?marketplace=flip`. | Returns records with marketplace "Flipkart" (ILIKE `%flip%`). | API | |
| TC-EC-074 | Admin | GET /ecommerce?search=<barcode_or_name_or_order> filters | P1 | 1. `GET /api/v1/ecommerce?search=FK-2026-001`. | Returns records with `ecommerce_barcode`, `name`, or `order_reference` containing the search string. | API | Three-field search in service. |
| TC-EC-075 | Any | GET /ecommerce without auth returns 401 | P0 | 1. No credentials. | HTTP 401. | API | |
| TC-EC-076 | Admin | GET /ecommerce/:id returns record with child_boxes | P0 | 1. `GET /api/v1/ecommerce/<EC_ACTIVE_UUID>`. | HTTP 200. `{ id: ..., ecommerce_barcode: ..., status: "ACTIVE", child_count: <n>, child_boxes: [...] }`. `child_boxes` length = `child_count`. Each child_box: `child_box_id`, `barcode`, `status: "ECOMMERCE"`, `article_name`, `size`, `colour`, `mrp`. | API | |
| TC-EC-077 | Admin | GET /ecommerce/non-existent returns 404 | P1 | 1. `GET /api/v1/ecommerce/00000000-0000-0000-0000-000000000000`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-078 | Admin | GET /ecommerce/:id/children returns active mappings only | P0 | 1. Record has 2 active + 1 inactive mapping. 2. `GET /api/v1/ecommerce/<EC_ID>/children`. | Array of 2 items. Each: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `mapped_at`. | API | |
| TC-EC-079 | Admin | GET /ecommerce/:id/assortment returns grouping | P0 | 1. Record has 2 Size-6 Blue + 1 Size-7 Blue boxes. 2. `GET /api/v1/ecommerce/<EC_ID>/assortment`. | Array: `[ { article_name, colour: "Blue", size: "6", count: 2 }, { article_name, colour: "Blue", size: "7", count: 1 } ]`. Ordered by article_name, colour, size. | API | |
| TC-EC-080 | Admin | GET /ecommerce/qr/:barcode returns by barcode | P0 | 1. `GET /api/v1/ecommerce/qr/BINNY-EC-<uuid>`. | HTTP 200. `ecommerce_barcode` matches. `child_boxes` present. | API | |
| TC-EC-081 | Admin | GET /ecommerce/qr/NONEXISTENT returns 404 | P1 | 1. `GET /api/v1/ecommerce/qr/BINNY-EC-00000000`. | HTTP 404. "E-commerce record not found". | API | |
| TC-EC-082 | Warehouse Operator | Warehouse Operator can read all endpoints | P1 | 1. Login as Warehouse Operator. GET list, GET by id, GET children, GET assortment. | All return HTTP 200. | API | |
| TC-EC-083 | Dispatch Operator | Dispatch Operator can read list and detail | P1 | 1. Login as Dispatch Operator. GET list, GET by id. | HTTP 200 for both. | API | |

---

## Section 7 — Stock semantics

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-085 | Admin | ECOMMERCE boxes excluded from pairsInStock | P0 | 1. Record `pairsInStock` for a product. 2. Add 5 boxes to an e-commerce record. 3. Re-query stock. | `pairsInStock` decreased by 5. | Integration | Parallel to sample stock exclusion. |
| TC-EC-086 | Admin | Dashboard shows E-commerce Boxes KPI | P1 | 1. Navigate to `/dashboard` (or query inventory summary). | "E-commerce Boxes" KPI is visible and equals the count of child boxes with `status = ECOMMERCE`. | E2E | Apr 27 KPI. |
| TC-EC-087 | Admin | Removing box from e-commerce restores pairsInStock | P1 | 1. Add 3 boxes to e-commerce record. Note `pairsInStock`. 2. Remove 1 box. 3. Re-query. | `pairsInStock` increases by 1. | Integration | |

---

## Section 8 — Transaction log correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-090 | Admin | Create record writes ECOMMERCE_CREATED transaction | P0 | 1. Create e-commerce record. 2. `SELECT * FROM inventory_transactions WHERE transaction_type = 'ECOMMERCE_CREATED'` and `notes` contains new barcode. | 1 row. `performed_by` = creator id. | Integration | Note: no `metadata` column in the simple-creation path — `notes` carries the barcode. |
| TC-EC-091 | Admin | Add box writes CHILD_ECOMMERCED transaction | P0 | 1. Add box to record. 2. `SELECT * FROM inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_ECOMMERCED'`. | 1 row. `performed_by` = user id. `notes` contains child barcode and record barcode. | Integration | |
| TC-EC-092 | Admin | Add GENERATED box writes CHILD_ACTIVATED then CHILD_ECOMMERCED | P0 | 1. Add GENERATED box. 2. Query transactions for that child box ordered by `created_at`. | Two rows: `CHILD_ACTIVATED` (first), `CHILD_ECOMMERCED` (second). | Integration | |
| TC-EC-093 | Admin | Remove box writes CHILD_UNECOMMERCED transaction | P0 | 1. Remove box from record. 2. Query `CHILD_UNECOMMERCED` for that box. | 1 row. | Integration | |
| TC-EC-094 | Admin | Remove last box writes ECOMMERCE_REOPENED transaction | P0 | 1. Remove last box from ACTIVE record. 2. Query `ECOMMERCE_REOPENED`. | 1 row. `notes` contains record barcode + "reverted to CREATED". | Integration | |
| TC-EC-095 | Admin | Close record writes ECOMMERCE_CLOSED transaction | P0 | 1. Close record. 2. Query `ECOMMERCE_CLOSED`. | 1 row. `notes` contains record barcode + "closed". | Integration | |
| TC-EC-096 | Admin | Full-unpack writes N × CHILD_UNECOMMERCED | P0 | 1. Full-unpack with 4 boxes. 2. Count `CHILD_UNECOMMERCED` for this record (via child_box_ids). | 4 rows. Each references a different `child_box_id`. | Integration | |

---

## Section 9 — Status transition integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-100 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty record → CREATED. 2. Add box → ACTIVE. 3. Close → CLOSED. 4. Dispatch (Phase 13) → DISPATCHED. | Each step transitions correctly. | Integration | |
| TC-EC-101 | Admin | Cannot add box to DISPATCHED record | P0 | 1. Dispatched record. 2. Add-box request. | HTTP 400. | API | |
| TC-EC-102 | Admin | E-commerce has no repack endpoint | P1 | 1. `POST /api/v1/ecommerce/repack` (does not exist). | HTTP 404. Route not found. | API | By design — no repack in ecommerce module. |
| TC-EC-103 | Admin | Mutual exclusivity: box in master carton cannot be added to e-commerce | P0 | 1. `CB_PACKED_1` is PACKED. 2. Add to e-commerce. | HTTP 400. "currently PACKED". | API | Same guard for SAMPLE, ECOMMERCE, DISPATCHED. |
| TC-EC-104 | Admin | Mutual exclusivity: box in sample cannot be added to e-commerce | P0 | 1. `CB_SAMPLE_1` is SAMPLE. 2. Add to e-commerce record. | HTTP 400. "currently SAMPLE". | API | |

---

## Section 10 — List page marketplace filter (E2E)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EC-E2E-001 | Admin | E-commerce list page loads | P0 | 1. Login as Admin. 2. Navigate to `/ecommerce`. | Heading "E-commerce" (or "E-commerce Records") visible. List/table shows records. "Create" button visible. | E2E | |
| TC-EC-E2E-002 | Admin | Marketplace filter input is present and functional | P0 | 1. On `/ecommerce`, locate the marketplace filter input. 2. Type "Amazon". 3. Wait for debounce / submit. | List refreshes. API call includes `marketplace=Amazon`. Only records with marketplace matching "Amazon" are shown. | E2E | Marketplace filter is unique to ecommerce list vs sample list. |
| TC-EC-E2E-003 | Admin | Status filter on e-commerce list | P1 | 1. Select "ACTIVE" in the status filter. | All visible rows show "ACTIVE" status badge. | E2E | |
| TC-EC-E2E-004 | Admin | Create e-commerce page has correct fields | P0 | 1. Navigate to `/ecommerce/create`. | Form fields visible: Name (required), Marketplace (free text), Order Reference, Listing SKU, Mapped Date, Notes. Child box scan/add section. | E2E | |
| TC-EC-E2E-005 | Admin | E-commerce detail page shows marketplace and order reference | P0 | 1. Navigate to `/ecommerce/<EC_ACTIVE_UUID>` for a record with marketplace "Flipkart". | Detail page shows: marketplace "Flipkart", order_reference (if set), listing_sku (if set), mapped_date (if set). Status badge, children list, assortment table, timeline visible. | E2E | |
| TC-EC-E2E-006 | Admin | Close button visible on ACTIVE record detail for Admin | P0 | 1. Navigate to `/ecommerce/<EC_ACTIVE_UUID>` as Admin. | "Close" button is visible in the action bar. | E2E | |
| TC-EC-E2E-007 | Warehouse Operator | No Close button on detail page for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/ecommerce/<EC_ACTIVE_UUID>`. | "Close" button NOT visible. Add-box and remove-box actions visible. | E2E | |
| TC-EC-E2E-008 | Dispatch Operator | Dispatch Operator sees read-only e-commerce detail | P1 | 1. Login as Dispatch Operator. Navigate to `/ecommerce/<EC_ACTIVE_UUID>`. | Page loads. No create/close/add-box buttons. | E2E | |
| TC-EC-E2E-009 | Admin | CLOSED record detail shows Close button as disabled/absent | P1 | 1. Navigate to `/ecommerce/<EC_CLOSED_UUID>`. | "Close" button not present or disabled. "Full Unpack" button may be visible (for Admin/Supervisor/Warehouse). | E2E | |
