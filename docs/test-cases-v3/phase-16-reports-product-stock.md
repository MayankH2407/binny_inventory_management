# Phase 16 — Reports: Stock, Carton Inventory, Samples, E-commerce

**Module:** Reports — `/reports` frontend page (6 tabs) + backend endpoints under `GET /api/v1/reports/*`
**Suite version:** v3 (full refresh)
**Last updated:** 2026-06-09
**Refreshed:** 2026-06-09 (Session A16 — code-verified against current codebase)
**TC ID prefix:** `TC-RPT`
**Playwright specs:** `frontend/e2e/06-reports.spec.ts`, `frontend/e2e/24-reports-rbac.spec.ts`

> **Scope of this file (A16):** Stock Report (`/reports/product-wise` + inventory-summary), Carton Inventory Report (`/reports/carton-inventory`), Samples Report (`/reports/samples`), E-commerce Report (`/reports/ecommerce`) + their CSV exports (`/reports/inventory-summary/export`, `/reports/samples/export`, `/reports/ecommerce/export`). Date/customer/status/marketplace filters. The 6-tab frontend page (tabs: Stock Report, Carton Inventory, Dispatch Report, Daily Activity, Samples, E-commerce). RBAC for all endpoints and page nav.
>
> **Out of scope here (A17):** Dispatch Summary (`/reports/dispatch-summary`) and Daily Activity (`/reports/daily-activity`) reports and their CSV exports.

---

## RBAC — Critical Finding (read before all TCs)

**ALL 12 report endpoints are gated by a single router-level `authorizePermission('reports:view_all')`** applied in `report.routes.ts` line 9. There is no separate gate for exports.

```
router.use(authenticate);
router.use(authorizePermission('reports:view_all'));
```

Seed permissions (verified against `backend/seeds/001_roles.ts`):

| Role | `reports:view_all` | `reports:export` | `reports:view_own` | `reports:view_dispatch` |
|---|:---:|:---:|:---:|:---:|
| Admin | ✓ (super-admin bypass) | ✓ | ✓ | ✓ |
| Supervisor | ✓ | ✓ | — | — |
| Warehouse Operator | — | — | ✓ | — |
| Dispatch Operator | — | — | — | ✓ |

**⚠️ Dead-permission finding:** `reports:view_own` (seeded for Warehouse Operator) and `reports:view_dispatch` (seeded for Dispatch Operator) are **never checked by any route**. The single `reports:view_all` gate blocks both roles at the router level before any handler runs. These permissions are effectively inert unless a future route is added that checks them. TCs document this as the actual observed behavior — 403 for WH Op and Dispatch Op on every report endpoint.

**⚠️ `reports:export` dead too:** The permission catalog defines `reports:export` and it is seeded for Admin and Supervisor, but `report.routes.ts` gates exports via `reports:view_all` only — there is no separate `authorizePermission('reports:export')` middleware on any export route. Export access = view_all access.

**Frontend nav gate:** The sidebar nav item `Reports` has `requiresPermission: 'reports:view_all'` (`frontend/src/constants/index.ts` line 88). WH Op and Dispatch Op do not see the Reports nav link. However, there is **no Next.js route-level page guard** — a WH/Dispatch Op who navigates directly to `/reports` will see the page shell, but every API call will return 403 and no data will render.

---

## API shape notes (code-verified)

### Stock Report — `GET /api/v1/reports/product-wise`
Returns `ProductWiseReport[]`. Each row: `product_id`, `product_name` (= `article_name`), `product_sku`, `size`, `colour`, `total_child_boxes`, `free_boxes`, `packed_boxes`, `sample_boxes`, `ecommerce_boxes`, `dispatched_boxes`, `total_pairs`, `pairs_in_stock` (FREE+PACKED), `pairs_dispatched`. Active products only (`WHERE p.is_active = true`). Zero-box products included (LEFT JOIN). Ordered by `article_name` ASC.

The frontend `ProductWiseRow` interface in `page.tsx` maps the backend field `product_sku` → `sku` and `product_name` → `article_name` (the service returns those backend names; the frontend type uses shorter names). The frontend **does** include `sample_boxes` and `ecommerce_boxes` in its type (lines 33–46) — the old discrepancy from the previous draft is **resolved**.

### Inventory Summary — `GET /api/v1/reports/inventory-summary`
Returns `InventorySummaryReport`: `totalProducts`, `totalChildBoxes`, `totalMasterCartons`, `totalPairsInStock` (FREE+PACKED only), `totalPairsDispatched`, `childBoxesByStatus` (dynamic GROUP BY object — only statuses with ≥1 box appear as keys), `masterCartonsByStatus`.

### Carton Inventory — `GET /api/v1/reports/carton-inventory`
Returns `CartonInventoryRecord[]`. Fields: `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `closed_at`, `dispatched_at`, `created_at`, `created_by_name`, `destination`, `dispatch_date`, `vehicle_number`, `lr_number`. Ordered by `created_at DESC`. No filters accepted.

### Samples Report — `GET /api/v1/reports/samples`
Accepts query params: `from`, `to` (ISO date strings → `new Date()`), `status` (CREATED|ACTIVE|CLOSED|DISPATCHED), `customer_id` (UUID). Returns `{summary, rows}`. Summary: `{total, created, active, closed, dispatched, pairs_total}` (flat integer fields). Rows ordered by `created_at DESC`.

**⚠️ Backend/frontend type mismatch:** Frontend `SampleReportSummary` type (in `frontend/src/types/index.ts`) declares `by_status: Record<string, number>` but the backend service returns flat fields `created`, `active`, `closed`, `dispatched`. The frontend `SamplesTab` component iterates `Object.entries(data.summary.by_status)` — this will render nothing (empty iteration) when the real API response has no `by_status` key. The summary status breakdown cards will not display in the current code. (Backend returns `pairs_total`; frontend type has `total_pairs` — another field name mismatch.)

**⚠️ Frontend field name mismatch in sample rows:** The backend service selects `sr.recipient_name` but the frontend `SampleReportRow` type declares the field as `recipient` (not `recipient_name`). The `SamplesTab` renders `{row.recipient}` which will be `undefined` unless the backend is aliased (it is not in the current query). Recipient will always show as blank/undefined in the UI.

### E-commerce Report — `GET /api/v1/reports/ecommerce`
Accepts: `from`, `to`, `status` (CREATED|ACTIVE|CLOSED|DISPATCHED), `marketplace` (ILIKE partial match). Returns `{summary, rows}`. Summary: flat `{total, created, active, closed, dispatched, pairs_total, by_marketplace[]}`. Rows ordered by `created_at DESC`.

**⚠️ Same summary type mismatch applies:** Frontend `EcommerceReportSummary` declares `by_status: Record<string, number>` but backend returns flat fields. The by-status breakdown cards will not render.

### CSV exports
All CSV files use the `toCSV` helper: every cell is double-quoted; internal double-quotes are escaped as `""`. All `null`/`undefined` values coerce to empty string `""`.

| Export endpoint | Filename | Columns (in order) |
|---|---|---|
| `GET /reports/inventory-summary/export` | `stock-report-{date}.csv` (frontend) | SKU, Article, Colour, Size, Total Boxes, Free, Packed, Dispatched, Total Pairs, In Stock, Dispatched Pairs |
| `GET /reports/samples/export` | `samples-report-{date}.csv` | Sample Barcode, Name, Customer, Recipient, Status, Box Count, Sample Date, Created At, Dispatched At, Created By |
| `GET /reports/ecommerce/export` | `ecommerce-report-{date}.csv` | E-commerce Barcode, Name, Marketplace, Order Reference, Listing SKU, Status, Box Count, Mapped Date, Created At, Dispatched At, Created By |

**⚠️ Stock CSV discrepancy:** `exportInventorySummaryCSV` in `csvExport.service.ts` does NOT include `sample_boxes` or `ecommerce_boxes` columns, even though the underlying `getProductWiseReport()` returns them. The CSV has 11 columns; the API JSON has 13 data fields. These two status columns are silently dropped from the export.

---

## Table of Contents

1. [Section 1 — RBAC Gate (all endpoints, all roles + unauthenticated)](#section-1--rbac-gate)
2. [Section 2 — Stock / Product-wise Report API](#section-2--stock--product-wise-report-api)
3. [Section 3 — Inventory Summary API](#section-3--inventory-summary-api)
4. [Section 4 — Stock CSV Export (`/inventory-summary/export`)](#section-4--stock-csv-export)
5. [Section 5 — Carton Inventory Report API](#section-5--carton-inventory-report-api)
6. [Section 6 — Samples Report API](#section-6--samples-report-api)
7. [Section 7 — Samples CSV Export](#section-7--samples-csv-export)
8. [Section 8 — E-commerce Report API](#section-8--e-commerce-report-api)
9. [Section 9 — E-commerce CSV Export](#section-9--e-commerce-csv-export)
10. [Section 10 — Frontend E2E: Reports Page Shell + Tab Navigation](#section-10--frontend-e2e-reports-page-shell--tab-navigation)
11. [Section 11 — Frontend E2E: Stock Report Tab](#section-11--frontend-e2e-stock-report-tab)
12. [Section 12 — Frontend E2E: Carton Inventory Tab](#section-12--frontend-e2e-carton-inventory-tab)
13. [Section 13 — Frontend E2E: Samples Tab](#section-13--frontend-e2e-samples-tab)
14. [Section 14 — Frontend E2E: E-commerce Tab](#section-14--frontend-e2e-e-commerce-tab)
15. [Section 15 — Frontend E2E: CSV Export Buttons](#section-15--frontend-e2e-csv-export-buttons)
16. [Section 16 — Frontend RBAC: Nav hide + direct URL access](#section-16--frontend-rbac-nav-hide--direct-url-access)
17. [Known Discrepancies](#known-discrepancies)

---

## Section 1 — RBAC Gate

> All 12 report endpoints share a single `authorizePermission('reports:view_all')` router-level middleware. TCs below verify each endpoint × each role × unauthenticated. Roles with only `reports:view_own` or `reports:view_dispatch` also get 403 — those permissions are not consumed by any report route.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-001 | Admin | Admin GET /reports/product-wise → 200 | P0 | 1. POST `/auth/login` as Admin. 2. GET `/api/v1/reports/product-wise` with Bearer token. | HTTP 200. `success: true`. Body is array (may be empty). | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-001 |
| TC-RPT-002 | Supervisor | Supervisor GET /reports/product-wise → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/product-wise`. | HTTP 200. `success: true`. | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-002 |
| TC-RPT-003 | Warehouse Operator | Warehouse Operator GET /reports/product-wise → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/product-wise`. | HTTP 403. `success: false`. No report data. WH Op has `reports:view_own` but NOT `reports:view_all`; single router-level gate rejects. | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-003. Dead-permission: `view_own` never checked. |
| TC-RPT-004 | Dispatch Operator | Dispatch Operator GET /reports/product-wise → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/product-wise`. | HTTP 403. `success: false`. Dispatch Op has `reports:view_dispatch` but NOT `reports:view_all`; rejected. | API | Dead-permission: `view_dispatch` never checked. |
| TC-RPT-005 | Unauthenticated | No token GET /reports/product-wise → 401 | P0 | 1. GET `/api/v1/reports/product-wise` with no Authorization header. | HTTP 401. | API | AUTOMATION GAP: `24-reports-rbac.spec.ts` does not test unauthenticated access to product-wise. |
| TC-RPT-006 | Admin | Admin GET /reports/inventory-summary → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 200. `success: true`. Response body contains `totalProducts`, `totalChildBoxes`, etc. | API | |
| TC-RPT-007 | Supervisor | Supervisor GET /reports/inventory-summary → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 200. `success: true`. | API | |
| TC-RPT-008 | Warehouse Operator | Warehouse Operator GET /reports/inventory-summary → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 403. | API | |
| TC-RPT-009 | Dispatch Operator | Dispatch Operator GET /reports/inventory-summary → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 403. | API | |
| TC-RPT-010 | Unauthenticated | No token GET /reports/inventory-summary → 401 | P0 | 1. GET `/api/v1/reports/inventory-summary` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-011 | Admin | Admin GET /reports/carton-inventory → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 200. `success: true`. Array of carton records. | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-007 |
| TC-RPT-012 | Supervisor | Supervisor GET /reports/carton-inventory → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 200. `success: true`. | API | |
| TC-RPT-013 | Warehouse Operator | Warehouse Operator GET /reports/carton-inventory → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 403. | API | AUTOMATION GAP: `24-reports-rbac.spec.ts` tests WH Op on product-wise but not carton-inventory. |
| TC-RPT-014 | Dispatch Operator | Dispatch Operator GET /reports/carton-inventory → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-015 | Unauthenticated | No token GET /reports/carton-inventory → 401 | P0 | 1. GET `/api/v1/reports/carton-inventory` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-016 | Admin | Admin GET /reports/samples → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples`. | HTTP 200. `success: true`. Response has `{summary, rows}`. | API | AUTOMATION GAP: spec 24 doesn't cover samples/ecommerce endpoints. |
| TC-RPT-017 | Supervisor | Supervisor GET /reports/samples → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/samples`. | HTTP 200. `success: true`. | API | AUTOMATION GAP |
| TC-RPT-018 | Warehouse Operator | Warehouse Operator GET /reports/samples → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/samples`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-019 | Dispatch Operator | Dispatch Operator GET /reports/samples → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/samples`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-020 | Unauthenticated | No token GET /reports/samples → 401 | P0 | 1. GET `/api/v1/reports/samples` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-021 | Admin | Admin GET /reports/ecommerce → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce`. | HTTP 200. `success: true`. Response has `{summary, rows}`. | API | AUTOMATION GAP |
| TC-RPT-022 | Supervisor | Supervisor GET /reports/ecommerce → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/ecommerce`. | HTTP 200. `success: true`. | API | AUTOMATION GAP |
| TC-RPT-023 | Warehouse Operator | Warehouse Operator GET /reports/ecommerce → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/ecommerce`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-024 | Dispatch Operator | Dispatch Operator GET /reports/ecommerce → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/ecommerce`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-025 | Unauthenticated | No token GET /reports/ecommerce → 401 | P0 | 1. GET `/api/v1/reports/ecommerce` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-026 | Admin | Admin GET /reports/inventory-summary/export → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="inventory-summary.csv"`. | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-009 |
| TC-RPT-027 | Supervisor | Supervisor GET /reports/inventory-summary/export → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 200. CSV response. Gate is `reports:view_all` (not a separate `reports:export` check). | API | AUTOMATION GAP: spec 24 only tests Admin for export. |
| TC-RPT-028 | Warehouse Operator | Warehouse Operator GET /reports/inventory-summary/export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 403. No CSV returned. | API | |
| TC-RPT-029 | Dispatch Operator | Dispatch Operator GET /reports/inventory-summary/export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 403. | API | |
| TC-RPT-030 | Unauthenticated | No token GET /reports/inventory-summary/export → 401 | P0 | 1. GET `/api/v1/reports/inventory-summary/export` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-031 | Admin | Admin GET /reports/samples/export → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples/export`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="sample-report.csv"`. | API | AUTOMATION GAP |
| TC-RPT-032 | Supervisor | Supervisor GET /reports/samples/export → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/samples/export`. | HTTP 200. CSV. | API | AUTOMATION GAP |
| TC-RPT-033 | Warehouse Operator | Warehouse Operator GET /reports/samples/export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/samples/export`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-034 | Dispatch Operator | Dispatch Operator GET /reports/samples/export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/samples/export`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-035 | Admin | Admin GET /reports/ecommerce/export → 200 | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="ecommerce-report.csv"`. | API | AUTOMATION GAP |
| TC-RPT-036 | Supervisor | Supervisor GET /reports/ecommerce/export → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 200. CSV. | API | AUTOMATION GAP |
| TC-RPT-037 | Warehouse Operator | Warehouse Operator GET /reports/ecommerce/export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-038 | Dispatch Operator | Dispatch Operator GET /reports/ecommerce/export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 403. | API | AUTOMATION GAP |

---

## Section 2 — Stock / Product-wise Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-100 | Admin | GET /reports/product-wise returns all required columns | P0 | 1. Login as Admin. 2. Ensure ≥1 active product with child boxes exists. 3. GET `/api/v1/reports/product-wise`. 4. Assert shape of first element. | HTTP 200. Each element: `product_id` (UUID string), `product_name` (string), `product_sku` (string), `size` (string), `colour` (string), `total_child_boxes` (integer), `free_boxes` (integer), `packed_boxes` (integer), `sample_boxes` (integer), `ecommerce_boxes` (integer), `dispatched_boxes` (integer), `total_pairs` (integer), `pairs_in_stock` (integer), `pairs_dispatched` (integer). All values are JS numbers (parseInt applied in service). | API | |
| TC-RPT-101 | Admin | Product-wise report excludes inactive products | P1 | 1. Login as Admin. 2. Deactivate a product (PATCH `is_active=false`). 3. GET `/api/v1/reports/product-wise`. | No row with that `product_id` in the response. Query has `WHERE p.is_active = true`. | API | |
| TC-RPT-102 | Admin | Active product with zero child boxes appears with all-zero counts | P1 | 1. Login as Admin. 2. Create a new active product; do not create any child boxes for it. 3. GET `/api/v1/reports/product-wise`. Find the new product's row. | Row present. All count fields = 0: `total_child_boxes`, `free_boxes`, `packed_boxes`, `sample_boxes`, `ecommerce_boxes`, `dispatched_boxes`, `total_pairs`, `pairs_in_stock`, `pairs_dispatched` all = 0. (LEFT JOIN preserves zero-box products.) | API | |
| TC-RPT-103 | Admin | free_boxes counts only FREE-status boxes | P0 | 1. Login as Admin. 2. Create product P-FREE. Create 3 child boxes; activate 2 of them (→FREE); leave 1 as GENERATED. 3. GET product-wise. Find P-FREE row. | `free_boxes` = 2. `total_child_boxes` = 3 (includes GENERATED). | Integration | |
| TC-RPT-104 | Admin | packed_boxes counts only PACKED-status boxes | P0 | 1. Login as Admin. 2. Create product P-PACK. Create 2 FREE boxes, pack both into a carton. 3. GET product-wise. Find P-PACK row. | `packed_boxes` = 2. `free_boxes` = 0. | Integration | |
| TC-RPT-105 | Admin | sample_boxes counts only SAMPLE-status boxes | P0 | 1. Login as Admin. 2. Create product P-SAMP. Create 3 child boxes (→FREE). Add all 3 to a sample record (status → SAMPLE). 3. GET product-wise. Find P-SAMP row. | `sample_boxes` = 3. `free_boxes` = 0. | Integration | |
| TC-RPT-106 | Admin | ecommerce_boxes counts only ECOMMERCE-status boxes | P0 | 1. Login as Admin. 2. Create product P-EC. Create 4 child boxes (→FREE). Add to an ecommerce record (status → ECOMMERCE). 3. GET product-wise. Find P-EC row. | `ecommerce_boxes` = 4. | Integration | |
| TC-RPT-107 | Admin | dispatched_boxes counts only DISPATCHED-status boxes | P0 | 1. Login as Admin. 2. Create product P-DISP. Pack 2 boxes into a carton, close it, dispatch it. 3. GET product-wise. Find P-DISP row. | `dispatched_boxes` = 2. `packed_boxes` = 0. | Integration | |
| TC-RPT-108 | Admin | total_child_boxes is COUNT of ALL boxes regardless of status | P1 | 1. Login as Admin. 2. Create product P-ALL. Create 1 GENERATED, 1 FREE, 1 PACKED, 1 SAMPLE, 1 DISPATCHED box. 3. GET product-wise. Find P-ALL row. | `total_child_boxes` = 5. (No status filter on `COUNT(cb.id)` in service.) | Integration | |
| TC-RPT-109 | Admin | pairs_in_stock = SUM(quantity) WHERE status IN (FREE, PACKED) | P0 | 1. Login as Admin. 2. Create product P-STOCK. Create 2 FREE boxes (qty=3 each) + 1 PACKED box (qty=5). 3. GET product-wise. Find P-STOCK row. | `pairs_in_stock` = 3+3+5 = 11. SAMPLE, ECOMMERCE, DISPATCHED, GENERATED quantities excluded. | Integration | |
| TC-RPT-110 | Admin | pairs_dispatched = SUM(quantity) WHERE status = DISPATCHED | P0 | 1. Login as Admin. 2. Create product P-DPAIRS. Pack 1 box (qty=6), dispatch carton. 3. GET product-wise. Find P-DPAIRS row. | `pairs_dispatched` = 6. `pairs_in_stock` does not include the dispatched qty. | Integration | |
| TC-RPT-111 | Admin | total_pairs = SUM(quantity) across ALL statuses | P1 | 1. Login as Admin. 2. Create product P-TPAIRS. Create boxes: FREE qty=2, PACKED qty=3, SAMPLE qty=4, DISPATCHED qty=5. 3. GET product-wise. | `total_pairs` = 2+3+4+5 = 14. | Integration | |
| TC-RPT-112 | Admin | Rows ordered by article_name ASC | P1 | 1. Login as Admin. 2. Ensure active products exist with names: "ZARA Model", "ALPHA Model", "MANGO Model". 3. GET product-wise. | First row with article_name = "ALPHA Model", last = "ZARA Model". `ORDER BY p.article_name`. | API | |
| TC-RPT-113 | Admin | Each product (unique id) appears as a distinct row | P1 | 1. Login as Admin. 2. Create 2 products with the same article_name but different sizes ("6" and "7") and the same colour. 3. GET product-wise. | Two distinct rows, each with different `size`. Grouped by `p.id, p.article_name, p.sku, p.size, p.colour`. | API | |
| TC-RPT-114 | Admin | Empty response when no active products exist | P1 | 1. Login as Admin on a clean-DB environment. 2. GET `/api/v1/reports/product-wise`. | HTTP 200. Body: `[]`. No error. | API | |
| TC-RPT-115 | Admin | GENERATED boxes NOT counted in free_boxes (only in total_child_boxes) | P1 | 1. Login as Admin. 2. Create product P-GEN. Create 5 GENERATED boxes (do not activate). 3. GET product-wise. Find P-GEN row. | `free_boxes` = 0. `total_child_boxes` = 5. `pairs_in_stock` = 0. | API | Verifies that GENERATED is neither FREE nor stock. |
| TC-RPT-116 | Supervisor | Supervisor product-wise report returns same data as Admin | P1 | 1. Login as Supervisor. 2. GET `/api/v1/reports/product-wise`. | HTTP 200. Same shape as Admin response. Data is system-wide (no per-user scoping). | API | |

---

## Section 3 — Inventory Summary API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-130 | Admin | GET /reports/inventory-summary returns all required top-level fields | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary`. 3. Assert presence of all fields. | HTTP 200. Response body contains all of: `totalProducts` (int), `totalChildBoxes` (int), `totalMasterCartons` (int), `totalPairsInStock` (int), `totalPairsDispatched` (int), `childBoxesByStatus` (object), `masterCartonsByStatus` (object). All non-null. | API | |
| TC-RPT-131 | Admin | totalProducts counts only active products | P0 | 1. Login as Admin. 2. DB: `SELECT COUNT(*) FROM products WHERE is_active = true`. 3. GET summary. | `totalProducts` = DB count. Inactive products excluded. | Integration | |
| TC-RPT-132 | Admin | totalChildBoxes equals sum of all values in childBoxesByStatus | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary`. 3. Sum all values in `childBoxesByStatus`. | `SUM(childBoxesByStatus values)` = `totalChildBoxes`. GROUP BY is exhaustive. | API | Core consistency invariant. |
| TC-RPT-133 | Admin | childBoxesByStatus is dynamic — only statuses with ≥1 box appear | P1 | 1. Login as Admin on a DB where all boxes are in FREE status. 2. GET summary. | `childBoxesByStatus` has key `"FREE"` but NOT keys for empty statuses (e.g., no `"GENERATED"` key if no GENERATED boxes exist). Dynamic GROUP BY. | API | |
| TC-RPT-134 | Admin | childBoxesByStatus.GENERATED reflects actual GENERATED count | P0 | 1. Login as Admin. 2. Create 5 child boxes (do not activate). 3. GET summary. | `childBoxesByStatus.GENERATED` ≥ 5. | Integration | |
| TC-RPT-135 | Admin | childBoxesByStatus.FREE reflects actual FREE count | P0 | 1. Login as Admin. 2. Activate/create N FREE boxes. 3. GET summary. | `childBoxesByStatus.FREE` = N. | Integration | |
| TC-RPT-136 | Admin | childBoxesByStatus.PACKED reflects boxes packed into cartons | P0 | 1. Login as Admin. 2. Pack M boxes into carton(s). 3. GET summary. | `childBoxesByStatus.PACKED` = M. | Integration | |
| TC-RPT-137 | Admin | childBoxesByStatus.SAMPLE reflects SAMPLE-status boxes | P0 | 1. Login as Admin. 2. Add 3 boxes to a sample record. 3. GET summary. | `childBoxesByStatus.SAMPLE` ≥ 3. | Integration | |
| TC-RPT-138 | Admin | childBoxesByStatus.ECOMMERCE reflects ECOMMERCE-status boxes | P0 | 1. Login as Admin. 2. Add 4 boxes to an ecommerce record. 3. GET summary. | `childBoxesByStatus.ECOMMERCE` ≥ 4. | Integration | |
| TC-RPT-139 | Admin | childBoxesByStatus.DISPATCHED reflects dispatched boxes | P0 | 1. Login as Admin. 2. Dispatch a carton with 2 boxes. 3. GET summary. | `childBoxesByStatus.DISPATCHED` ≥ 2. | Integration | |
| TC-RPT-140 | Admin | totalPairsInStock sums only FREE + PACKED quantities | P0 | 1. Login as Admin. 2. Ensure boxes in multiple statuses with known quantities. DB: `SELECT SUM(quantity) FROM child_boxes WHERE status IN ('FREE','PACKED')`. 3. GET summary. | `totalPairsInStock` = DB result. GENERATED, SAMPLE, ECOMMERCE, DISPATCHED quantities excluded. | Integration | Consistent with dashboard stat. |
| TC-RPT-141 | Admin | totalPairsDispatched sums only DISPATCHED quantities | P0 | 1. Login as Admin. 2. Dispatch boxes. DB: `SELECT SUM(quantity) FROM child_boxes WHERE status = 'DISPATCHED'`. 3. GET summary. | `totalPairsDispatched` = DB result. | Integration | |
| TC-RPT-142 | Admin | totalMasterCartons equals sum of masterCartonsByStatus values | P0 | 1. Login as Admin. 2. GET summary. 3. Sum `masterCartonsByStatus` values. | Sum = `totalMasterCartons`. | API | |
| TC-RPT-143 | Admin | masterCartonsByStatus contains keys for each carton status that exists | P1 | 1. Login as Admin. 2. Ensure cartons exist in CREATED, ACTIVE, CLOSED, DISPATCHED states. 3. GET summary. | `masterCartonsByStatus` has keys `"CREATED"`, `"ACTIVE"`, `"CLOSED"`, `"DISPATCHED"`. Each value ≥ 0. | API | |
| TC-RPT-144 | Supervisor | Supervisor gets same inventory summary data as Admin | P1 | 1. Login as Supervisor. 2. GET `/api/v1/reports/inventory-summary`. | HTTP 200. Same fields and consistent values as Admin response. | API | |

---

## Section 4 — Stock CSV Export (`/inventory-summary/export`)

> **Note:** The export endpoint is named `/inventory-summary/export` on the backend and the downloaded filename is `stock-report-{date}.csv` on the frontend. The CSV is generated by `exportInventorySummaryCSV` which calls `getProductWiseReport()` internally.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-150 | Admin | Stock CSV export returns correct Content-Type and Content-Disposition | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 200. `Content-Type` header matches `text/csv`. `Content-Disposition` header = `attachment; filename="inventory-summary.csv"`. | API | Spec: `24-reports-rbac.spec.ts` TC-RPT-API-009 |
| TC-RPT-151 | Admin | Stock CSV header row contains exactly 11 columns | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/inventory-summary/export`. 3. Parse first line. | First line = `"SKU","Article","Colour","Size","Total Boxes","Free","Packed","Dispatched","Total Pairs","In Stock","Dispatched Pairs"`. Exactly 11 quoted fields. | API | ⚠️ Discrepancy: `sample_boxes` and `ecommerce_boxes` are NOT in the CSV despite being in the API JSON response. Document as known gap. |
| TC-RPT-152 | Admin | Stock CSV data rows match product-wise report data | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/product-wise` (JSON). GET `/api/v1/reports/inventory-summary/export` (CSV). 3. Compare data. | CSV rows map 1-to-1 to JSON rows in the same order. CSV `SKU` = JSON `product_sku`, `Article` = `product_name`, `Colour` = `colour`, `Size` = `size`, `Total Boxes` = `total_child_boxes`, `Free` = `free_boxes`, `Packed` = `packed_boxes`, `Dispatched` = `dispatched_boxes`, `Total Pairs` = `total_pairs`, `In Stock` = `pairs_in_stock`, `Dispatched Pairs` = `pairs_dispatched`. | Integration | |
| TC-RPT-153 | Admin | Stock CSV rows for zero-box products have all numeric fields as 0 | P1 | 1. Login as Admin. 2. Create active product with no child boxes. 3. GET CSV. Find the product row. | All numeric columns = `"0"`. No empty string or null in numeric cells. | API | |
| TC-RPT-154 | Admin | Stock CSV double-quote escaping: article name with embedded quote | P1 | 1. Login as Admin. 2. Create product with `article_name` = `BINNY "SPECIAL" MODEL`. 3. GET CSV export. 4. Find the product row. | The Article cell is `"BINNY ""SPECIAL"" MODEL"` — embedded double-quotes are doubled per RFC 4180. `toCSV` helper uses `val.replace(/"/g, '""')`. | API | |
| TC-RPT-155 | Admin | Stock CSV: null/undefined fields rendered as empty string | P1 | 1. Login as Admin. 2. GET CSV where some rows might have null colour or size. | Every cell is double-quoted. Null values coerce to `""` (empty string between quotes). | API | `toCSV` uses `String(val ?? '')`. |
| TC-RPT-156 | Admin | Empty stock: CSV export returns header-only when no active products | P2 | 1. Login as Admin on a clean DB. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 200. Response body contains exactly 1 line (the header row). No data rows. No error. | API | |
| TC-RPT-157 | Supervisor | Supervisor can download stock CSV | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 200. Valid CSV returned. Same gate (`reports:view_all`) as JSON report. | API | AUTOMATION GAP: spec 24 only tests Admin for export. |
| TC-RPT-158 | Warehouse Operator | Warehouse Operator stock CSV export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 403. No CSV content. | API | |
| TC-RPT-159 | Dispatch Operator | Dispatch Operator stock CSV export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/inventory-summary/export`. | HTTP 403. | API | |

---

## Section 5 — Carton Inventory Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-170 | Admin | GET /reports/carton-inventory returns all required fields per row | P0 | 1. Login as Admin. 2. Ensure at least 1 master carton exists. 3. GET `/api/v1/reports/carton-inventory`. 4. Assert shape of first element. | HTTP 200. Each element contains: `id` (UUID), `carton_barcode` (string), `status` (CREATED|ACTIVE|CLOSED|DISPATCHED), `child_count` (int), `max_capacity` (int), `closed_at` (string or null), `dispatched_at` (string or null), `created_at` (string), `created_by_name` (string or null), `destination` (string or null), `dispatch_date` (string or null), `vehicle_number` (string or null), `lr_number` (string or null). | API | |
| TC-RPT-171 | Admin | Carton report ordered by created_at DESC (newest first) | P1 | 1. Login as Admin. 2. Create carton A, then carton B (B is newer). 3. GET `/api/v1/reports/carton-inventory`. | Carton B appears before carton A in the response array. `ORDER BY mc.created_at DESC`. | API | |
| TC-RPT-172 | Admin | Dispatched carton row shows dispatch fields from dispatch_records | P0 | 1. Login as Admin. 2. Create carton, close it, dispatch with destination="Pune Hub", vehicle_number="MH01AB1234", lr_number="LR999". 3. GET carton-inventory. Find the carton. | `destination` = "Pune Hub", `vehicle_number` = "MH01AB1234", `lr_number` = "LR999", `dispatch_date` non-null, `dispatched_at` non-null. | Integration | LEFT JOIN to dispatch_records. |
| TC-RPT-173 | Admin | Non-dispatched carton has null dispatch fields | P1 | 1. Login as Admin. 2. Create a carton in ACTIVE status (not dispatched). 3. GET carton-inventory. Find it. | `destination` = null, `dispatch_date` = null, `vehicle_number` = null, `lr_number` = null. `closed_at` = null (ACTIVE carton). | API | |
| TC-RPT-174 | Admin | Closed-but-not-dispatched carton has closed_at set and null dispatch fields | P1 | 1. Login as Admin. 2. Create and close a carton without dispatching. 3. GET carton-inventory. Find it. | `status` = "CLOSED". `closed_at` non-null. `dispatched_at` = null. `destination` = null. | Integration | |
| TC-RPT-175 | Admin | created_by_name is populated from the users table | P1 | 1. Login as Admin. 2. Create a master carton (created_by = Admin user). 3. GET carton-inventory. Find the row. | `created_by_name` = Admin user's name (e.g., "System Administrator"). LEFT JOIN `users u ON u.id = mc.created_by`. | Integration | |
| TC-RPT-176 | Admin | No query params accepted — carton report is always unfiltered | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/carton-inventory?status=DISPATCHED`. | HTTP 200. Response contains ALL cartons regardless of status query param — controller does not parse query params; `getCartonInventoryReport()` takes no arguments. | API | Contrast with Samples/Ecommerce which do filter. |
| TC-RPT-177 | Supervisor | Supervisor GET /reports/carton-inventory → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 200. Same data as Admin. | API | |
| TC-RPT-178 | Warehouse Operator | Warehouse Operator GET /reports/carton-inventory → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 403. | API | |
| TC-RPT-179 | Dispatch Operator | Dispatch Operator GET /reports/carton-inventory → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 403. | API | |
| TC-RPT-180 | Unauthenticated | No token GET /reports/carton-inventory → 401 | P0 | 1. GET `/api/v1/reports/carton-inventory` without auth. | HTTP 401. | API | AUTOMATION GAP |
| TC-RPT-181 | Admin | Empty response when no cartons exist | P2 | 1. Login as Admin on clean DB. 2. GET `/api/v1/reports/carton-inventory`. | HTTP 200. Body: `[]`. No error. | API | |

---

## Section 6 — Samples Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-200 | Admin | GET /reports/samples returns summary + rows | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples`. 3. Assert shape. | HTTP 200. Response: `{data: {summary: {...}, rows: [...]}}`. Summary fields: `total`, `created`, `active`, `closed`, `dispatched`, `pairs_total` (all integers). Rows ordered by `created_at DESC`. | API | Note: the backend returns these as flat fields (`created`, `active`, etc.), NOT a `by_status` object. |
| TC-RPT-201 | Admin | summary.total counts all sample records matching filters | P0 | 1. Login as Admin. 2. Create 3 sample records. 3. GET `/api/v1/reports/samples`. | `summary.total` ≥ 3. | Integration | |
| TC-RPT-202 | Admin | summary.created counts CREATED-status sample records | P0 | 1. Login as Admin. 2. Create 2 new sample records (default status = CREATED). 3. GET samples report. | `summary.created` ≥ 2. | Integration | |
| TC-RPT-203 | Admin | summary.active counts ACTIVE-status sample records | P1 | 1. Login as Admin. 2. Create a sample record and add at least one box to it (status → ACTIVE). 3. GET report. | `summary.active` ≥ 1. | Integration | |
| TC-RPT-204 | Admin | summary.closed counts CLOSED-status sample records | P1 | 1. Login as Admin. 2. Close a sample record. 3. GET report. | `summary.closed` ≥ 1. | Integration | |
| TC-RPT-205 | Admin | summary.dispatched counts DISPATCHED-status sample records | P1 | 1. Login as Admin. 2. Dispatch a sample record. 3. GET report. | `summary.dispatched` ≥ 1. | Integration | |
| TC-RPT-206 | Admin | summary.pairs_total sums quantities of active (is_active=true) mapped boxes | P0 | 1. Login as Admin. 2. Add 3 boxes (qty=2 each) to a sample record. 3. GET report. | `summary.pairs_total` ≥ 6 (sum via correlated subquery: `SELECT SUM(cb.quantity) FROM sample_box_mapping WHERE is_active=true`). | Integration | Correlated subquery per sample_record row. |
| TC-RPT-207 | Admin | Row fields: all required columns present | P0 | 1. Login as Admin. 2. Create a sample record with customer + boxes. 3. GET report. Find the row. | Each row contains: `sample_barcode`, `name`, `customer_name` (nullable), `recipient_name` (nullable), `status`, `child_count`, `sample_date` (nullable), `created_at`, `dispatched_at` (nullable), `creator_name` (nullable). | API | Note: backend returns `recipient_name`, not `recipient`. Frontend type discrepancy documented in Known Discrepancies. |
| TC-RPT-208 | Admin | Filter by from date — only sample records created on/after from date returned | P0 | 1. Login as Admin. 2. Create sample record S1 on 2026-01-01 (fabricated). 3. GET `/api/v1/reports/samples?from=2026-06-01`. | S1 excluded from rows if S1.created_at < 2026-06-01. | API | Filter: `sr.created_at >= $from`. |
| TC-RPT-209 | Admin | Filter by to date — only records created on/before to date returned | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?to=2026-01-31`. | Only records with `created_at <= 2026-01-31T00:00:00Z` in rows. | API | |
| TC-RPT-210 | Admin | Filter by date range — from and to combined | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?from=2026-05-01&to=2026-05-31`. | Only records created in May 2026 in rows. Records outside range excluded. | API | |
| TC-RPT-211 | Admin | Filter by status=ACTIVE returns only ACTIVE sample records | P0 | 1. Login as Admin. 2. Ensure sample records in multiple statuses exist. 3. GET `/api/v1/reports/samples?status=ACTIVE`. | All rows have `status = "ACTIVE"`. No CREATED/CLOSED/DISPATCHED rows present. | API | |
| TC-RPT-212 | Admin | Filter by status=DISPATCHED returns only dispatched records | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?status=DISPATCHED`. | All rows `status = "DISPATCHED"`. | API | |
| TC-RPT-213 | Admin | Filter by customer_id — only records for that customer returned | P0 | 1. Login as Admin. 2. Create sample record linked to customer C1. 3. GET `/api/v1/reports/samples?customer_id={C1.id}`. | All rows have `customer_name` = C1.firm_name. Records with no customer or other customers excluded. | API | Filter: `sr.customer_id = $customer_id`. |
| TC-RPT-214 | Admin | Combined filters — status + customer_id | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?status=ACTIVE&customer_id={C1.id}`. | Only ACTIVE records belonging to C1 returned. | API | |
| TC-RPT-215 | Admin | No filters — all sample records returned | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples` (no params). | All sample records returned across all statuses, all dates, all customers. | API | |
| TC-RPT-216 | Admin | Invalid status param is passed to DB — no crash | P2 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?status=INVALID_STATUS`. | HTTP 200. `rows: []` (no records match). No 500 error. DB handles gracefully since INVALID_STATUS matches nothing. | API | `status` is passed directly to `WHERE sr.status = $param`; no Zod validation in controller. |
| TC-RPT-217 | Admin | Empty response when no matching records | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples?customer_id=00000000-0000-0000-0000-000000000000`. | HTTP 200. `summary.total` = 0. `rows: []`. | API | |
| TC-RPT-218 | Supervisor | Supervisor GET /reports/samples → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/samples`. | HTTP 200. Same data shape. System-wide data (no scoping by role). | API | |

---

## Section 7 — Samples CSV Export

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-230 | Admin | GET /reports/samples/export returns CSV with correct headers | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples/export`. 3. Parse first line. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="sample-report.csv"`. Header row = `"Sample Barcode","Name","Customer","Recipient","Status","Box Count","Sample Date","Created At","Dispatched At","Created By"`. | API | 10 columns. |
| TC-RPT-231 | Admin | Sample CSV data rows match API JSON rows | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/samples` (JSON). GET `/api/v1/reports/samples/export` (CSV). 3. Compare first data row. | CSV `Sample Barcode` = JSON `sample_barcode`. `Name` = `name`. `Customer` = `customer_name`. `Recipient` = `recipient_name`. `Status` = `status`. `Box Count` = `child_count`. `Sample Date` = `sample_date`. `Created At` = `created_at`. `Dispatched At` = `dispatched_at`. `Created By` = `creator_name`. | Integration | |
| TC-RPT-232 | Admin | Sample CSV filters propagated: from, to, status, customer_id | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples/export?status=ACTIVE`. | CSV contains only ACTIVE sample records. Same WHERE clauses as JSON endpoint. | API | `exportSampleReportCSV` calls `getSampleReport(filters)` with same filter object. |
| TC-RPT-233 | Admin | Null fields in CSV are empty strings | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/samples/export` for a record with no customer (walk-in). | `Customer` cell = `""`. `Dispatched At` = `""` if not dispatched. All cells present (10 per row). | API | `String(val ?? '')` coerces null to empty. |
| TC-RPT-234 | Admin | Sample CSV: embedded double-quote in sample name is escaped | P2 | 1. Login as Admin. 2. Create sample with name containing `"` character. 3. GET samples/export. | The name cell uses `""` doubling for embedded quotes. | API | |
| TC-RPT-235 | Admin | Empty sample export returns header row only | P2 | 1. Login as Admin. 2. GET `/api/v1/reports/samples/export?from=2099-01-01`. (No records in that date range.) | HTTP 200. One line (header). No data rows. | API | |
| TC-RPT-236 | Supervisor | Supervisor GET /reports/samples/export → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/samples/export`. | HTTP 200. Valid CSV. | API | AUTOMATION GAP |
| TC-RPT-237 | Warehouse Operator | Warehouse Operator GET /reports/samples/export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/samples/export`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-238 | Dispatch Operator | Dispatch Operator GET /reports/samples/export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/samples/export`. | HTTP 403. | API | AUTOMATION GAP |

---

## Section 8 — E-commerce Report API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-250 | Admin | GET /reports/ecommerce returns summary + rows | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce`. 3. Assert shape. | HTTP 200. Response: `{data: {summary: {...}, rows: [...]}}`. Summary: `total`, `created`, `active`, `closed`, `dispatched`, `pairs_total` (flat integers), `by_marketplace` (array of `{marketplace, count}`). Rows ordered by `created_at DESC`. | API | |
| TC-RPT-251 | Admin | summary.total counts all ecommerce records matching filters | P0 | 1. Login as Admin. 2. Create 2 ecommerce records. 3. GET ecommerce report. | `summary.total` ≥ 2. | Integration | |
| TC-RPT-252 | Admin | summary.by_marketplace groups records by marketplace value | P0 | 1. Login as Admin. 2. Create 2 records with marketplace="Amazon", 1 with marketplace="Flipkart". 3. GET report. | `summary.by_marketplace` contains `[{marketplace:"Amazon",count:2},{marketplace:"Flipkart",count:1}]` (ordered by count DESC). Null marketplace coalesced to "Unknown". | Integration | Separate SQL query; `COALESCE(er.marketplace, 'Unknown')`. |
| TC-RPT-253 | Admin | summary.pairs_total sums qty of active (is_active=true) mapped boxes | P0 | 1. Login as Admin. 2. Add 4 boxes (qty=5 each) to an ecommerce record. 3. GET report. | `summary.pairs_total` ≥ 20. (Correlated subquery over `ecommerce_box_mapping WHERE is_active=true`.) | Integration | |
| TC-RPT-254 | Admin | Row fields: all required columns present | P0 | 1. Login as Admin. 2. Create an ecommerce record. 3. GET report. Find the row. | Each row: `ecommerce_barcode`, `name`, `marketplace` (nullable), `order_reference` (nullable), `listing_sku` (nullable), `status`, `child_count`, `mapped_date` (nullable), `created_at`, `dispatched_at` (nullable), `creator_name` (nullable). | API | |
| TC-RPT-255 | Admin | Filter by from date — records created before from excluded | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?from=2026-06-01`. | Only records with `created_at >= 2026-06-01T00:00:00Z`. | API | |
| TC-RPT-256 | Admin | Filter by to date | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?to=2026-01-31`. | Only records with `created_at <= 2026-01-31T00:00:00Z`. | API | |
| TC-RPT-257 | Admin | Filter by status=ACTIVE | P0 | 1. Login as Admin. 2. Ensure records in multiple statuses. 3. GET `/api/v1/reports/ecommerce?status=ACTIVE`. | All rows `status = "ACTIVE"`. | API | |
| TC-RPT-258 | Admin | Filter by marketplace (case-insensitive ILIKE partial match) | P0 | 1. Login as Admin. 2. Create records with marketplace="Amazon India" and "Flipkart". 3. GET `/api/v1/reports/ecommerce?marketplace=amazon`. | Rows with "Amazon India" returned. "Flipkart" excluded. Filter: `er.marketplace ILIKE '%amazon%'`. Case-insensitive. | API | |
| TC-RPT-259 | Admin | Filter by marketplace partial string | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?marketplace=kart`. | All records where marketplace contains "kart" (case-insensitive) returned (e.g., "Flipkart"). | API | |
| TC-RPT-260 | Admin | Combined filters: from + status + marketplace | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?from=2026-05-01&status=ACTIVE&marketplace=amazon`. | Only ACTIVE records after 2026-05-01 with Amazon marketplace. | API | |
| TC-RPT-261 | Admin | No filters returns all records | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce` (no params). | All ecommerce records returned. | API | |
| TC-RPT-262 | Admin | summary data respects same filters as rows query | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?status=ACTIVE`. | `summary.total` = count of ACTIVE records only. `summary.active` = same count. `summary.created`, `closed`, `dispatched` reflect only the filtered subset. | API | Both summary and rows queries use the same WHERE clause. |
| TC-RPT-263 | Admin | Null marketplace in DB coalesced to "Unknown" in by_marketplace | P1 | 1. Login as Admin. 2. Create ecommerce record with no marketplace set. 3. GET report. | `summary.by_marketplace` contains entry `{marketplace: "Unknown", count: N}`. | API | `COALESCE(er.marketplace, 'Unknown')` in marketplace GROUP BY query. |
| TC-RPT-264 | Admin | Empty ecommerce response | P2 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce?from=2099-01-01`. | HTTP 200. `summary.total` = 0. `rows: []`. `by_marketplace: []`. | API | |
| TC-RPT-265 | Supervisor | Supervisor GET /reports/ecommerce → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/ecommerce`. | HTTP 200. Same shape. System-wide data. | API | |

---

## Section 9 — E-commerce CSV Export

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-280 | Admin | GET /reports/ecommerce/export returns CSV with correct headers | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce/export`. 3. Parse first line. | HTTP 200. `Content-Type: text/csv`. `Content-Disposition: attachment; filename="ecommerce-report.csv"`. Header row = `"E-commerce Barcode","Name","Marketplace","Order Reference","Listing SKU","Status","Box Count","Mapped Date","Created At","Dispatched At","Created By"`. 11 columns. | API | AUTOMATION GAP |
| TC-RPT-281 | Admin | Ecommerce CSV data rows match API JSON rows | P0 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce` (JSON). GET `/api/v1/reports/ecommerce/export` (CSV). 3. Compare first data row. | CSV columns map: `E-commerce Barcode`=`ecommerce_barcode`, `Name`=`name`, `Marketplace`=`marketplace`, `Order Reference`=`order_reference`, `Listing SKU`=`listing_sku`, `Status`=`status`, `Box Count`=`child_count`, `Mapped Date`=`mapped_date`, `Created At`=`created_at`, `Dispatched At`=`dispatched_at`, `Created By`=`creator_name`. | Integration | |
| TC-RPT-282 | Admin | Ecommerce CSV filters propagated | P1 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce/export?status=DISPATCHED`. | CSV contains only DISPATCHED records. Same filter logic as JSON endpoint. | API | |
| TC-RPT-283 | Admin | Null ecommerce fields render as empty string in CSV | P1 | 1. Login as Admin. 2. GET CSV for a record with no order_reference or listing_sku. | `Order Reference` and `Listing SKU` cells = `""`. | API | |
| TC-RPT-284 | Admin | Empty ecommerce export returns header only | P2 | 1. Login as Admin. 2. GET `/api/v1/reports/ecommerce/export?from=2099-01-01`. | HTTP 200. One header line. No data rows. | API | |
| TC-RPT-285 | Supervisor | Supervisor GET /reports/ecommerce/export → 200 | P0 | 1. Login as Supervisor. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 200. Valid CSV. | API | AUTOMATION GAP |
| TC-RPT-286 | Warehouse Operator | Warehouse Operator GET /reports/ecommerce/export → 403 | P0 | 1. Login as Warehouse Operator. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 403. | API | AUTOMATION GAP |
| TC-RPT-287 | Dispatch Operator | Dispatch Operator GET /reports/ecommerce/export → 403 | P0 | 1. Login as Dispatch Operator. 2. GET `/api/v1/reports/ecommerce/export`. | HTTP 403. | API | AUTOMATION GAP |

---

## Section 10 — Frontend E2E: Reports Page Shell + Tab Navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-001 | Admin | Reports page renders PageHeader with title "Reports" | P0 | 1. Login as Admin. 2. Navigate to `/reports`. 3. Assert page header. | `<PageHeader>` renders with title text "Reports" and description "View inventory reports and export data". Page URL = `/reports`. | E2E | Spec: `06-reports.spec.ts` TC-RPT-001; `24-reports-rbac.spec.ts` TC-RPT-E2E-001 |
| TC-RPT-E2E-002 | Admin | Reports page renders all 6 tabs | P0 | 1. Login as Admin. 2. Navigate to `/reports`. | 6 tab buttons visible: "Stock Report", "Carton Inventory", "Dispatch Report", "Daily Activity", "Samples", "E-commerce". Tabs defined in the `tabs` constant array at page top. | E2E | Spec: `06-reports.spec.ts` TC-RPT-001 checks 4 tabs only — needs update for Samples/E-commerce. |
| TC-RPT-E2E-003 | Admin | "Stock Report" tab is active by default | P0 | 1. Login as Admin. 2. Navigate to `/reports`. | The "Stock Report" tab has the active style (`border-binny-navy text-binny-navy`). `activeTab` initial state = `'stock'`. Stock Report content area is rendered. | E2E | |
| TC-RPT-E2E-004 | Admin | Clicking each tab switches active tab indicator | P1 | 1. Login as Admin. 2. Navigate to `/reports`. 3. Click "Carton Inventory" tab. 4. Observe active style. | "Carton Inventory" gets active border/text. "Stock Report" loses active style. `activeTab` = `'cartons'`. | E2E | |
| TC-RPT-E2E-005 | Admin | Tabs are horizontally scrollable on narrow viewport | P2 | 1. Login as Admin. 2. Set viewport width to 375px. 3. Navigate to `/reports`. | Tab bar scrolls horizontally (`overflow-x-auto`). All 6 tab labels accessible without wrapping. | E2E | |
| TC-RPT-E2E-006 | Admin | PageSpinner shown during data loading | P1 | 1. Login as Admin. 2. Throttle network to slow-3G. 3. Navigate to `/reports`. | `PageSpinner` component visible while `stockLoading = true`. Spinner disappears once data arrives. | E2E | |
| TC-RPT-E2E-007 | Admin | Lazy tab loading — switching tab triggers that tab's API call | P1 | 1. Login as Admin. 2. Navigate to `/reports` (Stock tab active — `GET /reports/product-wise` fires). 3. Listen for network requests. 4. Click "Carton Inventory" tab. | `GET /api/v1/reports/carton-inventory` fires only when the tab becomes active (`enabled: activeTab === 'cartons'`). Not called on initial page load. | E2E | `useApiQuery` with `enabled` flag per tab. |
| TC-RPT-E2E-008 | Admin | Switching away from tab does not refetch on return (keepPreviousData) | P2 | 1. Login as Admin. 2. Open Stock tab (data loads). 3. Click Carton tab. 4. Click back to Stock tab. | Stock data renders immediately from React Query cache (`keepPreviousData`). No second network request for product-wise. | E2E | `placeholderData: keepPreviousData` in each query. |
| TC-RPT-E2E-009 | Supervisor | Supervisor can access and see all 6 tabs on /reports | P0 | 1. Login as Supervisor. 2. Navigate to `/reports`. | Page loads. All 6 tabs visible. Stock Report tab renders data. No access-denied message. | E2E | Spec: `24-reports-rbac.spec.ts` TC-RPT-E2E-004 |

---

## Section 11 — Frontend E2E: Stock Report Tab

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-020 | Admin | Stock Report tab shows desktop table with 12 columns (lg breakpoint) | P0 | 1. Login as Admin. 2. Navigate to `/reports`, Stock tab active. 3. Set viewport ≥1024px. 4. Ensure ≥1 product with boxes exists. | Desktop table renders with column headers: SKU, Article, Colour, Size, Total Boxes, Free, Packed, Sample, E-commerce, Dispatched, Pairs in Stock, Pairs Dispatched. Data rows present. | E2E | Spec: `06-reports.spec.ts` TC-RPT-002; `24-reports-rbac.spec.ts` TC-RPT-E2E-002. 12 columns confirmed in `page.tsx` `StockTab` desktop table. |
| TC-RPT-E2E-021 | Admin | Stock Report shows Sample and E-commerce columns | P0 | 1. Login as Admin. 2. Navigate to `/reports`, Stock tab. 3. Inspect table headers. | "Sample" column header visible (orange text color applied to data cells: `text-orange-600`). "E-commerce" column header visible (violet: `text-violet-600`). Data values displayed from `row.sample_boxes` and `row.ecommerce_boxes`. | E2E | Old discrepancy resolved: `ProductWiseRow` in `page.tsx` now includes these fields. |
| TC-RPT-E2E-022 | Admin | Stock Report Totals row displayed at table bottom | P0 | 1. Login as Admin. 2. Navigate to `/reports`, Stock tab. 3. Ensure ≥2 product rows exist. | A "Totals" row rendered at the bottom of the table body (bold). Contains sum of each numeric column across all rows. Computed by `stockTotals` useMemo. | E2E | Totals row absent if `data.length === 0`. |
| TC-RPT-E2E-023 | Admin | Stock Report mobile cards shown on narrow viewport | P1 | 1. Login as Admin. 2. Set viewport width to 375px. 3. Navigate to `/reports`, Stock tab. | Mobile card layout renders (`.space-y-3.lg:hidden`). Each card shows: SKU, Article-Colour-Size, Total/Free/Packed/Dispatched counts, Pairs in Stock/Sent. Desktop table hidden. | E2E | Note: Mobile cards do NOT show sample_boxes or ecommerce_boxes — these columns are desktop-only. |
| TC-RPT-E2E-024 | Admin | Stock Report empty state message | P1 | 1. Login as Admin on a clean-DB environment. 2. Navigate to `/reports`, Stock tab. | Table shows single row with message "No stock data available" (colSpan=12). Mobile shows `<p>No stock data available</p>`. No JS error. | E2E | |
| TC-RPT-E2E-025 | Supervisor | Supervisor Stock Report tab loads with data | P0 | 1. Login as Supervisor. 2. Navigate to `/reports`. Stock tab is default. | API call to product-wise returns 200. Table renders product data. | E2E | |

---

## Section 12 — Frontend E2E: Carton Inventory Tab

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-040 | Admin | Carton Inventory tab loads on click | P0 | 1. Login as Admin. 2. Navigate to `/reports`. 3. Click "Carton Inventory" tab. | `GET /api/v1/reports/carton-inventory` fires. Table renders with columns: Carton Barcode, Status, Boxes, Created, Closed, Dispatched, Destination. | E2E | Spec: `06-reports.spec.ts` TC-RPT-003 |
| TC-RPT-E2E-041 | Admin | Carton Inventory tab shows status filter dropdown | P0 | 1. Login as Admin. 2. Navigate to Carton Inventory tab. 3. Inspect filter area. | Select dropdown labeled "Filter by Status" visible. Options: "All Statuses", "Created", "Active", "Closed", "Dispatched". Default = "All Statuses" (empty value). | E2E | |
| TC-RPT-E2E-042 | Admin | Status filter CREATED — shows only CREATED cartons | P1 | 1. Login as Admin. 2. Ensure cartons of multiple statuses exist. 3. Carton Inventory tab → select "Created" in status filter. | Table updates to show only CREATED cartons. Client-side filter via `filteredCartons` useMemo: `cartonData.filter(c => c.status === 'CREATED')`. No new API call. | E2E | |
| TC-RPT-E2E-043 | Admin | Status filter DISPATCHED — shows only dispatched cartons with destination | P1 | 1. Login as Admin. 2. Ensure at least 1 dispatched carton. 3. Select "Dispatched" in status filter. | Only DISPATCHED cartons shown. Destination column populated with dispatch destination. | E2E | |
| TC-RPT-E2E-044 | Admin | Clearing status filter ("All Statuses") restores full list | P1 | 1. Login as Admin. 2. Select "Created" filter. 3. Select "All Statuses" (value="""). | All cartons from the full data set displayed. | E2E | Empty string filter value: `if (!cartonStatusFilter) return cartonData` in useMemo. |
| TC-RPT-E2E-045 | Admin | Carton row shows StatusBadge for each status | P1 | 1. Login as Admin. 2. Carton Inventory tab with cartons of mixed statuses. | Each row's Status column renders a `<StatusBadge>` component with the appropriate status string. | E2E | |
| TC-RPT-E2E-046 | Admin | Closed/dispatched timestamps formatted by formatDateTime | P1 | 1. Login as Admin. 2. Carton Inventory tab. Find a closed carton. | `Closed` column shows formatted datetime (not ISO string). `formatDateTime` applied. Undispatched carton shows "-" for Dispatched column. | E2E | |
| TC-RPT-E2E-047 | Admin | Carton Inventory empty state | P2 | 1. Login as Admin on clean DB. 2. Navigate to Carton Inventory tab. | Table shows "No carton data available" (colSpan=7). | E2E | |
| TC-RPT-E2E-048 | Admin | Carton Inventory mobile card layout on narrow viewport | P2 | 1. Login as Admin. 2. Narrow viewport (375px). 3. Navigate to Carton Inventory tab. | Mobile card layout: shows carton_barcode, StatusBadge, Boxes, Created, Closed (if set), Dispatched (if set), Destination (if set). | E2E | |

---

## Section 13 — Frontend E2E: Samples Tab

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-060 | Admin | Samples tab loads on click | P0 | 1. Login as Admin. 2. Navigate to `/reports`. 3. Click "Samples" tab. | `GET /api/v1/reports/samples` fires (with default date params `from=weekAgo`, `to=today`). Response received. | E2E | |
| TC-RPT-E2E-061 | Admin | Samples tab filter panel shows 4 filter controls | P0 | 1. Login as Admin. 2. Click Samples tab. | Filter card shows: "From Date" (date input), "To Date" (date input), "Status" (select dropdown), "Customer" (select dropdown). Defaults: From=7 days ago, To=today, Status/Customer=empty. | E2E | |
| TC-RPT-E2E-062 | Admin | Samples tab customer dropdown populated from customers API | P1 | 1. Login as Admin. 2. Ensure ≥1 active customer exists. 3. Navigate to Samples tab. | Customer select dropdown includes options from `GET /api/v1/customers?limit=200&is_active=true`. Each option: `{value: c.id, label: c.firm_name}`. | E2E | Customers query fires when `activeTab === 'samples'`. |
| TC-RPT-E2E-063 | Admin | Samples tab summary cards displayed | P0 | 1. Login as Admin. 2. Ensure ≥1 sample record exists. 3. Navigate to Samples tab. | Summary cards visible showing `Total` count and `Total Pairs`. Additional status cards rendered from `Object.entries(data.summary.by_status)`. | E2E | ⚠️ Known discrepancy: backend returns flat fields (`created`, `active`, `closed`, `dispatched`), not a `by_status` object. The `by_status` iteration will produce 0 status-breakdown cards. Only "Total" and "Total Pairs" cards will render. Backend/frontend type mismatch. |
| TC-RPT-E2E-064 | Admin | Samples tab data table shows correct columns | P0 | 1. Login as Admin. 2. Ensure ≥1 sample record exists. 3. Navigate to Samples tab. Desktop viewport. | Desktop table columns: Barcode, Name, Recipient, Status, Boxes, Sample Date, Created, Dispatched. | E2E | |
| TC-RPT-E2E-065 | Admin | Recipient column in samples table is blank (field name mismatch) | P1 | 1. Login as Admin. 2. Create sample with recipient_name="Test Person". 3. Navigate to Samples tab. 4. Inspect Recipient cell for that row. | Recipient cell is empty/undefined. Frontend uses `row.recipient` but backend returns `recipient_name`. Until the mismatch is fixed, this column will always be blank. | E2E | ⚠️ Backend/frontend field name mismatch. Document as known gap. |
| TC-RPT-E2E-066 | Admin | Samples filter by status — changing status select triggers re-fetch | P1 | 1. Login as Admin. 2. Navigate to Samples tab. 3. Change Status select to "ACTIVE". | `GET /api/v1/reports/samples?status=ACTIVE` fired. React Query key changes to include `sampleStatus='ACTIVE'`. Table updates. | E2E | |
| TC-RPT-E2E-067 | Admin | Samples filter by customer — selecting customer refetches | P1 | 1. Login as Admin. 2. Navigate to Samples tab. 3. Select a customer from the customer dropdown. | `GET /api/v1/reports/samples?customer_id={id}` fired. React Query key changes. | E2E | |
| TC-RPT-E2E-068 | Admin | Samples filter by date range | P1 | 1. Login as Admin. 2. Navigate to Samples tab. 3. Change From Date. | New API call with updated `from` param. React Query key includes `sampleFromDate`. | E2E | |
| TC-RPT-E2E-069 | Admin | Samples tab empty state message | P1 | 1. Login as Admin. 2. Navigate to Samples tab with filters that match nothing. | Table shows "No samples data for the selected filters" (colSpan=8). | E2E | |
| TC-RPT-E2E-070 | Admin | Samples Export CSV button click initiates download | P0 | 1. Login as Admin. 2. Navigate to Samples tab. 3. Click "Export CSV" button. | Download triggered for `samples-report-{today}.csv`. Uses `reportService.exportSampleReportCsv(filters)`. Toast "Report exported" shown on success. | E2E | Export button rendered via `renderExportButton()` only when `activeTab === 'samples'`. |
| TC-RPT-E2E-071 | Admin | Samples export includes current filter values | P1 | 1. Login as Admin. 2. Navigate to Samples tab. 3. Set status="ACTIVE", customer=C1. 4. Click Export CSV. | Export request includes `?status=ACTIVE&customer_id={C1.id}`. Same filter params used for display and export. | E2E | |
| TC-RPT-E2E-072 | Admin | Samples tab mobile card layout | P2 | 1. Login as Admin. 2. Narrow viewport. 3. Navigate to Samples tab. | Mobile cards show: name, sample_barcode (mono font), StatusBadge, recipient (⚠️ blank due to field mismatch), child_count, sample_date, dispatched_at. | E2E | |

---

## Section 14 — Frontend E2E: E-commerce Tab

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-080 | Admin | E-commerce tab loads on click | P0 | 1. Login as Admin. 2. Navigate to `/reports`. 3. Click "E-commerce" tab. | `GET /api/v1/reports/ecommerce` fires (with default date params). Response received. | E2E | |
| TC-RPT-E2E-081 | Admin | E-commerce tab filter panel shows 4 controls | P0 | 1. Login as Admin. 2. Click E-commerce tab. | Filter card shows: "From Date" (date input), "To Date" (date input), "Status" (select dropdown), "Marketplace" (text input with placeholder "e.g., Amazon, Flipkart..."). Defaults: dates = week range, status/marketplace = empty. | E2E | Marketplace is free-text `<Input>`, not a select. |
| TC-RPT-E2E-082 | Admin | E-commerce summary cards displayed | P0 | 1. Login as Admin. 2. Ensure ≥1 ecommerce record. 3. Navigate to E-commerce tab. | Summary cards: "Total" count card, "Total Pairs" card. Status breakdown cards from `Object.entries(data.summary.by_status)`. By_marketplace section rendered if `data.summary.by_marketplace.length > 0`. | E2E | ⚠️ Same backend/frontend summary type mismatch as Samples — `by_status` key not in backend response; breakdown cards will not render. Only Total and Total Pairs cards will show. |
| TC-RPT-E2E-083 | Admin | By-marketplace breakdown rendered when marketplace data present | P1 | 1. Login as Admin. 2. Ensure ecommerce records with marketplace set. 3. Navigate to E-commerce tab. | "By Marketplace" section visible. Each marketplace rendered as a `<Badge variant="purple">` with count. | E2E | `data.summary.by_marketplace` comes from a separate SQL query and IS present in the backend response. Only the `by_status` breakdown is missing. |
| TC-RPT-E2E-084 | Admin | E-commerce tab data table shows correct columns | P0 | 1. Login as Admin. 2. Ensure ≥1 ecommerce record. 3. Navigate to E-commerce tab. Desktop viewport. | Desktop table columns: Barcode, Name, Marketplace, Order Ref, Listing SKU, Status, Boxes, Mapped Date, Created, Dispatched. 10 columns. | E2E | |
| TC-RPT-E2E-085 | Admin | Null optional fields show "-" in desktop table | P1 | 1. Login as Admin. 2. Create ecommerce record with no marketplace/order_reference/listing_sku. 3. Navigate to E-commerce tab. | `Marketplace`, `Order Ref`, `Listing SKU`, `Mapped Date`, `Dispatched` cells render "-" (from `?? '-'` in JSX). | E2E | |
| TC-RPT-E2E-086 | Admin | E-commerce filter by status select triggers re-fetch | P1 | 1. Login as Admin. 2. Navigate to E-commerce tab. 3. Change Status to "DISPATCHED". | `GET /api/v1/reports/ecommerce?status=DISPATCHED` fired. Table updates. | E2E | |
| TC-RPT-E2E-087 | Admin | E-commerce filter by marketplace text input triggers re-fetch on change | P1 | 1. Login as Admin. 2. Navigate to E-commerce tab. 3. Type "Amazon" in Marketplace input. | After each keystroke, React Query key includes `ecMarketplace='Amazon'`. Request: `?marketplace=Amazon`. API ILIKE matching. | E2E | |
| TC-RPT-E2E-088 | Admin | E-commerce empty state message | P1 | 1. Login as Admin. 2. Apply filters that match nothing. | Table shows "No e-commerce data for the selected filters" (colSpan=10). | E2E | |
| TC-RPT-E2E-089 | Admin | E-commerce Export CSV button click initiates download | P0 | 1. Login as Admin. 2. Navigate to E-commerce tab. 3. Click "Export CSV" button. | Download triggered for `ecommerce-report-{today}.csv`. Uses `reportService.exportEcommerceReportCsv(filters)`. Toast "Report exported" shown. | E2E | |
| TC-RPT-E2E-090 | Admin | E-commerce export includes current filter values | P1 | 1. Login as Admin. 2. Set status="ACTIVE", marketplace="Amazon". 3. Click Export CSV. | Export request includes `?status=ACTIVE&marketplace=Amazon`. | E2E | |
| TC-RPT-E2E-091 | Admin | E-commerce tab mobile card layout | P2 | 1. Login as Admin. 2. Narrow viewport. 3. Navigate to E-commerce tab. | Mobile cards show: name, ecommerce_barcode (mono), StatusBadge, marketplace, order_reference, listing_sku, child_count, mapped_date, dispatched_at. | E2E | |

---

## Section 15 — Frontend E2E: CSV Export Buttons

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-100 | Admin | Export CSV button visible on Stock tab | P0 | 1. Login as Admin. 2. Navigate to `/reports`, Stock tab. | "Export CSV" button with Download icon rendered in `<PageHeader action={...}>` slot. Visible. | E2E | Spec: `06-reports.spec.ts` TC-RPT-006; `24-reports-rbac.spec.ts` TC-RPT-E2E-003 |
| TC-RPT-E2E-101 | Admin | Export CSV button NOT present on Carton Inventory tab | P1 | 1. Login as Admin. 2. Navigate to Carton Inventory tab. | No "Export CSV" button rendered. `renderExportButton()` returns `null` for `activeTab === 'cartons'`. | E2E | Carton inventory has no CSV export endpoint. |
| TC-RPT-E2E-102 | Admin | Export CSV button visible on Dispatch Report tab | P1 | 1. Login as Admin. 2. Navigate to Dispatch Report tab. | Export CSV button rendered with current `dispatchFromDate` and `dispatchToDate` params. (A17 scope for data assertions.) | E2E | |
| TC-RPT-E2E-103 | Admin | Export CSV button visible on Daily Activity tab | P1 | 1. Login as Admin. 2. Navigate to Daily Activity tab. | Export CSV button rendered. (A17 scope for data assertions.) | E2E | |
| TC-RPT-E2E-104 | Admin | Export CSV button visible on Samples tab | P0 | 1. Login as Admin. 2. Navigate to Samples tab. | Export CSV button rendered with inline onClick (uses `reportService.exportSampleReportCsv`). Download initiated on click. | E2E | |
| TC-RPT-E2E-105 | Admin | Export CSV button visible on E-commerce tab | P0 | 1. Login as Admin. 2. Navigate to E-commerce tab. | Export CSV button rendered with inline onClick (uses `reportService.exportEcommerceReportCsv`). Download initiated on click. | E2E | |
| TC-RPT-E2E-106 | Admin | Stock export download uses correct filename | P1 | 1. Login as Admin. 2. Click Export CSV on Stock tab. Intercept the download. | Download filename = `stock-report-{today}.csv` where today = YYYY-MM-DD. File is valid CSV. | E2E | Frontend `handleExport` passes filename as second arg. |
| TC-RPT-E2E-107 | Admin | Export failure shows toast error | P2 | 1. Login as Admin. 2. Mock API to return 500 on export endpoint. 3. Click Export CSV. | Toast "Export failed" shown. No crash. `catch` block calls `toast.error('Export failed')`. | E2E | |
| TC-RPT-E2E-108 | Supervisor | Supervisor can click Export CSV and download stock report | P0 | 1. Login as Supervisor. 2. Navigate to `/reports`, Stock tab. 3. Click Export CSV. | Download initiates. File received. No 403 error (Supervisor has `reports:view_all`). | E2E | AUTOMATION GAP: spec 24 only tests Admin export. |

---

## Section 16 — Frontend RBAC: Nav hide + direct URL access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPT-E2E-110 | Warehouse Operator | Reports nav item hidden from sidebar for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Check the sidebar navigation. | "Reports" nav link is NOT present in the sidebar. `requiresPermission: 'reports:view_all'` in `frontend/src/constants/index.ts` line 88 — sidebar filters out items whose permission the user lacks. | E2E | Spec: `24-reports-rbac.spec.ts` TC-RPT-E2E-005 |
| TC-RPT-E2E-111 | Dispatch Operator | Reports nav item hidden from sidebar for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Check the sidebar. | "Reports" nav link absent. Same `reports:view_all` gate. | E2E | AUTOMATION GAP: spec 24 tests WH Op but not Dispatch Op sidebar. |
| TC-RPT-E2E-112 | Warehouse Operator | Warehouse Operator direct URL /reports — page shell loads but API 403 | P0 | 1. Login as Warehouse Operator. 2. Navigate directly to `/reports` via URL. | Page shell loads (no server-side route guard). All API calls on the Stock tab fire and return 403. Error state or toast errors shown. No report data rendered. No crash. | E2E | No Next.js route-level guard exists. Frontend visibility is nav-only. |
| TC-RPT-E2E-113 | Dispatch Operator | Dispatch Operator direct URL /reports — API 403 on all endpoints | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/reports`. | Same as WH Op: page loads, all API calls 403. | E2E | |
| TC-RPT-E2E-114 | Unauthenticated | Unauthenticated user navigating to /reports is redirected to login | P0 | 1. Clear auth tokens. 2. Navigate to `/reports`. | Redirected to `/login`. Auth middleware in Next.js layout or middleware.ts intercepts unauthenticated requests. | E2E | AUTOMATION GAP |
| TC-RPT-E2E-115 | Admin | Admin can see Reports in sidebar nav | P1 | 1. Login as Admin. 2. Open sidebar. | "Reports" link present with BarChart3 icon. Links to `/reports`. | E2E | |
| TC-RPT-E2E-116 | Supervisor | Supervisor can see Reports in sidebar nav | P1 | 1. Login as Supervisor. 2. Open sidebar. | "Reports" link present. Supervisor has `reports:view_all`. | E2E | |

---

## Known Discrepancies

> These are documented behavioral observations from code review. They describe current actual behavior, not defects to fix during test authoring.

| # | Location | Observation | Impact |
|---|---|---|---|
| D-1 | `backend/src/services/csvExport.service.ts` `exportInventorySummaryCSV` | Stock CSV export omits `sample_boxes` and `ecommerce_boxes` columns. The API JSON returns both; the CSV has only 11 columns and drops these two. | CSV consumers do not get sample/ecommerce breakdown. TC-RPT-151 documents the actual header. |
| D-2 | `backend/seeds/001_roles.ts` + `backend/src/routes/report.routes.ts` | `reports:view_own` (Warehouse Op) and `reports:view_dispatch` (Dispatch Op) are seeded but NO route calls `authorizePermission('reports:view_own')` or `authorizePermission('reports:view_dispatch')`. All 12 report endpoints use `reports:view_all`. These permissions are dead. | Both roles get 403 on all report endpoints. The permissions exist only as Role Manager UI placeholders. |
| D-3 | `backend/seeds/001_roles.ts` + `backend/src/routes/report.routes.ts` | `reports:export` is seeded for Admin and Supervisor but the export routes use `reports:view_all` not `reports:export`. `reports:export` is unused in routing. | No behavioral impact (view_all holders are the same set as export holders). Dead permission. |
| D-4 | `frontend/src/types/index.ts` `SampleReportSummary` | Frontend type declares `by_status: Record<string, number>` and `total_pairs`. Backend service returns flat fields: `total`, `created`, `active`, `closed`, `dispatched`, `pairs_total`. The frontend `SamplesTab` iterates `Object.entries(data.summary.by_status)` — this produces zero entries (no `by_status` key in the API response). Status breakdown cards do not render. Also `total_pairs` vs `pairs_total` mismatch — the "Total Pairs" summary card will show `undefined`. | Status breakdown stat cards are invisible. Total Pairs card shows undefined. |
| D-5 | `frontend/src/types/index.ts` `EcommerceReportSummary` | Same `by_status` mismatch as D-4. Backend returns flat status fields; frontend iterates `by_status` object. Status breakdown cards do not render. | Same impact. `by_marketplace` is correctly structured and does render. |
| D-6 | `frontend/src/types/index.ts` `SampleReportRow.recipient` vs backend `recipient_name` | Frontend type field is `recipient`; backend `getSampleReport` SELECT returns `sr.recipient_name` aliased as `recipient_name`. Frontend template renders `row.recipient` → always `undefined`. Recipient column is always blank. | Recipient information invisible in Samples report table. |
| D-7 | `frontend/src/app/(dashboard)/reports/page.tsx` | No Next.js route-level guard on `/reports`. Nav item is hidden for WH/Dispatch Op, but they can navigate directly to the URL and see the page shell. All API calls 403. No server redirect. | Not a security issue (data is protected at API level) but a UX inconsistency. |
| D-8 | Spec `06-reports.spec.ts` TC-RPT-E2E-001 | Existing spec asserts only 4 tab labels ("Stock Report", "Carton Inventory", "Dispatch Report", "Daily Activity"). Current page has 6 tabs — "Samples" and "E-commerce" are missing from the assertion. | Spec is stale. Needs adding `Samples` and `E-commerce` tab assertions. |
