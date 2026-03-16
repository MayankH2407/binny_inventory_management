# Project Brief: Basiq360 Inventory Management System

**Client:** Binny Footwear (Mahavir Polymers Pvt. Ltd.)
**Vendor:** Basiq360
**Document Version:** 1.1
**Date:** March 2026 (Updated March 16 with Customer Master, Product expansion, Label redesign)
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
- QR label generation and bulk printing for child boxes
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
| POST   | `/api/child-boxes/generate`          | Generate QR codes for a batch of child boxes |
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

---

*This document is confidential and intended for authorized stakeholders of Binny Footwear (Mahavir Polymers Pvt. Ltd.) and Basiq360. Distribution beyond the intended recipients requires prior written approval.*
