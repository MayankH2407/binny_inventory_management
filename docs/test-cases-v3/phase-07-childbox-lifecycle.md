# Phase 07 — Child Box: Single Create + GENERATED Lifecycle

**System:** Binny Footwear Inventory Management System (Mahavir Polymers Pvt. Ltd.)
**Suite version:** v3 (full re-author)
**Phase:** 07
**API base:** `http://localhost:5000/api/v1` (local) / `https://srv1409601.hstgr.cloud/binny/api/v1` (portal)
**Frontend base:** `http://localhost:3000` (local) / `https://srv1409601.hstgr.cloud/binny/` (portal)
**Last updated:** 2026-06-09 (refreshed — Session A7)

---

## TOC

1. [Section 1 — Single Create (POST /child-boxes)](#section-1--single-create-post-child-boxes)
   - 1.1 Role-based creation RBAC
   - 1.2 Creation validation
   - 1.3 Barcode format (short CB######)
   - 1.4 Inventory transaction on create
2. [Section 2 — Explicit Activation (POST /:id/activate)](#section-2--explicit-activation-post-idactivate)
   - 2.1 Successful activation — allowed roles
   - 2.2 Denied roles on activate
   - 2.3 Idempotency: FREE → FREE
   - 2.4 Conflict: PACKED / DISPATCHED / SAMPLE / ECOMMERCE
   - 2.5 Activation audit trail
3. [Section 3 — Implicit Activation (pack/sample/ecommerce on GENERATED box)](#section-3--implicit-activation)
   - 3.1 Pack GENERATED → PACKED (dual transaction)
   - 3.2 Sample GENERATED → SAMPLE
   - 3.3 Ecommerce GENERATED → ECOMMERCE
   - 3.4 Packing FREE box — no duplicate CHILD_ACTIVATED
4. [Section 4 — GET by QR (getChildBoxByQR — active_sample_feet field)](#section-4--get-by-qr)
5. [Section 5 — GET by ID](#section-5--get-by-id)
6. [Section 6 — List (GET /child-boxes) with filters](#section-6--list-get-child-boxes-with-filters)
7. [Section 7 — Free endpoint (GET /child-boxes/free)](#section-7--free-endpoint-get-child-boxesfree)
8. [Section 8 — Stock semantics (GENERATED excluded from pairsInStock)](#section-8--stock-semantics)
9. [Section 9 — Status lifecycle: SAMPLE and ECOMMERCE terminal states](#section-9--sample-and-ecommerce-terminal-states)
10. [Section 10 — UI: Child Boxes list page (/child-boxes)](#section-10--ui-child-boxes-list-page)
    - 10.1 Page load, column layout, aging legend
    - 10.2 Status filter (All / GENERATED / FREE / PACKED / DISPATCHED)
    - 10.3 Product filter
    - 10.4 Search filter
    - 10.5 Aging tint (FREE only, 90d yellow / 180d red)
    - 10.6 Print-selected
    - 10.7 RBAC guards on page actions
11. [Section 11 — UI: Generate Labels page (/child-boxes/generate)](#section-11--ui-generate-labels-page)
12. [Section 12 — UI: Scan page auto-activation of GENERATED box](#section-12--ui-scan-page-auto-activation)
13. [Section 13 — RBAC matrix discrepancy notes (encode as TCs)](#section-13--rbac-discrepancy-tcs)

---

## Context — GENERATED lifecycle

All creation paths insert child boxes with `status = 'GENERATED'` (not `FREE`). A GENERATED box represents a printed label not yet in active inventory. It is excluded from stock counts (`pairsInStock`, `getStockByLevel`) and from `GET /child-boxes/free`.

**Barcode format (short):** `CB######` — 6 upper-case alphanumeric characters (e.g. `CB3F7A2B`). Confirmed in spec `19-childbox-rbac.spec.ts` TC-CB-ADM-001.

**RBAC summary (verified against routes + seeds):**

| Action | Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|---|:--:|:--:|:--:|:--:|
| Create single / bulk / multi-size | `child_boxes:create` | ✓ | ✓ | ✓ | ✗ (403) |
| Activate (`POST /:id/activate`) | `child_boxes:update` | ✓ | ✓ | ✗ (403) | ✗ (403) |
| GET list / by-ID / by-QR / free | auth-only (no permission gate) | ✓ | ✓ | ✓ | ✓ |
| GET bulk-upload/sample CSV | `child_boxes:read` | ✓ | ✓ | ✓ | ✓ |
| Delete | `child_boxes:delete` | ✓ (seed) | ✗ | ✗ | ✗ |
| Unauthenticated | — | 401 | 401 | 401 | 401 |

> **Matrix discrepancy D1:** The old phase-07 file (TC-CB-052, TC-CB-053) stated Warehouse Operator and Dispatch Operator CAN activate. The route uses `authorizePermission('child_boxes:update')`. Seeds confirm Warehouse Operator does NOT have `child_boxes:update` (only `child_boxes:create` and `child_boxes:read`). Dispatch Operator also lacks it. Both roles receive **403** on `POST /:id/activate`. The master matrix is correct; the old TCs were wrong.

> **Matrix discrepancy D2:** `child_boxes:delete` is seeded for Admin but there is **no DELETE route** in `childBox.routes.ts`. The permission is effectively dead code. Encode as a negative TC (DELETE attempt returns 404 Method Not Found or route-not-found).

> **Matrix discrepancy D3:** Status dropdown on `/child-boxes` page lists: All / GENERATED / FREE / PACKED / DISPATCHED — `SAMPLE` and `ECOMMERCE` are **not present** in the filter. Boxes in SAMPLE or ECOMMERCE status appear only under "All Statuses". Document as a UI-coverage gap (no dedicated filter option).

---

## Shared test fixtures

| Fixture alias | Description |
|---|---|
| `PRODUCT_UUID_A` | Active product — `article_name="Busker"`, `colour="White"`, `size="6"`, `mrp=299` |
| `PRODUCT_UUID_B` | Active product — `article_name="Busker"`, `colour="White"`, `size="7"`, `mrp=299` |
| `INACTIVE_PRODUCT_UUID` | Product with `is_active=false` (from Phase 05) |
| `CB_GEN_UUID` | Created by TC-CB-001; initially `status=GENERATED` |
| `CB_FREE_UUID` | Created by TC-CB-001 and activated; `status=FREE` |
| `CB_PACKED_UUID` | Child box packed into a master carton; `status=PACKED` |
| `CB_DISP_UUID` | Child box dispatched; `status=DISPATCHED` |
| `CB_SAMPLE_UUID` | Child box added to a sample; `status=SAMPLE` |
| `CB_ECOM_UUID` | Child box added to an ecommerce order; `status=ECOMMERCE` |

---

## Section 1 — Single Create (POST /child-boxes)

### 1.1 — Role-based creation RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-001 | Admin | Admin creates single child box — status is GENERATED, short barcode | P0 | 1. `POST /api/v1/auth/login` as admin, save JWT. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 201. `data.status = "GENERATED"`. `data.barcode` matches `/^CB[0-9A-Z]{6}$/` (short format). `data.qr_data_uri` non-empty. `data.article_name`, `data.size`, `data.colour`, `data.mrp` populated. Save `id` as `CB_GEN_UUID`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-ADM-001; 30-generated-lifecycle.spec.ts TC-GENL-001 |
| TC-CB-002 | Supervisor | Supervisor creates single child box — 201 GENERATED | P1 | 1. Login as Supervisor. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 201. `data.status = "GENERATED"`. `data.barcode` matches `/^CB[0-9A-Z]{6}$/`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-SUP-001 |
| TC-CB-003 | Warehouse Operator | Warehouse Operator creates single child box — 201 GENERATED | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 201. `data.status = "GENERATED"`. Valid short barcode. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-WHO-001 |
| TC-CB-004 | Dispatch Operator | Dispatch Operator cannot create child box — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. | HTTP 403. No child box row created. `data` not returned. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-DOP-001 |
| TC-CB-005 | Unauthenticated | Unauthenticated create returns 401 | P0 | 1. `POST /api/v1/child-boxes` body `{"product_id":"<PRODUCT_UUID_A>","quantity":1}` — no Authorization header. | HTTP 401. No child box created. | API | AUTOMATION GAP: no dedicated unauth test in existing specs |

---

### 1.2 — Creation validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-010 | Admin | Missing product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"quantity":1}`. | HTTP 400. Error indicates `product_id` required. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-VAL-003 |
| TC-CB-011 | Admin | Non-UUID product_id returns 400 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"not-a-uuid","quantity":1}`. | HTTP 400. Zod validation error. | API | AUTOMATION GAP |
| TC-CB-012 | Admin | Non-existent product_id returns 404 | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1}`. | HTTP 404. `"Product not found or inactive"`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-VAL-001 |
| TC-CB-013 | Admin | Inactive product_id returns 404 | P0 | 1. Pre-condition: `INACTIVE_PRODUCT_UUID` has `is_active=false`. 2. Login as Admin. 3. `POST /api/v1/child-boxes` body: `{"product_id":"<INACTIVE_PRODUCT_UUID>","quantity":1}`. | HTTP 404. `"Product not found or inactive"`. Service query filters `AND is_active = true`. | API | AUTOMATION GAP |
| TC-CB-014 | Admin | quantity defaults to 1 when omitted | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>"}`. | HTTP 201. `data.quantity = 1`. `data.status = "GENERATED"`. | API | AUTOMATION GAP: schema default=1 |
| TC-CB-015 | Admin | quantity = 0 returns 400 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":0}`. | HTTP 400. Zod validation error (positive integer required). | API | AUTOMATION GAP |
| TC-CB-016 | Admin | quantity = 10000 (boundary) succeeds | P2 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":10000}`. | HTTP 201. `data.quantity = 10000`. `data.status = "GENERATED"`. | API | AUTOMATION GAP |

---

### 1.3 — Barcode format (short CB######)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-020 | Admin | Created barcode matches short format CB###### | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` body: `{"product_id":"<PRODUCT_UUID_A>","quantity":1}`. 3. Inspect `data.barcode`. | `data.barcode` matches regex `/^CB[0-9A-Z]{6}$/` — exactly 8 characters total (prefix "CB" + 6 upper-case alphanumeric). Old long format `BINNY-CB-<uuid>` must NOT appear. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-ADM-001; 30-generated-lifecycle.spec.ts TC-GENL-001 |
| TC-CB-021 | Admin | Barcode uniqueness across two concurrent creates | P1 | 1. Login as Admin. 2. Make two concurrent `POST /api/v1/child-boxes` calls (same product). | Both return HTTP 201 with distinct `barcode` values. No collision. | Integration | `generateUniqueBarcode` uses DB uniqueness loop |

---

### 1.4 — Inventory transaction on create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-025 | Admin | Creating a child box writes exactly one CHILD_CREATED transaction | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` noting `id`. 3. `GET /api/v1/inventory/transactions?child_box_id=<id>&limit=50`. | HTTP 200 on step 3. Exactly 1 row with `transaction_type = "CHILD_CREATED"`, `child_box_id = <id>`, `performed_by = <admin_user_id>`. `notes` contains the barcode string. | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-002 (partial) |
| TC-CB-026 | Admin | Creating a child box writes CREATE_CHILD_BOX audit_log entry | P0 | 1. Login as Admin. 2. `POST /api/v1/child-boxes` noting `id`. 3. Query `audit_log WHERE entity_id=<id> AND action='CREATE_CHILD_BOX'`. | 1 audit row. `new_values` contains `{"product_id":"...","quantity":1,"barcode":"CB######"}`. | Integration | AUTOMATION GAP: no audit_log assertion in current specs |

---

## Section 2 — Explicit Activation (POST /:id/activate)

### 2.1 — Successful activation — allowed roles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-050 | Admin | Admin activates GENERATED box → FREE | P0 | 1. Pre-condition: `CB_GEN_UUID` has `status="GENERATED"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate`. | HTTP 200. `data.status = "FREE"`. `data.id = CB_GEN_UUID`. All other fields unchanged. Save as `CB_FREE_UUID`. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-001 |
| TC-CB-051 | Supervisor | Supervisor activates GENERATED box → 200 FREE | P1 | 1. Pre-condition: A GENERATED box `CB_GEN_SUP` exists. 2. Login as Supervisor. 3. `POST /api/v1/child-boxes/<CB_GEN_SUP>/activate`. | HTTP 200. `data.status = "FREE"`. | API | Supervisor has `child_boxes:update` in seed |

---

### 2.2 — Denied roles on activate

**Matrix discrepancy D1:** Warehouse Operator and Dispatch Operator do NOT have `child_boxes:update` in seeds. Both get 403.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-052 | Warehouse Operator | Warehouse Operator cannot activate — 403 | P0 | 1. Pre-condition: A GENERATED box `CB_GEN_WH` exists. 2. Login as Warehouse Operator. 3. `POST /api/v1/child-boxes/<CB_GEN_WH>/activate`. | HTTP 403. `"Required permission: child_boxes:update"`. Box remains GENERATED. | API | DISCREPANCY: old TC-CB-052 said 200; code says 403. Warehouse Op lacks `child_boxes:update` in seed. |
| TC-CB-053 | Dispatch Operator | Dispatch Operator cannot activate — 403 | P0 | 1. Pre-condition: A GENERATED box `CB_GEN_DP` exists. 2. Login as Dispatch Operator. 3. `POST /api/v1/child-boxes/<CB_GEN_DP>/activate`. | HTTP 403. Box remains GENERATED. | API | DISCREPANCY: old TC-CB-053 said 200; code says 403. Dispatch Op lacks `child_boxes:update` in seed. |
| TC-CB-054 | Unauthenticated | Unauthenticated activate returns 401 | P0 | 1. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate` — no Authorization header. | HTTP 401. Box status unchanged. | API | AUTOMATION GAP |

---

### 2.3 — Idempotency: FREE → FREE (no audit noise)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-055 | Admin | Activating an already-FREE box returns 200 unchanged | P0 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"`. Count `inventory_transactions` rows for this box (`n_before`). 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_FREE_UUID>/activate`. 4. Count rows again (`n_after`). | HTTP 200. `data.status = "FREE"`. `n_after = n_before` — no new `CHILD_ACTIVATED` row written. No new `audit_log` entry. | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-003. Service returns early on `box.status === FREE` without writing DB. |
| TC-CB-056 | Admin | Activating FREE box twice — both calls return 200 | P1 | 1. Pre-condition: `CB_FREE_UUID` is FREE. 2. Login as Admin. 3. Call `POST /api/v1/child-boxes/<CB_FREE_UUID>/activate` twice in sequence. | Both return HTTP 200. `status = "FREE"` on both. No error. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-003 (secondary assertion) |

---

### 2.4 — Conflict: PACKED / DISPATCHED / SAMPLE / ECOMMERCE

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-057 | Admin | Activating PACKED box returns 409 | P0 | 1. Pre-condition: `CB_PACKED_UUID` has `status="PACKED"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_PACKED_UUID>/activate`. | HTTP 409. `message` = `"Cannot activate child box in PACKED status"`. Box remains PACKED. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-004 |
| TC-CB-058 | Admin | Activating DISPATCHED box returns 409 | P0 | 1. Pre-condition: `CB_DISP_UUID` has `status="DISPATCHED"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_DISP_UUID>/activate`. | HTTP 409. `message` = `"Cannot activate child box in DISPATCHED status"`. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-005 |
| TC-CB-059 | Admin | Activating SAMPLE box returns 409 | P0 | 1. Pre-condition: `CB_SAMPLE_UUID` has `status="SAMPLE"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_SAMPLE_UUID>/activate`. | HTTP 409. `message` = `"Cannot activate child box in SAMPLE status"`. Constants define SAMPLE as a valid status; service's `PACKED/DISPATCHED` check also catches SAMPLE (it branches from FREE — it is not FREE, PACKED, or DISPATCHED, so the service falls through to the activate path). **Verify:** if service only checks `PACKED|DISPATCHED`, SAMPLE activation may succeed inadvertently. AUTOMATION GAP — requires explicit assertion. | API | AUTOMATION GAP: no existing TC for SAMPLE status conflict |
| TC-CB-060 | Admin | Activating ECOMMERCE box returns 409 | P0 | 1. Pre-condition: `CB_ECOM_UUID` has `status="ECOMMERCE"`. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_ECOM_UUID>/activate`. | HTTP 409 OR (if service only guards PACKED/DISPATCHED) HTTP 200 with `status=FREE` — whichever the code produces, document the actual behavior. **Expected by design:** 409 since ECOMMERCE is terminal. | API | AUTOMATION GAP: requires verification against actual service logic path |
| TC-CB-061 | Admin | Activate non-existent ID returns 404 | P1 | 1. Login as Admin. 2. `POST /api/v1/child-boxes/00000000-0000-0000-0000-000000000000/activate`. | HTTP 404. `"Child box not found"`. | API | AUTOMATION GAP |

---

### 2.5 — Activation audit trail

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-065 | Admin | Activation writes CHILD_ACTIVATED transaction + audit_log | P0 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Login as Admin. 3. `POST /api/v1/child-boxes/<CB_GEN_UUID>/activate`. 4. `GET /api/v1/inventory/transactions?child_box_id=<CB_GEN_UUID>&limit=50`. 5. Check audit_log for `action='ACTIVATE_CHILD_BOX'` on `<CB_GEN_UUID>`. | Step 4: rows include `CHILD_CREATED` and `CHILD_ACTIVATED`. `CHILD_ACTIVATED` notes = `"Child box activated (label scanned, now real inventory): CB######"`. Step 5: audit row has `old_values.status = "GENERATED"`, `new_values.status = "FREE"`. | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-002 |
| TC-CB-066 | Admin | Activation does not write a second CHILD_CREATED | P1 | 1. Activate `CB_GEN_UUID`. 2. `GET /api/v1/inventory/transactions?child_box_id=<CB_GEN_UUID>&limit=50`. Group by `transaction_type`. | Exactly: `CHILD_CREATED = 1`, `CHILD_ACTIVATED = 1`. No other transaction types. | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-ACT-002 |
| TC-CB-067 | Admin | Transaction order is chronological: CHILD_CREATED before CHILD_ACTIVATED | P1 | 1. Activate a GENERATED box. 2. Fetch transactions ordered by `created_at ASC`. | First row: `CHILD_CREATED`. Second row: `CHILD_ACTIVATED`. `created_at` of CHILD_ACTIVATED >= CHILD_CREATED. | Integration | AUTOMATION GAP |

---

## Section 3 — Implicit Activation

**Definition:** when a GENERATED box is packed directly into a master carton, sample, or ecommerce order (without calling `POST /:id/activate` first), the service writes both a `CHILD_ACTIVATED` and a `CHILD_PACKED` / `CHILD_SAMPLED` / `CHILD_ECOMMERCED` transaction. This is a documented read-with-side-effect on the packing path.

### 3.1 — Pack GENERATED → PACKED (dual transaction)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-070 | Admin | Packing GENERATED box into master carton → status PACKED | P0 | 1. Pre-condition: GENERATED box `CB_GEN_PACK`. Active carton `MC_UUID_A`. 2. Login as Admin. 3. `POST /api/v1/master-cartons` (or pack endpoint) with `child_box_barcodes: ["<CB_GEN_PACK_BARCODE>"]`. 4. `GET /api/v1/child-boxes/<CB_GEN_PACK>`. | Step 4: `data.status = "PACKED"` (not GENERATED). | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-PACK-001 |
| TC-CB-071 | Admin | Packing GENERATED box emits CHILD_ACTIVATED + CHILD_PACKED in order | P0 | 1. Pre-condition: GENERATED box `CB_GEN_PACK`. 2. Pack it into a master carton. 3. `GET /api/v1/inventory/transactions?child_box_id=<CB_GEN_PACK>&limit=50` ordered by `created_at ASC`. | Rows in order: `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_PACKED`. Exactly 3 rows. `CHILD_ACTIVATED` precedes `CHILD_PACKED`. | Integration | Dual-transaction path in service. AUTOMATION GAP for explicit ordering assertion. |
| TC-CB-072 | Admin | Creating master carton with GENERATED barcode — both boxes PACKED | P0 | 1. Pre-condition: GENERATED boxes `CB_GEN_1`, `CB_GEN_2`. 2. `POST /api/v1/master-cartons` body: `{"child_box_barcodes":["<B1>","<B2>"]}`. | HTTP 201. Carton `child_count = 2`. Both boxes now `status = "PACKED"`. `inventory_transactions` for each box contains `CHILD_ACTIVATED` and `CHILD_PACKED`. | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-PACK-001 |

---

### 3.2 — Sample GENERATED → SAMPLE (implicit activation)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-075 | Admin | Adding GENERATED box to sample → box status SAMPLE | P0 | 1. Pre-condition: GENERATED box `CB_GEN_SAMP`. 2. Login as Admin. 3. `POST /api/v1/samples` with `child_box_barcodes: ["<CB_GEN_SAMP_BARCODE>"]`. 4. `GET /api/v1/child-boxes/<CB_GEN_SAMP>`. | Step 4: `data.status = "SAMPLE"`. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-PACK-002 |
| TC-CB-076 | Admin | Sampled GENERATED box — transactions include CHILD_ACTIVATED + CHILD_SAMPLED | P1 | 1. Add GENERATED box to sample (TC-CB-075). 2. Query transactions for box. | Rows include `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_SAMPLED` in that order. | Integration | AUTOMATION GAP |

---

### 3.3 — Ecommerce GENERATED → ECOMMERCE (implicit activation)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-078 | Admin | Adding GENERATED box to ecommerce order → box status ECOMMERCE | P0 | 1. Pre-condition: GENERATED box `CB_GEN_ECOM`. 2. Login as Admin. 3. `POST /api/v1/ecommerce` with `child_box_barcodes: ["<CB_GEN_ECOM_BARCODE>"]`. 4. `GET /api/v1/child-boxes/<CB_GEN_ECOM>`. | Step 4: `data.status = "ECOMMERCE"`. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-PACK-003 |
| TC-CB-079 | Admin | Ecommerced GENERATED box — transactions include CHILD_ACTIVATED + CHILD_ECOMMERCED | P1 | 1. Add GENERATED box to ecommerce (TC-CB-078). 2. Query transactions for box. | Rows include `CHILD_CREATED`, `CHILD_ACTIVATED`, `CHILD_ECOMMERCED`. | Integration | AUTOMATION GAP |

---

### 3.4 — Packing FREE box — no duplicate CHILD_ACTIVATED

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-082 | Admin | Packing an already-FREE box does NOT write a second CHILD_ACTIVATED | P1 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"` (was already explicitly activated). Active carton exists. 2. Login as Admin. 3. Pack `CB_FREE_UUID` into carton. 4. Query transactions for `CB_FREE_UUID`. | Rows: `CHILD_CREATED`, `CHILD_ACTIVATED` (from explicit activation), `CHILD_PACKED`. Exactly 1 `CHILD_ACTIVATED` row — no duplicate. | Integration | AUTOMATION GAP |

---

## Section 4 — GET by QR

**Note:** `getChildBoxByQR` returns an `active_sample_feet` field (array from `sample_box_mapping` for active sample mappings). `getChildBoxById` does NOT return this field. This is a deliberate design choice — document it.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-090 | Admin | GET /child-boxes/qr/:barcode — returns box with active_sample_feet | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/CB######` (barcode of `CB_GEN_UUID`). | HTTP 200. `data.barcode = "CB######"`. All product fields populated (`article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`). **`data.active_sample_feet` is an array** (empty `[]` for non-sampled box). | API | `active_sample_feet` present only in QR lookup, not in GET-by-ID. AUTOMATION GAP: no existing spec asserts this field. |
| TC-CB-091 | Admin | GET /child-boxes/qr/:barcode — box with active sample foot shows foot in active_sample_feet | P1 | 1. Pre-condition: `CB_SAMPLE_UUID` is in a sample with `foot="LEFT"` active. 2. Login as Admin. 3. `GET /api/v1/child-boxes/qr/<CB_SAMPLE_UUID_BARCODE>`. | HTTP 200. `data.active_sample_feet` contains `"LEFT"`. `data.status = "SAMPLE"`. | API | AUTOMATION GAP |
| TC-CB-092 | Admin | GET /child-boxes/qr/:barcode — barcode is case-insensitive (UPPER applied) | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/cb######` (all lowercase). | HTTP 200. Same box returned. Service applies `UPPER($1)`. | API | AUTOMATION GAP |
| TC-CB-093 | Admin | GET /child-boxes/qr/NONEXISTENT returns 404 | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/qr/CBXXXXXX`. | HTTP 404. `"Child box not found for this QR code"`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-READ-004 |
| TC-CB-094 | Supervisor | Supervisor can GET by QR — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes/qr/<CB_GEN_UUID_BARCODE>`. | HTTP 200. Valid response. | API | GET /qr is auth-only; all roles 200 |
| TC-CB-095 | Warehouse Operator | Warehouse Operator can GET by QR — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes/qr/<CB_GEN_UUID_BARCODE>`. | HTTP 200. Valid response. | API | |
| TC-CB-096 | Dispatch Operator | Dispatch Operator can GET by QR — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes/qr/<CB_GEN_UUID_BARCODE>`. | HTTP 200. Valid response. | API | AUTOMATION GAP: no Dispatch Op QR test |
| TC-CB-097 | Unauthenticated | Unauthenticated GET by QR returns 401 | P0 | 1. `GET /api/v1/child-boxes/qr/<barcode>` — no token. | HTTP 401. | API | AUTOMATION GAP |

---

## Section 5 — GET by ID

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-100 | Admin | GET /child-boxes/:id — returns full detail (no active_sample_feet) | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 200. `data` contains: `id`, `barcode`, `status`, `quantity`, `product_id`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `created_at`, `updated_at`. `active_sample_feet` field is **NOT present** (only on QR endpoint). | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-READ-001 (partial) |
| TC-CB-101 | Supervisor | Supervisor can GET by ID — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 200. Valid detail. | API | GET /:id is auth-only |
| TC-CB-102 | Warehouse Operator | Warehouse Operator can GET by ID — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 200. Valid detail. | API | |
| TC-CB-103 | Dispatch Operator | Dispatch Operator can GET by ID — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 200. Valid detail. | API | AUTOMATION GAP |
| TC-CB-104 | Unauthenticated | Unauthenticated GET by ID returns 401 | P0 | 1. `GET /api/v1/child-boxes/<CB_GEN_UUID>` — no token. | HTTP 401. | API | AUTOMATION GAP |
| TC-CB-105 | Admin | GET /child-boxes/:id — non-existent UUID returns 404 | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/00000000-0000-0000-0000-000000000000`. | HTTP 404. `"Child box not found"`. | API | AUTOMATION GAP |

---

## Section 6 — List (GET /child-boxes) with filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-110 | Admin | GET /child-boxes returns paginated list — all statuses | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes`. | HTTP 200. `{"data":[...],"total":<n>,"page":1,"limit":25,"totalPages":<n>}`. Each item has `id`, `barcode`, `status`, `product_id`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `created_at`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-READ-001 |
| TC-CB-111 | Admin | Filter status=GENERATED returns only GENERATED | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=GENERATED`. | HTTP 200. All items `status = "GENERATED"`. No FREE/PACKED/etc. `total` = GENERATED count. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-UI-002 |
| TC-CB-112 | Admin | Filter status=FREE returns only FREE | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=FREE`. | HTTP 200. All items `status = "FREE"`. | API | Realizing spec: 19-childbox-rbac.spec.ts TC-CB-READ-002 |
| TC-CB-113 | Admin | Filter status=PACKED returns only PACKED | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=PACKED`. | HTTP 200. All items `status = "PACKED"`. | API | AUTOMATION GAP |
| TC-CB-114 | Admin | Filter status=SAMPLE returns only SAMPLE | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=SAMPLE`. | HTTP 200. All items `status = "SAMPLE"`. Note: UI status dropdown does not have SAMPLE option (only API-level filter). | API | AUTOMATION GAP; UI gap — no SAMPLE filter chip (D3) |
| TC-CB-115 | Admin | Filter status=ECOMMERCE returns only ECOMMERCE | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?status=ECOMMERCE`. | HTTP 200. All items `status = "ECOMMERCE"`. | API | AUTOMATION GAP; UI gap — no ECOMMERCE filter chip (D3) |
| TC-CB-116 | Admin | Filter by product_id | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?product_id=<PRODUCT_UUID_A>`. | HTTP 200. All items `product_id = PRODUCT_UUID_A`. | API | AUTOMATION GAP |
| TC-CB-117 | Admin | Search by barcode substring (case-insensitive ILIKE) | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?search=CB`. | HTTP 200. All returned items have `barcode` containing "CB". | API | AUTOMATION GAP |
| TC-CB-118 | Admin | Search by article_name substring | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?search=Busker`. | HTTP 200. All items `article_name` contains "Busker". | API | AUTOMATION GAP |
| TC-CB-119 | Admin | Search by SKU substring | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?search=<sku_prefix>`. | HTTP 200. All items `sku` contains the search term. Service uses ILIKE on `p.sku`. | API | AUTOMATION GAP |
| TC-CB-120 | Admin | Pagination — page 2 returns next set | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes?page=1&limit=5`. Note last item. 3. `GET /api/v1/child-boxes?page=2&limit=5`. | Step 3 returns next 5 items. `page=2` in response. No overlap with page 1. | API | AUTOMATION GAP |
| TC-CB-121 | Supervisor | Supervisor can list child boxes — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes`. | HTTP 200. Valid paginated list. | API | Auth-only GET |
| TC-CB-122 | Warehouse Operator | Warehouse Operator can list child boxes — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes`. | HTTP 200. Valid paginated list. | API | |
| TC-CB-123 | Dispatch Operator | Dispatch Operator can list child boxes — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes`. | HTTP 200. Valid paginated list. | API | AUTOMATION GAP |
| TC-CB-124 | Unauthenticated | Unauthenticated list returns 401 | P0 | 1. `GET /api/v1/child-boxes` — no token. | HTTP 401. | API | AUTOMATION GAP |

---

## Section 7 — Free endpoint (GET /child-boxes/free)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-130 | Admin | GET /child-boxes/free returns only FREE boxes | P0 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/free`. | HTTP 200. All items `status = "FREE"`. No GENERATED/PACKED/DISPATCHED items. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-002 |
| TC-CB-131 | Admin | GENERATED box not returned by /free | P0 | 1. Pre-condition: `CB_GEN_UUID` has `status="GENERATED"`. 2. Login as Admin. 3. `GET /api/v1/child-boxes/free`. | HTTP 200. `CB_GEN_UUID` NOT present in `data`. | API | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-002 |
| TC-CB-132 | Admin | /free filtered by product_id | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/free?product_id=<PRODUCT_UUID_A>`. | HTTP 200. All returned boxes have `product_id = PRODUCT_UUID_A` AND `status = "FREE"`. | API | AUTOMATION GAP |
| TC-CB-133 | Admin | /free paginated — page + limit params work | P1 | 1. Login as Admin. 2. `GET /api/v1/child-boxes/free?page=1&limit=5`. | HTTP 200. At most 5 items. `total` reflects all FREE boxes. | API | AUTOMATION GAP |
| TC-CB-134 | Supervisor | Supervisor can call /free — 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/child-boxes/free`. | HTTP 200. | API | Auth-only |
| TC-CB-135 | Warehouse Operator | Warehouse Operator can call /free — 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/child-boxes/free`. | HTTP 200. | API | |
| TC-CB-136 | Dispatch Operator | Dispatch Operator can call /free — 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/child-boxes/free`. | HTTP 200. | API | AUTOMATION GAP |
| TC-CB-137 | Unauthenticated | Unauthenticated /free returns 401 | P0 | 1. `GET /api/v1/child-boxes/free` — no token. | HTTP 401. | API | AUTOMATION GAP |

---

## Section 8 — Stock semantics

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-140 | Admin | GENERATED box not counted in pairsInStock (dashboard KPI) | P0 | 1. `GET /api/v1/inventory/dashboard` → note `pairsInStock = N`. 2. Create a GENERATED box (do NOT activate). 3. `GET /api/v1/inventory/dashboard`. | `pairsInStock` in step 3 = `N` (unchanged). | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-STOCK-001 |
| TC-CB-141 | Admin | GENERATED box counted in total boxes KPI | P0 | 1. `GET /api/v1/inventory/dashboard` → note total box count `T`. 2. Create a GENERATED box. 3. `GET /api/v1/inventory/dashboard`. | `total` in step 3 = `T + 1` (or `T + quantity`). | Integration | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-STOCK-002 |
| TC-CB-142 | Admin | Activating GENERATED box increases pairsInStock by box.quantity | P0 | 1. Note `pairsInStock = N`. 2. Create 1 GENERATED box with `quantity=2`. 3. Confirm `pairsInStock` still `N`. 4. Activate the box. 5. `GET /api/v1/inventory/dashboard`. | Step 3: `pairsInStock = N`. Step 5: `pairsInStock = N + 2`. | Integration | AUTOMATION GAP |
| TC-CB-143 | Admin | Stock hierarchy /inventory/stock excludes GENERATED boxes | P1 | 1. Pre-condition: 2 GENERATED boxes for `PRODUCT_UUID_A`, 0 FREE boxes. 2. Query the stock hierarchy endpoint for `PRODUCT_UUID_A`. | Stock figure for `PRODUCT_UUID_A` is 0. GENERATED boxes excluded. | API | AUTOMATION GAP |

---

## Section 9 — Sample and Ecommerce terminal states

**Note:** SAMPLE and ECOMMERCE are terminal states in `CHILD_BOX_STATUS`. A box in SAMPLE status is counted at the **box level** (one SAMPLE box = 1 box regardless of how many feet are sampled). Dispatch flips a box to DISPATCHED only on its last foot dispatch.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-150 | Admin | SAMPLE box not returned by /free | P0 | 1. Pre-condition: `CB_SAMPLE_UUID` has `status="SAMPLE"`. 2. `GET /api/v1/child-boxes/free`. | `CB_SAMPLE_UUID` NOT in results. | API | AUTOMATION GAP |
| TC-CB-151 | Admin | ECOMMERCE box not returned by /free | P0 | 1. Pre-condition: `CB_ECOM_UUID` has `status="ECOMMERCE"`. 2. `GET /api/v1/child-boxes/free`. | `CB_ECOM_UUID` NOT in results. | API | AUTOMATION GAP |
| TC-CB-152 | Admin | SAMPLE box listed under status=SAMPLE filter | P1 | 1. `GET /api/v1/child-boxes?status=SAMPLE`. | `CB_SAMPLE_UUID` present. All items `status = "SAMPLE"`. | API | AUTOMATION GAP |
| TC-CB-153 | Admin | ECOMMERCE box listed under status=ECOMMERCE filter | P1 | 1. `GET /api/v1/child-boxes?status=ECOMMERCE`. | `CB_ECOM_UUID` present. All items `status = "ECOMMERCE"`. | API | AUTOMATION GAP |

---

## Section 10 — UI: Child Boxes list page

### 10.1 — Page load, column layout, aging legend

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E01 | Admin | Child Boxes list page loads at /child-boxes | P0 | 1. Login as Admin. 2. Navigate to `/child-boxes`. | URL = `/child-boxes`. Heading "Child Boxes". Search input visible. Status dropdown visible. Product dropdown visible. Table headers: Barcode, Product, SKU, Colour, Size, MRP, Status, Created, Actions. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-CB-001; 19-childbox-rbac.spec.ts TC-CB-E2E-001; 30-generated-lifecycle.spec.ts TC-GENL-UI-001 |
| TC-CB-E02 | Admin | Aging legend visible above table — "Generated boxes excluded" | P0 | 1. Navigate to `/child-boxes`. | Legend strip shows: "FREE box aging (Generated boxes excluded):" with yellow swatch (90–179 days) and red swatch (180+ days). | E2E | Realizing spec: page.tsx line 207–215 |
| TC-CB-E03 | Admin | Table includes checkbox column (select for print) | P1 | 1. Navigate to `/child-boxes`. 2. Wait for data to load. | Header checkbox (indeterminate state) visible. Each row has a checkbox. | E2E | AUTOMATION GAP |

---

### 10.2 — Status filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E05 | Admin | Status dropdown contains GENERATED option | P0 | 1. Navigate to `/child-boxes`. | Status `<select>` element has `<option value="GENERATED">Generated</option>` present. | E2E | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-UI-001 |
| TC-CB-E06 | Admin | Status dropdown contains All/Generated/Free/Packed/Dispatched (not SAMPLE/ECOMMERCE) | P1 | 1. Navigate to `/child-boxes`. 2. Open the status select element. | Options: "All Statuses", "Generated", "Free", "Packed", "Dispatched". SAMPLE and ECOMMERCE options are **absent** from the dropdown (matrix discrepancy D3). | E2E | page.tsx lines 233–240 |
| TC-CB-E07 | Admin | Selecting GENERATED filter shows only GENERATED boxes | P0 | 1. Navigate to `/child-boxes`. 2. Select "Generated" in status dropdown. 3. Wait for list to reload. | All visible rows have "Generated" status badge. No FREE/PACKED/DISPATCHED rows. Pagination reflects GENERATED count. | E2E | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-UI-002 |
| TC-CB-E08 | Admin | Selecting FREE filter shows only FREE boxes | P0 | 1. Navigate to `/child-boxes`. 2. Select "Free" in status dropdown. | All visible rows have "Free" status badge. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-CB-005 |
| TC-CB-E09 | Admin | Selecting All Statuses resets filter | P1 | 1. Navigate to `/child-boxes?status=GENERATED`. 2. Select "All Statuses". | List reloads showing all statuses. Pagination reflects total count. | E2E | AUTOMATION GAP |

---

### 10.3 — Product filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E12 | Admin | Product dropdown shows active products | P1 | 1. Navigate to `/child-boxes`. | Product `<select>` contains at least "All Products" + active products from DB. Inactive products not shown (queried with `is_active: true`). | E2E | page.tsx line 78 |
| TC-CB-E13 | Admin | Selecting product filter restricts list | P1 | 1. Navigate to `/child-boxes`. 2. Select product `PRODUCT_UUID_A` in product dropdown. | All rows show article name matching selected product. Count in pagination decreases. | E2E | AUTOMATION GAP |

---

### 10.4 — Search filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E15 | Admin | Search by barcode substring filters list | P1 | 1. Navigate to `/child-boxes`. 2. Type a known barcode prefix (e.g. first 4 chars) in search input. | Table rows filtered to matching barcodes. Debounce resets page to 1. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-CB-006 |
| TC-CB-E16 | Admin | Search by article name filters list | P1 | 1. Navigate to `/child-boxes`. 2. Type "Busker" in search input. | All rows show "Busker" in product column. | E2E | AUTOMATION GAP |
| TC-CB-E17 | Admin | Search by SKU filters list | P1 | 1. Navigate to `/child-boxes`. 2. Type a known SKU in search input. | All rows match the SKU. | E2E | AUTOMATION GAP |

---

### 10.5 — Aging tint (FREE only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E20 | Admin | FREE box aged 90+ days gets yellow tint (bg-yellow-50) | P1 | 1. Pre-condition: A FREE box `CB_OLD_FREE` with `created_at` = 91 days ago (inject via DB or mock date). 2. Navigate to `/child-boxes`. Filter by "Free". | Row for `CB_OLD_FREE` has class `bg-yellow-50` (desktop) or `bg-yellow-50` (mobile card). Age badge visible showing day count. | E2E | `getAgingState` returns `"yellow"` for 90–179 days FREE |
| TC-CB-E21 | Admin | FREE box aged 180+ days gets red tint (bg-red-50) | P1 | 1. Pre-condition: A FREE box `CB_VERY_OLD` with `created_at` = 181 days ago. 2. Navigate to `/child-boxes`. | Row has class `bg-red-50`. Age badge shows day count with red styling. | E2E | `getAgingState` returns `"red"` for >= 180 days FREE |
| TC-CB-E22 | Admin | GENERATED box aged 180+ days has NO tint | P1 | 1. Pre-condition: A GENERATED box `CB_OLD_GEN` with `created_at` = 181 days ago. 2. Navigate to `/child-boxes`. Filter by "Generated". | Row for `CB_OLD_GEN` has no yellow/red background. `getAgingState` returns `null` for non-FREE status. | E2E | Realizing spec: page.tsx `getAgingState` — only acts on status === 'FREE' |
| TC-CB-E23 | Admin | PACKED box aged 180+ days has NO tint | P1 | 1. Pre-condition: A PACKED box with `created_at` = 181 days ago. 2. Navigate to `/child-boxes`. Filter by "Packed". | Row has no yellow/red tint. | E2E | AUTOMATION GAP |
| TC-CB-E24 | Admin | FREE box aged < 90 days has no tint | P2 | 1. Pre-condition: A newly activated FREE box (< 90 days old). 2. Navigate to `/child-boxes`. | Row has no color tint. Default white/hover-gray only. | E2E | AUTOMATION GAP |

---

### 10.6 — Print-selected

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E28 | Admin | Print Selected button appears when checkboxes selected | P1 | 1. Navigate to `/child-boxes`. Wait for data. 2. Check one row's checkbox. | "Print Selected (1)" button appears in page header area. | E2E | page.tsx line 179 |
| TC-CB-E29 | Admin | Print Selected count increases with each selection | P1 | 1. Navigate to `/child-boxes`. 2. Select 3 rows. | Button label shows "Print Selected (3)". | E2E | AUTOMATION GAP |
| TC-CB-E30 | Admin | Select-all header checkbox selects all visible rows | P1 | 1. Navigate to `/child-boxes`. 2. Click header checkbox. | All row checkboxes checked. Print Selected button shows full page count. | E2E | AUTOMATION GAP |
| TC-CB-E31 | Admin | Header checkbox is indeterminate when some (not all) rows selected | P2 | 1. Navigate to `/child-boxes`. 2. Check some (not all) rows. | Header checkbox is in indeterminate state (visual indicator). | E2E | AUTOMATION GAP |
| TC-CB-E32 | Warehouse Operator | Warehouse Operator can print labels — print button visible | P1 | 1. Login as Warehouse Operator. Navigate to `/child-boxes`. 2. Check a row checkbox. | "Print Selected (1)" button visible. No RBAC gate on print action. | E2E | Print has no permission guard in page.tsx |
| TC-CB-E33 | Dispatch Operator | Dispatch Operator sees list but no Generate Labels or Bulk Import buttons | P0 | 1. Login as Dispatch Operator. Navigate to `/child-boxes`. | Search, filter dropdowns, table visible. "Generate Labels" button NOT visible. "Bulk Import" button NOT visible. (Both guarded by `canCreate = useCan('child_boxes:create')`.) Print label per-row button still visible. | E2E | AUTOMATION GAP |

---

### 10.7 — RBAC guards on page actions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-E36 | Warehouse Operator | Warehouse Operator does not see Bulk Import button | P0 | 1. Login as Warehouse Operator. Navigate to `/child-boxes`. | "Bulk Import" button NOT visible. `useCan('child_boxes:create')` returns true for WH Op (they have the permission) — so WH Op CAN see Bulk Import. **Verify:** canCreate is true for Warehouse Op per seed. | E2E | page.tsx: `{canCreate && <Button>Bulk Import</Button>}` — WH Op has `child_boxes:create`, so they CAN see it |
| TC-CB-E37 | Dispatch Operator | Dispatch Operator does not see Generate Labels or Bulk Import | P0 | 1. Login as Dispatch Operator. Navigate to `/child-boxes`. | Neither "Generate Labels" nor "Bulk Import" buttons visible. `canCreate` = false for Dispatch Op. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-CB-005 analogy |
| TC-CB-E38 | Admin | Admin sees Bulk Import and Generate Labels buttons | P0 | 1. Login as Admin. Navigate to `/child-boxes`. | Both "Bulk Import" (Upload icon) and "Generate Labels" (Plus icon) buttons visible. | E2E | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-UI-001 |
| TC-CB-E39 | Supervisor | Supervisor sees Bulk Import and Generate Labels buttons | P1 | 1. Login as Supervisor. Navigate to `/child-boxes`. | Both buttons visible. `canCreate` = true for Supervisor. | E2E | AUTOMATION GAP |

---

## Section 11 — UI: Generate Labels page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-G01 | Admin | Generate Labels page loads at /child-boxes/generate | P0 | 1. Login as Admin. Navigate to `/child-boxes/generate`. | Heading "Generate Labels". Searchable article dropdown with placeholder "Search and select a product...". No colour or size selector yet visible. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-001; 19-childbox-rbac.spec.ts TC-CB-E2E-002 |
| TC-CB-G02 | Admin | Searchable product dropdown filters on typing | P0 | 1. Navigate to `/child-boxes/generate`. 2. Click dropdown. 3. Type "Busker". | Dropdown narrows to products matching "Busker". Non-matching products hidden. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-002 |
| TC-CB-G03 | Admin | Selecting article shows colour pills | P1 | 1. Go to `/child-boxes/generate`. 2. Select an article from dropdown. | Colour section appears with pill buttons (one per distinct colour). No size table yet. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-003 |
| TC-CB-G04 | Admin | Selecting colour shows size table with quantity inputs | P0 | 1. Select article + colour. | Size table appears with rows for each size. Each row has a numeric input. Heading "No. of Labels" or equivalent. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-004 |
| TC-CB-G05 | Admin | Entering quantities shows live summary "Total labels: N" | P1 | 1. Select article + colour. 2. Enter `3` in Size 6, `2` in Size 7. | Summary shows "Total labels: 5". | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-005 |
| TC-CB-G06 | Admin | Generate button disabled when no sizes entered | P0 | 1. Navigate to `/child-boxes/generate`. Select article and colour but enter 0 in all size inputs. | "Confirm & Generate" button is disabled. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-006 |
| TC-CB-G07 | Admin | Successful multi-size generate shows success view and GENERATED status | P0 | 1. Select article + colour. Enter `2` for one size. 2. Click "Confirm & Generate". | Success view appears: "N Labels Generated". Buttons: "Generate More", "Print Labels", "View All Child Boxes". API-verified: created boxes have `status = "GENERATED"`. Barcodes match short format `/^CB[0-9A-Z]{6}$/`. | E2E | Realizing spec: 03-child-boxes.spec.ts TC-MSQR-007; TC-CB-007 |
| TC-CB-G08 | Admin | Total > env cap (default 500) shows validation error | P1 | 1. Enter quantities summing to 501 across sizes. 2. Click Submit. | Error: "Total count across all sizes must not exceed 500" (or variant). No API call made. | E2E | Env cap default 500; live = 1500 via `CHILD_BOX_MAX_PER_GENERATION` |
| TC-CB-G09 | Dispatch Operator | Dispatch Operator redirected or denied on generate page | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/child-boxes/generate`. | Permission denied, redirect to `/child-boxes`, or form submission blocked. | E2E | AUTOMATION GAP |

---

## Section 12 — UI: Scan page auto-activation

**Note (read-with-side-effect):** `GET /api/v1/child-boxes/qr/:barcode` is a pure read — it does NOT activate the box. The scan/traceability **UI** fires a separate `POST /:id/activate` call when it detects `status === "GENERATED"` on the QR-lookup response. This is a client-side useEffect, not a backend side-effect on the GET endpoint itself.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-S01 | Admin | Scanning GENERATED barcode on /scan triggers activation toast + status flip | P0 | 1. Pre-condition: `CB_GEN_UUID` is GENERATED. 2. Login as Admin. Navigate to `/scan`. 3. Enter `CB######` barcode. 4. Submit. 5. Wait ~3s. | Box detail shown. Toast: "Box activated" / "now part of available stock" or equivalent. Box status shown as FREE. Subsequent `GET /api/v1/child-boxes/<id>` confirms `status = "FREE"`. | E2E | Realizing spec: 30-generated-lifecycle.spec.ts TC-GENL-UI-003 |
| TC-CB-S02 | Admin | Scanning FREE barcode on /scan does NOT trigger activation toast | P1 | 1. Pre-condition: `CB_FREE_UUID` has `status="FREE"`. 2. Login as Admin. Navigate to `/scan`. 3. Enter barcode. | Box detail shown. No "activated" toast. Status remains "FREE". | E2E | AUTOMATION GAP: no explicit no-toast assertion in current specs |
| TC-CB-S03 | Admin | Scanning PACKED barcode on /scan — no activation side-effect | P1 | 1. Pre-condition: `CB_PACKED_UUID` has `status="PACKED"`. 2. Scan barcode on `/scan`. | Box detail shown. No activation call (status is not GENERATED so useEffect guard skips). Status shows "PACKED". | E2E | AUTOMATION GAP |
| TC-CB-S04 | Admin | Tracing GENERATED barcode on /traceability activates it | P1 | 1. Pre-condition: GENERATED box `CB_GEN_TRACE`. 2. Login as Admin. Navigate to `/traceability`. 3. Enter barcode + Search. | Box detail shown. Activation fires. Status updates to FREE. Timeline shows `CHILD_CREATED` then `CHILD_ACTIVATED`. | E2E | AUTOMATION GAP |
| TC-CB-S05 | Admin | Traceability deep-link `?qr=<barcode>` auto-activates GENERATED box | P1 | 1. Pre-condition: GENERATED box `CB_GEN_TRACE2`. 2. Login as Admin. Navigate to `/traceability?qr=<barcode>`. | Page auto-traces, finds box, fires activation, shows updated status FREE. | E2E | AUTOMATION GAP |

---

## Section 13 — RBAC Discrepancy TCs

These TCs encode known discrepancies between the master matrix and the old phase-07 file, or between seed/route behavior and documentation.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-CB-D01 | Warehouse Operator | Warehouse Operator cannot activate child box — 403 (D1 correction) | P0 | 1. Login as Warehouse Operator. 2. Create a GENERATED box (201 OK). 3. `POST /api/v1/child-boxes/<id>/activate`. | HTTP 403. `"Required permission: child_boxes:update"`. Warehouse Op has `child_boxes:create` and `child_boxes:read` in seed — NOT `child_boxes:update`. Old TC-CB-052 was wrong. | API | Discrepancy D1: corrects stale TC-CB-052 |
| TC-CB-D02 | Dispatch Operator | Dispatch Operator cannot activate child box — 403 (D1 correction) | P0 | 1. Login as Dispatch Operator. 2. Pre-condition: A GENERATED box exists. 3. `POST /api/v1/child-boxes/<id>/activate`. | HTTP 403. Dispatch Op has only `child_boxes:read` in seed — NOT `child_boxes:update`. Old TC-CB-053 was wrong. | API | Discrepancy D1: corrects stale TC-CB-053 |
| TC-CB-D03 | Admin | DELETE /child-boxes/:id — route does not exist (D2) | P1 | 1. Login as Admin. 2. `DELETE /api/v1/child-boxes/<CB_GEN_UUID>`. | HTTP 404 (route not found) or HTTP 405 (Method Not Allowed). Despite `child_boxes:delete` permission in seed, no DELETE route is registered in `childBox.routes.ts`. | API | Discrepancy D2: delete permission dead code |
| TC-CB-D04 | Admin | Status filter on /child-boxes UI does NOT offer SAMPLE or ECOMMERCE options (D3) | P1 | 1. Login as Admin. Navigate to `/child-boxes`. 2. Inspect status dropdown options. | Dropdown contains: "All Statuses", "Generated", "Free", "Packed", "Dispatched". SAMPLE and ECOMMERCE options absent. SAMPLE/ECOMMERCE boxes visible only under "All Statuses". This is a documented UI coverage gap, not a backend gap. | E2E | Discrepancy D3: SAMPLE/ECOMMERCE not filterable in UI |

---

*End of Phase 07 — Child Box Single Create + GENERATED Lifecycle*
