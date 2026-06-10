# Phase 28 — Mobile Customers & Users

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/customers` list, `/customers/new`, `/customers/[id]` detail; Users menu tile + route gap
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 28.1 — Customers Menu tile (Admin/Sup see; Warehouse + Dispatch hidden)](#section-281--customers-menu-tile)
- [Section 28.2 — Customers list: screen role gate (Admin/Sup see; Warehouse + Dispatch DeniedView)](#section-282--customers-list-screen-role-gate)
- [Section 28.3 — Customers list: card rendering (firm_name, badge colour, contact, address, GSTIN+Marka, inactive badge)](#section-283--customers-list-card-rendering)
- [Section 28.4 — Customers list: search input (300ms debounce, placeholder, X clear)](#section-284--customers-list-search-input)
- [Section 28.5 — Customers list: type filter chips (ALL / Primary Dealer / Sub Dealer)](#section-285--customers-list-type-filter-chips)
- [Section 28.6 — Customers list: infinite scroll + pagination + pull-to-refresh](#section-286--customers-list-infinite-scroll--pagination--pull-to-refresh)
- [Section 28.7 — Customers list: loading + empty state](#section-287--customers-list-loading--empty-state)
- [Section 28.8 — Customers list: FAB role gate (redundant nested gate)](#section-288--customers-list-fab-role-gate)
- [Section 28.9 — Customer create: role gate](#section-289--customer-create-role-gate)
- [Section 28.10 — Customer create: Type toggle (Primary Dealer default; Sub Dealer reveals picker; switching back clears it)](#section-2810--customer-create-type-toggle)
- [Section 28.11 — Customer create: Primary Dealer picker modal](#section-2811--customer-create-primary-dealer-picker-modal)
- [Section 28.12 — Customer create: required-field validation](#section-2812--customer-create-required-field-validation)
- [Section 28.13 — Customer create: optional fields](#section-2813--customer-create-optional-fields)
- [Section 28.14 — Customer create: submit + mutation + invalidate + router.replace](#section-2814--customer-create-submit--mutation--invalidate--routerreplace)
- [Section 28.15 — Customer detail: role gate](#section-2815--customer-detail-role-gate)
- [Section 28.16 — Customer detail: data load + not-found state](#section-2816--customer-detail-data-load--not-found-state)
- [Section 28.17 — Customer detail: View mode rendering](#section-2817--customer-detail-view-mode-rendering)
- [Section 28.18 — Customer detail: Edit toggle + dynamic Stack.Screen title](#section-2818--customer-detail-edit-toggle--dynamic-stackscreen-title)
- [Section 28.19 — Customer detail: Edit mode (Type toggle, picker, all 8 fields pre-populated)](#section-2819--customer-detail-edit-mode)
- [Section 28.20 — Customer detail: Save mutation (invalidates both keys, successMessage, closes edit)](#section-2820--customer-detail-save-mutation)
- [Section 28.21 — Customer detail: Cancel resets form to loaded customer + clears errors](#section-2821--customer-detail-cancel-resets-form)
- [Section 28.22 — Customer detail: missing functionality (no delete, no deactivate UI)](#section-2822--customer-detail-missing-functionality)
- [Section 28.23 — Users module: Menu tile (Admin-only visibility)](#section-2823--users-module-menu-tile)
- [Section 28.24 — Users module: /users route has no screen (unmatched route)](#section-2824--users-module-users-route-has-no-screen)
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
| `CUST-PD-FULL` | Primary Dealer with all optional fields populated: address, delivery_location, gstin, private_marka, gr, contact_person_name, contact_person_mobile. `is_active=true`. | — | 28.3, 28.5, 28.6, 28.17, 28.19, 28.20, 28.21 |
| `CUST-PD-MINIMAL` | Primary Dealer with only `firm_name` set. All optional fields null. `is_active=true`. | — | 28.3, 28.7, 28.17 |
| `CUST-SD-01` | Sub Dealer linked to `CUST-PD-FULL` as primary dealer. All optional fields populated. `is_active=true`. | — | 28.3, 28.5, 28.10, 28.11, 28.17, 28.19 |
| `CUST-INACTIVE` | Primary Dealer customer with `is_active=false`. | — | 28.3, 28.7, 28.17, 28.22 |
| `CUST-PD-02` | Second Primary Dealer (for DealerPicker filter test). | — | 28.11 |
| `CUST-PD-03` | Third Primary Dealer (for DealerPicker filter test). | — | 28.11 |
| `CUST-MANY` | ≥25 customers (mix of Primary + Sub Dealer) for pagination test. | — | 28.6 |
| `CUST-EMPTY-FIRM` | Attempt to POST customer with `firm_name=''` — should be rejected by validation. | — | 28.12 |
| `CUST-NONEXIST` | A valid UUID not present in the database (e.g. deleted after creation). | — | 28.16 |

---

## Section 28.1 — Customers Menu tile

Admin and Supervisor see the Customers tile; Warehouse Op and Dispatch Op do not (tile is inside `<RoleGate allow={['Admin', 'Supervisor']}>` at line 85-87 of `mobile/app/(tabs)/menu.tsx`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-001 | Admin | Admin sees Customers tile in Menu | P0 | 1. Login as Admin. 2. Navigate to Menu tab. | "Customers" tile visible (`people-outline` icon, `COLORS.info` tint). | E2E | `mobile/app/(tabs)/menu.tsx:86` — `<RoleGate allow={['Admin', 'Supervisor']}>` wraps tile |
| TC-MOB-CUST-002 | Supervisor | Supervisor sees Customers tile | P0 | 1. Login as Supervisor. 2. Navigate to Menu tab. | "Customers" tile visible. | E2E | `mobile/app/(tabs)/menu.tsx:86` |
| TC-MOB-CUST-003 | Warehouse Operator | Warehouse Op does NOT see Customers tile | P0 | 1. Login as Warehouse Op. 2. Navigate to Menu tab. 3. Scroll grid. | No "Customers" tile present. | E2E | `mobile/app/(tabs)/menu.tsx:85-87` — RoleGate renders null for Warehouse Op |
| TC-MOB-CUST-004 | Dispatch Operator | Dispatch Op does NOT see Customers tile | P0 | 1. Login as Dispatch Op. 2. Navigate to Menu tab. 3. Scroll grid. | No "Customers" tile present. | E2E | `mobile/app/(tabs)/menu.tsx:85-87` |
| TC-MOB-CUST-005 | Admin | Tapping Customers tile navigates to list | P1 | 1. Login as Admin. 2. Tap "Customers" tile. | Navigates to `/customers` — list screen appears with title "Customers". | E2E | `mobile/app/(tabs)/menu.tsx:86` route `'/customers'`; `mobile/app/customers/index.tsx:172` Stack.Screen title |

---

## Section 28.2 — Customers list: screen role gate

Screen export `CustomersScreenGated` wraps the whole list in `<RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView/>}>`. Warehouse Op and Dispatch Op who deep-link directly to `/customers` see the DeniedView.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-006 | Admin | Admin sees Customers list | P0 | 1. Login as Admin. 2. Navigate to `/customers`. | List renders with search bar + chips + cards. No denial message. | E2E | `mobile/app/customers/index.tsx:280-285` — outer RoleGate allows Admin |
| TC-MOB-CUST-007 | Supervisor | Supervisor sees Customers list | P0 | 1. Login as Supervisor. 2. Navigate to `/customers`. | List renders. | E2E | `mobile/app/customers/index.tsx:282` |
| TC-MOB-CUST-008 | Warehouse Operator | Warehouse Op sees DeniedView on /customers | P0 | 1. Login as Warehouse Op. 2. Deep-link to `/customers`. | `lock-closed-outline` icon, title "Not authorized", message "You don't have permission to view customers." | Manual | `mobile/app/customers/index.tsx:32-42` DeniedView; `mobile/app/customers/index.tsx:282` fallback |
| TC-MOB-CUST-009 | Dispatch Operator | Dispatch Op sees DeniedView on /customers | P0 | 1. Login as Dispatch Op. 2. Deep-link to `/customers`. | Same DeniedView as Warehouse Op. | Manual | `mobile/app/customers/index.tsx:282` |

---

## Section 28.3 — Customers list: card rendering

Tests all visible fields in list row: firm_name, customer_type badge colour, contact line join, address line, GSTIN+Marka composite, and inactive badge placement.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-010 | Admin | firm_name appears bold on Row 1 | P1 | 1. View list card for `CUST-PD-FULL`. | Firm name text bold (fontWeight 700), truncated at 1 line. | Manual | `mobile/app/customers/index.tsx:110-112` — `styles.firmName` |
| TC-MOB-CUST-011 | Admin | Primary Dealer badge uses COLORS.info | P1 | 1. View card for `CUST-PD-FULL` (Primary Dealer). | Badge label "Primary Dealer"; badge background `COLORS.info`. | Manual | `mobile/app/customers/index.tsx:84-85` — `isPrimary ? COLORS.info : COLORS.textSecondary` |
| TC-MOB-CUST-012 | Admin | Sub Dealer badge uses COLORS.textSecondary | P1 | 1. View card for `CUST-SD-01` (Sub Dealer). | Badge label "Sub Dealer"; badge tint `COLORS.textSecondary`. | Manual | `mobile/app/customers/index.tsx:85` |
| TC-MOB-CUST-013 | Admin | Contact line joins name and mobile with " · " | P1 | 1. View card for `CUST-PD-FULL` (both contact_person_name and contact_person_mobile set). | Single contact line: `{name} · {mobile}`. | Manual | `mobile/app/customers/index.tsx:87-92` — `.filter(Boolean).join(' · ')` |
| TC-MOB-CUST-014 | Admin | Contact line omitted when both name and mobile null | P2 | 1. View card for `CUST-PD-MINIMAL` (both null). | No contact line rendered. | Manual | `mobile/app/customers/index.tsx:117` — `!!contactLine` guard |
| TC-MOB-CUST-015 | Admin | Address line rendered when set | P2 | 1. View card for `CUST-PD-FULL`. | Address text visible below contact line. | Manual | `mobile/app/customers/index.tsx:124-127` — `!!customer.address` guard |
| TC-MOB-CUST-016 | Admin | Address line omitted when null | P2 | 1. View card for `CUST-PD-MINIMAL`. | No address line. | Manual | `mobile/app/customers/index.tsx:124` |
| TC-MOB-CUST-017 | Admin | GSTIN+Marka composite rendered when both set | P1 | 1. View card for `CUST-PD-FULL` (gstin and private_marka both set). | Line: `GSTIN: {value} · Marka: {value}`. | Manual | `mobile/app/customers/index.tsx:94-99` — `filter(Boolean).join(' · ')` on prefixed strings |
| TC-MOB-CUST-018 | Admin | GSTIN shown alone when private_marka null | P2 | 1. View a customer with gstin set but private_marka null. | Line: `GSTIN: {value}` (no Marka segment). | Manual | `mobile/app/customers/index.tsx:96-98` — `private_marka ? 'Marka: …' : null` |
| TC-MOB-CUST-019 | Admin | GSTIN+Marka row omitted when both null | P2 | 1. View card for `CUST-PD-MINIMAL`. | No GSTIN/Marka line. | Manual | `mobile/app/customers/index.tsx:131` — `!!gstinMarka` guard |
| TC-MOB-CUST-020 | Admin | Inactive badge shown for is_active=false | P1 | 1. View card for `CUST-INACTIVE`. | Red "Inactive" badge appears right-aligned at bottom of card (`COLORS.error` text + semi-transparent bg). | Manual | `mobile/app/customers/index.tsx:138-142` — `!customer.is_active` guard; `styles.inactiveBadge` |
| TC-MOB-CUST-021 | Admin | Inactive badge absent for active customers | P2 | 1. View card for `CUST-PD-FULL` (is_active=true). | No "Inactive" badge. | Manual | `mobile/app/customers/index.tsx:138` |
| TC-MOB-CUST-022 | Admin | Tapping card navigates to detail | P1 | 1. Tap card for `CUST-PD-FULL`. | Navigates to `/customers/{id}`. Detail screen loads. | E2E | `mobile/app/customers/index.tsx:104` — `router.push('/customers/${customer.id}')` |

---

## Section 28.4 — Customers list: search input

300ms debounce on `searchInput` → `search`. Placeholder "Search by firm, contact, GSTIN...". X clear button visible when input non-empty.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-023 | Admin | Search filters list by firm name | P1 | 1. Type partial firm name. 2. Wait 300ms. | List narrows to matching customers. | Manual | `mobile/app/customers/index.tsx:52-57` — debounce; `mobile/app/customers/index.tsx:187` — placeholder |
| TC-MOB-CUST-024 | Admin | Search filters by contact person name | P1 | 1. Type contact person name substring. 2. Wait 300ms. | Matching customers shown. | Manual | `mobile/app/customers/index.tsx:187` — backend search covers contact |
| TC-MOB-CUST-025 | Admin | Search filters by GSTIN | P2 | 1. Type GSTIN substring. 2. Wait 300ms. | Matching customers shown. | Manual | `mobile/app/customers/index.tsx:187` — placeholder includes "GSTIN" |
| TC-MOB-CUST-026 | Admin | 300ms debounce prevents mid-keystroke API call | P2 | 1. Type 5 chars rapidly. Monitor network. | Single API call fires 300ms after last keystroke; not on each character. | Manual | `mobile/app/customers/index.tsx:52-57` |
| TC-MOB-CUST-027 | Admin | X button clears search and restores full list | P1 | 1. Type something. 2. Tap close-circle icon. | Search input cleared; full list restores. | E2E | `mobile/app/customers/index.tsx:193-200` — `close-circle` visible when `searchInput.length > 0`; onPress sets `''` |
| TC-MOB-CUST-028 | Admin | No X button when search is empty | P2 | 1. View list with empty search box. | No close-circle icon visible. | Manual | `mobile/app/customers/index.tsx:193` — conditional render |
| TC-MOB-CUST-029 | Supervisor | Supervisor can search customers | P1 | 1. Login as Supervisor. 2. Type firm name substring. 3. Wait 300ms. | List filters correctly. | Manual | Both Admin and Supervisor have full list access |

---

## Section 28.5 — Customers list: type filter chips

3 chips: ALL (default active), Primary Dealer, Sub Dealer. Active chip: `COLORS.primary` bg + white text. Inactive chip: border + `COLORS.textSecondary` text. Selecting a chip updates `typeFilter` state; triggers new query with `customer_type` param (undefined for ALL).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-030 | Admin | ALL chip active by default | P1 | 1. Navigate to Customers list. | "ALL" chip has primary background; "Primary Dealer" and "Sub Dealer" chips have border style. | Manual | `mobile/app/customers/index.tsx:49` — `useState<TypeFilter>('ALL')` |
| TC-MOB-CUST-031 | Admin | Tapping "Primary Dealer" chip filters list | P1 | 1. Tap "Primary Dealer" chip. | List shows only Primary Dealer customers. Chip becomes active (primary bg). | E2E | `mobile/app/customers/index.tsx:65` — `customer_type: typeFilter === 'ALL' ? undefined : typeFilter` |
| TC-MOB-CUST-032 | Admin | Tapping "Sub Dealer" chip filters list | P1 | 1. Tap "Sub Dealer" chip. | List shows only Sub Dealer customers. | E2E | `mobile/app/customers/index.tsx:65` |
| TC-MOB-CUST-033 | Admin | Tapping "ALL" restores full list | P1 | 1. Tap "Primary Dealer". 2. Tap "ALL". | All customers visible. "ALL" chip active. | Manual | `mobile/app/customers/index.tsx:210-229` |
| TC-MOB-CUST-034 | Admin | Only one chip active at a time | P2 | 1. Tap "Sub Dealer". 2. Tap "Primary Dealer". | Only "Primary Dealer" chip has active style; "Sub Dealer" reverts to inactive. | Manual | `mobile/app/customers/index.tsx:217` — `active = typeFilter === t` |
| TC-MOB-CUST-035 | Admin | Type chip + search applied simultaneously | P2 | 1. Tap "Primary Dealer". 2. Enter firm name substring. 3. Wait 300ms. | Query includes both `customer_type='Primary Dealer'` and `search` params. | Manual | `mobile/app/customers/index.tsx:60-68` — both params in queryKey + queryFn |

---

## Section 28.6 — Customers list: infinite scroll + pagination + pull-to-refresh

PAGE_SIZE=20, `onEndReachedThreshold=0.4`. Footer shows spinner while loading next page, then "End of list" when no more pages.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-036 | Admin | First page of 20 records loads on mount | P1 | 1. Seed `CUST-MANY` (≥25). 2. Open list. | First 20 records visible. | Manual | `mobile/app/customers/index.tsx:28` — `PAGE_SIZE = 20` |
| TC-MOB-CUST-037 | Admin | Scroll to 40% from bottom triggers next page | P1 | 1. Seed ≥25 customers. 2. Scroll near bottom. | Additional records load; footer spinner appears briefly. | Manual | `mobile/app/customers/index.tsx:250` — `onEndReachedThreshold={0.4}` |
| TC-MOB-CUST-038 | Admin | "End of list" footer text when all pages loaded | P2 | 1. Scroll to bottom of all records. | "End of list" text shown in footer. | Manual | `mobile/app/customers/index.tsx:158-163` — `!query.hasNextPage && items.length > 0` |
| TC-MOB-CUST-039 | Admin | Pull-to-refresh re-fetches list | P1 | 1. Pull down on list. | Spinner on pull indicator. List refreshes. | E2E | `mobile/app/customers/index.tsx:253-258` — `RefreshControl`; `query.isRefetching && !query.isFetchingNextPage` |
| TC-MOB-CUST-040 | Admin | hasNextPage=false stops fetchNextPage call | P2 | 1. Scroll past all records. 2. Scroll again. | No additional API calls fired. | Manual | `mobile/app/customers/index.tsx:75-79` — `if (query.hasNextPage && !query.isFetchingNextPage)` |

---

## Section 28.7 — Customers list: loading + empty state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-041 | Admin | Full-screen spinner while initial load | P1 | 1. Open Customers list on slow network. | Centered `<Spinner>` visible. No FlatList rendered. | Manual | `mobile/app/customers/index.tsx:233-236` — `query.isLoading && items.length === 0` |
| TC-MOB-CUST-042 | Admin | Empty state with people-outline icon when no customers | P1 | 1. Use a backend with zero customers matching current filters. | `people-outline` icon, title "No customers", message "Tap + to add a customer." | Manual | `mobile/app/customers/index.tsx:238-242` — `EmptyState` |
| TC-MOB-CUST-043 | Admin | Empty state shown after search yields no results | P2 | 1. Type a search term that matches no customers. 2. Wait 300ms. | Empty state renders. | Manual | `mobile/app/customers/index.tsx:237-242` — `!query.isLoading && items.length === 0` |
| TC-MOB-CUST-044 | Admin | Empty state shown after type filter yields nothing | P2 | 1. Tap "Sub Dealer" when no Sub Dealer records exist. | Empty state renders. | Manual | Same condition as 043 |
| TC-MOB-CUST-045 | Admin | Inactive customer CUST-INACTIVE appears in list (no active filter) | P2 | 1. View list with "ALL" chip. | `CUST-INACTIVE` card present with red "Inactive" badge. | Manual | `mobile/services/customer.service.ts:13-18` — `getAll` accepts no `is_active` param; all records returned. **[?]55** |

---

## Section 28.8 — Customers list: FAB role gate

FAB is wrapped in `<RoleGate allow={['Admin', 'Supervisor']}>` inside the `CustomersScreen` component, which itself is only rendered for Admin/Supervisor (outer gate). FAB gate is therefore **redundant** — `[?]54`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-046 | Admin | FAB visible for Admin | P1 | 1. Login as Admin. 2. View Customers list. | "+" FAB visible bottom-right. | E2E | `mobile/app/customers/index.tsx:264-272` — inner `<RoleGate allow={['Admin', 'Supervisor']}>` |
| TC-MOB-CUST-047 | Supervisor | FAB visible for Supervisor | P1 | 1. Login as Supervisor. 2. View Customers list. | "+" FAB visible. | E2E | `mobile/app/customers/index.tsx:264` |
| TC-MOB-CUST-048 | Admin | Tapping FAB navigates to /customers/new | P1 | 1. Tap "+" FAB. | Navigates to New Customer form. Title bar "New Customer". | E2E | `mobile/app/customers/index.tsx:267` — `router.push('/customers/new')` |
| TC-MOB-CUST-049 | Admin | FAB gate redundancy: outer RoleGate already restricts screen | P3 | 1. Confirm code: inner RoleGate allow list matches outer allow list. | Both allow `['Admin', 'Supervisor']`. Inner gate is dead defensive code. | Manual | `mobile/app/customers/index.tsx:264` vs `:282` — **[?]54** |

---

## Section 28.9 — Customer create: role gate

Screen `NewCustomerScreenGated` wraps with `<RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView/>}>`. DeniedView message: "You don't have permission to create customers."

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-050 | Admin | Admin accesses New Customer form | P0 | 1. Login as Admin. 2. Navigate to `/customers/new`. | Form renders with "New Customer" title bar. All fields visible. | E2E | `mobile/app/customers/new.tsx:413-418` — outer RoleGate |
| TC-MOB-CUST-051 | Supervisor | Supervisor accesses New Customer form | P0 | 1. Login as Supervisor. 2. Navigate to `/customers/new`. | Form renders. | E2E | `mobile/app/customers/new.tsx:415` |
| TC-MOB-CUST-052 | Warehouse Operator | Warehouse Op sees DeniedView on /customers/new | P0 | 1. Login as Warehouse Op. 2. Deep-link to `/customers/new`. | `lock-closed-outline`, "Not authorized", "You don't have permission to create customers." | Manual | `mobile/app/customers/new.tsx:30-40` DeniedView; `:415` fallback |
| TC-MOB-CUST-053 | Dispatch Operator | Dispatch Op sees DeniedView on /customers/new | P0 | 1. Login as Dispatch Op. 2. Deep-link to `/customers/new`. | Same DeniedView. | Manual | `mobile/app/customers/new.tsx:415` |

---

## Section 28.10 — Customer create: Type toggle

Two pill buttons ("Primary Dealer" / "Sub Dealer"). Default is Primary Dealer. Active pill: `COLORS.primary` bg. Inactive: border + `COLORS.textSecondary`. Switching to Sub Dealer reveals dealer picker section. Switching back to Primary Dealer clears `primaryDealerId`, `primaryDealerName`, and `dealerError`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-054 | Admin | Default type is Primary Dealer | P1 | 1. Open New Customer form. | "Primary Dealer" pill has primary bg; "Sub Dealer" pill has border style. Dealer picker section NOT visible. | Manual | `mobile/app/customers/new.tsx:164` — `useState('Primary Dealer')` |
| TC-MOB-CUST-055 | Admin | Tapping Sub Dealer reveals dealer picker section | P1 | 1. Tap "Sub Dealer" pill. | Dealer picker section appears below type row. "Sub Dealer" pill active. | E2E | `mobile/app/customers/new.tsx:291` — `{isSubDealer && (…)}` |
| TC-MOB-CUST-056 | Admin | Tapping Primary Dealer hides dealer picker | P1 | 1. Tap "Sub Dealer". 2. Tap "Primary Dealer". | Dealer picker section disappears. | E2E | `mobile/app/customers/new.tsx:268-273` — `if (t !== 'Sub Dealer')` clears state |
| TC-MOB-CUST-057 | Admin | Switching back clears primaryDealerId and error | P1 | 1. Tap "Sub Dealer". 2. Select a dealer. 3. Tap "Primary Dealer". | Button text reverts to placeholder; dealerError cleared. | Manual | `mobile/app/customers/new.tsx:269-273` — `setPrimaryDealerId(null)`, `setPrimaryDealerName('')`, `setDealerError('')` |
| TC-MOB-CUST-058 | Admin | Sub Dealer pill active style correct | P2 | 1. Tap "Sub Dealer". | "Sub Dealer" pill has primary bg; "Primary Dealer" reverts to border style. | Manual | `mobile/app/customers/new.tsx:264-286` |

---

## Section 28.11 — Customer create: Primary Dealer picker modal

Full-screen Modal (`animationType="slide"`, `presentationStyle="fullScreen"`). Fetches `['primary-dealers']` via `getPrimaryDealers()` with `staleTime: 60_000`. Filter is **synchronous** (no debounce) — `[?]56`. Autofocus on filter input. `clearButtonMode="while-editing"` (iOS only).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-059 | Admin | Tapping dealer button opens full-screen modal | P1 | 1. Select Sub Dealer type. 2. Tap dealer picker button. | Full-screen modal slides up. Title "Select Primary Dealer". Filter input autofocused. | E2E | `mobile/app/customers/new.tsx:296-311`; modal at `:88-158` |
| TC-MOB-CUST-060 | Admin | Modal loads primary dealers list | P1 | 1. Open dealer picker. | List renders with `CUST-PD-FULL`, `CUST-PD-02`, `CUST-PD-03` entries (firm_name + address if set). | Manual | `mobile/app/customers/new.tsx:184-188` — `useApiQuery(['primary-dealers'], getPrimaryDealers, { staleTime: 60_000 })` |
| TC-MOB-CUST-061 | Admin | Dealer list is cached 60s — no re-fetch within window | P2 | 1. Open picker. Close. 2. Re-open within 60s. | No new `GET /customers/primary-dealers` call. | Manual | `mobile/app/customers/new.tsx:187` — `staleTime: 60_000` |
| TC-MOB-CUST-062 | Admin | Typing in filter input narrows list synchronously | P1 | 1. Open picker. 2. Type partial firm name. | List updates immediately (no 300ms delay). **[?]56** | Manual | `mobile/app/customers/new.tsx:55-58` — `dealers.filter(d => d.firm_name.toLowerCase().includes(…))` |
| TC-MOB-CUST-063 | Admin | Empty state when filter yields no matches | P1 | 1. Type a string that matches no dealers. | `person-outline` icon, title "No primary dealers found", message `No results for "{text}".` | Manual | `mobile/app/customers/new.tsx:143-151` — `filterText` non-empty branch |
| TC-MOB-CUST-064 | Admin | Empty state when no primary dealers exist at all | P2 | 1. Open picker with zero primary dealers in DB. | Message "No primary dealers available." (not the filter message). | Manual | `mobile/app/customers/new.tsx:149` — `filterText` empty branch |
| TC-MOB-CUST-065 | Admin | Tapping a dealer row selects it and closes modal | P1 | 1. Open picker. 2. Tap a dealer row. | Modal closes; dealer picker button now shows selected firm_name. `dealerError` cleared. | E2E | `mobile/app/customers/new.tsx:66-69` — `onPick(item); onClose(); setFilterText('')` |
| TC-MOB-CUST-066 | Admin | Close (X) button dismisses without selecting | P1 | 1. Open picker. 2. Tap X button. | Modal closes. Picker button retains previous state (placeholder or prior selection). | Manual | `mobile/app/customers/new.tsx:101-105` — `onClose(); setFilterText('')` |
| TC-MOB-CUST-067 | Admin | Filter text cleared on close | P2 | 1. Open picker. Type filter text. 2. Tap X. 3. Re-open picker. | Filter input is empty on re-open. | Manual | `mobile/app/customers/new.tsx:68, 102` — `setFilterText('')` on both paths |
| TC-MOB-CUST-068 | Admin | Dealer row shows address below firm name when set | P2 | 1. Ensure `CUST-PD-FULL` has address. 2. Open picker. | Row shows firm name bold + address in secondary style. | Manual | `mobile/app/customers/new.tsx:76-80` — `{item.address ? <Text…> : null}` |
| TC-MOB-CUST-069 | Admin | Dealer row chevron-forward icon visible | P3 | 1. Open picker. | Each row has `chevron-forward` icon on right. | Manual | `mobile/app/customers/new.tsx:82` |
| TC-MOB-CUST-070 | Admin | Loading state shows "Loading…" text while query pending | P2 | 1. Throttle network. 2. Open picker. | "Loading…" text shown instead of list. | Manual | `mobile/app/customers/new.tsx:129-132` — `loading` prop check |

---

## Section 28.12 — Customer create: required-field validation

`firm_name` is the only required field for Primary Dealer. For Sub Dealer, `primary_dealer_id` is also required. Submit button is disabled when `!firmName.trim() || (isSubDealer && !primaryDealerId) || createMutation.isPending`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-071 | Admin | Submit button disabled when firm_name empty | P1 | 1. Open New Customer form. 2. Leave firm_name empty. | "Create Customer" button is disabled (opacity reduced). | Manual | `mobile/app/customers/new.tsx:210-213` — `canSubmit = firmName.trim().length > 0 && …` |
| TC-MOB-CUST-072 | Admin | Tapping Submit with empty firm_name shows error | P1 | 1. Bypass disabled state (or clear after focus). 2. Tap Submit. | `firmNameError` "Firm name is required." shown below firm_name field in red. | Manual | `mobile/app/customers/new.tsx:217-219` |
| TC-MOB-CUST-073 | Admin | firm_name error clears as user types | P2 | 1. Trigger firm_name error. 2. Start typing in firm_name field. | Error text disappears once `v.trim()` is truthy. | Manual | `mobile/app/customers/new.tsx:321` — `onChangeText: if (v.trim()) setFirmNameError('')` |
| TC-MOB-CUST-074 | Admin | Sub Dealer Submit disabled when no primary dealer selected | P1 | 1. Select Sub Dealer type. 2. Leave dealer picker empty. | Submit button disabled. | Manual | `mobile/app/customers/new.tsx:211` — `(!isSubDealer || !!primaryDealerId)` |
| TC-MOB-CUST-075 | Admin | Sub Dealer Submit shows dealer error message | P1 | 1. Select Sub Dealer. 2. Fill firm_name. 3. Bypass disabled + tap Submit. | `dealerError` "Primary dealer is required for Sub Dealers." shown below picker button with error border. | Manual | `mobile/app/customers/new.tsx:223-225`; `:297` border style; `:312` error text |
| TC-MOB-CUST-076 | Admin | Dealer error cleared when dealer selected | P2 | 1. Trigger dealer error. 2. Open picker and select dealer. | Dealer error text disappears. | Manual | `mobile/app/customers/new.tsx:206` — `handlePickDealer: setDealerError('')` |
| TC-MOB-CUST-077 | Admin | Both errors shown simultaneously if both missing | P2 | 1. Select Sub Dealer type. 2. Leave both firm_name and primary_dealer_id empty. 3. Bypass disabled + Submit. | Both firmNameError and dealerError messages visible. | Manual | `mobile/app/customers/new.tsx:215-228` — both branches run before early return |
| TC-MOB-CUST-078 | Admin | Submit enabled for Primary Dealer once firm_name filled | P1 | 1. Type a firm name. Keep type as Primary Dealer. | Submit button becomes enabled. | Manual | `mobile/app/customers/new.tsx:210-213` |

---

## Section 28.13 — Customer create: optional fields

7 optional fields after firm_name. Null coalesced on submit: `field.trim() || null` sent in payload.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-079 | Admin | Address field is multiline (3 rows) | P2 | 1. Tap Address field. | Multi-line text input, minHeight 80, `textAlignVertical="top"`. | Manual | `mobile/app/customers/new.tsx:327-335` — `multiline numberOfLines={3}` |
| TC-MOB-CUST-080 | Admin | Delivery location field present and functional | P2 | 1. Tap Delivery location field. Type value. | Single-line text input, `returnKeyType="next"`. | Manual | `mobile/app/customers/new.tsx:337-343` |
| TC-MOB-CUST-081 | Admin | GSTIN field caps at 15 chars with autoCapitalize=characters | P1 | 1. Type 16-char GSTIN. | Input stops at 15 characters; all characters uppercased. | Manual | `mobile/app/customers/new.tsx:345-352` — `autoCapitalize="characters"` `maxLength={15}` |
| TC-MOB-CUST-082 | Admin | Private marka field present and functional | P2 | 1. Type private marka value. | Value stored; sent in payload. | Manual | `mobile/app/customers/new.tsx:354-360` |
| TC-MOB-CUST-083 | Admin | GR number field present and functional | P2 | 1. Type GR number. | Value stored. `returnKeyType="next"`. | Manual | `mobile/app/customers/new.tsx:362-368` |
| TC-MOB-CUST-084 | Admin | Contact person name field present | P2 | 1. Type contact name. | Value stored. `returnKeyType="next"`. | Manual | `mobile/app/customers/new.tsx:370-376` |
| TC-MOB-CUST-085 | Admin | Contact mobile uses phone-pad keyboard | P1 | 1. Tap Contact person mobile. | Numeric phone keyboard appears (`keyboardType="phone-pad"`). `returnKeyType="done"`. | Manual | `mobile/app/customers/new.tsx:378-385` |
| TC-MOB-CUST-086 | Admin | Empty optional fields sent as null in payload | P2 | 1. Fill only firm_name. 2. Submit. | Intercepted request body shows `address: null, delivery_location: null, …` for all empty optional fields. | API | `mobile/app/customers/new.tsx:233-242` — `field.trim() || null` coalesce pattern |

---

## Section 28.14 — Customer create: submit + mutation + invalidate + router.replace

`createMutation` calls `customerService.create()`. On success: `Haptics.notificationAsync(Success)` + `router.replace('/customers/{id}')`. Invalidates only `['customers']` (not `['customer']` — `[?]58`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-087 | Admin | Successful create navigates to detail via router.replace | P1 | 1. Fill valid Primary Dealer form. 2. Tap Submit. | Brief loading spinner on button. Navigates to new customer detail screen (`/customers/{id}`). Back button not in stack (replaced). | E2E | `mobile/app/customers/new.tsx:196-200` — `router.replace('/customers/${c.id}')` |
| TC-MOB-CUST-088 | Admin | Success haptic fires on create | P2 | 1. Create customer on physical device. | Success haptic feedback felt. | Manual | `mobile/app/customers/new.tsx:197` — `Haptics.notificationAsync(Success)` |
| TC-MOB-CUST-089 | Admin | Success toast/message "Customer created." shown | P1 | 1. Submit valid form. | Toast message "Customer created." visible. | Manual | `mobile/app/customers/new.tsx:194` — `successMessage: 'Customer created.'` |
| TC-MOB-CUST-090 | Admin | Customers list cache invalidated after create | P2 | 1. Create customer. 2. Navigate back to list. | New customer appears in list (cache invalidated, fresh fetch). | Manual | `mobile/app/customers/new.tsx:195` — `invalidateKeys: [['customers']]` |
| TC-MOB-CUST-091 | Admin | Submit button shows loading state during mutation | P1 | 1. Submit on slow network. | "Create Customer" button shows loading spinner; button disabled. | Manual | `mobile/app/customers/new.tsx:390-396` — `Button loading={createMutation.isPending}` |
| TC-MOB-CUST-092 | Admin | Create invalidates only ['customers'] — not ['customer'] key | P3 | 1. Create customer. 2. Inspect React Query devtools cache. | Only `['customers']` key invalidated; no `['customer', id]` key touched. **[?]58** | API | `mobile/app/customers/new.tsx:195` — `invalidateKeys: [['customers']]` only |
| TC-MOB-CUST-093 | Supervisor | Supervisor can create customer (same flow) | P1 | 1. Login as Supervisor. 2. Fill valid form. 3. Submit. | Customer created. Navigates to detail. | E2E | Both Admin and Supervisor have create access |

---

## Section 28.15 — Customer detail: role gate

Screen `CustomerDetailScreenGated` wraps with `<RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView/>}>`. DeniedView message: "You don't have permission to view customers."

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-094 | Admin | Admin accesses customer detail | P0 | 1. Login as Admin. 2. Navigate to `/customers/{id}`. | Detail screen renders with action card + detail card. | E2E | `mobile/app/customers/[id].tsx:579-584` — outer RoleGate |
| TC-MOB-CUST-095 | Supervisor | Supervisor accesses customer detail | P0 | 1. Login as Supervisor. 2. Navigate to `/customers/{id}`. | Detail renders. | E2E | `mobile/app/customers/[id].tsx:581` |
| TC-MOB-CUST-096 | Warehouse Operator | Warehouse Op sees DeniedView on detail | P0 | 1. Login as Warehouse Op. 2. Deep-link to `/customers/{id}`. | `lock-closed-outline`, "Not authorized", "You don't have permission to view customers." | Manual | `mobile/app/customers/[id].tsx:30-40`; `:581` fallback |
| TC-MOB-CUST-097 | Dispatch Operator | Dispatch Op sees DeniedView on detail | P0 | 1. Login as Dispatch Op. 2. Deep-link to `/customers/{id}`. | Same DeniedView. | Manual | `mobile/app/customers/[id].tsx:581` |

---

## Section 28.16 — Customer detail: data load + not-found state

Uses `useApiQuery(['customer', id], customerService.getById(id), { enabled: !!id })`. Full-screen spinner while loading. Not-found state when query returns no data (deleted record).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-098 | Admin | Full-screen spinner while customer loads | P1 | 1. Open detail on slow network. | Centered `<Spinner>` shown. Stack.Screen title "Customer" (fallback). | Manual | `mobile/app/customers/[id].tsx:298-307` — `customerQuery.isLoading` branch |
| TC-MOB-CUST-099 | Admin | Not-found state for deleted/non-existent customer | P1 | 1. Navigate to `/customers/{CUST-NONEXIST}`. | `person-outline` icon, "Customer not found", "This customer may have been deleted." | Manual | `mobile/app/customers/[id].tsx:309-322` — `!customer` branch |
| TC-MOB-CUST-100 | Admin | Customer data populates view mode on load | P1 | 1. Navigate to `/customers/{CUST-PD-FULL}`. | Detail card shows all populated fields. | Manual | `mobile/app/customers/[id].tsx:211-225` — `useEffect` syncs form from customer data |

---

## Section 28.17 — Customer detail: View mode rendering

Card contains: firm_name (large bold) + customer_type badge + optional inactive badge + divider + SummaryRows for each optional field. `SummaryRow` returns `null` when value is null/undefined. Primary dealer SummaryRow shows only for Sub Dealers.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-101 | Admin | Header shows firm_name bold + type badge | P1 | 1. View `CUST-PD-FULL` detail. | Large bold firm_name + "Primary Dealer" badge (COLORS.info). | Manual | `mobile/app/customers/[id].tsx:392-396` — `detailHeader` row |
| TC-MOB-CUST-102 | Admin | Inactive badge shown in view mode for is_active=false | P1 | 1. View `CUST-INACTIVE` detail. | Red "Inactive" badge right-aligned below header. | Manual | `mobile/app/customers/[id].tsx:398-403` — `!customer.is_active` guard |
| TC-MOB-CUST-103 | Admin | Divider rendered between header and SummaryRows | P2 | 1. View any customer detail. | Horizontal `<View style={styles.divider}/>` visible. | Manual | `mobile/app/customers/[id].tsx:404` |
| TC-MOB-CUST-104 | Admin | SummaryRow for Address shown when set | P2 | 1. View `CUST-PD-FULL`. | "Address" label + value visible. | Manual | `mobile/app/customers/[id].tsx:406` |
| TC-MOB-CUST-105 | Admin | SummaryRow returns null when value null | P2 | 1. View `CUST-PD-MINIMAL` (all optional fields null). | No SummaryRow rows rendered (no address, contact, GSTIN, etc.). | Manual | `mobile/app/customers/[id].tsx:44-45` — `if (!value) return null` |
| TC-MOB-CUST-106 | Admin | Primary dealer SummaryRow visible for Sub Dealer | P1 | 1. View `CUST-SD-01` detail. | "Primary dealer" row shows `primary_dealer_name` value. | Manual | `mobile/app/customers/[id].tsx:413-418` — `customer.customer_type === 'Sub Dealer'` guard |
| TC-MOB-CUST-107 | Admin | Primary dealer SummaryRow hidden for Primary Dealer | P1 | 1. View `CUST-PD-FULL` detail. | No "Primary dealer" SummaryRow. | Manual | `mobile/app/customers/[id].tsx:413` — conditional on `'Sub Dealer'` |
| TC-MOB-CUST-108 | Admin | Primary dealer SummaryRow falls back to primary_dealer_id when name null | P3 | 1. Create Sub Dealer where primary_dealer_name is null (edge case). 2. View detail. | "Primary dealer" row shows `primary_dealer_id` UUID as fallback. **[?]59** | Manual | `mobile/app/customers/[id].tsx:416` — `customer.primary_dealer_name ?? customer.primary_dealer_id` |

---

## Section 28.18 — Customer detail: Edit toggle + dynamic Stack.Screen title

"Edit" button in action card (top). `create-outline` icon. Tapping sets `isEditing=true`. Title becomes "Edit Customer". Reverting: Cancel or successful Save → `isEditing=false` → title reverts to `customer.firm_name` (or "Customer" fallback — `[?]59`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-109 | Admin | Edit button visible in view mode | P1 | 1. View any customer detail. | Right-aligned "Edit" button with `create-outline` icon in action card. | Manual | `mobile/app/customers/[id].tsx:346-354` — `!isEditing` branch |
| TC-MOB-CUST-110 | Admin | Tapping Edit enters edit mode | P1 | 1. Tap "Edit". | Action card switches to Cancel + Save buttons. Form fields appear. Detail card hidden. | E2E | `mobile/app/customers/[id].tsx:349` — `setIsEditing(true)` |
| TC-MOB-CUST-111 | Admin | Title changes to "Edit Customer" in edit mode | P1 | 1. Tap "Edit". | Stack.Screen title = "Edit Customer". | Manual | `mobile/app/customers/[id].tsx:333` — `isEditing ? 'Edit Customer' : (customer.firm_name ?? 'Customer')` |
| TC-MOB-CUST-112 | Admin | Title reverts to firm_name after exiting edit | P1 | 1. Enter edit mode. 2. Tap Cancel. | Title returns to `customer.firm_name`. | Manual | `mobile/app/customers/[id].tsx:333` |
| TC-MOB-CUST-113 | Admin | firm_name empty-string edge case: title falls to "Customer" | P3 | 1. Manipulate customer to have `firm_name = ''` (not null). 2. View detail. | Title shows "Customer" fallback. **[?]59** | Manual | `mobile/app/customers/[id].tsx:333` — `??` catches null/undefined but not `''` |

---

## Section 28.19 — Customer detail: Edit mode

Edit mode renders same Type toggle + DealerPickerModal + 8 form fields as create screen, but pre-populated from loaded `customer` object. Same validation rules apply.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-114 | Admin | Edit mode pre-populates all fields from loaded customer | P1 | 1. View `CUST-PD-FULL`. 2. Tap Edit. | All fields pre-filled: customerType, firmName, address, deliveryLocation, gstin, privateMarka, gr, contactName, contactMobile. | Manual | `mobile/app/customers/[id].tsx:211-225` — useEffect on customer load |
| TC-MOB-CUST-115 | Admin | Sub Dealer edit pre-populates primary dealer | P1 | 1. View `CUST-SD-01`. 2. Tap Edit. | Dealer picker button shows `CUST-PD-FULL` firm name; `primaryDealerId` set. | Manual | `mobile/app/customers/[id].tsx:222-223` — `setPrimaryDealerId` / `setPrimaryDealerName` |
| TC-MOB-CUST-116 | Admin | Changing type in edit mode from Sub→Primary clears dealer | P1 | 1. Edit `CUST-SD-01`. 2. Tap "Primary Dealer" pill. | Dealer picker hidden; primaryDealerId cleared; dealerError cleared. | Manual | `mobile/app/customers/[id].tsx:437-442` — same clear logic as create |
| TC-MOB-CUST-117 | Admin | GSTIN field has maxLength=15 and autoCapitalize=characters in edit | P1 | 1. Tap Edit. 2. Type 16-char value in GSTIN field. | Stops at 15; uppercased. | Manual | `mobile/app/customers/[id].tsx:520-527` |
| TC-MOB-CUST-118 | Admin | Contact mobile uses phone-pad in edit mode | P2 | 1. Tap Edit. 2. Tap Contact mobile field. | Phone keyboard opens. | Manual | `mobile/app/customers/[id].tsx:553-559` |
| TC-MOB-CUST-119 | Admin | Save button disabled while firm_name empty in edit | P1 | 1. Enter edit mode. 2. Clear firm_name field. | Save button disabled/dimmed. | Manual | `mobile/app/customers/[id].tsx:365-375` — inline disabled check on TouchableOpacity |
| TC-MOB-CUST-120 | Admin | Save button uses inline disabled style (not Button component) | P3 | 1. Enter edit mode. 2. Inspect Save button. | Save is `<TouchableOpacity>` with `styles.saveBtnDisabled` (opacity 0.5), not `<Button disabled>`. **[?]60** | Manual | `mobile/app/customers/[id].tsx:364-385` |

---

## Section 28.20 — Customer detail: Save mutation

`updateMutation` PUT via `customerService.update(id, payload)`. Invalidates `['customers']` AND `['customer', id]`. `successMessage: 'Customer updated.'`. `onSuccess: () => setIsEditing(false)`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-121 | Admin | Successful save shows "Customer updated." toast | P1 | 1. Edit any field. 2. Tap Save. | Toast "Customer updated." visible. | Manual | `mobile/app/customers/[id].tsx:231` — `successMessage: 'Customer updated.'` |
| TC-MOB-CUST-122 | Admin | Save exits edit mode on success | P1 | 1. Edit and save. | After success: edit mode exits; view mode shown with updated data. | E2E | `mobile/app/customers/[id].tsx:233` — `onSuccess: () => setIsEditing(false)` |
| TC-MOB-CUST-123 | Admin | Save invalidates both ['customers'] and ['customer', id] | P2 | 1. Save edit. 2. Inspect RQ cache. | Both `['customers']` and `['customer', id]` cache entries invalidated. | Manual | `mobile/app/customers/[id].tsx:232` — `invalidateKeys: [['customers'], ['customer', id ?? '']]` |
| TC-MOB-CUST-124 | Admin | Save button shows "Saving…" text while pending | P1 | 1. Tap Save on slow network. | Save button text changes to "Saving…". | Manual | `mobile/app/customers/[id].tsx:379-383` — `updateMutation.isPending` branch |
| TC-MOB-CUST-125 | Admin | Updated customer_type change persisted | P1 | 1. Edit Primary Dealer. 2. Change to Sub Dealer + select primary dealer. 3. Save. | Customer type updated to Sub Dealer. Primary dealer SummaryRow now visible. | E2E | `mobile/app/customers/[id].tsx:290` — `customer_type: customerType` in payload |
| TC-MOB-CUST-126 | Supervisor | Supervisor can save customer edit | P1 | 1. Login as Supervisor. 2. Edit any field. 3. Save. | Update succeeds. | E2E | Both Admin and Supervisor have edit access |

---

## Section 28.21 — Customer detail: Cancel resets form to loaded customer + clears errors

`handleCancelEdit` copies all fields from `customer` object back to form state, clears both `firmNameError` and `dealerError`, sets `isEditing=false`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-127 | Admin | Cancel discards text edits | P1 | 1. Enter edit mode. 2. Change firm_name to something different. 3. Tap Cancel. | firm_name field reverts to original `customer.firm_name`. View mode resumes. | E2E | `mobile/app/customers/[id].tsx:237-254` — `handleCancelEdit` resets all state |
| TC-MOB-CUST-128 | Admin | Cancel clears firmNameError | P2 | 1. Enter edit mode. 2. Clear firm_name (triggering error). 3. Tap Cancel. | firmNameError disappears. | Manual | `mobile/app/customers/[id].tsx:252` — `setFirmNameError('')` |
| TC-MOB-CUST-129 | Admin | Cancel clears dealerError | P2 | 1. Enter edit on Sub Dealer. 2. Trigger dealer error. 3. Tap Cancel. | dealerError disappears. | Manual | `mobile/app/customers/[id].tsx:253` — `setDealerError('')` |
| TC-MOB-CUST-130 | Admin | Cancel reverts type change | P1 | 1. Edit Sub Dealer. 2. Switch to Primary Dealer pill. 3. Cancel. | customerType reverts to "Sub Dealer". | Manual | `mobile/app/customers/[id].tsx:240` — `setCustomerType(customer.customer_type)` |
| TC-MOB-CUST-131 | Admin | Cancel restores primary dealer selection | P1 | 1. Edit Sub Dealer. 2. Change primary dealer in picker. 3. Cancel. | Picker button shows original dealer name. | Manual | `mobile/app/customers/[id].tsx:249-250` — `setPrimaryDealerId` / `setPrimaryDealerName` from customer |

---

## Section 28.22 — Customer detail: missing functionality (no delete, no deactivate UI)

No delete button on detail screen. `customerService` has no `remove` method. No activate/deactivate toggle — `is_active` is display-only (inactive badge). `[?]52`, `[?]53`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-CUST-132 | Admin | No delete button on customer detail | P1 | 1. View customer detail (view mode and edit mode). | No delete/trash button anywhere on screen. | Manual | `mobile/app/customers/[id].tsx` — no delete UI; `mobile/services/customer.service.ts` — no `remove` method. **[?]52** |
| TC-MOB-CUST-133 | Admin | No deactivate/activate toggle on detail | P1 | 1. View `CUST-INACTIVE` detail. | "Inactive" badge displayed; no button to toggle `is_active`. | Manual | `mobile/app/customers/[id].tsx:398-403` — display only. **[?]53** |
| TC-MOB-CUST-134 | Admin | Inactive badge NOT shown in edit mode | P2 | 1. View `CUST-INACTIVE`. 2. Tap Edit. | Edit mode renders form only; inactive badge is part of view-only card (hidden during edit). | Manual | `mobile/app/customers/[id].tsx:390` — `{!isEditing && (<Card…>)}` |
| TC-MOB-CUST-135 | Admin | customerService has no remove method | P1 | 1. Inspect `mobile/services/customer.service.ts`. | Only `getAll, getById, create, update, getPrimaryDealers` exported. No `remove`. **[?]52** | Manual | `mobile/services/customer.service.ts:12-42` |

---

## Section 28.23 — Users module: Menu tile

Users tile is in `<RoleGate allow={['Admin']}>` — Admin-only. Supervisor, Warehouse Op, Dispatch Op do not see it. Tile routes to `/users`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-USER-001 | Admin | Admin sees Users tile in Menu | P0 | 1. Login as Admin. 2. Navigate to Menu tab. | "Users" tile visible (`person-add-outline` icon, `COLORS.accent` tint). | E2E | `mobile/app/(tabs)/menu.tsx:99-101` — `<RoleGate allow={['Admin']}>` |
| TC-MOB-USER-002 | Supervisor | Supervisor does NOT see Users tile | P0 | 1. Login as Supervisor. 2. Navigate to Menu. | No "Users" tile in grid. | E2E | `mobile/app/(tabs)/menu.tsx:99` — Supervisor not in allow list |
| TC-MOB-USER-003 | Warehouse Operator | Warehouse Op does NOT see Users tile | P0 | 1. Login as Warehouse Op. 2. Navigate to Menu. | No "Users" tile. | Manual | `mobile/app/(tabs)/menu.tsx:99` |
| TC-MOB-USER-004 | Dispatch Operator | Dispatch Op does NOT see Users tile | P0 | 1. Login as Dispatch Op. 2. Navigate to Menu. | No "Users" tile. | Manual | `mobile/app/(tabs)/menu.tsx:99` |

---

## Section 28.24 — Users module: /users route has no screen (unmatched route)

`mobile/app/users/` directory does not exist. Expo-router serves its `_unmatched.tsx` (or blank screen) when `/users` is navigated to. `user.service.ts` exists with full CRUD but has no UI consumer. **Real product gap — [?]51, [?]62.**

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-USER-005 | Admin | Tapping Users tile shows unmatched/blank screen | P0 | 1. Login as Admin. 2. Tap "Users" tile. | Expo-router unmatched route renders (blank screen or default unmatched UI). No crash. **[?]51** | E2E | `mobile/app/(tabs)/menu.tsx:100` routes to `/users`; `mobile/app/users/` does not exist |
| TC-MOB-USER-006 | Admin | No users list screen exists in codebase | P0 | 1. Inspect `mobile/app/users/` directory. | Directory absent. No `index.tsx`, `new.tsx`, or `[id].tsx`. | Manual | Gap: `mobile/app/users/` — **[?]51** |
| TC-MOB-USER-007 | Admin | user.service.ts declares full CRUD but has no UI consumer | P1 | 1. Inspect `mobile/services/user.service.ts`. | `getAll, getById, create, update, remove` all declared. No screen imports the service. **[?]62** | Manual | `mobile/services/user.service.ts:13-33` — dead code on mobile |
| TC-MOB-USER-008 | Admin | Deep-linking to /users does not crash app | P1 | 1. Programmatically navigate to `/users`. | App does not crash. Expo-router unmatched fallback renders gracefully. | Manual | `mobile/app/(tabs)/menu.tsx:100` — production Admin users will hit this |

---

## Maestro flows index

| Flow name | File path | Covers |
|---|---|---|
| `customers-list-warehouse-denied` | `mobile/.maestro/customers/customers-list-warehouse-denied.yaml` | 28.2 — TC-MOB-CUST-008 (Warehouse Op DeniedView) |
| `customers-list-search-and-clear` | `mobile/.maestro/customers/customers-list-search-and-clear.yaml` | 28.4 — TC-MOB-CUST-023, TC-MOB-CUST-027 |
| `customers-list-type-filter` | `mobile/.maestro/customers/customers-list-type-filter.yaml` | 28.5 — TC-MOB-CUST-031, TC-MOB-CUST-032, TC-MOB-CUST-033 |
| `customers-create-primary-dealer` | `mobile/.maestro/customers/customers-create-primary-dealer.yaml` | 28.9–28.13, 28.14 — happy path Primary Dealer create |
| `customers-create-sub-dealer-with-picker` | `mobile/.maestro/customers/customers-create-sub-dealer-with-picker.yaml` | 28.10, 28.11, 28.14 — Sub Dealer create with picker selection |
| `customers-create-validation` | `mobile/.maestro/customers/customers-create-validation.yaml` | 28.12 — TC-MOB-CUST-072, TC-MOB-CUST-075 (missing firm_name; missing primary dealer) |
| `customers-detail-edit-and-save` | `mobile/.maestro/customers/customers-detail-edit-and-save.yaml` | 28.18–28.20 — enter edit, change field, save, verify view mode |
| `customers-detail-cancel-edit-restores` | `mobile/.maestro/customers/customers-detail-cancel-edit-restores.yaml` | 28.21 — TC-MOB-CUST-127, TC-MOB-CUST-130 |
| `users-tile-admin-only` | `mobile/.maestro/users/users-tile-admin-only.yaml` | 28.23 — TC-MOB-USER-001 (Admin sees), TC-MOB-USER-002 (Supervisor doesn't) |
| `users-tile-tap-unmatched-route` | `mobile/.maestro/users/users-tile-tap-unmatched-route.yaml` | 28.24 — TC-MOB-USER-005 (tap Users tile, document unmatched behavior) |

### Sample Maestro flow — `customers-create-primary-dealer.yaml`

```yaml
# mobile/.maestro/customers/customers-create-primary-dealer.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- tapOn: "Menu"                       # bottom tab
- tapOn: "Customers"                  # menu tile (Admin only)
- tapOn:
    id: "fab"                         # "+" FAB
- assertVisible: "New Customer"       # Stack.Screen title
- tapOn: "Firm name *"
- inputText: "E2E Test Dealer"
- tapOn: "GSTIN"
- inputText: "27AABCU9603R1ZX"
- tapOn: "Create Customer"
- assertVisible: "Customer created."
- assertNotVisible: "New Customer"    # router.replace removed this from stack
```

### Sample Maestro flow — `customers-create-sub-dealer-with-picker.yaml`

```yaml
# mobile/.maestro/customers/customers-create-sub-dealer-with-picker.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- tapOn: "Menu"
- tapOn: "Customers"
- tapOn:
    id: "fab"
- assertVisible: "New Customer"
- tapOn: "Sub Dealer"                 # type pill
- assertVisible: "Tap to select primary dealer…"
- tapOn: "Tap to select primary dealer…"
- assertVisible: "Select Primary Dealer"   # modal title
- inputText: "CUST-PD-FULL firm name"     # filter input autofocused
- tapOn: "CUST-PD-FULL firm name"         # dealer row
- assertNotVisible: "Select Primary Dealer"
- tapOn: "Firm name *"
- inputText: "E2E Sub Dealer"
- tapOn: "Create Customer"
- assertVisible: "Customer created."
```

---

## Open questions / `[?]` flags

| # | Flag | Location | Description |
|---|---|---|---|
| 51 | REAL GAP — Users tile routes to unmatched screen | `mobile/app/(tabs)/menu.tsx:100` | Admin-only "Users" tile routes to `/users` but `mobile/app/users/` directory does not exist. Expo-router serves unmatched route (blank screen or `_unmatched.tsx`). Either remove the tile or build the screen. |
| 52 | No delete for customers on mobile | `mobile/services/customer.service.ts:12-42` | `customerService` declares `getAll/getById/create/update/getPrimaryDealers` only — no `remove`. Detail screen has no delete UI. Admin/Supervisor cannot delete customers from mobile. |
| 53 | No activate/deactivate toggle on customer detail | `mobile/app/customers/[id].tsx:398-403` | `is_active` displayed as inactive badge but not editable. To reactivate an inactive customer, web app is required. |
| 54 | FAB RoleGate redundant with screen gate | `mobile/app/customers/index.tsx:264` vs `:282` | Inner `<RoleGate allow={['Admin', 'Supervisor']}>` on FAB is inside a screen already gated for the same roles. Dead defensive code or intentional belt-and-suspenders. |
| 55 | `getAll` accepts no `is_active` filter param | `mobile/services/customer.service.ts:13-18` | Params: `{page, limit, search, customer_type}` only. Web exposes `is_active` filter; mobile cannot filter inactive customers. No "Show inactive" toggle in UI. |
| 56 | DealerPickerModal filter has no debounce | `mobile/app/customers/new.tsx:55-58` | Client-side filter runs synchronously on every keystroke. Contrast: CustomerPicker in dispatch/samples uses 300ms debounce. Could lag at hundreds of primary dealers. |
| 57 | DealerPickerModal duplicated between new.tsx and [id].tsx | `mobile/app/customers/new.tsx:52-158`; `mobile/app/customers/[id].tsx:64-168` | Near-identical component defined twice. Refactor opportunity: lift to `mobile/components/DealerPickerModal.tsx`. Similar to CustomerPicker duplication (issue #48). |
| 58 | Customer create invalidates only `['customers']`, not `['customer']` | `mobile/app/customers/new.tsx:195` | On create, only list cache cleared. Cosmetically harmless (no detail cache exists for new record), but inconsistent with detail update which invalidates both keys (`[id].tsx:232`). |
| 59 | Stack.Screen title fallback "Customer" doesn't catch empty-string firm_name | `mobile/app/customers/[id].tsx:333` | `customer.firm_name ?? 'Customer'` — `??` catches null/undefined only. If `firm_name` is `''` (empty string), title would be blank. Edge case but worth a TC. |
| 60 | Save button in edit mode uses inline disabled TouchableOpacity (not `<Button>`) | `mobile/app/customers/[id].tsx:364-385` | Rolls own `TouchableOpacity` + `styles.saveBtnDisabled` styling. Rest of app uses `<Button disabled={…}>`. Minor inconsistency. |
| 61 | No haptic on DealerPicker tap | `mobile/app/customers/new.tsx:66-69` | Only mutation-success haptic fires. Dealer picker row taps have no tactile feedback. Same pattern in dispatch CustomerPicker. |
| 62 | `user.service.ts` is dead code on mobile | `mobile/services/user.service.ts:13-33` | Full CRUD declared (`getAll/getById/create/update/remove`). No screen, hook, or component imports it. Either remove or implement users screens. |
| 63 | Primary dealer SummaryRow falls back to `primary_dealer_id` UUID if name is null | `mobile/app/customers/[id].tsx:416` | `customer.primary_dealer_name ?? customer.primary_dealer_id` — if name is null (data inconsistency), a UUID is shown to the user instead of a human-readable name. |
| 64 | DealerPickerModal `loading` branch shows plain "Loading…" text, not a Spinner component | `mobile/app/customers/new.tsx:129-132`; `mobile/app/customers/[id].tsx:139-142` | Inconsistent with other loading states that use `<Spinner>`. Minor UX inconsistency. |

---

*Phase 28 authored by Claude Sonnet 4.6 on 2026-05-11. Source files read: `mobile/app/customers/index.tsx`, `mobile/app/customers/new.tsx`, `mobile/app/customers/[id].tsx`, `mobile/services/customer.service.ts`, `mobile/services/user.service.ts`, `mobile/app/(tabs)/menu.tsx`, `mobile/components/RoleGate.tsx`, `docs/test-cases-v3/phase-27-mobile-dispatch.md`.*

