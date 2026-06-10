# Phase 25 — Mobile Samples (List, Create, Detail)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/samples` list, `/samples/create`, `/samples/[id]` detail
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 25.1 — List: role-agnostic access](#section-251--list-role-agnostic-access)
- [Section 25.2 — List: card rendering (name, status badge, recipient variants, box+MRP, dates)](#section-252--list-card-rendering-name-status-badge-recipient-variants-boxmrp-dates)
- [Section 25.3 — List: search (debounce + X clear)](#section-253--list-search-debounce--x-clear)
- [Section 25.4 — List: status chips (5 statuses)](#section-254--list-status-chips-5-statuses)
- [Section 25.5 — List: infinite scroll + pagination](#section-255--list-infinite-scroll--pagination)
- [Section 25.6 — List: pull-to-refresh + loading + empty](#section-256--list-pull-to-refresh--loading--empty)
- [Section 25.7 — List: FAB role gate (Admin/Sup see; Warehouse + Dispatch hidden)](#section-257--list-fab-role-gate)
- [Section 25.8 — Create screen: role gate (Admin/Sup allowed; Warehouse + Dispatch DeniedView)](#section-258--create-screen-role-gate)
- [Section 25.9 — Create: Sample Name (required, placeholder, blocks empty submit)](#section-259--create-sample-name)
- [Section 25.10 — Create: Customer picker modal](#section-2510--create-customer-picker-modal)
- [Section 25.11 — Create: Customer selected display + Change action](#section-2511--create-customer-selected-display--change-action)
- [Section 25.12 — Create: optional fields — Recipient / Purpose / Date / Notes](#section-2512--create-optional-fields)
- [Section 25.13 — Create: scan section — scan modal + manual entry + autoCapitalize](#section-2513--create-scan-section)
- [Section 25.14 — Create: scan — optimistic add + status validation + API-error removal](#section-2514--create-scan--optimistic-add--status-validation--api-error-removal)
- [Section 25.15 — Create: scan — dedupe + scanned row rendering + trash](#section-2515--create-scan--dedupe--scanned-row-rendering--trash)
- [Section 25.16 — Create: Clear All confirmation + state cleared](#section-2516--create-clear-all-confirmation--state-cleared)
- [Section 25.17 — Create: Submit validation + mutation + invalidate + router.replace](#section-2517--create-submit-validation--mutation--invalidate--routerreplace)
- [Section 25.18 — Detail: data load + parallel chained queries + not-found](#section-2518--detail-data-load--parallel-chained-queries--not-found)
- [Section 25.19 — Detail: header card (name 2-line, barcode mono, status, recipient/customer variants)](#section-2519--detail-header-card)
- [Section 25.20 — Detail: timeline card](#section-2520--detail-timeline-card)
- [Section 25.21 — Detail: action-bar status × role matrix](#section-2521--detail-action-bar-status--role-matrix)
- [Section 25.22 — Detail: Add Box inline scan (toggle, scan modal, manual entry, pessimistic flow)](#section-2522--detail-add-box-inline-scan)
- [Section 25.23 — Detail: Close Sample confirm + mutation + success](#section-2523--detail-close-sample-confirm--mutation--success)
- [Section 25.24 — Detail: Full Unpack confirm (destructive) + mutation + success](#section-2524--detail-full-unpack-confirm--mutation--success)
- [Section 25.25 — Detail: Remove individual box + confirm + mutation](#section-2525--detail-remove-individual-box--confirm--mutation)
- [Section 25.26 — Detail: Dispatch button (canDispatch && CLOSED; Dispatch Op CAN see)](#section-2526--detail-dispatch-button)
- [Section 25.27 — Detail: DISPATCHED status info text (all roles)](#section-2527--detail-dispatched-status-info-text)
- [Section 25.28 — Detail: assortment card states](#section-2528--detail-assortment-card-states)
- [Section 25.29 — Detail: child-boxes collapsible (>5 / ≤5 / 0 + trash visibility)](#section-2529--detail-child-boxes-collapsible)
- [Section 25.30 — Negative / edge cases](#section-2530--negative--edge-cases)
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
| `SR-CREATED-01` | CREATED sample, `child_count=0`, no customer, no recipient. Short barcode e.g. `SRAB1234`. | CREATED | 25.1, 25.2, 25.4, 25.18, 25.19, 25.20, 25.21, 25.24, 25.25 |
| `SR-ACTIVE-01` | ACTIVE sample, `child_count=3`, linked to `CUST-01`, `recipient_name=null`. Multiple articles/colours. | ACTIVE | 25.1, 25.2, 25.4, 25.19, 25.21, 25.22, 25.23, 25.24, 25.25, 25.28, 25.29 |
| `SR-ACTIVE-02` | ACTIVE sample, `child_count=1`, no customer, `recipient_name="Rahul Sharma"`. Single article. | ACTIVE | 25.2, 25.19, 25.28 |
| `SR-ACTIVE-NORECIP` | ACTIVE sample, `child_count=2`, `customer_id=null`, `recipient_name=null`. | ACTIVE | 25.2, 25.19 |
| `SR-CLOSED-01` | CLOSED sample, `child_count=4`, `closed_at` set, linked to `CUST-01`. | CLOSED | 25.1, 25.2, 25.4, 25.19, 25.21, 25.23, 25.24, 25.26, 25.28 |
| `SR-DISPATCHED-01` | DISPATCHED sample, `closed_at` + `dispatched_at` both set. | DISPATCHED | 25.2, 25.4, 25.19, 25.20, 25.27 |
| `CB-FREE-01` | FREE child box (short barcode e.g. `CB1A2B3C`). Article, colour, size, SKU, MRP set. | FREE | 25.13, 25.14, 25.15, 25.17, 25.22 |
| `CB-FREE-02` | Second FREE child box. Different article from `CB-FREE-01`. | FREE | 25.14, 25.15, 25.17 |
| `CB-GENERATED-01` | GENERATED child box. `status=GENERATED`. | GENERATED | 25.14, 25.22 |
| `CB-PACKED-01` | PACKED child box (already in a carton). | PACKED | 25.14, 25.22 |
| `CB-SAMPLE-01` | SAMPLE child box (already in a sample). | SAMPLE | 25.14, 25.30 |
| `CB-ECOMMERCE-01` | ECOMMERCE child box. | ECOMMERCE | 25.14 |
| `CUST-01` | Customer with `firm_name="Patel Traders"`, address set. | n/a | 25.10, 25.11, 25.17, 25.19 |
| `CUST-02` | Customer with `firm_name="Singh Footwear"`, no address. | n/a | 25.10 |
| `SR-MANY-BOXES` | ACTIVE or CLOSED sample with ≥6 child boxes (above `CHILD_BOX_COLLAPSE_THRESHOLD=5`). | ACTIVE or CLOSED | 25.29 |
| `SR-FEW-BOXES` | CLOSED sample with exactly 5 child boxes (at threshold — default expanded). | CLOSED | 25.29 |
| `SR-ZERO-BOXES` | CREATED sample with `child_count=0`, no child boxes. | CREATED | 25.29, 25.30 |
| `SR-LEGACY-01` | **[SKIP-POST-MIGRATION]** — After the May 5 short-barcode migration, no legacy `BINNY-SR-{uuid}` samples remain on local or portal DB. Mark TC `[SKIP-POST-MIGRATION]` in Notes. | n/a | 25.2, 25.30 |
| `CB-LEGACY-01` | **[SKIP-POST-MIGRATION]** — Legacy `BINNY-CB-{uuid}` child boxes no longer exist post-migration. | n/a | 25.14, 25.30 |

---

## Section 25.1 — List: role-agnostic access

All 4 roles can view the Samples list. No `RoleGate` wraps the list screen itself — access is controlled only at the FAB and Create screen level. `mobile/app/samples/index.tsx` renders the `FlatList` unconditionally.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-001 | Admin | Admin can access Samples list | P0 | 1. Login as Admin. 2. Navigate to Samples (Menu → Samples). 3. Observe. | Title bar "Samples". Search bar visible. Chips visible. Sample cards render. No "Not authorized". | E2E | `index.tsx:163` — no RoleGate wrapping list |
| TC-MOB-SAMP-002 | Supervisor | Supervisor can access Samples list | P0 | 1. Login as Supervisor. 2. Navigate to Samples. | List renders identically. No denial. | E2E | All 4 roles have list access |
| TC-MOB-SAMP-003 | Warehouse Operator | Warehouse Operator can access Samples list | P0 | 1. Login as Warehouse Operator. 2. Navigate to Samples. | List renders. Cards visible. **FAB hidden** (Warehouse Op excluded from FAB allow list). No "Not authorized". | E2E | `index.tsx:255` — FAB `allow={['Admin','Supervisor']}` — Warehouse Op excluded (differs from cartons) |
| TC-MOB-SAMP-004 | Dispatch Operator | Dispatch Operator can access Samples list | P0 | 1. Login as Dispatch Operator. 2. Navigate to Samples. | List renders. Cards visible. **FAB hidden** (Dispatch Op excluded). No "Not authorized". | E2E | `index.tsx:255` — Dispatch Op also excluded from FAB; no fallback rendered |

### Maestro flows for Section 25.1

```yaml
# mobile/.maestro/samples/samp-list-access-warehouse.yaml
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
- tapOn: "Samples"
- waitForAnimationToEnd
- assertVisible: "Samples"
- assertNotVisible: "Not authorized"
- assertNotVisible:
    id: "fab-create-sample"
```

---

## Section 25.2 — List: card rendering (name, status badge, recipient variants, box+MRP, dates)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-005 | Admin | Card shows barcode in monospace + status badge | P1 | 1. Login Admin. 2. Open Samples list. 3. Locate `SR-ACTIVE-01`. | Barcode `SR-ACTIVE-01.sample_barcode` shown in monospace font. `Badge` with label "ACTIVE" using `SAMPLE_STATUS_COLORS['ACTIVE']`. | Manual | `index.tsx:107-112` — barcode style `fontFamily: monospace`; `Badge color={SAMPLE_STATUS_COLORS[status]}` |
| TC-MOB-SAMP-006 | Admin | Card recipient line shows customer firm name when present | P1 | 1. Locate card for `SR-ACTIVE-01` (has `CUST-01`). 2. Read recipient line. | "To: Patel Traders" shown on card. | Manual | `index.tsx:74-76` — `customer_firm_name` takes priority over `recipient_name` |
| TC-MOB-SAMP-007 | Admin | Card recipient line shows recipient_name when no customer | P1 | 1. Locate card for `SR-ACTIVE-02` (no customer, recipient="Rahul Sharma"). | "To: Rahul Sharma" shown. | Manual | `index.tsx:77-78` — fallback to `recipient_name` |
| TC-MOB-SAMP-008 | Admin | Card recipient line hidden when no customer and no recipient | P1 | 1. Locate card for `SR-ACTIVE-NORECIP`. | Recipient line absent; card skips that row entirely. | Manual | `index.tsx:79` — `recipientLine = null`; conditional render `!!recipientLine` at line 121 |
| TC-MOB-SAMP-009 | Admin | Card shows N boxes + MRP summary | P1 | 1. Locate `SR-ACTIVE-01` (child_count=3, mrp_summary set). | Card shows e.g. "3 boxes · ₹NNN.NN". | Manual | `index.tsx:83-86` — `mrp_summary != null` guard; `Number().toFixed(2)` |
| TC-MOB-SAMP-010 | Admin | Card dates line shows Created always; Closed only when set | P1 | 1. Check `SR-ACTIVE-01` (no `closed_at`). 2. Check `SR-CLOSED-01` (has `closed_at`). | Active card: "Created DD/MM/YYYY" only. Closed card: "Created ... · Closed ...". | Manual | `index.tsx:89-95` — conditional date appends |
| TC-MOB-SAMP-011 | Admin | Card dates line shows Dispatched when dispatched_at set | P1 | 1. Locate `SR-DISPATCHED-01`. | Dates line includes "· Dispatched DD/MM/YYYY". | Manual | `index.tsx:92-94` |
| TC-MOB-SAMP-012 | Admin | Tapping card navigates to `/samples/{id}` | P1 | 1. Tap any sample card. | App navigates to Sample Detail screen for that ID. | E2E | `index.tsx:100` — `router.push('/samples/${sample.id}')` |

---

## Section 25.3 — List: search (debounce + X clear)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-013 | Admin | Search input has correct placeholder | P2 | 1. Open Samples list. 2. Observe search bar. | Placeholder text "Search by sample name or barcode..." visible. | Manual | `index.tsx:178` |
| TC-MOB-SAMP-014 | Admin | Search debounces 300ms before querying | P1 | 1. Type "Spring" rapidly. 2. Observe network calls. | API call fired ~300ms after last keystroke; not on every character. | Manual | `index.tsx:40-45` — `useEffect` with 300ms `setTimeout` on `searchInput` |
| TC-MOB-SAMP-015 | Admin | Search results filter list | P1 | 1. Type sample name substring. 2. Wait 400ms. | List updates to show only matching samples. | E2E | `index.tsx:48-55` — `search` param passed to `samplesService.getAll` |
| TC-MOB-SAMP-016 | Admin | X clear button appears when text entered and clears on tap | P1 | 1. Type "Spring". 2. Observe. 3. Tap X icon. | X icon appears when `searchInput.length > 0` (line 184). Tapping sets `searchInput=''`. List resets. | Manual | `index.tsx:184-191` — `close-circle` icon; `setSearchInput('')` |
| TC-MOB-SAMP-017 | Admin | Empty search query returns full list | P1 | 1. Search "Spring". 2. Clear search. | Full unfiltered list restored. | E2E | `index.tsx:53` — `search: search || undefined` |

---

## Section 25.4 — List: status chips (5 statuses)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-018 | Admin | All 5 chips rendered: ALL/CREATED/ACTIVE/CLOSED/DISPATCHED | P1 | 1. Open Samples list. 2. Observe chip row. | Chips in order: ALL, CREATED, ACTIVE, CLOSED, DISPATCHED. ALL selected by default. | Manual | `index.tsx:29` — `STATUS_OPTIONS` array |
| TC-MOB-SAMP-019 | Admin | Active chip styled differently from inactive | P1 | 1. Tap ACTIVE chip. | ACTIVE chip gains `chipActive` style (`COLORS.primary` background, white text). Others revert to `chipInactive`. | Manual | `index.tsx:207-217` |
| TC-MOB-SAMP-020 | Admin | CREATED chip filters to CREATED samples only | P1 | 1. Tap CREATED chip. 2. Observe list. | Only CREATED status samples shown (e.g. `SR-CREATED-01`). | E2E | `index.tsx:52-53` — `status: statusFilter === 'ALL' ? undefined : statusFilter` |
| TC-MOB-SAMP-021 | Admin | DISPATCHED chip shows dispatched samples | P1 | 1. Tap DISPATCHED chip. | Only `SR-DISPATCHED-01` class items shown. | Manual | Same filter logic |
| TC-MOB-SAMP-022 | Admin | ALL chip restores full list after filtering | P1 | 1. Tap CLOSED chip. 2. Then tap ALL. | Full list (all statuses) restored. | Manual | `statusFilter='ALL'` → `status: undefined` |

---

## Section 25.5 — List: infinite scroll + pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-023 | Admin | First page loads PAGE_SIZE=20 records max | P2 | 1. Seed >20 samples. 2. Open list. | At most 20 items visible initially. | API | `index.tsx:32` — `PAGE_SIZE = 20`; `initialPageParam: 1` |
| TC-MOB-SAMP-024 | Admin | Scrolling to 40% threshold triggers next page fetch | P2 | 1. Load list with >20 samples. 2. Scroll near bottom. | Additional items load; spinner shown in footer during fetch. | E2E | `index.tsx:241-242` — `onEndReachedThreshold={0.4}` |
| TC-MOB-SAMP-025 | Admin | "End of list" footer shown when all pages fetched | P2 | 1. Scroll to end of full dataset. | Footer text "End of list" appears. No spinner. | Manual | `index.tsx:149-153` — `!query.hasNextPage && items.length > 0` |
| TC-MOB-SAMP-026 | Admin | `isFetchingNextPage` spinner shown during pagination | P2 | 1. Trigger next page on slow connection. | Small `<Spinner size="small">` visible in list footer. | Manual | `index.tsx:143-147` |

---

## Section 25.6 — List: pull-to-refresh + loading + empty

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-027 | Admin | Full-screen spinner on initial load | P1 | 1. Clear cache. 2. Open Samples list. | `<Spinner>` centered while `query.isLoading && items.length === 0`. | Manual | `index.tsx:224-226` |
| TC-MOB-SAMP-028 | Admin | Empty state shows flask icon + correct messages | P1 | 1. Ensure no samples exist. 2. Open list. | `EmptyState icon="flask-outline"` with title "No samples" and message "Samples will appear once created." | Manual | `index.tsx:229-233` |
| TC-MOB-SAMP-029 | Admin | Pull-to-refresh triggers refetch | P1 | 1. Open list. 2. Pull down. | `RefreshControl` activates (`refreshing` = true); new data fetched; list updated. | E2E | `index.tsx:244-249` — `onRefresh={() => query.refetch()}` |
| TC-MOB-SAMP-030 | Admin | Empty state after chip filter yields no results | P2 | 1. Tap DISPATCHED chip on fresh DB with no dispatched samples. | Empty state appears while chip remains DISPATCHED. | Manual | Same empty-state path; `status=DISPATCHED` returns empty array |

---

## Section 25.7 — List: FAB role gate

FAB uses `RoleGate allow={['Admin','Supervisor']}` — Warehouse Operator and Dispatch Operator are BOTH excluded. This differs from Master Cartons where Warehouse Op was included.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-031 | Admin | Admin sees FAB on Samples list | P0 | 1. Login Admin. 2. Open Samples list. | Floating "+" button visible bottom-right. | E2E | `index.tsx:255` — `RoleGate allow={['Admin','Supervisor']}` |
| TC-MOB-SAMP-032 | Supervisor | Supervisor sees FAB | P0 | 1. Login Supervisor. 2. Open Samples list. | FAB visible. | E2E | Same gate |
| TC-MOB-SAMP-033 | Warehouse Operator | Warehouse Operator does NOT see FAB | P0 | 1. Login Warehouse Op. 2. Open Samples list. | No FAB rendered. No "+" button. No fallback. | E2E | `index.tsx:255` — Warehouse Op excluded (contrast: cartons had Warehouse Op in FAB) |
| TC-MOB-SAMP-034 | Dispatch Operator | Dispatch Operator does NOT see FAB | P0 | 1. Login Dispatch Op. 2. Open Samples list. | No FAB rendered. | E2E | `index.tsx:255` — Dispatch Op excluded; `RoleGate fallback` is `null` by default |

### Maestro flows for Section 25.7

```yaml
# mobile/.maestro/samples/samp-list-dispatch-no-fab.yaml
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
- tapOn: "Samples"
- waitForAnimationToEnd
- assertVisible: "Samples"
- assertNotVisible:
    id: "fab-create-sample"
```

---

## Section 25.8 — Create screen: role gate

Create screen is wrapped in `RoleGate allow={['Admin','Supervisor']} fallback={<DeniedView/>}` at the module-export level. Warehouse and Dispatch Operators see a `DeniedView` with lock icon.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-035 | Admin | Admin can access Create Sample screen | P0 | 1. Login Admin. 2. Tap FAB. | "Create Sample" screen loads with form fields visible. | E2E | `create.tsx:567-572` — `RoleGate allow={['Admin','Supervisor']}` |
| TC-MOB-SAMP-036 | Supervisor | Supervisor can access Create Sample screen | P0 | 1. Login Supervisor. 2. Tap FAB. | Form loads normally. | E2E | Same gate |
| TC-MOB-SAMP-037 | Warehouse Operator | Warehouse Op navigating to `/samples/create` sees DeniedView | P0 | 1. Login Warehouse Op. 2. Navigate directly to `/samples/create` URL. | `DeniedView` shown: `lock-closed-outline` icon, "Not authorized", "You don't have permission to create samples." | E2E | `create.tsx:39-49` — `DeniedView` component; `create.tsx:569` — fallback |
| TC-MOB-SAMP-038 | Dispatch Operator | Dispatch Op navigating to `/samples/create` sees DeniedView | P0 | 1. Login Dispatch Op. 2. Navigate directly to `/samples/create`. | Same `DeniedView` rendered. | E2E | Same gate; Dispatch Op excluded |

### Maestro flows for Section 25.8

```yaml
# mobile/.maestro/samples/create-denied-dispatch.yaml
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
- openLink: "binnyinventory://samples/create"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You don't have permission to create samples."
- assertNotVisible: "Sample Name"
```

---

## Section 25.9 — Create: Sample Name

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-039 | Admin | Sample Name field shows required asterisk | P1 | 1. Open Create Sample. 2. Observe Name field label. | Label reads "Sample Name *" (asterisk present). | Manual | `create.tsx:351` — `<Text>Sample Name *</Text>` |
| TC-MOB-SAMP-040 | Admin | Sample Name placeholder text correct | P2 | 1. Observe empty Name field. | Placeholder "e.g. Spring Exhibition 2026" visible. | Manual | `create.tsx:357` |
| TC-MOB-SAMP-041 | Admin | Empty name blocks submit with validation alert | P0 | 1. Open Create Sample. 2. Scan 1 box. 3. Leave Name empty. 4. Tap submit. | `Alert.alert('Validation', 'Sample name is required.')` shown. No API call. | E2E | `create.tsx:319-322` |
| TC-MOB-SAMP-042 | Admin | Whitespace-only name treated as empty | P1 | 1. Type "   " in Name. 2. Scan 1 box. 3. Submit. | Same "Sample name is required." alert. | Manual | `create.tsx:319` — `!name.trim()` check |

---

## Section 25.10 — Create: Customer picker modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-043 | Admin | "Select Customer" button opens picker modal | P1 | 1. Open Create Sample. 2. Tap "Select Customer". | Full-screen modal appears with title "Select Customer", search input, customer list. | E2E | `create.tsx:383-390` — `setCustomerPickerOpen(true)`; Modal `presentationStyle="fullScreen"` line 136 |
| TC-MOB-SAMP-044 | Admin | Picker resets search when reopened | P1 | 1. Open picker. 2. Type "Patel". 3. Close. 4. Reopen. | Search input cleared; full list shown. | Manual | `create.tsx:65-69` — `useEffect([visible])` resets `searchInput` and `search` |
| TC-MOB-SAMP-045 | Admin | Picker search input autofocuses on open | P2 | 1. Open picker. | Keyboard opens automatically; search input has focus. | Manual | `create.tsx:167` — `autoFocus` prop |
| TC-MOB-SAMP-046 | Admin | Picker search debounces 300ms via useRef | P1 | 1. Type "Si" rapidly. | API call fires ~300ms after last keystroke; not per keystroke. | Manual | `create.tsx:73-80` — `debounceRef.current` pattern with 300ms |
| TC-MOB-SAMP-047 | Admin | Picker initial load shows "Loading…" text (not Spinner) | P2 | 1. Open picker on slow connection. | Text "Loading…" shown in centered view — NOT a `<Spinner>` component. | Manual | `create.tsx:174-177` — `pickerHintText` text node; `[?]27` |
| TC-MOB-SAMP-048 | Admin | Picker empty state — no query — shows "No customers available." | P2 | 1. Open picker with empty customer DB. | `EmptyState icon="person-outline"` with message "No customers available." | Manual | `create.tsx:191-194` — `search ? 'No results for "${search}".' : 'No customers available.'` |
| TC-MOB-SAMP-049 | Admin | Picker empty state — with query — shows 'No results for "X".' | P2 | 1. Open picker. 2. Search "zzz". 3. Wait. | EmptyState message 'No results for "zzz".' | Manual | Same conditional |
| TC-MOB-SAMP-050 | Admin | Picker row shows firm_name + address with chevron | P1 | 1. Open picker with `CUST-01` visible. | Row: "Patel Traders" bold, address text below, `chevron-forward` icon right. | Manual | `create.tsx:106-128` — `renderCustomerRow` |
| TC-MOB-SAMP-051 | Admin | Picker row shows firm_name only when no address | P2 | 1. Open picker with `CUST-02` (no address). | Only firm name shown; no address line. | Manual | `create.tsx:119-123` — address conditional |
| TC-MOB-SAMP-052 | Admin | Tapping customer row selects customer and closes modal atomically | P0 | 1. Open picker. 2. Tap `CUST-01`. | `onPick(item)` and `onClose()` called together. Modal closes. Customer selected in form. | E2E | `create.tsx:112-114` — `onPick(item); onClose();` in sequence |
| TC-MOB-SAMP-053 | Admin | X button closes picker without selection | P1 | 1. Open picker. 2. Tap X top-right. | Modal closes. No customer selected. | Manual | `create.tsx:145-150` — `onClose` on X press |
| TC-MOB-SAMP-054 | Admin | Picker infinite scroll loads more customers | P2 | 1. Seed >20 customers. 2. Open picker. 3. Scroll to bottom. | Additional customers load. | Manual | `create.tsx:99-103` — `handleLoadMore`; `onEndReachedThreshold={0.3}` |
| TC-MOB-SAMP-055 | Admin | Picker rows separated by hairline | P2 | 1. Open picker with multiple customers. | `ItemSeparatorComponent` hairline visible between rows. | Manual | `create.tsx:196` — `pickerSeparator` style |

### Maestro flows for Section 25.10

```yaml
# mobile/.maestro/samples/create-customer-picker-search-select.yaml
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
- tapOn: "Samples"
- waitForAnimationToEnd
- tapOn:
    id: "fab-create-sample"
- waitForAnimationToEnd
- assertVisible: "Create Sample"
- tapOn: "Select Customer"
- waitForAnimationToEnd
- assertVisible: "Select Customer"
- inputText: "Patel"
- waitForAnimationToEnd
- assertVisible: "Patel Traders"
- tapOn: "Patel Traders"
- waitForAnimationToEnd
- assertVisible: "Patel Traders"
- assertNotVisible: "Select Customer"
```

---

## Section 25.11 — Create: Customer selected display + Change action

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-056 | Admin | After selection, customer card shows firm_name + address | P1 | 1. Open Create. 2. Select `CUST-01`. | Inline card shows "Patel Traders" bold + address text. "Change" link visible right side. | Manual | `create.tsx:364-379` — `selectedCustomer` renders `customerCard` |
| TC-MOB-SAMP-057 | Admin | Tapping Change resets customer selection | P1 | 1. Select `CUST-01`. 2. Tap "Change". | `selectedCustomer` set to `null`. "Select Customer" button reappears. | Manual | `create.tsx:375-379` — `setSelectedCustomer(null)` |
| TC-MOB-SAMP-058 | Admin | Customer optional — submit succeeds without customer selected | P1 | 1. Fill Name. 2. Skip customer. 3. Scan 1 box. 4. Submit. | Sample created with `customer_id: null`. No validation error for missing customer. | E2E | `create.tsx:330` — `customer_id: selectedCustomer?.id ?? null` |

---

## Section 25.12 — Create: optional fields

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-059 | Admin | Recipient Name field is optional free-text | P2 | 1. Open Create. 2. Type in Recipient Name. | Value accepted; no validation. | Manual | `create.tsx:394-402` — `recipientName` state; placeholder "Free-text recipient…" |
| TC-MOB-SAMP-060 | Admin | Purpose field is multiline (3 lines) | P2 | 1. Open Create. 2. Tap Purpose. 3. Type long text. | Multiline TextInput expands; `numberOfLines={3}`. | Manual | `create.tsx:406-415` — `multiline` + `numberOfLines={3}` |
| TC-MOB-SAMP-061 | Admin | Sample Date defaults to today's ISO date | P1 | 1. Open Create. 2. Observe Sample Date field. | Value pre-filled with today's date `YYYY-MM-DD` format. | Manual | `create.tsx:215-217` — `new Date().toISOString().split('T')[0]` |
| TC-MOB-SAMP-062 | Admin | Sample Date uses numbers-and-punctuation keyboard | P2 | 1. Tap Sample Date field. | Numeric keyboard with punctuation appears (not full QWERTY). | Manual | `create.tsx:427` — `keyboardType="numbers-and-punctuation"`; `[?]23` |
| TC-MOB-SAMP-063 | Admin | Sample Date field has no date picker UI | P2 | 1. Tap Sample Date field. | Plain TextInput; no calendar/date picker appears. User types date manually. | Manual | `create.tsx:419-429` — bare `TextInput` with no `DatePicker`; `[?]23` |
| TC-MOB-SAMP-064 | Admin | Notes field is multiline (3 lines) | P2 | 1. Open Create. 2. Tap Notes. 3. Enter text. | Multiline TextInput; `numberOfLines={3}`. | Manual | `create.tsx:431-441` |

---

## Section 25.13 — Create: scan section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-065 | Admin | Scan section header shows N boxes count | P1 | 1. Open Create. 2. Observe scan card header. | Header reads "Scanned Items (0 boxes)" initially. | Manual | `create.tsx:449` — `Scanned Items (${scannedBarcodes.length} boxes)` |
| TC-MOB-SAMP-066 | Admin | "Scan Child Box" button opens BarcodeScanner modal | P1 | 1. Tap "Scan Child Box". | `BarcodeScanner` modal opens. | E2E | `create.tsx:459-466` — `setScannerOpen(true)`; `BarcodeScanner expectedType="child"` |
| TC-MOB-SAMP-067 | Admin | Scanner title is "Scan Child Box" | P2 | 1. Open scanner modal. | Modal title "Scan Child Box" shown. | Manual | `create.tsx:551` — `title="Scan Child Box"` |
| TC-MOB-SAMP-068 | Admin | Manual TextInput has autoCapitalize="characters" | P1 | 1. Tap manual barcode input. 2. Type "cb1a". | Characters auto-uppercased to "CB1A". | Manual | `create.tsx:477` — `autoCapitalize="characters"` |
| TC-MOB-SAMP-069 | Admin | Add button enabled only when manualInput non-empty | P1 | 1. Leave manual input empty. 2. Tap Add. | Add button disabled (`!manualInput.trim()`); `handleManualAdd` returns early. | Manual | `create.tsx:485` — `disabled={!manualInput.trim()}`; `create.tsx:288-291` |
| TC-MOB-SAMP-070 | Admin | Submitting manual input (Enter) triggers handleManualAdd | P1 | 1. Type barcode. 2. Press Enter/Done. | `handleManualAdd` fires; `manualInput` cleared; scan initiated. | Manual | `create.tsx:479` — `onSubmitEditing={handleManualAdd}` |
| TC-MOB-SAMP-071 | Admin | Empty scanned list shows EmptyState with cube icon | P2 | 1. Open Create with 0 scanned boxes. | `EmptyState icon="cube-outline"` title "No boxes scanned yet", message "Tap Scan Child Box or enter a barcode manually." | Manual | `create.tsx:492-497` |
| TC-MOB-SAMP-072 | Admin | "Scan Child Box" button shows "Validating…" during validation | P1 | 1. Scan a box. 2. Observe button while API validates. | Button text changes to "Validating…" and is disabled. | Manual | `create.tsx:460` — `validating ? 'Validating…' : 'Scan Child Box'`; `disabled={validating}` |

---

## Section 25.14 — Create: scan — optimistic add + status validation + API-error removal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-073 | Admin | FREE box accepted — appears in list and details load | P0 | 1. Scan `CB-FREE-01`. | Box appears optimistically in scanned list with "Loading…" meta. After API resolves, meta shows article/colour/size/MRP. Haptic success fires. | E2E | `create.tsx:257-271` — optimistic add then `setBoxDetails`; haptic at line 272 |
| TC-MOB-SAMP-074 | Admin | GENERATED box accepted | P0 | 1. Scan `CB-GENERATED-01`. | Box accepted and shown in list. Meta loads. | E2E | `create.tsx:262` — `box.status !== 'FREE' && box.status !== 'GENERATED'` check |
| TC-MOB-SAMP-075 | Admin | PACKED box rejected — optimistic then removed | P0 | 1. Scan `CB-PACKED-01`. | Box appears briefly (optimistic). Then removed. Alert "Box not available — Box {barcode} is PACKED — only FREE or GENERATED boxes can be added." | E2E | `create.tsx:264-269` |
| TC-MOB-SAMP-076 | Admin | SAMPLE box rejected with correct status in message | P0 | 1. Scan `CB-SAMPLE-01`. | Alert says "Box not available — Box {barcode} is SAMPLE — only FREE or GENERATED boxes can be added." | E2E | Same rejection path |
| TC-MOB-SAMP-077 | Admin | ECOMMERCE box rejected | P1 | 1. Scan `CB-ECOMMERCE-01`. | Alert says "…is ECOMMERCE…". | Manual | Same rejection path |
| TC-MOB-SAMP-078 | Admin | Unknown barcode triggers API error removal | P1 | 1. Enter barcode "CB999999" (non-existent). | Box appears optimistically then removed. Alert "Scan failed — {error message}". | Manual | `create.tsx:273-277` — catch block; `err?.response?.data?.message ?? err?.message ?? 'Box not found'` |
| TC-MOB-SAMP-079 | Admin | Optimistic add — item visible immediately before API returns | P1 | 1. On slow connection, scan a box. | Barcode appears in list immediately with "Loading…" while API is pending. | Manual | `create.tsx:257` — `setScannedBarcodes((prev) => [...prev, barcode])` before await |

---

## Section 25.15 — Create: scan — dedupe + scanned row rendering + trash

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-080 | Admin | Scanning same barcode twice shows "Already scanned" alert | P1 | 1. Scan `CB-FREE-01`. 2. Scan `CB-FREE-01` again. | Alert "Already scanned — {barcode} is already in the list." No duplicate added. | Manual | `create.tsx:251-254` — `scannedBarcodes.includes(barcode)` check |
| TC-MOB-SAMP-081 | Admin | Scanned row shows 1-based index number | P1 | 1. Scan 3 boxes. | Rows show "1.", "2.", "3." prefix. | Manual | `create.tsx:507` — `{idx + 1}.` |
| TC-MOB-SAMP-082 | Admin | Scanned row barcode in monospace | P1 | 1. Scan 1 box. | Barcode text uses `fontFamily: Menlo/monospace`. | Manual | `create.tsx:508-511` — `scannedBarcode` style with monospace |
| TC-MOB-SAMP-083 | Admin | Scanned row shows "Loading…" italic before details loaded | P1 | 1. Scan on slow connection. 2. Observe row before API returns. | Italic "Loading…" shown below barcode. | Manual | `create.tsx:516-517` — `scannedLoading` italic style |
| TC-MOB-SAMP-084 | Admin | Scanned row shows meta after details load | P1 | 1. Scan `CB-FREE-01`. 2. Wait for details. | Meta line: "{article} · {colour} · {size} · ₹{mrp}" | Manual | `create.tsx:513-515` — `detail.article_name · colour · size · ₹mrp.toFixed(2)` |
| TC-MOB-SAMP-085 | Admin | Trash button removes scanned row | P1 | 1. Scan 2 boxes. 2. Tap trash on first. | Row removed from `scannedBarcodes` and `boxDetails`. Count header decrements. | E2E | `create.tsx:294-301` — `handleRemove` deletes from both state objects |

---

## Section 25.16 — Create: Clear All confirmation + state cleared

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-086 | Admin | "Clear All" link hidden when no boxes scanned | P1 | 1. Open Create with 0 boxes. | "Clear All" text not rendered. | Manual | `create.tsx:451-454` — `scannedBarcodes.length > 0` conditional |
| TC-MOB-SAMP-087 | Admin | "Clear All" link appears when ≥1 box scanned | P1 | 1. Scan 1 box. | Red "Clear All" link appears in scan section header. | Manual | Same conditional; `clearAllText` style is `COLORS.error` |
| TC-MOB-SAMP-088 | Admin | Clear All shows confirmation dialog | P1 | 1. Scan boxes. 2. Tap "Clear All". | `Alert.alert('Clear All', 'Remove all scanned boxes?')` with Cancel + Clear (destructive) buttons. | Manual | `create.tsx:304-314` |
| TC-MOB-SAMP-089 | Admin | Cancel in Clear All leaves list unchanged | P1 | 1. Tap Clear All. 2. Tap Cancel. | Scanned list unchanged. | Manual | `style: 'cancel'` button — no `onPress` |
| TC-MOB-SAMP-090 | Admin | Confirming Clear All empties scannedBarcodes and boxDetails | P0 | 1. Scan 3 boxes. 2. Tap Clear All. 3. Confirm. | `scannedBarcodes=[]`; `boxDetails={}`; header shows "Scanned Items (0 boxes)"; EmptyState shown. | E2E | `create.tsx:310-313` — `setScannedBarcodes([]); setBoxDetails({})` |

---

## Section 25.17 — Create: Submit validation + mutation + invalidate + router.replace

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-091 | Admin | Submit button disabled with no boxes | P0 | 1. Fill Name. 2. No boxes scanned. | Submit button disabled (`scannedBarcodes.length === 0`). | Manual | `create.tsx:540` — `disabled={scannedBarcodes.length === 0 || !name.trim() || createMutation.isPending}` |
| TC-MOB-SAMP-092 | Admin | Submit button disabled with no name | P0 | 1. Scan boxes. 2. Leave name empty. | Submit button disabled. | Manual | Same `disabled` prop |
| TC-MOB-SAMP-093 | Admin | Tapping submit with no boxes shows validation alert | P0 | 1. Fill Name. 2. No boxes. 3. Tap Submit. | Alert "Validation — Scan at least one child box before creating the sample." | E2E | `create.tsx:323-326` |
| TC-MOB-SAMP-094 | Admin | Submit button label shows box count | P1 | 1. Scan 3 boxes. | Button label "Create Sample (3 boxes)". | Manual | `create.tsx:536` — `Create Sample (${scannedBarcodes.length} boxes)` |
| TC-MOB-SAMP-095 | Admin | Happy path: create sample + navigate to detail | P0 | 1. Fill Name "Test Sample". 2. Select `CUST-01`. 3. Scan `CB-FREE-01`. 4. Submit. | API POST `/samples` fires. Success toast "Sample created successfully." Haptic fires. `router.replace('/samples/{id}')`. Detail screen shows new sample. | E2E | `create.tsx:239-243` — `successMessage`; `create.tsx:240-241` — haptic + `router.replace` |
| TC-MOB-SAMP-096 | Admin | Submission payload includes all fields | P1 | 1. Fill all fields. 2. Submit. | API payload: `{name, customer_id, recipient_name, purpose, sample_date, notes, child_box_barcodes}`. | API | `create.tsx:328-336` |
| TC-MOB-SAMP-097 | Admin | Invalidates samples, childBoxes, inventory-summary, inventory-hierarchy, dashboard-stats | P1 | 1. Submit. 2. Navigate back to list. | All 5 query keys invalidated on success; list fresh. | API | `create.tsx:232-237` — `invalidateKeys` array; `[?]26` |
| TC-MOB-SAMP-098 | Admin | Submit button shows loading state during pending | P1 | 1. Submit on slow connection. | Button shows loading spinner; `loading={createMutation.isPending}`. | Manual | `create.tsx:541-542` |

### Maestro flows for Sections 25.9–25.17

```yaml
# mobile/.maestro/samples/create-happy-path.yaml
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
- tapOn: "Samples"
- waitForAnimationToEnd
- tapOn:
    id: "fab-create-sample"
- waitForAnimationToEnd
- assertVisible: "Create Sample"
- tapOn:
    text: "Sample Name *"
- inputText: "Maestro Test Sample"
- tapOn: "Enter barcode manually…"
- inputText: "${BOX_BARCODE}"
- tapOn: "Add"
- waitForAnimationToEnd
- assertVisible: "${BOX_BARCODE}"
- tapOn:
    text: "Create Sample"
- waitForAnimationToEnd
- assertVisible: "Sample Details"

# mobile/.maestro/samples/create-validation-empty-name.yaml
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
- tapOn: "Samples"
- waitForAnimationToEnd
- tapOn:
    id: "fab-create-sample"
- waitForAnimationToEnd
- tapOn: "Enter barcode manually…"
- inputText: "${BOX_BARCODE}"
- tapOn: "Add"
- waitForAnimationToEnd
- tapOn:
    text: "Create Sample"
- assertVisible: "Sample name is required."
```

## Section 25.18 — Detail: data load + parallel chained queries + not-found

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-099 | Admin | Detail screen shows full-screen spinner while loading | P1 | 1. Navigate to `/samples/{id}` on slow connection. | Full-screen `<Spinner>` centered while `sampleQ.isLoading && !sample`. | Manual | `[id].tsx:260-268` |
| TC-MOB-SAMP-100 | Admin | Not-found state renders flask icon + message | P1 | 1. Navigate to `/samples/nonexistent-id`. | `EmptyState icon="flask-outline"` title "Sample not found" message "This sample may have been removed." | Manual | `[id].tsx:271-283` |
| TC-MOB-SAMP-101 | Admin | Assortment query enabled only after sampleQ.data resolves | P1 | 1. Load detail. 2. Observe network calls. | `getAssortment` call fires only after `sampleQ.data` is truthy. No parallel race. | API | `[id].tsx:123-127` — `enabled: !!id && !!sampleQ.data` |
| TC-MOB-SAMP-102 | Admin | Pull-to-refresh refetches both queries | P1 | 1. Open detail. 2. Pull down. | Both `sampleQ.refetch()` and `assortmentQ.refetch()` called via `Promise.all`. | Manual | `[id].tsx:139-142` |

---

## Section 25.19 — Detail: header card (name 2-line, barcode mono, status, recipient/customer variants)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-103 | Admin | Sample name in header — bold, 2-line truncation | P1 | 1. Open `SR-ACTIVE-01` detail. | Name bold (`fontWeight: '700'`, `fontSize: 18`), `numberOfLines={2}`. | Manual | `[id].tsx:334-337` — `sampleName` style |
| TC-MOB-SAMP-104 | Admin | Barcode in header — monospace, secondary colour | P1 | 1. Open detail. | Barcode below name in monospace (`Menlo/monospace`), `COLORS.textSecondary`. | Manual | `[id].tsx:340-343` — `barcodeText` style |
| TC-MOB-SAMP-105 | Admin | Status badge correct color for each status | P1 | 1. View CREATED, ACTIVE, CLOSED, DISPATCHED samples. | Badge label matches status; color from `SAMPLE_STATUS_COLORS[status]`. | Manual | `[id].tsx:337` — `Badge label={s.status} color={SAMPLE_STATUS_COLORS[s.status]}` |
| TC-MOB-SAMP-106 | Admin | Header meta shows box count + customer firm_name | P1 | 1. Open `SR-ACTIVE-01` (linked to `CUST-01`). | Meta: "3 boxes  ·  To: Patel Traders". | Manual | `[id].tsx:344-346` — `recipientDisplay` logic, same as list |
| TC-MOB-SAMP-107 | Admin | Header meta shows recipient_name when no customer | P1 | 1. Open `SR-ACTIVE-02` (recipient="Rahul Sharma"). | Meta: "1 boxes  ·  To: Rahul Sharma". | Manual | `[id].tsx:292-297` |
| TC-MOB-SAMP-108 | Admin | Header meta omits "To:" when no customer and no recipient | P1 | 1. Open `SR-ACTIVE-NORECIP`. | Meta: "2 boxes" only — no "To:" segment. | Manual | `[id].tsx:297` — `recipientDisplay = null`; line 345 — `recipientDisplay ? '  ·  ${recipientDisplay}' : ''` |

---

## Section 25.20 — Detail: timeline card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-109 | Admin | Timeline always shows Created row | P1 | 1. Open any sample detail. | "Created" label + `formatDate(s.created_at)` always present. | Manual | `[id].tsx:352-353` — unconditional `TimelineRow` |
| TC-MOB-SAMP-110 | Admin | Sample Date row shows only when `sample_date` set | P1 | 1. Open sample with `sample_date` set vs null. | Row visible when set; absent when null. | Manual | `[id].tsx:354-356` — `!!s.sample_date` conditional |
| TC-MOB-SAMP-111 | Admin | Closed row shows only when `closed_at` set | P1 | 1. Open `SR-CLOSED-01`. | "Closed" row shows formatted date. | Manual | `[id].tsx:357-359` |
| TC-MOB-SAMP-112 | Admin | Dispatched row shows only when `dispatched_at` set | P1 | 1. Open `SR-DISPATCHED-01`. | "Dispatched" row shows formatted date. | Manual | `[id].tsx:360-362` |
| TC-MOB-SAMP-113 | Admin | Creator row shows creator name when present | P2 | 1. Open sample with `creator` object. | "Creator" row shows `s.creator.name`. | Manual | `[id].tsx:363-365` — `!!s.creator` conditional |

---

## Section 25.21 — Detail: action-bar status × role matrix

No outer `RoleGate` on action bar — all roles reach the status check. Then per-flag gates control visibility. DISPATCHED shows info text regardless of role.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-114 | Admin | Admin on CREATED sample: Add Box + Full Unpack visible; no Close | P0 | 1. Login Admin. 2. Open `SR-CREATED-01`. | "Add Box" button visible. "Full Unpack" visible. "Close Sample" NOT visible (only on ACTIVE). | Manual | `[id].tsx:300-314` — `canAddBox=true`, `canClose=false`, `canUnpack=true` |
| TC-MOB-SAMP-115 | Admin | Admin on ACTIVE sample: Add Box + Close + Full Unpack visible | P0 | 1. Login Admin. 2. Open `SR-ACTIVE-01`. | All 3 buttons: "Add Box", "Close Sample", "Full Unpack". | E2E | `[id].tsx:300-311` |
| TC-MOB-SAMP-116 | Admin | Admin on CLOSED sample: Full Unpack + Dispatch visible; no Add/Close | P0 | 1. Login Admin. 2. Open `SR-CLOSED-01`. | "Full Unpack" visible. "Dispatch" visible. "Add Box" NOT visible. "Close Sample" NOT visible. | Manual | `[id].tsx:303-314` — `canAddBox=false`, `canClose=false`, `canUnpack=true`, `dispatchVisible=true` |
| TC-MOB-SAMP-117 | Admin | Admin on DISPATCHED sample: info text only | P0 | 1. Login Admin. 2. Open `SR-DISPATCHED-01`. | "This sample has been dispatched. No actions available." text. No buttons. | Manual | `[id].tsx:368-370` |
| TC-MOB-SAMP-118 | Supervisor | Supervisor on ACTIVE: same buttons as Admin | P0 | 1. Login Supervisor. 2. Open `SR-ACTIVE-01`. | Add Box, Close Sample, Full Unpack all visible. | Manual | `isManager = useHasRole(['Admin','Supervisor'])` `[id].tsx:113` |
| TC-MOB-SAMP-119 | Warehouse Operator | Warehouse Op on ACTIVE: no action buttons | P0 | 1. Login Warehouse Op. 2. Open `SR-ACTIVE-01`. | No Add Box, no Close, no Full Unpack, no Dispatch. Empty action bar area. | E2E | `isManager=false`; `canDispatch=false` — Warehouse Op not in either role list |
| TC-MOB-SAMP-120 | Dispatch Operator | Dispatch Op on CLOSED: only Dispatch button visible | P0 | 1. Login Dispatch Op. 2. Open `SR-CLOSED-01`. | Only "Dispatch" button visible. No Add Box, no Close, no Full Unpack. | E2E | `[id].tsx:114` — `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])`; `dispatchVisible = canDispatch && CLOSED` |
| TC-MOB-SAMP-121 | Dispatch Operator | Dispatch Op on ACTIVE: no buttons | P1 | 1. Login Dispatch Op. 2. Open `SR-ACTIVE-01`. | No buttons visible (ACTIVE not CLOSED → `dispatchVisible=false`; `isManager=false`). | Manual | `[id].tsx:314` — `dispatchVisible = canDispatch && s.status === 'CLOSED'` |
| TC-MOB-SAMP-122 | Dispatch Operator | Dispatch Op on DISPATCHED: info text | P1 | 1. Login Dispatch Op. 2. Open `SR-DISPATCHED-01`. | Info text "This sample has been dispatched. No actions available." | Manual | `[id].tsx:368` — status check precedes all flag checks |
| TC-MOB-SAMP-123 | Warehouse Operator | Warehouse Op on CLOSED: no buttons | P1 | 1. Login Warehouse Op. 2. Open `SR-CLOSED-01`. | No buttons rendered (`isManager=false`; `canDispatch=false`). | Manual | `[id].tsx:113-114` — Warehouse Op excluded from both role lists |

---

## Section 25.22 — Detail: Add Box inline scan (toggle, scan modal, manual entry, pessimistic flow)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-124 | Admin | Tapping "Add Box" toggles inline card open/closed | P1 | 1. Open ACTIVE sample. 2. Tap "Add Box". | Inline scan card appears. Button label changes to "Hide Add Box". Tap again — card hides. | E2E | `[id].tsx:377-388` — `addBoxOpen` toggle; button variant changes to outline when open |
| TC-MOB-SAMP-125 | Admin | Scanner modal opens from Add Box card | P1 | 1. Toggle Add Box open. 2. Tap "Scan Child Box". | BarcodeScanner modal opens. | Manual | `[id].tsx:454-457` |
| TC-MOB-SAMP-126 | Admin | Manual barcode input in Add Box card has autoCapitalize="characters" | P1 | 1. Toggle Add Box. 2. Tap manual input. 3. Type "cb". | Text uppercased to "CB". | Manual | `[id].tsx:469` — `autoCapitalize="characters"` |
| TC-MOB-SAMP-127 | Admin | Add Box — FREE box accepted pessimistically | P0 | 1. Open ACTIVE sample. 2. Scan `CB-FREE-01`. | Validates via `getByBarcode`, posts `samplesService.addBox`, alerts "Success — Box {barcode} added to sample.", both queries refetched. | E2E | `[id].tsx:151-174` — pessimistic: validate first, then add |
| TC-MOB-SAMP-128 | Admin | Add Box — GENERATED box accepted | P0 | 1. Scan `CB-GENERATED-01` in Add Box. | Same success flow. | Manual | Same validation check |
| TC-MOB-SAMP-129 | Admin | Add Box — PACKED box rejected | P0 | 1. Scan `CB-PACKED-01` in Add Box. | Alert "Box not available — Box {barcode} is PACKED — only FREE or GENERATED boxes can be added." No API addBox call. | E2E | `[id].tsx:157-163` — pessimistic validation before `addBox` POST |
| TC-MOB-SAMP-130 | Admin | Add Box — API error shows "Error — {message}" | P1 | 1. Make `addBox` endpoint return error. | Alert "Error — {message}". | Manual | `[id].tsx:168-171` — catch block |
| TC-MOB-SAMP-131 | Admin | Add Box button shows "Adding…" during pending | P2 | 1. Scan on slow connection. | Button label changes to "Adding…"; `disabled={addingBox}`. | Manual | `[id].tsx:455` — `addingBox ? 'Adding…' : 'Scan Child Box'` |

### Maestro flows for Section 25.22

```yaml
# mobile/.maestro/samples/detail-add-box.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SAMPLE_ID: "REPLACE_WITH_ACTIVE_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- tapOn: "Add Box"
- waitForAnimationToEnd
- assertVisible: "Add Child Box"
- tapOn: "Enter barcode manually…"
- inputText: "${BOX_BARCODE}"
- tapOn: "Add"
- waitForAnimationToEnd
- assertVisible: "Box ${BOX_BARCODE} added to sample."
```

---

## Section 25.23 — Detail: Close Sample confirm + mutation + success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-132 | Admin | Close Sample button only visible on ACTIVE | P0 | 1. Open ACTIVE sample. | "Close Sample" button present. | Manual | `[id].tsx:306` — `canClose = isManager && s.status === 'ACTIVE'` |
| TC-MOB-SAMP-133 | Admin | Close Sample shows confirmation dialog with name + count | P0 | 1. Tap "Close Sample". | `Alert.alert('Close Sample?', 'This will close "${name}" (${child_count} boxes) and move it to closed status.')` with Cancel | Close. | E2E | `[id].tsx:199-207` |
| TC-MOB-SAMP-134 | Admin | Cancel in Close dialog does nothing | P1 | 1. Tap Close Sample. 2. Tap Cancel. | Modal dismissed. Sample remains ACTIVE. | Manual | `{ text: 'Cancel', style: 'cancel' }` |
| TC-MOB-SAMP-135 | Admin | Confirm Close calls POST /samples/{id}/close + success message | P0 | 1. Tap Close Sample. 2. Confirm. | API POST `/samples/{id}/close`. Toast "Sample closed successfully." Status badge updates to CLOSED. | E2E | `[id].tsx:189-194` — `successMessage: 'Sample closed successfully.'` |
| TC-MOB-SAMP-136 | Supervisor | Supervisor can Close ACTIVE sample | P0 | 1. Login Supervisor. 2. Open ACTIVE sample. 3. Tap Close. 4. Confirm. | Same success flow. | Manual | `isManager` includes Supervisor |

### Maestro flows for Section 25.23

```yaml
# mobile/.maestro/samples/detail-close-sample.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SAMPLE_ID: "REPLACE_WITH_ACTIVE_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- tapOn: "Close Sample"
- waitForAnimationToEnd
- assertVisible: "Close Sample?"
- tapOn: "Close"
- waitForAnimationToEnd
- assertVisible: "Sample closed successfully."
```

---

## Section 25.24 — Detail: Full Unpack confirm (destructive) + mutation + success

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-137 | Admin | Full Unpack visible on CREATED | P0 | 1. Open `SR-CREATED-01`. | "Full Unpack" button visible. | Manual | `[id].tsx:309-311` — `canUnpack = isManager && (CREATED|ACTIVE|CLOSED)` |
| TC-MOB-SAMP-138 | Admin | Full Unpack visible on ACTIVE | P0 | 1. Open `SR-ACTIVE-01`. | "Full Unpack" button visible. | Manual | Same flag |
| TC-MOB-SAMP-139 | Admin | Full Unpack visible on CLOSED | P0 | 1. Open `SR-CLOSED-01`. | "Full Unpack" button visible. | Manual | Same flag |
| TC-MOB-SAMP-140 | Admin | Full Unpack dialog is destructive — message mentions all boxes returned FREE | P0 | 1. Open ACTIVE sample with 3 boxes. 2. Tap Full Unpack. | `Alert.alert('Full Unpack?', 'This will release all 3 boxes from "{name}" back to FREE status. This cannot be undone.')` Cancel | Unpack (destructive style). | E2E | `[id].tsx:218-231` |
| TC-MOB-SAMP-141 | Admin | Unpack button has `style: 'destructive'` | P1 | 1. Observe Unpack alert. | "Unpack" button rendered in red/destructive style (iOS). | Manual | `[id].tsx:226` — `style: 'destructive'` |
| TC-MOB-SAMP-142 | Admin | Confirm Unpack calls POST /samples/{id}/full-unpack + success | P0 | 1. Confirm. | POST to `/samples/{id}/full-unpack`. Toast "Sample fully unpacked. All boxes returned to FREE." Status changes to CREATED (or as API dictates). | E2E | `[id].tsx:210-215` — `successMessage: 'Sample fully unpacked. All boxes returned to FREE.'` |
| TC-MOB-SAMP-143 | Admin | Full Unpack on CREATED sample with 0 boxes — no guard | P2 | 1. Open `SR-ZERO-BOXES` (0 boxes). 2. Tap Full Unpack. 3. Confirm. | API call fires regardless; no front-end guard prevents this. | Manual | `[id].tsx:218-231` — no `child_count > 0` check; `[?]25` |

### Maestro flows for Section 25.24

```yaml
# mobile/.maestro/samples/detail-full-unpack-destructive.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SAMPLE_ID: "REPLACE_WITH_CLOSED_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- tapOn: "Full Unpack"
- waitForAnimationToEnd
- assertVisible: "Full Unpack?"
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "Sample fully unpacked."
```

---

## Section 25.25 — Detail: Remove individual box + confirm + mutation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-144 | Admin | Trash icon visible per row when boxRemovable (CREATED/ACTIVE + isManager) | P0 | 1. Open `SR-CREATED-01`. 2. Expand child boxes. | Each row shows trash icon. | Manual | `[id].tsx:300` — `boxRemovable = isManager && (CREATED|ACTIVE)` |
| TC-MOB-SAMP-145 | Admin | Trash icon NOT visible on CLOSED sample | P0 | 1. Open `SR-CLOSED-01`. 2. Expand child boxes. | No trash icons in rows. | Manual | `boxRemovable=false` for CLOSED status |
| TC-MOB-SAMP-146 | Admin | Tapping trash shows Remove Box confirmation | P0 | 1. Tap trash on a child box row. | `Alert.alert('Remove Box?', 'Remove {barcode} from this sample?')` Cancel | Remove (destructive). | E2E | `[id].tsx:243-257` — `confirmRemoveBox` |
| TC-MOB-SAMP-147 | Admin | Cancel in Remove dialog leaves box in list | P1 | 1. Tap trash. 2. Tap Cancel. | Box remains in child list. | Manual | Cancel button = no `onPress` |
| TC-MOB-SAMP-148 | Admin | Confirm Remove calls removeBox + success | P0 | 1. Confirm removal. | `samplesService.removeBox({child_box_id, sample_record_id})`. Toast "Box removed from sample." Queries refetch. | E2E | `[id].tsx:235-240` — mutation with `successMessage: 'Box removed from sample.'` |
| TC-MOB-SAMP-149 | Warehouse Operator | Warehouse Op sees no trash icons | P0 | 1. Login Warehouse Op. 2. Open ACTIVE sample. 3. View child boxes. | No trash icons visible (`boxRemovable=false` because `isManager=false`). | Manual | `isManager = useHasRole(['Admin','Supervisor'])` — excludes Warehouse Op |

### Maestro flows for Section 25.25

```yaml
# mobile/.maestro/samples/detail-remove-box-trash.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SAMPLE_ID: "REPLACE_WITH_CREATED_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- tapOn:
    id: "trash-icon-row-0"
- waitForAnimationToEnd
- assertVisible: "Remove Box?"
- tapOn: "Remove"
- waitForAnimationToEnd
- assertVisible: "Box removed from sample."
```

---

## Section 25.26 — Detail: Dispatch button (canDispatch && CLOSED; Dispatch Op CAN see)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-150 | Dispatch Operator | Dispatch Op sees Dispatch button on CLOSED sample | P0 | 1. Login Dispatch Op. 2. Open `SR-CLOSED-01`. | "Dispatch" button visible. | E2E | `[id].tsx:114` — `canDispatch = useHasRole(['Admin','Supervisor','Dispatch Operator'])`; line 314 — `dispatchVisible = canDispatch && CLOSED`; `[?]20` |
| TC-MOB-SAMP-151 | Admin | Admin sees Dispatch button on CLOSED sample | P0 | 1. Login Admin. 2. Open CLOSED sample. | "Dispatch" button visible. | Manual | `canDispatch=true` for Admin |
| TC-MOB-SAMP-152 | Warehouse Operator | Warehouse Op does NOT see Dispatch button on CLOSED | P0 | 1. Login Warehouse Op. 2. Open CLOSED sample. | No "Dispatch" button. | Manual | `canDispatch=false` for Warehouse Op |
| TC-MOB-SAMP-153 | Dispatch Operator | Dispatch Op on ACTIVE: no Dispatch button | P1 | 1. Login Dispatch Op. 2. Open ACTIVE sample. | No "Dispatch" button (`dispatchVisible = false` — not CLOSED). | Manual | `[id].tsx:314` |
| TC-MOB-SAMP-154 | Admin | Dispatch button navigates to `/dispatch/create` without sample ID | P1 | 1. Tap Dispatch on CLOSED sample. | `router.push('/dispatch/create')`. No sample ID in route. | Manual | `[id].tsx:443` — `router.push('/dispatch/create' as never)`; `[?]21` |

### Maestro flows for Section 25.26

```yaml
# mobile/.maestro/samples/detail-dispatch-button-dispatch-op.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
  SAMPLE_ID: "REPLACE_WITH_CLOSED_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- assertVisible: "Dispatch"
- tapOn: "Dispatch"
- waitForAnimationToEnd
- assertVisible: "Create Dispatch"
```

---

## Section 25.27 — Detail: DISPATCHED status info text (all roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-155 | Admin | Admin sees info text on DISPATCHED sample | P0 | 1. Login Admin. 2. Open `SR-DISPATCHED-01`. | Italic text "This sample has been dispatched. No actions available." | Manual | `[id].tsx:368-370` — `dispatchedNote` italic style |
| TC-MOB-SAMP-156 | Supervisor | Supervisor sees same info text | P0 | 1. Login Supervisor. 2. Open `SR-DISPATCHED-01`. | Same text; no buttons. | Manual | Status check is universal |
| TC-MOB-SAMP-157 | Warehouse Operator | Warehouse Op sees info text | P0 | 1. Login Warehouse Op. 2. Open `SR-DISPATCHED-01`. | Same text. | Manual | `[id].tsx:368` — checks `s.status === 'DISPATCHED'` before role |
| TC-MOB-SAMP-158 | Dispatch Operator | Dispatch Op sees info text | P0 | 1. Login Dispatch Op. 2. Open `SR-DISPATCHED-01`. | Same text. | Manual | All roles see this text once sample is DISPATCHED |

---

## Section 25.28 — Detail: assortment card states

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-159 | Admin | Assortment card shows loading spinner while query pending | P1 | 1. Open detail on slow connection. | Small `<Spinner size="small">` in assortment card while `assortmentQ.isLoading`. | Manual | `[id].tsx:489-492` |
| TC-MOB-SAMP-160 | Admin | Assortment "No items" shown when empty | P1 | 1. Open `SR-CREATED-01` (0 boxes). | "No items" text in assortment card. | Manual | `[id].tsx:493-495` — `assortment.length === 0` |
| TC-MOB-SAMP-161 | Admin | Assortment rows show article · colour · size · ₹MRP + x{N} pill | P1 | 1. Open `SR-ACTIVE-01` (multiple article types). | Each row: "{article} · {colour} · {size} · ₹{MRP}" + right-aligned `x{count}` pill. | Manual | `[id].tsx:57-68` — `AssortmentRow` component |
| TC-MOB-SAMP-162 | Admin | x{N} pill uses primary-tinted background | P2 | 1. Observe assortment row pill. | Pill has `COLORS.primary + '15'` background, `COLORS.primary` text. | Manual | `[id].tsx:693-705` — `assortmentCountPill` style |

---

## Section 25.29 — Detail: child-boxes collapsible (>5 / ≤5 / 0 + trash visibility)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-163 | Admin | Child Boxes section hidden when count=0 | P1 | 1. Open `SR-ZERO-BOXES`. | No "Child Boxes" card rendered. | Manual | `[id].tsx:506-507` — `childBoxes.length > 0` guard |
| TC-MOB-SAMP-164 | Admin | Child Boxes default expanded when ≤5 | P1 | 1. Open `SR-FEW-BOXES` (5 boxes). | Child boxes list expanded by default. Chevron points up. | Manual | `[id].tsx:133-135` — `childBoxesExpanded` initialized `childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD` |
| TC-MOB-SAMP-165 | Admin | Child Boxes default collapsed when >5 | P1 | 1. Open `SR-MANY-BOXES` (≥6 boxes). | List collapsed by default. Only header "Child Boxes (N)" + chevron-down visible. | Manual | Same init — `>5` → `false` |
| TC-MOB-SAMP-166 | Admin | Tapping header toggles expand/collapse | P1 | 1. On collapsed list, tap header. | List expands; chevron flips to chevron-up. Tap again — collapses. | E2E | `[id].tsx:509` — `setChildBoxesExpanded((v) => !v)` |
| TC-MOB-SAMP-167 | Admin | Child box row shows barcode + status badge + meta | P1 | 1. Expand child boxes. | Each row: barcode (monospace), `Badge type="childBox"`, article/colour/size, SKU · ₹MRP. | Manual | `[id].tsx:76-104` — `ChildBoxRow` component |
| TC-MOB-SAMP-168 | Admin | Trash icons visible per row on CREATED (Admin) | P1 | 1. Open CREATED sample. 2. Expand child boxes. | Each row has trash icon. | Manual | `boxRemovable=true` for Admin+CREATED |
| TC-MOB-SAMP-169 | Warehouse Operator | No trash icons visible for Warehouse Op | P1 | 1. Login Warehouse Op. 2. Open ACTIVE sample. 3. Expand boxes. | No trash icons — `canRemove={boxRemovable}` = false. | Manual | `[id].tsx:526` — `canRemove={boxRemovable}` |

### Maestro flows for Section 25.29

```yaml
# mobile/.maestro/samples/detail-collapsible-toggle.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SAMPLE_ID: "REPLACE_WITH_MANY_BOXES_SAMPLE_ID"
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
- openLink: "binnyinventory://samples/${SAMPLE_ID}"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- assertNotVisible:
    id: "child-box-row-0"
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- assertVisible:
    id: "child-box-row-0"
```

---

## Section 25.30 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-SAMP-170 | Admin | Navigate to `/samples/invalid-uuid` shows not-found | P1 | 1. Open deep link with bogus ID. | "Sample not found" empty state. | Manual | `[id].tsx:271-283` |
| TC-MOB-SAMP-171 | Admin | Create: scanning SAMPLE-status box rejected | P0 | 1. Scan `CB-SAMPLE-01` (already in a sample). | Optimistic add then removal. Alert "…is SAMPLE — only FREE or GENERATED…" | Manual | `create.tsx:262-268` |
| TC-MOB-SAMP-172 | Admin | Create: submit with only whitespace in name blocked | P1 | 1. Name = "   ". 2. Scan 1 box. 3. Submit. | Alert "Sample name is required." | Manual | `create.tsx:319` — `!name.trim()` |
| TC-MOB-SAMP-173 | Admin | List search returns no results — empty state not hiding search bar | P2 | 1. Search "zzzznotexist". | Empty state shows. Search bar + chips still visible above it. | Manual | `index.tsx:224-234` — empty-state path still renders outer wrapper |
| TC-MOB-SAMP-174 | Admin | Detail: both mutations disabled while either pending | P1 | 1. Tap Close Sample. 2. While pending, observe Full Unpack. | Full Unpack disabled while `closeMutation.isPending`. | Manual | `[id].tsx:406` — `disabled={closeMutation.isPending || unpackMutation.isPending}` |
| TC-MOB-SAMP-175 | Admin | Detail: Add Box toggle preserves manualBarcode state when collapsed | P2 | 1. Open Add Box. 2. Type in manual input. 3. Collapse Add Box. 4. Expand. | State of `manualBarcode` may or may not be preserved — no explicit reset on collapse. | Manual | `[id].tsx:146-148` — `manualBarcode` state not reset on `addBoxOpen` toggle; `[?]28` |
| TC-MOB-SAMP-176 | Admin | Legacy-format barcode in list card | P2 | Seed sample with barcode `BINNY-SR-{uuid}`. | Card renders legacy barcode. | Manual | `[SKIP-POST-MIGRATION]` — no legacy records remain post May 5 migration |
| TC-MOB-SAMP-177 | Admin | Create: scan barcode from QR code — parseQRCode strips prefix | P1 | 1. Scan QR code containing full URL/barcode string. | `parseQRCode` extracts child box ID; dedupe + add work correctly. | Manual | `create.tsx:248-249` — `parseQRCode(raw); parsed.type === 'child' ? parsed.id : raw.trim().toUpperCase()` |
| TC-MOB-SAMP-178 | Admin | Create: submitting same barcode twice in manual entry shows Already Scanned | P1 | 1. Scan `CB-FREE-01`. 2. Enter `CB-FREE-01` manually again. | Alert "Already scanned — {barcode} is already in the list." | Manual | `create.tsx:251-254` |

---

## Maestro flows index

| Flow file path | Section | Purpose |
|---|---|---|
| `mobile/.maestro/samples/samp-list-access-warehouse.yaml` | 25.1 | Warehouse Op sees list but no FAB |
| `mobile/.maestro/samples/samp-list-dispatch-no-fab.yaml` | 25.7 | Dispatch Op sees list but no FAB |
| `mobile/.maestro/samples/create-denied-dispatch.yaml` | 25.8 | Dispatch Op gets DeniedView on create screen |
| `mobile/.maestro/samples/create-customer-picker-search-select.yaml` | 25.10 | Customer picker search + tap-to-select flow |
| `mobile/.maestro/samples/create-happy-path.yaml` | 25.17 | Name + manual barcode + submit → detail |
| `mobile/.maestro/samples/create-validation-empty-name.yaml` | 25.17 | Empty name validation alert |
| `mobile/.maestro/samples/detail-add-box.yaml` | 25.22 | Admin adds box to ACTIVE sample via manual entry |
| `mobile/.maestro/samples/detail-close-sample.yaml` | 25.23 | Admin closes ACTIVE sample |
| `mobile/.maestro/samples/detail-full-unpack-destructive.yaml` | 25.24 | Admin full-unpacks CLOSED sample |
| `mobile/.maestro/samples/detail-remove-box-trash.yaml` | 25.25 | Admin removes individual box via trash |
| `mobile/.maestro/samples/detail-dispatch-button-dispatch-op.yaml` | 25.26 | Dispatch Op sees + taps Dispatch on CLOSED sample |
| `mobile/.maestro/samples/detail-collapsible-toggle.yaml` | 25.29 | Child boxes collapsible expand/collapse |

---

## Open questions / `[?]` flags

| # | File | Observation | Impact |
|---|---|---|---|
| 20 | `[id].tsx:114`, `index.tsx:255` | Dispatch Op can dispatch samples (per-button gate) but cannot dispatch master cartons (outer `RoleGate`). Role-gate strategy is inconsistent between the two modules. | Medium — UX inconsistency; may confuse Dispatch Op users |
| 21 | `[id].tsx:443` | Dispatch button calls `router.push('/dispatch/create')` with no sample ID passed in params. Dispatch Op must manually re-associate the sample at the dispatch screen. | High — user workflow broken if dispatch form doesn't pre-populate |
| 22 | `[id].tsx:113`, `create.tsx:567` | Warehouse Operator is completely locked out of sample management (no FAB, DeniedView on create, no action buttons on detail). Warehouse Op is the primary actor for carton packing — this asymmetry needs product review. | Medium — workflow gap |
| 23 | `create.tsx:419-428` | Sample Date is a bare `TextInput` with `keyboardType="numbers-and-punctuation"` — no `DatePicker`, no calendar. User must know YYYY-MM-DD format. No validation on format. | Low-Medium — UX friction; invalid dates silently sent to API |
| 24 | `create.tsx:247-279`, `[id].tsx:151-174` | Create screen uses **optimistic add** (barcode appears immediately, removed on failure). Detail Add Box uses **pessimistic add** (validate first, add only on success). Same conceptual action, different UX strategy. | Medium — inconsistent mental model for users |
| 25 | `[id].tsx:218-231` | Full Unpack on a CREATED/CLOSED sample with `child_count=0` has no front-end guard. The API call fires for an empty sample. Backend may return success or an error. | Low — edge case but may produce confusing success toast |
| 26 | `[id].tsx:35-43`, `create.tsx:232-237` | `SAMPLE_INVALIDATE_KEYS` includes `inventory-hierarchy` and `dashboard-stats`. Need to verify these query keys are actually registered (used by active queries) in the app, otherwise invalidation is a no-op. | Low — silent cache miss |
| 27 | `create.tsx:174-177` | CustomerPicker shows plain `Text` "Loading…" while fetching — not a `<Spinner>` component. Inconsistent with all other loading states in the app. | Low — cosmetic inconsistency |
| 28 | `[id].tsx:146-148` | `manualBarcode` state is not reset when the Add Box panel is collapsed (`addBoxOpen = false`). Toggling open again will show previously entered (and possibly failed) text still in the input. | Low — minor UX issue |

---

*Authored 2026-05-11 by Sonnet under Opus dispatch (Session 5 of 13).*

