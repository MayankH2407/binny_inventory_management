# Phase 33 — Role Manager

**Module code:** `ROLE`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**authored 2026-06-09**

> **RBAC (verified against `backend/src/routes/role.routes.ts`, `backend/src/routes/permission.routes.ts`, `backend/src/services/role.service.ts`, `backend/seeds/001_roles.ts`):**
>
> All `/api/v1/roles/*` routes are prefixed with `authenticate` + `authorizePermission('roles:manage')`.
> `GET /api/v1/permissions` also requires `authenticate` + `authorizePermission('roles:manage')`.
> `roles:manage` is held **only by Admin** in the seed. Supervisor, Warehouse Operator, and Dispatch Operator all return **403** on every role or permission endpoint.
>
> **Admin is a super-admin:** `authorizePermission` short-circuits at `role_name === 'Admin'` — no `role_permissions` row is needed for Admin to pass any check.
>
> **Service-level guards (beyond RBAC middleware):**
> - `SUPER_ADMIN_ROLE = 'Admin'` — `updateRole` throws `ForbiddenError` (403) regardless of what field is changed.
> - `DEFAULT_ROLE_NAMES = ['Admin', 'Supervisor', 'Warehouse Operator', 'Dispatch Operator']` — `updateRole` throws 403 if a rename is attempted. `deleteRole` throws 403 for any of these four names.
> - Assigned-user guard — `deleteRole` throws `ConflictError` (409) with user count when `COUNT(users WHERE role_id) > 0` for non-default roles.
>
> **Frontend page guard:** `page.tsx` checks `isAdmin` (derived from `user.role === 'Admin'` in `useAuth`). Non-Admin users see an "Access Denied" shield — the page does NOT redirect; it renders inline denial.
>
> **Permission catalog:** 47 entries across 15 modules, returned as structured `PermissionModule[]` by `GET /api/v1/permissions`. Sourced from `backend/src/config/permissions.ts` `PERMISSION_CATALOG`.
>
> **Stage-aware permissions:** `child_boxes:update`, `child_boxes:delete`, `cartons:update`, `cartons:delete` carry `stage_aware: true` with enumerated stage lists. The `max_stage` column in `role_permissions` is `NULL` for all seeded roles. A non-NULL `max_stage` value restricts operations to resources whose current status does not exceed the named stage.
>
> **Known design limitation (from spec 31):** `PUT /api/v1/users/:id` only accepts role names from the hard-coded `USER_ROLES` enum (the four seeded names). Custom roles created via `POST /api/v1/roles` **cannot be assigned** to users via the public API. The 409 "role has assigned users" path for custom (non-default) roles is therefore untestable through the API alone; documented as an automation gap.
>
> **Immediate-effect guarantee:** `authorizePermission` reads `role_permissions` live on every request — no re-login required after a role's permissions are updated.

---

## Table of Contents

- [Section 33.0 — Unauthenticated access (401)](#section-330--unauthenticated-access-401)
- [Section 33.1 — RBAC denial — non-Admin roles (403)](#section-331--rbac-denial--non-admin-roles-403)
- [Section 33.2 — List roles (GET /roles)](#section-332--list-roles-get-roles)
- [Section 33.3 — Get role by ID (GET /roles/:id)](#section-333--get-role-by-id-get-rolesid)
- [Section 33.4 — Permission catalog (GET /permissions)](#section-334--permission-catalog-get-permissions)
- [Section 33.5 — Create role — validation (400 / 409)](#section-335--create-role--validation-400--409)
- [Section 33.6 — Create role — happy path + role_permissions backfill](#section-336--create-role--happy-path--role_permissions-backfill)
- [Section 33.7 — Update role — Admin protected (403)](#section-337--update-role--admin-protected-403)
- [Section 33.8 — Update role — default-role rename blocked (403)](#section-338--update-role--default-role-rename-blocked-403)
- [Section 33.9 — Update role — permission edits (happy path)](#section-339--update-role--permission-edits-happy-path)
- [Section 33.10 — Update role — validation (400 / 404 / 409)](#section-3310--update-role--validation-400--404--409)
- [Section 33.11 — Delete role — default-role blocked (403)](#section-3311--delete-role--default-role-blocked-403)
- [Section 33.12 — Delete role — assigned-users blocked (409)](#section-3312--delete-role--assigned-users-blocked-409)
- [Section 33.13 — Delete role — happy path + cascade](#section-3313--delete-role--happy-path--cascade)
- [Section 33.14 — Stage-aware max_stage custom role](#section-3314--stage-aware-max_stage-custom-role)
- [Section 33.15 — Integration: grant Supervisor samples:create + samples:update, verify immediate effect](#section-3315--integration-grant-supervisor-samplescreate--samplesupdate-verify-immediate-effect)
- [Section 33.16 — Integration: revoke permission, verify immediate denial (no re-login)](#section-3316--integration-revoke-permission-verify-immediate-denial-no-re-login)
- [Section 33.17 — Frontend E2E — /admin/roles page (Admin)](#section-3317--frontend-e2e--adminroles-page-admin)
- [Section 33.18 — Frontend E2E — /admin/roles page (denied roles)](#section-3318--frontend-e2e--adminroles-page-denied-roles)
- [Section 33.19 — Frontend E2E — Create role modal](#section-3319--frontend-e2e--create-role-modal)
- [Section 33.20 — Frontend E2E — Edit role modal (non-Admin default role)](#section-3320--frontend-e2e--edit-role-modal-non-admin-default-role)
- [Section 33.21 — Frontend E2E — Admin role view-only modal](#section-3321--frontend-e2e--admin-role-view-only-modal)
- [Section 33.22 — Frontend E2E — Delete role modal](#section-3322--frontend-e2e--delete-role-modal)
- [Section 33.23 — Frontend E2E — Permission grid (PermissionMatrix component)](#section-3323--frontend-e2e--permission-grid-permissionmatrix-component)
- [Section 33.24 — Frontend E2E — Sidebar Role Manager visibility](#section-3324--frontend-e2e--sidebar-role-manager-visibility)
- [Section 33.25 — Regression — role_permissions backfill migration](#section-3325--regression--role_permissions-backfill-migration)

---

## Section 33.0 — Unauthenticated access (401)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-001 | Unauthenticated | GET /roles without token returns 401 | P0 | 1. `GET /api/v1/roles` with no `Authorization` header | HTTP 401; `success === false`; body contains authentication error message | API | Realized by: AUTOMATION GAP — add unauth block to `31-role-manager.spec.ts` |
| TC-ROLE-002 | Unauthenticated | GET /roles/:id without token returns 401 | P0 | 1. `GET /api/v1/roles/00000000-0000-0000-0000-000000000001` with no `Authorization` header | HTTP 401; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-003 | Unauthenticated | POST /roles without token returns 401 | P0 | 1. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` with no `Authorization` header | HTTP 401; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-004 | Unauthenticated | PATCH /roles/:id without token returns 401 | P0 | 1. `PATCH /api/v1/roles/00000000-0000-0000-0000-000000000001` body `{"name":"NewName"}` with no `Authorization` header | HTTP 401; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-005 | Unauthenticated | DELETE /roles/:id without token returns 401 | P0 | 1. `DELETE /api/v1/roles/00000000-0000-0000-0000-000000000001` with no `Authorization` header | HTTP 401; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-006 | Unauthenticated | GET /permissions without token returns 401 | P0 | 1. `GET /api/v1/permissions` with no `Authorization` header | HTTP 401; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-007 | Unauthenticated | /admin/roles page redirects to login | P0 | 1. Open browser without a session 2. Navigate to `http://localhost:3000/admin/roles` | Browser redirects to `/login`; no role data visible | E2E | Next.js middleware auth guard (session-level, not page-component-level) |

---

## Section 33.1 — RBAC denial — non-Admin roles (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-010 | Supervisor | Supervisor GET /roles returns 403 | P0 | 1. Login as Supervisor, obtain `sup_token` 2. `GET /api/v1/roles` with `Authorization: Bearer sup_token` | HTTP 403; `success === false`; message contains "Required permission: roles:manage" | API | Realized by: AUTOMATION GAP — add Supervisor 403 tests to `31-role-manager.spec.ts` |
| TC-ROLE-011 | Warehouse Operator | Warehouse Op GET /roles returns 403 | P0 | 1. Login as Warehouse Operator, obtain `wh_token` 2. `GET /api/v1/roles` with `wh_token` | HTTP 403; `success === false`; message contains "Required permission: roles:manage" | API | Realized by: AUTOMATION GAP |
| TC-ROLE-012 | Dispatch Operator | Dispatch Op GET /roles returns 403 | P0 | 1. Login as Dispatch Operator, obtain `dp_token` 2. `GET /api/v1/roles` with `dp_token` | HTTP 403; `success === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-013 | Supervisor | Supervisor POST /roles returns 403 | P0 | 1. Login as Supervisor 2. `POST /api/v1/roles` body `{"name":"TestRole","permissions":[]}` with `sup_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-014 | Warehouse Operator | Warehouse Op POST /roles returns 403 | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/roles` with `wh_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-015 | Dispatch Operator | Dispatch Op POST /roles returns 403 | P0 | 1. Login as Dispatch Operator 2. `POST /api/v1/roles` with `dp_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-016 | Supervisor | Supervisor PATCH /roles/:id returns 403 | P0 | 1. Login as Supervisor 2. Resolve any valid role UUID via Admin's GET /roles 3. `PATCH /api/v1/roles/{uuid}` body `{"permissions":[]}` with `sup_token` | HTTP 403 | API | Middleware 403 fires before service-level guards | Realized by: AUTOMATION GAP |
| TC-ROLE-017 | Warehouse Operator | Warehouse Op PATCH /roles/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `PATCH /api/v1/roles/{uuid}` with `wh_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-018 | Dispatch Operator | Dispatch Op PATCH /roles/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `PATCH /api/v1/roles/{uuid}` with `dp_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-019 | Supervisor | Supervisor DELETE /roles/:id returns 403 | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/roles/{uuid}` with `sup_token` | HTTP 403; middleware RBAC denial, not service-level denial | API | Realized by: AUTOMATION GAP |
| TC-ROLE-020 | Warehouse Operator | Warehouse Op DELETE /roles/:id returns 403 | P0 | 1. Login as Warehouse Operator 2. `DELETE /api/v1/roles/{uuid}` with `wh_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-021 | Dispatch Operator | Dispatch Op DELETE /roles/:id returns 403 | P0 | 1. Login as Dispatch Operator 2. `DELETE /api/v1/roles/{uuid}` with `dp_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-022 | Supervisor | Supervisor GET /permissions returns 403 | P0 | 1. Login as Supervisor 2. `GET /api/v1/permissions` with `sup_token` | HTTP 403; message contains "Required permission: roles:manage" | API | Realized by: AUTOMATION GAP |
| TC-ROLE-023 | Warehouse Operator | Warehouse Op GET /permissions returns 403 | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/permissions` with `wh_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |
| TC-ROLE-024 | Dispatch Operator | Dispatch Op GET /permissions returns 403 | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/permissions` with `dp_token` | HTTP 403 | API | Realized by: AUTOMATION GAP |

---

## Section 33.2 — List roles (GET /roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-030 | Admin | GET /roles returns all 4 seeded roles with user counts and permissions | P0 | 1. Login as Admin, obtain `admin_token` 2. `GET /api/v1/roles` with `admin_token` | HTTP 200; `success === true`; `data.roles` is an array of ≥ 4 objects; each object has `id` (UUID), `name`, `permissions` (array of `{permission, max_stage}`), `user_count` (integer ≥ 0), `created_at`, `updated_at`; roles named "Admin", "Supervisor", "Warehouse Operator", "Dispatch Operator" are all present | API | Realized by: `SETUP-002` in `31-role-manager.spec.ts` |
| TC-ROLE-031 | Admin | Roles are returned ordered alphabetically by name | P1 | 1. Login as Admin 2. `GET /api/v1/roles` | `data.roles[0].name === "Admin"` (first alphabetically); subsequent entries sorted A-Z | API | ORDER BY r.name in service SQL; AUTOMATION GAP — explicit sort-order assertion |
| TC-ROLE-032 | Admin | Admin role has user_count ≥ 1 (at least the admin user itself) | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find the Admin role entry | `admin_role.user_count >= 1`; `admin_role.permissions.length === 0` (Admin super-admin bypass; seed inserts permissions into role_permissions but runtime behavior is bypass) | API | Realized by: AUTOMATION GAP; note: seed populates role_permissions for Admin but middleware bypasses them |
| TC-ROLE-033 | Admin | Seeded Supervisor role has exactly 19 permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find Supervisor role entry | `supervisor_role.permissions.length === 19`; all entries have `max_stage === null`; permission strings match the 19 keys in `seeds/001_roles.ts` | API | Realized by: AUTOMATION GAP; permission list: users:create/read/update, products:read/create/update, child_boxes:create/read/update, cartons:create/read/update/close/reopen, packing:pack/unpack, dispatch:read, reports:view_all, reports:export |
| TC-ROLE-034 | Admin | Seeded Warehouse Operator role has exactly 9 permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find Warehouse Operator role | `warehouse_role.permissions.length === 9`; keys match seed: products:read, child_boxes:create/read, cartons:create/read/close, packing:pack/unpack, reports:view_own | API | Realized by: AUTOMATION GAP |
| TC-ROLE-035 | Admin | Seeded Dispatch Operator role has exactly 7 permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. Find Dispatch Operator role | `dispatch_role.permissions.length === 7`; keys: products:read, child_boxes:read, cartons:read, dispatch:create/read/update, reports:view_dispatch | API | Realized by: AUTOMATION GAP |
| TC-ROLE-036 | Admin | Admin role has correct user count after test-user creation | P2 | 1. Create a user assigned to Supervisor via `POST /api/v1/users` 2. `GET /api/v1/roles` 3. Find Supervisor entry | `supervisor_role.user_count` increments by 1 compared to pre-creation count | Integration | Verifies LEFT JOIN COUNT logic in listRoles SQL |

---

## Section 33.3 — Get role by ID (GET /roles/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-040 | Admin | GET /roles/:id returns role detail with permissions | P0 | 1. Login as Admin 2. `GET /api/v1/roles` to resolve Supervisor UUID → `sup_id` 3. `GET /api/v1/roles/{sup_id}` | HTTP 200; `data.id === sup_id`; `data.name === "Supervisor"`; `data.permissions` is array with 19 entries; `data.user_count` is integer; `data.created_at` and `data.updated_at` are ISO timestamps | API | Realized by: AUTOMATION GAP |
| TC-ROLE-041 | Admin | GET /roles/:id with non-existent UUID returns 404 | P0 | 1. Login as Admin 2. `GET /api/v1/roles/00000000-0000-0000-0000-000000000099` | HTTP 404; `success === false`; message contains "Role not found" | API | Realized by: AUTOMATION GAP |
| TC-ROLE-042 | Admin | GET /roles/:id with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `GET /api/v1/roles/not-a-uuid` | HTTP 400; Zod validation error; message contains "Invalid role ID format" | API | `roleIdParamSchema` validates UUID format; AUTOMATION GAP |
| TC-ROLE-043 | Admin | GET /roles/:id for Admin role shows empty permissions array (admin stored in seed but API returns them from role_permissions) | P2 | 1. Login as Admin 2. Resolve Admin role UUID 3. `GET /api/v1/roles/{admin_id}` | HTTP 200; `data.name === "Admin"`; `data.permissions` is an array (may be 0 or the 27 seeded entries); `data.user_count >= 1` | API | Seed inserts 27 rows into role_permissions for Admin; middleware bypasses them; API returns whatever is stored in role_permissions — verify actual behavior |

---

## Section 33.4 — Permission catalog (GET /permissions)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-050 | Admin | GET /permissions returns full catalog with 15 modules | P0 | 1. Login as Admin 2. `GET /api/v1/permissions` | HTTP 200; `success === true`; `data.catalog` is array of length 15; each entry has `key`, `label`, `actions`; module keys include: users, roles, products, child_boxes, cartons, packing, dispatch, samples, ecommerce, customers, sections, inventory, reports, audit, settings | API | Realized by: AUTOMATION GAP — add to `31-role-manager.spec.ts` |
| TC-ROLE-051 | Admin | Permission catalog stage_aware fields are correct | P1 | 1. Login as Admin 2. `GET /api/v1/permissions` 3. Find modules for `child_boxes` and `cartons` | `child_boxes.actions` where `key === "update"` has `stage_aware === true` and `stages` = ["GENERATED","FREE","PACKED","SAMPLE","ECOMMERCE","DISPATCHED"]; `cartons.actions` where `key === "update"` has `stage_aware === true` and `stages` = ["CREATED","ACTIVE","CLOSED","DISPATCHED"]; `cartons.actions` where `key === "delete"` is stage_aware too; `child_boxes.actions` where `key === "delete"` is stage_aware; all other actions have `stage_aware === false` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-052 | Admin | ALL_PERMISSIONS set contains exactly 47 entries | P1 | 1. Login as Admin 2. `GET /api/v1/permissions` 3. Flatten all `module.actions` to `module.key:action.key` strings | Result set has exactly 47 unique permission keys | API | Count: users(4) + roles(1) + products(4) + child_boxes(4) + cartons(6) + packing(2) + dispatch(3) + samples(4) + ecommerce(4) + customers(4) + sections(4) + inventory(1) + reports(4) + audit(1) + settings(1) = 47; AUTOMATION GAP |
| TC-ROLE-053 | Admin | Permission catalog roles module has only roles:manage | P2 | 1. Login as Admin 2. `GET /api/v1/permissions` 3. Find module with `key === "roles"` | `roles_module.actions.length === 1`; `actions[0].key === "manage"`; `actions[0].stage_aware === false` | API | Realized by: AUTOMATION GAP |

---

## Section 33.5 — Create role — validation (400 / 409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-060 | Admin | Create role with invalid permission key returns 400 | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"TestInvalid","permissions":[{"permission":"fake:action","max_stage":null}]}` | HTTP 400; `success === false`; message contains "Invalid permission(s): fake:action" and references "Check GET /api/v1/permissions" | API | Realized by: `validatePermissions()` in role.service.ts; AUTOMATION GAP |
| TC-ROLE-061 | Admin | Create role with multiple invalid permission keys lists all invalid keys in error | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"TestInvalid2","permissions":[{"permission":"fake:one","max_stage":null},{"permission":"also:bad","max_stage":null}]}` | HTTP 400; message contains "Invalid permission(s): fake:one, also:bad" (both listed) | API | Realized by: AUTOMATION GAP |
| TC-ROLE-062 | Admin | Create role with duplicate name returns 409 | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"Supervisor","permissions":[]}` | HTTP 409; `success === false`; message contains `Role name "Supervisor" already exists` | API | Realized by: `TC-RBAC-011` in `31-role-manager.spec.ts` (implicitly); AUTOMATION GAP for explicit 409 name collision |
| TC-ROLE-063 | Admin | Create role with name shorter than 2 characters returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"A","permissions":[]}` | HTTP 400; Zod validation error; message contains "Name must be at least 2 characters" | API | `createRoleSchema.name.min(2)`; AUTOMATION GAP |
| TC-ROLE-064 | Admin | Create role with name longer than 50 characters returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"AAAAA...AAA" (51 chars),"permissions":[]}` | HTTP 400; Zod validation error; message contains "Name must not exceed 50 characters" | API | `createRoleSchema.name.max(50)`; AUTOMATION GAP |
| TC-ROLE-065 | Admin | Create role with permission in wrong format (no colon) returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"BadFmt","permissions":[{"permission":"nodot","max_stage":null}]}` | HTTP 400; Zod validation error; message contains "module:action" format hint | API | `permissionEntrySchema` regex `/^[a-z_]+:[a-z_]+$/`; AUTOMATION GAP |
| TC-ROLE-066 | Admin | Create role with missing name field returns 400 | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"permissions":[]}` | HTTP 400; Zod validation error for missing required `name` field | API | Realized by: AUTOMATION GAP |
| TC-ROLE-067 | Admin | Create role with name that matches another role case-insensitively is ALLOWED (names are case-sensitive) | P2 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"supervisor","permissions":[]}` (all lowercase) 3. If 201, cleanup with `DELETE /roles/{id}` | HTTP 201; service check is `WHERE name = $1` (exact match); lowercase "supervisor" is a distinct name from "Supervisor" | API | Document as design behavior: names are case-sensitive; AUTOMATION GAP |

---

## Section 33.6 — Create role — happy path + role_permissions backfill

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-070 | Admin | Create role with no permissions succeeds (empty permission array) | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-empty-role-${TS}","permissions":[]}` | HTTP 201; `success === true`; response `data.id` is UUID; `data.name` matches input; `data.permissions === []`; `data.user_count === 0`; `data.created_at` is ISO timestamp | API | Realized by: `TC-RBAC-011` step 1 in `31-role-manager.spec.ts` |
| TC-ROLE-071 | Admin | Create role with valid permissions inserts role_permissions rows | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-perm-role-${TS}","permissions":[{"permission":"products:read","max_stage":null},{"permission":"cartons:read","max_stage":null}]}` 3. `GET /api/v1/roles/{new_id}` to verify | HTTP 201; response `data.permissions.length === 2`; `GET` returns the same 2 permissions; `data.permissions` entries have `permission` key and `max_stage === null` | API | Verifies dual-write: INSERT into roles.permissions jsonb AND INTO role_permissions; AUTOMATION GAP |
| TC-ROLE-072 | Admin | Create role with all 47 permissions succeeds | P1 | 1. Login as Admin 2. Build permissions array from `GET /api/v1/permissions` catalog (all 47 keys) 3. `POST /api/v1/roles` body `{"name":"e2e-full-role-${TS}","permissions":[...all 47...]}` 4. `GET /api/v1/roles/{id}` | HTTP 201; `data.permissions.length === 47`; subsequent GET confirms all 47 rows present; cleanup with DELETE | API | AUTOMATION GAP |
| TC-ROLE-073 | Admin | Created role appears immediately in GET /roles list | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-list-check-${TS}","permissions":[]}` → capture `new_role_id` 3. `GET /api/v1/roles` | New role is present in the returned array; `user_count === 0` | API | AUTOMATION GAP |
| TC-ROLE-074 | Admin | Create role response matches GET /roles/:id response | P1 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-match-${TS}","permissions":[{"permission":"dispatch:read","max_stage":null}]}` → capture POST response body 3. `GET /api/v1/roles/{id}` | All shared fields (`id`, `name`, `permissions`, `user_count`) match between POST response and GET response | API | Regression for dual-write consistency; AUTOMATION GAP |

---

## Section 33.7 — Update role — Admin protected (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-080 | Admin | PATCH Admin role to rename returns 403 | P0 | 1. Login as Admin 2. Resolve Admin role UUID 3. `PATCH /api/v1/roles/{admin_id}` body `{"name":"SuperAdmin"}` | HTTP 403; `success === false`; message = "The Admin role is protected and cannot be modified via the API" | API | Realized by: `TC-RBAC-009` in `31-role-manager.spec.ts` |
| TC-ROLE-081 | Admin | PATCH Admin role to change permissions returns 403 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/{admin_id}` body `{"permissions":[{"permission":"products:read","max_stage":null}]}` | HTTP 403; message = "The Admin role is protected and cannot be modified via the API" | API | Even permission-only edits are blocked for Admin; AUTOMATION GAP — spec 31 only tests rename |
| TC-ROLE-082 | Admin | PATCH Admin role with empty body still returns 403 | P2 | 1. Login as Admin 2. `PATCH /api/v1/roles/{admin_id}` body `{}` | HTTP 403 (service fetches role by ID first, sees Admin, throws ForbiddenError before any field processing) | API | Realized by: AUTOMATION GAP |

---

## Section 33.8 — Update role — default-role rename blocked (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-090 | Admin | PATCH Supervisor role rename returns 403 | P0 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `PATCH /api/v1/roles/{sup_id}` body `{"name":"SeniorSupervisor"}` | HTTP 403; `success === false`; message contains `Default role "Supervisor" cannot be renamed` | API | Realized by: AUTOMATION GAP — spec 31 tests Admin rename, not non-Admin default rename |
| TC-ROLE-091 | Admin | PATCH Warehouse Operator role rename returns 403 | P0 | 1. Login as Admin 2. Resolve Warehouse Operator UUID 3. `PATCH /api/v1/roles/{wh_id}` body `{"name":"Stock Manager"}` | HTTP 403; message contains `Default role "Warehouse Operator" cannot be renamed` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-092 | Admin | PATCH Dispatch Operator role rename returns 403 | P0 | 1. Login as Admin 2. Resolve Dispatch Operator UUID 3. `PATCH /api/v1/roles/{dp_id}` body `{"name":"Logistics"}` | HTTP 403; message contains `Default role "Dispatch Operator" cannot be renamed` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-093 | Admin | PATCH Supervisor role with same name (no actual rename) succeeds | P1 | 1. Login as Admin 2. `PATCH /api/v1/roles/{sup_id}` body `{"name":"Supervisor","permissions":[{"permission":"dispatch:read","max_stage":null}]}` | HTTP 200 (rename check condition: `input.name !== currentRole.name` is false → guard not triggered); permissions are updated | API | Edge case: default role rename guard checks `input.name !== currentRole.name`; same-name PATCH is valid; AUTOMATION GAP |

---

## Section 33.9 — Update role — permission edits (happy path)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-100 | Admin | PATCH custom role permissions replaces role_permissions rows | P0 | 1. Login as Admin 2. Create custom role `e2e-patch-test` with `[{permission:"products:read"}]` → capture `role_id` 3. `PATCH /api/v1/roles/{role_id}` body `{"permissions":[{"permission":"cartons:read","max_stage":null},{"permission":"dispatch:read","max_stage":null}]}` 4. `GET /api/v1/roles/{role_id}` | PATCH returns HTTP 200; `data.permissions.length === 2`; no more `products:read`; GET confirms same 2 permissions; old row deleted and new rows inserted | API | `updateRole` does DELETE + INSERT in transaction; AUTOMATION GAP |
| TC-ROLE-101 | Admin | PATCH custom role to empty permissions clears all role_permissions rows | P0 | 1. Login as Admin 2. Create custom role `e2e-clear-test` with 2 permissions 3. `PATCH /api/v1/roles/{role_id}` body `{"permissions":[]}` 4. `GET /api/v1/roles/{role_id}` | PATCH 200; `data.permissions === []`; GET confirms empty; cleanup DELETE | API | Realized by: AUTOMATION GAP |
| TC-ROLE-102 | Admin | PATCH custom role to rename succeeds | P0 | 1. Login as Admin 2. Create custom role `e2e-rename-orig-${TS}` 3. `PATCH /api/v1/roles/{role_id}` body `{"name":"e2e-rename-new-${TS}"}` 4. `GET /api/v1/roles/{role_id}` | PATCH 200; `data.name` = new name; GET confirms new name; `updated_at > created_at` | API | Custom (non-default) roles CAN be renamed; AUTOMATION GAP |
| TC-ROLE-103 | Admin | PATCH Supervisor permissions (no rename) replaces role_permissions correctly | P0 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[{"permission":"products:read","max_stage":null}]}` 4. `GET /api/v1/roles/{sup_id}` 5. Restore original permissions | PATCH 200; GET shows `permissions.length === 1` (only products:read); restoring puts back all 19 original permissions | Integration | Key scenario: default roles CAN have permissions changed; AUTOMATION GAP |
| TC-ROLE-104 | Admin | PATCH role without permissions field leaves existing permissions unchanged | P1 | 1. Login as Admin 2. Create custom role `e2e-noperm-patch-${TS}` with 1 permission 3. `PATCH /api/v1/roles/{role_id}` body `{"name":"e2e-noperm-patch-new-${TS}"}` (no `permissions` field) 4. `GET /api/v1/roles/{role_id}` | PATCH 200; permissions unchanged (still 1 permission); `name` updated | API | `input.permissions === undefined` branch skips DELETE+INSERT; AUTOMATION GAP |
| TC-ROLE-105 | Admin | PATCH returns the full updated role via getRoleById | P1 | 1. Login as Admin 2. Create custom role 3. `PATCH /api/v1/roles/{id}` with new permissions 4. Compare PATCH response against `GET /api/v1/roles/{id}` response | PATCH response `data` equals GET response `data` (same fields, same values) | API | `updateRole` calls `getRoleById(id)` at the end; AUTOMATION GAP |

---

## Section 33.10 — Update role — validation (400 / 404 / 409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-110 | Admin | PATCH non-existent role UUID returns 404 | P0 | 1. Login as Admin 2. `PATCH /api/v1/roles/00000000-0000-0000-0000-000000000099` body `{"permissions":[]}` | HTTP 404; message contains "Role not found" | API | Realized by: AUTOMATION GAP |
| TC-ROLE-111 | Admin | PATCH role with invalid UUID param returns 400 | P1 | 1. Login as Admin 2. `PATCH /api/v1/roles/not-a-uuid` body `{"name":"X"}` | HTTP 400; Zod validation error on params; "Invalid role ID format" | API | Realized by: AUTOMATION GAP |
| TC-ROLE-112 | Admin | PATCH role with invalid permission key returns 400 | P0 | 1. Login as Admin 2. Create custom role `e2e-inv-upd-${TS}` 3. `PATCH /api/v1/roles/{id}` body `{"permissions":[{"permission":"nonexistent:action","max_stage":null}]}` | HTTP 400; message contains "Invalid permission(s): nonexistent:action" | API | AUTOMATION GAP |
| TC-ROLE-113 | Admin | PATCH custom role to name that already exists returns 409 | P0 | 1. Login as Admin 2. Create two custom roles: `e2e-a-${TS}` and `e2e-b-${TS}` 3. `PATCH /api/v1/roles/{id_of_b}` body `{"name":"e2e-a-${TS}"}` | HTTP 409; message contains `Role name "e2e-a-${TS}" already exists` | API | `WHERE name = $1 AND id != $2` uniqueness check; AUTOMATION GAP |
| TC-ROLE-114 | Admin | PATCH role with name shorter than 2 chars returns 400 | P1 | 1. Login as Admin 2. Create custom role 3. `PATCH /api/v1/roles/{id}` body `{"name":"X"}` | HTTP 400; Zod error "Name must be at least 2 characters" | API | Realized by: AUTOMATION GAP |

---

## Section 33.11 — Delete role — default-role blocked (403)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-120 | Admin | DELETE Admin role returns 403 | P0 | 1. Login as Admin 2. Resolve Admin UUID 3. `DELETE /api/v1/roles/{admin_id}` | HTTP 403; message contains `Default role "Admin" cannot be deleted` | API | Realized by: `TC-RBAC-008` in `31-role-manager.spec.ts` |
| TC-ROLE-121 | Admin | DELETE Supervisor role returns 403 | P0 | 1. Login as Admin 2. Resolve Supervisor UUID 3. `DELETE /api/v1/roles/{sup_id}` | HTTP 403; message contains `Default role "Supervisor" cannot be deleted` | API | Realized by: `TC-RBAC-010` in `31-role-manager.spec.ts` |
| TC-ROLE-122 | Admin | DELETE Warehouse Operator role returns 403 | P0 | 1. Login as Admin 2. Resolve Warehouse Operator UUID 3. `DELETE /api/v1/roles/{wh_id}` | HTTP 403; message contains `Default role "Warehouse Operator" cannot be deleted` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-123 | Admin | DELETE Dispatch Operator role returns 403 | P0 | 1. Login as Admin 2. Resolve Dispatch Operator UUID 3. `DELETE /api/v1/roles/{dp_id}` | HTTP 403; message contains `Default role "Dispatch Operator" cannot be deleted` | API | Realized by: AUTOMATION GAP |
| TC-ROLE-124 | Admin | DELETE non-existent UUID returns 404 | P1 | 1. Login as Admin 2. `DELETE /api/v1/roles/00000000-0000-0000-0000-000000000099` | HTTP 404; message contains "Role not found" | API | AUTOMATION GAP |
| TC-ROLE-125 | Admin | DELETE with invalid UUID format returns 400 | P1 | 1. Login as Admin 2. `DELETE /api/v1/roles/not-a-uuid` | HTTP 400; Zod validation error "Invalid role ID format" | API | AUTOMATION GAP |

---

## Section 33.12 — Delete role — assigned-users blocked (409)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-130 | Admin | DELETE custom role with assigned users returns 409 with user count | P0 | 1. Login as Admin 2. Create custom role `e2e-occupied-${TS}` 3. Directly assign a test user to that role via DB (or via API if user-update schema allows custom role) 4. `DELETE /api/v1/roles/{occupied_role_id}` | HTTP 409; message contains `Cannot delete role "e2e-occupied-${TS}": 1 user(s) are currently assigned to it. Reassign them to a different role first.`; `data === null` | API | DESIGN LIMITATION: `PUT /api/v1/users/:id` only accepts seeded enum role names — custom role assignment not possible via public API. Test requires direct DB seed or DB-level assignment. Document as AUTOMATION GAP pending user-schema extension |
| TC-ROLE-131 | Admin | DELETE custom role with multiple assigned users 409 message includes correct count | P1 | 1. Assign 3 users to a custom role via DB 2. `DELETE /api/v1/roles/{role_id}` | HTTP 409; message contains "3 user(s)" in the count | API | AUTOMATION GAP — requires DB-level user assignment for custom roles |
| TC-ROLE-132 | Admin | After reassigning all users from custom role, DELETE succeeds | P0 | 1. Create custom role `e2e-reassign-${TS}` 2. Assign test users to it (DB) 3. Reassign users back to Supervisor (API or DB) 4. `DELETE /api/v1/roles/{role_id}` | HTTP 200; role is deleted; subsequent `GET /api/v1/roles/{role_id}` returns 404 | Integration | AUTOMATION GAP |

---

## Section 33.13 — Delete role — happy path + cascade

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-140 | Admin | DELETE empty custom role returns 200 and removes role | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-deletable-${TS}","permissions":[{"permission":"products:read","max_stage":null}]}` → capture `role_id` 3. `DELETE /api/v1/roles/{role_id}` 4. `GET /api/v1/roles/{role_id}` | DELETE returns HTTP 200; `success === true`; `data === null`; subsequent GET returns 404 | API | Realized by: `TC-RBAC-011` step 4 in `31-role-manager.spec.ts` |
| TC-ROLE-141 | Admin | DELETE role cascades to remove role_permissions rows | P0 | 1. Create custom role with 3 permissions → capture `role_id` 2. Verify role_permissions rows exist (via `GET /api/v1/roles/{role_id}` → `permissions.length === 3`) 3. `DELETE /api/v1/roles/{role_id}` 4. `GET /api/v1/roles/{role_id}` | DELETE 200; GET returns 404; no orphan role_permissions rows (ON DELETE CASCADE on role_id FK) | API | Migration defines `onDelete: 'CASCADE'` on role_id FK; AUTOMATION GAP for explicit cascade verification |
| TC-ROLE-142 | Admin | Deleted role no longer appears in GET /roles list | P0 | 1. Create and delete a custom role (TC-ROLE-140 flow) 2. `GET /api/v1/roles` | Deleted role ID is not present in the returned `data.roles` array | API | AUTOMATION GAP |
| TC-ROLE-143 | Admin | DELETE is idempotent — second delete returns 404 | P1 | 1. Create and delete a custom role 2. Attempt `DELETE /api/v1/roles/{role_id}` again | HTTP 404; "Role not found" (second delete hits the "role not found" guard) | API | AUTOMATION GAP |

---

## Section 33.14 — Stage-aware max_stage custom role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-150 | Admin | Create custom role with stage-aware cartons:update and max_stage=ACTIVE | P0 | 1. Login as Admin 2. `POST /api/v1/roles` body `{"name":"e2e-stage-${TS}","permissions":[{"permission":"cartons:update","max_stage":"ACTIVE"}]}` 3. `GET /api/v1/roles/{id}` | POST 201; `data.permissions[0].permission === "cartons:update"`; `data.permissions[0].max_stage === "ACTIVE"`; GET confirms same | API | Realized by: AUTOMATION GAP; covers the dormant `max_stage` field (NULL for all seeded roles) |
| TC-ROLE-151 | Admin | Create custom role with max_stage=CREATED blocks update on ACTIVE carton | P0 | 1. Admin creates custom role `e2e-stage-block` with `cartons:update max_stage=CREATED` 2. Create a test user assigned to that role (DB) 3. Create a master carton → advance to ACTIVE status 4. Custom-role user attempts `PATCH /api/v1/master-cartons/{id}` | HTTP 403; message contains "restricted at stage ACTIVE (your role allows up to CREATED)" | Integration | Verifies `stageIndex` comparison in `authorizePermission`; AUTOMATION GAP — requires custom-role user assignment via DB |
| TC-ROLE-152 | Admin | Create custom role with child_boxes:delete max_stage=FREE blocks delete on PACKED box | P1 | 1. Admin creates role with `child_boxes:delete max_stage=FREE` 2. Custom-role user has a child box in PACKED status 3. `DELETE /api/v1/child-boxes/{box_id}` as custom-role user | HTTP 403; stage check blocks deletion; SAMPLE/ECOMMERCE/DISPATCHED statuses are treated as terminal (equivalent to DISPATCHED index) | Integration | Verifies child_box stage ordering (SAMPLE → DISPATCHED index); AUTOMATION GAP |
| TC-ROLE-153 | Admin | Seeded roles have max_stage=NULL for all stage-aware permissions | P1 | 1. Login as Admin 2. `GET /api/v1/roles` 3. For each seeded role, inspect permissions array | All entries have `max_stage === null`; no stage restriction is applied for any seeded role | API | Seeded with `max_stage=NULL`; AUTOMATION GAP |
| TC-ROLE-154 | Admin | PATCH stage-aware permission to change max_stage persists correctly | P1 | 1. Create custom role with `cartons:update max_stage=ACTIVE` 2. `PATCH /api/v1/roles/{id}` body `{"permissions":[{"permission":"cartons:update","max_stage":"CLOSED"}]}` 3. `GET /api/v1/roles/{id}` | PATCH 200; GET shows `max_stage === "CLOSED"` (not "ACTIVE"); full replace-on-update semantics | API | AUTOMATION GAP |

---

## Section 33.15 — Integration: grant Supervisor samples:create + samples:update, verify immediate effect

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-160 | Admin | Admin grants Supervisor samples:create + samples:update via PATCH /roles/:id | P0 | 1. Login as Admin, get `admin_token` 2. `GET /api/v1/roles` → resolve Supervisor role UUID (`sup_id`) 3. Get Supervisor's current 19 permissions 4. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[...existing 19...plus {permission:"samples:create",max_stage:null},{permission:"samples:update",max_stage:null}]}` | HTTP 200; `data.permissions.length === 21`; `samples:create` and `samples:update` present; GET confirms rows in role_permissions | Integration | Realized by: AUTOMATION GAP — highest-priority integration test; proves Role Manager can extend default role capabilities |
| TC-ROLE-161 | Supervisor | Supervisor token (existing session) can now POST /samples immediately after grant — no re-login | P0 | 1. Pre-condition: TC-ROLE-160 completed (Supervisor now has samples:create) 2. Use the Supervisor token obtained BEFORE the permission grant (same session token) 3. `POST /api/v1/samples` with `sup_token` body `{"name":"E2E Sample ${TS}","type":"PRODUCT"}` | HTTP 201; sample created successfully; `authorizePermission` reads role_permissions live on each request — no re-login required; proves immediate-effect guarantee | Integration | This is the **core immediate-effect TC**; AUTOMATION GAP — must be added to `31-role-manager.spec.ts` |
| TC-ROLE-162 | Supervisor | Supervisor token (existing session) can POST /samples/add-box immediately after grant | P0 | 1. Pre-condition: TC-ROLE-161 completed, sample created → capture `sample_id` 2. Create a FREE child box via Admin 3. `POST /api/v1/samples/add-box` with `sup_token` body `{"sample_id":"${sample_id}","box_barcode":"${barcode}","foot":"PAIR"}` | HTTP 200; box added to sample; samples:update permission is now recognized for this token's role | Integration | AUTOMATION GAP |
| TC-ROLE-163 | Supervisor | Supervisor CAN call GET /samples (ungated endpoint) regardless of grant | P1 | 1. Pre-condition: TC-ROLE-160 NOT yet completed (baseline Supervisor without samples:create) 2. `GET /api/v1/samples` with any Supervisor token | HTTP 200; GET /samples has NO `authorizePermission` gate — any authenticated user can read; this is independent of the grant | API | Known discrepancy per MASTER_TEST_PLAN.md §Known discrepancies #1; AUTOMATION GAP |
| TC-ROLE-164 | Supervisor | Before grant: Supervisor token returns 403 for POST /samples | P0 | 1. Login as Supervisor, capture `sup_token_baseline` 2. Confirm Supervisor role does NOT have `samples:create` (check GET /roles/{sup_id}.permissions) 3. `POST /api/v1/samples` with `sup_token_baseline` | HTTP 403; message "Required permission: samples:create"; this is the baseline confirming samples are Admin-only by default | API | Realized by: phase-11 covers this; include here for grant-flow baseline; AUTOMATION GAP in spec 31 |
| TC-ROLE-165 | Admin | Admin revokes samples:create + samples:update from Supervisor | P0 | 1. Pre-condition: TC-ROLE-160 completed 2. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[...restore original 19 permissions...]}` | HTTP 200; `data.permissions.length === 19`; `samples:create` and `samples:update` no longer in permissions; GET confirms | Integration | Cleanup after grant-flow tests; AUTOMATION GAP |

---

## Section 33.16 — Integration: revoke permission, verify immediate denial (no re-login)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-170 | Admin | Revoke Supervisor samples:create — existing Supervisor session gets 403 immediately | P0 | 1. Grant Supervisor `samples:create` (TC-ROLE-160) 2. Login as Supervisor → capture `sup_token` 3. Confirm Supervisor CAN `POST /api/v1/samples` (HTTP 201) 4. Admin revokes `samples:create` via PATCH /roles/{sup_id} (remove the permission) 5. Re-use same `sup_token` (no new login) 6. `POST /api/v1/samples` again with same token | Step 3: HTTP 201. Step 6: HTTP 403 ("Required permission: samples:create"); revocation takes effect on the next request without re-login | Integration | This is the **revocation immediate-effect TC**; proves middleware reads DB live; AUTOMATION GAP |
| TC-ROLE-171 | Admin | Revoke all permissions from Supervisor — Supervisor cannot write cartons | P1 | 1. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[]}` 2. Use existing Supervisor token 3. `POST /api/v1/master-cartons` | HTTP 403; "Required permission: cartons:create"; immediate effect confirmed | Integration | AUTOMATION GAP; restore permissions after |
| TC-ROLE-172 | Admin | Restore Supervisor permissions — Supervisor can write again immediately | P1 | 1. Pre-condition: TC-ROLE-171 (Supervisor has zero permissions) 2. `PATCH /api/v1/roles/{sup_id}` body `{"permissions":[...all 19 original perms...]}` 3. Same Supervisor token: `POST /api/v1/master-cartons` | HTTP 201; carton created; restoration takes effect immediately | Integration | Round-trip restore; AUTOMATION GAP |

---

## Section 33.17 — Frontend E2E — /admin/roles page (Admin)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-180 | Admin | Admin sees Role Manager page with all 4 seeded role cards | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/admin/roles` | Page title "Role Manager" visible; 4 role cards rendered: Admin, Supervisor, Warehouse Operator, Dispatch Operator; each card shows role name, user count badge, permission count | E2E | Realized by: `TC-RBAC-001` in `31-role-manager.spec.ts` (indirectly — sidebar check); AUTOMATION GAP for page content check |
| TC-ROLE-181 | Admin | Admin card shows "Protected" badge and "View permissions" button (not "Edit permissions") | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` | Admin card has a red "Protected" badge; action button reads "View permissions" with Eye icon (not Pencil); Delete button is disabled (`opacity-40`) | E2E | `isAdminRole` branch in `page.tsx`; AUTOMATION GAP |
| TC-ROLE-182 | Admin | Default-role cards (non-Admin) show "Default" blue badge and "Edit permissions" button | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` | Supervisor, Warehouse Operator, and Dispatch Operator cards each have a blue "Default" badge; action button reads "Edit permissions" with Pencil icon; Delete button is disabled | E2E | `isDefault && !isAdminRole` branch; AUTOMATION GAP |
| TC-ROLE-183 | Admin | Custom role card shows no badge, enabled Delete button | P0 | 1. Create custom role via API (TC-ROLE-070) 2. Login as Admin 3. Navigate to `/admin/roles` | Custom role card has no badge; Delete button is NOT disabled (`canDelete === true`); "Edit permissions" button visible | E2E | AUTOMATION GAP |
| TC-ROLE-184 | Admin | "New Role" button is visible and opens create modal | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` 3. Click "New Role" button | Create modal opens with title "New Role"; Name field is empty and editable; Permission matrix is visible with all 15 modules; "Create Role" submit button present | E2E | AUTOMATION GAP |
| TC-ROLE-185 | Admin | Role cards show correct user counts matching API | P1 | 1. Login as Admin 2. `GET /api/v1/roles` to capture expected counts 3. Navigate to `/admin/roles` | Each card's user count display matches the `user_count` value from the API for that role | E2E | AUTOMATION GAP |
| TC-ROLE-186 | Admin | Loading state shows "Loading roles…" text while API call in progress | P2 | 1. Login as Admin 2. Throttle network to Slow 3G in DevTools 3. Navigate to `/admin/roles` | "Loading roles…" text visible during load; cards appear after API response | E2E | AUTOMATION GAP |
| TC-ROLE-187 | Admin | Empty state shows "No roles found." if roles list is empty | P2 | 1. This state is not reachable in production (4 seeded roles always exist); test with mocked API returning empty array | "No roles found." text displayed | E2E | Manual / mock-based only; AUTOMATION GAP |

---

## Section 33.18 — Frontend E2E — /admin/roles page (denied roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-190 | Supervisor | Supervisor navigating to /admin/roles sees Access Denied (inline, no redirect) | P0 | 1. Login as Supervisor 2. Navigate to `http://localhost:3000/admin/roles` | Page renders "Access Denied" shield with text "Only administrators can manage roles."; URL stays at `/admin/roles` (no redirect); role cards NOT rendered | E2E | `!isAdmin` gate in `page.tsx`; AUTOMATION GAP |
| TC-ROLE-191 | Warehouse Operator | Warehouse Operator sees Access Denied on /admin/roles | P0 | 1. Login as Warehouse Operator 2. Navigate to `/admin/roles` | Same "Access Denied" shield rendered; no role data visible; no redirect | E2E | AUTOMATION GAP |
| TC-ROLE-192 | Dispatch Operator | Dispatch Operator sees Access Denied on /admin/roles | P0 | 1. Login as Dispatch Operator 2. Navigate to `/admin/roles` | "Access Denied" shield; role data hidden; page does not redirect | E2E | AUTOMATION GAP |
| TC-ROLE-193 | Supervisor | "Role Manager" link not in sidebar for Supervisor | P0 | 1. Login as Supervisor 2. Navigate to any page 3. Inspect sidebar navigation | No "Role Manager" link in sidebar; Admin-only items hidden via `useCan('roles:manage')` or equivalent sidebar gate | E2E | Realized by: `TC-RBAC-001` verifies Admin sees it; `TC-RBAC-002` verifies Warehouse Op does not; AUTOMATION GAP for Supervisor |
| TC-ROLE-194 | Warehouse Operator | "Role Manager" link not in sidebar for Warehouse Operator | P0 | 1. Login as Warehouse Operator 2. Inspect sidebar | No "Role Manager" link visible | E2E | Realized by: `TC-RBAC-002` in `31-role-manager.spec.ts` |
| TC-ROLE-195 | Dispatch Operator | "Role Manager" link not in sidebar for Dispatch Operator | P0 | 1. Login as Dispatch Operator 2. Inspect sidebar | No "Role Manager" link visible | E2E | AUTOMATION GAP |

---

## Section 33.19 — Frontend E2E — Create role modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-200 | Admin | Create role modal — name field required, submit disabled when empty | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` 3. Click "New Role" 4. Leave Name field empty | "Create Role" submit button is disabled (`disabled={!name.trim()}`); cannot submit empty form | E2E | AUTOMATION GAP |
| TC-ROLE-201 | Admin | Create role — happy path creates role and refreshes list | P0 | 1. Login as Admin 2. Open create modal 3. Enter name "E2E Test Role ${TS}" 4. Check "products:read" permission checkbox 5. Click "Create Role" | Modal closes; success toast visible; new role card appears in grid with name "E2E Test Role ${TS}" and "1 permission" | E2E | AUTOMATION GAP |
| TC-ROLE-202 | Admin | Create role — 409 duplicate name shows inline error in modal | P0 | 1. Login as Admin 2. Open create modal 3. Enter name "Supervisor" 4. Click "Create Role" | Modal stays open; inline red error banner shows `A role with that name already exists.`; no toast shown (inline error, not toast) | E2E | `onError` handler sets `inlineError` for status 409; AUTOMATION GAP |
| TC-ROLE-203 | Admin | Create role — 400 invalid permission key (if manually injected) shows inline error | P1 | 1. Test via direct API (UI doesn't allow free-text permission input) | HTTP 400 at API level handled; if UI can send bad data, inline error shows | E2E | UI enforces catalog — users can only check catalog checkboxes; 400 from UI is near-impossible; document as API-only scenario |
| TC-ROLE-204 | Admin | Create role — Cancel closes modal without creating role | P0 | 1. Login as Admin 2. Open create modal 3. Enter name "E2E Cancel Test" 4. Click "Cancel" | Modal closes; no new role card created; role list unchanged | E2E | AUTOMATION GAP |
| TC-ROLE-205 | Admin | Create role — all 47 permission checkboxes render (one per catalog entry) | P1 | 1. Login as Admin 2. Open create modal 3. Count checkboxes in PermissionMatrix | Exactly 47 checkboxes present across 15 module sections | E2E | AUTOMATION GAP |
| TC-ROLE-206 | Admin | Create role — stage-aware permission shows max_stage dropdown when checked | P1 | 1. Login as Admin 2. Open create modal 3. Check "cartons: Edit" (cartons:update, stage_aware) | An "up to:" dropdown appears inline next to the checkbox; options include CREATED, ACTIVE, CLOSED, DISPATCHED plus "No limit" | E2E | `action.stage_aware && checked` renders dropdown in `PermissionMatrix`; AUTOMATION GAP |
| TC-ROLE-207 | Admin | Create role — stage-aware max_stage dropdown hidden when unchecked | P1 | 1. Login as Admin 2. Open create modal 3. Check then uncheck cartons:update checkbox | Dropdown disappears when unchecked | E2E | AUTOMATION GAP |

---

## Section 33.20 — Frontend E2E — Edit role modal (non-Admin default role)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-210 | Admin | Edit modal for Supervisor shows name field DISABLED with helper text | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` 3. Click "Edit permissions" on Supervisor card | Modal opens titled "Edit Role: Supervisor"; name input is disabled; helper text reads "Default role names cannot be changed." | E2E | `isDefaultRole` disables name field in `RoleEditModal`; AUTOMATION GAP |
| TC-ROLE-211 | Admin | Edit modal for Supervisor shows all 19 current permissions pre-checked | P0 | 1. Login as Admin 2. Open edit modal for Supervisor | 19 permission checkboxes are checked; all others unchecked; checked boxes match seed permissions | E2E | AUTOMATION GAP |
| TC-ROLE-212 | Admin | Edit Supervisor — add ecommerce:create permission and save | P0 | 1. Login as Admin 2. Open edit Supervisor modal 3. Check "ecommerce: Create" 4. Click "Save Changes" | Modal closes; success toast; GET /api/v1/roles confirms `ecommerce:create` now in Supervisor permissions; cleanup to restore | E2E | AUTOMATION GAP |
| TC-ROLE-213 | Admin | Edit modal for custom role shows editable name and permission matrix | P0 | 1. Create custom role with 2 permissions 2. Open edit modal | Name field is editable (not disabled); permissions pre-checked per role; "Save Changes" button present | E2E | AUTOMATION GAP |
| TC-ROLE-214 | Admin | Edit custom role — rename and change permissions, save | P0 | 1. Open edit modal for custom role `e2e-edit-test` 2. Change name to `e2e-edit-renamed` 3. Uncheck 1 permission, check another 4. Save | Modal closes; role card updates to new name; permission count badge updates | E2E | AUTOMATION GAP |
| TC-ROLE-215 | Admin | Edit modal — 409 on duplicate name shows inline error | P1 | 1. Create custom role `e2e-dupe-src` 2. Open edit modal for another custom role 3. Enter name `e2e-dupe-src` 4. Save | Inline error: "A role with that name already exists."; modal stays open | E2E | AUTOMATION GAP |
| TC-ROLE-216 | Admin | Edit modal description banner for default (non-Admin) roles | P1 | 1. Login as Admin 2. Open edit modal for Warehouse Operator | Modal description text reads "This is a default system role. You can edit permissions but cannot rename it." | E2E | `isDefaultRole` modal description in `RoleEditModal`; AUTOMATION GAP |

---

## Section 33.21 — Frontend E2E — Admin role view-only modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-220 | Admin | Clicking "View permissions" on Admin card opens view-only modal | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` 3. Click "View permissions" on Admin card | Modal opens with title "View Role: Admin"; amber banner reads "The Admin role is protected and cannot be modified. All permissions are granted implicitly." | E2E | `isAdminRole` renders amber Lock banner; AUTOMATION GAP |
| TC-ROLE-221 | Admin | Admin view-only modal has disabled checkboxes (readOnly=true) | P0 | 1. Open view modal for Admin | All checkboxes in PermissionMatrix are disabled (`readOnly={true}`); `opacity-60 cursor-default` styling applied | E2E | `readOnly = isAdminRole` passed to PermissionMatrix; AUTOMATION GAP |
| TC-ROLE-222 | Admin | Admin view-only modal has only "Close" button (no Save) | P0 | 1. Open view modal for Admin | Footer contains only "Close" button; no "Save Changes" or "Create Role" button | E2E | `readOnly ? <Close> : <>Cancel/Save</>` in modal footer; AUTOMATION GAP |
| TC-ROLE-223 | Admin | Name field in Admin view modal is disabled | P1 | 1. Open view modal for Admin | Role Name input field is disabled (`disabled={readOnly || isDefaultRole}` — both true); no text input possible | E2E | AUTOMATION GAP |

---

## Section 33.22 — Frontend E2E — Delete role modal

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-230 | Admin | Delete button disabled for default/protected roles (no modal opens) | P0 | 1. Login as Admin 2. Navigate to `/admin/roles` | All 4 default role cards have Delete button disabled (`opacity-40`); clicking does not open modal (click handler checks `canDelete` before calling `setModal`) | E2E | `canDelete = !isDefault` in page.tsx; AUTOMATION GAP |
| TC-ROLE-231 | Admin | Delete modal opens for custom role with confirmation text | P0 | 1. Create custom role `e2e-del-modal-${TS}` 2. Navigate to `/admin/roles` 3. Click Delete on the custom role card | Modal opens with title "Delete Role"; body text: "Are you sure you want to delete the role e2e-del-modal-${TS}?" | E2E | AUTOMATION GAP |
| TC-ROLE-232 | Admin | Delete modal with 0 users shows only confirmation text (no warning) | P1 | 1. Create custom role with no users 2. Open delete modal | Modal body shows confirmation text only; no amber user-count warning | E2E | `role.user_count > 0` conditional in `DeleteRoleModal`; AUTOMATION GAP |
| TC-ROLE-233 | Admin | Delete modal with users > 0 shows amber reassign warning | P1 | 1. Custom role has `user_count > 0` (requires DB assignment of user to custom role) 2. Open delete modal | Amber warning text shows: "N user(s) are currently assigned to this role. You must reassign them before deleting." | E2E | AUTOMATION GAP — requires custom role with users; design limitation (API can't assign custom roles to users) |
| TC-ROLE-234 | Admin | Confirm delete — success deletes role and refreshes list | P0 | 1. Create custom role `e2e-del-confirm-${TS}` 2. Open delete modal 3. Click "Delete" confirm button | Modal closes; success toast `Role "e2e-del-confirm-${TS}" deleted`; role card removed from grid | E2E | AUTOMATION GAP |
| TC-ROLE-235 | Admin | Delete modal — Cancel closes without deleting | P0 | 1. Open delete modal for custom role 2. Click "Cancel" | Modal closes; role card still present in grid; `GET /api/v1/roles/{id}` still returns 200 | E2E | AUTOMATION GAP |
| TC-ROLE-236 | Admin | Delete modal — 409 response shows inline error (server blocked it) | P1 | 1. Custom role with user assigned (DB) 2. Open delete modal 3. Click "Delete" | Server returns 409; modal stays open; inline error: "Cannot delete role — N user(s) still assigned. Reassign them first." | E2E | `onError` handler for 409 in `DeleteRoleModal`; AUTOMATION GAP — requires custom role with assigned users |

---

## Section 33.23 — Frontend E2E — Permission grid (PermissionMatrix component)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-240 | Admin | PermissionMatrix renders 15 module sections with correct labels | P1 | 1. Login as Admin 2. Open any create/edit modal | 15 module sections visible: Users, Roles, Products, Child Boxes, Master Cartons, Packing, Dispatch, Samples, E-Commerce, Customers, Sections, Inventory, Reports, Audit Logs, Settings | E2E | Module labels from `PERMISSION_CATALOG`; AUTOMATION GAP |
| TC-ROLE-241 | Admin | Checking a permission checkbox adds it to the permissions array | P1 | 1. Open create modal 2. Uncheck all permissions 3. Check "products: View" checkbox | `permissions` state array gains `{permission:"products:read",max_stage:null}`; checkbox is checked | E2E | `handleCheck` in PermissionMatrix; AUTOMATION GAP |
| TC-ROLE-242 | Admin | Unchecking a permission checkbox removes it from the permissions array | P1 | 1. Open create modal 2. Ensure "products:read" is checked 3. Uncheck it | Checkbox unchecked; permission removed from state array | E2E | AUTOMATION GAP |
| TC-ROLE-243 | Admin | Stage-aware dropdown value persists when stage is changed | P1 | 1. Open create modal 2. Check cartons:update (stage_aware) 3. Change "up to:" dropdown to ACTIVE 4. Save role | Saved role has `cartons:update` with `max_stage="ACTIVE"` in API response | E2E | `handleStageChange` in PermissionMatrix; AUTOMATION GAP |
| TC-ROLE-244 | Admin | Stage-aware dropdown resets to null when permission unchecked and re-checked | P1 | 1. Check cartons:update, set max_stage=CLOSED 2. Uncheck cartons:update 3. Re-check cartons:update | Dropdown shows "No limit" (max_stage=null) after re-check; previous CLOSED value not retained | E2E | `handleCheck` adds with `max_stage:null`; AUTOMATION GAP |
| TC-ROLE-245 | Admin | ReadOnly=true — all checkboxes disabled, dropdowns disabled | P1 | 1. Open Admin "View permissions" modal | All checkboxes have `disabled` attribute; all stage-aware dropdowns (if any) have `disabled`; cursor shows `cursor-default` styling | E2E | AUTOMATION GAP |
| TC-ROLE-246 | Admin | Catalog loading state shows "Loading permission catalog…" | P2 | 1. Throttle network 2. Open create modal | "Loading permission catalog…" text visible during `/permissions` API call | E2E | `catalogLoading` state in `RoleEditModal`; AUTOMATION GAP |

---

## Section 33.24 — Frontend E2E — Sidebar Role Manager visibility

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-250 | Admin | Admin sees "Role Manager" sidebar link | P0 | 1. Login as Admin 2. Navigate to any dashboard page 3. Inspect sidebar | "Role Manager" link visible in sidebar; navigates to `/admin/roles` | E2E | Realized by: `TC-RBAC-001` in `31-role-manager.spec.ts` |
| TC-ROLE-251 | Admin | Clicking "Role Manager" sidebar link navigates to /admin/roles | P0 | 1. Login as Admin 2. Click "Role Manager" in sidebar | Browser navigates to `/admin/roles`; page renders role cards | E2E | AUTOMATION GAP |
| TC-ROLE-252 | Admin | "Role Manager" sidebar link is active/highlighted when on /admin/roles | P2 | 1. Login as Admin 2. Navigate to `/admin/roles` | Sidebar "Role Manager" link has active styling (highlighted/underlined) | E2E | AUTOMATION GAP |

---

## Section 33.25 — Regression — role_permissions backfill migration

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-ROLE-260 | Admin | Migration 20260529100001 backfills role_permissions from roles.permissions jsonb | P0 | 1. Run `SELECT COUNT(*) FROM role_permissions` on DB 2. Count expected: Admin(27) + Supervisor(19) + Warehouse(9) + Dispatch(7) = 62 rows minimum | `COUNT(*) >= 62`; all seed roles have their permissions reflected in the normalized table | Manual | Verified by migration SQL: `INSERT INTO role_permissions SELECT id, jsonb_array_elements_text(permissions) FROM roles`; AUTOMATION GAP |
| TC-ROLE-261 | Admin | ON CONFLICT DO NOTHING prevents duplicate backfill rows | P1 | 1. Re-run the migration backfill SQL manually 2. Re-check COUNT | `COUNT(*)` unchanged after second run (idempotent backfill due to ON CONFLICT); unique constraint `uq_role_permissions_role_perm` enforced | Manual | AUTOMATION GAP |
| TC-ROLE-262 | Admin | role_permissions FK cascade verified — DELETE role removes its permission rows | P1 | 1. Create custom role with 3 permissions via API 2. `SELECT COUNT(*) FROM role_permissions WHERE role_id = '{id}'` → expect 3 3. `DELETE /api/v1/roles/{id}` 4. Re-check SQL COUNT | Count drops to 0 after role delete; FK `onDelete: 'CASCADE'` works | Manual | AUTOMATION GAP |
| TC-ROLE-263 | Admin | Seeded role_permissions max_stage is NULL for all seeded entries | P1 | 1. Run `SELECT DISTINCT max_stage FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Admin','Supervisor','Warehouse Operator','Dispatch Operator'))` | Only value returned is NULL; no non-null max_stage for any seeded role | Manual | AUTOMATION GAP |

---

## Automation Gap Summary

The following TCs have no coverage in the current `31-role-manager.spec.ts` and should be added to close gaps:

| Priority | Gap Area | Recommended Spec Location | TCs Affected |
|----------|----------|--------------------------|--------------|
| P0 | Unauthenticated 401 for all 6 endpoints | `31-role-manager.spec.ts` | TC-ROLE-001 to 006 |
| P0 | Non-Admin 403 for all 3 non-Admin roles × all endpoints | `31-role-manager.spec.ts` | TC-ROLE-010 to 024 |
| P0 | Admin role blocks permission-only PATCH (not just rename) | `31-role-manager.spec.ts` | TC-ROLE-081 |
| P0 | Default-role rename blocked for Supervisor/WH/Dispatch | `31-role-manager.spec.ts` | TC-ROLE-090 to 092 |
| P0 | **Grant Supervisor samples:create+update, verify 201 with same token** | `31-role-manager.spec.ts` | TC-ROLE-160 to 165 |
| P0 | **Revoke permission, verify 403 on same token immediately** | `31-role-manager.spec.ts` | TC-ROLE-170 |
| P0 | GET /permissions catalog shape + 47-count assertion | `31-role-manager.spec.ts` | TC-ROLE-050 to 053 |
| P0 | Delete WH Operator and Dispatch Operator (both 403) | `31-role-manager.spec.ts` | TC-ROLE-122 to 123 |
| P0 | Frontend Access Denied for Supervisor/WH/Dispatch | new E2E spec or `31-role-manager.spec.ts` | TC-ROLE-190 to 195 |
| P1 | stage-aware max_stage create/persist/gate integration | `31-role-manager.spec.ts` | TC-ROLE-150 to 154 |
| P1 | PATCH custom role — permission replace semantics | `31-role-manager.spec.ts` | TC-ROLE-100 to 105 |

**Design Limitation (flag for future sprint):** `PUT /api/v1/users/:id` accepts only the 4 seeded role names (enum validation). Custom roles cannot be assigned to users via the public API, making the 409 "role has assigned users" path (TC-ROLE-130 to 132, TC-ROLE-233, TC-ROLE-236) untestable without direct DB access. Recommend extending `updateUserSchema` to accept any valid role by name or ID.
