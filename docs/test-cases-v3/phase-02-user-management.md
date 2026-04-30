# Phase 02 — User Management (Admin only)

**Module code:** `USER`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30

> **Note:** `GET /users` and `GET /users/:id` also allow Supervisor (read-only). All writes — POST, PUT, DELETE — are Admin only. The frontend `/users` page enforces this via `isAdmin` check and renders an "Access Denied" shield for non-Admin roles.

---

## Table of Contents

- [Section 02.1 — Seed: Create test users (TC-USER-SEED-001)](#section-021--seed-create-test-users)
- [Section 02.2 — Create user (POST /users)](#section-022--create-user-post-users)
- [Section 02.3 — List users (GET /users)](#section-023--list-users-get-users)
- [Section 02.4 — Get user by ID (GET /users/:id)](#section-024--get-user-by-id-get-usersid)
- [Section 02.5 — Update user (PUT /users/:id)](#section-025--update-user-put-usersid)
- [Section 02.6 — Deactivate / reactivate user (DELETE / is_active toggle)](#section-026--deactivate--reactivate-user)
- [Section 02.7 — Validation — create](#section-027--validation--create)
- [Section 02.8 — Validation — update](#section-028--validation--update)
- [Section 02.9 — Playwright E2E: Users page](#section-029--playwright-e2e-users-page)

---

## Section 02.1 — Seed: Create test users

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-SEED-001 | Admin | Create Supervisor, Warehouse Operator, and Dispatch Operator accounts for test suite | P0 | 1. Login as Admin, obtain token 2. `POST /api/v1/users` header `Authorization: Bearer <admin_token>` body `{"email":"supervisor@binny.com","password":"Sup@123","name":"Test Supervisor","role":"Supervisor"}` 3. `POST /api/v1/users` body `{"email":"warehouse@binny.com","password":"Wh@123","name":"Test Warehouse","role":"Warehouse Operator"}` 4. `POST /api/v1/users` body `{"email":"dispatch@binny.com","password":"Dp@123","name":"Test Dispatch","role":"Dispatch Operator"}` | Each POST returns HTTP 201; each response body contains `id` (UUID), `email`, `name`, `role`, `is_active === true`; all three accounts appear in `GET /api/v1/users`; all three can log in via `POST /api/v1/auth/login` | Integration | Run once before the entire v3 suite; skip if accounts already exist (HTTP 409 means they already exist) |

---

## Section 02.2 — Create user (POST /users)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-001 | Admin | Admin creates Supervisor user successfully | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"newsup@binny.com","password":"Sup@1234","name":"New Supervisor","role":"Supervisor"}` | HTTP 201; body `data.email === "newsup@binny.com"`, `data.role === "Supervisor"`, `data.is_active === true`; `data.id` is a valid UUID; no `password_hash` in response | API | |
| TC-USER-002 | Admin | Admin creates Warehouse Operator user | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"newwh@binny.com","password":"Wh@12345","name":"New Warehouse","role":"Warehouse Operator"}` | HTTP 201; `data.role === "Warehouse Operator"` | API | |
| TC-USER-003 | Admin | Admin creates Dispatch Operator user | P0 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"newdp@binny.com","password":"Dp@12345","name":"New Dispatch","role":"Dispatch Operator"}` | HTTP 201; `data.role === "Dispatch Operator"` | API | |
| TC-USER-004 | Admin | Admin creates another Admin user | P1 | 1. Login as Admin 2. `POST /api/v1/users` body `{"email":"admin2@binny.com","password":"Admin@1234","name":"Admin Two","role":"Admin"}` | HTTP 201; `data.role === "Admin"`; new Admin can log in and perform Admin operations | API | |
| TC-USER-005 | Admin | Created user appears in GET /users list | P0 | 1. Create a user via `POST /api/v1/users` 2. Note returned `id` 3. `GET /api/v1/users` | HTTP 200; returned array contains the newly created user matching `id`, `email`, `role` | Integration | |
| TC-USER-006 | Admin | Created user can log in immediately | P0 | 1. Create user `{"email":"logintest@binny.com","password":"Login@123","name":"Login Test","role":"Warehouse Operator"}` 2. `POST /api/v1/auth/login` body `{"email":"logintest@binny.com","password":"Login@123"}` | Step 2 returns HTTP 200 with valid token; role in response matches "Warehouse Operator" | Integration | |
| TC-USER-007 | Admin | Duplicate email returns 409 | P0 | 1. Create user with `email="dup@binny.com"` 2. `POST /api/v1/users` again with same email, different name/role | HTTP 409; body contains "Email already exists"; no second user created in DB | API | user.service ConflictError |
| TC-USER-008 | Admin | Email is stored as lowercase (trim + toLowerCase) | P1 | 1. `POST /api/v1/users` body `{"email":"  UPPERCASE@Binny.COM  ","password":"Test@1234","name":"Case Test","role":"Supervisor"}` | HTTP 201; `data.email === "uppercase@binny.com"` (trimmed, lowercased) | API | createUserSchema .trim().toLowerCase() |

---

## Section 02.3 — List users (GET /users)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-020 | Admin | GET /users returns paginated list with defaults | P0 | 1. Login as Admin 2. `GET /api/v1/users` | HTTP 200; body contains `data` (array), `total` (int), `page === 1`, `limit === 25`, `totalPages` (int); each user object has `id`, `email`, `name`, `role`, `is_active`, `created_at` | API | |
| TC-USER-021 | Admin | GET /users with ?page=2&limit=2 returns correct page | P1 | 1. Ensure at least 3 users exist 2. `GET /api/v1/users?page=2&limit=2` | HTTP 200; `data.length <= 2`; `page === 2`; `limit === 2`; different users than page 1 | API | |
| TC-USER-022 | Admin | GET /users with ?role=Supervisor filters correctly | P1 | 1. `GET /api/v1/users?role=Supervisor` | HTTP 200; every item in `data` has `role === "Supervisor"`; no Admin or Warehouse Operator rows | API | userListQuerySchema role enum |
| TC-USER-023 | Admin | GET /users with ?search=warehouse searches name and email | P1 | 1. Ensure user with name "Test Warehouse" and email "warehouse@binny.com" exists 2. `GET /api/v1/users?search=warehouse` | HTTP 200; result includes the warehouse user; search is case-insensitive ILIKE | API | user.service ILIKE name OR email |
| TC-USER-024 | Admin | GET /users with ?is_active=false returns only inactive users | P1 | 1. Deactivate a user 2. `GET /api/v1/users?is_active=false` | HTTP 200; all returned users have `is_active === false` | API | |
| TC-USER-025 | Admin | GET /users list does NOT include password_hash | P0 | 1. `GET /api/v1/users` 2. Inspect each object in `data` | No object in `data` array contains field `password_hash`; security assertion | API | USER_SELECT projection |
| TC-USER-026 | Supervisor | Supervisor CAN GET /users list (read-only) | P0 | 1. Login as Supervisor 2. `GET /api/v1/users` with `supervisor_token` | HTTP 200; list returned | API | authorize(ADMIN, SUPERVISOR) |
| TC-USER-027 | Warehouse Operator | Warehouse Operator cannot GET /users | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/users` with `warehouse_token` | HTTP 403 | API | |

---

## Section 02.4 — Get user by ID (GET /users/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-030 | Admin | GET /users/:id returns correct user | P0 | 1. Login as Admin 2. Create or note a user ID 3. `GET /api/v1/users/<uuid>` | HTTP 200; `data.id === <uuid>`; `data` contains `email`, `name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at` | API | |
| TC-USER-031 | Admin | GET /users/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/users/00000000-0000-0000-0000-000000000000` | HTTP 404; body contains "User not found" | API | user.service NotFoundError |
| TC-USER-032 | Admin | GET /users/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/users/not-a-uuid` | HTTP 400; Zod validation error "Invalid user ID format" | API | userIdParamSchema uuid() |
| TC-USER-033 | Supervisor | Supervisor CAN GET /users/:id | P1 | 1. Login as Supervisor 2. `GET /api/v1/users/<valid_uuid>` | HTTP 200; user record returned | API | authorize(ADMIN, SUPERVISOR) |
| TC-USER-034 | Warehouse Operator | Warehouse Operator cannot GET /users/:id | P1 | 1. Login as Warehouse Operator 2. `GET /api/v1/users/<valid_uuid>` with `warehouse_token` | HTTP 403 | API | |

---

## Section 02.5 — Update user (PUT /users/:id)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-040 | Admin | Admin updates user name | P0 | 1. Login as Admin 2. Create a user, note `id` 3. `PUT /api/v1/users/<id>` body `{"name":"Updated Name"}` 4. `GET /api/v1/users/<id>` | PUT returns HTTP 200; GET returns `name === "Updated Name"`; other fields unchanged | API | |
| TC-USER-041 | Admin | Admin updates user email | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` body `{"email":"updated@binny.com"}` 3. Verify login with new email | PUT HTTP 200; `data.email === "updated@binny.com"`; old email no longer authenticates; new email authenticates | Integration | |
| TC-USER-042 | Admin | Admin changes user role from Warehouse Operator to Supervisor | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<warehouse_user_id>` body `{"role":"Supervisor"}` 3. User logs in and uses their token on a Supervisor-only endpoint | PUT HTTP 200; `data.role === "Supervisor"`; user's new token allows Supervisor actions | Integration | role_id updated via roles lookup |
| TC-USER-043 | Admin | Admin activates a previously deactivated user | P0 | 1. Deactivate user via `PUT /api/v1/users/<id>` body `{"is_active":false}` 2. Verify user cannot log in 3. `PUT /api/v1/users/<id>` body `{"is_active":true}` 4. Login as reactivated user | Step 3 HTTP 200; Step 4 login succeeds | Integration | |
| TC-USER-044 | Admin | Admin deactivates a user | P0 | 1. Login as Admin 2. `PUT /api/v1/users/<id>` body `{"is_active":false}` 3. Attempt login as that user | Step 2 HTTP 200; `data.is_active === false`; Step 3 returns HTTP 401 (WHERE is_active=true filter) | Integration | |
| TC-USER-045 | Admin | PUT with duplicate email returns 409 | P0 | 1. Create two users A and B 2. `PUT /api/v1/users/<A_id>` body `{"email":"<B's email>"}` | HTTP 409; body "Email already in use"; user A email unchanged | API | user.service ConflictError |
| TC-USER-046 | Admin | PUT with non-existent user ID returns 404 | P0 | 1. `PUT /api/v1/users/00000000-0000-0000-0000-000000000000` body `{"name":"Ghost"}` | HTTP 404; "User not found" | API | |
| TC-USER-047 | Admin | PUT with invalid role value returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` body `{"role":"Manager"}` (not in enum) | HTTP 400; Zod error for invalid enum value | API | updateUserSchema role enum |
| TC-USER-048 | Admin | PUT with empty body returns current user unchanged | P1 | 1. `PUT /api/v1/users/<valid_id>` body `{}` | HTTP 200; user data returned unchanged; no DB update issued | API | updateUser early-return if fields.length === 0 |
| TC-USER-049 | Admin | Frontend PATCH /users/:id (toggleUserStatus) uses PATCH not PUT | P1 | 1. Login as Admin in browser 2. Open `/users` page 3. Click "Deactivate" on a user 4. Inspect network requests | Browser sends `PATCH /api/v1/users/<id>` with body `{"is_active":false}`; HTTP 200 returned; user status badge changes to "Inactive" | E2E | users/page.tsx line 60 uses api.patch — **discrepancy: route is PUT not PATCH; if server returns 405 this is a bug** |

---

## Section 02.6 — Deactivate / reactivate user

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-050 | Admin | DELETE /users/:id deactivates (soft delete) the user | P0 | 1. Login as Admin 2. Create a test user 3. `DELETE /api/v1/users/<id>` | HTTP 200; body `message === "User deactivated successfully"`; DB: `users.is_active = false` for that user; user not physically removed | API | deleteUser sets is_active=false |
| TC-USER-051 | Admin | DELETE /users/:id — deactivated user cannot log in | P0 | 1. Create a user, note credentials 2. `DELETE /api/v1/users/<id>` 3. `POST /api/v1/auth/login` with that user's credentials | HTTP 401; user cannot authenticate after deactivation | Integration | |
| TC-USER-052 | Admin | DELETE /users/:id for non-existent user returns 404 | P0 | 1. `DELETE /api/v1/users/00000000-0000-0000-0000-000000000000` | HTTP 404; "User not found" | API | |
| TC-USER-053 | Admin | DELETE /users/:id with malformed UUID returns 400 | P1 | 1. `DELETE /api/v1/users/not-a-uuid` | HTTP 400; Zod error "Invalid user ID format" | API | |
| TC-USER-054 | Admin | Admin cannot hard-delete themselves (soft delete only) | P1 | 1. Login as Admin 2. Get own user ID via `GET /api/v1/auth/profile` 3. `DELETE /api/v1/users/<own_id>` | HTTP 200 (or 400 if self-delete guard implemented); if HTTP 200, Admin account is deactivated — but note: no self-delete guard in current user.service; Admin should be warned about this | API | **Note: user.service has no explicit self-delete guard — open question for team** |
| TC-USER-055 | Admin | Deactivated user still appears in GET /users?is_active=false | P1 | 1. Deactivate a user 2. `GET /api/v1/users?is_active=false` | Deactivated user appears in filtered list; `is_active === false` | API | |
| TC-USER-056 | Admin | Reactivate deactivated user via PUT is_active:true | P0 | 1. Deactivate user via DELETE or PUT 2. `PUT /api/v1/users/<id>` body `{"is_active":true}` 3. Login as reactivated user | PUT HTTP 200; login succeeds | Integration | |

---

## Section 02.7 — Validation — create

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-060 | Admin | Missing email returns 400 | P0 | 1. `POST /api/v1/users` body `{"password":"Test@1234","name":"No Email","role":"Supervisor"}` | HTTP 400; Zod error for required `email` | API | |
| TC-USER-061 | Admin | Invalid email format returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"notanemail","password":"Test@1234","name":"Bad Email","role":"Supervisor"}` | HTTP 400; Zod error "Invalid email address" | API | |
| TC-USER-062 | Admin | Missing password returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"np@binny.com","name":"No Pass","role":"Supervisor"}` | HTTP 400; Zod error for required `password` | API | |
| TC-USER-063 | Admin | Password shorter than 8 chars returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"short@binny.com","password":"Ab1234","name":"Short","role":"Supervisor"}` | HTTP 400; Zod error "Password must be at least 8 characters" | API | createUserSchema min 8 |
| TC-USER-064 | Admin | Missing name returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"nn@binny.com","password":"Test@1234","role":"Supervisor"}` | HTTP 400; Zod error for required `name` | API | |
| TC-USER-065 | Admin | Name shorter than 2 chars returns 400 | P1 | 1. `POST /api/v1/users` body `{"email":"n@binny.com","password":"Test@1234","name":"X","role":"Supervisor"}` | HTTP 400; Zod error "Name must be at least 2 characters" | API | |
| TC-USER-066 | Admin | Name longer than 100 chars returns 400 | P1 | 1. `POST /api/v1/users` body with `name` as 101-char string | HTTP 400; Zod error "Name must not exceed 100 characters" | API | |
| TC-USER-067 | Admin | Missing role returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"nr@binny.com","password":"Test@1234","name":"No Role"}` | HTTP 400; Zod error for required `role` | API | |
| TC-USER-068 | Admin | Invalid role value returns 400 | P0 | 1. `POST /api/v1/users` body `{"email":"bad@binny.com","password":"Test@1234","name":"Bad Role","role":"Manager"}` | HTTP 400; Zod enum error listing valid roles | API | |
| TC-USER-069 | Admin | Password exceeding 128 chars returns 400 | P1 | 1. `POST /api/v1/users` body with `password` as 129-char string | HTTP 400; Zod error "Password must not exceed 128 characters" | API | |

---

## Section 02.8 — Validation — update

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-070 | Admin | Update with invalid UUID param returns 400 | P0 | 1. `PUT /api/v1/users/invalid-uuid` body `{"name":"X"}` | HTTP 400; Zod error "Invalid user ID format" | API | userIdParamSchema |
| TC-USER-071 | Admin | Update email to invalid format returns 400 | P0 | 1. `PUT /api/v1/users/<valid_id>` body `{"email":"notanemail"}` | HTTP 400; Zod error "Invalid email address" | API | |
| TC-USER-072 | Admin | Update name to 1-char string returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` body `{"name":"X"}` | HTTP 400; Zod min 2 chars for name | API | |
| TC-USER-073 | Admin | Update is_active with non-boolean returns 400 | P1 | 1. `PUT /api/v1/users/<valid_id>` body `{"is_active":"yes"}` | HTTP 400; Zod type error expecting boolean | API | |
| TC-USER-074 | Admin | Update with valid partial body succeeds (only role) | P0 | 1. Create user as Warehouse Operator 2. `PUT /api/v1/users/<id>` body `{"role":"Supervisor"}` | HTTP 200; only `role` changes; `email`, `name`, `is_active` unchanged | API | |

---

## Section 02.9 — Playwright E2E: Users page

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-USER-E2E-001 | Admin | Users page renders table with correct column headers | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/users` | Page loads; table headers visible: "Name", "Email", "Role", "Status", "Created", "Actions"; search bar present with placeholder "Search users by name or email..." | E2E | users/page.tsx |
| TC-USER-E2E-002 | Admin | "Add User" button visible and opens modal | P0 | 1. Login as Admin 2. Navigate to `/users` 3. Click "Add User" button | Modal opens with title "Add New User"; inputs: "Full Name", "Email", "Password" (type=password), "Role" (select); default role is "Warehouse Operator"; Cancel and "Create User" buttons visible | E2E | |
| TC-USER-E2E-003 | Admin | Create User modal — all four role options available in select | P1 | 1. Open "Add User" modal 2. Click Role select dropdown | Options: "Warehouse Operator", "Dispatch Operator", "Supervisor", "Admin" | E2E | |
| TC-USER-E2E-004 | Admin | Admin creates a user via UI — appears in table | P0 | 1. Open "Add User" modal 2. Fill: name="UI Test User", email="uitest@binny.com", password="UITest@123", role="Supervisor" 3. Click "Create User" | Toast "User created successfully"; modal closes; new user row appears in table with correct name, email, blue "Supervisor" badge, green "Active" dot | E2E | |
| TC-USER-E2E-005 | Admin | Role badge colors correct: Admin=red, Supervisor=blue, others=gray | P1 | 1. Navigate to `/users` with multiple role users present | Admin rows show red badge; Supervisor rows show blue badge; Warehouse Operator and Dispatch Operator show gray badge | E2E | Badge variant in users/page.tsx |
| TC-USER-E2E-006 | Admin | Search bar filters table results | P0 | 1. Navigate to `/users` 2. Type "warehouse" in search input | Table rows update to show only users matching "warehouse" in name or email; other users hidden; search is debounced | E2E | |
| TC-USER-E2E-007 | Admin | "Deactivate" button on active user shows UserX icon | P1 | 1. Navigate to `/users` 2. Find an active user row | Row shows "Deactivate" button with UserX icon; on click: API call made, status badge changes to gray "Inactive" | E2E | |
| TC-USER-E2E-008 | Admin | "Activate" button on inactive user shows UserCheck icon | P1 | 1. Ensure an inactive user exists 2. Navigate to `/users` | Inactive user row shows "Activate" button with UserCheck icon; on click: `is_active` toggles to true | E2E | |
| TC-USER-E2E-009 | Non-Admin | Non-Admin sees Access Denied page on /users | P0 | 1. Login as Supervisor 2. Navigate to `http://localhost:3000/users` | Page shows Shield icon, heading "Access Denied", text "Only administrators can manage users."; no user table visible | E2E | users/page.tsx isAdmin guard |
| TC-USER-E2E-010 | Admin | Formatted "Created" timestamp visible in table | P1 | 1. Navigate to `/users` | Each row in "Created" column shows a human-readable formatted date (e.g., "23 Apr 2026, 10:30 AM") via `formatDateTime` helper | E2E | |
| TC-USER-E2E-011 | Admin | Empty search shows all users | P1 | 1. Type text in search, observe filter 2. Clear the search field | All users reappear; `GET /api/v1/users` called without `search` query param | E2E | |
