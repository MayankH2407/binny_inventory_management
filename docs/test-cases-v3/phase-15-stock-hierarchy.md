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
