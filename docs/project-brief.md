# Project Brief: Basiq360 Inventory Management System

**Client:** Binny Footwear (Mahavir Polymers Pvt. Ltd.)
**Vendor:** Basiq360
**Document Version:** 1.4
**Date:** June 2026 (Updated June 2 with Phase 6 post-UAT client enhancements — see §4A; April 3 with UAT fixes and Phase 2 UI Enhancement Plan; March 20 with Multi-Size QR; March 16 with Customer Master, Product expansion, Label redesign)
**Classification:** External — For Stakeholder Review

---

## 1. Project Overview

| Field             | Detail                                      |
|-------------------|---------------------------------------------|
| Project Name      | Basiq360 Inventory Management System        |
| Client            | Binny Footwear (Mahavir Polymers Pvt. Ltd.) |
| Vendor            | Basiq360                                    |
| Project Type      | QR-based Inventory Management PWA           |
| Phase             | Phase 1                                     |
| Duration          | 6 weeks                                     |
| Start Date        | March 2026                                  |

---

## 2. Business Context

Binny Footwear operates a vertically integrated factory and warehouse facility covering footwear manufacturing, packing, storage, and dispatch. The current inventory process relies on **manual labelling** — warehouse staff handwrite article name, colour, size, and quantity information directly onto master cartons.

### Core Problem

Master cartons are frequently **unpacked and repacked** during normal warehouse operations (e.g., order fulfillment, quality checks, resorting). The existing process has **no mechanism to record these events**, creating a cascade of operational issues:

- **Inventory mismatches** — recorded stock does not reflect physical stock.
- **Phantom stock** — cartons appear in the system but contain different or fewer items than expected.
- **Dispatch errors** — incorrect items shipped to customers due to unreliable carton contents.
- **No audit trail** — when discrepancies surface, there is no way to trace when or why a carton's contents changed.

These issues lead to financial losses, customer dissatisfaction, and significant time spent on manual reconciliation.

---

## 3. Solution Summary

The Basiq360 Inventory Management System introduces a **QR-based digital tracking layer** that enforces inventory discipline at the physical-event level.

### Two-Level Inventory Hierarchy

| Level                        | Description                                                                                     |
|------------------------------|-------------------------------------------------------------------------------------------------|
| **Child Box (Inner Carton)** | One pair of footwear per box. Each box receives a **permanent QR code** that tracks it through its entire lifecycle — from production to dispatch. |
| **Master Carton (Outer Box)**| A temporary grouping container. Receives a **dynamic QR code** with a defined lifecycle: `CREATED -> ACTIVE -> CLOSED -> DISPATCHED`. |

### Digital Lifecycle Enforcement

The system digitally enforces the complete warehouse workflow:

```
Pack -> Store -> Unpack -> Repack -> Dispatch
```

**Key constraints enforced by the system:**

- Every unpack event is digitally recorded with timestamp, operator, and reason.
- A child box can belong to **only one active master carton** at any given time.
- Full traceability is maintained across the entire chain:

```
child_box -> carton A -> unpacked -> carton B -> dispatched
```

This eliminates phantom stock by ensuring the digital record always matches the physical state of the warehouse.

---

## 4. Key Features — Phase 1

### QR and Scanning
- QR label generation and bulk printing for child boxes (single-size and multi-size batch generation)
- Master carton creation via mobile QR scanning
- Real-time inventory updates triggered on every scan event

### Master Data Management
- **Product Master** with extended attributes: category (Gents/Ladies/Boys/Girls), section (Hawaii/PU/EVA/Fabrication/Canvas/PVC/Sports Shoes), manufacturing location (VKIA/MIA/F540), article group, HSN code for GST, and size group
- **Customer Master** with firm details, GSTIN, delivery location, private marka (brand mark), GR number, and contact person information
- Dispatch workflows linked to Customer Master records

### Inventory Workflows
- Full **unpack workflow** with automatic inventory reconciliation
- **Repack workflow** with lineage tracking (records which carton each child box came from)
- **Dispatch scanning** with customer selection, stock movement recording, and carton status enforcement

### Label Printing
- **Child Box Label** (40×60mm): Structured layout with article no., colour, size (large), MRP (inc. all taxes), packed date, content description, QR code, and manufacturer footer (Mahavir Polymers Pvt Ltd address & customer care)
- **Master Carton Label** (100×150mm): Company logo, article details, and **size assortment grid** showing per-size quantities and total pairs
- Binny HD logo (monogram) integrated on master carton labels

### Access and Security
- Role-based access control with four defined roles: Admin, Supervisor, Warehouse Operator, Dispatch Operator
- JWT-based authentication with session management

### Reporting
- Configurable reports: stock by SKU, size, article; carton inventory; dispatch records; history
- Exportable data for external analysis

### Platform
- Mobile-first Progressive Web Application (PWA) — works on Android and iOS
- Thermal label printing support (TSC printer compatible, TSPL command language)

---

## 4A. Phase 6 — Post-UAT Client Enhancements (May–August 2026)

Following Phase 1 go-live, the client requested a series of enhancements, tracked as numbered modifications. All items below are now live in production unless noted.

| #  | Enhancement                              | Status                          |
|----|------------------------------------------|---------------------------------|
| 1  | Child-box label reprint                  | **Live** (production + test)    |
| 2  | 7-level inventory drill-down             | **Live**                        |
| 3  | Role Manager (configurable RBAC)         | **Live**                        |
| 4  | Legacy (pre-go-live) carton onboarding   | **Live**                        |
| 5  | Legacy carton unpack / repack            | **Live**                        |
| —  | Returns management (new module)          | **Live** (deployed 2026-08-20)  |
| —  | Samples module redesign (partial pull, scoped dispatch) | **Live** (deployed 2026-08-20) |
| —  | E-commerce module redesign (scan-to-pool model) | **Live** (deployed 2026-08-20) |
| —  | Inventory size-group fix (multi-size batch generation) | **Live** (deployed 2026-08-20) |
| —  | Child-box label dimension A/B test (two variants under live comparison) | In progress — client has not yet picked a winner |

### Mod #1 — Child-Box Label Reprint
Operators can reprint child-box QR labels after generation — both **per-row** and via **multi-select bulk** selection — mirroring the existing master-carton reprint. The label template is byte-identical to the original (tuned for the TSC thermal printer); reprints correctly use each box's original packed date rather than today's.

### Mod #2 — 7-Level Inventory Drill-Down
The inventory view is now a hierarchical card-grid drill-down across seven levels: **Section → Category → Article Group → Article Name → Colour → Size Group → Master-Carton leaf**. Counts are expressed in **pieces (pairs)** at every level. "In-warehouse" stock excludes dispatched cartons. Loose stock (free / unpacked child boxes) rolls up into the upper levels and is also surfaced separately at the leaf. The leaf lists per-master-carton rows with a per-size breakdown and supports search, filtering, and CSV export. Backed by a new aggregation endpoint `GET /api/v1/inventory/breakdown`; no product schema changes were required.

### Mod #3 — Role Manager (Configurable RBAC)
Completes and exposes the permission layer. Administrators can now define, per role, which modules a user may **view / add / edit / delete** — and, for stage-aware actions, **up to which lifecycle stage**. A new normalised `role_permissions` table (role → `module:action`, with an optional `max_stage` constraint) backs a new `/admin/roles` admin UI featuring a permission-matrix editor. The **Admin** role is a protected super-admin (cannot be edited or deleted, preventing lockout); the default roles' names and existence are locked, but their permissions are editable. All API routes are permission-gated (`authorizePermission('module:action')`), and the UI hides controls a user lacks permission for. Endpoints: `GET/POST/PATCH/DELETE /api/v1/roles`, `GET /api/v1/permissions`.

### Mod #4 — Legacy (Pre-Go-Live) Carton Onboarding
Allows onboarding finished-goods stock that was packed and sealed **before** go-live and therefore carries no QR labels. Administrators upload a CSV (`Section, Category, Article Group (Size Group), Master Carton Quantity`); the system generates that many opaque master-carton records, each with a unique barcode. Legacy stock is **count-level, not contents-level** — it has no colour / MRP / per-piece data, so it is tracked as a distinct "carton" measure and surfaced in the drill-down (Section → Category → Article Group) as a separate amber **"legacy cartons"** indicator that never mixes with piece counts. Re-upload is additive (with a warning). The Master Cartons list hides legacy cartons behind a **"Show legacy"** toggle. Endpoint: `POST /api/v1/master-cartons/legacy-upload` (with a downloadable sample CSV); new `master_cartons` columns: `is_legacy`, `section`, `category`, `article_group`, `size_group`.

### Mod #5 — Legacy Carton Unpack / Repack
Provides the path to bring legacy (opaque) stock into full per-box tracking. An **"Open for Repacking"** action converts a legacy carton into a normal, empty, trackable carton (keeping its barcode) — **no child boxes are auto-created**, because none ever existed. The operator then generates the real child-box labels, applies them to the physical boxes, scans them back into the same carton via the existing pack flow, and closes it. From that point the carton is counted as ordinary tracked pieces and no longer as a legacy carton. Endpoint: `POST /api/v1/master-cartons/:id/open-legacy`.

### Mod — Returns Management (July 2026, live August 2026)
Introduces a **Returns** capability that brings physically-returned stock back into sellable inventory, via two entry points. The **Returns module** works by **blind scan-in**: an operator scans an already-dispatched child-box QR or master-carton barcode, the system looks up where it was shipped from and its details, and on confirmation adds it back to stock with a return entry. Alternatively, from a **dispatch's detail page** staff can return **against that specific dispatch** — its items are listed with checkboxes so they choose exactly which cartons/boxes are coming back (partial returns allowed). An optional **"Reason for return"** remark can be recorded either way. Both **whole master cartons** and **loose child boxes** can be returned, from regular master-carton and e-commerce dispatches (sample returns are not covered in this version). Returned stock goes **straight back to sellable** — a returned loose box becomes free stock, and a returned carton becomes a closed, sellable carton with its boxes packed again — and immediately reappears in inventory counts. This first version tracks the **physical movement only** (no return value / credit notes and no approval step). Only items that are currently dispatched can be returned, and the system blocks returning something twice. A date-range **CSV returns report** (itemized by article/colour/size, with reason and origin dispatch) is available. The **Dispatches list** also surfaces a return status (none / partial / full) per record, with a filter. A new **Returns** permission (view / create) is configurable in the Role Manager — not granted to any role by default at launch. Endpoints under `/api/v1/returns`.

### Mod — Samples Module Redesign (August 2026)
The original Samples workflow was scan-based and staff found it hard to follow, since real-world usage is rarely a whole carton — usually a single piece or a few pairs. The redesign keeps the underlying mechanics (per-foot sample tracking, whole-carton allocation) but changes the workflow: every scan defaults to a full pair with a per-item toggle to send one shoe only; scanning a whole carton is now an optional, de-emphasised path; and — new — specific boxes can be **pulled out of a carton allocation** individually without disturbing the rest of the carton. Partial dispatches now release any un-selected items back to general stock automatically. Sample lifecycle stages show friendly labels (Empty / Open / Ready to dispatch / Sent) instead of raw database status codes.

### Mod — E-commerce Module Redesign (August 2026)
Replaces the previous "create a named e-commerce record, then scan items into it" workflow with a simpler model: staff scan any available master carton or child box directly into an **E-commerce Area** pool — no naming or marketplace details needed at scan-in time. Marketplace, order reference, listing SKU, and order date are captured later, at the point of dispatch, on the Dispatch module's E-commerce tab (mirroring how master-carton dispatches already work). A pooled carton can be "Unpacked" into individually-dispatchable loose boxes that remain committed to e-commerce. Existing e-commerce records from before the redesign are preserved and remain visible read-only under a History tab; their boxes automatically appear in the new pool tagged with their original record reference.

### Mod — Inventory Size-Group Display Fix (August 2026)
The "Multi-size batch generation" bulk product-creation tool (used to create many size variants of one article/colour in one action) was not recording the size range on the products it created, so the Inventory drill-down's size-group level showed one combined total instead of separate entries per size batch (e.g. showing one "42 cartons" figure instead of a "6–9" and a "7–10" breakdown). Fixed going forward; existing products created before the fix are not retroactively updated.

---

## 5. Technical Architecture

| Component          | Technology                                    |
|--------------------|-----------------------------------------------|
| Frontend           | Next.js (TypeScript), PWA-enabled             |
| Backend            | Node.js + Express.js                          |
| Database           | PostgreSQL                                    |
| QR Scanning        | html5-qrcode library                          |
| QR Generation      | qrcode npm library                            |
| Deployment         | Dockerized (docker-compose)                   |
| Authentication     | JWT with role-based access control             |
| Architecture       | Monorepo (frontend + backend + shared types)  |

### Architecture Diagram (Logical)

```
+---------------------------------------------------+
|                  Mobile Device                     |
|  +-------------------------------------------------+
|  |   Next.js PWA (TypeScript)                     |
|  |   - QR Scanner (html5-qrcode)                  |
|  |   - Offline Queue (Service Worker)              |
|  |   - Thermal Print Templates (TSPL)              |
|  +------------------------+------------------------+
+---------------------------+------------------------+
                            | HTTPS / REST
+---------------------------+------------------------+
|  Docker Host              |                        |
|  +------------------------+------------------------+
|  |   Express.js API Server (Node.js)               |
|  |   - JWT Auth Middleware                          |
|  |   - Role-Based Access Control                   |
|  |   - Business Logic & Validation                 |
|  +------------------------+------------------------+
|                           |                        |
|  +------------------------+------------------------+
|  |   PostgreSQL                                    |
|  |   - Unique Constraints & Foreign Keys           |
|  |   - Atomic Transactions                         |
|  |   - Audit Log Triggers                          |
|  +--------------------------------------------------+
+------------------------------------------------------+
```

---

## 6. Database Design Summary

The data model consists of **10 tables** designed to enforce inventory integrity at the database level.

| Table                    | Purpose                                                                                   |
|--------------------------|-------------------------------------------------------------------------------------------|
| `users`                  | System users with hashed credentials and role assignments.                                |
| `roles`                  | Defined roles (Admin, Supervisor, Warehouse Operator, Dispatch Operator) and permissions.  |
| `products`               | Product catalog — article, colour, size, SKU, category, section, location, HSN code, size group, and metadata. |
| `customers`              | **NEW** — Customer Master with firm name, address, GSTIN, delivery location, private marka, GR, and contact details. |
| `child_boxes`            | Individual footwear boxes. Each row represents one pair with a unique, permanent QR code.  |
| `master_cartons`         | Outer cartons with lifecycle status tracking (`CREATED`, `ACTIVE`, `CLOSED`, `DISPATCHED`).|
| `carton_child_mapping`   | Many-to-one mapping of child boxes to master cartons. Enforces single-active-carton rule.  |
| `inventory_transactions` | Immutable log of every inventory event (pack, unpack, repack, dispatch) with timestamps.   |
| `dispatch_records`       | Dispatch records linked to Customer Master, including destination, vehicle, LR number, and carton manifest. |
| `audit_logs`             | System-wide audit trail capturing all state changes, user actions, and timestamps.         |

**Key database-level constraints:**

- A child box can only be mapped to one active master carton (unique constraint on active mappings).
- Master carton status transitions are enforced (e.g., only `CLOSED` cartons can be dispatched).
- All inventory transactions are immutable (append-only table).

---

## 7. API Design Summary

All endpoints are RESTful and require JWT authentication unless otherwise noted.

### Authentication

| Method | Endpoint             | Description                     |
|--------|----------------------|---------------------------------|
| POST   | `/api/auth/login`    | Authenticate user, return JWT   |
| POST   | `/api/auth/refresh`  | Refresh an expiring JWT token   |

### Customers (NEW)

| Method | Endpoint                             | Description                                  |
|--------|--------------------------------------|----------------------------------------------|
| GET    | `/api/customers`                     | List customers with search/filter            |
| POST   | `/api/customers`                     | Create a new customer record                 |
| GET    | `/api/customers/:id`                 | Get customer details                         |
| PUT    | `/api/customers/:id`                 | Update customer details                      |
| DELETE | `/api/customers/:id`                 | Soft-delete (deactivate) customer            |

### Child Boxes

| Method | Endpoint                             | Description                                  |
|--------|--------------------------------------|----------------------------------------------|
| POST   | `/api/child-boxes/generate`          | Generate QR codes for a batch of child boxes (single size) |
| POST   | `/api/child-boxes/bulk-multi-size`   | Generate QR codes across multiple sizes in one transaction |
| GET    | `/api/child-boxes/:id`               | Get child box details and current location   |
| GET    | `/api/child-boxes/:id/traceability`  | Full lifecycle history of a child box        |

### Master Cartons

| Method | Endpoint                              | Description                                  |
|--------|---------------------------------------|----------------------------------------------|
| POST   | `/api/master-cartons`                 | Create a new master carton                   |
| GET    | `/api/master-cartons/:id`             | Get carton details, contents, and status     |
| POST   | `/api/master-cartons/:id/unpack`      | Unpack a carton (release all child boxes)    |
| POST   | `/api/master-cartons/:id/dispatch`    | Mark carton as dispatched                    |

### Inventory

| Method | Endpoint                              | Description                                  |
|--------|---------------------------------------|----------------------------------------------|
| GET    | `/api/inventory`                      | Query inventory with filters (SKU, size, article, location) |

### Reports

| Method | Endpoint                              | Description                                  |
|--------|---------------------------------------|----------------------------------------------|
| GET    | `/api/reports`                        | Configurable reports with parameter-based filtering |

### Audit Logs

| Method | Endpoint                              | Description                                  |
|--------|---------------------------------------|----------------------------------------------|
| GET    | `/api/audit-logs`                     | Retrieve audit logs with date range and user filters |

---

## 8. User Roles and Access Matrix

| Capability                    | Admin | Supervisor | Warehouse Operator | Dispatch Operator |
|-------------------------------|:-----:|:----------:|:------------------:|:-----------------:|
| User Management               |  Yes  |     No     |         No         |        No         |
| Customer Management (NEW)     |  Yes  |    Yes     |         No         |        No         |
| Product Management            |  Yes  |    Yes     |         No         |        No         |
| QR Label Generation           |  Yes  |    Yes     |        Yes         |        No         |
| Create Master Carton          |  Yes  |    Yes     |        Yes         |        No         |
| Pack (Scan Child into Carton) |  Yes  |    Yes     |        Yes         |        No         |
| Unpack Master Carton          |  Yes  |    Yes     |        Yes         |        No         |
| Repack Child Boxes            |  Yes  |    Yes     |        Yes         |        No         |
| Dispatch Carton               |  Yes  |    Yes     |         No         |       Yes         |
| View Inventory                |  Yes  |    Yes     |        Yes         |       Yes         |
| View Reports                  |  Yes  |    Yes     |         No         |        No         |
| View Audit Logs               |  Yes  |     No     |         No         |        No         |
| System Configuration          |  Yes  |     No     |         No         |        No         |

---

## 9. Non-Functional Requirements

| Requirement              | Target                                                              |
|--------------------------|---------------------------------------------------------------------|
| QR Scan Response Time    | Less than 1 second from scan to confirmation                       |
| UI Responsiveness        | Mobile-first responsive design; optimized for 5-7 inch screens     |
| Installability           | PWA installable on Android and iOS devices via browser              |
| Offline Support          | Scan queue buffers operations during network loss; syncs on reconnect |
| Audit Trail              | Every state change recorded with user, timestamp, and previous state |
| Deployment               | Docker-ready; single `docker-compose up` for full stack deployment  |
| Data Integrity           | Database-level constraints prevent invalid state transitions        |
| Concurrent Users         | Support for up to 20 simultaneous warehouse operators               |

---

## 10. Out of Scope — Phase 1

The following capabilities are explicitly excluded from Phase 1 and may be considered for future phases:

- Conveyor belt integration and automated scanning
- Barcode and fixed scanner hardware support
- ERP system integration (e.g., Tally, SAP)
- Advanced analytics, dashboards, or machine learning
- Multi-warehouse or multi-location support
- Customer-facing portals or tracking
- Automated reorder or procurement workflows

---

## 11. Success Criteria

Phase 1 will be considered successful when the following conditions are met:

| #  | Criterion                                                                                      | Verification Method              |
|----|------------------------------------------------------------------------------------------------|----------------------------------|
| 1  | A child box cannot belong to multiple active master cartons simultaneously.                    | Database constraint testing      |
| 2  | An unpacked master carton (status not CLOSED) cannot be dispatched.                            | API validation + DB constraint   |
| 3  | A dispatched master carton cannot be unpacked or modified.                                     | Status transition enforcement    |
| 4  | Real-time inventory counts reconcile automatically after every pack, unpack, and repack event. | Inventory reconciliation testing |
| 5  | Complete traceability is available for every child box from creation through dispatch.          | Traceability API verification    |
| 6  | All user actions are recorded in the audit log with timestamp and operator identity.            | Audit log completeness review    |
| 7  | QR scanning works reliably on standard Android and iOS devices in warehouse conditions.         | Field testing on target devices  |

---

## 12. Risks and Mitigations

| Risk                                 | Likelihood | Impact | Mitigation Strategy                                                         |
|--------------------------------------|:----------:|:------:|-----------------------------------------------------------------------------|
| Network reliability in warehouse     |    High    |  High  | PWA offline queue buffers scan events; automatic sync on reconnect.         |
| User adoption resistance             |   Medium   |  High  | Simple mobile-first UI requiring minimal training; phased rollout plan.     |
| Printer compatibility issues         |   Medium   | Medium | Browser-based TSPL template generation; tested against TSC printer models.  |
| Data integrity during concurrent ops |    Low     |  High  | Database-level constraints and atomic transactions prevent race conditions.  |
| QR code readability (damage/wear)    |   Medium   | Medium | Durable label stock; system allows reprinting of child box QR labels.       |
| Scope creep                          |   Medium   | Medium | Strict Phase 1 boundary defined; change requests tracked separately.        |

---

## 13. Timeline Summary

| Week   | Focus Area                               | Key Deliverables                                                     |
|--------|------------------------------------------|----------------------------------------------------------------------|
| Week 1 | Project Setup and Database               | Repository setup, Docker configuration, database schema, seed data   |
| Week 2 | Authentication and Core APIs             | JWT auth, user management, product CRUD, role-based middleware       |
| Week 3 | QR Generation and Child Box Workflows    | QR label generation, bulk printing, child box scanning APIs          |
| Week 4 | Master Carton and Inventory Workflows    | Carton creation, pack/unpack/repack workflows, inventory tracking    |
| Week 5 | Dispatch, Reports and Mobile UI          | Dispatch workflow, configurable reports, responsive PWA interface    |
| Week 6 | Testing, Optimization and Deployment     | End-to-end testing, performance tuning, production deployment, handover |

---

## 14. Deliverables

### Software Deliverables

1. **Basiq360 Inventory Management PWA** — fully functional web application with QR scanning, inventory management, and dispatch workflows.
2. **REST API Server** — documented API backend with authentication, authorization, and business logic.
3. **PostgreSQL Database** — schema with constraints, indexes, and seed data.
4. **Docker Deployment Package** — `docker-compose.yml` and associated configuration for single-command deployment.

### Documentation Deliverables

5. **API Documentation** — complete endpoint reference with request/response schemas.
6. **Database Schema Documentation** — entity-relationship diagram and table definitions.
7. **Deployment Guide** — step-by-step instructions for production deployment.
8. **User Guide** — role-specific operational documentation for warehouse staff.

### Support Deliverables

9. **QR Label Templates** — pre-configured TSPL templates for TSC thermal printers.
10. **Training Session** — on-site or remote training for all user roles.
11. **Post-Deployment Support** — bug fixes and minor adjustments for 2 weeks after go-live.

---

## Document Control

| Version | Date       | Author   | Notes           |
|---------|------------|----------|-----------------|
| 1.0     | March 2026 | Basiq360 | Initial release |
| 1.1     | 16-Mar-2026 | Basiq360 | Added Customer Master module, expanded Product Master (category/section/location/HSN/size group), redesigned child box & master carton labels per client wireframes, Binny HD logo integration |
| 1.2     | 20-Mar-2026 | Basiq360 | Multi-Size QR Batch Generation: new bulk-multi-size endpoint, product sizes endpoint, generate page rewrite with per-size quantity inputs |
| 1.3     | 03-Apr-2026 | Basiq360 | UAT bug fixes (button visibility, print labels, searchable product dropdown, customer-centric dispatch list). Phase 2 UI Enhancement Plan: design system modernization (brand-tinted shadows, CSS animations, skeleton loaders), component polish (gradient buttons, interactive cards, glass-effect layouts), page-specific enhancements (dashboard welcome banner, list page skeletons, form sticky submit), PWA improvements (branded splash, offline page, toast accent borders). All frontend-only, no new dependencies. |
| 1.4     | 02-Jun-2026 | Basiq360 | Phase 6 post-UAT client enhancements documented (§4A): (#1) child-box label reprint — per-row + bulk [live]; (#2) 7-level inventory drill-down with new `/inventory/breakdown` endpoint; (#3) Role Manager / configurable RBAC — `role_permissions` table, `max_stage` constraints, `/admin/roles` UI, permission-gated routes; (#4) legacy pre-go-live carton CSV onboarding (`is_legacy` cartons surfaced in drill-down); (#5) legacy carton unpack/repack ("Open for Repacking"). Mods #2–#5 dev-complete, bundled for a single combined UAT → production release. |
| 1.5     | 20-Aug-2026 | Basiq360 | Mods #2–#5 confirmed **live** (§4A table updated). Returns Management now **live** (deployed 2026-08-20, alongside the items below — was previously documented as "awaiting UAT" in v1.4's timeframe). Three further items added and deployed the same day: Samples Module Redesign (partial carton pull, scoped dispatch, friendly status labels), E-commerce Module Redesign (scan-to-pool model replacing the named-record workflow), and an Inventory size-group display fix for the multi-size batch generation tool. Child-box label dimension A/B test remains in progress, client has not yet picked a winner. |

---

*This document is confidential and intended for authorized stakeholders of Binny Footwear (Mahavir Polymers Pvt. Ltd.) and Basiq360. Distribution beyond the intended recipients requires prior written approval.*
