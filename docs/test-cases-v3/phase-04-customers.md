# Phase 04 — Customer Management

**Module code:** `CUST` / `CUST-BULK`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30
**Refreshed:** 2026-06-09 — full rewrite aligned to `authorizePermission` RBAC, `useCan` frontend guard, bulk-upload service, and 4-role rule.

> **Key facts verified from code (2026-06-09):**
> - All write routes use `authorizePermission('customers:create|update|delete')`, NOT `authorize(ADMIN, SUPERVISOR)`.
> - Seed file (`001_roles.ts`) gives **no `customers:*` permissions to Supervisor, Warehouse Operator, or Dispatch Operator**.
> - Admin has super-admin bypass (`role_name === 'Admin'` short-circuit in `authorizePermission`).
> - Therefore: **all customer writes (POST, PUT, DELETE, bulk-upload POST) = Admin only (403 for all other roles).**
> - `GET /`, `GET /:id`, `GET /:id/sub-dealers`, `GET /primary-dealers` — `authenticate` only, **no permission gate** → all 4 roles return 200.
> - `GET /bulk-upload/sample` — `authorizePermission('customers:read')` required; no seeded non-Admin role has `customers:read` → **Supervisor/Warehouse/Dispatch get 403**.
> - `POST /bulk-upload` — `authorizePermission('customers:create')` → Admin only (403 for others).
> - Frontend `customers/page.tsx` uses `useCan('customers:read')` for page access → non-Admin roles who lack `customers:read` see "Access Denied" (not an isManager check as in old version).
> - Frontend "Add Customer" + "Bulk Import" buttons gated by `useCan('customers:create')`.
> - "Edit" / activate-toggle gated by `useCan('customers:update')`.
> - `bulkUploadCustomers` controller sends HTTP **201** (not 200).
> - Duplicate `firm_name` on single POST: customer IS created; HTTP 201 + warning in `message`.
> - `checkDuplicateFirmName` checks `is_active = true` only (inactive dupes ignored).
> - Sub Dealer auto-fill: address, delivery_location, gstin, contact_person_name, contact_person_mobile copied from primary when null in request.
> - Bulk upload response shape: `{ created: number, errors: BulkCustomerRowResult[] }`.
> - 500-row hard cap (no env override for customers).
> - Route order: `/bulk-upload/sample` and `/bulk-upload` declared before `/:id` to avoid shadowing.
> - `primary_dealer_name` (string) used for Sub Dealer lookup in bulk upload; `primary_dealer_id` (UUID) used in single POST.
>
> **Discrepancy vs old file:**
> - OLD: `authorize(ADMIN, SUPERVISOR)` on POST/PUT. **NEW: `authorizePermission('customers:create/update')` — Supervisor does NOT have these permissions in seeds → 403.** Old TCs showing Supervisor can create/update are now incorrect.
> - OLD: page guard was `isManager` (Admin or Supervisor). **NEW: `useCan('customers:read')` — Supervisor also gets "Access Denied" unless granted `customers:read` via Role Manager.**

---

## Table of Contents

- [Section 04.1 — Create customer — Happy path (Admin)](#section-041--create-customer--happy-path-admin)
- [Section 04.2 — RBAC: Write operations — Admin allowed / all others denied](#section-042--rbac-write-operations--admin-allowed--all-others-denied)
- [Section 04.3 — Sub Dealer creation and field inheritance](#section-043--sub-dealer-creation-and-field-inheritance)
- [Section 04.4 — List customers (GET /customers)](#section-044--list-customers-get-customers)
- [Section 04.5 — Get customer by ID (GET /customers/:id)](#section-045--get-customer-by-id)
- [Section 04.6 — Primary dealers endpoint (GET /customers/primary-dealers)](#section-046--primary-dealers-endpoint)
- [Section 04.7 — Sub dealers endpoint (GET /customers/:id/sub-dealers)](#section-047--sub-dealers-endpoint)
- [Section 04.8 — Update customer](#section-048--update-customer)
- [Section 04.9 — Delete customer](#section-049--delete-customer)
- [Section 04.10 — Search and filter](#section-0410--search-and-filter)
- [Section 04.11 — Validation](#section-0411--validation)
- [Section 04.12 — Playwright E2E: Customers page](#section-0412--playwright-e2e-customers-page)
- [Section 04.13 — Customer CSV Bulk Upload: Sample CSV](#section-0413--customer-csv-bulk-upload-sample-csv)
- [Section 04.14 — Customer CSV Bulk Upload: Upload success cases](#section-0414--customer-csv-bulk-upload-upload-success-cases)
- [Section 04.15 — Customer CSV Bulk Upload: Per-row validation errors](#section-0415--customer-csv-bulk-upload-per-row-validation-errors)
- [Section 04.16 — Customer CSV Bulk Upload: Bulk-level (whole-file) errors](#section-0416--customer-csv-bulk-upload-bulk-level-whole-file-errors)
- [Section 04.17 — Customer CSV Bulk Upload: RBAC](#section-0417--customer-csv-bulk-upload-rbac)
- [Section 04.18 — Frontend Bulk Import modal (E2E)](#section-0418--frontend-bulk-import-modal-e2e)

---

## Section 04.1 — Create customer — Happy path (Admin)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-001 | Admin | Admin creates Primary Dealer with all fields | P0 | 1. Login as Admin. 2. `POST /api/v1/customers` body `{"firm_name":"ABC Traders","customer_type":"Primary Dealer","address":"123 MG Road, Mumbai","delivery_location":"Mumbai Warehouse","gstin":"27AAPFU0939F1ZV","private_marka":"ABC","gr":"GR001","contact_person_name":"Rajan Shah","contact_person_mobile":"9876543210"}`. | HTTP 201; `data.id` is a UUID; `data.firm_name === "ABC Traders"`; `data.customer_type === "Primary Dealer"`; `data.is_active === true`; `data.gstin === "27AAPFU0939F1ZV"`. | API | spec: 18 (TC-CUST-ADM-001) |
| TC-CUST-002 | Admin | Admin creates Primary Dealer with required field only | P0 | 1. Login as Admin. 2. `POST /api/v1/customers` body `{"firm_name":"Minimal Dealer"}`. | HTTP 201; `data.customer_type === "Primary Dealer"` (default); `data.is_active === true`; all optional fields null. | API | createCustomerSchema: only firm_name required |
| TC-CUST-003 | Admin | Default customer_type is Primary Dealer when omitted | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"No Type Given"}`. | HTTP 201; `data.customer_type === "Primary Dealer"`. | API | z.enum().default('Primary Dealer') |
| TC-CUST-004 | Admin | Duplicate active firm_name creates customer with warning message | P1 | 1. Create customer with `firm_name="Same Name Firm"`. 2. `POST /api/v1/customers` again with `firm_name="Same Name Firm"`. | HTTP 201; second customer IS created; `message` contains "Note: A customer with this firm name already exists."; both customers in DB. | API | checkDuplicateFirmName checks `is_active = true` only; not a 409 |
| TC-CUST-005 | Admin | Duplicate check is case-insensitive (active only) | P1 | 1. Create customer `firm_name="ACME Shoes"`. 2. `POST /api/v1/customers` body `{"firm_name":"acme shoes"}`. | HTTP 201; warning message present (LOWER comparison). | API | `LOWER(firm_name) = LOWER($1) AND is_active = true` |
| TC-CUST-006 | Admin | Inactive duplicate does NOT trigger warning | P1 | 1. Create customer `firm_name="Inactive Firm"`. 2. DELETE (deactivate) it. 3. `POST /api/v1/customers` body `{"firm_name":"Inactive Firm"}`. | HTTP 201; no warning message; new active customer created. | API | checkDuplicateFirmName filters `is_active = true` |
| TC-CUST-007 | Admin | Audit log entry created on customer create | P1 | 1. Create a customer. 2. Query: `SELECT * FROM audit_logs WHERE entity_type='customer' AND action='CREATE_CUSTOMER' ORDER BY created_at DESC LIMIT 1`. | Audit row exists with correct `entity_id` and `user_id`. | Integration | |

---

## Section 04.2 — RBAC: Write operations — Admin allowed / all others denied

> All customer write routes use `authorizePermission('customers:create|update|delete')`. No seeded non-Admin role holds these permissions → 403 for Supervisor, Warehouse Operator, Dispatch Operator, and 401 for Unauthenticated.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-010 | Admin | Admin POST /customers — 201 | P0 | 1. Login as Admin. 2. `POST /api/v1/customers` body `{"firm_name":"Admin Firm"}`. | HTTP 201. | API | spec: 18 (TC-CUST-ADM-001) |
| TC-CUST-011 | Supervisor | Supervisor POST /customers — 403 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/customers` body `{"firm_name":"Sup Firm"}` with supervisor token. | HTTP 403; no customer created. | API | **DISCREPANCY vs old file**: old file showed 201. Supervisor lacks `customers:create` in seeds. spec: 18 |
| TC-CUST-012 | Warehouse Operator | Warehouse Operator POST /customers — 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/customers` body `{"firm_name":"WH Firm"}`. | HTTP 403. | API | spec: 18 (TC-CUST-WHO-002) |
| TC-CUST-013 | Dispatch Operator | Dispatch Operator POST /customers — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/customers` body `{"firm_name":"DP Firm"}`. | HTTP 403. | API | AUTOMATION GAP: no spec for Dispatch POST deny |
| TC-CUST-014 | Unauthenticated | Unauthenticated POST /customers — 401 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"No Token"}` with no Authorization header. | HTTP 401. | API | authenticate middleware runs before authorizePermission |
| TC-CUST-015 | Admin | Admin PUT /customers/:id — 200 | P0 | 1. Login as Admin. 2. Create customer. 3. `PUT /api/v1/customers/<id>` body `{"firm_name":"Updated"}`. | HTTP 200. | API | spec: 18 (TC-CUST-ADM-004) |
| TC-CUST-016 | Supervisor | Supervisor PUT /customers/:id — 403 | P0 | 1. Login as Supervisor. 2. `PUT /api/v1/customers/<valid_id>` with supervisor token. | HTTP 403; customer unchanged. | API | **DISCREPANCY vs old file**: old file showed Supervisor can PUT. Supervisor lacks `customers:update`. spec: 18 |
| TC-CUST-017 | Warehouse Operator | Warehouse Operator PUT /customers/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `PUT /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP: no spec for WH PUT deny |
| TC-CUST-018 | Dispatch Operator | Dispatch Operator PUT /customers/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `PUT /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP: no spec for DP PUT deny |
| TC-CUST-019 | Unauthenticated | Unauthenticated PUT /customers/:id — 401 | P0 | 1. `PUT /api/v1/customers/<valid_id>` with no token. | HTTP 401. | API | |
| TC-CUST-020 | Admin | Admin DELETE /customers/:id — 200 | P0 | 1. Login as Admin. 2. Create customer. 3. `DELETE /api/v1/customers/<id>`. | HTTP 200; `message === "Customer deactivated successfully"`. | API | spec: 18 (TC-CUST-ADM-005) |
| TC-CUST-021 | Supervisor | Supervisor DELETE /customers/:id — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /api/v1/customers/<valid_id>` with supervisor token. | HTTP 403. | API | spec: 18 (TC-CUST-SUP-002) |
| TC-CUST-022 | Warehouse Operator | Warehouse Operator DELETE /customers/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `DELETE /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP: no spec for WH DELETE deny |
| TC-CUST-023 | Dispatch Operator | Dispatch Operator DELETE /customers/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `DELETE /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP: no spec for DP DELETE deny |
| TC-CUST-024 | Unauthenticated | Unauthenticated DELETE /customers/:id — 401 | P0 | 1. `DELETE /api/v1/customers/<valid_id>` with no token. | HTTP 401. | API | |

---

## Section 04.3 — Sub Dealer creation and field inheritance

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-030 | Admin | Admin creates Sub Dealer with valid primary_dealer_id — 201 | P0 | 1. Create Primary Dealer P1. 2. `POST /api/v1/customers` body `{"firm_name":"Sub Shop","customer_type":"Sub Dealer","primary_dealer_id":"<P1_id>"}`. | HTTP 201; `data.customer_type === "Sub Dealer"`; `data.primary_dealer_id === <P1_id>`. | API | spec: 18 (TC-CUST-ADM-002) |
| TC-CUST-031 | Admin | Sub Dealer inherits address from Primary Dealer when address omitted | P0 | 1. Create Primary Dealer with `address="42 Market St"`. 2. Create Sub Dealer linked to primary, omitting `address`. | Sub Dealer `data.address === "42 Market St"`. | Integration | customer.service: `if (address == null) address = primary.address` |
| TC-CUST-032 | Admin | Sub Dealer inherits GSTIN from Primary Dealer when GSTIN omitted | P0 | 1. Create Primary Dealer with `gstin="27AAPFU0939F1ZV"`. 2. Create Sub Dealer omitting `gstin`. | Sub Dealer `data.gstin === "27AAPFU0939F1ZV"`. | Integration | |
| TC-CUST-033 | Admin | Sub Dealer inherits contact_person_name and mobile from Primary | P0 | 1. Create Primary Dealer with `contact_person_name="Rajan"`, `contact_person_mobile="9876543210"`. 2. Create Sub Dealer omitting both contact fields. | `contact_person_name === "Rajan"`, `contact_person_mobile === "9876543210"`. | Integration | |
| TC-CUST-034 | Admin | Sub Dealer inherits delivery_location from Primary | P0 | 1. Create Primary Dealer with `delivery_location="Mumbai Warehouse"`. 2. Create Sub Dealer omitting `delivery_location`. | Sub Dealer `data.delivery_location === "Mumbai Warehouse"`. | Integration | |
| TC-CUST-035 | Admin | Sub Dealer explicit field overrides Primary Dealer auto-fill | P1 | 1. Create Primary Dealer with `address="Primary St"`. 2. Create Sub Dealer with explicit `address="Sub Dealer St"`. | Sub Dealer `data.address === "Sub Dealer St"` (not primary's). | Integration | `if (address == null)` guard — only null triggers inherit |
| TC-CUST-036 | Admin | Sub Dealer missing primary_dealer_id returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"No Primary","customer_type":"Sub Dealer"}` (no primary_dealer_id). | HTTP 400; Zod refine error "Sub Dealer must have a primary dealer"; no customer created. | API | spec: 18 (TC-CUST-ADM-003); createCustomerSchema .refine() |
| TC-CUST-037 | Admin | Sub Dealer with non-existent primary_dealer_id returns 404 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Ghost Sub","customer_type":"Sub Dealer","primary_dealer_id":"00000000-0000-0000-0000-000000000000"}`. | HTTP 404; "Primary dealer not found"; no customer created. | API | service queries `customer_type='Primary Dealer' AND is_active=true` |
| TC-CUST-038 | Admin | Sub Dealer with deactivated primary returns 404 | P1 | 1. Create and deactivate a Primary Dealer. 2. Attempt to create Sub Dealer linked to deactivated primary. | HTTP 404; "Primary dealer not found" — service requires `is_active = true`. | Integration | |
| TC-CUST-039 | Admin | Sub Dealer with primary_dealer_id pointing to a Sub Dealer returns 404 | P1 | 1. Create Sub Dealer S1. 2. Create Sub Dealer S2 with `primary_dealer_id=<S1_id>`. | HTTP 404; "Primary dealer not found" — service requires `customer_type='Primary Dealer'`. | Integration | |
| TC-CUST-040 | Admin | primary_dealer_id with invalid UUID format returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Bad UUID Sub","customer_type":"Sub Dealer","primary_dealer_id":"not-a-uuid"}`. | HTTP 400; Zod error "Invalid primary dealer ID". | API | z.string().uuid() |

---

## Section 04.4 — List customers (GET /customers)

> `GET /customers` has `authenticate` only, no `authorizePermission`. All 4 authenticated roles get 200.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-050 | Admin | GET /customers returns paginated list | P0 | 1. Login as Admin. 2. `GET /api/v1/customers`. | HTTP 200; body `data` (array), `total`, `page === 1`, `limit === 25`, `totalPages`; each item has `id`, `firm_name`, `customer_type`, `is_active`. | API | spec: 18 (TC-CUST-ADM-006) |
| TC-CUST-051 | Admin | GET /customers includes primary_dealer_name for Sub Dealers | P0 | 1. Create Primary Dealer "Parent Co". 2. Create Sub Dealer linked to it. 3. `GET /api/v1/customers`. | Sub Dealer row includes `primary_dealer_name === "Parent Co"` from LEFT JOIN. | API | |
| TC-CUST-052 | Admin | GET /customers default includes both active and inactive | P1 | 1. Deactivate one customer. 2. `GET /api/v1/customers`. | Both active and inactive customers returned (no default is_active filter). | API | |
| TC-CUST-053 | Admin | GET /customers?is_active=true returns only active | P1 | 1. Ensure mix of active/inactive. 2. `GET /api/v1/customers?is_active=true`. | All returned items have `is_active === true`. | API | |
| TC-CUST-054 | Admin | GET /customers?is_active=false returns only inactive | P1 | 1. `GET /api/v1/customers?is_active=false`. | All returned items have `is_active === false`. | API | |
| TC-CUST-055 | Admin | GET /customers?customer_type=Primary Dealer filters type | P0 | 1. `GET /api/v1/customers?customer_type=Primary Dealer`. | All items have `customer_type === "Primary Dealer"`. | API | spec: 18 (TC-CUST-ADM-007) |
| TC-CUST-056 | Admin | GET /customers?customer_type=Sub Dealer filters type | P0 | 1. `GET /api/v1/customers?customer_type=Sub Dealer`. | All items have `customer_type === "Sub Dealer"`. | API | |
| TC-CUST-057 | Admin | GET /customers?page=2&limit=5 returns correct slice | P1 | 1. Ensure > 5 customers. 2. `GET /api/v1/customers?page=2&limit=5`. | `page === 2`, `limit === 5`, `data.length <= 5`; `total` reflects full count. | API | |
| TC-CUST-058 | Supervisor | Supervisor GET /customers — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/customers`. | HTTP 200; list returned. | API | auth-only; Supervisor has no customers:read but GET is ungated |
| TC-CUST-059 | Warehouse Operator | Warehouse Operator GET /customers — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/customers`. | HTTP 200; list returned. | API | spec: 18 (TC-CUST-WHO-001) |
| TC-CUST-060 | Dispatch Operator | Dispatch Operator GET /customers — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/customers`. | HTTP 200; list returned. | API | AUTOMATION GAP: no spec for Dispatch GET list |
| TC-CUST-061 | Unauthenticated | Unauthenticated GET /customers — 401 | P0 | 1. `GET /api/v1/customers` with no token. | HTTP 401. | API | authenticate middleware |

---

## Section 04.5 — Get customer by ID

> `GET /:id` has `authenticate` only. All 4 authenticated roles get 200.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-070 | Admin | GET /customers/:id returns correct customer | P0 | 1. Create customer, note `id`. 2. `GET /api/v1/customers/<id>`. | HTTP 200; `data.id === <id>`; all fields returned. | API | |
| TC-CUST-071 | Admin | GET /customers/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/customers/00000000-0000-0000-0000-000000000000`. | HTTP 404; "Customer not found". | API | |
| TC-CUST-072 | Admin | GET /customers/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/customers/not-a-uuid`. | HTTP 400; Zod "Invalid customer ID format". | API | customerIdParamSchema |
| TC-CUST-073 | Supervisor | Supervisor GET /customers/:id — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/customers/<valid_uuid>`. | HTTP 200; customer returned. | API | AUTOMATION GAP: no spec for Supervisor GET by ID |
| TC-CUST-074 | Warehouse Operator | Warehouse Operator GET /customers/:id — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/customers/<valid_uuid>`. | HTTP 200; customer returned. | API | |
| TC-CUST-075 | Dispatch Operator | Dispatch Operator GET /customers/:id — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/customers/<valid_uuid>`. | HTTP 200; customer returned. | API | AUTOMATION GAP: no spec for Dispatch GET by ID |
| TC-CUST-076 | Unauthenticated | Unauthenticated GET /customers/:id — 401 | P0 | 1. `GET /api/v1/customers/<valid_uuid>` with no token. | HTTP 401. | API | |

---

## Section 04.6 — Primary dealers endpoint

> `GET /primary-dealers` is declared before `/:id` in route order (avoiding UUID shadowing) and has `authenticate` only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-080 | Admin | GET /customers/primary-dealers returns only active Primary Dealers | P0 | 1. Ensure at least one active Primary Dealer and one deactivated Primary Dealer exist. 2. `GET /api/v1/customers/primary-dealers`. | HTTP 200; array contains only active Primary Dealers; deactivated absent; Sub Dealers absent. | API | spec: 18 (TC-CUST-ADM-008) |
| TC-CUST-081 | Admin | GET /customers/primary-dealers ordered by firm_name | P1 | 1. Create primaries "Zebra Co" and "Apple Dealers". 2. `GET /api/v1/customers/primary-dealers`. | "Apple Dealers" appears before "Zebra Co" (ORDER BY firm_name ASC). | API | |
| TC-CUST-082 | Supervisor | Supervisor GET /customers/primary-dealers — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/customers/primary-dealers`. | HTTP 200; list returned. | API | auth-only; used in dispatch workflow |
| TC-CUST-083 | Warehouse Operator | Warehouse Operator GET /customers/primary-dealers — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/customers/primary-dealers`. | HTTP 200; list returned. | API | AUTOMATION GAP |
| TC-CUST-084 | Dispatch Operator | Dispatch Operator GET /customers/primary-dealers — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/customers/primary-dealers`. | HTTP 200; list returned. | API | spec: 09 (TC-CUST-013 variant) |
| TC-CUST-085 | Unauthenticated | Unauthenticated GET /customers/primary-dealers — 401 | P0 | 1. `GET /api/v1/customers/primary-dealers` with no token. | HTTP 401. | API | AUTOMATION GAP |
| TC-CUST-086 | Any | Route /primary-dealers not shadowed by /:id | P0 | 1. `GET /api/v1/customers/primary-dealers` (literal string, not UUID). | HTTP 200; primary dealers list; server does not treat "primary-dealers" as `:id`. | API | Route order in customer.routes.ts: /primary-dealers before /:id |

---

## Section 04.7 — Sub dealers endpoint

> `GET /:id/sub-dealers` has `authenticate` only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-090 | Admin | GET /customers/:id/sub-dealers returns subs linked to primary | P0 | 1. Create Primary P1. 2. Create Sub S1 and S2 linked to P1. 3. Create Sub S3 linked to different primary. 4. `GET /api/v1/customers/<P1_id>/sub-dealers`. | HTTP 200; contains S1 and S2; S3 absent. | API | |
| TC-CUST-091 | Admin | GET /customers/:id/sub-dealers returns empty array if no subs | P1 | 1. Create Primary with no Sub Dealers. 2. `GET /api/v1/customers/<primary_id>/sub-dealers`. | HTTP 200; `data === []`. | API | |
| TC-CUST-092 | Admin | GET /customers/:id/sub-dealers with malformed UUID returns 400 | P1 | 1. `GET /api/v1/customers/bad-uuid/sub-dealers`. | HTTP 400; Zod "Invalid customer ID format". | API | |
| TC-CUST-093 | Admin | GET /customers/:id/sub-dealers only includes active sub dealers | P1 | 1. Create Primary; create active S1 and deactivated S2. 2. `GET /api/v1/customers/<primary_id>/sub-dealers`. | Only S1 returned (`is_active = true` in getSubDealers WHERE). | API | |
| TC-CUST-094 | Supervisor | Supervisor GET /customers/:id/sub-dealers — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/customers/<valid_id>/sub-dealers`. | HTTP 200; sub dealers returned. | API | AUTOMATION GAP |
| TC-CUST-095 | Warehouse Operator | Warehouse Operator GET /customers/:id/sub-dealers — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/customers/<valid_id>/sub-dealers`. | HTTP 200. | API | AUTOMATION GAP |
| TC-CUST-096 | Dispatch Operator | Dispatch Operator GET /customers/:id/sub-dealers — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/customers/<valid_id>/sub-dealers`. | HTTP 200. | API | AUTOMATION GAP |
| TC-CUST-097 | Unauthenticated | Unauthenticated GET /customers/:id/sub-dealers — 401 | P0 | 1. `GET /api/v1/customers/<valid_id>/sub-dealers` with no token. | HTTP 401. | API | AUTOMATION GAP |

---

## Section 04.8 — Update customer

> `PUT /:id` requires `authorizePermission('customers:update')` — Admin only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-100 | Admin | Admin updates firm_name | P0 | 1. Create customer. 2. `PUT /api/v1/customers/<id>` body `{"firm_name":"Updated Firm"}`. 3. `GET /api/v1/customers/<id>`. | PUT HTTP 200; GET returns `firm_name === "Updated Firm"`; `updated_at` newer. | API | spec: 18 (TC-CUST-ADM-004) |
| TC-CUST-101 | Admin | Admin updates address and delivery_location | P1 | 1. `PUT /api/v1/customers/<id>` body `{"address":"New Address","delivery_location":"New Warehouse"}`. | HTTP 200; fields updated. | API | |
| TC-CUST-102 | Admin | Admin updates GSTIN to valid value | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":"29AABCU9603R1ZP"}`. | HTTP 200; `data.gstin === "29AABCU9603R1ZP"`. | API | |
| TC-CUST-103 | Admin | Admin sets GSTIN to null (clear) | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":null}`. | HTTP 200; `data.gstin === null`. | API | updateCustomerSchema allows nullable |
| TC-CUST-104 | Admin | Admin deactivates customer via PUT is_active=false | P0 | 1. `PUT /api/v1/customers/<id>` body `{"is_active":false}`. 2. `GET /api/v1/customers?is_active=true`. | PUT HTTP 200; customer absent from active list. | API | |
| TC-CUST-105 | Admin | Admin activates customer via PUT is_active=true | P1 | 1. Deactivate customer. 2. `PUT /api/v1/customers/<id>` body `{"is_active":true}`. | HTTP 200; `data.is_active === true`. | API | |
| TC-CUST-106 | Admin | Admin changes customer_type to Sub Dealer | P1 | 1. Create Primary P1 and P2. 2. `PUT /api/v1/customers/<P2_id>` body `{"customer_type":"Sub Dealer","primary_dealer_id":"<P1_id>"}`. | HTTP 200; P2 `customer_type === "Sub Dealer"`. | API | No refine on update schema |
| TC-CUST-107 | Admin | PUT with empty body returns unchanged customer | P1 | 1. `PUT /api/v1/customers/<id>` body `{}`. | HTTP 200; customer returned unchanged (early return when fields.length === 0). | API | |
| TC-CUST-108 | Admin | PUT non-existent customer returns 404 | P0 | 1. `PUT /api/v1/customers/00000000-0000-0000-0000-000000000000` body `{"firm_name":"Ghost"}`. | HTTP 404; "Customer not found". | API | |
| TC-CUST-109 | Admin | Private marka and GR fields are updatable | P1 | 1. `PUT /api/v1/customers/<id>` body `{"private_marka":"ABC","gr":"GR-2026-001"}`. | HTTP 200; `data.private_marka === "ABC"`, `data.gr === "GR-2026-001"`. | API | |
| TC-CUST-110 | Admin | Audit log created on update | P1 | 1. Update customer. 2. Check audit_logs. | Row with `action === "UPDATE_CUSTOMER"`, correct `entity_id`. | Integration | |
| TC-CUST-111 | Supervisor | Supervisor PUT /customers/:id — 403 | P0 | 1. Login as Supervisor. 2. `PUT /api/v1/customers/<valid_id>` body `{"firm_name":"Hacked"}`. | HTTP 403; customer unchanged. | API | **DISCREPANCY vs old file** — old showed 200. Spec: 18 |
| TC-CUST-112 | Warehouse Operator | Warehouse Operator PUT /customers/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `PUT /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP |
| TC-CUST-113 | Dispatch Operator | Dispatch Operator PUT /customers/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `PUT /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP |
| TC-CUST-114 | Unauthenticated | Unauthenticated PUT /customers/:id — 401 | P0 | 1. `PUT /api/v1/customers/<valid_id>` body `{"firm_name":"X"}` with no token. | HTTP 401. | API | |

---

## Section 04.9 — Delete customer

> `DELETE /:id` requires `authorizePermission('customers:delete')` — Admin only. Soft delete (`is_active = false`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-120 | Admin | Admin soft-deletes customer | P0 | 1. Create customer. 2. `DELETE /api/v1/customers/<id>`. | HTTP 200; "Customer deactivated successfully"; DB `is_active = false`. | API | spec: 18 (TC-CUST-ADM-005) |
| TC-CUST-121 | Admin | Deleted customer absent from active list | P0 | 1. Delete a customer. 2. `GET /api/v1/customers?is_active=true`. | Customer not present; appears in `?is_active=false`. | API | |
| TC-CUST-122 | Admin | Deleted customer still retrievable by ID | P1 | 1. Delete a customer. 2. `GET /api/v1/customers/<id>`. | HTTP 200; `data.is_active === false`; record not hard-deleted. | API | getCustomerById has no is_active filter |
| TC-CUST-123 | Admin | Delete non-existent customer returns 404 | P0 | 1. `DELETE /api/v1/customers/00000000-0000-0000-0000-000000000000`. | HTTP 404; "Customer not found". | API | |
| TC-CUST-124 | Admin | Delete customer referenced by a dispatch record — no FK guard | P1 | 1. Create customer C1. 2. Create a dispatch record using C1. 3. `DELETE /api/v1/customers/<C1_id>`. | HTTP 200; customer deactivated; **no FK guard in deleteCustomer service** — dispatch record retains `customer_id` FK. **DISCREPANCY: implementation-plan mentions deletion guard; code has none. Flag for dev team.** | Integration | |
| TC-CUST-125 | Admin | Audit log created on delete | P1 | 1. Delete customer. 2. Check audit_logs. | Row with `action === "DELETE_CUSTOMER"`, correct `entity_id`. | Integration | |
| TC-CUST-126 | Supervisor | Supervisor DELETE /customers/:id — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /api/v1/customers/<valid_id>`. | HTTP 403. | API | spec: 18 (TC-CUST-SUP-002) |
| TC-CUST-127 | Warehouse Operator | Warehouse Operator DELETE /customers/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `DELETE /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP |
| TC-CUST-128 | Dispatch Operator | Dispatch Operator DELETE /customers/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `DELETE /api/v1/customers/<valid_id>`. | HTTP 403. | API | AUTOMATION GAP |
| TC-CUST-129 | Unauthenticated | Unauthenticated DELETE /customers/:id — 401 | P0 | 1. `DELETE /api/v1/customers/<valid_id>` with no token. | HTTP 401. | API | |

---

## Section 04.10 — Search and filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-130 | Admin | Search by firm_name returns matching customers | P0 | 1. Create "Alpha Footwear" and "Beta Shoes". 2. `GET /api/v1/customers?search=Alpha`. | Result includes "Alpha Footwear"; "Beta Shoes" absent. | API | ILIKE on firm_name |
| TC-CUST-131 | Admin | Search is case-insensitive | P1 | 1. `GET /api/v1/customers?search=alpha`. | Returns "Alpha Footwear". | API | ILIKE |
| TC-CUST-132 | Admin | Search by contact_person_name | P1 | 1. Create customer with `contact_person_name="Rajan Shah"`. 2. `GET /api/v1/customers?search=Rajan`. | Customer returned. | API | ILIKE also checks contact_person_name |
| TC-CUST-133 | Admin | Search by GSTIN | P1 | 1. Create customer with `gstin="27AAPFU0939F1ZV"`. 2. `GET /api/v1/customers?search=27AAPFU`. | Customer returned. | API | ILIKE also checks gstin |
| TC-CUST-134 | Admin | Search with no match returns empty array | P1 | 1. `GET /api/v1/customers?search=ZZZNOMATCH`. | HTTP 200; `data === []`; `total === 0`. | API | |
| TC-CUST-135 | Admin | Filter customer_type + search combined | P1 | 1. `GET /api/v1/customers?customer_type=Sub Dealer&search=sup`. | Only Sub Dealers whose name/contact/GSTIN contain "sup" returned. | API | AND conditions in WHERE |
| TC-CUST-136 | Admin | Pagination: total pages calculation correct | P1 | 1. Ensure exactly 13 customers. 2. `GET /api/v1/customers?limit=5&page=1`. | `total === 13`, `totalPages === 3`, `data.length === 5`. | API | |
| TC-CUST-137 | Admin | Page beyond total returns empty array | P1 | 1. `GET /api/v1/customers?limit=5&page=999`. | HTTP 200; `data === []`; `total` unchanged. | API | OFFSET exceeds total |
| TC-CUST-138 | Admin | Results ordered by firm_name ASC | P1 | 1. Create customers "Zzz Corp" and "Aaa Corp". 2. `GET /api/v1/customers`. | "Aaa Corp" appears before "Zzz Corp" (ORDER BY c.firm_name ASC). | API | |

---

## Section 04.11 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-140 | Admin | Missing firm_name returns 400 | P0 | 1. `POST /api/v1/customers` body `{"customer_type":"Primary Dealer"}`. | HTTP 400; "Firm name is required". | API | spec: 18 (TC-CUST-VAL-001) |
| TC-CUST-141 | Admin | Empty firm_name returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":""}`. | HTTP 400; Zod min(1) error. | API | |
| TC-CUST-142 | Admin | firm_name exceeding 255 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `firm_name` as 256-char string. | HTTP 400; "Firm name must not exceed 255 characters". | API | |
| TC-CUST-143 | Admin | Invalid GSTIN format returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Test","gstin":"INVALIDGSTIN"}`. | HTTP 400; "Invalid GSTIN format (expected 15-char Indian GST format, e.g., 22AAAAA0000A1Z5)". | API | spec: 18 (TC-CUST-VAL-002) |
| TC-CUST-144 | Admin | Valid GSTIN format accepted | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"GSTIN Test","gstin":"22AAAAA0000A1Z5"}`. | HTTP 201; customer created. | API | |
| TC-CUST-145 | Admin | contact_person_mobile shorter than 10 digits returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Short Mobile","contact_person_mobile":"98765"}`. | HTTP 400; "Contact mobile must be 10-15 digits". | API | spec: 09 (TC-CUST-009) |
| TC-CUST-146 | Admin | contact_person_mobile longer than 15 digits returns 400 | P1 | 1. `POST /api/v1/customers` body with `contact_person_mobile` as 16-digit string. | HTTP 400; MOBILE_REGEX error. | API | |
| TC-CUST-147 | Admin | contact_person_mobile with non-digit chars returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Phone Test","contact_person_mobile":"98765+3210"}`. | HTTP 400; MOBILE_REGEX rejects non-digits. | API | |
| TC-CUST-148 | Admin | address exceeding 2000 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `address` as 2001-char string. | HTTP 400; "Address must not exceed 2000 characters". | API | |
| TC-CUST-149 | Admin | delivery_location exceeding 255 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `delivery_location` as 256-char string. | HTTP 400; "Delivery location must not exceed 255 characters". | API | |
| TC-CUST-150 | Admin | Invalid customer_type value returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Bad Type","customer_type":"Retailer"}`. | HTTP 400; Zod enum error. | API | |
| TC-CUST-151 | Admin | Update with invalid GSTIN returns 400 | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":"BADGSTIN"}`. | HTTP 400; Zod GSTIN regex error. | API | updateCustomerSchema |
| TC-CUST-152 | Admin | gr field exceeding 100 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `gr` as 101-char string. | HTTP 400; "GR must not exceed 100 characters". | API | |
| TC-CUST-153 | Admin | contact_person_name exceeding 150 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `contact_person_name` as 151-char string. | HTTP 400; "Contact person name must not exceed 150 characters". | API | |

---

## Section 04.12 — Playwright E2E: Customers page

> Frontend `customers/page.tsx` uses `useCan('customers:read')` for page access. Since no seeded non-Admin role has `customers:read`, only Admin sees the page content; all others see "Access Denied". `canCreate` and `canUpdate` gate action buttons.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-E2E-001 | Admin | Customers page renders with search bar and type filter | P0 | 1. Login as Admin. 2. Navigate to `/customers`. | Page renders; search input placeholder "Search by firm name, GSTIN, or contact..."; type filter `<select>` with "All Types", "Primary Dealer", "Sub Dealer"; "Add Customer" and "Bulk Import" buttons visible. | E2E | spec: 09 (TC-CUST-001), 18 (TC-CUST-E2E-001) |
| TC-CUST-E2E-002 | Admin | Table columns visible | P0 | 1. Login as Admin. 2. Navigate to `/customers` with customers present. | Desktop table has headers: Firm Name, Type, Primary Dealer, Delivery Location, GSTIN, Contact Person, Mobile, Status, Actions (gated by canUpdate). | E2E | spec: 09 (TC-CUST-012) |
| TC-CUST-E2E-003 | Admin | "Add Customer" button opens create modal | P0 | 1. Login as Admin. 2. Navigate to `/customers`. 3. Click "Add Customer". | Modal opens titled "Add Customer"; radio buttons for "Primary Dealer" (default checked) and "Sub Dealer"; "Firm Name *" input; Cancel and "Create Customer" buttons. | E2E | spec: 09 (TC-CUST-002/003), 18 (TC-CUST-E2E-002/003) |
| TC-CUST-E2E-004 | Admin | Selecting Sub Dealer radio reveals Primary Dealer dropdown | P0 | 1. Open "Add Customer" modal. 2. Select "Sub Dealer" radio. | "Select Primary Dealer *" dropdown appears; populated with active primary dealers. | E2E | spec: 09 (TC-CUST-005) |
| TC-CUST-E2E-005 | Admin | Selecting primary dealer auto-fills inherited fields | P0 | 1. Create Primary Dealer via API. 2. Open modal. 3. Select "Sub Dealer" radio. 4. Select the primary dealer from dropdown. | Address, Delivery Location, GSTIN, Contact Person Name, Contact Person Mobile auto-filled from primary dealer's data. | E2E | spec: 09 (TC-CUST-006) |
| TC-CUST-E2E-006 | Admin | Auto-filled fields are read-only for Sub Dealer | P1 | 1. Open modal. 2. Select "Sub Dealer". 3. Select a Primary Dealer. | Address, Delivery Location, GSTIN, Contact Person Name, Mobile inputs are `readOnly`; styled with `bg-gray-100 text-gray-500 cursor-not-allowed`; info text "Address, location, GSTIN, and contact are inherited…" visible. | E2E | `autoFilledFields` state gate |
| TC-CUST-E2E-007 | Admin | Create Primary Dealer via UI appears in list | P0 | 1. Open modal. 2. Leave "Primary Dealer" selected. 3. Enter firm_name, mobile. 4. Click "Create Customer". | Success toast shown; modal closes; new row appears with blue "Primary Dealer" badge. | E2E | spec: 09 (TC-CUST-004) |
| TC-CUST-E2E-008 | Admin | Type badge: Primary Dealer = blue, Sub Dealer = orange | P1 | 1. Navigate to `/customers` with both types. | Primary Dealer rows show blue badge; Sub Dealer rows show orange badge. | E2E | Badge variant in page.tsx |
| TC-CUST-E2E-009 | Admin | Status badge: active = green, inactive = gray | P1 | 1. Navigate to `/customers` with both active and inactive customers. | Active: green "Active"; inactive: gray "Inactive". | E2E | |
| TC-CUST-E2E-010 | Admin | Edit button opens modal pre-filled | P0 | 1. Navigate to `/customers`. 2. Click "Edit" on an existing customer. | Modal opens titled "Edit Customer"; all fields pre-populated; "Update Customer" submit button visible. | E2E | |
| TC-CUST-E2E-011 | Admin | Deactivate icon button toggles customer status | P0 | 1. Navigate to `/customers`. 2. Click UserX icon on an active customer. | `PUT /api/v1/customers/<id>` called with `{"is_active":false}`; toast "Customer deactivated successfully"; badge changes to gray "Inactive". | E2E | toggleStatus calls customerService.update |
| TC-CUST-E2E-012 | Admin | Activate icon button re-activates customer | P1 | 1. Deactivate a customer. 2. Click UserCheck icon on that customer. | `PUT` called with `{"is_active":true}`; toast "Customer activated successfully"; badge changes to green "Active". | E2E | |
| TC-CUST-E2E-013 | Admin | Type filter dropdown filters list in real time | P0 | 1. Navigate to `/customers`. 2. Select "Primary Dealer" from type filter. | Only Primary Dealer rows shown; page resets to 1. | E2E | spec: 09 (TC-CUST-011) |
| TC-CUST-E2E-014 | Admin | Search filters by firm name with debounce | P0 | 1. Type "Alpha" in search bar. 2. Wait for debounce. | Table updates to show only matching customers; `GET /api/v1/customers?search=Alpha` called. | E2E | spec: 09 (TC-CUST-010); useDebounce hook |
| TC-CUST-E2E-015 | Admin | Pagination controls visible when totalPages > 1 | P1 | 1. Ensure > 25 customers. 2. Navigate to `/customers`. | "Previous" and "Next" buttons visible; "Page X of Y" shown; Previous disabled on page 1; Next disabled on last page. | E2E | |
| TC-CUST-E2E-016 | Admin | Empty state message when no customers match filter | P1 | 1. Set search to "ZZZNOMATCH". | Shows "No customers match your filter." | E2E | empty state in page.tsx |
| TC-CUST-E2E-017 | Admin | Empty state when no customers at all | P1 | 1. Login as Admin on clean DB. 2. Navigate to `/customers`. | Shows "No customers yet. Add your first customer." | E2E | |
| TC-CUST-E2E-018 | Admin | GSTIN displayed in mono font | P1 | 1. Create customer with GSTIN. 2. Navigate to `/customers`. | GSTIN cell uses `font-mono text-xs` class. | E2E | |
| TC-CUST-E2E-019 | Admin | Mobile card view renders correctly | P1 | 1. Login as Admin on mobile viewport (< 768px). 2. Navigate to `/customers`. | Desktop table hidden; mobile cards visible with firm name, type badge, status badge; Edit/Deactivate buttons visible. | E2E | md:hidden / hidden md:block breakpoints |
| TC-CUST-E2E-020 | Supervisor | Supervisor sees Access Denied on /customers | P0 | 1. Login as Supervisor. 2. Navigate to `/customers`. | Page shows Building2 icon, "Access Denied" heading, "You do not have permission to view customers." — because Supervisor lacks `customers:read`. | E2E | **DISCREPANCY vs old file**: old showed Supervisor could see the page (isManager check). New: useCan('customers:read') → Supervisor has no customers:read → Access Denied. |
| TC-CUST-E2E-021 | Warehouse Operator | Warehouse Operator sees Access Denied on /customers | P0 | 1. Login as Warehouse Operator. 2. Navigate to `/customers`. | Access Denied page rendered. | E2E | useCan('customers:read') = false |
| TC-CUST-E2E-022 | Dispatch Operator | Dispatch Operator sees Access Denied on /customers | P0 | 1. Login as Dispatch Operator. 2. Navigate to `/customers`. | Access Denied page rendered. | E2E | AUTOMATION GAP |
| TC-CUST-E2E-023 | Admin | GSTIN validation error shown inline before submit | P1 | 1. Open "Add Customer" modal. 2. Enter firm_name. 3. Enter invalid GSTIN "ABC123". 4. Click "Create Customer". | Toast error "Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)"; no API call made. | E2E | spec: 09 (TC-CUST-008); frontend validation in handleSubmit |
| TC-CUST-E2E-024 | Admin | Mobile validation error shown before submit | P1 | 1. Open "Add Customer" modal. 2. Enter firm_name. 3. Enter 5-digit mobile. 4. Click "Create Customer". | Toast error "Contact mobile must be 10-15 digits"; no API call made. | E2E | spec: 09 (TC-CUST-009) |
| TC-CUST-E2E-025 | Admin | Sub Dealer without primary selection blocked at UI | P1 | 1. Open modal. 2. Select "Sub Dealer". 3. Fill firm_name. 4. Click "Create Customer" without selecting a primary. | Toast "Please select a Primary Dealer for this Sub Dealer"; no API call made. | E2E | spec: 09 (TC-CUST-007) |

---

## Section 04.13 — Customer CSV Bulk Upload: Sample CSV

> `GET /bulk-upload/sample` requires `authorizePermission('customers:read')`. No seeded non-Admin role holds `customers:read` → **403 for Supervisor, Warehouse Operator, Dispatch Operator**.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-001 | Admin | Admin downloads customer bulk-upload sample CSV — 200 | P0 | 1. Login as Admin. 2. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 200; `Content-Type: text/csv`; `Content-Disposition: attachment; filename=customer_upload_sample.csv`; body is valid CSV with 10-column header. | API | spec: 35 (TC-CBULK-SAMPLE-001) |
| TC-CUST-BULK-002 | Admin | Sample CSV contains all 10 expected columns | P0 | 1. Download sample CSV. | Header row contains exactly: firm_name, address, delivery_location, gstin, private_marka, gr, contact_person_name, contact_person_mobile, customer_type, primary_dealer_name. | API | spec: 35 (TC-CBULK-SAMPLE-002) |
| TC-CUST-BULK-003 | Admin | Sample CSV contains at least 2 data rows | P1 | 1. Download sample CSV. 2. Split by newline. | At least 3 lines (1 header + 2 data rows): Acme Footwear (Primary Dealer) and Acme Sub Store (Sub Dealer). | API | downloadCustomerSampleCsv hardcoded rows |
| TC-CUST-BULK-004 | Supervisor | Supervisor GET /bulk-upload/sample — 403 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 403. No seeded Supervisor `customers:read`. | API | **NEW TC** — old file incorrectly showed 200. AUTOMATION GAP |
| TC-CUST-BULK-005 | Warehouse Operator | Warehouse Operator GET /bulk-upload/sample — 403 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 403. | API | **NEW TC** — old file showed 200. AUTOMATION GAP |
| TC-CUST-BULK-006 | Dispatch Operator | Dispatch Operator GET /bulk-upload/sample — 403 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/customers/bulk-upload/sample`. | HTTP 403. | API | AUTOMATION GAP |
| TC-CUST-BULK-007 | Unauthenticated | Unauthenticated GET /bulk-upload/sample — 401 | P0 | 1. `GET /api/v1/customers/bulk-upload/sample` with no token. | HTTP 401. | API | |
| TC-CUST-BULK-008 | Any | Route /bulk-upload/sample declared before /:id — no UUID conflict | P0 | 1. `GET /api/v1/customers/bulk-upload/sample` as Admin. | HTTP 200; sample CSV returned; "bulk-upload" not treated as a UUID. | API | Route order in customer.routes.ts |

---

## Section 04.14 — Customer CSV Bulk Upload: Upload success cases

> `POST /bulk-upload` requires `authorizePermission('customers:create')` — Admin only. Response is HTTP **201**.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-010 | Admin | Upload valid 2-row Primary Dealer CSV — all created | P0 | 1. Login as Admin. 2. Prepare CSV with 2 rows, both `customer_type=Primary Dealer`, unique `firm_name`. 3. `POST /api/v1/customers/bulk-upload` multipart `file=<csv>`. | HTTP 201; `data.created === 2`; `data.errors === []`; 2 new DB rows with `is_active=true`, `customer_type='Primary Dealer'`. | API | spec: 35 (TC-CBULK-VALID-001) |
| TC-CUST-BULK-011 | Admin | Upload Sub Dealer row with valid primary_dealer_name | P0 | 1. Pre-create Primary Dealer "Parent Co" as active. 2. CSV row: `firm_name=Sub1,customer_type=Sub Dealer,primary_dealer_name=Parent Co`. 3. Upload. | HTTP 201; `created === 1`; `errors === []`; Sub Dealer created with `primary_dealer_id` = Parent Co's ID; inherits address/GSTIN/contact from primary (if not in CSV). | Integration | spec: 35 (TC-CBULK-VALID-002) |
| TC-CUST-BULK-012 | Admin | Sub Dealer primary_dealer_name lookup is case-insensitive | P1 | 1. Pre-create Primary Dealer "ACME CORP". 2. CSV row with `primary_dealer_name=acme corp` (lowercase). 3. Upload. | HTTP 201; Sub Dealer created; `primary_dealer_id` resolved correctly. | API | primaryByName uses `LOWER(firm_name)` |
| TC-CUST-BULK-013 | Admin | Upload with customer_type column all lowercase — canonical casing applied | P1 | 1. CSV row: `customer_type=primary dealer` (lowercase). 2. Upload. | HTTP 201; `created === 1`; customer stored with `customer_type='Primary Dealer'`. | API | spec: (old TC-CUST-125); `canonicalCustomerType` |
| TC-CUST-BULK-014 | Admin | Upload with omitted customer_type defaults to Primary Dealer | P1 | 1. CSV row with blank `customer_type`. 2. Upload. | HTTP 201; `customer_type='Primary Dealer'`. | API | empty string → defaults |
| TC-CUST-BULK-015 | Admin | Upload single valid row — response shape correct | P0 | 1. Upload 1-row valid CSV. | HTTP 201; `data` shape: `{ created: 1, errors: [] }`; `success: true`; `message` contains "1 customers created". | API | controller: sendSuccess(res, result, ..., 201) |
| TC-CUST-BULK-016 | Admin | Mixed valid + invalid rows — partial success | P0 | 1. CSV rows: row 1 valid Primary Dealer; row 2 invalid GSTIN; row 3 valid Primary Dealer. 2. Upload. | HTTP 201; `created === 2`; `errors.length === 1`; error entry references row 3 (CSV row 3 = data row 2 with +2 offset). | API | per-row loop; valid rows not rolled back on neighbour failure |
| TC-CUST-BULK-017 | Admin | CSV with BOM (byte-order mark) parsed correctly | P1 | 1. Upload CSV with UTF-8 BOM prepended. | HTTP 201; customers created; BOM does not corrupt column headers. | API | `parse(..., { bom: true })` option |

---

## Section 04.15 — Customer CSV Bulk Upload: Per-row validation errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-020 | Admin | Row with empty firm_name rejected | P0 | 1. CSV with valid row 1 + blank `firm_name` in row 2. 2. Upload. | HTTP 201; `created === 1`; `errors` contains entry for blank-name row with message containing "firm_name is empty". | API | spec: 35 (TC-CBULK-ERR-003) |
| TC-CUST-BULK-021 | Admin | Row with invalid GSTIN format rejected | P0 | 1. CSV row: `gstin=INVALIDGSTIN`. 2. Upload alongside valid row. | HTTP 201; `created === 1`; `errors` entry: "invalid GSTIN format (expected e.g. 22AAAAA0000A1Z5)". | API | spec: 35 (TC-CBULK-ERR-004) |
| TC-CUST-BULK-022 | Admin | Row with invalid mobile (< 10 digits) rejected | P0 | 1. CSV row: `contact_person_mobile=987654321` (9 digits). 2. Upload. | HTTP 201; `errors` entry: "contact_person_mobile must be 10-15 digits". | API | spec: 35 (TC-CBULK-ERR-005) |
| TC-CUST-BULK-023 | Admin | Row with invalid customer_type rejected | P0 | 1. CSV row: `customer_type=Retailer`. 2. Upload alongside valid row. | HTTP 201; `created === 1`; `errors` entry: "customer_type must be 'Primary Dealer' or 'Sub Dealer'". | API | |
| TC-CUST-BULK-024 | Admin | Sub Dealer row missing primary_dealer_name rejected | P0 | 1. CSV row: `customer_type=Sub Dealer`, `primary_dealer_name` blank. 2. Upload. | HTTP 201; `errors` entry: "primary_dealer_name is required for a Sub Dealer". | API | spec: 35 (TC-CBULK-ERR-003 variant) |
| TC-CUST-BULK-025 | Admin | Sub Dealer row with non-existent primary dealer rejected | P0 | 1. CSV row: `customer_type=Sub Dealer`, `primary_dealer_name="Ghost Dealer"` (not in DB). 2. Upload. | HTTP 201; `errors` entry: `primary dealer "Ghost Dealer" not found (must be an existing active Primary Dealer)`. | API | spec: 35 (TC-CBULK-ERR-006) |
| TC-CUST-BULK-026 | Admin | Sub Dealer row with inactive primary dealer name rejected | P1 | 1. Create and deactivate Primary Dealer "Inactive PD". 2. CSV row: `customer_type=Sub Dealer`, `primary_dealer_name=Inactive PD`. 3. Upload. | HTTP 201; `errors` entry: primary dealer not found (primaryByName map only includes active dealers). | Integration | Map pre-fetched with `is_active=true` filter |
| TC-CUST-BULK-027 | Admin | Intra-batch duplicate firm_name — second row rejected | P0 | 1. CSV rows 1 and 2 both have `firm_name="Acme Traders"`. 2. Upload. | HTTP 201; row 1 created; row 2 rejected with error `a customer named "Acme Traders" already exists`; `seenInBatch` set used. | API | spec: 35 (TC-CBULK-ERR-007) |
| TC-CUST-BULK-028 | Admin | DB-duplicate firm_name (existing active customer) rejected per row | P0 | 1. Pre-existing active customer "Existing Corp". 2. CSV row: `firm_name=Existing Corp`. 3. Upload. | HTTP 201; `errors` entry: `a customer named "Existing Corp" already exists`; `takenFirms` set populated from DB (LOWER comparison). | API | spec: 35 (TC-CBULK-ERR-008) |
| TC-CUST-BULK-029 | Admin | Multiple errors on same row reported as semicolon-separated string | P1 | 1. CSV row with invalid GSTIN AND invalid mobile. 2. Upload. | HTTP 201; error entry for that row has `error` string joining both messages with "; ". | API | `rowErrors.join('; ')` |
| TC-CUST-BULK-030 | Admin | Row number in error report is CSV line number (header=1, data starts at 2) | P1 | 1. Upload CSV where row 3 (second data row) has an error. | Error entry has `row === 3` (not 2). | API | `rowNum = i + 2` |

---

## Section 04.16 — Customer CSV Bulk Upload: Bulk-level (whole-file) errors

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-040 | Admin | Empty CSV (header only) returns 409 | P0 | 1. Login as Admin. 2. Upload CSV with only the header row, no data rows. | HTTP 409; "CSV file is empty. Please add customer rows below the header."; no customers created. | API | spec: 35 (TC-CBULK-ERR-001); ConflictError |
| TC-CUST-BULK-041 | Admin | CSV exceeding 500 rows returns 409 | P0 | 1. Upload CSV with 501 data rows. | HTTP 409; "CSV contains 501 rows. Maximum allowed is 500 per upload."; no customers created. | API | spec: 35 (TC-CBULK-ERR-009); hard cap — no env override |
| TC-CUST-BULK-042 | Admin | CSV exactly at 500-row cap is accepted | P1 | 1. Upload CSV with exactly 500 unique valid rows. | HTTP 201; `created === 500`; `errors === []`. | API | boundary test |
| TC-CUST-BULK-043 | Admin | CSV missing firm_name column returns 409 | P0 | 1. Upload CSV whose header does not contain `firm_name`. | HTTP 409; "Missing required column: firm_name. Download the sample file for reference."; no customers created. | API | spec: 35 (TC-CBULK-ERR-002) |
| TC-CUST-BULK-044 | Admin | No file in request returns 400 | P0 | 1. `POST /api/v1/customers/bulk-upload` with no `file` field. | HTTP 400; "No CSV file provided". | API | controller guard `if (!file)` |
| TC-CUST-BULK-045 | Admin | Invalid CSV format (non-CSV bytes) returns 409 | P1 | 1. Upload a binary `.xlsx` file or non-UTF-8 data. | HTTP 409; "Invalid CSV format. Please ensure the file is a valid CSV with headers.". | API | csv-parse throws; ConflictError |
| TC-CUST-BULK-046 | Admin | Non-CSV file extension rejected by upload middleware | P1 | 1. Upload a `.txt` file via the `file` field. | HTTP 400; file-type error from `csvUpload` middleware before service is called. | API | `csvUpload.single('file')` middleware |

---

## Section 04.17 — Customer CSV Bulk Upload: RBAC

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-050 | Admin | Admin POST /bulk-upload — 201 | P0 | 1. Login as Admin. 2. Upload valid 1-row CSV. | HTTP 201; `created === 1`. | API | spec: 35 (TC-CBULK-VALID-001) |
| TC-CUST-BULK-051 | Supervisor | Supervisor POST /bulk-upload — 403 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/customers/bulk-upload` with valid CSV. | HTTP 403; no customers created. | API | **NEW TC** — old file showed Supervisor can upload. Lacks `customers:create`. AUTOMATION GAP |
| TC-CUST-BULK-052 | Warehouse Operator | Warehouse Operator POST /bulk-upload — 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/customers/bulk-upload` with valid CSV. | HTTP 403. | API | spec: (old TC-CUST-140) |
| TC-CUST-BULK-053 | Dispatch Operator | Dispatch Operator POST /bulk-upload — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/customers/bulk-upload` with valid CSV. | HTTP 403. | API | spec: (old TC-CUST-141) |
| TC-CUST-BULK-054 | Unauthenticated | Unauthenticated POST /bulk-upload — 401 | P0 | 1. `POST /api/v1/customers/bulk-upload` with no token. | HTTP 401. | API | |

---

## Section 04.18 — Frontend Bulk Import modal (E2E)

> "Bulk Import" and "Add Customer" buttons gated by `useCan('customers:create')`. Only Admin sees them.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-BULK-E2E-001 | Admin | Bulk Import button visible on Customers page | P0 | 1. Login as Admin. 2. Navigate to `/customers`. | "Bulk Import" button with Upload icon is visible in the page header. | E2E | spec: 35 (TC-CBULK-UI-001) |
| TC-CUST-BULK-E2E-002 | Admin | Bulk Import modal opens with file input and sample download | P0 | 1. Click "Bulk Import" on `/customers`. | Modal opens with: blue "Download sample CSV" section with Download button; dashed file picker area with `accept=".csv"` input; "Upload & Create Customers" button (disabled until file selected). | E2E | spec: 35 (TC-CBULK-UI-002) |
| TC-CUST-BULK-E2E-003 | Admin | Download Sample button downloads CSV file | P1 | 1. Open Bulk Import modal. 2. Click "Download" button in sample section. | Browser downloads `customer_upload_sample.csv`. File is valid CSV with 10 column headers and 2 sample rows. | E2E | fetches `/customers/bulk-upload/sample` with Bearer token |
| TC-CUST-BULK-E2E-004 | Admin | Upload button disabled until file selected | P1 | 1. Open Bulk Import modal. 2. Do not select a file. | "Upload & Create Customers" button has `disabled` attribute. | E2E | `disabled={!bulkFile || bulkUploading}` |
| TC-CUST-BULK-E2E-005 | Admin | Upload valid CSV shows success panel with created count | P0 | 1. Open Bulk Import modal. 2. Attach valid 3-row CSV. 3. Click Upload. | Results panel shows green checkmark + "3 customers created successfully" text; customer list refreshes. | E2E | spec: 35 (TC-CBULK-UI-001 extended) |
| TC-CUST-BULK-E2E-006 | Admin | Upload CSV with errors shows error report | P1 | 1. Open Bulk Import modal. 2. Attach CSV where row 2 has invalid GSTIN. 3. Upload. | Results panel: green "N customers created"; red section "1 rows failed"; error row shows "Row 2 (firmname): invalid GSTIN..." message. | E2E | spec: 35 inline error rendering |
| TC-CUST-BULK-E2E-007 | Admin | "Upload Another File" button resets the modal state | P1 | 1. Complete a bulk upload. 2. In result panel, click "Upload Another File". | File picker re-appears; bulkResult cleared; bulkFile cleared. | E2E | `setBulkResult(null); setBulkFile(null)` |
| TC-CUST-BULK-E2E-008 | Admin | Closing modal resets state | P1 | 1. Open Bulk Import modal. 2. Select a file. 3. Close modal via Cancel. 4. Re-open modal. | File input empty; no result panel shown; previous state cleared. | E2E | `closeBulkModal` resets all state |
| TC-CUST-BULK-E2E-009 | Admin | Modal info text explains 500-row cap | P1 | 1. Open Bulk Import modal. | Modal body contains text "Maximum 500 rows per upload." | E2E | descriptive text in modal |
| TC-CUST-BULK-E2E-010 | Supervisor | Supervisor does NOT see Bulk Import button (no customers:create) | P0 | 1. Login as Supervisor. 2. Navigate to `/customers`. | Because Supervisor lacks `customers:read`, they see "Access Denied" page — Bulk Import button never rendered. | E2E | **DISCREPANCY vs old file** — old TC-CUST-E2E-024 showed Supervisor sees Bulk Import. `canCreate = useCan('customers:create')` = false for Supervisor. |
