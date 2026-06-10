# Phase 34 — Unpack & Repack Module (`/unpack-repack`)

**Module codes:** `RPK`
**Authored:** 2026-06-09 — **rewritten 2026-06-10 for the 2-tab redesign**
**Roles under test:** Admin / Supervisor / Warehouse Operator / Dispatch Operator / Unauthenticated
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URL:** `http://localhost:3000`
**Realizing specs:**
- `frontend/e2e/41-repack-removed.spec.ts` — TC-RPK-REM-001–004 (standalone repack route 404 + sidebar absence; free-both now also 404)
- `frontend/e2e/42-carton-repack.spec.ts` — TC-RPK-SINGLE-001 (full-unpack + pack-by-barcode API lifecycle), TC-RPK-UI-001 (2-tab page UI), TC-RPK-UI-002 (/unpack redirect), TC-RPK-FB-404 (free-both 404), TC-RPK-UNPACK-AT (unpacked_at lifecycle)
- Everything else marked **AUTOMATION GAP**

**RBAC summary (verified against `backend/seeds/001_roles.ts` + `backend/src/routes/masterCarton.routes.ts`):**

| Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| `packing:unpack` (page access, Unpack tab, `fullUnpack` endpoint) | ✓ | ✓ | ✓ | ✗ |
| `packing:pack` (Repack tab enabled, `pack-by-barcode` endpoint) | ✓ | ✓ | ✓ | ✗ |
| Both required for the Repack tab full flow | ✓ | ✓ | ✓ | ✗ |

**Key backend functions (source of truth):**
- `fullUnpackMasterCarton` — rejects DISPATCHED (400) and CREATED/0-box (400); sets all active child boxes → FREE, carton → CREATED/child_count=0; **stamps `unpacked_at=NOW()`, `unpacked_by=userId`** on the carton row; gated `packing:unpack`.
- `packChildBoxByBarcode` — idempotent: re-scan of same carton returns `{alreadyPacked:true}`; box already PACKED in a *different* carton → 400; **clears `unpacked_at=NULL`, `unpacked_by=NULL`** on first pack; gated `packing:pack`.
- Migration `20260610120001_add-unpacked-tracking-to-master-cartons.js` — adds `unpacked_at timestamptz` and `unpacked_by uuid` to `master_cartons`.
- **REMOVED:** `POST /master-cartons/repack` (old `repackChildBox`) → 404.
- **REMOVED:** `POST /master-cartons/repack/free-both` (old `repackFreeBoth`) → **404** as of this redesign.
- `packing:repack` is NOT a valid permission in `PERMISSION_CATALOG` (only `packing:pack` and `packing:unpack` exist).

**Page design (2-tab layout):**
- Page gated by `packing:unpack`; absent → "Access Denied" screen.
- **Unpack tab** (default): scan carton → `getByBarcode` → carton details shown; click "Unpack" → confirm modal "Confirm Full Unpack" → `fullUnpack(id)`; boxes → FREE. Rejects DISPATCHED and CREATED/0-box at scan step.
- **Repack tab**: disabled (opacity-60, "No permission" badge) when `packing:pack` absent; otherwise enabled. Scan carton → `getByBarcode`. If `child_count > 0` → confirm modal "Unpack & Repack?" → on confirm `fullUnpack` then enter box-scan phase; if empty → box-scan directly. Box-scan uses serialised queue + scan ledger calling `packByBarcode({ barcode, master_carton_id })`.

---

## Table of Contents

1. [§34.1 — Removed Routes (standalone repack + free-both)](#341--removed-routes-standalone-repack--free-both)
2. [§34.2 — `/unpack` Redirect](#342--unpack-redirect)
3. [§34.3 — Page Load & Tab Selector RBAC](#343--page-load--tab-selector-rbac)
4. [§34.4 — Unpack Tab: Happy Path](#344--unpack-tab-happy-path)
5. [§34.5 — Unpack Tab: Rejection Guards](#345--unpack-tab-rejection-guards)
6. [§34.6 — Unpack Tab: RBAC per Role](#346--unpack-tab-rbac-per-role)
7. [§34.7 — Repack Tab: Empty-Carton Direct Box-Scan](#347--repack-tab-empty-carton-direct-box-scan)
8. [§34.8 — Repack Tab: Non-Empty Carton → Confirm Modal → Auto-Unpack → Box-Scan](#348--repack-tab-non-empty-carton--confirm-modal--auto-unpack--box-scan)
9. [§34.9 — Repack Tab: Rejection Guards](#349--repack-tab-rejection-guards)
10. [§34.10 — Repack Tab: RBAC per Role](#3410--repack-tab-rbac-per-role)
11. [§34.11 — Scan Queue / Ledger / Dedupe UX](#3411--scan-queue--ledger--dedupe-ux)
12. [§34.12 — `unpacked_at` Lifecycle (Integration)](#3412--unpacked_at-lifecycle-integration)
13. [§34.13 — Capacity Warnings & Full-Carton Gate](#3413--capacity-warnings--full-carton-gate)
14. [§34.14 — Audit Log & Inventory Transactions](#3414--audit-log--inventory-transactions)
15. [§34.15 — Unauthenticated Access](#3415--unauthenticated-access)

---

## §34.1 — Removed Routes (standalone repack + free-both)

> Old `POST /master-cartons/repack` (the `repackChildBox` endpoint) was removed earlier. `POST /master-cartons/repack/free-both` (the `repackFreeBoth` endpoint) is also now removed as part of the 2-tab redesign. No sidebar item labelled "Repack" should appear. `packing:repack` is not a valid permission.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-REM-001 | Admin | `POST /master-cartons/repack` → 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/repack` with any JSON body. | HTTP 404 or 405; not a successful 2xx response. | E2E | Spec 41 `TC-RPRM-API-001`. Route is not registered. |
| TC-RPK-REM-002 | Admin | `GET /master-cartons/repack` → not 2xx | P0 | 1. Login as Admin. 2. `GET /api/v1/master-cartons/repack`. | HTTP status not 2xx (404/405 expected). | E2E | Spec 41 `TC-RPRM-API-002`. |
| TC-RPK-REM-003 | Admin | Sidebar does NOT contain a "Repack" nav link | P0 | 1. Login as Admin. 2. Observe sidebar. | No link with label matching `/^repack$/i` is present in the sidebar nav. | E2E | Spec 41 `TC-RPRM-UI-001`. "Unpack & Repack" item IS present; bare "Repack" is NOT. |
| TC-RPK-REM-004 | Admin | Navigating to `/master-cartons/repack` shows no repack form | P1 | 1. Login as Admin. 2. Navigate to `/master-cartons/repack`. | Page does not render a working repack form (Next.js 404 UI, error boundary, or redirect). No `<form>` element mentioning repack present. | E2E | Spec 41 `TC-RPRM-UI-002`. |
| TC-RPK-REM-005 | Admin | `POST /master-cartons/repack/free-both` → 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/repack/free-both` with `{carton1_barcode, carton2_barcode}`. | HTTP 404 (route removed). Previously 200; now unregistered. | E2E | Spec 42 `TC-RPK-FB-404`. `repackFreeBoth` service/controller/route removed in 2-tab redesign. |
| TC-RPK-REM-006 | Admin | `packing:repack` is absent from permission catalog | P1 | 1. `GET /api/v1/permissions` (or inspect Role Manager permission grid). | `packing:repack` does not appear in the permission catalog. Catalog contains only `packing:pack` and `packing:unpack`. | Manual | AUTOMATION GAP. Validates that the old permission was pruned. |

---

## §34.2 — `/unpack` Redirect

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-REDIR-001 | Admin | `/unpack` → server-side redirect to `/unpack-repack` | P0 | 1. Login as Admin. 2. Navigate to `/unpack`. | Browser URL becomes `/unpack-repack`; the Unpack & Repack page renders. | E2E | Spec 42 `TC-RPK-UI-002`. Next.js `redirect('/unpack-repack')` in `app/(dashboard)/unpack/page.tsx`. |
| TC-RPK-REDIR-002 | Unauthenticated | `/unpack` redirect still fires before auth middleware | P1 | 1. Without login, navigate to `/unpack`. | Either redirected to `/unpack-repack` (then to login) or directly to login. No page renders for `/unpack`. | Manual | AUTOMATION GAP. Server-side redirect precedes dashboard layout auth check. |

---

## §34.3 — Page Load & Tab Selector RBAC

> Page-level guard: `useCan('packing:unpack')`. Failing → "Access Denied" screen. The Repack tab additionally requires `packing:pack`; if absent the tab button is visible but `disabled` (opacity-60, `cursor-not-allowed`, "No permission" badge). Clicking it has no effect.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-PAGE-001 | Admin | `/unpack-repack` loads, shows page heading and exactly 2 tab toggles | P0 | 1. Login as Admin. 2. Navigate to `/unpack-repack`. | Page heading "Unpack & Repack" visible in main content. Exactly two tab toggle buttons visible: **"Unpack"** and **"Repack"**. No "Single Unpack", "Single Repack", or "Repack — 2 Cartons" cards. Both tabs enabled. | E2E | Spec 42 `TC-RPK-UI-001`. Old 3-mode layout is gone. |
| TC-RPK-PAGE-002 | Admin | Unpack tab is selected by default | P1 | 1. Navigate to `/unpack-repack`. | "Unpack" tab button has active styling (navy border, `CheckCircle2` icon). Carton scan input rendered below. | Manual | AUTOMATION GAP. `useState<Tab>('unpack')` default. |
| TC-RPK-PAGE-003 | Admin | Clicking "Repack" tab activates it | P1 | 1. On `/unpack-repack`, click "Repack" tab button. | Repack tab gains active styling; `RepackTab` component renders (scan carton input with instructional text). | Manual | AUTOMATION GAP. |
| TC-RPK-PAGE-004 | Supervisor | `/unpack-repack` loads with both tabs enabled | P1 | 1. Login as Supervisor. 2. Navigate to `/unpack-repack`. | Both tabs enabled (Supervisor holds both `packing:unpack` and `packing:pack`). | Manual | AUTOMATION GAP. |
| TC-RPK-PAGE-005 | Warehouse Operator | `/unpack-repack` loads with both tabs enabled | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/unpack-repack`. | Both tabs enabled (WH Op holds both packing permissions). | Manual | AUTOMATION GAP. |
| TC-RPK-PAGE-006 | Dispatch Operator | `/unpack-repack` shows "Access Denied" | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/unpack-repack`. | "Access Denied" screen renders: heading "Access Denied", message "You do not have permission to unpack cartons." No tab buttons visible. | Manual | AUTOMATION GAP. Dispatch Op lacks `packing:unpack`. |
| TC-RPK-PAGE-007 | Dispatch Operator | Sidebar does NOT show "Unpack & Repack" link | P0 | 1. Login as Dispatch Operator. 2. Observe sidebar nav. | "Unpack & Repack" nav item is absent (filtered by `requiresPermission: 'packing:unpack'`). | Manual | AUTOMATION GAP. |
| TC-RPK-PAGE-008 | Admin | Repack tab shows "No permission" badge when user lacks `packing:pack` | P1 | 1. Use a custom role that has `packing:unpack` but NOT `packing:pack`. 2. Login and navigate to `/unpack-repack`. | Page loads (no Access Denied). Unpack tab enabled. Repack tab shows "No permission" badge, is `opacity-60`, `cursor-not-allowed`, `disabled`. Clicking it has no effect. | Manual | AUTOMATION GAP. `disabled={!canPack}` and `onClick={() => canPack && setTab('repack')` guards. |
| TC-RPK-PAGE-009 | Admin | Sidebar "Unpack & Repack" link is visible and navigates correctly | P1 | 1. Login as Admin. 2. Click "Unpack & Repack" link in sidebar. | Link present with `PackageOpen` icon. Click navigates to `/unpack-repack`. | Manual | AUTOMATION GAP. `requiresPermission: 'packing:unpack'` — visible for Admin/Sup/WH Op. |

---

## §34.4 — Unpack Tab: Happy Path

> Flow: click Unpack tab (default) → scan carton barcode → `getByBarcode` → carton details shown → click "Unpack" → confirm modal "Confirm Full Unpack" → "Yes, Unpack All" → `POST /:id/full-unpack` → all active child boxes → FREE, carton → CREATED, `unpacked_at` stamped.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-SU-001 | Admin | Unpack tab: scan ACTIVE carton, confirm, all boxes freed | P0 | 1. Create carton with 3 packed boxes (ACTIVE). 2. Navigate to `/unpack-repack` (Unpack tab). 3. Scan carton barcode. 4. Verify carton details card shows barcode, status ACTIVE, child_count=3, child box list. 5. Click "Unpack". 6. Confirm modal ("Yes, Unpack All"). | Success toast "Carton [barcode] unpacked — 3 boxes freed". Carton detail card hidden (reset). All 3 child boxes are now FREE. Carton is CREATED with child_count=0. | E2E | AUTOMATION GAP for UI flow. API sequence covered by spec 42 `TC-RPK-SINGLE-001`. |
| TC-RPK-SU-002 | Admin | Unpack tab: child box list displayed in carton detail card | P1 | 1. Create ACTIVE carton with 2 boxes. 2. Scan barcode on Unpack tab. | Carton detail card shows child boxes list with barcode (font-mono) + article/colour/size for each box in orange-50 rows. | Manual | AUTOMATION GAP. `carton.child_boxes` rendered in the "Contents" section. |
| TC-RPK-SU-003 | Admin | Unpack tab: CLOSED carton is accepted and fully unpacked | P1 | 1. Close a carton with 2 boxes. 2. Scan barcode on Unpack tab. 3. Confirm full unpack. | Full unpack succeeds; carton → CREATED, child_count=0; boxes → FREE. CLOSED is not rejected at API level (only DISPATCHED and CREATED are). | Manual | AUTOMATION GAP. |
| TC-RPK-SU-004 | Admin | Unpack tab: cancel confirm modal — no changes made | P1 | 1. Scan a carton. 2. Click "Unpack". 3. In confirm modal, click "Cancel". | Modal closes. Carton details still shown. No API call made. Carton status unchanged. | Manual | AUTOMATION GAP. |
| TC-RPK-SU-005 | Admin | Unpack tab: "Cancel" button on carton card resets form | P1 | 1. Scan a carton (details appear). 2. Click "Cancel" button on carton detail card. | Carton state cleared (`setCarton(null)`). Carton detail card hidden. Scan input re-enabled. | Manual | AUTOMATION GAP. `handleReset()`. |
| TC-RPK-SU-006 | Admin | `POST /master-cartons/:id/full-unpack` happy path returns CREATED carton | P0 | 1. Create ACTIVE carton with 2 boxes. 2. `POST /api/v1/master-cartons/:id/full-unpack`. | HTTP 200; `data.status='CREATED'`; `data.child_count=0`; `carton_child_mapping` rows deactivated; boxes FREE in DB; `CHILD_UNPACKED` inventory transactions written; `data.unpacked_at` is non-null timestamp; `data.unpacked_by` is the caller's user ID. | API | Spec 42 `TC-RPK-SINGLE-001` covers the API sequence. `unpacked_at` lifecycle covered by `TC-RPK-UNPACK-AT` in spec 42. |
| TC-RPK-SU-007 | Admin | HID scanner on Unpack tab is auto-focused | P2 | 1. Navigate to `/unpack-repack`. | `HIDScannerInput` has `autoFocus` prop; cursor is in the carton barcode field immediately. | Manual | AUTOMATION GAP. `autoFocus` prop on `HIDScannerInput`. |

---

## §34.5 — Unpack Tab: Rejection Guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-SU-010 | Admin | Unpack tab: DISPATCHED carton rejected at scan step | P0 | 1. Dispatch a carton. 2. Scan its barcode on Unpack tab. | Toast error "Cannot unpack a dispatched carton". Carton detail card does NOT appear. Scan input re-enabled. | Manual | AUTOMATION GAP. Frontend `handleCartonScan` checks `found.status === 'DISPATCHED'`. |
| TC-RPK-SU-011 | Admin | Unpack tab: CREATED (0-box) carton rejected at scan step | P0 | 1. Create empty carton (CREATED, child_count=0). 2. Scan barcode on Unpack tab. | Toast error "This carton has no packed boxes". Carton detail card does NOT appear. | Manual | AUTOMATION GAP. Frontend checks `found.status === 'CREATED' \|\| (found.child_count ?? 0) === 0`. |
| TC-RPK-SU-012 | Admin | `POST /master-cartons/:id/full-unpack` on DISPATCHED carton → 400 | P0 | 1. Dispatch a carton. 2. `POST /api/v1/master-cartons/:id/full-unpack`. | HTTP 400; error "Cannot unpack a dispatched carton". | API | AUTOMATION GAP. `fullUnpackMasterCarton` service guard. |
| TC-RPK-SU-013 | Admin | `POST /master-cartons/:id/full-unpack` on CREATED (0-box) carton → 400 | P0 | 1. Create empty carton. 2. `POST /api/v1/master-cartons/:id/full-unpack`. | HTTP 400; error "Cannot unpack an empty carton". | API | AUTOMATION GAP. |
| TC-RPK-SU-014 | Admin | `POST /master-cartons/:id/full-unpack` unknown carton ID → 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/full-unpack`. | HTTP 404; "Master carton not found". | API | AUTOMATION GAP. |
| TC-RPK-SU-015 | Admin | Unpack tab: unknown barcode on scan → error toast, no detail card | P1 | 1. Enter a non-existent barcode. | Toast error "Master carton not found". No carton detail card. Spinner shown then cleared. | Manual | AUTOMATION GAP. |

---

## §34.6 — Unpack Tab: RBAC per Role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-SU-RBAC-001 | Admin | `POST /master-cartons/:id/full-unpack` allowed | P0 | 1. Create ACTIVE carton. 2. `POST /api/v1/master-cartons/:id/full-unpack` with Admin token. | HTTP 200; carton → CREATED. | API | AUTOMATION GAP. |
| TC-RPK-SU-RBAC-002 | Supervisor | `POST /master-cartons/:id/full-unpack` allowed | P0 | 1. Same setup with Supervisor token. | HTTP 200; success. | API | AUTOMATION GAP. Supervisor holds `packing:unpack`. |
| TC-RPK-SU-RBAC-003 | Warehouse Operator | `POST /master-cartons/:id/full-unpack` allowed | P0 | 1. Same setup with Warehouse Operator token. | HTTP 200; success. | API | AUTOMATION GAP. WH Op holds `packing:unpack`. |
| TC-RPK-SU-RBAC-004 | Dispatch Operator | `POST /master-cartons/:id/full-unpack` → 403 | P0 | 1. Same setup with Dispatch Operator token. | HTTP 403; Dispatch Op lacks `packing:unpack`. | API | AUTOMATION GAP. |
| TC-RPK-SU-RBAC-005 | Unauthenticated | `POST /master-cartons/:id/full-unpack` → 401 | P0 | 1. No token. `POST /api/v1/master-cartons/:id/full-unpack`. | HTTP 401. | API | AUTOMATION GAP. |

---

## §34.7 — Repack Tab: Empty-Carton Direct Box-Scan

> If the scanned carton has `child_count === 0` (CREATED/empty), no confirm modal is shown — the Repack tab goes directly into box-scan phase (`enterBoxScanMode()`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-RT-001 | Admin | Repack tab: scan empty CREATED carton → enters box-scan phase directly | P0 | 1. Create empty carton C1 (CREATED). 2. On Repack tab, scan C1. | No confirm modal appears. UI transitions to box-scan phase immediately. Summary bar shows "Repacking carton [barcode]". HID scan input for boxes is visible and enabled. | Manual | AUTOMATION GAP. `child_count === 0` branch in `handleCartonScan`. |
| TC-RPK-RT-002 | Admin | Repack tab: DISPATCHED carton rejected at scan step | P0 | 1. Dispatch a carton. 2. On Repack tab, scan its barcode. | Toast error "Cannot repack a dispatched carton". UI stays in scan-carton phase. No confirm modal. | Manual | AUTOMATION GAP. `found.status === 'DISPATCHED'` check in Repack tab's `handleCartonScan`. |
| TC-RPK-RT-003 | Admin | Repack tab: empty carton → scan box → box packs via `pack-by-barcode` | P0 | 1. Create empty carton C1 and a FREE box B1. 2. Scan C1 on Repack tab (enters box-scan directly). 3. Scan B1. | Ledger entry for B1 shows pending → packed (green). `packedCount` counter = 1. `GET /master-cartons/C1.id` → status=ACTIVE, child_count=1. | E2E | Spec 42 `TC-RPK-SINGLE-001` covers the API sequence. UI scan = AUTOMATION GAP. |
| TC-RPK-RT-004 | Admin | Repack tab: "Done / Repack Another Carton" button resets to scan-carton phase | P1 | 1. After entering box-scan phase, click "Done / Repack Another Carton". | Wizard resets: phase = 'scan-carton', carton = null, scan log cleared, packedCount = 0. | Manual | AUTOMATION GAP. `handleReset()`. |

---

## §34.8 — Repack Tab: Non-Empty Carton → Confirm Modal → Auto-Unpack → Box-Scan

> If the scanned carton has `child_count > 0`, a confirm modal titled "Unpack & Repack" appears listing the current boxes. On confirm, `fullUnpack` is called automatically, then box-scan phase opens.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-CR-001 | Admin | Repack tab: non-empty carton → confirm modal appears | P0 | 1. Create ACTIVE carton C1 with 2 boxes. 2. On Repack tab, scan C1. | Confirm modal titled "Unpack & Repack" appears. Modal body shows: "Carton [barcode] currently holds 2 boxes. Unpack them and start repacking?" List of current boxes (barcode + article/colour/size) visible. | E2E | Spec 42 `TC-RPK-CR-001`. |
| TC-RPK-CR-002 | Admin | Repack tab: confirm modal → "Unpack & Start Repacking" → auto-unpack then box-scan | P0 | 1. Open confirm modal for carton C1 (2 boxes). 2. Click "Unpack & Start Repacking". | `fullUnpack(C1.id)` called. Toast "Carton emptied — 2 boxes freed". UI transitions to box-scan phase. Summary bar shows C1 barcode. Scanner input enabled. | E2E | Spec 42 `TC-RPK-CR-001` covers the API sequence. |
| TC-RPK-CR-003 | Admin | Repack tab: cancel confirm modal → returns to scan-carton phase | P1 | 1. Scan non-empty carton (modal appears). 2. Click "Cancel" in modal. | Modal closes. `carton` state cleared. UI returns to scan-carton phase. No API call made. | Manual | AUTOMATION GAP. `onClose={() => { setShowConfirmModal(false); setCarton(null); }}`. |
| TC-RPK-CR-004 | Admin | Repack tab: after auto-unpack, scan any FREE box (not from freed pool) | P1 | 1. Repack tab: scan ACTIVE carton C1 (3 boxes). 2. Confirm unpack. 3. In box-scan phase, scan a FREE box B_other that was never in C1. | B_other packs successfully. Ledger shows "packed". Any FREE box is accepted, not limited to the freed pool. | Manual | AUTOMATION GAP. Page description: "You are not limited to the boxes that were just freed — any FREE box is accepted." |
| TC-RPK-CR-005 | Admin | Repack tab: box-scan for CLOSED carton (non-empty) also shows confirm modal | P1 | 1. Close a carton with 2 boxes (status=CLOSED). 2. Scan on Repack tab. | Confirm modal appears (same flow as ACTIVE). `child_count > 0` is the only condition checked. | Manual | AUTOMATION GAP. Frontend checks `(found.child_count ?? 0) > 0`. |

---

## §34.9 — Repack Tab: Rejection Guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-RG-001 | Admin | Repack box-scan: scan PACKED box (in another carton) → ledger shows Failed | P1 | 1. Repack tab, in box-scan phase for C1. 2. Scan a box B_other that is currently PACKED in C2. | Ledger entry for B_other shows status "failed" with error message. Retry button shown. `seenRef` entry cleared so retry is possible. | Manual | AUTOMATION GAP. `packChildBoxByBarcode` throws BadRequestError for box PACKED elsewhere. |
| TC-RPK-RG-002 | Admin | Repack box-scan: scan DISPATCHED box → ledger shows Failed | P1 | 1. In box-scan phase. 2. Scan a box in DISPATCHED status. | Ledger entry shows "failed". Error message propagated from API response. | Manual | AUTOMATION GAP. |
| TC-RPK-RG-003 | Admin | Repack box-scan: capacity-full disables scanner | P1 | 1. Repack tab on carton with max_capacity=2. 2. Scan 2 boxes until full. | After 2nd box: "Carton Full" badge shown; scanner `disabled`; red warning banner "Carton is at full capacity (2 boxes). No more boxes can be packed." | Manual | AUTOMATION GAP. `capacityFull = maxCapacity > 0 && packedCount >= maxCapacity`. `HIDScannerInput disabled={capacityFull}`. |
| TC-RPK-RG-004 | Admin | Repack box-scan: unknown barcode → ledger Failed | P1 | 1. In box-scan phase. 2. Scan a non-existent barcode. | Ledger entry shows "failed". Error from API ("Child box not found" or equivalent). Retry button shown. | Manual | AUTOMATION GAP. |

---

## §34.10 — Repack Tab: RBAC per Role

> Repack tab requires both `packing:unpack` (full-unpack on non-empty cartons) AND `packing:pack` (pack-by-barcode). All three packing roles (Admin/Supervisor/WH Op) hold both. Dispatch Op holds neither. Page itself is guarded by `packing:unpack`; the Repack tab is additionally guarded by `packing:pack` at the UI level and the API enforces both.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-RT-RBAC-001 | Admin | Repack full flow (unpack + pack-by-barcode) allowed | P0 | 1. Admin completes Repack tab flow (fullUnpack + packByBarcode). | Both API calls succeed (200). | API | AUTOMATION GAP. |
| TC-RPK-RT-RBAC-002 | Supervisor | Repack full flow allowed | P0 | 1. Supervisor token. Full-unpack API + pack-by-barcode API. | Both 200. | API | AUTOMATION GAP. |
| TC-RPK-RT-RBAC-003 | Warehouse Operator | Repack full flow allowed | P0 | 1. Warehouse Operator token. Full-unpack + pack-by-barcode. | Both 200. | API | AUTOMATION GAP. |
| TC-RPK-RT-RBAC-004 | Dispatch Operator | Page shows "Access Denied" | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/unpack-repack`. | "Access Denied" screen. No tab buttons visible. | Manual | AUTOMATION GAP. |
| TC-RPK-RT-RBAC-005 | Dispatch Operator | `POST /master-cartons/pack-by-barcode` → 403 | P0 | 1. Dispatch Op token. `POST /api/v1/master-cartons/pack-by-barcode` with valid body. | HTTP 403; `packing:pack` required. | API | AUTOMATION GAP. |
| TC-RPK-RT-RBAC-006 | Unauthenticated | `POST /master-cartons/pack-by-barcode` → 401 | P0 | 1. No token. `POST /api/v1/master-cartons/pack-by-barcode`. | HTTP 401. | API | AUTOMATION GAP. |

---

## §34.11 — Scan Queue / Ledger / Dedupe UX

> The scan queue processes barcodes serially (one at a time via `processingRef`). Each entry shows: `pending` (spinner) → `packed` (green ✓) / `noop` (grey ✓, "Already in carton") / `failed` (red ✗ + Retry). Recent entries displayed newest-first (`[...scanLog].reverse()`). Applies to the Repack tab box-scan phase.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-Q-001 | Admin | Rapid-fire scan queue: 5 barcodes scanned quickly → serialized, all appear in ledger | P1 | 1. In box-scan phase with a target carton, rapidly scan 5 distinct free boxes. | All 5 entries appear in ledger. Each goes through pending → packed (or failed). No entries skipped. Serial: one API call at a time (`processingRef` guard). | Manual | AUTOMATION GAP. Queue via `queueRef` + `processingRef`. |
| TC-RPK-Q-002 | Admin | Ledger entries displayed newest-first | P1 | 1. Scan B1, then B2, then B3 sequentially. | Ledger order from top: B3, B2, B1 (most recent first). `[...scanLog].reverse()`. | Manual | AUTOMATION GAP. |
| TC-RPK-Q-003 | Admin | Duplicate scan of already-scanned barcode → toast, not re-queued | P0 | 1. Successfully scan B1. 2. Scan B1 again via HID input. | Toast error "B1 already scanned". B1 not re-added to queue. `seenRef` blocks duplicate. | Manual | AUTOMATION GAP. |
| TC-RPK-Q-004 | Admin | "Packed" count in summary bar increments only for genuine new packs, not no-ops | P1 | 1. Pack B1 (fresh → packed). 2. Cause a noop (API idempotency path, bypassing seenRef). | Packed count increments on status=`packed` only. `setPackedCount((n) => n + 1)` only in the `!res?.alreadyPacked` branch. | Manual | AUTOMATION GAP. |
| TC-RPK-Q-005 | Admin | Failed entry cleared from `seenRef` on failure → retry admitted | P1 | 1. Cause a scan failure. 2. Click Retry. | Retry re-queues barcode. `seenRef.current.delete(barcode)` on catch. On success this time, entry → packed. | Manual | AUTOMATION GAP. |
| TC-RPK-Q-006 | Admin | Spinner shown while queue is processing | P1 | 1. Scan a box. Observe heading area. | `Loader2` spinner visible next to "Scan Boxes to Pack" heading while `isPacking=true`. | Manual | AUTOMATION GAP. |
| TC-RPK-Q-007 | Admin | Ledger summary counts: "3 packed · 1 failed · 1 pending" shown correctly | P1 | 1. Engineer a state where 3 packed, 1 failed, 1 pending. | Ledger header shows counts separated by ` · `. Failed and pending labels only when > 0. | Manual | AUTOMATION GAP. Conditional rendering in scan ledger header. |
| TC-RPK-Q-008 | Admin | "Clear" button clears scan log and resets seenRef | P1 | 1. Scan some boxes. 2. Click "Clear" button above ledger. | Scan log cleared. `seenRef` reset (can re-scan same barcodes). Packed count counter unchanged. | Manual | AUTOMATION GAP. `clearScanLog()`. |
| TC-RPK-Q-009 | Admin | "Nearing Capacity" (80%) amber badge shown | P2 | 1. Repack carton with max_capacity=10. 2. Scan 8 boxes. | Amber "Nearing Capacity" badge in summary bar. `capacityWarning = packedCount >= maxCapacity * 0.8 && !capacityFull`. | Manual | AUTOMATION GAP. |

---

## §34.12 — `unpacked_at` Lifecycle (Integration)

> `unpacked_at` and `unpacked_by` are stamped on the `master_cartons` row by `fullUnpackMasterCarton`. They are cleared (`NULL`) by `packChildBox` (and `packChildBoxByBarcode`) on the first box packed back in. These fields are NOT directly exposed through the existing `GET /master-cartons/:id` API response (verify against the type); the lifecycle can be asserted via status/child_count transitions as a proxy.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-UAT-001 | Admin | `fullUnpack` stamps `unpacked_at` on the carton (integration) | P1 | 1. Create ACTIVE carton C1. 2. `POST /master-cartons/C1.id/full-unpack`. 3. `GET /master-cartons/C1.id`. | Response body: `status='CREATED'`, `child_count=0`. If `unpacked_at` is in the response shape, it is non-null and a valid timestamp. | API | Spec 42 `TC-RPK-UNPACK-AT`. If the field is not returned by the GET endpoint, assert status/child_count only. |
| TC-RPK-UAT-002 | Admin | `packChildBoxByBarcode` clears `unpacked_at` on first re-pack (integration) | P1 | 1. Full-unpack C1. 2. `POST /master-cartons/pack-by-barcode` with one freed box. 3. `GET /master-cartons/C1.id`. | Response: `status='ACTIVE'`, `child_count=1`. If `unpacked_at` is returned, it is `null`. | API | Spec 42 `TC-RPK-UNPACK-AT`. Proxy assertion: status goes CREATED → ACTIVE on first pack. |
| TC-RPK-UAT-003 | Admin | Unpack → Repack tab complete round-trip: status lifecycle | P0 | 1. Create ACTIVE carton C1 (3 boxes). 2. Full-unpack (C1 → CREATED). 3. Pack-by-barcode 1 box back in (C1 → ACTIVE). | After step 2: `status=CREATED`, `child_count=0`. After step 3: `status=ACTIVE`, `child_count=1`. Third box remains FREE. | E2E | Spec 42 `TC-RPK-SINGLE-001` covers exactly this sequence. |
| TC-RPK-UAT-004 | Admin | `unpacked_at` not set on fresh carton (never unpacked) | P1 | 1. Create a fresh carton. 2. `GET /master-cartons/:id`. | If `unpacked_at` is returned in the response, it is `null`. Carton has never been unpacked. | API | AUTOMATION GAP. Migration defaults column to NULL. |

---

## §34.13 — Capacity Warnings & Full-Carton Gate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-CAP-001 | Admin | Capacity full: scanner disabled, red banner shown | P1 | 1. Repack tab on carton with max_capacity=2. 2. Pack 2 boxes. | After 2nd pack: red "Carton Full" badge in summary. Red banner "Carton is at full capacity (2 boxes). No more boxes can be packed." Scanner `disabled` prop = `true`. | Manual | AUTOMATION GAP. `capacityFull = maxCapacity > 0 && packedCount >= maxCapacity`. |
| TC-RPK-CAP-002 | Admin | `packChildBoxByBarcode` on full carton → 400 at API level | P1 | 1. Fill carton to max_capacity. 2. `POST /master-cartons/pack-by-barcode` with another free box. | HTTP 400; "Master carton is full (N/N)". | API | AUTOMATION GAP. `packChildBox` checks `carton.child_count >= carton.max_capacity`. |
| TC-RPK-CAP-003 | Admin | Packed counter shows correct colour progression | P1 | 1. Pack boxes from 0 → 79% → 80%+ → 100%. | Counter text: green below 80%, amber at 80%+, red at 100%. `capacityWarning` (amber) and `capacityFull` (red) CSS classes. | Manual | AUTOMATION GAP. |

---

## §34.14 — Audit Log & Inventory Transactions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-AUD-001 | Admin | `fullUnpackMasterCarton` writes audit `FULL_UNPACK_MASTER_CARTON` | P1 | 1. Full-unpack a carton with 3 boxes. 2. Query audit log for `action='FULL_UNPACK_MASTER_CARTON'`. | Audit entry: `entity_type='master_carton'`, `entity_id=cartonId`, `new_values.unpacked_count=3`. | API | AUTOMATION GAP. `createAuditLog` in `fullUnpackMasterCarton`. |
| TC-RPK-AUD-002 | Admin | `fullUnpackMasterCarton` writes `CHILD_UNPACKED` inventory transaction per box | P1 | 1. Full-unpack carton with 2 boxes. 2. Check `inventory_transactions`. | 2 rows with `transaction_type='CHILD_UNPACKED'`, notes prefixed "Full unpack:". | API | AUTOMATION GAP. |
| TC-RPK-AUD-003 | Admin | `packChildBoxByBarcode` (new pack) writes `CHILD_PACKED` transaction | P1 | 1. Pack box B1 via pack-by-barcode into carton. 2. Check `inventory_transactions`. | 1 `CHILD_PACKED` row: `child_box_id=B1.id`, `master_carton_id`, `performed_by`. | API | AUTOMATION GAP. Via `packChildBox` called from `packChildBoxByBarcode`. |
| TC-RPK-AUD-004 | Admin | `packChildBoxByBarcode` idempotent re-scan writes NO additional transaction | P1 | 1. Pack B1. 2. Re-call pack-by-barcode for B1 same carton (idempotent). | No new `CHILD_PACKED` transaction for the re-scan. `alreadyPacked=true` short-circuits before `packChildBox`. | API | AUTOMATION GAP. |

---

## §34.15 — Unauthenticated Access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-RPK-UNAUTH-001 | Unauthenticated | `POST /master-cartons/:id/full-unpack` → 401 | P0 | 1. No token. `POST /api/v1/master-cartons/:id/full-unpack`. | HTTP 401. `authenticate` middleware fires before `authorizePermission`. | API | AUTOMATION GAP. |
| TC-RPK-UNAUTH-002 | Unauthenticated | `POST /master-cartons/repack/free-both` → 404 (route removed) | P0 | 1. No token. `POST /api/v1/master-cartons/repack/free-both` with any body. | HTTP 404 (route not registered). Previously 401; now the route itself is gone. | API | AUTOMATION GAP. Even unauthenticated callers get 404. |
| TC-RPK-UNAUTH-003 | Unauthenticated | `POST /master-cartons/pack-by-barcode` → 401 | P0 | 1. No token. `POST /api/v1/master-cartons/pack-by-barcode`. | HTTP 401. | API | AUTOMATION GAP. |
| TC-RPK-UNAUTH-004 | Unauthenticated | `/unpack-repack` UI → redirected to login | P0 | 1. No session. Navigate to `/unpack-repack`. | Browser redirected to `/login` (dashboard layout auth check). Page not rendered. | Manual | AUTOMATION GAP. |
