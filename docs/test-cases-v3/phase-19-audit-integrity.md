# Phase 19 — Audit Log, Inventory Transactions & Cross-Module Integrity

**Refreshed:** 2026-06-09 (full re-authoring vs stale earlier draft)
**Module codes:** `AUD`
**Roles under test:** Admin (`admin@binny.com` / `Admin@123`), Supervisor (`supervisor@binny.com` / `Sup@123`), Warehouse Operator (`warehouse@binny.com` / `Wh@123`), Dispatch Operator (`dispatch@binny.com` / `Disp@123`)
**Backend API base:** `http://localhost:5000/api/v1`

---

## Table of Contents

1. [Schema notes & invariants](#schema-notes--invariants)
2. [RBAC — audit:read and inventory:read](#rbac--auditread-and-inventoryread)
3. [Child-box transaction trail — CHILD_CREATED](#child-box-transaction-trail--child_created)
4. [Child-box transaction trail — CHILD_ACTIVATED](#child-box-transaction-trail--child_activated)
5. [Child-box transaction trail — CHILD_PACKED / CHILD_UNPACKED](#child-box-transaction-trail--child_packed--child_unpacked)
6. [Child-box transaction trail — CHILD_SAMPLED / CHILD_UNSAMPLED](#child-box-transaction-trail--child_sampled--child_unsampled)
7. [Child-box transaction trail — CHILD_ECOMMERCED / CHILD_UNECOMMERCED](#child-box-transaction-trail--child_ecommerced--child_unecommerced)
8. [Child-box transaction trail — CHILD_DISPATCHED](#child-box-transaction-trail--child_dispatched)
9. [Container-level transaction trail — CARTON_*](#container-level-transaction-trail--carton_)
10. [Container-level transaction trail — SAMPLE_*](#container-level-transaction-trail--sample_)
11. [Container-level transaction trail — ECOMMERCE_*](#container-level-transaction-trail--ecommerce_)
12. [Legacy inventory — LEGACY_CARTON_OPENED](#legacy-inventory--legacy_carton_opened)
13. [Repack (free-both) — CHILD_UNPACKED batch](#repack-free-both--child_unpacked-batch)
14. [Scan-carton-to-ecommerce — dual-leg trace](#scan-carton-to-ecommerce--dual-leg-trace)
15. [Full-unpack transaction trail](#full-unpack-transaction-trail)
16. [CHILD_REPACKED — dead transaction type](#child_repacked--dead-transaction-type)
17. [Audit log writes (DB-level verification)](#audit-log-writes-db-level-verification)
18. [DB-level integrity — barcode uppercase CHECK constraints](#db-level-integrity--barcode-uppercase-check-constraints)
19. [DB-level integrity — foot CHECK + unique-active-sample-foot index](#db-level-integrity--foot-check--unique-active-sample-foot-index)
20. [DB-level integrity — dispatch source exactly-one CHECK](#db-level-integrity--dispatch-source-exactly-one-check)
21. [DB-level integrity — referential integrity guards](#db-level-integrity--referential-integrity-guards)
22. [Transaction atomicity and rollback](#transaction-atomicity-and-rollback)
23. [Audit log failure swallowing](#audit-log-failure-swallowing)

---

## Schema notes & invariants

**`audit_logs` table columns:** `id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_values` (JSONB), `new_values` (JSONB), `ip_address`, `user_agent`, `created_at`. Written by `auditLog.service.ts` `createAuditLog()`. Failures are swallowed via try/catch (do not break the main operation).

**`inventory_transactions` table columns:** `id`, `transaction_type` (enum), `child_box_id` (nullable UUID), `master_carton_id` (nullable UUID), `performed_by` (UUID), `notes` (text), `metadata` (JSONB), `created_at`. Exposed via `GET /api/v1/inventory/transactions`.

**No dedicated `GET /api/v1/audit-logs` route is mounted** — confirmed by inspecting `routes/index.ts`. The `getAuditLogs()` function exists in `auditLog.service.ts` but has no HTTP controller or route registered. The `audit:read` permission exists in the Admin permission array (autoSeed.ts) but has **no corresponding route** — this is a dead permission. Audit log verification must be done directly against the DB.

**`GET /api/v1/inventory/transactions`** is gated by `authorizePermission('inventory:read')` (inventory.routes.ts line 15). In the access matrix `inventory:read` is Admin-only. All four non-Admin roles will receive 403.

**`GET /api/v1/inventory/cartons/export`** is also gated by `authorizePermission('inventory:read')` — same Admin-only restriction.

**Key invariants for all state-changing actions:** each action writes the expected `inventory_transactions` row(s) within the same DB transaction (or immediately after). Verify via `GET /api/v1/inventory/transactions` with Admin token, or directly via DB query: `SELECT transaction_type, child_box_id, master_carton_id, metadata, created_at FROM inventory_transactions ORDER BY created_at DESC LIMIT 10`.

**ECOMMERCE_CREATED gap:** When `POST /ecommerce` is called WITH `child_box_barcodes` (non-empty array), no `ECOMMERCE_CREATED` transaction is written — only `CHILD_ACTIVATED` (if GENERATED) + `CHILD_ECOMMERCED` per box. The `ECOMMERCE_CREATED` transaction is only written when creating an empty e-commerce record (no barcodes). This is a known code asymmetry.

**Transaction types defined in `TRANSACTION_TYPES` constant (23 total):**
`CHILD_CREATED`, `CHILD_PACKED`, `CHILD_UNPACKED`, `CHILD_REPACKED` (dead — never emitted), `CHILD_SAMPLED`, `CHILD_UNSAMPLED`, `CHILD_ECOMMERCED`, `CHILD_UNECOMMERCED`, `CARTON_CREATED`, `CARTON_CLOSED`, `CARTON_REOPENED`, `CARTON_DISPATCHED`, `SAMPLE_CREATED`, `SAMPLE_CLOSED`, `SAMPLE_REOPENED`, `SAMPLE_DISPATCHED`, `ECOMMERCE_CREATED`, `ECOMMERCE_CLOSED`, `ECOMMERCE_REOPENED`, `ECOMMERCE_DISPATCHED`, `CHILD_DISPATCHED`, `CHILD_ACTIVATED`, `LEGACY_CARTON_OPENED`.

**Dependencies:** Phases 03–13 (all entity creation flows). Tests in this phase assume those entities can be created as prerequisites.

---

## RBAC — audit:read and inventory:read

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-001 | Unauthenticated | GET /inventory/transactions without token returns 401 | P0 | 1. `GET /api/v1/inventory/transactions` with no Authorization header. | HTTP 401. | API | |
| TC-AUD-002 | Admin | GET /inventory/transactions as Admin returns 200 | P0 | 1. Login as Admin; obtain token. 2. `GET /api/v1/inventory/transactions`. | HTTP 200; JSON body with `data` array and `total` integer. | API | `inventory:read` is Admin-only per access matrix. |
| TC-AUD-003 | Supervisor | GET /inventory/transactions as Supervisor returns 403 | P0 | 1. Login as Supervisor; obtain token. 2. `GET /api/v1/inventory/transactions`. | HTTP 403; error references `inventory:read`. | API | Supervisor does NOT hold `inventory:read`. |
| TC-AUD-004 | Warehouse Operator | GET /inventory/transactions as Warehouse Operator returns 403 | P0 | 1. Login as Warehouse Operator; obtain token. 2. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | |
| TC-AUD-005 | Dispatch Operator | GET /inventory/transactions as Dispatch Operator returns 403 | P0 | 1. Login as Dispatch Operator; obtain token. 2. `GET /api/v1/inventory/transactions`. | HTTP 403. | API | |
| TC-AUD-006 | Unauthenticated | GET /audit-logs without token returns 404 (no route) | P1 | 1. `GET /api/v1/audit-logs` with no Authorization header. | HTTP 404. Route is not registered in routes/index.ts. | API | **Dead permission finding:** `audit:read` is in Admin's permission list but no HTTP route is mounted to serve it. |
| TC-AUD-007 | Admin | GET /audit-logs with valid Admin token returns 404 | P1 | 1. Login as Admin; obtain token. 2. `GET /api/v1/audit-logs` with Authorization header. | HTTP 404. The `getAuditLogs()` service function exists but is not wired to any route. | API | Flag for future: if audit read UI is planned, a route needs to be created and protected by `authorizePermission('audit:read')`. |
| TC-AUD-008 | Unauthenticated | GET /inventory/cartons/export without token returns 401 | P1 | 1. `GET /api/v1/inventory/cartons/export` with no token. | HTTP 401. | API | |
| TC-AUD-009 | Supervisor | GET /inventory/cartons/export as Supervisor returns 403 | P1 | 1. Login as Supervisor; obtain token. 2. `GET /api/v1/inventory/cartons/export`. | HTTP 403; `inventory:read` not held by Supervisor. | API | |

---

## Child-box transaction trail — CHILD_CREATED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-010 | Admin | Single child box create writes CHILD_CREATED transaction | P0 | 1. Login as Admin; obtain token. 2. `POST /api/v1/child-boxes` with valid `product_id` and `quantity`. Note returned `id`. 3. `GET /api/v1/inventory/transactions?child_box_id=<id>` (Admin token). | HTTP 200; exactly 1 transaction row; `transaction_type: "CHILD_CREATED"`; `performed_by` = admin user ID; `notes` contains the generated barcode. `master_carton_id` is null. | Integration | childBox.service.ts line 41–45. |
| TC-AUD-011 | Warehouse Operator | Bulk child boxes (POST /bulk) — each box writes one CHILD_CREATED | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes/bulk` with `count: 3` and valid `product_id`. Note the 3 returned IDs. 3. For each ID, query transactions. | 3 queries each return exactly 1 `CHILD_CREATED` row. `notes` on each contains "Bulk child box generated" and the box's barcode. All 3 transactions are written within the same DB transaction (atomically). | Integration | childBox.service.ts line 101–105. |
| TC-AUD-012 | Admin | Multi-size bulk (POST /bulk-multi-size) — each box writes CHILD_CREATED | P0 | 1. `POST /api/v1/child-boxes/bulk-multi-size` with a valid sizes array. Note returned IDs. 2. Query transactions for each ID. | Each ID has exactly 1 `CHILD_CREATED` row; `notes` contains "Multi-size bulk child box generated" and the barcode. All rows inserted in a single bulk INSERT within one transaction. | Integration | childBox.service.ts batch tx INSERT. |
| TC-AUD-013 | Admin | CSV bulk upload — each created box writes CHILD_CREATED | P0 | 1. `POST /api/v1/child-boxes/bulk-upload` with a valid CSV (e.g. 2 rows: SKU1 count=2, SKU2 count=1). 2. Query transactions for each returned barcode. | 3 `CHILD_CREATED` rows written (one per box); `notes` on each contains "CSV bulk import" and the barcode. Each CSV row's boxes are inserted in a per-row transaction. | Integration | childBox.service.ts line 473–478. CSV bulk-upload cap is 1000 rows; total boxes cap is 5000. |

---

## Child-box transaction trail — CHILD_ACTIVATED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-014 | Admin | Explicit activate of GENERATED box writes CHILD_ACTIVATED | P0 | 1. Create a child box via `POST /bulk` (produces GENERATED status). Note `id`. 2. `POST /api/v1/child-boxes/<id>/activate`. 3. Query transactions for `child_box_id`. | 2 rows: `CHILD_CREATED` then `CHILD_ACTIVATED` (in chronological order). `CHILD_ACTIVATED.notes` contains "Child box activated (label scanned, now real inventory)" and the barcode. | Integration | childBox.service.ts activateChildBox lines 533–537. |
| TC-AUD-015 | Admin | Explicit activate of already-FREE box writes no CHILD_ACTIVATED | P1 | 1. Use a FREE (already activated) child box. 2. `POST /api/v1/child-boxes/<id>/activate`. 3. Query transactions. | HTTP 200 (idempotent — service returns the box unchanged). No new `CHILD_ACTIVATED` row. Transaction count unchanged. | Integration | activateChildBox early-return at line 515–517. |
| TC-AUD-016 | Warehouse Operator | Implicit activation during pack (GENERATED → PACKED) writes CHILD_ACTIVATED then CHILD_PACKED | P0 | 1. Get a GENERATED child box. 2. Create a master carton. 3. `POST /api/v1/master-cartons/<carton_id>/pack` with `{"child_box_id": "<id>", "master_carton_id": "<carton_id>"}`. 4. Query transactions for `child_box_id`. | 3 rows total: `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED` — in that chronological order. `CHILD_ACTIVATED.notes` contains "auto-activated (implicit activation during pack into carton". | Integration | masterCarton.service.ts packChildBox lines 293–302. |
| TC-AUD-017 | Admin | Implicit activation during pack-by-barcode (GENERATED box) writes CHILD_ACTIVATED then CHILD_PACKED | P0 | 1. Get a GENERATED child box barcode. 2. `POST /api/v1/master-cartons/pack-by-barcode` with `{"barcode": "<bc>", "master_carton_id": "<id>"}`. 3. Query transactions. | `CHILD_ACTIVATED` row (notes: "auto-activated … during pack into carton") followed by `CHILD_PACKED` row. | Integration | packChildBoxByBarcode delegates to packChildBox. |
| TC-AUD-018 | Admin | Implicit activation during add-to-sample (GENERATED box) writes CHILD_ACTIVATED then CHILD_SAMPLED | P0 | 1. Get a GENERATED child box. 2. `POST /api/v1/samples/<sample_id>/add-box`. 3. Query transactions. | `CHILD_ACTIVATED` row (notes: "auto-activated … during add to sample") then `CHILD_SAMPLED` row. | Integration | sample.service.ts addBoxToSample lines 394–404. |
| TC-AUD-019 | Admin | Implicit activation during add-to-ecommerce (GENERATED box) writes CHILD_ACTIVATED then CHILD_ECOMMERCED | P0 | 1. Get a GENERATED child box. 2. `POST /api/v1/ecommerce/<ec_id>/add-box`. 3. Query transactions. | `CHILD_ACTIVATED` then `CHILD_ECOMMERCED` rows. | Integration | ecommerce.service.ts addBoxToEcommerce lines 311–319. |
| TC-AUD-020 | Admin | Implicit activation during create-sample-with-barcodes (GENERATED box) writes CHILD_ACTIVATED then CHILD_SAMPLED | P0 | 1. Get a GENERATED box barcode. 2. `POST /api/v1/samples` with `{"name":"X","child_box_barcodes":["<bc>"]}`. 3. Query transactions. | After `SAMPLE_CREATED` transaction: `CHILD_ACTIVATED` then `CHILD_SAMPLED` for the box. | Integration | sample.service.ts createSample lines 158–167. |
| TC-AUD-021 | Admin | Implicit activation during create-ecommerce-with-barcodes (GENERATED box) writes CHILD_ACTIVATED then CHILD_ECOMMERCED | P0 | 1. Get a GENERATED box barcode. 2. `POST /api/v1/ecommerce` with `{"name":"X","child_box_barcodes":["<bc>"]}`. 3. Query transactions. | `CHILD_ACTIVATED` then `CHILD_ECOMMERCED` rows. Note: when creating ecommerce with barcodes, no `ECOMMERCE_CREATED` transaction is written — this is a known asymmetry. | Integration | ecommerce.service.ts createEcommerce lines 59–91. |

---

## Child-box transaction trail — CHILD_PACKED / CHILD_UNPACKED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-022 | Warehouse Operator | Pack FREE child box writes CHILD_PACKED with master_carton_id | P0 | 1. Get a FREE child box ID. 2. Create a master carton. 3. `POST /api/v1/master-cartons/pack` with `{"child_box_id":"<id>","master_carton_id":"<carton_id>"}`. 4. Query transactions for `child_box_id`. | New `CHILD_PACKED` row; `child_box_id` set; `master_carton_id` set to the carton's ID; `notes` contains "Packed child box … into carton". | Integration | |
| TC-AUD-023 | Warehouse Operator | Pack-by-barcode (FREE box, re-scan idempotent) — second scan returns alreadyPacked, no new transaction | P1 | 1. Pack a FREE box into carton via pack-by-barcode. 2. Re-scan the same barcode into the same carton (`POST /master-cartons/pack-by-barcode` again). 3. Query transactions. | First scan: `CHILD_PACKED` row written. Second scan: HTTP 200 with `alreadyPacked: true`; no new transaction row. | Integration | packChildBoxByBarcode idempotency at lines 388–394 of masterCarton.service.ts. |
| TC-AUD-024 | Warehouse Operator | Pack-by-barcode (box already in different carton) returns 400, no transaction | P1 | 1. Pack box B1 into carton MC1. 2. Attempt `POST /master-cartons/pack-by-barcode` with B1 and a different `master_carton_id` (MC2). | HTTP 400; error "already packed in another carton". No new transaction written. MC1 still holds B1. | Integration | |
| TC-AUD-025 | Warehouse Operator | Unpack child box from master carton writes CHILD_UNPACKED | P0 | 1. Pack a FREE child box into a master carton. 2. `POST /api/v1/master-cartons/unpack` with `{"child_box_id":"<id>","master_carton_id":"<carton_id>"}`. 3. Query transactions. | New `CHILD_UNPACKED` row; `child_box_id` and `master_carton_id` both set; box status returns to FREE. `notes` contains "Unpacked child box … from carton". | Integration | masterCarton.service.ts unpackChildBox line 469–475. |
| TC-AUD-026 | Warehouse Operator | Cannot unpack from a DISPATCHED carton — no transaction written | P1 | 1. Dispatch a master carton. 2. Attempt to unpack a child box from it. | HTTP 400; error "Cannot unpack from a dispatched carton". No `CHILD_UNPACKED` transaction written. | API | |

---

## Child-box transaction trail — CHILD_SAMPLED / CHILD_UNSAMPLED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-027 | Admin | Add FREE box to sample (default foot=PAIR) writes CHILD_SAMPLED with metadata | P0 | 1. Get a FREE child box ID. 2. `POST /api/v1/samples/<sample_id>/add-box` with `{"child_box_id":"<id>","sample_record_id":"<s_id>"}`. 3. Query transactions. | New `CHILD_SAMPLED` row; `child_box_id` set; `metadata` JSON contains `{"sample_record_id":"<s_id>"}`. Box `status: "SAMPLE"`. | Integration | sample.service.ts addBoxToSample line 431–438. |
| TC-AUD-028 | Admin | Add FREE box to sample with explicit foot=LEFT writes CHILD_SAMPLED; foot tracked in sample_box_mapping | P0 | 1. `POST /samples/<id>/add-box` with `{"child_box_id":"<id>","sample_record_id":"<s_id>","foot":"LEFT"}`. 2. Query transactions and DB: `SELECT foot FROM sample_box_mapping WHERE child_box_id = '<id>' AND is_active = true`. | One `CHILD_SAMPLED` transaction. `sample_box_mapping.foot = 'LEFT'`. Box status = SAMPLE. | Integration | Foot-split feature — foot tracked in mapping, not in transaction metadata. |
| TC-AUD-029 | Admin | Foot-split: add LEFT foot then RIGHT foot of same box to different samples — two CHILD_SAMPLED rows | P0 | 1. Get a FREE box ID. 2. `POST /samples/S1/add-box` with `foot: "LEFT"`. 3. `POST /samples/S2/add-box` with same `child_box_id` and `foot: "RIGHT"`. 4. Query all transactions for `child_box_id`. | Two `CHILD_SAMPLED` rows, each with distinct `metadata.sample_record_id`. Box status = SAMPLE throughout. `idx_unique_active_sample_foot` index allows this (unique per child_box_id + foot). | Integration | Migration 20260609120001 — per-foot unique index. |
| TC-AUD-030 | Admin | Foot conflict: adding PAIR to a box that already has LEFT in sample → 400, no transaction | P1 | 1. Add LEFT foot of box B to sample S1 (step TC-AUD-028). 2. Attempt `POST /samples/S2/add-box` with same `child_box_id` and `foot: "PAIR"`. | HTTP 400; error "already has its left foot in a sample; cannot add the whole pair". No `CHILD_SAMPLED` transaction written. | API | assertFootAvailable in sample.service.ts. |
| TC-AUD-031 | Admin | Remove box from sample writes CHILD_UNSAMPLED with metadata | P0 | 1. Add a box to a sample. 2. `POST /api/v1/samples/<id>/remove-box` with `{"child_box_id":"<id>","sample_record_id":"<s_id>"}`. 3. Query transactions. | New `CHILD_UNSAMPLED` row; `metadata` contains `{"sample_record_id":"<s_id>"}`. Box reverts to FREE (only if no other foot is still mapped — see TC-AUD-032). | Integration | sample.service.ts removeBoxFromSample line 534–540. |
| TC-AUD-032 | Admin | Remove LEFT foot from sample when RIGHT foot still mapped — CHILD_UNSAMPLED written but box stays SAMPLE | P1 | 1. Add both LEFT and RIGHT feet of box B to two different samples S1 and S2. 2. Remove LEFT foot (remove from S1). 3. Query transactions and check box status. | One `CHILD_UNSAMPLED` for the LEFT foot removal. Box status remains SAMPLE (RIGHT foot still active in S2). DB: `remainingFeet.length > 0` → box NOT set to FREE. | Integration | removeBoxFromSample lines 511–516 (remainingFeet check). |
| TC-AUD-033 | Admin | Remove last foot from sample → box becomes FREE; if sample was ACTIVE and now empty, SAMPLE_REOPENED also written | P1 | 1. Add LEFT foot of box B to sample S1. Confirm S1 is ACTIVE. 2. Remove the LEFT foot. 3. Query transactions. | `CHILD_UNSAMPLED` row + `SAMPLE_REOPENED` row (because S1 was ACTIVE and is now empty, reverting to CREATED). Box status = FREE. | Integration | removeBoxFromSample lines 544–555. |
| TC-AUD-034 | Admin | Cannot remove box from DISPATCHED sample | P1 | 1. Dispatch a sample. 2. Attempt `POST /samples/<id>/remove-box`. | HTTP 400; "Cannot remove a child box from a dispatched sample". No transaction written. | API | |

---

## Child-box transaction trail — CHILD_ECOMMERCED / CHILD_UNECOMMERCED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-035 | Admin | Add FREE box to ecommerce record writes CHILD_ECOMMERCED | P0 | 1. Get a FREE child box ID. 2. `POST /api/v1/ecommerce/<ec_id>/add-box` with `{"child_box_id":"<id>","ecommerce_record_id":"<ec_id>"}`. 3. Query transactions. | New `CHILD_ECOMMERCED` row; `child_box_id` set; `notes` contains "Added child box … to e-commerce record". Box status = ECOMMERCE. | Integration | ecommerce.service.ts addBoxToEcommerce line 348–356. |
| TC-AUD-036 | Admin | Remove box from ecommerce record writes CHILD_UNECOMMERCED | P0 | 1. Add a box to an ecommerce record. 2. `POST /api/v1/ecommerce/<id>/remove-box`. 3. Query transactions. | New `CHILD_UNECOMMERCED` row. Box reverts to FREE. | Integration | ecommerce.service.ts removeBoxFromEcommerce line 582–588. |
| TC-AUD-037 | Admin | Remove last box from ACTIVE ecommerce — CHILD_UNECOMMERCED + ECOMMERCE_REOPENED written | P1 | 1. Create ecommerce record with exactly one box. Close it (CLOSED). Re-add a box (back to ACTIVE). Remove that box. 2. Query transactions. | `CHILD_UNECOMMERCED` row + `ECOMMERCE_REOPENED` row (status reverts to CREATED). | Integration | ecommerce.service.ts removeBoxFromEcommerce lines 560–570. |
| TC-AUD-038 | Admin | Cannot add box to CLOSED or DISPATCHED ecommerce record | P1 | 1. Close an ecommerce record. 2. Attempt `POST /ecommerce/<id>/add-box`. | HTTP 400; no `CHILD_ECOMMERCED` transaction. | API | |

---

## Child-box transaction trail — CHILD_DISPATCHED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-039 | Dispatch Operator | Dispatch master carton writes CHILD_DISPATCHED per box with metadata | P0 | 1. Close a master carton with 3 PACKED child boxes. 2. `POST /api/v1/dispatches` with `{"master_carton_ids":["<id>"],"customer_id":"<cust_id>"}`. 3. Query transactions for each child_box_id. | 3 `CHILD_DISPATCHED` rows; each has `child_box_id` set, `master_carton_id` set, `metadata` JSON containing `{"destination":"<dest>"}`. Box statuses all = DISPATCHED. | Integration | dispatch.service.ts _dispatchMasterCartons lines 100–110. |
| TC-AUD-040 | Dispatch Operator | Dispatch sample writes CHILD_DISPATCHED per shipped foot (per-foot semantics) | P0 | 1. Add 2 boxes to a sample (one PAIR each). Close sample. 2. Dispatch sample. 3. Query transactions for each child_box_id. | 2 `CHILD_DISPATCHED` rows; each has `metadata` containing `{"sample_record_id":"<id>","destination":"<dest>","foot":"PAIR"}`. Both boxes = DISPATCHED. | Integration | dispatch.service.ts _dispatchSample lines 253–264. |
| TC-AUD-041 | Dispatch Operator | Dispatch sample with foot-split — only last-foot box dispatched; intermediate box stays SAMPLE | P0 | 1. Add LEFT foot of box B1 to sample S1. Add PAIR of box B2 to same sample S1. Close S1. 2. Dispatch S1. 3. Check box statuses and transactions. | `CHILD_DISPATCHED` rows written for both B1 (LEFT foot) and B2 (PAIR). B2 status = DISPATCHED. B1 status: if B1's RIGHT foot is still active in another non-dispatched sample, B1 stays SAMPLE; otherwise B1 = DISPATCHED. `metadata.foot` = "LEFT" for B1. | Integration | dispatch.service.ts _dispatchSample last-foot logic lines 229–249. |
| TC-AUD-042 | Dispatch Operator | Dispatch ecommerce writes CHILD_DISPATCHED per box with ecommerce metadata | P0 | 1. Close an ecommerce record with 2 boxes. 2. `POST /dispatches` with `{"ecommerce_record_id":"<id>"}`. 3. Query transactions for each child_box_id. | 2 `CHILD_DISPATCHED` rows; `metadata` contains `{"ecommerce_record_id":"<id>","destination":"<dest>"}`. Boxes = DISPATCHED. | Integration | dispatch.service.ts _dispatchEcommerce lines 384–394. |

---

## Container-level transaction trail — CARTON_*

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-043 | Admin | Create master carton (no barcodes) writes CARTON_CREATED | P0 | 1. `POST /api/v1/master-cartons` with `{}`. Note returned `id`. 2. `GET /api/v1/inventory/transactions` with Admin token; filter for `master_carton_id=<id>`. | 1 `CARTON_CREATED` row; `master_carton_id` set; `child_box_id` null; `notes` contains "Master carton created with barcode". | Integration | masterCarton.service.ts line 143–147. |
| TC-AUD-044 | Admin | Create master carton with initial barcodes writes CARTON_CREATED then CHILD_PACKED per box | P0 | 1. Get 2 FREE box barcodes. 2. `POST /master-cartons` with `{"child_box_barcodes":["B1","B2"]}`. 3. Query transactions for `master_carton_id`. | `CARTON_CREATED` row + 2 `CHILD_PACKED` rows (one per box). All written within same transaction. If any box was GENERATED, `CHILD_ACTIVATED` rows also present before the corresponding `CHILD_PACKED`. | Integration | masterCarton.service.ts createMasterCarton lines 35–99. |
| TC-AUD-045 | Supervisor | Close master carton writes CARTON_CLOSED | P0 | 1. Create and activate (add a box to) a master carton. 2. `POST /api/v1/master-cartons/<id>/close`. 3. Query transactions for `master_carton_id`. | New `CARTON_CLOSED` row; `notes` contains "closed". Carton status = CLOSED. | Integration | masterCarton.service.ts closeMasterCarton line 533–537. |
| TC-AUD-046 | Admin | Dispatch master carton writes CARTON_DISPATCHED (in addition to per-box CHILD_DISPATCHED) | P0 | 1. Close a master carton with 2 boxes. 2. Dispatch it. 3. Query transactions for `master_carton_id`. | Both `CHILD_DISPATCHED` rows (child_box_id set, master_carton_id set) AND one `CARTON_DISPATCHED` row (child_box_id null, master_carton_id set). `CARTON_DISPATCHED.metadata` contains `{"dispatch_record_id":"<dr_id>","destination":"<dest>"}`. | Integration | dispatch.service.ts _dispatchMasterCartons lines 136–144. |
| TC-AUD-047 | Admin | CARTON_REOPENED — not emitted by current code; no reopen endpoint | P2 | 1. Review routes/index.ts and masterCarton.routes.ts for a reopen endpoint. | CARTON_REOPENED transaction type is defined in `TRANSACTION_TYPES` constant but **no service call emits it** as of 2026-06-09. No standalone reopen route exists (full-unpack resets carton to CREATED status but emits CHILD_UNPACKED rows, not CARTON_REOPENED). AUTOMATION GAP — document as known missing emission. | Manual | `CARTON_REOPENED` is a dead transaction type in the current codebase. |

---

## Container-level transaction trail — SAMPLE_*

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-048 | Admin | Create sample (empty) writes SAMPLE_CREATED with metadata | P0 | 1. `POST /api/v1/samples` with `{"name":"Test S"}` (no barcodes). 2. Query transactions (no child_box_id — use Admin `GET /inventory/transactions`; search by notes or metadata). | 1 `SAMPLE_CREATED` row; `child_box_id` null; `metadata` JSON contains `{"sample_record_id":"<id>"}`. `notes` contains "Sample record created with barcode". | Integration | sample.service.ts createSample (no-barcode path) lines 232–241. |
| TC-AUD-049 | Admin | Create sample with barcodes writes SAMPLE_CREATED + CHILD_SAMPLED per box | P0 | 1. `POST /samples` with `{"name":"X","child_box_barcodes":["B1","B2"]}`. 2. Query transactions. | `SAMPLE_CREATED` row (first) + 2 `CHILD_SAMPLED` rows (one per box). All written within same transaction. If any box was GENERATED, `CHILD_ACTIVATED` rows also present. | Integration | sample.service.ts createSample (with-barcodes path). |
| TC-AUD-050 | Admin | Close sample writes SAMPLE_CLOSED with metadata | P0 | 1. Create and activate a sample. 2. `POST /api/v1/samples/<id>/close`. 3. Query transactions. | New `SAMPLE_CLOSED` row; `metadata` contains `{"sample_record_id":"<id>"}`. `notes` contains "Sample record … closed". | Integration | sample.service.ts closeSample lines 614–620. |
| TC-AUD-051 | Admin | SAMPLE_REOPENED emitted when last box removed from ACTIVE sample (see also TC-AUD-033) | P1 | (covered by TC-AUD-033) | (see TC-AUD-033) | Integration | SAMPLE_REOPENED has no dedicated close→reopen flow; it fires implicitly on remove-last-box from ACTIVE. |
| TC-AUD-052 | Dispatch Operator | Dispatch sample writes SAMPLE_DISPATCHED with full metadata | P0 | 1. Create active sample, close it. 2. Dispatch it. 3. Query transactions. | `SAMPLE_DISPATCHED` row; `metadata` contains `{"sample_record_id":"<id>","dispatch_record_id":"<dr_id>","destination":"<dest>"}`. | Integration | dispatch.service.ts _dispatchSample lines 287–295. |

---

## Container-level transaction trail — ECOMMERCE_*

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-053 | Admin | Create ecommerce record (empty, no barcodes) writes ECOMMERCE_CREATED | P0 | 1. `POST /api/v1/ecommerce` with `{"name":"EC1"}` (no `child_box_barcodes`). 2. Query transactions. | 1 `ECOMMERCE_CREATED` row; `child_box_id` null; `notes` contains "E-commerce record created with barcode". | Integration | ecommerce.service.ts createEcommerce (empty path) lines 136–139. |
| TC-AUD-054 | Admin | Create ecommerce record WITH barcodes does NOT write ECOMMERCE_CREATED | P1 | 1. `POST /ecommerce` with `{"name":"EC2","child_box_barcodes":["B1"]}`. 2. Query transactions — look for ECOMMERCE_CREATED. | NO `ECOMMERCE_CREATED` transaction row. Only `CHILD_ECOMMERCED` (and `CHILD_ACTIVATED` if the box was GENERATED). This is a known code asymmetry — document as expected actual behavior, not a blocking defect. | Integration | ecommerce.service.ts lines 21–114 — the `barcodes.length > 0` branch omits ECOMMERCE_CREATED. AUTOMATION GAP to flag. |
| TC-AUD-055 | Admin | Close ecommerce record writes ECOMMERCE_CLOSED | P0 | 1. Create active ecommerce record. 2. `POST /api/v1/ecommerce/<id>/close`. 3. Query transactions. | New `ECOMMERCE_CLOSED` row; `notes` contains "E-commerce record … closed". | Integration | ecommerce.service.ts closeEcommerce lines 648–650. |
| TC-AUD-056 | Admin | Remove last box from ACTIVE ecommerce writes ECOMMERCE_REOPENED (see TC-AUD-037) | P1 | (covered by TC-AUD-037) | (see TC-AUD-037) | Integration | ECOMMERCE_REOPENED fires implicitly on remove-last-box from ACTIVE. |
| TC-AUD-057 | Dispatch Operator | Dispatch ecommerce writes ECOMMERCE_DISPATCHED with metadata | P0 | 1. Create active ecommerce, close it. 2. Dispatch it. 3. Query transactions. | `ECOMMERCE_DISPATCHED` row; `metadata` contains `{"ecommerce_record_id":"<id>","dispatch_record_id":"<dr_id>","destination":"<dest>"}`. | Integration | dispatch.service.ts _dispatchEcommerce lines 418–426. |

---

## Legacy inventory — LEGACY_CARTON_OPENED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-058 | Admin | Bulk legacy CSV upload does NOT write any inventory_transactions | P1 | 1. `POST /api/v1/master-cartons/legacy-upload` with a valid CSV (1 row, qty=2). 2. Query transactions for the newly created carton IDs. | No `inventory_transactions` rows written for the two new legacy cartons. Only audit_log rows written (one per CSV row via `createAuditLog`). Legacy cartons are opaque count-level records; the transaction trail begins only when they are opened for repacking. | Integration | legacyCarton.service.ts bulkCreateLegacyCartons — no call to `inventory_transactions` INSERT. AUTOMATION GAP. |
| TC-AUD-059 | Admin | Open-for-repacking (openLegacyCarton) writes LEGACY_CARTON_OPENED | P0 | 1. Create a legacy carton via CSV upload. Note its `id`. 2. `POST /api/v1/master-cartons/<id>/open-legacy`. 3. Query transactions for `master_carton_id`. | 1 `LEGACY_CARTON_OPENED` row; `master_carton_id` set; `notes` contains "opened for repacking (now an empty trackable carton)". Carton's `is_legacy` flips to false, `status` = CREATED. | Integration | masterCarton.service.ts openLegacyCarton lines 691–698. |
| TC-AUD-060 | Admin | Cannot open non-legacy carton — no LEGACY_CARTON_OPENED written | P1 | 1. Use a regular (non-legacy) master carton. 2. `POST /master-cartons/<id>/open-legacy`. | HTTP 400; "Only legacy cartons can be opened for repacking". No transaction written. | API | openLegacyCarton guard at line 676. |
| TC-AUD-061 | Admin | Open-legacy carton writes audit log with action OPEN_LEGACY_CARTON | P1 | 1. Open a legacy carton (TC-AUD-059 prerequisite). 2. Query DB: `SELECT * FROM audit_logs WHERE action = 'OPEN_LEGACY_CARTON' ORDER BY created_at DESC LIMIT 1`. | Row exists; `entity_type = 'master_carton'`; `entity_id` matches carton id; `new_values` = `{"is_legacy": false, "status": "CREATED"}`. | Manual | DB query required; no HTTP audit endpoint. |

---

## Repack (free-both) — CHILD_UNPACKED batch

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-062 | Admin | Repack free-both (both cartons with boxes) writes CHILD_UNPACKED for every freed box | P0 | 1. Create two master cartons MC1 (2 boxes) and MC2 (1 box). 2. `POST /api/v1/master-cartons/repack-free-both` with `{"carton1_barcode":"<bc1>","carton2_barcode":"<bc2>"}`. 3. Query transactions for all 3 child_box_ids. | 3 `CHILD_UNPACKED` rows (one per freed box); each has `master_carton_id` set to the originating carton; `notes` contains "Repack: freed child box … from carton". Both cartons reset to CREATED / child_count = 0. | Integration | masterCarton.service.ts repackFreeBoth lines 807–817. |
| TC-AUD-063 | Admin | Repack free-both with one empty carton — only boxes from non-empty carton produce CHILD_UNPACKED rows | P1 | 1. Create MC1 (2 boxes) and MC2 (empty / CREATED). 2. Call repack-free-both. 3. Query transactions. | 2 `CHILD_UNPACKED` rows (from MC1 only). MC2 skipped (empty). | Integration | repackFreeBoth skips CREATED cartons in the loop (line 783). |
| TC-AUD-064 | Admin | Repack free-both with both cartons empty — blocked | P1 | 1. Create MC1 and MC2, both empty (CREATED). 2. Attempt repack-free-both. | HTTP 400; "At least one carton must have boxes to repack". No transactions written. | API | |

---

## Scan-carton-to-ecommerce — dual-leg trace

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-065 | Admin | Scan carton to ecommerce writes CHILD_UNPACKED then CHILD_ECOMMERCED per box | P0 | 1. Create a master carton with 2 PACKED boxes. 2. Create an ecommerce record. 3. `POST /api/v1/ecommerce/<ec_id>/scan-carton` with `{"carton_barcode":"<mc_bc>"}`. 4. Query transactions for each child_box_id. | For each of the 2 boxes: one `CHILD_UNPACKED` row (`master_carton_id` = carton ID, notes contains "scan-to-e-commerce") AND one `CHILD_ECOMMERCED` row (notes contains "via carton"). Total 4 new transaction rows. Carton becomes CREATED/0; ecommerce child_count increases by 2. | Integration | ecommerce.service.ts scanCartonToEcommerce lines 452–463. |
| TC-AUD-066 | Admin | Scan-carton-to-ecommerce: CLOSED carton is scannable (status check only blocks DISPATCHED) | P1 | 1. Close a master carton with packed boxes. 2. Scan it into an ecommerce record. | HTTP 200; `CHILD_UNPACKED` + `CHILD_ECOMMERCED` rows written. CLOSED cartons are not blocked by this flow — only DISPATCHED cartons are. | Integration | ecommerce.service.ts scan checks status = DISPATCHED only. |
| TC-AUD-067 | Admin | Scan-carton-to-ecommerce: carton with no active boxes → 400 | P1 | 1. Create a carton and immediately full-unpack it (all boxes freed). 2. Attempt scan-to-ecommerce. | HTTP 400; "no packed child boxes to add". No transactions written. | API | |

---

## Full-unpack transaction trail

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-068 | Warehouse Operator | Full-unpack master carton writes CHILD_UNPACKED for every active box | P0 | 1. Pack 3 boxes into a master carton. 2. `POST /api/v1/master-cartons/<id>/full-unpack`. 3. Query transactions for all 3 `child_box_id`s. | 3 `CHILD_UNPACKED` rows; each has `master_carton_id` set; `notes` contains "Full unpack: unpacked child box". All boxes status = FREE. Master carton status = CREATED, `child_count` = 0. | Integration | masterCarton.service.ts fullUnpackMasterCarton lines 621–627. |
| TC-AUD-069 | Warehouse Operator | Full-unpack sample writes CHILD_UNSAMPLED for every active mapping | P0 | 1. Add 2 boxes to a sample. 2. `POST /api/v1/samples/<id>/full-unpack`. 3. Query transactions. | 2 `CHILD_UNSAMPLED` rows; `metadata` each contains `{"sample_record_id":"<id>"}`. Boxes = FREE. Sample status = CREATED, `child_count` = 0. | Integration | sample.service.ts fullUnpackSample lines 717–724. |
| TC-AUD-070 | Admin | Full-unpack ecommerce writes CHILD_UNECOMMERCED for every active mapping | P0 | 1. Add 2 boxes to an ecommerce record. 2. `POST /api/v1/ecommerce/<id>/full-unpack`. 3. Query transactions. | 2 `CHILD_UNECOMMERCED` rows. Boxes = FREE. Ecommerce status = CREATED, `child_count` = 0. | Integration | ecommerce.service.ts fullUnpackEcommerce lines 739–743. |
| TC-AUD-071 | Warehouse Operator | Full-unpack dispatched carton — blocked | P1 | 1. Dispatch a carton. 2. Attempt `POST /master-cartons/<id>/full-unpack`. | HTTP 400; "Cannot unpack a dispatched carton". No CHILD_UNPACKED written. | API | |

---

## CHILD_REPACKED — dead transaction type

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-072 | Admin | CHILD_REPACKED transaction type is never emitted | P2 | 1. Review all service files for any INSERT into inventory_transactions with `transaction_type = 'CHILD_REPACKED'`. 2. Review routes for a `/master-cartons/repack` standalone endpoint. | No service emits `CHILD_REPACKED`. No standalone `/repack` route is registered. The type remains in `TRANSACTION_TYPES` constant and in the DB enum for historical reasons. The old repack feature was removed; unpack+pack is the replacement path (producing `CHILD_UNPACKED` + `CHILD_PACKED`). | Manual | AUTOMATION GAP — add a grep-based test that asserts `CHILD_REPACKED` never appears in `inventory_transactions`. |

---

## Audit log writes (DB-level verification)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-073 | Admin | Create child box writes audit log: action CREATE_CHILD_BOX | P1 | 1. `POST /child-boxes` (note returned `id`). 2. DB: `SELECT * FROM audit_logs WHERE action = 'CREATE_CHILD_BOX' AND entity_id = '<id>'`. | Row exists; `entity_type = 'child_box'`; `user_id` = admin user ID; `new_values` contains `{product_id, quantity, barcode}`. `old_values` null. | Manual | No HTTP audit endpoint — DB direct query required. |
| TC-AUD-074 | Admin | Bulk child box create writes single audit log: action BULK_CREATE_CHILD_BOX | P1 | 1. `POST /child-boxes/bulk` with count=3. 2. DB: `SELECT * FROM audit_logs WHERE action = 'BULK_CREATE_CHILD_BOX' ORDER BY created_at DESC LIMIT 1`. | 1 row; `new_values` contains `{product_id, quantity, count: 3}`. (3 individual `CHILD_CREATED` transactions but only 1 audit log at batch level.) | Manual | childBox.service.ts createBulkChildBoxes — audit is batch-level, not per-box. |
| TC-AUD-075 | Admin | Activate child box writes audit log: action ACTIVATE_CHILD_BOX with old/new status | P1 | 1. Activate a GENERATED box. 2. DB: `SELECT * FROM audit_logs WHERE action = 'ACTIVATE_CHILD_BOX' AND entity_id = '<id>'`. | Row; `old_values.status = 'GENERATED'`; `new_values.status = 'FREE'`. | Manual | |
| TC-AUD-076 | Admin | Pack child box writes audit log: action PACK_CHILD_BOX | P1 | 1. Pack a box. 2. DB: `SELECT * FROM audit_logs WHERE action = 'PACK_CHILD_BOX' ORDER BY created_at DESC LIMIT 1`. | Row; `entity_type = 'carton_child_mapping'`; `new_values` contains `{child_box_id, master_carton_id}`. | Manual | |
| TC-AUD-077 | Admin | Create master carton writes audit log: action CREATE_MASTER_CARTON | P1 | 1. `POST /master-cartons`. 2. DB query for action = 'CREATE_MASTER_CARTON'. | Row; `entity_id` = carton ID; `new_values` contains `{carton_barcode, max_capacity}`. | Manual | |
| TC-AUD-078 | Admin | Close master carton writes audit log: action CLOSE_MASTER_CARTON | P1 | 1. Close a carton. 2. DB query. | Row; `entity_id` = carton ID; `new_values` null. | Manual | closeMasterCarton — no old/new values passed, only entity IDs. |
| TC-AUD-079 | Admin | Create sample writes audit log: action CREATE_SAMPLE | P1 | 1. `POST /samples`. 2. DB query. | Row; `entity_type = 'sample_record'`; `new_values` contains `{sample_barcode, name}`. | Manual | |
| TC-AUD-080 | Admin | Create ecommerce writes audit log: action CREATE_ECOMMERCE | P1 | 1. `POST /ecommerce`. 2. DB query. | Row; `entity_type = 'ecommerce_record'`; `new_values` contains `{ecommerce_barcode}`. | Manual | |
| TC-AUD-081 | Admin | Scan carton to ecommerce writes audit log: action SCAN_CARTON_TO_ECOMMERCE | P1 | 1. Perform scan-carton-to-ecommerce. 2. DB query. | Row; `action = 'SCAN_CARTON_TO_ECOMMERCE'`; `new_values` contains `{carton_barcode, boxes_added}`. | Manual | |
| TC-AUD-082 | Admin | Dispatch (any source) writes audit log: action CREATE_DISPATCH | P1 | 1. Dispatch a carton. 2. DB: `SELECT * FROM audit_logs WHERE action = 'CREATE_DISPATCH' ORDER BY created_at DESC LIMIT 1`. | Row; `entity_type = 'dispatch_record'`; `new_values` contains `{destination, total_cartons}` (carton dispatch) or `{source_type, sample_record_id/ecommerce_record_id, destination, child_box_count}`. | Manual | All three dispatch sub-handlers use `CREATE_DISPATCH` action. |
| TC-AUD-083 | Admin | Audit log failure does NOT break the main operation | P1 | 1. Temporarily prevent `audit_logs` INSERT (e.g. revoke INSERT privilege for the DB user or mock the function in test). 2. `POST /child-boxes`. 3. Verify product created; restore privilege. | HTTP 201; child box created. Error logged via `logger.error('Failed to create audit log', error)` but not propagated. | Manual | auditLog.service.ts line 32–34 catch block. Run in local env only. |
| TC-AUD-084 | Admin | Bulk legacy carton upload writes audit log: action BULK_CREATE_LEGACY_CARTONS | P1 | 1. `POST /master-cartons/legacy-upload` with valid CSV (2 rows). 2. DB: `SELECT * FROM audit_logs WHERE action = 'BULK_CREATE_LEGACY_CARTONS' ORDER BY created_at DESC LIMIT 2`. | 2 rows (one per CSV data row); `new_values` each contains `{section, category, article_group, size_group, quantity, cartons_created}`. | Manual | legacyCarton.service.ts line 269–280. Audit is per-row, outside the inner transaction. |

---

## DB-level integrity — barcode uppercase CHECK constraints

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-085 | Admin | child_boxes barcode uppercase CHECK: lowercase barcode INSERT rejected at DB level | P1 | 1. Attempt to directly INSERT into `child_boxes` with `barcode = 'cb000001'` (lowercase). | PostgreSQL rejects with CHECK constraint violation: `chk_child_boxes_barcode_upper`. | Manual | Migration 20260527120001. Barcodes generated by `barcodeGenerator.ts` always use uppercase alphabet `0-9A-Z` (Crockford) + uppercase prefix, so normal API paths never hit this. |
| TC-AUD-086 | Admin | master_cartons carton_barcode uppercase CHECK enforced | P1 | Direct INSERT of `carton_barcode = 'mc000001'` (lowercase). | Rejected: `chk_master_cartons_carton_barcode_upper`. | Manual | |
| TC-AUD-087 | Admin | sample_records sample_barcode uppercase CHECK enforced | P1 | Direct INSERT of `sample_barcode = 'sr000001'`. | Rejected: `chk_sample_records_sample_barcode_upper`. | Manual | |
| TC-AUD-088 | Admin | ecommerce_records ecommerce_barcode uppercase CHECK enforced | P1 | Direct INSERT of `ecommerce_barcode = 'ec000001'`. | Rejected: `chk_ecommerce_records_ecommerce_barcode_upper`. | Manual | |
| TC-AUD-089 | Admin | Barcode lookup uses UPPER() — mixed-case input normalized | P0 | 1. Create a child box; note barcode e.g. `CB1A2B3C`. 2. `GET /inventory/trace/cb1a2b3c` (lowercase barcode in URL). | HTTP 200; box resolved. All trace/lookup queries use `WHERE barcode = UPPER($1)`. | API | Services uniformly uppercase the input before querying. |

---

## DB-level integrity — foot CHECK + unique-active-sample-foot index

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-090 | Admin | foot CHECK constraint: invalid foot value rejected | P1 | 1. Attempt direct INSERT into `sample_box_mapping` with `foot = 'BOTH'`. | PostgreSQL rejects: `foot IN ('LEFT', 'RIGHT', 'PAIR')` CHECK constraint (from migration 20260605100001). | Manual | Valid values are LEFT, RIGHT, PAIR only. |
| TC-AUD-091 | Admin | Unique-active-sample-foot index: duplicate active mapping for same box+foot rejected | P1 | 1. Add LEFT foot of box B to sample S1. 2. Attempt to add LEFT foot of same box B to another sample S2 simultaneously (direct INSERT into `sample_box_mapping`). | PostgreSQL rejects with unique constraint violation on `idx_unique_active_sample_foot`. Service-layer guard (`assertFootAvailable`) catches this first in normal API flow. | Manual | Migration 20260609120001. |
| TC-AUD-092 | Admin | API: duplicate active foot rejected before hitting DB | P1 | 1. Add LEFT foot of box B to sample S1. 2. `POST /samples/S2/add-box` with same box and foot LEFT via API. | HTTP 400; "The left foot of child box … is already in a sample." Service guard fires before DB insert. No unique constraint violation reaches PostgreSQL. | API | assertFootAvailable() in sample.service.ts. |
| TC-AUD-093 | Admin | Unique-active-ecommerce-mapping: duplicate active ecommerce mapping per child box rejected | P1 | 1. Add box B to ecommerce E1 (box status = ECOMMERCE). 2. Attempt to add box B to ecommerce E2 via API. | HTTP 400; "currently ECOMMERCE and cannot be added". Service guard fires. DB has `idx_unique_active_ecommerce_mapping` as backup. | API | Migration 20260427100005. |

---

## DB-level integrity — dispatch source exactly-one CHECK

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-094 | Admin | Dispatch with exactly one source (carton) — accepted | P0 | 1. `POST /dispatches` with only `master_carton_ids` (+ `customer_id`). | HTTP 201; dispatch record created with `master_carton_id` set, `sample_record_id` null, `ecommerce_record_id` null. `chk_dispatch_source_exactly_one` passes (1 + 0 + 0 = 1). | API | |
| TC-AUD-095 | Admin | Dispatch with exactly one source (sample) — accepted | P0 | 1. `POST /dispatches` with only `sample_record_id`. | HTTP 201; `sample_record_id` set, others null. | API | |
| TC-AUD-096 | Admin | Dispatch with exactly one source (ecommerce) — accepted | P0 | 1. `POST /dispatches` with only `ecommerce_record_id`. | HTTP 201; `ecommerce_record_id` set, others null. | API | |
| TC-AUD-097 | Admin | Dispatch with zero sources — rejected by Zod schema before DB | P0 | 1. `POST /dispatches` with body `{"customer_id":"<id>"}` (no source field). | HTTP 400; Zod refine error: "Exactly one dispatch source must be provided". No `dispatch_records` row inserted. `chk_dispatch_source_exactly_one` never reached. | API | dispatch.schema.ts first refine. |
| TC-AUD-098 | Admin | Dispatch with two sources (carton + sample) — rejected by Zod schema | P0 | 1. `POST /dispatches` with both `master_carton_ids` and `sample_record_id`. | HTTP 400; Zod error. `chk_dispatch_source_exactly_one` DB constraint is a secondary safety net; Zod fires first. | API | |
| TC-AUD-099 | Admin | customer_id required for master-carton dispatch but not for sample/ecommerce | P1 | 1. `POST /dispatches` with `master_carton_ids` but NO `customer_id`. | HTTP 400; Zod error "Customer is required for master carton dispatch". | API | dispatch.schema.ts second refine. |
| TC-AUD-100 | Admin | Dispatch source CHECK enforced at DB level (direct SQL insert with two sources rejected) | P2 | 1. Attempt direct SQL: `INSERT INTO dispatch_records (master_carton_id, sample_record_id, dispatched_by, ...) VALUES ('<uuid>','<uuid>','<uuid>', ...)`. | PostgreSQL rejects: `chk_dispatch_source_exactly_one` (1 + 1 + 0 = 2 ≠ 1). | Manual | DB backup guarantee. |

---

## DB-level integrity — referential integrity guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-101 | Admin | Delete product with active child boxes — blocked by FK RESTRICT | P0 | 1. Create a product. 2. Create a child box for it. 3. `DELETE /api/v1/products/<product_id>`. | HTTP 400 or 409; error indicating child boxes reference this product (FK `child_boxes.product_id → products.id ON DELETE RESTRICT`). Product not deleted. | API | |
| TC-AUD-102 | Admin | Delete section with products — blocked | P0 | 1. Create a section. 2. Assign a product to that section. 3. `DELETE /api/v1/sections/<section_id>`. | HTTP 409; error "Cannot delete section with existing products" (or similar). Section remains. | API | |
| TC-AUD-103 | Admin | Delete customer referenced by dispatch record — blocked by FK RESTRICT | P0 | 1. Create a customer. 2. Dispatch a carton to that customer. 3. `DELETE /api/v1/customers/<customer_id>`. | HTTP 409; FK `dispatch_records.customer_id` ON DELETE RESTRICT prevents deletion. | API | |
| TC-AUD-104 | Admin | Delete customer with sample record — FK is SET NULL (customer_id nullable on sample) | P1 | 1. Create a customer. 2. Create a sample record with `customer_id` set. 3. `DELETE /api/v1/customers/<customer_id>`. | Depends on FK definition: if `sample_records.customer_id ON DELETE SET NULL`, delete succeeds and sample's `customer_id` becomes null. If RESTRICT, HTTP 409. Verify actual FK in migration 20260427100003. | Manual | Migration file defines the FK action — verify match against expected behavior. |
| TC-AUD-105 | Admin | Delete master carton with dispatch records — blocked by FK RESTRICT | P0 | 1. Dispatch a carton. 2. Attempt `DELETE /api/v1/master-cartons/<id>` (if endpoint exists). | HTTP 409 or 404 (no delete endpoint may exist). FK `dispatch_records.master_carton_id ON DELETE RESTRICT` blocks raw SQL DELETE. | API | Verify whether a carton delete endpoint is exposed. |
| TC-AUD-106 | Admin | Soft-delete product does NOT cascade-delete child boxes | P1 | 1. Create product P with 3 child boxes. 2. `DELETE /api/v1/products/<P_id>` (soft-delete via `is_active = false` or equivalent). 3. DB: `SELECT COUNT(*) FROM child_boxes WHERE product_id = '<P_id>'`. | Product marked inactive. 3 child boxes still exist with `product_id` intact. Box statuses unchanged. | Integration | |
| TC-AUD-107 | Admin | Create sample with non-existent customer_id — FK rejected | P0 | 1. `POST /api/v1/samples` with `{"customer_id":"00000000-0000-0000-0000-000000000000","name":"X"}`. | HTTP 400 or 404; FK violation on `sample_records.customer_id → customers.id`. No sample created. | API | |

---

## Transaction atomicity and rollback

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-108 | Warehouse Operator | Concurrent add-box: same child box added to two cartons simultaneously | P0 | 1. Create a FREE child box B. Create cartons MC1, MC2. 2. Fire two simultaneous requests: `POST /master-cartons/pack` for B→MC1 and B→MC2 at the same time. | Exactly one succeeds (HTTP 200); the other returns HTTP 400 ("currently PACKED and cannot be packed"). Box belongs to exactly one carton. No duplicate `carton_child_mapping` rows. Row-level locking (`FOR UPDATE` on child_boxes) prevents double-pack. | Integration | Run via Playwright concurrent-request test with `Promise.all`. |
| TC-AUD-109 | Admin | Pack failure mid-transaction rolls back all writes | P1 | 1. Create a master carton. 2. `POST /master-cartons` with `child_box_barcodes: ["VALID_BC","NONEXISTENT_BC"]`. | HTTP 400/404 on the invalid barcode. Neither the valid box's status change nor the carton's child_count increment persists. `CHILD_PACKED` transaction for the valid box is not written. DB is clean. | Integration | createMasterCarton ROLLBACK path. |
| TC-AUD-110 | Admin | Concurrent close + add-box race — no corrupted state | P1 | 1. Create ACTIVE carton. 2. Simultaneously fire `POST /master-cartons/<id>/close` and `POST /master-cartons/pack`. | One wins; other is rejected. If close wins: add-box returns HTTP 400 ("CLOSED and cannot accept new child boxes"). If pack wins: close proceeds normally. No corrupted child_count or status. | Integration | Both functions use `FOR UPDATE` row locks. |
| TC-AUD-111 | Admin | Dispatch failure (invalid customer_id mid-transaction) rolls back all CHILD_DISPATCHED writes | P1 | 1. Create 2 closed cartons. 2. `POST /dispatches` with valid `master_carton_ids` but `customer_id` pointing to a non-existent UUID. | HTTP 400/404; neither carton is marked DISPATCHED; no `CHILD_DISPATCHED` or `CARTON_DISPATCHED` transactions written; no `dispatch_records` row created. | Integration | dispatch.service.ts `ROLLBACK` in _dispatchMasterCartons catch. |
| TC-AUD-112 | Admin | Bulk legacy upload per-row transaction isolation: one bad row does not undo successfully-created rows from other rows | P1 | 1. Upload a CSV with 3 rows: row 1 valid (qty=2), row 2 invalid qty=−1, row 3 valid (qty=1). | Response: `cartons_created=3`, `errors=[{row:2,...}]`. Row 1 and row 3 cartons exist in DB; row 2 rejected; row 1's already-committed cartons are NOT rolled back by row 2's failure. | Integration | legacyCarton.service.ts — per-row client/transaction, errors push to errors array and continue. |

---

## Audit log failure swallowing

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUD-113 | Admin | Audit log INSERT failure swallowed — main operation succeeds | P1 | 1. In test DB: `REVOKE INSERT ON audit_logs FROM <app_user>` or mock `createAuditLog` to throw. 2. `POST /child-boxes`. 3. Restore permission. | HTTP 201; child box row exists in `child_boxes`. Error logged by `logger.error('Failed to create audit log', error)` at auditLog.service.ts line 33. No 500 error propagated to client. | Manual | Local env only. auditLog.service.ts try/catch design. |
| TC-AUD-114 | Admin | Audit log failure inside a main transaction — main transaction still commits | P1 | 1. Mock `createAuditLog` to throw after the main transaction commits in (e.g.) `activateChildBox`. 2. Call activate. | HTTP 200; box is FREE. Audit log missing for this activation. IMPORTANT: `createAuditLog` is called OUTSIDE (after) the main DB transaction in all service functions that use `getClient()` — so a thrown audit failure cannot roll back the already-committed main transaction. | Manual | This is by design: audit logs are written after `await client.query('COMMIT')`. |
