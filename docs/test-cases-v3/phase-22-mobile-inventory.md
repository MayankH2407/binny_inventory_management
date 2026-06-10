# Phase 22 — Mobile Inventory (Child Box hierarchy + Master Carton view)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `/(tabs)/inventory` screen, both hierarchies, drill-down, breadcrumbs, summary cards, pagination
**Mobile build under test:** Mobile parity M5 (commit `108796d` and later)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-02

---

## Table of Contents

- [Section 22.1 — Tab visibility & summary card rendering (all 4 roles)](#section-221--tab-visibility--summary-card-rendering-all-4-roles)
- [Section 22.2 — Tab toggle UI (Child Box | Master Carton segmented control)](#section-222--tab-toggle-ui-child-box--master-carton-segmented-control)
- [Section 22.3 — Child Box: section level](#section-223--child-box-section-level)
- [Section 22.4 — Child Box: article level + multi-MRP caption](#section-224--child-box-article-level--multi-mrp-caption)
- [Section 22.5 — Child Box: MRP level (conditional, distinctMrpCount > 1)](#section-225--child-box-mrp-level-conditional-distinctmrpcount--1)
- [Section 22.6 — Child Box: colour level](#section-226--child-box-colour-level)
- [Section 22.7 — Child Box: product (leaf) level + FLOOR name pattern](#section-227--child-box-product-leaf-level--floor-name-pattern)
- [Section 22.8 — Child Box: drill-down + breadcrumb-jump + back navigation](#section-228--child-box-drill-down--breadcrumb-jump--back-navigation)
- [Section 22.9 — Child Box: conditional MRP skip (single-MRP article → colour direct)](#section-229--child-box-conditional-mrp-skip-single-mrp-article--colour-direct)
- [Section 22.10 — Master Carton: status level](#section-2210--master-carton-status-level)
- [Section 22.11 — Master Carton: section level + article level](#section-2211--master-carton-section-level--article-level)
- [Section 22.12 — Master Carton: leaf carton card UI](#section-2212--master-carton-leaf-carton-card-ui)
- [Section 22.13 — Master Carton: utilization bar color thresholds](#section-2213--master-carton-utilization-bar-color-thresholds)
- [Section 22.14 — Master Carton: status pill colors per status](#section-2214--master-carton-status-pill-colors-per-status)
- [Section 22.15 — Master Carton: status-breakdown chips on non-leaf cards](#section-2215--master-carton-status-breakdown-chips-on-non-leaf-cards)
- [Section 22.16 — Master Carton: leaf-tap navigates to /master-cartons/id](#section-2216--master-carton-leaf-tap-navigates-to-master-cartonsid)
- [Section 22.17 — Master Carton: load-more pagination](#section-2217--master-carton-load-more-pagination)
- [Section 22.18 — Master Carton: drill + breadcrumb + back resets pagination](#section-2218--master-carton-drill--breadcrumb--back-resets-pagination)
- [Section 22.19 — Tab-switch preserves each tab's breadcrumb stack](#section-2219--tab-switch-preserves-each-tabs-breadcrumb-stack)
- [Section 22.20 — Pull-to-refresh, loading states, and empty states](#section-2220--pull-to-refresh-loading-states-and-empty-states)
- [Section 22.21 — All 4 roles can access + drill (positive coverage per role)](#section-2221--all-4-roles-can-access--drill-positive-coverage-per-role)
- [Section 22.22 — Negative / edge cases](#section-2222--negative--edge-cases)

---

## Preconditions

- Mobile app installed from EAS preview build URL (or sideloaded `eas build --profile preview` APK). Package name: `com.basiq360.binnyinventory`.
- Backend reachable at the configured `API_BASE_URL` (default `https://srv1409601.hstgr.cloud/binny/api/v1`).
- All 4 role accounts exist (run `TC-USER-SEED-001` from `phase-02-user-management.md` if not):
  - Admin: `admin@binny.com` / `Admin@123`
  - Supervisor: `supervisor@binny.com` / `Sup@123`
  - Warehouse Operator: `warehouse@binny.com` / `Wh@123`
  - Dispatch Operator: `dispatch@binny.com` / `Dp@123`
- Device: Android emulator or physical device; iOS simulator optional.
- Maestro CLI installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- App data cleared (`clearState` in Maestro or device Settings → Apps → Clear Data) before each E2E flow unless otherwise stated.

## Test-data fixtures referenced

| Fixture | Description | Used in |
|---|---|---|
| `MRP TEST CITY 02` | Multi-MRP article — ₹299 BLUE (sizes 6-8) + ₹399 RED (sizes 6-8); `distinctMrpCount = 2` | 22.4, 22.5, 22.8, 22.11 |
| `MRP TEST CITY 03` | Single-MRP control — ₹599 BLACK (sizes 6-8); `distinctMrpCount = 1` | 22.9 |
| 3 ACTIVE master cartons (hold `MRP TEST CITY 02 BLUE` boxes) | Exercise utilization bar thresholds at various fill levels | 22.12, 22.13, 22.17 |
| Section "Hawaii" (or equivalent seeded section) | Top-level section visible on Child Box section-level | 22.3, 22.4, 22.10 |

If any fixture is absent, the Admin must create it via the web portal before running the relevant TC.

---

## Section 22.1 — Tab visibility & summary card rendering (all 4 roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-001 | Admin | Inventory tab is reachable and renders the segmented control | P0 | 1. Login as Admin. 2. Tap "Inventory" tab in the bottom tab bar. 3. Observe the screen. | Screen renders without crash. A segmented control with two buttons ("Child Box" and "Master Carton") is visible near the top. | E2E | `inventory.tsx:250-281`; `activeTab` defaults to `'child'` |
| TC-MOB-INV-002 | Supervisor | Supervisor can access Inventory tab | P0 | 1. Login as Supervisor. 2. Tap "Inventory" tab. 3. Observe. | Inventory screen renders. Segmented control visible. No access-denied message. | E2E | No `<RoleGate>` on inventory screen |
| TC-MOB-INV-003 | Warehouse Operator | Warehouse Operator can access Inventory tab | P0 | 1. Login as Warehouse Operator. 2. Tap "Inventory" tab. | Inventory screen renders. Segmented control visible. No role-gate block. | E2E | |
| TC-MOB-INV-004 | Dispatch Operator | Dispatch Operator can access Inventory tab | P0 | 1. Login as Dispatch Operator. 2. Tap "Inventory" tab. | Inventory screen renders. Segmented control visible. | E2E | |
| TC-MOB-INV-005 | Admin | Summary cards "Pairs in Stock" and "Child Boxes" are visible at root | P0 | 1. Login as Admin. 2. Tap "Inventory" tab. 3. Ensure Child Box tab is active and no breadcrumbs exist (initial state). 4. Observe row above segmented control. | Two `<Card>` side by side: left shows numeric value + label "Pairs in Stock"; right shows numeric value + label "Child Boxes". Values sourced from `GET /inventory/stock/summary` fields `totalPairsInStock` and `totalChildBoxes`. | E2E | `inventory.tsx:236-247`; condition: `summary && activeBreadcrumbs.length === 0` |
| TC-MOB-INV-006 | Admin | Summary card values match GET /inventory/stock/summary API response | P0 | 1. `GET https://srv1409601.hstgr.cloud/binny/api/v1/inventory/stock/summary` with Admin JWT. Record `totalPairsInStock` and `totalChildBoxes`. 2. On mobile, navigate to Inventory tab root. 3. Read both card values. | Each card value on mobile matches the corresponding field in the API response. | Integration | `inventoryService.getStockSummary()` → `GET /inventory/stock/summary` |
| TC-MOB-INV-007 | Admin | Summary cards are hidden after drilling in (breadcrumbs.length > 0) | P0 | 1. Login as Admin. 2. Navigate to Inventory tab. 3. Confirm summary cards visible. 4. Tap any section tile to drill. 5. Observe the summary card row. | After drill: both cards NOT rendered. The `activeBreadcrumbs.length === 0` condition is false; `<View style={styles.summaryRow}>` is unmounted. | E2E | `inventory.tsx:236` — conditional render |
| TC-MOB-INV-008 | Admin | Summary cards reappear when returning to root via "All" breadcrumb | P0 | 1. Drill into a section. 2. Confirm summary cards gone. 3. Tap "All" in the breadcrumb row. 4. Observe summary row. | Summary cards reappear when `childBreadcrumbs` resets to `[]` via `goToChildLevel(0)`. | E2E | `inventory.tsx:286` |

### Maestro flows for Section 22.1

```yaml
# mobile/.maestro/inventory/inventory-tab-access-admin.yaml
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Master Carton"
- assertVisible: "Pairs in Stock"
- assertVisible: "Child Boxes"
```

```yaml
# mobile/.maestro/inventory/inventory-tab-access-all-roles.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "supervisor@binny.com"
  PASSWORD: "Sup@123"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Master Carton"
- assertVisible: "Pairs in Stock"
```

---

## Section 22.2 — Tab toggle UI (Child Box | Master Carton segmented control)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-009 | Admin | Segmented control renders "Child Box" and "Master Carton" labels | P0 | 1. Login as Admin. 2. Tap Inventory tab. 3. Observe the segmented control. | Two buttons side-by-side. Left: "Child Box". Right: "Master Carton". Both fit without truncation. | Manual | `inventory.tsx:252-255`; labels defined in array |
| TC-MOB-INV-010 | Admin | "Child Box" tab is active (filled) by default on first render | P0 | 1. Login as Admin. 2. Navigate to Inventory tab. 3. Observe without tapping. | "Child Box" button: `backgroundColor: COLORS.primary` (`#2D2A6E`), text white. "Master Carton" button: white background, `COLORS.primary` text. `activeTab` defaults to `'child'`. | Manual | `inventory.tsx:88` — `useState<'child' \| 'carton'>('child')` |
| TC-MOB-INV-011 | Admin | Tapping "Master Carton" activates that segment and deactivates "Child Box" | P0 | 1. Login as Admin. 2. Navigate to Inventory. 3. Tap "Master Carton" button. | "Master Carton" button fills with `COLORS.primary`; "Child Box" becomes outlined. `activeTab` changes to `'carton'`; Master Carton hierarchy loads. | E2E | `switchTab('carton')` called on press |
| TC-MOB-INV-012 | Admin | Segmented control is always visible at all drill depths | P0 | 1. Login as Admin. 2. Drill 3 levels deep in Child Box. 3. Observe the screen. | Segmented control ("Child Box" / "Master Carton") remains visible above breadcrumbs and tiles at all drill depths. Rendered unconditionally outside any conditional block. | Manual | `inventory.tsx:249-281` — rendered before breadcrumbs |

### Maestro flows for Section 22.2

```yaml
# mobile/.maestro/inventory/tab-toggle-switch.yaml
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Master Carton"
- tapOn: "Master Carton"
- waitForAnimationToEnd
- tapOn: "Child Box"
- waitForAnimationToEnd
- assertVisible: "Child Box"
```

---

## Section 22.3 — Child Box: section level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-013 | Admin | Child Box root renders section-level tiles from API | P0 | 1. Login as Admin. 2. Navigate to Inventory → Child Box (default tab). 3. Observe tile list. | Tiles correspond to the array from `GET /inventory/stock/hierarchy?level=section`. Section names visible (e.g., "Hawaii"). Query key: `['inventory-hierarchy','section','{}']`. | Integration | `inventoryService.getStockHierarchy({level:'section'})` |
| TC-MOB-INV-014 | Admin | Section tile shows name, 3-segment stock bar, and Free/Packed/Disp labels | P0 | 1. Login as Admin. 2. Navigate to Inventory → Child Box root. 3. Observe any section tile. | Tile shows: (a) section name in `styles.itemName` (fontSize 15, fontWeight 700); (b) horizontal 3-segment stock bar (height 6, borderRadius 3) with segments in `COLORS.statusFree` (#16A34A), `COLORS.statusPacked` (#3B82F6), `COLORS.statusDispatched` (#6B7280); (c) label row: "Free: <N>", "Packed: <N>", "Disp: <N>". | Manual | `inventory.tsx:326-349` |
| TC-MOB-INV-015 | Admin | Stock bar segments are proportional to free/packed/dispatched counts (flex-based) | P0 | 1. Login as Admin. 2. Observe a section tile with known `free`, `packed`, `dispatched` values. | Each segment's `flex` equals its respective count. E.g., `free: 10, packed: 5, dispatched: 5` → bar is 50% green / 25% blue / 25% grey. When `item.total === 0`, no segments render (just the `COLORS.borderLight` track). | Manual | `inventory.tsx:337-341`; `item.total > 0` guard on line 337 |
| TC-MOB-INV-016 | Admin | Section tile shows chevron-forward icon; tapping navigates to article level | P0 | 1. Login as Admin. 2. Navigate to Inventory → Child Box root. 3. Observe chevron on right of any section tile. 4. Tap the "Hawaii" section tile. | Chevron-forward (`size={18}`, `color={COLORS.textLight}`) is visible at the right. After tap: `childBreadcrumbs` gains crumb `{level:'section', label:'Hawaii', filter:{section:'Hawaii'}}`. `currentLevel` becomes `'article_name'`. API fires `GET /inventory/stock/hierarchy?level=article_name&section=Hawaii`. | E2E | `inventory.tsx:119-132`; chevron conditional: `currentLevel !== 'product'` |

### Maestro flows for Section 22.3

```yaml
# mobile/.maestro/inventory/child-box-section-level.yaml
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Free:"
- assertVisible: "Packed:"
- assertVisible: "Disp:"
```

---

## Section 22.4 — Child Box: article level + multi-MRP caption

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-017 | Admin | Article-level tiles appear after drilling into a section | P0 | 1. Login as Admin. 2. Drill into section containing `MRP TEST CITY 02`. | API fires `GET /inventory/stock/hierarchy?level=article_name&section=<section>`. `MRP TEST CITY 02` tile is present. Each tile shows name, stock bar, and Free/Packed/Disp labels. | Integration | Requires `MRP TEST CITY 02` fixture in seeded section |
| TC-MOB-INV-018 | Admin | Multi-MRP article tile shows "2 MRPs" caption when distinctMrpCount === 2 | P0 | 1. Drill to section containing `MRP TEST CITY 02`. 2. Observe the `MRP TEST CITY 02` tile. | Text "2 MRPs" is visible below the tile name, styled in `styles.mrpCaption` (fontSize 12, `COLORS.primary`, fontWeight 600). Caption renders because `item.distinctMrpCount === 2 > 1`. | E2E | `inventory.tsx:332-334` — `currentLevel === 'article_name' && item.distinctMrpCount > 1` |
| TC-MOB-INV-019 | Admin | Single-MRP article tile does NOT show MRP count caption | P0 | 1. Drill to section containing `MRP TEST CITY 03`. 2. Observe `MRP TEST CITY 03` tile. | No "MRPs" caption. `item.distinctMrpCount === 1`; condition `distinctMrpCount > 1` is false; `<Text style={styles.mrpCaption}>` not rendered. | E2E | `inventory.tsx:332-334`; requires `MRP TEST CITY 03` fixture |
| TC-MOB-INV-020 | Admin | MRP caption is absent on non-article levels (section / colour / product) | P0 | 1. Observe tiles at section level, then at colour level, then at product level. | No "MRPs" caption appears at any level other than `article_name`. The caption block is guarded: `currentLevel === 'article_name' && item.distinctMrpCount > 1`. | Manual | `inventory.tsx:332` — `currentLevel === 'article_name'` guard |

### Maestro flows for Section 22.4

```yaml
# mobile/.maestro/inventory/child-box-article-level-mrp-caption.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- assertVisible: "All"
- assertVisible: "MRP TEST CITY 02"
- assertVisible: "2 MRPs"
```

---

## Section 22.5 — Child Box: MRP level (conditional, distinctMrpCount > 1)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-021 | Admin | Drilling into multi-MRP article navigates to MRP level | P0 | 1. Drill: section → `MRP TEST CITY 02` (article with `distinctMrpCount = 2`). | Crumb added: `{level:'article_name', label:'MRP TEST CITY 02', filter:{article_name:'MRP TEST CITY 02'}, distinctMrpCount:2}`. `nextChildLevel` returns `'mrp'`. API: `GET /inventory/stock/hierarchy?level=mrp&section=<s>&article_name=MRP+TEST+CITY+02`. | E2E | `inventory.tsx:41` — `distinctMrpCount > 1` → `'mrp'` |
| TC-MOB-INV-022 | Admin | MRP-level tiles show ₹299 and ₹399 buckets for MRP TEST CITY 02 | P0 | 1. Drill to MRP level of `MRP TEST CITY 02`. 2. Observe tile names. | Two tiles visible: "₹299" and "₹399". Each shows its own stock bar and Free/Packed/Disp labels. Chevron-forward icon present (not at leaf). | E2E | Requires `MRP TEST CITY 02` fixture with two MRP buckets |
| TC-MOB-INV-023 | Admin | MRP breadcrumb shows "All > section > MRP TEST CITY 02" at MRP level | P0 | 1. Drill: section → `MRP TEST CITY 02`. 3. Observe breadcrumb row. | Breadcrumb: "All" (tappable) → chevron → section name (tappable) → chevron → "MRP TEST CITY 02" (active, non-tappable). Two crumbs pushed. | E2E | |
| TC-MOB-INV-024 | Admin | Tapping an MRP tile drills to colour level with MRP filter applied | P0 | 1. Drill to MRP level of `MRP TEST CITY 02`. 2. Tap "₹299". | Crumb added `{level:'mrp', label:'₹299', filter:{mrp:'299'}}`. `nextChildLevel` after `'mrp'` crumb → `'colour'`. API: `GET /inventory/stock/hierarchy?level=colour&section=<s>&article_name=MRP+TEST+CITY+02&mrp=299`. Only colours at ₹299 (BLUE) appear. | Integration | `inventory.tsx:42` — `case 'mrp': return 'colour'` |

### Maestro flows for Section 22.5

```yaml
# mobile/.maestro/inventory/child-box-mrp-level.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- assertVisible: "₹299"
- assertVisible: "₹399"
- assertVisible: "MRP TEST CITY 02"
```

---

## Section 22.6 — Child Box: colour level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-025 | Admin | Colour-level tiles appear after drilling through MRP level | P0 | 1. Drill: section → `MRP TEST CITY 02` → ₹299. 3. Observe tiles. | Colour tile "BLUE" appears (the colour priced at ₹299 for this article). API: `GET /inventory/stock/hierarchy?level=colour&section=<s>&article_name=MRP+TEST+CITY+02&mrp=299`. | Integration | `nextChildLevel` after `'mrp'` crumb → `'colour'`; filter carries `mrp:'299'` |
| TC-MOB-INV-026 | Admin | Colour tile shows name, stock bar, labels, and chevron-forward | P0 | 1. Drill to colour level. 2. Observe any colour tile. | Tile: colour name (e.g., "BLUE"), 3-segment stock bar, "Free: <N>" / "Packed: <N>" / "Disp: <N>" labels, chevron-forward icon on right (`currentLevel !== 'product'` is true). | Manual | Same card template used at all levels |
| TC-MOB-INV-027 | Admin | Tapping a colour tile drills to product level and adds colour crumb | P0 | 1. Drill to colour level. 2. Tap "BLUE". | Crumb added `{level:'colour', label:'BLUE', filter:{colour:'BLUE'}}`. `nextChildLevel` after `'colour'` crumb → `'product'`. API: `GET /inventory/stock/hierarchy?level=product&section=<s>&article_name=MRP+TEST+CITY+02&mrp=299&colour=BLUE`. | Integration | `inventory.tsx:43` — `case 'colour': return 'product'` |

### Maestro flows for Section 22.6

```yaml
# mobile/.maestro/inventory/child-box-colour-level.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- tapOn: "₹299"
- waitForAnimationToEnd
- assertVisible: "BLUE"
- assertVisible: "Free:"
```

---

## Section 22.7 — Child Box: product (leaf) level + FLOOR name pattern

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-028 | Admin | Product-level tiles appear after drilling through colour | P0 | 1. Drill: section → `MRP TEST CITY 02` → ₹299 → BLUE. 2. Observe tiles. | Product tiles appear for each size (e.g., "6 - ₹299", "7 - ₹299", "8 - ₹299"). API: `GET /inventory/stock/hierarchy?level=product&section=<s>&article_name=MRP+TEST+CITY+02&mrp=299&colour=BLUE`. | Integration | `nextChildLevel` after `'colour'` crumb → `'product'` |
| TC-MOB-INV-029 | Admin | Product tile name includes FLOOR-pretty MRP suffix from backend | P0 | 1. Drill to product level via the ₹299 path. 2. Observe tile names. | Names include suffix in FLOOR-pretty format: "6 - ₹299", "7 - ₹299", "8 - ₹299". Mobile renders `item.name` as-is; backend is responsible for the suffix format. | Manual | `inventory.tsx:327` — `{item.name}` rendered verbatim |
| TC-MOB-INV-030 | Admin | Product tile (leaf) has no chevron-forward icon and is disabled | P0 | 1. Drill to product level. 2. Observe any product tile right side. 3. Tap a product tile. | No chevron icon. `currentLevel === 'product'` makes `currentLevel !== 'product'` false. `<TouchableOpacity disabled={true}>` — tap does nothing; `drillDownChild` guard `if (currentLevel === 'product') return` also fires. | Manual | `inventory.tsx:320-322, 328-330` |
| TC-MOB-INV-031 | Admin | Product level breadcrumb shows full 4-crumb path for multi-MRP drill | P0 | 1. Drill all levels: section → `MRP TEST CITY 02` → ₹299 → BLUE (4 crumbs in `childBreadcrumbs`; now at `'product'` level). 2. Observe breadcrumb row. | Breadcrumb: "All" → section label (tappable) → article label (tappable) → "₹299" (tappable) → "BLUE" (active, non-tappable). 4 crumbs pushed when at product level. Chevron separators between each. | Manual | `childBreadcrumbs` has 4 entries at product level |

### Maestro flows for Section 22.7

```yaml
# mobile/.maestro/inventory/child-box-product-level.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- tapOn: "₹299"
- waitForAnimationToEnd
- tapOn: "BLUE"
- waitForAnimationToEnd
- assertVisible: "Free:"
- assertVisible: "Packed:"
- assertVisible: "Disp:"
- assertVisible: "₹299"
```

---

## Section 22.8 — Child Box: drill-down + breadcrumb-jump + back navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-032 | Admin | Breadcrumb "All" link resets to root and clears all crumbs | P0 | 1. Drill two levels deep (section → article). 2. Tap "All" in the breadcrumb row. | `goToChildLevel(0)` called; `childBreadcrumbs` set to `[]`. Screen returns to section level. Summary cards reappear. Breadcrumb row disappears. API refetches at `level=section`. | E2E | `inventory.tsx:286` — `goToChildLevel(0)` |
| TC-MOB-INV-033 | Admin | Tapping an intermediate breadcrumb crumb jumps to that depth | P0 | 1. Drill 3 levels: section → article → MRP (3 crumbs; at MRP level breadcrumb shows "All > section > article" with article as the tappable 2nd crumb). 2. Tap the section crumb (first crumb after "All"). | `goToChildLevel(1)` called; `childBreadcrumbs` sliced to keep only the first crumb. `currentLevel` returns to `'article_name'`. Article tiles for that section are shown. | E2E | `inventory.tsx:293` — `goToChildLevel(i+1)` where `i=0` |
| TC-MOB-INV-034 | Admin | Back button appears only when breadcrumbs.length > 0 | P0 | 1. Navigate to Inventory → Child Box root. 2. Observe below segmented control (no Back). 3. Tap a section tile. 4. Observe again. | At root: no "Back" button. After drilling: button with `<Ionicons name="arrow-back" size={18} color={COLORS.primary} />` + text "Back" appears below breadcrumbs. | E2E | `inventory.tsx:305-312` — `activeBreadcrumbs.length > 0` condition |
| TC-MOB-INV-035 | Admin | Tapping Back pops one crumb and returns to the previous level | P0 | 1. Drill section → article (2 crumbs). 2. Tap "Back". | `goBackChild` called; `childBreadcrumbs.slice(0,-1)`. Screen returns to section tiles. One crumb remains in breadcrumb row (section crumb). | E2E | `inventory.tsx:134` |
| TC-MOB-INV-036 | Admin | Last breadcrumb crumb is non-tappable (active style); earlier crumbs are tappable links | P0 | 1. Drill 3 levels. 2. Observe breadcrumb row. 3. Tap the last crumb. | Last crumb: `styles.breadcrumbActive` (fontSize 13, `COLORS.text`, fontWeight 600). `disabled={true}` — tap does nothing. Earlier crumbs: `styles.breadcrumbLink` (fontSize 13, `COLORS.primary`, fontWeight 600). Tapping an earlier crumb navigates to that depth. | Manual | `inventory.tsx:294-299` — style ternary + `disabled={i === activeBreadcrumbs.length - 1}` |
| TC-MOB-INV-037 | Admin | Chevron separator is rendered between each breadcrumb element | P0 | 1. Drill two levels. 2. Observe breadcrumb row structure. | Between "All" and the first crumb, and between each pair of adjacent crumbs: `<Ionicons name="chevron-forward" size={14} color={COLORS.textLight} />` separator. | Manual | `inventory.tsx:291-292` |

### Maestro flows for Section 22.8

```yaml
# mobile/.maestro/inventory/child-box-breadcrumb-back.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- assertVisible: "Back"
- assertVisible: "All"
- tapOn: "Back"
- waitForAnimationToEnd
- assertNotVisible: "Back"
- assertVisible: "Pairs in Stock"
```

```yaml
# mobile/.maestro/inventory/child-box-breadcrumb-jump.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- tapOn: "All"
- waitForAnimationToEnd
- assertVisible: "Pairs in Stock"
- assertNotVisible: "Back"
```

---

## Section 22.9 — Child Box: conditional MRP skip (single-MRP article → colour direct)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-038 | Admin | Drilling into single-MRP article jumps directly to colour level | P0 | 1. Drill to section containing `MRP TEST CITY 03`. 2. Tap `MRP TEST CITY 03` tile. | `item.distinctMrpCount === 1`; crumb added with `distinctMrpCount: 1`. `nextChildLevel` reads last crumb — `distinctMrpCount` not > 1 → returns `'colour'`. API: `GET /inventory/stock/hierarchy?level=colour&section=<s>&article_name=MRP+TEST+CITY+03`. Colour tiles appear directly (no MRP step). | E2E | `inventory.tsx:41` — `(last.distinctMrpCount && last.distinctMrpCount > 1) ? 'mrp' : 'colour'`; requires `MRP TEST CITY 03` |
| TC-MOB-INV-039 | Admin | Single-MRP article breadcrumb shows "All > section > MRP TEST CITY 03" (no MRP crumb) | P0 | 1. Drill: section → `MRP TEST CITY 03`. 2. Observe breadcrumb row. | Only two crumbs: section label (tappable) + "MRP TEST CITY 03" (active). No MRP crumb inserted between them. `currentLevel` is `'colour'`. | E2E | |
| TC-MOB-INV-040 | Admin | Single-MRP colour level has no mrp query param in API call | P0 | 1. Drill: section → `MRP TEST CITY 03` → colour level. 2. Inspect the API request. | URL is `GET /inventory/stock/hierarchy?level=colour&section=<s>&article_name=MRP+TEST+CITY+03` — no `mrp` parameter. No MRP crumb was pushed so no `mrp` key in `currentFilters`. | Integration | `currentFilters` built from breadcrumbs; MRP crumb never pushed → no `mrp` key |
| TC-MOB-INV-041 | Admin | Single-MRP colour tiles show "BLACK" directly for MRP TEST CITY 03 | P0 | 1. Drill: section → `MRP TEST CITY 03`. 2. Observe colour tiles. | Tile "BLACK" visible. Stock bar and labels rendered. No MRP bucket tiles (e.g., "₹599") appear — we are at colour level, not MRP level. | E2E | Requires `MRP TEST CITY 03` fixture |

### Maestro flows for Section 22.9

```yaml
# mobile/.maestro/inventory/child-box-mrp-skip.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 03"
- waitForAnimationToEnd
- assertVisible: "BLACK"
- assertNotVisible: "₹599"
```

---

## Section 22.10 — Master Carton: status level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-042 | Admin | Master Carton root renders status-level tiles from API | P0 | 1. Login as Admin. 2. Tap "Master Carton" tab. 3. Observe tiles. | `GET /inventory/cartons/hierarchy?level=status` fires. Status bucket tiles appear (e.g., "ACTIVE", "CREATED", "CLOSED", "DISPATCHED"). Each rendered by `<CartonGroupCard>`. | Integration | `inventoryService.getCartonHierarchy('status', {})` |
| TC-MOB-INV-043 | Admin | Status-level tile shows name, carton count subtitle, status chips, and footer | P0 | 1. On Master Carton root, observe any status tile (e.g., "ACTIVE"). | `<CartonGroupCard>` renders: (a) `node.name` ("ACTIVE") in `styles.itemName`; (b) subtitle `{node.cartonCount} carton(s)`; (c) status chips for counts > 0; (d) footer `{node.childBoxCount} boxes` and (if defined) `{node.avgUtilization}% avg util`. Chevron-forward on right. | Manual | `inventory.tsx:400-437` |
| TC-MOB-INV-044 | Admin | Tapping a status tile navigates to section level with status filter | P0 | 1. Tap "ACTIVE" status tile. | `drillDownCarton` called: crumb `{level:'status', label:'ACTIVE', filter:{status:'ACTIVE'}}` added. `nextCartonLevel` → `'section'`. `cartonPage` reset to 1. `cartonAccum` cleared. API: `GET /inventory/cartons/hierarchy?level=section&status=ACTIVE`. | Integration | `inventory.tsx:181-194` |

### Maestro flows for Section 22.10

```yaml
# mobile/.maestro/inventory/carton-status-level.yaml
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "Master Carton"
- waitForAnimationToEnd
- assertVisible: "ACTIVE"
- assertVisible: "carton(s)"
- assertVisible: "boxes"
```

---

## Section 22.11 — Master Carton: section level + article level

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-045 | Admin | Section tiles appear after drilling from status level | P0 | 1. Tap "Master Carton". 2. Tap "ACTIVE" status tile. 3. Observe tiles. | Section tiles from `GET /inventory/cartons/hierarchy?level=section&status=ACTIVE`. Each tile: section name, carton count, chips, footer. | Integration | `nextCartonLevel` after `'status'` → `'section'` |
| TC-MOB-INV-046 | Admin | Master Carton section tile footer shows childBoxCount and optional avgUtilization | P0 | 1. Drill to Master Carton section level. 2. Observe any section tile footer. | Footer: `{node.childBoxCount} boxes` on left. If `node.avgUtilization !== undefined`: `{node.avgUtilization}% avg util` on right. If undefined: only box count. | Manual | `inventory.tsx:429-433` — `{node.avgUtilization !== undefined && ...}` |
| TC-MOB-INV-047 | Admin | Tapping a section tile drills to article level | P0 | 1. Drill: status (ACTIVE) → section (e.g., "Hawaii"). | Crumb `{level:'section', label:'Hawaii', filter:{section:'Hawaii'}}` added. API: `GET /inventory/cartons/hierarchy?level=article_name&status=ACTIVE&section=Hawaii`. Article tiles appear. | Integration | `nextCartonLevel` after `'section'` → `'article_name'` |
| TC-MOB-INV-048 | Admin | Tapping an article tile drills to carton leaf level | P0 | 1. Drill: status → section → article. 2. Tap `MRP TEST CITY 02`. | Crumb `{level:'article_name', label:'MRP TEST CITY 02', filter:{article_name:'MRP TEST CITY 02'}}` added. `nextCartonLevel` → `'carton'`. `cartonPage` reset to 1. API: `GET /inventory/cartons/hierarchy?level=carton&status=ACTIVE&section=Hawaii&article_name=MRP+TEST+CITY+02&page=1`. Leaf carton cards appear. | Integration | `nextCartonLevel` after `'article_name'` → `'carton'` |
| TC-MOB-INV-049 | Admin | Master Carton breadcrumb at carton level shows 3 crumbs | P0 | 1. Drill all the way to carton level: status → section → article. 2. Observe breadcrumb row. | Breadcrumb: "All" → "ACTIVE" (tappable) → "Hawaii" (tappable) → "MRP TEST CITY 02" (active, non-tappable). Three `cartonCrumbs` entries. Chevron separators between each. | E2E | |

### Maestro flows for Section 22.11

```yaml
# mobile/.maestro/inventory/carton-section-article-level.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "Master Carton"
- waitForAnimationToEnd
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- assertVisible: "${SECTION}"
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- assertVisible: "MRP TEST CITY 02"
- assertVisible: "carton(s)"
```

---

## Section 22.12 — Master Carton: leaf carton card UI

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-050 | Admin | Leaf carton card header: monospace barcode on left, status pill on right | P0 | 1. Drill to carton leaf level. 2. Observe any leaf carton card header row. | Left: `node.carton_barcode` in `styles.cartonBarcode` (fontSize 14, fontWeight 700, `fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'`, `flex:1, marginRight:8, numberOfLines:1`). Right: status pill `<View style={[styles.statusPill, {backgroundColor: badge.bg}]}>` with text `{status}` in `{color: badge.text}`. | Manual | `inventory.tsx:463-471`; `styles.cartonBarcode` at line 579 |
| TC-MOB-INV-051 | Admin | Leaf carton card shows location line "primary_section / primary_article" | P0 | 1. Navigate to a leaf carton card with both `primary_section` and `primary_article` set. 2. Observe below header. | Location string `[node.primary_section, node.primary_article].filter(Boolean).join(' / ')` shown in `styles.cartonSubtitle` (fontSize 12, `COLORS.textSecondary`). E.g., "Hawaii / MRP TEST CITY 02". Hidden if both fields are falsy. | Manual | `inventory.tsx:451, 474-476` — `{!!location && ...}` |
| TC-MOB-INV-052 | Admin | Leaf carton card shows utilization bar with percentage and box count label | P0 | 1. Navigate to any leaf carton card. 2. Observe utilization section. | Bar track (height 6, borderRadius 3). Filled segment: `flex: pct`, color from `utilizationColor(pct)`. Empty segment: `flex: 100-pct`. To the right: `{pct}%` text in the same threshold color. Below bar: `{childCount}/{maxCap} boxes`. | Manual | `inventory.tsx:479-488` |
| TC-MOB-INV-053 | Admin | Leaf carton card shows only the date fields that are non-null | P0 | 1. Navigate to an ACTIVE carton (`closed_at = null`, `dispatched_at = null`). 2. Observe dates row. 3. Also check a CLOSED carton and a DISPATCHED carton. | ACTIVE: only "Created: <date>" visible. CLOSED: "Created: <date>" + "Closed: <date>". DISPATCHED: "Created: <date>" (+ "Closed: <date>" if non-null) + "Dispatched: <date>". Each date rendered conditionally: `{createdStr && <Text>Created: {createdStr}</Text>}` etc. | Manual | `inventory.tsx:492-494` |

### Maestro flows for Section 22.12

```yaml
# mobile/.maestro/inventory/carton-leaf-card.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "Master Carton"
- waitForAnimationToEnd
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- assertVisible: "ACTIVE"
- assertVisible: "boxes"
- assertVisible: "Created:"
```

---

## Section 22.13 — Master Carton: utilization bar color thresholds

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-054 | Admin | Utilization bar and text are emerald (#10B981) when pct < 60% | P0 | 1. Navigate to a leaf carton with utilization < 60% (e.g., 3 boxes in a 10-capacity carton = 30%). 2. Observe bar fill and percentage text color. | Both bar fill and percentage text: `#10B981` (emerald). `utilizationColor(30)` — `30 < 60` → `'#10B981'`. | Manual | `inventory.tsx:77-80`; requires a < 60% fixture carton |
| TC-MOB-INV-055 | Admin | Utilization bar and text are amber (#F59E0B) when 60% ≤ pct < 90% | P0 | 1. Navigate to a leaf carton with utilization 60-89% (e.g., 7 of 10 = 70%). 2. Observe bar fill and percentage text. | Both: `#F59E0B` (amber). `utilizationColor(70)` — `70 >= 60 && 70 < 90` → `'#F59E0B'`. | Manual | Requires 60-89% fixture |
| TC-MOB-INV-056 | Admin | Utilization bar and text are red (#EF4444) when pct ≥ 90% | P0 | 1. Navigate to a leaf carton with utilization ≥ 90% (e.g., 9 of 10 = 90%). 2. Observe bar fill and percentage text. | Both: `#EF4444` (red). `utilizationColor(90)` — `90 >= 90` → `'#EF4444'`. | Manual | `inventory.tsx:77`; the 3 ACTIVE fixture cartons may provide a full/near-full example |
| TC-MOB-INV-057 | Admin | Boundary: pct === 60 is amber; pct === 90 is red | P0 | 1. Navigate to a carton with exactly 60% utilization (6 of 10 boxes). Observe color. 2. Navigate to a carton with exactly 90% utilization (9 of 10 boxes). Observe color. | 60%: amber (`#F59E0B`) — `pct >= 60` true. 90%: red (`#EF4444`) — `pct >= 90` true. | Manual | `inventory.tsx:77-79` — strict `>=` boundaries |

---

## Section 22.14 — Master Carton: status pill colors per status

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-058 | Admin | CREATED status pill colors: bg #FEF3C7, text #92400E | P0 | 1. Navigate to a leaf carton card with `status = 'CREATED'`. 2. Observe status pill. | Pill bg: `#FEF3C7` (pale amber). Text: `#92400E` (dark amber/brown). Text content: "CREATED". | Manual | `inventory.tsx:70` — `STATUS_BADGE.CREATED` |
| TC-MOB-INV-059 | Admin | ACTIVE status pill colors: bg #D1FAE5, text #065F46 | P0 | 1. Navigate to leaf carton with `status = 'ACTIVE'`. | Pill bg: `#D1FAE5` (pale green). Text: `#065F46` (dark green). Text: "ACTIVE". | Manual | `inventory.tsx:72` — `STATUS_BADGE.ACTIVE` |
| TC-MOB-INV-060 | Admin | CLOSED status pill colors: bg #FED7AA, text #9A3412 | P0 | 1. Navigate to leaf carton with `status = 'CLOSED'`. | Pill bg: `#FED7AA` (pale orange). Text: `#9A3412` (dark orange). Text: "CLOSED". | Manual | `inventory.tsx:73` — `STATUS_BADGE.CLOSED` |
| TC-MOB-INV-061 | Admin | DISPATCHED status pill colors: bg #E5E7EB, text #374151 | P0 | 1. Navigate to leaf carton with `status = 'DISPATCHED'`. | Pill bg: `#E5E7EB` (light grey). Text: `#374151` (dark grey). Text: "DISPATCHED". | Manual | `inventory.tsx:74` — `STATUS_BADGE.DISPATCHED` |

---

## Section 22.15 — Master Carton: status-breakdown chips on non-leaf cards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-062 | Admin | Non-leaf card shows only chips for statuses where count > 0 | P0 | 1. Navigate to Master Carton status level. 2. Drill to section. 3. Observe a section tile's chip area. | Chips only for statuses with `count > 0`. E.g., if section has `activeCount = 5` and all others = 0, only "Active: 5" chip is visible. Zero-count statuses are filtered out. | Manual | `inventory.tsx:401-406` — `.filter((s) => s.count > 0)` |
| TC-MOB-INV-063 | Admin | Status chip format is "Created: N" / "Active: N" / "Closed: N" / "Dispatched: N" | P0 | 1. Navigate to a non-leaf tile with multiple statuses with count > 0. 2. Observe chip labels. | Each chip: `{s.label}: {s.count}` — sentence-case labels "Created", "Active", "Closed", "Dispatched". E.g., "Active: 3", "Created: 2". | Manual | `inventory.tsx:402-405` |
| TC-MOB-INV-064 | Admin | Status chips use STATUS_BADGE colors; chip row absent if all counts are 0 | P0 | 1. Observe chips on a non-leaf tile with mixed statuses. 2. Also navigate to a section with only 0-count statuses. | Chips: CREATED bg `#FEF3C7`, ACTIVE bg `#D1FAE5`, CLOSED bg `#FED7AA`, DISPATCHED bg `#E5E7EB`. When `statusBreakdown.length === 0`, chip `<View>` is not rendered. | Manual | `inventory.tsx:417` — `statusBreakdown.length > 0` guard |

---

## Section 22.16 — Master Carton: leaf-tap navigates to /master-cartons/id

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-065 | Admin | Tapping a leaf carton card routes to /master-cartons/<id> | P0 | 1. Drill to carton leaf level. 2. Tap any leaf carton card. | `drillDownCarton(node)` called. `cartonLevel === 'carton'` and `node.id` truthy → `router.push('/master-cartons/<node.id>')`. Navigation stack moves to Master Carton detail screen. Tab bar hidden on that Stack screen. | E2E | `inventory.tsx:182-184` — `if (node.id) router.push('/master-cartons/${node.id}')` |
| TC-MOB-INV-066 | Admin | Back from /master-cartons/id returns to inventory with breadcrumbs preserved | P0 | 1. Drill to carton leaf. 2. Tap a carton card. 3. Press device/stack back button. | Returns to Inventory tab. `cartonCrumbs` unchanged — drilling to leaf then navigating to detail does not push/pop crumbs. Carton list at same level visible. | E2E | Stack back pops the detail screen; Inventory tab state preserved |
| TC-MOB-INV-067 | Admin | Leaf carton card with null id does not navigate (guard present) | P1 | 1. Identify or simulate a carton node where `id` is undefined in the API response. 2. Tap that card. | No navigation. `if (node.id)` guard prevents `router.push` when `node.id` is falsy. App does not crash. | Manual | `inventory.tsx:183`; `[?]` backend should always return id at carton level — see Open Questions |

### Maestro flows for Section 22.16

```yaml
# mobile/.maestro/inventory/carton-leaf-tap-navigate.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "Master Carton"
- waitForAnimationToEnd
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
# Tap the first ACTIVE status pill visible (first leaf carton card)
# [?] If multiple ACTIVE pills, match by carton barcode instead
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- assertNotVisible: "Inventory"
- assertNotVisible: "Dashboard"
```

---

## Section 22.17 — Master Carton: load-more pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-068 | Admin | "Load more" button appears only at carton leaf level when totalPages > current page | P0 | 1. Drill to carton leaf level. 2. Ensure backend returns paginated results (`totalPages > 1`). 3. Observe bottom of list. | "Load more (<N> remaining)" button visible. Condition: `cartonLevel === 'carton' && cartonMeta && cartonPage < cartonMeta.totalPages`. Not visible at status, section, or article levels. | Manual | `inventory.tsx:376-382`; requires pagination fixture |
| TC-MOB-INV-069 | Admin | "Load more" button text shows correct remaining count | P0 | 1. At carton leaf with pagination (page 1 of 3, showing 10 of 25). 2. Observe button text. | Button text: "Load more (15 remaining)". Calculated: `cartonMeta.total - cartonNodes.length` = 25 - 10 = 15. | Manual | `inventory.tsx:379` |
| TC-MOB-INV-070 | Admin | Tapping "Load more" appends new cartons and increments page | P0 | 1. Drill to carton leaf with 2+ pages. 2. Tap "Load more". | `loadMoreCartons` → `cartonPage` increments to 2. API fires `GET /inventory/cartons/hierarchy?...&page=2`. `useEffect` on `cartonResult` appends new items: `setCartonAccum(prev => [...prev, ...cartonResult.data])`. New carton cards appear below existing ones. | Integration | `inventory.tsx:164-172, 208-212` |
| TC-MOB-INV-071 | Admin | "Load more" button disappears after final page is loaded | P0 | 1. At carton leaf with exactly 2 pages. 2. Tap "Load more" to load page 2. 3. Observe button. | Button disappears. `cartonPage === cartonMeta.totalPages` → `cartonPage < cartonMeta.totalPages` is false. Button not rendered. | Manual | `inventory.tsx:376` |

---

## Section 22.18 — Master Carton: drill + breadcrumb + back resets pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-072 | Admin | Drilling to a new carton leaf resets cartonPage to 1 and clears cartonAccum | P0 | 1. Drill to carton leaf (page 1). 2. Navigate back to article level. 3. Tap a different article tile. | `drillDownCarton` calls `setCartonPage(1)` and `setCartonAccum([])`. New API call uses `page=1`. Accumulator starts fresh — no cartons from previous article. | Manual | `inventory.tsx:192-193` |
| TC-MOB-INV-073 | Admin | Tapping Back on Master Carton resets cartonPage to 1 and clears cartonAccum | P0 | 1. Drill to carton leaf. Load page 2 via "Load more". 2. Tap "Back". 3. Re-drill to carton leaf. | `goBackCarton` calls `setCartonPage(1)` and `setCartonAccum([])`. Re-entry into leaf starts at page 1. No stale page-2 data carried over. | Manual | `inventory.tsx:196-200` |
| TC-MOB-INV-074 | Admin | Tapping "All" breadcrumb on Master Carton resets pagination | P0 | 1. Drill to carton leaf. Load page 2. 2. Tap "All" to return to root. 3. Drill back to carton leaf. | `goToCartonLevel(0)` calls `setCartonPage(1)` and `setCartonAccum([])`. Leaf re-entry loads page 1. | Manual | `inventory.tsx:202-206` |

---

## Section 22.19 — Tab-switch preserves each tab's breadcrumb stack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-075 | Admin | Switching from Child Box to Master Carton preserves Child Box breadcrumbs | P0 | 1. Drill Child Box 2 levels deep (section → article). 2. Tap "Master Carton" tab. 3. Tap "Child Box" tab. 4. Observe breadcrumbs. | Child Box breadcrumbs ("All > section > article") are unchanged after tab switch and return. `childBreadcrumbs` state is not cleared by `switchTab`. | E2E | `inventory.tsx:214-217` — `switchTab` only sets `activeTab` |
| TC-MOB-INV-076 | Admin | Switching from Master Carton to Child Box preserves Master Carton breadcrumbs | P0 | 1. Tap "Master Carton". Drill 1 level (status → section). 2. Tap "Child Box". 3. Tap "Master Carton". 4. Observe breadcrumbs. | Master Carton breadcrumb ("All > ACTIVE") unchanged. `cartonCrumbs` not cleared by tab switch. | E2E | |
| TC-MOB-INV-077 | Admin | Summary cards visible/hidden independently per tab based on respective breadcrumbs | P0 | 1. Drill 2 levels on Child Box (summary cards hidden). 2. Switch to Master Carton root (cartonCrumbs empty → summary cards visible). 3. Switch back to Child Box (still 2 crumbs → summary cards still hidden). | `activeBreadcrumbs = activeTab === 'child' ? childBreadcrumbs : cartonCrumbs`. Each tab independently controls summary card visibility. | Manual | `inventory.tsx:221, 236` |

### Maestro flows for Section 22.19

```yaml
# mobile/.maestro/inventory/tab-switch-preserves-breadcrumbs.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- assertVisible: "Back"
- tapOn: "Master Carton"
- waitForAnimationToEnd
- assertVisible: "Pairs in Stock"
- tapOn: "Child Box"
- waitForAnimationToEnd
- assertVisible: "Back"
- assertVisible: "All"
```

---

## Section 22.20 — Pull-to-refresh, loading states, and empty states

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-078 | Admin | Pull-to-refresh on Child Box tab calls childRefetch | P0 | 1. Navigate to Inventory → Child Box. 2. Pull down on the screen. | `onRefresh` fires: `setRefreshing(true)` → `await childRefetch()` → `setRefreshing(false)`. System refresh spinner appears (tintColor: `COLORS.primary`). Child Box data re-fetched. | E2E | `inventory.tsx:113-117`; `RefreshControl` at lines 227-233 |
| TC-MOB-INV-079 | Admin | Pull-to-refresh does NOT call a separate carton refetch | P0 | 1. Navigate to Inventory → Master Carton tab. 2. Pull down to refresh. | `onRefresh` only calls `childRefetch()`. Carton data auto-refreshes via React Query when filters change; no dedicated carton refetch in `onRefresh`. Spinner appears; no error. | Manual | `inventory.tsx:113-116` |
| TC-MOB-INV-080 | Admin | Child Box loading spinner renders while initial fetch is in-flight | P0 | 1. Navigate to Inventory → Child Box on a slow network. 2. Observe list area before data arrives. | `childLoading === true` → `<Spinner />` renders in the tile area. No tiles shown until data arrives. | Manual | `inventory.tsx:317` |
| TC-MOB-INV-081 | Admin | Master Carton loading spinner renders on first fetch when no accumulated data | P0 | 1. Navigate to Master Carton tab on slow network. 2. Observe list area. | `cartonLoading && cartonNodes.length === 0` → `<Spinner />`. Once data arrives, spinner replaced by tiles. | Manual | `inventory.tsx:365` |
| TC-MOB-INV-082 | Admin | Child Box empty state renders with correct icon, title, and message | P0 | 1. Drill into a section that has zero child boxes. | `EmptyState` renders: icon `"layers-outline"`, title `"No stock data"`, message `"Products will appear here once inventory is added"`. `childItems` array is empty and `!childLoading` is true. | Manual | `inventory.tsx:353-359`; requires empty-stock section fixture |
| TC-MOB-INV-083 | Admin | Master Carton empty state renders with correct icon, title, and message | P0 | 1. Drill to a section in Master Carton that has no cartons. | `EmptyState` renders: icon `"cube-outline"`, title `"No cartons found"`, message `"Master cartons will appear here once created"`. | Manual | `inventory.tsx:385-390`; requires no-carton section fixture |

### Maestro flows for Section 22.20

```yaml
# mobile/.maestro/inventory/pull-to-refresh.yaml
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- scroll:
    direction: DOWN
    duration: 1000
    startY: 0.2
    endY: 0.8
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Pairs in Stock"
```

---

## Section 22.21 — All 4 roles can access + drill (positive coverage per role)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-E2E-001 | Admin | Admin drills Child Box section → article → MRP → colour → product | P0 | 1. Clear state. Login as Admin. 2. Tap "Inventory". 3. Tap a section tile. 4. Tap `MRP TEST CITY 02`. 5. Tap "₹299". 6. Tap "BLUE". 7. Observe product tiles. | All drill levels succeed. Product tiles with FLOOR-pattern names visible. No chevron on product tiles. Breadcrumb shows full path. | E2E | Full positive drill path for Admin |
| TC-MOB-INV-E2E-002 | Supervisor | Supervisor accesses Inventory and both Child Box and Master Carton tabs | P0 | 1. Clear state. Login as Supervisor. 2. Tap "Inventory". 3. Observe Child Box section tiles. 4. Tap "Master Carton". 5. Observe status tiles. | Both tabs render with tiles. No access-denied message. Supervisor has same inventory access as Admin. | E2E | No role gate on inventory screen |
| TC-MOB-INV-E2E-003 | Warehouse Operator | Warehouse Operator drills Master Carton to leaf level | P0 | 1. Clear state. Login as Warehouse Operator. 2. Inventory → Master Carton → ACTIVE → section → article → carton leaf. 3. Observe leaf carton cards. | Leaf carton cards render with barcode, status pill, utilization bar, dates. No error state. | E2E | Full positive carton drill for Warehouse Operator |
| TC-MOB-INV-E2E-004 | Dispatch Operator | Dispatch Operator can tap leaf carton card to navigate to detail | P0 | 1. Clear state. Login as Dispatch Operator. 2. Drill to carton leaf level. 3. Tap a leaf carton card. | Router navigates to `/master-cartons/<id>`. Tab bar hidden on detail screen. Back returns to inventory with breadcrumbs preserved. No access-denied. | E2E | Confirms routing not role-gated |

### Maestro flows for Section 22.21

```yaml
# mobile/.maestro/inventory/all-roles-warehouse-carton-drill.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- assertVisible: "Child Box"
- assertVisible: "Master Carton"
- assertVisible: "Pairs in Stock"
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- assertVisible: "All"
- assertVisible: "Back"
- tapOn: "Master Carton"
- waitForAnimationToEnd
- assertVisible: "ACTIVE"
```

```yaml
# mobile/.maestro/inventory/dispatch-operator-carton-leaf.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
  SECTION: "Hawaii"
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
- tapOn: "Inventory"
- waitForAnimationToEnd
- tapOn: "Master Carton"
- waitForAnimationToEnd
- tapOn: "ACTIVE"
- waitForAnimationToEnd
- tapOn: "${SECTION}"
- waitForAnimationToEnd
- tapOn: "MRP TEST CITY 02"
- waitForAnimationToEnd
- assertVisible: "ACTIVE"
- assertVisible: "boxes"
```

---

## Section 22.22 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-INV-084 | Admin | Network failure on Child Box fetch shows empty state (no crash) | P0 | 1. Login as Admin. 2. Disable network. 3. Navigate to Inventory → Child Box. | React Query retries fail; `childLoading` resolves false; `childItems` empty. `EmptyState` with "No stock data" shown. No crash, no unhandled exception. | Manual | `[?]` No explicit error banner in `inventory.tsx`; confirm whether React Query error state surfaces a message |
| TC-MOB-INV-085 | Admin | Network failure on Master Carton fetch shows empty state | P0 | 1. Login as Admin. 2. Disable network. 3. Navigate to Inventory → Master Carton. | `cartonLoading` resolves; `cartonNodes.length === 0`; `EmptyState` with "No cartons found" shown. No crash. | Manual | Same empty-state fallback |
| TC-MOB-INV-086 | Admin | GET /inventory/stock/summary failure is handled gracefully (no crash) | P0 | 1. Block `GET /inventory/stock/summary` at network level. 2. Navigate to Inventory tab. | `summary` is undefined. The `{summary && activeBreadcrumbs.length === 0 && ...}` guard prevents render; summary cards simply absent. No crash. | Manual | `inventory.tsx:101-104, 236` — `summary &&` null guard |
| TC-MOB-INV-087 | Admin | Child Box tile with all-zero stock renders bar track only (no colored segments) | P1 | 1. Navigate to a section/article/colour with `free=0, packed=0, dispatched=0, total=0`. 2. Observe stock bar. | `item.total > 0` is false; `<>...</>` segment block not rendered inside `stockBar`. Bar track appears as `COLORS.borderLight` background (height 6, borderRadius 3). Labels: "Free: 0", "Packed: 0", "Disp: 0". | Manual | `inventory.tsx:337` — `item.total > 0` guard; requires zero-stock fixture |
| TC-MOB-INV-088 | Admin | Very long carton barcode is truncated with ellipsis (numberOfLines=1) | P1 | 1. Navigate to a leaf carton with a barcode longer than the available width. 2. Observe the barcode text. | Barcode renders with `numberOfLines={1}`; text clips with ellipsis if longer than `flex:1, marginRight:8` area. No overflow outside card. No crash. | Manual | `inventory.tsx:465` — `numberOfLines={1}` |
| TC-MOB-INV-089 | Admin | Rapid tab toggle does not crash or duplicate API calls | P1 | 1. Login as Admin. 2. Navigate to Inventory. 3. Tap "Child Box" and "Master Carton" alternately 10 times quickly. | No crash. No duplicate tile sets. React Query deduplicates concurrent requests with same key. Final state reflects last tab selected. | Manual | `enabled: activeTab === 'child'` / `enabled: activeTab === 'carton'` on respective queries prevents inactive-tab queries |
| TC-MOB-INV-090 | Admin | Very large cartonCount value renders correctly in subtitle | P1 | 1. Drill to a non-leaf tile that has `cartonCount = 9999`. 2. Observe subtitle. | Subtitle reads "9999 carton(s)" without layout break. `styles.cartonSubtitle` (fontSize 12) handles large numbers. | Manual | `inventory.tsx:415`; `[?]` large numbers lack locale formatting (no thousands separator) |

---

## Maestro flows index

All YAML files embedded in this phase, in logical execution order:

1. `mobile/.maestro/inventory/inventory-tab-access-admin.yaml` — Section 22.1
2. `mobile/.maestro/inventory/inventory-tab-access-all-roles.yaml` — Section 22.1
3. `mobile/.maestro/inventory/tab-toggle-switch.yaml` — Section 22.2
4. `mobile/.maestro/inventory/child-box-section-level.yaml` — Section 22.3
5. `mobile/.maestro/inventory/child-box-article-level-mrp-caption.yaml` — Section 22.4
6. `mobile/.maestro/inventory/child-box-mrp-level.yaml` — Section 22.5
7. `mobile/.maestro/inventory/child-box-colour-level.yaml` — Section 22.6
8. `mobile/.maestro/inventory/child-box-product-level.yaml` — Section 22.7
9. `mobile/.maestro/inventory/child-box-breadcrumb-back.yaml` — Section 22.8
10. `mobile/.maestro/inventory/child-box-breadcrumb-jump.yaml` — Section 22.8
11. `mobile/.maestro/inventory/child-box-mrp-skip.yaml` — Section 22.9
12. `mobile/.maestro/inventory/carton-status-level.yaml` — Section 22.10
13. `mobile/.maestro/inventory/carton-section-article-level.yaml` — Section 22.11
14. `mobile/.maestro/inventory/carton-leaf-card.yaml` — Section 22.12
15. `mobile/.maestro/inventory/carton-leaf-tap-navigate.yaml` — Section 22.16
16. `mobile/.maestro/inventory/tab-switch-preserves-breadcrumbs.yaml` — Section 22.19
17. `mobile/.maestro/inventory/pull-to-refresh.yaml` — Section 22.20
18. `mobile/.maestro/inventory/all-roles-warehouse-carton-drill.yaml` — Section 22.21
19. `mobile/.maestro/inventory/dispatch-operator-carton-leaf.yaml` — Section 22.21

---

## Open questions / `[?]` flags

| # | TC | Question |
|---|---|---|
| 1 | TC-MOB-INV-084 | No explicit error banner or `{isError && <Text>}` block exists in `inventory.tsx` for API fetch failures beyond empty-state fallback. Confirm whether a global error toast mechanism (from a wrapper component or React Query's `onError` callback) is in place, or whether the empty state is the sole feedback for network errors. |
| 2 | TC-MOB-INV-067 | Backend should always return an `id` on carton-level nodes. If `id` is ever absent, the `if (node.id)` guard silently prevents navigation with no user feedback. Confirm whether a fallback message ("Unable to open carton detail") should be shown when `node.id` is missing. |
| 3 | TC-MOB-INV-065 | The `carton-leaf-tap-navigate.yaml` Maestro flow matches the first element with text "ACTIVE" to tap into the carton detail. If multiple carton cards are visible (all showing "ACTIVE" in their pills), the flow may tap an unexpected element. For a deterministic flow, the fixture carton barcode should be asserted/matched instead. Requires a known fixture barcode value. |
| 4 | TC-MOB-INV-090 | Large `cartonCount` values render as raw integers without locale formatting (no thousands separator). May be a UX concern for readability at scale. Confirm with product team whether `toLocaleString()` should be applied in `CartonGroupCard`. |

---

*Authored 2026-05-02 by Sonnet under Opus dispatch (Session 2 of 13 in mobile coverage workstream).*
