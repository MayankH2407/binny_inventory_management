# Phase 18 — Scan & Traceability

**Refreshed:** 2026-06-09 (Session A18 re-authoring)
**Module codes:** `SCAN`
**Roles under test:** Admin, Supervisor, Warehouse Operator, Dispatch Operator (all 4 — scan/trace is auth-only, no permission gate), plus Unauthenticated (401).
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URLs:** `/scan` (Scan & Trace page), `/traceability` (Traceability page)
**Primary trace endpoint:** `GET /api/v1/inventory/trace/:barcode` — auth-only, NO `authorizePermission` guard.
**Transactions endpoint:** `GET /api/v1/inventory/transactions` — **requires `authorizePermission('inventory:read')`; Admin-only in practice.**
**Activate endpoint:** `POST /api/v1/child-boxes/:id/activate` — `child_boxes:update` permission required.

---

## Known discrepancies (encode as explicit TCs — not bugs to fix here)

1. **`/inventory/transactions` is NOT auth-only** — it requires `authorizePermission('inventory:read')` (line 15, `inventory.routes.ts`). The prior version of this file incorrectly stated all roles can access it. Non-Admin roles receive **403**. Admin receives 200.
2. **Sample/ecommerce result cards do NOT exist in the web UI.** `traceByBarcode` returns `childBox.status = 'SAMPLE'` or `'ECOMMERCE'` correctly, but neither `/scan` nor `/traceability` renders a dedicated sample-record or ecommerce-record card. The child box card renders with the appropriate status badge; no further sample/ecommerce metadata is displayed.
3. **Spec `08-scan.spec.ts` is stale.** It asserts "Camera Scanner" and "Manual Entry" as separate sections (TC-SCANTRACE-001), and expects a `getByPlaceholder(/enter barcode/i)` plus a "Look Up" button. The actual page uses a single `HIDScannerInput` component labelled "Barcode Scanner" with a `Scan barcode to trace...` placeholder and an "Add" submit button; the camera is hidden behind a "Use Camera Instead" toggle. Multiple spec-08 tests reference stale element names — see per-TC notes.
4. **No `BINNY-*` legacy barcode format in current codebase.** `generateUniqueBarcode` always produces `{type}{6 Crockford base-32 chars}` (e.g. `CB3X7K2M`). The backend `traceByBarcode` does `UPPER($1)` normalization but performs no format validation; a `BINNY-*` string simply 404s.
5. **Auto-activation is frontend-only.** `GET /inventory/trace` never activates anything. Activation requires a separate `POST /child-boxes/:id/activate` call made by the frontend `useEffect`.
6. **`/traceability` has no offline queue / pending badge** (no `useOfflineScanQueue`). That functionality exists only on `/scan`.

---

## Table of contents

1. [RBAC — route authentication](#1-rbac--route-authentication)
2. [Barcode format — parseQRCode / normalization](#2-barcode-format--parseqrcode--normalization)
3. [Trace child box — all statuses](#3-trace-child-box--all-statuses)
4. [Trace master carton](#4-trace-master-carton)
5. [GENERATED auto-activation on scan (side-effect)](#5-generated-auto-activation-on-scan-side-effect)
6. [Timeline correctness](#6-timeline-correctness)
7. [HID-first UX — /scan page](#7-hid-first-ux--scan-page)
8. [HID-first UX — /traceability page](#8-hid-first-ux--traceability-page)
9. [Camera fallback (QRScanner)](#9-camera-fallback-qrscanner)
10. [Result cards — child box](#10-result-cards--child-box)
11. [Result cards — master carton + actions](#11-result-cards--master-carton--actions)
12. [Sample and ecommerce trace result rendering](#12-sample-and-ecommerce-trace-result-rendering)
13. [Dispatch card rendering](#13-dispatch-card-rendering)
14. [Traceability page — deep-link via `?qr=`](#14-traceability-page--deep-link-via-qr)
15. [Invalid and not-found barcodes](#15-invalid-and-not-found-barcodes)
16. [Offline scan queue (/scan only)](#16-offline-scan-queue-scan-only)
17. [Transactions endpoint — Admin-only](#17-transactions-endpoint--admin-only)
18. [Per-role — all 4 roles can trace](#18-per-role--all-4-roles-can-trace)

---

## 1. RBAC — route authentication

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-001 | Unauthenticated | `GET /inventory/trace/:barcode` without token → 401 | P0 | `GET /api/v1/inventory/trace/CB123456` with no `Authorization` header. | HTTP 401; `{ success: false }`. | API | Route uses `router.use(authenticate)`. |
| TC-SCAN-002 | Unauthenticated | `GET /inventory/transactions` without token → 401 | P0 | `GET /api/v1/inventory/transactions` with no `Authorization` header. | HTTP 401. | API | |
| TC-SCAN-003 | Unauthenticated | `/scan` page redirects unauthenticated user | P0 | Navigate to `http://localhost:3000/scan` without a valid session. | Redirected to `/login` (or equivalent auth gate). No scan page content rendered. | E2E | `(dashboard)` layout enforces auth. |
| TC-SCAN-004 | Unauthenticated | `/traceability` page redirects unauthenticated user | P0 | Navigate to `http://localhost:3000/traceability` without a valid session. | Redirected to `/login`. | E2E | |
| TC-SCAN-005 | Admin | `/scan` nav item visible to Admin (no requiresPermission) | P1 | Login as Admin. Inspect sidebar nav. | "Scan & Trace" nav item is visible. | E2E | `NAV_ITEMS` entry has no `requiresPermission` field. |
| TC-SCAN-006 | Supervisor | `/scan` nav item visible to Supervisor | P1 | Login as Supervisor. Inspect sidebar nav. | "Scan & Trace" nav item is visible. | E2E | |
| TC-SCAN-007 | Warehouse Operator | `/scan` nav item visible to Warehouse Operator | P1 | Login as Warehouse Operator. Inspect sidebar nav. | "Scan & Trace" nav item is visible. | E2E | |
| TC-SCAN-008 | Dispatch Operator | `/scan` nav item visible to Dispatch Operator | P1 | Login as Dispatch Operator. Inspect sidebar nav. | "Scan & Trace" nav item is visible. | E2E | |

---

## 2. Barcode format — parseQRCode / normalization

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-010 | Admin | Short `CB######` format (child box) resolves correctly | P0 | 1. Create a child box; note its `barcode` (format `CB` + 6 Crockford chars). 2. `GET /api/v1/inventory/trace/<barcode>`. | HTTP 200; `childBox.barcode` matches the short format. `traceByBarcode` uses `UPPER($1)` — no prefix stripping required for short format. | API | `generateUniqueBarcode('CB', ...)` produces `CB######`. |
| TC-SCAN-011 | Admin | Short `MC######` format (master carton) resolves correctly | P0 | 1. Create a master carton; note `carton_barcode` (format `MC######`). 2. `GET /api/v1/inventory/trace/<barcode>`. | HTTP 200; `masterCarton.carton_barcode` matches. | API | |
| TC-SCAN-012 | Admin | Short `SR######` format (sample record barcode) returns 404 — sample records not in trace | P1 | 1. Obtain a `sample_barcode` (format `SR######`) from an existing sample record. 2. `GET /api/v1/inventory/trace/<sample_barcode>`. | HTTP 404. `traceByBarcode` only queries `child_boxes` (by `barcode`) and `master_cartons` (by `carton_barcode`); sample records are not traced. | API | ⚠ DISCREPANCY: SR/EC prefixed barcodes are not traceable via this endpoint. |
| TC-SCAN-013 | Admin | Short `EC######` format (ecommerce record barcode) returns 404 — not in trace | P1 | 1. Obtain an `ecommerce_barcode` (format `EC######`). 2. `GET /api/v1/inventory/trace/<ecommerce_barcode>`. | HTTP 404. Same reason as TC-SCAN-012. | API | AUTOMATION GAP: No spec currently covers SR/EC prefix 404 behaviour. |
| TC-SCAN-014 | Admin | Lowercase barcode input normalised to uppercase — resolves | P1 | 1. Note a valid child box barcode e.g. `CB3X7K2M`. 2. `GET /api/v1/inventory/trace/cb3x7k2m` (all lower). | HTTP 200; trace succeeds. Backend uses `UPPER($1)`. | API | |
| TC-SCAN-015 | Admin | Mixed-case barcode input resolves | P1 | 1. `GET /api/v1/inventory/trace/Cb3X7k2M`. | HTTP 200; same as TC-SCAN-014. | API | |
| TC-SCAN-016 | Admin | HIDScannerInput `.toUpperCase()` normalises scanner output before API call | P1 | 1. Navigate to `/scan`. 2. Simulate a HID scanner emitting lowercase `cb3x7k2m` (type each char manually to the input field; field is pre-focused). 3. Press Enter. | `submit()` in `HIDScannerInput` calls `code.trim().toUpperCase()` before passing to `onScan`. API receives `CB3X7K2M`. Trace succeeds. | E2E | `HIDScannerInput.tsx` line 49: `code.trim().toUpperCase()`. |
| TC-SCAN-017 | Admin | QRScanner camera also normalises to uppercase | P1 | 1. Toggle camera on `/scan`. 2. Scan a QR code that encodes lowercase barcode. | `QRScanner.tsx` line 37: `decodedText.trim().toUpperCase()` — same normalization as HID. Trace resolves. | E2E | |
| TC-SCAN-018 | Admin | Fake `BINNY-CB-001` legacy format returns 404 | P1 | 1. `GET /api/v1/inventory/trace/BINNY-CB-001-9999`. | HTTP 404. No `BINNY-*` format exists in current DB; `UPPER()` call succeeds but row is absent. | API | No legacy format in current codebase. Old phase-18 referenced these — stale. |

---

## 3. Trace child box — all statuses

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-020 | Admin | Trace GENERATED child box — returns status GENERATED, no masterCarton | P0 | 1. Create a child box via bulk creation (status = GENERATED). Note its `barcode`. 2. `GET /api/v1/inventory/trace/<barcode>`. | HTTP 200; `childBox.status: "GENERATED"`; `masterCarton` is null or absent; `timeline` contains `CHILD_CREATED`. | API | API does NOT auto-activate. Activation is frontend-only. |
| TC-SCAN-021 | Admin | Trace FREE child box — returns status FREE, no masterCarton | P0 | 1. Activate a child box. 2. `GET /api/v1/inventory/trace/<barcode>`. | HTTP 200; `childBox.status: "FREE"`; `masterCarton` is null; `timeline` contains `CHILD_CREATED` (and `CHILD_ACTIVATED` if activated explicitly). | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-CB-001. |
| TC-SCAN-022 | Admin | Trace PACKED child box — returns childBox + masterCarton | P0 | 1. Pack a FREE child box into a master carton. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "PACKED"`; `masterCarton` object present with `carton_barcode`, `status`, `child_count`, `max_capacity`; `timeline` contains `CHILD_PACKED`. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-CB-002. |
| TC-SCAN-023 | Admin | Trace SAMPLE child box — returns childBox.status = SAMPLE; no sampleRecord object | P0 | 1. Add a FREE child box to a sample record. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "SAMPLE"`; `timeline` contains `CHILD_SAMPLED`. **No `sampleRecord` key in response** — `traceByBarcode` does not query `sample_records`. `masterCarton` is null (box is not PACKED). | API | ⚠ DISCREPANCY: Sample record context not returned. UI child box card shows SAMPLE status badge only. |
| TC-SCAN-024 | Admin | Trace ECOMMERCE child box — returns childBox.status = ECOMMERCE; no ecommerceRecord object | P0 | 1. Add a FREE child box to an ecommerce record. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "ECOMMERCE"`; `timeline` contains `CHILD_ECOMMERCED`. **No `ecommerceRecord` key** in response. | API | Same discrepancy as TC-SCAN-023. |
| TC-SCAN-025 | Admin | Trace DISPATCHED child box — returns childBox + masterCarton + dispatch | P0 | 1. Complete a full dispatch: product → child box → pack → close carton → dispatch. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "DISPATCHED"`; `masterCarton.status: "DISPATCHED"`; `dispatch` object present with `dispatch_date`, `destination`; `timeline` contains `CHILD_DISPATCHED`. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-CB-003. |
| TC-SCAN-026 | Admin | Trace childBox — product fields embedded in childBox object | P1 | 1. `GET /api/v1/inventory/trace/<child_box_barcode>`. | `childBox` contains `article_name`, `article_code`, `sku`, `colour`, `size`, `mrp`, `category`, `section`, `location` (joined from `products` table in service). | API | `inventory.service.ts` lines 186–196: explicit column SELECT with product join. |

---

## 4. Trace master carton

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-030 | Admin | Trace CREATED (empty) master carton — returns carton, empty timeline | P1 | 1. Create a master carton with no boxes. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | HTTP 200; `masterCarton.status: "CREATED"`; `childBox` key absent; `timeline` may be empty or contain `CARTON_CREATED`; `dispatch` is null. | API | |
| TC-SCAN-031 | Admin | Trace ACTIVE master carton — returns carton with timeline | P0 | 1. Create master carton and pack ≥1 box. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | HTTP 200; `masterCarton.status: "ACTIVE"`; `childBox` absent; `timeline` contains `CARTON_CREATED`; `dispatch` null. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-MC-001. |
| TC-SCAN-032 | Admin | Trace CLOSED master carton — returns carton, no dispatch | P1 | 1. Close a master carton. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | HTTP 200; `masterCarton.status: "CLOSED"`; `dispatch` is null. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-MC-002. |
| TC-SCAN-033 | Admin | Trace DISPATCHED master carton — returns carton + dispatch record | P0 | 1. Dispatch a closed carton. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | HTTP 200; `masterCarton.status: "DISPATCHED"`; `dispatch` object present with `dispatch_date`, `destination`; timeline has `CARTON_DISPATCHED`. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-MC-003. |
| TC-SCAN-034 | Admin | Master carton timeline scoped to carton's `master_carton_id` — child box events not included | P1 | 1. Trace a master carton barcode (not a child box barcode). | `timeline` events have `master_carton_id` matching the carton. Events like `CHILD_PACKED` that have `master_carton_id` ARE included (they link to the carton). `CHILD_CREATED` / `CHILD_ACTIVATED` events (no `master_carton_id`) are NOT included. | API | `inventory.service.ts` line 251–253: timeline query uses `WHERE it.master_carton_id = $1`. |
| TC-SCAN-035 | Admin | Master carton trace — `childBox` key absent (not null, not empty object) | P1 | 1. `GET /api/v1/inventory/trace/<MC barcode>`. | Response body has no `childBox` key at all (server does not include it for carton traces). Frontend `traceResult.childBox` evaluates falsy; child box card NOT rendered. | API | `traceByBarcode` returns `{ masterCarton, dispatch, timeline }` — no `childBox` key. |

---

## 5. GENERATED auto-activation on scan (side-effect)

> ⚠ READ-WITH-SIDE-EFFECT: Scanning a GENERATED barcode on either `/scan` or `/traceability` triggers an immediate `POST /child-boxes/:id/activate` call from the frontend. This is a write operation embedded in a trace/read flow.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-040 | Admin | API trace of GENERATED box — no side-effect at API layer | P0 | 1. Create a GENERATED child box. 2. `GET /api/v1/inventory/trace/<barcode>` directly via API. 3. `GET /api/v1/child-boxes/<id>` to check status. | API trace returns `childBox.status: "GENERATED"`. Second GET confirms status still `GENERATED` — API trace does not activate. | API | Activation is frontend-only. Realised by `22-scan-trace.spec.ts` setup context. |
| TC-SCAN-041 | Admin | Scan GENERATED box on `/scan` — auto-activates, toast shown, status updates to FREE | P0 | 1. Create a GENERATED child box; note `barcode`. 2. Login as Admin, navigate to `/scan`. 3. Focus the HIDScannerInput and type the barcode; press Enter. | (a) Toast "Box activated — now part of available stock" appears. (b) Child Box card status badge updates to `FREE`. (c) API: `GET /api/v1/child-boxes/<id>` returns `status: "FREE"`. (d) `GET /api/v1/inventory/transactions?child_box_id=<id>` returns row with `transaction_type: "CHILD_ACTIVATED"` (requires Admin token — transactions endpoint is Admin-only). | E2E + Integration | `scan/page.tsx` lines 122–134. AUTOMATION GAP: not in any current spec. |
| TC-SCAN-042 | Admin | Scan GENERATED box on `/traceability` — auto-activates | P0 | 1. Create a GENERATED child box; note barcode. 2. Navigate to `/traceability`. 3. Type barcode in HIDScannerInput and press Enter. | Same activation behaviour as TC-SCAN-041: toast fires, status updates to FREE in child box card. | E2E + Integration | `traceability/page.tsx` lines 84–97. AUTOMATION GAP. |
| TC-SCAN-043 | Admin | Scan GENERATED box twice on `/scan` — activation is idempotent (one CHILD_ACTIVATED) | P0 | 1. Navigate to `/scan`. 2. Scan a GENERATED barcode → wait for activation toast. 3. Clear field; scan same barcode again. | Second scan: no activation toast (box is now FREE; `useEffect` guard condition `status === 'GENERATED'` is false). DB has exactly one `CHILD_ACTIVATED` row for this box. | E2E + Integration | `useEffect` dep array `[childBox.id, childBox.status]` prevents re-firing once status is FREE. |
| TC-SCAN-044 | Admin | Scan GENERATED box — timeline shows CHILD_CREATED then CHILD_ACTIVATED in order | P1 | 1. Create GENERATED box. 2. Scan on `/scan`. Wait for activation. 3. Scan same barcode again. Inspect timeline. | Timeline events in order: `CHILD_CREATED` (oldest), `CHILD_ACTIVATED` (newest). `performed_at` of CHILD_ACTIVATED > CHILD_CREATED. | E2E | AUTOMATION GAP. |
| TC-SCAN-045 | Admin | Activation failure (e.g. network error) handled silently — status stays GENERATED in UI | P2 | 1. Create GENERATED box. 2. In browser DevTools, intercept/block `POST /child-boxes/:id/activate`. 3. Scan GENERATED barcode on `/scan`. | No error toast for activation failure (`.catch(() => {})` is silent). Child box card shows `GENERATED` status. No crash. | E2E | `scan/page.tsx` line 130: `}).catch(() => { // Activation failed silently })`. |
| TC-SCAN-046 | Warehouse Operator | Warehouse Operator scanning a GENERATED box triggers activation (WH-Op has no `child_boxes:update`) | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/scan`. 3. Scan a GENERATED barcode. | ⚠ POTENTIAL ISSUE: WH-Op does NOT have `child_boxes:update` permission. `POST /child-boxes/:id/activate` is gated by `child_boxes:update`. Activation call returns 403. Frontend `.catch` swallows silently — UI shows GENERATED status, no error toast. No activation occurs. | E2E + Integration | AUTOMATION GAP. Frontend activates unconditionally regardless of user role. |
| TC-SCAN-047 | Dispatch Operator | Dispatch Operator scanning a GENERATED box — activation silently fails (no `child_boxes:update`) | P1 | Same as TC-SCAN-046 but for Dispatch Operator. | Same outcome: 403 on activate call, silent .catch, box stays GENERATED in UI. | E2E + Integration | AUTOMATION GAP. |
| TC-SCAN-048 | Admin | Pack GENERATED box via API → server auto-activates inline, trace timeline has CHILD_ACTIVATED + CHILD_PACKED | P1 | 1. Create a GENERATED child box. Do NOT scan it. 2. Create a master carton. 3. `POST /api/v1/master-cartons/pack` with the box. 4. `GET /api/v1/inventory/trace/<barcode>`. | `childBox.status: "PACKED"`; timeline contains `CHILD_ACTIVATED` followed by `CHILD_PACKED` (server-side activation during pack operation). | Integration | Server inline activation in `masterCarton.service.ts`. |

---

## 6. Timeline correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-050 | Admin | Timeline ordered ASC by `created_at` | P1 | 1. Create, activate, and pack a child box. 2. `GET /api/v1/inventory/trace/<barcode>`. | `timeline` array is sorted oldest-first (`ORDER BY it.created_at ASC` in service). `timeline[0].action` is `CHILD_CREATED`; subsequent entries are in chronological order. | API | `inventory.service.ts` line 221: `ORDER BY it.created_at ASC`. |
| TC-SCAN-051 | Admin | Timeline field mapping — `action` / `description` / `performed_by` / `performed_at` | P0 | 1. Trace any child box with ≥1 timeline event. | Each timeline event has: `action` (= `transaction_type`), `description` (= `notes`), `performed_by` (= `users.name` joined), `performed_at` (= `created_at`). No raw `transaction_type` or `notes` keys. | API | `inventory.service.ts` lines 219–222 alias columns. `07-traceability.spec.ts` TC-TRACE-LEGACY-002. |
| TC-SCAN-052 | Admin | Full lifecycle timeline — CREATED → ACTIVATED → PACKED → UNPACKED → PACKED → DISPATCHED | P0 | 1. Create box (GENERATED). 2. Activate. 3. Pack into carton A. 4. Unpack from A. 5. Pack into carton B. 6. Close B. 7. Dispatch B. 8. Trace child box barcode. | Timeline (in order): `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED`, `CHILD_UNPACKED`, `CHILD_PACKED` (second pack), `CHILD_DISPATCHED`. No `CHILD_REPACKED` event (standalone repack removed). | Integration | Standalone `/master-cartons/repack` deleted; box transfer = unpack + pack = two separate events. |
| TC-SCAN-053 | Admin | CHILD_SAMPLED in timeline after adding box to sample | P1 | 1. Add a child box to a sample. 2. Trace the box. | Timeline contains `CHILD_SAMPLED` event with `performed_by` and `performed_at`. | Integration | |
| TC-SCAN-054 | Admin | CHILD_UNSAMPLED in timeline after removing box from sample | P1 | 1. Add a child box to a sample. 2. Remove it. 3. Trace the box. | Timeline contains `CHILD_UNSAMPLED` event after `CHILD_SAMPLED`. | Integration | |
| TC-SCAN-055 | Admin | CHILD_ECOMMERCED in timeline after adding box to ecommerce | P1 | 1. Add box to ecommerce record. 2. Trace. | Timeline contains `CHILD_ECOMMERCED` event. | Integration | |
| TC-SCAN-056 | Admin | CHILD_UNECOMMERCED in timeline after removing box from ecommerce | P1 | 1. Add box to ecommerce. 2. Remove. 3. Trace. | Timeline contains `CHILD_UNECOMMERCED` event. | Integration | |
| TC-SCAN-057 | Admin | No `CHILD_REPACKED` transaction type — standalone repack removed | P1 | 1. Search `GET /api/v1/inventory/transactions?transaction_type=CHILD_REPACKED`. | HTTP 200; `data: []`, `total: 0`. `CHILD_REPACKED` is never written (standalone repack deleted). | API | Regression guard. |
| TC-SCAN-058 | Admin | Timeline `performed_by` is user's `name` (not user ID) | P1 | 1. Trace a child box. | Each event's `performed_by` is a human-readable name string, not a UUID. `LEFT JOIN users u ON u.id = it.performed_by` in service. | API | |
| TC-SCAN-059 | Admin | Empty timeline renders "No timeline events available" on `/scan` | P2 | This is an edge case — in practice `CHILD_CREATED` is always written on creation. To test: manually delete the transaction row from DB or mock API to return `timeline: []`. Observe `/scan` page. | UI renders `"No timeline events available"` placeholder text inside the Timeline card. | Manual | `scan/page.tsx` lines 389–393. |

---

## 7. HID-first UX — /scan page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-060 | Admin | `/scan` page loads with HIDScannerInput auto-focused | P0 | 1. Navigate to `/scan`. 2. Observe the input element. | `HIDScannerInput` mounts with `autoFocus`; the underlying `<input>` element is focused on mount (`useEffect` calls `inputRef.current?.focus()`). | E2E | `HIDScannerInput.tsx` lines 63–66. AUTOMATION GAP: `spec 08` tests stale element names. |
| TC-SCAN-061 | Admin | Green "Scanner ready" badge visible when input is focused | P0 | 1. Navigate to `/scan`. 2. Observe the badge beside "Barcode Scanner" label. | Badge shows "Scanner ready" text with green styling (`bg-green-50 text-green-700 border-green-200`) and animated `CheckCircle2` icon when input has focus. When unfocused, shows "Click to focus" in grey. | E2E | `HIDScannerInput.tsx` lines 159–177. AUTOMATION GAP. |
| TC-SCAN-062 | Admin | Enter key on focused HIDScannerInput triggers trace | P0 | 1. Navigate to `/scan`. 2. HIDScannerInput is focused. 3. Type a valid barcode. 4. Press Enter. | `handleKeyDown` fires `submit()` with the DOM value (not React state, to handle HID burst). Lookup starts; result card appears or "Item not found" toast. Input is cleared and refocused. | E2E | `HIDScannerInput.tsx` lines 118–128. Realised by `08-scan.spec.ts` TC-SCANTRACE-004. |
| TC-SCAN-063 | Admin | After successful scan, input is cleared and refocused automatically | P1 | 1. Scan a valid barcode on `/scan`. | Post-`submit()`: `inputRef.current.value = ''`, `setValue('')`, then `requestAnimationFrame(() => inputRef.current?.focus())`. Ready for next scan without manual clear. | E2E | `HIDScannerInput.tsx` lines 52–57. AUTOMATION GAP. |
| TC-SCAN-064 | Admin | Global keydown listener captures chars when input is NOT focused (focus-drift recovery) | P1 | 1. Navigate to `/scan`. 2. Click elsewhere on the page (unfocus input). 3. Begin typing a barcode. | Global `keydown` handler appends chars to input DOM value and calls `.focus()`. Entire barcode captured without losing leading characters. | E2E | `HIDScannerInput.tsx` lines 76–116. Key fix: chars appended to `dom.value` before `focus()` — no leading-char loss. AUTOMATION GAP. |
| TC-SCAN-065 | Admin | Global keydown does NOT hijack input when another editable element is active | P1 | 1. Navigate to `/scan`. 2. Click another input on the page (if any, e.g. a search/filter). 3. Type characters. | `isOtherEditable` check (lines 88–93) prevents global handler from intercepting. Characters go to the focused element, not the scanner input. | E2E | AUTOMATION GAP. |
| TC-SCAN-066 | Admin | "Use Camera Instead" button toggles camera panel | P1 | 1. Navigate to `/scan`. 2. Click "Use Camera Instead". | `fullScreen` state toggles; `QRScanner` component renders inline below the HIDScannerInput. Button text may change to "Use Camera Instead" (toggle). `fullScreen` prop passed to QRScanner is `false` (not fullscreen mode). | E2E | `scan/page.tsx` lines 179–198. |
| TC-SCAN-067 | Admin | `/scan` page header shows pending sync badge when offline scans queued | P1 | 1. Simulate offline. 2. Scan a barcode (redirects to offline queue). 3. Go back online; observe pending badge. | `pendingCount > 0` renders `<Badge>N scan(s) pending sync</Badge>` in `PageHeader` action slot. | E2E | `useOfflineScanQueue` hook. Realised by stale TC-SCAN-033 (offline). |
| TC-SCAN-068 | Admin | "Clear & Scan Another" button resets traceResult, cartonDetail, and barcode state | P1 | 1. Scan a valid barcode. Wait for result. 2. Click "Clear & Scan Another". | `handleReset` sets `traceResult = null`, `cartonDetail = null`, `barcode = ''`. Empty-state card re-appears. | E2E | `scan/page.tsx` lines 148–152. Realised by `22-scan-trace.spec.ts` TC-SCAN-E2E-005. |

---

## 8. HID-first UX — /traceability page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-070 | Admin | `/traceability` page loads with HIDScannerInput auto-focused | P0 | 1. Navigate to `/traceability`. | `HIDScannerInput` has `autoFocus`; `<input>` is focused on mount. Green "Scanner ready" badge visible. | E2E | `traceability/page.tsx` line 116, 122. |
| TC-SCAN-071 | Admin | Enter key on `/traceability` HIDScannerInput triggers trace | P0 | 1. Navigate to `/traceability`. 2. Type a valid barcode. 3. Press Enter. | `onScan` callback calls `setQrCode` then `trace(code)`. Result cards render. | E2E | `traceability/page.tsx` lines 116–119. |
| TC-SCAN-072 | Admin | `/traceability` camera toggle: "Use Camera Instead" / "Hide Camera" | P1 | 1. Click "Use Camera Instead". | `showScanner` state becomes true; `QRScanner` with `autoStart` renders. Button label changes to "Hide Camera". 2. Click "Hide Camera" — scanner hidden. | E2E | `traceability/page.tsx` lines 126–138. |
| TC-SCAN-073 | Admin | `/traceability` does NOT have offline queue / pending badge | P2 | 1. Navigate to `/traceability`. 2. Inspect page header. | No pending-sync badge in page header; `useOfflineScanQueue` is not imported on traceability page. | E2E | Offline handling is `/scan`-only. |

---

## 9. Camera fallback (QRScanner)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-075 | Warehouse Operator | Camera scanner on `/scan` — start/stop works | P1 | 1. Navigate to `/scan` as Warehouse Operator. 2. Click "Use Camera Instead". 3. Grant camera permission. | `QRScanner` renders; camera stream starts; `isScanning` becomes true; camera icon in view. | E2E | Requires real/mock camera. |
| TC-SCAN-076 | Admin | Camera scan success normalises barcode uppercase and triggers trace | P1 | 1. Enable camera on `/scan`. 2. Present a QR code encoding lowercase `cb######`. | `QRScanner.handleScanSuccess` normalises to uppercase, calls `onScanSuccess`. `handleScan` sets barcode and calls `lookup`. Result renders. | E2E | `QRScanner.tsx` line 37. |
| TC-SCAN-077 | Admin | Camera deduplicates identical consecutive scans (2-second cooldown) | P2 | 1. Enable camera. 2. Present the same QR code twice within 2 seconds. | Second scan triggers `triggerError()` but does NOT call `onScanSuccess` again. `lastScanned` guard prevents duplicate trace. | E2E | `QRScanner.tsx` lines 36–42: `if (normalized === lastScanned) { triggerError(); return; }`. |
| TC-SCAN-078 | Admin | QRScanner on `/traceability` has `autoStart` prop — starts scanning immediately when shown | P2 | 1. Navigate to `/traceability`. 2. Click "Use Camera Instead". | QRScanner renders with `autoStart` prop. Camera starts without additional user click. | E2E | `traceability/page.tsx` line 137: `<QRScanner onScanSuccess={handleScan} autoStart />`. |

---

## 10. Result cards — child box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-080 | Admin | Child box card shows: Barcode, Product, SKU, Size/Colour, MRP, Status, Created | P0 | 1. Scan any child box barcode on `/scan`. | Card renders with all field labels and values: Barcode (mono font), Product (article_name), SKU, Size / Colour, MRP (formatted currency), Status (StatusBadge), Created (formatted datetime). | E2E | `scan/page.tsx` lines 224–254. Partially realised by `08-scan.spec.ts` TC-SCANTRACE-007. |
| TC-SCAN-081 | Admin | Same child box card fields on `/traceability` | P0 | 1. Trace any child box barcode on `/traceability`. | Same fields rendered (Barcode, Product, SKU, Size/Colour, MRP, Status). Note: `/traceability` card has NO "Created" field (unlike `/scan`). | E2E | `traceability/page.tsx` lines 152–180. |
| TC-SCAN-082 | Admin | GENERATED status box shows GENERATED badge before auto-activation | P1 | 1. Create GENERATED box. 2. Immediately inspect card on `/scan` before activation completes. | StatusBadge briefly shows "GENERATED". After `childBoxService.activate()` resolves, badge updates to "FREE". | E2E | Depends on activation latency. AUTOMATION GAP. |
| TC-SCAN-083 | Admin | MRP formatted as currency (₹) | P1 | 1. Scan a child box. | MRP field shows `formatCurrency(Number(mrp))` — e.g. `₹299`. | E2E | `formatCurrency` from `@/lib/utils`. |

---

## 11. Result cards — master carton + actions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-090 | Admin | Master carton card shows: Carton Barcode, Boxes (N/max), Status | P0 | 1. Scan a master carton barcode on `/scan`. | Master Carton card renders with `carton_barcode` (mono), `child_count / max_capacity`, StatusBadge. | E2E | `scan/page.tsx` lines 258–280. Realised by `08-scan.spec.ts` TC-SCANTRACE-008. |
| TC-SCAN-091 | Admin | ACTIVE carton: child box list + "Seal for Storage" button shown | P0 | 1. Scan an ACTIVE master carton barcode on `/scan`. | Carton card shows child boxes list (up to 200px scrollable). "Seal for Storage" and "Clear" buttons visible. `cartonDetail` fetched via `masterCartonService.getByBarcode`. | E2E | `scan/page.tsx` lines 300–316. Realised by `08-scan.spec.ts` TC-SCANTRACE-009. |
| TC-SCAN-092 | Admin | "Seal for Storage" click closes ACTIVE carton | P0 | 1. Scan ACTIVE carton. 2. Click "Seal for Storage". | Button shows loading spinner (`isClosing = true`). On success: toast "Carton sealed and stored successfully". `lookup(barcode)` re-fetched. Carton card now shows CLOSED status + Sealed & Stored panel. | E2E | `scan/page.tsx` lines 136–146, 309–316. |
| TC-SCAN-093 | Admin | CLOSED carton: "Sealed & Stored" green panel shown, no action buttons | P1 | 1. Scan a CLOSED master carton on `/scan`. | Green panel with CheckCircle icon, "Sealed & Stored" heading, "This carton is sealed and ready for dispatch." text. No "Seal for Storage" button. | E2E | `scan/page.tsx` lines 318–325. Realised by stale TC-SCAN-019. |
| TC-SCAN-094 | Admin | DISPATCHED carton: "Already Dispatched" grey panel shown, no action buttons | P1 | 1. Scan a DISPATCHED master carton on `/scan`. | Grey panel with Truck icon, "Already Dispatched" heading, "This carton has been dispatched." text. | E2E | `scan/page.tsx` lines 326–334. Realised by stale TC-SCAN-021. |
| TC-SCAN-095 | Admin | CREATED (empty) carton: "Empty Carton" yellow panel shown | P1 | 1. Scan a CREATED (0 boxes) master carton on `/scan`. | Yellow panel with Archive icon, "Empty Carton" heading, "No boxes packed yet. Pack boxes first." text. | E2E | `scan/page.tsx` lines 335–343. Realised by stale TC-SCAN-022. |
| TC-SCAN-096 | Admin | Master carton card on `/traceability` shows same fields but NO action buttons | P1 | 1. Trace a master carton on `/traceability`. | Carton card renders (Carton Barcode, Boxes, Status). No "Seal for Storage", no action panels — `/traceability` does not fetch `cartonDetail` and has no action handlers. | E2E | `traceability/page.tsx` lines 184–208. |
| TC-SCAN-097 | Dispatch Operator | Dispatch Operator can see "Seal for Storage" button (no permission check on action visibility) | P1 | 1. Login as Dispatch Operator. 2. Scan ACTIVE carton on `/scan`. | "Seal for Storage" button is visible (UI renders it based only on `cartonDetail.carton.status === 'ACTIVE'`, not on permissions). Button click calls `masterCartonService.close()` → `cartons:close` permission; Dispatch Op lacks `cartons:close` → API returns 403 → error toast. | E2E + Integration | AUTOMATION GAP: UI does not guard action by `useCan('cartons:close')`. |

---

## 12. Sample and ecommerce trace result rendering

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-100 | Admin | Trace SAMPLE child box on `/scan` — child box card shows SAMPLE status badge; no sample-record card | P0 | 1. Add a FREE box to a sample record (status becomes SAMPLE). 2. Scan the child box barcode on `/scan`. | Child Box card renders with `status: SAMPLE` badge. No "Sample Record" card. No `sampleRecord` key in API response. | E2E | ⚠ DISCREPANCY: `traceByBarcode` does not return sample record context. |
| TC-SCAN-101 | Admin | Trace ECOMMERCE child box on `/scan` — child box card shows ECOMMERCE badge; no ecommerce-record card | P0 | 1. Add a FREE box to an ecommerce record. 2. Scan on `/scan`. | Child Box card shows `status: ECOMMERCE` badge. No "E-commerce Record" card. | E2E | Same discrepancy as TC-SCAN-100. |
| TC-SCAN-102 | Admin | Trace SAMPLE box on `/traceability` — same — child box card only | P1 | 1. Trace a SAMPLE box barcode on `/traceability`. | Child Box card with SAMPLE badge. No additional sample record card rendered. | E2E | |
| TC-SCAN-103 | Admin | Trace ECOMMERCE box on `/traceability` — child box card only | P1 | 1. Trace an ECOMMERCE box barcode on `/traceability`. | Child Box card with ECOMMERCE badge. No ecommerce record card. | E2E | |
| TC-SCAN-104 | Admin | Sample record barcode (`SR######`) returns 404 from trace endpoint | P1 | 1. Get a `sample_barcode` from `GET /api/v1/samples`. 2. `GET /api/v1/inventory/trace/<sample_barcode>`. | HTTP 404. `traceByBarcode` only queries `child_boxes.barcode` and `master_cartons.carton_barcode` — `SR` prefix barcodes stored in `sample_records.sample_barcode` are not searched. | API | ⚠ DISCREPANCY: Scanning an SR barcode gives "Item not found" error. |
| TC-SCAN-105 | Admin | Ecommerce record barcode (`EC######`) returns 404 from trace endpoint | P1 | 1. Get an `ecommerce_barcode`. 2. Trace it. | HTTP 404. Same reason as TC-SCAN-104. | API | AUTOMATION GAP. |

---

## 13. Dispatch card rendering

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-110 | Admin | Dispatch card renders on `/scan` when child box is DISPATCHED | P1 | 1. Scan a dispatched child box barcode on `/scan`. | Dispatch card (purple icon) renders with: Destination, Vehicle (if set), Dispatch Date (formatted). | E2E | `scan/page.tsx` lines 350–381. |
| TC-SCAN-111 | Admin | Dispatch card renders on `/traceability` for dispatched child box | P1 | 1. Trace a dispatched child box on `/traceability`. | Same card appears. `dispatch_number` field shown if present. | E2E | `traceability/page.tsx` lines 210–240. |
| TC-SCAN-112 | Admin | Dispatch card renders on `/scan` for dispatched master carton | P1 | 1. Scan a dispatched master carton barcode. | Dispatch card renders with destination, vehicle, date. | E2E | |
| TC-SCAN-113 | Admin | No dispatch card when item is not yet dispatched | P1 | 1. Scan a FREE or PACKED child box. | `traceResult.dispatch` is null/absent. Dispatch card does NOT render. | E2E | Conditional render: `{traceResult.dispatch && (...)`. |

---

## 14. Traceability page — deep-link via `?qr=`

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-120 | Admin | `?qr=<valid_barcode>` auto-traces on page load | P1 | Navigate to `http://localhost:3000/traceability?qr=<valid_barcode>`. | `useSearchParams` reads `qr` param; `setQrCode` and `trace(qr)` called in `useEffect`. Result cards render automatically without user clicking anything. HIDScannerInput pre-populated with barcode. | E2E | `traceability/page.tsx` lines 57, 76–82. |
| TC-SCAN-121 | Admin | `?qr=<invalid_barcode>` shows error toast on load | P1 | Navigate to `http://localhost:3000/traceability?qr=INVALID-XYZ`. | Error toast "Item not found in system" fires automatically. No result cards rendered. | E2E | |
| TC-SCAN-122 | Admin | No `?qr=` param — empty state shown, no auto-trace | P1 | Navigate to `http://localhost:3000/traceability` (no query param). | Empty state card "Trace an Item" with description shown. No API call triggered. | E2E | |
| TC-SCAN-123 | Admin | `?qr=` param updates if navigated with new param | P2 | 1. Open `/traceability?qr=<barcode1>`. 2. Navigate to `/traceability?qr=<barcode2>`. | `useEffect` dep on `[searchParams, trace]` re-fires. `qrCode` updates; second trace executes. New result replaces old. | E2E | AUTOMATION GAP. |

---

## 15. Invalid and not-found barcodes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-130 | Admin | Non-existent barcode — API returns 404 | P0 | `GET /api/v1/inventory/trace/CB000000` (valid format but non-existent). | HTTP 404; `{ success: false, message: "No child box or master carton found with barcode: CB000000" }`. | API | Realised by `22-scan-trace.spec.ts` TC-TRACE-CB-005. |
| TC-SCAN-131 | Admin | `/scan` — invalid barcode shows "Item not found in system" toast | P0 | 1. Navigate to `/scan`. 2. Enter `INVALID-XYZ` in HIDScannerInput. Press Enter. | Toast "Item not found in system" appears. No result card. `isSearching` clears. | E2E | `scan/page.tsx` line 107. Realised by `22-scan-trace.spec.ts` TC-SCAN-E2E-004. |
| TC-SCAN-132 | Admin | `/traceability` — invalid barcode shows "Item not found in system" toast | P0 | 1. Navigate to `/traceability`. 2. Enter invalid barcode. Press Enter. | Toast "Item not found in system". `result` state set to null. | E2E | `traceability/page.tsx` line 69. |
| TC-SCAN-133 | Admin | Empty/blank input — `submit()` returns early, no API call | P1 | 1. Navigate to `/scan`. 2. Press Enter without typing anything. | `submit()` checks `trimmed.length < minLength (1)` — returns early. No API call made. No toast. | E2E | `HIDScannerInput.tsx` line 50. |
| TC-SCAN-134 | Admin | URL-encoded barcode (spaces) — server handles gracefully | P1 | `GET /api/v1/inventory/trace/CB%20000001` (space in barcode). | HTTP 404 (not found) or Express URL decodes and queries `CB 000001` which does not exist. No 500 error. | API | |
| TC-SCAN-135 | Admin | SQL special characters in barcode — parameterised query prevents injection | P1 | `GET /api/v1/inventory/trace/'; DROP TABLE child_boxes;--`. | HTTP 404 or 400. No DB error. Server does not crash. Parameterised queries in `inventory.service.ts` prevent injection. | API | |
| TC-SCAN-136 | Admin | Very long barcode (1000+ chars) — no server crash | P2 | `GET /api/v1/inventory/trace/<1000-char string>`. | HTTP 404. No 500. | API | |

---

## 16. Offline scan queue (/scan only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-140 | Admin | Offline scan saves to queue and shows toast | P1 | 1. Navigate to `/scan`. 2. Disable network (DevTools). 3. Enter barcode, press Enter. | `!navigator.onLine` branch: `addPendingScan(code, 'trace')` called; toast "Saved offline — will sync when back online" (📡 icon); `isSearching` cleared. | E2E | `scan/page.tsx` lines 83–88. |
| TC-SCAN-141 | Admin | Pending count badge shown in header when queue > 0 | P1 | 1. Queue ≥1 offline scan (as above). 2. Observe page header. | `pendingCount > 0` → Badge shows "N scan(s) pending sync" in orange. | E2E | `scan/page.tsx` lines 160–163. |
| TC-SCAN-142 | Admin | `/traceability` has no offline support — error shown when offline | P2 | 1. Navigate to `/traceability`. 2. Disable network. 3. Enter barcode, press Enter. | `trace()` calls `inventoryService.trace()` directly; no offline branch. Network error thrown → toast "Item not found in system" (generic catch). | E2E | `/traceability` has no `useOfflineScanQueue`. |

---

## 17. Transactions endpoint — Admin-only

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-150 | Admin | GET /inventory/transactions — Admin gets 200 paginated list | P0 | Login as Admin. `GET /api/v1/inventory/transactions`. | HTTP 200; `{ success: true, data: { data: [...], total: N } }` (or similar). Each row has `transaction_type`, `performed_by`, `created_at`. | API | `inventory.routes.ts` line 15: `authorizePermission('inventory:read')`. |
| TC-SCAN-151 | Supervisor | GET /inventory/transactions — Supervisor gets 403 | P0 | Login as Supervisor. `GET /api/v1/inventory/transactions`. | HTTP 403. Supervisor does NOT hold `inventory:read` permission. | API | ⚠ DISCREPANCY vs old file (stated 200). |
| TC-SCAN-152 | Warehouse Operator | GET /inventory/transactions — Warehouse Operator gets 403 | P0 | Login as Warehouse Operator. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | ⚠ DISCREPANCY vs old file (TC-SCAN-044 stated 200 for WH-Op). |
| TC-SCAN-153 | Dispatch Operator | GET /inventory/transactions — Dispatch Operator gets 403 | P0 | Login as Dispatch Operator. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | |
| TC-SCAN-154 | Admin | Filter transactions by transaction_type | P1 | `GET /api/v1/inventory/transactions?transaction_type=CHILD_ACTIVATED`. | HTTP 200; all rows have `transaction_type: "CHILD_ACTIVATED"`. | API | |
| TC-SCAN-155 | Admin | Filter transactions by child_box_id | P1 | `GET /api/v1/inventory/transactions?child_box_id=<uuid>`. | HTTP 200; all rows for that box. | API | |
| TC-SCAN-156 | Admin | Filter transactions by performed_by (user ID) | P1 | `GET /api/v1/inventory/transactions?performed_by=<user_uuid>`. | HTTP 200; rows filtered to that user. | API | `inventory.service.ts` line 149. |
| TC-SCAN-157 | Admin | Filter transactions by date range — empty range returns 0 | P1 | `GET /api/v1/inventory/transactions?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; `data: []`, `total: 0`. | API | |
| TC-SCAN-158 | Admin | Pagination — page and limit params work | P1 | `GET /api/v1/inventory/transactions?page=2&limit=5`. | HTTP 200; ≤5 rows returned; `total` reflects full count. | API | |
| TC-SCAN-159 | Admin | Transactions ordered DESC by created_at (most recent first) | P1 | `GET /api/v1/inventory/transactions`. | `data[0].created_at` ≥ `data[1].created_at`. | API | `inventory.service.ts` line 177: `ORDER BY created_at DESC`. |

---

## 18. Per-role — all 4 roles can trace

> `/inventory/trace/:barcode` is gated only by `authenticate` middleware (no `authorizePermission`). All four authenticated roles receive 200 for valid barcodes.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SCAN-160 | Admin | Admin can trace valid child box barcode | P0 | Login as Admin. `GET /api/v1/inventory/trace/<valid_cb_barcode>`. | HTTP 200; full trace result. | API | |
| TC-SCAN-161 | Supervisor | Supervisor can trace valid child box barcode | P0 | Login as Supervisor. `GET /api/v1/inventory/trace/<valid_cb_barcode>`. | HTTP 200; full trace result. | API | |
| TC-SCAN-162 | Warehouse Operator | Warehouse Operator can trace valid child box barcode | P0 | Login as Warehouse Operator. `GET /api/v1/inventory/trace/<valid_cb_barcode>`. | HTTP 200; full trace result. | API | |
| TC-SCAN-163 | Dispatch Operator | Dispatch Operator can trace valid child box barcode | P0 | Login as Dispatch Operator. `GET /api/v1/inventory/trace/<valid_cb_barcode>`. | HTTP 200; full trace result. | API | |
| TC-SCAN-164 | Admin | Admin can trace valid master carton barcode | P0 | Login as Admin. `GET /api/v1/inventory/trace/<valid_mc_barcode>`. | HTTP 200; masterCarton present. | API | |
| TC-SCAN-165 | Supervisor | Supervisor can trace master carton barcode | P0 | Login as Supervisor. `GET /api/v1/inventory/trace/<valid_mc_barcode>`. | HTTP 200. | API | |
| TC-SCAN-166 | Warehouse Operator | Warehouse Operator can trace master carton barcode | P0 | Login as Warehouse Operator. `GET /api/v1/inventory/trace/<valid_mc_barcode>`. | HTTP 200. | API | |
| TC-SCAN-167 | Dispatch Operator | Dispatch Operator can trace master carton barcode | P0 | Login as Dispatch Operator. `GET /api/v1/inventory/trace/<valid_mc_barcode>`. | HTTP 200. | API | |
| TC-SCAN-168 | Admin | Admin can navigate to `/scan` page and see full result | P0 | Login as Admin; navigate to `/scan`; enter valid barcode. | Page loads, result renders. | E2E | Realised by `22-scan-trace.spec.ts` TC-SCAN-E2E-001/003. |
| TC-SCAN-169 | Supervisor | Supervisor can navigate to `/scan` page | P0 | Login as Supervisor; navigate to `/scan`. | Page loads with scanner UI. | E2E | AUTOMATION GAP (spec only tests Admin). |
| TC-SCAN-170 | Warehouse Operator | Warehouse Operator can navigate to `/scan` page | P0 | Login as Warehouse Operator; navigate to `/scan`. | Page loads with scanner UI. | E2E | AUTOMATION GAP. |
| TC-SCAN-171 | Dispatch Operator | Dispatch Operator can navigate to `/scan` page | P0 | Login as Dispatch Operator; navigate to `/scan`. | Page loads with scanner UI. | E2E | AUTOMATION GAP. |
| TC-SCAN-172 | Admin | Admin can navigate to `/traceability` page | P0 | Login as Admin; navigate to `/traceability`. | Page loads; HIDScannerInput visible. | E2E | Realised by `07-traceability.spec.ts` TC-TRACE-LEGACY-001. |
| TC-SCAN-173 | Supervisor | Supervisor can navigate to `/traceability` | P0 | Login as Supervisor; navigate to `/traceability`. | Page loads. | E2E | AUTOMATION GAP. |
| TC-SCAN-174 | Warehouse Operator | Warehouse Operator can navigate to `/traceability` | P0 | Login as Warehouse Operator; navigate to `/traceability`. | Page loads. | E2E | AUTOMATION GAP. |
| TC-SCAN-175 | Dispatch Operator | Dispatch Operator can navigate to `/traceability` | P0 | Login as Dispatch Operator; navigate to `/traceability`. | Page loads. | E2E | AUTOMATION GAP. |
