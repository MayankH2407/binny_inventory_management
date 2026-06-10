# Phase 44 — Backend API: Inventory, Dispatch, Reports, Customers

**Authored:** 2026-06-09 (Track B)  
**Author track:** B5 (Sonnet execution under Opus brief)  
**Framework:** Playwright `request` context (jest/supertest-compatible)  
**Spec references:** `13-inventory`, `30-inventory-drilldown`, `34-mrp-and-carton-hierarchy`, `21-dispatch-rbac`, `33-dispatch-multi-source`, `24-reports-rbac`, `09-customers`, `18-customers-rbac`, `35-customer-bulk-upload`

---

## Key RBAC facts verified against code

| Surface | Gate | Admin | Supervisor | WH Op | Dispatch Op | Unauth |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `GET /inventory/dashboard` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/stock/summary` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/stock/hierarchy` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/cartons/hierarchy` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/trace/:barcode` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/breakdown` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /inventory/transactions` | `inventory:read` | 200 | **403** | **403** | **403** | 401 |
| `GET /inventory/cartons/export` | `inventory:read` | 200 | **403** | **403** | **403** | 401 |
| `POST /dispatches` | `dispatch:create` | 200 | **403** | **403** | 200 | 401 |
| `GET /dispatches` | `authenticate` only | 200 | 200 | **not gated — 200** | 200 | 401 |
| `GET /dispatches/:id` | `authenticate` only | 200 | 200 | **not gated — 200** | 200 | 401 |
| `GET /reports/*` (all) | `reports:view_all` | 200 | 200 | **403** | **403** | 401 |
| `POST /customers` | `customers:create` | 200 | **403** | **403** | **403** | 401 |
| `GET /customers` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /customers/primary-dealers` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /customers/:id/sub-dealers` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /customers/:id` | `authenticate` only | 200 | 200 | 200 | 200 | 401 |
| `GET /customers/bulk-upload/sample` | `customers:read` (Admin-only per seed) | 200 | **403** | **403** | **403** | 401 |
| `POST /customers/bulk-upload` | `customers:create` | 200 | **403** | **403** | **403** | 401 |
| `PUT /customers/:id` | `customers:update` | 200 | **403** | **403** | **403** | 401 |
| `DELETE /customers/:id` | `customers:delete` | 200 | **403** | **403** | **403** | 401 |

**Important discrepancies / document-as-TCs:**
1. **`GET /dispatches` and `GET /dispatches/:id` are `authenticate`-only** — WH Operator gets 200 even though WH Op has no `dispatch:read` permission. (The route has no `authorizePermission` gate for the GET variants.)
2. **Master-carton dispatch accepts ACTIVE or CLOSED** — service code validates `status !== CLOSED && status !== ACTIVE` and rejects CREATED/DISPATCHED. The phrase "CLOSED-only" in some docs is wrong; ACTIVE cartons are also dispatchable.
3. **`reports:view_own`, `reports:view_dispatch`, `reports:export`** are seeded for WH Op and Dispatch Op respectively, but no route consumes them — DEAD permissions. All report routes use `reports:view_all` only.
4. **Spec 21-dispatch-rbac** asserts Supervisor dispatch create = 201; correct behavior is 403 (Supervisor lacks `dispatch:create`). Encode as explicit flag TC.
5. **`customers:read`** is not in any seed — Admin bypasses; Supervisor/WH/Dispatch all lack it → `GET /customers/bulk-upload/sample` returns 403 for all non-Admin roles.

---

## Table of Contents

1. [Inventory — Auth-Only Endpoints](#1-inventory--auth-only-endpoints)
2. [Inventory — inventory:read-gated Endpoints](#2-inventory--inventoryread-gated-endpoints)
3. [Inventory — Trace Barcode](#3-inventory--trace-barcode)
4. [Inventory — Breakdown (7-Level Drill-Down)](#4-inventory--breakdown-7-level-drill-down)
5. [Dispatches — RBAC](#5-dispatches--rbac)
6. [Dispatches — Create Multi-Source Business Rules](#6-dispatches--create-multi-source-business-rules)
7. [Dispatches — List and Detail](#7-dispatches--list-and-detail)
8. [Reports — RBAC](#8-reports--rbac)
9. [Reports — Endpoint Contracts](#9-reports--endpoint-contracts)
10. [Reports — CSV Export Contracts](#10-reports--csv-export-contracts)
11. [Customers — RBAC](#11-customers--rbac)
12. [Customers — Create and Validation](#12-customers--create-and-validation)
13. [Customers — List, Detail, Sub-Dealers](#13-customers--list-detail-sub-dealers)
14. [Customers — Update and Delete](#14-customers--update-and-delete)
15. [Customers — Bulk Upload](#15-customers--bulk-upload)

---

## 1. Inventory — Auth-Only Endpoints

> Routes: `GET /inventory/dashboard`, `/stock/summary`, `/stock/hierarchy`, `/cartons/hierarchy`, `/breakdown`  
> Gate: `authenticate` only — **all 4 roles return 200**.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-INV-001 | Unauthenticated | Dashboard — no token → 401 | P1 | `GET /api/inventory/dashboard` (no Authorization header) | 401 with `{ success: false }` | API | Spec 13 |
| TC-API-INV-002 | Admin | Dashboard — Admin → 200 | P1 | Authenticate as Admin; `GET /api/inventory/dashboard` | 200; body contains `totalChildBoxes`, `totalMasterCartons`, `totalPairsInStock`, `todayDispatches`, `recentTransactions` (array ≤ 20) | API | Auth-only gate |
| TC-API-INV-003 | Supervisor | Dashboard — Supervisor → 200 | P1 | Authenticate as Supervisor; `GET /api/inventory/dashboard` | 200; same shape as Admin response | API | Auth-only gate |
| TC-API-INV-004 | Warehouse Operator | Dashboard — WH Op → 200 | P1 | Authenticate as WH Op; `GET /api/inventory/dashboard` | 200 | API | Auth-only gate |
| TC-API-INV-005 | Dispatch Operator | Dashboard — Dispatch Op → 200 | P1 | Authenticate as Dispatch Op; `GET /api/inventory/dashboard` | 200 | API | Auth-only gate |
| TC-API-INV-010 | Unauthenticated | Stock summary — no token → 401 | P1 | `GET /api/inventory/stock/summary` (no token) | 401 | API | |
| TC-API-INV-011 | Admin | Stock summary — Admin → 200 | P1 | Authenticate as Admin; `GET /api/inventory/stock/summary` | 200; response includes aggregate stock counts | API | Spec 13 |
| TC-API-INV-012 | Supervisor | Stock summary — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/inventory/stock/summary` | 200 | API | Auth-only |
| TC-API-INV-013 | Warehouse Operator | Stock summary — WH Op → 200 | P2 | Authenticate as WH Op; `GET /api/inventory/stock/summary` | 200 | API | Auth-only |
| TC-API-INV-014 | Dispatch Operator | Stock summary — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; `GET /api/inventory/stock/summary` | 200 | API | Auth-only |
| TC-API-INV-020 | Unauthenticated | Stock hierarchy — no token → 401 | P1 | `GET /api/inventory/stock/hierarchy` (no token) | 401 | API | |
| TC-API-INV-021 | Admin | Stock hierarchy level=section → 200 | P1 | Authenticate as Admin; `GET /api/inventory/stock/hierarchy?level=section` | 200; array of `{ name, totalPairs, inStock, packed, dispatched, childBoxCount, cartonCount, distinctMrpCount }` | API | Spec 30 |
| TC-API-INV-022 | Admin | Stock hierarchy level=article_name → 200 | P1 | `GET /api/inventory/stock/hierarchy?level=article_name` | 200; rows keyed by article_name | API | |
| TC-API-INV-023 | Admin | Stock hierarchy level=mrp → 200 | P2 | `GET /api/inventory/stock/hierarchy?level=mrp` | 200 | API | |
| TC-API-INV-024 | Admin | Stock hierarchy level=colour → 200 | P2 | `GET /api/inventory/stock/hierarchy?level=colour` | 200 | API | |
| TC-API-INV-025 | Admin | Stock hierarchy level=product → 200 | P2 | `GET /api/inventory/stock/hierarchy?level=product` | 200; leaf-level rows | API | |
| TC-API-INV-026 | Admin | Stock hierarchy default level (no param) → section | P2 | `GET /api/inventory/stock/hierarchy` (no level param) | 200; defaults to `section` level | API | Fallback branch in controller |
| TC-API-INV-027 | Admin | Stock hierarchy invalid level → defaults to section | P3 | `GET /api/inventory/stock/hierarchy?level=bogus` | 200; falls back to `section` (no 400 — controller uses fallback) | API | Behavioral: no Zod validation on level here |
| TC-API-INV-028 | Supervisor | Stock hierarchy — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/inventory/stock/hierarchy?level=section` | 200 | API | Auth-only |
| TC-API-INV-029 | Warehouse Operator | Stock hierarchy — WH Op → 200 | P2 | Authenticate as WH Op; `GET /api/inventory/stock/hierarchy?level=section` | 200 | API | Auth-only |
| TC-API-INV-030 | Dispatch Operator | Stock hierarchy — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; `GET /api/inventory/stock/hierarchy?level=section` | 200 | API | Auth-only |
| TC-API-INV-035 | Unauthenticated | Carton hierarchy — no token → 401 | P1 | `GET /api/inventory/cartons/hierarchy?level=status` (no token) | 401 | API | Spec 34 |
| TC-API-INV-036 | Admin | Carton hierarchy level=status → 200 | P1 | `GET /api/inventory/cartons/hierarchy?level=status` | 200; pagination; rows have `name` (CREATED/ACTIVE/CLOSED/DISPATCHED), `cartonCount`, `childBoxCount`, `totalPairs`, `avgUtilization` | API | |
| TC-API-INV-037 | Admin | Carton hierarchy level=section → 200 | P1 | `GET /api/inventory/cartons/hierarchy?level=section` | 200; rows grouped by section with per-status sub-counts | API | |
| TC-API-INV-038 | Admin | Carton hierarchy level=article_name → 200 | P2 | `GET /api/inventory/cartons/hierarchy?level=article_name` | 200 | API | |
| TC-API-INV-039 | Admin | Carton hierarchy level=carton → 200 | P2 | `GET /api/inventory/cartons/hierarchy?level=carton` | 200; leaf rows include `carton_barcode`, `status`, utilization % | API | |
| TC-API-INV-040 | Admin | Carton hierarchy missing level param → 400 | P1 | `GET /api/inventory/cartons/hierarchy` (no level) | 400 Zod validation error (level is required enum) | API | Schema: `z.enum(['status','section','article_name','carton'])` |
| TC-API-INV-041 | Admin | Carton hierarchy invalid level → 400 | P1 | `GET /api/inventory/cartons/hierarchy?level=bogus` | 400 | API | Zod rejects invalid enum value |
| TC-API-INV-042 | Admin | Carton hierarchy with status filter → 200 | P2 | `GET /api/inventory/cartons/hierarchy?level=section&status=CLOSED` | 200; rows filtered to CLOSED cartons | API | |
| TC-API-INV-043 | Admin | Carton hierarchy pagination | P2 | `GET /api/inventory/cartons/hierarchy?level=carton&page=2&limit=10` | 200; `page` and `total` reflected; second page of results | API | |
| TC-API-INV-044 | Supervisor | Carton hierarchy — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/inventory/cartons/hierarchy?level=status` | 200 | API | Auth-only |
| TC-API-INV-045 | Warehouse Operator | Carton hierarchy — WH Op → 200 | P2 | Authenticate as WH Op; `GET /api/inventory/cartons/hierarchy?level=status` | 200 | API | Auth-only |
| TC-API-INV-046 | Dispatch Operator | Carton hierarchy — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; `GET /api/inventory/cartons/hierarchy?level=status` | 200 | API | Auth-only |

---

## 2. Inventory — inventory:read-gated Endpoints

> Routes: `GET /inventory/transactions`, `GET /inventory/cartons/export`  
> Gate: `authorizePermission('inventory:read')` — **only Admin passes; Supervisor, WH Op, Dispatch Op all 403**.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-INV-050 | Unauthenticated | Transactions — no token → 401 | P1 | `GET /api/inventory/transactions` (no token) | 401 | API | |
| TC-API-INV-051 | Admin | Transactions — Admin → 200 | P1 | Authenticate as Admin; `GET /api/inventory/transactions` | 200; paginated list; default page=1 limit=25 | API | Spec 13 |
| TC-API-INV-052 | Supervisor | Transactions — Supervisor → 403 | P1 | Authenticate as Supervisor; `GET /api/inventory/transactions` | 403 `Required permission: inventory:read` | API | Supervisor has `dispatch:read` but NOT `inventory:read` |
| TC-API-INV-053 | Warehouse Operator | Transactions — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/inventory/transactions` | 403 | API | `inventory:read` not in WH Op seed |
| TC-API-INV-054 | Dispatch Operator | Transactions — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/inventory/transactions` | 403 | API | `inventory:read` not in Dispatch Op seed |
| TC-API-INV-055 | Admin | Transactions — filter by transaction_type | P2 | `GET /api/inventory/transactions?transaction_type=CHILD_PACKED` | 200; all rows have `transaction_type = 'CHILD_PACKED'` | API | |
| TC-API-INV-056 | Admin | Transactions — filter by child_box_id | P2 | `GET /api/inventory/transactions?child_box_id=<valid-uuid>` | 200; rows filtered | API | |
| TC-API-INV-057 | Admin | Transactions — filter by master_carton_id | P2 | `GET /api/inventory/transactions?master_carton_id=<valid-uuid>` | 200; rows filtered | API | |
| TC-API-INV-058 | Admin | Transactions — filter by performed_by | P2 | `GET /api/inventory/transactions?performed_by=<user-uuid>` | 200; rows for that user | API | |
| TC-API-INV-059 | Admin | Transactions — filter by date range | P2 | `GET /api/inventory/transactions?from_date=2026-01-01&to_date=2026-06-30` | 200; rows within date window | API | |
| TC-API-INV-060 | Admin | Transactions — pagination | P2 | `GET /api/inventory/transactions?page=2&limit=10` | 200; second page; total reflects full count | API | |
| TC-API-INV-065 | Unauthenticated | Carton export — no token → 401 | P1 | `GET /api/inventory/cartons/export?level=status` (no token) | 401 | API | |
| TC-API-INV-066 | Admin | Carton export level=status → CSV 200 | P1 | Authenticate as Admin; `GET /api/inventory/cartons/export?level=status` | 200; `Content-Type: text/csv`; `Content-Disposition: attachment; filename="carton-hierarchy-status-<date>.csv"`; CSV headers: `"Status","Carton Count","Child Boxes","Total Pairs","Avg Utilization %"` | API | Spec 34 |
| TC-API-INV-067 | Admin | Carton export level=section → CSV 200 | P2 | `GET /api/inventory/cartons/export?level=section` | 200 CSV; headers: `"Section","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"` | API | |
| TC-API-INV-068 | Admin | Carton export level=article_name → CSV 200 | P2 | `GET /api/inventory/cartons/export?level=article_name` | 200 CSV; headers: `"Section","Article","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"` | API | |
| TC-API-INV-069 | Admin | Carton export level=carton → CSV 200 | P2 | `GET /api/inventory/cartons/export?level=carton` | 200 CSV; headers: `"Carton Barcode","Status","Section (Primary)","Article (Primary)","Child Count","Max Capacity","Utilization %","Created At","Closed At","Dispatched At"` | API | |
| TC-API-INV-070 | Admin | Carton export — special chars escaped | P2 | Seed a carton whose primary article contains a comma or double-quote; `GET /api/inventory/cartons/export?level=carton` | CSV values with commas/quotes are RFC-4180 escaped (`""` doubling inside double-quoted fields) | API | `toCSV` escapes: `val.replace(/"/g, '""')` |
| TC-API-INV-071 | Supervisor | Carton export — Supervisor → 403 | P1 | Authenticate as Supervisor; `GET /api/inventory/cartons/export?level=status` | 403 | API | `inventory:read` not in Supervisor seed |
| TC-API-INV-072 | Warehouse Operator | Carton export — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/inventory/cartons/export?level=status` | 403 | API | |
| TC-API-INV-073 | Dispatch Operator | Carton export — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/inventory/cartons/export?level=status` | 403 | API | |
| TC-API-INV-074 | Admin | Carton export — missing level → 400 | P1 | `GET /api/inventory/cartons/export` (no level param) | 400 Zod validation error (cartonHierarchyQuerySchema requires level enum) | API | |

---

## 3. Inventory — Trace Barcode

> Route: `GET /inventory/trace/:barcode`  
> Gate: `authenticate` only. SR/EC barcodes are **not traceable** (404). GENERATED barcode triggers auto-activation before trace.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-INV-080 | Unauthenticated | Trace — no token → 401 | P1 | `GET /api/inventory/trace/CB000001` (no token) | 401 | API | Spec 13 |
| TC-API-INV-081 | Admin | Trace child-box barcode → 200 with full payload | P1 | Authenticate as Admin; `GET /api/inventory/trace/<valid-child-box-barcode>` | 200; body contains `{ childBox, product, masterCarton, dispatch, timeline }` | API | Spec 13 |
| TC-API-INV-082 | Supervisor | Trace child-box — Supervisor → 200 | P2 | Authenticate as Supervisor; trace valid child-box barcode | 200 | API | Auth-only |
| TC-API-INV-083 | Warehouse Operator | Trace child-box — WH Op → 200 | P2 | Authenticate as WH Op; trace valid child-box barcode | 200 | API | Auth-only |
| TC-API-INV-084 | Dispatch Operator | Trace child-box — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; trace valid child-box barcode | 200 | API | Auth-only |
| TC-API-INV-085 | Admin | Trace child-box — barcode uppercased server-side | P2 | `GET /api/inventory/trace/cb000001` (lowercase) | 200; server UPPERCASEs the barcode before lookup | API | `UPPER($1)` in query |
| TC-API-INV-086 | Admin | Trace child-box — packed in carton | P2 | Trace a PACKED child-box barcode | 200; `masterCarton` is non-null; `dispatch` is null | API | |
| TC-API-INV-087 | Admin | Trace child-box — dispatched | P2 | Trace a DISPATCHED child-box barcode | 200; `masterCarton` non-null; `dispatch` non-null | API | |
| TC-API-INV-088 | Admin | Trace child-box — FREE (no carton) | P2 | Trace a FREE child-box barcode | 200; `masterCarton` is null; `dispatch` is null | API | |
| TC-API-INV-089 | Admin | Trace child-box — timeline events present | P2 | Trace child-box that has been through pack→unpack→pack | 200; `timeline` array with at least CHILD_PACKED entries; each entry has `action`, `description`, `performed_by`, `performed_at` | API | DB column aliases in query |
| TC-API-INV-090 | Admin | Trace master-carton barcode → 200 | P1 | `GET /api/inventory/trace/<valid-carton-barcode>` (MC prefix) | 200; body contains `{ masterCarton, dispatch, timeline }` (no `childBox` key) | API | Spec 13 |
| TC-API-INV-091 | Admin | Trace master-carton — dispatched carton has dispatch record | P2 | Trace a dispatched master carton | 200; `dispatch` non-null | API | |
| TC-API-INV-092 | Admin | Trace SR barcode → 404 | P1 | `GET /api/inventory/trace/SR000001` | 404 `No child box or master carton found with barcode: SR000001` | API | SR barcodes not in child_boxes or master_cartons; spec 22 known discrepancy |
| TC-API-INV-093 | Admin | Trace EC barcode → 404 | P1 | `GET /api/inventory/trace/EC000001` | 404 | API | EC barcodes not traceable via this endpoint |
| TC-API-INV-094 | Admin | Trace unknown barcode → 404 | P1 | `GET /api/inventory/trace/XXXXXXXX` | 404 | API | |
| TC-API-INV-095 | Admin | Trace GENERATED child-box → auto-activates then returns 200 | P1 | Seed a GENERATED child-box `CB100001`; `GET /api/inventory/trace/CB100001` | 200; box now has status FREE (auto-activated on trace); timeline includes CHILD_ACTIVATED event | Integration | Spec 30; traceByBarcode triggers activation side-effect |

---

## 4. Inventory — Breakdown (7-Level Drill-Down)

> Route: `GET /inventory/breakdown`  
> Gate: `authenticate` only. Zod validates `level` (enum) and required `path` fields per level.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-INV-100 | Unauthenticated | Breakdown — no token → 401 | P1 | `GET /api/inventory/breakdown?level=section` (no token) | 401 | API | Spec 30 |
| TC-API-INV-101 | Admin | Breakdown level=section → 200 | P1 | `GET /api/inventory/breakdown?level=section` (no path fields required) | 200; array of section-level nodes | API | |
| TC-API-INV-102 | Admin | Breakdown level=category requires path.section | P1 | `GET /api/inventory/breakdown?level=category&path[section]=Hawaii` | 200 | API | |
| TC-API-INV-103 | Admin | Breakdown level=category — missing path.section → 400 | P1 | `GET /api/inventory/breakdown?level=category` (no path.section) | 400; `level="category" requires path fields: section` | API | Zod refine |
| TC-API-INV-104 | Admin | Breakdown level=group requires path.section + path.category | P2 | `GET /api/inventory/breakdown?level=group&path[section]=Hawaii&path[category]=Gents` | 200 | API | |
| TC-API-INV-105 | Admin | Breakdown level=article requires section+category+group | P2 | Provide all three path fields; `level=article` | 200 | API | |
| TC-API-INV-106 | Admin | Breakdown level=colour requires section+category+group+article | P2 | Provide all four; `level=colour` | 200 | API | |
| TC-API-INV-107 | Admin | Breakdown level=size_group requires 5 path fields | P2 | Provide section+category+group+article+colour; `level=size_group` | 200 | API | |
| TC-API-INV-108 | Admin | Breakdown level=leaf requires all 6 path fields | P1 | Provide section+category+group+article+colour+size_group; `level=leaf` | 200; leaf-level nodes with pair counts | API | |
| TC-API-INV-109 | Admin | Breakdown missing level → 400 | P1 | `GET /api/inventory/breakdown` (no level) | 400 Zod error | API | |
| TC-API-INV-110 | Admin | Breakdown invalid level → 400 | P1 | `GET /api/inventory/breakdown?level=bogus` | 400 | API | |
| TC-API-INV-111 | Supervisor | Breakdown — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/inventory/breakdown?level=section` | 200 | API | Auth-only |
| TC-API-INV-112 | Warehouse Operator | Breakdown — WH Op → 200 | P2 | Authenticate as WH Op; `GET /api/inventory/breakdown?level=section` | 200 | API | Auth-only |
| TC-API-INV-113 | Dispatch Operator | Breakdown — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; `GET /api/inventory/breakdown?level=section` | 200 | API | Auth-only |

---

## 5. Dispatches — RBAC

> Route: `POST /dispatches` gated by `dispatch:create`.  
> `GET /dispatches` and `GET /dispatches/:id` are **authenticate-only** (no per-permission gate).  
> ⚠️ **FLAG:** spec 21-dispatch-rbac asserts Supervisor create=201 — actual behavior is 403.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-DSP-001 | Unauthenticated | POST create — no token → 401 | P1 | `POST /api/dispatches` `{ "master_carton_ids": ["<uuid>"], "customer_id": "<uuid>" }` (no token) | 401 | API | Spec 21 |
| TC-API-DSP-002 | Admin | POST create — Admin → 201 | P1 | Authenticate as Admin; POST valid carton dispatch body | 201; `dispatch` array returned | API | Admin super-admin bypass |
| TC-API-DSP-003 | Supervisor | POST create — Supervisor → 403 (FLAG) | P1 | Authenticate as Supervisor; POST valid carton dispatch body | **403** `Required permission: dispatch:create` | API | ⚠️ Spec 21 asserts 201 — WRONG; Supervisor seed lacks `dispatch:create`; encode actual 403 |
| TC-API-DSP-004 | Warehouse Operator | POST create — WH Op → 403 | P1 | Authenticate as WH Op; POST valid carton dispatch body | 403 | API | WH Op lacks `dispatch:create` |
| TC-API-DSP-005 | Dispatch Operator | POST create — Dispatch Op → 201 | P1 | Authenticate as Dispatch Op; POST valid carton dispatch body | 201 | API | Dispatch Op has `dispatch:create` |
| TC-API-DSP-010 | Unauthenticated | GET list — no token → 401 | P1 | `GET /api/dispatches` (no token) | 401 | API | |
| TC-API-DSP-011 | Admin | GET list — Admin → 200 | P1 | Authenticate as Admin; `GET /api/dispatches` | 200; paginated | API | authenticate-only |
| TC-API-DSP-012 | Supervisor | GET list — Supervisor → 200 | P1 | Authenticate as Supervisor; `GET /api/dispatches` | 200 | API | authenticate-only; Supervisor has `dispatch:read` but route doesn't check it |
| TC-API-DSP-013 | Warehouse Operator | GET list — WH Op → 200 (discrepancy) | P1 | Authenticate as WH Op; `GET /api/dispatches` | **200** — route has no `authorizePermission` gate | API | ⚠️ WH Op lacks `dispatch:read` permission but still gets 200 because GET /dispatches is authenticate-only; document as discrepancy vs access matrix |
| TC-API-DSP-014 | Dispatch Operator | GET list — Dispatch Op → 200 | P1 | Authenticate as Dispatch Op; `GET /api/dispatches` | 200 | API | |
| TC-API-DSP-015 | Unauthenticated | GET detail — no token → 401 | P1 | `GET /api/dispatches/<uuid>` (no token) | 401 | API | |
| TC-API-DSP-016 | Admin | GET detail — Admin → 200 | P1 | Authenticate as Admin; `GET /api/dispatches/<valid-id>` | 200; `source_type` ∈ {`master_carton`, `sample`, `ecommerce`}; `source_label` populated | API | |
| TC-API-DSP-017 | Supervisor | GET detail — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/dispatches/<valid-id>` | 200 | API | authenticate-only |
| TC-API-DSP-018 | Warehouse Operator | GET detail — WH Op → 200 (discrepancy) | P2 | Authenticate as WH Op; `GET /api/dispatches/<valid-id>` | **200** (no permission gate) | API | Same discrepancy as TC-API-DSP-013 |
| TC-API-DSP-019 | Dispatch Operator | GET detail — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op; `GET /api/dispatches/<valid-id>` | 200 | API | |

---

## 6. Dispatches — Create Multi-Source Business Rules

> Multi-source router: exactly one of `master_carton_ids`, `sample_record_id`, or `ecommerce_record_id` required.  
> Master carton: ACTIVE or CLOSED status; `customer_id` **required** (Zod refine).  
> Sample / E-commerce: ACTIVE or CLOSED status; `customer_id` optional.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-DSP-020 | Admin | No source field → 400 | P1 | POST `{}` | 400 Zod: `Exactly one dispatch source must be provided` | API | Spec 33 |
| TC-API-DSP-021 | Admin | Two sources provided → 400 | P1 | POST `{ "master_carton_ids": ["<uuid>"], "sample_record_id": "<uuid>", "customer_id": "<uuid>" }` | 400 Zod: exactly one source | API | Spec 33 |
| TC-API-DSP-022 | Admin | All three sources provided → 400 | P2 | POST with all three source fields | 400 | API | |
| TC-API-DSP-023 | Admin | master_carton_ids empty array → 400 | P1 | POST `{ "master_carton_ids": [], "customer_id": "<uuid>" }` | 400 Zod: `At least one master carton must be selected` | API | `min(1)` constraint |
| TC-API-DSP-024 | Admin | master_carton_ids > 200 items → 400 | P2 | POST with 201 UUIDs in array | 400 Zod: `Cannot dispatch more than 200 cartons at once` | API | `max(200)` constraint |
| TC-API-DSP-025 | Admin | master_carton dispatch — customer_id missing → 400 | P1 | POST `{ "master_carton_ids": ["<uuid>"] }` (no customer_id) | 400 Zod path `customer_id`: `Customer is required for master carton dispatch` | API | Spec 33 second refine |
| TC-API-DSP-026 | Admin | master_carton dispatch — ACTIVE carton accepted → 201 | P1 | Seed ACTIVE carton; POST `{ "master_carton_ids": ["<carton-id>"], "customer_id": "<valid-customer-id>" }` | 201; carton transitions to DISPATCHED; child boxes transition to DISPATCHED | Integration | Code accepts ACTIVE or CLOSED; note brief said "CLOSED-only" but service accepts both |
| TC-API-DSP-027 | Admin | master_carton dispatch — CLOSED carton accepted → 201 | P1 | Seed CLOSED carton; POST dispatch | 201 | Integration | Spec 33 |
| TC-API-DSP-028 | Admin | master_carton dispatch — CREATED carton → 400 | P1 | Seed CREATED carton; POST dispatch | 400 `Cartons must be in ACTIVE or CLOSED status` | API | Service validation |
| TC-API-DSP-029 | Admin | master_carton dispatch — DISPATCHED carton → 400 | P1 | Seed DISPATCHED carton; POST dispatch | 400 | API | |
| TC-API-DSP-030 | Admin | master_carton dispatch — one of N cartons invalid → 400 | P2 | POST array where one carton is CREATED; others CLOSED | 400; entire transaction rolled back | Integration | Transaction atomicity |
| TC-API-DSP-031 | Admin | master_carton dispatch — non-existent carton ID → 404 | P1 | POST with random UUID in master_carton_ids | 404 `Master cartons not found: <uuid>` | API | |
| TC-API-DSP-032 | Admin | master_carton dispatch — multi-carton creates multiple dispatch records | P1 | POST with 3 CLOSED carton IDs | 201; response is array of 3 dispatch records (one per carton) | Integration | `_dispatchMasterCartons` iterates per-carton |
| TC-API-DSP-033 | Admin | master_carton dispatch — destination auto-filled from customer | P2 | POST dispatch without `destination`; customer has `delivery_location = "Jaipur"` | 201; dispatch record has `destination = "Jaipur"` | Integration | Auto-fill branch in service |
| TC-API-DSP-034 | Admin | master_carton dispatch — optional fields accepted | P2 | POST with `lr_number`, `vehicle_number`, `transport_details`, `notes`, `dispatch_date` | 201; all fields persisted in dispatch records | API | |
| TC-API-DSP-035 | Admin | master_carton dispatch — dispatch_date invalid format → 400 | P2 | POST `{ dispatch_date: "not-a-date" }` | 400 Zod: `Invalid date format, expected ISO 8601` | API | |
| TC-API-DSP-036 | Admin | Sample dispatch — ACTIVE sample record → 201 | P1 | Seed ACTIVE sample with boxes; POST `{ "sample_record_id": "<sr-id>" }` | 201; single dispatch record; sample transitions to DISPATCHED; last-foot boxes transition to DISPATCHED | Integration | Spec 33; foot-split logic |
| TC-API-DSP-037 | Admin | Sample dispatch — CLOSED sample record → 201 | P1 | Seed CLOSED sample; POST dispatch | 201 | Integration | |
| TC-API-DSP-038 | Admin | Sample dispatch — CREATED sample → 400 | P1 | Seed CREATED sample; POST dispatch | 400 `Sample record must be in ACTIVE or CLOSED status` | API | |
| TC-API-DSP-039 | Admin | Sample dispatch — DISPATCHED sample → 400 | P1 | Seed DISPATCHED sample; POST dispatch | 400 | API | |
| TC-API-DSP-040 | Admin | Sample dispatch — non-existent SR id → 404 | P1 | POST `{ "sample_record_id": "<random-uuid>" }` | 404 `Sample record not found` | API | |
| TC-API-DSP-041 | Admin | Sample dispatch — customer_id optional (no 400) | P2 | POST `{ "sample_record_id": "<sr-id>" }` (no customer_id) | 201 | API | Zod refine only enforces customer_id for master_carton path |
| TC-API-DSP-042 | Admin | Sample dispatch — foot-split: box with only last foot dispatches box | P1 | Box B1 has L foot in SR-A and R foot in SR-B. Dispatch SR-A first; dispatch SR-B second | After SR-A dispatch: B1 stays SAMPLE; after SR-B dispatch: B1 transitions to DISPATCHED | Integration | Spec 33; `_dispatchSample` last-foot query |
| TC-API-DSP-043 | Admin | Sample dispatch — box with both feet in same SR → dispatches box | P2 | Box has PAIR foot allocation in SR; dispatch SR | 201; box transitions to DISPATCHED | Integration | |
| TC-API-DSP-044 | Admin | Sample dispatch — transaction SAMPLE_DISPATCHED + CHILD_DISPATCHED written | P2 | Dispatch sample; query `inventory_transactions` | `SAMPLE_DISPATCHED` row (no child_box_id); `CHILD_DISPATCHED` row(s) with `foot` in metadata per shipped foot | Integration | |
| TC-API-DSP-045 | Admin | E-commerce dispatch — ACTIVE record → 201 | P1 | Seed ACTIVE ecommerce record with boxes; POST `{ "ecommerce_record_id": "<ec-id>" }` | 201; single dispatch record; ecommerce record → DISPATCHED; boxes → DISPATCHED | Integration | Spec 33 |
| TC-API-DSP-046 | Admin | E-commerce dispatch — CLOSED record → 201 | P1 | Seed CLOSED ecommerce record; POST dispatch | 201 | Integration | |
| TC-API-DSP-047 | Admin | E-commerce dispatch — CREATED record → 400 | P1 | Seed CREATED ecommerce record; POST dispatch | 400 `E-commerce record must be in ACTIVE or CLOSED status` | API | |
| TC-API-DSP-048 | Admin | E-commerce dispatch — DISPATCHED record → 400 | P1 | Seed DISPATCHED ecommerce record; POST dispatch | 400 | API | |
| TC-API-DSP-049 | Admin | E-commerce dispatch — non-existent EC id → 404 | P1 | POST `{ "ecommerce_record_id": "<random-uuid>" }` | 404 `E-commerce record not found` | API | |
| TC-API-DSP-050 | Admin | E-commerce dispatch — customer_id optional | P2 | POST ec dispatch without customer_id | 201 | API | |
| TC-API-DSP-051 | Admin | E-commerce dispatch — ECOMMERCE_DISPATCHED transaction written | P2 | Dispatch ec record; query transactions | `ECOMMERCE_DISPATCHED` row present; `CHILD_DISPATCHED` rows for each box | Integration | |
| TC-API-DSP-052 | Dispatch Operator | Dispatch Op — sample dispatch → 201 | P2 | Authenticate as Dispatch Op; POST sample dispatch | 201 | Integration | Dispatch Op has `dispatch:create` |
| TC-API-DSP-053 | Dispatch Operator | Dispatch Op — ec dispatch → 201 | P2 | Authenticate as Dispatch Op; POST ec dispatch | 201 | Integration | |

---

## 7. Dispatches — List and Detail

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-DSP-060 | Admin | GET list — default pagination | P1 | `GET /api/dispatches` | 200; `data` array; `total`, `page`, `limit` fields | API | |
| TC-API-DSP-061 | Admin | GET list — filter by destination | P2 | `GET /api/dispatches?destination=Jaipur` | 200; all rows have `destination` matching Jaipur (ILIKE) | API | |
| TC-API-DSP-062 | Admin | GET list — filter by date range | P2 | `GET /api/dispatches?from_date=2026-01-01&to_date=2026-12-31` | 200; filtered | API | |
| TC-API-DSP-063 | Admin | GET list — search by lr_number | P2 | `GET /api/dispatches?search=LR001` | 200; rows matching LR001 in destination/lr_number/vehicle_number/barcodes/customer | API | |
| TC-API-DSP-064 | Admin | GET list — dispatch records include source_type and source_label | P2 | GET list after seeding one carton + one sample dispatch | 200; each record has `source_type` ∈ {`master_carton`,`sample`,`ecommerce`} and `source_label` non-null | API | |
| TC-API-DSP-065 | Admin | GET list — includes customer firm_name | P2 | Dispatch with customer_id; GET list | 200; row has `customer_firm_name` field | API | Joined in query |
| TC-API-DSP-066 | Admin | GET detail — non-existent id → 404 | P1 | `GET /api/dispatches/<random-uuid>` | 404 `Dispatch record not found` | API | |
| TC-API-DSP-067 | Admin | GET detail — invalid uuid → 400 | P1 | `GET /api/dispatches/not-a-uuid` | 400 Zod: `Invalid dispatch ID format` | API | `dispatchIdParamSchema` |
| TC-API-DSP-068 | Admin | GET detail — carton dispatch has carton_barcode | P2 | GET detail for a carton-sourced dispatch | 200; `carton_barcode` non-null; `sample_barcode` null; `ecommerce_barcode` null | API | JOIN in query |
| TC-API-DSP-069 | Admin | GET detail — sample dispatch has sample_barcode | P2 | GET detail for a sample-sourced dispatch | 200; `sample_barcode` non-null; `carton_barcode` null | API | |
| TC-API-DSP-070 | Admin | GET detail — ec dispatch has ecommerce_barcode | P2 | GET detail for an ec-sourced dispatch | 200; `ecommerce_barcode` non-null | API | |

---

## 8. Reports — RBAC

> ALL report routes use `router.use(authorizePermission('reports:view_all'))` applied at router level.  
> **Admin + Supervisor** have `reports:view_all`. **WH Op** has only `reports:view_own` (DEAD perm); **Dispatch Op** has only `reports:view_dispatch` (DEAD perm). Both 403 on all report routes.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-RPT-001 | Unauthenticated | Reports — no token → 401 | P1 | `GET /api/reports/inventory-summary` (no token) | 401 (authenticate before authorizePermission) | API | Spec 24 |
| TC-API-RPT-002 | Admin | Inventory summary — Admin → 200 | P1 | Authenticate as Admin; `GET /api/reports/inventory-summary` | 200 | API | `reports:view_all` Admin super-admin bypass |
| TC-API-RPT-003 | Supervisor | Inventory summary — Supervisor → 200 | P1 | Authenticate as Supervisor; `GET /api/reports/inventory-summary` | 200 | API | Supervisor has `reports:view_all` |
| TC-API-RPT-004 | Warehouse Operator | Inventory summary — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/inventory-summary` | 403 `Required permission: reports:view_all` | API | WH Op has only DEAD `reports:view_own` |
| TC-API-RPT-005 | Dispatch Operator | Inventory summary — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/inventory-summary` | 403 | API | Dispatch Op has only DEAD `reports:view_dispatch` |
| TC-API-RPT-010 | Warehouse Operator | Product-wise — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/product-wise` | 403 | API | |
| TC-API-RPT-011 | Dispatch Operator | Product-wise — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/product-wise` | 403 | API | |
| TC-API-RPT-015 | Warehouse Operator | Dispatch summary — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/dispatch-summary` | 403 | API | |
| TC-API-RPT-016 | Dispatch Operator | Dispatch summary — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/dispatch-summary` | 403 | API | |
| TC-API-RPT-020 | Warehouse Operator | Daily activity — WH Op → 403 | P1 | `GET /api/reports/daily-activity?from_date=2026-01-01&to_date=2026-06-30` | 403 (before date validation) | API | `authorizePermission` runs before controller date check |
| TC-API-RPT-021 | Dispatch Operator | Daily activity — Dispatch Op → 403 | P1 | Same URL, Dispatch Op token | 403 | API | |
| TC-API-RPT-025 | Warehouse Operator | Carton inventory — WH Op → 403 | P2 | Authenticate as WH Op; `GET /api/reports/carton-inventory` | 403 | API | |
| TC-API-RPT-026 | Dispatch Operator | Carton inventory — Dispatch Op → 403 | P2 | Authenticate as Dispatch Op; `GET /api/reports/carton-inventory` | 403 | API | |
| TC-API-RPT-030 | Warehouse Operator | Samples report — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/samples` | 403 | API | |
| TC-API-RPT-031 | Dispatch Operator | Samples report — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/samples` | 403 | API | |
| TC-API-RPT-035 | Warehouse Operator | E-commerce report — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/ecommerce` | 403 | API | |
| TC-API-RPT-036 | Dispatch Operator | E-commerce report — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/ecommerce` | 403 | API | |
| TC-API-RPT-040 | Warehouse Operator | Inventory CSV export — WH Op → 403 | P1 | Authenticate as WH Op; `GET /api/reports/inventory-summary/export` | 403 | API | DEAD perm `reports:export` irrelevant — all exports blocked by `reports:view_all` |
| TC-API-RPT-041 | Dispatch Operator | Inventory CSV export — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; `GET /api/reports/inventory-summary/export` | 403 | API | |
| TC-API-RPT-045 | Warehouse Operator | Dispatch CSV export — WH Op → 403 | P1 | `GET /api/reports/dispatch-summary/export` | 403 | API | |
| TC-API-RPT-046 | Dispatch Operator | Dispatch CSV export — Dispatch Op → 403 | P1 | same | 403 | API | |
| TC-API-RPT-050 | Warehouse Operator | Daily activity CSV — WH Op → 403 | P1 | `GET /api/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-06-30` | 403 | API | |
| TC-API-RPT-051 | Dispatch Operator | Daily activity CSV — Dispatch Op → 403 | P1 | same | 403 | API | |
| TC-API-RPT-055 | Warehouse Operator | Samples CSV export — WH Op → 403 | P1 | `GET /api/reports/samples/export` | 403 | API | |
| TC-API-RPT-056 | Dispatch Operator | Samples CSV export — Dispatch Op → 403 | P1 | same | 403 | API | |
| TC-API-RPT-060 | Warehouse Operator | E-commerce CSV export — WH Op → 403 | P1 | `GET /api/reports/ecommerce/export` | 403 | API | |
| TC-API-RPT-061 | Dispatch Operator | E-commerce CSV export — Dispatch Op → 403 | P1 | same | 403 | API | |

---

## 9. Reports — Endpoint Contracts

> All require Admin or Supervisor token. Covers happy-path data shape, filter params, and validation.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-RPT-070 | Admin | Inventory summary — response shape | P1 | `GET /api/reports/inventory-summary` | 200; response includes aggregated stock summary fields | API | Spec 06 |
| TC-API-RPT-071 | Admin | Product-wise — response shape | P1 | `GET /api/reports/product-wise` | 200; array of rows with `product_sku`, `product_name`, `colour`, `size`, `total_child_boxes`, `free_boxes`, `packed_boxes`, `dispatched_boxes`, `total_pairs`, `pairs_in_stock`, `pairs_dispatched` | API | Shape from `csvExport.service` column names |
| TC-API-RPT-072 | Supervisor | Product-wise — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/reports/product-wise` | 200 | API | |
| TC-API-RPT-073 | Admin | Dispatch summary — no date filter → 200 | P1 | `GET /api/reports/dispatch-summary` | 200 | API | |
| TC-API-RPT-074 | Admin | Dispatch summary — with date filter | P2 | `GET /api/reports/dispatch-summary?from_date=2026-01-01&to_date=2026-06-30` | 200; filtered | API | |
| TC-API-RPT-075 | Admin | Daily activity — both dates required | P1 | `GET /api/reports/daily-activity` (no dates) | 400 `Both from_date and to_date are required` | API | Controller throws BadRequestError |
| TC-API-RPT-076 | Admin | Daily activity — missing to_date → 400 | P1 | `GET /api/reports/daily-activity?from_date=2026-01-01` | 400 | API | |
| TC-API-RPT-077 | Admin | Daily activity — valid date range → 200 | P1 | `GET /api/reports/daily-activity?from_date=2026-01-01&to_date=2026-06-30` | 200; array of daily rows with `date`, `boxes_created`, `boxes_packed`, `boxes_unpacked`, `boxes_dispatched`, `cartons_created`, `cartons_closed`, `cartons_dispatched` | API | Shape from `csvExport.service` |
| TC-API-RPT-078 | Admin | Carton inventory — response shape | P1 | `GET /api/reports/carton-inventory` | 200 | API | |
| TC-API-RPT-079 | Admin | Samples report — no filters → 200 | P1 | `GET /api/reports/samples` | 200; `{ rows: [...] }` with fields `sample_barcode`, `name`, `customer_name`, `recipient_name`, `status`, `child_count`, `sample_date`, `created_at`, `dispatched_at`, `creator_name` | API | Shape from exportSampleReportCSV column mapping |
| TC-API-RPT-080 | Admin | Samples report — filter by status | P2 | `GET /api/reports/samples?status=CLOSED` | 200; all rows have `status = CLOSED` | API | |
| TC-API-RPT-081 | Admin | Samples report — filter by date range | P2 | `GET /api/reports/samples?from=2026-01-01&to=2026-06-30` | 200 | API | Query params are `from`/`to` (not `from_date`/`to_date`) |
| TC-API-RPT-082 | Admin | Samples report — filter by customer_id | P2 | `GET /api/reports/samples?customer_id=<uuid>` | 200 | API | |
| TC-API-RPT-083 | Admin | E-commerce report — no filters → 200 | P1 | `GET /api/reports/ecommerce` | 200; `{ rows: [...] }` with fields `ecommerce_barcode`, `name`, `marketplace`, `order_reference`, `listing_sku`, `status`, `child_count`, `mapped_date`, `created_at`, `dispatched_at`, `creator_name` | API | |
| TC-API-RPT-084 | Admin | E-commerce report — filter by status | P2 | `GET /api/reports/ecommerce?status=DISPATCHED` | 200 | API | |
| TC-API-RPT-085 | Admin | E-commerce report — filter by marketplace | P2 | `GET /api/reports/ecommerce?marketplace=Amazon` | 200 | API | |
| TC-API-RPT-086 | Supervisor | All report endpoints — Supervisor 200 bulk check | P2 | Authenticate as Supervisor; hit all 7 report GET endpoints with valid params | All 200 | API | Verify Supervisor gets 200 on all |

---

## 10. Reports — CSV Export Contracts

> All CSV endpoints: `Content-Type: text/csv`; RFC-4180 escaping; specific `Content-Disposition` filenames.  
> Stock CSV **drops sample/ecommerce columns** (known: `exportInventorySummaryCSV` uses product-wise without sample/ecommerce breakdown).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-RPT-090 | Admin | Inventory summary CSV — headers correct | P1 | `GET /api/reports/inventory-summary/export` | 200 CSV; first line: `"SKU","Article","Colour","Size","Total Boxes","Free","Packed","Dispatched","Total Pairs","In Stock","Dispatched Pairs"` | API | `exportInventorySummaryCSV` headers; sample/ecommerce columns absent |
| TC-API-RPT-091 | Admin | Inventory CSV — no Sample column | P1 | Parse CSV from TC-API-RPT-090 | Header row does NOT contain `Sample` or `Ecommerce` | API | ⚠️ Known gap: stock CSV drops sample/ecommerce columns |
| TC-API-RPT-092 | Admin | Inventory CSV — Content-Disposition filename | P2 | Check response headers of TC-API-RPT-090 | `Content-Disposition: attachment; filename="inventory-summary.csv"` | API | |
| TC-API-RPT-093 | Admin | Inventory CSV — values with commas RFC-escaped | P2 | Seed product with article name containing comma; export | CSV field is double-quoted; commas inside are literal (field is enclosed in quotes) | API | `toCSV` escape function |
| TC-API-RPT-094 | Admin | Inventory CSV — values with double-quotes RFC-escaped | P2 | Seed product with double-quote in name | CSV escapes as `""` inside double-quoted field | API | `val.replace(/"/g, '""')` |
| TC-API-RPT-095 | Admin | Dispatch summary CSV — headers correct | P1 | `GET /api/reports/dispatch-summary/export` | 200 CSV; headers: `"Customer","Dispatch Date","Destination","Carton Barcode","Boxes","Article","Colour","Size","MRP","Vehicle","LR Number","Transport Details","Dispatched By","Notes"` | API | `exportDispatchCSV` headers |
| TC-API-RPT-096 | Admin | Dispatch CSV — filename | P2 | Check Content-Disposition | `filename="dispatch-summary.csv"` | API | |
| TC-API-RPT-097 | Admin | Dispatch CSV — missing customer shows fallback | P2 | Dispatch a carton with no customer_id; export | CSV row has `"Walk-in / No Customer"` in Customer column | API | `COALESCE(c.firm_name, 'Walk-in / No Customer')` |
| TC-API-RPT-098 | Admin | Daily activity CSV — headers correct | P1 | `GET /api/reports/daily-activity/export?from_date=2026-01-01&to_date=2026-06-30` | 200 CSV; headers: `"Date","Boxes Created","Boxes Packed","Boxes Unpacked","Boxes Dispatched","Cartons Created","Cartons Closed","Cartons Dispatched"` | API | |
| TC-API-RPT-099 | Admin | Daily activity CSV — missing dates → 400 | P1 | `GET /api/reports/daily-activity/export` (no dates) | 400 `Both from_date and to_date are required` | API | Controller validates before CSV generation |
| TC-API-RPT-100 | Admin | Samples CSV — headers correct | P1 | `GET /api/reports/samples/export` | 200 CSV; headers: `"Sample Barcode","Name","Customer","Recipient","Status","Box Count","Sample Date","Created At","Dispatched At","Created By"` | API | `exportSampleReportCSV` headers |
| TC-API-RPT-101 | Admin | Samples CSV — filename | P2 | Content-Disposition | `filename="sample-report.csv"` | API | |
| TC-API-RPT-102 | Admin | E-commerce CSV — headers correct | P1 | `GET /api/reports/ecommerce/export` | 200 CSV; headers: `"E-commerce Barcode","Name","Marketplace","Order Reference","Listing SKU","Status","Box Count","Mapped Date","Created At","Dispatched At","Created By"` | API | `exportEcommerceReportCSV` headers |
| TC-API-RPT-103 | Admin | E-commerce CSV — filename | P2 | Content-Disposition | `filename="ecommerce-report.csv"` | API | |
| TC-API-RPT-104 | Supervisor | All CSV exports — Supervisor gets CSV (200, not 403) | P1 | Authenticate as Supervisor; hit all CSV export endpoints | All 200 with `text/csv` content type | API | Supervisor has `reports:view_all`; `reports:export` is DEAD perm — exports work |
| TC-API-RPT-105 | Warehouse Operator | All CSV exports — WH Op gets 403 | P1 | Authenticate as WH Op; all CSV export endpoints | All 403 | API | |
| TC-API-RPT-106 | Dispatch Operator | All CSV exports — Dispatch Op gets 403 | P1 | Authenticate as Dispatch Op; all CSV export endpoints | All 403 | API | |

---

## 11. Customers — RBAC

> Write routes (`POST /`, `POST /bulk-upload`, `PUT /:id`, `DELETE /:id`, `GET /bulk-upload/sample`) require `customers:create`/`update`/`delete`/`read` — all Admin-only (not in any non-Admin seed).  
> Read routes (`GET /`, `GET /primary-dealers`, `GET /:id/sub-dealers`, `GET /:id`) are authenticate-only.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CUST-001 | Unauthenticated | POST create — no token → 401 | P1 | `POST /api/customers` `{ "firm_name": "Test" }` (no token) | 401 | API | Spec 09/18 |
| TC-API-CUST-002 | Admin | POST create — Admin → 201 | P1 | Authenticate as Admin; POST valid customer body | 201 | API | |
| TC-API-CUST-003 | Supervisor | POST create — Supervisor → 403 | P1 | Authenticate as Supervisor; POST valid customer body | 403 `Required permission: customers:create` | API | Spec 18 |
| TC-API-CUST-004 | Warehouse Operator | POST create — WH Op → 403 | P1 | Authenticate as WH Op; POST valid customer body | 403 | API | |
| TC-API-CUST-005 | Dispatch Operator | POST create — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; POST valid customer body | 403 | API | |
| TC-API-CUST-010 | Unauthenticated | GET list — no token → 401 | P1 | `GET /api/customers` (no token) | 401 | API | |
| TC-API-CUST-011 | Admin | GET list — Admin → 200 | P1 | Authenticate as Admin; `GET /api/customers` | 200; paginated | API | authenticate-only |
| TC-API-CUST-012 | Supervisor | GET list — Supervisor → 200 | P1 | Authenticate as Supervisor; `GET /api/customers` | 200 | API | |
| TC-API-CUST-013 | Warehouse Operator | GET list — WH Op → 200 | P1 | Authenticate as WH Op; `GET /api/customers` | 200 | API | |
| TC-API-CUST-014 | Dispatch Operator | GET list — Dispatch Op → 200 | P1 | Authenticate as Dispatch Op; `GET /api/customers` | 200 | API | |
| TC-API-CUST-020 | Unauthenticated | GET primary-dealers — no token → 401 | P1 | `GET /api/customers/primary-dealers` (no token) | 401 | API | Spec 09 — order-sensitive route (declared before /:id) |
| TC-API-CUST-021 | Admin | GET primary-dealers → 200 | P1 | `GET /api/customers/primary-dealers` | 200; array of `{ id, firm_name, ... }` for active Primary Dealers only | API | |
| TC-API-CUST-022 | Supervisor | GET primary-dealers — Supervisor → 200 | P2 | same | 200 | API | |
| TC-API-CUST-023 | Warehouse Operator | GET primary-dealers — WH Op → 200 | P2 | same | 200 | API | |
| TC-API-CUST-024 | Dispatch Operator | GET primary-dealers — Dispatch Op → 200 | P2 | same | 200 | API | |
| TC-API-CUST-030 | Unauthenticated | GET bulk-upload/sample — no token → 401 | P1 | `GET /api/customers/bulk-upload/sample` (no token) | 401 | API | Order-sensitive: declared before /:id |
| TC-API-CUST-031 | Admin | GET bulk-upload/sample → 200 CSV | P1 | Authenticate as Admin; `GET /api/customers/bulk-upload/sample` | 200; `Content-Type: text/csv`; `Content-Disposition: attachment; filename=customer_upload_sample.csv`; 2 data rows (Acme + Acme Sub Store) | API | Spec 35 |
| TC-API-CUST-032 | Supervisor | GET bulk-upload/sample — Supervisor → 403 | P1 | Authenticate as Supervisor; `GET /api/customers/bulk-upload/sample` | 403 `Required permission: customers:read` | API | `customers:read` not in any non-Admin seed |
| TC-API-CUST-033 | Warehouse Operator | GET bulk-upload/sample — WH Op → 403 | P1 | Authenticate as WH Op; same | 403 | API | |
| TC-API-CUST-034 | Dispatch Operator | GET bulk-upload/sample — Dispatch Op → 403 | P1 | Authenticate as Dispatch Op; same | 403 | API | |
| TC-API-CUST-040 | Unauthenticated | PUT update — no token → 401 | P1 | `PUT /api/customers/<uuid>` `{}` (no token) | 401 | API | |
| TC-API-CUST-041 | Admin | PUT update — Admin → 200 | P1 | Authenticate as Admin; PUT valid update body for existing customer | 200; updated customer returned | API | |
| TC-API-CUST-042 | Supervisor | PUT update — Supervisor → 403 | P1 | Authenticate as Supervisor; PUT | 403 `Required permission: customers:update` | API | |
| TC-API-CUST-043 | Warehouse Operator | PUT update — WH Op → 403 | P1 | same | 403 | API | |
| TC-API-CUST-044 | Dispatch Operator | PUT update — Dispatch Op → 403 | P1 | same | 403 | API | |
| TC-API-CUST-050 | Unauthenticated | DELETE — no token → 401 | P1 | `DELETE /api/customers/<uuid>` (no token) | 401 | API | |
| TC-API-CUST-051 | Admin | DELETE — Admin → 200 (soft delete) | P1 | Authenticate as Admin; DELETE existing customer | 200 `Customer deactivated successfully`; customer `is_active = false` in DB | API | Soft-delete via UPDATE |
| TC-API-CUST-052 | Supervisor | DELETE — Supervisor → 403 | P1 | Authenticate as Supervisor; DELETE | 403 `Required permission: customers:delete` | API | |
| TC-API-CUST-053 | Warehouse Operator | DELETE — WH Op → 403 | P1 | same | 403 | API | |
| TC-API-CUST-054 | Dispatch Operator | DELETE — Dispatch Op → 403 | P1 | same | 403 | API | |
| TC-API-CUST-060 | Unauthenticated | POST bulk-upload — no token → 401 | P1 | `POST /api/customers/bulk-upload` multipart (no token) | 401 | API | Spec 35 — order-sensitive: declared before /:id |
| TC-API-CUST-061 | Admin | POST bulk-upload — Admin → 201 | P1 | Authenticate as Admin; POST valid CSV file | 201; `{ created: N, errors: [] }` | API | |
| TC-API-CUST-062 | Supervisor | POST bulk-upload — Supervisor → 403 | P1 | Authenticate as Supervisor; POST CSV | 403 `Required permission: customers:create` | API | |
| TC-API-CUST-063 | Warehouse Operator | POST bulk-upload — WH Op → 403 | P1 | same | 403 | API | |
| TC-API-CUST-064 | Dispatch Operator | POST bulk-upload — Dispatch Op → 403 | P1 | same | 403 | API | |

---

## 12. Customers — Create and Validation

> Zod schema: `firm_name` required; Sub Dealer requires `primary_dealer_id`; GSTIN/mobile regex validated.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CUST-070 | Admin | Create Primary Dealer — minimal fields | P1 | POST `{ "firm_name": "Alpha Shoes" }` | 201; `customer_type = 'Primary Dealer'` (default) | API | Spec 09 |
| TC-API-CUST-071 | Admin | Create Primary Dealer — all optional fields | P2 | POST with address, delivery_location, gstin, private_marka, gr, contact_person_name, contact_person_mobile | 201; all fields persisted | API | |
| TC-API-CUST-072 | Admin | Create Sub Dealer — valid with primary_dealer_id | P1 | First create a Primary Dealer; then POST `{ "firm_name": "Beta Sub", "customer_type": "Sub Dealer", "primary_dealer_id": "<pd-id>" }` | 201; `customer_type = 'Sub Dealer'` | Integration | Spec 09 |
| TC-API-CUST-073 | Admin | Create Sub Dealer — inherits address from primary when not provided | P2 | Primary has `address = "Jaipur"`; POST Sub Dealer with same primary_dealer_id but no address | 201; sub's `address = "Jaipur"` (inherited from primary) | Integration | Service inherits address/delivery_location/gstin/contacts |
| TC-API-CUST-074 | Admin | Create Sub Dealer — missing primary_dealer_id → 400 | P1 | POST `{ "firm_name": "X", "customer_type": "Sub Dealer" }` (no primary_dealer_id) | 400 Zod: `Sub Dealer must have a primary dealer` | API | Zod refine |
| TC-API-CUST-075 | Admin | Create Sub Dealer — non-existent primary_dealer_id → 404 | P1 | POST `{ "firm_name": "X", "customer_type": "Sub Dealer", "primary_dealer_id": "<random-uuid>" }` | 404 `Primary dealer not found` | API | Service validation |
| TC-API-CUST-076 | Admin | Create Sub Dealer — primary_dealer_id that is a Sub Dealer → 404 | P2 | POST Sub Dealer with a primary_dealer_id that points to a Sub Dealer (not Primary Dealer) | 404 `Primary dealer not found` | API | Service query filters `customer_type = 'Primary Dealer'` |
| TC-API-CUST-077 | Admin | Create — firm_name missing → 400 | P1 | POST `{ "address": "Jaipur" }` | 400 Zod: `Firm name is required` | API | |
| TC-API-CUST-078 | Admin | Create — firm_name too long → 400 | P2 | POST with 256-char firm_name | 400 Zod | API | `max(255)` |
| TC-API-CUST-079 | Admin | Create — invalid GSTIN → 400 | P1 | POST with `gstin = "BADGSTIN"` | 400 Zod: invalid GSTIN format | API | Regex validation |
| TC-API-CUST-080 | Admin | Create — valid GSTIN accepted | P2 | POST with `gstin = "22AAAAA0000A1Z5"` | 201 | API | |
| TC-API-CUST-081 | Admin | Create — invalid mobile → 400 | P1 | POST with `contact_person_mobile = "123"` | 400 Zod: 10-15 digits required | API | |
| TC-API-CUST-082 | Admin | Create — invalid customer_type enum → 400 | P1 | POST with `customer_type = "Retailer"` | 400 Zod | API | |
| TC-API-CUST-083 | Admin | Create — duplicate firm_name returns 201 with warning message | P1 | Create "Acme Shoes"; attempt to create another "Acme Shoes" | 201 (not rejected); message: `Note: A customer with this firm name already exists.` | API | `checkDuplicateFirmName` returns warning not rejection |
| TC-API-CUST-084 | Admin | Create — inactive primary dealer → 404 | P2 | Deactivate a primary dealer; attempt to create Sub Dealer referencing it | 404 `Primary dealer not found` (service filters `is_active = true`) | Integration | |

---

## 13. Customers — List, Detail, Sub-Dealers

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CUST-090 | Admin | GET list — default pagination | P1 | `GET /api/customers` | 200; `data`, `total`, `page`, `limit`; rows include `primary_dealer_name` (LEFT JOIN) | API | |
| TC-API-CUST-091 | Admin | GET list — filter by customer_type=Primary Dealer | P2 | `GET /api/customers?customer_type=Primary%20Dealer` | 200; all rows `customer_type = 'Primary Dealer'` | API | |
| TC-API-CUST-092 | Admin | GET list — filter by customer_type=Sub Dealer | P2 | `GET /api/customers?customer_type=Sub%20Dealer` | 200 | API | |
| TC-API-CUST-093 | Admin | GET list — filter by is_active=true | P2 | `GET /api/customers?is_active=true` | 200; only active customers | API | |
| TC-API-CUST-094 | Admin | GET list — filter by is_active=false | P2 | `GET /api/customers?is_active=false` | 200; only deactivated customers | API | |
| TC-API-CUST-095 | Admin | GET list — search by firm_name (ILIKE) | P2 | `GET /api/customers?search=acme` | 200; rows matching ILIKE `%acme%` on firm_name or contact or gstin | API | |
| TC-API-CUST-096 | Admin | GET list — pagination | P2 | `GET /api/customers?page=2&limit=5` | 200; second page | API | |
| TC-API-CUST-097 | Admin | GET list — sorted by firm_name ASC | P2 | GET list; check first/last row | Results in alphabetical order | API | `ORDER BY c.firm_name ASC` |
| TC-API-CUST-100 | Unauthenticated | GET detail — no token → 401 | P1 | `GET /api/customers/<uuid>` (no token) | 401 | API | |
| TC-API-CUST-101 | Admin | GET detail — existing customer | P1 | `GET /api/customers/<valid-id>` | 200; full customer object | API | |
| TC-API-CUST-102 | Admin | GET detail — non-existent → 404 | P1 | `GET /api/customers/<random-uuid>` | 404 `Customer not found` | API | |
| TC-API-CUST-103 | Admin | GET detail — invalid uuid → 400 | P1 | `GET /api/customers/not-a-uuid` | 400 Zod | API | `customerIdParamSchema` |
| TC-API-CUST-104 | Supervisor | GET detail — Supervisor → 200 | P2 | Authenticate as Supervisor; `GET /api/customers/<valid-id>` | 200 | API | authenticate-only |
| TC-API-CUST-110 | Unauthenticated | GET sub-dealers — no token → 401 | P1 | `GET /api/customers/<uuid>/sub-dealers` (no token) | 401 | API | |
| TC-API-CUST-111 | Admin | GET sub-dealers — existing primary dealer | P1 | Create primary + 2 sub dealers; `GET /api/customers/<pd-id>/sub-dealers` | 200; array of 2 sub dealers | API | Spec 09 |
| TC-API-CUST-112 | Admin | GET sub-dealers — primary with no subs → empty array | P2 | `GET /api/customers/<pd-id-with-no-subs>/sub-dealers` | 200; `[]` | API | |
| TC-API-CUST-113 | Admin | GET sub-dealers — only active subs returned | P2 | Deactivate one sub; GET sub-dealers | Deactivated sub absent from response | API | Service filters `is_active = true` |
| TC-API-CUST-114 | Supervisor | GET sub-dealers — Supervisor → 200 | P2 | Authenticate as Supervisor | 200 | API | authenticate-only |
| TC-API-CUST-115 | Warehouse Operator | GET sub-dealers — WH Op → 200 | P2 | Authenticate as WH Op | 200 | API | |
| TC-API-CUST-116 | Dispatch Operator | GET sub-dealers — Dispatch Op → 200 | P2 | Authenticate as Dispatch Op | 200 | API | |

---

## 14. Customers — Update and Delete

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CUST-120 | Admin | PUT update — update firm_name | P1 | PUT `{ "firm_name": "New Name" }` on existing customer | 200; returned customer has new firm_name; audit log `UPDATE_CUSTOMER` written | Integration | |
| TC-API-CUST-121 | Admin | PUT update — update customer_type to Sub Dealer | P2 | PUT `{ "customer_type": "Sub Dealer", "primary_dealer_id": "<pd-id>" }` | 200; customer_type updated | API | |
| TC-API-CUST-122 | Admin | PUT update — no fields changed → returns existing | P2 | PUT `{}` (no fields) | 200; existing customer returned unchanged | API | Service short-circuits on empty fields |
| TC-API-CUST-123 | Admin | PUT update — non-existent → 404 | P1 | PUT on random UUID | 404 `Customer not found` | API | |
| TC-API-CUST-124 | Admin | PUT update — invalid uuid param → 400 | P1 | PUT `not-a-uuid` | 400 Zod | API | |
| TC-API-CUST-125 | Admin | PUT update — deactivate via is_active=false | P2 | PUT `{ "is_active": false }` | 200; `is_active = false` | API | `is_active` in updateableFields |
| TC-API-CUST-126 | Admin | PUT update — invalid GSTIN → 400 | P2 | PUT `{ "gstin": "BADGSTIN" }` | 400 Zod | API | |
| TC-API-CUST-130 | Admin | DELETE — soft-delete sets is_active=false | P1 | DELETE existing customer; then GET same id | DELETE returns 200 `Customer deactivated successfully`; GET returns 200 but `is_active = false` (not 404 — record remains) | Integration | Soft-delete |
| TC-API-CUST-131 | Admin | DELETE — non-existent → 404 | P1 | DELETE random UUID | 404 `Customer not found` | API | |
| TC-API-CUST-132 | Admin | DELETE — invalid uuid → 400 | P1 | DELETE `not-a-uuid` | 400 Zod | API | |
| TC-API-CUST-133 | Admin | DELETE — audit log CUSTOMER_DELETE written | P2 | DELETE customer; check audit_logs | Row with `action = 'DELETE_CUSTOMER'` and matching `entity_id` | Integration | |

---

## 15. Customers — Bulk Upload

> Route: `POST /customers/bulk-upload` (multipart/form-data, field `file`).  
> Returns 201 even when some rows errored. Max 500 rows per upload. Sub Dealer must reference existing active Primary Dealer by firm_name.  
> **ORDER-SENSITIVE:** `/bulk-upload/sample` (GET) and `/bulk-upload` (POST) are declared before `/:id` in routes.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-API-CUST-140 | Admin | Bulk upload — no file → 400 | P1 | POST `/customers/bulk-upload` with no `file` field | 400 `No CSV file provided` | API | Spec 35 |
| TC-API-CUST-141 | Admin | Bulk upload — empty CSV → 409 | P1 | POST CSV with header row only | 409 `CSV file is empty` | API | ConflictError |
| TC-API-CUST-142 | Admin | Bulk upload — missing firm_name column → 409 | P1 | POST CSV with `name,address` header (no firm_name) | 409 `Missing required column: firm_name` | API | |
| TC-API-CUST-143 | Admin | Bulk upload — > 500 rows → 409 | P1 | POST CSV with 501 data rows | 409 `CSV contains 501 rows. Maximum allowed is 500 per upload.` | API | Hard cap in service |
| TC-API-CUST-144 | Admin | Bulk upload — valid all-primary CSV → 201 | P1 | POST CSV with 3 valid primary dealers (firm_name required; customer_type=Primary Dealer) | 201; `{ created: 3, errors: [] }` | Integration | Spec 35 |
| TC-API-CUST-145 | Admin | Bulk upload — returns 201 even with some errors | P1 | CSV with 2 valid + 1 row with missing firm_name | 201; `{ created: 2, errors: [{ row: N, error: "firm_name is empty" }] }` | Integration | Service continues on row-level errors |
| TC-API-CUST-146 | Admin | Bulk upload — per-row invalid GSTIN error | P2 | CSV with one row having `gstin = "BADGSTIN"` | 201; that row in errors with `invalid GSTIN format` | API | Per-row validation |
| TC-API-CUST-147 | Admin | Bulk upload — per-row invalid mobile error | P2 | CSV with `contact_person_mobile = "123"` | 201; row error `contact_person_mobile must be 10-15 digits` | API | |
| TC-API-CUST-148 | Admin | Bulk upload — invalid customer_type error | P2 | CSV row with `customer_type = "Retailer"` | 201; row error `customer_type must be 'Primary Dealer' or 'Sub Dealer'` | API | `canonicalCustomerType` returns undefined |
| TC-API-CUST-149 | Admin | Bulk upload — Sub Dealer without primary_dealer_name → row error | P1 | CSV row `customer_type = Sub Dealer` but `primary_dealer_name` empty | 201; row error `primary_dealer_name is required for a Sub Dealer` | Integration | Spec 35 |
| TC-API-CUST-150 | Admin | Bulk upload — Sub Dealer with unknown primary_dealer_name → row error | P1 | CSV row `customer_type = Sub Dealer`, `primary_dealer_name = "Unknown Co"` | 201; row error `primary dealer "Unknown Co" not found` | Integration | Service looks up by lower-cased firm_name |
| TC-API-CUST-151 | Admin | Bulk upload — Sub Dealer with valid primary_dealer_name → 201 | P1 | Pre-seed Primary Dealer "Acme Footwear"; CSV row: Sub Dealer + `primary_dealer_name = "Acme Footwear"` | 201; sub dealer created; `primary_dealer_id` set to Acme's id | Integration | Spec 35 |
| TC-API-CUST-152 | Admin | Bulk upload — duplicate firm_name in batch → row error | P1 | CSV with two rows having same firm_name | 201; second row in errors `a customer named "X" already exists` | Integration | `seenInBatch` de-duplication |
| TC-API-CUST-153 | Admin | Bulk upload — duplicate firm_name vs existing customer → row error | P1 | Pre-existing active customer "Beta Co"; CSV row with `firm_name = "Beta Co"` | 201; row error `a customer named "Beta Co" already exists` | Integration | `takenFirms` pre-fetched set |
| TC-API-CUST-154 | Admin | Bulk upload — case-insensitive dedupe (existing "BETA CO" matches "beta co") | P2 | Pre-existing "BETA CO"; CSV row `firm_name = beta co` | 201; row error (LOWER match) | Integration | Service uses `LOWER(firm_name)` |
| TC-API-CUST-155 | Admin | Bulk upload — 500 exact rows → 201 | P2 | POST CSV with exactly 500 unique firm names | 201; `created: 500` | Integration | Boundary; may be slow |
| TC-API-CUST-156 | Admin | Bulk upload — column headers are case-insensitive | P2 | CSV with `FIRM_NAME,ADDRESS` (uppercased headers) | 201; headers normalized to lowercase in service | API | `k.toLowerCase().trim()` |
| TC-API-CUST-157 | Admin | Bulk upload — BOM-prefixed CSV accepted | P2 | POST UTF-8 with BOM preamble | 201; `bom: true` in parse options strips BOM | API | |
| TC-API-CUST-158 | Admin | Bulk upload — invalid CSV format → 409 | P2 | POST file with non-CSV content | 409 `Invalid CSV format` | API | `parse` throws, caught as ConflictError |
| TC-API-CUST-159 | Admin | Bulk-upload sample CSV headers correct | P1 | `GET /api/customers/bulk-upload/sample` | 200 CSV; first line has columns: `firm_name,address,delivery_location,gstin,private_marka,gr,contact_person_name,contact_person_mobile,customer_type,primary_dealer_name` | API | Spec 35; `downloadCustomerSampleCsv` hardcoded headers |
| TC-API-CUST-160 | Admin | Bulk-upload sample CSV data rows | P2 | Parse sample CSV | Row 2: Primary Dealer "Acme Footwear"; Row 3: Sub Dealer "Acme Sub Store" referencing "Acme Footwear" | API | Hardcoded sample rows |

---

## Playwright Automation Recommendations (AUTOMATION GAP)

The following require new test files (Playwright `request` context) or additions to existing jest/supertest suites. No spec files currently cover these API contracts.

| Gap ID | Area | Recommended test file / spec | Priority | Notes |
|---|---|---|---|---|
| GAP-B5-01 | Inventory RBAC split | `e2e/api/inventory.spec.ts` — assert all-4-roles 200 for auth-only routes; assert only Admin 200 for `inventory:read` routes | P1 | Critical permission boundary |
| GAP-B5-02 | Trace auto-activation | Same file — seed a GENERATED box, trace it, verify status becomes FREE + CHILD_ACTIVATED transaction | P1 | Side-effect regression guard |
| GAP-B5-03 | Dispatch Zod refines | `e2e/api/dispatch.spec.ts` — exactly-one-source, customer_id required, 200-carton limit | P1 | Schema contract |
| GAP-B5-04 | Dispatch Supervisor 403 | Same file — assert Supervisor POST dispatch → 403 (spec 21 stale) | P1 | Stale spec correction |
| GAP-B5-05 | Dispatch WH Op GET 200 discrepancy | Same file — document WH Op GET /dispatches → 200 (no gate) | P2 | Discrepancy with access matrix |
| GAP-B5-06 | Sample foot-split last-foot logic | Same file — integration test for L/R split across two sample records | P1 | Complex invariant |
| GAP-B5-07 | Reports dead permissions | `e2e/api/reports.spec.ts` — WH Op 403 on all 11 report endpoints despite holding `reports:view_own` | P1 | Dead-perm documentation |
| GAP-B5-08 | CSV export headers | Same file — parse CSV bytes; assert exact header rows for all 5 export endpoints | P2 | Header contract regression |
| GAP-B5-09 | Customers bulk upload errors | `e2e/api/customers.spec.ts` — per-row error cases: bad GSTIN, unknown primary dealer, batch dedupe | P1 | Business logic coverage |
| GAP-B5-10 | Customers order-sensitive routes | Same file — assert `/bulk-upload/sample` and `/bulk-upload` not shadowed by `/:id` | P1 | Router registration order |
| GAP-B5-11 | Sub-dealer inheritance | Same file — create sub dealer with null address; verify inherited from primary | P2 | Service-level inheritance |

---

## TC Count Summary

| Module | Total TCs | Admin | Supervisor | WH Op | Dispatch Op | Unauth |
|---|---|---|---|---|---|---|
| Inventory auth-only | 46 | 12 | 9 | 9 | 9 | 7 |
| Inventory inventory:read | 25 | 16 | 3 | 3 | 3 | 2 (per endpoint) |
| Inventory trace | 16 | 12 | 1 | 1 | 1 | 1 |
| Inventory breakdown | 14 | 10 | 1 | 1 | 1 | 1 |
| Dispatch RBAC | 20 | 6 | 3 | 3 | 3 | 5 |
| Dispatch business rules | 34 | 32 | 0 | 0 | 2 | 0 |
| Dispatch list/detail | 11 | 6 | 2 | 1 | 1 | 1 |
| Reports RBAC | 33 | 10 | 7 | 8 | 8 | 0 (covered in endpoint TCs) |
| Reports endpoints | 17 | 13 | 4 | 0 | 0 | 0 |
| Reports CSV contracts | 17 | 12 | 2 | 2 | 2 | 0 (covered in RBAC) |
| Customers RBAC | 65 | 20 | 12 | 12 | 12 | 9 |
| Customers create/validation | 15 | 15 | 0 | 0 | 0 | 0 |
| Customers list/detail | 17 | 9 | 3 | 2 | 2 | 1 |
| Customers update/delete | 14 | 14 | 0 | 0 | 0 | 0 |
| Customers bulk upload | 21 | 21 | 0 | 0 | 0 | 0 |
| **TOTAL** | **365** | **198** | **57** | **42** | **44** | **27** |

---

## Matrix Discrepancies Found (encode-as-TCs, not bugs)

1. **`GET /dispatches` and `GET /dispatches/:id` have no `authorizePermission` gate.** WH Op gets 200 despite not holding `dispatch:read`. The access matrix says WH Op should be denied; the route code does not enforce this. TCs TC-API-DSP-013 and TC-API-DSP-018 document actual behavior (200) with a warning flag.

2. **Spec 21-dispatch-rbac asserts Supervisor dispatch-create=201.** Actual: 403. Supervisor lacks `dispatch:create` in seed. TC-API-DSP-003 captures the correct 403 and flags the spec as stale.

3. **Master-carton dispatch accepts ACTIVE or CLOSED (not CLOSED-only).** The session brief says "CLOSED-only" but `dispatch.service.ts` checks `status !== CLOSED && status !== ACTIVE`. TC-API-DSP-026/027 both assert 201 for ACTIVE and CLOSED.

4. **`reports:view_own` (WH Op) and `reports:view_dispatch` (Dispatch Op) are DEAD permissions.** The route-level middleware uses `reports:view_all`; neither dead perm is checked anywhere. All report routes 403 for WH Op and Dispatch Op. TCs in Section 8 document actual 403.

5. **`customers:read` permission is not in any non-Admin seed.** `GET /customers/bulk-upload/sample` is gated by `customers:read` which only Admin holds (via super-admin bypass). TCs TC-API-CUST-032/033/034 document Supervisor/WH Op/Dispatch Op → 403.

6. **`GET /inventory/stock/hierarchy` accepts invalid `level` values and silently falls back to `section`.** No Zod validation on the `level` query param for this route (unlike `/cartons/hierarchy` which does validate). TC-API-INV-027 documents this behavioral difference.
