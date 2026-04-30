# Phase 17 — Reports: Dispatch / Sample / E-commerce + CSV Exports

**Module codes:** `RPT`
**Roles under test:** Admin (`admin@binny.com` / `Admin@123`), Supervisor (`supervisor@binny.com` / `Sup@123`), Warehouse Operator (`warehouse@binny.com` / `Wh@123`), Dispatch Operator (`dispatch@binny.com` / `Dp@123`)
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URL:** `http://localhost:3000`
**Route guard:** `authenticate` + `authorize(Admin, Supervisor)` applied to all `/reports/*` routes — Warehouse and Dispatch Operators get **HTTP 403**.

**Tab labels (frontend `reports/page.tsx` line 24–31):**
`stock` → "Stock Report" | `cartons` → "Carton Inventory" | `dispatch` → "Dispatch Report" | `daily` → "Daily Activity" | `samples` → "Samples" | `ecommerce` → "E-commerce"

**CSV file names (from `reports/page.tsx` `handleExport` / `renderExportButton`):**
- Stock: `stock-report-{YYYY-MM-DD}.csv`
- Dispatch: `dispatch-report-{YYYY-MM-DD}.csv`
- Daily: `daily-activity-{YYYY-MM-DD}.csv`
- Samples: `samples-report-{YYYY-MM-DD}.csv`
- E-commerce: `ecommerce-report-{YYYY-MM-DD}.csv`

**CSV value encoding (from `csvExport.service.ts`):** every cell is double-quote wrapped; internal double-quotes are escaped as `""`.

**Dependencies:** Phases 04 (customers), 05 (products), 07/08 (child boxes), 10 (master cartons), 11 (samples), 12 (ecommerce), 13 (dispatch).

---

## Dispatch Report tab (`GET /api/v1/reports/dispatch-summary`)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-001 | Admin | Dispatch report returns summary and grouped-by-customer data | P0 | 1. Login as Admin, obtain token. 2. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer <admin_token>`. 3. Inspect response body. | HTTP 200; body contains `{ total_dispatches: <integer>, total_cartons_dispatched: <integer>, by_customer: [...] }`; each element in `by_customer` has `customer_id`, `customer_name`, `total_cartons`, `total_dispatches`, `dispatch_dates[]`, `destinations[]`, `items[]`; `items` elements have `article_name`, `colour`, `sizes`, `mrp`, `carton_count`, `box_count`. | API | Requires at least 1 dispatch record in DB. |
| TC-RPT-002 | Supervisor | Supervisor can call dispatch-summary endpoint | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer <supervisor_token>`. | HTTP 200; same shape as TC-RPT-001. | API | |
| TC-RPT-003 | Warehouse Operator | Warehouse Operator is denied dispatch-summary | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer <warehouse_token>`. | HTTP 403; response body contains error message indicating role is not authorised. | API | |
| TC-RPT-004 | Dispatch Operator | Dispatch Operator is denied dispatch-summary | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer <dispatch_token>`. | HTTP 403. | API | |
| TC-RPT-005 | Admin | Date-range filter — single day returns only same-day dispatches | P1 | 1. Note a date `D` when at least 1 dispatch exists and at least 1 dispatch does NOT exist. 2. `GET /api/v1/reports/dispatch-summary?from_date=D&to_date=D`. | HTTP 200; `total_dispatches` equals the count of dispatches on date `D`; dispatches outside `D` are absent from `by_customer` items. | API | |
| TC-RPT-006 | Admin | Date-range filter — from_date only (open upper bound) | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2026-01-01`. | HTTP 200; only dispatches on or after 2026-01-01 appear; no 500 error. | API | |
| TC-RPT-007 | Admin | Date-range filter — to_date only (open lower bound) | P1 | 1. `GET /api/v1/reports/dispatch-summary?to_date=2026-12-31`. | HTTP 200; only dispatches on or before 2026-12-31 appear. | API | |
| TC-RPT-008 | Admin | Future date range returns empty result set | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; `total_dispatches: 0`, `total_cartons_dispatched: 0`, `by_customer: []`. | API | |
| TC-RPT-009 | Admin | from_date after to_date returns empty result | P2 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2026-12-31&to_date=2026-01-01`. | HTTP 200 with empty result set OR HTTP 400 with a clear validation error; no 500 error. | API | |
| TC-RPT-010 | Admin | Walk-in dispatch (no customer_id) appears as "Walk-in / No Customer" | P1 | 1. Create a dispatch record with `customer_id: null`. 2. `GET /api/v1/reports/dispatch-summary`. | HTTP 200; one entry in `by_customer` has `customer_id: null` and `customer_name: "Walk-in / No Customer"`. | API | Requires a dispatch created without a customer. |
| TC-RPT-011 | Admin | Dispatch report frontend tab loads and shows summary cards | P1 | 1. Login at `http://localhost:3000` as Admin. 2. Navigate to `/reports`. 3. Click the "Dispatch Report" tab. | "Dispatch Report" tab is selected (bottom border turns navy). Summary data loads in the table. Date filter inputs default to last 7 days. No console errors. | E2E | |
| TC-RPT-012 | Admin | Dispatch tab date filter updates results on input change | P1 | 1. Navigate to `/reports`, click "Dispatch Report". 2. Change "From" date to 2099-01-01. 3. Change "To" date to 2099-12-31. | Table shows empty state (no rows / "no data" message). No spinner stuck. | E2E | |

---

## Dispatch CSV Export (`GET /api/v1/reports/dispatch-summary/export`)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-013 | Admin | Dispatch CSV export — response headers and content type | P0 | 1. Login as Admin, obtain token. 2. `GET /api/v1/reports/dispatch-summary/export` with `Accept: */*` and `Authorization: Bearer <admin_token>`. | HTTP 200; `Content-Type` is `text/csv` or `application/octet-stream`; response body is non-empty text. | API | |
| TC-RPT-014 | Admin | Dispatch CSV export — header row matches spec | P0 | 1. Export via `GET /api/v1/reports/dispatch-summary/export`. 2. Split body by newline; inspect first line. | First line (after unquoting) equals exactly: `Customer,Dispatch Date,Destination,Carton Barcode,Boxes,Article,Colour,Size,MRP,Vehicle,LR Number,Transport Details,Dispatched By,Notes` (14 columns). | API | Header order from `csvExport.service.ts` line 85–90. |
| TC-RPT-015 | Admin | Dispatch CSV export — every cell is double-quote wrapped | P1 | 1. Export with at least 1 dispatch record in DB. 2. Inspect a data row. | Every cell starts and ends with `"`. Values containing commas or newlines are not broken across cells. | API | Escape fn in `csvExport.service.ts` line 6. |
| TC-RPT-016 | Admin | Dispatch CSV export — row count matches API summary row count | P1 | 1. Call `GET /api/v1/reports/dispatch-summary` and count total individual `items` rows across all customers. 2. Call `GET /api/v1/reports/dispatch-summary/export`. 3. Count CSV data rows (total lines minus 1 for header). | Row counts match (within expected grouping logic — the CSV is per carton-item line, not per dispatch). | Integration | |
| TC-RPT-017 | Admin | Dispatch CSV export with date-range filter carries through to CSV | P1 | 1. `GET /api/v1/reports/dispatch-summary/export?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; CSV body contains only the header row (no data rows). | API | |
| TC-RPT-018 | Supervisor | Supervisor can export dispatch CSV | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary/export`. | HTTP 200; valid CSV body. | API | |
| TC-RPT-019 | Warehouse Operator | Warehouse Operator is denied dispatch CSV export | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/dispatch-summary/export`. | HTTP 403. | API | |
| TC-RPT-020 | Admin | Frontend "Export CSV" button on Dispatch tab triggers browser download | P0 | 1. Navigate to `/reports`, click "Dispatch Report" tab. 2. Click the "Export CSV" button (top-right action). 3. Observe browser download behaviour. | Browser initiates download; filename matches `dispatch-report-YYYY-MM-DD.csv` where YYYY-MM-DD is today's date; downloaded file is a valid CSV with correct header row; toast "Report exported" appears. | E2E | |

---

## Sample Report tab (`GET /api/v1/reports/samples`) — Apr 27 addition

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-021 | Admin | Sample report returns summary + rows | P0 | 1. Login as Admin, obtain token. 2. `GET /api/v1/reports/samples`. | HTTP 200; body contains `{ summary: { total, created, active, closed, dispatched, pairs_total }, rows: [...] }`; each row has `sample_barcode`, `name`, `customer_name`, `recipient_name`, `status`, `child_count`, `sample_date`, `created_at`, `dispatched_at`, `creator_name`. | API | Requires at least 1 sample record. |
| TC-RPT-022 | Supervisor | Supervisor can call sample report | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/samples`. | HTTP 200; same shape as TC-RPT-021. | API | |
| TC-RPT-023 | Warehouse Operator | Warehouse Operator is denied sample report | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/samples`. | HTTP 403. | API | |
| TC-RPT-024 | Dispatch Operator | Dispatch Operator is denied sample report | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/reports/samples`. | HTTP 403. | API | |
| TC-RPT-025 | Admin | Sample report status filter — CREATED | P1 | 1. Ensure at least 1 CREATED and 1 ACTIVE sample record exist. 2. `GET /api/v1/reports/samples?status=CREATED`. | HTTP 200; all rows have `status: "CREATED"`; no ACTIVE/CLOSED/DISPATCHED rows present; `summary.created` equals `summary.total`. | API | |
| TC-RPT-026 | Admin | Sample report status filter — ACTIVE | P1 | 1. `GET /api/v1/reports/samples?status=ACTIVE`. | HTTP 200; all rows have `status: "ACTIVE"`; `summary.active` equals `summary.total`. | API | |
| TC-RPT-027 | Admin | Sample report status filter — CLOSED | P1 | 1. `GET /api/v1/reports/samples?status=CLOSED`. | HTTP 200; all rows have `status: "CLOSED"`; `summary.closed` equals `summary.total`. | API | |
| TC-RPT-028 | Admin | Sample report status filter — DISPATCHED | P1 | 1. `GET /api/v1/reports/samples?status=DISPATCHED`. | HTTP 200; all rows have `status: "DISPATCHED"`; `summary.dispatched` equals `summary.total`. | API | |
| TC-RPT-029 | Admin | Sample report status filter — invalid value | P1 | 1. `GET /api/v1/reports/samples?status=INVALID_STATUS`. | HTTP 400 with validation error referencing `status` field OR HTTP 200 with empty rows (depending on DB behaviour); no 500 error. | API | |
| TC-RPT-030 | Admin | Sample report customer_id filter | P1 | 1. Ensure sample records exist for customer A and customer B. 2. `GET /api/v1/reports/samples?customer_id=<customer_A_id>`. | HTTP 200; all rows have `customer_name` matching customer A; customer B rows absent; `summary.total` equals row count. | API | |
| TC-RPT-031 | Admin | Sample report date-range filter | P1 | 1. `GET /api/v1/reports/samples?from=2026-01-01&to=2026-12-31`. | HTTP 200; only sample records with `created_at` in 2026 appear. | API | |
| TC-RPT-032 | Admin | Sample report combined filters — status + customer_id + date range | P1 | 1. `GET /api/v1/reports/samples?status=ACTIVE&customer_id=<valid_id>&from=2026-01-01&to=2026-12-31`. | HTTP 200; rows satisfy all three predicates simultaneously; summary card totals recalculated for the filtered set. | API | |
| TC-RPT-033 | Admin | Sample report — empty state (no matching records) | P1 | 1. `GET /api/v1/reports/samples?from=2099-01-01&to=2099-12-31`. | HTTP 200; `summary.total: 0`, all summary counts 0, `rows: []`. | API | |
| TC-RPT-034 | Admin | Sample report — summary counts add up | P1 | 1. `GET /api/v1/reports/samples` (no filters). 2. Sum `summary.created + summary.active + summary.closed + summary.dispatched`. | Sum equals `summary.total`. No inconsistency. | API | |
| TC-RPT-035 | Admin | Frontend Samples tab loads and shows summary cards | P1 | 1. Navigate to `/reports`, click "Samples" tab. | Tab is selected. Four summary cards render: CREATED, ACTIVE, CLOSED, DISPATCHED. Table with `sample_barcode`, `name`, `customer`, `recipient`, `status`, `box count` columns. Export CSV button visible top-right. | E2E | |
| TC-RPT-036 | Admin | Frontend Samples tab — filter by status dropdown updates table | P1 | 1. On Samples tab, set status filter to "ACTIVE". | Only ACTIVE rows appear in the table. Summary cards recalculate. | E2E | |
| TC-RPT-037 | Admin | Frontend Samples tab — filter by customer dropdown | P1 | 1. On Samples tab, select a specific customer from the customer dropdown filter. | Only sample records linked to that customer appear; other customers absent. | E2E | |

---

## Sample CSV Export (`GET /api/v1/reports/samples/export`) — Apr 27 addition

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-038 | Admin | Sample CSV export — header row matches spec | P0 | 1. `GET /api/v1/reports/samples/export`. 2. Inspect first CSV line. | First line (unquoted) equals: `Sample Barcode,Name,Customer,Recipient,Status,Box Count,Sample Date,Created At,Dispatched At,Created By` (10 columns). | API | Header from `csvExport.service.ts` lines 141–144. |
| TC-RPT-039 | Admin | Sample CSV export — row count matches report rows | P1 | 1. `GET /api/v1/reports/samples` → note `rows.length`. 2. `GET /api/v1/reports/samples/export` → count data lines (total minus 1). | Counts match. | Integration | |
| TC-RPT-040 | Admin | Sample CSV export carries filters | P1 | 1. `GET /api/v1/reports/samples/export?status=DISPATCHED`. | CSV contains only rows with `Status` column value `"DISPATCHED"`. | API | |
| TC-RPT-041 | Supervisor | Supervisor can export sample CSV | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/samples/export`. | HTTP 200; valid CSV. | API | |
| TC-RPT-042 | Warehouse Operator | Warehouse Operator denied sample CSV export | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/samples/export`. | HTTP 403. | API | |
| TC-RPT-043 | Admin | Frontend Samples tab Export CSV button triggers browser download | P0 | 1. Navigate to `/reports`, click "Samples" tab. 2. Click "Export CSV". | Browser downloads `samples-report-YYYY-MM-DD.csv`; file is valid CSV; header matches spec; toast "Report exported" appears. | E2E | |
| TC-RPT-044 | Admin | Sample CSV — cell with comma in recipient name is properly quoted | P1 | 1. Create a sample record with `recipient_name: "Singh, Rahul"`. 2. Export sample CSV. | The `Recipient` cell contains `"Singh, Rahul"` (double-quoted, comma inside quotes); CSV parser correctly reads it as one cell. | Integration | |

---

## E-commerce Report tab (`GET /api/v1/reports/ecommerce`) — Apr 27 addition

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-045 | Admin | E-commerce report returns summary + rows | P0 | 1. Login as Admin, obtain token. 2. `GET /api/v1/reports/ecommerce`. | HTTP 200; body has `{ summary: { total, created, active, closed, dispatched, pairs_total, by_marketplace: [{marketplace, count}] }, rows: [...] }`; each row has `ecommerce_barcode`, `name`, `marketplace`, `order_reference`, `listing_sku`, `status`, `child_count`, `mapped_date`, `created_at`, `dispatched_at`, `creator_name`. | API | Requires at least 1 ecommerce record. |
| TC-RPT-046 | Supervisor | Supervisor can call e-commerce report | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/ecommerce`. | HTTP 200; same shape as TC-RPT-045. | API | |
| TC-RPT-047 | Warehouse Operator | Warehouse Operator denied e-commerce report | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/ecommerce`. | HTTP 403. | API | |
| TC-RPT-048 | Dispatch Operator | Dispatch Operator denied e-commerce report | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/reports/ecommerce`. | HTTP 403. | API | |
| TC-RPT-049 | Admin | E-commerce report marketplace filter (case-insensitive ILIKE) | P1 | 1. Ensure ecommerce records exist for "Amazon" and "Flipkart". 2. `GET /api/v1/reports/ecommerce?marketplace=amazon`. | HTTP 200; only Amazon rows appear (service uses `ILIKE '%amazon%'`); Flipkart rows absent. | API | Filter uses `ILIKE` — `report.service.ts` line 505. |
| TC-RPT-050 | Admin | E-commerce report status filter — CREATED | P1 | 1. `GET /api/v1/reports/ecommerce?status=CREATED`. | HTTP 200; all rows have `status: "CREATED"`; `summary.created` equals `summary.total`. | API | |
| TC-RPT-051 | Admin | E-commerce report status filter — DISPATCHED | P1 | 1. `GET /api/v1/reports/ecommerce?status=DISPATCHED`. | HTTP 200; all rows have `status: "DISPATCHED"`; `summary.dispatched` equals `summary.total`. | API | |
| TC-RPT-052 | Admin | E-commerce report date-range filter | P1 | 1. `GET /api/v1/reports/ecommerce?from=2026-01-01&to=2026-12-31`. | HTTP 200; only ecommerce records with `created_at` in 2026 appear. | API | |
| TC-RPT-053 | Admin | E-commerce report combined filters — status + marketplace + date range | P1 | 1. `GET /api/v1/reports/ecommerce?status=ACTIVE&marketplace=Meesho&from=2026-01-01&to=2026-12-31`. | HTTP 200; rows satisfy all predicates; `summary.total` equals row count. | API | |
| TC-RPT-054 | Admin | E-commerce report — by_marketplace breakdown sums to total | P1 | 1. `GET /api/v1/reports/ecommerce`. 2. Sum all `summary.by_marketplace[*].count` values. | Sum equals `summary.total`. | API | |
| TC-RPT-055 | Admin | E-commerce report — unknown marketplace appears as "Unknown" | P1 | 1. Create an ecommerce record with no `marketplace` field (null). 2. `GET /api/v1/reports/ecommerce`. | The `by_marketplace` array contains an entry with `marketplace: "Unknown"`. | Integration | Service uses `COALESCE(er.marketplace, 'Unknown')`. |
| TC-RPT-056 | Admin | E-commerce report — empty state with future date range | P1 | 1. `GET /api/v1/reports/ecommerce?from=2099-01-01&to=2099-12-31`. | HTTP 200; `summary.total: 0`, `rows: []`, `summary.by_marketplace: []`. | API | |
| TC-RPT-057 | Admin | Frontend E-commerce tab loads with marketplace filter input | P1 | 1. Navigate to `/reports`, click "E-commerce" tab. | Tab selected. Summary cards show total/created/active/closed/dispatched/by-marketplace. Table with columns: barcode, name, marketplace, order ref, listing SKU, status, box count. Marketplace text filter input visible. Export CSV button visible. | E2E | |
| TC-RPT-058 | Admin | Frontend E-commerce tab marketplace filter updates results | P1 | 1. On E-commerce tab, type "Amazon" in the marketplace filter. | Table rows update to show only Amazon records. | E2E | |

---

## E-commerce CSV Export (`GET /api/v1/reports/ecommerce/export`) — Apr 27 addition

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-059 | Admin | E-commerce CSV export — header row matches spec | P0 | 1. `GET /api/v1/reports/ecommerce/export`. 2. Inspect first CSV line. | First line (unquoted) equals: `E-commerce Barcode,Name,Marketplace,Order Reference,Listing SKU,Status,Box Count,Mapped Date,Created At,Dispatched At,Created By` (11 columns). | API | Header from `csvExport.service.ts` lines 170–174. |
| TC-RPT-060 | Admin | E-commerce CSV export — row count matches report rows | P1 | 1. `GET /api/v1/reports/ecommerce` → note `rows.length`. 2. `GET /api/v1/reports/ecommerce/export` → count data lines minus 1. | Counts match. | Integration | |
| TC-RPT-061 | Admin | E-commerce CSV export carries marketplace filter | P1 | 1. `GET /api/v1/reports/ecommerce/export?marketplace=Flipkart`. | CSV contains only rows with `Marketplace` column value `"Flipkart"` (case-insensitive match on backend). | API | |
| TC-RPT-062 | Supervisor | Supervisor can export e-commerce CSV | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/ecommerce/export`. | HTTP 200; valid CSV. | API | |
| TC-RPT-063 | Warehouse Operator | Warehouse Operator denied e-commerce CSV export | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/reports/ecommerce/export`. | HTTP 403. | API | |
| TC-RPT-064 | Admin | Frontend E-commerce tab Export CSV button triggers browser download | P0 | 1. Navigate to `/reports`, click "E-commerce" tab. 2. Click "Export CSV". | Browser downloads `ecommerce-report-YYYY-MM-DD.csv`; file is valid CSV; header matches 11-column spec; toast "Report exported" appears. | E2E | |

---

## Cross-tab and general report tests

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RPT-065 | Admin | Reports page tab switching preserves each tab's filter state | P2 | 1. On "Dispatch Report" tab, set from-date to 2026-01-01. 2. Click "Samples" tab. 3. Click "Dispatch Report" tab again. | Dispatch Report from-date still shows 2026-01-01 (filter state preserved in local component state). | E2E | React state persists during same-session navigation. |
| TC-RPT-066 | Admin | Unauthenticated request to any report endpoint returns 401 | P0 | 1. `GET /api/v1/reports/samples` with no Authorization header. | HTTP 401; JSON error body. | API | |
| TC-RPT-067 | Admin | Reports page is not accessible to Warehouse Operator in browser | P0 | 1. Login to frontend as Warehouse Operator. 2. Navigate to `/reports` directly. | Page either redirects to dashboard/home OR shows a 403/access-denied message; no report data is rendered. | E2E | |
| TC-RPT-068 | Admin | Export CSV button absent (or hidden) for tabs without a CSV export | P2 | 1. Navigate to `/reports`, click "Carton Inventory" tab. 2. Check page header action area. | No "Export CSV" button visible for the Carton Inventory tab (not implemented in `renderExportButton`). | E2E | `renderExportButton` returns `null` for `cartons` tab. |
| TC-RPT-069 | Admin | Invalid date string in filter does not 500 the server | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=not-a-date&to_date=also-not-a-date`. | HTTP 400 with validation error OR HTTP 200 with empty data; no HTTP 500. | API | |
| TC-RPT-070 | Admin | All report endpoints are absent from the unauthenticated health check route list | P2 | 1. `GET /api/v1/health`. 2. Verify it does not accidentally bypass auth. | Health check returns `{ status: "ok" }` without any inventory data; all report endpoints require a valid JWT. | API | |
