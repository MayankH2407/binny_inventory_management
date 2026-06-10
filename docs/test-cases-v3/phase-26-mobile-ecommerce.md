# Phase 26 — Mobile E-commerce (List, Create, Detail)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/ecommerce` list, `/ecommerce/create`, `/ecommerce/[id]` detail
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 26.1 — List: role-agnostic access](#section-261--list-role-agnostic-access)
- [Section 26.2 — List: card rendering (barcode, status badge, marketplace+sku, box+MRP, dates)](#section-262--list-card-rendering)
- [Section 26.3 — List: search (debounce + X clear)](#section-263--list-search)
- [Section 26.4 — List: status filter chips (ALL/CREATED/ACTIVE/CLOSED/DISPATCHED)](#section-264--list-status-filter-chips)
- [Section 26.5 — List: infinite scroll + pagination](#section-265--list-infinite-scroll--pagination)
- [Section 26.6 — List: pull-to-refresh + loading + empty state](#section-266--list-pull-to-refresh--loading--empty-state)
- [Section 26.7 — List: FAB role gate (Admin/Sup purple; Warehouse + Dispatch hidden)](#section-267--list-fab-role-gate)
- [Section 26.8 — Create screen: role gate](#section-268--create-screen-role-gate)
- [Section 26.9 — Create: Name field (required)](#section-269--create-name-field)
- [Section 26.10 — Create: Marketplace field](#section-2610--create-marketplace-field)
- [Section 26.11 — Create: Order Reference field](#section-2611--create-order-reference-field)
- [Section 26.12 — Create: Listing SKU field](#section-2612--create-listing-sku-field)
- [Section 26.13 — Create: Mapped Date field](#section-2613--create-mapped-date-field)
- [Section 26.14 — Create: Notes field](#section-2614--create-notes-field)
- [Section 26.15 — Create: Scan section — modal + manual entry](#section-2615--create-scan-section)
- [Section 26.16 — Create: Scan flow — optimistic add + status validation + rollback](#section-2616--create-scan-flow--optimistic-add--status-validation--rollback)
- [Section 26.17 — Create: Dedupe + scanned-row rendering + trash](#section-2617--create-dedupe--scanned-row-rendering--trash)
- [Section 26.18 — Create: Clear All button](#section-2618--create-clear-all-button)
- [Section 26.19 — Create: Submit validation + mutation + router.replace](#section-2619--create-submit-validation--mutation--routerreplace)
- [Section 26.20 — Detail: data load + chained queries + not-found state](#section-2620--detail-data-load--chained-queries--not-found-state)
- [Section 26.21 — Detail: Header card](#section-2621--detail-header-card)
- [Section 26.22 — Detail: Timeline card](#section-2622--detail-timeline-card)
- [Section 26.23 — Detail: Action-bar status × role matrix](#section-2623--detail-action-bar-status--role-matrix)
- [Section 26.24 — Detail: Add Box inline scan](#section-2624--detail-add-box-inline-scan)
- [Section 26.25 — Detail: Close Record confirm + mutation](#section-2625--detail-close-record-confirm--mutation)
- [Section 26.26 — Detail: Full Unpack confirm + mutation](#section-2626--detail-full-unpack-confirm--mutation)
- [Section 26.27 — Detail: Remove individual Box](#section-2627--detail-remove-individual-box)
- [Section 26.28 — Detail: Dispatch button](#section-2628--detail-dispatch-button)
- [Section 26.29 — Detail: DISPATCHED status info text + Assortment + Child Boxes collapsible](#section-2629--detail-dispatched-status-info-text--assortment--child-boxes-collapsible)
- [Section 26.30 — Negative / edge cases](#section-2630--negative--edge-cases)
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
| `EC-CREATED-01` | CREATED e-commerce record, `child_count=0`, all optional fields null. | CREATED | 26.1, 26.2, 26.4, 26.20, 26.21, 26.22, 26.23, 26.24, 26.26, 26.29 |
| `EC-ACTIVE-FULL` | ACTIVE record, `child_count=3`, marketplace="Amazon", order_reference="ORD-12345", listing_sku="BNY-AMZ-001", mapped_date set. | ACTIVE | 26.1, 26.2, 26.4, 26.21, 26.22, 26.23, 26.24, 26.25, 26.26, 26.27, 26.29 |
| `EC-ACTIVE-MKT-ONLY` | ACTIVE record, marketplace="Flipkart", listing_sku=null, order_reference=null. | ACTIVE | 26.2, 26.21 |
| `EC-ACTIVE-SKU-ONLY` | ACTIVE record, marketplace=null, listing_sku="BNY-FLK-002". Row 3 shows SKU only. | ACTIVE | 26.2 |
| `EC-ACTIVE-NULLFIELDS` | ACTIVE record, marketplace=null, listing_sku=null, order_reference=null. Row 3 hidden. | ACTIVE | 26.2, 26.21 |
| `EC-CLOSED-01` | CLOSED record, `child_count=4`, `closed_at` set, marketplace="Meesho". | CLOSED | 26.1, 26.2, 26.4, 26.21, 26.23, 26.25, 26.26, 26.28, 26.29 |
| `EC-DISPATCHED-01` | DISPATCHED record, `closed_at` + `dispatched_at` both set. | DISPATCHED | 26.2, 26.4, 26.21, 26.22, 26.23, 26.29 |
| `CB-FREE-01` | FREE child box (short barcode e.g. `CB1A2B3C`). Article, colour, size, SKU, MRP set. | FREE | 26.15, 26.16, 26.17, 26.19, 26.24 |
| `CB-FREE-02` | Second FREE child box. Different article from `CB-FREE-01`. | FREE | 26.16, 26.17, 26.19 |
| `CB-GENERATED-01` | GENERATED child box. `status=GENERATED`. | GENERATED | 26.16, 26.24 |
| `CB-PACKED-01` | PACKED child box (already in a carton). | PACKED | 26.16, 26.24, 26.30 |
| `CB-SAMPLE-01` | SAMPLE child box (already in a sample record). | SAMPLE | 26.16, 26.30 |
| `CB-ECOMMERCE-01` | ECOMMERCE child box (already in an e-commerce record). | ECOMMERCE | 26.16, 26.30 |
| `EC-MANY-BOXES` | ACTIVE or CLOSED record with ≥6 child boxes (above `CHILD_BOX_COLLAPSE_THRESHOLD=5`). | ACTIVE or CLOSED | 26.29 |
| `EC-FEW-BOXES` | CLOSED record with exactly 5 child boxes (at threshold — default expanded). | CLOSED | 26.29 |
| `EC-ZERO-BOXES` | CREATED record with `child_count=0`. | CREATED | 26.29, 26.30 |
| `EC-LEGACY-01` | **[SKIP-POST-MIGRATION]** — After the May 5 short-barcode migration, no legacy `BINNY-EC-{uuid}` records remain on local or portal DB. Mark TC `[SKIP-POST-MIGRATION]` in Notes. | n/a | 26.2, 26.30 |
| `CB-LEGACY-01` | **[SKIP-POST-MIGRATION]** — Legacy `BINNY-CB-{uuid}` child boxes no longer exist post-migration. | n/a | 26.16, 26.30 |

---

## Section 26.1 — List: role-agnostic access

All 4 roles can view the E-commerce list. No `RoleGate` wraps the list screen — access is controlled only at the FAB and Create screen level. `mobile/app/ecommerce/index.tsx` renders the `FlatList` unconditionally.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-001 | Admin | Admin can access E-commerce list | P0 | 1. Login as Admin. 2. Navigate to E-commerce (Menu → E-commerce). 3. Observe. | Title bar "E-commerce". Search bar visible. Chips visible. Cards render. No "Not authorized". | E2E | `mobile/app/ecommerce/index.tsx:164` — no RoleGate wrapping list; `Stack.Screen title='E-commerce'` |
| TC-MOB-EC-002 | Supervisor | Supervisor can access E-commerce list | P0 | 1. Login as Supervisor. 2. Navigate to E-commerce. | List renders identically. No denial. | E2E | All 4 roles have list access |
| TC-MOB-EC-003 | Warehouse Operator | Warehouse Op can access E-commerce list | P0 | 1. Login as Warehouse Op. 2. Navigate to E-commerce. | List renders. Cards visible. **FAB hidden** (Warehouse Op excluded from FAB allow list). No "Not authorized". | E2E | `mobile/app/ecommerce/index.tsx:258` — `RoleGate allow={['Admin','Supervisor']}` |
| TC-MOB-EC-004 | Dispatch Operator | Dispatch Op can access E-commerce list | P0 | 1. Login as Dispatch Op. 2. Navigate to E-commerce. | List renders. Cards visible. **FAB hidden** (Dispatch Op excluded). No "Not authorized". | E2E | `mobile/app/ecommerce/index.tsx:258` — Dispatch Op also excluded; no fallback rendered |

### Maestro flows for Section 26.1

```yaml
# mobile/.maestro/ecommerce/ec-list-access-warehouse.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
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
- tapOn: "E-commerce"
- waitForAnimationToEnd
- assertVisible: "E-commerce"
- assertNotVisible: "Not authorized"
- assertNotVisible:
    id: "fab-create-ecommerce"
```

---

## Section 26.2 — List: card rendering

Card layout: Row 1 barcode (monospace) + status badge using `ECOMMERCE_STATUS_COLORS`. Row 2 name. Row 3 marketplace/SKU composite (conditional). Row 4 box count + MRP. Row 5 dates.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-005 | Admin | Card shows barcode in monospace + status badge with ECOMMERCE_STATUS_COLORS | P1 | 1. Login Admin. 2. Open E-commerce list. 3. Locate `EC-ACTIVE-FULL`. | `ecommerce_barcode` shown in monospace font. `Badge` with label "ACTIVE" using `ECOMMERCE_STATUS_COLORS['ACTIVE']`. | Manual | `mobile/app/ecommerce/index.tsx:109-115` — barcode style `fontFamily: monospace`; `Badge color={ECOMMERCE_STATUS_COLORS[record.status]}` |
| TC-MOB-EC-006 | Admin | Row 3 shows "Marketplace: X · SKU" when both present | P1 | 1. Locate `EC-ACTIVE-FULL` (marketplace="Amazon", listing_sku="BNY-AMZ-001"). 2. Read row 3. | Row 3 shows "Marketplace: Amazon · BNY-AMZ-001". | Manual | `mobile/app/ecommerce/index.tsx:75-79` — `marketplaceLine = 'Marketplace: ${marketplace} · ${listing_sku}'` |
| TC-MOB-EC-007 | Admin | Row 3 shows "Marketplace: X" when only marketplace present | P1 | 1. Locate `EC-ACTIVE-MKT-ONLY` (marketplace="Flipkart", listing_sku=null). | Row 3 shows "Marketplace: Flipkart" (no SKU suffix). | Manual | `mobile/app/ecommerce/index.tsx:75-78` — `listing_sku` absent → no suffix appended |
| TC-MOB-EC-008 | Admin | Row 3 shows bare SKU when only listing_sku present (no label prefix) | P1 | 1. Locate `EC-ACTIVE-SKU-ONLY` (marketplace=null, listing_sku="BNY-FLK-002"). | Row 3 shows "BNY-FLK-002" (no "SKU:" prefix). | Manual | `mobile/app/ecommerce/index.tsx:80-81` — `else if (record.listing_sku) marketplaceLine = record.listing_sku` — no label. `[?]31` |
| TC-MOB-EC-009 | Admin | Row 3 hidden when both marketplace and listing_sku are null | P1 | 1. Locate `EC-ACTIVE-NULLFIELDS`. | No row 3 shown; card jumps straight to box count row. | Manual | `mobile/app/ecommerce/index.tsx:124` — `!!marketplaceLine && (...)` conditional render |
| TC-MOB-EC-010 | Admin | Card shows N boxes + MRP summary | P1 | 1. Locate `EC-ACTIVE-FULL` (child_count=3, mrp_summary set). | Shows e.g. "3 boxes · ₹NNN.NN". | Manual | `mobile/app/ecommerce/index.tsx:85-89` — `mrp_summary != null` guard; `Number().toFixed(2)` |
| TC-MOB-EC-011 | Admin | Card dates line shows Created always; Closed appended only when set | P1 | 1. Check `EC-ACTIVE-FULL` (no closed_at). 2. Check `EC-CLOSED-01` (has closed_at). | Active card: "Created DD Mon YYYY" only. Closed card: "Created ... · Closed ...". | Manual | `mobile/app/ecommerce/index.tsx:92-97` — conditional date appends |
| TC-MOB-EC-012 | Admin | Card dates line shows Dispatched when dispatched_at set | P1 | 1. Locate `EC-DISPATCHED-01`. | Dates line includes "· Dispatched DD Mon YYYY". | Manual | `mobile/app/ecommerce/index.tsx:98-100` |
| TC-MOB-EC-013 | Admin | Tapping card navigates to `/ecommerce/{id}` | P1 | 1. Tap any e-commerce card. | App navigates to E-commerce Detail screen for that ID. | E2E | `mobile/app/ecommerce/index.tsx:103` — `router.push('/ecommerce/${record.id}')` |

---

## Section 26.3 — List: search

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-014 | Admin | Search placeholder reads "Search by name or barcode..." | P2 | 1. Open E-commerce list. 2. Observe search bar. | Placeholder "Search by name or barcode..." visible. | Manual | `mobile/app/ecommerce/index.tsx:181` — `placeholder="Search by name or barcode..."` |
| TC-MOB-EC-015 | Admin | Search debounces 300ms before querying | P1 | 1. Type "Amazon" rapidly. 2. Monitor network. | API called ~300ms after last keystroke; not per character. | Manual | `mobile/app/ecommerce/index.tsx:40-45` — `useEffect` with 300ms `setTimeout` on `searchInput` |
| TC-MOB-EC-016 | Admin | Search filters list by name substring | P1 | 1. Type record name substring. 2. Wait 400ms. | List updates to matching records only. | E2E | `mobile/app/ecommerce/index.tsx:48-55` — `search` param passed to `ecommerceService.getAll` |
| TC-MOB-EC-017 | Admin | X clear button appears when text entered and clears on tap | P1 | 1. Type "Spring". 2. Observe. 3. Tap X icon. | `close-circle` icon appears when `searchInput.length > 0`; tapping sets `searchInput=''`; list resets. | Manual | `mobile/app/ecommerce/index.tsx:187-194` |
| TC-MOB-EC-018 | Admin | Clearing search restores full list | P1 | 1. Search "Amazon". 2. Clear. | Full unfiltered list restored. | E2E | `mobile/app/ecommerce/index.tsx:53` — `search: search || undefined` |

---

## Section 26.4 — List: status filter chips

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-019 | Admin | All 5 chips rendered: ALL/CREATED/ACTIVE/CLOSED/DISPATCHED | P1 | 1. Open E-commerce list. 2. Observe chip row. | Chips in order: ALL, CREATED, ACTIVE, CLOSED, DISPATCHED. ALL selected by default. | Manual | `mobile/app/ecommerce/index.tsx:29` — `STATUS_OPTIONS` array |
| TC-MOB-EC-020 | Admin | Active chip styled differently from inactive | P1 | 1. Tap ACTIVE chip. | ACTIVE chip gains `chipActive` style (`COLORS.primary` background, white text). Others revert to `chipInactive`. | Manual | `mobile/app/ecommerce/index.tsx:207-221` |
| TC-MOB-EC-021 | Admin | CREATED chip filters to CREATED records | P1 | 1. Tap CREATED chip. 2. Observe list. | Only CREATED status records shown. | E2E | `mobile/app/ecommerce/index.tsx:52-53` — `status: statusFilter === 'ALL' ? undefined : statusFilter` |
| TC-MOB-EC-022 | Admin | DISPATCHED chip shows dispatched records | P1 | 1. Tap DISPATCHED chip. | Only `EC-DISPATCHED-01` class items shown. | Manual | Same filter logic |
| TC-MOB-EC-023 | Admin | ALL chip restores full list after filtering | P1 | 1. Tap CLOSED chip. 2. Tap ALL. | Full list (all statuses) restored. | Manual | `statusFilter='ALL'` → `status: undefined` |

---

## Section 26.5 — List: infinite scroll + pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-024 | Admin | First page loads PAGE_SIZE=20 records max | P2 | 1. Seed >20 e-commerce records. 2. Open list. | At most 20 items visible initially. | API | `mobile/app/ecommerce/index.tsx:30` — `PAGE_SIZE = 20`; `initialPageParam: 1` |
| TC-MOB-EC-025 | Admin | Scrolling to 40% threshold triggers next page | P2 | 1. Load list with >20 records. 2. Scroll near bottom. | Additional items load; spinner in footer during fetch. | E2E | `mobile/app/ecommerce/index.tsx:243-244` — `onEndReachedThreshold={0.4}` |
| TC-MOB-EC-026 | Admin | "End of list" footer shown when all pages fetched | P2 | 1. Scroll to end of full dataset. | Footer text "End of list" appears. No spinner. | Manual | `mobile/app/ecommerce/index.tsx:152-156` — `!query.hasNextPage && items.length > 0` |
| TC-MOB-EC-027 | Admin | Pagination spinner shown during fetch | P2 | 1. Trigger next page on slow connection. | Small `<Spinner size="small">` in list footer. | Manual | `mobile/app/ecommerce/index.tsx:145-149` — `query.isFetchingNextPage` |

---

## Section 26.6 — List: pull-to-refresh + loading + empty state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-028 | Admin | Full-screen spinner on initial load | P1 | 1. Clear cache. 2. Open E-commerce list. | `<Spinner>` centered while `query.isLoading && items.length === 0`. | Manual | `mobile/app/ecommerce/index.tsx:227-229` |
| TC-MOB-EC-029 | Admin | Empty state shows cart-outline icon + "No e-commerce records" + "Records will appear once created." | P1 | 1. Ensure no records exist. 2. Open list. | `EmptyState icon="cart-outline"` with title "No e-commerce records" and message "Records will appear once created." | Manual | `mobile/app/ecommerce/index.tsx:231-235` — distinct from samples which uses `flask-outline` |
| TC-MOB-EC-030 | Admin | Pull-to-refresh triggers refetch | P1 | 1. Open list. 2. Pull down. | `RefreshControl` activates; new data fetched; list updated. | E2E | `mobile/app/ecommerce/index.tsx:248-250` — `onRefresh={() => query.refetch()}` |
| TC-MOB-EC-031 | Admin | Empty state after chip filter yields no results | P2 | 1. Tap DISPATCHED chip on DB with no dispatched records. | Empty state appears while DISPATCHED chip remains selected. | Manual | Same empty-state path; `status=DISPATCHED` returns empty array |

---

## Section 26.7 — List: FAB role gate

FAB uses `RoleGate allow={['Admin','Supervisor']}` — Warehouse Operator and Dispatch Operator are BOTH excluded. FAB background is hardcoded `'#7C3AED'` (purple), NOT `COLORS.primary`. `[?]30`

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-032 | Admin | Admin sees purple FAB on E-commerce list | P0 | 1. Login Admin. 2. Open E-commerce list. | Floating "+" button visible bottom-right with purple background. | E2E | `mobile/app/ecommerce/index.tsx:258-266` — `RoleGate allow={['Admin','Supervisor']}` + `fab.backgroundColor: '#7C3AED'` |
| TC-MOB-EC-033 | Supervisor | Supervisor sees purple FAB | P0 | 1. Login Supervisor. 2. Open E-commerce list. | FAB visible with purple background. | E2E | Same gate; same hardcoded colour |
| TC-MOB-EC-034 | Warehouse Operator | Warehouse Op does NOT see FAB | P0 | 1. Login Warehouse Op. 2. Open E-commerce list. | No FAB rendered. No "+" button. No fallback. | E2E | `mobile/app/ecommerce/index.tsx:258` — Warehouse Op excluded |
| TC-MOB-EC-035 | Dispatch Operator | Dispatch Op does NOT see FAB | P0 | 1. Login Dispatch Op. 2. Open E-commerce list. | No FAB rendered. | E2E | `mobile/app/ecommerce/index.tsx:258` — Dispatch Op excluded; `RoleGate fallback` is `null` by default |

### Maestro flows for Section 26.7

```yaml
# mobile/.maestro/ecommerce/ec-list-dispatch-no-fab.yaml
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
- tapOn: "E-commerce"
- waitForAnimationToEnd
- assertVisible: "E-commerce"
- assertNotVisible:
    id: "fab-create-ecommerce"
```

---

## Section 26.8 — Create screen: role gate

Create screen is wrapped in `RoleGate allow={['Admin','Supervisor']} fallback={<DeniedView/>}` at the module-export level (`EcommerceCreateScreenExport`). Warehouse and Dispatch Operators see a `DeniedView` with lock icon and e-commerce-specific denial message.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-036 | Admin | Admin can access Create E-commerce Record screen | P0 | 1. Login Admin. 2. Tap FAB. | "Create E-commerce Record" screen loads with form fields visible. | E2E | `mobile/app/ecommerce/create.tsx:184` — `Stack.Screen title='Create E-commerce Record'`; `create.tsx:379-384` — `RoleGate allow={['Admin','Supervisor']}` |
| TC-MOB-EC-037 | Supervisor | Supervisor can access Create screen | P0 | 1. Login Supervisor. 2. Tap FAB. | Form loads normally. | E2E | Same gate |
| TC-MOB-EC-038 | Warehouse Operator | Warehouse Op navigating to `/ecommerce/create` sees DeniedView | P0 | 1. Login Warehouse Op. 2. Navigate directly to `/ecommerce/create`. | `DeniedView` shown: `lock-closed-outline` icon, "Not authorized", "You don't have permission to create e-commerce records." | E2E | `mobile/app/ecommerce/create.tsx:32-42` — `DeniedView` component; `create.tsx:381` — fallback; denial message `create.tsx:38` |
| TC-MOB-EC-039 | Dispatch Operator | Dispatch Op navigating to `/ecommerce/create` sees DeniedView | P0 | 1. Login Dispatch Op. 2. Navigate directly to `/ecommerce/create`. | Same `DeniedView` rendered with e-commerce-specific text. | E2E | Same gate; Dispatch Op excluded; message differs from samples (`create.tsx:38`) |

### Maestro flows for Section 26.8

```yaml
# mobile/.maestro/ecommerce/ec-create-denied-warehouse.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
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
- openLink: "binnyinventory://ecommerce/create"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You don't have permission to create e-commerce records."
- assertNotVisible: "Name *"
```

---

## Section 26.9 — Create: Name field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-040 | Admin | Name field shows required asterisk | P1 | 1. Open Create E-commerce Record. 2. Observe Name label. | Label reads "Name *" (asterisk present). | Manual | `mobile/app/ecommerce/create.tsx:190` — `<Text>Name *</Text>` |
| TC-MOB-EC-041 | Admin | Name placeholder text correct | P2 | 1. Observe empty Name field. | Placeholder "e.g. Amazon Spring Sale 2026" visible. | Manual | `mobile/app/ecommerce/create.tsx:195` |
| TC-MOB-EC-042 | Admin | Empty name blocks submit with "Name is required." alert | P0 | 1. Open Create. 2. Scan 1 box. 3. Leave Name empty. 4. Tap submit. | `Alert.alert('Validation', 'Name is required.')` shown. No API call. | E2E | `mobile/app/ecommerce/create.tsx:158-161` — `!name.trim()` check |
| TC-MOB-EC-043 | Admin | Whitespace-only name treated as empty | P1 | 1. Type "   " in Name. 2. Scan 1 box. 3. Submit. | Same "Name is required." alert. | Manual | `mobile/app/ecommerce/create.tsx:158` — `!name.trim()` |

---

## Section 26.10 — Create: Marketplace field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-044 | Admin | Marketplace label shows "(optional)" | P2 | 1. Open Create. 2. Observe Marketplace label. | Label reads "Marketplace (optional)". | Manual | `mobile/app/ecommerce/create.tsx:201` |
| TC-MOB-EC-045 | Admin | Marketplace placeholder shows example values | P2 | 1. Observe empty Marketplace field. | Placeholder "e.g. Amazon, Flipkart, Meesho" visible. | Manual | `mobile/app/ecommerce/create.tsx:206` |
| TC-MOB-EC-046 | Admin | Marketplace input has autoCapitalize="words" | P2 | 1. Open Create. 2. Tap Marketplace field. 3. Type "amazon". | First letter of each word auto-capitalised on iOS/Android. | Manual | `mobile/app/ecommerce/create.tsx:209` — `autoCapitalize="words"` |
| TC-MOB-EC-047 | Admin | Leaving Marketplace empty submits null to API | P1 | 1. Fill Name + scan 1 box. 2. Leave Marketplace empty. 3. Submit. | API payload has `marketplace: null`. Record created. | API | `mobile/app/ecommerce/create.tsx:168` — `marketplace: marketplace.trim() || null` |

---

## Section 26.11 — Create: Order Reference field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-048 | Admin | Order Reference label shows "(optional)" | P2 | 1. Open Create. 2. Observe Order Reference label. | Label reads "Order Reference (optional)". | Manual | `mobile/app/ecommerce/create.tsx:213` |
| TC-MOB-EC-049 | Admin | Order Reference placeholder shows example | P2 | 1. Observe empty Order Reference field. | Placeholder "e.g. ORD-12345" visible. | Manual | `mobile/app/ecommerce/create.tsx:218` |
| TC-MOB-EC-050 | Admin | Order Reference has autoCapitalize="none" | P2 | 1. Tap Order Reference field. 2. Type lowercase. | Input does NOT auto-capitalise. | Manual | `mobile/app/ecommerce/create.tsx:221` — `autoCapitalize="none"` |
| TC-MOB-EC-051 | Admin | Leaving Order Reference empty submits null to API | P1 | 1. Fill Name + scan 1 box. 2. Leave Order Reference empty. 3. Submit. | API payload has `order_reference: null`. Record created. | API | `mobile/app/ecommerce/create.tsx:170` — `order_reference: orderReference.trim() || null` |

---

## Section 26.12 — Create: Listing SKU field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-052 | Admin | Listing SKU label shows "(optional)" | P2 | 1. Open Create. 2. Observe Listing SKU label. | Label reads "Listing SKU (optional)". | Manual | `mobile/app/ecommerce/create.tsx:225` |
| TC-MOB-EC-053 | Admin | Listing SKU placeholder shows example | P2 | 1. Observe empty Listing SKU field. | Placeholder "e.g. BNY-AMZ-001" visible. | Manual | `mobile/app/ecommerce/create.tsx:229` |
| TC-MOB-EC-054 | Admin | Listing SKU has autoCapitalize="characters" | P2 | 1. Tap Listing SKU field. 2. Type "bny-amz-001". | Input auto-capitalises all characters. | Manual | `mobile/app/ecommerce/create.tsx:233` — `autoCapitalize="characters"` |
| TC-MOB-EC-055 | Admin | Leaving Listing SKU empty submits null to API | P1 | 1. Fill Name + scan 1 box. 2. Leave Listing SKU empty. 3. Submit. | API payload has `listing_sku: null`. Record created. | API | `mobile/app/ecommerce/create.tsx:171` — `listing_sku: listingSku.trim() || null` |

---

## Section 26.13 — Create: Mapped Date field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-056 | Admin | Mapped Date defaults to today's ISO date on screen open | P1 | 1. Open Create. 2. Observe Mapped Date field. | Field pre-populated with today's date in `YYYY-MM-DD` format. | Manual | `mobile/app/ecommerce/create.tsx:54-56` — `useState(new Date().toISOString().split('T')[0])` |
| TC-MOB-EC-057 | Admin | Mapped Date placeholder is "YYYY-MM-DD" | P2 | 1. Clear Mapped Date field. 2. Observe. | Placeholder "YYYY-MM-DD" visible when field empty. | Manual | `mobile/app/ecommerce/create.tsx:243` |
| TC-MOB-EC-058 | Admin | Mapped Date keyboard type is numbers-and-punctuation (no date picker) | P2 | 1. Tap Mapped Date field. | Numeric/punctuation keyboard appears. No date picker modal. Known UX gap `[?]32`. | Manual | `mobile/app/ecommerce/create.tsx:246` — `keyboardType="numbers-and-punctuation"` |
| TC-MOB-EC-059 | Admin | Clearing Mapped Date submits null to API | P1 | 1. Clear Mapped Date. 2. Fill Name + scan 1 box. 3. Submit. | API payload has `mapped_date: null`. Record created. | API | `mobile/app/ecommerce/create.tsx:172` — `mapped_date: mappedDate || null` |

---

## Section 26.14 — Create: Notes field

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-060 | Admin | Notes label shows "(optional)" | P2 | 1. Open Create. 2. Observe Notes label. | Label reads "Notes (optional)". | Manual | `mobile/app/ecommerce/create.tsx:250` |
| TC-MOB-EC-061 | Admin | Notes is multiline with 3 rows | P2 | 1. Observe Notes field. | Field taller than single-line inputs; accepts multi-line text. | Manual | `mobile/app/ecommerce/create.tsx:257-259` — `multiline numberOfLines={3} textAlignVertical="top"` |
| TC-MOB-EC-062 | Admin | Leaving Notes empty submits null to API | P1 | 1. Fill Name + scan 1 box. 2. Leave Notes empty. 3. Submit. | API payload has `notes: null`. Record created. | API | `mobile/app/ecommerce/create.tsx:173` — `notes: notes.trim() || null` |

---

## Section 26.15 — Create: Scan section — modal + manual entry

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-063 | Admin | Scan section header shows "Scanned Items (N boxes)" | P1 | 1. Open Create. 2. Observe scan card header. | Header text "Scanned Items (0 boxes)" (count increments as boxes added). | Manual | `mobile/app/ecommerce/create.tsx:267-270` — `Scanned Items (${scannedBarcodes.length} boxes)` |
| TC-MOB-EC-064 | Admin | "Scan Child Box" button opens BarcodeScanner modal | P1 | 1. Tap "Scan Child Box". | `BarcodeScanner` modal opens. `scannerOpen=true`. | E2E | `mobile/app/ecommerce/create.tsx:278-285` — `setScannerOpen(true)` on press; `expectedType="child"` |
| TC-MOB-EC-065 | Admin | Scanner modal closes and addBarcode called on scan | P1 | 1. Open scanner. 2. Scan a valid barcode. | Modal closes (`setScannerOpen(false)`); `addBarcode(raw)` called with raw value. | Manual | `mobile/app/ecommerce/create.tsx:121-124` — `handleScan` |
| TC-MOB-EC-066 | Admin | Manual entry input has autoCapitalize="characters" and returnKeyType="done" | P2 | 1. Tap manual input. 2. Observe keyboard. | Keyboard is characters-capitalised. "Done" return key visible. | Manual | `mobile/app/ecommerce/create.tsx:296-297` |
| TC-MOB-EC-067 | Admin | Submitting manual entry via keyboard "Done" key triggers add | P1 | 1. Type valid barcode in manual input. 2. Press Done. | `onSubmitEditing → handleManualAdd` fires; barcode added to list. Input cleared. | E2E | `mobile/app/ecommerce/create.tsx:298` — `onSubmitEditing={handleManualAdd}` |
| TC-MOB-EC-068 | Admin | Tapping "Add" button next to manual input triggers add | P1 | 1. Type valid barcode. 2. Tap Add button. | `handleManualAdd` fires; barcode added. Input cleared. | E2E | `mobile/app/ecommerce/create.tsx:300-308` — `onPress={handleManualAdd}`; `disabled={!manualInput.trim()}` |
| TC-MOB-EC-069 | Admin | "Add" button disabled when manual input empty | P2 | 1. Leave manual input empty. 2. Observe Add button. | Add button is disabled (non-interactive). | Manual | `mobile/app/ecommerce/create.tsx:304` — `disabled={!manualInput.trim()}` |
| TC-MOB-EC-070 | Admin | Empty scan list shows EmptyState (cube-outline icon) | P1 | 1. Open Create. 2. Observe scan card (no boxes scanned). | `EmptyState icon="cube-outline"` with title "No boxes scanned yet" and message "Tap Scan Child Box or enter a barcode manually." | Manual | `mobile/app/ecommerce/create.tsx:311-316` |

---

## Section 26.16 — Create: Scan flow — optimistic add + status validation + rollback

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-071 | Admin | Scanning FREE box: optimistic add then detail populated | P0 | 1. Scan `CB-FREE-01`. | Box immediately appears in list (optimistic). After API resolves, meta row shows article·colour·size·MRP. No alert. | E2E | `mobile/app/ecommerce/create.tsx:95-111` — optimistic `setScannedBarcodes` then `childBoxService.getByBarcode` |
| TC-MOB-EC-072 | Admin | Scanning GENERATED box is accepted (same as FREE) | P1 | 1. Scan `CB-GENERATED-01`. | GENERATED status box accepted; appears in list with details. | Manual | `mobile/app/ecommerce/create.tsx:101` — `box.status !== 'FREE' && box.status !== 'GENERATED'` — GENERATED accepted |
| TC-MOB-EC-073 | Admin | Scanning PACKED box rejected — optimistic row removed + alert | P1 | 1. Scan `CB-PACKED-01`. | Box momentarily appears then removed from list. `Alert 'Box not available' 'Box {barcode} is PACKED — only FREE or GENERATED boxes can be added.'` shown. | E2E | `mobile/app/ecommerce/create.tsx:102-108` — invalid status removal path |
| TC-MOB-EC-074 | Admin | Scanning SAMPLE box rejected with alert | P1 | 1. Scan `CB-SAMPLE-01`. | Alert shown: "Box {barcode} is SAMPLE — only FREE or GENERATED boxes can be added." Row removed. | Manual | Same removal path as PACKED |
| TC-MOB-EC-075 | Admin | Scanning ECOMMERCE box rejected with alert | P1 | 1. Scan `CB-ECOMMERCE-01`. | Alert shown: "Box {barcode} is ECOMMERCE — only FREE or GENERATED boxes can be added." Row removed. | Manual | Same rejection logic |
| TC-MOB-EC-076 | Admin | API error (box not found) removes row and shows "Scan failed" alert | P1 | 1. Manually enter non-existent barcode. | Row removed. `Alert.alert('Scan failed', msg)` shown with server error message or "Box not found". | Manual | `mobile/app/ecommerce/create.tsx:112-116` — `catch` block |
| TC-MOB-EC-077 | Admin | "Validating…" button state while API call in-flight | P2 | 1. Scan on slow connection. | "Scan Child Box" button reads "Validating…" and is disabled during `validating=true`. | Manual | `mobile/app/ecommerce/create.tsx:279` — `title={validating ? 'Validating…' : 'Scan Child Box'}` |
| TC-MOB-EC-078 | Admin | Legacy `BINNY-EC-{uuid}` and `BINNY-CB-{uuid}` scan handled by parseQRCode | P2 | 1. [SKIP-POST-MIGRATION] Scan legacy `BINNY-CB-{uuid}` barcode. | `parseQRCode` returns `type: 'child'`; `id` set to normalised token. Box lookup proceeds normally. | Manual | `mobile/utils/index.ts:43-45` — legacy `BINNY-CB-` match; `[SKIP-POST-MIGRATION]` |

---

## Section 26.17 — Create: Dedupe + scanned-row rendering + trash

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-079 | Admin | Scanning already-scanned barcode shows "Already scanned" alert | P1 | 1. Scan `CB-FREE-01`. 2. Scan same barcode again. | `Alert.alert('Already scanned', '${barcode} is already in the list.')`. No duplicate row. | Manual | `mobile/app/ecommerce/create.tsx:90-93` — `scannedBarcodes.includes(barcode)` dedupe check |
| TC-MOB-EC-080 | Admin | Scanned rows numbered 1./2./3. with index prefix | P1 | 1. Scan 3 boxes. 2. Observe list. | Each row prefixed with `1.`, `2.`, `3.` in small grey text. | Manual | `mobile/app/ecommerce/create.tsx:326` — `<Text>{idx + 1}.</Text>` |
| TC-MOB-EC-081 | Admin | Scanned barcode rendered in monospace font | P1 | 1. Scan `CB-FREE-01`. 2. Observe barcode text in row. | Barcode shown in monospace (`Menlo` on iOS, `monospace` on Android). | Manual | `mobile/app/ecommerce/create.tsx:515-519` — `scannedBarcode` style with `fontFamily` |
| TC-MOB-EC-082 | Admin | Scanned row shows "Loading…" while API in-flight then detail on success | P1 | 1. Scan box on slow connection. 2. Observe row during load. | Row shows barcode + "Loading…" italic text until detail resolves, then shows `article_name · colour · size · ₹MRP`. | Manual | `mobile/app/ecommerce/create.tsx:331-337` — `detail ? <meta> : <Loading…>` |
| TC-MOB-EC-083 | Admin | Per-row trash icon removes scanned box | P1 | 1. Scan 2 boxes. 2. Tap trash on first row. | First box removed from `scannedBarcodes` and `boxDetails`. Second row renumbers to `1.`. | E2E | `mobile/app/ecommerce/create.tsx:339-347` — `handleRemove(barcode)`; `trash-outline` icon |

---

## Section 26.18 — Create: Clear All button

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-084 | Admin | "Clear All" button visible only when boxes scanned | P1 | 1. Open Create. 2. Observe scan card header. | "Clear All" link absent initially; appears after first scan. | Manual | `mobile/app/ecommerce/create.tsx:270-273` — `scannedBarcodes.length > 0 && (<TouchableOpacity…>)` |
| TC-MOB-EC-085 | Admin | "Clear All" shows confirmation alert | P1 | 1. Scan 2 boxes. 2. Tap "Clear All". | `Alert.alert('Clear All', 'Remove all scanned boxes?', [Cancel, Clear])` appears. | Manual | `mobile/app/ecommerce/create.tsx:143-153` — `handleClearAll` |
| TC-MOB-EC-086 | Admin | Confirming Clear All removes all rows and shows EmptyState | P1 | 1. Scan 2 boxes. 2. Tap "Clear All". 3. Confirm "Clear". | `scannedBarcodes` and `boxDetails` both cleared. EmptyState reappears. "Clear All" link disappears. | E2E | `mobile/app/ecommerce/create.tsx:148-151` — destructive onPress sets both state arrays to empty |
| TC-MOB-EC-087 | Admin | Cancelling Clear All retains scanned boxes | P1 | 1. Scan 2 boxes. 2. Tap "Clear All". 3. Tap "Cancel". | Alert dismissed. All rows remain. | Manual | `mobile/app/ecommerce/create.tsx:144` — `style: 'cancel'` button |
| TC-MOB-EC-088 | Admin | "Clear" button has destructive style in alert | P2 | 1. Open Clear All alert. 2. Observe button styles. | "Clear" button uses `style: 'destructive'` (red text on iOS). | Manual | `mobile/app/ecommerce/create.tsx:145-151` — `style: 'destructive'` on Clear action |

---

## Section 26.19 — Create: Submit validation + mutation + router.replace

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-089 | Admin | Submit blocked (name empty + boxes scanned) | P0 | 1. Scan 1 box. 2. Leave Name empty. 3. Tap submit button. | Alert "Validation" / "Name is required." No API call. | E2E | `mobile/app/ecommerce/create.tsx:158-161` |
| TC-MOB-EC-090 | Admin | Submit blocked (name filled + no boxes) | P0 | 1. Fill Name. 2. Scan 0 boxes. 3. Tap submit. | Alert "Validation" / "Scan at least one child box before creating the record." No API call. | E2E | `mobile/app/ecommerce/create.tsx:162-165` — e-commerce-specific message vs samples |
| TC-MOB-EC-091 | Admin | Submit button label shows "Create Record (N boxes)" | P1 | 1. Scan 2 boxes. 2. Observe submit button. | Button reads "Create Record (2 boxes)". | Manual | `mobile/app/ecommerce/create.tsx:355` — `title={\`Create Record (${scannedBarcodes.length} boxes)\`}` |
| TC-MOB-EC-092 | Admin | Submit button disabled when name empty or boxes=0 | P1 | 1. Open Create. 2. Observe submit button in default state. | Button disabled: `disabled={scannedBarcodes.length === 0 \|\| !name.trim() \|\| createMutation.isPending}`. | Manual | `mobile/app/ecommerce/create.tsx:359` |
| TC-MOB-EC-093 | Admin | Happy path: valid name + 1 FREE box → record created → success toast → navigate to detail | P0 | 1. Fill Name "Test EC Record". 2. Scan `CB-FREE-01`. 3. Tap submit. | Success message "E-commerce record created successfully." shown. `router.replace('/ecommerce/{new_id}')` navigates to detail. | E2E | `mobile/app/ecommerce/create.tsx:70` — `successMessage`; `create.tsx:80` — `router.replace` |
| TC-MOB-EC-094 | Admin | Submit mutation invalidates ecommerce + childBoxes + inventory-summary + inventory-hierarchy + dashboard-stats | P1 | 1. Create a record. 2. Observe cache invalidations. | Query keys `['ecommerce']`, `['childBoxes']`, `['inventory-summary']`, `['inventory-hierarchy']`, `['dashboard-stats']` all invalidated. | API | `mobile/app/ecommerce/create.tsx:71-77` — `invalidateKeys` list |
| TC-MOB-EC-095 | Admin | Success haptic fires on create | P2 | 1. Create record on physical device. | Haptic notification (success) fires. | Manual | `mobile/app/ecommerce/create.tsx:79` — `Haptics.notificationAsync(Success)` |

### Maestro flows for Section 26.19

```yaml
# mobile/.maestro/ecommerce/ec-create-happy-path.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  BOX_BARCODE: "CB1A2B3C"
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
- tapOn: "E-commerce"
- waitForAnimationToEnd
- tapOn:
    id: "fab-create-ecommerce"
- waitForAnimationToEnd
- tapOn:
    text: "Name *"
- inputText: "Maestro EC Test"
- tapOn:
    text: "Enter barcode manually"
- inputText: "${BOX_BARCODE}"
- tapOn: "Add"
- waitForAnimationToEnd
- tapOn:
    text: "Create Record"
- waitForAnimationToEnd
- assertVisible: "E-commerce record created successfully."
- assertVisible: "E-commerce Details"
```

---

## Section 26.20 — Detail: data load + chained queries + not-found state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-096 | Admin | Detail screen shows full-screen spinner while loading | P1 | 1. Navigate to detail of `EC-ACTIVE-FULL`. 2. Observe loading state. | `<Spinner>` centered while `recordQ.isLoading && !record`. Title bar "E-commerce Details". | Manual | `mobile/app/ecommerce/[id].tsx:260-268` — loading branch; `Stack.Screen title='E-commerce Details'` |
| TC-MOB-EC-097 | Admin | Assortment query is chained (enabled only after record loads) | P1 | 1. Open detail. 2. Monitor queries. | `assortmentQ` fires only after `recordQ.data` is set. No assortment call during record loading. | API | `mobile/app/ecommerce/[id].tsx:123-127` — `enabled: !!id && !!recordQ.data` |
| TC-MOB-EC-098 | Admin | Not-found state shows cart-outline icon + "Record not found" + correct message | P1 | 1. Navigate to `/ecommerce/nonexistent-id`. | `EmptyState icon="cart-outline"` with title "Record not found" and message "This e-commerce record may have been removed." | Manual | `mobile/app/ecommerce/[id].tsx:271-283` — not-found branch; `cart-outline` vs samples' `flask-outline` |
| TC-MOB-EC-099 | Admin | Pull-to-refresh refetches both record and assortment queries | P1 | 1. Open detail. 2. Pull down. | Both `recordQ.refetch()` and `assortmentQ.refetch()` called via `Promise.all`. | Manual | `mobile/app/ecommerce/[id].tsx:139-143` — `onRefresh` |

---

## Section 26.21 — Detail: Header card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-100 | Admin | Header shows record name (up to 2 lines) + status badge | P1 | 1. Open `EC-ACTIVE-FULL`. 2. Observe header card. | Record name shown in large bold text (`numberOfLines={2}`). Status badge "ACTIVE" using `ECOMMERCE_STATUS_COLORS`. | Manual | `mobile/app/ecommerce/[id].tsx:326-329` — `recordName` style; `Badge color={ECOMMERCE_STATUS_COLORS[r.status]}` |
| TC-MOB-EC-101 | Admin | Header shows barcode in monospace | P1 | 1. Observe header card. | `ecommerce_barcode` in monospace font below name. | Manual | `mobile/app/ecommerce/[id].tsx:332-335` — `barcodeText` style with `fontFamily` |
| TC-MOB-EC-102 | Admin | Header meta shows "{N} boxes  ·  Marketplace: {marketplace}" when marketplace set | P1 | 1. Open `EC-ACTIVE-FULL` (marketplace="Amazon"). 2. Read header meta line. | "3 boxes  ·  Marketplace: Amazon" shown. | Manual | `mobile/app/ecommerce/[id].tsx:336-339` — `r.marketplace ? '  ·  Marketplace: ${r.marketplace}' : ''` |
| TC-MOB-EC-103 | Admin | Header meta shows only "{N} boxes" when marketplace null | P1 | 1. Open `EC-ACTIVE-NULLFIELDS` (marketplace=null). 2. Read meta line. | "2 boxes" with no marketplace suffix. | Manual | `mobile/app/ecommerce/[id].tsx:338` — empty string when marketplace null |

---

## Section 26.22 — Detail: Timeline card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-104 | Admin | Timeline always shows "Created" row | P1 | 1. Open any record detail. 2. Observe timeline. | "Created" label + formatted date always first row. | Manual | `mobile/app/ecommerce/[id].tsx:344` — unconditional `TimelineRow` |
| TC-MOB-EC-105 | Admin | "Mapped Date" timeline row shown only when mapped_date set | P1 | 1. Open `EC-ACTIVE-FULL` (mapped_date set). 2. Open `EC-ACTIVE-NULLFIELDS` (mapped_date=null). | Full record shows "Mapped Date" row. Null-fields record does not. | Manual | `mobile/app/ecommerce/[id].tsx:345-347` — `!!r.mapped_date && (...)` |
| TC-MOB-EC-106 | Admin | "Closed" timeline row shown only when closed_at set | P1 | 1. Open `EC-CLOSED-01` (closed_at set). | "Closed" row visible with formatted date. | Manual | `mobile/app/ecommerce/[id].tsx:348-350` |
| TC-MOB-EC-107 | Admin | "Dispatched" timeline row shown only when dispatched_at set | P1 | 1. Open `EC-DISPATCHED-01`. | "Dispatched" row visible. | Manual | `mobile/app/ecommerce/[id].tsx:351-353` |
| TC-MOB-EC-108 | Admin | "Creator" timeline row shown when creator object present | P2 | 1. Open record with creator. | "Creator" row shows `r.creator.name`. | Manual | `mobile/app/ecommerce/[id].tsx:354-356` — `!!r.creator` guard |
| TC-MOB-EC-109 | Admin | "Marketplace" timeline row shown when marketplace set | P1 | 1. Open `EC-ACTIVE-FULL`. | "Marketplace" row shows "Amazon". Also visible in header meta — intentional duplication `[?]29`. | Manual | `mobile/app/ecommerce/[id].tsx:357-359` — `!!r.marketplace` guard |
| TC-MOB-EC-110 | Admin | "Order Ref" timeline row shown when order_reference set | P1 | 1. Open `EC-ACTIVE-FULL`. | "Order Ref" row shows "ORD-12345". | Manual | `mobile/app/ecommerce/[id].tsx:360-362` |
| TC-MOB-EC-111 | Admin | "Listing SKU" timeline row shown when listing_sku set | P1 | 1. Open `EC-ACTIVE-FULL`. | "Listing SKU" row shows "BNY-AMZ-001". | Manual | `mobile/app/ecommerce/[id].tsx:363-365` |
| TC-MOB-EC-112 | Admin | Timeline rows absent when corresponding fields null | P1 | 1. Open `EC-ACTIVE-NULLFIELDS` (all optional fields null). | Only "Created" row visible. No Mapped Date / Marketplace / Order Ref / Listing SKU rows. | Manual | All `!!field` guards in `[id].tsx:345-365` |

---

## Section 26.23 — Detail: Action-bar status × role matrix

Per-button gating (NOT outer `RoleGate`). Dispatch Op can see Dispatch button on CLOSED records. DISPATCHED status shows info text instead of action bar.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-113 | Admin | Admin on ACTIVE record: sees Add Box + Close Record + Full Unpack | P0 | 1. Login Admin. 2. Open `EC-ACTIVE-FULL`. 3. Observe action bar. | Three buttons: "Add Box", "Close Record", "Full Unpack". No Dispatch. | Manual | `mobile/app/ecommerce/[id].tsx:292-306` — derived flags; `canAddBox=true`, `canClose=true`, `canUnpack=true`, `dispatchVisible=false` for ACTIVE |
| TC-MOB-EC-114 | Admin | Admin on CREATED record: sees Add Box + Full Unpack (no Close) | P0 | 1. Open `EC-CREATED-01`. | "Add Box" and "Full Unpack" visible. "Close Record" absent (canClose requires ACTIVE). | Manual | `[id].tsx:298` — `canClose = isManager && r.status === 'ACTIVE'` |
| TC-MOB-EC-115 | Admin | Admin on CLOSED record: sees Full Unpack + Dispatch | P0 | 1. Open `EC-CLOSED-01`. | "Full Unpack" and "Dispatch" visible. No Add Box, no Close Record. | Manual | `[id].tsx:295` — `canAddBox`: CLOSED excluded; `[id].tsx:306` — `dispatchVisible = canDispatch && CLOSED` |
| TC-MOB-EC-116 | Admin | Admin on DISPATCHED record: sees info text only | P0 | 1. Open `EC-DISPATCHED-01`. | "This record has been dispatched. No actions available." — no buttons. | Manual | `mobile/app/ecommerce/[id].tsx:369-372` — DISPATCHED branch |
| TC-MOB-EC-117 | Supervisor | Supervisor on ACTIVE: same buttons as Admin | P1 | 1. Login Supervisor. 2. Open `EC-ACTIVE-FULL`. | Same 3-button layout. | Manual | `isManager = useHasRole(['Admin','Supervisor'])` — `[id].tsx:113` |
| TC-MOB-EC-118 | Warehouse Operator | Warehouse Op on ACTIVE record: no action buttons | P0 | 1. Login Warehouse Op. 2. Open `EC-ACTIVE-FULL`. | No Add Box, no Close, no Full Unpack, no Dispatch buttons visible. | Manual | `[id].tsx:113-114` — `isManager=false`, `canDispatch=false` for Warehouse Op |
| TC-MOB-EC-119 | Dispatch Operator | Dispatch Op on CLOSED record: sees Dispatch button | P0 | 1. Login Dispatch Op. 2. Open `EC-CLOSED-01`. | "Dispatch" button visible. No Add Box, no Close, no Full Unpack. | Manual | `mobile/app/ecommerce/[id].tsx:114` — `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])`; `dispatchVisible=true` for CLOSED. `[?]34` |
| TC-MOB-EC-120 | Dispatch Operator | Dispatch Op on ACTIVE record: no buttons | P0 | 1. Login Dispatch Op. 2. Open `EC-ACTIVE-FULL`. | No buttons (`dispatchVisible=false` for ACTIVE, `isManager=false`). | Manual | `[id].tsx:306` — `dispatchVisible = canDispatch && r.status === 'CLOSED'` |
| TC-MOB-EC-121 | Dispatch Operator | Dispatch Op on DISPATCHED record: info text only | P1 | 1. Login Dispatch Op. 2. Open `EC-DISPATCHED-01`. | Info text rendered, no buttons. Same as Admin. | Manual | DISPATCHED branch is unconditional on role |

---

## Section 26.24 — Detail: Add Box inline scan

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-122 | Admin | Tapping "Add Box" toggles inline section open | P1 | 1. Open `EC-ACTIVE-FULL`. 2. Tap "Add Box". | Inline card appears with "Add Child Box" heading, Scan button, and manual input. Button label changes to "Hide Add Box". | E2E | `mobile/app/ecommerce/[id].tsx:377-390` — `addBoxOpen` toggle |
| TC-MOB-EC-123 | Admin | Tapping "Hide Add Box" collapses inline section | P1 | 1. Toggle open. 2. Tap "Hide Add Box". | Inline scan section disappears. | E2E | Same toggle |
| TC-MOB-EC-124 | Admin | "Scan Child Box" button opens BarcodeScanner modal | P1 | 1. Open Add Box section. 2. Tap "Scan Child Box". | Scanner modal opens. | Manual | `mobile/app/ecommerce/[id].tsx:453-460` |
| TC-MOB-EC-125 | Admin | Manual barcode input has autoCapitalize="characters" | P2 | 1. Tap manual input. | Characters-capitalised keyboard. | Manual | `mobile/app/ecommerce/[id].tsx:469` — `autoCapitalize="characters"` |
| TC-MOB-EC-126 | Admin | Adding FREE box (pessimistic): validates first → API call → success alert → refetch | P0 | 1. Enter `CB-FREE-01` barcode manually. 2. Tap Add. | `childBoxService.getByBarcode` called first. If FREE → `ecommerceService.addBox({child_box_id, ecommerce_record_id})` called. Alert "Success" "Box {barcode} added to record." Queries refetched. | E2E | `mobile/app/ecommerce/[id].tsx:156-167` — pessimistic flow; `ecommerce_record_id` payload key (not `sample_record_id`) |
| TC-MOB-EC-127 | Admin | Adding GENERATED box accepted | P1 | 1. Enter `CB-GENERATED-01`. 2. Tap Add. | GENERATED status accepted; record updated. | Manual | `[id].tsx:157-161` — same `FREE or GENERATED` guard |
| TC-MOB-EC-128 | Admin | Adding PACKED box rejected: "Box not available" alert | P1 | 1. Enter `CB-PACKED-01`. 2. Tap Add. | Alert "Box not available" with PACKED status message. No API mutation call. | Manual | `mobile/app/ecommerce/[id].tsx:157-162` |
| TC-MOB-EC-129 | Admin | "Adding…" button state while pessimistic in-flight | P2 | 1. Add on slow connection. | Button reads "Adding…" and disabled during `addingBox=true`. | Manual | `mobile/app/ecommerce/[id].tsx:455` — `addingBox ? 'Adding…' : 'Scan Child Box'` |

### Maestro flows for Section 26.24

```yaml
# mobile/.maestro/ecommerce/ec-detail-add-box.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  RECORD_ID: "REPLACE_WITH_ACTIVE_RECORD_ID"
  BOX_BARCODE: "CB1A2B3C"
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
- openLink: "binnyinventory://ecommerce/${RECORD_ID}"
- waitForAnimationToEnd
- tapOn: "Add Box"
- waitForAnimationToEnd
- tapOn:
    text: "Enter barcode manually"
- inputText: "${BOX_BARCODE}"
- tapOn: "Add"
- waitForAnimationToEnd
- assertVisible: "added to record"
```

---

## Section 26.25 — Detail: Close Record confirm + mutation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-130 | Admin | Close Record button visible only on ACTIVE (Admin/Supervisor) | P0 | 1. Login Admin. 2. Open `EC-ACTIVE-FULL`. | "Close Record" button present. Open `EC-CREATED-01` — absent. Open `EC-CLOSED-01` — absent. | Manual | `mobile/app/ecommerce/[id].tsx:298` — `canClose = isManager && r.status === 'ACTIVE'` |
| TC-MOB-EC-131 | Admin | Tapping Close Record shows confirmation alert | P0 | 1. Open `EC-ACTIVE-FULL`. 2. Tap "Close Record". | Alert title "Close Record?" body `'This will close "Amazon Spring Sale 2026" (3 boxes) and move it to closed status.'` | E2E | `mobile/app/ecommerce/[id].tsx:199-207` — `confirmClose()` |
| TC-MOB-EC-132 | Admin | Confirming close triggers mutation → success "Record closed successfully." | P0 | 1. Confirm close. | `ecommerceService.close(record.id)` called. Toast "Record closed successfully." Record status updates to CLOSED. | E2E | `mobile/app/ecommerce/[id].tsx:192` — `successMessage`; cache invalidated via `ECOMMERCE_INVALIDATE_KEYS` |
| TC-MOB-EC-133 | Admin | Cancelling close alert aborts mutation | P1 | 1. Tap Close Record. 2. Tap Cancel. | Alert dismissed. No mutation fired. Record unchanged. | Manual | Alert `style: 'cancel'` handler |
| TC-MOB-EC-134 | Supervisor | Supervisor can close ACTIVE record | P1 | 1. Login Supervisor. 2. Open `EC-ACTIVE-FULL`. 3. Tap Close Record. 4. Confirm. | Mutation fires. Record closed successfully. | Manual | `isManager` includes Supervisor |
| TC-MOB-EC-135 | Warehouse Operator | Warehouse Op does NOT see Close Record button | P0 | 1. Login Warehouse Op. 2. Open `EC-ACTIVE-FULL`. | No "Close Record" button. | Manual | `isManager=false` for Warehouse Op |

### Maestro flows for Section 26.25

```yaml
# mobile/.maestro/ecommerce/ec-detail-close-record.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  RECORD_ID: "REPLACE_WITH_ACTIVE_RECORD_ID"
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
- openLink: "binnyinventory://ecommerce/${RECORD_ID}"
- waitForAnimationToEnd
- tapOn: "Close Record"
- waitForAnimationToEnd
- tapOn: "Close"
- waitForAnimationToEnd
- assertVisible: "Record closed successfully."
```

---

## Section 26.26 — Detail: Full Unpack confirm + mutation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-136 | Admin | Full Unpack visible on CREATED/ACTIVE/CLOSED (Admin/Supervisor) | P0 | 1. Login Admin. 2. Open CREATED, ACTIVE, and CLOSED records in turn. | "Full Unpack" button present for all three statuses. Absent on DISPATCHED. | Manual | `mobile/app/ecommerce/[id].tsx:301-303` — `canUnpack = isManager && (CREATED|ACTIVE|CLOSED)` |
| TC-MOB-EC-137 | Admin | Tapping Full Unpack shows destructive confirmation alert | P0 | 1. Open `EC-ACTIVE-FULL` (3 boxes). 2. Tap Full Unpack. | Alert title "Full Unpack?" body `'This will release all 3 boxes from "Amazon Spring Sale 2026" back to FREE status. This cannot be undone.'` Unpack button style "destructive". | E2E | `mobile/app/ecommerce/[id].tsx:219-230` — `confirmUnpack()` |
| TC-MOB-EC-138 | Admin | Confirming unpack → "Record fully unpacked. All boxes returned to FREE." | P0 | 1. Confirm unpack. | `ecommerceService.fullUnpack(record.id)` called. Success message "Record fully unpacked. All boxes returned to FREE." | E2E | `mobile/app/ecommerce/[id].tsx:213` — `successMessage` |
| TC-MOB-EC-139 | Admin | Cancelling unpack alert aborts mutation | P1 | 1. Tap Full Unpack. 2. Tap Cancel. | No mutation. Record unchanged. | Manual | Cancel button in alert |
| TC-MOB-EC-140 | Warehouse Operator | Warehouse Op does NOT see Full Unpack button | P0 | 1. Login Warehouse Op. 2. Open `EC-ACTIVE-FULL`. | No "Full Unpack" button visible. | Manual | `isManager=false` → `canUnpack=false` |

---

## Section 26.27 — Detail: Remove individual Box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-141 | Admin | Trash icon visible per-row on CREATED/ACTIVE for Admin/Supervisor | P1 | 1. Login Admin. 2. Open `EC-ACTIVE-FULL` (child boxes visible). | Each child box row shows trash icon. | Manual | `mobile/app/ecommerce/[id].tsx:292` — `boxRemovable = isManager && (CREATED|ACTIVE)`; `ChildBoxRow` receives `canRemove=boxRemovable` |
| TC-MOB-EC-142 | Admin | Trash icon absent when CLOSED (Admin) | P1 | 1. Login Admin. 2. Open `EC-CLOSED-01`. | No trash icon on any child box row. | Manual | `[id].tsx:292` — CLOSED excluded from `boxRemovable` |
| TC-MOB-EC-143 | Admin | Tapping trash shows confirmation "Remove {barcode} from this record?" | P0 | 1. Open `EC-ACTIVE-FULL`. 2. Tap trash on first child box row. | Alert "Remove Box?" body "Remove {barcode} from this record?" with Cancel + destructive Remove. | Manual | `mobile/app/ecommerce/[id].tsx:244-256` — `confirmRemoveBox()` |
| TC-MOB-EC-144 | Admin | Confirming remove → "Box removed from record." | P0 | 1. Confirm remove. | `ecommerceService.removeBox({child_box_id, ecommerce_record_id})` called. Success "Box removed from record." ECOMMERCE_INVALIDATE_KEYS fires. | E2E | `mobile/app/ecommerce/[id].tsx:238` — `successMessage`; payload key `ecommerce_record_id` (not `sample_record_id`) |
| TC-MOB-EC-145 | Warehouse Operator | Warehouse Op does NOT see trash on any row | P0 | 1. Login Warehouse Op. 2. Open `EC-ACTIVE-FULL`. | No trash icons. | Manual | `isManager=false` → `boxRemovable=false` → `canRemove=false` passed to `ChildBoxRow` |
| TC-MOB-EC-146 | Dispatch Operator | Dispatch Op does NOT see trash on any row | P0 | 1. Login Dispatch Op. 2. Open `EC-ACTIVE-FULL`. | No trash icons. | Manual | Same: Dispatch Op not in `isManager` list |

---

## Section 26.28 — Detail: Dispatch button

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-147 | Admin | Admin sees Dispatch button on CLOSED record | P0 | 1. Login Admin. 2. Open `EC-CLOSED-01`. | "Dispatch" button visible. | Manual | `mobile/app/ecommerce/[id].tsx:306` — `dispatchVisible = canDispatch && r.status === 'CLOSED'` |
| TC-MOB-EC-148 | Supervisor | Supervisor sees Dispatch button on CLOSED record | P0 | 1. Login Supervisor. 2. Open `EC-CLOSED-01`. | "Dispatch" button visible. | Manual | Supervisor in `canDispatch` list |
| TC-MOB-EC-149 | Dispatch Operator | Dispatch Op sees Dispatch button on CLOSED record | P0 | 1. Login Dispatch Op. 2. Open `EC-CLOSED-01`. | "Dispatch" button visible. Per-button gate permits Dispatch Op here even though outer actions are manager-only. `[?]34` | E2E | `mobile/app/ecommerce/[id].tsx:114` — `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])` |
| TC-MOB-EC-150 | Dispatch Operator | Tapping Dispatch navigates to /dispatch/create (no record ID in route) | P1 | 1. Login Dispatch Op. 2. Open `EC-CLOSED-01`. 3. Tap Dispatch. | `router.push('/dispatch/create')` fires. No `ecommerce_id` query param. `[?]33` | Manual | `mobile/app/ecommerce/[id].tsx:443` — `router.push('/dispatch/create' as never)` |
| TC-MOB-EC-151 | Warehouse Operator | Warehouse Op does NOT see Dispatch button on CLOSED record | P0 | 1. Login Warehouse Op. 2. Open `EC-CLOSED-01`. | No Dispatch button. | Manual | Warehouse Op not in `canDispatch` list; `dispatchVisible=false` |
| TC-MOB-EC-152 | Admin | Dispatch button absent on ACTIVE record | P1 | 1. Login Admin. 2. Open `EC-ACTIVE-FULL`. | No Dispatch button. | Manual | `dispatchVisible = canDispatch && r.status === 'CLOSED'` — ACTIVE excluded |

### Maestro flows for Section 26.28

```yaml
# mobile/.maestro/ecommerce/ec-detail-dispatch-op-dispatch.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
  RECORD_ID: "REPLACE_WITH_CLOSED_RECORD_ID"
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
- openLink: "binnyinventory://ecommerce/${RECORD_ID}"
- waitForAnimationToEnd
- assertVisible: "Dispatch"
- tapOn: "Dispatch"
- waitForAnimationToEnd
- assertVisible: "Create Dispatch"
```

---

## Section 26.29 — Detail: DISPATCHED status info text + Assortment + Child Boxes collapsible

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-153 | Admin | DISPATCHED record shows info text "This record has been dispatched. No actions available." | P1 | 1. Login Admin. 2. Open `EC-DISPATCHED-01`. | Info text shown in italic style. No action buttons. | Manual | `mobile/app/ecommerce/[id].tsx:370-372` — `dispatchedNote` style |
| TC-MOB-EC-154 | Warehouse Operator | Warehouse Op on DISPATCHED: same info text, no actions | P1 | 1. Login Warehouse Op. 2. Open `EC-DISPATCHED-01`. | Same info text. | Manual | DISPATCHED branch is role-agnostic |
| TC-MOB-EC-155 | Admin | Assortment card shows spinner while loading | P1 | 1. Open detail on slow connection. 2. Observe Assortment card. | Inline `<Spinner size="small">` while `assortmentQ.isLoading`. | Manual | `mobile/app/ecommerce/[id].tsx:490-493` — `assortmentQ.isLoading` |
| TC-MOB-EC-156 | Admin | Assortment card shows "No items" when empty | P1 | 1. Open `EC-ZERO-BOXES` (no child boxes → empty assortment). | "No items" text displayed. | Manual | `mobile/app/ecommerce/[id].tsx:494-496` — `assortment.length === 0` |
| TC-MOB-EC-157 | Admin | Assortment rows show article·colour·size·MRP + x{count} pill | P1 | 1. Open `EC-ACTIVE-FULL` (multiple articles). | Each assortment row: "Article · Colour · Size · ₹MRP" text left + pill "x{count}" right. | Manual | `mobile/app/ecommerce/[id].tsx:57-67` — `AssortmentRow` component |
| TC-MOB-EC-158 | Admin | Child Boxes card hidden entirely when child_count=0 | P1 | 1. Open `EC-ZERO-BOXES`. | No "Child Boxes" card rendered at all. | Manual | `mobile/app/ecommerce/[id].tsx:507` — `childBoxes.length > 0 &&` guard |
| TC-MOB-EC-159 | Admin | Child Boxes default-collapsed when >5 boxes | P1 | 1. Open `EC-MANY-BOXES` (6+ boxes). | "Child Boxes (N)" header visible but rows hidden; chevron-down icon. | Manual | `mobile/app/ecommerce/[id].tsx:133-135` — `useState(childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD)` — false when >5 |
| TC-MOB-EC-160 | Admin | Child Boxes default-expanded when ≤5 boxes | P1 | 1. Open `EC-FEW-BOXES` (5 boxes). | All box rows visible on screen open; chevron-up icon. | Manual | `CHILD_BOX_COLLAPSE_THRESHOLD=5` — `[id].tsx:33`; ≤5 → `true` |
| TC-MOB-EC-161 | Admin | Tapping collapsible header toggles expand/collapse | P1 | 1. Open `EC-MANY-BOXES` (collapsed). 2. Tap header. | Rows expand; chevron flips to up. 3. Tap again. Rows collapse. | E2E | `mobile/app/ecommerce/[id].tsx:509-521` — `setChildBoxesExpanded` toggle |
| TC-MOB-EC-162 | Admin | Trash icon visible on child box rows when boxRemovable (ACTIVE, Admin) | P1 | 1. Open `EC-ACTIVE-FULL` (expanded). 2. Observe each child box row. | Trash icon `trash-outline` visible per row. | Manual | `ChildBoxRow` `canRemove={boxRemovable}` |
| TC-MOB-EC-163 | Admin | Trash icon absent on child box rows when CLOSED (Admin) | P1 | 1. Open `EC-CLOSED-01` (expanded child boxes). | No trash icons. `boxRemovable=false` for CLOSED. | Manual | `[id].tsx:292` |

---

## Section 26.30 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-EC-164 | Admin | Navigating to `/ecommerce/{id}` for deleted record shows not-found | P1 | 1. Delete a record via API. 2. Navigate to its detail URL. | `EmptyState icon="cart-outline"` "Record not found" shown. | Manual | `mobile/app/ecommerce/[id].tsx:271-283` |
| TC-MOB-EC-165 | Admin | EC barcode prefix `EC` parsed correctly by parseQRCode | P1 | 1. Scan barcode starting with `EC` (e.g. `ECAB1234`). 2. Observe scan flow. | `parseQRCode` returns `type: 'ecommerce'`; `id = 'ECAB1234'`. Lookup proceeds to `/ecommerce/qr/ECAB1234`. | Manual | `mobile/utils/index.ts:38` — `if (prefix === 'EC') return { type: 'ecommerce', id: trimmed }` |
| TC-MOB-EC-166 | Admin | Legacy `BINNY-EC-{uuid}` barcode parsed by parseQRCode | P2 | 1. [SKIP-POST-MIGRATION] Scan `BINNY-EC-abc123`. | `parseQRCode` returns `type: 'ecommerce'`; `id = 'BINNY-EC-ABC123'` (uppercased). | Manual | `mobile/utils/index.ts:48` — `BINNY-EC-` legacy path; `[SKIP-POST-MIGRATION]` |
| TC-MOB-EC-167 | Admin | Scanning non-child barcode (MC prefix) on Create screen is handled | P1 | 1. Scan a master-carton barcode (e.g. `MC123456`) in Create scan section. | `parseQRCode` returns `type: 'master'`, not `'child'`. `barcode = raw.trim().toUpperCase()` used; lookup fails with "Box not found". Row removed. | Manual | `mobile/app/ecommerce/create.tsx:88` — `parsed.type === 'child' ? parsed.id : raw.trim().toUpperCase()` |
| TC-MOB-EC-168 | Admin | ECOMMERCE_INVALIDATE_KEYS covers 7 keys on close/unpack/removeBox | P2 | 1. Close a record. 2. Observe invalidation calls. | 7 keys invalidated: `['ecommerce']`, `['ecommerce', id]`, `['ecommerce-assortment', id]`, `['childBoxes']`, `['inventory-summary']`, `['inventory-hierarchy']`, `['dashboard-stats']`. `[?]36` | API | `mobile/app/ecommerce/[id].tsx:35-43` |
| TC-MOB-EC-169 | Admin | Service `getAll` marketplace filter param not exposed in UI | P2 | 1. Inspect E-commerce list screen UI. | No "Marketplace" filter chip or input visible. Status chips only. Filter param exists in service but unused in UI. `[?]35` | Manual | `mobile/services/ecommerce.service.ts:18` — `marketplace?: string` param declared; `mobile/app/ecommerce/index.tsx` — not wired |
| TC-MOB-EC-170 | Admin | Create: EC barcode scanned in Create flow resolves via `getByBarcode` | P1 | 1. Scan an EC-prefixed barcode in Create scan section. | `parseQRCode` returns `type: 'ecommerce'`; code falls to `else` branch — raw uppercased used as barcode for `childBoxService.getByBarcode`. Lookup likely fails with "Box not found". | Manual | `create.tsx:88` — only `type === 'child'` uses `parsed.id`; other types fall to raw |

---

## Maestro flows index

| Flow file | Section | Description |
|---|---|---|
| `mobile/.maestro/ecommerce/ec-list-access-warehouse.yaml` | 26.1 | Warehouse Op sees list, FAB hidden |
| `mobile/.maestro/ecommerce/ec-list-dispatch-no-fab.yaml` | 26.7 | Dispatch Op sees list, FAB hidden |
| `mobile/.maestro/ecommerce/ec-create-denied-warehouse.yaml` | 26.8 | Warehouse Op gets DeniedView on Create screen |
| `mobile/.maestro/ecommerce/ec-create-happy-path.yaml` | 26.19 | Admin creates record with manual barcode; success + navigate to detail |
| `mobile/.maestro/ecommerce/ec-detail-add-box.yaml` | 26.24 | Admin adds FREE box via manual entry on detail screen |
| `mobile/.maestro/ecommerce/ec-detail-close-record.yaml` | 26.25 | Admin closes ACTIVE record via confirmation |
| `mobile/.maestro/ecommerce/ec-detail-dispatch-op-dispatch.yaml` | 26.28 | Dispatch Op taps Dispatch on CLOSED record → /dispatch/create |
| `mobile/.maestro/ecommerce/ec-collapsible-toggle.yaml` | 26.29 | Toggle child boxes collapsible expand/collapse |

---

## Open questions / `[?]` flags

| # | File:line | Flag | Description |
|---|---|---|---|
| 29 | `mobile/app/ecommerce/[id].tsx:338` + `:357-359` | `[?]29` | **Marketplace displayed twice on detail screen** — Marketplace appears in header meta (line 338) AND as a `<TimelineRow>` (lines 357-359). Visual redundancy — intentional emphasis or UX oversight? |
| 30 | `mobile/app/ecommerce/index.tsx:404` | `[?]30` | **FAB color hardcoded `'#7C3AED'`** — Uses a literal hex instead of a `COLORS` constant. If brand spec changes the e-commerce theme colour, only this one place needs updating but it is invisible in the design-token layer. Minor consistency issue. |
| 31 | `mobile/app/ecommerce/index.tsx:80-81` | `[?]31` | **List card row 3 has two display modes with inconsistent labelling** — when `marketplace` present, row reads "Marketplace: {x}[ · {sku}]"; when only `listing_sku` present, row reads just the SKU with no label prefix. Slightly inconsistent. Worth UX review. |
| 32 | `mobile/app/ecommerce/create.tsx:246` | `[?]32` | **Mapped Date has no date picker** — `TextInput` with `keyboardType="numbers-and-punctuation"`. Same gap as sample_date (#23 from phase-25). Independent issue tracking continues. |
| 33 | `mobile/app/ecommerce/[id].tsx:443` | `[?]33` | **Dispatch button does not pass ecommerce record ID** — `router.push('/dispatch/create')` navigates without any record identifier. Same gap as samples (#21) and cartons (#14). Now confirmed as a triple-module gap; cross-cutting fix needed. |
| 34 | `mobile/app/ecommerce/[id].tsx:114` | `[?]34` | **Dispatch Op can dispatch e-commerce records via per-button gate** — consistent with samples module. Contrasts with cartons which use an outer `RoleGate`. Pattern is module-wide for "downstream" records (samples + ecommerce per-button; cartons outer-gate). Cross-cutting architectural decision needed. |
| 35 | `mobile/services/ecommerce.service.ts:18` | `[?]35` | **Service `getAll` accepts `marketplace?` filter but mobile UI does not expose it** — the param is declared and would be forwarded to the API, but no chip or text input in `index.tsx` wires it up. Dead feature surface or future planned filter? |
| 36 | `mobile/app/ecommerce/[id].tsx:35-43` | `[?]36` | **`ECOMMERCE_INVALIDATE_KEYS` includes `inventory-hierarchy` and `dashboard-stats`** — same as samples (#26). Verify that subscribers of these keys are wired up and will actually refetch on invalidation, otherwise cache invalidation is silent no-op. |

---

*Authored 2026-05-11 by Sonnet under Opus dispatch (Session 6 of 13).*

