# Phase 10 — Master Cartons

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `TC-MC-NNN` (API / Integration / E2E)
**Phase dependencies:** Phase 07 (child-box lifecycle) must have run first so FREE and GENERATED boxes exist.
**Last refreshed:** 2026-06-09 (Session A10 — full rewrite against live code; stale content removed; new sections added for pack-by-barcode / serialized scan queue / open-legacy / assortment / list filters / legacy toggle; RBAC discrepancy on `cartons:close` corrected; Unpack-Repack module and legacy CSV upload scoped to A22/A23 with reference TCs here). **2026-06-10 label fixes:** Section 19 added — master-carton label responsive auto-fit (`fitText`), Kids-first size sort in SIZE ASSORTMENT columns, aggregated distinct articles/colours/MRPs.

---

## Table of Contents

1. [Shared Test Data](#shared-test-data)
2. [RBAC Summary for this module](#rbac-summary)
3. [Matrix Discrepancies](#matrix-discrepancies)
4. [Section 1 — List page (GET /master-cartons)](#section-1--list-page)
5. [Section 2 — Create master carton (POST /master-cartons)](#section-2--create-master-carton)
6. [Section 3 — Pack child box by UUID (POST /master-cartons/pack)](#section-3--pack-child-box-by-uuid)
7. [Section 4 — Pack by barcode / serialized scan ledger (POST /master-cartons/pack-by-barcode)](#section-4--pack-by-barcode--serialized-scan-ledger)
8. [Section 5 — Unpack child box (POST /master-cartons/unpack)](#section-5--unpack-child-box)
9. [Section 6 — Full unpack (POST /master-cartons/:id/full-unpack)](#section-6--full-unpack)
10. [Section 7 — Close master carton (POST /master-cartons/:id/close)](#section-7--close-master-carton)
11. [Section 8 — Open-for-Repacking (POST /master-cartons/:id/open-legacy)](#section-8--open-for-repacking)
12. [Section 9 — Read endpoints (GET)](#section-9--read-endpoints)
13. [Section 10 — Assortment aggregation (GET /master-cartons/:id/assortment)](#section-10--assortment-aggregation)
14. [Section 11 — Status transition integrity](#section-11--status-transition-integrity)
15. [Section 12 — Inventory transaction correctness](#section-12--inventory-transaction-correctness)
16. [Section 13 — Standalone Repack removed (route-gone confirmation)](#section-13--standalone-repack-removed)
17. [Section 14 — Frontend E2E: List page](#section-14--frontend-e2e-list-page)
18. [Section 15 — Frontend E2E: Create page (scan-to-pack + capacity)](#section-15--frontend-e2e-create-page)
19. [Section 16 — Frontend E2E: Detail page (scan ledger + actions)](#section-16--frontend-e2e-detail-page)
20. [Section 17 — Frontend E2E: HID-first scan UX](#section-17--frontend-e2e-hid-first-scan-ux)
21. [Section 18 — Cross-references (A22/A23 scope boundaries)](#section-18--cross-references)
22. [Section 19 — Frontend: master-carton label rendering (auto-fit, size sort, aggregation)](#section-19--frontend-master-carton-label-rendering)

---

## Shared Test Data

| Symbol | Meaning |
|---|---|
| `PRODUCT_UUID_A` | Active product: article "Binny Slipper", code "BS-001", colour "Blue", size "6", MRP ₹299.00 |
| `PRODUCT_UUID_B` | Active product: same article code, colour "Red", size "7", MRP ₹299.00 (for multi-colour/size assortment tests) |
| `CB_FREE_1..N` | FREE child boxes (created/activated via Phase 07/08) |
| `CB_GEN_1` | GENERATED child box (status = GENERATED, no explicit activation yet) |
| `CB_PACKED_X` | PACKED child box already in `MC_ACTIVE_UUID` |
| `MC_ACTIVE_UUID` | An ACTIVE master carton with at least 2 child boxes |
| `MC_CLOSED_UUID` | A CLOSED master carton (at least 1 child box) |
| `MC_CREATED_UUID` | A CREATED (empty) master carton |
| `MC_DISPATCHED_UUID` | A DISPATCHED master carton |
| `MC_LEGACY_UUID` | A legacy carton (`is_legacy = true`) with opaque count (no tracked child boxes) |
| API base | `http://localhost:5000/api/v1` |
| Short barcode format | `CB######` (6 upper-case alphanum) — see Phase 08/09 for format details |

---

## RBAC Summary

Permission ownership verified against `backend/seeds/001_roles.ts` (ground truth):

| Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:---:|:---:|:---:|:---:|
| `cartons:read` (GET endpoints) | ✓ | ✓ | ✓ | ✓ |
| `cartons:create` (POST /) | ✓ | ✓ | ✓ | ✗ |
| `cartons:close` (POST /:id/close) | ✓ | ✓ | **✓** | ✗ |
| `packing:pack` (POST /pack, /pack-by-barcode) | ✓ | ✓ | ✓ | ✗ |
| `packing:unpack` (POST /unpack, /:id/full-unpack, /repack/free-both, **/:id/open-legacy**) | ✓ | ✓ | ✓ | ✗ |
| `cartons:reopen` / `cartons:update` (seeded, but no current route uses these) | ✓ | ✓ | ✗ | ✗ |
| `cartons:delete` (no current route) | ✓ | ✗ | ✗ | ✗ |

> GET list (`GET /`) is authenticated but has NO permission gate — any authenticated user gets 200.
> GET detail, children, assortment, qr-by-barcode are the same (auth-only, no permission gate).

---

## Matrix Discrepancies

> Encode as explicit TCs with the **actual** behavior — not bugs to fix here.

**DISC-MC-1 (CRITICAL — stale file had wrong RBAC):** `cartons:close` is seeded for **Warehouse Operator** (`backend/seeds/001_roles.ts` line 74). The MASTER_TEST_PLAN matrix is correct; the pre-2026-06-09 version of this file was wrong (TC-MC-072 previously said 403). Correct behavior: Warehouse Operator CAN close a carton → HTTP 200. TCs in Section 7 now reflect this.

**DISC-MC-2:** `POST /:id/open-legacy` is guarded by `packing:unpack` (not `cartons:reopen`). Seeds give `packing:unpack` to Admin + Supervisor + Warehouse Operator. Therefore Warehouse Operator CAN open a legacy carton — even though the MASTER_TEST_PLAN matrix lists `cartons:reopen = Admin+Supervisor only`. Document as actual behavior; encode a TC asserting Warehouse Operator → 200 for open-legacy.

**DISC-MC-3:** `GET /master-cartons` list has NO `authorizePermission` call — it only goes through `authenticate`. Any authenticated role (including Dispatch Operator) gets 200. Asserted in TC-MC-090 series.

**DISC-MC-4:** The `20-cartons-lifecycle.spec.ts` Playwright spec still exercises a `POST /master-cartons/repack` route (TC-MC-REPACK-001) that was **deleted**. That test will fail. Flagged as AUTOMATION GAP.

---

## Section 1 — List page

> Route: `GET /api/v1/master-cartons`
> Auth: `authenticate` only (no permission gate → all 4 roles + unauthenticated).
> Query params: `page`, `limit`, `status` (enum), `search` (ILIKE on `carton_barcode`), `includeLegacy` (bool-string).
> Default: excludes `is_legacy = true` rows unless `includeLegacy=true`.

### 1.1 — Authentication

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-001 | Unauthenticated | GET list without token → 401 | P0 | 1. `GET /api/v1/master-cartons` with no `Authorization` header. | HTTP 401. Body `{ success: false, message: "Authentication required" }`. | API | Realised: `04-master-cartons.spec.ts` (TC-MC-001 indirectly via login guard). |
| TC-MC-002 | Admin | Admin gets paginated list → 200 | P0 | 1. Login as Admin. 2. `GET /api/v1/master-cartons`. | HTTP 200. Body: `{ success: true, data: [...], total: <n>, page: 1, limit: 25, totalPages: <n> }`. Each item contains `id`, `carton_barcode`, `status`, `child_count`, `max_capacity`, `created_at`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-READ-001. |
| TC-MC-003 | Supervisor | Supervisor gets list → 200 | P1 | 1. Login as Supervisor. 2. `GET /api/v1/master-cartons`. | HTTP 200. | API | Auth-only endpoint. |
| TC-MC-004 | Warehouse Operator | Warehouse Operator gets list → 200 | P1 | 1. Login as Warehouse Operator. 2. `GET /api/v1/master-cartons`. | HTTP 200. | API | |
| TC-MC-005 | Dispatch Operator | Dispatch Operator gets list → 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/master-cartons`. | HTTP 200. Dispatch Operator has `cartons:read` and the list endpoint is auth-only anyway. | API | DISC-MC-3. |

### 1.2 — Status filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-006 | Admin | Filter by status=ACTIVE | P1 | 1. `GET /api/v1/master-cartons?status=ACTIVE`. | HTTP 200. All returned items have `status = "ACTIVE"`. | API | Realised: `04-master-cartons.spec.ts` TC-MC-004. |
| TC-MC-007 | Admin | Filter by status=CLOSED | P1 | 1. `GET /api/v1/master-cartons?status=CLOSED`. | HTTP 200. All returned items have `status = "CLOSED"`. | API | |
| TC-MC-008 | Admin | Filter by status=CREATED | P1 | 1. `GET /api/v1/master-cartons?status=CREATED`. | HTTP 200. All returned items have `status = "CREATED"`. | API | |
| TC-MC-009 | Admin | Filter by status=DISPATCHED | P1 | 1. `GET /api/v1/master-cartons?status=DISPATCHED`. | HTTP 200. All returned items have `status = "DISPATCHED"`. | API | |
| TC-MC-010 | Admin | Invalid status value → 400 | P1 | 1. `GET /api/v1/master-cartons?status=INVALID`. | HTTP 400. Zod validation error — status must be one of CREATED/ACTIVE/CLOSED/DISPATCHED. | API | `masterCartonListQuerySchema` uses `z.enum(statusValues)`. |

### 1.3 — Search

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-011 | Admin | Search by carton barcode (ILIKE) | P1 | 1. Note a known barcode `MC_BARCODE` (e.g. `BINNY-MC-ABCDEF`). 2. `GET /api/v1/master-cartons?search=ABCDE`. | HTTP 200. `data` contains the matching carton. Partial match (ILIKE `%ABCDE%`) works. | API | |
| TC-MC-012 | Admin | Search with no matches returns empty array | P1 | 1. `GET /api/v1/master-cartons?search=ZZZNOMATCH`. | HTTP 200. `data = []`. `total = 0`. | API | |

### 1.4 — Legacy toggle (`includeLegacy`)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-013 | Admin | Default list excludes legacy cartons | P0 | 1. Pre-condition: `MC_LEGACY_UUID` exists (`is_legacy = true`). 2. `GET /api/v1/master-cartons` (no `includeLegacy` param). | HTTP 200. `MC_LEGACY_UUID` is NOT in `data`. Only `is_legacy = false` cartons returned. | API | Service default: `conditions.push('mc.is_legacy = false')`. |
| TC-MC-014 | Admin | includeLegacy=true shows ONLY legacy cartons | P0 | 1. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200. ALL returned items have `is_legacy = true`. Non-legacy cartons NOT returned. | API | `filters.is_legacy === true` → `mc.is_legacy = true` condition. |
| TC-MC-015 | Admin | includeLegacy=false explicitly excludes legacy | P1 | 1. `GET /api/v1/master-cartons?includeLegacy=false`. | HTTP 200. Same as default (no legacy items). | API | `filters.is_legacy === false` → explicit exclude clause. |
| TC-MC-016 | Admin | Legacy carton rows show "Legacy" badge in UI list | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons`. 3. Toggle "Show legacy" checkbox. | After toggling, cartons with `is_legacy = true` appear in the list with an amber "Legacy" badge. The checkbox state persists until toggled back. | E2E | `showLegacy` state + `includeLegacy` query param. AUTOMATION GAP: not covered by `04-master-cartons.spec.ts`. |

### 1.5 — Pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-017 | Admin | Pagination: page 2 returns next batch | P2 | 1. Ensure > 25 cartons exist. 2. `GET /api/v1/master-cartons?page=2&limit=25`. | HTTP 200. `page = 2`. `data` contains items 26–50 (or fewer if not enough). `totalPages` ≥ 2. | API | |
| TC-MC-018 | Admin | Custom limit respected | P2 | 1. `GET /api/v1/master-cartons?limit=5`. | HTTP 200. `data.length ≤ 5`. `limit = 5`. | API | |

---

## Section 2 — Create master carton

> Route: `POST /api/v1/master-cartons`
> Permission: `cartons:create` — Admin, Supervisor, Warehouse Operator.
> Body schema: `createMasterCartonSchema` — `max_capacity` (int 1–100, default 50), `child_box_barcodes` (string[], default []).
> Transaction: if barcodes provided, entire create + pack is wrapped in one DB transaction.

### 2.1 — RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-020 | Admin | Admin creates empty carton → 201 | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 201. Response: `{ id: <uuid>, carton_barcode: "MC<alphanum>", status: "CREATED", child_count: 0, max_capacity: 50, qr_data_uri: "data:image/png;base64,..." }`. `status = "CREATED"`. `qr_data_uri` non-empty. DB row in `master_cartons`. `inventory_transactions` row `CARTON_CREATED`. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-ADM-001 (with barcodes). |
| TC-MC-021 | Supervisor | Supervisor creates carton → 201 | P1 | 1. Login as Supervisor. 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 201. `status = "CREATED"`. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-SUP-001. |
| TC-MC-022 | Warehouse Operator | Warehouse Operator creates carton → 201 | P1 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 201. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-WHO-001. |
| TC-MC-023 | Dispatch Operator | Dispatch Operator cannot create → 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons` body `{}`. | HTTP 403. No carton created. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-DOP-001. |
| TC-MC-024 | Unauthenticated | No token → 401 | P0 | 1. `POST /api/v1/master-cartons` body `{}` with no auth. | HTTP 401. | API | |

### 2.2 — Capacity validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-025 | Admin | Custom max_capacity set correctly | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 20}`. | HTTP 201. `max_capacity = 20`. `status = "CREATED"`. | API | |
| TC-MC-026 | Admin | max_capacity 100 is the ceiling | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 100}`. | HTTP 201. `max_capacity = 100`. | API | |
| TC-MC-027 | Admin | max_capacity > 100 → 400 | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 101}`. | HTTP 400. Zod error "Max capacity must not exceed 100". No carton created. | API | `z.number().max(100, ...)`. |
| TC-MC-028 | Admin | max_capacity = 0 → 400 | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 0}`. | HTTP 400. Zod error "Max capacity must be positive". | API | `z.number().positive(...)`. |

### 2.3 — Create with barcodes (scan-to-pack on creation)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-029 | Admin | Create with 3 FREE child boxes → status ACTIVE | P0 | 1. Pre-condition: 3 FREE boxes with barcodes `CB_BAR_1..3`. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_2>","<CB_BAR_3>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 3`. All 3 boxes now have `status = "PACKED"`. `inventory_transactions` contains 1 `CARTON_CREATED` + 3 `CHILD_PACKED` rows. | Integration | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-ADM-001. |
| TC-MC-030 | Admin | Create with GENERATED child box → auto-activates then packs | P0 | 1. Pre-condition: `CB_GEN_1` is GENERATED with barcode `CB_GEN_BAR`. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 1`. `CB_GEN_1.status = "PACKED"`. `inventory_transactions` contains (in order): `CHILD_ACTIVATED`, `CHILD_PACKED` for `CB_GEN_1`. | Integration | Implicit GENERATED→FREE→PACKED double write in transaction. |
| TC-MC-031 | Admin | Barcodes uppercased before lookup | P1 | 1. Have FREE box with barcode `CB123456`. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["cb123456"]}`. | HTTP 201. `child_count = 1`. Barcode lookup uses `UPPER($1)`. | API | Schema: `.transform((s) => s.trim().toUpperCase())`. |
| TC-MC-032 | Admin | Non-existent barcode → 404, transaction rolled back | P0 | 1. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["BINNY-CB-NONEXISTENT"]}`. | HTTP 404. Error "Child box with barcode BINNY-CB-NONEXISTENT not found". No carton created. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-ADM-003 (indirectly). |
| TC-MC-033 | Admin | PACKED child box in barcodes → 400 | P0 | 1. Pre-condition: `CB_ALREADY_PACKED` has status PACKED. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_ALREADY_PACKED_BAR>"]}`. | HTTP 400. Error contains "currently PACKED" and "Only FREE or GENERATED boxes can be packed". No carton created. Transaction rolled back. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-ADM-003. |
| TC-MC-034 | Admin | SAMPLE child box in barcodes → 400 | P1 | 1. Pre-condition: a SAMPLE-status child box `CB_SAMPLE_BAR` exists. 2. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_SAMPLE_BAR>"]}`. | HTTP 400. Error contains "currently SAMPLE". | API | |
| TC-MC-035 | Admin | Barcodes exceed max_capacity → 400 | P1 | 1. `POST /api/v1/master-cartons` body `{"max_capacity": 2, "child_box_barcodes": ["<CB1>","<CB2>","<CB3>"]}`. | HTTP 400. Error "Master carton is full (2/2)". No partial state. Transaction rolled back. | API | Capacity checked per-iteration inside the transaction loop. |
| TC-MC-036 | Admin | Duplicate barcode in array → second fails on PACKED status guard | P1 | 1. `POST /api/v1/master-cartons` body `{"child_box_barcodes": ["<CB_BAR_1>","<CB_BAR_1>"]}`. | HTTP 400. After the first barcode is packed, the second attempt finds status = PACKED and throws "currently PACKED". Transaction rolled back. No carton left in DB. | API | Race within the loop — first pass transitions box to PACKED. |

---

## Section 3 — Pack child box by UUID

> Route: `POST /api/v1/master-cartons/pack`
> Permission: `packing:pack` — Admin, Supervisor, Warehouse Operator.
> Body: `{ child_box_id: UUID, master_carton_id: UUID }`.
> Note: Route defined AFTER the `/repack/free-both`, `/pack-by-barcode`, `/unpack` fixed routes to avoid shadowing (order-sensitive routing).

### 3.1 — RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-040 | Admin | Admin packs FREE box into ACTIVE carton → 200 | P0 | 1. Pre-condition: `MC_ACTIVE_UUID` is ACTIVE, `CB_FREE_NEW` is FREE. 2. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Response: `{ carton: { id, status: "ACTIVE", child_count: <prev+1> }, mapping: { master_carton_id, child_box_id, is_active: true } }`. Box status = PACKED. `CHILD_PACKED` transaction written. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-ADM-002. |
| TC-MC-041 | Supervisor | Supervisor packs box → 200 | P1 | 1. Login as Supervisor. 2. Valid pack body. | HTTP 200. | API | |
| TC-MC-042 | Warehouse Operator | Warehouse Operator packs box → 200 | P1 | 1. Login as Warehouse Operator. 2. Valid pack body. | HTTP 200. | API | |
| TC-MC-043 | Dispatch Operator | Dispatch Operator cannot pack → 403 | P0 | 1. Login as Dispatch Operator. 2. Valid pack body. | HTTP 403. Box status unchanged. | API | |
| TC-MC-044 | Unauthenticated | No token → 401 | P0 | 1. `POST /api/v1/master-cartons/pack` valid body, no auth. | HTTP 401. | API | |

### 3.2 — Status transitions and guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-045 | Admin | Packing into CREATED carton transitions it to ACTIVE | P0 | 1. Pre-condition: `MC_CREATED_UUID` is CREATED. `CB_FREE_A` is FREE. 2. Pack. | HTTP 200. `carton.status = "ACTIVE"`. `child_count = 1`. | Integration | `newStatus = CREATED → ACTIVE on first pack`. |
| TC-MC-046 | Admin | Pack GENERATED box → auto-activates then packs | P0 | 1. `CB_GEN_2` is GENERATED. `MC_ACTIVE_UUID` is ACTIVE. 2. Pack using GENERATED box's UUID. | HTTP 200. Box status = PACKED. `inventory_transactions` contains `CHILD_ACTIVATED` then `CHILD_PACKED`. | Integration | |
| TC-MC-047 | Admin | Pack into CLOSED carton → 400 | P0 | 1. `MC_CLOSED_UUID` is CLOSED. `CB_FREE_B` is FREE. 2. Pack body. | HTTP 400. Error "Master carton is CLOSED and cannot accept new child boxes". Box remains FREE. | API | Service guard: `CLOSED || DISPATCHED` → throw. |
| TC-MC-048 | Admin | Pack into DISPATCHED carton → 400 | P0 | 1. `MC_DISPATCHED_UUID` is DISPATCHED. 2. Pack body. | HTTP 400. Error "Master carton is DISPATCHED and cannot accept new child boxes". | API | |
| TC-MC-049 | Admin | Pack when carton is at max_capacity → 400 | P1 | 1. ACTIVE carton with `child_count = max_capacity`. 2. Pack another box. | HTTP 400. Error "Master carton is full (<n>/<max>)". Box remains FREE. | API | |
| TC-MC-050 | Admin | Pack non-existent child_box_id → 404 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "00000000-0000-0000-0000-000000000000", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 404. "Child box not found". | API | |
| TC-MC-051 | Admin | Pack into non-existent carton → 404 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "<CB_FREE_UUID>", "master_carton_id": "00000000-0000-0000-0000-000000000000"}`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-052 | Admin | Non-UUID child_box_id → 400 | P1 | 1. `POST /api/v1/master-cartons/pack` body `{"child_box_id": "not-a-uuid", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 400. Zod error "Invalid child box ID format". | API | |
| TC-MC-053 | Admin | Box already PACKED in this carton → 400 (status guard) | P0 | 1. `CB_PACKED_X` is PACKED in `MC_ACTIVE_UUID`. 2. `POST /api/v1/master-cartons/pack` body with same box and carton UUIDs. | HTTP 400. Error "Child box is currently PACKED and cannot be packed." (status guard fires before DB insert). | API | Status guard: `childBox.status !== FREE && !== GENERATED`. |

---

## Section 4 — Pack by barcode / serialized scan ledger

> Route: `POST /api/v1/master-cartons/pack-by-barcode`
> Permission: `packing:pack` — Admin, Supervisor, Warehouse Operator.
> Body: `{ barcode: string (min 1), master_carton_id: UUID }`. Barcode is uppercased by schema transform.
> Idempotency: if box is already in this carton (active mapping exists) → HTTP 200 with `alreadyPacked: true` (NO error, NO new transaction row).
> Conflict: if box is PACKED in a **different** carton → HTTP 400 with "already packed in another carton".
> Route is order-sensitive — defined BEFORE `/pack` in `masterCarton.routes.ts`.

### 4.1 — RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-060 | Admin | Admin: fresh pack by barcode → 200, alreadyPacked:false | P0 | 1. `MC_ACTIVE_UUID` is ACTIVE, `CB_FREE_NEW` is FREE with barcode `CB_BARCODE`. 2. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "<CB_BARCODE>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Body: `{ success: true, data: { carton: { id, child_count: <prev+1>, status: "ACTIVE" }, alreadyPacked: false, childBoxBarcode: "<CB_BARCODE_UPPER>" }, message: "Packed <CB_BARCODE_UPPER> into carton" }`. Box status = PACKED. `CHILD_PACKED` transaction. | API | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-001. |
| TC-MC-061 | Supervisor | Supervisor can call pack-by-barcode → 200 | P1 | 1. Login as Supervisor. 2. Valid pack-by-barcode body. | HTTP 200. `alreadyPacked: false`. Box PACKED. | API | |
| TC-MC-062 | Warehouse Operator | Warehouse Operator can call pack-by-barcode → 200 | P1 | 1. Login as Warehouse Operator. 2. Valid pack-by-barcode body. | HTTP 200. | API | |
| TC-MC-063 | Dispatch Operator | Dispatch Operator cannot call pack-by-barcode → 403 | P0 | 1. Login as Dispatch Operator. 2. Valid pack-by-barcode body. | HTTP 403. | API | `packing:pack` not in Dispatch Operator seed. |
| TC-MC-064 | Unauthenticated | No token → 401 | P0 | 1. `POST /api/v1/master-cartons/pack-by-barcode` valid body, no auth. | HTTP 401. | API | |

### 4.2 — Idempotency (re-scan same carton)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-065 | Admin | Re-scan same box into SAME carton → alreadyPacked:true, no-op | P0 | 1. `CB_PACKED_Z` is already PACKED in `MC_ACTIVE_UUID` (active mapping exists). 2. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "<CB_PACKED_Z_BAR>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Body: `{ data: { carton: null, alreadyPacked: true, childBoxBarcode: "<UPPER>" }, message: "Box <UPPER> is already in this carton" }`. `child_count` unchanged. No new `inventory_transactions` row. Box status unchanged (still PACKED). | API | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-002. Core idempotency that prevents double-count during rapid scanning. |
| TC-MC-066 | Admin | carton child_count is NOT incremented on re-scan | P0 | 1. Same setup as TC-MC-065. Note `child_count` before. 2. Re-scan twice. 3. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>`. | `child_count` equals the value before the re-scans. No inflation. | Integration | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-002 child_count assertion. |

### 4.3 — Conflict (box packed in different carton)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-067 | Admin | Box packed in DIFFERENT carton → 400 conflict | P0 | 1. `CB_PACKED_W` is PACKED in `MC_OTHER` (active mapping in a different carton). 2. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "<CB_PACKED_W_BAR>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 400. Error "Child box <UPPER> is already packed in another carton. Unpack it first." Source carton `MC_OTHER` unchanged. | API | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-003. Distinct from generic status error. |

### 4.4 — Not found / validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-068 | Admin | Unknown barcode → 404 | P0 | 1. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "NOTEXIST99999", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 404. Error "No child box found with barcode NOTEXIST99999". | API | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-004. |
| TC-MC-069 | Admin | Barcode normalised to upper before lookup | P1 | 1. FREE box with barcode `CB123456`. 2. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "cb123456", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. `childBoxBarcode = "CB123456"`. Box PACKED. | API | Realised: `40-carton-pack-by-barcode.spec.ts` TC-PBB-005. Schema `.transform(s => s.trim().toUpperCase())`. |
| TC-MC-070 | Admin | Empty barcode string → 400 | P1 | 1. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 400. Zod error "Barcode is required". | API | `z.string().min(1, 'Barcode is required')`. |
| TC-MC-071 | Admin | Non-UUID master_carton_id → 400 | P1 | 1. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "CB123456", "master_carton_id": "not-a-uuid"}`. | HTTP 400. Zod error "Invalid master carton ID format". | API | |

### 4.5 — Frontend E2E: serialized scan queue + scan ledger

> Implemented in `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` — `handleScan`, `processQueue`, `seenRef`, `scanLog`, `retryScan`, `clearScanLog`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-072 | Admin | Scan a FREE box → ledger shows "Packed" (green checkmark) | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons/<MC_ACTIVE_UUID>`. 3. Click "Add Boxes" to open the scan panel. 4. Scan / type a FREE box barcode. | Ledger row appears with green `CheckCircle2` icon and text "Packed". `child_count` in the carton header increments. API called once (`pack-by-barcode`). | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-005 (partial). AUTOMATION GAP: ledger status not yet asserted. |
| TC-MC-073 | Admin | Re-scan same box → ledger shows "Already in this carton" (neutral icon) | P0 | 1. After packing a box, scan the same barcode again. | No error toast. Ledger row appears with neutral `CheckCircle2` icon and message "Already in this carton". `alreadyPacked: true` response handled gracefully. `child_count` not incremented again. | E2E | AUTOMATION GAP: `04-master-cartons.spec.ts` does not exercise re-scan path. |
| TC-MC-074 | Admin | Rapid duplicate scan (within `seenRef` window) → "already scanned" toast, only one ledger entry | P1 | 1. Scan the same barcode twice in rapid succession (before the first API response returns). | Second scan triggers toast error `"<BARCODE> already scanned"`. Only one ledger entry created. Only one API call made. | E2E | `seenRef.current.has(barcode)` short-circuits before API call. AUTOMATION GAP. |
| TC-MC-075 | Admin | Failed scan (box in another carton) → ledger shows "Failed" with Retry button | P1 | 1. Scan a barcode for a box packed in a different carton (triggers 400). | Ledger row shows red `XCircle` icon, "Failed" text, error message title, and a "Retry" button. `seenRef` is cleared for that barcode (allowing retry). | E2E | `seenRef.current.delete(barcode)` on error. AUTOMATION GAP. |
| TC-MC-076 | Admin | Retry failed scan → re-attempts pack-by-barcode | P1 | 1. After a failed entry appears, unpack the box from its current carton (so it becomes FREE). 2. Click the "Retry" button on the failed ledger entry. | `retryScan(barcode)` removes the old failed entry and re-queues the barcode. New ledger entry shows "Packed" on success. | E2E | AUTOMATION GAP. |
| TC-MC-077 | Admin | "Clear" button removes ledger entries but does NOT clear seenRef | P1 | 1. After scanning several boxes, click the "Clear" button in the ledger header. | All ledger rows disappear. Scanning the same barcode again immediately triggers the "already scanned" toast (seenRef still contains it). `child_count` display is unaffected. | E2E | `clearScanLog()` resets `scanLog` state and `seenRef` to a new empty Set. AUTOMATION GAP. |
| TC-MC-078 | Admin | Input NOT disabled during burst scanning | P1 | 1. Scan multiple barcodes in rapid succession (> 3 within 500ms). | The `HIDScannerInput` field is never disabled between scans. The serialized queue processes scans sequentially (`processingRef`) without blocking input focus. No barcodes are dropped. | E2E | Fix vs old behaviour where input was disabled mid-burst. AUTOMATION GAP. |
| TC-MC-079 | Admin | Pending scan entry shows spinner while queued | P2 | 1. In a slow-network scenario, scan a barcode. While the API call is in-flight, inspect the ledger. | Entry with status `pending` shows a `Loader2` spin icon and "Packing…" text. Transitions to "Packed" or "Failed" when the API resolves. | E2E | AUTOMATION GAP. |

---

## Section 5 — Unpack child box

> Route: `POST /api/v1/master-cartons/unpack`
> Permission: `packing:unpack` — Admin, Supervisor, Warehouse Operator.
> Body: `{ child_box_id: UUID, master_carton_id: UUID }`.
> Guard: DISPATCHED cartons reject. CLOSED cartons allow unpack (box returns to FREE, carton stays CLOSED).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-080 | Admin | Admin unpacks box from ACTIVE carton → box FREE | P0 | 1. `CB_PACKED_X` is PACKED in `MC_ACTIVE_UUID`. 2. `POST /api/v1/master-cartons/unpack` body `{"child_box_id": "<CB_PACKED_X_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}`. | HTTP 200. Response: updated carton `{ id, child_count: <prev-1>, status: "ACTIVE" }`. `CB_PACKED_X.status = "FREE"`. Mapping has `is_active = false, unpacked_at = <timestamp>`. `CHILD_UNPACKED` transaction row. | Integration | |
| TC-MC-081 | Admin | Unpacking last box from ACTIVE → carton status CREATED | P0 | 1. ACTIVE carton with `child_count = 1`. 2. Unpack that one box. | Carton `status = "CREATED"`. `child_count = 0`. Box = FREE. | Integration | `newStatus = newChildCount === 0 ? CREATED : carton.status`. |
| TC-MC-082 | Admin | Unpack from CLOSED carton → allowed (carton stays CLOSED) | P1 | 1. `MC_CLOSED_UUID` is CLOSED with ≥ 1 box. 2. Unpack one box. | HTTP 200. Box = FREE. Carton `child_count` decremented. Carton status remains CLOSED. | Integration | Only DISPATCHED is blocked; CLOSED is not guarded in unpackChildBox service. |
| TC-MC-083 | Admin | Unpack from DISPATCHED → 400 | P0 | 1. `MC_DISPATCHED_UUID` is DISPATCHED. 2. Attempt unpack. | HTTP 400. Error "Cannot unpack from a dispatched carton". | API | |
| TC-MC-084 | Supervisor | Supervisor can unpack | P1 | 1. Login as Supervisor. Valid unpack body. | HTTP 200. | API | |
| TC-MC-085 | Warehouse Operator | Warehouse Operator can unpack | P1 | 1. Login as Warehouse Operator. Valid unpack body. | HTTP 200. | API | |
| TC-MC-086 | Dispatch Operator | Dispatch Operator cannot unpack → 403 | P0 | 1. Login as Dispatch Operator. Valid unpack body. | HTTP 403. | API | |
| TC-MC-087 | Unauthenticated | No token → 401 | P0 | 1. Valid body, no auth. | HTTP 401. | API | |
| TC-MC-088 | Admin | No active mapping found → 404 | P1 | 1. `POST /api/v1/master-cartons/unpack` body `{"child_box_id": "<CB_FREE_UUID>", "master_carton_id": "<MC_ACTIVE_UUID>"}` (box is FREE, not in carton). | HTTP 404. "Active mapping not found for this child box and carton". | API | |

---

## Section 6 — Full unpack

> Route: `POST /api/v1/master-cartons/:id/full-unpack`
> Permission: `packing:unpack` — Admin, Supervisor, Warehouse Operator.
> Guards: DISPATCHED → 400; CREATED (empty) → 400.
> Effect: all active mappings deactivated, all boxes → FREE, carton → CREATED/child_count=0.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-090 | Admin | Admin full-unpacks ACTIVE carton with 3 boxes | P0 | 1. ACTIVE carton with 3 PACKED boxes. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/full-unpack`. | HTTP 200. Response: `{ id, status: "CREATED", child_count: 0 }`. All 3 boxes = FREE. All 3 mappings `is_active = false`, `unpacked_at` set. 3 `CHILD_UNPACKED` transaction rows. | Integration | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-UNPACK-001. |
| TC-MC-091 | Admin | Full-unpack CLOSED carton → boxes freed, carton CREATED | P1 | 1. `MC_CLOSED_UUID` CLOSED with 2 boxes. 2. Full-unpack. | HTTP 200. `status = "CREATED"`. `child_count = 0`. Both boxes FREE. | Integration | CLOSED carton can be full-unpacked (no guard). |
| TC-MC-092 | Admin | Full-unpack DISPATCHED → 400 | P0 | 1. DISPATCHED carton. 2. Full-unpack. | HTTP 400. "Cannot unpack a dispatched carton". | API | |
| TC-MC-093 | Admin | Full-unpack CREATED (empty) → 400 | P0 | 1. `MC_CREATED_UUID` with `child_count = 0`. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty carton". | API | Guard: `carton.status === CREATED` → throws. |
| TC-MC-094 | Supervisor | Supervisor can full-unpack | P1 | 1. Login as Supervisor. Valid full-unpack request. | HTTP 200. | API | |
| TC-MC-095 | Warehouse Operator | Warehouse Operator can full-unpack → 200 | P1 | 1. Login as Warehouse Operator. Valid full-unpack. | HTTP 200. Boxes freed. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-UNPACK-002. |
| TC-MC-096 | Dispatch Operator | Dispatch Operator cannot full-unpack → 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/full-unpack`. | HTTP 403. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-UNPACK-003. |
| TC-MC-097 | Unauthenticated | No token → 401 | P0 | 1. No auth. | HTTP 401. | API | |
| TC-MC-098 | Admin | Non-existent carton → 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/full-unpack`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-099 | Admin | Non-UUID id → 400 | P1 | 1. `POST /api/v1/master-cartons/not-a-uuid/full-unpack`. | HTTP 400. Zod error "Invalid master carton ID format". | API | `masterCartonIdParamSchema`. |

---

## Section 7 — Close master carton

> Route: `POST /api/v1/master-cartons/:id/close`
> Permission: `cartons:close` — Admin, Supervisor, **Warehouse Operator** (DISC-MC-1).
> Guards: CLOSED → 400; DISPATCHED → 400; empty (child_count = 0) → 400.

### 7.1 — RBAC (RBAC correction: Warehouse Operator CAN close)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-100 | Admin | Admin closes ACTIVE carton → 200, status CLOSED | P0 | 1. `MC_ACTIVE_UUID` is ACTIVE, child_count ≥ 1. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/close`. | HTTP 200. Response: `{ id, status: "CLOSED", closed_at: <ISO timestamp> }`. `closed_at` non-null. `CARTON_CLOSED` transaction written. | Integration | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-CLOSE-001. |
| TC-MC-101 | Supervisor | Supervisor closes ACTIVE carton → 200 | P1 | 1. Login as Supervisor. Valid close. | HTTP 200. `status = "CLOSED"`. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-CLOSE-002. |
| TC-MC-102 | Warehouse Operator | Warehouse Operator CAN close → 200 (DISC-MC-1) | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/close`. | HTTP 200. Carton `status = "CLOSED"`. **NOT 403.** | API | **DISC-MC-1**: seeds give `cartons:close` to Warehouse Operator (line 74). Prior file (TC-MC-072) was wrong with 403. Realised: `20-cartons-lifecycle.spec.ts` TC-MC-CLOSE-003 INCORRECTLY asserts 403 → AUTOMATION GAP (spec needs fix). |
| TC-MC-103 | Dispatch Operator | Dispatch Operator cannot close → 403 | P0 | 1. Login as Dispatch Operator. 2. Valid close body. | HTTP 403. | API | |
| TC-MC-104 | Unauthenticated | No token → 401 | P0 | 1. No auth. | HTTP 401. | API | |

### 7.2 — Status guards

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-105 | Admin | Close already CLOSED carton → 400 | P0 | 1. `MC_CLOSED_UUID` is CLOSED. 2. Attempt close. | HTTP 400. Error "Master carton is already closed". | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-CLOSE-004. |
| TC-MC-106 | Admin | Close DISPATCHED carton → 400 | P0 | 1. DISPATCHED carton. 2. Attempt close. | HTTP 400. Error "Cannot close a dispatched carton". | API | |
| TC-MC-107 | Admin | Close empty (CREATED, child_count=0) → 400 | P0 | 1. `MC_CREATED_UUID` with `child_count = 0`. 2. Attempt close. | HTTP 400. Error "Cannot close an empty carton". | API | |
| TC-MC-108 | Admin | Non-existent carton → 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-109 | Admin | Non-UUID id → 400 | P1 | 1. `POST /api/v1/master-cartons/not-a-uuid/close`. | HTTP 400. Zod error "Invalid master carton ID format". | API | |

---

## Section 8 — Open-for-Repacking

> Route: `POST /api/v1/master-cartons/:id/open-legacy`
> Permission: `packing:unpack` — Admin, Supervisor, Warehouse Operator (**DISC-MC-2** — NOT `cartons:reopen`).
> Purpose: converts a legacy count-only carton (`is_legacy = true`) into an empty trackable carton (`is_legacy = false`, `status = CREATED`, `child_count = 0`).
> The carton keeps its barcode and label; section/category/article_group/size_group retained for provenance.
> Writes `LEGACY_CARTON_OPENED` transaction.
> After open-legacy, the user generates new child-box labels and packs them in via "Add Boxes" / pack-by-barcode on the same carton detail page.
> Note: The full Unpack-Repack module (`/unpack-repack`, 3 modes) is a separate feature covered by Session A22. This section covers ONLY the "Open for Repacking" action on the carton detail page.

### 8.1 — RBAC (DISC-MC-2: uses packing:unpack, not cartons:reopen)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-110 | Admin | Admin opens legacy carton → 200, is_legacy=false, status CREATED | P0 | 1. Pre-condition: `MC_LEGACY_UUID` has `is_legacy = true`. 2. `POST /api/v1/master-cartons/<MC_LEGACY_UUID>/open-legacy`. | HTTP 200. Response: `{ id, is_legacy: false, status: "CREATED", child_count: 0, ... }`. `LEGACY_CARTON_OPENED` transaction written. | Integration | |
| TC-MC-111 | Supervisor | Supervisor opens legacy carton → 200 | P1 | 1. Login as Supervisor. `POST /<MC_LEGACY_UUID>/open-legacy`. | HTTP 200. `is_legacy = false`. | API | Supervisor has `packing:unpack`. |
| TC-MC-112 | Warehouse Operator | Warehouse Operator opens legacy carton → 200 (DISC-MC-2) | P0 | 1. Login as Warehouse Operator. 2. `POST /<MC_LEGACY_UUID>/open-legacy`. | HTTP 200. **NOT 403.** `is_legacy = false`. | API | **DISC-MC-2**: route uses `authorizePermission('packing:unpack')` — Warehouse Operator has this. Despite MASTER_TEST_PLAN matrix showing `cartons:reopen` as Admin+Supervisor only, the route gate is `packing:unpack`. Document actual behavior. AUTOMATION GAP. |
| TC-MC-113 | Dispatch Operator | Dispatch Operator cannot open legacy → 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /<MC_LEGACY_UUID>/open-legacy`. | HTTP 403. Dispatch Operator lacks `packing:unpack`. | API | |
| TC-MC-114 | Unauthenticated | No token → 401 | P0 | 1. No auth. | HTTP 401. | API | |

### 8.2 — Business rules

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-115 | Admin | Opening a NON-legacy carton → 400 | P0 | 1. Pre-condition: `MC_ACTIVE_UUID` has `is_legacy = false`. 2. `POST /api/v1/master-cartons/<MC_ACTIVE_UUID>/open-legacy`. | HTTP 400. Error "Only legacy cartons can be opened for repacking". Carton unchanged. | API | Guard: `if (!carton.is_legacy) throw BadRequestError`. |
| TC-MC-116 | Admin | After open-legacy, carton disappears from legacy list | P0 | 1. Open a legacy carton (TC-MC-110). 2. `GET /api/v1/master-cartons?includeLegacy=true`. | HTTP 200. `MC_LEGACY_UUID` is NO LONGER in the legacy list (`is_legacy = false` now). | Integration | |
| TC-MC-117 | Admin | After open-legacy, carton appears in normal list | P0 | 1. Open a legacy carton. 2. `GET /api/v1/master-cartons` (no includeLegacy). | HTTP 200. `MC_LEGACY_UUID` now appears as a normal CREATED carton. | Integration | |
| TC-MC-118 | Admin | After open-legacy, carton can receive child boxes via pack-by-barcode | P0 | 1. Open a legacy carton → `status = CREATED`. 2. `POST /api/v1/master-cartons/pack-by-barcode` body `{"barcode": "<CB_FREE_BAR>", "master_carton_id": "<MC_LEGACY_UUID>"}`. | HTTP 200. `alreadyPacked = false`. Carton `status = "ACTIVE"`. `child_count = 1`. | Integration | Key post-open-legacy workflow. |
| TC-MC-119 | Admin | LEGACY_CARTON_OPENED transaction written with correct fields | P0 | 1. Open a legacy carton. 2. `SELECT * FROM inventory_transactions WHERE master_carton_id = '<MC_LEGACY_UUID>' AND transaction_type = 'LEGACY_CARTON_OPENED'`. | Exactly 1 row. `performed_by` = admin user id. `notes` contains carton barcode. | Integration | `TRANSACTION_TYPES.LEGACY_CARTON_OPENED` in constants. |
| TC-MC-120 | Admin | Non-existent carton → 404 | P1 | 1. `POST /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/open-legacy`. | HTTP 404. "Master carton not found". | API | |

### 8.3 — Frontend E2E: "Open for Repacking" action on detail page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-121 | Admin | Legacy carton detail shows amber banner and "Open for Repacking" button | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons/<MC_LEGACY_UUID>`. | Amber banner visible: "Legacy (pre-go-live) carton". "Open for Repacking" button visible (leftIcon PackageOpen). "Full Unpack" button NOT visible (replaced by Open for Repacking for legacy cartons). | E2E | `carton.is_legacy && canUnpack` → shows "Open for Repacking" button. `!carton.is_legacy` → shows "Full Unpack". AUTOMATION GAP. |
| TC-MC-122 | Admin | Non-legacy carton detail shows "Full Unpack" not "Open for Repacking" | P0 | 1. Navigate to `/master-cartons/<MC_ACTIVE_UUID>` (non-legacy, ACTIVE). | "Full Unpack" button visible. "Open for Repacking" button NOT visible. Amber banner NOT shown. | E2E | AUTOMATION GAP. |
| TC-MC-123 | Admin | Clicking "Open for Repacking" shows confirmation modal | P0 | 1. On legacy carton detail page, click "Open for Repacking". | Modal appears with title "Open for Repacking" and description about converting to empty trackable carton. Amber info block visible. "Open Carton" and "Cancel" buttons present. | E2E | AUTOMATION GAP. |
| TC-MC-124 | Admin | Confirming "Open Carton" in modal calls open-legacy API and updates UI | P0 | 1. On legacy carton detail, click "Open for Repacking" → confirm. | API call to `POST /:id/open-legacy` succeeds. Success toast "Carton opened for repacking — now generate child-box labels and scan them in". Modal closes. Amber banner disappears (carton is no longer legacy). `status` badge now shows "CREATED". "Add Boxes" button becomes visible. | E2E | AUTOMATION GAP. |
| TC-MC-125 | Warehouse Operator | Warehouse Operator sees "Open for Repacking" button on legacy carton | P1 | 1. Login as Warehouse Operator. 2. Navigate to legacy carton detail. | "Open for Repacking" button visible (`canUnpack = useCan('packing:unpack')` is true for Warehouse Operator per seeds). | E2E | DISC-MC-2 behavioral confirmation. AUTOMATION GAP. |
| TC-MC-126 | Dispatch Operator | Dispatch Operator does NOT see "Open for Repacking" button | P1 | 1. Login as Dispatch Operator. 2. Navigate to legacy carton detail. | "Open for Repacking" button NOT visible (`canUnpack = false` for Dispatch Operator). | E2E | AUTOMATION GAP. |

---

## Section 9 — Read endpoints

> All GET endpoints: auth-only (no permission gate). All 4 roles → 200. Unauthenticated → 401.

### 9.1 — GET /:id (detail with child boxes)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-130 | Admin | GET /:id returns carton with child_boxes array | P0 | 1. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>`. | HTTP 200. Response: `{ id, carton_barcode, status: "ACTIVE", child_count, max_capacity, created_at, closed_at, dispatched_at, is_legacy, child_boxes: [{ child_box_id, barcode, status, article_name, article_code, sku, size, colour, mrp }] }`. `child_boxes.length === child_count`. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-READ-002. |
| TC-MC-131 | Dispatch Operator | Dispatch Operator reads carton detail → 200 | P1 | 1. Login as Dispatch Operator. 2. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>`. | HTTP 200. Full data visible. | API | |
| TC-MC-132 | Unauthenticated | No token → 401 | P0 | 1. `GET /api/v1/master-cartons/<MC_ACTIVE_UUID>` no auth. | HTTP 401. | API | |
| TC-MC-133 | Admin | Non-existent UUID → 404 | P1 | 1. `GET /api/v1/master-cartons/00000000-0000-0000-0000-000000000000`. | HTTP 404. "Master carton not found". | API | |

### 9.2 — GET /:id/children (active mappings only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-134 | Admin | GET /:id/children returns only is_active=true mappings | P0 | 1. Carton with 2 active + 1 inactive (unpacked) mapping. 2. `GET /api/v1/master-cartons/<MC_UUID>/children`. | HTTP 200. Array has exactly 2 items. Each: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`. | API | `WHERE ccm.is_active = true`. |
| TC-MC-135 | Dispatch Operator | Dispatch Operator reads children → 200 | P1 | 1. Login as Dispatch Operator. 2. GET children. | HTTP 200. | API | Auth-only. |

### 9.3 — GET /qr/:barcode (lookup by carton barcode)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-136 | Admin | GET /qr/:barcode returns carton + child_boxes | P0 | 1. `GET /api/v1/master-cartons/qr/<CARTON_BARCODE>`. | HTTP 200. `carton_barcode` matches. `child_boxes` array present. | API | Barcode lookup uppercased: `UPPER($1)`. |
| TC-MC-137 | Admin | GET /qr/NONEXISTENT → 404 | P1 | 1. `GET /api/v1/master-cartons/qr/BINNY-MC-00000000`. | HTTP 404. "Master carton not found". | API | |
| TC-MC-138 | Unauthenticated | No token → 401 | P0 | 1. No auth on `/qr/...`. | HTTP 401. | API | |

---

## Section 10 — Assortment aggregation

> Route: `GET /api/v1/master-cartons/:id/assortment`
> Permission: auth-only (no permission gate).
> Returns: `[{ article_name, colour, size, mrp, count }]` ordered by `article_name, colour, size`.
> Count is computed via `GROUP BY article_name, colour, size, mrp` across active mappings only.
> Frontend use: print label generates distinct `articleSet`, `colourSet`, `mrpSet` for multi-colour/multi-MRP cartons (handles assortment correctly per label code).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-140 | Admin | Assortment with homogeneous carton | P0 | 1. Carton with 3 × Blue/Size-6 boxes (same product). 2. `GET /api/v1/master-cartons/<MC_UUID>/assortment`. | HTTP 200. Array: `[{ article_name: "...", colour: "Blue", size: "6", mrp: <n>, count: 3 }]`. Single row. | API | Realised: `20-cartons-lifecycle.spec.ts` TC-MC-READ-003. |
| TC-MC-141 | Admin | Assortment with mixed sizes | P0 | 1. Carton with 2 × Blue/Size-6 and 1 × Blue/Size-7. 2. `GET assortment`. | HTTP 200. Two rows: `{ colour: "Blue", size: "6", count: 2 }` and `{ colour: "Blue", size: "7", count: 1 }`. Ordered by size ascending. | API | Realised: `04-master-cartons.spec.ts` TC-MC-006. |
| TC-MC-142 | Admin | Assortment with multiple colours (label aggregation) | P0 | 1. Carton with 2 × Blue/Size-6 and 2 × Red/Size-6. 2. `GET assortment`. | HTTP 200. Two rows: `{ colour: "Blue", ... }` and `{ colour: "Red", ... }`. Frontend print label must aggregate both into `colourSet` → label shows "Blue. Red". | API | Frontend label logic: `colourSet.add(item.colour)`. |
| TC-MC-143 | Admin | Assortment with multiple MRPs | P0 | 1. Carton with 2 boxes at MRP 299 and 2 at MRP 399. 2. `GET assortment`. | HTTP 200. Rows show distinct MRP values. Frontend label shows "299.00 / 399.00" (sorted, joined). | API | Frontend: `mrpSet.add(Number(item.mrp))` then sort+join. |
| TC-MC-144 | Admin | Assortment empty carton | P1 | 1. `GET /api/v1/master-cartons/<MC_CREATED_UUID>/assortment` (empty carton). | HTTP 200. `data = []`. | API | No active mappings → empty array. |
| TC-MC-145 | Admin | Non-existent carton → 404 | P1 | 1. `GET /api/v1/master-cartons/00000000-0000-0000-0000-000000000000/assortment`. | HTTP 404. "Master carton not found". | API | Service checks carton exists before querying. |
| TC-MC-146 | Dispatch Operator | Dispatch Operator reads assortment → 200 | P1 | 1. Login as Dispatch Operator. `GET assortment`. | HTTP 200. Auth-only endpoint. | API | |
| TC-MC-147 | Unauthenticated | No token → 401 | P0 | 1. No auth. | HTTP 401. | API | |
| TC-MC-148 | Admin | Count is active mappings only (not inactive/unpacked) | P0 | 1. Carton originally had 3 × Blue/Size-6. 1 was unpacked (mapping is_active = false). 2. `GET assortment`. | `count = 2` (not 3). `WHERE ccm.is_active = true` in query. | Integration | Active-only aggregation. |
| TC-MC-149 | Admin | Frontend print label: size-range shows correct range from assortment | P0 | 1. Carton with sizes 6, 7, 8. 2. Click "Print Label" on detail page. | Print window HTML shows: `sizeRangeLabel = "6 - 8"`, `totalPairs = <sum of counts>`. Size assortment grid shows columns for 6, 7, 8 with respective counts. | E2E | `sizeRangeLabel = sizes[0] - sizes[last]`. AUTOMATION GAP. |
| TC-MC-150 | Admin | Print label uses closed_at date when carton is CLOSED | P1 | 1. Close a carton. 2. Click "Print Label". | Print window `Packed On` date = `closed_at` formatted in `en-IN` locale. | E2E | `carton.closed_at ? new Date(carton.closed_at)...`. AUTOMATION GAP. |
| TC-MC-151 | Admin | Print label uses current date when carton is not CLOSED | P1 | 1. ACTIVE carton (not closed). 2. Click "Print Label". | `Packed On` date = today's date. | E2E | `new Date()` fallback. AUTOMATION GAP. |

---

## Section 11 — Status transition integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-155 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty carton → CREATED. 2. Pack a box → ACTIVE. 3. Close → CLOSED. 4. Dispatch (Phase 13 flow) → DISPATCHED. | Each step transitions correctly. `closed_at` non-null after step 3. `dispatched_at` non-null after step 4. | Integration | DISPATCHED transition belongs to Phase 13. |
| TC-MC-156 | Admin | Pack into DISPATCHED carton → 400 | P0 | 1. DISPATCHED carton. 2. `POST /master-cartons/pack` targeting it. | HTTP 400. "Master carton is DISPATCHED and cannot accept new child boxes". | API | |
| TC-MC-157 | Admin | Unpack all boxes from ACTIVE → carton reverts to CREATED | P0 | 1. ACTIVE carton with 1 box. 2. Unpack it. | `status = "CREATED"`. `child_count = 0`. | Integration | |
| TC-MC-158 | Admin | Closing CREATED (empty) carton → 400 | P0 | 1. CREATED carton `child_count = 0`. 2. Attempt close. | HTTP 400. "Cannot close an empty carton". | API | |
| TC-MC-159 | Admin | Re-open-legacy converts is_legacy=true carton to is_legacy=false | P0 | 1. Legacy carton. 2. open-legacy. 3. `GET /:id`. | `is_legacy = false`. `status = "CREATED"`. `child_count = 0`. Carton retains same `id` and `carton_barcode`. | Integration | |

---

## Section 12 — Inventory transaction correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-160 | Admin | Create carton → CARTON_CREATED transaction | P0 | 1. Create a carton. 2. `SELECT * FROM inventory_transactions WHERE master_carton_id = '<NEW_ID>' AND transaction_type = 'CARTON_CREATED'`. | Exactly 1 row. `performed_by` = admin user id. `notes` contains new barcode. | Integration | |
| TC-MC-161 | Admin | Pack box → CHILD_PACKED transaction | P0 | 1. Pack a FREE box. 2. `SELECT * FROM inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_PACKED'`. | 1 row. `master_carton_id` = carton id. `performed_by` = user id. | Integration | |
| TC-MC-162 | Admin | Pack GENERATED box → CHILD_ACTIVATED then CHILD_PACKED (ordered) | P0 | 1. Pack a GENERATED box. 2. `SELECT * FROM inventory_transactions WHERE child_box_id = '<CB_GEN_ID>' ORDER BY created_at`. | Two consecutive rows: `CHILD_ACTIVATED` (earlier), `CHILD_PACKED` (later). Both reference same `child_box_id`. `CHILD_PACKED` also references `master_carton_id`. | Integration | |
| TC-MC-163 | Admin | Unpack box → CHILD_UNPACKED transaction | P0 | 1. Unpack a PACKED box. 2. `SELECT * FROM inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_UNPACKED'`. | 1 row. `master_carton_id` = carton id. | Integration | |
| TC-MC-164 | Admin | Close carton → CARTON_CLOSED transaction | P0 | 1. Close a carton. 2. `SELECT * FROM inventory_transactions WHERE master_carton_id = '<ID>' AND transaction_type = 'CARTON_CLOSED'`. | 1 row. `performed_by` = user id. | Integration | |
| TC-MC-165 | Admin | Full-unpack 3 boxes → 3 × CHILD_UNPACKED transactions | P0 | 1. Full-unpack carton with 3 boxes. 2. `SELECT COUNT(*) FROM inventory_transactions WHERE master_carton_id = '<ID>' AND transaction_type = 'CHILD_UNPACKED'`. | Count = 3. Each row references a different `child_box_id`. | Integration | |
| TC-MC-166 | Admin | open-legacy → LEGACY_CARTON_OPENED transaction | P0 | 1. Open a legacy carton. 2. `SELECT * FROM inventory_transactions WHERE master_carton_id = '<ID>' AND transaction_type = 'LEGACY_CARTON_OPENED'`. | 1 row. `performed_by` = user id. `notes` contains carton barcode. | Integration | |
| TC-MC-167 | Admin | pack-by-barcode idempotent re-scan → NO new transaction row | P0 | 1. Pack a box. 2. Re-scan same box into same carton. 3. `SELECT COUNT(*) FROM inventory_transactions WHERE child_box_id = '<CB_ID>' AND transaction_type = 'CHILD_PACKED'`. | Count = 1 (only the initial pack; re-scan wrote nothing). | Integration | Core idempotency guarantee. |

---

## Section 13 — Standalone Repack removed (route-gone confirmation)

> The old `POST /master-cartons/repack` endpoint was deleted. The `/unpack-repack` module (Session A22) and `POST /master-cartons/repack/free-both` replace it. These TCs confirm the removal.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-170 | Admin | POST /master-cartons/repack → 404 (route deleted) | P0 | 1. Login as Admin. 2. `POST /api/v1/master-cartons/repack` with any valid JSON body. | HTTP 404. Route not found (Express no-match). No DB changes. | API | Confirms route was removed from `masterCarton.routes.ts`. |
| TC-MC-171 | Admin | No "Repack" sidebar item present in navigation | P0 | 1. Login as Admin. 2. Inspect application sidebar. | No "Repack" link or menu item is present at any role level. | E2E | Route deleted; sidebar link also removed. AUTOMATION GAP. |

---

## Section 14 — Frontend E2E: List page

> Realised by `frontend/e2e/04-master-cartons.spec.ts`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-E2E-001 | Admin | List page loads with heading and table | P0 | 1. Login as Admin. 2. Navigate to `/master-cartons`. | URL is `/master-cartons`. Page heading "Master Cartons" visible. Table or card list of carton rows displayed. | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-001. |
| TC-MC-E2E-002 | Admin | Search input present | P0 | 1. On `/master-cartons`. | Search input with placeholder "Search by carton barcode..." visible. | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-001. |
| TC-MC-E2E-003 | Admin | Status filter dropdown has all 5 options | P1 | 1. On `/master-cartons`, locate the status `<select>` dropdown. | Options: "All Statuses", "Created", "Active", "Closed", "Dispatched". | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-004. |
| TC-MC-E2E-004 | Admin | Filtering by status updates the list | P1 | 1. Select "Active" in status filter. | List refreshes to show ACTIVE cartons only. | E2E | |
| TC-MC-E2E-005 | Admin | "Create Carton" button visible for Admin | P0 | 1. Login as Admin. 2. On `/master-cartons`. | "Create Carton" button visible (`canCreate = useCan('cartons:create')` is true for Admin). | E2E | `canCreate` gate in page component. |
| TC-MC-E2E-006 | Dispatch Operator | "Create Carton" button NOT visible for Dispatch Operator | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/master-cartons`. | "Create Carton" button absent (`canCreate = false`). List is visible (read access). | E2E | AUTOMATION GAP for role-specific UI assertions. |
| TC-MC-E2E-007 | Admin | "Show legacy" checkbox toggles legacy carton visibility | P0 | 1. Login as Admin. 2. On `/master-cartons`. 3. Toggle "Show legacy" checkbox on. 4. Toggle off. | Checkbox on: legacy cartons appear with amber "Legacy" badge; `includeLegacy=true` query param sent. Checkbox off: legacy cartons disappear; normal list restored. | E2E | AUTOMATION GAP: not in `04-master-cartons.spec.ts`. |
| TC-MC-E2E-008 | Admin | Legacy badge renders in list row for is_legacy cartons | P1 | 1. With "Show legacy" checked, inspect a legacy carton row. | Amber "Legacy" badge visible next to barcode. | E2E | AUTOMATION GAP. |
| TC-MC-E2E-009 | Admin | Clicking a row navigates to detail page | P1 | 1. Click any carton row. | URL changes to `/master-cartons/<UUID>`. | E2E | `router.push(ROUTES.MASTER_CARTON_DETAIL(carton.id))`. |

---

## Section 15 — Frontend E2E: Create page (scan-to-pack + capacity)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-E2E-010 | Admin | Create page loads with heading, capacity input, HID scanner | P0 | 1. Navigate to `/master-cartons/create`. | Heading "Create Master Carton" visible. "Max Capacity" input present with default value 24. HID scanner input visible ("Scan or enter child box barcode..."). | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-002 and TC-MC-003. |
| TC-MC-E2E-011 | Admin | Scanned item counter reflects scan list | P0 | 1. On create page, scan a FREE box barcode. | Item appears in the "Scanned Items" list. Counter shows "1/<max>". Progress bar advances. | E2E | `scannedItems.length` / `maxCapacity`. |
| TC-MC-E2E-012 | Admin | Duplicate scan shows "Already scanned" toast and does not add duplicate | P0 | 1. Scan the same barcode twice. | Toast error "Already scanned". Only one entry in the list. `addItem` uses a Set for deduplication (`useScanStore`). | E2E | `useScanStore().addItem` returns false for duplicates. AUTOMATION GAP. |
| TC-MC-E2E-013 | Admin | Removing item from list decrements counter | P1 | 1. After scanning, click the `X` button on a scanned item. | Item removed. Counter decrements. | E2E | `handleRemoveItem`. |
| TC-MC-E2E-014 | Admin | "Clear All" empties the scanned list | P1 | 1. Scan 3 items. 2. Click "Clear All". | All items removed. Counter shows "0/<max>". Progress bar resets to 0%. | E2E | `handleClearAll`. |
| TC-MC-E2E-015 | Admin | Creating with 0 items shows error toast | P0 | 1. Navigate to create page (nothing scanned). 2. Click "Create Master Carton (0 boxes)" (if button enabled). | `handleCreate` shows toast error "Scan at least one child box". No API call made. | E2E | Note: button is disabled at 0 items (`disabled={scannedItems.length === 0}`). |
| TC-MC-E2E-016 | Admin | Capacity enforcement: scanning beyond max_capacity prevents create | P1 | 1. Set max_capacity to 2. 2. Scan 3 items. 3. Click Create. | Toast error "Cannot exceed max capacity of 2". No API call made. | E2E | `scannedItems.length > maxCapacity` guard in `handleCreate`. |
| TC-MC-E2E-017 | Admin | Successful create navigates to the new carton detail page | P0 | 1. Scan ≥ 1 FREE boxes. 2. Click "Create Master Carton". | Carton created (HTTP 201). Router navigates to `/master-cartons/<new-id>`. Scan list cleared. | E2E | `router.push(ROUTES.MASTER_CARTON_DETAIL(data.id))`. |
| TC-MC-E2E-018 | Admin | Camera scanner toggle shows QR scanner component | P1 | 1. On create page, click "Use Camera Instead". | Camera scanner panel appears. Button changes to "Hide Camera". | E2E | `showScanner` toggle. |
| TC-MC-E2E-019 | Admin | Scanned item details fetched in background and displayed | P2 | 1. Scan a FREE box. 2. Wait for background `childBoxService.getByBarcode` call. | Item row shows `article_name`, `colour`, `size`, `mrp` below the barcode text. | E2E | `setItemDetails` async enrichment. AUTOMATION GAP. |

---

## Section 16 — Frontend E2E: Detail page (scan ledger + actions)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-E2E-020 | Admin | Detail page loads with carton header, status badge, capacity cards | P0 | 1. Navigate to `/master-cartons/<MC_ACTIVE_UUID>`. | Page shows: carton barcode in PageHeader. Three info cards: Status (badge), Capacity (`child_count / max_capacity`), Created (`created_at` formatted). | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-005. |
| TC-MC-E2E-021 | Admin | Child boxes table present and shows correct columns | P0 | 1. Detail page for a carton with boxes. | "Child Boxes (N)" section header visible. Table with columns: #, Barcode, SKU, Product, Colour, Size, MRP, Status. Each row has a PACKED status badge. | E2E | |
| TC-MC-E2E-022 | Admin | "Add Boxes" button opens scan panel for ACTIVE carton | P0 | 1. ACTIVE carton detail. Admin is logged in. 2. Click "Add Boxes". | Scan panel appears with HID scanner input auto-focused. "Scan to Pack" heading visible. Camera toggle button visible. | E2E | `showAddBoxes` + `canPack && statusAllowsAddBoxes`. `statusAllowsAddBoxes = ACTIVE || CREATED`. |
| TC-MC-E2E-023 | Admin | "Add Boxes" button NOT visible for CLOSED carton | P1 | 1. Navigate to CLOSED carton detail. | "Add Boxes" button absent (`statusAllowsAddBoxes = false` for CLOSED). Close Carton button also absent (carton is already CLOSED). | E2E | |
| TC-MC-E2E-024 | Admin | "Close Carton" button visible only for ACTIVE cartons | P0 | 1. ACTIVE carton detail, logged in as Admin. | "Close Carton" button visible. `carton.status === 'ACTIVE'` and `canClose = true`. | E2E | `canClose && carton.status === 'ACTIVE'`. |
| TC-MC-E2E-025 | Warehouse Operator | "Close Carton" button visible for Warehouse Operator on ACTIVE carton | P0 | 1. Login as Warehouse Operator. 2. Navigate to ACTIVE carton detail. | "Close Carton" button visible (`canClose = useCan('cartons:close')` → true for Warehouse Operator per seeds). | E2E | DISC-MC-1 frontend confirmation. AUTOMATION GAP. |
| TC-MC-E2E-026 | Dispatch Operator | Dispatch Operator sees no "Close Carton", no "Add Boxes", no "Full Unpack" | P1 | 1. Login as Dispatch Operator. 2. Navigate to ACTIVE carton detail. | None of: "Close Carton", "Add Boxes", "Full Unpack" buttons are visible. "Print Label" button IS visible (no permission gate). | E2E | `canPack = false`, `canUnpack = false`, `canClose = false` for Dispatch Operator. AUTOMATION GAP. |
| TC-MC-E2E-027 | Admin | "Full Unpack" confirmation modal appears on click | P1 | 1. ACTIVE carton detail. 2. Click "Full Unpack". | Modal opens with title "Full Unpack". Warning block shows `child_count` and barcode. "Confirm Unpack" (danger) and "Cancel" buttons present. | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-005 (partial). |
| TC-MC-E2E-028 | Admin | Assortment Summary section shows article/colour/size/MRP/qty table | P0 | 1. Detail page for carton with boxes. | "Assortment Summary" section with BarChart3 icon visible. Table shows article_name, colour, size, MRP, count. Total row at bottom. | E2E | Realised: `04-master-cartons.spec.ts` TC-MC-006. |
| TC-MC-E2E-029 | Admin | Assortment section absent for empty carton | P1 | 1. Detail page for CREATED (empty) carton. | "Assortment Summary" section not rendered (`assortment.length === 0`). | E2E | `{assortment && assortment.length > 0 && ...}` conditional. AUTOMATION GAP. |
| TC-MC-E2E-030 | Admin | "Print Label" button opens print window | P1 | 1. Detail page. 2. Click "Print Label". | New browser window/tab opens with the carton label HTML (146×96mm layout). QR code, article, colour, MRP, size assortment table present. `window.print()` called. | E2E | `handlePrintLabel` generates HTML directly. AUTOMATION GAP (popup permission). |
| TC-MC-E2E-031 | Admin | CREATED carton shows "Add Boxes" but not "Full Unpack" | P1 | 1. CREATED carton (empty). 2. Admin detail page. | "Add Boxes" button visible (`statusAllowsAddBoxes = ACTIVE || CREATED`). "Full Unpack" button NOT visible (`statusAllowsUnpack = ACTIVE || CLOSED` — CREATED excluded). | E2E | AUTOMATION GAP. |
| TC-MC-E2E-032 | Admin | Closed_at date shown on detail page for CLOSED carton | P1 | 1. CLOSED carton detail. | "Created" card shows both `created_at` and "Closed: <closed_at>" text. | E2E | `{carton.closed_at && ...}` conditional. AUTOMATION GAP. |

---

## Section 17 — Frontend E2E: HID-first scan UX

> HID (barcode scanner hardware) inputs fire as rapid keyboard events. The frontend uses `HIDScannerInput` (primary) with camera scanner as a secondary option. Both the create page and detail page scan panels follow this pattern.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-E2E-033 | Admin | HID scanner input auto-focused on create page load | P0 | 1. Navigate to `/master-cartons/create`. | The HID scanner input field has `autoFocus` — browser focus is on the scan input immediately without any user click. | E2E | `<HIDScannerInput ... autoFocus />` on create page. AUTOMATION GAP. |
| TC-MC-E2E-034 | Admin | HID scanner input auto-focused when "Add Boxes" panel opens | P0 | 1. Open "Add Boxes" on detail page. | Scan input receives focus automatically (`autoFocus` prop). | E2E | `<HIDScannerInput ... autoFocus className="mb-4" />` in detail page. AUTOMATION GAP. |
| TC-MC-E2E-035 | Admin | Camera scanner is secondary — hidden by default, shown on button click | P1 | 1. Create page or detail add-boxes panel. | `QRScanner` component is NOT visible initially. Clicking "Use Camera Instead" makes it visible. Clicking again hides it. | E2E | `showScanner` toggle. |
| TC-MC-E2E-036 | Admin | Scan input remains active during queue processing (never blocked) | P0 | 1. In "Add Boxes" panel, scan 5 barcodes in rapid succession. | Input field remains focusable and accepts input throughout. No `disabled` attribute set mid-burst. `processingRef` drains the queue asynchronously without locking the input. | E2E | Fix for old "input disabled mid-burst = boxes silently skipped" regression. AUTOMATION GAP. |

---

## Section 18 — Cross-references (A22/A23 scope boundaries)

> These TCs reference other sessions. Do NOT expand them here.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-REF-001 | Admin | `/unpack-repack` module is out of scope for this phase | — | See Session A22 (`phase-34-unpack-repack.md`) for: Single Unpack mode, Repack (two-carton `free-both`), Single Repack mode, target picker, scan queue/ledger within that module, `/unpack` redirect, Repack mode permission gating. | — | — | Cross-reference only. |
| TC-MC-REF-002 | Admin | Legacy CSV upload is out of scope for this phase | — | See Session A23 (`phase-35-legacy-inventory.md`) for: `POST /api/v1/master-cartons/legacy-upload` (bulk CSV), sample CSV endpoint `GET /legacy-upload/sample`, opaque count-level carton creation, per-row error report. | — | — | Cross-reference only. |
| TC-MC-REF-003 | Admin | `repack/free-both` is out of scope for this phase | — | See Session A22 for `POST /api/v1/master-cartons/repack/free-both` full RBAC + guard + symmetric-order TCs. | — | — | Cross-reference only. |

---

## Section 19 — Frontend: master-carton label rendering

> **Ground truth:** `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` `handlePrintLabel` function.
> **Label size:** `@page { size: 146mm 96mm; margin: 0; }` — landscape A6-ish, single label per page.
> **Three fixes shipped 2026-06-10:**
> 1. **`fitText` auto-fit** — same shrink routine as child-box labels, injected into `<script>` in the print window. Applied to `.article-cell` (initial 20pt), `.colour-cell` (18pt), `.size-summary-cell` (20pt), `table.assortment-grid tr.size-hdr-row td` (17pt), `table.assortment-grid tr.size-qty-row td` (22pt / 15pt for total). Floor: 9px.
> 2. **Kids-first size sort** — `sortSizes(Object.keys(sizeMap))` from `sizeSort.ts` applied to the SIZE ASSORTMENT columns. Kids (K-suffix) sort before adults; ascending numeric within each group.
> 3. **Aggregated distinct articles / colours / MRPs** — `articleSet`, `colourSet`, `mrpSet` accumulate all distinct values from assortment rows; label shows joined strings (article: `, ` separated; colour: `. ` separated; MRP: ` / ` separated, numerically sorted).
>
> **RBAC:** "Print Label" button has no permission gate (`cartons:read` is auth-only); any authenticated role can print. Role = Any for all TCs in this section.

### 19.1 — Responsive auto-fit (fitText) on master-carton label

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-LBL-001 | Any | fitText script present in master-carton print window | P0 | 1. Navigate to any carton detail page. 2. Click "Print Label". 3. Open the print window. 4. Inspect the `<script>` block. | Script defines `function fitText(sel, minPx)` with the identical shrink loop (0.5px steps, `g < 200` guard). `window.onload` calls `fitText('.article-cell', 9)`, `fitText('.colour-cell', 9)`, `fitText('.size-summary-cell', 9)`, `fitText('table.assortment-grid tr.size-hdr-row td', 9)`, `fitText('table.assortment-grid tr.size-qty-row td', 9)`, then `window.print()`. | Manual | Source: `master-cartons/[id]/page.tsx` lines 343–361. Spec: `43-label-rendering.spec.ts`. |
| TC-MC-LBL-002 | Any | Long multi-product article name in .article-cell shrinks to fit — no truncation | P0 | 1. Pre-condition: carton contains boxes from multiple products with long article names (e.g. combined label "Mahavir Extra Wide, Comfort Slipper XL"). 2. Click "Print Label". 3. After `window.onload`, inspect `.article-cell` font-size and scroll dimensions. | `scrollWidth <= clientWidth` after `fitText` runs. Computed font-size smaller than initial 20pt. Text is not truncated — all article names shown. Font ≥ 9px floor. | Manual | `articleLabel = Array.from(articleSet).join(', ')` can produce very long strings. `fitText` shrinks the `.article-cell` until it fits. AUTOMATION GAP — requires Playwright popup capture. Spec: `43-label-rendering.spec.ts`. |
| TC-MC-LBL-003 | Any | Short article name stays at initial font size — no unnecessary shrinkage | P1 | 1. Carton with a single, short article_name (e.g. "Binny"). 2. Click "Print Label". 3. Inspect `.article-cell` font-size after load. | Font remains at or near the 20pt CSS default (content fits; auto-fit loop never fires). | Manual | AUTOMATION GAP. |
| TC-MC-LBL-004 | Any | Long colour label in .colour-cell is shrunk to fit | P1 | 1. Carton with boxes of multiple long colour names (e.g. "Fluorescent Lime Green. Cobalt Blue Navy"). 2. Click "Print Label". 3. Inspect `.colour-cell`. | `scrollWidth <= clientWidth` after fit. Font smaller than initial 18pt, still ≥ 9px. | Manual | AUTOMATION GAP. |
| TC-MC-LBL-005 | Any | Size range label with K-suffix (e.g. "5K - 9") fits in .size-summary-cell | P0 | 1. Carton with Kids and adult sizes; `sizeRangeLabel` = "5K - 9". 2. Click "Print Label". 3. Inspect `.size-summary-cell` after load. | Text "5K - 9" visible, no overflow. Font may be reduced from 20pt if needed but stays ≥ 9px. Content fully readable. | Manual | AUTOMATION GAP. Spec: `43-label-rendering.spec.ts`. |
| TC-MC-LBL-006 | Any | SIZE ASSORTMENT header size cells (size-hdr-row) shrink to fit long size codes | P1 | 1. Carton with many sizes including Kids sizes (e.g. 8 sizes: 5K, 6K, 7K, 8K, 13K, 1, 2, 3). 2. Click "Print Label". 3. Inspect `table.assortment-grid tr.size-hdr-row td` after load. | Each header `td` shows its size value; text does not overflow its column width. Font may reduce below 17pt. Floor ≥ 9px. | Manual | AUTOMATION GAP. |
| TC-MC-LBL-007 | Any | fitText floor 9px — never shrinks below 9px on any cell | P0 | 1. Construct a pathological case (e.g. 20+ sizes on a single carton, column width ~5mm each). 2. Click "Print Label". 3. Inspect all fitted cells' computed font-size after load. | No cell has `fontSize < 9px`. `g < 200` guard prevents infinite loop. No JS error in print window console. | Manual | AUTOMATION GAP. |

### 19.2 — SIZE ASSORTMENT column sort order (Kids-first)

> **Ground truth:** `sortSizes(Object.keys(sizeMap))` (line 221 of `master-cartons/[id]/page.tsx`) uses `sizeSort.ts` `compareSizes`. Column headers (`sizeHeaders`) and quantity cells (`sizeQtys`) are generated from the sorted `sizes` array. `sizeRangeLabel = sizes[0] - sizes[last]`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-LBL-010 | Any | Kids sizes appear before adult sizes in SIZE ASSORTMENT columns | P0 | 1. Carton with assortment: sizes "1", "2", "5K", "6K", "13K". 2. Click "Print Label". 3. Inspect the SIZE ASSORTMENT `size-hdr-row` header cells left-to-right. | Column order (left to right): **5K, 6K, 13K, 1, 2**. Kids sizes (K-suffix) are leftmost, then adults. | Manual | `compareSizes` Kids-first rule. Spec: `43-label-rendering.spec.ts`. AUTOMATION GAP. |
| TC-MC-LBL-011 | Any | 13K appears before 1 in SIZE ASSORTMENT columns | P0 | 1. Carton with exactly sizes "13K" and "1". 2. Click "Print Label". 3. Inspect SIZE ASSORTMENT header. | "13K" column appears to the LEFT of "1" column. `sizeRangeLabel = "13K - 1"`. | Manual | Key regression check: `13K` (kid) < `1` (adult) by Kids-before-adult rule despite 13 > 1 numerically. AUTOMATION GAP. |
| TC-MC-LBL-012 | Any | Within Kids group, sizes sort ascending numerically | P1 | 1. Carton with Kids sizes "13K", "5K", "6K". 2. Print label. 3. Inspect SIZE ASSORTMENT header columns. | Order: **5K, 6K, 13K** (ascending by numeric value 5, 6, 13). Not alphabetical ("13K" would sort before "5K" alphabetically). | Manual | `parseFloat("13K") = 13 > parseFloat("6K") = 6 > parseFloat("5K") = 5`. AUTOMATION GAP. |
| TC-MC-LBL-013 | Any | Within adult group, sizes sort ascending numerically | P1 | 1. Carton with adult sizes "9", "1", "2". 2. Print label. 3. Inspect column order. | Order: **1, 2, 9** (ascending numeric). | Manual | AUTOMATION GAP. |
| TC-MC-LBL-014 | Any | sizeRangeLabel uses sorted-first and sorted-last elements | P0 | 1. Carton with sizes "1", "2", "5K", "6K", "13K". 2. Print label. 3. Inspect the `.size-summary-cell` text in the main-grid. | `sizeRangeLabel` text is "5K - 2" (`sizes[0] = "5K"`, `sizes[last] = "2"`). Not "1 - 13K" (unsorted). | Manual | `sizeRangeLabel = sizes.length === 1 ? sizes[0] : sizes[0] + ' - ' + sizes[last]`. Key: the range uses the sorted extremes. AUTOMATION GAP. Spec: `43-label-rendering.spec.ts`. |
| TC-MC-LBL-015 | Any | Single size in assortment: sizeRangeLabel is that size (no dash) | P1 | 1. Carton with only size "6". 2. Print label. 3. Inspect `.size-summary-cell`. | Text is "6" (just the size, no dash). `sizes.length === 1` branch. | Manual | AUTOMATION GAP. |
| TC-MC-LBL-016 | Any | Qty row corresponds correctly to sorted header columns | P0 | 1. Carton: size "5K" has 3 boxes, "6K" has 2 boxes, "1" has 5 boxes. 2. Print label. 3. Inspect `size-hdr-row` and `size-qty-row` alignment. | Column 1 header "5K" — quantity "3". Column 2 header "6K" — quantity "2". Column 3 header "1" — quantity "5". Header and quantity columns are aligned (same `sizeHeaders`/`sizeQtys` index). Total = "10 Pairs". | Manual | `sizeHeaders` and `sizeQtys` both iterate the same `sizes` array in order. AUTOMATION GAP. |

### 19.3 — Aggregated distinct articles, colours, MRPs

> **Ground truth:** `articleSet`, `colourSet`, `mrpSet` are populated from all assortment rows. `articleLabel = Array.from(articleSet).join(', ')`. `colourLabel = Array.from(colourSet).join('. ')`. `mrpLabel = Array.from(mrpSet).sort((a,b) => a-b).map(m => m.toFixed(2)).join(' / ')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MC-LBL-020 | Any | Single article/colour/MRP carton: label shows single values | P0 | 1. Carton with all boxes from one article "Binny Slipper", colour "Blue", MRP ₹299. 2. Click "Print Label". | `.article-cell` text: "Binny Slipper". `.colour-cell` text: "Blue". `.mrp-main` text: "MRP: ₹ 299.00". | Manual | Existing assortment behaviour confirmed with new aggregation code. Spec: `43-label-rendering.spec.ts`. AUTOMATION GAP. |
| TC-MC-LBL-021 | Any | Multi-colour carton: all colours joined with ". " separator | P0 | 1. Carton with boxes in colours "Blue" and "Red". 2. Click "Print Label". 3. Inspect `.colour-cell` text. | `.colour-cell` text is "Blue. Red" (joined by ". "). Not "Blue" only. Not "Blue, Red" (comma-separated). | Manual | `colourLabel = Array.from(colourSet).join('. ')`. Order is insertion order from assortment iteration. AUTOMATION GAP. |
| TC-MC-LBL-022 | Any | Multi-article carton: all articles joined with ", " separator | P1 | 1. Carton with boxes from two different articles "Binny Slipper" and "Binny Sandal". 2. Click "Print Label". 3. Inspect `.article-cell` text. | `.article-cell` text is "Binny Slipper, Binny Sandal". Not just one. | Manual | `articleLabel = Array.from(articleSet).join(', ')`. AUTOMATION GAP. |
| TC-MC-LBL-023 | Any | Multi-MRP carton: MRPs shown sorted numerically with " / " separator | P0 | 1. Carton with boxes at MRP 399 and MRP 299. 2. Click "Print Label". 3. Inspect `.mrp-main` text. | `.mrp-main` text: "MRP: ₹ 299.00 / 399.00" (lower MRP first; sorted numerically). Not "399.00 / 299.00". | Manual | `Array.from(mrpSet).sort((a,b)=>a-b).map(m=>m.toFixed(2)).join(' / ')`. AUTOMATION GAP. |
| TC-MC-LBL-024 | Any | Empty assortment (no boxes): label shows dash placeholders | P1 | 1. CREATED (empty) carton. 2. Click "Print Label". | `.article-cell` text: "-". `.colour-cell` text: "-". `.mrp-main` text: "MRP: ₹ -". `sizeRangeLabel` = "-". `totalPairs` = 0. No JS error. | Manual | `assortment && assortment.length > 0` guard; fallback: `articleLabel || '-'`, `colourLabel || '-'`, etc. AUTOMATION GAP. |
| TC-MC-LBL-025 | Any | Each distinct colour added only once to colourSet (dedup by value) | P1 | 1. Carton with 5 boxes all coloured "Blue" (same colour, multiple sizes). 2. Print label. | `.colour-cell` text is "Blue" (not "Blue. Blue. Blue. Blue. Blue"). `Set` deduplicates. | Manual | `colourSet.add(item.colour)` — Set semantics. AUTOMATION GAP. |
| TC-MC-LBL-026 | Any | Total Pairs in SIZE ASSORTMENT footer = sum of all active box counts | P0 | 1. Carton with 3 × size 6 and 2 × size 7 (5 boxes total). 2. Print label. 3. Inspect the `.total-qty` cell in `size-qty-row`. | Text is "5 Pairs". `totalPairs = Object.values(sizeMap).reduce((s,n)=>s+n, 0)`. | Manual | Verifies aggregation correctly sums across sizes. AUTOMATION GAP. Spec: `43-label-rendering.spec.ts`. |
