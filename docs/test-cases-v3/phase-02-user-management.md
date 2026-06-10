# Phase 02 — User Management

**Module code:** `USR`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Refreshed:** 2026-06-09

> **RBAC (verified against `backend/src/routes/user.routes.ts` + `backend/seeds/001_roles.ts`):**
> All routes use `authorizePermission()` (permission-based), NOT role-name guards.
> - `users:create` — Admin ✓, Supervisor ✓, Warehouse Op ✗, Dispatch Op ✗
> - `users:read` — Admin ✓, Supervisor ✓, Warehouse Op ✗, Dispatch Op ✗
> - `users:update` — Admin ✓, Supervisor ✓, Warehouse Op ✗, Dispatch Op ✗
> - `users:delete` — Admin ✓, Supervisor ✗, Warehouse Op ✗, Dispatch Op ✗
>
> **Frontend guard:** `useCan('users:read')` renders "Access Denied" shield for Warehouse Op and Dispatch Op. Supervisor sees the full table BUT the "Add User" button renders only when `useCan('users:create')` is true (Supervisor = true). Supervisor therefore also sees the Add User button and can create via UI. This is correct per RBAC; old note "Only administrators can manage users" was stale.
>
> **DELETE is a soft-delete:** `DELETE /users/:id` sets `is_active = false`; user row is preserved.
>
> **No self-delete / self-deactivation guard** exists in the service. An Admin can DELETE themselves or PUT `is_active:false` on their own account. Documented as open risk TCs.
>
> **Audit logging:** CREATE_USER, UPDATE_USER, DELETE_USER events are written to audit log.

---

## Table of Contents

- [Section 02.0 — Unauthenticated access](#section-020--unauthenticated-access)
- [Section 02.1 — Seed: Create test users](#section-021--seed-create-test-users)
- [Section 02.2 — Create user — RBAC (4-role rule)](#section-022--create-user--rbac-4-role-rule)
- [Section 02.3 — Create user — happy path (all 4 roles)](#section-023--create-user--happy-path-all-4-roles)
- [Section 02.4 — Create user — validation](#section-024--create-user--validation)
- [Section 02.5 — List users — RBAC (4-role rule)](#section-025--list-users--rbac-4-role-rule)
- [Section 02.6 — List users — happy path + filters](#section-026--list-users--happy-path--filters)
- [Section 02.7 — Get user by ID — RBAC (4-role rule)](#section-027--get-user-by-id--rbac-4-role-rule)
- [Section 02.8 — Get user by ID — happy path + edge cases](#section-028--get-user-by-id--happy-path--edge-cases)
- [Section 02.9 — Update user — RBAC (4-role rule)](#section-029--update-user--rbac-4-role-rule)
- [Section 02.10 — Update user — happy path](#section-0210--update-user--happy-path)
- [Section 02.11 — Update user — validation](#section-0211--update-user--validation)
- [Section 02.12 — Delete user (soft) — RBAC (4-role rule)](#section-0212--delete-user-soft--rbac-4-role-rule)
- [Section 02.13 — Delete user (soft) — happy path + edge cases](#section-0213--delete-user-soft--happy-path--edge-cases)
- [Section 02.14 — Activate / deactivate via PUT](#section-0214--activate--deactivate-via-put)
- [Section 02.15 — Self-action guardrail TCs](#section-0215--self-action-guardrail-tcs)
- [Section 02.16 — Audit logging](#section-0216--audit-logging)
- [Section 02.17 — Role assignment — all 4 target roles](#section-0217--role-assignment--all-4-target-roles)
- [Section 02.18 — Password handling](#section-0218--password-handling)
- [Section 02.19 — Frontend E2E — Users page (Admin)](#section-0219--frontend-e2e--users-page-admin)
- [Section 02.20 — Frontend E2E — Users page (Supervisor)](#section-0220--frontend-e2e--users-page-supervisor)
- [Section 02.21 — Frontend E2E — Users page (denied roles)](#section-0221--frontend-e2e--users-page-denied-roles)

---

## Section 02.0 — Unauthenticated access

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-001 | Unauthenticated | POST /users without token returns 401 | P0 | 1. `POST /api/v1/users` with no `Authorization` header, body `{"email":"x@y.com","password":"Test@1234","name":"X","role":"Supervisor"}` | HTTP 401; `success === false`; body contains "Authentication required" | API | Realized by: AUTOMATION GAP — add unauth test to `25-users-admin.spec.ts` |
| TC-USR-002 | Unauthenticated | GET /users without token returns 401 | P0 | 1. `GET /api/v1/users` with no `Authorization` header | HTTP 401 | API | Realized by: AUTOMATION GAP |
| TC-USR-003 | Unauthenticated | GET /users/:id without token returns 401 | P0 | 1. `GET /api/v1/users/00000000-0000-0000-0000-000000000001` with no header | HTTP 401 | API | Realized by: AUTOMATION GAP |
| TC-USR-004 | Unauthenticated | PUT /users/:id without token returns 401 | P0 | 1. `PUT /api/v1/users/00000000-0000-0000-0000-000000000001` body `{"name":"X"}` with no header | HTTP 401 | API | Realized by: AUTOMATION GAP |
| TC-USR-005 | Unauthenticated | DELETE /users/:id without token returns 401 | P0 | 1. `DELETE /api/v1/users/00000000-0000-0000-0000-000000000001` with no header | HTTP 401 | API | Realized by: AUTOMATION GAP |
| TC-USR-006 | Unauthenticated | /users page redirects to login | P0 | 1. Open browser without a session 2. Navigate to `http://localhost:3000/users` | Browser redirects to `/login`; no user data visible | E2E | Next.js middleware auth guard |

---

## Section 02.1 — Seed: Create test users

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-SEED-001 | Admin | Create standard test user accounts for the full v3 suite | P0 | 1. Login as Admin, obtain `admin_token` 2. `POST /api/v1/users` `{"email":"supervisor@binny.com","password":"Sup@123","name":"Test Supervisor","role":"Supervisor"}` 3. `POST /api/v1/users` `{"email":"warehouse@binny.com","password":"Wh@123","name":"Test Warehouse","role":"Warehouse Operator"}` 4. `POST /api/v1/users` `{"email":"dispatch@binny.com","password":"Dp@123","name":"Test Dispatch","role":"Dispatch Operator"}` | Each POST returns HTTP 201; each response has `id` (UUID), `email`, `name`, `role`, `is_active === true`; all three appear in `GET /api/v1/users`; all three can authenticate via `POST /api/v1/auth/login` | Integration | Run once before entire v3 suite; HTTP 409 = already exists, skip gracefully |

---

## Section 02.2 — Create user — RBAC (4-role rule)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-010 | Admin | Admin CAN create a user (`users:create`) | P0 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"adm-create@binny.com","password":"Test@1234","name":"Admin Create Test","role":"Supervisor"}` | HTTP 201; user created | API | Realized by: `TC-USER-001` in `25-users-admin.spec.ts` |
| TC-USR-011 | Supervisor | Supervisor CAN create a user (`users:create`) | P0 | 1. Login as Supervisor 2. `POST /api/v1/users` with `supervisor_token`, body `{"email":"sup-create-${TS}@binny.com","password":"Test@1234","name":"Sup Create Test","role":"Warehouse Operator"}` | HTTP 201; `data.role === "Warehouse Operator"`; `data.is_active === true` | API | Supervisor has `users:create` in seed — AUTOMATION GAP in `25-users-admin.spec.ts` (only Admin creates in existing spec) |
| TC-USR-012 | Warehouse Operator | Warehouse Op CANNOT create a user | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/users` with `warehouse_token`, body `{"email":"wh-create@binny.com","password":"Test@1234","name":"WH Create","role":"Supervisor"}` | HTTP 403; `success === false`; `message` contains "Required permission: users:create" | API | Realized by: AUTOMATION GAP |
| TC-USR-013 | Dispatch Operator | Dispatch Op CANNOT create a user | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/users` with `dispatch_token`, body `{"email":"dp-create@binny.com","password":"Test@1234","name":"DP Create","role":"Supervisor"}` | HTTP 403; `success === false` | API | Realized by: AUTOMATION GAP |

---

## Section 02.3 — Create user — happy path (all 4 roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-020 | Admin | Admin creates Supervisor — response shape correct | P0 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"newsup@binny.com","password":"Sup@1234","name":"New Supervisor","role":"Supervisor"}` | HTTP 201; `data.email === "newsup@binny.com"`, `data.role === "Supervisor"`, `data.is_active === true`; `data.id` is a valid UUID; response does NOT contain `password_hash` | API | Realized by: `TC-USER-001` in `25-users-admin.spec.ts` |
| TC-USR-021 | Admin | Admin creates Warehouse Operator | P0 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"newwh@binny.com","password":"Wh@12345","name":"New Warehouse","role":"Warehouse Operator"}` | HTTP 201; `data.role === "Warehouse Operator"` | API | Realized by: `TC-USER-002` in `25-users-admin.spec.ts` |
| TC-USR-022 | Admin | Admin creates Dispatch Operator | P0 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"newdp@binny.com","password":"Dp@12345","name":"New Dispatch","role":"Dispatch Operator"}` | HTTP 201; `data.role === "Dispatch Operator"` | API | Realized by: `TC-USER-003` in `25-users-admin.spec.ts` |
| TC-USR-023 | Admin | Admin creates another Admin | P1 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"admin2@binny.com","password":"Admin@1234","name":"Admin Two","role":"Admin"}` | HTTP 201; `data.role === "Admin"`; new Admin can login and perform Admin operations | API | Realized by: AUTOMATION GAP |
| TC-USR-024 | Admin | Created user appears in GET /users list | P0 | 1. `POST /api/v1/users` note returned `id` 2. `GET /api/v1/users` | `data` array contains new user matching `id`, `email`, `role` | Integration | Realized by: AUTOMATION GAP (implicit in `TC-USER-004`) |
| TC-USR-025 | Admin | Created user can authenticate immediately | P0 | 1. `POST /api/v1/users` `{"email":"logintest@binny.com","password":"Login@123","name":"Login Test","role":"Warehouse Operator"}` 2. `POST /api/v1/auth/login` `{"email":"logintest@binny.com","password":"Login@123"}` | Step 2 → HTTP 200 with valid `accessToken`; `user.role === "Warehouse Operator"` | Integration | Realized by: AUTOMATION GAP |
| TC-USR-026 | Admin | Duplicate email returns 409 | P0 | 1. Create user with `email="dup@binny.com"` 2. `POST /api/v1/users` again with same email, different `name`/`role` | HTTP 409; `message === "Email already exists"`; no second user row in DB | API | ConflictError in `user.service.createUser`; realized by: `TC-USER-009` in `25-users-admin.spec.ts` |
| TC-USR-027 | Admin | Email is lowercased and trimmed on create | P1 | 1. `POST /api/v1/users` `{"email":"  UPPER@Binny.COM  ","password":"Test@1234","name":"Case Test","role":"Supervisor"}` | HTTP 201; `data.email === "upper@binny.com"` (trimmed + toLowerCase applied by Zod schema) | API | `createUserSchema` `.trim().toLowerCase()` — AUTOMATION GAP |
| TC-USR-028 | Supervisor | Supervisor creates user — created_by recorded | P1 | 1. Login as Supervisor, note `supervisor_id` from profile 2. `POST /api/v1/users` with supervisor token, body `{"email":"sup-audit@binny.com","password":"Test@1234","name":"Sup Audit","role":"Warehouse Operator"}` 3. Login as Admin 4. Check audit log for `action === "CREATE_USER"` and `userId === supervisor_id` | Audit log entry exists with correct `userId` (the Supervisor who created) and `entityType === "user"` | Integration | `createAuditLog` called with `createdBy` = `req.user!.userId` — AUTOMATION GAP |

---

## Section 02.4 — Create user — validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-040 | Admin | Missing email → 400 | P0 | 1. `POST /api/v1/users` `{"password":"Test@1234","name":"No Email","role":"Supervisor"}` | HTTP 400; Zod error for required `email` field | API | Realized by: `TC-USER-VAL-001` in `25-users-admin.spec.ts` |
| TC-USR-041 | Admin | Invalid email format → 400 | P0 | 1. `POST /api/v1/users` `{"email":"notanemail","password":"Test@1234","name":"Bad Email","role":"Supervisor"}` | HTTP 400; Zod error "Invalid email address" | API | Realized by: `TC-USER-VAL-003` in `25-users-admin.spec.ts` |
| TC-USR-042 | Admin | Missing password → 400 | P0 | 1. `POST /api/v1/users` `{"email":"np@binny.com","name":"No Pass","role":"Supervisor"}` | HTTP 400; Zod error for required `password` | API | Realized by: AUTOMATION GAP |
| TC-USR-043 | Admin | Password < 8 chars → 400 | P0 | 1. `POST /api/v1/users` `{"email":"short@binny.com","password":"Ab1234","name":"Short","role":"Supervisor"}` | HTTP 400; Zod error "Password must be at least 8 characters" | API | Realized by: `TC-USER-VAL-004` in `25-users-admin.spec.ts` |
| TC-USR-044 | Admin | Password > 128 chars → 400 | P1 | 1. `POST /api/v1/users` `{"email":"longpw@binny.com","password":"<129-char string>","name":"Long PW","role":"Supervisor"}` | HTTP 400; Zod error "Password must not exceed 128 characters" | API | Realized by: AUTOMATION GAP |
| TC-USR-045 | Admin | Missing name → 400 | P0 | 1. `POST /api/v1/users` `{"email":"nn@binny.com","password":"Test@1234","role":"Supervisor"}` | HTTP 400; Zod error for required `name` | API | Realized by: `TC-USER-VAL-002` in `25-users-admin.spec.ts` |
| TC-USR-046 | Admin | Name < 2 chars → 400 | P1 | 1. `POST /api/v1/users` `{"email":"n@binny.com","password":"Test@1234","name":"X","role":"Supervisor"}` | HTTP 400; Zod error "Name must be at least 2 characters" | API | Realized by: AUTOMATION GAP |
| TC-USR-047 | Admin | Name > 100 chars → 400 | P1 | 1. `POST /api/v1/users` body with `name` as 101-char string | HTTP 400; Zod error "Name must not exceed 100 characters" | API | Realized by: AUTOMATION GAP |
| TC-USR-048 | Admin | Missing role → 400 | P0 | 1. `POST /api/v1/users` `{"email":"nr@binny.com","password":"Test@1234","name":"No Role"}` | HTTP 400; Zod error for required `role` field | API | Realized by: AUTOMATION GAP |
| TC-USR-049 | Admin | Invalid role value → 400 | P0 | 1. `POST /api/v1/users` `{"email":"bad@binny.com","password":"Test@1234","name":"Bad Role","role":"Manager"}` | HTTP 400; Zod enum error listing valid roles: Admin, Supervisor, Warehouse Operator, Dispatch Operator | API | `roleValues = Object.values(USER_ROLES)`; realized by: `TC-USER-VAL-005` in `25-users-admin.spec.ts` |
| TC-USR-050 | Admin | Email > 255 chars → 400 | P2 | 1. `POST /api/v1/users` with `email` as 256-char string | HTTP 400; Zod error "Email must not exceed 255 characters" | API | Realized by: AUTOMATION GAP |
| TC-USR-051 | Admin | Role name is case-sensitive (lowercase fails) | P2 | 1. `POST /api/v1/users` `{"email":"roles@binny.com","password":"Test@1234","name":"R","role":"supervisor"}` (lowercase) | HTTP 400; Zod enum error (enum values are Title-Case) | API | USER_ROLES constants: 'Admin', 'Supervisor', 'Warehouse Operator', 'Dispatch Operator' — AUTOMATION GAP |

---

## Section 02.5 — List users — RBAC (4-role rule)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-060 | Admin | Admin CAN GET /users (`users:read`) | P0 | 1. Login as Admin 2. `GET /api/v1/users` | HTTP 200; `data` is an array; pagination meta present | API | Realized by: `TC-USER-004` in `25-users-admin.spec.ts` |
| TC-USR-061 | Supervisor | Supervisor CAN GET /users (`users:read`) | P0 | 1. Login as Supervisor 2. `GET /api/v1/users` with `supervisor_token` | HTTP 200; list returned | API | Supervisor has `users:read` in seed — AUTOMATION GAP (spec only tests Admin) |
| TC-USR-062 | Warehouse Operator | Warehouse Op CANNOT GET /users | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/users` with `warehouse_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-USR-063 | Dispatch Operator | Dispatch Op CANNOT GET /users | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/users` with `dispatch_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |

---

## Section 02.6 — List users — happy path + filters

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-070 | Admin | GET /users returns paginated list with defaults | P0 | 1. Login as Admin 2. `GET /api/v1/users` | HTTP 200; body contains `data` (array), `total` (int), `page === 1`, `limit === 25`, `totalPages` (int); each user object has `id`, `email`, `name`, `role`, `is_active`, `created_at` | API | Realized by: `TC-USER-004` in `25-users-admin.spec.ts` |
| TC-USR-071 | Admin | GET /users with ?page=2&limit=2 returns correct page | P1 | 1. Ensure ≥3 users exist 2. `GET /api/v1/users?page=2&limit=2` | HTTP 200; `data.length <= 2`; `page === 2`; `limit === 2`; items differ from page 1 | API | Realized by: AUTOMATION GAP |
| TC-USR-072 | Admin | GET /users with ?role=Supervisor filters correctly | P1 | 1. `GET /api/v1/users?role=Supervisor` | HTTP 200; every item in `data` has `role === "Supervisor"`; no Admin/Warehouse Op rows | API | `r.name = $N` filter in `user.service.getUsers` — AUTOMATION GAP |
| TC-USR-073 | Admin | GET /users with ?search=warehouse searches name and email (ILIKE) | P1 | 1. Ensure user with name "Test Warehouse" exists 2. `GET /api/v1/users?search=warehouse` | HTTP 200; result includes that user; search is case-insensitive ILIKE on `name OR email` | API | Realized by: AUTOMATION GAP |
| TC-USR-074 | Admin | GET /users with ?is_active=false returns only inactive users | P1 | 1. Deactivate a user 2. `GET /api/v1/users?is_active=false` | HTTP 200; all returned users have `is_active === false` | API | Realized by: AUTOMATION GAP |
| TC-USR-075 | Admin | GET /users with ?is_active=true returns only active users | P1 | 1. `GET /api/v1/users?is_active=true` | HTTP 200; all returned users have `is_active === true` | API | Realized by: AUTOMATION GAP |
| TC-USR-076 | Admin | GET /users does NOT include password_hash | P0 | 1. `GET /api/v1/users` 2. Inspect every object in `data` | No object contains field `password_hash`; USER_SELECT projection only selects safe fields | API | USER_SELECT = `u.id, u.email, u.name, r.name as role, u.is_active, u.last_login_at, u.created_at, u.updated_at` — AUTOMATION GAP |
| TC-USR-077 | Admin | GET /users with ?role=InvalidRole returns 400 | P2 | 1. `GET /api/v1/users?role=NotARole` | HTTP 400; Zod enum error from `userListQuerySchema` | API | Realized by: AUTOMATION GAP |
| TC-USR-078 | Admin | GET /users ordered by created_at DESC | P2 | 1. Create user A then user B 2. `GET /api/v1/users` | User B appears before user A in `data` array (most-recent first) | API | `ORDER BY u.created_at DESC` in service — AUTOMATION GAP |
| TC-USR-079 | Supervisor | Supervisor GET /users does not expose password_hash | P1 | 1. Login as Supervisor 2. `GET /api/v1/users` 3. Inspect `data` array | No `password_hash` field present; same safe projection | API | AUTOMATION GAP |

---

## Section 02.7 — Get user by ID — RBAC (4-role rule)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-090 | Admin | Admin CAN GET /users/:id (`users:read`) | P0 | 1. Login as Admin 2. Note a valid user UUID 3. `GET /api/v1/users/<uuid>` | HTTP 200; user record returned | API | Realized by: `TC-USER-005` in `25-users-admin.spec.ts` |
| TC-USR-091 | Supervisor | Supervisor CAN GET /users/:id (`users:read`) | P0 | 1. Login as Supervisor 2. `GET /api/v1/users/<valid_uuid>` with `supervisor_token` | HTTP 200; user record returned | API | AUTOMATION GAP |
| TC-USR-092 | Warehouse Operator | Warehouse Op CANNOT GET /users/:id | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/users/<valid_uuid>` with `warehouse_token` | HTTP 403 | API | AUTOMATION GAP |
| TC-USR-093 | Dispatch Operator | Dispatch Op CANNOT GET /users/:id | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/users/<valid_uuid>` with `dispatch_token` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 02.8 — Get user by ID — happy path + edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-100 | Admin | GET /users/:id returns correct user with full fields | P0 | 1. Create user, note `id` 2. `GET /api/v1/users/<id>` | HTTP 200; `data.id === <id>`; response contains `email`, `name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at`; no `password_hash` | API | Realized by: `TC-USER-005` in `25-users-admin.spec.ts` |
| TC-USR-101 | Admin | GET /users/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/users/00000000-0000-0000-0000-000000000000` | HTTP 404; `message === "User not found"` | API | NotFoundError in `user.service.getUserById` — AUTOMATION GAP |
| TC-USR-102 | Admin | GET /users/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/users/not-a-uuid` | HTTP 400; Zod error "Invalid user ID format" | API | `userIdParamSchema` `.uuid()` — AUTOMATION GAP |
| TC-USR-103 | Admin | GET /users/:id for inactive user returns 200 (record still exists) | P1 | 1. Deactivate a user 2. `GET /api/v1/users/<id>` | HTTP 200; `data.is_active === false`; user record still returned (soft-delete: row exists) | API | AUTOMATION GAP |
| TC-USR-104 | Supervisor | Supervisor GET /users/:id does not expose password_hash | P1 | 1. Login as Supervisor 2. `GET /api/v1/users/<valid_id>` | HTTP 200; `data` does not contain `password_hash` | API | AUTOMATION GAP |

---

## Section 02.9 — Update user — RBAC (4-role rule)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-110 | Admin | Admin CAN PUT /users/:id (`users:update`) | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` `{"name":"Updated By Admin"}` | HTTP 200; name updated | API | Realized by: `TC-USER-006` in `25-users-admin.spec.ts` |
| TC-USR-111 | Supervisor | Supervisor CAN PUT /users/:id (`users:update`) | P0 | 1. Login as Supervisor 2. `PUT /api/v1/users/<other_user_id>` `{"name":"Updated By Sup"}` with `supervisor_token` | HTTP 200; `data.name === "Updated By Sup"` | API | Supervisor has `users:update` in seed — AUTOMATION GAP |
| TC-USR-112 | Warehouse Operator | Warehouse Op CANNOT PUT /users/:id | P0 | 1. Login as Warehouse Operator 2. `PUT /api/v1/users/<id>` `{"name":"WH update"}` with `warehouse_token` | HTTP 403 | API | AUTOMATION GAP |
| TC-USR-113 | Dispatch Operator | Dispatch Op CANNOT PUT /users/:id | P0 | 1. Login as Dispatch Operator 2. `PUT /api/v1/users/<id>` `{"name":"DP update"}` with `dispatch_token` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 02.10 — Update user — happy path

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-120 | Admin | Admin updates user name | P0 | 1. Login as Admin 2. Create user, note `id` 3. `PUT /api/v1/users/<id>` `{"name":"Updated Name"}` 4. `GET /api/v1/users/<id>` | PUT → HTTP 200; GET → `name === "Updated Name"`; other fields unchanged | API | Realized by: `TC-USER-006` in `25-users-admin.spec.ts` |
| TC-USR-121 | Admin | Admin updates user email | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` `{"email":"updated@binny.com"}` 3. `POST /api/v1/auth/login` with new email + original password | PUT → HTTP 200; `data.email === "updated@binny.com"`; old email no longer authenticates; new email authenticates | Integration | AUTOMATION GAP |
| TC-USR-122 | Admin | Admin changes user role Warehouse Op → Supervisor | P0 | 1. Create Warehouse Op user, note `id` 2. `PUT /api/v1/users/<id>` `{"role":"Supervisor"}` 3. User logs in; their `permissions` array now includes Supervisor permissions | PUT → HTTP 200; `data.role === "Supervisor"`; new token's permissions reflect Supervisor role (e.g. `users:read` present) | Integration | AUTOMATION GAP — permission array is injected at login from `role_permissions`; role_id FK updated |
| TC-USR-123 | Admin | Admin changes role Supervisor → Dispatch Operator | P1 | 1. Create Supervisor user 2. `PUT /api/v1/users/<id>` `{"role":"Dispatch Operator"}` 3. User logs in with new token | HTTP 200; `data.role === "Dispatch Operator"`; new login token reflects Dispatch Op permissions | Integration | AUTOMATION GAP |
| TC-USR-124 | Admin | Admin deactivates user via PUT is_active:false | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` `{"is_active":false}` 3. Attempt login as that user | Step 2 → HTTP 200; `data.is_active === false`; Step 3 → HTTP 401 (login query filters `WHERE is_active=true`) | Integration | Realized by: `TC-USER-007` + `TC-USER-008` in `25-users-admin.spec.ts` |
| TC-USR-125 | Admin | Admin reactivates user via PUT is_active:true | P0 | 1. Deactivate user 2. `PUT /api/v1/users/<id>` `{"is_active":true}` 3. Login as reactivated user | Step 2 → HTTP 200; `data.is_active === true`; Step 3 login succeeds | Integration | AUTOMATION GAP |
| TC-USR-126 | Admin | PUT with duplicate email returns 409 | P0 | 1. Create users A and B 2. `PUT /api/v1/users/<A_id>` `{"email":"<B's email>"}` | HTTP 409; `message === "Email already in use"`; user A email unchanged | API | ConflictError path in `updateUser` — AUTOMATION GAP |
| TC-USR-127 | Admin | PUT with non-existent user ID returns 404 | P0 | 1. `PUT /api/v1/users/00000000-0000-0000-0000-000000000000` `{"name":"Ghost"}` | HTTP 404; "User not found" | API | AUTOMATION GAP |
| TC-USR-128 | Admin | PUT with empty body returns user unchanged (no DB write) | P1 | 1. `PUT /api/v1/users/<valid_id>` `{}` | HTTP 200; user data returned unchanged; service short-circuits when `fields.length === 0` and calls `getUserById` directly | API | Code: `if (fields.length === 0) return getUserById(id)` — AUTOMATION GAP |
| TC-USR-129 | Admin | PUT email is lowercased and trimmed | P1 | 1. `PUT /api/v1/users/<id>` `{"email":"  NEW@UPPER.COM  "}` | HTTP 200; `data.email === "new@upper.com"` (Zod `.trim().toLowerCase()` on `updateUserSchema`) | API | AUTOMATION GAP |
| TC-USR-130 | Supervisor | Supervisor updates another user's name | P1 | 1. Login as Supervisor 2. `PUT /api/v1/users/<other_id>` `{"name":"Sup Updated"}` | HTTP 200; name updated successfully | API | AUTOMATION GAP |
| TC-USR-131 | Supervisor | Supervisor can set is_active:false on another user | P1 | 1. Login as Supervisor, note `supervisor_token` 2. Create a Warehouse Op user 3. `PUT /api/v1/users/<wh_id>` `{"is_active":false}` with `supervisor_token` | HTTP 200; `data.is_active === false`; audit log records the Supervisor as updater | API | Supervisor has `users:update` — AUTOMATION GAP (no guard preventing Supervisor from deactivating) |
| TC-USR-132 | Supervisor | Supervisor cannot change role to Admin | P1 | 1. Login as Supervisor 2. `PUT /api/v1/users/<id>` `{"role":"Admin"}` with `supervisor_token` | HTTP 200 (role change succeeds at API level — no "prevent elevating to Admin" guard in service); note if this is intentional or a future guard | API | **OPEN RISK**: service has no guard blocking role escalation by Supervisor. Document as known gap — AUTOMATION GAP |

---

## Section 02.11 — Update user — validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-140 | Admin | PUT with invalid UUID param returns 400 | P0 | 1. `PUT /api/v1/users/invalid-uuid` `{"name":"X"}` | HTTP 400; Zod error "Invalid user ID format" | API | `userIdParamSchema` — AUTOMATION GAP |
| TC-USR-141 | Admin | PUT email to invalid format returns 400 | P0 | 1. `PUT /api/v1/users/<valid_id>` `{"email":"notanemail"}` | HTTP 400; Zod error "Invalid email address" | API | AUTOMATION GAP |
| TC-USR-142 | Admin | PUT name to 1-char string returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` `{"name":"X"}` | HTTP 400; Zod min 2 chars for `name` in `updateUserSchema` | API | AUTOMATION GAP |
| TC-USR-143 | Admin | PUT is_active with non-boolean returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` `{"is_active":"yes"}` | HTTP 400; Zod type error expecting `boolean` | API | AUTOMATION GAP |
| TC-USR-144 | Admin | PUT role to invalid value returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` `{"role":"Manager"}` | HTTP 400; Zod enum error listing valid role values | API | AUTOMATION GAP |
| TC-USR-145 | Admin | PUT with valid partial body (only role) succeeds | P0 | 1. Create user as Warehouse Op 2. `PUT /api/v1/users/<id>` `{"role":"Supervisor"}` | HTTP 200; `role` updated; `email`, `name`, `is_active` unchanged | API | AUTOMATION GAP |

---

## Section 02.12 — Delete user (soft) — RBAC (4-role rule)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-150 | Admin | Admin CAN DELETE /users/:id (`users:delete`) | P0 | 1. Login as Admin 2. Create test user 3. `DELETE /api/v1/users/<id>` | HTTP 200; `message === "User deactivated successfully"` | API | AUTOMATION GAP (existing spec uses PUT to deactivate, not DELETE) |
| TC-USR-151 | Supervisor | Supervisor CANNOT DELETE /users/:id (no `users:delete`) | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/users/<id>` with `supervisor_token` | HTTP 403; Supervisor seed does NOT have `users:delete` | API | Verified in `001_roles.ts`: Supervisor permissions list has no `users:delete` — AUTOMATION GAP |
| TC-USR-152 | Warehouse Operator | Warehouse Op CANNOT DELETE /users/:id | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/users/<id>` with `warehouse_token` | HTTP 403 | API | AUTOMATION GAP |
| TC-USR-153 | Dispatch Operator | Dispatch Op CANNOT DELETE /users/:id | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/users/<id>` with `dispatch_token` | HTTP 403 | API | AUTOMATION GAP |

---

## Section 02.13 — Delete user (soft) — happy path + edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-160 | Admin | DELETE /users/:id soft-deactivates the user | P0 | 1. Login as Admin 2. Create test user, note `id` 3. `DELETE /api/v1/users/<id>` | HTTP 200; `message === "User deactivated successfully"`; `GET /api/v1/users/<id>` → `is_active === false`; user row NOT physically removed from DB | API | `UPDATE users SET is_active = false WHERE id = $1` — AUTOMATION GAP |
| TC-USR-161 | Admin | DELETE /users/:id — deactivated user cannot log in | P0 | 1. Create user, note credentials 2. `DELETE /api/v1/users/<id>` 3. `POST /api/v1/auth/login` with that user's email+password | Step 3 → HTTP 401; login fails (auth service filters `WHERE is_active=true`) | Integration | AUTOMATION GAP |
| TC-USR-162 | Admin | Deleted (deactivated) user still appears in GET /users?is_active=false | P1 | 1. `DELETE /api/v1/users/<id>` 2. `GET /api/v1/users?is_active=false` | Deactivated user appears with `is_active === false` | API | AUTOMATION GAP |
| TC-USR-163 | Admin | DELETE /users/:id for non-existent UUID returns 404 | P0 | 1. `DELETE /api/v1/users/00000000-0000-0000-0000-000000000000` | HTTP 404; "User not found" | API | NotFoundError path — AUTOMATION GAP |
| TC-USR-164 | Admin | DELETE /users/:id with malformed UUID returns 400 | P1 | 1. `DELETE /api/v1/users/not-a-uuid` | HTTP 400; Zod error "Invalid user ID format" | API | `userIdParamSchema` on DELETE route — AUTOMATION GAP |
| TC-USR-165 | Admin | DELETE /users/:id creates audit log entry | P1 | 1. `DELETE /api/v1/users/<id>` 2. `GET /api/v1/audit-logs` (Admin) filter `entityType=user`, `action=DELETE_USER` | Audit log contains entry with `action === "DELETE_USER"`, `entityId === <id>`, `userId === admin_id` | Integration | `createAuditLog({ action: 'DELETE_USER', ... })` — AUTOMATION GAP |
| TC-USR-166 | Admin | Double DELETE on same user returns 404 on second call | P2 | 1. `DELETE /api/v1/users/<id>` (succeeds, `is_active` → false) 2. `DELETE /api/v1/users/<id>` again | Second DELETE → HTTP 404 ("User not found"); service queries `SELECT id FROM users WHERE id = $1` which still finds the row BUT… **Note**: service only checks existence, not `is_active`; so second DELETE will find the row and attempt another `UPDATE is_active=false` → HTTP 200 again | API | **OPEN BEHAVIOR**: `deleteUser` queries `SELECT id WHERE id=$1` (no `is_active` filter) so a second DELETE on an already-deactivated user returns 200 again, not 404 — document as known behavior — AUTOMATION GAP |

---

## Section 02.14 — Activate / deactivate via PUT

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-170 | Admin | PUT is_active:false deactivates a user | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` `{"is_active":false}` 3. Attempt login as that user | Step 2 → HTTP 200; `data.is_active === false`; Step 3 → HTTP 401 | Integration | Realized by: `TC-USER-007` + `TC-USER-008` in `25-users-admin.spec.ts` |
| TC-USR-171 | Admin | PUT is_active:true reactivates a deactivated user | P0 | 1. Deactivate user (PUT or DELETE) 2. `PUT /api/v1/users/<id>` `{"is_active":true}` 3. Login as reactivated user | Step 2 → HTTP 200; `data.is_active === true`; Step 3 → login succeeds | Integration | AUTOMATION GAP |
| TC-USR-172 | Admin | Frontend "Deactivate" button calls PUT (not PATCH) | P1 | 1. Login as Admin in browser 2. Navigate to `/users` 3. Click "Deactivate" on an active user 4. Inspect network tab | Browser calls `PUT /api/v1/users/<id>` with `{"is_active": false}`; HTTP 200 returned; status badge changes to gray "Inactive" dot | E2E | `toggleUserStatus` in `users/page.tsx` calls `api.put(...)` — confirmed; previous old-file "PATCH discrepancy" note is resolved: code uses PUT |
| TC-USR-173 | Admin | Frontend "Activate" button calls PUT with is_active:true | P1 | 1. Ensure an inactive user exists in `/users` 2. Click "Activate" button on that row | Browser calls `PUT /api/v1/users/<id>` `{"is_active": true}`; HTTP 200; badge changes to green "Active" dot | E2E | AUTOMATION GAP |
| TC-USR-174 | Supervisor | Supervisor can deactivate a user via PUT | P1 | 1. Login as Supervisor 2. `PUT /api/v1/users/<wh_user_id>` `{"is_active":false}` | HTTP 200; `is_active === false` | API | Supervisor has `users:update` — AUTOMATION GAP |

---

## Section 02.15 — Self-action guardrail TCs

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-180 | Admin | Admin DELETE on own account — no server-side self-delete guard | P1 | 1. Login as Admin 2. `GET /api/v1/auth/profile` — note own `id` 3. `DELETE /api/v1/users/<own_id>` | HTTP 200; own account is soft-deactivated; Admin can no longer log in | API | **OPEN RISK**: `deleteUser` in `user.service.ts` has NO check for `id === deletedBy`. This is a documented open gap. If deactivated, the Admin account can only be reactivated by another Admin or directly via DB. |
| TC-USR-181 | Admin | Admin PUT is_active:false on own account — no server-side guard | P1 | 1. Login as Admin 2. Note own `id` 3. `PUT /api/v1/users/<own_id>` `{"is_active":false}` | HTTP 200; `data.is_active === false`; own token still valid until expiry (1h) but next login → 401 | API | **OPEN RISK**: same gap — no self-deactivation guard in `updateUser` either — AUTOMATION GAP |
| TC-USR-182 | Admin | Admin self-role downgrade — no server-side guard | P2 | 1. Login as Admin 2. `PUT /api/v1/users/<own_id>` `{"role":"Supervisor"}` | HTTP 200; own role changed to Supervisor; existing token still works (role in JWT payload is `roleId`; permissions are evaluated per `role_permissions` at each request) | API | **OPEN RISK**: Admin can accidentally remove their own Admin role — AUTOMATION GAP |
| TC-USR-183 | Supervisor | Supervisor can elevate another user to Admin via role update | P2 | 1. Login as Supervisor 2. `PUT /api/v1/users/<other_id>` `{"role":"Admin"}` with `supervisor_token` | Current behavior: HTTP 200 (no guard blocks Supervisor from assigning Admin role); log as known privilege-escalation risk | API | **SECURITY RISK documented**: no maximum-role cap enforced in `updateUser` for Supervisor actors — AUTOMATION GAP |

---

## Section 02.16 — Audit logging

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-190 | Admin | CREATE_USER action logged with correct metadata | P1 | 1. Login as Admin 2. `POST /api/v1/users` `{"email":"audit-c@binny.com","password":"Test@1234","name":"Audit C","role":"Supervisor"}` 3. `GET /api/v1/audit-logs?entity_type=user&action=CREATE_USER` | Audit log entry has `action === "CREATE_USER"`, `entity_type === "user"`, `entity_id === <new_user_id>`, `new_values.email === "audit-c@binny.com"`, `new_values.role === "Supervisor"` | Integration | `createAuditLog({ action:'CREATE_USER', entityType:'user', newValues:{ email, role } })` — AUTOMATION GAP |
| TC-USR-191 | Admin | UPDATE_USER action logged with old + new values | P1 | 1. Create a user with `name="Old Name"` 2. `PUT /api/v1/users/<id>` `{"name":"New Name"}` 3. Check audit log | Audit entry has `action === "UPDATE_USER"`, `old_values.name === "Old Name"`, `new_values.name === "New Name"` | Integration | `createAuditLog` captures `oldValues: { email, name, role }` and `newValues: input` — AUTOMATION GAP |
| TC-USR-192 | Admin | DELETE_USER action logged | P1 | 1. `DELETE /api/v1/users/<id>` 2. Check audit log | Audit entry has `action === "DELETE_USER"`, `entity_type === "user"`, `entity_id === <id>` | Integration | `createAuditLog({ action:'DELETE_USER', entityType:'user', entityId: id })` — AUTOMATION GAP |
| TC-USR-193 | Supervisor | Supervisor CREATE_USER audit entry records Supervisor as actor | P1 | 1. Login as Supervisor (note `supervisor_user_id`) 2. Create a new user via `POST /api/v1/users` with supervisor token 3. Check audit log | Audit entry `userId === supervisor_user_id`; Supervisor's actions are tracked correctly | Integration | AUTOMATION GAP |

---

## Section 02.17 — Role assignment — all 4 target roles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-200 | Admin | Assign role Admin — user gets super-admin bypass | P1 | 1. Create user with `role="Admin"` 2. Login as that user 3. `GET /api/v1/users` (requires `users:read`) | HTTP 200; Admin bypass applies (`role_name === 'Admin'` in `authorizePermission` always calls `next()`) | Integration | AUTOMATION GAP |
| TC-USR-201 | Admin | Assign role Supervisor — user gets 19 permissions | P0 | 1. Create user with `role="Supervisor"` 2. Login 3. Check `permissions` array in login response | `permissions` array has 19 entries matching Supervisor seed permissions; includes `users:create`, `users:read`, `users:update`; does NOT include `users:delete`, `samples:*`, `customers:*` | Integration | Supervisor seed has 19 permissions: `users:create`, `users:read`, `users:update`, `products:read/create/update`, `child_boxes:create/read/update`, `cartons:create/read/update/close/reopen`, `packing:pack/unpack`, `dispatch:read`, `reports:view_all/export` — AUTOMATION GAP |
| TC-USR-202 | Admin | Assign role Warehouse Operator — user gets 9 permissions | P0 | 1. Create user with `role="Warehouse Operator"` 2. Login 3. Check `permissions` array | `permissions` array has 9 entries: `products:read`, `child_boxes:create`, `child_boxes:read`, `cartons:create`, `cartons:read`, `cartons:close`, `packing:pack`, `packing:unpack`, `reports:view_own` | Integration | Verified count: 9 entries in seed `001_roles.ts` — AUTOMATION GAP |
| TC-USR-203 | Admin | Assign role Dispatch Operator — user gets 7 permissions | P0 | 1. Create user with `role="Dispatch Operator"` 2. Login 3. Check `permissions` array | `permissions` array has 7 entries: `products:read`, `child_boxes:read`, `cartons:read`, `dispatch:create`, `dispatch:read`, `dispatch:update`, `reports:view_dispatch` | Integration | Verified count: 7 entries in seed `001_roles.ts` — AUTOMATION GAP |
| TC-USR-204 | Admin | Role change takes effect at NEXT login (current token unchanged) | P1 | 1. Login as Warehouse Op user, obtain `token_old` 2. Admin changes that user's role to Supervisor 3. Use `token_old` to call a Supervisor-only endpoint | Behavior depends on JWT: `token_old` contains old `roleId` which maps to old permissions; `authorizePermission` does a live DB query per request so the NEW role takes effect immediately on next request (NOT next login) | Integration | **Important**: `authorizePermission` queries `role_permissions` on every request using `req.user.userId` (NOT the `roleId` in the token). So permission changes take effect immediately without re-login — AUTOMATION GAP |

---

## Section 02.18 — Password handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-210 | Admin | Password is bcrypt-hashed (not stored plaintext) | P0 | 1. Create user via `POST /api/v1/users` 2. Query DB directly: `SELECT password_hash FROM users WHERE email='...'` | `password_hash` starts with `$2b$` (bcrypt); is NOT equal to the plaintext password | Manual | `hashPassword` calls `bcrypt.hash` — manual DB inspection |
| TC-USR-211 | Admin | Password not returned in any API response | P0 | 1. `POST /api/v1/users` (create) 2. `GET /api/v1/users` (list) 3. `GET /api/v1/users/:id` (by ID) 4. `PUT /api/v1/users/:id` (update) | None of the 4 responses include `password_hash` or `password` field | API | USER_SELECT projection excludes `password_hash`; `createUser` returns `{ ...user, role }` where `user` comes from INSERT RETURNING which doesn't select `password_hash` after re-fetch — AUTOMATION GAP |
| TC-USR-212 | Admin | PUT /users/:id does not accept password field | P1 | 1. `PUT /api/v1/users/<id>` `{"password":"NewPass@1234"}` | HTTP 200 (Zod strips unknown fields) OR HTTP 400; in either case password is NOT updated (Zod `updateUserSchema` does not include `password` field — unknown keys are stripped by default) | API | `updateUserSchema` has no `password` field — changing password requires `POST /api/v1/auth/change-password` — AUTOMATION GAP |

---

## Section 02.19 — Frontend E2E — Users page (Admin)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-E2E-001 | Admin | Users page renders table with correct column headers | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/users` | Page loads; table headers visible: "Name", "Email", "Role", "Status", "Created", "Actions"; search bar present with placeholder "Search users by name or email..." | E2E | Realized by: `TC-USER-E2E-001` in `25-users-admin.spec.ts` |
| TC-USR-E2E-002 | Admin | "Add User" button visible and opens modal | P0 | 1. Login as Admin 2. Navigate to `/users` 3. Click "Add User" button | Modal opens with title "Add New User"; description "Create a new user account for the inventory system"; inputs visible: "Full Name", "Email", "Password" (type=password), "Role" (select); Cancel and "Create User" buttons visible | E2E | `canCreate = useCan('users:create')` is true for Admin; modal conditional `isOpen={showCreateModal && canCreate}` — realized by: `TC-USER-E2E-002` in `25-users-admin.spec.ts` |
| TC-USR-E2E-003 | Admin | Create User modal — all four role options available | P1 | 1. Open "Add User" modal 2. Click Role select dropdown | Options: "Warehouse Operator" (default), "Dispatch Operator", "Supervisor", "Admin" | E2E | AUTOMATION GAP |
| TC-USR-E2E-004 | Admin | Admin creates user via UI — appears in table | P0 | 1. Open "Add User" modal 2. Fill: name="UI Test User", email="uitest@binny.com", password="UITest@123", role="Supervisor" 3. Click "Create User" | Toast "User created successfully"; modal closes; new user row appears in table with name, email, blue "Supervisor" badge, green "Active" dot | E2E | AUTOMATION GAP |
| TC-USR-E2E-005 | Admin | Role badge colors correct | P1 | 1. Navigate to `/users` with multiple role users present | Admin rows → red Badge; Supervisor rows → blue Badge; Warehouse Op + Dispatch Op → gray Badge | E2E | `Badge variant={user.role === 'Admin' ? 'red' : user.role === 'Supervisor' ? 'blue' : 'gray'}` — AUTOMATION GAP |
| TC-USR-E2E-006 | Admin | Search bar filters table results (debounced) | P0 | 1. Navigate to `/users` 2. Type "warehouse" in search input 3. Wait for debounce | Table rows update to show only users matching "warehouse" in name or email; `GET /api/v1/users?search=warehouse` issued | E2E | `useApiQuery(['users', search], ...)` re-runs when `search` state changes — AUTOMATION GAP |
| TC-USR-E2E-007 | Admin | "Deactivate" button on active user toggles status | P1 | 1. Navigate to `/users` 2. Find an active user row 3. Click "Deactivate" | Row shows UserX icon + "Deactivate" label; on click: `PUT /api/v1/users/<id>` `{"is_active":false}` called; badge changes to gray "Inactive" dot; toast shown | E2E | `toggleUserStatus` in `users/page.tsx` uses `api.put` (NOT patch) — AUTOMATION GAP |
| TC-USR-E2E-008 | Admin | "Activate" button on inactive user toggles status | P1 | 1. Ensure inactive user exists 2. Navigate to `/users` | Inactive user row shows UserCheck icon + "Activate" label; on click: `PUT /api/v1/users/<id>` `{"is_active":true}`; badge changes to green "Active" dot | E2E | AUTOMATION GAP |
| TC-USR-E2E-009 | Admin | Formatted "Created" timestamp visible | P1 | 1. Navigate to `/users` | Each row "Created" column shows human-readable date via `formatDateTime` (e.g., "23 Apr 2026, 10:30 AM") | E2E | AUTOMATION GAP |
| TC-USR-E2E-010 | Admin | Empty search shows all users | P1 | 1. Type text in search, observe filter 2. Clear search field | All users reappear; `GET /api/v1/users` called without `search` param | E2E | AUTOMATION GAP |
| TC-USR-E2E-011 | Admin | Page title and description correct | P2 | 1. Navigate to `/users` | `PageHeader` shows title "User Management" and description "Manage system users and their roles" | E2E | AUTOMATION GAP |
| TC-USR-E2E-012 | Admin | Loading state shown while fetching users | P2 | 1. Throttle network 2. Navigate to `/users` | "Loading users..." text visible while `isLoading === true` | E2E | AUTOMATION GAP |
| TC-USR-E2E-013 | Admin | Empty state shown when no users found | P2 | 1. Search for string that matches no users | "No users found." text visible | E2E | AUTOMATION GAP |

---

## Section 02.20 — Frontend E2E — Users page (Supervisor)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-E2E-020 | Supervisor | Supervisor sees /users page (not access-denied) | P0 | 1. Login as Supervisor 2. Navigate to `/users` | Page loads with user table (not Shield/Access Denied); `useCan('users:read')` → true for Supervisor | E2E | Realized by: `TC-USER-E2E-003` in `25-users-admin.spec.ts` (partial — spec accepts both access+denied; correct expectation is accessible) |
| TC-USR-E2E-021 | Supervisor | Supervisor sees "Add User" button | P0 | 1. Login as Supervisor 2. Navigate to `/users` | "Add User" button IS visible; `useCan('users:create')` → true for Supervisor; `canCreate` prop is passed to PageHeader action | E2E | **MATRIX CORRECTION**: old phase-02 said "Only administrators can manage users" — this was stale. Supervisor has `users:create` and sees the Add User button — AUTOMATION GAP |
| TC-USR-E2E-022 | Supervisor | Supervisor creates user via UI | P1 | 1. Login as Supervisor 2. Click "Add User" 3. Fill form and submit | Toast "User created successfully"; new user row appears | E2E | AUTOMATION GAP |
| TC-USR-E2E-023 | Supervisor | Supervisor does NOT see "Delete" or hard-delete action | P1 | 1. Login as Supervisor 2. Navigate to `/users` 3. Inspect action column | No hard-delete button visible; only Activate/Deactivate toggle (which calls PUT, not DELETE) — Supervisor CAN toggle `is_active` via PUT but cannot call DELETE endpoint | E2E | Frontend only exposes `toggleUserStatus` (PUT); DELETE endpoint is never called from UI — AUTOMATION GAP |

---

## Section 02.21 — Frontend E2E — Users page (denied roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USR-E2E-030 | Warehouse Operator | Warehouse Op sees "Access Denied" on /users | P0 | 1. Login as Warehouse Operator 2. Navigate to `http://localhost:3000/users` | Page renders Shield icon, heading "Access Denied", message "You do not have permission to view users."; no user table; no "Add User" button | E2E | `if (!canRead) return <AccessDenied>` — `useCan('users:read')` → false for Warehouse Op — AUTOMATION GAP |
| TC-USR-E2E-031 | Dispatch Operator | Dispatch Op sees "Access Denied" on /users | P0 | 1. Login as Dispatch Operator 2. Navigate to `http://localhost:3000/users` | Same Shield/Access Denied rendered; no user table visible | E2E | AUTOMATION GAP |
| TC-USR-E2E-032 | Warehouse Operator | Warehouse Op direct API call to /users returns 403 | P0 | 1. Login as Warehouse Operator, obtain token 2. `GET /api/v1/users` with token | HTTP 403 (API enforces even if frontend were bypassed) | API | AUTOMATION GAP |
| TC-USR-E2E-033 | Dispatch Operator | Dispatch Op direct API call to /users returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/users` with token | HTTP 403 | API | AUTOMATION GAP |
