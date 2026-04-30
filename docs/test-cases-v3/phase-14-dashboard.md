# Phase 14 — Inventory Dashboard

**Module:** Inventory Dashboard (`GET /api/v1/inventory/dashboard` + `/` frontend page)
**Suite version:** v3
**Last updated:** 2026-04-30
**TC ID prefix:** `INV`
**Roles under test:** All four roles (dashboard is readable by all authenticated users).

> **Preconditions for all API tests:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base: `http://localhost:5000/api/v1`.
> **Note on KPI shape:** The `getDashboard` service returns: `totalChildBoxes`, `generatedBoxes`, `freeChildBoxes`, `packedChildBoxes`, `sampleBoxes`, `ecommerceBoxes`, `dispatchedChildBoxes`, `totalMasterCartons`, `createdCartons`, `activeCartons`, `closedCartons`, `dispatchedCartons`, `activeMasterCartons`, `closedMasterCartons`, `todayDispatches`, `totalDispatches`, `totalPairsInStock` (FREE+PACKED only), `totalPairsDispatched`, `totalProducts`, `recentTransactions`.

---

## Table of Contents

1. [Section 1 — API Shape & Field Correctness](#section-1--api-shape--field-correctness)
2. [Section 2 — KPI Consistency (arithmetic invariants)](#section-2--kpi-consistency-arithmetic-invariants)
3. [Section 3 — Role Access](#section-3--role-access)
4. [Section 4 — Frontend E2E — Dashboard Page](#section-4--frontend-e2e--dashboard-page)

---

## Section 1 — API Shape & Field Correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-INV-001 | Admin | GET /inventory/dashboard returns HTTP 200 with all required KPI fields | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/dashboard`. 3. Assert HTTP status. 4. Assert each field in response body. | HTTP 200. Response body (inside `data` envelope) contains ALL of: `totalChildBoxes`, `generatedBoxes`, `freeChildBoxes`, `packedChildBoxes`, `sampleBoxes`, `ecommerceBoxes`, `dispatchedChildBoxes`, `totalMasterCartons`, `createdCartons`, `activeCartons`, `closedCartons`, `dispatchedCartons`, `activeMasterCartons`, `closedMasterCartons`, `todayDispatches`, `totalDispatches`, `totalPairsInStock`, `totalPairsDispatched`, `totalProducts`, `recentTransactions`. All numeric fields are integers ≥ 0. `recentTransactions` is an array. | API | |
| TC-INV-002 | Admin | generatedBoxes field is present and non-negative | P0 | 1. Authenticate as Admin. 2. Generate at least 3 child boxes (status=GENERATED, no activate call). 3. GET `/api/v1/inventory/dashboard`. 4. Assert `generatedBoxes`. | `generatedBoxes` ≥ 3. Value is an integer, not null, not undefined. | API | New Apr 27 KPI — was absent in v2. |
| TC-INV-003 | Admin | sampleBoxes field counts SAMPLE-status child boxes | P0 | 1. Authenticate as Admin. 2. Record baseline `sampleBoxes` = B from GET `/api/v1/inventory/dashboard`. 3. Create a sample record, add 4 child boxes (status becomes SAMPLE). 4. GET `/api/v1/inventory/dashboard` again. 5. Assert new `sampleBoxes`. | `sampleBoxes` = B + 4 (exactly). | Integration | New Apr 27 KPI. |
| TC-INV-004 | Admin | ecommerceBoxes field counts ECOMMERCE-status child boxes | P0 | 1. Authenticate as Admin. 2. Record baseline `ecommerceBoxes` = B. 3. Create an ecommerce record, add 5 child boxes (status becomes ECOMMERCE). 4. GET `/api/v1/inventory/dashboard`. | `ecommerceBoxes` = B + 5. | Integration | New Apr 27 KPI. |
| TC-INV-005 | Admin | totalChildBoxes equals sum of all six status counts | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/dashboard`. 3. Sum: `generatedBoxes + freeChildBoxes + packedChildBoxes + sampleBoxes + ecommerceBoxes + dispatchedChildBoxes`. 4. Compare to `totalChildBoxes`. | `generatedBoxes + freeChildBoxes + packedChildBoxes + sampleBoxes + ecommerceBoxes + dispatchedChildBoxes` = `totalChildBoxes` exactly (integer equality). | API | Core invariant. |
| TC-INV-006 | Admin | totalPairsInStock counts only FREE + PACKED child boxes (excludes GENERATED, SAMPLE, ECOMMERCE, DISPATCHED) | P0 | 1. Authenticate as Admin. 2. Ensure boxes of every status exist (GENERATED, FREE, PACKED, SAMPLE, ECOMMERCE, DISPATCHED). 3. Manually sum: `SUM(quantity) WHERE status IN ('FREE','PACKED')` from DB. 4. GET `/api/v1/inventory/dashboard`. Compare `totalPairsInStock`. | `totalPairsInStock` equals the DB manual sum of FREE+PACKED quantities. GENERATED, SAMPLE, ECOMMERCE, and DISPATCHED quantities are NOT included. | Integration | Critical exclusion verified against service code line 70–74. |
| TC-INV-007 | Admin | totalPairsDispatched counts only DISPATCHED child boxes | P0 | 1. Authenticate as Admin. 2. Dispatch some cartons. 3. DB: `SUM(quantity) WHERE status = 'DISPATCHED'`. 4. GET `/api/v1/inventory/dashboard`. | `totalPairsDispatched` = DB sum of DISPATCHED quantities. | Integration | |
| TC-INV-008 | Admin | todayDispatches increments after new dispatch today | P1 | 1. Authenticate as Admin. 2. Record `todayDispatches` = T from GET `/api/v1/inventory/dashboard`. 3. Dispatch one master carton (no custom dispatch_date — defaults to NOW()). 4. GET `/api/v1/inventory/dashboard`. | `todayDispatches` = T + 1 (if the default `dispatch_date` is today). `totalDispatches` also increases by 1. | Integration | |
| TC-INV-009 | Admin | recentTransactions array contains at most 20 items | P1 | 1. Authenticate as Admin. 2. Perform 25 inventory transactions. 3. GET `/api/v1/inventory/dashboard`. 4. Assert `recentTransactions` length. | `recentTransactions.length` ≤ 20. Each item in the array has at minimum: `id`, `transaction_type`, `created_at`. Array is ordered newest-first by `created_at`. | API | Service hardcodes `LIMIT 20`. |
| TC-INV-010 | Admin | activeMasterCartons and closedMasterCartons are consistent aliases | P1 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/dashboard`. 3. Compare `activeMasterCartons` vs `activeCartons` and `closedMasterCartons` vs `closedCartons`. | `activeMasterCartons` = `activeCartons`. `closedMasterCartons` = `closedCartons`. (Both are set from same value `mc.active` and `mc.closed` in the service.) | API | Service returns both for legacy compatibility. |
| TC-INV-011 | Admin | Dashboard with empty database returns all zeros | P2 | 1. Authenticate as Admin. 2. Use a clean test DB (no products, child boxes, cartons, dispatches). 3. GET `/api/v1/inventory/dashboard`. | All numeric fields = 0. `recentTransactions` = []. No null or NaN fields. Response shape is otherwise identical. | API | |
| TC-INV-012 | Admin | totalProducts counts only active products (is_active = true) | P1 | 1. Authenticate as Admin. 2. Create 3 active products. Deactivate 1 product (`is_active = false`). 3. DB: `SELECT COUNT(*) FROM products WHERE is_active = true`. 4. GET `/api/v1/inventory/dashboard`. | `totalProducts` = count of active products (= 2 in example). Deactivated product is excluded. | Integration | |

---

## Section 2 — KPI Consistency (arithmetic invariants)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-INV-020 | Admin | After generating 10 GENERATED boxes, generatedBoxes increases by 10 | P0 | 1. Authenticate as Admin. 2. Record baseline `generatedBoxes` = G from GET `/api/v1/inventory/dashboard`. 3. Generate 10 new child boxes (no activate). 4. GET `/api/v1/inventory/dashboard`. | `generatedBoxes` = G + 10. `freeChildBoxes` unchanged. `totalChildBoxes` increases by 10. `totalPairsInStock` unchanged (GENERATED excluded from pairs in stock). | Integration | Critical: GENERATED excluded from pairsInStock. |
| TC-INV-021 | Admin | Activating GENERATED box (GENERATED → FREE) decrements generatedBoxes and increments freeChildBoxes | P0 | 1. Authenticate as Admin. 2. Generate 1 box (GENERATED). Record `generatedBoxes` = G, `freeChildBoxes` = F. 3. POST `/api/v1/child-boxes/<id>/activate` (idempotent activate). 4. GET `/api/v1/inventory/dashboard`. | `generatedBoxes` = G − 1. `freeChildBoxes` = F + 1. `totalChildBoxes` unchanged. `totalPairsInStock` increases by the box's quantity (now FREE counts). | Integration | |
| TC-INV-022 | Admin | Packing FREE box into MC decrements freeChildBoxes and increments packedChildBoxes | P1 | 1. Authenticate as Admin. 2. Ensure 1 FREE child box exists. Record `freeChildBoxes` = F, `packedChildBoxes` = P. 3. Create a master carton and pack the FREE box. 4. GET `/api/v1/inventory/dashboard`. | `freeChildBoxes` = F − 1. `packedChildBoxes` = P + 1. `totalPairsInStock` unchanged (FREE+PACKED both count). `totalChildBoxes` unchanged. | Integration | |
| TC-INV-023 | Admin | Dispatching MC decrements packedChildBoxes and increments dispatchedChildBoxes | P0 | 1. Authenticate as Admin. 2. Close a MC with 3 PACKED boxes. Record `packedChildBoxes` = P, `dispatchedChildBoxes` = D. 3. Dispatch the MC. 4. GET `/api/v1/inventory/dashboard`. | `packedChildBoxes` = P − 3. `dispatchedChildBoxes` = D + 3. `totalPairsInStock` decreases by sum(quantities of 3 boxes). `totalPairsDispatched` increases by same. `totalChildBoxes` unchanged. | Integration | |
| TC-INV-024 | Admin | Adding box to sample record increments sampleBoxes | P1 | 1. Authenticate as Admin. 2. Activate a FREE child box. Record `freeChildBoxes` = F, `sampleBoxes` = S. 3. Create sample record, add that child box (status → SAMPLE). 4. GET `/api/v1/inventory/dashboard`. | `sampleBoxes` = S + 1. `freeChildBoxes` = F − 1. `totalPairsInStock` decreases by box quantity (SAMPLE excluded from pairs in stock). | Integration | |
| TC-INV-025 | Admin | Dashboard is real-time (no stale cache) — changes reflect immediately | P1 | 1. Authenticate as Admin. 2. GET `/api/v1/inventory/dashboard`. Record `totalChildBoxes` = T. 3. Create 1 new child box. 4. GET `/api/v1/inventory/dashboard` within 1 second. | `totalChildBoxes` = T + 1 immediately. No caching delay observed. | Integration | |

---

## Section 3 — Role Access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-INV-030 | Supervisor | Supervisor can GET /inventory/dashboard | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/inventory/dashboard`. | HTTP 200. Full KPI response returned. Same shape as Admin response. | API | |
| TC-INV-031 | Warehouse Operator | Warehouse Operator can GET /inventory/dashboard | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/inventory/dashboard`. | HTTP 200. Full KPI response returned. | API | All roles may view the dashboard per role matrix. |
| TC-INV-032 | Dispatch Operator | Dispatch Operator can GET /inventory/dashboard | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/inventory/dashboard`. | HTTP 200. Full KPI response returned. | API | |
| TC-INV-033 | Any | Unauthenticated request to /inventory/dashboard returns 401 | P0 | 1. GET `/api/v1/inventory/dashboard` without `Authorization` header. | HTTP 401. No KPI data returned. | API | `authenticate` middleware enforced on all `/inventory` routes. |

---

## Section 4 — Frontend E2E — Dashboard Page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-INV-E2E-001 | Admin | Dashboard page renders 5-column KPI card grid | P0 | 1. Log in as Admin at `http://localhost:3000`. 2. Navigate to `/` (dashboard). 3. Inspect the stat card grid. | Exactly 5 KPI cards are rendered in a `grid-cols-5` (lg breakpoint) layout. Cards visible: "Generated", "Total Child Boxes", "Active Master Cartons", "Today's Dispatches", "Pairs in Stock". | E2E | 5-column grid is the Apr 27 addition (was 4 in v2). |
| TC-INV-E2E-002 | Admin | First KPI card shows "Generated" with FileWarning icon and gray accent | P0 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect the first KPI card. | First card title text = "Generated". Subtitle = "Awaiting scan". Icon is `FileWarning` (Lucide). Accent color is gray (`#6B7280`). Value equals current `generatedBoxes` count from API. | E2E | New card added Apr 27. |
| TC-INV-E2E-003 | Admin | Total Child Boxes card shows breakdown chips summing to total | P0 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect the "Total Child Boxes" card. 4. Read individual chip values: Generated, Free, Packed, Dispatched. 5. Sum them. | `Generated + Free + Packed + Dispatched` chip values equal the card's main total number. No chip value is missing, null, or NaN. All four chip labels are visible: "Generated", "Free", "Packed", "Dispatched". | E2E | Core UI invariant; Sample and Ecommerce are not currently shown in breakdown chips per dashboard page.tsx code. |
| TC-INV-E2E-004 | Admin | "Active Master Cartons" card shows subtitle with total carton count | P1 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect the "Active Master Cartons" card. | Card title = "Active Master Cartons". Main value = `activeMasterCartons`. Subtitle = "<N> total" where N = `totalMasterCartons`. | E2E | |
| TC-INV-E2E-005 | Admin | "Today's Dispatches" card shows total dispatch count as subtitle | P1 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect the "Today's Dispatches" card. | Main value = `todayDispatches`. Subtitle = "<N> total" where N = `totalDispatches`. Truck icon visible with green accent. | E2E | |
| TC-INV-E2E-006 | Admin | "Pairs in Stock" card shows dispatched count as subtitle | P1 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect the "Pairs in Stock" card. | Main value = `totalPairsInStock`. Subtitle = "<N> dispatched" where N = `totalPairsDispatched`. Purple accent. | E2E | |
| TC-INV-E2E-007 | Admin | Inventory Summary side panel shows Generated, Free Boxes, Packed, Dispatched rows | P0 | 1. Log in as Admin. 2. Navigate to `/`. 3. Locate the "Inventory Summary" card. 4. Assert all rows present. | Four rows visible: "Generated (Awaiting Scan)" (gray), "Free Boxes" (green), "Packed in Cartons" (blue), "Dispatched" (gray). Each row shows a count matching the API field. "View Details" link present navigating to child boxes page. | E2E | |
| TC-INV-E2E-008 | Admin | Master Cartons side panel shows Active, Closed, Total rows | P1 | 1. Log in as Admin. 2. Navigate to `/`. 3. Locate the "Master Cartons" card. | Three rows: "Active Cartons" (green), "Closed Cartons" (orange), "Total Cartons" (gray). "View All" link present navigating to master cartons list. | E2E | |
| TC-INV-E2E-009 | Admin | Recent Activity section renders when transactions exist | P1 | 1. Log in as Admin. 2. Perform at least 1 inventory action (create child box). 3. Navigate to `/`. 4. Inspect "Recent Activity" card. | "Recent Activity" card is visible. At least 1 timeline entry shown with: action label (from TRANSACTION_TYPE_MAP), date relative time (e.g., "2m ago"), performer name ("by <name>"). Timeline connector line (vertical line) appears between entries. | E2E | |
| TC-INV-E2E-010 | Admin | Recent Activity hidden when no transactions | P2 | 1. Authenticate as Admin on clean DB. 2. Navigate to `/`. 3. Assert Recent Activity section visibility. | "Recent Activity" card is not rendered (conditional on `recentTransactions.length > 0`). | E2E | |
| TC-INV-E2E-011 | Admin | Welcome banner shows time-of-day greeting with user name | P2 | 1. Log in as Admin. 2. Navigate to `/`. | Welcome banner shows "Good Morning/Afternoon/Evening, Admin" (greeting depends on time). Background gradient is navy. | E2E | |
| TC-INV-E2E-012 | Admin | Quick Actions section shows 4 action cards | P1 | 1. Log in as Admin. 2. Navigate to `/`. 3. Inspect Quick Actions grid. | Exactly 4 cards: "Generate QR Labels" → `/child-boxes/generate`, "Create Carton" → `/master-cartons/create`, "Scan QR Code" → `/scan`, "New Dispatch" → `/dispatch`. Each has a gradient icon and ArrowRight indicator. | E2E | |
| TC-INV-E2E-013 | Admin | KPI cards auto-refresh every 30 seconds | P2 | 1. Log in as Admin. 2. Navigate to `/`. 3. Dispatch a carton. 4. Wait 30 seconds. 5. Observe the dashboard values without manual reload. | `todayDispatches` count updates after ~30 seconds (matches `refetchInterval: 30000` in `useApiQuery`). | E2E | Requires waiting or fake timers. |
| TC-INV-E2E-014 | Admin | Skeleton loaders appear during initial data fetch | P2 | 1. Simulate slow network (Chrome DevTools throttle to Slow 3G). 2. Log in as Admin. 3. Navigate to `/`. | While API call is in-flight, 5 skeleton card placeholders are visible instead of real KPI cards. Skeleton disappears when data loads. | E2E | |
| TC-INV-E2E-015 | Warehouse Operator | Warehouse Operator sees same dashboard with all KPI cards | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/`. | All 5 KPI cards are visible. Values match API response. No "forbidden" or missing sections based on role. | E2E | Dashboard is role-neutral. |
| TC-INV-E2E-016 | Dispatch Operator | Dispatch Operator sees same dashboard | P0 | 1. Log in as Dispatch Operator. 2. Navigate to `/`. | Same layout as Admin. All 5 KPI cards present with correct values. | E2E | |
