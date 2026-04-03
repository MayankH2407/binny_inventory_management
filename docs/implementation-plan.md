# Implementation Plan: QR-Based Inventory Management System

**Client:** Binny Footwear (Mahavir Polymers Pvt. Ltd.)
**Vendor:** Basiq360
**Document Version:** 1.3
**Date:** April 3, 2026 (Updated with Phase 2 UI Enhancement Plan, UAT bug fixes)
**Classification:** Internal / Confidential

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Database Schema Design](#5-database-schema-design)
6. [Folder Structure](#6-folder-structure)
7. [Phase-wise Implementation Plan (6 Weeks)](#7-phase-wise-implementation-plan-6-weeks)
8. [API Endpoints (Detailed)](#8-api-endpoints-detailed)
9. [User Roles & Permissions Matrix](#9-user-roles--permissions-matrix)
10. [QR Code Strategy](#10-qr-code-strategy)
11. [Label Printing Specifications](#11-label-printing-specifications)
12. [PWA & Mobile Strategy](#12-pwa--mobile-strategy)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Risk Register](#16-risk-register)

---

## 1. Project Overview

### 1.1 Objective

Build a QR-code-driven, mobile-first inventory management system that provides Binny Footwear with real-time visibility and full traceability over their footwear inventory -- from the factory floor through warehouse storage to dispatch.

### 1.2 Core Concept: Two-Level Carton Hierarchy

The system tracks inventory through a two-level hierarchy:

| Level | Entity | QR Type | Lifecycle |
|-------|--------|---------|-----------|
| **Level 1** | **Child Box** (Inner Carton) | Permanent QR | 1 pair = 1 box. QR is generated once and never changes. The child box QR is the single source of truth for any unit of footwear. |
| **Level 2** | **Master Carton** (Outer Box) | Dynamic QR | Temporary logical container. Created when child boxes are packed, closed on unpack, new one created on repack. Each master carton gets a unique QR at creation time. |

### 1.3 Inventory Lifecycle States

```
                    +-----------+
                    |  CREATED  |  (Child box QR generated, not yet packed)
                    +-----+-----+
                          |
                          v
                    +-----------+
                    |   PACKED  |  (Child box scanned into a master carton)
                    +-----+-----+
                          |
                          v
                    +-----------+
                    |  STORED   |  (Master carton scanned into warehouse storage)
                    +-----+-----+
                          |
               +----------+----------+
               |                     |
               v                     v
        +-----------+         +-----------+
        | UNPACKED  |         | DISPATCHED|
        +-----------+         +-----------+
               |
               v
        +-----------+
        | REPACKED  |  (Free child boxes scanned into a NEW master carton)
        +-----------+
               |
               v
        +-----------+
        |  STORED   |  (New master carton stored)
        +-----+-----+
               |
               v
        +-----------+
        | DISPATCHED|  (Final state)
        +-----------+
```

**Child Box States:** `CREATED` -> `PACKED` -> `STORED` -> `UNPACKED` (FREE) -> `REPACKED` -> `STORED` -> `DISPATCHED`

**Master Carton States:** `ACTIVE` -> `STORED` -> `CLOSED` (on unpack) | `DISPATCHED` (on dispatch)

### 1.4 Key Design Principle

> The child box QR code is the *single source of truth* for any unit of footwear inventory. Master cartons are *logical envelopes* -- their contents can change, but the child box QR always tells you exactly what is inside and where it has been.

### 1.5 Deliverables

- PWA mobile application (Android + iOS via browser)
- Web dashboard for management/supervisors
- QR label generation and thermal printing integration
- Real-time inventory tracking and reporting
- Complete audit trail and traceability

---

## 2. Business Context & Problem Statement

### 2.1 Current Pain Points

- Master cartons are frequently opened and child boxes rearranged on the warehouse floor
- No digital record of unpack events -- old master carton remains "active" while contents have moved
- Phantom stock entries accumulate over time
- Inventory counts do not match physical warehouse state
- Management cannot trust inventory data for production planning or order fulfillment

### 2.2 Solution

Digitally enforce the carton lifecycle: **no child box can exist in more than one active master carton at any point in time**, and all unpack/repack events are logged with inventory updated instantly.

---

## 3. Tech Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Frontend Framework** | Next.js (App Router) | 14.x | SSR/SSG, file-based routing, built-in API routes for BFF pattern, excellent PWA support |
| **Frontend Language** | TypeScript | 5.x | Type safety across the stack, shared types with backend |
| **UI Components** | Tailwind CSS + shadcn/ui | Latest | Rapid prototyping, consistent design system, accessible components |
| **State Management** | Zustand | 4.x | Lightweight, TypeScript-first, minimal boilerplate |
| **QR Scanning** | html5-qrcode | 2.x | Cross-platform camera-based QR scanning, no native dependencies |
| **Backend Runtime** | Node.js | 20 LTS | Stable, long-term support, excellent ecosystem |
| **Backend Framework** | Express.js | 4.x | Mature, battle-tested, extensive middleware ecosystem |
| **Backend Language** | TypeScript | 5.x | Shared types with frontend via `/shared` package |
| **Database** | PostgreSQL | 16 | ACID compliance, excellent JSON support, robust for inventory systems |
| **ORM / Query Builder** | Knex.js | 3.x | Lightweight query builder, excellent migration support, not a full ORM (keeps SQL visible) |
| **Migrations** | Knex migrations | -- | Built-in migration system with up/down support |
| **Authentication** | JWT (jsonwebtoken) | 9.x | Stateless auth, refresh token rotation |
| **Password Hashing** | bcrypt | 5.x | Industry standard |
| **QR Generation** | qrcode (npm) | 1.x | Server-side QR code image generation |
| **PDF/Label Generation** | Custom TSPL templates | -- | Direct TSPL command generation for TSC thermal printers |
| **Validation** | Zod | 3.x | Schema validation shared between frontend and backend |
| **HTTP Client** | Axios | 1.x | Frontend API client with interceptors for auth |
| **Containerization** | Docker + docker-compose | Latest | Consistent dev/prod environments |
| **Process Manager** | PM2 | 5.x | Production process management for Node.js |
| **Logging** | Winston | 3.x | Structured logging with multiple transports |

### 3.1 Printer Hardware

| Spec | Detail |
|------|--------|
| **Model** | TSC thermal label printer (TSPL compatible) |
| **Label Size (Child Box)** | 40mm x 60mm |
| **Label Size (Master Carton)** | 100mm x 150mm (estimated) |
| **Protocol** | TSPL (TSC Printer Language) |
| **Connection** | USB / Network (browser printing via Web USB API or print server) |
| **Print Trigger** | Browser-based: generate TSPL commands, send to printer |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
+---------------------------------------------------+
|                   CLIENT LAYER                      |
|                                                     |
|  +-------------------+   +----------------------+   |
|  | PWA Mobile App    |   | Web Dashboard        |   |
|  | (Next.js + PWA)   |   | (Next.js)            |   |
|  | - QR Scanner      |   | - Reports            |   |
|  | - Pack/Unpack     |   | - User Mgmt          |   |
|  | - Offline Queue   |   | - Inventory View     |   |
|  +--------+----------+   +----------+-----------+   |
|           |                          |               |
+-----------+--------------------------+---------------+
            |                          |
            v                          v
+---------------------------------------------------+
|                   API GATEWAY                       |
|          (Express.js + Middleware)                   |
|                                                     |
|  +-------------+  +----------+  +--------------+    |
|  | Auth (JWT)  |  | RBAC     |  | Rate Limiter |    |
|  +-------------+  +----------+  +--------------+    |
|  +-------------+  +----------+  +--------------+    |
|  | Validator   |  | Logger   |  | Error Handler|    |
|  +-------------+  +----------+  +--------------+    |
+---------------------------------------------------+
            |
            v
+---------------------------------------------------+
|                 SERVICE LAYER                       |
|                                                     |
|  +---------------+  +------------------+            |
|  | Auth Service  |  | User Service     |            |
|  +---------------+  +------------------+            |
|  +---------------+  +------------------+            |
|  | ChildBox Svc  |  | MasterCarton Svc |            |
|  +---------------+  +------------------+            |
|  +---------------+  +------------------+            |
|  | Inventory Svc |  | Dispatch Svc     |            |
|  +---------------+  +------------------+            |
|  +---------------+  +------------------+            |
|  | Customer Svc  |  | Product Svc      |  (NEW)     |
|  +---------------+  +------------------+            |
|  +---------------+  +------------------+            |
|  | QR Generator  |  | Label Service    |            |
|  +---------------+  +------------------+            |
|  +---------------+  +------------------+            |
|  | Report Svc    |  | Audit Log Svc    |            |
|  +---------------+  +------------------+            |
+---------------------------------------------------+
            |
            v
+---------------------------------------------------+
|                  DATA LAYER                         |
|                                                     |
|  +-------------------+   +---------------------+   |
|  | PostgreSQL 16     |   | File Storage        |   |
|  | - Inventory Data  |   | - QR Code Images    |   |
|  | - Audit Logs      |   | - Labels (cached)   |   |
|  | - User/Auth Data  |   |                     |   |
|  +-------------------+   +---------------------+   |
+---------------------------------------------------+
```

### 4.2 Monorepo Structure

The project uses a monorepo with three packages: `frontend`, `backend`, and `shared`. Shared types and validation schemas are defined once in `/shared` and imported by both frontend and backend, ensuring type consistency across the stack.

### 4.3 Request Flow (Example: Scan Child Box into Master Carton)

```
1. Operator opens PWA on phone
2. Navigates to "Pack Master Carton"
3. Camera opens via html5-qrcode
4. Scans child box QR code (e.g., "CB-00001")
5. Frontend sends: POST /api/master-cartons/:id/add-child-box { childBoxCode: "CB-00001" }
6. Auth middleware validates JWT token
7. RBAC middleware checks operator has PACK permission
8. Controller delegates to MasterCartonService.addChildBox()
9. Service validates:
   a. Child box exists and is in CREATED or FREE state
   b. Master carton is in ACTIVE state
   c. Child box is not already in another active master carton
10. Service updates child_box.status = PACKED, creates carton_membership record
11. AuditLogService.log({ action: 'CHILD_BOX_PACKED', ... })
12. Response: 200 OK with updated carton contents + assortment summary
13. Frontend updates UI with new child box in list, beeps for confirmation
```

---

## 5. Database Schema Design

### 5.1 Entity Relationship Overview

```
users ──────────────────────────────────────────┐
                                                 |
products (SKU master) ──┐                        |
                        |                        |
                  child_boxes ──── carton_memberships ──── master_cartons
                        |                                       |
                        |                                       |
                  child_box_history                    master_carton_history
                        |                                       |
                        └───────────── audit_logs ──────────────┘
                                                                |
customers (NEW) ──────────────────────── dispatches ────────────┘
```

### 5.2 Table Definitions

#### `users`

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    role            VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'supervisor', 'warehouse_operator', 'dispatch_operator')),
    is_active       BOOLEAN DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

#### `products` (SKU Master)

```sql
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku             VARCHAR(50) UNIQUE NOT NULL,
    article_name    VARCHAR(200) NOT NULL,
    article_code    VARCHAR(20) NOT NULL,
    colour          VARCHAR(50),
    size            VARCHAR(10),
    mrp             NUMERIC(10,2) NOT NULL,
    -- New fields (March 2026 client requirements)
    category        VARCHAR(50) NOT NULL CHECK (category IN ('Gents', 'Ladies', 'Boys', 'Girls')),
    section         VARCHAR(50) NOT NULL CHECK (section IN ('Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes')),
    location        VARCHAR(50) NOT NULL CHECK (location IN ('VKIA', 'MIA', 'F540')),
    article_group   VARCHAR(100),
    hsn_code        VARCHAR(20),          -- HSN (Harmonized System Nomenclature) for GST/tax
    size_group      VARCHAR(50),          -- e.g., "6-10", "7-11" (size range for the article)
    description     VARCHAR(1000),
    brand           VARCHAR(100) DEFAULT 'Binny',
    pairs_per_box   INTEGER DEFAULT 1,    -- typically 1 pair per child box
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `child_boxes`

```sql
CREATE TABLE child_boxes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code             VARCHAR(50) UNIQUE NOT NULL,   -- e.g., "CB-000001"
    product_id          UUID REFERENCES products(id),
    size                VARCHAR(10),                     -- e.g., "7", "8", "9"
    quantity            INTEGER DEFAULT 1,               -- pairs in this box (usually 1)
    status              VARCHAR(20) NOT NULL DEFAULT 'CREATED'
                        CHECK (status IN ('CREATED', 'PACKED', 'STORED', 'FREE', 'DISPATCHED', 'DAMAGED', 'RETURNED')),
    current_carton_id   UUID REFERENCES master_cartons(id),
    batch_id            UUID,                            -- links to generation batch
    qr_printed          BOOLEAN DEFAULT false,
    qr_printed_at       TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_child_boxes_qr ON child_boxes(qr_code);
CREATE INDEX idx_child_boxes_status ON child_boxes(status);
CREATE INDEX idx_child_boxes_carton ON child_boxes(current_carton_id);
CREATE INDEX idx_child_boxes_product ON child_boxes(product_id);
CREATE INDEX idx_child_boxes_batch ON child_boxes(batch_id);
```

#### `master_cartons`

```sql
CREATE TABLE master_cartons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code             VARCHAR(50) UNIQUE NOT NULL,   -- e.g., "MC-000001"
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'STORED', 'CLOSED', 'DISPATCHED')),
    total_child_boxes   INTEGER DEFAULT 0,
    total_pairs         INTEGER DEFAULT 0,
    article_no          VARCHAR(50),                     -- primary article (if mixed, NULL)
    is_mixed            BOOLEAN DEFAULT false,           -- true if multiple articles/sizes
    size_breakdown      JSONB DEFAULT '{}',              -- { "7": 2, "8": 3, "9": 1 }
    assortment_summary  JSONB DEFAULT '{}',              -- full summary for label
    storage_location    VARCHAR(100),
    dispatch_id         UUID REFERENCES dispatches(id),
    packed_by           UUID REFERENCES users(id),
    stored_at           TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    dispatched_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_master_cartons_qr ON master_cartons(qr_code);
CREATE INDEX idx_master_cartons_status ON master_cartons(status);
```

#### `carton_memberships` (Links child boxes to master cartons with history)

```sql
CREATE TABLE carton_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_box_id    UUID NOT NULL REFERENCES child_boxes(id),
    master_carton_id UUID NOT NULL REFERENCES master_cartons(id),
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    left_at         TIMESTAMPTZ,                        -- NULL if still in carton
    is_active       BOOLEAN DEFAULT true,
    action          VARCHAR(20) NOT NULL CHECK (action IN ('PACKED', 'REPACKED')),
    performed_by    UUID REFERENCES users(id)
);

CREATE INDEX idx_memberships_child ON carton_memberships(child_box_id);
CREATE INDEX idx_memberships_carton ON carton_memberships(master_carton_id);
CREATE INDEX idx_memberships_active ON carton_memberships(is_active);
```

#### `qr_generation_batches`

```sql
CREATE TABLE qr_generation_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_type      VARCHAR(20) NOT NULL CHECK (batch_type IN ('CHILD_BOX', 'MASTER_CARTON')),
    quantity        INTEGER NOT NULL,
    start_sequence  INTEGER NOT NULL,
    end_sequence    INTEGER NOT NULL,
    product_id      UUID REFERENCES products(id),
    generated_by    UUID REFERENCES users(id),
    printed         BOOLEAN DEFAULT false,
    printed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `customers` (Customer Master — NEW March 2026)

```sql
CREATE TABLE customers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_name             VARCHAR(255) NOT NULL,
    address               TEXT,
    delivery_location     VARCHAR(255),
    gstin                 VARCHAR(15),           -- 15-char GST Identification Number
    private_marka         VARCHAR(255),          -- Customer's private label/brand mark
    gr                    VARCHAR(100),           -- Goods Receipt number
    contact_person_name   VARCHAR(150),
    contact_person_mobile VARCHAR(15),
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_firm ON customers(firm_name);
CREATE INDEX idx_customers_gstin ON customers(gstin);
```

#### `dispatches`

```sql
CREATE TABLE dispatches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_no     VARCHAR(50) UNIQUE NOT NULL,        -- e.g., "DSP-20260312-001"
    customer_id     UUID REFERENCES customers(id),      -- Links to Customer Master (NEW)
    destination     VARCHAR(255),                        -- Delivery location (auto-filled from customer)
    transport_details VARCHAR(255),
    lr_number       VARCHAR(100),                        -- Lorry Receipt number
    vehicle_number  VARCHAR(50),
    total_cartons   INTEGER DEFAULT 0,
    total_pairs     INTEGER DEFAULT 0,
    notes           TEXT,
    metadata        JSONB,
    status          VARCHAR(20) DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    dispatched_by   UUID REFERENCES users(id),
    dispatch_date   DATE,
    dispatched_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `audit_logs`

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(30) NOT NULL,               -- 'child_box', 'master_carton', 'dispatch', 'user'
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,               -- 'CREATED', 'PACKED', 'UNPACKED', 'DISPATCHED', etc.
    old_values      JSONB,
    new_values      JSONB,
    metadata        JSONB,                              -- extra context (e.g., { scanned_via: 'mobile' })
    performed_by    UUID REFERENCES users(id),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_user ON audit_logs(performed_by);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

#### `app_settings`

```sql
CREATE TABLE app_settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     TEXT,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 Sequence Counters

```sql
CREATE SEQUENCE child_box_seq START 1;
CREATE SEQUENCE master_carton_seq START 1;
CREATE SEQUENCE dispatch_seq START 1;
```

Used to generate human-readable codes: `CB-{zero-padded sequence}`, `MC-{zero-padded sequence}`, `DSP-{date}-{sequence}`.

---

## 6. Folder Structure

```
/
├── frontend/
│   ├── public/
│   │   ├── icons/                    # PWA icons (192x192, 512x512)
│   │   ├── sw.js                     # Service worker (auto-generated by next-pwa)
│   │   └── manifest.json             # PWA manifest
│   ├── src/
│   │   ├── app/                      # Next.js App Router
│   │   │   ├── layout.tsx            # Root layout with providers
│   │   │   ├── page.tsx              # Landing / redirect
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # KPI dashboard
│   │   │   ├── child-boxes/
│   │   │   │   ├── page.tsx          # List / search
│   │   │   │   ├── generate/
│   │   │   │   │   └── page.tsx      # Bulk QR generation
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Detail + traceability
│   │   │   ├── master-cartons/
│   │   │   │   ├── page.tsx          # List / search
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx      # Create + scan child boxes
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx      # Detail view
│   │   │   │   ├── unpack/
│   │   │   │   │   └── page.tsx      # Unpack workflow
│   │   │   │   └── repack/
│   │   │   │       └── page.tsx      # Repack workflow
│   │   │   ├── customers/                # NEW — Customer Master
│   │   │   │   ├── page.tsx              # Customer list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # Customer detail/edit
│   │   │   ├── dispatch/
│   │   │   │   ├── page.tsx          # Dispatch list
│   │   │   │   └── create/
│   │   │   │       └── page.tsx      # New dispatch + customer selection
│   │   │   ├── inventory/
│   │   │   │   └── page.tsx          # Stock overview
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx          # Report hub
│   │   │   │   ├── stock/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── dispatch/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── traceability/
│   │   │   │       └── page.tsx
│   │   │   ├── users/
│   │   │   │   ├── page.tsx          # User management
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── ui/                   # Reusable UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── DataTable.tsx
│   │   │   │   ├── Dialog.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── Skeleton.tsx
│   │   │   │   └── Spinner.tsx
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx      # Main app layout (sidebar + header)
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── MobileNav.tsx
│   │   │   │   └── ProtectedRoute.tsx
│   │   │   ├── scanning/
│   │   │   │   ├── QRScanner.tsx     # html5-qrcode wrapper component
│   │   │   │   ├── ScanResult.tsx    # Scan result display
│   │   │   │   ├── ScanHistory.tsx   # Recent scans list
│   │   │   │   └── CameraSelector.tsx
│   │   │   ├── labels/
│   │   │   │   ├── ChildBoxLabel.tsx       # 40x60mm label preview
│   │   │   │   ├── MasterCartonLabel.tsx   # Master carton label preview
│   │   │   │   ├── PrintButton.tsx         # Triggers TSPL print
│   │   │   │   └── BulkPrintDialog.tsx
│   │   │   ├── reports/
│   │   │   │   ├── StockReport.tsx
│   │   │   │   ├── DispatchReport.tsx
│   │   │   │   ├── TraceabilityReport.tsx
│   │   │   │   ├── ReportFilters.tsx
│   │   │   │   └── ExportButton.tsx
│   │   │   ├── cartons/
│   │   │   │   ├── ChildBoxCard.tsx
│   │   │   │   ├── MasterCartonCard.tsx
│   │   │   │   ├── AssortmentSummary.tsx
│   │   │   │   ├── CartonContents.tsx
│   │   │   │   └── CartonTimeline.tsx
│   │   │   └── dashboard/
│   │   │       ├── KPICard.tsx
│   │   │       ├── StockChart.tsx
│   │   │       └── RecentActivity.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useQRScanner.ts
│   │   │   ├── useOfflineQueue.ts
│   │   │   ├── usePrint.ts
│   │   │   ├── useDebounce.ts
│   │   │   └── usePermission.ts
│   │   ├── services/
│   │   │   ├── api.ts                # Axios instance with interceptors
│   │   │   ├── auth.service.ts
│   │   │   ├── childBox.service.ts
│   │   │   ├── masterCarton.service.ts
│   │   │   ├── dispatch.service.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── report.service.ts
│   │   │   ├── user.service.ts
│   │   │   ├── customer.service.ts   # NEW — Customer Master API calls
│   │   │   └── print.service.ts      # TSPL command generation + printing
│   │   ├── store/
│   │   │   ├── authStore.ts
│   │   │   ├── scanStore.ts
│   │   │   ├── offlineStore.ts
│   │   │   └── uiStore.ts
│   │   ├── types/
│   │   │   └── index.ts              # Re-exports from shared
│   │   ├── utils/
│   │   │   ├── constants.ts
│   │   │   ├── formatters.ts
│   │   │   ├── validators.ts
│   │   │   └── tspl.ts              # TSPL command builders
│   │   └── styles/
│   │       └── globals.css
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Express app entry point
│   │   ├── app.ts                    # Express app configuration
│   │   ├── routes/
│   │   │   ├── index.ts              # Route aggregator
│   │   │   ├── auth.routes.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── childBox.routes.ts
│   │   │   ├── masterCarton.routes.ts
│   │   │   ├── dispatch.routes.ts
│   │   │   ├── inventory.routes.ts
│   │   │   ├── report.routes.ts
│   │   │   ├── product.routes.ts
│   │   │   ├── customer.routes.ts        # NEW — Customer Master CRUD
│   │   │   └── auditLog.routes.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── childBox.controller.ts
│   │   │   ├── masterCarton.controller.ts
│   │   │   ├── dispatch.controller.ts
│   │   │   ├── inventory.controller.ts
│   │   │   ├── report.controller.ts
│   │   │   ├── product.controller.ts
│   │   │   ├── customer.controller.ts    # NEW — Customer Master
│   │   │   └── auditLog.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── user.service.ts
│   │   │   ├── childBox.service.ts
│   │   │   ├── masterCarton.service.ts
│   │   │   ├── dispatch.service.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── report.service.ts
│   │   │   ├── product.service.ts
│   │   │   ├── customer.service.ts       # NEW — Customer Master
│   │   │   ├── qrGenerator.service.ts
│   │   │   ├── labelTemplate.service.ts
│   │   │   └── auditLog.service.ts
│   │   ├── models/
│   │   │   ├── db.ts                 # Knex instance + connection pool
│   │   │   ├── user.model.ts
│   │   │   ├── childBox.model.ts
│   │   │   ├── masterCarton.model.ts
│   │   │   ├── cartonMembership.model.ts
│   │   │   ├── dispatch.model.ts
│   │   │   ├── product.model.ts
│   │   │   └── auditLog.model.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts               # JWT verification middleware
│   │   │   ├── rbac.ts               # Role-based access control
│   │   │   ├── validate.ts           # Zod request validation
│   │   │   ├── errorHandler.ts       # Global error handler
│   │   │   ├── rateLimiter.ts        # Rate limiting
│   │   │   └── requestLogger.ts      # HTTP request logging
│   │   ├── validators/
│   │   │   ├── auth.validator.ts
│   │   │   ├── childBox.validator.ts
│   │   │   ├── masterCarton.validator.ts
│   │   │   ├── dispatch.validator.ts
│   │   │   ├── product.validator.ts
│   │   │   └── customer.validator.ts   # NEW — Customer Master validation
│   │   ├── utils/
│   │   │   ├── qr-generator.ts       # QR code image generation (qrcode npm)
│   │   │   ├── label-templates.ts    # TSPL label command generators
│   │   │   ├── sequence.ts           # Sequence number generators
│   │   │   ├── errors.ts             # Custom error classes
│   │   │   └── helpers.ts
│   │   ├── migrations/
│   │   │   ├── 001_create_users.ts
│   │   │   ├── 002_create_products.ts
│   │   │   ├── 003_create_child_boxes.ts
│   │   │   ├── 004_create_master_cartons.ts
│   │   │   ├── 005_create_carton_memberships.ts
│   │   │   ├── 006_create_dispatches.ts
│   │   │   ├── 007_create_audit_logs.ts
│   │   │   ├── 008_create_qr_batches.ts
│   │   │   ├── 009_create_refresh_tokens.ts
│   │   │   └── 010_create_app_settings.ts
│   │   ├── seeds/
│   │   │   ├── 001_admin_user.ts
│   │   │   ├── 002_sample_products.ts
│   │   │   └── 003_app_settings.ts
│   │   └── config/
│   │       ├── index.ts              # Env config loader
│   │       ├── database.ts           # Knex config
│   │       └── constants.ts
│   ├── knexfile.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/
│   ├── types/
│   │   ├── user.types.ts
│   │   ├── childBox.types.ts
│   │   ├── masterCarton.types.ts
│   │   ├── dispatch.types.ts
│   │   ├── product.types.ts
│   │   ├── inventory.types.ts
│   │   ├── report.types.ts
│   │   ├── audit.types.ts
│   │   ├── api.types.ts              # Request/Response wrappers
│   │   └── index.ts
│   ├── validators/
│   │   ├── auth.schema.ts            # Zod schemas shared by FE + BE
│   │   ├── childBox.schema.ts
│   │   ├── masterCarton.schema.ts
│   │   └── dispatch.schema.ts
│   ├── constants/
│   │   ├── roles.ts
│   │   ├── statuses.ts
│   │   └── permissions.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   ├── Dockerfile.postgres           # With init scripts
│   └── nginx.conf                    # Reverse proxy config
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── package.json                       # Workspace root (npm workspaces)
├── tsconfig.base.json                 # Shared TS config
└── README.md
```

---

## 7. Phase-wise Implementation Plan (6 Weeks)

### Week 1: Foundation & Infrastructure

**Goal:** Project scaffolding, database setup, authentication, and user management fully operational.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | Project scaffolding | Initialize monorepo with npm workspaces. Set up Next.js frontend, Express backend, shared package. Configure TypeScript across all packages. | Full Stack |
| 1 | Docker setup | Create docker-compose.yml with frontend, backend, postgres services. Dev hot-reload volumes. | DevOps |
| 1 | Linting & formatting | ESLint, Prettier config. Husky pre-commit hooks. | Full Stack |
| 2 | Database schema | Write all Knex migration files (tables 001-010). Run migrations. Verify schema. | Backend |
| 2 | Seed data | Admin user seed, sample products (articles, sizes), app settings defaults. | Backend |
| 2 | Environment config | `.env.example`, config loader, database connection pooling setup. | Backend |
| 3 | Auth module (backend) | JWT access token (15 min) + refresh token (7 days) rotation. Login, refresh, logout endpoints. Password hashing with bcrypt. | Backend |
| 3 | Auth middleware | `auth.ts` -- verify JWT from Authorization header. `rbac.ts` -- check role/permission against route config. | Backend |
| 4 | User management API | Full CRUD: create user, list users, get user, update user, deactivate user. Admin-only routes. | Backend |
| 4 | Frontend: Login page | Login form, JWT storage (httpOnly cookie or secure localStorage), auto-redirect on token expiry. | Frontend |
| 5 | Frontend: App shell | Sidebar navigation, header with user menu, responsive layout (desktop + mobile). Protected route wrapper. | Frontend |
| 5 | Frontend: User management | User list page, create/edit user dialog, role assignment. Admin-only access. | Frontend |
| 5 | Logging setup | Winston logger with console + file transports. Request logging middleware. | Backend |

**Week 1 Deliverables:**
- Working Docker dev environment (one command: `docker-compose up`)
- PostgreSQL with all tables created
- Login/logout functional end-to-end
- User management CRUD functional
- App shell with role-based navigation

---

### Week 2: Core -- Child Box Module

**Goal:** Complete child box QR generation, product management, and label printing pipeline.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | Product/SKU master API | CRUD for products: article_no, article_name, colour, size_range, pairs_per_box. List with search/filter. | Backend |
| 1 | Frontend: Product management | Product list page, create/edit form, search by article number. | Frontend |
| 2 | QR code generation service | `qrGenerator.service.ts` -- generates QR code images using `qrcode` npm. Configurable data payload: QR code string, optional URL encoding (company website redirect). | Backend |
| 2 | Child box bulk generation API | `POST /api/child-boxes/generate` -- accepts: product_id, size, quantity. Generates sequential QR codes (CB-000001, CB-000002, ...). Creates child_box records in CREATED status. Returns batch_id. | Backend |
| 3 | QR URL strategy | QR code encodes: `https://binny.basiq360.com/cb/{qr_code}` -- when scanned by any phone, redirects to product info page. When scanned in-app, triggers internal lookup. | Backend |
| 3 | Label template engine | TSPL command generator for 40x60mm child box labels. Fields: QR code image, article name, size, QR code text, Binny Footwear logo. | Backend |
| 4 | Bulk label printing | `POST /api/child-boxes/batch/:batchId/labels` -- returns TSPL commands for entire batch. Frontend: BulkPrintDialog triggers print via Web USB API or downloads TSPL file. | Full Stack |
| 4 | Frontend: Child box generation | Page with form: select product, select size, enter quantity. Generate button. Shows generated QR codes with print option. | Frontend |
| 5 | Frontend: Child box list & detail | Searchable list (by QR code, product, status). Detail page showing: product info, current status, current carton (if packed), print label button. | Frontend |
| 5 | Child box search API | `GET /api/child-boxes` with query params: qr_code, product_id, status, size, page, limit. `GET /api/child-boxes/:id` with full details. | Backend |

**Week 2 Deliverables:**
- Product master fully functional
- Bulk QR code generation (single-size up to 500, multi-size across all sizes in one batch)
- 40x60mm TSPL label template working with TSC printer
- Child box list with search/filter
- Child box detail page

---

### Week 3: Core -- Master Carton Module

**Goal:** Master carton creation with QR scanning, child box linking, validation, and label printing.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | QR scanner component | Integrate `html5-qrcode` as reusable React component. Camera selection, torch toggle, scan sound/vibration feedback, error handling for denied camera permissions. | Frontend |
| 1 | Scan hook | `useQRScanner` hook: manages scanner lifecycle, deduplicates rapid scans, queues scans for batch processing. | Frontend |
| 2 | Master carton creation API | `POST /api/master-cartons/create` -- creates new master carton in ACTIVE status, generates MC-{sequence} QR code. Returns carton ID and QR code. | Backend |
| 2 | Add child box to carton API | `POST /api/master-cartons/:id/add-child-box` -- validates: child box exists, is in CREATED or FREE status, not in another active carton. Links child box, updates status to PACKED, creates carton_membership record. Returns updated carton with assortment summary. | Backend |
| 3 | Remove child box API | `POST /api/master-cartons/:id/remove-child-box` -- removes a child box before carton is finalized. Sets child box back to CREATED/FREE. | Backend |
| 3 | Finalize carton API | `POST /api/master-cartons/:id/finalize` -- locks the carton contents, calculates final assortment summary and size breakdown, generates master carton QR label data. | Backend |
| 3 | Validation rules (critical) | **Rule 1:** A child box in PACKED or STORED status CANNOT be added to any carton (must be FREE or CREATED). **Rule 2:** A child box can only belong to ONE active master carton. **Rule 3:** A CLOSED or DISPATCHED master carton cannot accept new child boxes. | Backend |
| 4 | Frontend: Create master carton | Workflow page: (1) Start new carton, (2) Open QR scanner, (3) Scan child boxes one by one -- each scan adds to list with sound feedback, (4) Live assortment summary updates, (5) Finalize carton, (6) Print master carton label. | Frontend |
| 4 | Assortment summary calculation | Backend calculates and frontend displays: total pairs, size breakdown (size -> count), article breakdown, colour breakdown. Format for label printing. | Full Stack |
| 5 | Master carton label template | TSPL template for larger label: QR code, master carton code, article details, size breakdown table, total pairs count, date packed, operator name, Binny logo. | Backend |
| 5 | Frontend: Master carton list & detail | List page with search/filter (by QR code, status, article, date). Detail page showing: carton info, all child boxes inside, assortment summary, timeline of events. | Frontend |

**Week 3 Deliverables:**
- QR scanning working on mobile browsers
- Master carton creation with child box scanning workflow
- Validation preventing duplicate assignments
- Assortment summary auto-calculated
- Master carton label printing
- Master carton list and detail views

---

### Week 4: Lifecycle Workflows

**Goal:** Implement storage, unpack, repack, dispatch workflows, and complete lineage tracking.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | Storage workflow API | `POST /api/master-cartons/:id/store` -- scan master carton QR, optionally set storage_location, status -> STORED, all child boxes -> STORED. Log audit event. | Backend |
| 1 | Frontend: Storage workflow | Scan master carton QR -> shows carton details -> confirm storage -> optional location input -> mark as stored. | Frontend |
| 2 | Unpack workflow API | `POST /api/master-cartons/:id/unpack` -- **FULL UNPACK ONLY** (no partial). Carton status -> CLOSED. All child boxes: status -> FREE, current_carton_id -> NULL. All carton_memberships: is_active -> false, left_at -> NOW(). Carton closed_at -> NOW(). Immutable: closed carton cannot be reopened or dispatched. | Backend |
| 2 | Frontend: Unpack workflow | Scan master carton QR -> shows carton contents and summary -> confirmation dialog ("This will release all X child boxes") -> unpack -> success screen showing freed boxes. | Frontend |
| 3 | Repack workflow API | Reuses master carton creation flow. Operator creates new master carton, scans FREE child boxes into it. System validates each child box is in FREE status. New carton_membership records created with action = 'REPACKED'. | Backend |
| 3 | Frontend: Repack workflow | Same UI as create master carton but filtered context: shows only FREE child boxes as scannable. Clear indication that this is a REPACK operation. | Frontend |
| 4 | Dispatch workflow API | `POST /api/dispatches/create` -- create dispatch record with party_name, invoice_no, vehicle_no. `POST /api/dispatches/:id/add-carton` -- scan master carton QR, validate STORED status, add to dispatch. `POST /api/dispatches/:id/complete` -- mark all cartons as DISPATCHED, all child boxes as DISPATCHED, dispatch status -> COMPLETED. | Backend |
| 4 | Frontend: Dispatch workflow | Create dispatch form (party name, invoice no.) -> scan master cartons -> running total of cartons/pairs -> finalize dispatch. | Frontend |
| 5 | Lineage / traceability API | `GET /api/child-boxes/:id/traceability` -- returns full history: created -> packed into MC-001 -> stored -> unpacked from MC-001 -> repacked into MC-002 -> stored -> dispatched. Built from carton_memberships + audit_logs. | Backend |
| 5 | Frontend: Traceability view | Timeline component showing child box journey through all master cartons. Each event shows: timestamp, action, carton code, operator. Accessible from child box detail page. | Frontend |

**Week 4 Deliverables:**
- Storage workflow with location tracking
- Full unpack workflow with validation
- Repack workflow reusing pack UI
- Dispatch workflow with party/invoice capture
- Complete child box traceability (lineage history)
- All lifecycle state transitions enforced

---

### Week 5: Reporting & Dashboard

**Goal:** Build comprehensive reporting suite and real-time dashboard.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | Report service (backend) | Generic report query builder with configurable filters (date range, product, status, size). Pagination. CSV export support. | Backend |
| 1 | Stock by SKU report | `GET /api/reports/stock-by-sku` -- grouped by article_no: total child boxes, packed count, free count, dispatched count, by size breakdown. | Backend |
| 2 | Carton inventory report | `GET /api/reports/carton-inventory` -- all active/stored master cartons with contents summary. Filter by status, article, date range. | Backend |
| 2 | Dispatch report | `GET /api/reports/dispatches` -- dispatch records with party name, invoice, total cartons, total pairs, date. Filter by date range, party. | Backend |
| 3 | Traceability report | `GET /api/reports/traceability` -- bulk traceability: search by QR code range, product, date. Shows movement history for multiple child boxes. | Backend |
| 3 | Dashboard KPIs API | `GET /api/dashboard/kpis` -- returns: total active stock (pairs), cartons in storage, cartons dispatched today, child boxes awaiting packing (CREATED), free child boxes (unpacked), daily scan count. | Backend |
| 4 | Frontend: Dashboard | KPI cards with real-time numbers. Stock breakdown chart (by article, by size). Recent activity feed (last 20 events). Cartons packed/dispatched trend (7-day bar chart). | Frontend |
| 4 | Frontend: Stock report | Table with filters (article, size, status, date range). Expandable rows showing size breakdown. Export to CSV. | Frontend |
| 5 | Frontend: Carton inventory report | Searchable, filterable table of master cartons. Click to expand and see contents. Export to CSV. | Frontend |
| 5 | Frontend: Dispatch report | Dispatch list with details. Click to see cartons in each dispatch. Date range filter, party filter. Export to CSV. | Frontend |
| 5 | Frontend: Traceability report | Search by QR code or scan QR. Shows full journey timeline. Batch lookup for multiple boxes. | Frontend |

**Week 5 Deliverables:**
- Dashboard with 6+ real-time KPIs
- Stock by SKU/Size/Article report
- Carton inventory report
- Dispatch report with party/invoice details
- Traceability/lineage report
- CSV export on all reports
- Configurable date and attribute filters

---

### Week 6: Testing, Polish & Deployment

**Goal:** End-to-end testing, PWA optimization, performance tuning, UAT, production deployment.

| Day | Task | Details | Owner |
|-----|------|---------|-------|
| 1 | Unit tests | Backend service tests (Jest): auth, child box generation, master carton lifecycle, validation rules, dispatch workflow. Minimum 80% coverage on services. | Backend |
| 1 | API integration tests | Supertest-based tests for all API endpoints. Test auth flow, RBAC enforcement, validation error responses. | Backend |
| 2 | E2E tests | Playwright tests for critical workflows: login -> generate child boxes -> create master carton -> scan child boxes -> store -> unpack -> repack -> dispatch. | Full Stack |
| 2 | PWA optimization | Service worker caching strategy: cache-first for static assets, network-first for API calls. Offline scan queue: scans saved to IndexedDB when offline, synced when online. Install prompt on mobile. | Frontend |
| 3 | Performance tuning | QR scan response target: < 1 second. Database query optimization (EXPLAIN ANALYZE on report queries). Add database indexes where needed. Frontend bundle analysis and code splitting. | Full Stack |
| 3 | Security audit | Input sanitization review. SQL injection prevention verification. JWT token security. CORS configuration. Rate limiting on auth endpoints. | Full Stack |
| 4 | UAT with warehouse operators | On-site testing with real devices and TSC printer. Test all workflows. Gather feedback. Fix critical issues. | Full Stack |
| 4 | Bug fixes | Address UAT findings. UI/UX polish based on operator feedback. | Full Stack |
| 5 | Docker production build | Multi-stage Dockerfiles for minimal image sizes. docker-compose.prod.yml with production configs. Nginx reverse proxy configuration. SSL/TLS setup. | DevOps |
| 5 | Documentation | API documentation (auto-generated from Zod schemas or Swagger). Deployment runbook. Operator quick-start guide. | Full Stack |
| 5 | Go-live preparation | Production database migration. Admin user setup. Product master data import. Final smoke test. | Full Stack |

**Week 6 Deliverables:**
- Test suite: unit + integration + E2E
- PWA installable on mobile, offline scan queue working
- QR scan < 1 second response time verified
- UAT sign-off from warehouse team
- Production Docker images built and tested
- Deployment documentation complete
- System ready for go-live

---

## 8. API Endpoints (Detailed)

### 8.1 Authentication

#### `POST /api/auth/login`

Login with username and password.

- **Auth Required:** No
- **Request Body:**
  ```json
  {
    "username": "string (required)",
    "password": "string (required)"
  }
  ```
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "jwt-string",
      "refreshToken": "jwt-string",
      "user": {
        "id": "uuid",
        "username": "string",
        "fullName": "string",
        "role": "admin | supervisor | warehouse_operator | dispatch_operator",
        "email": "string"
      }
    }
  }
  ```
- **Response 401:** `{ "success": false, "error": "Invalid credentials" }`

#### `POST /api/auth/refresh`

Refresh an expired access token.

- **Auth Required:** No (refresh token in body)
- **Request Body:**
  ```json
  {
    "refreshToken": "string (required)"
  }
  ```
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "new-jwt-string",
      "refreshToken": "new-refresh-token"
    }
  }
  ```

#### `POST /api/auth/logout`

Revoke refresh token.

- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "refreshToken": "string (required)"
  }
  ```
- **Response 200:** `{ "success": true, "message": "Logged out" }`

#### `GET /api/auth/me`

Get current user profile.

- **Auth Required:** Yes
- **Response 200:** User object

---

### 8.2 User Management

#### `GET /api/users`

List all users with optional filters.

- **Auth Required:** Yes
- **Roles:** `admin`
- **Query Params:** `role`, `is_active`, `search`, `page`, `limit`
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "users": [{ "id": "uuid", "username": "...", "fullName": "...", "role": "...", "isActive": true }],
      "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
    }
  }
  ```

#### `POST /api/users`

Create a new user.

- **Auth Required:** Yes
- **Roles:** `admin`
- **Request Body:**
  ```json
  {
    "username": "string (required, unique)",
    "email": "string (required, unique)",
    "password": "string (required, min 8 chars)",
    "fullName": "string (required)",
    "role": "admin | supervisor | warehouse_operator | dispatch_operator (required)"
  }
  ```
- **Response 201:** Created user object (without password)

#### `GET /api/users/:id`

Get user by ID.

- **Auth Required:** Yes
- **Roles:** `admin`
- **Response 200:** User object

#### `PUT /api/users/:id`

Update user details.

- **Auth Required:** Yes
- **Roles:** `admin`
- **Request Body:** Partial user fields (username, email, fullName, role, isActive)
- **Response 200:** Updated user object

#### `PUT /api/users/:id/password`

Reset user password.

- **Auth Required:** Yes
- **Roles:** `admin` (or self)
- **Request Body:**
  ```json
  {
    "currentPassword": "string (required if self)",
    "newPassword": "string (required, min 8 chars)"
  }
  ```
- **Response 200:** `{ "success": true, "message": "Password updated" }`

---

### 8.3 Products (SKU Master)

#### `GET /api/products`

List products with search/filter.

- **Auth Required:** Yes
- **Roles:** All
- **Query Params:** `search`, `article_code`, `colour`, `category`, `section`, `location`, `is_active`, `page`, `limit`
- **Response 200:** Paginated product list

#### `POST /api/products`

Create a new product.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Request Body:**
  ```json
  {
    "sku": "string (required, unique, uppercase)",
    "articleName": "string (required)",
    "articleCode": "string (required)",
    "colour": "string (required)",
    "size": "string (required)",
    "mrp": "number (required, positive)",
    "category": "string (required) — one of: Gents, Ladies, Boys, Girls",
    "section": "string (required) — one of: Hawaii, PU, EVA, Fabrication, Canvas, PVC, Sports Shoes",
    "location": "string (required) — one of: VKIA, MIA, F540",
    "articleGroup": "string (optional)",
    "hsnCode": "string (optional) — HSN code for GST/tax",
    "sizeGroup": "string (optional) — e.g., '6-10', '7-11'",
    "description": "string (optional)"
  }
  ```
- **Response 201:** Created product

#### `GET /api/products/:id`

- **Auth Required:** Yes
- **Response 200:** Product details

#### `GET /api/products/:id/sizes`

Get all sibling products (same article_name + colour, different sizes) for a given product.

- **Auth Required:** Yes
- **Roles:** All authenticated users
- **Response 200:**
  ```json
  {
    "success": true,
    "data": [
      { "id": "uuid", "sku": "BF-BLK-6", "article_name": "Sports Shoe", "colour": "Black", "size": "6", "mrp": 999 },
      { "id": "uuid", "sku": "BF-BLK-7", "article_name": "Sports Shoe", "colour": "Black", "size": "7", "mrp": 999 }
    ]
  }
  ```

#### `PUT /api/products/:id`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Request Body:** Partial product fields
- **Response 200:** Updated product

---

### 8.4 Customers (Customer Master — NEW March 2026)

#### `GET /api/customers`

List customers with search/filter.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Query Params:** `search`, `firm_name`, `gstin`, `is_active`, `page`, `limit`
- **Response 200:** Paginated customer list

#### `POST /api/customers`

Create a new customer.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Request Body:**
  ```json
  {
    "firmName": "string (required)",
    "address": "string (optional)",
    "deliveryLocation": "string (optional)",
    "gstin": "string (optional, 15 chars, validated format)",
    "privateMarka": "string (optional) — customer's private brand mark",
    "gr": "string (optional) — Goods Receipt number",
    "contactPersonName": "string (optional)",
    "contactPersonMobile": "string (optional, 10-digit validated)"
  }
  ```
- **Response 201:** Created customer

#### `GET /api/customers/:id`

- **Auth Required:** Yes
- **Response 200:** Customer details

#### `PUT /api/customers/:id`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Request Body:** Partial customer fields
- **Response 200:** Updated customer

#### `DELETE /api/customers/:id`

Soft delete (set `is_active = false`).

- **Auth Required:** Yes
- **Roles:** `admin`
- **Response 200:** `{ "success": true, "message": "Customer deactivated" }`

---

### 8.5 Child Boxes

#### `POST /api/child-boxes/generate`

Bulk generate child box QR codes.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "productId": "uuid (required)",
    "size": "string (required, e.g., '7')",
    "quantity": "number (required, 1-1000)",
    "generateLabels": "boolean (optional, default false)"
  }
  ```
- **Response 201:**
  ```json
  {
    "success": true,
    "data": {
      "batchId": "uuid",
      "quantity": 50,
      "firstCode": "CB-000101",
      "lastCode": "CB-000150",
      "childBoxes": [
        { "id": "uuid", "qrCode": "CB-000101", "status": "CREATED" }
      ]
    }
  }
  ```

#### `POST /api/child-boxes/bulk-multi-size`

Bulk generate child box QR codes across multiple sizes of one product in a single transaction.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "product_id": "uuid (required) — any product in the article+colour family",
    "quantity": "number (optional, default 1) — pairs per box",
    "sizes": [
      { "size": "6", "count": 10 },
      { "size": "7", "count": 5 },
      { "size": "8", "count": 8 }
    ]
  }
  ```
- **Validation:** Zod schema. Total count across all sizes must not exceed 500. Each size must correspond to an existing product with same article_name + colour.
- **Response 201:**
  ```json
  {
    "success": true,
    "message": "23 child boxes created across multiple sizes",
    "data": [
      { "id": "uuid", "barcode": "BINNY-CB-{uuid}", "product_id": "uuid", "size": "6", "colour": "Black", "qr_data_uri": "data:image/png;base64,..." },
      "..."
    ]
  }
  ```

#### `GET /api/child-boxes`

List child boxes with filters.

- **Auth Required:** Yes
- **Query Params:** `qr_code`, `product_id`, `status`, `size`, `current_carton_id`, `batch_id`, `page`, `limit`
- **Response 200:** Paginated child box list with product details

#### `GET /api/child-boxes/:id`

Get child box detail.

- **Auth Required:** Yes
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "qrCode": "CB-000101",
      "product": { "articleNo": "ART-001", "articleName": "Classic Slipper", "colour": "Black" },
      "size": "8",
      "quantity": 1,
      "status": "PACKED",
      "currentCarton": { "id": "uuid", "qrCode": "MC-000012" },
      "qrPrinted": true,
      "createdAt": "2026-03-12T10:00:00Z"
    }
  }
  ```

#### `GET /api/child-boxes/:id/traceability`

Get full lineage history for a child box.

- **Auth Required:** Yes
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "childBox": { "qrCode": "CB-000101", "product": "...", "size": "8" },
      "timeline": [
        { "timestamp": "2026-03-10T09:00:00Z", "action": "CREATED", "performedBy": "Ravi Kumar" },
        { "timestamp": "2026-03-10T09:30:00Z", "action": "PACKED", "masterCarton": "MC-000005", "performedBy": "Ravi Kumar" },
        { "timestamp": "2026-03-10T10:00:00Z", "action": "STORED", "masterCarton": "MC-000005", "location": "Rack A-3" },
        { "timestamp": "2026-03-11T14:00:00Z", "action": "UNPACKED", "masterCarton": "MC-000005", "performedBy": "Sunil Sharma" },
        { "timestamp": "2026-03-11T14:30:00Z", "action": "REPACKED", "masterCarton": "MC-000018", "performedBy": "Sunil Sharma" },
        { "timestamp": "2026-03-12T11:00:00Z", "action": "DISPATCHED", "masterCarton": "MC-000018", "dispatch": "DSP-20260312-001", "party": "ABC Traders" }
      ]
    }
  }
  ```

#### `GET /api/child-boxes/lookup/:qrCode`

Quick lookup by QR code string (used during scanning).

- **Auth Required:** Yes
- **Response 200:** Child box detail (same as GET by ID)

#### `GET /api/child-boxes/batch/:batchId/labels`

Get TSPL label commands for a batch of child boxes.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "batchId": "uuid",
      "count": 50,
      "tsplCommands": "SIZE 40 mm, 60 mm\nGAP 2 mm, 0 mm\n...",
      "format": "tspl"
    }
  }
  ```

---

### 8.5 Master Cartons

#### `POST /api/master-cartons/create`

Create a new empty master carton.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "articleNo": "string (optional, for pre-assignment)"
  }
  ```
- **Response 201:**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "qrCode": "MC-000025",
      "status": "ACTIVE",
      "totalChildBoxes": 0,
      "totalPairs": 0,
      "sizeBreakdown": {},
      "createdAt": "2026-03-12T10:00:00Z"
    }
  }
  ```

#### `POST /api/master-cartons/:id/add-child-box`

Scan and add a child box to this master carton.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "childBoxQrCode": "string (required, e.g., 'CB-000101')"
  }
  ```
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "carton": {
        "id": "uuid",
        "qrCode": "MC-000025",
        "totalChildBoxes": 5,
        "totalPairs": 5,
        "sizeBreakdown": { "7": 2, "8": 2, "9": 1 },
        "childBoxes": [
          { "qrCode": "CB-000101", "size": "7", "product": "Classic Slipper" }
        ]
      },
      "addedBox": { "qrCode": "CB-000101", "size": "7" }
    }
  }
  ```
- **Response 409:** `{ "success": false, "error": "Child box CB-000101 is already packed in master carton MC-000012" }`
- **Response 400:** `{ "success": false, "error": "Child box CB-000101 is in DISPATCHED status and cannot be packed" }`

#### `POST /api/master-cartons/:id/remove-child-box`

Remove a child box from the carton (before finalization only).

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "childBoxQrCode": "string (required)"
  }
  ```
- **Response 200:** Updated carton without the removed box

#### `POST /api/master-cartons/:id/finalize`

Lock carton contents and generate label data.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "carton": { "...full carton with finalized summary..." },
      "labelData": {
        "tsplCommands": "SIZE 100 mm, 150 mm\n...",
        "format": "tspl"
      }
    }
  }
  ```

#### `GET /api/master-cartons`

List master cartons with filters.

- **Auth Required:** Yes
- **Query Params:** `qr_code`, `status`, `article_no`, `date_from`, `date_to`, `page`, `limit`
- **Response 200:** Paginated master carton list

#### `GET /api/master-cartons/:id`

Get master carton detail with all child boxes.

- **Auth Required:** Yes
- **Response 200:** Full carton detail including child boxes, assortment summary, event timeline

#### `GET /api/master-cartons/lookup/:qrCode`

Quick lookup by QR code (used during scanning).

- **Auth Required:** Yes
- **Response 200:** Master carton detail

#### `POST /api/master-cartons/:id/store`

Mark master carton as stored in warehouse.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "storageLocation": "string (optional, e.g., 'Rack A-3, Shelf 2')"
  }
  ```
- **Response 200:** Updated carton with status STORED

#### `POST /api/master-cartons/:id/unpack`

Unpack master carton (full unpack only). Closes carton permanently, frees all child boxes.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `warehouse_operator`
- **Request Body:**
  ```json
  {
    "reason": "string (optional, reason for unpacking)"
  }
  ```
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "carton": { "qrCode": "MC-000025", "status": "CLOSED", "closedAt": "..." },
      "freedChildBoxes": [
        { "qrCode": "CB-000101", "status": "FREE", "size": "7", "product": "Classic Slipper" }
      ],
      "totalFreed": 12
    }
  }
  ```
- **Response 400:** `{ "success": false, "error": "Cannot unpack: carton is already CLOSED" }`

#### `GET /api/master-cartons/:id/label`

Get printable label data for a master carton.

- **Auth Required:** Yes
- **Response 200:** TSPL commands for the master carton label

---

### 8.6 Dispatch

#### `POST /api/dispatches/create`

Create a new dispatch record.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `dispatch_operator`
- **Request Body:**
  ```json
  {
    "partyName": "string (required)",
    "invoiceNo": "string (optional)",
    "vehicleNo": "string (optional)",
    "driverName": "string (optional)",
    "notes": "string (optional)"
  }
  ```
- **Response 201:** Created dispatch with status PENDING

#### `GET /api/dispatches`

List dispatches with filters.

- **Auth Required:** Yes
- **Query Params:** `status`, `party_name`, `date_from`, `date_to`, `page`, `limit`
- **Response 200:** Paginated dispatch list

#### `GET /api/dispatches/:id`

Get dispatch detail with all cartons.

- **Auth Required:** Yes
- **Response 200:** Dispatch detail with list of master cartons and their contents

#### `POST /api/dispatches/:id/add-carton`

Scan and add a master carton to a dispatch.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `dispatch_operator`
- **Request Body:**
  ```json
  {
    "masterCartonQrCode": "string (required)"
  }
  ```
- **Response 200:** Updated dispatch with new carton added
- **Response 400:** `{ "success": false, "error": "Master carton MC-000025 is not in STORED status" }`

#### `POST /api/dispatches/:id/remove-carton`

Remove a carton from dispatch (before completion).

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `dispatch_operator`
- **Request Body:**
  ```json
  {
    "masterCartonQrCode": "string (required)"
  }
  ```
- **Response 200:** Updated dispatch

#### `POST /api/dispatches/:id/complete`

Complete the dispatch. All cartons -> DISPATCHED, all child boxes -> DISPATCHED.

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `dispatch_operator`
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "dispatch": { "dispatchNo": "DSP-20260312-001", "status": "COMPLETED", "totalCartons": 15, "totalPairs": 180 },
      "dispatchedCartons": 15,
      "dispatchedChildBoxes": 180
    }
  }
  ```

---

### 8.7 Inventory

#### `GET /api/inventory`

Get current inventory summary.

- **Auth Required:** Yes
- **Query Params:** `group_by` (sku | size | article | status), `product_id`, `article_no`, `status`
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "totalChildBoxes": 5000,
        "totalPairs": 5000,
        "byStatus": { "CREATED": 200, "PACKED": 1500, "STORED": 2800, "FREE": 100, "DISPATCHED": 400 },
        "activeCartons": 250,
        "storedCartons": 200
      },
      "breakdown": [
        { "articleNo": "ART-001", "articleName": "Classic Slipper", "size": "7", "count": 150, "status": "STORED" }
      ]
    }
  }
  ```

---

### 8.8 Reports

#### `GET /api/reports/stock-by-sku`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Query Params:** `article_no`, `date_from`, `date_to`, `format` (json | csv)
- **Response 200:** Stock grouped by SKU with size breakdown

#### `GET /api/reports/carton-inventory`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Query Params:** `status`, `article_no`, `date_from`, `date_to`, `format` (json | csv)
- **Response 200:** All cartons with contents summary

#### `GET /api/reports/dispatches`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`, `dispatch_operator`
- **Query Params:** `party_name`, `date_from`, `date_to`, `format` (json | csv)
- **Response 200:** Dispatch records with totals

#### `GET /api/reports/traceability`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Query Params:** `qr_code`, `product_id`, `date_from`, `date_to`
- **Response 200:** Movement history for matching child boxes

#### `GET /api/reports/daily-summary`

- **Auth Required:** Yes
- **Roles:** `admin`, `supervisor`
- **Query Params:** `date` (default: today)
- **Response 200:** Day's activity: boxes generated, cartons packed, unpacked, dispatched

---

### 8.9 Dashboard

#### `GET /api/dashboard/kpis`

- **Auth Required:** Yes
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "totalActiveStock": 4500,
      "cartonsInStorage": 200,
      "cartonsDispatchedToday": 12,
      "childBoxesAwaitingPacking": 200,
      "freeChildBoxes": 100,
      "dailyScanCount": 340,
      "todayPackedCartons": 15,
      "todayUnpackedCartons": 3
    }
  }
  ```

#### `GET /api/dashboard/recent-activity`

- **Auth Required:** Yes
- **Query Params:** `limit` (default: 20)
- **Response 200:** List of recent audit events with human-readable descriptions

---

### 8.10 Audit Logs

#### `GET /api/audit-logs`

- **Auth Required:** Yes
- **Roles:** `admin`
- **Query Params:** `entity_type`, `entity_id`, `action`, `performed_by`, `date_from`, `date_to`, `page`, `limit`
- **Response 200:** Paginated audit log entries

---

### 8.11 Settings

#### `GET /api/settings`

- **Auth Required:** Yes
- **Roles:** `admin`
- **Response 200:** All app settings

#### `PUT /api/settings/:key`

- **Auth Required:** Yes
- **Roles:** `admin`
- **Request Body:** `{ "value": "..." }`
- **Response 200:** Updated setting

---

## 9. User Roles & Permissions Matrix

### 9.1 Role Definitions

| Role | Description | Typical User |
|------|-------------|-------------|
| `admin` | Full system access. Manages users, settings, and has all operational permissions. | System administrator, IT manager |
| `supervisor` | Views all data, manages cartons, views all reports. Cannot manage users or system settings. | Warehouse supervisor, floor manager |
| `warehouse_operator` | Performs day-to-day scanning, packing, unpacking, repacking. Limited report access. | Warehouse floor worker |
| `dispatch_operator` | Handles dispatch workflows. Can scan for dispatch, view dispatch reports. | Dispatch/shipping handler |

### 9.2 Permission Matrix

| Permission / Action | Admin | Supervisor | Warehouse Operator | Dispatch Operator |
|---------------------|:-----:|:----------:|:------------------:|:-----------------:|
| **User Management** |
| Create/edit/deactivate users | YES | -- | -- | -- |
| View user list | YES | -- | -- | -- |
| Change own password | YES | YES | YES | YES |
| **Product Management** |
| Create/edit products | YES | YES | -- | -- |
| View products | YES | YES | YES | YES |
| **Child Box Operations** |
| Generate QR codes (bulk) | YES | YES | YES | -- |
| Print labels | YES | YES | YES | -- |
| View child box details | YES | YES | YES | YES |
| View traceability | YES | YES | YES | YES |
| **Master Carton Operations** |
| Create master carton | YES | YES | YES | -- |
| Scan child boxes into carton | YES | YES | YES | -- |
| Finalize carton | YES | YES | YES | -- |
| Store carton | YES | YES | YES | -- |
| Unpack carton | YES | YES | YES | -- |
| Repack (create new from free) | YES | YES | YES | -- |
| Print master carton label | YES | YES | YES | -- |
| View master carton details | YES | YES | YES | YES |
| **Dispatch Operations** |
| Create dispatch | YES | YES | -- | YES |
| Scan cartons for dispatch | YES | YES | -- | YES |
| Complete dispatch | YES | YES | -- | YES |
| View dispatch details | YES | YES | -- | YES |
| **Reporting** |
| View dashboard | YES | YES | YES | YES |
| Stock reports | YES | YES | -- | -- |
| Carton inventory report | YES | YES | -- | -- |
| Dispatch report | YES | YES | -- | YES |
| Traceability report | YES | YES | -- | -- |
| Daily summary | YES | YES | -- | -- |
| **System** |
| View audit logs | YES | -- | -- | -- |
| Manage app settings | YES | -- | -- | -- |
| Export reports (CSV) | YES | YES | -- | -- |

### 9.3 RBAC Implementation

The backend RBAC middleware uses a permission-based approach:

```typescript
// middleware/rbac.ts
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['*'],  // wildcard = all permissions
  supervisor: ['products:read', 'products:write', 'childbox:read', 'childbox:write', ...],
  warehouse_operator: ['products:read', 'childbox:read', 'childbox:write', ...],
  dispatch_operator: ['products:read', 'childbox:read', 'dispatch:read', 'dispatch:write', ...],
};

// Usage in routes:
router.post('/users', auth, rbac('users:write'), userController.create);
router.post('/master-cartons/:id/unpack', auth, rbac('carton:unpack'), cartonController.unpack);
```

---

## 10. QR Code Strategy

### 10.1 QR Code Format

| Type | Code Format | Example | QR Payload (encoded in QR image) |
|------|------------|---------|----------------------------------|
| Child Box | `CB-{6-digit sequence}` | `CB-000001` | `https://binny.basiq360.com/cb/CB-000001` |
| Master Carton | `MC-{6-digit sequence}` | `MC-000001` | `https://binny.basiq360.com/mc/MC-000001` |

### 10.2 URL-Based QR Strategy

QR codes encode a URL rather than a plain string. This serves dual purposes:

1. **In-app scanning:** The app intercepts the URL, extracts the code (CB-XXXXXX or MC-XXXXXX), and performs the appropriate API lookup.
2. **External scanning:** If scanned by any phone camera (not in the app), the URL redirects to a public product information page or the Binny Footwear company website.

### 10.3 QR Code Image Specifications

| Property | Child Box Label | Master Carton Label |
|----------|----------------|---------------------|
| QR Version | Auto (based on data length) | Auto |
| Error Correction | Level M (15%) | Level H (30%) -- master carton labels face more handling |
| Module Size | 3px per module | 5px per module |
| Image Format | PNG (for label embedding) | PNG |
| Quiet Zone | 4 modules | 4 modules |

### 10.4 Sequence Management

- Sequences are managed via PostgreSQL sequences (`child_box_seq`, `master_carton_seq`)
- Sequences are never reset -- ensures globally unique codes
- Batch generation reserves a range atomically: `SELECT nextval('child_box_seq') FROM generate_series(1, N)`

---

## 11. Label Printing Specifications

> **Updated March 2026:** Label layouts redesigned per client-provided wireframes. Child box label now includes manufacturer footer and structured table layout. Master carton label now features a size assortment grid with per-size quantities.

### 11.1 Child Box Label (40mm x 60mm) — REDESIGNED

Layout matches client wireframe: structured table with QR code and size on right, manufacturer info at bottom.

```
+---------------------------------------------------+
|  Article No: ART-001                               |
+-------------------------------+--------------------+
|  Colour: Black                |  Size:             |
+-------------------------------+                    |
|  M.R.P.: ₹ 749.00            |      8             |
|  (Inc of all taxes)           |                    |
+-------------------------------+--------------------+
|  Packed on: 16-Mar-2026       |  +------------+    |
+-------------------------------+  |  QR CODE   |    |
|  Content: 2N (1 Pair)         |  |  (20x20)   |    |
+-------------------------------+  +------------+    |
|  Mfg & Mktd by: Mahavir Polymers Pvt Ltd          |
|  FE 16-17 MIA Jaipur - 302017 Raj (India)         |
|  Customer Care: 0141 2751684                       |
+---------------------------------------------------+
```

**Label Fields:**
| Field | Source | Notes |
|-------|--------|-------|
| Article No | `products.article_code` | Top row, full width |
| Colour | `products.colour` | Left column |
| Size | `products.size` or child box size | Large font, right column |
| M.R.P. | `products.mrp` | Format: `₹ {mrp}.00 (Inc of all taxes)` |
| Packed on | `child_boxes.created_at` or pack date | Date format: DD-MMM-YYYY |
| Content | Derived from `quantity` | Format: `{qty*2}N ({qty} Pair)` e.g., "2N (1 Pair)" |
| QR Code | `BINNY-CB-{id}` or URL | Right side, below size |
| Manufacturer Footer | Static / app_settings | Company name, address, customer care number |

**TSPL Commands (template):**

```
SIZE 40 mm, 60 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
BOX 10,5,310,470,2
TEXT 20,10,"3",0,1,1,"Article No: {article_code}"
BAR 10,40,300,2
TEXT 20,50,"2",0,1,1,"Colour: {colour}"
BAR 200,40,2,100
TEXT 210,50,"2",0,1,1,"Size:"
TEXT 220,75,"4",0,1,1,"{size}"
BAR 10,100,300,2
TEXT 20,110,"2",0,1,1,"M.R.P.: Rs {mrp}"
TEXT 20,130,"1",0,1,1,"(Inc of all taxes)"
BAR 10,155,300,2
TEXT 20,165,"2",0,1,1,"Packed on: {pack_date}"
BAR 10,195,300,2
TEXT 20,205,"2",0,1,1,"Content: {content}"
QRCODE 220,165,H,4,A,0,M2,S7,"{qr_data}"
BAR 10,260,300,2
TEXT 15,265,"1",0,1,1,"Mfg & Mktd by: Mahavir Polymers Pvt Ltd"
TEXT 15,280,"1",0,1,1,"FE 16-17 MIA Jaipur-302017 Raj (India)"
TEXT 15,295,"1",0,1,1,"Customer Care: 0141 2751684"
PRINT 1,1
```

### 11.2 Master Carton Label (100mm x 150mm) — REDESIGNED

Layout matches client wireframe: article details at top, size assortment grid at bottom with per-size quantities and total pairs.

```
+---------------------------------------------------+
|  [Binny Logo]                                      |
|                                                    |
|  Article No.: ART-001                              |
+---------------------------------------------------+
|  Colour: Black                                     |
+---------------------------+------------------------+
|  MRP: ₹ 749.00           |  Pack Date: 16-Mar-2026|
+---------------------------+------------------------+
|  Size Assortment                                   |
+------+------+------+------+------+------+----------+
|   9  |  10  |  11  |  12  |  13  |   1  |  Total  |
+------+------+------+------+------+------+----------+
|  10  |  10  |  10  |  10  |  10  |  10  |  60 Prs |
+------+------+------+------+------+------+----------+
```

**Label Fields:**
| Field | Source | Notes |
|-------|--------|-------|
| Binny Logo | `monogram.png` | Company HD logo at top |
| Article No. | `products.article_code` | Primary article in the carton |
| Colour | `products.colour` | Colour of the primary article |
| MRP | `products.mrp` | MRP of the primary article |
| Pack Date | `master_cartons.closed_at` or pack timestamp | DD-MMM-YYYY format |
| Size Assortment | Computed from child boxes | Grid: each size column shows count of child boxes of that size |
| Total | Sum of all size quantities | Format: `{total} Prs` |

**Size Assortment Computation:**
The backend must query child boxes in the master carton, group by size, and return a breakdown:
```json
{
  "sizeAssortment": {
    "9": 10, "10": 10, "11": 10, "12": 10, "13": 10, "1": 10
  },
  "totalPairs": 60
}
```

**Note:** The master carton label assumes single-article cartons (one article_code + one colour per carton). If a carton contains mixed articles, the label should show the primary/majority article or indicate "MIXED".

**TSPL Commands (template):**

```
SIZE 100 mm, 150 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
BITMAP 20,10,{logo_width},{logo_height},0,{logo_data}
TEXT 20,80,"4",0,1,1,"Article No.: {article_code}"
BAR 10,115,780,2
TEXT 20,125,"3",0,1,1,"Colour: {colour}"
BAR 10,160,780,2
TEXT 20,170,"3",0,1,1,"MRP: Rs {mrp}"
BAR 400,160,2,40
TEXT 410,170,"3",0,1,1,"Pack Date: {pack_date}"
BAR 10,200,780,2
TEXT 20,210,"3",0,1,1,"Size Assortment"
BAR 10,235,780,2
{dynamic_size_header_row}
BAR 10,270,780,2
{dynamic_size_quantity_row}
BAR 10,305,780,2
PRINT 1,1
```

### 11.3 Browser Printing Integration

Two printing approaches are supported:

1. **Web USB API (preferred):** Direct browser-to-printer communication via USB. No driver installation needed. Supported in Chrome/Edge.
   ```typescript
   // print.service.ts
   async function printViaWebUSB(tsplCommands: string) {
     const device = await navigator.usb.requestDevice({ filters: [{ vendorId: TSC_VENDOR_ID }] });
     await device.open();
     await device.selectConfiguration(1);
     await device.claimInterface(0);
     const encoder = new TextEncoder();
     await device.transferOut(endpoint, encoder.encode(tsplCommands));
   }
   ```

2. **Print Server Fallback:** For environments where Web USB is not available, a lightweight print server runs on the same machine as the printer. The browser sends TSPL commands via HTTP POST to `http://localhost:9100/print`.

---

## 12. PWA & Mobile Strategy

### 12.1 PWA Configuration

**manifest.json:**
```json
{
  "name": "Binny Inventory Manager",
  "short_name": "Binny IM",
  "description": "QR-based inventory management for Binny Footwear",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1B3A8C",
  "background_color": "#FFFFFF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 12.2 Service Worker Caching Strategy

| Resource Type | Strategy | Details |
|---------------|----------|---------|
| Static assets (JS, CSS, images) | Cache First | Cached on install, served from cache. Updated on new SW version. |
| API calls (GET) | Network First | Try network, fall back to cached response. Cache refreshed on every successful fetch. |
| API calls (POST/PUT) | Network Only + Offline Queue | If offline, POST/PUT requests are queued in IndexedDB. Synced when connectivity returns. |
| QR scan lookups | Network First (1s timeout) | If network doesn't respond in 1 second, serve cached result for that QR code. |

### 12.3 Offline Scanning Queue

When the device is offline:
1. QR scan is captured locally
2. Scan event is stored in IndexedDB with timestamp and action type
3. A badge/indicator shows "X scans pending sync"
4. When connectivity returns, the Background Sync API triggers upload
5. Conflicts (e.g., child box already packed by another user while offline) are surfaced to the operator

### 12.4 Mobile-First Design Principles

- Touch targets minimum 44px
- Bottom navigation bar for primary actions (Scan, Pack, Unpack, Dispatch)
- Camera opens full-screen for scanning
- Haptic feedback (vibration) on successful scan
- Audio beep on successful scan
- Large, high-contrast status badges
- Swipe gestures for common actions
- No horizontal scrolling on any viewport

---

## 13. Non-Functional Requirements

### 13.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| QR scan to API response | < 1 second | Time from QR decode to UI update |
| Page load (first contentful paint) | < 2 seconds | Lighthouse measurement on mobile |
| API response time (typical) | < 200ms | p95 latency |
| API response time (reports) | < 2 seconds | p95 latency for complex queries |
| Bulk QR generation (500 codes) | < 5 seconds | Server-side generation time |
| Database query time | < 100ms | p95 for indexed queries |

### 13.2 Scalability

| Metric | Expected Volume |
|--------|----------------|
| Child boxes | 100,000+ records within first year |
| Master cartons | 10,000+ records within first year |
| Concurrent users | 10-20 simultaneous |
| Daily scans | 500-1000 scan events per day |
| QR code generation batches | Up to 1000 per batch |

### 13.3 Security

- JWT access tokens: 15-minute expiry, RS256 signing
- Refresh tokens: 7-day expiry, stored hashed in database, single-use rotation
- All passwords hashed with bcrypt (cost factor 12)
- Input validation on all endpoints (Zod schemas)
- SQL injection prevention via parameterized queries (Knex.js)
- XSS prevention via React's default escaping + CSP headers
- CORS configured for specific origins only
- Rate limiting: 100 requests/minute per IP for general API, 10 requests/minute for login
- HTTPS enforced in production
- No sensitive data in QR codes (QR contains URL, not product/inventory data)

### 13.4 Reliability

- Database transactions for all multi-table operations (pack, unpack, dispatch)
- Optimistic locking on critical resources (master carton child count)
- Idempotent API design where possible (duplicate scan protection)
- Graceful error handling with user-friendly messages
- Health check endpoint: `GET /api/health`

### 13.5 Audit Trail

Every state change is logged in the `audit_logs` table:
- Entity type and ID
- Action performed
- Old values and new values (JSONB diff)
- User who performed the action
- Timestamp
- IP address and user agent

Audit logs are append-only and never deleted or modified.

---

## 14. Testing Strategy

### 14.1 Test Pyramid

```
        /\
       /  \        E2E Tests (Playwright)
      /    \       5-10 critical workflow tests
     /------\
    /        \     Integration Tests (Supertest + Jest)
   /          \    40-60 API endpoint tests
  /------------\
 /              \  Unit Tests (Jest)
/                \ 100+ service/utility tests
```

### 14.2 Unit Tests (Backend)

| Module | Test Focus |
|--------|-----------|
| `auth.service` | Token generation, verification, refresh rotation, password hashing |
| `childBox.service` | Bulk generation, sequence management, status transitions |
| `masterCarton.service` | Create, add child box (validation rules), finalize, unpack, state machine |
| `dispatch.service` | Create, add carton (validation), complete (cascading status updates) |
| `qrGenerator.service` | QR code generation, URL encoding, batch generation |
| `inventory.service` | Stock calculations, grouping logic |
| `labelTemplate.service` | TSPL command generation, size breakdown formatting |

### 14.3 Integration Tests (API)

- Auth flow: login -> access protected route -> token expired -> refresh -> re-access
- RBAC: verify each role can/cannot access specific endpoints
- Full lifecycle: generate child boxes -> create carton -> add boxes -> store -> unpack -> repack -> dispatch
- Validation errors: duplicate packing, invalid state transitions, missing required fields
- Pagination and filtering on list endpoints
- Report generation with various filter combinations

### 14.4 E2E Tests (Playwright)

| Test | Steps |
|------|-------|
| Login flow | Navigate to login -> enter credentials -> verify dashboard |
| Generate child boxes | Login -> navigate to generate -> select product/size/qty -> generate -> verify list |
| Pack master carton | Login -> create carton -> scan (mock) child boxes -> finalize -> verify label |
| Unpack workflow | Login -> navigate to unpack -> scan (mock) carton QR -> confirm unpack -> verify freed boxes |
| Dispatch workflow | Login -> create dispatch -> add cartons -> complete -> verify dispatch report |

### 14.5 QR Scanner Testing

Since camera-based testing is not practical in CI:
- Mock the `html5-qrcode` library in E2E tests
- Provide a "manual entry" fallback in the scanner component (type QR code instead of scanning)
- Manual testing with real devices during UAT (Week 6)

---

## 15. Deployment Architecture

### 15.1 Docker Compose (Production)

```yaml
# docker-compose.yml (simplified)
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: binny_inventory
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/binny_inventory
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    depends_on:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  pgdata:
```

### 15.2 Nginx Configuration (Reverse Proxy)

```
server {
    listen 80;
    server_name binny.basiq360.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name binny.basiq360.com;

    # SSL configuration
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 15.3 Dockerfile Patterns

**Backend (multi-stage):**
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
RUN npm ci --workspace=backend --workspace=shared
COPY backend/ ./backend/
COPY shared/ ./shared/
RUN npm run build --workspace=backend

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### 15.4 Environment Variables

```env
# .env.example

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=binny_inventory
DB_USER=binny_admin
DB_PASSWORD=<secure-password>
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# JWT
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# App
NODE_ENV=production
API_PORT=4000
FRONTEND_URL=https://binny.basiq360.com
CORS_ORIGINS=https://binny.basiq360.com

# QR
QR_BASE_URL=https://binny.basiq360.com

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/binny/app.log
```

---

## 16. Risk Register

| # | Risk | Impact | Probability | Mitigation |
|---|------|--------|-------------|------------|
| 1 | TSC printer compatibility issues across browser/OS combinations | High | Medium | Test with actual hardware in Week 2. Implement Web USB + print server fallback. |
| 2 | QR scanning performance on low-end Android phones | High | Medium | Test with budget phones early. Optimize scanner resolution settings. Provide manual code entry fallback. |
| 3 | Offline/poor connectivity in warehouse | High | High | PWA offline queue with IndexedDB. Background sync. Conflict resolution UI. |
| 4 | User adoption resistance from warehouse operators | Medium | Medium | Simple, mobile-first UI. UAT with actual operators in Week 6. Audio/haptic scan feedback. |
| 5 | Database performance with 100K+ child box records | Medium | Low | Proper indexing from Day 1. Query EXPLAIN ANALYZE during Week 5. Connection pooling. |
| 6 | Concurrent scanning conflicts (two operators packing same child box) | High | Low | Database-level unique constraint on active carton membership. Optimistic locking with clear error messages. |
| 7 | QR code label damage/unreadable | Medium | Medium | Error correction level H for master cartons. Manual code entry fallback. Reprint capability. |
| 8 | Scope creep during 6-week timeline | High | Medium | Strict weekly deliverables. Weekly demo + signoff with Binny team. Change requests formally evaluated. |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Child Box** | Inner carton containing 1 pair of footwear. Has a permanent QR code identity. |
| **Master Carton** | Outer box containing multiple child boxes. Has a dynamic QR code generated at packing time. |
| **Assortment** | The mix of sizes within a master carton (e.g., 2x Size 7, 3x Size 8, 1x Size 9). |
| **FREE** | Status of a child box that has been unpacked from a master carton and is available for repacking. |
| **TSPL** | TSC Printer Language -- command set used to control TSC thermal label printers. |
| **Lineage** | The complete history of a child box's movements through master cartons over time. |

---

## Appendix B: Weekly Demo Checklist

| Week | Demo Items |
|------|-----------|
| 1 | Docker running, login working, user CRUD, app shell navigation |
| 2 | Product master, bulk QR generation, child box label printing on TSC printer |
| 3 | QR scanning on mobile, master carton creation workflow, child box linking, master carton label |
| 4 | Store, unpack, repack, dispatch workflows end-to-end. Traceability timeline. |
| 5 | Dashboard KPIs, all reports with filters, CSV export |
| 6 | PWA install on phone, offline scanning, UAT feedback incorporated, production deployment |

---

## Appendix C: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 12, 2026 | Initial release — Phase 1 implementation plan |
| 1.1 | March 16, 2026 | Customer Master, Product expansion, Label redesign (Phase 1.5) |
| 1.2 | March 20, 2026 | Multi-Size QR Batch Generation — new `POST /child-boxes/bulk-multi-size` endpoint, `GET /products/:id/sizes` endpoint, frontend generate page rewrite with per-size quantity inputs |
| 1.3 | April 3, 2026 | UAT bug fixes (button visibility, print labels, searchable dropdown, customer-centric dispatches). Phase 2 UI Enhancement Plan added (Section 17) |

---

## 17. Phase 2: UI/UX Enhancement Plan

**Status:** Planned (April 2026)
**Scope:** Frontend-only visual modernization using existing dependencies (Tailwind CSS, lucide-react). No new npm packages. No business logic changes.

### 17.1 Motivation

During UAT (April 3, 2026), the UI was flagged as functional but visually bland. Root causes identified:
- Limited use of the color palette (navy primary barely differentiated, red accent underused)
- Flat design with minimal shadows (`shadow-sm` everywhere)
- No animations or micro-interactions
- No skeleton loaders (plain spinner on all loading states)
- No glassmorphism or depth hierarchy
- Every page uses identical white cards with thin gray borders
- Conservative typography and spacing

### 17.2 Design System Foundation

**Files:** `frontend/tailwind.config.ts`, `frontend/src/app/globals.css`

| Enhancement | Details |
|-------------|---------|
| Brand-tinted shadow scale | 3-tier system: `shadow-card` (resting), `shadow-card-hover` (interactive), `shadow-elevated` (modals). Navy-tinted rgba for brand cohesion |
| CSS-only animations | `fade-in`, `slide-up`, `scale-in` (GPU-composited, transform/opacity only), `shimmer` (skeleton loader sweep) |
| Intermediate color tones | `binny-navy-50` (#F5F4FF), `binny-navy-200` (#D8D6F0) — fill gap between light and dark navy |
| Skeleton loader utility | `.skeleton` class using shimmer animation for loading states |
| Gradient button | `.btn-primary` uses `linear-gradient(135deg, #2D2A6E, #3D3A8E)` |
| Enhanced focus states | Inputs get `ring-2 ring-binny-navy/10 shadow-sm` on focus |

### 17.3 Core Component Enhancements

| Component | File | Changes |
|-----------|------|---------|
| Card | `components/ui/Card.tsx` | `shadow-card` default, new `interactive` prop (hover lift), new `accent` prop (left border color) |
| Button | `components/ui/Button.tsx` | Gradient primary, `active:scale-[0.98]` press feedback, `transition-all` |
| Input/Select | `components/ui/Input.tsx`, `Select.tsx` | `bg-gray-50/50` default, transitions to `bg-white` on focus |
| Table | `components/ui/Table.tsx` | Navy-tinted header (`bg-binny-navy-50`), branded hover state |
| Spinner | `components/ui/Spinner.tsx` | New `SkeletonLine`, `SkeletonCard`, `SkeletonTable` exports |
| Badge | `components/ui/Badge.tsx` | Subtle matching border, `font-semibold` |

### 17.4 Layout Enhancements

| Component | File | Changes |
|-----------|------|---------|
| Sidebar | `components/layout/Sidebar.tsx` | Gradient active item + red left indicator, `bg-binny-navy-50` hover |
| Header | `components/layout/Header.tsx` | `backdrop-blur-md` glass effect, red notification dot on bell, title left accent |
| MobileNav | `components/layout/MobileNav.tsx` | `backdrop-blur-lg` glass, lighter dot-style active indicator |
| PageHeader | `components/layout/PageHeader.tsx` | Small gradient accent bar (red-to-navy) above title |

### 17.5 Page-Specific Enhancements

| Page | Changes |
|------|---------|
| Dashboard | Welcome banner (navy gradient with greeting), staggered card animations, gradient icon containers, timeline connector on recent activity |
| List pages | Skeleton loaders replace spinners, branded filter bar bg, mobile cards with status-colored left borders, enhanced empty states |
| Form pages | Section headers with icon pills, scanned items gradient bg, sticky bottom submit on mobile |
| Reports | Pill-style tab navigation |
| Login | Radial red glow, card scale-in animation |

### 17.6 PWA Enhancements

| Enhancement | File | Details |
|-------------|------|---------|
| Branded splash | `public/manifest.json` | `background_color: #2D2A6E` for navy splash on install |
| Offline page | `app/offline/page.tsx` | Navy gradient bg, branded card with accent stripe |
| Loading state | `app/(dashboard)/layout.tsx` | Branded splash with centered logo + navy bg during auth check |
| Toast notifications | `components/providers/ToastProvider.tsx` | Left accent borders (green=success, red=error) |

### 17.7 Implementation Sequence

1. **Foundation** (~30 min): tailwind.config.ts + globals.css
2. **Core Components** (~45 min): Card, Button, Input, Select, Table, Spinner, Badge
3. **Layout** (~30 min): Sidebar, Header, MobileNav, PageHeader
4. **Pages** (~60 min): Dashboard hero, list pages, form pages, reports
5. **PWA & Polish** (~20 min): manifest, offline page, loading state, toasts, login

---

*Document prepared by Basiq360 for Binny Footwear (Mahavir Polymers Pvt. Ltd.)*
*This is a living document and will be updated as the project progresses.*
