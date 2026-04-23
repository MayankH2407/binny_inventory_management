# Binny Inventory Management System — Test Cases v2 (Phases 1–3)

**Project:** Binny Footwear — Mahavir Polymers Inventory Management System  
**Built by:** Basiq360  
**Date:** 2026-04-16  
**Backend API Base:** `/api/v1`  
**Frontend URL:** `http://localhost:3000`  
**Roles:** Admin, Supervisor, Warehouse Operator, Dispatch Operator

---

## Table of Contents

- [Phase 1: Authentication & Authorization](#phase-1-authentication--authorization)
  - [Section 32: Role-Based Authentication](#section-32-role-based-authentication)
  - [Section 33: Role-Based Access Control — API Endpoint Denial](#section-33-role-based-access-control--api-endpoint-denial)
- [Phase 2: Product & Section Management](#phase-2-product--section-management)
  - [Section 34: Product CRUD — Per Role](#section-34-product-crud--per-role)
  - [Section 35: Section CRUD — Per Role](#section-35-section-crud--per-role)
- [Phase 3: Customer Management](#phase-3-customer-management)
  - [Section 36: Customer CRUD — Per Role](#section-36-customer-crud--per-role)

---

## Phase 1: Authentication & Authorization

### Section 32: Role-Based Authentication

#### 32.1 — Login Per Role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-RBAC-001 | Admin | Admin login with valid credentials | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"admin@binny.com","password":"Admin@123"}` 2. Check response status 3. Check response body for `token` and `user.role` | HTTP 200; response contains `token` (non-empty JWT string); `user.role === "Admin"`; `user.email === "admin@binny.com"` | API |
| TC-RBAC-002 | Supervisor | Supervisor login with valid credentials | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"supervisor@binny.com","password":"Sup@123"}` 2. Check response status 3. Verify `user.role` in response | HTTP 200; response contains valid `token`; `user.role === "Supervisor"` | API |
| TC-RBAC-003 | Warehouse Operator | Warehouse Operator login with valid credentials | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"warehouse@binny.com","password":"Wh@123"}` 2. Check response status 3. Verify `user.role` | HTTP 200; response contains valid `token`; `user.role === "Warehouse Operator"` | API |
| TC-RBAC-004 | Dispatch Operator | Dispatch Operator login with valid credentials | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"dispatch@binny.com","password":"Dp@123"}` 2. Check response status 3. Verify `user.role` | HTTP 200; response contains valid `token`; `user.role === "Dispatch Operator"` | API |

#### 32.2 — Login Failures

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-RBAC-005 | Any | Invalid email returns 401 | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"nonexistent@binny.com","password":"Test@123"}` 2. Check response status and body | HTTP 401; response body contains `message` indicating invalid credentials; no `token` field in response | API |
| TC-RBAC-006 | Any | Wrong password returns 401 | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"admin@binny.com","password":"WrongPassword"}` 2. Check response status | HTTP 401; response body contains error message (e.g., `"Invalid credentials"`); no `token` returned | API |
| TC-RBAC-007 | Any | Empty email field returns 400 validation error | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"","password":"Admin@123"}` 2. Check response status and validation errors | HTTP 400; response body contains validation error referencing `email` field; no `token` returned | API |
| TC-RBAC-008 | Any | Empty password field returns 400 validation error | P0 | 1. POST `/api/v1/auth/login` with body `{"email":"admin@binny.com","password":""}` 2. Check response status | HTTP 400; response body contains validation error referencing `password` field; no `token` returned | API |
| TC-RBAC-009 | Any | Inactive/disabled user login returns 401 or 403 | P1 | 1. Ensure a user account exists with `is_active=false` 2. POST `/api/v1/auth/login` with that user's valid credentials 3. Check response status | HTTP 401 or 403; response body indicates account is inactive or access denied; no `token` returned | API |
| TC-RBAC-010 | Any | SQL injection in email field does not cause server error | P1 | 1. POST `/api/v1/auth/login` with body `{"email":"admin@binny.com' OR '1'='1","password":"anything"}` 2. Check response status and body | HTTP 400 or 401; no 500 server error; no SQL data leaked in response; server handles input safely | API |

#### 32.3 — Token & Session Management

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-RBAC-011 | Any | Expired JWT token returns 401 | P0 | 1. Craft or obtain a JWT token that is already expired (past `exp` claim) 2. GET `/api/v1/auth/profile` with header `Authorization: Bearer <expired_token>` 3. Check response status | HTTP 401; response body contains message such as `"Token expired"` or `"Unauthorized"` | API |
| TC-RBAC-012 | Any | Malformed JWT token returns 401 | P0 | 1. GET `/api/v1/auth/profile` with header `Authorization: Bearer notavalidtoken.abc.xyz` 2. Check response status and body | HTTP 401; response body contains error message; server does not crash (no 500) | API |
| TC-RBAC-013 | Any | Missing Authorization header returns 401 | P0 | 1. GET `/api/v1/auth/profile` with NO `Authorization` header 2. Check response status | HTTP 401; response body indicates missing or invalid authentication | API |
| TC-RBAC-014 | Any | Token persists in storage after login | P1 | 1. POST `/api/v1/auth/login` with valid Admin credentials 2. In browser: open DevTools → Application → localStorage 3. Check for stored auth token key | Auth token is stored in `localStorage` (web) or `SecureStore` (mobile) after successful login; token value matches the one returned by login API | Integration |
| TC-RBAC-015 | Any | Logout clears auth token from storage | P0 | 1. Login as Admin and verify token is stored 2. POST `/api/v1/auth/logout` with valid `Authorization: Bearer <token>` header 3. Check localStorage/SecureStore for token 4. GET `/api/v1/auth/profile` using the old token | HTTP 200 on logout; token is removed from client storage; subsequent requests using the old token return HTTP 401 | Integration |
| TC-RBAC-016 | Admin | Change password with correct old password succeeds | P1 | 1. POST `/api/v1/auth/change-password` with header `Authorization: Bearer <admin_token>` and body `{"oldPassword":"Admin@123","newPassword":"NewAdmin@456"}` 2. Check response 3. Attempt login with new password | HTTP 200; login with new password succeeds (returns valid token); login with old password fails with 401 | API |
| TC-RBAC-017 | Admin | Change password with wrong old password returns 400 | P1 | 1. POST `/api/v1/auth/change-password` with header `Authorization: Bearer <admin_token>` and body `{"oldPassword":"WrongOldPass","newPassword":"NewAdmin@456"}` 2. Check response | HTTP 400; response body contains error message such as `"Current password is incorrect"`; password is NOT changed | API |
| TC-RBAC-018 | Any | Profile endpoint returns current authenticated user data | P0 | 1. Login as Supervisor to obtain `token` 2. GET `/api/v1/auth/profile` with header `Authorization: Bearer <token>` 3. Inspect response body fields | HTTP 200; response contains `id`, `name`, `email`, `role` matching the logged-in Supervisor; no other users' data included | API |

#### 32.4 — Playwright E2E: Login & Navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-RBAC-E2E-001 | Any | Login page renders all required elements | P0 | 1. Navigate to `http://localhost:3000/login` 2. Inspect DOM for input fields and button | Page renders with: email input (`[name="email"]`), password input (`[name="password"]`), "Sign In" button; no console errors | E2E |
| TC-RBAC-E2E-002 | Admin | Admin login redirects to dashboard | P0 | 1. Navigate to `http://localhost:3000/login` 2. Enter valid Admin email and password 3. Click "Sign In" 4. Wait for navigation | Browser URL changes to `http://localhost:3000/dashboard`; dashboard heading or welcome text visible; no error toast | E2E |
| TC-RBAC-E2E-003 | Supervisor | Supervisor login shows permitted nav items | P1 | 1. Login as Supervisor at `http://localhost:3000/login` 2. Check sidebar/navigation after redirect | Dashboard visible; nav includes Products, Child Boxes, Master Cartons, Customers, Reports; nav may exclude Users Management or Admin-only items | E2E |
| TC-RBAC-E2E-004 | Warehouse Operator | Warehouse Operator sees only permitted nav items | P1 | 1. Login as Warehouse Operator 2. Check sidebar/navigation after redirect to dashboard | Dashboard visible; nav does NOT include Products management write actions, Customers (write), Reports; only permitted links (Child Boxes scanning, Master Carton packing) are visible | E2E |
| TC-RBAC-E2E-005 | Dispatch Operator | Dispatch Operator sees only permitted nav items | P1 | 1. Login as Dispatch Operator 2. Check sidebar/navigation after redirect to dashboard | Dashboard visible; nav includes Dispatch module; does NOT show Products (write), Sections (write), Reports; only dispatch-relevant nav items visible | E2E |
| TC-RBAC-E2E-006 | Any | Unauthenticated access to /dashboard redirects to /login | P0 | 1. Ensure no auth token is stored (clear localStorage) 2. Navigate directly to `http://localhost:3000/dashboard` 3. Observe browser URL | Browser redirects to `http://localhost:3000/login`; dashboard content is NOT rendered; no auth data exposed | E2E |

---

### Section 33: Role-Based Access Control — API Endpoint Denial

#### 33.1 — User Management (Admin only for write operations)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-001 | Supervisor | Supervisor cannot POST /users | P0 | 1. Login as Supervisor, obtain token 2. POST `/api/v1/users` with header `Authorization: Bearer <supervisor_token>` and body `{"name":"New User","email":"new@binny.com","role":"Warehouse Operator","password":"Test@123"}` 3. Check status | HTTP 403; response body contains `"Forbidden"` or `"Access denied"`; no user is created in DB | API |
| TC-DENY-002 | Warehouse Operator | Warehouse Operator cannot POST /users | P0 | 1. Login as Warehouse Operator, obtain token 2. POST `/api/v1/users` with header `Authorization: Bearer <warehouse_token>` and same valid body as above 3. Check status | HTTP 403; response body contains `"Forbidden"` or `"Access denied"`; no user created | API |
| TC-DENY-003 | Dispatch Operator | Dispatch Operator cannot POST /users | P0 | 1. Login as Dispatch Operator, obtain token 2. POST `/api/v1/users` with header `Authorization: Bearer <dispatch_token>` and valid body 3. Check status | HTTP 403; response body contains `"Forbidden"` or `"Access denied"`; no user created | API |
| TC-DENY-004 | Warehouse Operator | Warehouse Operator cannot GET /users list | P1 | 1. Login as Warehouse Operator, obtain token 2. GET `/api/v1/users` with header `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; no user list returned | API |
| TC-DENY-005 | Dispatch Operator | Dispatch Operator cannot GET /users list | P1 | 1. Login as Dispatch Operator, obtain token 2. GET `/api/v1/users` with header `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; no user list returned | API |
| TC-DENY-006 | Supervisor | Supervisor cannot DELETE /users/:id | P0 | 1. Login as Supervisor 2. Obtain a valid user ID from DB 3. DELETE `/api/v1/users/<user_id>` with `Authorization: Bearer <supervisor_token>` 4. Check status | HTTP 403; user is NOT deleted; response contains `"Forbidden"` | API |
| TC-DENY-007 | Warehouse Operator | Warehouse Operator cannot PUT /users/:id | P0 | 1. Login as Warehouse Operator 2. PUT `/api/v1/users/<valid_user_id>` with `Authorization: Bearer <warehouse_token>` and body `{"name":"Hacked Name"}` 3. Check status | HTTP 403; user record is unchanged in DB | API |

#### 33.2 — Product Management (Admin+Supervisor for write, Admin only for delete)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-008 | Warehouse Operator | Warehouse Operator cannot POST /products | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/products` with `Authorization: Bearer <warehouse_token>` and body `{"article_name":"Test Shoe","article_code":"ART001","colour":"Red","size":"6","mrp":299,"category":"Gents","section_id":"<valid_section_id>"}` 3. Check status | HTTP 403; no product created | API |
| TC-DENY-009 | Dispatch Operator | Dispatch Operator cannot POST /products | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/products` with `Authorization: Bearer <dispatch_token>` and valid product body 3. Check status | HTTP 403; no product created | API |
| TC-DENY-010 | Warehouse Operator | Warehouse Operator cannot PUT /products/:id | P0 | 1. Login as Warehouse Operator 2. PUT `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <warehouse_token>` and body `{"mrp":999}` 3. Check status | HTTP 403; product record unchanged | API |
| TC-DENY-011 | Dispatch Operator | Dispatch Operator cannot PUT /products/:id | P0 | 1. Login as Dispatch Operator 2. PUT `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <dispatch_token>` and body `{"mrp":999}` 3. Check status | HTTP 403; product record unchanged | API |
| TC-DENY-012 | Supervisor | Supervisor cannot DELETE /products/:id | P0 | 1. Login as Supervisor 2. DELETE `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <supervisor_token>` 3. Check status | HTTP 403; product is NOT deleted (soft or hard); response contains `"Forbidden"` | API |
| TC-DENY-013 | Warehouse Operator | Warehouse Operator cannot DELETE /products/:id | P0 | 1. Login as Warehouse Operator 2. DELETE `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; product is NOT deleted | API |
| TC-DENY-014 | Dispatch Operator | Dispatch Operator cannot POST /products/bulk-upload | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/products/bulk-upload` (multipart/form-data with valid CSV file) with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; no products imported; response contains `"Forbidden"` | API |
| TC-DENY-015 | Warehouse Operator | Warehouse Operator cannot POST /products/:id/image | P1 | 1. Login as Warehouse Operator 2. POST `/api/v1/products/<valid_product_id>/image` (multipart/form-data with valid JPEG) with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; image is NOT uploaded; product `image_url` unchanged | API |

#### 33.3 — Section Management (Admin only for write)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-016 | Supervisor | Supervisor cannot POST /sections | P0 | 1. Login as Supervisor 2. POST `/api/v1/sections` with `Authorization: Bearer <supervisor_token>` and body `{"name":"New Section"}` 3. Check status | HTTP 403; no section created; response contains `"Forbidden"` | API |
| TC-DENY-017 | Warehouse Operator | Warehouse Operator cannot POST /sections | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/sections` with `Authorization: Bearer <warehouse_token>` and body `{"name":"New Section"}` 3. Check status | HTTP 403; no section created | API |
| TC-DENY-018 | Supervisor | Supervisor cannot PUT /sections/:id | P0 | 1. Login as Supervisor 2. PUT `/api/v1/sections/<valid_section_id>` with `Authorization: Bearer <supervisor_token>` and body `{"name":"Updated Name"}` 3. Check status | HTTP 403; section record unchanged | API |
| TC-DENY-019 | Supervisor | Supervisor cannot DELETE /sections/:id | P0 | 1. Login as Supervisor 2. DELETE `/api/v1/sections/<valid_section_id>` with `Authorization: Bearer <supervisor_token>` 3. Check status | HTTP 403; section is NOT deleted; response contains `"Forbidden"` | API |

#### 33.4 — Child Box (Dispatch Operator denied write)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-020 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/child-boxes` with `Authorization: Bearer <dispatch_token>` and body `{"product_id":"<id>","quantity":12,"size":"6"}` 3. Check status | HTTP 403; no child box created; response contains `"Forbidden"` | API |
| TC-DENY-021 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes/bulk | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/child-boxes/bulk` with `Authorization: Bearer <dispatch_token>` and valid bulk body 3. Check status | HTTP 403; no child boxes created | API |
| TC-DENY-022 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes/bulk-multi-size | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/child-boxes/bulk-multi-size` with `Authorization: Bearer <dispatch_token>` and valid body 3. Check status | HTTP 403; no child boxes created; response contains `"Forbidden"` | API |

#### 33.5 — Master Carton (Dispatch Operator denied, Warehouse Operator denied close)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-023 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/master-cartons` with `Authorization: Bearer <dispatch_token>` and body `{"section_id":"<id>"}` 3. Check status | HTTP 403; no master carton created | API |
| TC-DENY-024 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/pack | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/master-cartons/pack` with `Authorization: Bearer <dispatch_token>` and body `{"master_carton_id":"<id>","child_box_ids":["<id>"]}` 3. Check status | HTTP 403; no packing performed | API |
| TC-DENY-025 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/:id/full-unpack | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/master-cartons/<valid_id>/full-unpack` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; master carton remains packed/unchanged | API |
| TC-DENY-026 | Warehouse Operator | Warehouse Operator cannot POST /master-cartons/:id/close | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/master-cartons/<valid_open_carton_id>/close` with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; master carton status remains unchanged (not closed) | API |
| TC-DENY-027 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/:id/close | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/master-cartons/<valid_open_carton_id>/close` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; master carton status remains unchanged | API |

#### 33.6 — Dispatch (Warehouse Operator denied)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-028 | Warehouse Operator | Warehouse Operator cannot POST /dispatches | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/dispatches` with `Authorization: Bearer <warehouse_token>` and body `{"customer_id":"<id>","master_carton_ids":["<id>"],"vehicle_number":"MH01AB1234","lr_number":"LR001","dispatch_date":"2026-04-16"}` 3. Check status | HTTP 403; no dispatch record created; response contains `"Forbidden"` | API |

#### 33.7 — Reports (Admin+Supervisor only)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-029 | Warehouse Operator | Warehouse Operator cannot GET /reports/inventory-summary | P1 | 1. Login as Warehouse Operator 2. GET `/api/v1/reports/inventory-summary` with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; no report data returned | API |
| TC-DENY-030 | Dispatch Operator | Dispatch Operator cannot GET /reports/inventory-summary | P1 | 1. Login as Dispatch Operator 2. GET `/api/v1/reports/inventory-summary` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; no report data returned | API |
| TC-DENY-031 | Warehouse Operator | Warehouse Operator cannot GET /reports/dispatch-summary | P1 | 1. Login as Warehouse Operator 2. GET `/api/v1/reports/dispatch-summary` with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; no dispatch summary data returned | API |
| TC-DENY-032 | Dispatch Operator | Dispatch Operator cannot GET /reports/product-wise | P1 | 1. Login as Dispatch Operator 2. GET `/api/v1/reports/product-wise` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; no product-wise report data returned | API |
| TC-DENY-033 | Warehouse Operator | Warehouse Operator cannot GET /reports/inventory-summary/export | P1 | 1. Login as Warehouse Operator 2. GET `/api/v1/reports/inventory-summary/export` with `Authorization: Bearer <warehouse_token>` 3. Check status | HTTP 403; no file/export returned | API |
| TC-DENY-034 | Dispatch Operator | Dispatch Operator cannot GET /reports/dispatch-summary/export | P1 | 1. Login as Dispatch Operator 2. GET `/api/v1/reports/dispatch-summary/export` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; no file/export returned | API |

#### 33.8 — Customer Management (Admin+Supervisor for write, Admin only for delete)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-DENY-035 | Warehouse Operator | Warehouse Operator cannot POST /customers | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/customers` with `Authorization: Bearer <warehouse_token>` and body `{"firm_name":"Test Firm","customer_type":"Primary Dealer","mobile":"9876543210"}` 3. Check status | HTTP 403; no customer created | API |
| TC-DENY-036 | Dispatch Operator | Dispatch Operator cannot POST /customers | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/customers` with `Authorization: Bearer <dispatch_token>` and valid customer body 3. Check status | HTTP 403; no customer created | API |
| TC-DENY-037 | Warehouse Operator | Warehouse Operator cannot PUT /customers/:id | P0 | 1. Login as Warehouse Operator 2. PUT `/api/v1/customers/<valid_customer_id>` with `Authorization: Bearer <warehouse_token>` and body `{"firm_name":"Hacked Firm"}` 3. Check status | HTTP 403; customer record unchanged | API |
| TC-DENY-038 | Supervisor | Supervisor cannot DELETE /customers/:id | P0 | 1. Login as Supervisor 2. DELETE `/api/v1/customers/<valid_customer_id>` with `Authorization: Bearer <supervisor_token>` 3. Check status | HTTP 403; customer is NOT deleted; record still active in DB | API |
| TC-DENY-039 | Dispatch Operator | Dispatch Operator cannot DELETE /customers/:id | P0 | 1. Login as Dispatch Operator 2. DELETE `/api/v1/customers/<valid_customer_id>` with `Authorization: Bearer <dispatch_token>` 3. Check status | HTTP 403; customer is NOT deleted | API |

---

## Phase 2: Product & Section Management

### Section 34: Product CRUD — Per Role

#### 34.1 — Admin Product Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-PROD-ADM-001 | Admin | Admin creates product with all required fields | P0 | 1. Login as Admin 2. POST `/api/v1/products` with `Authorization: Bearer <admin_token>` and body `{"article_name":"Canvas Shoe","article_code":"CNV001","colour":"Blue","size":"7","mrp":499,"category":"Gents","section_id":"<valid_section_id>","location":"A-01"}` 3. Check response | HTTP 201; response body contains `id`, `sku` (auto-generated), `article_name`, `article_code`, `colour`, `size`, `mrp`, `category`, `section_id`; product appears in DB | API |
| TC-PROD-ADM-002 | Admin | Admin creates product — SKU auto-generated in correct format | P0 | 1. Login as Admin 2. POST `/api/v1/products` with valid body including `section_id` for section with code `SEC`, `article_code="ART002"`, `category="Ladies"`, `colour="Red"` 3. Note `sku` field in response 4. Verify format is `SECTION-ARTICLE-CATEGORY-SERIAL-COLOUR` | HTTP 201; `sku` in response matches pattern `<section_code>-<article_code>-<category_initial>-<serial>-<colour_code>` or as defined by business logic; SKU is unique | API |
| TC-PROD-ADM-003 | Admin | Admin updates product article_name, mrp, and category | P0 | 1. Login as Admin 2. Create a product and note its `id` 3. PUT `/api/v1/products/<product_id>` with `Authorization: Bearer <admin_token>` and body `{"article_name":"Updated Canvas","mrp":599,"category":"Ladies"}` 4. GET `/api/v1/products/<product_id>` | HTTP 200 on PUT; subsequent GET returns product with `article_name="Updated Canvas"`, `mrp=599`, `category="Ladies"`; `updated_at` timestamp updated | API |
| TC-PROD-ADM-004 | Admin | Admin soft deletes product | P0 | 1. Login as Admin 2. Create a product, note its `id` 3. DELETE `/api/v1/products/<product_id>` with `Authorization: Bearer <admin_token>` 4. GET `/api/v1/products/<product_id>` 5. GET `/api/v1/products` list | HTTP 200 on DELETE; response confirms deletion; GET by ID returns 404 or `is_deleted=true`; product absent from default list; record still present in DB with `deleted_at` timestamp | API |
| TC-PROD-ADM-005 | Admin | Admin uploads JPEG product image | P1 | 1. Login as Admin 2. Create a product, note its `id` 3. POST `/api/v1/products/<product_id>/image` with `Authorization: Bearer <admin_token>` as multipart/form-data with field `image` containing a valid JPEG file (< 5MB) 4. Check response | HTTP 200; response contains `image_url` (non-empty string/URL); product record in DB has updated `image_url` | API |
| TC-PROD-ADM-006 | Admin | Admin uploads PNG product image | P1 | 1. Login as Admin 2. Use existing product ID 3. POST `/api/v1/products/<product_id>/image` with `Authorization: Bearer <admin_token>` as multipart/form-data with field `image` containing a valid PNG file (< 5MB) 4. Check response | HTTP 200; response contains `image_url`; PNG accepted without error | API |
| TC-PROD-ADM-007 | Admin | Admin bulk uploads CSV with 2 valid rows | P1 | 1. Login as Admin 2. Prepare CSV with 2 rows of valid product data (correct headers: article_name, article_code, colour, size, mrp, category, section_id, location, size_from, size_to) 3. POST `/api/v1/products/bulk-upload` with `Authorization: Bearer <admin_token>` as multipart/form-data with field `file` 4. Check response | HTTP 201; response body contains `created: 2`; `errors: []` (empty); both products appear in DB with auto-generated SKUs | API |
| TC-PROD-ADM-008 | Admin | Admin bulk uploads CSV with invalid category row | P1 | 1. Login as Admin 2. Prepare CSV: row 1 is valid; row 2 has `category="Kids"` (invalid — not in Gents/Ladies/Boys/Girls) 3. POST `/api/v1/products/bulk-upload` with `Authorization: Bearer <admin_token>` 4. Check response | HTTP 200 or 207 (Partial); response body contains `created: 1`; `errors` array with at least 1 entry referencing row 2 and category validation failure; only 1 product created in DB | API |
| TC-PROD-ADM-009 | Admin | Admin downloads sample CSV with correct headers | P1 | 1. Login as Admin 2. GET `/api/v1/products/sample-csv` (or matching endpoint) with `Authorization: Bearer <admin_token>` 3. Download and parse file | HTTP 200; response `Content-Type` is `text/csv`; CSV headers include at minimum: `article_name`, `article_code`, `colour`, `size`, `mrp`, `category`, `location`, `size_from`, `size_to`; file is downloadable | API |
| TC-PROD-ADM-010 | Admin | Admin views product list filtered by section | P1 | 1. Login as Admin 2. Create products in two different sections 3. GET `/api/v1/products?section_id=<section_A_id>` with `Authorization: Bearer <admin_token>` 4. Check response | HTTP 200; response array contains only products belonging to `section_A`; products from other sections not included; pagination metadata present if applicable | API |

#### 34.2 — Supervisor Product Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-PROD-SUP-001 | Supervisor | Supervisor creates product successfully | P0 | 1. Login as Supervisor 2. POST `/api/v1/products` with `Authorization: Bearer <supervisor_token>` and body `{"article_name":"Ladies Sandal","article_code":"LS001","colour":"Pink","size":"5","mrp":349,"category":"Ladies","section_id":"<valid_id>"}` 3. Check response | HTTP 201; product created with auto-generated SKU; Supervisor-created product visible in list | API |
| TC-PROD-SUP-002 | Supervisor | Supervisor updates product successfully | P0 | 1. Login as Supervisor 2. PUT `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <supervisor_token>` and body `{"mrp":399,"location":"B-02"}` 3. Check response | HTTP 200; product `mrp` and `location` updated in DB | API |
| TC-PROD-SUP-003 | Supervisor | Supervisor cannot delete product | P0 | 1. Login as Supervisor 2. DELETE `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 403; product NOT deleted; response contains `"Forbidden"` | API |
| TC-PROD-SUP-004 | Supervisor | Supervisor uploads product image | P1 | 1. Login as Supervisor 2. POST `/api/v1/products/<valid_product_id>/image` with `Authorization: Bearer <supervisor_token>` as multipart/form-data with valid JPEG image 3. Check response | HTTP 200; `image_url` set on product; image accessible via URL | API |
| TC-PROD-SUP-005 | Supervisor | Supervisor bulk uploads CSV | P1 | 1. Login as Supervisor 2. POST `/api/v1/products/bulk-upload` with `Authorization: Bearer <supervisor_token>` and multipart CSV file with valid rows 3. Check response | HTTP 201; products created; `created` count matches valid rows in CSV | API |
| TC-PROD-SUP-006 | Supervisor | Supervisor views all products | P0 | 1. Login as Supervisor 2. GET `/api/v1/products` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 200; array of products returned; each product contains `id`, `sku`, `article_name`, `colour`, `size`, `mrp`, `category` | API |

#### 34.3 — Read-Only Roles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-PROD-WHO-001 | Warehouse Operator | Warehouse Operator can GET /products list | P0 | 1. Login as Warehouse Operator 2. GET `/api/v1/products` with `Authorization: Bearer <warehouse_token>` 3. Check response | HTTP 200; product list returned; read access permitted | API |
| TC-PROD-WHO-002 | Warehouse Operator | Warehouse Operator can GET /products/:id | P0 | 1. Login as Warehouse Operator 2. GET `/api/v1/products/<valid_product_id>` with `Authorization: Bearer <warehouse_token>` 3. Check response | HTTP 200; single product object returned with all non-sensitive fields | API |
| TC-PROD-DOP-001 | Dispatch Operator | Dispatch Operator can GET /products list | P0 | 1. Login as Dispatch Operator 2. GET `/api/v1/products` with `Authorization: Bearer <dispatch_token>` 3. Check response | HTTP 200; product list returned; read access permitted | API |
| TC-PROD-DOP-002 | Dispatch Operator | Dispatch Operator can GET /products/:id/colours | P1 | 1. Login as Dispatch Operator 2. GET `/api/v1/products/<valid_product_id>/colours` with `Authorization: Bearer <dispatch_token>` 3. Check response | HTTP 200; array of colour options for the product returned; read access permitted | API |

#### 34.4 — Product Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-PROD-VAL-001 | Admin | Create product missing article_name returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/products` with body `{"article_code":"ART999","colour":"Black","size":"8","mrp":299,"category":"Gents","section_id":"<id>"}` (no `article_name`) 3. Check response | HTTP 400; response body contains validation error referencing `article_name` as required; no product created | API |
| TC-PROD-VAL-002 | Admin | Create product missing article_code returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/products` with body `{"article_name":"Test Shoe","colour":"Black","size":"8","mrp":299,"category":"Gents","section_id":"<id>"}` (no `article_code`) 3. Check response | HTTP 400; response body contains validation error referencing `article_code` as required; no product created | API |
| TC-PROD-VAL-003 | Admin | Create product with article_code exceeding 20 chars returns 400 | P1 | 1. Login as Admin 2. POST `/api/v1/products` with body where `article_code` is a 21-character string (e.g., `"ABCDEFGHIJKLMNOPQRSTU"`) 3. Check response | HTTP 400; response body contains validation error for `article_code` max length; no product created | API |
| TC-PROD-VAL-004 | Admin | Create product with negative MRP returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/products` with body `{"article_name":"Shoe","article_code":"S01","colour":"Red","size":"7","mrp":-100,"category":"Gents","section_id":"<id>"}` 3. Check response | HTTP 400; response body contains validation error for `mrp` (must be positive); no product created | API |
| TC-PROD-VAL-005 | Admin | Create product with invalid category returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/products` with body where `category="Kids"` (not in allowed set: Gents, Ladies, Boys, Girls) 3. Check response | HTTP 400; response body contains validation error for `category` with message indicating allowed values (Gents, Ladies, Boys, Girls); no product created | API |
| TC-PROD-VAL-006 | Admin | Create product with duplicate article_code+colour+size combo returns conflict | P1 | 1. Login as Admin 2. Create a product with `article_code="DUP01"`, `colour="Red"`, `size="7"` 3. POST `/api/v1/products` again with identical `article_code`, `colour`, `size` 4. Check response | HTTP 409 or HTTP 400; response body contains error indicating duplicate combination; second product NOT created in DB | API |
| TC-PROD-VAL-007 | Admin | Upload non-image file as product image returns 400 | P1 | 1. Login as Admin 2. POST `/api/v1/products/<valid_product_id>/image` with multipart/form-data containing a `.pdf` or `.txt` file in the `image` field 3. Check response | HTTP 400; response body contains error indicating invalid file type; product `image_url` unchanged | API |
| TC-PROD-VAL-008 | Admin | Upload image larger than 5MB returns 400 | P1 | 1. Login as Admin 2. Prepare an image file > 5MB 3. POST `/api/v1/products/<valid_product_id>/image` with `Authorization: Bearer <admin_token>` and the oversized file 4. Check response | HTTP 400 or 413; response body contains error indicating file size limit exceeded; product `image_url` unchanged | API |

#### 34.5 — Playwright E2E: Product Management

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-PROD-E2E-001 | Admin | Admin — Products page loads with section tabs | P0 | 1. Login as Admin via UI 2. Navigate to `http://localhost:3000/products` 3. Check page for section tabs | Products page renders without error; section tabs are visible in the UI; active tab highlighted | E2E |
| TC-PROD-E2E-002 | Admin | Admin — "Add Product" button visible on Products page | P0 | 1. Login as Admin via UI 2. Navigate to `http://localhost:3000/products` 3. Look for "Add Product" button | "Add Product" button (or equivalent) is visible and clickable for Admin role | E2E |
| TC-PROD-E2E-003 | Admin | Admin — Create product modal has all required fields | P0 | 1. Login as Admin 2. Navigate to Products page 3. Click "Add Product" 4. Inspect modal fields | Modal opens and contains input fields for: `article_name`, `article_code`, `colour`, `size`, `mrp`, `category` (dropdown), `section` (dropdown), `location`, `size_from`, `size_to`; all fields visible | E2E |
| TC-PROD-E2E-004 | Admin | Admin — SKU field NOT visible in Create Product modal | P1 | 1. Login as Admin 2. Navigate to Products page 3. Click "Add Product" 4. Inspect modal for SKU field | SKU field is NOT present in the create modal; SKU is auto-generated by backend (should not be user-editable on creation) | E2E |
| TC-PROD-E2E-005 | Admin | Admin — Create product via UI appears in list | P0 | 1. Login as Admin 2. Navigate to Products page 3. Click "Add Product" 4. Fill all required fields 5. Click submit/save 6. Check product list | Success toast/notification appears; new product visible in product list with correct details; page does not crash | E2E |
| TC-PROD-E2E-006 | Admin | Admin — Edit product via UI reflects changes in list | P0 | 1. Login as Admin 2. Navigate to Products page 3. Click edit on an existing product 4. Update `mrp` field to a new value 5. Save 6. Verify list | Success notification shown; product in list shows updated `mrp`; changes persisted (reload and check) | E2E |
| TC-PROD-E2E-007 | Admin | Admin — Bulk Import button opens modal with sample download | P1 | 1. Login as Admin 2. Navigate to Products page 3. Click "Bulk Import" (or equivalent) 4. Inspect modal | Bulk import modal opens; sample CSV download link/button is visible and functional; file upload input present | E2E |
| TC-PROD-E2E-008 | Supervisor | Supervisor — Products page loads with "Add Product" visible | P0 | 1. Login as Supervisor 2. Navigate to `http://localhost:3000/products` 3. Check for "Add Product" button | Products page loads successfully for Supervisor; "Add Product" button IS visible (Supervisors have create permission) | E2E |
| TC-PROD-E2E-009 | Warehouse Operator | Warehouse Operator — Products page loads but "Add Product" NOT visible | P0 | 1. Login as Warehouse Operator 2. Navigate to `http://localhost:3000/products` 3. Check for "Add Product" button | Products page loads (read access); "Add Product" button is NOT visible or is disabled for Warehouse Operator role | E2E |
| TC-PROD-E2E-010 | Admin | Admin — Section tabs filter products correctly | P1 | 1. Login as Admin 2. Navigate to Products page 3. Click on a specific section tab (e.g., "Section A") 4. Check displayed products | Only products belonging to the selected section are shown; products from other sections are not displayed; tab filtering works without page reload | E2E |

---

### Section 35: Section CRUD — Per Role

#### 35.1 — Admin Section Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-SECT-ADM-001 | Admin | Admin creates section successfully | P0 | 1. Login as Admin 2. POST `/api/v1/sections` with `Authorization: Bearer <admin_token>` and body `{"name":"Gents Section","code":"GNT"}` 3. Check response | HTTP 201; response body contains `id`, `name`, `code`, `is_active=true`; section appears in GET /sections list | API |
| TC-SECT-ADM-002 | Admin | Admin creates section with duplicate name returns 409 | P1 | 1. Login as Admin 2. Create a section with `name="Gents Section"` 3. POST `/api/v1/sections` again with identical `name="Gents Section"` 4. Check response | HTTP 409; response body contains error indicating duplicate section name; second section NOT created in DB | API |
| TC-SECT-ADM-003 | Admin | Admin updates section name | P0 | 1. Login as Admin 2. Create a section, note its `id` 3. PUT `/api/v1/sections/<section_id>` with `Authorization: Bearer <admin_token>` and body `{"name":"Updated Gents Section"}` 4. GET `/api/v1/sections/<section_id>` | HTTP 200 on PUT; subsequent GET returns section with `name="Updated Gents Section"`; `updated_at` timestamp updated | API |
| TC-SECT-ADM-004 | Admin | Admin soft deletes section | P0 | 1. Login as Admin 2. Create a section, note its `id` 3. DELETE `/api/v1/sections/<section_id>` with `Authorization: Bearer <admin_token>` 4. GET `/api/v1/sections` (default) | HTTP 200 on DELETE; response confirms deletion; section absent from default GET /sections list; record in DB has `deleted_at` or `is_active=false` | API |
| TC-SECT-ADM-005 | Admin | Admin lists sections — deleted section excluded by default | P1 | 1. Login as Admin 2. Ensure there is at least one soft-deleted section 3. GET `/api/v1/sections` with `Authorization: Bearer <admin_token>` (no extra params) 4. Check response | HTTP 200; response array does NOT include deleted/inactive sections; only active sections returned | API |
| TC-SECT-ADM-006 | Admin | Admin lists sections with includeInactive=true — deleted section included | P1 | 1. Login as Admin 2. Ensure there is at least one soft-deleted section 3. GET `/api/v1/sections?includeInactive=true` with `Authorization: Bearer <admin_token>` 4. Check response | HTTP 200; response array INCLUDES the soft-deleted section alongside active ones; `is_active=false` or `deleted_at` present on inactive records | API |

#### 35.2 — Non-Admin Roles on Sections

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-SECT-SUP-001 | Supervisor | Supervisor can GET /sections list | P0 | 1. Login as Supervisor 2. GET `/api/v1/sections` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 200; active sections list returned; read access permitted for Supervisor | API |
| TC-SECT-SUP-002 | Supervisor | Supervisor cannot POST /sections | P0 | 1. Login as Supervisor 2. POST `/api/v1/sections` with `Authorization: Bearer <supervisor_token>` and body `{"name":"New Section","code":"NEW"}` 3. Check response | HTTP 403; no section created; response contains `"Forbidden"` | API |
| TC-SECT-WHO-001 | Warehouse Operator | Warehouse Operator can GET /sections list | P0 | 1. Login as Warehouse Operator 2. GET `/api/v1/sections` with `Authorization: Bearer <warehouse_token>` 3. Check response | HTTP 200; active sections list returned; read access permitted for Warehouse Operator | API |
| TC-SECT-DOP-001 | Dispatch Operator | Dispatch Operator can GET /sections list | P0 | 1. Login as Dispatch Operator 2. GET `/api/v1/sections` with `Authorization: Bearer <dispatch_token>` 3. Check response | HTTP 200; active sections list returned; read access permitted for Dispatch Operator | API |

---

## Phase 3: Customer Management

### Section 36: Customer CRUD — Per Role

#### 36.1 — Admin Customer Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CUST-ADM-001 | Admin | Admin creates Primary Dealer | P0 | 1. Login as Admin 2. POST `/api/v1/customers` with `Authorization: Bearer <admin_token>` and body `{"firm_name":"ABC Traders","customer_type":"Primary Dealer","mobile":"9876543210","address":"Mumbai","gstin":"27AAPFU0939F1ZV"}` 3. Check response | HTTP 201; response body contains `id`, `firm_name`, `customer_type="Primary Dealer"`, `mobile`, `address`; record in DB with `is_active=true` | API |
| TC-CUST-ADM-002 | Admin | Admin creates Sub Dealer with primary_dealer_id — auto-fills fields | P0 | 1. Login as Admin 2. Ensure a Primary Dealer exists, note its `id` 3. POST `/api/v1/customers` with body `{"firm_name":"XYZ Sub Shop","customer_type":"Sub Dealer","primary_dealer_id":"<primary_id>","mobile":"9123456780"}` 4. Check response body | HTTP 201; response contains `primary_dealer_id` matching the provided ID; fields like `address`, `gstin`, `contact_person` auto-filled from primary dealer record; Sub Dealer created | API |
| TC-CUST-ADM-003 | Admin | Admin creates Sub Dealer WITHOUT primary_dealer_id returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/customers` with body `{"firm_name":"Orphan Sub","customer_type":"Sub Dealer","mobile":"9000000001"}` (no `primary_dealer_id`) 3. Check response | HTTP 400; response body contains validation error indicating `primary_dealer_id` is required for Sub Dealer type; no customer created | API |
| TC-CUST-ADM-004 | Admin | Admin updates customer firm_name | P0 | 1. Login as Admin 2. Create a customer, note its `id` 3. PUT `/api/v1/customers/<customer_id>` with `Authorization: Bearer <admin_token>` and body `{"firm_name":"Updated Firm Name"}` 4. GET `/api/v1/customers/<customer_id>` | HTTP 200 on PUT; subsequent GET returns customer with `firm_name="Updated Firm Name"`; other fields unchanged | API |
| TC-CUST-ADM-005 | Admin | Admin soft deletes customer | P0 | 1. Login as Admin 2. Create a customer, note its `id` 3. DELETE `/api/v1/customers/<customer_id>` with `Authorization: Bearer <admin_token>` 4. GET `/api/v1/customers` | HTTP 200 on DELETE; customer absent from default GET /customers list; record in DB has `deleted_at` or `is_active=false` | API |
| TC-CUST-ADM-006 | Admin | Admin views customer list with type column | P0 | 1. Login as Admin 2. Create at least one Primary Dealer and one Sub Dealer 3. GET `/api/v1/customers` with `Authorization: Bearer <admin_token>` 4. Inspect response | HTTP 200; response array contains customers with `customer_type` field set to `"Primary Dealer"` or `"Sub Dealer"`; both types present in list | API |
| TC-CUST-ADM-007 | Admin | Admin filters by customer_type=Primary Dealer | P1 | 1. Login as Admin 2. GET `/api/v1/customers?customer_type=Primary Dealer` with `Authorization: Bearer <admin_token>` 3. Check response | HTTP 200; all returned customers have `customer_type="Primary Dealer"`; no Sub Dealers in response | API |
| TC-CUST-ADM-008 | Admin | Admin filters by customer_type=Sub Dealer | P1 | 1. Login as Admin 2. GET `/api/v1/customers?customer_type=Sub Dealer` with `Authorization: Bearer <admin_token>` 3. Check response | HTTP 200; all returned customers have `customer_type="Sub Dealer"`; no Primary Dealers in response | API |
| TC-CUST-ADM-009 | Admin | Admin GET /customers/primary-dealers returns only active primaries | P1 | 1. Login as Admin 2. Ensure at least one active Primary Dealer and one deleted/inactive Primary Dealer exist 3. GET `/api/v1/customers/primary-dealers` with `Authorization: Bearer <admin_token>` 4. Check response | HTTP 200; only active Primary Dealers returned; deleted/inactive primaries excluded; Sub Dealers excluded | API |
| TC-CUST-ADM-010 | Admin | Admin GET /customers/:id/sub-dealers returns subs of that primary | P1 | 1. Login as Admin 2. Create a Primary Dealer (ID = P1) and two Sub Dealers linked to P1 3. GET `/api/v1/customers/<P1_id>/sub-dealers` with `Authorization: Bearer <admin_token>` 4. Check response | HTTP 200; response contains exactly the two Sub Dealers linked to P1; sub dealers from other primaries not included | API |
| TC-CUST-ADM-011 | Admin | Admin creates customer with valid GSTIN | P1 | 1. Login as Admin 2. POST `/api/v1/customers` with body including `"gstin":"27AAPFU0939F1ZV"` (valid 15-char GST format) 3. Check response | HTTP 201; customer created with `gstin` stored correctly; GSTIN validation passes | API |
| TC-CUST-ADM-012 | Admin | Admin creates customer with invalid GSTIN returns 400 | P1 | 1. Login as Admin 2. POST `/api/v1/customers` with body including `"gstin":"INVALIDGSTIN"` (wrong format) 3. Check response | HTTP 400; response body contains validation error referencing `gstin` format; no customer created | API |

#### 36.2 — Supervisor Customer Operations

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CUST-SUP-001 | Supervisor | Supervisor creates Primary Dealer | P0 | 1. Login as Supervisor 2. POST `/api/v1/customers` with `Authorization: Bearer <supervisor_token>` and body `{"firm_name":"Sup Primary","customer_type":"Primary Dealer","mobile":"9811112222"}` 3. Check response | HTTP 201; customer created with `customer_type="Primary Dealer"`; Supervisor-created record in DB | API |
| TC-CUST-SUP-002 | Supervisor | Supervisor creates Sub Dealer | P0 | 1. Login as Supervisor 2. Ensure a Primary Dealer exists, note its `id` 3. POST `/api/v1/customers` with `Authorization: Bearer <supervisor_token>` and body `{"firm_name":"Sup Sub","customer_type":"Sub Dealer","primary_dealer_id":"<primary_id>","mobile":"9811113333"}` 4. Check response | HTTP 201; Sub Dealer created with correct `primary_dealer_id` linkage | API |
| TC-CUST-SUP-003 | Supervisor | Supervisor updates customer | P0 | 1. Login as Supervisor 2. PUT `/api/v1/customers/<valid_customer_id>` with `Authorization: Bearer <supervisor_token>` and body `{"mobile":"9999988888"}` 3. Check response | HTTP 200; `mobile` field updated in DB | API |
| TC-CUST-SUP-004 | Supervisor | Supervisor cannot delete customer | P0 | 1. Login as Supervisor 2. DELETE `/api/v1/customers/<valid_customer_id>` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 403; customer NOT deleted; response contains `"Forbidden"` | API |
| TC-CUST-SUP-005 | Supervisor | Supervisor views customer list | P0 | 1. Login as Supervisor 2. GET `/api/v1/customers` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 200; customer list returned with `customer_type` field; read access confirmed | API |
| TC-CUST-SUP-006 | Supervisor | Supervisor GET /customers/primary-dealers | P1 | 1. Login as Supervisor 2. GET `/api/v1/customers/primary-dealers` with `Authorization: Bearer <supervisor_token>` 3. Check response | HTTP 200; list of active Primary Dealers returned; Supervisor has read access to this endpoint | API |

#### 36.3 — Read-Only / Denied Roles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CUST-WHO-001 | Warehouse Operator | Warehouse Operator can GET /customers | P0 | 1. Login as Warehouse Operator 2. GET `/api/v1/customers` with `Authorization: Bearer <warehouse_token>` 3. Check response | HTTP 200; customer list returned; read access permitted for Warehouse Operator | API |
| TC-CUST-WHO-002 | Warehouse Operator | Warehouse Operator cannot POST /customers | P0 | 1. Login as Warehouse Operator 2. POST `/api/v1/customers` with `Authorization: Bearer <warehouse_token>` and valid body 3. Check response | HTTP 403; no customer created; response contains `"Forbidden"` | API |
| TC-CUST-DOP-001 | Dispatch Operator | Dispatch Operator can GET /customers | P0 | 1. Login as Dispatch Operator 2. GET `/api/v1/customers` with `Authorization: Bearer <dispatch_token>` 3. Check response | HTTP 200; customer list returned; read access permitted for Dispatch Operator (needed for dispatch workflow) | API |
| TC-CUST-DOP-002 | Dispatch Operator | Dispatch Operator cannot POST /customers | P0 | 1. Login as Dispatch Operator 2. POST `/api/v1/customers` with `Authorization: Bearer <dispatch_token>` and valid body 3. Check response | HTTP 403; no customer created; response contains `"Forbidden"` | API |

#### 36.4 — Customer Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CUST-VAL-001 | Admin | Create customer missing firm_name returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/customers` with body `{"customer_type":"Primary Dealer","mobile":"9876543210"}` (no `firm_name`) 3. Check response | HTTP 400; response body contains validation error referencing `firm_name` as required; no customer created | API |
| TC-CUST-VAL-002 | Admin | Create customer with mobile less than 10 digits returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/customers` with body `{"firm_name":"Short Mobile","customer_type":"Primary Dealer","mobile":"98765"}` (5 digits) 3. Check response | HTTP 400; response body contains validation error for `mobile` minimum length (10 digits); no customer created | API |
| TC-CUST-VAL-003 | Admin | Create customer with mobile more than 15 digits returns 400 | P1 | 1. Login as Admin 2. POST `/api/v1/customers` with body where `mobile` is a 16-digit string (e.g., `"9876543210123456"`) 3. Check response | HTTP 400; response body contains validation error for `mobile` maximum length (15 digits); no customer created | API |
| TC-CUST-VAL-004 | Admin | Create customer with duplicate firm_name returns warning | P1 | 1. Login as Admin 2. Create a customer with `firm_name="ABC Traders"` 3. POST `/api/v1/customers` again with `firm_name="ABC Traders"` 4. Check response | HTTP 200 or 201 with a warning field in response body (e.g., `"warning":"Duplicate firm name detected"`), OR HTTP 409; response communicates the duplicate; behavior per business rule | API |
| TC-CUST-VAL-005 | Admin | Create Sub Dealer with non-existent primary_dealer_id returns 400 | P0 | 1. Login as Admin 2. POST `/api/v1/customers` with body `{"firm_name":"Ghost Sub","customer_type":"Sub Dealer","primary_dealer_id":"00000000-0000-0000-0000-000000000000","mobile":"9876543000"}` (non-existent UUID) 3. Check response | HTTP 400 or 404; response body contains error indicating primary dealer not found; no customer created | API |
| TC-CUST-VAL-006 | Admin | Create customer with invalid GSTIN format returns 400 | P1 | 1. Login as Admin 2. POST `/api/v1/customers` with body `{"firm_name":"Bad GSTIN Co","customer_type":"Primary Dealer","mobile":"9876543210","gstin":"ABC123"}` (invalid format) 3. Check response | HTTP 400; response body contains validation error for `gstin` format (expected 15-character GST format like `22AAAAA0000A1Z5`); no customer created | API |

#### 36.5 — Playwright E2E: Customer Management

| TC ID | Role | Title | Priority | Steps | Expected Result | Type |
|-------|------|-------|----------|-------|-----------------|------|
| TC-CUST-E2E-001 | Admin | Admin — Customers page loads with type filter dropdown | P0 | 1. Login as Admin via UI 2. Navigate to `http://localhost:3000/customers` 3. Check for type filter | Customers page renders without error; type filter dropdown (Primary Dealer / Sub Dealer / All) is visible in the UI | E2E |
| TC-CUST-E2E-002 | Admin | Admin — "Add Customer" button visible | P0 | 1. Login as Admin via UI 2. Navigate to `http://localhost:3000/customers` 3. Check for button | "Add Customer" button (or equivalent) is visible and clickable for Admin role | E2E |
| TC-CUST-E2E-003 | Admin | Admin — Create modal has type selector (Primary/Sub Dealer radio) | P0 | 1. Login as Admin 2. Navigate to Customers page 3. Click "Add Customer" 4. Inspect modal | Modal opens with radio buttons or a selector for `customer_type` offering "Primary Dealer" and "Sub Dealer" options; all visible on initial render | E2E |
| TC-CUST-E2E-004 | Admin | Admin — Select Sub Dealer type reveals primary dealer dropdown | P0 | 1. Login as Admin 2. Open "Add Customer" modal 3. Select "Sub Dealer" radio/option 4. Check modal for primary dealer selector | Primary dealer dropdown appears in the form after selecting "Sub Dealer"; dropdown is populated with existing active Primary Dealers; field is required | E2E |
| TC-CUST-E2E-005 | Admin | Admin — Select primary dealer auto-fills address/GSTIN/contact as read-only | P1 | 1. Login as Admin 2. Open "Add Customer" modal 3. Select "Sub Dealer" 4. Choose a Primary Dealer from dropdown 5. Check address, GSTIN, contact fields | Address, GSTIN, and contact person fields are auto-populated from the selected Primary Dealer's data; these fields are read-only (not editable) for Sub Dealer creation | E2E |
| TC-CUST-E2E-006 | Admin | Admin — Create Primary Dealer via UI appears in list | P0 | 1. Login as Admin 2. Navigate to Customers page 3. Click "Add Customer" 4. Select "Primary Dealer" 5. Fill required fields (firm_name, mobile) 6. Submit 7. Check customer list | Success notification shown; new Primary Dealer visible in customer list; `customer_type` column shows "Primary Dealer" | E2E |
| TC-CUST-E2E-007 | Admin | Admin — Type column shows "Primary Dealer" or "Sub Dealer" | P1 | 1. Login as Admin 2. Navigate to Customers page 3. Ensure both Primary Dealers and Sub Dealers exist 4. Inspect customer list table | Customer list table has a "Type" column; each row shows either "Primary Dealer" or "Sub Dealer"; values are correctly labeled | E2E |
| TC-CUST-E2E-008 | Supervisor | Supervisor — Customers page loads with "Add Customer" visible | P0 | 1. Login as Supervisor via UI 2. Navigate to `http://localhost:3000/customers` 3. Check for "Add Customer" button | Customers page loads; "Add Customer" button IS visible for Supervisor (Supervisors have create permission) | E2E |
| TC-CUST-E2E-009 | Warehouse Operator | Warehouse Operator — Customers accessible but "Add Customer" NOT visible | P0 | 1. Login as Warehouse Operator via UI 2. Navigate to `http://localhost:3000/customers` (if accessible) 3. Check for "Add Customer" button | Customers page loads (read access); "Add Customer" button is NOT visible or is hidden/disabled for Warehouse Operator role | E2E |
| TC-CUST-E2E-010 | Admin | Admin — Filter by customer type filters list correctly | P1 | 1. Login as Admin 2. Navigate to Customers page 3. Select "Sub Dealer" from the type filter dropdown 4. Observe list 5. Switch to "Primary Dealer" filter | Selecting "Sub Dealer" shows only Sub Dealers; switching to "Primary Dealer" shows only Primary Dealers; filter updates list without full page reload; count changes accordingly | E2E |
