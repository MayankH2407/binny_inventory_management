# Phase 14 — Dashboard

**Module:** Dashboard (`GET /api/v1/inventory/dashboard` + `/` frontend page)
**Suite version:** v3 — refreshed 2026-06-09
**TC ID prefix:** `TC-DASH`
**Roles under test:** Admin, Supervisor, Warehouse Operator, Dispatch Operator, Unauthenticated

> **API preconditions:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base `http://localhost:5000/api/v1`.
> **UI preconditions:** Frontend running at `http://localhost:3000`. Session injected via `localStorage` or login flow.
>
> **Endpoint gate (ground truth — `inventory.routes.ts` line 12):**
> `GET /inventory/dashboard` is protected by `router.use(authenticate)` only — **no `authorizePermission` call**. All authenticated roles return 200; unauthenticated returns 401. This is a known discrepancy: the Master Test Plan matrix rows for `inventory:read` show Admin-only, but the dashboard endpoint is auth-only (any role can reach it). TCs encode actual behaviour, not the matrix intention.
>
> **Quick-action gate (ground truth — `page.tsx` lines 128–157):**
> All four quick-action cards (Generate QR Labels, Create Carton, Scan QR Code, New Dispatch) are rendered **unconditionally** on the dashboard page — there is no permission check in the JSX. The *sidebar* hides nav items by `requiresPermission`, but the quick-action cards on the dashboard are always shown for every authenticated role. TCs document this behaviour as a documented discrepancy (potential UX issue for Dispatch Operator who cannot generate boxes or create cartons).

---

## Table of Contents

1. [Section 1 — API: Endpoint Access & RBAC](#section-1--api-endpoint-access--rbac)
2. [Section 2 — API: Response Shape & Field Presence](#section-2--api-response-shape--field-presence)
3. [Section 3 — API: KPI Metric Correctness](#section-3--api-kpi-metric-correctness)
4. [Section 4 — API: KPI Arithmetic Invariants](#section-4--api-kpi-arithmetic-invariants)
5. [Section 5 — API: Recent Transactions](#section-5--api-recent-transactions)
6. [Section 6 — UI: Welcome Banner & Greeting](#section-6--ui-welcome-banner--greeting)
7. [Section 7 — UI: Stat Cards](#section-7--ui-stat-cards)
8. [Section 8 — UI: Summary Side Panels](#section-8--ui-summary-side-panels)
9. [Section 9 — UI: Quick Actions](#section-9--ui-quick-actions)
10. [Section 10 — UI: Recent Activity Feed](#section-10--ui-recent-activity-feed)
11. [Section 11 — UI: Loading & Empty States](#section-11--ui-loading--empty-states)
12. [Section 12 — UI: Per-Role Dashboard Access](#section-12--ui-per-role-dashboard-access)
13. [Section 13 — UI: Auto-Refresh](#section-13--ui-auto-refresh)

---

## Section 1 — API: Endpoint Access & RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-001 | Admin | GET /inventory/dashboard returns 200 for Admin | P0 | 1. POST `/auth/login` with Admin credentials. Extract `accessToken`. 2. GET `/inventory/dashboard` with `Authorization: Bearer <token>`. 3. Assert HTTP status. | HTTP 200. `success: true`. `data` object present. | API | Realizing spec: `23-inventory-dashboard.spec.ts` TC-DASH-API-001. |
| TC-DASH-002 | Supervisor | GET /inventory/dashboard returns 200 for Supervisor | P0 | 1. Login as Supervisor. 2. GET `/inventory/dashboard` with token. | HTTP 200. Full dashboard data object returned. Same shape as Admin response. | API | Auth-only gate — no `authorizePermission` on this route. AUTOMATION GAP: no per-role test in existing specs. |
| TC-DASH-003 | Warehouse Operator | GET /inventory/dashboard returns 200 for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. GET `/inventory/dashboard` with token. | HTTP 200. Full dashboard data object returned. | API | AUTOMATION GAP: no Warehouse Op API test in existing specs. |
| TC-DASH-004 | Dispatch Operator | GET /inventory/dashboard returns 200 for Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. GET `/inventory/dashboard` with token. | HTTP 200. Full dashboard data object returned. | API | AUTOMATION GAP: no Dispatch Op API test in existing specs. |
| TC-DASH-005 | Unauthenticated | GET /inventory/dashboard without token returns 401 | P0 | 1. GET `/inventory/dashboard` with no `Authorization` header. | HTTP 401. No KPI data in response body. | API | `router.use(authenticate)` enforced on entire `/inventory` router prefix. |
| TC-DASH-006 | Unauthenticated | GET /inventory/dashboard with expired token returns 401 | P1 | 1. Obtain a token. 2. Wait for token expiry (or forge an expired JWT). 3. GET `/inventory/dashboard` with the expired token. | HTTP 401. Error message indicates token invalid or expired. | API | Token expiry = 3600s per master plan. |
| TC-DASH-007 | Unauthenticated | GET /inventory/dashboard with malformed token returns 401 | P1 | 1. GET `/inventory/dashboard` with `Authorization: Bearer not_a_real_token`. | HTTP 401. | API | AUTOMATION GAP: malformed-token path. |

---

## Section 2 — API: Response Shape & Field Presence

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-010 | Admin | Response body contains all 20 required fields | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Assert each named field exists in `data`. | `data` contains ALL of: `totalChildBoxes`, `generatedBoxes`, `freeChildBoxes`, `packedChildBoxes`, `sampleBoxes`, `ecommerceBoxes`, `dispatchedChildBoxes`, `totalMasterCartons`, `createdCartons`, `activeCartons`, `closedCartons`, `dispatchedCartons`, `activeMasterCartons`, `closedMasterCartons`, `todayDispatches`, `totalDispatches`, `totalPairsInStock`, `totalPairsDispatched`, `totalProducts`, `recentTransactions`. | API | Realizing spec: `23-inventory-dashboard.spec.ts` TC-DASH-API-002 (partial — does not check all 20). |
| TC-DASH-011 | Admin | All numeric KPI fields are non-negative integers | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. For each numeric field (all except `recentTransactions`), assert type and value. | Each numeric field: `typeof === 'number'`, value `>= 0`, `Number.isInteger(value) === true`. No `null`, `undefined`, or `NaN` values. | API | Service uses `parseInt(..., 10)` for all numeric fields. |
| TC-DASH-012 | Admin | recentTransactions is an array | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Check `data.recentTransactions`. | `Array.isArray(data.recentTransactions) === true`. Array length 0–20. | API | Service: `LIMIT 20` query. |
| TC-DASH-013 | Admin | activeMasterCartons equals activeCartons (alias field) | P1 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Compare `data.activeMasterCartons` and `data.activeCartons`. | `data.activeMasterCartons === data.activeCartons`. Both are set from `mc.active` (ACTIVE-status carton count). | API | Service line 111–112: both assigned `parseInt(mc.active, 10)`. |
| TC-DASH-014 | Admin | closedMasterCartons equals closedCartons (alias field) | P1 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Compare `data.closedMasterCartons` and `data.closedCartons`. | `data.closedMasterCartons === data.closedCartons`. Both are set from `mc.closed` (CLOSED-status carton count). | API | Service line 112–113: both assigned `parseInt(mc.closed, 10)`. |
| TC-DASH-015 | Admin | createdCartons field counts CREATED-status master cartons | P1 | 1. Login as Admin. 2. Create a new master carton (status starts as CREATED). 3. GET `/inventory/dashboard`. 3. Compare `data.createdCartons` to DB: `SELECT COUNT(*) FROM master_cartons WHERE status = 'CREATED'`. | `data.createdCartons` equals the DB count of CREATED-status cartons. | API | Service queries `COUNT(*) FILTER (WHERE status = $1)` for CREATED status. AUTOMATION GAP. |
| TC-DASH-016 | Admin | dispatchedCartons field counts DISPATCHED-status master cartons | P1 | 1. Login as Admin. 2. Dispatch a master carton. 3. GET `/inventory/dashboard`. 4. Compare `data.dispatchedCartons` to DB: `SELECT COUNT(*) FROM master_cartons WHERE status = 'DISPATCHED'`. | `data.dispatchedCartons` equals the DB count of DISPATCHED-status cartons. | API | AUTOMATION GAP. |

---

## Section 3 — API: KPI Metric Correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-020 | Admin | generatedBoxes counts GENERATED-status child boxes | P0 | 1. Login as Admin. 2. Record baseline `generatedBoxes` = G via GET `/inventory/dashboard`. 3. Bulk-create 5 child boxes (GENERATED status, no activate call). 4. GET `/inventory/dashboard`. 5. Assert `data.generatedBoxes`. | `generatedBoxes` = G + 5. Value is integer. | Integration | Service: `COUNT(*) FILTER (WHERE status = $1)` where `$1 = CHILD_BOX_STATUS.GENERATED`. |
| TC-DASH-021 | Admin | freeChildBoxes counts FREE-status child boxes | P0 | 1. Login as Admin. 2. Generate 1 child box. Activate it (GENERATED → FREE). 3. GET `/inventory/dashboard`. 4. Compare `freeChildBoxes` to DB: `SELECT COUNT(*) FROM child_boxes WHERE status = 'FREE'`. | `data.freeChildBoxes` equals DB count of FREE-status boxes. | Integration | |
| TC-DASH-022 | Admin | packedChildBoxes counts PACKED-status child boxes | P0 | 1. Login as Admin. 2. Pack a FREE box into a master carton. 3. GET `/inventory/dashboard`. 4. Compare `packedChildBoxes` to DB: `SELECT COUNT(*) FROM child_boxes WHERE status = 'PACKED'`. | `data.packedChildBoxes` equals DB count of PACKED-status boxes. | Integration | |
| TC-DASH-023 | Admin | sampleBoxes counts SAMPLE-status child boxes | P0 | 1. Login as Admin. 2. Record baseline `sampleBoxes` = S. 3. Create a sample record, add 3 boxes (status → SAMPLE). 4. GET `/inventory/dashboard`. | `data.sampleBoxes` = S + 3. | Integration | SAMPLE boxes are excluded from `totalPairsInStock` (stock is FREE+PACKED only). |
| TC-DASH-024 | Admin | ecommerceBoxes counts ECOMMERCE-status child boxes | P0 | 1. Login as Admin. 2. Record baseline `ecommerceBoxes` = E. 3. Create an ecommerce record, add 4 boxes (status → ECOMMERCE). 4. GET `/inventory/dashboard`. | `data.ecommerceBoxes` = E + 4. | Integration | |
| TC-DASH-025 | Admin | dispatchedChildBoxes counts DISPATCHED-status child boxes | P0 | 1. Login as Admin. 2. Dispatch a master carton containing 2 packed boxes. 3. GET `/inventory/dashboard`. 4. Compare to DB: `SELECT COUNT(*) FROM child_boxes WHERE status = 'DISPATCHED'`. | `data.dispatchedChildBoxes` equals DB count. | Integration | |
| TC-DASH-026 | Admin | totalPairsInStock is SUM(quantity) for FREE and PACKED boxes only | P0 | 1. Login as Admin. 2. Ensure boxes of all 6 statuses exist. 3. DB: `SELECT COALESCE(SUM(quantity), 0) FROM child_boxes WHERE status IN ('FREE', 'PACKED')`. 4. GET `/inventory/dashboard`. | `data.totalPairsInStock` equals the DB sum. GENERATED, SAMPLE, ECOMMERCE, DISPATCHED quantities are excluded. | Integration | Service lines 67–71: explicit `WHERE status IN ($1, $2)` for FREE and PACKED. Critical exclusion. Realizing spec: `23-inventory-dashboard.spec.ts` TC-INV-API-001. |
| TC-DASH-027 | Admin | totalPairsDispatched is SUM(quantity) for DISPATCHED boxes only | P0 | 1. Login as Admin. 2. Dispatch 2 boxes with quantity 6 each. 3. DB: `SELECT COALESCE(SUM(quantity), 0) FROM child_boxes WHERE status = 'DISPATCHED'`. 4. GET `/inventory/dashboard`. | `data.totalPairsDispatched` equals DB sum of DISPATCHED quantities. | Integration | Service lines 73–77: `WHERE status = $1` for DISPATCHED. |
| TC-DASH-028 | Admin | totalProducts counts only is_active=true products | P1 | 1. Login as Admin. 2. Create 3 active products. Deactivate 1 (`is_active = false`). 3. DB: `SELECT COUNT(*) FROM products WHERE is_active = true`. 4. GET `/inventory/dashboard`. | `data.totalProducts` equals the DB count of active products only. Inactive product is excluded. | Integration | Service: `SELECT COUNT(*) as total FROM products WHERE is_active = true`. |
| TC-DASH-029 | Admin | todayDispatches counts dispatch_records where dispatch_date::date = CURRENT_DATE | P0 | 1. Login as Admin. 2. Record baseline `todayDispatches` = T. 3. Create a dispatch record (default `dispatch_date` = NOW()). 4. GET `/inventory/dashboard`. | `data.todayDispatches` = T + 1. `data.totalDispatches` also = previous total + 1. | Integration | Service: `COUNT(*) FILTER (WHERE dispatch_date::date = CURRENT_DATE)`. |
| TC-DASH-030 | Admin | todayDispatches does not count dispatches from previous days | P1 | 1. Login as Admin. 2. Confirm existing dispatch records exist from previous days. 3. GET `/inventory/dashboard`. | `data.todayDispatches` equals only today's count; historical dispatches do not inflate `todayDispatches`. `data.totalDispatches` includes all dispatches. | Integration | AUTOMATION GAP: requires data seeded with past dates. |
| TC-DASH-031 | Admin | Empty database returns all-zero KPI fields | P2 | 1. Use a clean test DB with no data. 2. Login as Admin. 3. GET `/inventory/dashboard`. | All numeric fields = 0. `recentTransactions = []`. No `null` or `NaN` in any field. Response shape identical to non-empty DB. | API | `COALESCE(..., 0)` guards in service queries. |

---

## Section 4 — API: KPI Arithmetic Invariants

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-040 | Admin | totalChildBoxes equals sum of all six status counts | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Compute: `generatedBoxes + freeChildBoxes + packedChildBoxes + sampleBoxes + ecommerceBoxes + dispatchedChildBoxes`. 4. Compare to `totalChildBoxes`. | Computed sum equals `totalChildBoxes` exactly (integer equality). No status count is missing or double-counted. | API | Realizing spec: `23-inventory-dashboard.spec.ts` TC-DASH-API-002 (partial check: `total >= free + packed`). Full sum invariant is an AUTOMATION GAP. |
| TC-DASH-041 | Admin | totalMasterCartons equals sum of all four carton-status counts | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. 3. Compute: `createdCartons + activeCartons + closedCartons + dispatchedCartons`. 4. Compare to `totalMasterCartons`. | `createdCartons + activeCartons + closedCartons + dispatchedCartons` = `totalMasterCartons` exactly. | API | AUTOMATION GAP: spec `23` checks activeCartons > 0 but not full sum. |
| TC-DASH-042 | Admin | Generating boxes increments generatedBoxes, leaves totalPairsInStock unchanged | P0 | 1. Login as Admin. 2. GET `/inventory/dashboard`. Record `generatedBoxes` = G, `totalPairsInStock` = S, `totalChildBoxes` = T. 3. Create 10 GENERATED boxes (no activate). 4. GET `/inventory/dashboard`. | `generatedBoxes` = G + 10. `totalChildBoxes` = T + 10. `totalPairsInStock` = S (unchanged — GENERATED excluded from pairs in stock). | Integration | Critical: GENERATED excluded from stock pairs. |
| TC-DASH-043 | Admin | Activating box (GENERATED → FREE) shifts count, increases totalPairsInStock | P0 | 1. Login as Admin. 2. Generate 1 box with quantity 6. Record `generatedBoxes` = G, `freeChildBoxes` = F, `totalPairsInStock` = S. 3. Activate the box (POST `/child-boxes/<id>/activate`). 4. GET `/inventory/dashboard`. | `generatedBoxes` = G − 1. `freeChildBoxes` = F + 1. `totalChildBoxes` unchanged. `totalPairsInStock` = S + 6 (box is now FREE, contributes to pairs). | Integration | |
| TC-DASH-044 | Admin | Packing FREE box into MC shifts count, leaves totalPairsInStock unchanged | P1 | 1. Login as Admin. 2. Ensure 1 FREE box exists. Record `freeChildBoxes` = F, `packedChildBoxes` = P, `totalPairsInStock` = S. 3. Pack the box into a master carton. 4. GET `/inventory/dashboard`. | `freeChildBoxes` = F − 1. `packedChildBoxes` = P + 1. `totalPairsInStock` = S (unchanged — both FREE and PACKED count toward in-stock). | Integration | |
| TC-DASH-045 | Admin | Dispatching MC decrements packed count, increments dispatched count, decreases totalPairsInStock | P0 | 1. Login as Admin. 2. Create a closed MC with 3 PACKED boxes of quantity 4 each (total = 12 pairs). Record `packedChildBoxes` = P, `dispatchedChildBoxes` = D, `totalPairsInStock` = S, `totalPairsDispatched` = PD. 3. Dispatch the MC. 4. GET `/inventory/dashboard`. | `packedChildBoxes` = P − 3. `dispatchedChildBoxes` = D + 3. `totalPairsInStock` = S − 12. `totalPairsDispatched` = PD + 12. `totalChildBoxes` unchanged. | Integration | |
| TC-DASH-046 | Admin | Adding box to sample record shifts FREE to SAMPLE, decreases totalPairsInStock | P1 | 1. Login as Admin. 2. Activate a FREE box with quantity 3. Record `freeChildBoxes` = F, `sampleBoxes` = S, `totalPairsInStock` = PS. 3. Create a sample record, add the box (status → SAMPLE). 4. GET `/inventory/dashboard`. | `freeChildBoxes` = F − 1. `sampleBoxes` = S + 1. `totalPairsInStock` = PS − 3 (SAMPLE excluded from in-stock pairs). | Integration | |
| TC-DASH-047 | Admin | Adding box to ecommerce record shifts FREE to ECOMMERCE, decreases totalPairsInStock | P1 | 1. Login as Admin. 2. Activate a FREE box with quantity 5. Record `freeChildBoxes` = F, `ecommerceBoxes` = E, `totalPairsInStock` = PS. 3. Create an ecommerce record, add the box (status → ECOMMERCE). 4. GET `/inventory/dashboard`. | `freeChildBoxes` = F − 1. `ecommerceBoxes` = E + 1. `totalPairsInStock` = PS − 5. | Integration | |

---

## Section 5 — API: Recent Transactions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-050 | Admin | recentTransactions contains at most 20 items | P1 | 1. Login as Admin. 2. Perform 25+ inventory transactions. 3. GET `/inventory/dashboard`. 4. Assert `data.recentTransactions.length`. | `data.recentTransactions.length` is in the range [0, 20]. | API | Service: `LIMIT 20` in the `inventory_transactions` query. |
| TC-DASH-051 | Admin | recentTransactions is ordered newest-first by created_at | P1 | 1. Login as Admin. 2. Perform 3 sequential operations (creating known timestamps). 3. GET `/inventory/dashboard`. 4. Assert order of `recentTransactions`. | `recentTransactions[0].created_at >= recentTransactions[1].created_at >= ...` descending. | API | Service: `ORDER BY created_at DESC`. |
| TC-DASH-052 | Admin | Each recentTransactions item has required fields | P1 | 1. Login as Admin. 2. Ensure at least 1 transaction exists. 3. GET `/inventory/dashboard`. 4. Inspect first element of `recentTransactions`. | Each item has at minimum: `id`, `transaction_type`, `created_at`. `transaction_type` is one of the known TRANSACTION_TYPES constants or an extension value. | API | Service returns `SELECT * FROM inventory_transactions`. |
| TC-DASH-053 | Admin | recentTransactions is empty array on clean DB | P2 | 1. Use clean test DB. 2. Login as Admin. 3. GET `/inventory/dashboard`. | `data.recentTransactions` = `[]`. Not `null` or `undefined`. | API | |
| TC-DASH-054 | Admin | recentTransactions API returns up to 20; frontend displays at most 10 | P1 | 1. Login as Admin. 2. Perform 20+ transactions. 3. GET `/inventory/dashboard` via API. 4. Also navigate to `/` in browser. 5. Count timeline entries rendered on page. | API `recentTransactions.length` = 20 (or all if < 20). Browser renders at most 10 entries (frontend: `stats?.recentTransactions?.slice(0, 10) ?? []`). | Integration | DISCREPANCY: API returns 20 but UI caps at 10 (frontend `page.tsx` line 159). AUTOMATION GAP. |

---

## Section 6 — UI: Welcome Banner & Greeting

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-060 | Admin | Welcome banner renders with navy gradient | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect the welcome banner element. | A banner element with `background: linear-gradient(135deg, #2D2A6E 0%, #1E1A5F 60%, #3D3A8E 100%)` is visible. White text content is present. | E2E | Realizing spec: `02-dashboard.spec.ts` TC-DASH-001. |
| TC-DASH-061 | Admin | Greeting shows "Good Morning" between midnight and noon | P2 | 1. Set system time or fake `Date` to 09:00. 2. Login as Admin. 3. Navigate to `/`. | Banner contains text "Good Morning". Does not contain "Afternoon" or "Evening". | E2E | `getTimeOfDay()`: `hour < 12 → 'Morning'`. |
| TC-DASH-062 | Admin | Greeting shows "Good Afternoon" between noon and 17:00 | P2 | 1. Set/fake time to 14:00. 2. Login as Admin. 3. Navigate to `/`. | Banner contains text "Good Afternoon". | E2E | `getTimeOfDay()`: `hour < 17 → 'Afternoon'`. |
| TC-DASH-063 | Admin | Greeting shows "Good Evening" at 17:00 or later | P2 | 1. Set/fake time to 19:00. 2. Login as Admin. 3. Navigate to `/`. | Banner contains text "Good Evening". | E2E | `getTimeOfDay()`: else `→ 'Evening'`. |
| TC-DASH-064 | Admin | Greeting includes user name from auth store | P1 | 1. Login as Admin (user name = "Alice"). 2. Navigate to `/`. | Banner text contains ", Alice" (comma-space then the name). Full greeting example: "Good Morning, Alice". | E2E | `page.tsx` line 172: `{user?.name ? `, ${user.name}` : ''}`. Realizing spec: `02-dashboard.spec.ts` TC-DASH-001 (asserts greeting present but not name-specific). |
| TC-DASH-065 | Admin | Greeting omits name portion if user name is null/empty | P2 | 1. Login as a user whose `name` field is null or empty string. 2. Navigate to `/`. | Banner shows "Good Morning/Afternoon/Evening" without trailing comma or name. | E2E | `user?.name ? ', ' + user.name : ''`. AUTOMATION GAP. |
| TC-DASH-066 | Admin | Banner sub-text reads "Here is your inventory overview for today" | P2 | 1. Login as Admin. 2. Navigate to `/`. | Banner contains text "Here is your inventory overview for today". | E2E | Realizing spec: `02-dashboard.spec.ts` TC-DASH-001 (asserts `inventory overview` text). |

---

## Section 7 — UI: Stat Cards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-070 | Admin | Exactly 5 stat cards rendered in lg:grid-cols-5 grid | P0 | 1. Login as Admin. 2. Navigate to `/`. Wait for data load. 3. Count stat card elements. | Exactly 5 cards in the stat-cards grid, in this order: "Generated", "Total Child Boxes", "Active Master Cartons", "Today's Dispatches", "Pairs in Stock". | E2E | Realizing spec: `02-dashboard.spec.ts` TC-DASH-002. |
| TC-DASH-071 | Admin | "Generated" card: title, subtitle, icon, gray accent | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect first stat card. | Title = "Generated". Subtitle = "Awaiting scan". `FileWarning` Lucide icon visible. Accent color `#6B7280` (gray). Main value equals `data.generatedBoxes` from API. | E2E | `page.tsx` lines 81–87. |
| TC-DASH-072 | Admin | "Total Child Boxes" card: title, breakdown chips, navy accent | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect second stat card ("Total Child Boxes"). | Title = "Total Child Boxes". Main value equals `data.totalChildBoxes`. Four breakdown chips visible: "Generated" (gray), "Free" (green), "Packed" (blue), "Dispatched" (gray). No "Sample" or "Ecommerce" chip. `Package` icon. Accent `#2D2A6E` (navy). | E2E | `page.tsx` lines 89–101. SAMPLE/ECOMMERCE chips intentionally absent. Realizing spec: `02-dashboard.spec.ts` TC-DASH-002. |
| TC-DASH-073 | Admin | "Total Child Boxes" breakdown chip sum equals main value | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Read each chip value: Generated, Free, Packed, Dispatched. 4. Sum them. | Sum of four chip values equals the main total value. Note: SAMPLE + ECOMMERCE boxes are NOT in the chip sum; therefore `chipSum = totalChildBoxes - sampleBoxes - ecommerceBoxes`. This is expected per source code. | E2E | DISCREPANCY: chip sum ≠ `totalChildBoxes` when SAMPLE or ECOMMERCE boxes exist. UI only shows 4 of 6 statuses in breakdown. AUTOMATION GAP. |
| TC-DASH-074 | Admin | "Active Master Cartons" card: title, subtitle with total, blue accent | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect third stat card. | Title = "Active Master Cartons". Main value = `data.activeMasterCartons`. Subtitle = "<N> total" where N = `data.totalMasterCartons`. `Boxes` icon. Accent `#2563EB` (blue). | E2E | `page.tsx` lines 103–109. |
| TC-DASH-075 | Admin | "Today's Dispatches" card: title, subtitle with total dispatches, green accent | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect fourth stat card. | Title = "Today's Dispatches". Main value = `data.todayDispatches`. Subtitle = "<N> total" where N = `data.totalDispatches`. `Truck` icon. Accent `#16A34A` (green). | E2E | `page.tsx` lines 111–117. |
| TC-DASH-076 | Admin | "Pairs in Stock" card: title, subtitle with dispatched count, purple accent | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect fifth stat card. | Title = "Pairs in Stock". Main value = `data.totalPairsInStock`. Subtitle = "<N> dispatched" where N = `data.totalPairsDispatched`. `ShoppingBag` icon. Accent `#9333EA` (purple). | E2E | `page.tsx` lines 119–126. |
| TC-DASH-077 | Admin | Stat card values use en-IN number formatting (toLocaleString) | P2 | 1. Login as Admin. 2. Generate scenario with totalChildBoxes >= 1000. 3. Navigate to `/`. | Numbers ≥ 1000 are formatted with Indian number system grouping (e.g., "1,234" or "12,345"). No raw unformatted large numbers. | E2E | `page.tsx` line 190: `stat.value.toLocaleString('en-IN')`. AUTOMATION GAP. |
| TC-DASH-078 | Admin | Stat cards show zero values (not blank or "undefined") on empty DB | P1 | 1. Use clean test DB. 2. Login as Admin. 3. Navigate to `/`. | All 5 stat cards show "0" as their main value. No card shows "undefined", blank, or null text. | E2E | Frontend: `stats?.generatedBoxes ?? 0` etc. |

---

## Section 8 — UI: Summary Side Panels

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-080 | Admin | Inventory Summary panel renders with 4 rows | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect "Inventory Summary" card. | Panel heading "Inventory Summary" visible. Four rows: "Generated (Awaiting Scan)" (gray border), "Free Boxes" (green border), "Packed in Cartons" (blue border), "Dispatched" (gray border). Each row shows a count. | E2E | `page.tsx` lines 259–285. Realizing spec: `02-dashboard.spec.ts` TC-DASH-004. |
| TC-DASH-081 | Admin | Inventory Summary values match API fields | P1 | 1. Login as Admin. 2. GET `/inventory/dashboard`. Record field values. 3. Navigate to `/`. 4. Compare panel row values to API. | "Generated (Awaiting Scan)" row = `data.generatedBoxes`. "Free Boxes" = `data.freeChildBoxes`. "Packed in Cartons" = `data.packedChildBoxes`. "Dispatched" = `data.dispatchedChildBoxes`. | Integration | AUTOMATION GAP: cross-referencing API values to UI panel. |
| TC-DASH-082 | Admin | Inventory Summary "View Details" link navigates to /child-boxes | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "View Details" link in Inventory Summary panel. | Browser navigates to `/child-boxes` (ROUTES.CHILD_BOXES). | E2E | `page.tsx` line 253: `href={ROUTES.CHILD_BOXES}`. |
| TC-DASH-083 | Admin | Master Cartons panel renders with 3 rows | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Inspect "Master Cartons" panel. | Panel heading "Master Cartons" visible. Three rows: "Active Cartons" (green border), "Closed Cartons" (orange border), "Total Cartons" (gray border). Each row shows a count. Note: no "Created" or "Dispatched" rows in this panel. | E2E | `page.tsx` lines 297–317. Realizing spec: `02-dashboard.spec.ts` TC-DASH-004. |
| TC-DASH-084 | Admin | Master Cartons panel values match API fields | P1 | 1. Login as Admin. 2. GET `/inventory/dashboard`. Record field values. 3. Navigate to `/`. 4. Compare panel row values to API. | "Active Cartons" = `data.activeMasterCartons`. "Closed Cartons" = `data.closedMasterCartons`. "Total Cartons" = `data.totalMasterCartons`. | Integration | AUTOMATION GAP. |
| TC-DASH-085 | Admin | Master Cartons "View All" link navigates to /master-cartons | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "View All" link in Master Cartons panel. | Browser navigates to `/master-cartons` (ROUTES.MASTER_CARTONS). | E2E | `page.tsx` line 291: `href={ROUTES.MASTER_CARTONS}`. |

---

## Section 9 — UI: Quick Actions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-090 | Admin | Quick Actions section shows exactly 4 cards | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Count Quick Action cards. | Section heading "Quick Actions" visible. Exactly 4 cards: "Generate QR Labels", "Create Carton", "Scan QR Code", "New Dispatch". Each has a gradient icon and ArrowRight indicator. | E2E | `page.tsx` lines 128–157. Realizing spec: `02-dashboard.spec.ts` TC-DASH-003, `23-inventory-dashboard.spec.ts` TC-DASH-E2E-003. |
| TC-DASH-091 | Admin | "Generate QR Labels" links to /child-boxes/generate | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "Generate QR Labels" quick-action card. | Browser navigates to `/child-boxes/generate` (ROUTES.CHILD_BOXES_GENERATE). | E2E | `page.tsx` line 131: `href: ROUTES.CHILD_BOXES_GENERATE`. Realizing spec: `02-dashboard.spec.ts` TC-DASH-007. |
| TC-DASH-092 | Admin | "Create Carton" links to /master-cartons/create | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "Create Carton" quick-action card. | Browser navigates to `/master-cartons/create` (ROUTES.MASTER_CARTONS_CREATE). | E2E | |
| TC-DASH-093 | Admin | "Scan QR Code" links to /scan | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "Scan QR Code" quick-action card. | Browser navigates to `/scan` (ROUTES.SCAN). | E2E | |
| TC-DASH-094 | Admin | "New Dispatch" links to /dispatch | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Click "New Dispatch" quick-action card. | Browser navigates to `/dispatch` (ROUTES.DISPATCH). | E2E | |
| TC-DASH-095 | Dispatch Operator | All 4 quick-action cards render for Dispatch Operator (no role gate) | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/`. 3. Count Quick Action cards. | All 4 quick-action cards are rendered and visible: "Generate QR Labels", "Create Carton", "Scan QR Code", "New Dispatch". No card is hidden or disabled based on role. | E2E | DISCREPANCY: Dispatch Operator does NOT have `child_boxes:create` or `cartons:create` permissions, yet the dashboard renders "Generate QR Labels" and "Create Carton" links unconditionally. If the user clicks through, the destination pages will enforce permissions at that level. This is a known UX gap — document as actual behaviour. AUTOMATION GAP. |
| TC-DASH-096 | Warehouse Operator | All 4 quick-action cards render for Warehouse Operator (no role gate) | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/`. 3. Count Quick Action cards. | All 4 quick-action cards are visible including "New Dispatch". Note: Warehouse Operator does NOT have `dispatch:create` permission; clicking "New Dispatch" will lead to a page that enforces permission. | E2E | DISCREPANCY: "New Dispatch" card shown to Warehouse Op who cannot dispatch. AUTOMATION GAP. |
| TC-DASH-097 | Supervisor | All 4 quick-action cards render for Supervisor | P1 | 1. Login as Supervisor. 2. Navigate to `/`. | All 4 quick-action cards visible. Supervisor has `child_boxes:create`, `cartons:create`, `packing:pack` but NOT `dispatch:create` (read-only); "New Dispatch" card still renders. | E2E | AUTOMATION GAP. |
| TC-DASH-098 | Admin | Quick-action cards have ArrowRight hover animation | P3 | 1. Login as Admin. 2. Navigate to `/`. 3. Hover over each quick-action card. | ArrowRight icon shifts slightly right on hover (`group-hover:translate-x-0.5`). Card border/shadow changes on hover (`interactive` Card prop). | E2E | `page.tsx` lines 239–241. AUTOMATION GAP. |

---

## Section 10 — UI: Recent Activity Feed

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-100 | Admin | Recent Activity card is visible when transactions exist | P1 | 1. Login as Admin. 2. Perform at least 1 action (e.g., create a child box). 3. Navigate to `/`. | "Recent Activity" card is visible. At least 1 timeline entry rendered. | E2E | `page.tsx` line 321: `{recentTransactions.length > 0 && ...}`. Realizing spec: `02-dashboard.spec.ts` TC-DASH-011. |
| TC-DASH-101 | Admin | Recent Activity card is NOT rendered when no transactions | P2 | 1. Use clean test DB (no transactions). 2. Login as Admin. 3. Navigate to `/`. | "Recent Activity" card element is absent from the DOM (not merely hidden — the conditional `&&` means it is not rendered at all). | E2E | Frontend: `recentTransactions.length > 0` guard. |
| TC-DASH-102 | Admin | Recent Activity shows at most 10 entries (UI cap) | P1 | 1. Ensure 15+ transactions exist. 2. Login as Admin. 3. Navigate to `/`. 4. Count timeline entries in the Recent Activity card. | At most 10 entries rendered (frontend slices to 10: `recentTransactions.slice(0, 10)`). API returned up to 20 in `data.recentTransactions`. | E2E | DISCREPANCY: API cap = 20, UI display cap = 10. `page.tsx` line 159. AUTOMATION GAP. |
| TC-DASH-103 | Admin | Each timeline entry shows action label from TRANSACTION_TYPE_MAP | P1 | 1. Login as Admin. 2. Perform a CHILD_CREATED transaction. 3. Navigate to `/`. 4. Inspect the timeline entry. | Entry shows "Child Box Created" label (mapped from `TRANSACTION_TYPE_MAP.CHILD_CREATED.label`). Icon is `Package` (green). | E2E | `page.tsx` lines 28–29 and 326–328. |
| TC-DASH-104 | Admin | Unknown transaction type shows raw transaction_type string as label | P2 | 1. Directly insert an `inventory_transactions` row with `transaction_type = 'LEGACY_CARTON_OPENED'` (a type not in TRANSACTION_TYPE_MAP). 2. Navigate to `/`. 3. Inspect the Recent Activity entry. | Entry label = "LEGACY_CARTON_OPENED" (raw value). Icon = `Package` (fallback). Color = gray. `TRANSACTION_TYPE_MAP` covers 7 types; all others fall through to default. | E2E | `page.tsx` lines 326–330: `?? { label: tx.transaction_type, icon: Package, color: 'text-gray-600 bg-gray-50' }`. AUTOMATION GAP. Known gap: `TRANSACTION_TYPES` has 21 constants, `TRANSACTION_TYPE_MAP` only maps 7. |
| TC-DASH-105 | Admin | Timeline entries show relative time ("Xm ago", "Xh ago", "Xd ago") | P1 | 1. Login as Admin. 2. Perform transactions at known times (< 60s, ~30m, ~3h, ~3d ago). 3. Navigate to `/`. | Entries show: "just now" for < 60s, "30m ago" for ~30m, "3h ago" for ~3h, "3d ago" for ~3d. Entries older than 7 days show short date (e.g., "Jun 1"). | E2E | `formatRelativeTime()` function `page.tsx` lines 45–59. AUTOMATION GAP: requires controlled timestamps. |
| TC-DASH-106 | Admin | Timeline entry shows "by <performer name>" | P1 | 1. Login as Admin ("Alice"). 2. Perform a CHILD_CREATED action. 3. Navigate to `/`. 4. Inspect the timeline entry. | Entry body contains "by Alice" text (where Alice is the logged-in user's name). | E2E | `page.tsx` line 353: `by {tx.performed_by}`. Note: `performed_by` field in `inventory_transactions` stores user ID; the API returns raw row so the display name depends on the DB column value. AUTOMATION GAP. |
| TC-DASH-107 | Admin | Timeline connector line appears between entries (not after last) | P2 | 1. Login as Admin. 2. Ensure 3+ transactions exist. 3. Navigate to `/`. 4. Inspect connector lines between timeline entries. | Vertical connector line (`div.absolute` with `w-px bg-brand-border`) renders between all entries except the last. Last entry has no connector line below it. | E2E | `page.tsx` lines 341–343: `{!isLast && <div className="absolute left-[22px]...">}`. AUTOMATION GAP. |
| TC-DASH-108 | Admin | Entry notes text is shown if tx.notes is non-empty | P2 | 1. Insert a transaction with non-empty `notes` field. 2. Navigate to `/`. 3. Inspect the timeline entry. | Notes text rendered below the action label (truncated with CSS truncate). | E2E | `page.tsx` lines 349–351: `{tx.notes && <p ...>{tx.notes}</p>}`. AUTOMATION GAP. |

---

## Section 11 — UI: Loading & Empty States

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-110 | Admin | Skeleton cards render during initial data fetch | P2 | 1. Throttle network to Slow 3G (Chrome DevTools). 2. Login as Admin. 3. Navigate to `/`. 4. Observe the page before API response arrives. | 5 `SkeletonCard` placeholder elements visible while `isLoading = true`. Real stat card grid does not render until data arrives. | E2E | `page.tsx` lines 69–78: early return with 5 skeleton cards when `isLoading`. Realizing spec: `02-dashboard.spec.ts` TC-DASH-005. |
| TC-DASH-111 | Admin | Page renders real content after loading completes | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Wait for `networkidle`. | Stat cards, Quick Actions, summary panels, and (conditionally) Recent Activity are all rendered. No skeleton elements remain visible. | E2E | Realizing spec: `23-inventory-dashboard.spec.ts` TC-DASH-E2E-001, TC-DASH-E2E-002. |
| TC-DASH-112 | Admin | Dashboard shows zeros (not skeleton) when API returns empty data | P2 | 1. Clean DB. 2. Login as Admin. 3. Navigate to `/`. | Data loads (not skeleton) showing all zeros. Recent Activity absent. Quick Actions still shown. | E2E | `page.tsx` uses `?? 0` defaults on all fields. |
| TC-DASH-113 | Admin | Main content area does not contain the literal text "undefined" | P1 | 1. Login as Admin. 2. Navigate to `/`. 3. Read `page.locator('main').innerText()`. | `innerText` of main element does not match `/\bundefined\b/i`. | E2E | Realizing spec: `23-inventory-dashboard.spec.ts` TC-DASH-E2E-002. |

---

## Section 12 — UI: Per-Role Dashboard Access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-120 | Admin | Admin can access / (dashboard page) | P0 | 1. Login as Admin. 2. Navigate to `/`. 3. Assert page content. | Dashboard page renders fully. All 5 stat cards visible. | E2E | Realizing spec: `02-dashboard.spec.ts` (Admin-only via `loginViaAPI`). |
| TC-DASH-121 | Supervisor | Supervisor can access / (dashboard page) | P0 | 1. Login as Supervisor. 2. Navigate to `/`. 3. Assert page content. | Dashboard page renders fully. All 5 stat cards visible. Same layout as Admin. | E2E | Dashboard is role-neutral; no permission gate on the frontend page or backend endpoint. AUTOMATION GAP: specs only test Admin role. |
| TC-DASH-122 | Warehouse Operator | Warehouse Operator can access / (dashboard page) | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/`. 3. Assert page content. | Dashboard page renders fully. All 5 stat cards visible. | E2E | AUTOMATION GAP. |
| TC-DASH-123 | Dispatch Operator | Dispatch Operator can access / (dashboard page) | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/`. 3. Assert page content. | Dashboard page renders fully. All 5 stat cards visible. | E2E | AUTOMATION GAP. |
| TC-DASH-124 | Unauthenticated | Unauthenticated user is redirected from / to /login | P0 | 1. Clear all auth tokens from localStorage. 2. Navigate to `http://localhost:3000/`. | Browser redirects to `/login`. Dashboard content is not displayed. | E2E | Next.js middleware / auth guard. AUTOMATION GAP. |
| TC-DASH-125 | Supervisor | Supervisor sidebar does NOT show "Inventory" nav item | P1 | 1. Login as Supervisor. 2. Navigate to `/`. 3. Inspect the sidebar navigation. | "Inventory" link (`/inventory`) is absent from the sidebar. Supervisor does not hold `inventory:read` permission. | E2E | `constants/index.ts` line 79: `{ label: 'Inventory', requiresPermission: 'inventory:read' }`. Supervisor's seeded permissions do not include `inventory:read`. AUTOMATION GAP. |
| TC-DASH-126 | Dispatch Operator | Dispatch Operator sidebar does NOT show inventory-gated nav items | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/`. 3. Inspect sidebar. | Sidebar is absent for: "Inventory" (inventory:read), "Child Boxes generate" is accessible via quick action but "Child Boxes" nav item is shown because Dispatch Op has `child_boxes:read`. "Samples" (samples:read — not held), "E-commerce" (ecommerce:read — not held), "Unpack & Repack" (packing:unpack — not held), "Reports" (reports:view_all — not held), "Users" (users:read — not held), "Role Manager" (roles:manage — not held), "Customers" (customers:read — not held). | E2E | Sidebar permission filter from `constants/index.ts`. AUTOMATION GAP. |
| TC-DASH-127 | Warehouse Operator | Warehouse Operator sidebar does NOT show dispatch or inventory nav items | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/`. 3. Inspect sidebar. | Sidebar shows: Products, Child Boxes, Master Cartons, Scan & Trace, Unpack & Repack, Settings. Absent: Dispatch, Dispatches, Reports (view_all), Inventory, Samples, E-commerce, Users, Customers, Role Manager. | E2E | Warehouse Op permissions: `products:read`, `child_boxes:create/read`, `cartons:create/read/close`, `packing:pack/unpack`, `reports:view_own`. AUTOMATION GAP. |

---

## Section 13 — UI: Auto-Refresh

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DASH-130 | Admin | KPI cards auto-refresh every 30 seconds | P2 | 1. Login as Admin. 2. Navigate to `/`. 3. Dispatch a master carton. 4. Without page reload, wait ~30 seconds. 5. Observe `todayDispatches` value on dashboard. | `todayDispatches` updates to reflect the new dispatch after ~30s without manual reload. No explicit refresh needed. | E2E | `page.tsx` line 67: `{ refetchInterval: 30000 }` passed to `useApiQuery`. Requires fake timers or real wait. AUTOMATION GAP: `02-dashboard.spec.ts` TC-DASH-013 exists but uses real 30s wait (flaky). |
| TC-DASH-131 | Admin | Query key is stable (no spurious re-fetches on re-render) | P3 | 1. Login as Admin. 2. Navigate to `/`. 3. Monitor network requests to `/inventory/dashboard` over 90 seconds. | Exactly 3 fetches to `/inventory/dashboard` occur within 90 seconds (initial + 2 auto-refreshes at 30s intervals). No extra fetches due to unstable query keys. | E2E | `useApiQuery(['dashboard-stats'], ...)` — stable key `['dashboard-stats']`. AUTOMATION GAP. |

---

## Automation Gap Summary

The following test cases have no realizing Playwright spec and require new spec additions (recommended target: add to `02-dashboard.spec.ts` or create `02b-dashboard-rbac.spec.ts`):

| Gap ID | TC IDs | Recommended spec file | Description |
|---|---|---|---|
| GAP-DASH-01 | TC-DASH-002, TC-DASH-003, TC-DASH-004 | `02-dashboard.spec.ts` | Per-role API access (Supervisor / WH-Op / Dispatch-Op GET /inventory/dashboard). |
| GAP-DASH-02 | TC-DASH-005, TC-DASH-006, TC-DASH-007 | `02-dashboard.spec.ts` | Unauthenticated / expired / malformed token 401 assertions for /inventory/dashboard. |
| GAP-DASH-03 | TC-DASH-015, TC-DASH-016 | `23-inventory-dashboard.spec.ts` | createdCartons and dispatchedCartons correctness after carton lifecycle events. |
| GAP-DASH-04 | TC-DASH-040, TC-DASH-041 | `23-inventory-dashboard.spec.ts` | Full arithmetic invariant: totalChildBoxes = sum of all 6 status counts; totalMasterCartons = sum of 4 carton-status counts. |
| GAP-DASH-05 | TC-DASH-054, TC-DASH-102 | `23-inventory-dashboard.spec.ts` | API returns up to 20 transactions; UI renders at most 10 (the 20-vs-10 discrepancy). |
| GAP-DASH-06 | TC-DASH-073 | `02-dashboard.spec.ts` | Total Child Boxes chip sum intentionally excludes SAMPLE and ECOMMERCE (document behaviour, not a bug). |
| GAP-DASH-07 | TC-DASH-095, TC-DASH-096, TC-DASH-097 | `02-dashboard.spec.ts` | Quick-action cards shown unconditionally to all roles including Dispatch Op / WH-Op who lack the target permissions. |
| GAP-DASH-08 | TC-DASH-121, TC-DASH-122, TC-DASH-123, TC-DASH-124 | `02-dashboard.spec.ts` | Per-role UI dashboard access + unauthenticated redirect. |
| GAP-DASH-09 | TC-DASH-104 | `02-dashboard.spec.ts` | Unknown transaction type falls back to raw `transaction_type` label (7-of-21 types mapped). |
| GAP-DASH-10 | TC-DASH-130 | `02-dashboard.spec.ts` | 30s auto-refresh — use Playwright `page.clock.install()` to fake timers rather than real waits. |
