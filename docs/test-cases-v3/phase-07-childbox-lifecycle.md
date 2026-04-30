# Phase 07 — Child Box: Single Create + GENERATED Lifecycle

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3
**Phase:** 07 of 20
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (portal)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (portal)
**Last updated:** 2026-04-30

---

## Context — GENERATED lifecycle (Apr 27 mod)

All four creation paths now insert child boxes with `status = 'GENERATED'` (not `FREE`). A GENERATED box represents a printed label that has not yet entered active inventory. It is excluded from stock counts (`pairsInStock`, `getStockByLevel`) and from `GET /child-boxes/free`.

The `POST /child-boxes/:id/activate` endpoint transitions `GENERATED → FREE` idempotently:
- Calling it on a **GENERATED** box: flips status, writes one `CHILD_ACTIVATED` inventory_transaction + audit_log, returns updated box. HTTP 200.
- Calling it on a **FREE** box: no-op — returns the box unchanged. **No** transaction or audit entry written. HTTP 200.
- Calling it on a **PACKED** or **DISPATCHED** box: HTTP 409 with message `"Cannot activate child box in PACKED status"` / `"Cannot activate child box in DISPATCHED status"`.

When a **GENERATED** box is packed directly into a master carton (via `createMasterCarton` or `packChildBox`), the service writes **both** a `CHILD_ACTIVATED` and a `CHILD_PACKED` transaction so the trace timeline preserves the activation moment.

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `PRODUCT_UUID_A` | Active product from Phase 05 — `article_name="Busker"`, `colour="White"`, `size="6"`, `mrp=299` |
| `PRODUCT_UUID_B` | Active product — `article_name="Busker"`, `colour="White"`, `size="7"`, `mrp=299` |
| `CB_GEN_UUID` | Created by TC-CB-001; initially `status=GENERATED` |
| `CB_FREE_UUID` | Created by TC-CB-001 and activated by TC-CB-050; `status=FREE` |
| `CB_PACKED_UUID` | Created and packed into a master carton in TC-CB-060; `status=PACKED` |

---

## Phase 07: Child Box Single Create + GENERATED Lifecycle

### Section 1: Single Create (POST /child-boxes)

#### 1.1 — Role-based creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-001 | Admin | Admin creates single child box — status is GENERATED | P0 | 1. `POST /api/v1/auth/login` as `admin@binny.com` / `Admin@123`, save JWT. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`, header `Authorization: Bearer <JWT>`. | HTTP 201. Response: `{"success":true,"data":{"id":"<uuid>","barcode":"BINNY-CB-<uuid>","status":"GENERATED","quantity":1,"product_id":"<PRODUCT_UUID_A>","product_name":"Busker","size":"6","colour":"White","mrp":"299.00","qr_data_uri":"data:image/png;base64,..."}}`. **`status` MUST equal `"GENERATED"`** (not FREE). `barcode` starts with `"BINNY-CB-"`. `qr_data_uri` is non-empty. Save `id` as `CB_GEN_UUID`. | API | Apr 27 mod: status is GENERATED not FREE |
| TC-CB-002 | Admin | Admin creates child box with quantity=12 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":12}`. | HTTP 201. `data.quantity = 12`. `data.status = "GENERATED"`. | API | |
| TC-CB-003 | Admin | Admin creates child box — quantity defaults to 1 when omitted | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>"}`. | HTTP 201. `data.quantity = 1`. `data.status = "GENERATED"`. | API | Zod default=1 |
| TC-CB-004 | Supervisor | Supervisor creates single child box | P1 | 1. Login as `supervisor@binny.com` / `Sup@123`. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 201. `status = "GENERATED"`. Valid `barcode` and `id`. | API | |
| TC-CB-005 | Warehouse Operator | Warehouse Operator creates single child box | P1 | 1. Login as `warehouse@binny.com` / `Wh@123`. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 201. `status = "GENERATED"`. Valid response. | API | |
| TC-CB-006 | Dispatch Operator | Dispatch Operator cannot create child box | P0 | 1. Login as `dispatch@binny.com` / `Dp@123`. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 403. Forbidden. No child box row in DB. | API | |
| TC-CB-007 | Any | Unauthenticated create returns 401 | P0 | 1. `POST /api/v1/child-boxes` body `{"product_id":"<PRODUCT_UUID_A>","quantity":1}` with no Authorization header. | HTTP 401. No child box created. | API | |

---

#### 1.2 — Creation validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-008 | Admin | Missing product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"quantity":1}`. | HTTP 400. Error: `product_id` required / invalid UUID. | API | |
| TC-CB-009 | Admin | Non-UUID product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"not-a-uuid","quantity":1}`. | HTTP 400. Error: `"Invalid product ID format"`. | API | |
| TC-CB-010 | Admin | Non-existent product_id returns 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1}`. | HTTP 404. Error: `"Product not found or inactive"`. | API | |
| TC-CB-011 | Admin | Inactive product returns 404 | P0 | 1. Pre-condition: `INACTIVE_PRODUCT_UUID` has `is_active=false`. 2. Login as Admin. 3. `POST /api/v1/child-boxes` body: `{"product_id":"<INACTIVE_PRODUCT_UUID>","quantity":1}`. | HTTP 404. Error: `"Product not found or inactive"`. | API | Requires inactive product from Phase 05 |
| TC-CB-012 | Admin | quantity = 0 returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":0}`. | HTTP 400. Error: `"Quantity must be positive"`. | API | |
| TC-CB-013 | Admin | quantity exceeds 10000 returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":10001}`. | HTTP 400. Error: `"Quantity must not exceed 10000"`. | API | |
| TC-CB-014 | Admin | quantity = 10000 (boundary) succeeds | P2 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":10000}`. | HTTP 201. `data.quantity = 10000`. `status = "GENERATED"`. | API | |

---

#### 1.3 — Creation writes inventory_transaction

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-015 | Admin | Creating a child box writes CHILD_CREATED transaction | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. Note `id`. 3. Query `SELECT * FROM inventory_transactions WHERE child_box_id = '<id>' ORDER BY created_at`. | HTTP 201 from step 2. DB has exactly 1 `inventory_transactions` row with `transaction_type = 'CHILD_CREATED'`, `child_box_id = <id>`, `performed_by = <admin_user_id>`. `notes` contains the barcode. | Integration | |

---

### Section 2: GENERATED → FREE (POST /child-boxes/:id/activate)

#### 2.1 — Successful activation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-050 | Admin | Admin activates GENERATED box → FREE | P0 | 1. Pre-condition: `CB_GEN_UUID` has `status="GENERATED"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate`. | HTTP 200. Response `data.status = "FREE"`. `data.id = CB_GEN_UUID`. All other fields unchanged. Save id as `CB_FREE_UUID`. | API | |
| TC-CB-051 | Supervisor | Supervisor activates GENERATED box | P1 | 1. Pre-condition: A GENERATED box `CB_GEN_SUP` exists. 2. Login as Supervisor. 3. `POST /api/v1/child-boxes/<CB_GEN_SUP>/activate`. | HTTP 200. `data.status = "FREE"`. | API | All 4 roles can activate |
| TC-CB-052 | Warehouse Operator | Warehouse Operator activates GENERATED box | P1 | 1. Pre-condition: A GENERATED box `CB_GEN_WH` exists. 2. Login as Warehouse Operator. 3. `POST /api/v1/child-boxes/<CB_GEN_WH>/activate`. | HTTP 200. `data.status = "FREE"`. | API | |
| TC-CB-053 | Dispatch Operator | Dispatch Operator activates GENERATED box | P1 | 1. Pre-condition: A GENERATED box `CB_GEN_DP` exists. 2. Login as Dispatch Operator. 3. `POST /api/v1/child-boxes/<CB_GEN_DP>/activate`. | HTTP 200. `data.status = "FREE"`. | API | Dispatch Operator can activate |
| TC-CB-054 | Any | Unauthenticated activate returns 401 | P0 | 1. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate` with no Authorization header. | HTTP 401. Box status unchanged. | API | |

---

#### 2.2 — Idempotency: FREE → FREE (no audit noise)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-055 | Admin | Activating an already-FREE box returns 200 unchanged (no audit) | P0 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"`. Count existing `inventory_transactions` rows for this box (`n_before`). 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_FREE_UUID>/activate`. 4. Count rows again (`n_after`). | HTTP 200. `data.status = "FREE"` (unchanged). `data.id = CB_FREE_UUID`. `n_after = n_before` — **no new** `inventory_transactions` row written. No new `audit_log` entry written. | Integration | Idempotent no-op: silence confirmed |
| TC-CB-056 | Admin | Activating FREE box twice returns 200 both times | P1 | 1. Pre-condition: `CB_FREE_UUID` is FREE. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_FREE_UUID>/activate` twice. | Both calls return HTTP 200. `status = "FREE"` both times. No error thrown. | API | |

---

#### 2.3 — Conflict cases (PACKED, DISPATCHED)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-057 | Admin | Activating PACKED box returns 409 | P0 | 1. Pre-condition: `CB_PACKED_UUID` has `status="PACKED"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_PACKED_UUID>/activate`. | HTTP 409. Response body `message` (or `error`) = `"Cannot activate child box in PACKED status"`. Box remains PACKED. | API | ConflictError thrown by service |
| TC-CB-058 | Admin | Activating DISPATCHED box returns 409 | P0 | 1. Pre-condition: A DISPATCHED box `CB_DISP_UUID` exists. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_DISP_UUID>/activate`. | HTTP 409. Response body message = `"Cannot activate child box in DISPATCHED status"`. | API | |
| TC-CB-059 | Admin | Activate non-existent ID returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/00000000-0000-0000-0000-000000000000/activate`. | HTTP 404. Error: `"Child box not found"`. | API | |

---

#### 2.4 — Audit trail for activation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-060 | Admin | Activation writes CHILD_ACTIVATED transaction + audit_log | P0 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate`. 4. Query `SELECT * FROM inventory_transactions WHERE child_box_id='<CB_GEN_UUID>'`. 5. Query `SELECT * FROM audit_log WHERE entity_id='<CB_GEN_UUID>' AND action='ACTIVATE_CHILD_BOX'`. | Step 4: exactly 1 row with `transaction_type='CHILD_ACTIVATED'`, `performed_by=<admin_user_id>`, `notes` containing the barcode. Step 5: 1 row with `old_values` having `status:"GENERATED"` and `new_values` having `status:"FREE"`. | Integration | |
| TC-CB-061 | Admin | GENERATED→FREE activation does NOT write CHILD_CREATED again | P1 | 1. Activate `CB_GEN_UUID`. 2. Query `SELECT transaction_type, COUNT(*) FROM inventory_transactions WHERE child_box_id='<CB_GEN_UUID>' GROUP BY transaction_type`. | Result has exactly: `CHILD_CREATED = 1`, `CHILD_ACTIVATED = 1`. No additional transaction types. | Integration | |

---

### Section 3: Stock exclusion — GENERATED boxes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-062 | Admin | GENERATED box not counted in pairsInStock (dashboard KPI) | P0 | 1. Get current dashboard `pairsInStock` value: `GET /api/v1/inventory/dashboard` → note `pairsInStock = N`. 2. Create 5 GENERATED boxes for `PRODUCT_UUID_A` via `POST /api/v1/child-boxes` (count=5 via TC-CB-001 pattern repeated). 3. `GET /api/v1/inventory/dashboard` again. | `pairsInStock` in step 3 is still `N` (unchanged). The 5 GENERATED boxes are not added to stock. | Integration | Stock filters to `status IN ('FREE','PACKED')` |
| TC-CB-063 | Admin | GENERATED box not returned by GET /child-boxes/free | P0 | 1. Pre-condition: `CB_GEN_UUID` has `status="GENERATED"`. 2. Login as Admin. 3. `GET /api/v1/child-boxes/free`. | HTTP 200. `CB_GEN_UUID` barcode is NOT present in the `data` array. Free-only endpoint returns only `status="FREE"` boxes. | API | |
| TC-CB-064 | Admin | Activating GENERATED box increases pairsInStock by 1 | P0 | 1. Note `pairsInStock = N` from dashboard. 2. Create 1 GENERATED box `CB_NEW_GEN`. 3. Confirm `pairsInStock` still `N`. 4. `POST /api/v1/child-boxes/<CB_NEW_GEN>/activate`. 5. `GET /api/v1/inventory/dashboard`. | Step 3: `pairsInStock = N`. Step 5: `pairsInStock = N + <quantity_of_CB_NEW_GEN>`. | Integration | |
| TC-CB-065 | Admin | Dashboard has Generated KPI card with correct count | P0 | 1. Note number of GENERATED boxes via `GET /api/v1/child-boxes?status=GENERATED` → `total = G`. 2. `GET /api/v1/inventory/dashboard`. | Dashboard response contains a `generatedBoxes` (or equivalent) field equal to `G`. Separate from `pairsInStock`. | API | New KPI card added Apr 27 |
| TC-CB-066 | Admin | Stock hierarchy excludes GENERATED boxes | P1 | 1. Pre-condition: 2 GENERATED boxes for `PRODUCT_UUID_A`. 0 FREE boxes. 2. `GET /api/v1/inventory/stock` (or equivalent stock hierarchy endpoint). | The stock figure for `PRODUCT_UUID_A` is 0. The 2 GENERATED boxes do not appear in the stock hierarchy total. | API | Hierarchy filters to `FREE` or `FREE+PACKED` |
| TC-CB-067 | Admin | Product-wise report excludes GENERATED boxes | P1 | 1. Pre-condition: 3 GENERATED boxes + 2 FREE boxes for `PRODUCT_UUID_A`. 2. `GET /api/v1/reports/product-wise` (or equivalent). | Product `PRODUCT_UUID_A` shows `freeBoxes = 2`. GENERATED count is in a separate `generatedBoxes` bucket (if the report shows it), but NOT included in `freeBoxes` or `packedBoxes`. | API | |

---

### Section 4: Pack-on-scan from GENERATED (dual transaction)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-068 | Admin | Packing GENERATED box into master carton emits CHILD_ACTIVATED + CHILD_PACKED | P0 | 1. Pre-condition: A GENERATED box `CB_GEN_PACK` exists. An ACTIVE or CREATED master carton `MC_UUID_A` exists. 2. Login as Admin. 3. `POST /api/v1/master-cartons/pack` body: `{"child_box_id":"<CB_GEN_PACK>","master_carton_id":"<MC_UUID_A>"}`. 4. Query `SELECT transaction_type FROM inventory_transactions WHERE child_box_id='<CB_GEN_PACK>' ORDER BY created_at`. | Step 3: HTTP 200. `carton.child_count` incremented. `childBox.status = "PACKED"`. Step 4: rows in order: `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED`. Exactly 3 rows. `CHILD_ACTIVATED` notes contain "auto-activated (implicit activation during pack)". | Integration | Dual transaction ensures traceability timeline is complete |
| TC-CB-069 | Admin | Creating master carton with GENERATED box barcodes packs them directly | P0 | 1. Pre-condition: GENERATED boxes `CB_GEN_1`, `CB_GEN_2` (with barcodes `B1`, `B2`). 2. Login as Admin. 3. `POST /api/v1/master-cartons` body: `{"child_box_barcodes":["<B1>","<B2>"]}`. | HTTP 201. Carton `status = "ACTIVE"`, `child_count = 2`. `CB_GEN_1` and `CB_GEN_2` now have `status = "PACKED"`. `inventory_transactions` for each box has both `CHILD_ACTIVATED` and `CHILD_PACKED` rows. | Integration | `createMasterCarton` accepts GENERATED |
| TC-CB-070 | Admin | Packing GENERATED box activates it — box not in GENERATED state after pack | P1 | 1. Pre-condition: `CB_GEN_PACK` is GENERATED. 2. Pack it (TC-CB-068 steps). 3. `GET /api/v1/child-boxes/<CB_GEN_PACK>`. | HTTP 200. `data.status = "PACKED"` (not GENERATED, not FREE). | API | |
| TC-CB-071 | Admin | Packing FREE box into carton does NOT write CHILD_ACTIVATED | P1 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"`. ACTIVE carton exists. 2. Login as Admin. 3. `POST /api/v1/master-cartons/pack` body: `{"child_box_id":"<CB_FREE_UUID>","master_carton_id":"<MC_UUID>"}`. 4. Query inventory_transactions for `CB_FREE_UUID`. | Step 3: HTTP 200. Step 4: rows: `CHILD_CREATED`, `CHILD_ACTIVATED` (from prior activation), `CHILD_PACKED`. No duplicate `CHILD_ACTIVATED`. Exactly 1 `CHILD_PACKED` row. | Integration | FREE boxes skip the implicit activation branch |
| TC-CB-072 | Admin | Already-PACKED box cannot be packed again (400 error) | P0 | 1. Pre-condition: `CB_PACKED_UUID` has `status="PACKED"`. 2. Login as Admin. 3. `POST /api/v1/master-cartons/pack` body: `{"child_box_id":"<CB_PACKED_UUID>","master_carton_id":"<MC_UUID_A>"}`. | HTTP 400. Error: `"Child box is currently PACKED and cannot be packed. Only FREE or GENERATED boxes can be packed."` | API | |

---

### Section 5: Read operations

#### 5.1 — List child boxes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-073 | Admin | GET /child-boxes returns paginated list | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes`. | HTTP 200. `{"data":[...],"total":<n>,"page":1,"limit":25,"totalPages":<n>}`. Each item: `id`, `barcode`, `status`, `product_id`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `created_at`. | API | |
| TC-CB-074 | Admin | Filter by status=GENERATED returns only GENERATED | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=GENERATED`. | HTTP 200. All items in `data` have `status = "GENERATED"`. No FREE/PACKED/DISPATCHED items. `total` equals GENERATED-only count. | API | |
| TC-CB-075 | Admin | Filter by status=FREE returns only FREE | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=FREE`. | HTTP 200. All items have `status = "FREE"`. | API | |
| TC-CB-076 | Admin | Filter by product_id | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?product_id=<PRODUCT_UUID_A>`. | HTTP 200. All items have `product_id = PRODUCT_UUID_A`. | API | |
| TC-CB-077 | Admin | Search by barcode substring | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?search=BINNY-CB`. | HTTP 200. All items have `barcode` containing `"BINNY-CB"`. | API | |
| TC-CB-078 | Admin | Search by article name | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?search=Busker`. | HTTP 200. All items have `article_name` containing "Busker". | API | |
| TC-CB-079 | Warehouse Operator | Warehouse Operator can list child boxes | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes`. | HTTP 200. Valid paginated list. | API | All authenticated roles can read |

---

#### 5.2 — Get by ID and QR

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-080 | Admin | GET /child-boxes/:id returns full detail | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 200. `data` contains: `id`, `barcode`, `status`, `quantity`, `product_id`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `created_at`, `updated_at`. | API | |
| TC-CB-081 | Admin | GET /child-boxes/:id with non-existent ID returns 404 | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/00000000-0000-0000-0000-000000000000`. | HTTP 404. Error: `"Child box not found"`. | API | |
| TC-CB-082 | Admin | GET /child-boxes/qr/:barcode returns box by barcode | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/BINNY-CB-<CB_GEN_UUID>`. | HTTP 200. `data.barcode = "BINNY-CB-<CB_GEN_UUID>"`. All product fields populated. | API | |
| TC-CB-083 | Admin | GET /child-boxes/qr/NONEXISTENT returns 404 | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/BINNY-CB-00000000-0000-0000-0000-000000000000`. | HTTP 404. Error: `"Child box not found for this QR code"`. | API | |
| TC-CB-084 | Admin | GET /child-boxes/free excludes GENERATED boxes | P0 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Login as Admin. 3. `GET /api/v1/child-boxes/free`. | HTTP 200. `CB_GEN_UUID` barcode NOT present. Only `status="FREE"` boxes returned. | API | |

---

### Section 6: E2E — Child Boxes page + Generate page

#### 6.1 — Child Boxes list page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-001 | Admin | Child Boxes list page loads with Generated filter chip | P0 | 1. Login as Admin at `http://localhost:3000`. 2. Click "Child Boxes" in the sidebar. | URL = `/child-boxes`. Page heading "Child Boxes" visible. Filter dropdown contains options: All Statuses, Generated, Free, Packed, Dispatched. Table headers: Barcode, Article, Colour, Size, MRP, Status, Created. | E2E | Filter chip for GENERATED added Apr 27 |
| TC-CB-E2E-002 | Admin | Filter by Generated shows only GENERATED boxes | P0 | 1. Navigate to `/child-boxes`. 2. Select "Generated" in the Status dropdown. | Table updates to show only rows with `status="GENERATED"`. Status badge on each row shows "Generated". Pagination reflects GENERATED-only count. | E2E | |
| TC-CB-E2E-003 | Admin | Aging tint only applies to FREE boxes (GENERATED excluded) | P1 | 1. Navigate to `/child-boxes`. 2. Create a GENERATED box with a `created_at` > 90 days ago (or mock date). 3. Observe the row background colour. | GENERATED box row has no yellow/red tint even if age > 90 days. Only FREE boxes get the tint. The aging legend note "Generated boxes excluded" is visible. | E2E | `getAgingState` returns null for non-FREE status |
| TC-CB-E2E-004 | Admin | Search filters list in real-time | P1 | 1. Navigate to `/child-boxes`. 2. Type a barcode substring in the search field. | Table rows filtered to matching barcode/article/SKU. | E2E | |
| TC-CB-E2E-005 | Warehouse Operator | Warehouse Operator does not see Bulk Import button | P0 | 1. Login as Warehouse Operator. Navigate to `/child-boxes`. | "Bulk Import" button is NOT visible. "Generate Labels" link is visible. | E2E | `isManager` guard on Bulk Import |
| TC-CB-E2E-006 | Admin | Generate Labels link navigates to generate page | P1 | 1. Navigate to `/child-boxes`. 2. Click "Generate Labels" button. | URL becomes `/child-boxes/generate`. | E2E | |

---

#### 6.2 — Generate Labels page (/child-boxes/generate)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-007 | Admin | Generate page loads with article search dropdown | P0 | 1. Navigate to `/child-boxes/generate`. | Page heading "Generate Labels". Article search dropdown visible with placeholder "Search and select a product...". Quantity input visible. Submit button disabled. | E2E | |
| TC-CB-E2E-008 | Admin | Selecting article shows colour pills | P1 | 1. Go to `/child-boxes/generate`. 2. Type "Busker" in search. 3. Select "Busker (BSK-001)". | Colour section appears with pill "White". Size table not shown yet. | E2E | |
| TC-CB-E2E-009 | Admin | Selecting colour shows size table | P0 | 1. Go to `/child-boxes/generate`. 2. Select "Busker". 3. Click "White" colour pill. | Size table appears: rows for sizes 6, 7 (existing products). Each row has a number input. Product info card shows Article Code, Colour, MRP. | E2E | |
| TC-CB-E2E-010 | Admin | Entering sizes shows live summary | P1 | 1. Select article "Busker" + colour "White". 2. Enter `3` in Size 6 input, `2` in Size 7 input. | Summary card shows "Total labels: 5". Submit button enabled. | E2E | |
| TC-CB-E2E-011 | Admin | Generate submits and shows success view with GENERATED status | P0 | 1. Select article "Busker" + colour "White". Enter `2` for Size 6. 2. Click "Confirm & Generate". | `POST /api/v1/child-boxes/bulk-multi-size` called. Success view: "2 Labels Generated". Barcode thumbnails shown (up to 16). Buttons: "Generate More", "Print Labels", "View All Child Boxes". Status of created boxes is `"GENERATED"` (verify via API). | E2E | |
| TC-CB-E2E-012 | Admin | Total > 500 shows validation error | P1 | 1. Select article and colour. 2. Enter `300` for Size 6, `201` for Size 7. 3. Click Submit. | Error message: "Total labels must not exceed 500". No API call made. | E2E | |
| TC-CB-E2E-013 | Dispatch Operator | Dispatch Operator redirected or sees permission denied on generate page | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/child-boxes/generate`. | Page either shows permission error, redirects to `/child-boxes`, or the submit form is disabled. Dispatch Operator cannot generate labels. | E2E | Dispatch cannot create; frontend should guard |

---

### Section 7: E2E — Scan page auto-activation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-014 | Admin | Scanning GENERATED barcode triggers auto-activation toast | P0 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Login as Admin. Navigate to `/scan`. 3. Type `BINNY-CB-<CB_GEN_UUID>` in the barcode input. 4. Click "Look Up". | Trace result shows the box details. Within ~1 second, a success toast appears: `"Box activated — now part of available stock"`. Box status in the UI updates to `"FREE"`. | E2E | `useEffect` on scan page calls `activate()` when status=GENERATED |
| TC-CB-E2E-015 | Admin | Scanning FREE barcode does NOT show activation toast | P1 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"`. 2. Login as Admin. Navigate to `/scan`. 3. Type the FREE box barcode. 4. Click "Look Up". | Box details displayed. **No** "Box activated" toast appears. Status remains `"FREE"`. No activation API call made (guarded by status check in useEffect). | E2E | |
| TC-CB-E2E-016 | Admin | Scan page — offline mode queues scan | P2 | 1. Login as Admin. Navigate to `/scan`. 2. Disable network (DevTools offline mode). 3. Scan a barcode. | Toast: "Saved offline — will sync when back online". Pending count badge appears in page header. | E2E | `useOfflineScanQueue` + `useNetworkStatus` |

---

### Section 8: E2E — Traceability page auto-activation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-017 | Admin | Tracing GENERATED barcode auto-activates it | P0 | 1. Pre-condition: A GENERATED box `CB_GEN_TRACE`. 2. Login as Admin. Navigate to `/traceability`. 3. Enter barcode in the trace input. Click Search. | Box detail card shows `status = "GENERATED"` initially. `useEffect` fires, `POST /api/v1/child-boxes/<id>/activate` called. Toast: `"Box activated — now part of available stock"`. Status in card updates to `"FREE"`. | E2E | Same pattern as scan page |
| TC-CB-E2E-018 | Admin | Traceability deep-link with ?qr= param auto-activates GENERATED | P1 | 1. Pre-condition: GENERATED box `CB_GEN_TRACE2`. 2. Login as Admin. Navigate to `/traceability?qr=BINNY-CB-<CB_GEN_TRACE2>`. | Page loads, trace auto-runs, GENERATED box found, activation fires, toast shown. | E2E | `useSearchParams` drives initial trace |
| TC-CB-E2E-019 | Admin | Trace timeline shows CHILD_ACTIVATED event after activation | P1 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Activate via `/scan` or `/traceability`. 3. Navigate to `/traceability` and trace `CB_GEN_UUID`. | Timeline section shows at minimum: `CHILD_CREATED` event and `CHILD_ACTIVATED` event in chronological order. Descriptions are human-readable. Performed_by matches logged-in user. | E2E | |
