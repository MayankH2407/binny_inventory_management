# Phase 15 — Inventory Stock Hierarchy

**Module:** Inventory Stock Hierarchy (`GET /api/v1/inventory/stock/hierarchy` + `GET /api/v1/inventory/stock/summary` + `/inventory` frontend page)
**Suite version:** v3
**Last updated:** 2026-04-30
**TC ID prefix:** `STK`
**Roles under test:** All four roles (hierarchy is readable by all authenticated users).

> **Preconditions for all API tests:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base: `http://localhost:5000/api/v1`.
> **Drill levels (exact names from service code):** `section`, `article_name`, `mrp`, `colour`, `product` (leaf, represents size+variant).
> **Status note:** Hierarchy includes FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED boxes. GENERATED boxes are EXCLUDED from all aggregations.
> **MRP conditional:** When an article has `distinctMrpCount === 1`, frontend skips the `mrp` level and goes directly to `colour`. When `distinctMrpCount > 1`, an MRP bucket step is inserted.

---

## Table of Contents

1. [Section 1 — Stock Summary API](#section-1--stock-summary-api)
2. [Section 2 — Stock Hierarchy API — Level Validation](#section-2--stock-hierarchy-api--level-validation)
3. [Section 3 — Section Level](#section-3--section-level)
4. [Section 4 — Article Level](#section-4--article-level)
5. [Section 5 — MRP Level (Conditional — Apr 27 mod)](#section-5--mrp-level-conditional)
6. [Section 6 — Colour Level](#section-6--colour-level)
7. [Section 7 — Product (Leaf) Level](#section-7--product-leaf-level)
8. [Section 8 — Filter Combinations & Deep-Link Query Params](#section-8--filter-combinations--deep-link-query-params)
9. [Section 9 — Role Access](#section-9--role-access)
10. [Section 10 — Frontend E2E — Inventory Page](#section-10--frontend-e2e--inventory-page)

---

## Section 1 — Stock Summary API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-001 | Admin | GET /inventory/stock/summary returns all required fields | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/summary`. 3. Assert shape. | HTTP 200. Response (inside `data`) contains: `totalProducts` (integer ≥ 0), `totalPairsInStock` (FREE+PACKED only), `totalPairsDispatched`, `totalChildBoxes`, `totalCartons` (ACTIVE+CLOSED only), `sections` (distinct count), `articles` (distinct article_name count). All fields present, non-null, non-negative integers. | API | |
| TC-STK-002 | Admin | Summary totalPairsInStock includes FREE and PACKED only | P0 | 1. Authenticate as Admin. 2. Ensure boxes of EVERY status exist (GENERATED, FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED). 3. DB: `SUM(quantity) FILTER (WHERE status IN ('FREE','PACKED'))`. 4. GET `/api/v1/inventory/stock/summary`. | `totalPairsInStock` = DB sum. GENERATED, SAMPLE, ECOMMERCE, DISPATCHED are excluded. | Integration | `getStockSummary` uses `$1=FREE,$2=PACKED` filter. |
| TC-STK-003 | Admin | Summary totalCartons counts only ACTIVE + CLOSED master cartons | P1 | 1. Authenticate as Admin. 2. Ensure cartons of all 4 statuses exist (CREATED, ACTIVE, CLOSED, DISPATCHED). 3. DB: `SELECT COUNT(*) FROM master_cartons WHERE status IN ('ACTIVE','CLOSED')`. 4. GET summary. | `totalCartons` = DB count. CREATED and DISPATCHED cartons excluded. | Integration | Matches `getStockSummary` query. |
| TC-STK-004 | Admin | Summary excludes inactive products | P1 | 1. Authenticate as Admin. 2. Create 2 active products and 1 inactive product (`is_active = false`). 3. GET summary. | `totalProducts` counts only active products. Inactive product not included. | Integration | |

---

## Section 2 — Stock Hierarchy API — Level Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-010 | Admin | GET /inventory/stock/hierarchy?level=section returns section-level nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=section`. 3. Assert response shape. | HTTP 200. Response is array of objects each containing: `name` (string, section name), `key` (same as name), `totalPairs` (integer), `inStock` (FREE pairs), `packed` (PACKED pairs), `dispatched` (DISPATCHED pairs), `childBoxCount` (integer), `cartonCount` (integer), `children` (distinct article_name count), `distinctMrpCount` (integer). | API | |
| TC-STK-011 | Admin | GET /inventory/stock/hierarchy?level=article_name returns article-level nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=article_name`. 3. Assert shape. | HTTP 200. Array of nodes with `name` = article_name, `key` = article_name. `children` = count of distinct colours. `distinctMrpCount` = count of distinct MRP values for the article. | API | |
| TC-STK-012 | Admin | GET /inventory/stock/hierarchy?level=mrp returns MRP-bucket nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=mrp`. 3. Assert format. | HTTP 200. Each node `name` is formatted: "₹299" for integral MRP, "₹299.50" for fractional. `key` is the raw numeric string ("299.00" or "299.50"). Nodes ordered by `p.mrp ASC`. | API | MRP level was added Apr 27. |
| TC-STK-013 | Admin | GET /inventory/stock/hierarchy?level=colour returns colour-level nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=colour`. | HTTP 200. Each node `name` = colour string, `key` = colour string, `children` = count of distinct sizes. | API | |
| TC-STK-014 | Admin | GET /inventory/stock/hierarchy?level=product returns size/variant leaf nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=product`. | HTTP 200. Leaf nodes, each representing a product (size+MRP combination). `name` = "7 - ₹299" format. `key` = product UUID. `children` = 0. Ordered by `p.size::int ASC`. | API | |
| TC-STK-015 | Admin | Invalid level value defaults to 'section' level | P1 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=invalid_level`. | HTTP 200. Response is the section-level data (fallback in controller: `const stockLevel = validLevels.includes(level) ? level : 'section'`). | API | Controller line 42 fallback. |
| TC-STK-016 | Admin | Missing level param defaults to 'section' level | P1 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy` (no level param). | HTTP 200. Section-level data returned. Same as `?level=section`. | API | |
| TC-STK-017 | Any | Unauthenticated request to hierarchy returns 401 | P0 | 1. GET `/api/v1/inventory/stock/hierarchy?level=section` without Authorization header. | HTTP 401. No data returned. | API | |

---

## Section 3 — Section Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-020 | Admin | Section-level nodes list all sections with stock | P0 | 1. Authenticate as Admin. 2. Ensure products in sections "Hawaii" and "Classic" have child boxes (non-GENERATED). 3. GET `/api/v1/inventory/stock/hierarchy?level=section`. | Response includes nodes for "Hawaii" and "Classic". Each node's `totalPairs` > 0. Sections with no boxes may appear (LEFT JOIN) with totalPairs = 0, or may be absent depending on data. | API | |
| TC-STK-021 | Admin | Section node children count equals distinct article count within that section | P1 | 1. Authenticate as Admin. 2. Create 3 products all in section "Hawaii" with 3 distinct article_names. 3. GET `/api/v1/inventory/stock/hierarchy?level=section`. 4. Find "Hawaii" node. | "Hawaii" node `children` = 3 (or more if existing data). `children` field = count of distinct article_names in section. | Integration | |
| TC-STK-022 | Admin | Section nodes ordered by total_pairs DESC | P1 | 1. Authenticate as Admin. 2. Ensure "Hawaii" has more pairs than "Classic". 3. GET `?level=section`. 4. Check order. | "Hawaii" appears before "Classic" in response array (highest totalPairs first). | API | ORDER BY `total_pairs DESC NULLS LAST`. |
| TC-STK-023 | Admin | GENERATED boxes excluded from section-level aggregations | P0 | 1. Authenticate as Admin. 2. Generate 100 GENERATED boxes (no activate). 3. GET `/api/v1/inventory/stock/hierarchy?level=section`. 4. Compare totalPairs for the relevant section before and after. | `totalPairs` for the section does NOT increase due to GENERATED boxes. GENERATED is excluded from the `WHERE status IN ($1,$2,$3,$4,$5)` filter (FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED). | Integration | Critical: GENERATED excluded from hierarchy aggregations. |

---

## Section 4 — Article Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-030 | Admin | Article-level nodes filtered by section | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=article_name&section=Hawaii`. | HTTP 200. All returned nodes have products in section "Hawaii". Articles from other sections are excluded. | API | |
| TC-STK-031 | Admin | Article node has distinctMrpCount = 1 when all variants share one MRP | P0 | 1. Authenticate as Admin. 2. Create an article "CITY 01" with 2 size variants, both at MRP = 299.00. Add child boxes. 3. GET `?level=article_name&section=<section>`. Find "CITY 01" node. | "CITY 01" node `distinctMrpCount` = 1. | Integration | Key MRP skip condition. |
| TC-STK-032 | Admin | Article node has distinctMrpCount > 1 when variants have different MRPs | P0 | 1. Authenticate as Admin. 2. Create article "CITY 02" with 2 variants: size 6 at MRP 199, size 7 at MRP 299. Add child boxes. 3. GET `?level=article_name&section=<section>`. Find "CITY 02" node. | "CITY 02" node `distinctMrpCount` = 2. `children` = count of distinct colours (not MRP count at this query — `childCountExpr = COUNT(DISTINCT p.colour)` for article level). | Integration | |
| TC-STK-033 | Admin | Article node subtitle shows "N MRPs" when distinctMrpCount > 1 (API contract) | P1 | 1. Authenticate as Admin. 2. Set up article with 2+ MRPs (TC-STK-032 data). 3. GET `?level=article_name`. | Node for multi-MRP article has `distinctMrpCount` ≥ 2. This drives the frontend "N MRPs" subtitle (frontend uses `showsMrpBuckets = node.distinctMrpCount > 1`). | API | |

---

## Section 5 — MRP Level (Conditional — Apr 27 mod)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-040 | Admin | MRP level filtered by section and article_name returns only MRP buckets for that article | P0 | 1. Authenticate as Admin. 2. Create article "CITY 02" in section "Hawaii" with MRPs 199, 299. Add boxes at each MRP. 3. GET `/api/v1/inventory/stock/hierarchy?level=mrp&section=Hawaii&article_name=CITY+02`. | HTTP 200. Exactly 2 nodes returned, one for ₹199, one for ₹299. Each node has `totalPairs` > 0, `children` = count of distinct colours at that MRP. | API | |
| TC-STK-041 | Admin | MRP level nodes ordered by MRP value ascending | P0 | 1. Authenticate as Admin. 2. Article with MRPs 499, 199, 299. 3. GET `?level=mrp&article_name=<article>`. | Nodes ordered 199, 299, 499 (ascending). First node `key` = "199.00", last node `key` = "499.00". | API | `ORDER BY p.mrp ASC` for mrp level. |
| TC-STK-042 | Admin | MRP node name renders ₹299 (no decimals) for integral MRP | P0 | 1. Authenticate as Admin. 2. Create product with `mrp` = 299.00. Add boxes. 3. GET `?level=mrp`. Find the ₹299 node. | Node `name` = "₹299" (no ".00"). `key` = "299.00" (raw numeric string). | API | `CASE WHEN p.mrp = FLOOR(p.mrp) THEN '₹' || FLOOR(p.mrp)::text` |
| TC-STK-043 | Admin | MRP node name renders ₹299.50 (with decimals) for fractional MRP | P0 | 1. Authenticate as Admin. 2. Create product with `mrp` = 299.50. Add boxes. 3. GET `?level=mrp`. Find the ₹299.50 node. | Node `name` = "₹299.50". `key` = "299.50". | API | `ELSE '₹' || p.mrp::text` path. |
| TC-STK-044 | Admin | GET mrp level with mrp filter returns only colours at that MRP | P0 | 1. Authenticate as Admin. 2. Article "CITY 02" has MRP 199 with colour "Black" and MRP 299 with colour "White". 3. GET `?level=colour&section=Hawaii&article_name=CITY+02&mrp=299.00`. | HTTP 200. Only the "White" colour node appears. "Black" (MRP 199) is absent. | API | Tests MRP filter: `p.mrp = $X::numeric`. |
| TC-STK-045 | Admin | Article with single MRP — article node distinctMrpCount = 1 — GET colour level directly works | P0 | 1. Authenticate as Admin. 2. Article "CITY 01" has 1 MRP (299). Add boxes. 3. GET `?level=colour&section=Hawaii&article_name=CITY+01` (skip mrp level). | HTTP 200. Colour nodes returned without needing `mrp` filter. Frontend skips MRP step because `distinctMrpCount === 1`. | API | Verifies the skip-MRP path works at API level. |
| TC-STK-046 | Admin | Article with multiple MRPs — GET colour without MRP filter returns all colours across all MRPs | P1 | 1. Authenticate as Admin. 2. Article "CITY 02": Black at MRP 199, White at MRP 299. 3. GET `?level=colour&section=Hawaii&article_name=CITY+02` (no `mrp` param). | HTTP 200. Both "Black" and "White" nodes returned (no MRP filter applied). Each node's `totalPairs` aggregates all MRP variants of that colour. | API | |

---

## Section 6 — Colour Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-050 | Admin | Colour level filtered by section + article_name returns correct colours | P0 | 1. Authenticate as Admin. 2. Article "CITY 01" has colours "Black" and "Tan". 3. GET `?level=colour&section=Hawaii&article_name=CITY+01`. | HTTP 200. Nodes for "Black" and "Tan" returned. Colours from other articles not included. Each node `children` = count of distinct sizes. | API | |
| TC-STK-051 | Admin | Colour level filtered by section + article_name + mrp returns colours at that MRP only | P1 | 1. Follow TC-STK-044. GET `?level=colour&section=Hawaii&article_name=CITY+02&mrp=199.00`. | Only colours with products at MRP 199 returned. | API | |
| TC-STK-052 | Admin | Colour node totalPairs aggregates FREE + PACKED + SAMPLE + ECOMMERCE + DISPATCHED (excludes GENERATED) | P0 | 1. Authenticate as Admin. 2. For article "CITY 01" colour "Black": add 5 FREE boxes, 3 PACKED boxes, 2 SAMPLE boxes, 1 GENERATED box. 3. GET `?level=colour&article_name=CITY+01`. Find "Black" node. | `totalPairs` = sum of quantities for FREE+PACKED+SAMPLE (10 in example). GENERATED box is excluded. `inStock` = FREE pairs, `packed` = PACKED pairs, `dispatched` = DISPATCHED pairs (0 in example). | Integration | |

---

## Section 7 — Product (Leaf) Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-060 | Admin | Product level returns size+variant leaf nodes ordered by size ascending | P0 | 1. Authenticate as Admin. 2. Article "CITY 01", colour "Black", sizes 6, 7, 8, all at MRP 299. Add boxes for each size. 3. GET `?level=product&section=Hawaii&article_name=CITY+01&colour=Black`. | HTTP 200. Nodes returned in order: size 6, size 7, size 8. Each node `name` = "6 - ₹299", "7 - ₹299", "8 - ₹299". `children` = 0 (leaf). | API | `ORDER BY p.size::int` |
| TC-STK-061 | Admin | Product node name format is "size - ₹MRP" | P0 | 1. Authenticate as Admin. 2. Create product: size="10", mrp=499.00. 3. GET `?level=product` (filtered appropriately). Find the node. | Node `name` = "10 - ₹499". (Integral MRP in name uses floor: "₹499", not "₹499.00" — the nameExpr: `p.size || ' - ₹' || p.mrp` uses raw numeric, may show "499.00" depending on DB type formatting.) | API | Note: leaf level uses `p.mrp` raw, not the CASE expression. May render as "10 - ₹499.00". Flag if inconsistent with MRP level. |
| TC-STK-062 | Admin | Product level with no matching filter returns empty array | P1 | 1. Authenticate as Admin. 2. GET `?level=product&section=NonExistentSection`. | HTTP 200. Empty array `[]`. No error. | API | |

---

## Section 8 — Filter Combinations & Deep-Link Query Params

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-070 | Admin | Deep-link: ?level=colour&section=Hawaii&article_name=CITY+02&mrp=299.00 returns filtered colour view | P0 | 1. Authenticate as Admin. 2. Set up article "CITY 02" in "Hawaii" with MRP 299.00 having colours "White" and "Tan". 3. GET `/api/v1/inventory/stock/hierarchy?level=colour&section=Hawaii&article_name=CITY%2002&mrp=299.00`. | HTTP 200. Returns colour nodes filtered to section=Hawaii, article_name=CITY 02, mrp=299.00. Only colours with products at that exact MRP are returned. | API | URL-encoded article_name with space. |
| TC-STK-071 | Admin | Deep-link: ?level=product&section=Hawaii&article_name=CITY+01&colour=Black returns leaf nodes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/stock/hierarchy?level=product&section=Hawaii&article_name=CITY+01&colour=Black`. | HTTP 200. Product leaf nodes for "CITY 01" "Black" across all sizes returned. | API | |
| TC-STK-072 | Admin | Section filter applied at article level excludes articles from other sections | P1 | 1. Authenticate as Admin. 2. Create articles in "Hawaii" and "Classic". 3. GET `?level=article_name&section=Hawaii`. | Only articles belonging to section "Hawaii" returned. "Classic" section articles absent. | API | |
| TC-STK-073 | Admin | mrp filter with non-numeric value returns empty or graceful response | P2 | 1. Authenticate as Admin. 2. GET `?level=colour&mrp=not-a-number`. | HTTP 200 (or 400). If 200, returns empty array. If 400, returns validation error. No 500. DB cast `$X::numeric` will raise error on invalid input — should be caught gracefully. | API | Potential edge case: `$X::numeric` cast with non-numeric string may throw DB error. Flag if unhandled 500 observed. |
| TC-STK-074 | Admin | URL-encoded article_name with slash character: CITY%2F02 | P1 | 1. Authenticate as Admin. 2. Create article "CITY/02". 3. GET `?level=colour&article_name=CITY%2F02`. | HTTP 200. Article "CITY/02" products returned (URL-encoded slash decoded correctly). | API | |

---

## Section 9 — Role Access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-080 | Supervisor | Supervisor can GET stock hierarchy | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/inventory/stock/hierarchy?level=section`. | HTTP 200. Data returned. | API | |
| TC-STK-081 | Warehouse Operator | Warehouse Operator can GET stock hierarchy | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/inventory/stock/hierarchy?level=section`. | HTTP 200. Data returned. | API | All roles read access per role matrix. |
| TC-STK-082 | Dispatch Operator | Dispatch Operator can GET stock hierarchy | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/inventory/stock/hierarchy?level=section`. | HTTP 200. Data returned. | API | |
| TC-STK-083 | Any | Unauthenticated GET stock summary returns 401 | P0 | 1. GET `/api/v1/inventory/stock/summary` without Authorization. | HTTP 401. | API | |

---

## Section 10 — Frontend E2E — Inventory Page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-E2E-001 | Admin | Inventory page loads at /inventory showing section cards | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Assert initial state. | Page title "Inventory". Breadcrumb shows "All Sections" as active (navy background). Section-level `NodeCard` components displayed in a responsive grid. Each card shows section name, pair stats (Free, Packed, Dispatched), stock bar, total pairs footer. | E2E | |
| TC-STK-E2E-002 | Admin | Summary cards appear above the stock grid | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Assert summary cards. | 4 summary cards rendered: "Pairs in Stock" (emerald), "Pairs Dispatched" (blue), "Child Boxes" (purple), "Active Cartons" (amber). Values match GET /stock/summary. | E2E | |
| TC-STK-E2E-003 | Admin | Drilling into a section shows article-level cards | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Click on a section card (e.g., "Hawaii"). 4. Assert transition. | Breadcrumb updates to: "All Sections > Hawaii" with "Hawaii" as active. Section card disappears. Article-level NodeCard components appear. Each card has BarChart3 icon and blue gradient. | E2E | |
| TC-STK-E2E-004 | Admin | Article with 1 MRP — clicking article card jumps directly to colour level (skips MRP step) | P0 | 1. Log in as Admin. 2. Set up article "CITY 01" with 1 distinct MRP. 3. Navigate to `section > Hawaii`. 4. Click the "CITY 01" article card. 5. Assert breadcrumb and card level. | Breadcrumb: "All Sections > Hawaii > CITY 01". Level shown is colour-level (Palette icon, emerald gradient). MRP level is NOT inserted. `NodeCard` subtitle shows colour count (not MRP count). | E2E | `getChildLevel` returns 'colour' when `distinctMrpCount === 1`. |
| TC-STK-E2E-005 | Admin | Article with 2+ MRPs — clicking article card shows MRP bucket level | P0 | 1. Log in as Admin. 2. Set up article "CITY 02" with 2 distinct MRPs (199, 299). 3. Navigate to `section > Hawaii`. 4. Click the "CITY 02" article card. 5. Assert next level. | Breadcrumb: "All Sections > Hawaii > CITY 02". MRP-level cards rendered (IndianRupee icon, rose gradient). Cards show "₹199" and "₹299". Each card shows colour count. | E2E | `getChildLevel` returns 'mrp' when `distinctMrpCount > 1`. |
| TC-STK-E2E-006 | Admin | Article card subtitle shows "N MRPs" when distinctMrpCount > 1 | P0 | 1. Follow TC-STK-E2E-005 setup. 2. At article level view, inspect "CITY 02" card subtitle. | "CITY 02" card subtitle shows "2 MRPs" (not "N Colours"). Clicking it leads to MRP buckets. | E2E | `showsMrpBuckets` logic in `NodeCard`. |
| TC-STK-E2E-007 | Admin | Article card subtitle shows "N Colours" when distinctMrpCount === 1 | P1 | 1. Follow TC-STK-E2E-004 setup. 2. At article level view, inspect "CITY 01" card subtitle. | "CITY 01" card subtitle shows "N Colours" (e.g., "2 Colours"). Not "1 MRPs". | E2E | |
| TC-STK-E2E-008 | Admin | Drilling from MRP bucket to colour shows filtered colours | P0 | 1. Follow TC-STK-E2E-005. 2. Click MRP card "₹299". 3. Assert colour level. | Breadcrumb: "... > CITY 02 > ₹299". Colour-level cards (Palette icon, emerald). Only colours with products at MRP 299 shown. | E2E | |
| TC-STK-E2E-009 | Admin | Drilling from colour to product (leaf) shows size cards | P0 | 1. Navigate `section > article > colour > <colour name>`. 2. Assert leaf level. | Breadcrumb: "... > Black". Product-level (Ruler icon, amber gradient). Each card shows "size - ₹MRP" name. Free/Packed/Dispatched stats shown. ChevronRight absent (leaf node — not clickable). | E2E | |
| TC-STK-E2E-010 | Admin | Breadcrumb navigation — clicking intermediate crumb navigates back | P0 | 1. Drill down to colour level (4 crumbs). 2. Click "Hawaii" crumb. 3. Assert state. | View resets to article level filtered by "Hawaii". Breadcrumb truncated to "All Sections > Hawaii". Colour and section levels above "Hawaii" removed. | E2E | |
| TC-STK-E2E-011 | Admin | Back button (ArrowLeft) navigates up one level | P1 | 1. Drill to article level. 2. Click the ArrowLeft back button. 3. Assert. | Returns to section level. Breadcrumb restored. Back button disappears when at root level. | E2E | |
| TC-STK-E2E-012 | Admin | Refresh button re-fetches hierarchy data | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Dispatch a carton. 4. Click the RefreshCw icon button. | Spinner animation on RefreshCw during refetch. Data updates to reflect new dispatch. No full-page reload. | E2E | |
| TC-STK-E2E-013 | Admin | Empty state shown when section has no stock data | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Navigate into a section that has products but all boxes are GENERATED (excluded from hierarchy). | Grid of 6 skeleton cards shown during load, then empty state: Warehouse icon, "No stock data", "Products will appear here once child boxes are generated." | E2E | |
| TC-STK-E2E-014 | Admin | Stock bar colors: emerald for Free, blue for Packed, gray for Dispatched | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Inspect a section NodeCard's stock bar. | Proportional colored segments visible: emerald-500 (FREE), blue-500 (PACKED), gray-400 (DISPATCHED). Empty bar shown (gray-100 full width) if totalPairs = 0. | E2E | |
| TC-STK-E2E-015 | Admin | Legend shows correct color labels | P1 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Inspect the legend row above card grid. | Three legend items: circle + "Free (in stock)" (emerald-500), circle + "Free (in stock)" (emerald-500), circle + "Packed (in carton)" (blue-500), circle + "Dispatched" (gray-400). | E2E | |
| TC-STK-E2E-016 | Warehouse Operator | Warehouse Operator sees full inventory hierarchy | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/inventory`. 3. Drill into any section. | Full hierarchy loads. All drill-down levels accessible. No access-denied message. | E2E | |

---

## Section 11 — Master Carton View

**Module:** Master Carton View (`GET /api/v1/inventory/cartons/hierarchy` + `GET /api/v1/inventory/cartons/export` + `/inventory` frontend page, "By Master Carton" tab)
**TC ID prefix:** `STK-CARTON`
**Roles under test:** All four roles for read access; Admin + Supervisor only for CSV export.

> **Preconditions for all API tests:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base: `http://localhost:3001/api/v1`. Master cartons of each status (CREATED, ACTIVE, CLOSED, DISPATCHED) exist and have child boxes packed into them via `carton_child_mapping` (is_active = true).
> **Carton levels:** `status` (root), `section`, `article_name`, `carton` (leaf).
> **Dedup rule:** A carton with boxes from multiple articles appears under EACH article card but is counted only once at parent-level aggregations (`COUNT(DISTINCT mc.id)`).

---

### 11.1 — View Tab Switcher

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-001 | Admin | Tab switcher is visible on /inventory page | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Inspect top of card section (above breadcrumbs). | A tab row is rendered with two buttons: "By Child Box" (active/selected by default) and "By Master Carton". The active tab has a white bg with shadow; inactive tab is gray text. | E2E | Default view is "child". |
| TC-STK-CARTON-002 | Admin | Switching to "By Master Carton" tab resets breadcrumbs and loads status-level cards | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Drill into a section in "By Child Box" view. 4. Click "By Master Carton" tab. 5. Assert state. | Breadcrumbs reset to "All Statuses". Status-level CartonNodeCard components appear (ListChecks icon, slate gradient). Previously-drilled-into section is NOT reflected in breadcrumbs. | E2E | Each view has independent breadcrumb state. |
| TC-STK-CARTON-003 | Admin | Switching back to "By Child Box" tab restores child-box breadcrumbs | P1 | 1. Log in as Admin. 2. Switch to "By Master Carton" tab, drill into a status. 3. Switch back to "By Child Box" tab. | Child-box view re-renders showing its own breadcrumbs (e.g., "All Sections" root). Master carton breadcrumbs are not shown. | E2E | |

---

### 11.2 — Status Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-010 | Admin | GET /inventory/cartons/hierarchy?level=status returns all 4 status nodes | P0 | 1. Authenticate as Admin. 2. Ensure cartons of all 4 statuses exist. 3. GET `http://localhost:3001/api/v1/inventory/cartons/hierarchy?level=status`. 4. Assert shape. | HTTP 200. `data` array contains up to 4 nodes (one per status that has cartons). Each node has: `name` = status string (e.g. "ACTIVE"), `key` = same as name, `cartonCount` (integer ≥ 1), `childBoxCount` (integer ≥ 0), `avgUtilization` (0–100 integer). No `meta` key for non-leaf levels. | API | |
| TC-STK-CARTON-011 | Admin | Status-level nodes ordered CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Authenticate as Admin. 2. Ensure cartons of all 4 statuses exist. 3. GET `?level=status`. 4. Check response array order. | `data[0].name = 'CREATED'`, `data[1].name = 'ACTIVE'`, `data[2].name = 'CLOSED'`, `data[3].name = 'DISPATCHED'` (assuming all 4 statuses have cartons). Order driven by CASE expression in SQL. | API | `ORDER BY CASE mc.status WHEN 'CREATED' THEN 1 ... END` |
| TC-STK-CARTON-012 | Admin | Status node cartonCount and childBoxCount match DB counts | P1 | 1. Authenticate as Admin. 2. DB: `SELECT COUNT(*) FROM master_cartons WHERE status = 'ACTIVE'` and `SELECT SUM(child_count) FROM master_cartons WHERE status = 'ACTIVE'`. 3. GET `?level=status`. Find ACTIVE node. | `cartonCount` = DB COUNT(*). `childBoxCount` = DB SUM(child_count). Both integers, non-negative. | Integration | |
| TC-STK-CARTON-013 | Admin | Status level with section filter returns only cartons in that section | P1 | 1. Authenticate as Admin. 2. GET `?level=status&section=Hawaii`. | Only status nodes for cartons that contain at least one child box from products in section "Hawaii" are returned. Status nodes for cartons with no Hawaii boxes are absent. | API | Requires join to `carton_child_mapping → child_boxes → products`. |
| TC-STK-CARTON-014 | Any | Unauthenticated request to /cartons/hierarchy returns 401 | P0 | 1. GET `/api/v1/inventory/cartons/hierarchy?level=status` without Authorization header. | HTTP 401. No data returned. | API | Route uses `authenticate` middleware. |

---

### 11.3 — Section Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-020 | Admin | GET /inventory/cartons/hierarchy?level=section returns section nodes with status breakdown | P0 | 1. Authenticate as Admin. 2. GET `?level=section`. 3. Assert shape. | HTTP 200. Each node has: `name` = section string, `key` = same, `cartonCount`, `createdCount`, `activeCount`, `closedCount`, `dispatchedCount`, `childBoxCount`, `totalPairs`. All counts non-negative integers. | API | |
| TC-STK-CARTON-021 | Admin | Section level with status=CLOSED filter returns only sections containing CLOSED cartons | P0 | 1. Authenticate as Admin. 2. GET `?level=section&status=CLOSED`. | Only sections that have at least one CLOSED carton are returned. Each returned node's `cartonCount` = count of CLOSED cartons in that section. `closedCount` = `cartonCount`. `activeCount`, `createdCount`, `dispatchedCount` = 0 (since filter restricts to CLOSED). | API | |
| TC-STK-CARTON-022 | Admin | Mixed-article carton dedup: carton with boxes from 2 sections counted once per section | P1 | 1. Authenticate as Admin. 2. Set up carton X with 3 boxes from section "Hawaii" and 2 boxes from section "Classic". 3. GET `?level=section`. Find "Hawaii" and "Classic" nodes. | Both "Hawaii" and "Classic" nodes show carton X in their `cartonCount` (each ≥ 1). However, at the section level, `cartonCount` is `COUNT(DISTINCT mc.id)` so the same carton X is counted once per section. | Integration | Dedup via `COUNT(DISTINCT mc.id)`. |
| TC-STK-CARTON-023 | Admin | Section node totalPairs = sum of child_box quantities in that section | P1 | 1. Authenticate as Admin. 2. DB: `SELECT SUM(cb.quantity) FROM carton_child_mapping ccm JOIN child_boxes cb ON cb.id = ccm.child_box_id JOIN products p ON p.id = cb.product_id WHERE p.section = 'Hawaii' AND ccm.is_active = true`. 3. GET `?level=section`. Find "Hawaii" node. | `totalPairs` matches DB sum. | Integration | |
| TC-STK-CARTON-024 | Admin | Section level with search filter returns matching sections | P1 | 1. Authenticate as Admin. 2. GET `?level=section&search=BUSKER`. | Only sections containing cartons that have boxes with article_name ILIKE '%BUSKER%' are returned. Sections with no matching boxes absent. | API | Search applies via `p.article_name ILIKE`. |

---

### 11.4 — Article Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-030 | Admin | GET /inventory/cartons/hierarchy?level=article_name returns article nodes | P0 | 1. Authenticate as Admin. 2. GET `?level=article_name`. 3. Assert shape. | HTTP 200. Each node has: `name` = article_name, `key` = article_name, `cartonCount`, `createdCount`, `activeCount`, `closedCount`, `dispatchedCount`, `childBoxCount`, `totalPairs`, `primary_section`. | API | |
| TC-STK-CARTON-031 | Admin | Article level with status+section filters returns correct articles | P0 | 1. Authenticate as Admin. 2. GET `?level=article_name&status=ACTIVE&section=Hawaii`. | Only articles in section "Hawaii" that appear in ACTIVE cartons are returned. Articles from other sections or in non-ACTIVE cartons absent. | API | |
| TC-STK-CARTON-032 | Admin | Mixed-article carton appears under both article cards (dedup verified) | P0 | 1. Authenticate as Admin. 2. Set up carton X with 5 boxes of Article A and 3 boxes of Article B, both in section "Hawaii". 3. GET `?level=article_name&section=Hawaii`. | Both "Article A" and "Article B" nodes returned. Each node's `cartonCount` includes carton X (≥ 1). Carton X is counted via `COUNT(DISTINCT mc.id)` — same carton counted once per article scope. | Integration | Core dedup requirement. |
| TC-STK-CARTON-033 | Admin | Article node primary_section populated correctly | P1 | 1. Authenticate as Admin. 2. GET `?level=article_name&section=Hawaii`. 3. Find an article node. | Each node has `primary_section` = the section string (e.g., "Hawaii"). Used for breadcrumb continuity in the carton leaf view. | API | `p.section` returned from GROUP BY clause. |
| TC-STK-CARTON-034 | Admin | Article-level cartonCount uses COUNT(DISTINCT mc.id) | P1 | 1. Authenticate as Admin. 2. Create carton X with boxes from Article A (5 boxes) AND Article B (3 boxes). 3. GET `?level=article_name`. Find Article A and Article B nodes. 4. DB verify: `SELECT COUNT(DISTINCT mc.id) FROM ... WHERE p.article_name = 'Article A'`. | `cartonCount` for Article A = DB COUNT(DISTINCT). Carton X is counted only once for Article A, not once per box. | Integration | |

---

### 11.5 — Carton Leaf Level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-040 | Admin | GET /inventory/cartons/hierarchy?level=carton returns paginated carton list | P0 | 1. Authenticate as Admin. 2. GET `?level=carton`. 3. Assert shape. | HTTP 200. Response has `data` (array) and `meta` (`{page, limit, total, totalPages}`). Each `data` item has: `id` (UUID), `carton_barcode` (string), `status` (one of 4 values), `child_count` (integer), `max_capacity` (integer), `created_at` (timestamp string), `primary_section` (string or null), `primary_article` (string or null). | API | Default page=1, limit=50. |
| TC-STK-CARTON-041 | Admin | Carton leaf primary_section and primary_article = most-frequent article in carton | P0 | 1. Authenticate as Admin. 2. Set up carton X: 5 boxes of Article A (section "Hawaii"), 2 boxes of Article B (section "Classic"). 3. GET `?level=carton`. Find carton X by barcode. | `primary_article` = "Article A" (5 boxes > 2 boxes). `primary_section` = "Hawaii". Lateral subquery selects the article with the highest box count. | Integration | LATERAL subquery `ORDER BY cnt DESC LIMIT 1`. |
| TC-STK-CARTON-042 | Admin | Carton leaf pagination: page 2 returns next 50 cartons | P1 | 1. Authenticate as Admin. 2. Ensure > 50 cartons exist. 3. GET `?level=carton&page=1&limit=50`. Note last barcode. 4. GET `?level=carton&page=2&limit=50`. | `meta.page = 2`. `data` contains different cartons from page 1. `meta.total` is consistent between calls. | API | |
| TC-STK-CARTON-043 | Admin | Carton leaf search filter by barcode | P0 | 1. Authenticate as Admin. 2. Note a specific carton barcode (e.g., "MC-00042"). 3. GET `?level=carton&search=MC-00042`. | HTTP 200. `data` contains only cartons whose barcode ILIKE '%MC-00042%'. `meta.total` reflects filtered count. | API | |
| TC-STK-CARTON-044 | Admin | Carton leaf with status filter returns only cartons of that status | P0 | 1. Authenticate as Admin. 2. GET `?level=carton&status=CLOSED`. | All cartons in `data` have `status = 'CLOSED'`. `meta.total` = count of CLOSED cartons matching other filters. | API | |
| TC-STK-CARTON-045 | Admin | Carton leaf click navigates to /master-cartons/[id] | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Switch to "By Master Carton" tab. 4. Drill to carton leaf level. 5. Click a carton card. | Browser navigates to `/master-cartons/<id>` where `<id>` is the UUID of the clicked carton. Master carton detail page loads. | E2E | `router.push('/master-cartons/' + id)` on leaf card click. |
| TC-STK-CARTON-046 | Admin | Carton leaf closed_at and dispatched_at are null for non-closed/non-dispatched cartons | P1 | 1. Authenticate as Admin. 2. GET `?level=carton&status=ACTIVE`. Inspect a node. | `closed_at = null`, `dispatched_at = null` for ACTIVE cartons. `created_at` is a non-null timestamp string. | API | |

---

### 11.6 — CSV Export

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-050 | Admin | GET /inventory/cartons/export?level=status returns 5-column CSV | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/cartons/export?level=status`. 3. Assert response. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition` header contains `carton-hierarchy-status-YYYY-MM-DD.csv`. Body is a CSV with header row: `"Status","Carton Count","Child Boxes","Total Pairs","Avg Utilization %"`. Data rows follow, one per status. | API | 5 columns. |
| TC-STK-CARTON-051 | Admin | GET /inventory/cartons/export?level=section returns 8-column CSV | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/cartons/export?level=section`. | HTTP 200. CSV header row: `"Section","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"`. 8 columns. Data rows present. | API | 8 columns. |
| TC-STK-CARTON-052 | Admin | GET /inventory/cartons/export?level=article_name returns 9-column CSV | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/cartons/export?level=article_name`. | HTTP 200. CSV header row: `"Section","Article","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"`. 9 columns. Each row has the primary_section in the first column and article_name in second. | API | 9 columns. |
| TC-STK-CARTON-053 | Admin | GET /inventory/cartons/export?level=carton returns 10-column CSV with primary section+article | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/cartons/export?level=carton`. | HTTP 200. CSV header row: `"Carton Barcode","Status","Section (Primary)","Article (Primary)","Child Count","Max Capacity","Utilization %","Created At","Closed At","Dispatched At"`. 10 columns. `Section (Primary)` and `Article (Primary)` populated from LATERAL subquery. | API | 10 columns. |
| TC-STK-CARTON-054 | Warehouse Operator | Warehouse Operator GET /inventory/cartons/export returns 403 | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/inventory/cartons/export?level=section`. | HTTP 403. No CSV content. Route protected by `authorize(ADMIN, SUPERVISOR)`. | API | Role check. |
| TC-STK-CARTON-055 | Admin | Frontend CSV export blob download flow works | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Switch to "By Master Carton" tab. 4. Click the "Export" button. 5. Assert browser download. | A file download is triggered in the browser. Filename matches `carton-hierarchy-<level>-YYYY-MM-DD.csv`. File content is valid CSV with appropriate header row. Export button shows "Exporting..." during the request and returns to "Export" after completion. | E2E | Blob URL flow using `window.URL.createObjectURL`. |

---

### 11.7 — E2E Navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-STK-CARTON-060 | Admin | Tab switcher visible and functional at /inventory | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Assert DOM. 4. Click "By Master Carton". 5. Assert URL and view. | Tab switcher row with "By Child Box" and "By Master Carton" buttons rendered. Clicking "By Master Carton" renders the Master Carton card section (breadcrumb shows "All Statuses"). URL does not change (state-based switching, no URL update). | E2E | |
| TC-STK-CARTON-061 | Admin | Drill-down through full carton hierarchy: status → section → article → carton leaf | P0 | 1. Log in as Admin. 2. Navigate to `/inventory`. 3. Switch to "By Master Carton". 4. Click ACTIVE status node. 5. Click a section node. 6. Click an article node. 7. Assert carton leaf cards. | Breadcrumb updates at each step: "All Statuses → ACTIVE → <Section> → <Article>". Carton leaf cards (monospace barcode, utilization bar, status badge, dates) are displayed at the final level. Each leaf card has a ChevronRight and is clickable. | E2E | |
| TC-STK-CARTON-062 | Admin | Clicking a carton leaf card navigates to /master-cartons/[id] | P0 | 1. Follow TC-STK-CARTON-061 to reach carton leaf level. 2. Note the barcode of first carton card. 3. Click the card. 4. Assert navigation. | Browser navigates to `/master-cartons/<UUID>`. The Master Carton detail page loads, showing the carton with the expected barcode. Back button in browser returns to `/inventory`. | E2E | `router.push` with carton `id` field. |
