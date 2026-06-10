# Phase 13 — Dispatch

**Module:** Dispatch (multi-source: master carton, sample, e-commerce)
**Suite version:** v3 — refreshed 2026-06-09
**TC ID prefix:** `TC-DSP-`
**Roles under test:** Admin (`admin@binny.com / Admin@123`), Supervisor (`supervisor@binny.com / Sup@123`), Warehouse Operator (`warehouse@binny.com / Wh@123`), Dispatch Operator (`dispatch@binny.com / Dp@123`)

> **Code ground truth (verified 2026-06-09):**
> - `backend/src/routes/dispatch.routes.ts` — POST `/` → `authorizePermission('dispatch:create')` + `authenticate`; GET `/` → `authenticate` only (no permission gate); GET `/:id` → `authenticate` only.
> - `backend/seeds/001_roles.ts` — Supervisor holds `dispatch:read` only; does **NOT** hold `dispatch:create` or `dispatch:update`. Dispatch Operator holds `dispatch:create`, `dispatch:read`, `dispatch:update`.
> - `backend/src/models/schemas/dispatch.schema.ts` — master-carton dispatch requires `customer_id` (second `.refine()`); sample and e-commerce dispatch do not. `master_carton_ids` max 200.
> - `backend/src/services/dispatch.service.ts` — master-carton accepts `ACTIVE` or `CLOSED` status; sample accepts `ACTIVE` or `CLOSED`; e-commerce accepts `ACTIVE` or `CLOSED`; foot-split last-foot logic applies only to sample dispatch.
>
> **⚠ Matrix discrepancy vs. old phase-13 file:** TC-DISP-081 (old) claimed "Supervisor can POST /dispatches → 201". This is **wrong**. Supervisor lacks `dispatch:create` in seeds. The correct result is **403**. All Supervisor → dispatch:create TCs in this file assert 403.
>
> **⚠ Discrepancy vs. old TC-DISP-021:** old file said ACTIVE master carton dispatch succeeds without a customer. Schema requires `customer_id` for any master carton dispatch. Any master-carton POST without `customer_id` → 400 "Customer is required for master carton dispatch". TCs in this file reflect the correct behavior.
>
> **GET /dispatches and GET /dispatches/:id are auth-only** — no per-permission check. All 4 authenticated roles get 200.

> **Preconditions for all API tests:** Backend running. JWT obtained via `POST /api/v1/auth/login`. API base: `http://localhost:5000/api/v1`.
> **Dependency note:** Phase 10 (master cartons), Phase 11 (samples), and Phase 12 (e-commerce) must have seeded records before running dispatch tests. Roles must exist per seed file.

---

## Table of Contents

1. [Section 1 — Zod Schema Validation](#section-1--zod-schema-validation)
2. [Section 2 — Master Carton Dispatch (multi-carton, customer required)](#section-2--master-carton-dispatch)
3. [Section 3 — Sample Dispatch (single-record, ACTIVE or CLOSED, last-foot logic)](#section-3--sample-dispatch)
4. [Section 4 — E-commerce Dispatch (single-record, ACTIVE or CLOSED)](#section-4--e-commerce-dispatch)
5. [Section 5 — Status Transitions and Inventory Transactions](#section-5--status-transitions-and-inventory-transactions)
6. [Section 6 — Atomicity and Integrity](#section-6--atomicity-and-integrity)
7. [Section 7 — List and Detail Queries](#section-7--list-and-detail-queries)
8. [Section 8 — RBAC: Create (dispatch:create gated — POST only)](#section-8--rbac-create)
9. [Section 9 — RBAC: Read (auth-only GET — all roles)](#section-9--rbac-read)
10. [Section 10 — Unauthenticated Access](#section-10--unauthenticated-access)
11. [Section 11 — Frontend E2E: Dispatch Create Page (/dispatch)](#section-11--frontend-e2e-dispatch-create-page)
12. [Section 12 — Frontend E2E: Dispatches List Page (/dispatches)](#section-12--frontend-e2e-dispatches-list-page)
13. [Section 13 — DB CHECK Constraint](#section-13--db-check-constraint)
14. [Section 14 — Reverse Dispatch (not implemented)](#section-14--reverse-dispatch-not-implemented)

---

## Section 1 — Zod Schema Validation

> Tests the Zod `.refine()` exactly-one-source rule, field-length limits, and UUID format checks.
> All validation tests run as Admin. Zod fires before service logic.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-001 | Admin | POST /dispatches with no source fields returns 400 — exactly-one refine | P0 | 1. Authenticate as Admin. 2. POST `/api/v1/dispatches` body: `{"destination":"Test City","vehicle_number":"MH01AB1234"}` (no `master_carton_ids`, `sample_record_id`, or `ecommerce_record_id`). 3. Assert status and error. | HTTP 400. `success` = false. Error message contains "Exactly one dispatch source must be provided". No row in `dispatch_records`. | API | `spec 33 — TC-DMS-REJECT-003` |
| TC-DSP-002 | Admin | POST /dispatches with both master_carton_ids and sample_record_id returns 400 | P0 | 1. Authenticate as Admin. 2. POST body: `{"master_carton_ids":["00000000-0000-0000-0000-000000000001"],"sample_record_id":"00000000-0000-0000-0000-000000000002"}`. | HTTP 400. Error contains "Exactly one dispatch source must be provided". | API | `spec 33 — TC-DMS-REJECT-002` |
| TC-DSP-003 | Admin | POST /dispatches with sample_record_id and ecommerce_record_id together returns 400 | P0 | 1. Authenticate as Admin. 2. POST body: `{"sample_record_id":"00000000-0000-0000-0000-000000000001","ecommerce_record_id":"00000000-0000-0000-0000-000000000002"}`. | HTTP 400. Error contains "Exactly one dispatch source must be provided". | API | `spec 33 — TC-DMS-REJECT-001` |
| TC-DSP-004 | Admin | POST /dispatches with all three sources returns 400 | P0 | 1. Authenticate as Admin. 2. POST body with `master_carton_ids`, `sample_record_id`, and `ecommerce_record_id` all populated. | HTTP 400. Error contains "Exactly one dispatch source must be provided". | API | `spec 33 — TC-DMS-REJECT-004` |
| TC-DSP-005 | Admin | POST /dispatches with master_carton_ids as empty array returns 400 — zero-source | P1 | 1. Authenticate as Admin. 2. POST body: `{"master_carton_ids":[]}`. | HTTP 400. Error contains "Exactly one dispatch source must be provided" (empty array counts as 0 sources in refine). | API | AUTOMATION GAP — not currently in spec 33 |
| TC-DSP-006 | Admin | POST /dispatches master_carton_ids but no customer_id returns 400 — customer required | P0 | 1. Authenticate as Admin. 2. Obtain a CLOSED master carton ID `mc_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"destination":"Mumbai"}` (no `customer_id`). | HTTP 400. `path` = `customer_id`. Error message: "Customer is required for master carton dispatch". No dispatch row created. | API | AUTOMATION GAP — second Zod refine; missing from both Playwright specs |
| TC-DSP-007 | Admin | POST /dispatches with master_carton_ids > 200 items returns 400 | P1 | 1. Authenticate as Admin. 2. POST body: `{"master_carton_ids": [<201 valid-format UUID strings>],"customer_id":"<valid_uuid>"}`. | HTTP 400. Error: "Cannot dispatch more than 200 cartons at once". | API | AUTOMATION GAP |
| TC-DSP-008 | Admin | POST /dispatches with invalid UUID in master_carton_ids returns 400 | P1 | 1. Authenticate as Admin. 2. POST body: `{"master_carton_ids":["not-a-uuid"],"customer_id":"<valid_uuid>"}`. | HTTP 400. Error: "Invalid master carton ID format". | API | AUTOMATION GAP |
| TC-DSP-009 | Admin | POST /dispatches with invalid UUID for sample_record_id returns 400 | P1 | 1. Authenticate as Admin. 2. POST body: `{"sample_record_id":"not-a-uuid"}`. | HTTP 400. Error: "Invalid sample record ID format". | API | AUTOMATION GAP |
| TC-DSP-010 | Admin | POST /dispatches with invalid UUID for ecommerce_record_id returns 400 | P1 | 1. Authenticate as Admin. 2. POST body: `{"ecommerce_record_id":"not-a-uuid"}`. | HTTP 400. Error: "Invalid ecommerce record ID format". | API | AUTOMATION GAP |
| TC-DSP-011 | Admin | POST /dispatches with dispatch_date in non-ISO format returns 400 | P1 | 1. Authenticate as Admin. 2. Obtain a valid CLOSED MC `mc_id` and `cust_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","dispatch_date":"30-04-2026"}`. | HTTP 400. Error: "Invalid date format, expected ISO 8601". | API | AUTOMATION GAP |
| TC-DSP-012 | Admin | POST /dispatches with lr_number exceeding 100 chars returns 400 | P2 | 1. Authenticate as Admin. 2. Obtain closed MC `mc_id` and `cust_id`. 3. POST body with `lr_number` = 101-char string. | HTTP 400. Error: "LR number must not exceed 100 characters". | API | AUTOMATION GAP |
| TC-DSP-013 | Admin | POST /dispatches with vehicle_number exceeding 50 chars returns 400 | P2 | 1. Authenticate as Admin. 2. POST body with `vehicle_number` = 51-char string alongside valid source. | HTTP 400. Error: "Vehicle number must not exceed 50 characters". | API | AUTOMATION GAP |
| TC-DSP-014 | Admin | GET /dispatches/:id with invalid UUID format returns 400 | P1 | 1. Authenticate as Admin. 2. GET `/api/v1/dispatches/not-a-uuid`. | HTTP 400. Error: "Invalid dispatch ID format". | API | AUTOMATION GAP |

---

## Section 2 — Master Carton Dispatch

> `_dispatchMasterCartons` branch. Accepts ACTIVE or CLOSED cartons. `customer_id` is mandatory.
> One dispatch record is created per carton in the array. Entire batch is transactional.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-020 | Admin | Dispatch single CLOSED master carton succeeds — returns array of 1 dispatch record | P0 | 1. Authenticate as Admin. 2. Create and close a master carton with ≥1 PACKED box. Capture `mc_id` and `cust_id`. 3. POST `/api/v1/dispatches` body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Mumbai Warehouse","vehicle_number":"MH01AB1234","transport_details":"Fast Logistics","lr_number":"LR12345","notes":"Test"}`. | HTTP 201. Response `data` is array of length 1. Element: `id` (UUID), `master_carton_id` = `mc_id`, `destination` = "Mumbai Warehouse", `vehicle_number` = "MH01AB1234", `lr_number` = "LR12345", `sample_record_id` = null, `ecommerce_record_id` = null, `dispatch_date` is valid ISO timestamp. | API | `spec 21 — TC-DISP-ADM-001`; `spec 33 — TC-DMS-MC-001` |
| TC-DSP-021 | Admin | Dispatch single ACTIVE master carton (not yet closed) succeeds | P1 | 1. Authenticate as Admin. 2. Create a master carton with ≥1 box packed (status = ACTIVE, not CLOSED). Capture `mc_id` and `cust_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Delhi Store"}`. | HTTP 201. Dispatch record created with `master_carton_id` = `mc_id`. Service validates ACTIVE status as permitted. | API | AUTOMATION GAP — spec 33 TC-DMS-MC-001 only uses CLOSED; ACTIVE path uncovered |
| TC-DSP-022 | Admin | Dispatch CREATED (empty) master carton returns 400 | P0 | 1. Authenticate as Admin. 2. Create a master carton but do NOT pack any boxes (status = CREATED). 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"X"}`. | HTTP 400. Error: "Cartons must be in ACTIVE or CLOSED status for dispatch. Invalid: BINNY-MC-…". No dispatch record created. Carton remains CREATED. | API | `spec 21 — TC-DISP-VAL-002` indirectly; AUTOMATION GAP for CREATED-status variant |
| TC-DSP-023 | Admin | Dispatch already DISPATCHED master carton returns 400 | P0 | 1. Authenticate as Admin. 2. Create, close, and dispatch a carton (`mc_id` → DISPATCHED). 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>"}`. | HTTP 400. Error: "Cartons must be in ACTIVE or CLOSED status for dispatch. Invalid: BINNY-MC-…". Second dispatch record NOT created. | API | `spec 21 — TC-DISP-VAL-002` |
| TC-DSP-024 | Admin | Dispatch multiple cartons in one request returns array of N dispatch records | P0 | 1. Authenticate as Admin. 2. Create and close 3 distinct master cartons (`mc1`, `mc2`, `mc3`). 3. POST body: `{"master_carton_ids":["<mc1>","<mc2>","<mc3>"],"customer_id":"<cust_id>","destination":"Chennai Store"}`. | HTTP 201. Response `data` is array of length 3. Each element has a distinct `id` and `master_carton_id` matching `mc1`, `mc2`, `mc3`. All have `destination` = "Chennai Store". `customer_id` same for all 3. | API | AUTOMATION GAP — multi-carton batch not in spec 33 |
| TC-DSP-025 | Admin | Dispatch non-existent master carton ID returns 404 | P0 | 1. Authenticate as Admin. 2. POST body: `{"master_carton_ids":["00000000-0000-0000-0000-000000000000"],"customer_id":"<cust_id>"}`. | HTTP 404. Error: "Master cartons not found: 00000000-0000-0000-0000-000000000000". No dispatch row created. | API | AUTOMATION GAP |
| TC-DSP-026 | Admin | customer_id auto-fills destination from customer delivery_location when destination omitted | P1 | 1. Authenticate as Admin. 2. Create a customer with `delivery_location` = "Pune Hub". Capture `cust_id`. 3. Close a master carton. 4. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>"}` (no `destination` field). | HTTP 201. Dispatch record `destination` = "Pune Hub" (auto-filled from customer). `customer_id` = `cust_id`. | Integration | AUTOMATION GAP — auto-fill logic in `_dispatchMasterCartons` lines 62-71 |
| TC-DSP-027 | Admin | Explicit destination overrides customer delivery_location | P1 | 1. Authenticate as Admin. 2. Create customer with `delivery_location` = "Pune Hub". 3. Close MC. 4. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Nagpur Outlet"}`. | HTTP 201. `destination` = "Nagpur Outlet" (explicit value wins). | Integration | AUTOMATION GAP |
| TC-DSP-028 | Admin | Custom dispatch_date stored verbatim | P1 | 1. Authenticate as Admin. 2. Close MC with `mc_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","dispatch_date":"2026-01-15T10:00:00.000Z"}`. | HTTP 201. Response `dispatch_date` = "2026-01-15T10:00:00.000Z" (or ISO equivalent). DB `dispatch_date` matches. | API | AUTOMATION GAP |
| TC-DSP-029 | Admin | All optional fields accepted when provided | P1 | 1. Authenticate as Admin. 2. Close MC with `mc_id`. 3. POST body with `destination`, `vehicle_number`, `lr_number`, `transport_details`, `dispatch_date`, `notes` all set. | HTTP 201. Response element contains all provided field values. `notes` stored. | API | `spec 33 — TC-DMS-OPTIONAL-002` |
| TC-DSP-030 | Admin | Dispatch with no optional fields (only source + customer_id) succeeds | P1 | 1. Authenticate as Admin. 2. Close MC. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>"}`. | HTTP 201. Dispatch created. Optional fields (`destination`, `vehicle_number`, etc.) are null in response. | API | `spec 33 — TC-DMS-OPTIONAL-001` adapted for MC (customer required) |
| TC-DSP-031 | Admin | Mix of valid and invalid carton IDs in same request rejects entire batch — atomicity | P1 | 1. Authenticate as Admin. 2. Close one real MC (`mc_valid`). 3. POST body: `{"master_carton_ids":["<mc_valid>","00000000-0000-0000-0000-000000000000"],"customer_id":"<cust_id>"}`. | HTTP 404. Error references the missing UUID. No dispatch rows created. `mc_valid` remains in prior status (not DISPATCHED) — confirms ROLLBACK. | Integration | AUTOMATION GAP — partial-batch atomicity |

---

## Section 3 — Sample Dispatch

> `_dispatchSample` branch. Accepts ACTIVE or CLOSED sample records. `customer_id` is optional.
> Foot-split logic: a child box transitions to DISPATCHED only when the dispatched sample holds
> its **last** active foot (i.e. no other non-dispatched sample holds the other foot of that box).
> CHILD_DISPATCHED transactions are logged per shipped foot (not per box-to-DISPATCHED transition).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-040 | Admin | Dispatch ACTIVE sample record succeeds — returns array of 1 dispatch record | P0 | 1. Authenticate as Admin. 2. Create a sample record, add ≥2 SAMPLE-status child boxes via foot assignment, leave status = ACTIVE. Capture `sr_id`. 3. POST body: `{"sample_record_id":"<sr_id>","destination":"Retailer Name"}`. | HTTP 201. Response `data` is array of length 1. Element: `sample_record_id` = `sr_id`, `master_carton_id` = null, `ecommerce_record_id` = null, `destination` = "Retailer Name". `metadata.child_box_count` ≥ 1. | API | `spec 33 — TC-DMS-SM-001` (CLOSED variant; ACTIVE variant is AUTOMATION GAP) |
| TC-DSP-041 | Admin | Dispatch CLOSED sample record succeeds | P1 | 1. Authenticate as Admin. 2. Create sample record, add boxes, close it (status = CLOSED). 3. POST body: `{"sample_record_id":"<sr_id>","destination":"Trade Show"}`. | HTTP 201. Dispatch created with `sample_record_id` = `sr_id`. | API | `spec 33 — TC-DMS-SM-001` |
| TC-DSP-042 | Admin | Dispatch CREATED (empty) sample record returns 400 | P0 | 1. Authenticate as Admin. 2. Create sample record but add no boxes (status = CREATED). 3. POST body: `{"sample_record_id":"<sr_id>"}`. | HTTP 400. Error: "Sample record must be in ACTIVE or CLOSED status for dispatch. Current status: CREATED". No dispatch row. | API | AUTOMATION GAP |
| TC-DSP-043 | Admin | Dispatch already DISPATCHED sample record returns 400 | P0 | 1. Authenticate as Admin. 2. Dispatch a sample record (status → DISPATCHED). 3. POST body: `{"sample_record_id":"<sr_id>"}` again. | HTTP 400. Error: "Sample record must be in ACTIVE or CLOSED status for dispatch. Current status: DISPATCHED". | API | AUTOMATION GAP |
| TC-DSP-044 | Admin | Dispatch non-existent sample_record_id returns 404 | P0 | 1. Authenticate as Admin. 2. POST body: `{"sample_record_id":"00000000-0000-0000-0000-000000000000"}`. | HTTP 404. Error: "Sample record not found". No dispatch row. | API | AUTOMATION GAP |
| TC-DSP-045 | Admin | Sample dispatch with no customer_id and no destination succeeds — both optional | P1 | 1. Authenticate as Admin. 2. Create ACTIVE sample. 3. POST body: `{"sample_record_id":"<sr_id>"}` (no `customer_id`, no `destination`). | HTTP 201. Dispatch created. `destination` = null in DB. No 400 from second Zod refine (customer not required for sample). | API | AUTOMATION GAP — confirms sample/EC exempt from customer_id requirement |
| TC-DSP-046 | Admin | Sample dispatch auto-fills destination from customer when customer_id provided and destination omitted | P1 | 1. Authenticate as Admin. 2. Create customer with `delivery_location` = "Showroom A". 3. Create ACTIVE sample. 4. POST body: `{"sample_record_id":"<sr_id>","customer_id":"<cust_id>"}`. | HTTP 201. `destination` = "Showroom A". `customer_id` set. | Integration | AUTOMATION GAP — same auto-fill pattern in `_dispatchSample` |
| TC-DSP-047 | Admin | Foot-split: box with only one foot in dispatched sample transitions to DISPATCHED | P0 | 1. Authenticate as Admin. 2. Create child box `cb1`. Add `cb1` with foot=PAIR (or only assignment) to sample `sr1`. Do NOT add `cb1` to any other live sample. 3. Dispatch `sr1`. 4. Query `child_boxes` where `id` = `cb1`. | `cb1.status` = 'DISPATCHED'. The box has no remaining active foot in any non-dispatched sample, so last-foot query includes it. | Integration | AUTOMATION GAP — last-foot logic line 229-241 of dispatch.service.ts |
| TC-DSP-048 | Admin | Foot-split: box split across two samples stays SAMPLE when only one sample dispatches | P0 | 1. Authenticate as Admin. 2. Create child box `cb1`. 3. Add `cb1` LEFT foot to `sr1`, RIGHT foot to `sr2`. Both samples ACTIVE. 4. Dispatch `sr1`. 5. Query `child_boxes` where `id` = `cb1`. | `cb1.status` remains 'SAMPLE' (NOT DISPATCHED) because its RIGHT foot is still in the live sample `sr2`. | Integration | AUTOMATION GAP — foot-split divergence from simple box-level dispatch; critical correctness test |
| TC-DSP-049 | Admin | Foot-split: box transitions to DISPATCHED when second sample (holding its other foot) is also dispatched | P0 | 1. Continue from TC-DSP-048 setup after `sr1` is dispatched (`cb1` still SAMPLE). 2. Dispatch `sr2`. 3. Query `child_boxes` where `id` = `cb1`. | `cb1.status` = 'DISPATCHED'. Both feet now dispatched; last-foot condition satisfied on `sr2`'s dispatch. | Integration | AUTOMATION GAP — last-foot resolution on second dispatch |
| TC-DSP-050 | Admin | CHILD_DISPATCHED transaction logged per shipped foot even when box stays SAMPLE (foot-split mid-flight) | P1 | 1. Setup: `cb1` with LEFT foot in `sr1`, RIGHT foot in `sr2`. Dispatch `sr1`. 2. Query `inventory_transactions` where `transaction_type` = 'CHILD_DISPATCHED' and `child_box_id` = `cb1_id`. | At least 1 CHILD_DISPATCHED row for `cb1` (the LEFT foot). `metadata.foot` = 'LEFT'. `cb1` itself is still SAMPLE (box-level not flipped). | Integration | AUTOMATION GAP — per-foot audit logging lines 253-264 of dispatch.service.ts |
| TC-DSP-051 | Admin | Sample dispatch creates exactly one dispatch_record row | P0 | 1. Authenticate as Admin. 2. Dispatch an ACTIVE sample `sr_id`. 3. SELECT COUNT(*) FROM dispatch_records WHERE sample_record_id = '<sr_id>'. | Count = 1. Single row. `sample_record_id` = `sr_id`, `master_carton_id` = null, `ecommerce_record_id` = null. | Integration | 1:1 contract |

---

## Section 4 — E-commerce Dispatch

> `_dispatchEcommerce` branch. Accepts ACTIVE or CLOSED e-commerce records. `customer_id` is optional.
> No foot logic. All ECOMMERCE-status active-mapping child boxes flip to DISPATCHED immediately.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-060 | Admin | Dispatch ACTIVE ecommerce record succeeds — returns array of 1 dispatch record | P0 | 1. Authenticate as Admin. 2. Create ecommerce record, add ECOMMERCE-status child boxes, leave status = ACTIVE. Capture `ec_id`. 3. POST body: `{"ecommerce_record_id":"<ec_id>","destination":"Amazon FC"}`. | HTTP 201. Response array of 1 element with `ecommerce_record_id` = `ec_id`, `master_carton_id` = null, `sample_record_id` = null, `destination` = "Amazon FC". | API | AUTOMATION GAP — spec 33 TC-DMS-EC-001 uses CLOSED; ACTIVE variant not covered |
| TC-DSP-061 | Admin | Dispatch CLOSED ecommerce record succeeds | P1 | 1. Authenticate as Admin. 2. Create EC record, add boxes, close it. 3. POST body: `{"ecommerce_record_id":"<ec_id>","destination":"Flipkart Hub"}`. | HTTP 201. Dispatch record created. | API | `spec 33 — TC-DMS-EC-001` |
| TC-DSP-062 | Admin | Dispatch CREATED (empty) ecommerce record returns 400 | P0 | 1. Authenticate as Admin. 2. Create EC record but add no boxes (status = CREATED). 3. POST body: `{"ecommerce_record_id":"<ec_id>"}`. | HTTP 400. Error: "E-commerce record must be in ACTIVE or CLOSED status for dispatch. Current status: CREATED". | API | AUTOMATION GAP |
| TC-DSP-063 | Admin | Dispatch already DISPATCHED ecommerce record returns 400 | P0 | 1. Authenticate as Admin. 2. Dispatch an EC record (status → DISPATCHED). 3. POST body again: `{"ecommerce_record_id":"<ec_id>"}`. | HTTP 400. Error: "E-commerce record must be in ACTIVE or CLOSED status for dispatch. Current status: DISPATCHED". | API | AUTOMATION GAP |
| TC-DSP-064 | Admin | Dispatch non-existent ecommerce_record_id returns 404 | P0 | 1. Authenticate as Admin. 2. POST body: `{"ecommerce_record_id":"00000000-0000-0000-0000-000000000000"}`. | HTTP 404. Error: "E-commerce record not found". | API | AUTOMATION GAP |
| TC-DSP-065 | Admin | E-commerce dispatch with no customer_id succeeds — customer not required | P1 | 1. Authenticate as Admin. 2. Create ACTIVE EC record. 3. POST body: `{"ecommerce_record_id":"<ec_id>"}` (no `customer_id`, no `destination`). | HTTP 201. Dispatch created. No 400. | API | AUTOMATION GAP |
| TC-DSP-066 | Admin | E-commerce dispatch auto-fills destination from customer delivery_location | P1 | 1. Authenticate as Admin. 2. Create customer with `delivery_location` = "Warehouse B". 3. Create ACTIVE EC. 4. POST body: `{"ecommerce_record_id":"<ec_id>","customer_id":"<cust_id>"}`. | HTTP 201. `destination` = "Warehouse B". | Integration | AUTOMATION GAP — auto-fill in `_dispatchEcommerce` lines 350-360 |
| TC-DSP-067 | Admin | E-commerce dispatch creates exactly one dispatch_record row | P0 | 1. Authenticate as Admin. 2. Dispatch an ACTIVE EC `ec_id`. 3. SELECT COUNT(*) FROM dispatch_records WHERE ecommerce_record_id = '<ec_id>'. | Count = 1. `ecommerce_record_id` = `ec_id`, `master_carton_id` = null, `sample_record_id` = null. | Integration | 1:1 contract |

---

## Section 5 — Status Transitions and Inventory Transactions

> Verifies DB-level status changes and transaction log entries for all three dispatch sources.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-070 | Admin | Master carton status becomes DISPATCHED after dispatch | P0 | 1. Authenticate as Admin. 2. Create and close MC (`mc_id`). 3. Dispatch it. 4. SELECT status, dispatched_at FROM master_cartons WHERE id = '<mc_id>'. | `status` = 'DISPATCHED'. `dispatched_at` is non-null timestamp. | Integration | `spec 21 — TC-DISP-STATE-001`; `spec 33 — TC-DMS-MC-001` |
| TC-DSP-071 | Admin | PACKED child boxes inside dispatched MC become DISPATCHED | P0 | 1. Authenticate as Admin. 2. Create MC with boxes `cb1`, `cb2`, `cb3` (PACKED status). Close. Dispatch. 3. SELECT status FROM child_boxes WHERE id IN ('<cb1>','<cb2>','<cb3>'). | All 3 rows `status` = 'DISPATCHED'. | Integration | `spec 21 — TC-DISP-STATE-002`; service queries `cb.status = PACKED` via `carton_child_mapping` |
| TC-DSP-072 | Admin | CARTON_DISPATCHED transaction logged for each dispatched master carton | P0 | 1. Authenticate as Admin. 2. Dispatch MC `mc_id`. 3. SELECT * FROM inventory_transactions WHERE transaction_type = 'CARTON_DISPATCHED' AND master_carton_id = '<mc_id>'. | ≥1 row. `transaction_type` = 'CARTON_DISPATCHED', `master_carton_id` = `mc_id`, `performed_by` = dispatching user's ID. `metadata.dispatch_record_id` present. | Integration | AUTOMATION GAP |
| TC-DSP-073 | Admin | CHILD_DISPATCHED transaction logged for each PACKED box in dispatched MC | P0 | 1. Authenticate as Admin. 2. Close MC with 3 boxes (`cb1`,`cb2`,`cb3`). Dispatch. 3. SELECT child_box_id FROM inventory_transactions WHERE transaction_type = 'CHILD_DISPATCHED' AND master_carton_id = '<mc_id>'. | 3 rows, one per box. Each `child_box_id` matches `cb1`, `cb2`, or `cb3`. `notes` contains destination. | Integration | AUTOMATION GAP |
| TC-DSP-074 | Admin | Sample record status becomes DISPATCHED after sample dispatch | P0 | 1. Authenticate as Admin. 2. Create ACTIVE sample `sr_id`. 3. Dispatch it. 4. SELECT status, dispatched_at FROM sample_records WHERE id = '<sr_id>'. | `status` = 'DISPATCHED'. `dispatched_at` non-null. | Integration | `spec 33 — TC-DMS-SM-001` |
| TC-DSP-075 | Admin | Last-foot child boxes in sample become DISPATCHED after sample dispatch | P0 | 1. Authenticate as Admin. 2. Create sample `sr_id` with 2 SAMPLE-status boxes (`cb1`, `cb2`) where each box has all feet in THIS sample only. 3. Dispatch `sr_id`. 4. SELECT status FROM child_boxes WHERE id IN ('<cb1>','<cb2>'). | Both `cb1` and `cb2` have `status` = 'DISPATCHED'. (Last-foot condition satisfied — no other live sample holds these boxes.) | Integration | `spec 33 — TC-DMS-SM-001` (state part) |
| TC-DSP-076 | Admin | SAMPLE_DISPATCHED transaction logged for sample dispatch | P0 | 1. Authenticate as Admin. 2. Dispatch sample `sr_id`. 3. SELECT * FROM inventory_transactions WHERE transaction_type = 'SAMPLE_DISPATCHED' ORDER BY created_at DESC LIMIT 1. | Row returned. `performed_by` = dispatching user ID. `metadata` JSON contains `sample_record_id`. | Integration | AUTOMATION GAP |
| TC-DSP-077 | Admin | CHILD_DISPATCHED transactions logged per shipped foot in sample dispatch | P1 | 1. Authenticate as Admin. 2. Create 2 boxes in sample `sr_id` with distinct feet. Dispatch. 3. SELECT child_box_id FROM inventory_transactions WHERE transaction_type = 'CHILD_DISPATCHED' AND metadata::json->>'sample_record_id' = '<sr_id>'. | ≥2 rows (one per shipped foot). `metadata.foot` present in each. | Integration | AUTOMATION GAP — per-foot audit rather than per-box |
| TC-DSP-078 | Admin | Ecommerce record status becomes DISPATCHED after EC dispatch | P0 | 1. Authenticate as Admin. 2. Create ACTIVE EC `ec_id`. 3. Dispatch it. 4. SELECT status, dispatched_at FROM ecommerce_records WHERE id = '<ec_id>'. | `status` = 'DISPATCHED'. `dispatched_at` non-null. | Integration | `spec 33 — TC-DMS-EC-001` |
| TC-DSP-079 | Admin | ECOMMERCE child boxes become DISPATCHED after EC dispatch | P0 | 1. Authenticate as Admin. 2. Create EC `ec_id` with 2 ECOMMERCE boxes (`cb1`,`cb2`). Dispatch. 3. SELECT status FROM child_boxes WHERE id IN ('<cb1>','<cb2>'). | Both `status` = 'DISPATCHED'. | Integration | `spec 33 — TC-DMS-EC-001` (state part) |
| TC-DSP-080 | Admin | ECOMMERCE_DISPATCHED transaction logged for EC dispatch | P0 | 1. Authenticate as Admin. 2. Dispatch EC `ec_id`. 3. SELECT * FROM inventory_transactions WHERE transaction_type = 'ECOMMERCE_DISPATCHED' ORDER BY created_at DESC LIMIT 1. | Row returned. `metadata.ecommerce_record_id` = `ec_id`. | Integration | AUTOMATION GAP |
| TC-DSP-081 | Admin | CHILD_DISPATCHED logged for each ECOMMERCE box in EC dispatch | P1 | 1. Authenticate as Admin. 2. Create EC with 2 boxes. Dispatch. 3. SELECT child_box_id FROM inventory_transactions WHERE transaction_type = 'CHILD_DISPATCHED' AND metadata::json->>'ecommerce_record_id' = '<ec_id>'. | 2 rows. Each references one of the two EC boxes. | Integration | AUTOMATION GAP |

---

## Section 6 — Atomicity and Integrity

> Verifies that multi-carton batch dispatch rolls back entirely on partial failure.
> DB CHECK constraint is independent of API.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-090 | Admin | Multi-carton batch with one invalid ID rolls back — no partial dispatch | P0 | 1. Authenticate as Admin. 2. Close two real cartons (`mc_valid1`, `mc_valid2`). Set `mc_valid2` status to 'DISPATCHED' directly in DB. 3. POST body: `{"master_carton_ids":["<mc_valid1>","<mc_valid2>"],"customer_id":"<cust_id>"}`. | HTTP 400. Error references `mc_valid2` as already-dispatched. `mc_valid1` status remains unchanged (CLOSED). No new rows in `dispatch_records` for either carton. | Integration | AUTOMATION GAP — atomicity via ROLLBACK; partial failure test |
| TC-DSP-091 | Admin | Multi-carton batch with one non-existent UUID rolls back — 404 | P1 | 1. Authenticate as Admin. 2. Close one real MC (`mc_valid`). 3. POST body: `{"master_carton_ids":["<mc_valid>","00000000-0000-0000-0000-000000000099"],"customer_id":"<cust_id>"}`. | HTTP 404. Error: "Master cartons not found: 00000000-0000-0000-0000-000000000099". `mc_valid` not dispatched. No rows inserted. | Integration | AUTOMATION GAP |
| TC-DSP-092 | Admin | DB CHECK constraint rejects raw INSERT with two non-null FK columns | P0 | 1. Direct DB access. 2. INSERT INTO dispatch_records (master_carton_id, sample_record_id, dispatched_by, dispatch_date) VALUES ('<mc_id>', '<sr_id>', '<user_id>', NOW()). | PostgreSQL raises constraint violation: `chk_dispatch_source_exactly_one`. INSERT rejected. | Integration | AUTOMATION GAP — DB-level; requires direct DB access |
| TC-DSP-093 | Admin | DB CHECK constraint rejects raw INSERT with all three FK columns null | P0 | 1. Direct DB access. 2. INSERT INTO dispatch_records (dispatched_by, dispatch_date) VALUES ('<user_id>', NOW()). | PostgreSQL constraint violation: `chk_dispatch_source_exactly_one`. INSERT rejected. | Integration | AUTOMATION GAP — DB-level |

---

## Section 7 — List and Detail Queries

> GET `/dispatches` and GET `/dispatches/:id` — auth-only, no permission gate.
> All 4 roles get 200. Source metadata (source_type, source_label) computed by service JOIN.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-100 | Admin | GET /dispatches returns paginated list with source_type and source_label | P0 | 1. Authenticate as Admin. 2. Dispatch one MC, one sample, one EC. 3. GET `/api/v1/dispatches?page=1&limit=25`. | HTTP 200. Response has `data` array and `total` integer. Each record has `source_type` ∈ {'master_carton','sample','ecommerce'} and `source_label` = relevant barcode. | API | `spec 21 — TC-DISP-READ-001`; `spec 33 — TC-DMS-LIST-001` |
| TC-DSP-101 | Admin | GET /dispatches?search=<barcode> returns matching records | P1 | 1. Authenticate as Admin. 2. Dispatch MC with known barcode `BINNY-MC-<id>`. 3. GET `/api/v1/dispatches?search=BINNY-MC-<id>`. | HTTP 200. `data` contains the dispatch for that carton. All returned records' `source_label` or `carton_barcode` match the search string. | API | AUTOMATION GAP — search filters: destination, lr_number, vehicle_number, barcodes, firm_name |
| TC-DSP-102 | Admin | GET /dispatches?from_date=&to_date= filters by dispatch_date range | P1 | 1. Authenticate as Admin. 2. Create one dispatch with `dispatch_date` = "2026-01-01T00:00:00.000Z" and one with "2026-06-01T00:00:00.000Z". 3. GET `?from_date=2026-05-01&to_date=2026-07-01`. | HTTP 200. Only the June dispatch in `data`. January dispatch excluded. | API | AUTOMATION GAP |
| TC-DSP-103 | Admin | GET /dispatches?destination=<text> filters by destination ILIKE | P1 | 1. Authenticate as Admin. 2. Dispatch to "Mumbai Warehouse" and to "Delhi Outlet". 3. GET `?destination=Mumbai`. | HTTP 200. Only records where `destination` ILIKE '%Mumbai%' appear. | API | AUTOMATION GAP |
| TC-DSP-104 | Admin | GET /dispatches/:id returns single dispatch record with correct source_type and source_label | P0 | 1. Authenticate as Admin. 2. Dispatch a sample record. Capture dispatch `id`. 3. GET `/api/v1/dispatches/<id>`. | HTTP 200. Single object. `sample_record_id` non-null. `master_carton_id` = null. `ecommerce_record_id` = null. `source_type` = 'sample'. `source_label` = sample barcode. | API | `spec 21 — TC-DISP-READ-002`; `spec 33 — TC-DMS-LIST-002` |
| TC-DSP-105 | Admin | GET /dispatches/:id for master_carton dispatch includes carton_barcode and child_count | P0 | 1. Authenticate as Admin. 2. Dispatch MC. Capture dispatch `id`. 3. GET `/api/v1/dispatches/<id>`. | HTTP 200. `source_type` = 'master_carton'. `carton_barcode` present (from JOIN with master_cartons). `child_count` present. `source_label` = `carton_barcode`. | API | AUTOMATION GAP |
| TC-DSP-106 | Admin | GET /dispatches/:id with non-existent UUID returns 404 | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/dispatches/00000000-0000-0000-0000-000000000000`. | HTTP 404. Error: "Dispatch record not found". | API | AUTOMATION GAP |
| TC-DSP-107 | Admin | GET /dispatches includes customer_firm_name and article/colour/size/mrp summaries | P1 | 1. Authenticate as Admin. 2. Create customer `firm_name` = "Test Retailer". Dispatch MC to that customer. 3. GET `?search=Test+Retailer`. | HTTP 200. Matching record has `customer_firm_name` = "Test Retailer". `article_summary`, `colour_summary`, `size_summary`, `mrp_summary` fields present and non-null when boxes exist. | API | AUTOMATION GAP — LATERAL subquery in getDispatches |
| TC-DSP-108 | Admin | GET /dispatches pagination page 2 returns different records than page 1 | P1 | 1. Authenticate as Admin. 2. Ensure ≥30 dispatch records. 3. GET `?page=1&limit=10` — capture IDs. 4. GET `?page=2&limit=10` — capture IDs. | Pages return 10 records each. No ID overlap. `total` consistent across both calls. | API | AUTOMATION GAP |

---

## Section 8 — RBAC: Create

> `POST /dispatches` is gated by `authorizePermission('dispatch:create')`.
> **Admin**: super-admin bypass → always allowed.
> **Dispatch Operator**: holds `dispatch:create` → allowed.
> **Supervisor**: holds `dispatch:read` ONLY — does NOT hold `dispatch:create` → **403**.
> **Warehouse Operator**: no dispatch permissions at all → **403**.
>
> ⚠ Old file TC-DISP-081 was WRONG (said Supervisor → 201). Corrected here.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-110 | Admin | Admin creates master-carton dispatch → 201 | P0 | 1. Authenticate as Admin. 2. Close MC with `mc_id`. 3. POST `/api/v1/dispatches` body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Mumbai"}`. | HTTP 201. Dispatch created. `dispatched_by` in DB = Admin's user ID. | API | `spec 21 — TC-DISP-ADM-001`; `spec 33 — TC-DMS-MC-001` |
| TC-DSP-111 | Admin | Admin creates sample dispatch → 201 | P0 | 1. Authenticate as Admin. 2. Create ACTIVE sample `sr_id`. 3. POST body: `{"sample_record_id":"<sr_id>","destination":"Test"}`. | HTTP 201. Dispatch created. | API | `spec 33 — TC-DMS-SM-001` |
| TC-DSP-112 | Admin | Admin creates ecommerce dispatch → 201 | P0 | 1. Authenticate as Admin. 2. Create ACTIVE EC `ec_id`. 3. POST body: `{"ecommerce_record_id":"<ec_id>","destination":"Test"}`. | HTTP 201. Dispatch created. | API | `spec 33 — TC-DMS-EC-001` |
| TC-DSP-113 | Dispatch Operator | Dispatch Operator creates master-carton dispatch → 201 | P0 | 1. Authenticate as Dispatch Operator. 2. Obtain CLOSED MC `mc_id` and `cust_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Test"}`. | HTTP 201. Dispatch created. `dispatched_by` = Dispatch Operator's user ID. | API | `spec 21 — TC-DISP-DOP-001`; `spec 33 — TC-DMS-ROLE-001` |
| TC-DSP-114 | Dispatch Operator | Dispatch Operator creates sample dispatch → 201 | P0 | 1. Authenticate as Dispatch Operator. 2. Obtain ACTIVE sample `sr_id`. 3. POST body: `{"sample_record_id":"<sr_id>"}`. | HTTP 201. Dispatch created. | API | `spec 33 — TC-DMS-ROLE-003` |
| TC-DSP-115 | Dispatch Operator | Dispatch Operator creates ecommerce dispatch → 201 | P0 | 1. Authenticate as Dispatch Operator. 2. Obtain ACTIVE EC `ec_id`. 3. POST body: `{"ecommerce_record_id":"<ec_id>"}`. | HTTP 201. Dispatch created. | API | AUTOMATION GAP — EC path for Dispatch Op not in spec 33 |
| TC-DSP-116 | Supervisor | Supervisor POST /dispatches (master-carton) → 403 DENIED | P0 | 1. Authenticate as Supervisor. 2. Obtain closed MC `mc_id` and `cust_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Test"}`. | **HTTP 403**. Error: "Required permission: dispatch:create" (or similar). No dispatch record created. MC status unchanged. | API | ⚠ MATRIX CORRECTION — old TC-DISP-081 said 201; seeds confirm Supervisor lacks dispatch:create. AUTOMATION GAP — spec 21 TC-DISP-SUP-001 incorrectly asserts 201 → must be updated to 403 |
| TC-DSP-117 | Supervisor | Supervisor POST /dispatches (sample) → 403 DENIED | P0 | 1. Authenticate as Supervisor. 2. Obtain ACTIVE sample `sr_id`. 3. POST body: `{"sample_record_id":"<sr_id>"}`. | HTTP 403. Error: "Required permission: dispatch:create". No dispatch row. | API | AUTOMATION GAP |
| TC-DSP-118 | Supervisor | Supervisor POST /dispatches (ecommerce) → 403 DENIED | P0 | 1. Authenticate as Supervisor. 2. Obtain ACTIVE EC `ec_id`. 3. POST body: `{"ecommerce_record_id":"<ec_id>"}`. | HTTP 403. Error: "Required permission: dispatch:create". No dispatch row. | API | AUTOMATION GAP |
| TC-DSP-119 | Warehouse Operator | Warehouse Operator POST /dispatches (master-carton) → 403 DENIED | P0 | 1. Authenticate as Warehouse Operator. 2. Obtain closed MC `mc_id` and `cust_id`. 3. POST body: `{"master_carton_ids":["<mc_id>"],"customer_id":"<cust_id>","destination":"Test"}`. | HTTP 403. No dispatch row created. | API | `spec 21 — TC-DISP-WHO-001`; `spec 33 — TC-DMS-ROLE-002` |
| TC-DSP-120 | Warehouse Operator | Warehouse Operator POST /dispatches (sample) → 403 DENIED | P0 | 1. Authenticate as Warehouse Operator. 2. POST body: `{"sample_record_id":"00000000-0000-0000-0000-000000000001"}`. | HTTP 403. No dispatch row. | API | AUTOMATION GAP |
| TC-DSP-121 | Warehouse Operator | Warehouse Operator POST /dispatches (ecommerce) → 403 DENIED | P0 | 1. Authenticate as Warehouse Operator. 2. POST body: `{"ecommerce_record_id":"00000000-0000-0000-0000-000000000001"}`. | HTTP 403. | API | AUTOMATION GAP |

---

## Section 9 — RBAC: Read

> GET `/dispatches` and GET `/dispatches/:id` are gated by `authenticate` only — no `authorizePermission` call.
> All 4 authenticated roles must receive 200.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-130 | Admin | Admin GET /dispatches → 200 | P0 | 1. Authenticate as Admin. 2. GET `/api/v1/dispatches`. | HTTP 200. `data` array returned. | API | `spec 21 — TC-DISP-READ-001` |
| TC-DSP-131 | Supervisor | Supervisor GET /dispatches → 200 | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/dispatches`. | HTTP 200. Supervisor holds `dispatch:read`; GET is also auth-only so either way 200. | API | AUTOMATION GAP |
| TC-DSP-132 | Warehouse Operator | Warehouse Operator GET /dispatches → 200 (auth-only, no permission gate) | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/dispatches`. | HTTP 200. Even though WH Op holds no dispatch permissions, GET has no `authorizePermission` call — only `authenticate`. | API | `spec 21 — TC-DISP-WHO-001` comment notes auth-only |
| TC-DSP-133 | Dispatch Operator | Dispatch Operator GET /dispatches → 200 | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/dispatches`. | HTTP 200. | API | AUTOMATION GAP |
| TC-DSP-134 | Admin | Admin GET /dispatches/:id → 200 | P0 | 1. Authenticate as Admin. 2. Obtain valid dispatch `id`. 3. GET `/api/v1/dispatches/<id>`. | HTTP 200. Single dispatch record returned. | API | `spec 21 — TC-DISP-READ-002` |
| TC-DSP-135 | Supervisor | Supervisor GET /dispatches/:id → 200 | P0 | 1. Authenticate as Supervisor. 2. GET `/api/v1/dispatches/<id>`. | HTTP 200. | API | AUTOMATION GAP |
| TC-DSP-136 | Warehouse Operator | Warehouse Operator GET /dispatches/:id → 200 (auth-only) | P0 | 1. Authenticate as Warehouse Operator. 2. GET `/api/v1/dispatches/<id>`. | HTTP 200. | API | AUTOMATION GAP |
| TC-DSP-137 | Dispatch Operator | Dispatch Operator GET /dispatches/:id → 200 | P0 | 1. Authenticate as Dispatch Operator. 2. GET `/api/v1/dispatches/<id>`. | HTTP 200. | API | AUTOMATION GAP |

---

## Section 10 — Unauthenticated Access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-140 | Unauthenticated | POST /dispatches without token → 401 | P0 | 1. No Authorization header. 2. POST `/api/v1/dispatches` body: `{"master_carton_ids":["00000000-0000-0000-0000-000000000001"]}`. | HTTP 401. `success` = false. Error: "Authentication required" or similar. No dispatch created. | API | AUTOMATION GAP |
| TC-DSP-141 | Unauthenticated | GET /dispatches without token → 401 | P0 | 1. No Authorization header. 2. GET `/api/v1/dispatches`. | HTTP 401. | API | AUTOMATION GAP |
| TC-DSP-142 | Unauthenticated | GET /dispatches/:id without token → 401 | P0 | 1. No Authorization header. 2. GET `/api/v1/dispatches/00000000-0000-0000-0000-000000000001`. | HTTP 401. | API | AUTOMATION GAP |

---

## Section 11 — Frontend E2E: Dispatch Create Page

> URL: `/dispatch`. Source: `frontend/src/app/(dashboard)/dispatch/page.tsx`.
> Layout: source-type tab bar (3 tabs) on top, left column = Dispatch Details form, right column = source panel (changes per tab).
> HIDScannerInput is the primary scan mechanism per source. Camera (QRScanner) is a secondary option.
> Submit button only visible when `useCan('dispatch:create')` returns true.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-E2E-001 | Admin | /dispatch page loads with three source-type tabs | P0 | 1. Log in as Admin. 2. Navigate to `/dispatch`. 3. Inspect the tab bar. | Three tabs visible in order: "Master Carton" (Package icon), "Sample" (FlaskConical icon), "E-commerce" (ShoppingCart icon). Page title = "Dispatch". | E2E | `spec 33 — TC-DMS-UI-001` and `TC-DMS-UI-003` |
| TC-DSP-E2E-002 | Admin | Master Carton tab is selected by default | P0 | 1. Log in as Admin. 2. Navigate to `/dispatch`. 3. Assert active tab and panel. | "Master Carton" tab active (has `border-binny-navy text-binny-navy` underline). "Scan Master Cartons" panel visible on the right. No Sample or E-commerce panel visible. | E2E | `spec 33 — TC-DMS-UI-003` |
| TC-DSP-E2E-003 | Admin | Switching to Sample tab shows Sample panel and hides Carton panel | P1 | 1. Log in as Admin. 2. Navigate to `/dispatch`. 3. Click "Sample" tab. 4. Assert panels. | "Sample" tab active. "Scan Sample" panel (red accent `#FFF1F1`, FlaskConical) visible. Carton scan panel hidden. HIDScannerInput placeholder "Scan or enter sample barcode..." present. "Use Camera Instead" button present. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-004 | Admin | Switching to E-commerce tab shows EC panel | P1 | 1. Log in as Admin. 2. Navigate to `/dispatch`. 3. Click "E-commerce" tab. 4. Assert panel. | "E-commerce" tab active. "Scan E-commerce Record" panel (purple accent `#F3F0FF`) visible. HIDScannerInput placeholder "Scan or enter e-commerce barcode..." present. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-005 | Admin | MC tab — HID scan or manual entry adds carton to dispatch list | P0 | 1. Log in as Admin. 2. Navigate to `/dispatch`. 3. Ensure MC tab active. 4. Type a valid ACTIVE/CLOSED carton barcode. 5. Press Enter (HIDScannerInput submit). | Toast "Added carton: BINNY-MC-<id>". "Cartons to Dispatch (1)" panel shows the carton: barcode in font-mono, `child_count` boxes, `status` badge, X remove button. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-006 | Admin | Adding same carton barcode twice shows duplicate error | P1 | 1. Log in as Admin. 2. Add a valid carton once. 3. Enter the same barcode again and submit. | Toast error "Carton already added". List count stays at 1. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-007 | Admin | Adding DISPATCHED carton shows "already been dispatched" toast | P1 | 1. Log in as Admin. 2. Enter barcode of DISPATCHED-status carton. | Toast error "This carton has already been dispatched". Carton NOT added. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-008 | Admin | Adding CREATED carton shows "empty" toast | P1 | 1. Log in as Admin. 2. Enter barcode of CREATED-status carton. | Toast error "This carton is empty (CREATED status). Pack boxes first." Carton NOT added. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-009 | Admin | Non-existent carton barcode shows "not found" toast | P1 | 1. Log in as Admin. 2. Enter barcode that does not exist in DB. | Toast error "Master carton not found". Carton NOT added. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-010 | Admin | Remove carton from list via X button | P1 | 1. Log in as Admin. 2. Add 2 cartons. 3. Click X on the first. | First carton removed. List shows 1. Submit label changes to "Create Dispatch (1 carton)". | E2E | AUTOMATION GAP |
| TC-DSP-E2E-011 | Admin | Submit button label updates with carton count | P0 | 1. Log in as Admin. 2. MC tab. 3. Add 3 cartons. 4. Inspect submit button. | Button label = "Create Dispatch (3 cartons)". Pluralised correctly. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-012 | Admin | Submit disabled when carton list empty and customer not selected (MC tab) | P0 | 1. Log in as Admin. 2. MC tab, empty list, no customer selected. 3. Inspect submit button. | Button has `disabled` attribute. Clicking shows toast "Add at least one master carton" (from `handleSubmit` guard). | E2E | AUTOMATION GAP |
| TC-DSP-E2E-013 | Admin | Submit disabled when customer not selected for MC dispatch even if cartons added | P0 | 1. Log in as Admin. 2. MC tab. 3. Add 1 valid carton. 4. Leave customer dropdown empty. 5. Click submit. | Toast error "Select a customer before dispatching". No API call made. | E2E | AUTOMATION GAP — customer required enforced both frontend (`handleSubmit` line 185) and backend (Zod refine) |
| TC-DSP-E2E-014 | Admin | Customer dropdown auto-fills Destination field when customer with delivery_location selected | P0 | 1. Log in as Admin. 2. MC tab. 3. Select customer that has `delivery_location` = "Pune Hub". 4. Check Destination field. | Destination input value = "Pune Hub" (auto-filled). Helper text "Auto-filled from customer. You can override." visible. | E2E | AUTOMATION GAP — frontend auto-fill lines 260-263 of dispatch page |
| TC-DSP-E2E-015 | Admin | Manual override of auto-filled destination accepted | P1 | 1. Auto-fill destination via customer selection. 2. Clear destination field and type "Custom Dest". | Destination field = "Custom Dest". Customer dropdown still shows selected customer. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-016 | Admin | Sample tab — enter valid ACTIVE sample barcode and selection card appears | P0 | 1. Log in as Admin. 2. Click Sample tab. 3. Enter valid ACTIVE sample barcode. 4. Submit HIDScannerInput. | Toast "Sample found: <sample name>". Red selection card appears: sample name bold, `sample_barcode` font-mono, recipient (customer_firm_name or recipient_name if present), purpose (if present), box count + status. X clear button. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-017 | Admin | Sample tab — entering DISPATCHED sample barcode shows error | P1 | 1. Log in as Admin. 2. Click Sample tab. 3. Enter barcode of DISPATCHED sample. | Toast "This sample has already been dispatched". No selection card shown. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-018 | Admin | Sample tab — entering CREATED sample barcode shows "no boxes" error | P1 | 1. Log in as Admin. 2. Click Sample tab. 3. Enter barcode of CREATED sample. | Toast "Sample has no boxes (CREATED status)". No selection card. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-019 | Admin | E-commerce tab — enter valid ACTIVE EC barcode and selection card appears | P0 | 1. Log in as Admin. 2. Click E-commerce tab. 3. Enter valid ACTIVE EC barcode. | Toast "E-commerce record found: <name>". Purple selection card appears: name bold, `ecommerce_barcode` font-mono, marketplace (if present), order_reference (if present), listing_sku (if present), box count + status. X clear button. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-020 | Admin | E-commerce tab — DISPATCHED EC barcode shows error | P1 | 1. Log in as Admin. 2. Click EC tab. 3. Enter barcode of DISPATCHED EC. | Toast "This e-commerce record has already been dispatched". No selection card. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-021 | Admin | Clearing selected sample via X restores empty state | P1 | 1. Log in as Admin. 2. Sample tab. 3. Select a sample. 4. Click X on the selection card. | Selection card disappears. Empty state shown: FlaskConical icon + "Scan or enter a sample barcode". `selectedSample` state reset to null. Submit button disabled. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-022 | Admin | Successful MC dispatch: redirects to /dispatches and clears form | P0 | 1. Log in as Admin. 2. Add 1 valid CLOSED carton. 3. Select customer. 4. Fill destination, vehicle number. 5. Click submit. | Spinner on button. Toast "Dispatch created successfully". Browser navigates to `/dispatches`. Carton list, customer dropdown, and form fields cleared. | E2E | `spec 21 — TC-DISP-E2E-001`; `spec 33 — TC-DMS-UI-001` |
| TC-DSP-E2E-023 | Admin | Use Camera Instead toggle shows/hides QRScanner in MC tab | P1 | 1. Log in as Admin. 2. MC tab. 3. Click "Use Camera Instead". 4. Assert scanner visible. 5. Click "Hide Camera". 6. Assert scanner hidden. | "Use Camera Instead" click renders QRScanner component. Button label → "Hide Camera". Clicking "Hide Camera" unmounts QRScanner. Label reverts. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-024 | Admin | Sample tab camera closes automatically on successful scan | P1 | 1. Log in as Admin. 2. Sample tab. 3. Click "Use Camera Instead". 4. Simulate successful QR scan of valid sample barcode. | QRScanner unmounts (`setShowSampleScanner(false)` called). Selection card appears. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-025 | Admin | EC tab camera closes automatically on successful scan | P1 | 1. Log in as Admin. 2. EC tab. 3. Click "Use Camera Instead". 4. Simulate QR scan of valid EC barcode. | QRScanner unmounts. EC selection card appears. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-026 | Dispatch Operator | Dispatch Operator sees source tabs and submit button (canCreate = true) | P0 | 1. Log in as Dispatch Operator. 2. Navigate to `/dispatch`. | Page renders. All 3 source tabs visible. Submit button IS visible (because `useCan('dispatch:create')` = true for Dispatch Op). | E2E | AUTOMATION GAP |
| TC-DSP-E2E-027 | Supervisor | Supervisor sees dispatch page but submit button is hidden (canCreate = false) | P0 | 1. Log in as Supervisor. 2. Navigate to `/dispatch`. | Page renders. Source tabs visible. Submit button is **NOT rendered** (`canCreate` = false; `{canCreate && <Button ...>}` guard). Supervisor cannot create from UI. | E2E | AUTOMATION GAP — `useCan('dispatch:create')` returns false for Supervisor; button hidden at line 300 |
| TC-DSP-E2E-028 | Warehouse Operator | Warehouse Operator sees dispatch page but submit button is hidden | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/dispatch`. | Submit button not rendered. Warehouse Op cannot submit dispatch from UI. | E2E | AUTOMATION GAP |

---

## Section 12 — Frontend E2E: Dispatches List Page

> URL: `/dispatches`. Source: `frontend/src/app/(dashboard)/dispatches/page.tsx`.
> Data fetched via `useApiQuery(['dispatches', ...])`. Grouped by customer client-side via `useMemo`.
> Source-type filter is **client-side only** (not sent to API). Date filters and search hit API.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-E2E-040 | Admin | /dispatches page loads, groups records by customer | P0 | 1. Log in as Admin. 2. Navigate to `/dispatches`. | Page title "Dispatches". Cards grouped by customer name. Each group row shows: User avatar icon, customer name, "X dispatches", "Y boxes", destination(s), "Latest: <date>". Chevron icon for expand/collapse. | E2E | `spec 21 — TC-DISP-E2E-002`; `spec 33 — TC-DMS-UI-002` |
| TC-DSP-E2E-041 | Admin | Expanding customer group shows dispatch records with SourceTypeBadge | P0 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Ensure dispatches of all 3 source types exist under one customer. 4. Click customer row to expand. | Group expands. Individual dispatch cards visible. Each card has SourceTypeBadge (gray="Master Carton", red="Sample", purple="E-commerce"), `source_label` font-mono below badge, (N boxes), dispatch date top-right. If `article_summary` present, product name shown. If `colour_summary`/`size_summary`, shown below. Destination, vehicle, LR, transport shown when present. Notes shown in italic. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-042 | Admin | Clicking already-expanded customer group collapses it | P1 | 1. Log in as Admin. 2. Expand a customer group. 3. Click the same group header again. | Group collapses. Individual records hidden. Chevron rotates back to ChevronDown. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-043 | Admin | Walk-in customer group shown for dispatches without customer_id | P1 | 1. Log in as Admin. 2. Dispatch a sample record without a customer_id. 3. Navigate to `/dispatches`. | A group with customer name "Walk-in / No Customer" appears. | E2E | AUTOMATION GAP — `customerName: record.customer_firm_name || 'Walk-in / No Customer'` |
| TC-DSP-E2E-044 | Admin | Source-type filter dropdown — selecting Sample filters client-side | P1 | 1. Log in as Admin. 2. Ensure dispatches of all 3 types exist. 3. Navigate to `/dispatches`. 4. Select "Sample" from source-type dropdown. | Only customer groups containing Sample dispatch records shown. MC and EC records hidden. Changing back to "All Source Types" restores full list. Note: filter is client-side only (useMemo) — no new API call. | E2E | AUTOMATION GAP — client-side filter, not API param |
| TC-DSP-E2E-045 | Admin | Source-type filter selecting Master Carton shows only MC records | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Select "Master Carton" from source-type dropdown. | Only groups with `source_type` = 'master_carton' dispatches visible. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-046 | Admin | Source-type filter selecting E-commerce shows only EC records | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Select "E-commerce". | Only groups with `source_type` = 'ecommerce' visible. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-047 | Admin | Search bar filters by destination, LR number, vehicle, barcode | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Type the LR number of a specific dispatch. | API called with `?search=<lr>`. Customer groups containing that dispatch visible. Others hidden. Clear search → full list. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-048 | Admin | Date range filter From/To narrows list to dispatch_date range | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Set From date to tomorrow, To date to next week. | Records with `dispatch_date` before tomorrow excluded. Empty state shown if none match. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-049 | Admin | Empty state shown when no dispatch records match | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Apply a search that matches nothing. | ClipboardList icon displayed. Text: "No dispatch records found." | E2E | AUTOMATION GAP |
| TC-DSP-E2E-050 | Admin | Pagination appears when total records exceed PAGE_SIZE | P1 | 1. Log in as Admin. 2. Ensure > PAGE_SIZE dispatch records. 3. Navigate to `/dispatches`. | Pagination bar at bottom: "Showing X to Y of Z". "Previous" disabled on page 1. "Next" enabled. Clicking Next loads page 2. Pagination only appears when `data.totalPages > 1`. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-051 | Admin | "Dispatch Carton" action button in header navigates to /dispatch | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Click "Dispatch Carton" button. | Browser navigates to `/dispatch`. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-052 | Admin | SourceTypeBadge renders correct variant colours for each type | P0 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Expand customer group with all 3 source types. 4. Inspect badge variants. | Master Carton badge: `variant="gray"`. Sample badge: `variant="red"`. E-commerce badge: `variant="purple"`. Each badge has correct icon (Package/FlaskConical/ShoppingCart). | E2E | AUTOMATION GAP |
| TC-DSP-E2E-053 | Admin | Groups sorted by latest dispatch_date descending | P1 | 1. Log in as Admin. 2. Navigate to `/dispatches`. 3. Inspect order of customer groups. | Group with most recent `latestDate` appears first. Ordered descending by `new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()`. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-054 | Supervisor | Supervisor can view /dispatches (read permitted) | P0 | 1. Log in as Supervisor. 2. Navigate to `/dispatches`. | Page loads. Dispatch records visible. No access error. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-055 | Dispatch Operator | Dispatch Operator can view /dispatches | P0 | 1. Log in as Dispatch Operator. 2. Navigate to `/dispatches`. | Page loads with dispatch records. | E2E | AUTOMATION GAP |
| TC-DSP-E2E-056 | Warehouse Operator | Warehouse Operator can view /dispatches (GET is auth-only) | P0 | 1. Log in as Warehouse Operator. 2. Navigate to `/dispatches`. | Page loads with dispatch records (GET route auth-only at API level). | E2E | AUTOMATION GAP |

---

## Section 13 — DB CHECK Constraint

> Verifies the `chk_dispatch_source_exactly_one` constraint is enforced at DB level, independent of API.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-160 | Admin | DB CHECK rejects raw INSERT with two non-null FK columns | P0 | 1. Direct DB access. 2. Execute: `INSERT INTO dispatch_records (master_carton_id, sample_record_id, dispatched_by, dispatch_date) VALUES ('<mc_id>', '<sr_id>', '<user_id>', NOW());`. | PostgreSQL raises constraint violation: `chk_dispatch_source_exactly_one`. INSERT rejected. No row in `dispatch_records`. | Integration | Requires direct DB access. AUTOMATION GAP |
| TC-DSP-161 | Admin | DB CHECK rejects raw INSERT with all three FKs null | P0 | 1. Direct DB access. 2. Execute: `INSERT INTO dispatch_records (dispatched_by, dispatch_date) VALUES ('<user_id>', NOW());`. | PostgreSQL constraint violation: `chk_dispatch_source_exactly_one`. INSERT rejected. | Integration | AUTOMATION GAP |

---

## Section 14 — Reverse Dispatch (not implemented)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-DSP-170 | Admin | DELETE /dispatches/:id returns 404 — no undo route registered | P1 | 1. Authenticate as Admin. 2. Dispatch a MC. Capture dispatch `id`. 3. DELETE `/api/v1/dispatches/<id>`. | HTTP 404. No route registered for DELETE on dispatch records. Dispatch record and all entity statuses remain unchanged. | API | Feature not implemented. If added later, replace this TC with full positive + negative coverage. AUTOMATION GAP |

---

## RBAC Summary Matrix

| Action | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:---:|:---:|:---:|:---:|
| POST /dispatches (create) | ✓ 201 | ✗ 403 | ✗ 403 | ✓ 201 |
| GET /dispatches (list) | ✓ 200 | ✓ 200 | ✓ 200 (auth-only) | ✓ 200 |
| GET /dispatches/:id (detail) | ✓ 200 | ✓ 200 | ✓ 200 (auth-only) | ✓ 200 |
| Unauthenticated any endpoint | — | — | — | 401 |

> ⚠ **Discrepancy note:** Supervisor → POST = 403 (corrected from old file's incorrect 201). Warehouse Operator → GET = 200 (auth-only, no permission gate). Both are confirmed from route code and seeds. Existing Playwright spec `21-dispatch-rbac.spec.ts` TC-DISP-SUP-001 incorrectly asserts 201 for Supervisor — this spec must be patched to expect 403.
