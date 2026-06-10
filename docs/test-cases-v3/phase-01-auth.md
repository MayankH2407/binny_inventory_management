# Phase 01 — Authentication & Authorization

**Module codes:** `AUTH`, `RBAC` (login, token, profile, logout, change-password, permission propagation, RBAC denials)
**API base:** `http://localhost:3001/api/v1` (backend port; confirm with `PLAYWRIGHT_API_URL` env var)
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30
**Refreshed:** 2026-06-09 — permission-based RBAC (`authorizePermission('module:action')`); permissions array propagation at login; Admin super-admin bypass synthesizes full 47-permission catalog; corrected token expiry (1 h access / 7 d refresh); corrected seeded role permission sets; added samples/ecommerce GET-no-gate discrepancy TCs; added stage-aware max_stage TC; aligned all denial matrices to seeds/001_roles.ts ground truth.

> **Prerequisite:** Admin account is auto-seeded (`admin@binny.com` / `Admin@123`) on every startup via `autoSeed.ts`. The other three role accounts must exist before role-specific tests run. `16-rbac-auth.spec.ts` creates them dynamically with timestamped emails in `TC-SETUP-001`. For manual API tests use the same seeded credentials or create them first.

---

## Key ground-truth facts (verified against code 2026-06-09)

| Fact | Source | Value |
|---|---|---|
| Access token expiry | `auth.controller.ts` `ACCESS_COOKIE_MAX_AGE_MS` | **1 hour** (3600 s) |
| Refresh token expiry | `auth.controller.ts` `REFRESH_COOKIE_MAX_AGE_MS` | 7 days (604 800 s) |
| JWT payload fields | `auth.service.ts` `generateAccessToken` | `userId`, `email`, `roleId` |
| Admin bypass | `rbac.middleware.ts` `authorizePermission` | role_name === 'Admin' → always `next()` |
| Admin permissions at login | `auth.service.ts` `fetchPermissionsForUser` | Full `PERMISSION_CATALOG` flat-mapped — **47 permissions** (not 67; MASTER_TEST_PLAN cited an older count) |
| Seeded permissions: Supervisor | `seeds/001_roles.ts` | 19 permissions (see §01.1) |
| Seeded permissions: Warehouse Operator | `seeds/001_roles.ts` | 9 permissions |
| Seeded permissions: Dispatch Operator | `seeds/001_roles.ts` | 7 permissions |
| max_stage (seeded) | `seeds/001_roles.ts` | All NULL for default roles |
| Rate limit (auth) | `constants.ts` `RATE_LIMIT` | 50 000 req / 15 min — effectively disabled; no practical rate-limit TC can be authored |
| Login failure message | `auth.service.ts` line 67/74 | "Invalid email or password" (same for bad email AND bad password — no user enumeration) |
| Change-password failure message | `auth.service.ts` line 158 | "Current password is incorrect" (HTTP 401 via UnauthorizedError) |
| Settings page submit button | `settings/page.tsx` | Label is "Update Password" (not "Change Password") |
| Frontend client-side password min | `login/page.tsx` `validate()` | 6 chars (frontend only); backend schema also 6 chars for login |
| Backend new-password min | `auth.schema.ts` `changePasswordSchema` | 8 chars + uppercase + lowercase + digit |
| Tokens stored in localStorage | `authStore.ts` | `binny_token`, `binny_user` |

---

## Seeded permission sets (ground truth from seeds/001_roles.ts)

**Admin** (synthesized at login from PERMISSION_CATALOG — NOT from role_permissions rows):
`users:create`, `users:read`, `users:update`, `users:delete`, `roles:manage`, `products:create`, `products:read`, `products:update`, `products:delete`, `child_boxes:create`, `child_boxes:read`, `child_boxes:update`, `child_boxes:delete`, `cartons:create`, `cartons:read`, `cartons:update`, `cartons:close`, `cartons:reopen`, `cartons:delete`, `packing:pack`, `packing:unpack`, `dispatch:create`, `dispatch:read`, `dispatch:update`, `samples:create`, `samples:read`, `samples:update`, `samples:delete`, `ecommerce:create`, `ecommerce:read`, `ecommerce:update`, `ecommerce:delete`, `customers:create`, `customers:read`, `customers:update`, `customers:delete`, `sections:create`, `sections:read`, `sections:update`, `sections:delete`, `inventory:read`, `reports:view_all`, `reports:view_own`, `reports:view_dispatch`, `reports:export`, `audit:read`, `settings:manage` **(47 total)**

**Supervisor** (from role_permissions, max_stage=NULL for all):
`users:create`, `users:read`, `users:update`, `products:read`, `products:create`, `products:update`, `child_boxes:create`, `child_boxes:read`, `child_boxes:update`, `cartons:create`, `cartons:read`, `cartons:update`, `cartons:close`, `cartons:reopen`, `packing:pack`, `packing:unpack`, `dispatch:read`, `reports:view_all`, `reports:export` **(19 total)**

**Warehouse Operator** (from role_permissions, max_stage=NULL for all):
`products:read`, `child_boxes:create`, `child_boxes:read`, `cartons:create`, `cartons:read`, `cartons:close`, `packing:pack`, `packing:unpack`, `reports:view_own` **(9 total)**

**Dispatch Operator** (from role_permissions, max_stage=NULL for all):
`products:read`, `child_boxes:read`, `cartons:read`, `dispatch:create`, `dispatch:read`, `dispatch:update`, `reports:view_dispatch` **(7 total)**

> **Notable absences:** No seeded non-Admin role holds `samples:*`, `ecommerce:*`, `customers:*`, `sections:*`, `inventory:read`, `users:delete`, `roles:manage`, `audit:read`, or `settings:manage`.

---

## Table of Contents

- [Section 01.1 — Login per role (permissions array)](#section-011--login-per-role-permissions-array)
- [Section 01.2 — Login failures](#section-012--login-failures)
- [Section 01.3 — JWT token contract](#section-013--jwt-token-contract)
- [Section 01.4 — Token lifecycle (expire / malform / missing)](#section-014--token-lifecycle-expire--malform--missing)
- [Section 01.5 — Refresh token](#section-015--refresh-token)
- [Section 01.6 — Profile endpoint (permissions array)](#section-016--profile-endpoint-permissions-array)
- [Section 01.7 — Logout](#section-017--logout)
- [Section 01.8 — Change password](#section-018--change-password)
- [Section 01.9 — Playwright E2E: Login page & navigation](#section-019--playwright-e2e-login-page--navigation)
- [Section 01.10 — RBAC denial matrix — Users](#section-0110--rbac-denial-matrix--users)
- [Section 01.11 — RBAC denial matrix — Products](#section-0111--rbac-denial-matrix--products)
- [Section 01.12 — RBAC denial matrix — Sections](#section-0112--rbac-denial-matrix--sections)
- [Section 01.13 — RBAC denial matrix — Customers](#section-0113--rbac-denial-matrix--customers)
- [Section 01.14 — RBAC denial matrix — Child boxes](#section-0114--rbac-denial-matrix--child-boxes)
- [Section 01.15 — RBAC denial matrix — Master cartons](#section-0115--rbac-denial-matrix--master-cartons)
- [Section 01.16 — RBAC denial matrix — Samples (with GET discrepancy)](#section-0116--rbac-denial-matrix--samples-with-get-discrepancy)
- [Section 01.17 — RBAC denial matrix — E-commerce (with GET discrepancy)](#section-0117--rbac-denial-matrix--e-commerce-with-get-discrepancy)
- [Section 01.18 — RBAC denial matrix — Dispatches](#section-0118--rbac-denial-matrix--dispatches)
- [Section 01.19 — RBAC denial matrix — Inventory & Reports](#section-0119--rbac-denial-matrix--inventory--reports)
- [Section 01.20 — Stage-aware permissions (max_stage)](#section-0120--stage-aware-permissions-max_stage)
- [Section 01.21 — Frontend permission propagation (useCan / useAuth)](#section-0121--frontend-permission-propagation-usecan--useauth)

---

## Section 01.1 — Login per role (permissions array)

> New in refresh: every login TC asserts the `data.user.permissions` array structure and that its contents match the role's seeded set (spot-checked). Admin asserts full 47-permission catalog; others assert key inclusions and key exclusions.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-001 | Admin | Admin login returns token, role, and full 47-permission catalog | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"Admin@123"}` 2. Inspect response status, body fields | HTTP 200; `data.user.role === "Admin"`; `data.user.email === "admin@binny.com"`; `data.accessToken` is non-empty JWT; `Set-Cookie` contains `accessToken` (HttpOnly) and `refreshToken` (HttpOnly); `data.user.permissions` is an array of 47 objects each with shape `{permission: string, max_stage: null}`; array contains `"samples:create"`, `"ecommerce:read"`, `"inventory:read"`, `"roles:manage"` | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-001: Admin login returns token and correct role" |
| TC-AUTH-002 | Supervisor | Supervisor login returns token, role, and 19-permission set | P0 | 1. `POST /api/v1/auth/login` body `{"email":"supervisor@binny.com","password":"Sup@123"}` 2. Inspect `data.user.permissions` | HTTP 200; `data.user.role === "Supervisor"`; `data.accessToken` non-empty JWT; `data.user.permissions` is an array of exactly 19 objects; array CONTAINS `"dispatch:read"`, `"reports:view_all"`, `"packing:pack"`; array does NOT contain `"dispatch:create"`, `"samples:create"`, `"inventory:read"`, `"roles:manage"` | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-002: Supervisor login returns token and correct role" |
| TC-AUTH-003 | Warehouse Operator | Warehouse Operator login returns token, role, and 9-permission set | P0 | 1. `POST /api/v1/auth/login` body `{"email":"warehouse@binny.com","password":"Wh@123"}` 2. Inspect permissions | HTTP 200; `data.user.role === "Warehouse Operator"`; `data.user.permissions` is array of exactly 9 objects; CONTAINS `"cartons:close"`, `"packing:pack"`, `"reports:view_own"`; does NOT contain `"cartons:reopen"`, `"dispatch:create"`, `"products:create"`, `"samples:create"` | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-003: Warehouse Operator login returns token and correct role" |
| TC-AUTH-004 | Dispatch Operator | Dispatch Operator login returns token, role, and 7-permission set | P0 | 1. `POST /api/v1/auth/login` body `{"email":"dispatch@binny.com","password":"Dp@123"}` 2. Inspect permissions | HTTP 200; `data.user.role === "Dispatch Operator"`; `data.user.permissions` is array of exactly 7 objects; CONTAINS `"dispatch:create"`, `"dispatch:read"`, `"reports:view_dispatch"`; does NOT contain `"child_boxes:create"`, `"cartons:create"`, `"packing:pack"`, `"samples:create"` | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-004: Dispatch Operator login returns token and correct role" |
| TC-AUTH-005 | Admin | Login response body includes id, name, email, role, permissions — no password_hash | P0 | 1. `POST /api/v1/auth/login` as Admin 2. Parse `data.user` | `data.user` has fields `id` (UUID), `name`, `email`, `role`, `permissions` (array); field `password_hash` is absent; `data.accessToken` present; `data.refreshToken` absent from response body (in cookie only) | API | Security assertion. AUTOMATION GAP — no spec asserts `password_hash` absent from permissions response |
| TC-AUTH-006 | Admin | Login creates AUDIT_LOG entry for LOGIN action | P1 | 1. Note current timestamp T0 2. `POST /api/v1/auth/login` as Admin 3. Query DB: `SELECT * FROM audit_logs WHERE action = 'LOGIN' AND entity_id = '<admin_uuid>' ORDER BY created_at DESC LIMIT 1` | Audit log row exists with `action='LOGIN'`, `entity_type='user'`, `entity_id` = Admin user UUID, `created_at >= T0`; `ip_address` and `user_agent` populated if provided | Integration | `auth.service.ts` calls `createAuditLog` after login |
| TC-AUTH-007 | Admin | Login updates last_login_at timestamp in DB | P1 | 1. Record T0 = NOW() 2. `POST /api/v1/auth/login` as Admin 3. `SELECT last_login_at FROM users WHERE email = 'admin@binny.com'` | `last_login_at >= T0` | Integration | `auth.service.ts` line ~78 |
| TC-AUTH-008 | Admin | permissions array max_stage values are all null for Admin (synthesized from catalog) | P1 | 1. Login as Admin 2. Inspect `data.user.permissions` array | Every element has `max_stage === null`; Admin synthesize path uses `flatMap` with hardcoded `null` | API | `auth.service.ts` `fetchPermissionsForUser` Admin branch |
| TC-AUTH-009 | Supervisor | permissions array max_stage values are all null for Supervisor (default seed) | P1 | 1. Login as Supervisor 2. Inspect `data.user.permissions` | Every element has `max_stage === null`; seed inserts with `NULL` | API | `seeds/001_roles.ts` all permissions seeded with `max_stage = NULL` |

---

## Section 01.2 — Login failures

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-011 | Any | Non-existent email returns 401 with generic message | P0 | 1. `POST /api/v1/auth/login` body `{"email":"nobody@binny.com","password":"Admin@123"}` | HTTP 401; body `message === "Invalid email or password"`; no `accessToken` field; no `Set-Cookie` header setting tokens | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-005" |
| TC-AUTH-012 | Any | Wrong password for existing user returns 401 with same generic message | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"WrongPass1"}` | HTTP 401; `message === "Invalid email or password"`; no token; same message as unknown-email (prevents user enumeration) | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-006" |
| TC-AUTH-013 | Any | Empty email field returns 400 (Zod validation) | P0 | 1. `POST /api/v1/auth/login` body `{"email":"","password":"Admin@123"}` | HTTP 400; body `success === false`; `message` or `errors` references `email`; no token | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-007" |
| TC-AUTH-014 | Any | Empty password field returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":""}` | HTTP 400; validation error for `password` (min 6 chars from `loginSchema`); no token | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-008" |
| TC-AUTH-015 | Any | Missing email field entirely returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"password":"Admin@123"}` | HTTP 400; Zod error for `email` required | API | AUTOMATION GAP — add to `16-rbac-auth.spec.ts` |
| TC-AUTH-016 | Any | Missing password field entirely returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com"}` | HTTP 400; Zod error for `password` required | API | AUTOMATION GAP |
| TC-AUTH-017 | Any | Password shorter than 6 chars returns 400 | P0 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"ab"}` | HTTP 400; Zod error "Password must be at least 6 characters" | API | Realized by `01-auth.spec.ts` → "TC-AUTH-009: Short password validation" (E2E form validation) |
| TC-AUTH-018 | Any | Inactive user login returns 401 | P1 | 1. Admin deactivates a user via `PUT /api/v1/users/<id>` body `{"is_active":false}` 2. Attempt `POST /api/v1/auth/login` with that user's credentials 3. Re-activate | Step 2: HTTP 401; message "Invalid email or password" (WHERE clause filters `is_active = true`); no token | Integration | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-010: Deactivated/inactive user cannot log in" |
| TC-AUTH-019 | Any | SQL injection in email handled safely | P1 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com' OR '1'='1","password":"anything"}` | HTTP 401 or 400; no 500; no SQL data leaked; parameterised queries prevent injection | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-009" |
| TC-AUTH-020 | Any | Email exceeding 255 chars returns 400 | P1 | 1. Build a 256-char email string 2. `POST /api/v1/auth/login` with that email | HTTP 400; Zod error for `email` max 255 | API | `loginSchema` `.max(255)` |
| TC-AUTH-021 | Any | Password exceeding 128 chars returns 400 | P1 | 1. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"<129-char string>"}` | HTTP 400; Zod error for `password` max 128 | API | `loginSchema` `.max(128)` |
| TC-AUTH-022 | Any | Rate limit — effectively disabled in current config | P2 | Review `RATE_LIMIT.AUTH_MAX_REQUESTS` | Value is 50 000 requests per 15 min — no meaningful rate-limiting for testing; TC is informational only; no failure expected unless config changes | Manual | `constants.ts` `AUTH_MAX_REQUESTS: 50000`. Mark as known-config note, not a failing TC. |
| TC-AUTH-023 | Unauthenticated | Login endpoint does not require prior authentication | P0 | 1. `POST /api/v1/auth/login` with no cookies, no Authorization header, valid body | HTTP 200 with valid Admin token (not 401) | API | Login route has no `authenticate` middleware |

---

## Section 01.3 — JWT token contract

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-031 | Admin | Access token is a three-part dot-separated HS256 JWT | P0 | 1. Login as Admin 2. Take `data.accessToken` 3. Split by `.` | Exactly three parts; each is valid base64url; decode header → `{"alg":"HS256","typ":"JWT"}`; decode payload → contains `userId` (UUID), `email`, `roleId` (UUID), `iat`, `exp` | API | AUTOMATION GAP — add JWT decode assertion to `16-rbac-auth.spec.ts` |
| TC-AUTH-032 | Admin | Access token exp is approximately 1 hour from iat | P0 | 1. Login as Admin 2. Decode JWT payload 3. Compute `exp - iat` | `exp - iat === 3600` (± 5 s); `iat` ≈ current Unix timestamp | API | `ACCESS_COOKIE_MAX_AGE_MS = 60 * 60 * 1000` in `auth.controller.ts`. Note: old TCs cited 900 s (15 min) — **corrected to 3600 s (1 h)** |
| TC-AUTH-033 | Admin | Access token httpOnly cookie has 1-hour max-age | P0 | 1. Login as Admin 2. Inspect `Set-Cookie` response header | `Set-Cookie: accessToken=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`; Secure flag only in production env | API | `COOKIE_OPTIONS` + `maxAge: ACCESS_COOKIE_MAX_AGE_MS` |
| TC-AUTH-034 | Admin | Refresh token httpOnly cookie has 7-day max-age | P0 | 1. Login as Admin 2. Inspect `Set-Cookie` response header for `refreshToken` | `Set-Cookie: refreshToken=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` | API | `REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000` |
| TC-AUTH-035 | Admin | Access token payload contains roleId (UUID) not role name string | P0 | 1. Login as Admin 2. Decode JWT payload | Payload has `roleId` (UUID string matching roles.id); does NOT contain a plaintext `role` field; contains `userId` (UUID) and `email` | API | `auth.types.ts` `JwtPayload` interface |
| TC-AUTH-036 | Admin | accessToken NOT included in refreshToken cookie and vice versa | P1 | 1. Login as Admin 2. Compare cookie names in `Set-Cookie` headers | Two separate cookies: `accessToken` cookie and `refreshToken` cookie; no cross-contamination | API | |
| TC-AUTH-037 | Admin | refreshToken NOT returned in response body (only in cookie) | P1 | 1. Login as Admin 2. Parse response body | `data.refreshToken` is absent from response body; `data.accessToken` is present; only cookies carry `refreshToken` | API | `auth.controller.ts` `sendSuccess(res, { user, accessToken }, ...)` |

---

## Section 01.4 — Token lifecycle (expire / malform / missing)

> **401 = unauthenticated (no valid token); 403 = authenticated but missing permission.** These must be kept distinct.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-041 | Any | Expired JWT returns 401 | P0 | 1. Craft a JWT with correct secret but `exp` = 1 second in the past 2. `GET /api/v1/auth/profile` header `Authorization: Bearer <expired>` | HTTP 401; `message` contains "expired" or "Token has expired" | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-011: Expired/invalid token string returns 401" |
| TC-AUTH-042 | Any | Malformed JWT (garbage string) returns 401 | P0 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer thisisnotjwt` | HTTP 401; "Invalid token"; no 500 | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-012" |
| TC-AUTH-043 | Any | JWT signed with wrong secret returns 401 | P0 | 1. Sign a valid-looking payload with a different secret 2. `GET /api/v1/auth/profile` header `Authorization: Bearer <wrong_sig>` | HTTP 401; "Invalid token" | API | AUTOMATION GAP |
| TC-AUTH-044 | Any | Missing Authorization header AND no cookie returns 401 | P0 | 1. `GET /api/v1/auth/profile` no header, no cookies | HTTP 401; `message` === "Authentication token is required" | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-013" |
| TC-AUTH-045 | Any | Bearer token with only two parts returns 401 | P1 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer header.payload` (no signature) | HTTP 401; "Invalid token"; no 500 | API | AUTOMATION GAP |
| TC-AUTH-046 | Any | Empty Bearer value returns 401 | P1 | 1. `GET /api/v1/auth/profile` header `Authorization: Bearer ` (empty after space) | HTTP 401 | API | AUTOMATION GAP |
| TC-AUTH-047 | Any | Token from httpOnly `accessToken` cookie is accepted (no header) | P0 | 1. Login via `POST /api/v1/auth/login` (sets cookie) 2. `GET /api/v1/auth/profile` with cookie forwarded but NO `Authorization` header | HTTP 200; profile returned; cookie-based auth works | API | `auth.middleware.ts` reads cookie first |
| TC-AUTH-048 | Any | 401 vs 403 distinction: valid token but missing permission → 403 | P0 | 1. Login as Warehouse Operator (valid token) 2. `POST /api/v1/sections` body `{"name":"Test"}` | HTTP 403 (not 401); authenticated but no `sections:create` permission | API | Verifies 401=unauth vs 403=forbidden semantics. AUTOMATION GAP |
| TC-AUTH-049 | Any | 401 vs 403 distinction: no token → 401 on permission-gated route | P0 | 1. `POST /api/v1/sections` body `{"name":"Test"}` with NO token | HTTP 401 (not 403); unauthenticated | API | AUTOMATION GAP |

---

## Section 01.5 — Refresh token

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-051 | Admin | Valid refresh token issues new access + refresh token pair | P0 | 1. Login as Admin; capture `refreshToken` cookie 2. `POST /api/v1/auth/refresh` with `refreshToken` cookie | HTTP 200; body `data.accessToken` is a new JWT; `Set-Cookie` rotates both `accessToken` and `refreshToken` cookies | API | `auth.controller.ts` `refreshToken`; also accepts `req.body.refreshToken` |
| TC-AUTH-052 | Any | Refresh with no token returns 401 | P0 | 1. `POST /api/v1/auth/refresh` with no cookies and no body | HTTP 401; message "Refresh token is required" | API | |
| TC-AUTH-053 | Any | Expired refresh token returns 401 | P0 | 1. Craft or obtain an expired refresh token 2. `POST /api/v1/auth/refresh` body `{"refreshToken":"<expired>"}` | HTTP 401; message "Refresh token has expired, please log in again" | API | `auth.service.ts` `refreshAccessToken` TokenExpiredError catch |
| TC-AUTH-054 | Any | Malformed refresh token returns 401 | P1 | 1. `POST /api/v1/auth/refresh` body `{"refreshToken":"notavalidjwt"}` | HTTP 401; "Invalid refresh token"; no new tokens; no 500 | API | |
| TC-AUTH-055 | Any | Inactive user's refresh token returns 401 | P1 | 1. Create a user, login, get refresh token 2. Deactivate user via Admin 3. `POST /api/v1/auth/refresh` with the refresh token | HTTP 401; "User not found or inactive" (`is_active = true` filter in `refreshAccessToken`) | Integration | `auth.service.ts` line ~117 |
| TC-AUTH-056 | Any | Refresh route does NOT require authentication middleware | P0 | 1. `POST /api/v1/auth/refresh` with only a valid `refreshToken` cookie (no `accessToken`) | HTTP 200; new token issued; route is `authRateLimit` only, no `authenticate` | API | `auth.routes.ts` `/refresh` has no `authenticate` middleware |

---

## Section 01.6 — Profile endpoint (permissions array)

> `GET /api/v1/auth/profile` now returns `permissions` array alongside user fields (same shape as login response).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-061 | Admin | Profile returns correct fields including permissions array for Admin | P0 | 1. Login as Admin 2. `GET /api/v1/auth/profile` with valid token | HTTP 200; `data` contains `id`, `name`, `email`, `role === "Admin"`, `is_active === true`, `last_login_at`, `created_at`, `updated_at`, `permissions` (array of 47); no `password_hash`; no `role_id_val` (stripped in service) | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-014: GET /auth/profile returns correct user data for Admin" |
| TC-AUTH-062 | Supervisor | Profile returns correct role and permissions for Supervisor | P0 | 1. Login as Supervisor 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Supervisor"`; `data.permissions` has 19 items | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-015" |
| TC-AUTH-063 | Warehouse Operator | Profile returns correct role and permissions for Warehouse Operator | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Warehouse Operator"`; `data.permissions` has 9 items | API | AUTOMATION GAP — add Warehouse Operator profile assertion to spec |
| TC-AUTH-064 | Dispatch Operator | Profile returns correct role and permissions for Dispatch Operator | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/auth/profile` | HTTP 200; `data.role === "Dispatch Operator"`; `data.permissions` has 7 items | API | AUTOMATION GAP |
| TC-AUTH-065 | Any | Profile does not expose other users' data | P1 | 1. Login as Supervisor 2. `GET /api/v1/auth/profile` | Response `data` contains exactly the authenticated Supervisor's record; no array of all users; no Admin credentials | API | |
| TC-AUTH-066 | Unauthenticated | Profile returns 401 without token | P0 | 1. `GET /api/v1/auth/profile` no token | HTTP 401 | API | |

---

## Section 01.7 — Logout

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-071 | Admin | Logout clears both httpOnly cookies | P0 | 1. Login as Admin; verify cookies present 2. `POST /api/v1/auth/logout` with valid `accessToken` cookie | HTTP 200; `Set-Cookie` contains `accessToken=; Path=/` (cleared) and `refreshToken=; Path=/` (cleared); body `message === "Logged out successfully"` | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-018: Logout endpoint invalidates session / returns 200" |
| TC-AUTH-072 | Any | Logout without auth token returns 401 | P0 | 1. `POST /api/v1/auth/logout` no cookies, no header | HTTP 401; route requires `authenticate` middleware | API | |
| TC-AUTH-073 | Any | JWT remains valid in header after logout (stateless caveat) | P1 | 1. Login as Admin 2. Logout (cookies cleared) 3. `GET /api/v1/auth/profile` header `Authorization: Bearer <old_token_value>` | HTTP 200 (token is still valid until expiry — JWTs are stateless; server cannot invalidate before expiry; only cookies are cleared); **this is expected behaviour, not a bug** | Manual | Document stateless JWT caveat for security audit. Token expires after 1 hour. |
| TC-AUTH-074 | Any | After logout, using cleared cookie returns 401 | P0 | 1. Login as Admin 2. Logout 3. `GET /api/v1/auth/profile` with no header and the cleared cookie (value now empty string or absent) | HTTP 401; cookie value is cleared | Manual | Browser automatically sends empty/expired cookie; or replay with `accessToken=`|

---

## Section 01.8 — Change password

> Backend: `PUT /api/v1/auth/change-password` (requires `authenticate`). Validation via `changePasswordSchema`: `currentPassword` min 1; `newPassword` min 8 + uppercase + lowercase + digit.
> Frontend `/settings` page: client-side check uses min 6 and confirm-match (weaker than backend — backend always enforces the stricter 8-char + complexity rule).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-081 | Admin | Change password — correct currentPassword succeeds | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"AdminNew@456"}` 3. `POST /api/v1/auth/login` body `{"email":"admin@binny.com","password":"AdminNew@456"}` 4. Restore: change back to `Admin@123` | Step 2: HTTP 200; message "Password changed successfully"; Step 3: HTTP 200 with valid token | Integration | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-016: Change password — new password works for login" (uses dedicated temp user) |
| TC-AUTH-082 | Admin | Change password — wrong currentPassword returns 401 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"WrongPass99","newPassword":"AdminNew@456"}` | HTTP 401; message "Current password is incorrect"; password NOT changed | API | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-017" |
| TC-AUTH-083 | Any | Change password — newPassword shorter than 8 chars returns 400 | P0 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"Ab1defg"}` (7 chars) | HTTP 400; Zod error "New password must be at least 8 characters" | API | `changePasswordSchema` min 8 |
| TC-AUTH-084 | Any | Change password — newPassword missing uppercase returns 400 | P1 | 1. Login as Admin 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Admin@123","newPassword":"alllower123"}` | HTTP 400; regex error "Password must contain at least one uppercase letter, one lowercase letter, and one number" | API | `changePasswordSchema` regex |
| TC-AUTH-085 | Any | Change password — newPassword missing digit returns 400 | P1 | 1. Login as Admin 2. Body `{"currentPassword":"Admin@123","newPassword":"AllLettersNoDig"}` | HTTP 400; same regex error | API | |
| TC-AUTH-086 | Any | Change password — newPassword missing lowercase returns 400 | P1 | 1. Login as Admin 2. Body `{"currentPassword":"Admin@123","newPassword":"ALLUPPER123"}` | HTTP 400; regex error | API | AUTOMATION GAP |
| TC-AUTH-087 | Any | Change password — missing currentPassword field returns 400 | P0 | 1. Login as Admin 2. Body `{"newPassword":"AdminNew@456"}` | HTTP 400; Zod error `currentPassword` required (min 1 char) | API | |
| TC-AUTH-088 | Any | Change password — missing newPassword field returns 400 | P0 | 1. Login as Admin 2. Body `{"currentPassword":"Admin@123"}` | HTTP 400; Zod error `newPassword` required | API | AUTOMATION GAP |
| TC-AUTH-089 | Any | Change password — unauthenticated returns 401 | P0 | 1. `PUT /api/v1/auth/change-password` no token; body `{"currentPassword":"Admin@123","newPassword":"Admin@456X"}` | HTTP 401; "Authentication token is required" | API | |
| TC-AUTH-090 | Supervisor | Supervisor can change own password | P1 | 1. Login as Supervisor 2. `PUT /api/v1/auth/change-password` body `{"currentPassword":"Sup@123","newPassword":"SupNew@456X"}` 3. Restore | HTTP 200; login with new password works | Integration | No role restriction on change-password — all 4 roles allowed |
| TC-AUTH-091 | Warehouse Operator | Warehouse Operator can change own password | P1 | Same pattern as TC-AUTH-090 for Warehouse Operator | HTTP 200 | Integration | |
| TC-AUTH-092 | Dispatch Operator | Dispatch Operator can change own password | P1 | Same pattern as TC-AUTH-090 for Dispatch Operator | HTTP 200 | Integration | |
| TC-AUTH-093 | Any | Change password — newPassword exceeding 128 chars returns 400 | P2 | 1. Login as Admin 2. Body `{"currentPassword":"Admin@123","newPassword":"<129-char-string-with-Aa1>"}` | HTTP 400; Zod error max 128 | API | `changePasswordSchema` `.max(128)` |

---

## Section 01.9 — Playwright E2E: Login page & navigation

> **E2E spec file:** `frontend/e2e/01-auth.spec.ts` and `frontend/e2e/16-rbac-auth.spec.ts`
> Settings page has the change-password form. Button label is "Update Password" (not "Change Password" — verified in `settings/page.tsx`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-E001 | Any | Login page renders all required form elements | P0 | 1. Navigate to `http://localhost:3000/login` 2. Assert DOM | Page renders: heading "Binny Inventory"; email input with label "Email Address" and `type="email"`; password input with label "Password"; "Sign In" `<button type="submit">`; eye-toggle button (`tabIndex="-1"`); footer text "Powered by Basiq360"; no console errors | E2E | Realized by `01-auth.spec.ts` beforeEach + `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-001" |
| TC-AUTH-E002 | Any | Login page shows "Email is required" error when submitted empty | P1 | 1. Navigate to `/login` 2. Click "Sign In" without filling any field | Inline error "Email is required" below email input; "Password is required" below password input; form NOT submitted to server | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-007: Empty form validation" |
| TC-AUTH-E003 | Any | Login page shows "Please enter a valid email" for invalid format | P1 | 1. Navigate to `/login` 2. Set `novalidate` on form 3. Fill email with "not-an-email" and valid password 4. Click Sign In | Inline error "Please enter a valid email"; no API call | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-008" |
| TC-AUTH-E004 | Any | Login page shows "Password must be at least 6 characters" for short password | P1 | 1. Navigate to `/login` 2. Fill valid email 3. Type "12345" in password 4. Click Sign In | Inline error "Password must be at least 6 characters"; no API call | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-009" |
| TC-AUTH-E005 | Admin | Successful Admin login redirects to /dashboard and shows dashboard content | P0 | 1. Navigate to `/login` 2. Fill `admin@binny.com` / `Admin@123` 3. Click "Sign In" | URL changes to `/dashboard`; toast "Login successful" appears; "Total Child Boxes" heading visible; no console errors | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-001" and `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-002" |
| TC-AUTH-E006 | Any | Invalid credentials show error toast (react-hot-toast) | P0 | 1. Navigate to `/login` 2. Enter `admin@binny.com` / `WrongPass99` 3. Click "Sign In" | Error toast appears (react-hot-toast) containing "Invalid email or password"; URL remains `/login`; no navigation | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-003/004" |
| TC-AUTH-E007 | Any | Eye-toggle reveals and hides password text | P1 | 1. Navigate to `/login` 2. Type "Test@123" in password 3. Click eye-toggle (tabIndex=-1 button) 4. Toggle again | On first click: `type="password"` → `type="text"`; password visible; on second click: reverts to `type="password"` | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-010: Password visibility toggle" |
| TC-AUTH-E008 | Any | Unauthenticated navigation to /dashboard redirects to /login | P0 | 1. Clear `binny_token` and `binny_user` from localStorage 2. Navigate to `http://localhost:3000/dashboard` | Browser redirects to `/login`; dashboard content NOT rendered | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-011" and `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-006" |
| TC-AUTH-E009 | Any | Unauthenticated navigation to /users redirects to /login | P0 | 1. Clear localStorage 2. Navigate to `/users` | Redirect to `/login` | E2E | AUTOMATION GAP |
| TC-AUTH-E010 | Any | Already-authenticated user visiting /login redirects to /dashboard | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/login` | URL redirects to `/dashboard`; `useAuth(requireAuth=false)` redirects when `isAuthenticated && pathname === '/login'` | E2E | AUTOMATION GAP |
| TC-AUTH-E011 | Admin | Admin sidebar shows Users, Products, Customers, all core links | P0 | 1. Login as Admin 2. Inspect sidebar navigation | Sidebar contains links for "Dashboard", "Products", "Customers", "Users", "Child Boxes", "Master Cartons"; `isAdmin === true` in `useAuth` | E2E | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-003" |
| TC-AUTH-E012 | Supervisor | Supervisor sidebar shows Products, Customers, Users (isManager = true) | P0 | 1. Login as Supervisor 2. Inspect sidebar | "Products", "Customers", "Users" links visible; `isManager = isSupervisor || isAdmin` in `useAuth` | E2E | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-004". Note: Supervisor seeing Users link is driven by `isManager` flag in sidebar — the underlying API still 403s Supervisor on user mutations. |
| TC-AUTH-E013 | Warehouse Operator | Warehouse Operator sidebar does NOT show Products, Customers, or Users | P0 | 1. Login as Warehouse Operator 2. Inspect sidebar | "Products", "Customers", "Users" links absent; "Child Boxes", "Master Cartons", "Dashboard" visible | E2E | Realized by `16-rbac-auth.spec.ts` → "TC-RBAC-E2E-005" |
| TC-AUTH-E014 | Dispatch Operator | Dispatch Operator sidebar shows Dispatch module and not Products/Customers/Users | P1 | 1. Login as Dispatch Operator 2. Inspect sidebar | "Dispatch" link visible; "Products", "Users", "Customers" absent | E2E | AUTOMATION GAP — add Dispatch Operator sidebar TC to `16-rbac-auth.spec.ts` |
| TC-AUTH-E015 | Any | Settings page /settings shows Profile card and "Update Password" form | P1 | 1. Login as Admin 2. Navigate to `/settings` | Page has "Profile" card (name, email, role), "Change Password" section with "Current Password", "New Password", "Confirm New Password" inputs, and "Update Password" submit button | E2E | Realized by `01-auth.spec.ts` → "TC-AUTH-013: Settings page … Change Password form" — note button label is "Update Password" not "Change Password" |
| TC-AUTH-E016 | Any | /settings change-password client-side validation — passwords do not match | P1 | 1. Login as Admin 2. Navigate to `/settings` 3. Fill "Current Password" 4. Fill "New Password" = "NewPass@1" 5. Fill "Confirm New Password" = "Different@1" 6. Click "Update Password" | Toast error "Passwords do not match"; no API call made | E2E | `settings/page.tsx` client-side guard before API call. AUTOMATION GAP |
| TC-AUTH-E017 | Any | /settings change-password client-side validation — new password too short | P1 | 1. Login as Admin 2. Navigate to `/settings` 3. Fill short new password (5 chars) 4. Click "Update Password" | Toast error "Password must be at least 6 characters" (frontend min-length check; NOTE: this is weaker than backend 8-char check) | E2E | Frontend client guard uses 6 chars; backend rejects <8 chars. AUTOMATION GAP |

---

## Section 01.10 — RBAC denial matrix — Users

> **Permission guard used on routes:** `authorizePermission('users:create')`, `authorizePermission('users:read')`, `authorizePermission('users:update')`, `authorizePermission('users:delete')`.
> **Seeded grants:** Admin (all 4); Supervisor (create/read/update); Warehouse Operator (none); Dispatch Operator (none).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-101 | Supervisor | Supervisor CANNOT POST /users (create) | P0 | 1. Login as Supervisor 2. `POST /api/v1/users` header `Authorization: Bearer <sup_token>` body `{"email":"x@binny.com","password":"Test@1234","name":"X","role":"Warehouse Operator"}` | HTTP 403; no user created | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-001" |
| TC-AUTH-102 | Warehouse Operator | Warehouse Operator CANNOT POST /users | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/users` with valid body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-004" |
| TC-AUTH-103 | Dispatch Operator | Dispatch Operator CANNOT POST /users | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/users` with valid body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-006" |
| TC-AUTH-104 | Unauthenticated | Unauthenticated request to GET /users returns 401 | P0 | 1. `GET /api/v1/users` no token | HTTP 401 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-039" |
| TC-AUTH-105 | Supervisor | Supervisor CAN GET /users list (has users:read) | P1 | 1. Login as Supervisor 2. `GET /api/v1/users` | HTTP 200; user list returned | API | Seeded: Supervisor has `users:read` |
| TC-AUTH-106 | Warehouse Operator | Warehouse Operator CANNOT GET /users list (no users:read) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/users` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-005" |
| TC-AUTH-107 | Dispatch Operator | Dispatch Operator CANNOT GET /users list | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/users` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-007" |
| TC-AUTH-108 | Supervisor | Supervisor CANNOT PUT /users/:id (no users:update via authorizePermission — check actual route guard) | P0 | 1. Login as Supervisor 2. `PUT /api/v1/users/<uuid>` body `{"name":"Hacked"}` | HTTP 403; user unchanged | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-002". Supervisor has `users:update` in seed but route may use `authorize(ADMIN)` role-based guard — verify against user.routes.ts in phase-02 |
| TC-AUTH-109 | Supervisor | Supervisor CANNOT DELETE /users/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/users/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-003". Seeded: Supervisor lacks `users:delete` |
| TC-AUTH-110 | Warehouse Operator | Warehouse Operator CANNOT PUT /users/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/users/<uuid>` body `{"name":"Hacked"}` | HTTP 403 | API | |
| TC-AUTH-111 | Dispatch Operator | Dispatch Operator CANNOT DELETE /users/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/users/<uuid>` | HTTP 403 | API | |
| TC-AUTH-112 | Admin | Admin CAN POST /users (super-admin bypass) | P0 | 1. Login as Admin 2. `POST /api/v1/users` with valid body | HTTP 201; user created | API | Admin bypass applies to all permission checks |

---

## Section 01.11 — RBAC denial matrix — Products

> **Seeded grants:** Admin (all 4 actions); Supervisor (read/create/update); Warehouse Operator (read only); Dispatch Operator (read only).
> Read (`products:read`) is granted to all 4 roles so all authenticated users can GET products.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-121 | Warehouse Operator | Warehouse Operator CANNOT POST /products | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/products` body `{"article_name":"X","article_code":"X01","colour":"Red","size":"7","category":"Gents","section":"Hawaii","mrp":299}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-008" |
| TC-AUTH-122 | Dispatch Operator | Dispatch Operator CANNOT POST /products | P0 | 1. Login as Dispatch Operator 2. Same body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-011" |
| TC-AUTH-123 | Warehouse Operator | Warehouse Operator CANNOT PUT /products/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/products/<uuid>` body `{"mrp":999}` | HTTP 403; product unchanged | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-009" |
| TC-AUTH-124 | Dispatch Operator | Dispatch Operator CANNOT PUT /products/:id | P0 | 1. Login as Dispatch Operator 2. Same with dispatch token | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-012" |
| TC-AUTH-125 | Supervisor | Supervisor CANNOT DELETE /products/:id (no products:delete) | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/products/<uuid>` | HTTP 403; product not deleted | API | Seeded: Supervisor lacks `products:delete` |
| TC-AUTH-126 | Warehouse Operator | Warehouse Operator CANNOT DELETE /products/:id | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/products/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-010/014" |
| TC-AUTH-127 | Dispatch Operator | Dispatch Operator CANNOT DELETE /products/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/products/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-013" |
| TC-AUTH-128 | Warehouse Operator | Warehouse Operator CAN GET /products list (has products:read) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/products` | HTTP 200; product list returned | API | All 4 roles have `products:read` |
| TC-AUTH-129 | Dispatch Operator | Dispatch Operator CANNOT POST /products/bulk-upload | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/products/bulk-upload` multipart CSV | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-038" |
| TC-AUTH-130 | Warehouse Operator | Warehouse Operator CANNOT POST /products/bulk-upload | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/products/bulk-upload` multipart CSV | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-037" |
| TC-AUTH-131 | Unauthenticated | GET /products returns 401 without token | P0 | 1. `GET /api/v1/products` no token | HTTP 401 | API | |

---

## Section 01.12 — RBAC denial matrix — Sections

> **Seeded grants:** Admin only (create/read/update/delete). No non-Admin role has any `sections:*` permission.
> GET endpoints are auth-only (no `authorizePermission`) — all authenticated roles can read sections.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-141 | Supervisor | Supervisor CANNOT POST /sections | P0 | 1. Login as Supervisor 2. `POST /api/v1/sections` body `{"name":"ForbiddenSection"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-020" |
| TC-AUTH-142 | Warehouse Operator | Warehouse Operator CANNOT POST /sections | P0 | 1. Login as Warehouse Operator 2. Same request | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-023" |
| TC-AUTH-143 | Dispatch Operator | Dispatch Operator CANNOT POST /sections | P0 | 1. Login as Dispatch Operator 2. Same request | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-024" |
| TC-AUTH-144 | Supervisor | Supervisor CANNOT PUT /sections/:id | P0 | 1. Login as Supervisor 2. `PUT /api/v1/sections/<uuid>` body `{"name":"Renamed"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-021" |
| TC-AUTH-145 | Supervisor | Supervisor CANNOT DELETE /sections/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/sections/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-022" |
| TC-AUTH-146 | Warehouse Operator | Warehouse Operator CAN GET /sections (auth-only, no permission gate) | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/sections` | HTTP 200; sections list returned | API | GET routes have only `authenticate`, no `authorizePermission` |
| TC-AUTH-147 | Dispatch Operator | Dispatch Operator CAN GET /sections/:id | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/sections/<uuid>` | HTTP 200; section record returned | API | |
| TC-AUTH-148 | Unauthenticated | GET /sections returns 401 without token | P0 | 1. `GET /api/v1/sections` no token | HTTP 401 | API | |

---

## Section 01.13 — RBAC denial matrix — Customers

> **Seeded grants:** Admin only (create/read/update/delete). No non-Admin role has `customers:*`.
> GET endpoints are auth-only — all authenticated roles can read customers (needed for dispatch workflow).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-151 | Supervisor | Supervisor CANNOT POST /customers | P0 | 1. Login as Supervisor 2. `POST /api/v1/customers` body `{"firm_name":"WH Firm","customer_type":"Primary Dealer"}` | HTTP 403 | API | AUTOMATION GAP — `16-rbac-auth.spec.ts` only tests WH/Dispatch for customers |
| TC-AUTH-152 | Warehouse Operator | Warehouse Operator CANNOT POST /customers | P0 | 1. Login as Warehouse Operator 2. Same body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-015" |
| TC-AUTH-153 | Dispatch Operator | Dispatch Operator CANNOT POST /customers | P0 | 1. Login as Dispatch Operator 2. Same body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-018" |
| TC-AUTH-154 | Warehouse Operator | Warehouse Operator CANNOT PUT /customers/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/customers/<uuid>` body `{"firm_name":"Hacked"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-016" |
| TC-AUTH-155 | Dispatch Operator | Dispatch Operator CANNOT PUT /customers/:id | P0 | 1. Login as Dispatch Operator 2. Same | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-156 | Supervisor | Supervisor CANNOT DELETE /customers/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/customers/<uuid>` | HTTP 403 | API | No seeded `customers:delete` for Supervisor |
| TC-AUTH-157 | Warehouse Operator | Warehouse Operator CANNOT DELETE /customers/:id | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/customers/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-017" |
| TC-AUTH-158 | Dispatch Operator | Dispatch Operator CANNOT DELETE /customers/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/customers/<uuid>` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-019" |
| TC-AUTH-159 | Warehouse Operator | Warehouse Operator CAN GET /customers (auth-only) | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/customers` | HTTP 200; list returned | API | |
| TC-AUTH-160 | Dispatch Operator | Dispatch Operator CAN GET /customers/primary-dealers | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/customers/primary-dealers` | HTTP 200; primary dealers list returned (needed for dispatch) | API | |

---

## Section 01.14 — RBAC denial matrix — Child boxes

> **Seeded grants:** Admin (all 4); Supervisor (create/read/update); Warehouse Operator (create/read); Dispatch Operator (read only).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-161 | Dispatch Operator | Dispatch Operator CANNOT POST /child-boxes (single create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes` body `{"product_id":"<uuid>","quantity":12,"size":"6"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-033" |
| TC-AUTH-162 | Dispatch Operator | Dispatch Operator CANNOT POST /child-boxes/bulk | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk` with valid body | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-034" |
| TC-AUTH-163 | Dispatch Operator | Dispatch Operator CANNOT POST /child-boxes/bulk-multi-size | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk-multi-size` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-164 | Dispatch Operator | Dispatch Operator CANNOT POST /child-boxes/bulk-upload (CSV) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/child-boxes/bulk-upload` multipart CSV | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-165 | Warehouse Operator | Warehouse Operator CANNOT POST /child-boxes/bulk-upload/sample (Supervisor-only) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/child-boxes/bulk-upload/sample` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-166 | Warehouse Operator | Warehouse Operator CAN POST /child-boxes (has child_boxes:create) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/child-boxes` with valid product_id | HTTP 201; child box created | API | |
| TC-AUTH-167 | Dispatch Operator | Dispatch Operator CAN GET /child-boxes list (has child_boxes:read) | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/child-boxes` | HTTP 200 | API | |
| TC-AUTH-168 | Unauthenticated | GET /child-boxes returns 401 without token | P0 | 1. `GET /api/v1/child-boxes` no token | HTTP 401 | API | |

---

## Section 01.15 — RBAC denial matrix — Master cartons

> **Seeded grants:** Admin (all carton actions); Supervisor (create/read/update/close/reopen); Warehouse Operator (create/read/close); Dispatch Operator (read only).
> Packing actions (`packing:pack`, `packing:unpack`): Admin/Supervisor/Warehouse Operator have both.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-171 | Dispatch Operator | Dispatch Operator CANNOT POST /master-cartons (create) | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons` body `{"section_id":"<uuid>"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-035" |
| TC-AUTH-172 | Dispatch Operator | Dispatch Operator CANNOT POST /master-cartons/pack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/pack` body `{"master_carton_id":"<uuid>","child_box_id":"<uuid>"}` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-036" |
| TC-AUTH-173 | Dispatch Operator | Dispatch Operator CANNOT POST /master-cartons/unpack | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/unpack` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-174 | Dispatch Operator | Dispatch Operator CANNOT POST /master-cartons/:id/close | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/master-cartons/<uuid>/close` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-032" |
| TC-AUTH-175 | Warehouse Operator | Warehouse Operator CANNOT POST /master-cartons/:id/close — STALE; Warehouse Operator HAS cartons:close | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/master-cartons/<uuid>/close` with a valid ACTIVE carton | HTTP 200; carton closed. **CORRECTION from previous version**: Warehouse Operator has `cartons:close` in seed — this should SUCCEED, not 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-031" was wrong; seed confirms WH has `cartons:close`. Update spec if it currently expects 403. |
| TC-AUTH-176 | Warehouse Operator | Warehouse Operator CANNOT cartons:reopen (no reopen permission) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/master-cartons/<uuid>/reopen` or equivalent reopen route | HTTP 403; WH Operator lacks `cartons:reopen` | API | AUTOMATION GAP |
| TC-AUTH-177 | Warehouse Operator | Warehouse Operator CAN POST /master-cartons (create) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/master-cartons` body `{"section_id":"<valid_uuid>"}` | HTTP 201; master carton created | API | |
| TC-AUTH-178 | Supervisor | Supervisor CANNOT DELETE /master-cartons/:id (no cartons:delete) | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/master-cartons/<uuid>` | HTTP 403 | API | Seeded: Supervisor lacks `cartons:delete` |
| TC-AUTH-179 | Unauthenticated | GET /master-cartons returns 401 without token | P0 | 1. `GET /api/v1/master-cartons` no token | HTTP 401 | API | |
| TC-AUTH-180 | Dispatch Operator | Dispatch Operator CAN GET /master-cartons list (has cartons:read) | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/master-cartons` | HTTP 200 | API | |

---

## Section 01.16 — RBAC denial matrix — Samples (with GET discrepancy)

> **Seeded grants:** Admin only. No non-Admin role has any `samples:*` permission.
>
> **KNOWN DISCREPANCY (documented behavior — do NOT fix in this file):** The samples GET endpoints (`GET /samples`, `GET /samples/:id`, etc.) have only `authenticate` middleware — NO `authorizePermission`. Therefore any authenticated non-Admin user can READ samples via the API even though the UI hides the Samples module and the access matrix says Admin-only. All WRITE operations (`POST`, action endpoints) correctly require Admin permission and return 403. Encode both behaviors explicitly.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-191 | Supervisor | Supervisor CANNOT POST /samples (create) | P0 | 1. Login as Supervisor 2. `POST /api/v1/samples` body `{"recipient_name":"X"}` | HTTP 403; no sample created | API | Seeded: Supervisor has no `samples:*` |
| TC-AUTH-192 | Warehouse Operator | Warehouse Operator CANNOT POST /samples | P0 | 1. Login as Warehouse Operator 2. Same body | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-193 | Dispatch Operator | Dispatch Operator CANNOT POST /samples | P0 | 1. Login as Dispatch Operator 2. Same body | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-194 | Supervisor | Supervisor CANNOT POST /samples/add-box | P0 | 1. Login as Supervisor 2. `POST /api/v1/samples/add-box` body `{"sample_id":"<uuid>","child_box_id":"<uuid>","foot":"PAIR"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-195 | Supervisor | Supervisor CANNOT POST /samples/remove-box | P0 | 1. Login as Supervisor 2. `POST /api/v1/samples/remove-box` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-196 | Supervisor | Supervisor CANNOT POST /samples/:id/close | P0 | 1. Login as Supervisor 2. `POST /api/v1/samples/<uuid>/close` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-197 | Supervisor | Supervisor CANNOT POST /samples/:id/full-unpack | P0 | 1. Login as Supervisor 2. `POST /api/v1/samples/<uuid>/full-unpack` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-198 | Supervisor | Supervisor CAN GET /samples list (auth-only GET — documented discrepancy) | P1 | 1. Login as Supervisor 2. `GET /api/v1/samples` | HTTP 200; samples list returned (not 403); read is ungated despite matrix showing Admin-only | API | **Documented discrepancy — read ungated, writes Admin-only.** AUTOMATION GAP — add to spec |
| TC-AUTH-199 | Warehouse Operator | Warehouse Operator CAN GET /samples list (auth-only GET — documented discrepancy) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/samples` | HTTP 200; samples list returned | API | Documented discrepancy — read ungated. AUTOMATION GAP |
| TC-AUTH-200 | Dispatch Operator | Dispatch Operator CAN GET /samples list (auth-only GET — documented discrepancy) | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/samples` | HTTP 200; samples list returned | API | Documented discrepancy — read ungated. AUTOMATION GAP |
| TC-AUTH-201 | Unauthenticated | Unauthenticated GET /samples returns 401 | P0 | 1. `GET /api/v1/samples` no token | HTTP 401 (authenticate blocks unauthenticated even if no authorizePermission) | API | |
| TC-AUTH-202 | Admin | Admin CAN do all samples operations | P0 | 1. Login as Admin 2. `POST /api/v1/samples` body `{"recipient_name":"Test Recipient"}` | HTTP 201; Admin super-admin bypass passes authorizePermission | API | |

---

## Section 01.17 — RBAC denial matrix — E-commerce (with GET discrepancy)

> **Seeded grants:** Admin only. No non-Admin role has any `ecommerce:*` permission.
>
> **KNOWN DISCREPANCY (same as Samples):** E-commerce GET endpoints are auth-only (no `authorizePermission`). Any authenticated user can READ ecommerce data via API. All WRITE operations require Admin and return 403 for non-Admin.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-211 | Supervisor | Supervisor CANNOT POST /ecommerce (create) | P0 | 1. Login as Supervisor 2. `POST /api/v1/ecommerce` body `{"marketplace":"Amazon"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-212 | Warehouse Operator | Warehouse Operator CANNOT POST /ecommerce | P0 | 1. Login as Warehouse Operator 2. Same body | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-213 | Dispatch Operator | Dispatch Operator CANNOT POST /ecommerce | P0 | 1. Login as Dispatch Operator 2. Same body | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-214 | Supervisor | Supervisor CANNOT POST /ecommerce/add-box | P0 | 1. Login as Supervisor 2. `POST /api/v1/ecommerce/add-box` body `{"ecommerce_id":"<uuid>","child_box_id":"<uuid>"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-215 | Supervisor | Supervisor CANNOT POST /ecommerce/scan-carton | P0 | 1. Login as Supervisor 2. `POST /api/v1/ecommerce/scan-carton` body `{"master_carton_barcode":"MC0001","ecommerce_id":"<uuid>"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-216 | Supervisor | Supervisor CANNOT POST /ecommerce/:id/close | P0 | 1. Login as Supervisor 2. `POST /api/v1/ecommerce/<uuid>/close` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-217 | Supervisor | Supervisor CANNOT POST /ecommerce/:id/full-unpack | P0 | 1. Login as Supervisor 2. `POST /api/v1/ecommerce/<uuid>/full-unpack` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-218 | Supervisor | Supervisor CAN GET /ecommerce list (auth-only GET — documented discrepancy) | P1 | 1. Login as Supervisor 2. `GET /api/v1/ecommerce` | HTTP 200; ecommerce list returned (not 403) | API | **Documented discrepancy — read ungated, writes Admin-only.** AUTOMATION GAP |
| TC-AUTH-219 | Warehouse Operator | Warehouse Operator CAN GET /ecommerce list (auth-only GET — documented discrepancy) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/ecommerce` | HTTP 200 | API | Documented discrepancy. AUTOMATION GAP |
| TC-AUTH-220 | Dispatch Operator | Dispatch Operator CAN GET /ecommerce list (auth-only GET — documented discrepancy) | P1 | 1. Login as Dispatch Operator 2. `GET /api/v1/ecommerce` | HTTP 200 | API | Documented discrepancy. AUTOMATION GAP |
| TC-AUTH-221 | Supervisor | Supervisor CAN GET /ecommerce/stock (auth-only — documented discrepancy) | P1 | 1. Login as Supervisor 2. `GET /api/v1/ecommerce/stock` | HTTP 200; stock summary returned | API | Documented discrepancy. AUTOMATION GAP |
| TC-AUTH-222 | Unauthenticated | Unauthenticated GET /ecommerce returns 401 | P0 | 1. `GET /api/v1/ecommerce` no token | HTTP 401 | API | |

---

## Section 01.18 — RBAC denial matrix — Dispatches

> **Seeded grants:** Admin (create/read/update); Supervisor (read only); Warehouse Operator (none); Dispatch Operator (create/read/update).
> GET endpoints may be auth-only (no per-permission gate) — all authenticated roles can READ dispatches.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-231 | Warehouse Operator | Warehouse Operator CANNOT POST /dispatches (no dispatch:create) | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/dispatches` body `{"customer_id":"<uuid>","carton_ids":["<uuid>"],"vehicle_number":"MH01AB1234","dispatch_date":"2026-06-09"}` | HTTP 403 | API | AUTOMATION GAP |
| TC-AUTH-232 | Supervisor | Supervisor CANNOT POST /dispatches (no dispatch:create) | P0 | 1. Login as Supervisor 2. Same body | HTTP 403; Supervisor only has `dispatch:read` in seed | API | AUTOMATION GAP. Note: old matrix marked Supervisor as allowed — **corrected**; seed has only `dispatch:read` for Supervisor |
| TC-AUTH-233 | Dispatch Operator | Dispatch Operator CAN POST /dispatches | P0 | 1. Login as Dispatch Operator 2. Ensure a CLOSED master carton exists 3. `POST /api/v1/dispatches` with valid body | HTTP 201; dispatch record created | API | |
| TC-AUTH-234 | Admin | Admin CAN POST /dispatches | P0 | 1. Login as Admin 2. `POST /api/v1/dispatches` with valid body | HTTP 201 | API | |
| TC-AUTH-235 | Warehouse Operator | Warehouse Operator CAN GET /dispatches (auth-only, no permission gate) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/dispatches` | HTTP 200; dispatches list returned | API | If route only has `authenticate`, all roles get 200 |
| TC-AUTH-236 | Warehouse Operator | Warehouse Operator CAN GET /dispatches/:id (auth-only) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/dispatches/<uuid>` | HTTP 200; dispatch record returned | API | |
| TC-AUTH-237 | Unauthenticated | GET /dispatches returns 401 without token | P0 | 1. `GET /api/v1/dispatches` no token | HTTP 401 | API | |

---

## Section 01.19 — RBAC denial matrix — Inventory & Reports

> **Inventory endpoints:** Most are auth-only (only `authenticate`); `inventory:read` permission exists in catalog but may not be enforced on all routes. Dashboard and hierarchy are auth-only (all roles get 200). Transactions may or may not have a permission gate — cross-check with actual route file.
>
> **Reports:** `report.routes.ts` applies role-based or permission-based guards. Seeded: Admin (`reports:view_all` + `reports:export`); Supervisor (`reports:view_all` + `reports:export`); Warehouse Operator (`reports:view_own`); Dispatch Operator (`reports:view_dispatch`).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-241 | Warehouse Operator | Warehouse Operator CANNOT GET /reports/inventory-summary | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/reports/inventory-summary` | HTTP 403; no report data | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-025, 026, 027" |
| TC-AUTH-242 | Dispatch Operator | Dispatch Operator CANNOT GET /reports/inventory-summary | P0 | 1. Login as Dispatch Operator 2. Same | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-028" |
| TC-AUTH-243 | Warehouse Operator | Warehouse Operator CANNOT GET /reports/product-wise | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/reports/product-wise` | HTTP 403 | API | |
| TC-AUTH-244 | Dispatch Operator | Dispatch Operator CANNOT GET /reports/dispatch-summary | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/dispatch-summary` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-029" |
| TC-AUTH-245 | Dispatch Operator | Dispatch Operator CANNOT GET /reports/daily-activity | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/reports/daily-activity` | HTTP 403 | API | Realized by `16-rbac-auth.spec.ts` → "TC-DENY-030" |
| TC-AUTH-246 | Supervisor | Supervisor CAN GET /reports/inventory-summary (has reports:view_all) | P0 | 1. Login as Supervisor 2. `GET /api/v1/reports/inventory-summary` | HTTP 200; report data returned | API | |
| TC-AUTH-247 | Warehouse Operator | Warehouse Operator CAN GET /inventory/dashboard (auth-only) | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/inventory/dashboard` | HTTP 200; dashboard stats returned | API | Inventory routes only have `authenticate` |
| TC-AUTH-248 | Dispatch Operator | Dispatch Operator CAN GET /inventory/stock/hierarchy (auth-only) | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/inventory/stock/hierarchy` | HTTP 200; hierarchy data returned | API | |
| TC-AUTH-249 | Warehouse Operator | Warehouse Operator — GET /inventory/transactions status (discrepancy flag) | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/inventory/transactions` | **Expected per code: HTTP 200** (inventory routes only have `authenticate`). **Expected per access matrix: should be 403.** Verify actual route guard in `inventory.routes.ts` — if no `authorizePermission`, WH gets 200. Document actual result. | API | **Discrepancy:** access matrix says WH cannot see inventory transactions; current inventory routes may have no `authorizePermission` guard. Verify and update when routes are confirmed. |
| TC-AUTH-250 | Unauthenticated | GET /inventory/dashboard returns 401 without token | P0 | 1. `GET /api/v1/inventory/dashboard` no token | HTTP 401 | API | |
| TC-AUTH-251 | Unauthenticated | GET /reports/inventory-summary returns 401 without token | P0 | 1. `GET /api/v1/reports/inventory-summary` no token | HTTP 401 | API | |

---

## Section 01.20 — Stage-aware permissions (max_stage)

> The `authorizePermission` middleware supports an optional `stageCheck` option that fetches the resource's current status and compares it against the `max_stage` field in `role_permissions`. For ALL seeded default roles, `max_stage` is NULL — meaning the stage check is skipped and the full lifecycle is accessible. This section documents the mechanism with one dormant-by-default TC and one integration TC showing what behavior would look like with a non-NULL max_stage custom role.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-261 | Any | max_stage is NULL for all seeded role permissions | P1 | 1. Query DB: `SELECT DISTINCT max_stage FROM role_permissions` | All rows return `max_stage = NULL`; no non-null values for the four default roles | Integration | `seeds/001_roles.ts` seeds all with `max_stage = NULL`. Dormant for default roles. |
| TC-AUTH-262 | Custom | Custom role with max_stage=PACKED cannot act on CLOSED carton (stage-aware gate) | P1 | 1. Create a custom role via Role Manager 2. Assign it `cartons:update` permission with `max_stage = 'PACKED'` 3. Create user with this role 4. Login as that user 5. `PUT /api/v1/master-cartons/<uuid_of_CLOSED_carton>` | HTTP 403; message "Permission denied: cartons:update is restricted at stage CLOSED (your role allows up to PACKED)"; the stage check in `authorizePermission` blocks CLOSED > PACKED | Integration | Dormant for default roles. Stage order: CREATED(0) < ACTIVE(1) < CLOSED(2) < DISPATCHED(3). `stageIndex(CLOSED) > stageIndex(PACKED)` → deny. AUTOMATION GAP |
| TC-AUTH-263 | Custom | Custom role with max_stage=PACKED CAN act on ACTIVE carton | P1 | 1. Same custom role with `cartons:update` + `max_stage='PACKED'` 2. `PUT /api/v1/master-cartons/<uuid_of_ACTIVE_carton>` | HTTP 200 or appropriate 2xx; ACTIVE (index 1) <= PACKED (index 1 for child_box order — but for master_carton: ACTIVE=1, PACKED not in master_carton stages) — use ACTIVE <= CLOSED as the test case instead | Integration | Master carton stage order: CREATED=0, ACTIVE=1, CLOSED=2, DISPATCHED=3. AUTOMATION GAP |
| TC-AUTH-264 | Custom | Child-box SAMPLE and ECOMMERCE stages are treated as DISPATCHED (terminal) in stage index | P1 | 1. Create custom role with `child_boxes:update` + `max_stage='PACKED'` 2. Try to update a child box in SAMPLE status | HTTP 403; SAMPLE maps to DISPATCHED index (5) > PACKED (2) in child box stage order | Integration | `stageIndex` treats SAMPLE/ECOMMERCE/DISPATCHED as terminal. AUTOMATION GAP |
| TC-AUTH-265 | Any | useCan hook skips stage check when max_stage is null (frontend parity) | P1 | 1. Login as Supervisor 2. Check `useCan('cartons:update', { stage: 'CLOSED', stageOrder: ['CREATED','ACTIVE','CLOSED','DISPATCHED'] })` | Returns `true` because `match.max_stage === null` → early return grant (line 19 in `useCan.ts`) | Manual | Frontend `useCan.ts` line 19 |

---

## Section 01.21 — Frontend permission propagation (useCan / useAuth)

> Verifies that the `permissions` array received at login is stored in Zustand `authStore` and correctly queried by `useCan` and `useAuth` hooks.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-AUTH-271 | Admin | authStore stores user with permissions array after login | P0 | 1. Login as Admin via UI 2. In browser console: `useAuthStore.getState().user.permissions` | Array of 47 `{permission, max_stage}` objects; includes `samples:create`, `roles:manage` | E2E | AUTOMATION GAP — add Playwright assertion inspecting window.localStorage `binny_user` |
| TC-AUTH-272 | Warehouse Operator | authStore.user.permissions reflects WH Operator's 9 permissions | P0 | 1. Login as Warehouse Operator 2. Check `binny_user` in localStorage | `permissions` array has 9 items; does NOT include `products:create`, `samples:create` | E2E | AUTOMATION GAP |
| TC-AUTH-273 | Admin | useAuth.isAdmin returns true for Admin, false for others | P1 | 1. Login as Admin 2. Inspect `useAuth()` return 3. Repeat for Supervisor | Admin: `isAdmin=true`, `isSupervisor=false`; Supervisor: `isAdmin=false`, `isSupervisor=true`, `isManager=true` | Manual | `useAuth.ts` derives from `user.role === 'Admin'` |
| TC-AUTH-274 | Admin | useAuth.isManager returns true for both Admin and Supervisor | P1 | 1. Login as Admin → `isManager=true` 2. Login as Supervisor → `isManager=true` 3. Login as Warehouse Operator → `isManager=false` | Verified; `isManager = role === 'Supervisor' \|\| role === 'Admin'` | Manual | |
| TC-AUTH-275 | Warehouse Operator | useCan('products:create') returns false for Warehouse Operator | P1 | 1. Login as Warehouse Operator 2. Evaluate `useCan('products:create')` | `false`; no matching permission in 9-item array | Manual | `useCan.ts` returns `false` when `match` is undefined |
| TC-AUTH-276 | Admin | useCan('samples:create') returns true for Admin | P1 | 1. Login as Admin 2. Evaluate `useCan('samples:create')` | `true`; Admin has full catalog including `samples:create` | Manual | |
| TC-AUTH-277 | Any | checkAuth rehydrates permissions from localStorage on page refresh | P1 | 1. Login as Admin 2. Reload page (F5) 3. Before API profile refresh completes, check `authStore.user.permissions` | Permissions restored from cached `binny_user` in localStorage; `checkAuth` sets `isAuthenticated=true` from cache first, then refreshes via `getProfile` in background | Manual | `authStore.ts` `checkAuth` uses `localStorage` before background API validate |
| TC-AUTH-278 | Any | getProfile call in background updates permissions if role_permissions changed | P1 | 1. Login as Supervisor 2. Admin grants Supervisor `samples:create` via Role Manager 3. Reload Supervisor's page | After background `getProfile` resolves, `authStore.user.permissions` includes `samples:create`; UI re-renders gated components | Integration | `authStore.ts` background `.then((user) => { set({ user }) })` |

---

## Automation coverage summary

### Realized by existing specs

| TC ID range | Spec file | Describe block |
|---|---|---|
| TC-AUTH-001–004 | `16-rbac-auth.spec.ts` | "TC-RBAC: Login per role — API" (TC-RBAC-001–004) |
| TC-AUTH-011–014, 018–019 | `16-rbac-auth.spec.ts` | "TC-RBAC: Login failures — API" (TC-RBAC-005–010) |
| TC-AUTH-041, 042, 044 | `16-rbac-auth.spec.ts` | "TC-RBAC: Token & Session — API" (TC-RBAC-011–013) |
| TC-AUTH-061–062, 071, 081–082 | `16-rbac-auth.spec.ts` | TC-RBAC-014–018 |
| TC-AUTH-E001–E008, E011–E013 | `01-auth.spec.ts` + `16-rbac-auth.spec.ts` | TC-AUTH-001/007/008/009/010/011; TC-RBAC-E2E-001–006 |
| TC-AUTH-101–103, 106–109 | `16-rbac-auth.spec.ts` | TC-DENY-001–007 |
| TC-AUTH-121–127, 129–130 | `16-rbac-auth.spec.ts` | TC-DENY-008–014, 037–038 |
| TC-AUTH-152–158 | `16-rbac-auth.spec.ts` | TC-DENY-015–019 |
| TC-AUTH-141–145 | `16-rbac-auth.spec.ts` | TC-DENY-020–024 |
| TC-AUTH-161–162 | `16-rbac-auth.spec.ts` | TC-DENY-033–034 |
| TC-AUTH-171–172, 174 | `16-rbac-auth.spec.ts` | TC-DENY-031–032, 035–036 |
| TC-AUTH-241–245 | `16-rbac-auth.spec.ts` | TC-DENY-025–030 |

### Automation gaps (recommended new Playwright tests)

All gaps should be added to `frontend/e2e/16-rbac-auth.spec.ts` unless noted.

| Proposed test name | TC IDs covered | Priority |
|---|---|---|
| "Login response includes permissions array with correct count per role" | TC-AUTH-001–004 extension, TC-AUTH-008–009 | P0 |
| "Login response body does not contain password_hash or refreshToken" | TC-AUTH-005, TC-AUTH-037 | P0 |
| "JWT payload contains userId, email, roleId; exp is ~3600s" | TC-AUTH-031–032, TC-AUTH-035 | P0 |
| "Access token cookie Max-Age is 3600; refresh cookie is 604800" | TC-AUTH-033–034 | P1 |
| "GET /auth/profile returns permissions array for all 4 roles" | TC-AUTH-062–064 | P0 |
| "401 vs 403: valid token + missing permission → 403; no token → 401" | TC-AUTH-048–049 | P0 |
| "JWT with wrong secret returns 401" | TC-AUTH-043 | P1 |
| "Bearer with two parts (no sig) returns 401; empty Bearer returns 401" | TC-AUTH-045–046 | P1 |
| "Inactive user refresh token returns 401" | TC-AUTH-055 | P1 |
| "Login missing email/password fields returns 400" | TC-AUTH-015–016 | P0 |
| "Supervisor CANNOT POST /dispatches (only dispatch:read)" | TC-AUTH-232 | P0 |
| "Supervisor CAN GET /samples and GET /ecommerce (auth-only discrepancy)" | TC-AUTH-198, TC-AUTH-218 | P1 |
| "Warehouse Operator and Dispatch Operator CAN GET /samples and GET /ecommerce" | TC-AUTH-199–200, TC-AUTH-219–220 | P1 |
| "Supervisor CANNOT write to /samples and /ecommerce" | TC-AUTH-191–197, TC-AUTH-211–217 | P0 |
| "Warehouse Operator CAN close master carton (has cartons:close — correcting stale TC)" | TC-AUTH-175 | P0 |
| "After logout, using old token in header still succeeds (stateless JWT caveat)" | TC-AUTH-073 | P2 |
| "Dispatch Operator sidebar shows Dispatch, excludes Products/Users/Customers" | TC-AUTH-E014 | P1 |
| "Already-authenticated user at /login redirects to /dashboard" | TC-AUTH-E010 | P1 |
| "/settings passwords-do-not-match toast" (add to `01-auth.spec.ts`) | TC-AUTH-E016 | P1 |
| "stage-aware permission blocks CLOSED carton for max_stage=PACKED role" | TC-AUTH-262 | P1 (Integration) |
