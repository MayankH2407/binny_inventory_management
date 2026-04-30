# Phase 18 — Scan & Traceability

**Module codes:** `SCAN`
**Roles under test:** All four roles (all authenticated users can access scan and traceability).
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URLs:** `http://localhost:3000/scan` (Scan & Trace page), `http://localhost:3000/traceability` (Traceability page)
**Primary trace endpoint:** `GET /api/v1/inventory/trace/:barcode`
**Transactions endpoint:** `GET /api/v1/inventory/transactions`
**Activate endpoint:** `POST /api/v1/child-boxes/:id/activate`

**Auto-activate behaviour (Apr 27 mod):**
Both `/scan` (`scan/page.tsx` lines 122–134) and `/traceability` (`traceability/page.tsx` lines 85–97) contain a guarded `useEffect`: if the API returns a child box with `status === 'GENERATED'`, the page immediately calls `childBoxService.activate(boxId)` and updates local state, then toasts `"Box activated — now part of available stock"`. The guard is `[result?.childBox?.id, result?.childBox?.status]` — effect re-fires only when `id` or `status` changes, preventing infinite loops.

**Transaction types visible in timeline (from `constants.ts`):**
`CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED`, `CHILD_UNPACKED`, `CHILD_REPACKED`, `CHILD_SAMPLED`, `CHILD_UNSAMPLED`, `CHILD_ECOMMERCED`, `CHILD_UNECOMMERCED`, `CHILD_DISPATCHED`, `CARTON_CREATED`, `CARTON_CLOSED`, `CARTON_REOPENED`, `CARTON_DISPATCHED`, `SAMPLE_CREATED`, `SAMPLE_CLOSED`, `SAMPLE_REOPENED`, `SAMPLE_DISPATCHED`, `ECOMMERCE_CREATED`, `ECOMMERCE_CLOSED`, `ECOMMERCE_REOPENED`, `ECOMMERCE_DISPATCHED`.

**Timeline field mapping (from `inventory.service.ts`):**
`it.transaction_type` → `action`, `it.notes` → `description`, `u.name` → `performed_by`, `it.created_at` → `performed_at`, `it.metadata` → `metadata`.

**Dependencies:** Phases 05 (products), 07/08 (child boxes), 10 (master cartons), 11 (samples), 12 (ecommerce), 13 (dispatch).

---

## Barcode lookup — child box (all statuses)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-001 | Admin | Trace a FREE child box — returns box details and timeline | P0 | 1. Create a child box via `POST /api/v1/child-boxes` (or use existing FREE box). Note its `barcode`. 2. Login as Admin, obtain token. 3. `GET /api/v1/inventory/trace/<barcode>` with `Authorization: Bearer <admin_token>`. | HTTP 200; body has `childBox.status: "FREE"`, `childBox.barcode` matches input, `childBox.article_name` populated, `timeline` array with at least 1 entry (`CHILD_CREATED`); `masterCarton` is null; `dispatch` is null. | API | |
| TC-SCAN-002 | Admin | Trace a PACKED child box — returns box + master carton details | P0 | 1. Pack a child box into a master carton. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "PACKED"`; `masterCarton` object populated with `carton_barcode`, `status`, `child_count`, `max_capacity`; `timeline` includes `CHILD_CREATED` and `CHILD_PACKED` events. | API | |
| TC-SCAN-003 | Admin | Trace a SAMPLE child box — returns box + timeline with CHILD_SAMPLED | P0 | 1. Add a FREE child box to a sample record. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "SAMPLE"`; `timeline` includes `CHILD_SAMPLED` event; `action` field equals `"CHILD_SAMPLED"`; `performed_by` name is present. | API | |
| TC-SCAN-004 | Admin | Trace an ECOMMERCE child box — returns box + timeline with CHILD_ECOMMERCED | P0 | 1. Add a FREE child box to an ecommerce record. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "ECOMMERCE"`; `timeline` includes `CHILD_ECOMMERCED` event. | API | |
| TC-SCAN-005 | Admin | Trace a DISPATCHED child box — returns box + master carton + dispatch details | P0 | 1. Complete a full dispatch flow: create product → child box → pack → close carton → dispatch. 2. `GET /api/v1/inventory/trace/<child_box_barcode>`. | HTTP 200; `childBox.status: "DISPATCHED"`; `masterCarton.status: "DISPATCHED"`; `dispatch` object has `dispatch_date`, `destination`; `timeline` includes `CHILD_DISPATCHED` event. | API | |
| TC-SCAN-006 | Warehouse Operator | Warehouse Operator can trace barcodes | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/inventory/trace/<valid_barcode>`. | HTTP 200; full trace result returned. | API | All roles can trace. |
| TC-SCAN-007 | Dispatch Operator | Dispatch Operator can trace barcodes | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/inventory/trace/<valid_barcode>`. | HTTP 200; full trace result returned. | API | |

---

## GENERATED child box auto-activation on scan (Apr 27 mod)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-008 | Admin | Scan GENERATED child box via API — status remains GENERATED at API layer | P0 | 1. Create a child box via `POST /api/v1/child-boxes/bulk-upload` CSV (produces GENERATED boxes). Note a barcode. 2. `GET /api/v1/inventory/trace/<barcode>`. | HTTP 200; `childBox.status: "GENERATED"` in the trace response (the API does NOT auto-activate; activation is frontend-triggered). | API | Auto-activation is frontend-only. Backend `/activate` must be called explicitly. |
| TC-SCAN-009 | Admin | Scan GENERATED box on /scan page — box auto-activates to FREE | P0 | 1. Create a GENERATED child box. Note its barcode. 2. Login to frontend as Admin. 3. Navigate to `/scan`. 4. Enter the barcode in the Manual Entry field. Press Enter or click "Look Up". | (a) A "Box activated — now part of available stock" toast appears. (b) The status badge in the "Child Box" card updates to `FREE`. (c) `GET /api/v1/child-boxes/<id>` (via API) returns `status: "FREE"`. (d) `GET /api/v1/inventory/transactions?child_box_id=<id>` returns a row with `transaction_type: "CHILD_ACTIVATED"`. | E2E + Integration | |
| TC-SCAN-010 | Admin | Scan GENERATED box on /traceability page — box auto-activates to FREE | P0 | 1. Create a GENERATED child box. 2. Navigate to `/traceability`. 3. Enter the barcode. Press Enter or click "Trace". | Same assertions as TC-SCAN-009: toast fires, status updates to FREE, DB has CHILD_ACTIVATED transaction. | E2E + Integration | |
| TC-SCAN-011 | Admin | Scan GENERATED box twice on /scan — activation idempotent (single CHILD_ACTIVATED row) | P0 | 1. Navigate to `/scan`. Enter a GENERATED barcode. Wait for auto-activation toast. 2. Clear and enter the same barcode again. | Second scan: no second activation toast (box is now FREE). After both scans, `GET /api/v1/inventory/transactions?child_box_id=<id>` returns exactly one `CHILD_ACTIVATED` row (not two). | E2E + Integration | Guard uses `[result?.childBox?.id, result?.childBox?.status]`. After first scan status is FREE, useEffect does not re-fire for activation. |
| TC-SCAN-012 | Admin | Scan GENERATED box — traceability timeline shows CHILD_CREATED then CHILD_ACTIVATED | P1 | 1. Create a GENERATED box. 2. On `/scan`, scan or enter the barcode, wait for activation. 3. Enter the same barcode again and inspect the timeline. | Timeline contains exactly 2 events in order: first `CHILD_CREATED`, then `CHILD_ACTIVATED`; `performed_at` of CHILD_ACTIVATED is after CHILD_CREATED. | E2E | |
| TC-SCAN-013 | Admin | Pack a GENERATED box directly into a master carton — server auto-activates and writes both transactions | P0 | 1. Create a GENERATED child box (do NOT scan it first). Note its barcode. Resolve its `child_box_id` UUID via `GET /api/v1/child-boxes/qr/<barcode>`. 2. Create a master carton, note its `master_carton_id` UUID. 3. `POST /api/v1/master-cartons/pack` with body `{"child_box_id": "<child_box_uuid>", "master_carton_id": "<carton_uuid>"}`. 4. `GET /api/v1/inventory/trace/<generated_barcode>`. | HTTP 200 on pack; `childBox.status: "PACKED"`; timeline includes `CHILD_ACTIVATED` followed by `CHILD_PACKED` (server-side activation during pack). | Integration | The server activates GENERATED boxes inline when packing — see masterCarton.service.ts GENERATED handling. |
| TC-SCAN-014 | Admin | Add GENERATED box to sample record — server writes CHILD_ACTIVATED + CHILD_SAMPLED | P0 | 1. Create a GENERATED child box. Create a sample record (`sample_record_id`). Resolve box UUID via `GET /api/v1/child-boxes/qr/<barcode>`. 2. `POST /api/v1/samples/add-box` with `{"child_box_id": "<child_box_uuid>", "sample_record_id": "<sample_record_id>"}`. 3. `GET /api/v1/inventory/trace/<generated_barcode>`. | HTTP 200; `childBox.status: "SAMPLE"`; timeline has `CHILD_ACTIVATED` then `CHILD_SAMPLED` (two entries). | Integration | |
| TC-SCAN-015 | Admin | Add GENERATED box to ecommerce record — server writes CHILD_ACTIVATED + CHILD_ECOMMERCED | P0 | 1. Create a GENERATED child box. Create an ecommerce record (`ecommerce_record_id`). Resolve box UUID via `GET /api/v1/child-boxes/qr/<barcode>`. 2. `POST /api/v1/ecommerce/add-box` with `{"child_box_id": "<child_box_uuid>", "ecommerce_record_id": "<ecommerce_record_id>"}`. 3. `GET /api/v1/inventory/trace/<generated_barcode>`. | HTTP 200; `childBox.status: "ECOMMERCE"`; timeline has `CHILD_ACTIVATED` then `CHILD_ECOMMERCED`. | Integration | See ecommerce.service.ts lines 64–94. |

---

## Master carton barcode scan

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-016 | Admin | Trace a master carton barcode — returns carton details and timeline | P0 | 1. Create a master carton. Note its `carton_barcode`. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | HTTP 200; body has `masterCarton` object with `carton_barcode`, `status`, `child_count`, `max_capacity`; `childBox` is absent (null); `timeline` array present. | API | |
| TC-SCAN-017 | Admin | Trace ACTIVE master carton — timeline includes CARTON_CREATED and reflects box packing | P1 | 1. Create a carton, pack 2 child boxes into it. 2. `GET /api/v1/inventory/trace/<carton_barcode>`. | Timeline includes `CARTON_CREATED` event and `CHILD_PACKED` events for each box packed (transactions linked by `master_carton_id`). | API | See `inventory.service.ts` line 252 — timeline query uses `master_carton_id`. |
| TC-SCAN-018 | Admin | Scan ACTIVE master carton on /scan page — shows "Seal for Storage" button | P1 | 1. Create an ACTIVE master carton (status = ACTIVE, has at least 1 box). 2. Navigate to `/scan`, enter carton barcode. | "Master Carton" card appears with `Boxes: N/max` and status badge `ACTIVE`. "Seal for Storage" action button is visible. "Clear" button is visible. | E2E | `scan/page.tsx` line 300–313. |
| TC-SCAN-019 | Admin | Scan CLOSED master carton on /scan — shows "Sealed & Stored" confirmation panel | P1 | 1. Close a master carton. 2. Navigate to `/scan`, enter carton barcode. | "Sealed & Stored" green panel with checkmark icon and text "This carton is sealed and ready for dispatch." appears. "Seal for Storage" button is NOT shown. | E2E | `scan/page.tsx` line 315–322. |
| TC-SCAN-020 | Admin | Seal for Storage action on /scan closes ACTIVE carton | P0 | 1. Scan an ACTIVE master carton. 2. Click "Seal for Storage" button. | (a) Button shows loading spinner while request runs. (b) Toast "Carton sealed and stored successfully" appears. (c) Page re-fetches barcode; carton card now shows `CLOSED`. (d) `GET /api/v1/master-cartons/<id>` returns `status: "CLOSED"`. | E2E | `scan/page.tsx` lines 136–146. |
| TC-SCAN-021 | Admin | Scan DISPATCHED master carton — shows "Already Dispatched" info panel | P1 | 1. Dispatch a master carton. 2. Navigate to `/scan`, enter carton barcode. | "Already Dispatched" grey panel with truck icon and text "This carton has been dispatched." appears. No action buttons. | E2E | `scan/page.tsx` line 323–333. |
| TC-SCAN-022 | Admin | Scan CREATED (empty) master carton — shows "Empty Carton" warning panel | P1 | 1. Create a brand-new master carton (CREATED, 0 boxes). 2. Navigate to `/scan`, enter carton barcode. | Yellow "Empty Carton" panel with text "No boxes packed yet. Pack boxes first." appears. No action buttons. | E2E | `scan/page.tsx` line 333–342. |

---

## Invalid and not-found barcodes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-023 | Admin | Trace non-existent barcode — 404 response | P0 | 1. `GET /api/v1/inventory/trace/BINNY-CB-DOESNOTEXIST-9999`. | HTTP 404; JSON body with error message such as `"Item not found"` or similar. No 500 error. | API | |
| TC-SCAN-024 | Admin | Trace empty string barcode — handled gracefully | P1 | 1. `GET /api/v1/inventory/trace/` (trailing slash, empty segment). | HTTP 404 (route not matched) or HTTP 400; no 500 error. | API | |
| TC-SCAN-025 | Admin | Frontend /scan — invalid barcode shows "Item not found" toast | P0 | 1. Navigate to `/scan`. 2. Enter `INVALID-BARCODE-XYZ` in Manual Entry. Click "Look Up". | Toast with error "Item not found in system" appears. No result panel renders. `isSearching` spinner clears. | E2E | `scan/page.tsx` line 107. |
| TC-SCAN-026 | Admin | Frontend /traceability — invalid barcode shows error toast | P0 | 1. Navigate to `/traceability`. 2. Enter `INVALID-BARCODE-XYZ`. Click "Trace". | Toast error "Item not found in system" appears. Result panel not rendered. | E2E | `traceability/page.tsx` line 69. |
| TC-SCAN-027 | Admin | Barcode with URL-special characters is handled safely | P1 | 1. `GET /api/v1/inventory/trace/BINNY%20CB%20001` (URL-encoded space). | HTTP 404 or HTTP 400; no 500; server does not crash. | API | |
| TC-SCAN-028 | Admin | Barcode with SQL wildcard characters does not cause server error | P1 | 1. `GET /api/v1/inventory/trace/'; DROP TABLE child_boxes;--`. | HTTP 404 or HTTP 400; no 500; no database error thrown. | API | Parameterised queries should prevent injection. |

---

## Traceability page — deep-link via query param

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-029 | Admin | Traceability page auto-traces barcode from `?qr=` query param | P1 | 1. Navigate to `http://localhost:3000/traceability?qr=<valid_barcode>`. | Page loads; `qrCode` input pre-filled with the barcode; trace result renders automatically without user clicking "Trace". | E2E | `traceability/page.tsx` lines 57, 77–82. |
| TC-SCAN-030 | Admin | Deep-link with invalid barcode shows error toast on load | P1 | 1. Navigate to `http://localhost:3000/traceability?qr=INVALID-XYZ`. | Error toast "Item not found in system" appears automatically on page load. No result panel rendered. | E2E | |

---

## QR Scanner camera mode

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-031 | Warehouse Operator | /scan page — camera scanner is present and can be started | P1 | 1. Navigate to `/scan` as Warehouse Operator. | "Camera Scanner" card section visible with QRScanner component. Camera starts (browser requests permission). Toggle fullscreen button present. | E2E | Requires device with camera or browser mock. |
| TC-SCAN-032 | Admin | /traceability page — "Scan QR" button toggles scanner | P1 | 1. Navigate to `/traceability`. 2. Click "Scan QR" button. | Scanner panel expands below the search bar. Click "Scan QR" again — scanner collapses. | E2E | `traceability/page.tsx` lines 129–141. |
| TC-SCAN-033 | Admin | /scan — pending offline scan count badge displayed | P2 | 1. Simulate offline environment (disable network in browser DevTools). 2. Navigate to `/scan`. 3. Enter a barcode. Click "Look Up". | Toast "Saved offline — will sync when back online" appears. Pending scan badge in page header shows count > 0. | E2E | `scan/page.tsx` lines 83–88. |

---

## Timeline correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-034 | Admin | Full lifecycle timeline — create → activate → pack → unpack → pack → close → dispatch | P0 | 1. Create a child box (GENERATED). 2. Activate it via `/activate`. 3. Pack into carton A. 4. Unpack from carton A. 5. Pack into carton B. 6. Close carton B. 7. Dispatch carton B. 8. `GET /api/v1/inventory/trace/<child_box_barcode>`. | Timeline in chronological order contains events: `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED`, `CHILD_UNPACKED`, `CHILD_REPACKED` (or second `CHILD_PACKED`), `CHILD_DISPATCHED`. Each event has non-null `performed_by`, non-null `performed_at`, non-empty `description`. | Integration | |
| TC-SCAN-035 | Admin | Timeline events render on /scan page in chronological order with dot-line separator | P1 | 1. On `/scan`, scan a child box with 3+ timeline events. | Timeline section renders events oldest-first (or newest-first per ORDER BY ASC). Each event row shows: action label, description, formatted datetime, performed_by name. Connector line between events visible (except last). | E2E | Timeline uses `ORDER BY it.created_at ASC` per `inventory.service.ts` line 219. |
| TC-SCAN-036 | Admin | Timeline with zero events shows "No timeline events available" | P1 | 1. Create a child box (note: CHILD_CREATED transaction is always written on creation). 2. Directly query `GET /api/v1/inventory/trace/<barcode>`. | In practice, `timeline` always has at least one entry (`CHILD_CREATED`). If a box is somehow orphaned, `timeline: []` renders the "No timeline events available" message. | Manual | Edge case — verify UI handles empty timeline gracefully. |
| TC-SCAN-037 | Admin | CHILD_REPACKED transaction in timeline after repack operation | P1 | 1. Pack a FREE box into carton A (source). Note `child_box_id`, `source_carton_id` (carton A UUID), and `destination_carton_id` (carton B UUID). 2. `POST /api/v1/master-cartons/repack` with body `{"child_box_id": "<uuid>", "source_carton_id": "<carton_A_uuid>", "destination_carton_id": "<carton_B_uuid>"}`. 3. `GET /api/v1/inventory/trace/<child_box_barcode>`. | Timeline includes `CHILD_REPACKED` event (from `TRANSACTION_TYPES.CHILD_REPACKED` in `constants.ts` line 35). | Integration | |
| TC-SCAN-038 | Admin | CHILD_UNSAMPLED transaction in timeline after removing from sample | P1 | 1. Add a child box to a sample. 2. Remove it from the sample. 3. `GET /api/v1/inventory/trace/<child_box_barcode>`. | Timeline includes `CHILD_UNSAMPLED` event. | Integration | |
| TC-SCAN-039 | Admin | CHILD_UNECOMMERCED transaction in timeline after removing from ecommerce | P1 | 1. Add a child box to an ecommerce record. 2. Remove it. 3. `GET /api/v1/inventory/trace/<child_box_barcode>`. | Timeline includes `CHILD_UNECOMMERCED` event. | Integration | |

---

## Transactions list endpoint

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SCAN-040 | Admin | GET /inventory/transactions — returns paginated list | P1 | 1. Login as Admin. 2. `GET /api/v1/inventory/transactions`. | HTTP 200; response body has `{ data: [...], total: <int>, page: 1, limit: 25 }` (or equivalent pagination wrapper); each row has `transaction_type`, `child_box_id` (nullable), `master_carton_id` (nullable), `performed_by`, `created_at`. | API | Route: `inventory.routes.ts` line 12. |
| TC-SCAN-041 | Admin | Filter transactions by transaction_type | P1 | 1. `GET /api/v1/inventory/transactions?transaction_type=CHILD_ACTIVATED`. | HTTP 200; all returned rows have `transaction_type: "CHILD_ACTIVATED"`. | API | |
| TC-SCAN-042 | Admin | Filter transactions by child_box_id | P1 | 1. Note a specific `child_box_id` from a previous test. 2. `GET /api/v1/inventory/transactions?child_box_id=<id>`. | HTTP 200; all rows have `child_box_id` equal to `<id>`; results are the complete lifecycle of that box. | API | |
| TC-SCAN-043 | Admin | Filter transactions by date range | P1 | 1. `GET /api/v1/inventory/transactions?from_date=2099-01-01&to_date=2099-12-31`. | HTTP 200; `data: []`, `total: 0`. | API | |
| TC-SCAN-044 | Warehouse Operator | Warehouse Operator can access inventory/transactions | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/inventory/transactions`. | HTTP 200. The `/inventory` route only requires `authenticate`, not `authorize` — all roles can access. | API | `inventory.routes.ts` — no `authorize()` call. |
