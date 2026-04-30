# Phase 04 — Customer Management

**Module code:** `CUST`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30

> **Key facts from code:**
> - `POST /` and `PUT /:id` require `authorize(ADMIN, SUPERVISOR)`.
> - `DELETE /:id` requires `authorize(ADMIN)`.
> - `GET /`, `GET /primary-dealers`, `GET /:id/sub-dealers`, `GET /:id` require only `authenticate` (all roles).
> - Sub Dealer creation requires a valid, active `primary_dealer_id` whose `customer_type = 'Primary Dealer'`.
> - Duplicate firm name: service calls `checkDuplicateFirmName`; if duplicate, creates the customer anyway but returns a warning in the response message (HTTP 201 + warning message).
> - `DELETE` is a soft delete (`is_active = false`); no guard for FK references (sample_records, dispatch_records) in current `customer.service.ts`.
> - Deletion guard discrepancy: README scope says "deletion guard if customer is referenced" but current code has no such check.
> - Customer list query supports: `search` (ILIKE firm_name OR contact_person_name OR gstin), `is_active`, `customer_type`, `page`, `limit`.
> - The frontend `/customers` page restricts visibility to `isManager` (Admin or Supervisor); Warehouse/Dispatch Operators see "Access Denied" in the UI, though the API still permits reads.
> - The frontend "Add Customer" button is only shown when `isAdmin` (not Supervisor) — **UI discrepancy vs. API**: API allows Supervisor to POST, but UI hides the button for Supervisor.

---

## Table of Contents

- [Section 04.1 — Create customer — Admin](#section-041--create-customer--admin)
- [Section 04.2 — Create customer — Supervisor](#section-042--create-customer--supervisor)
- [Section 04.3 — Sub Dealer creation and auto-fill](#section-043--sub-dealer-creation-and-auto-fill)
- [Section 04.4 — List customers (GET /customers)](#section-044--list-customers-get-customers)
- [Section 04.5 — Get customer by ID (GET /customers/:id)](#section-045--get-customer-by-id)
- [Section 04.6 — Primary dealers endpoint (GET /customers/primary-dealers)](#section-046--primary-dealers-endpoint)
- [Section 04.7 — Sub dealers endpoint (GET /customers/:id/sub-dealers)](#section-047--sub-dealers-endpoint)
- [Section 04.8 — Update customer (PUT /customers/:id)](#section-048--update-customer)
- [Section 04.9 — Delete customer (DELETE /customers/:id)](#section-049--delete-customer)
- [Section 04.10 — Search and filter](#section-0410--search-and-filter)
- [Section 04.11 — Role access denial matrix](#section-0411--role-access-denial-matrix)
- [Section 04.12 — Validation](#section-0412--validation)
- [Section 04.13 — Playwright E2E: Customers page](#section-0413--playwright-e2e-customers-page)

---

## Section 04.1 — Create customer — Admin

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-001 | Admin | Admin creates Primary Dealer with all fields | P0 | 1. Login as Admin 2. `POST /api/v1/customers` body `{"firm_name":"ABC Traders","customer_type":"Primary Dealer","address":"123 MG Road, Mumbai","delivery_location":"Mumbai Warehouse","gstin":"27AAPFU0939F1ZV","private_marka":"ABC","gr":"GR001","contact_person_name":"Rajan Shah","contact_person_mobile":"9876543210"}` | HTTP 201; body `data.id` (UUID), `data.firm_name === "ABC Traders"`, `data.customer_type === "Primary Dealer"`, `data.is_active === true`, `data.gstin === "27AAPFU0939F1ZV"` | API | |
| TC-CUST-002 | Admin | Admin creates Primary Dealer with required fields only | P0 | 1. Login as Admin 2. `POST /api/v1/customers` body `{"firm_name":"Minimal Dealer"}` | HTTP 201; `data.customer_type === "Primary Dealer"` (default); `data.is_active === true`; all optional fields are null | API | createCustomerSchema: only firm_name required |
| TC-CUST-003 | Admin | Default customer_type is Primary Dealer when omitted | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"No Type Given"}` | HTTP 201; `data.customer_type === "Primary Dealer"` | API | z.enum().default('Primary Dealer') |
| TC-CUST-004 | Admin | Duplicate firm_name creates customer with warning message | P1 | 1. Create customer `firm_name="Same Name Firm"` 2. `POST /api/v1/customers` again with `firm_name="Same Name Firm"` | HTTP 201; second customer IS created; response `message` contains "Note: A customer with this firm name already exists."; both customers appear in DB | API | customer.controller line 14; not a 409 — this is intentional business logic |
| TC-CUST-005 | Admin | Audit log entry created on customer create | P1 | 1. Create customer 2. Query: `SELECT * FROM audit_logs WHERE entity_type = 'customer' AND action = 'CREATE_CUSTOMER' ORDER BY created_at DESC LIMIT 1` | Audit row exists with correct `entity_id` and `user_id` | Integration | |

---

## Section 04.2 — Create customer — Supervisor

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-010 | Supervisor | Supervisor creates Primary Dealer | P0 | 1. Login as Supervisor 2. `POST /api/v1/customers` with `supervisor_token` body `{"firm_name":"Sup Primary Dealer","customer_type":"Primary Dealer","contact_person_mobile":"9811112222"}` | HTTP 201; customer created; `data.customer_type === "Primary Dealer"` | API | authorize(ADMIN, SUPERVISOR) |
| TC-CUST-011 | Supervisor | Supervisor creates Sub Dealer with valid primary | P0 | 1. Ensure a Primary Dealer exists with id `<primary_id>` 2. Login as Supervisor 3. `POST /api/v1/customers` with `supervisor_token` body `{"firm_name":"Sup Sub Dealer","customer_type":"Sub Dealer","primary_dealer_id":"<primary_id>","contact_person_mobile":"9811113333"}` | HTTP 201; `data.customer_type === "Sub Dealer"`, `data.primary_dealer_id === <primary_id>` | API | |
| TC-CUST-012 | Supervisor | Supervisor updates a customer | P0 | 1. Login as Supervisor 2. `PUT /api/v1/customers/<valid_id>` with `supervisor_token` body `{"contact_person_mobile":"9999988888"}` | HTTP 200; `data.contact_person_mobile === "9999988888"` | API | |
| TC-CUST-013 | Supervisor | Supervisor cannot delete a customer | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/customers/<valid_id>` with `supervisor_token` | HTTP 403; customer NOT deactivated | API | authorize(ADMIN) only for delete |

---

## Section 04.3 — Sub Dealer creation and auto-fill

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-020 | Admin | Sub Dealer inherits address from Primary Dealer when address not provided | P0 | 1. Create Primary Dealer with `address="42 Market St"` 2. Create Sub Dealer linked to that primary, omitting `address` | Sub Dealer `data.address === "42 Market St"` (copied from primary) | Integration | customer.service lines 38–43 |
| TC-CUST-021 | Admin | Sub Dealer inherits GSTIN from Primary Dealer when GSTIN not provided | P0 | 1. Create Primary Dealer with `gstin="27AAPFU0939F1ZV"` 2. Create Sub Dealer linked to primary, omitting `gstin` | Sub Dealer `data.gstin === "27AAPFU0939F1ZV"` | Integration | |
| TC-CUST-022 | Admin | Sub Dealer inherits contact_person_name and mobile from Primary | P0 | 1. Create Primary Dealer with `contact_person_name="Rajan"`, `contact_person_mobile="9876543210"` 2. Create Sub Dealer omitting both contact fields | Sub Dealer `contact_person_name === "Rajan"`, `contact_person_mobile === "9876543210"` | Integration | |
| TC-CUST-023 | Admin | Sub Dealer explicit field overrides Primary Dealer auto-fill | P1 | 1. Create Primary Dealer with `address="Primary St"` 2. Create Sub Dealer with `address="Sub Dealer St"` (explicitly provided) | Sub Dealer `data.address === "Sub Dealer St"` (explicit value used, not primary's) | Integration | `if (address == null)` guard |
| TC-CUST-024 | Admin | Sub Dealer missing primary_dealer_id returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"No Primary","customer_type":"Sub Dealer"}` | HTTP 400; Zod refine error "Sub Dealer must have a primary dealer"; no customer created | API | createCustomerSchema refine |
| TC-CUST-025 | Admin | Sub Dealer with non-existent primary_dealer_id returns 404 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Ghost Sub","customer_type":"Sub Dealer","primary_dealer_id":"00000000-0000-0000-0000-000000000000"}` | HTTP 404; "Primary dealer not found"; no customer created | API | customer.service NotFoundError |
| TC-CUST-026 | Admin | Sub Dealer with inactive primary_dealer_id returns 404 | P1 | 1. Create and then deactivate a Primary Dealer 2. Attempt to create Sub Dealer linked to deactivated primary | HTTP 404; "Primary dealer not found" — service queries `is_active = true` | Integration | |
| TC-CUST-027 | Admin | Sub Dealer with primary_dealer_id pointing to another Sub Dealer returns 404 | P1 | 1. Create a Sub Dealer with id `<sub_id>` 2. Create another Sub Dealer with `primary_dealer_id=<sub_id>` | HTTP 404; "Primary dealer not found" — service queries `customer_type = 'Primary Dealer'` | Integration | |

---

## Section 04.4 — List customers (GET /customers)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-030 | Admin | GET /customers returns paginated list | P0 | 1. Login as Admin 2. `GET /api/v1/customers` | HTTP 200; body contains `data` (array), `total`, `page === 1`, `limit === 25`, `totalPages`; each object has `id`, `firm_name`, `customer_type`, `is_active` | API | |
| TC-CUST-031 | Admin | GET /customers includes primary_dealer_name for Sub Dealers | P0 | 1. Create Primary Dealer "Parent Co" 2. Create Sub Dealer linked to it 3. `GET /api/v1/customers` | Sub Dealer row includes `primary_dealer_name === "Parent Co"` from the LEFT JOIN | API | customer.service SELECT includes pd.firm_name |
| TC-CUST-032 | Admin | GET /customers default includes both active and inactive | P1 | 1. Deactivate one customer 2. `GET /api/v1/customers` | Both active and inactive customers returned (no `is_active` filter by default) | API | No default is_active filter in getCustomers |
| TC-CUST-033 | Admin | GET /customers?is_active=true returns only active | P1 | 1. Ensure mix of active/inactive customers 2. `GET /api/v1/customers?is_active=true` | All returned customers have `is_active === true` | API | |
| TC-CUST-034 | Admin | GET /customers?is_active=false returns only inactive | P1 | 1. `GET /api/v1/customers?is_active=false` | All returned customers have `is_active === false` | API | |
| TC-CUST-035 | Admin | GET /customers?customer_type=Primary Dealer filters type | P0 | 1. `GET /api/v1/customers?customer_type=Primary Dealer` | All items have `customer_type === "Primary Dealer"` | API | |
| TC-CUST-036 | Admin | GET /customers?customer_type=Sub Dealer filters type | P0 | 1. `GET /api/v1/customers?customer_type=Sub Dealer` | All items have `customer_type === "Sub Dealer"` | API | |
| TC-CUST-037 | Admin | GET /customers?page=2&limit=5 returns correct slice | P1 | 1. Ensure > 5 customers 2. `GET /api/v1/customers?page=2&limit=5` | `page === 2`, `limit === 5`, `data.length <= 5`; `total` reflects full count | API | |
| TC-CUST-038 | Dispatch Operator | Dispatch Operator can GET /customers | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/customers` with `dispatch_token` | HTTP 200; list returned | API | No authorize() on GET |

---

## Section 04.5 — Get customer by ID

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-040 | Admin | GET /customers/:id returns correct customer | P0 | 1. Login as Admin 2. Create customer, note `id` 3. `GET /api/v1/customers/<id>` | HTTP 200; `data.id === <id>`; all fields returned | API | |
| TC-CUST-041 | Admin | GET /customers/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/customers/00000000-0000-0000-0000-000000000000` | HTTP 404; "Customer not found" | API | |
| TC-CUST-042 | Admin | GET /customers/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/customers/not-a-uuid` | HTTP 400; Zod "Invalid customer ID format" | API | customerIdParamSchema |
| TC-CUST-043 | Warehouse Operator | Warehouse Operator can GET /customers/:id | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/customers/<valid_uuid>` | HTTP 200; customer returned | API | |

---

## Section 04.6 — Primary dealers endpoint

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-045 | Admin | GET /customers/primary-dealers returns only active primary dealers | P0 | 1. Ensure at least one active Primary Dealer and one deactivated Primary Dealer exist 2. `GET /api/v1/customers/primary-dealers` | HTTP 200; `data` array contains only active Primary Dealers; deactivated primary absent; Sub Dealers absent | API | getPrimaryDealers WHERE customer_type='Primary Dealer' AND is_active=true |
| TC-CUST-046 | Admin | GET /customers/primary-dealers ordered by firm_name | P1 | 1. Create primaries "Zebra Co" and "Apple Dealers" 2. `GET /api/v1/customers/primary-dealers` | "Apple Dealers" appears before "Zebra Co" (ORDER BY firm_name) | API | |
| TC-CUST-047 | Dispatch Operator | Dispatch Operator can GET /customers/primary-dealers | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/customers/primary-dealers` with `dispatch_token` | HTTP 200; list returned | API | Used in dispatch workflow |
| TC-CUST-048 | Any | Route /primary-dealers is defined before /:id — no UUID conflict | P0 | 1. `GET /api/v1/customers/primary-dealers` (literal string, not a UUID) | HTTP 200; primary dealers list returned; server does not treat "primary-dealers" as an ID param | API | Route order in customer.routes.ts: /primary-dealers before /:id |

---

## Section 04.7 — Sub dealers endpoint

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-050 | Admin | GET /customers/:id/sub-dealers returns subs linked to that primary | P0 | 1. Create Primary Dealer P1 2. Create Sub Dealers S1 and S2 linked to P1 3. Create Sub Dealer S3 linked to a different primary 4. `GET /api/v1/customers/<P1_id>/sub-dealers` | HTTP 200; response contains S1 and S2; S3 absent | API | getSubDealers WHERE primary_dealer_id = $1 |
| TC-CUST-051 | Admin | GET /customers/:id/sub-dealers returns empty array if no subs | P1 | 1. Create a Primary Dealer with no Sub Dealers 2. `GET /api/v1/customers/<primary_id>/sub-dealers` | HTTP 200; `data === []` | API | |
| TC-CUST-052 | Admin | GET /customers/:id/sub-dealers with malformed UUID returns 400 | P1 | 1. `GET /api/v1/customers/bad-uuid/sub-dealers` | HTTP 400; Zod "Invalid customer ID format" | API | |
| TC-CUST-053 | Admin | GET /customers/:id/sub-dealers only includes active sub dealers | P1 | 1. Create Primary Dealer; create active Sub S1 and deactivated Sub S2 2. `GET /api/v1/customers/<primary_id>/sub-dealers` | Only S1 returned (`is_active = true` filter in getSubDealers) | API | WHERE is_active = true |

---

## Section 04.8 — Update customer

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-060 | Admin | Admin updates firm_name | P0 | 1. Login as Admin 2. Create customer 3. `PUT /api/v1/customers/<id>` body `{"firm_name":"Updated Firm"}` 4. `GET /api/v1/customers/<id>` | PUT HTTP 200; GET returns `firm_name === "Updated Firm"`; `updated_at` newer | API | |
| TC-CUST-061 | Admin | Admin updates address, delivery_location | P1 | 1. `PUT /api/v1/customers/<id>` body `{"address":"New Address","delivery_location":"New Warehouse"}` | HTTP 200; fields updated in DB | API | |
| TC-CUST-062 | Admin | Admin updates GSTIN to valid value | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":"29AABCU9603R1ZP"}` | HTTP 200; `data.gstin === "29AABCU9603R1ZP"` | API | |
| TC-CUST-063 | Admin | Admin sets GSTIN to null (clear) | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":null}` | HTTP 200; `data.gstin === null` | API | updateCustomerSchema allows nullable |
| TC-CUST-064 | Admin | Admin updates is_active to false (deactivate) | P0 | 1. `PUT /api/v1/customers/<id>` body `{"is_active":false}` 2. `GET /api/v1/customers?is_active=true` | PUT HTTP 200; customer absent from active list | API | |
| TC-CUST-065 | Admin | Admin updates customer_type to Sub Dealer | P1 | 1. Create Primary Dealer P1 2. Create another Primary Dealer P2 3. `PUT /api/v1/customers/<P2_id>` body `{"customer_type":"Sub Dealer","primary_dealer_id":"<P1_id>"}` | HTTP 200; P2 now has `customer_type === "Sub Dealer"` | API | No refine on update schema |
| TC-CUST-066 | Admin | PUT with empty body returns unchanged customer | P1 | 1. `PUT /api/v1/customers/<id>` body `{}` | HTTP 200; customer returned unchanged | API | fields.length === 0 early return |
| TC-CUST-067 | Admin | PUT non-existent customer returns 404 | P0 | 1. `PUT /api/v1/customers/00000000-0000-0000-0000-000000000000` body `{"firm_name":"Ghost"}` | HTTP 404; "Customer not found" | API | |
| TC-CUST-068 | Admin | Audit log created on update | P1 | 1. Update customer 2. Check audit_logs | Row with `action === "UPDATE_CUSTOMER"`, correct entity_id | Integration | |
| TC-CUST-069 | Admin | Private marka and GR fields are updatable | P1 | 1. `PUT /api/v1/customers/<id>` body `{"private_marka":"ABC","gr":"GR-2026-001"}` | HTTP 200; `data.private_marka === "ABC"`, `data.gr === "GR-2026-001"` | API | |

---

## Section 04.9 — Delete customer

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-070 | Admin | Admin soft-deletes customer | P0 | 1. Login as Admin 2. Create customer 3. `DELETE /api/v1/customers/<id>` | HTTP 200; message "Customer deactivated successfully"; DB `is_active = false` | API | |
| TC-CUST-071 | Admin | Deleted customer absent from active list | P0 | 1. Delete a customer 2. `GET /api/v1/customers?is_active=true` | Customer not present; appears in `?is_active=false` | API | |
| TC-CUST-072 | Admin | Deleted customer still retrievable by ID | P1 | 1. Delete a customer 2. `GET /api/v1/customers/<id>` | HTTP 200; `data.is_active === false`; record not hard deleted | API | getCustomerById no is_active filter |
| TC-CUST-073 | Admin | Delete non-existent customer returns 404 | P0 | 1. `DELETE /api/v1/customers/00000000-0000-0000-0000-000000000000` | HTTP 404; "Customer not found" | API | |
| TC-CUST-074 | Admin | Delete customer referenced by a sample record — current behavior | P1 | 1. Create customer C1 2. Create a sample record using C1 as customer_id 3. `DELETE /api/v1/customers/<C1_id>` | HTTP 200; customer deactivated (no FK guard in customer.service.deleteCustomer); sample record retains `customer_id` FK pointing to deactivated customer — **discrepancy: README says deletion guard if referenced; code has none** | Integration | **Flag for dev team** |
| TC-CUST-075 | Admin | Audit log created on delete | P1 | 1. Delete customer 2. Check audit_logs | Row with `action === "DELETE_CUSTOMER"`, correct entity_id | Integration | |
| TC-CUST-076 | Supervisor | Supervisor cannot delete customer | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/customers/<valid_id>` with `supervisor_token` | HTTP 403 | API | |

---

## Section 04.10 — Search and filter

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-080 | Admin | Search by firm_name returns matching customers | P0 | 1. Create customers "Alpha Footwear" and "Beta Shoes" 2. `GET /api/v1/customers?search=Alpha` | HTTP 200; result includes "Alpha Footwear"; "Beta Shoes" absent | API | ILIKE on firm_name |
| TC-CUST-081 | Admin | Search is case-insensitive | P1 | 1. `GET /api/v1/customers?search=alpha` | Returns "Alpha Footwear" (lowercase search) | API | ILIKE is case-insensitive |
| TC-CUST-082 | Admin | Search by contact_person_name | P1 | 1. Create customer with `contact_person_name="Rajan Shah"` 2. `GET /api/v1/customers?search=Rajan` | Customer returned in results | API | ILIKE also checks contact_person_name |
| TC-CUST-083 | Admin | Search by GSTIN | P1 | 1. Create customer with `gstin="27AAPFU0939F1ZV"` 2. `GET /api/v1/customers?search=27AAPFU` | Customer returned | API | ILIKE also checks gstin |
| TC-CUST-084 | Admin | Search with no match returns empty array | P1 | 1. `GET /api/v1/customers?search=ZZZNOMATCH` | HTTP 200; `data === []`; `total === 0` | API | |
| TC-CUST-085 | Admin | Filter customer_type + search combined | P1 | 1. `GET /api/v1/customers?customer_type=Sub Dealer&search=sup` | Only Sub Dealers whose firm_name/contact/GSTIN contain "sup" | API | AND conditions combined |
| TC-CUST-086 | Admin | Pagination: total pages calculation correct | P1 | 1. Ensure exactly 13 customers exist 2. `GET /api/v1/customers?limit=5&page=1` | `total === 13`, `totalPages === 3`, `data.length === 5` | API | |
| TC-CUST-087 | Admin | Page beyond total returns empty array | P1 | 1. `GET /api/v1/customers?limit=5&page=999` | HTTP 200; `data === []`; `total` unchanged | API | OFFSET exceeds total |

---

## Section 04.11 — Role access denial matrix

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-090 | Warehouse Operator | Warehouse Operator cannot POST /customers | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/customers` with `warehouse_token` body `{"firm_name":"WH Customer"}` | HTTP 403 | API | |
| TC-CUST-091 | Dispatch Operator | Dispatch Operator cannot POST /customers | P0 | 1. Login as Dispatch Operator 2. Same body with `dispatch_token` | HTTP 403 | API | |
| TC-CUST-092 | Warehouse Operator | Warehouse Operator cannot PUT /customers/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/customers/<valid_id>` with `warehouse_token` body `{"firm_name":"Hacked"}` | HTTP 403; customer unchanged | API | |
| TC-CUST-093 | Dispatch Operator | Dispatch Operator cannot PUT /customers/:id | P0 | 1. Login as Dispatch Operator 2. Same request with `dispatch_token` | HTTP 403 | API | |
| TC-CUST-094 | Supervisor | Supervisor cannot DELETE /customers/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/customers/<valid_id>` with `supervisor_token` | HTTP 403 | API | |
| TC-CUST-095 | Dispatch Operator | Dispatch Operator cannot DELETE /customers/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/customers/<valid_id>` with `dispatch_token` | HTTP 403 | API | |
| TC-CUST-096 | Warehouse Operator | Warehouse Operator CAN GET /customers list | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/customers` with `warehouse_token` | HTTP 200; list returned | API | No authorize() on GET |
| TC-CUST-097 | Dispatch Operator | Dispatch Operator CAN GET /customers/:id | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/customers/<valid_id>` with `dispatch_token` | HTTP 200; customer returned | API | |

---

## Section 04.12 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-100 | Admin | Missing firm_name returns 400 | P0 | 1. `POST /api/v1/customers` body `{"customer_type":"Primary Dealer"}` | HTTP 400; Zod error "Firm name is required" | API | |
| TC-CUST-101 | Admin | Empty firm_name returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"","customer_type":"Primary Dealer"}` | HTTP 400; Zod min 1 error for firm_name | API | |
| TC-CUST-102 | Admin | firm_name exceeding 255 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `firm_name` as 256-char string | HTTP 400; Zod error "Firm name must not exceed 255 characters" | API | |
| TC-CUST-103 | Admin | Invalid GSTIN format returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Test","gstin":"INVALIDGSTIN"}` | HTTP 400; Zod error "Invalid GSTIN format (expected 15-char Indian GST format, e.g., 22AAAAA0000A1Z5)" | API | GSTIN_REGEX |
| TC-CUST-104 | Admin | Valid GSTIN format accepted | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"GSTIN Test","gstin":"22AAAAA0000A1Z5"}` | HTTP 201; customer created with `gstin === "22AAAAA0000A1Z5"` | API | |
| TC-CUST-105 | Admin | contact_person_mobile shorter than 10 digits returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Short Mobile","contact_person_mobile":"98765"}` | HTTP 400; Zod error "Contact mobile must be 10-15 digits" | API | MOBILE_REGEX /^[0-9]{10,15}$/ |
| TC-CUST-106 | Admin | contact_person_mobile longer than 15 digits returns 400 | P1 | 1. `POST /api/v1/customers` body with `contact_person_mobile` as 16-digit string | HTTP 400; MOBILE_REGEX error | API | |
| TC-CUST-107 | Admin | contact_person_mobile with non-digit chars returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Phone Test","contact_person_mobile":"98765+3210"}` | HTTP 400; MOBILE_REGEX rejects non-digits | API | |
| TC-CUST-108 | Admin | address exceeding 2000 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `address` as 2001-char string | HTTP 400; Zod error "Address must not exceed 2000 characters" | API | |
| TC-CUST-109 | Admin | delivery_location exceeding 255 chars returns 400 | P1 | 1. `POST /api/v1/customers` body with `delivery_location` as 256-char string | HTTP 400; Zod error "Delivery location must not exceed 255 characters" | API | |
| TC-CUST-110 | Admin | Invalid customer_type value returns 400 | P0 | 1. `POST /api/v1/customers` body `{"firm_name":"Bad Type","customer_type":"Retailer"}` | HTTP 400; Zod enum error for `customer_type` | API | |
| TC-CUST-111 | Admin | primary_dealer_id with invalid UUID format returns 400 | P1 | 1. `POST /api/v1/customers` body `{"firm_name":"Bad UUID Sub","customer_type":"Sub Dealer","primary_dealer_id":"not-a-uuid"}` | HTTP 400; Zod error "Invalid primary dealer ID" | API | z.string().uuid() |
| TC-CUST-112 | Admin | Update with invalid GSTIN returns 400 | P1 | 1. `PUT /api/v1/customers/<id>` body `{"gstin":"BADGSTIN"}` | HTTP 400; Zod GSTIN regex error | API | updateCustomerSchema |
| TC-CUST-113 | Admin | Unauthenticated POST /customers returns 401 | P0 | 1. `POST /api/v1/customers` with no token | HTTP 401; "Authentication token is required" | API | |

---

## Section 04.13 — Playwright E2E: Customers page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-CUST-E2E-001 | Admin | Customers page renders with search bar and type filter | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/customers` | Page renders; search input has placeholder "Search by firm name, GSTIN, or contact..."; type filter `<select>` with options "All Types", "Primary Dealer", "Sub Dealer"; "Add Customer" button visible | E2E | customers/page.tsx |
| TC-CUST-E2E-002 | Admin | Table columns: Firm Name, Type, Primary Dealer, Delivery Location, GSTIN, Contact Person, Mobile, Status, Actions | P0 | 1. Login as Admin 2. Navigate to `/customers` with customers present | Desktop table has all 9 column headers; "Actions" column visible only when `isAdmin` | E2E | |
| TC-CUST-E2E-003 | Admin | "Add Customer" button opens create modal | P0 | 1. Login as Admin 2. Navigate to `/customers` 3. Click "Add Customer" button (Plus icon) | Modal opens with title "Add Customer"; radio buttons for "Primary Dealer" and "Sub Dealer" visible; "Firm Name *" input field present; Cancel and "Create Customer" buttons | E2E | |
| TC-CUST-E2E-004 | Admin | Selecting Sub Dealer radio reveals Primary Dealer dropdown | P0 | 1. Open "Add Customer" modal 2. Select "Sub Dealer" radio | A "Select Primary Dealer *" dropdown appears; dropdown populated with active primary dealers; selecting a dealer auto-fills address, delivery_location, GSTIN, contact_person_name, contact_person_mobile | E2E | |
| TC-CUST-E2E-005 | Admin | Auto-filled fields are read-only for Sub Dealer | P1 | 1. Open modal 2. Select Sub Dealer 3. Select a Primary Dealer from dropdown | Address, Delivery Location, GSTIN, Contact Person Name, Contact Person Mobile inputs have `readOnly` attribute; styled with `bg-gray-100 text-gray-500 cursor-not-allowed`; info text "Address, location, GSTIN, and contact are inherited…" visible | E2E | |
| TC-CUST-E2E-006 | Admin | Create Primary Dealer via UI appears in list | P0 | 1. Open modal 2. Leave "Primary Dealer" selected 3. Enter `firm_name="E2E Primary Test"`, `contact_person_mobile="9876543210"` 4. Click "Create Customer" | Success toast shown; modal closes; new row appears in table with "Primary Dealer" blue badge; firm_name correct | E2E | |
| TC-CUST-E2E-007 | Admin | Type badge: Primary Dealer = blue, Sub Dealer = orange | P1 | 1. Navigate to `/customers` with both types present | Primary Dealer rows show blue badge; Sub Dealer rows show orange badge | E2E | Badge variant in customers/page.tsx |
| TC-CUST-E2E-008 | Admin | Status badge: active = green, inactive = gray | P1 | 1. Navigate to `/customers` with both active and inactive customers | Active customers show green "Active" badge; inactive show gray "Inactive" | E2E | |
| TC-CUST-E2E-009 | Admin | Edit customer button opens modal pre-filled | P0 | 1. Navigate to `/customers` 2. Click "Edit" on an existing customer | Modal opens with title "Edit Customer"; all fields pre-populated with current customer data; "Update Customer" submit button visible | E2E | |
| TC-CUST-E2E-010 | Admin | Deactivate / Activate icon button toggles customer status | P0 | 1. Navigate to `/customers` 2. Click UserX icon (deactivate) on an active customer | API call `PUT /api/v1/customers/<id>` with `{"is_active":false}`; toast "Customer deactivated successfully"; status badge changes to gray "Inactive" | E2E | toggleStatus in customers/page.tsx |
| TC-CUST-E2E-011 | Admin | Type filter dropdown filters list in real time | P0 | 1. Navigate to `/customers` with both types present 2. Select "Primary Dealer" from type filter | Only Primary Dealer rows shown; page resets to 1; sub dealers absent | E2E | setPage(1) on filter change |
| TC-CUST-E2E-012 | Admin | Search filters by firm name | P0 | 1. Type "Alpha" in search bar 2. Wait for debounce | Table updates to show only customers matching "Alpha"; `GET /api/v1/customers?search=Alpha` called; debounce delays API call | E2E | useDebounce hook |
| TC-CUST-E2E-013 | Admin | Pagination controls visible when totalPages > 1 | P1 | 1. Ensure > 25 customers exist 2. Navigate to `/customers` | "Previous" and "Next" buttons visible at bottom; "Page X of Y" text shown; Previous disabled on page 1 | E2E | |
| TC-CUST-E2E-014 | Supervisor | Supervisor sees customers page but NO "Add Customer" button | P1 | 1. Login as Supervisor 2. Navigate to `http://localhost:3000/customers` | Customers page renders (Supervisor passes `isManager` check); "Add Customer" button NOT visible (Supervisor fails `isAdmin` check); list is read-only from UI perspective | E2E | **UI discrepancy:** API allows Supervisor POST but UI hides the Add button. Flag for review. |
| TC-CUST-E2E-015 | Warehouse Operator | Warehouse Operator sees Access Denied on /customers | P0 | 1. Login as Warehouse Operator 2. Navigate to `http://localhost:3000/customers` | Page shows Building2 icon, heading "Access Denied", text "Only administrators and supervisors can manage customers."; no customer list | E2E | isManager guard (Admin or Supervisor) |
| TC-CUST-E2E-016 | Admin | Mobile card view renders firm name, type badge, status badge | P1 | 1. Login as Admin on mobile viewport (< 768px) 2. Navigate to `/customers` | Desktop table hidden; mobile cards visible with firm name, type badge, status badge; primary_dealer_name shown if present; Actions (Edit/Deactivate) buttons visible for Admin | E2E | md:hidden / hidden md:block breakpoints |
| TC-CUST-E2E-017 | Admin | GSTIN displayed in mono font in table | P1 | 1. Create customer with GSTIN 2. Navigate to `/customers` | GSTIN cell uses `font-mono text-xs` CSS class; GSTIN string displayed as-is | E2E | |
| TC-CUST-E2E-018 | Admin | Empty state message when no customers match filter | P1 | 1. Set search to "ZZZNOMATCH" | Shows text "No customers match your filter." | E2E | Empty state condition in customers/page.tsx |
