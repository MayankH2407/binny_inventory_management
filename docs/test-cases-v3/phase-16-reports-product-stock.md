# Phase 16 — Reports: Product-wise & Stock Summary

**Module:** Reports — Product-wise (`GET /api/v1/reports/product-wise`) and Inventory Summary (`GET /api/v1/reports/inventory-summary`) + `/reports` frontend page (Stock Report and Carton Inventory tabs)
**Suite version:** v3
**Last updated:** 2026-04-30
**TC ID prefix:** `RPT`
**Roles under test:** Admin (`admin@binny.com / Admin@123`), Supervisor (`supervisor@binny.com / Sup@123`). Warehouse Operator and Dispatch Operator are denied access (403).

> **Preconditions for all API tests:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base: `http://localhost:5000/api/v1`.
> **Role gate:** Both `/reports/product-wise` and `/reports/inventory-summary` require `authorize(ADMIN, SUPERVISOR)` (router-level middleware in `report.routes.ts`).
> **Note on product-wise data:** The `getProductWiseReport` service returns: `product_id`, `product_name` (= article_name), `product_sku`, `size`, `colour`, `total_child_boxes`, `free_boxes`, `packed_boxes`, `sample_boxes`, `ecommerce_boxes`, `dispatched_boxes`, `total_pairs`, `pairs_in_stock` (FREE+PACKED), `pairs_dispatched`. GENERATED boxes are NOT present as a column (the service's SELECT list has no GENERATED filter — `total_child_boxes` includes ALL boxes regardless of status via `COUNT(cb.id)`).
> **Note on inventory-summary data:** `childBoxesByStatus` is a dynamic object keyed by status string. After Apr 27, it will contain keys: `GENERATED`, `FREE`, `PACKED`, `SAMPLE`, `ECOMMERCE`, `DISPATCHED` (whichever statuses have boxes).

---

## Table of Contents

1. [Section 1 — Role Gate (allowed and denied)](#section-1--role-gate)
2. [Section 2 — Product-wise Report API](#section-2--product-wise-report-api)
3. [Section 3 — Inventory Summary Report API](#section-3--inventory-summary-report-api)
4. [Section 4 — Carton Inventory Report API](#section-4--carton-inventory-report-api)
5. [Section 5 — Frontend E2E — Reports Page (Stock + Carton tabs)](#section-5--frontend-e2e--reports-page)

---

## Section 1 — Role Gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-001 | Admin | Admin can GET /reports/product-wise | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/reports/product-wise`. | HTTP 200. Array of product-wise rows returned (may be empty if no products). | API | |
| TC-RPT-002 | Supervisor | Supervisor can GET /reports/product-wise | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/reports/product-wise`. | HTTP 200. Array returned. | API | |
| TC-RPT-003 | Warehouse Operator | Warehouse Operator cannot GET /reports/product-wise — 403 | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/reports/product-wise`. | HTTP 403. Error: "Access denied" or "Insufficient permissions". No data returned. | API | Router-level `authorize(ADMIN, SUPERVISOR)`. |
| TC-RPT-004 | Dispatch Operator | Dispatch Operator cannot GET /reports/product-wise — 403 | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/reports/product-wise`. | HTTP 403. No data returned. | API | |
| TC-RPT-005 | Warehouse Operator | Warehouse Operator cannot GET /reports/inventory-summary — 403 | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 403. Error message present. | API | |
| TC-RPT-006 | Dispatch Operator | Dispatch Operator cannot GET /reports/inventory-summary — 403 | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 403. | API | |
| TC-RPT-007 | Any | Unauthenticated GET /reports/product-wise returns 401 | P0 | 1. GET `/api/v1/reports/product-wise` without Authorization header. | HTTP 401. | API | |
| TC-RPT-008 | Any | Unauthenticated GET /reports/inventory-summary returns 401 | P0 | 1. GET `/api/v1/reports/inventory-summary` without Authorization header. | HTTP 401. | API | |

---

## Section 2 — Product-wise Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-010 | Admin | GET /reports/product-wise returns all required columns | P0 | 1. Authenticate as Admin. 2. Ensure at least 1 active product with child boxes exists. 3. GET `/api/v1/reports/product-wise`. 4. Assert shape of first row. | HTTP 200. Response is array. First element contains: `product_id` (UUID), `product_name` (string), `product_sku` (string), `size` (string), `colour` (string), `total_child_boxes` (integer ≥ 0), `free_boxes` (integer ≥ 0), `packed_boxes` (integer ≥ 0), `sample_boxes` (integer ≥ 0), `ecommerce_boxes` (integer ≥ 0), `dispatched_boxes` (integer ≥ 0), `total_pairs` (integer ≥ 0), `pairs_in_stock` (integer ≥ 0), `pairs_dispatched` (integer ≥ 0). | API | `sample_boxes` and `ecommerce_boxes` are new Apr 27 columns. |
| TC-RPT-011 | Admin | sample_boxes field counts boxes in SAMPLE status for that product | P0 | 1. Authenticate as Admin. 2. Create product P1. Create 3 child boxes for P1, add them to a sample record (status → SAMPLE). 3. GET `/api/v1/reports/product-wise`. Find row for P1. | Row `sample_boxes` = 3. | Integration | New Apr 27 column. |
| TC-RPT-012 | Admin | ecommerce_boxes field counts boxes in ECOMMERCE status for that product | P0 | 1. Authenticate as Admin. 2. Create product P2. Add 4 child boxes to an ecommerce record (status → ECOMMERCE). 3. GET `/api/v1/reports/product-wise`. Find row for P2. | Row `ecommerce_boxes` = 4. | Integration | New Apr 27 column. |
| TC-RPT-013 | Admin | free_boxes field counts only FREE status boxes | P1 | 1. Authenticate as Admin. 2. Create product P3, add 2 FREE boxes and 1 PACKED box. 3. GET `/api/v1/reports/product-wise`. Find P3 row. | `free_boxes` = 2. `packed_boxes` = 1. `total_child_boxes` ≥ 3 (includes all statuses via `COUNT(cb.id)` without status filter). | Integration | |
| TC-RPT-014 | Admin | pairs_in_stock counts FREE + PACKED quantities | P0 | 1. Authenticate as Admin. 2. Product P4: 2 FREE boxes (quantity 2 each) + 1 PACKED box (quantity 5). 3. GET report. Find P4 row. | `pairs_in_stock` = 2×2 + 5 = 9. `pairs_dispatched` = 0 (nothing dispatched). | Integration | `pairs_in_stock = SUM(quantity) FILTER (WHERE status IN ('FREE','PACKED'))` |
| TC-RPT-015 | Admin | pairs_dispatched counts only DISPATCHED quantities | P1 | 1. Authenticate as Admin. 2. Product P5: dispatch 1 box with quantity 3. 3. GET report. Find P5 row. | `pairs_dispatched` = 3. `pairs_in_stock` does not include the dispatched box. | Integration | |
| TC-RPT-016 | Admin | Report ordered by article_name ascending | P1 | 1. Authenticate as Admin. 2. Create products with article_names: "ZARA", "ALPHA", "MANGO". 3. GET `/api/v1/reports/product-wise`. | First row in response has article_name = "ALPHA" (or earliest alphabetically). Rows ordered A-Z by `product_name`. | API | `ORDER BY p.article_name` in service. |
| TC-RPT-017 | Admin | Inactive product excluded from product-wise report | P1 | 1. Authenticate as Admin. 2. Deactivate a product (`is_active = false`). 3. GET `/api/v1/reports/product-wise`. | No row with the deactivated product's `product_id` appears. Only active products returned (`WHERE p.is_active = true`). | API | |
| TC-RPT-018 | Admin | Product with no child boxes appears with all zero counts | P1 | 1. Authenticate as Admin. 2. Create a new active product with no child boxes. 3. GET `/api/v1/reports/product-wise`. Find the product. | Row present with `product_id` = the new product. All count fields = 0: `total_child_boxes`, `free_boxes`, `packed_boxes`, `sample_boxes`, `ecommerce_boxes`, `dispatched_boxes`, `total_pairs`, `pairs_in_stock`, `pairs_dispatched` all = 0. | API | LEFT JOIN in service means zero-box products still appear. |
| TC-RPT-019 | Admin | Product-wise report empty response when no active products | P1 | 1. Authenticate as Admin. 2. Use a clean DB with no active products. 3. GET `/api/v1/reports/product-wise`. | HTTP 200. Response is empty array `[]`. No error. | API | |
| TC-RPT-020 | Admin | Each product SKU+size+colour combination appears as a distinct row | P1 | 1. Authenticate as Admin. 2. Create 2 products with same article_name but different sizes (e.g., size 6 and size 7). 3. GET report. | Two distinct rows for the article, each with different `size` values. Both grouped by `p.id, p.article_name, p.sku, p.size, p.colour` as per service query. | API | |

---

## Section 3 — Inventory Summary Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-030 | Admin | GET /reports/inventory-summary returns required top-level fields | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/reports/inventory-summary`. 3. Assert shape. | HTTP 200. Response contains: `totalProducts` (integer), `totalChildBoxes` (integer), `totalMasterCartons` (integer), `totalPairsInStock` (integer), `totalPairsDispatched` (integer), `childBoxesByStatus` (object), `masterCartonsByStatus` (object). All fields present, non-null. | API | |
| TC-RPT-031 | Admin | childBoxesByStatus object contains keys for each active status | P0 | 1. Authenticate as Admin. 2. Ensure child boxes exist in all statuses: GENERATED, FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED. 3. GET `/api/v1/reports/inventory-summary`. 4. Assert `childBoxesByStatus` keys. | `childBoxesByStatus` contains keys: `"GENERATED"`, `"FREE"`, `"PACKED"`, `"SAMPLE"`, `"ECOMMERCE"`, `"DISPATCHED"`. Each key's value is an integer count ≥ 0. | API | Dynamic GROUP BY — only statuses with at least 1 box appear. |
| TC-RPT-032 | Admin | childBoxesByStatus GENERATED count matches actual GENERATED boxes | P0 | 1. Authenticate as Admin. 2. Generate 5 child boxes (no activate). 3. GET `/api/v1/reports/inventory-summary`. 4. Assert `childBoxesByStatus.GENERATED`. | `childBoxesByStatus.GENERATED` ≥ 5. | Integration | New bucket exposed after Apr 27 mod. |
| TC-RPT-033 | Admin | childBoxesByStatus SAMPLE count matches actual SAMPLE boxes | P0 | 1. Authenticate as Admin. 2. Create sample record, add 3 boxes (status → SAMPLE). 3. GET summary. | `childBoxesByStatus.SAMPLE` ≥ 3. | Integration | New bucket exposed after Apr 27. |
| TC-RPT-034 | Admin | childBoxesByStatus ECOMMERCE count matches actual ECOMMERCE boxes | P0 | 1. Authenticate as Admin. 2. Create EC record, add 4 boxes (status → ECOMMERCE). 3. GET summary. | `childBoxesByStatus.ECOMMERCE` ≥ 4. | Integration | |
| TC-RPT-035 | Admin | Sum of all childBoxesByStatus values equals totalChildBoxes | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/reports/inventory-summary`. 3. Sum all values in `childBoxesByStatus`. | `SUM(childBoxesByStatus values)` = `totalChildBoxes`. | API | Core consistency invariant — GROUP BY exhaustive sum. |
| TC-RPT-036 | Admin | masterCartonsByStatus object contains CREATED, ACTIVE, CLOSED, DISPATCHED | P1 | 1. Authenticate as Admin. 2. Ensure cartons of all 4 statuses exist. 3. GET summary. | `masterCartonsByStatus` contains keys `"CREATED"`, `"ACTIVE"`, `"CLOSED"`, `"DISPATCHED"`. Each is an integer ≥ 0. | API | |
| TC-RPT-037 | Admin | totalPairsInStock in summary counts only FREE + PACKED | P0 | 1. Authenticate as Admin. 2. Ensure GENERATED, SAMPLE, ECOMMERCE boxes exist. 3. GET summary. 4. DB: `SUM(quantity) WHERE status IN ('FREE','PACKED')`. | `totalPairsInStock` = DB sum. GENERATED, SAMPLE, ECOMMERCE quantities excluded. | Integration | Consistent with dashboard. |
| TC-RPT-038 | Admin | Summary returns correct totalMasterCartons (all statuses combined) | P1 | 1. Authenticate as Admin. 2. DB: `SELECT COUNT(*) FROM master_cartons`. 3. GET summary. | `totalMasterCartons` = total master carton count across all statuses. `SUM(masterCartonsByStatus values)` = `totalMasterCartons`. | API | |
| TC-RPT-039 | Admin | GET /reports/inventory-summary/export — CSV export accessible to Admin | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/reports/inventory-summary/export`. 3. Assert Content-Type and body. | HTTP 200. `Content-Type` header contains `text/csv` (or `application/csv`). Response body is a valid CSV string with header row and at least 1 data row. `Content-Disposition` header contains `attachment; filename=...`. | API | |
| TC-RPT-040 | Warehouse Operator | CSV export endpoint returns 403 for Warehouse Operator | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 403. No CSV content returned. | API | |

---

## Section 4 — Carton Inventory Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-050 | Admin | GET /reports/carton-inventory returns list of carton records | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/reports/carton-inventory`. 3. Assert shape. | HTTP 200. Array of carton records. Each contains: `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `closed_at` (nullable), `dispatched_at` (nullable), `created_at`, `created_by_name` (nullable), `destination` (nullable from dispatch), `dispatch_date` (nullable), `vehicle_number` (nullable), `lr_number` (nullable). | API | |
| TC-RPT-051 | Admin | Carton report ordered by created_at DESC | P1 | 1. Authenticate as Admin. 2. Create 2 master cartons at different times. 3. GET `/api/v1/reports/carton-inventory`. | First item in array is the most recently created carton. Last item is oldest. | API | `ORDER BY mc.created_at DESC`. |
| TC-RPT-052 | Supervisor | Supervisor can GET /reports/carton-inventory | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 200. Data returned. | API | |
| TC-RPT-053 | Warehouse Operator | Warehouse Operator cannot GET /reports/carton-inventory — 403 | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 403. | API | |
| TC-RPT-054 | Admin | Dispatched carton row shows destination and vehicle_number from dispatch record | P1 | 1. Authenticate as Admin. 2. Dispatch a carton with destination="Pune Hub", vehicle_number="MH01AB1234". 3. GET `/api/v1/reports/carton-inventory`. Find the carton. | `destination` = "Pune Hub", `vehicle_number` = "MH01AB1234", `dispatch_date` non-null. | Integration | LEFT JOIN to dispatch_records. |
| TC-RPT-055 | Admin | Undispatched carton row shows null for dispatch-related fields | P1 | 1. Authenticate as Admin. 2. Create a master carton in ACTIVE status. 3. GET `/api/v1/reports/carton-inventory`. Find it. | `destination` = null, `dispatch_date` = null, `vehicle_number` = null, `lr_number` = null. | API | |

---

## Section 5 — Frontend E2E — Reports Page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-001 | Admin | Reports page renders with 6 tabs | P0 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Assert tab list. | 6 tabs rendered: "Stock Report", "Carton Inventory", "Dispatch Report", "Daily Activity", "Samples", "E-commerce". "Stock Report" is active by default. Page title "Reports" visible. | E2E | |
| TC-RPT-E2E-002 | Admin | Stock Report tab loads product-wise table | P0 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Ensure "Stock Report" tab active. 4. Assert table visibility and columns. | Product-wise table renders with column headers. Minimum visible columns: SKU, Article, Colour, Size, boxes columns, pairs columns. Data rows loaded from API. | E2E | Frontend calls `reportService.getProductWiseReport()` on mount when tab = 'stock'. |
| TC-RPT-E2E-003 | Admin | Stock Report table shows sample_boxes and ecommerce_boxes columns | P0 | 1. Log in as Admin. 2. Navigate to `/reports`, Stock Report tab. 3. Inspect table column headers. | Table has columns for sample boxes and ecommerce boxes (exact header labels depend on frontend implementation, but data for `sample_boxes` and `ecommerce_boxes` must be visible). | E2E | Note: the frontend `page.tsx` ProductWiseRow interface does NOT include `sample_boxes`/`ecommerce_boxes` in its type definition (lines 33–44) — flag as discrepancy. |
| TC-RPT-E2E-004 | Admin | Stock Report empty state when no active products | P1 | 1. Log in as Admin on clean DB. 2. Navigate to `/reports`, Stock Report tab. | Empty state or empty table shown. No "undefined" errors or crashes. | E2E | |
| TC-RPT-E2E-005 | Admin | Carton Inventory tab loads carton list | P0 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "Carton Inventory" tab. 4. Assert content. | Tab becomes active. Carton inventory table/list loads. Each row shows `carton_barcode`, `status` badge, `child_count`, `created_at`. | E2E | |
| TC-RPT-E2E-006 | Admin | Carton Inventory status filter dropdown filters cartons by status | P1 | 1. Log in as Admin. 2. Navigate to `/reports`, Carton Inventory tab. 3. Select "DISPATCHED" from status filter. | Table updates to show only dispatched cartons. Cartons with other statuses are hidden. The filter uses client-side `useMemo` filtering (`cartonStatusFilter`). | E2E | |
| TC-RPT-E2E-007 | Admin | Switching tabs loads corresponding data (lazy) | P1 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "Dispatch Report" tab. 4. Observe network. | Dispatch Summary API is called only when tab becomes active (`enabled: activeTab === 'dispatch'`). Not called on initial load when "Stock Report" is active. | E2E | `enabled` flag per tab in `useApiQuery`. |
| TC-RPT-E2E-008 | Warehouse Operator | Warehouse Operator cannot access /reports page | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/reports`. | Either: page redirects to a 403/denied page, or the page is accessible but all API calls return 403 and toast errors appear. No report data is rendered. | E2E | Role gate is on backend; frontend may or may not guard the route. Verify behavior. |
| TC-RPT-E2E-009 | Dispatch Operator | Dispatch Operator cannot access /reports — 403 on API calls | P0 | 1. Log in as Dispatch Operator. 2. Navigate to `/reports`. 3. Observe Stock Report tab API call. | API call returns 403. Error toast or error state shown. No product data rendered. | E2E | |
| TC-RPT-E2E-010 | Supervisor | Supervisor can view Stock Report tab with data | P0 | 1. Log in as Supervisor. 2. Navigate to `/reports`. 3. Stock Report tab loads. | HTTP 200 from API. Table populated with product data. No 403 error. | E2E | |
| TC-RPT-E2E-011 | Admin | Loading spinner shown while data fetches | P2 | 1. Log in as Admin on slow network. 2. Navigate to `/reports`. | `PageSpinner` component visible during `stockLoading` state. Table absent during load. Spinner replaced by table once data arrives. | E2E | |
| TC-RPT-E2E-012 | Admin | Samples tab loads sample report | P0 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "Samples" tab. | API call to `/reports/samples` made. Sample report data displayed. Status filter, date range filter, and customer filter inputs are present for the Samples tab. | E2E | |
| TC-RPT-E2E-013 | Admin | E-commerce tab loads ecommerce report | P0 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "E-commerce" tab. | API call to `/reports/ecommerce` made. Ecommerce data displayed. Marketplace filter and status filter inputs present. | E2E | |
| TC-RPT-E2E-014 | Admin | Daily Activity tab shows from_date and to_date filter inputs with default values | P1 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "Daily Activity" tab. | Two date inputs visible: "From" defaulting to 7 days ago, "To" defaulting to today. Activity table/chart loaded for default date range. | E2E | |
| TC-RPT-E2E-015 | Admin | Dispatch Report tab shows date range filter | P1 | 1. Log in as Admin. 2. Navigate to `/reports`. 3. Click "Dispatch Report" tab. | Date range "From" and "To" inputs visible. Report data loaded for default date range (last 7 days). Summary shows `total_dispatches` and `total_cartons_dispatched`. | E2E | |

---

## Open Questions / Discrepancies

> The following items were identified during code review and should be verified before execution:

| # | File | Observation |
|---|---|---|
| 1 | `frontend/src/app/(dashboard)/reports/page.tsx` lines 33–44 | `ProductWiseRow` interface does NOT include `sample_boxes` or `ecommerce_boxes` fields. The backend service (`report.service.ts`) returns both. The frontend table likely renders only the columns defined in the interface, so `sample_boxes` and `ecommerce_boxes` may not appear in the Stock Report table despite being returned by the API. TC-RPT-E2E-003 is marked as a discrepancy flag. |
| 2 | `backend/src/services/inventory.service.ts` line 362 | Product-level `nameExpr` is `"p.size || ' - ₹' || p.mrp"` which uses raw `p.mrp` (NUMERIC(10,2)). This may render as "10 - ₹499.00" (with .00) rather than "10 - ₹499" — inconsistent with the MRP-level CASE expression that strips trailing zeros. TC-STK-061 flags this. |
| 3 | `backend/src/services/inventory.service.ts` lines 305–307 | `getStockByLevel` status filter: `FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED`. GENERATED excluded. The comment confirms intent. |
| 4 | `backend/src/services/dispatch.service.ts` `getDispatches` | `dispatchListQuerySchema` has no `source_type` filter parameter. The source-type dropdown in the frontend (`dispatches/page.tsx`) filters **client-side** in `useMemo`, not via API. Tests should reflect this (TC-DISP-E2E-022). |
| 5 | Scope note vs code | The scope note mentions required dispatch fields: `dispatch_to`, `vehicle_no`, `transporter`, `lr_number`, `eway_bill`, `dispatched_at`, `notes`. The actual Zod schema uses `destination`, `vehicle_number`, `transport_details`, `lr_number`, `dispatch_date`, `notes` — no `eway_bill` field exists. No field is required (all `.optional()`). The scope note's field names do not match the code. |
