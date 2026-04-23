# Test Cases v2 — Phases 4–6: Child Box, Master Carton & Dispatch Operations

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt Ltd)  
**API Base URL:** `http://localhost:3001/api/v1`  
**Frontend Base URL:** `http://localhost:3000`  
**Date:** 2026-04-16  
**Author:** Basiq360  

---

## Legend

| Column | Description |
|--------|-------------|
| TC ID | Unique test case identifier |
| Role | User role executing the test |
| Title | Short description of what is being tested |
| Priority | P1 = critical / smoke, P2 = high, P3 = medium |
| Steps | Exact actions, HTTP methods, endpoints, request bodies |
| Expected Result | Assertion criteria (HTTP status, field values, UI state) |
| Type | E2E (Playwright browser), API (backend HTTP), Integration |

### Roles & Default Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@binny.com | Admin@123 |
| Supervisor | supervisor@binny.com | Super@123 |
| Warehouse Operator | warehouse@binny.com | Ware@123 |
| Dispatch Operator | dispatch@binny.com | Disp@123 |

### Authentication

All API tests must include one of:
- **Cookie:** `accessToken=<JWT>` (set via `POST /api/v1/auth/login`)
- **Header:** `Authorization: Bearer <JWT>`

### Shared Test Data Assumptions

- A product exists with `id = PRODUCT_UUID_A`, `article_name = "Binny Slipper"`, `article_code = "BS-001"`, `colour = "Blue"`, `size = "6"`, `mrp = 299.00`, `is_active = true`
- Sibling products exist for the same article+colour with sizes `7`, `8`, `9`
- An inactive product exists with `id = INACTIVE_PRODUCT_UUID`
- A customer exists with `id = CUSTOMER_UUID_A`, `firm_name = "Ramesh Traders"`, `delivery_location = "Jaipur Depot"`

---

## PHASE 4: Child Box Operations

### Section 37: Child Box CRUD — Per Role

---

#### 37.1 Create Operations (Per Role)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CB-ADM-001 | Admin | Admin creates single child box for product | P1 | 1. Login as Admin → obtain JWT. 2. `POST /api/v1/child-boxes` with header `Authorization: Bearer <JWT>` and body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1}`. | HTTP 201. Response body: `{ "success": true, "data": { "id": "<uuid>", "barcode": "BINNY-CB-<uuid>", "product_id": "<PRODUCT_UUID_A>", "status": "FREE", "quantity": 1, "qr_data_uri": "data:image/png;base64,...", "product_name": "Binny Slipper", "size": "6", "colour": "Blue", "mrp": "299.00" } }`. `barcode` must start with `BINNY-CB-`. `status` must equal `"FREE"`. `qr_data_uri` must be non-empty. | API |
| TC-CB-ADM-002 | Admin | Admin creates bulk child boxes (count=5) | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "count": 5}`. | HTTP 201. Response `data` is an array of exactly 5 objects. Each object has `status = "FREE"`, unique `barcode` starting with `"BINNY-CB-"`, and `product_name = "Binny Slipper"`. Response message contains `"5 child boxes created successfully"`. | API |
| TC-CB-ADM-003 | Admin | Admin creates bulk multi-size (3 sizes, 2 each) | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "6", "count": 2}, {"size": "7", "count": 2}, {"size": "8", "count": 2}]}`. | HTTP 201. Response `data` array has exactly 6 objects. 2 boxes with `size = "6"`, 2 with `size = "7"`, 2 with `size = "8"`. All have `status = "FREE"`. All barcodes start with `"BINNY-CB-"`. | API |
| TC-CB-SUP-001 | Supervisor | Supervisor creates single child box | P2 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1}`. | HTTP 201. Response has `status = "FREE"`, valid barcode, `product_name` populated. | API |
| TC-CB-SUP-002 | Supervisor | Supervisor creates bulk child boxes | P2 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "count": 3}`. | HTTP 201. Response array has 3 items, all `status = "FREE"`. | API |
| TC-CB-SUP-003 | Supervisor | Supervisor creates bulk multi-size | P2 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "6", "count": 1}, {"size": "7", "count": 1}]}`. | HTTP 201. Response array has 2 items with different sizes. All `status = "FREE"`. | API |
| TC-CB-WHO-001 | Warehouse Operator | Warehouse Operator creates single child box | P2 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1}`. | HTTP 201. Valid response with `status = "FREE"` and `barcode` starting `"BINNY-CB-"`. | API |
| TC-CB-WHO-002 | Warehouse Operator | Warehouse Operator creates bulk child boxes | P2 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "count": 2}`. | HTTP 201. Response array has 2 items. All `status = "FREE"`. | API |
| TC-CB-WHO-003 | Warehouse Operator | Warehouse Operator creates bulk multi-size | P2 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "8", "count": 1}]}`. | HTTP 201. Response array has 1 item with `size = "8"` and `status = "FREE"`. | API |
| TC-CB-DOP-001 | Dispatch Operator | Dispatch Operator cannot create single child box | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1}`. | HTTP 403. Response body contains `"error"` or `"message"` indicating insufficient permissions. No child box is created in the database. | API |
| TC-CB-DOP-002 | Dispatch Operator | Dispatch Operator cannot create bulk child boxes | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "count": 3}`. | HTTP 403. Forbidden response. No records created. | API |
| TC-CB-DOP-003 | Dispatch Operator | Dispatch Operator cannot create bulk multi-size | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "6", "count": 1}]}`. | HTTP 403. Forbidden response. No records created. | API |

---

#### 37.2 Read Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CB-READ-001 | Any (Admin used) | GET /child-boxes returns paginated list | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes`. | HTTP 200. Response body: `{ "success": true, "data": [...], "total": <n>, "page": 1, "limit": 25, "totalPages": <n> }`. Each item in `data` has: `id`, `barcode`, `status`, `product_id`, `product_name`, `article_code`, `size`, `colour`, `mrp`, `created_at`. | API |
| TC-CB-READ-002 | Any | GET /child-boxes?status=FREE returns only FREE boxes | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=FREE`. | HTTP 200. All items in `data` array have `status = "FREE"`. No PACKED or DISPATCHED items in response. `total` reflects count of FREE boxes only. | API |
| TC-CB-READ-003 | Any | GET /child-boxes?status=PACKED returns only PACKED boxes | P2 | 1. Login as Admin. 2. (Pre-condition: at least one PACKED child box exists.) 3. `GET /api/v1/child-boxes?status=PACKED`. | HTTP 200. All items in `data` array have `status = "PACKED"`. No FREE or DISPATCHED items in response. | API |
| TC-CB-READ-004 | Any | GET /child-boxes/free returns only FREE boxes | P2 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/free`. | HTTP 200. Paginated response. All items in `data` have `status = "FREE"`. Includes `product_name`, `size`, `colour`, `mrp`. | API |
| TC-CB-READ-005 | Any | GET /child-boxes/qr/:qrCode returns box details with product | P1 | 1. Login as Admin. 2. Create a child box via `POST /api/v1/child-boxes` and note the `barcode` returned (e.g., `BINNY-CB-<uuid>`). 3. `GET /api/v1/child-boxes/qr/BINNY-CB-<uuid>`. | HTTP 200. Response `data` contains: `id`, `barcode` matching the requested barcode, `product_id`, `product_name`, `article_code`, `size`, `colour`, `mrp`, `status`. All product fields are populated (not null). | API |
| TC-CB-READ-006 | Any | GET /child-boxes/qr/NONEXISTENT returns 404 | P2 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/BINNY-CB-00000000-0000-0000-0000-000000000000`. | HTTP 404. Response body contains error message `"Child box not found for this QR code"` or similar. | API |

---

#### 37.3 Validation Tests

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CB-VAL-001 | Admin | Create child box with non-existent product_id returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` with body `{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}`. | HTTP 404. Error message: `"Product not found or inactive"`. No child box created. | API |
| TC-CB-VAL-002 | Admin | Create child box with inactive product returns 404 | P1 | 1. Login as Admin. 2. (Pre-condition: `INACTIVE_PRODUCT_UUID` exists with `is_active = false`.) 3. `POST /api/v1/child-boxes` with body `{"product_id": "<INACTIVE_PRODUCT_UUID>", "quantity": 1}`. | HTTP 404. Error message: `"Product not found or inactive"`. | API |
| TC-CB-VAL-003 | Admin | Bulk create with count=0 returns 400 | P2 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "count": 0}`. | HTTP 400. Validation error indicating `count` must be at least 1 (`"Count must be at least 1"`). | API |
| TC-CB-VAL-004 | Admin | Bulk create with count > 500 returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk` with body `{"product_id": "<PRODUCT_UUID_A>", "count": 501}`. | HTTP 400. Validation error: `"Cannot create more than 500 child boxes at once"`. No child boxes created. | API |
| TC-CB-VAL-005 | Admin | Multi-size create with non-existent size returns 404 | P2 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "99", "count": 1}]}`. (Size 99 does not exist for this article.) | HTTP 404. Error message contains `"No product found for size"` referencing the invalid size. | API |
| TC-CB-VAL-006 | Admin | Multi-size with total count > 500 returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/bulk-multi-size` with body `{"product_id": "<PRODUCT_UUID_A>", "quantity": 1, "sizes": [{"size": "6", "count": 300}, {"size": "7", "count": 201}]}`. (Total = 501.) | HTTP 400. Error message: `"Total count across all sizes must not exceed 500"`. No child boxes created. | API |
| TC-CB-VAL-007 | Admin | Create child box with missing product_id returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` with body `{"quantity": 1}` (no `product_id`). | HTTP 400. Validation error indicating `product_id` is required. Response contains field-level error. | API |
| TC-CB-VAL-008 | Admin | Create child box with invalid UUID product_id returns 400 | P2 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` with body `{"product_id": "not-a-uuid", "quantity": 1}`. | HTTP 400. Validation error: `"Invalid product ID format"`. | API |

---

#### 37.4 Playwright E2E — Generate Page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CB-E2E-001 | Admin | Child Boxes list page loads and shows table | P1 | 1. Navigate to `http://localhost:3000` and login as Admin. 2. Click "Child Boxes" in the sidebar. 3. Wait for page to load. | URL is `/child-boxes`. Page title "Child Boxes" is visible. A data table is displayed showing columns: Barcode, Article, Colour, Size, MRP, Status, Created. At least the table headers are present. A "Generate Labels" button is visible. | E2E |
| TC-CB-E2E-002 | Admin | Generate page loads with article dropdown | P1 | 1. Navigate to `/child-boxes` as Admin. 2. Click "Generate Labels" button. 3. Wait for page to load. | URL is `/child-boxes/generate`. Page heading "Generate Labels" is visible. An article/product search dropdown is visible with placeholder text "Search and select a product...". A "Quantity per Box (Pairs)" input is present. "Confirm & Generate" button is disabled initially. | E2E |
| TC-CB-E2E-003 | Admin | Selecting article shows colour pills | P1 | 1. Go to `/child-boxes/generate`. 2. Click the product search dropdown. 3. Type "Binny" in the search input. 4. Select "Binny Slipper (BS-001)" from the dropdown. | Colour picker section appears below the article dropdown with the label "Colour". At least one colour pill/button is visible (e.g., "Blue"). The size table has NOT appeared yet (awaiting colour selection). | E2E |
| TC-CB-E2E-004 | Admin | Selecting colour shows size table with qty inputs | P1 | 1. Go to `/child-boxes/generate`. 2. Select article "Binny Slipper". 3. Click colour pill "Blue". | A size table appears with columns: Size, MRP, No. of Labels. Each size row (6, 7, 8, 9) shows a number input defaulting to 0. A product info card shows Article Code, Colour, MRP, Category, Section, Location. | E2E |
| TC-CB-E2E-005 | Admin | Entering quantities shows live summary | P1 | 1. Go to `/child-boxes/generate`. 2. Select article and colour. 3. Enter `3` in the Size 6 qty input, `2` in Size 7. | A Summary section appears below the size table showing: "Sizes selected: 6 (×3), 7 (×2)". "Total labels: 5" is displayed in bold. "Confirm & Generate" button becomes enabled. | E2E |
| TC-CB-E2E-006 | Admin | Total > 500 shows validation error | P2 | 1. Go to `/child-boxes/generate`. 2. Select article and colour. 3. Enter `300` in Size 6 qty, `201` in Size 7 qty. 4. Click "Confirm & Generate". | An error message appears: "Total labels must not exceed 500". Form is not submitted. No API call is made to `/bulk-multi-size`. | E2E |
| TC-CB-E2E-007 | Admin | Generate success view shows label count | P1 | 1. Go to `/child-boxes/generate`. 2. Select article "Binny Slipper", colour "Blue". 3. Enter `2` in Size 6, `1` in Size 7. 4. Click "Confirm & Generate". 5. Wait for API response. | Success view appears: Green checkmark icon. "3 Labels Generated" message. Size badges shown: "Size 6 × 2" and "Size 7 × 1". A preview grid shows up to 16 barcode thumbnails. Three buttons visible: "Generate More", "Print Labels", "View All Child Boxes". | E2E |
| TC-CB-E2E-008 | Admin | Print Labels button opens print preview | P2 | 1. Complete steps from TC-CB-E2E-007 to reach success view. 2. Click "Print Labels". | A new browser window/tab opens. The window contains the print-formatted label HTML. Browser print dialog is triggered (or print preview visible). No JavaScript errors in console. | E2E |
| TC-CB-E2E-009 | Admin | Labels show all required fields in print view | P1 | 1. Complete TC-CB-E2E-007 (generate 3 labels). 2. Inspect the generated print HTML (intercept `window.open` content or check `handlePrint` output). | Each label (60mm × 60mm) contains: Article No (e.g., "BS-001"). Colour (e.g., "Blue"). Size value displayed in large bold font (28pt). MRP line: "M.R.P.: ₹299.00". Sub-line: "(Inc of all taxes)". "Packed on: <today's date>". Content line: "Content: 2N (1 Pair)". QR code SVG rendered. Footer: "Mfg & Mktd by: Mahavir Polymers Pvt Ltd / FE 16-17 MIA Jaipur - 302017 Raj (India) / Customer Care: 0141 2751684". | E2E |
| TC-CB-E2E-010 | Supervisor | Supervisor can access generate page | P2 | 1. Login as Supervisor. 2. Navigate to `/child-boxes/generate`. | Page loads without 403/redirect. "Generate Labels" form is fully functional. Supervisor can select product, colour, sizes, and submit form. | E2E |
| TC-CB-E2E-011 | Warehouse Operator | Warehouse Operator can access generate page | P2 | 1. Login as Warehouse Operator. 2. Navigate to `/child-boxes/generate`. | Page loads without 403/redirect. Form is fully functional. Warehouse Operator can generate labels. | E2E |
| TC-CB-E2E-012 | Admin | Search/filter on child boxes list page | P2 | 1. Login as Admin. 2. Navigate to `/child-boxes`. 3. In the search input, type "BINNY-CB-". 4. Wait for results to update. | Table rows update to show only boxes with barcodes matching the search term. If no results, an empty state message is shown. Pagination updates to reflect filtered count. | E2E |

---

## PHASE 5: Master Carton Operations

### Section 38: Master Carton CRUD — Per Role

---

#### 38.1 Create & Pack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-ADM-001 | Admin | Admin creates master carton with 3 child box barcodes | P1 | 1. Pre-condition: Create 3 FREE child boxes via `POST /api/v1/child-boxes` (bulk, count=3). Note their barcodes as `CB_BAR_1`, `CB_BAR_2`, `CB_BAR_3`. 2. Login as Admin. 3. `POST /api/v1/master-cartons` with body `{"max_capacity": 50, "child_box_barcodes": ["<CB_BAR_1>", "<CB_BAR_2>", "<CB_BAR_3>"]}`. | HTTP 201. Response `data`: `{ "id": "<uuid>", "carton_barcode": "BINNY-MC-<uuid>", "status": "ACTIVE", "child_count": 3, "max_capacity": 50, "qr_data_uri": "data:image/png;base64,..." }`. `carton_barcode` starts with `"BINNY-MC-"`. `status = "ACTIVE"` (because boxes were packed). `child_count = 3`. All 3 child boxes now have `status = "PACKED"` (verify via `GET /api/v1/child-boxes/qr/<CB_BAR_1>`). | API |
| TC-MC-ADM-002 | Admin | Admin packs additional child box into existing ACTIVE carton | P1 | 1. Pre-condition: An ACTIVE master carton exists with `id = MC_UUID_A` and at least one empty slot. A FREE child box exists with `id = CB_UUID_FREE`. 2. `POST /api/v1/master-cartons/pack` with body `{"child_box_id": "<CB_UUID_FREE>", "master_carton_id": "<MC_UUID_A>"}`. | HTTP 200. Response `data`: `{ "carton": { "id": "<MC_UUID_A>", "child_count": <previous+1>, "status": "ACTIVE" }, "mapping": { "master_carton_id": "<MC_UUID_A>", "child_box_id": "<CB_UUID_FREE>", "packed_by": "<admin_user_id>", "is_active": true } }`. Child box status changes to `"PACKED"`. | API |
| TC-MC-ADM-003 | Admin | Create master carton with already-PACKED child box returns 400 | P1 | 1. Pre-condition: A PACKED child box exists with barcode `CB_BAR_PACKED`. 2. `POST /api/v1/master-cartons` with body `{"child_box_barcodes": ["<CB_BAR_PACKED>"]}`. | HTTP 400. Error message contains `"currently PACKED"` and `"Only FREE boxes can be packed"`. No new master carton is created. | API |
| TC-MC-SUP-001 | Supervisor | Supervisor creates master carton | P2 | 1. Login as Supervisor. Pre-condition: 2 FREE child boxes exist (`CB_BAR_S1`, `CB_BAR_S2`). 2. `POST /api/v1/master-cartons` with body `{"child_box_barcodes": ["<CB_BAR_S1>", "<CB_BAR_S2>"]}`. | HTTP 201. `status = "ACTIVE"`, `child_count = 2`. Both child boxes are now PACKED. | API |
| TC-MC-SUP-002 | Supervisor | Supervisor packs child box into carton | P2 | 1. Login as Supervisor. Pre-condition: ACTIVE carton `MC_UUID_B` and FREE child box `CB_UUID_S` exist. 2. `POST /api/v1/master-cartons/pack` with body `{"child_box_id": "<CB_UUID_S>", "master_carton_id": "<MC_UUID_B>"}`. | HTTP 200. `carton.child_count` incremented. Child box status becomes `"PACKED"`. | API |
| TC-MC-WHO-001 | Warehouse Operator | Warehouse Operator creates master carton | P2 | 1. Login as Warehouse Operator. Pre-condition: 1 FREE child box `CB_BAR_W1` exists. 2. `POST /api/v1/master-cartons` with body `{"child_box_barcodes": ["<CB_BAR_W1>"]}`. | HTTP 201. `status = "ACTIVE"`, `child_count = 1`. Child box now PACKED. | API |
| TC-MC-WHO-002 | Warehouse Operator | Warehouse Operator packs child box | P2 | 1. Login as Warehouse Operator. Pre-condition: ACTIVE carton and FREE child box exist. 2. `POST /api/v1/master-cartons/pack` with body `{"child_box_id": "<CB_UUID_W>", "master_carton_id": "<MC_UUID_W>"}`. | HTTP 200. Child count incremented. Child box status = PACKED. | API |
| TC-MC-DOP-001 | Dispatch Operator | Dispatch Operator cannot create master carton | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons` with body `{"child_box_barcodes": []}`. | HTTP 403. Forbidden. No carton created. | API |
| TC-MC-DOP-002 | Dispatch Operator | Dispatch Operator cannot pack child box | P1 | 1. Login as Dispatch Operator. Pre-condition: ACTIVE carton `MC_UUID_A` and FREE child box `CB_UUID_FREE` exist. 2. `POST /api/v1/master-cartons/pack` with body `{"child_box_id": "<CB_UUID_FREE>", "master_carton_id": "<MC_UUID_A>"}`. | HTTP 403. Forbidden. Child box remains FREE. Carton child_count unchanged. | API |
| TC-MC-VAL-001 | Admin | Create master carton with no child box barcodes creates CREATED-status carton | P2 | 1. Login as Admin. 2. `POST /api/v1/master-cartons` with body `{}` (empty body, all defaults). | HTTP 201. Response: `status = "CREATED"` (no boxes packed, so status stays CREATED), `child_count = 0`, `max_capacity = 50` (default), `carton_barcode` starts with `"BINNY-MC-"`. | API |

---

#### 38.2 Close/Seal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-CLOSE-001 | Admin | Admin closes ACTIVE carton | P1 | 1. Pre-condition: ACTIVE master carton `MC_UUID_CLOSE` with at least 1 child box. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_CLOSE>/close`. | HTTP 200. Response `data`: `{ "id": "<MC_UUID_CLOSE>", "status": "CLOSED", "closed_at": "<timestamp>" }`. `closed_at` is a valid ISO timestamp. An `inventory_transactions` record of type `CARTON_CLOSED` is logged. | API |
| TC-MC-CLOSE-002 | Supervisor | Supervisor closes ACTIVE carton | P2 | 1. Pre-condition: ACTIVE carton with child boxes. 2. Login as Supervisor. 3. `POST /api/v1/master-cartons/<MC_UUID>/close`. | HTTP 200. `status = "CLOSED"`. `closed_at` populated. | API |
| TC-MC-CLOSE-003 | Warehouse Operator | Warehouse Operator cannot close carton | P1 | 1. Login as Warehouse Operator. Pre-condition: ACTIVE carton `MC_UUID_A`. 2. `POST /api/v1/master-cartons/<MC_UUID_A>/close`. | HTTP 403. Forbidden. Carton status remains ACTIVE. `closed_at` remains null. | API |
| TC-MC-CLOSE-004 | Dispatch Operator | Dispatch Operator cannot close carton | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/<MC_UUID_A>/close`. | HTTP 403. Forbidden. Carton status unchanged. | API |
| TC-MC-CLOSE-005 | Admin | Close already CLOSED carton returns 400 | P1 | 1. Pre-condition: A CLOSED master carton exists with `id = MC_UUID_CLOSED`. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_CLOSED>/close`. | HTTP 400. Error message: `"Master carton is already closed"`. | API |
| TC-MC-CLOSE-006 | Admin | Close DISPATCHED carton returns 400 | P1 | 1. Pre-condition: A DISPATCHED master carton exists with `id = MC_UUID_DISP`. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_DISP>/close`. | HTTP 400. Error message: `"Cannot close a dispatched carton"`. | API |

---

#### 38.3 Unpack (Full Unpack)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-UNPACK-001 | Admin | Admin full-unpacks ACTIVE carton | P1 | 1. Pre-condition: ACTIVE master carton `MC_UUID_ACT` with 2 child boxes (`CB_UUID_1`, `CB_UUID_2`). 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_ACT>/full-unpack`. | HTTP 200. Response `data`: `{ "id": "<MC_UUID_ACT>", "status": "CREATED", "child_count": 0 }`. Both `CB_UUID_1` and `CB_UUID_2` now have `status = "FREE"` (verify via `GET /api/v1/child-boxes/<CB_UUID_1>`). Two `CHILD_UNPACKED` transaction records are created in `inventory_transactions`. | API |
| TC-MC-UNPACK-002 | Admin | Admin full-unpacks CLOSED carton | P1 | 1. Pre-condition: CLOSED master carton `MC_UUID_CLS` with 1 child box. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_CLS>/full-unpack`. | HTTP 200. `status = "CREATED"`, `child_count = 0`. Child box status reverts to `"FREE"`. | API |
| TC-MC-UNPACK-003 | Supervisor | Supervisor full-unpacks carton | P2 | 1. Pre-condition: ACTIVE carton with 1 child box. 2. Login as Supervisor. 3. `POST /api/v1/master-cartons/<MC_UUID>/full-unpack`. | HTTP 200. `status = "CREATED"`, `child_count = 0`. Child box reverts to FREE. | API |
| TC-MC-UNPACK-004 | Warehouse Operator | Warehouse Operator full-unpacks carton | P2 | 1. Pre-condition: ACTIVE carton with 1 child box. 2. Login as Warehouse Operator. 3. `POST /api/v1/master-cartons/<MC_UUID>/full-unpack`. | HTTP 200. `status = "CREATED"`, `child_count = 0`. Child box reverts to FREE. | API |
| TC-MC-UNPACK-005 | Dispatch Operator | Dispatch Operator cannot full-unpack carton | P1 | 1. Login as Dispatch Operator. Pre-condition: ACTIVE carton `MC_UUID_A`. 2. `POST /api/v1/master-cartons/<MC_UUID_A>/full-unpack`. | HTTP 403. Forbidden. Carton status unchanged. Child boxes remain PACKED. | API |
| TC-MC-UNPACK-006 | Admin | Full unpack DISPATCHED carton returns 400 | P1 | 1. Pre-condition: DISPATCHED master carton `MC_UUID_DISP`. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_DISP>/full-unpack`. | HTTP 400. Error message: `"Cannot unpack a dispatched carton"`. | API |
| TC-MC-UNPACK-007 | Admin | Full unpack empty (CREATED) carton returns 400 | P2 | 1. Pre-condition: A CREATED (empty) master carton `MC_UUID_EMPTY` with `child_count = 0`. 2. Login as Admin. 3. `POST /api/v1/master-cartons/<MC_UUID_EMPTY>/full-unpack`. | HTTP 400. Error message: `"Cannot unpack an empty carton"`. | API |
| TC-MC-UNPACK-008 | Admin | After full-unpack, all child boxes status = FREE | P1 | 1. Create 3 child boxes (FREE). 2. Pack them into carton `MC_UUID_X`. 3. Full-unpack `MC_UUID_X`. 4. `GET /api/v1/master-cartons/<MC_UUID_X>/children` to verify no active mappings. 5. `GET /api/v1/child-boxes/<CB_UUID>` for each child box. | Step 4: Response `data` is empty array. Step 5: Each child box has `status = "FREE"`. Carton `child_count = 0` and `status = "CREATED"`. | Integration |

---

#### 38.4 Repack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-REPACK-001 | Admin | Admin repacks child box from carton A to carton B | P1 | 1. Pre-condition: ACTIVE carton A (`MC_UUID_A`) contains child box `CB_UUID_R`. ACTIVE carton B (`MC_UUID_B`) exists with capacity. 2. Login as Admin. 3. `POST /api/v1/master-cartons/repack` with body `{"child_box_id": "<CB_UUID_R>", "source_carton_id": "<MC_UUID_A>", "destination_carton_id": "<MC_UUID_B>"}`. | HTTP 200. Response `data`: `{ "sourceCarton": { "id": "<MC_UUID_A>", "child_count": <A_count-1> }, "destinationCarton": { "id": "<MC_UUID_B>", "child_count": <B_count+1> } }`. `CHILD_REPACKED` transaction logged. Child box `CB_UUID_R` remains PACKED but its active mapping now points to `MC_UUID_B`. | API |
| TC-MC-REPACK-002 | Supervisor | Supervisor repacks child box | P2 | 1. Login as Supervisor. Pre-conditions same as TC-MC-REPACK-001. 2. `POST /api/v1/master-cartons/repack` with body `{"child_box_id": "<CB_UUID>", "source_carton_id": "<MC_UUID_A>", "destination_carton_id": "<MC_UUID_B>"}`. | HTTP 200. Source carton count decremented. Destination carton count incremented. Child box still PACKED. | API |
| TC-MC-REPACK-003 | Warehouse Operator | Warehouse Operator repacks child box | P2 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/repack` with body as above. | HTTP 200. Repack succeeds. Source count decremented, destination count incremented. | API |
| TC-MC-REPACK-004 | Dispatch Operator | Dispatch Operator cannot repack | P1 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/repack` with a valid body. | HTTP 403. Forbidden. Both cartons unchanged. Child box mapping unchanged. | API |
| TC-MC-REPACK-005 | Admin | Repack child box not in source carton returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/repack` with body `{"child_box_id": "<CB_UUID_NOT_IN_A>", "source_carton_id": "<MC_UUID_A>", "destination_carton_id": "<MC_UUID_B>"}`. (Child box is not in carton A.) | HTTP 404. Error message: `"Child box is not in the source carton"`. No carton is modified. | API |
| TC-MC-REPACK-006 | Admin | Repack to non-existent destination carton returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/repack` with body `{"child_box_id": "<CB_UUID_R>", "source_carton_id": "<MC_UUID_A>", "destination_carton_id": "00000000-0000-0000-0000-000000000000"}`. | HTTP 404. Error message: `"Destination carton not found"`. Source carton unchanged. | API |
| TC-MC-REPACK-007 | Admin | Repack from DISPATCHED source carton returns 404/400 | P2 | 1. Pre-condition: A DISPATCHED carton `MC_UUID_DISP` (its children are DISPATCHED, no active mappings). 2. Login as Admin. 3. `POST /api/v1/master-cartons/repack` with `source_carton_id = MC_UUID_DISP`. | HTTP 404. Error: `"Child box is not in the source carton"` (no active mapping exists for a DISPATCHED carton). | API |
| TC-MC-REPACK-008 | Admin | After repack, child box appears in destination carton | P1 | 1. Repack `CB_UUID_R` from `MC_UUID_A` to `MC_UUID_B` (TC-MC-REPACK-001). 2. `GET /api/v1/master-cartons/<MC_UUID_B>/children`. 3. `GET /api/v1/master-cartons/<MC_UUID_A>/children`. | Step 2: `CB_UUID_R` appears in the response list for `MC_UUID_B` (is_active = true). Step 3: `CB_UUID_R` does NOT appear in active children of `MC_UUID_A`. Old mapping for `MC_UUID_A` has `is_active = false`. | Integration |

---

#### 38.5 Read & Detail

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-READ-001 | Any (Admin) | GET /master-cartons returns paginated list with product summaries | P1 | 1. Login as Admin. 2. `GET /api/v1/master-cartons`. | HTTP 200. Response: `{ "data": [...], "total": <n>, "page": 1, "limit": 25, "totalPages": <n> }`. Each item contains: `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `created_at`, and lateral summary fields: `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. | API |
| TC-MC-READ-002 | Any | GET /master-cartons?status=ACTIVE returns only ACTIVE cartons | P1 | 1. Login as Admin. 2. `GET /api/v1/master-cartons?status=ACTIVE`. | HTTP 200. All items in `data` have `status = "ACTIVE"`. No CREATED, CLOSED, or DISPATCHED cartons in result. | API |
| TC-MC-READ-003 | Any | GET /master-cartons/:id returns detail with child boxes array | P1 | 1. Pre-condition: Carton `MC_UUID_A` exists with 2 child boxes. 2. Login as Admin. 3. `GET /api/v1/master-cartons/<MC_UUID_A>`. | HTTP 200. Response `data`: `{ "id": "<MC_UUID_A>", "carton_barcode": "BINNY-MC-...", "status": "ACTIVE", "child_count": 2, "child_boxes": [{ "id": "...", "barcode": "...", "status": "PACKED", "article_name": "...", "size": "...", "colour": "...", "mrp": "..." }, ...] }`. `child_boxes` array has exactly 2 items, each with product details. | API |
| TC-MC-READ-004 | Any | GET /master-cartons/qr/BINNY-MC-{uuid} returns carton by barcode | P1 | 1. Login as Admin. 2. Create a carton and note its `carton_barcode`. 3. `GET /api/v1/master-cartons/qr/<carton_barcode>`. | HTTP 200. Response `data` contains: `carton_barcode` matching the queried barcode, `id`, `status`, `child_count`, `child_boxes` array. | API |
| TC-MC-READ-005 | Any | GET /master-cartons/:id/assortment returns size assortment pivot | P1 | 1. Pre-condition: Carton `MC_UUID_X` contains 2 Size-6 boxes and 1 Size-7 box of article "Binny Slipper". 2. Login as Admin. 3. `GET /api/v1/master-cartons/<MC_UUID_X>/assortment`. | HTTP 200. Response `data` is an array of objects grouped by article/colour/size: `[{ "article_name": "Binny Slipper", "colour": "Blue", "size": "6", "mrp": 299.00, "count": 2 }, { "article_name": "Binny Slipper", "colour": "Blue", "size": "7", "mrp": 299.00, "count": 1 }]`. Ordered by article_name, colour, size. | API |
| TC-MC-READ-006 | Any | GET /master-cartons/:id/children returns child box list with product details | P1 | 1. Pre-condition: Carton `MC_UUID_A` with 2 active child box mappings. 2. Login as Admin. 3. `GET /api/v1/master-cartons/<MC_UUID_A>/children`. | HTTP 200. Response `data` is an array of carton_child_mapping rows each with: `master_carton_id`, `child_box_id`, `packed_by`, `packed_at`, `is_active = true`, `barcode`, `status`, `quantity`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`. Only active mappings are returned. | API |
| TC-MC-READ-007 | Any | GET non-existent carton returns 404 | P2 | 1. Login as Admin. 2. `GET /api/v1/master-cartons/00000000-0000-0000-0000-000000000000`. | HTTP 404. Error message: `"Master carton not found"`. | API |
| TC-MC-READ-008 | Any | GET /master-cartons?search=BINNY filters by barcode | P2 | 1. Login as Admin. 2. `GET /api/v1/master-cartons?search=BINNY-MC`. | HTTP 200. All items in `data` have `carton_barcode` containing `"BINNY-MC"` (case-insensitive ILIKE match). | API |

---

#### 38.6 Playwright E2E

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-MC-E2E-001 | Admin | Master Cartons list page loads | P1 | 1. Login as Admin. 2. Click "Master Cartons" in sidebar. 3. Wait for page. | URL is `/master-cartons`. Page heading "Master Cartons" visible. Data table or card list renders. "Create Master Carton" button is visible. | E2E |
| TC-MC-E2E-002 | Admin | List shows Article, Colour, Sizes, MRP in summary columns | P2 | 1. Navigate to `/master-cartons` as Admin. 2. Pre-condition: at least one ACTIVE carton with packed child boxes exists. | Each carton row/card displays: carton barcode, status badge, child_count, and product summary (article_summary, colour_summary, size_summary, mrp_summary). | E2E |
| TC-MC-E2E-003 | Admin | Create page loads with QR scanner and manual entry | P1 | 1. Navigate to `/master-cartons/create`. | Page heading "Create Master Carton" visible. "Max Capacity" number input present (default value 24). "Open Scanner" button visible. "Or add barcode manually" section with text input and "Add" button. Scanned Items counter shows `(0/24)`. Progress bar at 0%. | E2E |
| TC-MC-E2E-004 | Admin | Scan/enter barcode shows child box details (article, colour, size, MRP) | P1 | 1. Navigate to `/master-cartons/create`. 2. In the manual barcode input, type a valid FREE child box barcode (e.g., `BINNY-CB-<uuid>`). 3. Click "Add". | Barcode added to scanned items list. Below the barcode, product details appear: article_name, colour, size, MRP (fetched from `GET /api/v1/child-boxes/qr/<barcode>`). Counter increments to `(1/24)`. Progress bar fills to ~4%. | E2E |
| TC-MC-E2E-005 | Admin | Add multiple barcodes shows summary list | P1 | 1. Navigate to `/master-cartons/create`. 2. Add 3 distinct FREE child box barcodes via manual entry. | All 3 barcodes appear in the scanned items list with numbering (1., 2., 3.). Each shows barcode and product details. Counter shows `(3/24)`. "Create Master Carton (3 boxes)" button is enabled. | E2E |
| TC-MC-E2E-006 | Admin | Create carton redirects to detail page | P1 | 1. Navigate to `/master-cartons/create`. 2. Add 2 FREE child box barcodes. 3. Click "Create Master Carton (2 boxes)". 4. Wait for API response. | Toast success: "Master carton created successfully". Page redirects to `/master-cartons/<new_id>`. Detail page loads showing the new carton's barcode and status "ACTIVE". | E2E |
| TC-MC-E2E-007 | Admin | Detail page shows assortment summary | P2 | 1. Navigate to `/master-cartons/<MC_UUID_X>` where the carton has mixed sizes. | Page shows: carton barcode, status badge, child_count. An "Assortment" section (or similar) shows size breakdown (e.g., "Size 6 × 2, Size 7 × 1"). | E2E |
| TC-MC-E2E-008 | Admin | Detail page shows child box list | P1 | 1. Navigate to `/master-cartons/<MC_UUID_A>`. Pre-condition: carton has 2 child boxes. | A "Child Boxes" list is visible with each packed box showing: barcode, article_name, colour, size, status = "PACKED". | E2E |
| TC-MC-E2E-009 | Admin | Full Unpack button on ACTIVE carton detail page | P2 | 1. Navigate to `/master-cartons/<MC_UUID_ACT>` (ACTIVE carton). 2. Click "Full Unpack" button. 3. Confirm in the confirmation modal. 4. Wait for API response. | Confirmation modal appears with carton barcode and child count. After confirm: toast success "Master carton fully unpacked successfully". Carton status updates to "CREATED". Child count shows 0. Child boxes list is empty. | E2E |
| TC-MC-E2E-010 | Admin | Print label button generates master carton label | P2 | 1. Navigate to `/master-cartons/<MC_UUID>`. 2. Click "Print Label" (if present). | A print window/dialog opens OR a label PDF/view is shown containing: carton barcode, QR code, child_count, article summary. | E2E |
| TC-MC-E2E-011 | Admin | Storage page: scan carton barcode to seal/close | P1 | 1. Navigate to `/storage`. 2. Enter an ACTIVE carton barcode in the input field. 3. Click "Find". 4. Click "Close & Store". | Carton details appear: barcode, status "ACTIVE", child_count. After clicking "Close & Store": toast success "Carton closed and stored successfully". Input clears. Carton no longer displayed. Verify carton status is "CLOSED" via API. | E2E |
| TC-MC-E2E-012 | Admin | Unpack page: scan carton to confirm full unpack | P1 | 1. Navigate to `/unpack`. 2. Enter an ACTIVE carton barcode in the input. 3. Click "Find". 4. Click "Full Unpack". 5. In the modal, click "Yes, Unpack All". | Step 3: Carton detail card appears with barcode, status ACTIVE, child count, and list of child boxes in orange-highlighted rows. Step 5: Toast success. Carton detail clears. Verify via API that carton status = CREATED and child boxes = FREE. | E2E |
| TC-MC-E2E-013 | Admin | Repack page: source → select boxes → destination → repack | P1 | 1. Navigate to `/repack`. 2. Enter source carton barcode (ACTIVE, with boxes). Click "Find". 3. Select 1 child box checkbox. 4. Enter destination carton barcode. Click "Find". 5. Click "Repack 1 Box". | Step 2: Source carton info card appears. Step 3: Checkbox checked, blue highlight on selected box. Counter shows "1/N selected". Step 4: Destination carton info card appears. Step 5: Summary panel shows "Moving 1 box from BINNY-MC-... to BINNY-MC-...". After clicking Repack: toast success "Repacked 1 box successfully". Both source and destination inputs clear. | E2E |
| TC-MC-E2E-014 | Warehouse Operator | Warehouse Operator can access create, unpack, repack pages | P2 | 1. Login as Warehouse Operator. 2. Navigate to `/master-cartons/create`. 3. Navigate to `/unpack`. 4. Navigate to `/repack`. | All three pages load without 403 errors or unauthorized redirects. Create, unpack, and repack functionality is accessible. "Close" (storage) operations show as accessible in navigation. | E2E |

---

## PHASE 6: Dispatch Operations

### Section 39: Dispatch — Per Role

---

#### 39.1 Create Dispatch

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DISP-ADM-001 | Admin | Admin creates dispatch with 1 CLOSED carton and customer | P1 | 1. Pre-condition: CLOSED carton `MC_UUID_CLOSED` with 2 child boxes. Customer `CUSTOMER_UUID_A` exists. 2. Login as Admin. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_CLOSED>"], "customer_id": "<CUSTOMER_UUID_A>", "destination": "Jaipur Depot", "vehicle_number": "RJ-14-GH-1234", "lr_number": "LR-2026-001", "transport_details": "Shiv Transport", "notes": "Test dispatch"}`. | HTTP 201. Response `data` is an array with 1 dispatch record: `{ "id": "<uuid>", "master_carton_id": "<MC_UUID_CLOSED>", "customer_id": "<CUSTOMER_UUID_A>", "destination": "Jaipur Depot", "vehicle_number": "RJ-14-GH-1234", "lr_number": "LR-2026-001", "transport_details": "Shiv Transport", "dispatch_date": "<timestamp>", "dispatched_by": "<admin_user_id>" }`. Carton status = DISPATCHED (verify via `GET /api/v1/master-cartons/<MC_UUID_CLOSED>`). | API |
| TC-DISP-ADM-002 | Admin | Admin creates dispatch with 2 cartons — both become DISPATCHED | P1 | 1. Pre-condition: Two CLOSED cartons `MC_UUID_C1` and `MC_UUID_C2` each with packed child boxes. 2. Login as Admin. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_C1>", "<MC_UUID_C2>"], "destination": "Mumbai Depot"}`. | HTTP 201. Response array has 2 dispatch records (one per carton). Both `MC_UUID_C1` and `MC_UUID_C2` now have `status = "DISPATCHED"`. All child boxes in both cartons now have `status = "DISPATCHED"`. Two `CARTON_DISPATCHED` and multiple `CHILD_DISPATCHED` transaction records logged. | API |
| TC-DISP-ADM-003 | Admin | Admin creates dispatch with ACTIVE carton (accepted) | P1 | 1. Pre-condition: ACTIVE carton `MC_UUID_ACTIVE` (not closed yet) with packed child boxes. 2. Login as Admin. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_ACTIVE>"], "destination": "Delhi Depot"}`. | HTTP 201. Dispatch succeeds (ACTIVE cartons are accepted per business logic). Carton status = DISPATCHED. Child boxes = DISPATCHED. | API |
| TC-DISP-SUP-001 | Supervisor | Supervisor creates dispatch | P2 | 1. Pre-condition: CLOSED carton `MC_UUID_S` with child boxes. 2. Login as Supervisor. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_S>"], "destination": "Test City"}`. | HTTP 201. Dispatch record created. Carton status = DISPATCHED. Child boxes = DISPATCHED. | API |
| TC-DISP-DOP-001 | Dispatch Operator | Dispatch Operator creates dispatch | P1 | 1. Pre-condition: CLOSED carton `MC_UUID_D` with child boxes. 2. Login as Dispatch Operator. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_D>"], "destination": "Test City"}`. | HTTP 201. Dispatch Operator is authorized. Dispatch record created. Carton and child boxes marked DISPATCHED. | API |
| TC-DISP-WHO-001 | Warehouse Operator | Warehouse Operator cannot create dispatch | P1 | 1. Login as Warehouse Operator. Pre-condition: CLOSED carton `MC_UUID_A`. 2. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_A>"], "destination": "Test City"}`. | HTTP 403. Forbidden. No dispatch record created. Carton status unchanged (remains CLOSED). | API |
| TC-DISP-VAL-001 | Admin | Dispatch with empty master_carton_ids array returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/dispatches` with body `{"master_carton_ids": [], "destination": "Test City"}`. | HTTP 400. Validation error: `"At least one master carton must be selected for dispatch"`. | API |
| TC-DISP-VAL-002 | Admin | Dispatch with already DISPATCHED carton returns 400 | P1 | 1. Pre-condition: DISPATCHED carton `MC_UUID_DISP`. 2. Login as Admin. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_DISP>"], "destination": "Test City"}`. | HTTP 400. Error message contains `"Cartons must be in ACTIVE or CLOSED status"` and references the invalid carton barcode. No dispatch record created. | API |
| TC-DISP-VAL-003 | Admin | Dispatch with non-existent carton ID returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["00000000-0000-0000-0000-000000000000"], "destination": "Test City"}`. | HTTP 404. Error message: `"Master cartons not found: 00000000-0000-0000-0000-000000000000"`. | API |
| TC-DISP-VAL-004 | Admin | Dispatch with customer_id auto-fills destination | P2 | 1. Pre-condition: Customer `CUSTOMER_UUID_A` has `delivery_location = "Jaipur Depot"`. CLOSED carton `MC_UUID_C` exists. 2. Login as Admin. 3. `POST /api/v1/dispatches` with body `{"master_carton_ids": ["<MC_UUID_C>"], "customer_id": "<CUSTOMER_UUID_A>"}` (no `destination` field). | HTTP 201. Dispatch record has `destination = "Jaipur Depot"` (auto-filled from customer's `delivery_location`). `customer_id` is populated in dispatch record. | API |

---

#### 39.2 After Dispatch State

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DISP-STATE-001 | Admin | After dispatch, carton status = DISPATCHED | P1 | 1. Pre-condition: CLOSED carton `MC_UUID_C` with child boxes. 2. Create dispatch: `POST /api/v1/dispatches` with `master_carton_ids: ["<MC_UUID_C>"]`. 3. `GET /api/v1/master-cartons/<MC_UUID_C>`. | Step 3 response: `status = "DISPATCHED"`. `dispatched_at` is a valid ISO timestamp. | Integration |
| TC-DISP-STATE-002 | Admin | After dispatch, all child boxes in carton become DISPATCHED | P1 | 1. Create and dispatch carton `MC_UUID_C` containing child boxes `CB_UUID_1`, `CB_UUID_2`. 2. `GET /api/v1/child-boxes/<CB_UUID_1>`. 3. `GET /api/v1/child-boxes/<CB_UUID_2>`. | Both child boxes have `status = "DISPATCHED"`. | Integration |
| TC-DISP-STATE-003 | Admin | After dispatch, inventory_transactions logged for carton and each child box | P1 | 1. Create and dispatch carton `MC_UUID_C` with 2 child boxes. 2. Query the database (or a `/inventory` endpoint): `SELECT * FROM inventory_transactions WHERE master_carton_id = '<MC_UUID_C>'`. | At minimum: 1 record with `transaction_type = "CARTON_DISPATCHED"` for the carton. 2 records with `transaction_type = "CHILD_DISPATCHED"` (one per child box). All records have `performed_by = <dispatching_user_id>` and non-null `notes`. | Integration |
| TC-DISP-STATE-004 | Admin | Dispatched carton cannot be unpacked, repacked, or closed | P1 | 1. Create and dispatch carton `MC_UUID_DISP`. 2. Attempt `POST /api/v1/master-cartons/<MC_UUID_DISP>/full-unpack`. 3. Attempt `POST /api/v1/master-cartons/<MC_UUID_DISP>/close`. 4. Attempt `POST /api/v1/master-cartons/unpack` with `master_carton_id = MC_UUID_DISP`. | Step 2: HTTP 400, `"Cannot unpack a dispatched carton"`. Step 3: HTTP 400, `"Cannot close a dispatched carton"`. Step 4: HTTP 400, `"Cannot unpack from a dispatched carton"`. All operations rejected. Carton remains DISPATCHED. | Integration |

---

#### 39.3 Read Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DISP-READ-001 | Any | GET /dispatches returns paginated list with customer/product summaries | P1 | 1. Login as Admin. 2. `GET /api/v1/dispatches`. | HTTP 200. Response: `{ "data": [...], "total": <n>, "page": 1, "limit": 25, "totalPages": <n> }`. Each dispatch record contains: `id`, `master_carton_id`, `carton_barcode`, `child_count`, `customer_firm_name`, `destination`, `dispatch_date`, `vehicle_number`, `lr_number`, `transport_details`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. Ordered by `dispatch_date DESC`. | API |
| TC-DISP-READ-002 | Any | GET /dispatches/:id returns full dispatch detail | P1 | 1. Login as Admin. 2. Create a dispatch and note its `id` as `DISPATCH_UUID`. 3. `GET /api/v1/dispatches/<DISPATCH_UUID>`. | HTTP 200. Response `data` contains: `id`, `master_carton_id`, `carton_barcode`, `child_count`, `customer_id`, `destination`, `transport_details`, `lr_number`, `vehicle_number`, `dispatch_date`, `dispatched_by`, `notes`. All fields from the dispatch record are returned. | API |
| TC-DISP-READ-003 | Any | Filter dispatches by date range | P2 | 1. Login as Admin. Pre-condition: dispatches exist on 2026-04-10 and 2026-04-15. 2. `GET /api/v1/dispatches?from_date=2026-04-10&to_date=2026-04-12`. | HTTP 200. Only dispatches with `dispatch_date` between 2026-04-10 and 2026-04-12 (inclusive) are returned. Dispatches from 2026-04-15 are excluded. | API |
| TC-DISP-READ-004 | Any | Search dispatches by carton barcode | P2 | 1. Login as Admin. Pre-condition: Dispatch with carton `BINNY-MC-abc123` exists. 2. `GET /api/v1/dispatches?search=BINNY-MC-abc`. | HTTP 200. Response includes the matching dispatch record. The `carton_barcode` in results contains `"BINNY-MC-abc"`. Non-matching records are excluded. | API |
| TC-DISP-READ-005 | Any | Dispatch list shows customer_firm_name, carton_barcode, child_count | P1 | 1. Login as Admin. 2. Create a dispatch with customer `CUSTOMER_UUID_A` (firm_name = "Ramesh Traders") for carton with 3 child boxes. 3. `GET /api/v1/dispatches`. | HTTP 200. The newly created dispatch record in `data` contains: `customer_firm_name = "Ramesh Traders"`, `carton_barcode = "BINNY-MC-..."` (not null), `child_count = 3`. | API |
| TC-DISP-READ-006 | Any | Empty dispatch list returns 200 with empty array | P2 | 1. Login as Admin. 2. (Optionally use search with a non-existent term.) `GET /api/v1/dispatches?search=ZZZNOMATCH`. | HTTP 200. Response: `{ "data": [], "total": 0, "page": 1, "limit": 25, "totalPages": 0 }`. No error thrown. | API |

---

#### 39.4 Playwright E2E

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DISP-E2E-001 | Admin | Dispatch creation page loads | P1 | 1. Login as Admin. 2. Navigate to `/dispatch`. | Page heading "Dispatch" visible. Description "Create a new dispatch with master cartons" visible. Two columns: left with "Dispatch Details" form card, right with "Scan Master Cartons" card. "Create Dispatch (0 cartons)" button visible and disabled. | E2E |
| TC-DISP-E2E-002 | Admin | Customer dropdown loads from API | P1 | 1. Navigate to `/dispatch` as Admin. 2. Click the "Customer (Optional)" dropdown. | Dropdown opens and shows a list of customers fetched from `GET /api/v1/customers?limit=200&is_active=true`. Each option shows: `{firm_name} — {delivery_location}`. Loading state (if any) resolves within 3 seconds. | E2E |
| TC-DISP-E2E-003 | Admin | Selecting customer auto-fills destination | P1 | 1. Navigate to `/dispatch`. 2. Select customer "Ramesh Traders" (which has `delivery_location = "Jaipur Depot"`) from the Customer dropdown. | The "Destination (Optional)" input field is auto-filled with `"Jaipur Depot"`. Helper text "Auto-filled from customer. You can override." is displayed below the destination input. Destination field remains editable. | E2E |
| TC-DISP-E2E-004 | Admin | Scan carton barcode shows carton details | P1 | 1. Navigate to `/dispatch`. 2. In the "Or enter barcode manually" section, type a valid ACTIVE or CLOSED carton barcode (e.g., `BINNY-MC-<uuid>`). 3. Click "Add". | A carton entry appears in the "Cartons to Dispatch" list. It shows: article name (if available from child boxes), colour, sizes, MRP summary, carton barcode (font-mono), child box count, status. Counter increments: "Cartons to Dispatch (1)". "Create Dispatch (1 carton)" button becomes enabled. | E2E |
| TC-DISP-E2E-005 | Admin | Fill transport details, LR number, vehicle number | P2 | 1. Navigate to `/dispatch`. 2. Fill in: Vehicle Number = "RJ-14-GH-1234", Transport Details = "Shiv Transport Co.", LR/Bilty Number = "LR-2026-0042", Notes = "Fragile items". 3. Add a carton barcode. | All fields accept the input values. No validation errors for optional fields. "Create Dispatch" button is enabled (since carton is added). | E2E |
| TC-DISP-E2E-006 | Admin | Submit dispatch shows success and redirects | P1 | 1. Navigate to `/dispatch`. 2. Add 1 valid CLOSED carton. 3. Enter destination "Jaipur Depot". 4. Click "Create Dispatch (1 carton)". 5. Wait for API response. | Toast notification: "Dispatch created successfully". Page redirects to `/dispatches`. The dispatches list page loads and shows the newly created dispatch in the list. | E2E |
| TC-DISP-E2E-007 | Admin | Dispatches list page loads grouped by customer | P1 | 1. Login as Admin. 2. Navigate to `/dispatches`. | Page heading "Dispatches" visible. Description: "View dispatch records grouped by customer". A "Dispatch Carton" button links to `/dispatch`. Records are grouped by customer, each group showing: customer name (or "Walk-in / No Customer"), total cartons, total boxes, destinations, latest dispatch date. | E2E |
| TC-DISP-E2E-008 | Admin | Expand customer group shows individual carton details | P1 | 1. Navigate to `/dispatches`. Pre-condition: At least one customer group with 2 dispatch records. 2. Click on a customer group row to expand it. | The group row expands (ChevronUp icon). An expanded section shows each individual dispatch record as a card containing: carton barcode, child_count, article_summary, colour_summary, size_summary, mrp_summary, destination, vehicle_number, LR number, transport_details, dispatch_date. | E2E |
| TC-DISP-E2E-009 | Dispatch Operator | Dispatch Operator can access dispatch creation page | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/dispatch`. | Page loads without 403 error or redirect. "Dispatch Details" form is fully interactive. Customer dropdown, barcode input, and all fields are usable. "Create Dispatch" button is present. Dispatch Operator can submit the form successfully. | E2E |
| TC-DISP-E2E-010 | Warehouse Operator | Warehouse Operator cannot see dispatch creation page or "Dispatch Carton" button | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/dispatches`. 3. Inspect sidebar navigation and page header. 4. Attempt to navigate directly to `/dispatch`. | Step 2: The "Dispatch Carton" button (linking to `/dispatch`) is NOT visible in the page header. Step 3: No "Dispatch" link appears in sidebar navigation for Warehouse Operator role. Step 4: Page at `/dispatch` shows a 403 error, access denied message, or redirects to dashboard. Warehouse Operator cannot create a dispatch. | E2E |

---

## Summary Table — Phase 4–6 Test Count

| Phase | Section | API Tests | Integration Tests | E2E Tests | Total |
|-------|---------|-----------|-------------------|-----------|-------|
| Phase 4 | 37.1 Create Operations | 12 | 0 | 0 | 12 |
| Phase 4 | 37.2 Read Operations | 6 | 0 | 0 | 6 |
| Phase 4 | 37.3 Validation | 8 | 0 | 0 | 8 |
| Phase 4 | 37.4 E2E Generate Page | 0 | 0 | 12 | 12 |
| Phase 5 | 38.1 Create & Pack | 10 | 0 | 0 | 10 |
| Phase 5 | 38.2 Close/Seal | 6 | 0 | 0 | 6 |
| Phase 5 | 38.3 Unpack | 7 | 1 | 0 | 8 |
| Phase 5 | 38.4 Repack | 6 | 2 | 0 | 8 |
| Phase 5 | 38.5 Read & Detail | 8 | 0 | 0 | 8 |
| Phase 5 | 38.6 E2E | 0 | 0 | 14 | 14 |
| Phase 6 | 39.1 Create Dispatch | 10 | 0 | 0 | 10 |
| Phase 6 | 39.2 After Dispatch State | 0 | 4 | 0 | 4 |
| Phase 6 | 39.3 Read Operations | 6 | 0 | 0 | 6 |
| Phase 6 | 39.4 E2E | 0 | 0 | 10 | 10 |
| **TOTAL** | | **79** | **7** | **36** | **122** |

---

## Appendix A: Test Prerequisites & Seed Data Script

### Required Seed Data (run before Phase 4–6 tests)

```sql
-- 1. Products: Binny Slipper in Blue, sizes 6,7,8,9
INSERT INTO products (id, article_name, article_code, sku, size, colour, mrp, category, section, location, is_active)
VALUES
  ('PROD-UUID-6', 'Binny Slipper', 'BS-001', 'BS-001-BL-6', '6', 'Blue', 299.00, 'Gents', 'Hawaii', 'VKIA', true),
  ('PROD-UUID-7', 'Binny Slipper', 'BS-001', 'BS-001-BL-7', '7', 'Blue', 299.00, 'Gents', 'Hawaii', 'VKIA', true),
  ('PROD-UUID-8', 'Binny Slipper', 'BS-001', 'BS-001-BL-8', '8', 'Blue', 299.00, 'Gents', 'Hawaii', 'VKIA', true),
  ('PROD-UUID-9', 'Binny Slipper', 'BS-001', 'BS-001-BL-9', '9', 'Blue', 299.00, 'Gents', 'Hawaii', 'VKIA', true);

-- 2. Inactive product
INSERT INTO products (id, article_name, sku, size, colour, mrp, is_active)
VALUES ('INACTIVE-PROD-UUID', 'Old Style', 'OLD-001', '6', 'Red', 199.00, false);

-- 3. Customer
INSERT INTO customers (id, firm_name, delivery_location, is_active)
VALUES ('CUST-UUID-A', 'Ramesh Traders', 'Jaipur Depot', true);

-- 4. Users (one per role) — passwords hashed with bcrypt
-- Refer to auth seeder script for actual inserts
```

### Environment Variables for Tests

```env
TEST_BASE_URL=http://localhost:3001/api/v1
TEST_ADMIN_EMAIL=admin@binny.com
TEST_ADMIN_PASSWORD=Admin@123
TEST_SUPERVISOR_EMAIL=supervisor@binny.com
TEST_SUPERVISOR_PASSWORD=Super@123
TEST_WAREHOUSE_EMAIL=warehouse@binny.com
TEST_WAREHOUSE_PASSWORD=Ware@123
TEST_DISPATCH_EMAIL=dispatch@binny.com
TEST_DISPATCH_PASSWORD=Disp@123
```

---

## Appendix B: Key Business Rules Reference

| Rule | Description |
|------|-------------|
| Child box statuses | FREE → PACKED → DISPATCHED. Only FREE boxes can be packed. |
| Carton statuses | CREATED → ACTIVE → CLOSED → DISPATCHED |
| CREATED status | Carton has 0 child boxes (never been packed, or fully unpacked). |
| ACTIVE status | Carton has ≥1 child box. Can still accept more. |
| CLOSED status | Sealed by Admin/Supervisor. Cannot accept more boxes. Ready for dispatch. |
| DISPATCHED status | Carton has been dispatched. Immutable — no unpacking, repacking, or closing allowed. |
| Dispatch accepts | Only ACTIVE and CLOSED cartons can be dispatched. CREATED and DISPATCHED are rejected. |
| Close permission | Only Admin and Supervisor can close a carton (Warehouse Operator cannot). |
| Dispatch permission | Admin, Supervisor, Dispatch Operator can create dispatch (Warehouse Operator cannot). |
| Barcode format | Child boxes: `BINNY-CB-{uuid}`. Master cartons: `BINNY-MC-{uuid}`. |
| Max bulk create | 500 child boxes per request (single size or multi-size combined total). |
| Max capacity | Default 50 child boxes per carton. Max configurable: 100. |
| Transaction log | Every state change (created, packed, unpacked, repacked, closed, dispatched) is logged to `inventory_transactions`. |
| Audit log | Every API mutation is logged to `audit_logs` with user, action, entity type/id, and new values. |
| Destination auto-fill | If `customer_id` is provided without `destination`, the customer's `delivery_location` is used as destination. |
