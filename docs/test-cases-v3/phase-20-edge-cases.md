# Phase 20 — Cross-Cutting Edge Cases, Boundary Values & Integrity

**Module codes:** `EDGE`
**Refreshed:** 2026-06-09 (full rewrite; previous file preserved in git)
**Roles under test:** Admin / Supervisor / Warehouse Operator / Dispatch Operator / Unauthenticated (Any = all four authenticated roles)
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URL:** `http://localhost:3000`
**Realizing spec:** `frontend/e2e/27-edge-cases.spec.ts` — covers TC-EDGE-001/002 (article_code 20/21 chars), TC-EDGE-003/004 (article_name min, MRP 0.01), TC-EDGE-005/006/007 (bulk count 1/500/501), TC-EDGE-008 (XSS storage), TC-EDGE-009 (SQL injection search), TC-STATE-001–004 (FREE→PACKED, PACKED→dup-400, PACKED→FREE, DISPATCHED unpack block), TC-PAGE-001/002, TC-ERR-001–003. Everything else = **AUTOMATION GAP**.

**Key constants (verified from source):**
- `PAGINATION.MAX_LIMIT: 100` — `config/constants.ts`
- `RATE_LIMIT.MAX_REQUESTS: 50 000` per 15 min — effectively no limit in single-user testing
- Access-token expiry: `JWT_EXPIRY` env (project default 3600 s = 1 h)
- Barcode alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` — uppercase-only, no I/L/O/U
- Carton `max_capacity` Zod max: 100 (`createMasterCartonSchema`)
- Dispatch carton limit: 200 (`createDispatchSchema`)
- `/child-boxes/bulk` Zod cap: 500 (hard-coded; env-gate only on `/bulk-multi-size`)
- `ECOMMERCE_STATUS` / `SAMPLE_STATUS` / `MASTER_CARTON_STATUS` — CREATED → ACTIVE → CLOSED → DISPATCHED
- `addBoxToSample` rejects status CLOSED or DISPATCHED; `removeBoxFromSample` rejects DISPATCHED; `closeSample` rejects child_count = 0 or DISPATCHED; `fullUnpackSample` rejects DISPATCHED or CREATED

**Dependencies:** Seed data from Phases 01–19. Tests that require pre-existing dispatched/closed records may create their own fixture inline.

---

## Table of Contents

1. [§20.1 — Input validation boundaries (max-length, empty, type coercion, Zod)](#201--input-validation-boundaries)
2. [§20.2 — Barcode case-insensitivity & uppercase CHECK constraints](#202--barcode-case-insensitivity--uppercase-check-constraints)
3. [§20.3 — Order-sensitive route resolution](#203--order-sensitive-route-resolution)
4. [§20.4 — Status-guard rejections across modules](#204--status-guard-rejections-across-modules)
5. [§20.5 — Concurrency: rapid double-scan dedupe (master carton scan queue)](#205--concurrency-rapid-double-scan-dedupe)
6. [§20.6 — Concurrency: double-submit create & simultaneous dispatch](#206--concurrency-double-submit-create--simultaneous-dispatch)
7. [§20.7 — Transactional rollback paths](#207--transactional-rollback-paths)
8. [§20.8 — CSV upload — malformed, oversized, edge counts](#208--csv-upload--malformed-oversized-edge-counts)
9. [§20.9 — Env-gated caps (child-box 1500 label, product CSV 2000, child-box multi-size)](#209--env-gated-caps)
10. [§20.10 — Pagination boundary](#2010--pagination-boundary)
11. [§20.11 — Authentication token edge cases (expiry, tampering, mid-session deactivation)](#2011--authentication-token-edge-cases)
12. [§20.12 — RBAC edge cases (Unauthenticated, permission-absent role, GET no-gate discrepancy)](#2012--rbac-edge-cases)
13. [§20.13 — Empty state & network-error UI](#2013--empty-state--network-error-ui)
14. [§20.14 — Security: SQL injection, XSS, path traversal, prototype pollution](#2014--security)
15. [§20.15 — Dispatch schema refine rules (source exclusivity, customer requirement)](#2015--dispatch-schema-refine-rules)
16. [§20.16 — Foot-split edge cases (sample module)](#2016--foot-split-edge-cases)
17. [§20.17 — Rate limit behavior](#2017--rate-limit-behavior)

---

## §20.1 — Input Validation Boundaries

> Zod validation middleware fires before any service logic. All cross-module
> validation errors return HTTP 400 with `success: false`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-001 | Admin | `article_code` exactly 20 chars → 201 | P0 | 1. `POST /api/v1/products` with `article_code` = 20-char string (e.g. `EC<TS6>ABCDEFGHIJKL`). | HTTP 201; `success: true`; `article_code` stored verbatim. | E2E | Spec 27 TC-EDGE-001 already automated. |
| TC-EDGE-002 | Admin | `article_code` 21 chars → 400 | P0 | 1. `POST /api/v1/products` with `article_code` = 21-char string. | HTTP 400/422; `success: false`; error references `article_code` length. | E2E | Spec 27 TC-EDGE-002 already automated. |
| TC-EDGE-003 | Admin | `article_name` 1 char → accepted or rejected cleanly | P1 | 1. `POST /api/v1/products` with `article_name: "X"` plus all required fields. | HTTP 201 or HTTP 400/422; `success` field present; no 500. | E2E | Spec 27 TC-EDGE-003. Min-length not enforced in Zod schema but keep documented. |
| TC-EDGE-004 | Admin | MRP = 0.01 → 201 | P1 | 1. `POST /api/v1/products` with `mrp: 0.01`. | HTTP 201; `mrp` stored as 0.01. | E2E | Spec 27 TC-EDGE-004. Confirms Zod allows positive non-integer MRP. |
| TC-EDGE-005 | Admin | Bulk child-box count = 1 → 201 | P1 | 1. `POST /api/v1/child-boxes/bulk` `{"product_id":"<valid>","count":1}`. | HTTP 201; exactly 1 box returned. | E2E | Spec 27 TC-EDGE-005. |
| TC-EDGE-006 | Admin | Bulk child-box count = 500 (Zod cap) → 201 | P1 | 1. `POST /api/v1/child-boxes/bulk` `{"count":500}`. | HTTP 201; exactly 500 boxes. Slow test — allow 2-min timeout. | E2E | Spec 27 TC-EDGE-006. Hard-coded Zod cap on `/bulk` is 500. |
| TC-EDGE-007 | Admin | Bulk child-box count = 501 → 400 | P0 | 1. `POST /api/v1/child-boxes/bulk` `{"count":501}`. | HTTP 400/422; `success: false`; error references count exceeds 500. | E2E | Spec 27 TC-EDGE-007. Cap enforced by `createBulkChildBoxSchema`. |
| TC-EDGE-008 | Admin | `max_capacity` = 100 on carton create → 201 | P1 | 1. `POST /api/v1/master-cartons` `{"max_capacity":100}`. | HTTP 201; `max_capacity: 100` in response. | API | `createMasterCartonSchema` max=100. AUTOMATION GAP. |
| TC-EDGE-009 | Admin | `max_capacity` = 101 → 400 | P0 | 1. `POST /api/v1/master-cartons` `{"max_capacity":101}`. | HTTP 400; error "Max capacity must not exceed 100". | API | AUTOMATION GAP. |
| TC-EDGE-010 | Admin | `max_capacity` = 0 → 400 | P1 | 1. `POST /api/v1/master-cartons` `{"max_capacity":0}`. | HTTP 400; "Max capacity must be positive". | API | AUTOMATION GAP. |
| TC-EDGE-011 | Admin | `max_capacity` as float (2.5) → 400 | P1 | 1. `POST /api/v1/master-cartons` `{"max_capacity":2.5}`. | HTTP 400; "Max capacity must be a whole number". | API | AUTOMATION GAP. |
| TC-EDGE-012 | Admin | Dispatch with `master_carton_ids` array of 200 → 201 or propagated error | P1 | 1. Build array of 200 valid CLOSED carton IDs. 2. `POST /api/v1/dispatches` with that array + valid `customer_id`. | HTTP 201 (all dispatched) OR HTTP 400/409 for any carton not in CLOSED status; no 500. | API | `createDispatchSchema` max=200. AUTOMATION GAP. |
| TC-EDGE-013 | Dispatch Operator | Dispatch with `master_carton_ids` array of 201 → 400 | P0 | 1. `POST /api/v1/dispatches` with 201-element `master_carton_ids` array. | HTTP 400; "Cannot dispatch more than 200 cartons at once". | API | AUTOMATION GAP. |
| TC-EDGE-014 | Admin | `destination` at max 255 chars → accepted | P1 | 1. `POST /api/v1/dispatches` with `destination` = 255 × "A" + required source. | HTTP 201 or 400/409 depending on carton state; `destination` stored without truncation; no 500. | API | AUTOMATION GAP. |
| TC-EDGE-015 | Admin | `destination` at 256 chars → 400 | P1 | 1. `POST /api/v1/dispatches` with `destination` = 256-char string. | HTTP 400; error references `destination` length exceeds 255. | API | AUTOMATION GAP. |
| TC-EDGE-016 | Admin | Empty object body `{}` to any POST endpoint → 400 | P0 | 1. `POST /api/v1/products` with body `{}`. 2. `POST /api/v1/master-cartons` with `{}`. 3. `POST /api/v1/dispatches` with `{}`. | All return HTTP 400; multiple required-field validation errors; no 500. | API | AUTOMATION GAP. |
| TC-EDGE-017 | Admin | Malformed JSON body → 400 | P0 | 1. `POST /api/v1/products` with `Content-Type: application/json` and body `{bad json`. | HTTP 400; JSON parse error in response; no 500. | API | Express `express.json()` catches this. AUTOMATION GAP. |
| TC-EDGE-018 | Admin | Section name containing only whitespace → 400 | P1 | 1. `POST /api/v1/sections` with `{"name": "   "}`. | HTTP 400; validation error; no section created. | API | AUTOMATION GAP. |
| TC-EDGE-019 | Admin | `sample_date` / `dispatch_date` invalid ISO → 400 | P1 | 1. `POST /api/v1/dispatches` with `dispatch_date: "not-a-date"`. | HTTP 400; "Invalid date format, expected ISO 8601". | API | `createDispatchSchema` uses `.datetime()`. AUTOMATION GAP. |
| TC-EDGE-020 | Admin | `dispatch_date` valid ISO → accepted | P1 | 1. `POST /api/v1/dispatches` with `dispatch_date: "2026-06-09T10:00:00.000Z"` + valid source. | HTTP 201 or 400 (carton state); `dispatch_date` field stored; no 500. | API | AUTOMATION GAP. |
| TC-EDGE-021 | Admin | `lr_number` at max 100 chars → accepted | P1 | 1. `POST /api/v1/dispatches` with `lr_number` = 100 × "X" + valid source. | HTTP 201 or carton-state 400; `lr_number` stored without truncation. | API | AUTOMATION GAP. |
| TC-EDGE-022 | Admin | `lr_number` at 101 chars → 400 | P1 | 1. `POST /api/v1/dispatches` with `lr_number` = 101-char string. | HTTP 400; error references `lr_number` exceeds 100 chars. | API | AUTOMATION GAP. |
| TC-EDGE-023 | Admin | `vehicle_number` at max 50 chars → accepted | P2 | 1. `POST /api/v1/dispatches` with `vehicle_number` = 50 × "V". | HTTP 201 or carton-state 400; no validation error. | API | AUTOMATION GAP. |
| TC-EDGE-024 | Admin | `vehicle_number` at 51 chars → 400 | P2 | 1. `POST /api/v1/dispatches` with `vehicle_number` = 51-char string. | HTTP 400; error references `vehicle_number`. | API | AUTOMATION GAP. |
| TC-EDGE-025 | Admin | `box_feet` with invalid foot value → 400 | P1 | 1. `POST /api/v1/samples` with `box_feet: {"CB000001": "HEEL"}`. | HTTP 400; Zod error — `foot` must be `LEFT`, `RIGHT`, or `PAIR`. | API | `createSampleSchema` uses `z.record(z.enum(['LEFT','RIGHT','PAIR']))`. AUTOMATION GAP. |
| TC-EDGE-026 | Admin | `foot` field on add-box-to-sample with invalid enum → 400 | P1 | 1. `POST /api/v1/samples/add-box` with `{"foot": "BOTH", ...}`. | HTTP 400; Zod enum error for `foot`; no box added. | API | AUTOMATION GAP. |
| TC-EDGE-027 | Admin | `child_box_id` not a UUID on pack → 400 | P0 | 1. `POST /api/v1/master-cartons/pack` with `{"child_box_id":"not-a-uuid","master_carton_id":"<valid>"}`. | HTTP 400; "Invalid child box ID format". | API | `packChildBoxSchema`. AUTOMATION GAP. |
| TC-EDGE-028 | Admin | `master_carton_id` not a UUID on pack → 400 | P0 | 1. `POST /api/v1/master-cartons/pack` with `{"child_box_id":"<valid>","master_carton_id":"not-a-uuid"}`. | HTTP 400; "Invalid master carton ID format". | API | AUTOMATION GAP. |
| TC-EDGE-029 | Admin | `barcode` empty string on pack-by-barcode → 400 | P0 | 1. `POST /api/v1/master-cartons/pack-by-barcode` with `{"barcode":"","master_carton_id":"<valid>"}`. | HTTP 400; "Barcode is required" (Zod `min(1)`). | API | `packByBarcodeSchema`. AUTOMATION GAP. |
| TC-EDGE-030 | Admin | `carton1_barcode` === `carton2_barcode` on repack/free-both → 400 | P0 | 1. `POST /api/v1/master-cartons/repack/free-both` with `{"carton1_barcode":"MC000001","carton2_barcode":"MC000001"}`. | HTTP 400; "Please scan two different cartons" (service guard). | API | `repackFreeBoth()` line: `if (c1 === c2) throw BadRequestError`. AUTOMATION GAP. |
| TC-EDGE-031 | Admin | `ecommerce_record_id` not UUID on scan-carton → 400 | P1 | 1. `POST /api/v1/ecommerce/scan-carton` with `{"ecommerce_record_id":"bad","carton_barcode":"MC000001"}`. | HTTP 400; Zod UUID error for `ecommerce_record_id`. | API | AUTOMATION GAP. |

---

## §20.2 — Barcode Case-Insensitivity & Uppercase CHECK Constraints

> All barcode lookups use `UPPER($1)` in SQL (confirmed in `masterCarton.service.ts`,
> `sample.service.ts`, `ecommerce.service.ts`). `packByBarcodeSchema` and
> `packChildBoxByBarcode()` call `.toUpperCase()` before DB query.
> Barcode alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` — letters I, L, O, U excluded.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-032 | Admin | Lowercase barcode on pack-by-barcode → resolved to uppercase | P0 | 1. Obtain a valid FREE box with barcode e.g. `CB3HM2X7`. 2. `POST /api/v1/master-cartons/pack-by-barcode` with `{"barcode":"cb3hm2x7","master_carton_id":"<valid>"}`. | HTTP 200; box packed successfully; `childBoxBarcode` in response is uppercase `CB3HM2X7`. | API | `packByBarcodeSchema` transforms via `.toUpperCase()`. AUTOMATION GAP. |
| TC-EDGE-033 | Admin | Mixed-case child-box barcode on create-carton barcodes array | P1 | 1. `POST /api/v1/master-cartons` with `{"child_box_barcodes":["cb3hm2x7"]}`. | HTTP 201; carton created; child box resolved via `WHERE barcode = UPPER($1)`. | API | `createMasterCartonSchema` transforms array elements `.toUpperCase()`. AUTOMATION GAP. |
| TC-EDGE-034 | Admin | Lowercase barcode on trace endpoint | P1 | 1. `GET /api/v1/inventory/trace/cb3hm2x7`. | HTTP 200; trace result found (server normalises to uppercase for lookup). | API | AUTOMATION GAP — verify `traceByBarcode` normalizes input. |
| TC-EDGE-035 | Admin | Lowercase sample barcode on GET /samples/qr/:barcode | P1 | 1. `GET /api/v1/samples/qr/sr3hm2x7` (lowercase). | HTTP 200; sample found (service uses `UPPER($1)` in `getSampleByBarcode`). | API | AUTOMATION GAP. |
| TC-EDGE-036 | Admin | Lowercase master-carton barcode on GET /master-cartons/qr/:barcode | P1 | 1. `GET /api/v1/master-cartons/qr/mc3hm2x7` (lowercase). | HTTP 200; carton found (`getMasterCartonByBarcode` uses `UPPER($1)`). | API | AUTOMATION GAP. |
| TC-EDGE-037 | Admin | Barcode with excluded alphabet character (e.g. contains 'I' or 'O') never generated | P2 | 1. Bulk-create 100 child boxes. 2. Inspect all barcodes. | None of the barcodes contain the characters I, L, O, or U. All chars are from `0-9A-Z` excluding those four. | API | `barcodeGenerator.ts` uses `ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'`. AUTOMATION GAP. |
| TC-EDGE-038 | Admin | Leading/trailing whitespace in barcode lookup → not matched | P1 | 1. `GET /api/v1/inventory/trace/%20CB3HM2X7%20` (URL-encoded spaces around valid barcode). | HTTP 404; server does NOT strip whitespace and accidentally match the real barcode. Trace fails cleanly. | API | Security edge case — whitespace not stripped on route param. AUTOMATION GAP. |

---

## §20.3 — Order-Sensitive Route Resolution

> Express registers routes in declaration order. Literal sub-paths that share a
> prefix with `/:id` MUST be declared first or they will be swallowed by the
> dynamic segment. All confirmed safe in current route files — tests here prove
> the protection holds.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-039 | Admin | GET /child-boxes/bulk-upload/sample resolves to sample-CSV handler (not /:id) | P0 | 1. `GET /api/v1/child-boxes/bulk-upload/sample` with valid Admin token. | HTTP 200; response is a CSV file (Content-Type text/csv or application/octet-stream); NOT a 400 "Invalid child box ID" UUID error. | API | Route declared before `/:id` in `childBox.routes.ts`. AUTOMATION GAP. |
| TC-EDGE-040 | Admin | POST /child-boxes/bulk resolves to bulk-create handler (not /:id) | P0 | 1. `POST /api/v1/child-boxes/bulk` `{"product_id":"<valid>","count":1}`. | HTTP 201; 1 child box created. NOT a 404 or UUID error that would fire if `/bulk` were treated as an ID. | E2E | Spec 27 TC-EDGE-005. |
| TC-EDGE-041 | Admin | GET /ecommerce/stock-summary resolves to stock-summary handler (not /:id) | P0 | 1. `GET /api/v1/ecommerce/stock-summary` with valid Admin token. | HTTP 200; JSON array of stock rows; NOT a 400 UUID error for id="stock-summary". | API | Declared before `/:id` in `ecommerce.routes.ts` (comment: "Literal path before /:id"). AUTOMATION GAP. |
| TC-EDGE-042 | Admin | POST /master-cartons/pack resolves to pack handler (not /:id/...) | P0 | 1. `POST /api/v1/master-cartons/pack` with valid body. | HTTP 200 or 400 (validation) but NOT a 404 "Master carton not found" for id="pack". | API | `pack` declared before `/:id` group. AUTOMATION GAP. |
| TC-EDGE-043 | Admin | POST /master-cartons/pack-by-barcode resolves to pack-by-barcode handler | P0 | 1. `POST /api/v1/master-cartons/pack-by-barcode` with `{"barcode":"CB000001","master_carton_id":"<valid>"}`. | HTTP 200 or 404 (box not found) but NOT a 404 "Master carton not found" for id="pack-by-barcode". | API | AUTOMATION GAP. |
| TC-EDGE-044 | Admin | POST /master-cartons/repack/free-both resolves correctly | P0 | 1. `POST /api/v1/master-cartons/repack/free-both` with `{"carton1_barcode":"X","carton2_barcode":"Y"}`. | HTTP 400 (cartons not found if barcodes bogus) or 400 (same carton); NOT a 405 Method Not Allowed or UUID error. | API | Route `/repack/free-both` declared before `/:id` handler. AUTOMATION GAP. |
| TC-EDGE-045 | Admin | POST /master-cartons/unpack resolves to unpack handler (not /:id) | P0 | 1. `POST /api/v1/master-cartons/unpack` with body `{"child_box_id":"<valid>","master_carton_id":"<valid>"}`. | HTTP 200 or 400/404 (mapping not found); NOT a UUID validation error for id="unpack". | API | AUTOMATION GAP. |
| TC-EDGE-046 | Admin | GET /master-cartons/legacy-upload/sample resolves to CSV download | P0 | 1. `GET /api/v1/master-cartons/legacy-upload/sample` with valid token. | HTTP 200; CSV content-type; NOT UUID validation error. | API | Declared before `/:id` — comment in route file: "must be BEFORE /:id". AUTOMATION GAP. |
| TC-EDGE-047 | Admin | POST /samples/add-box resolves to add-box handler (not /:id/...) | P0 | 1. `POST /api/v1/samples/add-box` with `{"child_box_id":"<valid>","sample_record_id":"<valid>"}`. | HTTP 200 or 400/404; NOT a 400 UUID error for id="add-box". | API | AUTOMATION GAP. |
| TC-EDGE-048 | Admin | POST /samples/remove-box resolves to remove-box handler | P0 | 1. `POST /api/v1/samples/remove-box` with required body. | HTTP 200 or 400/404; NOT a route mismatch error. | API | AUTOMATION GAP. |
| TC-EDGE-049 | Admin | GET /customers/bulk-upload/sample resolves to CSV download | P0 | 1. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 200; CSV content; NOT UUID error for id="bulk-upload". | API | Declared before `/:id` in `customer.routes.ts`. AUTOMATION GAP. |
| TC-EDGE-050 | Admin | GET /customers/primary-dealers resolves to primary-dealer list | P0 | 1. `GET /api/v1/customers/primary-dealers`. | HTTP 200; JSON array; NOT UUID error for id="primary-dealers". | API | AUTOMATION GAP. |
| TC-EDGE-051 | Admin | GET /inventory/stock/summary resolves to summary (not hierarchy) | P0 | 1. `GET /api/v1/inventory/stock/summary`. 2. `GET /api/v1/inventory/stock/hierarchy`. | Both return HTTP 200 with different data structures; no route confusion. | API | Both are literal sub-paths before any param in `inventory.routes.ts`. AUTOMATION GAP. |
| TC-EDGE-052 | Admin | GET /inventory/cartons/hierarchy does not shadow /cartons/export | P0 | 1. `GET /api/v1/inventory/cartons/hierarchy`. 2. `GET /api/v1/inventory/cartons/export`. | Both return distinct responses; no 404 or type error on either. | API | AUTOMATION GAP. |

---

## §20.4 — Status-Guard Rejections Across Modules

> Service-layer guards fire inside open transactions (most cases) and return
> `BadRequestError` (HTTP 400) via the global error handler.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-053 | Warehouse Operator | Pack a PACKED box into a second carton → 400 | P0 | 1. Create FREE box B1. 2. Pack B1 into carton C1 (B1 now PACKED). 3. `POST /api/v1/master-cartons/pack` with B1 and a different carton C2. | HTTP 400; error "currently PACKED and cannot be packed". C2 unchanged; no duplicate mapping. | E2E | Spec 27 TC-STATE-002. |
| TC-EDGE-054 | Warehouse Operator | Pack a DISPATCHED box → 400 | P0 | 1. Dispatch a box (status DISPATCHED). 2. Attempt to pack it via `pack-by-barcode` into a new carton. | HTTP 400; "currently DISPATCHED and cannot be packed". | API | Guard in `packChildBox()`: status must be FREE or GENERATED. AUTOMATION GAP. |
| TC-EDGE-055 | Warehouse Operator | Pack a SAMPLE box → 400 | P0 | 1. Add box B to a sample (B status = SAMPLE). 2. `POST /api/v1/master-cartons/pack-by-barcode` with B's barcode. | HTTP 400; "currently SAMPLE and cannot be packed". | API | AUTOMATION GAP. |
| TC-EDGE-056 | Warehouse Operator | Pack a ECOMMERCE box → 400 | P0 | 1. Add box B to an ecommerce record (status = ECOMMERCE). 2. Attempt to pack. | HTTP 400; "currently ECOMMERCE and cannot be packed". | API | AUTOMATION GAP. |
| TC-EDGE-057 | Admin | Close a master carton that is already CLOSED → 400 | P0 | 1. Close carton C1. 2. `POST /api/v1/master-cartons/<C1>/close` again. | HTTP 400; "Master carton is already closed". No duplicate CARTON_CLOSED transaction. | API | `closeMasterCarton()` guard. AUTOMATION GAP. |
| TC-EDGE-058 | Admin | Close a DISPATCHED master carton → 400 | P0 | 1. Dispatch carton C1. 2. `POST /api/v1/master-cartons/<C1>/close`. | HTTP 400; "Cannot close a dispatched carton". | API | AUTOMATION GAP. |
| TC-EDGE-059 | Admin | Close an empty master carton (child_count = 0) → 400 | P0 | 1. Create carton with no boxes (status CREATED, child_count = 0). 2. `POST /api/v1/master-cartons/<id>/close`. | HTTP 400; "Cannot close an empty carton". | API | AUTOMATION GAP. |
| TC-EDGE-060 | Admin | Full-unpack a DISPATCHED master carton → 400 | P0 | 1. Dispatch carton. 2. `POST /api/v1/master-cartons/<id>/full-unpack`. | HTTP 400; "Cannot unpack a dispatched carton". | E2E | Spec 27 TC-STATE-004. |
| TC-EDGE-061 | Admin | Full-unpack a CREATED (empty) master carton → 400 | P1 | 1. Create carton (no boxes; status CREATED). 2. `POST /api/v1/master-cartons/<id>/full-unpack`. | HTTP 400; "Cannot unpack an empty carton". | API | `fullUnpackMasterCarton()` guard. AUTOMATION GAP. |
| TC-EDGE-062 | Admin | Add box to a CLOSED master carton via pack → 400 | P0 | 1. Close carton C1. 2. `POST /api/v1/master-cartons/pack` with a FREE box and C1's ID. | HTTP 400; "Master carton is CLOSED and cannot accept new child boxes". | API | `packChildBox()` guard. AUTOMATION GAP. |
| TC-EDGE-063 | Admin | Add box to a DISPATCHED master carton via pack → 400 | P0 | 1. Dispatch carton C1. 2. `POST /api/v1/master-cartons/pack` with a FREE box and C1. | HTTP 400; "Master carton is DISPATCHED and cannot accept new child boxes". | API | AUTOMATION GAP. |
| TC-EDGE-064 | Admin | Unpack from a DISPATCHED carton (single unpack) → 400 | P0 | 1. Dispatch carton. 2. `POST /api/v1/master-cartons/unpack` with a box in that carton. | HTTP 400; "Cannot unpack from a dispatched carton". | API | `unpackChildBox()` guard. AUTOMATION GAP. |
| TC-EDGE-065 | Admin | Add box to CLOSED sample → 400 | P0 | 1. Add boxes to sample S1; close S1. 2. `POST /api/v1/samples/add-box` with a FREE box targeting S1. | HTTP 400; "Sample record is CLOSED and cannot accept new child boxes". | API | `addBoxToSample()` guard. AUTOMATION GAP. |
| TC-EDGE-066 | Admin | Add box to DISPATCHED sample → 400 | P0 | 1. Dispatch sample S1 (status DISPATCHED). 2. Try to add a box. | HTTP 400; "Sample record is DISPATCHED and cannot accept new child boxes". | API | AUTOMATION GAP. |
| TC-EDGE-067 | Admin | Close an empty sample (child_count = 0) → 400 | P0 | 1. Create sample (no boxes). 2. `POST /api/v1/samples/<id>/close`. | HTTP 400; "Cannot close an empty sample record". | API | `closeSample()` guard. AUTOMATION GAP. |
| TC-EDGE-068 | Admin | Close an already-CLOSED sample → 400 | P0 | 1. Close sample. 2. Close again. | HTTP 400; "Sample record is already closed". | API | AUTOMATION GAP. |
| TC-EDGE-069 | Admin | Close a DISPATCHED sample → 400 | P0 | 1. Dispatch sample. 2. `POST /api/v1/samples/<id>/close`. | HTTP 400; "Cannot close a dispatched sample". | API | AUTOMATION GAP. |
| TC-EDGE-070 | Admin | Full-unpack a DISPATCHED sample → 400 | P0 | 1. Dispatch sample. 2. `POST /api/v1/samples/<id>/full-unpack`. | HTTP 400; "Cannot unpack a dispatched sample". | API | `fullUnpackSample()` guard. AUTOMATION GAP. |
| TC-EDGE-071 | Admin | Full-unpack an empty (CREATED) sample → 400 | P1 | 1. Create sample (no boxes). 2. `POST /api/v1/samples/<id>/full-unpack`. | HTTP 400; "Cannot unpack an empty sample record". | API | AUTOMATION GAP. |
| TC-EDGE-072 | Admin | Remove box from DISPATCHED sample → 400 | P0 | 1. Dispatch sample. 2. `POST /api/v1/samples/remove-box` with a box in that sample. | HTTP 400; "Cannot remove a child box from a dispatched sample". | API | `removeBoxFromSample()` guard. AUTOMATION GAP. |
| TC-EDGE-073 | Admin | Open-legacy on a non-legacy carton → 400 | P0 | 1. Create a normal (non-legacy) carton. 2. `POST /api/v1/master-cartons/<id>/open-legacy`. | HTTP 400; "Only legacy cartons can be opened for repacking". | API | `openLegacyCarton()` guard. AUTOMATION GAP. |
| TC-EDGE-074 | Admin | Repack free-both when BOTH cartons are CREATED (empty) → 400 | P0 | 1. Create two empty cartons (status CREATED). 2. `POST /api/v1/master-cartons/repack/free-both`. | HTTP 400; "At least one carton must have boxes to repack". | API | `repackFreeBoth()` guard: `if (carton1Empty && carton2Empty)`. AUTOMATION GAP. |
| TC-EDGE-075 | Admin | Repack free-both when one carton is DISPATCHED → 400 | P0 | 1. Dispatch carton C1. 2. `POST /api/v1/master-cartons/repack/free-both` with C1 and a non-dispatched carton C2. | HTTP 400; "Cannot repack a dispatched carton". | API | AUTOMATION GAP. |
| TC-EDGE-076 | Dispatch Operator | Dispatch a CREATED (not CLOSED) master carton → expect service rejection | P0 | 1. Create carton with boxes (status ACTIVE). 2. `POST /api/v1/dispatches` with that carton's ID. | HTTP 400; dispatch service rejects non-CLOSED carton. Document exact error message. | API | Verify against `dispatch.service.ts` (not read in full — cross-reference phase 13 for exact guard). AUTOMATION GAP. |
| TC-EDGE-077 | Dispatch Operator | Dispatch an already-DISPATCHED carton → 409 or 400 | P0 | 1. Dispatch carton. 2. `POST /api/v1/dispatches` with same carton again. | HTTP 409 or 400; "Carton already dispatched" or equivalent; no duplicate dispatch record. | API | AUTOMATION GAP. |
| TC-EDGE-078 | Admin | Pack box into carton that is already full (child_count = max_capacity) → 400 | P0 | 1. Create carton with `max_capacity: 2`. 2. Pack 2 boxes. 3. Attempt to pack a third. | HTTP 400; "Master carton is full (2/2)". | API | `packChildBox()` guard: `if (carton.child_count >= carton.max_capacity)`. AUTOMATION GAP. |

---

## §20.5 — Concurrency: Rapid Double-Scan Dedupe

> `packChildBoxByBarcode()` implements idempotent dedupe: if a box is already in
> THIS carton (active mapping exists), the function returns `{alreadyPacked: true}` as
> a no-op success. If it is in a DIFFERENT carton it throws a `BadRequestError`.
> The underlying `packChildBox()` uses `FOR UPDATE` row locks on child_boxes and
> master_cartons within a transaction to prevent double-pack.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-079 | Warehouse Operator | Re-scan same barcode into same carton → idempotent 200 | P0 | 1. Pack box B1 into carton C1 via `pack-by-barcode`. 2. Immediately call `pack-by-barcode` again with the same barcode + carton. | HTTP 200; `alreadyPacked: true` in response; `carton_child_mapping` still has exactly 1 active row for B1+C1; `child_count` unchanged. | API | `packChildBoxByBarcode()` checks existing active mapping before delegating. AUTOMATION GAP. |
| TC-EDGE-080 | Warehouse Operator | Rapid double-scan (two concurrent requests) same box into same carton → one succeeds, one is idempotent | P0 | 1. `Promise.all([pack B1→C1, pack B1→C1])` fired simultaneously. | Both return HTTP 200; one has `alreadyPacked: false` (the winner), one has `alreadyPacked: true` (the idempotent re-scan). `SELECT COUNT(*) FROM carton_child_mapping WHERE child_box_id=B1 AND is_active=true` = 1. | Integration | Validates scan-queue / serialized dedupe contract. AUTOMATION GAP. |
| TC-EDGE-081 | Warehouse Operator | Re-scan same barcode into DIFFERENT carton (box already PACKED) → 400 | P0 | 1. Pack box B1 into C1 (B1 now PACKED). 2. `POST /api/v1/master-cartons/pack-by-barcode` with B1 barcode and C2 ID. | HTTP 400; "Child box <B1> is already packed in another carton. Unpack it first." | API | `packChildBoxByBarcode()`: `if (childBox.status === PACKED && !existing)` → conflict error. AUTOMATION GAP. |
| TC-EDGE-082 | Warehouse Operator | Two concurrent requests: same box into two DIFFERENT cartons → exactly one wins | P0 | 1. `Promise.all([pack B1→C1, pack B1→C2])` simultaneously. | Exactly one request returns HTTP 200 (`alreadyPacked: false`); the other returns HTTP 400/409. `SELECT COUNT(*) FROM carton_child_mapping WHERE child_box_id=B1 AND is_active=true` = 1. Box belongs to exactly one carton. | Integration | `FOR UPDATE` lock on child_boxes row serializes the two requests; second transaction sees PACKED status and throws. AUTOMATION GAP. |

---

## §20.6 — Concurrency: Double-Submit Create & Simultaneous Dispatch

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-083 | Admin | Simultaneous dispatch of the same CLOSED carton from two sessions → one wins | P0 | 1. Close carton C1. 2. `Promise.all([POST /dispatches {master_carton_ids:[C1]}, POST /dispatches {master_carton_ids:[C1]}])` simultaneously. | Exactly one request returns HTTP 201; the other returns HTTP 400 or 409 ("Carton already dispatched"). `SELECT COUNT(*) FROM dispatch_records WHERE master_carton_id=C1` = 1. | Integration | Requires dispatch service to check carton status inside transaction with row lock. AUTOMATION GAP. |
| TC-EDGE-084 | Admin | Double-submit sample create (same name, same boxes) simultaneously | P1 | 1. `Promise.all([POST /samples {name:"Dup",child_box_barcodes:[B1]}, POST /samples {name:"Dup",child_box_barcodes:[B1]}])`. | Exactly one succeeds (HTTP 201); the other returns HTTP 400 ("Child box ... cannot be packed" or similar). Box B1 ends up in exactly one sample. | Integration | `FOR UPDATE` on child_boxes inside `createSample()`. AUTOMATION GAP. |
| TC-EDGE-085 | Admin | Double-submit same product create (same article_code + colour + size) | P1 | 1. `Promise.all([POST /products {..., article_code:"DUPTEST"}×2])`. | One returns HTTP 201; the other returns HTTP 409 (ConflictError on unique constraint) or HTTP 400. No duplicate product row. | Integration | Postgres unique constraint on (article_code, colour, size). AUTOMATION GAP. |
| TC-EDGE-086 | Admin | Two concurrent pack-into-carton requests for two different FREE boxes into the same carton | P1 | 1. Create carton C1 with `max_capacity: 5`. 2. `Promise.all([pack B1→C1, pack B2→C1])` simultaneously. | Both return HTTP 200; `child_count` = 2; both mappings active; no 500 or double-count. | Integration | Two different boxes, same carton — `FOR UPDATE` on master_carton serializes them. AUTOMATION GAP. |

---

## §20.7 — Transactional Rollback Paths

> All multi-step writes use `BEGIN / COMMIT / ROLLBACK` (pg `PoolClient`).
> On any mid-loop exception the `catch` block calls `ROLLBACK`, leaving the DB
> as if the operation never started.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-087 | Admin | Create carton with mixed valid + invalid barcodes → full rollback, no carton created | P0 | 1. Create FREE box B1. 2. `POST /api/v1/master-cartons` with `child_box_barcodes: [B1, "BOGUS999"]`. | HTTP 400/404; "Child box with barcode BOGUS999 not found". No carton row created (`SELECT COUNT(*) FROM master_cartons WHERE carton_barcode = <expected>` = 0). B1 remains FREE. | Integration | `createMasterCarton()` `ROLLBACK` on `NotFoundError`. AUTOMATION GAP. |
| TC-EDGE-088 | Admin | Create carton with one barcode already PACKED → rollback, preceding boxes not packed | P0 | 1. Pack B1 into C1 (B1 = PACKED). 2. Create FREE boxes B2, B3. 3. `POST /api/v1/master-cartons` with `child_box_barcodes: [B2, B3, B1]`. | HTTP 400; "B1 is currently PACKED". No new carton created. B2 and B3 still FREE (rolled back). | Integration | Mid-loop `BadRequestError` triggers `ROLLBACK`. AUTOMATION GAP. |
| TC-EDGE-089 | Admin | Create sample with mixed valid + unknown barcodes → full rollback | P0 | 1. `POST /api/v1/samples` with `child_box_barcodes: ["<valid_free>", "NONEXISTENT"]`. | HTTP 404; "Child box with barcode NONEXISTENT not found". No sample_records row inserted. Valid box still FREE. | Integration | `createSample()` `ROLLBACK` path. AUTOMATION GAP. |
| TC-EDGE-090 | Admin | Create ecommerce record with one non-FREE barcode → rollback, record not created | P0 | 1. Pack B1 into a carton (B1 = PACKED). 2. `POST /api/v1/ecommerce` with `child_box_barcodes: [B1, "<valid_free>"]`. | HTTP 400; "B1 is currently PACKED". No ecommerce record inserted. Valid box still FREE. | Integration | `createEcommerce()` `ROLLBACK`. AUTOMATION GAP. |
| TC-EDGE-091 | Admin | Full-unpack carton with 20 boxes — all 20 freed atomically or none | P1 | 1. Pack 20 boxes into carton C1. Close C1. 2. Trigger `full-unpack`. 3. While unpack is in progress (simulated by slow query), check for partial state. | After completion: all 20 boxes are FREE; `child_count` = 0; `status` = CREATED. No intermediate state where some boxes are FREE and others remain PACKED. | Integration | `fullUnpackMasterCarton()` processes all in one transaction. AUTOMATION GAP. |
| TC-EDGE-092 | Admin | Multi-carton dispatch — if one carton is not CLOSED, entire dispatch aborts | P0 | 1. Close carton C1. Leave carton C2 in ACTIVE status. 2. `POST /api/v1/dispatches` with `master_carton_ids: [C1, C2]`. | HTTP 400; "Carton not in CLOSED status" (or equivalent). No dispatch record created; C1 remains CLOSED (not transitioned to DISPATCHED). | Integration | Verify against `dispatch.service.ts` multi-carton dispatch logic. AUTOMATION GAP. |

---

## §20.8 — CSV Upload — Malformed, Oversized, Edge Counts

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-093 | Admin | Child-box CSV upload — empty file (0 bytes) → 400 | P1 | 1. Upload a 0-byte file to `POST /api/v1/child-boxes/bulk-upload`. | HTTP 400; error about empty file; no rows inserted. | API | AUTOMATION GAP. |
| TC-EDGE-094 | Admin | Child-box CSV upload — header-only (no data rows) → 400 or 200 with 0 created | P1 | 1. Upload CSV with only the header row. | HTTP 400 ("CSV has no data rows") OR HTTP 200 `{created:0, errors:[]}`. No 500. | API | AUTOMATION GAP. |
| TC-EDGE-095 | Admin | Child-box CSV upload — file exceeding Express 10 MB body limit → 413 | P0 | 1. Upload a CSV file > 10 MB. | HTTP 413 (Payload Too Large); no rows inserted. | API | `express.json({limit:'10mb'})`. AUTOMATION GAP. |
| TC-EDGE-096 | Admin | Child-box CSV upload — wrong MIME type (image/png) → 400 | P0 | 1. Upload a PNG file via `bulk-upload` endpoint. | HTTP 400; error about invalid file type; no rows processed. | API | AUTOMATION GAP. |
| TC-EDGE-097 | Admin | Child-box CSV upload — missing required column header → 400 | P1 | 1. Upload CSV missing the `barcode` or `product_id` column. | HTTP 400; error identifying the missing column; no rows processed. | API | AUTOMATION GAP. |
| TC-EDGE-098 | Admin | Product CSV bulk upload — file with 2001 rows when env-gate not set → 400 (default cap 500 or env default) | P0 | 1. Do NOT set `PRODUCT_CSV_CAP` env var (default applies). 2. Upload CSV with row-count exceeding the default cap. | HTTP 400; error about row limit; no rows inserted. | API | Cap is env-gated: default 500 (or 2000 if env var set). See `project_envgated_caps_live.md`. AUTOMATION GAP. |
| TC-EDGE-099 | Admin | Product CSV bulk upload — file with exactly cap rows → 201 | P1 | 1. Upload CSV with exactly `cap` rows. | HTTP 201; all rows processed; per-row error report present in response. | API | AUTOMATION GAP. |
| TC-EDGE-100 | Admin | Legacy carton CSV upload — non-legacy CSV format (missing `count` column) → 400 | P1 | 1. Upload child-box CSV format to `POST /api/v1/master-cartons/legacy-upload`. | HTTP 400; error about missing required column; no legacy cartons created. | API | AUTOMATION GAP. |
| TC-EDGE-101 | Admin | Customer bulk CSV upload — duplicate firm_name in same upload batch → partial success with per-row errors | P1 | 1. Upload CSV with two rows having the same `firm_name`. | HTTP 201 or 207 multi-status; first row created; second row flagged as duplicate in errors array; partial insertion or full rejection depending on service logic. | API | AUTOMATION GAP. |
| TC-EDGE-102 | Admin | Customer sample CSV endpoint returns valid CSV (not HTML or JSON) | P0 | 1. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 200; `Content-Type` contains `text/csv` or `application/octet-stream`; response body is parseable CSV with correct headers. | API | AUTOMATION GAP. |
| TC-EDGE-103 | Admin | Child-box sample CSV endpoint → valid CSV | P0 | 1. `GET /api/v1/child-boxes/bulk-upload/sample`. | HTTP 200; valid CSV format; no 404 UUID error (route ordering test overlap with §20.3). | API | AUTOMATION GAP. |
| TC-EDGE-104 | Admin | Legacy carton sample CSV endpoint → valid CSV | P0 | 1. `GET /api/v1/master-cartons/legacy-upload/sample`. | HTTP 200; valid CSV. | API | AUTOMATION GAP. |

---

## §20.9 — Env-Gated Caps

> Child-box label printing: env var `NEXT_PUBLIC_CHILD_BOX_LABEL_CAP` (FE) +
> backend cap controls max boxes in one label batch (default 500, cap 1500 if set).
> Product CSV: `PRODUCT_CSV_CAP` env var (default 500, env-set max 2000).
> `/bulk-multi-size` child-box count: env-gated (default 500).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-105 | Admin | Child-box label print: request 501 boxes without cap env var → rejected at default 500 cap | P0 | 1. Ensure `NEXT_PUBLIC_CHILD_BOX_LABEL_CAP` not set (or set to 500). 2. Select 501+ boxes for label printing on `/child-boxes` label UI. | UI shows error or prevents selecting > 500; API returns 400 if over-cap request reaches backend. | E2E | Frontend cap is enforced client-side via `NEXT_PUBLIC_CHILD_BOX_LABEL_CAP`. AUTOMATION GAP. |
| TC-EDGE-106 | Admin | Child-box label print: request 1500 boxes with cap env var set to 1500 → accepted | P1 | 1. Set `NEXT_PUBLIC_CHILD_BOX_LABEL_CAP=1500` (FE build env). 2. Select 1500 boxes for labels. | Labels generated for 1500 boxes; no cap error. | E2E | Only testable when FE is rebuilt with correct env. AUTOMATION GAP. |
| TC-EDGE-107 | Admin | Product CSV upload 2001 rows with `PRODUCT_CSV_CAP=2000` → rejected | P1 | 1. Set `PRODUCT_CSV_CAP=2000`. 2. Upload CSV with 2001 rows. | HTTP 400; "Row count exceeds 2000 limit". | API | AUTOMATION GAP. |
| TC-EDGE-108 | Admin | Product CSV upload 2000 rows with `PRODUCT_CSV_CAP=2000` → 201 | P1 | 1. Set `PRODUCT_CSV_CAP=2000`. 2. Upload CSV with exactly 2000 rows (no conflicts). | HTTP 201; all rows processed in batches; no timeout. | API | AUTOMATION GAP. |
| TC-EDGE-109 | Admin | Bulk-multi-size without env var: count exceeds default cap → 400 | P1 | 1. Ensure `CHILD_BOX_BULK_CAP` not set. 2. `POST /api/v1/child-boxes/bulk-multi-size` with count > default cap. | HTTP 400; cap exceeded error. | API | AUTOMATION GAP. |

---

## §20.10 — Pagination Boundary

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-110 | Admin | `page=1&limit=10` → correct pagination meta | P0 | 1. `GET /api/v1/products?page=1&limit=10`. | HTTP 200; `data.length <= 10`; pagination fields present (`total`, `page`). | E2E | Spec 27 TC-PAGE-001. |
| TC-EDGE-111 | Admin | `page=999` (beyond data) → empty array | P0 | 1. `GET /api/v1/products?page=999&limit=10`. | HTTP 200; `data: []`; `total >= 0`; no 500. | E2E | Spec 27 TC-PAGE-002. |
| TC-EDGE-112 | Admin | `limit=100` (MAX_LIMIT) → 200 | P1 | 1. `GET /api/v1/products?limit=100`. | HTTP 200; at most 100 rows; no error. | API | `PAGINATION.MAX_LIMIT: 100`. AUTOMATION GAP. |
| TC-EDGE-113 | Admin | `limit=101` (exceeds MAX_LIMIT) → 400 or capped at 100 | P1 | 1. `GET /api/v1/products?limit=101`. | HTTP 400 OR HTTP 200 with at most 100 rows. No 500. Response never returns > 100 rows. | API | AUTOMATION GAP. |
| TC-EDGE-114 | Admin | Pagination consistent: page 1 + page 2 do not overlap | P1 | 1. `GET /products?page=1&limit=5` — note 5 IDs. 2. `GET /products?page=2&limit=5`. | No ID in page 1 appears in page 2. Total distinct = 10 (assuming ≥10 products). | API | AUTOMATION GAP. |
| TC-EDGE-115 | Admin | `page=0` → server normalizes or returns 400, no 500 | P1 | 1. `GET /api/v1/products?page=0`. | HTTP 200 with page-1 data OR HTTP 400; no 500. | API | AUTOMATION GAP. |
| TC-EDGE-116 | Admin | `limit=0` → server normalizes or returns 400, no 500 | P1 | 1. `GET /api/v1/products?limit=0`. | HTTP 200 (default limit applied) OR HTTP 400; no 500; does NOT return all rows. | API | AUTOMATION GAP. |

---

## §20.11 — Authentication Token Edge Cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-117 | Unauthenticated | No Authorization header → 401 | P0 | 1. `GET /api/v1/products` with no `Authorization` header. | HTTP 401; `success: false`; no data. | API | AUTOMATION GAP. |
| TC-EDGE-118 | Unauthenticated | Malformed token (not a JWT) → 401 | P0 | 1. `GET /api/v1/products` with `Authorization: Bearer not.a.valid.jwt`. | HTTP 401; JWT verification error; no data. | API | AUTOMATION GAP. |
| TC-EDGE-119 | Any | Expired JWT → 401 | P1 | 1. Craft a token with `exp` in the past (or wait for expiry). 2. Use on any protected endpoint. | HTTP 401; token-expired error; frontend redirects to login. | API + E2E | Expiry = `JWT_EXPIRY` env (default 3600 s). AUTOMATION GAP. |
| TC-EDGE-120 | Any | Tampered payload (role changed) but original signature → 401 | P1 | 1. Decode JWT. 2. Change `roleId` in payload. 3. Re-encode without re-signing. 4. Use tampered token. | HTTP 401; signature mismatch; no data returned. | API | AUTOMATION GAP. |
| TC-EDGE-121 | Any | Token mid-session: token expiry while navigating (frontend) → redirect to login | P1 | 1. Log in as Admin. 2. Simulate token expiry (set system clock or manipulate token). 3. Trigger any API call from the frontend. | Frontend detects 401 response; redirects to `/login`; no stale data visible. | E2E | AUTOMATION GAP. |
| TC-EDGE-122 | Any | `lowercase "bearer"` prefix on Authorization header → 200 or documented 401 | P1 | 1. `GET /api/v1/products` with `authorization: bearer <valid_token>` (lowercase). | HTTP 200 (case-insensitive) OR HTTP 401 (strict). Document actual behavior. | API | AUTOMATION GAP. |
| TC-EDGE-123 | Any | Two simultaneous logins (same user, two browsers) → both tokens valid | P2 | 1. `POST /auth/login` twice simultaneously with same creds. | Both return HTTP 200 with valid tokens. Both tokens accepted on protected endpoints (stateless JWT — no revocation). | API | AUTOMATION GAP. |
| TC-EDGE-124 | Any | Deactivated user's token used after deactivation → 401 or 403 | P1 | 1. Admin creates user B. B logs in. 2. Admin deactivates user B (`is_active = false`). 3. B uses existing token. | HTTP 401 or 403; "account deactivated" or similar; B cannot access data. Document whether JWT is re-checked against DB or purely stateless. | Integration | Auth middleware checks `is_active` in login SQL but may not re-check per request. AUTOMATION GAP. |
| TC-EDGE-125 | Any | Role changed to lower-privilege role mid-session — stale token | P1 | 1. Login as user X (Admin). 2. Another Admin changes X's role to Warehouse Operator. 3. X uses existing Admin token on `/api/v1/reports/samples`. | If role is baked into JWT: HTTP 200 (stale until expiry). If `authorizePermission` re-reads DB: HTTP 403. Document actual behavior. | Integration | `authorizePermission` re-queries `role_permissions` per request via `JOIN` — so role change IS effective immediately. AUTOMATION GAP. |

---

## §20.12 — RBAC Edge Cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-126 | Unauthenticated | Any unauthenticated POST to protected write endpoint → 401 | P0 | 1. `POST /api/v1/products` with no token. | HTTP 401. | API | AUTOMATION GAP. |
| TC-EDGE-127 | Unauthenticated | Any unauthenticated GET to protected read endpoint → 401 | P0 | 1. `GET /api/v1/products` with no token. | HTTP 401. | API | AUTOMATION GAP. |
| TC-EDGE-128 | Supervisor | GET /samples (no samples:read permission in seeded data) → 200 (GET ungated) | P0 | 1. Login as Supervisor. 2. `GET /api/v1/samples`. | HTTP 200; list returned. Samples GET routes have no `authorizePermission` guard — only `authenticate`. (Known discrepancy per Master Test Plan §Known-Discrepancy-1.) | API | AUTOMATION GAP. |
| TC-EDGE-129 | Warehouse Operator | GET /samples → 200 (GET ungated for any authenticated user) | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/samples`. | HTTP 200. Confirms GET no-permission-gate discrepancy applies to all roles. | API | AUTOMATION GAP. |
| TC-EDGE-130 | Dispatch Operator | GET /samples → 200 (GET ungated) | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/samples`. | HTTP 200. | API | AUTOMATION GAP. |
| TC-EDGE-131 | Supervisor | POST /samples (requires samples:create) → 403 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/samples` with valid body. | HTTP 403; "Required permission: samples:create". | API | AUTOMATION GAP. |
| TC-EDGE-132 | Warehouse Operator | POST /samples → 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/samples`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-EDGE-133 | Dispatch Operator | POST /samples → 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/samples`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-EDGE-134 | Supervisor | GET /ecommerce → 200 (GET ungated) | P0 | 1. Login as Supervisor. 2. `GET /api/v1/ecommerce`. | HTTP 200. Same discrepancy as samples. | API | AUTOMATION GAP. |
| TC-EDGE-135 | Warehouse Operator | GET /ecommerce → 200 (GET ungated) | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/ecommerce`. | HTTP 200. | API | AUTOMATION GAP. |
| TC-EDGE-136 | Dispatch Operator | GET /ecommerce → 200 (GET ungated) | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/ecommerce`. | HTTP 200. | API | AUTOMATION GAP. |
| TC-EDGE-137 | Supervisor | POST /dispatches → 403 (Supervisor is dispatch:read only) | P0 | 1. Login as Supervisor. 2. `POST /api/v1/dispatches` with valid CLOSED carton + customer. | HTTP 403; "Required permission: dispatch:create". | API | Per access matrix Supervisor has dispatch:read only. AUTOMATION GAP. |
| TC-EDGE-138 | Warehouse Operator | POST /dispatches → 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/dispatches`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-EDGE-139 | Dispatch Operator | POST /dispatches → 201 (allowed) | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/dispatches` with CLOSED carton + customer. | HTTP 201. Dispatch Operator has `dispatch:create`. | API | AUTOMATION GAP. |
| TC-EDGE-140 | Supervisor | DELETE /products/:id → 403 | P0 | 1. Login as Supervisor. 2. `DELETE /api/v1/products/<id>`. | HTTP 403. Only Admin has products:delete. | API | AUTOMATION GAP. |
| TC-EDGE-141 | Warehouse Operator | DELETE /products/:id → 403 | P0 | 1. Login as Warehouse Operator. 2. `DELETE /api/v1/products/<id>`. | HTTP 403. | API | AUTOMATION GAP. |
| TC-EDGE-142 | Admin | Custom role with `max_stage=ACTIVE` on `packing:pack` — cannot pack into CLOSED carton | P1 | 1. Via Role Manager, create custom role R1 with `packing:pack` + `max_stage=ACTIVE`. 2. Login as user with R1. 3. Attempt to pack a box into a CLOSED carton. | HTTP 403; "Permission denied: packing:pack is restricted at stage CLOSED (your role allows up to ACTIVE)". | Integration | `authorizePermission` stageCheck logic. AUTOMATION GAP. |
| TC-EDGE-143 | Any | `authorizePermission` re-reads role_permissions per request — permission revoked mid-session is immediately effective | P1 | 1. Login as Supervisor (has `cartons:create`). 2. Admin revokes `cartons:create` from Supervisor role via Role Manager. 3. Supervisor immediately tries `POST /api/v1/master-cartons`. | HTTP 403; no caching — permission revoked takes immediate effect. | Integration | `authorizePermission` does `JOIN role_permissions` on every request. AUTOMATION GAP. |

---

## §20.13 — Empty State & Network-Error UI

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-144 | Admin | /products with no products → empty state rendered | P1 | 1. Ensure no products exist. 2. Navigate to `/products`. | UI shows "No products found" empty state; no JS error; no loading spinner frozen. | E2E | AUTOMATION GAP. |
| TC-EDGE-145 | Admin | /master-cartons with no cartons → empty state rendered | P1 | 1. Navigate to `/master-cartons` on empty DB. | Empty state message shown; no 500 error thrown by backend or frontend. | E2E | AUTOMATION GAP. |
| TC-EDGE-146 | Admin | /samples with no samples → empty state rendered | P1 | 1. Navigate to `/samples`. | Empty state shown. No "Cannot read properties of undefined" JS error. | E2E | AUTOMATION GAP. |
| TC-EDGE-147 | Admin | /inventory (drill-down) with no stock → empty state at root level | P1 | 1. Navigate to `/inventory`. | Breakdown shows empty sections list or "No stock data" message; no 500. | E2E | AUTOMATION GAP. |
| TC-EDGE-148 | Any | Network error on API call → error toast displayed, page does not crash | P1 | 1. Block the API backend (kill Docker container). 2. Navigate to `/products`. | Frontend shows network error toast or inline error message. No unhandled JS exception; reload button available. | E2E | AUTOMATION GAP. |
| TC-EDGE-149 | Any | Unknown 404 page (random URL) → 404 page rendered, not blank | P1 | 1. Navigate to `/completely-random-path-xyz`. | Next.js 404 page rendered with "Page Not Found" message. No blank white screen. | E2E | AUTOMATION GAP. |
| TC-EDGE-150 | Admin | Error toast / inline error: API 400 on form submit → field-level error shown | P1 | 1. Submit the "Create Product" form with `article_code` = 21 chars. | UI displays a validation error message near the `article_code` field (or in a toast); form is not submitted; no page crash. | E2E | AUTOMATION GAP. |
| TC-EDGE-151 | Admin | Invalid UUID in route param (e.g. /products/not-a-uuid) → 400 or 404 | P0 | 1. `GET /api/v1/products/not-a-valid-uuid`. | HTTP 400/404/422; `success: false`. NOT a 500 Postgres invalid UUID syntax error. | E2E | Spec 27 TC-ERR-001. |
| TC-EDGE-152 | Admin | Missing Content-Type on POST → no 500 | P0 | 1. `POST /api/v1/products` without `Content-Type` header. | HTTP 400 or 415 (body not parsed); no 500. | E2E | Spec 27 TC-ERR-002. |
| TC-EDGE-153 | Admin | Unknown API endpoint → JSON 404 (not HTML) | P0 | 1. `GET /api/v1/completely-nonexistent-xyz`. | HTTP 404; `Content-Type: application/json`; `success: false`. No HTML error page. | E2E | Spec 27 TC-ERR-003. |
| TC-EDGE-154 | Any | Health check available without authentication | P0 | 1. `GET /api/v1/health` with no token. | HTTP 200; `{"status":"ok"}` or similar. | API | AUTOMATION GAP. |

---

## §20.14 — Security

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-155 | Admin | HTML `<script>` tag in `article_name` — stored safely, no XSS | P0 | 1. `POST /api/v1/products` with `article_name: '<script>alert("xss")</script>'`. 2. Navigate to `/products`. | Backend: HTTP 201 or 400; if stored, `article_name` is escaped by React in the browser; no alert dialog fires. | E2E | Spec 27 TC-EDGE-008. React escapes JSX text by default. |
| TC-EDGE-156 | Any | SQL injection via login email field | P0 | 1. `POST /api/v1/auth/login` with `{"email":"' OR 1=1 --","password":"anything"}`. | HTTP 401; no 500; DB continues functioning. Parameterized query prevents injection. | API | AUTOMATION GAP. |
| TC-EDGE-157 | Admin | SQL injection via search param | P0 | 1. `GET /api/v1/products?search=' OR '1'='1' --` (URL-encoded). | HTTP 200 (returns matched results — effectively no results for the literal string); no 500; no unauthorized data leak. | E2E | Spec 27 TC-EDGE-009. |
| TC-EDGE-158 | Admin | Path traversal in file upload filename (`../../etc/passwd.png`) | P1 | 1. Upload product image with filename `../../etc/passwd.png`. | HTTP 200 or 400; file stored under multer-generated safe UUID name; original filename discarded; no directory traversal. | API | AUTOMATION GAP. |
| TC-EDGE-159 | Admin | `__proto__` field in JSON body — prototype not polluted | P1 | 1. `POST /api/v1/products` with `{"__proto__":{"admin":true},...valid fields}`. | HTTP 201 (unknown field ignored) or HTTP 400; `Object.prototype.admin` is NOT set on server; no pollution. | API | AUTOMATION GAP. |
| TC-EDGE-160 | Admin | Very long URL segment (2000 chars) does not 500 | P1 | 1. `GET /api/v1/products/<"A" × 2000>`. | HTTP 400 or HTTP 414 (URI Too Long); no 500 or OOM. | API | AUTOMATION GAP. |
| TC-EDGE-161 | Admin | Extremely large JSON body (> 10 MB) → 413 | P1 | 1. `POST /api/v1/products` with a 10 MB+ JSON payload (extra nested field). | HTTP 413; Express `express.json({limit:'10mb'})` rejects before any service code runs. | API | AUTOMATION GAP. |

---

## §20.15 — Dispatch Schema Refine Rules

> `createDispatchSchema` in `dispatch.schema.ts` has two `.refine()` calls:
> 1. Exactly one source (`master_carton_ids` XOR `sample_record_id` XOR `ecommerce_record_id`).
> 2. `customer_id` required ONLY for master-carton dispatch.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-162 | Dispatch Operator | Dispatch with zero sources → 400 | P0 | 1. `POST /api/v1/dispatches` with body `{"destination":"Test"}` (no source field). | HTTP 400; "Exactly one dispatch source must be provided". | API | Zod refine #1. AUTOMATION GAP. |
| TC-EDGE-163 | Dispatch Operator | Dispatch with two sources simultaneously → 400 | P0 | 1. `POST /api/v1/dispatches` with both `master_carton_ids` and `sample_record_id` set. | HTTP 400; "Exactly one dispatch source must be provided". | API | AUTOMATION GAP. |
| TC-EDGE-164 | Dispatch Operator | Master-carton dispatch without `customer_id` → 400 | P0 | 1. `POST /api/v1/dispatches` with `master_carton_ids` but no `customer_id`. | HTTP 400; "Customer is required for master carton dispatch". | API | Zod refine #2. AUTOMATION GAP. |
| TC-EDGE-165 | Dispatch Operator | Sample dispatch without `customer_id` → 201 (customer optional for sample/ecommerce) | P1 | 1. `POST /api/v1/dispatches` with `sample_record_id` (valid CLOSED sample) and no `customer_id`. | HTTP 201; dispatch created. `customer_id` is only mandatory for carton dispatch. | API | Zod refine #2 guard is conditional on `master_carton_ids`. AUTOMATION GAP. |
| TC-EDGE-166 | Dispatch Operator | Ecommerce dispatch without `customer_id` → 201 | P1 | 1. `POST /api/v1/dispatches` with `ecommerce_record_id` (valid CLOSED ecommerce record) and no `customer_id`. | HTTP 201. | API | AUTOMATION GAP. |
| TC-EDGE-167 | Dispatch Operator | `master_carton_ids` as empty array → 400 | P0 | 1. `POST /api/v1/dispatches` with `master_carton_ids: []`. | HTTP 400; "At least one master carton must be selected for dispatch" (Zod `.min(1)`). | API | AUTOMATION GAP. |

---

## §20.16 — Foot-Split Edge Cases (Sample Module)

> `assertFootAvailable()` in `sample.service.ts` enforces:
> - A PACKED/ECOMMERCE/DISPATCHED box cannot be sampled at all.
> - A box already in a sample as PAIR cannot accept any other foot.
> - A box with LEFT already sampled cannot accept LEFT again or PAIR.
> - Box reverts to FREE only when ALL feet are de-sampled (remaining active feet = 0).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-168 | Admin | Add same foot (LEFT) of same box to two different samples → second rejected | P0 | 1. Add box B1 LEFT foot to sample S1. 2. Add box B1 LEFT foot to sample S2. | S1 add: HTTP 201. S2 add: HTTP 400; "The left foot of child box B1 is already in a sample." | API | `assertFootAvailable` checks `activeFeet.includes(requestedFoot)`. AUTOMATION GAP. |
| TC-EDGE-169 | Admin | Add PAIR to a box that already has LEFT sampled → 400 | P0 | 1. Add box B1 LEFT foot to sample S1. 2. Add box B1 PAIR to sample S2. | S2 add: HTTP 400; "already has its left foot in a sample; cannot add the whole pair". | API | AUTOMATION GAP. |
| TC-EDGE-170 | Admin | Add LEFT foot to a box already sampled as PAIR → 400 | P0 | 1. Add box B1 PAIR to sample S1. 2. Add box B1 LEFT foot to sample S2. | S2 add: HTTP 400; "already fully in a sample (as a pair)". | API | AUTOMATION GAP. |
| TC-EDGE-171 | Admin | Box with LEFT and RIGHT in different samples — remove LEFT foot → box remains SAMPLE status (RIGHT still active) | P0 | 1. Add B1 LEFT → S1. 2. Add B1 RIGHT → S2. B1 status = SAMPLE. 3. Remove B1 from S1 (deactivate left mapping). | B1 status remains SAMPLE (RIGHT mapping still active). `child_boxes.status` = SAMPLE. | API | `removeBoxFromSample()`: `if (remainingFeet.length === 0)` set FREE. AUTOMATION GAP. |
| TC-EDGE-172 | Admin | Box with LEFT and RIGHT in different samples — remove both → box becomes FREE | P0 | 1. Add B1 LEFT → S1. Add B1 RIGHT → S2. 2. Remove B1 from S1. 3. Remove B1 from S2. | After step 3: B1 status = FREE. `SELECT status FROM child_boxes WHERE id=B1` = 'FREE'. | API | AUTOMATION GAP. |
| TC-EDGE-173 | Admin | GENERATED box with foot=LEFT added to sample — auto-activation fires | P1 | 1. Create GENERATED box B1. 2. `POST /api/v1/samples/add-box` with `{"child_box_id":"B1","foot":"LEFT"}`. | HTTP 200; `CHILD_ACTIVATED` transaction inserted; B1 status = SAMPLE. | API | `addBoxToSample()` auto-activates GENERATED boxes. AUTOMATION GAP. |
| TC-EDGE-174 | Admin | Box in PACKED status cannot be added to sample | P0 | 1. Pack box B1 into carton (status PACKED). 2. `POST /api/v1/samples/add-box` with B1. | HTTP 400; "currently PACKED and cannot be added to a sample". | API | `assertFootAvailable()` rejects PACKED status. AUTOMATION GAP. |
| TC-EDGE-175 | Admin | Box in ECOMMERCE status cannot be added to sample | P0 | 1. Add box B1 to ecommerce (status ECOMMERCE). 2. `POST /api/v1/samples/add-box` with B1. | HTTP 400; "currently ECOMMERCE". | API | AUTOMATION GAP. |
| TC-EDGE-176 | Admin | `box_feet` key in create-sample must match an entry in `child_box_barcodes`; unmatched key is silently ignored | P2 | 1. `POST /api/v1/samples` with `child_box_barcodes: ["CB000001"]` and `box_feet: {"CB000002": "LEFT"}`. | HTTP 201; CB000001 mapped with default PAIR (CB000002 key has no matching barcode, ignored); no error. | API | `footMap` only keys barcodes that are in the barcodes array via `footMap[barcode] ?? 'PAIR'`. AUTOMATION GAP. |

---

## §20.17 — Rate Limit Behavior

> `RATE_LIMIT.MAX_REQUESTS: 50 000` per 15-min window (`config/constants.ts`).
> In practice unreachable in single-user testing. Tests document the configuration
> and ensure headers are present; exhaustion tests are marked P3/Manual only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-EDGE-177 | Any | Rate-limit headers present on normal responses | P2 | 1. Make any authenticated API request (e.g. `GET /api/v1/products`). 2. Inspect response headers. | Response contains `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers (if `express-rate-limit` is configured with headers). | API | AUTOMATION GAP. Document whether headers are returned. |
| TC-EDGE-178 | Any | Auth endpoint has its own rate-limit window (also 50 000) | P2 | 1. Inspect `config/constants.ts`. 2. Make a login request. | `AUTH_MAX_REQUESTS: 50000` — same as main limiter. No separate stricter limit is enforced. | Manual | `AUTH_MAX_REQUESTS: 50000` in constants. AUTOMATION GAP (effectively no special auth rate-limit). |
| TC-EDGE-179 | Any | Exceeding 50 000 requests in 15 min → 429 | P3 | 1. Script 50 001 rapid requests to any endpoint in a 15-min window. | HTTP 429 Too Many Requests; `Retry-After` header present. Server continues serving other clients. | Manual | Effectively unreachable in normal testing; documented for completeness. |
