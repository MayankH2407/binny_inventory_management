# Phase 03 — Section Management

**Module code:** `SEC`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Refreshed:** 2026-06-09

> **UI-surface finding:** There is **no standalone `/sections` page** in the frontend route tree.
> The glob `frontend/src/app/**/sections*` returns no results.
> Sections surface entirely inside `frontend/src/app/(dashboard)/products/page.tsx`:
> — Active sections are fetched via `productService.getSections()` (`GET /api/v1/sections`)
>   and rendered as filter **tabs** ("All" + one per section) above the products table.
> — The section **dropdown** inside the Create/Edit Product modal is also driven by the same
>   API call.
> — There is **no Admin-only section management UI** (no create/rename/delete controls in the
>   browser app). All section writes are API-only or exercised via the products page indirectly.
> UI test cases are therefore scoped to the Products page surface, not a dedicated sections page.

> **Key facts from code:**
> - `POST /sections`, `PUT /sections/:id`, `DELETE /sections/:id` are gated by
>   `authorizePermission('sections:create'|'sections:update'|'sections:delete')`.
> - `GET /sections` and `GET /sections/:id` require only `authenticate` — no permission gate.
>   **All four seeded roles hold no `sections:*` permission** (confirmed: `001_roles.ts`).
>   Admin bypasses via super-admin path in `authorizePermission`; non-Admin roles have no
>   `sections:create/update/delete` in their `role_permissions` rows → write → **403**.
> - **Matrix discrepancy noted in MASTER_TEST_PLAN.md** says `sections:*` = Admin-only.
>   The PERMISSION_CATALOG (`permissions.ts`) lists four `sections` actions
>   (create/read/update/delete). No seeded non-Admin role holds any of them.
>   **However:** the routes for `GET /sections` and `GET /sections/:id` carry **no**
>   `authorizePermission` call at all — only the `authenticate` middleware from `router.use`.
>   So "sections:read" exists in the catalog but is **not enforced** on the GET routes.
>   This means all four roles + any token can read sections; write = Admin bypass only.
>   This is consistent with MASTER_TEST_PLAN.md note 2 ("Several GET endpoints are auth-only").
>   TCs encode the **actual behavior** (GET = 200 for all; writes = 403 for non-Admin).
> - Section name uniqueness is case-insensitive (`LOWER(name)` in `createSection` +
>   `updateSection`).
> - `DELETE` is a soft delete: sets `is_active = false`; no referential guard — a section
>   with products linked can still be deactivated (see TC-SEC-035 discrepancy note).
> - `GET /sections` accepts `?include_inactive=true`; this param is checked in controller,
>   not validated by Zod schema.
> - `PUT /sections/:id` with empty body `{}` returns the unchanged section (early-return path
>   when `fields.length === 0`).
> - `updateSection` skips the duplicate-name check when `input.name` matches the section's
>   own current name (case-insensitive compare), preventing a false-409 on self-rename.

---

## Table of Contents

- [Section 03.1 — Create section (POST /sections)](#section-031--create-section)
- [Section 03.2 — List sections (GET /sections)](#section-032--list-sections)
- [Section 03.3 — Get section by ID (GET /sections/:id)](#section-033--get-section-by-id)
- [Section 03.4 — Update section (PUT /sections/:id)](#section-034--update-section)
- [Section 03.5 — Delete section (DELETE /sections/:id)](#section-035--delete-section)
- [Section 03.6 — Name uniqueness and conflict handling](#section-036--name-uniqueness-and-conflict-handling)
- [Section 03.7 — RBAC: write-deny per non-Admin role (POST)](#section-037--rbac-write-deny-per-non-admin-role-post)
- [Section 03.8 — RBAC: write-deny per non-Admin role (PUT)](#section-038--rbac-write-deny-per-non-admin-role-put)
- [Section 03.9 — RBAC: write-deny per non-Admin role (DELETE)](#section-039--rbac-write-deny-per-non-admin-role-delete)
- [Section 03.10 — RBAC: read-allow all roles (GET)](#section-0310--rbac-read-allow-all-roles-get)
- [Section 03.11 — Unauthenticated access (all verbs)](#section-0311--unauthenticated-access-all-verbs)
- [Section 03.12 — Validation](#section-0312--validation)
- [Section 03.13 — Referential integrity (section in use by products)](#section-0313--referential-integrity-section-in-use-by-products)
- [Section 03.14 — Audit log](#section-0314--audit-log)
- [Section 03.15 — UI: Products page section tabs (E2E)](#section-0315--ui-products-page-section-tabs-e2e)

---

## Section 03.1 — Create section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-001 | Admin | Admin creates section with name only | P0 | 1. Login as Admin. 2. `POST /api/v1/sections` body `{"name":"Hawaii"}`. | HTTP 201; response body `data.id` is a UUID string, `data.name === "Hawaii"`, `data.is_active === true`, `data.display_order === 0`, `data.created_at` and `data.updated_at` present. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-002. `display_order` defaults to 0 when omitted (`input.display_order ?? 0`). |
| TC-SEC-002 | Admin | Admin creates section with name and display_order | P0 | 1. Login as Admin. 2. `POST /api/v1/sections` body `{"name":"PU Section","display_order":2}`. | HTTP 201; `data.display_order === 2`; section appears in active list ordered by display_order ASC. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-002. |
| TC-SEC-003 | Admin | Created section appears in GET /sections list | P0 | 1. `POST /api/v1/sections` body `{"name":"Canvas"}`. 2. `GET /api/v1/sections`. | HTTP 200; returned array includes the new section with matching `id` and `name` and `is_active === true`. | Integration | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-001 + TC-SECT-002 sequential. |

---

## Section 03.2 — List sections

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-010 | Admin | GET /sections returns only active sections by default | P0 | 1. Ensure at least one active and one inactive (`is_active=false`) section exist. 2. `GET /api/v1/sections` (no query param). | HTTP 200; `data` array contains only sections with `is_active === true`; the deactivated section is absent. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-007 (post-delete verification). Service uses `WHERE is_active = true` when `includeInactive` is falsy. |
| TC-SEC-011 | Admin | GET /sections?include_inactive=true returns all sections | P0 | 1. Ensure a deactivated section exists. 2. `GET /api/v1/sections?include_inactive=true`. | HTTP 200; `data` includes both active and inactive sections; deactivated section present with `is_active === false`. | API | AUTOMATION GAP — `14-sections-crud.spec.ts` does not cover `include_inactive=true`. Controller checks `req.query.include_inactive === 'true'`; Zod schema does not validate this param. |
| TC-SEC-012 | Admin | GET /sections is ordered by display_order ASC then name ASC | P1 | 1. Create sections: `{"name":"ZZZ","display_order":0}`, `{"name":"AAA","display_order":1}`, `{"name":"MMM","display_order":0}`. 2. `GET /api/v1/sections`. | Result order among the three: MMM (order=0, M < Z), ZZZ (order=0, Z), AAA (order=1). | API | AUTOMATION GAP — ordering assertion not in existing specs. SQL: `ORDER BY display_order ASC, name ASC`. |
| TC-SEC-013 | Admin | GET /sections returns empty array when no active sections exist | P1 | 1. Deactivate all sections (test env only). 2. `GET /api/v1/sections`. | HTTP 200; `data === []`; no error thrown. | API | Edge case. AUTOMATION GAP. |
| TC-SEC-014 | Admin | Response envelope has success:true and data array | P0 | 1. `GET /api/v1/sections` as Admin. | HTTP 200; body `{ success: true, data: [...] }`; each item has `id`, `name`, `display_order`, `is_active`, `created_at`, `updated_at`. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-001 (field assertions). |

---

## Section 03.3 — Get section by ID

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-020 | Admin | GET /sections/:id returns correct section | P0 | 1. Login as Admin. 2. Create section, note `id`. 3. `GET /api/v1/sections/<id>`. | HTTP 200; `data.id` matches, `data.name` matches, `data.created_at` and `data.updated_at` present. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-004. |
| TC-SEC-021 | Admin | GET /sections/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/sections/00000000-0000-0000-0000-000000000000`. | HTTP 404; body `{ success: false, message: "Section not found" }`. | API | Service throws `NotFoundError('Section not found')`. |
| TC-SEC-022 | Admin | GET /sections/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/sections/not-a-uuid`. | HTTP 400; Zod error `"Invalid section ID format"`. | API | `sectionIdParamSchema`: `z.string().uuid('Invalid section ID format')`. |
| TC-SEC-023 | Admin | GET /sections/:id returns inactive section | P1 | 1. Soft-delete a section. 2. `GET /api/v1/sections/<id>`. | HTTP 200; section returned with `is_active === false`. `getSectionById` queries `WHERE id = $1` only — no `is_active` filter. | API | AUTOMATION GAP — not covered in existing specs. |

---

## Section 03.4 — Update section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-030 | Admin | Admin updates section name | P0 | 1. Login as Admin. 2. Create section "Old Name". 3. `PUT /api/v1/sections/<id>` body `{"name":"New Name"}`. 4. `GET /api/v1/sections/<id>`. | PUT HTTP 200; GET returns `name === "New Name"`; `updated_at` is newer than `created_at`. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-005; `17-products-sections-rbac.spec.ts` TC-SECT-ADM-003. |
| TC-SEC-031 | Admin | Admin updates display_order | P1 | 1. `PUT /api/v1/sections/<id>` body `{"display_order":5}`. 2. `GET /api/v1/sections/<id>`. | HTTP 200; `data.display_order === 5`. | API | AUTOMATION GAP — display_order update not explicitly asserted in existing specs. |
| TC-SEC-032 | Admin | Admin sets is_active=false via PUT | P0 | 1. `PUT /api/v1/sections/<id>` body `{"is_active":false}`. 2. `GET /api/v1/sections` (no params). | PUT HTTP 200; section no longer in default active list; appears in `?include_inactive=true` list. | API | AUTOMATION GAP — `is_active` toggle not tested in existing specs. |
| TC-SEC-033 | Admin | Admin re-enables section via PUT is_active:true | P0 | 1. Deactivate a section via `PUT is_active:false`. 2. `PUT /api/v1/sections/<id>` body `{"is_active":true}`. 3. `GET /api/v1/sections`. | PUT HTTP 200; section reappears in default active list. | API | AUTOMATION GAP. |
| TC-SEC-034 | Admin | PUT with empty body returns unchanged section | P1 | 1. `PUT /api/v1/sections/<id>` body `{}`. | HTTP 200; response body matches the section's prior state exactly; no DB update performed (`fields.length === 0` early-return path). | API | AUTOMATION GAP. Zod `updateSectionSchema` is fully optional; all fields undefined → early return. |
| TC-SEC-035 | Admin | PUT non-existent section returns 404 | P0 | 1. `PUT /api/v1/sections/00000000-0000-0000-0000-000000000000` body `{"name":"Ghost"}`. | HTTP 404; `{ success: false, message: "Section not found" }`. | API | AUTOMATION GAP. |
| TC-SEC-036 | Admin | PUT with malformed UUID returns 400 | P1 | 1. `PUT /api/v1/sections/bad-uuid` body `{"name":"X"}`. | HTTP 400; Zod error `"Invalid section ID format"`. | API | AUTOMATION GAP. |

---

## Section 03.5 — Delete section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-040 | Admin | Admin soft-deletes section | P0 | 1. Login as Admin. 2. Create section "To Delete". 3. `DELETE /api/v1/sections/<id>`. 4. `GET /api/v1/sections`. | DELETE HTTP 200; message `"Section deactivated successfully"`; section absent from default GET; `GET /sections/<id>` returns section with `is_active === false`. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-007; `17-products-sections-rbac.spec.ts` TC-SECT-ADM-004. |
| TC-SEC-041 | Admin | Deleted section still retrievable by ID | P1 | 1. Soft-delete section. 2. `GET /api/v1/sections/<id>`. | HTTP 200; `data.is_active === false`. `getSectionById` does not filter by `is_active`. | API | AUTOMATION GAP — existing TC-SECT-007 verifies list exclusion but not direct ID retrieval. |
| TC-SEC-042 | Admin | Delete non-existent section returns 404 | P0 | 1. `DELETE /api/v1/sections/00000000-0000-0000-0000-000000000000`. | HTTP 404; `{ success: false, message: "Section not found" }`. | API | AUTOMATION GAP. |
| TC-SEC-043 | Admin | Delete with malformed UUID returns 400 | P1 | 1. `DELETE /api/v1/sections/not-a-uuid`. | HTTP 400; Zod error `"Invalid section ID format"`. | API | AUTOMATION GAP. |
| TC-SEC-044 | Admin | Deleting already-inactive section succeeds | P1 | 1. `DELETE /api/v1/sections/<id>` on a section already inactive. | HTTP 200; `"Section deactivated successfully"`. Service does `UPDATE ... SET is_active = false` unconditionally after existence check; idempotent. | API | AUTOMATION GAP. No guard against double-delete. |

---

## Section 03.6 — Name uniqueness and conflict handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-050 | Admin | Duplicate section name (exact case) returns 409 | P0 | 1. Create section `{"name":"Hawaii"}`. 2. `POST /api/v1/sections` body `{"name":"Hawaii"}`. | HTTP 409; body `{ success: false, message: "Section with name \"Hawaii\" already exists" }`; second section not created. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-003; `17-products-sections-rbac.spec.ts` TC-SECT-ADM-002. Service uses `ConflictError`. |
| TC-SEC-051 | Admin | Duplicate section name (different case) returns 409 | P0 | 1. Create section `{"name":"Hawaii"}`. 2. `POST /api/v1/sections` body `{"name":"HAWAII"}`. | HTTP 409; case-insensitive duplicate detected via `LOWER(name) = LOWER($1)`. | API | AUTOMATION GAP — case-insensitivity not asserted in existing specs. |
| TC-SEC-052 | Admin | Updating section to existing name returns 409 | P0 | 1. Create sections "Gents" and "Ladies". 2. `PUT /api/v1/sections/<Ladies_id>` body `{"name":"Gents"}`. | HTTP 409; `"Section with name \"Gents\" already exists"`; Ladies section unchanged. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-006. Service excludes own ID: `AND id != $2`. |
| TC-SEC-053 | Admin | Updating section to its own current name (exact) succeeds | P1 | 1. Create section "Sports". 2. `PUT /api/v1/sections/<id>` body `{"name":"Sports"}`. | HTTP 200; no 409. `updateSection` checks `input.name.toLowerCase() !== oldSection.name.toLowerCase()` before running duplicate query; same-value update skips the conflict check. | API | AUTOMATION GAP. |
| TC-SEC-054 | Admin | Updating section to its own name with different casing succeeds | P1 | 1. Create section "Sports". 2. `PUT /api/v1/sections/<id>` body `{"name":"sports"}`. | HTTP 200; name stored as "sports"; no 409 (excluded by `AND id != $2` clause). | API | AUTOMATION GAP. |
| TC-SEC-055 | Admin | Duplicate check includes inactive sections | P1 | 1. Create section "Hawaii" then soft-delete it. 2. `POST /api/v1/sections` body `{"name":"Hawaii"}`. | HTTP 409; `createSection` queries `product_sections WHERE LOWER(name) = LOWER($1)` without any `is_active` filter — inactive sections block re-creation of same name. | API | AUTOMATION GAP. Behavior may be intentional (name reserved after deactivation). |

---

## Section 03.7 — RBAC: write-deny per non-Admin role (POST)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-060 | Supervisor | Supervisor POST /sections — 403 | P0 | 1. Login as Supervisor. 2. `POST /api/v1/sections` body `{"name":"SupSection"}` with supervisor token. | HTTP 403; no section created. Supervisor holds no `sections:create` permission in `role_permissions`. | API | Realizing spec: `17-products-sections-rbac.spec.ts` TC-SECT-SUP-002. |
| TC-SEC-061 | Warehouse Operator | Warehouse Operator POST /sections — 403 | P0 | 1. Login as Warehouse Operator. 2. `POST /api/v1/sections` body `{"name":"WHSection"}` with warehouse token. | HTTP 403; no section created. | API | AUTOMATION GAP — Warehouse Operator write-deny not explicitly tested in existing specs. |
| TC-SEC-062 | Dispatch Operator | Dispatch Operator POST /sections — 403 | P0 | 1. Login as Dispatch Operator. 2. `POST /api/v1/sections` body `{"name":"DPSection"}` with dispatch token. | HTTP 403; no section created. | API | AUTOMATION GAP — Dispatch Operator write-deny not explicitly tested in existing specs. |

---

## Section 03.8 — RBAC: write-deny per non-Admin role (PUT)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-070 | Supervisor | Supervisor PUT /sections/:id — 403 | P0 | 1. Login as Supervisor. 2. `PUT /api/v1/sections/<valid_uuid>` body `{"name":"Renamed"}` with supervisor token. | HTTP 403; section unchanged. | API | AUTOMATION GAP — Supervisor PUT not tested in `17-products-sections-rbac.spec.ts` (only POST tested). |
| TC-SEC-071 | Warehouse Operator | Warehouse Operator PUT /sections/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `PUT /api/v1/sections/<valid_uuid>` body `{"name":"X"}` with warehouse token. | HTTP 403. | API | AUTOMATION GAP. |
| TC-SEC-072 | Dispatch Operator | Dispatch Operator PUT /sections/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `PUT /api/v1/sections/<valid_uuid>` body `{"name":"X"}` with dispatch token. | HTTP 403. | API | AUTOMATION GAP. |

---

## Section 03.9 — RBAC: write-deny per non-Admin role (DELETE)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-080 | Supervisor | Supervisor DELETE /sections/:id — 403 | P0 | 1. Login as Supervisor. 2. `DELETE /api/v1/sections/<valid_uuid>` with supervisor token. | HTTP 403; section still active. | API | AUTOMATION GAP — DELETE deny not tested for Supervisor in `17-products-sections-rbac.spec.ts`. |
| TC-SEC-081 | Warehouse Operator | Warehouse Operator DELETE /sections/:id — 403 | P0 | 1. Login as Warehouse Operator. 2. `DELETE /api/v1/sections/<valid_uuid>` with warehouse token. | HTTP 403. | API | AUTOMATION GAP. |
| TC-SEC-082 | Dispatch Operator | Dispatch Operator DELETE /sections/:id — 403 | P0 | 1. Login as Dispatch Operator. 2. `DELETE /api/v1/sections/<valid_uuid>` with dispatch token. | HTTP 403. | API | AUTOMATION GAP. |

---

## Section 03.10 — RBAC: read-allow all roles (GET)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-090 | Admin | Admin GET /sections — 200 | P0 | 1. Login as Admin. 2. `GET /api/v1/sections`. | HTTP 200; sections array returned. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-001. |
| TC-SEC-091 | Supervisor | Supervisor GET /sections — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/sections` with supervisor token. | HTTP 200; sections array returned. No `authorizePermission` on GET. | API | Realizing spec: `17-products-sections-rbac.spec.ts` TC-SECT-SUP-001. |
| TC-SEC-092 | Warehouse Operator | Warehouse Operator GET /sections — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/sections` with warehouse token. | HTTP 200; sections array returned. | API | AUTOMATION GAP — GET allow for Warehouse Operator not explicitly tested in existing specs. |
| TC-SEC-093 | Dispatch Operator | Dispatch Operator GET /sections — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/sections` with dispatch token. | HTTP 200; sections array returned. | API | AUTOMATION GAP — GET allow for Dispatch Operator not explicitly tested in existing specs. |
| TC-SEC-094 | Admin | Admin GET /sections/:id — 200 | P0 | 1. Login as Admin. 2. `GET /api/v1/sections/<valid_uuid>`. | HTTP 200; section object returned. | API | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-004. |
| TC-SEC-095 | Supervisor | Supervisor GET /sections/:id — 200 | P0 | 1. Login as Supervisor. 2. `GET /api/v1/sections/<valid_uuid>` with supervisor token. | HTTP 200; section returned. | API | AUTOMATION GAP. |
| TC-SEC-096 | Warehouse Operator | Warehouse Operator GET /sections/:id — 200 | P0 | 1. Login as Warehouse Operator. 2. `GET /api/v1/sections/<valid_uuid>` with warehouse token. | HTTP 200; section returned. | API | AUTOMATION GAP. |
| TC-SEC-097 | Dispatch Operator | Dispatch Operator GET /sections/:id — 200 | P0 | 1. Login as Dispatch Operator. 2. `GET /api/v1/sections/<valid_uuid>` with dispatch token. | HTTP 200; section returned. | API | AUTOMATION GAP. |

---

## Section 03.11 — Unauthenticated access (all verbs)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-100 | Unauthenticated | No token — GET /sections returns 401 | P0 | 1. `GET /api/v1/sections` with no `Authorization` header. | HTTP 401; `{ success: false, message: "Authentication token is required" }` (or equivalent from `authenticate` middleware). | API | `router.use(authenticate)` applied globally to all section routes. |
| TC-SEC-101 | Unauthenticated | No token — GET /sections/:id returns 401 | P0 | 1. `GET /api/v1/sections/<valid_uuid>` with no token. | HTTP 401. | API | AUTOMATION GAP. |
| TC-SEC-102 | Unauthenticated | No token — POST /sections returns 401 | P0 | 1. `POST /api/v1/sections` body `{"name":"NoAuth"}` with no token. | HTTP 401; no section created. | API | AUTOMATION GAP. |
| TC-SEC-103 | Unauthenticated | No token — PUT /sections/:id returns 401 | P0 | 1. `PUT /api/v1/sections/<valid_uuid>` body `{"name":"X"}` with no token. | HTTP 401. | API | AUTOMATION GAP. |
| TC-SEC-104 | Unauthenticated | No token — DELETE /sections/:id returns 401 | P0 | 1. `DELETE /api/v1/sections/<valid_uuid>` with no token. | HTTP 401. | API | AUTOMATION GAP. |
| TC-SEC-105 | Unauthenticated | Expired token — POST /sections returns 401 | P1 | 1. Use a well-formed but expired JWT. 2. `POST /api/v1/sections` body `{"name":"Expired"}`. | HTTP 401; token validation failure. | API | AUTOMATION GAP. |

---

## Section 03.12 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-110 | Admin | Missing name returns 400 | P0 | 1. `POST /api/v1/sections` body `{}`. | HTTP 400; Zod error `"Section name is required"` (min(1) on required field). | API | `createSectionSchema`: `name.min(1, 'Section name is required')`. |
| TC-SEC-111 | Admin | Empty string name returns 400 | P0 | 1. `POST /api/v1/sections` body `{"name":""}`. | HTTP 400; Zod min(1) error; no section created. | API | `.trim()` + `min(1)` — empty after trim still fails. |
| TC-SEC-112 | Admin | Name of exactly 100 chars is valid | P1 | 1. `POST /api/v1/sections` body `{"name":"<100-char-string>"}`. | HTTP 201; section created. | API | Schema: `max(100)` — boundary value at 100 chars should succeed. |
| TC-SEC-113 | Admin | Name exceeding 100 chars returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"<101-char-string>"}`. | HTTP 400; Zod error `"Section name must not exceed 100 characters"`. | API | AUTOMATION GAP. |
| TC-SEC-114 | Admin | Non-integer display_order returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"Valid","display_order":1.5}`. | HTTP 400; Zod integer constraint error. | API | `z.number().int()`. AUTOMATION GAP. |
| TC-SEC-115 | Admin | Negative display_order returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"Valid","display_order":-1}`. | HTTP 400; Zod min(0) error. | API | `z.number().int().min(0)`. AUTOMATION GAP. |
| TC-SEC-116 | Admin | display_order of 0 is valid | P1 | 1. `POST /api/v1/sections` body `{"name":"Zero Order","display_order":0}`. | HTTP 201; section created with `display_order === 0`. | API | Boundary: `min(0)` allows 0. AUTOMATION GAP. |
| TC-SEC-117 | Admin | Name with leading/trailing spaces is trimmed | P1 | 1. `POST /api/v1/sections` body `{"name":"  Hawaii  "}`. | HTTP 201; `data.name === "Hawaii"` (Zod `.trim()` applied). If a section named "Hawaii" already exists, HTTP 409 (trimmed value collides). | API | AUTOMATION GAP. |
| TC-SEC-118 | Admin | PUT with invalid display_order returns 400 | P1 | 1. `PUT /api/v1/sections/<id>` body `{"display_order":"abc"}`. | HTTP 400; Zod type error. | API | `updateSectionSchema` uses same `z.number().int().min(0).optional()`. AUTOMATION GAP. |
| TC-SEC-119 | Admin | PUT with name exceeding 100 chars returns 400 | P1 | 1. `PUT /api/v1/sections/<id>` body `{"name":"<101-char-string>"}`. | HTTP 400; Zod `max(100)` error. | API | AUTOMATION GAP. |

---

## Section 03.13 — Referential integrity (section in use by products)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-130 | Admin | Deleting section with linked products — current behavior | P1 | 1. Create a section "TestRef". 2. Create a product linked to "TestRef". 3. `DELETE /api/v1/sections/<section_id>`. 4. Query product in DB or `GET /products`. | HTTP 200; section is soft-deleted; product still exists with `section === "TestRef"` pointing to the now-inactive section. The product is not deleted or modified. | Integration | **Discrepancy:** MASTER_TEST_PLAN.md references "deletion guard (can't delete a section in use)" as a README-scope note. `section.service.ts` `deleteSection` has **no referential guard** — it only checks existence, then sets `is_active = false`. There is no FK check against products. Encode as current behavior, not a bug fix. AUTOMATION GAP — not covered in existing specs. |
| TC-SEC-131 | Admin | Products page still shows section name after section soft-deleted | P1 | 1. Soft-delete a section that has products. 2. Navigate to `/products`. 3. Observe the product list. | Products that referenced the deleted section still display the section name (stored as a string field on the product row, not a FK join). The section tab for that name disappears from the filter row. | E2E | AUTOMATION GAP. UI behavior depends on how product records store section (string vs UUID). |

---

## Section 03.14 — Audit log

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-140 | Admin | Audit log created on POST /sections | P1 | 1. Create section "AuditCreate". 2. Query DB: `SELECT * FROM audit_logs WHERE entity_type = 'product_section' AND action = 'CREATE_SECTION' ORDER BY created_at DESC LIMIT 1`. | Row exists with `entity_id` matching new section UUID, `user_id` matching Admin's UUID, `new_values` containing the input. | Integration | `createAuditLog` called in `createSection`. AUTOMATION GAP. |
| TC-SEC-141 | Admin | Audit log created on PUT /sections/:id | P1 | 1. Update a section. 2. Query audit_logs. | Row with `action === 'UPDATE_SECTION'`, correct `entity_id`, `user_id`, `old_values` and `new_values`. | Integration | AUTOMATION GAP. |
| TC-SEC-142 | Admin | Audit log created on DELETE /sections/:id | P1 | 1. Soft-delete a section. 2. Query audit_logs. | Row with `action === 'DELETE_SECTION'`, correct `entity_id`, `user_id`; `new_values` is null (not passed to `createAuditLog` in `deleteSection`). | Integration | AUTOMATION GAP. |

---

## Section 03.15 — UI: Products page section tabs (E2E)

> No standalone `/sections` page exists. Section management UI is embedded exclusively in
> the `/products` page — active sections appear as filter tabs and in the Create/Edit Product
> modal dropdown. There are no Admin-only section management controls (create/edit/delete)
> in the current browser UI. All write operations must be performed via direct API calls.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-E2E-001 | Admin | Section tabs appear on Products page | P0 | 1. Login as Admin. 2. Navigate to `/products`. 3. Wait for `networkidle`. | "All" button visible. Each active section from `GET /sections` is rendered as a clickable tab/button. At minimum the first active section tab is present. | E2E | Realizing spec: `14-sections-crud.spec.ts` TC-SECT-008. Selector: `getByRole('button', { name: sectionName })`. |
| TC-SEC-E2E-002 | Admin | Clicking a section tab filters the product list | P1 | 1. Login as Admin. 2. Navigate to `/products`. 3. Click a specific section tab (not "All"). | Product table renders only products belonging to that section; the selected tab is highlighted. Products from other sections are absent. | E2E | AUTOMATION GAP — not covered in existing specs. |
| TC-SEC-E2E-003 | Admin | "All" tab shows products from all sections | P1 | 1. Login as Admin. 2. Navigate to `/products`. 3. Confirm "All" tab is active/selected by default. | Product table shows products across all sections; count matches total active products. | E2E | AUTOMATION GAP. |
| TC-SEC-E2E-004 | Admin | Deactivated section no longer appears as tab | P1 | 1. Soft-delete a section via API. 2. Reload `/products` page. | The deactivated section's tab is absent; remaining active sections still present. | E2E | AUTOMATION GAP. |
| TC-SEC-E2E-005 | Admin | Section dropdown populated in Create Product modal | P0 | 1. Login as Admin. 2. Navigate to `/products`. 3. Click "Add Product" button. 4. Open the Section select field. | Section dropdown options match the active sections from `GET /sections`; fallback options (Hawaii/PU/EVA) shown only when API returns empty. | E2E | Realizing spec: `17-products-sections-rbac.spec.ts` TC-PROD-E2E-003 (checks modal fields). AUTOMATION GAP on dropdown contents specifically. |
| TC-SEC-E2E-006 | Admin | Section and Category required in Create Product form | P1 | 1. Login as Admin. 2. Click "Add Product". 3. Fill all fields except Section. 4. Submit. | Toast error "Section and Category are required fields"; no API call made. | E2E | Client-side guard: `if (!form.section.trim() \|\| !form.category.trim())`. AUTOMATION GAP. |
| TC-SEC-E2E-007 | Supervisor | Section tabs visible but no section management controls | P1 | 1. Login as Supervisor. 2. Navigate to `/products`. | Section tabs render and are usable for filtering. No admin-only section create/edit/delete controls exist in the UI for any role (there is no section management UI at all, so this is always true). | E2E | AUTOMATION GAP. Realizing spec: `17-products-sections-rbac.spec.ts` TC-SECT-SUP-001 (API-level only). |
| TC-SEC-E2E-008 | Warehouse Operator | Warehouse Operator sees section tabs on Products page | P1 | 1. Login as Warehouse Operator. 2. Navigate to `/products`. | Section filter tabs visible. Products page loads. | E2E | AUTOMATION GAP — Warehouse Operator browser access not tested in existing specs. |
| TC-SEC-E2E-009 | Dispatch Operator | Dispatch Operator sees section tabs on Products page | P1 | 1. Login as Dispatch Operator. 2. Navigate to `/products`. | Section filter tabs visible. Products page loads. | E2E | AUTOMATION GAP — Dispatch Operator browser access not tested in existing specs. |
