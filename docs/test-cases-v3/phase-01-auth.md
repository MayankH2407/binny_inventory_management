# Phase 01 — Authentication & Authorization

**Module codes:** `RBAC` (login, token, profile, logout, change-password, RBAC denials)
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30

> **Prerequisite:** Admin account is auto-seeded (`admin@binny.com` / `Admin@123`). The other three role accounts must exist before role-specific tests run. Run **TC-USER-SEED-001** in phase-02 first if they do not.

---

## Table of Contents

- [Section 01.1 — Login per role](#section-011--login-per-role)
- [Section 01.2 — Login failures](#section-012--login-failures)
- [Section 01.3 — JWT token contract](#section-013--jwt-token-contract)
- [Section 01.4 — Token lifecycle (expire / malform / missing)](#section-014--token-lifecycle-expire--malform--missing)
- [Section 01.5 — Refresh token](#section-015--refresh-token)
- [Section 01.6 — Profile endpoint](#section-016--profile-endpoint)
- [Section 01.7 — Logout](#section-017--logout)
- [Section 01.8 — Change password](#section-018--change-password)
- [Section 01.9 — Playwright E2E: Login page & navigation](#section-019--playwright-e2e-login-page--navigation)
- [Section 01.10 — RBAC denial matrix — Users](#section-0110--rbac-denial-matrix--users)
- [Section 01.11 — RBAC denial matrix — Products](#section-0111--rbac-denial-matrix--products)
- [Section 01.12 — RBAC denial matrix — Sections](#section-0112--rbac-denial-matrix--sections)
- [Section 01.13 — RBAC denial matrix — Customers](#section-0113--rbac-denial-matrix--customers)
- [Section 01.14 — RBAC denial matrix — Child boxes](#section-0114--rbac-denial-matrix--child-boxes)
- [Section 01.15 — RBAC denial matrix — Master cartons](#section-0115--rbac-denial-matrix--master-cartons)
- [Section 01.16 — RBAC denial matrix — Samples](#section-0116--rbac-denial-matrix--samples)
- [Section 01.17 — RBAC denial matrix — E-commerce](#section-0117--rbac-denial-matrix--e-commerce)
- [Section 01.18 — RBAC denial matrix — Dispatches](#section-0118--rbac-denial-matrix--dispatches)
- [Section 01.19 — RBAC denial matrix — Inventory & Reports](#section-0119--rbac-denial-matrix--inventory--reports)

---

## Section 01.1 — Login per role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-001 | Admin | Admin login with valid credentials returns token and role | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"Admin@123"}` 2. Inspect response status, body fields | HTTP 200; body contains `data.user.role === "Admin"`, `data.user.email === "admin@binny.com"`, `data.accessToken` is a non-empty JWT string; `Set-Cookie` header includes `accessToken` httpOnly cookie | API | Auto-seeded account |
| TC-RBAC-002 | Supervisor | Supervisor login with valid credentials returns token and role | P0 | 1. `POST /api/v1/auth/login` body `{"email":"supervisor@binny.com","password":"Sup@123"}` 2. Inspect response | HTTP 200; `data.user.role === "Supervisor"`; `data.accessToken` is a valid JWT; httpOnly cookie `accessToken` set with `Max-Age` ≈ 900 s | API | Requires TC-USER-SEED-001 |
| TC-RBAC-003 | Warehouse Operator | Warehouse Operator login with valid credentials returns correct role | P0 | 1. `POST /api/v1/auth/login` body `{"email":"warehouse@binny.com","password":"Wh@123"}` 2. Inspect response | HTTP 200; `data.user.role === "Warehouse Operator"`; `data.accessToken` non-empty | API | Requires TC-USER-SEED-001 |
| TC-RBAC-004 | Dispatch Operator | Dispatch Operator login with valid credentials returns correct role | P0 | 1. `POST /api/v1/auth/login` body `{"email":"dispatch@binny.com","password":"Dp@123"}` 2. Inspect response | HTTP 200; `data.user.role === "Dispatch Operator"`; `data.accessToken` non-empty | API | Requires TC-USER-SEED-001 |
| TC-RBAC-005 | Admin | Login response body includes id, name, email, role — no password_hash | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"Admin@123"}` 2. Parse `data.user` object | `data.user` has fields `id` (UUID), `name`, `email`, `role`; field `password_hash` is absent from response | API | Security assertion |
| TC-RBAC-006 | Admin | Login updates last_login_at in DB | P1 | 1. Note current timestamp T0 2. `POST /api/v1/auth/login` as Admin 3. Query DB: `SELECT last_login_at FROM users WHERE email = 'admin@binny.com'` | `last_login_at` ≥ T0; timestamp was updated by login call | Integration | Verifies audit trail |

---

## Section 01.2 — Login failures

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-007 | Any | Non-existent email returns 401 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"nobody@binny.com","password":"Admin@123"}` | HTTP 401; body contains `message` containing "Invalid email or password"; no `accessToken` field; no cookie set | API | |
| TC-RBAC-008 | Any | Wrong password for existing user returns 401 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"WrongPass1"}` | HTTP 401; body `message` === "Invalid email or password"; no token returned; no cookie | API | |
| TC-RBAC-009 | Any | Empty email field returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"","password":"Admin@123"}` | HTTP 400; body contains Zod validation error referencing `email`; no token | API | Zod min-length for email |
| TC-RBAC-010 | Any | Empty password field returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":""}` | HTTP 400; body contains validation error referencing `password` (min 6 chars); no token | API | |
| TC-RBAC-011 | Any | Missing email field entirely returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"password":"Admin@123"}` | HTTP 400; Zod error for `email` required; no token | API | |
| TC-RBAC-012 | Any | Missing password field entirely returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com"}` | HTTP 400; Zod error for `password` required; no token | API | |
| TC-RBAC-013 | Any | Password shorter than 6 chars returns 400 | P1 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"ab"}` | HTTP 400; Zod validation error: "Password must be at least 6 characters"; no token | API | loginSchema min 6 |
| TC-RBAC-014 | Any | Inactive user login returns 401 | P1 | 1. Admin deactivates `supervisor@binny.com` via `PUT /api/v1/users/<id>` body `{"is_active":false}` 2. `POST /api/v1/auth/login` body `{"email":"supervisor@binny.com","password":"Sup@123"}` 3. Restore: `PUT /api/v1/users/<id>` body `{"is_active":true}` | Step 2 returns HTTP 401; message "Invalid email or password" (query filters `is_active = true`); no token | Integration | auth.service line 40 WHERE clause |
| TC-RBAC-015 | Any | SQL injection in email field handled safely | P1 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com' OR '1'='1","password":"anything"}` | HTTP 401 or HTTP 400; no 500 error; no SQL data leaked; server continues serving subsequent requests normally | API | Parameterised queries prevent injection |
| TC-RBAC-016 | Any | Email exceeding 255 chars returns 400 | P1 | 1. `POST /api/v1/auth/login` body `{"email":"<256-char-string>@x.com","password":"Admin@123"}` | HTTP 400; Zod validation error for `email` max 255; no token | API | |
| TC-RBAC-017 | Any | Non-JSON content type returns 400 | P1 | 1. `POST /api/v1/auth/login` with header `Content-Type: text/plain` body `email=admin@binny.com&password=Admin@123` | HTTP 400 or 415; no token; server does not crash | API | |

---

## Section 01.3 — JWT token contract

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-018 | Admin | Access token is a three-part dot-separated JWT | P0 | 1. Login as Admin 2. Take `data.accessToken` 3. Split by `.` | Exactly three parts; each part is valid base64url; decode header → `{"alg":"HS256","typ":"JWT"}`; decode payload → contains `userId`, `email`, `roleId`, `iat`, `exp` | API | |
| TC-RBAC-019 | Admin | Access token exp is approximately 15 minutes from iat | P0 | 1. Login as Admin 2. Decode JWT payload 3. Compute `exp - iat` | `exp - iat` === 900 (15 minutes ± 5 s); `iat` ≈ current Unix timestamp | API | COOKIE_OPTIONS maxAge 900 000 ms |
| TC-RBAC-020 | Admin | Refresh token cookie is set with 7-day max-age | P0 | 1. Login as Admin 2. Inspect `Set-Cookie` header for `refreshToken` | `Set-Cookie: refreshToken=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (7 days); Secure flag present in production | API | auth.controller line 34 |
| TC-RBAC-021 | Admin | Access token payload contains roleId not role string | P1 | 1. Login as Admin 2. Decode JWT payload | Payload has field `roleId` (UUID); does NOT have plaintext `role` string; `email` matches login email | API | JwtPayload type |

---

## Section 01.4 — Token lifecycle (expire / malform / missing)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-022 | Any | Expired JWT returns 401 with "Token has expired" | P0 | 1. Craft a JWT signed with the correct secret but `exp` set to 1 second in the past 2. `GET /api/v1/auth/profile` header `Authorization: Bearer <expired_token>` | HTTP 401; body `message` === "Token has expired" | API | auth.middleware line 45 |
| TC-RBAC-023 | Any | Malformed JWT (not three parts) returns 401 | P0 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer thisisnotjwt` | HTTP 401; body `message` === "Invalid token"; server does not return 500 | API | auth.middleware line 48 |
| TC-RBAC-024 | Any | JWT signed with wrong secret returns 401 | P0 | 1. Sign a valid-looking JWT payload with a different secret 2. `GET /api/v1/auth/profile` header `Authorization: Bearer <wrong_sig_token>` | HTTP 401; body `message` === "Invalid token" | API | |
| TC-RBAC-025 | Any | Missing Authorization header and no cookie returns 401 | P0 | 1. `GET /api/v1/auth/profile` with no `Authorization` header and no cookies | HTTP 401; body `message` === "Authentication token is required" | API | auth.middleware line 32 |
| TC-RBAC-026 | Any | Bearer token with only two parts returns 401 | P1 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer header.payload` (no signature) | HTTP 401; "Invalid token"; no 500 | API | |
| TC-RBAC-027 | Any | Empty Bearer value returns 401 | P1 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer ` (empty after space) | HTTP 401; "Authentication token is required" | API | extractToken returns null for empty string |
| TC-RBAC-028 | Any | Token from httpOnly cookie is accepted (no header) | P0 | 1. Login via `POST /api/v1/auth/login` (stores `accessToken` cookie) 2. `GET /api/v1/auth/profile` with no `Authorization` header but with the `accessToken` cookie forwarded | HTTP 200; profile returned; cookie path is prioritised over header | API | auth.middleware cookie-first logic |

---

## Section 01.5 — Refresh token

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-029 | Admin | Valid refresh token issues new access token | P0 | 1. Login as Admin; capture `refreshToken` cookie 2. `POST /api/v1/auth/refresh` with `refreshToken` cookie forwarded | HTTP 200; body contains `data.accessToken` (new JWT); `Set-Cookie` rotates both `accessToken` and `refreshToken` | API | auth.controller refreshToken |
| TC-RBAC-030 | Any | Refresh with no token returns 401 | P0 | 1. `POST /api/v1/auth/refresh` with no cookies and no body | HTTP 401; body `message` === "Refresh token is required" | API | |
| TC-RBAC-031 | Any | Expired refresh token returns 401 | P0 | 1. Craft or obtain an expired refresh token 2. `POST /api/v1/auth/refresh` body `{"refreshToken":"<expired>"}` | HTTP 401; body contains error message; no new access token issued | API | |
| TC-RBAC-032 | Any | Malformed refresh token returns 401 | P1 | 1. `POST /api/v1/auth/refresh` body `{"refreshToken":"notavalidjwt"}` | HTTP 401; no new token; server does not crash | API | |

---

## Section 01.6 — Profile endpoint

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-033 | Admin | Profile returns correct fields for Admin | P0 | 1. Login as Admin 2. `GET /api/v1/auth/profile` with valid token | HTTP 200; body `data` contains `id`, `name`, `email`, `role === "Admin"`, `is_active === true`, `last_login_at`; no `password_hash` | API | |
| TC-RBAC-034 | Supervisor | Profile returns correct role for Supervisor | P0 | 1. Login as Supervisor 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Supervisor"` | API | |
| TC-RBAC-035 | Warehouse Operator | Profile returns correct role for Warehouse Operator | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Warehouse Operator"` | API | |
| TC-RBAC-036 | Dispatch Operator | Profile returns correct role for Dispatch Operator | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Dispatch Operator"` | API | |
| TC-RBAC-037 | Any | Profile does not expose other users' data | P1 | 1. Login as Supervisor 2. `GET /api/v1/auth/profile` | Response `data` contains exactly one user record matching the authenticated Supervisor; no array of all users; no Admin credentials exposed | API | |

---

## Section 01.7 — Logout

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-038 | Admin | Logout clears httpOnly cookies | P0 | 1. Login as Admin; verify `accessToken` cookie present 2. `POST /api/v1/auth/logout` with valid `accessToken` cookie | HTTP 200; response `Set-Cookie` contains `accessToken=; Max-Age=0` and `refreshToken=; Max-Age=0` (cookies cleared); body message "Logged out successfully" | API | auth.controller clearCookie |
| TC-RBAC-039 | Any | Logout without auth token returns 401 | P0 | 1. `POST /api/v1/auth/logout` with no cookies and no `Authorization` header | HTTP 401; "Authentication token is required"; server does not crash | API | route requires `authenticate` middleware |
| TC-RBAC-040 | Any | Using cleared cookie after logout returns 401 | P0 | 1. Login as Admin 2. Logout 3. `GET /api/v1/auth/profile` with the old token value in `Authorization: Bearer` header | HTTP 401; "Invalid token" or "Token has expired" (token is still technically valid for 15 min — this test confirms server-side cookie clearing; if token is in Authorization header it will still validate until expiry; note this in Notes) | Integration | Stateless JWT: server cannot invalidate issued tokens before expiry; only cookies are cleared |

---

## Section 01.8 — Change password

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-041 | Admin | Change password with correct currentPassword succeeds | P0 | 1. Login as Admin, obtain token 2. `PUT /api/v1/auth/change-password` header `Authorization: Bearer <token>` body `{"currentPassword":"Admin@123","newPassword":"AdminNew@456"}` 3. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"AdminNew@456"}` 4. Restore: `PUT /api/v1/auth/change-password` with new token body `{"currentPassword":"AdminNew@456","newPassword":"Admin@123"}` | Step 2 HTTP 200 message "Password changed successfully"; Step 3 HTTP 200 with valid token | Integration | Restore password after test |
| TC-RBAC-042 | Admin | Change password with wrong currentPassword returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"WrongPass99","newPassword":"AdminNew@456"}` | HTTP 400; body contains error "Current password is incorrect" or similar; password NOT changed (old password still works) | API | |
| TC-RBAC-043 | Any | Change password — newPassword shorter than 8 chars returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"Ab1"}` | HTTP 400; Zod error "New password must be at least 8 characters"; password unchanged | API | changePasswordSchema min 8 |
| TC-RBAC-044 | Any | Change password — newPassword missing uppercase returns 400 | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"alllowercase1"}` | HTTP 400; Zod error "Password must contain at least one uppercase letter, one lowercase letter, and one number"; password unchanged | API | changePasswordSchema regex |
| TC-RBAC-045 | Any | Change password — newPassword missing digit returns 400 | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"AllLettersNoNum"}` | HTTP 400; Zod regex error for missing digit; password unchanged | API | |
| TC-RBAC-046 | Any | Change password — missing currentPassword field returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"newPassword":"AdminNew@456"}` | HTTP 400; Zod error for `currentPassword` required (min 1 char); password unchanged | API | changePasswordSchema currentPassword min 1 |
| TC-RBAC-047 | Any | Change password — unauthenticated returns 401 | P0 | 1. `PUT /api/v1/auth/change-password` with no token body `{"currentPassword":"Admin@123","newPassword":"Admin@456X"}` | HTTP 401; "Authentication token is required" | API | |
| TC-RBAC-048 | Supervisor | Supervisor can change own password | P1 | 1. Login as Supervisor 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Sup@123","newPassword":"SupNew@456"}` 3. Restore | HTTP 200; password changed; login with new password succeeds | Integration | No role restriction on change-password |

---

## Section 01.9 — Playwright E2E: Login page & navigation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-E2E-001 | Any | Login page renders all required form elements | P0 | 1. Navigate to `http://localhost:3000/login` 2. Assert DOM | Page renders: heading "Binny Inventory"; email input (`[type="email"]` with `placeholder="Enter your email"`); password input (`[type="password"]`); "Sign In" `<button type="submit">`; eye-toggle button; Basiq360 footer text; no console errors | E2E | login/page.tsx |
| TC-RBAC-E2E-002 | Any | Login page shows email inline error on blur with empty field | P1 | 1. Navigate to `/login` 2. Click email input, then tab away without typing 3. Observe error | Inline error text "Email is required" appears below email input; form not submitted | E2E | client-side `validate()` |
| TC-RBAC-E2E-003 | Any | Login page shows password error on blur with short password | P1 | 1. Navigate to `/login` 2. Type 3 chars in password field 3. Click Sign In | Inline error "Password must be at least 6 characters" below password field; API call NOT made | E2E | |
| TC-RBAC-E2E-004 | Admin | Successful Admin login redirects to /dashboard | P0 | 1. Navigate to `/login` 2. Enter `admin@binny.com` / `Admin@123` 3. Click "Sign In" | URL changes to `/dashboard`; toast "Login successful" shown; dashboard heading or inventory cards visible; no error on console | E2E | |
| TC-RBAC-E2E-005 | Admin | Admin nav shows Users Management link | P0 | 1. Login as Admin 2. Inspect sidebar navigation | Sidebar contains "User Management" link (routes to `/users`); link visible only to Admin | E2E | users page guards `isAdmin` |
| TC-RBAC-E2E-006 | Supervisor | Supervisor nav does NOT show Users Management | P0 | 1. Login as Supervisor 2. Inspect sidebar navigation | Sidebar does NOT contain a "User Management" link; Supervisor sees Products, Sections (read), Customers, Child Boxes, Master Cartons, Samples, E-commerce, Dispatch, Inventory, Reports | E2E | |
| TC-RBAC-E2E-007 | Warehouse Operator | Warehouse Operator nav excludes Reports and Dispatch links | P1 | 1. Login as Warehouse Operator 2. Inspect sidebar | Sidebar shows Inventory Dashboard, Child Boxes, Master Cartons, Samples (create), E-commerce (create); does NOT show Reports, Dispatch, User Management | E2E | |
| TC-RBAC-E2E-008 | Dispatch Operator | Dispatch Operator nav shows Dispatch module | P0 | 1. Login as Dispatch Operator 2. Inspect sidebar | Sidebar shows Dispatch; does NOT show User Management, Reports, Products (write), Sections (write) | E2E | |
| TC-RBAC-E2E-009 | Any | Unauthenticated direct navigation to /dashboard redirects to /login | P0 | 1. Clear all cookies and localStorage 2. Navigate directly to `http://localhost:3000/dashboard` | Browser redirects to `/login`; dashboard content NOT rendered; no auth data exposed in page source | E2E | |
| TC-RBAC-E2E-010 | Any | Unauthenticated direct navigation to /users redirects to /login | P0 | 1. Clear cookies 2. Navigate to `http://localhost:3000/users` | Redirect to `/login` | E2E | |
| TC-RBAC-E2E-011 | Any | Eye-toggle reveals/hides password text | P1 | 1. Navigate to `/login` 2. Type "Test@123" in password field 3. Click eye-toggle icon 4. Toggle again | On first click: `[type="password"]` changes to `[type="text"]`, password visible as plain text; on second click: reverts to `type="password"` | E2E | showPassword state |
| TC-RBAC-E2E-012 | Any | Invalid credentials shows error toast (not inline error) | P0 | 1. Navigate to `/login` 2. Enter `admin@binny.com` / `WrongPass99` 3. Click "Sign In" | Error toast appears (react-hot-toast) containing "Invalid email or password"; URL remains `/login`; no navigation occurs | E2E | |
| TC-RBAC-E2E-013 | Any | Settings page /settings has Change Password form with three fields | P1 | 1. Login as Admin 2. Navigate to `http://localhost:3000/settings` | Page renders "Change Password" section with inputs: "Current Password", "New Password", "Confirm Password"; Submit button "Change Password" | E2E | settings/page.tsx |

---

## Section 01.10 — RBAC denial matrix — Users

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-101 | Supervisor | Supervisor cannot POST /users | P0 | 1. Login as Supervisor, obtain token 2. `POST /api/v1/users` header `Authorization: Bearer <supervisor_token>` body `{"email":"x@binny.com","password":"Test@1234","name":"X","role":"Warehouse Operator"}` | HTTP 403; body contains "Access denied" or "Forbidden"; no user created in DB | API | user.routes.ts authorize(ADMIN) |
| TC-RBAC-102 | Warehouse Operator | Warehouse Operator cannot POST /users | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/users` with `warehouse_token` and valid body | HTTP 403; no user created | API | |
| TC-RBAC-103 | Dispatch Operator | Dispatch Operator cannot POST /users | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/users` with `dispatch_token` and valid body | HTTP 403; no user created | API | |
| TC-RBAC-104 | Supervisor | Supervisor CAN GET /users list | P1 | 1. Login as Supervisor 2. `GET /api/v1/users` with `supervisor_token` | HTTP 200; users list returned; Supervisor has read-only access | API | user.routes.ts authorize(ADMIN, SUPERVISOR) |
| TC-RBAC-105 | Warehouse Operator | Warehouse Operator cannot GET /users list | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/users` with `warehouse_token` | HTTP 403; no user list | API | |
| TC-RBAC-106 | Dispatch Operator | Dispatch Operator cannot GET /users list | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/users` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-107 | Supervisor | Supervisor CAN GET /users/:id | P1 | 1. Login as Supervisor 2. `GET /api/v1/users/<valid_uuid>` with `supervisor_token` | HTTP 200; single user record returned | API | authorize(ADMIN, SUPERVISOR) |
| TC-RBAC-108 | Warehouse Operator | Warehouse Operator cannot GET /users/:id | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/users/<valid_uuid>` with `warehouse_token` | HTTP 403 | API | |
| TC-RBAC-109 | Supervisor | Supervisor cannot PUT /users/:id | P0 | 1. Login as Supervisor 2. `PUT /api/v1/users/<valid_uuid>` with `supervisor_token` body `{"name":"Hacked"}` | HTTP 403; user record unchanged | API | authorize(ADMIN) only for PUT |
| TC-RBAC-110 | Warehouse Operator | Warehouse Operator cannot PUT /users/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/users/<valid_uuid>` with `warehouse_token` body `{"name":"Hacked"}` | HTTP 403; user unchanged | API | |
| TC-RBAC-111 | Dispatch Operator | Dispatch Operator cannot DELETE /users/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/users/<valid_uuid>` with `dispatch_token` | HTTP 403; user not deleted | API | |
| TC-RBAC-112 | Supervisor | Supervisor cannot DELETE /users/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/users/<valid_uuid>` with `supervisor_token` | HTTP 403; user not deactivated | API | |

---

## Section 01.11 — RBAC denial matrix — Products

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-113 | Warehouse Operator | Warehouse Operator cannot POST /products | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/products` with `warehouse_token` body `{"article_name":"X","article_code":"X01","colour":"Red","size":"7","mrp":299,"category":"Gents","section_id":"<valid_uuid>"}` | HTTP 403; no product created | API | |
| TC-RBAC-114 | Dispatch Operator | Dispatch Operator cannot POST /products | P0 | 1. Login as Dispatch Operator 2. Same body as TC-RBAC-113 with `dispatch_token` | HTTP 403; no product created | API | |
| TC-RBAC-115 | Warehouse Operator | Warehouse Operator cannot PUT /products/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/products/<valid_uuid>` with `warehouse_token` body `{"mrp":999}` | HTTP 403; product unchanged | API | |
| TC-RBAC-116 | Dispatch Operator | Dispatch Operator cannot PUT /products/:id | P0 | 1. Login as Dispatch Operator 2. Same request with `dispatch_token` | HTTP 403; product unchanged | API | |
| TC-RBAC-117 | Supervisor | Supervisor cannot DELETE /products/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/products/<valid_uuid>` with `supervisor_token` | HTTP 403; product not deleted | API | authorize(ADMIN) only for delete |
| TC-RBAC-118 | Warehouse Operator | Warehouse Operator cannot DELETE /products/:id | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/products/<valid_uuid>` with `warehouse_token` | HTTP 403 | API | |
| TC-RBAC-119 | Dispatch Operator | Dispatch Operator cannot POST /products/bulk-upload | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/products/bulk-upload` (multipart CSV) with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-120 | Warehouse Operator | Warehouse Operator cannot POST /products/:id/image | P1 | 1. Login as Warehouse Operator 2. `POST /api/v1/products/<valid_uuid>/image` multipart JPEG with `warehouse_token` | HTTP 403; image NOT uploaded | API | |
| TC-RBAC-121 | Dispatch Operator | Dispatch Operator cannot GET /products/bulk-upload/sample | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/products/bulk-upload/sample` with `dispatch_token` | HTTP 403 | API | authorize(ADMIN, SUPERVISOR) on sample CSV |

---

## Section 01.12 — RBAC denial matrix — Sections

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-122 | Supervisor | Supervisor cannot POST /sections | P0 | 1. Login as Supervisor 2. `POST /api/v1/sections` with `supervisor_token` body `{"name":"Forbidden Section"}` | HTTP 403; no section created | API | |
| TC-RBAC-123 | Warehouse Operator | Warehouse Operator cannot POST /sections | P0 | 1. Login as Warehouse Operator 2. Same request with `warehouse_token` | HTTP 403 | API | |
| TC-RBAC-124 | Dispatch Operator | Dispatch Operator cannot POST /sections | P0 | 1. Login as Dispatch Operator 2. Same request with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-125 | Supervisor | Supervisor cannot PUT /sections/:id | P0 | 1. Login as Supervisor 2. `PUT /api/v1/sections/<valid_uuid>` with `supervisor_token` body `{"name":"Renamed"}` | HTTP 403; section unchanged | API | |
| TC-RBAC-126 | Supervisor | Supervisor cannot DELETE /sections/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/sections/<valid_uuid>` with `supervisor_token` | HTTP 403; section not deactivated | API | |
| TC-RBAC-127 | Warehouse Operator | Warehouse Operator CAN GET /sections | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/sections` with `warehouse_token` | HTTP 200; sections list returned; read access permitted | API | No authorize() on GET / |
| TC-RBAC-128 | Dispatch Operator | Dispatch Operator CAN GET /sections/:id | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/sections/<valid_uuid>` with `dispatch_token` | HTTP 200; section record returned | API | |

---

## Section 01.13 — RBAC denial matrix — Customers

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-129 | Warehouse Operator | Warehouse Operator cannot POST /customers | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/customers` with `warehouse_token` body `{"firm_name":"WH Firm","customer_type":"Primary Dealer"}` | HTTP 403; no customer created | API | |
| TC-RBAC-130 | Dispatch Operator | Dispatch Operator cannot POST /customers | P0 | 1. Login as Dispatch Operator 2. Same body with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-131 | Warehouse Operator | Warehouse Operator cannot PUT /customers/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/customers/<valid_uuid>` with `warehouse_token` body `{"firm_name":"Hacked"}` | HTTP 403; customer unchanged | API | |
| TC-RBAC-132 | Dispatch Operator | Dispatch Operator cannot PUT /customers/:id | P0 | 1. Login as Dispatch Operator 2. Same with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-133 | Supervisor | Supervisor cannot DELETE /customers/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/customers/<valid_uuid>` with `supervisor_token` | HTTP 403; customer not deactivated | API | authorize(ADMIN) only for delete |
| TC-RBAC-134 | Dispatch Operator | Dispatch Operator cannot DELETE /customers/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/customers/<valid_uuid>` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-135 | Warehouse Operator | Warehouse Operator CAN GET /customers | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/customers` with `warehouse_token` | HTTP 200; list returned | API | No authorize() on GET / |
| TC-RBAC-136 | Dispatch Operator | Dispatch Operator CAN GET /customers/primary-dealers | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/customers/primary-dealers` with `dispatch_token` | HTTP 200; primary dealers list returned | API | Needed for dispatch workflow |

---

## Section 01.14 — RBAC denial matrix — Child boxes

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-137 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes (single create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes` with `dispatch_token` body `{"product_id":"<uuid>","quantity":12,"size":"6"}` | HTTP 403; no child box created | API | |
| TC-RBAC-138 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes/bulk | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk` with `dispatch_token` and valid body | HTTP 403 | API | |
| TC-RBAC-139 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes/bulk-multi-size | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk-multi-size` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-140 | Dispatch Operator | Dispatch Operator cannot POST /child-boxes/bulk-upload (CSV) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk-upload` multipart CSV with `dispatch_token` | HTTP 403 | API | authorize(ADMIN, SUPERVISOR) for CSV upload |
| TC-RBAC-141 | Dispatch Operator | Dispatch Operator CAN POST /child-boxes/:id/activate | P0 | 1. Login as Dispatch Operator 2. Create a GENERATED child box as Admin (or use existing) 3. `POST /api/v1/child-boxes/<id>/activate` with `dispatch_token` | HTTP 200; child box status transitions from GENERATED → FREE or PACKED; Dispatch Operator is explicitly in the allow list | API | childBox.routes.ts line 72 |
| TC-RBAC-142 | Warehouse Operator | Warehouse Operator cannot GET /child-boxes/bulk-upload/sample | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/child-boxes/bulk-upload/sample` with `warehouse_token` | HTTP 403; sample CSV not returned | API | authorize(ADMIN, SUPERVISOR) |

---

## Section 01.15 — RBAC denial matrix — Master cartons

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-143 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons (create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons` with `dispatch_token` body `{"section_id":"<uuid>"}` | HTTP 403; no master carton created | API | |
| TC-RBAC-144 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/pack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/pack` with `dispatch_token` body `{"master_carton_id":"<uuid>","child_box_id":"<uuid>"}` | HTTP 403 | API | |
| TC-RBAC-145 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/unpack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/unpack` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-146 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/repack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/repack` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-147 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/:id/full-unpack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/<uuid>/full-unpack` with `dispatch_token` | HTTP 403; carton unchanged | API | |
| TC-RBAC-148 | Warehouse Operator | Warehouse Operator cannot POST /master-cartons/:id/close | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/master-cartons/<uuid>/close` with `warehouse_token` | HTTP 403; carton NOT closed | API | authorize(ADMIN, SUPERVISOR) for close |
| TC-RBAC-149 | Dispatch Operator | Dispatch Operator cannot POST /master-cartons/:id/close | P0 | 1. Login as Dispatch Operator 2. Same request with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-150 | Warehouse Operator | Warehouse Operator CAN POST /master-cartons (create) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/master-cartons` with `warehouse_token` body `{"section_id":"<valid_uuid>"}` | HTTP 201; master carton created | API | authorize includes WAREHOUSE_OPERATOR |

---

## Section 01.16 — RBAC denial matrix — Samples

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-151 | Dispatch Operator | Dispatch Operator cannot POST /samples (create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/samples` with `dispatch_token` body `{"recipient_name":"X"}` | HTTP 403 | API | |
| TC-RBAC-152 | Dispatch Operator | Dispatch Operator cannot POST /samples/add-box | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/samples/add-box` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-153 | Dispatch Operator | Dispatch Operator cannot POST /samples/remove-box | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/samples/remove-box` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-154 | Dispatch Operator | Dispatch Operator cannot POST /samples/:id/full-unpack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/samples/<uuid>/full-unpack` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-155 | Warehouse Operator | Warehouse Operator cannot POST /samples/:id/close | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/samples/<uuid>/close` with `warehouse_token` | HTTP 403; sample not closed | API | authorize(ADMIN, SUPERVISOR) for close |
| TC-RBAC-156 | Dispatch Operator | Dispatch Operator cannot POST /samples/:id/close | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/samples/<uuid>/close` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-157 | Warehouse Operator | Warehouse Operator CAN POST /samples (create) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/samples` with `warehouse_token` body `{"recipient_name":"Test Recipient"}` | HTTP 201; sample record created | API | authorize includes WAREHOUSE_OPERATOR |

---

## Section 01.17 — RBAC denial matrix — E-commerce

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-158 | Dispatch Operator | Dispatch Operator cannot POST /ecommerce (create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/ecommerce` with `dispatch_token` body `{"marketplace":"Amazon"}` | HTTP 403 | API | |
| TC-RBAC-159 | Dispatch Operator | Dispatch Operator cannot POST /ecommerce/add-box | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/ecommerce/add-box` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-160 | Dispatch Operator | Dispatch Operator cannot POST /ecommerce/remove-box | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/ecommerce/remove-box` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-161 | Dispatch Operator | Dispatch Operator cannot POST /ecommerce/:id/full-unpack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/ecommerce/<uuid>/full-unpack` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-162 | Warehouse Operator | Warehouse Operator cannot POST /ecommerce/:id/close | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/ecommerce/<uuid>/close` with `warehouse_token` | HTTP 403 | API | |
| TC-RBAC-163 | Dispatch Operator | Dispatch Operator cannot POST /ecommerce/:id/close | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/ecommerce/<uuid>/close` with `dispatch_token` | HTTP 403 | API | |

---

## Section 01.18 — RBAC denial matrix — Dispatches

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-164 | Warehouse Operator | Warehouse Operator cannot POST /dispatches | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/dispatches` with `warehouse_token` body `{"customer_id":"<uuid>","master_carton_id":"<uuid>","vehicle_number":"MH01AB1234","dispatch_date":"2026-04-30"}` | HTTP 403; no dispatch record created | API | authorize(ADMIN, SUPERVISOR, DISPATCH_OPERATOR) |
| TC-RBAC-165 | Dispatch Operator | Dispatch Operator CAN POST /dispatches | P0 | 1. Login as Dispatch Operator 2. Ensure a CLOSED master carton exists 3. `POST /api/v1/dispatches` with `dispatch_token` and valid body | HTTP 201; dispatch record created | API | Dispatch Operator is allowed |
| TC-RBAC-166 | Warehouse Operator | Warehouse Operator CAN GET /dispatches | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/dispatches` with `warehouse_token` | HTTP 200; dispatches list returned (no authorize on GET /) | API | No authorize() on GET endpoints |
| TC-RBAC-167 | Warehouse Operator | Warehouse Operator CAN GET /dispatches/:id | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/dispatches/<uuid>` with `warehouse_token` | HTTP 200; dispatch record returned | API | |

---

## Section 01.19 — RBAC denial matrix — Inventory & Reports

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-RBAC-168 | Warehouse Operator | Warehouse Operator cannot GET /reports/inventory-summary | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/reports/inventory-summary` with `warehouse_token` | HTTP 403; no report data | API | report.routes.ts router.use(authorize(ADMIN, SUPERVISOR)) |
| TC-RBAC-169 | Dispatch Operator | Dispatch Operator cannot GET /reports/inventory-summary | P0 | 1. Login as Dispatch Operator 2. Same with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-170 | Warehouse Operator | Warehouse Operator cannot GET /reports/dispatch-summary | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/reports/dispatch-summary` with `warehouse_token` | HTTP 403 | API | |
| TC-RBAC-171 | Dispatch Operator | Dispatch Operator cannot GET /reports/product-wise | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/product-wise` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-172 | Warehouse Operator | Warehouse Operator cannot GET /reports/inventory-summary/export | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/reports/inventory-summary/export` with `warehouse_token` | HTTP 403; no CSV file returned | API | |
| TC-RBAC-173 | Dispatch Operator | Dispatch Operator cannot GET /reports/samples | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/samples` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-174 | Dispatch Operator | Dispatch Operator cannot GET /reports/ecommerce | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/ecommerce` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-175 | Dispatch Operator | Dispatch Operator cannot GET /reports/daily-activity | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/daily-activity` with `dispatch_token` | HTTP 403 | API | |
| TC-RBAC-176 | Warehouse Operator | Warehouse Operator CAN GET /inventory/dashboard | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/inventory/dashboard` with `warehouse_token` | HTTP 200; dashboard data returned | API | inventory.routes.ts has only `authenticate`, no `authorize` |
| TC-RBAC-177 | Dispatch Operator | Dispatch Operator CAN GET /inventory/stock/hierarchy | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/inventory/stock/hierarchy` with `dispatch_token` | HTTP 200; hierarchy data returned | API | |
| TC-RBAC-178 | Warehouse Operator | Warehouse Operator cannot GET /inventory/transactions | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/inventory/transactions` with `warehouse_token` | HTTP 200 (no role gate on inventory routes) — **note: if requirement says WH cannot see transactions, this is a code-vs-doc discrepancy; current code has no authorize() on /transactions** | API | **Discrepancy flag:** README matrix shows Warehouse Operator denied "Audit log / inventory transactions" but inventory.routes.ts has no authorize() — only authenticate(). All roles can access. Raise with dev. |
