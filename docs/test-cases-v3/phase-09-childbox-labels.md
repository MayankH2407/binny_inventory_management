# Phase 09 — Child Box Labels: Generate Page, Print Layout, RBAC & Cap

**Suite:** Binny Inventory Management System — Test Cases v3
**Module code:** `TC-LBL`
**Phase dependencies:** Phases 07–08 (child-box lifecycle + bulk) must have run first so FREE and GENERATED boxes exist. At least one active product with multiple sizes and colours must exist.
**Last updated / refreshed:** 2026-06-10 (label fixes: responsive auto-fit `fitText`, custom Kids-first size sort, generate-page per-size dedup)
**Source ground truth:** `frontend/src/lib/childBoxLabel.ts`, `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx`, `frontend/src/lib/sizeSort.ts`
**Automation note:** No dedicated label-print Playwright spec exists (see AUTOMATION GAP markers). The closest existing specs are `frontend/e2e/03-child-boxes.spec.ts` (TC-MSQR-\*) and `frontend/e2e/19-childbox-rbac.spec.ts` (TC-CB-E2E-001/002). A new `frontend/e2e/43-label-rendering.spec.ts` is being authored in parallel.

---

## Table of Contents

1. [Section 1 — Generate page: access control (RBAC + Unauthenticated)](#section-1--generate-page-access-control-rbac--unauthenticated)
2. [Section 2 — Generate page: form flow (article → colour → sizes → generate)](#section-2--generate-page-form-flow-article--colour--sizes--generate)
3. [Section 3 — Generate page: env-gated label cap (NEXT_PUBLIC_CHILD_BOX_MAX)](#section-3--generate-page-env-gated-label-cap-next_public_child_box_max)
4. [Section 4 — Success state: preview grid, action buttons](#section-4--success-state-preview-grid-action-buttons)
5. [Section 5 — Print window: page layout (2-up 100mm roll, rows, placeholders)](#section-5--print-window-page-layout-2-up-100mm-roll-rows-placeholders)
6. [Section 6 — Print window: individual label structure and CSS dimensions](#section-6--print-window-individual-label-structure-and-css-dimensions)
7. [Section 7 — Print window: K-size font scaling](#section-7--print-window-k-size-font-scaling)
8. [Section 8 — Print window: QR code (client-side, short barcode format)](#section-8--print-window-qr-code-client-side-short-barcode-format)
9. [Section 9 — Print window: content fields (packed-on date, content line, footer)](#section-9--print-window-content-fields-packed-on-date-content-line-footer)
10. [Section 10 — Print window: popup blocked / error handling](#section-10--print-window-popup-blocked--error-handling)
11. [Section 11 — Print window: responsive auto-fit (fitText)](#section-11--print-window-responsive-auto-fit-fittext)
12. [Section 12 — Generate page: per-size list deduplication and sort order](#section-12--generate-page-per-size-list-deduplication-and-sort-order)

---

## Shared Test Data

| Symbol | Meaning |
|---|---|
| `PRODUCT_UUID_A` | Active product: article "Binny Slipper", article_code "BS-001", colour "Blue", sizes 6/7/8/9/10, MRP ₹299.00 |
| `PRODUCT_SHORT_SIZE` | A product variant with size "6" (1 char) |
| `PRODUCT_2CHAR_SIZE` | A product variant with size "10" (2 chars) |
| `PRODUCT_3CHAR_SIZE` | A product variant with size "10K" (3 chars, Kids suffix) |
| `PRODUCT_4CHAR_SIZE` | A product variant with size "11KS" (4 chars) |
| `ENV_DEFAULT_CAP` | `NEXT_PUBLIC_CHILD_BOX_MAX` not set → effective cap = 500 |
| `ENV_LIVE_CAP` | `NEXT_PUBLIC_CHILD_BOX_MAX=1500` → effective cap = 1500 |

---

## Section 1 — Generate page: access control (RBAC + Unauthenticated)

> **Permission required:** `child_boxes:create`
> Matrix: Admin ✓, Supervisor ✓, Warehouse Operator ✓, Dispatch Operator ✗
> Guard: frontend `useCan('child_boxes:create')` — if false, `router.replace(ROUTES.INVENTORY)` (no 403 page; silent redirect). Unauthenticated users are redirected to `/login` by the auth middleware before the component renders.
> Label print is web-only; no API endpoint exists for label generation itself.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-001 | Admin | Generate page loads for Admin | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes/generate`. | Page renders. Heading "Generate Labels" visible. Description "Bulk generate child box labels across multiple sizes" visible. No redirect. | E2E | Spec: `43-childbox-labels.spec.ts`. **AUTOMATION GAP** — no current spec covers this with a per-role check. |
| TC-LBL-002 | Supervisor | Generate page loads for Supervisor | P1 | 1. Login as Supervisor. 2. Navigate to `/child-boxes/generate`. | Page renders. Heading "Generate Labels" visible. No redirect to `/inventory`. | E2E | |
| TC-LBL-003 | Warehouse Operator | Generate page loads for Warehouse Operator | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/child-boxes/generate`. | Page renders. "Generate Labels" heading visible. No redirect. | E2E | |
| TC-LBL-004 | Dispatch Operator | Generate page redirects Dispatch Operator to /inventory | P0 | 1. Login as Dispatch Operator (no `child_boxes:create` permission). 2. Navigate directly to `/child-boxes/generate`. | Page does NOT render the generate form. Browser navigates to `/inventory` (via `router.replace`). No 403 error page shown — silent redirect. | E2E | Guard: `if (!canCreate) { router.replace(ROUTES.INVENTORY); return null; }` |
| TC-LBL-005 | Unauthenticated | Unauthenticated request redirects to /login | P0 | 1. Open a fresh browser (no session). 2. Navigate directly to `/child-boxes/generate`. | Browser redirects to `/login`. Generate form not rendered. | E2E | Standard Next.js auth middleware redirect. |

---

## Section 2 — Generate page: form flow (article → colour → sizes → generate)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-010 | Admin | Page shows searchable product dropdown on load | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes/generate`. 3. Wait for products API response (`GET /api/v1/products?limit=200&is_active=true`). | Input with placeholder "Search and select a product..." is visible. A `Search` icon (magnifying glass) is visible to the left. A `ChevronDown` icon is to the right. Colour section has NOT yet appeared. Size table has NOT yet appeared. | E2E | Products fetched at page load (`useApiQuery(['products-for-generate'])`). |
| TC-LBL-011 | Admin | Clicking the dropdown opens the options list | P0 | 1. Navigate to `/child-boxes/generate`. 2. Click anywhere inside the product dropdown container. | Dropdown list opens. Options are visible. `ChevronDown` icon rotates 180°. | E2E | `setDropdownOpen(true)` on click. |
| TC-LBL-012 | Admin | Typing filters article options case-insensitively | P1 | 1. Open dropdown. 2. Type "binny" (lowercase). | Options list filters to show only entries whose label or article_name contains "binny" (case-insensitive). Options not matching are removed from the list. | E2E | Filter: `o.label.toLowerCase().includes(term)`. |
| TC-LBL-013 | Admin | No-match search shows "No products found" | P1 | 1. Open dropdown. 2. Type "ZZZNOMATCH". | Options list is empty. Text "No products found" is shown inside the dropdown. | E2E | |
| TC-LBL-014 | Admin | Clicking outside the dropdown closes it | P1 | 1. Open the dropdown. 2. Click anywhere outside the dropdown container. | Dropdown list disappears. `ChevronDown` icon returns to normal (not rotated). | E2E | `mousedown` listener on `document`. |
| TC-LBL-015 | Admin | Selecting an article reveals the Colour section | P0 | 1. Open dropdown. 2. Select an article (e.g. "Binny Slipper (BS-001)"). | Dropdown closes. "Colour" section label appears. At least one colour pill button appears. Size table has NOT yet appeared. Product info card has NOT yet appeared. | E2E | Triggers `productService.getColours(productId)`. Colour section gated by `!!productId`. |
| TC-LBL-016 | Admin | Selecting a colour triggers size load and shows product info card | P0 | 1. Select article. 2. Click a colour pill (e.g. "Blue"). | (a) Size table appears with columns "Size", "MRP", "No. of Labels". Each size row has a number input defaulting to 0. (b) Product info card appears showing: article_name, Article Code, Colour, MRP. (c) Selected colour pill has navy/active styling (`bg-binny-navy text-white border-binny-navy`). | E2E | Triggers `productService.getSizes(effectiveProductId)`. Size table gated by `effectiveProductId && colourProductId`. |
| TC-LBL-017 | Admin | Size rows are sorted numerically | P1 | 1. Select an article and colour that have sizes 6, 8, 10, 7, 9. | Size rows appear in ascending numeric order: 6, 7, 8, 9, 10. Non-numeric sizes fall back to locale sort. | E2E | `sortedSizes` sorts by `parseFloat(size)`. |
| TC-LBL-018 | Admin | Entering size quantities shows live Summary section | P0 | 1. Select article and colour. 2. Enter `3` in size 6 input, `2` in size 7 input. | "Summary" section appears. Text "Sizes selected: 6 (×3), 7 (×2)". Text "Total labels: 5" in bold navy. "Confirm & Generate" button becomes enabled (no longer disabled). | E2E | Summary gated by `sizeSummary.total > 0`. |
| TC-LBL-019 | Admin | Submit button is disabled when no sizes entered | P0 | 1. Select article and colour. 2. Leave all size inputs at 0. | "Confirm & Generate" button has `disabled` attribute or `disabled={true}`. Button is not clickable. | E2E | `disabled={sizeSummary.total === 0 \|\| !effectiveProductId}` |
| TC-LBL-020 | Admin | Submit button is disabled when no article selected | P0 | 1. Navigate to generate page. Do NOT select an article. | "Confirm & Generate" button has `disabled`. | E2E | |
| TC-LBL-021 | Admin | Changing article resets colour and size selections | P1 | 1. Select article A, colour Blue. Enter `3` for size 6. 2. Open dropdown and select a different article B. | Colour selection cleared. Size quantities reset to 0. Size table disappears until new colour is selected. Summary section disappears. | E2E | `handleArticleChange` sets `colourProductId=''` and `sizeQuantities={}`. |
| TC-LBL-022 | Admin | Changing colour resets size quantities | P1 | 1. Select article A, colour Blue. Enter `3` for size 6. 2. Click a different colour pill. | Size quantities reset to 0. Summary section disappears. Size table reloads for the new colour. | E2E | `handleColourChange` sets `sizeQuantities={}`. |
| TC-LBL-023 | Admin | Quantity per Box field defaults to 1 and accepts positive integers | P1 | 1. Navigate to generate page. Observe "Quantity per Box (Pairs)" input. | Default value is 1. Entering 2 sets quantity to 2. Entering 0 or blank clears to 0 (parsed as 0 via `parseInt(value) \|\| 0`). | E2E | `quantity` state, default 1. Used in Content line calculation. |
| TC-LBL-024 | Supervisor | Supervisor completes full flow and generates labels | P1 | 1. Login as Supervisor. 2. Navigate to `/child-boxes/generate`. 3. Select article, colour. 4. Enter `1` for one size. 5. Click "Confirm & Generate". 6. Wait for API 201. | Success state renders. "1 Labels Generated" (or N Labels Generated). Preview card shows QR icon, barcode, SKU/size. | E2E | |
| TC-LBL-025 | Warehouse Operator | Warehouse Operator completes full flow and generates labels | P1 | 1. Login as Warehouse Operator. 2. Full generate flow. 3. Click "Confirm & Generate". | HTTP 201. Success state rendered correctly. | E2E | |

---

## Section 3 — Generate page: env-gated label cap (NEXT_PUBLIC_CHILD_BOX_MAX)

> **Frontend cap:** `const MAX_LABELS = Number(process.env.NEXT_PUBLIC_CHILD_BOX_MAX) || 500`
> Default (env var unset) = 500. Live build sets `NEXT_PUBLIC_CHILD_BOX_MAX=1500`.
> The cap enforces two things: (1) a validation error when `sizeSummary.total > MAX_LABELS` on submit, and (2) each individual size input has `max={MAX_LABELS}` as an HTML attribute.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-030 | Admin | Default cap of 500: total 501 shows validation error, blocks API call | P0 | 1. Frontend built with no `NEXT_PUBLIC_CHILD_BOX_MAX` (default 500). 2. Navigate to `/child-boxes/generate`. 3. Select article and colour. 4. Enter quantities summing to 501 (e.g. 300 + 201). 5. Click "Confirm & Generate". | Inline error `"Total labels must not exceed 500"` appears below the size table. No `POST /api/v1/child-boxes/bulk-multi-size` API call is fired. Form stays on input state (no success state). | E2E | Validation in `validate()`: `if (sizeSummary.total > MAX_LABELS) newErrors.sizes = ...` |
| TC-LBL-031 | Admin | Default cap of 500: total exactly 500 passes validation | P0 | 1. Default cap. 2. Enter quantities summing to exactly 500. 3. Click "Confirm & Generate". | No validation error shown. API call fires (`POST /api/v1/child-boxes/bulk-multi-size`). On 201: success state shown. | Integration | Boundary: `total > MAX_LABELS` — 500 is allowed, 501 is not. |
| TC-LBL-032 | Admin | Per-size input has HTML max attribute equal to cap | P1 | 1. Navigate to generate page (default cap). 2. Select article and colour. 3. Inspect the number inputs in the size table via DOM. | Each `<input type="number">` in the size table has attribute `max="500"` (or the env cap value). This prevents browser-native spin-control from exceeding the cap per row. | E2E | `max={MAX_LABELS}` on each size input. **AUTOMATION GAP** — not currently asserted in any spec. |
| TC-LBL-033 | Admin | Validation error clears when user reduces quantity below cap | P1 | 1. Trigger TC-LBL-030 (501 shows error). 2. Reduce one size input so total is ≤ 500. 3. Re-click "Confirm & Generate". | Validation error message disappears. API call fires. | E2E | `handleSizeQuantityChange` calls `setErrors((prev) => ({ ...prev, sizes: '' }))` on any size change. |
| TC-LBL-034 | Admin | Live build cap 1500: total 1500 succeeds | P1 | 1. Frontend built with `NEXT_PUBLIC_CHILD_BOX_MAX=1500`. 2. Enter 1500 total. 3. Click "Confirm & Generate". | No frontend validation error. API call fires. Backend (must also have `CHILD_BOX_MAX_PER_GENERATION=1500` set) returns 201. Success state shown. | Integration | Both FE and BE env vars must match. Backend cap separate from FE cap. |
| TC-LBL-035 | Admin | Live build cap 1500: total 1501 shows error "must not exceed 1500" | P1 | 1. Frontend with `NEXT_PUBLIC_CHILD_BOX_MAX=1500`. 2. Enter 1501 total. 3. Attempt submit. | Error "Total labels must not exceed 1500" displayed. No API call. | E2E | |

---

## Section 4 — Success state: preview grid, action buttons

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-040 | Admin | Success state shows generated count and size badges | P0 | 1. Complete generation of 3 labels: size 6 × 2, size 7 × 1. 2. Wait for API 201. | (a) Success state rendered (form hidden). (b) Green circle with `Check` icon (Lucide). (c) Text "{N} Labels Generated" (bold). (d) Subtitle shows `{article_name} \| {colour}`. (e) Size badge "Size 6 × 2" visible. (f) Size badge "Size 7 × 1" visible. | E2E | Size badges use `Object.entries(sizeGroups)`. |
| TC-LBL-041 | Admin | Preview grid shows first 16 barcode cards | P0 | 1. Generate exactly 16 labels (all same size). | Preview grid renders 16 cards. Each card shows: QrCode icon, barcode text (`font-mono`, truncated), SKU + "Size N" line. No "+X more" card. | E2E | `generatedBoxes.slice(0, 16)` |
| TC-LBL-042 | Admin | Preview grid shows "+X more" card when > 16 generated | P1 | 1. Generate 20 labels (any sizes). | Preview grid renders 16 barcode cards + 1 overflow card showing "+4 more". Total cards = 17. | E2E | `generatedBoxes.length > 16` check. |
| TC-LBL-043 | Admin | Barcode text in preview cards matches short format CB###### | P0 | 1. Generate any number of labels. 2. Inspect the barcode text (`font-mono`) in the preview cards. | Each barcode matches pattern `/^CB[0-9A-Z]{6}$/`. No UUID-style barcode (legacy format). | E2E | Barcode generated by `barcodeGenerator.ts` using `CB` prefix + 6 Base-32 chars. |
| TC-LBL-044 | Admin | "Generate More" button resets form completely | P1 | 1. Reach success state. 2. Click "Generate More". | Success state disappears. Form state returns. All fields blank: no article, no colour, size quantities all 0, quantity back to 1, search term cleared. URL stays at `/child-boxes/generate`. | E2E | `setGeneratedBoxes([])`, `setProductId('')`, etc. |
| TC-LBL-045 | Admin | "View All Child Boxes" button navigates to /child-boxes | P1 | 1. Reach success state. 2. Click "View All Child Boxes". | Browser navigates to `/child-boxes`. Child boxes list page loads. | E2E | `<Link href={ROUTES.CHILD_BOXES}>` |
| TC-LBL-046 | Admin | "Print Labels" button is present in success state | P0 | 1. Reach success state. 2. Inspect action buttons. | Three buttons visible: "Generate More" (secondary), "Print Labels" (outline, with Printer icon), "View All Child Boxes" (primary). | E2E | |

---

## Section 5 — Print window: page layout (2-up 100mm roll, rows, placeholders)

> **Key layout facts from `childBoxLabel.ts` (ground truth):**
> - `@page { size: 100mm 50mm; margin: 0; }` — the print page is 100mm wide × 50mm tall (one row per page)
> - Labels are paired into `.row` divs (2 per row); `.row` has `page-break-after: always` and `page-break-inside: avoid`
> - `.row:last-child { page-break-after: avoid; }` — no blank page at end
> - Each `.label` and `.label-empty` is `width: 48mm; height: 48mm; margin: 1mm; display: inline-block`
> - 1mm margin gives a 1mm outer gutter and a 2mm gap (1mm+1mm) between adjacent labels' borders
> - Odd-count: last row has one `.label` + one `<div class="label-empty"></div>` (visibility: hidden)
> - `font-size: 0` on `.row` eliminates inline-block whitespace gaps; `white-space: nowrap` keeps labels side by side

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-050 | Admin | Print window opens in new tab/window | P0 | 1. Reach success state (any number of labels). 2. Click "Print Labels". | A new browser window/tab opens (`window.open('', '_blank')`). The window contains `<html>`. A `<title>Print Labels</title>` is present. | E2E | **AUTOMATION GAP** — Playwright must intercept `page.on('popup', ...)` to capture the print window. No current spec does this. |
| TC-LBL-051 | Admin | @page CSS is 100mm × 50mm (not 50×50mm) | P0 | 1. Open print window HTML. 2. Inspect `<style>` block. | CSS contains `@page { size: 100mm 50mm; margin: 0; }`. The page is 100mm wide (two labels side-by-side) and 50mm tall (one row). | Manual | DISCREPANCY vs old doc (old claimed 50×50mm). Actual: 100×50mm. |
| TC-LBL-052 | Admin | Labels are paired into .row divs (2 per row) | P0 | 1. Generate 4 labels. Open print window. Inspect DOM. | Two `.row` divs present. First `.row` contains label index 0 and 1. Second `.row` contains label index 2 and 3. | E2E | `reduce` groups pairs: `if (i % 2 === 0) acc.push([label]); else acc[acc.length-1].push(label)`. |
| TC-LBL-053 | Admin | page-break-after: always is on .row (not on .label) | P0 | 1. Open print window HTML. 2. Inspect `.row` CSS. Inspect `.label` CSS. | `.row` has `page-break-after: always`. `.label` does NOT have `page-break-after`. | Manual | DISCREPANCY vs old doc (old claimed page-break on `.label`). |
| TC-LBL-054 | Admin | Last .row has page-break-after: avoid | P0 | 1. Open print window HTML. 2. Inspect the last `.row` element or the `.row:last-child` CSS rule. | CSS: `.row:last-child { page-break-after: avoid; }` — prevents a blank final page. | Manual | |
| TC-LBL-055 | Admin | .row also has page-break-inside: avoid | P1 | 1. Open print window HTML. 2. Inspect `.row` CSS. | `.row` CSS includes `page-break-inside: avoid;`. This prevents a row from being split across pages. | Manual | |
| TC-LBL-056 | Admin | Odd label count: last row has one label + one label-empty | P0 | 1. Generate exactly 3 labels. Open print window. | Two `.row` divs. Row 1: two `.label` divs. Row 2: one `.label` div + one `<div class="label-empty"></div>`. `.label-empty` has `visibility: hidden`. | E2E | `pair[1] ?? '<div class="label-empty"></div>'` |
| TC-LBL-057 | Admin | Single label: one .row, one .label, one .label-empty | P0 | 1. Generate exactly 1 label. Open print window. | One `.row` div. Inside: one `.label` + one `<div class="label-empty"></div>`. | E2E | |
| TC-LBL-058 | Admin | Even label count: no label-empty placeholder | P1 | 1. Generate exactly 2 labels. Open print window. | One `.row` div. Two `.label` divs. No `.label-empty`. | E2E | |
| TC-LBL-059 | Admin | .row dimensions: 100mm × 50mm with font-size:0 and white-space:nowrap | P1 | 1. Open print window HTML. 2. Inspect `.row` CSS. | `.row { width: 100mm; height: 50mm; font-size: 0; white-space: nowrap; }`. The `font-size: 0` collapses inline-block whitespace gaps. | Manual | Print-engine-safe layout vs flex (comment in source explains the choice). |

---

## Section 6 — Print window: individual label structure and CSS dimensions

> **Key label facts from `childBoxLabel.ts`:**
> - Each `.label` is `width: 48mm; height: 48mm; margin: 1mm; border: 1.5px solid #000; overflow: hidden`
> - Inner `table.main` is `width: 100%; height: 100%` with `table-layout: fixed`
> - Column widths: col 1 = 27mm, col 2 = 20mm
> - Row structure: (1) article-row spans 2 cols — `article_name`, 11pt bold; (2) colour-row col 1 — `colour`, 9pt bold; (3) size-cell col 2, rowspan 2 — size value with dynamic font; (4) mrp-row col 1 — 3-part stack; (5) small-row col 1 — packed-on date; (6) qr-cell col 2 rowspan 3 — QR SVG + barcode-text; (7) small-row col 1 — content line; (8) footer-row col 1 — manufacturer

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-060 | Admin | Each .label is 48mm × 48mm with 1mm margin and 1.5px border | P0 | 1. Open print window HTML. 2. Inspect `.label` CSS. | CSS: `.label { width: 48mm; height: 48mm; margin: 1mm; border: 1.5px solid #000; overflow: hidden; }`. Not 50mm×50mm. | Manual | DISCREPANCY vs old doc (old claimed 50mm×50mm). Actual: 48mm + 1mm margins. |
| TC-LBL-061 | Admin | .label-empty matches label dimensions (no border) | P1 | 1. Inspect `.label-empty` CSS. | `.label-empty { width: 48mm; height: 48mm; margin: 1mm; visibility: hidden; }`. No `border` property. | Manual | |
| TC-LBL-062 | Admin | article-row spans 2 columns and shows article_name (not article_code) | P0 | 1. Generate a label for article "Binny Slipper" (code BS-001). Open print window. Inspect first label. | `<td colspan="2" class="article-row">Binny Slipper</td>`. Text is `box.article_name` ("Binny Slipper"), NOT "Article No: BS-001". CSS: `font-weight: bold; font-size: 11pt; text-align: center`. | Manual | DISCREPANCY vs old doc (old TC-CB-E2E-LABEL-017 claimed "Article No: BS-001"). Actual: article_name only. |
| TC-LBL-063 | Admin | colour-row shows colour at 9pt bold (not 11pt) | P0 | 1. Inspect `.colour-row` in first label. | Cell text is the colour name (e.g. "Blue"). CSS: `font-size: 9pt; font-weight: bold; text-align: center`. | Manual | DISCREPANCY vs old doc (old claimed 11pt). Actual: 9pt. |
| TC-LBL-064 | Admin | mrp-row has 3-part stack: MRP label 7pt, value 12pt, sub 4pt | P0 | 1. Inspect `.mrp-row` in first label. | Three child divs: (1) `.mrp-label` text "M.R.P." at `font-size: 7pt; font-weight: bold`. (2) `.mrp-value` text "₹ {mrp.toFixed(2)}" at `font-size: 12pt; font-weight: 900`. (3) `.mrp-sub` text "(Inc of all taxes)" at `font-size: 4pt; color: #333`. | Manual | DISCREPANCY vs old doc: old claimed 8pt label/11pt value/5pt sub. Actual: 7pt/12pt/4pt. |
| TC-LBL-065 | Admin | MRP value uses ₹ symbol via &#8377; | P1 | 1. Inspect `.mrp-value` inner text. | Rendered text shows "₹ 299.00" (with space). Source HTML uses `&#8377;`. | Manual | `&#8377; ${Number(box.mrp).toFixed(2)}` |
| TC-LBL-066 | Admin | size-cell has .size-label at 7pt bold and .size-value with dynamic inline font | P0 | 1. Inspect `.size-cell` in a label with size "6". | (a) `.size-label` text "Size:" — CSS: `font-size: 7pt; font-weight: bold`. (b) `.size-value` text "6" — has inline style `font-size:38pt` (dynamic, set per box). (c) `.size-value` default CSS also sets `font-weight: bold; line-height: 0.95`. | Manual | CSS rule `.size-label { font-size: 7pt; font-weight: bold; }` — both are bold. |
| TC-LBL-067 | Admin | size-cell occupies col 2 with rowspan=2 | P1 | 1. Inspect table structure. | `<td class="size-cell" rowspan="2">` spans the colour row and the mrp row vertically (rows 2 and 3). | Manual | |
| TC-LBL-068 | Admin | qr-cell occupies col 2 with rowspan=3 | P1 | 1. Inspect table structure. | `<td rowspan="3" class="qr-cell">` is in the packed-on row and spans the packed-on / content / footer rows. | Manual | |
| TC-LBL-069 | Admin | QR SVG is 18mm × 18mm | P0 | 1. Inspect `.qr-cell svg` CSS. | `.qr-cell svg { width: 18mm; height: 18mm; display: block; margin: 0 auto; }` | Manual | DISCREPANCY vs old doc (old claimed 13mm×13mm). Actual: 18mm×18mm. |
| TC-LBL-070 | Admin | barcode-text is rendered below QR at 8pt bold | P0 | 1. Inspect `.qr-cell` content. | Below the `<svg>`, there is a `<div class="barcode-text">` containing the raw barcode string. CSS: `font-size: 8pt; font-weight: bold; text-align: center; margin-top: 0.5mm`. | Manual | Old doc did not cover barcode-text at all. |
| TC-LBL-071 | Admin | table.main uses fixed table-layout with 27mm + 20mm colgroup | P1 | 1. Inspect `table.main` and its colgroup. | `<table class="main">` has `table-layout: fixed`. `<colgroup>` has two `<col>` elements: first `width:27mm`, second `width:20mm`. | Manual | |
| TC-LBL-072 | Admin | Inner table cells have 0.5px solid black border | P1 | 1. Inspect `table.main td` CSS. | CSS: `table.main td { border: 0.5px solid #000; padding: 1mm 1.5mm; vertical-align: middle; overflow: hidden; }` | Manual | |

---

## Section 7 — Print window: K-size font scaling

> **Scaling rule (exact from source):**
> `const sizeFont = sizeStr.length <= 2 ? 38 : sizeStr.length === 3 ? 26 : 20;`
> - 1 char (e.g. "6") → 38pt (via `<= 2`)
> - 2 chars (e.g. "10") → 38pt (via `<= 2`)
> - 3 chars (e.g. "10K") → 26pt
> - 4+ chars (e.g. "11KS") → 20pt

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-080 | Admin | 1-char size "6" renders at 38pt | P0 | 1. Generate label for a product with size "6". Open print window. 2. Inspect `.size-value` inline style. | `.size-value` text is "6". Inline style: `font-size:38pt`. | E2E | `sizeStr.length = 1 <= 2 → 38pt`. |
| TC-LBL-081 | Admin | 2-char size "10" renders at 38pt | P0 | 1. Generate label for size "10". Open print window. 2. Inspect `.size-value` inline style. | `.size-value` text is "10". Inline style: `font-size:38pt`. | E2E | `sizeStr.length = 2 <= 2 → 38pt`. Boundary: exactly 2 chars still gets 38pt. |
| TC-LBL-082 | Admin | 3-char size "10K" renders at 26pt | P0 | 1. Generate label for size "10K". Open print window. 2. Inspect `.size-value` inline style. | `.size-value` text is "10K". Inline style: `font-size:26pt`. No overflow. | E2E | `sizeStr.length = 3 → 26pt`. |
| TC-LBL-083 | Admin | 4-char size "11KS" renders at 20pt | P0 | 1. Generate label for size "11KS". Open print window. 2. Inspect `.size-value` inline style. | `.size-value` text is "11KS". Inline style: `font-size:20pt`. No overflow. | E2E | `sizeStr.length = 4 >= 4 → 20pt` (via the `else` branch after `length === 3` check). |
| TC-LBL-084 | Admin | 5-char size "11KSM" renders at 20pt | P1 | 1. Generate label for size "11KSM" (5 chars). | Inline style: `font-size:20pt`. | E2E | Any length ≥ 4 → 20pt. |
| TC-LBL-085 | Admin | Mixed sizes in same batch each get correct font | P1 | 1. Generate labels: size 6 × 1, size 10K × 1, size 11KS × 1. Open print window. | Three labels: first `.size-value` at 38pt, second at 26pt, third at 20pt. Other label fields (article, colour, MRP, footer) are identical across all three. | E2E | Verifies per-box dynamic rendering. |
| TC-LBL-086 | Admin | Empty string size falls back to 38pt (length 0 <= 2) | P2 | 1. Create a child box where `size = ''` or `null` (DB edge case). 2. Print label. | `sizeStr = String(box.size ?? '') = ''`. Length = 0 <= 2 → `sizeFont = 38`. `.size-value` text is "" (empty string rendered). `font-size:38pt`. No crash. | Manual | `String(box.size ?? '')` prevents null/undefined crash. |

---

## Section 8 — Print window: QR code (client-side, short barcode format)

> QR is generated **client-side** via `QRCodeSVG` (from `qrcode.react`), server-rendered to static markup via `renderToStaticMarkup`. The QR value is `box.barcode` — the short format `CB######` (6 Base-32 chars). There is no API call for the QR; the SVG is embedded directly into the print HTML.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-090 | Admin | QR encodes the short-format barcode CB###### | P0 | 1. Generate 1 label. Note the barcode string (e.g. "CB3X7MNP"). 2. Open print window. 3. Decode the QR SVG or compare via `renderToStaticMarkup`. | The QR SVG encodes exactly "CB3X7MNP" (the `box.barcode` value). Scanning with a QR reader returns that exact string. | Manual | `QRCodeSVG` `value={box.barcode}`. NOT a UUID. NOT "BINNY-CB-<uuid>" (old format). |
| TC-LBL-091 | Admin | QR is generated client-side (no API call) | P0 | 1. Monitor network requests while clicking "Print Labels". | No network request is made to `/api/v1/child-boxes/qr` or any QR endpoint when printing. SVG is built from `box.barcode` already held in state. | E2E | `printChildBoxLabels(generatedBoxes)` uses boxes already in state from generate API response. |
| TC-LBL-092 | Admin | QR uses error correction level 'M' | P1 | 1. Inspect the `QRCodeSVG` call in `childBoxLabel.ts`. | `createElement(QRCodeSVG, { value: box.barcode, size: 128, level: 'M' })`. Level 'M' = ~15% error correction capacity. | Manual | Code-level verification. |
| TC-LBL-093 | Admin | QR SVG rendered inline (no img src, no network fetch) | P0 | 1. Open print window HTML. 2. Inspect `.qr-cell` content. | The `<svg>` element has inline path data. There is no `<img>` tag and no `src` attribute referencing a URL. | Manual | `renderToStaticMarkup` embeds the full SVG inline. |
| TC-LBL-094 | Admin | barcode-text below QR matches the same barcode as QR value | P0 | 1. Open print window for 1 label. Inspect `.barcode-text`. Inspect the QR value. | `.barcode-text` text and the QR value are the same string (e.g. "CB3X7MNP"). | Manual | `${qrSvg}<div class="barcode-text">${box.barcode}</div>` |
| TC-LBL-095 | Admin | Multiple labels each have unique QR values (unique barcodes) | P1 | 1. Generate 3 labels. Open print window. Inspect all 3 `.barcode-text` texts. | All 3 barcode strings are distinct. QR SVGs encode 3 different values. | E2E | Each box in the batch receives a unique barcode from `generateUniqueBarcodes`. |

---

## Section 9 — Print window: content fields (packed-on date, content line, footer)

> **Packed-on date:** uses `box.created_at` (the box's own creation date, not today's date), formatted with `en-IN` locale, `day: '2-digit', month: 'short', year: '2-digit'`, then `.toUpperCase()`. This produces e.g. "30 APR 26" not "30 Apr 2026".
> **Content line:** `Content: {(box.quantity || 1) * 2}N ({box.quantity || 1} Pair)`
> **Footer:** 3 lines, 5pt, Mahavir Polymers details.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-100 | Admin | Packed-on date shows box.created_at (not today's date) | P0 | 1. Generate a label for a box with a known `created_at` date (e.g. 2026-04-30). 2. Open print window. 3. Inspect `.small-row` (first one). | Cell text starts with "Packed on: ". Date shown is the box's own creation date "30 APR 26" (not today). | Manual | DISCREPANCY vs old doc (old claimed "today's date"). Actual: `box.created_at`. |
| TC-LBL-101 | Admin | Packed-on date format is "DD MMM YY" uppercase | P0 | 1. Inspect packed-on cell text for a box created 2026-04-30. | Text is "Packed on: 30 APR 26" (2-digit year, abbreviated month, UPPERCASE via `.toUpperCase()`). Not "30 Apr 2026" (4-digit year). | Manual | DISCREPANCY vs old doc (old claimed `year:'numeric'` → 4-digit year). Actual: `year: '2-digit'`. |
| TC-LBL-102 | Admin | Packed-on fallback: invalid created_at uses today's date | P1 | 1. Create a box with a corrupt/null `created_at`. 2. Print label. | `new Date(box.created_at)` results in `isNaN(d.getTime()) = true`. Fallback fires: today's date formatted same way. No crash. | Manual | `try/catch` with fallback in `childBoxLabel.ts` lines 13–24. |
| TC-LBL-103 | Admin | Content line: quantity=1 shows "2N (1 Pair)" | P0 | 1. Generate labels with quantity per box = 1. 2. Inspect second `.small-row`. | Text is "Content: 2N (1 Pair)". `(1 || 1) * 2 = 2`. `(1 || 1) = 1`. | E2E | |
| TC-LBL-104 | Admin | Content line: quantity=2 shows "4N (2 Pair)" | P1 | 1. Generate labels with quantity per box = 2. 2. Inspect second `.small-row`. | Text is "Content: 4N (2 Pair)". | E2E | |
| TC-LBL-105 | Admin | Content line: quantity=0 or null falls back to 1 ("2N (1 Pair)") | P1 | 1. Generate label where quantity is null or 0 in the box object. | `(0 || 1) = 1`. Text is "Content: 2N (1 Pair)". No crash. | Manual | `box.quantity || 1` coalesces falsy to 1. |
| TC-LBL-106 | Admin | Footer row shows correct 3-line manufacturer text | P0 | 1. Inspect `.footer-row` in any label. | Text: Line 1 "Mfg & Mktd by: Mahavir Polymers Pvt Ltd". Line 2 "FE 16-17 MIA Jaipur - 302017 Raj (India)". Line 3 "Customer Care: 0141 2751684". CSS: `font-size: 5pt; border-top: 1px solid #000`. | Manual | `Mfg &amp; Mktd by:` renders as "Mfg & Mktd by:" (HTML entity). |
| TC-LBL-107 | Admin | All labels in a batch share same article, colour, MRP, footer | P1 | 1. Generate 3 labels: size 6 × 1, size 7 × 1, size 8 × 1. Open print window. | The article-row, colour-row, mrp-row, and footer-row are identical across all three labels. Only the `.size-value` (and its font-size) differs. | Manual | |

---

## Section 10 — Print window: popup blocked / error handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-110 | Admin | Popup blocked shows toast error | P1 | 1. Configure browser to block all popups for the app origin. 2. Reach success state. 3. Click "Print Labels". | `window.open('', '_blank')` returns `null`. A `react-hot-toast` error message "Please allow popups to print labels" appears. No crash. Print window does not open. | Manual | Guard: `if (!printWindow) { toast.error('...'); return; }`. Cannot easily automate popup-blocking in Playwright without browser flags. **AUTOMATION GAP**. |
| TC-LBL-111 | Admin | Print dialog fires after window loads | P1 | 1. Allow popups. 2. Click "Print Labels". 3. Monitor the print window lifecycle. | After `printWindow.document.close()`, the `onload` event fires. Then `printWindow.focus()` is called followed by `printWindow.print()` (browser print dialog). | Manual | `printWindow.onload = () => { printWindow.focus(); printWindow.print(); }`. **AUTOMATION GAP** — automating `window.print()` interception requires Playwright dialog handling. |
| TC-LBL-112 | Admin | Printing 0 boxes does not open a print window | P2 | 1. Call `printChildBoxLabels([])` (empty array). | `labelHtmlParts` is empty. `rowsHtml` is empty string. An HTML document with empty `<body>` is written to the print window. `window.print()` is called. No JS error. | Manual | Edge case — normally unreachable via UI (Print button only appears in success state where `generatedBoxes.length > 0`). |

---

---

## Section 11 — Print window: responsive auto-fit (fitText)

> **Ground truth (`childBoxLabel.ts` lines 144–159):**
> A `fitText(sel, minPx)` script is injected into the print window HTML and runs on `window.onload` (before `window.print()` fires).
> Mechanism: for each matching element, reads `getComputedStyle(el).fontSize`; while `scrollWidth > clientWidth || scrollHeight > clientHeight` AND `px > minPx` AND guard `g < 200`, subtracts 0.5px and sets `el.style.fontSize`. Floor is **9px**.
> Selectors applied in child-box label: `.article-row` (initial CSS 11pt), `.colour-row` (9pt), `.size-value` (dynamic starting font from K-size heuristic, e.g. 38pt / 26pt / 20pt).
> The `fitText` routine can shrink BELOW the K-size starting point — the heuristic sets the initial font, auto-fit reduces it further only if still overflowing.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-120 | Any | fitText script is present in print window HTML | P0 | 1. Generate any label. Click "Print Labels". Open print window. 2. Inspect `<script>` block in `<body>`. | Script defines `function fitText(sel, minPx)` with the shrink loop. `window.onload` calls `fitText('.article-row', 9)`, `fitText('.colour-row', 9)`, `fitText('.size-value', 9)` before `window.print()`. | Manual | Source: `childBoxLabel.ts` lines 144–159. Spec: `43-label-rendering.spec.ts`. |
| TC-LBL-121 | Any | Short article name fits at default 11pt — no shrinkage needed | P1 | 1. Generate label for product with article_name "Binny" (short, 5 chars). 2. Open print window. 3. After `window.onload`, inspect `.article-row` font-size. | Element does not overflow its container (`scrollWidth <= clientWidth`). Font remains at or near the initial 11pt CSS value (no size change applied). | Manual | Auto-fit no-ops when content already fits. AUTOMATION GAP. |
| TC-LBL-122 | Any | Long article name in .article-row is shrunk to fit — no overflow | P0 | 1. Generate label for a product with a very long article_name (e.g. "Mahavir Polymers Extra Wide Comfort Slipper XL Model"). 2. Open print window. 3. After `window.onload`, inspect `.article-row` computed font-size and scroll dimensions. | `scrollWidth <= clientWidth` after `fitText` runs. The computed font-size is smaller than the initial 11pt CSS. Font-size is no lower than 9px (floor). No text truncation visible — all text is shown at smaller size. | Manual | `white-space: nowrap; overflow: hidden` CSS means overflow is in scrollWidth. `fitText` shrinks until it fits or hits 9px floor. Spec: `43-label-rendering.spec.ts`. AUTOMATION GAP — requires Playwright popup inspection. |
| TC-LBL-123 | Any | Long colour name in .colour-row is shrunk to fit | P1 | 1. Generate label for a product with a long colour name (e.g. "Fluorescent Lime Green"). 2. Open print window. 3. After load, inspect `.colour-row` font-size and scroll dimensions. | `.colour-row scrollWidth <= clientWidth`. Font-size smaller than initial 9pt CSS. Still ≥ 9px. | Manual | AUTOMATION GAP. |
| TC-LBL-124 | Any | .size-value starting at K-size heuristic (26pt for 3-char) is shrunk further if still overflowing | P1 | 1. Generate label for a size "13K" (3 chars → starts at 26pt). 2. Open print window. Inspect `.size-value` font-size after load. | If "13K" overflows the `.size-cell` at 26pt, `fitText` reduces the font-size below 26pt until the cell fits or 9px floor is reached. The result font-size is ≤ 26pt and ≥ 9px. | Manual | Demonstrates `fitText` acting BELOW the K-size starting point when needed. AUTOMATION GAP. |
| TC-LBL-125 | Any | fitText floor is 9px — font never shrinks below 9px | P0 | 1. Simulate a pathologically long article name (e.g. 100 chars). 2. Open print window. 3. After load, inspect `.article-row` font-size. | Computed font-size is at most 9px even if the content still overflows (guard hits floor). No JS error. `g < 200` secondary guard prevents infinite loop. | Manual | `while (...px > minPx && g < 200)` — both guards. AUTOMATION GAP. |
| TC-LBL-126 | Any | fitText runs before window.print() is called | P0 | 1. Open print window. 2. Inspect `window.onload` function body. | Order in script: `fitText('.article-row', 9)` → `fitText('.colour-row', 9)` → `fitText('.size-value', 9)` → `window.print()`. `window.print()` is the last call. | Manual | Ensures fitting is complete before the print dialog opens. Source: `childBoxLabel.ts` lines 154–159. |
| TC-LBL-127 | Any | fitText is idempotent — re-running on already-fitted element has no effect | P2 | 1. After `window.onload` runs, manually call `fitText('.article-row', 9)` again in the print window console. | Font-size does not change (element is already at or below its fitted size; scroll dimensions are satisfied). | Manual | AUTOMATION GAP — console script injection in Playwright popup. |

---

## Section 12 — Generate page: per-size list deduplication and sort order

> **Ground truth (`generate/page.tsx` lines 106–116, `sizeSort.ts`):**
> `sortedSizes` is derived from `siblingProducts` (all product variants sharing the same article/colour group).
> Dedup: a `Map<string, product>` keeps only the first occurrence of each `size` key — colour variants sharing a size no longer produce duplicate rows.
> Sort: `Array.from(seen.values()).sort((a, b) => compareSizes(a.size, b.size))` uses `sizeSort.ts`'s `compareSizes`.
> `compareSizes` rule: Kids (trailing `K`/`k`) before Adults; within each group ascending numeric.
> Example result: `5K, 6K, 13K, 1, 2, 9`.
>
> **Scope:** TCs here cover the "Number of Labels per Size" input list on the generate page (before submission), not the print window itself.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-LBL-130 | Admin | Each size appears exactly once when colour variants share sizes | P0 | 1. Pre-condition: a product article "Binny Slipper" has two colour variants ("Blue" and "Red"), each with sizes 6, 7, 8. 2. Login as Admin. Navigate to `/child-boxes/generate`. 3. Select the article, then select colour "Blue". 4. Inspect the size input rows. | Exactly 3 size rows appear: one for "6", one for "7", one for "8". No size is listed more than once. Not 6 rows (duplicate elimination applied). | E2E | Fix: `Map<string, product>` dedup in `sortedSizes` (lines 111–113 of generate/page.tsx). Spec: `43-label-rendering.spec.ts`. |
| TC-LBL-131 | Admin | Selecting a different colour for the same article also shows each size exactly once | P1 | 1. Continue from TC-LBL-130. Click the "Red" colour pill. 2. Inspect size rows again. | Still exactly 3 size rows for Red (6, 7, 8), no duplicates. | E2E | Dedup re-runs per colour selection. |
| TC-LBL-132 | Admin | Kid sizes sort before adult sizes in the generate-page list | P0 | 1. Pre-condition: product has sizes "1", "2", "9", "5K", "6K", "13K". 2. Select article and colour. 3. Inspect the order of size rows in the "Number of Labels per Size" table. | Size rows appear in order: 5K, 6K, 13K, 1, 2, 9. Kids (K-suffix) first, ascending; then adults, ascending. | E2E | `compareSizes` from `sizeSort.ts`. Spec: `43-label-rendering.spec.ts`. |
| TC-LBL-133 | Admin | Adult-only product sizes sort ascending numerically | P1 | 1. Product has sizes "9", "6", "7", "8", "10". 2. Select article and colour. | Size rows: 6, 7, 8, 9, 10 (ascending). No Kids present. | E2E | Pure adult group, numeric ascending. |
| TC-LBL-134 | Admin | Kids-only product sizes sort ascending numerically within Kids group | P1 | 1. Product has Kids sizes only: "13K", "5K", "6K". 2. Select article and colour. | Size rows: 5K, 6K, 13K (ascending by numeric prefix 5, 6, 13). | E2E | `compareSizes`: same isKid group → compare parseFloat. 13K > 6K > 5K reversed is wrong; ascending gives 5K < 6K < 13K. |
| TC-LBL-135 | Admin | Mixed article with 13K and 1 — 13K appears before 1 | P0 | 1. Product has sizes "13K" and "1". 2. Select article and colour. | "13K" row appears above "1" row in the size table. Kids-first rule: 13K (kid) < 1 (adult). | E2E | Key acceptance criterion: `13K` sorts before `1` despite 13 > 1 numerically — Kids group wins. Spec: `43-label-rendering.spec.ts`. |
| TC-LBL-136 | Admin | Size row count matches unique sizes (not total product variants) | P1 | 1. A product article has 3 colours × 4 sizes = 12 product rows in DB. 2. Select article and any one colour. | Exactly 4 size rows shown (one per unique size). Not 12. Not 8. | E2E | Confirms both the dedup (`Map` keep-first) and the size-level granularity. |
| TC-LBL-137 | Admin | Changing colour resets size quantities but preserves the same deduped size list | P1 | 1. Select article, colour "Blue". Enter qty 3 in size 6. 2. Click colour "Red". | All size quantities reset to 0. The same set of deduped size rows appears (assuming Red has the same sizes). Summary section disappears. | E2E | `handleColourChange` clears `sizeQuantities`. `sortedSizes` recomputed for new `effectiveProductId`. |

---

## Automation gap summary

| Gap | Recommended spec | Effort |
|---|---|---|
| No spec exists for generate page per-role access (TC-LBL-001–005) | `43-label-rendering.spec.ts` | Low |
| Print window popup interception — `page.on('popup', ...)` to capture print window DOM | `43-label-rendering.spec.ts` | Medium |
| Assert per-size input `max` attribute = env cap (TC-LBL-032) | `43-label-rendering.spec.ts` | Low |
| Print window CSS assertions (`@page`, `.row`, `.label` dimensions, font sizes) | `43-label-rendering.spec.ts` | Medium |
| K-size font scaling verified via print window DOM inspection | `43-label-rendering.spec.ts` | Medium |
| QR encodes short barcode — decode QR SVG and compare to `box.barcode` | `43-label-rendering.spec.ts` | Medium-High |
| Popup-blocked toast (requires `--block-new-web-contents` or CDP) | `43-label-rendering.spec.ts` | High |
| Dispatch Operator redirect to /inventory (TC-LBL-004) | `43-label-rendering.spec.ts` | Low |
| fitText DOM inspection in print popup (TC-LBL-121–127) | `43-label-rendering.spec.ts` | Medium-High |
| Generate page per-size dedup and sort order assertions (TC-LBL-130–137) | `43-label-rendering.spec.ts` | Low-Medium |
