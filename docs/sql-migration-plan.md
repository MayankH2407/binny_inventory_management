# SQL Migration Plan — Binny Footwear QR-Based Inventory Management System

**Database:** PostgreSQL 15+
**Schema:** `public`
**Date:** 2026-03-20 (Updated March 20 — no migration needed for Multi-Size QR Batch Generation; March 16 — Customer Master & Product expansion)
**Author:** Database Architecture Team

---

## Table of Contents

1. [Entity Relationship Description](#1-entity-relationship-description)
2. [Migration 001 — Extensions](#migration-001--extensions)
3. [Migration 002 — Roles Table + Seed](#migration-002--roles-table--seed-default-roles)
4. [Migration 003 — Users Table](#migration-003--users-table)
5. [Migration 004 — Products Table](#migration-004--products-table)
6. [Migration 005 — Child Boxes Table](#migration-005--child-boxes-table--status-enum)
7. [Migration 006 — Master Cartons Table](#migration-006--master-cartons-table--status-enum)
8. [Migration 007 — Carton-Child Mapping Table](#migration-007--carton-child-mapping-table)
9. [Migration 008 — Inventory Transactions Table](#migration-008--inventory-transactions-table)
10. [Migration 009 — Dispatch Records Table](#migration-009--dispatch-records-table)
11. [Migration 010 — Audit Logs Table](#migration-010--audit-logs-table)
12. [Migration 011 — Performance Indexes](#migration-011--performance-indexes)
13. [Migration 012 — Seed Admin User + Default Data](#migration-012--seed-admin-user--default-data)
14. [Migration 013 — Customers Table (NEW)](#migration-013--customers-table-new)
15. [Migration 014 — Expand Products Table (NEW)](#migration-014--expand-products-table-new)
16. [Migration 015 — Add customer_id to Dispatch Records (NEW)](#migration-015--add-customer_id-to-dispatch-records-new)
17. [Key Constraints and Business Rules](#key-constraints-and-business-rules)
18. [Performance Considerations](#performance-considerations)

---

## 1. Entity Relationship Description

```
roles (1) ──────────< (N) users
                              │
                              │ (created_by / performed_by / dispatched_by)
                              ├──────────< (N) child_boxes
                              ├──────────< (N) master_cartons
                              ├──────────< (N) inventory_transactions
                              ├──────────< (N) dispatch_records
                              └──────────< (N) audit_logs

products (1) ──────< (N) child_boxes

child_boxes (1) ───< (N) carton_child_mapping
                              │
master_cartons (1) ─< (N) carton_child_mapping

master_cartons (1) ─< (N) dispatch_records

customers (1) ────────< (N) dispatch_records    # NEW — Customer Master

child_boxes (1) ───< (N) inventory_transactions
master_cartons (1) ─< (N) inventory_transactions
```

### Relationship Summary

| Parent            | Child                   | Relationship | FK Column          |
|-------------------|-------------------------|--------------|--------------------|
| roles             | users                   | 1:N          | users.role_id      |
| users             | child_boxes             | 1:N          | child_boxes.created_by |
| users             | master_cartons          | 1:N          | master_cartons.created_by |
| users             | inventory_transactions  | 1:N          | inventory_transactions.performed_by |
| users             | dispatch_records        | 1:N          | dispatch_records.dispatched_by |
| users             | audit_logs              | 1:N          | audit_logs.performed_by |
| products          | child_boxes             | 1:N          | child_boxes.product_id |
| child_boxes       | carton_child_mapping    | 1:N          | carton_child_mapping.child_box_id |
| master_cartons    | carton_child_mapping    | 1:N          | carton_child_mapping.master_carton_id |
| master_cartons    | dispatch_records        | 1:N          | dispatch_records.master_carton_id |
| child_boxes       | inventory_transactions  | 1:N (nullable) | inventory_transactions.child_box_id |
| master_cartons    | inventory_transactions  | 1:N (nullable) | inventory_transactions.master_carton_id |

### Business Flow

1. **Products** are defined as SKU masters (article + colour + size combinations).
2. **Child boxes** each represent a single pair of footwear. Each child box receives a permanent, system-generated QR code that doubles as a dynamic URL for the company website.
3. **Master cartons** group multiple child boxes for bulk handling and dispatch.
4. **Carton-child mapping** tracks which child box is currently inside which master carton, with historical data preserved via soft-unlinking (`is_active = false`).
5. **Dispatch records** capture the outbound shipment of master cartons to parties.
6. **Inventory transactions** provide a complete, append-only ledger of every operation.
7. **Audit logs** capture field-level change history on all entities for compliance.

---

## Migration 001 — Extensions

### Purpose
Enable the `uuid-ossp` extension (and `pgcrypto` as a modern alternative) for UUID primary key generation across all tables.

### UP

```sql
-- Migration 001: Create required PostgreSQL extensions
-- Description: Enable uuid-ossp for UUID generation, pgcrypto for hashing utilities

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions for primary keys';
COMMENT ON EXTENSION "pgcrypto" IS 'Cryptographic functions for hashing and random data';

COMMIT;
```

### DOWN

```sql
-- Migration 001 Rollback: Drop extensions
-- WARNING: Only safe if no other schemas depend on these extensions

BEGIN;

DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;
```

---

## Migration 002 — Roles Table + Seed Default Roles

### Purpose
Create the `roles` table and seed the four default roles with granular JSONB permissions. This table must exist before `users` because `users.role_id` references it.

### UP

```sql
-- Migration 002: Create roles table and seed default roles

BEGIN;

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(50) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_roles_name UNIQUE (name),
    CONSTRAINT chk_roles_name_not_empty CHECK (char_length(TRIM(name)) > 0)
);

COMMENT ON TABLE roles IS 'System roles with JSONB-based granular permissions';
COMMENT ON COLUMN roles.permissions IS 'Array of permission strings, e.g. ["products:read","products:write","child_boxes:scan"]';

-- Seed the four default roles

INSERT INTO roles (id, name, permissions) VALUES
(
    uuid_generate_v4(),
    'Admin',
    '[
        "users:read", "users:write", "users:delete",
        "roles:read", "roles:write",
        "products:read", "products:write", "products:delete",
        "child_boxes:read", "child_boxes:write", "child_boxes:scan", "child_boxes:generate_qr",
        "master_cartons:read", "master_cartons:write", "master_cartons:close",
        "dispatch:read", "dispatch:write",
        "reports:read", "reports:export",
        "audit:read",
        "settings:read", "settings:write"
    ]'::jsonb
),
(
    uuid_generate_v4(),
    'Supervisor',
    '[
        "users:read",
        "products:read", "products:write",
        "child_boxes:read", "child_boxes:write", "child_boxes:scan", "child_boxes:generate_qr",
        "master_cartons:read", "master_cartons:write", "master_cartons:close",
        "dispatch:read", "dispatch:write",
        "reports:read", "reports:export"
    ]'::jsonb
),
(
    uuid_generate_v4(),
    'Warehouse Operator',
    '[
        "products:read",
        "child_boxes:read", "child_boxes:scan",
        "master_cartons:read", "master_cartons:write",
        "dispatch:read"
    ]'::jsonb
),
(
    uuid_generate_v4(),
    'Dispatch Operator',
    '[
        "products:read",
        "child_boxes:read", "child_boxes:scan",
        "master_cartons:read",
        "dispatch:read", "dispatch:write",
        "reports:read"
    ]'::jsonb
);

-- Trigger function: auto-update updated_at on row modification
-- Defined once here and reused by all subsequent tables.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 002 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
DROP FUNCTION IF EXISTS fn_set_updated_at();
DROP TABLE IF EXISTS roles CASCADE;

COMMIT;
```

---

## Migration 003 — Users Table

### Purpose
Create the `users` table with a foreign key to `roles`. Email is unique and case-insensitively enforced via a functional index.

### UP

```sql
-- Migration 003: Create users table

BEGIN;

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(20),
    role_id       UUID NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_users_full_name_not_empty CHECK (char_length(TRIM(full_name)) > 0),
    CONSTRAINT chk_users_password_hash_not_empty CHECK (char_length(password_hash) > 0)
);

COMMENT ON TABLE users IS 'Application users with role-based access control';
COMMENT ON COLUMN users.password_hash IS 'bcrypt or argon2 hash — never store plaintext';
COMMENT ON COLUMN users.is_active IS 'Soft-delete flag. false = deactivated user.';

-- Case-insensitive unique index on email
CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));

-- Index for role-based lookups
CREATE INDEX idx_users_role_id ON users (role_id);

-- Index for active user queries (partial)
CREATE INDEX idx_users_active ON users (is_active) WHERE is_active = true;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 003 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TABLE IF EXISTS users CASCADE;

COMMIT;
```

---

## Migration 004 — Products Table

### Purpose
Create the `products` table (SKU master). Each row is a unique combination of article + colour + size. The `sku_code` is the system-wide identifier printed on labels and used in scans.

### UP

```sql
-- Migration 004: Create products table (SKU master)

BEGIN;

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_code        VARCHAR(50) NOT NULL,
    article_name    VARCHAR(150) NOT NULL,
    article_number  VARCHAR(50) NOT NULL,
    colour          VARCHAR(50) NOT NULL,
    size            VARCHAR(20) NOT NULL,
    mrp             DECIMAL(10,2) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_products_sku_code UNIQUE (sku_code),
    CONSTRAINT chk_products_sku_code_not_empty CHECK (char_length(TRIM(sku_code)) > 0),
    CONSTRAINT chk_products_article_name_not_empty CHECK (char_length(TRIM(article_name)) > 0),
    CONSTRAINT chk_products_article_number_not_empty CHECK (char_length(TRIM(article_number)) > 0),
    CONSTRAINT chk_products_colour_not_empty CHECK (char_length(TRIM(colour)) > 0),
    CONSTRAINT chk_products_size_not_empty CHECK (char_length(TRIM(size)) > 0),
    CONSTRAINT chk_products_mrp_positive CHECK (mrp > 0),

    -- Business rule: article_number + colour + size must be unique
    CONSTRAINT uq_products_article_colour_size UNIQUE (article_number, colour, size)
);

COMMENT ON TABLE products IS 'SKU master — each row is a unique article + colour + size combination';
COMMENT ON COLUMN products.sku_code IS 'System-wide unique SKU identifier, e.g. BF-ART001-BLK-42';
COMMENT ON COLUMN products.mrp IS 'Maximum retail price in INR';

-- Lookup by article number (common filter in UI)
CREATE INDEX idx_products_article_number ON products (article_number);

-- Filter by active products
CREATE INDEX idx_products_active ON products (is_active) WHERE is_active = true;

-- Full-text style search on article name
CREATE INDEX idx_products_article_name_trgm ON products USING gin (article_name gin_trgm_ops);
-- NOTE: The above index requires the pg_trgm extension.
-- If pg_trgm is not available, replace with a simple btree index:
-- CREATE INDEX idx_products_article_name ON products (article_name);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 004 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
DROP TABLE IF EXISTS products CASCADE;

COMMIT;
```

---

## Migration 005 — Child Boxes Table + Status Enum

### Purpose
Create the `child_box_status` enum and `child_boxes` table. Each child box represents a single pair of footwear and carries a permanent QR code. The `qr_url` field stores the dynamic redirect URL for the company website.

### UP

```sql
-- Migration 005: Create child_box_status enum and child_boxes table

BEGIN;

-- Create the status enum
CREATE TYPE child_box_status AS ENUM ('FREE', 'PACKED', 'DISPATCHED');

CREATE TABLE child_boxes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code       VARCHAR(255) NOT NULL,
    qr_url        VARCHAR(500),
    product_id    UUID NOT NULL,
    status        child_box_status NOT NULL DEFAULT 'FREE',
    packing_date  DATE,
    created_by    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_child_boxes_qr_code UNIQUE (qr_code),
    CONSTRAINT fk_child_boxes_product FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_child_boxes_created_by FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_child_boxes_qr_code_not_empty CHECK (char_length(TRIM(qr_code)) > 0),

    -- Business rule: packing_date must be set when status is PACKED or DISPATCHED
    CONSTRAINT chk_child_boxes_packing_date CHECK (
        (status = 'FREE' AND packing_date IS NULL)
        OR (status IN ('PACKED', 'DISPATCHED') AND packing_date IS NOT NULL)
    )
);

COMMENT ON TABLE child_boxes IS 'Individual child boxes, each representing one pair of footwear with a permanent QR code';
COMMENT ON COLUMN child_boxes.qr_code IS 'System-generated permanent QR identifier, never changes once assigned';
COMMENT ON COLUMN child_boxes.qr_url IS 'Dynamic URL that the QR code resolves to — can redirect to company website product page';
COMMENT ON COLUMN child_boxes.status IS 'FREE = not in any carton, PACKED = inside a master carton, DISPATCHED = shipped out';

-- Primary lookup: scan QR code to find the child box
CREATE INDEX idx_child_boxes_qr_code ON child_boxes (qr_code);

-- Filter by status (warehouse dashboards)
CREATE INDEX idx_child_boxes_status ON child_boxes (status);

-- Filter by product (inventory by SKU)
CREATE INDEX idx_child_boxes_product_id ON child_boxes (product_id);

-- Filter by creator
CREATE INDEX idx_child_boxes_created_by ON child_boxes (created_by);

-- Date range queries on packing
CREATE INDEX idx_child_boxes_packing_date ON child_boxes (packing_date)
    WHERE packing_date IS NOT NULL;

CREATE TRIGGER trg_child_boxes_updated_at
    BEFORE UPDATE ON child_boxes
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 005 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_child_boxes_updated_at ON child_boxes;
DROP TABLE IF EXISTS child_boxes CASCADE;
DROP TYPE IF EXISTS child_box_status;

COMMIT;
```

---

## Migration 006 — Master Cartons Table + Status Enum

### Purpose
Create the `master_carton_status` enum and `master_cartons` table. A master carton groups multiple child boxes. The `assortment_summary` JSONB column stores a computed breakdown of sizes and colours for label printing and quick reference.

### UP

```sql
-- Migration 006: Create master_carton_status enum and master_cartons table

BEGIN;

CREATE TYPE master_carton_status AS ENUM ('CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED');

CREATE TABLE master_cartons (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code             VARCHAR(255) NOT NULL,
    status              master_carton_status NOT NULL DEFAULT 'CREATED',
    total_pairs         INTEGER NOT NULL DEFAULT 0,
    assortment_summary  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by          UUID NOT NULL,
    closed_at           TIMESTAMPTZ,
    dispatched_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_master_cartons_qr_code UNIQUE (qr_code),
    CONSTRAINT fk_master_cartons_created_by FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_master_cartons_qr_code_not_empty CHECK (char_length(TRIM(qr_code)) > 0),
    CONSTRAINT chk_master_cartons_total_pairs_non_negative CHECK (total_pairs >= 0),

    -- Business rule: closed_at must be set only when status is CLOSED or DISPATCHED
    CONSTRAINT chk_master_cartons_closed_at CHECK (
        (status IN ('CREATED', 'ACTIVE') AND closed_at IS NULL)
        OR (status IN ('CLOSED', 'DISPATCHED') AND closed_at IS NOT NULL)
    ),

    -- Business rule: dispatched_at must be set only when status is DISPATCHED
    CONSTRAINT chk_master_cartons_dispatched_at CHECK (
        (status != 'DISPATCHED' AND dispatched_at IS NULL)
        OR (status = 'DISPATCHED' AND dispatched_at IS NOT NULL)
    )
);

COMMENT ON TABLE master_cartons IS 'Master cartons that group child boxes for bulk handling and dispatch';
COMMENT ON COLUMN master_cartons.assortment_summary IS 'Computed summary, e.g. {"sizes":{"42":3,"43":2},"colours":{"Black":3,"Brown":2},"total":5}';
COMMENT ON COLUMN master_cartons.total_pairs IS 'Denormalized count of active child boxes in this carton';

-- QR scan lookup
CREATE INDEX idx_master_cartons_qr_code ON master_cartons (qr_code);

-- Dashboard filters by status
CREATE INDEX idx_master_cartons_status ON master_cartons (status);

-- Creator lookups
CREATE INDEX idx_master_cartons_created_by ON master_cartons (created_by);

-- Date range on dispatch
CREATE INDEX idx_master_cartons_dispatched_at ON master_cartons (dispatched_at)
    WHERE dispatched_at IS NOT NULL;

CREATE TRIGGER trg_master_cartons_updated_at
    BEFORE UPDATE ON master_cartons
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 006 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_master_cartons_updated_at ON master_cartons;
DROP TABLE IF EXISTS master_cartons CASCADE;
DROP TYPE IF EXISTS master_carton_status;

COMMIT;
```

---

## Migration 007 — Carton-Child Mapping Table

### Purpose
Create the `carton_child_mapping` table that links child boxes to master cartons. This is the heart of the packing/unpacking workflow. A **partial unique index** on `child_box_id WHERE is_active = true` ensures that a child box can only be in one active carton at a time, while preserving the full history of re-packing.

### UP

```sql
-- Migration 007: Create carton_child_mapping table with partial unique index

BEGIN;

CREATE TABLE carton_child_mapping (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_carton_id  UUID NOT NULL,
    child_box_id      UUID NOT NULL,
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlinked_at       TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT fk_ccm_master_carton FOREIGN KEY (master_carton_id)
        REFERENCES master_cartons(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_ccm_child_box FOREIGN KEY (child_box_id)
        REFERENCES child_boxes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Business rule: unlinked_at must be NULL when active, NOT NULL when inactive
    CONSTRAINT chk_ccm_unlinked_consistency CHECK (
        (is_active = true AND unlinked_at IS NULL)
        OR (is_active = false AND unlinked_at IS NOT NULL)
    )
);

COMMENT ON TABLE carton_child_mapping IS 'Links child boxes to master cartons. Historical records preserved via is_active = false.';
COMMENT ON COLUMN carton_child_mapping.is_active IS 'true = child box is currently in this carton. false = was removed (unlinked_at set).';

-- CRITICAL: Partial unique index — a child box can only belong to ONE active carton at a time
CREATE UNIQUE INDEX idx_ccm_one_active_carton_per_child
    ON carton_child_mapping (child_box_id)
    WHERE is_active = true;

-- Find all active children in a given carton (packing list)
CREATE INDEX idx_ccm_carton_active ON carton_child_mapping (master_carton_id)
    WHERE is_active = true;

-- Find all mappings (active + historical) for a child box
CREATE INDEX idx_ccm_child_box_id ON carton_child_mapping (child_box_id);

-- Find all mappings for a carton (including history)
CREATE INDEX idx_ccm_master_carton_id ON carton_child_mapping (master_carton_id);

-- Time-range queries on linking activity
CREATE INDEX idx_ccm_linked_at ON carton_child_mapping (linked_at);

COMMIT;
```

### DOWN

```sql
-- Migration 007 Rollback

BEGIN;

DROP TABLE IF EXISTS carton_child_mapping CASCADE;

COMMIT;
```

---

## Migration 008 — Inventory Transactions Table

### Purpose
Create the `inventory_transactions` table. This is an **append-only ledger** — rows are never updated or deleted. Every operation (QR generation, packing, unpacking, repacking, dispatch) is recorded here for full traceability.

### UP

```sql
-- Migration 008: Create inventory_transaction_type enum and inventory_transactions table

BEGIN;

CREATE TYPE inventory_transaction_type AS ENUM (
    'QR_GENERATE',
    'PACK',
    'UNPACK',
    'REPACK',
    'DISPATCH'
);

CREATE TABLE inventory_transactions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type  inventory_transaction_type NOT NULL,
    child_box_id      UUID,
    master_carton_id  UUID,
    performed_by      UUID NOT NULL,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_itx_child_box FOREIGN KEY (child_box_id)
        REFERENCES child_boxes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_itx_master_carton FOREIGN KEY (master_carton_id)
        REFERENCES master_cartons(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_itx_performed_by FOREIGN KEY (performed_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Business rule: at least one of child_box_id or master_carton_id must be set
    CONSTRAINT chk_itx_entity_required CHECK (
        child_box_id IS NOT NULL OR master_carton_id IS NOT NULL
    )
);

-- NOTE: This table is append-only. No updated_at column. No UPDATE trigger.

COMMENT ON TABLE inventory_transactions IS 'Append-only ledger of all inventory operations for full traceability';
COMMENT ON COLUMN inventory_transactions.metadata IS 'Contextual data, e.g. {"from_carton":"uuid","to_carton":"uuid"} for REPACK';

-- Filter by transaction type (dashboards, reports)
CREATE INDEX idx_itx_transaction_type ON inventory_transactions (transaction_type);

-- Trace history for a specific child box
CREATE INDEX idx_itx_child_box_id ON inventory_transactions (child_box_id)
    WHERE child_box_id IS NOT NULL;

-- Trace history for a specific master carton
CREATE INDEX idx_itx_master_carton_id ON inventory_transactions (master_carton_id)
    WHERE master_carton_id IS NOT NULL;

-- Trace actions by a specific user
CREATE INDEX idx_itx_performed_by ON inventory_transactions (performed_by);

-- Time-range queries for reporting
CREATE INDEX idx_itx_created_at ON inventory_transactions (created_at);

-- Composite: type + time (common report query)
CREATE INDEX idx_itx_type_created_at ON inventory_transactions (transaction_type, created_at);

COMMIT;
```

### DOWN

```sql
-- Migration 008 Rollback

BEGIN;

DROP TABLE IF EXISTS inventory_transactions CASCADE;
DROP TYPE IF EXISTS inventory_transaction_type;

COMMIT;
```

---

## Migration 009 — Dispatch Records Table

### Purpose
Create the `dispatch_records` table. Each record captures the dispatch of a master carton to a party (customer/dealer), including the invoice reference.

### UP

```sql
-- Migration 009: Create dispatch_records table

BEGIN;

CREATE TABLE dispatch_records (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_carton_id  UUID NOT NULL,
    party_name        VARCHAR(255) NOT NULL,
    invoice_number    VARCHAR(100),
    dispatch_date     TIMESTAMPTZ NOT NULL,
    child_box_count   INTEGER NOT NULL,
    dispatched_by     UUID NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_dr_master_carton FOREIGN KEY (master_carton_id)
        REFERENCES master_cartons(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_dr_dispatched_by FOREIGN KEY (dispatched_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_dr_party_name_not_empty CHECK (char_length(TRIM(party_name)) > 0),
    CONSTRAINT chk_dr_child_box_count_positive CHECK (child_box_count > 0)
);

COMMENT ON TABLE dispatch_records IS 'Records each outbound dispatch of a master carton to a party';
COMMENT ON COLUMN dispatch_records.child_box_count IS 'Snapshot of child box count at time of dispatch (denormalized for reporting)';

-- Find all dispatches for a given carton
CREATE INDEX idx_dr_master_carton_id ON dispatch_records (master_carton_id);

-- Search by party
CREATE INDEX idx_dr_party_name ON dispatch_records (party_name);

-- Search by invoice
CREATE INDEX idx_dr_invoice_number ON dispatch_records (invoice_number)
    WHERE invoice_number IS NOT NULL;

-- Date range queries
CREATE INDEX idx_dr_dispatch_date ON dispatch_records (dispatch_date);

-- Dispatcher activity
CREATE INDEX idx_dr_dispatched_by ON dispatch_records (dispatched_by);

COMMIT;
```

### DOWN

```sql
-- Migration 009 Rollback

BEGIN;

DROP TABLE IF EXISTS dispatch_records CASCADE;

COMMIT;
```

---

## Migration 010 — Audit Logs Table

### Purpose
Create the `audit_logs` table. This records field-level changes on any entity for compliance and debugging. The table is append-only and partitioned by month on `created_at` for long-term performance.

### UP

```sql
-- Migration 010: Create audit_logs table (partitioned by month)

BEGIN;

CREATE TABLE audit_logs (
    id            UUID NOT NULL DEFAULT uuid_generate_v4(),
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     UUID NOT NULL,
    action        VARCHAR(30) NOT NULL,
    old_values    JSONB,
    new_values    JSONB,
    performed_by  UUID NOT NULL,
    ip_address    VARCHAR(45),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_logs PRIMARY KEY (id, created_at),

    CONSTRAINT fk_al_performed_by FOREIGN KEY (performed_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_al_entity_type_not_empty CHECK (char_length(TRIM(entity_type)) > 0),
    CONSTRAINT chk_al_action_valid CHECK (action IN (
        'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE',
        'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE'
    ))
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE audit_logs IS 'Append-only audit trail. Partitioned by month for query performance and archival.';
COMMENT ON COLUMN audit_logs.entity_type IS 'Table name: child_box, master_carton, user, product, etc.';
COMMENT ON COLUMN audit_logs.ip_address IS 'IPv4 or IPv6 address of the client that triggered the action';

-- Create initial partitions (current month + next 12 months)
-- In production, use pg_partman or a cron job to auto-create future partitions.

CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE audit_logs_2027_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE audit_logs_2027_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE audit_logs_2027_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

-- A default partition catches anything outside the defined ranges
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- Indexes on the parent table (automatically applied to partitions)
CREATE INDEX idx_al_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_al_performed_by ON audit_logs (performed_by);
CREATE INDEX idx_al_created_at ON audit_logs (created_at);
CREATE INDEX idx_al_action ON audit_logs (action);

COMMIT;
```

### DOWN

```sql
-- Migration 010 Rollback

BEGIN;

DROP TABLE IF EXISTS audit_logs CASCADE;

COMMIT;
```

---

## Migration 011 — Performance Indexes

### Purpose
Create additional composite and covering indexes that are not tied to a single table's creation but instead optimise cross-table query patterns identified in the application's critical paths.

### UP

```sql
-- Migration 011: Additional performance indexes for cross-table query optimization

BEGIN;

-- =============================================================================
-- pg_trgm extension for fuzzy / partial text search on product names and party names
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- PRODUCTS
-- =============================================================================

-- Covering index for product list API (avoids heap lookup for common columns)
CREATE INDEX idx_products_list_covering
    ON products (is_active, article_number, sku_code)
    INCLUDE (article_name, colour, size, mrp)
    WHERE is_active = true;

-- =============================================================================
-- CHILD BOXES
-- =============================================================================

-- Composite: status + product for "how many FREE boxes of SKU X?" queries
CREATE INDEX idx_child_boxes_status_product
    ON child_boxes (status, product_id);

-- Covering index for child box list API
CREATE INDEX idx_child_boxes_list_covering
    ON child_boxes (status, created_at DESC)
    INCLUDE (qr_code, product_id, packing_date);

-- =============================================================================
-- MASTER CARTONS
-- =============================================================================

-- Composite for open cartons dashboard: status + created_at
CREATE INDEX idx_master_cartons_status_created
    ON master_cartons (status, created_at DESC)
    WHERE status IN ('CREATED', 'ACTIVE');

-- =============================================================================
-- CARTON-CHILD MAPPING
-- =============================================================================

-- Composite for "list all active children in carton X with their details"
-- (the JOIN pattern: carton_child_mapping JOIN child_boxes JOIN products)
CREATE INDEX idx_ccm_active_carton_linked
    ON carton_child_mapping (master_carton_id, linked_at DESC)
    WHERE is_active = true;

-- =============================================================================
-- INVENTORY TRANSACTIONS
-- =============================================================================

-- Composite for user activity report: who did what and when
CREATE INDEX idx_itx_user_activity
    ON inventory_transactions (performed_by, created_at DESC);

-- =============================================================================
-- DISPATCH RECORDS
-- =============================================================================

-- Composite for dispatch reports: date range + party
CREATE INDEX idx_dr_date_party
    ON dispatch_records (dispatch_date DESC, party_name);

-- Trigram index for fuzzy party name search
CREATE INDEX idx_dr_party_name_trgm
    ON dispatch_records USING gin (party_name gin_trgm_ops);

-- =============================================================================
-- AUDIT LOGS
-- =============================================================================

-- Composite for entity timeline: "show me all changes to entity X"
CREATE INDEX idx_al_entity_timeline
    ON audit_logs (entity_type, entity_id, created_at DESC);

COMMIT;
```

### DOWN

```sql
-- Migration 011 Rollback

BEGIN;

DROP INDEX IF EXISTS idx_al_entity_timeline;
DROP INDEX IF EXISTS idx_dr_party_name_trgm;
DROP INDEX IF EXISTS idx_dr_date_party;
DROP INDEX IF EXISTS idx_itx_user_activity;
DROP INDEX IF EXISTS idx_ccm_active_carton_linked;
DROP INDEX IF EXISTS idx_master_cartons_status_created;
DROP INDEX IF EXISTS idx_child_boxes_list_covering;
DROP INDEX IF EXISTS idx_child_boxes_status_product;
DROP INDEX IF EXISTS idx_products_list_covering;

DROP EXTENSION IF EXISTS pg_trgm;

COMMIT;
```

---

## Migration 012 — Seed Admin User + Default Data

### Purpose
Seed the initial admin user and any reference data needed for the system to be operational on first boot. The admin password is a placeholder bcrypt hash that **must be changed on first login**.

### UP

```sql
-- Migration 012: Seed admin user and default operational data

BEGIN;

-- =============================================================================
-- Admin user
-- Password: "ChangeMe@2026!" hashed with bcrypt (cost 12)
-- IMPORTANT: Force password change on first login via application logic
-- =============================================================================

INSERT INTO users (id, email, password_hash, full_name, phone, role_id, is_active)
SELECT
    uuid_generate_v4(),
    'admin@binnyfootwear.com',
    -- bcrypt hash of "ChangeMe@2026!" — generate a real hash in production
    '$2a$12$LJ3m4ys3Lk0TSwHjfT.P4OBfdgqbFQuBGSKiGmGHCxSDE4F.GpZ4a',
    'System Administrator',
    NULL,
    r.id,
    true
FROM roles r
WHERE r.name = 'Admin'
LIMIT 1;

-- =============================================================================
-- Sample products (can be removed in production — here for smoke testing)
-- =============================================================================

INSERT INTO products (sku_code, article_name, article_number, colour, size, mrp) VALUES
    ('BF-DUKE-BLK-06', 'Duke Sports Shoe', 'DUKE-001', 'Black', '6', 1299.00),
    ('BF-DUKE-BLK-07', 'Duke Sports Shoe', 'DUKE-001', 'Black', '7', 1299.00),
    ('BF-DUKE-BLK-08', 'Duke Sports Shoe', 'DUKE-001', 'Black', '8', 1299.00),
    ('BF-DUKE-BLK-09', 'Duke Sports Shoe', 'DUKE-001', 'Black', '9', 1299.00),
    ('BF-DUKE-BLK-10', 'Duke Sports Shoe', 'DUKE-001', 'Black', '10', 1299.00),
    ('BF-DUKE-BRN-06', 'Duke Sports Shoe', 'DUKE-001', 'Brown', '6', 1299.00),
    ('BF-DUKE-BRN-07', 'Duke Sports Shoe', 'DUKE-001', 'Brown', '7', 1299.00),
    ('BF-DUKE-BRN-08', 'Duke Sports Shoe', 'DUKE-001', 'Brown', '8', 1299.00),
    ('BF-DUKE-BRN-09', 'Duke Sports Shoe', 'DUKE-001', 'Brown', '9', 1299.00),
    ('BF-DUKE-BRN-10', 'Duke Sports Shoe', 'DUKE-001', 'Brown', '10', 1299.00),
    ('BF-ROYAL-WHT-06', 'Royal Classic Slipper', 'ROYAL-002', 'White', '6', 499.00),
    ('BF-ROYAL-WHT-07', 'Royal Classic Slipper', 'ROYAL-002', 'White', '7', 499.00),
    ('BF-ROYAL-WHT-08', 'Royal Classic Slipper', 'ROYAL-002', 'White', '8', 499.00),
    ('BF-ROYAL-WHT-09', 'Royal Classic Slipper', 'ROYAL-002', 'White', '9', 499.00),
    ('BF-ROYAL-WHT-10', 'Royal Classic Slipper', 'ROYAL-002', 'White', '10', 499.00);

-- =============================================================================
-- Record the seed as an audit log entry
-- =============================================================================

INSERT INTO audit_logs (entity_type, entity_id, action, new_values, performed_by, ip_address)
SELECT
    'system',
    uuid_generate_v4(),
    'CREATE',
    '{"description": "Initial database seed: admin user and sample products"}'::jsonb,
    u.id,
    '127.0.0.1'
FROM users u
WHERE u.email = 'admin@binnyfootwear.com'
LIMIT 1;

COMMIT;
```

### DOWN

```sql
-- Migration 012 Rollback
-- WARNING: This removes all seeded data. Only run in dev/staging.

BEGIN;

-- Remove audit log seed entry
DELETE FROM audit_logs WHERE entity_type = 'system'
    AND new_values->>'description' = 'Initial database seed: admin user and sample products';

-- Remove sample products
DELETE FROM products WHERE sku_code LIKE 'BF-DUKE-%' OR sku_code LIKE 'BF-ROYAL-%';

-- Remove admin user
DELETE FROM users WHERE email = 'admin@binnyfootwear.com';

COMMIT;
```

---

## Migration 013 — Customers Table (NEW)

### Purpose
Create the `customers` table (Customer Master). Stores firm details, GSTIN, delivery location, private marka (brand mark), and contact information. Required by the updated client requirements received March 2026.

### UP

```sql
-- Migration 013: Create customers table (Customer Master)
-- Added: 2026-03-16 per updated client requirements

BEGIN;

CREATE TABLE customers (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_name               VARCHAR(255) NOT NULL,
    address                 TEXT,
    delivery_location       VARCHAR(255),
    gstin                   VARCHAR(15),
    private_marka           VARCHAR(255),
    gr                      VARCHAR(100),
    contact_person_name     VARCHAR(150),
    contact_person_mobile   VARCHAR(15),
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_customers_firm_name_not_empty CHECK (char_length(TRIM(firm_name)) > 0),
    CONSTRAINT chk_customers_gstin_format CHECK (
        gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    ),
    CONSTRAINT chk_customers_mobile_format CHECK (
        contact_person_mobile IS NULL OR contact_person_mobile ~ '^[0-9]{10,15}$'
    )
);

COMMENT ON TABLE customers IS 'Customer Master — stores firm details, GSTIN, delivery location, contact info';
COMMENT ON COLUMN customers.gstin IS '15-character GST Identification Number (Indian tax ID)';
COMMENT ON COLUMN customers.private_marka IS 'Customer private label/brand mark for their orders';
COMMENT ON COLUMN customers.gr IS 'Goods Receipt number for the customer';

-- Search by firm name (fuzzy)
CREATE INDEX idx_customers_firm_name ON customers (firm_name);
CREATE INDEX idx_customers_firm_name_trgm ON customers USING gin (firm_name gin_trgm_ops);

-- Lookup by GSTIN
CREATE INDEX idx_customers_gstin ON customers (gstin) WHERE gstin IS NOT NULL;

-- Active customers only
CREATE INDEX idx_customers_active ON customers (is_active) WHERE is_active = true;

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
```

### DOWN

```sql
-- Migration 013 Rollback

BEGIN;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
DROP TABLE IF EXISTS customers CASCADE;

COMMIT;
```

---

## Migration 014 — Expand Products Table (NEW)

### Purpose
Add new columns to the `products` table per updated client requirements: `category`, `section`, `location`, `article_group`, `hsn_code`, `size_group`. These fields support the redesigned Product Master Creation form.

### UP

```sql
-- Migration 014: Add new product fields per client requirements
-- Added: 2026-03-16

BEGIN;

-- Category: Gents, Ladies, Boys, Girls
ALTER TABLE products ADD COLUMN category VARCHAR(50);
ALTER TABLE products ADD CONSTRAINT chk_products_category
    CHECK (category IS NULL OR category IN ('Gents', 'Ladies', 'Boys', 'Girls'));

-- Section: Hawaii, PU, EVA, Fabrication, Canvas, PVC, Sports Shoes
ALTER TABLE products ADD COLUMN section VARCHAR(50);
ALTER TABLE products ADD CONSTRAINT chk_products_section
    CHECK (section IS NULL OR section IN ('Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes'));

-- Location: VKIA, MIA, F540 (manufacturing/warehouse location)
ALTER TABLE products ADD COLUMN location VARCHAR(50);
ALTER TABLE products ADD CONSTRAINT chk_products_location
    CHECK (location IS NULL OR location IN ('VKIA', 'MIA', 'F540'));

-- Article Group (free-text grouping)
ALTER TABLE products ADD COLUMN article_group VARCHAR(100);

-- HSN Code (Harmonized System Nomenclature for GST/tax)
ALTER TABLE products ADD COLUMN hsn_code VARCHAR(20);

-- Size Group (e.g., "6-10", "7-11" — defines the size range for the article)
ALTER TABLE products ADD COLUMN size_group VARCHAR(50);

COMMENT ON COLUMN products.category IS 'Product category: Gents, Ladies, Boys, Girls';
COMMENT ON COLUMN products.section IS 'Product section/type: Hawaii, PU, EVA, Fabrication, Canvas, PVC, Sports Shoes';
COMMENT ON COLUMN products.location IS 'Manufacturing/warehouse location: VKIA, MIA, F540';
COMMENT ON COLUMN products.article_group IS 'Article group for classification';
COMMENT ON COLUMN products.hsn_code IS 'HSN (Harmonized System Nomenclature) code for GST/tax classification';
COMMENT ON COLUMN products.size_group IS 'Size range for the article, e.g. 6-10, 7-11';

-- Indexes for new filter columns
CREATE INDEX idx_products_category ON products (category) WHERE category IS NOT NULL;
CREATE INDEX idx_products_section ON products (section) WHERE section IS NOT NULL;
CREATE INDEX idx_products_location ON products (location) WHERE location IS NOT NULL;

COMMIT;
```

### DOWN

```sql
-- Migration 014 Rollback

BEGIN;

DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_products_section;
DROP INDEX IF EXISTS idx_products_location;

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_category;
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_section;
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_location;

ALTER TABLE products DROP COLUMN IF EXISTS category;
ALTER TABLE products DROP COLUMN IF EXISTS section;
ALTER TABLE products DROP COLUMN IF EXISTS location;
ALTER TABLE products DROP COLUMN IF EXISTS article_group;
ALTER TABLE products DROP COLUMN IF EXISTS hsn_code;
ALTER TABLE products DROP COLUMN IF EXISTS size_group;

COMMIT;
```

---

## Migration 015 — Add customer_id to Dispatch Records (NEW)

### Purpose
Add a `customer_id` foreign key to `dispatch_records` to link dispatches to the Customer Master. This replaces the free-text `party_name` approach with a proper relational link.

### UP

```sql
-- Migration 015: Link dispatch_records to customers table
-- Added: 2026-03-16

BEGIN;

-- Add customer_id FK (nullable for backward compatibility with existing records)
ALTER TABLE dispatch_records ADD COLUMN customer_id UUID;
ALTER TABLE dispatch_records ADD CONSTRAINT fk_dr_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN dispatch_records.customer_id IS 'FK to customers table — links dispatch to a Customer Master record';

-- Index for customer-based dispatch lookups
CREATE INDEX idx_dr_customer_id ON dispatch_records (customer_id) WHERE customer_id IS NOT NULL;

COMMIT;
```

### DOWN

```sql
-- Migration 015 Rollback

BEGIN;

DROP INDEX IF EXISTS idx_dr_customer_id;
ALTER TABLE dispatch_records DROP CONSTRAINT IF EXISTS fk_dr_customer;
ALTER TABLE dispatch_records DROP COLUMN IF EXISTS customer_id;

COMMIT;
```

---

## Key Constraints and Business Rules

### Enforced at the Database Level

| # | Rule | Mechanism | Table |
|---|------|-----------|-------|
| 1 | A child box can only be in **one active master carton** at a time | Partial unique index on `child_box_id WHERE is_active = true` | carton_child_mapping |
| 2 | QR codes are **globally unique and permanent** per child box and master carton | `UNIQUE` constraint on `qr_code` | child_boxes, master_cartons |
| 3 | `packing_date` must be set when child box status is PACKED or DISPATCHED | `CHECK` constraint | child_boxes |
| 4 | `closed_at` must be set when master carton status is CLOSED or DISPATCHED | `CHECK` constraint | master_cartons |
| 5 | `dispatched_at` must be set only when master carton status is DISPATCHED | `CHECK` constraint | master_cartons |
| 6 | An inventory transaction must reference at least one entity (child box or carton) | `CHECK` constraint | inventory_transactions |
| 7 | Dispatch record must have a positive child box count | `CHECK` constraint | dispatch_records |
| 8 | Mapping `is_active` and `unlinked_at` must be consistent | `CHECK` constraint | carton_child_mapping |
| 9 | Users cannot be deleted if they created boxes, cartons, transactions, or dispatches | `ON DELETE RESTRICT` on all FKs | Multiple |
| 10 | Roles cannot be deleted if users reference them | `ON DELETE RESTRICT` | users |
| 11 | Products cannot be deleted if child boxes reference them | `ON DELETE RESTRICT` | child_boxes |
| 12 | `total_pairs` on master carton cannot be negative | `CHECK` constraint | master_cartons |
| 13 | MRP must be positive | `CHECK` constraint | products |
| 14 | Email must match a basic email regex pattern | `CHECK` constraint | users |
| 15 | SKU code = article_number + colour + size must be unique | `UNIQUE` constraint on composite | products |
| 16 | Audit log actions restricted to a defined set | `CHECK` constraint | audit_logs |
| 17 | GSTIN must match Indian GST format (15 chars) | `CHECK` constraint with regex | customers |
| 18 | Contact mobile must be 10-15 digits | `CHECK` constraint with regex | customers |
| 19 | Firm name cannot be empty | `CHECK` constraint | customers |
| 20 | Product category restricted to defined values | `CHECK` constraint (Gents/Ladies/Boys/Girls) | products |
| 21 | Product section restricted to defined values | `CHECK` constraint (Hawaii/PU/EVA/etc.) | products |
| 22 | Product location restricted to defined values | `CHECK` constraint (VKIA/MIA/F540) | products |
| 23 | Customers cannot be deleted if dispatches reference them | `ON DELETE RESTRICT` FK | dispatch_records |

### Enforced at the Application Level (not in SQL)

| # | Rule | Reason |
|---|------|--------|
| 1 | A CLOSED carton cannot accept new child boxes | Requires status check before INSERT — best in app layer for clear error messages |
| 2 | A DISPATCHED child box or carton cannot be modified | Requires status check before UPDATE — same rationale |
| 3 | `assortment_summary` and `total_pairs` must be recomputed on pack/unpack | Involves aggregation query — triggered from app code or a DB trigger (see below) |
| 4 | Admin password must be changed on first login | Session/auth logic |
| 5 | QR code format validation (prefix, length, checksum) | Business format rules that may change |

### Optional: Trigger to Auto-Update Master Carton Totals

```sql
-- Optional trigger to keep master_cartons.total_pairs in sync
-- Attach to carton_child_mapping INSERT/UPDATE

CREATE OR REPLACE FUNCTION fn_update_carton_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the affected carton(s)
    UPDATE master_cartons mc
    SET
        total_pairs = (
            SELECT COUNT(*)
            FROM carton_child_mapping ccm
            WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
        ),
        assortment_summary = (
            SELECT jsonb_build_object(
                'sizes', COALESCE(jsonb_object_agg_sizes.agg, '{}'::jsonb),
                'colours', COALESCE(jsonb_object_agg_colours.agg, '{}'::jsonb),
                'total', COUNT(*)
            )
            FROM carton_child_mapping ccm
            JOIN child_boxes cb ON cb.id = ccm.child_box_id
            JOIN products p ON p.id = cb.product_id
            LEFT JOIN LATERAL (
                SELECT jsonb_object_agg(size, cnt) AS agg
                FROM (
                    SELECT p2.size, COUNT(*) AS cnt
                    FROM carton_child_mapping ccm2
                    JOIN child_boxes cb2 ON cb2.id = ccm2.child_box_id
                    JOIN products p2 ON p2.id = cb2.product_id
                    WHERE ccm2.master_carton_id = mc.id AND ccm2.is_active = true
                    GROUP BY p2.size
                ) sub
            ) jsonb_object_agg_sizes ON true
            LEFT JOIN LATERAL (
                SELECT jsonb_object_agg(colour, cnt) AS agg
                FROM (
                    SELECT p3.colour, COUNT(*) AS cnt
                    FROM carton_child_mapping ccm3
                    JOIN child_boxes cb3 ON cb3.id = ccm3.child_box_id
                    JOIN products p3 ON p3.id = cb3.product_id
                    WHERE ccm3.master_carton_id = mc.id AND ccm3.is_active = true
                    GROUP BY p3.colour
                ) sub
            ) jsonb_object_agg_colours ON true
            WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
            LIMIT 1
        )
    WHERE mc.id IN (NEW.master_carton_id, OLD.master_carton_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uncomment below to activate:
-- CREATE TRIGGER trg_ccm_update_carton_totals
--     AFTER INSERT OR UPDATE ON carton_child_mapping
--     FOR EACH ROW
--     EXECUTE FUNCTION fn_update_carton_totals();
```

---

## Performance Considerations

### 1. Index Strategy Summary

| Index | Table | Type | Purpose |
|-------|-------|------|---------|
| `idx_users_email_lower` | users | Unique, btree | Case-insensitive login lookup |
| `idx_users_active` | users | Partial btree | Active user listing |
| `idx_products_list_covering` | products | Covering btree | Product list API without heap fetch |
| `idx_products_article_name_trgm` | products | GIN trigram | Fuzzy product name search |
| `idx_child_boxes_status_product` | child_boxes | Composite btree | Inventory count by SKU and status |
| `idx_child_boxes_list_covering` | child_boxes | Covering btree | Child box list API without heap fetch |
| `idx_ccm_one_active_carton_per_child` | carton_child_mapping | Partial unique | Business rule enforcement + lookup |
| `idx_ccm_active_carton_linked` | carton_child_mapping | Partial composite | Packing list for a carton |
| `idx_itx_type_created_at` | inventory_transactions | Composite btree | Report queries by type and date |
| `idx_itx_user_activity` | inventory_transactions | Composite btree | User activity audit |
| `idx_dr_party_name_trgm` | dispatch_records | GIN trigram | Fuzzy party name search |
| `idx_dr_date_party` | dispatch_records | Composite btree | Dispatch reports by date and party |
| `idx_al_entity_timeline` | audit_logs | Composite btree | Entity change history |
| `idx_customers_firm_name_trgm` | customers | GIN trigram | Fuzzy firm name search |
| `idx_customers_gstin` | customers | Partial btree | GSTIN lookup |
| `idx_customers_active` | customers | Partial btree | Active customer listing |
| `idx_products_category` | products | Partial btree | Category filter |
| `idx_products_section` | products | Partial btree | Section filter |
| `idx_products_location` | products | Partial btree | Location filter |
| `idx_dr_customer_id` | dispatch_records | Partial btree | Customer-based dispatch lookup |

### 2. Table Partitioning

- **audit_logs** is partitioned by month on `created_at`. This is critical because audit logs grow unboundedly and older partitions can be archived or detached without downtime.
- Consider partitioning **inventory_transactions** by month as well if volume exceeds 10M rows/month.

### 3. Connection Pooling

- Use PgBouncer in transaction mode with a pool size of 20-50 connections.
- Set `statement_timeout = 30s` for the application role to prevent runaway queries.

### 4. Vacuuming and Maintenance

- **child_boxes** and **carton_child_mapping** are high-write tables. Set aggressive autovacuum:
  ```sql
  ALTER TABLE child_boxes SET (autovacuum_vacuum_scale_factor = 0.05);
  ALTER TABLE carton_child_mapping SET (autovacuum_vacuum_scale_factor = 0.05);
  ```

### 5. Read Replicas

- Route all reporting/dashboard queries to a streaming replica.
- Write operations (pack, unpack, dispatch) go to the primary.

### 6. JSONB Column Guidelines

- `roles.permissions`: Small, rarely updated. No index needed unless querying by individual permission.
- `master_cartons.assortment_summary`: Denormalized for read performance. Recomputed on pack/unpack.
- `inventory_transactions.metadata`: Variable structure. Add a GIN index only if querying metadata fields directly:
  ```sql
  CREATE INDEX idx_itx_metadata ON inventory_transactions USING gin (metadata);
  ```
- `audit_logs.old_values / new_values`: Write-heavy, rarely queried by content. No index.

### 7. UUID vs Serial Performance

UUIDs are used for all primary keys to support:
- Distributed ID generation (no central sequence contention)
- Safe client-side ID generation for offline-first mobile scanning
- Non-guessable IDs in API URLs

Trade-off: UUIDs are 16 bytes vs 8 bytes for bigint. For tables expected to exceed 100M rows (audit_logs, inventory_transactions), monitor index bloat and consider `uuid_generate_v7()` (time-ordered UUIDs) when available in your PostgreSQL version, as they produce sequential-like values that reduce btree index fragmentation.

### 8. Estimated Storage (First Year)

| Table | Est. Rows/Year | Est. Size |
|-------|---------------|-----------|
| products | 500-2,000 | < 1 MB |
| child_boxes | 500K-2M | 200-800 MB |
| master_cartons | 10K-50K | 10-50 MB |
| carton_child_mapping | 500K-2M | 150-600 MB |
| inventory_transactions | 1M-5M | 500 MB-2 GB |
| dispatch_records | 10K-50K | 10-50 MB |
| audit_logs | 2M-10M | 1-5 GB |

---

## Migration Execution Order

```
001_create_extensions.sql
002_create_roles.sql
003_create_users.sql
004_create_products.sql
005_create_child_boxes.sql
006_create_master_cartons.sql
007_create_carton_child_mapping.sql
008_create_inventory_transactions.sql
009_create_dispatch_records.sql
010_create_audit_logs.sql
011_create_performance_indexes.sql
012_seed_default_data.sql
```

Run with a migration tool such as **golang-migrate**, **Flyway**, **Knex.js**, or **Prisma Migrate**. Each migration must be idempotent (wrap in transactions, use `IF NOT EXISTS` where supported).

---

## Quick Validation Queries

After running all migrations, execute these to verify the schema is correct:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check all enums
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
ORDER BY t.typname, e.enumsortorder;

-- Check all foreign keys
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Verify admin user was seeded
SELECT u.email, u.full_name, r.name AS role
FROM users u JOIN roles r ON u.role_id = r.id
WHERE u.email = 'admin@binnyfootwear.com';

-- Verify all indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```
