# Binny Inventory Management System — Test Cases v3 (Master Index)

**Project:** Binny Footwear — Mahavir Polymers Pvt. Ltd. Inventory Management System
**Built by:** Basiq360
**Suite version:** v3 (supersedes v2)
**Last updated:** 2026-05-02
**Scope:** Web portal (Next.js) + Backend API (Node/Express + Postgres) + Mobile app (Expo / React Native). Mobile coverage being added in phases 21-32 (see `AUTHORING_PROGRESS.md`).

---

## 1. What's in v3 (and why it supersedes v2)

The v2 suite (`docs/test-cases-v2-phases-*.md`) covered the original Phase 1–14 scope and stopped at the 2026-04-16 build. Since then the system has gained four major Phase 6 modifications (deployed to the testing portal on 2026-04-29, commit `160084d`):

1. **Child-box CSV bulk uploader** (`POST /child-boxes/bulk-upload`) — go-live initial-stock import.
2. **`GENERATED` child-box lifecycle** — labels start as GENERATED, scan or pack activates to FREE/PACKED. New idempotent `POST /child-boxes/:id/activate` endpoint.
3. **Sample + E-commerce modules** — two new container types peer to master cartons. Each has its own create/add-box/remove-box/close/full-unpack lifecycle plus dispatch routing. New `dispatch_records.chk_dispatch_source_exactly_one` CHECK constraint enforces that every dispatch row hangs off exactly one of `master_carton_id | sample_record_id | ecommerce_record_id`.
4. **Inventory hierarchy MRP grouping** — conditional `mrp` level inserted between `article_name` and `colour` (only when an article has multiple distinct MRPs). New `distinctMrpCount` field on `StockNode`.

v3 covers every page, every action, every status transition, and every error path across the full system — including the four Apr 27 mods. v2 files remain available as the **format reference** but should not be treated as the source of truth.

---

## 2. Test environments

### 2.1 — Local development

| Concern | Value |
|---|---|
| Backend API base | `http://localhost:5000/api/v1` |
| Frontend dev server | `http://localhost:3000` |
| Database | `binny_postgres` Docker container, port 5432 |
| Health check | `GET http://localhost:5000/api/v1/health` → `{"status":"ok"}` |

### 2.2 — Testing portal (Hostinger VPS)

| Concern | Value |
|---|---|
| Frontend | `https://srv1409601.hstgr.cloud/binny/` |
| Backend API base | `https://srv1409601.hstgr.cloud/binny/api/v1` |
| Health check | `GET https://srv1409601.hstgr.cloud/binny/api/v1/health` → `{"status":"ok"}` |
| Current build | commit `160084d` (deployed 2026-04-29) |

### 2.3 — When to run which environment

- **API tests (cURL, Postman, Playwright API mode):** prefer local — faster, deterministic, no shared state with client.
- **Manual UAT / smoke / browser-cache regression checks:** portal (the URL the client uses).
- **CSV uploader / mass-create flows:** local first to validate; spot-check on portal afterward.

---

## 3. Roles & credentials

The system has four roles. Only the **Admin** account is auto-seeded by `backend/seeds/002_admin_user.ts`. The other three must be created by an Admin via `POST /api/v1/users` (or the `/users` UI page) before role-specific tests can run. Convention used throughout v3:

| Role | Email | Password | Auto-seeded? |
|---|---|---|---|
| Admin | `admin@binny.com` | `Admin@123` | Yes |
| Supervisor | `supervisor@binny.com` | `Sup@123` | **No — create before testing** |
| Warehouse Operator | `warehouse@binny.com` | `Wh@123` | **No — create before testing** |
| Dispatch Operator | `dispatch@binny.com` | `Dp@123` | **No — create before testing** |

If a phase file references a role and the account doesn't exist, run **TC-USER-SEED-001** (in `phase-02-user-management.md`) first.

### 3.1 — Role capability matrix

| Action | Admin | Supervisor | Warehouse Op | Dispatch Op |
|---|:---:|:---:|:---:|:---:|
| Login / view profile / change own password | ✅ | ✅ | ✅ | ✅ |
| User CRUD | ✅ | ❌ | ❌ | ❌ |
| Section CRUD | ✅ | ❌ | ❌ | ❌ |
| Customer CRUD | ✅ | ✅ | read | read |
| Product CRUD | ✅ | ✅ (no delete) | read | read |
| Product image upload | ✅ | ✅ | ❌ | ❌ |
| Product CSV bulk upload / size-range bulk-create | ✅ | ✅ | ❌ | ❌ |
| Child box single create | ✅ | ✅ | ✅ | ❌ |
| Child box bulk / multi-size / CSV upload | ✅ | ✅ | ❌ | ❌ |
| Child box activate (GENERATED → FREE) | ✅ | ✅ | ✅ | ✅ |
| Child box label print | ✅ | ✅ | ✅ | ❌ |
| Master carton create / add-box / remove-box / repack / full-unpack | ✅ | ✅ | ✅ | ❌ |
| Master carton close | ✅ | ✅ | ❌ | ❌ |
| Sample / E-commerce create / add-box / remove-box / full-unpack | ✅ | ✅ | ✅ | ❌ |
| Sample / E-commerce close | ✅ | ✅ | ❌ | ❌ |
| Dispatch (any source type) | ✅ | ✅ | ❌ | ✅ |
| Inventory dashboard / stock hierarchy | ✅ | ✅ | ✅ | ✅ |
| Reports (read) | ✅ | ✅ | ❌ | ❌ |
| Reports CSV export | ✅ | ✅ | ❌ | ❌ |
| Audit log / inventory transactions | ✅ | ✅ | ❌ | ❌ |

The exact authorize() decorators are in `backend/src/routes/*.routes.ts`. Where the code disagrees with this matrix, **the code wins** — flag the doc for correction.

---

## 4. Test case format

Every phase file uses the same 8-column markdown table (mirrors v2):

```markdown
| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
```

| Column | Convention |
|---|---|
| **TC ID** | `TC-<MODULE>-<NNN>` for API/integration, `TC-<MODULE>-E2E-<NNN>` for browser E2E. Module codes: `RBAC`, `USER`, `SEC`, `CUST`, `PROD`, `CB` (child box), `MC` (master carton), `SMP` (sample), `EC` (ecommerce), `DISP`, `INV` (dashboard), `STK` (stock hierarchy), `RPT`, `SCAN`, `AUD` (audit), `EDGE` |
| **Role** | The role(s) the test runs as. Use `Any` for role-agnostic tests |
| **Title** | Imperative, single-sentence description |
| **Priority** | `P0` (blocking — must pass before release), `P1` (high — should pass), `P2` (nice-to-have) |
| **Steps** | Numbered, copy-pasteable. Include exact endpoints, request bodies, and selectors |
| **Expected Result** | Concrete assertions: HTTP status, response field equality, DB state, UI element visibility |
| **Type** | `API` (HTTP-only), `Integration` (multiple HTTP calls or DB ↔ API), `E2E` (browser via Playwright), `Manual` (cannot be automated) |
| **Notes** | Optional. Dependencies, gotchas, or data fixture references |

### 4.1 — Authoring rules

- **No summarisation.** Cover every endpoint, every status transition, every UI element. If a page has 3 buttons, each gets at least one test. If a status field has 5 values, each transition gets a test.
- **Steps are reproducible.** Anyone with the credentials and an API client should be able to follow the steps in order without asking questions. Include exact JSON bodies, exact URL paths, exact element selectors.
- **Expected results are observable.** "Works correctly" is not an expected result. "HTTP 200, response body contains `{id: <uuid>, status: 'CREATED'}`, DB row exists in `master_cartons` with matching id" is.
- **Each test stands alone.** If a test depends on prior data being in place, name the fixture or the prior TC ID in Notes (e.g., `Notes: Requires Section "Hawaii" from TC-SEC-001`).
- **Cover both roles allowed AND roles denied.** If supervisor and admin can both create, write tests for both. If warehouse cannot, write a 403 denial test.
- **Cover the four error paths:** missing field, wrong type, not-found, conflict (duplicate / forbidden state transition).

---

## 5. Phase index

The 20 phases are split for parallel authoring. Each phase is one self-contained file. Estimated size given so reviewers know roughly what to expect.

| # | Phase file | Title | Approx TC count | Module focus |
|---|---|---|---|---|
| 01 | [phase-01-auth.md](phase-01-auth.md) | Authentication & Authorization | 60–80 | Login, JWT, password change, profile, logout, RBAC denials across all endpoints |
| 02 | [phase-02-user-management.md](phase-02-user-management.md) | User Management (Admin only) | 40–55 | User CRUD, role assignment, activation/deactivation, password reset |
| 03 | [phase-03-sections.md](phase-03-sections.md) | Section Management | 25–35 | Section CRUD, deletion guard (in-use sections), name uniqueness |
| 04 | [phase-04-customers.md](phase-04-customers.md) | Customer Management | 35–50 | Customer CRUD per role, search/filter, deletion guard if used in dispatches |
| 05 | [phase-05-products-crud.md](phase-05-products-crud.md) | Products — CRUD & image upload | 60–80 | Single create, edit, delete, image upload, SKU generation, list/filter/search |
| 06 | [phase-06-products-bulk.md](phase-06-products-bulk.md) | Products — Bulk operations | 40–55 | CSV bulk upload, size-range bulk-create (Apr 22 mod), error rows |
| 07 | [phase-07-childbox-lifecycle.md](phase-07-childbox-lifecycle.md) | Child Box — Single create + GENERATED lifecycle | 60–80 | Single create, GENERATED → FREE via `/activate` (idempotent), pack-on-scan from GENERATED, audit-trail correctness, KPI exclusions |
| 08 | [phase-08-childbox-bulk.md](phase-08-childbox-bulk.md) | Child Box — Bulk operations | 50–70 | `POST /bulk`, `POST /bulk-multi-size`, `POST /bulk-upload` (Apr 27 CSV uploader), 1000-row + 5000-box caps, per-row error handling, "Download Created Barcodes" flow |
| 09 | [phase-09-childbox-labels.md](phase-09-childbox-labels.md) | Child Box — Labels, list, aging | 35–50 | 50×50mm label print layout, label content (article/colour/MRP/size/QR/packed-on/content), aging tint (90d yellow / 180d red), list filters & pagination |
| 10 | [phase-10-master-cartons.md](phase-10-master-cartons.md) | Master Cartons | 70–90 | Create, add-box, remove-box, repack, close, full-unpack, status guards (CREATED/ACTIVE/CLOSED/DISPATCHED), partial-unique-index enforcement |
| 11 | [phase-11-samples.md](phase-11-samples.md) | Sample module (peer of master carton) | 65–85 | Create with customer FK or free-text recipient, full lifecycle, pairsInStock exclusion, no-print-label confirmation, role gates |
| 12 | [phase-12-ecommerce.md](phase-12-ecommerce.md) | E-commerce module | 65–85 | Create with marketplace/order_reference/listing_sku, full lifecycle, list filter on marketplace, role gates |
| 13 | [phase-13-dispatch.md](phase-13-dispatch.md) | Dispatch | 70–90 | Master carton (multi-source per row), sample (1:1), e-commerce (1:1), exactly-one-source CHECK constraint, source-type tab UX, dispatches list filter & badge |
| 14 | [phase-14-dashboard.md](phase-14-dashboard.md) | Inventory Dashboard | 30–45 | KPI cards including new GENERATED / Sample boxes / E-commerce boxes, totals consistency (sum of breakdown chips equals total), 5-column responsive grid |
| 15 | [phase-15-stock-hierarchy.md](phase-15-stock-hierarchy.md) | Inventory Stock Hierarchy | 40–60 | Section → article → [conditional MRP] → colour → size drilldown, breadcrumb, deep-link query params, MRP-skip behaviour for single-MRP articles, sort orders |
| 16 | [phase-16-reports-product-stock.md](phase-16-reports-product-stock.md) | Reports — Product-wise & Stock summary | 50–70 | Product-wise report (with SAMPLE/ECOMMERCE/GENERATED buckets), stock summary, filters, pagination, summary cards |
| 17 | [phase-17-reports-dispatch-csv.md](phase-17-reports-dispatch-csv.md) | Reports — Dispatch / Sample / E-commerce + CSV exports | 50–70 | Three report tabs, status/date/customer/marketplace filters, CSV export (axios blob download), summary cards |
| 18 | [phase-18-scan-traceability.md](phase-18-scan-traceability.md) | Scan & Traceability | 35–50 | `/scan` and `/traceability` pages, barcode lookup (child + master + sample + ecommerce), GENERATED auto-activate on scan, timeline correctness |
| 19 | [phase-19-audit-integrity.md](phase-19-audit-integrity.md) | Audit log, inventory transactions, cross-module integrity | 30–45 | Every state transition writes the right transaction type, audit log per role, FK integrity, soft-delete (where applicable), referential safety |
| 20 | [phase-20-edge-cases.md](phase-20-edge-cases.md) | Negative tests, edge cases, boundary values, performance | 50–70 | Pagination boundaries, max-length input fields, concurrent ops, race conditions, malformed payloads, expired tokens, file-size limits, network errors |
| 21 | [phase-21-mobile-foundation.md](phase-21-mobile-foundation.md) | Mobile — Auth, tab shell, Menu, Settings | 80–110 | Login per role, AuthGate routing, bottom tab bar, Dashboard tab, Menu role-gated tile grid, Settings, logout, token persistence (mobile-only) |
| 22 | [phase-22-mobile-inventory.md](phase-22-mobile-inventory.md) | Mobile — Inventory (Child Box + Master Carton tabs, MRP grouping) | 80–100 | Inventory tab toggle, MRP conditional drill (M5), Master Carton hierarchy, breadcrumbs, summary cards |
| 23 | [phase-23-mobile-products-childboxes.md](phase-23-mobile-products-childboxes.md) | Mobile — Products, Child Boxes, Repack/Unpack/Storage | 100–130 | Products list/detail; child-box list/detail/aging tint; Generate stub (web-only); Repack / Unpack / Storage workflows |
| 24 | phase-24-mobile-master-cartons.md (pending) | Mobile — Master Cartons | 70–90 | List, create, detail, add/remove box, close, full-unpack, status transitions per role |
| 25 | phase-25-mobile-samples.md (pending) | Mobile — Samples (M2) | 70–90 | Full sample lifecycle on mobile |
| 26 | phase-26-mobile-ecommerce.md (pending) | Mobile — E-commerce (M3) | 70–90 | Full ecommerce lifecycle on mobile |
| 27 | phase-27-mobile-dispatch.md (pending) | Mobile — Dispatch multi-source (M4) | 70–90 | 3-way source picker, source-type chip, jump-link, role gates |
| 28 | phase-28-mobile-customers-users.md (pending) | Mobile — Customers + Users | 50–70 | Customers per role; Users (Admin only) |
| 29 | phase-29-mobile-scan-traceability.md (pending) | Mobile — Scan + Traceability | 50–70 | Scan tab, parseQRCode for CB/MC/SR/EC (M1), traceability path |
| 30 | phase-30-mobile-reports.md (pending) | Mobile — Reports (M6 columns) | 50–70 | Stock Sample/Ecommerce columns; Cartons / Dispatches / Activity tabs |
| 31 | phase-31-cross-platform-parity.md (pending) | Cross-platform parity (web ↔ mobile) | 40–60 | Web→mobile data, JWT sharing, status changes both ways, concurrent edits |
| 32 | phase-32-mobile-edge-cases.md (pending) | Mobile — Edge cases | 50–70 | Network failures, offline, camera permissions, token refresh, perf smoke |

**Total estimated test cases:** ~2,000–2,600 across 32 files (web 1,469 actual; mobile 870–1,170 estimated).

---

## 6. Coverage gaps closed by v3 vs. v2

| Topic | v2 coverage | v3 coverage |
|---|---|---|
| `GENERATED` child-box status | none (didn't exist) | Phase 07 |
| `POST /child-boxes/:id/activate` (idempotent) | none | Phase 07 |
| `POST /child-boxes/bulk-upload` CSV uploader | none | Phase 08 |
| 1000-row / 5000-box caps on child-box CSV | none | Phase 08 |
| Sample module (`/api/v1/samples`) | none | Phase 11 |
| E-commerce module (`/api/v1/ecommerce`) | none | Phase 12 |
| Dispatch source-type routing | partial (master-carton only) | Phase 13 |
| `dispatch_records` CHECK constraint | none | Phase 13 |
| Dashboard new KPIs (generated / sample / ecommerce) | none | Phase 14 |
| MRP conditional grouping in stock hierarchy | none | Phase 15 |
| Sample / E-commerce reports + CSV exports | none | Phase 17 |
| FREE child-box aging tint (90d / 180d) | none | Phase 09 |
| Product size-range bulk-create | none | Phase 06 |
| 50×50mm label redesign + 3-line MRP cell | partial (60mm) | Phase 09 |

---

## 7. Execution order & dependency graph

Phase files are mostly independent, but the API tests within them assume some seed data exists. Run order suggestion:

```
01 (auth) ─► 02 (users) ─┬─► 03 (sections) ─► 05 (products CRUD) ─► 06 (products bulk)
                         │                                           │
                         └─► 04 (customers)                          ▼
                                                                     07 (CB lifecycle) ─► 08 (CB bulk)
                                                                                          │
                                                                                          ▼
                                                                                          09 (labels)
                                                                                          │
                                          ┌───────────────────────────────────────────────┘
                                          ▼
                                          10 (master cartons) ─┬─► 11 (samples)
                                                               │
                                                               └─► 12 (ecommerce)
                                                                          │
                                          ┌───────────────────────────────┘
                                          ▼
                                          13 (dispatch)
                                          │
                                          ▼
                                          14 (dashboard) ─► 15 (stock hierarchy)
                                          │
                                          ▼
                                          16 (reports product/stock) ─► 17 (reports dispatch/CSV)
                                          │
                                          ▼
                                          18 (scan/traceability)
                                          │
                                          ▼
                                          19 (audit/integrity) ─► 20 (edge cases)
```

When running locally, the simplest path is: reset DB → run `npm run seed` → execute Phases 01–20 in order. When running on the portal, do **not** reset — work with the live data and clean up artifacts after each phase.

---

## 8. Completion tracker

| Phase | Authored | Reviewed | Executed | Pass rate | Notes |
|:--:|:--:|:--:|:--:|:--:|---|
| 01 | ✅ | ⬜ | ⬜ | — | 78 TCs; RBAC denial matrix covers all 11 endpoint groups |
| 02 | ✅ | ⬜ | ⬜ | — | 46 TCs; includes TC-USER-SEED-001 prerequisite |
| 03 | ✅ | ⬜ | ⬜ | — | 32 TCs; deletion-guard discrepancy flagged |
| 04 | ✅ | ⬜ | ⬜ | — | 53 TCs; UI/API Supervisor discrepancy flagged |
| 05 | ✅ | ⬜ | ⬜ | — | |
| 06 | ✅ | ⬜ | ⬜ | — | |
| 07 | ✅ | ⬜ | ⬜ | — | |
| 08 | ✅ | ⬜ | ⬜ | — | |
| 09 | ✅ | ⬜ | ⬜ | — | 56 TCs; 50×50mm label CSS + aging tint + list filters |
| 10 | ✅ | ⬜ | ⬜ | — | 90 TCs; full lifecycle + repack + transaction integrity |
| 11 | ✅ | ⬜ | ⬜ | — | 87 TCs; sample lifecycle + stock semantics + no-repack confirmed |
| 12 | ✅ | ⬜ | ⬜ | — | 90 TCs; ecommerce lifecycle + marketplace filter |
| 13 | ✅ | ⬜ | ⬜ | — | 90 TCs; multi-source dispatch, Zod+DB CHECK, state transitions, role gates, E2E UX |
| 14 | ✅ | ⬜ | ⬜ | — | 41 TCs; 5-column KPI grid, new GENERATED/Sample/Ecommerce fields, arithmetic invariants |
| 15 | ✅ | ⬜ | ⬜ | — | 56 TCs; MRP conditional drill-down, GENERATED exclusion, deep-link params, E2E UX |
| 16 | ✅ | ⬜ | ⬜ | — | 56 TCs; product-wise + summary reports, role gate, 5 open discrepancies flagged |
| 17 | ✅ | ⬜ | ⬜ | — | 70 TCs — dispatch/sample/ecommerce reports + CSV exports |
| 18 | ✅ | ⬜ | ⬜ | — | 44 TCs — scan, traceability, GENERATED auto-activate, timeline |
| 19 | ✅ | ⬜ | ⬜ | — | 45 TCs — inventory transactions, audit logs, cross-module integrity |
| 20 | ✅ | ⬜ | ⬜ | — | 86 TCs — pagination, input bounds, concurrent ops, auth edge, perf smoke |
| 21 | ✅ | ⬜ | ⬜ | — | 106 TCs — mobile foundation (auth, tabs, Menu, Settings); 21 Maestro flows; 2 `[?]` flags |
| 22 | ✅ | ⬜ | ⬜ | — | 94 TCs — mobile inventory M5 (Child Box w/ MRP, Master Carton tab); 19 Maestro flows; 4 `[?]` flags |
| 23 | ✅ | ⬜ | ⬜ | — | 122 TCs — Products (30), Child Boxes (31), Repack (28), Unpack (16), Storage (17); 15 Maestro flows; 6 `[?]` flags incl. 2 real behavioral gaps (Unpack CREATED, Storage role mismatch) |
| 24 | ⬜ | ⬜ | ⬜ | — | pending — mobile master cartons |
| 25 | ⬜ | ⬜ | ⬜ | — | pending — mobile samples (M2) |
| 26 | ⬜ | ⬜ | ⬜ | — | pending — mobile ecommerce (M3) |
| 27 | ⬜ | ⬜ | ⬜ | — | pending — mobile dispatch (M4) |
| 28 | ⬜ | ⬜ | ⬜ | — | pending — mobile customers + users |
| 29 | ⬜ | ⬜ | ⬜ | — | pending — mobile scan + traceability |
| 30 | ⬜ | ⬜ | ⬜ | — | pending — mobile reports (M6) |
| 31 | ⬜ | ⬜ | ⬜ | — | pending — cross-platform parity |
| 32 | ⬜ | ⬜ | ⬜ | — | pending — mobile edge cases |

Update the Authored ▢ → ✅ on file commit. Update Reviewed ▢ → ✅ when an Opus pass has read through the file. Update Executed and Pass rate after a test run.

The mobile authoring workstream is tracked separately in [`AUTHORING_PROGRESS.md`](AUTHORING_PROGRESS.md) — that file is the resumption marker for sessions 1-13 of mobile coverage.

---

## 9. Out of scope (explicitly)

- **Maestro suite execution.** Phases 21-32 author Maestro flow YAML inline with each E2E TC. The flows are not yet extracted to `mobile/.maestro/<flow>.yaml` files — that's a separate task once authoring completes.
- **Load / stress testing.** Phase 20 includes some concurrency edge cases but is not a load-test plan. If the client wants k6 / Artillery scripts, that's a separate ask.
- **Penetration testing.** Phase 01 covers auth basics + SQL injection sanity; the broader pen-test artefact lives in `docs/security-audit-report.md`.
- **Backup / DR / migration rollback drills.** Operational, not functional — out of suite.

---

## 10. References

- v2 phase files (format reference): `docs/test-cases-v2-phases-1-3.md`, `docs/test-cases-v2-phases-4-6.md`, `docs/test-cases-v2-phases-7-9.md`, `docs/test-cases-v2-phases-10-12.md`, `docs/test-cases-v2-phases-13-14.md`
- Project brief: `docs/project-brief.md`
- Implementation plan: `docs/implementation-plan.md`
- Security audit: `docs/security-audit-report.md`
- Migration plan: `docs/sql-migration-plan.md`
- Progress log: `progress.md` (root)

---

*Authored 2026-04-30 by the Opus orchestration pass. Phase files written by Sonnet sub-agents per the dispatch plan in `progress.md`.*
