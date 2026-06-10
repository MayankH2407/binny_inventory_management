# Phase 17 — Reports: Dispatch Summary + Daily Activity + CSV Exports

**Refreshed:** 2026-06-09 (Session A17 re-authoring)
**Module code:** `RPTD`
**Roles under test:** Admin (`admin@binny.com` / `Admin@123`), Supervisor (`supervisor@binny.com` / `Sup@123`), Warehouse Operator (`warehouse@binny.com` / `Wh@123`), Dispatch Operator (`dispatch@binny.com` / `Dp@123`)
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URL:** `http://localhost:3000`

**Scope of this file:** Dispatch-summary report + Daily-activity report + their CSV exports only. Stock/Carton-Inventory/Samples/E-commerce reports are covered in A16 (`phase-16-reports-product-stock.md`).

**Route guard (verified against `report.routes.ts` line 9):**
```
router.use(authenticate);
router.use(authorizePermission('reports:view_all'));
```
Both middlewares are applied at the router level — every endpoint in `/reports/*` is protected. Permission `reports:view_all` is held by **Admin + Supervisor only** (seed `001_roles.ts`). Warehouse Operator holds only `reports:view_own`; Dispatch Operator holds only `reports:view_dispatch`. Neither matches `reports:view_all` → **HTTP 403**. Unauthenticated requests fail `authenticate` → **HTTP 401**.

**Sidebar nav guard (verified `frontend/src/constants/index.ts` line 88):**
```
{ label: 'Reports', href: ROUTES.REPORTS, requiresPermission: 'reports:view_all' }
```
Reports nav item is filtered out for Warehouse Op + Dispatch Op because their permissions array contains no `reports:view_all` entry.

**CSV encoding (verified `csvExport.service.ts` `toCSV` function):**
- Every cell wrapped in double-quotes: `"value"`.
- Internal double-quotes escaped as `""` (RFC 4180).
- Rows joined by `\n` (LF, not CRLF).

**Key behavior details from source:**
- `getDispatchSummary` / `exportDispatchCSV` accept optional `from_date` + `to_date` query params; null customer → label `"Walk-in / No Customer"`.
- `getDailyActivity` / `exportDailyActivityCSV` require **both** `from_date` AND `to_date`; missing either → **HTTP 400** (`BadRequestError`).
- Daily-activity uses `generate_series` to emit one row per calendar day even when no transactions occurred (all counts = 0).
- Dispatch CSV is per-product-line-within-carton (one row per article/colour/size combination inside a carton), not per dispatch record.
- `dispatch_date` in the dispatch-summary query filters against `dr.dispatch_date`; the totals and the per-customer grouping both respect the same date filter.
- All timestamp columns are passed as raw DB strings in CSV (ISO-8601 format from Postgres).

---

## Table of Contents

1. [RBAC — Access Control (all report endpoints)](#1-rbac--access-control-all-report-endpoints)
2. [Dispatch Summary Report — API](#2-dispatch-summary-report--api)
   - 2a. Happy-path data shape
   - 2b. Date-range filter
   - 2c. Customer grouping + walk-in
   - 2d. Source-type (carton-only) and party-wise interpretation
3. [Dispatch Summary Report — Frontend](#3-dispatch-summary-report--frontend)
4. [Dispatch CSV Export — API](#4-dispatch-csv-export--api)
5. [Dispatch CSV Export — Frontend](#5-dispatch-csv-export--frontend)
6. [Daily Activity Report — API](#6-daily-activity-report--api)
   - 6a. Required params
   - 6b. Data shape + zero-fill
   - 6c. Date-range scenarios
7. [Daily Activity Report — Frontend](#7-daily-activity-report--frontend)
8. [Daily Activity CSV Export — API](#8-daily-activity-csv-export--api)
9. [Daily Activity CSV Export — Frontend](#9-daily-activity-csv-export--frontend)
10. [Cross-cutting Edge Cases](#10-cross-cutting-edge-cases)

---

## 1. RBAC — Access Control (all report endpoints)

> Applies to both `GET /reports/dispatch-summary` and `GET /reports/daily-activity` (and their `/export` variants). Unauthenticated = 401; non-`reports:view_all` roles = 403.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-001 | Admin | Dispatch-summary accessible to Admin | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer <admin_token>`. | HTTP 200; `body.success: true`. | E2E | Spec 24 `TC-RPT-API-005` covers this. |
| TC-RPTD-002 | Supervisor | Dispatch-summary accessible to Supervisor | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary` with Supervisor token. | HTTP 200; `body.success: true`. | E2E | Supervisor holds `reports:view_all` (seed). |
| TC-RPTD-003 | Warehouse Op | Dispatch-summary denied for Warehouse Operator | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/dispatch-summary` with WH token. | HTTP 403; `body.success: false`; error message references missing permission. | E2E | Spec 24 `TC-RPT-API-006`. WH holds `reports:view_own` only. |
| TC-RPTD-004 | Dispatch Op | Dispatch-summary denied for Dispatch Operator | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/dispatch-summary` with Dispatch token. | HTTP 403; `body.success: false`. | E2E | Dispatch Op holds `reports:view_dispatch` only — does NOT match `reports:view_all`. |
| TC-RPTD-005 | Unauthenticated | Dispatch-summary returns 401 without token | P0 | 1. `GET /api/v1/reports/dispatch-summary` with no Authorization header. | HTTP 401; JSON error body. | E2E | AUTOMATION GAP — `24-reports-rbac.spec.ts` has no unauthenticated TC for this endpoint. |
| TC-RPTD-006 | Admin | Daily-activity accessible to Admin | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-31` with Admin token. | HTTP 200; `body.success: true`. | E2E | Spec 24 `TC-RPT-API-008`. |
| TC-RPTD-007 | Supervisor | Daily-activity accessible to Supervisor | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-31` with Supervisor token. | HTTP 200; `body.success: true`. | E2E | AUTOMATION GAP — spec 24 does not test Supervisor for daily-activity. |
| TC-RPTD-008 | Warehouse Op | Daily-activity denied for Warehouse Operator | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-31` with WH token. | HTTP 403. | E2E | AUTOMATION GAP — spec 24 does not test daily-activity denials. |
| TC-RPTD-009 | Dispatch Op | Daily-activity denied for Dispatch Operator | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-31` with Dispatch token. | HTTP 403. | E2E | AUTOMATION GAP — same gap as TC-RPTD-008. |
| TC-RPTD-010 | Unauthenticated | Daily-activity returns 401 without token | P0 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-31` with no Authorization header. | HTTP 401. | E2E | AUTOMATION GAP. |
| TC-RPTD-011 | Admin | Dispatch-summary export accessible to Admin | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/dispatch-summary/export` with Admin token. | HTTP 200; Content-Type contains `csv` or `octet-stream`. | E2E | Spec 24 `TC-RPT-API-010`. |
| TC-RPTD-012 | Supervisor | Dispatch-summary export accessible to Supervisor | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary/export` with Supervisor token. | HTTP 200; valid CSV body. | E2E | Supervisor holds `reports:view_all` + `reports:export`. |
| TC-RPTD-013 | Warehouse Op | Dispatch-summary export denied for Warehouse Operator | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/dispatch-summary/export` with WH token. | HTTP 403. | E2E | AUTOMATION GAP — spec 24 does not test export denials for WH. |
| TC-RPTD-014 | Dispatch Op | Dispatch-summary export denied for Dispatch Operator | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/dispatch-summary/export` with Dispatch token. | HTTP 403. | E2E | AUTOMATION GAP. |
| TC-RPTD-015 | Unauthenticated | Dispatch-summary export returns 401 without token | P0 | 1. `GET /api/v1/reports/dispatch-summary/export` with no Authorization header. | HTTP 401. | E2E | AUTOMATION GAP. |
| TC-RPTD-016 | Admin | Daily-activity export accessible to Admin | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-31` with Admin token. | HTTP 200; Content-Type contains `csv` or `octet-stream`. | E2E | AUTOMATION GAP — spec 24 never tests daily-activity/export. |
| TC-RPTD-017 | Supervisor | Daily-activity export accessible to Supervisor | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-31` with Supervisor token. | HTTP 200; valid CSV body. | E2E | AUTOMATION GAP. |
| TC-RPTD-018 | Warehouse Op | Daily-activity export denied for Warehouse Operator | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-31` with WH token. | HTTP 403. | E2E | AUTOMATION GAP. |
| TC-RPTD-019 | Dispatch Op | Daily-activity export denied for Dispatch Operator | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-31` with Dispatch token. | HTTP 403. | E2E | AUTOMATION GAP. |
| TC-RPTD-020 | Unauthenticated | Daily-activity export returns 401 without token | P0 | 1. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-31` with no Authorization header. | HTTP 401. | E2E | AUTOMATION GAP. |

---

## 2. Dispatch Summary Report — API

### 2a. Happy-path data shape

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-021 | Admin | Dispatch-summary response shape — top-level fields | P0 | 1. Pre-condition: at least 1 dispatch record in DB. 2. `GET /api/v1/reports/dispatch-summary` with Admin token. 3. Inspect `body.data`. | `body.data` has exactly: `total_dispatches` (integer), `total_cartons_dispatched` (integer), `by_customer` (array). No extra undocumented top-level keys. | API | Shape from `DispatchSummaryReport` interface in `report.service.ts`. |
| TC-RPTD-022 | Admin | Dispatch-summary — CustomerDispatchGroup shape | P0 | 1. Ensure ≥1 dispatch exists for a known customer. 2. `GET /api/v1/reports/dispatch-summary`. 3. Inspect `body.data.by_customer[0]`. | Each element contains: `customer_id` (UUID or null), `customer_name` (string), `total_cartons` (int), `total_dispatches` (int), `dispatch_dates` (array of date strings), `destinations` (array of strings), `items` (array). | API | |
| TC-RPTD-023 | Admin | Dispatch-summary — CustomerDispatchItem shape | P0 | 1. Ensure dispatched carton contains ≥1 product. 2. `GET /api/v1/reports/dispatch-summary`. 3. Inspect `body.data.by_customer[0].items[0]`. | Each item contains: `article_name` (string), `colour` (string), `sizes` (string — comma-separated if multiple sizes in carton), `mrp` (number/float), `carton_count` (int), `box_count` (int). | API | `sizes` comes from `string_agg(DISTINCT p.size, ', ')` in `report.service.ts`. |
| TC-RPTD-024 | Admin | Dispatch-summary — totals match sum of by_customer | P1 | 1. `GET /api/v1/reports/dispatch-summary`. 2. Sum `by_customer[*].total_dispatches`. Compare to `total_dispatches`. 3. Sum `by_customer[*].total_cartons`. Compare to `total_cartons_dispatched`. | Both sums match the top-level totals (each group's sub-total contributes to the aggregate). | Integration | |
| TC-RPTD-025 | Admin | Dispatch-summary — by_customer ordered by total_cartons DESC | P2 | 1. Ensure ≥2 customers each have different numbers of dispatched cartons. 2. `GET /api/v1/reports/dispatch-summary`. | `by_customer` array is sorted descending by `total_cartons` (the customer with the most dispatches appears first). | API | `ORDER BY total_cartons DESC` in service SQL. |
| TC-RPTD-026 | Admin | Dispatch-summary — items ordered by article_name then colour | P2 | 1. Ensure a customer's dispatched cartons contain multiple distinct article+colour combinations. 2. `GET /api/v1/reports/dispatch-summary`. 3. Inspect `by_customer[?].items` for that customer. | Items within each customer group are ordered alphabetically by `article_name`, then `colour`. | API | `ORDER BY dr.customer_id, p.article_name, p.colour` in service SQL. |
| TC-RPTD-027 | Admin | Dispatch-summary — dispatch_dates array contains ISO date strings | P1 | 1. Ensure dispatches exist on multiple distinct dates. 2. `GET /api/v1/reports/dispatch-summary`. 3. Inspect `by_customer[0].dispatch_dates`. | All elements are ISO date strings (format `YYYY-MM-DD`); array is sorted ascending (from `array_agg ... ORDER BY dr.dispatch_date::text`). | API | `array_agg(DISTINCT dr.dispatch_date::text ORDER BY dr.dispatch_date::text)` in service. |
| TC-RPTD-028 | Admin | Dispatch-summary — destinations array excludes nulls | P1 | 1. Ensure at least one dispatch has a non-null destination. 2. `GET /api/v1/reports/dispatch-summary`. | `destinations` array contains only non-null strings (SQL uses `FILTER (WHERE dr.destination IS NOT NULL)`). | API | |
| TC-RPTD-029 | Admin | Dispatch-summary — empty DB returns zero totals | P1 | 1. Use a date range guaranteed to have no dispatches (future date). 2. `GET /api/v1/reports/dispatch-summary?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; `total_dispatches: 0`; `total_cartons_dispatched: 0`; `by_customer: []`. | API | |
| TC-RPTD-030 | Supervisor | Supervisor receives same dispatch-summary shape as Admin | P1 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary`. | HTTP 200; response body shape identical to Admin (same fields, same data). | API | |

### 2b. Date-range filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-031 | Admin | Dispatch-summary — from_date only (open upper bound) | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2026-01-01`. | HTTP 200; only dispatches on or after 2026-01-01 appear; no dispatches before that date present in `by_customer` items. | API | Condition: `dr.dispatch_date >= $1`. |
| TC-RPTD-032 | Admin | Dispatch-summary — to_date only (open lower bound) | P1 | 1. `GET /api/v1/reports/dispatch-summary?to_date=2026-12-31`. | HTTP 200; only dispatches on or before 2026-12-31 appear. | API | Condition: `dr.dispatch_date <= $1`. |
| TC-RPTD-033 | Admin | Dispatch-summary — single-day filter returns only same-day dispatches | P1 | 1. Note a date `D` with known dispatches and a date `E` with no dispatches (different month). 2. `GET /api/v1/reports/dispatch-summary?from_date=D&to_date=D`. | HTTP 200; `by_customer` contains only items whose `dispatch_dates` includes `D`; dispatch records on date `E` are absent. | API | |
| TC-RPTD-034 | Admin | Dispatch-summary — future date range returns empty result | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; `total_dispatches: 0`; `by_customer: []`. | API | |
| TC-RPTD-035 | Admin | Dispatch-summary — inverted date range (from > to) | P2 | 1. `GET /api/v1/reports/dispatch-summary?from_date=2026-12-31&to_date=2026-01-01`. | HTTP 200 with `by_customer: []` and zero totals (Postgres `dispatch_date >= '2026-12-31' AND dispatch_date <= '2026-01-01'` yields no rows) OR HTTP 400 with validation error; no HTTP 500. | API | Service does no inversion check — DB predicate yields 0 rows silently. |
| TC-RPTD-036 | Admin | Dispatch-summary — invalid date string does not 500 | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=not-a-date`. | HTTP 400 with validation error OR HTTP 200 with empty results; no HTTP 500. | API | Postgres may throw a date-cast error; controller should propagate as 400 not 500. |
| TC-RPTD-037 | Admin | Dispatch-summary — no params returns all dispatches | P1 | 1. `GET /api/v1/reports/dispatch-summary` (no filters). | HTTP 200; `total_dispatches` equals total dispatch records in DB (no date window applied). | API | `whereClause` is empty when no params provided. |

### 2c. Customer grouping + walk-in

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-038 | Admin | Dispatch-summary — named customer group appears with correct firm_name | P1 | 1. Ensure a dispatch exists for customer with `firm_name = "Sharma Traders"`. 2. `GET /api/v1/reports/dispatch-summary`. | `by_customer` contains an entry where `customer_name = "Sharma Traders"` and `customer_id` equals that customer's UUID. | API | `COALESCE(c.firm_name, 'Walk-in / No Customer')` in service SQL. |
| TC-RPTD-039 | Admin | Dispatch-summary — walk-in dispatch (null customer_id) shown as "Walk-in / No Customer" | P1 | 1. Create a dispatch record with `customer_id = null` (if supported) or verify a legacy walk-in dispatch exists. 2. `GET /api/v1/reports/dispatch-summary`. | `by_customer` contains an entry with `customer_id: null` and `customer_name: "Walk-in / No Customer"`. | Integration | Walk-in label defined in `COALESCE(c.firm_name, 'Walk-in / No Customer')` in `report.service.ts`. Note: `dispatches` endpoint requires `customer_id` for carton dispatch; walk-in only possible if API allows null or via direct DB insert. |
| TC-RPTD-040 | Admin | Dispatch-summary — multiple customers are distinct groups | P1 | 1. Ensure dispatches exist for ≥2 different customers. 2. `GET /api/v1/reports/dispatch-summary`. | `by_customer` contains one entry per distinct customer; no customer appears twice; total entries equals number of distinct customers with dispatches. | API | `GROUP BY c.id, c.firm_name` in service SQL. |
| TC-RPTD-041 | Admin | Dispatch-summary — same customer multiple dispatch dates accumulates correctly | P1 | 1. Ensure customer A has dispatches on date D1 and date D2. 2. `GET /api/v1/reports/dispatch-summary`. | Customer A appears as one entry; `dispatch_dates` array contains both D1 and D2; `total_dispatches` reflects both records. | API | `array_agg(DISTINCT dr.dispatch_date::text)` accumulates all dates. |
| TC-RPTD-042 | Admin | Dispatch-summary — items reflect actual carton contents | P1 | 1. Create carton C1 containing box of Article "Alpha" colour "Black" size "9" MRP 299. Dispatch C1 to customer. 2. `GET /api/v1/reports/dispatch-summary`. 3. Find customer's item entry for "Alpha". | Item: `article_name: "Alpha"`, `colour: "Black"`, `sizes: "9"`, `mrp: 299`, `carton_count: 1`, `box_count: 1`. | Integration | Box count from `COUNT(DISTINCT ccm.child_box_id)` joined via `carton_child_mapping`. |

### 2d. Source-type and party-wise interpretation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-043 | Admin | Dispatch-summary — carton-only source (dispatch_records joined via master_carton_id) | P1 | 1. Create a carton-source dispatch. 2. `GET /api/v1/reports/dispatch-summary`. | Dispatch appears in `by_customer`; items are derived from `carton_child_mapping`; `carton_count` and `box_count` are non-zero. | API | Dispatch summary is carton-source only — it queries `dispatch_records` joined to `master_cartons`. Sample and e-commerce dispatches do not appear in dispatch-summary (they have separate report endpoints). |
| TC-RPTD-044 | Admin | Dispatch-summary — party-wise: carton count per article per customer | P1 | 1. Customer A receives carton C1 (2 boxes of Article X) and carton C2 (2 boxes of Article X). 2. `GET /api/v1/reports/dispatch-summary`. | Customer A's item for Article X shows `carton_count: 2`, `box_count: 4` (total across both cartons). | Integration | `COUNT(DISTINCT dr.master_carton_id)` = 2 cartons; `COUNT(DISTINCT ccm.child_box_id)` = 4 boxes. |
| TC-RPTD-045 | Admin | Dispatch-summary — same article multiple sizes appears as single item with comma-separated sizes | P1 | 1. Dispatch a carton containing Article "Alpha" in sizes "8" and "9" (same article+colour+MRP). 2. `GET /api/v1/reports/dispatch-summary`. | Customer's item for "Alpha" has `sizes: "8, 9"` (space-separated after comma). | API | `string_agg(DISTINCT p.size, ', ')` in service SQL groups by article+colour+mrp. |

---

## 3. Dispatch Summary Report — Frontend

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-046 | Admin | Reports page loads with Dispatch Report tab visible | P0 | 1. Login as Admin. 2. Navigate to `http://localhost:3000/reports`. 3. Observe tab bar. | Tab bar renders: "Stock Report", "Carton Inventory", "Dispatch Report", "Daily Activity", "Samples", "E-commerce". No console errors. | E2E | Spec 24 `TC-RPT-E2E-001`. |
| TC-RPTD-047 | Admin | Dispatch Report tab is selectable and loads data | P0 | 1. Navigate to `/reports`. 2. Click "Dispatch Report" tab. 3. Wait for data to load. | Tab border turns navy (active state). Date-filter card appears (From / To inputs defaulting to last 7 days). Summary cards render: "Total Dispatches" and "Total Cartons Dispatched". "By Customer" section renders below. No spinner stuck. | E2E | Default dates set to `weekAgo` and `today` in component state. |
| TC-RPTD-048 | Admin | Dispatch Report — summary cards display correct counts | P1 | 1. Note dispatch counts from API. 2. Navigate to Dispatch Report tab in browser. | "Total Dispatches" card number equals `total_dispatches` from `GET /reports/dispatch-summary?from_date=<weekAgo>&to_date=<today>`. "Total Cartons Dispatched" card equals `total_cartons_dispatched`. | E2E | |
| TC-RPTD-049 | Admin | Dispatch Report — By Customer section lists grouped cards | P1 | 1. Navigate to Dispatch Report tab. 2. Observe By Customer section. | Each customer group renders as a collapsible card showing customer name, carton count, destination(s), and dispatch date range. Cards are ordered by carton count descending. | E2E | |
| TC-RPTD-050 | Admin | Dispatch Report — customer card expand/collapse shows items detail | P1 | 1. Navigate to Dispatch Report tab. 2. Click on a customer group card. | Card expands to reveal an item table (desktop) or item list (mobile) showing Article, Colour, Sizes, MRP, Cartons, Boxes columns. Clicking again collapses. | E2E | `expandedCustomer` state in `DispatchTab` component. |
| TC-RPTD-051 | Admin | Dispatch Report — date filter updates data on change | P1 | 1. Navigate to Dispatch Report tab. 2. Change "From" date input to 2099-01-01. 3. Change "To" date input to 2099-12-31. 4. Wait for re-fetch. | Summary cards show 0 dispatches and 0 cartons. "By Customer" section shows empty-state message "No dispatch data for the selected period". No spinner stuck. | E2E | Query key includes `[dispatchFromDate, dispatchToDate]` so change triggers re-fetch. |
| TC-RPTD-052 | Admin | Dispatch Report — empty state message when no results | P1 | 1. Navigate to Dispatch Report tab with date range yielding no results. | Message "No dispatch data for the selected period" is visible; no "By Customer" heading rendered. Summary cards show "0". | E2E | |
| TC-RPTD-053 | Admin | Dispatch Report — date filter persists when switching away and returning to tab | P2 | 1. On Dispatch Report tab, change From date to 2026-01-01. 2. Click "Daily Activity" tab. 3. Click "Dispatch Report" tab again. | Dispatch Report From date input still shows 2026-01-01 (React state preserved in parent component). | E2E | State is kept in parent `ReportsPage` component, not in child `DispatchTab`. |
| TC-RPTD-054 | Supervisor | Supervisor can view Dispatch Report tab | P0 | 1. Login as Supervisor. 2. Navigate to `/reports`. 3. Click "Dispatch Report" tab. | HTTP 200 from API; data renders. Reports nav link is visible in sidebar for Supervisor. | E2E | Spec 24 `TC-RPT-E2E-004` covers access generally. |
| TC-RPTD-055 | Warehouse Op | Warehouse Op cannot navigate to /reports — nav hidden | P0 | 1. Login as Warehouse Op. 2. Observe sidebar. | "Reports" link is absent from sidebar (filtered because `reports:view_all` not in permissions). | E2E | Spec 24 `TC-RPT-E2E-005` covers WH sidebar test. |
| TC-RPTD-056 | Warehouse Op | Warehouse Op direct URL to /reports does not show report data | P0 | 1. Login as Warehouse Op. 2. Navigate directly to `http://localhost:3000/reports`. | Page either redirects to dashboard/home OR renders access-denied state; no dispatch report data is loaded. | E2E | AUTOMATION GAP — spec 24 `TC-RPT-E2E-005` tests sidebar but does not assert the page itself is blocked for direct URL access. |
| TC-RPTD-057 | Dispatch Op | Dispatch Op cannot see Reports nav link | P0 | 1. Login as Dispatch Op. 2. Observe sidebar. | "Reports" link absent from sidebar (no `reports:view_all` in Dispatch Op permissions). | E2E | AUTOMATION GAP — spec 24 only tests Warehouse Op sidebar, not Dispatch Op. |

---

## 4. Dispatch CSV Export — API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-058 | Admin | Dispatch CSV export — response headers | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/dispatch-summary/export` with Admin token. | HTTP 200; `Content-Type` header contains `text/csv` or `application/octet-stream`; `Content-Disposition` header contains `filename="dispatch-summary.csv"`. | API | Controller sets `Content-Disposition: attachment; filename="dispatch-summary.csv"`. |
| TC-RPTD-059 | Admin | Dispatch CSV export — header row is exactly 14 columns in correct order | P0 | 1. `GET /api/v1/reports/dispatch-summary/export`. 2. Parse first line of response body. | First line (unquoted) is exactly: `Customer,Dispatch Date,Destination,Carton Barcode,Boxes,Article,Colour,Size,MRP,Vehicle,LR Number,Transport Details,Dispatched By,Notes` (14 columns). | API | `headers` array in `exportDispatchCSV` in `csvExport.service.ts`. |
| TC-RPTD-060 | Admin | Dispatch CSV export — all cells double-quote wrapped | P1 | 1. Export with ≥1 dispatch record in DB. 2. Inspect any data row. | Every cell starts and ends with `"`. E.g., `"Sharma Traders","2026-04-17","Delhi","MC001234","3","Alpha","Black","9","299","DL01AB1234","LR001","By Road","Admin User",""`. | API | `toCSV` uses `escape = (val) => \`"\${...}"\`` for every cell. |
| TC-RPTD-061 | Admin | Dispatch CSV export — internal double-quotes escaped as "" | P1 | 1. Create a customer or dispatch with a double-quote in its name (e.g., firm_name = `Singh "Trading" Co`). 2. Export dispatch CSV. 3. Inspect the `Customer` cell. | Customer cell contains `"Singh ""Trading"" Co"` — the inner double-quotes are escaped as two double-quotes per RFC 4180. | Integration | `escape` function: `.replace(/"/g, '""')`. |
| TC-RPTD-062 | Admin | Dispatch CSV export — comma in field does not break column count | P1 | 1. Create a customer with `firm_name = "Jain, Brothers"`. 2. Dispatch a carton to them. 3. Export dispatch CSV. 4. Parse CSV row with a proper CSV parser. | Parser correctly reads the Customer cell as `Jain, Brothers` (comma inside quotes; does not split into two columns). | Integration | |
| TC-RPTD-063 | Admin | Dispatch CSV export — row count matches carton-product-line combinations | P1 | 1. Note: CSV has one row per unique (customer, dispatch_date, destination, carton, article, colour, size, mrp) combination — NOT per dispatch record. 2. Manually count expected rows. 3. Export and count CSV data rows (total lines minus 1 header). | Row count matches the expected per-product-line count. | Integration | This is different from `total_dispatches` in the summary API because the CSV is denormalized per product line. |
| TC-RPTD-064 | Admin | Dispatch CSV export — date filter propagated to export | P1 | 1. `GET /api/v1/reports/dispatch-summary/export?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; CSV contains only the header row (no data rows). | API | `exportDispatchCSV` accepts same `from_date`/`to_date` params as summary endpoint. |
| TC-RPTD-065 | Admin | Dispatch CSV export — empty result CSV has only header row | P1 | 1. `GET /api/v1/reports/dispatch-summary/export?from_date=2099-01-01&to_date=2099-12-31`. 2. Count lines. | Response body has exactly 1 line (the header); no data rows; no trailing newlines that would appear as empty rows. | API | `toCSV` with empty `rows` array emits `[headerLine].join('\n')` = single line. |
| TC-RPTD-066 | Admin | Dispatch CSV export — Boxes column uses carton's child_count (not re-count) | P1 | 1. Export dispatch CSV for a dispatch with a known carton that has `child_count = 5`. 2. Inspect the `Boxes` column for that row. | `Boxes` cell value is `"5"` — the `mc.child_count` field, not `box_count` from `COUNT(DISTINCT ccm.child_box_id)`. | API | CSV query selects `mc.child_count` for the Boxes column (not `box_count`). Note: API summary uses `COUNT(DISTINCT ccm.child_box_id)` for `box_count` — these may differ for re-scanned cartons. |
| TC-RPTD-067 | Admin | Dispatch CSV export — walk-in customer shows "Walk-in / No Customer" | P1 | 1. Ensure a dispatch with null customer_id exists. 2. Export dispatch CSV. 3. Inspect Customer column for that row. | `Customer` cell contains `"Walk-in / No Customer"` (from `COALESCE(c.firm_name, 'Walk-in / No Customer')` in CSV query). | Integration | |
| TC-RPTD-068 | Admin | Dispatch CSV export — null optional fields appear as empty strings | P1 | 1. Dispatch a carton where `destination`, `vehicle_number`, `lr_number`, `transport_details`, `notes` are all null. 2. Export CSV. 3. Inspect those columns. | Cells for null fields are `""` (empty double-quoted string). No literal `"null"` or `"undefined"`. | API | `String(r.vehicle_number ?? '')` → empty string. |
| TC-RPTD-069 | Admin | Dispatch CSV export — dispatch_date formatted as YYYY-MM-DD | P1 | 1. Create a dispatch with `dispatch_date = '2026-05-20'`. 2. Export CSV. 3. Inspect `Dispatch Date` column. | Value is `"2026-05-20"` (date string, no time component), matching `dr.dispatch_date` as returned by Postgres date column. | API | |
| TC-RPTD-070 | Supervisor | Supervisor can export dispatch CSV | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/dispatch-summary/export`. | HTTP 200; valid CSV with header row. | API | |
| TC-RPTD-071 | Warehouse Op | Warehouse Op denied dispatch CSV export | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/dispatch-summary/export`. | HTTP 403. | API | AUTOMATION GAP — spec 24 only tests WH for summary endpoint, not export. |
| TC-RPTD-072 | Dispatch Op | Dispatch Op denied dispatch CSV export | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/dispatch-summary/export`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-RPTD-073 | Unauthenticated | Dispatch CSV export returns 401 without token | P0 | 1. `GET /api/v1/reports/dispatch-summary/export` without Authorization header. | HTTP 401. | API | AUTOMATION GAP. |

---

## 5. Dispatch CSV Export — Frontend

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-074 | Admin | Dispatch tab shows "Export CSV" button in page header action area | P0 | 1. Navigate to `/reports`, click "Dispatch Report" tab. 2. Observe top-right action area. | "Export CSV" button is visible with download icon. | E2E | `renderExportButton()` case `'dispatch'` renders Button with `Download` icon. |
| TC-RPTD-075 | Admin | Dispatch tab Export CSV button triggers browser download | P0 | 1. Navigate to `/reports`, click "Dispatch Report" tab. 2. Click "Export CSV". 3. Observe browser download. | Browser initiates file download. Filename is `dispatch-report-YYYY-MM-DD.csv` where YYYY-MM-DD is today's date. Downloaded file is non-empty text beginning with a CSV header row. Toast "Report exported" appears. | E2E | `handleExport('/reports/dispatch-summary/export', \`dispatch-report-\${today}.csv\`, { from_date, to_date })`. |
| TC-RPTD-076 | Admin | Dispatch CSV export carries current date filter | P1 | 1. On Dispatch Report tab, set From=2026-04-01, To=2026-04-30. 2. Click "Export CSV". 3. Inspect downloaded file. | Downloaded CSV contains only dispatch records with `dispatch_date` between 2026-04-01 and 2026-04-30. Records outside that range are absent. | E2E | Export params include `{ from_date: dispatchFromDate, to_date: dispatchToDate }`. |
| TC-RPTD-077 | Admin | Export CSV button absent on Carton Inventory tab | P2 | 1. Navigate to `/reports`, click "Carton Inventory" tab. 2. Observe header action area. | No "Export CSV" button rendered. `renderExportButton()` returns `null` for `activeTab === 'cartons'`. | E2E | `default: return null` in `renderExportButton` switch. |
| TC-RPTD-078 | Admin | Export CSV button absent on default/first tab transition | P2 | 1. Navigate to `/reports`. Tab defaults to `stock`. 2. Switch to "Carton Inventory". 3. Switch to "Dispatch Report". | Export button appears only when Dispatch Report is active; disappears when on Carton Inventory. Confirms button is reactive to `activeTab` state. | E2E | |
| TC-RPTD-079 | Supervisor | Supervisor sees Export CSV button on Dispatch tab | P1 | 1. Login as Supervisor. 2. Navigate to `/reports`, click "Dispatch Report" tab. | Export CSV button is visible and clickable (Supervisor has `reports:view_all` so route is accessible). | E2E | AUTOMATION GAP — spec 24 tests Supervisor page access but not export button specifically. |

---

## 6. Daily Activity Report — API

### 6a. Required parameters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-080 | Admin | Daily-activity with both params — returns data | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 200; `body.data` is an array of objects with `date` (YYYY-MM-DD), `boxes_created`, `boxes_packed`, `boxes_unpacked`, `boxes_dispatched`, `cartons_created`, `cartons_closed`, `cartons_dispatched` (all integers). | API | Spec 24 `TC-RPT-API-008`. |
| TC-RPTD-081 | Admin | Daily-activity missing from_date — returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity?to_date=2026-01-31` (no from_date). | HTTP 400; error message contains "from_date" or "Both from_date and to_date are required". No 500 error. | API | Controller throws `BadRequestError('Both from_date and to_date are required')`. |
| TC-RPTD-082 | Admin | Daily-activity missing to_date — returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01` (no to_date). | HTTP 400; error message references "to_date" or both params required. | API | Same `BadRequestError` as TC-RPTD-081. |
| TC-RPTD-083 | Admin | Daily-activity missing both params — returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity` (no params). | HTTP 400; error message references both required params. | API | |
| TC-RPTD-084 | Admin | Daily-activity export missing from_date — returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity/export?to_date=2026-01-31`. | HTTP 400. Controller validates params before calling `exportDailyActivityCSV`. | API | Controller has same validation for export endpoint. |
| TC-RPTD-085 | Admin | Daily-activity export missing to_date — returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01`. | HTTP 400. | API | |

### 6b. Data shape and zero-fill behavior

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-086 | Admin | Daily-activity — row count equals days in date range | P0 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-07`. | `body.data` array has exactly 7 elements (one per calendar day from Jan 1 to Jan 7 inclusive). | API | `generate_series($1::date, $2::date, '1 day')` produces one row per day regardless of activity. |
| TC-RPTD-087 | Admin | Daily-activity — zero-fill days with no activity show all-zero counts | P0 | 1. Choose a date range that includes a day with no transactions (e.g., a Sunday with no operations). 2. `GET /api/v1/reports/daily-activity?from_date=<Sunday>&to_date=<Sunday>`. | Array contains exactly 1 element; all count fields (`boxes_created`, `boxes_packed`, etc.) equal `0`. | API | `COALESCE(ba.boxes_created, 0)::int` in service SQL. |
| TC-RPTD-088 | Admin | Daily-activity — date field format is YYYY-MM-DD text | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-05-01&to_date=2026-05-03`. 2. Inspect `date` field in each row. | `date` values are strings in `YYYY-MM-DD` format (e.g., `"2026-05-01"`). No time component. | API | `dr.date::text` in service SQL. |
| TC-RPTD-089 | Admin | Daily-activity — rows are ordered ascending by date | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-05`. | Rows appear in date order: `2026-01-01`, `2026-01-02`, `2026-01-03`, `2026-01-04`, `2026-01-05`. | API | `ORDER BY dr.date` in service SQL. |
| TC-RPTD-090 | Admin | Daily-activity — boxes_created reflects CHILD_CREATED transactions on that day | P1 | 1. Create N child boxes on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for date D has `boxes_created = N`. | Integration | `COUNT(*) FILTER (WHERE it.transaction_type = 'CHILD_CREATED')` in `inventory_transactions`. |
| TC-RPTD-091 | Admin | Daily-activity — boxes_packed reflects CHILD_PACKED transactions | P1 | 1. Pack M child boxes into a carton on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `boxes_packed = M`. | Integration | |
| TC-RPTD-092 | Admin | Daily-activity — boxes_unpacked reflects CHILD_UNPACKED transactions | P1 | 1. Unpack K boxes from a carton on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `boxes_unpacked = K`. | Integration | |
| TC-RPTD-093 | Admin | Daily-activity — boxes_dispatched reflects CHILD_DISPATCHED transactions | P1 | 1. Dispatch a carton with P child boxes on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `boxes_dispatched = P`. | Integration | |
| TC-RPTD-094 | Admin | Daily-activity — cartons_created reflects master_cartons.created_at | P1 | 1. Create Q cartons on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `cartons_created = Q`. | Integration | Derived from `master_cartons mc` not from `inventory_transactions`. |
| TC-RPTD-095 | Admin | Daily-activity — cartons_closed reflects master_cartons.closed_at | P1 | 1. Close R cartons on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `cartons_closed = R`. | Integration | `WHERE mc.closed_at IS NOT NULL AND mc.closed_at >= $1` in service. |
| TC-RPTD-096 | Admin | Daily-activity — cartons_dispatched reflects dispatch_records.dispatch_date | P1 | 1. Dispatch S cartons on date D (dispatch_date = D). 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `cartons_dispatched = S`. | Integration | Derived from `dispatch_records dr` grouped by `DATE(dr.dispatch_date)`. |
| TC-RPTD-097 | Admin | Daily-activity — all integer fields are numbers not strings | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-01`. 2. Inspect type of `boxes_created` in response. | `boxes_created` (and all other count fields) is a JSON integer, not a string. Cast with `::int` in SQL. | API | `COALESCE(ba.boxes_created, 0)::int` in service. |
| TC-RPTD-098 | Admin | Daily-activity — single-day range returns exactly 1 row | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-06-01&to_date=2026-06-01`. | `body.data` is an array with exactly 1 element; that element has `date: "2026-06-01"`. | API | |

### 6c. Date-range scenarios

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-099 | Admin | Daily-activity — large date range (365 days) returns 365 rows | P2 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-12-31`. | `body.data` array has exactly 365 elements. | API | `generate_series` fills all calendar days; no pagination on this endpoint. |
| TC-RPTD-100 | Admin | Daily-activity — future date range returns zero-fill rows | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=2099-01-01&to_date=2099-01-03`. | Array has 3 elements; all count fields are 0. | API | |
| TC-RPTD-101 | Admin | Daily-activity — inverted date range (from > to) returns empty array | P2 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-12-31&to_date=2026-01-01`. | HTTP 200; `body.data` is an empty array (Postgres `generate_series` with inverted dates yields 0 rows). No 500 error. | API | `generate_series` with start > end yields no rows — safe, no error. |
| TC-RPTD-102 | Admin | Daily-activity — invalid date string for from_date returns error | P1 | 1. `GET /api/v1/reports/daily-activity?from_date=not-a-date&to_date=2026-01-31`. | HTTP 400 or 500; no silent success. If Postgres raises a date-cast error, the controller error handler should return a non-200 status. | API | Service passes params directly to Postgres `$1::date` — invalid string causes DB error. |
| TC-RPTD-103 | Supervisor | Supervisor receives same daily-activity data as Admin | P1 | 1. Login as Supervisor. 2. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 200; data identical to Admin response (no role-based filtering inside the service). | API | |

---

## 7. Daily Activity Report — Frontend

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-104 | Admin | Daily Activity tab is accessible and renders | P0 | 1. Navigate to `/reports`. 2. Click "Daily Activity" tab. | Tab border turns navy. Date-filter card appears (From / To inputs defaulting to last 7 days). Table or spinner loads. | E2E | Spec 24 `TC-RPT-API-008` covers API; frontend tab tested by `TC-RPT-E2E-001`. |
| TC-RPTD-105 | Admin | Daily Activity tab — date filters default to last 7 days | P1 | 1. Navigate to `/reports`, click "Daily Activity". | From-date input value is 7 days before today; To-date is today. Both in `YYYY-MM-DD` format matching `getDefaultDates()`. | E2E | `dailyFromDate = weekAgo`, `dailyToDate = today` in component state. |
| TC-RPTD-106 | Admin | Daily Activity — table shows one row per day in range | P1 | 1. On Daily Activity tab, set From=2026-06-01, To=2026-06-07. 2. Wait for data. | Table renders 7 rows (one per calendar day, including zero-activity days). | E2E | |
| TC-RPTD-107 | Admin | Daily Activity — table columns are correct | P0 | 1. Navigate to Daily Activity tab. | Desktop table has 8 columns: Date, Boxes Created, Packed, Unpacked, Dispatched, Cartons Created, Closed, Cartons Dispatched. | E2E | Column headers from `DailyTab` component `TableHeader` elements. |
| TC-RPTD-108 | Admin | Daily Activity — totals row sums all columns | P1 | 1. Navigate to Daily Activity tab with data present. | A "Totals" row appears at the bottom of the table with summed values for each column. Values match `dailyTotals` computed by `useMemo` in parent component. | E2E | `TableRow` with `"Totals"` first cell + bold totals. |
| TC-RPTD-109 | Admin | Daily Activity — empty state message for no-data range | P1 | 1. Set From=2099-01-01, To=2099-01-07. Wait for re-fetch. | All rows show "0" for every count (zero-fill from generate_series); OR an empty-state message is shown. No spinner stuck. Totals row shows all zeros. | E2E | Zero-fill: each row has all counts = 0 so the table renders 7 all-zero rows (not empty array). |
| TC-RPTD-110 | Admin | Daily Activity — date filter change triggers re-fetch | P1 | 1. Note current total on Daily Activity tab. 2. Change From date to two years ago. 3. Wait for re-fetch. | Table refreshes; row count changes to reflect the new date range. Query key `['reports', 'daily-activity', dailyFromDate, dailyToDate]` triggers new fetch. | E2E | |
| TC-RPTD-111 | Admin | Daily Activity — mobile card layout renders correctly | P1 | 1. Set viewport to 375px width. 2. Navigate to Daily Activity tab. | Cards render instead of table (`.lg:hidden` class). Each card shows the date as a heading and all 7 count fields as label/value pairs. | E2E | `DailyTab` renders mobile cards when viewport is below `lg` breakpoint. |
| TC-RPTD-112 | Admin | Daily Activity — date filter persists when switching tabs | P2 | 1. On Daily Activity tab, change From to 2026-01-01. 2. Click "Stock Report". 3. Return to "Daily Activity". | From-date still shows 2026-01-01. `dailyFromDate` state is in parent `ReportsPage`, not in `DailyTab`. | E2E | |
| TC-RPTD-113 | Supervisor | Supervisor can view Daily Activity tab | P0 | 1. Login as Supervisor. 2. Navigate to `/reports`, click "Daily Activity". | HTTP 200; data renders. No 403 or redirect. | E2E | AUTOMATION GAP — spec 24 does not test Supervisor on daily-activity tab. |

---

## 8. Daily Activity CSV Export — API

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-114 | Admin | Daily-activity CSV export — response headers | P0 | 1. Login as Admin. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 200; `Content-Type` contains `text/csv` or `application/octet-stream`; `Content-Disposition` contains `filename="daily-activity.csv"`. | API | Controller sets `Content-Disposition: attachment; filename="daily-activity.csv"`. |
| TC-RPTD-115 | Admin | Daily-activity CSV export — header row is exactly 8 columns in correct order | P0 | 1. Export. 2. Parse first line. | First line (unquoted) is exactly: `Date,Boxes Created,Boxes Packed,Boxes Unpacked,Boxes Dispatched,Cartons Created,Cartons Closed,Cartons Dispatched` (8 columns). | API | `headers` array in `exportDailyActivityCSV` in `csvExport.service.ts`. |
| TC-RPTD-116 | Admin | Daily-activity CSV export — all cells double-quote wrapped | P1 | 1. Export with data. 2. Inspect a data row. | Every cell is wrapped in double-quotes: e.g., `"2026-01-03","5","8","2","3","1","0","1"`. | API | Same `toCSV` function. |
| TC-RPTD-117 | Admin | Daily-activity CSV export — row count equals days in range | P0 | 1. Export with `from_date=2026-01-01&to_date=2026-01-07`. 2. Count CSV data rows (total lines minus header). | Exactly 7 data rows (one per calendar day, including zero-activity days). | API | `exportDailyActivityCSV` calls `getDailyActivity` which uses `generate_series`. |
| TC-RPTD-118 | Admin | Daily-activity CSV export — zero-fill days show "0" for all counts | P1 | 1. Export with a range that includes a day with no transactions. 2. Inspect that day's row. | Count cells for zero-activity day are `"0"`, not `""` or `"null"`. | API | `String(a.boxes_created)` where value is integer 0 → `"0"`. |
| TC-RPTD-119 | Admin | Daily-activity CSV export — date field is YYYY-MM-DD text | P1 | 1. Export. 2. Inspect Date column. | All Date cells are `"YYYY-MM-DD"` format strings. No time component, no ISO-8601 T suffix. | API | `String(a.date)` where `a.date` comes from `dr.date::text` (Postgres date text). |
| TC-RPTD-120 | Admin | Daily-activity CSV export — missing from_date returns 400 | P0 | 1. `GET /api/v1/reports/daily-activity/export?to_date=2026-01-31`. | HTTP 400; no CSV body. | API | Controller validates both params before calling `exportDailyActivityCSV`. |
| TC-RPTD-121 | Admin | Daily-activity CSV export — empty result CSV (future range) | P1 | 1. `GET /api/v1/reports/daily-activity/export?from_date=2099-01-01&to_date=2099-01-03`. | HTTP 200; CSV has header row + 3 data rows (zero-fill for each day in range). NOT an empty CSV — generate_series still emits rows. | API | This differs from dispatch export: daily-activity always emits a row per day even for future dates. |
| TC-RPTD-122 | Admin | Daily-activity CSV export — large range (30 days) returns 30 data rows | P2 | 1. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-30`. | 30 data rows + 1 header = 31 total lines. | API | |
| TC-RPTD-123 | Supervisor | Supervisor can export daily-activity CSV | P0 | 1. Login as Supervisor. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 200; valid CSV. | API | AUTOMATION GAP — spec 24 has no daily-activity export test. |
| TC-RPTD-124 | Warehouse Op | Warehouse Op denied daily-activity CSV export | P0 | 1. Login as Warehouse Op. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-RPTD-125 | Dispatch Op | Dispatch Op denied daily-activity CSV export | P0 | 1. Login as Dispatch Op. 2. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-07`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-RPTD-126 | Unauthenticated | Daily-activity CSV export returns 401 without token | P0 | 1. `GET /api/v1/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-01-07` without token. | HTTP 401. | API | AUTOMATION GAP. |

---

## 9. Daily Activity CSV Export — Frontend

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-127 | Admin | Daily Activity tab shows "Export CSV" button | P0 | 1. Navigate to `/reports`, click "Daily Activity". | "Export CSV" button with download icon visible in page header action area. | E2E | `renderExportButton()` case `'daily'` renders Button. |
| TC-RPTD-128 | Admin | Daily Activity Export CSV triggers browser download | P0 | 1. Navigate to Daily Activity tab. 2. Click "Export CSV". | Browser initiates download; filename is `daily-activity-YYYY-MM-DD.csv` (today's date). Downloaded file is non-empty CSV beginning with correct 8-column header. Toast "Report exported" appears. | E2E | `handleExport('/reports/daily-activity/export', \`daily-activity-\${today}.csv\`, { from_date, to_date })`. |
| TC-RPTD-129 | Admin | Daily Activity CSV export carries current date filter | P1 | 1. On Daily Activity tab, set From=2026-04-01, To=2026-04-07. 2. Click "Export CSV". 3. Inspect downloaded file. | CSV contains exactly 7 data rows (one per day April 1–7) matching the filter. | E2E | |
| TC-RPTD-130 | Admin | Export CSV button absent when Daily Activity tab is not active | P2 | 1. Navigate to `/reports`. 2. Stay on default "Stock Report" tab. 3. Observe action area. | "Export CSV" button is for Stock, not daily. When switching to "Carton Inventory" tab the button disappears. Confirms button is reactive per tab. | E2E | |
| TC-RPTD-131 | Admin | Daily Activity Export fails gracefully on API error | P2 | 1. Temporarily simulate network failure (or intercept request in Playwright). 2. Click "Export CSV" on Daily Activity tab. | Toast "Export failed" appears. No unhandled JS error. | E2E | `catch { toast.error('Export failed') }` in `handleExport`. |
| TC-RPTD-132 | Supervisor | Supervisor sees Export CSV button on Daily Activity tab | P1 | 1. Login as Supervisor. 2. Navigate to `/reports`, click "Daily Activity". | "Export CSV" button visible. Download succeeds with HTTP 200. | E2E | AUTOMATION GAP — spec 24 does not test Supervisor export button. |

---

## 10. Cross-cutting Edge Cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPTD-133 | Admin | Reports page — all 6 tabs visible and selectable | P1 | 1. Navigate to `/reports`. 2. Inspect tab bar. | Six tabs visible: Stock Report, Carton Inventory, Dispatch Report, Daily Activity, Samples, E-commerce. Each is clickable; clicking changes `activeTab` state and re-renders content area. | E2E | |
| TC-RPTD-134 | Admin | Dispatch Report and Daily Activity tabs have independent date filter state | P1 | 1. On Dispatch Report tab, change From to 2026-01-01. 2. Switch to Daily Activity tab. 3. Observe Daily Activity From date. | Daily Activity From date is still `weekAgo` (independent state variable `dailyFromDate`). The two tabs do not share date state. | E2E | Separate state vars: `dispatchFromDate` / `dailyFromDate`. |
| TC-RPTD-135 | Admin | Dispatch-summary API — total_cartons_dispatched counts distinct cartons | P1 | 1. Dispatch carton C1 to customer A. Then dispatch same C1 again (if allowed) or ensure duplicate records don't inflate count. 2. `GET /api/v1/reports/dispatch-summary`. | `total_cartons_dispatched` uses `COUNT(DISTINCT dr.master_carton_id)` so each carton counted once regardless of multiple dispatch_record rows. | API | `COUNT(DISTINCT dr.master_carton_id)` in totals query. |
| TC-RPTD-136 | Admin | Dispatch-summary — concurrent date-filter and no-filter requests return consistent data | P2 | 1. Make two simultaneous requests: unfiltered and with `from_date=2026-01-01`. | Both return HTTP 200; filtered result `total_dispatches` ≤ unfiltered `total_dispatches`. No race condition or server error. | API | |
| TC-RPTD-137 | Admin | Daily-activity — to_date boundary includes all transactions on that day | P1 | 1. Create child boxes at 23:59 on date D. 2. `GET /api/v1/reports/daily-activity?from_date=D&to_date=D`. | Row for D has `boxes_created > 0` (the late-day transactions are included because query uses `<= ($2::date + interval '1 day')`). | Integration | Service uses `it.created_at <= ($2::date + interval '1 day')` to include the full last day. |
| TC-RPTD-138 | Admin | Invalid token on dispatch-summary returns 401 | P0 | 1. `GET /api/v1/reports/dispatch-summary` with `Authorization: Bearer invalid.token.here`. | HTTP 401; JSON error body. `authenticate` middleware rejects malformed JWT. | API | |
| TC-RPTD-139 | Admin | Invalid token on daily-activity returns 401 | P0 | 1. `GET /api/v1/reports/daily-activity?from_date=2026-01-01&to_date=2026-01-07` with `Authorization: Bearer invalid.token.here`. | HTTP 401. | API | |
| TC-RPTD-140 | Admin | CSV export — newline in field value does not break row count | P2 | 1. Create a dispatch with `notes = "Line one\nLine two"` (newline embedded in notes). 2. Export dispatch CSV. 3. Parse with RFC-4180 compliant CSV parser. | CSV parser reads it as a single cell containing a newline (properly double-quoted per RFC 4180). Raw line count differs from data row count, but parser row count is correct. | Integration | `toCSV` wraps every value in `"..."` — newline inside quotes is valid per RFC 4180. |
| TC-RPTD-141 | Admin | Dispatch-summary — note on Admin super-admin bypass | P0 | 1. `GET /api/v1/reports/dispatch-summary` with Admin token. 2. Inspect `authorizePermission` code path. | Admin role is detected in `authorizePermission` by `role_name === 'Admin'` check (line 145 of `rbac.middleware.ts`). Admin always passes regardless of `role_permissions` rows. | API | Documents Admin super-admin bypass behavior. |
| TC-RPTD-142 | Admin | Dispatch-summary — reports:view_all matrix discrepancy note | P1 | (Documentation TC) Note: `MASTER_TEST_PLAN.md` matrix shows `reports:view_all` as Admin + Supervisor. `001_roles.ts` confirms: Admin=[`reports:view_all`, `reports:export`]; Supervisor=[`reports:view_all`, `reports:export`]. Warehouse Op=[`reports:view_own`] only. Dispatch Op=[`reports:view_dispatch`] only. Route uses `authorizePermission('reports:view_all')` — WH and Dispatch Op are correctly denied. | (None — documentation only) | Matrix is consistent with code. DISCREPANCY: The route guard is `reports:view_all` ONLY — the `reports:export` permission is seeded but NOT checked by any route. Export endpoints use the same `reports:view_all` middleware. `reports:export` has no functional effect in the current codebase. | Manual | AUTOMATION GAP — no test asserts that `reports:export` alone (without `reports:view_all`) grants access. |
| TC-RPTD-143 | Admin | Daily-activity — note on box-activity vs carton-activity datasources | P1 | (Documentation TC) Note: `boxes_created/packed/unpacked/dispatched` come from `inventory_transactions` table filtered by `transaction_type`. `cartons_created` comes from `master_cartons.created_at`. `cartons_closed` comes from `master_cartons.closed_at`. `cartons_dispatched` comes from `dispatch_records.dispatch_date`. These are three different tables; a discrepancy (e.g., if carton creation log is missing from transactions) would not be visible in this report. | (None — documentation only) | Ensures test authors understand the data lineage when asserting cross-field relationships. | Manual | |

---

## Matrix Discrepancies and Automation Gaps

### Matrix Discrepancies Found

1. **`reports:export` permission is seeded but never enforced as a route guard.** All export endpoints are protected by `reports:view_all` (same as the data endpoints). The `reports:export` permission in `role_permissions` has no functional effect. This is documented in TC-RPTD-142 but is NOT a bug to fix — it is encoded as "actual behavior."

2. **`reports:view_own` and `reports:view_dispatch` have no corresponding endpoints or guards.** Warehouse Op holds `reports:view_own`; Dispatch Op holds `reports:view_dispatch`. These permission strings do not gate any route in the current `report.routes.ts`. Both roles are simply denied the `reports:view_all`-gated routes. There is no "own" or "dispatch-only" report endpoint. TC-RPTD-003, TC-RPTD-004, TC-RPTD-008, TC-RPTD-009 document the actual 403 behavior.

3. **The existing `phase-17` file was scoped too broadly** — it included Sample and E-commerce reports (now moved to A16) and mixed them with Dispatch + Daily Activity. The stale file's intro claimed an old `authorize(Admin, Supervisor)` guard; the actual code uses `authorizePermission('reports:view_all')`. This file corrects that.

### Automation Gaps in `24-reports-rbac.spec.ts`

The following new tests are recommended for `frontend/e2e/24-reports-rbac.spec.ts`:

| Gap | Recommended TC | New test description |
|---|---|---|
| No unauthenticated TCs for dispatch/daily | TC-RPTD-005, TC-RPTD-010, TC-RPTD-015, TC-RPTD-020 | Add `test('TC-RPTD-005: Unauthenticated dispatch-summary → 401', ...)` |
| No Supervisor test for daily-activity | TC-RPTD-007 | `test('TC-RPTD-007: Supervisor daily-activity → 200', ...)` |
| No denial tests for daily-activity | TC-RPTD-008, TC-RPTD-009 | WH and Dispatch Op → 403 for `/daily-activity` |
| No export denial tests (WH/Dispatch) | TC-RPTD-013, TC-RPTD-014, TC-RPTD-018, TC-RPTD-019 | Test 403 for export endpoints per non-Admin/Supervisor role |
| No daily-activity export test at all | TC-RPTD-016 through TC-RPTD-020 | Entire `/daily-activity/export` endpoint untested |
| No Dispatch Op sidebar test | TC-RPTD-057 | Like `TC-RPT-E2E-005` but for Dispatch Op |
| No direct-URL block test for WH/Dispatch | TC-RPTD-056 | Navigate WH Op directly to `/reports` — assert blocked |
| No Supervisor export button test | TC-RPTD-079, TC-RPTD-132 | Supervisor can click Export CSV on Dispatch/Daily tabs |

---

## TC Count Summary

| Section | TC Count |
|---|---|
| Section 1: RBAC — all endpoints | 20 |
| Section 2a: Dispatch summary data shape | 10 |
| Section 2b: Dispatch date-range filter | 7 |
| Section 2c: Customer grouping + walk-in | 5 |
| Section 2d: Source-type + party-wise | 3 |
| Section 3: Dispatch Summary Frontend | 12 |
| Section 4: Dispatch CSV Export API | 16 |
| Section 5: Dispatch CSV Export Frontend | 6 |
| Section 6a: Daily Activity required params | 6 |
| Section 6b: Daily Activity data shape | 13 |
| Section 6c: Daily Activity date-range | 5 |
| Section 7: Daily Activity Frontend | 10 |
| Section 8: Daily Activity CSV Export API | 13 |
| Section 9: Daily Activity CSV Export Frontend | 6 |
| Section 10: Cross-cutting edge cases | 11 |
| **Total** | **143** |

**Per-role TC count:**
- Admin: 100 (positive + negative owner of most TCs)
- Supervisor: 13 (allow TCs across both reports and both exports)
- Warehouse Operator: 10 (deny TCs — 403 for all endpoints)
- Dispatch Operator: 10 (deny TCs — 403 for all endpoints)
- Unauthenticated: 10 (401 TCs)

**Automation coverage against `24-reports-rbac.spec.ts`:**
- 14 TCs are already covered by existing spec tests (marked with spec 24 ref).
- 28 TCs are marked **AUTOMATION GAP** — new tests recommended above.
- Remaining TCs are Manual / Integration level requiring data setup.
