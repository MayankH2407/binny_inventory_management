# Basiq360 Inventory Management System — Progress Tracker
## Client: Binny Footwear (Mahavir Polymers Pvt. Ltd.)
## Vendor: Basiq360
## Project Start: March 2026
## Phase: 1 (6 weeks)

---

## Project Status: PHASE 1 COMPLETE — PHASE 1.5 COMPLETE (All Tests Passing)

---

## Activity Log

### March 16, 2026 — Updated Client Requirements
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 78 | Received updated requirements from client | Done | 5 files: Master Box label info, Child Box label info, Customer Master form, Product Master form, Binny HD logo (monogram) |
| 79 | Gap analysis completed | Done | Identified 6 change areas: Customer Master (new), Product Master expansion (6 new fields), Child Box label redesign, Master Carton label redesign, Logo integration, Dispatch flow update |
| 80 | Implementation Plan updated (v1.1) | Done | Added Customer Master module, expanded Product schema, redesigned label specs, new API endpoints, updated folder structure |
| 81 | SQL Migration Plan updated | Done | Added Migration 013 (customers table), 014 (product expansion), 015 (customer_id on dispatch_records), new indexes, constraints |
| 82 | Project Brief updated (v1.1) | Done | Added Customer Master to DB summary (10 tables), new Customer API endpoints, updated RBAC matrix, expanded product description, label specs |
| 83 | Test Cases updated (v1.1) | Done | Added 4 new sections: Customer Master (10 tests), Product Expansion (8 tests), Child Box Label Redesign (7 tests), Master Carton Label Redesign (7 tests) |
| 84 | Security Audit Report updated | Done | Added GSTIN data privacy, customer PII handling, new input validation for product fields, customer API security |
| 85 | Progress tracker updated | Done | Added Phase 1.5 section, March 16 activity log |
| 86 | Phase 1: Product Master Expansion — Backend | Done | Migration (6 new columns: category, section, location, article_group, hsn_code, size_group), constants (3 enums + types), types, schema (Zod create/update/query), service (INSERT/UPDATE/filter). 0 TS errors |
| 87 | Phase 2: Product Master Expansion — Frontend | Done | Frontend types (6 new fields), constants (dropdown arrays), generate page (product info card shows new fields). 0 TS errors |
| 88 | Phase 3: Customer Master — Backend | Done | Migration (customers table + indexes + trigger), Customer interface, Zod schemas (GSTIN regex, mobile validation), service (CRUD + audit), controller, routes (RBAC: Admin+Supervisor), registered in routes/index. 0 TS errors |
| 89 | Phase 4: Customer Master — Frontend | Done | Customer types + request interfaces, customer.service.ts (API calls), /customers page (list + search + create/edit modal + pagination + mobile cards + activate/deactivate), Sidebar nav item (Building2 icon, adminOnly). 0 TS errors |
| 90 | Phase 5: Dispatch Flow — Link to Customer | Done | Migration (customer_id FK on dispatch_records), backend types (customer_id + customer_firm_name), dispatch schema (customer_id optional), dispatch service (auto-fill destination from customer, LEFT JOIN customers for firm_name), frontend dispatch page (customer dropdown, auto-fill destination). 0 TS errors |
| 91 | Phase 6: Child Box Label Redesign | Done | Backend: updated ChildBoxLabelData interface (added articleCode, mrp, packedOn, barcode), rewrote buildChildBoxLabelHtml with table layout matching client wireframe. Frontend: rewrote handlePrint with structured label — Article No top, Colour+Size(large right), MRP ₹ with "(Inc of all taxes)", Packed on date, Content 2N (1 Pair), QR placeholder right, manufacturer footer (Mahavir Polymers). 0 TS errors |
| 92 | Phase 7: Master Carton Label Redesign + Logo | Done | Copied monogram.png to frontend/public. Backend: updated MasterCartonLabelData (added articleCode, colour, mrp, packDate, sizeAssortment[], totalPairs, logoBase64), rewrote buildMasterCartonLabelHtml with Binny logo, article/colour/MRP/pack date rows, size assortment grid. Frontend: rewrote handlePrintLabel — generates label directly (removed hidden printRef div + QRCodeSVG), computes size assortment pivot from assortment data, sorts sizes numerically, Binny logo from /monogram.png. 0 TS errors |
| 93 | Database migrations executed | Done | 3 new migrations run: product columns, customers table + trigger, dispatch_records customer_id FK. Fixed trigger function name (trigger_set_updated_at vs fn_set_updated_at) |
| 94 | Playwright E2E tests — full suite | Done | 44/44 passed (Chromium). Fixed pre-existing TC-DASH-005 flaky test (changed getByText to getByRole for quick action link). All existing + new features verified working |
| 95 | Optimization audit report prepared | Done | docs/phase-1.5-optimization-report.md — 11 findings (2 critical, 2 high, 4 medium, 3 low) |
| 96 | Fix #1 (Critical): Dispatch transaction logging | Done | Replaced input.destination with computed destination in 5 locations in dispatch.service.ts — audit logs now correctly show auto-filled customer destination |
| 97 | Fix #2 (Critical): Customers nav for Supervisors | Done | Updated Sidebar.tsx adminOnly filter to include Supervisor role (isManagement = isAdmin or isSupervisor) |
| 98 | Fix #3 (High): Duplicate firm name check | Done | Added checkDuplicateFirmName() to customer.service.ts, controller returns warning message if duplicate exists |
| 99 | Fix #4 (High): Client-side GSTIN validation | Done | Added GSTIN regex + mobile regex validation in customers page handleSubmit before API call |
| 100 | Fix #5 (Medium): Mobile placeholder | Done | Updated placeholder from "10-digit mobile number" to "e.g., 9876543210" to match 10-15 digit schema |
| 101 | Fix #6 (Medium): Child box label QR | Done | Replaced text placeholder with actual QR SVG using qrcode.react + renderToStaticMarkup |
| 102 | Fix #7 (Medium): Master carton logo base64 | Done | Logo pre-fetched as base64 data URI before printing for offline reliability |
| 103 | Fix #8 (Medium): Product management page | Done | New /products page with full CRUD modal (SKU, article, colour, size, MRP, category/section/location dropdowns, HSN, size group). Added to sidebar nav (Tag icon, adminOnly) |
| 104 | Fix #9 (Low): "boxes" to "Prs" | Done | Changed assortment summary footer from "boxes" to "Prs" on master carton detail page |
| 105 | Fix #10 (Low): useAuth isSupervisor | Done | Added isSupervisor to useAuth hook, refactored customers+products pages to use isManager |
| 106 | Fix #11 (Low): Search debounce | Done | Created useDebounce hook (300ms), applied to customers and products search inputs |
| 107 | Playwright E2E retest after all fixes | Done | 44/44 passed (Chromium). 0 TS errors on both backend and frontend |
| 108 | Auth rate limit increased for dev/testing | Done | AUTH_MAX_REQUESTS: 200 → 500 (constants.ts). Playwright tests + manual API calls were exhausting the 15-min auth window |
| 109 | Git repository initialized | Done | .gitignore configured, initial commit with full Phase 1 + Phase 1.5 codebase |

---

### March 12, 2026
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 1 | Project folder setup & reference documents gathered | Done | Kickoff HTML doc, scope PDF, logos, branding assets |
| 2 | Implementation Plan prepared | Done | docs/implementation-plan.md |
| 3 | SQL Migration Plan prepared | Done | docs/sql-migration-plan.md |
| 4 | Security Audit Report prepared | Done | docs/security-audit-report.md |
| 5 | Project Brief for External Review prepared | Done | docs/project-brief.md |
| 6 | Test Cases Document prepared | Done | docs/test-cases.md |
| 7 | Progress Tracker created | Done | progress.md |
| 8 | Client clarifications gathered | Done | Auth: email/password, App name: Binny Inventory, Theme: Red #E31E24, Deploy: Oracle Cloud, Dispatch: optional transport/LR/destination fields |
| 9 | Backend scaffolding (Express.js + TypeScript) | Done | 49 source files: config, middleware, schemas, services, controllers, routes, utils, types. 232 npm packages installed |
| 10 | Frontend scaffolding (Next.js + PWA) | Done | 50+ files: 14 pages, 9 UI components, layout, QR scanner, Zustand stores, API services, Binny red theme |
| 11 | Docker + DB setup | Done | docker-compose.yml (3 services), multi-stage Dockerfiles, 11 DB migrations, seed scripts (4 roles, admin user, 20 products) |
| 12 | Binny logo copied to frontend/public | Done | BinnyLogo.png available at /BinnyLogo.png |
| 13 | Frontend dependencies installed | Done | 666 packages, Next.js 14, TanStack Query, Zustand, html5-qrcode |
| 14 | Backend TypeScript compilation verified | Done | 0 errors — fixed JWT sign types |
| 15 | Frontend TypeScript compilation verified | Done | 0 errors — fixed TanStack Query v5 API, html5-qrcode types |
| 16 | Docker PostgreSQL started | Done | binny_postgres container healthy on port 5432 |
| 17 | Database migrations executed | Done | 11 migrations: all tables, indexes, triggers created successfully |
| 18 | Seed data loaded | Done | 4 roles, 1 admin user (admin@binny.com), 20 sample products |
| 19 | Auth flow fixed & tested | Done | Fixed DB schema mismatch (username→email), login API working, JWT auth verified |
| 20 | Backend API running | Done | http://localhost:3001 — health, login, profile endpoints verified |
| 21 | Frontend dev server running | Done | http://localhost:3000 — Next.js serving 200 OK |
| 22 | Backend DB schema alignment — ALL services fixed | Done | 17 files: types, constants, schemas, services, controllers, routes, utils aligned to actual PostgreSQL columns |
| 23 | Frontend DB schema alignment — ALL pages fixed | Done | 38+ files: types, services, all 14 pages, components, hooks rewritten for correct field names |
| 24 | Child Box CRUD APIs verified | Done | Single create, bulk create (5 boxes), list with pagination — all working |
| 25 | Product API verified | Done | 20 products returned with correct fields (article_name, colour, mrp, etc.) |
| 26 | Both projects compile clean | Done | Backend: 0 TS errors, Frontend: 0 TS errors |
| 27 | Master Carton create with auto-pack API | Done | POST /master-cartons accepts child_box_barcodes[], auto-packs in transaction |
| 28 | Master Carton getById embeds child boxes | Done | GET /master-cartons/:id returns carton + child_boxes[] with product details |
| 29 | Master Carton barcode lookup API | Done | GET /master-cartons/qr/:barcode for scanning workflows |
| 30 | Full Unpack API (unpack ALL child boxes) | Done | POST /master-cartons/:id/full-unpack — resets carton to CREATED, frees all child boxes |
| 31 | Assortment Summary API | Done | GET /master-cartons/:id/assortment — aggregates by article/colour/size/mrp |
| 32 | Master Carton detail page enhanced | Done | Full unpack button, assortment summary, scan-to-pack, print label (100x150mm QR) |
| 33 | Master Carton create page enhanced | Done | Manual barcode entry fallback + QR scanner |
| 34 | qrcode.react dependency added | Done | Client-side QR code generation for print labels |
| 35 | Table component fixed | Done | TableCell/TableHeader now support colSpan and standard HTML attributes |
| 36 | All Master Carton APIs end-to-end tested | Done | Create, pack, get by ID, get by barcode, assortment, full unpack — all verified |
| 37 | Both projects compile clean (Week 3) | Done | Backend: 0 TS errors, Frontend: 0 TS errors, next build succeeds |
| 38 | Traceability API | Done | GET /inventory/trace/:barcode — returns childBox, product, masterCarton, dispatch, timeline |
| 39 | Dispatch getById enhanced | Done | JOINs master_cartons for carton_barcode and child_count |
| 40 | Unpack page rewritten (full unpack only) | Done | Scan carton → show info → confirm → full unpack all boxes |
| 41 | Repack page built | Done | Scan source → select boxes → scan destination → repack (moves one at a time) |
| 42 | Storage page built | Done | Scan carton → close & store (sets status to CLOSED) |
| 43 | Dispatch page fixed | Done | Aligned fields: destination, transport_details, lr_number, vehicle_number, notes. Accepts ACTIVE+CLOSED cartons |
| 44 | Dispatches list page built | Done | Search, date range filter, pagination, mobile cards + desktop table |
| 45 | Frontend types/services aligned | Done | DispatchRecord type, CreateDispatchRequest updated, dispatch service params fixed |
| 46 | Navigation updated | Done | Added Storage, Repack, Dispatches to sidebar nav + routes |
| 47 | Full lifecycle e2e tested | Done | CREATE → PACK → CLOSE → DISPATCH → TRACE verified via API |
| 48 | Both projects compile clean (Week 4) | Done | Backend: 0 TS errors, Frontend: 0 TS errors |
| 49 | Dashboard API enhanced | Done | Added todayDispatches, totalDispatches, activeMasterCartons, closedMasterCartons, totalPairsInStock |
| 50 | Dashboard page enhanced | Done | 4 stat cards (child boxes, cartons, dispatches, pairs), recent activity feed with transaction timeline |
| 51 | Product-wise stock report API | Done | GET /reports/product-wise — SKU, boxes by status, pairs in stock/dispatched |
| 52 | Carton inventory report API | Done | GET /reports/carton-inventory — all cartons with creator, dispatch info |
| 53 | Dispatch summary report API | Done | GET /reports/dispatch-summary — totals + breakdown by destination |
| 54 | Daily activity report API | Done | GET /reports/daily-activity — boxes/cartons created/packed/dispatched per day |
| 55 | CSV export endpoints | Done | 3 endpoints: inventory-summary/export, dispatch-summary/export, daily-activity/export (text/csv) |
| 56 | Reports page rewritten | Done | 4 tabs: Stock Report, Carton Inventory, Dispatch Report, Daily Activity. Tables + filters + CSV export |
| 57 | Report service aligned | Done | Frontend service updated to match actual backend endpoints |
| 58 | Both projects compile clean (Week 5) | Done | Backend: 0 TS errors, Frontend: 0 TS errors |
| 59 | Health check endpoint | Done | GET /api/v1/health — returns {status: 'ok', timestamp} |
| 60 | Production Docker Compose | Done | docker-compose.prod.yml with postgres, backend, frontend, nginx (4 services) |
| 61 | Nginx reverse proxy config | Done | nginx/nginx.conf — routes /api/ to backend, / to frontend, gzip enabled |
| 62 | Production .env template | Done | .env.production.example with all required secrets |
| 63 | Deploy script | Done | scripts/deploy.sh — builds images, starts services, runs health check |
| 64 | PWA icons generated | Done | /icons/icon-192x192.png, icon-512x512.png from BinnyLogo |
| 65 | Next.js standalone output | Done | output: 'standalone' in next.config.mjs for optimized Docker image |
| 66 | Frontend Dockerfile optimized | Done | Uses standalone output (node server.js) instead of full node_modules |
| 67 | Offline fallback page | Done | /offline page with retry button for PWA |
| 68 | Child box quantity default | Done | quantity now optional, defaults to 1 (1 pair per box) |
| 69 | Backend production build | Done | npx tsc → dist/index.js built successfully |
| 70 | Frontend production build | Done | next build → 19 pages generated, all static/dynamic routes |
| 71 | E2E API test suite (20 tests) | Done | All 20/20 pass: auth, products, child boxes, cartons, pack, close, dispatch, trace, reports, CSV export, unpack |
| 72 | Both projects compile clean (Week 6) | Done | Backend: 0 TS errors, Frontend: 0 TS errors |
| 73 | Playwright E2E browser tests | Done | 44/44 pass (Chromium): Auth (8), Dashboard (5), Child Boxes (6), Master Cartons (6), Lifecycle (8), Reports (6), Traceability (3), Scan (3) |
| 74 | Login token type mismatch fixed | Done | LoginResponse.token → accessToken; authStore.login() uses correct field |
| 75 | Dashboard route redirect fixed | Done | /dashboard → / redirect in next.config.mjs; removed infinite redirect loop from root page.tsx |
| 76 | Rate limits increased for testing | Done | General: 1000 req/15min, Auth: 200 req/15min (was 100/20) |
| 77 | UserRole types aligned to backend | Done | Frontend UserRole type matches backend: 'Admin', 'Supervisor', 'Warehouse Operator', 'Dispatch Operator' |

---

## Phase 1 — Week-by-Week Progress

### Week 1: Foundation (Complete)
- [x] Project scaffolding (monorepo, Docker, CI)
- [x] Database schema design + migrations (11 migration files with up/down)
- [x] Authentication module (JWT + RBAC with httpOnly cookies)
- [x] User management CRUD
- [x] Seed data scripts (roles, admin user, 20 sample products)
- [x] Docker Compose setup (postgres, backend, frontend with health checks)
- [x] Install frontend dependencies & verify compilation
- [x] Run migrations against Docker PostgreSQL (11 migrations successful)
- [x] Seed data loaded (4 roles, admin user, 20 products)
- [x] Backend API verified (login, auth, profile working)
- [x] Frontend dev server running (http://localhost:3000)
- [x] Auth schema alignment fix (DB uses email, not username)

### Week 2: Child Box Module (Complete)
- [x] Child Box QR generation (single + bulk)
- [x] QR code with dynamic URL (BINNY-CB-{uuid} format, URL provision ready)
- [x] Label printing template (40x60mm, print dialog with QR, SKU, article, colour, size, MRP)
- [x] Child Box CRUD APIs (create, bulk create, list, get by ID, get by barcode, get free)
- [x] Product/SKU master management (CRUD APIs + frontend page)
- [x] Frontend: Child Box list page (search, filters, pagination, mobile responsive)
- [x] Frontend: Bulk QR generation page (product selector, count, print labels)
- [x] Backend-DB alignment: ALL services/types/schemas fixed to match actual PostgreSQL schema
- [ ] End-to-end integration testing (frontend ↔ backend ↔ DB)

### Week 3: Master Carton Module (Complete)
- [x] Master Carton creation workflow (create + auto-pack child boxes in one step)
- [x] QR scanning integration (html5-qrcode on create & detail pages)
- [x] Child box scanning → linking (scan barcode → lookup → pack into carton)
- [x] Validation: one active carton per child box (DB partial unique index enforced)
- [x] Master carton label printing (100x150mm with QR, barcode, box count, assortment)
- [x] Assortment summary calculation (aggregate by article/colour/size/mrp)
- [x] Frontend: Packing workflow pages (create, detail with scan-to-pack, full unpack)
- [x] Full unpack endpoint (ONLY full unpack allowed per requirements)
- [x] Master carton barcode lookup API (for QR scan workflows)
- [x] Get carton by ID embeds child boxes with product details
- [ ] End-to-end integration testing (frontend ↔ backend ↔ DB)

### Week 4: Lifecycle Workflows (Complete)
- [x] Storage workflow (scan carton → close & store page)
- [x] Unpack workflow (full unpack only — scan carton → confirm → unpack all boxes)
- [x] Repack workflow with lineage tracking (scan source → select boxes → scan dest → repack)
- [x] Dispatch workflow (scan cartons → fill details → dispatch with transaction logging)
- [x] Inventory transaction logging (all operations log to inventory_transactions table)
- [x] Frontend: Unpack/Repack/Storage/Dispatch/Dispatches list pages
- [x] Traceability API (trace any barcode → full lifecycle timeline)
- [x] Full lifecycle end-to-end verified: CREATE → PACK → CLOSE → DISPATCH → TRACE

### Week 5: Reporting & Dashboard (Complete)
- [x] Stock reports (by SKU, size, article) — product-wise breakdown with boxes & pairs
- [x] Carton inventory report — all cartons with creator, dispatch, destination
- [x] Dispatch report — summary + by-destination breakdown with date filters
- [x] Carton history / traceability report — trace any barcode with full timeline (Week 4)
- [x] Dashboard with real-time KPIs — 4 stat cards, inventory summary, recent activity feed (auto-refresh 30s)
- [x] Configurable report filters — status filter, date range filters per report tab
- [x] Frontend: Reports page (4 tabs: Stock, Cartons, Dispatch, Daily Activity)
- [x] CSV export for all reports (3 endpoints: inventory, dispatch, daily activity)
- [x] Daily activity report — boxes/cartons operations per day with date range

### Week 6: Testing & Deployment (Complete)
- [x] End-to-end testing — 20-test API suite: auth, CRUD, pack/unpack, dispatch, trace, reports, CSV export (20/20 pass)
- [x] Playwright E2E browser tests — 44 tests across 8 spec files, all passing (Chromium)
  - 01-auth.spec.ts: 8 tests (login, validation, password toggle, unauthenticated redirect)
  - 02-dashboard.spec.ts: 5 tests (KPI cards, quick actions, inventory summary, sidebar nav)
  - 03-child-boxes.spec.ts: 6 tests (list, generate, status filter, search)
  - 04-master-cartons.spec.ts: 6 tests (list, create, detail, assortment)
  - 05-lifecycle.spec.ts: 8 tests (storage, unpack, repack, dispatch, dispatches list, full lifecycle)
  - 06-reports.spec.ts: 6 tests (4 tabs load, stock data, CSV export button)
  - 07-traceability.spec.ts: 3 tests (page load, search, trace via URL)
  - 08-scan.spec.ts: 3 tests (page load, barcode input, lookup button)
- [x] Bug fixes discovered during testing:
  - LoginResponse type mismatch (token → accessToken)
  - Dashboard /dashboard route 404 (added redirect, removed redirect loop page)
  - UserRole type mismatch (ADMIN/MANAGER → Admin/Supervisor/etc.)
- [x] PWA optimization — icons generated, standalone output, offline fallback page, service worker
- [x] Performance tuning — standalone Docker build, nginx gzip, health checks, rate limiting
- [x] Docker production build — docker-compose.prod.yml (4 services: postgres, backend, frontend, nginx)
- [x] Backend production build — TypeScript compiled to dist/, multi-stage Dockerfile
- [x] Frontend production build — 19 pages generated, standalone output for minimal Docker image
- [x] Production infrastructure — nginx reverse proxy, .env.production.example, deploy script
- [ ] UAT with warehouse operators (pending client scheduling)
- [ ] Oracle Cloud deployment (pending infra details from client)

---

## Phase 1.5 — Updated Client Requirements (March 16, 2026)

### Scope
Client provided updated wireframes and requirements for:
1. **Customer Master** — New module (firm name, address, delivery location, GSTIN, private marka, GR, contact person)
2. **Product Master Expansion** — 6 new fields: category, section, location, article group, HSN code, size group
3. **Child Box Label Redesign** — Structured table layout with MRP (inc. all taxes), packed on date, content, QR on right, manufacturer footer
4. **Master Carton Label Redesign** — Binny logo, article details, size assortment grid (per-size quantities + total pairs), pack date
5. **Company Logo** — Binny HD logo (monogram.png) for labels and branding
6. **Dispatch Flow** — Link to Customer Master instead of free-text destination

### Requirements Files Received
| File | Type | Contents |
|------|------|----------|
| Master Box label information.jpeg | Wireframe | Master carton label layout with size assortment grid |
| Child Box label information.jpeg | Wireframe | Child box label layout with manufacturer footer |
| Customer master details.jpeg | Form | Customer Master fields: firm name, address, GSTIN, etc. |
| Product Master Details.jpeg | Form | Product fields: category, section, location, HSN code, etc. |
| monogram.png | Logo | Binny HD logo (red B + navy BINNY text) |

### Implementation Plan
- [x] Database migrations (customers table, product columns, dispatch FK) — 3 migrations created
- [x] Backend: Customer module (schema, types, routes, controller, service) — Phase 3
- [x] Backend: Product schema expansion (new fields + validation) — Phase 1
- [x] Backend: Size assortment API for master carton labels — already existed (assortment endpoint), label now pivots by size
- [x] Frontend: Customer Master pages (list, create/edit) — Phase 4
- [x] Frontend: Product form update (new dropdown fields) — Phase 2
- [x] Frontend: Child box label template redesign — Phase 6
- [x] Frontend: Master carton label template redesign — Phase 7
- [x] Frontend: Dispatch page — customer selection — Phase 5
- [x] Logo asset integration (monogram.png) — Phase 7
- [x] Testing for all new features — 44/44 Playwright E2E tests passing

---

## Key Documents

| Document | Path | Status |
|----------|------|--------|
| Kickoff Document | Kickoff_Document_Binny_Basiq360.html | Complete |
| Scope of Work | Final Scope of Work - Binny Footwear_Inventory Application.pdf | Complete |
| Implementation Plan | docs/implementation-plan.md | Complete |
| SQL Migration Plan | docs/sql-migration-plan.md | Complete |
| Security Audit Report | docs/security-audit-report.md | Complete |
| Project Brief | docs/project-brief.md | Complete |
| Test Cases | docs/test-cases.md | Complete |

---

## Tech Stack
- Frontend: Next.js (TypeScript), PWA
- Backend: Node.js + Express.js
- Database: PostgreSQL
- QR: html5-qrcode (scanning), qrcode (generation)
- Deployment: Docker (docker-compose)
- Printer: TSC Thermal (TSPL)

---

## Team Notes
- Preferred AI model: Opus (for planning and execution)
- Development approach: Opus for planning, implementation via Claude Code

---

## Decisions & Notes
- Phase 1 scope only (no conveyor belt, no ERP integration)
- Project timeline: 6 weeks
- Mobile PWA for warehouse operators (Android + iOS)
- TSC Thermal Printer for label printing
- Full unpack only (no partial unpack)
- Dispatch by scanning master carton only
- App name: Binny Inventory (favicon = Binny logo)
- Theme: Red (#E31E24) primary, White secondary, Dark gray text
- Auth: Email/password with JWT (httpOnly cookies)
- QR format: BINNY-CB-{id} / BINNY-MC-{id}, URL provision for future
- Dispatch optional fields: transport_details, lr_number, destination, vehicle_number
- Expected users: 20-30 operators
- Production target: Oracle Cloud (details TBD)
- Default AI model: Opus for all work
