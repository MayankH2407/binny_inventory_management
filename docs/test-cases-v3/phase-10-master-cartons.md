# Phase 10 — Master Cartons

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `MC` (API/Integration), `MC-E2E` (browser E2E)
**Phase dependencies:** Phase 07 (child box lifecycle) must have run first so FREE and GENERATED boxes exist.
**Last updated:** 2026-04-30

---

## Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `PRODUCT_UUID_A` | Active product: article "Binny Slipper", code "BS-001", colour "Blue", size "6", MRP ₹299.00 |
| `CB_FREE_1..N` | FREE child boxes (created via Phase 07/08) |
| `CB_GEN_1` | GENERATED child box |
| `MC_ACTIVE_UUID` | An ACTIVE master carton with at least 2 child boxes (created during this phase) |
| `MC_CLOSED_UUID` | A CLOSED master carton (at least 1 child box) |
| `MC_CREATED_UUID` | A CREATED (empty) master carton |
| API base | `http://localhost:5000/api/v1` |

---

## Section 1 — Create master carton (POST /master-cartons)

### 1.1 — Role-gated creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-001 | Admin | Admin creates empty master carton (no barcodes) | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 201. Response: `{ id: <uuid>, carton_barcode: "BINNY-MC-<uuid>", status: "CREATED", child_count: 0, max_capacity: 50, qr_data_uri: "data:image/png;base64,..." }`. `carton_barcode` starts with `"BINNY-MC-"`. `status = "CREATED"`. `qr_data_uri` non-empty. DB row in `master_cartons` with matching id. `inventory_transactions` row with `transaction_type = "CARTON_CREATED"` and `master_carton_id` matching new carton id. | API | |
| TC-MC-002 | Admin | Admin creates master carton with 3 FREE child boxes | P0 | 1. Pre-condition: 3 FREE boxes exist with barcodes `CB_BAR_1`, `CB_BAR_2`, `CB_BAR_3`. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_2>","<CB_BAR_3>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 3`. All 3 child boxes now have `status = "PACKED"` (verify via `GET /api/v1/child-boxes/qr/<CB_BAR_1>`). `inventory_transactions` contains: 1 `CARTON_CREATED` row + 3 `CHILD_PACKED` rows, all linked to the new carton. | Integration | |
| TC-MC-003 | Admin | Admin creates carton with GENERATED child box — auto-activates | P0 | 1. Pre-condition: `CB_GEN_1` is GENERATED with barcode `CB_GEN_BAR`. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 1`. Child box `CB_GEN_1` has `status = "PACKED"`. `inventory_transactions` contains a `CHILD_ACTIVATED` row for `CB_GEN_1` AND a `CHILD_PACKED` row for `CB_GEN_1`, in that order, both linked to the new carton. | Integration | Confirms the GENERATED → implicit activation → PACKED double-write. |
| TC-MC-004 | Supervisor | Supervisor creates master carton with FREE boxes | P1 | 1. Login as Supervisor. 2. Pre-condition: 2 FREE boxes `CB_BAR_S1`, `CB_BAR_S2`. 3. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_S1>","<CB_BAR_S2>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 2`. Both boxes PACKED. | API | |
| TC-MC-005 | Warehouse Operator | Warehouse Operator creates master carton | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_W1>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 1`. | API | |
| TC-MC-006 | Dispatch Operator | Dispatch Operator cannot create master carton | P0 | 1. Login as Dispatch Operator (`dispatch@binny.com` / `Dp@123`). 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 403. No carton created in DB. | API | |
| TC-MC-007 | Admin | Create with custom max_capacity | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 20}`. | HTTP 201. `max_capacity = 20`. `status = "CREATED"`. | API | |
| TC-MC-008 | Admin | Create with max_capacity > 100 returns 400 | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 101}`. | HTTP 400. Validation error "Max capacity must not exceed 100". No carton created. | API | Zod schema: `.max(100, ...)`. |
| TC-MC-009 | Admin | Create with non-existent barcode returns 404 | P0 | 1. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["BINNY-CB-00000000-0000-0000-0000-000000000000"]}`. | HTTP 404. Error "Child box with barcode BINNY-CB-00000000... not found". No carton created. Transaction rolled back. | API | |
| TC-MC-010 | Admin | Create with PACKED child box returns 400 | P0 | 1. Pre-condition: `CB_PACKED` has status PACKED. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_PACKED_BAR>"]}`. | HTTP 400. Error contains "currently PACKED" and "Only FREE or GENERATED boxes can be packed". No carton created. | API | |
| TC-MC-011 | Admin | Create with SAMPLE child box returns 400 | P1 | 1. Pre-condition: A SAMPLE-status child box `CB_SAMPLE_BAR` exists. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_SAMPLE_BAR>"]}`. | HTTP 400. Error contains "currently SAMPLE". No carton created. | API | |
| TC-MC-012 | Admin | Create with duplicate barcode in array — second entry rejected | P1 | 1. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_1>"]}`. | HTTP 400 or 409. Error indicates the box is already PACKED after the first pass. No partial state left. Transaction rolled back. | API | After first barcode, box status = PACKED; second pass fails on status guard. |
| TC-MC-013 | Admin | Create exceeds max_capacity returns 400 | P1 | 1. Create carton with `max_capacity = 2`. 2. `POST /api/v1/master-cartons` body `{"max_capacity": 2, "child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_2>","<CB_BAR_3>"]}`. | HTTP 400. Error "Master carton is full (2/2)". Only 0 boxes packed (transaction rolled back). | API | |

---

## Section 2 — Pack child box (POST /master-cartons/pack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-020 | Admin | Admin packs a FREE box into an ACTIVE carton | P0 | 1. Pre-condition: `MC_ACTIVE_UUID` is ACTIVE, `CB_FREE_NEW` is FREE. 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Response: `{ carton: { id: <MC_ACTIVE_UUID>, status: "ACTIVE", child_count: <prev+1> }, mapping: { master_carton_id: <MC_ACTIVE_UUID>, child_box_id: <CB_FREE_NEW_UUID>, is_active: true } }`. Child box status = PACKED. `inventory_transactions` row `CHILD_PACKED`. | API | |
| TC-MC-021 | Admin | Packing into CREATED carton transitions it to ACTIVE | P0 | 1. Pre-condition: `MC_CREATED_UUID` is CREATED (empty). `CB_FREE_A` is FREE. 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_A_UUID>", "master_carton_id": "<MC_CREATED_UUID>"}`. | HTTP 200. `carton.status = "ACTIVE"`. `carton.child_count = 1`. | Integration | CREATED → ACTIVE on first pack. |
| TC-MC-022 | Admin | Pack GENERATED box auto-activates it | P0 | 1. Pre-condition: `CB_GEN_2` is GENERATED, `MC_ACTIVE_UUID` is ACTIVE. 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_GEN_2_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Child box status = PACKED. `inventory_transactions` contains a `CHILD_ACTIVATED` row for the box followed by a `CHILD_PACKED` row. Both rows reference `child_box_id = CB_GEN_2_UUID`. | Integration | |
| TC-MC-023 | Supervisor | Supervisor packs box into carton | P1 | 1. Login as Supervisor. Pre-condition: ACTIVE carton and FREE box. 2. `POST /api/v1/master-cartons/pack` body with valid ids. | HTTP 200. `child_count` incremented. Box PACKED. | API | |
| TC-MC-024 | Warehouse Operator | Warehouse Operator packs box into carton | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/pack` valid body. | HTTP 200. Box PACKED. | API | |
| TC-MC-025 | Dispatch Operator | Dispatch Operator cannot pack box | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/pack` with valid body. | HTTP 403. Box status unchanged. | API | |
| TC-MC-026 | Admin | Pack into CLOSED carton returns 400 | P0 | 1. Pre-condition: `MC_CLOSED_UUID` is CLOSED. `CB_FREE_B` is FREE. 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_B_UUID>", "master_carton_id": "<MC_CLOSED_UUID>"}`. | HTTP 400. Error "Master carton is CLOSED and cannot accept new child boxes". Box remains FREE. | API | |
| TC-MC-027 | Admin | Pack when carton is at max capacity returns 400 | P1 | 1. Pre-condition: ACTIVE carton with `child_count = max_capacity`. 2. Pack another box. | HTTP 400. Error "Master carton is full (<n>/<max>)". Box remains FREE. | API | |
| TC-MC-028 | Admin | Pack non-existent child box returns 404 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "00000000-0000-0000-0000-000000000000", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 404. "Child box not found". | API | |
| TC-MC-029 | Admin | Pack into non-existent carton returns 404 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_UUID>", "master_carton_id": "00000000-0000-0000-0000-000000000000"}`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-030 | Admin | Pack with non-UUID child_box_id returns 400 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "not-a-uuid", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 400. Validation error "Invalid child box ID format". | API | |
| TC-MC-031 | Admin | Partial unique index prevents same box in two active cartons | P0 | 1. Pre-condition: `CB_FREE_C` packed into `MC_A` (active mapping exists). 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_C_UUID>", "master_carton_id": "<MC_B_UUID>"}`. | HTTP 400. Child box is currently PACKED, so status guard fires first with "Child box is currently PACKED". Alternatively if guard missed, DB unique index `idx_unique_active_master_carton_mapping` raises a constraint violation → 409. No duplicate mapping created. | API | Status guard fires before the DB insert. |

---

## Section 3 — Unpack child box (POST /master-cartons/unpack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-040 | Admin | Admin unpacks a box from ACTIVE carton | P0 | 1. Pre-condition: `CB_PACKED_X` is PACKED in `MC_ACTIVE_UUID`. 2. `POST /api/v1/master-cartons/unpack` body `{"child_box_id": "<CB_PACKED_X_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Response is the updated carton: `{ id: <MC_ACTIVE_UUID>, child_count: <prev-1>, status: "ACTIVE" }`. Child box `CB_PACKED_X` now has `status = "FREE"`. `carton_child_mapping` row has `is_active = false`, `unpacked_at` populated. `inventory_transactions` row `CHILD_UNPACKED`. | Integration | |
| TC-MC-041 | Admin | Unpacking last box from ACTIVE carton → status CREATED | P0 | 1. Pre-condition: ACTIVE carton with `child_count = 1`. 2. Unpack that one box. | Carton `status = "CREATED"`. `child_count = 0`. Child box = FREE. | Integration | Code: `newStatus = newChildCount === 0 ? CREATED : carton.status`. |
| TC-MC-042 | Admin | Unpack from CLOSED carton is allowed (returns box to FREE, carton stays CLOSED) | P1 | 1. Pre-condition: `MC_CLOSED_UUID` is CLOSED with ≥ 1 packed box. 2. Unpack one box. | HTTP 200. Child box = FREE. Carton `child_count` decremented. Carton status remains CLOSED (not reverted). | Integration | Code: DISPATCHED guard but not CLOSED guard for unpack. |
| TC-MC-043 | Admin | Unpack from DISPATCHED carton returns 400 | P0 | 1. Pre-condition: `MC_DISPATCHED` has status DISPATCHED. 2. `POST /api/v1/master-cartons/unpack` with valid body. | HTTP 400. Error "Cannot unpack from a dispatched carton". | API | |
| TC-MC-044 | Warehouse Operator | Warehouse Operator can unpack box | P1 | 1. Login as Warehouse Operator. Pre-condition: ACTIVE carton with packed box. 2. `POST /api/v1/master-cartons/unpack` valid body. | HTTP 200. Box = FREE. | API | |
| TC-MC-045 | Dispatch Operator | Dispatch Operator cannot unpack | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/unpack` valid body. | HTTP 403. | API | |
| TC-MC-046 | Admin | Unpack non-existent mapping returns 404 | P1 | 1. `POST /api/v1/master-cartons/unpack` body `{"child_box_id": "<CB_FREE_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}` (box is FREE, not in carton). | HTTP 404. "Active mapping not found for this child box and carton". | API | |

---

## Section 4 — Repack child box (POST /master-cartons/repack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-050 | Admin | Admin repacks box from source to destination carton | P0 | 1. Pre-condition: `CB_PACKED_Y` is PACKED in `MC_SRC`. `MC_DST` is ACTIVE with available capacity. 2. `POST /api/v1/master-cartons/repack` body `{"child_box_id": "<CB_PACKED_Y_UUID>", "source_carton_id": "<MC_SRC_UUID>", "destination_carton_id": "<MC_DST_UUID>"}`. | HTTP 200. Response: `{ sourceCarton: { id: <MC_SRC_UUID>, child_count: <src_prev-1> }, destinationCarton: { id: <MC_DST_UUID>, child_count: <dst_prev+1> } }`. Old `carton_child_mapping` row `is_active = false`. New `carton_child_mapping` row created with `is_active = true`. Child box status remains PACKED. `inventory_transactions` row `CHILD_REPACKED` referencing `destination_carton_id` with `metadata.source_carton_id`. | Integration | |
| TC-MC-051 | Admin | Repack to CLOSED destination returns 400 | P0 | 1. Pre-condition: box PACKED in `MC_SRC`, `MC_DST_CLOSED` is CLOSED. 2. `POST /api/v1/master-cartons/repack` body targeting the closed destination. | HTTP 400. Error "Destination carton is CLOSED and cannot accept child boxes". Source carton unchanged. | API | |
| TC-MC-052 | Admin | Repack to full destination returns 400 | P1 | 1. Pre-condition: `MC_DST_FULL` at max_capacity. 2. Repack to it. | HTTP 400. Error "Destination carton is full (<n>/<max>)". | API | |
| TC-MC-053 | Admin | Repack box not in source carton returns 404 | P1 | 1. `POST /api/v1/master-cartons/repack` with `source_carton_id` that doesn't contain the box. | HTTP 404. "Child box is not in the source carton". | API | |
| TC-MC-054 | Admin | Repack to DISPATCHED destination returns 400 | P1 | 1. Attempt repack to DISPATCHED carton. | HTTP 400. "Destination carton is DISPATCHED and cannot accept child boxes". | API | |
| TC-MC-055 | Admin | Repack reduces source child_count to 0 → CREATED | P1 | 1. `MC_SRC` has `child_count = 1`. Repack its only box out. | `sourceCarton.status = "CREATED"`. `sourceCarton.child_count = 0`. | Integration | `srcNewStatus = srcNewCount === 0 ? CREATED : src.status`. |
| TC-MC-056 | Admin | Repack to CREATED destination transitions it to ACTIVE | P1 | 1. `MC_DST_EMPTY` has status CREATED. Repack a box into it. | `destinationCarton.status = "ACTIVE"`. `destinationCarton.child_count = 1`. | Integration | |
| TC-MC-057 | Supervisor | Supervisor can repack | P1 | 1. Login as Supervisor. Repack box between two valid cartons. | HTTP 200. | API | |
| TC-MC-058 | Warehouse Operator | Warehouse Operator can repack | P1 | 1. Login as Warehouse Operator. Valid repack request. | HTTP 200. | API | |
| TC-MC-059 | Dispatch Operator | Dispatch Operator cannot repack | P0 | 1. Login as Dispatch Operator. Valid body for repack. | HTTP 403. | API | |
| TC-MC-060 | Admin | Repack missing field returns 400 | P1 | 1. `POST /api/v1/master-cartons/repack` body `{"child_box_id": "<uuid>", "source_carton_id": "<uuid>"}` (no destination_carton_id). | HTTP 400. Zod validation error for missing `destination_carton_id`. | API | |

---

## Section 5 — Close master carton (POST /master-cartons/:id/close)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-070 | Admin | Admin closes ACTIVE carton | P0 | 1. Pre-condition: `MC_ACTIVE_UUID` is ACTIVE with child_count ≥ 1. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/close`. | HTTP 200. Response: `{ id: <MC_ACTIVE_UUID>, status: "CLOSED", closed_at: <ISO timestamp> }`. `closed_at` is non-null. `inventory_transactions` row `CARTON_CLOSED` for this carton. | Integration | |
| TC-MC-071 | Supervisor | Supervisor closes ACTIVE carton | P1 | 1. Login as Supervisor. Pre-condition: ACTIVE carton with boxes. 2. `POST /api/v1/master-cartons/<MC_UUID>/close`. | HTTP 200. `status = "CLOSED"`. `closed_at` populated. | API | |
| TC-MC-072 | Warehouse Operator | Warehouse Operator cannot close carton | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/close`. | HTTP 403. Carton status unchanged. | API | |
| TC-MC-073 | Dispatch Operator | Dispatch Operator cannot close carton | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/close`. | HTTP 403. | API | |
| TC-MC-074 | Admin | Close already CLOSED carton returns 400 | P0 | 1. Pre-condition: `MC_CLOSED_UUID` is CLOSED. 2. `POST /api/v1/master-cartons/<MC_CLOSED_UUID>/close`. | HTTP 400. Error "Master carton is already closed". | API | |
| TC-MC-075 | Admin | Close DISPATCHED carton returns 400 | P0 | 1. Pre-condition: DISPATCHED carton. 2. Attempt close. | HTTP 400. Error "Cannot close a dispatched carton". | API | |
| TC-MC-076 | Admin | Close empty (CREATED) carton returns 400 | P0 | 1. Pre-condition: `MC_CREATED_UUID` is CREATED with child_count = 0. 2. `POST /api/v1/master-cartons/<MC_CREATED_UUID>/close`. | HTTP 400. Error "Cannot close an empty carton". | API | |
| TC-MC-077 | Admin | Close carton with non-UUID id returns 400 | P1 | 1. `POST /api/v1/master-cartons/not-a-uuid/close`. | HTTP 400. Validation error "Invalid master carton ID format". | API | |
| TC-MC-078 | Admin | Close non-existent carton returns 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "Master carton not found". | API | |

---

## Section 6 — Full unpack (POST /master-cartons/:id/full-unpack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-080 | Admin | Admin full-unpacks ACTIVE carton | P0 | 1. Pre-condition: `MC_ACTIVE_UUID` is ACTIVE with 3 PACKED boxes. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/full-unpack`. | HTTP 200. Response: `{ id: <MC_ACTIVE_UUID>, status: "CREATED", child_count: 0 }`. All 3 previously-packed boxes now have `status = "FREE"`. All 3 `carton_child_mapping` rows have `is_active = false`, `unpacked_at` populated. 3 `CHILD_UNPACKED` transaction rows. | Integration | |
| TC-MC-081 | Admin | Full-unpack CLOSED carton releases boxes | P1 | 1. Pre-condition: `MC_CLOSED_UUID` CLOSED with 2 boxes. 2. Full-unpack. | HTTP 200. `status = "CREATED"`. `child_count = 0`. Both boxes FREE. | Integration | CLOSED → CREATED. No guard prevents this (only DISPATCHED is blocked). |
| TC-MC-082 | Admin | Full-unpack DISPATCHED carton returns 400 | P0 | 1. Pre-condition: DISPATCHED carton. 2. `POST /api/v1/master-cartons/<MC_DISPATCHED>/full-unpack`. | HTTP 400. "Cannot unpack a dispatched carton". | API | |
| TC-MC-083 | Admin | Full-unpack CREATED (empty) carton returns 400 | P0 | 1. Pre-condition: `MC_CREATED_UUID` CREATED with child_count = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty carton". | API | |
| TC-MC-084 | Warehouse Operator | Warehouse Operator can full-unpack | P1 | 1. Login as Warehouse Operator. Valid full-unpack request. | HTTP 200. Boxes freed. | API | |
| TC-MC-085 | Dispatch Operator | Dispatch Operator cannot full-unpack | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/full-unpack`. | HTTP 403. | API | |
| TC-MC-086 | Admin | Full-unpack non-existent carton returns 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/full-unpack`. | HTTP 404. "Master carton not found". | API | |

---

## Section 7 — Read endpoints

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-090 | Admin | GET /master-cartons returns paginated list | P0 | 1. `GET /api/v1/master-cartons`. | HTTP 200. `{ data: [...], total: <n>, page: 1, limit: 25, totalPages: <n> }`. Each item has: `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `created_at`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. | API | |
| TC-MC-091 | Admin | GET /master-cartons?status=ACTIVE filters correctly | P1 | 1. `GET /api/v1/master-cartons?status=ACTIVE`. | HTTP 200. All items have `status = "ACTIVE"`. | API | |
| TC-MC-092 | Admin | GET /master-cartons?status=CLOSED filters correctly | P1 | 1. `GET /api/v1/master-cartons?status=CLOSED`. | HTTP 200. All items `status = "CLOSED"`. | API | |
| TC-MC-093 | Admin | GET /master-cartons?search=<barcode> returns matching record | P1 | 1. Obtain `MC_BARCODE`. 2. `GET /api/v1/master-cartons?search=<MC_BARCODE>`. | HTTP 200. `data` contains at least the matching carton. | API | Search does `ILIKE %term%` on `carton_barcode`. |
| TC-MC-094 | Any | GET /master-cartons without auth returns 401 | P0 | 1. `GET /api/v1/master-cartons` with no credentials. | HTTP 401. | API | |
| TC-MC-095 | Admin | GET /master-cartons/:id returns carton with child_boxes array | P0 | 1. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>`. | HTTP 200. Response: `{ id: <MC_ACTIVE_UUID>, carton_barcode: ..., status: "ACTIVE", child_count: <n>, child_boxes: [ { child_box_id: ..., barcode: ..., status: "PACKED", article_name: ..., size: ..., colour: ..., mrp: ... } ] }`. `child_boxes` length equals `child_count`. | API | |
| TC-MC-096 | Admin | GET /master-cartons/non-existent-id returns 404 | P1 | 1. `GET /api/v1/master-cartons/00000000-0000-0000-0000-000000000000`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-097 | Admin | GET /master-cartons/:id/children returns active mappings only | P0 | 1. Pre-condition: carton has 2 active + 1 inactive (unpacked) mapping. 2. `GET /api/v1/master-cartons/<MC_UUID>/children`. | HTTP 200. Array contains exactly 2 items (active mappings only, `is_active = true`). Each item: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`. | API | |
| TC-MC-098 | Admin | GET /master-cartons/:id/assortment returns colour×size grid | P0 | 1. Pre-condition: carton contains 2 Size-6 Blue boxes and 1 Size-7 Blue box. 2. `GET /api/v1/master-cartons/<MC_UUID>/assortment`. | HTTP 200. Array: `[ { article_name: "Binny Slipper", colour: "Blue", size: "6", mrp: 299.00, count: 2 }, { article_name: "Binny Slipper", colour: "Blue", size: "7", mrp: 299.00, count: 1 } ]`. Ordered by article_name, colour, size. | API | |
| TC-MC-099 | Admin | GET /master-cartons/qr/:barcode returns carton by barcode | P0 | 1. Obtain `CARTON_BARCODE` = `BINNY-MC-<uuid>`. 2. `GET /api/v1/master-cartons/qr/<CARTON_BARCODE>`. | HTTP 200. Response has `carton_barcode` matching requested value. `child_boxes` array present. | API | |
| TC-MC-100 | Admin | GET /master-cartons/qr/NONEXISTENT returns 404 | P1 | 1. `GET /api/v1/master-cartons/qr/BINNY-MC-00000000`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-101 | Warehouse Operator | Warehouse Operator can read all list/detail endpoints | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/master-cartons`. 3. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>`. | Both return HTTP 200. Full data visible. | API | Read is open to all authenticated roles. |
| TC-MC-102 | Dispatch Operator | Dispatch Operator can read list and detail | P1 | 1. Login as Dispatch Operator. 2. GET list and detail. | HTTP 200 for both. | API | |

---

## Section 8 — Status transition integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-110 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty carton → CREATED. 2. Pack a box → ACTIVE. 3. Close → CLOSED. 4. Dispatch (via Phase 13 flow) → DISPATCHED. | Each step transitions correctly. Final status = DISPATCHED. `closed_at` populated after step 3. `dispatched_at` populated after step 4. | Integration | DISPATCHED transition belongs to Phase 13. |
| TC-MC-111 | Admin | Cannot add box to DISPATCHED carton | P0 | 1. Pre-condition: DISPATCHED carton. 2. `POST /api/v1/master-cartons/pack` with box targeting it. | HTTP 400. "Master carton is DISPATCHED and cannot accept new child boxes". | API | |
| TC-MC-112 | Admin | Unpacking all boxes from ACTIVE reverts to CREATED | P0 | 1. ACTIVE carton with 1 box. 2. Unpack it. | `status = "CREATED"`. `child_count = 0`. | Integration | |
| TC-MC-113 | Admin | Closing CREATED (empty) carton returns 400 | P0 | 1. CREATED carton with `child_count = 0`. 2. Attempt close. | HTTP 400. "Cannot close an empty carton". | API | |

---

## Section 9 — Inventory transaction correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-120 | Admin | Create carton writes CARTON_CREATED transaction | P0 | 1. Create a carton. 2. `SELECT * FROM inventory_transactions WHERE master_carton_id = '<NEW_ID>' AND transaction_type = 'CARTON_CREATED'`. | Exactly 1 row. `performed_by` = admin user id. `notes` contains new barcode. | Integration | |
| TC-MC-121 | Admin | Pack box writes CHILD_PACKED transaction | P0 | 1. Pack a FREE box into carton. 2. Query `inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_PACKED'`. | 1 row. `master_carton_id` = carton id. `performed_by` = user id. | Integration | |
| TC-MC-122 | Admin | Pack GENERATED box writes CHILD_ACTIVATED then CHILD_PACKED | P0 | 1. Pack a GENERATED box. 2. `SELECT * FROM inventory_transactions WHERE child_box_id = '<CB_GEN_ID>' ORDER BY created_at`. | Two consecutive rows: `CHILD_ACTIVATED` (earlier), `CHILD_PACKED` (later). Both reference the same `child_box_id`. `CHILD_PACKED` also references `master_carton_id`. | Integration | |
| TC-MC-123 | Admin | Unpack box writes CHILD_UNPACKED transaction | P0 | 1. Unpack a PACKED box. 2. Query `inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_UNPACKED'`. | 1 row. `master_carton_id` = carton id. | Integration | |
| TC-MC-124 | Admin | Repack box writes CHILD_REPACKED transaction | P0 | 1. Repack a box from src to dst. 2. Query `inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_REPACKED'`. | 1 row. `master_carton_id` = destination carton id. `metadata` JSON contains `{ source_carton_id: <SRC>, destination_carton_id: <DST> }`. | Integration | |
| TC-MC-125 | Admin | Close carton writes CARTON_CLOSED transaction | P0 | 1. Close a carton. 2. Query `inventory_transactions WHERE master_carton_id = '<ID>' AND transaction_type = 'CARTON_CLOSED'`. | 1 row. `performed_by` = user id. | Integration | |
| TC-MC-126 | Admin | Full-unpack writes one CHILD_UNPACKED per box | P0 | 1. Full-unpack carton with 3 boxes. 2. `SELECT COUNT(*) FROM inventory_transactions WHERE master_carton_id = '<ID>' AND transaction_type = 'CHILD_UNPACKED'`. | Count = 3. Each row references a different `child_box_id`. | Integration | |

---

## Section 10 — Frontend E2E

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-E2E-001 | Admin | Master Cartons list page loads | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons`. | URL is `/master-cartons`. Heading "Master Cartons" visible. Table or card list displays carton rows. "Create Master Carton" (or equivalent) button visible. | E2E | |
| TC-MC-E2E-002 | Admin | Status filter on list page works | P1 | 1. On `/master-cartons`, select "ACTIVE" in the status filter. | List refreshes to show only ACTIVE cartons. API call includes `status=ACTIVE`. | E2E | |
| TC-MC-E2E-003 | Admin | Create page loads with scan-to-add wizard | P0 | 1. Navigate to `/master-cartons/create`. | Page loads. "Create Master Carton" heading visible. A scan/search input for adding child boxes is present. | E2E | |
| TC-MC-E2E-004 | Admin | Detail page shows carton header, status, child list, action bar | P0 | 1. Navigate to `/master-cartons/<MC_ACTIVE_UUID>`. | Page shows: carton_barcode, status badge "ACTIVE", child_count, max_capacity. Children list table present. Action bar has "Close Carton" button (Admin/Supervisor). | E2E | |
| TC-MC-E2E-005 | Admin | Detail page shows assortment table | P1 | 1. Navigate to `/master-cartons/<MC_ACTIVE_UUID>` where carton has mixed sizes. | Assortment section shows a colour×size breakdown table with counts. | E2E | |
| TC-MC-E2E-006 | Warehouse Operator | Warehouse Operator sees no Close button on detail page | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/master-cartons/<MC_ACTIVE_UUID>`. | Page loads. "Close Carton" button is not visible (or disabled). Add-box and remove-box actions visible. | E2E | |
| TC-MC-E2E-007 | Dispatch Operator | Dispatch Operator cannot see create button | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/master-cartons`. | "Create Master Carton" button is not visible. List is visible (read access). | E2E | |
