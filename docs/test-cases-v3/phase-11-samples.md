# Phase 11 — Sample Module

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `SMP` (API/Integration), `SMP-E2E` (browser E2E)
**Phase dependencies:** Phase 04 (customers), Phase 07 (child box lifecycle). FREE and GENERATED boxes must exist.
**Last updated:** 2026-04-30

---

## Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `CB_FREE_1..N` | FREE child boxes |
| `CB_GEN_1` | GENERATED child box (barcode `CB_GEN_BAR`) |
| `CB_PACKED_1` | PACKED child box (in a master carton) |
| `CB_SAMPLE_1` | A child box already in a sample (status SAMPLE) |
| `CB_EC_1` | A child box already in an ecommerce record (status ECOMMERCE) |
| `CUSTOMER_UUID_A` | Existing customer "Ramesh Traders" |
| `SR_ACTIVE_UUID` | An ACTIVE sample record with ≥ 2 child boxes |
| `SR_CLOSED_UUID` | A CLOSED sample record |
| `SR_CREATED_UUID` | A CREATED (empty) sample record |
| API base | `http://localhost:5000/api/v1` |
| Barcode prefix | `BINNY-SR-<uuid>` |

---

## Section 1 — Create sample record (POST /samples)

### 1.1 — Role-gated creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-001 | Admin | Admin creates empty sample record with required name only | P0 | 1. Login as Admin. 2. `POST /api/v1/samples` body `{"name": "Trade Fair Sample 1"}`. | HTTP 201. Response: `{ id: <uuid>, sample_barcode: "BINNY-SR-<uuid>", name: "Trade Fair Sample 1", status: "CREATED", child_count: 0, customer_id: null, recipient_name: null, purpose: null, sample_date: null, notes: null, created_by: <admin_user_id> }`. `sample_barcode` starts with `"BINNY-SR-"`. `inventory_transactions` row `SAMPLE_CREATED` with `metadata.sample_record_id` = new sample id. | Integration | |
| TC-SMP-002 | Admin | Admin creates sample with customer FK | P0 | 1. `POST /api/v1/samples` body `{"name": "Sample A", "customer_id": "<CUSTOMER_UUID_A>", "purpose": "Dealer review", "sample_date": "2026-04-30"}`. | HTTP 201. `customer_id = CUSTOMER_UUID_A`. `purpose = "Dealer review"`. `sample_date` populated. | API | |
| TC-SMP-003 | Admin | Admin creates sample with free-text recipient (no customer FK) | P0 | 1. `POST /api/v1/samples` body `{"name": "Sample B", "recipient_name": "Ravi Kumar"}`. | HTTP 201. `recipient_name = "Ravi Kumar"`. `customer_id = null`. | API | |
| TC-SMP-004 | Admin | Admin creates sample with initial child boxes — status ACTIVE | P0 | 1. Pre-condition: 2 FREE boxes `CB_BAR_1`, `CB_BAR_2`. 2. `POST /api/v1/samples` body `{"name": "Sample C", "child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_2>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 2`. Both boxes now have `status = "SAMPLE"`. `inventory_transactions` contains: 1 `SAMPLE_CREATED` row + 2 `CHILD_SAMPLED` rows. | Integration | |
| TC-SMP-005 | Admin | Create sample with GENERATED box — auto-activates box | P0 | 1. Pre-condition: `CB_GEN_1` is GENERATED. 2. `POST /api/v1/samples` body `{"name": "Sample D", "child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 1`. `CB_GEN_1` status = SAMPLE. `inventory_transactions` contains `CHILD_ACTIVATED` followed by `CHILD_SAMPLED`, both for `CB_GEN_1`. | Integration | Auto-activation mirrors master-carton behaviour. |
| TC-SMP-006 | Supervisor | Supervisor creates sample record | P1 | 1. Login as Supervisor. 2. `POST /api/v1/samples` body `{"name": "Sup Sample"}`. | HTTP 201. `status = "CREATED"`. | API | |
| TC-SMP-007 | Warehouse Operator | Warehouse Operator creates sample record | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/samples` body `{"name": "WH Sample"}`. | HTTP 201. | API | |
| TC-SMP-008 | Dispatch Operator | Dispatch Operator cannot create sample record | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/samples` body `{"name": "DP Sample"}`. | HTTP 403. No record created. | API | |

### 1.2 — Validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-009 | Admin | Create with missing name returns 400 | P0 | 1. `POST /api/v1/samples` body `{}`. | HTTP 400. Validation error "Name is required". | API | |
| TC-SMP-010 | Admin | Create with empty name returns 400 | P0 | 1. `POST /api/v1/samples` body `{"name": ""}`. | HTTP 400. Validation error "Name is required" (min 1 after trim). | API | |
| TC-SMP-011 | Admin | Create with non-UUID customer_id returns 400 | P1 | 1. `POST /api/v1/samples` body `{"name": "X", "customer_id": "not-a-uuid"}`. | HTTP 400. Zod UUID validation error. | API | |
| TC-SMP-012 | Admin | Create with PACKED box returns 400 | P0 | 1. Pre-condition: `CB_PACKED_1` has status PACKED. 2. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["<CB_PACKED_BAR>"]}`. | HTTP 400. Error "currently PACKED and cannot be added to a sample". No record created. | API | |
| TC-SMP-013 | Admin | Create with SAMPLE-status box returns 400 | P0 | 1. `CB_SAMPLE_1` has status SAMPLE. 2. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["<CB_SAMPLE_BAR>"]}`. | HTTP 400. Error "currently SAMPLE and cannot be added". | API | Mutual exclusivity guard. |
| TC-SMP-014 | Admin | Create with ECOMMERCE-status box returns 400 | P0 | 1. `CB_EC_1` has status ECOMMERCE. 2. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["<CB_EC_BAR>"]}`. | HTTP 400. Error "currently ECOMMERCE and cannot be added". | API | |
| TC-SMP-015 | Admin | Create with non-existent barcode returns 404 | P0 | 1. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["BINNY-CB-00000000-0000-0000-0000-000000000000"]}`. | HTTP 404. "Child box with barcode ... not found". No record created. | API | |
| TC-SMP-016 | Admin | Name exceeding 200 chars returns 400 | P1 | 1. `POST /api/v1/samples` body `{"name": "<201-char string>"}`. | HTTP 400. Zod max(200) validation error. | API | |

---

## Section 2 — Add box to sample (POST /samples/add-box)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-020 | Admin | Admin adds FREE box to ACTIVE sample | P0 | 1. Pre-condition: `SR_ACTIVE_UUID` is ACTIVE, `CB_FREE_NEW` is FREE. 2. `POST /api/v1/samples/add-box` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "sample_record_id": "<SR_ACTIVE_UUID>"}`. | HTTP 200. Response: `{ sample: { id: <SR_ACTIVE_UUID>, status: "ACTIVE", child_count: <prev+1> }, mapping: { sample_record_id: <SR_ACTIVE_UUID>, child_box_id: <CB_FREE_NEW_UUID>, is_active: true } }`. Child box status = SAMPLE. `inventory_transactions` row `CHILD_SAMPLED` with `metadata.sample_record_id`. | Integration | |
| TC-SMP-021 | Admin | Add FREE box to CREATED sample transitions it to ACTIVE | P0 | 1. Pre-condition: `SR_CREATED_UUID` is CREATED (child_count = 0), `CB_FREE_A` is FREE. 2. `POST /api/v1/samples/add-box` body with ids. | HTTP 200. `sample.status = "ACTIVE"`. `sample.child_count = 1`. | Integration | CREATED → ACTIVE on first box added. |
| TC-SMP-022 | Admin | Add GENERATED box auto-activates it | P0 | 1. Pre-condition: `CB_GEN_2` is GENERATED, `SR_ACTIVE_UUID` is ACTIVE. 2. `POST /api/v1/samples/add-box` body with ids. | HTTP 200. `CB_GEN_2` status = SAMPLE. `inventory_transactions` contains `CHILD_ACTIVATED` then `CHILD_SAMPLED` for `CB_GEN_2`, in order. | Integration | |
| TC-SMP-023 | Supervisor | Supervisor adds box to sample | P1 | 1. Login as Supervisor. Valid add-box request. | HTTP 200. Box becomes SAMPLE. | API | |
| TC-SMP-024 | Warehouse Operator | Warehouse Operator adds box to sample | P1 | 1. Login as Warehouse Operator. Valid request. | HTTP 200. | API | |
| TC-SMP-025 | Dispatch Operator | Dispatch Operator cannot add box | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/samples/add-box` valid body. | HTTP 403. Box status unchanged. | API | |
| TC-SMP-026 | Admin | Add box to CLOSED sample returns 400 | P0 | 1. `SR_CLOSED_UUID` is CLOSED. `CB_FREE_B` is FREE. 2. `POST /api/v1/samples/add-box` body. | HTTP 400. Error "Sample record is CLOSED and cannot accept new child boxes". | API | |
| TC-SMP-027 | Admin | Add box to DISPATCHED sample returns 400 | P0 | 1. DISPATCHED sample. 2. Add-box request. | HTTP 400. "Sample record is DISPATCHED and cannot accept new child boxes". | API | |
| TC-SMP-028 | Admin | Add PACKED box (in master carton) returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. `POST /api/v1/samples/add-box` body. | HTTP 400. "currently PACKED and cannot be added to a sample". | API | |
| TC-SMP-029 | Admin | Add SAMPLE-status box returns 400 | P0 | 1. `CB_SAMPLE_1` already SAMPLE. 2. Add it to another sample. | HTTP 400. "currently SAMPLE and cannot be added to a sample". | API | Partial unique index `idx_unique_active_sample_mapping` also guards. |
| TC-SMP-030 | Admin | Add ECOMMERCE-status box to sample returns 400 | P0 | 1. `CB_EC_1` is ECOMMERCE. 2. Add to sample. | HTTP 400. "currently ECOMMERCE". | API | |
| TC-SMP-031 | Admin | Add non-existent child box returns 404 | P1 | 1. `POST /api/v1/samples/add-box` body with `child_box_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "Child box not found". | API | |
| TC-SMP-032 | Admin | Add box to non-existent sample returns 404 | P1 | 1. Valid box id, `sample_record_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-033 | Admin | Add box with non-UUID ids returns 400 | P1 | 1. `POST /api/v1/samples/add-box` body `{"child_box_id": "bad", "sample_record_id": "bad"}`. | HTTP 400. Zod UUID validation errors. | API | |

---

## Section 3 — Remove box from sample (POST /samples/remove-box)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-040 | Admin | Admin removes box from ACTIVE sample | P0 | 1. Pre-condition: `CB_SAMPLE_A` is SAMPLE in `SR_ACTIVE_UUID`. 2. `POST /api/v1/samples/remove-box` body `{"child_box_id": "<CB_SAMPLE_A_UUID>", "sample_record_id": "<SR_ACTIVE_UUID>"}`. | HTTP 200. Response is updated sample: `{ status: "ACTIVE", child_count: <prev-1> }`. `CB_SAMPLE_A` status = FREE. `sample_box_mapping` row `is_active = false`, `unmapped_at` populated. `inventory_transactions` row `CHILD_UNSAMPLED` with `metadata.sample_record_id`. | Integration | |
| TC-SMP-041 | Admin | Remove last box from ACTIVE sample → CREATED + SAMPLE_REOPENED | P0 | 1. Pre-condition: `SR_ACTIVE_UUID` has `child_count = 1`. 2. Remove that box. | HTTP 200. Sample `status = "CREATED"`. `child_count = 0`. Box = FREE. `inventory_transactions` contains `CHILD_UNSAMPLED` + `SAMPLE_REOPENED` (both for this sample). | Integration | Code: `if (newChildCount === 0 && sample.status === ACTIVE) → SAMPLE_REOPENED`. |
| TC-SMP-042 | Admin | Remove from CLOSED sample is allowed | P1 | 1. `SR_CLOSED_UUID` is CLOSED with boxes. 2. Remove one box. | HTTP 200. Box = FREE. `child_count` decremented. Sample status remains CLOSED. `inventory_transactions` row `CHILD_UNSAMPLED`. | Integration | Code: only DISPATCHED blocks remove. |
| TC-SMP-043 | Admin | Remove from DISPATCHED sample returns 400 | P0 | 1. Dispatched sample. 2. Remove request. | HTTP 400. "Cannot remove a child box from a dispatched sample". | API | |
| TC-SMP-044 | Supervisor | Supervisor removes box from sample | P1 | 1. Login as Supervisor. Valid remove-box request. | HTTP 200. Box = FREE. | API | |
| TC-SMP-045 | Warehouse Operator | Warehouse Operator removes box from sample | P1 | 1. Login as Warehouse Operator. Valid request. | HTTP 200. | API | |
| TC-SMP-046 | Dispatch Operator | Dispatch Operator cannot remove box | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/samples/remove-box` valid body. | HTTP 403. | API | |
| TC-SMP-047 | Admin | Remove box not mapped to sample returns 404 | P1 | 1. `CB_FREE_1` is FREE (not in the sample). 2. `POST /api/v1/samples/remove-box` body referencing this box and `SR_ACTIVE_UUID`. | HTTP 404. "Active mapping not found for this child box and sample record". | API | |

---

## Section 4 — Close sample (POST /samples/:id/close)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-050 | Admin | Admin closes ACTIVE sample | P0 | 1. Pre-condition: `SR_ACTIVE_UUID` is ACTIVE with ≥ 1 box. 2. `POST /api/v1/samples/<SR_ACTIVE_UUID>/close`. | HTTP 200. Response: `{ id: <SR_ACTIVE_UUID>, status: "CLOSED", closed_at: <ISO timestamp> }`. `closed_at` non-null. `inventory_transactions` row `SAMPLE_CLOSED` with `metadata.sample_record_id`. | Integration | |
| TC-SMP-051 | Supervisor | Supervisor closes sample | P1 | 1. Login as Supervisor. Active sample with boxes. 2. Close. | HTTP 200. `status = "CLOSED"`. | API | |
| TC-SMP-052 | Warehouse Operator | Warehouse Operator cannot close sample | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/samples/<SR_ACTIVE_UUID>/close`. | HTTP 403. Status unchanged. | API | |
| TC-SMP-053 | Dispatch Operator | Dispatch Operator cannot close sample | P0 | 1. Login as Dispatch Operator. 2. Close request. | HTTP 403. | API | |
| TC-SMP-054 | Admin | Close already CLOSED sample returns 400 | P0 | 1. `SR_CLOSED_UUID` is CLOSED. 2. `POST /api/v1/samples/<SR_CLOSED_UUID>/close`. | HTTP 400. "Sample record is already closed". | API | |
| TC-SMP-055 | Admin | Close DISPATCHED sample returns 400 | P0 | 1. Dispatched sample. 2. Close. | HTTP 400. "Cannot close a dispatched sample". | API | |
| TC-SMP-056 | Admin | Close empty (CREATED) sample returns 400 | P0 | 1. `SR_CREATED_UUID` has `child_count = 0`. 2. Close. | HTTP 400. "Cannot close an empty sample record". | API | |
| TC-SMP-057 | Admin | Close non-existent sample returns 404 | P1 | 1. `POST /api/v1/samples/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "Sample record not found". | API | |

---

## Section 5 — Full unpack (POST /samples/:id/full-unpack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-060 | Admin | Admin full-unpacks ACTIVE sample | P0 | 1. Pre-condition: `SR_ACTIVE_UUID` has 3 SAMPLE boxes. 2. `POST /api/v1/samples/<SR_ACTIVE_UUID>/full-unpack`. | HTTP 200. `{ id: <SR_ACTIVE_UUID>, status: "CREATED", child_count: 0 }`. All 3 boxes now FREE. All 3 `sample_box_mapping` rows `is_active = false`, `unmapped_at` populated. 3 `CHILD_UNSAMPLED` transaction rows. | Integration | |
| TC-SMP-061 | Admin | Full-unpack CLOSED sample releases boxes | P1 | 1. `SR_CLOSED_UUID` CLOSED with 2 boxes. 2. Full-unpack. | HTTP 200. `status = "CREATED"`. `child_count = 0`. Both boxes FREE. | Integration | CLOSED → CREATED. DISPATCHED is the only guard. |
| TC-SMP-062 | Admin | Full-unpack DISPATCHED sample returns 400 | P0 | 1. Dispatched sample. 2. Full-unpack. | HTTP 400. "Cannot unpack a dispatched sample". | API | |
| TC-SMP-063 | Admin | Full-unpack CREATED (empty) sample returns 400 | P0 | 1. `SR_CREATED_UUID` with child_count = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty sample record". | API | |
| TC-SMP-064 | Warehouse Operator | Warehouse Operator can full-unpack | P1 | 1. Login as Warehouse Operator. Valid full-unpack request. | HTTP 200. | API | |
| TC-SMP-065 | Dispatch Operator | Dispatch Operator cannot full-unpack | P0 | 1. Login as Dispatch Operator. 2. Full-unpack request. | HTTP 403. | API | |

---

## Section 6 — Read endpoints

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-070 | Admin | GET /samples returns paginated list | P0 | 1. `GET /api/v1/samples`. | HTTP 200. `{ data: [...], total: <n>, page: 1, limit: 25 }`. Each item: `id`, `sample_barcode`, `name`, `status`, `child_count`, `customer_id`, `customer_name`, `recipient_name`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`, `created_at`. | API | |
| TC-SMP-071 | Admin | GET /samples?status=ACTIVE filters correctly | P1 | 1. `GET /api/v1/samples?status=ACTIVE`. | All items `status = "ACTIVE"`. | API | |
| TC-SMP-072 | Admin | GET /samples?search=<name_or_barcode> filters | P1 | 1. `GET /api/v1/samples?search=Trade Fair`. | Items whose `sample_barcode` or `name` ILIKE `%Trade Fair%`. | API | Both fields searched. |
| TC-SMP-073 | Admin | GET /samples?customer_id=<uuid> filters by customer | P1 | 1. `GET /api/v1/samples?customer_id=<CUSTOMER_UUID_A>`. | All items have `customer_id = CUSTOMER_UUID_A`. | API | |
| TC-SMP-074 | Any | GET /samples without auth returns 401 | P0 | 1. No credentials. `GET /api/v1/samples`. | HTTP 401. | API | |
| TC-SMP-075 | Admin | GET /samples/:id returns record with child_boxes | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE_UUID>`. | HTTP 200. `{ id: ..., sample_barcode: ..., status: "ACTIVE", child_count: <n>, child_boxes: [ { child_box_id, barcode, status: "SAMPLE", article_name, size, colour, mrp } ] }`. `child_boxes.length` = `child_count`. | API | |
| TC-SMP-076 | Admin | GET /samples/non-existent returns 404 | P1 | 1. `GET /api/v1/samples/00000000-0000-0000-0000-000000000000`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-077 | Admin | GET /samples/:id/children returns active mappings only | P0 | 1. Sample has 2 active + 1 inactive mapping. 2. `GET /api/v1/samples/<SR_ID>/children`. | Array of 2 items. Each: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `mapped_at`, `is_active = true`. | API | |
| TC-SMP-078 | Admin | GET /samples/:id/assortment returns grouping | P0 | 1. Sample has 2 Size-6 Blue + 1 Size-7 Red boxes. 2. `GET /api/v1/samples/<SR_ID>/assortment`. | Array: `[ { article_name, colour: "Blue", size: "6", mrp, count: 2 }, { article_name, colour: "Red", size: "7", mrp, count: 1 } ]`. Ordered by article_name, colour, size. | API | |
| TC-SMP-079 | Admin | GET /samples/qr/:barcode returns record by barcode | P0 | 1. `GET /api/v1/samples/qr/BINNY-SR-<uuid>`. | HTTP 200. `sample_barcode` matches. `child_boxes` present. | API | |
| TC-SMP-080 | Admin | GET /samples/qr/NONEXISTENT returns 404 | P1 | 1. `GET /api/v1/samples/qr/BINNY-SR-00000000`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-081 | Warehouse Operator | Warehouse Operator can read all sample endpoints | P1 | 1. Login as Warehouse Operator. GET list, GET by id, GET children, GET assortment. | All return HTTP 200. | API | |
| TC-SMP-082 | Dispatch Operator | Dispatch Operator can read all sample endpoints | P1 | 1. Login as Dispatch Operator. GET list, GET by id. | HTTP 200 for all reads. | API | |

---

## Section 7 — Stock semantics

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-085 | Admin | SAMPLE boxes are excluded from pairsInStock | P0 | 1. Record `pairsInStock` for a product before adding boxes to a sample. 2. Add 5 boxes of that product to a sample. 3. Re-query stock for that product. | `pairsInStock` decreased by 5 (SAMPLE boxes excluded from available stock). | Integration | Verify via `GET /api/v1/inventory/stock` or stock hierarchy endpoint. |
| TC-SMP-086 | Admin | SAMPLE boxes are counted in total physical inventory | P1 | 1. Query `getStockByLevel` aggregate (e.g. `GET /api/v1/inventory`). | SAMPLE boxes appear in the total physical count (they are physically present). They appear as allocated, not available. | Integration | Distinct from `pairsInStock` exclusion. |
| TC-SMP-087 | Admin | Dashboard shows Sample Boxes KPI | P1 | 1. Navigate to `/dashboard` (or `GET /api/v1/inventory/summary`). | A "Sample Boxes" KPI card or count field is present. Its value equals the count of child boxes with `status = SAMPLE`. | E2E | New Apr 27 KPI. |
| TC-SMP-088 | Admin | Removing box from sample restores pairsInStock | P1 | 1. Add 3 boxes to sample. Note `pairsInStock`. 2. Remove 1 box from sample. 3. Re-query. | `pairsInStock` increases by 1. | Integration | |

---

## Section 8 — Transaction log correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-090 | Admin | Create sample writes SAMPLE_CREATED transaction | P0 | 1. Create sample. 2. `SELECT * FROM inventory_transactions WHERE transaction_type = 'SAMPLE_CREATED'` and `metadata->>'sample_record_id' = '<NEW_ID>'`. | 1 row. `performed_by` = creator id. `notes` contains barcode. | Integration | |
| TC-SMP-091 | Admin | Add box writes CHILD_SAMPLED transaction | P0 | 1. Add box to sample. 2. Query `inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_SAMPLED'`. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-092 | Admin | Add GENERATED box writes CHILD_ACTIVATED then CHILD_SAMPLED | P0 | 1. Add GENERATED box to sample. 2. Query transactions for that child box, ordered by `created_at`. | Two rows in order: `CHILD_ACTIVATED`, `CHILD_SAMPLED`. | Integration | |
| TC-SMP-093 | Admin | Remove box writes CHILD_UNSAMPLED transaction | P0 | 1. Remove box from sample. 2. Query `CHILD_UNSAMPLED` for that box. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-094 | Admin | Remove last box writes SAMPLE_REOPENED transaction | P0 | 1. Remove last box from ACTIVE sample. 2. Query `SAMPLE_REOPENED`. | 1 row with `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-095 | Admin | Close sample writes SAMPLE_CLOSED transaction | P0 | 1. Close sample. 2. Query `SAMPLE_CLOSED`. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-096 | Admin | Full-unpack writes N × CHILD_UNSAMPLED | P0 | 1. Full-unpack sample with 4 boxes. 2. Count `CHILD_UNSAMPLED` for this sample. | 4 rows. Each references a different `child_box_id`. All have `metadata->>'sample_record_id'` = sample id. | Integration | |

---

## Section 9 — Status transition integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-100 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty sample → CREATED. 2. Add box → ACTIVE. 3. Close → CLOSED. 4. Dispatch (Phase 13) → DISPATCHED. | Each step transitions correctly. | Integration | |
| TC-SMP-101 | Admin | Cannot add box to DISPATCHED sample | P0 | 1. Dispatched sample. 2. Add-box request. | HTTP 400. | API | |
| TC-SMP-102 | Admin | Sample has no repack endpoint | P1 | 1. `POST /api/v1/samples/repack` (does not exist). | HTTP 404. Route not found. Operations use separate remove + add. | API | By design — no repack in sample module. |
| TC-SMP-103 | Admin | Sample has no label print endpoint | P1 | 1. There is no `GET /api/v1/samples/:id/label` endpoint. | Route not found (404) or not listed in routes file. No label printing for samples in v1. | Manual | Confirmed by inspection of sample.routes.ts — no label route. |

---

## Section 10 — Frontend E2E

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-E2E-001 | Admin | Samples list page loads | P0 | 1. Login as Admin. 2. Navigate to `/samples`. | Heading "Samples" (or "Sample Records") visible. List/table shows sample records. Create button visible. | E2E | |
| TC-SMP-E2E-002 | Admin | Status filter on samples list | P1 | 1. On `/samples`, filter by "ACTIVE". | List updates. API call includes `status=ACTIVE`. | E2E | |
| TC-SMP-E2E-003 | Admin | Create sample page loads with correct fields | P0 | 1. Navigate to `/samples/create`. | Form fields visible: Name (required), Customer (dropdown), Recipient Name (free text), Purpose, Sample Date, Notes. Child box scan/search section. | E2E | |
| TC-SMP-E2E-004 | Admin | Sample detail page shows status badge and timeline | P0 | 1. Navigate to `/samples/<SR_ACTIVE_UUID>`. | Status badge "ACTIVE" visible. Timeline of inventory transactions visible. Assortment table visible. Children list visible. | E2E | |
| TC-SMP-E2E-005 | Admin | Close button visible on ACTIVE sample detail for Admin | P0 | 1. Navigate to `/samples/<SR_ACTIVE_UUID>` as Admin. | "Close Sample" button is visible in the action bar. | E2E | |
| TC-SMP-E2E-006 | Warehouse Operator | No Close button for Warehouse Operator on sample detail | P0 | 1. Login as Warehouse Operator. Navigate to `/samples/<SR_ACTIVE_UUID>`. | "Close Sample" button NOT visible. Add-box and remove-box actions visible. | E2E | |
| TC-SMP-E2E-007 | Dispatch Operator | Dispatch Operator sees read-only sample detail | P1 | 1. Login as Dispatch Operator. Navigate to `/samples/<SR_ACTIVE_UUID>`. | Page loads. No create/edit/close/add-box buttons visible. | E2E | |
