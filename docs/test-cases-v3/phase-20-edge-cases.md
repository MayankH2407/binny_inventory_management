# Phase 20 — Negative Tests, Edge Cases, Boundary Values & Performance

**Module codes:** `EDGE`
**Roles under test:** As specified per test; defaults to Admin for isolation.
**Backend API base:** `http://localhost:5000/api/v1`
**Frontend URL:** `http://localhost:3000`

**Pagination constants (from `constants.ts`):** `DEFAULT_PAGE: 1`, `DEFAULT_LIMIT: 25`, `MAX_LIMIT: 100`.
**Rate limit (from `constants.ts`):** `MAX_REQUESTS: 50000` per 15 min window (effectively no limit for single-user testing).

**Dependencies:** Run after Phase 01–19 (seed data in place).

---

## §20.1 — Pagination boundary tests

These tests apply to every list endpoint. Template: substitute `<endpoint>` with each of: `/products`, `/child-boxes`, `/master-cartons`, `/samples`, `/ecommerce`, `/dispatches`, `/customers`, `/users`, `/reports/dispatch-summary` (where pagination applies).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-001 | Admin | page=0 on any list endpoint — handled gracefully | P1 | 1. `GET /api/v1/products?page=0`. | HTTP 200 with page 1 data (server normalises 0 to 1) OR HTTP 400 with validation error; no 500. | API | |
| TC-EDGE-002 | Admin | page=1 — baseline valid page | P0 | 1. `GET /api/v1/products?page=1&limit=10`. | HTTP 200; `page: 1`; up to 10 rows; `total >= rows.length`. | API | |
| TC-EDGE-003 | Admin | page = last valid page — returns last set of rows | P1 | 1. `GET /api/v1/products?limit=1` to determine `total`. 2. Compute `lastPage = Math.ceil(total/25)`. 3. `GET /api/v1/products?page=<lastPage>`. | HTTP 200; `data` array is non-empty (contains the last row(s)); no 500 error. | API | |
| TC-EDGE-004 | Admin | page > last page — returns empty data array | P1 | 1. Determine total products = N. 2. `GET /api/v1/products?page=99999&limit=25`. | HTTP 200; `data: []`; `total` unchanged; no 500 error. | API | |
| TC-EDGE-005 | Admin | limit=0 — handled gracefully | P1 | 1. `GET /api/v1/products?limit=0`. | HTTP 200 with server default limit applied OR HTTP 400; no 500 error; server does not return ALL rows. | API | Prevents runaway query returning millions of rows. |
| TC-EDGE-006 | Admin | limit=1 — minimum valid limit | P1 | 1. `GET /api/v1/products?limit=1`. | HTTP 200; `data` array contains exactly 1 item. | API | |
| TC-EDGE-007 | Admin | limit=100 — at MAX_LIMIT | P1 | 1. `GET /api/v1/products?limit=100`. | HTTP 200; up to 100 rows returned; no error. | API | |
| TC-EDGE-008 | Admin | limit=101 — exceeds MAX_LIMIT (100) | P1 | 1. `GET /api/v1/products?limit=101`. | HTTP 400 with message indicating limit exceeds max (100) OR server silently caps at 100; no 500. Response never returns more than 100 rows. | API | `PAGINATION.MAX_LIMIT: 100` in `constants.ts`. |
| TC-EDGE-009 | Admin | limit = large integer (9999) — server caps or rejects | P1 | 1. `GET /api/v1/products?limit=9999`. | HTTP 400 OR server caps at 100; no 500; no OOM. | API | |
| TC-EDGE-010 | Admin | Pagination consistency: page 1 + page 2 results do not overlap | P1 | 1. `GET /api/v1/products?page=1&limit=5` → note first 5 IDs. 2. `GET /api/v1/products?page=2&limit=5` → note next 5 IDs. | No ID appears in both pages. Total distinct IDs = 10 (assuming ≥ 10 products). | API | |

---

## §20.2 — Max-length / min-length / Unicode / emoji input

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-011 | Admin | Product article_name exactly at max length — accepted | P1 | 1. Determine the DB/model max length for `article_name` (confirm via schema or test). 2. POST a product with `article_name` exactly at that length. | HTTP 201; product created; `article_name` stored without truncation. | API | |
| TC-EDGE-012 | Admin | Product article_name max+1 chars — rejected | P1 | 1. POST a product with `article_name` = (max+1) chars. | HTTP 400; validation error referencing `article_name` length; no 500. | API | |
| TC-EDGE-013 | Admin | Product article_code at max (20 chars) — accepted | P0 | 1. POST product with `article_code: "ABCDEFGHIJ1234567890"` (20 chars). | HTTP 201; `article_code` stored as-is. | API | From v2 TC-EDGE-001. |
| TC-EDGE-014 | Admin | Product article_code 21 chars — rejected | P0 | 1. POST product with `article_code: "ABCDEFGHIJ12345678901"` (21 chars). | HTTP 400; `article_code` validation error. | API | From v2 TC-EDGE-002. |
| TC-EDGE-015 | Admin | Customer firm_name with 255 chars — boundary accepted or rejected cleanly | P2 | 1. POST `/api/v1/customers` with `firm_name` = 255 × "A". | HTTP 201 if within DB column limit; HTTP 400 if limit is lower; no 500. | API | |
| TC-EDGE-016 | Admin | Customer GSTIN exactly 15 chars — accepted | P1 | 1. POST customer with `gstin: "22AAAAA0000A1Z5"`. | HTTP 201; `gstin` stored as `"22AAAAA0000A1Z5"`. | API | |
| TC-EDGE-017 | Admin | Customer GSTIN 14 chars — rejected | P1 | 1. POST customer with `gstin: "22AAAAA0000A1Z"` (14 chars). | HTTP 400; validation error referencing `gstin`. | API | |
| TC-EDGE-018 | Admin | Product article_name with Unicode / accented characters — stored without corruption | P1 | 1. POST product with `article_name: "Étude Señor Über"`. 2. GET the product. | GET returns `article_name: "Étude Señor Über"` byte-for-byte; no mojibake. | API | |
| TC-EDGE-019 | Admin | Product article_name with emoji — stored correctly or rejected cleanly | P2 | 1. POST product with `article_name: "Shoe 👟"`. | HTTP 201 with emoji stored (DB uses UTF-8 with 4-byte support) OR HTTP 400 with clear message; no 500. | API | PostgreSQL TEXT columns support emoji if DB encoding is UTF-8. |
| TC-EDGE-020 | Admin | Barcode with leading/trailing whitespace in trace query | P1 | 1. `GET /api/v1/inventory/trace/ BINNY-CB-001 ` (spaces around barcode in URL — URL-encoded as `%20BINNY-CB-001%20`). | HTTP 404 (barcode not found as whitespace-padded string); no 500 error. Server should NOT silently strip whitespace and accidentally match a different barcode. | API | |
| TC-EDGE-021 | Admin | Customer phone number — 9 digits (too short) rejected | P1 | 1. POST customer with `mobile: "999999999"` (9 digits). | HTTP 400; validation error on `mobile` field. | API | |
| TC-EDGE-022 | Admin | Customer phone number — 11 digits (too long) rejected | P1 | 1. POST customer with `mobile: "99999999999"` (11 digits). | HTTP 400; validation error on `mobile` field. | API | |
| TC-EDGE-023 | Admin | Section name with only whitespace — rejected | P1 | 1. POST `/api/v1/sections` with `{"name": "   "}`. | HTTP 400; validation error; no section created. | API | |
| TC-EDGE-024 | Admin | MRP with value 0 — zero boundary | P1 | 1. POST product with `mrp: 0`. | HTTP 400 if business rule mandates MRP > 0 (preferred); OR HTTP 201 if zero is technically allowed; no 500. | API | |
| TC-EDGE-025 | Admin | MRP with negative value — rejected | P0 | 1. POST product with `mrp: -100`. | HTTP 400; validation error; no product created. | API | |
| TC-EDGE-026 | Admin | Product with empty object body `{}` — rejected | P0 | 1. POST `/api/v1/products` with body `{}`. | HTTP 400; multiple validation errors for required fields; no 500. | API | |

---

## §20.3 — Wrong types and bad formats

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-027 | Admin | Numeric field (mrp) sent as string — rejected or coerced | P1 | 1. POST product with `{"mrp": "not-a-number", ...other required fields}`. | HTTP 400; validation error on `mrp` type; no 500. | API | |
| TC-EDGE-028 | Admin | UUID field (section_id) sent as non-UUID string | P0 | 1. POST product with `{"section_id": "not-a-uuid", ...}`. | HTTP 400; validation error on `section_id`; no DB error about invalid UUID format. | API | |
| TC-EDGE-029 | Admin | Date field sent as bad ISO string | P1 | 1. `GET /api/v1/reports/dispatch-summary?from_date=32-13-2026`. | HTTP 400 or HTTP 200 with empty result; no 500; no Postgres DATE parse error propagated to client. | API | |
| TC-EDGE-030 | Admin | Enum field (category) with unknown value | P1 | 1. POST product with `{"category": "Pets", ...other required fields}`. | HTTP 400; validation error listing valid categories (`Gents`, `Ladies`, `Boys`, `Girls`); no 500. | API | |
| TC-EDGE-031 | Admin | Child box count as float (1.5) — rejected | P1 | 1. POST `/api/v1/child-boxes/bulk` with `{"product_id": "<valid_id>", "count": 1.5}`. | HTTP 400; validation error on `count` field (must be integer); no partial boxes created. | API | |
| TC-EDGE-032 | Admin | Child box count as string ("five") — rejected | P1 | 1. POST `/api/v1/child-boxes/bulk` with `{"product_id": "<valid_id>", "count": "five"}`. | HTTP 400; validation error on `count`; no 500. | API | |
| TC-EDGE-033 | Admin | Boolean field sent as string ("true") — handled correctly or rejected | P2 | 1. GET `/api/v1/customers?is_active=true` (this is normal). 2. GET `/api/v1/customers?is_active=yes`. | For `?is_active=true`: HTTP 200 with active customers. For `?is_active=yes`: HTTP 400 or silently defaults to no filter; no 500. | API | |
| TC-EDGE-034 | Admin | Malformed JSON body — rejected with 400 | P0 | 1. POST `/api/v1/products` with `Content-Type: application/json` and body `{bad json`. | HTTP 400; JSON parse error message; no 500 or unhandled exception. | API | Express `express.json()` handles this. |
| TC-EDGE-035 | Admin | Empty JSON body where body is required | P0 | 1. POST `/api/v1/products` with `Content-Type: application/json` and empty body `{}`. | HTTP 400; required-field validation errors; no 500. | API | |
| TC-EDGE-036 | Admin | Missing Content-Type header with JSON body | P1 | 1. POST `/api/v1/products` without `Content-Type` header, sending raw JSON. | HTTP 400 (body not parsed) or HTTP 415 (Unsupported Media Type); no 500. | API | |

---

## §20.4 — CSV upload file-size and format limits

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-037 | Admin | Child box CSV upload > 10MB — rejected by multer | P0 | 1. Construct a CSV file exceeding 10MB. 2. POST `/api/v1/child-boxes/bulk-upload` with `Content-Type: multipart/form-data` and the oversized file. | HTTP 413 (Payload Too Large) or HTTP 400; error message about file size; no rows inserted. | API | Express body limit is `10mb` (`app.ts` line 40); multer may have its own limit. |
| TC-EDGE-038 | Admin | Child box CSV upload with non-CSV MIME type — rejected | P0 | 1. Upload a `.txt` file or image file renamed to `.csv`. Set `Content-Type: text/plain` or `image/png`. 2. POST `/api/v1/child-boxes/bulk-upload`. | HTTP 400; error referencing invalid file type; no rows inserted. | API | |
| TC-EDGE-039 | Admin | Child box CSV upload with 1001 rows — rejected (Phase 8 cap = 1000 rows) | P0 | 1. Generate a valid CSV with 1001 data rows (each row = 1 box). 2. POST to bulk-upload. | HTTP 400; error referencing row limit (1000 max rows per upload); no rows inserted. | API | Phase 08 scope notes state 1000-row cap. |
| TC-EDGE-040 | Admin | Child box CSV upload — cumulative count > 5000 — rejected | P0 | 1. Already have 4999 GENERATED boxes for a product. 2. Upload a CSV with 2 rows for the same product (would push total to 5001). | HTTP 400; error referencing 5000-box cumulative limit; no new boxes created. | API | Phase 08 scope notes. |
| TC-EDGE-041 | Admin | Product image upload > 5MB — rejected | P0 | 1. Create a JPEG file > 5MB. 2. POST `/api/v1/products/<id>/image` with the file. | HTTP 400 or HTTP 413; error about file size; no image stored. | API | |
| TC-EDGE-042 | Admin | Product image upload non-JPEG/PNG (e.g. GIF) — rejected | P0 | 1. Upload a `.gif` image file. 2. POST `/api/v1/products/<id>/image`. | HTTP 400; error referencing invalid image format; no file stored. | API | |
| TC-EDGE-043 | Admin | Product image upload non-JPEG/PNG (e.g. PDF) — rejected | P0 | 1. Upload a `.pdf` file disguised as an image. 2. POST `/api/v1/products/<id>/image`. | HTTP 400; error about MIME type; no file stored. | API | |
| TC-EDGE-044 | Admin | Child box CSV upload — empty CSV (header only, no data rows) | P1 | 1. Upload a CSV with only the header row. | HTTP 400 with message "CSV has no data rows" OR HTTP 200 with `{ created: 0, errors: [] }`; no 500. | API | |
| TC-EDGE-045 | Admin | Child box CSV upload — CSV with missing required column | P1 | 1. Upload a CSV missing the required `barcode` (or `sku`) column header. | HTTP 400; error identifying the missing column; no rows processed. | API | |

---

## §20.5 — Authentication and token edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-046 | Any | Request with no Authorization header — 401 | P0 | 1. `GET /api/v1/products` with no `Authorization` header. | HTTP 401; `{"error": "No token provided"}` or similar; no data returned. | API | |
| TC-EDGE-047 | Any | Request with malformed token (not a JWT) — 401 | P0 | 1. `GET /api/v1/products` with header `Authorization: Bearer not.a.valid.jwt`. | HTTP 401; JWT verification error message; no data returned. | API | |
| TC-EDGE-048 | Any | Request with expired JWT token — 401 | P1 | 1. Wait for a token to expire (or craft a token with `exp` in the past). 2. Use the expired token on any authenticated endpoint. | HTTP 401; error indicating token expired; frontend should redirect to login page. | API + E2E | |
| TC-EDGE-049 | Any | Request with valid token but wrong signature — 401 | P1 | 1. Tamper with the JWT payload (e.g. change `role` to `Admin`) while keeping old signature. 2. Use tampered token. | HTTP 401; signature verification fails; error message. | API | |
| TC-EDGE-050 | Any | Token with role=Admin but user has been deactivated mid-session | P1 | 1. Admin creates user B. User B logs in (gets token). 2. Admin deactivates user B. 3. User B uses their existing token on `/api/v1/products`. | HTTP 401 or HTTP 403; response indicates account is deactivated; user B cannot access data with old token. | Integration | Depends on whether middleware checks `is_active` per request. |
| TC-EDGE-051 | Any | Frontend session: admin logs out then another role logs in — no stale cache | P1 | 1. Login as Admin. Navigate to `/reports`. 2. Logout. 3. Login as Warehouse Operator. 4. Try to navigate to `/reports`. | Reports page inaccessible to Warehouse Operator; page shows 403 or redirects. No stale Admin data visible from previous session. | E2E | |
| TC-EDGE-052 | Any | Authorization header with lowercase "bearer" prefix | P1 | 1. `GET /api/v1/products` with header `authorization: bearer <valid_token>` (lowercase). | HTTP 200; token accepted (middleware should be case-insensitive on "Bearer" prefix) OR HTTP 401; consistent and documented behaviour. | API | |
| TC-EDGE-053 | Any | Two simultaneous login requests for the same user — both succeed | P2 | 1. POST `/api/v1/auth/login` twice simultaneously with the same credentials. | Both return HTTP 200 with valid JWT tokens. Both tokens are valid for API calls. The second login does NOT revoke the first (stateless JWT). | API | Confirm no token blacklist is implemented — if it is, second login revokes first. |

---

## §20.6 — State machine edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-054 | Dispatch Operator | Dispatch an already-DISPATCHED master carton — blocked | P0 | 1. Dispatch a master carton. 2. Attempt to dispatch the same carton again via `POST /api/v1/dispatches`. | HTTP 409 or HTTP 400; error message "Carton already dispatched" or "Cannot dispatch a DISPATCHED carton"; no duplicate dispatch record created. | API | |
| TC-EDGE-055 | Supervisor | Close an already-CLOSED master carton — blocked or idempotent | P0 | 1. Close a master carton (status = CLOSED). 2. `POST /api/v1/master-cartons/<id>/close` again. | HTTP 409 or HTTP 400 with message "Carton is already closed" OR HTTP 200 (idempotent no-op); no 500; no state corruption. | API | |
| TC-EDGE-056 | Supervisor | Close an already-CLOSED sample record — blocked or idempotent | P0 | 1. Close a sample record. 2. Call close again. | HTTP 409 or HTTP 400 with "Sample already closed" OR HTTP 200 (no-op); no 500. | API | |
| TC-EDGE-057 | Warehouse Operator | Add a DISPATCHED child box to a master carton — blocked | P0 | 1. Dispatch a carton (child boxes become DISPATCHED). 2. Attempt `POST /api/v1/master-cartons/<new_carton_id>/add-box` with a DISPATCHED box barcode. | HTTP 400 or HTTP 409; error indicating "Cannot pack a DISPATCHED child box"; new carton unchanged. | API | |
| TC-EDGE-058 | Warehouse Operator | Add a DISPATCHED child box to a sample record — blocked | P0 | 1. Get a DISPATCHED child box barcode. 2. `POST /api/v1/samples/<id>/add-box` with it. | HTTP 400; DISPATCHED box cannot be added to sample. | API | |
| TC-EDGE-059 | Warehouse Operator | Unpack a DISPATCHED child box — blocked | P0 | 1. Get a DISPATCHED child box. 2. Attempt to remove it from its carton via remove-box endpoint. | HTTP 400; error "Cannot unpack a dispatched child box". | API | |
| TC-EDGE-060 | Admin | Delete a section referenced by products — blocked | P0 | 1. Create a section. 2. Create a product in that section. 3. `DELETE /api/v1/sections/<id>`. | HTTP 409 or HTTP 400; "Cannot delete section with existing products"; section and product unchanged. | API | |
| TC-EDGE-061 | Admin | Delete a customer referenced by a sample_record — blocked | P0 | 1. Create a customer. 2. Create a sample with that customer. 3. `DELETE /api/v1/customers/<id>`. | HTTP 409 or HTTP 400; deletion blocked; customer record intact. | API | Phase 19 cross-module integrity scope. |
| TC-EDGE-062 | Admin | Dispatch sample record that is still ACTIVE (not CLOSED) — check if allowed | P1 | 1. Create a sample with boxes added (ACTIVE status). 2. Attempt to dispatch it. | If system requires CLOSED before dispatch: HTTP 400 with "Sample must be CLOSED before dispatch". If system allows ACTIVE dispatch: HTTP 201 succeeds. Document actual behaviour. | API | Verify against dispatch.service.ts logic. |
| TC-EDGE-063 | Admin | Dispatch ecommerce record that is still ACTIVE — check if allowed | P1 | 1. Create an ecommerce record with boxes (ACTIVE). 2. Attempt to dispatch it. | Same as TC-EDGE-062 — document actual behaviour. | API | |
| TC-EDGE-064 | Warehouse Operator | Full-unpack a DISPATCHED carton — blocked | P0 | 1. Dispatch a carton. 2. `POST /api/v1/master-cartons/<id>/full-unpack`. | HTTP 400; "Cannot unpack a dispatched carton". | API | |
| TC-EDGE-065 | Admin | Create dispatch record referencing both master_carton_id and sample_record_id — CHECK constraint fires | P0 | 1. Attempt to create a dispatch with both `master_carton_id` and `sample_record_id` set (via a raw API call that bypasses controller validation). | HTTP 400 or HTTP 409; `chk_dispatch_source_exactly_one` constraint violation message; no record inserted. | Integration | |

---

## §20.7 — Concurrent operations and race conditions

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-066 | Warehouse Operator | Two simultaneous add-box requests for the same box to different cartons | P0 | 1. Get FREE box `B1`. Create cartons `MC1` and `MC2`. 2. Fire two simultaneous HTTP requests: `POST /api/v1/master-cartons/MC1/add-box {barcode:B1}` and `POST /api/v1/master-cartons/MC2/add-box {barcode:B1}`. | Exactly one request returns HTTP 200; the other returns HTTP 400/409. Box `B1` ends up in exactly one carton. No duplicate `carton_child_mapping` rows. DB `SELECT COUNT(*) FROM carton_child_mapping WHERE child_box_id='B1' AND is_active=true` = 1. | Integration | Use two concurrent cURL processes or `Promise.all` in a test script. |
| TC-EDGE-067 | Admin | Bulk CSV upload while concurrent single-create for same product | P1 | 1. Start a CSV upload for product P1 (say 50 rows). 2. Simultaneously, POST a single child box create for product P1. | Both operations complete without 500 errors. All created boxes have unique barcodes. No duplicate barcode in DB. | Integration | |
| TC-EDGE-068 | Admin | Simultaneous dispatch of the same carton from two sessions | P0 | 1. Get a CLOSED carton. 2. Fire two simultaneous `POST /api/v1/dispatches` requests referencing the same carton. | Exactly one dispatch record is created; the second request returns HTTP 409. No duplicate dispatch_records row for the same carton. | Integration | |

---

## §20.8 — Network and infrastructure edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-069 | Any | Health check available without authentication | P0 | 1. `GET /api/v1/health` with no Authorization header. | HTTP 200; `{"status":"ok","timestamp":"..."}`. | API | |
| TC-EDGE-070 | Any | Non-existent endpoint returns 404 | P0 | 1. `GET /api/v1/nonexistent-endpoint`. | HTTP 404; JSON error body `{"error":"Not Found"}` or similar; no HTML error page. | API | `notFoundHandler` middleware. |
| TC-EDGE-071 | Admin | Very long URL path does not 500 | P1 | 1. `GET /api/v1/products/${"A".repeat(2000)}` (2000-char URL segment). | HTTP 400 or HTTP 414 (URI Too Long); no 500. | API | |
| TC-EDGE-072 | Admin | Extremely large JSON body (deeply nested) does not 500 | P1 | 1. POST `/api/v1/products` with a valid structure but with an additional field containing 10MB of nested JSON. | HTTP 413 (Express `10mb` limit) or HTTP 400; no OOM crash; no 500. | API | `express.json({ limit: '10mb' })` in `app.ts`. |
| TC-EDGE-073 | Admin | CORS: cross-origin request from disallowed origin is blocked | P1 | 1. Make a request to the API from an origin not in `CORS_ORIGIN` env var (e.g. `Origin: http://attacker.com`). | Response does NOT include `Access-Control-Allow-Origin: http://attacker.com`; browser-side request is blocked by CORS policy. | Manual | Requires configuring a test origin. |

---

## §20.9 — Performance smoke tests

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-074 | Admin | 10,000 child boxes — list endpoint responds in under 2 seconds | P1 | 1. Ensure 10,000 child boxes exist in DB (seeded or bulk-created). 2. Time `GET /api/v1/child-boxes?page=1&limit=25`. | Response time < 2000ms. HTTP 200. `total` = 10000. | Manual | Use `curl -w "%{time_total}"` or Postman timing. |
| TC-EDGE-075 | Admin | Paginated products list with 50 sections × 100 articles — page 1 in < 1s | P1 | 1. Seed 5000 products (50 sections, 100 articles each). 2. `GET /api/v1/products?page=1&limit=25`. | Response time < 1000ms. HTTP 200. `total >= 5000`. | Manual | |
| TC-EDGE-076 | Admin | Dashboard loads with 100k inventory_transactions rows | P1 | 1. Ensure `inventory_transactions` has 100,000+ rows. 2. `GET /api/v1/inventory/dashboard`. | HTTP 200; response time < 3000ms; `recentTransactions` returns only the latest 20 rows (limited by service code `LIMIT 20`). | Manual | `inventory.service.ts` line 83: `LIMIT 20`. |
| TC-EDGE-077 | Admin | Stock hierarchy drilldown — 50 sections responsive | P1 | 1. Seed stock with 50 sections. 2. `GET /api/v1/inventory/stock/hierarchy?level=section`. | HTTP 200; response time < 2000ms; all 50 sections present. | Manual | |
| TC-EDGE-078 | Admin | Frontend /reports page loads with 5000+ products in Stock Report tab | P2 | 1. Seed 5000+ active products. 2. Navigate to `/reports` → "Stock Report" tab. 3. Measure time-to-first-paint and time until table is interactive. | Table renders without browser freeze. Time to table interactive < 5s. Virtual scroll or pagination prevents rendering all rows at once. | E2E | |

---

## §20.10 — Input sanitisation and security edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-079 | Any | SQL injection via login email field | P0 | 1. POST `/api/v1/auth/login` with `{"email": "' OR 1=1 --", "password": "anything"}`. | HTTP 401; no 500; server continues to function normally; no DB data leaked. | API | Parameterised queries prevent injection. |
| TC-EDGE-080 | Admin | XSS: article_name stored with script tag rendered as literal text in browser | P0 | 1. POST product with `article_name: "<script>alert(1)</script>"`. 2. Navigate to `/products` in browser. | Product list renders the literal string `<script>alert(1)</script>` — no alert dialog fires. React escapes JSX by default. | API + E2E | |
| TC-EDGE-081 | Admin | NoSQL injection attempt via JSON body field | P1 | 1. POST `/api/v1/auth/login` with `{"email": {"$gt": ""}, "password": {"$gt": ""}}`. | HTTP 400 or HTTP 401; server does not authenticate; no 500; Postgres does not process MongoDB-style operators. | API | |
| TC-EDGE-082 | Admin | Search parameter with `%` wildcard — no excessive result leak | P1 | 1. `GET /api/v1/products?search=%`. | HTTP 200; returns paginated results (may match all products, or none, depending on implementation); no 500; response is bounded by `limit`. | API | |
| TC-EDGE-083 | Admin | Prototype pollution attempt — extra `__proto__` field in body | P1 | 1. POST `/api/v1/products` with `{"__proto__": {"admin": true}, "isAdmin": true, ...valid fields}`. | HTTP 201 (product created ignoring unknown fields) or HTTP 400; `Object.prototype.admin` is NOT set on server; no prototype pollution. | API | Express uses `JSON.parse` which does not pollute prototype when using safe serialisation. |
| TC-EDGE-084 | Admin | Path traversal attempt in file upload filename | P1 | 1. Upload a product image with filename `../../etc/passwd.png`. | HTTP 200 or HTTP 400; file stored safely (multer generates a new UUID filename); original filename discarded; no `../../` traversal. | API | |

---

## §20.11 — Role swap and session management

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-EDGE-085 | Admin | Admin role changed to Warehouse Operator mid-session | P1 | 1. Login as user X (Admin). Obtain token. 2. A second Admin changes user X's role to Warehouse Operator. 3. User X uses their existing Admin token on `GET /api/v1/reports/samples`. | If the backend re-reads the user's role on every request: HTTP 403 (role is now Warehouse Operator). If role is baked into JWT and not re-checked: HTTP 200 (stale token still works until expiry). Document actual behaviour. | Integration | |
| TC-EDGE-086 | Any | Two simultaneous logins as same user — both tokens valid | P2 | 1. Login as Admin from browser A → get `token_A`. 2. Login as Admin from browser B → get `token_B`. 3. Use `token_A` and `token_B` to access protected endpoints simultaneously. | Both tokens are accepted (stateless JWT). No token revocation occurs for `token_A` when `token_B` is issued. | API | |
