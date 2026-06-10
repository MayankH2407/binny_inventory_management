# Phase 27 — Mobile Dispatch (List, Create, Detail)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/dispatch` list, `/dispatch/create`, `/dispatch/[id]` detail
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 27.1 — List: role-agnostic view](#section-271--list-role-agnostic-view)
- [Section 27.2 — List: card rendering (displayBarcode fallback, customer-or-muted, article summary, meta line, destination)](#section-272--list-card-rendering)
- [Section 27.3 — List: source-type chip rendering (Carton / Sample / E-commerce)](#section-273--list-source-type-chip-rendering)
- [Section 27.4 — List: search input (300ms debounce + X clear)](#section-274--list-search-input)
- [Section 27.5 — List: date range filter — From/To TextInputs + 300ms debounce + silent toISO rejection](#section-275--list-date-range-filter)
- [Section 27.6 — List: quick-select chips (Today / Last 7 / Last 30 / conditional Clear)](#section-276--list-quick-select-chips)
- [Section 27.7 — List: infinite scroll + pagination + pull-to-refresh](#section-277--list-infinite-scroll--pagination--pull-to-refresh)
- [Section 27.8 — List: empty state](#section-278--list-empty-state)
- [Section 27.9 — List: FAB role gate — NEW PATTERN (Dispatch Op in; Warehouse Op out)](#section-279--list-fab-role-gate)
- [Section 27.10 — Create: role gate (Admin/Sup/Dispatch allowed; Warehouse DeniedView)](#section-2710--create-role-gate)
- [Section 27.11 — Create: source segmented picker (3 tabs, default master_carton, styling)](#section-2711--create-source-segmented-picker)
- [Section 27.12 — Create: switchSource state management](#section-2712--create-switchsource-state-management)
- [Section 27.13 — Create: Master Carton scan path](#section-2713--create-master-carton-scan-path)
- [Section 27.14 — Create: Sample scan + manual entry](#section-2714--create-sample-scan--manual-entry)
- [Section 27.15 — Create: E-commerce scan + manual entry](#section-2715--create-e-commerce-scan--manual-entry)
- [Section 27.16 — Create: Customer picker modal](#section-2716--create-customer-picker-modal)
- [Section 27.17 — Create: shared optional details form](#section-2717--create-shared-optional-details-form)
- [Section 27.18 — Create: submit validation order + dynamic submit label](#section-2718--create-submit-validation-order--dynamic-submit-label)
- [Section 27.19 — Create: submit mutation + invalidate-keys gap + router.replace destination](#section-2719--create-submit-mutation--invalidate-keys-gap--routerreplace-destination)
- [Section 27.20 — Detail: data load + not-found + pull-to-refresh](#section-2720--detail-data-load--not-found--pull-to-refresh)
- [Section 27.21 — Detail: header card (displayBarcode fallback, source chip, dispatch_date)](#section-2721--detail-header-card)
- [Section 27.22 — Detail: Customer card](#section-2722--detail-customer-card)
- [Section 27.23 — Detail: Source card + "View source record" jump-link](#section-2723--detail-source-card--view-source-record-jump-link)
- [Section 27.24 — Detail: Shipment card (conditional)](#section-2724--detail-shipment-card)
- [Section 27.25 — Detail: Contents card](#section-2725--detail-contents-card)
- [Section 27.26 — Detail: Notes card (conditional)](#section-2726--detail-notes-card)
- [Section 27.27 — Detail: Audit footer (Dispatched at + conditional Record created)](#section-2727--detail-audit-footer)
- [Section 27.28 — Negative / edge cases](#section-2728--negative--edge-cases)
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
| `DSP-CARTON-01` | Dispatch from Master Carton, `source_type='master_carton'`, `customer_firm_name` set, `lr_number` set, `article_summary` set, `destination` set. | — | 27.1, 27.2, 27.3, 27.20, 27.21, 27.22, 27.23, 27.24, 27.25 |
| `DSP-SAMPLE-01` | Dispatch from Sample, `source_type='sample'`, `sample_record_id` set, `source_label` set. All shipment fields null. Notes set. | — | 27.1, 27.2, 27.3, 27.21, 27.22, 27.23, 27.24, 27.25, 27.26 |
| `DSP-EC-01` | Dispatch from E-commerce, `source_type='ecommerce'`, `ecommerce_record_id` set, `source_label` set. | — | 27.1, 27.2, 27.3, 27.21, 27.23, 27.25 |
| `DSP-NO-CUSTOMER` | Dispatch where `customer_firm_name=null` (legacy or no-customer dispatch). | — | 27.2, 27.22 |
| `DSP-NO-SHIPMENT` | Dispatch where destination, transport_details, lr_number, vehicle_number all null. | — | 27.24 |
| `DSP-DIFF-DAYS` | Dispatch where `created_at` and `dispatch_date` are on different calendar days. | — | 27.27 |
| `DSP-SAME-DAY` | Dispatch where `created_at` and `dispatch_date` are on the same calendar day. | — | 27.27 |
| `DSP-LEGACY-TERNARY` | Dispatch where `source_type=null` AND `master_carton_id=null` (legacy record) — exercises ternary fallback bug. | — | 27.3, 27.28 |
| `DSP-NULL-LABEL` | Dispatch where `source_label=null` and `carton_barcode` is set — exercises second rung of displayBarcode chain. | — | 27.2, 27.21 |
| `DSP-NULL-BOTH` | Dispatch where `source_label=null` and `carton_barcode=null` — displayBarcode falls through to `'—'`. | — | 27.2, 27.21 |
| `DSP-MANY` | ≥25 dispatches for pagination test. | — | 27.7 |
| `MC-CLOSED-01` | CLOSED master carton with `child_count≥1`, short barcode e.g. `MC1A2B3C`. | CLOSED | 27.13, 27.19 |
| `MC-CLOSED-02` | Second CLOSED master carton (different barcode) for multi-carton scan. | CLOSED | 27.13 |
| `MC-ACTIVE-01` | ACTIVE master carton. | ACTIVE | 27.13, 27.28 |
| `MC-CREATED-01` | CREATED master carton (empty). | CREATED | 27.13 |
| `MC-DISPATCHED-01` | DISPATCHED master carton. | DISPATCHED | 27.13 |
| `SR-CLOSED-01` | CLOSED sample record, short barcode e.g. `SR1A2B3C`. | CLOSED | 27.14, 27.19 |
| `SR-ACTIVE-01` | ACTIVE sample record. | ACTIVE | 27.14, 27.28 |
| `SR-CREATED-01` | CREATED sample record (no boxes). | CREATED | 27.14 |
| `SR-DISPATCHED-01` | DISPATCHED sample record. | DISPATCHED | 27.14 |
| `EC-CLOSED-01` | CLOSED e-commerce record, short barcode e.g. `EC1A2B3C`. | CLOSED | 27.15, 27.19 |
| `EC-ACTIVE-01` | ACTIVE e-commerce record. | ACTIVE | 27.15, 27.28 |
| `EC-CREATED-01` | CREATED e-commerce record (no boxes). | CREATED | 27.15 |
| `EC-DISPATCHED-01` | DISPATCHED e-commerce record. | DISPATCHED | 27.15 |
| `CUST-01` | Customer A with address set. | — | 27.16, 27.18, 27.19 |
| `CUST-02` | Customer B — second customer for picker pagination. | — | 27.16 |
| `MC-LEGACY-01` | **[SKIP-POST-MIGRATION]** Legacy `BINNY-MC-{uuid}` master carton. | — | 27.13, 27.28 |
| `SR-LEGACY-01` | **[SKIP-POST-MIGRATION]** Legacy `BINNY-SR-{uuid}` sample record. | — | 27.14 |
| `EC-LEGACY-01` | **[SKIP-POST-MIGRATION]** Legacy `BINNY-EC-{uuid}` e-commerce record. | — | 27.15 |

---

## Section 27.1 — List: role-agnostic view

All 4 roles can access the Dispatch list. No `RoleGate` wraps the list screen. FAB visibility differs (see 27.9).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-001 | Admin | Admin can access Dispatch list | P0 | 1. Login as Admin. 2. Navigate to Dispatches. 3. Observe. | Title bar "Dispatches". Search bar visible. Date range filter visible. Cards render. No "Not authorized". | E2E | `mobile/app/dispatch/index.tsx:238` — `Stack.Screen title='Dispatches'`; no RoleGate on list |
| TC-MOB-DSP-002 | Supervisor | Supervisor can access Dispatch list | P0 | 1. Login as Supervisor. 2. Navigate to Dispatches. | List renders identically to Admin view. | E2E | All 4 roles have list access |
| TC-MOB-DSP-003 | Warehouse Operator | Warehouse Op can access Dispatch list | P0 | 1. Login as Warehouse Op. 2. Navigate to Dispatches. | List renders. FAB **hidden**. No denial message. | E2E | `mobile/app/dispatch/index.tsx:375` — RoleGate excludes Warehouse Op from FAB |
| TC-MOB-DSP-004 | Dispatch Operator | Dispatch Op can access Dispatch list | P0 | 1. Login as Dispatch Op. 2. Navigate to Dispatches. | List renders. FAB **visible** (Dispatch Op included). | E2E | First module where Dispatch Op sees FAB; `mobile/app/dispatch/index.tsx:375` |

---

## Section 27.2 — List: card rendering

Tests `displayBarcode` fallback chain, customer-or-muted, article summary, meta line parts, and destination line.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-005 | Admin | displayBarcode uses source_label when set | P1 | 1. Seed `DSP-CARTON-01` (source_label set). 2. View list. | Row 1 barcode = `source_label` value (not `carton_barcode`). | Manual | `mobile/app/dispatch/index.tsx:158` — `source_label ?? carton_barcode ?? '—'` |
| TC-MOB-DSP-006 | Admin | displayBarcode falls to carton_barcode when source_label null | P1 | 1. Seed `DSP-NULL-LABEL`. 2. View list. | Row 1 barcode = `carton_barcode` value. | Manual | `mobile/app/dispatch/index.tsx:158` |
| TC-MOB-DSP-007 | Admin | displayBarcode shows '—' when both source_label and carton_barcode null | P1 | 1. Seed `DSP-NULL-BOTH`. 2. View list. | Row 1 barcode = `—`. | Manual | `mobile/app/dispatch/index.tsx:158` |
| TC-MOB-DSP-008 | Admin | Customer firm name renders when set | P1 | 1. View `DSP-CARTON-01` card. | Customer line shows firm name in standard text color. | Manual | `mobile/app/dispatch/index.tsx:188` |
| TC-MOB-DSP-009 | Admin | Muted "— No customer —" when customer_firm_name null | P1 | 1. View `DSP-NO-CUSTOMER` card. | Customer line shows `— No customer —` in `COLORS.textSecondary`. | Manual | `mobile/app/dispatch/index.tsx:188` — applies `styles.mutedText` style |
| TC-MOB-DSP-010 | Admin | Article summary line renders when set | P2 | 1. View `DSP-CARTON-01` (article_summary set). | Article summary text visible below customer line. | Manual | `mobile/app/dispatch/index.tsx:192` — `!!dispatch.article_summary` guard |
| TC-MOB-DSP-011 | Admin | Article summary line hidden when null | P2 | 1. View `DSP-NO-CUSTOMER` (article_summary null). | No article line visible. | Manual | `mobile/app/dispatch/index.tsx:192` |
| TC-MOB-DSP-012 | Admin | Meta line shows boxes + MRP + LR Number | P1 | 1. View `DSP-CARTON-01` (child_count=5, mrp_summary set, lr_number set). | Meta = `5 boxes · ₹X.XX · LR XXXXX`. | Manual | `mobile/app/dispatch/index.tsx:124-132` — joined with ` · ` |
| TC-MOB-DSP-013 | Admin | Meta line omits MRP when null | P2 | 1. View dispatch with mrp_summary=null. | Meta = `N boxes` (no MRP segment). | Manual | `mobile/app/dispatch/index.tsx:126-128` — guarded by `!= null` check |
| TC-MOB-DSP-014 | Admin | Meta line omits LR when null | P2 | 1. View dispatch with lr_number null. | Meta = `N boxes · ₹X.XX` (no LR segment). | Manual | `mobile/app/dispatch/index.tsx:129-131` |
| TC-MOB-DSP-015 | Admin | Destination line visible when set | P2 | 1. View `DSP-CARTON-01` (destination set). | "Destination: {value}" visible at bottom of card. | Manual | `mobile/app/dispatch/index.tsx:204` — `!!dispatch.destination` guard |
| TC-MOB-DSP-016 | Admin | Destination line hidden when null | P2 | 1. View `DSP-NO-SHIPMENT`. | No destination line. | Manual | `mobile/app/dispatch/index.tsx:204` |
| TC-MOB-DSP-017 | Admin | Tap card navigates to detail | P1 | 1. Tap any dispatch card. | Navigates to `/dispatch/{id}` detail screen. | E2E | `mobile/app/dispatch/index.tsx:163` — `router.push('/dispatch/${dispatch.id}')` |

---

## Section 27.3 — List: source-type chip rendering

Tests chip color + label per source type, and the ternary fallback bug for legacy records.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-018 | Admin | Carton chip: blue bg + primary text | P1 | 1. View `DSP-CARTON-01` (source_type='master_carton'). | Chip bg `#EEF0FF`, text `COLORS.primary`, label "Carton". | Manual | `mobile/app/dispatch/index.tsx:535-542` |
| TC-MOB-DSP-019 | Admin | Sample chip: red bg + error text | P1 | 1. View `DSP-SAMPLE-01` (source_type='sample'). | Chip bg `#FEE2E2`, text `COLORS.error`, label "Sample". | Manual | `mobile/app/dispatch/index.tsx:541-546` |
| TC-MOB-DSP-020 | Admin | E-commerce chip: purple bg + ECOMMERCE color text | P1 | 1. View `DSP-EC-01` (source_type='ecommerce'). | Chip bg `#F3E8FF`, text `CHILD_BOX_STATUS_COLORS.ECOMMERCE`, label "E-commerce". | Manual | `mobile/app/dispatch/index.tsx:547-552` |
| TC-MOB-DSP-021 | Admin | Legacy record with source_type=null AND master_carton_id=null still shows "Carton" | P2 | 1. Seed `DSP-LEGACY-TERNARY`. 2. View list. | Chip label = "Carton" (ternary always returns `'master_carton'`). **Bug noted — [?]37.** | Manual | `mobile/app/dispatch/index.tsx:135-137` — `?? (master_carton_id ? 'master_carton' : 'master_carton')` is no-op |

---

## Section 27.4 — List: search input

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-022 | Admin | Search filters list by carton barcode | P1 | 1. Type a known barcode prefix in search. 2. Wait 300ms. | List narrows to matching records. | Manual | `mobile/app/dispatch/index.tsx:57-63` — 300ms debounce; `mobile/app/dispatch/index.tsx:253` — placeholder text |
| TC-MOB-DSP-023 | Admin | Search filters list by customer name | P1 | 1. Type customer name substring. 2. Wait 300ms. | Matching dispatches shown. | Manual | `mobile/app/dispatch/index.tsx:253` — placeholder "Search by carton barcode, customer..." |
| TC-MOB-DSP-024 | Admin | Debounce prevents mid-keystroke API call | P2 | 1. Type quickly. Observe network. | API called only once 300ms after last keystroke; not on each character. | Manual | `mobile/app/dispatch/index.tsx:58-63` |
| TC-MOB-DSP-025 | Admin | X button clears search | P1 | 1. Type something. 2. Tap X icon. | Search input cleared; full list restored. | E2E | `mobile/app/dispatch/index.tsx:260-266` — close-circle icon visible when `searchInput.length > 0` |

---

## Section 27.5 — List: date range filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-026 | Admin | From input accepts valid YYYY-MM-DD and filters | P1 | 1. Enter `2026-01-01` in From. 2. Wait 300ms. | List shows only dispatches on/after 2026-01-01. | Manual | `mobile/app/dispatch/index.tsx:66-72` — debounce effect; `toISO()` helper at line 32 |
| TC-MOB-DSP-027 | Admin | To input accepts valid YYYY-MM-DD and filters | P1 | 1. Enter `2026-01-31` in To. 2. Wait 300ms. | List shows only dispatches on/before 2026-01-31. | Manual | `mobile/app/dispatch/index.tsx:66-72` |
| TC-MOB-DSP-028 | Admin | Both From + To together create range filter | P1 | 1. Enter From=`2026-01-01`, To=`2026-01-31`. 2. Wait 300ms. | Only dispatches in January 2026. | Manual | `mobile/app/dispatch/index.tsx:97-108` — `start_date` + `end_date` query params |
| TC-MOB-DSP-029 | Admin | Invalid date string silently dropped — no UI error | P2 | 1. Type "notadate" in From. 2. Wait 300ms. | No error shown. List reverts to unfiltered (startDate=undefined). **Bug noted — [?]38.** | Manual | `mobile/app/dispatch/index.tsx:32-38` — `toISO` returns `undefined` for invalid input; no feedback |
| TC-MOB-DSP-030 | Admin | Partial date string "2026" silently dropped | P2 | 1. Type "2026" in From. 2. Wait 300ms. | No error; list unfiltered. (Parsed `new Date('2026T00:00:00')` = Invalid Date.) | Manual | `mobile/app/dispatch/index.tsx:35` |
| TC-MOB-DSP-031 | Admin | Keyboard type is numeric on date inputs | P3 | 1. Tap From or To input. | Numeric keyboard appears (iOS/Android). | Manual | `mobile/app/dispatch/index.tsx:283` — `keyboardType="numeric"` |

---

## Section 27.6 — List: quick-select chips

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-032 | Admin | "Today" chip applies single-day range immediately | P1 | 1. Tap "Today". | From and To inputs both = today's date. List filters to today. No debounce wait (immediate via `setStartDate`/`setEndDate`). | E2E | `mobile/app/dispatch/index.tsx:75-86` — `applyRange(1)`; sets both raw inputs and validated dates synchronously |
| TC-MOB-DSP-033 | Admin | "Last 7 days" chip applies 7-day window | P1 | 1. Tap "Last 7 days". | From = 7 days ago, To = today. List filtered. | Manual | `mobile/app/dispatch/index.tsx:75-86` — `applyRange(7)` |
| TC-MOB-DSP-034 | Admin | "Last 30 days" chip applies 30-day window | P1 | 1. Tap "Last 30 days". | From = 30 days ago, To = today. List filtered. | Manual | `mobile/app/dispatch/index.tsx:75-86` — `applyRange(30)` |
| TC-MOB-DSP-035 | Admin | Clear chip appears only when From or To non-empty | P1 | 1. Observe chips initially. 2. Tap "Today". | Initially no Clear chip. After "Today", Clear chip appears with red border + red text. | Manual | `mobile/app/dispatch/index.tsx:331-339` — conditional on `fromInput || toInput` |
| TC-MOB-DSP-036 | Admin | Clear chip resets both date inputs and filter | P1 | 1. Tap "Last 7 days". 2. Tap "Clear". | From + To inputs empty. List unfiltered. Clear chip disappears. | E2E | `mobile/app/dispatch/index.tsx:88-93` — `clearDates()` clears raw inputs AND validated state |
| TC-MOB-DSP-037 | Admin | Clear chip has red border style | P2 | 1. Tap "Today" to make Clear chip appear. 2. Inspect Clear chip style. | Clear chip has `COLORS.error` border (not primary). Text also `COLORS.error`. | Manual | `mobile/app/dispatch/index.tsx:482-487` — `styles.chipClear` + `styles.chipClearText` |
| TC-MOB-DSP-038 | Admin | No status filter chips exist on Dispatch list | P2 | 1. View list header area. | No ALL/CREATED/ACTIVE/CLOSED/DISPATCHED status chips. Only Today/Last 7/Last 30/Clear date chips visible. | Manual | By design — dispatches are terminal; `mobile/app/dispatch/index.tsx` has no status filter |

---

## Section 27.7 — List: infinite scroll + pagination + pull-to-refresh

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-039 | Admin | Initial page loads PAGE_SIZE=20 records | P1 | 1. Seed `DSP-MANY` (≥25 dispatches). 2. View list. | First 20 records visible. | Manual | `mobile/app/dispatch/index.tsx:27` — `PAGE_SIZE=20` |
| TC-MOB-DSP-040 | Admin | Scrolling to 40% threshold triggers next page load | P1 | 1. Scroll toward bottom. | Spinner appears in footer. Records 21+ append below. | E2E | `mobile/app/dispatch/index.tsx:361` — `onEndReachedThreshold={0.4}` |
| TC-MOB-DSP-041 | Admin | "End of list" text appears when no more pages | P2 | 1. Scroll to end of all records. | Footer shows "End of list" text. No spinner. | Manual | `mobile/app/dispatch/index.tsx:224-229` — `!query.hasNextPage && items.length > 0` |
| TC-MOB-DSP-042 | Admin | Pull-to-refresh refetches from page 1 | P1 | 1. Pull down on list. | Pull-to-refresh spinner appears. List reloads from start. | E2E | `mobile/app/dispatch/index.tsx:364-370` — `RefreshControl` calls `query.refetch()` |

---

## Section 27.8 — List: empty state

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-043 | Admin | Empty state shown when no dispatches exist | P1 | 1. Ensure no dispatches in DB. 2. Navigate to Dispatches. | `paper-plane-outline` icon. Title "No dispatches yet". Message "Dispatch history will appear here." | Manual | `mobile/app/dispatch/index.tsx:349-353` — `EmptyState` component |
| TC-MOB-DSP-044 | Admin | Empty state shown when search returns no results | P1 | 1. Type search term matching no records. 2. Wait 300ms. | Same empty-state icon + message. | Manual | Same empty state rendered when `items.length === 0` after search |
| TC-MOB-DSP-045 | Admin | Loading spinner shown on initial data fetch | P2 | 1. Clear app state. 2. Navigate to Dispatches (slow network). | Full-screen spinner while `query.isLoading && items.length === 0`. | Manual | `mobile/app/dispatch/index.tsx:344-346` |

---

## Section 27.9 — List: FAB role gate

**NEW PATTERN**: Dispatch Op is INCLUDED in FAB gate; Warehouse Op is EXCLUDED. First module with this configuration.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-046 | Admin | Admin sees FAB | P0 | 1. Login as Admin. 2. Navigate to Dispatches. | Purple/primary FAB (add icon) visible bottom-right. | E2E | `mobile/app/dispatch/index.tsx:375` — `RoleGate allow={['Admin','Supervisor','Dispatch Operator']}` |
| TC-MOB-DSP-047 | Supervisor | Supervisor sees FAB | P0 | 1. Login as Supervisor. 2. Navigate to Dispatches. | FAB visible. | E2E | `mobile/app/dispatch/index.tsx:375` |
| TC-MOB-DSP-048 | Warehouse Operator | Warehouse Op does NOT see FAB | P0 | 1. Login as Warehouse Op. 2. Navigate to Dispatches. | FAB absent. No add button. | E2E | `mobile/app/dispatch/index.tsx:375` — Warehouse Op excluded; first module with this exclusion |
| TC-MOB-DSP-049 | Dispatch Operator | Dispatch Op DOES see FAB | P0 | 1. Login as Dispatch Op. 2. Navigate to Dispatches. | FAB visible — Dispatch Op can initiate dispatch. | E2E | `mobile/app/dispatch/index.tsx:375` — Dispatch Op included; new pattern vs all prior modules |
| TC-MOB-DSP-050 | Admin | FAB taps → navigate to create screen | P1 | 1. Login as Admin. 2. Tap FAB. | Navigates to `/dispatch/create`. | E2E | `mobile/app/dispatch/index.tsx:378` — `router.push('/dispatch/create')` |

---

## Section 27.10 — Create: role gate

Screen-level `RoleGate` with DeniedView fallback.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-051 | Admin | Admin can open Create screen | P0 | 1. Login as Admin. 2. Navigate to `/dispatch/create`. | Create screen renders with source picker, scan buttons. | E2E | `mobile/app/dispatch/create.tsx:870-879` — `RoleGate allow={['Admin','Supervisor','Dispatch Operator']}` |
| TC-MOB-DSP-052 | Supervisor | Supervisor can open Create screen | P0 | 1. Login as Supervisor. 2. Navigate to Create. | Create screen renders normally. | E2E | `mobile/app/dispatch/create.tsx:870-879` |
| TC-MOB-DSP-053 | Dispatch Operator | Dispatch Op can open Create screen | P0 | 1. Login as Dispatch Op. 2. Navigate to Create. | Create screen renders normally. | E2E | `mobile/app/dispatch/create.tsx:870-879` |
| TC-MOB-DSP-054 | Warehouse Operator | Warehouse Op sees DeniedView | P0 | 1. Login as Warehouse Op. 2. Navigate to `/dispatch/create` (direct URL or tap any FAB). | `lock-closed-outline` icon. Title "Not authorized". Message "You don't have permission to create dispatches." | E2E | `mobile/app/dispatch/create.tsx:50-59` — `DeniedView` component; `mobile/app/dispatch/create.tsx:870-879` — fallback prop |

---

## Section 27.11 — Create: source segmented picker

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-055 | Admin | Default source = Master Carton on screen open | P1 | 1. Open Create screen. | "Master Carton" tab is active (primary bg, white text). "Sample" and "E-commerce" inactive (surface bg, primary text). | Manual | `mobile/app/dispatch/create.tsx:221` — `useState<DispatchSourceType>('master_carton')` |
| TC-MOB-DSP-056 | Admin | Tapping "Sample" activates Sample tab | P1 | 1. Tap "Sample" segment. | "Sample" tab gets primary bg + white text. "Master Carton" and "E-commerce" inactive. Sample scan section appears. | Manual | `mobile/app/dispatch/create.tsx:480-513` — segmented control with active/inactive styles |
| TC-MOB-DSP-057 | Admin | Tapping "E-commerce" activates E-commerce tab | P1 | 1. Tap "E-commerce" segment. | "E-commerce" active. E-commerce scan section renders. | Manual | `mobile/app/dispatch/create.tsx:480-513` |
| TC-MOB-DSP-058 | Admin | Inactive segments have right border separator | P3 | 1. Observe segmented control. | Each inactive (non-last) segment has `borderRightWidth:1, borderRightColor: COLORS.primary`. | Manual | `mobile/app/dispatch/create.tsx:944-946` — `segmentBtnInactive` style |
| TC-MOB-DSP-059 | Admin | Section title shows count for Master Carton mode | P2 | 1. Stay on Master Carton tab. Scan 2 cartons. | Section header reads "Cartons to Dispatch (2)". | Manual | `mobile/app/dispatch/create.tsx:519-522` — count in parentheses |

---

## Section 27.12 — Create: switchSource state management

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-060 | Admin | Switching from Master Carton clears scannedCartons | P1 | 1. Scan `MC-CLOSED-01` on Master Carton tab. 2. Switch to Sample. | scannedCartons cleared (0 items). Switching back to Master Carton shows empty list. | Manual | `mobile/app/dispatch/create.tsx:252` — `if (source !== 'master_carton') setScannedCartons([])` |
| TC-MOB-DSP-061 | Admin | Switching from Sample clears selectedSample | P1 | 1. Scan `SR-CLOSED-01` on Sample tab. 2. Switch to Master Carton. | selectedSample cleared. Switching back to Sample shows empty preview card. | Manual | `mobile/app/dispatch/create.tsx:253` — `if (source !== 'sample') setSelectedSample(null)` |
| TC-MOB-DSP-062 | Admin | Switching from E-commerce clears selectedEcommerce | P1 | 1. Scan `EC-CLOSED-01` on E-commerce tab. 2. Switch to Master Carton. | selectedEcommerce cleared. | Manual | `mobile/app/dispatch/create.tsx:254` — `if (source !== 'ecommerce') setSelectedEcommerce(null)` |
| TC-MOB-DSP-063 | Admin | Switching tabs preserves shared form fields | P1 | 1. Fill Destination, Transport, LR, Vehicle, Notes. 2. Switch from Master Carton → Sample → E-commerce → Master Carton. | All shared fields retain entered values across all tab switches. **[?]39** | Manual | `mobile/app/dispatch/create.tsx:249-255` — `switchSource` only touches source-specific state; shared state untouched |
| TC-MOB-DSP-064 | Admin | Switching away and back does NOT clear current source's state | P2 | 1. On Sample tab scan `SR-CLOSED-01`. 2. Switch to Master Carton. 3. Switch back to Sample. | selectedSample is null (was cleared in step 2). Verify this: it IS cleared because switching to MC runs `setSelectedSample(null)`. **Correct behavior — confirms [?]40 is a no-issue.** | Manual | `mobile/app/dispatch/create.tsx:252-254` — OTHER sources cleared, so current IS cleared when you return |
| TC-MOB-DSP-065 | Admin | Switching to the same tab twice preserves current source state | P2 | 1. On Sample tab scan `SR-CLOSED-01`. 2. Tap Sample tab again (no switch). | selectedSample preserved. `switchSource('sample')` clears only non-sample sources. | Manual | `mobile/app/dispatch/create.tsx:252-254` — re-tapping same tab: `source !== 'sample'` is false, so sample not cleared |

---

## Section 27.13 — Create: Master Carton scan path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-066 | Admin | "Scan Master Carton" button opens barcode scanner | P1 | 1. On Master Carton tab, tap "Scan Master Carton". | Camera scanner modal opens with `expectedType="master"`. | E2E | `mobile/app/dispatch/create.tsx:525-532` — Button → `setScannerOpen(true)` |
| TC-MOB-DSP-067 | Admin | CLOSED carton accepted and appended to list | P1 | 1. Scan `MC-CLOSED-01`. | Carton row appears: barcode (mono) + "{N} box(es) · {article_summary}". Haptic success. | E2E | `mobile/app/dispatch/create.tsx:304-305` — `setScannedCartons(prev => [...prev, c])` |
| TC-MOB-DSP-068 | Admin | ACTIVE carton rejected with specific message | P1 | 1. Scan `MC-ACTIVE-01`. | Alert title "Not dispatchable", message "Close the carton before dispatching." | Manual | `mobile/app/dispatch/create.tsx:294-295` — `c.status === 'ACTIVE'` branch |
| TC-MOB-DSP-069 | Admin | CREATED carton rejected with specific message | P1 | 1. Scan `MC-CREATED-01`. | Alert title "Not dispatchable", message "Carton is empty. Add boxes and close it first." | Manual | `mobile/app/dispatch/create.tsx:296-297` — `c.status === 'CREATED'` branch |
| TC-MOB-DSP-070 | Admin | DISPATCHED carton rejected with specific message | P1 | 1. Scan `MC-DISPATCHED-01`. | Alert title "Not dispatchable", message "This carton has already been dispatched." | Manual | `mobile/app/dispatch/create.tsx:298-299` — `c.status === 'DISPATCHED'` branch |
| TC-MOB-DSP-071 | Admin | Other status rejected with generic message | P2 | 1. API-force a carton to unknown status. | Alert title "Not dispatchable", message "Only CLOSED cartons can be dispatched." | Manual | `mobile/app/dispatch/create.tsx:300` — `else` branch |
| TC-MOB-DSP-072 | Admin | Duplicate barcode rejected | P1 | 1. Scan `MC-CLOSED-01`. 2. Scan same barcode again. | Alert title "Already scanned", message "{code} is already in the list." | Manual | `mobile/app/dispatch/create.tsx:284-286` — dedupe check before API call |
| TC-MOB-DSP-073 | Admin | Multiple CLOSED cartons can be scanned | P1 | 1. Scan `MC-CLOSED-01`. 2. Scan `MC-CLOSED-02`. | Both rows appear in list card. Multi-carton dispatch supported. | E2E | `mobile/app/dispatch/create.tsx:224` — `MasterCarton[]` array |
| TC-MOB-DSP-074 | Admin | Trash icon removes carton from list | P1 | 1. Scan 2 cartons. 2. Tap trash on first row. | First row removed. Second remains. Count updates in section title. | Manual | `mobile/app/dispatch/create.tsx:316-318` — `handleRemoveCarton` filters by barcode |
| TC-MOB-DSP-075 | Admin | Empty hint shown when no cartons scanned | P2 | 1. Open Create (Master Carton tab). | Card shows "Scan at least one CLOSED carton to begin." | Manual | `mobile/app/dispatch/create.tsx:536-539` |
| TC-MOB-DSP-076 | Admin | API error on scan shows alert | P2 | 1. Scan unknown barcode. | Alert title "Scan failed", message from API or "Carton not found". | Manual | `mobile/app/dispatch/create.tsx:307-310` — catch block |
| TC-MOB-DSP-077 | Admin | Scan button shows "Validating…" and disabled during lookup | P2 | 1. Scan carton. Observe button state during API call. | Button text = "Validating…", disabled=true. Returns to "Scan Master Carton" after. | Manual | `mobile/app/dispatch/create.tsx:526-530` — `validating` state |

---

## Section 27.14 — Create: Sample scan + manual entry

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-078 | Admin | "Scan Sample" button opens sample scanner | P1 | 1. Switch to Sample tab. 2. Tap "Scan Sample". | Camera scanner opens with `expectedType="sample"`. | E2E | `mobile/app/dispatch/create.tsx:580-587` |
| TC-MOB-DSP-079 | Admin | Manual entry field has placeholder "BINNY-SR-..." | P2 | 1. Switch to Sample tab. | Manual input shows placeholder `BINNY-SR-...` and label "Or enter sample barcode manually". | Manual | `mobile/app/dispatch/create.tsx:594-598` |
| TC-MOB-DSP-080 | Admin | CLOSED sample accepted; preview card shown | P1 | 1. Enter `SR-CLOSED-01` barcode in manual field. 2. Tap Find. | Preview card: name (bold), barcode (mono), customer/recipient name, "{N} box(es) · CLOSED". Haptic. | E2E | `mobile/app/dispatch/create.tsx:338` — `setSelectedSample(record)` |
| TC-MOB-DSP-081 | Admin | DISPATCHED sample rejected | P1 | 1. Enter `SR-DISPATCHED-01` barcode. 2. Tap Find. | Alert "Not dispatchable", "This sample has already been dispatched." | Manual | `mobile/app/dispatch/create.tsx:330-331` |
| TC-MOB-DSP-082 | Admin | CREATED sample rejected | P1 | 1. Enter `SR-CREATED-01` barcode. 2. Tap Find. | Alert "Not dispatchable", "Sample has no boxes (CREATED status)." | Manual | `mobile/app/dispatch/create.tsx:332-333` |
| TC-MOB-DSP-083 | Admin | ACTIVE sample rejected with generic message (not status-specific) | P2 | 1. Enter `SR-ACTIVE-01` barcode. 2. Tap Find. | Alert "Not dispatchable", "Only CLOSED samples can be dispatched." (NOT a specific ACTIVE message). **Bug noted — [?]41.** | Manual | `mobile/app/dispatch/create.tsx:334` — ACTIVE falls into `else`; no dedicated branch unlike Master Carton |
| TC-MOB-DSP-084 | Admin | Find button disabled when manual input empty | P2 | 1. Switch to Sample tab. Leave input empty. | Find button styled as disabled (`styles.findBtnDisabled`), tapping does nothing. | Manual | `mobile/app/dispatch/create.tsx:601-607` — disabled when `!sampleManualInput.trim() || validating` |
| TC-MOB-DSP-085 | Admin | ReturnKey on manual input triggers lookup | P2 | 1. Type barcode in manual input. 2. Tap keyboard "search" key. | `lookupSample` called. | Manual | `mobile/app/dispatch/create.tsx:598` — `onSubmitEditing={() => lookupSample(sampleManualInput)}` |
| TC-MOB-DSP-086 | Admin | Manual input cleared after successful lookup | P2 | 1. Enter `SR-CLOSED-01`. 2. Find. | Manual input field cleared. | Manual | `mobile/app/dispatch/create.tsx:339` — `setSampleManualInput('')` on success |
| TC-MOB-DSP-087 | Admin | Trash on preview card clears selectedSample | P1 | 1. Select sample. 2. Tap trash icon on preview. | Preview card removed; empty hint shown. | Manual | `mobile/app/dispatch/create.tsx:634-638` — `setSelectedSample(null)` |
| TC-MOB-DSP-088 | Admin | Only one sample at a time (single-record; not an array) | P2 | 1. Select `SR-CLOSED-01`. 2. Use manual entry to enter a different closed sample. 3. Tap Find. | First sample replaced by second. **[?]47.** | Manual | `mobile/app/dispatch/create.tsx:228` — `useState<SampleRecord | null>` |
| TC-MOB-DSP-089 | Admin | Empty hint "Scan a CLOSED sample to begin." when no sample | P3 | 1. Switch to Sample tab. No sample selected. | Empty hint text visible in card. | Manual | `mobile/app/dispatch/create.tsx:616-618` |

---

## Section 27.15 — Create: E-commerce scan + manual entry

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-090 | Admin | "Scan E-commerce" button opens e-commerce scanner | P1 | 1. Switch to E-commerce tab. 2. Tap "Scan E-commerce". | Camera scanner opens with `expectedType="ecommerce"`. | E2E | `mobile/app/dispatch/create.tsx:653-660` |
| TC-MOB-DSP-091 | Admin | Manual entry field has placeholder "BINNY-EC-..." | P2 | 1. Switch to E-commerce tab. | Placeholder `BINNY-EC-...`; label "Or enter e-commerce barcode manually". | Manual | `mobile/app/dispatch/create.tsx:666-670` |
| TC-MOB-DSP-092 | Admin | CLOSED e-commerce accepted; preview shows marketplace/order/SKU | P1 | 1. Enter `EC-CLOSED-01` (marketplace, order_reference, listing_sku all set). 2. Tap Find. | Preview: name, barcode, marketplace, "Order: {ref}", "SKU: {sku}", "{N} box(es) · CLOSED". | E2E | `mobile/app/dispatch/create.tsx:697-714` — conditional rows for marketplace/order_reference/listing_sku |
| TC-MOB-DSP-093 | Admin | DISPATCHED e-commerce rejected | P1 | 1. Enter `EC-DISPATCHED-01`. 2. Tap Find. | Alert "Not dispatchable", "This e-commerce record has already been dispatched." | Manual | `mobile/app/dispatch/create.tsx:366-367` |
| TC-MOB-DSP-094 | Admin | CREATED e-commerce rejected | P1 | 1. Enter `EC-CREATED-01`. 2. Tap Find. | Alert "Not dispatchable", "E-commerce record has no boxes (CREATED status)." | Manual | `mobile/app/dispatch/create.tsx:368-369` |
| TC-MOB-DSP-095 | Admin | ACTIVE e-commerce rejected with generic message | P2 | 1. Enter `EC-ACTIVE-01`. 2. Tap Find. | Alert "Not dispatchable", "Only CLOSED e-commerce records can be dispatched." (no ACTIVE-specific message). **Bug noted — [?]41.** | Manual | `mobile/app/dispatch/create.tsx:370-371` — ACTIVE falls into else |
| TC-MOB-DSP-096 | Admin | Preview rows omitted when marketplace/order/SKU null | P2 | 1. Select CLOSED e-commerce with all optional fields null. | Preview shows only name, barcode, box count + status. No marketplace/order/SKU rows. | Manual | `mobile/app/dispatch/create.tsx:697,700,703` — `!!field` guards |
| TC-MOB-DSP-097 | Admin | Trash on preview clears selectedEcommerce | P1 | 1. Select e-commerce. 2. Tap trash. | Preview removed; empty hint shown. | Manual | `mobile/app/dispatch/create.tsx:716-720` — `setSelectedEcommerce(null)` |
| TC-MOB-DSP-098 | Admin | Empty hint "Scan a CLOSED e-commerce record to begin." | P3 | 1. Switch to E-commerce tab. No record selected. | Empty hint visible. | Manual | `mobile/app/dispatch/create.tsx:689-691` |


## Section 27.16 — Create: Customer picker modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-099 | Admin | "Select Customer" button opens picker modal | P1 | 1. Open Create screen. 2. Tap "Select Customer". | Full-screen slide-up modal opens with "Select Customer" title and search bar. | E2E | `mobile/app/dispatch/create.tsx:734-740` — outline button → `setCustomerPickerOpen(true)` |
| TC-MOB-DSP-100 | Admin | Search resets to empty on modal open | P1 | 1. Open picker, type "ABC". 2. Close. 3. Re-open. | Search field is empty. Query reset. | Manual | `mobile/app/dispatch/create.tsx:76-80` — `useEffect` on `visible`: `setSearchInput('')` + `setSearch('')` |
| TC-MOB-DSP-101 | Admin | Search input auto-focused on open | P2 | 1. Open picker. | Keyboard appears immediately; search input focused. | Manual | `mobile/app/dispatch/create.tsx:179` — `autoFocus` prop on TextInput |
| TC-MOB-DSP-102 | Admin | Typing in search debounces 300ms | P2 | 1. Type "Cust". Observe network. | API called once 300ms after last character; not per keystroke. | Manual | `mobile/app/dispatch/create.tsx:84-93` — 300ms debounce via `useRef` timer |
| TC-MOB-DSP-103 | Admin | iOS clear button (clearButtonMode="while-editing") | P3 | 1. Type something in picker search (iOS). | X button appears inline on iOS. | Manual | `mobile/app/dispatch/create.tsx:181` — `clearButtonMode="while-editing"` |
| TC-MOB-DSP-104 | Admin | Customer rows show firm_name + address | P1 | 1. Open picker with `CUST-01` (address set). | Row: firm_name (bold), address (secondary). Chevron-forward icon. | Manual | `mobile/app/dispatch/create.tsx:127-135` — `pickerFirmName` + `pickerAddress` styles |
| TC-MOB-DSP-105 | Admin | Customer rows omit address when null | P2 | 1. Open picker with customer having null address. | Row shows only firm_name, no address line. | Manual | `mobile/app/dispatch/create.tsx:130-134` — `item.address ? ...` conditional |
| TC-MOB-DSP-106 | Admin | Infinite scroll loads more customers | P2 | 1. Ensure >20 customers. 2. Scroll picker to bottom. | Next page appends below. `onEndReachedThreshold={0.3}`. | Manual | `mobile/app/dispatch/create.tsx:110-114` — `handleLoadMore` |
| TC-MOB-DSP-107 | Admin | Empty state shown when no search results | P1 | 1. Search for "ZZZZZZ". | `person-outline` icon, "No customers found", "No results for \"ZZZZZZ\"." | Manual | `mobile/app/dispatch/create.tsx:201-204` — `search ? 'No results...' : 'No customers available.'` |
| TC-MOB-DSP-108 | Admin | Empty state shown when no customers at all | P2 | 1. Open picker with no customers in DB. | "No customers found", "No customers available." | Manual | `mobile/app/dispatch/create.tsx:204` — else branch |
| TC-MOB-DSP-109 | Admin | Selecting customer closes modal and shows customer card | P1 | 1. Open picker. 2. Tap `CUST-01`. | Modal closes. Customer card replaces "Select Customer" button. Shows firm_name + address. "Change" link visible. | E2E | `mobile/app/dispatch/create.tsx:121-124` — `onPick(item); onClose()` |
| TC-MOB-DSP-110 | Admin | "Change" link re-opens picker | P1 | 1. Select customer. 2. Tap "Change". | Picker modal opens again (search reset). | Manual | `mobile/app/dispatch/create.tsx:754-758` — "Change" `onPress` → `setCustomerPickerOpen(true)` |
| TC-MOB-DSP-111 | Admin | Closing picker without selecting preserves previous selection | P2 | 1. Select `CUST-01`. 2. Open picker again. 3. Close via X without picking. | Customer card still shows `CUST-01`. Form state unchanged. **[?]49.** | Manual | Modal close via `onClose` doesn't clear `customer` state; no "Remove customer" button |
| TC-MOB-DSP-112 | Admin | Customer picker query enabled only when modal visible | P2 | 1. Close picker. 2. Observe queries. | `customers-picker` query inactive when picker closed. | Manual | `mobile/app/dispatch/create.tsx:105` — `enabled: visible` |

---

## Section 27.17 — Create: shared optional details form

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-113 | Admin | Destination field visible on all 3 source tabs | P1 | 1. Cycle through Master Carton / Sample / E-commerce tabs. | "Destination" input present on every tab; value persists when switching tabs. | Manual | `mobile/app/dispatch/create.tsx:769-776` — always rendered outside source conditional block |
| TC-MOB-DSP-114 | Admin | Transport Details field present with correct placeholder | P2 | 1. View Details section. | Label "Transport Details", placeholder "e.g. DTDC Express". | Manual | `mobile/app/dispatch/create.tsx:778-785` |
| TC-MOB-DSP-115 | Admin | LR Number field has autoCapitalize="characters" | P2 | 1. Tap LR Number field on Android. | Keyboard set to all-caps. Input uppercased. | Manual | `mobile/app/dispatch/create.tsx:789-795` — `autoCapitalize="characters"`, placeholder "Lorry receipt / consignment no." |
| TC-MOB-DSP-116 | Admin | Vehicle Number field has autoCapitalize="characters" | P2 | 1. Tap Vehicle Number field. | All-caps keyboard. Placeholder "e.g. MH12AB1234". | Manual | `mobile/app/dispatch/create.tsx:797-803` — `autoCapitalize="characters"` |
| TC-MOB-DSP-117 | Admin | Notes field is multiline (3 lines min-height) | P2 | 1. Tap Notes field. 2. Enter multi-line text. | Input expands to show 3+ lines. `textAlignVertical="top"`. | Manual | `mobile/app/dispatch/create.tsx:805-817` — `multiline`, `numberOfLines={3}` |
| TC-MOB-DSP-118 | Admin | All details fields optional — form submits with all blank | P1 | 1. Select customer + source. Leave all Details fields empty. 2. Submit. | Submit succeeds; `basePayload` sends `undefined` for blank optional fields. | Manual | `mobile/app/dispatch/create.tsx:420-426` — `|| undefined` trims on each field |

---

## Section 27.18 — Create: submit validation order + dynamic submit label

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-119 | Admin | No customer → alert before source check | P1 | 1. Scan 2 cartons. 2. Tap submit without customer. | Alert title "Select customer", message "Pick a customer before dispatching." | Manual | `mobile/app/dispatch/create.tsx:397-400` — customer check is FIRST validation |
| TC-MOB-DSP-120 | Admin | Master Carton: no cartons → alert | P1 | 1. Select customer. Stay on Master Carton tab. Don't scan. 2. Submit. | Alert title "No cartons", message "Scan at least one carton to dispatch." | Manual | `mobile/app/dispatch/create.tsx:402-405` |
| TC-MOB-DSP-121 | Admin | Sample: no sample → alert | P1 | 1. Select customer. Switch to Sample tab. Don't scan. 2. Submit. | Alert title "No sample", message "Scan or enter a sample barcode to dispatch." | Manual | `mobile/app/dispatch/create.tsx:407-410` |
| TC-MOB-DSP-122 | Admin | E-commerce: no record → alert | P1 | 1. Select customer. Switch to E-commerce tab. Don't scan. 2. Submit. | Alert title "No e-commerce record", message "Scan or enter an e-commerce barcode to dispatch." | Manual | `mobile/app/dispatch/create.tsx:412-415` |
| TC-MOB-DSP-123 | Admin | Submit button disabled when canSubmit=false | P1 | 1. Open Create. No customer, no source. | Submit button visually disabled. Pressing it has no effect (or fires alert). | Manual | `mobile/app/dispatch/create.tsx:825` — `disabled={!canSubmit || dispatchMutation.isPending}` |
| TC-MOB-DSP-124 | Admin | Submit label "Dispatch Cartons" when 0 cartons scanned | P2 | 1. Master Carton tab, no cartons. | Button label = "Dispatch Cartons". | Manual | `mobile/app/dispatch/create.tsx:453` — `n === 0 ? 'Dispatch Cartons'` |
| TC-MOB-DSP-125 | Admin | Submit label "Dispatch 1 Carton" (singular) | P2 | 1. Scan exactly 1 carton. | Button label = "Dispatch 1 Carton" (singular, no 's'). | Manual | `mobile/app/dispatch/create.tsx:453` — `n === 1 ? '' : 's'` |
| TC-MOB-DSP-126 | Admin | Submit label "Dispatch N Cartons" (plural) | P2 | 1. Scan 2+ cartons. | Button label = "Dispatch N Cartons". | Manual | `mobile/app/dispatch/create.tsx:453` |
| TC-MOB-DSP-127 | Admin | Submit label shows sample name when sample selected | P2 | 1. Sample tab. Select `SR-CLOSED-01` (name="My Sample"). | Button label = "Dispatch Sample — My Sample". | Manual | `mobile/app/dispatch/create.tsx:455` — `selectedSample ? 'Dispatch Sample — ${name}'` |
| TC-MOB-DSP-128 | Admin | Submit label "Dispatch Sample" when no sample | P3 | 1. Sample tab, no sample selected. | Button label = "Dispatch Sample". | Manual | `mobile/app/dispatch/create.tsx:455` |
| TC-MOB-DSP-129 | Admin | Submit label shows e-commerce name when record selected | P2 | 1. E-commerce tab. Select `EC-CLOSED-01` (name="My EC"). | Button label = "Dispatch E-commerce — My EC". | Manual | `mobile/app/dispatch/create.tsx:458` |
| TC-MOB-DSP-130 | Admin | Submit label "Dispatch E-commerce" when no record | P3 | 1. E-commerce tab, no record selected. | Button label = "Dispatch E-commerce". | Manual | `mobile/app/dispatch/create.tsx:459` |

---

## Section 27.19 — Create: submit mutation + invalidate-keys gap + router.replace destination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-131 | Admin | Successful Master Carton dispatch: POST /dispatches called | P0 | 1. Select `CUST-01`. Scan `MC-CLOSED-01`. 2. Tap submit. | `POST /dispatches` with `{customer_id, master_carton_ids: [id]}`. 200 response. | API | `mobile/app/dispatch/create.tsx:430-431` — `master_carton_ids` array |
| TC-MOB-DSP-132 | Admin | Successful Sample dispatch: POST /dispatches called | P0 | 1. Select `CUST-01`. Scan `SR-CLOSED-01`. 2. Submit. | `POST /dispatches` with `{customer_id, sample_record_id}`. 200. | API | `mobile/app/dispatch/create.tsx:432-433` |
| TC-MOB-DSP-133 | Admin | Successful E-commerce dispatch: POST /dispatches called | P0 | 1. Select `CUST-01`. Scan `EC-CLOSED-01`. 2. Submit. | `POST /dispatches` with `{customer_id, ecommerce_record_id}`. 200. | API | `mobile/app/dispatch/create.tsx:434-435` |
| TC-MOB-DSP-134 | Admin | After success: navigate to /dispatch list (not detail) | P1 | 1. Submit successful dispatch. | App navigates to `/dispatch` list screen. Does NOT go to new record's detail. **Inconsistency flagged — [?]44.** | E2E | `mobile/app/dispatch/create.tsx:273` — `router.replace('/dispatch')` |
| TC-MOB-DSP-135 | Admin | After success: success toast visible | P1 | 1. Submit successful dispatch. | "Dispatch created." success notification shown. Haptic success. | E2E | `mobile/app/dispatch/create.tsx:262` — `successMessage: 'Dispatch created.'` + haptic |
| TC-MOB-DSP-136 | Admin | dispatch list cache invalidated after submit | P1 | 1. Submit dispatch. Navigate to list. | Dispatch list updated without manual refresh. | E2E | `mobile/app/dispatch/create.tsx:265` — `['dispatches']` in `invalidateKeys` |
| TC-MOB-DSP-137 | Admin | samples list NOT invalidated after Sample dispatch | P2 | 1. View sample list (sample shows CLOSED). 2. Submit sample dispatch. 3. Navigate back to Samples list without pull-to-refresh. | Sample list still shows old CLOSED status (stale). **Real bug — [?]43.** | Manual | `mobile/app/dispatch/create.tsx:263-270` — `samples` key absent from `invalidateKeys` |
| TC-MOB-DSP-138 | Admin | ecommerce list NOT invalidated after E-commerce dispatch | P2 | 1. View e-commerce list. 2. Submit e-commerce dispatch. 3. Return to EC list without refresh. | EC list shows stale CLOSED status. **Real bug — [?]43.** | Manual | `mobile/app/dispatch/create.tsx:263-270` — `ecommerce` key absent |
| TC-MOB-DSP-139 | Admin | Submit button shows loading state during mutation | P2 | 1. Submit dispatch (slow network). | Submit button shows spinner + disabled while `dispatchMutation.isPending`. | Manual | `mobile/app/dispatch/create.tsx:825-826` — `loading={dispatchMutation.isPending}` |

---

## Section 27.20 — Detail: data load + not-found + pull-to-refresh

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-140 | Admin | Detail screen loads dispatch data | P0 | 1. Tap `DSP-CARTON-01` in list. | Detail screen renders all cards. Title "Dispatch". No loading spinner. | E2E | `mobile/app/dispatch/[id].tsx:45-50` — single `dispatchQ` query |
| TC-MOB-DSP-141 | Admin | Loading spinner during initial fetch | P2 | 1. Navigate to detail (slow network). | Full-screen spinner while `dispatchQ.isLoading && !dispatch`. | Manual | `mobile/app/dispatch/[id].tsx:63-72` |
| TC-MOB-DSP-142 | Admin | Not-found state for invalid ID | P1 | 1. Navigate to `/dispatch/nonexistent-id`. | `paper-plane-outline` icon, "Dispatch not found", "This dispatch record may have been removed." | Manual | `mobile/app/dispatch/[id].tsx:76-89` |
| TC-MOB-DSP-143 | Admin | Pull-to-refresh refetches dispatch | P1 | 1. On detail screen, pull down. | Spinner appears. Data reloads. Single `dispatchQ.refetch()` called. | E2E | `mobile/app/dispatch/[id].tsx:55-59` — `onRefresh` function |
| TC-MOB-DSP-144 | Admin | No role gate — all 4 roles see detail | P0 | 1. Login as each role. 2. Navigate to any dispatch detail. | All 4 roles can view. No denial message. No action bar. | Manual | `mobile/app/dispatch/[id].tsx` — no `RoleGate` wrapper anywhere in file |
| TC-MOB-DSP-145 | Warehouse Operator | Warehouse Op can view detail | P0 | 1. Login as Warehouse Op. 2. Navigate to detail. | Detail renders same as Admin. No buttons or actions. | E2E | `mobile/app/dispatch/[id].tsx` — no role gate |
| TC-MOB-DSP-146 | Dispatch Operator | Dispatch Op can view detail | P0 | 1. Login as Dispatch Op. 2. Navigate to detail. | Detail renders. No action bar. | Manual | `mobile/app/dispatch/[id].tsx` |

---

## Section 27.21 — Detail: header card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-147 | Admin | Header shows source_label when set | P1 | 1. View `DSP-SAMPLE-01` (source_label set). | Barcode text = source_label value. | Manual | `mobile/app/dispatch/[id].tsx:167` — `d.source_label ?? d.carton_barcode ?? '—'` |
| TC-MOB-DSP-148 | Admin | Header falls to carton_barcode when source_label null | P1 | 1. View `DSP-NULL-LABEL`. | Barcode text = carton_barcode. | Manual | `mobile/app/dispatch/[id].tsx:167` |
| TC-MOB-DSP-149 | Admin | Header shows '—' when both null | P2 | 1. View `DSP-NULL-BOTH`. | Barcode text = `—`. | Manual | `mobile/app/dispatch/[id].tsx:167` |
| TC-MOB-DSP-150 | Admin | Source-type chip correct color in header | P1 | 1. View `DSP-EC-01`. | Purple (`#F3E8FF`) bg chip with label "E-commerce". | Manual | `mobile/app/dispatch/[id].tsx:105-122` — same chip logic as list |
| TC-MOB-DSP-151 | Admin | Dispatch date formatted in header | P1 | 1. View any dispatch. | Date displays as formatted string (e.g. "11 May 2026") via `formatDate`. | Manual | `mobile/app/dispatch/[id].tsx:179-181` — `formatDate(d.dispatch_date)` |

---

## Section 27.22 — Detail: Customer card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-152 | Admin | Customer firm name renders when set | P1 | 1. View `DSP-CARTON-01`. | "Customer" section title + firm_name in bold. | Manual | `mobile/app/dispatch/[id].tsx:188-189` |
| TC-MOB-DSP-153 | Admin | Italic muted "— No customer —" when null | P1 | 1. View `DSP-NO-CUSTOMER`. | Italic `styles.mutedText` text "— No customer —". | Manual | `mobile/app/dispatch/[id].tsx:191` — `fontStyle: 'italic'` + `COLORS.textSecondary` |

---

## Section 27.23 — Detail: Source card + "View source record" jump-link

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-154 | Admin | Source card shows Type row | P1 | 1. View `DSP-CARTON-01`. | Source card: "Type" label + "Master Carton" value. | Manual | `mobile/app/dispatch/[id].tsx:198` — `SummaryRow label="Type" value={sourceTypeLabel}` |
| TC-MOB-DSP-155 | Admin | Source card shows "Sample" type for sample dispatch | P1 | 1. View `DSP-SAMPLE-01`. | Type row = "Sample". | Manual | `mobile/app/dispatch/[id].tsx:124-128` — `sourceTypeLabel` derivation |
| TC-MOB-DSP-156 | Admin | Source card shows "E-commerce" type for EC dispatch | P1 | 1. View `DSP-EC-01`. | Type row = "E-commerce". | Manual | `mobile/app/dispatch/[id].tsx:124-128` |
| TC-MOB-DSP-157 | Admin | "View source record" row visible when master_carton_id present | P1 | 1. View `DSP-CARTON-01` (master_carton_id set). | "View source record" tappable row + arrow-forward icon. | Manual | `mobile/app/dispatch/[id].tsx:142-145` — `hasSourceLink` = true when ID non-null |
| TC-MOB-DSP-158 | Admin | Tap "View source record" navigates to master carton detail | P1 | 1. Tap "View source record" on `DSP-CARTON-01`. | Navigates to `/master-cartons/{master_carton_id}`. | E2E | `mobile/app/dispatch/[id].tsx:133-134` |
| TC-MOB-DSP-159 | Admin | Tap "View source record" navigates to sample detail | P1 | 1. View `DSP-SAMPLE-01`. Tap "View source record". | Navigates to `/samples/{sample_record_id}`. | E2E | `mobile/app/dispatch/[id].tsx:135-136` |
| TC-MOB-DSP-160 | Admin | Tap "View source record" navigates to e-commerce detail | P1 | 1. View `DSP-EC-01`. Tap "View source record". | Navigates to `/ecommerce/{ecommerce_record_id}`. | E2E | `mobile/app/dispatch/[id].tsx:137-138` |
| TC-MOB-DSP-161 | Admin | "View source record" row hidden when relevant ID null | P2 | 1. Seed dispatch with source_type='sample' but sample_record_id=null. 2. View detail. | "View source record" row absent. Only Type row shown. | Manual | `mobile/app/dispatch/[id].tsx:142-145` — `hasSourceLink` requires both matching sourceType AND non-null ID |

---

## Section 27.24 — Detail: Shipment card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-162 | Admin | Shipment card absent when all 4 fields null | P1 | 1. View `DSP-NO-SHIPMENT`. | No "Shipment" card rendered. | Manual | `mobile/app/dispatch/[id].tsx:212` — conditional: `d.destination \|\| d.transport_details \|\| d.lr_number \|\| d.vehicle_number` |
| TC-MOB-DSP-163 | Admin | Shipment card present when only destination set | P1 | 1. View dispatch with destination="Mumbai" only. | "Shipment" card with one row: "Destination — Mumbai". No other rows. | Manual | `mobile/app/dispatch/[id].tsx:215-218` — `!!d.destination` guard |
| TC-MOB-DSP-164 | Admin | Shipment card shows all 4 rows when all fields set | P1 | 1. View `DSP-CARTON-01` (all 4 fields set). | All rows: Destination, Transport, LR Number, Vehicle No. | Manual | `mobile/app/dispatch/[id].tsx:215-228` |
| TC-MOB-DSP-165 | Admin | Only non-null fields render as rows | P2 | 1. Seed dispatch with destination + lr_number set; transport + vehicle null. | Shipment card has 2 rows: Destination + LR Number only. | Manual | `mobile/app/dispatch/[id].tsx:215-228` — each row individually guarded by `!!` |

---

## Section 27.25 — Detail: Contents card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-166 | Admin | Child Boxes row always rendered | P1 | 1. View any dispatch. | "Child Boxes" row always visible. Value = number or `—` if null. | Manual | `mobile/app/dispatch/[id].tsx:233-236` — unconditional `SummaryRow` |
| TC-MOB-DSP-167 | Admin | Articles row visible when article_summary set | P2 | 1. View `DSP-CARTON-01` (article_summary set). | "Articles" row shows value. | Manual | `mobile/app/dispatch/[id].tsx:237-239` — `!!d.article_summary` guard |
| TC-MOB-DSP-168 | Admin | Articles row hidden when null | P2 | 1. View dispatch with article_summary=null. | No "Articles" row. | Manual | `mobile/app/dispatch/[id].tsx:237-239` |
| TC-MOB-DSP-169 | Admin | Colours row visible when colour_summary set | P2 | 1. View dispatch with colour_summary set. | "Colours" row shows value. | Manual | `mobile/app/dispatch/[id].tsx:240-242` |
| TC-MOB-DSP-170 | Admin | Sizes row visible when size_summary set | P2 | 1. View dispatch with size_summary set. | "Sizes" row shows value. | Manual | `mobile/app/dispatch/[id].tsx:243-245` |
| TC-MOB-DSP-171 | Admin | Total MRP formatted as ₹X.XX | P1 | 1. View dispatch with mrp_summary=1450. | "Total MRP" row = "₹1450.00". | Manual | `mobile/app/dispatch/[id].tsx:246-250` — `₹${Number(d.mrp_summary).toFixed(2)}` |
| TC-MOB-DSP-172 | Admin | Total MRP row hidden when mrp_summary null | P2 | 1. View dispatch with mrp_summary=null. | No "Total MRP" row. | Manual | `mobile/app/dispatch/[id].tsx:246` — `d.mrp_summary != null` guard |

---

## Section 27.26 — Detail: Notes card

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-173 | Admin | Notes card visible when notes set | P1 | 1. View `DSP-SAMPLE-01` (notes set). | "Notes" card with notes text. | Manual | `mobile/app/dispatch/[id].tsx:255` — `!!d.notes` guard |
| TC-MOB-DSP-174 | Admin | Notes card hidden when notes null | P1 | 1. View `DSP-CARTON-01` (notes null). | No Notes card. | Manual | `mobile/app/dispatch/[id].tsx:255` |

---

## Section 27.27 — Detail: Audit footer

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-175 | Admin | "Dispatched at" always shown | P1 | 1. View any dispatch detail. | Audit footer row "Dispatched at: {date}" always present. | Manual | `mobile/app/dispatch/[id].tsx:264-266` — unconditional |
| TC-MOB-DSP-176 | Admin | "Record created" row shown when created_at date ≠ dispatch_date | P2 | 1. View `DSP-DIFF-DAYS` (created_at and dispatch_date on different calendar days). | Footer has 2 rows: "Dispatched at" + "Record created: {date}". | Manual | `mobile/app/dispatch/[id].tsx:96-98` — `showCreatedAt = createdDay !== dispatchDay` |
| TC-MOB-DSP-177 | Admin | "Record created" row hidden when created_at and dispatch_date are same day | P2 | 1. View `DSP-SAME-DAY`. | Footer has only "Dispatched at" row. | Manual | `mobile/app/dispatch/[id].tsx:96-98` |
| TC-MOB-DSP-178 | Admin | Timezone edge case: same-day check splits raw ISO on 'T' | P3 | 1. View dispatch where UTC date differs from local date (e.g. created 23:30 UTC = next day IST). | "Record created" row may show or hide incorrectly depending on server vs device timezone. **Bug noted — [?]45.** | Manual | `mobile/app/dispatch/[id].tsx:96-97` — `d.dispatch_date.split('T')[0]` ignores timezone offset |

---

## Section 27.28 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-DSP-179 | Admin | sourceType ternary bug: legacy null/null record labelled "Carton" | P2 | 1. Seed `DSP-LEGACY-TERNARY` (source_type=null, master_carton_id=null). 2. View in list + detail. | Chip label = "Carton" on both list and detail. **Real bug — [?]37.** | Manual | `mobile/app/dispatch/index.tsx:135-137` + `mobile/app/dispatch/[id].tsx:101-103` — ternary always `'master_carton'` |
| TC-MOB-DSP-180 | Admin | Invalid From date does not show any error to user | P2 | 1. Type "32/13/2026" in From input. 2. Wait 300ms. | No alert, no red border, no error text. List silently uses no start_date filter. **[?]38.** | Manual | `mobile/app/dispatch/index.tsx:32-38` — `toISO` returns `undefined`; state update fires silently |
| TC-MOB-DSP-181 | Admin | switchSource preserves shared form on all 3 round-trips | P2 | 1. Fill all 5 shared fields. 2. Switch MC→Sample→EC→MC. | All shared fields intact on return. | Manual | `mobile/app/dispatch/create.tsx:249-255` — [?]39 |
| TC-MOB-DSP-182 | Admin | Multi-carton vs single-record asymmetry | P3 | 1. On Master Carton tab, scan 3 cartons. 2. On Sample tab, attempt 2nd sample after 1st selected. | MC: 3 cartons shown. Sample: second lookup overwrites first (only 1 at a time). **[?]42.** | Manual | `mobile/app/dispatch/create.tsx:224` vs `228` — `MasterCarton[]` vs `SampleRecord | null` |
| TC-MOB-DSP-183 | Admin | canSubmit=false with no customer even when cartons scanned | P1 | 1. Scan `MC-CLOSED-01`. No customer. | Submit button disabled. Tapping → alert. `canSubmit` = `!!customer && ...` — customer check first. | Manual | `mobile/app/dispatch/create.tsx:442-448` |
| TC-MOB-DSP-184 | Dispatch Operator | Dispatch Op can complete full dispatch flow end-to-end | P0 | 1. Login as Dispatch Op. 2. Navigate to Dispatches. 3. Tap FAB. 4. Create dispatch. 5. Submit. | Dispatch Op successfully creates dispatch. Navigated to list. | E2E | Confirms new role pattern (Dispatch Op in FAB + Create); `mobile/app/dispatch/index.tsx:375` + `create.tsx:873` |
| TC-MOB-DSP-185 | Warehouse Operator | Warehouse Op cannot reach Create screen via deep-link either | P1 | 1. Login as Warehouse Op. 2. Navigate directly to `/dispatch/create`. | DeniedView shown: "Not authorized — You don't have permission to create dispatches." | Manual | `mobile/app/dispatch/create.tsx:870-879` — screen-level RoleGate independent of FAB |

---

## Maestro flows index

| Flow file | Purpose | Sections covered |
|---|---|---|
| `mobile/.maestro/dispatch/dsp-list-access-warehouse.yaml` | Warehouse Op accesses list; FAB absent | 27.1, 27.9 |
| `mobile/.maestro/dispatch/dsp-list-fab-dispatch-op.yaml` | Dispatch Op sees FAB — confirms new role pattern | 27.9 |
| `mobile/.maestro/dispatch/dsp-create-denied-warehouse.yaml` | Warehouse Op hits DeniedView on Create | 27.10 |
| `mobile/.maestro/dispatch/dsp-create-source-picker-switch.yaml` | Switch tabs; verify shared fields preserved, other-source state cleared | 27.11, 27.12 |
| `mobile/.maestro/dispatch/dsp-create-master-carton-multi.yaml` | Scan 2 CLOSED cartons → select customer → submit → land on list | 27.13, 27.19 |
| `mobile/.maestro/dispatch/dsp-create-sample-happy-path.yaml` | Scan 1 CLOSED sample → customer → submit | 27.14, 27.19 |
| `mobile/.maestro/dispatch/dsp-create-ecommerce-happy-path.yaml` | Scan 1 CLOSED EC record → customer → submit | 27.15, 27.19 |
| `mobile/.maestro/dispatch/dsp-create-validation-no-customer.yaml` | Scan carton but submit without customer → alert | 27.18 |
| `mobile/.maestro/dispatch/dsp-create-active-carton-rejection.yaml` | Scan ACTIVE carton → "Close the carton before dispatching." alert | 27.13 |
| `mobile/.maestro/dispatch/dsp-detail-jump-link-master-carton.yaml` | Tap "View source record" on carton dispatch → navigates to MC detail | 27.23 |
| `mobile/.maestro/dispatch/dsp-detail-jump-link-sample.yaml` | Tap "View source record" on sample dispatch → navigates to sample detail | 27.23 |
| `mobile/.maestro/dispatch/dsp-date-range-quick-chip-today.yaml` | Tap "Today" chip → From/To populated immediately, list filtered | 27.6 |

### Maestro flow samples

```yaml
# mobile/.maestro/dispatch/dsp-list-access-warehouse.yaml
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
- tapOn: "Dispatches"
- waitForAnimationToEnd
- assertVisible: "Dispatches"
- assertNotVisible:
    id: "dispatch-fab"
```

```yaml
# mobile/.maestro/dispatch/dsp-list-fab-dispatch-op.yaml
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
- tapOn: "Dispatches"
- waitForAnimationToEnd
- assertVisible: "Dispatches"
- assertVisible:
    id: "dispatch-fab"
```

```yaml
# mobile/.maestro/dispatch/dsp-create-denied-warehouse.yaml
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
- openLink: "binnyinventory://dispatch/create"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You don't have permission to create dispatches."
```

```yaml
# mobile/.maestro/dispatch/dsp-create-master-carton-multi.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  BARCODE_1: "MC1A2B3C"
  BARCODE_2: "MC2D3E4F"
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
- tapOn: "Dispatches"
- waitForAnimationToEnd
- tapOn:
    id: "dispatch-fab"
- waitForAnimationToEnd
- assertVisible: "Master Carton"
- tapOn: "Scan Master Carton"
- waitForAnimationToEnd
- inputText: "${BARCODE_1}"
- tapOn: "Done"
- waitForAnimationToEnd
- tapOn: "Scan Master Carton"
- waitForAnimationToEnd
- inputText: "${BARCODE_2}"
- tapOn: "Done"
- waitForAnimationToEnd
- assertVisible: "${BARCODE_1}"
- assertVisible: "${BARCODE_2}"
- tapOn: "Select Customer"
- waitForAnimationToEnd
- tapOn:
    index: 0
- waitForAnimationToEnd
- tapOn:
    text: "Dispatch 2 Cartons"
- waitForAnimationToEnd
- assertVisible: "Dispatches"
```

```yaml
# mobile/.maestro/dispatch/dsp-date-range-quick-chip-today.yaml
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
- tapOn: "Dispatches"
- waitForAnimationToEnd
- assertNotVisible: "Clear"
- tapOn: "Today"
- waitForAnimationToEnd
- assertVisible: "Clear"
```

```yaml
# mobile/.maestro/dispatch/dsp-detail-jump-link-master-carton.yaml
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
- tapOn: "Dispatches"
- waitForAnimationToEnd
- tapOn:
    index: 0
- waitForAnimationToEnd
- assertVisible: "View source record"
- tapOn: "View source record"
- waitForAnimationToEnd
- assertVisible: "Master Carton"
```

---

## Open questions / `[?]` flags

| # | File:line | Flag | Severity |
|---|---|---|---|
| 37 | `mobile/app/dispatch/index.tsx:135-137` + `mobile/app/dispatch/[id].tsx:101-103` | **`sourceType` ternary is a no-op.** `dispatch.source_type ?? (dispatch.master_carton_id ? 'master_carton' : 'master_carton')` always returns `'master_carton'` regardless of `master_carton_id`. Legacy records with neither `source_type` nor `master_carton_id` are mislabelled "Carton". Probable copy-paste error during M4. **Real bug.** | High |
| 38 | `mobile/app/dispatch/index.tsx:32-38` | **Date range inputs silently reject invalid strings.** `toISO()` returns `undefined` for unparseable input; UI shows no error, no red border. User has no way to know their filter was ignored. **UX gap.** | Medium |
| 39 | `mobile/app/dispatch/create.tsx:249-255` | **`switchSource` preserves shared form fields.** Intentional (form persistence) but undocumented. Customer, destination, transport, LR, vehicle, notes survive tab switches. Worth confirming as intentional design. | Low |
| 40 | `mobile/app/dispatch/create.tsx:252-254` | **`switchSource` does NOT clear the CURRENT source's state on re-entry.** Only OTHER sources are cleared. Switching to Sample, then to MC, then back to Sample → selectedSample IS cleared (was cleared when switching away). So current-source always arrives empty on re-entry. **[?]40 is effectively a non-issue** — behavior is deterministic. | Low |
| 41 | `mobile/app/dispatch/create.tsx:328-335` + `mobile/app/dispatch/create.tsx:365-371` | **Sample and E-commerce ACTIVE status not specifically handled.** `lookupSample`/`lookupEcommerce` fall ACTIVE into generic "Only CLOSED…" else branch. Master Carton has a dedicated ACTIVE message ("Close the carton before dispatching."). Less helpful UX for the most common real-world rejection. | Medium |
| 42 | `mobile/app/dispatch/create.tsx:224` vs `228` | **Multi-record asymmetry.** Master Carton supports `MasterCarton[]` (multiple). Sample and E-commerce are `SampleRecord \| null` and `EcommerceRecord \| null` (single). Intentional product decision or oversight? Confirm with product. | Medium |
| 43 | `mobile/app/dispatch/create.tsx:263-270` | **`invalidateKeys` omits `samples` and `ecommerce`.** After dispatching a sample or e-commerce record, those source-module lists show stale CLOSED status until the user manually pulls to refresh. **Real cache-propagation bug.** | High |
| 44 | `mobile/app/dispatch/create.tsx:273` | **`router.replace('/dispatch')` after submit navigates to list, not to the new dispatch detail.** All other create screens (cartons, samples, ecommerce) replace to the new record's detail page. Inconsistency — user cannot immediately review the record they just created without tapping from the list. | Medium |
| 45 | `mobile/app/dispatch/[id].tsx:96-97` | **Audit footer same-day check splits raw ISO strings on 'T'.** For a record created near midnight UTC, the local same-day comparison can flip (e.g. IST is UTC+5:30; a UTC 23:00 creation = IST next-day). Edge case but real on late-night dispatches. | Low |
| 46 | `mobile/app/dispatch/index.tsx` (no status/source/customer filter present) | **Dispatch list has no status, source-type, or customer filters.** Only search + date range. Other modules have richer chip-based filters. By design (terminal records, one status) or future work? | Low |
| 47 | `mobile/app/dispatch/create.tsx:228` | **Sample dispatch has no path to add a second sample.** Once `selectedSample` is set, submitting another barcode via manual entry or scanner overwrites the first. Either intentional (single-only; aligns with [?]42) or UX gap. Confirm. | Medium |
| 48 | `mobile/app/dispatch/create.tsx:70-213` vs `mobile/app/samples/create.tsx` (approximate) | **CustomerPicker duplicated between `dispatch/create.tsx` and `samples/create.tsx`.** Near-identical component with slight styling drift (picker row `borderRadius`, separator height). Refactor opportunity — extract to `mobile/components/CustomerPickerModal.tsx`. | Low |
| 49 | `mobile/app/dispatch/create.tsx:754-758` | **Customer is required but there is no explicit "Remove customer" button.** Once selected, the only way to change is "Change" link (opens picker to re-pick). Closing picker without selecting preserves the current customer. UX expected but worth a TC to confirm no stuck state possible. | Low |
| 50 | `mobile/app/dispatch/create.tsx:442-448` | **`canSubmit` is an inline derived value, not a `useMemo`.** Recomputes correctly on every render triggered by state changes. Stale-closure risk does not apply here. Verified as non-issue; TC-MOB-DSP-183 covers the behavior. | Info |

---

## Author footer

**Phase:** 27
**Session:** 7 of 13
**TC range:** TC-MOB-DSP-001 → TC-MOB-DSP-185 (185 TCs)
**Sections:** 27.1 – 27.28 (28 sections)
**Maestro flows:** 12 (index entries) + 6 embedded YAML samples
**`[?]` flags raised:** 37–50 (14 flags)
**Source files read:** `mobile/app/dispatch/index.tsx`, `mobile/app/dispatch/create.tsx`, `mobile/app/dispatch/[id].tsx`, `mobile/services/dispatch.service.ts`, `mobile/utils/index.ts`, `mobile/components/RoleGate.tsx`, `docs/test-cases-v3/phase-26-mobile-ecommerce.md`
**Last updated:** 2026-05-11

