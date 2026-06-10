# Phase 11 — Sample Module

**Suite:** Binny Inventory Management System — Test Cases v3
**Module codes:** `TC-SMP-NNN` (core), `TC-SMP-FOOT-NNN` (foot-split)
**Phase dependencies:** Phase 04 (customers), Phase 07 (child box lifecycle); FREE/GENERATED boxes must exist.
**Playwright specs:** `frontend/e2e/31-samples-module.spec.ts` (spec-31), `frontend/e2e/37-sample-foot-field.spec.ts` (spec-37); foot-split section marked **AUTOMATION GAP** (new spec recommended: `38-sample-foot-split.spec.ts`).
**Last updated / refreshed:** 2026-06-09 (full rewrite — previous file dated 2026-04-30 was stale; foot model, foot-split, last-foot dispatch, conditional-free, RBAC permission gates all new)

---

## Table of Contents

1. [Shared Test Data Assumptions](#shared-test-data-assumptions)
2. [Section 1 — List / Search / Filter](#section-1--list--search--filter)
3. [Section 2 — Create sample (form + scan + box_feet + foot pre-check)](#section-2--create-sample)
4. [Section 3 — Add box to sample (POST /samples/add-box)](#section-3--add-box-to-sample)
5. [Section 4 — Remove box from sample (POST /samples/remove-box) — conditional-free](#section-4--remove-box-from-sample)
6. [Section 5 — Close sample (POST /samples/:id/close)](#section-5--close-sample)
7. [Section 6 — Full unpack (POST /samples/:id/full-unpack) — conditional-free](#section-6--full-unpack)
8. [Section 7 — Detail read (GET /samples/:id, /children, /assortment, /qr/:barcode)](#section-7--detail-read)
9. [Section 8 — FOOT-SPLIT (LEFT+RIGHT independently to different samples)](#section-8--foot-split)
10. [Section 9 — Last-foot dispatch (box→DISPATCHED only when last active foot leaves)](#section-9--last-foot-dispatch)
11. [Section 10 — Box-level count semantics (one-foot-sampled box = 1 SAMPLE box)](#section-10--box-level-count-semantics)
12. [Section 11 — Transaction log correctness](#section-11--transaction-log-correctness)
13. [Section 12 — Status transition integrity](#section-12--status-transition-integrity)
14. [Section 13 — RBAC: GET endpoints (auth-only — no permission gate, all roles read 200)](#section-13--rbac-get-endpoints)
15. [Section 14 — RBAC: write endpoints (Admin-only by default)](#section-14--rbac-write-endpoints)
16. [Section 15 — RBAC: Role-Manager-grant path (Supervisor granted samples:*)](#section-15--rbac-role-manager-grant-path)
17. [Section 16 — Frontend E2E: list page](#section-16--frontend-e2e-list-page)
18. [Section 17 — Frontend E2E: create page (foot selector + per-row override)](#section-17--frontend-e2e-create-page)
19. [Section 18 — Frontend E2E: detail page (foot column, add-box foot, assortment)](#section-18--frontend-e2e-detail-page)

---

## Shared Test Data Assumptions

| Symbol | Meaning |
|---|---|
| `CB_FREE_1..N` | FREE child boxes (already activated) |
| `CB_GEN_1` | GENERATED child box (barcode `CB_GEN_BAR`) |
| `CB_PACKED_1` | PACKED child box (inside a master carton) |
| `CB_ECOMMERCE_1` | Child box with status ECOMMERCE |
| `CB_DISPATCHED_1` | Child box with status DISPATCHED |
| `CB_SAMPLE_LEFT` | A FREE box whose LEFT foot is already in a live sample |
| `CB_SAMPLE_BOTH` | A FREE box already mapped as PAIR in a live sample |
| `SR_ACTIVE` | An ACTIVE sample record with ≥ 2 child boxes |
| `SR_CLOSED` | A CLOSED sample record with ≥ 1 child box |
| `SR_CREATED` | A CREATED (empty) sample record |
| `SR_DISPATCHED` | A DISPATCHED sample record |
| `SR_LEFT_LIVE` | An ACTIVE sample holding `CB_SPLIT_1` LEFT foot |
| `CB_SPLIT_1` | Box whose LEFT foot is in `SR_LEFT_LIVE`; RIGHT foot free |
| `CUSTOMER_UUID_A` | Existing customer "Ramesh Traders" |
| `SUPERVISOR_TOKEN` | Bearer token for a Supervisor user (default role, no samples:*) |
| `WH_OP_TOKEN` | Bearer token for a Warehouse Operator user |
| `DP_OP_TOKEN` | Bearer token for a Dispatch Operator user |
| `SUPERVISOR_GRANTED_TOKEN` | Supervisor token after Admin granted samples:* via Role Manager |
| API base | `http://localhost:5000/api/v1` |
| Barcode prefix (samples) | `SR######` (short barcode, 6 uppercase alphanumeric chars) |

---

## Section 1 — List / Search / Filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-001 | Admin | GET /samples returns paginated list with summary fields | P0 | 1. Login as Admin. 2. `GET /api/v1/samples`. | HTTP 200. Body: `{ data: [...], total: <n>, page: 1, limit: 25 }`. Each item contains: `id`, `sample_barcode`, `name`, `status`, `child_count`, `customer_id`, `customer_name` (or `customer_firm_name`), `recipient_name`, `creator_name`, `article_summary`, `colour_summary`, `size_summary`, `mrp_summary`, `created_at`. | API | spec-31 TC-SM-LIST-001 |
| TC-SMP-002 | Admin | GET /samples?status=ACTIVE returns only ACTIVE records | P1 | 1. `GET /api/v1/samples?status=ACTIVE`. | All items `status = "ACTIVE"`. HTTP 200. | API | spec-31 TC-SM-LIST-002 |
| TC-SMP-003 | Admin | GET /samples?status=CREATED returns only CREATED records | P1 | 1. `GET /api/v1/samples?status=CREATED`. | All items `status = "CREATED"`. | API | spec-31 TC-SM-LIST-002 |
| TC-SMP-004 | Admin | GET /samples?status=CLOSED returns only CLOSED records | P1 | 1. `GET /api/v1/samples?status=CLOSED`. | All items `status = "CLOSED"`. | API | |
| TC-SMP-005 | Admin | GET /samples?status=DISPATCHED returns only DISPATCHED records | P1 | 1. `GET /api/v1/samples?status=DISPATCHED`. | All items `status = "DISPATCHED"`. | API | |
| TC-SMP-006 | Admin | GET /samples?search=<name_substring> filters by name | P1 | 1. Create sample named `"Trade Fair Sample"`. 2. `GET /api/v1/samples?search=Trade+Fair`. | Returns rows whose `name` ILIKE `%Trade Fair%`. spec-31 TC-SM-LIST-003. | API | spec-31 |
| TC-SMP-007 | Admin | GET /samples?search=<barcode_substring> filters by barcode | P1 | 1. Create sample; note its `sample_barcode`. 2. `GET /api/v1/samples?search=<barcode_prefix>`. | Returns the matching sample. Both `name` and `sample_barcode` are searched (ILIKE). | API | Service: `sr.sample_barcode ILIKE $n OR sr.name ILIKE $n`. |
| TC-SMP-008 | Admin | GET /samples?customer_id=<uuid> filters by customer | P1 | 1. Create sample with `CUSTOMER_UUID_A`. 2. `GET /api/v1/samples?customer_id=<CUSTOMER_UUID_A>`. | All returned items have `customer_id = CUSTOMER_UUID_A`. | API | |
| TC-SMP-009 | Admin | GET /samples?page=2&limit=5 returns correct page | P1 | 1. Ensure ≥ 6 samples. 2. `GET /api/v1/samples?page=2&limit=5`. | `data.length ≤ 5`. Items not overlapping page 1. | API | |
| TC-SMP-010 | Admin | GET /samples with invalid status enum returns 400 | P0 | 1. `GET /api/v1/samples?status=INVALID`. | HTTP 400. Zod enum validation error. | API | sampleListQuerySchema enum gate. |
| TC-SMP-011 | Unauthenticated | GET /samples without auth returns 401 | P0 | 1. No Authorization header. 2. `GET /api/v1/samples`. | HTTP 401. | API | `router.use(authenticate)` first. |

---

## Section 2 — Create sample

### 2.1 — Role gates for creation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-020 | Admin | Admin creates empty sample — CREATED status, barcode generated | P0 | 1. Login as Admin. 2. `POST /api/v1/samples` body `{"name": "Trade Fair Sample 1"}`. | HTTP 201. `{ id: <uuid>, sample_barcode: "SR<6chars>", name: "Trade Fair Sample 1", status: "CREATED", child_count: 0, customer_id: null, recipient_name: null }`. `sample_barcode` matches `/^SR[0-9A-Z]{6}$/`. `inventory_transactions` row `SAMPLE_CREATED` with `metadata.sample_record_id` = new id. | Integration | spec-31 TC-SM-CREATE-001 |
| TC-SMP-021 | Admin | Admin creates sample with customer FK | P0 | 1. `POST /api/v1/samples` body `{"name": "Sample A", "customer_id": "<CUSTOMER_UUID_A>", "purpose": "Dealer review", "sample_date": "2026-04-30"}`. | HTTP 201. `customer_id = CUSTOMER_UUID_A`. `purpose = "Dealer review"`. `sample_date` populated. spec-31 TC-SM-CREATE-002. | API | |
| TC-SMP-022 | Admin | Admin creates sample with free-text recipient (no customer FK) | P0 | 1. `POST /api/v1/samples` body `{"name": "Sample B", "recipient_name": "Ravi Kumar"}`. | HTTP 201. `recipient_name = "Ravi Kumar"`. `customer_id = null`. spec-31 TC-SM-CREATE-003. | API | |
| TC-SMP-023 | Admin | Admin creates sample with initial child boxes — status ACTIVE | P0 | 1. Pre: 2 FREE boxes `CB_FREE_1` (barcode `CB_BAR_1`), `CB_FREE_2` (barcode `CB_BAR_2`). 2. `POST /api/v1/samples` body `{"name": "Sample C", "child_box_barcodes": ["CB_BAR_1","CB_BAR_2"]}`. | HTTP 201. `status = "ACTIVE"`. `child_count = 2`. Both boxes `status = "SAMPLE"`. `inventory_transactions`: 1 `SAMPLE_CREATED` + 2 `CHILD_SAMPLED`. | Integration | |
| TC-SMP-024 | Admin | Admin creates sample with GENERATED box — auto-activates | P0 | 1. Pre: `CB_GEN_1` is GENERATED. 2. `POST /api/v1/samples` body `{"name": "Sample D", "child_box_barcodes": ["<CB_GEN_BAR>"]}`. | HTTP 201. `status = "ACTIVE"`. `CB_GEN_1` status = SAMPLE. Transactions: `CHILD_ACTIVATED` then `CHILD_SAMPLED` in order for `CB_GEN_1`. | Integration | Mirror of master-carton auto-activate. |
| TC-SMP-025 | Supervisor | Supervisor cannot create sample (samples:create not seeded) | P0 | 1. Login as Supervisor. 2. `POST /api/v1/samples` body `{"name": "Sup Sample"}`. | HTTP 403. `{ message: "Required permission: samples:create" }`. No record created. | API | Seeds: Supervisor has 19 perms, none are samples:*. |
| TC-SMP-026 | Warehouse Operator | Warehouse Operator cannot create sample | P0 | 1. Login as WH Op. 2. `POST /api/v1/samples` body `{"name": "WH Sample"}`. | HTTP 403. Permission denied. No record created. spec-31 TC-SM-ROLE-002. | API | |
| TC-SMP-027 | Dispatch Operator | Dispatch Operator cannot create sample | P0 | 1. Login as Dispatch Op. 2. `POST /api/v1/samples` body `{"name": "DP Sample"}`. | HTTP 403. No record created. spec-31 TC-SM-ROLE-001. | API | |
| TC-SMP-028 | Unauthenticated | Unauthenticated cannot create sample | P0 | 1. No auth. 2. `POST /api/v1/samples` valid body. | HTTP 401. | API | |

### 2.2 — Create validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-030 | Admin | Create with missing name returns 400 | P0 | 1. `POST /api/v1/samples` body `{}`. | HTTP 400. "Name is required". | API | Zod `min(1)`. |
| TC-SMP-031 | Admin | Create with empty name (whitespace) returns 400 | P0 | 1. `POST /api/v1/samples` body `{"name": "   "}`. | HTTP 400. Zod `trim().min(1)` error. | API | |
| TC-SMP-032 | Admin | Create with name > 200 chars returns 400 | P1 | 1. `POST /api/v1/samples` body `{"name": "<201-char string>"}`. | HTTP 400. Zod `max(200)` error. | API | |
| TC-SMP-033 | Admin | Create with non-UUID customer_id returns 400 | P1 | 1. `POST /api/v1/samples` body `{"name": "X", "customer_id": "not-a-uuid"}`. | HTTP 400. Zod UUID validation error. | API | |
| TC-SMP-034 | Admin | Create with PACKED box returns 400 | P0 | 1. `CB_PACKED_1` has status PACKED. 2. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["<CB_PACKED_BAR>"]}`. | HTTP 400. Error contains "PACKED" and "cannot be added to a sample". No record created. | API | `assertFootAvailable` blocks PACKED. |
| TC-SMP-035 | Admin | Create with ECOMMERCE-status box returns 400 | P0 | 1. `CB_ECOMMERCE_1` has status ECOMMERCE. 2. Include in barcodes. | HTTP 400. Error contains "ECOMMERCE". | API | |
| TC-SMP-036 | Admin | Create with DISPATCHED box returns 400 | P0 | 1. `CB_DISPATCHED_1` has status DISPATCHED. 2. Include in barcodes. | HTTP 400. Error contains "DISPATCHED". | API | |
| TC-SMP-037 | Admin | Create with non-existent barcode returns 404 | P0 | 1. `POST /api/v1/samples` body `{"name": "X", "child_box_barcodes": ["CB000000"]}`. | HTTP 404. "Child box with barcode CB000000 not found". No record created. | API | Transaction rolls back. |
| TC-SMP-038 | Admin | Create with PAIR-sampled box returns 400 | P0 | 1. `CB_SAMPLE_BOTH` already mapped as PAIR in a live sample. 2. Include in barcodes without box_feet (defaults PAIR). | HTTP 400. `assertFootAvailable`: "already fully in a sample (as a pair)". | API | box_feet PAIR + active PAIR → rejected. |

### 2.3 — Create with box_feet (per-barcode foot override)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-040 | Admin | Create with box_feet assigns LEFT to specified barcode | P0 | 1. Pre: `CB_FREE_A` is FREE. 2. `POST /api/v1/samples` body `{"name": "Foot Create", "child_box_barcodes": ["<CB_FREE_A_BAR>"], "box_feet": {"<CB_FREE_A_BAR>": "LEFT"}}`. | HTTP 201. `sample_box_mapping` row for `CB_FREE_A` has `foot = 'LEFT'`. | Integration | Frontend sends `box_feet` record in createSample payload. |
| TC-SMP-041 | Admin | Create with box_feet assigns RIGHT to specified barcode | P0 | 1. `POST /api/v1/samples` with `"box_feet": {"<CB_FREE_B_BAR>": "RIGHT"}`. | HTTP 201. `sample_box_mapping` row has `foot = 'RIGHT'`. | Integration | |
| TC-SMP-042 | Admin | Create with box_feet missing entry defaults to PAIR | P0 | 1. Two barcodes in `child_box_barcodes`; `box_feet` only specifies one. Second barcode absent from `box_feet`. | HTTP 201. Second box mapping has `foot = 'PAIR'` (footMap lookup missing → default PAIR). | Integration | `footMap[bc] ?? 'PAIR'` in service. |
| TC-SMP-043 | Admin | Create with box_feet key case-insensitive (barcode uppercased) | P1 | 1. Send `box_feet` with lowercase barcode key `{"cb123456": "LEFT"}` (actual barcode uppercase `CB123456`). | HTTP 201. Foot correctly assigned. Service uppercases key: `bc.trim().toUpperCase()`. | Integration | |
| TC-SMP-044 | Admin | Create with box_feet PAIR rejected if box already has LEFT foot active | P0 | 1. `CB_SPLIT_1` has LEFT foot in `SR_LEFT_LIVE`. 2. `POST /api/v1/samples` with `CB_SPLIT_1_BAR` in barcodes, no `box_feet` (defaults PAIR). | HTTP 400. `assertFootAvailable`: "already has its left foot in a sample; cannot add the whole pair". No record created. | Integration | Foot-split guard: PAIR request blocked when any foot is active. |
| TC-SMP-045 | Admin | Create with box_feet RIGHT allowed if box already has LEFT active | P0 | 1. `CB_SPLIT_1` has LEFT foot in `SR_LEFT_LIVE`; box status = SAMPLE. 2. `POST /api/v1/samples` with `CB_SPLIT_1_BAR` and `box_feet: {"CB_SPLIT_1_BAR": "RIGHT"}`. | HTTP 201. New sample created. `CB_SPLIT_1` mapping in new sample has `foot = 'RIGHT'`. Box status remains SAMPLE. | Integration | SAMPLE box addable for its OTHER free foot. |
| TC-SMP-046 | Admin | Frontend create page: foot selector defaults to Pair | P0 | 1. Navigate to `/samples/create`. 2. Observe dispatch-unit selector. | "Pair" button selected (highlighted navy) by default. | E2E | spec-37 TC-SMFT-UI related; `selectedFoot` state initialized to `'PAIR'`. |
| TC-SMP-047 | Admin | Frontend create page: selecting Left foot tags next scan | P0 | 1. On `/samples/create`, click "Left foot" button. 2. Scan/enter `CB_FREE_A_BAR`. | `footByBarcode[CB_FREE_A_BAR] = 'LEFT'`. Row shows "L" selector highlighted. On submit, `box_feet` payload includes `{"CB_FREE_A_BAR": "LEFT"}`. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-048 | Admin | Frontend create page: per-row foot override (L/R toggle per scanned item) | P0 | 1. Scan box with Pair selected → appears with "Pair" selected. 2. Click "R" on that row's per-row selector. | `footByBarcode` entry updates to `'RIGHT'` for that barcode. On submit, `box_feet` reflects override. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-049 | Admin | Frontend create page: foot pre-check rejects PAIR request when box has LEFT active | P0 | 1. On `/samples/create`, foot selector = "Pair". 2. Scan `CB_SPLIT_1_BAR` (box has LEFT active). | `checkFootAvailability` returns `{ ok: false }`. `toast.error` shown. Box removed from scan list. No duplicate in `scannedItems`. | E2E | AUTOMATION GAP — spec-38 needed. `checkFootAvailability` in `lib/sampleFoot.ts`. |
| TC-SMP-050 | Admin | Frontend create page: foot pre-check allows RIGHT for box with LEFT active | P0 | 1. Foot selector = "Right foot". 2. Scan `CB_SPLIT_1_BAR`. | `checkFootAvailability` returns `{ ok: true }`. Box added to list with "R" selected. Toast shows "(Right foot)". | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-051 | Admin | Frontend create page: foot pre-check rejects same-foot for box already in sample with RIGHT | P0 | 1. Box `CB_SPLIT_R` has RIGHT active. Foot selector = "Right foot". 2. Scan `CB_SPLIT_R_BAR`. | `checkFootAvailability`: "The right foot of box CB_SPLIT_R_BAR is already in a sample". Box rejected. | E2E | AUTOMATION GAP — spec-38 needed. |

---

## Section 3 — Add box to sample

### 3.1 — Happy paths

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-060 | Admin | Add FREE box to ACTIVE sample — defaults to PAIR | P0 | 1. Pre: `SR_ACTIVE` is ACTIVE, `CB_FREE_NEW` is FREE. 2. `POST /api/v1/samples/add-box` body `{"child_box_id": "<CB_FREE_NEW_UUID>", "sample_record_id": "<SR_ACTIVE_UUID>"}` (no `foot`). | HTTP 200. `{ sample: { status: "ACTIVE", child_count: <prev+1> }, mapping: { foot: "PAIR", is_active: true } }`. Box status = SAMPLE. `CHILD_SAMPLED` transaction. spec-31 TC-SM-BOX-001. | Integration | Zod default: `foot: z.enum(...).default('PAIR')`. |
| TC-SMP-061 | Admin | Add FREE box to CREATED sample — sample transitions CREATED→ACTIVE | P0 | 1. Pre: `SR_CREATED` is CREATED (child_count = 0), `CB_FREE_A` is FREE. 2. Add-box. | HTTP 200. `sample.status = "ACTIVE"`. `sample.child_count = 1`. | Integration | |
| TC-SMP-062 | Admin | Add GENERATED box — auto-activates, then SAMPLE | P0 | 1. Pre: `CB_GEN_2` is GENERATED, `SR_ACTIVE` is ACTIVE. 2. Add-box (no foot → PAIR). | HTTP 200. `CB_GEN_2` status = SAMPLE. Transactions ordered: `CHILD_ACTIVATED` then `CHILD_SAMPLED`. | Integration | spec-31 TC-SM-BOX-001 (implicit). |
| TC-SMP-063 | Admin | Add box with foot=LEFT records LEFT | P0 | 1. `POST /api/v1/samples/add-box` body `{..., "foot": "LEFT"}`. | HTTP 200. `mapping.foot = "LEFT"`. DB `sample_box_mapping` row `foot = 'LEFT'`. Box status = SAMPLE. spec-37 TC-SMFT-ADD-001. | Integration | |
| TC-SMP-064 | Admin | Add box with foot=RIGHT records RIGHT | P0 | 1. `POST /api/v1/samples/add-box` body `{..., "foot": "RIGHT"}`. | HTTP 200. `mapping.foot = "RIGHT"`. spec-37 TC-SMFT-ADD-002. | Integration | |
| TC-SMP-065 | Admin | Add box with explicit foot=PAIR records PAIR | P1 | 1. `POST /api/v1/samples/add-box` body `{..., "foot": "PAIR"}`. | HTTP 200. `mapping.foot = "PAIR"`. spec-37 TC-SMFT-ADD-003. | API | |
| TC-SMP-066 | Admin | Add box without foot field defaults to PAIR | P0 | 1. Omit `foot` from body. | HTTP 200. `mapping.foot = "PAIR"`. spec-37 TC-SMFT-ADD-004. | API | |

### 3.2 — Add-box validation / guard errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-067 | Admin | Add box to CLOSED sample returns 400 | P0 | 1. `SR_CLOSED`. 2. `POST /api/v1/samples/add-box` with FREE box. | HTTP 400. "Sample record is CLOSED and cannot accept new child boxes". | API | |
| TC-SMP-068 | Admin | Add box to DISPATCHED sample returns 400 | P0 | 1. `SR_DISPATCHED`. 2. Add-box. | HTTP 400. "Sample record is DISPATCHED and cannot accept new child boxes". | API | |
| TC-SMP-069 | Admin | Add PACKED box returns 400 | P0 | 1. `CB_PACKED_1` is PACKED. 2. Add to sample. | HTTP 400. "CB_PACKED_1_BAR is currently PACKED and cannot be added". spec-31 TC-SM-BOX-004. | API | |
| TC-SMP-070 | Admin | Add ECOMMERCE-status box returns 400 | P0 | 1. `CB_ECOMMERCE_1` status ECOMMERCE. 2. Add to sample. | HTTP 400. "ECOMMERCE and cannot be added". | API | |
| TC-SMP-071 | Admin | Add DISPATCHED-status box returns 400 | P0 | 1. `CB_DISPATCHED_1` status DISPATCHED. 2. Add to sample. | HTTP 400. "DISPATCHED and cannot be added". | API | |
| TC-SMP-072 | Admin | Add PAIR-sampled box (fully allocated) returns 400 | P0 | 1. `CB_SAMPLE_BOTH` mapped as PAIR in another live sample. 2. Add to `SR_ACTIVE` with no foot. | HTTP 400. "already fully in a sample (as a pair)". | API | `activeFeet.includes('PAIR')` guard. |
| TC-SMP-073 | Admin | Add box with invalid foot value returns 400 | P0 | 1. `POST /api/v1/samples/add-box` body `{..., "foot": "BOTH"}`. | HTTP 400. Zod enum validation error. spec-37 TC-SMFT-ADD-005. | API | Valid: `['LEFT','RIGHT','PAIR']`. |
| TC-SMP-074 | Admin | Add non-existent child box returns 404 | P1 | 1. `child_box_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "Child box not found". | API | |
| TC-SMP-075 | Admin | Add box to non-existent sample returns 404 | P1 | 1. Valid box id, `sample_record_id = "00000000-0000-0000-0000-000000000000"`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-076 | Admin | Add box with non-UUID ids returns 400 | P1 | 1. `POST /api/v1/samples/add-box` body `{"child_box_id": "bad", "sample_record_id": "bad"}`. | HTTP 400. Zod UUID validation errors for both fields. | API | |

### 3.3 — Role gates for add-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-077 | Supervisor | Supervisor cannot add box (403) | P0 | 1. Valid add-box request with `SUPERVISOR_TOKEN`. | HTTP 403. "Required permission: samples:update". Box status unchanged. spec-31 TC-SM-ROLE-003 (implicit). | API | |
| TC-SMP-078 | Warehouse Operator | Warehouse Operator cannot add box (403) | P0 | 1. Valid add-box request with `WH_OP_TOKEN`. | HTTP 403. "Required permission: samples:update". | API | |
| TC-SMP-079 | Dispatch Operator | Dispatch Operator cannot add box (403) | P0 | 1. Valid request with `DP_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-080 | Unauthenticated | Unauthenticated cannot add box (401) | P0 | 1. No auth. | HTTP 401. | API | |

---

## Section 4 — Remove box from sample

### 4.1 — Happy paths (conditional-free logic)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-090 | Admin | Remove box from ACTIVE sample — box returns to FREE | P0 | 1. Pre: `CB_SAMPLE_A` (PAIR mapping) in `SR_ACTIVE`. 2. `POST /api/v1/samples/remove-box` body `{"child_box_id": "<CB_SAMPLE_A_UUID>", "sample_record_id": "<SR_ACTIVE_UUID>"}`. | HTTP 200. `sample.status = "ACTIVE"`. `sample.child_count` decremented. `CB_SAMPLE_A` status = FREE. Mapping `is_active = false`, `unmapped_at` populated. `CHILD_UNSAMPLED` transaction. spec-31 TC-SM-BOX-002. | Integration | Conditional-free: no active feet remain → FREE. |
| TC-SMP-091 | Admin | Remove last box from ACTIVE sample — sample→CREATED, SAMPLE_REOPENED | P0 | 1. `SR_ACTIVE` has `child_count = 1`. 2. Remove that box. | HTTP 200. `sample.status = "CREATED"`. `child_count = 0`. Box = FREE. Transactions: `CHILD_UNSAMPLED` + `SAMPLE_REOPENED` (both for this sample). spec-31 TC-SM-BOX-003. | Integration | `newChildCount === 0 && status === ACTIVE → CREATED`. |
| TC-SMP-092 | Admin | Remove from CLOSED sample — allowed | P1 | 1. `SR_CLOSED` has boxes. 2. Remove one box. | HTTP 200. Box = FREE. `child_count` decremented. Sample status remains CLOSED. `CHILD_UNSAMPLED` transaction. | Integration | Only DISPATCHED blocks remove. |
| TC-SMP-093 | Admin | Remove LEFT-foot box — box goes FREE (other foot not active anywhere) | P0 | 1. `CB_LEFT_ONLY` has only LEFT mapped in `SR_ACTIVE`, no other active feet. 2. Remove-box. | HTTP 200. Conditional-free check: `getActiveSampleFeet` returns empty after deactivation → `child_boxes.status = FREE`. | Integration | Service: `remainingFeet.length === 0 → FREE`. |
| TC-SMP-094 | Admin | Remove LEFT-foot box — box stays SAMPLE (RIGHT still active in another sample) | P0 | 1. `CB_SPLIT_1` has LEFT in `SR_ACTIVE_1` and RIGHT in `SR_ACTIVE_2`. 2. Remove LEFT foot from `SR_ACTIVE_1`. | HTTP 200. After deactivation: `getActiveSampleFeet` returns `['RIGHT']` (still active). `CB_SPLIT_1` status remains SAMPLE (not flipped to FREE). | Integration | **Foot-split conditional-free**: box stays SAMPLE while any foot is still active. |

### 4.2 — Remove-box errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-095 | Admin | Remove from DISPATCHED sample returns 400 | P0 | 1. `SR_DISPATCHED`. 2. Remove request. | HTTP 400. "Cannot remove a child box from a dispatched sample". | API | |
| TC-SMP-096 | Admin | Remove box not mapped to sample returns 404 | P1 | 1. `CB_FREE_1` is FREE (not in the sample). 2. `POST /api/v1/samples/remove-box` with `SR_ACTIVE`. | HTTP 404. "Active mapping not found for this child box and sample record". | API | Partial index prevents false positives. |

### 4.3 — Role gates for remove-box

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-097 | Supervisor | Supervisor cannot remove box (403) | P0 | 1. Valid remove-box request with `SUPERVISOR_TOKEN`. | HTTP 403. "Required permission: samples:update". | API | |
| TC-SMP-098 | Warehouse Operator | Warehouse Operator cannot remove box (403) | P0 | 1. `WH_OP_TOKEN`. Valid request. | HTTP 403. | API | |
| TC-SMP-099 | Dispatch Operator | Dispatch Operator cannot remove box (403) | P0 | 1. `DP_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-100 | Unauthenticated | Unauthenticated cannot remove box (401) | P0 | 1. No auth. | HTTP 401. | API | |

---

## Section 5 — Close sample

### 5.1 — Happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-110 | Admin | Admin closes ACTIVE sample | P0 | 1. `SR_ACTIVE` has ≥ 1 box. 2. `POST /api/v1/samples/<SR_ACTIVE>/close`. | HTTP 200. `{ id: ..., status: "CLOSED", closed_at: <ISO timestamp> }`. `closed_at` non-null. `SAMPLE_CLOSED` transaction. spec-31 TC-SM-CLOSE-001. | Integration | |

### 5.2 — Close errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-111 | Admin | Close already-CLOSED sample returns 400 | P0 | 1. `SR_CLOSED`. 2. `POST /samples/<SR_CLOSED>/close`. | HTTP 400. "Sample record is already closed". spec-31 TC-SM-CLOSE-002 (handles 400 or no-op). | API | Service: explicit guard. |
| TC-SMP-112 | Admin | Close DISPATCHED sample returns 400 | P0 | 1. `SR_DISPATCHED`. 2. Close. | HTTP 400. "Cannot close a dispatched sample". | API | |
| TC-SMP-113 | Admin | Close CREATED (empty) sample returns 400 | P0 | 1. `SR_CREATED` child_count = 0. 2. Close. | HTTP 400. "Cannot close an empty sample record". | API | |
| TC-SMP-114 | Admin | Close non-existent sample returns 404 | P1 | 1. `POST /samples/00000000-0000-0000-0000-000000000000/close`. | HTTP 404. "Sample record not found". | API | |

### 5.3 — Role gates for close

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-115 | Supervisor | Supervisor cannot close sample (403) | P0 | 1. `SUPERVISOR_TOKEN`. Valid close request. | HTTP 403. "Required permission: samples:update". spec-31 TC-SM-ROLE-003. | API | |
| TC-SMP-116 | Warehouse Operator | Warehouse Operator cannot close sample (403) | P0 | 1. `WH_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-117 | Dispatch Operator | Dispatch Operator cannot close sample (403) | P0 | 1. `DP_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-118 | Unauthenticated | Unauthenticated cannot close sample (401) | P0 | 1. No auth. | HTTP 401. | API | |

---

## Section 6 — Full unpack

### 6.1 — Happy paths (conditional-free logic)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-130 | Admin | Full-unpack ACTIVE sample — all PAIR boxes FREE, sample→CREATED | P0 | 1. `SR_ACTIVE` has 3 PAIR-mapped boxes. 2. `POST /api/v1/samples/<SR_ACTIVE>/full-unpack`. | HTTP 200. `{ status: "CREATED", child_count: 0 }`. All 3 boxes FREE. All 3 mappings `is_active = false`, `unmapped_at` populated. 3 `CHILD_UNSAMPLED` transactions. spec-31 TC-SM-UNPACK-001. | Integration | |
| TC-SMP-131 | Admin | Full-unpack CLOSED sample — releases boxes | P1 | 1. `SR_CLOSED` has 2 boxes. 2. Full-unpack. | HTTP 200. `status = "CREATED"`. `child_count = 0`. Both boxes FREE. | Integration | CLOSED → CREATED. Only DISPATCHED is blocked. |
| TC-SMP-132 | Admin | Full-unpack ACTIVE sample with foot-split box — box stays SAMPLE if other foot live | P0 | 1. `SR_ACTIVE` contains `CB_SPLIT_1` (LEFT foot); `CB_SPLIT_1` also has RIGHT foot in live `SR_ACTIVE_2`. 2. Full-unpack `SR_ACTIVE`. | HTTP 200. `CB_SPLIT_1` LEFT mapping deactivated. But `getActiveSampleFeet` returns `['RIGHT']` after deactivation → `CB_SPLIT_1` status remains SAMPLE (conditional-free). `CHILD_UNSAMPLED` transaction logged for LEFT foot. | Integration | Conditional-free in `fullUnpackSample`: per-mapping `remainingFeet.length === 0` check. |

### 6.2 — Full-unpack errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-133 | Admin | Full-unpack DISPATCHED sample returns 400 | P0 | 1. `SR_DISPATCHED`. 2. Full-unpack. | HTTP 400. "Cannot unpack a dispatched sample". | API | |
| TC-SMP-134 | Admin | Full-unpack CREATED (empty) sample returns 400 | P0 | 1. `SR_CREATED` child_count = 0. 2. Full-unpack. | HTTP 400. "Cannot unpack an empty sample record". | API | Service: CREATED status check before fetching mappings. |

### 6.3 — Role gates for full-unpack

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-135 | Supervisor | Supervisor cannot full-unpack (403) | P0 | 1. `SUPERVISOR_TOKEN`. Valid full-unpack. | HTTP 403. "Required permission: samples:update". | API | |
| TC-SMP-136 | Warehouse Operator | Warehouse Operator cannot full-unpack (403) | P0 | 1. `WH_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-137 | Dispatch Operator | Dispatch Operator cannot full-unpack (403) | P0 | 1. `DP_OP_TOKEN`. | HTTP 403. | API | |
| TC-SMP-138 | Unauthenticated | Unauthenticated cannot full-unpack (401) | P0 | 1. No auth. | HTTP 401. | API | |

---

## Section 7 — Detail read

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-150 | Admin | GET /samples/:id returns record with child_boxes including foot | P0 | 1. Sample has 3 boxes: one PAIR, one LEFT, one RIGHT. 2. `GET /api/v1/samples/<SR_ACTIVE>`. | HTTP 200. `child_boxes` array length = child_count. Each mapping includes `foot` field matching stored value: `"PAIR"`, `"LEFT"`, `"RIGHT"`. spec-37 TC-SMFT-ADD-001 confirms foot in child_boxes. | API | `getSampleChildren` query returns full `sbm.*` including `foot`. |
| TC-SMP-151 | Admin | GET /samples/:id/children returns only active mappings with foot | P0 | 1. Sample has 2 active + 1 inactive (removed) mapping. 2. `GET /api/v1/samples/<SR_ID>/children`. | HTTP 200. Array of 2 items. Each: `child_box_id`, `barcode`, `status`, `article_name`, `article_code`, `sku`, `size`, `colour`, `mrp`, `mapped_at`, `is_active = true`, `foot`. Inactive mapping absent. | API | |
| TC-SMP-152 | Admin | GET /samples/:id/assortment returns grouped count | P0 | 1. Sample has 2 Size-6 Blue + 1 Size-7 Red. 2. `GET /api/v1/samples/<SR_ID>/assortment`. | HTTP 200. `[{ article_name, colour: "Blue", size: "6", mrp, count: 2 }, { article_name, colour: "Red", size: "7", mrp, count: 1 }]`. Ordered by `article_name, colour, size`. | API | Assortment counts active mappings only (`is_active = true`). |
| TC-SMP-153 | Admin | GET /samples/qr/:barcode returns record by barcode | P0 | 1. `GET /api/v1/samples/qr/<SR_BARCODE>`. | HTTP 200. `sample_barcode` matches. `child_boxes` present. | API | `getSampleByBarcode` uses `UPPER($1)`. |
| TC-SMP-154 | Admin | GET /samples/qr/NONEXISTENT returns 404 | P1 | 1. `GET /api/v1/samples/qr/SR000000`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-155 | Admin | GET /samples/non-existent returns 404 | P1 | 1. `GET /api/v1/samples/00000000-0000-0000-0000-000000000000`. | HTTP 404. "Sample record not found". | API | |
| TC-SMP-156 | Admin | GET /samples/non-UUID-id returns 400 | P1 | 1. `GET /api/v1/samples/not-a-uuid`. | HTTP 400. Zod UUID validation error. | API | `sampleIdParamSchema` validates `id`. |
| TC-SMP-157 | Admin | GET /samples/:id/assortment for non-existent id returns 404 | P1 | 1. `GET /api/v1/samples/00000000-0000-0000-0000-000000000000/assortment`. | HTTP 404. "Sample record not found". | API | `getSampleAssortment` checks existence first. |

---

## Section 8 — FOOT-SPLIT

> **What is foot-split?** A single child box (a physical pair of shoes) can have its LEFT foot allocated to sample A and its RIGHT foot allocated to sample B, independently. Each allocation is a separate `sample_box_mapping` row. The unique index `idx_unique_active_sample_foot` enforces `(child_box_id, foot) WHERE is_active = true` — so a box can hold at most one active LEFT and one active RIGHT mapping.

### 8.1 — Creating split mappings

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-FOOT-001 | Admin | Add box LEFT foot to sample A, RIGHT foot to sample B independently | P0 | 1. Pre: `CB_SPLIT_1` is FREE. 2. `POST /samples/add-box` body `{child_box_id: <CB_SPLIT_1_UUID>, sample_record_id: <SR_A_UUID>, foot: "LEFT"}`. 3. `POST /samples/add-box` body `{child_box_id: <CB_SPLIT_1_UUID>, sample_record_id: <SR_B_UUID>, foot: "RIGHT"}`. | Both return HTTP 200. `sample_box_mapping` has two active rows for `CB_SPLIT_1`: one `foot='LEFT'` with `sample_record_id=SR_A`, one `foot='RIGHT'` with `sample_record_id=SR_B`. `child_boxes.status = SAMPLE` (set on first allocation, unchanged on second). | Integration | AUTOMATION GAP — spec-38 recommended. |
| TC-SMP-FOOT-002 | Admin | After foot-split, box status is SAMPLE (counts as 1 box in SAMPLE) | P0 | 1. After step in TC-SMP-FOOT-001: `GET /child-boxes/<CB_SPLIT_1_UUID>`. | HTTP 200. `status = "SAMPLE"`. Exactly 1 child box with `status = SAMPLE` (not 2). | API | **Box-level count rule** — one box = 1 SAMPLE entry regardless of how many feet are allocated. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-003 | Admin | Foot-split: adding PAIR rejected when LEFT already active | P0 | 1. `CB_SPLIT_1` has LEFT active in sample A. 2. `POST /samples/add-box` body `{child_box_id: <CB_SPLIT_1>, sample_record_id: <SR_B>, foot: "PAIR"}`. | HTTP 400. "already has its left foot in a sample; cannot add the whole pair". | API | `assertFootAvailable`: PAIR request + any active foot → rejected. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-004 | Admin | Foot-split: adding same foot twice rejected (unique index) | P0 | 1. `CB_SPLIT_1` has LEFT active in sample A. 2. `POST /samples/add-box` body `{..., foot: "LEFT"}` to sample C. | HTTP 400. `assertFootAvailable`: "The left foot of child box … is already in a sample". | API | Service-layer guard before DB insert. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-005 | Admin | Foot-split: adding PAIR to box with both feet free succeeds | P0 | 1. `CB_FRESH` is FREE with no active sample feet. 2. `POST /samples/add-box` body `{..., foot: "PAIR"}`. | HTTP 200. `mapping.foot = "PAIR"`. No conflict. | API | `activeFeet.length === 0` → PAIR allowed. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-006 | Admin | Foot-split: PAIR rejected if box has PAIR mapping active | P0 | 1. `CB_SAMPLE_BOTH` has PAIR active. 2. `POST /samples/add-box` body `{..., foot: "PAIR"}`. | HTTP 400. "already fully in a sample (as a pair)". `activeFeet.includes('PAIR')` → reject. | API | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-007 | Admin | Foot-split: LEFT rejected if box has PAIR mapping active | P0 | 1. `CB_SAMPLE_BOTH` has PAIR active. 2. `POST /samples/add-box` body `{..., foot: "LEFT"}`. | HTTP 400. "already fully in a sample (as a pair)". | API | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-008 | Admin | getChildBoxByQR returns active_sample_feet for foot-split detection | P0 | 1. `CB_SPLIT_1` has LEFT active. 2. `GET /api/v1/child-boxes/qr/<CB_SPLIT_1_BARCODE>` (or `getByBarcode`). | HTTP 200. `active_sample_feet = ['LEFT']`. This field enables the frontend `checkFootAvailability` pre-check without a round-trip. | API | `childBox.service.ts` `getChildBoxByQR` includes `COALESCE(ARRAY(SELECT sbm.foot …), '{}') AS active_sample_feet`. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-009 | Admin | Foot-split: both feet allocated → active_sample_feet = ['LEFT','RIGHT'] | P0 | 1. `CB_SPLIT_1` has both LEFT and RIGHT active. 2. `GET /child-boxes/qr/<CB_SPLIT_1_BARCODE>`. | HTTP 200. `active_sample_feet` contains both `'LEFT'` and `'RIGHT'`. | API | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-010 | Admin | Create sample via box_feet with foot-split: box with LEFT active accepts RIGHT in box_feet | P0 | 1. `CB_SPLIT_1` has LEFT in another live sample. 2. `POST /api/v1/samples` with `child_box_barcodes: [CB_SPLIT_1_BAR]` and `box_feet: {CB_SPLIT_1_BAR: "RIGHT"}`. | HTTP 201. New sample created. `CB_SPLIT_1` RIGHT mapping recorded. Box status = SAMPLE. | Integration | AUTOMATION GAP — spec-38 needed. |

### 8.2 — Removing split feet (conditional-free)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-FOOT-020 | Admin | Remove LEFT from sample A: box stays SAMPLE because RIGHT still active in B | P0 | 1. `CB_SPLIT_1` has LEFT in `SR_A`, RIGHT in `SR_B` (both live). 2. `POST /samples/remove-box` body `{child_box_id: <CB_SPLIT_1>, sample_record_id: <SR_A>}`. | HTTP 200. LEFT mapping `is_active = false`. `getActiveSampleFeet` returns `['RIGHT']` → `child_boxes.status` remains SAMPLE (NOT flipped to FREE). `CHILD_UNSAMPLED` transaction logged. | Integration | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-021 | Admin | Remove RIGHT from sample B (last active foot): box now FREE | P0 | 1. After TC-SMP-FOOT-020: `CB_SPLIT_1` has only RIGHT active in `SR_B`. 2. `POST /samples/remove-box` body `{child_box_id: <CB_SPLIT_1>, sample_record_id: <SR_B>}`. | HTTP 200. RIGHT mapping `is_active = false`. `getActiveSampleFeet` returns `[]` → `child_boxes.status = FREE`. | Integration | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-022 | Admin | Full-unpack of sample containing split-foot box: box stays SAMPLE if other sample still live | P0 | 1. `SR_A` contains `CB_SPLIT_1` LEFT. `CB_SPLIT_1` RIGHT in live `SR_B`. 2. `POST /samples/<SR_A>/full-unpack`. | HTTP 200. `CB_SPLIT_1` LEFT mapping deactivated. `remainingFeet = ['RIGHT']` → `CB_SPLIT_1` stays SAMPLE. | Integration | AUTOMATION GAP — spec-38 needed. |

---

## Section 9 — Last-foot dispatch

> **Rule:** When dispatching a sample, a box is flipped to DISPATCHED only if **this sample holds its last active foot**. If the box's other foot is still in another live (non-DISPATCHED) sample, the box remains SAMPLE until that other sample dispatches too.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-FOOT-030 | Admin | Dispatch sample with PAIR-only boxes — all boxes → DISPATCHED | P0 | 1. `SR_CLOSED` has 2 PAIR boxes. 2. `POST /dispatches` body `{sample_record_id: <SR_CLOSED>, destination: "Jaipur"}`. | HTTP 201. Both boxes → DISPATCHED. `SR_CLOSED.status = "DISPATCHED"`. `SAMPLE_DISPATCHED` + 2 `CHILD_DISPATCHED` transactions. spec-31 TC-SM-DISPATCH-001. | Integration | Standard dispatch (no split). |
| TC-SMP-FOOT-031 | Admin | Dispatch sample with split box: box→DISPATCHED only when last foot dispatches | P0 | 1. `CB_SPLIT_1` LEFT in `SR_A` (CLOSED), RIGHT in live `SR_B`. 2. Dispatch `SR_A`. | HTTP 201. `SR_A.status = "DISPATCHED"`. The `lastFootResult` query finds `CB_SPLIT_1` has another active foot in `SR_B` → `boxesToDispatch` does NOT include `CB_SPLIT_1`. `CB_SPLIT_1.status` remains SAMPLE. `CHILD_DISPATCHED` transaction logged for LEFT foot (it physically shipped), but box status still SAMPLE. | Integration | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-032 | Admin | After both split-sample dispatches: box finally → DISPATCHED | P0 | 1. Continuation of TC-SMP-FOOT-031. Now dispatch `SR_B` (which holds `CB_SPLIT_1` RIGHT). | HTTP 201. `SR_B.status = "DISPATCHED"`. Now `lastFootResult` finds `CB_SPLIT_1` has NO other active non-dispatched feet → `CB_SPLIT_1.status = "DISPATCHED"`. | Integration | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-FOOT-033 | Admin | Dispatch ACTIVE (not closed) sample succeeds | P1 | 1. `SR_ACTIVE` status ACTIVE with ≥ 1 box. 2. Dispatch. | HTTP 201. Service allows `status ∈ {ACTIVE, CLOSED}`. `SR_ACTIVE.status = "DISPATCHED"`. | Integration | `_dispatchSample`: `if (status !== CLOSED && status !== ACTIVE) → 400`. |
| TC-SMP-FOOT-034 | Admin | Dispatch CREATED sample returns 400 | P0 | 1. `SR_CREATED` status CREATED. 2. Dispatch. | HTTP 400. "Sample record must be in ACTIVE or CLOSED status for dispatch. Current status: CREATED". | API | |
| TC-SMP-FOOT-035 | Admin | Dispatch DISPATCHED sample returns 400 | P0 | 1. `SR_DISPATCHED`. 2. Dispatch. | HTTP 400. "must be in ACTIVE or CLOSED status". | API | |
| TC-SMP-FOOT-036 | Admin | Dispatch auto-fills destination from customer delivery_location | P1 | 1. `SR_CLOSED` has `customer_id = CUSTOMER_UUID_A`. Customer has `delivery_location = "Mumbai"`. 2. `POST /dispatches` body `{sample_record_id: <SR_CLOSED>}` (no `destination`). | HTTP 201. `dispatch_records.destination = "Mumbai"`. | Integration | `_dispatchSample` customer lookup. |
| TC-SMP-FOOT-037 | Supervisor | Supervisor cannot create dispatch (dispatch:create not seeded) | P0 | 1. Login as Supervisor. 2. `POST /dispatches` body with `sample_record_id`. | HTTP 403. (Supervisor only has dispatch:read.) | API | seeds: Supervisor has `dispatch:read` only. |
| TC-SMP-FOOT-038 | Dispatch Operator | Dispatch Operator can dispatch a sample | P0 | 1. Login as Dispatch Op. 2. `POST /dispatches` body `{sample_record_id: <SR_CLOSED>}`. | HTTP 201. Dispatch created. | API | Dispatch Op has `dispatch:create`. |
| TC-SMP-FOOT-039 | Warehouse Operator | Warehouse Operator cannot create dispatch (403) | P0 | 1. Login as WH Op. 2. `POST /dispatches` with sample_record_id. | HTTP 403. WH Op has no dispatch:create. | API | |

---

## Section 10 — Box-level count semantics

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-160 | Admin | One-foot-sampled box counts as 1 SAMPLE box (not 2) | P0 | 1. Record `COUNT(*)` of `child_boxes WHERE status = 'SAMPLE'` before. 2. Add `CB_FREE_X` LEFT foot to a sample. 3. Re-count. | Count increases by exactly 1. `CB_FREE_X.status = SAMPLE`. Only one row for this box. | Integration | Client-approved simplification: inventory/report counts stay box-level. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-161 | Admin | Two-foot-split box still counts as 1 SAMPLE box | P0 | 1. Add `CB_SPLIT_1` LEFT to sample A and RIGHT to sample B. 2. Count `child_boxes WHERE status = 'SAMPLE'`. | `CB_SPLIT_1` appears once, count +1 vs baseline. `sample_box_mapping` has 2 active rows for `CB_SPLIT_1` but it is still 1 physical box. | Integration | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-162 | Admin | SAMPLE boxes are excluded from pairsInStock | P0 | 1. Record `pairsInStock` for a product. 2. Add 5 boxes of that product to a sample (as PAIR foot). 3. Re-query stock. | `pairsInStock` decreases by 5. SAMPLE boxes excluded from available stock. | Integration | Verify via `GET /api/v1/inventory/stock` or stock hierarchy endpoint. |
| TC-SMP-163 | Admin | Removing box from sample restores pairsInStock | P1 | 1. Add 3 boxes to sample. Note pairsInStock. 2. Remove 1 box (it has no other active foot). 3. Re-query. | `pairsInStock` increases by 1. | Integration | |
| TC-SMP-164 | Admin | One-foot box: removing that foot restores pairsInStock | P1 | 1. Add `CB_LEFT_ONLY` LEFT foot to sample. Note pairsInStock (decreased by 1 on add). 2. Remove that LEFT foot. Box becomes FREE. 3. Re-query. | `pairsInStock` restores by 1. | Integration | AUTOMATION GAP — spec-38 needed. |

---

## Section 11 — Transaction log correctness

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-170 | Admin | Create sample writes SAMPLE_CREATED transaction | P0 | 1. Create sample. 2. Query `inventory_transactions WHERE transaction_type = 'SAMPLE_CREATED' AND metadata->>'sample_record_id' = '<NEW_ID>'`. | 1 row. `performed_by` = creator id. `notes` contains barcode. | Integration | |
| TC-SMP-171 | Admin | Add box writes CHILD_SAMPLED transaction | P0 | 1. Add box to sample. 2. Query `CHILD_SAMPLED` for that `child_box_id`. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-172 | Admin | Add GENERATED box writes CHILD_ACTIVATED then CHILD_SAMPLED | P0 | 1. Add GENERATED box. 2. Query transactions for that box, ordered by `created_at`. | Two rows: `CHILD_ACTIVATED` first, `CHILD_SAMPLED` second. | Integration | |
| TC-SMP-173 | Admin | Remove box writes CHILD_UNSAMPLED transaction | P0 | 1. Remove box. 2. Query `CHILD_UNSAMPLED` for that `child_box_id`. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-174 | Admin | Remove last box writes SAMPLE_REOPENED transaction | P0 | 1. Remove last box from ACTIVE sample. 2. Query `SAMPLE_REOPENED`. | 1 row with `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-175 | Admin | Close sample writes SAMPLE_CLOSED transaction | P0 | 1. Close sample. 2. Query `SAMPLE_CLOSED`. | 1 row. `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-176 | Admin | Full-unpack writes N × CHILD_UNSAMPLED | P0 | 1. Full-unpack sample with 4 boxes. 2. Count `CHILD_UNSAMPLED` for this sample's child boxes. | 4 rows. Each references a different `child_box_id`. All have `metadata->>'sample_record_id'` = sample id. | Integration | |
| TC-SMP-177 | Admin | Dispatch writes SAMPLE_DISPATCHED + CHILD_DISPATCHED per foot | P0 | 1. Dispatch sample with 2 boxes. 2. Query transactions. | 1 `SAMPLE_DISPATCHED` (no child_box_id). 2 `CHILD_DISPATCHED` rows (one per box). Each `CHILD_DISPATCHED` metadata has `foot` field. | Integration | `_dispatchSample`: logs per `shippedFeet` entry. |
| TC-SMP-178 | Admin | Foot-split dispatch logs CHILD_DISPATCHED for LEFT foot even when box stays SAMPLE | P0 | 1. Dispatch sample A (holds `CB_SPLIT_1` LEFT). `CB_SPLIT_1` stays SAMPLE (RIGHT still in B). 2. Query `CHILD_DISPATCHED` for `CB_SPLIT_1`. | 1 `CHILD_DISPATCHED` row. `metadata.foot = "LEFT"`. `child_boxes.status` still SAMPLE at time of log. | Integration | AUTOMATION GAP — spec-38 needed. |

---

## Section 12 — Status transition integrity

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-190 | Admin | Full lifecycle: CREATED → ACTIVE → CLOSED → DISPATCHED | P0 | 1. Create empty → CREATED. 2. Add box → ACTIVE. 3. Close → CLOSED. 4. Dispatch → DISPATCHED. | Each step transitions correctly. Boxes: FREE → SAMPLE → SAMPLE → DISPATCHED. | Integration | |
| TC-SMP-191 | Admin | Add box to DISPATCHED sample returns 400 | P0 | 1. Dispatched sample. 2. Add-box. | HTTP 400. "cannot accept new child boxes". | API | |
| TC-SMP-192 | Admin | Unique index `idx_unique_active_sample_foot` prevents duplicate active foot | P0 | 1. Add `CB_SPLIT_1` LEFT to sample A successfully. 2. Directly attempt to INSERT duplicate `(CB_SPLIT_1, LEFT)` active mapping (bypass service). | DB unique constraint violation for `(child_box_id='<CB_SPLIT_1>', foot='LEFT') WHERE is_active=true`. | Integration | Migration `20260609120001`. Service layer also prevents this at application level. |
| TC-SMP-193 | Admin | Rollback on mid-create error — no partial sample record | P0 | 1. Create sample with 3 barcodes where the 3rd barcode does not exist. | HTTP 404 for missing barcode. DB: no `sample_records` row inserted (transaction rolled back). | Integration | `BEGIN`/`ROLLBACK` wraps all inserts. |

---

## Section 13 — RBAC: GET endpoints (auth-only — no permission gate, all roles read 200)

> **Known discrepancy encoded as required behavior:** Sample GET endpoints (`GET /samples`, `GET /samples/:id`, `GET /samples/:id/children`, `GET /samples/:id/assortment`, `GET /samples/qr/:barcode`) have **no `authorizePermission` middleware** — only `authenticate`. Any authenticated user gets 200 regardless of whether their role has `samples:*`. The matrix says Admin-only, but the API does not enforce read restrictions. These TCs document actual behavior.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-200 | Admin | Admin can read all sample GET endpoints | P0 | 1. Login as Admin. GET list, GET by id, GET children, GET assortment, GET by barcode. | All return HTTP 200. | API | Expected per matrix. |
| TC-SMP-201 | Supervisor | Supervisor can read all sample GET endpoints (no permission gate) | P0 | 1. Login as Supervisor (default — no samples:*). GET list, GET by id, GET children, GET assortment. | All return HTTP 200. **Discrepancy:** RBAC matrix says Supervisor has no samples:* but GET routes are gated only by `authenticate`, not `authorizePermission`. | API | ⚠️ Matrix discrepancy — document actual behavior. spec-31 TC-SM-ROLE confirms write-deny; read allowed. |
| TC-SMP-202 | Warehouse Operator | Warehouse Operator can read all sample GET endpoints (no permission gate) | P0 | 1. Login as WH Op. GET list, GET by id, GET assortment. | All return HTTP 200. **Discrepancy:** WH Op has no `samples:*` but GET has no authorizePermission. | API | ⚠️ Matrix discrepancy — document actual behavior. spec-31 TC-SM-ROLE-002 confirms write-deny. |
| TC-SMP-203 | Dispatch Operator | Dispatch Operator can read all sample GET endpoints | P0 | 1. Login as Dispatch Op. GET list, GET by id. | All return HTTP 200. **Discrepancy:** same as above. | API | ⚠️ Matrix discrepancy — document actual behavior. |
| TC-SMP-204 | Unauthenticated | Unauthenticated cannot access any sample GET endpoint | P0 | 1. No auth. GET list, GET by id, GET children, GET assortment. | All return HTTP 401. `router.use(authenticate)` at top of sample.routes.ts. | API | |

---

## Section 14 — RBAC: write endpoints (Admin-only by default)

> All write routes (`POST /`, `/add-box`, `/remove-box`, `/:id/close`, `/:id/full-unpack`) use `authorizePermission('samples:create')` or `authorizePermission('samples:update')`. Admin role bypasses via super-admin check in `authorizePermission`. No seeded non-Admin role has any `samples:*` permission.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-210 | Admin | Admin has full write access to all sample endpoints | P0 | 1. Login as Admin. POST /samples, /add-box, /remove-box, /:id/close, /:id/full-unpack. | All succeed (2xx). Admin bypasses `authorizePermission` via `role_name === 'Admin'` check. | API | |
| TC-SMP-211 | Supervisor | Supervisor denied on all write endpoints (403 each) | P0 | 1. Login as Supervisor. 2. POST /samples → 403. 3. POST /add-box → 403. 4. POST /remove-box → 403. 5. POST /:id/close → 403. 6. POST /:id/full-unpack → 403. | Each returns HTTP 403. "Required permission: samples:create/update". spec-31 TC-SM-ROLE-001/002/003. | API | |
| TC-SMP-212 | Warehouse Operator | WH Op denied on all write endpoints (403 each) | P0 | 1. Login as WH Op. Same 5 operations. | Each returns HTTP 403. | API | |
| TC-SMP-213 | Dispatch Operator | Dispatch Op denied on all write endpoints (403 each) | P0 | 1. Login as Dispatch Op. Same 5 operations. | Each returns HTTP 403. | API | |

---

## Section 15 — RBAC: Role-Manager-grant path

> Admin can grant `samples:*` (or individual `samples:create`, `samples:update`, `samples:delete`) to any role via `/admin/roles` UI. Once granted, that role gains access to the corresponding endpoints without further configuration.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-220 | Admin→Supervisor | Grant Supervisor samples:create via Role Manager — Supervisor can then create sample | P0 | 1. Admin: navigate to `/admin/roles` → select Supervisor role → add permission `samples:create` → save. 2. Login as Supervisor. 3. `POST /api/v1/samples` body `{"name": "Sup Granted Sample"}`. | HTTP 201. Sample created. Supervisor's new `role_permissions` row with `(supervisor_role_id, 'samples:create', NULL)` used by `authorizePermission`. | Integration | Role Manager path. See A21 (phase-33) for full Role Manager tests. |
| TC-SMP-221 | Admin→Supervisor | Grant Supervisor samples:update — Supervisor can then add/remove boxes | P0 | 1. Admin grants Supervisor `samples:update`. 2. Supervisor: `POST /api/v1/samples/add-box` valid body. | HTTP 200. Box added. | Integration | |
| TC-SMP-222 | Admin→Supervisor | Revoke samples:create from Supervisor — Supervisor denied again | P1 | 1. Admin removes `samples:create` from Supervisor in Role Manager. 2. Supervisor re-logs in (new token). 3. `POST /api/v1/samples`. | HTTP 403. "Required permission: samples:create". | Integration | Revoking `role_permissions` row restores default behavior. |
| TC-SMP-223 | Supervisor (granted) | Supervisor with samples:* cannot bypass other permission gates | P1 | 1. Supervisor granted all `samples:*`. 2. Try `POST /api/v1/customers` (customers:create — not granted). | HTTP 403. samples:* grant does not affect other permission domains. | Integration | Permission grants are per-permission, not role-wide. |

---

## Section 16 — Frontend E2E: list page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-E2E-001 | Admin | Samples list page loads with header and table | P0 | 1. Login as Admin. 2. Navigate to `/samples`. | Heading "Samples" visible. Table/card list shows sample records. Create Sample button visible (canCreate via `useCan('samples:create')`). | E2E | spec-31 TC-SM-UI-001 |
| TC-SMP-E2E-002 | Admin | Status filter on list — shows only matching status | P1 | 1. On `/samples`, change status filter dropdown to "Active". | API call includes `status=ACTIVE`. List updates. Only ACTIVE samples shown. | E2E | spec-31 TC-SM-LIST-002 |
| TC-SMP-E2E-003 | Admin | Search filter by name — updates results | P1 | 1. Type unique sample name substring in search. | Debounced API call includes `search=<input>`. List updates. Matching samples shown. | E2E | spec-31 TC-SM-LIST-003 |
| TC-SMP-E2E-004 | Admin | Pagination: next/previous page buttons | P1 | 1. Create enough samples to exceed PAGE_SIZE. 2. On `/samples`, click Next. | Page 2 loads. Previous enabled. Page indicator updates. | E2E | |
| TC-SMP-E2E-005 | Supervisor | Supervisor sees list page (read allowed, no Create button) | P1 | 1. Login as Supervisor. 2. Navigate to `/samples`. | Page loads. Samples visible. **No Create Sample button** (Supervisor lacks `samples:create`). | E2E | `useCan('samples:create')` = false for Supervisor. AUTOMATION GAP — spec-38 needed for multi-role UI test. |
| TC-SMP-E2E-006 | Warehouse Operator | Warehouse Operator sees list page read-only | P1 | 1. Login as WH Op. 2. Navigate to `/samples`. | Page loads. No Create button. Read-only view. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-007 | Dispatch Operator | Dispatch Operator sees list page read-only | P1 | 1. Login as Dispatch Op. 2. Navigate to `/samples`. | Page loads. Read-only. No Create button. | E2E | AUTOMATION GAP — spec-38 needed. |

---

## Section 17 — Frontend E2E: create page (foot selector + per-row override)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-E2E-010 | Admin | Create page loads with all required fields | P0 | 1. Admin. Navigate to `/samples/create`. | Fields visible: Sample Name (required), Customer (dropdown), Recipient Name, Purpose, Sample Date, Notes. Scan Child Boxes section with dispatch-unit selector. spec-31 TC-SM-UI-002. | E2E | spec-31 |
| TC-SMP-E2E-011 | Admin | Dispatch-unit selector defaults to Pair | P0 | 1. On create page, observe dispatch-unit selector. | "Pair" button highlighted (navy). No foot buttons pre-selected for left/right. | E2E | `selectedFoot` state initialized `'PAIR'`. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-012 | Admin | Select Left foot then scan: box shows (Left foot) toast | P0 | 1. Click "Left foot" button. 2. Enter `CB_FREE_1_BAR` in HID scanner. | `toast.success` shows "(Left foot)". Box row appears with "L" per-row button selected. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-013 | Admin | Per-row foot override: change row from Pair to Right | P0 | 1. Scan box with Pair selected (row shows "P" selected). 2. Click "R" on that row. | `footByBarcode` updated to RIGHT for that barcode. Row "R" highlighted. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-014 | Admin | Submit with mixed feet: payload includes box_feet record | P0 | 1. Scan 3 boxes: first as Pair, second as Left, third as Right. 2. Fill name. Click Create. | `POST /samples` body contains `box_feet: { BAR2: "LEFT", BAR3: "RIGHT" }` (BAR1 absent or PAIR; missing entries default PAIR). HTTP 201. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-015 | Admin | Submit with empty name shows toast error, no API call | P0 | 1. Scan 1 box. Leave name empty. Click Create. | `toast.error('Sample name is required')` shown. No `POST /samples` request made. | E2E | Frontend guard: `if (!name.trim()) → toast.error`. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-016 | Admin | Submit with no boxes shows toast error | P0 | 1. Fill name. Do not scan. Click Create. | `toast.error('Scan at least one child box')` shown. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-017 | Admin | Scan same barcode twice: "Already scanned" toast, not duplicated | P1 | 1. Scan `CB_FREE_1_BAR`. 2. Scan `CB_FREE_1_BAR` again. | `toast.error('Already scanned')`. List shows only 1 entry. | E2E | `addItem` returns false on duplicate. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-018 | Supervisor | Supervisor cannot access `/samples/create` (403 on API, UI may redirect) | P1 | 1. Login as Supervisor. 2. Navigate to `/samples/create`. | Create Sample button absent on list page. Direct URL: if page renders, form submit returns 403 from API. | E2E | AUTOMATION GAP — spec-38 needed. |

---

## Section 18 — Frontend E2E: detail page (foot column, add-box foot, assortment)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-SMP-E2E-020 | Admin | Sample detail page loads with status badge and timeline | P0 | 1. Admin. Navigate to `/samples/<SR_ACTIVE>`. | Status badge "ACTIVE" visible. Timeline card shows Created/Closed/Dispatched dates. Child count shows. spec-31 TC-SM-UI-003. | E2E | spec-31 |
| TC-SMP-E2E-021 | Admin | Child boxes table shows Foot column with correct values | P0 | 1. Sample with 1 PAIR box, 1 LEFT box, 1 RIGHT box. 2. Navigate to detail page. | Desktop table shows "Foot" column header. Rows: "Pair" (muted text), "Left foot" (orange badge), "Right foot" (orange badge) respectively. | E2E | `(box.foot ?? 'PAIR') === 'PAIR'` conditional rendering in `[id]/page.tsx`. spec-37 TC-SMFT-UI related. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-022 | Admin | Add Box section shows foot selector (Pair/Left/Right) | P0 | 1. Admin on ACTIVE sample detail. Click "Add Box" button. | "Add Box" panel expands. Dispatch-unit selector shows "Pair", "Left foot", "Right foot" buttons. "Pair" selected by default. spec-37 TC-SMFT-UI-001. | E2E | spec-37 |
| TC-SMP-E2E-023 | Admin | Selecting Left foot then scanning sends foot=LEFT to API | P0 | 1. In Add Box section, click "Left foot". 2. Scan/enter `CB_FREE_2_BAR`. | `POST /api/v1/samples/add-box` called with `foot: "LEFT"`. Toast "(Left foot)". New row in table shows "Left foot" badge. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-024 | Admin | Add Box: foot pre-check rejects box already PAIR-sampled | P0 | 1. Enter barcode of `CB_SAMPLE_BOTH` (PAIR-sampled elsewhere). | Frontend `checkFootAvailability` (via `getByBarcode` with `active_sample_feet`) returns `{ ok: false }`. `toast.error` shown. Box not added. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-025 | Admin | Close Sample button visible on ACTIVE sample, hidden on CLOSED | P0 | 1. Admin on ACTIVE sample. 2. Observe action bar. | "Close Sample" button visible (`canClose = status === 'ACTIVE' && isManager`). Navigate to a CLOSED sample: button absent. | E2E | |
| TC-SMP-E2E-026 | Supervisor | Close Sample button visible for Supervisor on ACTIVE sample (isManager = true) | P1 | 1. Login as Supervisor. Navigate to ACTIVE sample detail. | "Close Sample" button IS visible (Supervisor is `isManager`). However, clicking it triggers `POST /close` → API returns 403 (Supervisor lacks `samples:update`). | E2E | ⚠️ **UI/API discrepancy**: `isManager` includes Supervisor so Close button shows, but the API will 403. Document as expected behavior (UI not permission-aware for this action). AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-027 | Warehouse Operator | Warehouse Operator sees read-only detail — no action buttons | P0 | 1. WH Op on sample detail page (ACTIVE sample). | Page loads. No "Close Sample", no "Add Box" shown (canClose = false because isManager = false; canAddBox is status-based but no write permission at API level). No "Full Unpack" triggerable. | E2E | `isManager = role === 'Admin' || role === 'Supervisor'`. WH Op = false → canClose = false. canAddBox logic is status-only (no role check). WH Op sees "Add Box" button but API returns 403. AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-028 | Dispatch Operator | Dispatch Operator sees read-only detail | P1 | 1. Dispatch Op. Navigate to sample detail. | Page loads. Status/timeline visible. Assortment visible. No operational buttons triggered. | E2E | AUTOMATION GAP — spec-38 needed. |
| TC-SMP-E2E-029 | Admin | Assortment Summary section shows grouped counts and total | P0 | 1. Sample with 2 Blue Size-6, 1 Red Size-7. Navigate to detail. | Assortment card visible. Two rows. Total row shows sum. | E2E | Assortment fetched via `GET /samples/:id/assortment`. |
| TC-SMP-E2E-030 | Admin | Full Unpack confirmation modal — cancel cancels, confirm triggers API | P0 | 1. Admin on ACTIVE sample. Click "Full Unpack". 2. Modal appears. Click Cancel. 3. Click Full Unpack again. Click Confirm Unpack. | Cancel: modal closes, no API call. Confirm: `POST /:id/full-unpack` called. Success toast. Sample status updated to CREATED. | E2E | spec-31 TC-SM-UNPACK-001 partial. AUTOMATION GAP — spec-38 needed for modal interaction. |
| TC-SMP-E2E-031 | Admin | Copy Barcode button copies sample_barcode to clipboard | P1 | 1. Admin on sample detail. Click "Copy Barcode". | `toast.success('Barcode copied')`. `navigator.clipboard.writeText` called with `sample.sample_barcode`. | E2E | AUTOMATION GAP — clipboard access in Playwright requires context grant. |

---

## Summary

**Total TCs:** 181 (130 × TC-SMP-NNN core + 23 × TC-SMP-FOOT-NNN foot-split + 28 × TC-SMP-E2E-NNN frontend)

**Per-role TC counts (primary actor):**
| Role | TC Count (approx) |
|---|---|
| Admin | 131 |
| Supervisor | 19 |
| Warehouse Operator | 14 |
| Dispatch Operator | 12 |
| Unauthenticated | 5 |

> Note: many TCs cover multiple roles in aggregate; counts above reflect the role listed as primary actor in that TC row.

**Foot-split sections TC count:** 23 TCs (TC-SMP-FOOT-001 through TC-SMP-FOOT-039 spread across Sections 8, 9) + 5 box-level-count TCs in Section 10 (TC-SMP-160–164) = **28 foot-model TCs**

---

## Known Matrix Discrepancies

1. **GET endpoints are auth-only (no permission gate):** `GET /samples`, `GET /samples/:id`, `GET /samples/:id/children`, `GET /samples/:id/assortment`, `GET /samples/qr/:barcode` — all have ONLY `authenticate` middleware. Any logged-in role gets HTTP 200. The RBAC matrix says only Admin has `samples:*`, but read access is effectively open to all authenticated roles. TCs 200–204 document actual behavior. **This is not a defect to fix here; it is the current implementation.**

2. **`isManager` (Admin + Supervisor) controls UI Close button visibility, but Supervisor lacks `samples:update`:** The detail page shows "Close Sample" to Supervisors (`isManager = true`) but the API will return 403 when they click it. TC-SMP-E2E-026 documents this UI/API mismatch. The fix would be to use `useCan('samples:update')` instead of `isManager` for the close button — out of scope here.

3. **`canAddBox` and `canUnpack` in detail page use status-only checks (no role/permission check):** Non-Admin users see "Add Box" and "Full Unpack" buttons when sample is in an addable/unpackable status. Clicking results in 403 from the API. This is a UI/permission-awareness gap, not a security flaw (API enforces correctly). Documented in TC-SMP-E2E-027.

---

## Automation Gap Recommendations

The existing specs (31, 37) provide good coverage for:
- CRUD happy paths (spec-31)
- Foot field storage and retrieval (spec-37)
- Basic RBAC (spec-31 TC-SM-ROLE)

**Recommended new spec: `frontend/e2e/38-sample-foot-split.spec.ts`**

This spec should cover (all marked AUTOMATION GAP above):

1. **Foot-split creation:** add LEFT to sample A + RIGHT to sample B for same box (TC-SMP-FOOT-001/002)
2. **PAIR rejection when foot active** (TC-SMP-FOOT-003/004)
3. **Conditional-free on remove:** box stays SAMPLE when other foot live (TC-SMP-FOOT-020/021)
4. **Last-foot dispatch:** dispatch sample A (LEFT) → box stays SAMPLE; dispatch sample B (RIGHT) → box → DISPATCHED (TC-SMP-FOOT-031/032)
5. **`active_sample_feet` in getByBarcode response** (TC-SMP-FOOT-008/009)
6. **Frontend pre-check rejects PAIR when LEFT active** (TC-SMP-049/051)
7. **Box-level count: one-foot-sampled box = 1 SAMPLE box** (TC-SMP-160/161)
8. **UI: Foot column badge (Left/Right foot in orange)** (TC-SMP-E2E-021)
9. **UI: Add Box foot selector sends correct foot to API** (TC-SMP-E2E-023)
10. **UI: Close button behavior for Supervisor** (TC-SMP-E2E-026)
11. **UI: WH Op sees Add Box button but API denies** (TC-SMP-E2E-027)
