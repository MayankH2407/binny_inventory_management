# Handover: Physical Stock Verification & Reconciliation (QR-based)

**Client:** Binny Footwear
**Prepared by:** Basiq360 (Mayank Harsh)
**Date:** 2026-09-25
**Status:** Backend + web implemented and integration-tested on 2026-09-25 (see §12). Mobile counting screen deferred — see §12.

---

## 1. Why we need this

Portal stock counts and actual physical inventory have recently gone out of sync — stock shown as available on the portal doesn't match what's physically on the shelf/warehouse. We need a formal **physical stock verification & reconciliation** workflow so that:

- Store/warehouse staff can periodically (or on-demand) count physical stock.
- The system compares physical counts against portal (system) stock.
- Discrepancies are reviewed and approved before the system stock is corrected.
- Every correction is logged with a clear before/after audit trail, so we can trace *why* and *when* numbers changed.

This should build on top of the **existing QR sticker labels** already printed and in use:
- **Child box label** — one shoe pair, QR encodes product/size/color/status.
- **Master carton label** — QR for the outer carton (holds multiple child boxes).

We're not proposing a new labeling system — we want to *use the QR codes that already exist* to drive counting, rather than manual quantity entry, since manual entry is almost certainly the source of the current mismatches.

---

## 2. Assumptions — confirmed against the codebase (2026-09-25)

1. **QR payload contents** — ✅ **Unique serial ID per unit**, confirmed. Every child box and every master carton gets its own randomly generated barcode (`backend/src/utils/barcodeGenerator.ts` — `generateUniqueBarcode`, collision-checked against the DB), and the QR payload itself encodes that row's own UUID (`backend/src/utils/qrGenerator.ts`: `BINNY-CB-{childBoxId}` / `BINNY-MC-{cartonId}`). Nothing is shared at SKU level. Exact scan-to-record matching and duplicate-scan detection are both fully supported by the existing data model.
2. **Carton ↔ box relationship** — ✅ **Manifest already exists.** `carton_child_mapping` table (migration `20260312100006`) links `master_carton_id` ↔ `child_box_id`, with `is_active`/`packed_at`/`unpacked_at` and a partial unique index preventing a box being active in two cartons at once. `masterCarton.service.ts` (`getCartonChildren`, `getMasterCartonById`) and `GET /master-cartons/:id/children` / `GET /master-cartons/qr/:barcode` already expose the full contents of a carton. **This means scanning a master carton can safely auto-credit every child box inside it** — the best-case path in §3.2 of this doc applies directly, no fallback-to-manual-count needed for cartons packed through the normal flow.
3. **Status values** — confirmed via `backend/src/config/constants.ts`:
   - `CHILD_BOX_STATUS`: `GENERATED, FREE, PACKED, SAMPLE, ECOMMERCE, PARTIAL, DISPATCHED`
   - `MASTER_CARTON_STATUS` / `ECOMMERCE_STATUS`: `CREATED, ACTIVE, CLOSED, DISPATCHED`
   - ⚠️ **No "Damaged" or "Returned" status exists** in the system today — returns are tracked as a separate item-type on a `returns` entity (`RETURN_ITEM_TYPE`: BOX/CARTON), not as a unit status. **Decision needed:** the "carton found but contents don't match manifest" and "damaged" edge cases (§7) should be modeled as flags/notes on the *reconciliation scan/session* record, not as a new system-wide status on `child_boxes`/`master_cartons` — avoids polluting the core status enum for what is fundamentally a reconciliation-time observation.
4. **Existing scanning capability** — ✅ **Already built and reused everywhere.** `mobile/components/BarcodeScanner.tsx` (Expo `expo-camera`) is a shared, parameterized (`expectedType: 'child'|'master'|'sample'|'ecommerce'|'any'`) scanning component already used in dispatch, master-carton create/pack, unpack/repack, storage, returns, samples, and e-commerce flows. **This feature must reuse this exact component** — no new scanning UI needed. There is no existing GRN/receiving screen, so reconciliation will be the first "count against expected" use of it.
5. **Multi-location** — ✅ **Single implicit location, confirmed.** No warehouse/site entity exists on `child_boxes` or `master_cartons`. What looks like "warehouse" in the schema is actually a stock *channel* (`warehouse` vs `sample` vs `ecommerce` allocation pool, not a physical site), and `products.location` is a factory/origin code (VKIA/MIA/F540), unrelated to physical stock location. **v1 reconciliation does not need location scoping** — sessions can simply scope by category/section/date range instead of warehouse.
6. **Roles** — recommendation stands and maps cleanly onto the existing RBAC/custom-roles system already shipped (`backend/src/middleware/rbac.middleware.ts`, `role.service.ts`, custom roles per [[role_manager_user_fix_2026-07-24]]): staff can open/scan/submit, only admin/manager-level roles get `approve`/`reject`/`post`. Enforce via a new permission key (e.g. `reconciliation:approve`, `reconciliation:post`) rather than hardcoding role names, consistent with how other modules do it.

No existing reconciliation/cycle-count/stock-take code exists anywhere in `backend/src` or `mobile/` — this is a net-new module, built following the exact patterns above (barcode generator, QR payload builder, mapping-table pattern from `carton_child_mapping`, Zod schemas under `models/schemas/`, RBAC permission keys).

---

## 3. Feature overview

A **reconciliation session** goes through a state machine:

```
open → counting → submitted → approved → posted
                      ↑
                (rejected → back to counting, optional)
```

1. **Open session** — user picks scope (warehouse/store, optionally a specific product category or rack range) and starts a session. System snapshots current stock (SKU + quantity + status) for that scope as the "expected" baseline — this snapshot must be frozen at open time so it isn't a moving target while counting happens.
2. **Count (scan)** — staff physically scans QR codes:
   - Scanning a **child box QR** = 1 unit counted for that SKU (and, if the QR carries a unique ID, that specific unit is marked "physically found").
   - Scanning a **master carton QR**:
     - If carton manifest is known (assumption #2 above confirmed) → auto-credits all child boxes listed in that carton's manifest as found, without needing to open and scan each pair individually.
     - If no manifest exists → carton scan should still capture "1 carton of SKU X found," and staff enters/confirms the pair count inside (since carton contents could be edited/damaged).
   - Every scan is timestamped, tied to the user, and appended to the session — nothing is typed by hand unless a QR is missing/unreadable, in which case fall back to manual entry against the exact SKU (logged separately as "manual override" for visibility).
   - Duplicate scans of the same unique unit within a session should be flagged/rejected, not silently double-counted.
   - Unknown/unrecognized QR (not in system) should be flagged as an exception, not discarded.
3. **Submit** — once counting is done for the session's scope, staff submits. System computes, per SKU (and per unique unit if serials exist):
   - `expected_qty` (from snapshot) vs `physical_qty` (from scans) → `variance = physical - expected`
   - Also surface: items expected but not scanned ("missing"), items scanned but not expected in this scope ("unexpected found" — e.g. misplaced stock), and status conflicts (e.g. system says "Sold" but item was physically scanned in warehouse).
4. **Approve** — a manager reviews the variance report (ideally sorted by absolute variance / value impact, so big discrepancies get attention first) and approves or sends back for recount.
5. **Post** — on approval, system applies stock corrections in a single transaction:
   - Updates system stock quantities to match physical counts for the session's scope.
   - Writes an audit log entry per changed line: old qty → new qty, who posted, when, which session.
   - Session is locked as `posted` (read-only from then on).

This mirrors a reconciliation feature we've already built and shipped successfully on another project (Alstone), adapted here for QR-driven counting instead of manual quantity typing — happy to share that implementation's approach as a reference if useful, but the QR/carton-manifest logic above is specific to Binny's setup and is the important part to get right.

---

## 4. Data model (indicative — map onto existing schema)

New entities needed (names indicative, align to existing conventions):

- **`stock_reconciliation_sessions`**: id, session_number, location/warehouse (nullable = all), scope filters (optional), status (open/counting/submitted/approved/posted/rejected), initiated_by, approved_by, created_at, submitted_at, approved_at, posted_at.
- **`reconciliation_expected_lines`**: session_id, sku/product_id, size, color, expected_qty (frozen snapshot at open time), expected_unit_ids (if serials exist).
- **`reconciliation_scans`**: session_id, qr_payload/unit_id, scan_type (child_box | master_carton), resolved_sku, resolved_status_at_scan_time, scanned_by, scanned_at, is_duplicate (bool), is_unexpected (bool, not in session scope), is_unresolved (bool, QR not recognized).
- **`reconciliation_variance_lines`** (computed at submit, or computed on-the-fly like Alstone did to avoid stored-generated-column drift): sku, expected_qty, physical_qty, variance, missing_unit_ids, unexpected_unit_ids.
- **`reconciliation_audit_log`**: reuse existing stock-adjustment audit logging if it exists; otherwise: session_id, sku/unit_id, old_qty, new_qty, adjusted_by, adjusted_at.

If a **carton manifest** doesn't currently exist (assumption #2), consider adding `carton_id` as a field on the child box's QR data or a `carton_contents` mapping table — this alone could meaningfully reduce future mismatches even outside of reconciliation, since it lets you validate "is this carton complete" at dispatch/receiving too.

---

## 5. API endpoints (indicative REST shape)

```
POST   /reconciliation-sessions                 open a session (scope, warehouse)
GET    /reconciliation-sessions                 list sessions (filter by status)
GET    /reconciliation-sessions/:id              session detail
POST   /reconciliation-sessions/:id/scan         submit one QR scan {payload, scan_type}
GET    /reconciliation-sessions/:id/progress     counted vs expected summary
POST   /reconciliation-sessions/:id/submit       lock counting, compute variance
GET    /reconciliation-sessions/:id/variance     variance report
POST   /reconciliation-sessions/:id/approve      manager approval
POST   /reconciliation-sessions/:id/reject       send back to counting
POST   /reconciliation-sessions/:id/post         apply corrections + audit log (admin only)
```

Scan endpoint should be built for **offline-friendly batch sync** if the mobile app supports offline mode — i.e. accept an array of scans with client-side timestamps, not just one at a time, in case connectivity drops mid-count in the warehouse.

---

## 6. Mobile/scanning app requirements

- Reuse existing camera/QR scan component if the app already has one (check dispatch/GRN flows).
- Continuous scan mode (scan → beep/vibrate → auto-ready for next scan) so staff don't have to tap between every item — this is the main lever for count speed and adoption.
- Clear, distinct feedback for: valid scan (success), duplicate scan (warning, not error — don't block the flow), unrecognized QR (error, logged as exception), scan outside current session scope (warning).
- Show running progress (e.g. "142 of 180 expected items scanned") so staff know when they're done.
- Support scanning master cartons without necessarily opening them (if manifest exists) — this is the biggest efficiency win for a footwear warehouse with cartons.

---

## 7. Edge cases to explicitly handle

- Carton scanned but carton was physically opened/tampered — need a way for staff to flag "carton found but contents don't match manifest" and manually reconcile that carton's contents.
- Item scanned in this session that system shows as "Sold" or "In Transit" elsewhere — surface as a status conflict, don't auto-correct silently (could indicate a process failure elsewhere, e.g. dispatched item never left warehouse, or a sold item mis-scanned).
- Same physical unit scanned twice in one session (retry, or scanned by two staff) — de-dupe by unique ID; if no unique ID, warn staff at scan time.
- Partial-scope sessions — if only part of the warehouse is being counted, unscanned items *outside* scope must not be treated as "missing."
- Recount — a rejected/failed session should support a fresh count rather than editing counted numbers by hand, to preserve count integrity.

---

## 8. Roles & permissions

- **Staff**: open a session for their assigned scope, scan/count, submit.
- **Manager/Admin**: approve or reject submitted sessions, post approved sessions (applies the stock correction), view all sessions/audit history.
- Consider requiring a *different* approver than the person who counted, for sessions above a variance threshold (value or quantity), to reduce risk of unreviewed self-correction.

---

## 9. Reporting

- Variance report per session (by SKU, with expected/physical/variance, sortable by impact).
- Historical reconciliation log — which sessions were run, when, by whom, net variance over time (helps spot whether mismatches are shrinking or recurring at the same locations/SKUs, which would point to a process issue rather than a one-off).
- Optional: flag SKUs/locations with repeated variances across multiple sessions as "needs process review."

---

## 10. Acceptance criteria (suggested)

- [ ] A session can be opened scoped to a warehouse/location and captures a frozen snapshot of expected stock at that moment.
- [ ] Child box QR scan correctly identifies product/size/color/status and increments physical count.
- [ ] Master carton QR scan correctly credits all contained units (if manifest exists) or captures carton-level count with a confirm step.
- [ ] Duplicate scans within a session are detected and do not double-count.
- [ ] Unrecognized QR codes are captured as exceptions, not silently dropped.
- [ ] Submitting a session produces an accurate variance report (missing / excess / status-conflict items).
- [ ] Posting a session updates system stock only after explicit approval, and writes a full audit trail (old qty, new qty, who, when, which session) per changed line.
- [ ] Only authorized roles can approve/post; staff-only accounts cannot self-approve their own count.
- [ ] A posted session is locked/read-only.

---

## 11. Open questions for the developer to raise with client if unclear

- Confirm QR payload structure (send a sample decoded QR string/JSON if possible).
- Confirm whether carton manifests currently exist anywhere in the system.
- Confirm number of locations/warehouses in scope for v1.
- Confirm whether offline scanning support is required for v1, or online-only is acceptable initially.

---

## 12. Implementation status (2026-09-25)

**Built and integration-tested (backend + web):**
- 5 migrations: `MISSING` status on child boxes and master cartons, two new `inventory_transactions` types (`STOCK_RECON_MISSING`/`STOCK_RECON_FOUND`), the 4 reconciliation tables, and a permissions grant to Supervisor (full access) and Warehouse Operator (count-only) — live roles, not just fresh installs.
- `backend/src/services/stockReconciliation.service.ts` — open/scan/submit/approve/reject/post/cancel/recount, carton auto-credit with a "contents don't match" flag, offline-safe idempotent scan batching, and the full post-time logic (mark missing, restore found-again, skip anything that moved mid-count instead of overwriting it).
- Web: session list + open-session modal, session detail page (timeline, progress, full variance report, CSV export, approve/reject/post/recount actions gated by permission and by the approver-≠-counter rule), and a dedicated counting screen (continuous QR camera + HID scanner input, offline IndexedDB queue that auto-syncs, distinct success/warning/error feedback).
- `backend/tests/services/stockReconciliation.service.test.ts` — full open→scan→submit→approve→post chain (carton auto-credit, duplicate, out-of-scope, unknown, offline-resync idempotency, self-approval block, posted-session lock) plus a dedicated moved-box → SKIPPED_MOVED case. Full backend jest suite and both `tsc --noEmit` runs pass clean.

**Deferred (not built this round):**
- Mobile (Expo) counting screen — the web counting screen covers v1; the mobile scanner (`mobile/components/BarcodeScanner.tsx`) needs a continuous-scan mode before it can do this job, and Mobile M7 is still uncommitted in this repo, so this wasn't touched.
- Multi-location scoping — not needed; confirmed in §2.5 that the system has no physical-location dimension today.
- "Repeat-offender SKU" cross-session flagging (§9) — the variance report and posted-session history give the raw data for this; the flagging logic itself wasn't built.

**Not yet done:** TEST/LIVE deployment. This has only been run and tested locally.
