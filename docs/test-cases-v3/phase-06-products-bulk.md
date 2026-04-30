# Phase 06 — Products: Bulk Operations

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3
**Phase:** 06 of 20
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (portal)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (portal)
**Last updated:** 2026-04-30

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `SECTION_HAWAII_ID` | Section `"Hawaii"` from Phase 03 |
| `SECTION_MERLIN_ID` | Section `"Merlin"` from Phase 03 |

### Valid sample CSV for bulk product upload

```
article_name,article_code,colour,size,mrp,category,section
Csv Sandal,CSV-001,Blue,6,199,Gents,Hawaii
Csv Sandal,CSV-001,Blue,7,199,Gents,Hawaii
Csv Sandal,CSV-001,Blue,8,199,Gents,Hawaii
```

---

## Phase 06: Products Bulk Operations

### Section 1: Sample CSV Download (GET /products/bulk-upload/sample)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-101 | Admin | Admin downloads product bulk-upload sample CSV | P0 | 1. Login as Admin, save JWT. 2. `GET /api/v1/products/bulk-upload/sample` with `Authorization: Bearer <JWT>`. | HTTP 200. `Content-Type: text/csv` or `application/octet-stream`. Response body is a valid CSV text. First line is a header row containing at minimum: `article_name`, `article_code`, `colour`, `size`, `mrp`, `category`, `section`. At least one sample data row is present. | API | |
| TC-PROD-102 | Supervisor | Supervisor downloads sample CSV | P1 | 1. Login as Supervisor. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 200. Valid CSV content. Same structure as TC-PROD-101. | API | |
| TC-PROD-103 | Warehouse Operator | Warehouse Operator cannot download product sample CSV | P0 | 1. Login as `warehouse@binny.com`. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 403. Forbidden. No file downloaded. | API | |
| TC-PROD-104 | Dispatch Operator | Dispatch Operator cannot download product sample CSV | P0 | 1. Login as `dispatch@binny.com`. 2. `GET /api/v1/products/bulk-upload/sample`. | HTTP 403. Forbidden. | API | |

---

### Section 2: Bulk CSV Upload (POST /products/bulk-upload)

#### 2.1 — Upload success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-105 | Admin | Admin uploads valid 3-row CSV — all rows succeed | P0 | 1. Login as Admin. 2. Create a CSV file `products.csv` with 3 rows (see shared fixtures). 3. `POST /api/v1/products/bulk-upload` as multipart/form-data, field `file` = the CSV. | HTTP 200 or 201. Response: `{"success":true,"data":{"created":3,"errors":[],"total":3}}` (or equivalent). 3 new product rows exist in `products` table with matching SKUs. | API | |
| TC-PROD-106 | Supervisor | Supervisor uploads valid CSV | P1 | 1. Login as Supervisor. 2. Upload a 2-row valid CSV via `POST /api/v1/products/bulk-upload`. | HTTP 200/201. `created = 2`, `errors = []`. Both products exist in DB. | API | |
| TC-PROD-107 | Admin | Upload CSV with optional fields (description, location, hsn_code) | P1 | 1. Login as Admin. 2. CSV rows include columns: `article_name,article_code,colour,size,mrp,category,section,description,location,hsn_code`. 3. Upload via `POST /api/v1/products/bulk-upload`. | HTTP 200. Optional fields stored per row. `GET /api/v1/products?search=<article_name>` returns products with those optional fields populated. | API | |
| TC-PROD-108 | Admin | Upload CSV — duplicate (article_name, colour, size) row error-reported, others created | P1 | 1. Pre-condition: `Csv Sandal / Blue / 6` already exists (from TC-PROD-105). 2. Login as Admin. 3. CSV has 3 rows: row 1 is a duplicate `Csv Sandal / Blue / 6`; rows 2–3 are new. 4. Upload. | HTTP 200. Response: `created = 2`, `errors` array has 1 entry with `row = 1` and an error message referencing the duplicate. Rows 2–3 are created in DB. | API | Per-row error continues to next row |

---

#### 2.2 — Upload validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-109 | Admin | Missing required column in CSV returns 400 | P0 | 1. Login as Admin. 2. Create a CSV with headers `article_name,colour,size,mrp,category,section` (missing `article_code`). 3. Upload. | HTTP 400. Error message references the missing required column. No products created. | API | Header check runs before row processing |
| TC-PROD-110 | Admin | Empty CSV (header only) returns 400 | P0 | 1. Login as Admin. 2. CSV file contains only the header line, no data rows. 3. Upload. | HTTP 400. Error: `"CSV file is empty"` or similar. No products created. | API | |
| TC-PROD-111 | Admin | Non-CSV file uploaded returns 400 | P0 | 1. Login as Admin. 2. Upload a `.txt` or `.xlsx` file via the `file` field. | HTTP 400. File type error. No products created. | API | csvUpload middleware restricts to CSV |
| TC-PROD-112 | Admin | Row with invalid category rejected, others processed | P1 | 1. Login as Admin. 2. CSV row 1: valid. Row 2: `category = "Toddler"` (invalid). Row 3: valid. 3. Upload. | HTTP 200. `created = 2`, `errors` has 1 entry for row 2 with enum error. Rows 1 and 3 created in DB. | API | |
| TC-PROD-113 | Admin | Row with non-numeric MRP rejected | P1 | 1. Login as Admin. 2. CSV row with `mrp = "abc"`. 3. Upload alongside valid rows. | HTTP 200. Error row reported. Valid rows created. Error entry references MRP type constraint. | API | |
| TC-PROD-114 | Admin | Row with negative MRP rejected | P1 | 1. Login as Admin. 2. CSV row with `mrp = -50`. 3. Upload alongside 1 valid row. | HTTP 200. Error for negative-MRP row. Valid row created. | API | |
| TC-PROD-115 | Admin | Upload without file field returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-upload` with empty multipart body (no `file` field). | HTTP 400. Error indicating file is required. | API | |
| TC-PROD-116 | Warehouse Operator | Warehouse Operator cannot upload CSV | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/products/bulk-upload` with valid CSV. | HTTP 403. Forbidden. No products created. | API | |
| TC-PROD-117 | Dispatch Operator | Dispatch Operator cannot upload CSV | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/products/bulk-upload` with valid CSV. | HTTP 403. Forbidden. | API | |

---

### Section 3: Size-Range Bulk Create (POST /products/bulk-size-range) — Apr 22 mod

#### 3.1 — Success cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-118 | Admin | Admin creates 5-size range successfully | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body: `{"article_name":"Range Boot","article_code":"RBT-001","colour":"Brown","mrp":450,"category":"Gents","section":"Hawaii","size_from":"5","size_to":"9"}`. | HTTP 201. Response is an array of exactly 5 product objects. Sizes are `"5"`, `"6"`, `"7"`, `"8"`, `"9"`. All have same `article_name`, `colour`, `mrp`, `category`, `section`. Each has a unique `id` and unique `sku`. All `is_active = true`. | API | Service runs in DB transaction |
| TC-PROD-119 | Admin | Single-size range (size_from == size_to) creates 1 product | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"6"`, `size_to:"6"`. | HTTP 201. Array of exactly 1 product. Size = "6". SKU valid. | API | |
| TC-PROD-120 | Admin | Maximum 20-size range creates 20 products | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"1"`, `size_to":"20"`. | HTTP 201. Array of exactly 20 product objects, sizes "1"–"20". All unique SKUs. All saved in DB in a single transaction (verify via count query). | API | Max allowed is 20 |
| TC-PROD-121 | Supervisor | Supervisor creates size-range successfully | P1 | 1. Login as Supervisor. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"6"`, `size_to":"8"`. | HTTP 201. 3 products created. | API | |
| TC-PROD-122 | Admin | Optional fields (description, location, article_group, hsn_code) apply to all sizes | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body includes `"location":"VKIA"`, `"article_group":"Summer"`, `"hsn_code":"64039900"`. `size_from:"6"`, `size_to":"8"`. | HTTP 201. All 3 returned products have `location="VKIA"`, `article_group="Summer"`, `hsn_code="64039900"`. | API | |
| TC-PROD-123 | Admin | Image upload after bulk-size-range applies to all N products | P1 | 1. Create 3-size range (sizes 6–8) — note returned `id` array. 2. For each `id`, `POST /api/v1/products/<id>/image` with same JPEG. | All 3 products have `image_url` populated. Equivalent to the frontend's `Promise.all` image upload call. | Integration | Frontend: `Promise.all(result.map(p => uploadImage(p.id, file)))` |

---

#### 3.2 — Validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-124 | Admin | size_from > size_to returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"9"`, `size_to:"5"`. | HTTP 400. Error: `"size_from must be less than or equal to size_to"`. No products created. | API | Zod refine check |
| TC-PROD-125 | Admin | Range exceeds 20 sizes returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"1"`, `size_to":"21"` (21 sizes). | HTTP 400. Error: `"Size range cannot exceed 20 sizes"`. No products created. | API | `size_to - size_from + 1 <= 20` |
| TC-PROD-126 | Admin | Non-integer size_from returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_from:"5.5"`. | HTTP 400. Error: `"size_from must be a positive integer string"`. | API | Zod regex `/^\d+$/` |
| TC-PROD-127 | Admin | Non-integer size_to returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `size_to:"abc"`. | HTTP 400. Error: `"size_to must be a positive integer string"`. | API | |
| TC-PROD-128 | Admin | Missing size_from returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body omits `size_from`. | HTTP 400. Validation error referencing `size_from`. | API | |
| TC-PROD-129 | Admin | Missing size_to returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body omits `size_to`. | HTTP 400. Validation error referencing `size_to`. | API | |
| TC-PROD-130 | Admin | Missing article_name returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body omits `article_name`. | HTTP 400. Error referencing `article_name`. | API | |
| TC-PROD-131 | Admin | Negative MRP returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `mrp:-1`. | HTTP 400. Error: `"MRP must be positive"`. | API | |
| TC-PROD-132 | Admin | Invalid category returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `category:"Toddler"`. | HTTP 400. Enum error for `category`. | API | |
| TC-PROD-133 | Admin | Invalid location returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body with `location:"JAIPUR"`. | HTTP 400. Enum error for `location`. | API | |
| TC-PROD-134 | Warehouse Operator | Warehouse Operator cannot call bulk-size-range | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/products/bulk-size-range` with valid body. | HTTP 403. Forbidden. No products created. | API | |
| TC-PROD-135 | Dispatch Operator | Dispatch Operator cannot call bulk-size-range | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/products/bulk-size-range` with valid body. | HTTP 403. Forbidden. | API | |

---

#### 3.3 — Transaction & SKU integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-136 | Admin | Bulk-size-range is atomic — one bad mid-range row rolls back all | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` with `size_from:"5"`, `size_to":"7"`. Force a DB constraint violation mid-transaction (e.g., inject a duplicate `article_name/colour/size` that already exists for size 6). | HTTP 400/409. 0 products created for this call. No partial rows left in `products` table for this batch. | Integration | Requires controlled DB state; run after creating size-6 duplicate in setup |
| TC-PROD-137 | Admin | SKU serial is consistent across bulk range | P1 | 1. Login as Admin. 2. `POST /api/v1/products/bulk-size-range` body: `article_name="Serial Test"`, `colour="Gold"`, `size_from:"6"`, `size_to":"8"`, `category="Ladies"`, `section="Merlin"`. | HTTP 201. Three products returned. Each `sku` follows pattern `MERLIN-SERIAL-TEST-LADIES-NN-GOLD`. The `NN` serial is the same across all 3 (it is computed once per article+colour+category+section combo at batch start and increments per size). | API | SKU serial is count-based in `skuGenerator.ts` |

---

### Section 4: E2E — Products page bulk flows

#### 4.1 — CSV upload modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-101 | Admin | Bulk Import button opens CSV upload modal | P0 | 1. Login as Admin. Navigate to `/products`. 2. Click "Bulk Import" button. | A modal opens. Title contains "Bulk Import" or "CSV Upload". Modal contains: a "Download Sample" link/button, a file input (drag-drop or click-to-upload), and an Upload/Submit button. | E2E | Button only visible to `isManager` (Admin + Supervisor) |
| TC-PROD-E2E-102 | Admin | Download Sample link downloads CSV | P1 | 1. Open bulk upload modal. 2. Click "Download Sample" link/button. | Browser downloads a file named similar to `products-bulk-upload-sample.csv`. File opens as valid CSV with correct headers. | E2E | |
| TC-PROD-E2E-103 | Admin | Upload valid CSV — success banner shows created count | P0 | 1. Open bulk upload modal. 2. Attach a valid 3-row CSV. 3. Click Upload. | `POST /api/v1/products/bulk-upload` called. Success: a results panel appears showing "3 products created" (or equivalent). No error rows shown. Product table refreshes. | E2E | |
| TC-PROD-E2E-104 | Admin | Upload CSV with errors — error report panel shown | P1 | 1. Open bulk upload modal. 2. Attach CSV where row 2 has invalid category. 3. Upload. | Results panel shows `created = <n>`, and an error section listing row 2 with the error message. Valid rows created and visible in the table. | E2E | |
| TC-PROD-E2E-105 | Warehouse Operator | Warehouse Operator does not see Bulk Import button | P0 | 1. Login as Warehouse Operator. Navigate to `/products`. | "Bulk Import" button is NOT visible. No upload controls present. | E2E | |

---

#### 4.2 — Size-range mode in create modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-106 | Admin | Hint text visible near Size/Size Range fields | P1 | 1. Open create product modal as Admin. | Modal shows helper/hint text near the size inputs, e.g., "Enter a single Size OR a Size From/Size To range". Both groups of fields visible. | E2E | |
| TC-PROD-E2E-107 | Admin | Size-range mode: Submit calls bulk-size-range endpoint | P0 | 1. Open create modal. 2. Fill: Article Name, Article Code, Colour, MRP, Category, Section. 3. Leave Size blank. Fill Size From = "5", Size To = "7". 4. Click Submit. | `POST /api/v1/products/bulk-size-range` is called (not `POST /api/v1/products`). Toast: "3 products created successfully". Three new rows in table. | E2E | |
| TC-PROD-E2E-108 | Admin | Size-range create with image: image uploaded to all products | P1 | 1. Open create modal. 2. Fill range fields (Size From = "6", Size To = "8"). 3. Attach a JPEG. 4. Click Submit. | `POST /api/v1/products/bulk-size-range` returns 3 products. `POST /api/v1/products/<id>/image` called for each of the 3 IDs. Success toast. All 3 products show image thumbnail. | E2E | Frontend `Promise.all` pattern |
| TC-PROD-E2E-109 | Admin | Image upload failure for range shows partial-failure toast | P1 | 1. Mock `POST /products/<id>/image` to fail. 2. Submit size-range create. | Products created toast shown. Additional toast: "Products created but image upload failed for some — upload manually via edit". | E2E | Error toast from frontend catch block |
