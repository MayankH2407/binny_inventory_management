# Phase 15 — Stock Hierarchy & Inventory Drill-Down

**Module:** Inventory — 7-Level Drill-Down, Carton Hierarchy, CSV Export, Legacy Upload Button
**Suite version:** v3 (refreshed 2026-06-09)
**TC ID prefix:** `TC-STK-`
**Roles under test:** Admin · Supervisor · Warehouse Operator · Dispatch Operator · Unauthenticated
**Playwright specs:** `frontend/e2e/13-inventory.spec.ts`, `frontend/e2e/30-inventory-drilldown.spec.ts`, `frontend/e2e/34-mrp-and-carton-hierarchy.spec.ts`

---

## RBAC Split — Verified Against Code (Ground Truth)

**`backend/src/routes/inventory.routes.ts`** registers `router.use(authenticate)` at the top, then per-endpoint:

| Endpoint | Gate | Roles reaching 200 |
|---|---|---|
| `GET /inventory/dashboard` | `authenticate` only | All 4 |
| `GET /inventory/stock/summary` | `authenticate` only | All 4 |
| `GET /inventory/stock/hierarchy` | `authenticate` only | All 4 |
| `GET /inventory/cartons/hierarchy` | `authenticate` only | All 4 |
| `GET /inventory/breakdown` | `authenticate` only | All 4 |
| `GET /inventory/trace/:barcode` | `authenticate` only | All 4 |
| `GET /inventory/transactions` | `authorizePermission('inventory:read')` | **Admin only** (no other seeded role has `inventory:read`) |
| `GET /inventory/cartons/export` | `authorizePermission('inventory:read')` | **Admin only** |

**Frontend nav gate:** `NAV_ITEMS` sets `requiresPermission: 'inventory:read'` on the "Inventory" sidebar link (`constants/index.ts` line 79). Since `inventory:read` is held only by Admin in the seed, **non-Admin users do not see the Inventory nav link**. However, the `/inventory` page itself has NO server-side route guard — any authenticated user who navigates there directly (by URL) will reach the page and the API will return data (since the breakdown, hierarchy, and summary endpoints are auth-only).

**`LegacyUploadButton`** gates on `cartons:create` via `useCan('cartons:create')`. Roles with `cartons:create`: Admin, Supervisor, Warehouse Operator. Dispatch Operator does NOT have `cartons:create` → button is hidden.

**Matrix discrepancy documented:** The MASTER_TEST_PLAN.md matrix labels `inventory:read` as "transactions/export" and marks it Admin-only — **this matches the code**. The drill-down hierarchy pages (breakdown, stock/hierarchy, cartons/hierarchy) are auth-only — all four roles can access them via direct URL, but only Admin sees the sidebar link. Non-Admin roles reaching /inventory by URL is not blocked by the backend.

---

## Drill-Down Levels (verified from `InventoryDrillView.tsx` + `inventory.schema.ts`)

The **7-level drill-down** uses the `/inventory/breakdown` endpoint:

| Depth | URL segments | `level` param | What is shown |
|---|---|---|---|
| 0 | `/inventory` | `section` | All sections |
| 1 | `/inventory/{section}` | `category` | Categories within section |
| 2 | `/inventory/{section}/{category}` | `group` | Article groups within category |
| 3 | `/inventory/{section}/{category}/{group}` | `article` | Articles within group |
| 4 | `/inventory/{section}/{category}/{group}/{article}` | `colour` | Colours within article |
| 5 | `/inventory/{section}/{category}/{group}/{article}/{colour}` | `size_group` | Size groups |
| 6 (leaf) | `/inventory/{section}/{category}/{group}/{article}/{colour}/{size_group}` | `leaf` | Master cartons + loose stock tables |

Note: The older `/inventory/stock/hierarchy` endpoint (levels: section/article_name/mrp/colour/product) is a **separate, legacy API path** still wired and tested; it is NOT the main drill-down used by the current frontend. The frontend uses `/inventory/breakdown` exclusively.

---

## Table of Contents

1. [Section 1 — Stock Summary API (`/inventory/stock/summary`)](#section-1--stock-summary-api)
2. [Section 2 — Stock Hierarchy API (`/inventory/stock/hierarchy`) — Level Validation](#section-2--stock-hierarchy-api--level-validation)
3. [Section 3 — Stock Hierarchy — Section Level](#section-3--stock-hierarchy--section-level)
4. [Section 4 — Stock Hierarchy — Article Level](#section-4--stock-hierarchy--article-level)
5. [Section 5 — Stock Hierarchy — MRP Level (Conditional)](#section-5--stock-hierarchy--mrp-level-conditional)
6. [Section 6 — Stock Hierarchy — Colour Level](#section-6--stock-hierarchy--colour-level)
7. [Section 7 — Stock Hierarchy — Product (Leaf) Level](#section-7--stock-hierarchy--product-leaf-level)
8. [Section 8 — Inventory Breakdown API (`/inventory/breakdown`)](#section-8--inventory-breakdown-api)
9. [Section 9 — Breakdown — Non-Leaf Levels (section→size_group)](#section-9--breakdown--non-leaf-levels)
10. [Section 10 — Breakdown — Leaf Level](#section-10--breakdown--leaf-level)
11. [Section 11 — Breakdown — Legacy Carton Aggregation](#section-11--breakdown--legacy-carton-aggregation)
12. [Section 12 — RBAC: Auth-Only Endpoints (all 4 roles + Unauthenticated)](#section-12--rbac-auth-only-endpoints)
13. [Section 13 — RBAC: inventory:read Gated Endpoints](#section-13--rbac-inventoryread-gated-endpoints)
14. [Section 14 — Carton Hierarchy API (`/inventory/cartons/hierarchy`)](#section-14--carton-hierarchy-api)
15. [Section 15 — Carton Hierarchy — CSV Export](#section-15--carton-hierarchy--csv-export)
16. [Section 16 — Frontend E2E — Root /inventory Page](#section-16--frontend-e2e--root-inventory-page)
17. [Section 17 — Frontend E2E — 7-Level Drill-Down Navigation](#section-17--frontend-e2e--7-level-drill-down-navigation)
18. [Section 18 — Frontend E2E — Breadcrumbs](#section-18--frontend-e2e--breadcrumbs)
19. [Section 19 — Frontend E2E — Leaf View (Master Cartons + Loose Stock)](#section-19--frontend-e2e--leaf-view)
20. [Section 20 — Frontend E2E — Filters and Search](#section-20--frontend-e2e--filters-and-search)
21. [Section 21 — Frontend E2E — Legacy Upload Button](#section-21--frontend-e2e--legacy-upload-button)
22. [Section 22 — Frontend E2E — Inventory Nav Visibility Per Role](#section-22--frontend-e2e--inventory-nav-visibility-per-role)

---

## Section 1 — Stock Summary API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-001 | Admin | GET /inventory/stock/summary returns all required fields | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/stock/summary`. | HTTP 200. `data` contains: `totalProducts` (int ≥ 0), `totalPairsInStock` (FREE+PACKED), `totalPairsDispatched`, `totalChildBoxes`, `totalCartons` (ACTIVE+CLOSED only), `sections` (int), `articles` (int). All fields non-null non-negative integers. | API | Spec 13: `TC-INV-012`. `getStockSummary()` |
| TC-STK-002 | Admin | totalPairsInStock includes FREE and PACKED only | P0 | 1. Ensure boxes of every status exist. 2. DB: `SUM(quantity) FILTER (WHERE status IN ('FREE','PACKED'))` for active products. 3. `GET /stock/summary`. | `data.totalPairsInStock` = DB sum. GENERATED, SAMPLE, ECOMMERCE, DISPATCHED excluded. | Integration | AUTOMATION GAP: no spec asserts the exact DB-matching value |
| TC-STK-003 | Admin | totalCartons counts only ACTIVE + CLOSED master cartons | P0 | 1. Create cartons of all 4 statuses. 2. DB: `SELECT COUNT(*) FROM master_cartons WHERE status IN ('ACTIVE','CLOSED')`. 3. `GET /stock/summary`. | `data.totalCartons` = DB count. CREATED and DISPATCHED excluded. | Integration | AUTOMATION GAP |
| TC-STK-004 | Admin | totalChildBoxes excludes GENERATED boxes | P1 | 1. Generate GENERATED boxes (do not activate). 2. `GET /stock/summary`. Compare `totalChildBoxes`. | `totalChildBoxes` counts only FREE+PACKED+SAMPLE+ECOMMERCE+DISPATCHED boxes, not GENERATED. Service query: `COUNT(cb.id) FILTER (WHERE cb.status IN ($1,$2,$3,$4,$5))` where $1=FREE. | Integration | AUTOMATION GAP |
| TC-STK-005 | Admin | totalProducts counts only active products | P1 | 1. Create one active and one inactive product. 2. `GET /stock/summary`. | `totalProducts` reflects only `is_active = true` products. | Integration | |
| TC-STK-006 | Supervisor | Supervisor GET /stock/summary returns 200 | P0 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/stock/summary`. | HTTP 200. Auth-only endpoint — all authenticated roles pass. | API | Spec 34: confirms auth-only |
| TC-STK-007 | Warehouse Operator | Warehouse Operator GET /stock/summary returns 200 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/stock/summary`. | HTTP 200. Data returned. | API | |
| TC-STK-008 | Dispatch Operator | Dispatch Operator GET /stock/summary returns 200 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/stock/summary`. | HTTP 200. Data returned. | API | |
| TC-STK-009 | Unauthenticated | GET /stock/summary without auth returns 401 | P0 | 1. `GET /api/v1/inventory/stock/summary` with no Authorization header. | HTTP 401. | API | |

---

## Section 2 — Stock Hierarchy API — Level Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-010 | Admin | GET /inventory/stock/hierarchy?level=section returns section-level nodes | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/stock/hierarchy?level=section`. | HTTP 200. Array of objects each with: `name` (string), `key` (string), `totalPairs` (int), `inStock` (FREE pairs), `packed` (PACKED pairs), `dispatched` (DISPATCHED pairs), `childBoxCount` (int), `cartonCount` (int), `children` (distinct article_name count), `distinctMrpCount` (int). | API | Spec 13: TC-INV-012 |
| TC-STK-011 | Admin | level=article_name returns article-level nodes | P0 | 1. Authenticate as Admin. 2. `GET ?level=article_name`. | HTTP 200. Each node `name` = article_name, `children` = count of distinct colours, `distinctMrpCount` = count of distinct MRP values. | API | |
| TC-STK-012 | Admin | level=mrp returns MRP-bucket nodes | P0 | 1. Authenticate as Admin. 2. `GET ?level=mrp`. | HTTP 200. Each node `name` = "₹299" for integral, "₹299.50" for fractional. `key` = raw numeric string ("299.00"). Ordered by `p.mrp ASC`. | API | Spec 34: TC-MRP-002 |
| TC-STK-013 | Admin | level=colour returns colour-level nodes | P0 | 1. Authenticate as Admin. 2. `GET ?level=colour`. | HTTP 200. Each node `name` = colour string, `children` = count of distinct sizes. | API | |
| TC-STK-014 | Admin | level=product returns size/variant leaf nodes | P0 | 1. Authenticate as Admin. 2. `GET ?level=product`. | HTTP 200. Leaf nodes. `name` = "size - ₹MRP" using CASE WHEN floor. `key` = product UUID. `children` = 0. Ordered by `p.size::int ASC`. | API | Spec 34: TC-MRP-006 |
| TC-STK-015 | Admin | Invalid level value defaults to section level | P1 | 1. Authenticate as Admin. 2. `GET ?level=invalid_level`. | HTTP 200. Section-level data returned (controller fallback: `const stockLevel = validLevels.includes(level) ? level : 'section'`). | API | Controller line 44 |
| TC-STK-016 | Admin | Missing level param defaults to section level | P1 | 1. Authenticate as Admin. 2. `GET /stock/hierarchy` (no level param). | HTTP 200. Section-level data returned. | API | |
| TC-STK-017 | Unauthenticated | GET /stock/hierarchy without auth returns 401 | P0 | 1. `GET /api/v1/inventory/stock/hierarchy?level=section` without Authorization header. | HTTP 401. | API | |

---

## Section 3 — Stock Hierarchy — Section Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-020 | Admin | Section-level nodes list all sections with non-GENERATED boxes | P0 | 1. Authenticate as Admin. 2. Ensure products in sections "Hawaii" and "Classic" have non-GENERATED child boxes. 3. `GET ?level=section`. | Response includes nodes for "Hawaii" and "Classic". Each node's `totalPairs` = SUM of FREE+PACKED+SAMPLE+ECOMMERCE+DISPATCHED for that section. | API | |
| TC-STK-021 | Admin | Section node `children` = distinct article count within that section | P1 | 1. Create 3 products in section "Hawaii" with 3 distinct article_names, all with FREE boxes. 2. `GET ?level=section`. Find "Hawaii" node. | `children` = 3 (or more if other data exists). `childCountExpr = COUNT(DISTINCT p.article_name)`. | Integration | |
| TC-STK-022 | Admin | Section nodes ordered by total_pairs DESC | P1 | 1. Ensure "Hawaii" has more pairs than another section. 2. `GET ?level=section`. | "Hawaii" appears before the lower-pair section in the response array. `ORDER BY total_pairs DESC NULLS LAST`. | API | |
| TC-STK-023 | Admin | GENERATED boxes excluded from section-level aggregations | P0 | 1. Create GENERATED boxes (do NOT activate). 2. Record section `totalPairs` before. 3. `GET ?level=section` after creation. | `totalPairs` for the section does not increase. GENERATED status is not in the `WHERE status IN ($1,$2,$3,$4,$5)` filter (FREE,PACKED,SAMPLE,ECOMMERCE,DISPATCHED). | Integration | Spec 34: TC-MRP-007 |
| TC-STK-024 | Admin | Section node with no non-GENERATED boxes shows zero or absent | P2 | 1. Create a product in a new section "TestSectionEmpty"; generate child boxes but do NOT activate. 2. `GET ?level=section`. | "TestSectionEmpty" either does not appear or has `totalPairs = 0`. | API | LEFT JOIN may include it at 0 |

---

## Section 4 — Stock Hierarchy — Article Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-030 | Admin | Article-level nodes filtered by section | P0 | 1. `GET ?level=article_name&section=Hawaii`. | HTTP 200. All returned nodes have products in section "Hawaii". Articles from other sections absent. | API | |
| TC-STK-031 | Admin | Article node distinctMrpCount = 1 when all variants share one MRP | P0 | 1. Create article "CITY 01" with 2 size variants at MRP 299.00. Add FREE child boxes. 2. `GET ?level=article_name&section=<section>`. Find "CITY 01" node. | `distinctMrpCount = 1`. Frontend will skip the MRP level for this article. | Integration | Spec 34: TC-MRP-005 |
| TC-STK-032 | Admin | Article node distinctMrpCount > 1 when variants have different MRPs | P0 | 1. Create article "CITY 02" with size 6 at MRP 199 and size 7 at MRP 299. Add FREE boxes. 2. `GET ?level=article_name`. Find "CITY 02". | `distinctMrpCount = 2`. `children` = COUNT(DISTINCT p.colour). | Integration | Spec 34: TC-MRP-001 |
| TC-STK-033 | Admin | Section filter at article level excludes other sections | P1 | 1. Create articles in both "Hawaii" and "Classic". 2. `GET ?level=article_name&section=Hawaii`. | Only articles belonging to "Hawaii" returned. "Classic" articles absent. | API | |

---

## Section 5 — Stock Hierarchy — MRP Level (Conditional)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-040 | Admin | MRP level filtered by section + article_name returns only MRP buckets for that article | P0 | 1. Create article "CITY 02" in "Hawaii" with MRPs 199 and 299. 2. `GET ?level=mrp&section=Hawaii&article_name=CITY+02`. | HTTP 200. Exactly 2 nodes: one for ₹199, one for ₹299. Each has `totalPairs > 0` and `children` = count of distinct colours at that MRP. | API | Spec 34: TC-MRP-002 |
| TC-STK-041 | Admin | MRP level nodes ordered by MRP value ascending | P0 | 1. Article with MRPs 499, 199, 299. 2. `GET ?level=mrp&article_name=<article>`. | Nodes ordered 199 → 299 → 499. `ORDER BY p.mrp ASC`. | API | |
| TC-STK-042 | Admin | MRP node name renders ₹299 (no decimals) for integral MRP | P0 | 1. Product with `mrp = 299.00`. 2. `GET ?level=mrp`. | `name = "₹299"` (no ".00"). `key = "299.00"`. SQL: `CASE WHEN p.mrp = FLOOR(p.mrp) THEN '₹' || FLOOR(p.mrp)::text`. | API | |
| TC-STK-043 | Admin | MRP node name renders ₹299.50 (with decimals) for fractional MRP | P0 | 1. Product with `mrp = 299.50`. 2. `GET ?level=mrp`. | `name = "₹299.50"`. `key = "299.50"`. SQL: `ELSE '₹' || p.mrp::text` path. | API | |
| TC-STK-044 | Admin | GET colour level with mrp filter returns only colours at that MRP | P0 | 1. Article "CITY 02": Black at MRP 199, White at MRP 299. 2. `GET ?level=colour&section=Hawaii&article_name=CITY+02&mrp=299.00`. | Only "White" colour node appears. "Black" (MRP 199) absent. SQL: `p.mrp = $X::numeric`. | API | Spec 34: TC-MRP-003/004 |
| TC-STK-045 | Admin | Single-MRP article: GET colour level directly works (skip MRP step) | P0 | 1. Article "CITY 01" has 1 MRP. 2. `GET ?level=colour&section=Hawaii&article_name=CITY+01` (no mrp param). | HTTP 200. Colour nodes returned. Frontend skips MRP step because `distinctMrpCount === 1`. | API | |
| TC-STK-046 | Admin | Multi-MRP article: GET colour without mrp param returns all colours across all MRPs | P1 | 1. Article "CITY 02": Black at 199, White at 299. 2. `GET ?level=colour&article_name=CITY+02` (no mrp param). | HTTP 200. Both "Black" and "White" returned. | API | |
| TC-STK-047 | Admin | Product-level name "size - ₹MRP" uses CASE floor for integral MRP | P0 | 1. Product size="7", mrp=299.00. 2. `GET ?level=product&section=Hawaii&article_name=<name>&colour=<colour>`. | Node `name = "7 - ₹299"` (not "7 - ₹299.00"). SQL: `p.size || ' - ' || CASE WHEN p.mrp = FLOOR(p.mrp) THEN '₹' || FLOOR(p.mrp)::text ELSE '₹' || p.mrp::text END`. | API | Spec 34: TC-MRP-006 |
| TC-STK-048 | Admin | mrp filter with non-numeric value — no 500 error | P2 | 1. `GET ?level=colour&mrp=not-a-number`. | HTTP 200 empty array or HTTP 400 validation error. No HTTP 500. (DB cast `$X::numeric` with invalid string may throw — ensure caught gracefully.) | API | Potential unhandled edge case |

---

## Section 6 — Stock Hierarchy — Colour Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-050 | Admin | Colour level filtered by section + article_name returns correct colours | P0 | 1. Article "CITY 01" has colours "Black" and "Tan". 2. `GET ?level=colour&section=Hawaii&article_name=CITY+01`. | HTTP 200. "Black" and "Tan" nodes. Colours from other articles absent. Each `children` = COUNT(DISTINCT p.size). | API | |
| TC-STK-051 | Admin | Colour node totalPairs = FREE+PACKED+SAMPLE+ECOMMERCE+DISPATCHED (GENERATED excluded) | P0 | 1. Article "CITY 01" colour "Black": 5 FREE boxes, 3 PACKED boxes, 2 SAMPLE boxes, 1 GENERATED box. 2. `GET ?level=colour&article_name=CITY+01`. | "Black" node `totalPairs` = sum quantities for FREE+PACKED+SAMPLE = pairs for those 10 boxes (assuming quantity=1 each → 10). GENERATED excluded. `inStock` = FREE pairs, `packed` = PACKED pairs. | Integration | |
| TC-STK-052 | Admin | Colour level with mrp filter returns only colours at that MRP | P1 | 1. Article "CITY 02": Black at MRP 199, White at MRP 299. 2. `GET ?level=colour&section=Hawaii&article_name=CITY+02&mrp=199.00`. | Only "Black" colour returned. | API | |

---

## Section 7 — Stock Hierarchy — Product (Leaf) Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-060 | Admin | Product level returns size+variant leaf nodes ordered by size ascending | P0 | 1. Article "CITY 01", colour "Black", sizes 6/7/8 at MRP 299. 2. `GET ?level=product&section=Hawaii&article_name=CITY+01&colour=Black`. | Nodes ordered: size 6, size 7, size 8. Names: "6 - ₹299", "7 - ₹299", "8 - ₹299". `children = 0`. `ORDER BY p.size::int`. | API | |
| TC-STK-061 | Admin | Product level with no matching filter returns empty array | P1 | 1. `GET ?level=product&section=NonExistentSection_XYZ`. | HTTP 200. Empty array `[]`. No 500. | API | |
| TC-STK-062 | Admin | Product node `key` = product UUID | P1 | 1. `GET ?level=product&article_name=<article>&colour=<colour>`. 2. Inspect `key` field. | `key` is a valid UUID string (matches `p.id::text`). `groupCol = 'p.id'`. | API | |

---

## Section 8 — Inventory Breakdown API

> This is the **primary API used by the current frontend drill-down**. Endpoint: `GET /api/v1/inventory/breakdown`.
> Schema validated via `inventoryBreakdownQuerySchema` (Zod): requires `level` ∈ `['section','category','group','article','colour','size_group','leaf']` and `path[]` fields per level's path requirements.
> **In-warehouse definition:** PACKED boxes in a non-DISPATCHED carton + FREE loose boxes with no active mapping. GENERATED, SAMPLE, ECOMMERCE, DISPATCHED are excluded.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-100 | Admin | GET /inventory/breakdown?level=section returns section items | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/breakdown?level=section`. | HTTP 200. `data.items` is an array. Each item has: `value` (string), `pieces` (int), `child_box_count` (int), `master_carton_count` (int), `loose_child_box_count` (int), `legacy_carton_count` (int ≥ 0). | API | Spec 30: TC-DRILL-001 |
| TC-STK-101 | Admin | GET /inventory/breakdown missing required path fields returns 400 | P0 | 1. Authenticate as Admin. 2. `GET /breakdown?level=category` (missing `path[section]`). | HTTP 400. Zod validation error. Message includes missing path fields. | API | Schema `refine()` in `inventoryBreakdownQuerySchema` |
| TC-STK-102 | Admin | GET /inventory/breakdown?level=leaf missing any path field returns 400 | P0 | 1. `GET /breakdown?level=leaf` (no path fields). | HTTP 400. Error: `level="leaf" requires path fields: section, category, group, article, colour, size_group`. | API | |
| TC-STK-103 | Admin | Invalid level value returns 400 | P1 | 1. `GET /breakdown?level=unknown_level`. | HTTP 400. Zod enum validation error. | API | |
| TC-STK-104 | Supervisor | Supervisor GET /breakdown?level=section returns 200 | P0 | 1. Authenticate as Supervisor. 2. `GET /breakdown?level=section`. | HTTP 200. Data returned. Auth-only endpoint. | API | |
| TC-STK-105 | Warehouse Operator | Warehouse Operator GET /breakdown?level=section returns 200 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /breakdown?level=section`. | HTTP 200. Data returned. | API | |
| TC-STK-106 | Dispatch Operator | Dispatch Operator GET /breakdown?level=section returns 200 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /breakdown?level=section`. | HTTP 200. Data returned. | API | |
| TC-STK-107 | Unauthenticated | GET /breakdown without auth returns 401 | P0 | 1. `GET /api/v1/inventory/breakdown?level=section` without Authorization header. | HTTP 401. | API | |

---

## Section 9 — Breakdown — Non-Leaf Levels

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-110 | Admin | Breakdown level=category requires path[section] | P0 | 1. `GET /breakdown?level=category&path[section]=Hawaii`. | HTTP 200. Items are categories within "Hawaii". Each item `value` = category string (e.g. "Gents", "Ladies"). | API | Spec 30: TC-DRILL-001 depth=1 |
| TC-STK-111 | Admin | Breakdown level=group returns article groups within category | P0 | 1. `GET /breakdown?level=group&path[section]=Hawaii&path[category]=Gents`. | HTTP 200. Items are article groups (e.g. "Premium", "(Ungrouped)" for null `article_group`). `(Ungrouped)` appears when `article_group IS NULL`. SQL: `COALESCE(p.article_group, '')` + empty string → frontend renders "(Ungrouped)". | API | Spec 30: TC-DRILL-005 |
| TC-STK-112 | Admin | Breakdown level=article returns articles within group | P0 | 1. `GET /breakdown?level=article&path[section]=Hawaii&path[category]=Gents&path[group]=Premium`. | HTTP 200. Items are articles (article_name values). Each item includes `pieces` = PACKED-in-carton + FREE-loose. | API | Spec 30: TC-DRILL-001 depth=3 |
| TC-STK-113 | Admin | Breakdown level=colour returns colours within article | P0 | 1. `GET /breakdown?level=colour&path[section]=Hawaii&path[category]=Gents&path[group]=Premium&path[article]=<article>`. | HTTP 200. Items are colour strings. | API | Spec 30: TC-DRILL-001 depth=4 |
| TC-STK-114 | Admin | Breakdown level=size_group returns size groups within colour | P0 | 1. `GET /breakdown?level=size_group&path[section]=Hawaii&path[category]=Gents&path[group]=Premium&path[article]=<article>&path[colour]=Black`. | HTTP 200. Items are size_group strings (reconstructed as "size_from-size_to" or "size_from" if size_from = size_to). | API | Spec 30: TC-DRILL-001 depth=5; SQL: `COALESCE(p.size_from,'') || CASE WHEN p.size_to IS NOT NULL AND p.size_to != p.size_from THEN '-' || p.size_to ELSE '' END` |
| TC-STK-115 | Admin | pieces = PACKED-in-non-dispatched-carton + FREE-loose-no-mapping (GENERATED excluded) | P0 | 1. For a product: create 3 PACKED boxes in ACTIVE carton, 2 FREE loose boxes, 1 GENERATED box. 2. `GET /breakdown?level=section` (or any level covering that product). | `pieces` for the item = (3×packed_qty + 2×free_qty). GENERATED box not counted. SAMPLE/ECOMMERCE/DISPATCHED boxes not counted. | Integration | Core correctness rule |
| TC-STK-116 | Admin | master_carton_count = distinct non-DISPATCHED cartons with PACKED boxes | P1 | 1. Article in 2 ACTIVE cartons + 1 CLOSED carton + 1 DISPATCHED carton. 2. `GET /breakdown?level=article&...`. | `master_carton_count` = 3 (2 ACTIVE + 1 CLOSED). DISPATCHED carton excluded. SQL: `COUNT(DISTINCT CASE WHEN cb.status = 'PACKED' THEN mc.id ELSE NULL END)` where `mc.status != 'DISPATCHED'`. | Integration | |
| TC-STK-117 | Admin | loose_child_box_count = FREE boxes with no active carton mapping | P1 | 1. Create 4 FREE boxes: 2 packed into a carton (active mapping), 2 unpackaged (no mapping). 2. `GET /breakdown?level=article&...`. | `loose_child_box_count` = 2 (the ones with no `carton_child_mapping.is_active = true` row). | Integration | |
| TC-STK-118 | Admin | Items ordered by pieces DESC NULLS LAST | P1 | 1. Create items with varying piece counts. 2. `GET /breakdown?level=section`. | Items returned with highest `pieces` first. | API | |
| TC-STK-119 | Admin | Empty path returns no error (level=section with no path) | P1 | 1. `GET /breakdown?level=section` (empty path). | HTTP 200. `data.items` array (possibly empty if no products). No 500. | API | |
| TC-STK-120 | Admin | (Ungrouped) bucket visible when article_group is null/empty | P1 | 1. Create a product with `article_group = NULL`. Activate boxes. 2. `GET /breakdown?level=group&path[section]=<section>&path[category]=<cat>`. | An item with `value = ""` or `value = ""` appears (SQL: `COALESCE(p.article_group, '')`). Frontend renders this as "(Ungrouped)". | API | Spec 30: TC-DRILL-005 |

---

## Section 10 — Breakdown — Leaf Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-130 | Admin | GET /breakdown?level=leaf returns master_cartons + loose_stock arrays | P0 | 1. `GET /breakdown?level=leaf&path[section]=Hawaii&path[category]=Gents&path[group]=Premium&path[article]=<article>&path[colour]=Black&path[size_group]=<size_group>`. | HTTP 200. `data` has `master_cartons` (array) and `loose_stock` (array). | API | Spec 30: TC-DRILL-001 depth=6 |
| TC-STK-131 | Admin | Leaf master_cartons item shape | P0 | 1. GET leaf with at least one PACKED carton for the path. | Each `master_cartons` item has: `master_carton_id` (UUID), `carton_barcode` (string), `child_box_count` (int), `pieces` (int), `mrp` (number), `status` (string, not DISPATCHED), `size_breakdown` (array of `{size, pairs, box_count}`). | API | |
| TC-STK-132 | Admin | Leaf loose_stock item shape | P0 | 1. GET leaf with at least one FREE loose box. | Each `loose_stock` item has: `child_box_id` (UUID), `barcode` (string), `pieces` (int), `mrp` (number), `size` (string). | API | Spec 30: TC-DRILL-007 |
| TC-STK-133 | Admin | Leaf master_cartons exclude DISPATCHED cartons | P0 | 1. A size_group path has 1 ACTIVE carton and 1 DISPATCHED carton. 2. GET leaf. | Only the ACTIVE carton appears in `master_cartons`. DISPATCHED carton excluded (`WHERE mc.status != 'DISPATCHED'`). | Integration | |
| TC-STK-134 | Admin | Leaf size_breakdown ordered by size ascending (numeric) | P1 | 1. Carton has boxes of sizes 6, 8, 7. 2. GET leaf. | `size_breakdown` for that carton ordered: size "6", "7", "8". SQL: `ORDER BY CASE WHEN bs.size ~ '^[0-9]+$' THEN bs.size::int ELSE 9999 END, bs.size`. | API | Spec 30: TC-DRILL-003 |
| TC-STK-135 | Admin | Leaf size pill format: "size×pairs" | P0 | 1. Carton has 2 boxes of size 7 (each quantity 6). 2. GET leaf. 3. Frontend leaf view renders. | In `size_breakdown`, entry for size "7" has `pairs = 12`, `box_count = 2`. Frontend renders pill as "7×12" with tooltip "Size 7: 12 pairs across 2 boxes". | E2E | Spec 30: TC-DRILL-003 |
| TC-STK-136 | Admin | Leaf loose_stock ordered by size ascending then by created_at DESC | P1 | 1. Loose FREE boxes of sizes 6, 9, 7. 2. GET leaf. | `loose_stock` ordered: size 6, size 7, size 9. SQL: `ORDER BY CASE WHEN p.size ~ '^[0-9]+$' THEN p.size::int ELSE 9999 END, p.size, cb.created_at DESC`. | API | |
| TC-STK-137 | Admin | Leaf both-empty returns empty arrays (no 404) | P1 | 1. GET leaf for a path with no stock at all. | HTTP 200. `data.master_cartons = []`, `data.loose_stock = []`. No 404 or 500. | API | |

---

## Section 11 — Breakdown — Legacy Carton Aggregation

> Legacy cartons (`master_cartons.is_legacy = true`) are opaque count-level records created by CSV upload. They appear only at section/category/group breakdown levels; not at article/colour/size_group/leaf.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-140 | Admin | legacy_carton_count is populated at section level when legacy cartons exist | P0 | 1. Ensure at least 1 legacy carton exists for section "Hawaii". 2. `GET /breakdown?level=section`. Find "Hawaii" item. | `legacy_carton_count` > 0 for "Hawaii". Other section items may have `legacy_carton_count = 0`. | Integration | A23 covers legacy CSV upload itself |
| TC-STK-141 | Admin | legacy_carton_count = 0 at article level (legacy aggregation skipped) | P1 | 1. Legacy cartons exist for section "Hawaii". 2. `GET /breakdown?level=article&path[section]=Hawaii&path[category]=Gents&path[group]=Premium`. | `legacy_carton_count = 0` for all items. Legacy aggregation only runs for `legacyApplicableLevels = ['section','category','group']`. | API | Code: `if (legacyApplicableLevels.includes(level) && !pathHasArticleOrColour)` |
| TC-STK-142 | Admin | legacy_carton_count = 0 when path already has article or colour filter | P1 | 1. Legacy cartons exist for "Hawaii". 2. `GET /breakdown?level=section&path[colour]=Black`. | `legacy_carton_count = 0`. Code: `pathHasArticleOrColour = (path.article !== undefined && path.article !== '') || (path.colour !== undefined)`. Legacy query skipped. | API | |
| TC-STK-143 | Admin | Synthetic items appended for legacy-only values | P1 | 1. Legacy carton exists for section "ZLegacyOnly" but no regular products exist for that section. 2. `GET /breakdown?level=section`. | "ZLegacyOnly" appears in items (as a synthetic item) with `pieces = 0`, `child_box_count = 0`, `legacy_carton_count > 0`. | Integration | Code: "Append synthetic items for legacy-only values" |
| TC-STK-144 | Admin | legacy_size_groups populated at group level only | P1 | 1. Legacy carton at group level has `size_group` populated (e.g. "6-10"). 2. `GET /breakdown?level=group&path[section]=Hawaii&path[category]=Gents`. | The matching item has `legacy_size_groups` array with entries `{size_group: "6-10", carton_count: N}`. | Integration | Code: `if (level === 'group' && legacySizeGroupMap && legacyCount > 0)` |
| TC-STK-145 | Admin | Frontend renders legacy_carton_count badge in count line | P1 | 1. Log in as Admin. 2. Navigate to `/inventory` (has legacy cartons). | Amber badge visible: "N legacy cartons". Appears inline in the count paragraph: `legacyTotal > 0 ? <span>...{legacyTotal} legacy carton(s)</span>`. | E2E | AUTOMATION GAP: no spec covers legacy badge |

---

## Section 12 — RBAC: Auth-Only Endpoints

> Verified: dashboard, stock/summary, stock/hierarchy, cartons/hierarchy, breakdown, trace are all `authenticate`-only. All 4 roles and Unauthenticated covered below.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-200 | Admin | Admin GET /inventory/dashboard returns 200 | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/dashboard`. | HTTP 200. Response includes `totalChildBoxes`, `totalMasterCartons`, `todayDispatches`, etc. | API | |
| TC-STK-201 | Supervisor | Supervisor GET /inventory/dashboard returns 200 | P0 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/dashboard`. | HTTP 200. Data returned. | API | |
| TC-STK-202 | Warehouse Operator | Warehouse Operator GET /inventory/dashboard returns 200 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/dashboard`. | HTTP 200. Data returned. | API | |
| TC-STK-203 | Dispatch Operator | Dispatch Operator GET /inventory/dashboard returns 200 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/dashboard`. | HTTP 200. Data returned. | API | |
| TC-STK-204 | Unauthenticated | GET /inventory/dashboard without auth returns 401 | P0 | 1. `GET /api/v1/inventory/dashboard` — no Authorization header. | HTTP 401. | API | |
| TC-STK-205 | Supervisor | Supervisor GET /inventory/cartons/hierarchy returns 200 | P0 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/cartons/hierarchy?level=status`. | HTTP 200. Data returned. Auth-only endpoint — not gated by `inventory:read`. | API | |
| TC-STK-206 | Warehouse Operator | Warehouse Operator GET /inventory/cartons/hierarchy returns 200 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/cartons/hierarchy?level=status`. | HTTP 200. Data returned. | API | |
| TC-STK-207 | Dispatch Operator | Dispatch Operator GET /inventory/cartons/hierarchy returns 200 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/cartons/hierarchy?level=status`. | HTTP 200. Data returned. | API | |
| TC-STK-208 | Unauthenticated | GET /inventory/cartons/hierarchy without auth returns 401 | P0 | 1. `GET /api/v1/inventory/cartons/hierarchy?level=status` — no auth. | HTTP 401. | API | |
| TC-STK-209 | Supervisor | Supervisor GET /inventory/trace/:barcode returns 200 | P1 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/trace/<valid_barcode>`. | HTTP 200. Trace result returned. Auth-only. | API | |
| TC-STK-210 | Warehouse Operator | Warehouse Operator GET /inventory/trace/:barcode returns 200 | P1 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/trace/<valid_barcode>`. | HTTP 200. | API | |
| TC-STK-211 | Dispatch Operator | Dispatch Operator GET /inventory/trace/:barcode returns 200 | P1 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/trace/<valid_barcode>`. | HTTP 200. | API | |
| TC-STK-212 | Unauthenticated | GET /inventory/trace/:barcode without auth returns 401 | P0 | 1. `GET /api/v1/inventory/trace/CB000001` — no auth. | HTTP 401. | API | |

---

## Section 13 — RBAC: inventory:read Gated Endpoints

> `inventory:read` is in the seed only for Admin (verified in `001_roles.ts`). Supervisor, Warehouse Operator, and Dispatch Operator do NOT hold `inventory:read`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-220 | Admin | Admin GET /inventory/transactions returns 200 | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/transactions`. | HTTP 200. Paginated `data` array + total. | API | `authorizePermission('inventory:read')` — Admin is super-admin bypass |
| TC-STK-221 | Supervisor | Supervisor GET /inventory/transactions returns 403 | P0 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/transactions`. | HTTP 403. Error: "Required permission: inventory:read". Supervisor seed has no `inventory:read` row. | API | Key RBAC discrepancy documented |
| TC-STK-222 | Warehouse Operator | Warehouse Operator GET /inventory/transactions returns 403 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | |
| TC-STK-223 | Dispatch Operator | Dispatch Operator GET /inventory/transactions returns 403 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | |
| TC-STK-224 | Unauthenticated | GET /inventory/transactions without auth returns 401 | P0 | 1. `GET /api/v1/inventory/transactions` — no auth. | HTTP 401 (authenticate middleware runs before authorizePermission). | API | |
| TC-STK-225 | Admin | Admin GET /inventory/cartons/export returns 200 (CSV) | P0 | 1. Authenticate as Admin. 2. `GET /api/v1/inventory/cartons/export?level=status`. | HTTP 200. `Content-Type: text/csv`. | API | `authorizePermission('inventory:read')` |
| TC-STK-226 | Supervisor | Supervisor GET /inventory/cartons/export returns 403 | P0 | 1. Authenticate as Supervisor. 2. `GET /api/v1/inventory/cartons/export?level=section`. | HTTP 403. Supervisor has no `inventory:read` in seed. | API | Spec 34: TC-CART-CSV-004 (uses WH Op — same principle) |
| TC-STK-227 | Warehouse Operator | Warehouse Operator GET /inventory/cartons/export returns 403 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /api/v1/inventory/cartons/export?level=section`. | HTTP 403. | API | Spec 34: TC-CART-CSV-004 |
| TC-STK-228 | Dispatch Operator | Dispatch Operator GET /inventory/cartons/export returns 403 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /api/v1/inventory/cartons/export?level=status`. | HTTP 403. | API | |
| TC-STK-229 | Unauthenticated | GET /inventory/cartons/export without auth returns 401 | P0 | 1. `GET /api/v1/inventory/cartons/export?level=status` — no auth. | HTTP 401. | API | |

---

## Section 14 — Carton Hierarchy API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-300 | Admin | GET /cartons/hierarchy?level=status returns all status nodes | P0 | 1. Authenticate as Admin. Ensure cartons of all 4 statuses exist. 2. `GET /api/v1/inventory/cartons/hierarchy?level=status`. | HTTP 200. `data` array with up to 4 nodes. Each node: `name` (status string), `key` (same), `cartonCount` (int ≥ 1), `childBoxCount` (int), `avgUtilization` (int 0–100). No `meta` for non-leaf levels. | API | Spec 34: TC-CART-001/002 |
| TC-STK-301 | Admin | Status nodes ordered CREATED→ACTIVE→CLOSED→DISPATCHED | P0 | 1. Ensure all 4 status cartons exist. 2. `GET ?level=status`. | `data[0].name = 'CREATED'`, `data[1].name = 'ACTIVE'`, `data[2].name = 'CLOSED'`, `data[3].name = 'DISPATCHED'`. ORDER BY CASE expression. | API | Spec 34: TC-CART-002 confirms ACTIVE present |
| TC-STK-302 | Admin | GET ?level=status&section=Hawaii returns only sections with Hawaii boxes | P1 | 1. `GET ?level=status&section=Hawaii`. | Only status nodes for cartons containing at least one Hawaii box. Join: `carton_child_mapping → child_boxes → products` with `p.section = 'Hawaii'`. | API | |
| TC-STK-303 | Admin | GET ?level=section returns section nodes with status breakdown counts | P0 | 1. `GET ?level=section`. | Each node: `name`, `key`, `cartonCount`, `createdCount`, `activeCount`, `closedCount`, `dispatchedCount`, `childBoxCount`, `totalPairs`. All non-negative ints. Ordered alphabetically by `p.section`. | API | Spec 34: TC-CART-003 |
| TC-STK-304 | Admin | GET ?level=section&status=CLOSED filters to CLOSED-only carton sections | P0 | 1. `GET ?level=section&status=CLOSED`. | Sections returned contain at least one CLOSED carton. `closedCount` = `cartonCount` (since filter restricts to CLOSED only). | API | |
| TC-STK-305 | Admin | Mixed-article carton counted once per section via COUNT(DISTINCT mc.id) | P1 | 1. Carton X has boxes from "Hawaii" and "Classic". 2. `GET ?level=section`. | Both "Hawaii" and "Classic" nodes show carton X in `cartonCount` (each ≥ 1). Carton is not double-counted within a single section. | Integration | Spec 34: TC-CART-022 logic |
| TC-STK-306 | Admin | GET ?level=article_name returns article nodes with primary_section | P0 | 1. `GET ?level=article_name`. | Each node: `name`, `key`, `cartonCount`, `createdCount`, `activeCount`, `closedCount`, `dispatchedCount`, `childBoxCount`, `totalPairs`, `primary_section`. | API | Spec 34: TC-CART-004 |
| TC-STK-307 | Admin | GET ?level=article_name&status=ACTIVE&section=Hawaii filters correctly | P0 | 1. `GET ?level=article_name&status=ACTIVE&section=Hawaii`. | Only articles in "Hawaii" appearing in ACTIVE cartons. | API | Spec 34: TC-CART-004 |
| TC-STK-308 | Admin | GET ?level=carton returns paginated carton list with meta | P0 | 1. `GET ?level=carton`. | HTTP 200. Response has `data` (array) and `meta` (`{page, limit, total, totalPages}`). Default page=1, limit=50. Each item: `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `created_at`, `primary_section`, `primary_article`. | API | Spec 34: TC-CART-005 |
| TC-STK-309 | Admin | Carton leaf primary_article = most-frequent article in carton | P0 | 1. Carton X: 5 boxes of Article A (Hawaii), 2 boxes of Article B (Classic). 2. `GET ?level=carton`. Find carton X. | `primary_article = 'Article A'`. `primary_section = 'Hawaii'`. LATERAL subquery `ORDER BY cnt DESC LIMIT 1`. | Integration | Spec 34: TC-CART-006 |
| TC-STK-310 | Admin | Carton leaf pagination: page 2 returns different cartons | P1 | 1. Ensure >50 cartons exist. 2. `GET ?level=carton&page=1&limit=50`. Note last barcode. 3. `GET ?level=carton&page=2&limit=50`. | Page 2 `data` differs from page 1. `meta.total` consistent. | API | Spec 34: TC-CART-008 |
| TC-STK-311 | Admin | Carton leaf search filter by barcode substring | P0 | 1. Note a carton barcode "MC-00042". 2. `GET ?level=carton&search=MC-00042`. | `data` contains only cartons with barcode ILIKE '%MC-00042%'. `meta.total` reflects filtered count. | API | |
| TC-STK-312 | Admin | Carton leaf with status=CLOSED filter returns only CLOSED cartons | P0 | 1. `GET ?level=carton&status=CLOSED`. | All items in `data` have `status = 'CLOSED'`. | API | |
| TC-STK-313 | Admin | Invalid level at cartons/hierarchy defaults to status level | P1 | 1. `GET /cartons/hierarchy?level=unknown`. | HTTP 200. Zod enum validation will reject unknown. Expect HTTP 400 validation error (schema: `z.enum(['status','section','article_name','carton'])`). | API | `cartonHierarchyQuerySchema` enforces enum |
| TC-STK-314 | Admin | Empty filter combo returns empty data array | P1 | 1. `GET ?level=section&status=ACTIVE&section=NONEXISTENT_XYZ`. | HTTP 200. `data = []`. No 500. | API | Spec 34: TC-CART-007 |
| TC-STK-315 | Admin | cartons/hierarchy carton leaf closed_at/dispatched_at null for ACTIVE cartons | P1 | 1. `GET ?level=carton&status=ACTIVE`. Inspect first item. | `closed_at = null`, `dispatched_at = null`. `created_at` is non-null timestamp. | API | |

---

## Section 15 — Carton Hierarchy — CSV Export

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-350 | Admin | GET /cartons/export?level=status returns 5-column CSV | P0 | 1. `GET /api/v1/inventory/cartons/export?level=status`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="carton-hierarchy-status-YYYY-MM-DD.csv"`. Header: `"Status","Carton Count","Child Boxes","Total Pairs","Avg Utilization %"`. 5 columns. | API | Spec 34: TC-CART-CSV-003 |
| TC-STK-351 | Admin | GET /cartons/export?level=section returns 8-column CSV | P0 | 1. `GET /cartons/export?level=section`. | CSV header: `"Section","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"`. 8 columns. | API | Spec 34: TC-CART-CSV-001 |
| TC-STK-352 | Admin | GET /cartons/export?level=article_name returns 9-column CSV | P0 | 1. `GET /cartons/export?level=article_name`. | CSV header: `"Section","Article","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"`. 9 columns. | API | |
| TC-STK-353 | Admin | GET /cartons/export?level=carton returns 10-column CSV with primary section/article | P0 | 1. `GET /cartons/export?level=carton`. | CSV header: `"Carton Barcode","Status","Section (Primary)","Article (Primary)","Child Count","Max Capacity","Utilization %","Created At","Closed At","Dispatched At"`. 10 columns. | API | Spec 34: TC-CART-CSV-002 |
| TC-STK-354 | Admin | CSV filename date matches today | P1 | 1. `GET /cartons/export?level=status`. 2. Check Content-Disposition header. | Filename = `carton-hierarchy-status-<YYYY-MM-DD>.csv` where date = today. `new Date().toISOString().slice(0,10)`. | API | |
| TC-STK-355 | Admin | CSV export with filters applied | P1 | 1. `GET /cartons/export?level=section&status=ACTIVE`. | CSV contains only sections with ACTIVE cartons. Header row still 8 columns. | API | |
| TC-STK-356 | Supervisor | Supervisor GET /cartons/export returns 403 | P0 | 1. Authenticate as Supervisor. 2. `GET /cartons/export?level=section`. | HTTP 403. `inventory:read` not in Supervisor seed. | API | |
| TC-STK-357 | Warehouse Operator | Warehouse Operator GET /cartons/export returns 403 | P0 | 1. Authenticate as Warehouse Operator. 2. `GET /cartons/export?level=status`. | HTTP 403. | API | Spec 34: TC-CART-CSV-004 |
| TC-STK-358 | Dispatch Operator | Dispatch Operator GET /cartons/export returns 403 | P0 | 1. Authenticate as Dispatch Operator. 2. `GET /cartons/export?level=status`. | HTTP 403. | API | |
| TC-STK-359 | Unauthenticated | GET /cartons/export without auth returns 401 | P0 | 1. `GET /api/v1/inventory/cartons/export?level=status` — no auth. | HTTP 401. | API | |

---

## Section 16 — Frontend E2E — Root /inventory Page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E001 | Admin | /inventory page loads with heading and section cards | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Wait for networkidle. | `<h1>Inventory</h1>` visible. Description below heading visible. Section cards appear (links with "pieces" text). No error state. | E2E | Spec 13: TC-INV-001; spec 30: TC-DRILL-001 |
| TC-STK-E002 | Admin | Summary cards render above the drill grid | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. | `InventorySummaryCards` renders. At depth=0 it fetches `/inventory/stock/summary`. Cards show "Pairs in Stock", "Pairs Dispatched", "Child Boxes", "Active Cartons" (or equivalent computed from items). | E2E | `InventorySummaryCards` component; spec 13: TC-INV-001 |
| TC-STK-E003 | Admin | Count line shows "N items • N pieces total" | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. Wait for data. | Count line renders: "N items • N pieces total" (localized). If legacy cartons exist, amber badge "N legacy cartons" also appears. | E2E | `DrillDownView` count paragraph |
| TC-STK-E004 | Admin | Search bar is visible at root level | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. | `InventorySearchBar` textbox with placeholder "Search inventory" (or similar) visible above the card grid. | E2E | Spec 30: TC-DRILL-006 |
| TC-STK-E005 | Admin | Filter chips "Stock > 0" and "Low stock" visible | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. | Two filter chips rendered: "Stock > 0" (TrendingUp icon) and "Low stock" (AlertTriangle icon). Both in inactive state by default. | E2E | `InventoryFilters` component; spec 30: TC-DRILL-004 |
| TC-STK-E006 | Admin | Refresh button re-fetches data | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Click RefreshCw / "Refresh" button. | Data reloads. Spinner shown during fetch. Spec 13 describes: `getByTitle('Refresh')`. | E2E | Spec 13: TC-INV-010 |
| TC-STK-E007 | Admin | Loading skeleton shows 8 cards during data fetch | P1 | 1. Log in as Admin. 2. Navigate to `/inventory` with network throttled. | 8 `SkeletonCard` components visible while data is fetching. | E2E | `LoadingSkeleton` renders 8 cards |
| TC-STK-E008 | Admin | Error state shown when breakdown API fails | P1 | 1. Log in as Admin. 2. Mock breakdown API to return 500. 3. Navigate to `/inventory`. | `AlertCircle` icon and "Failed to load inventory" message rendered. API error message shown below. | E2E | AUTOMATION GAP: no spec covers error state |

---

## Section 17 — Frontend E2E — 7-Level Drill-Down Navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E010 | Admin | Depth 0→1: clicking section card navigates to /inventory/{section} | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Click a section card (e.g. "Hawaii"). | URL changes to `/inventory/Hawaii`. Category cards appear. Count line resets. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E011 | Admin | Depth 1→2: clicking category card navigates to /inventory/{section}/{category} | P0 | 1. At `/inventory/Hawaii`. 2. Click "Gents" card. | URL = `/inventory/Hawaii/Gents`. Article group cards appear. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E012 | Admin | Depth 2→3: clicking group card navigates to /inventory/{section}/{category}/{group} | P0 | 1. At `/inventory/Hawaii/Gents`. 2. Click "Premium" card. | URL = `/inventory/Hawaii/Gents/Premium`. Article cards appear. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E013 | Admin | Depth 3→4: clicking article card navigates to /inventory/{section}/{category}/{group}/{article} | P0 | 1. At depth 3. 2. Click an article card. | URL = `/inventory/Hawaii/Gents/Premium/{article}`. Colour cards appear. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E014 | Admin | Depth 4→5: clicking colour card navigates to /inventory/.../colour/{colour} | P0 | 1. At depth 4. 2. Click "Black" card. | URL includes `/Black`. Size group cards appear. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E015 | Admin | Depth 5→6 (leaf): clicking size_group card navigates to leaf route | P0 | 1. At depth 5. 2. Click a size group card (e.g. "6-10"). | URL depth = 6. `isLeaf = true` in page.tsx. `LeafPlaceholder` → `InventoryLeafTable` renders. "Master Cartons" heading visible. | E2E | Spec 30: TC-DRILL-001 |
| TC-STK-E016 | Admin | Full 7-level path: drill root to leaf in one sequence | P0 | 1. Log in as Admin. 2. Follow TC-DRILL-001 setup. 3. Drill Hawaii → Gents → Premium → {article} → Black → {size_group}. | All 6 URL transitions occur. Leaf shows "Master Cartons" heading, size pills, and "Loose Stock" heading. "Export CSV" button visible. | E2E | Spec 30: TC-DRILL-001 (primary drill-down spec) |
| TC-STK-E017 | Admin | (Ungrouped) bucket renders for null article_group | P1 | 1. Navigate to `/inventory/Hawaii/Gents`. 2. Look for "(Ungrouped)" card. | If a product has null `article_group`, a card with label "(Ungrouped)" appears. (Acceptable to skip if no such seed data.) | E2E | Spec 30: TC-DRILL-005 |
| TC-STK-E018 | Admin | URL-encoded segments with spaces: article name survives round-trip | P1 | 1. Article name "Test Product E2E" (has space). 2. Navigate to depth with that article. | URL segment is URL-encoded. `decodeURIComponent` in `DrillDownView` decodes correctly. API receives correct value. | E2E | Spec 30: TC-DRILL-001; note double-encoding bug at article depth flagged in spec comment |
| TC-STK-E019 | Admin | Direct URL deep-link: navigating to /inventory/Hawaii/Gents/Premium loads correctly | P0 | 1. Log in as Admin. 2. Navigate directly to `/inventory/Hawaii/Gents/Premium`. | Page loads at depth 3. `rawSegments = ['Hawaii','Gents','Premium']`. `level = 'article'`. API call: `/breakdown?level=article&path[section]=Hawaii&path[category]=Gents&path[group]=Premium`. | E2E | Spec 30: TC-DRILL-002 partial |

---

## Section 18 — Frontend E2E — Breadcrumbs

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E020 | Admin | Breadcrumb shows "Inventory" link at root level | P0 | 1. Navigate to `/inventory`. | `<nav aria-label="Inventory breadcrumb">` visible. Contains "Inventory" link (`/inventory`). Last segment is `<span>` not `<a>`. | E2E | `InventoryBreadcrumb` component |
| TC-STK-E021 | Admin | Breadcrumb shows ancestor links at depth 3 | P0 | 1. Navigate to `/inventory/Hawaii/Gents/Premium`. | Breadcrumb: `Inventory (link) › Hawaii (link) › Gents (link) › Premium (span — current)`. The current segment is NOT a link. | E2E | Spec 30: TC-DRILL-002 |
| TC-STK-E022 | Admin | Clicking ancestor breadcrumb link navigates up | P0 | 1. Navigate to depth 3 (`/inventory/Hawaii/Gents/Premium`). 2. Click "Gents" in breadcrumb. | Navigates to `/inventory/Hawaii/Gents`. URL and level change. Article group cards appear. | E2E | Spec 30: TC-DRILL-002 |
| TC-STK-E023 | Admin | Clicking "Inventory" breadcrumb returns to root | P0 | 1. Navigate to any depth. 2. Click "Inventory" breadcrumb link. | URL = `/inventory`. Section cards reappear. | E2E | Spec 30: TC-DRILL-002 |
| TC-STK-E024 | Admin | Breadcrumb at leaf (depth 6) shows all 7 segments | P1 | 1. Navigate to leaf depth. | Breadcrumb shows 7 items: Inventory + 6 path segments. All ancestors are links; last segment is current span. | E2E | |
| TC-STK-E025 | Admin | Back button (ArrowLeft or browser back) navigates up one level | P1 | 1. Navigate to depth 2. 2. Browser back or back button in UI. | Returns to depth 1. Breadcrumb updates. Section cards re-appear at appropriate level. | E2E | Spec 13: TC-INV-008 |

---

## Section 19 — Frontend E2E — Leaf View

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E030 | Admin | Leaf view renders "Master Cartons" and "Loose Stock" sections | P0 | 1. Navigate to a depth-6 leaf URL with existing data. | `<h2>Master Cartons</h2>` and `<h2>Loose Stock</h2>` headings visible inside respective card panels. | E2E | Spec 30: TC-DRILL-001 leaf assertions |
| TC-STK-E031 | Admin | Master Cartons table has correct columns | P0 | 1. Navigate to leaf with at least one PACKED carton. | Table headers: "Carton Barcode", "Boxes", "Pieces", "Sizes (pairs)", "MRP", "Status". Last column is a View link. | E2E | `MasterCartonsTable` component |
| TC-STK-E032 | Admin | Size pills render as "size×pairs" format | P0 | 1. Navigate to leaf with carton containing multiple sizes. | Size pills in "Sizes (pairs)" column show format "7×12" (size × pairs). Pill has title tooltip "Size 7: 12 pairs across 2 boxes". | E2E | Spec 30: TC-DRILL-003 |
| TC-STK-E033 | Admin | Loose Stock table has Size column | P0 | 1. Navigate to leaf with at least one FREE loose box. | Table header includes "Size" column. Row shows size badge (amber) or "—" if size is empty. | E2E | Spec 30: TC-DRILL-007 |
| TC-STK-E034 | Admin | Leaf "both empty" state shows Package icon and no-inventory message | P1 | 1. Navigate to leaf URL path that has no packed cartons and no loose boxes. | Package icon, "No inventory at this combination." message, sub-message visible. "Export CSV" button absent. | E2E | `InventoryLeafTable` `bothEmpty` branch |
| TC-STK-E035 | Admin | "Export CSV" button triggers client-side CSV download | P0 | 1. Navigate to leaf with data. 2. Click "Export CSV" button. | Browser triggers file download. Filename = `inventory-{slugged-parts}.csv`. CSV has 7 columns: Type, Barcode/ID, Size(s), Child Boxes, Pieces, MRP, Status. | E2E | `exportCsv()` function in `InventoryLeafTable`; AUTOMATION GAP: no spec covers this download |
| TC-STK-E036 | Admin | "View" link in Master Cartons row navigates to /master-cartons/{id} | P0 | 1. At leaf view. 2. Click "View →" link on a carton row. | Navigates to `/master-cartons/<master_carton_id>`. Master carton detail page loads. | E2E | `Link href={/master-cartons/${mc.master_carton_id}}` |
| TC-STK-E037 | Admin | "View" link in Loose Stock row links to /child-boxes?id={id} | P1 | 1. At leaf view with loose boxes. 2. Click "View →" on a loose stock row. | Navigates to `/child-boxes?id=<child_box_id>`. | E2E | `Link href={/child-boxes?id=${ls.child_box_id}}` |
| TC-STK-E038 | Admin | Leaf loading skeleton shows 3 SkeletonCards then table | P1 | 1. Throttle network. 2. Navigate to leaf depth. | 3 `SkeletonCard` components + 4 skeleton rows animate during load. Real table appears after load. | E2E | AUTOMATION GAP: no spec covers leaf skeleton |
| TC-STK-E039 | Admin | Leaf summary cards show pieces from master_cartons + loose_stock combined | P1 | 1. Navigate to leaf. 2. Inspect `InventorySummaryCards` at `depth=6`. | Cards compute from `leafData.master_cartons` + `leafData.loose_stock`. Total pieces = sum of all carton pieces + loose pieces. | E2E | AUTOMATION GAP |

---

## Section 20 — Frontend E2E — Filters and Search

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E040 | Admin | "Stock > 0" filter chip hides zero-stock cards and updates URL | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Count cards. 4. Click "Stock > 0" chip. | URL gains `?stock_filter=positive`. Zero-piece cards hidden. `applyStockFilter` filters items with `pieces > 0`. | E2E | Spec 30: TC-DRILL-004 |
| TC-STK-E041 | Admin | Clicking active "Stock > 0" chip clears the filter | P0 | 1. With `?stock_filter=positive` active. 2. Click chip again. | `?stock_filter=positive` removed from URL. All cards (including zero-stock) visible. | E2E | Spec 30: TC-DRILL-004 toggle |
| TC-STK-E042 | Admin | "Low stock" filter chip shows only items with 0 < pieces ≤ 10 | P1 | 1. Click "Low stock" chip. | URL gains `?stock_filter=low`. `LOW_STOCK_THRESHOLD = 10`. Only items with `pieces > 0 && pieces <= 10` shown. | E2E | `applyStockFilter('low')` |
| TC-STK-E043 | Admin | Only one filter chip active at a time | P1 | 1. Activate "Stock > 0". 2. Click "Low stock". | "Low stock" becomes active; "Stock > 0" becomes inactive. `?stock_filter=low` in URL (not both). | E2E | `toggle()` sets the new value |
| TC-STK-E044 | Admin | Search bar dropdown navigates to article drill path | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Type "Test Product E2E" in search. 4. Wait 600ms for debounce. 5. Click result in dropdown. | URL navigates to an inventory drill path at least 2 segments deep (`/inventory/.+/.+`). | E2E | Spec 30: TC-DRILL-006 |
| TC-STK-E045 | Admin | Filter state persists across drill levels | P1 | 1. Activate "Stock > 0" at root. 2. Click into a section card. | URL keeps `?stock_filter=positive`. Cards at category level also filtered. `InventoryCardGrid` applies `applyStockFilter` on received items. | E2E | AUTOMATION GAP |

---

## Section 21 — Frontend E2E — Legacy Upload Button

> **Gate:** `LegacyUploadButton` checks `useCan('cartons:create')`. Admin, Supervisor, Warehouse Operator have `cartons:create`. Dispatch Operator does NOT.
> **Page location:** Only on the root `/inventory` page (`page.tsx`) — NOT on the drill catch-all page. Rendered in `PageHeader.action`.
> **Scope:** This section covers button presence only. CSV parsing and upload flow are covered in A23 (`phase-35-legacy-inventory.md`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E050 | Admin | Admin sees "Upload Existing Stock" button on /inventory | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. | "Upload Existing Stock" button (Upload icon) visible in PageHeader action slot. | E2E | `useCan('cartons:create')` returns true for Admin |
| TC-STK-E051 | Supervisor | Supervisor sees "Upload Existing Stock" button on /inventory | P0 | 1. Log in as Supervisor. 2. Navigate directly to `/inventory` (by URL — sidebar link not visible). | "Upload Existing Stock" button visible. Supervisor has `cartons:create`. | E2E | Supervisor can reach /inventory by URL even without nav link |
| TC-STK-E052 | Warehouse Operator | Warehouse Operator sees "Upload Existing Stock" button on /inventory | P0 | 1. Log in as Warehouse Operator. 2. Navigate directly to `/inventory`. | "Upload Existing Stock" button visible. Warehouse Operator has `cartons:create`. | E2E | |
| TC-STK-E053 | Dispatch Operator | Dispatch Operator does NOT see "Upload Existing Stock" button | P0 | 1. Log in as Dispatch Operator. 2. Navigate directly to `/inventory`. | "Upload Existing Stock" button absent (returns `null` from `LegacyUploadButton`). `useCan('cartons:create')` = false for Dispatch Operator. | E2E | Key RBAC test; Dispatch Operator has no `cartons:create` |
| TC-STK-E054 | Admin | Clicking button opens "Upload Existing Stock (Legacy CSV)" modal | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Click "Upload Existing Stock". | Modal opens with title "Upload Existing Stock (Legacy CSV)". Modal body shows description text, "Download sample CSV" section (4 columns listed), drag-drop file input, Cancel and "Upload & Create Cartons" buttons. | E2E | `Modal isOpen={showModal}` — see A23 for full modal flow |
| TC-STK-E055 | Admin | Legacy upload button absent on /inventory/{section} drill pages | P1 | 1. Log in as Admin. 2. Navigate to `/inventory/Hawaii`. | "Upload Existing Stock" button NOT present on catch-all drill page. Button is only in root `inventory/page.tsx`, not in `inventory/[...path]/page.tsx`. | E2E | PageHeader on drill page has no `action` prop |

---

## Section 22 — Frontend E2E — Inventory Nav Visibility Per Role

> **Key discrepancy:** The `/inventory` sidebar link requires `inventory:read` permission. Only Admin holds this in the seed. Non-Admin users who navigate directly by URL can still access the page (no server-side guard). Document both behaviors.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E060 | Admin | Admin sees "Inventory" in sidebar nav | P0 | 1. Log in as Admin. 2. Inspect sidebar. | "Inventory" nav link (Warehouse icon) visible in sidebar. `canDo('inventory:read')` = true for Admin. | E2E | `constants/index.ts` line 79; spec 13: TC-INV-011 |
| TC-STK-E061 | Supervisor | Supervisor does NOT see "Inventory" in sidebar nav | P0 | 1. Log in as Supervisor. 2. Inspect sidebar. | "Inventory" nav link absent. Supervisor seed has no `inventory:read`. `filteredNavItems` excludes it. | E2E | RBAC discrepancy: API endpoints are still reachable directly |
| TC-STK-E062 | Warehouse Operator | Warehouse Operator does NOT see "Inventory" in sidebar nav | P0 | 1. Log in as Warehouse Operator. 2. Inspect sidebar. | "Inventory" nav link absent. Warehouse Operator has no `inventory:read`. | E2E | |
| TC-STK-E063 | Dispatch Operator | Dispatch Operator does NOT see "Inventory" in sidebar nav | P0 | 1. Log in as Dispatch Operator. 2. Inspect sidebar. | "Inventory" nav link absent. Dispatch Operator has no `inventory:read`. | E2E | |
| TC-STK-E064 | Supervisor | Supervisor navigating directly to /inventory gets page content (no 403) | P0 | 1. Log in as Supervisor. 2. Navigate to `/inventory` by typing URL. | Page loads successfully. Section cards visible. No redirect or 403. Backend breakdown endpoint is auth-only (not gated by `inventory:read`). | E2E | **Critical discrepancy:** nav link hidden but page accessible. No frontend route guard. |
| TC-STK-E065 | Warehouse Operator | Warehouse Operator navigating directly to /inventory gets page content | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/inventory` by URL. | Page loads. Data returned. | E2E | Same discrepancy as TC-STK-E064 |
| TC-STK-E066 | Dispatch Operator | Dispatch Operator navigating directly to /inventory gets page content | P0 | 1. Log in as Dispatch Operator. 2. Navigate to `/inventory` by URL. | Page loads. Drill-down data visible. "Upload Existing Stock" button absent (`cartons:create` not held). | E2E | |
| TC-STK-E067 | Unauthenticated | Unauthenticated user navigating to /inventory is redirected to login | P0 | 1. Not logged in. 2. Navigate to `/inventory`. | Redirect to `/login`. Session guard in `(dashboard)` layout. | E2E | Standard dashboard auth guard |

---

## Automation Gap Summary

| Gap # | Missing Coverage | Recommended Spec | Priority |
|---|---|---|---|
| G1 | No spec asserts `totalPairsInStock` DB-matching value (TC-STK-002) | Add to `34-mrp-and-carton-hierarchy.spec.ts` TC-CART section | P1 |
| G2 | No spec covers `totalChildBoxes` GENERATED exclusion in summary (TC-STK-004) | Add integration assertion in spec 34 | P1 |
| G3 | No spec covers legacy_carton_count amber badge on /inventory (TC-STK-145) | New spec `35-legacy-inventory.spec.ts` (A23) | P1 |
| G4 | No spec covers leaf "Export CSV" client-side download (TC-STK-E035) | Add to spec 30 TC-DRILL suite | P0 |
| G5 | No spec covers `/inventory` error state when breakdown API fails (TC-STK-E008) | Add to spec 13 or 30 | P2 |
| G6 | No spec covers leaf loading skeleton (TC-STK-E038) | Add to spec 30 | P2 |
| G7 | No spec covers leaf summary cards at depth=6 (TC-STK-E039) | Add to spec 30 | P2 |
| G8 | No spec covers filter state persistence across drill levels (TC-STK-E045) | Add to spec 30 | P1 |
| G9 | Supervisor/WH-Op/Dispatch-Op GET /inventory by direct URL (not via nav) not covered in existing specs — specs always log in as Admin | Add non-Admin spec to spec 13 covering URL-direct navigation | P1 |
| G10 | Dispatch Operator missing LegacyUploadButton test (TC-STK-E053) | Add to spec 13 RBAC section | P0 |
