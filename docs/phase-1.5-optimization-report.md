# Phase 1.5 — Optimization & Improvement Report

**Date:** March 16, 2026 (Updated March 20 — noted multi-size generate page changes)
**Scope:** Code audit of all Phase 1.5 changes (7 phases: Product expansion, Customer Master, Dispatch link, Label redesigns)
**Status:** All 44/44 Playwright E2E tests passing. 0 TypeScript errors. This report identifies improvements that do NOT break existing functionality.

> **Note (March 20):** The generate page (`child-boxes/generate/page.tsx`) referenced in findings #6 and #8 has been substantially rewritten for the Multi-Size QR Batch Generation feature. Finding #6 (QR placeholder) is now resolved — actual QR SVGs are rendered via `qrcode.react` + `renderToStaticMarkup`. Finding #8 (product management page) was already resolved in Phase 1.5 fix #8.

---

## Critical (Must Fix)

### 1. Dispatch transaction logs use raw input instead of computed destination
**Files:** `backend/src/services/dispatch.service.ts` (lines 92, 93, 127, 128, 140, 145)

When a customer is selected and destination is auto-filled from `customer.delivery_location`, the computed `destination` variable (line 47) correctly holds the resolved value. However, the audit/transaction logs still reference `input.destination` which is `null` when the user didn't manually type a destination.

**Impact:** Transaction notes will show "dispatched to unknown" and metadata will store `null` for destination, even though the dispatch record itself has the correct auto-filled destination.

**Fix:** Replace `input.destination` with `destination` in these 5 locations:
- Line 92: transaction note for CHILD_DISPATCHED
- Line 93: metadata JSON for CHILD_DISPATCHED
- Line 127: transaction note for CARTON_DISPATCHED
- Line 128: metadata JSON for CARTON_DISPATCHED
- Line 140: audit log newValues
- Line 145: logger.info message

---

### 2. Customers nav item hidden from Supervisors
**File:** `frontend/src/constants/index.ts` (line 71)

The Customers nav item is marked `adminOnly: true`, which means only Admin can see it in the sidebar. However:
- The customers page itself (`customers/page.tsx` line 31) allows both Admin and Supervisor
- The backend routes (`customer.routes.ts`) authorize both Admin and Supervisor for CRUD
- This means Supervisors can access `/customers` via direct URL but can't see the menu item

**Fix:** Change `adminOnly: true` to a new property or remove `adminOnly` and add role-based filtering that includes Supervisor. Alternatively, since the sidebar filter only checks `isAdmin`, the simplest fix is to remove `adminOnly` from the Customers nav item and let the page-level access control handle unauthorized users.

---

## High (Should Fix)

### 3. No duplicate firm name handling in customer creation
**File:** `backend/src/services/customer.service.ts`

Unlike `product.service.ts` which checks for duplicate SKU before INSERT, the customer service has no uniqueness check. Two customers with identical firm names can be created without warning.

**Fix options:**
- **Option A:** Add a UNIQUE constraint on `firm_name` in the database and handle `ConflictError` in the service (same pattern as product SKU)
- **Option B:** Add a soft check (warn but allow) since different branches of the same firm may be valid entries
- **Recommendation:** Option B with a UI warning — allow duplicates but show a warning toast: "A customer with this firm name already exists. Continue?"

### 4. Missing client-side GSTIN validation
**File:** `frontend/src/app/(dashboard)/customers/page.tsx`

The create/edit form only validates that `firm_name` is not empty (line 85). GSTIN format validation only happens on the backend, so the user doesn't see a format error until after form submission.

**Fix:** Add a client-side GSTIN regex check before calling `createCustomer`/`updateCustomer`:
```typescript
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
if (form.gstin && !GSTIN_REGEX.test(form.gstin)) {
  toast.error('Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)');
  return;
}
```

---

## Medium (Nice to Have)

### 5. Mobile number validation inconsistency
**Files:**
- `backend/src/models/schemas/customer.schema.ts` — allows 10-15 digits
- `frontend/src/app/(dashboard)/customers/page.tsx` — placeholder says "10-digit mobile number"

The schema allows international numbers (10-15 digits) but the UI implies India-only (10 digits).

**Fix:** Align the two — either update the placeholder to "10-15 digit number" or restrict the schema to exactly 10 digits if India-only.

### 6. Child box label uses placeholder text instead of actual QR code
**File:** `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx` (line 137)

The print template uses `<div class="qr-placeholder">${box.barcode}</div>` — a text-only box showing the barcode string instead of an actual scannable QR code image.

**Fix:** Generate a QR code data URI (using a library like `qrcode`) and render it as an `<img>` tag. This would require adding QR generation to the frontend print flow, similar to what was previously done with `qrcode.react`.

### 7. Master carton print label image loads from localhost
**File:** `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` (line 208)

The print window loads the Binny logo via `<img src="/monogram.png" />`. In a print popup, this resolves to `http://localhost:3000/monogram.png`. This works in development but:
- May fail if the user prints while offline
- The `onerror` fallback (line 208) handles this gracefully with text "BINNY"

**Fix (optional):** Convert `monogram.png` to a base64 data URI at build time and embed it directly in the HTML. This ensures the logo always prints regardless of network state.

### 8. Product creation form missing new dropdown fields
**File:** `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx`

The generate page shows the new product fields in the info card (read-only), but there's no product creation/edit form in the frontend that includes the new dropdown fields (category, section, location, article_group, hsn_code, size_group). Products with new fields can only be created via API.

**Fix:** Either create a dedicated product management page with the new fields, or extend the existing product list page with a create/edit modal (similar to the customers page).

---

## Low (Polish)

### 9. Assortment summary shows "boxes" instead of "Prs" (pairs) consistently
**File:** `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` (line 412)

The on-screen assortment summary footer says `Total: {totalAssortmentQty} boxes` but the print label says `{totalAssortmentQty} Prs`. The client wireframe uses "Prs" (pairs).

**Fix:** Change line 412 from "boxes" to "Prs" for consistency with the print label and client wireframe.

### 10. Customers page — Supervisor role detection
**File:** `frontend/src/app/(dashboard)/customers/page.tsx` (line 30)

The page detects Supervisor role via `user?.role === 'Supervisor'` — this works but is fragile (string comparison). The existing `useAuth` hook provides `isAdmin` but not `isSupervisor`.

**Fix (optional):** Add `isSupervisor` to the `useAuth` hook for consistency with `isAdmin`.

### 11. Search debouncing on customers page
**File:** `frontend/src/app/(dashboard)/customers/page.tsx`

Search triggers a new API call on every keystroke (via the query key dependency `search`). For fast typists, this creates unnecessary requests.

**Fix (optional):** Add a debounce (300-500ms) to the search input using the existing `useDebounce` hook (if available) or a simple setTimeout pattern.

---

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 2 | Must fix before production |
| High | 2 | Should fix soon |
| Medium | 4 | Good to fix for quality |
| Low | 3 | Polish when time permits |

**No changes will be made without explicit confirmation.**
