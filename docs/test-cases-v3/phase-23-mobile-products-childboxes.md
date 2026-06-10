# Phase 23 — Mobile Products, Child Boxes, Repack, Unpack, Storage

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/products`, `/child-boxes`, `/repack`, `/unpack`, `/storage` screens
**Mobile build under test:** Mobile parity M1-M7 (post-EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-02

---

## Table of Contents

- [Section 23.1 — Products: role gate](#section-231--products-role-gate)
- [Section 23.2 — Products: list rendering](#section-232--products-list-rendering)
- [Section 23.3 — Products: search + filters](#section-233--products-search--filters)
- [Section 23.4 — Products: infinite scroll + pagination](#section-234--products-infinite-scroll--pagination)
- [Section 23.5 — Products: empty / loading / refresh](#section-235--products-empty--loading--refresh)
- [Section 23.6 — Products: detail screen](#section-236--products-detail-screen)
- [Section 23.7 — Child Boxes: list rendering + role-agnostic access](#section-237--child-boxes-list-rendering--role-agnostic-access)
- [Section 23.8 — Child Boxes: aging tint (FREE-only, 90d/180d thresholds)](#section-238--child-boxes-aging-tint-free-only-90d180d-thresholds)
- [Section 23.9 — Child Boxes: status filter chips](#section-239--child-boxes-status-filter-chips)
- [Section 23.10 — Child Boxes: search + infinite scroll](#section-2310--child-boxes-search--infinite-scroll)
- [Section 23.11 — Child Boxes: detail screen](#section-2311--child-boxes-detail-screen)
- [Section 23.12 — Child Boxes: Generate stub screen (web-only)](#section-2312--child-boxes-generate-stub-screen-web-only)
- [Section 23.13 — Repack: role gate](#section-2313--repack-role-gate)
- [Section 23.14 — Repack: source carton scan + validation](#section-2314--repack-source-carton-scan--validation)
- [Section 23.15 — Repack: box selection (Step 2)](#section-2315--repack-box-selection-step-2)
- [Section 23.16 — Repack: destination scan + capacity validation](#section-2316--repack-destination-scan--capacity-validation)
- [Section 23.17 — Repack: submit + confirm + stepper navigation](#section-2317--repack-submit--confirm--stepper-navigation)
- [Section 23.18 — Unpack: role gate](#section-2318--unpack-role-gate)
- [Section 23.19 — Unpack: source scan + status validation](#section-2319--unpack-source-scan--status-validation)
- [Section 23.20 — Unpack: carton summary + confirm + submit](#section-2320--unpack-carton-summary--confirm--submit)
- [Section 23.21 — Storage: role gate](#section-2321--storage-role-gate)
- [Section 23.22 — Storage: scan + status validation + close flow](#section-2322--storage-scan--status-validation--close-flow)
- [Section 23.23 — Negative / edge cases](#section-2323--negative--edge-cases)
- [Maestro flows index](#maestro-flows-index)
- [Open questions / [?] flags](#open-questions--flags)

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

| Fixture | Description | Used in |
|---|---|---|
| `MRP TEST CITY 02` | Multi-MRP article — ₹299 BLUE + ₹399 RED, sizes 6-8; Hawaii section; `is_active=true`; image uploaded | 23.2, 23.3, 23.6 |
| `MRP TEST CITY 03` | Single-MRP — ₹599 BLACK, sizes 6-8; Hawaii section; `is_active=true`; no image (fallback test) | 23.2, 23.3, 23.6 |
| Inactive product | Any product with `is_active=false` | 23.2, 23.3 |
| FREE child box aged 0–89 days | Status=FREE, created within last 89 days | 23.7, 23.8 |
| FREE child box aged 90–179 days | Status=FREE, `created_at`=today−95d. **Requires Admin to seed via web before running** | 23.8 |
| FREE child box aged ≥180 days | Status=FREE, `created_at`=today−200d. **Requires Admin to seed via web before running** | 23.8 |
| GENERATED child box aged ≥200 days | Status=GENERATED, `created_at`=today−200d. **Requires Admin to seed via web before running** | 23.8 |
| 3 ACTIVE master cartons | Hold `MRP TEST CITY 02 BLUE` boxes; at least one has ≥2 boxes | 23.14–23.17 |
| DISPATCHED master carton | Status=DISPATCHED | 23.14, 23.19, 23.22 |
| CREATED (empty) master carton | Status=CREATED, child_count=0 | 23.14, 23.19, 23.22 |
| ACTIVE carton at full capacity | max_capacity=5, child_count=5 | 23.16 |
| CLOSED master carton | Status=CLOSED, ≥1 child box | 23.14, 23.19, 23.20, 23.22 |

---

## Section 23.1 — Products: role gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-001 | Admin | Admin can navigate to Products screen | P0 | 1. Login as Admin (`admin@binny.com` / `Admin@123`). 2. Tap "Menu" tab. 3. Tap "Products" tile. | Products list renders. Title bar "Products". Search bar visible. Product cards visible. No "Not authorized" text. | E2E | `RoleGate allow={['Admin','Supervisor']}` — `products/index.tsx:175` |
| TC-MOB-PROD-002 | Supervisor | Supervisor can navigate to Products screen | P0 | 1. Login as Supervisor. 2. Tap Menu → Products. | Products list renders. No access-denied message. | E2E | Supervisor is in the allow list |
| TC-MOB-PROD-003 | Warehouse Operator | Warehouse Operator sees DeniedView on Products | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/products`. | `EmptyState` with `icon="lock-closed-outline"`, title "Not authorized", message "You do not have permission to view products." No product cards visible. | E2E | `products/index.tsx:31-39` |
| TC-MOB-PROD-004 | Dispatch Operator | Dispatch Operator sees DeniedView on Products | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/products`. | Same DeniedView as TC-MOB-PROD-003. No product cards. | E2E | Dispatch Operator not in allow list |

### Maestro flows for Section 23.1

```yaml
# mobile/.maestro/products/products-admin-access.yaml
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
- tapOn: "Products"
- waitForAnimationToEnd
- assertVisible: "Products"
- assertNotVisible: "Not authorized"
```

```yaml
# mobile/.maestro/products/products-warehouse-denied.yaml
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
- tapOn: "Products"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You do not have permission to view products."
```

---

## Section 23.2 — Products: list rendering

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-005 | Admin | Product card Row 1: article_name (bold) + MRP formatted ₹X.XX | P0 | 1. Login as Admin, navigate to Products. 2. Observe the first card for `MRP TEST CITY 02`. | `article_name` at left: `fontSize:15`, `fontWeight:'700'`. MRP at right: `₹299.00`, `fontSize:14`, `fontWeight:'700'`, `color:COLORS.primary`. | Manual | `products/index.tsx:113-118` |
| TC-MOB-PROD-006 | Admin | Product card Row 2: SKU in monospace · article_code | P0 | 1. Observe Row 2 of a card with both SKU and article_code. | SKU renders in `fontFamily:'monospace'` (Android) or `'Menlo'` (iOS). `·` separator visible when both fields present. Row absent when both are null. | Manual | `products/index.tsx:121-130`; `{!!skuLine && ...}` |
| TC-MOB-PROD-007 | Admin | Product card Row 3: Colour · Size; Row 4: Section · Category + Inactive badge | P0 | 1. Observe an active Hawaii-section product card. 2. Also observe an inactive product card. | Row 3: "Colour: BLUE · Size: 6", `color:COLORS.textSecondary`. Row 4 left: "Hawaii · <Category>", muted. Inactive product: `<Badge label="Inactive">` on right of Row 4. Active products show no badge. | Manual | `products/index.tsx:132-146` |
| TC-MOB-PROD-008 | Admin | No FAB or create button on Products list screen | P0 | 1. Login as Admin. 2. Navigate to Products. 3. Scan for any FAB or "+" element. | No floating action button, no "New Product", no create CTA. Mobile is read-only for products. | Manual | No `create.tsx` exists in `mobile/app/products/` |
| TC-MOB-PROD-009 | Supervisor | Supervisor sees identical product cards to Admin | P1 | 1. Login as Admin; note first 3 card article names. 2. Logout. 3. Login as Supervisor, navigate to Products. 4. Compare cards. | Identical cards. Same `GET /products` endpoint, same data. | Integration | |

---

## Section 23.3 — Products: search + filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-010 | Admin | Search debounces 300ms — rapid typing fires single query | P0 | 1. Navigate to Products. 2. Type "MRP TEST CITY" as fast as possible (< 300ms per char). 3. Wait 500ms after last char. | Only one `GET /products?search=MRP+TEST+CITY&page=1&limit=20` fires. Intermediate keystrokes do not fire separate requests. `useEffect` clears and resets the 300ms timer on each keystroke. | Integration | `products/index.tsx:50-55` |
| TC-MOB-PROD-011 | Admin | Searching by article name filters list; X clears search | P0 | 1. Type "MRP TEST CITY 02" in search. Wait 400ms. 2. Observe list. 3. Tap the X (close-circle) icon. | After typing: only matching products visible. After X tap: search input clears, list shows all products. X icon appears only when `searchInput.length > 0`. | E2E | `products/index.tsx:193-205` |
| TC-MOB-PROD-012 | Admin | Section filter chips: All sections + per-section chips from GET /sections | P0 | 1. Navigate to Products. 2. Observe chip row. 3. Tap "Hawaii". 4. Tap "Hawaii" again. | "All sections" chip active by default. After tapping Hawaii: chip fills, query adds `section=Hawaii`. Tapping active chip again: reverts to `undefined` (toggle). "All sections" always clears section filter. | E2E | `products/index.tsx:216-252`; `productService.getSections()` → `GET /sections` |
| TC-MOB-PROD-013 | Admin | "Active only" chip adds is_active=true to query | P0 | 1. Tap "Active only" chip. 2. Observe list. | Chip fills with `COLORS.primary`. `GET /products?is_active=true`. Inactive products disappear. | E2E | `products/index.tsx:255-271` |
| TC-MOB-PROD-014 | Admin | Section + Active-only filters can be combined | P1 | 1. Tap "Hawaii" chip. 2. Tap "Active only". | Both chips active. Query: `GET /products?section=Hawaii&is_active=true`. Only active Hawaii products shown. | Integration | Combined query key |
| TC-MOB-PROD-015 | Supervisor | Section filter chips visible and functional for Supervisor | P1 | 1. Login as Supervisor. 2. Navigate to Products. 3. Tap a section chip. | Chips render for Supervisor. Tapping filters list identically to Admin. | E2E | |

### Maestro flows for Section 23.3

```yaml
# mobile/.maestro/products/products-search-and-filter.yaml
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
- tapOn: "Products"
- waitForAnimationToEnd
- tapOn:
    text: "Search by article, SKU, colour..."
- inputText: "MRP TEST CITY 02"
- waitForAnimationToEnd
- assertVisible: "MRP TEST CITY 02"
- tapOn: "Hawaii"
- waitForAnimationToEnd
- assertVisible: "Hawaii"
```

---

## Section 23.4 — Products: infinite scroll + pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-016 | Admin | First page loads PAGE_SIZE=20 products; footer spinner on next page | P0 | 1. Ensure >20 products exist. 2. Navigate to Products. 3. Scroll to bottom. | First 20 cards load. Scrolling past 40% threshold triggers `fetchNextPage()`. Footer `<Spinner size="small">` appears during fetch. Page 2 results append. | E2E | `products/index.tsx:27,292-293`; `PAGE_SIZE=20`, `onEndReachedThreshold=0.4` |
| TC-MOB-PROD-017 | Admin | "End of list" text appears after last page | P0 | 1. Scroll past all pages. | "End of list" footer text visible. `!query.hasNextPage && items.length > 0`. | Manual | `products/index.tsx:162-168` |

---

## Section 23.5 — Products: empty / loading / refresh

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-018 | Admin | Full-screen spinner during initial load | P0 | 1. Navigate to Products on slow network. 2. Observe before API responds. | Full-screen centered `<Spinner />` renders while `query.isLoading && items.length === 0`. | Manual | `products/index.tsx:275-277` |
| TC-MOB-PROD-019 | Admin | EmptyState with "No products" when search yields zero results | P0 | 1. Type "ZZZZZ_NO_MATCH_99" in search. Wait 400ms. | `<EmptyState icon="pricetag-outline" title="No products" message="Try adjusting filters." />` visible. FlatList not rendered. | E2E | `products/index.tsx:280-284` |
| TC-MOB-PROD-020 | Admin | Pull-to-refresh refetches product list | P0 | 1. Navigate to Products. 2. Pull down from top. | `RefreshControl` spinner visible (tint `COLORS.primary`). `query.refetch()` fires. List updates. | E2E | `products/index.tsx:295-301` |

### Maestro flows for Section 23.5

```yaml
# mobile/.maestro/products/products-empty-state.yaml
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
- tapOn: "Products"
- waitForAnimationToEnd
- tapOn:
    text: "Search by article, SKU, colour..."
- inputText: "ZZZZZ_NO_MATCH_XYZZY"
- waitForAnimationToEnd
- assertVisible: "No products"
- assertVisible: "Try adjusting filters."
```

---

## Section 23.6 — Products: detail screen

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-021 | Admin | Tapping a product card navigates to /products/[id] | P0 | 1. Login as Admin, navigate to Products. 2. Tap any card. | Navigates to `/products/<uuid>`. Title bar "Product". Product detail card visible. No crash. | E2E | `products/index.tsx:108`; `router.push('/products/${product.id}')` |
| TC-MOB-PROD-022 | Admin | Detail image renders when image_url present; hidden when absent or on load error | P0 | 1. Open detail of `MRP TEST CITY 02` (has image). 2. Open detail of `MRP TEST CITY 03` (no image). | With URL: `<Image>` renders full-width, `aspectRatio:1`, `borderRadius:10`. Without URL: no `<Image>` — card starts at `article_name`. On `onError`: `setImageError(true)` → `showImage=false` — image silently disappears. | Manual | `products/[id].tsx:90,112-119` |
| TC-MOB-PROD-023 | Admin | Detail header: article_name (h1), SKU in monospace, Active/Inactive badge | P0 | 1. Open an active product detail. 2. Open an inactive product detail. | `article_name`: `fontSize:20`, `fontWeight:'700'`. SKU in `Menlo`/`monospace`, `fontSize:13`. Active: `<Badge label="Active" color={COLORS.success}>`. Inactive: `<Badge label="Inactive" color={COLORS.textSecondary}>`. | Manual | `products/[id].tsx:122-135` |
| TC-MOB-PROD-024 | Admin | Detail body: MRP ₹X.XX prominent; Colour, Size, Section, Created, Updated rows | P0 | 1. Open `MRP TEST CITY 02 BLUE` detail. 2. Scroll through card. | MRP row: `₹299.00`, `fontSize:18`, `fontWeight:'700'`, `color:COLORS.primary`. `DetailRow` entries visible: Colour, Size, Section. Created and Updated show `formatDate()` values. Size shows range `"size_from — size_to"` when `size_from` present, else plain `product.size` or `"—"`. | Manual | `products/[id].tsx:143-174` |
| TC-MOB-PROD-025 | Admin | Detail footer note: "Full editing and bulk creation available on the web portal." | P1 | 1. Open any product detail. 2. Scroll to bottom. | Italic `color:COLORS.textLight` text visible below card. | Manual | `products/[id].tsx:178-181` |
| TC-MOB-PROD-026 | Admin | Detail pull-to-refresh refetches product | P0 | 1. Open product detail. 2. Pull down. | Spinner appears. `productQ.refetch()` called. Data updates. | E2E | `products/[id].tsx:45-49` |
| TC-MOB-PROD-027 | Admin | Detail "Product not found" when ID invalid or product deleted | P0 | 1. Navigate to `/products/nonexistent-uuid`. OR: delete a product via API then pull-to-refresh its detail. | `EmptyState icon="alert-circle-outline"` with title "Product not found", message "This product may have been removed." Full-screen centered. | Manual | `products/[id].tsx:66-79` |
| TC-MOB-PROD-028 | Supervisor | Supervisor can view product detail (read-only) | P1 | 1. Login as Supervisor. 2. Navigate to Products. 3. Tap any product. | Detail renders identically. No edit form or edit button present. `GET /products/:id`. | E2E | |

### Maestro flows for Section 23.6

```yaml
# mobile/.maestro/products/products-detail-tap.yaml
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
- tapOn: "Products"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- assertVisible: "Product"
- assertVisible: "MRP"
- assertVisible: "Colour"
- assertVisible: "Full editing and bulk creation available on the web portal."
```

---

## Section 23.7 — Child Boxes: list rendering + role-agnostic access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-001 | Admin | Admin can access Child Boxes screen | P0 | 1. Login as Admin. 2. Tap Menu → Child Boxes. | Child Boxes list renders. Title "Child Boxes". No access-denied. | E2E | No `<RoleGate>` on `child-boxes/index.tsx` |
| TC-MOB-CB-002 | Supervisor | Supervisor can access Child Boxes screen | P0 | 1. Login as Supervisor. 2. Navigate to Child Boxes. | List renders. | E2E | |
| TC-MOB-CB-003 | Warehouse Operator | Warehouse Operator can access Child Boxes screen | P0 | 1. Login as Warehouse Operator. 2. Navigate to Child Boxes. | List renders without role-gate block. | E2E | |
| TC-MOB-CB-004 | Dispatch Operator | Dispatch Operator can access Child Boxes screen | P0 | 1. Login as Dispatch Operator. 2. Navigate to Child Boxes. | List renders. No "Not authorized". All 4 roles allowed. | E2E | |
| TC-MOB-CB-005 | Admin | Child box card: barcode (monospace) + status badge in Row 1; article·colour·size in Row 2; SKU·₹MRP in Row 3 | P0 | 1. Navigate to Child Boxes. 2. Observe any card. | Row 1: barcode in `monospace`/`Menlo`, `fontSize:14`, `fontWeight:'700'`; `<Badge label={box.status} type="childBox">` right. Row 2: `"{article_name} · {colour} · {size}"`, `fontSize:13`. Row 3 left: `"{sku} · ₹{mrp.toFixed(2)}"`, `fontSize:12`, `color:COLORS.textSecondary`. | Manual | `child-boxes/index.tsx:111-148` |
| TC-MOB-CB-006 | Admin | Aging legend (yellow/red swatches) visible on ALL and FREE filters only | P0 | 1. Navigate to Child Boxes (ALL default). Observe legend strip. 2. Tap "FREE". 3. Tap "GENERATED". | ALL and FREE: legend visible — "FREE box aging:", yellow swatch "90–179 days", red swatch "180+ days". GENERATED, PACKED, DISPATCHED: legend NOT rendered. | Manual | `child-boxes/index.tsx:177-178`; `showAgingLegend = statusFilter === 'ALL' \|\| statusFilter === 'FREE'` |

### Maestro flows for Section 23.7

```yaml
# mobile/.maestro/child-boxes/cb-all-roles-access.yaml
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
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- assertNotVisible: "Not authorized"
```

---

## Section 23.8 — Child Boxes: aging tint (FREE-only, 90d/180d thresholds)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-007 | Admin | FREE box aged <90d: no background tint, no age pill | P0 | 1. View a FREE box created within last 89 days. | Card background default `COLORS.surface`. No age pill on Row 3 right. `getAgingState('FREE', createdAt)` returns `'none'` (d < 90). | Manual | `child-boxes/index.tsx:28-38` |
| TC-MOB-CB-008 | Admin | FREE box aged 90–179d: yellow tint + yellow age pill | P0 | 1. Filter to FREE. 2. Find fixture FREE box at today−95d. | Card `backgroundColor:'rgba(254, 243, 199, 0.6)'`. Age pill right of Row 3: `"95d"`, `color:'#92400E'`, `backgroundColor:'#FEF9C3'`. `getAgingState` returns `'yellow'`. | Manual | `child-boxes/index.tsx:40-44`; fixture required |
| TC-MOB-CB-009 | Admin | FREE box aged ≥180d: red tint + red age pill | P0 | 1. Filter to FREE. 2. Find fixture FREE box at today−200d. | Card `backgroundColor:'rgba(254, 226, 226, 0.6)'`. Age pill: `"200d"`, `color:'#991B1B'`, `backgroundColor:'#FEE2E2'`. `getAgingState` returns `'red'`. | Manual | `child-boxes/index.tsx:40-43`; fixture required |
| TC-MOB-CB-010 | Admin | GENERATED/PACKED box aged ≥200d: NO tint regardless of age | P0 | 1. Filter to GENERATED. View fixture GENERATED box at today−200d. 2. Filter to PACKED. Observe similarly aged PACKED box. | Both: no background tint, no age pill. `getAgingState('GENERATED', ...)` and `getAgingState('PACKED', ...)` immediately return `'none'` — `status !== 'FREE'` guard fires. | Manual | `child-boxes/index.tsx:32-33` |
| TC-MOB-CB-011 | Admin | Aging day-boundary precision: day 89 → no pill, day 90 → yellow | P1 | 1. Fixture: FREE box at exactly day 89 (today minus 89d 23h 59m). 2. Fixture: FREE box at exactly day 90 (today minus 90d 1m). | 89d box: no tint. 90d box: yellow tint. `Math.floor((Date.now() - new Date(createdAt)) / 86400000)` determines exact day. | Manual | `child-boxes/index.tsx:28-29`; requires precise fixture timestamps |

---

## Section 23.9 — Child Boxes: status filter chips

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-012 | Admin | All 5 status chips render; ALL active by default | P0 | 1. Navigate to Child Boxes. 2. Observe chip row. | Five chips: "ALL" (active/filled), "GENERATED", "FREE", "PACKED", "DISPATCHED" (all outlined). `STATUS_OPTIONS` array drives render. | Manual | `child-boxes/index.tsx:50-51` |
| TC-MOB-CB-013 | Admin | Tapping each status chip filters API query | P0 | 1. Tap "GENERATED". 2. Tap "FREE". 3. Tap "PACKED". 4. Tap "DISPATCHED". 5. Tap "ALL". | Each tap: tapped chip fills, query fires with `status=<VALUE>`. ALL: query omits status param. `statusFilter === 'ALL' ? undefined : statusFilter`. | E2E | `child-boxes/index.tsx:69-80` |
| TC-MOB-CB-014 | Admin | EmptyState "No child boxes" when filter returns 0 results | P0 | 1. Tap a filter with 0 results (e.g., DISPATCHED on clean DB). | `<EmptyState icon="cube-outline" title="No child boxes" message="Try adjusting your filters." />` visible. FlatList not rendered. | E2E | `child-boxes/index.tsx:266-270` |
| TC-MOB-CB-015 | Warehouse Operator | Warehouse Op can use status filter chips | P1 | 1. Login as Warehouse Op. 2. Navigate to Child Boxes. 3. Tap "FREE". | FREE chip activates. List filters. Same behavior as Admin. | E2E | |

### Maestro flows for Section 23.9

```yaml
# mobile/.maestro/child-boxes/cb-status-filter.yaml
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
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- assertVisible: "ALL"
- assertVisible: "FREE"
- assertVisible: "GENERATED"
- assertVisible: "PACKED"
- assertVisible: "DISPATCHED"
- tapOn: "FREE"
- waitForAnimationToEnd
```

---

## Section 23.10 — Child Boxes: search + infinite scroll

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-016 | Admin | Search debounces 300ms; filters by barcode/SKU/article | P0 | 1. Navigate to Child Boxes. 2. Type a partial barcode quickly. Wait 400ms. | Single `GET /child-boxes?search=<term>&page=1&limit=20` fires. Intermediate keystrokes do not trigger separate requests. | Integration | `child-boxes/index.tsx:62-67` |
| TC-MOB-CB-017 | Admin | X button clears search and resets list | P0 | 1. Type any search term. 2. Tap X icon. | Input cleared, list resets to unfiltered. X icon present only when `searchInput.length > 0`. | E2E | `child-boxes/index.tsx:202-214` |
| TC-MOB-CB-018 | Admin | Infinite scroll loads page 2; "End of list" after last page | P0 | 1. Navigate to Child Boxes with >20 boxes. 2. Scroll to bottom. 3. Continue scrolling until no more pages. | Footer spinner during `isFetchingNextPage`. Page 2 appends. When `!query.hasNextPage`, "End of list" footer text appears. | E2E | `child-boxes/index.tsx:278-280` |
| TC-MOB-CB-019 | Admin | Pull-to-refresh refetches child box list | P0 | 1. Navigate to Child Boxes. 2. Pull down. | `RefreshControl` spinner. `query.refetch()` fires. `query.isRefetching && !query.isFetchingNextPage`. | E2E | `child-boxes/index.tsx:283-290` |
| TC-MOB-CB-020 | Admin | Search and status filter combined | P1 | 1. Tap "FREE" chip. 2. Type partial barcode. Wait 400ms. | Query: `GET /child-boxes?status=FREE&search=<term>&page=1&limit=20`. Combined query key. | Integration | `child-boxes/index.tsx:70-71` |

---

## Section 23.11 — Child Boxes: detail screen

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-021 | Admin | Tapping card navigates to /child-boxes/[id] | P0 | 1. Navigate to Child Boxes. 2. Tap any card. | Navigates to `/child-boxes/<uuid>`. Title bar "Child Box". Detail card visible. | E2E | `child-boxes/index.tsx:106` |
| TC-MOB-CB-022 | Admin | Detail header: barcode (monospace, fontSize:16) + status badge | P0 | 1. Open any child box detail. 2. Observe header row. | Barcode in `Menlo`/`monospace`, `fontSize:16`, `fontWeight:'700'`. `<Badge label={data.status} type="childBox">` on right. | Manual | `child-boxes/[id].tsx:33-38` |
| TC-MOB-CB-023 | Admin | Detail body: Article, Article Code, Colour, Size, SKU, MRP, Quantity, Created | P0 | 1. Open any child box detail. 2. Observe detail rows. | Eight `DetailRow` entries: Article, Article Code, Colour, Size, SKU, MRP (`₹X.XX`), Quantity, Created (`new Date(data.created_at).toLocaleString('en-IN')`). | Manual | `child-boxes/[id].tsx:43-59` |
| TC-MOB-CB-024 | Admin | Detail shows stub note; shows "Child box not found." for invalid ID | P1 | 1. Observe bottom of detail card. 2. Navigate to `/child-boxes/invalid-uuid`. | Valid detail: italic "Full detail view coming in Phase B.2." Visible. Invalid ID: `data` undefined → text "Child box not found." (`fontSize:15`, `marginTop:40`). | Manual | `child-boxes/[id].tsx:61-70` |
| TC-MOB-CB-025 | Dispatch Operator | Dispatch Operator can view child box detail | P1 | 1. Login as Dispatch Op. 2. Navigate to Child Boxes. 3. Tap a card. | Detail renders. No access-denied. All 4 roles allowed. | E2E | |

### Maestro flows for Section 23.11

```yaml
# mobile/.maestro/child-boxes/cb-detail-tap.yaml
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
- tapOn: "Child Boxes"
- waitForAnimationToEnd
- tapOn:
    index: 0
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Article"
```

---

## Section 23.12 — Child Boxes: Generate stub screen (web-only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-CB-026 | Admin | Generate screen: title "Bulk label generation is web-only" + print icon | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes/generate` (via Menu → "Generate Labels"). | Title bar "Generate Labels". `Ionicons name="print-outline" size=56` centered in circular container. Text "Bulk label generation is web-only", `fontSize:18`, `fontWeight:'700'`. | Manual | `generate.tsx:10-15` |
| TC-MOB-CB-027 | Admin | Generate screen: "Use the web portal" card contains correct URL | P0 | 1. Observe the first card. | Card title "Use the web portal". Body contains `https://srv1409601.hstgr.cloud/binny/child-boxes/generate` styled in `COLORS.primary`, `fontWeight:'600'`. | Manual | `generate.tsx:22-28` |
| TC-MOB-CB-028 | Admin | Generate screen: "On this device you can…" card shows 3 feature rows | P0 | 1. Observe the second card. | Three rows with icons: (1) `cube-outline` "Browse the full child-box list"; (2) `qr-code-outline` "Scan existing child boxes to trace or pack"; (3) `archive-outline` "Pack cartons by scanning boxes". | Manual | `generate.tsx:30-36` |
| TC-MOB-CB-029 | Warehouse Operator | All 4 roles see identical Generate stub; no creation possible | P1 | 1. Login as each of Warehouse Op and Dispatch Op. 2. Navigate to Generate screen. | Identical stub content for all roles. No form, no input, no submit button. No `<RoleGate>` on this screen. | Manual | `generate.tsx` — no RoleGate wrapper |

### Maestro flows for Section 23.12

```yaml
# mobile/.maestro/child-boxes/cb-generate-stub.yaml
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
- tapOn: "Generate Labels"
- waitForAnimationToEnd
- assertVisible: "Bulk label generation is web-only"
- assertVisible: "Use the web portal"
- assertVisible: "https://srv1409601.hstgr.cloud/binny/child-boxes/generate"
```

---

## Section 23.13 — Repack: role gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-RPK-001 | Admin | Admin can access Repack; 4-step stepper visible | P0 | 1. Login as Admin. 2. Tap Menu → Repack. | Screen renders. Title "Repack". 4-step stepper with labels: Source (1), Select (2), Destination (3), Confirm (4). Step 1 dot filled `COLORS.primary`. "Scan Source Carton" button visible. | E2E | `repack.tsx:48-53,778-786` |
| TC-MOB-RPK-002 | Supervisor | Supervisor can access Repack | P0 | 1. Login as Supervisor. 2. Navigate to Repack. | Step 1 renders. | E2E | |
| TC-MOB-RPK-003 | Warehouse Operator | Warehouse Operator can access Repack | P0 | 1. Login as Warehouse Op. 2. Navigate to Repack. | Step 1 renders. | E2E | |
| TC-MOB-RPK-004 | Dispatch Operator | Dispatch Operator sees DeniedView on Repack | P0 | 1. Login as Dispatch Op. 2. Navigate to Repack. | `EmptyState icon="lock-closed-outline"`, "Not authorized", "You do not have permission to repack cartons." | E2E | `repack.tsx:36-44` |

### Maestro flows for Section 23.13

```yaml
# mobile/.maestro/repack/repack-admin-access.yaml
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
- tapOn: "Repack"
- waitForAnimationToEnd
- assertVisible: "Scan Source Carton"
- assertNotVisible: "Not authorized"
```

```yaml
# mobile/.maestro/repack/repack-dispatch-denied.yaml
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
- tapOn: "Repack"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You do not have permission to repack cartons."
```

---

## Section 23.14 — Repack: source carton scan + validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-RPK-005 | Admin | Step 1: scan button + hint text "Scan an ACTIVE or CLOSED master carton…" | P0 | 1. Navigate to Repack. 2. Observe Step 1. | Card: "Scan Source Carton" button with `qr-code-outline` icon. Below: hint "Scan an ACTIVE or CLOSED master carton to select boxes from." | Manual | `repack.tsx:508-534` |
| TC-MOB-RPK-006 | Admin | Scanning valid ACTIVE carton with boxes advances to Step 2 | P0 | 1. Tap "Scan Source Carton". 2. Scan ACTIVE carton barcode with ≥1 box. | Scanner closes. `masterCartonService.getByBarcode` then `getById` called. Full carton with `child_boxes` loaded. App advances to Step 2. | E2E | `repack.tsx:378-404`; `setStep(2)` |
| TC-MOB-RPK-007 | Admin | Scanning CLOSED carton advances to Step 2 | P0 | 1. Scan a CLOSED carton with ≥1 box. | Same as TC-MOB-RPK-006. CLOSED is allowed as source. | E2E | DISPATCHED and CREATED/empty are blocked; CLOSED is not |
| TC-MOB-RPK-008 | Admin | Scanning DISPATCHED source shows "Cannot repack a dispatched carton." alert | P0 | 1. Scan a DISPATCHED carton. | Alert title "Cannot repack", message "Cannot repack a dispatched carton." Step stays at 1. | Manual | `repack.tsx:384-387` |
| TC-MOB-RPK-009 | Admin | Scanning CREATED or 0-box carton shows "Source carton is empty." alert | P0 | 1. Scan a CREATED (0-box) carton. | Alert "Cannot repack" / "Source carton is empty." `stub.status === 'CREATED' \|\| stub.child_count === 0`. | Manual | `repack.tsx:388-391` |
| TC-MOB-RPK-010 | Admin | Unknown barcode shows "Scan failed" alert | P0 | 1. Scan `INVALID-BARCODE-XYZ`. | Alert "Scan failed" with API message or fallback "Carton not found". | Manual | `repack.tsx:405-410` |

---

## Section 23.15 — Repack: box selection (Step 2)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-RPK-011 | Admin | Step 2: compact source card + "N of M selected" counter | P0 | 1. Advance to Step 2 (source carton with 3 boxes). | Compact `CartonInfoCard` at top: barcode + badge + "N / capacity boxes". Counter row: "0 of 3 selected". "Select all" text on right. | Manual | `repack.tsx:547-558` |
| TC-MOB-RPK-012 | Admin | Tapping box row toggles selection; "Select all" / "Clear all" | P0 | 1. Tap a box row. 2. Tap "Select all". 3. Tap "Clear all". | Toggle: row fills `COLORS.primary + '0A'`; checkbox → filled. "Select all" selects all → counter "N of N", text changes to "Clear all". "Clear all" deselects all. | E2E | `repack.tsx:486-504` |
| TC-MOB-RPK-013 | Admin | "Continue" disabled with 0 selected; enabled and advances to Step 3 when ≥1 | P0 | 1. Observe "Continue (0)" with 0 selected. 2. Select 1 box. 3. Tap "Continue (1)". | "Continue (0)": disabled. After selection: "Continue (1)" enabled. Tapping advances to Step 3. Progress banner shows selected count + source barcode. | E2E | `repack.tsx:587-592`; `disabled={selected.size === 0}` |
| TC-MOB-RPK-014 | Admin | "Back" on Step 2 returns to Step 1 and clears source/selection state | P0 | 1. At Step 2. 2. Tap "Back". | `goToStep(1)` — clears `sourceCarton`, `selected`, `destCarton`. Returns to Step 1 with scan button. | Manual | `repack.tsx:580-585`; `s <= 1` clears all |
| TC-MOB-RPK-015 | Admin | BoxRow shows barcode (monospace), article/colour/size, SKU/₹MRP | P1 | 1. Observe any BoxRow in Step 2. | Three lines: barcode `fontFamily:monospace fontSize:12 fontWeight:'700'`; `article·colour·size fontSize:12 COLORS.textSecondary`; `sku·₹mrp fontSize:11 COLORS.textLight`. | Manual | `repack.tsx:266-275` |

---

## Section 23.16 — Repack: destination scan + capacity validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-RPK-016 | Admin | Step 3: progress banner + "Scan Destination Carton" button | P0 | 1. Advance to Step 3 with 2 boxes selected. | Blue banner: cube icon + "2 boxes selected from <source_barcode>". Card: "Scan Destination Carton" button + hint "Scan a CREATED or ACTIVE master carton to receive the selected boxes." | Manual | `repack.tsx:606-628` |
| TC-MOB-RPK-017 | Admin | Scanning valid ACTIVE destination with enough space advances to Step 4 | P0 | 1. Scan an ACTIVE carton different from source with ≥`selected.size` free slots. | `space = max_capacity - child_count >= selected.size`. Scanner closes. `setDestCarton(c)`, `setStep(4)`. | E2E | `repack.tsx:416-444` |
| TC-MOB-RPK-018 | Admin | Destination = same as source shows "Invalid destination" alert | P0 | 1. Scan the same barcode as the source carton. | Alert "Invalid destination" / "Source and destination cannot be the same carton." `c.id === sourceCarton.id`. | Manual | `repack.tsx:418-421` |
| TC-MOB-RPK-019 | Admin | CLOSED destination shows "Destination closed" alert; DISPATCHED shows "Invalid destination" | P0 | 1. Scan a CLOSED carton. 2. Scan a DISPATCHED carton. | CLOSED: "Destination carton is closed. Reopen or choose another." DISPATCHED: "Destination carton has been dispatched." | Manual | `repack.tsx:422-431` |
| TC-MOB-RPK-020 | Admin | Destination capacity exceeded shows "Not enough space" alert with correct counts | P0 | 1. Select 3 boxes from source. 2. Scan a destination with `max_capacity=5`, `child_count=5` (0 free). | Alert "Not enough space" / "Destination has space for 0 more boxes; you selected 3. Reduce selection or pick another carton." `selected.size > space`. | Manual | `repack.tsx:433-442` |

---

## Section 23.17 — Repack: submit + confirm + stepper navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-RPK-021 | Admin | Step 4 "Repack Summary" card shows FROM/TO barcodes + moving count | P0 | 1. Complete Steps 1-3 with 2 boxes. 2. Observe Step 4. | "REPACK SUMMARY" title. Transfer row: "FROM" + source barcode + badge; arrow icon; "TO" + dest barcode + badge. "Moving 2 boxes" row with cube icon. | Manual | `repack.tsx:655-685` |
| TC-MOB-RPK-022 | Admin | "Show/Hide selected barcodes" expands/collapses barcode list | P0 | 1. Tap "Show selected barcodes". 2. Tap "Hide selected barcodes". | Expands: each selected barcode on its own row in monospace. Collapses: list hidden. Chevron icon toggles up/down. | Manual | `repack.tsx:688-717` |
| TC-MOB-RPK-023 | Admin | "Commit Repack" shows confirmation alert; confirming calls API and resets to Step 1 | P0 | 1. Tap "Commit Repack". 2. Observe alert. 3. Tap "Move boxes". 4. Wait for API. | Alert: "Confirm repack" / "Move N box(es) from <src> to <dest>?". On confirm: `masterCartonService.repack({source_carton_id, destination_carton_id, child_box_barcodes})` called. Success: haptic, toast "Boxes moved successfully.", `resetAll()` → Step 1. Query keys invalidated. | E2E | `repack.tsx:461-479,349-369`; mutation uses `child_box_barcodes` (barcodes, not IDs) |
| TC-MOB-RPK-024 | Admin | Cancelling "Commit Repack" alert stays on Step 4 | P0 | 1. Tap "Commit Repack". 2. Tap "Cancel". | Alert dismisses. Step 4 unchanged. No API call. | Manual | |
| TC-MOB-RPK-025 | Admin | Past stepper dots are tappable and jump to that step | P1 | 1. At Step 3. 2. Tap Step 1 dot in stepper. | `goToStep(1)` called. Clears all state. Step 1 renders. Past dots show checkmark icon. Future dots outlined. | Manual | `repack.tsx:79`; `isPast && onPressStep(s)` |
| TC-MOB-RPK-026 | Admin | Android hardware back prompts "Cancel repack?" when progress exists | P1 | 1. (Android) Advance to Step 2. 2. Press hardware Back. | Alert "Cancel repack?" / "You have unsaved progress. Cancel and go back?" Options: "Stay" (cancel) and "Cancel repack" (destructive, calls `resetAll()`). | Manual | `repack.tsx:292-318`; `BackHandler.addEventListener` — Android only |

---

## Section 23.18 — Unpack: role gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-UPK-001 | Admin | Admin can access Unpack Carton screen | P0 | 1. Login as Admin. 2. Tap Menu → Unpack. | Screen renders. Title "Unpack Carton". "Scan Master Carton" button visible. | E2E | `unpack.tsx:112-117`; `RoleGate allow={['Admin','Supervisor','Warehouse Operator']}` |
| TC-MOB-UPK-002 | Supervisor | Supervisor can access Unpack | P0 | 1. Login as Supervisor. 2. Navigate to Unpack. | Screen renders. | E2E | |
| TC-MOB-UPK-003 | Warehouse Operator | Warehouse Operator can access Unpack | P0 | 1. Login as Warehouse Op. 2. Navigate to Unpack. | Screen renders. | E2E | |
| TC-MOB-UPK-004 | Dispatch Operator | Dispatch Operator sees DeniedView on Unpack | P0 | 1. Login as Dispatch Op. 2. Navigate to Unpack. | `EmptyState icon="lock-closed-outline"`, "Not authorized", "You do not have permission to unpack cartons." | E2E | `unpack.tsx:30-38` |

### Maestro flows for Section 23.18

```yaml
# mobile/.maestro/unpack/unpack-warehouse-access.yaml
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
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "Scan Master Carton"
- assertNotVisible: "Not authorized"
```

```yaml
# mobile/.maestro/unpack/unpack-dispatch-denied.yaml
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
- tapOn: "Unpack"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You do not have permission to unpack cartons."
```

---

## Section 23.19 — Unpack: source scan + status validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-UPK-005 | Admin | Scan button + hint "Scan any ACTIVE or CLOSED master carton…" visible on initial state | P0 | 1. Navigate to Unpack. 2. Observe. | "Scan Master Carton" button (qr-code-outline, full-width). Hint text: "Scan any ACTIVE or CLOSED master carton to unpack it." `carton === null`. | Manual | `unpack.tsx:126-141` |
| TC-MOB-UPK-006 | Admin | Scanning ACTIVE carton loads summary card + haptic | P0 | 1. Tap scan button. 2. Scan an ACTIVE carton. | Scanner closes. Haptic success fires. `carton` state set. Summary card + warning banner + "Unpack Carton" button appear. "Scan Different Carton" outline button replaces original scan button. | E2E | `unpack.tsx:49-71` |
| TC-MOB-UPK-007 | Admin | Scanning CLOSED carton loads it (allowed for unpack) | P0 | 1. Scan a CLOSED carton. | Same as TC-MOB-UPK-006. Only DISPATCHED is blocked for unpack. | E2E | `unpack.tsx:54-70`; CREATED not blocked — see [?] flag |
| TC-MOB-UPK-008 | Admin | Scanning DISPATCHED carton shows "Cannot unpack … has already been dispatched." alert | P0 | 1. Scan a DISPATCHED carton. | Alert "Cannot unpack" / "Carton <barcode> has already been dispatched." `carton` not set. | Manual | `unpack.tsx:55-59` |
| TC-MOB-UPK-009 | Admin | Unknown barcode shows "Scan failed" / "Carton not found" alert | P0 | 1. Scan invalid barcode. | Alert "Scan failed" with API message or fallback "Carton not found". | Manual | `unpack.tsx:64-69` |

---

## Section 23.20 — Unpack: carton summary + confirm + submit

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-UPK-010 | Admin | Summary card: barcode+badge, child box count, articles/colours/sizes, MRP, Created, Closed (if present) | P0 | 1. Scan an ACTIVE carton with full metadata. 2. Scan a CLOSED carton. | ACTIVE: header barcode + ACTIVE badge; `SummaryRow`s for Child boxes, Articles (if present), Colours (if present), Sizes (if present), Total MRP (if present), Created. CLOSED: additional "Closed" row with `formatDate(carton.closed_at)`. | Manual | `unpack.tsx:171-209` |
| TC-MOB-UPK-011 | Admin | Warning banner: "Unpacking will release all N boxes back to FREE status. This cannot be undone." | P0 | 1. Load carton with 4 boxes. 2. Observe banner. | Orange warning banner (`COLORS.warning + '20'` bg): `warning-outline` icon + text "Unpacking will release all 4 boxes back to FREE status. This cannot be undone." N matches `carton.child_count`. | Manual | `unpack.tsx:211-223` |
| TC-MOB-UPK-012 | Admin | "Unpack Carton" taps shows confirm alert; confirming calls fullUnpack and resets screen | P0 | 1. Tap "Unpack Carton" (danger variant). 2. Tap "Unpack" in alert. 3. Wait for API. | Alert: "Unpack carton?" / "This will release all N child boxes from <barcode> to FREE status. Continue?". On confirm: `masterCartonService.fullUnpack(carton.id)`. Success: haptic, toast "Carton unpacked. All boxes released to FREE.", `setCarton(null)` — screen resets. | E2E | `unpack.tsx:94-108,76-92` |
| TC-MOB-UPK-013 | Admin | After full unpack, carton transitions to CREATED; boxes to FREE | P0 | 1. Unpack an ACTIVE carton with 3 boxes. 2. `GET /master-cartons/<id>`. 3. Check 3 boxes: `GET /child-boxes?search=<barcode>` each. | Carton: `{status:'CREATED', child_count:0}`. Each box: `{status:'FREE'}`. | Integration | ACTIVE + fullUnpack → CREATED |
| TC-MOB-UPK-014 | Admin | Cancelling confirm alert leaves screen unchanged | P1 | 1. Tap "Unpack Carton". 2. Tap "Cancel". | Alert dismisses. Carton summary still visible. No API call. | Manual | |
| TC-MOB-UPK-015 | Supervisor | Supervisor full-unpack flow succeeds | P1 | 1. Login as Supervisor. 2. Scan ACTIVE carton. 3. Confirm unpack. | Success. Same flow as Admin. | E2E | |

---

## Section 23.21 — Storage: role gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-STR-001 | Admin | Admin can access Close & Store screen | P0 | 1. Login as Admin. 2. Tap Menu → Close & Store. | Screen renders. Title "Close & Store". "Scan Master Carton" button + hint visible. | E2E | `storage.tsx:114-120`; `RoleGate allow={['Admin','Supervisor','Warehouse Operator']}` |
| TC-MOB-STR-002 | Supervisor | Supervisor can access Storage | P0 | 1. Login as Supervisor. 2. Navigate to Close & Store. | Screen renders. | E2E | |
| TC-MOB-STR-003 | Warehouse Operator | Warehouse Operator can access Storage screen (mobile gate passes; API gate applies) | P0 | 1. Login as Warehouse Op. 2. Navigate to Close & Store. | Screen renders. Mobile `RoleGate` allows Warehouse Op access. See [?] flag — backend `authorize` may restrict `POST /master-cartons/:id/close` to Admin+Supervisor only. | E2E | `storage.tsx`; `README.md §3.1` discrepancy — see Open Questions |
| TC-MOB-STR-004 | Dispatch Operator | Dispatch Operator sees DeniedView on Storage | P0 | 1. Login as Dispatch Op. 2. Navigate to Close & Store. | `EmptyState icon="lock-closed-outline"`, "Not authorized", "You do not have permission to close and store cartons." | E2E | `storage.tsx:30-38` |

### Maestro flows for Section 23.21

```yaml
# mobile/.maestro/storage/storage-admin-access.yaml
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
- tapOn: "Close & Store"
- waitForAnimationToEnd
- assertVisible: "Scan Master Carton"
- assertNotVisible: "Not authorized"
```

```yaml
# mobile/.maestro/storage/storage-dispatch-denied.yaml
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
- tapOn: "Close & Store"
- waitForAnimationToEnd
- assertVisible: "Not authorized"
- assertVisible: "You do not have permission to close and store cartons."
```

---

## Section 23.22 — Storage: scan + status validation + close flow

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-STR-005 | Admin | Initial state: scan button + hint "Scan an ACTIVE master carton to close and store it." | P0 | 1. Navigate to Close & Store. 2. Observe before scan. | "Scan Master Carton" button (full-width). Hint below: "Scan an ACTIVE master carton to close and store it." `carton === null`. | Manual | `storage.tsx:128-163` |
| TC-MOB-STR-006 | Admin | Scanning ACTIVE carton loads summary card + haptic | P0 | 1. Tap "Scan Master Carton". 2. Scan ACTIVE carton. | Haptic success. Summary card + info banner + "Close & Store" button appear. "Scan Different Carton" outline button replaces original. | E2E | `storage.tsx:54-78` |
| TC-MOB-STR-007 | Admin | Scanning CREATED carton shows "Carton empty" alert | P0 | 1. Scan a CREATED (0-box) carton. | Alert "Carton empty" / "Add child boxes before closing this carton." | Manual | `storage.tsx:55-57` |
| TC-MOB-STR-008 | Admin | Scanning CLOSED carton shows "Already closed" alert | P0 | 1. Scan a CLOSED carton. | Alert "Already closed" / "Carton <barcode> is already closed." | Manual | `storage.tsx:58-61` |
| TC-MOB-STR-009 | Admin | Scanning DISPATCHED carton shows "Cannot close" alert | P0 | 1. Scan a DISPATCHED carton. | Alert "Cannot close" / "Carton <barcode> has been dispatched." | Manual | `storage.tsx:62-65` |
| TC-MOB-STR-010 | Admin | Summary card fields: barcode+badge, child_count, articles/colours/sizes, MRP, Created | P0 | 1. Load an ACTIVE carton with full metadata. | Same `SummaryRow` structure as Unpack: barcode header, child_count, conditional articles/colours/sizes/MRP rows, Created. No "Closed" row since status is ACTIVE. | Manual | `storage.tsx:174-211` |
| TC-MOB-STR-011 | Admin | Info banner (blue): "Closing will seal this carton. Boxes will remain in PACKED status." | P0 | 1. Load an ACTIVE carton. 2. Observe banner below summary card. | Blue info banner (`COLORS.info + '20'` bg, `information-circle-outline` icon): "Closing will seal this carton. Boxes will remain in PACKED status." Contrast: Unpack has orange warning. | Manual | `storage.tsx:213-224` |
| TC-MOB-STR-012 | Admin | "Close & Store" confirm alert; confirming calls closeCarton and resets screen | P0 | 1. Tap "Close & Store" (primary variant). 2. Tap "Close & Store" in alert. 3. Wait for API. | Alert "Close carton?" / "This will seal <barcode> (N boxes) and move it to closed inventory." On confirm: `masterCartonService.closeCarton(carton.id)`. Success: haptic, toast "Carton closed and stored.", `setCarton(null)` — screen resets. | E2E | `storage.tsx:100-110,82-98` |
| TC-MOB-STR-013 | Admin | After close, carton status transitions ACTIVE → CLOSED; boxes remain PACKED | P0 | 1. Close an ACTIVE carton. 2. `GET /master-cartons/<id>`. 3. Spot-check one child box. | Carton: `{status:'CLOSED', closed_at:<timestamp>}`. Child box: `{status:'PACKED'}` — not released. | Integration | Storage = close only; Unpack releases boxes |
| TC-MOB-STR-014 | Admin | Cancelling close confirmation leaves screen unchanged | P1 | 1. Tap "Close & Store". 2. Tap "Cancel". | Alert dismisses. Carton summary still visible. No API call. | Manual | |
| TC-MOB-STR-015 | Supervisor | Supervisor close flow succeeds | P1 | 1. Login as Supervisor. 2. Scan ACTIVE carton. 3. Confirm close. | Success. Carton transitions to CLOSED. | E2E | |

---

## Section 23.23 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-PROD-029 | Admin | Products: network failure on initial load falls through to EmptyState (no crash) | P1 | 1. Disable network. 2. Navigate to Products. | Spinner briefly. Query fails → `query.isLoading=false`, `items.length=0` → `EmptyState "No products"` renders. No crash. No dedicated network-error state. | Manual | `products/index.tsx:279-284` — no explicit error state |
| TC-MOB-PROD-030 | Admin | Product detail: malformed/nonexistent ID shows "Product not found" | P1 | 1. Navigate to `/products/not-a-valid-uuid`. | `productQ.data` undefined. `EmptyState` "Product not found" / "This product may have been removed." | Manual | `products/[id].tsx:66-79` |
| TC-MOB-CB-030 | Admin | Child box: network failure falls through to EmptyState (no crash) | P1 | 1. Disable network. 2. Navigate to Child Boxes. | Same as products — empty state renders after query fails. No crash. | Manual | `child-boxes/index.tsx:266-270` |
| TC-MOB-CB-031 | Admin | Child box detail: invalid ID shows "Child box not found." | P0 | 1. Navigate to `/child-boxes/invalid-uuid-9999`. | Text "Child box not found." visible. | Manual | `child-boxes/[id].tsx:65-70` |
| TC-MOB-RPK-027 | Admin | Repack: network failure after Step 3 before commit shows error; state preserved | P1 | 1. Complete Steps 1-3. 2. Disable network. 3. Tap "Commit Repack" → "Move boxes". | API call fails. Error toast or alert with error message. Step 4 remains visible. User can retry. | Manual | `repackMutation` error path |
| TC-MOB-RPK-028 | Admin | Repack: scanning a child-box QR as source carton shows "Scan failed" | P1 | 1. At Step 1, present a child-box QR. | `parseQRCode(raw)` → `type='child'`; raw value uppercased sent to `getByBarcode`. API returns 404. Alert "Scan failed" / "Carton not found". | Manual | `repack.tsx:375`; fallback when type ≠ 'master' |
| TC-MOB-UPK-016 | Admin | Unpack: scanning CREATED (0-box) carton loads it without alert — [?] gap vs Repack/Storage | P1 | 1. Scan a CREATED carton in Unpack. | Carton loads (no `CREATED` block in unpack.tsx). Summary shows "0" child boxes. Warning banner shows "all 0 boxes". "Unpack Carton" button is active. Confirm → API call for 0 boxes. | Manual | [?] Unpack does NOT block CREATED — inconsistent with Repack and Storage. See Open Questions. |
| TC-MOB-STR-016 | Admin | Storage: scanning child-box QR as carton shows "Scan failed" | P1 | 1. Present child-box QR to Storage scanner. | Same fallback as Repack — `parseQRCode` returns `type='child'`; raw value sent to `masterCartonService.getByBarcode` → 404 → "Scan failed". | Manual | `storage.tsx:51`; same `parseQRCode` pattern |
| TC-MOB-STR-017 | Warehouse Operator | Storage: Warehouse Op API 403 on close attempt (backend gate) | P0 | 1. Login as Warehouse Op. 2. Navigate to Close & Store. 3. Scan ACTIVE carton. 4. Tap "Close & Store" → "Close & Store". | Mobile screen allows the attempt (RoleGate passes). API returns HTTP 403 (backend restricts close to Admin+Supervisor). Error toast visible. Screen retains carton summary. | Integration | `README.md §3.1` matrix vs `storage.tsx` RoleGate mismatch — see Open Questions |

---

## Maestro flows index

| Flow file | Section | Purpose |
|---|---|---|
| `mobile/.maestro/products/products-admin-access.yaml` | 23.1 | Admin accesses Products (positive) |
| `mobile/.maestro/products/products-warehouse-denied.yaml` | 23.1 | Warehouse Op denied on Products (negative) |
| `mobile/.maestro/products/products-search-and-filter.yaml` | 23.3 | Search + section chip |
| `mobile/.maestro/products/products-empty-state.yaml` | 23.5 | No-results empty state |
| `mobile/.maestro/products/products-detail-tap.yaml` | 23.6 | Card tap → detail navigation |
| `mobile/.maestro/child-boxes/cb-all-roles-access.yaml` | 23.7 | Dispatch Op accesses Child Boxes (all-roles positive) |
| `mobile/.maestro/child-boxes/cb-status-filter.yaml` | 23.9 | Status filter chips render + activate |
| `mobile/.maestro/child-boxes/cb-detail-tap.yaml` | 23.11 | Tap card → detail (Warehouse Op) |
| `mobile/.maestro/child-boxes/cb-generate-stub.yaml` | 23.12 | Generate stub screen content |
| `mobile/.maestro/repack/repack-admin-access.yaml` | 23.13 | Admin accesses Repack |
| `mobile/.maestro/repack/repack-dispatch-denied.yaml` | 23.13 | Dispatch Op denied on Repack |
| `mobile/.maestro/unpack/unpack-warehouse-access.yaml` | 23.18 | Warehouse Op accesses Unpack |
| `mobile/.maestro/unpack/unpack-dispatch-denied.yaml` | 23.18 | Dispatch Op denied on Unpack |
| `mobile/.maestro/storage/storage-admin-access.yaml` | 23.21 | Admin accesses Close & Store |
| `mobile/.maestro/storage/storage-dispatch-denied.yaml` | 23.21 | Dispatch Op denied on Storage |

**Total Maestro YAML flows: 15**

---

## Open questions / `[?]` flags

| # | Section | TC | Question |
|---|---|---|---|
| 1 | 23.1 | TC-MOB-PROD-004 | Is the "Products" tile hidden from the Menu grid for Warehouse Operator and Dispatch Operator? The `RoleGate` blocks access but if the tile is still visible in Menu it is a confusing UX. Verify Menu grid tile visibility per role. |
| 2 | 23.19 | TC-MOB-UPK-007 | Unpack does NOT block `CREATED` status cartons (unlike Repack: "Source carton is empty" and Storage: "Add child boxes before closing"). If a CREATED/0-box carton is scanned in Unpack, the summary card loads with `child_count=0` and the "Unpack Carton" button is enabled. Calling `fullUnpack` on a 0-box carton may return 200 or may throw. Confirm this is intentional or flag as gap vs. Repack/Storage consistency. |
| 3 | 23.22 | TC-MOB-STR-003, TC-MOB-STR-017 | Mobile `RoleGate` on Storage allows Warehouse Operator access (`allow={['Admin', 'Supervisor', 'Warehouse Operator']}`), but the role capability matrix in `README.md §3.1` states "Master carton close: Warehouse Op ❌". This means the mobile screen passes the gate, but the backend `authorize` decorator for `POST /master-cartons/:id/close` should return 403. This is a UX inconsistency — the Warehouse Op can scan, see the summary, press "Close & Store", and only then get an error. Either the mobile RoleGate should exclude Warehouse Operator, or the matrix is wrong. Needs Opus arbitration. |
| 4 | 23.17 | TC-MOB-RPK-023 | The repack mutation payload key is `child_box_barcodes` (barcode strings), not `child_box_ids`. Cross-check with phase-10 TCs for `POST /master-cartons/repack` (or `masterCartonService.repack`) to confirm the exact API field name expected. If the backend expects `child_box_ids`, the mutation payload is wrong. |
| 5 | 23.12 | TC-MOB-CB-026 | Navigation path to `/child-boxes/generate` is assumed to be via a Menu tile labelled per the screen's `Stack.Screen options={{ title: 'Generate Labels' }}`. Confirm the exact Menu tile label is "Generate Labels" and that it routes to this screen. |
| 6 | 23.23 | TC-MOB-PROD-029 | Neither `products/index.tsx` nor `child-boxes/index.tsx` has a dedicated network-error state — both fall through to the empty state after a failed query. Whether the empty-state message "Try adjusting filters." is appropriate for a network error (vs. a zero-results filter) is a UX question. The distinction is not surfaced in the UI. Flag for future improvement. |

---

*Authored 2026-05-02 by Sonnet under Opus dispatch (Session 3 of 13 in mobile coverage workstream).*
