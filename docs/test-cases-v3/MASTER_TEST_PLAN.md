# Master Test Plan — Full-Scope Re-authoring (Web + Backend API + Mobile)

**Created:** 2026-06-09 (Opus planning)
**Goal:** A complete, no-gaps test-case suite covering the project from its initial scope through every later addition — every module, every page, every API endpoint, every role (Admin → Supervisor → Warehouse Operator → Dispatch Operator → Unauthenticated), and every scenario (happy path, validation, RBAC allow/deny, edge, integrity). Frontend (Playwright), Backend API (Playwright `request`), Mobile (Maestro).
**Method:** Opus plans each session brief; **Sonnet executes** the authoring. One session = one phase markdown file = one resumable "bunch."
**Commit policy:** NO per-session commits. Single combined commit at the very end (continues the existing held-bundle / combined-commit convention). Sonnet agents must **NOT modify `progress.md`**.

---

## Why this re-authoring exists

The v3 suite (`phase-01`…`phase-29`) was largely authored Apr 30 – May 11. Since then the scope grew substantially and the existing files are stale or missing coverage for:

- **RBAC overhaul** — `authorize(role)` → `authorizePermission('x:y')` across all routes; per-role `role_permissions`; **Role Manager** admin UI (`/admin/roles`).
- **Samples & E-commerce are now Admin-only by default** (no non-Admin role holds `samples:*`/`ecommerce:*`); granted per-role via Role Manager.
- **Sample foot model** — single-foot L/R, then **foot-split** (one box's LEFT and RIGHT to different samples; last-foot dispatch; box-level counts).
- **Unpack & Repack** module (`/unpack-repack`, 3 modes: Single Unpack / Single Repack / Repack-2-cartons) + removal of the standalone Repack feature; old `/unpack` redirect.
- **Legacy inventory** — count-level carton CSV upload + "Open for Repacking" unpack flow.
- **Inventory 7-level drill-down** (`/inventory` + `/inventory/[...path]`), carton hierarchy, CSV export, legacy stock upload button.
- **Bulk CSV uploads** — customers, products (batched, env-gated 2000 cap, casing normalization), child-boxes, legacy cartons; each with a sample-CSV endpoint.
- **E-commerce** — `scan-carton → auto-reflect` and **stock view** (`/ecommerce/stock`, allocated vs available).
- **Master carton** — `pack-by-barcode` (idempotent) + serialized scan queue/ledger; assortment aggregation.
- **Child-box labels** — 2-up 100mm roll, K-size font scaling, env-gated 1500 cap, batched barcode gen; **short barcode format** (`CB######`).
- **Products** — Active/Inactive/All filter; case-insensitive category/location + Title-Case storage.
- **Multi-source dispatch** (carton / sample / e-commerce) + grouped dispatches list.

---

## Conventions (carried from v3)

- **TC table (8 cols):** `TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes`.
- **TC ID scheme:** `TC-<AREA>-<NNN>` (e.g. `TC-AUTH-012`, `TC-API-SMP-007`). Leave numbering gaps to insert per-role rows without renumbering.
- **4-role rule:** every **positive** role test (role X CAN do Y) gets its own TC per allowed role; every **negative** role test (role X CANNOT do Y) gets its own TC per disallowed role. Always include **Unauthenticated** where the surface is reachable.
- **Type column:** `Manual | E2E | API | Integration | Regression`.
- **Automation:** Web E2E → **Playwright** (`frontend/e2e/*.spec.ts`); Backend → **Playwright `request`** API specs (or the existing jest/supertest suite — note which); Mobile E2E → **Maestro** YAML embedded in fenced blocks.
- **No summarization. Each TC standalone.** No skipped page/module/role/permission/scenario.

---

## Canonical role × permission access matrix (source of truth for RBAC TCs)

Admin = **super-admin bypass** (synthesizes the full **47-permission** catalog at login; needs no `role_permissions` rows). Others use seeded `role_permissions`. Denial = **403**; unauthenticated = **401**. Seeded permission counts (verified A1): Admin 47, Supervisor 19, Warehouse Operator 9, Dispatch Operator 7. Access token expiry = **3600s (1h)**.

| Module / action (permission) | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:--:|:--:|:--:|:--:|
| products:read / child_boxes:read / cartons:read | ✓ | ✓ | ✓ | ✓ |
| products:create/update | ✓ | ✓ | ✗ | ✗ |
| products:delete | ✓ | ✗ | ✗ | ✗ |
| child_boxes:create | ✓ | ✓ | ✓ | ✗ |
| child_boxes:update/delete | ✓ | ✓ (upd) / ✗ (del) | ✗ | ✗ |
| cartons:create | ✓ | ✓ | ✓ | ✗ |
| cartons:close | ✓ | ✓ | ✓ | ✗ |
| cartons:reopen / cartons:update | ✓ | ✓ | ✗ | ✗ |
| cartons:delete | ✓ | ✗ | ✗ | ✗ |
| packing:pack / packing:unpack | ✓ | ✓ | ✓ | ✗ |
| dispatch:read | ✓ | ✓ | ✗ | ✓ |
| dispatch:create / dispatch:update | ✓ | ✗ (read-only) | ✗ | ✓ |
| samples:* (create/read/update/delete) | ✓ | ✗ | ✗ | ✗ |
| ecommerce:* (create/read/update/delete) | ✓ | ✗ | ✗ | ✗ |
| customers:* | ✓ | ✗ | ✗ | ✗ |
| sections:* | ✓ | ✗ | ✗ | ✗ |
| inventory:read (transactions/export) | ✓ | ✗ | ✗ | ✗ |
| users:create/read/update | ✓ | ✓ | ✗ | ✗ |
| users:delete | ✓ | ✗ | ✗ | ✗ |
| roles:manage | ✓ | ✗ | ✗ | ✗ |
| reports:view_all / export | ✓ | ✓ | ✗ | ✗ |
| reports:view_own | ✓ | ✗ | ✓ | ✗ |
| reports:view_dispatch | ✓ | ✗ | ✗ | ✓ |
| audit:read / settings:manage | ✓ | ✗ | ✗ | ✗ |

**⚠️ Known discrepancies to encode as explicit TCs (not bugs to fix here — document the actual behavior):**
1. **Samples/E-commerce GET endpoints have NO permission gate** — only `authenticate`. So *any* logged-in role can READ samples/ecommerce via API even though the UI hides them and all writes are Admin-only. (API TCs must assert 200 for non-Admin GET, 403 for non-Admin writes.)
2. **Several GET endpoints are auth-only** (products/child-boxes/cartons/inventory/dispatches/customers list+detail) — no per-permission gate. List them and assert all 4 roles get 200.
3. **Stage-aware permissions (`max_stage`) are wired but dormant** for seeded roles (all `NULL`). Cover with a custom-role TC that sets a non-NULL `max_stage`.
4. **Sample foot-split simplifications (client-approved):** inventory/report counts stay **box-level** (a one-foot-sampled box = 1 SAMPLE box); dispatch flips a box to DISPATCHED only on its **last** foot. Encode as explicit expected-results, not defects.

---

## Session plan — 33 resumable sessions across 3 tracks

> Execution order: Track A (web, foundational first) → Track B (backend API) → Track C (mobile). Each row is one Sonnet authoring session. **Resume = pick the lowest-numbered `⏳ Pending` row.**

### TRACK A — Web UI / E2E (refresh existing to current scope + new feature pages)

| # | File | Scope to (re)author | Playwright specs to sync/add | Status |
|--:|---|---|---|---|
| A1 | `phase-01-auth.md` | Login, logout, refresh, change-password, profile; JWT/session expiry; **permission-array propagation at login**; all 4 roles + unauth | 01-auth, 16-rbac-auth | ✅ Authored 2026-06-09 — 181 TCs (8 automation gaps flagged) |
| A2 | `phase-02-user-management.md` | Users CRUD, role assignment, activate/deactivate; per-role allow/deny | 25-users-admin | ✅ 2026-06-09 — 131 TCs (risks: no self-delete guard, Supervisor can assign Admin role) |
| A3 | `phase-03-sections.md` | Sections CRUD; **Admin-only writes** (per matrix); read open to all | 14-sections-crud, 17 | ✅ 2026-06-09 — 77 TCs (NO standalone /sections UI; embedded in /products; sections:read unenforced) |
| A4 | `phase-04-customers.md` | Customers CRUD, primary/sub-dealer, type filter, **bulk CSV upload + sample CSV**, dedupe, validation; **Admin-only** RBAC | 09-customers, 18, 35-customer-bulk-upload | ✅ 2026-06-09 — 189 TCs (confirmed Admin-only; old file's Supervisor-write TCs were stale) |
| A5 | `phase-05-products-crud.md` | Products CRUD, size-range create, image upload, **Active/Inactive/All filter**, **casing normalization** (case-insensitive category/location, Title-Case names), colours/sizes endpoints; RBAC | 10-products, 17, 38-product-status-filter | ✅ 2026-06-09 — 194 TCs (image upload propagates to all products sharing article_code+colour) |
| A6 | `phase-06-products-bulk.md` | Product CSV bulk upload: **batched insert**, **env-gated 2000 cap** (default 500), casing, SKU serial assignment, per-row error report, chunk-failure degrade | 15-bulk-upload, 39-product-csv-cap-and-batch | ✅ 2026-06-09 — 98 TCs (sample-GET is 200 for all roles; ConflictError=409) |
| A7 | `phase-07-childbox-lifecycle.md` | Single create, GENERATED→FREE activation (incl. implicit), status transitions, aging tint (90/180d), RBAC | 03-child-boxes, 19, 30-generated-lifecycle | ✅ 2026-06-09 — 115 TCs (activate=child_boxes:update Admin+Sup only; child_boxes:delete is dead code/no route; list filter omits SAMPLE/ECOMMERCE) |
| A8 | `phase-08-childbox-bulk.md` | Bulk multi-size, bulk CSV + sample, **batched barcode gen perf**, **short barcode format**, caps | 29-childbox-bulk-upload | ✅ 2026-06-09 — 129 TCs (/bulk cap fixed-500 via Zod; only /bulk-multi-size env-gated; qr_data_uri="") |
| A9 | `phase-09-childbox-labels.md` | Label print **2-up 100mm roll**, **K-size font scaling**, **env-gated 1500 cap**, preview, client-side QR | 43-childbox-labels (GAP — to create) | ✅ 2026-06-09 — 80 TCs (label=48mm not 50; page=100mm; QR=18mm encodes short barcode; doc drift corrected) |
| A10 | `phase-10-master-cartons.md` | List + legacy toggle, create scan-to-pack, detail, **pack-by-barcode + serialized scan queue/ledger**, full-unpack, close, **open-for-repacking (legacy)**, assortment aggregation, HID UX; RBAC | 04-master-cartons, 20, 40-carton-pack-by-barcode | ✅ 2026-06-09 — 190 TCs (WH-Op CAN close; open-legacy gated by packing:unpack; ⚠ spec 20 calls deleted /repack → 404) |
| A11 | `phase-11-samples.md` | List, create (**foot selector PAIR/L/R + per-row override**), detail (add-box foot, remove, close, full-unpack), **foot-split** (LEFT+RIGHT to different samples, foot-availability guard, last-foot dispatch), assortment; **Admin-only RBAC default + Role-Manager-grant path** | 31-samples-module, 37-sample-foot-field, 38-sample-foot-split (GAP) | ✅ 2026-06-09 — 181 TCs (28 foot-split); GET ungated; isManager UI gate vs Supervisor lacks samples:update |
| A12 | `phase-12-ecommerce.md` | List, create, detail, **scan-carton → auto-reflect (carton→ecommerce move)**, **stock view `/ecommerce/stock`** (allocated vs available), full-unpack, close; **Admin-only RBAC** | 32-ecommerce-module, 36-ecommerce-scan-carton-and-stock | ✅ 2026-06-09 — 180 TCs (CLOSED carton scannable; create-with-boxes skips ECOMMERCE_CREATED; stock page useCan denies non-Admin UI but API 200) |
| A13 | `phase-13-dispatch.md` | **Multi-source** dispatch (carton multi / sample single / e-commerce single), CLOSED/ACTIVE rules, customer auto-destination, dispatches list grouped-by-customer, HID; RBAC (Dispatch Op + Admin create; Supervisor read-only) | 21-dispatch-rbac, 33-dispatch-multi-source | ✅ 2026-06-09 — 142 TCs (⚠ spec 21 asserts Supervisor 201 → must be 403; customer_id required for carton dispatch only) |
| A14 | `phase-14-dashboard.md` | Stat cards (generated/total/active cartons/today dispatches/pairs-in-stock), recent activity, quick actions; per-role visibility | 02-dashboard, 23-inventory-dashboard | ✅ 2026-06-09 — 93 TCs (dashboard endpoint auth-only; quick-actions unconditionally rendered; UI shows 10 of 20 txns) |
| A15 | `phase-15-stock-hierarchy.md` | **Inventory 7-level drill-down** (`/inventory` + `[...path]` section→category→article→colour→size→size_group→leaf), carton hierarchy + status chips + utilization, **CSV export**, **legacy stock upload UI**; RBAC split | 13-inventory, 30-inventory-drilldown, 34-mrp-and-carton-hierarchy | ✅ 2026-06-09 — 229 TCs (FE uses /inventory/breakdown; non-Admin can URL-nav to /inventory; nav hidden≠page-blocked; LegacyUpload gate=cartons:create) |
| A16 | `phase-16-reports-product-stock.md` | Reports tabs: Stock, Carton Inventory, Samples, E-commerce; per-product box breakdown + pair counts; sample/ecommerce columns; CSV export; RBAC (`reports:view_all`) | 06-reports, 24-reports-rbac | ✅ 2026-06-09 — 209 TCs (reports:view_own/view_dispatch/export are DEAD perms; FE sample/ecommerce report cards broken; no /reports route guard) |
| A17 | `phase-17-reports-dispatch-csv.md` | Dispatch summary, daily activity, party-wise; all CSV exports; date/customer filters; RBAC | 24-reports-rbac | ✅ 2026-06-09 — 143 TCs (gated reports:view_all = Admin+Supervisor; WH/Dispatch 403) |
| A18 | `phase-18-scan-traceability.md` | Scan & Trace + Traceability, **HID-first UX** (camera fallback), GENERATED auto-activate-on-trace, `parseQRCode` all 4 prefixes × short/legacy, timeline; all roles (scan ungated) | 07-traceability, 08-scan, 22-scan-trace | ✅ 2026-06-09 — 128 TCs (/inventory/transactions Admin-only; SR/EC barcodes NOT traceable; sample/ecommerce trace cards don't render; spec 08 stale) |
| A19 | `phase-19-audit-integrity.md` | Audit log (`audit:read` Admin-only), inventory_transactions integrity per action, transaction-type coverage, metadata | (integrity assertions) | ✅ 2026-06-09 — 114 TCs (audit:read endpoint 404s/DEAD; CHILD_REPACKED & CARTON_REOPENED dead types; ECOMMERCE_CREATED asymmetry; legacy upload writes no inv-txns) |
| A20 | `phase-20-edge-cases.md` | Cross-cutting: validation errors, concurrency (rapid scan, double-submit), empty states, network errors, status-guard rejections, order-sensitive routes | 27-edge-cases | ✅ 2026-06-09 — 179 TCs (17 cross-cutting sections incl. foot-split edges, repack deadlock-order, idempotent re-scan, security) |
| A21 | `phase-33-role-manager.md` **(NEW)** | `/admin/roles`: list, create role, edit (Admin protected, default-role rename blocked), delete (protected-role + assigned-user blocks), permission grid, `role_permissions` backfill, **grant Supervisor `samples:*` then verify access** end-to-end; RBAC (`roles:manage` Admin-only) | 31-role-manager | ✅ 2026-06-09 — 149 TCs (GET /permissions also roles:manage-gated; Admin PATCH 403 even for perm-only; grant-flow + immediate-effect proven; user role enum blocks assigning custom roles) |
| A22 | `phase-34-unpack-repack.md` **(NEW)** | **REDESIGNED 2026-06-10 → 2 tabs:** Unpack (scan→unpack) + Repack (scan→auto-unpack-if-nonempty via confirm→box-scan); `unpacked_at` tracking; free-both REMOVED; scan queue/ledger; `/unpack` redirect; standalone Repack removed; RBAC (`packing:unpack`+`packing:pack`) | 41-repack-removed, 42-carton-repack | ✅ 2026-06-10 — rewritten to 2-tab design, 78 TCs (was 123 for 3-mode); spec 42 dropped free-both/single-repack, added free-both-404 + unpacked_at lifecycle + 2-tab UI; built+localhost-verified |
| A23 | `phase-35-legacy-inventory.md` **(NEW)** | Legacy carton CSV upload + sample CSV, opaque count-level cartons, `includeLegacy` toggle, **Open-for-Repacking** unpack→rescan flow, no-auto-count rule; RBAC | 43-legacy-inventory (GAP — to create) | ✅ 2026-06-09 — 89 TCs (upload returns 201; sample CSV has a 0-qty row by design; legacy upload writes no inv-txns; whole module is an automation gap) |

### TRACK B — Backend API contract tests (NEW; Playwright `request` or jest/supertest)

| # | File | Endpoints covered (happy / validation / 401 / 403-per-role / business rules) | Status |
|--:|---|---|---|
| B1 | `phase-40-api-auth-users-roles.md` **(NEW)** | `/auth/*` (login, refresh, logout, change-password, profile), `/users/*`, `/roles/*` + `/permissions`; protected-role rules; token refresh/expiry; per-role 403 | ✅ 2026-06-09 — 205 TCs (inactive-login same 401 as wrong-pw; custom roles unassignable via API → deleteRole 409 path unreachable normally) |
| B2 | `phase-41-api-products-sections-childboxes.md` **(NEW)** | `/products/*` (incl. bulk-upload + sample, bulk-size-range, image), `/sections/*`, `/child-boxes/*` (incl. bulk, bulk-multi-size, bulk-upload, qr, activate, free); **order-sensitive routes**; auth-only GETs (all roles 200) | ✅ 2026-06-09 — 219 TCs (sections:read unenforced; child_boxes:delete 404/dead; product delete = soft-deactivate; deactivated section name lingers on products) |
| B3 | `phase-42-api-cartons-packing.md` **(NEW)** | `/master-cartons/*` — create, pack, **pack-by-barcode** (idempotent re-scan), unpack, full-unpack, close, **legacy-upload + sample**, open-legacy, **repack/free-both**, qr, children, assortment; transactional + status guards; RBAC | ✅ 2026-06-09 — 220 TCs (cartons:reopen + cartons:delete are dead perms; legacy cap 20k total-qty; ⚠ spec 20 calls deleted /repack + asserts WH-close=403) |
| B4 | `phase-43-api-samples-ecommerce.md` **(NEW)** | `/samples/*` (create w/ `box_feet`, add-box foot, remove-box, full-unpack, close, qr, children, assortment) + `/ecommerce/*` (create, add-box, **scan-carton**, remove-box, full-unpack, close, **stock-summary**, qr); **foot-split rules**, **GET-no-permission-gate discrepancy**, RBAC for writes | ✅ 2026-06-09 — 278 TCs (19 foot-split; create-with-boxes skips ECOMMERCE_CREATED; CLOSED carton IS scannable; GET ungated all roles 200) |
| B5 | `phase-44-api-inventory-dispatch-reports-customers.md` **(NEW)** | `/inventory/*` (dashboard, stock summary/hierarchy, transactions, carton hierarchy + export, trace, breakdown), `/dispatches/*` (multi-source create + rules), `/reports/*` (all + exports, per-role), `/customers/*` (incl. bulk + sample, primary/sub-dealers) | ✅ 2026-06-09 — 365 TCs (inventory auth-only vs inventory:read split; master-carton dispatch accepts ACTIVE or CLOSED; GET /dispatches ungated; reports view_own/view_dispatch/export dead) |

### TRACK C — Mobile (finish pending + new-feature parity + finalize)

| # | File | Scope | Status |
|--:|---|---|---|
| C1 | `phase-30-mobile-reports.md` | Mobile reports (Stock w/ Sample/Ecommerce cols + totals, Cartons/Dispatches/Activity tabs); per-role | ⏳ Pending |
| C2 | `phase-31-cross-platform-parity.md` | Web↔mobile data parity, JWT sharing, status changes both directions, permission parity (incl. Admin-only samples/ecommerce) | ⏳ Pending |
| C3 | `phase-32-mobile-edge-cases.md` | Network/offline, camera perms, token refresh, perf smoke | ⏳ Pending |
| C4 | `phase-37-mobile-newfeatures.md` **(NEW)** | Mobile coverage/gaps for: sample foot + foot-split, unpack-repack modes, role-manager, drill-down, bulk uploads, ecommerce stock/scan-carton, multi-source dispatch — **verify against mobile codebase; document web-only gaps** | ⏳ Pending |
| C5 | `README.md` + trackers | Update v3 README capability matrix (all new modules/roles), finalize this plan + `AUTHORING_PROGRESS.md`; mark complete | ⏳ Pending |

---

## Resume protocol (every future session)

1. Read this file. Find the lowest-numbered session with status `⏳ Pending`.
2. Opus writes/loads that session's brief (read the existing phase file + the relevant code paths + the paired Playwright spec so the refresh reflects current behavior).
3. Dispatch **one Sonnet agent** to author/refresh that single file. Sonnet must: follow the 8-col format + 4-role rule, cover all scenarios incl. the known-discrepancy TCs, embed/sync Playwright (web/API) or Maestro (mobile), and **NOT touch `progress.md`** or commit.
4. Verify: format, all roles + unauth covered, scenario completeness, TC IDs non-colliding.
5. Update this table: set status `✅ Authored YYYY-MM-DD`, fill TC count.
6. **Stop and ask the user whether to continue** with the next session.

**No commits** until the user calls for the single combined commit at the end.

---

## Status log

- 2026-06-09 — Plan created (Opus). Scope mapped: 30 web pages, 109 API endpoints, **47 permissions** / 4 roles. 33 sessions defined.
- 2026-06-09 — **A1 done** (Sonnet): `phase-01-auth.md` refreshed → 181 TCs. Corrections vs initial matrix: catalog is 47 (not 67); Supervisor is dispatch:read-only (cannot create/update dispatch); token expiry 3600s; Warehouse Op CAN close cartons. 8 Playwright automation-gap tests recommended for `16-rbac-auth.spec.ts` (deferred — authoring track first).
- 2026-06-09 — **TRACK A COMPLETE** (A1–A23, all 23 web phase files authored/refreshed by Sonnet under Opus dispatch). **~3,343 TCs total.** Per file: A1 181, A2 131, A3 77, A4 189, A5 194, A6 98, A7 115, A8 129, A9 80, A10 190, A11 181, A12 180, A13 142, A14 93, A15 229, A16 209, A17 143, A18 128, A19 114, A20 179, A21 149, A22 123, A23 89.

### Consolidated cross-cutting findings from Track A (to triage with the team — documented as TCs, NOT fixed)

**Dead permissions** (seeded/cataloged but no route consumes them → effectively inert): `reports:view_own`, `reports:view_dispatch`, `reports:export`, `audit:read` (its endpoint 404s), `child_boxes:delete` (no DELETE route). `packing:repack` was removed entirely.
**Dead transaction types** (defined, never emitted): `CHILD_REPACKED`, `CARTON_REOPENED`.
**RBAC UI-vs-API gaps** (UI shows an action the API then 403s — needs `useCan` tightening): sample/ecommerce detail use `isManager`/status-only gates while writes are Admin-only; dashboard quick-actions render unconditionally; scan page "Seal for Storage" ungated; non-Admin can URL-navigate to `/inventory` and `/reports` (nav hidden ≠ route-guarded).
**Stale Playwright specs to fix before CI** (will fail/false-pass on clean seed): `21-dispatch-rbac` asserts Supervisor dispatch=201 (should be 403); `20-cartons-lifecycle` calls deleted `/master-cartons/repack` (404) and asserts WH-Op close=403 (should be 200); `08-scan` uses stale "Camera Scanner/Manual Entry" selectors; `06-reports` asserts 4 tabs (now 6).
**Frontend data bugs** (encoded as TCs): Samples & E-commerce report cards broken by type mismatch (`by_status` vs flat fields, `recipient` vs `recipient_name`, `total_pairs` vs `pairs_total`); stock CSV export drops sample/ecommerce columns.
**Behavioral asymmetries:** create-with-boxes path skips `ECOMMERCE_CREATED` (sample always writes `SAMPLE_CREATED`); legacy upload writes no inventory_transactions; product image upload propagates to all products sharing article_code+colour; CLOSED carton is scannable into e-commerce (only DISPATCHED blocked).
**Security/guardrail gaps:** no self-delete / self-role-downgrade guard on users; Supervisor can assign Admin role via user update.

Next: **Track B (backend API, B1–B5)**, then Track C (mobile). Holds: nothing committed (combined-commit at end); progress.md untouched by agents.
- 2026-06-10 — **TRACK B COMPLETE** (B1–B5, all 5 backend-API phase files authored by Sonnet under Opus dispatch). **~1,287 API contract TCs** (B1 205, B2 219, B3 220, B4 278, B5 365). All 109 endpoints covered with happy/validation/401/403-per-role/business-rule TCs; 401-vs-403 distinction throughout; order-sensitive routes verified.
  **New API-layer findings (consistent with Track A):** master-carton dispatch accepts **ACTIVE or CLOSED** (not CLOSED-only); `GET /dispatches` is ungated (WH Op 200); inactive-user login returns the same 401 as wrong-password (no distinction); custom roles can't be assigned to users via API (Zod enum) → `deleteRole` "assigned-users" 409 path unreachable normally; `inventory:read` gates only `/transactions` + `/cartons/export` (rest of inventory is auth-only). Reconfirms the dead-permission set and the samples/ecommerce GET-ungated discrepancy at the API layer.
  **Interim deploy (2026-06-10):** held bundle (Single Repack + sample foot-on-create + foot-split + migration 20260609120001) DEPLOYED to TEST box and verified (see progress.md). Mobile app left aside per user.
  Next: **Track C (mobile, C1–C5)**.
- 2026-06-10 — **CI-breaking spec-fix pass** (user chose this over Track C). Fixed the stale Playwright assertions surfaced by Tracks A/B and verified against the live localhost stack (**47 passed**):
  - `21-dispatch-rbac` TC-DISP-SUP-001: Supervisor create dispatch **201 → 403** (dispatch:read-only). ✅ passes.
  - `20-cartons-lifecycle`: TC-MC-CLOSE-003 WH-Op close **403 → 200** (seed grants cartons:close); standalone-repack block → **route-removed 404** assertion; removed orphaned repack vars (kept `packedBarcode`). ✅ passes.
  - `08-scan`: replaced stale `enter barcode`/`Look Up`/`Camera Scanner`/`Manual Entry` selectors with real HID-first UI (`scan barcode to trace`, `Add`, `Use Camera Instead`); TC-004 now asserts the not-found toast. ✅ 001/003 pass.
  - **Residual failures are NOT from our changes** (pre-existing): `08-006` (real-barcode card) + `21 DISP-E2E-001` (/dispatch page) are **dev-mode artifacts** — localhost runs `npm run dev` (on-demand route compile timeout + StrictMode re-render; the dispatch page has no useEffect). `08-012` needs a real camera (headless-unreliable). Recommend running e2e against a **prod build** in CI, where these clear. Not fixed here.
- 2026-06-10 — **Label fixes (from client meeting) — authored + tested.** 3 fixes: responsive auto-fit text on both labels; Kids-first size sort (new `lib/sizeSort.ts`); generate-page per-size dedup. Test cases: `phase-09-childbox-labels.md` +16 (§11 auto-fit, §12 dedup+order), `phase-10-master-cartons.md` +21 (§19 label rendering). New Playwright spec **`43-label-rendering.spec.ts` — 13/13 green** on localhost (sizeSort pure unit; generate dedup+Kids-first order; master-carton + child-box print-popup no-overflow auto-fit + Kids-first assortment column order). Built+verified localhost; NOT deployed. Note: child-box `.article-row` keeps `overflow:hidden`+ellipsis as the floor fallback for extremely long names (auto-fit shrinks first).
