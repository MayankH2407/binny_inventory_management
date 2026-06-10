# Phase 40 — Backend API: Auth, Users, Roles & Permissions

**Module codes:** `API-AUTH`, `API-USR`, `API-ROLE`
**API base:** `http://localhost:5000/api/v1`
**authored 2026-06-09 (Track B)**

> **Ground truth verified against:**
> `backend/src/routes/auth.routes.ts`, `backend/src/routes/user.routes.ts`, `backend/src/routes/role.routes.ts`, `backend/src/routes/permission.routes.ts`, `backend/src/controllers/auth.controller.ts`, `backend/src/controllers/user.controller.ts`, `backend/src/controllers/role.controller.ts`, `backend/src/services/auth.service.ts`, `backend/src/services/user.service.ts`, `backend/src/services/role.service.ts`, `backend/src/middleware/auth.middleware.ts`, `backend/src/middleware/rbac.middleware.ts`, `backend/src/models/schemas/auth.schema.ts`, `backend/src/models/schemas/user.schema.ts`, `backend/src/models/schemas/role.schema.ts`, `backend/src/config/permissions.ts`, `backend/src/config/constants.ts`, `backend/seeds/001_roles.ts`.

---

## RBAC Summary (source of truth for this phase)

**Token transport:** `authenticate` middleware reads `accessToken` from `req.cookies.accessToken` first, then falls back to `Authorization: Bearer <token>` header. Both methods are tested.

**Admin super-admin bypass:** `authorizePermission` short-circuits at `role_name === 'Admin'` — no `role_permissions` row is needed.

**401 vs 403 distinction:**
- **401** — no token / invalid JWT / expired access token → `UnauthorizedError`
- **403** — valid token, but permission check fails → `ForbiddenError`

**Rate limit (auth endpoints):** `AUTH_WINDOW_MS = 15 min`, `AUTH_MAX_REQUESTS = 50 000` (set very high in constants.ts; effectively non-blocking for normal testing but the middleware is present and headers are returned).

**Access token expiry:** `JWT_EXPIRY` env var (default 3600s = 1h from auth.controller `ACCESS_COOKIE_MAX_AGE_MS = 3600000`).
**Refresh token expiry:** 7 days (`REFRESH_COOKIE_MAX_AGE_MS`).
**Refresh token source:** `req.cookies.refreshToken` OR `req.body.refreshToken` (controller line 56).

**Seeded permission counts (from `seeds/001_roles.ts`):**
- Admin: 27 rows in `role_permissions` (but bypassed at runtime; synthesizes 47 at login from PERMISSION_CATALOG)
- Supervisor: 19 permissions
- Warehouse Operator: 9 permissions
- Dispatch Operator: 7 permissions

**`/users/*` RBAC (from `user.routes.ts`):**
- `users:create` → Admin, Supervisor (seeded)
- `users:read` → Admin, Supervisor (seeded)
- `users:update` → Admin, Supervisor (seeded)
- `users:delete` → Admin only (seeded)
- Warehouse Operator and Dispatch Operator have NO `users:*` permissions → 403 on all user endpoints

**`/roles/*` + `GET /permissions` RBAC:** all require `roles:manage` → Admin only; all other roles 403.

**deleteUser is a soft-delete:** sets `is_active = false`; does NOT remove the row.

**Known design limitations (documented as TCs, not bugs):**
1. No self-delete / self-downgrade guard on `PUT /api/v1/users/:id` or `DELETE /api/v1/users/:id`.
2. Supervisor can assign `Admin` role via `PUT /api/v1/users/:id` (role enum allows it; no guard).
3. `PUT /api/v1/users/:id` only accepts role names from the hard-coded `USER_ROLES` enum — custom roles cannot be assigned via API.
4. Inactive user login returns same 401 as wrong password (`WHERE is_active = true` in login query — no distinction).

---

## Table of Contents

- [Section 40.0 — POST /auth/login — happy path per role](#section-400--post-authlogin--happy-path-per-role)
- [Section 40.1 — POST /auth/login — validation and error cases](#section-401--post-authlogin--validation-and-error-cases)
- [Section 40.2 — POST /auth/login — rate-limit headers](#section-402--post-authlogin--rate-limit-headers)
- [Section 40.3 — POST /auth/refresh — happy path and error cases](#section-403--post-authrefresh--happy-path-and-error-cases)
- [Section 40.4 — POST /auth/logout](#section-404--post-authlogout)
- [Section 40.5 — PUT /auth/change-password](#section-405--put-authchange-password)
- [Section 40.6 — GET /auth/profile](#section-406--get-authprofile)
- [Section 40.7 — POST /users — unauthenticated + RBAC denial](#section-407--post-users--unauthenticated--rbac-denial)
- [Section 40.8 — POST /users — happy path and validation](#section-408--post-users--happy-path-and-validation)
- [Section 40.9 — GET /users — unauthenticated + RBAC denial](#section-409--get-users--unauthenticated--rbac-denial)
- [Section 40.10 — GET /users — list, filter, pagination](#section-4010--get-users--list-filter-pagination)
- [Section 40.11 — GET /users/:id — unauthenticated + RBAC denial](#section-4011--get-usersid--unauthenticated--rbac-denial)
- [Section 40.12 — GET /users/:id — happy path and error cases](#section-4012--get-usersid--happy-path-and-error-cases)
- [Section 40.13 — PUT /users/:id — unauthenticated + RBAC denial](#section-4013--put-usersid--unauthenticated--rbac-denial)
- [Section 40.14 — PUT /users/:id — happy path, role assignment, activate/deactivate](#section-4014--put-usersid--happy-path-role-assignment-activatedeactivate)
- [Section 40.15 — PUT /users/:id — guardrail gaps (security TCs)](#section-4015--put-usersid--guardrail-gaps-security-tcs)
- [Section 40.16 — DELETE /users/:id — RBAC denial and unauthenticated](#section-4016--delete-usersid--rbac-denial-and-unauthenticated)
- [Section 40.17 — DELETE /users/:id — happy path and guardrail gap](#section-4017--delete-usersid--happy-path-and-guardrail-gap)
- [Section 40.18 — GET /roles — unauthenticated + RBAC denial](#section-4018--get-roles--unauthenticated--rbac-denial)
- [Section 40.19 — GET /roles — list (Admin happy path)](#section-4019--get-roles--list-admin-happy-path)
- [Section 40.20 — GET /roles/:id](#section-4020--get-rolesid)
- [Section 40.21 — GET /permissions — unauthenticated + RBAC denial](#section-4021--get-permissions--unauthenticated--rbac-denial)
- [Section 40.22 — GET /permissions — catalog (Admin happy path)](#section-4022--get-permissions--catalog-admin-happy-path)
- [Section 40.23 — POST /roles — unauthenticated + RBAC denial](#section-4023--post-roles--unauthenticated--rbac-denial)
- [Section 40.24 — POST /roles — validation (400 / 409)](#section-4024--post-roles--validation-400--409)
- [Section 40.25 — POST /roles — happy path](#section-4025--post-roles--happy-path)
- [Section 40.26 — PATCH /roles/:id — unauthenticated + RBAC denial](#section-4026--patch-rolesid--unauthenticated--rbac-denial)
- [Section 40.27 — PATCH /roles/:id — Admin role protected (403)](#section-4027--patch-rolesid--admin-role-protected-403)
- [Section 40.28 — PATCH /roles/:id — default-role rename blocked (403)](#section-4028--patch-rolesid--default-role-rename-blocked-403)
- [Section 40.29 — PATCH /roles/:id — permission edits happy path](#section-4029--patch-rolesid--permission-edits-happy-path)
- [Section 40.30 — PATCH /roles/:id — validation (400 / 404 / 409)](#section-4030--patch-rolesid--validation-400--404--409)
- [Section 40.31 — DELETE /roles/:id — unauthenticated + RBAC denial](#section-4031--delete-rolesid--unauthenticated--rbac-denial)
- [Section 40.32 — DELETE /roles/:id — default-role delete blocked (403)](#section-4032--delete-rolesid--default-role-delete-blocked-403)
- [Section 40.33 — DELETE /roles/:id — assigned-users blocked (409)](#section-4033--delete-rolesid--assigned-users-blocked-409)
- [Section 40.34 — DELETE /roles/:id — happy path + cascade](#section-4034--delete-rolesid--happy-path--cascade)
- [Section 40.35 — Integration: grant-flow (grant Supervisor samples:* → immediate effect)](#section-4035--integration-grant-flow-grant-supervisor-samples--immediate-effect)
- [Section 40.36 — Integration: revoke permission → immediate denial (no re-login)](#section-4036--integration-revoke-permission--immediate-denial-no-re-login)
- [Section 40.37 — Integration: stage-aware max_stage custom role](#section-4037--integration-stage-aware-max_stage-custom-role)

---

## Section 40.0 — POST /auth/login — happy path per role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-001 | Admin | Login as Admin returns 200 with 47-permission array | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@example.com","password":"<admin_pw>"}` | HTTP 200; `success === true`; `data.user.role === "Admin"`; `data.user.permissions` is array of length 47; `data.accessToken` is a JWT string; response sets `Set-Cookie` for `accessToken` (httpOnly) and `refreshToken` (httpOnly); `data.user` contains `id`, `email`, `name`, `role`, `permissions` | API | Admin permissions synthesized from `PERMISSION_CATALOG` in `fetchPermissionsForUser`; all 47 have `max_stage === null`; realized by: `16-rbac-auth.spec.ts` (admin login fixture) |
| TC-API-AUTH-002 | Supervisor | Login as Supervisor returns 200 with 19-permission array | P0 | 1. `POST /api/v1/auth/login` body with Supervisor credentials | HTTP 200; `data.user.role === "Supervisor"`; `data.user.permissions.length === 19`; permission strings match seed list (users:create/read/update, products:read/create/update, child_boxes:create/read/update, cartons:create/read/update/close/reopen, packing:pack/unpack, dispatch:read, reports:view_all, reports:export) | API | Realized by: `16-rbac-auth.spec.ts` fixture; exact 19 from `seeds/001_roles.ts` |
| TC-API-AUTH-003 | Warehouse Operator | Login as Warehouse Operator returns 200 with 9-permission array | P0 | 1. `POST /api/v1/auth/login` body with Warehouse Operator credentials | HTTP 200; `data.user.role === "Warehouse Operator"`; `data.user.permissions.length === 9`; permission strings: products:read, child_boxes:create/read, cartons:create/read/close, packing:pack/unpack, reports:view_own | API | Realized by: `16-rbac-auth.spec.ts` fixture |
| TC-API-AUTH-004 | Dispatch Operator | Login as Dispatch Operator returns 200 with 7-permission array | P0 | 1. `POST /api/v1/auth/login` body with Dispatch Operator credentials | HTTP 200; `data.user.role === "Dispatch Operator"`; `data.user.permissions.length === 7`; permission strings: products:read, child_boxes:read, cartons:read, dispatch:create/read/update, reports:view_dispatch | API | Realized by: `16-rbac-auth.spec.ts` fixture |
| TC-API-AUTH-005 | Admin | Login response permissions array has correct shape | P0 | 1. Login as Admin per TC-API-AUTH-001 2. Inspect `data.user.permissions` | Each element is `{ permission: "<module>:<action>", max_stage: null }`; no element has `max_stage` non-null (seeded with NULL); all 47 strings match `<module_key>:<action_key>` pattern from PERMISSION_CATALOG | API | Validates `fetchPermissionsForUser` output shape; AUTOMATION GAP — add to `16-rbac-auth.spec.ts` |
| TC-API-AUTH-006 | Admin | Login updates last_login_at for the user | P1 | 1. Login as Admin 2. `GET /api/v1/auth/profile` 3. Check `last_login_at` | `profile.last_login_at` is a recent ISO timestamp (within a few seconds of login) | Integration | `auth.service.ts:78` runs `UPDATE users SET last_login_at = NOW()`; AUTOMATION GAP |
| TC-API-AUTH-007 | Admin | Login via Bearer header (no cookie) also returns 200 | P1 | 1. Login via POST 2. Extract `accessToken` from response body 3. `GET /api/v1/auth/profile` using `Authorization: Bearer <token>` header (not cookie) | HTTP 200; profile returned; validates Bearer-header fallback in `extractToken` | API | `auth.middleware.ts` checks cookie first, then `Authorization: Bearer`; AUTOMATION GAP |
| TC-API-AUTH-008 | Admin | Login creates an audit log entry | P1 | 1. Login as Admin 2. Check audit_logs table (or via future audit endpoint) for `action === "LOGIN"` and `entity_type === "user"` | Audit log row with `user_id` = admin user ID, `action = "LOGIN"` exists; `ip_address` and `user_agent` are populated | Integration | `auth.service.ts:83`; AUTOMATION GAP (audit:read endpoint 404s per Track A findings — must query DB directly) |

---

## Section 40.1 — POST /auth/login — validation and error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-010 | Unauthenticated | Login with wrong password returns 401 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@example.com","password":"wrongpassword"}` | HTTP 401; `success === false`; message = "Invalid email or password" | API | Same error regardless of whether email exists (no username enumeration); realized by: `16-rbac-auth.spec.ts` |
| TC-API-AUTH-011 | Unauthenticated | Login with unknown email returns 401 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"nobody@example.com","password":"anypassword"}` | HTTP 401; `success === false`; message = "Invalid email or password" (same message as wrong password — no enumeration) | API | Login query: `WHERE u.email = $1 AND u.is_active = true` returns 0 rows; AUTOMATION GAP |
| TC-API-AUTH-012 | Unauthenticated | Login as inactive user returns 401 | P0 | 1. Create a user then soft-delete (set `is_active = false`) 2. `POST /api/v1/auth/login` with that user's credentials | HTTP 401; `success === false`; message = "Invalid email or password" (no distinction from unknown user — is_active filter applied in query before password check) | API | ⚠️ Known behavior: inactive user returns same 401 as wrong pw; AUTOMATION GAP |
| TC-API-AUTH-013 | Unauthenticated | Login with missing email field returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"password":"somepassword"}` | HTTP 400; Zod validation error; body contains error for missing/invalid `email` field | API | `loginSchema` requires `email` as valid email string; AUTOMATION GAP |
| TC-API-AUTH-014 | Unauthenticated | Login with missing password field returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@example.com"}` | HTTP 400; Zod validation error; body contains error for missing `password` field | API | AUTOMATION GAP |
| TC-API-AUTH-015 | Unauthenticated | Login with empty body returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{}` | HTTP 400; Zod validation errors for both `email` and `password` | API | AUTOMATION GAP |
| TC-API-AUTH-016 | Unauthenticated | Login with invalid email format returns 400 | P1 | 1. `POST /api/v1/auth/login` body `{"email":"not-an-email","password":"password123"}` | HTTP 400; Zod error; message contains "Must be a valid email address" | API | `loginSchema.email` — `.email()` validator; AUTOMATION GAP |
| TC-API-AUTH-017 | Unauthenticated | Login with password shorter than 6 characters returns 400 | P1 | 1. `POST /api/v1/auth/login` body `{"email":"admin@example.com","password":"abc"}` | HTTP 400; Zod error; message contains "Password must be at least 6 characters" | API | Login schema min is 6 (lower than createUser schema min of 8); AUTOMATION GAP |
| TC-API-AUTH-018 | Unauthenticated | Login with email exceeding 255 characters returns 400 | P2 | 1. `POST /api/v1/auth/login` body with email = 256-char string | HTTP 400; Zod error for email max length | API | AUTOMATION GAP |
| TC-API-AUTH-019 | Unauthenticated | Login with password exceeding 128 characters returns 400 | P2 | 1. `POST /api/v1/auth/login` body with password = 129-char string | HTTP 400; Zod error for password max length | API | AUTOMATION GAP |

---

## Section 40.2 — POST /auth/login — rate-limit headers

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-020 | Unauthenticated | Login response includes rate-limit headers | P1 | 1. `POST /api/v1/auth/login` (valid or invalid, any response) | Response headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; values are integers; `X-RateLimit-Remaining < X-RateLimit-Limit` after first call | API | `rateLimiter` middleware sets headers on every response; current limit is 50 000/15 min (very permissive); AUTOMATION GAP — add header assertions to `16-rbac-auth.spec.ts` |
| TC-API-AUTH-021 | Unauthenticated | Exceeding rate limit returns 429 with Retry-After header | P1 | 1. Mock or configure `AUTH_MAX_REQUESTS = 2` in test environment 2. Send 3 rapid `POST /api/v1/auth/login` requests | Third request returns HTTP 429; body message = "Too many authentication attempts, please try again later"; `Retry-After` header present | API | `TooManyRequestsError` thrown; test requires env override or integration harness; AUTOMATION GAP |

---

## Section 40.3 — POST /auth/refresh — happy path and error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-030 | Admin | Refresh with valid refresh token returns new token pair | P0 | 1. Login as Admin → capture `refreshToken` from cookie or body 2. `POST /api/v1/auth/refresh` sending `refreshToken` as cookie OR body field `{"refreshToken":"<token>"}` | HTTP 200; `success === true`; `data.accessToken` is a new JWT string (different from original); response sets new `Set-Cookie` for `accessToken` and `refreshToken` | API | Controller reads `req.cookies.refreshToken || req.body.refreshToken`; realized by: `16-rbac-auth.spec.ts` |
| TC-API-AUTH-031 | Supervisor | Supervisor refresh with valid token returns new access token | P0 | 1. Login as Supervisor → capture `refreshToken` 2. `POST /api/v1/auth/refresh` with `refreshToken` | HTTP 200; new `accessToken` issued; token payload contains Supervisor's `userId` and `roleId` | API | AUTOMATION GAP |
| TC-API-AUTH-032 | Warehouse Operator | Warehouse Operator refresh returns new access token | P0 | 1. Login as Warehouse Operator → capture `refreshToken` 2. `POST /api/v1/auth/refresh` | HTTP 200; new access token issued | API | AUTOMATION GAP |
| TC-API-AUTH-033 | Dispatch Operator | Dispatch Operator refresh returns new access token | P0 | 1. Login as Dispatch Operator → capture `refreshToken` 2. `POST /api/v1/auth/refresh` | HTTP 200; new access token issued | API | AUTOMATION GAP |
| TC-API-AUTH-034 | Unauthenticated | Refresh with missing refresh token returns 401 | P0 | 1. `POST /api/v1/auth/refresh` with no cookie and no body `refreshToken` | HTTP 401; `success === false`; message = "Refresh token is required" | API | Controller line 57-60: explicit null check; AUTOMATION GAP |
| TC-API-AUTH-035 | Unauthenticated | Refresh with expired refresh token returns 401 | P0 | 1. Craft or wait for an expired refresh token 2. `POST /api/v1/auth/refresh` with expired token | HTTP 401; message = "Refresh token has expired, please log in again" | API | `jwt.TokenExpiredError` path in `refreshAccessToken`; AUTOMATION GAP |
| TC-API-AUTH-036 | Unauthenticated | Refresh with invalid/tampered refresh token returns 401 | P0 | 1. `POST /api/v1/auth/refresh` body `{"refreshToken":"notavalidjwt"}` | HTTP 401; message = "Invalid refresh token" | API | `jwt.JsonWebTokenError` path; AUTOMATION GAP |
| TC-API-AUTH-037 | Admin | Refresh for inactive user returns 401 | P1 | 1. Login as a test user, capture `refreshToken` 2. Admin soft-deletes that user (`DELETE /api/v1/users/:id`) 3. Attempt `POST /api/v1/auth/refresh` with captured token | HTTP 401; message = "User not found or inactive" | API | `refreshAccessToken` queries `WHERE id = $1 AND is_active = true`; AUTOMATION GAP |
| TC-API-AUTH-038 | Admin | Refresh with body field (not cookie) works | P1 | 1. Login as Admin (no cookie client) 2. `POST /api/v1/auth/refresh` body `{"refreshToken":"<valid_refresh_token>"}` (no cookie) | HTTP 200; new tokens returned (controller accepts `req.body.refreshToken`) | API | Validates the body-fallback path; AUTOMATION GAP |
| TC-API-AUTH-039 | Admin | Refresh response includes both new accessToken (body) and cookies | P1 | 1. Login as Admin 2. `POST /api/v1/auth/refresh` | Response body `data.accessToken` is set; `Set-Cookie` headers contain `accessToken` and `refreshToken`; cookies have `httpOnly` flag | API | Token rotation (new refresh token issued on each refresh); AUTOMATION GAP |

---

## Section 40.4 — POST /auth/logout

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-040 | Unauthenticated | Logout without token returns 401 | P0 | 1. `POST /api/v1/auth/logout` with no `Authorization` header and no cookie | HTTP 401; `success === false`; message = "Authentication token is required" | API | `/auth/logout` requires `authenticate`; AUTOMATION GAP |
| TC-API-AUTH-041 | Admin | Admin logout returns 200 and clears cookies | P0 | 1. Login as Admin 2. `POST /api/v1/auth/logout` with valid `accessToken` cookie | HTTP 200; `success === true`; message = "Logged out successfully"; response `Set-Cookie` headers clear `accessToken` and `refreshToken` (empty value / `Max-Age=0`) | API | `res.clearCookie('accessToken')` and `res.clearCookie('refreshToken')`; realized by: `16-rbac-auth.spec.ts` |
| TC-API-AUTH-042 | Supervisor | Supervisor logout clears cookies | P0 | 1. Login as Supervisor 2. `POST /api/v1/auth/logout` with valid token | HTTP 200; cookies cleared | API | AUTOMATION GAP |
| TC-API-AUTH-043 | Warehouse Operator | Warehouse Operator logout returns 200 | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/auth/logout` | HTTP 200 | API | AUTOMATION GAP |
| TC-API-AUTH-044 | Dispatch Operator | Dispatch Operator logout returns 200 | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/auth/logout` | HTTP 200 | API | AUTOMATION GAP |
| TC-API-AUTH-045 | Admin | Access token rejected after logout (cookie cleared) | P1 | 1. Login as Admin 2. Capture `accessToken` 3. `POST /api/v1/auth/logout` (clears cookie server-side) 4. `GET /api/v1/auth/profile` using the now-stale token as `Authorization: Bearer` header | HTTP 200 (token is still valid JWT until expiry — logout is cookie-clear only, no server-side revocation) | API | ⚠️ Known design: JWT is stateless; logout only clears the httpOnly cookie; a token captured via the response body remains valid until expiry; document as security gap; AUTOMATION GAP |
| TC-API-AUTH-046 | Unauthenticated | Logout with expired access token returns 401 | P1 | 1. Craft an expired access JWT 2. `POST /api/v1/auth/logout` with `Authorization: Bearer <expired_token>` | HTTP 401; message = "Token has expired" | API | `jwt.TokenExpiredError` path in `authenticate` middleware; AUTOMATION GAP |

---

## Section 40.5 — PUT /auth/change-password

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-050 | Unauthenticated | Change-password without token returns 401 | P0 | 1. `PUT /api/v1/auth/change-password` body `{"currentPassword":"old","newPassword":"NewPass1"}` with no token | HTTP 401 | API | `authenticate` required; AUTOMATION GAP |
| TC-API-AUTH-051 | Admin | Admin change-password with correct current password succeeds | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"<current>","newPassword":"NewValidPass1"}` | HTTP 200; `success === true`; message = "Password changed successfully"; `data === null`; old password rejected on subsequent login; new password accepted | API | Realized by: `16-rbac-auth.spec.ts`; verifies bcrypt re-hash + audit log |
| TC-API-AUTH-052 | Supervisor | Supervisor change-password succeeds | P0 | 1. Login as Supervisor 2. `PUT /api/v1/auth/change-password` with valid current + new password | HTTP 200 | API | AUTOMATION GAP |
| TC-API-AUTH-053 | Warehouse Operator | Warehouse Operator change-password succeeds | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/auth/change-password` with valid credentials | HTTP 200 | API | AUTOMATION GAP |
| TC-API-AUTH-054 | Dispatch Operator | Dispatch Operator change-password succeeds | P0 | 1. Login as Dispatch Operator 2. `PUT /api/v1/auth/change-password` with valid credentials | HTTP 200 | API | AUTOMATION GAP |
| TC-API-AUTH-055 | Admin | Change-password with wrong current password returns 401 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"wrongcurrent","newPassword":"NewValidPass1"}` | HTTP 401; message = "Current password is incorrect" | API | `authService.changePassword` bcrypt compare fails; AUTOMATION GAP |
| TC-API-AUTH-056 | Admin | Change-password with new password shorter than 8 characters returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"<valid>","newPassword":"Short1"}` | HTTP 400; Zod error; message = "New password must be at least 8 characters" | API | `changePasswordSchema.newPassword.min(8)`; AUTOMATION GAP |
| TC-API-AUTH-057 | Admin | Change-password with new password missing uppercase returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"<valid>","newPassword":"alllower1"}` | HTTP 400; Zod error; message contains "Password must contain at least one uppercase letter, one lowercase letter, and one number" | API | Regex `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/`; AUTOMATION GAP |
| TC-API-AUTH-058 | Admin | Change-password with new password missing a digit returns 400 | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"<valid>","newPassword":"NoDigitHere"}` | HTTP 400; Zod regex error | API | AUTOMATION GAP |
| TC-API-AUTH-059 | Admin | Change-password with missing currentPassword returns 400 | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"newPassword":"NewValidPass1"}` | HTTP 400; Zod error; `currentPassword` is required (min(1)) | API | `changePasswordSchema.currentPassword.min(1)`; AUTOMATION GAP |
| TC-API-AUTH-060 | Admin | Change-password with new password exceeding 128 characters returns 400 | P2 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body with `newPassword` = 129-char string | HTTP 400; Zod max length error | API | AUTOMATION GAP |
| TC-API-AUTH-061 | Admin | Change-password creates an audit log entry | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` successfully 3. Check audit_logs | Audit row with `action = "CHANGE_PASSWORD"`, `entity_type = "user"`, `entity_id` = admin user ID exists | Integration | `auth.service.ts:167`; AUTOMATION GAP |

---

## Section 40.6 — GET /auth/profile

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-AUTH-070 | Unauthenticated | GET /auth/profile without token returns 401 | P0 | 1. `GET /api/v1/auth/profile` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-AUTH-071 | Admin | Admin GET /auth/profile returns user with 47 permissions | P0 | 1. Login as Admin 2. `GET /api/v1/auth/profile` | HTTP 200; `success === true`; `data.role === "Admin"`; `data.permissions.length === 47`; `data` contains `id`, `email`, `name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at`, `permissions`; `data.permissions` are same shape as login response | API | `getProfile` calls `fetchPermissionsForUser` — same Admin bypass; realized by: `16-rbac-auth.spec.ts` |
| TC-API-AUTH-072 | Supervisor | Supervisor GET /auth/profile returns 19 permissions | P0 | 1. Login as Supervisor 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Supervisor"`; `data.permissions.length === 19` | API | AUTOMATION GAP |
| TC-API-AUTH-073 | Warehouse Operator | Warehouse Operator GET /auth/profile returns 9 permissions | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Warehouse Operator"`; `data.permissions.length === 9` | API | AUTOMATION GAP |
| TC-API-AUTH-074 | Dispatch Operator | Dispatch Operator GET /auth/profile returns 7 permissions | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Dispatch Operator"`; `data.permissions.length === 7` | API | AUTOMATION GAP |
| TC-API-AUTH-075 | Admin | Profile does not include password_hash | P0 | 1. Login as Admin 2. `GET /api/v1/auth/profile` | `data` does NOT contain `password_hash` or `password` field | API | SELECT projection in `getProfile` excludes password_hash; AUTOMATION GAP |
| TC-API-AUTH-076 | Admin | Profile permissions match login permissions exactly | P1 | 1. Login as Admin → capture `login_permissions` from login response 2. `GET /api/v1/auth/profile` → capture `profile_permissions` | `profile_permissions` and `login_permissions` are equivalent sets (same 47 entries); both use `fetchPermissionsForUser` | API | Regression for consistency between login and profile permission synthesis; AUTOMATION GAP |
| TC-API-AUTH-077 | Admin | Profile is_active is true for active user | P1 | 1. Login as Admin 2. `GET /api/v1/auth/profile` | `data.is_active === true` | API | AUTOMATION GAP |

---

## Section 40.7 — POST /users — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-001 | Unauthenticated | POST /users without token returns 401 | P0 | 1. `POST /api/v1/users` body `{"email":"new@test.com","password":"NewPass1!","name":"Test","role":"Supervisor"}` with no token | HTTP 401; `success === false`; message = "Authentication token is required" | API | `router.use(authenticate)` applied at router level; AUTOMATION GAP — add to `25-users-admin.spec.ts` |
| TC-API-USR-002 | Warehouse Operator | Warehouse Operator POST /users returns 403 | P0 | 1. Login as Warehouse Operator → `wh_token` 2. `POST /api/v1/users` with valid user body | HTTP 403; `success === false`; message contains "Required permission: users:create" | API | WH-Op has no `users:*` permissions; AUTOMATION GAP |
| TC-API-USR-003 | Dispatch Operator | Dispatch Operator POST /users returns 403 | P0 | 1. Login as Dispatch Operator → `dp_token` 2. `POST /api/v1/users` with valid user body | HTTP 403; message contains "Required permission: users:create" | API | AUTOMATION GAP |

---

## Section 40.8 — POST /users — happy path and validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-010 | Admin | Admin creates new Supervisor user successfully | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"testsup-${TS}@example.com","password":"ValidPass1","name":"Test Supervisor","role":"Supervisor"}` | HTTP 201; `success === true`; response `data.id` is UUID; `data.email === "testsup...@example.com"`; `data.name === "Test Supervisor"`; `data.role === "Supervisor"`; `data.is_active === true`; `data` does NOT contain `password_hash` | API | Realized by: `25-users-admin.spec.ts`; USER_SELECT projection; role looked up by name |
| TC-API-USR-011 | Admin | Admin creates Warehouse Operator user | P0 | 1. Login as Admin 2. `POST /api/v1/users` body with `role: "Warehouse Operator"` | HTTP 201; `data.role === "Warehouse Operator"` | API | AUTOMATION GAP |
| TC-API-USR-012 | Admin | Admin creates Dispatch Operator user | P0 | 1. Login as Admin 2. `POST /api/v1/users` body with `role: "Dispatch Operator"` | HTTP 201; `data.role === "Dispatch Operator"` | API | AUTOMATION GAP |
| TC-API-USR-013 | Admin | Admin creates Admin user | P0 | 1. Login as Admin 2. `POST /api/v1/users` body with `role: "Admin"` | HTTP 201; `data.role === "Admin"` | API | USER_ROLES enum includes Admin; AUTOMATION GAP |
| TC-API-USR-014 | Supervisor | Supervisor creates new Warehouse Operator user | P0 | 1. Login as Supervisor 2. `POST /api/v1/users` body with `role: "Warehouse Operator"` | HTTP 201; user created successfully | API | Supervisor has `users:create`; AUTOMATION GAP |
| TC-API-USR-015 | Admin | Create user with duplicate email returns 409 | P0 | 1. Login as Admin 2. Create user with `email: "dup@example.com"` 3. Attempt second `POST /api/v1/users` with same `email` | HTTP 409; `success === false`; message = "Email already exists" | API | `ConflictError` in `userService.createUser`; realized by: `25-users-admin.spec.ts` |
| TC-API-USR-016 | Admin | Create user with invalid email returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"not-an-email","password":"ValidPass1","name":"Test","role":"Supervisor"}` | HTTP 400; Zod validation error; message contains "Invalid email address" | API | `createUserSchema.email` — `.email()` validator; AUTOMATION GAP |
| TC-API-USR-017 | Admin | Create user with password shorter than 8 characters returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/users` body with `password: "Short1"` (7 chars) | HTTP 400; Zod error; message contains "Password must be at least 8 characters" | API | Create user min=8 (higher than login min=6); AUTOMATION GAP |
| TC-API-USR-018 | Admin | Create user with name shorter than 2 characters returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/users` body with `name: "A"` | HTTP 400; Zod error; message contains "Name must be at least 2 characters" | API | AUTOMATION GAP |
| TC-API-USR-019 | Admin | Create user with invalid role value returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/users` body with `role: "Manager"` (not in USER_ROLES enum) | HTTP 400; Zod validation error (enum reject) | API | `z.enum(roleValues)` where `roleValues = Object.values(USER_ROLES)` = ["Admin","Supervisor","Warehouse Operator","Dispatch Operator"]; AUTOMATION GAP |
| TC-API-USR-020 | Admin | Create user with missing required fields returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{}` | HTTP 400; Zod errors for `email`, `password`, `name`, `role` | API | AUTOMATION GAP |
| TC-API-USR-021 | Admin | Create user email is lowercased before storage | P1 | 1. Login as Admin 2. `POST /api/v1/users` body with `email: "TestUser@EXAMPLE.COM"` | `data.email === "testuser@example.com"` (Zod `.toLowerCase()` transform applied) | API | `createUserSchema.email` applies `.trim().toLowerCase()`; AUTOMATION GAP |
| TC-API-USR-022 | Admin | Create user creates audit log entry | P1 | 1. Login as Admin 2. Create a user 3. Verify audit log | Audit row: `action = "CREATE_USER"`, `entity_id = new_user_id`, `new_values.email` = new user email, `new_values.role` = assigned role | Integration | `userService.createUser` calls `createAuditLog`; AUTOMATION GAP |

---

## Section 40.9 — GET /users — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-030 | Unauthenticated | GET /users without token returns 401 | P0 | 1. `GET /api/v1/users` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-USR-031 | Warehouse Operator | Warehouse Operator GET /users returns 403 | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/users` | HTTP 403; message contains "Required permission: users:read" | API | AUTOMATION GAP |
| TC-API-USR-032 | Dispatch Operator | Dispatch Operator GET /users returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/users` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.10 — GET /users — list, filter, pagination

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-040 | Admin | Admin GET /users returns paginated list | P0 | 1. Login as Admin 2. `GET /api/v1/users` | HTTP 200; `success === true`; response follows `sendPaginated` shape: `data` (array of users), `total` (integer), `page`, `limit`; each user object has `id`, `email`, `name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at`; NO `password_hash` | API | Realized by: `25-users-admin.spec.ts` |
| TC-API-USR-041 | Supervisor | Supervisor GET /users returns 200 | P0 | 1. Login as Supervisor 2. `GET /api/v1/users` | HTTP 200; list returned | API | Supervisor has `users:read`; AUTOMATION GAP |
| TC-API-USR-042 | Admin | GET /users default pagination is page=1, limit=25 | P1 | 1. Login as Admin 2. `GET /api/v1/users` (no query params) | Response `page === 1`, `limit === 25` (controller default values) | API | AUTOMATION GAP |
| TC-API-USR-043 | Admin | GET /users with role filter returns only matching roles | P1 | 1. Login as Admin 2. `GET /api/v1/users?role=Supervisor` | All returned users have `role === "Supervisor"` | API | `userService.getUsers` filter: `r.name = $1`; AUTOMATION GAP |
| TC-API-USR-044 | Admin | GET /users with search filter matches name and email | P1 | 1. Login as Admin 2. `GET /api/v1/users?search=admin` | Returned users have `name` or `email` containing "admin" (case-insensitive ILIKE); AUTOMATION GAP |  API | `(u.name ILIKE $N OR u.email ILIKE $N)` with `%search%`; AUTOMATION GAP |
| TC-API-USR-045 | Admin | GET /users with is_active=false returns only inactive users | P1 | 1. Soft-delete a user 2. Login as Admin 3. `GET /api/v1/users?is_active=false` | All returned users have `is_active === false`; includes the soft-deleted user | API | AUTOMATION GAP |
| TC-API-USR-046 | Admin | GET /users ordered by created_at descending | P2 | 1. Login as Admin 2. Create 2 users in sequence 3. `GET /api/v1/users` | Response `data` is ordered by `created_at DESC` (newest first) | API | SQL `ORDER BY u.created_at DESC`; AUTOMATION GAP |
| TC-API-USR-047 | Admin | GET /users with invalid role enum returns 400 | P1 | 1. Login as Admin 2. `GET /api/v1/users?role=InvalidRole` | HTTP 400; Zod validation error from `userListQuerySchema.role` enum | API | `z.enum(roleValues).optional()` in query schema; AUTOMATION GAP |

---

## Section 40.11 — GET /users/:id — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-050 | Unauthenticated | GET /users/:id without token returns 401 | P0 | 1. `GET /api/v1/users/00000000-0000-0000-0000-000000000001` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-USR-051 | Warehouse Operator | Warehouse Operator GET /users/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/users/{some_uuid}` | HTTP 403; "Required permission: users:read" | API | AUTOMATION GAP |
| TC-API-USR-052 | Dispatch Operator | Dispatch Operator GET /users/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/users/{some_uuid}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.12 — GET /users/:id — happy path and error cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-060 | Admin | Admin GET /users/:id returns user detail | P0 | 1. Login as Admin 2. Create a user → capture `user_id` 3. `GET /api/v1/users/{user_id}` | HTTP 200; `data.id === user_id`; all expected fields present; no `password_hash` | API | Realized by: `25-users-admin.spec.ts` |
| TC-API-USR-061 | Supervisor | Supervisor GET /users/:id returns 200 | P0 | 1. Login as Supervisor 2. `GET /api/v1/users/{existing_user_id}` | HTTP 200; user detail returned | API | AUTOMATION GAP |
| TC-API-USR-062 | Admin | GET /users/:id with non-existent UUID returns 404 | P0 | 1. Login as Admin 2. `GET /api/v1/users/00000000-0000-0000-0000-000000000099` | HTTP 404; message = "User not found" | API | `NotFoundError` in `userService.getUserById`; AUTOMATION GAP |
| TC-API-USR-063 | Admin | GET /users/:id with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `GET /api/v1/users/not-a-uuid` | HTTP 400; Zod validation error; message contains "Invalid user ID format" | API | `userIdParamSchema` validates UUID; AUTOMATION GAP |
| TC-API-USR-064 | Admin | GET /users/:id includes role name not role_id | P1 | 1. Login as Admin 2. `GET /api/v1/users/{id}` | `data.role` is role name string (e.g. "Supervisor"), not a UUID; `USER_SELECT` uses `r.name as role` JOIN | API | AUTOMATION GAP |

---

## Section 40.13 — PUT /users/:id — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-070 | Unauthenticated | PUT /users/:id without token returns 401 | P0 | 1. `PUT /api/v1/users/{some_uuid}` body `{"name":"Updated"}` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-USR-071 | Warehouse Operator | Warehouse Operator PUT /users/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/users/{some_uuid}` body `{"name":"Updated"}` | HTTP 403; "Required permission: users:update" | API | AUTOMATION GAP |
| TC-API-USR-072 | Dispatch Operator | Dispatch Operator PUT /users/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `PUT /api/v1/users/{some_uuid}` body `{"name":"Updated"}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.14 — PUT /users/:id — happy path, role assignment, activate/deactivate

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-080 | Admin | Admin updates user name | P0 | 1. Login as Admin 2. Create user 3. `PUT /api/v1/users/{id}` body `{"name":"Updated Name"}` | HTTP 200; `data.name === "Updated Name"`; other fields unchanged | API | Realized by: `25-users-admin.spec.ts` |
| TC-API-USR-081 | Admin | Admin updates user email | P0 | 1. Login as Admin 2. `PUT /api/v1/users/{id}` body `{"email":"newemail@example.com"}` | HTTP 200; `data.email === "newemail@example.com"` | API | Email lowercased via Zod `.toLowerCase()`; AUTOMATION GAP |
| TC-API-USR-082 | Admin | Admin changes user role from Warehouse Operator to Supervisor | P0 | 1. Login as Admin 2. Create Warehouse Operator user 3. `PUT /api/v1/users/{id}` body `{"role":"Supervisor"}` | HTTP 200; `data.role === "Supervisor"`; `role_id` updated in DB (role looked up by name in service) | API | AUTOMATION GAP |
| TC-API-USR-083 | Admin | Admin deactivates user via PUT is_active=false | P0 | 1. Login as Admin 2. `PUT /api/v1/users/{id}` body `{"is_active":false}` | HTTP 200; `data.is_active === false`; user can no longer login (login query filters `is_active = true`) | Integration | Activate/deactivate via PUT (not DELETE); AUTOMATION GAP |
| TC-API-USR-084 | Admin | Admin reactivates user via PUT is_active=true | P0 | 1. Login as Admin 2. Deactivate a user 3. `PUT /api/v1/users/{id}` body `{"is_active":true}` 4. Attempt login as reactivated user | HTTP 200; `data.is_active === true`; login succeeds again | Integration | AUTOMATION GAP |
| TC-API-USR-085 | Supervisor | Supervisor updates user name | P0 | 1. Login as Supervisor 2. Create a user (as Supervisor or Admin) 3. `PUT /api/v1/users/{id}` body `{"name":"Sup Updated"}` | HTTP 200; name updated | API | Supervisor has `users:update`; AUTOMATION GAP |
| TC-API-USR-086 | Admin | Update user with duplicate email returns 409 | P0 | 1. Login as Admin 2. Create two users (user_A, user_B) 3. `PUT /api/v1/users/{user_A_id}` body `{"email": user_B.email}` | HTTP 409; message = "Email already in use" | API | `ConflictError` from email uniqueness check in `updateUser`; AUTOMATION GAP |
| TC-API-USR-087 | Admin | Update user with non-existent role returns 404 | P1 | 1. Login as Admin 2. `PUT /api/v1/users/{id}` body `{"role":"NonExistentRole"}` | HTTP 400 (Zod enum rejection before service) OR HTTP 404 if enum passes — Zod enum check for USER_ROLES fires first; expected: HTTP 400 | API | `updateUserSchema.role` is also `z.enum(roleValues).optional()` — Zod fires before service; AUTOMATION GAP |
| TC-API-USR-088 | Admin | Update non-existent user returns 404 | P0 | 1. Login as Admin 2. `PUT /api/v1/users/00000000-0000-0000-0000-000000000099` body `{"name":"X"}` | HTTP 404; message = "User not found" | API | `userService.updateUser` checks existing first; AUTOMATION GAP |
| TC-API-USR-089 | Admin | Update with empty body returns 200 (no-op) | P2 | 1. Login as Admin 2. `PUT /api/v1/users/{id}` body `{}` | HTTP 200; user data unchanged (service returns `getUserById(id)` when `fields.length === 0`) | API | Service edge case: empty update returns existing user; AUTOMATION GAP |
| TC-API-USR-090 | Admin | Update creates audit log entry | P1 | 1. Login as Admin 2. `PUT /api/v1/users/{id}` body `{"name":"Audit Test"}` 3. Check audit log | Audit row: `action = "UPDATE_USER"`, `old_values.name` = original name, `new_values.name` = "Audit Test" | Integration | `userService.updateUser` calls `createAuditLog` with old and new values; AUTOMATION GAP |

---

## Section 40.15 — PUT /users/:id — guardrail gaps (security TCs)

> ⚠️ These TCs document **known missing guards** — the behavior described is the actual API behavior, not a desired behavior. They are documented here as security risk TCs, not bugs to fix in this phase.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-100 | Admin | Admin can self-delete (no guard) — SECURITY RISK | P1 | 1. Login as Admin (admin_A) 2. `DELETE /api/v1/users/{admin_A_id}` using admin_A's own token | HTTP 200; admin_A is soft-deleted; admin_A's token still valid until expiry but login is now rejected | API | ⚠️ SECURITY GAP: no self-delete guard; `deleteUser` does not check `req.user.userId !== id`; recommend adding guard; AUTOMATION GAP |
| TC-API-USR-101 | Admin | Admin can downgrade own role to Dispatch Operator (no guard) — SECURITY RISK | P1 | 1. Login as Admin (admin_A) 2. `PUT /api/v1/users/{admin_A_id}` body `{"role":"Dispatch Operator"}` | HTTP 200; admin_A's role changed to Dispatch Operator; subsequent requests with admin_A's existing token still use old roleId in JWT until re-login | API | ⚠️ SECURITY GAP: no self-role-downgrade guard; recommend adding check `req.user.userId !== id` or `newRole !== 'Admin' when currentUser === target`; AUTOMATION GAP |
| TC-API-USR-102 | Supervisor | Supervisor can assign Admin role to any user — SECURITY GAP | P1 | 1. Login as Supervisor 2. Create a Warehouse Operator user 3. `PUT /api/v1/users/{wh_user_id}` body `{"role":"Admin"}` | HTTP 200; user role changed to Admin (Supervisor has `users:update`; no role-escalation guard) | API | ⚠️ SECURITY GAP: Supervisor can grant Admin role because `users:update` has no role-level restriction on target role assignment; recommend guard: only Admin can assign Admin role; AUTOMATION GAP |
| TC-API-USR-103 | Admin | Admin can assign custom role to user — BLOCKED (Zod enum) | P2 | 1. Login as Admin 2. Create custom role via `POST /api/v1/roles` (e.g. "CustomRole") 3. `PUT /api/v1/users/{id}` body `{"role":"CustomRole"}` | HTTP 400 (Zod enum rejects "CustomRole" — only the 4 seeded role names are in the enum); custom roles created via Role Manager CANNOT be assigned via user update | API | ⚠️ Known design limitation: `updateUserSchema.role = z.enum(roleValues)` is hardcoded to `Object.values(USER_ROLES)` at import time; AUTOMATION GAP |

---

## Section 40.16 — DELETE /users/:id — RBAC denial and unauthenticated

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-110 | Unauthenticated | DELETE /users/:id without token returns 401 | P0 | 1. `DELETE /api/v1/users/{some_uuid}` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-USR-111 | Supervisor | Supervisor DELETE /users/:id returns 403 | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/users/{some_uuid}` | HTTP 403; "Required permission: users:delete" | API | Supervisor has no `users:delete`; AUTOMATION GAP |
| TC-API-USR-112 | Warehouse Operator | Warehouse Operator DELETE /users/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/users/{some_uuid}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-USR-113 | Dispatch Operator | Dispatch Operator DELETE /users/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/users/{some_uuid}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.17 — DELETE /users/:id — happy path and guardrail gap

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-USR-120 | Admin | Admin soft-deletes a user successfully | P0 | 1. Login as Admin 2. Create a test user → `test_user_id` 3. `DELETE /api/v1/users/{test_user_id}` | HTTP 200; message = "User deactivated successfully"; `data === null`; subsequent `GET /api/v1/users/{test_user_id}` returns `is_active === false` (row still exists); `POST /api/v1/auth/login` as that user returns 401 | Integration | Soft-delete: `UPDATE users SET is_active = false`; realized by: `25-users-admin.spec.ts` |
| TC-API-USR-121 | Admin | DELETE non-existent user returns 404 | P0 | 1. Login as Admin 2. `DELETE /api/v1/users/00000000-0000-0000-0000-000000000099` | HTTP 404; message = "User not found" | API | `userService.deleteUser` checks `existing.rows.length === 0`; AUTOMATION GAP |
| TC-API-USR-122 | Admin | DELETE with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `DELETE /api/v1/users/not-a-uuid` | HTTP 400; Zod validation error for `id` parameter | API | AUTOMATION GAP |
| TC-API-USR-123 | Admin | DELETE creates audit log entry | P1 | 1. Login as Admin 2. `DELETE /api/v1/users/{id}` 3. Check audit log | Audit row: `action = "DELETE_USER"`, `entity_id = deleted_user_id` | Integration | `userService.deleteUser` calls `createAuditLog`; AUTOMATION GAP |
| TC-API-USR-124 | Admin | Admin self-delete — no guard (security risk, documented) | P1 | Per TC-API-USR-100 (covered in Section 40.15) | See TC-API-USR-100 | API | Intentional duplicate reference — Section 40.15 covers both PUT and DELETE self-operation gaps together |

---

## Section 40.18 — GET /roles — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-001 | Unauthenticated | GET /roles without token returns 401 | P0 | 1. `GET /api/v1/roles` with no token | HTTP 401; `success === false` | API | `router.use(authenticate)` + `router.use(authorizePermission('roles:manage'))` at router level; AUTOMATION GAP — add to `31-role-manager.spec.ts` |
| TC-API-ROLE-002 | Supervisor | Supervisor GET /roles returns 403 | P0 | 1. Login as Supervisor 2. `GET /api/v1/roles` | HTTP 403; message contains "Required permission: roles:manage" | API | AUTOMATION GAP |
| TC-API-ROLE-003 | Warehouse Operator | Warehouse Operator GET /roles returns 403 | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/roles` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-004 | Dispatch Operator | Dispatch Operator GET /roles returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/roles` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.19 — GET /roles — list (Admin happy path)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-010 | Admin | GET /roles returns all 4 seeded roles with correct permission counts | P0 | 1. Login as Admin 2. `GET /api/v1/roles` | HTTP 200; `data.roles` array has ≥ 4 entries; Admin role (27 rows in role_permissions), Supervisor (19), Warehouse Operator (9), Dispatch Operator (7); each role has `id` (UUID), `name`, `permissions` (array of `{permission, max_stage}`), `user_count`, `created_at`, `updated_at` | API | Realized by: `31-role-manager.spec.ts`; note Admin role returns whatever is in role_permissions (27 seed rows), not the synthesized 47 |
| TC-API-ROLE-011 | Admin | GET /roles returns roles ordered alphabetically by name | P1 | 1. Login as Admin 2. `GET /api/v1/roles` | `data.roles` is sorted A-Z by `name` (`ORDER BY r.name` in SQL) | API | AUTOMATION GAP |
| TC-API-ROLE-012 | Admin | Admin role has user_count >= 1 | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find Admin role | `admin_role.user_count >= 1` (the admin user itself) | API | AUTOMATION GAP |
| TC-API-ROLE-013 | Admin | Supervisor role has exactly 19 permissions in roles list | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find Supervisor role | `supervisor.permissions.length === 19`; all `max_stage === null`; permission strings match `seeds/001_roles.ts` Supervisor list | API | AUTOMATION GAP |
| TC-API-ROLE-014 | Admin | Warehouse Operator role has exactly 9 permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` | `wh_role.permissions.length === 9`; keys: products:read, child_boxes:create/read, cartons:create/read/close, packing:pack/unpack, reports:view_own | API | AUTOMATION GAP |
| TC-API-ROLE-015 | Admin | Dispatch Operator role has exactly 7 permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` | `dp_role.permissions.length === 7`; keys: products:read, child_boxes:read, cartons:read, dispatch:create/read/update, reports:view_dispatch | API | AUTOMATION GAP |

---

## Section 40.20 — GET /roles/:id

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-020 | Admin | GET /roles/:id without token returns 401 | P0 | 1. `GET /api/v1/roles/00000000-0000-0000-0000-000000000001` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-ROLE-021 | Supervisor | Supervisor GET /roles/:id returns 403 | P0 | 1. Login as Supervisor 2. `GET /api/v1/roles/{valid_uuid}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-022 | Admin | GET /roles/:id returns role detail for Supervisor | P0 | 1. Login as Admin 2. Resolve Supervisor UUID from GET /roles 3. `GET /api/v1/roles/{sup_id}` | HTTP 200; `data.id === sup_id`; `data.name === "Supervisor"`; `data.permissions.length === 19`; `data.user_count` is integer; `data.created_at` and `data.updated_at` present | API | Realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-023 | Admin | GET /roles/:id with non-existent UUID returns 404 | P0 | 1. Login as Admin 2. `GET /api/v1/roles/00000000-0000-0000-0000-000000000099` | HTTP 404; message = "Role not found" | API | AUTOMATION GAP |
| TC-API-ROLE-024 | Admin | GET /roles/:id with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `GET /api/v1/roles/not-a-uuid` | HTTP 400; Zod error; message contains "Invalid role ID format" | API | `roleIdParamSchema`; AUTOMATION GAP |
| TC-API-ROLE-025 | Admin | GET /roles/:id for Admin role returns role_permissions rows (not synthesized 47) | P2 | 1. Login as Admin 2. Resolve Admin role UUID 3. `GET /api/v1/roles/{admin_id}` | HTTP 200; `data.name === "Admin"`; `data.permissions` reflects whatever is stored in `role_permissions` table (seed inserts 27 rows); runtime bypass does NOT affect the API response | API | Distinction: `getRoleById` reads from `role_permissions` table directly; `fetchPermissionsForUser` synthesizes 47 only at login/profile time; AUTOMATION GAP |

---

## Section 40.21 — GET /permissions — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-030 | Unauthenticated | GET /permissions without token returns 401 | P0 | 1. `GET /api/v1/permissions` with no token | HTTP 401 | API | `authenticate` + `authorizePermission('roles:manage')` in `permission.routes.ts`; AUTOMATION GAP |
| TC-API-ROLE-031 | Supervisor | Supervisor GET /permissions returns 403 | P0 | 1. Login as Supervisor 2. `GET /api/v1/permissions` | HTTP 403; message contains "Required permission: roles:manage" | API | AUTOMATION GAP |
| TC-API-ROLE-032 | Warehouse Operator | Warehouse Operator GET /permissions returns 403 | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/permissions` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-033 | Dispatch Operator | Dispatch Operator GET /permissions returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/permissions` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.22 — GET /permissions — catalog (Admin happy path)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-040 | Admin | GET /permissions returns full catalog with 15 modules | P0 | 1. Login as Admin 2. `GET /api/v1/permissions` | HTTP 200; `data.catalog` is array of 15 modules; module keys: users, roles, products, child_boxes, cartons, packing, dispatch, samples, ecommerce, customers, sections, inventory, reports, audit, settings | API | Realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-041 | Admin | Flattened permission catalog contains exactly 47 unique entries | P0 | 1. Login as Admin 2. `GET /api/v1/permissions` 3. Flatten all `module.actions` to `module.key:action.key` | Exactly 47 unique strings: users(4) + roles(1) + products(4) + child_boxes(4) + cartons(6) + packing(2) + dispatch(3) + samples(4) + ecommerce(4) + customers(4) + sections(4) + inventory(1) + reports(4) + audit(1) + settings(1) = 47 | API | AUTOMATION GAP |
| TC-API-ROLE-042 | Admin | stage_aware permissions have correct stages lists | P1 | 1. Login as Admin 2. `GET /api/v1/permissions` 3. Inspect child_boxes:update, child_boxes:delete, cartons:update, cartons:delete entries | `child_boxes:update` — `stage_aware === true`, `stages = ["GENERATED","FREE","PACKED","SAMPLE","ECOMMERCE","DISPATCHED"]`; `cartons:update` — `stage_aware === true`, `stages = ["CREATED","ACTIVE","CLOSED","DISPATCHED"]`; all other actions have `stage_aware === false` | API | AUTOMATION GAP |
| TC-API-ROLE-043 | Admin | Permission catalog returned as PermissionModule[] with correct shape | P1 | 1. Login as Admin 2. `GET /api/v1/permissions` | Each element of `data.catalog` has `key` (string), `label` (string), `actions` (array of `{key, label, stage_aware, [stages]}`); no extra fields | API | AUTOMATION GAP |

---

## Section 40.23 — POST /roles — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-050 | Unauthenticated | POST /roles without token returns 401 | P0 | 1. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-ROLE-051 | Supervisor | Supervisor POST /roles returns 403 | P0 | 1. Login as Supervisor 2. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-052 | Warehouse Operator | Warehouse Operator POST /roles returns 403 | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-053 | Dispatch Operator | Dispatch Operator POST /roles returns 403 | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.24 — POST /roles — validation (400 / 409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-060 | Admin | Create role with invalid permission key returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"BadPermRole","permissions":[{"permission":"fake:action","max_stage":null}]}` | HTTP 400; message contains "Invalid permission(s): fake:action" and references "Check GET /api/v1/permissions" | API | `validatePermissions()` in `role.service.ts`; AUTOMATION GAP |
| TC-API-ROLE-061 | Admin | Create role with multiple invalid permission keys lists all in error | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body with 2 invalid permission entries | HTTP 400; message contains both invalid keys | API | AUTOMATION GAP |
| TC-API-ROLE-062 | Admin | Create role with duplicate name returns 409 | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"Supervisor","permissions":[]}` | HTTP 409; message contains `Role name "Supervisor" already exists` | API | Realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-063 | Admin | Create role with name shorter than 2 characters returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"A","permissions":[]}` | HTTP 400; Zod error; "Name must be at least 2 characters" | API | AUTOMATION GAP |
| TC-API-ROLE-064 | Admin | Create role with name longer than 50 characters returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body with 51-char `name` | HTTP 400; Zod error; "Name must not exceed 50 characters" | API | AUTOMATION GAP |
| TC-API-ROLE-065 | Admin | Create role with permission in wrong format (no colon) returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body with `{"permission":"nodot"}` in permissions array | HTTP 400; Zod regex error; message contains "module:action" format hint | API | `permissionEntrySchema.permission.regex(/^[a-z_]+:[a-z_]+$/)` fires before service `validatePermissions`; AUTOMATION GAP |
| TC-API-ROLE-066 | Admin | Create role with missing name field returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"permissions":[]}` | HTTP 400; Zod error for missing `name` | API | AUTOMATION GAP |
| TC-API-ROLE-067 | Admin | Create role with name matching existing role case-insensitively is ALLOWED (case-sensitive uniqueness) | P2 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"supervisor","permissions":[]}` | HTTP 201 (lowercase "supervisor" is distinct from "Supervisor" — check is `WHERE name = $1` exact match) 3. Cleanup: `DELETE /api/v1/roles/{id}` | API | Design behavior: role names are case-sensitive; document as known behavior; AUTOMATION GAP |

---

## Section 40.25 — POST /roles — happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-070 | Admin | Create role with no permissions succeeds | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-empty-${TS}","permissions":[]}` | HTTP 201; `data.id` is UUID; `data.name` matches; `data.permissions === []`; `data.user_count === 0`; `data.created_at` is ISO timestamp; cleanup after test | API | Realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-071 | Admin | Create role with valid permissions inserts role_permissions rows | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-perm-${TS}","permissions":[{"permission":"products:read","max_stage":null},{"permission":"cartons:read","max_stage":null}]}` 3. `GET /api/v1/roles/{new_id}` | HTTP 201; response `data.permissions.length === 2`; GET confirms same 2 entries; cleanup | API | Dual-write: INSERT into `roles.permissions` jsonb AND `role_permissions` table; AUTOMATION GAP |
| TC-API-ROLE-072 | Admin | Created role appears in GET /roles list | P0 | 1. Login as Admin 2. `POST /api/v1/roles` → `new_id` 3. `GET /api/v1/roles` | New role present in `data.roles` array; `user_count === 0` | API | AUTOMATION GAP |
| TC-API-ROLE-073 | Admin | Create role with max_stage permission entry stores max_stage correctly | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-stage-${TS}","permissions":[{"permission":"cartons:update","max_stage":"ACTIVE"}]}` 3. `GET /api/v1/roles/{new_id}` | `data.permissions[0].permission === "cartons:update"`; `data.permissions[0].max_stage === "ACTIVE"` | API | `max_stage` stored in `role_permissions.max_stage`; AUTOMATION GAP |

---

## Section 40.26 — PATCH /roles/:id — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-080 | Unauthenticated | PATCH /roles/:id without token returns 401 | P0 | 1. `PATCH /api/v1/roles/{valid_uuid}` body `{"name":"X"}` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-ROLE-081 | Supervisor | Supervisor PATCH /roles/:id returns 403 | P0 | 1. Login as Supervisor 2. `PATCH /api/v1/roles/{valid_uuid}` body `{"permissions":[]}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-082 | Warehouse Operator | Warehouse Operator PATCH /roles/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `PATCH /api/v1/roles/{valid_uuid}` body `{"name":"X"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-083 | Dispatch Operator | Dispatch Operator PATCH /roles/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `PATCH /api/v1/roles/{valid_uuid}` body `{"name":"X"}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.27 — PATCH /roles/:id — Admin role protected (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-090 | Admin | PATCH Admin role to rename returns 403 | P0 | 1. Login as Admin 2. Resolve Admin role UUID 3. `PATCH /api/v1/roles/{admin_id}` body `{"name":"SuperAdmin"}` | HTTP 403; message = "The Admin role is protected and cannot be modified via the API" | API | `SUPER_ADMIN_ROLE = 'Admin'` check at top of `updateRole`; realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-091 | Admin | PATCH Admin role to change permissions returns 403 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/{admin_id}` body `{"permissions":[{"permission":"products:read","max_stage":null}]}` | HTTP 403; even permission-only edits blocked for Admin role | API | Guard fires before any field processing; AUTOMATION GAP |
| TC-API-ROLE-092 | Admin | PATCH Admin role with empty body returns 403 | P2 | 1. Login as Admin 2. `PATCH /api/v1/roles/{admin_id}` body `{}` | HTTP 403 (service fetches role, sees Admin name, throws ForbiddenError immediately) | API | AUTOMATION GAP |

---

## Section 40.28 — PATCH /roles/:id — default-role rename blocked (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-100 | Admin | PATCH Supervisor role rename returns 403 | P0 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `PATCH /api/v1/roles/{sup_id}` body `{"name":"SeniorSupervisor"}` | HTTP 403; message contains `Default role "Supervisor" cannot be renamed` | API | `DEFAULT_ROLE_NAMES` check in `updateRole`; AUTOMATION GAP |
| TC-API-ROLE-101 | Admin | PATCH Warehouse Operator rename returns 403 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/{wh_id}` body `{"name":"Stock Manager"}` | HTTP 403; `Default role "Warehouse Operator" cannot be renamed` | API | AUTOMATION GAP |
| TC-API-ROLE-102 | Admin | PATCH Dispatch Operator rename returns 403 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/{dp_id}` body `{"name":"Logistics"}` | HTTP 403; `Default role "Dispatch Operator" cannot be renamed` | API | AUTOMATION GAP |
| TC-API-ROLE-103 | Admin | PATCH Supervisor with same name (no actual rename) + new permissions succeeds | P1 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `PATCH /api/v1/roles/{sup_id}` body `{"name":"Supervisor","permissions":[{"permission":"dispatch:read","max_stage":null}]}` | HTTP 200 (rename guard: `input.name !== currentRole.name` is false → guard not triggered); permissions updated to single entry; restore original permissions after test | API | Edge case for `input.name === currentRole.name` bypass; AUTOMATION GAP |

---

## Section 40.29 — PATCH /roles/:id — permission edits happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-110 | Admin | PATCH custom role permissions replaces role_permissions rows | P0 | 1. Login as Admin 2. Create custom role `e2e-patch-${TS}` with `[{permission:"products:read"}]` 3. `PATCH /api/v1/roles/{id}` body `{"permissions":[{"permission":"cartons:read","max_stage":null},{"permission":"dispatch:read","max_stage":null}]}` 4. `GET /api/v1/roles/{id}` | PATCH 200; `data.permissions.length === 2`; no `products:read`; GET confirms DELETE+INSERT in transaction | API | AUTOMATION GAP |
| TC-API-ROLE-111 | Admin | PATCH custom role to empty permissions clears all role_permissions | P0 | 1. Login as Admin 2. Create custom role with 3 permissions 3. `PATCH /api/v1/roles/{id}` body `{"permissions":[]}` 4. `GET /api/v1/roles/{id}` | PATCH 200; `data.permissions === []`; GET confirms empty | API | AUTOMATION GAP |
| TC-API-ROLE-112 | Admin | PATCH custom role to rename succeeds | P0 | 1. Login as Admin 2. Create custom role `e2e-rename-orig-${TS}` 3. `PATCH /api/v1/roles/{id}` body `{"name":"e2e-rename-new-${TS}"}` 4. `GET /api/v1/roles/{id}` | PATCH 200; `data.name` = new name; `updated_at > created_at` | API | Custom (non-default) roles CAN be renamed; AUTOMATION GAP |
| TC-API-ROLE-113 | Admin | PATCH without permissions field leaves existing permissions unchanged | P1 | 1. Login as Admin 2. Create custom role with 2 permissions 3. `PATCH /api/v1/roles/{id}` body `{"name":"new-name-${TS}"}` (no permissions field) 4. `GET /api/v1/roles/{id}` | PATCH 200; name updated; permissions still 2 (DELETE+INSERT skipped when `input.permissions === undefined`) | API | AUTOMATION GAP |
| TC-API-ROLE-114 | Admin | PATCH returns full updated role (via getRoleById) | P1 | 1. Login as Admin 2. Create custom role 3. `PATCH /api/v1/roles/{id}` 4. Compare PATCH response with `GET /api/v1/roles/{id}` | PATCH response `data` equals GET `data` (id, name, permissions, user_count all match) | API | `updateRole` calls `getRoleById(id)` at end; AUTOMATION GAP |
| TC-API-ROLE-115 | Admin | PATCH Supervisor permissions (no rename) correctly replaces role_permissions | P0 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[{"permission":"products:read","max_stage":null}]}` 4. `GET /api/v1/roles/{sup_id}` 5. Restore: PATCH back with all 19 original permissions | PATCH 200; GET shows 1 permission; restore PATCH 200; GET shows 19 permissions | Integration | Key integration test: default role permissions ARE mutable via PATCH (only rename is blocked, not perm-edit); AUTOMATION GAP |

---

## Section 40.30 — PATCH /roles/:id — validation (400 / 404 / 409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-120 | Admin | PATCH with invalid permission key returns 400 | P0 | 1. Login as Admin 2. Create custom role 3. `PATCH /api/v1/roles/{id}` body `{"permissions":[{"permission":"invalid:key","max_stage":null}]}` | HTTP 400; message contains "Invalid permission(s): invalid:key" | API | `validatePermissions()` called in `updateRole`; AUTOMATION GAP |
| TC-API-ROLE-121 | Admin | PATCH non-existent role UUID returns 404 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/00000000-0000-0000-0000-000000000099` body `{"name":"X"}` | HTTP 404; message = "Role not found" | API | AUTOMATION GAP |
| TC-API-ROLE-122 | Admin | PATCH to rename to existing role name returns 409 | P0 | 1. Login as Admin 2. Create custom role `e2e-clash-${TS}` 3. `PATCH /api/v1/roles/{another_custom_id}` body `{"name":"e2e-clash-${TS}"}` | HTTP 409; message contains `Role name "e2e-clash-..." already exists` | API | `ConflictError` from name uniqueness check; AUTOMATION GAP |
| TC-API-ROLE-123 | Admin | PATCH with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `PATCH /api/v1/roles/not-a-uuid` body `{"name":"X"}` | HTTP 400; Zod error; "Invalid role ID format" | API | AUTOMATION GAP |
| TC-API-ROLE-124 | Admin | PATCH with name shorter than 2 characters returns 400 | P1 | 1. Login as Admin 2. `PATCH /api/v1/roles/{custom_id}` body `{"name":"A"}` | HTTP 400; Zod error | API | `updateRoleSchema.name.min(2)`; AUTOMATION GAP |

---

## Section 40.31 — DELETE /roles/:id — unauthenticated + RBAC denial

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-130 | Unauthenticated | DELETE /roles/:id without token returns 401 | P0 | 1. `DELETE /api/v1/roles/{valid_uuid}` with no token | HTTP 401 | API | AUTOMATION GAP |
| TC-API-ROLE-131 | Supervisor | Supervisor DELETE /roles/:id returns 403 | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/roles/{valid_uuid}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-132 | Warehouse Operator | Warehouse Operator DELETE /roles/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/roles/{valid_uuid}` | HTTP 403 | API | AUTOMATION GAP |
| TC-API-ROLE-133 | Dispatch Operator | Dispatch Operator DELETE /roles/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/roles/{valid_uuid}` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 40.32 — DELETE /roles/:id — default-role delete blocked (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-140 | Admin | DELETE Admin role returns 403 | P0 | 1. Login as Admin 2. Resolve Admin role UUID 3. `DELETE /api/v1/roles/{admin_id}` | HTTP 403; message contains `Default role "Admin" cannot be deleted` | API | `deleteRole` checks `DEFAULT_ROLE_NAMES`; realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-141 | Admin | DELETE Supervisor role returns 403 | P0 | 1. Login as Admin 2. `DELETE /api/v1/roles/{sup_id}` | HTTP 403; message = `Default role "Supervisor" cannot be deleted` | API | AUTOMATION GAP |
| TC-API-ROLE-142 | Admin | DELETE Warehouse Operator role returns 403 | P0 | 1. Login as Admin 2. `DELETE /api/v1/roles/{wh_id}` | HTTP 403; message = `Default role "Warehouse Operator" cannot be deleted` | API | AUTOMATION GAP |
| TC-API-ROLE-143 | Admin | DELETE Dispatch Operator role returns 403 | P0 | 1. Login as Admin 2. `DELETE /api/v1/roles/{dp_id}` | HTTP 403; message = `Default role "Dispatch Operator" cannot be deleted` | API | AUTOMATION GAP |

---

## Section 40.33 — DELETE /roles/:id — assigned-users blocked (409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-150 | Admin | DELETE custom role with assigned users returns 409 | P0 | 1. Login as Admin 2. Create custom role `e2e-nonempty-${TS}` 3. ⚠️ NOTE: cannot assign custom role via PUT /users — Zod enum blocks it (see TC-API-USR-103); verify 409 path requires direct DB assignment or consider this an AUTOMATION GAP | HTTP 409; message contains `Cannot delete role "...": {N} user(s) are currently assigned to it`; message also states "Reassign them to a different role first" | API | ⚠️ AUTOMATION GAP: assignment of custom roles via API is blocked by USER_ROLES enum; test requires direct DB INSERT or a future API fix; document as known gap |
| TC-API-ROLE-151 | Admin | DELETE custom role with no assigned users returns 200 | P0 | 1. Login as Admin 2. Create custom role `e2e-empty-del-${TS}` with no users 3. `DELETE /api/v1/roles/{id}` | HTTP 200; `success === true`; message = "Role deleted successfully"; `data === null`; subsequent `GET /api/v1/roles/{id}` returns 404 | API | Realized by: `31-role-manager.spec.ts` |
| TC-API-ROLE-152 | Admin | DELETE non-existent role UUID returns 404 | P0 | 1. Login as Admin 2. `DELETE /api/v1/roles/00000000-0000-0000-0000-000000000099` | HTTP 404; message = "Role not found" | API | AUTOMATION GAP |
| TC-API-ROLE-153 | Admin | DELETE with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `DELETE /api/v1/roles/not-a-uuid` | HTTP 400; Zod error; "Invalid role ID format" | API | AUTOMATION GAP |

---

## Section 40.34 — DELETE /roles/:id — happy path + cascade

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-160 | Admin | DELETE custom role cascades to remove role_permissions rows | P0 | 1. Login as Admin 2. Create custom role `e2e-cascade-${TS}` with 3 permissions 3. `DELETE /api/v1/roles/{id}` 4. `GET /api/v1/roles` | DELETE 200; GET does NOT list the deleted role; role_permissions rows for that role_id removed (DB ON DELETE CASCADE assumed or explicit DELETE in service); AUTOMATION GAP — verify cascade or explicit DELETE in role.service.ts | API | `deleteRole` service does `DELETE FROM roles WHERE id = $1`; role_permissions should cascade; AUTOMATION GAP |
| TC-API-ROLE-161 | Admin | Deleted role no longer appears in GET /roles list | P0 | 1. Login as Admin 2. Create then delete custom role 3. `GET /api/v1/roles` | Deleted role absent from `data.roles` array | API | AUTOMATION GAP |

---

## Section 40.35 — Integration: grant-flow (grant Supervisor samples:* → immediate effect)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-170 | Admin + Supervisor | Grant Supervisor samples:create → Supervisor POST /samples succeeds without re-login | P0 | 1. Login as Admin 2. Resolve Supervisor role UUID 3. `PATCH /api/v1/roles/{sup_id}` body including `{permission:"samples:create"}` in permissions array (full replacement — include all 19 existing + samples:create) 4. **Without re-logging-in as Supervisor** 5. Attempt `POST /api/v1/samples` with Supervisor's existing token | Step 3 returns HTTP 200; Step 5 returns HTTP 201 (not 403); `authorizePermission` reads `role_permissions` live on every request — no cache; immediate effect confirmed | Integration | Core grant-flow test; `authorizePermission` has no permission cache; AUTOMATION GAP — add to `31-role-manager.spec.ts` as an integration block |
| TC-API-ROLE-171 | Admin + Supervisor | Grant Supervisor samples:read → Supervisor GET /samples succeeds without re-login | P0 | 1. Login as Admin 2. PATCH Supervisor role to add `samples:read` 3. With existing Supervisor token, `GET /api/v1/samples` | GET returns HTTP 200 (previously 403 if samples:read was absent); no re-login needed | Integration | Note: per Track A finding, GET /samples has NO permission gate (auth-only). This TC verifies the grant-flow mechanism using a write endpoint (`samples:create`) and read behavior; AUTOMATION GAP |
| TC-API-ROLE-172 | Admin + Supervisor | Grant Supervisor all samples:* (create/read/update/delete) | P0 | 1. Login as Admin 2. PATCH Supervisor adding `samples:create`, `samples:read`, `samples:update`, `samples:delete` 3. Supervisor token: `POST /api/v1/samples`, `GET /api/v1/samples`, a PUT/PATCH on a sample, a DELETE if route exists | All 4 operations return non-403; then restore Supervisor role to original 19 permissions | Integration | Full samples:* grant verification; AUTOMATION GAP |
| TC-API-ROLE-173 | Admin | Restore Supervisor permissions post-grant-flow test | P1 | 1. After TC-API-ROLE-170/171/172 tests 2. Admin PATCH Supervisor role back to original 19 permissions 3. Supervisor token: attempt `POST /api/v1/samples` | Returns HTTP 403 again; confirms revocation is also immediate | Integration | AUTOMATION GAP — part of grant-flow teardown |

---

## Section 40.36 — Integration: revoke permission → immediate denial (no re-login)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-180 | Admin + Supervisor | Revoke Supervisor dispatch:read → immediate 403 on GET /dispatches | P0 | 1. Login as Supervisor → `sup_token` (can currently `GET /api/v1/dispatches` — has dispatch:read) 2. Login as Admin → `admin_token` 3. Admin PATCH Supervisor role removing `dispatch:read` from permissions 4. **With same `sup_token`**, `GET /api/v1/dispatches` | After PATCH, Supervisor's `GET /api/v1/dispatches` returns HTTP 403 (was 200); no re-login; confirms live DB check per request 5. Restore Supervisor permissions | Integration | Revocation-flow; AUTOMATION GAP — add to `31-role-manager.spec.ts` |
| TC-API-ROLE-181 | Admin + Warehouse Operator | Grant Warehouse Operator cartons:reopen → immediate success | P0 | 1. Login as Warehouse Operator → `wh_token` 2. Attempt `POST /api/v1/master-cartons/{closed_id}/reopen` → expect 403 (WH-Op lacks cartons:reopen) 3. Admin PATCH Warehouse Operator adding `cartons:reopen` 4. Same `wh_token`: retry `POST /api/v1/master-cartons/{closed_id}/reopen` | Step 2: 403; Step 4: 200 (or 400 if no closed carton exists — but not 403); confirms immediate grant | Integration | Demonstrates `authorizePermission` live read; AUTOMATION GAP |

---

## Section 40.37 — Integration: stage-aware max_stage custom role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-API-ROLE-190 | Admin | Create custom role with max_stage=ACTIVE for cartons:update, verify stage-aware block | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-stage-role-${TS}","permissions":[{"permission":"cartons:update","max_stage":"ACTIVE"}]}` 3. Create a test user with this custom role (requires direct DB INSERT since Zod enum blocks custom role assignment) 4. Login as that user 5. Attempt `PATCH /api/v1/master-cartons/{closed_carton_id}` | Step 5 returns HTTP 403; message contains "Permission denied: cartons:update is restricted at stage CLOSED (your role allows up to ACTIVE)"; `stageIndex("CLOSED") > stageIndex("ACTIVE")` in middleware | Integration | ⚠️ AUTOMATION GAP: test user creation for custom role requires DB workaround (Zod enum blocks via API); stage-aware `authorizePermission` with `stageCheck` option; mark as AUTOMATION GAP pending API fix |
| TC-API-ROLE-191 | Admin | Custom role with max_stage=ACTIVE for cartons:update allows update on ACTIVE carton | P1 | 1. As in TC-API-ROLE-190 setup 2. Attempt `PATCH /api/v1/master-cartons/{active_carton_id}` | HTTP 200 (or 400 if body invalid — but NOT 403); `stageIndex("ACTIVE") <= stageIndex("ACTIVE")` → passes stage check | Integration | AUTOMATION GAP |
| TC-API-ROLE-192 | Admin | Seeded roles all have max_stage=NULL — stage check never triggers | P2 | 1. Login as any seeded role 2. Perform any `cartons:update` or `child_boxes:update` operation | Stage check condition `if (resourceStage && max_stage)` is false (max_stage is NULL for all seeded roles) → stage check skipped; operation proceeds based on permission presence alone | API | `seeds/001_roles.ts` inserts all `max_stage = NULL`; AUTOMATION GAP |

---

## Automation Gap Summary

The following spec files should be created or extended to realize the TCs above:

| Proposed spec file | Covers | Gap count |
|---|---|---|
| `frontend/e2e/16-rbac-auth.spec.ts` (extend) | Auth login per role, permission-array assertions, cookie/Bearer dual-path, rate-limit headers, refresh, logout, change-password, profile | ~40 TCs |
| `frontend/e2e/25-users-admin.spec.ts` (extend) | Users CRUD per role, duplicate email, soft-delete, activate/deactivate, self-delete gap, Supervisor→Admin role escalation, custom-role enum block | ~35 TCs |
| `frontend/e2e/31-role-manager.spec.ts` (extend) | All roles 401/403 on /roles + /permissions, per-role permission counts, grant-flow integration block, revoke-flow, stage-aware custom role | ~45 TCs |
| `frontend/e2e/40-api-auth-contract.spec.ts` (NEW) | Auth login validation edge cases, inactive-user 401, rate-limit 429, refresh token rotation, logout cookie-clear, change-pw validation | ~25 TCs |

**Note:** All API tests in this phase use Playwright `request` context (`playwright.request.newContext()`) to call the backend directly without browser interaction, consistent with Track B conventions.

---

## Matrix Discrepancies

1. **Admin seeded vs synthesized permissions:** `GET /api/v1/roles` returns the 27 rows stored in `role_permissions` for Admin (from seed), but `GET /api/v1/auth/profile` and `POST /auth/login` return a synthesized 47-permission list for Admin. These two counts intentionally differ — `getRoleById` reads the table; `fetchPermissionsForUser` synthesizes from the catalog.
2. **`reports:view_own`, `reports:view_dispatch`, `reports:export`:** These are in the PERMISSION_CATALOG (contributing to Admin's 47) and seeded for Warehouse Operator and Dispatch Operator respectively, but no route in the reports module checks for them. They are dead permissions that appear in the count but have no enforcement gate.
3. **`audit:read`:** Seeded for Admin and present in PERMISSION_CATALOG (Admin 47), but the `/api/v1/audit` endpoint returns 404 (no route registered). Dead permission and dead endpoint.
4. **Inactive user returns same 401 as wrong password:** `auth.service.ts` login query is `WHERE u.email = $1 AND u.is_active = true` — inactive users are indistinguishable from unknown emails at the API level. This prevents user enumeration but also makes debugging harder.
5. **Custom role assignment blocked by Zod enum:** The role schema `createUserSchema` and `updateUserSchema` both use `z.enum(Object.values(USER_ROLES))` — custom roles created via Role Manager cannot be assigned to users via the public API. This means the "assigned users" 409 guard in `deleteRole` is only reachable for default roles (blocked by the 403 default-role guard anyway) or via direct DB manipulation. Effectively, the 409 path in `deleteRole` is unreachable through the normal API flow.
