# Phase 41 — Backend API: Products, Sections, Child Boxes

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3 (authored 2026-06-09 · Track B)
**Phase:** 41
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (test)
**Last updated:** 2026-06-09 (Session B2 — Sonnet execution under Opus dispatch)
**Automation target:** Playwright `request` API specs (or jest/supertest); new file `41-api-products-sections-childboxes.spec.ts`

---

## Scope

API contract tests (Type=API/Integration) for three route groups:

- **`/products/*`** — POST create, GET list (+ all filters), GET `:id`, GET `:id/colours`, GET `:id/sizes`, PUT `:id`, DELETE `:id`, POST `:id/image`, POST `bulk-size-range`, POST `bulk-upload`, GET `bulk-upload/sample`. Order-sensitive: literal sub-paths (`/bulk-upload/sample`, `/bulk-upload`, `/bulk-size-range`) registered **before** `/:id` in the router — test both do not shadow each other.
- **`/sections/*`** — POST, GET list, GET `:id`, PUT `:id`, DELETE `:id`. Writes `sections:*` Admin-only; GETs auth-only (no permission gate on GET routes). `sections:read` does **not** exist in any seed — no role holds it; GET is ungated beyond `authenticate`.
- **`/child-boxes/*`** — POST create, POST `/bulk`, POST `/bulk-multi-size`, POST `/bulk-upload`, GET `/bulk-upload/sample`, GET list, GET `/free`, GET `/qr/:qrCode`, POST `/:id/activate`, GET `/:id`. Order-sensitive: `/bulk-upload/sample`, `/bulk-upload`, `/bulk`, `/bulk-multi-size`, `/free`, `/qr/:qrCode` all registered before `/:id`. `child_boxes:delete` permission is seeded for Admin but **no DELETE route exists** — any DELETE to `/child-boxes/:id` returns 404.

**Realizing specs:** `10-products`, `15-bulk-upload`, `17-products-sections-rbac`, `29-childbox-bulk-upload`, `38-product-status-filter`, `39-product-csv-cap-and-batch`, `14-sections-crud`, `03-child-boxes`, `19-child-box-activation`, `30-generated-lifecycle`.

---

## Shared test fixtures

| Fixture alias | Value / creation note |
|---|---|
| `ADMIN_TOKEN` | JWT from `POST /auth/login` as Admin |
| `SUPERVISOR_TOKEN` | JWT from `POST /auth/login` as Supervisor |
| `WAREHOUSE_TOKEN` | JWT from `POST /auth/login` as Warehouse Operator |
| `DISPATCH_TOKEN` | JWT from `POST /auth/login` as Dispatch Operator |
| `PRODUCT_A_ID` | Created by TC-API-PROD-001 — `article_name="Busker"`, `colour="White"`, `size="6"`, `mrp=299`, `category="Gents"`, `section="Hawaii"` |
| `PRODUCT_B_ID` | Created by TC-API-PROD-004 (Supervisor) — same article/colour/category/section, `size="7"` |
| `SECTION_ID` | Created by TC-API-SEC-001 — `name="Hawaii"` |
| `CB_GENERATED_ID` | Created by TC-API-CB-001 — single child box in GENERATED status |
| `CB_FREE_ID` | Activated by TC-API-CB-050 — same child box in FREE status |
| `BULK_CB_IDS[]` | Array created by TC-API-CB-020 (/bulk) |

---

## RBAC reference

### Products

| Permission / Endpoint | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `products:create` — POST `/products`, POST `/bulk-size-range`, POST `/bulk-upload` | ✓ | ✓ | ✗ 403 | ✗ 403 |
| `products:read` — GET `/bulk-upload/sample` | ✓ | ✓ | ✓ | ✓ |
| `products:update` — PUT `/:id`, POST `/:id/image` | ✓ | ✓ | ✗ 403 | ✗ 403 |
| `products:delete` — DELETE `/:id` | ✓ | ✗ 403 | ✗ 403 | ✗ 403 |
| GET `/products`, GET `/:id`, GET `/:id/colours`, GET `/:id/sizes` (auth-only, no perm gate) | ✓ 200 | ✓ 200 | ✓ 200 | ✓ 200 |
| Unauthenticated | 401 | — | — | — |

### Sections

| Permission / Endpoint | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `sections:create` — POST `/sections` | ✓ | ✗ 403 | ✗ 403 | ✗ 403 |
| `sections:update` — PUT `/sections/:id` | ✓ | ✗ 403 | ✗ 403 | ✗ 403 |
| `sections:delete` — DELETE `/sections/:id` | ✓ | ✗ 403 | ✗ 403 | ✗ 403 |
| GET `/sections`, GET `/sections/:id` (auth-only, no perm gate — `sections:read` not seeded) | ✓ 200 | ✓ 200 | ✓ 200 | ✓ 200 |
| Unauthenticated | 401 | — | — | — |

### Child Boxes

| Permission / Endpoint | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `child_boxes:create` — POST `/`, `/bulk`, `/bulk-multi-size`, `/bulk-upload` | ✓ | ✓ | ✓ | ✗ 403 |
| `child_boxes:read` — GET `/bulk-upload/sample` | ✓ | ✓ | ✓ | ✓ |
| `child_boxes:update` — POST `/:id/activate` | ✓ | ✓ | ✗ 403 | ✗ 403 |
| `child_boxes:delete` — **no DELETE route; any DELETE → 404** | N/A | N/A | N/A | N/A |
| GET `/`, `/free`, `/qr/:qrCode`, `/:id` (auth-only, no perm gate) | ✓ 200 | ✓ 200 | ✓ 200 | ✓ 200 |
| Unauthenticated | 401 | — | — | — |

---

## Table of Contents

1. [Section 1 — Products: Single Create (POST /products)](#section-1--products-single-create-post-products)
2. [Section 2 — Products: List & Filters (GET /products)](#section-2--products-list--filters-get-products)
3. [Section 3 — Products: Get by ID (GET /products/:id)](#section-3--products-get-by-id-get-productsid)
4. [Section 4 — Products: Colours & Sizes Sub-Endpoints](#section-4--products-colours--sizes-sub-endpoints)
5. [Section 5 — Products: Update (PUT /products/:id)](#section-5--products-update-put-productsid)
6. [Section 6 — Products: Delete (DELETE /products/:id)](#section-6--products-delete-delete-productsid)
7. [Section 7 — Products: Image Upload (POST /products/:id/image)](#section-7--products-image-upload-post-productsidimage)
8. [Section 8 — Products: Bulk Size-Range (POST /products/bulk-size-range)](#section-8--products-bulk-size-range-post-productsbulk-size-range)
9. [Section 9 — Products: Bulk Upload CSV (POST /products/bulk-upload)](#section-9--products-bulk-upload-csv-post-productsbulk-upload)
10. [Section 10 — Products: Bulk Upload Sample CSV (GET /products/bulk-upload/sample)](#section-10--products-bulk-upload-sample-csv-get-productsbulk-uploadsample)
11. [Section 11 — Sections: Create (POST /sections)](#section-11--sections-create-post-sections)
12. [Section 12 — Sections: List (GET /sections)](#section-12--sections-list-get-sections)
13. [Section 13 — Sections: Get by ID (GET /sections/:id)](#section-13--sections-get-by-id-get-sectionsid)
14. [Section 14 — Sections: Update (PUT /sections/:id)](#section-14--sections-update-put-sectionsid)
15. [Section 15 — Sections: Delete (DELETE /sections/:id)](#section-15--sections-delete-delete-sectionsid)
16. [Section 16 — Child Boxes: Single Create (POST /child-boxes)](#section-16--child-boxes-single-create-post-child-boxes)
17. [Section 17 — Child Boxes: Bulk Create (POST /child-boxes/bulk)](#section-17--child-boxes-bulk-create-post-child-boxesbulk)
18. [Section 18 — Child Boxes: Bulk Multi-Size (POST /child-boxes/bulk-multi-size)](#section-18--child-boxes-bulk-multi-size-post-child-boxesbulk-multi-size)
19. [Section 19 — Child Boxes: Bulk Upload CSV (POST /child-boxes/bulk-upload)](#section-19--child-boxes-bulk-upload-csv-post-child-boxesbulk-upload)
20. [Section 20 — Child Boxes: Bulk Upload Sample CSV (GET /child-boxes/bulk-upload/sample)](#section-20--child-boxes-bulk-upload-sample-csv-get-child-boxesbulk-uploadsample)
21. [Section 21 — Child Boxes: List (GET /child-boxes)](#section-21--child-boxes-list-get-child-boxes)
22. [Section 22 — Child Boxes: Free List (GET /child-boxes/free)](#section-22--child-boxes-free-list-get-child-boxesfree)
23. [Section 23 — Child Boxes: Get by QR (GET /child-boxes/qr/:qrCode)](#section-23--child-boxes-get-by-qr-get-child-boxesqrqrcode)
24. [Section 24 — Child Boxes: Activate (POST /child-boxes/:id/activate)](#section-24--child-boxes-activate-post-child-boxesidactivate)
25. [Section 25 — Child Boxes: Get by ID (GET /child-boxes/:id)](#section-25--child-boxes-get-by-id-get-child-boxesid)
26. [Section 26 — Child Boxes: Dead Delete Route](#section-26--child-boxes-dead-delete-route)
27. [Section 27 — Order-Sensitive Route Disambiguation](#section-27--order-sensitive-route-disambiguation)

---

## Section 1 — Products: Single Create (POST /products)

### 1.1 Role-based creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-001 | Admin | Admin creates product — minimum required fields | P0 | 1. `POST /auth/login` as Admin, save `ADMIN_TOKEN`. 2. `POST /products` with `Authorization: Bearer <ADMIN_TOKEN>`, body `{"article_name":"Busker","article_code":"BSK-001","colour":"White","size":"6","mrp":299,"category":"Gents","section":"Hawaii"}`. | HTTP 201. `success:true`. `data.id` is valid UUID. `data.sku` matches `HAWAII-BUSKER-GENTS-NN-WHITE`. `data.is_active=true`. `data.article_name="Busker"`. Save `data.id` as `PRODUCT_A_ID`. | API | Realizing spec: `10-products.spec.ts`. SKU format: `SECTION-ARTICLE-CATEGORY-NN-COLOUR` (uppercase, spaces→`-`). |
| TC-API-PROD-002 | Admin | Admin creates product — all optional fields | P1 | 1. Login as Admin. 2. `POST /products` body adds `description`, `location:"VKIA"`, `article_group:"Casual"`, `hsn_code:"64039900"`, `size_from:"6"`, `size_to:"10"`. | HTTP 201. `data.location="VKIA"`, `data.article_group="Casual"` (Title Case), `data.hsn_code="64039900"`. | API | |
| TC-API-PROD-003 | Supervisor | Supervisor creates product — 201 | P0 | 1. Login as Supervisor, save `SUPERVISOR_TOKEN`. 2. `POST /products` body: `{"article_name":"Busker","article_code":"BSK-001","colour":"White","size":"7","mrp":299,"category":"Gents","section":"Hawaii"}`. | HTTP 201. `data.id` non-null UUID. `data.sku` non-empty. Save `data.id` as `PRODUCT_B_ID`. | API | Supervisor holds `products:create` in `001_roles.ts` seed. |
| TC-API-PROD-004 | Warehouse Operator | Warehouse Operator cannot create product — 403 | P0 | 1. Login as Warehouse Op, save `WAREHOUSE_TOKEN`. 2. `POST /products` same body as TC-API-PROD-001. | HTTP 403. `success:false`. No product inserted. | API | WH Op lacks `products:create` in seed. |
| TC-API-PROD-005 | Dispatch Operator | Dispatch Operator cannot create product — 403 | P0 | 1. Login as Dispatch Op, save `DISPATCH_TOKEN`. 2. `POST /products` same body. | HTTP 403. No product created. | API | |
| TC-API-PROD-006 | Unauthenticated | Unauthenticated create returns 401 | P0 | 1. `POST /products` with no `Authorization` header, valid body. | HTTP 401. | API | |

### 1.2 Validation — missing required fields

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-010 | Admin | Missing article_name → 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `article_name`. | HTTP 400. Error references `article_name`. | API | Zod: `.min(2, 'Article name must be at least 2 characters')`. |
| TC-API-PROD-011 | Admin | Missing article_code → 400 | P0 | 1. Login as Admin. 2. `POST /products` body omits `article_code`. | HTTP 400. Error references `article_code`. | API | |
| TC-API-PROD-012 | Admin | Missing colour → 400 | P0 | 1. Login as Admin. 2. Body omits `colour`. | HTTP 400. | API | |
| TC-API-PROD-013 | Admin | Missing size → 400 | P0 | 1. Login as Admin. 2. Body omits `size`. | HTTP 400. | API | |
| TC-API-PROD-014 | Admin | Missing mrp → 400 | P0 | 1. Login as Admin. 2. Body omits `mrp`. | HTTP 400. | API | |
| TC-API-PROD-015 | Admin | Missing category → 400 | P0 | 1. Login as Admin. 2. Body omits `category`. | HTTP 400. | API | |
| TC-API-PROD-016 | Admin | Missing section → 400 | P0 | 1. Login as Admin. 2. Body omits `section`. | HTTP 400. | API | |

### 1.3 Validation — wrong-type / boundary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-020 | Admin | Negative MRP → 400 | P0 | 1. Login as Admin. 2. `POST /products` with `"mrp":-1`, all other fields valid. | HTTP 400. Error: `"MRP must be positive"`. | API | |
| TC-API-PROD-021 | Admin | Zero MRP → 400 | P1 | 1. `POST /products` with `"mrp":0`. | HTTP 400. | API | Schema `.positive()` excludes 0. |
| TC-API-PROD-022 | Admin | MRP exceeds max (>99999999.99) → 400 | P2 | 1. `POST /products` with `"mrp":100000000`. | HTTP 400. Error references max MRP. | API | |
| TC-API-PROD-023 | Admin | Invalid category → 400 | P0 | 1. `POST /products` with `"category":"Kids"`. | HTTP 400. Error: `"Category must be one of: Gents, Ladies, Boys, Girls"`. | API | Valid: Gents, Ladies, Boys, Girls. |
| TC-API-PROD-024 | Admin | Invalid location → 400 | P1 | 1. `POST /products` with `"location":"XYZ"`. | HTTP 400. Error: `"Location must be one of: VKIA, MIA, F540"`. | API | |
| TC-API-PROD-025 | Admin | article_name < 2 chars → 400 | P1 | 1. `POST /products` with `"article_name":"X"`. | HTTP 400. `"Article name must be at least 2 characters"`. | API | |
| TC-API-PROD-026 | Admin | article_name > 150 chars → 400 | P1 | 1. `POST /products` with `article_name` = 151-char string. | HTTP 400. | API | |
| TC-API-PROD-027 | Admin | article_code > 20 chars → 400 | P1 | 1. `POST /products` with `article_code` = 21-char string. | HTTP 400. | API | |

### 1.4 Casing normalization

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-030 | Admin | article_name normalized to Title Case | P1 | 1. Login as Admin. 2. `POST /products` with `"article_name":"alia PLUS"`, valid other fields. | HTTP 201. `data.article_name="Alia Plus"`. | API | `toTitleCase`: each word first-letter upper, rest lower, whitespace collapsed. AUTOMATION GAP — no existing spec covers this. |
| TC-API-PROD-031 | Admin | colour normalized to Title Case | P1 | 1. `POST /products` with `"colour":"NAVY BLUE"`. | HTTP 201. `data.colour="Navy Blue"`. | API | AUTOMATION GAP. |
| TC-API-PROD-032 | Admin | section normalized to Title Case | P1 | 1. `POST /products` with `"section":"hawaii"`. | HTTP 201. `data.section="Hawaii"`. | API | AUTOMATION GAP. |
| TC-API-PROD-033 | Admin | article_code uppercased | P1 | 1. `POST /products` with `"article_code":"bsk-001"`. | HTTP 201. `data.article_code="BSK-001"`. | API | AUTOMATION GAP. |
| TC-API-PROD-034 | Admin | article_group normalized to Title Case | P1 | 1. `POST /products` with `"article_group":"premium casual"`. | HTTP 201. `data.article_group="Premium Casual"`. | API | AUTOMATION GAP. |
| TC-API-PROD-035 | Admin | category case-insensitively resolved | P1 | 1. `POST /products` with `"category":"gents"`. | HTTP 201. `data.category="Gents"` (canonical). | API | `canonicalCategory` does case-insensitive lookup. AUTOMATION GAP. |
| TC-API-PROD-036 | Admin | location case-insensitively resolved | P1 | 1. `POST /products` with `"location":"vkia"`. | HTTP 201. `data.location="VKIA"` (canonical). | API | AUTOMATION GAP. |
| TC-API-PROD-037 | Admin | description HTML-stripped | P1 | 1. `POST /products` with `"description":"<b>Bold</b> sandal"`. | HTTP 201. `data.description="Bold sandal"` (tags removed). | API | `stripHtml` applied to description only; Title Case NOT applied. AUTOMATION GAP. |

### 1.5 SKU generation and deduplication

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-040 | Admin | SKU serial increments for same combo | P1 | 1. Login as Admin. 2. Create product (article_name="Busker", colour="White", size="9", category="Gents", section="Hawaii"). Note SKU serial N. 3. Create product (same article/colour/category/section, size="10"). Note SKU serial. | Second product SKU serial = N+1. Both products distinct UUIDs. | API | Realizing spec: `10-products.spec.ts`. `generateSku` counts existing rows for combo and adds 1. |
| TC-API-PROD-041 | Admin | Duplicate SKU (identical combo) returns 409 | P0 | 1. Pre-condition: `PRODUCT_A_ID` exists (article_name="Busker", colour="White", size="6", section="Hawaii", category="Gents"). 2. `POST /products` identical body. | HTTP 409. `"Product with SKU ... already exists"`. No second row. | API | `ConflictError` thrown when existing SKU found. |

---

## Section 2 — Products: List & Filters (GET /products)

### 2.1 Auth — all 4 roles + unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-100 | Admin | Admin lists products — 200 | P0 | 1. Login as Admin. 2. `GET /products`. | HTTP 200. `success:true`. `data` array. `total` integer. Pagination meta present. | API | GET has NO `authorizePermission` gate — only `authenticate`. |
| TC-API-PROD-101 | Supervisor | Supervisor lists products — 200 | P0 | 1. Login as Supervisor. 2. `GET /products`. | HTTP 200. `data` array. | API | |
| TC-API-PROD-102 | Warehouse Operator | Warehouse Op lists products — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /products`. | HTTP 200. `data` array. | API | KNOWN DISCREPANCY: WH Op lacks `products:read` gate because GET has none. Intentional auth-only behavior. |
| TC-API-PROD-103 | Dispatch Operator | Dispatch Op lists products — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /products`. | HTTP 200. `data` array. | API | Same as above. |
| TC-API-PROD-104 | Unauthenticated | Unauthenticated list → 401 | P0 | 1. `GET /products` with no token. | HTTP 401. | API | |

### 2.2 Filter: is_active (Active / Inactive / All)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-110 | Admin | Default list returns only active products | P1 | 1. Login as Admin. 2. `GET /products` (no `is_active` param). Pre-condition: `PRODUCT_A_ID` is active; one product deactivated. | Response `data` array includes active products. Inactive products absent (default: no `is_active` filter omits the WHERE clause; all products returned unless is_active supplied). | API | Note: no `is_active` filter → service omits the WHERE clause → all products returned regardless of status. Verify behavior from service code: `if (filters.is_active !== undefined)` — with no param, `is_active` is `undefined`, so no filter applied. |
| TC-API-PROD-111 | Admin | is_active=true returns only active products | P1 | 1. Login as Admin. 2. `GET /products?is_active=true`. Pre-condition: have both active and inactive products. | Only products with `is_active=true` returned. Inactive products absent. | API | Realizing spec: `38-product-status-filter.spec.ts`. Schema transforms `"true"` → boolean `true`. |
| TC-API-PROD-112 | Admin | is_active=false returns only inactive products | P1 | 1. Login as Admin. 2. `GET /products?is_active=false`. | Only products with `is_active=false` returned. | API | Realizing spec: `38-product-status-filter.spec.ts`. |
| TC-API-PROD-113 | Admin | is_active=all (unparsed string) omits filter | P2 | 1. `GET /products?is_active=xyz`. | HTTP 200. No filter applied (the schema transform returns `undefined` for non `"true"`/`"false"` strings). All products returned. | API | Schema: `if (val === 'true') return true; if (val === 'false') return false; return undefined`. |

### 2.3 Filter: search and column filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-120 | Admin | search filter matches article_name, sku, article_code | P1 | 1. Login as Admin. 2. Pre-condition: product with `article_name="Busker"`, `sku="HAWAII-BUSKER-GENTS-01-WHITE"`, `article_code="BSK-001"`. 3. `GET /products?search=Busker`. | HTTP 200. Matching products returned. `search` uses `ILIKE '%Busker%'` against all three fields. | API | Service: `(article_name ILIKE $N OR sku ILIKE $N OR article_code ILIKE $N)`. |
| TC-API-PROD-121 | Admin | category filter exact-match | P1 | 1. `GET /products?category=Gents`. | HTTP 200. All returned products have `category="Gents"`. | API | Service: exact match `category = $N`. |
| TC-API-PROD-122 | Admin | section filter exact-match | P1 | 1. `GET /products?section=Hawaii`. | HTTP 200. All returned products have `section="Hawaii"`. | API | |
| TC-API-PROD-123 | Admin | location filter exact-match | P1 | 1. `GET /products?location=VKIA`. | HTTP 200. All returned products have `location="VKIA"`. | API | |
| TC-API-PROD-124 | Admin | colour filter ILIKE partial match | P1 | 1. `GET /products?colour=Whi`. | HTTP 200. Returns products where colour ILIKE `%Whi%`. | API | Service: `colour ILIKE $N` with `%value%`. |
| TC-API-PROD-125 | Admin | article_name filter ILIKE partial match | P1 | 1. `GET /products?article_name=usk`. | HTTP 200. Returns products where `article_name ILIKE '%usk%'`. | API | |
| TC-API-PROD-126 | Admin | Multiple filters combined (AND logic) | P1 | 1. `GET /products?category=Gents&section=Hawaii`. | HTTP 200. Returns only products matching both conditions. | API | Service joins conditions with `AND`. |

### 2.4 Pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-130 | Admin | Default pagination — page 1, limit 25 | P1 | 1. Login as Admin. 2. `GET /products`. | Response includes `page:1`, `limit:25`, `total` integer. `data.length` ≤ 25. | API | `sendPaginated` wraps data with pagination envelope. |
| TC-API-PROD-131 | Admin | Custom page and limit | P1 | 1. `GET /products?page=2&limit=5`. | HTTP 200. `data.length` ≤ 5. `page:2` in meta. | API | |

---

## Section 3 — Products: Get by ID (GET /products/:id)

### 3.1 Happy path — all 4 roles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-200 | Admin | Admin gets product by ID — 200 | P0 | 1. Login as Admin. 2. `GET /products/<PRODUCT_A_ID>`. | HTTP 200. `data.id = PRODUCT_A_ID`. `data.article_name`, `data.sku`, etc. present. | API | No permission gate on GET. |
| TC-API-PROD-201 | Supervisor | Supervisor gets product by ID — 200 | P0 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_A_ID>`. | HTTP 200. Full product object. | API | |
| TC-API-PROD-202 | Warehouse Operator | Warehouse Op gets product by ID — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /products/<PRODUCT_A_ID>`. | HTTP 200. | API | Auth-only GET — intentional; WH Op lacks `products:read` but no perm gate exists. |
| TC-API-PROD-203 | Dispatch Operator | Dispatch Op gets product by ID — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /products/<PRODUCT_A_ID>`. | HTTP 200. | API | |
| TC-API-PROD-204 | Unauthenticated | Unauthenticated GET by ID → 401 | P0 | 1. `GET /products/<PRODUCT_A_ID>` no token. | HTTP 401. | API | |

### 3.2 Error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-210 | Admin | Non-existent UUID → 404 | P0 | 1. Login as Admin. 2. `GET /products/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Product not found"`. | API | |
| TC-API-PROD-211 | Admin | Invalid UUID format → 400 | P1 | 1. `GET /products/not-a-uuid`. | HTTP 400. Error: `"Invalid product ID format"`. | API | Zod `productIdParamSchema` validates UUID format. |

---

## Section 4 — Products: Colours & Sizes Sub-Endpoints

### 4.1 GET /products/:id/colours

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-300 | Admin | Admin gets colours for product — 200 | P0 | 1. Login as Admin. 2. Pre-condition: two products share `article_name="Busker"` with colours "White" and "Black". 3. `GET /products/<PRODUCT_A_ID>/colours`. | HTTP 200. `data` is an array of `{colour, product_id}` objects. At minimum `{colour:"White", product_id:PRODUCT_A_ID}` present. | API | Service: `DISTINCT ON (colour)` across same `article_name`. Inactive products excluded. |
| TC-API-PROD-301 | Supervisor | Supervisor gets colours — 200 | P0 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_A_ID>/colours`. | HTTP 200. Colour array returned. | API | |
| TC-API-PROD-302 | Warehouse Operator | Warehouse Op gets colours — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /products/<PRODUCT_A_ID>/colours`. | HTTP 200. | API | |
| TC-API-PROD-303 | Dispatch Operator | Dispatch Op gets colours — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /products/<PRODUCT_A_ID>/colours`. | HTTP 200. | API | |
| TC-API-PROD-304 | Unauthenticated | Unauthenticated colours → 401 | P0 | 1. `GET /products/<PRODUCT_A_ID>/colours` no token. | HTTP 401. | API | |
| TC-API-PROD-305 | Admin | Colours for non-existent product → 404 | P1 | 1. Login as Admin. 2. `GET /products/00000000-0000-0000-0000-000000000000/colours`. | HTTP 404. `"Product not found"`. | API | Service checks if product exists before querying colours. |
| TC-API-PROD-306 | Admin | Inactive product excluded from colours list | P2 | 1. Login as Admin. 2. Deactivate one colour variant. 3. `GET /products/<active_sibling_id>/colours`. | Inactive colour variant not in response. | API | Service: `WHERE article_name = $1 AND is_active = true`. |

### 4.2 GET /products/:id/sizes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-310 | Admin | Admin gets sizes for product — 200 | P0 | 1. Login as Admin. 2. Pre-condition: products with article_name="Busker", colour="White", sizes "6","7","8" exist. 3. `GET /products/<PRODUCT_A_ID>/sizes`. | HTTP 200. `data` is array of product objects (siblings) ordered by size. At minimum sizes 6 and 7 present. | API | Service `getSiblingProducts` returns products with same `article_name + colour`, sorted by `size`. |
| TC-API-PROD-311 | Supervisor | Supervisor gets sizes — 200 | P0 | 1. Login as Supervisor. 2. `GET /products/<PRODUCT_A_ID>/sizes`. | HTTP 200. | API | |
| TC-API-PROD-312 | Warehouse Operator | Warehouse Op gets sizes — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /products/<PRODUCT_A_ID>/sizes`. | HTTP 200. | API | |
| TC-API-PROD-313 | Dispatch Operator | Dispatch Op gets sizes — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /products/<PRODUCT_A_ID>/sizes`. | HTTP 200. | API | |
| TC-API-PROD-314 | Unauthenticated | Unauthenticated sizes → 401 | P0 | 1. `GET /products/<PRODUCT_A_ID>/sizes` no token. | HTTP 401. | API | |
| TC-API-PROD-315 | Admin | Sizes for non-existent product → 404 | P1 | 1. `GET /products/00000000-0000-0000-0000-000000000000/sizes`. | HTTP 404. | API | |

---

## Section 5 — Products: Update (PUT /products/:id)

### 5.1 Role-based update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-400 | Admin | Admin updates product — 200 | P0 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_A_ID>` body `{"mrp":399}`. | HTTP 200. `data.mrp=399`. `data.updated_at` > previous value. | API | `products:update` — Admin always passes. |
| TC-API-PROD-401 | Supervisor | Supervisor updates product — 200 | P0 | 1. Login as Supervisor. 2. `PUT /products/<PRODUCT_B_ID>` body `{"mrp":349}`. | HTTP 200. `data.mrp=349`. | API | Supervisor holds `products:update`. |
| TC-API-PROD-402 | Warehouse Operator | Warehouse Op cannot update — 403 | P0 | 1. Login as Warehouse Op. 2. `PUT /products/<PRODUCT_A_ID>` body `{"mrp":199}`. | HTTP 403. Product not modified. | API | |
| TC-API-PROD-403 | Dispatch Operator | Dispatch Op cannot update — 403 | P0 | 1. Login as Dispatch Op. 2. `PUT /products/<PRODUCT_A_ID>` body `{"mrp":199}`. | HTTP 403. | API | |
| TC-API-PROD-404 | Unauthenticated | Unauthenticated update → 401 | P0 | 1. `PUT /products/<PRODUCT_A_ID>` no token. | HTTP 401. | API | |

### 5.2 Casing normalization on update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-410 | Admin | article_name normalized on update | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_A_ID>` body `{"article_name":"classic hawaii"}`. | HTTP 200. `data.article_name="Classic Hawaii"`. | API | Same `toTitleCase` applied in `updateProduct`. AUTOMATION GAP. |
| TC-API-PROD-411 | Admin | colour normalized on update | P1 | 1. `PUT /products/<PRODUCT_A_ID>` body `{"colour":"dark blue"}`. | HTTP 200. `data.colour="Dark Blue"`. | API | AUTOMATION GAP. |
| TC-API-PROD-412 | Admin | article_code uppercased on update | P1 | 1. `PUT /products/<PRODUCT_A_ID>` body `{"article_code":"bsk-002"}`. | HTTP 200. `data.article_code="BSK-002"`. | API | AUTOMATION GAP. |

### 5.3 Update error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-420 | Admin | Update non-existent product → 404 | P0 | 1. Login as Admin. 2. `PUT /products/00000000-0000-0000-0000-000000000000` body `{"mrp":100}`. | HTTP 404. `"Product not found"`. | API | |
| TC-API-PROD-421 | Admin | Update with duplicate SKU → 409 | P1 | 1. Pre-condition: products A and B both exist with different SKUs. 2. `PUT /products/<PRODUCT_A_ID>` body `{"sku":"<PRODUCT_B_SKU>"}`. | HTTP 409. `"Product with SKU ... already exists"`. | API | Service: dedup check when `sku` field changes. |
| TC-API-PROD-422 | Admin | Update with is_active=false (soft deactivate) | P1 | 1. Login as Admin. 2. `PUT /products/<PRODUCT_A_ID>` body `{"is_active":false}`. | HTTP 200. `data.is_active=false`. Product not deleted from DB. | API | Soft deactivation via update (distinct from DELETE which also does soft-deactivate). |
| TC-API-PROD-423 | Admin | Empty update body returns existing product unchanged | P2 | 1. `PUT /products/<PRODUCT_A_ID>` body `{}`. | HTTP 200. `data` equals current product state. No `updated_at` change. | API | Service: `if (fields.length === 0) return oldProduct`. |

---

## Section 6 — Products: Delete (DELETE /products/:id)

### 6.1 Role-based delete (soft — sets is_active=false)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-500 | Admin | Admin soft-deletes product — 200 | P0 | 1. Login as Admin. 2. `DELETE /products/<PRODUCT_B_ID>`. | HTTP 200. `"Product deactivated successfully"`. Re-fetch via `GET /products/<PRODUCT_B_ID>`: `data.is_active=false`. Product row still exists in DB. | API | Service: `UPDATE products SET is_active = false`. Realizing spec: `17-products-sections-rbac.spec.ts`. |
| TC-API-PROD-501 | Supervisor | Supervisor cannot delete — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /products/<PRODUCT_A_ID>`. | HTTP 403. Product not deactivated. | API | Supervisor lacks `products:delete` in seed. |
| TC-API-PROD-502 | Warehouse Operator | Warehouse Op cannot delete — 403 | P0 | 1. Login as Warehouse Op. 2. `DELETE /products/<PRODUCT_A_ID>`. | HTTP 403. | API | |
| TC-API-PROD-503 | Dispatch Operator | Dispatch Op cannot delete — 403 | P0 | 1. Login as Dispatch Op. 2. `DELETE /products/<PRODUCT_A_ID>`. | HTTP 403. | API | |
| TC-API-PROD-504 | Unauthenticated | Unauthenticated delete → 401 | P0 | 1. `DELETE /products/<PRODUCT_A_ID>` no token. | HTTP 401. | API | |

### 6.2 Delete error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-510 | Admin | Delete non-existent product → 404 | P0 | 1. Login as Admin. 2. `DELETE /products/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Product not found"`. | API | |
| TC-API-PROD-511 | Admin | Delete already-inactive product is idempotent | P2 | 1. Login as Admin. 2. DELETE product that is already `is_active=false`. | HTTP 200. Service simply updates `is_active=false` again (no guard). No error. | API | Service doesn't check current active status before deactivating. |

---

## Section 7 — Products: Image Upload (POST /products/:id/image)

### 7.1 Role-based upload

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-600 | Admin | Admin uploads product image — 200 | P0 | 1. Login as Admin. 2. `POST /products/<PRODUCT_A_ID>/image` as `multipart/form-data` with field `image` = valid JPEG file. | HTTP 200. `data.image_url` matches `/uploads/product-images/<filename>`. | API | `productImageUpload.single('image')` middleware. `products:update` permission required. |
| TC-API-PROD-601 | Supervisor | Supervisor uploads product image — 200 | P0 | 1. Login as Supervisor. 2. `POST /products/<PRODUCT_A_ID>/image` with valid image file. | HTTP 200. `data.image_url` non-empty. | API | Supervisor holds `products:update`. |
| TC-API-PROD-602 | Warehouse Operator | Warehouse Op cannot upload image — 403 | P0 | 1. Login as Warehouse Op. 2. `POST /products/<PRODUCT_A_ID>/image` with image file. | HTTP 403. Image not saved. | API | |
| TC-API-PROD-603 | Dispatch Operator | Dispatch Op cannot upload image — 403 | P0 | 1. Login as Dispatch Op. 2. Same as above. | HTTP 403. | API | |
| TC-API-PROD-604 | Unauthenticated | Unauthenticated image upload → 401 | P0 | 1. `POST /products/<PRODUCT_A_ID>/image` no token. | HTTP 401. | API | |

### 7.2 Upload validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-610 | Admin | Missing file returns 400 | P0 | 1. Login as Admin. 2. `POST /products/<PRODUCT_A_ID>/image` with no `image` field (empty multipart). | HTTP 400. `"No image file provided"`. | API | Controller: `if (!file) res.status(400).json(...)`. |
| TC-API-PROD-611 | Admin | Upload for non-existent product → 404 | P1 | 1. Login as Admin. 2. `POST /products/00000000-0000-0000-0000-000000000000/image` with valid image. | HTTP 404. `"Product not found"`. | API | |

### 7.3 Image propagation behavior

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-620 | Admin | Image upload propagates to all products sharing article_code + colour | P1 | 1. Login as Admin. 2. Pre-condition: two products with same `article_code="BSK-001"` and `colour="White"`, different sizes. 3. `POST /products/<size6_product_id>/image` with image. | HTTP 200. `GET /products/<size7_product_id>`: `data.image_url` equals the newly uploaded URL. The `image_url` update applies to ALL products matching `article_code + colour`, not just the targeted product. | API | Service: `UPDATE products SET image_url = $1 WHERE article_code = $2 AND colour = $3`. Realizing spec: `10-products.spec.ts` / `38-product-status-filter.spec.ts`. AUTOMATION GAP — no spec verifies propagation explicitly. |

---

## Section 8 — Products: Bulk Size-Range (POST /products/bulk-size-range)

### 8.1 Role-based bulk-size-range

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-700 | Admin | Admin bulk-creates by size range — 201 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` body `{"article_name":"Wave","article_code":"WV-001","colour":"Blue","mrp":349,"category":"Gents","section":"Hawaii","size_from":"6","size_to":"8"}`. | HTTP 201. `data` array of 3 products (sizes 6, 7, 8). Each has unique SKU with sequential serials. | API | Realizing spec: `10-products.spec.ts`. Route registered before `/:id` in router. |
| TC-API-PROD-701 | Supervisor | Supervisor bulk-creates by size range — 201 | P0 | 1. Login as Supervisor. 2. Same body as above but `colour="Red"`. | HTTP 201. 3 products created. | API | |
| TC-API-PROD-702 | Warehouse Operator | Warehouse Op cannot bulk-size-range — 403 | P0 | 1. Login as Warehouse Op. 2. Same POST body. | HTTP 403. | API | `products:create` required. |
| TC-API-PROD-703 | Dispatch Operator | Dispatch Op cannot bulk-size-range — 403 | P0 | 1. Login as Dispatch Op. 2. Same POST body. | HTTP 403. | API | |
| TC-API-PROD-704 | Unauthenticated | Unauthenticated bulk-size-range → 401 | P0 | 1. `POST /products/bulk-size-range` no token. | HTTP 401. | API | |

### 8.2 Validation and boundary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-710 | Admin | size_from > size_to → 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` with `size_from:"10"`, `size_to:"6"`. | HTTP 400. `"size_from must be less than or equal to size_to"`. No products inserted. | API | Zod `.refine()` check. |
| TC-API-PROD-711 | Admin | Range exceeds 20 sizes → 400 | P1 | 1. `POST /products/bulk-size-range` with `size_from:"1"`, `size_to:"22"`. | HTTP 400. `"Size range cannot exceed 20 sizes"`. | API | Zod: `size_to - size_from + 1 <= 20`. |
| TC-API-PROD-712 | Admin | size_from or size_to non-integer string → 400 | P1 | 1. `POST /products/bulk-size-range` with `size_from:"abc"`. | HTTP 400. `"size_from must be a positive integer string"`. | API | Zod: `.regex(/^\d+$/)`. |
| TC-API-PROD-713 | Admin | Bulk size-range transactional — all-or-nothing on error | P2 | 1. Login as Admin. 2. Fill size 1–5 successfully for combo. 3. Attempt bulk-size-range for a combo that would generate a mid-range conflict. | Either all products created or none (transaction rolls back). Confirm no partial insert. | API | Service wraps all inserts in a single `BEGIN/COMMIT`. |

### 8.3 SKU serial sequencing in transaction

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-720 | Admin | SKU serials within same transaction are sequential | P1 | 1. Login as Admin. 2. `POST /products/bulk-size-range` with `size_from:"11"`, `size_to:"13"`, new article/colour/category/section combo. | HTTP 201. Three products returned. SKU serials are 01, 02, 03 respectively (in-transaction count visible via same client). | API | Service uses same `client` for count queries inside transaction loop so each insert is visible to the next serial calculation. |

---

## Section 9 — Products: Bulk Upload CSV (POST /products/bulk-upload)

### 9.1 Role-based bulk upload

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-800 | Admin | Admin bulk-uploads valid CSV — 201 | P0 | 1. Login as Admin. 2. `POST /products/bulk-upload` as `multipart/form-data` with `file` = valid CSV containing 3 rows. CSV headers: `article_code,article_name,colour,size,mrp,section,category`. | HTTP 201. `data.created=3`. `data.errors=[]` (empty array). | API | Realizing spec: `15-bulk-upload.spec.ts`, `39-product-csv-cap-and-batch.spec.ts`. |
| TC-API-PROD-801 | Supervisor | Supervisor bulk-uploads — 201 | P0 | 1. Login as Supervisor. 2. Same valid CSV. | HTTP 201. `data.created >= 1`. | API | Supervisor holds `products:create`. |
| TC-API-PROD-802 | Warehouse Operator | Warehouse Op cannot bulk-upload — 403 | P0 | 1. Login as Warehouse Op. 2. Same POST. | HTTP 403. | API | |
| TC-API-PROD-803 | Dispatch Operator | Dispatch Op cannot bulk-upload — 403 | P0 | 1. Login as Dispatch Op. 2. Same POST. | HTTP 403. | API | |
| TC-API-PROD-804 | Unauthenticated | Unauthenticated bulk-upload → 401 | P0 | 1. `POST /products/bulk-upload` no token. | HTTP 401. | API | |

### 9.2 Validation and error handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-810 | Admin | No file provided → 400 | P0 | 1. Login as Admin. 2. `POST /products/bulk-upload` with no `file` field. | HTTP 400. `"No CSV file provided"`. | API | Controller: `if (!file) res.status(400)`. |
| TC-API-PROD-811 | Admin | Empty CSV → 409 | P1 | 1. Login as Admin. 2. Upload CSV with header row only, no data rows. | HTTP 409. `"CSV file is empty"`. | API | Service: `if (records.length === 0) throw ConflictError`. |
| TC-API-PROD-812 | Admin | Missing required columns → 409 | P0 | 1. Login as Admin. 2. Upload CSV missing `mrp` column. | HTTP 409. `"Missing required columns: mrp"`. | API | Service validates: `article_code, article_name, colour, size, mrp, section, category`. |
| TC-API-PROD-813 | Admin | CSV exceeds default cap (501 rows) → 409 | P0 | 1. Login as Admin. 2. Upload CSV with 501 data rows. `PRODUCT_CSV_MAX_ROWS` not set (defaults to 500). | HTTP 409. `"CSV contains 501 rows. Maximum allowed is 500 per upload."`. | API | Realizing spec: `39-product-csv-cap-and-batch.spec.ts`. Env-gated: `process.env.PRODUCT_CSV_MAX_ROWS \|\| 500`. |
| TC-API-PROD-814 | Admin | Per-row error — invalid mrp — reported without aborting valid rows | P1 | 1. Login as Admin. 2. Upload CSV with 3 rows: row 1 valid, row 2 has `mrp=-1`, row 3 valid. | HTTP 201. `data.created=2`. `data.errors` array contains 1 entry with `row:3` (1-indexed from data rows: header=row 1, data starts at row 2; row 3 is second data row — `rowNum = i + 2`). `data.errors[0].error` references mrp. | API | Service processes all rows; invalid rows go to `errors[]`, valid rows insert. Row numbering: i+2 (header=1, data starts at 2). |
| TC-API-PROD-815 | Admin | Per-row error — invalid category — reported | P1 | 1. Login as Admin. 2. Upload CSV where one row has `category=Kids`. | HTTP 201 (if other rows valid). `data.errors` entry: `error` contains `"category must be one of"`. | API | |
| TC-API-PROD-816 | Admin | Per-row error — duplicate SKU — 409 in errors array | P1 | 1. Pre-condition: product with SKU `HAWAII-BUSKER-GENTS-01-WHITE` exists. 2. Upload CSV with a row that would generate the same SKU. | HTTP 201. `data.errors` entry: `error` = `"Duplicate SKU: ... already exists"`. `data.created` excludes that row. | API | Realizing spec: `39-product-csv-cap-and-batch.spec.ts`. Dedup check in Pass 3. |
| TC-API-PROD-817 | Admin | Intra-batch duplicate SKU — only one row inserted | P1 | 1. Upload CSV with two rows that would generate identical SKU (same article/colour/size/section/category). | HTTP 201. `data.created=1`. `data.errors` has 1 entry for the duplicate. | API | `seenInBatch` Set prevents intra-batch collision. |
| TC-API-PROD-818 | Admin | Chunk-failure degrades to per-row insert | P2 | 1. Login as Admin. 2. Upload 502 rows with `PRODUCT_CSV_MAX_ROWS=1000` (or mock chunk failure). One row in the chunk has a DB-level constraint violation. | HTTP 201. `data.created` = chunk total minus bad rows. `data.errors` lists per-row failures. | API | AUTOMATION GAP — chunk degrade path requires DB-level error injection. Service: catch on chunk txn → falls back to single-row inserts. |

### 9.3 Casing normalization in bulk upload

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-820 | Admin | Bulk upload normalizes article_name to Title Case | P1 | 1. Login as Admin. 2. Upload CSV row with `article_name=ALIA PLUS`. | HTTP 201. Inserted product has `article_name="Alia Plus"`. | API | AUTOMATION GAP — no existing spec verifies casing in bulk path. |
| TC-API-PROD-821 | Admin | Bulk upload resolves category case-insensitively | P1 | 1. Upload CSV row with `category=ladies`. | HTTP 201. Inserted product has `category="Ladies"`. | API | AUTOMATION GAP. |

---

## Section 10 — Products: Bulk Upload Sample CSV (GET /products/bulk-upload/sample)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-900 | Admin | Admin downloads sample CSV — 200 | P0 | 1. Login as Admin. 2. `GET /products/bulk-upload/sample`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename=product_upload_sample.csv`. CSV body has headers: `article_code,article_name,colour,size,mrp,section,category,location,...`. At least 2 data rows. | API | Realizing spec: `15-bulk-upload.spec.ts`. Route registered BEFORE `/:id` in router — no shadowing. |
| TC-API-PROD-901 | Supervisor | Supervisor downloads sample CSV — 200 | P0 | 1. Login as Supervisor. 2. `GET /products/bulk-upload/sample`. | HTTP 200. CSV returned. | API | `products:read` permission required. Supervisor holds it. |
| TC-API-PROD-902 | Warehouse Operator | Warehouse Op downloads sample CSV — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /products/bulk-upload/sample`. | HTTP 200. | API | WH Op holds `products:read` in seed. |
| TC-API-PROD-903 | Dispatch Operator | Dispatch Op downloads sample CSV — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /products/bulk-upload/sample`. | HTTP 200. | API | Dispatch Op holds `products:read`. |
| TC-API-PROD-904 | Unauthenticated | Unauthenticated sample CSV → 401 | P0 | 1. `GET /products/bulk-upload/sample` no token. | HTTP 401. | API | |
| TC-API-PROD-905 | Admin | Order-sensitive: /bulk-upload/sample not shadowed by /:id | P0 | 1. Login as Admin. 2. `GET /products/bulk-upload/sample`. | HTTP 200 CSV (NOT a 400/404 "invalid UUID" from `:id` handler). | API | Router registers literal sub-paths before `/:id`. This TC asserts route ordering correct. |

---

## Section 11 — Sections: Create (POST /sections)

### 11.1 Role-based creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-001 | Admin | Admin creates section — 201 | P0 | 1. Login as Admin. 2. `POST /sections` body `{"name":"Hawaii","display_order":1}`. | HTTP 201. `data.id` UUID. `data.name="Hawaii"`. `data.is_active=true`. Save `data.id` as `SECTION_ID`. | API | Realizing spec: `14-sections-crud.spec.ts`. `sections:create` — Admin only. |
| TC-API-SEC-002 | Supervisor | Supervisor cannot create section — 403 | P0 | 1. Login as Supervisor. 2. `POST /sections` body `{"name":"TestSection"}`. | HTTP 403. No section created. | API | Supervisor lacks `sections:create`. |
| TC-API-SEC-003 | Warehouse Operator | Warehouse Op cannot create section — 403 | P0 | 1. Login as Warehouse Op. 2. `POST /sections` body same. | HTTP 403. | API | |
| TC-API-SEC-004 | Dispatch Operator | Dispatch Op cannot create section — 403 | P0 | 1. Login as Dispatch Op. 2. `POST /sections` body same. | HTTP 403. | API | |
| TC-API-SEC-005 | Unauthenticated | Unauthenticated create → 401 | P0 | 1. `POST /sections` no token. | HTTP 401. | API | |

### 11.2 Validation and deduplication

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-010 | Admin | Missing name → 400 | P0 | 1. Login as Admin. 2. `POST /sections` body `{}`. | HTTP 400. Error references `name`. | API | Zod: `name: z.string().min(1)`. |
| TC-API-SEC-011 | Admin | Duplicate name (case-insensitive) → 409 | P0 | 1. Pre-condition: `SECTION_ID` exists with name "Hawaii". 2. `POST /sections` body `{"name":"hawaii"}`. | HTTP 409. `"Section with name \"hawaii\" already exists"`. | API | Service: `LOWER(name) = LOWER($1)` dedup check — includes inactive sections. KNOWN DISCREPANCY: inactive section with same name blocks creation. Encode as documented behavior. |
| TC-API-SEC-012 | Admin | Duplicate name including inactive section → 409 | P1 | 1. Admin deactivates "Hawaii" section. 2. `POST /sections` body `{"name":"Hawaii"}`. | HTTP 409. Conflict raised even though existing section is inactive. | API | Service checks all rows with `LOWER(name) = LOWER($1)` — no `is_active` filter. KNOWN DISCREPANCY documented. |

---

## Section 12 — Sections: List (GET /sections)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-100 | Admin | Admin lists sections — 200 | P0 | 1. Login as Admin. 2. `GET /sections`. | HTTP 200. `data` array. Each object has `id, name, is_active, display_order`. Only active sections by default. | API | `sections:read` does NOT exist in any seed. GET is auth-only (no `authorizePermission` gate). |
| TC-API-SEC-101 | Supervisor | Supervisor lists sections — 200 | P0 | 1. Login as Supervisor. 2. `GET /sections`. | HTTP 200. Active sections returned. | API | KNOWN DISCREPANCY: `sections:read` is not seeded but GET is ungated beyond authenticate — all roles get 200. |
| TC-API-SEC-102 | Warehouse Operator | Warehouse Op lists sections — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /sections`. | HTTP 200. | API | |
| TC-API-SEC-103 | Dispatch Operator | Dispatch Op lists sections — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /sections`. | HTTP 200. | API | |
| TC-API-SEC-104 | Unauthenticated | Unauthenticated list → 401 | P0 | 1. `GET /sections` no token. | HTTP 401. | API | |
| TC-API-SEC-110 | Admin | include_inactive=true returns inactive sections | P1 | 1. Login as Admin. 2. Pre-condition: one section deactivated. 3. `GET /sections?include_inactive=true`. | HTTP 200. Inactive sections included. | API | Controller: `include_inactive === 'true'` passed to service. |
| TC-API-SEC-111 | Admin | Default (no include_inactive) returns only active | P1 | 1. Login as Admin. 2. `GET /sections`. | HTTP 200. No `is_active=false` sections in response. | API | Service: `WHERE is_active = true` default. |
| TC-API-SEC-112 | Admin | Sections ordered by display_order ASC then name ASC | P2 | 1. Pre-condition: multiple sections with varying `display_order`. 2. `GET /sections`. | HTTP 200. Sections ordered by `display_order ASC, name ASC`. | API | Service: `ORDER BY display_order ASC, name ASC`. |

---

## Section 13 — Sections: Get by ID (GET /sections/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-200 | Admin | Admin gets section by ID — 200 | P0 | 1. Login as Admin. 2. `GET /sections/<SECTION_ID>`. | HTTP 200. `data.id=SECTION_ID`. `data.name="Hawaii"`. | API | |
| TC-API-SEC-201 | Supervisor | Supervisor gets section by ID — 200 | P0 | 1. Login as Supervisor. 2. `GET /sections/<SECTION_ID>`. | HTTP 200. | API | |
| TC-API-SEC-202 | Warehouse Operator | Warehouse Op gets section by ID — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /sections/<SECTION_ID>`. | HTTP 200. | API | |
| TC-API-SEC-203 | Dispatch Operator | Dispatch Op gets section by ID — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /sections/<SECTION_ID>`. | HTTP 200. | API | |
| TC-API-SEC-204 | Unauthenticated | Unauthenticated GET by ID → 401 | P0 | 1. `GET /sections/<SECTION_ID>` no token. | HTTP 401. | API | |
| TC-API-SEC-210 | Admin | Non-existent UUID → 404 | P0 | 1. `GET /sections/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Section not found"`. | API | |
| TC-API-SEC-211 | Admin | Invalid UUID format → 400 | P1 | 1. `GET /sections/not-a-uuid`. | HTTP 400. `"Invalid section ID format"` (Zod). | API | |

---

## Section 14 — Sections: Update (PUT /sections/:id)

### 14.1 Role-based update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-300 | Admin | Admin updates section name — 200 | P0 | 1. Login as Admin. 2. `PUT /sections/<SECTION_ID>` body `{"name":"Hawaii Updated"}`. | HTTP 200. `data.name="Hawaii Updated"`. | API | `sections:update` — Admin only. |
| TC-API-SEC-301 | Supervisor | Supervisor cannot update section — 403 | P0 | 1. Login as Supervisor. 2. `PUT /sections/<SECTION_ID>` body `{"name":"X"}`. | HTTP 403. | API | |
| TC-API-SEC-302 | Warehouse Operator | Warehouse Op cannot update — 403 | P0 | 1. Login as Warehouse Op. 2. Same. | HTTP 403. | API | |
| TC-API-SEC-303 | Dispatch Operator | Dispatch Op cannot update — 403 | P0 | 1. Login as Dispatch Op. 2. Same. | HTTP 403. | API | |
| TC-API-SEC-304 | Unauthenticated | Unauthenticated update → 401 | P0 | 1. No token. | HTTP 401. | API | |

### 14.2 Update validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-310 | Admin | Update with duplicate name (case-insensitive) → 409 | P0 | 1. Pre-condition: sections "Hawaii" and "PU" exist. 2. `PUT /sections/<PU_section_id>` body `{"name":"hawaii"}`. | HTTP 409. `"Section with name \"hawaii\" already exists"`. | API | Service: `LOWER(name) = LOWER($1) AND id != $2`. |
| TC-API-SEC-311 | Admin | Update non-existent section → 404 | P0 | 1. `PUT /sections/00000000-0000-0000-0000-000000000000` body `{"name":"X"}`. | HTTP 404. | API | |
| TC-API-SEC-312 | Admin | Update is_active=false to deactivate | P1 | 1. `PUT /sections/<SECTION_ID>` body `{"is_active":false}`. | HTTP 200. `data.is_active=false`. | API | |
| TC-API-SEC-313 | Admin | Empty body — existing section returned unchanged | P2 | 1. `PUT /sections/<SECTION_ID>` body `{}`. | HTTP 200. `data` equals current state. No change. | API | Service: `if (fields.length === 0) return oldSection`. |

---

## Section 15 — Sections: Delete (DELETE /sections/:id)

### 15.1 Role-based delete (soft)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-400 | Admin | Admin soft-deletes section — 200 | P0 | 1. Login as Admin. 2. `DELETE /sections/<SECTION_ID>`. | HTTP 200. `"Section deactivated successfully"`. Re-fetch: `data.is_active=false`. Row still exists. | API | Service: `UPDATE product_sections SET is_active = false`. No referential-delete guard — products referencing this section are NOT affected. |
| TC-API-SEC-401 | Supervisor | Supervisor cannot delete section — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /sections/<SECTION_ID>`. | HTTP 403. | API | |
| TC-API-SEC-402 | Warehouse Operator | Warehouse Op cannot delete — 403 | P0 | 1. Login as Warehouse Op. 2. Same. | HTTP 403. | API | |
| TC-API-SEC-403 | Dispatch Operator | Dispatch Op cannot delete — 403 | P0 | 1. Login as Dispatch Op. 2. Same. | HTTP 403. | API | |
| TC-API-SEC-404 | Unauthenticated | Unauthenticated delete → 401 | P0 | 1. No token. | HTTP 401. | API | |

### 15.2 Delete edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SEC-410 | Admin | Delete non-existent section → 404 | P0 | 1. `DELETE /sections/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Section not found"`. | API | |
| TC-API-SEC-411 | Admin | No referential-delete guard — products referencing section remain | P1 | 1. Pre-condition: products exist with `section="Hawaii"`. 2. Admin deletes "Hawaii" section. | HTTP 200. Section deactivated. Products with `section="Hawaii"` still exist and still show `section="Hawaii"` (no cascade). | API | KNOWN DISCREPANCY: no FK guard. Encoded as documented behavior per Track A findings. AUTOMATION GAP. |

---

## Section 16 — Child Boxes: Single Create (POST /child-boxes)

### 16.1 Role-based creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-001 | Admin | Admin creates child box — 201 | P0 | 1. Login as Admin. 2. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>","quantity":1}`. | HTTP 201. `data.id` UUID. `data.barcode` matches `CB\d{6}` (short format). `data.status="GENERATED"`. `data.qr_data_uri` is non-empty string (SVG/dataURI). `data.article_name` present. Save `data.id` as `CB_GENERATED_ID`. | API | Realizing spec: `03-child-boxes.spec.ts`, `19-child-box-activation.spec.ts`. Barcode format: `CB######`. |
| TC-API-CB-002 | Supervisor | Supervisor creates child box — 201 | P0 | 1. Login as Supervisor. 2. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>"}`. | HTTP 201. `data.status="GENERATED"`. | API | Supervisor holds `child_boxes:create`. |
| TC-API-CB-003 | Warehouse Operator | Warehouse Op creates child box — 201 | P0 | 1. Login as Warehouse Op. 2. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>"}`. | HTTP 201. `data.status="GENERATED"`. | API | WH Op holds `child_boxes:create`. |
| TC-API-CB-004 | Dispatch Operator | Dispatch Op cannot create child box — 403 | P0 | 1. Login as Dispatch Op. 2. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>"}`. | HTTP 403. | API | Dispatch Op lacks `child_boxes:create`. |
| TC-API-CB-005 | Unauthenticated | Unauthenticated create → 401 | P0 | 1. `POST /child-boxes` no token. | HTTP 401. | API | |

### 16.2 Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-010 | Admin | Invalid product_id format → 400 | P0 | 1. Login as Admin. 2. `POST /child-boxes` body `{"product_id":"not-a-uuid"}`. | HTTP 400. `"Invalid product ID format"`. | API | Zod: `.uuid()`. |
| TC-API-CB-011 | Admin | Non-existent product_id → 404 | P0 | 1. `POST /child-boxes` body `{"product_id":"00000000-0000-0000-0000-000000000000"}`. | HTTP 404. `"Product not found or inactive"`. | API | Service: checks `is_active = true`. |
| TC-API-CB-012 | Admin | Inactive product_id → 404 | P1 | 1. Deactivate a product. 2. `POST /child-boxes` body `{"product_id":"<inactive_product_id>"}`. | HTTP 404. `"Product not found or inactive"`. | API | Service: `WHERE id = $1 AND is_active = true`. |
| TC-API-CB-013 | Admin | quantity exceeds max (10001) → 400 | P1 | 1. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>","quantity":10001}`. | HTTP 400. Zod: `"Quantity must not exceed 10000"`. | API | |
| TC-API-CB-014 | Admin | quantity=0 → 400 | P1 | 1. `POST /child-boxes` body `{"product_id":"<PRODUCT_A_ID>","quantity":0}`. | HTTP 400. `"Quantity must be positive"`. | API | |
| TC-API-CB-015 | Admin | CHILD_CREATED inventory transaction written on create | P1 | 1. Login as Admin. 2. `POST /child-boxes` body valid. 3. Check `inventory_transactions` table. | Row inserted: `transaction_type="CHILD_CREATED"`, `child_box_id=<new_id>`. | Integration | Service writes to `inventory_transactions`. |

---

## Section 17 — Child Boxes: Bulk Create (POST /child-boxes/bulk)

### 17.1 Role-based bulk create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-020 | Admin | Admin bulk-creates child boxes — 201 | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk` body `{"product_id":"<PRODUCT_A_ID>","count":3,"quantity":1}`. | HTTP 201. `data` is array of 3 child boxes. Each `status="GENERATED"`, unique `barcode`, unique `id`. `qr_data_uri` non-empty. Save IDs as `BULK_CB_IDS[]`. | API | Realizing spec: `29-childbox-bulk-upload.spec.ts`. |
| TC-API-CB-021 | Supervisor | Supervisor bulk-creates — 201 | P0 | 1. Login as Supervisor. 2. Same body, `count:2`. | HTTP 201. 2 child boxes created. | API | |
| TC-API-CB-022 | Warehouse Operator | Warehouse Op bulk-creates — 201 | P0 | 1. Login as Warehouse Op. 2. Same body, `count:2`. | HTTP 201. | API | |
| TC-API-CB-023 | Dispatch Operator | Dispatch Op cannot bulk-create — 403 | P0 | 1. Login as Dispatch Op. 2. `POST /child-boxes/bulk` body valid. | HTTP 403. | API | |
| TC-API-CB-024 | Unauthenticated | Unauthenticated bulk create → 401 | P0 | 1. `POST /child-boxes/bulk` no token. | HTTP 401. | API | |

### 17.2 Bulk create validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-030 | Admin | count exceeds max (501) → 400 | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk` body `{"product_id":"<PRODUCT_A_ID>","count":501}`. | HTTP 400. Zod: `"Cannot create more than 500 child boxes at once"`. | API | Schema: `.max(500, ...)`. This is Zod-level cap — **fixed at 500** regardless of env. Distinguish from `/bulk-multi-size` which is env-gated. |
| TC-API-CB-031 | Admin | count=0 → 400 | P1 | 1. `POST /child-boxes/bulk` body `{"product_id":"<PRODUCT_A_ID>","count":0}`. | HTTP 400. `"Count must be at least 1"`. | API | |
| TC-API-CB-032 | Admin | All boxes transactional — any failure rolls back all | P2 | 1. Login as Admin. 2. Simulate partial failure (e.g. duplicate barcode collision mid-loop). | All created child boxes rolled back. No partial state. | Integration | Service wraps in `BEGIN/COMMIT`. AUTOMATION GAP — requires failure injection. |

---

## Section 18 — Child Boxes: Bulk Multi-Size (POST /child-boxes/bulk-multi-size)

### 18.1 Role-based

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-040 | Admin | Admin bulk-creates multi-size — 201 | P0 | 1. Login as Admin. 2. Pre-condition: products with article_name="Busker", colour="White" exist for sizes 6, 7, 8. 3. `POST /child-boxes/bulk-multi-size` body `{"product_id":"<PRODUCT_A_ID>","quantity":1,"sizes":[{"size":"6","count":2},{"size":"7","count":3}]}`. | HTTP 201. `data` array of 5 child boxes. Sizes distributed: 2 with size "6", 3 with size "7". Each `status="GENERATED"`. `qr_data_uri=""` (empty string — bulk-multi-size does not generate QR DataURI). | API | KNOWN BEHAVIOR: `qr_data_uri=""` for bulk-multi-size. Realizing spec: `29-childbox-bulk-upload.spec.ts`. |
| TC-API-CB-041 | Supervisor | Supervisor bulk-multi-size — 201 | P0 | 1. Login as Supervisor. 2. Same body. | HTTP 201. Data array. | API | |
| TC-API-CB-042 | Warehouse Operator | Warehouse Op bulk-multi-size — 201 | P0 | 1. Login as Warehouse Op. 2. Same body. | HTTP 201. | API | |
| TC-API-CB-043 | Dispatch Operator | Dispatch Op cannot bulk-multi-size — 403 | P0 | 1. Login as Dispatch Op. 2. Same body. | HTTP 403. | API | |
| TC-API-CB-044 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |

### 18.2 Validation and cap

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-050 | Admin | Total exceeds default env cap (501) → 400 | P0 | 1. Login as Admin. 2. `CHILD_BOX_MAX_PER_GENERATION` not set (defaults to 500). 3. `POST /child-boxes/bulk-multi-size` with sizes summing to 501. | HTTP 400. `"Total count across all sizes must not exceed 500"`. | API | Env-gated: `process.env.CHILD_BOX_MAX_PER_GENERATION \|\| 500`. Distinct from `/bulk` Zod-level cap. AUTOMATION GAP for live-env cap (1500). |
| TC-API-CB-051 | Admin | Size not found for given article+colour → 404 | P0 | 1. `POST /child-boxes/bulk-multi-size` with `sizes:[{"size":"99","count":1}]` where size "99" doesn't exist for article/colour. | HTTP 404. `"No product found for size \"99\""`. | API | Service: validates all requested sizes before inserting. |
| TC-API-CB-052 | Admin | Empty sizes array → 400 | P1 | 1. `POST /child-boxes/bulk-multi-size` body `{"product_id":"<PRODUCT_A_ID>","sizes":[]}`. | HTTP 400. `"At least one size must be specified"`. | API | Zod: `.min(1, ...)`. |
| TC-API-CB-053 | Admin | sizes array exceeds 50 entries → 400 | P2 | 1. Body with 51 size objects. | HTTP 400. `"Cannot specify more than 50 sizes"`. | API | Zod: `.max(50, ...)`. |
| TC-API-CB-054 | Admin | qr_data_uri="" for all multi-size boxes | P1 | 1. Admin creates via bulk-multi-size. | HTTP 201. Each `data[N].qr_data_uri === ""`. | API | KNOWN BEHAVIOR: service sets `qr_data_uri: ''` for performance (no QR gen per box). |

---

## Section 19 — Child Boxes: Bulk Upload CSV (POST /child-boxes/bulk-upload)

### 19.1 Role-based

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-060 | Admin | Admin bulk-uploads CSV — 201 | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk-upload` multipart `file` = CSV with headers `sku,quantity,count` and 2 valid rows. | HTTP 201. `data.created >= 2`. `data.totalRows=2`. `data.errors=[]`. `data.createdBarcodes` array with `data.created` entries. | API | Realizing spec: `29-childbox-bulk-upload.spec.ts`. |
| TC-API-CB-061 | Supervisor | Supervisor bulk-uploads — 201 | P0 | 1. Login as Supervisor. 2. Same CSV. | HTTP 201. | API | |
| TC-API-CB-062 | Warehouse Operator | Warehouse Op bulk-uploads — 201 | P0 | 1. Login as Warehouse Op. 2. Same CSV. | HTTP 201. | API | WH Op holds `child_boxes:create`. |
| TC-API-CB-063 | Dispatch Operator | Dispatch Op cannot bulk-upload — 403 | P0 | 1. Login as Dispatch Op. 2. Same POST. | HTTP 403. | API | |
| TC-API-CB-064 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |

### 19.2 Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-070 | Admin | No file → 400 | P0 | 1. `POST /child-boxes/bulk-upload` no `file` field. | HTTP 400. `"No CSV file provided"`. | API | |
| TC-API-CB-071 | Admin | Empty CSV → 409 | P1 | 1. Upload CSV with header only. | HTTP 409. `"CSV file is empty"`. | API | |
| TC-API-CB-072 | Admin | CSV exceeds 1000 rows → 409 | P0 | 1. Upload CSV with 1001 data rows. | HTTP 409. `"Maximum 1000 rows per upload"`. | API | Service: hard-coded `if (records.length > 1000)`. Note: this is a ROW cap, distinct from total-box cap. |
| TC-API-CB-073 | Admin | Total boxes exceeds 5000 → 409 | P0 | 1. Upload CSV where `count` column sums to 5001 (e.g. 10 rows × count=501). | HTTP 409. `"Total boxes across all rows must not exceed 5000"`. | API | Service pre-validates total before any inserts. |
| TC-API-CB-074 | Admin | Missing required columns → 409 | P0 | 1. Upload CSV missing `count` column. | HTTP 409. `"Missing required columns: count"`. | API | Required: `sku, count`. |
| TC-API-CB-075 | Admin | Per-row error — SKU not found — reported, other rows succeed | P1 | 1. Upload CSV: row 1 valid SKU (count=2), row 2 has non-existent SKU. | HTTP 201. `data.created=2`. `data.errors` has 1 entry for row 2: `"Product with SKU \"...\" not found"`. | API | Service continues processing after per-row error. |
| TC-API-CB-076 | Admin | Per-row error — inactive product — reported | P1 | 1. Upload CSV with row referencing inactive product SKU. | HTTP 201. `data.errors` entry: `"Product \"...\" is inactive"`. | API | |
| TC-API-CB-077 | Admin | Per-row count=0 → Zod parse error for that row | P1 | 1. Upload CSV with `count=0` in one row. | HTTP 201 (other rows). `data.errors` entry referencing count validation. | API | `bulkUploadChildBoxRowSchema`: `count: z.coerce.number().int().min(1)`. |

---

## Section 20 — Child Boxes: Bulk Upload Sample CSV (GET /child-boxes/bulk-upload/sample)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-080 | Admin | Admin downloads sample CSV — 200 | P0 | 1. Login as Admin. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200. `Content-Type: text/csv; charset=utf-8`. `Content-Disposition: attachment; filename="child-boxes-bulk-upload-sample.csv"`. CSV headers: `sku,quantity,count`. At least 3 sample rows. | API | Realizing spec: `29-childbox-bulk-upload.spec.ts`. Route registered BEFORE `/:id`. |
| TC-API-CB-081 | Supervisor | Supervisor downloads sample — 200 | P0 | 1. Login as Supervisor. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200. CSV returned. | API | `child_boxes:read` — Supervisor holds it. |
| TC-API-CB-082 | Warehouse Operator | Warehouse Op downloads sample — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200. | API | WH Op holds `child_boxes:read`. |
| TC-API-CB-083 | Dispatch Operator | Dispatch Op downloads sample — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200. | API | Dispatch Op holds `child_boxes:read`. |
| TC-API-CB-084 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |
| TC-API-CB-085 | Admin | Order-sensitive: /bulk-upload/sample not shadowed by /:id | P0 | 1. Login as Admin. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200 CSV (NOT 400 "invalid UUID"). | API | Literal sub-path registered before `/:id` in router. |

---

## Section 21 — Child Boxes: List (GET /child-boxes)

### 21.1 All roles + unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-100 | Admin | Admin lists child boxes — 200 | P0 | 1. Login as Admin. 2. `GET /child-boxes`. | HTTP 200. `data` array. `total` integer. Pagination meta. | API | GET has no `authorizePermission` — auth-only. |
| TC-API-CB-101 | Supervisor | Supervisor lists child boxes — 200 | P0 | 1. Login as Supervisor. 2. `GET /child-boxes`. | HTTP 200. | API | |
| TC-API-CB-102 | Warehouse Operator | Warehouse Op lists child boxes — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /child-boxes`. | HTTP 200. | API | |
| TC-API-CB-103 | Dispatch Operator | Dispatch Op lists child boxes — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /child-boxes`. | HTTP 200. | API | |
| TC-API-CB-104 | Unauthenticated | Unauthenticated → 401 | P0 | 1. `GET /child-boxes` no token. | HTTP 401. | API | |

### 21.2 Filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-110 | Admin | status filter | P1 | 1. `GET /child-boxes?status=GENERATED`. | HTTP 200. All `data[N].status="GENERATED"`. | API | Zod enum validates against CHILD_BOX_STATUS values. |
| TC-API-CB-111 | Admin | product_id filter | P1 | 1. `GET /child-boxes?product_id=<PRODUCT_A_ID>`. | HTTP 200. All results have `product_id=PRODUCT_A_ID`. | API | |
| TC-API-CB-112 | Admin | search filter (barcode / article_name / sku) | P1 | 1. `GET /child-boxes?search=CB`. | HTTP 200. Returns boxes where `barcode ILIKE '%CB%' OR article_name ILIKE ... OR sku ILIKE ...`. | API | |
| TC-API-CB-113 | Admin | Invalid status value → 400 | P1 | 1. `GET /child-boxes?status=INVALID_STATUS`. | HTTP 400. Zod validation error. | API | |
| TC-API-CB-114 | Admin | SAMPLE / ECOMMERCE boxes absent from default list (UI behavior — not API) | P2 | 1. `GET /child-boxes` (no status filter). | HTTP 200. Response may include SAMPLE and ECOMMERCE boxes (no exclusion in API). | API | KNOWN DISCREPANCY: UI list page filters out SAMPLE/ECOMMERCE but the API itself does NOT — no default `status` filter in service. Encode as documented. |

---

## Section 22 — Child Boxes: Free List (GET /child-boxes/free)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-200 | Admin | Admin lists free boxes — 200 | P0 | 1. Login as Admin. 2. `GET /child-boxes/free`. | HTTP 200. All `data[N].status="FREE"`. Paginated. | API | Service: `WHERE cb.status = 'FREE'`. |
| TC-API-CB-201 | Supervisor | Supervisor lists free boxes — 200 | P0 | 1. Login as Supervisor. 2. `GET /child-boxes/free`. | HTTP 200. | API | |
| TC-API-CB-202 | Warehouse Operator | Warehouse Op lists free boxes — 200 | P0 | 1. Login as Warehouse Op. 2. `GET /child-boxes/free`. | HTTP 200. | API | |
| TC-API-CB-203 | Dispatch Operator | Dispatch Op lists free boxes — 200 | P0 | 1. Login as Dispatch Op. 2. `GET /child-boxes/free`. | HTTP 200. | API | |
| TC-API-CB-204 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |
| TC-API-CB-205 | Admin | product_id filter on /free | P1 | 1. `GET /child-boxes/free?product_id=<PRODUCT_A_ID>`. | HTTP 200. All returned boxes have `product_id=PRODUCT_A_ID` and `status="FREE"`. | API | Service: product_id adds additional condition. |
| TC-API-CB-206 | Admin | /free route not shadowed by /:id | P0 | 1. Login as Admin. 2. `GET /child-boxes/free`. | HTTP 200 (NOT a 400/404 "invalid UUID" from `:id` handler). | API | Literal `/free` registered before `/:id` in router. |

---

## Section 23 — Child Boxes: Get by QR (GET /child-boxes/qr/:qrCode)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-300 | Admin | Admin gets box by QR code — 200 | P0 | 1. Login as Admin. 2. `GET /child-boxes/qr/CB000001` (use real barcode from TC-API-CB-001). | HTTP 200. `data.barcode="CB000001"` (uppercased). `data.status` matches current status. `data.active_sample_feet` is an array (may be empty). | API | Service: `WHERE cb.barcode = UPPER($1)`. Returns `active_sample_feet` array from `sample_box_mapping`. |
| TC-API-CB-301 | Supervisor | Supervisor gets by QR — 200 | P0 | 1. Login as Supervisor. 2. Same `GET`. | HTTP 200. | API | |
| TC-API-CB-302 | Warehouse Operator | Warehouse Op gets by QR — 200 | P0 | 1. Login as Warehouse Op. 2. Same `GET`. | HTTP 200. | API | |
| TC-API-CB-303 | Dispatch Operator | Dispatch Op gets by QR — 200 | P0 | 1. Login as Dispatch Op. 2. Same `GET`. | HTTP 200. | API | |
| TC-API-CB-304 | Unauthenticated | Unauthenticated → 401 | P0 | 1. `GET /child-boxes/qr/CB000001` no token. | HTTP 401. | API | |
| TC-API-CB-305 | Admin | Non-existent QR code → 404 | P0 | 1. `GET /child-boxes/qr/CB999999`. (Barcode doesn't exist.) | HTTP 404. `"Child box not found for this QR code"`. | API | |
| TC-API-CB-306 | Admin | QR lookup is case-insensitive (barcode uppercased) | P1 | 1. `GET /child-boxes/qr/cb000001` (lowercase). | HTTP 200. Same result as uppercase. | API | Service: `UPPER($1)`. |
| TC-API-CB-307 | Admin | active_sample_feet populated for sampled box | P1 | 1. Pre-condition: child box added to a sample as RIGHT foot. 2. `GET /child-boxes/qr/<barcode>`. | HTTP 200. `data.active_sample_feet=["RIGHT"]`. | API | Service: `COALESCE(ARRAY(SELECT sbm.foot ... WHERE sbm.is_active = true), '{}')`. |
| TC-API-CB-308 | Admin | GENERATED box auto-activates on QR trace (read-with-side-effect) | P2 | 1. Pre-condition: `CB_GENERATED_ID` in GENERATED status. 2. `GET /child-boxes/qr/<barcode>` (the QR trace endpoint). | HTTP 200. Depending on the scan-trace service: if `traceByBarcode` in inventory service is called (not this endpoint), activation occurs there. This endpoint itself does NOT auto-activate — it simply returns data. The auto-activation side-effect is in `GET /inventory/trace/:barcode`. | API | AUTOMATION GAP — auto-activate-on-trace is a behavior of the inventory trace route, not of `/child-boxes/qr/:qrCode`. Document the distinction. Realizing spec: `30-generated-lifecycle.spec.ts`. |

---

## Section 24 — Child Boxes: Activate (POST /child-boxes/:id/activate)

### 24.1 Role-based activation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-400 | Admin | Admin activates GENERATED box — 200 | P0 | 1. Login as Admin. 2. `POST /child-boxes/<CB_GENERATED_ID>/activate`. | HTTP 200. `data.status="FREE"`. `data.id=CB_GENERATED_ID`. | API | Realizing spec: `19-child-box-activation.spec.ts`, `30-generated-lifecycle.spec.ts`. `child_boxes:update` required. |
| TC-API-CB-401 | Supervisor | Supervisor activates GENERATED box — 200 | P0 | 1. Login as Supervisor. 2. `POST /child-boxes/<another_GENERATED_id>/activate`. | HTTP 200. `data.status="FREE"`. | API | Supervisor holds `child_boxes:update`. |
| TC-API-CB-402 | Warehouse Operator | Warehouse Op cannot activate — 403 | P0 | 1. Login as Warehouse Op. 2. `POST /child-boxes/<CB_GENERATED_ID>/activate`. | HTTP 403. Box remains GENERATED. | API | WH Op lacks `child_boxes:update`. KNOWN DISCREPANCY vs `child_boxes:create` (WH holds create but NOT update). |
| TC-API-CB-403 | Dispatch Operator | Dispatch Op cannot activate — 403 | P0 | 1. Login as Dispatch Op. 2. Same. | HTTP 403. | API | |
| TC-API-CB-404 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |

### 24.2 Activation behavior and guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-410 | Admin | Activate already-FREE box is idempotent — 200 | P0 | 1. Login as Admin. 2. Pre-condition: box is FREE. 3. `POST /child-boxes/<FREE_box_id>/activate`. | HTTP 200. `data.status="FREE"`. No new `inventory_transaction` row written. | API | Service: `if (box.status === FREE) return box` — idempotent no-op. |
| TC-API-CB-411 | Admin | Cannot activate PACKED box — 409 | P0 | 1. Pre-condition: box is PACKED. 2. `POST /child-boxes/<PACKED_id>/activate`. | HTTP 409. `"Cannot activate child box in PACKED status"`. | API | Service: status guard. |
| TC-API-CB-412 | Admin | Cannot activate DISPATCHED box — 409 | P0 | 1. Pre-condition: box is DISPATCHED. 2. `POST /child-boxes/<DISPATCHED_id>/activate`. | HTTP 409. `"Cannot activate child box in DISPATCHED status"`. | API | |
| TC-API-CB-413 | Admin | CHILD_ACTIVATED transaction written on GENERATED→FREE | P1 | 1. Login as Admin. 2. Activate a GENERATED box. 3. Check `inventory_transactions`. | Row inserted: `transaction_type="CHILD_ACTIVATED"`, `child_box_id=<id>`. | Integration | Service: `INSERT INTO inventory_transactions` with `CHILD_ACTIVATED`. |
| TC-API-CB-414 | Admin | Activate non-existent box → 404 | P0 | 1. `POST /child-boxes/00000000-0000-0000-0000-000000000000/activate`. | HTTP 404. | API | Service: `getChildBoxById` throws NotFoundError. |

---

## Section 25 — Child Boxes: Get by ID (GET /child-boxes/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-500 | Admin | Admin gets child box by ID — 200 | P0 | 1. Login as Admin. 2. `GET /child-boxes/<CB_GENERATED_ID>`. | HTTP 200. `data.id=CB_GENERATED_ID`. `data.article_name`, `data.sku`, `data.size`, `data.colour` present (joined from products). | API | Service: JOIN products to return enriched data. |
| TC-API-CB-501 | Supervisor | Supervisor gets by ID — 200 | P0 | 1. Login as Supervisor. 2. Same GET. | HTTP 200. | API | |
| TC-API-CB-502 | Warehouse Operator | Warehouse Op gets by ID — 200 | P0 | 1. Login as Warehouse Op. 2. Same GET. | HTTP 200. | API | |
| TC-API-CB-503 | Dispatch Operator | Dispatch Op gets by ID — 200 | P0 | 1. Login as Dispatch Op. 2. Same GET. | HTTP 200. | API | |
| TC-API-CB-504 | Unauthenticated | Unauthenticated → 401 | P0 | 1. No token. | HTTP 401. | API | |
| TC-API-CB-510 | Admin | Non-existent UUID → 404 | P0 | 1. `GET /child-boxes/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Child box not found"`. | API | |
| TC-API-CB-511 | Admin | Invalid UUID format → 400 | P1 | 1. `GET /child-boxes/not-a-uuid`. | HTTP 400. `"Invalid child box ID format"`. | API | Zod `childBoxIdParamSchema`. |

---

## Section 26 — Child Boxes: Dead Delete Route

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CB-600 | Admin | DELETE /child-boxes/:id → 404 (no route registered) | P0 | 1. Login as Admin. 2. `DELETE /child-boxes/<CB_GENERATED_ID>`. | HTTP 404. No route matched. `child_boxes:delete` permission is seeded for Admin but no handler exists. | API | KNOWN DISCREPANCY: `child_boxes:delete` in seed but no DELETE route in `childBox.routes.ts`. Realizing spec: Track A A7 finding. Encode as documented dead-code behavior. |
| TC-API-CB-601 | Supervisor | DELETE /child-boxes/:id → 404 (no route) | P1 | 1. Login as Supervisor. 2. `DELETE /child-boxes/<CB_GENERATED_ID>`. | HTTP 404. | API | No route means no RBAC check — 404 before auth layer reaches the route. |
| TC-API-CB-602 | Unauthenticated | DELETE /child-boxes/:id → 404 (no route) | P1 | 1. No token. 2. `DELETE /child-boxes/<CB_GENERATED_ID>`. | HTTP 404. (Route not found before auth check.) | API | |

---

## Section 27 — Order-Sensitive Route Disambiguation

These TCs verify that literal sub-path routes are not incorrectly matched by the `/:id` dynamic segment. Router registers sub-paths first.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-PROD-950 | Admin | /products/bulk-upload/sample resolved as literal — not as /:id/upload/sample | P0 | 1. Login as Admin. 2. `GET /products/bulk-upload/sample`. | HTTP 200 with `text/csv`. NOT a 400 UUID parse error or 404. | API | Express router: `/bulk-upload/sample` registered before `/:id`. |
| TC-API-PROD-951 | Admin | /products/bulk-upload (POST) resolved as literal — not /:id | P0 | 1. Login as Admin. 2. `POST /products/bulk-upload` with valid CSV file. | HTTP 201 (or 400 "no file"). NOT a 400 UUID parse error. | API | |
| TC-API-PROD-952 | Admin | /products/bulk-size-range (POST) resolved as literal — not /:id | P0 | 1. Login as Admin. 2. `POST /products/bulk-size-range` with valid body. | HTTP 201. NOT a UUID error. | API | |
| TC-API-CB-950 | Admin | /child-boxes/bulk-upload/sample resolved as literal | P0 | 1. Login as Admin. 2. `GET /child-boxes/bulk-upload/sample`. | HTTP 200 CSV. NOT a UUID error. | API | |
| TC-API-CB-951 | Admin | /child-boxes/bulk-upload (POST) resolved as literal | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk-upload` with CSV. | HTTP 201 (or 400 "no file"). NOT a UUID error. | API | |
| TC-API-CB-952 | Admin | /child-boxes/bulk (POST) resolved as literal | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk` with valid body. | HTTP 201. NOT a UUID error. | API | |
| TC-API-CB-953 | Admin | /child-boxes/bulk-multi-size (POST) resolved as literal | P0 | 1. Login as Admin. 2. `POST /child-boxes/bulk-multi-size` with valid body. | HTTP 201. NOT a UUID error. | API | |
| TC-API-CB-954 | Admin | /child-boxes/free (GET) resolved as literal | P0 | 1. Login as Admin. 2. `GET /child-boxes/free`. | HTTP 200. NOT a UUID error. | API | |
| TC-API-CB-955 | Admin | /child-boxes/qr/:qrCode not shadowed by /:id | P0 | 1. Login as Admin. 2. `GET /child-boxes/qr/CB000001`. | HTTP 200 or 404. NOT a UUID format error (qrCode is not a UUID). | API | `/qr/:qrCode` registered before `/:id` in router. |

---

## Automation Guidance

The following tests require dedicated spec infrastructure and cannot be covered by a simple request check:

1. **AUTOMATION GAP — Casing normalization (TC-API-PROD-030 through 038, TC-API-PROD-410–412, TC-API-PROD-820–821):** These assert specific string transformations on stored values. Require fixture setup + GET after POST to verify stored value. Recommend a dedicated `casing-normalization.spec.ts` block.

2. **AUTOMATION GAP — Chunk-failure degrade path (TC-API-PROD-818):** Requires injecting a DB-level error (e.g. mock the pool or use a unique constraint violation mid-chunk). Recommend integration test with a seeded conflict.

3. **AUTOMATION GAP — Image propagation (TC-API-PROD-620):** Requires two products with same `article_code + colour`, upload image on one, verify the other's `image_url` changed. Straightforward with fixture setup but not covered by any existing spec.

4. **AUTOMATION GAP — Section referential non-delete (TC-API-SEC-411):** Verify products still reference deleted section name — simple follow-up GET.

5. **AUTOMATION GAP — Duplicate section name includes inactive (TC-API-SEC-012):** Requires deactivate then re-attempt create. Uncommon edge case; medium priority.

6. **AUTOMATION GAP — `active_sample_feet` populated (TC-API-CB-307):** Requires pre-creating a sample with a foot assignment. Recommend covering in phase-43 (Samples API) as an integration chain.

7. **AUTOMATION GAP — env-gated caps:** TC-API-PROD-813 (PRODUCT_CSV_MAX_ROWS) and TC-API-CB-050 (CHILD_BOX_MAX_PER_GENERATION) can only be tested at the 2000/1500 boundary if the test env sets the env var. Recommend adding `PRODUCT_CSV_MAX_ROWS=2000` and `CHILD_BOX_MAX_PER_GENERATION=1500` to the CI/test `.env` and authoring separate "live-cap" TCs to run in that environment.

8. **Stale spec to fix — `03-child-boxes.spec.ts`:** If this spec asserts WH Op cannot create child boxes, it is stale — WH Op holds `child_boxes:create`. Fix before CI.

---

## TC Count Summary

| Module | TC ID Range | Count |
|---|---|---|
| Products (TC-API-PROD-*) | 001–952 | 103 |
| Sections (TC-API-SEC-*) | 001–411 | 40 |
| Child Boxes (TC-API-CB-*) | 001–955 | 76 |
| **Total** | | **219** |

### Per-role breakdown

| Role | Positive (allowed) TCs | Negative (403/401) TCs |
|---|---|---|
| Admin | ~120 happy + validation | — (Admin bypasses all permission gates) |
| Supervisor | ~25 allowed | ~18 403s (products:delete, sections:writes, cb:activate not; Supervisor CAN activate) |
| Warehouse Operator | ~20 allowed (products read + cb create) | ~15 403s (product create/update/delete, sections writes, cb activate) |
| Dispatch Operator | ~15 allowed (products read, cb read, sample CSV) | ~20 403s (all writes except dispatch) |
| Unauthenticated | 0 | ~35 401s (one per endpoint) |

### Matrix discrepancies encoded as explicit TCs

| Discrepancy | TC(s) | Disposition |
|---|---|---|
| `sections:read` not seeded — GET /sections auth-only | TC-API-SEC-100–104 | Documented behavior; encoded as 200-for-all-roles |
| `child_boxes:delete` seeded but no DELETE route → 404 | TC-API-CB-600–602 | Dead code; encoded as 404 |
| GET /products, /child-boxes have no perm gate (auth-only) | TC-API-PROD-100–104, TC-API-CB-100–104, etc. | All 4 roles get 200; documented |
| WH Op holds `child_boxes:create` but NOT `child_boxes:update` (cannot activate) | TC-API-CB-402 | Intentional split; encoded as 403 |
| Section delete has no referential guard | TC-API-SEC-411 | Documented; no FK cascade |
| Duplicate section name includes inactive sections | TC-API-SEC-012 | Documented; service checks all rows |
| `qr_data_uri=""` for bulk-multi-size | TC-API-CB-054 | Known behavior; encoded |
| `/child-boxes/qr/:qrCode` returns `active_sample_feet` (side-effect-adjacent field) | TC-API-CB-307 | Documented; GET endpoint enriches response |
