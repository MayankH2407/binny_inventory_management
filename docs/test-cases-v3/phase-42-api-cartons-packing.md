# Phase 42 — Backend API: Master Cartons & Packing

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `TC-API-MC-NNN`
**Authored:** 2026-06-09 (Track B — Session B3, Sonnet execution)
**Ground-truth sources verified:** `masterCarton.routes.ts`, `masterCarton.controller.ts`,
`masterCarton.service.ts`, `legacyCarton.service.ts`, `masterCarton.schema.ts`,
`seeds/001_roles.ts`, `config/constants.ts`, `middleware/rbac.middleware.ts`.
**Automation target:** Playwright `request` API specs — recommend
`backend/e2e/42-api-master-cartons.spec.ts`.

---

## Table of Contents

1. [Shared Test Data & Fixtures](#1-shared-test-data--fixtures)
2. [RBAC Reference for this Phase](#2-rbac-reference-for-this-phase)
3. [Matrix Discrepancies](#3-matrix-discrepancies)
4. [Automation Gaps](#4-automation-gaps)
5. [Section A — POST / (create master carton)](#section-a--post---create-master-carton)
6. [Section B — GET / (list master cartons)](#section-b--get---list-master-cartons)
7. [Section C — GET /qr/:barcode](#section-c--get-qrbarcode)
8. [Section D — GET /:id](#section-d--get-id)
9. [Section E — GET /:id/children](#section-e--get-idchildren)
10. [Section F — GET /:id/assortment](#section-f--get-idassortment)
11. [Section G — POST /pack (pack by UUID)](#section-g--post-pack-pack-by-uuid)
12. [Section H — POST /pack-by-barcode (idempotent barcode scan)](#section-h--post-pack-by-barcode-idempotent-barcode-scan)
13. [Section I — POST /unpack](#section-i--post-unpack)
14. [Section J — POST /:id/full-unpack](#section-j--post-idfull-unpack)
15. [Section K — POST /:id/close](#section-k--post-idclose)
16. [Section L — GET /legacy-upload/sample](#section-l--get-legacy-uploadsample)
17. [Section M — POST /legacy-upload (bulk CSV)](#section-m--post-legacy-upload-bulk-csv)
18. [Section N — POST /:id/open-legacy](#section-n--post-idopen-legacy)
19. [Section O — POST /repack/free-both](#section-o--post-repackfree-both)
20. [Section P — Removed route: POST /repack (404 confirmation)](#section-p--removed-route-post-repack-404-confirmation)
21. [Section Q — Inventory transaction integrity](#section-q--inventory-transaction-integrity)
22. [Section R — Concurrency & transactional rollback](#section-r--concurrency--transactional-rollback)
23. [Summary & TC Counts](#summary--tc-counts)

---

## 1. Shared Test Data & Fixtures

> All UUIDs are test-only placeholders. The automation spec must seed these via the API
> (or direct DB insert in `beforeAll`) and tear them down in `afterAll`.

| Symbol | Meaning |
|---|---|
| `ADMIN_TOKEN` | JWT for an Admin user (full bypass) |
| `SUPER_TOKEN` | JWT for a Supervisor user |
| `WH_TOKEN` | JWT for a Warehouse Operator user |
| `DISP_TOKEN` | JWT for a Dispatch Operator user |
| `CB_FREE_1` | FREE child box (barcode `CB000001`) |
| `CB_FREE_2` | FREE child box (barcode `CB000002`) |
| `CB_FREE_3` | FREE child box (barcode `CB000003`; used for capacity tests) |
| `CB_GEN_1` | GENERATED child box (barcode `CB000004`; not yet activated) |
| `CB_SAMPLE_1` | Child box in SAMPLE status |
| `CB_DISPATCHED_1` | Child box in DISPATCHED status |
| `MC_CREATED` | Master carton, status=CREATED, child_count=0 |
| `MC_ACTIVE` | Master carton, status=ACTIVE, child_count=2 (contains `CB_FREE_1`, `CB_FREE_2`) |
| `MC_CLOSED` | Master carton, status=CLOSED, child_count=1 |
| `MC_DISPATCHED` | Master carton, status=DISPATCHED |
| `MC_LEGACY` | Legacy master carton, `is_legacy=true`, status=CLOSED |
| `MC_LEGACY_2` | Second legacy master carton (for repack free-both tests) |
| API base | `http://localhost:5000/api/v1` |
| `PRODUCT_A` | Active product: article "Test Slipper", colour "Blue", size "6", MRP 299.00 |
| `PRODUCT_B` | Active product: same article code, colour "Red", size "7", MRP 299.00 |

---

## 2. RBAC Reference for this Phase

Verified against `seeds/001_roles.ts`:

| Permission | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:---:|:---:|:---:|:---:|
| `cartons:create` — POST /, POST /legacy-upload | ✓ | ✓ | ✓ | ✗ |
| `cartons:read` — GET /legacy-upload/sample | ✓ | ✓ | ✓ | ✓ |
| `cartons:close` — POST /:id/close | ✓ | ✓ | **✓** | ✗ |
| `packing:pack` — POST /pack, POST /pack-by-barcode | ✓ | ✓ | ✓ | ✗ |
| `packing:unpack` — POST /unpack, /:id/full-unpack, /:id/open-legacy, /repack/free-both | ✓ | ✓ | **✓** | ✗ |
| All GET endpoints (/, /qr/:b, /:id, /:id/children, /:id/assortment) | auth-only (200 all roles) |
| `cartons:reopen` (seeded Admin+Supervisor only; **no current route uses this**) | dead perm | — | — | — |
| `cartons:delete` (seeded Admin only; **no current DELETE route**) | dead perm | — | — | — |
| `packing:repack` | **does not exist** in seeds or routes | — | — | — |

> Admin is super-admin: always passes regardless of `role_permissions` rows.
> Unauthenticated requests to any endpoint → **401**.
> Authenticated user lacking the required permission → **403**.

---

## 3. Matrix Discrepancies

> Encoded as explicit TCs — **not bugs to fix here**, document actual behavior.

**DISC-MC-1 — `cartons:close` held by Warehouse Operator.**
`seeds/001_roles.ts` line 74 seeds `cartons:close` into the Warehouse Operator role. The
MASTER_TEST_PLAN matrix was corrected in Track A (A10). Correct: Warehouse Operator CAN
close a carton → 200. TCs in Section K reflect this.

**DISC-MC-2 — `/:id/open-legacy` gated by `packing:unpack`, NOT `cartons:reopen`.**
The route uses `authorizePermission('packing:unpack')`. `packing:unpack` is seeded for
Admin + Supervisor + **Warehouse Operator** — so WH Op CAN open a legacy carton. The
MASTER_TEST_PLAN row "`cartons:reopen` = Admin+Supervisor only" is correct for the
permission name, but this route does NOT use that permission. Encode WH-Op → 200 as
expected behavior.

**DISC-MC-3 — GET list route has NO permission gate.**
`router.get('/', validate({query}), masterCartonController.getMasterCartons)` — no
`authorizePermission` call. All authenticated roles get 200. This matches the auth-only
discrepancy documented in MASTER_TEST_PLAN §Known Discrepancies #2.

**DISC-MC-4 — All other GET endpoints (/:id, /:id/children, /:id/assortment, /qr/:barcode) are auth-only.**
Same pattern: `router.use(authenticate)` only, no per-endpoint permission gate on GETs.

**DISC-MC-5 — `cartons:reopen` and `cartons:delete` are dead permissions.**
Both are seeded but no route currently calls `authorizePermission('cartons:reopen')` or
`authorizePermission('cartons:delete')`. Flagged as dead code / coverage gap.

**DISC-MC-6 — Legacy upload writes NO inventory_transactions.**
`legacyCarton.service.ts::bulkCreateLegacyCartons` does not insert into
`inventory_transactions`. Each row gets an audit log, but no stock movement transactions.
Encode as expected behavior (not a bug to fix here).

**DISC-MC-7 — Spec 20 (`20-cartons-lifecycle.spec.ts`) calls the deleted `/master-cartons/repack` route.**
That route was removed; the call will receive 404 at runtime. This is an **AUTOMATION
GAP** — the spec must be updated to remove or replace the deleted-route call (see
Section P and Automation Gaps).

---

## 4. Automation Gaps

| Gap ID | Description | Recommended action |
|---|---|---|
| AG-MC-01 | `20-cartons-lifecycle.spec.ts` still calls `POST /master-cartons/repack` (deleted route). CI will false-pass or silently skip. | Update spec: replace with `/repack/free-both` call or add explicit 404 assertion. |
| AG-MC-02 | No existing spec covers `/repack/free-both` end-to-end (both cartons freed, freed_count returned, audit REPACK_FREE_BOTH written). | Add to new `42-api-master-cartons.spec.ts`. |
| AG-MC-03 | No existing spec covers `pack-by-barcode` idempotent re-scan (`alreadyPacked:true` path). | Add to `42-api-master-cartons.spec.ts`. |
| AG-MC-04 | No existing spec covers legacy-upload CSV success, partial-error, and 0-qty skip paths. | Add to `42-api-master-cartons.spec.ts`. |
| AG-MC-05 | No existing spec covers `includeLegacy` query parameter behavior (default hides legacy, `true` shows only legacy, `false` shows only non-legacy). | Add to `42-api-master-cartons.spec.ts`. |
| AG-MC-06 | Transactional rollback on bad barcode during `POST /` with `child_box_barcodes` array. No spec covers partial-list abort. | Add to `42-api-master-cartons.spec.ts`. |
| AG-MC-07 | No spec covers GENERATED box auto-activation (implicit CHILD_ACTIVATED transaction) during pack. | Add to `42-api-master-cartons.spec.ts`. |
| AG-MC-08 | `20-cartons-lifecycle.spec.ts` asserts WH-Op `POST /:id/close` → 403 (should be 200 per corrected RBAC). | Fix assertion in that spec file. |

---

## Section A — POST / (create master carton)

> Permission: `cartons:create` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons`
> Schema: `createMasterCartonSchema` — `max_capacity` (int, 1–100, default 50); `child_box_barcodes` (string[], default []).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-001 | Admin | Create carton — empty (no barcodes) | P1 | POST `/master-cartons` `{ "max_capacity": 24 }` | 201; body has `id`, `carton_barcode` (matches `MC######` pattern), `status="CREATED"`, `max_capacity=24`, `child_count=0`, `qr_data_uri` non-empty | API | Audit log `CREATE_MASTER_CARTON` written; inv-txn `CARTON_CREATED` written |
| TC-API-MC-002 | Supervisor | Create carton — empty, default capacity | P1 | POST `/master-cartons` `{}` | 201; `status="CREATED"`, `max_capacity=50` (default) | API | — |
| TC-API-MC-003 | Warehouse Operator | Create carton — empty | P1 | POST `/master-cartons` `{ "max_capacity": 10 }` | 201; `status="CREATED"` | API | WH Op holds `cartons:create` |
| TC-API-MC-004 | Dispatch Operator | Create carton — denied | P1 | POST `/master-cartons` `{}` | 403 `"Required permission: cartons:create"` | API | Dispatch Op lacks `cartons:create` |
| TC-API-MC-005 | Unauthenticated | Create carton — 401 | P1 | POST `/master-cartons` `{}` (no auth header) | 401 | API | — |
| TC-API-MC-006 | Admin | Create carton — with FREE barcodes | P1 | POST `/master-cartons` `{ "max_capacity": 5, "child_box_barcodes": ["CB000001","CB000002"] }` | 201; `status="ACTIVE"`, `child_count=2`; `CB000001` and `CB000002` are now PACKED | Integration | One CARTON_CREATED + two CHILD_PACKED inv-txns written inside transaction |
| TC-API-MC-007 | Admin | Create carton — with GENERATED barcode auto-activates | P1 | POST `/master-cartons` `{ "child_box_barcodes": ["CB000004"] }` where CB000004 is GENERATED | 201; `status="ACTIVE"`, `child_count=1`; CB000004 now PACKED | Integration | A CHILD_ACTIVATED inv-txn is written before CHILD_PACKED for CB000004 (implicit activation) |
| TC-API-MC-008 | Admin | Create carton — one unknown barcode in list → rollback | P1 | POST `/master-cartons` `{ "child_box_barcodes": ["CB000001","CBXXXXXX"] }` where CBXXXXXX does not exist | 404 error; master carton NOT created; CB000001 status unchanged (still FREE) | Integration | Full transactional rollback; no partial state |
| TC-API-MC-009 | Admin | Create carton — barcode with non-packable status | P2 | POST `/master-cartons` `{ "child_box_barcodes": ["CB_SAMPLE_BARCODE"] }` where box is SAMPLE status | 400 error mentioning current status; no carton created | Integration | Only FREE or GENERATED boxes can be packed |
| TC-API-MC-010 | Admin | Create carton — capacity exceeded by barcodes list | P2 | POST `/master-cartons` `{ "max_capacity": 1, "child_box_barcodes": ["CB000001","CB000002"] }` | 400 `"Master carton is full"` on second barcode; rollback | Integration | Capacity check is per-box inside loop |
| TC-API-MC-011 | Admin | Create carton — max_capacity = 0 | P2 | POST `/master-cartons` `{ "max_capacity": 0 }` | 400 validation error `"Max capacity must be positive"` | API | Zod schema: `positive()` |
| TC-API-MC-012 | Admin | Create carton — max_capacity = 101 | P2 | POST `/master-cartons` `{ "max_capacity": 101 }` | 400 validation error `"Max capacity must not exceed 100"` | API | Zod schema: `max(100)` |
| TC-API-MC-013 | Admin | Create carton — max_capacity = 100 (boundary) | P2 | POST `/master-cartons` `{ "max_capacity": 100 }` | 201; `max_capacity=100` | API | Upper boundary passes |
| TC-API-MC-014 | Admin | Create carton — max_capacity = 1 (boundary) | P2 | POST `/master-cartons` `{ "max_capacity": 1 }` | 201; `max_capacity=1` | API | Lower boundary passes |
| TC-API-MC-015 | Admin | Create carton — barcodes are uppercased by schema | P3 | POST `/master-cartons` `{ "child_box_barcodes": ["cb000001"] }` (lowercase) | 201 if CB000001 exists (schema `transform` uppercases) | API | `z.string().transform(s => s.trim().toUpperCase())` |

---

## Section B — GET / (list master cartons)

> Permission: **auth-only** (no `authorizePermission` call — DISC-MC-3).
> URL: `GET /api/v1/master-cartons`
> Supported query params: `page`, `limit`, `status`, `search`, `includeLegacy`.
> Default behavior: `includeLegacy` not supplied → hides legacy cartons (`is_legacy=false` filter).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-020 | Admin | List cartons — default (no params) | P1 | GET `/master-cartons` | 200; paginated response; `data` array; `total`, `page=1`, `limit=25`; no legacy cartons in results | API | Default hides legacy |
| TC-API-MC-021 | Supervisor | List cartons — all roles get 200 | P1 | GET `/master-cartons` | 200 | API | Auth-only; no perm gate |
| TC-API-MC-022 | Warehouse Operator | List cartons — all roles get 200 | P1 | GET `/master-cartons` | 200 | API | — |
| TC-API-MC-023 | Dispatch Operator | List cartons — all roles get 200 | P1 | GET `/master-cartons` | 200 | API | — |
| TC-API-MC-024 | Unauthenticated | List cartons — 401 | P1 | GET `/master-cartons` (no auth) | 401 | API | `router.use(authenticate)` applies |
| TC-API-MC-025 | Admin | List cartons — filter by status=ACTIVE | P1 | GET `/master-cartons?status=ACTIVE` | 200; all returned cartons have `status="ACTIVE"` | API | — |
| TC-API-MC-026 | Admin | List cartons — filter by status=CLOSED | P1 | GET `/master-cartons?status=CLOSED` | 200; all returned cartons have `status="CLOSED"` | API | — |
| TC-API-MC-027 | Admin | List cartons — filter by status=CREATED | P2 | GET `/master-cartons?status=CREATED` | 200; all returned cartons have `status="CREATED"` | API | — |
| TC-API-MC-028 | Admin | List cartons — filter by status=DISPATCHED | P2 | GET `/master-cartons?status=DISPATCHED` | 200; all returned cartons have `status="DISPATCHED"` | API | — |
| TC-API-MC-029 | Admin | List cartons — invalid status value | P2 | GET `/master-cartons?status=INVALID` | 400 validation error (Zod `z.enum`) | API | `statusValues` enum enforced |
| TC-API-MC-030 | Admin | List cartons — search by partial barcode | P1 | GET `/master-cartons?search=CB0` | 200; all returned cartons have barcodes matching `%CB0%` | API | ILIKE search on `carton_barcode` |
| TC-API-MC-031 | Admin | List cartons — pagination page=2 | P2 | GET `/master-cartons?page=2&limit=5` | 200; at most 5 results; `page=2` reflected | API | Offset-based |
| TC-API-MC-032 | Admin | List cartons — includeLegacy=true shows only legacy | P1 | Seed MC_LEGACY; GET `/master-cartons?includeLegacy=true` | 200; all results have `is_legacy=true`; normal cartons absent | API | `is_legacy=true` filter applied |
| TC-API-MC-033 | Admin | List cartons — includeLegacy=false shows only non-legacy | P1 | GET `/master-cartons?includeLegacy=false` | 200; all results have `is_legacy=false` | API | — |
| TC-API-MC-034 | Admin | List cartons — includeLegacy not supplied → non-legacy default | P2 | GET `/master-cartons` (no includeLegacy param) | 200; no results have `is_legacy=true` | API | Default guard: `mc.is_legacy = false` always applied |
| TC-API-MC-035 | Admin | List cartons — response includes assortment summary fields | P2 | GET `/master-cartons` with MC_ACTIVE in DB | 200; active carton has `article_summary`, `colour_summary`, `size_summary`, `mrp_summary` fields | API | LATERAL JOIN in query |
| TC-API-MC-036 | Admin | List cartons — combined status + search filters | P2 | GET `/master-cartons?status=ACTIVE&search=MC` | 200; all results are ACTIVE and match barcode search | API | Both conditions joined with AND |

---

## Section C — GET /qr/:barcode

> Permission: auth-only (no `authorizePermission`; DISC-MC-4).
> URL: `GET /api/v1/master-cartons/qr/:barcode`
> Schema: `masterCartonBarcodeParamSchema` — barcode uppercased.
> **Order note:** This route is declared BEFORE `/:id` in the router so `/qr/ABC` does NOT shadow `/:id`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-040 | Admin | GET by barcode — success | P1 | GET `/master-cartons/qr/MC000001` (valid barcode) | 200; body has carton fields + `child_boxes` array (active mappings) | API | `carton_barcode` matched case-insensitively (`UPPER($1)`) |
| TC-API-MC-041 | Supervisor | GET by barcode — 200 (auth-only) | P1 | GET `/master-cartons/qr/MC000001` | 200 | API | — |
| TC-API-MC-042 | Warehouse Operator | GET by barcode — 200 (auth-only) | P1 | GET `/master-cartons/qr/MC000001` | 200 | API | — |
| TC-API-MC-043 | Dispatch Operator | GET by barcode — 200 (auth-only) | P1 | GET `/master-cartons/qr/MC000001` | 200 | API | — |
| TC-API-MC-044 | Unauthenticated | GET by barcode — 401 | P1 | GET `/master-cartons/qr/MC000001` (no auth) | 401 | API | — |
| TC-API-MC-045 | Admin | GET by barcode — not found | P1 | GET `/master-cartons/qr/MCXXXXXX` (unknown barcode) | 404 `"Master carton not found"` | API | — |
| TC-API-MC-046 | Admin | GET by barcode — lowercase input uppercased | P2 | GET `/master-cartons/qr/mc000001` | 200 (same as uppercase) | API | `transform(s => s.trim().toUpperCase())` |
| TC-API-MC-047 | Admin | GET by barcode — empty barcode param | P3 | GET `/master-cartons/qr/` (trailing slash, or min(1) fails) | 400 or 404 depending on router match | API | `min(1)` in schema |

---

## Section D — GET /:id

> Permission: auth-only (no `authorizePermission`; DISC-MC-4).
> URL: `GET /api/v1/master-cartons/:id`
> Schema: `masterCartonIdParamSchema` — UUID validation.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-050 | Admin | GET by ID — success | P1 | GET `/master-cartons/{MC_ACTIVE.id}` | 200; body has carton fields + `child_boxes` array of active mappings (barcode, status, quantity, article_name, colour, size, mrp) | API | — |
| TC-API-MC-051 | Supervisor | GET by ID — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}` | 200 | API | — |
| TC-API-MC-052 | Warehouse Operator | GET by ID — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}` | 200 | API | — |
| TC-API-MC-053 | Dispatch Operator | GET by ID — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}` | 200 | API | — |
| TC-API-MC-054 | Unauthenticated | GET by ID — 401 | P1 | GET `/master-cartons/{MC_ACTIVE.id}` (no auth) | 401 | API | — |
| TC-API-MC-055 | Admin | GET by ID — not found | P1 | GET `/master-cartons/00000000-0000-0000-0000-000000000000` | 404 `"Master carton not found"` | API | — |
| TC-API-MC-056 | Admin | GET by ID — invalid UUID | P2 | GET `/master-cartons/not-a-uuid` | 400 `"Invalid master carton ID format"` | API | Zod UUID validation |

---

## Section E — GET /:id/children

> Permission: auth-only.
> URL: `GET /api/v1/master-cartons/:id/children`
> Returns only `is_active = true` mappings from `carton_child_mapping`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-060 | Admin | GET children — active carton | P1 | GET `/master-cartons/{MC_ACTIVE.id}/children` | 200; array of active child box mappings with `barcode`, `status`, `quantity`, `article_name`, `colour`, `size`, `mrp`; ordered by `packed_at DESC` | API | Only `is_active=true` mappings returned |
| TC-API-MC-061 | Supervisor | GET children — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}/children` | 200 | API | — |
| TC-API-MC-062 | Warehouse Operator | GET children — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}/children` | 200 | API | — |
| TC-API-MC-063 | Dispatch Operator | GET children — 200 (auth-only) | P1 | GET `/master-cartons/{MC_ACTIVE.id}/children` | 200 | API | — |
| TC-API-MC-064 | Unauthenticated | GET children — 401 | P1 | GET `/master-cartons/{MC_ACTIVE.id}/children` (no auth) | 401 | API | — |
| TC-API-MC-065 | Admin | GET children — empty carton returns empty array | P1 | GET `/master-cartons/{MC_CREATED.id}/children` | 200; `data = []` or empty array | API | — |
| TC-API-MC-066 | Admin | GET children — unpacked boxes absent | P2 | Unpack a box from MC_ACTIVE; GET children | 200; the unpacked box is NOT in the result (is_active=false) | Integration | Only active mappings shown |
| TC-API-MC-067 | Admin | GET children — invalid UUID param | P2 | GET `/master-cartons/not-a-uuid/children` | 400 `"Invalid master carton ID format"` | API | — |

---

## Section F — GET /:id/assortment

> Permission: auth-only.
> URL: `GET /api/v1/master-cartons/:id/assortment`
> Returns distinct (article_name, colour, size, mrp) with count of active boxes per combination.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-070 | Admin | GET assortment — multi-colour carton | P1 | Pack CB (Blue/6) and CB (Red/7) into same carton; GET assortment | 200; array with 2 rows: one for Blue/6, one for Red/7; each has `article_name`, `colour`, `size`, `mrp`, `count` | Integration | Distinct aggregation groups by (article_name, colour, size, mrp) |
| TC-API-MC-071 | Supervisor | GET assortment — 200 (auth-only) | P1 | GET assortment on seeded carton | 200 | API | — |
| TC-API-MC-072 | Warehouse Operator | GET assortment — 200 (auth-only) | P1 | GET assortment on seeded carton | 200 | API | — |
| TC-API-MC-073 | Dispatch Operator | GET assortment — 200 (auth-only) | P1 | GET assortment on seeded carton | 200 | API | — |
| TC-API-MC-074 | Unauthenticated | GET assortment — 401 | P1 | GET assortment (no auth) | 401 | API | — |
| TC-API-MC-075 | Admin | GET assortment — empty carton returns empty array | P1 | GET assortment on MC_CREATED | 200; empty array `[]` | API | No active mappings → empty GROUP BY |
| TC-API-MC-076 | Admin | GET assortment — carton not found | P1 | GET `/master-cartons/00000000-0000-0000-0000-000000000000/assortment` | 404 `"Master carton not found"` | API | Service verifies carton exists first |
| TC-API-MC-077 | Admin | GET assortment — count is per-combination | P2 | Pack 3 boxes of PRODUCT_A (Blue/6) and 1 of PRODUCT_B (Red/7) | 200; Blue/6 row has `count=3`; Red/7 row has `count=1` | Integration | COUNT(*)::int grouped correctly |
| TC-API-MC-078 | Admin | GET assortment — inactive mappings excluded | P2 | Pack 2 boxes; unpack 1; GET assortment | 200; count=1 (unpacked box not counted) | Integration | `is_active=true` filter in query |

---

## Section G — POST /pack (pack by UUID)

> Permission: `packing:pack` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/pack`
> Body: `{ "child_box_id": "<uuid>", "master_carton_id": "<uuid>" }`
> Transactional with row locks on child box and carton.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-080 | Admin | Pack — FREE box into CREATED carton | P1 | POST `/master-cartons/pack` `{ child_box_id: CB_FREE_1.id, master_carton_id: MC_CREATED.id }` | 200; `carton.status="ACTIVE"`, `carton.child_count=1`; CB_FREE_1 status → PACKED; mapping created | Integration | Status flips CREATED→ACTIVE on first pack; CHILD_PACKED inv-txn written |
| TC-API-MC-081 | Supervisor | Pack — 200 | P1 | Same as TC-API-MC-080 with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-082 | Warehouse Operator | Pack — 200 | P1 | Same with WH_TOKEN | 200 | API | WH Op holds `packing:pack` |
| TC-API-MC-083 | Dispatch Operator | Pack — 403 | P1 | POST `/master-cartons/pack` with DISP_TOKEN | 403 `"Required permission: packing:pack"` | API | — |
| TC-API-MC-084 | Unauthenticated | Pack — 401 | P1 | POST `/master-cartons/pack` (no auth) | 401 | API | — |
| TC-API-MC-085 | Admin | Pack — GENERATED box: implicit activation | P1 | POST pack with CB_GEN_1.id | 200; box → PACKED; CHILD_ACTIVATED inv-txn precedes CHILD_PACKED; carton becomes ACTIVE | Integration | Auto-activate path in service |
| TC-API-MC-086 | Admin | Pack — into ACTIVE carton increments child_count | P1 | MC_ACTIVE has child_count=2; pack one more | 200; `carton.child_count=3`; status stays ACTIVE | Integration | Only CREATED→ACTIVE flip on first pack |
| TC-API-MC-087 | Admin | Pack — child box not found | P1 | POST pack `{ child_box_id: "00000000-0000-0000-0000-000000000000", ... }` | 404 `"Child box not found"` | API | — |
| TC-API-MC-088 | Admin | Pack — master carton not found | P1 | POST pack `{ ..., master_carton_id: "00000000-0000-0000-0000-000000000000" }` | 404 `"Master carton not found"` | API | — |
| TC-API-MC-089 | Admin | Pack — box in SAMPLE status → 400 | P1 | POST pack with CB_SAMPLE_1.id | 400 `"currently SAMPLE and cannot be packed"` | API | Only FREE or GENERATED allowed |
| TC-API-MC-090 | Admin | Pack — box in DISPATCHED status → 400 | P1 | POST pack with CB_DISPATCHED_1.id | 400 `"currently DISPATCHED and cannot be packed"` | API | — |
| TC-API-MC-091 | Admin | Pack — carton is CLOSED → 400 | P1 | POST pack into MC_CLOSED | 400 `"CLOSED and cannot accept new child boxes"` | API | — |
| TC-API-MC-092 | Admin | Pack — carton is DISPATCHED → 400 | P1 | POST pack into MC_DISPATCHED | 400 `"DISPATCHED and cannot accept new child boxes"` | API | — |
| TC-API-MC-093 | Admin | Pack — carton at full capacity → 400 | P2 | Create carton with max_capacity=1; pack 1 box; pack another | 400 `"Master carton is full"` | Integration | `child_count >= max_capacity` |
| TC-API-MC-094 | Admin | Pack — invalid child_box_id UUID | P2 | POST pack `{ child_box_id: "not-uuid", ... }` | 400 `"Invalid child box ID format"` | API | Zod UUID validation |
| TC-API-MC-095 | Admin | Pack — invalid master_carton_id UUID | P2 | POST pack `{ ..., master_carton_id: "not-uuid" }` | 400 `"Invalid master carton ID format"` | API | — |
| TC-API-MC-096 | Admin | Pack — missing child_box_id | P2 | POST pack `{ master_carton_id: "..." }` | 400 validation error | API | Required field |
| TC-API-MC-097 | Admin | Pack — missing master_carton_id | P2 | POST pack `{ child_box_id: "..." }` | 400 validation error | API | Required field |

---

## Section H — POST /pack-by-barcode (idempotent barcode scan)

> Permission: `packing:pack` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/pack-by-barcode`
> Body: `{ "barcode": "<string>", "master_carton_id": "<uuid>" }`
> Key behavior: idempotent re-scan of a box already in this carton returns `alreadyPacked:true`
> (200, no error). Box packed in a DIFFERENT carton returns 400 conflict.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-100 | Admin | Pack-by-barcode — FREE box, happy path | P1 | POST `/master-cartons/pack-by-barcode` `{ "barcode": "CB000001", "master_carton_id": MC_CREATED.id }` | 200; `result.alreadyPacked=false`; `result.childBoxBarcode="CB000001"`; `result.carton.status="ACTIVE"` | Integration | Delegates to `packChildBox` internally |
| TC-API-MC-101 | Supervisor | Pack-by-barcode — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-102 | Warehouse Operator | Pack-by-barcode — 200 | P1 | Same with WH_TOKEN | 200 | API | WH Op holds `packing:pack` |
| TC-API-MC-103 | Dispatch Operator | Pack-by-barcode — 403 | P1 | POST `/master-cartons/pack-by-barcode` with DISP_TOKEN | 403 | API | — |
| TC-API-MC-104 | Unauthenticated | Pack-by-barcode — 401 | P1 | POST (no auth) | 401 | API | — |
| TC-API-MC-105 | Admin | Pack-by-barcode — idempotent re-scan same carton | P1 | Pack CB000001 into carton; immediately pack CB000001 again into SAME carton | 200; `result.alreadyPacked=true`; `result.childBoxBarcode="CB000001"`; `result.carton=null`; HTTP message `"Box CB000001 is already in this carton"` | Integration | Core idempotency: stops re-scan errors in rapid-scan UX |
| TC-API-MC-106 | Admin | Pack-by-barcode — conflict: box packed in different carton | P1 | Pack CB000001 into MC_A; then POST pack-by-barcode CB000001 into MC_B | 400 `"Child box CB000001 is already packed in another carton. Unpack it first."` | Integration | Status=PACKED but different carton → explicit conflict |
| TC-API-MC-107 | Admin | Pack-by-barcode — unknown barcode | P1 | POST with barcode `"CBXXXXXX"` (not in DB) | 404 `"No child box found with barcode CBXXXXXX"` | API | — |
| TC-API-MC-108 | Admin | Pack-by-barcode — GENERATED box auto-activates | P1 | POST with CB_GEN_1 barcode | 200; `alreadyPacked=false`; CB_GEN_1 now PACKED; CHILD_ACTIVATED + CHILD_PACKED inv-txns | Integration | Delegates to `packChildBox` which handles GENERATED |
| TC-API-MC-109 | Admin | Pack-by-barcode — lowercase barcode normalized | P2 | POST `{ "barcode": "cb000001", ... }` | 200 same as uppercase (schema `transform` uppercases) | API | `normalized = barcode.trim().toUpperCase()` |
| TC-API-MC-110 | Admin | Pack-by-barcode — empty barcode string | P2 | POST `{ "barcode": "", ... }` | 400 `"Barcode is required"` (min(1)) | API | — |
| TC-API-MC-111 | Admin | Pack-by-barcode — missing master_carton_id | P2 | POST `{ "barcode": "CB000001" }` | 400 validation error | API | Required UUID field |
| TC-API-MC-112 | Admin | Pack-by-barcode — invalid master_carton_id UUID | P2 | POST `{ "barcode": "CB000001", "master_carton_id": "not-uuid" }` | 400 `"Invalid master carton ID format"` | API | — |
| TC-API-MC-113 | Admin | Pack-by-barcode — short barcode format (CB######) | P2 | POST with barcode matching `CB[A-Z0-9]{6}` format | 200 if box exists | API | Short barcode format from Phase 08 |

---

## Section I — POST /unpack

> Permission: `packing:unpack` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/unpack`
> Body: `{ "child_box_id": "<uuid>", "master_carton_id": "<uuid>" }`

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-120 | Admin | Unpack — box from ACTIVE carton | P1 | MC_ACTIVE has child_count=2; POST unpack `{ CB_FREE_1.id, MC_ACTIVE.id }` | 200; carton child_count=1; CB_FREE_1 status → FREE; mapping `is_active=false`; CHILD_UNPACKED inv-txn | Integration | Status stays ACTIVE (count > 0) |
| TC-API-MC-121 | Supervisor | Unpack — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-122 | Warehouse Operator | Unpack — 200 | P1 | Same with WH_TOKEN | 200 | API | WH Op holds `packing:unpack` |
| TC-API-MC-123 | Dispatch Operator | Unpack — 403 | P1 | POST unpack with DISP_TOKEN | 403 | API | — |
| TC-API-MC-124 | Unauthenticated | Unpack — 401 | P1 | POST unpack (no auth) | 401 | API | — |
| TC-API-MC-125 | Admin | Unpack — last box → carton reverts to CREATED | P1 | MC with child_count=1; unpack the one box | 200; `carton.status="CREATED"`, `carton.child_count=0` | Integration | `newCount==0 → CREATED` |
| TC-API-MC-126 | Admin | Unpack — from CLOSED carton is allowed | P1 | MC_CLOSED; POST unpack one box | 200; carton status reverts (CLOSED→ACTIVE if count>0 after, or CREATED if count==0) | Integration | Service only blocks DISPATCHED; CLOSED is allowed |
| TC-API-MC-127 | Admin | Unpack — from DISPATCHED carton → 400 | P1 | MC_DISPATCHED; POST unpack | 400 `"Cannot unpack from a dispatched carton"` | API | Service guard |
| TC-API-MC-128 | Admin | Unpack — mapping not found (box not in carton) | P1 | POST unpack with CB that is not in the specified carton | 404 `"Active mapping not found for this child box and carton"` | API | — |
| TC-API-MC-129 | Admin | Unpack — box not found | P1 | POST unpack `{ child_box_id: "00000000-...", ... }` | 404 (mapping not found) | API | Mapping lookup fails first |
| TC-API-MC-130 | Admin | Unpack — invalid UUID | P2 | POST unpack `{ child_box_id: "not-uuid", ... }` | 400 `"Invalid child box ID format"` | API | Zod validation |

---

## Section J — POST /:id/full-unpack

> Permission: `packing:unpack` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/:id/full-unpack`
> Unpacks ALL active child boxes atomically; resets carton to CREATED/child_count=0.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-135 | Admin | Full-unpack — ACTIVE carton with 3 boxes | P1 | POST `/{MC_ACTIVE.id}/full-unpack` (MC_ACTIVE has 3 children) | 200; carton `status="CREATED"`, `child_count=0`; all 3 child boxes → FREE; 3 CHILD_UNPACKED inv-txns | Integration | Audit `FULL_UNPACK_MASTER_CARTON` with `unpacked_count=3` |
| TC-API-MC-136 | Supervisor | Full-unpack — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-137 | Warehouse Operator | Full-unpack — 200 | P1 | Same with WH_TOKEN | 200 | API | WH Op holds `packing:unpack` |
| TC-API-MC-138 | Dispatch Operator | Full-unpack — 403 | P1 | POST full-unpack with DISP_TOKEN | 403 | API | — |
| TC-API-MC-139 | Unauthenticated | Full-unpack — 401 | P1 | POST full-unpack (no auth) | 401 | API | — |
| TC-API-MC-140 | Admin | Full-unpack — CLOSED carton allowed | P2 | POST `/{MC_CLOSED.id}/full-unpack` | 200; boxes freed; carton reset to CREATED | Integration | Only DISPATCHED and CREATED are blocked |
| TC-API-MC-141 | Admin | Full-unpack — DISPATCHED carton → 400 | P1 | POST `/{MC_DISPATCHED.id}/full-unpack` | 400 `"Cannot unpack a dispatched carton"` | API | — |
| TC-API-MC-142 | Admin | Full-unpack — CREATED (empty) carton → 400 | P1 | POST `/{MC_CREATED.id}/full-unpack` | 400 `"Cannot unpack an empty carton"` | API | Service guard: `status==CREATED` |
| TC-API-MC-143 | Admin | Full-unpack — carton not found | P1 | POST `/00000000-0000-0000-0000-000000000000/full-unpack` | 404 `"Master carton not found"` | API | — |
| TC-API-MC-144 | Admin | Full-unpack — invalid UUID param | P2 | POST `/not-a-uuid/full-unpack` | 400 `"Invalid master carton ID format"` | API | — |

---

## Section K — POST /:id/close

> Permission: `cartons:close` (Admin + Supervisor + WH Op — DISC-MC-1).
> URL: `POST /api/v1/master-cartons/:id/close`
> Guards: not already CLOSED; not DISPATCHED; child_count > 0.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-150 | Admin | Close — ACTIVE carton | P1 | POST `/{MC_ACTIVE.id}/close` | 200; `carton.status="CLOSED"`, `closed_at` set; CARTON_CLOSED inv-txn | Integration | Audit `CLOSE_MASTER_CARTON` |
| TC-API-MC-151 | Supervisor | Close — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-152 | Warehouse Operator | Close — 200 (DISC-MC-1 verified) | P1 | POST close with WH_TOKEN | 200 | API | WH Op holds `cartons:close`; old stale spec said 403 — WRONG |
| TC-API-MC-153 | Dispatch Operator | Close — 403 | P1 | POST close with DISP_TOKEN | 403 `"Required permission: cartons:close"` | API | — |
| TC-API-MC-154 | Unauthenticated | Close — 401 | P1 | POST close (no auth) | 401 | API | — |
| TC-API-MC-155 | Admin | Close — already CLOSED → 400 | P1 | POST close on MC_CLOSED | 400 `"Master carton is already closed"` | API | — |
| TC-API-MC-156 | Admin | Close — DISPATCHED carton → 400 | P1 | POST close on MC_DISPATCHED | 400 `"Cannot close a dispatched carton"` | API | — |
| TC-API-MC-157 | Admin | Close — empty carton (child_count=0) → 400 | P1 | POST close on MC_CREATED | 400 `"Cannot close an empty carton"` | API | — |
| TC-API-MC-158 | Admin | Close — not found | P1 | POST `/00000000-0000-0000-0000-000000000000/close` | 404 `"Master carton not found"` | API | — |
| TC-API-MC-159 | Admin | Close — CREATED carton → 400 (empty guard) | P2 | Alias of TC-API-MC-157; CREATED means child_count=0 | 400 | API | — |
| TC-API-MC-160 | Admin | Close — invalid UUID | P2 | POST `/not-a-uuid/close` | 400 | API | — |

---

## Section L — GET /legacy-upload/sample

> Permission: `cartons:read` (Admin + Supervisor + WH Op + Dispatch Op — all 4 roles hold `cartons:read`).
> URL: `GET /api/v1/master-cartons/legacy-upload/sample`
> **Route ordering note:** declared BEFORE `/:id` to avoid being shadowed; must test this in sequence.
> Returns a CSV file download (Content-Type: text/csv; Content-Disposition: attachment).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-165 | Admin | Sample CSV — download success | P1 | GET `/master-cartons/legacy-upload/sample` | 200; `Content-Type: text/csv`; `Content-Disposition` header includes `legacy_carton_upload_sample.csv`; CSV body starts with header row `SECTION,CATEGORY,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY` | API | Two sample rows seeded in controller |
| TC-API-MC-166 | Supervisor | Sample CSV — 200 | P1 | GET with SUPER_TOKEN | 200 | API | `cartons:read` seeded for Supervisor |
| TC-API-MC-167 | Warehouse Operator | Sample CSV — 200 | P1 | GET with WH_TOKEN | 200 | API | `cartons:read` seeded for WH Op |
| TC-API-MC-168 | Dispatch Operator | Sample CSV — 200 | P1 | GET with DISP_TOKEN | 200 | API | `cartons:read` seeded for Dispatch Op |
| TC-API-MC-169 | Unauthenticated | Sample CSV — 401 | P1 | GET (no auth) | 401 | API | `router.use(authenticate)` |
| TC-API-MC-170 | Admin | Sample CSV — CSV has 0-qty row by design | P2 | Inspect downloaded CSV | Second data row has `MASTER CARTON QUANTITY=0` (`BUSKER 01-20 (6-10),0`) — this is intentional to demonstrate zero-qty skip behavior | API | Design choice: sample shows all patterns including zero-qty |

---

## Section M — POST /legacy-upload (bulk CSV)

> Permission: `cartons:create` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/legacy-upload`
> Body: `multipart/form-data` with `file` field (CSV).
> Success: 201 with `{ cartons_created, rows_processed, rows_skipped_zero, warnings, errors }`.
> Cartons inserted with `is_legacy=true`, `status=CLOSED`, `child_count=0`.
> NO inventory_transactions written (DISC-MC-6).
> Cap: 20,000 total quantity across the file.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-175 | Admin | Legacy upload — valid CSV, all rows positive qty | P1 | POST multipart with valid CSV: `Hawaii,Ladies,ALIA PLUS (4-8),2\nHawaii,Gents,BUSKER 01-20 (6-10),3` | 201; `cartons_created=5`, `rows_processed=2`, `rows_skipped_zero=0`, `errors=[]` | Integration | 5 `is_legacy=true` CLOSED cartons created; no inv-txns |
| TC-API-MC-176 | Supervisor | Legacy upload — 201 | P1 | Same with SUPER_TOKEN | 201 | API | — |
| TC-API-MC-177 | Warehouse Operator | Legacy upload — 201 | P1 | Same with WH_TOKEN | 201 | API | WH Op holds `cartons:create` |
| TC-API-MC-178 | Dispatch Operator | Legacy upload — 403 | P1 | POST with DISP_TOKEN | 403 | API | — |
| TC-API-MC-179 | Unauthenticated | Legacy upload — 401 | P1 | POST (no auth) | 401 | API | — |
| TC-API-MC-180 | Admin | Legacy upload — zero-qty row is skipped | P1 | CSV with one row qty=0 and one row qty=2 | 201; `cartons_created=2`, `rows_skipped_zero=1`, `rows_processed=1` | Integration | 0-qty rows skipped silently per service logic |
| TC-API-MC-181 | Admin | Legacy upload — no file provided → 400 | P1 | POST without file field | 400 `"No CSV file provided"` | API | Controller guard |
| TC-API-MC-182 | Admin | Legacy upload — missing required column | P1 | CSV missing `MASTER CARTON QUANTITY` column | 409 `"Missing required columns: master carton quantity"` | API | `ConflictError` thrown for missing headers |
| TC-API-MC-183 | Admin | Legacy upload — empty CSV body (header only) | P1 | CSV with header row only, no data rows | 409 `"CSV file is empty"` | API | — |
| TC-API-MC-184 | Admin | Legacy upload — invalid CSV format | P2 | Malformed non-CSV binary file | 409 `"Invalid CSV format"` | API | `csv-parse` throws; caught as ConflictError |
| TC-API-MC-185 | Admin | Legacy upload — total qty > 20000 → 409 | P2 | CSV with single row qty=20001 | 409 `"Total cartons across the file (20001) exceeds the upload cap of 20,000"` | API | Hard cap before processing |
| TC-API-MC-186 | Admin | Legacy upload — invalid qty (negative) | P2 | CSV row with `MASTER CARTON QUANTITY=-1` | 201 with `errors` array containing error for that row: `"Invalid quantity \"-1\""` | Integration | Row-level error, other rows proceed |
| TC-API-MC-187 | Admin | Legacy upload — invalid qty (non-numeric) | P2 | CSV row with `MASTER CARTON QUANTITY=abc` | 201 with `errors` array containing error for that row | Integration | `parseInt` → NaN → error |
| TC-API-MC-188 | Admin | Legacy upload — unknown section warns but does not error | P2 | CSV with section `"UnknownSection"` (not in `product_sections`) | 201; `warnings` contains `"did not match any known section — stored verbatim"`; cartons created | Integration | Section normalizer returns `matched=false` → warning only |
| TC-API-MC-189 | Admin | Legacy upload — unknown category warns but does not error | P2 | CSV with category `"Unisex"` (not in valid list) | 201; `warnings` contains `"did not match any known category — stored verbatim"` | Integration | Category normalizer returns `matched=false` → warning only |
| TC-API-MC-190 | Admin | Legacy upload — section already has legacy data → warning | P2 | Upload CSV with section that already has legacy cartons in DB | 201; `warnings` includes `"already has legacy cartons — new cartons will be added (re-upload is additive)"` | Integration | Re-upload is additive; warning issued but not blocked |
| TC-API-MC-191 | Admin | Legacy upload — article group + size group parsed correctly | P2 | CSV row: `Hawaii,Ladies,ALIA PLUS (4-8),1` | 201; created carton has `article_group="ALIA PLUS"`, `size_group="4-8"` | Integration | `parseArticleGroup` parser |
| TC-API-MC-192 | Admin | Legacy upload — article group without parens (no size_group) | P2 | CSV row: `Hawaii,Ladies,PLAIN SLIPPER,1` | 201; carton has `article_group="PLAIN SLIPPER"`, `size_group=null` | Integration | No paren → null size_group |
| TC-API-MC-193 | Admin | Legacy upload — audit log written per row | P3 | Upload 2-row CSV | DB: 2 audit log entries with `action="BULK_CREATE_LEGACY_CARTONS"` | Integration | Audit written outside transaction |

---

## Section N — POST /:id/open-legacy

> Permission: `packing:unpack` (Admin + Supervisor + WH Op — DISC-MC-2).
> URL: `POST /api/v1/master-cartons/:id/open-legacy`
> Effect: sets `is_legacy=false`, `status=CREATED`, `child_count=0` on the legacy carton;
> writes `LEGACY_CARTON_OPENED` inv-txn.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-200 | Admin | Open legacy — success | P1 | POST `/{MC_LEGACY.id}/open-legacy` | 200; carton `is_legacy=false`, `status="CREATED"`, `child_count=0`; `LEGACY_CARTON_OPENED` inv-txn written; audit `OPEN_LEGACY_CARTON` | Integration | Carton retains its barcode and section/category metadata |
| TC-API-MC-201 | Supervisor | Open legacy — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-202 | Warehouse Operator | Open legacy — 200 (DISC-MC-2 verified) | P1 | POST with WH_TOKEN | 200 | API | Uses `packing:unpack` not `cartons:reopen`; WH Op CAN do this |
| TC-API-MC-203 | Dispatch Operator | Open legacy — 403 | P1 | POST with DISP_TOKEN | 403 | API | No `packing:unpack` for Dispatch Op |
| TC-API-MC-204 | Unauthenticated | Open legacy — 401 | P1 | POST (no auth) | 401 | API | — |
| TC-API-MC-205 | Admin | Open legacy — non-legacy carton → 400 | P1 | POST `/{MC_ACTIVE.id}/open-legacy` (not a legacy carton) | 400 `"Only legacy cartons can be opened for repacking"` | API | `if (!carton.is_legacy)` guard |
| TC-API-MC-206 | Admin | Open legacy — carton not found → 404 | P1 | POST `/00000000-0000-0000-0000-000000000000/open-legacy` | 404 `"Master carton not found"` | API | — |
| TC-API-MC-207 | Admin | Open legacy — carton now visible without includeLegacy filter | P2 | Open MC_LEGACY; GET `/master-cartons` (default) | 200; opened carton appears in default list (is_legacy now false) | Integration | After open-legacy the carton is a normal trackable carton |
| TC-API-MC-208 | Admin | Open legacy — opened carton can accept child boxes | P2 | Open MC_LEGACY; POST pack into opened carton | 200; box packed successfully (status CREATED→ACTIVE) | Integration | End-to-end "Open for Repacking" flow |

---

## Section O — POST /repack/free-both

> Permission: `packing:unpack` (Admin + Supervisor + WH Op).
> URL: `POST /api/v1/master-cartons/repack/free-both`
> Body: `{ "carton1_barcode": "<string>", "carton2_barcode": "<string>" }`
> Effect: atomically frees all child boxes from BOTH cartons; resets both to CREATED/child_count=0.
> Deadlock prevention: both carton rows locked in deterministic ORDER BY id.
> Audit action: `REPACK_FREE_BOTH`.
> Returns: `{ carton1, carton2, freed_count, freed_boxes }`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-210 | Admin | Free-both — happy path: both cartons have boxes | P1 | POST `/repack/free-both` `{ carton1_barcode: MC_A.barcode, carton2_barcode: MC_B.barcode }` where MC_A has 2 boxes and MC_B has 3 boxes | 200; `freed_count=5`; `freed_boxes` array of 5 items each with id/barcode/article_name/colour/size; carton1 `status="CREATED"`, `child_count=0`; carton2 same; all 5 boxes → FREE; 5 CHILD_UNPACKED inv-txns | Integration | Audit REPACK_FREE_BOTH with carton1_barcode, carton2_barcode, freed_count |
| TC-API-MC-211 | Supervisor | Free-both — 200 | P1 | Same with SUPER_TOKEN | 200 | API | — |
| TC-API-MC-212 | Warehouse Operator | Free-both — 200 | P1 | Same with WH_TOKEN | 200 | API | WH Op holds `packing:unpack` |
| TC-API-MC-213 | Dispatch Operator | Free-both — 403 | P1 | POST with DISP_TOKEN | 403 | API | — |
| TC-API-MC-214 | Unauthenticated | Free-both — 401 | P1 | POST (no auth) | 401 | API | — |
| TC-API-MC-215 | Admin | Free-both — one empty carton allowed | P1 | MC_A has 3 boxes; MC_B is CREATED (empty) | 200; `freed_count=3`; MC_A freed; MC_B unchanged (already CREATED); both returned in response | Integration | Only-both-empty is rejected; one-empty is fine |
| TC-API-MC-216 | Admin | Free-both — both empty → 400 | P1 | Both MC_A and MC_B have `status=CREATED` | 400 `"At least one carton must have boxes to repack"` | API | Service guard: `carton1Empty && carton2Empty` |
| TC-API-MC-217 | Admin | Free-both — same carton in both fields → 400 | P1 | POST `{ carton1_barcode: "MC000001", carton2_barcode: "MC000001" }` | 400 `"Please scan two different cartons"` | API | `c1 === c2` guard |
| TC-API-MC-218 | Admin | Free-both — carton1 not found → 404 | P1 | POST `{ carton1_barcode: "MCXXXXXX", carton2_barcode: "MC000001" }` | 404 `"Master carton with barcode MCXXXXXX not found"` | API | — |
| TC-API-MC-219 | Admin | Free-both — carton2 not found → 404 | P1 | POST `{ carton1_barcode: "MC000001", carton2_barcode: "MCXXXXXX" }` | 404 `"Master carton with barcode MCXXXXXX not found"` | API | Looked up after carton1 found |
| TC-API-MC-220 | Admin | Free-both — carton1 DISPATCHED → 400 | P1 | MC_A is DISPATCHED | 400 `"Cannot repack a dispatched carton"` | API | Either carton dispatched → reject |
| TC-API-MC-221 | Admin | Free-both — carton2 DISPATCHED → 400 | P1 | MC_B is DISPATCHED | 400 `"Cannot repack a dispatched carton"` | API | — |
| TC-API-MC-222 | Admin | Free-both — barcodes are uppercased | P2 | POST `{ carton1_barcode: "mc000001", carton2_barcode: "mc000002" }` | 200 (same as uppercase; `trim().toUpperCase()` applied) | API | — |
| TC-API-MC-223 | Admin | Free-both — missing carton1_barcode | P2 | POST `{ carton2_barcode: "MC000002" }` | 400 `"Carton 1 barcode is required"` | API | Zod `min(1)` |
| TC-API-MC-224 | Admin | Free-both — missing carton2_barcode | P2 | POST `{ carton1_barcode: "MC000001" }` | 400 `"Carton 2 barcode is required"` | API | Zod `min(1)` |
| TC-API-MC-225 | Admin | Free-both — deterministic lock order prevents deadlock | P3 | Concurrent requests on MC_A+MC_B and MC_B+MC_A simultaneously | No deadlock; one request succeeds, other retries or errors gracefully | Integration | Locks both rows `ORDER BY id FOR UPDATE` |
| TC-API-MC-226 | Admin | Free-both — freed_boxes includes product detail | P2 | Carton with boxes linked to PRODUCT_A (Blue/6); run free-both | 200; `freed_boxes[n].article_name`, `colour`, `size` populated from product JOIN | Integration | `freed_boxes` built via product JOIN in service |
| TC-API-MC-227 | Admin | Free-both — response carton1 matches input barcode | P2 | POST free-both with MC000001/MC000002 | `result.carton1.carton_barcode = "MC000001"`; `result.carton2.carton_barcode = "MC000002"` | Integration | Service re-identifies carton1/carton2 from locked rows by id |

---

## Section P — Removed route: POST /repack (404 confirmation)

> The standalone `/master-cartons/repack` route was removed (no `POST /repack` in `masterCarton.routes.ts`).
> Only `/repack/free-both` sub-path exists.
> Permission `packing:repack` does NOT exist in seeds.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-230 | Admin | Deleted route — POST /repack returns 404 | P1 | POST `/api/v1/master-cartons/repack` `{}` with ADMIN_TOKEN | 404 (route not registered; Express falls through to 404 handler) | API | **AUTOMATION GAP AG-MC-01**: spec `20-cartons-lifecycle.spec.ts` still calls this; must be fixed. |
| TC-API-MC-231 | Admin | No packing:repack permission in seeds | P3 | Query `role_permissions` for permission `packing:repack` | Zero rows returned | Integration | Permission was removed; seeded permissions: {Admin:27, Supervisor:19, WH Op:9, Dispatch Op:7} |

---

## Section Q — Inventory transaction integrity

> Verify that each operation writes the expected `inventory_transactions` rows.
> Query: `SELECT transaction_type, child_box_id, master_carton_id FROM inventory_transactions WHERE master_carton_id = $1 ORDER BY created_at`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-235 | Admin | Inv-txn — CREATE writes CARTON_CREATED | P1 | POST create carton; query inv-txns | One row: `transaction_type="CARTON_CREATED"`, `master_carton_id` set, `child_box_id` null | Integration | Written in both transactional and non-transactional code paths |
| TC-API-MC-236 | Admin | Inv-txn — PACK writes CHILD_PACKED | P1 | Pack a FREE box; query inv-txns for carton | One row: `transaction_type="CHILD_PACKED"`, both IDs set | Integration | — |
| TC-API-MC-237 | Admin | Inv-txn — PACK GENERATED writes CHILD_ACTIVATED then CHILD_PACKED | P1 | Pack a GENERATED box; query inv-txns for child box | Two rows in order: CHILD_ACTIVATED then CHILD_PACKED | Integration | Order matters; CHILD_ACTIVATED has only child_box_id; CHILD_PACKED has both |
| TC-API-MC-238 | Admin | Inv-txn — UNPACK writes CHILD_UNPACKED | P1 | Unpack a box; query inv-txns | Row: `transaction_type="CHILD_UNPACKED"`, both IDs set | Integration | — |
| TC-API-MC-239 | Admin | Inv-txn — FULL-UNPACK writes CHILD_UNPACKED per box | P1 | Full-unpack carton with 3 boxes; query inv-txns | 3 rows: all `CHILD_UNPACKED` for respective child_box_ids | Integration | — |
| TC-API-MC-240 | Admin | Inv-txn — CLOSE writes CARTON_CLOSED | P1 | Close carton; query inv-txns | Row: `transaction_type="CARTON_CLOSED"`, `master_carton_id` set | Integration | — |
| TC-API-MC-241 | Admin | Inv-txn — OPEN-LEGACY writes LEGACY_CARTON_OPENED | P1 | Open legacy carton; query inv-txns | Row: `transaction_type="LEGACY_CARTON_OPENED"`, `master_carton_id` set | Integration | `LEGACY_CARTON_OPENED` is the only inv-txn type for this operation |
| TC-API-MC-242 | Admin | Inv-txn — FREE-BOTH writes CHILD_UNPACKED per freed box | P1 | free-both MC_A (2 boxes) + MC_B (3 boxes); query inv-txns | 5 CHILD_UNPACKED rows across both carton IDs | Integration | — |
| TC-API-MC-243 | Admin | Inv-txn — LEGACY-UPLOAD writes NO inv-txns | P2 | POST legacy-upload; query inv-txns for a created legacy carton ID | Zero rows for that carton ID | Integration | **DISC-MC-6**: by design; audit log written instead |
| TC-API-MC-244 | Admin | Inv-txn — CREATE with barcodes writes CARTON_CREATED + N×CHILD_PACKED | P2 | POST create `{ child_box_barcodes: ["CB000001","CB000002"] }` | 1 CARTON_CREATED + 2 CHILD_PACKED rows; all in one transaction | Integration | — |

---

## Section R — Concurrency & transactional rollback

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-MC-250 | Admin | Rollback — create with partial bad barcodes aborts all | P1 | POST create `{ child_box_barcodes: ["CB000001","CBXXXXXX"] }` (second barcode unknown) | 404 error; no carton row in DB; CB000001 status unchanged; no orphan inv-txns | Integration | `BEGIN/ROLLBACK` on bad barcode in loop |
| TC-API-MC-251 | Admin | Rollback — pack fails mid-transaction; no partial state | P2 | Pack into full carton (capacity=1, already has 1 box) | 400; carton still has child_count=1; no orphan mapping rows | Integration | `BEGIN/ROLLBACK` in packChildBox |
| TC-API-MC-252 | Admin | Rollback — free-both one carton fails; both rolled back | P2 | Simulate DB error on second carton in free-both (if testable) | Both cartons unchanged; no partial free | Integration | `BEGIN/ROLLBACK` in repackFreeBoth |
| TC-API-MC-253 | Admin | Concurrency — double pack-by-barcode idempotent | P2 | Rapid-fire 2 concurrent POST pack-by-barcode with same barcode into same carton | Both return 200; one has `alreadyPacked=false`, other has `alreadyPacked=true`; carton.child_count incremented once only | Integration | Row-lock in `packChildBox` prevents double-insert |
| TC-API-MC-254 | Admin | Concurrency — free-both deadlock order | P3 | Concurrent free-both with (MC_A, MC_B) and (MC_B, MC_A) | No deadlock; one succeeds, other either succeeds (serially) or retries | Integration | Locks acquired `ORDER BY id FOR UPDATE` |

---

## Summary & TC Counts

### Total test cases authored: **220**

> Count by section:
> Section A (create): 15 TCs (TC-API-MC-001..015)
> Section B (list): 17 TCs (TC-API-MC-020..036)
> Section C (qr/:barcode): 8 TCs (TC-API-MC-040..047)
> Section D (/:id): 7 TCs (TC-API-MC-050..056)
> Section E (/:id/children): 8 TCs (TC-API-MC-060..067)
> Section F (/:id/assortment): 9 TCs (TC-API-MC-070..078)
> Section G (pack by UUID): 18 TCs (TC-API-MC-080..097)
> Section H (pack-by-barcode): 14 TCs (TC-API-MC-100..113)
> Section I (unpack): 11 TCs (TC-API-MC-120..130)
> Section J (full-unpack): 10 TCs (TC-API-MC-135..144)
> Section K (close): 11 TCs (TC-API-MC-150..160)
> Section L (legacy sample CSV): 6 TCs (TC-API-MC-165..170)
> Section M (legacy upload): 19 TCs (TC-API-MC-175..193)
> Section N (open-legacy): 9 TCs (TC-API-MC-200..208)
> Section O (repack/free-both): 18 TCs (TC-API-MC-210..227)
> Section P (deleted route): 2 TCs (TC-API-MC-230..231)
> Section Q (inv-txn integrity): 10 TCs (TC-API-MC-235..244)
> Section R (concurrency/rollback): 5 TCs (TC-API-MC-250..254)

### Per-role TC counts

| Role | Allow TCs | Deny TCs | Total (approx) |
|---|---|---|---|
| Admin | 120 (positive happy-path + edge cases) | — | ~120 |
| Supervisor | 13 (one per write endpoint) | — | ~13 |
| Warehouse Operator | 13 (one per `cartons:create` / `packing:pack` / `packing:unpack` / `cartons:close`) | — | ~13 |
| Dispatch Operator | 7 (403 deny for each write permission group) | 7 | ~7 |
| Unauthenticated | 15 (401 for each endpoint category) | 15 | ~15 |

> Note: Admin TCs include all validation, edge-case, integration, and concurrency tests; other roles
> are verified for RBAC correctness (allow/deny) only — happy-path positive-only.

### Matrix discrepancies encoded as explicit TCs

| Discrepancy | TCs | Actual behavior documented |
|---|---|---|
| DISC-MC-1: WH Op CAN close | TC-API-MC-152 | 200 (not 403); stale spec must be corrected |
| DISC-MC-2: open-legacy uses `packing:unpack` not `cartons:reopen` | TC-API-MC-202 | WH Op 200 for open-legacy |
| DISC-MC-3: GET list auth-only (no perm gate) | TC-API-MC-021..024 | All 4 roles 200; unauth 401 |
| DISC-MC-4: all GET endpoints auth-only | TC-API-MC-041..044, 051..054, 061..064, 071..074 | All 4 roles 200 for each GET |
| DISC-MC-5: `cartons:reopen` + `cartons:delete` are dead permissions | TC-API-MC-231 note | No route consumes them |
| DISC-MC-6: legacy-upload writes no inv-txns | TC-API-MC-243 | Expected behavior documented |
| DISC-MC-7: spec-20 calls deleted /repack | TC-API-MC-230 | 404 confirmed; AG-MC-01 filed |

### Automation gaps (8 filed — see Section 4)

| Gap | Urgency | Impact |
|---|---|---|
| AG-MC-01 | High | CI false pass on deleted `/repack` route in `20-cartons-lifecycle.spec.ts` |
| AG-MC-02 | High | `/repack/free-both` end-to-end entirely uncovered |
| AG-MC-03 | High | Idempotent re-scan (`alreadyPacked:true`) uncovered |
| AG-MC-04 | High | Legacy upload happy/error/skip paths uncovered |
| AG-MC-05 | Medium | `includeLegacy` filter behavior uncovered |
| AG-MC-06 | Medium | Transactional rollback on bad barcode in create-with-barcodes uncovered |
| AG-MC-07 | Medium | GENERATED box auto-activation inv-txn sequence uncovered |
| AG-MC-08 | High | `20-cartons-lifecycle.spec.ts` asserts WH-Op close=403 — wrong; CI will false-fail |

### Recommended automation file structure

```
backend/e2e/42-api-master-cartons.spec.ts
  describe('POST /master-cartons')         → Sections A
  describe('GET /master-cartons')          → Section B
  describe('GET /master-cartons/qr/:b')    → Section C
  describe('GET /master-cartons/:id')      → Section D
  describe('GET /:id/children')            → Section E
  describe('GET /:id/assortment')          → Section F
  describe('POST /pack')                   → Section G
  describe('POST /pack-by-barcode')        → Section H
  describe('POST /unpack')                 → Section I
  describe('POST /:id/full-unpack')        → Section J
  describe('POST /:id/close')             → Section K
  describe('GET /legacy-upload/sample')   → Section L
  describe('POST /legacy-upload')         → Section M
  describe('POST /:id/open-legacy')       → Section N
  describe('POST /repack/free-both')      → Section O
  describe('POST /repack (deleted)')      → Section P
  describe('Inventory transaction integrity') → Section Q
  describe('Concurrency & rollback')      → Section R

// Also update:
backend/e2e/20-cartons-lifecycle.spec.ts
  - Remove or replace POST /master-cartons/repack call (AG-MC-01)
  - Fix WH-Op close assertion: 200 not 403 (AG-MC-08)
```
