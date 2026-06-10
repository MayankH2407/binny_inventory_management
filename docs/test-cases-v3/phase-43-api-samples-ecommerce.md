# Phase 43 — API: Samples & E-commerce

**Suite:** Binny Inventory Management System — Test Cases v3
**Track:** B (Backend API contract tests)
**Authored:** 2026-06-09 (Track B)
**Module codes:** `TC-API-SMP-NNN` (samples), `TC-API-EC-NNN` (e-commerce)
**Type:** API / Integration (Playwright `request` context or jest/supertest)
**Dependencies:** Phase 40 (auth tokens), Phase 42 (master cartons — needed for scan-carton); FREE/GENERATED child boxes + CLOSED/ACTIVE master carton must exist in seed.
**Relevant source files (ground truth):**
- `backend/src/routes/sample.routes.ts` — all `/samples/*` routes; authenticate + authorizePermission gates
- `backend/src/routes/ecommerce.routes.ts` — all `/ecommerce/*` routes; authenticate + authorizePermission gates
- `backend/src/controllers/sample.controller.ts` / `ecommerce.controller.ts`
- `backend/src/services/sample.service.ts` — foot-split helpers, assertFootAvailable, last-foot-not-dispatched logic (in `dispatch.service.ts _dispatchSample`)
- `backend/src/services/ecommerce.service.ts` — scanCartonToEcommerce, getEcommerceStockSummary
- `backend/src/services/dispatch.service.ts` — `_dispatchSample` last-foot check
- `backend/src/models/schemas/sample.schema.ts` / `ecommerce.schema.ts`
- `backend/migrations/20260605100001_add-foot-to-sample-box-mapping.js`
- `backend/migrations/20260609120001_sample-box-mapping-per-foot.js` — partial unique index `(child_box_id, foot) WHERE is_active`
- `backend/seeds/001_roles.ts` — no `samples:*` or `ecommerce:*` for Supervisor/WH/Dispatch

---

## Known Discrepancies (encode as explicit TCs — do NOT fix here)

| # | Discrepancy | Encoded in |
|---|---|---|
| D1 | **GET endpoints for `/samples/*` and `/ecommerce/*` have no `authorizePermission` guard** — only `authenticate`. All four authenticated roles receive **200** on list / detail / qr / children / assortment / stock-summary even though the UI hides these pages from non-Admin. | Sections 8, 17 |
| D2 | **`create-with-boxes` path skips `ECOMMERCE_CREATED` inventory transaction** — when `child_box_barcodes` is non-empty, the service exits on the transaction-per-box path and never inserts an `ECOMMERCE_CREATED` row. The empty-create path does insert it. Asymmetric vs `createSample` which always writes `SAMPLE_CREATED`. | Section 18 |
| D3 | **Box-level count semantics (client-approved simplification):** a box with only one foot in a sample counts as **1 SAMPLE box** in `child_count`. A one-foot-sampled box is never double-counted. | Sections 3, 5 |
| D4 | **Last-foot dispatch keeps box SAMPLE if other foot still lives in a non-dispatched sample.** The box flips to DISPATCHED only when its last active foot leaves. | Section 7 |
| D5 | **CLOSED master carton IS scannable into ecommerce** — only DISPATCHED is blocked. | Section 14 |

---

## Table of Contents

1. [Shared Test Data Assumptions](#1-shared-test-data-assumptions)
2. [Section 1 — POST /samples (create)](#section-1--post-samples-create)
3. [Section 2 — GET /samples (list)](#section-2--get-samples-list)
4. [Section 3 — GET /samples/:id (detail)](#section-3--get-samplesid-detail)
5. [Section 4 — GET /samples/qr/:barcode](#section-4--get-samplesqrbarcode)
6. [Section 5 — GET /samples/:id/children](#section-5--get-samplesidchildren)
7. [Section 6 — GET /samples/:id/assortment](#section-6--get-samplesidassortment)
8. [Section 7 — POST /samples/add-box (foot field)](#section-7--post-samplesadd-box)
9. [Section 8 — POST /samples/remove-box (conditional-free)](#section-8--post-samplesremove-box)
10. [Section 9 — POST /samples/:id/full-unpack (conditional-free)](#section-9--post-samplesidfull-unpack)
11. [Section 10 — POST /samples/:id/close](#section-10--post-samplesidclose)
12. [Section 11 — FOOT-SPLIT (deep coverage)](#section-11--foot-split-deep-coverage)
13. [Section 12 — Last-foot dispatch integration](#section-12--last-foot-dispatch-integration)
14. [Section 13 — Samples RBAC (GET auth-only discrepancy + write Admin-only)](#section-13--samples-rbac)
15. [Section 14 — POST /ecommerce (create)](#section-14--post-ecommerce-create)
16. [Section 15 — GET /ecommerce (list)](#section-15--get-ecommerce-list)
17. [Section 16 — GET /ecommerce/stock-summary](#section-16--get-ecommercestock-summary)
18. [Section 17 — GET /ecommerce/:id, /qr/:barcode, /:id/children, /:id/assortment](#section-17--get-ecommerce-detail-endpoints)
19. [Section 18 — POST /ecommerce/add-box](#section-18--post-ecommerceadd-box)
20. [Section 19 — POST /ecommerce/scan-carton (atomic carton→ecommerce)](#section-19--post-ecommercescan-carton)
21. [Section 20 — POST /ecommerce/remove-box](#section-20--post-ecommerceremove-box)
22. [Section 21 — POST /ecommerce/:id/full-unpack](#section-21--post-ecommerceidfull-unpack)
23. [Section 22 — POST /ecommerce/:id/close](#section-22--post-ecommerceidclose)
24. [Section 23 — Ecommerce RBAC (GET auth-only discrepancy + write Admin-only)](#section-23--ecommerce-rbac)
25. [Section 24 — Transaction log correctness (both modules)](#section-24--transaction-log-correctness)

---

## 1. Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `ADMIN_TOKEN` | Bearer token for `admin@binny.com` (Admin role — super-admin bypass) |
| `SUP_TOKEN` | Bearer token for `supervisor@binny.com` (Supervisor — no `samples:*`/`ecommerce:*`) |
| `WH_TOKEN` | Bearer token for `warehouse@binny.com` (Warehouse Operator) |
| `DP_TOKEN` | Bearer token for `dispatch@binny.com` (Dispatch Operator) |
| `CB_FREE_1` / `CB_FREE_2` / `CB_FREE_3` | FREE child boxes (UUIDs, barcodes `CB_F001`…`CB_F003`) |
| `CB_GEN_1` | GENERATED child box (barcode `CB_G001`) |
| `CB_PACKED_1` | PACKED child box (inside a master carton) |
| `CB_EC_1` | Child box with status ECOMMERCE |
| `CB_DISP_1` | Child box with status DISPATCHED |
| `CB_SPLIT_L` | Box whose LEFT foot is already in an active sample; RIGHT foot free |
| `CB_SPLIT_PAIR` | Box already mapped as PAIR in an active sample |
| `SR_ACTIVE` | ACTIVE sample record (`child_count ≥ 2`) |
| `SR_CREATED` | CREATED (empty) sample record |
| `SR_CLOSED` | CLOSED sample record |
| `SR_DISPATCHED` | DISPATCHED sample record |
| `SR_LEFT_LIVE` | ACTIVE sample holding `CB_SPLIT_L` LEFT foot |
| `ER_ACTIVE` | ACTIVE ecommerce record (`child_count ≥ 2`) |
| `ER_CREATED` | CREATED (empty) ecommerce record |
| `ER_CLOSED` | CLOSED ecommerce record |
| `ER_DISPATCHED` | DISPATCHED ecommerce record |
| `MC_ACTIVE` | ACTIVE master carton with ≥ 2 packed child boxes |
| `MC_CLOSED` | CLOSED master carton with ≥ 1 packed child box |
| `MC_DISPATCHED` | DISPATCHED master carton |
| `MC_EMPTY` | ACTIVE master carton with `child_count = 0` (all removed) |
| `CUST_UUID` | Existing customer UUID |
| API base | `http://localhost:5000/api/v1` |
| SR barcode prefix | `SR######` (short barcode) |
| EC barcode prefix | `EC######` (short barcode) |

---

## Section 1 — POST /samples (create)

**Route:** `POST /api/v1/samples` — `authorizePermission('samples:create')` → Admin only by default.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-001 | Admin | Create sample — empty (no boxes) | P0 | 1. `POST /api/v1/samples` with `Authorization: Bearer ADMIN_TOKEN`, body: `{"name":"Empty Sample"}`. | HTTP 201. Body contains `id` (UUID), `sample_barcode` matching `SR[A-Z0-9]{6}`, `name:"Empty Sample"`, `status:"CREATED"`, `child_count:0`, `customer_id:null`, `recipient_name:null`. DB: row in `sample_records`. `inventory_transactions` has one `SAMPLE_CREATED` row with `metadata.sample_record_id = id`. | Integration | No-barcode path in service — simpler INSERT, still emits SAMPLE_CREATED. |
| TC-API-SMP-002 | Admin | Create sample — with `child_box_barcodes` array | P0 | 1. `POST /api/v1/samples`, body: `{"name":"Dispatch Sample","child_box_barcodes":["CB_F001","CB_F002"]}`. | HTTP 201. `status:"ACTIVE"`, `child_count:2`. DB: 2 active rows in `sample_box_mapping` both with `foot:"PAIR"`. Both child boxes have `status:"SAMPLE"`. `SAMPLE_CREATED` + 2×`CHILD_SAMPLED` in `inventory_transactions`. | Integration | With-boxes path; all barcodes uppercased by Zod transform. |
| TC-API-SMP-003 | Admin | Create sample — GENERATED box auto-activates | P0 | 1. `POST /api/v1/samples`, body: `{"name":"Gen Box Sample","child_box_barcodes":["CB_G001"]}`. | HTTP 201. `child_count:1`. `CB_G001` child box status = `"FREE"` then immediately `"SAMPLE"` (single transaction write — but `CHILD_ACTIVATED` is also written). DB: `inventory_transactions` has `CHILD_ACTIVATED` + `CHILD_SAMPLED` rows for that box. | Integration | assertFootAvailable is called on GENERATED box — passes; auto-activate branch runs. |
| TC-API-SMP-004 | Admin | Create sample — with all optional fields | P1 | 1. `POST /api/v1/samples` body: `{"name":"Full Fields","customer_id":"<CUST_UUID>","recipient_name":"Anil Kumar","purpose":"Trade Fair","sample_date":"2026-06-10","notes":"Handle carefully"}`. | HTTP 201. Response fields match input. `customer_id` matches `CUST_UUID`. | API | |
| TC-API-SMP-005 | Admin | Create sample — `box_feet` map assigns foot per barcode | P0 | 1. `POST /api/v1/samples` body: `{"name":"Foot Map Sample","child_box_barcodes":["CB_F001","CB_F002"],"box_feet":{"CB_F001":"LEFT","CB_F002":"RIGHT"}}`. | HTTP 201. `child_count:2`. In `sample_box_mapping`: CB_F001 row has `foot:"LEFT"`, CB_F002 row has `foot:"RIGHT"`. Both boxes `status:"SAMPLE"`. | Integration | `footMap` is keyed by uppercased barcode; `box_feet` entries case-normalised. |
| TC-API-SMP-006 | Admin | Create sample — `box_feet` missing entry defaults to PAIR | P1 | 1. `POST /api/v1/samples` body: `{"name":"Mixed Feet","child_box_barcodes":["CB_F001","CB_F002"],"box_feet":{"CB_F001":"LEFT"}}`. | HTTP 201. CB_F001 mapping `foot:"LEFT"`, CB_F002 mapping `foot:"PAIR"`. | Integration | Missing key → `footMap[bc] ?? 'PAIR'` in service. |
| TC-API-SMP-007 | Admin | Create sample — unknown barcode returns 404 | P0 | 1. `POST /api/v1/samples` body: `{"name":"Bad Bar","child_box_barcodes":["XXXXXX"]}`. | HTTP 404. Error message references barcode `XXXXXX`. No sample record created (transaction rolled back). | Integration | `NotFoundError` inside BEGIN…ROLLBACK block. |
| TC-API-SMP-008 | Admin | Create sample — PACKED box rejected | P0 | 1. `POST /api/v1/samples` body: `{"name":"Packed Reject","child_box_barcodes":["<CB_PACKED_1_barcode>"]}`. | HTTP 400. Message: "…is currently PACKED and cannot be added to a sample." No sample created. | Integration | `assertFootAvailable` status check. |
| TC-API-SMP-009 | Admin | Create sample — ECOMMERCE box rejected | P0 | 1. `POST /api/v1/samples` body: `{"name":"EC Reject","child_box_barcodes":["<CB_EC_1_barcode>"]}`. | HTTP 400. Message: "…is currently ECOMMERCE…". | Integration | Same status guard. |
| TC-API-SMP-010 | Admin | Create sample — DISPATCHED box rejected | P0 | 1. `POST /api/v1/samples` body: `{"name":"Disp Reject","child_box_barcodes":["<CB_DISP_1_barcode>"]}`. | HTTP 400. Message: "…is currently DISPATCHED…". | Integration | |
| TC-API-SMP-011 | Admin | Create sample — SAMPLE box (PAIR already taken) rejected | P0 | 1. Get `CB_SPLIT_PAIR` — already mapped as PAIR. 2. `POST /api/v1/samples` body: `{"name":"Pair Reject","child_box_barcodes":["<CB_SPLIT_PAIR_barcode>"],"box_feet":{"<CB_SPLIT_PAIR_barcode>":"LEFT"}}`. | HTTP 400. Message: "…is already fully in a sample (as a pair)." | Integration | `activeFeet.includes('PAIR')` guard in `assertFootAvailable`. |
| TC-API-SMP-012 | Admin | Create sample — name missing returns 400 | P0 | 1. `POST /api/v1/samples` body: `{}`. | HTTP 400. Zod validation error: `name is required`. | API | createSampleSchema: `name: z.string().min(1)`. |
| TC-API-SMP-013 | Admin | Create sample — name too long returns 400 | P1 | 1. `POST /api/v1/samples` body: `{"name":"<201-char string>"}`. | HTTP 400. Zod max(200) error. | API | |
| TC-API-SMP-014 | Admin | Create sample — invalid customer_id UUID returns 400 | P1 | 1. `POST /api/v1/samples` body: `{"name":"X","customer_id":"not-a-uuid"}`. | HTTP 400. Zod UUID validation error. | API | |
| TC-API-SMP-015 | Admin | Create sample — invalid box_feet enum value returns 400 | P1 | 1. `POST /api/v1/samples` body: `{"name":"X","child_box_barcodes":["CB_F001"],"box_feet":{"CB_F001":"BOTH"}}`. | HTTP 400. Zod enum error on `box_feet` value. | API | `z.record(z.enum(['LEFT','RIGHT','PAIR']))`. |
| TC-API-SMP-016 | Unauthenticated | POST /samples without token returns 401 | P0 | 1. No Authorization header. 2. `POST /api/v1/samples` body: `{"name":"X"}`. | HTTP 401. | API | `router.use(authenticate)` before all routes. |

---

## Section 2 — GET /samples (list)

**Route:** `GET /api/v1/samples` — **auth-only** (no `authorizePermission`). All authenticated roles → 200.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-020 | Admin | GET /samples returns paginated list | P0 | 1. `GET /api/v1/samples`. | HTTP 200. Body: `{ data:[...], total:<n>, page:1, limit:25 }`. Each item has `id`, `sample_barcode`, `name`, `status`, `child_count`, `customer_name`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. | API | Default page=1, limit=25 from schema. |
| TC-API-SMP-021 | Admin | GET /samples?status=ACTIVE filters correctly | P1 | 1. `GET /api/v1/samples?status=ACTIVE`. | All returned items `status="ACTIVE"`. HTTP 200. | API | |
| TC-API-SMP-022 | Admin | GET /samples?status=CREATED filters correctly | P1 | 1. `GET /api/v1/samples?status=CREATED`. | All items `status="CREATED"`. | API | |
| TC-API-SMP-023 | Admin | GET /samples?status=CLOSED filters correctly | P1 | 1. `GET /api/v1/samples?status=CLOSED`. | All items `status="CLOSED"`. | API | |
| TC-API-SMP-024 | Admin | GET /samples?status=DISPATCHED filters correctly | P1 | 1. `GET /api/v1/samples?status=DISPATCHED`. | All items `status="DISPATCHED"`. | API | |
| TC-API-SMP-025 | Admin | GET /samples?search= filters by name and barcode | P1 | 1. Create sample named "Trade Fair Batch". 2. `GET /api/v1/samples?search=Trade+Fair`. | Returns records with `name ILIKE '%Trade Fair%'` or `sample_barcode ILIKE '%Trade Fair%'`. | API | Both fields searched per service. |
| TC-API-SMP-026 | Admin | GET /samples?customer_id= filters by customer | P1 | 1. Create sample with `CUST_UUID`. 2. `GET /api/v1/samples?customer_id=<CUST_UUID>`. | All items have `customer_id=CUST_UUID`. | API | |
| TC-API-SMP-027 | Admin | GET /samples?page=2&limit=3 returns correct slice | P1 | 1. Ensure ≥ 4 samples. 2. `GET /api/v1/samples?page=2&limit=3`. | `data.length ≤ 3`, items different from page 1. `total` matches full count. | API | |
| TC-API-SMP-028 | Admin | GET /samples?status=INVALID returns 400 | P0 | 1. `GET /api/v1/samples?status=INVALID`. | HTTP 400. Zod enum error. | API | `sampleListQuerySchema` status enum. |
| TC-API-SMP-029 | Supervisor | GET /samples as Supervisor returns 200 (DISCREPANCY D1) | P0 | 1. `GET /api/v1/samples` with `SUP_TOKEN`. | **HTTP 200.** Returns list. No 403. Supervisor has no `samples:*` permission but GET has no `authorizePermission` gate — only `authenticate`. | API | **Discrepancy D1.** |
| TC-API-SMP-030 | Warehouse Operator | GET /samples as WH Operator returns 200 (DISCREPANCY D1) | P0 | 1. `GET /api/v1/samples` with `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-031 | Dispatch Operator | GET /samples as Dispatch Operator returns 200 (DISCREPANCY D1) | P0 | 1. `GET /api/v1/samples` with `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-032 | Unauthenticated | GET /samples without auth returns 401 | P0 | 1. No token. `GET /api/v1/samples`. | HTTP 401. | API | |

---

## Section 3 — GET /samples/:id (detail)

**Route:** `GET /api/v1/samples/:id` — auth-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-035 | Admin | GET /samples/:id returns record with child_boxes array | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE.id>`. | HTTP 200. Body includes all sample_record fields + `child_boxes: [...]` (active mappings with barcode, status, foot, product fields). | API | `getSampleById` calls `getSampleChildren` internally. |
| TC-API-SMP-036 | Admin | GET /samples/:id — non-existent ID returns 404 | P0 | 1. `GET /api/v1/samples/<random-uuid>`. | HTTP 404. | API | `NotFoundError`. |
| TC-API-SMP-037 | Admin | GET /samples/:id — invalid UUID format returns 400 | P1 | 1. `GET /api/v1/samples/not-a-uuid`. | HTTP 400. Zod param validation error. | API | `sampleIdParamSchema: z.string().uuid()`. |
| TC-API-SMP-038 | Supervisor | GET /samples/:id as Supervisor returns 200 (DISCREPANCY D1) | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE.id>` with `SUP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-039 | Warehouse Operator | GET /samples/:id as WH Operator returns 200 | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE.id>` with `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-040 | Dispatch Operator | GET /samples/:id as Dispatch Operator returns 200 | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE.id>` with `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-041 | Unauthenticated | GET /samples/:id without auth returns 401 | P0 | 1. No token. `GET /api/v1/samples/<SR_ACTIVE.id>`. | HTTP 401. | API | |

---

## Section 4 — GET /samples/qr/:barcode

**Route:** `GET /api/v1/samples/qr/:barcode` — auth-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-045 | Admin | GET /samples/qr/:barcode returns record by barcode | P0 | 1. Note `SR_ACTIVE.sample_barcode` (e.g. `SR3XK9A2`). 2. `GET /api/v1/samples/qr/SR3XK9A2`. | HTTP 200. Body matches `SR_ACTIVE`; includes `child_boxes`. | API | `getSampleByBarcode` — UPPER() normalisation on DB side. |
| TC-API-SMP-046 | Admin | GET /samples/qr/:barcode — lowercase barcode normalised | P1 | 1. `GET /api/v1/samples/qr/sr3xk9a2` (lowercase). | HTTP 200. Same record returned. Zod transform `.toUpperCase()` on param. | API | `sampleBarcodeParamSchema` transform. |
| TC-API-SMP-047 | Admin | GET /samples/qr/:barcode — unknown barcode returns 404 | P0 | 1. `GET /api/v1/samples/qr/SRXXXXXX`. | HTTP 404. | API | |
| TC-API-SMP-048 | Supervisor | GET /samples/qr/:barcode as Supervisor returns 200 | P0 | 1. Valid barcode with `SUP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-049 | Warehouse Operator | GET /samples/qr/:barcode as WH Operator returns 200 | P0 | 1. Valid barcode with `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-050 | Dispatch Operator | GET /samples/qr/:barcode as Dispatch Operator returns 200 | P0 | 1. Valid barcode with `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-051 | Unauthenticated | GET /samples/qr/:barcode without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 5 — GET /samples/:id/children

**Route:** `GET /api/v1/samples/:id/children` — auth-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-055 | Admin | GET /samples/:id/children returns active mappings with product fields | P0 | 1. `GET /api/v1/samples/<SR_ACTIVE.id>/children`. | HTTP 200. Array of active `sample_box_mapping` rows joined with `child_boxes` and `products`: fields include `barcode`, `status`, `quantity`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `foot`, `mapped_at`. Only `is_active=true` rows returned. | API | `getSampleChildren` WHERE `is_active = true`. |
| TC-API-SMP-056 | Admin | GET /samples/:id/children — foot field present per mapping | P0 | 1. Create sample with CB_F001 as LEFT and CB_F002 as RIGHT. 2. `GET /samples/<id>/children`. | Each mapping row contains `foot` field with value `"LEFT"` or `"RIGHT"`. | API | foot column added in migration 20260605. |
| TC-API-SMP-057 | Admin | GET /samples/:id/children — empty sample returns empty array | P1 | 1. `GET /api/v1/samples/<SR_CREATED.id>/children`. | HTTP 200. `data: []` (or body is `[]`). | API | |
| TC-API-SMP-058 | Admin | GET /samples/:id/children — after remove-box, removed mapping absent | P1 | 1. Add CB_F001 to SR_ACTIVE. 2. Remove CB_F001. 3. `GET /samples/<SR_ACTIVE.id>/children`. | CB_F001 mapping not in response (is_active=false). | Integration | |
| TC-API-SMP-059 | Supervisor | GET /samples/:id/children as Supervisor returns 200 | P0 | 1. Valid ID with `SUP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-060 | Warehouse Operator | GET /samples/:id/children as WH Operator returns 200 | P0 | 1. Valid ID with `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-061 | Dispatch Operator | GET /samples/:id/children as Dispatch Operator returns 200 | P0 | 1. Valid ID with `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-062 | Unauthenticated | GET /samples/:id/children without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 6 — GET /samples/:id/assortment

**Route:** `GET /api/v1/samples/:id/assortment` — auth-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-065 | Admin | GET /samples/:id/assortment returns product breakdown | P0 | 1. Ensure SR_ACTIVE has boxes of 2+ distinct products. 2. `GET /api/v1/samples/<SR_ACTIVE.id>/assortment`. | HTTP 200. Array of `{article_name, colour, size, mrp, count}` grouped by product. `count` is box count per combination. Only active mappings counted. | API | `getSampleAssortment` GROUP BY p.article_name, p.colour, p.size, p.mrp. |
| TC-API-SMP-066 | Admin | GET /samples/:id/assortment — non-existent ID returns 404 | P0 | 1. `GET /api/v1/samples/<random-uuid>/assortment`. | HTTP 404. | API | |
| TC-API-SMP-067 | Supervisor | GET /samples/:id/assortment as Supervisor returns 200 | P0 | 1. Valid ID with `SUP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-068 | Warehouse Operator | GET /samples/:id/assortment as WH Operator returns 200 | P0 | 1. Valid ID with `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-069 | Dispatch Operator | GET /samples/:id/assortment as Dispatch Operator returns 200 | P0 | 1. Valid ID with `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-SMP-070 | Unauthenticated | GET /samples/:id/assortment without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 7 — POST /samples/add-box

**Route:** `POST /api/v1/samples/add-box` — `authorizePermission('samples:update')` → Admin only by default.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-075 | Admin | add-box — FREE box with default foot (PAIR) | P0 | 1. `POST /api/v1/samples/add-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<SR_CREATED.id>"}`. | HTTP 200. Response: `{sample:{...}, mapping:{...}}`. `sample.status:"ACTIVE"`, `sample.child_count:1`. `mapping.foot:"PAIR"` (schema default). Child box `status:"SAMPLE"`. `CHILD_SAMPLED` transaction written. | Integration | Default foot from `addBoxToSampleSchema: z.enum(...).default('PAIR')`. |
| TC-API-SMP-076 | Admin | add-box — FREE box with explicit LEFT foot | P0 | 1. `POST /api/v1/samples/add-box` body: `{"child_box_id":"<CB_FREE_2.id>","sample_record_id":"<SR_CREATED.id>","foot":"LEFT"}`. | HTTP 200. `mapping.foot:"LEFT"`. Child box `status:"SAMPLE"`. | Integration | |
| TC-API-SMP-077 | Admin | add-box — FREE box with explicit RIGHT foot | P0 | 1. Same as above with `"foot":"RIGHT"`. | HTTP 200. `mapping.foot:"RIGHT"`. | Integration | |
| TC-API-SMP-078 | Admin | add-box — GENERATED box auto-activates | P0 | 1. `POST /api/v1/samples/add-box` body: `{"child_box_id":"<CB_GEN_1.id>","sample_record_id":"<SR_CREATED.id>"}`. | HTTP 200. `CHILD_ACTIVATED` + `CHILD_SAMPLED` transactions both present in `inventory_transactions`. Child box ends as `SAMPLE`. | Integration | Auto-activate branch in addBoxToSample. |
| TC-API-SMP-079 | Admin | add-box — SAMPLE box addable for its free foot | P0 | 1. `CB_SPLIT_L` has LEFT foot in `SR_LEFT_LIVE`. 2. `POST /samples/add-box` body: `{"child_box_id":"<CB_SPLIT_L.id>","sample_record_id":"<SR_CREATED.id>","foot":"RIGHT"}`. | HTTP 200. Second mapping created with `foot:"RIGHT"`. Child box remains `SAMPLE`. `sample_box_mapping` now has 2 active rows for `CB_SPLIT_L` (LEFT in SR_LEFT_LIVE, RIGHT in SR_CREATED). | Integration | **Foot-split:** SAMPLE status box can be added for its other free foot. |
| TC-API-SMP-080 | Admin | add-box — PACKED box rejected | P0 | 1. `POST /samples/add-box` body: `{"child_box_id":"<CB_PACKED_1.id>","sample_record_id":"<SR_CREATED.id>"}`. | HTTP 400. Message: "…PACKED and cannot be added…". | Integration | `assertFootAvailable` status check. |
| TC-API-SMP-081 | Admin | add-box — ECOMMERCE box rejected | P0 | 1. Use CB_EC_1. | HTTP 400. Message: "…ECOMMERCE…". | Integration | |
| TC-API-SMP-082 | Admin | add-box — DISPATCHED box rejected | P0 | 1. Use CB_DISP_1. | HTTP 400. Message: "…DISPATCHED…". | Integration | |
| TC-API-SMP-083 | Admin | add-box — PAIR-taken box rejected for any foot | P0 | 1. Use CB_SPLIT_PAIR (already PAIR). 2. Request `foot:"LEFT"`. | HTTP 400. "…already fully in a sample (as a pair)." | Integration | `activeFeet.includes('PAIR')` check. |
| TC-API-SMP-084 | Admin | add-box — LEFT foot already taken, LEFT again rejected | P0 | 1. CB_SPLIT_L has LEFT in SR_LEFT_LIVE. 2. `POST /samples/add-box` body: `{"child_box_id":"<CB_SPLIT_L.id>","sample_record_id":"<SR_CREATED.id>","foot":"LEFT"}`. | HTTP 400. "The left foot of child box … is already in a sample." | Integration | **Foot-split same-foot-twice rule.** DB unique index `idx_unique_active_sample_foot (child_box_id, foot) WHERE is_active`. |
| TC-API-SMP-085 | Admin | add-box — box with free foot, PAIR foot requested, rejected | P0 | 1. CB_SPLIT_L has LEFT taken. 2. `POST /samples/add-box` with `"foot":"PAIR"`. | HTTP 400. "…already has its left foot in a sample; cannot add the whole pair." | Integration | `requestedFoot==='PAIR' && activeFeet.length>0` guard. |
| TC-API-SMP-086 | Admin | add-box — CLOSED sample rejects box | P0 | 1. `POST /samples/add-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<SR_CLOSED.id>"}`. | HTTP 400. "Sample record is CLOSED and cannot accept new child boxes." | Integration | Status guard after locking sample record. |
| TC-API-SMP-087 | Admin | add-box — DISPATCHED sample rejects box | P0 | 1. `POST /samples/add-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<SR_DISPATCHED.id>"}`. | HTTP 400. "Sample record is DISPATCHED…". | Integration | |
| TC-API-SMP-088 | Admin | add-box — non-existent child_box_id returns 404 | P0 | 1. `POST /samples/add-box` body: `{"child_box_id":"<random-uuid>","sample_record_id":"<SR_ACTIVE.id>"}`. | HTTP 404. "Child box not found." | Integration | |
| TC-API-SMP-089 | Admin | add-box — non-existent sample_record_id returns 404 | P0 | 1. `POST /samples/add-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<random-uuid>"}`. | HTTP 404. "Sample record not found." | Integration | |
| TC-API-SMP-090 | Admin | add-box — CREATED→ACTIVE status promotion on first box | P0 | 1. SR_CREATED has `child_count:0`. 2. Add one box. 3. `GET /samples/<SR_CREATED.id>`. | `status` changed from `"CREATED"` to `"ACTIVE"`. `child_count:1`. | Integration | `newStatus = sample.status === CREATED ? ACTIVE : sample.status`. |
| TC-API-SMP-091 | Admin | add-box — child_count increments correctly | P1 | 1. SR_ACTIVE has `child_count:2`. 2. Add CB_FREE_3. 3. `GET /samples/<SR_ACTIVE.id>`. | `child_count:3`. | Integration | |
| TC-API-SMP-092 | Admin | add-box — invalid UUID fields return 400 | P1 | 1. `POST /samples/add-box` body: `{"child_box_id":"bad","sample_record_id":"bad"}`. | HTTP 400. Zod UUID validation error. | API | |
| TC-API-SMP-093 | Admin | add-box — invalid foot enum value returns 400 | P1 | 1. `POST /samples/add-box` body: `{"child_box_id":"<uuid>","sample_record_id":"<uuid>","foot":"BOTH"}`. | HTTP 400. Zod enum error on foot. | API | |
| TC-API-SMP-094 | Supervisor | POST /samples/add-box as Supervisor returns 403 | P0 | 1. `POST /samples/add-box` with `SUP_TOKEN`, valid body. | **HTTP 403.** Supervisor has no `samples:update` permission in seed. | API | Write gate enforced. |
| TC-API-SMP-095 | Warehouse Operator | POST /samples/add-box as WH Operator returns 403 | P0 | 1. `POST /samples/add-box` with `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-096 | Dispatch Operator | POST /samples/add-box as Dispatch Operator returns 403 | P0 | 1. `POST /samples/add-box` with `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-097 | Unauthenticated | POST /samples/add-box without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 8 — POST /samples/remove-box (conditional-free)

**Route:** `POST /api/v1/samples/remove-box` — `authorizePermission('samples:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-100 | Admin | remove-box — box with only one foot mapping → box returns FREE | P0 | 1. Add CB_FREE_1 (PAIR) to SR_ACTIVE. 2. `POST /samples/remove-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<SR_ACTIVE.id>"}`. | HTTP 200. Updated sample record returned. Child box `status:"FREE"`. Mapping `is_active:false`. `child_count` decremented by 1. `CHILD_UNSAMPLED` transaction written. | Integration | `remainingFeet.length === 0` → FREE. |
| TC-API-SMP-101 | Admin | remove-box — box with two active feet → removing one foot box stays SAMPLE | P0 | 1. CB_SPLIT_L has LEFT in SR_LEFT_LIVE, RIGHT in SR_CREATED (from TC-API-SMP-079). 2. Remove RIGHT foot: `POST /samples/remove-box` body: `{"child_box_id":"<CB_SPLIT_L.id>","sample_record_id":"<SR_CREATED.id>"}`. | HTTP 200. Child box `status` remains **`"SAMPLE"`** (LEFT foot still active in SR_LEFT_LIVE). Only SR_CREATED's mapping deactivated. `CHILD_UNSAMPLED` written. | Integration | **Conditional-free (Discrepancy D3/D4 encoding).** `remainingFeet.length > 0` → do NOT set FREE. |
| TC-API-SMP-102 | Admin | remove-box — last box from ACTIVE sample → sample reverts to CREATED | P0 | 1. SR with exactly 1 box. 2. Remove that box. 3. `GET /samples/<id>`. | Sample `status:"CREATED"`, `child_count:0`. `SAMPLE_REOPENED` transaction written. | Integration | `newChildCount===0 && sample.status===ACTIVE → CREATED`. |
| TC-API-SMP-103 | Admin | remove-box — DISPATCHED sample rejects remove | P0 | 1. `POST /samples/remove-box` body references SR_DISPATCHED. | HTTP 400. "Cannot remove a child box from a dispatched sample." | Integration | Status guard after lock. |
| TC-API-SMP-104 | Admin | remove-box — no active mapping found returns 404 | P0 | 1. `POST /samples/remove-box` body: `{"child_box_id":"<CB_FREE_1.id>","sample_record_id":"<SR_ACTIVE.id>"}` but that box was never added. | HTTP 404. "Active mapping not found…". | Integration | |
| TC-API-SMP-105 | Admin | remove-box — missing fields return 400 | P1 | 1. `POST /samples/remove-box` body: `{}`. | HTTP 400. Zod required UUID errors. | API | |
| TC-API-SMP-106 | Supervisor | POST /samples/remove-box as Supervisor returns 403 | P0 | 1. Valid body with `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-107 | Warehouse Operator | POST /samples/remove-box as WH Operator returns 403 | P0 | 1. `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-108 | Dispatch Operator | POST /samples/remove-box as Dispatch Operator returns 403 | P0 | 1. `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-109 | Unauthenticated | POST /samples/remove-box without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 9 — POST /samples/:id/full-unpack (conditional-free)

**Route:** `POST /api/v1/samples/:id/full-unpack` — `authorizePermission('samples:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-112 | Admin | full-unpack — all boxes freed, sample reverts to CREATED | P0 | 1. SR_ACTIVE has 3 single-foot-PAIR boxes. 2. `POST /samples/<SR_ACTIVE.id>/full-unpack`. | HTTP 200. `status:"CREATED"`, `child_count:0`. All 3 child boxes `status:"FREE"`. 3×`CHILD_UNSAMPLED` transactions written. All mappings `is_active:false`. | Integration | `fullUnpackSample` iterates active mappings. |
| TC-API-SMP-113 | Admin | full-unpack — box with other live foot stays SAMPLE | P0 | 1. Set up: CB_SPLIT_L has LEFT in SR_LEFT_LIVE and RIGHT in SR_TARGET (both active). 2. Full-unpack SR_TARGET (contains RIGHT mapping). | HTTP 200 for SR_TARGET unpack. CB_SPLIT_L `status` remains **`"SAMPLE"`** (LEFT still active in SR_LEFT_LIVE). SR_TARGET reverts to CREATED. | Integration | Conditional-free in full-unpack: `remainingFeet.length === 0` check per box. |
| TC-API-SMP-114 | Admin | full-unpack — DISPATCHED sample rejected | P0 | 1. `POST /samples/<SR_DISPATCHED.id>/full-unpack`. | HTTP 400. "Cannot unpack a dispatched sample." | Integration | Status guard. |
| TC-API-SMP-115 | Admin | full-unpack — CREATED (empty) sample rejected | P0 | 1. `POST /samples/<SR_CREATED.id>/full-unpack`. | HTTP 400. "Cannot unpack an empty sample record." | Integration | `status===CREATED` guard. |
| TC-API-SMP-116 | Admin | full-unpack — non-existent ID returns 404 | P0 | 1. `POST /samples/<random-uuid>/full-unpack`. | HTTP 404. | API | |
| TC-API-SMP-117 | Admin | full-unpack — CLOSED sample succeeds | P1 | 1. SR_CLOSED has 2 boxes. 2. `POST /samples/<SR_CLOSED.id>/full-unpack`. | HTTP 200. `child_count:0`, `status:"CREATED"`. | Integration | No CLOSED guard in `fullUnpackSample` — only DISPATCHED and CREATED blocked. |
| TC-API-SMP-118 | Supervisor | POST /samples/:id/full-unpack as Supervisor returns 403 | P0 | 1. Valid ID with `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-119 | Warehouse Operator | POST /samples/:id/full-unpack as WH Operator returns 403 | P0 | 1. `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-120 | Dispatch Operator | POST /samples/:id/full-unpack as Dispatch Operator returns 403 | P0 | 1. `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-121 | Unauthenticated | POST /samples/:id/full-unpack without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 10 — POST /samples/:id/close

**Route:** `POST /api/v1/samples/:id/close` — `authorizePermission('samples:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-125 | Admin | close — ACTIVE sample closes successfully | P0 | 1. `POST /samples/<SR_ACTIVE.id>/close`. | HTTP 200. `status:"CLOSED"`, `closed_at` non-null. `SAMPLE_CLOSED` transaction in `inventory_transactions`. Child boxes remain `SAMPLE` (close does not unpack). | Integration | `closeSample` only updates status and writes transaction. |
| TC-API-SMP-126 | Admin | close — CREATED (empty) sample rejected | P0 | 1. `POST /samples/<SR_CREATED.id>/close`. | HTTP 400. "Cannot close an empty sample record." | Integration | `child_count===0` guard. |
| TC-API-SMP-127 | Admin | close — already CLOSED sample rejected | P0 | 1. `POST /samples/<SR_CLOSED.id>/close`. | HTTP 400. "Sample record is already closed." | Integration | |
| TC-API-SMP-128 | Admin | close — DISPATCHED sample rejected | P0 | 1. `POST /samples/<SR_DISPATCHED.id>/close`. | HTTP 400. "Cannot close a dispatched sample." | Integration | |
| TC-API-SMP-129 | Admin | close — non-existent ID returns 404 | P0 | 1. `POST /samples/<random-uuid>/close`. | HTTP 404. | API | |
| TC-API-SMP-130 | Supervisor | POST /samples/:id/close as Supervisor returns 403 | P0 | 1. `SUP_TOKEN`, valid ID. | **HTTP 403.** | API | |
| TC-API-SMP-131 | Warehouse Operator | POST /samples/:id/close as WH Operator returns 403 | P0 | 1. `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-132 | Dispatch Operator | POST /samples/:id/close as Dispatch Operator returns 403 | P0 | 1. `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-133 | Unauthenticated | POST /samples/:id/close without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 11 — FOOT-SPLIT (deep coverage)

These TCs cover the complete foot-split contract including DB unique index enforcement, service-layer coexistence rules, and all rejection paths. See migration `20260609120001` for the partial unique index `idx_unique_active_sample_foot ON sample_box_mapping(child_box_id, foot) WHERE is_active`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-140 | Admin | Foot-split: LEFT to sample A, RIGHT to sample B — both succeed | P0 | 1. Create SR_A and SR_B (both CREATED/empty). 2. `POST /samples/add-box` → CB_FREE_1, SR_A, foot=LEFT. 3. `POST /samples/add-box` → CB_FREE_1, SR_B, foot=RIGHT. | Both requests HTTP 200. `sample_box_mapping` has 2 active rows for CB_FREE_1: one LEFT (SR_A), one RIGHT (SR_B). CB_FREE_1 `status:"SAMPLE"`. SR_A and SR_B each have `child_count:1`. | Integration | Core foot-split happy path. |
| TC-API-SMP-141 | Admin | Foot-split: second LEFT on same box (same-foot-twice) rejected | P0 | 1. CB_SPLIT_L already has LEFT in SR_LEFT_LIVE. 2. `POST /samples/add-box` → CB_SPLIT_L, new SR, foot=LEFT. | HTTP 400. "The left foot of child box … is already in a sample." | Integration | `assertFootAvailable`: `activeFeet.includes(requestedFoot)`. |
| TC-API-SMP-142 | Admin | Foot-split: second RIGHT on same box (same-foot-twice) rejected | P0 | 1. CB_FREE_1 has RIGHT mapped to SR_A. 2. Attempt RIGHT again to SR_B. | HTTP 400. Same error for "right foot". | Integration | |
| TC-API-SMP-143 | Admin | Foot-split: PAIR requested when LEFT already taken | P0 | 1. CB_SPLIT_L has LEFT taken. 2. `POST /samples/add-box` → CB_SPLIT_L, SR_CREATED, foot=PAIR. | HTTP 400. "…already has its left foot in a sample; cannot add the whole pair." | Integration | `requestedFoot==='PAIR' && activeFeet.length>0`. |
| TC-API-SMP-144 | Admin | Foot-split: PAIR requested when RIGHT already taken | P0 | 1. Box has RIGHT taken. 2. Request PAIR. | HTTP 400. Same error pattern for "right foot". | Integration | |
| TC-API-SMP-145 | Admin | Foot-split: LEFT requested when box is PAIR-mapped | P0 | 1. CB_SPLIT_PAIR has PAIR mapping. 2. Request LEFT. | HTTP 400. "…already fully in a sample (as a pair)." | Integration | `activeFeet.includes('PAIR')` guard runs before single-foot check. |
| TC-API-SMP-146 | Admin | Foot-split: DB unique index blocks duplicate active (child_box_id, foot) | P0 | 1. Insert active mapping for CB_FREE_1, LEFT into SR_A via service (TC-API-SMP-140 step 2). 2. Directly attempt `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, foot) VALUES (SR_B.id, CB_FREE_1.id, 'LEFT')` in psql (or via a second concurrent API call racing past service guard). | DB constraint violation: unique index `idx_unique_active_sample_foot`. API returns HTTP 400 or 500 (unhandled PG unique violation) — document actual HTTP code. | Integration | DB-level safety net beyond service guard. Recommend explicit 409 handling. **AUTOMATION GAP**: hard to race in API tests; recommend manual DB-layer test. |
| TC-API-SMP-147 | Admin | Foot-split: create sample with box_feet map splitting LEFT+RIGHT in one request | P0 | 1. `POST /samples` body: `{"name":"Split Create","child_box_barcodes":["CB_F001","CB_F001"],"box_feet":{"CB_F001":"LEFT"}}` — wait, same barcode twice is not a split. Instead: `{"name":"Split Create","child_box_barcodes":["CB_F001"],"box_feet":{"CB_F001":"LEFT"}}`. 2. Then `POST /samples` for SR_B with same box foot=RIGHT. | Each request 201. Two active sample_box_mapping rows for CB_F001. | Integration | Create endpoint uses same `assertFootAvailable` logic as add-box. |
| TC-API-SMP-148 | Admin | Foot-split: child_count semantics — one box = 1 count regardless of feet | P0 | 1. Create SR_A with CB_FREE_1 foot=LEFT. 2. `GET /samples/<SR_A.id>`. | `child_count:1`. Not 0.5. (Discrepancy D3 — client-approved.) 3. Create SR_B with CB_FREE_1 foot=RIGHT. 4. `GET /samples/<SR_B.id>`. | `child_count:1` on SR_B also. Total "SAMPLE" box count in DB = 1 (single child_boxes row, status=SAMPLE). | Integration | Box-level count semantics. |
| TC-API-SMP-149 | Admin | Foot-split: assortment counts box once per product group | P0 | 1. SR_A has CB_FREE_1 (LEFT) — product SKU=P1. 2. `GET /samples/<SR_A.id>/assortment`. | Assortment entry for P1 has `count:1` (not 0.5). | Integration | GROUP BY on active mappings; each mapping row = 1 count. |
| TC-API-SMP-150 | Admin | Foot-split: removing one foot from a split box does not free the box | P0 | 1. CB_FREE_1 split: LEFT in SR_A, RIGHT in SR_B. 2. Remove LEFT from SR_A. | CB_FREE_1 `status:"SAMPLE"` (RIGHT still active in SR_B). SR_A `child_count` decremented. | Integration | `remainingFeet.length > 0` after deactivate. |
| TC-API-SMP-151 | Admin | Foot-split: removing last foot frees the box | P0 | 1. CB_FREE_1 has only RIGHT in SR_B (LEFT already removed). 2. Remove RIGHT from SR_B. | CB_FREE_1 `status:"FREE"`. SR_B `child_count:0`, `status:"CREATED"`. | Integration | `remainingFeet.length === 0` → FREE. |
| TC-API-SMP-152 | Admin | Foot-split: full-unpack releases box only when all feet removed | P0 | 1. CB_FREE_1: LEFT in SR_A, RIGHT in SR_B (both active). 2. Full-unpack SR_A (removes LEFT). | CB_FREE_1 remains `SAMPLE`. SR_A: CREATED, child_count:0. 3. Full-unpack SR_B. CB_FREE_1 now `FREE`. | Integration | Full-unpack uses same `remainingFeet` check per box. |

---

## Section 12 — Last-foot dispatch integration

These TCs exercise `dispatch.service.ts _dispatchSample` — the last-foot logic that keeps a box SAMPLE when its other foot is still in a live sample.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-160 | Admin | Last-foot dispatch: single-foot sample — box stays SAMPLE after dispatch | P0 | 1. SR_A has CB_SPLIT_L LEFT foot. CB_SPLIT_L also has RIGHT foot in SR_B (ACTIVE, non-dispatched). 2. Close SR_A. 3. Dispatch SR_A via `POST /api/v1/dispatches {"sample_record_id":"<SR_A.id>"}`. | HTTP 201. SR_A `status:"DISPATCHED"`. CB_SPLIT_L `status` remains **`"SAMPLE"`** (RIGHT foot still live in SR_B). `CHILD_DISPATCHED` transaction written for LEFT foot with `metadata.foot:"LEFT"`. | Integration | `_dispatchSample` last-foot query: checks for other live non-dispatched sample mappings on the same box. |
| TC-API-SMP-161 | Admin | Last-foot dispatch: dispatching last sample holding a box → box becomes DISPATCHED | P0 | 1. CB_FREE_1 only has RIGHT foot in SR_B (LEFT already dispatched via SR_A). 2. Close SR_B. 3. Dispatch SR_B. | HTTP 201. CB_FREE_1 `status:"DISPATCHED"`. `CHILD_DISPATCHED` transaction with `metadata.foot:"RIGHT"`. | Integration | Last active foot → box flips to DISPATCHED. |
| TC-API-SMP-162 | Admin | Last-foot dispatch: PAIR box — dispatched as single unit | P0 | 1. SR_ACTIVE has 3 boxes all mapped as PAIR foot. 2. Close SR_ACTIVE. 3. Dispatch SR_ACTIVE. | HTTP 201. All 3 boxes `status:"DISPATCHED"` (each has only one active mapping, so all qualify as "last foot"). `SAMPLE_DISPATCHED` transaction. | Integration | Standard PAIR dispatch path — no split scenario. |
| TC-API-SMP-163 | Admin | Last-foot dispatch: CREATED sample cannot be dispatched | P0 | 1. `POST /dispatches {"sample_record_id":"<SR_CREATED.id>"}`. | HTTP 400. "Sample record must be in ACTIVE or CLOSED status for dispatch." | Integration | Status guard in `_dispatchSample`. |
| TC-API-SMP-164 | Admin | Last-foot dispatch: DISPATCHED sample cannot be dispatched again | P0 | 1. `POST /dispatches {"sample_record_id":"<SR_DISPATCHED.id>"}`. | HTTP 400. Same status error. | Integration | |
| TC-API-SMP-165 | Admin | Last-foot dispatch: SR_A dispatched → SR_A no longer accepts add-box | P0 | 1. Dispatch SR_ACTIVE (becomes DISPATCHED). 2. `POST /samples/add-box` with that sample ID. | HTTP 400. "Sample record is DISPATCHED and cannot accept new child boxes." | Integration | Post-dispatch guard. |

---

## Section 13 — Samples RBAC summary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-170 | Admin | POST /samples → 201 | P0 | Admin creates sample. | HTTP 201. | API | Baseline write permission. |
| TC-API-SMP-171 | Supervisor | POST /samples → 403 | P0 | `POST /samples` with `SUP_TOKEN`. | **HTTP 403.** No `samples:create` in Supervisor seed. | API | |
| TC-API-SMP-172 | Warehouse Operator | POST /samples → 403 | P0 | `POST /samples` with `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-173 | Dispatch Operator | POST /samples → 403 | P0 | `POST /samples` with `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-SMP-174 | Unauthenticated | POST /samples → 401 | P0 | No token. | HTTP 401. | API | 401 before 403 (authenticate runs before authorizePermission). |
| TC-API-SMP-175 | Supervisor | GET /samples → 200 (discrepancy D1) | P0 | `GET /samples` with `SUP_TOKEN`. | **HTTP 200.** | API | GET has no authorizePermission. |
| TC-API-SMP-176 | Warehouse Operator | GET /samples → 200 (discrepancy D1) | P0 | `GET /samples` with `WH_TOKEN`. | **HTTP 200.** | API | |
| TC-API-SMP-177 | Dispatch Operator | GET /samples → 200 (discrepancy D1) | P0 | `GET /samples` with `DP_TOKEN`. | **HTTP 200.** | API | |
| TC-API-SMP-178 | Admin | Role-Manager-grant: grant Supervisor samples:create, then POST → 201 | P1 | 1. Admin: `POST /roles/<SUP_ROLE_ID>/permissions` body: `{"permission":"samples:create"}`. 2. Re-login as Supervisor (new token). 3. `POST /samples` with new token. | HTTP 201. Grant takes effect immediately — no server restart needed. | Integration | Role Manager grant flow. Prerequisite: role-manager endpoint exists (phase-33). |
| TC-API-SMP-179 | Admin | Role-Manager-revoke: revoke Supervisor samples:create, then POST → 403 | P1 | 1. Revoke the grant from TC-API-SMP-178. 2. Re-login as Supervisor. 3. `POST /samples`. | HTTP 403. Revocation immediate. | Integration | |

---

## Section 14 — POST /ecommerce (create)

**Route:** `POST /api/v1/ecommerce` — `authorizePermission('ecommerce:create')` → Admin only by default.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-001 | Admin | Create ecommerce — empty (no boxes) | P0 | 1. `POST /api/v1/ecommerce` with `ADMIN_TOKEN`, body: `{"name":"Empty EC"}`. | HTTP 201. Body: `id`, `ecommerce_barcode` (`EC######`), `name:"Empty EC"`, `status:"CREATED"`, `child_count:0`, `qr_barcode` (same as `ecommerce_barcode`). DB: row in `ecommerce_records`. `ECOMMERCE_CREATED` transaction written. | Integration | **ECOMMERCE_CREATED only emitted on empty-create path.** (Discrepancy D2.) |
| TC-API-EC-002 | Admin | Create ecommerce — with `child_box_barcodes` array (skips ECOMMERCE_CREATED) | P0 | 1. `POST /api/v1/ecommerce` body: `{"name":"Loaded EC","child_box_barcodes":["CB_F001","CB_F002"]}`. | HTTP 201. `status:"ACTIVE"`, `child_count:2`. DB: 2 active rows in `ecommerce_box_mapping`. Both boxes `status:"ECOMMERCE"`. **No `ECOMMERCE_CREATED` transaction** (exits via with-boxes path). 2×`CHILD_ECOMMERCED` transactions written. | Integration | **Discrepancy D2: ECOMMERCE_CREATED missing when boxes supplied at creation.** |
| TC-API-EC-003 | Admin | Create ecommerce — GENERATED box auto-activates | P0 | 1. `POST /api/v1/ecommerce` body: `{"name":"Gen EC","child_box_barcodes":["CB_G001"]}`. | HTTP 201. `CHILD_ACTIVATED` + `CHILD_ECOMMERCED` transactions. CB_G001 status="ECOMMERCE". | Integration | Same auto-activate branch as sample. |
| TC-API-EC-004 | Admin | Create ecommerce — all optional fields | P1 | 1. `POST /api/v1/ecommerce` body: `{"name":"Full","marketplace":"Amazon","order_reference":"ORD-001","listing_sku":"SKU-XY","mapped_date":"2026-06-10","notes":"Fragile"}`. | HTTP 201. All fields persisted. | API | |
| TC-API-EC-005 | Admin | Create ecommerce — PACKED box rejected | P0 | 1. `POST /api/v1/ecommerce` body: `{"name":"X","child_box_barcodes":["<CB_PACKED_1_barcode>"]}`. | HTTP 400. "…currently PACKED and cannot be added to an e-commerce record. Only FREE or GENERATED boxes can be added." | Integration | Ecommerce does not support foot-split; only FREE/GENERATED accepted. |
| TC-API-EC-006 | Admin | Create ecommerce — SAMPLE box rejected | P0 | 1. SAMPLE status box barcode. | HTTP 400. "…currently SAMPLE…". | Integration | No partial-foot logic in ecommerce service. |
| TC-API-EC-007 | Admin | Create ecommerce — DISPATCHED box rejected | P0 | 1. DISPATCHED box barcode. | HTTP 400. | Integration | |
| TC-API-EC-008 | Admin | Create ecommerce — unknown barcode returns 404 | P0 | 1. `{"name":"X","child_box_barcodes":["XXXXXX"]}`. | HTTP 404. Rolled back. | Integration | |
| TC-API-EC-009 | Admin | Create ecommerce — name missing returns 400 | P0 | 1. `POST /api/v1/ecommerce` body: `{}`. | HTTP 400. Zod `name is required`. | API | |
| TC-API-EC-010 | Admin | Create ecommerce — name too long returns 400 | P1 | 1. name = 201 chars. | HTTP 400. | API | max(200) in schema. |
| TC-API-EC-011 | Admin | Create ecommerce — barcode case-normalised | P1 | 1. `{"name":"X","child_box_barcodes":["cb_f001"]}` (lowercase). | HTTP 201. Barcode matched after UPPER() transform. | Integration | Zod: `.transform((s)=>s.trim().toUpperCase())`. |
| TC-API-EC-012 | Supervisor | POST /ecommerce → 403 | P0 | `POST /ecommerce` with `SUP_TOKEN`. | **HTTP 403.** No `ecommerce:create`. | API | |
| TC-API-EC-013 | Warehouse Operator | POST /ecommerce → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-014 | Dispatch Operator | POST /ecommerce → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-015 | Unauthenticated | POST /ecommerce → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 15 — GET /ecommerce (list)

**Route:** `GET /api/v1/ecommerce` — auth-only (no permission gate).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-020 | Admin | GET /ecommerce returns paginated list | P0 | 1. `GET /api/v1/ecommerce`. | HTTP 200. `{ data:[...], total:<n>, page:1, limit:25 }`. Each item: `id`, `ecommerce_barcode`, `name`, `status`, `child_count`, `marketplace`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`. | API | `ecommerceListQuerySchema`: page/limit use `z.coerce.number()`. |
| TC-API-EC-021 | Admin | GET /ecommerce?status=ACTIVE filters | P1 | 1. `GET /api/v1/ecommerce?status=ACTIVE`. | All items `status="ACTIVE"`. | API | |
| TC-API-EC-022 | Admin | GET /ecommerce?status=CREATED filters | P1 | 1. `?status=CREATED`. | All `status="CREATED"`. | API | |
| TC-API-EC-023 | Admin | GET /ecommerce?status=CLOSED filters | P1 | 1. `?status=CLOSED`. | | API | |
| TC-API-EC-024 | Admin | GET /ecommerce?status=DISPATCHED filters | P1 | 1. `?status=DISPATCHED`. | | API | |
| TC-API-EC-025 | Admin | GET /ecommerce?marketplace=Amazon filters | P1 | 1. Create EC with `marketplace:"Amazon"`. 2. `GET /ecommerce?marketplace=Amazon`. | Only Amazon records returned (ILIKE). | API | |
| TC-API-EC-026 | Admin | GET /ecommerce?search= filters barcode, name, order_reference | P1 | 1. Create EC with `order_reference:"ORD-999"`. 2. `GET /ecommerce?search=ORD-999`. | Record with that order_reference returned. All three fields (barcode, name, order_reference) searched. | API | |
| TC-API-EC-027 | Admin | GET /ecommerce?page=2&limit=3 returns correct slice | P1 | 1. Ensure ≥ 4 records. 2. `?page=2&limit=3`. | `data.length ≤ 3`. | API | |
| TC-API-EC-028 | Admin | GET /ecommerce?status=INVALID returns 400 | P0 | 1. `?status=INVALID`. | HTTP 400. Zod enum error. | API | |
| TC-API-EC-029 | Admin | GET /ecommerce?limit=200 capped at 100 | P1 | 1. `?limit=200`. | HTTP 400 (Zod `max(100)` on limit) or silently capped — verify actual behavior. `ecommerceListQuerySchema`: `z.coerce.number().int().min(1).max(100)` → **HTTP 400**. | API | Unlike sampleListQuerySchema which has no max — note asymmetry. |
| TC-API-EC-030 | Supervisor | GET /ecommerce as Supervisor returns 200 (DISCREPANCY D1) | P0 | 1. `GET /ecommerce` with `SUP_TOKEN`. | **HTTP 200.** No permission gate on GET. | API | **Discrepancy D1.** |
| TC-API-EC-031 | Warehouse Operator | GET /ecommerce as WH Operator returns 200 | P0 | 1. `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-032 | Dispatch Operator | GET /ecommerce as Dispatch Operator returns 200 | P0 | 1. `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-033 | Unauthenticated | GET /ecommerce without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 16 — GET /ecommerce/stock-summary

**Route:** `GET /api/v1/ecommerce/stock-summary` — auth-only. **Order-sensitive:** this literal route must be declared BEFORE `/:id` in the router (confirmed in `ecommerce.routes.ts` line 40–43).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-038 | Admin | GET /ecommerce/stock-summary returns product-level allocated vs available | P0 | 1. Ensure system has: at least one ECOMMERCE-status box (product P1), at least one FREE/GENERATED box (product P1 or P2). 2. `GET /api/v1/ecommerce/stock-summary`. | HTTP 200. Array of rows. Each row: `product_id`, `article_name`, `colour`, `size`, `sku`, `mrp`, `allocated_boxes` (count of ECOMMERCE-status), `allocated_pairs` (sum of quantity for ECOMMERCE), `available_boxes` (FREE+GENERATED count), `available_pairs` (sum quantity FREE+GENERATED). Only products with ECOMMERCE>0 OR FREE/GENERATED>0 returned (`HAVING` clause). | API | `getEcommerceStockSummary` — filters: $1=ECOMMERCE, $2=FREE, $3=GENERATED. |
| TC-API-EC-039 | Admin | stock-summary allocated_boxes increments after add-box | P0 | 1. Note `allocated_boxes` for product P1. 2. Add a FREE P1 box to ER_ACTIVE. 3. `GET /ecommerce/stock-summary`. | `allocated_boxes` for P1 increased by 1. `available_boxes` for P1 decreased by 1. | Integration | Verifies live DB query after state change. |
| TC-API-EC-040 | Admin | stock-summary available_boxes includes GENERATED boxes | P1 | 1. Create GENERATED child box for product P2. 2. `GET /ecommerce/stock-summary`. | P2 row has `available_boxes ≥ 1` (GENERATED counted as available). | Integration | Status IN (FREE, GENERATED) for available. |
| TC-API-EC-041 | Admin | stock-summary — product with no ECOMMERCE/FREE/GENERATED boxes absent | P1 | 1. Find product with all boxes PACKED/DISPATCHED/SAMPLE. 2. `GET /ecommerce/stock-summary`. | That product not in response (HAVING clause excludes it). | Integration | |
| TC-API-EC-042 | Admin | stock-summary ordered by article_name, colour, size | P1 | 1. `GET /ecommerce/stock-summary`. | Results ordered: `ORDER BY p.article_name, p.colour, p.size`. | API | Verify first row alphabetically first. |
| TC-API-EC-043 | Supervisor | GET /ecommerce/stock-summary as Supervisor returns 200 (DISCREPANCY D1) | P0 | 1. `GET /ecommerce/stock-summary` with `SUP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-044 | Warehouse Operator | GET /ecommerce/stock-summary as WH Operator returns 200 | P0 | 1. `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-045 | Dispatch Operator | GET /ecommerce/stock-summary as Dispatch Operator returns 200 | P0 | 1. `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-046 | Unauthenticated | GET /ecommerce/stock-summary without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |

---

## Section 17 — GET /ecommerce detail endpoints

**Routes:** `GET /ecommerce/:id`, `GET /ecommerce/qr/:barcode`, `GET /ecommerce/:id/children`, `GET /ecommerce/:id/assortment` — all auth-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-050 | Admin | GET /ecommerce/:id returns record with child_boxes | P0 | 1. `GET /api/v1/ecommerce/<ER_ACTIVE.id>`. | HTTP 200. Fields: `id`, `ecommerce_barcode`, `name`, `status`, `child_count`, `marketplace`, `order_reference`, `listing_sku`, `child_boxes:[...]` (active mappings joined with product data). | API | `getEcommerceById` calls `getEcommerceChildren`. |
| TC-API-EC-051 | Admin | GET /ecommerce/:id — non-existent returns 404 | P0 | 1. `GET /ecommerce/<random-uuid>`. | HTTP 404. | API | |
| TC-API-EC-052 | Admin | GET /ecommerce/:id — invalid UUID returns 400 | P1 | 1. `GET /ecommerce/not-a-uuid`. | HTTP 400. Zod param error. | API | `ecommerceIdParamSchema: z.object({id: z.string().uuid()})`. |
| TC-API-EC-053 | Admin | GET /ecommerce/qr/:barcode returns record | P0 | 1. Note `ER_ACTIVE.ecommerce_barcode`. 2. `GET /ecommerce/qr/<barcode>`. | HTTP 200. Record + child_boxes. | API | `getEcommerceByBarcode` — UPPER() on DB. |
| TC-API-EC-054 | Admin | GET /ecommerce/qr/:barcode — lowercase normalised | P1 | 1. Lowercase barcode. | HTTP 200. Zod transform `.toUpperCase()`. | API | |
| TC-API-EC-055 | Admin | GET /ecommerce/qr/:barcode — not found returns 404 | P0 | 1. `GET /ecommerce/qr/ECXXXXXX`. | HTTP 404. | API | |
| TC-API-EC-056 | Admin | GET /ecommerce/:id/children returns active mappings | P0 | 1. `GET /ecommerce/<ER_ACTIVE.id>/children`. | HTTP 200. Array of active `ecommerce_box_mapping` rows with product fields: `barcode`, `status`, `quantity`, `article_name`, `sku`, `size`, `colour`, `mrp`. Only `is_active=true`. | API | |
| TC-API-EC-057 | Admin | GET /ecommerce/:id/children — after remove-box, mapping absent | P1 | 1. Add box, then remove. 2. `GET /:id/children`. | Removed box not in response. | Integration | |
| TC-API-EC-058 | Admin | GET /ecommerce/:id/assortment returns product breakdown | P0 | 1. `GET /ecommerce/<ER_ACTIVE.id>/assortment`. | HTTP 200. Array of `{article_name, colour, size, mrp, count}`. Each group has correct box count. | API | |
| TC-API-EC-059 | Admin | GET /ecommerce/:id/assortment — non-existent returns 404 | P0 | 1. Random UUID. | HTTP 404. | API | |
| TC-API-EC-060 | Supervisor | GET /ecommerce/:id as Supervisor returns 200 (DISCREPANCY D1) | P0 | 1. `SUP_TOKEN`, valid ID. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-061 | Warehouse Operator | GET /ecommerce/:id as WH Operator returns 200 | P0 | 1. `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-062 | Dispatch Operator | GET /ecommerce/:id as Dispatch Operator returns 200 | P0 | 1. `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-063 | Unauthenticated | GET /ecommerce/:id without auth returns 401 | P0 | 1. No token. | HTTP 401. | API | |
| TC-API-EC-064 | Supervisor | GET /ecommerce/stock-summary as Supervisor — 200 (DISCREPANCY D1, repeat for stock-summary) | P0 | See TC-API-EC-043 (included here for completeness in role matrix). | **HTTP 200.** | API | **Discrepancy D1.** |

---

## Section 18 — POST /ecommerce/add-box

**Route:** `POST /api/v1/ecommerce/add-box` — `authorizePermission('ecommerce:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-070 | Admin | add-box — FREE box added successfully | P0 | 1. `POST /ecommerce/add-box` body: `{"child_box_id":"<CB_FREE_1.id>","ecommerce_record_id":"<ER_CREATED.id>"}`. | HTTP 200. `{record:{...}, mapping:{...}}`. `record.status:"ACTIVE"`, `record.child_count:1`. CB_FREE_1 `status:"ECOMMERCE"`. `CHILD_ECOMMERCED` transaction written. | Integration | CREATED→ACTIVE promotion on first box. |
| TC-API-EC-071 | Admin | add-box — GENERATED box auto-activates | P0 | 1. Use CB_GEN_1. | HTTP 200. `CHILD_ACTIVATED` + `CHILD_ECOMMERCED` transactions. | Integration | |
| TC-API-EC-072 | Admin | add-box — PACKED box rejected | P0 | 1. Use CB_PACKED_1. | HTTP 400. "…PACKED and cannot be added to an e-commerce record. Only FREE or GENERATED boxes…". | Integration | Status guard — no foot-split logic in ecommerce. |
| TC-API-EC-073 | Admin | add-box — SAMPLE box rejected | P0 | 1. SAMPLE box. | HTTP 400. | Integration | |
| TC-API-EC-074 | Admin | add-box — ECOMMERCE box (already in another record) rejected | P0 | 1. CB_EC_1 already status=ECOMMERCE. | HTTP 400. | Integration | |
| TC-API-EC-075 | Admin | add-box — DISPATCHED box rejected | P0 | 1. CB_DISP_1. | HTTP 400. | Integration | |
| TC-API-EC-076 | Admin | add-box — CLOSED ecommerce record rejects box | P0 | 1. `POST /ecommerce/add-box` body references ER_CLOSED. | HTTP 400. "E-commerce record is CLOSED and cannot accept new child boxes." | Integration | CLOSED guard (unlike samples, ecommerce also blocks CLOSED). |
| TC-API-EC-077 | Admin | add-box — DISPATCHED ecommerce record rejects box | P0 | 1. ER_DISPATCHED. | HTTP 400. "…DISPATCHED…". | Integration | |
| TC-API-EC-078 | Admin | add-box — non-existent child_box_id returns 404 | P0 | 1. Random UUID. | HTTP 404. "Child box not found." | Integration | |
| TC-API-EC-079 | Admin | add-box — non-existent ecommerce_record_id returns 404 | P0 | 1. Random UUID record ID. | HTTP 404. "E-commerce record not found." | Integration | |
| TC-API-EC-080 | Admin | add-box — child_count increments | P1 | 1. ER_ACTIVE (child_count=2). Add box. 2. `GET /ecommerce/<ER_ACTIVE.id>`. | `child_count:3`. | Integration | |
| TC-API-EC-081 | Admin | add-box — missing required fields return 400 | P1 | 1. Body: `{}`. | HTTP 400. Zod UUID required errors. | API | |
| TC-API-EC-082 | Supervisor | POST /ecommerce/add-box → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-083 | Warehouse Operator | POST /ecommerce/add-box → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-084 | Dispatch Operator | POST /ecommerce/add-box → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-085 | Unauthenticated | POST /ecommerce/add-box → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 19 — POST /ecommerce/scan-carton (atomic carton→ecommerce move)

**Route:** `POST /api/v1/ecommerce/scan-carton` — `authorizePermission('ecommerce:update')`.

Business logic (from `scanCartonToEcommerce`): atomically unpacks all currently-packed child boxes from a master carton and moves them into the e-commerce record. Ecommerce record must not be CLOSED/DISPATCHED. Carton must not be DISPATCHED (CLOSED and ACTIVE are both scannable).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-090 | Admin | scan-carton — ACTIVE carton → all boxes move to ecommerce | P0 | 1. MC_ACTIVE has 3 packed boxes. 2. `POST /ecommerce/scan-carton` body: `{"ecommerce_record_id":"<ER_CREATED.id>","carton_barcode":"<MC_ACTIVE.carton_barcode>"}`. | HTTP 200. Response: `{record:{...}, added:3, cartonBarcode:"<MC_ACTIVE.carton_barcode>"}`. ER becomes ACTIVE, `child_count:3`. All 3 boxes `status:"ECOMMERCE"`. Carton `child_count:0`, `status:"CREATED"`. `carton_child_mapping` rows `is_active:false`. `ecommerce_box_mapping` has 3 new active rows. 3×`CHILD_UNPACKED` + 3×`CHILD_ECOMMERCED` transactions. | Integration | Atomic: all in one transaction. |
| TC-API-EC-091 | Admin | scan-carton — CLOSED carton IS scannable (DISCREPANCY D5) | P0 | 1. MC_CLOSED has ≥ 1 packed box. 2. `POST /ecommerce/scan-carton` body: `{"ecommerce_record_id":"<ER_CREATED.id>","carton_barcode":"<MC_CLOSED.carton_barcode>"}`. | HTTP 200. Boxes move. **CLOSED carton is not blocked.** Only DISPATCHED is blocked. | Integration | **Discrepancy D5.** `carton.status === DISPATCHED` is the only carton rejection check. |
| TC-API-EC-092 | Admin | scan-carton — DISPATCHED carton rejected | P0 | 1. MC_DISPATCHED. 2. `POST /ecommerce/scan-carton` body using MC_DISPATCHED barcode. | HTTP 400. "Master carton … is DISPATCHED and cannot be moved to e-commerce." | Integration | Only DISPATCHED blocked at carton level. |
| TC-API-EC-093 | Admin | scan-carton — CLOSED ecommerce record rejected | P0 | 1. `POST /ecommerce/scan-carton` body: `{"ecommerce_record_id":"<ER_CLOSED.id>","carton_barcode":"<MC_ACTIVE.carton_barcode>"}`. | HTTP 400. "E-commerce record is CLOSED and cannot accept new child boxes." | Integration | EC record guard checked before carton. |
| TC-API-EC-094 | Admin | scan-carton — DISPATCHED ecommerce record rejected | P0 | 1. ER_DISPATCHED. | HTTP 400. "…DISPATCHED…". | Integration | |
| TC-API-EC-095 | Admin | scan-carton — empty carton (no packed boxes) rejected | P0 | 1. MC_EMPTY (ACTIVE, child_count=0, all mappings is_active=false). 2. Scan it. | HTTP 400. "Master carton … has no packed child boxes to add." | Integration | `mappings.rows.length === 0` guard. |
| TC-API-EC-096 | Admin | scan-carton — carton barcode not found returns 404 | P0 | 1. `{"ecommerce_record_id":"<ER_CREATED.id>","carton_barcode":"MCXXXXXX"}`. | HTTP 404. "No master carton found with barcode MCXXXXXX." | Integration | |
| TC-API-EC-097 | Admin | scan-carton — ecommerce record not found returns 404 | P0 | 1. `{"ecommerce_record_id":"<random-uuid>","carton_barcode":"<MC_ACTIVE.barcode>"}`. | HTTP 404. "E-commerce record not found." | Integration | |
| TC-API-EC-098 | Admin | scan-carton — carton_barcode lowercased normalised by Zod | P1 | 1. `{"ecommerce_record_id":"<ER_CREATED.id>","carton_barcode":"<lowercase_barcode>"}`. | HTTP 200 (barcode matched after UPPER transform). | Integration | `scanCartonToEcommerceSchema: barcode.transform((s)=>s.trim().toUpperCase())`. |
| TC-API-EC-099 | Admin | scan-carton — carton child_count decremented, status set to CREATED when emptied | P0 | 1. MC_ACTIVE has exactly 2 boxes. 2. Scan to ER_CREATED. | Carton `child_count:0`, `status:"CREATED"` (was ACTIVE). | Integration | `newCartonCount === 0 → CREATED`. |
| TC-API-EC-100 | Admin | scan-carton — partial carton (some boxes already removed) moves remaining | P1 | 1. MC_ACTIVE had 3 boxes; remove 1 via remove-box first (child_count=2). 2. Scan carton. | `added:2`. 2 boxes moved. Carton emptied. | Integration | Only `is_active=true` mappings fetched. |
| TC-API-EC-101 | Admin | scan-carton — missing required fields return 400 | P1 | 1. Body: `{}`. | HTTP 400. Zod required errors. | API | |
| TC-API-EC-102 | Supervisor | POST /ecommerce/scan-carton → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-103 | Warehouse Operator | POST /ecommerce/scan-carton → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-104 | Dispatch Operator | POST /ecommerce/scan-carton → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-105 | Unauthenticated | POST /ecommerce/scan-carton → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 20 — POST /ecommerce/remove-box

**Route:** `POST /api/v1/ecommerce/remove-box` — `authorizePermission('ecommerce:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-110 | Admin | remove-box — box returned to FREE | P0 | 1. ER_ACTIVE with CB_FREE_1 (ECOMMERCE). 2. `POST /ecommerce/remove-box` body: `{"child_box_id":"<CB_FREE_1.id>","ecommerce_record_id":"<ER_ACTIVE.id>"}`. | HTTP 200. Updated record returned. CB_FREE_1 `status:"FREE"`. Mapping `is_active:false`. `child_count` decremented. `CHILD_UNECOMMERCED` transaction written. | Integration | No conditional-free; ecommerce always frees box on remove (no foot-split). |
| TC-API-EC-111 | Admin | remove-box — last box → record reverts to CREATED + ECOMMERCE_REOPENED emitted | P0 | 1. ER with exactly 1 box. 2. Remove it. 3. `GET /ecommerce/<id>`. | `status:"CREATED"`, `child_count:0`. `ECOMMERCE_REOPENED` transaction written. | Integration | `newChildCount===0 && status===ACTIVE → CREATED`. |
| TC-API-EC-112 | Admin | remove-box — DISPATCHED record rejected | P0 | 1. ER_DISPATCHED. | HTTP 400. "Cannot remove box from a dispatched e-commerce record." | Integration | DISPATCHED guard (note: CLOSED is NOT blocked — verify service). |
| TC-API-EC-113 | Admin | remove-box — CLOSED record allows remove | P1 | 1. ER_CLOSED has a box. 2. Remove it. | HTTP 200. `child_count` decremented. (CLOSED does not block remove — only DISPATCHED does.) | Integration | Service check: `record.status === DISPATCHED` only. |
| TC-API-EC-114 | Admin | remove-box — no active mapping returns 404 | P0 | 1. Box not in the record. | HTTP 404. "Active mapping not found…". | Integration | |
| TC-API-EC-115 | Admin | remove-box — missing fields return 400 | P1 | 1. Body: `{}`. | HTTP 400. | API | |
| TC-API-EC-116 | Supervisor | POST /ecommerce/remove-box → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-117 | Warehouse Operator | POST /ecommerce/remove-box → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-118 | Dispatch Operator | POST /ecommerce/remove-box → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-119 | Unauthenticated | POST /ecommerce/remove-box → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 21 — POST /ecommerce/:id/full-unpack

**Route:** `POST /api/v1/ecommerce/:id/full-unpack` — `authorizePermission('ecommerce:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-123 | Admin | full-unpack — all boxes freed, record reverts to CREATED | P0 | 1. ER_ACTIVE has 3 boxes. 2. `POST /ecommerce/<ER_ACTIVE.id>/full-unpack`. | HTTP 200. `status:"CREATED"`, `child_count:0`. All 3 boxes `status:"FREE"`. 3×`CHILD_UNECOMMERCED` transactions. All mappings `is_active:false`. | Integration | No conditional-free in ecommerce; always FREE. |
| TC-API-EC-124 | Admin | full-unpack — DISPATCHED record rejected | P0 | 1. `POST /ecommerce/<ER_DISPATCHED.id>/full-unpack`. | HTTP 400. "Cannot unpack a dispatched e-commerce record." | Integration | |
| TC-API-EC-125 | Admin | full-unpack — CREATED (empty) record rejected | P0 | 1. `POST /ecommerce/<ER_CREATED.id>/full-unpack`. | HTTP 400. "Cannot unpack an empty e-commerce record." | Integration | `status===CREATED` guard. |
| TC-API-EC-126 | Admin | full-unpack — CLOSED record succeeds | P1 | 1. ER_CLOSED has ≥ 1 box. 2. Full-unpack. | HTTP 200. Boxes freed, `status:"CREATED"`. | Integration | No CLOSED guard in `fullUnpackEcommerce`. |
| TC-API-EC-127 | Admin | full-unpack — non-existent ID returns 404 | P0 | 1. Random UUID. | HTTP 404. | API | |
| TC-API-EC-128 | Supervisor | POST /ecommerce/:id/full-unpack → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-129 | Warehouse Operator | POST /ecommerce/:id/full-unpack → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-130 | Dispatch Operator | POST /ecommerce/:id/full-unpack → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-131 | Unauthenticated | POST /ecommerce/:id/full-unpack → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 22 — POST /ecommerce/:id/close

**Route:** `POST /api/v1/ecommerce/:id/close` — `authorizePermission('ecommerce:update')`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-135 | Admin | close — ACTIVE record closes successfully | P0 | 1. `POST /ecommerce/<ER_ACTIVE.id>/close`. | HTTP 200. `status:"CLOSED"`, `closed_at` non-null. `ECOMMERCE_CLOSED` transaction written. Child boxes remain `ECOMMERCE` status (close does not unpack). | Integration | |
| TC-API-EC-136 | Admin | close — CREATED (empty) rejected | P0 | 1. `POST /ecommerce/<ER_CREATED.id>/close`. | HTTP 400. "Cannot close an empty e-commerce record." | Integration | `child_count===0` guard. |
| TC-API-EC-137 | Admin | close — already CLOSED rejected | P0 | 1. `POST /ecommerce/<ER_CLOSED.id>/close`. | HTTP 400. "E-commerce record is already closed." | Integration | |
| TC-API-EC-138 | Admin | close — DISPATCHED rejected | P0 | 1. `POST /ecommerce/<ER_DISPATCHED.id>/close`. | HTTP 400. "Cannot close a dispatched e-commerce record." | Integration | |
| TC-API-EC-139 | Admin | close — non-existent ID returns 404 | P0 | 1. Random UUID. | HTTP 404. | API | |
| TC-API-EC-140 | Supervisor | POST /ecommerce/:id/close → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-141 | Warehouse Operator | POST /ecommerce/:id/close → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-142 | Dispatch Operator | POST /ecommerce/:id/close → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-143 | Unauthenticated | POST /ecommerce/:id/close → 401 | P0 | No token. | HTTP 401. | API | |

---

## Section 23 — Ecommerce RBAC summary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-EC-148 | Admin | POST /ecommerce → 201 | P0 | Admin creates record. | HTTP 201. | API | Baseline. |
| TC-API-EC-149 | Supervisor | POST /ecommerce → 403 | P0 | `SUP_TOKEN`. | **HTTP 403.** No `ecommerce:create`. | API | |
| TC-API-EC-150 | Warehouse Operator | POST /ecommerce → 403 | P0 | `WH_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-151 | Dispatch Operator | POST /ecommerce → 403 | P0 | `DP_TOKEN`. | **HTTP 403.** | API | |
| TC-API-EC-152 | Unauthenticated | POST /ecommerce → 401 | P0 | No token. | HTTP 401. | API | 401 before 403 (authenticate first). |
| TC-API-EC-153 | Supervisor | GET /ecommerce → 200 (discrepancy D1) | P0 | `SUP_TOKEN`. | **HTTP 200.** No permission gate. | API | **Discrepancy D1.** |
| TC-API-EC-154 | Warehouse Operator | GET /ecommerce → 200 (discrepancy D1) | P0 | `WH_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-155 | Dispatch Operator | GET /ecommerce → 200 (discrepancy D1) | P0 | `DP_TOKEN`. | **HTTP 200.** | API | **Discrepancy D1.** |
| TC-API-EC-156 | Admin | Role-Manager-grant: grant Supervisor ecommerce:create, then POST → 201 | P1 | 1. Grant `ecommerce:create` to Supervisor via role-manager. 2. Re-login. 3. `POST /ecommerce`. | HTTP 201. | Integration | |
| TC-API-EC-157 | Admin | Role-Manager-revoke: revoke Supervisor ecommerce:create → POST returns 403 | P1 | 1. Revoke. 2. Re-login. 3. `POST /ecommerce`. | HTTP 403. | Integration | |

---

## Section 24 — Transaction log correctness (both modules)

These integration TCs verify the `inventory_transactions` table after key operations.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-SMP-185 | Admin | Sample create (empty) writes SAMPLE_CREATED | P0 | 1. Create empty sample, note id. 2. `SELECT * FROM inventory_transactions WHERE metadata->>'sample_record_id'='<id>' AND transaction_type='SAMPLE_CREATED'`. | Exactly 1 row. | Integration | No-barcode path. |
| TC-API-SMP-186 | Admin | Sample create (with boxes) writes SAMPLE_CREATED + CHILD_SAMPLED per box | P0 | 1. Create sample with 3 boxes. 2. Query inventory_transactions. | 1×`SAMPLE_CREATED` + 3×`CHILD_SAMPLED` rows. | Integration | With-barcode path. |
| TC-API-SMP-187 | Admin | add-box writes CHILD_SAMPLED | P0 | 1. Add box to sample. 2. Query. | 1×`CHILD_SAMPLED` row with `child_box_id` matching. | Integration | |
| TC-API-SMP-188 | Admin | add-box GENERATED writes CHILD_ACTIVATED then CHILD_SAMPLED | P0 | 1. Add GENERATED box. 2. Query ordered by id. | `CHILD_ACTIVATED` row precedes `CHILD_SAMPLED` for same child_box_id. | Integration | |
| TC-API-SMP-189 | Admin | remove-box writes CHILD_UNSAMPLED | P0 | 1. Remove box. 2. Query. | 1×`CHILD_UNSAMPLED`. | Integration | |
| TC-API-SMP-190 | Admin | remove-box — last box writes CHILD_UNSAMPLED + SAMPLE_REOPENED | P0 | 1. Remove last box from ACTIVE sample. 2. Query. | 1×`CHILD_UNSAMPLED` + 1×`SAMPLE_REOPENED`. | Integration | |
| TC-API-SMP-191 | Admin | close writes SAMPLE_CLOSED | P0 | 1. Close sample. 2. Query. | 1×`SAMPLE_CLOSED`. | Integration | |
| TC-API-SMP-192 | Admin | dispatch writes SAMPLE_DISPATCHED + CHILD_DISPATCHED per foot | P0 | 1. Dispatch ACTIVE sample with 3 PAIR boxes. 2. Query. | 1×`SAMPLE_DISPATCHED` + 3×`CHILD_DISPATCHED` (each with `metadata.foot:"PAIR"`). | Integration | `_dispatchSample` shippedFeet loop. |
| TC-API-SMP-193 | Admin | full-unpack writes CHILD_UNSAMPLED per box | P0 | 1. Full-unpack sample with 3 boxes. 2. Query. | 3×`CHILD_UNSAMPLED`. | Integration | |
| TC-API-EC-185 | Admin | EC create (empty) writes ECOMMERCE_CREATED | P0 | 1. Create empty EC record. 2. Query `inventory_transactions` where `transaction_type='ECOMMERCE_CREATED'`. | 1 row written. | Integration | **Discrepancy D2: only empty-create path.** |
| TC-API-EC-186 | Admin | EC create (with boxes) does NOT write ECOMMERCE_CREATED | P0 | 1. Create EC record with 2 boxes. 2. Query for `ECOMMERCE_CREATED` with this record's notes/metadata. | **Zero** `ECOMMERCE_CREATED` rows for this record. 2×`CHILD_ECOMMERCED` rows exist. | Integration | **Discrepancy D2 confirmed.** |
| TC-API-EC-187 | Admin | add-box writes CHILD_ECOMMERCED | P0 | 1. Add box to EC. 2. Query. | 1×`CHILD_ECOMMERCED`. | Integration | |
| TC-API-EC-188 | Admin | scan-carton writes CHILD_UNPACKED + CHILD_ECOMMERCED per box | P0 | 1. Scan carton with 3 boxes. 2. Query. | 3×`CHILD_UNPACKED` + 3×`CHILD_ECOMMERCED`. CHILD_UNPACKED rows have `master_carton_id` set. | Integration | Two transactions per box in `scanCartonToEcommerce`. |
| TC-API-EC-189 | Admin | remove-box writes CHILD_UNECOMMERCED | P0 | 1. Remove box. 2. Query. | 1×`CHILD_UNECOMMERCED`. | Integration | |
| TC-API-EC-190 | Admin | remove-box — last box writes CHILD_UNECOMMERCED + ECOMMERCE_REOPENED | P0 | 1. Remove last box from ACTIVE EC. 2. Query. | 1×`CHILD_UNECOMMERCED` + 1×`ECOMMERCE_REOPENED`. | Integration | |
| TC-API-EC-191 | Admin | close writes ECOMMERCE_CLOSED | P0 | 1. Close EC. 2. Query. | 1×`ECOMMERCE_CLOSED`. | Integration | |
| TC-API-EC-192 | Admin | full-unpack writes CHILD_UNECOMMERCED per box | P0 | 1. Full-unpack EC with 3 boxes. 2. Query. | 3×`CHILD_UNECOMMERCED`. | Integration | |

---

## Automation Gap Recommendations

| Gap # | Description | Suggested spec file |
|---|---|---|
| AG-1 | **No Playwright API spec exists for `/samples/*` or `/ecommerce/*`** — referenced specs (`31-samples-module`, `32-ecommerce-module`) are web E2E only. A dedicated `frontend/e2e/43-api-samples-ecommerce.spec.ts` (Playwright `request` context) should cover all sections in this phase. | `43-api-samples-ecommerce.spec.ts` |
| AG-2 | **Foot-split spec (`38-sample-foot-split.spec.ts`) flagged as AUTOMATION GAP in Track A** — the API contract equivalent (sections 11–12) is equally absent. Recommend creating a focused `43a-api-foot-split.spec.ts` with the 13 foot-split TCs (TC-API-SMP-140…152) and 6 last-foot dispatch TCs (TC-API-SMP-160…165). | `43a-api-foot-split.spec.ts` |
| AG-3 | **DB-level unique-index race test (TC-API-SMP-146)** cannot reliably be exercised via HTTP API alone. Recommend a direct psql/DB migration test asserting the `idx_unique_active_sample_foot` constraint rejects the duplicate row. | DB constraint test in `jest` suite |
| AG-4 | **`ECOMMERCE_CREATED` asymmetry (Discrepancy D2)** has no existing test in any spec. TC-API-EC-186 requires a DB-level query. Recommend adding to `43-api-samples-ecommerce.spec.ts` as an integration assertion querying `inventory_transactions`. | `43-api-samples-ecommerce.spec.ts` |
| AG-5 | **Foot-split API spec** — there is no published spec document `37-sample-foot-split` that defines the API contract for `box_feet` in `POST /samples` or `foot` in `POST /samples/add-box`. Recommend creating `docs/specs/37-sample-foot-split-api.md` to give Playwright automation a formal reference. | New spec document |

---

*Phase 43 authored 2026-06-09 (Track B). Ground truth: source code as of commit `65f53f1`.*
