# Phase 03 — Section Management

**Module code:** `SEC`
**API base:** `http://localhost:5000/api/v1`
**Frontend base:** `http://localhost:3000`
**Authored:** 2026-04-30

> **Key facts from code:**
> - `POST /`, `PUT /:id`, `DELETE /:id` require `authorize(ADMIN)`.
> - `GET /` and `GET /:id` require only `authenticate` (all roles).
> - Section name uniqueness is case-insensitive (`LOWER(name)`).
> - `DELETE` is a soft delete: sets `is_active = false`.
> - `GET /` accepts `?include_inactive=true` (query param checked in controller, NOT in Zod schema — the schema does not validate this param).
> - No explicit deletion guard in `section.service.ts` — there is no check for products referencing the section before deactivation. This is a discrepancy vs. the README scope note ("deletion guard — can't delete a section in use").

---

## Table of Contents

- [Section 03.1 — Create section (POST /sections)](#section-031--create-section)
- [Section 03.2 — List sections (GET /sections)](#section-032--list-sections)
- [Section 03.3 — Get section by ID (GET /sections/:id)](#section-033--get-section-by-id)
- [Section 03.4 — Update section (PUT /sections/:id)](#section-034--update-section)
- [Section 03.5 — Delete section (DELETE /sections/:id)](#section-035--delete-section)
- [Section 03.6 — Name uniqueness and conflict handling](#section-036--name-uniqueness-and-conflict-handling)
- [Section 03.7 — Role access matrix](#section-037--role-access-matrix)
- [Section 03.8 — Validation](#section-038--validation)
- [Section 03.9 — Playwright E2E](#section-039--playwright-e2e)

---

## Section 03.1 — Create section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-001 | Admin | Admin creates section with name only | P0 | 1. Login as Admin 2. `POST /api/v1/sections` body `{"name":"Hawaii"}` | HTTP 201; body `data.id` (UUID), `data.name === "Hawaii"`, `data.is_active === true`, `data.display_order === 0`, `data.created_at`, `data.updated_at` | API | createSectionSchema: name required, display_order optional |
| TC-SEC-002 | Admin | Admin creates section with name and display_order | P0 | 1. Login as Admin 2. `POST /api/v1/sections` body `{"name":"PU Section","display_order":2}` | HTTP 201; `data.display_order === 2`; section appears in list sorted by display_order then name | API | |
| TC-SEC-003 | Admin | Section appears in GET /sections list after creation | P0 | 1. Create section "Canvas" 2. `GET /api/v1/sections` | HTTP 200; returned array includes the new section with matching `id` and `name` | Integration | |
| TC-SEC-004 | Admin | Audit log entry created on section create | P1 | 1. Create section "Fabrication" 2. Query DB: `SELECT * FROM audit_logs WHERE entity_type = 'product_section' AND action = 'CREATE_SECTION' ORDER BY created_at DESC LIMIT 1` | Audit log row exists with correct `entity_id`, `user_id` matching Admin's UUID, `action === "CREATE_SECTION"` | Integration | createAuditLog called in service |

---

## Section 03.2 — List sections

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-010 | Admin | GET /sections returns only active sections by default | P0 | 1. Ensure at least one active and one inactive (`is_active=false`) section exists 2. `GET /api/v1/sections` | HTTP 200; `data` array contains only sections with `is_active === true`; deactivated section absent | API | getSections(false) default |
| TC-SEC-011 | Admin | GET /sections?include_inactive=true returns all sections | P0 | 1. Ensure a deactivated section exists 2. `GET /api/v1/sections?include_inactive=true` | HTTP 200; `data` includes both active and inactive sections; deactivated section present with `is_active === false` | API | controller checks `include_inactive === 'true'` |
| TC-SEC-012 | Admin | GET /sections is ordered by display_order ASC then name ASC | P1 | 1. Create sections: `{"name":"ZZZ","display_order":0}`, `{"name":"AAA","display_order":1}`, `{"name":"MMM","display_order":0}` 2. `GET /api/v1/sections` | Result order: ZZZ (0, Z), MMM (0, M) swap — actually AAA comes before ZZZ alphabetically; so order is: display_order 0 ASC → within same order, name ASC: "MMM" before "ZZZ"; then display_order 1: "AAA" | API | ORDER BY display_order ASC, name ASC |
| TC-SEC-013 | Any | GET /sections works for any authenticated role | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/sections` with `dispatch_token` | HTTP 200; sections list returned | API | No authorize() on GET / |
| TC-SEC-014 | Any | GET /sections returns empty array when no active sections exist | P1 | 1. Deactivate all sections (test env only) 2. `GET /api/v1/sections` | HTTP 200; `data === []` (empty array); no error | API | |

---

## Section 03.3 — Get section by ID

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-015 | Admin | GET /sections/:id returns correct section | P0 | 1. Login as Admin 2. Create section, note `id` 3. `GET /api/v1/sections/<id>` | HTTP 200; `data.id` matches, `data.name` matches; all fields present | API | |
| TC-SEC-016 | Admin | GET /sections/:id for non-existent UUID returns 404 | P0 | 1. `GET /api/v1/sections/00000000-0000-0000-0000-000000000000` | HTTP 404; body "Section not found" | API | NotFoundError |
| TC-SEC-017 | Admin | GET /sections/:id with malformed UUID returns 400 | P1 | 1. `GET /api/v1/sections/not-a-uuid` | HTTP 400; Zod error "Invalid section ID format" | API | sectionIdParamSchema |
| TC-SEC-018 | Any | GET /sections/:id works for Warehouse Operator | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/sections/<valid_uuid>` | HTTP 200; section returned | API | |

---

## Section 03.4 — Update section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-020 | Admin | Admin updates section name | P0 | 1. Login as Admin 2. Create section "Old Name" 3. `PUT /api/v1/sections/<id>` body `{"name":"New Name"}` 4. `GET /api/v1/sections/<id>` | PUT HTTP 200; GET returns `name === "New Name"`; `updated_at` is newer than `created_at` | API | |
| TC-SEC-021 | Admin | Admin updates display_order | P1 | 1. `PUT /api/v1/sections/<id>` body `{"display_order":5}` 2. `GET /api/v1/sections/<id>` | HTTP 200; `data.display_order === 5` | API | |
| TC-SEC-022 | Admin | Admin sets is_active=false via PUT | P0 | 1. `PUT /api/v1/sections/<id>` body `{"is_active":false}` 2. `GET /api/v1/sections` (default) | PUT HTTP 200; section no longer in default list; appears in `?include_inactive=true` | API | |
| TC-SEC-023 | Admin | Admin re-enables section via PUT is_active:true | P0 | 1. Deactivate a section 2. `PUT /api/v1/sections/<id>` body `{"is_active":true}` 3. `GET /api/v1/sections` | PUT HTTP 200; section reappears in default active list | API | |
| TC-SEC-024 | Admin | PUT with empty body returns unchanged section | P1 | 1. `PUT /api/v1/sections/<id>` body `{}` | HTTP 200; section returned unchanged; Zod partial allows empty body; updateSection returns oldSection | API | fields.length === 0 early return |
| TC-SEC-025 | Admin | PUT non-existent section returns 404 | P0 | 1. `PUT /api/v1/sections/00000000-0000-0000-0000-000000000000` body `{"name":"Ghost"}` | HTTP 404; "Section not found" | API | |
| TC-SEC-026 | Admin | PUT with malformed UUID returns 400 | P1 | 1. `PUT /api/v1/sections/bad-uuid` body `{"name":"X"}` | HTTP 400; Zod error "Invalid section ID format" | API | |
| TC-SEC-027 | Admin | Audit log entry created on section update | P1 | 1. Update a section 2. Check audit_logs | Row with `action === "UPDATE_SECTION"`, correct `entity_id` and `user_id` | Integration | |

---

## Section 03.5 — Delete section

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-030 | Admin | Admin soft-deletes section | P0 | 1. Login as Admin 2. Create section "To Delete" 3. `DELETE /api/v1/sections/<id>` 4. `GET /api/v1/sections` | DELETE HTTP 200; message "Section deactivated successfully"; section absent from default GET; DB: `is_active = false` | API | deleteSection sets is_active=false |
| TC-SEC-031 | Admin | Deleted section still retrievable via GET /sections/:id | P1 | 1. Delete a section 2. `GET /api/v1/sections/<id>` | HTTP 200; section returned with `is_active === false`; getSectionById does not filter by is_active | API | getSectionById does not filter on is_active |
| TC-SEC-032 | Admin | Delete non-existent section returns 404 | P0 | 1. `DELETE /api/v1/sections/00000000-0000-0000-0000-000000000000` | HTTP 404; "Section not found" | API | |
| TC-SEC-033 | Admin | Delete with malformed UUID returns 400 | P1 | 1. `DELETE /api/v1/sections/not-a-uuid` | HTTP 400; Zod "Invalid section ID format" | API | |
| TC-SEC-034 | Admin | Audit log entry created on section delete | P1 | 1. Delete section 2. Check audit_logs | `action === "DELETE_SECTION"` with correct entity_id | Integration | |
| TC-SEC-035 | Admin | Deleting section with associated products — current behavior | P1 | 1. Create a section 2. Create a product linked to that section 3. `DELETE /api/v1/sections/<section_id>` | HTTP 200; section deactivated; product still exists in DB with `section_id` referencing the now-inactive section — **note: no deletion guard implemented in section.service.ts; section is soft-deleted even if products exist; this may leave orphaned products pointing to inactive sections** | Integration | **Discrepancy:** README scope says "deletion guard (can't delete a section in use by products)" but section.service.deleteSection has no such check. Flag for dev team. |

---

## Section 03.6 — Name uniqueness and conflict handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-040 | Admin | Duplicate section name (exact case) returns 409 | P0 | 1. Create section `{"name":"Hawaii"}` 2. `POST /api/v1/sections` body `{"name":"Hawaii"}` | HTTP 409; body "Section with name \"Hawaii\" already exists"; second section NOT created | API | ConflictError |
| TC-SEC-041 | Admin | Duplicate section name (different case) returns 409 | P0 | 1. Create section `{"name":"Hawaii"}` 2. `POST /api/v1/sections` body `{"name":"HAWAII"}` | HTTP 409; uniqueness check is case-insensitive (LOWER(name) comparison) | API | createSection LOWER() check |
| TC-SEC-042 | Admin | Updating section to duplicate name returns 409 | P0 | 1. Create sections "Gents" and "Ladies" 2. `PUT /api/v1/sections/<Ladies_id>` body `{"name":"Gents"}` | HTTP 409; "Section with name \"Gents\" already exists"; Ladies section unchanged | API | updateSection name conflict check |
| TC-SEC-043 | Admin | Updating section to same name (no change) succeeds | P1 | 1. Create section "Sports" 2. `PUT /api/v1/sections/<id>` body `{"name":"Sports"}` | HTTP 200; no conflict — `name.toLowerCase() !== oldSection.name.toLowerCase()` check prevents false positive; section returned with same name | API | updateSection line: name change check only if name differs |
| TC-SEC-044 | Admin | Updating section to same name different case succeeds | P1 | 1. Create section "Sports" 2. `PUT /api/v1/sections/<id>` body `{"name":"sports"}` | HTTP 200; name updated to "sports" (all lowercase); no 409 because comparing against own ID is excluded | API | nameCheck excludes `id != $2` |

---

## Section 03.7 — Role access matrix

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-050 | Supervisor | Supervisor cannot POST /sections | P0 | 1. Login as Supervisor 2. `POST /api/v1/sections` body `{"name":"Sup Section"}` with `supervisor_token` | HTTP 403; no section created | API | |
| TC-SEC-051 | Supervisor | Supervisor cannot PUT /sections/:id | P0 | 1. Login as Supervisor 2. `PUT /api/v1/sections/<valid_uuid>` with `supervisor_token` body `{"name":"Renamed"}` | HTTP 403; section unchanged | API | |
| TC-SEC-052 | Supervisor | Supervisor cannot DELETE /sections/:id | P0 | 1. Login as Supervisor 2. `DELETE /api/v1/sections/<valid_uuid>` with `supervisor_token` | HTTP 403 | API | |
| TC-SEC-053 | Supervisor | Supervisor CAN GET /sections | P0 | 1. Login as Supervisor 2. `GET /api/v1/sections` with `supervisor_token` | HTTP 200; list returned | API | No authorize() on GET endpoints |
| TC-SEC-054 | Warehouse Operator | Warehouse Operator cannot POST /sections | P0 | 1. Login as Warehouse Operator 2. `POST /api/v1/sections` with `warehouse_token` body `{"name":"WH Section"}` | HTTP 403 | API | |
| TC-SEC-055 | Warehouse Operator | Warehouse Operator CAN GET /sections/:id | P0 | 1. Login as Warehouse Operator 2. `GET /api/v1/sections/<valid_uuid>` with `warehouse_token` | HTTP 200 | API | |
| TC-SEC-056 | Dispatch Operator | Dispatch Operator cannot PUT /sections/:id | P0 | 1. Login as Dispatch Operator 2. `PUT /api/v1/sections/<valid_uuid>` with `dispatch_token` body `{"name":"X"}` | HTTP 403 | API | |
| TC-SEC-057 | Dispatch Operator | Dispatch Operator CAN GET /sections | P0 | 1. Login as Dispatch Operator 2. `GET /api/v1/sections` with `dispatch_token` | HTTP 200; sections returned | API | |

---

## Section 03.8 — Validation

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-060 | Admin | Missing name returns 400 | P0 | 1. `POST /api/v1/sections` body `{}` | HTTP 400; Zod error "Section name is required" | API | name min(1) |
| TC-SEC-061 | Admin | Empty string name returns 400 | P0 | 1. `POST /api/v1/sections` body `{"name":""}` | HTTP 400; Zod error for empty string (min 1); no section created | API | |
| TC-SEC-062 | Admin | Name exceeding 100 chars returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"<101-char-string>"}` | HTTP 400; Zod error "Section name must not exceed 100 characters" | API | |
| TC-SEC-063 | Admin | Non-integer display_order returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"Valid","display_order":1.5}` | HTTP 400; Zod error for integer constraint | API | z.number().int() |
| TC-SEC-064 | Admin | Negative display_order returns 400 | P1 | 1. `POST /api/v1/sections` body `{"name":"Valid","display_order":-1}` | HTTP 400; Zod error for min(0) | API | z.number().int().min(0) |
| TC-SEC-065 | Admin | display_order of 0 is valid | P1 | 1. `POST /api/v1/sections` body `{"name":"Zero Order","display_order":0}` | HTTP 201; section created with `display_order === 0` | API | min(0) allows 0 |
| TC-SEC-066 | Admin | Unauthenticated POST /sections returns 401 | P0 | 1. `POST /api/v1/sections` body `{"name":"No Auth"}` with no token | HTTP 401; "Authentication token is required" | API | |

---

## Section 03.9 — Playwright E2E

> Sections are managed from the Products page (sections shown as tabs) or a dedicated settings page. If a standalone `/sections` page exists, adjust selectors accordingly.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-SEC-E2E-001 | Admin | Sections appear as tabs on Products page | P0 | 1. Login as Admin 2. Navigate to `http://localhost:3000/products` | Section tabs visible at top of page; each active section renders as a clickable tab | E2E | Verify against actual products page layout |
| TC-SEC-E2E-002 | Admin | Clicking a section tab filters product list | P1 | 1. Login as Admin 2. Navigate to Products page 3. Click a specific section tab | Only products belonging to that section are displayed; tab is highlighted as active | E2E | |
| TC-SEC-E2E-003 | Admin | Deactivated section no longer appears as tab | P1 | 1. Deactivate a section via API 2. Reload Products page | Deactivated section tab is absent; active sections still present | E2E | |
| TC-SEC-E2E-004 | Supervisor | Supervisor sees section tabs but no edit/delete controls | P1 | 1. Login as Supervisor 2. Navigate to Products page | Section tabs visible for product filtering; no admin-only section management UI visible | E2E | |
