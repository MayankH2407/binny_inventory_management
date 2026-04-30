# Phase 09 — Child Box Labels, List & Aging

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `CB` (API/Integration), `CB-E2E` (browser E2E)
**Phase dependencies:** Phase 07 (child box lifecycle), Phase 08 (bulk operations) must have run first so FREE and GENERATED boxes exist.
**Last updated:** 2026-04-30

---

## Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `PRODUCT_UUID_A` | Active product: article "Binny Slipper", code "BS-001", colour "Blue", size "6", MRP ₹299.00 |
| `CB_FREE_UUID` | A FREE child box from Phase 07 / 08 fixture |
| `CB_GEN_UUID` | A GENERATED child box from Phase 07 / 08 fixture |
| `CB_PACKED_UUID` | A PACKED child box |
| `CB_FREE_OLD_180` | A FREE child box with `created_at` = 180+ days ago (fixture: manually insert or backdate via SQL) |
| `CB_FREE_OLD_90` | A FREE child box with `created_at` = 90–179 days ago |
| `CB_FREE_NEW` | A FREE child box with `created_at` = 0–89 days ago |

---

## Section 1 — Label print layout (E2E)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-LABEL-001 | Admin | Generate page loads at correct URL with correct heading | P0 | 1. Login as Admin (`admin@binny.com` / `Admin@123`). 2. Navigate to `/child-boxes/generate`. | URL is `/child-boxes/generate`. Page heading "Generate Labels" is visible. Description "Bulk generate child box labels across multiple sizes" is visible. A "Back" button linking to `/child-boxes` is present. | E2E | Requires at least one active product. |
| TC-CB-E2E-LABEL-002 | Admin | Product search dropdown shows filtered results | P0 | 1. Navigate to `/child-boxes/generate` as Admin. 2. Click the search input inside the product dropdown (placeholder "Search and select a product..."). 3. Type "Binny". | Dropdown opens. Options list contains at least one entry matching "Binny Slipper (BS-001)". Options not matching the search term are hidden. Chevron icon rotates 180°. | E2E | |
| TC-CB-E2E-LABEL-003 | Admin | Selecting article reveals Colour picker section | P0 | 1. Navigate to `/child-boxes/generate`. 2. Click the product dropdown. 3. Select "Binny Slipper (BS-001)". | Dropdown closes. "Colour" section appears below the article field. At least one colour pill button (e.g. "Blue") is visible. Size table has NOT yet appeared. Product info card has NOT yet appeared. | E2E | |
| TC-CB-E2E-LABEL-004 | Admin | Selecting colour reveals size table and product info card | P0 | 1. Navigate to `/child-boxes/generate`. 2. Select article "Binny Slipper". 3. Click colour pill "Blue". | Size table appears with columns "Size", "MRP", "No. of Labels". At least one size row (e.g. size 6) is present with a number input defaulting to 0. Product info card appears showing: Article Code (BS-001), Colour (Blue), MRP (₹299.00). Colour pill "Blue" has active styling (navy background). | E2E | |
| TC-CB-E2E-LABEL-005 | Admin | Entering size quantities shows live summary | P0 | 1. Navigate to `/child-boxes/generate`. 2. Select article and colour. 3. Enter `3` in the Size 6 quantity input, `2` in Size 7. | "Summary" section appears below the size table. Text shows "Sizes selected: 6 (×3), 7 (×2)". "Total labels: 5" displayed in bold navy text. "Confirm & Generate" button becomes enabled. | E2E | |
| TC-CB-E2E-LABEL-006 | Admin | Total > 500 shows validation error and blocks submit | P1 | 1. Navigate to `/child-boxes/generate`. 2. Select article and colour. 3. Enter `300` in Size 6, `201` in Size 7. 4. Click "Confirm & Generate". | Error message "Total labels must not exceed 500" appears below the size table. No API call is fired to `POST /api/v1/child-boxes/bulk-multi-size`. | E2E | |
| TC-CB-E2E-LABEL-007 | Admin | Submitting zero sizes keeps button disabled | P1 | 1. Navigate to `/child-boxes/generate`. 2. Select article and colour. 3. Leave all size inputs at 0. | "Confirm & Generate" button remains disabled (grey/cursor-not-allowed). No `disabled` attribute removal visible. | E2E | |
| TC-CB-E2E-LABEL-008 | Admin | Successful generation shows success state with size badges | P0 | 1. Navigate to `/child-boxes/generate`. 2. Select article "Binny Slipper", colour "Blue". 3. Enter `2` in Size 6, `1` in Size 7. 4. Click "Confirm & Generate". 5. Wait for API response (HTTP 201). | Page transitions to success state. Green check circle icon visible. Text "3 Labels Generated". Size badge "Size 6 × 2" visible. Size badge "Size 7 × 1" visible. Preview grid shows up to 16 barcode cards each containing a QR icon, barcode text, and SKU+size label. Three action buttons visible: "Generate More", "Print Labels", "View All Child Boxes". | E2E | |
| TC-CB-E2E-LABEL-009 | Admin | More than 16 generated boxes shows overflow count | P2 | 1. Navigate to `/child-boxes/generate`. 2. Select article and colour. 3. Enter `20` for a single size. 4. Click "Confirm & Generate". | Preview grid shows exactly 16 barcode cards. An extra card appears showing "+4 more". Total = 20. | E2E | |
| TC-CB-E2E-LABEL-010 | Admin | Generate More button resets form | P1 | 1. Complete TC-CB-E2E-LABEL-008 to reach success state. 2. Click "Generate More". | Form resets to initial empty state. URL remains `/child-boxes/generate`. All fields are cleared (no article selected, no colour, no size quantities). | E2E | |
| TC-CB-E2E-LABEL-011 | Admin | View All Child Boxes button navigates to list | P1 | 1. Complete TC-CB-E2E-LABEL-008 to reach success state. 2. Click "View All Child Boxes". | Browser navigates to `/child-boxes`. Child boxes list page loads. | E2E | |
| TC-CB-E2E-LABEL-012 | Supervisor | Supervisor can access generate page and generate labels | P1 | 1. Login as Supervisor (`supervisor@binny.com` / `Sup@123`). 2. Navigate to `/child-boxes/generate`. 3. Select article, colour, enter `1` for one size. 4. Click "Confirm & Generate". | Page loads without 403/redirect. HTTP 201 from API. Success state shown. | E2E | |
| TC-CB-E2E-LABEL-013 | Warehouse Operator | Warehouse Operator can access generate page and generate labels | P1 | 1. Login as Warehouse Operator (`warehouse@binny.com` / `Wh@123`). 2. Navigate to `/child-boxes/generate`. 3. Select article, colour, enter `1` for one size. 4. Click "Confirm & Generate". | Page loads. HTTP 201. Success state shown. | E2E | |

---

## Section 2 — Print window content

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-LABEL-014 | Admin | Print Labels button opens new browser window | P0 | 1. Complete TC-CB-E2E-LABEL-008 (3 labels generated). 2. Click "Print Labels". | A new browser window/tab opens. The window document contains `<html>` with `<title>Print Labels</title>`. Browser print dialog fires (`window.print()` called). No JS errors in console. | E2E | Playwright: intercept `window.open`. |
| TC-CB-E2E-LABEL-015 | Admin | Print page CSS sets @page size to 50×50mm | P0 | 1. Complete TC-CB-E2E-LABEL-008. 2. Click "Print Labels". 3. Inspect the generated HTML source. | `<style>` block contains `@page { size: 50mm 50mm; margin: 0; }`. No other page-size declaration overrides it. | E2E | Check `printWindow.document.documentElement.innerHTML`. |
| TC-CB-E2E-LABEL-016 | Admin | Each label has correct page-break CSS | P1 | 1. Open the print HTML from TC-CB-E2E-LABEL-014. 2. Count `.label` divs. 3. Inspect CSS for `.label`. | Number of `.label` divs equals the number of generated boxes. CSS: `.label { width: 50mm; height: 50mm; page-break-after: always; }`. Last `.label` has `page-break-after: avoid`. | E2E | |
| TC-CB-E2E-LABEL-017 | Admin | Each label contains Article No cell | P0 | 1. Open the print HTML. 2. Inspect the first `.label` table cell with class `article-row`. | Cell text is "Article No: BS-001" (using actual article_code from the generated box). Font-weight bold, font-size 8pt per inline CSS. | E2E | |
| TC-CB-E2E-LABEL-018 | Admin | Each label contains Colour cell at 11pt bold | P0 | 1. Open the print HTML. 2. Inspect the cell with class `colour-row` in the first label. | Cell text is "Colour: Blue". CSS: `font-size: 11pt; font-weight: bold`. | E2E | |
| TC-CB-E2E-LABEL-019 | Admin | Each label MRP cell has 3-line stack: label/value/sub | P0 | 1. Open the print HTML. 2. Inspect the cell with class `mrp-row` in the first label. | Three child `<div>` elements present: (1) `.mrp-label` text "M.R.P." at 8pt bold; (2) `.mrp-value` text "₹ 299.00" at 11pt bold; (3) `.mrp-sub` text "(Inc of all taxes)" at 5pt. | E2E | `₹` rendered as `&#8377;`. |
| TC-CB-E2E-LABEL-020 | Admin | Each label size cell shows size at 34pt | P0 | 1. Open the print HTML. 2. Inspect the cell with class `size-cell` in the first label. | Cell contains: `.size-label` text "Size:" at 7pt; `.size-value` text matching the actual size (e.g. "6") at `font-size: 34pt; font-weight: bold`. | E2E | |
| TC-CB-E2E-LABEL-021 | Admin | Each label QR cell contains SVG at 13mm×13mm | P0 | 1. Open the print HTML. 2. Inspect the cell with class `qr-cell` in the first label. | Cell contains an `<svg>` element. CSS sets `width: 13mm; height: 13mm` on the svg. The SVG is a valid QR code rendering (non-empty path data). | E2E | QR generated via `QRCodeSVG` with `level='M'` and `size=128`. |
| TC-CB-E2E-LABEL-022 | Admin | QR value encodes the child box barcode | P1 | 1. Generate 1 label for a known box. 2. Open the print HTML. 3. Read the `value` attribute used in the QRCodeSVG call (or compare against `renderToStaticMarkup` output for the barcode). | The SVG encodes the barcode string `BINNY-CB-<uuid>` of the generated child box. Scanning the printed QR with a standard QR reader returns that barcode exactly. | Manual | QR level 'M' provides ~15% error correction. |
| TC-CB-E2E-LABEL-023 | Admin | Each label Packed-on cell shows today's date | P0 | 1. Open the print HTML on a known date (e.g. 2026-04-30). 2. Inspect the first `small-row` cell. | Cell text is "Packed on: 30 Apr 2026" (format `dd MMM yyyy` as per `toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})`). | E2E | |
| TC-CB-E2E-LABEL-024 | Admin | Each label Content cell shows pairs calculation | P0 | 1. Open the print HTML for a box with `quantity = 1`. 2. Inspect the second `small-row` cell. | Cell text is "Content: 2N (1 Pair)". For `quantity = 2` it would be "4N (2 Pair)". Formula: `quantity*2 || 2N (quantity || 1 Pair)`. | E2E | |
| TC-CB-E2E-LABEL-025 | Admin | Each label footer shows manufacturer details | P0 | 1. Open the print HTML. 2. Inspect the cell with class `footer-row` in the first label. | Cell contains three lines: "Mfg & Mktd by: Mahavir Polymers Pvt Ltd", "FE 16-17 MIA Jaipur - 302017 Raj (India)", "Customer Care: 0141 2751684". Font-size 5pt. | E2E | `&amp;` rendered correctly as `&`. |
| TC-CB-E2E-LABEL-026 | Admin | Multiple labels differ by size value | P1 | 1. Generate 2 labels: Size 6 × 1, Size 7 × 1. 2. Open print HTML. | Two `.label` divs present. First label `.size-value` = "6". Second label `.size-value` = "7". All other cells (article, colour, MRP, footer) are identical between the two. | E2E | |

---

## Section 3 — Child boxes list page: filters and pagination (E2E)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-LIST-001 | Admin | Child boxes list page loads with correct heading | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes`. | URL is `/child-boxes`. Heading "Child Boxes" visible. Description "Manage and track all child boxes in the system" visible. | E2E | |
| TC-CB-E2E-LIST-002 | Admin | Generate Labels button is visible | P0 | 1. Navigate to `/child-boxes` as Admin. | "Generate Labels" button (with Plus icon) is visible in the page header. Clicking it navigates to `/child-boxes/generate`. | E2E | |
| TC-CB-E2E-LIST-003 | Admin | Bulk Import button is visible to Admin and Supervisor | P1 | 1. Navigate to `/child-boxes` as Admin. | "Bulk Import" button (Upload icon) is visible in the page header. | E2E | `isManager` check: Admin + Supervisor only. |
| TC-CB-E2E-LIST-004 | Warehouse Operator | Bulk Import button is hidden from Warehouse Operator | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/child-boxes`. | "Bulk Import" button is NOT visible. "Generate Labels" button IS visible. | E2E | |
| TC-CB-E2E-LIST-005 | Admin | Aging legend is shown above filters | P0 | 1. Navigate to `/child-boxes` as Admin. | Text "FREE box aging (Generated boxes excluded):" is visible above the filter row. Yellow swatch with label "90–179 days" is present. Red swatch with label "180+ days" is present. | E2E | Legend is a `px-4 pt-3 pb-0` div above the filter `p-4` div. |
| TC-CB-E2E-LIST-006 | Admin | Status filter dropdown contains all 5 options | P0 | 1. Navigate to `/child-boxes` as Admin. 2. Click the status filter dropdown. | Dropdown contains: "All Statuses", "Generated", "Free", "Packed", "Dispatched". Options map to values: `''`, `GENERATED`, `FREE`, `PACKED`, `DISPATCHED`. | E2E | |
| TC-CB-E2E-LIST-007 | Admin | Status filter 'Generated' shows only GENERATED boxes | P0 | 1. Navigate to `/child-boxes`. 2. Select "Generated" in the status filter. 3. Wait for list to refresh. | All visible rows have `StatusBadge` showing "GENERATED". No FREE/PACKED/DISPATCHED rows visible. API call is `GET /api/v1/child-boxes?status=GENERATED&page=1`. | E2E | Requires GENERATED boxes to exist from Phase 07/08. |
| TC-CB-E2E-LIST-008 | Admin | Status filter 'Free' shows only FREE boxes | P1 | 1. Select "Free" in status filter. | All rows show status "FREE". | E2E | |
| TC-CB-E2E-LIST-009 | Admin | Product filter narrows results to that product | P1 | 1. Navigate to `/child-boxes`. 2. Select "Binny Slipper (BS-001)" in the product filter dropdown. | List refreshes. All visible rows belong to article "Binny Slipper". API call includes `product_id=<PRODUCT_UUID_A>`. | E2E | |
| TC-CB-E2E-LIST-010 | Admin | Search by barcode prefix filters results | P1 | 1. Navigate to `/child-boxes`. 2. Type "BINNY-CB-" in the search input. 3. Wait for debounce. | List shows only rows whose barcode contains "BINNY-CB-". Page resets to 1. API call includes `search=BINNY-CB-`. | E2E | |
| TC-CB-E2E-LIST-011 | Admin | Desktop table shows correct column headers | P1 | 1. Navigate to `/child-boxes` on a desktop viewport (≥768px). | Table headers visible: Barcode, Product, SKU, Colour, Size, MRP, Status, Created. | E2E | |
| TC-CB-E2E-LIST-012 | Admin | Mobile card view renders on narrow viewport | P1 | 1. Set viewport to 375×812 (iPhone). 2. Navigate to `/child-boxes`. | Mobile card view (`block md:hidden`) is shown. Desktop table is hidden. Each card shows: barcode (font-mono), article_name, sku, colour, size, mrp, StatusBadge. | E2E | |
| TC-CB-E2E-LIST-013 | Admin | Pagination controls appear when totalPages > 1 | P1 | 1. Navigate to `/child-boxes`. Pre-condition: more than 25 child boxes exist. | Pagination controls visible at the bottom of the card. Page 1 of N shown. "Previous" button disabled on page 1. "Next" button enabled. | E2E | |
| TC-CB-E2E-LIST-014 | Admin | Next page button increments page and reloads | P1 | 1. On the list page with totalPages > 1, click "Next". | Page number increments by 1. API call is `GET /api/v1/child-boxes?page=2`. Table updates with new rows. | E2E | |

---

## Section 4 — Aging tint (E2E)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E2E-AGING-001 | Admin | FREE box ≥ 180 days old shows red background on desktop | P0 | 1. Pre-condition: `CB_FREE_OLD_180` exists with `status=FREE`, `created_at` = 180+ days ago. 2. Navigate to `/child-boxes`. 3. Filter by status "Free". 4. Locate row for `CB_FREE_OLD_180`. | Row has CSS class `bg-red-50 hover:bg-red-100`. | E2E | `getAgingState` returns `'red'` when `ageDays >= 180 && status === 'FREE'`. |
| TC-CB-E2E-AGING-002 | Admin | FREE box ≥ 180 days shows red age-pill badge | P0 | 1. Locate `CB_FREE_OLD_180` row from TC-CB-E2E-AGING-001. 2. Inspect the Status column. | An age-pill badge is rendered alongside the StatusBadge. Badge has classes `bg-red-100 text-red-800`. Badge text is the age in days (e.g. "183d"). | E2E | |
| TC-CB-E2E-AGING-003 | Admin | FREE box 90–179 days old shows yellow background | P0 | 1. Pre-condition: `CB_FREE_OLD_90` exists with `status=FREE`, `created_at` = 90–179 days ago. 2. Navigate to `/child-boxes`, filter FREE. 3. Locate the row. | Row has CSS class `bg-yellow-50 hover:bg-yellow-100`. | E2E | |
| TC-CB-E2E-AGING-004 | Admin | FREE box 90–179 days shows yellow age-pill badge | P0 | 1. Locate `CB_FREE_OLD_90` row. | Age-pill badge has classes `bg-yellow-100 text-yellow-800`. Badge text is age in days. | E2E | |
| TC-CB-E2E-AGING-005 | Admin | FREE box < 90 days shows no aging tint or pill | P0 | 1. Pre-condition: `CB_FREE_NEW` exists with `status=FREE`, `created_at` < 90 days ago. 2. Locate the row in the list. | Row has no `bg-red-*` or `bg-yellow-*` class. No age-pill badge is rendered next to the StatusBadge. | E2E | `getAgingState` returns `null`. |
| TC-CB-E2E-AGING-006 | Admin | GENERATED box is never tinted regardless of age | P0 | 1. Pre-condition: A GENERATED box with `created_at` > 180 days ago exists (or simulate with SQL). 2. Navigate to `/child-boxes`. 3. Filter by status "Generated". 4. Locate the row. | Row has no `bg-red-*` or `bg-yellow-*` class. No age-pill. `getAgingState` returns `null` for non-FREE status. | E2E | Code guard: `if (status !== 'FREE') return null`. |
| TC-CB-E2E-AGING-007 | Admin | PACKED box is never tinted | P0 | 1. Locate a PACKED box in the list. | Row has no aging tint classes. No age-pill. | E2E | |
| TC-CB-E2E-AGING-008 | Admin | Aging tint applies on mobile card view as well | P1 | 1. Set viewport to 375×812. 2. Navigate to `/child-boxes`, filter FREE. 3. Locate `CB_FREE_OLD_180`. | Mobile card `<div>` has class `bg-red-50 hover:bg-red-100`. Age-pill badge `bg-red-100 text-red-800` is visible in the card. | E2E | Mobile cards use same `getAgingState` call. |
| TC-CB-E2E-AGING-009 | Admin | Boundary: box at exactly 180 days is red | P1 | 1. Pre-condition: A FREE box with `created_at` = exactly 180 days ago (floor truncation). | `getAgeDays` returns 180. `getAgingState` returns `'red'`. Row is red-tinted. | Manual | `ageDays >= 180` is inclusive. |
| TC-CB-E2E-AGING-010 | Admin | Boundary: box at exactly 90 days is yellow | P1 | 1. Pre-condition: A FREE box with `created_at` = exactly 90 days ago. | `getAgeDays` returns 90. `getAgingState` returns `'yellow'`. Row is yellow-tinted. | Manual | `ageDays >= 90` is inclusive. |
| TC-CB-E2E-AGING-011 | Admin | Boundary: box at 89 days shows no tint | P1 | 1. Pre-condition: A FREE box with `created_at` = 89 days ago. | `getAgeDays` returns 89. `getAgingState` returns `null`. No tint. | Manual | |

---

## Section 5 — API: GET /child-boxes list with GENERATED filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-API-LIST-001 | Admin | GET /child-boxes returns paginated list with GENERATED status items | P0 | 1. Login as Admin, obtain JWT. 2. `GET /api/v1/child-boxes?status=GENERATED`. | HTTP 200. Response: `{ success: true, data: [...], total: <n>, page: 1, limit: 25, totalPages: <n> }`. All items in `data` have `status = "GENERATED"`. | API | Requires GENERATED boxes from Phase 07/08. |
| TC-CB-API-LIST-002 | Admin | GET /child-boxes status filter for FREE excludes GENERATED | P0 | 1. `GET /api/v1/child-boxes?status=FREE`. | HTTP 200. All items in `data` have `status = "FREE"`. No GENERATED items present. | API | |
| TC-CB-API-LIST-003 | Any | GET /child-boxes?search=<barcode> returns single matching item | P1 | 1. Obtain a known barcode `CB_BAR_KNOWN`. 2. `GET /api/v1/child-boxes?search=CB_BAR_KNOWN`. | HTTP 200. `data` array contains exactly the one matching box. `total = 1`. | API | |
| TC-CB-API-LIST-004 | Any | GET /child-boxes with no auth returns 401 | P0 | 1. `GET /api/v1/child-boxes` with no Authorization header and no cookie. | HTTP 401. Response contains `{ "error": ... }`. | API | |
| TC-CB-API-LIST-005 | Any | GET /child-boxes with invalid status enum returns 400 | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=BOGUS`. | HTTP 400. Validation error referencing invalid status value. | API | Zod enum validation on query. |
