# Phase 24 — Mobile Master Cartons (List, Pack, Detail)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/master-cartons` list, `/master-cartons/create` (Pack Carton), `/master-cartons/[id]` detail
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 24.1 — Master Cartons list: role-agnostic access](#section-241--master-cartons-list-role-agnostic-access)
- [Section 24.2 — List: card rendering + status badge + ₹ format + dates](#section-242--list-card-rendering--status-badge--₹-format--dates)
- [Section 24.3 — List: search input (300ms debounce + X clear)](#section-243--list-search-input-300ms-debounce--x-clear)
- [Section 24.4 — List: status filter chips (ALL/CREATED/ACTIVE/CLOSED/DISPATCHED)](#section-244--list-status-filter-chips-allcreatedactivecloseddispatched)
- [Section 24.5 — List: infinite scroll + pagination](#section-245--list-infinite-scroll--pagination)
- [Section 24.6 — List: pull-to-refresh + loading + empty state](#section-246--list-pull-to-refresh--loading--empty-state)
- [Section 24.7 — List: Create-carton FAB role gate](#section-247--list-create-carton-fab-role-gate)
- [Section 24.8 — Create screen: role gate](#section-248--create-screen-role-gate)
- [Section 24.9 — Create: capacity stepper](#section-249--create-capacity-stepper)
- [Section 24.10 — Create: scan flow — child-box validation](#section-2410--create-scan-flow--child-box-validation)
- [Section 24.11 — Create: scanned-list rendering + remove](#section-2411--create-scanned-list-rendering--remove)
- [Section 24.12 — Create: submit + mutation + invalidate + navigation](#section-2412--create-submit--mutation--invalidate--navigation)
- [Section 24.13 — Detail: data load + parallel queries + not-found + pull-to-refresh](#section-2413--detail-data-load--parallel-queries--not-found--pull-to-refresh)
- [Section 24.14 — Detail: header card (barcode, status badge, progress bar)](#section-2414--detail-header-card-barcode-status-badge-progress-bar)
- [Section 24.15 — Detail: timeline card](#section-2415--detail-timeline-card)
- [Section 24.16 — Detail: action-bar role gate](#section-2416--detail-action-bar-role-gate)
- [Section 24.17 — Detail: ACTIVE status — Close & Store + Unpack buttons](#section-2417--detail-active-status--close--store--unpack-buttons)
- [Section 24.18 — Detail: CLOSED status — Unpack + Dispatch button matrix](#section-2418--detail-closed-status--unpack--dispatch-button-matrix)
- [Section 24.19 — Detail: CREATED status — Unpack-only](#section-2419--detail-created-status--unpack-only)
- [Section 24.20 — Detail: DISPATCHED status — info text, no actions](#section-2420--detail-dispatched-status--info-text-no-actions)
- [Section 24.21 — Detail: Close & Store confirmation dialog + mutation success](#section-2421--detail-close--store-confirmation-dialog--mutation-success)
- [Section 24.22 — Detail: Unpack confirmation dialog + mutation + cancel](#section-2422--detail-unpack-confirmation-dialog--mutation--cancel)
- [Section 24.23 — Detail: assortment card](#section-2423--detail-assortment-card)
- [Section 24.24 — Detail: child-boxes collapsible](#section-2424--detail-child-boxes-collapsible)
- [Section 24.25 — Negative / edge cases](#section-2425--negative--edge-cases)
- [Maestro flows index](#maestro-flows-index)
- [Open questions / `[?]` flags](#open-questions--flags)

---

## Preconditions

- Mobile app installed from EAS preview build (package `com.basiq360.binnyinventory`).
- Backend reachable at `https://srv1409601.hstgr.cloud/binny/api/v1`.
- All 4 role accounts seeded (see phase-21 Preconditions):
  - Admin: `admin@binny.com` / `Admin@123`
  - Supervisor: `supervisor@binny.com` / `Sup@123`
  - Warehouse Operator: `warehouse@binny.com` / `Wh@123`
  - Dispatch Operator: `dispatch@binny.com` / `Dp@123`
- Maestro CLI installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- App data cleared (`clearState` in Maestro) before each E2E flow unless otherwise stated.

## Test-data fixtures

| Fixture ID | Description | Status | Used in |
|---|---|---|---|
| `MC-CREATED-01` | CREATED carton, `child_count=0`, `max_capacity=12`. Short barcode e.g. `MCAB1234`. | CREATED | 24.1, 24.2, 24.15, 24.16, 24.19, 24.22 |
| `MC-ACTIVE-01` | ACTIVE carton, `child_count=3`, `max_capacity=12`. Multiple articles/colours. | ACTIVE | 24.1, 24.2, 24.4, 24.14, 24.15, 24.16, 24.17, 24.21, 24.22, 24.23, 24.24 |
| `MC-ACTIVE-02` | ACTIVE carton, `child_count=1`, `max_capacity=12`. Single box, single article. | ACTIVE | 24.2, 24.23 |
| `MC-ACTIVE-FULL` | ACTIVE carton at full capacity: `max_capacity=5`, `child_count=5`. | ACTIVE | 24.14 |
| `MC-CLOSED-01` | CLOSED carton, `child_count=4`, `closed_at` set. Multiple articles. | CLOSED | 24.1, 24.2, 24.4, 24.15, 24.16, 24.18, 24.22, 24.23, 24.24 |
| `MC-DISPATCHED-01` | DISPATCHED carton, `closed_at` and `dispatched_at` both set. | DISPATCHED | 24.2, 24.4, 24.15, 24.20 |
| `CB-FREE-01` | FREE child box (short barcode e.g. `CB1A2B3C`). Article name, colour, size, SKU, MRP set. | FREE | 24.10, 24.11, 24.12 |
| `CB-FREE-02` | Second FREE child box. Different article from `CB-FREE-01`. | FREE | 24.10, 24.11, 24.12 |
| `CB-GENERATED-01` | GENERATED child box. Created via generate-stub flow; `status=GENERATED`. | GENERATED | 24.10 |
| `CB-PACKED-01` | PACKED child box (already in a carton). | PACKED | 24.10 |
| `CB-SAMPLE-01` | SAMPLE child box (`status=SAMPLE`). | SAMPLE | 24.10 |
| `CB-ECOMMERCE-01` | ECOMMERCE child box (`status=ECOMMERCE`). | ECOMMERCE | 24.10 |
| `MC-LEGACY-01` | **Skipped** — After the May 5 short-barcode migration, no legacy `BINNY-MC-{uuid}` cartons remain on local or portal DB. This fixture cannot be seeded without modifying the migration. Tests that need a legacy-format carton **must be skipped** and the TC marked `[SKIP-POST-MIGRATION]` in the Notes column. | n/a | 24.2, 24.25 |
| `CB-LEGACY-01` | **Skipped** — Same caveat as `MC-LEGACY-01`. Legacy `BINNY-CB-{uuid}` child boxes no longer exist post-migration. | n/a | 24.10, 24.25 |
| `MC-MANY-BOXES` | ACTIVE or CLOSED carton with ≥6 child boxes (above `CHILD_BOX_COLLAPSE_THRESHOLD=5`). | ACTIVE or CLOSED | 24.24 |
| `MC-FEW-BOXES` | CLOSED carton with exactly 5 child boxes (at threshold — default expanded). | CLOSED | 24.24 |

---

## Section 24.1 — Master Cartons list: role-agnostic access

All 4 roles can view the Master Cartons list. There is no `RoleGate` wrapping the list screen itself — access is controlled only at the FAB and Create screen level. `mobile/app/master-cartons/index.tsx` renders the `FlatList` unconditionally.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-001 | Admin | Admin can access Master Cartons list | P0 | 1. Login as Admin. 2. Navigate to Master Cartons (Menu → Master Cartons). 3. Observe screen. | Title bar shows "Master Cartons". Search bar visible. Status filter chips visible. Carton cards render. No error or "Not authorized". | E2E | `index.tsx:157` — no RoleGate wrapping list |
| TC-MOB-MC-002 | Supervisor | Supervisor can access Master Cartons list | P0 | 1. Login as Supervisor. 2. Navigate to Master Cartons. | Identical list renders. Carton cards visible. No denial. | E2E | All 4 roles in allow list for viewing |
| TC-MOB-MC-003 | Warehouse Operator | Warehouse Operator can access Master Cartons list | P0 | 1. Login as Warehouse Operator. 2. Navigate to Master Cartons. | List renders normally. Carton cards visible. FAB visible (Warehouse Op is in FAB allow list). | E2E | `index.tsx:249` — FAB allow includes Warehouse Operator |
| TC-MOB-MC-004 | Dispatch Operator | Dispatch Operator can access Master Cartons list | P0 | 1. Login as Dispatch Operator. 2. Navigate to Master Cartons. | List renders. Cards visible. **No FAB** (Dispatch Op is not in FAB allow list). No "Not authorized" text on the list itself. | E2E | `index.tsx:249` `RoleGate allow={['Admin','Supervisor','Warehouse Operator']}` — Dispatch Op excluded; no fallback rendered |

### Maestro flows for Section 24.1

```yaml
# mobile/.maestro/master-cartons/mc-list-admin-access.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- assertVisible: "Master Cartons"
- assertNotVisible: "Not authorized"
```

```yaml
# mobile/.maestro/master-cartons/mc-list-dispatch-no-fab.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- assertVisible: "Master Cartons"
- assertNotVisible: "Not authorized"
- assertNotVisible:
    id: "fab-create-carton"
```

---

## Section 24.2 — List: card rendering + status badge + ₹ format + dates

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-005 | Admin | Card Row 1: carton barcode in monospace + status badge | P0 | 1. Login as Admin, navigate to Master Cartons. 2. Observe the first visible card (e.g. `MC-ACTIVE-01`). | `carton_barcode` (e.g. `MCAB1234`) rendered at left with `fontFamily:'monospace'` (Android) or `'Menlo'` (iOS), `fontSize:14`, `fontWeight:'700'`. `<Badge label={status} type="carton" />` rendered at right. | Manual | `index.tsx:96-99`; `barcode` style: `fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'` |
| TC-MOB-MC-006 | Admin | Card Row: article_summary shows when non-null; omitted when null | P0 | 1. Observe a card with `article_summary` set. 2. Observe a card with no `article_summary`. | Non-null: article name line renders below Row 1. Null: line is absent (no empty space). Conditional render `{!!carton.article_summary && ...}`. | Manual | `index.tsx:103-107` |
| TC-MOB-MC-007 | Admin | Card Row: colour · size line shows when either field non-null | P0 | 1. Observe a card where `colour_summary` is non-null and `size_summary` is non-null. 2. Observe a card where both are null. | Both non-null: "BLUE · 6-8" (joined with " · "). Both null: line absent. `[carton.colour_summary, carton.size_summary].filter(Boolean).join(' · ')` — empty string collapses. | Manual | `index.tsx:74-77, 110-114` |
| TC-MOB-MC-008 | Admin | Card Row: "{N} boxes · ₹{mrp}" — MRP formatted to 2 decimal places | P0 | 1. Observe a card with `child_count=3` and `mrp_summary=299`. | Text: "3 boxes · ₹299.00". `Number(carton.mrp_summary).toFixed(2)`. When `mrp_summary` is null, "3 boxes" with no ₹ suffix. | Manual | `index.tsx:117-122`; `mrp_summary != null` conditional |
| TC-MOB-MC-009 | Admin | Card Row: dates line — Created always shown; Closed and Dispatched conditional | P0 | 1. Observe `MC-ACTIVE-01` card (no `closed_at`, no `dispatched_at`). 2. Observe `MC-CLOSED-01` (has `closed_at`). 3. Observe `MC-DISPATCHED-01` (has both). | ACTIVE: "Created DD Mon YYYY". CLOSED: "Created DD Mon YYYY · Closed DD Mon YYYY". DISPATCHED: "Created … · Closed … · Dispatched …". `formatDate` uses `en-IN` locale: `day:'2-digit', month:'short', year:'numeric'`. | Manual | `index.tsx:79-86, 125-127`; `formatDate` at `utils/index.ts:5-9` |
| TC-MOB-MC-010 | Admin | Tapping a card navigates to detail screen `/master-cartons/{id}` | P0 | 1. Tap any carton card. | Navigation: `router.push('/master-cartons/{carton.id}')`. Detail screen title "Carton Details" appears. Barcode in header card matches tapped card. | E2E | `index.tsx:90` |
| TC-MOB-MC-011 | Admin | Short barcode format (`MC[A-Z0-9]{6}`) displayed correctly | P0 | 1. Observe any post-migration carton card. | 8-character barcode (e.g. `MCAB1234`) renders in monospace. No truncation. | Manual | Post-May-5 migration; `parseQRCode` at `utils/index.ts:32-38` |
| TC-MOB-MC-012 | Admin | Legacy barcode format (`BINNY-MC-{uuid}`) displayed if fixture present; [SKIP-POST-MIGRATION] | P2 | 1. Seed `MC-LEGACY-01` fixture manually (pre-migration DB required). 2. Observe card. | Long UUID barcode renders in monospace. `numberOfLines={1}` — truncated if exceeds card width. | Manual | `MC-LEGACY-01` — fixture not available post-migration; skip until test DB restored. `index.tsx:96` |

---

## Section 24.3 — List: search input (300ms debounce + X clear)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-013 | Admin | Search input: placeholder text and attributes | P0 | 1. Navigate to Master Cartons. 2. Observe search bar without tapping. | Placeholder "Search by carton barcode…" in `COLORS.textLight`. `autoCorrect=false`, `autoCapitalize="none"`, `returnKeyType="search"`. | Manual | `index.tsx:172-176` |
| TC-MOB-MC-014 | Admin | Typing fires debounced query after 300ms | P0 | 1. Type "MC" into search. 2. Wait 350ms. 3. Observe network calls. | Only one `GET /master-cartons?search=MC&page=1&limit=20` fires after 300ms idle. Intermediate keystrokes do not fire separate requests. | Integration | `index.tsx:40-45` — `setTimeout(…, 300)` cleared on each change |
| TC-MOB-MC-015 | Admin | Rapid typing fires a single query (debounce cancels intermediates) | P0 | 1. Type "MCAB1234" rapidly (< 300ms per char). 2. Wait 400ms after last char. | Only one query for the final value "MCAB1234" fires. No intermediate queries. | Integration | `index.tsx:40-44` — `clearTimeout` on each `searchInput` change |
| TC-MOB-MC-016 | Admin | Search results filter list; clearing search restores full list | P0 | 1. Type the barcode of `MC-ACTIVE-01`. Wait. 2. Observe list. 3. Tap the X (close-circle) icon. | After typing: only `MC-ACTIVE-01` visible. After X: search clears, full list reloads. X icon visible only when `searchInput.length > 0`. | E2E | `index.tsx:178-185`; X: `<Ionicons name="close-circle" />` |
| TC-MOB-MC-017 | Admin | X button hidden when search is empty | P0 | 1. Navigate to Master Cartons with empty search. 2. Type one char, then delete it. | With empty search: X icon not rendered. With any char: X icon visible. `{searchInput.length > 0 && <TouchableOpacity>...}`. | Manual | `index.tsx:178` |
| TC-MOB-MC-018 | Admin | Search with no results shows empty state (not a crash) | P1 | 1. Type "ZZZNOMATCH9999" in search. Wait 400ms. | Empty state renders: icon `archive-outline`, title "No master cartons", message "Cartons will appear once created." No crash. Query returns 0 items → empty path triggered. | Manual | `index.tsx:222-227` |

### Maestro flows for Section 24.3

```yaml
# mobile/.maestro/master-cartons/mc-search-and-clear.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  BARCODE: "MCAB1234"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- tapOn:
    text: "Search by carton barcode..."
- inputText: "${BARCODE}"
- waitForAnimationToEnd
- assertVisible: "${BARCODE}"
- tapOn:
    id: "close-circle"
- waitForAnimationToEnd
- assertNotVisible: "No master cartons"
```

---

## Section 24.4 — List: status filter chips (ALL/CREATED/ACTIVE/CLOSED/DISPATCHED)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-019 | Admin | All 5 status chips render in order: ALL, CREATED, ACTIVE, CLOSED, DISPATCHED | P0 | 1. Navigate to Master Cartons. 2. Observe chip row (horizontally scrollable). | Chips visible: "ALL" (active, filled primary) → "CREATED" → "ACTIVE" → "CLOSED" → "DISPATCHED". Order matches `STATUS_OPTIONS` array. | Manual | `index.tsx:29` — `STATUS_OPTIONS: ['ALL','CREATED','ACTIVE','CLOSED','DISPATCHED']` |
| TC-MOB-MC-020 | Admin | ALL chip is active by default | P0 | 1. Navigate to Master Cartons without tapping any chip. | "ALL" chip has `backgroundColor: COLORS.primary`, white text. Other chips: bordered, `COLORS.textSecondary` text. `statusFilter` default is `'ALL'`. | Manual | `index.tsx:37` — `useState<StatusFilter>('ALL')` |
| TC-MOB-MC-021 | Admin | Tapping ACTIVE chip filters list to ACTIVE cartons only | P0 | 1. Navigate to Master Cartons. 2. Tap "ACTIVE" chip. 3. Observe list and query. | ACTIVE chip fills with primary color. `GET /master-cartons?status=ACTIVE&page=1&limit=20`. Only ACTIVE-status cards visible. "CREATED", "CLOSED", "DISPATCHED" cards absent. | E2E | `index.tsx:53` — `status: statusFilter === 'ALL' ? undefined : statusFilter` |
| TC-MOB-MC-022 | Admin | Tapping CREATED chip shows only CREATED cartons | P0 | 1. Tap "CREATED" chip. | CREATED chip active. Query: `?status=CREATED`. Only CREATED cartons visible (e.g. `MC-CREATED-01`). | E2E | `index.tsx:53` |
| TC-MOB-MC-023 | Admin | Tapping CLOSED chip shows only CLOSED cartons | P0 | 1. Tap "CLOSED" chip. | CLOSED chip active. Query: `?status=CLOSED`. Only CLOSED cartons (e.g. `MC-CLOSED-01`). | E2E | `index.tsx:53` |
| TC-MOB-MC-024 | Admin | Tapping DISPATCHED chip shows only DISPATCHED cartons | P0 | 1. Tap "DISPATCHED" chip. | DISPATCHED chip active. Query: `?status=DISPATCHED`. Only DISPATCHED cartons (e.g. `MC-DISPATCHED-01`). | E2E | `index.tsx:53` |
| TC-MOB-MC-025 | Admin | Tapping ALL chip after filtering restores full list | P0 | 1. Tap "ACTIVE". 2. Then tap "ALL". | ALL chip re-activates. Status param omitted from query (`undefined`). All statuses show again. | E2E | `index.tsx:53` — `status: undefined` when ALL |
| TC-MOB-MC-026 | Admin | Status chip + search can be combined | P1 | 1. Tap "ACTIVE" chip. 2. Type a barcode fragment in search. | Query: `?status=ACTIVE&search=<term>`. Only ACTIVE cartons matching the barcode search term are shown. | Integration | `index.tsx:47-58` — both params in `queryKey` and `queryFn` |

### Maestro flows for Section 24.4

```yaml
# mobile/.maestro/master-cartons/mc-status-filter.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- assertVisible: "ALL"
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- assertNotVisible: "CREATED"
- tapOn: "ALL"
- waitForAnimationToEnd
```

---

## Section 24.5 — List: infinite scroll + pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-027 | Admin | First page loads PAGE_SIZE=20 cartons; footer spinner appears on scroll | P0 | 1. Ensure >20 master cartons exist. 2. Navigate to Master Cartons. 3. Scroll to list bottom. | First 20 cards load. Scrolling past 40% threshold triggers `fetchNextPage()`. Footer `<Spinner size="small" />` appears inside `<View style={styles.footer}>` during fetch. Page 2 appends. | E2E | `index.tsx:30,235` — `PAGE_SIZE=20`, `onEndReachedThreshold=0.4` |
| TC-MOB-MC-028 | Admin | "End of list" footer appears after last page | P0 | 1. Scroll to end of all cartons (< 20 total or after last page). | Footer shows `<Text style={styles.footerText}>End of list</Text>` when `!query.hasNextPage && items.length > 0`. Spinner not shown. | Manual | `index.tsx:143-148` |
| TC-MOB-MC-029 | Admin | No footer when list is empty | P0 | 1. Apply a filter that returns 0 results. 2. Observe below the empty state. | No footer rendered. `ListFooter` returns `null` when `items.length === 0`. | Manual | `index.tsx:150` — `return null` branch |
| TC-MOB-MC-030 | Admin | Fetching next page does not re-render existing cards | P1 | 1. Note first card barcode. 2. Trigger `fetchNextPage` by scrolling. 3. Re-observe first card after page 2 loads. | First card remains at top, unchanged. `FlatList` appends new data. `keyExtractor={(item) => item.id}` prevents duplicate keys. | Manual | `index.tsx:231` |

---

## Section 24.6 — List: pull-to-refresh + loading + empty state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-031 | Admin | Initial loading spinner shown while first query is in-flight | P0 | 1. Clear app cache. 2. Navigate to Master Cartons. 3. Observe before data arrives. | Full-screen `<Spinner />` rendered inside `<View style={styles.centered}>`. `query.isLoading && items.length === 0` is true. | Manual | `index.tsx:218-221` |
| TC-MOB-MC-032 | Admin | Pull-to-refresh triggers refetch and shows native spinner | P0 | 1. Navigate to Master Cartons. 2. Pull down from top of list. | Native `RefreshControl` spinner appears. `query.refetch()` called. `refreshing={query.isRefetching && !query.isFetchingNextPage}`. List updates after refetch completes. | E2E | `index.tsx:237-244` |
| TC-MOB-MC-033 | Admin | Empty state when no cartons exist | P0 | 1. Apply CREATED filter on a DB with no CREATED cartons. | `EmptyState` renders: `icon="archive-outline"`, title "No master cartons", message "Cartons will appear once created.". No list. No footer. | Manual | `index.tsx:223-227` |
| TC-MOB-MC-034 | Admin | Network failure on initial load falls through to empty state (no crash) | P1 | 1. Disable network. 2. Navigate to Master Cartons. 3. Wait. | Spinner briefly visible while query is loading. After query fails: `isLoading=false`, `items.length=0` → empty state renders. No dedicated error state or crash. | Manual | `index.tsx:218-227` — no explicit error branch |

---

## Section 24.7 — List: Create-carton FAB role gate

FAB is wrapped in `<RoleGate allow={['Admin','Supervisor','Warehouse Operator']}>` with **no fallback** prop — so Dispatch Operator sees nothing where the FAB would be. `mobile/app/master-cartons/index.tsx:249-257`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-035 | Admin | Admin sees FAB (+) on Master Cartons list | P0 | 1. Login as Admin. 2. Navigate to Master Cartons. | Circular `+` FAB visible at `bottom:24, right:20`. `backgroundColor: COLORS.primary`. Tapping navigates to `/master-cartons/create`. | E2E | `index.tsx:248-257`; `styles.fab: position:'absolute', bottom:24, right:20, width:56, height:56, borderRadius:28` |
| TC-MOB-MC-036 | Supervisor | Supervisor sees FAB (+) on Master Cartons list | P0 | 1. Login as Supervisor. 2. Navigate to Master Cartons. | FAB visible. Tapping navigates to create screen. | E2E | `index.tsx:249` allow list includes Supervisor |
| TC-MOB-MC-037 | Warehouse Operator | Warehouse Operator sees FAB (+) on Master Cartons list | P0 | 1. Login as Warehouse Operator. 2. Navigate to Master Cartons. | FAB visible. Tapping navigates to create screen (not DeniedView — create screen has its own RoleGate). | E2E | `index.tsx:249` allow list includes Warehouse Operator |
| TC-MOB-MC-038 | Dispatch Operator | Dispatch Operator does NOT see FAB on Master Cartons list | P0 | 1. Login as Dispatch Operator. 2. Navigate to Master Cartons. | No `+` FAB visible at bottom-right. No fallback element in its place. `RoleGate` returns `null` (default fallback). | E2E | `index.tsx:249` — Dispatch Op absent from allow list; `fallback` not provided → `null` rendered per `RoleGate.tsx:16` |

### Maestro flows for Section 24.7

```yaml
# mobile/.maestro/master-cartons/mc-fab-dispatch-denied.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- assertVisible: "Master Cartons"
- assertNotVisible: "Pack Carton"
```

---

## Section 24.8 — Create screen: role gate

The `MasterCartonsCreateScreen` export wraps `PackCartonScreen` in `<RoleGate allow={['Admin','Supervisor','Warehouse Operator']} fallback={<DeniedView />}>`. `mobile/app/master-cartons/create.tsx:272-281`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-039 | Admin | Admin can access Pack Carton screen | P0 | 1. Login as Admin. 2. Navigate to Master Cartons. 3. Tap FAB. | "Pack Carton" title (Stack.Screen). Capacity stepper visible. "Scan Child Box" button visible. "Create Carton" button visible (disabled). | E2E | `create.tsx:152` — title "Pack Carton" |
| TC-MOB-MC-040 | Supervisor | Supervisor can access Pack Carton screen | P0 | 1. Login as Supervisor. 2. Tap FAB on list. | Pack Carton screen renders. All controls accessible. | E2E | `create.tsx:275` allow list |
| TC-MOB-MC-041 | Warehouse Operator | Warehouse Operator can access Pack Carton screen | P0 | 1. Login as Warehouse Operator. 2. Tap FAB on list. | Pack Carton screen renders. Not denied. | E2E | `create.tsx:275` allow list |
| TC-MOB-MC-042 | Dispatch Operator | Dispatch Operator sees DeniedView on Pack Carton screen | P0 | 1. Login as Dispatch Operator. 2. Deep-link or navigate directly to `/master-cartons/create`. | `DeniedView` renders: `EmptyState icon="lock-closed-outline"`, title "Not authorized", message "You don't have permission to pack cartons." No stepper. No scan button. | E2E | `create.tsx:31-41, 272-281` |

---

## Section 24.9 — Create: capacity stepper

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-043 | Admin | Capacity defaults to 12 on screen open | P0 | 1. Navigate to Pack Carton. 2. Observe capacity display before any interaction. | TextInput shows "12". `maxCapacity` state = 12. `capacityText` state = "12". Counter reads "0 of 12 scanned". | Manual | `create.tsx:48,52` — `useState(12)` and `useState('12')` |
| TC-MOB-MC-044 | Admin | (+) button increments capacity by 1 | P0 | 1. Tap "+" button. 2. Observe. | Capacity increases from 12 to 13. TextInput shows "13". Counter reads "0 of 13 scanned". Progress bar ratio: 0/13. | Manual | `create.tsx:78-82` — `adjustCapacity(1)`: `Math.min(99, Math.max(minCapacity, 12+1))` |
| TC-MOB-MC-045 | Admin | (–) button decrements capacity by 1 | P0 | 1. Tap "–" button. 2. Observe. | Capacity decreases from 12 to 11. TextInput shows "11". | Manual | `create.tsx:78-82` — `adjustCapacity(-1)` |
| TC-MOB-MC-046 | Admin | Capacity upper-clamp: (+) cannot exceed 99 | P0 | 1. Manually type "99" in capacity input. Blur. 2. Tap "+". | Capacity stays at 99. `Math.min(99, 99+1) = 99`. No value above 99 accepted. | Manual | `create.tsx:79` — `Math.min(99, ...)` |
| TC-MOB-MC-047 | Admin | Capacity lower-clamp: (–) cannot go below 1 when no boxes scanned | P0 | 1. Tap "–" repeatedly until capacity would go below 1. | Capacity clamps to 1 (`minCapacity = Math.max(1, scanned.length) = Math.max(1, 0) = 1`). "–" button does not reduce to 0. | Manual | `create.tsx:76,79` — `minCapacity = Math.max(1, 0)` |
| TC-MOB-MC-048 | Admin | Typed input: entering "5" then blurring sets capacity to 5 | P0 | 1. Tap capacity TextInput. 2. Clear it, type "5". 3. Blur (tap elsewhere or press done). | `handleCapacityBlur`: `parseInt('5', 10) = 5`; `Math.min(99, Math.max(1, 5)) = 5`. Capacity = 5. Counter "0 of 5 scanned". | Manual | `create.tsx:84-93` |
| TC-MOB-MC-049 | Admin | Typed NaN (e.g. blank) on blur resets to minCapacity | P0 | 1. Clear capacity TextInput (empty string). 2. Blur. | `parseInt('', 10) = NaN` → `isNaN` branch → `setMaxCapacity(minCapacity)` and `setCapacityText(String(minCapacity))`. If no boxes scanned: reverts to "1". | Manual | `create.tsx:86-88` |
| TC-MOB-MC-050 | Admin | minCapacity = max(1, scanned.length): capacity cannot go below boxes-already-scanned | P0 | 1. Scan 3 child boxes. Capacity is currently 12. 2. Type "2" in capacity input. 3. Blur. | `minCapacity = Math.max(1, 3) = 3`. `parseInt('2')=2 < 3` → clamped to 3. TextInput shows "3". Cannot remove boxes from the carton by lowering capacity. | Manual | `create.tsx:76,90` — `Math.max(minCapacity, parsed)` |
| TC-MOB-MC-051 | Admin | Capacity stepper keyboard: `number-pad` type (no alpha keys visible) | P0 | 1. Tap capacity input. 2. Observe keyboard. | Numeric-only keypad appears (`keyboardType="number-pad"`). No letter keys visible on Android/iOS. | Manual | `create.tsx:168` — `keyboardType="number-pad"` |

---

## Section 24.10 — Create: scan flow — child-box validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-052 | Admin | "Scan Child Box" button opens BarcodeScanner modal | P0 | 1. Navigate to Pack Carton. 2. Tap "Scan Child Box". | `BarcodeScanner` modal opens with `expectedType="child"` and `title="Scan Child Box"`. `scannerOpen` state = true. | Manual | `create.tsx:259-265` |
| TC-MOB-MC-053 | Admin | Scanning a valid short-format FREE child box (`CB[A-Z0-9]{6}`) accepts it | P0 | 1. Scan `CB-FREE-01` (short format, e.g. `CB1A2B3C`). | `parseQRCode('CB1A2B3C')` → `{type:'child', id:'CB1A2B3C'}`. `childBoxService.getByBarcode('CB1A2B3C')` → box with `status='FREE'`. Box added to scanned list. Haptic success fires. Counter increments. | E2E | `create.tsx:99-100,118,125-126`; `utils/index.ts:33-35` |
| TC-MOB-MC-054 | Admin | Scanning a valid GENERATED child box is accepted | P0 | 1. Scan `CB-GENERATED-01` (status=GENERATED). | `box.status === 'GENERATED'` → passes the `FREE/GENERATED` check. Box added. Haptic fires. | E2E | `create.tsx:118` — `box.status !== 'FREE' && box.status !== 'GENERATED'` → only rejects if both conditions fail |
| TC-MOB-MC-055 | Admin | Scanning a legacy-format FREE child box is accepted; [SKIP-POST-MIGRATION] | P1 | 1. Scan `CB-LEGACY-01` (format `BINNY-CB-{uuid}`). | `parseQRCode` long-match branch: `{type:'child', id:'BINNY-CB-...'}`. `childBoxService.getByBarcode('BINNY-CB-...')` → box. Accepted if FREE/GENERATED. | Manual | `CB-LEGACY-01` fixture not available post-migration; skip. `utils/index.ts:42-48` |
| TC-MOB-MC-056 | Admin | Scanning an already-scanned box shows "Already scanned" alert | P0 | 1. Scan `CB-FREE-01`. 2. Scan `CB-FREE-01` again. | Alert title "Already scanned", message "`CB1A2B3C` is already in the list." Box not added twice. `scanned.some((b) => b.barcode === code)` is true. | Manual | `create.tsx:102-104` |
| TC-MOB-MC-057 | Admin | Scanning when capacity is reached shows "Capacity reached" alert | P0 | 1. Set capacity to 1. 2. Scan one box (fills capacity). 3. Scan another box. | Alert "Capacity reached", message "Carton capacity is 1. Increase it or create the carton first." Box not added. `scanned.length >= maxCapacity` → early return. | Manual | `create.tsx:107-112` |
| TC-MOB-MC-058 | Admin | "Scan Child Box" button disabled when at capacity | P0 | 1. Set capacity to 1. 2. Scan one box. | "Scan Child Box" button is disabled (`disabled={scanned.length >= maxCapacity || validating}`). Title still "Scan Child Box" (not "Validating…"). Tap does nothing. | Manual | `create.tsx:200` |
| TC-MOB-MC-059 | Admin | Scanning a PACKED box shows "Box not available" alert | P0 | 1. Scan `CB-PACKED-01` (status=PACKED). | `box.status !== 'FREE' && box.status !== 'GENERATED'` → Alert "Box not available", "This box is PACKED. Only FREE or GENERATED boxes can be packed." | Manual | `create.tsx:118-123` |
| TC-MOB-MC-060 | Admin | Scanning a SAMPLE box shows "Box not available" alert | P0 | 1. Scan `CB-SAMPLE-01` (status=SAMPLE). | Alert "Box not available", "This box is SAMPLE. Only FREE or GENERATED boxes can be packed." | Manual | `create.tsx:118-123` |
| TC-MOB-MC-061 | Admin | Scanning an ECOMMERCE box shows "Box not available" alert | P0 | 1. Scan `CB-ECOMMERCE-01` (status=ECOMMERCE). | Alert "Box not available", "This box is ECOMMERCE. Only FREE or GENERATED boxes can be packed." | Manual | `create.tsx:118-123` |
| TC-MOB-MC-062 | Admin | Scanning an unknown barcode shows "Scan failed" with API or fallback message | P0 | 1. Scan a random barcode not in DB (e.g. `CBZZZZZZ`). | `childBoxService.getByBarcode('CBZZZZZZ')` → 404 API error. Alert "Scan failed" with `err.response.data.message` (e.g. "Child box not found") or `err.message`. | Manual | `create.tsx:127-129` |
| TC-MOB-MC-063 | Admin | Scanning a master-carton barcode (type='master') in child slot uses raw barcode as code | P0 | 1. Scan a master-carton QR (e.g. `MCAB1234`) in the Scan Child Box modal. | `parseQRCode('MCAB1234')` → `{type:'master', id:'MCAB1234'}`. Since `type !== 'child'`, `code = barcode.trim().toUpperCase() = 'MCAB1234'`. `childBoxService.getByBarcode('MCAB1234')` → 404. Alert "Scan failed". | Manual | `create.tsx:99-100` — fallback to raw barcode when type ≠ 'child' |
| TC-MOB-MC-064 | Admin | "Validating…" label shown on scan button during API call | P0 | 1. Scan a child box. Observe button text while API call is in-flight. | Button title changes to "Validating…" (`validating=true`). Button disabled. Returns to "Scan Child Box" after API completes. | Manual | `create.tsx:196-201` — `validating ? 'Validating…' : 'Scan Child Box'` |
| TC-MOB-MC-065 | Admin | Successful scan fires Haptics.notificationAsync(Success) | P0 | 1. Scan a valid FREE box. | Device vibrates with success haptic pattern. `Haptics.NotificationFeedbackType.Success`. No failure haptic. | Manual | `create.tsx:126` — `await Haptics.notificationAsync(NotificationFeedbackType.Success)` |

---

## Section 24.11 — Create: scanned-list rendering + remove

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-066 | Admin | Empty scanned list shows "No boxes scanned yet" empty state | P0 | 1. Navigate to Pack Carton. 2. Do not scan. 3. Observe list card. | `EmptyState` inside card: `icon="cube-outline"`, title "No boxes scanned yet", message "Tap Scan Child Box to begin." | Manual | `create.tsx:206-210` |
| TC-MOB-MC-067 | Admin | Scanned box row shows barcode (monospace), article · colour · size, SKU · ₹MRP | P0 | 1. Scan `CB-FREE-01`. 2. Observe its row in the scanned list. | Row: Line 1: `box.barcode` in monospace, `fontWeight:'700'`. Line 2: `{article_name} · {colour} · {size}` in `COLORS.textSecondary`. Line 3: `{sku} · ₹{mrp.toFixed(2)}` in `COLORS.textLight`. Trash icon at right. | Manual | `create.tsx:220-235` |
| TC-MOB-MC-068 | Admin | Tapping trash icon removes box from scanned list | P0 | 1. Scan `CB-FREE-01` and `CB-FREE-02`. 2. Tap trash icon on `CB-FREE-01`. | `CB-FREE-01` removed from `scanned` array. Only `CB-FREE-02` remains. Counter decrements: "1 of 12 scanned". Progress bar updates. `handleRemove(barcode)` filters by barcode. | E2E | `create.tsx:137-139` |
| TC-MOB-MC-069 | Admin | Removing a box re-enables Scan button if at capacity | P0 | 1. Set capacity=1. Scan one box (fills capacity → scan button disabled). 2. Remove box via trash. | Scan button re-enables. `disabled={scanned.length >= maxCapacity}` becomes false. | Manual | `create.tsx:200` — reactive to `scanned.length` |
| TC-MOB-MC-070 | Admin | Counter "{N} of {Y} scanned" updates in real-time | P0 | 1. Scan `CB-FREE-01` (counter "1 of 12"). 2. Scan `CB-FREE-02` (counter "2 of 12"). 3. Remove one (counter "1 of 12"). | Counter text changes immediately on each scan/remove. `{scanned.length} of {maxCapacity} scanned`. | Manual | `create.tsx:187-189` |
| TC-MOB-MC-071 | Admin | Progress bar updates proportionally to scanned/capacity | P0 | 1. With capacity=10, scan 5 boxes. 2. Observe progress bar fill. | Bar fills 50% of width. `progressRatio = scanned.length / maxCapacity = 5/10 = 0.5`. `width: '50%'`. Capped at 1 (`Math.min(..., 1)`). | Manual | `create.tsx:143` |
| TC-MOB-MC-072 | Admin | Multiple scanned boxes show dividers between rows | P0 | 1. Scan at least 2 boxes. 2. Observe rows in the list card. | Border line rendered between rows. `style={[styles.boxRow, idx < scanned.length - 1 && styles.boxRowBorder]}`. Last row has no bottom border. | Manual | `create.tsx:215-218`; `boxRowBorder: { borderBottomWidth:1, borderBottomColor: COLORS.borderLight }` |

---

## Section 24.12 — Create: submit + mutation + invalidate + navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-073 | Admin | "Create Carton" button disabled when scanned list is empty | P0 | 1. Navigate to Pack Carton. 2. Do not scan any box. 3. Observe button. | Button label "Create Carton" (no count suffix). `disabled={scanned.length === 0 || createMutation.isPending}` → disabled. | Manual | `create.tsx:243,252` |
| TC-MOB-MC-074 | Admin | "Create Carton (N)" button shows count when boxes scanned | P0 | 1. Scan 3 boxes. 2. Observe button. | Button label "Create Carton (3)". Enabled. `scanned.length > 0`. | Manual | `create.tsx:243` — `` `Create Carton${scanned.length > 0 ? ` (${scanned.length})` : ''}` `` |
| TC-MOB-MC-075 | Admin | Submit button shows loading spinner during mutation | P0 | 1. Scan 1 box. 2. Tap "Create Carton (1)". 3. Observe immediately. | Button shows loading state (`loading={createMutation.isPending}`). Button disabled. Title still rendered. API call `POST /master-cartons` in-flight. | Manual | `create.tsx:253` |
| TC-MOB-MC-076 | Admin | Successful create posts correct payload to API | P0 | 1. Set capacity to 5. Scan `CB-FREE-01`. 2. Tap "Create Carton (1)". | `POST /master-cartons` body: `{ max_capacity: 5, child_box_barcodes: ['CB1A2B3C'] }`. Response: `{id, carton_barcode, status:'ACTIVE', child_count:1, ...}`. | Integration | `create.tsx:244-248` — `{ max_capacity: maxCapacity, child_box_barcodes: scanned.map(b => b.barcode) }` |
| TC-MOB-MC-077 | Admin | On success: navigates to detail screen via `router.replace` | P0 | 1. Create a carton. | After success: `router.replace('/master-cartons/{carton.id}')`. User lands on detail screen. Back stack entry is replaced (can't go back to create screen). | E2E | `create.tsx:69` — `router.replace(`/master-cartons/${carton.id}`)` |
| TC-MOB-MC-078 | Admin | On success: success haptic fires | P0 | 1. Create a carton successfully. | `Haptics.notificationAsync(NotificationFeedbackType.Success)` fires. Device vibrates. | Manual | `create.tsx:68` |
| TC-MOB-MC-079 | Admin | On success: correct query keys invalidated | P0 | 1. Create a carton. 2. Navigate back to list; inspect network. | React Query invalidates: `['masterCartons']`, `['childBoxes']`, `['inventory-summary']`, `['inventory-hierarchy']`, `['dashboard-stats']`. All affected views refetch. | Integration | `create.tsx:60-66` |
| TC-MOB-MC-080 | Admin | API error on create shows toast or alert (not a crash) | P1 | 1. Scan 1 box. 2. Cause API failure (disable network or corrupt payload). 3. Tap "Create Carton". | Error toast or alert renders with API error message. Screen does not crash. `createMutation.isPending` resets. User can retry. | Manual | `useApiMutation` error path; `create.tsx:56-72` |

### Maestro flows for Section 24.12

```yaml
# mobile/.maestro/master-cartons/mc-pack-happy-path.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  FREE_BOX_BARCODE: "CB1A2B3C"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Master Cartons"
- waitForAnimationToEnd
- tapOn:
    id: "fab-create-carton"
- waitForAnimationToEnd
- assertVisible: "Pack Carton"
- assertVisible: "0 of 12 scanned"
- tapOn: "Scan Child Box"
- waitForAnimationToEnd
- inputText: "${FREE_BOX_BARCODE}"
- waitForAnimationToEnd
- assertVisible: "1 of 12 scanned"
- tapOn: "Create Carton (1)"
- waitForAnimationToEnd
- assertVisible: "Carton Details"
```

---

## Section 24.13 — Detail: data load + parallel queries + not-found + pull-to-refresh

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-081 | Admin | Detail screen issues two parallel queries on mount | P0 | 1. Tap a carton card from list. 2. Observe network calls. | `useApiQuery(['masterCarton', id])` → `GET /master-cartons/{id}` and `useApiQuery(['masterCarton-assortment', id])` → `GET /master-cartons/{id}/assortment` fire in parallel (`enabled: !!id`). | Integration | `[id].tsx:95-105` |
| TC-MOB-MC-082 | Admin | Loading spinner shown while carton query is in-flight | P0 | 1. Navigate to detail screen. 2. Observe before data arrives. | Full-screen `<Spinner />` inside `<View style={styles.centeredContainer}>`. `cartonQ.isLoading && !carton` condition. Title bar: "Carton Details". | Manual | `[id].tsx:183-192` |
| TC-MOB-MC-083 | Admin | Not-found state for invalid carton ID | P0 | 1. Navigate to `/master-cartons/nonexistent-uuid-9999`. | `cartonQ.isLoading=false`, `carton=undefined` → `EmptyState`: `icon="archive-outline"`, title "Carton not found", message "This carton may have been removed." | Manual | `[id].tsx:194-207` |
| TC-MOB-MC-084 | Admin | Pull-to-refresh refetches both queries | P0 | 1. Open a carton detail. 2. Pull down from top. | Native `RefreshControl` spinner shows. `onRefresh` calls `Promise.all([cartonQ.refetch(), assortmentQ.refetch()])`. Both queries fire in parallel. `refreshing` state set and cleared. | Manual | `[id].tsx:117-121` |
| TC-MOB-MC-085 | Dispatch Operator | Dispatch Operator can open and view a carton detail | P0 | 1. Login as Dispatch Operator. 2. Navigate to Master Cartons → tap a card. | Detail screen renders. Header, timeline, assortment cards all visible. Action bar is hidden (covered in 24.16). No crash or denial. | E2E | `[id].tsx` — no RoleGate on the detail screen itself |

---

## Section 24.14 — Detail: header card (barcode, status badge, progress bar)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-086 | Admin | Header card: barcode in monospace, fontSize 18, fontWeight 700 | P0 | 1. Open detail for `MC-ACTIVE-01`. | `carton_barcode` renders with `fontSize:18`, `fontWeight:'700'`, `fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'`. | Manual | `[id].tsx:234-237`; `styles.barcodeText: fontSize:18, fontWeight:'700'` |
| TC-MOB-MC-087 | Admin | Header card: status badge rendered with `type="carton"` | P0 | 1. Observe badge in header for ACTIVE carton. | `<Badge label="ACTIVE" type="carton" />` at right of header row. Badge color/label correct per `Badge` component logic. | Manual | `[id].tsx:237` |
| TC-MOB-MC-088 | Admin | Header card: "{child_count} / {max_capacity} boxes" text | P0 | 1. Open `MC-ACTIVE-01` (`child_count=3`, `max_capacity=12`). | Text "3 / 12 boxes" visible below barcode. `fontSize:14`, `COLORS.textSecondary`. | Manual | `[id].tsx:240-242`; `styles.capacityText` |
| TC-MOB-MC-089 | Admin | Progress bar fill = child_count / max_capacity (capped at 100%) | P0 | 1. Open `MC-ACTIVE-FULL` (`child_count=5`, `max_capacity=5`). 2. Also open `MC-ACTIVE-01` (`child_count=3`, `max_capacity=12`). | FULL: bar at 100%. ACTIVE-01: bar at 25%. `Math.min(progressFill * 100, 100)`. Progress bar `backgroundColor: COLORS.primary`. | Manual | `[id].tsx:212, 247-250`; `progressFill = child_count / max_capacity` |
| TC-MOB-MC-090 | Admin | Header card: zero max_capacity guard (progressFill = 0) | P1 | 1. View a carton with `max_capacity=0` if seeded, or CREATED carton where `child_count=0`. | Progress bar at 0% (or no division by zero crash). `progressFill = c.max_capacity > 0 ? c.child_count / c.max_capacity : 0`. | Manual | `[id].tsx:212` — explicit zero guard |

---

## Section 24.15 — Detail: timeline card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-091 | Admin | Timeline "Created" row always present | P0 | 1. Open any carton detail. | "Created" label at left, formatted date at right (`formatDate(c.created_at)`). Always rendered. `TimelineRow` sub-component. | Manual | `[id].tsx:257` — unconditional |
| TC-MOB-MC-092 | Admin | Timeline "Closed" row appears only when `closed_at` non-null | P0 | 1. Open `MC-CLOSED-01` (has `closed_at`). 2. Open `MC-ACTIVE-01` (no `closed_at`). | CLOSED: "Closed" row visible with formatted date. ACTIVE: "Closed" row absent. `{!!c.closed_at && <TimelineRow .../>}`. | Manual | `[id].tsx:258-260` |
| TC-MOB-MC-093 | Admin | Timeline "Dispatched" row appears only when `dispatched_at` non-null | P0 | 1. Open `MC-DISPATCHED-01`. 2. Open `MC-CLOSED-01`. | DISPATCHED: "Dispatched" row visible. CLOSED (not dispatched): row absent. | Manual | `[id].tsx:261-263` |
| TC-MOB-MC-094 | Admin | Timeline "Creator" row appears only when `creator` field non-null | P0 | 1. Open a carton with creator metadata. 2. Open a carton without. | With creator: "Creator" label + `c.creator.name` (or "—" if name is null). Without creator: row absent. | Manual | `[id].tsx:264-266` — `{!!c.creator && <TimelineRow label="Creator" value={c.creator.name ?? '—'} />}` |
| TC-MOB-MC-095 | Admin | Timeline row layout: label left, value right, hairline border below each row | P0 | 1. Open detail and observe timeline card. | Each `TimelineRow`: `flexDirection:'row'`, `justifyContent:'space-between'`. Bottom hairline `StyleSheet.hairlineWidth`, `COLORS.borderLight`. Label `color:COLORS.textSecondary`. Value `fontWeight:'600'`, `textAlign:'right'`. | Manual | `[id].tsx:43-49`; `styles.timelineRow` |

---

## Section 24.16 — Detail: action-bar role gate

The action bar (containing Close & Store, Unpack, Dispatch buttons) is wrapped in `<RoleGate allow={['Admin','Supervisor','Warehouse Operator']}>` at `[id].tsx:275`. This gate is entered only when `status !== 'DISPATCHED'`. Dispatch Operator cannot see the action bar at all — including the Dispatch button, despite `canDispatch=true` for them. See `[?]` #13.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-096 | Admin | Admin sees action bar on ACTIVE carton | P0 | 1. Login as Admin. 2. Open `MC-ACTIVE-01` (status ACTIVE). | Action bar visible. "Close & Store" (primary) and "Unpack" (outline) buttons both shown. | E2E | `[id].tsx:275-365`; RoleGate passes for Admin |
| TC-MOB-MC-097 | Supervisor | Supervisor sees action bar on ACTIVE carton | P0 | 1. Login as Supervisor. 2. Open `MC-ACTIVE-01`. | Same action bar as Admin (24.16 TC-MOB-MC-096). | E2E | Supervisor in RoleGate allow list |
| TC-MOB-MC-098 | Warehouse Operator | Warehouse Operator sees action bar on ACTIVE carton | P0 | 1. Login as Warehouse Operator. 2. Open `MC-ACTIVE-01`. | Action bar visible. "Close & Store" and "Unpack" buttons present (Dispatch button hidden for CLOSED status since `canDispatch=false` for Warehouse Op). | E2E | `[id].tsx:275` — Warehouse Op in allow list; `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])` → false for Warehouse Op (`[id].tsx:92`) |
| TC-MOB-MC-099 | Dispatch Operator | Dispatch Operator sees NO action bar on any non-DISPATCHED carton | P0 | 1. Login as Dispatch Operator. 2. Open `MC-ACTIVE-01`. 3. Open `MC-CLOSED-01`. 4. Open `MC-CREATED-01`. | On all three: no action bar, no buttons of any kind. `RoleGate` excludes Dispatch Op → renders nothing (no fallback defined). Note: Dispatch Op has `canDispatch=true` but never sees the bar containing the Dispatch button. See `[?]` #13. | E2E | `[id].tsx:275` — Dispatch Op not in allow list; `RoleGate.tsx:16` → `fallback=null` |

---

## Section 24.17 — Detail: ACTIVE status — Close & Store + Unpack buttons

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-100 | Admin | ACTIVE carton: "Close & Store" (primary) button visible | P0 | 1. Open `MC-ACTIVE-01`. | "Close & Store" button: `variant="primary"`, `fullWidth`, icon `checkmark-circle-outline`. Button is enabled initially. | Manual | `[id].tsx:279-293` |
| TC-MOB-MC-101 | Admin | ACTIVE carton: "Unpack" (outline) button visible | P0 | 1. Open `MC-ACTIVE-01`. | "Unpack" button: `variant="outline"`, `fullWidth`, icon `open-outline`. Rendered below "Close & Store". | Manual | `[id].tsx:295-309` |
| TC-MOB-MC-102 | Admin | ACTIVE carton: both buttons disabled while close mutation is pending | P0 | 1. Tap "Close & Store" → confirm. 2. Observe both buttons while mutation is in-flight. | Both "Close & Store" (`loading=true`) and "Unpack" (`disabled=closeMutation.isPending`) are disabled. Prevents double-action. | Manual | `[id].tsx:291-292,306-308` — `disabled={closeMutation.isPending \|\| unpackMutation.isPending}` |
| TC-MOB-MC-103 | Admin | ACTIVE carton: both buttons disabled while unpack mutation is pending | P0 | 1. Tap "Unpack" → confirm. 2. Observe both buttons. | "Unpack" shows loading (`loading=unpackMutation.isPending`). "Close & Store" is disabled. Prevents race. | Manual | `[id].tsx:291-292,307` |
| TC-MOB-MC-104 | Warehouse Operator | Warehouse Operator can tap "Close & Store" on ACTIVE carton (API permitting) | P1 | 1. Login as Warehouse Op. 2. Open `MC-ACTIVE-01`. 3. Confirm "Close & Store". | Button visible and tappable for Warehouse Op. API call succeeds or returns 403 depending on backend role gate. Mobile RoleGate passes; backend may restrict. | Integration | [?] cross-reference with phase-23 TC-MOB-STR-017 |

---

## Section 24.18 — Detail: CLOSED status — Unpack + Dispatch button matrix

For CLOSED status, the visible-button matrix depends on two gates:
- **Outer gate**: `RoleGate allow={['Admin','Supervisor','Warehouse Operator']}` — Dispatch Op sees nothing.
- **Inner `canDispatch` check**: `useHasRole(['Admin','Supervisor','Dispatch Operator'])` — Warehouse Op is false; Dispatch Op is true but outer gate blocks them.

Net result: Admin and Supervisor see both "Unpack" + "Dispatch". Warehouse Op sees "Unpack" only. Dispatch Op sees nothing.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-105 | Admin | Admin sees "Unpack" + "Dispatch" on CLOSED carton | P0 | 1. Login as Admin. 2. Open `MC-CLOSED-01`. | Both "Unpack" (outline) and "Dispatch" (outline) buttons visible. `canDispatch=true` for Admin. Both `fullWidth`. | E2E | `[id].tsx:312-344`; `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])` → true |
| TC-MOB-MC-106 | Supervisor | Supervisor sees "Unpack" + "Dispatch" on CLOSED carton | P0 | 1. Login as Supervisor. 2. Open `MC-CLOSED-01`. | Same two buttons as Admin. Supervisor is in both RoleGate allow and `canDispatch` list. | E2E | `[id].tsx:92` — Supervisor in `useHasRole` list |
| TC-MOB-MC-107 | Warehouse Operator | Warehouse Operator sees "Unpack" only on CLOSED carton (no Dispatch button) | P0 | 1. Login as Warehouse Op. 2. Open `MC-CLOSED-01`. | "Unpack" button visible. "Dispatch" button absent. `canDispatch=false` for Warehouse Op (not in `['Admin','Supervisor','Dispatch Operator']`). Outer RoleGate passes so bar renders; inner `{canDispatch && <Button title="Dispatch" .../>}` does not render. | E2E | `[id].tsx:92,329` — `{canDispatch && <Button title="Dispatch" .../>}` |
| TC-MOB-MC-108 | Dispatch Operator | Dispatch Operator sees NO buttons on CLOSED carton | P0 | 1. Login as Dispatch Op. 2. Open `MC-CLOSED-01`. | No action bar at all. Outer `RoleGate` excludes Dispatch Op. Even though `canDispatch=true`, they never see the action bar. See `[?]` #13. | E2E | `[id].tsx:275` — `allow={['Admin','Supervisor','Warehouse Operator']}` excludes Dispatch Op |
| TC-MOB-MC-109 | Admin | "Dispatch" button navigates to `/dispatch/create` without passing carton ID | P0 | 1. Open `MC-CLOSED-01`. 2. Tap "Dispatch". | `router.push('/dispatch/create')` — no query params, no carton ID passed. Dispatch screen opens from scratch. User must re-scan. See `[?]` #14. | Manual | `[id].tsx:341` — `router.push('/dispatch/create' as never)` |

---

## Section 24.19 — Detail: CREATED status — Unpack-only

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-110 | Admin | CREATED carton shows only "Unpack" button in action bar | P0 | 1. Login as Admin. 2. Open `MC-CREATED-01` (status=CREATED, child_count=0). | Only "Unpack" button visible (`variant="outline"`, `fullWidth`). No "Close & Store". No "Dispatch". | Manual | `[id].tsx:347-363` — CREATED status block |
| TC-MOB-MC-111 | Admin | "Unpack" enabled on CREATED carton with 0 boxes | P1 | 1. Open `MC-CREATED-01` (child_count=0). 2. Observe "Unpack" button state. | Button is enabled (not disabled by default). Tapping shows confirm alert even for 0 boxes. See `[?]` #15. | Manual | `[id].tsx:347-363` — no `child_count > 0` guard on the CREATED Unpack button |
| TC-MOB-MC-112 | Warehouse Operator | Warehouse Op sees "Unpack" on CREATED carton | P0 | 1. Login as Warehouse Op. 2. Open `MC-CREATED-01`. | "Unpack" button visible. Outer RoleGate passes. | E2E | Warehouse Op in `allow={['Admin','Supervisor','Warehouse Operator']}` |
| TC-MOB-MC-113 | Dispatch Operator | Dispatch Op sees no action bar on CREATED carton | P0 | 1. Login as Dispatch Op. 2. Open `MC-CREATED-01`. | No action buttons at all. Same RoleGate exclusion as other statuses. | E2E | `[id].tsx:275` |

---

## Section 24.20 — Detail: DISPATCHED status — info text, no actions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-114 | Admin | DISPATCHED carton shows info text, no action buttons | P0 | 1. Login as Admin. 2. Open `MC-DISPATCHED-01`. | Text "This carton has been dispatched. No actions available." visible (`styles.dispatchedNote`: italic, `COLORS.textSecondary`, centered). No buttons of any kind. | Manual | `[id].tsx:270-273` — `c.status === 'DISPATCHED'` branch outside RoleGate |
| TC-MOB-MC-115 | Supervisor | DISPATCHED info text visible for Supervisor | P0 | 1. Login as Supervisor. 2. Open `MC-DISPATCHED-01`. | Same "No actions available." text. No buttons. | Manual | `[id].tsx:270` — DISPATCHED branch precedes the RoleGate block |
| TC-MOB-MC-116 | Warehouse Operator | DISPATCHED info text visible for Warehouse Op | P0 | 1. Login as Warehouse Op. 2. Open `MC-DISPATCHED-01`. | Same "No actions available." text. | Manual | `[id].tsx:270` |
| TC-MOB-MC-117 | Dispatch Operator | DISPATCHED info text visible for Dispatch Op | P0 | 1. Login as Dispatch Op. 2. Open `MC-DISPATCHED-01`. | "No actions available." text visible. Note: for DISPATCHED cartons, the `RoleGate` block is bypassed entirely — the info-text branch applies to all roles. | Manual | `[id].tsx:270-274` — condition `c.status === 'DISPATCHED'` is checked before the `RoleGate`; info text is role-agnostic |

---

## Section 24.21 — Detail: Close & Store confirmation dialog + mutation success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-118 | Admin | Tapping "Close & Store" shows confirm Alert with correct message | P0 | 1. Open `MC-ACTIVE-01` (`carton_barcode='MCAB1234'`, `child_count=3`). 2. Tap "Close & Store". | `Alert.alert('Close & Store?', 'This will seal MCAB1234 (3 boxes) and move it to closed inventory.')`. Buttons: "Cancel" (cancel style) and "Close & Store". | Manual | `[id].tsx:139-149` |
| TC-MOB-MC-119 | Admin | Confirming "Close & Store" calls `masterCartonService.closeCarton(id)` | P0 | 1. Tap "Close & Store". 2. Tap "Close & Store" in the alert. | `closeMutation.mutate(carton.id)` → `POST /master-cartons/{id}/close`. `closeMutation.isPending=true` briefly. | Integration | `[id].tsx:146` |
| TC-MOB-MC-120 | Admin | After successful close: success toast "Carton closed and stored successfully." | P0 | 1. Confirm "Close & Store". 2. Wait for API response. | Toast (via `useApiMutation` `successMessage`) displays "Carton closed and stored successfully.". Carton status re-renders as CLOSED. | E2E | `[id].tsx:128` — `successMessage: 'Carton closed and stored successfully.'` |
| TC-MOB-MC-121 | Admin | After successful close: query keys invalidated and carton status updates | P0 | 1. Confirm close on `MC-ACTIVE-01`. | `INVALIDATE_KEYS` plus `['masterCarton', id]` and `['masterCarton-assortment', id]` are all invalidated. Detail screen refetches and shows ACTIVE → CLOSED status badge. Action bar changes from "Close & Store + Unpack" to "Unpack + (Dispatch if canDispatch)". | Integration | `[id].tsx:129-134` |
| TC-MOB-MC-122 | Admin | Cancelling "Close & Store" alert leaves carton unchanged | P0 | 1. Tap "Close & Store". 2. Tap "Cancel" in alert. | Alert dismisses. Carton status remains ACTIVE. No API call. Buttons remain enabled. | Manual | `[id].tsx:143` — cancel button style='cancel', no `onPress` → no-op |

### Maestro flows for Section 24.21

```yaml
# mobile/.maestro/master-cartons/mc-close-and-store.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  ACTIVE_CARTON_ID: "REPLACE_WITH_MC-ACTIVE-01_ID"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- openLink: "binnyinventory://master-cartons/${ACTIVE_CARTON_ID}"
- waitForAnimationToEnd
- tapOn: "Close & Store"
- waitForAnimationToEnd
- assertVisible: "Close & Store?"
- tapOn: "Close & Store"
- waitForAnimationToEnd
- assertVisible: "Carton closed and stored successfully."
- assertVisible: "CLOSED"
```

---

## Section 24.22 — Detail: Unpack confirmation dialog + mutation + cancel

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-123 | Admin | Tapping "Unpack" shows destructive-style Alert with correct message | P0 | 1. Open `MC-ACTIVE-01` (`carton_barcode='MCAB1234'`, `child_count=3`). 2. Tap "Unpack". | `Alert.alert('Unpack Carton?', 'This will release all 3 child boxes from MCAB1234 back to FREE status. This action cannot be undone.')`. Buttons: "Cancel" (cancel style) and "Unpack" (`style:'destructive'`). | Manual | `[id].tsx:167-177` |
| TC-MOB-MC-124 | Admin | "Unpack" alert button uses destructive style (red text on iOS) | P0 | 1. Observe the Unpack alert on iOS. | "Unpack" button rendered in red text (`style: 'destructive'`). On Android: same alert layout (destructive styling less prominent). | Manual | `[id].tsx:172` — `style: 'destructive'` |
| TC-MOB-MC-125 | Admin | Confirming Unpack calls `masterCartonService.fullUnpack(id)` | P0 | 1. Tap "Unpack" on `MC-ACTIVE-01`. 2. Confirm. | `unpackMutation.mutate(carton.id)` → `POST /master-cartons/{id}/full-unpack`. | Integration | `[id].tsx:175` |
| TC-MOB-MC-126 | Admin | After unpack: no success toast (unpackMutation has no successMessage) | P0 | 1. Confirm Unpack. 2. Wait for API. | No toast appears. `unpackMutation` config has no `successMessage` field. UI re-renders silently after query invalidation and refetch. See `[?]` #17. | Manual | `[id].tsx:154-163` — `unpackMutation` config: only `invalidateKeys`, no `successMessage` |
| TC-MOB-MC-127 | Admin | After unpack: ACTIVE carton transitions to CREATED status | P0 | 1. Unpack `MC-ACTIVE-01` (ACTIVE, 3 boxes). 2. Observe detail screen after refetch. | Status badge changes to CREATED. `child_count` becomes 0. Progress bar at 0%. Action bar changes to Unpack-only (CREATED status). | Integration | `fullUnpack` backend behavior: boxes → FREE, carton → CREATED |
| TC-MOB-MC-128 | Admin | Cancelling Unpack alert leaves carton unchanged | P0 | 1. Tap "Unpack". 2. Tap "Cancel". | Alert dismisses. No API call. Carton status unchanged. | Manual | `[id].tsx:168` |
| TC-MOB-MC-129 | Admin | After unpack: all relevant query keys invalidated | P0 | 1. Confirm unpack. | `INVALIDATE_KEYS` + `['masterCarton', id]` + `['masterCarton-assortment', id]` invalidated. List screen and dashboard refetch. | Integration | `[id].tsx:157-163` |

### Maestro flows for Section 24.22

```yaml
# mobile/.maestro/master-cartons/mc-unpack-cancel.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  ACTIVE_CARTON_ID: "REPLACE_WITH_MC-ACTIVE-01_ID"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- openLink: "binnyinventory://master-cartons/${ACTIVE_CARTON_ID}"
- waitForAnimationToEnd
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "Unpack Carton?"
- tapOn: "Cancel"
- waitForAnimationToEnd
- assertVisible: "ACTIVE"
- assertNotVisible: "CREATED"
```

```yaml
# mobile/.maestro/master-cartons/mc-unpack-confirm.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  ACTIVE_CARTON_ID: "REPLACE_WITH_MC-ACTIVE-01_ID"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- openLink: "binnyinventory://master-cartons/${ACTIVE_CARTON_ID}"
- waitForAnimationToEnd
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "Unpack Carton?"
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "CREATED"
```

---

## Section 24.23 — Detail: assortment card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-130 | Admin | Assortment card shows inline spinner while `assortmentQ.isLoading` | P0 | 1. Open a detail screen. 2. Observe assortment card before data arrives. | Inline `<Spinner size="small" />` inside `<View style={styles.inlineSpinner}>` visible. `assortmentQ.isLoading=true`. | Manual | `[id].tsx:371-374` |
| TC-MOB-MC-131 | Admin | Assortment card shows "No items" when assortment empty | P0 | 1. Open `MC-CREATED-01` (no child boxes → empty assortment). | "No items" text (`styles.emptyText`, `COLORS.textSecondary`). No assortment rows. | Manual | `[id].tsx:375-377` |
| TC-MOB-MC-132 | Admin | Assortment row: "{article_name} · {colour} · {size} · ₹{mrp.toFixed(2)}" + x{count} pill | P0 | 1. Open `MC-ACTIVE-01` with mixed articles. 2. Observe each assortment row. | Row: label "SportShoe · BLUE · 7 · ₹299.00" (truncated with ellipsis if long). Right pill: `x3` with `COLORS.primary` text, rounded background. `{item.count}`. | Manual | `[id].tsx:52-63`; `assortmentCountPill: backgroundColor: COLORS.primary + '15', borderRadius:12` |
| TC-MOB-MC-133 | Admin | Multiple assortment rows rendered for multi-article carton | P0 | 1. Open a carton with 3 distinct article+colour+size combinations. | 3 `AssortmentRow` components rendered. Each keyed by `${article_name}-${colour}-${size}-${idx}`. | Manual | `[id].tsx:378-382` |

---

## Section 24.24 — Detail: child-boxes collapsible

Threshold: `CHILD_BOX_COLLAPSE_THRESHOLD = 5` (`[id].tsx:30`). State initialised at `childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD` (`[id].tsx:112`). Card is hidden entirely when `childBoxes.length === 0` (`[id].tsx:388`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-134 | Admin | Child boxes card hidden when carton has 0 child boxes | P0 | 1. Open `MC-CREATED-01` (child_count=0). | Child boxes card not rendered. `{childBoxes.length > 0 && <Card ...>}` → condition false. | Manual | `[id].tsx:388` |
| TC-MOB-MC-135 | Admin | Child boxes card with ≤5 boxes is expanded by default | P0 | 1. Open `MC-FEW-BOXES` (5 child boxes). | Card renders with all 5 `ChildBoxRow` components visible. Header shows "Child Boxes (5)" with chevron-up icon. `childBoxesExpanded` initialises to `true` (5 ≤ 5). | Manual | `[id].tsx:111-113` — `childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD` (5 ≤ 5 = true) |
| TC-MOB-MC-136 | Admin | Child boxes card with >5 boxes is collapsed by default | P0 | 1. Open `MC-MANY-BOXES` (6+ child boxes). | Card renders with header "Child Boxes (N)" but rows hidden. Chevron-down icon. `childBoxesExpanded` initialises to `false` (6 > 5). | Manual | `[id].tsx:112` — `6 <= 5 = false` → collapsed |
| TC-MOB-MC-137 | Admin | Tapping header expands collapsed list | P0 | 1. Open collapsed child-boxes card (`MC-MANY-BOXES`). 2. Tap header. | All `ChildBoxRow` components render. Chevron flips to up. `setChildBoxesExpanded(v => !v)` toggles to `true`. | E2E | `[id].tsx:392-401` |
| TC-MOB-MC-138 | Admin | Tapping header collapses expanded list | P0 | 1. Open `MC-FEW-BOXES` (expanded by default). 2. Tap header. | Rows hide. Chevron-down icon. State toggles to `false`. | E2E | `[id].tsx:392` |
| TC-MOB-MC-139 | Admin | Each child-box row: barcode (monospace) + status badge `type="childBox"` + article·colour·size + SKU·₹MRP | P0 | 1. Expand child boxes. 2. Observe each row. | Row top: `box.barcode` (`fontFamily:monospace`, `fontWeight:'600'`) at left + `<Badge label={box.status} type="childBox" />` at right. Below: `{article_name} · {colour} · {size}`. Below: `{sku} · ₹{mrp.toFixed(2)}`. | Manual | `[id].tsx:66-82`; `ChildBoxRow` sub-component |

### Maestro flows for Section 24.24

```yaml
# mobile/.maestro/master-cartons/mc-childbox-collapsible.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  MANY_BOX_CARTON_ID: "REPLACE_WITH_MC-MANY-BOXES_ID"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- openLink: "binnyinventory://master-cartons/${MANY_BOX_CARTON_ID}"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- assertVisible:
    id: "child-box-row-0"
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- assertNotVisible:
    id: "child-box-row-0"
```

---

## Section 24.25 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-MC-140 | Admin | Detail: network failure on load shows not-found state (no crash) | P1 | 1. Disable network. 2. Navigate to detail for any carton. | Spinner briefly. Query fails → `cartonQ.isLoading=false, carton=undefined` → "Carton not found" empty state. No crash. | Manual | `[id].tsx:194-207` — same empty-state branch used for both 404 and network error |
| TC-MOB-MC-141 | Admin | Detail: deep-link to non-existent carton ID shows "Carton not found" | P0 | 1. Navigate to `/master-cartons/00000000-dead-beef-0000-000000000000`. | `GET /master-cartons/{id}` returns 404. `carton=undefined`. "Carton not found — This carton may have been removed." | Manual | `[id].tsx:194-207` |
| TC-MOB-MC-142 | Admin | Create: scanning a master-carton QR (`MC...`) into child-box scanner shows "Scan failed" | P1 | 1. On Pack Carton screen, tap "Scan Child Box". 2. Present a master-carton QR (`MCAB1234`). | `parseQRCode('MCAB1234')` → `{type:'master', id:'MCAB1234'}`. `type !== 'child'` → `code = 'MCAB1234'` (raw). `childBoxService.getByBarcode('MCAB1234')` → 404. Alert "Scan failed". | Manual | `create.tsx:99-100` — raw fallback; `utils/index.ts:36` |
| TC-MOB-MC-143 | Admin | Create: scanning legacy child-box barcode (`BINNY-CB-{uuid}`) is accepted if DB fixture present; [SKIP-POST-MIGRATION] | P2 | 1. Scan `CB-LEGACY-01` (legacy format). | `parseQRCode` long-match → `{type:'child', id:'BINNY-CB-...'}`. `childBoxService.getByBarcode('BINNY-CB-...')` → box. Accepted if FREE/GENERATED. | Manual | `CB-LEGACY-01` not available post-migration; skip. `utils/index.ts:42-48` |
| TC-MOB-MC-144 | Admin | Create: race condition — scanning same box twice in quick succession | P1 | 1. Trigger two near-simultaneous scans of the same barcode (e.g. via fast scanner or double-trigger). | Dedupe check `scanned.some(b => b.barcode === code)` fires on second call. If second scan arrives while first is still validating, race is possible (both calls pass dedupe before either resolves). Observe whether box appears twice. | Manual | `create.tsx:102` — dedupe runs on `scanned` state snapshot; concurrent validation could bypass it. `[?]` flag if double-add observed |
| TC-MOB-MC-145 | Admin | Create: capacity clamp in TextInput — entering "0" on blur clamps to minCapacity (1 when no boxes) | P0 | 1. Type "0" in capacity input. Blur. | `parseInt('0')=0 < minCapacity(1)` → clamped to 1. `Math.min(99, Math.max(1, 0)) = 1`. | Manual | `create.tsx:90` |
| TC-MOB-MC-146 | Admin | Create: entering "100" in capacity clamps to 99 | P0 | 1. Type "100". Blur. | `Math.min(99, Math.max(1, 100)) = 99`. TextInput shows "99". | Manual | `create.tsx:90` — upper clamp |
| TC-MOB-MC-147 | Admin | List: tapping a card while a refetch is in-progress does not cause double-navigation | P1 | 1. Pull to refresh. 2. While spinner shows, tap a card. | Navigation to detail screen happens once. No duplicate stack entries. `TouchableOpacity activeOpacity=0.7` debounces visual feedback but does not prevent double-tap; verify Expo Router deduplication handles this. | Manual | `index.tsx:88-89` |
| TC-MOB-MC-148 | Admin | Create: "Create Carton" button stays disabled throughout mutation pending — no double-submit | P0 | 1. Scan 1 box. 2. Tap "Create Carton (1)". 3. Tap again immediately. | Button disabled after first tap (`createMutation.isPending=true`). Second tap does nothing. `POST /master-cartons` fires exactly once. | Manual | `create.tsx:252` — `disabled={scanned.length === 0 \|\| createMutation.isPending}` |
| TC-MOB-MC-149 | Admin | Detail: Close & Store on carton with 0 boxes (ACTIVE, child_count=0) — alert still fires | P1 | 1. Force an ACTIVE carton to have 0 boxes (edge state). 2. Tap "Close & Store". | Alert shows "This will seal MCXXXX (0 boxes) and move it to closed inventory." Backend may accept or reject. Alert text uses `carton.child_count` which is 0. | Manual | `[id].tsx:141` — `${carton.child_count} boxes` in alert body; no front-end guard against 0 |
| TC-MOB-MC-150 | Admin | Detail: GENERATED child box status badge renders correctly in child-boxes card | P0 | 1. Pack a GENERATED box into a carton. 2. Open detail, expand child boxes. | Row shows `<Badge label="GENERATED" type="childBox" />`. Badge colour from Badge component's `childBox+GENERATED` mapping. | Manual | `[id].tsx:73`; `Badge` component handles `type="childBox"` |

---

## Maestro flows index

| Flow file | Section | Purpose |
|---|---|---|
| `mobile/.maestro/master-cartons/mc-list-admin-access.yaml` | 24.1 | Admin accesses Master Cartons list (positive) |
| `mobile/.maestro/master-cartons/mc-list-dispatch-no-fab.yaml` | 24.1 | Dispatch Op list access + FAB absence |
| `mobile/.maestro/master-cartons/mc-search-and-clear.yaml` | 24.3 | Search by barcode + X clear |
| `mobile/.maestro/master-cartons/mc-status-filter.yaml` | 24.4 | Status chip filter (ALL → ACTIVE → ALL) |
| `mobile/.maestro/master-cartons/mc-fab-dispatch-denied.yaml` | 24.7 | Dispatch Op denied FAB / no Pack Carton screen |
| `mobile/.maestro/master-cartons/mc-pack-happy-path.yaml` | 24.12 | Full pack-carton E2E: scan 1 box → create → land on detail |
| `mobile/.maestro/master-cartons/mc-close-and-store.yaml` | 24.21 | Close & Store confirm + success toast + CLOSED status |
| `mobile/.maestro/master-cartons/mc-unpack-cancel.yaml` | 24.22 | Unpack confirm dialog → cancel → carton unchanged |
| `mobile/.maestro/master-cartons/mc-unpack-confirm.yaml` | 24.22 | Unpack confirm → submit → CREATED status |
| `mobile/.maestro/master-cartons/mc-childbox-collapsible.yaml` | 24.24 | Collapsed >5 child boxes → tap expand → tap collapse |

**Total Maestro YAML flows: 10**

---

## Open questions / `[?]` flags

| # | Section | TC | Question |
|---|---|---|---|
| 13 | 24.16, 24.18 | TC-MOB-MC-099, TC-MOB-MC-108 | **Dispatch Operator cannot dispatch from mobile carton detail.** `RoleGate allow={['Admin','Supervisor','Warehouse Operator']}` wraps the entire action bar at `[id].tsx:275`. The `canDispatch` check (`useHasRole(['Admin','Supervisor','Dispatch Operator'])`) is `true` for Dispatch Op, but the outer gate hides all action buttons. On web, Dispatch Op can initiate dispatch directly from the carton detail page. Needs product/UX confirmation: is mobile parity expected, or is web-only dispatch from carton detail intentional? Resolution options: (a) move the Dispatch button outside the RoleGate with its own inner gate, or (b) widen the allow list to include Dispatch Op. |
| 14 | 24.18 | TC-MOB-MC-109 | **Dispatch button does not pass carton ID.** `router.push('/dispatch/create' as never)` at `[id].tsx:341` navigates without query params. User must re-scan the carton on the dispatch screen. Intentional re-verification step (ensures user physically re-confirms the carton before dispatch), or UX friction that could be eliminated by pre-populating the dispatch screen? |
| 15 | 24.19 | TC-MOB-MC-111 | **Unpack enabled on CREATED carton with 0 boxes.** The CREATED status block at `[id].tsx:347-363` renders the "Unpack" button without a `child_count > 0` guard. Calling `fullUnpack` on a 0-box carton may succeed (no-op) or fail on the backend. Cross-reference: phase-23 item #2 (Unpack screen also does not block CREATED). Should the Unpack button be hidden or disabled when `child_count === 0`? Consistent with Repack (blocks empty carton) and Storage (blocks empty carton). |
| 16 | 24.10 | TC-MOB-MC-054 | **GENERATED-status child box accepted during pack.** `create.tsx:118` allows `FREE` and `GENERATED`. Check if the web Create Master Carton flow at `frontend/src/app/(dashboard)/master-cartons/create/page.tsx` also allows GENERATED, or if mobile is permissive while web is not. A mobile-web inconsistency could create data anomalies if GENERATED boxes are intended to be direct-to-consumer only. |
| 17 | 24.22 | TC-MOB-MC-126 | **No success toast after Unpack (but there is one after Close & Store).** `closeMutation` has `successMessage: 'Carton closed and stored successfully.'` (`[id].tsx:128`); `unpackMutation` has no `successMessage` (`[id].tsx:154-163`). User receives haptic+toast on close but only a silent UI re-render on unpack. Intentional asymmetry (unpack is destructive/obvious) or oversight? Should `unpackMutation` have a message like "Carton unpacked. All boxes released to FREE." |
| 18 | 24.25 | TC-MOB-MC-144 | **Potential race condition on rapid double-scan.** The dedupe check at `create.tsx:102` reads from the `scanned` React state snapshot. If two `handleScan` calls are in-flight simultaneously (both `setValidating(true)`, both pass dedupe, both call `childBoxService.getByBarcode`), the second resolved promise could append a duplicate. This is a concurrency gap in the current implementation — no in-flight-barcode Set guard. Low probability with physical scanners but possible with camera scanners. |
| 19 | 24.1 | TC-MOB-MC-003, TC-MOB-MC-004 | **No label-print flow on mobile detail.** Carton label printing (thermal printer via TSC/web) is available only from the web detail page. Mobile detail has no "Print Label" button. Is mobile label-print on the roadmap, or is web-only label printing intentional for this use case (operators print from desktop, scan barcodes from printed labels)? |

---

*Authored 2026-05-11 by Sonnet under Opus dispatch (Session 4 of 13 in mobile coverage workstream).*
