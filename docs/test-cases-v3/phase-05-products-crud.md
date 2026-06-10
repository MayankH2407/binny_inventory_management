# Phase 05 — Products: CRUD, Size-Range Create, Image Upload, Status Filter, Casing

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3 (refreshed 2026-06-09)
**Phase:** 05
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (portal)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (portal)
**Last updated:** 2026-06-09 (Session A5 full refresh)
**Playwright specs:** `10-products.spec.ts`, `17-products-sections-rbac.spec.ts`, `38-product-status-filter.spec.ts`

---

## Scope

Single-product create (`POST /products`), bulk-by-size-range create (`POST /products/bulk-size-range`), update (`PUT /products/:id`), delete (`DELETE /products/:id` — soft), get-by-id (`GET /products/:id`), list with filters (`GET /products`), colours sub-endpoint (`GET /products/:id/colours`), sizes sub-endpoint (`GET /products/:id/sizes`), image upload (`POST /products/:id/image`).

Cross-cutting features: Active/Inactive/All status filter (`is_active` query param; UI `<select>` defaulting to "active"); casing normalization (`toTitleCase` for article_name/colour/section/article_group; UPPERCASE for article_code; canonical matching for category/location; description HTML-stripped, stored as-typed); SKU generation and deduplication; search + column filters; RBAC per access matrix.

**Out of scope for this phase:** Product CSV bulk upload (`POST /products/bulk-upload`) and sample CSV (`GET /products/bulk-upload/sample`) — covered in phase-06 (Session A6).

---

## Shared test fixtures

| Fixture alias | Value |
|---|---|
| `ADMIN_TOKEN` | JWT from `POST /auth/login` with Admin credentials |
| `SUPERVISOR_TOKEN` | JWT from `POST /auth/login` with Supervisor credentials |
| `WAREHOUSE_TOKEN` | JWT from `POST /auth/login` with Warehouse Operator credentials |
| `DISPATCH_TOKEN` | JWT from `POST /auth/login` with Dispatch Operator credentials |
| `SECTION_NAME` | `"Hawaii"` — must exist in the sections table before running this phase |
| `PRODUCT_UUID_A` | Created by TC-PROD-001 — `article_name="Busker"`, `colour="White"`, `size="6"`, `mrp=299`, `category="Gents"`, `section="Hawaii"` |
| `INACTIVE_PRODUCT_UUID` | A product set to `is_active=false` (created and deactivated in TC-PROD-055) |

---

## RBAC reference (products module)

| Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `products:create` (POST /products, POST /products/bulk-size-range) | ✓ | ✓ | ✗ (403) | ✗ (403) |
| `products:update` (PUT /products/:id, POST /products/:id/image) | ✓ | ✓ | ✗ (403) | ✗ (403) |
| `products:delete` (DELETE /products/:id) | ✓ | ✗ (403) | ✗ (403) | ✗ (403) |
| `products:read` — GET list/detail/colours/sizes | ✓ | ✓ | ✓ | ✓ |
| Unauthenticated (any method) | 401 | — | — | — |

**Access-matrix notes verified against code:**
- GET endpoints `/products`, `/products/:id`, `/products/:id/colours`, `/products/:id/sizes` have NO `authorizePermission` gate — only `authenticate` middleware. All four authenticated roles receive HTTP 200. This is intentional (auth-only GETs); encode as explicit TCs.
- The frontend page (`/products`) wraps in `isManager` check (`Admin || Supervisor`). Warehouse Operator and Dispatch Operator who navigate to `/products` directly see an "Access Denied" page even though the API allows their reads. Both behaviors are tested.
- `POST /products/:id/image` uses `authorizePermission('products:update')` — same gate as PUT. Warehouse Op and Dispatch Op receive 403.
- `products:create` and `products:update` are seeded for both Admin and Supervisor — **confirmed in `001_roles.ts`**. No discrepancy.
- The sample-CSV endpoint `GET /products/bulk-upload/sample` uses `authorizePermission('products:read')` — covered in phase-06.

---

## Table of Contents

1. [Section 1: Single Create (POST /products)](#section-1-single-create-post-products)
   - 1.1 Role-based creation
   - 1.2 Validation — missing required fields
   - 1.3 Validation — wrong-type / boundary
   - 1.4 Casing normalization on create
   - 1.5 SKU generation and deduplication
2. [Section 2: Bulk-by-Size-Range Create (POST /products/bulk-size-range)](#section-2-bulk-by-size-range-create-post-productsbulk-size-range)
   - 2.1 Role-based bulk-size-range
   - 2.2 Validation and boundary
   - 2.3 SKU serial sequencing in transaction
3. [Section 3: List Products (GET /products)](#section-3-list-products-get-products)
   - 3.1 Auth — all roles
   - 3.2 Status filter (is_active)
   - 3.3 Search and column filters
   - 3.4 Pagination
4. [Section 4: Get Product by ID (GET /products/:id)](#section-4-get-product-by-id-get-productsid)
   - 4.1 Happy path and RBAC
   - 4.2 Error cases
5. [Section 5: Colours and Sizes Sub-Endpoints](#section-5-colours-and-sizes-sub-endpoints)
6. [Section 6: Update Product (PUT /products/:id)](#section-6-update-product-put-productsid)
   - 6.1 Role-based update
   - 6.2 Casing normalization on update
   - 6.3 Update validation
7. [Section 7: Delete Product (DELETE /products/:id)](#section-7-delete-product-delete-productsid)
8. [Section 8: Image Upload (POST /products/:id/image)](#section-8-image-upload-post-productsidimage)
   - 8.1 Upload success
   - 8.2 Upload validation and RBAC denial
   - 8.3 Image-propagation behavior
9. [Section 9: E2E — Products Page (Playwright)](#section-9-e2e--products-page-playwright)
   - 9.1 Page load and access guard
   - 9.2 Status filter UI
   - 9.3 Section tabs and column filters
   - 9.4 Create product modal — single mode
   - 9.5 Create product modal — size-range mode
   - 9.6 Edit product modal
   - 9.7 Bulk Import button and modal (pointer to phase-06)

---

## Section 1: Single Create (POST /products)

### 1.1 — Role-based creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-001 | Admin | Admin creates product — all required fields | P0 | 1. `POST /auth/login` as Admin, save `ADMIN_TOKEN`. 2. `POST /products` with `Authorization: Bearer <ADMIN_TOKEN>` and body `{"article_name":"Busker","article_code":"BSK-001","colour":"White","size":"6","mrp":299,"category":"Gents","section":"Hawaii"}`. | HTTP 201. `{"success":true,"data":{...}}`. `data.id` is a valid UUID. `data.sku` matches pattern `HAWAII-BUSKER-GENTS-NN-WHITE` (e.g., `HAWAII-BUSKER-GENTS-01-WHITE`). `data.is_active = true`. `data.article_name = "Busker"` (Title Case preserved). Save `data.id` as `PRODUCT_UUID_A`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-ADM-001. SKU format: `SECTION-ARTICLE-CATEGORY-NN-COLOUR` (all uppercase, spaces → `-`). |
| TC-PROD-002 | Admin | Admin creates product — all optional fields | P1 | 1. Login as Admin. 2. `POST /products` body: `{"article_name":"Busker","article_code":"BSK-001","colour":"Black","size":"7","mrp":299,"category":"Gents","section":"Hawaii","description":"Summer sandal","location":"VKIA","article_group":"Casual","hsn_code":"64039900"}`. | HTTP 201. Response `data` includes `description="Summer sandal"`, `location="VKIA"`, `article_group="Casual"` (Title Case), `hsn_code="64039900"`. `sku` non-empty. | API | |
| TC-PROD-003 | Admin | Admin creates product — description HTML-stripped | P1 | 1. Login as Admin. 2. `POST /products` body with `"description":"<b>Bold</b> sandal"`, all other fields valid. | HTTP 201. `data.description = "Bold sandal"` (HTML tags removed by `stripHtml`). | API | AUTOMATION GAP — no existing spec covers HTML-strip behavior. |
| TC-PROD-004 | Supervisor | Supervisor creates product — 201 | P0 | 1. Login as Supervisor, save `SUPERVISOR_TOKEN`. 2. `POST /products` body: `{"article_name":"Busker","article_code":"BSK-001","colour":"Red","size":"8","mrp":299,"category":"Gents","section":"Hawaii"}`. | HTTP 201. `data.id` is a valid UUID. `data.sku` non-empty. `data.is_active = true`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-SUP-001. Supervisor holds `products:create` in seed. |
| TC-PROD-005 | Warehouse Operator | Warehouse Operator cannot create product — 403 | P0 | 1. Login as Warehouse Operator, save `WAREHOUSE_TOKEN`. 2. `POST /products` body: `{"article_name":"X","article_code":"X-001","colour":"Blue","size":"6","mrp":100,"category":"Gents","section":"Hawaii"}`. | HTTP 403. Response `success:false`. No product row inserted. | API | Realizing spec: `17-products-sections-rbac.spec.ts` (implicit by absence of WH create test). |
| TC-PROD-006 | Dispatch Operator | Dispatch Operator cannot create product — 403 | P0 | 1. Login as Dispatch Operator, save `DISPATCH_TOKEN`. 2. `POST /products` same body as TC-PROD-005. | HTTP 403. Forbidden. No product created. | API | |
| TC-PROD-007 | Unauthenticated | Unauthenticated create returns 401 | P0 | 1. `POST /products` with no `Authorization` header, body same as TC-PROD-001. | HTTP 401. Authentication error in response. No product created. | API | |

### 1.2 — Validation: missing required fields

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-010 | Admin | Missing article_name returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `article_name` (sends `article_code`, `colour`, `size`, `mrp`, `category`, `section`). | HTTP 400. `success:false`. Error references `article_name`. No product created. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-VAL-001. |
| TC-PROD-011 | Admin | Missing article_code returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `article_code`. | HTTP 400. Error references `article_code`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-VAL-002. |
| TC-PROD-012 | Admin | Missing colour returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `colour`. | HTTP 400. Error references `colour`. | API | |
| TC-PROD-013 | Admin | Missing size returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `size`. | HTTP 400. Error references `size`. | API | |
| TC-PROD-014 | Admin | Missing mrp returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `mrp`. | HTTP 400. Error references `mrp`. | API | |
| TC-PROD-015 | Admin | Missing category returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `category`. | HTTP 400. Error references `category`. | API | |
| TC-PROD-016 | Admin | Missing section returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `section`. | HTTP 400. Error references `section`. | API | |

### 1.3 — Validation: wrong-type / boundary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-020 | Admin | Negative MRP returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body with `"mrp":-1`, all other fields valid. | HTTP 400. Error: `"MRP must be positive"`. No product created. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-VAL-004. |
| TC-PROD-021 | Admin | Zero MRP returns 400 | P1 | 1. Login as Admin. 2. `POST /products` body with `"mrp":0`. | HTTP 400. MRP positive validation fails. | API | Schema: `.positive('MRP must be positive')`. |
| TC-PROD-022 | Admin | MRP exceeds max returns 400 | P2 | 1. Login as Admin. 2. `POST /products` body with `"mrp":100000000`. | HTTP 400. Error referencing max MRP (99999999.99). | API | Schema: `.max(99999999.99)`. |
| TC-PROD-023 | Admin | Invalid category returns 400 | P0 | 1. Login as Admin. 2. `POST /products` body with `"category":"Kids"`. | HTTP 400. Error: `"Category must be one of: Gents, Ladies, Boys, Girls"`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-VAL-005. Valid values: Gents, Ladies, Boys, Girls. |
| TC-PROD-024 | Admin | Invalid location returns 400 | P1 | 1. Login as Admin. 2. `POST /products` body with `"location":"XYZ"`. | HTTP 400. Error: `"Location must be one of: VKIA, MIA, F540"`. | API | Valid values: VKIA, MIA, F540. |
| TC-PROD-025 | Admin | article_name too short (1 char) returns 400 | P1 | 1. Login as Admin. 2. `POST /products` body with `"article_name":"X"`. | HTTP 400. Error: `"Article name must be at least 2 characters"`. | API | Schema: `.min(2)`. |
| TC-PROD-026 | Admin | article_name exceeds 150 chars returns 400 | P1 | 1. Login as Admin. 2. `POST /products` body with `article_name` = 151-character string. | HTTP 400. Error: `"Article name must not exceed 150 characters"`. | API | |
| TC-PROD-027 | Admin | article_code exceeds 20 chars returns 400 | P1 | 1. Login as Admin. 2. `POST /products` body with `article_code` = 21-character string. | HTTP 400. Error references article_code length. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-VAL-003. |
| TC-PROD-028 | Admin | colour exceeds 50 chars returns 400 | P2 | 1. Login as Admin. 2. `POST /products` body with `colour` = 51-character string. | HTTP 400. Error references colour length. | API | Schema: `.max(50)`. |

### 1.4 — Casing normalization on create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-030 | Admin | article_name stored in Title Case regardless of input casing | P1 | 1. Login as Admin. 2. `POST /products` body with `"article_name":"alia PLUS"`, other fields valid. | HTTP 201. `data.article_name = "Alia Plus"` (Title Case; multi-word normalized). | API | `toTitleCase`: each word's first letter upper, rest lower. Collapses whitespace runs. AUTOMATION GAP — no spec covers this directly. |
| TC-PROD-031 | Admin | colour stored in Title Case | P1 | 1. Login as Admin. 2. `POST /products` body with `"colour":"NAVY BLUE"`, other fields valid. | HTTP 201. `data.colour = "Navy Blue"`. | API | AUTOMATION GAP. |
| TC-PROD-032 | Admin | section stored in Title Case | P1 | 1. Login as Admin. 2. `POST /products` body with `"section":"hawaii"`, other fields valid. | HTTP 201. `data.section = "Hawaii"`. | API | AUTOMATION GAP. |
| TC-PROD-033 | Admin | article_code stored in UPPERCASE | P1 | 1. Login as Admin. 2. `POST /products` body with `"article_code":"bsk-001"`, other fields valid. | HTTP 201. `data.article_code = "BSK-001"` (uppercased). | API | AUTOMATION GAP. |
| TC-PROD-034 | Admin | article_group stored in Title Case | P1 | 1. Login as Admin. 2. `POST /products` body with `"article_group":"premium casual"`, other fields valid. | HTTP 201. `data.article_group = "Premium Casual"`. | API | AUTOMATION GAP. |
| TC-PROD-035 | Admin | category is matched case-insensitively and stored in canonical casing | P1 | 1. Login as Admin. 2. `POST /products` body with `"category":"gents"`, other fields valid (section, article_name, etc. provided). | HTTP 201. `data.category = "Gents"` (canonical). | API | `canonicalCategory`: case-insensitive lookup against `['Gents','Ladies','Boys','Girls']`. AUTOMATION GAP. |
| TC-PROD-036 | Admin | location matched case-insensitively and stored canonical | P1 | 1. Login as Admin. 2. `POST /products` body with `"location":"vkia"`, other fields valid. | HTTP 201. `data.location = "VKIA"` (canonical). | API | `canonicalLocation`: case-insensitive lookup against `['VKIA','MIA','F540']`. AUTOMATION GAP. |
| TC-PROD-037 | Admin | description stored as-typed (no Title Case) | P1 | 1. Login as Admin. 2. `POST /products` body with `"description":"a casual summer sandal"`, other fields valid. | HTTP 201. `data.description = "a casual summer sandal"` (not Title-Cased; lowercase preserved). | API | Only `stripHtml` applied to description, not `toTitleCase`. AUTOMATION GAP. |
| TC-PROD-038 | Admin | SKU uses normalized (uppercase, spaces→dashes) fields | P1 | 1. Login as Admin. 2. `POST /products` body with `article_name="Alia Plus"`, `colour="Navy Blue"`, `category="Ladies"`, `section="Hawaii"`. | HTTP 201. `data.sku` matches `HAWAII-ALIA-PLUS-LADIES-NN-NAVY-BLUE` pattern. | API | `generateSku` normalizes: `.trim().toUpperCase().replace(/\s+/g, '-')`. AUTOMATION GAP. |

### 1.5 — SKU generation and deduplication

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-040 | Admin | SKU serial increments for same article+colour+section+category combo | P1 | 1. Login as Admin. 2. Create product A: `article_name="Busker"`, `colour="White"`, `size="9"`, `category="Gents"`, `section="Hawaii"`. Note SKU. 3. Create product B: same article+colour+category+section but `size="10"`. Note SKU. | Product A's SKU serial = N. Product B's SKU serial = N+1. Both products have distinct UUIDs. Both SKUs follow `HAWAII-BUSKER-GENTS-NN-WHITE` / `HAWAII-BUSKER-GENTS-NN+1-WHITE`. | API | Realizing spec: `10-products.spec.ts` → TC-PRODX-014. Serial = existing count + 1. |
| TC-PROD-041 | Admin | Duplicate SKU (same article+colour+size) returns 409 | P1 | 1. Pre-condition: `PRODUCT_UUID_A` exists (article_name="Busker", colour="White", size="6", section="Hawaii", category="Gents"). 2. Login as Admin. 3. `POST /products` with identical body. | HTTP 409 (ConflictError: `"Product with SKU ... already exists"`). No second row created. | API | `createProduct` checks for existing SKU before insert. |
| TC-PROD-042 | Admin | SKU uniqueness at boundary — SKU already exists (different size, same serial would collide) | P2 | 1. Login as Admin. 2. Create 99 products for the same article+colour+category+section (different sizes). 3. Create one more. | HTTP 201. SKU serial is `100` (three digits), padded to 2 → shows as `100` (pad pads with 2 digits minimum but does not truncate). Product created successfully. | API | `String(serial).padStart(2, '0')` — at 100 the string is `'100'` (padStart does not truncate). AUTOMATION GAP. |

---

## Section 2: Bulk-by-Size-Range Create (POST /products/bulk-size-range)

### 2.1 — Role-based bulk-size-range

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-100 | Admin | Admin creates size-range products — 201 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body: `{"article_name":"Range Shoe","article_code":"RNG-001","colour":"Blue","mrp":200,"category":"Gents","section":"Hawaii","size_from":"5","size_to":"9"}`. | HTTP 201. `data` is an array of 5 products (sizes 5,6,7,8,9). Each has a unique `id` and `sku`. SKUs follow `HAWAII-RANGE-SHOE-GENTS-NN-BLUE` pattern with sequential serials. | API | Realizing spec: `10-products.spec.ts` → TC-PRODX-009 (partial coverage). Endpoint: `POST /products/bulk-size-range`. |
| TC-PROD-101 | Supervisor | Supervisor creates size-range products — 201 | P0 | 1. Login as Supervisor. 2. `POST /products/bulk-size-range` body: `{"article_name":"Sup Range","article_code":"SRP-001","colour":"Green","mrp":350,"category":"Ladies","section":"Hawaii","size_from":"4","size_to":"7"}`. | HTTP 201. Array of 4 products returned. `success:true`. | API | Supervisor holds `products:create`. |
| TC-PROD-102 | Warehouse Operator | Warehouse Operator cannot use bulk-size-range — 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /products/bulk-size-range` with valid body. | HTTP 403. Forbidden. No products created. | API | |
| TC-PROD-103 | Dispatch Operator | Dispatch Operator cannot use bulk-size-range — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /products/bulk-size-range` with valid body. | HTTP 403. Forbidden. | API | |
| TC-PROD-104 | Unauthenticated | Unauthenticated bulk-size-range returns 401 | P0 | 1. `POST /products/bulk-size-range` with no `Authorization` header. | HTTP 401. | API | |

### 2.2 — Validation and boundary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-110 | Admin | size_from > size_to returns 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body with `"size_from":"9"`, `"size_to":"5"`. | HTTP 400. Error: `"size_from must be less than or equal to size_to"`. No products created. | API | Schema `.refine()` validates this. |
| TC-PROD-111 | Admin | Size range exactly 20 succeeds | P1 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body with `"size_from":"1"`, `"size_to":"20"`, other required fields valid. | HTTP 201. Array of exactly 20 products returned. | API | Boundary: range = `to - from + 1 <= 20`. |
| TC-PROD-112 | Admin | Size range exceeds 20 returns 400 | P1 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body with `"size_from":"1"`, `"size_to":"21"`. | HTTP 400. Error: `"Size range cannot exceed 20 sizes"`. | API | Schema: `parseInt(size_to) - parseInt(size_from) + 1 <= 20`. |
| TC-PROD-113 | Admin | size_from with non-integer string returns 400 | P1 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body with `"size_from":"6.5"`. | HTTP 400. Error: `"size_from must be a positive integer string"`. | API | Schema: `.regex(/^\d+$/)`. |
| TC-PROD-114 | Admin | size_to missing returns 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body omits `size_to`. | HTTP 400. Error references `size_to` required. | API | |
| TC-PROD-115 | Admin | Missing article_name returns 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body omits `article_name`. | HTTP 400. Error references `article_name`. | API | Same schema as `createProductSchema` for name/code/colour/mrp/category/section. |
| TC-PROD-116 | Admin | Missing category returns 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body omits `category`. | HTTP 400. Error references `category`. | API | |
| TC-PROD-117 | Admin | Size-range body must not include `size` field (only size_from/size_to) | P2 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body includes `"size":"7"` alongside `size_from`/`size_to`. | HTTP 201. `size` field in body is ignored (not in `bulkCreateBySizeRangeSchema`). Products created with sizes from range, not the single `size` value. Actual sizes in DB are the range integers as strings. | API | AUTOMATION GAP — schema does not include `size`; extra fields are not rejected by default. |

### 2.3 — SKU serial sequencing in transaction

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-120 | Admin | Serials within a size-range batch are unique and sequential | P1 | 1. Login as Admin. 2. Pre-condition: zero existing products for combo `(article_name="Serial Test", colour="Teal", category="Boys", section="Hawaii")`. 3. `POST /products/bulk-size-range` with `size_from="5"`, `size_to="7"`. | HTTP 201. Three products returned. SKUs are `HAWAII-SERIAL-TEST-BOYS-01-TEAL`, `...02...`, `...03...` for sizes 5, 6, 7 respectively. No duplicate SKUs. | API | `bulkCreateProductsBySizeRange` uses a single client connection + transaction; each iteration reads count from within the same txn so serials do not race. AUTOMATION GAP — no existing spec covers intra-batch serial sequencing. |
| TC-PROD-121 | Admin | Bulk-size-range creation rolls back entirely on DB error | P2 | 1. Pre-condition: manufacture a conflict that would cause the second insert in a range to fail (e.g., manually insert a product with the exact SKU that would be serial-02 before sending the batch). 2. Login as Admin. 3. `POST /products/bulk-size-range` with size range that generates the colliding SKU. | HTTP 4xx or 500. No partial set of products committed — full ROLLBACK. Zero products from this batch appear in DB. | API | `bulkCreateProductsBySizeRange` wraps all inserts in `BEGIN/COMMIT`; a failure triggers `ROLLBACK`. AUTOMATION GAP. |
| TC-PROD-122 | Admin | Bulk-size-range casing — article_name Title-Cased, article_code UPPERCASED | P1 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body with `"article_name":"pump shoe"`, `"article_code":"pmp-001"`, other fields valid, `size_from="6"`, `size_to="7"`. | HTTP 201. Both products in response have `article_name="Pump Shoe"` and `article_code="PMP-001"`. | API | `bulkCreateProductsBySizeRange` applies `toTitleCase` and `.toUpperCase()`. AUTOMATION GAP. |

---

## Section 3: List Products (GET /products)

### 3.1 — Auth — all roles can read

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-200 | Admin | Admin GET /products — 200, paginated | P0 | 1. Login as Admin. 2. `GET /products`. | HTTP 200. `{"success":true,"data":[...],"total":N,"page":1,"limit":25}`. Each item has `id`, `sku`, `article_name`, `article_code`, `colour`, `size`, `mrp`, `category`, `section`, `is_active`, `created_at`. | API | Realizing spec: `17-products-sections-rbac.spec.ts`. |
| TC-PROD-201 | Supervisor | Supervisor GET /products — 200 | P1 | 1. Login as Supervisor. 2. `GET /products`. | HTTP 200. Valid paginated response. | API | Realizing spec: `17-products-sections-rbac.spec.ts`. |
| TC-PROD-202 | Warehouse Operator | Warehouse Operator GET /products — 200 (API; no permission gate) | P1 | 1. Login as Warehouse Operator. 2. `GET /products`. | HTTP 200. `success:true`. Array of products. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-WHO-001. No `authorizePermission` on this route — auth-only. |
| TC-PROD-203 | Dispatch Operator | Dispatch Operator GET /products — 200 (API) | P1 | 1. Login as Dispatch Operator. 2. `GET /products`. | HTTP 200. `success:true`. Array of products. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-DOP-001. |
| TC-PROD-204 | Unauthenticated | Unauthenticated GET /products returns 401 | P0 | 1. `GET /products` with no `Authorization` header. | HTTP 401. | API | |

### 3.2 — Status filter (is_active)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-210 | Admin | GET /products?is_active=true returns only active products | P0 | 1. Login as Admin. 2. Pre-condition: at least one inactive product exists. 3. `GET /products?is_active=true&limit=50`. | HTTP 200. All items in `data` have `is_active=true`. No inactive product appears. `total` reflects active-only count. | API | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-API-001. |
| TC-PROD-211 | Admin | GET /products?is_active=false returns only inactive products | P0 | 1. Login as Admin. 2. Create a product, deactivate it (`PUT /products/:id` `{"is_active":false}`). 3. `GET /products?is_active=false&limit=50`. | HTTP 200. All items have `is_active=false`. The just-deactivated product is present. | API | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-API-002. |
| TC-PROD-212 | Admin | GET /products (no is_active param) returns both active and inactive | P1 | 1. Login as Admin. 2. Pre-condition: at least one active and one inactive product exist. 3. `GET /products?limit=200`. | HTTP 200. `data` contains products with `is_active=true` AND `is_active=false`. | API | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-API-003. `is_active` param absent → no WHERE clause filter on status. |
| TC-PROD-213 | Admin | Inactive product hidden under is_active=true, visible under is_active=false | P0 | 1. Login as Admin. 2. Create product `P`, deactivate it. 3. `GET /products?is_active=true&search=<P.article_code>&limit=10`. 4. `GET /products?is_active=false&search=<P.article_code>&limit=10`. | Step 3: `P.id` NOT in `data`. Step 4: `P.id` IS in `data`. | API | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-API-004. |
| TC-PROD-214 | Warehouse Operator | Warehouse Operator can use is_active filter | P1 | 1. Login as Warehouse Operator. 2. `GET /products?is_active=true`. | HTTP 200. All items have `is_active=true`. | API | AUTOMATION GAP — status filter tested only with Admin token in existing specs. |

### 3.3 — Search and column filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-220 | Admin | Filter by section | P1 | 1. Login as Admin. 2. `GET /products?section=Hawaii`. | HTTP 200. All items have `section="Hawaii"`. No items from other sections. | API | |
| TC-PROD-221 | Admin | Filter by category=Gents | P1 | 1. Login as Admin. 2. `GET /products?category=Gents`. | HTTP 200. All items have `category="Gents"`. | API | |
| TC-PROD-222 | Admin | Filter by colour (case-insensitive ILIKE) | P1 | 1. Login as Admin. 2. `GET /products?colour=white`. | HTTP 200. All items have `colour` containing "white" (case-insensitive match via ILIKE). | API | Service uses `colour ILIKE $N`. |
| TC-PROD-223 | Admin | Filter by size | P1 | 1. Login as Admin. 2. `GET /products?size=6`. | HTTP 200. All items have `size="6"`. | API | |
| TC-PROD-224 | Admin | Filter by article_code (exact match) | P1 | 1. Login as Admin. 2. `GET /products?article_code=BSK-001`. | HTTP 200. All items have `article_code="BSK-001"`. | API | Service: exact equality filter. |
| TC-PROD-225 | Admin | Search by article_name (ILIKE partial) | P1 | 1. Login as Admin. 2. `GET /products?search=Busker`. | HTTP 200. All items have `article_name` OR `sku` OR `article_code` containing "Busker". | API | Service: `(article_name ILIKE $N OR sku ILIKE $N OR article_code ILIKE $N)`. |
| TC-PROD-226 | Admin | Search by SKU substring | P1 | 1. Login as Admin. 2. `GET /products?search=HAWAII-BUSKER`. | HTTP 200. Items have `sku` containing "HAWAII-BUSKER". | API | |
| TC-PROD-227 | Admin | Filter by article_name (ILIKE partial) | P1 | 1. Login as Admin. 2. `GET /products?article_name=Busker`. | HTTP 200. All items have `article_name` containing "Busker" (case-insensitive). | API | Separate `article_name` query param (not `search`) uses `article_name ILIKE`. |
| TC-PROD-228 | Admin | Filter by article_group (ILIKE partial) | P1 | 1. Pre-condition: product with `article_group="Premium Casual"` exists. 2. Login as Admin. 3. `GET /products?article_group=Premium`. | HTTP 200. All items have `article_group` containing "Premium". | API | Service: `article_group ILIKE $N`. |
| TC-PROD-229 | Admin | Filter by location (exact) | P1 | 1. Login as Admin. 2. `GET /products?location=VKIA`. | HTTP 200. All items have `location="VKIA"`. | API | |
| TC-PROD-230 | Admin | Combined section + category filter | P1 | 1. Login as Admin. 2. `GET /products?section=Hawaii&category=Gents`. | HTTP 200. All items have `section="Hawaii"` AND `category="Gents"`. | API | |
| TC-PROD-231 | Admin | Combined search + is_active=true filter | P1 | 1. Login as Admin. 2. `GET /products?search=Busker&is_active=true`. | HTTP 200. All items match the search and are active. | API | |
| TC-PROD-232 | Admin | Search with no matches returns empty array | P1 | 1. Login as Admin. 2. `GET /products?search=ZZZNOMATCHZZZ`. | HTTP 200. `data=[]`. `total=0`. | API | |

### 3.4 — Pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-240 | Admin | GET /products?page=2&limit=10 returns correct slice | P1 | 1. Pre-condition: at least 11 active products exist. 2. Login as Admin. 3. `GET /products?page=2&limit=10&is_active=true`. | HTTP 200. `data` has at most 10 items. `page=2`. `limit=10`. Products are 11th–20th ordered by `created_at DESC`. | API | |
| TC-PROD-241 | Admin | GET /products default limit=25 | P2 | 1. Login as Admin. 2. `GET /products` (no limit param). | HTTP 200. `limit=25` in response. | API | Default: `page=1, limit=25`. |

---

## Section 4: Get Product by ID (GET /products/:id)

### 4.1 — Happy path and RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-300 | Admin | GET /products/:id returns full product detail | P0 | 1. Login as Admin. 2. `GET /products/<PRODUCT_UUID_A>`. | HTTP 200. `data.id=PRODUCT_UUID_A`. Response includes: `id`, `sku`, `article_name`, `article_code`, `colour`, `size`, `mrp`, `category`, `section`, `is_active`, `description`, `location`, `article_group`, `hsn_code`, `image_url`, `size_from`, `size_to`, `created_at`, `updated_at`. | API | |
| TC-PROD-301 | Supervisor | Supervisor GET /products/:id — 200 | P1 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_UUID_A>`. | HTTP 200. Full product detail. | API | No permission gate — auth-only. |
| TC-PROD-302 | Warehouse Operator | Warehouse Operator GET /products/:id — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /products/<PRODUCT_UUID_A>`. | HTTP 200. Full product detail returned. | API | |
| TC-PROD-303 | Dispatch Operator | Dispatch Operator GET /products/:id — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /products/<PRODUCT_UUID_A>`. | HTTP 200. Full product detail. | API | |
| TC-PROD-304 | Unauthenticated | Unauthenticated GET /products/:id returns 401 | P0 | 1. `GET /products/<PRODUCT_UUID_A>` with no auth header. | HTTP 401. | API | |

### 4.2 — Error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-310 | Admin | GET non-existent UUID returns 404 | P0 | 1. Login as Admin. 2. `GET /products/00000000-0000-0000-0000-000000000000`. | HTTP 404. Error: `"Product not found"`. | API | |
| TC-PROD-311 | Admin | GET invalid UUID format returns 400 | P1 | 1. Login as Admin. 2. `GET /products/not-a-uuid`. | HTTP 400. Validation error: `"Invalid product ID format"`. | API | `productIdParamSchema`: `z.string().uuid('Invalid product ID format')`. |

---

## Section 5: Colours and Sizes Sub-Endpoints

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-400 | Admin | GET /products/:id/colours returns distinct colours for same article_name | P1 | 1. Pre-condition: At least two active products exist with `article_name="Busker"` — one `colour="White"`, one `colour="Red"`. 2. Login as Admin. 3. `GET /products/<PRODUCT_UUID_A>/colours`. | HTTP 200. `data` is an array of objects each with `colour` (string) and `product_id` (UUID). Array contains at least `["White","Red"]`. No duplicate colours. | API | `getColoursByProduct`: `DISTINCT ON (colour)` for same `article_name` WHERE `is_active=true`. |
| TC-PROD-401 | Supervisor | Supervisor GET /products/:id/colours — 200 | P1 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_UUID_A>/colours`. | HTTP 200. Array of colour objects. | API | No permission gate. |
| TC-PROD-402 | Warehouse Operator | Warehouse Operator GET /products/:id/colours — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /products/<PRODUCT_UUID_A>/colours`. | HTTP 200. Array of colour objects. | API | |
| TC-PROD-403 | Dispatch Operator | Dispatch Operator GET /products/:id/colours — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /products/<PRODUCT_UUID_A>/colours`. | HTTP 200. | API | |
| TC-PROD-404 | Unauthenticated | Unauthenticated GET /products/:id/colours returns 401 | P0 | 1. `GET /products/<PRODUCT_UUID_A>/colours` with no auth header. | HTTP 401. | API | |
| TC-PROD-405 | Admin | GET /products/:id/colours returns 404 for inactive product | P1 | 1. Pre-condition: `INACTIVE_PRODUCT_UUID` is `is_active=false`. 2. Login as Admin. 3. `GET /products/<INACTIVE_PRODUCT_UUID>/colours`. | HTTP 404. Error: `"Product not found"`. | API | `getColoursByProduct` queries with `is_active=true` condition. Inactive product not found. |
| TC-PROD-410 | Admin | GET /products/:id/sizes returns sibling products (same article_name + colour) | P1 | 1. Pre-condition: Multiple active products with `article_name="Busker"`, `colour="White"`, sizes 6,7,8 exist. 2. Login as Admin. 3. `GET /products/<PRODUCT_UUID_A>/sizes`. | HTTP 200. `data` is an array of full product objects. All items have `article_name="Busker"` AND `colour="White"`. Array includes all 3 sizes, ordered by `size`. | API | `getSiblingProducts`: `WHERE article_name=$1 AND colour=$2 AND is_active=true ORDER BY size`. |
| TC-PROD-411 | Supervisor | Supervisor GET /products/:id/sizes — 200 | P1 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_UUID_A>/sizes`. | HTTP 200. Array of sibling product objects. | API | |
| TC-PROD-412 | Warehouse Operator | Warehouse Operator GET /products/:id/sizes — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /products/<PRODUCT_UUID_A>/sizes`. | HTTP 200. | API | |
| TC-PROD-413 | Dispatch Operator | Dispatch Operator GET /products/:id/sizes — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /products/<PRODUCT_UUID_A>/sizes`. | HTTP 200. | API | |
| TC-PROD-414 | Unauthenticated | Unauthenticated GET /products/:id/sizes returns 401 | P0 | 1. `GET /products/<PRODUCT_UUID_A>/sizes` with no auth. | HTTP 401. | API | |
| TC-PROD-415 | Admin | GET /products/:id/sizes for non-existent UUID returns 404 | P1 | 1. Login as Admin. 2. `GET /products/00000000-0000-0000-0000-000000000000/sizes`. | HTTP 404. | API | |
| TC-PROD-416 | Admin | GET /products/:id/sizes invalid UUID returns 400 | P1 | 1. Login as Admin. 2. `GET /products/not-a-uuid/sizes`. | HTTP 400. | API | |

---

## Section 6: Update Product (PUT /products/:id)

### 6.1 — Role-based update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-500 | Admin | Admin updates product MRP | P0 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":399}`. | HTTP 200. `data.mrp` = 399 (or `"399.00"` as string depending on DB type). `data.updated_at` is newer than `data.created_at`. Other fields unchanged. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-ADM-002. |
| TC-PROD-501 | Admin | Admin deactivates product | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"is_active":false}`. | HTTP 200. `data.is_active=false`. | API | |
| TC-PROD-502 | Admin | Admin reactivates product | P1 | 1. Pre-condition: `PRODUCT_UUID_A` is `is_active=false`. 2. Login as Admin. 3. `PUT /products/<PRODUCT_UUID_A>` body: `{"is_active":true}`. | HTTP 200. `data.is_active=true`. | API | |
| TC-PROD-503 | Admin | Admin updates multiple fields in one request | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":499,"description":"New desc","article_group":"Premium"}`. | HTTP 200. All three fields updated in response. Other fields unchanged. | API | |
| TC-PROD-504 | Admin | Empty update body returns unchanged product | P2 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` with empty body `{}`. | HTTP 200. `data` matches original product (no fields changed; `updated_at` not bumped since `fields.length===0` returns `oldProduct` directly). | API | Service: `if (fields.length === 0) return oldProduct;`. |
| TC-PROD-505 | Supervisor | Supervisor updates product — 200 | P0 | 1. Login as Supervisor. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":399,"location":"MIA"}`. | HTTP 200. `data.mrp` updated. `data.location="MIA"`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-SUP-002. |
| TC-PROD-506 | Warehouse Operator | Warehouse Operator cannot update product — 403 | P0 | 1. Login as Warehouse Operator. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":100}`. | HTTP 403. `PRODUCT_UUID_A` MRP unchanged in DB. | API | |
| TC-PROD-507 | Dispatch Operator | Dispatch Operator cannot update product — 403 | P0 | 1. Login as Dispatch Operator. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":100}`. | HTTP 403. | API | |
| TC-PROD-508 | Unauthenticated | Unauthenticated PUT returns 401 | P0 | 1. `PUT /products/<PRODUCT_UUID_A>` with no auth header, body `{"mrp":100}`. | HTTP 401. | API | |

### 6.2 — Casing normalization on update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-510 | Admin | Updating article_name applies Title Case | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"article_name":"summer SLIP"}`. | HTTP 200. `data.article_name="Summer Slip"`. | API | `updateProduct` applies `toTitleCase` to `article_name`. AUTOMATION GAP. |
| TC-PROD-511 | Admin | Updating colour applies Title Case | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"colour":"DARK GREEN"}`. | HTTP 200. `data.colour="Dark Green"`. | API | AUTOMATION GAP. |
| TC-PROD-512 | Admin | Updating article_code applies UPPERCASE | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"article_code":"new-code"}`. | HTTP 200. `data.article_code="NEW-CODE"`. | API | AUTOMATION GAP. |
| TC-PROD-513 | Admin | Updating description does not apply Title Case (HTML-stripped only) | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"description":"a new <i>desc</i>"}`. | HTTP 200. `data.description="a new desc"` (HTML removed; lowercase preserved). | API | AUTOMATION GAP. |

### 6.3 — Update validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-520 | Admin | Update with negative MRP returns 400 | P0 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"mrp":-10}`. | HTTP 400. MRP unchanged in DB. | API | |
| TC-PROD-521 | Admin | Update with invalid category enum returns 400 | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_UUID_A>` body: `{"category":"Toddler"}`. | HTTP 400. Enum validation error for `category`. | API | |
| TC-PROD-522 | Admin | Update non-existent product returns 404 | P0 | 1. Login as Admin. 2. `PUT /products/00000000-0000-0000-0000-000000000000` body: `{"mrp":100}`. | HTTP 404. Error: `"Product not found"`. | API | |
| TC-PROD-523 | Admin | Update with invalid UUID param returns 400 | P1 | 1. Login as Admin. 2. `PUT /products/not-a-uuid` body: `{"mrp":100}`. | HTTP 400. Validation error: `"Invalid product ID format"`. | API | |
| TC-PROD-524 | Admin | Update SKU to a value already taken by another product returns 409 | P2 | 1. Pre-condition: Two products A and B exist with distinct SKUs. 2. Login as Admin. 3. `PUT /products/<A_ID>` body: `{"sku":"<B_SKU>"}`. | HTTP 409 (ConflictError). SKU unchanged. | API | Service: `skuCheck` query blocks duplicate SKU. |

---

## Section 7: Delete Product (DELETE /products/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-600 | Admin | Admin soft-deletes product — 200 | P0 | 1. Pre-condition: Create a product `PROD_DEL_UUID`. 2. Login as Admin. 3. `DELETE /products/<PROD_DEL_UUID>`. | HTTP 200. `{"success":true,"data":null,"message":"Product deactivated successfully"}`. Product row still exists in DB with `is_active=false`. `GET /products?is_active=true` does not include `PROD_DEL_UUID`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-ADM-003. Soft-delete: `UPDATE products SET is_active=false`. |
| TC-PROD-601 | Admin | Soft-deleted product retrievable via GET with is_active=false | P1 | 1. Pre-condition: `PROD_DEL_UUID` was soft-deleted in TC-PROD-600. 2. Login as Admin. 3. `GET /products/<PROD_DEL_UUID>`. | HTTP 200. `data.is_active=false`. Row still retrievable by ID. | API | AUTOMATION GAP — not covered in existing specs. |
| TC-PROD-602 | Admin | Delete non-existent product returns 404 | P1 | 1. Login as Admin. 2. `DELETE /products/00000000-0000-0000-0000-000000000000`. | HTTP 404. Error: `"Product not found"`. | API | |
| TC-PROD-603 | Admin | Delete with invalid UUID returns 400 | P1 | 1. Login as Admin. 2. `DELETE /products/not-a-uuid`. | HTTP 400. Validation error: `"Invalid product ID format"`. | API | |
| TC-PROD-604 | Supervisor | Supervisor cannot delete product — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /products/<PRODUCT_UUID_A>`. | HTTP 403. Product unchanged in DB. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-SUP-003. |
| TC-PROD-605 | Warehouse Operator | Warehouse Operator cannot delete product — 403 | P0 | 1. Login as Warehouse Operator. 2. `DELETE /products/<PRODUCT_UUID_A>`. | HTTP 403. | API | |
| TC-PROD-606 | Dispatch Operator | Dispatch Operator cannot delete product — 403 | P0 | 1. Login as Dispatch Operator. 2. `DELETE /products/<PRODUCT_UUID_A>`. | HTTP 403. | API | |
| TC-PROD-607 | Unauthenticated | Unauthenticated DELETE returns 401 | P0 | 1. `DELETE /products/<PRODUCT_UUID_A>` with no auth. | HTTP 401. | API | |

---

## Section 8: Image Upload (POST /products/:id/image)

### 8.1 — Upload success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-700 | Admin | Admin uploads JPEG image — success | P0 | 1. Login as Admin. 2. Prepare a valid JPEG file of ~1 MB. 3. `POST /products/<PRODUCT_UUID_A>/image` as `multipart/form-data` with field `image` = the file. | HTTP 200. Response: `{"success":true,"data":{"image_url":"/uploads/product-images/<filename>"},"message":"Product image uploaded successfully"}`. `GET /products/<PRODUCT_UUID_A>` returns `image_url` matching the returned path. | API | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-ADM-004 (status check only). |
| TC-PROD-701 | Admin | Admin uploads PNG image — success | P1 | 1. Login as Admin. 2. Prepare PNG file < 5 MB. 3. `POST /products/<PRODUCT_UUID_A>/image` with `image` = PNG. | HTTP 200. `image_url` present. Served at returned path. | API | Accepted mime types: image/jpeg, image/png, image/webp (from frontend accept attr). |
| TC-PROD-702 | Admin | Admin uploads WebP image — success | P1 | 1. Login as Admin. 2. Prepare a valid WebP file < 5 MB. 3. `POST /products/<PRODUCT_UUID_A>/image`. | HTTP 200. `image_url` returned. | API | AUTOMATION GAP. |
| TC-PROD-703 | Supervisor | Supervisor uploads image — 200 | P1 | 1. Login as Supervisor. 2. `POST /products/<PRODUCT_UUID_A>/image` with valid JPEG. | HTTP 200. `image_url` returned. | API | Supervisor holds `products:update`. |
| TC-PROD-704 | Admin | Replace existing image — new URL returned | P1 | 1. Pre-condition: `PRODUCT_UUID_A` has `image_url` from TC-PROD-700. 2. Login as Admin. 3. Upload a different JPEG. | HTTP 200. New `image_url` (different filename from previous). `GET /products/<PRODUCT_UUID_A>` shows updated `image_url`. | Integration | |

### 8.2 — Upload validation and RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-710 | Admin | No file field returns 400 | P0 | 1. Login as Admin. 2. `POST /products/<PRODUCT_UUID_A>/image` with multipart body but no `image` field. | HTTP 400. Error: `"No image file provided"`. `image_url` unchanged. | API | Controller: `if (!file) res.status(400)`. |
| TC-PROD-711 | Admin | Upload file exceeding 5 MB returns 400 or 413 | P0 | 1. Login as Admin. 2. Prepare a file of 6 MB. 3. `POST /products/<PRODUCT_UUID_A>/image`. | HTTP 400 or 413. Error indicates file too large. `image_url` not updated. | API | `productImageUpload` middleware (multer) enforces 5 MB limit. |
| TC-PROD-712 | Admin | Upload non-image file (PDF) returns error | P1 | 1. Login as Admin. 2. Prepare a `.pdf` file. 3. `POST /products/<PRODUCT_UUID_A>/image` with PDF as `image`. | HTTP 400. Error indicates unsupported file type or multer rejection. No image stored. | API | AUTOMATION GAP. |
| TC-PROD-713 | Admin | Upload to non-existent product returns 404 | P1 | 1. Login as Admin. 2. `POST /products/00000000-0000-0000-0000-000000000000/image` with valid JPEG. | HTTP 404. `"Product not found"`. | API | `updateProductImage` throws `NotFoundError`. |
| TC-PROD-714 | Warehouse Operator | Warehouse Operator cannot upload image — 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /products/<PRODUCT_UUID_A>/image` with valid JPEG. | HTTP 403. `image_url` unchanged. | API | Endpoint uses `authorizePermission('products:update')`. |
| TC-PROD-715 | Dispatch Operator | Dispatch Operator cannot upload image — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /products/<PRODUCT_UUID_A>/image` with valid JPEG. | HTTP 403. | API | |
| TC-PROD-716 | Unauthenticated | Unauthenticated image upload returns 401 | P0 | 1. `POST /products/<PRODUCT_UUID_A>/image` with no auth. | HTTP 401. | API | |

### 8.3 — Image-propagation behavior

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-720 | Admin | Image upload propagates to all products sharing same article_code + colour | P1 | 1. Pre-condition: Two active products exist with `article_code="BSK-001"` and `colour="White"` (same article_code + colour, different sizes — e.g., size 6 and size 7). 2. Login as Admin. 3. `POST /products/<SIZE_6_ID>/image` with a valid JPEG. | HTTP 200. Both `size=6` and `size=7` products have `image_url` updated to the same path. (Service: `UPDATE products SET image_url=$1 WHERE article_code=$2 AND colour=$3`). | Integration | AUTOMATION GAP — this propagation behavior is non-obvious and not covered in existing specs. Critical to document. |

---

## Section 9: E2E — Products Page (Playwright)

### 9.1 — Page load and access guard

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-001 | Admin | Products page loads — heading and table visible | P0 | 1. Login as Admin via UI. 2. Navigate to `/products`. | URL contains `/products`. Page heading `<h1>` with text "Products" is visible. Section tabs (including "All") visible. Table with columns Image, SKU, Article, Colour, Size, MRP, Category, Section, Status is rendered. | E2E | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-E2E-001. |
| TC-PROD-E2E-002 | Admin | Products page default view shows only active products | P0 | 1. Pre-condition: at least one inactive product exists. 2. Login as Admin. 3. Navigate to `/products` without changing filters. | Status `<select>` first option "Active only" is selected (`value="active"`). Active products visible. Inactive product rows absent. API call includes `is_active=true`. | E2E | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-UI-001, TC-PFILTER-UI-002. `statusFilter` defaults to `'active'`. |
| TC-PROD-E2E-003 | Supervisor | Supervisor sees products page and Add Product button | P1 | 1. Login as Supervisor via UI. 2. Navigate to `/products`. | Products page renders (not "Access Denied"). "Add Product" button is visible (`isManager=true` for Supervisor). | E2E | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-E2E-002. |
| TC-PROD-E2E-004 | Warehouse Operator | Warehouse Operator sees "Access Denied" on products page | P1 | 1. Login as Warehouse Operator via UI. 2. Navigate to `/products`. | Page shows "Access Denied" message: `"Only administrators and supervisors can manage products."`. No product table rendered. | E2E | `isManager = Admin || Supervisor` — WH Op fails guard and sees error state. AUTOMATION GAP — no existing spec tests WH/DO access to products page. |
| TC-PROD-E2E-005 | Dispatch Operator | Dispatch Operator sees "Access Denied" on products page | P1 | 1. Login as Dispatch Operator via UI. 2. Navigate to `/products`. | "Access Denied" page displayed. No product table. | E2E | AUTOMATION GAP. |

### 9.2 — Status filter UI

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-010 | Admin | Status select has three options | P0 | 1. Login as Admin. Navigate to `/products`. | Status `<select>` (first `<select>` in column-filter row) has options: "Active only" (value `active`), "Inactive only" (value `inactive`), "All products" (value `all`). | E2E | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-UI-001. |
| TC-PROD-E2E-011 | Admin | Default selected value is "active" | P0 | 1. Login as Admin. Navigate to `/products`. Inspect status select `inputValue`. | `inputValue() === 'active'`. | E2E | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-UI-002. |
| TC-PROD-E2E-012 | Admin | Select "Inactive only" — table re-fetches with is_active=false | P0 | 1. Navigate to `/products`. 2. Locate status `<select>`. 3. Select `value="inactive"`. Wait for network idle. | API call to `/products` includes `is_active=false`. Rows in table all have Status badge = "Inactive" (grey). Active rows absent. | E2E | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-UI-003 (partial). |
| TC-PROD-E2E-013 | Admin | Select "All products" — table shows active and inactive rows | P0 | 1. Navigate to `/products`. 2. Select `value="all"`. Wait for network idle. | API call to `/products` omits `is_active` param. Table contains both green (Active) and grey (Inactive) badges. | E2E | Realizing spec: `38-product-status-filter.spec.ts` → TC-PFILTER-UI-004. |
| TC-PROD-E2E-014 | Admin | Active/Inactive badge is correct colour | P1 | 1. Navigate to `/products`. Select "All products". 2. Find a row with `is_active=true`; find one with `is_active=false`. | Active badge = green. Inactive badge = grey. Text: "Active" / "Inactive". | E2E | `<Badge variant={p.is_active ? 'green' : 'gray'}>`. |

### 9.3 — Section tabs and column filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-020 | Admin | Section tabs include "All" and each API-loaded section | P1 | 1. Navigate to `/products`. | "All" button visible. At least one section tab (e.g., "Hawaii") visible. Section tabs loaded from `GET /sections` API, not hardcoded. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-002, TC-PRODX-007. |
| TC-PROD-E2E-021 | Admin | Click section tab — filters products | P1 | 1. Navigate to `/products`. 2. Click "Hawaii" section tab. Wait for network idle. | API call includes `section=Hawaii`. Active tab is highlighted (navy background). Rows show only Hawaii products. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-003. |
| TC-PROD-E2E-022 | Admin | Click "All" tab — clears section filter | P1 | 1. Pre-condition: "Hawaii" tab is active. 2. Click "All" tab. | `section` param removed from API call. All sections visible. "All" button has active style. | E2E | |
| TC-PROD-E2E-023 | Admin | Search input debounces and filters | P1 | 1. Navigate to `/products`. 2. Type "Busker" in search input. Wait 400 ms (debounce + fetch). | Table rows update to show only matching products (article_name/SKU/article_code contains "Busker"). Row count decreases. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-010. `useDebounce` delays API call. |
| TC-PROD-E2E-024 | Admin | Category column filter dropdown works | P1 | 1. Navigate to `/products`. 2. Select "Gents" from category dropdown in filter row. | API call includes `category=Gents`. Table shows only Gents products. Clear (X) button appears on the filter. | E2E | |
| TC-PROD-E2E-025 | Admin | Colour text filter works | P1 | 1. Navigate to `/products`. 2. Type "White" in colour filter input. | API call includes `colour=White`. Table filtered. X button visible. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-011. |
| TC-PROD-E2E-026 | Admin | Size text filter works | P1 | 1. Navigate to `/products`. 2. Type "6" in size filter input. | API call includes `size=6`. Table filtered. | E2E | |
| TC-PROD-E2E-027 | Admin | Article Group filter works | P1 | 1. Navigate to `/products`. 2. Type "Premium" in Article Group filter input. | API call includes `article_group=Premium`. Table filtered. | E2E | |
| TC-PROD-E2E-028 | Admin | Location filter dropdown works | P1 | 1. Navigate to `/products`. 2. Select "VKIA" from location dropdown. | API call includes `location=VKIA`. Table filtered. | E2E | |
| TC-PROD-E2E-029 | Admin | "Clear all" button removes all column filters | P1 | 1. Pre-condition: at least one column filter active. 2. Click "Clear all" button. | All column filters cleared. "Clear all" button disappears. Table reverts to unfiltered state. | E2E | Button rendered only when `activeFilterCount > 0`. |
| TC-PROD-E2E-030 | Admin | Table column headers are correct | P1 | 1. Navigate to `/products`. | Table headers visible: Image, SKU, Article, Colour, Size, MRP, Category, Section, Status, Actions. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-012. |

### 9.4 — Create product modal — single mode

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-040 | Admin | "Add Product" button opens modal | P0 | 1. Navigate to `/products` as Admin. 2. Click "Add Product" button. | Modal dialog opens with title "Add Product". SKU info banner ("SKU is auto-generated...") visible. No editable SKU field in modal. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-004; `17-products-sections-rbac.spec.ts` → TC-PROD-E2E-002 + TC-PROD-E2E-003. |
| TC-PROD-E2E-041 | Admin | Modal has all required and optional fields | P0 | 1. Open Add Product modal. | Fields visible: Article Code, Article Name, Colour, Size, MRP, Section (select), Category (select), Location (select), Article Group, HSN Code, Size From, Size To, Description, Product Image (file input). | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-006, TC-PRODX-015, TC-PRODX-016. |
| TC-PROD-E2E-042 | Admin | Section dropdown loads from API | P1 | 1. Open Add Product modal. 2. Inspect Section `<select>` options. | Options include at least "Hawaii", "PU", "EVA" (loaded from `GET /sections`). Not hardcoded. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-007. |
| TC-PROD-E2E-043 | Admin | Category dropdown shows only valid values | P1 | 1. Open Add Product modal. 2. Inspect Category options. | Options: Gents, Ladies, Boys, Girls (exactly these four). No other values. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-008. |
| TC-PROD-E2E-044 | Admin | Single-mode submit creates product and shows success toast | P0 | 1. Open modal. 2. Fill: Article Code="E2E-001", Article Name="E2E Shoe", Colour="Green", Size="7", MRP="150", Category="Gents", Section="Hawaii". Leave Size From/To empty. 3. Click "Create Product". | `POST /products` sent. Toast: "Product created successfully". Modal closes. Product "E2E Shoe" appears in table. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-009. |
| TC-PROD-E2E-045 | Admin | Missing required fields shows error toast (no API call) | P1 | 1. Open modal. 2. Fill partial fields (omit Article Name). 3. Click "Create Product". | Toast: "Please fill in all required fields (Article Name, Article Code, Colour)". No API call made. Modal stays open. | E2E | `handleSubmit` validates before calling `createProduct`. |
| TC-PROD-E2E-046 | Admin | Missing Section/Category shows error toast | P1 | 1. Open modal. 2. Fill Article Name, Code, Colour, Size, MRP but leave Section empty. 3. Click "Create Product". | Toast: "Section and Category are required fields". No API call. | E2E | |
| TC-PROD-E2E-047 | Admin | Both Size and Size Range filled shows mode-conflict error | P0 | 1. Open modal. 2. Fill Size="7" AND Size From="5", Size To="9". 3. Click "Create Product". | Toast: "Enter either a single Size, OR a Size From/Size To range — not both". No API call. Modal stays open. | E2E | Realizing spec (add to `10-products.spec.ts`). |
| TC-PROD-E2E-048 | Admin | Neither Size nor Size Range filled shows mode-conflict error | P0 | 1. Open modal. 2. Fill all required fields except leave Size, Size From, Size To empty. 3. Click "Create Product". | Toast: "Enter either a single Size, OR a Size From/Size To range — not both". | E2E | `!isRangeMode && !isSingleMode` → error. |
| TC-PROD-E2E-049 | Admin | Image file attached at create — uploads after product is created | P1 | 1. Open modal. 2. Fill all required single-mode fields. 3. Attach a JPEG via image file picker. 4. Click "Create Product". | `POST /products` fired first → 201. Then `POST /products/<new_id>/image` fired. Success toast. Product row shows image thumbnail. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-016. Image picker info text: "Image will be uploaded after the product is created." |
| TC-PROD-E2E-050 | Supervisor | Supervisor: "Add Product" button is visible | P1 | 1. Login as Supervisor. Navigate to `/products`. | "Add Product" button visible (`canCreate=true` for Supervisor). | E2E | Realizing spec: `17-products-sections-rbac.spec.ts` → TC-PROD-E2E-002. `isManager=true` and `useCan('products:create')=true` for Supervisor. |

### 9.5 — Create product modal — size-range mode

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-060 | Admin | Size-range mode creates N products, success toast shows count | P0 | 1. Open Add Product modal. 2. Fill: Article Name="Range Shoe", Article Code="RNG-001", Colour="Blue", MRP="200", Category="Gents", Section="Hawaii". Size From="5", Size To="9". Leave Size empty. 3. Click "Create Product". | `POST /products/bulk-size-range` called. Toast: "5 products created successfully". Modal closes. Five "Range Shoe" rows (sizes 5–9) appear in table. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-009 (partial). |
| TC-PROD-E2E-061 | Admin | Size From > Size To shows error toast | P1 | 1. Open modal. 2. Fill Size From="9", Size To="5". 3. Click "Create Product". | Toast: "Size From must be less than or equal to Size To". No API call. | E2E | Frontend validation in `handleSubmit`. |
| TC-PROD-E2E-062 | Admin | Size range > 20 shows error toast | P1 | 1. Open modal. 2. Fill Size From="1", Size To="21". 3. Click "Create Product". | Toast: "Size range cannot exceed 20 sizes". No API call. | E2E | |
| TC-PROD-E2E-063 | Admin | Non-integer Size From shows error toast | P1 | 1. Open modal. 2. Fill Size From="6.5", Size To="9". 3. Click "Create Product". | Toast: "Size From and Size To must be positive integers". No API call. | E2E | `handleSubmit`: `!/^\d+$/.test(form.size_from.trim())` → error. |

### 9.6 — Edit product modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-070 | Admin | Edit button opens modal pre-filled with product data | P0 | 1. Navigate to `/products`. 2. Click "Edit" button on a product row. | Modal opens with title "Edit Product". SKU displayed in read-only banner (not editable input). All fields pre-filled from product data. Size From/To fields visible (pre-filled from product). | E2E | `openEdit(product)` populates `form` from product. |
| TC-PROD-E2E-071 | Admin | Update MRP via edit modal — table row updates | P0 | 1. Open edit modal. 2. Change MRP to "349". 3. Click "Update Product". | `PUT /products/:id` called with `{mrp:349,...}`. Toast: "Product updated successfully". Modal closes. Row shows new MRP. | E2E | |
| TC-PROD-E2E-072 | Admin | Toggle active/inactive from table row | P1 | 1. Navigate to `/products`. Select "All products" filter. 2. Find an active product row. Click the UserX (deactivate) icon button. | `PUT /products/:id` called with `{is_active:false}`. Toast: "Product deactivated successfully". Status badge changes to Inactive. | E2E | `toggleStatus` function. Icon: `UserX` (active→deactivate). |
| TC-PROD-E2E-073 | Admin | Reactivate product from table row | P1 | 1. Navigate to `/products`. Select "Inactive only" filter. 2. Find an inactive product row. Click UserCheck icon. | `PUT /products/:id` `{is_active:true}`. Toast: "Product activated successfully". | E2E | Icon: `UserCheck` (inactive→activate). |
| TC-PROD-E2E-074 | Admin | Edit image in edit modal — immediate upload | P1 | 1. Open edit modal for a product. 2. Select a new JPEG from image file picker. | `POST /products/:id/image` fired immediately (not deferred). Toast: "Image uploaded successfully". Product image refreshed in table. | E2E | In edit mode: `onChange` fires `productService.uploadImage()` directly, not deferred. Contrast with create mode (deferred). |
| TC-PROD-E2E-075 | Supervisor | Supervisor sees Edit button and can update product via modal | P1 | 1. Login as Supervisor. Navigate to `/products`. 2. Click "Edit" on a product row. 3. Change MRP. Click "Update Product". | Edit modal opens. `PUT` call succeeds (200). `canUpdate=true` for Supervisor. | E2E | `canUpdate = useCan('products:update')` — Supervisor holds this permission. |
| TC-PROD-E2E-076 | Admin | Edit modal for product has existing image preview | P1 | 1. Pre-condition: `PRODUCT_UUID_A` has `image_url` set. 2. Open edit modal for `PRODUCT_UUID_A`. | Current image displayed as 24×24 thumbnail in modal above file picker. | E2E | `editingProduct && getImageUrl(editingProduct.image_url)` → `<img>`. |

### 9.7 — Bulk Import button and modal (pointer to phase-06)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-PROD-E2E-080 | Admin | "Bulk Import" button visible on products page | P1 | 1. Login as Admin. Navigate to `/products`. | "Bulk Import" button visible in page header action area (next to "Add Product"). | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-017. Both buttons rendered when `canCreate=true`. |
| TC-PROD-E2E-081 | Admin | Bulk Import modal opens with sample CSV download section | P1 | 1. Click "Bulk Import" button. | Modal opens with: text "Upload a CSV file...", "Download sample CSV" link/button, "Required columns:" list (article_code, article_name, colour, size, mrp, section, category), optional columns listed, max-rows note, file `<input accept=".csv">`. | E2E | Realizing spec: `10-products.spec.ts` → TC-PRODX-018. Full bulk upload TC coverage is in phase-06. |

---

## Automation gap summary

The following scenarios have no realizing Playwright spec and should be added (recommended priority order):

1. **Casing normalization** (TC-PROD-030 through TC-PROD-038, TC-PROD-510–TC-PROD-513, TC-PROD-122): `toTitleCase`, `UPPERCASE`, `canonicalCategory`, `canonicalLocation`, description-as-typed — add assertions in `17-products-sections-rbac.spec.ts` or a new `43-product-casing.spec.ts`.
2. **Image propagation** (TC-PROD-720): upload to one product ID propagates `image_url` to all products sharing `article_code + colour` — add to `17-products-sections-rbac.spec.ts`.
3. **Soft-delete retrievable via GET** (TC-PROD-601): verify soft-deleted product still returned by `GET /products/:id` with `is_active=false`.
4. **Warehouse/Dispatch Operator access-denied page** (TC-PROD-E2E-004, TC-PROD-E2E-005): add role-switch tests to `17-products-sections-rbac.spec.ts` or `38-product-status-filter.spec.ts`.
5. **Status filter for non-Admin roles** (TC-PROD-214): `38-product-status-filter.spec.ts` currently only uses Admin token — add WH/DO variant.
6. **Bulk-size-range serial sequencing + rollback** (TC-PROD-120, TC-PROD-121): new spec `44-product-bulk-size-range.spec.ts`.
7. **SKU serial at 3 digits** (TC-PROD-042): edge case for `padStart(2,'0')` not truncating at serial=100.
8. **WebP image upload** (TC-PROD-702): add to image-upload spec.

---

*End of phase-05-products-crud.md — Session A5, authored 2026-06-09*
