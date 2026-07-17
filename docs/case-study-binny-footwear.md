# Case Study — Binny Footwear × Basiq360

### From handwritten cartons to a scan-verified digital warehouse

> **A QR-driven inventory platform that eliminated phantom stock, made every carton traceable, and now tracks 56,000+ pairs of footwear in live production.**

---

## At a glance

| | |
|---|---|
| **Client** | Binny Footwear — Mahavir Polymers Pvt. Ltd. |
| **Industry** | Footwear manufacturing & warehousing (Jaipur, India) |
| **Partner** | Basiq360 |
| **Engagement** | QR-based Inventory Management Platform — Phase 1 delivered in 6 weeks, followed by 5 enhancement cycles |
| **Platform** | Mobile-first Progressive Web App + native mobile app, Dockerized backend |
| **Status** | **Live in production** — running the real warehouse today |

---

## The headline numbers

| Metric | Result |
|---|---|
| **56,300+** | Individual footwear pairs (child boxes) tracked with permanent QR identity in live production |
| **1,000+** | Master cartons under full digital lifecycle control |
| **3,400+** | Product SKUs managed in the live catalog — and growing daily as the client self-serves |
| **< 1 second** | Scan-to-confirmation response time on standard warehouse phones |
| **20–30** | Concurrent warehouse operators supported |
| **6 weeks** | From kickoff to a complete, deployed Phase 1 platform |
| **Zero** | Phantom-stock discrepancies once the digital record was enforced at the database level |

---

## The challenge

Binny Footwear runs a vertically integrated operation — manufacturing, packing, storage, and dispatch all under one roof. But the inventory that flowed through it was tracked the way it had been for decades: **by hand.**

Warehouse staff handwrote article name, colour, size, and quantity directly onto the outside of master cartons. That worked until the cartons moved — and in a real warehouse, cartons move constantly. They get **unpacked and repacked** for order fulfillment, quality checks, and resorting. Nothing in the process recorded those events.

The result was a slow-burning operational tax:

- **Inventory mismatches** — the books said one thing, the shelf said another.
- **Phantom stock** — cartons that existed in the records but held different, or fewer, items than expected.
- **Dispatch errors** — wrong product shipped to customers because nobody could trust what was inside a carton.
- **No audit trail** — when a discrepancy surfaced, there was no way to trace *when* or *why* a carton's contents had changed.

Every one of those problems ended the same way: **financial loss, customer dissatisfaction, and hours burned on manual reconciliation.**

---

## The solution

Basiq360 designed and built a **QR-based digital tracking layer** that enforces inventory discipline at the level where it actually breaks down — the physical event.

The core insight was a **two-level hierarchy** that mirrors how the warehouse physically works:

- **Child Box (inner carton)** — one pair of footwear, one **permanent QR code** that follows it from the production line all the way to dispatch.
- **Master Carton (outer box)** — a *temporary* grouping container with a **dynamic QR code** and a strict lifecycle: `CREATED → ACTIVE → CLOSED → DISPATCHED`.

On top of that, the system digitally enforces the full warehouse workflow:

```
Pack  →  Store  →  Unpack  →  Repack  →  Dispatch
```

Every unpack is recorded with a timestamp, the operator, and a reason. A child box can belong to **only one active carton at a time** — a rule enforced by the database itself, not just the app. And every pair carries a complete, unbroken lineage:

```
child box  →  carton A  →  unpacked  →  carton B  →  dispatched
```

The outcome is simple to state and powerful in practice: **the digital record can never drift from the physical reality of the warehouse.** Phantom stock has nowhere to hide.

---

## What we built

### Scan-first, mobile-first
A Progressive Web App that installs on any Android or iOS phone — no app store, no dedicated hardware. Operators create cartons, pack pairs, and dispatch orders by pointing a phone camera at a QR code, with confirmation in under a second. An **offline scan queue** buffers operations when warehouse Wi-Fi drops and syncs automatically on reconnect — because network dead-zones are a fact of warehouse life, not an excuse for lost data.

### Industrial-grade label printing
Purpose-built thermal label templates for TSC printers, generated straight from the browser:
- **Child-box labels** (40×60mm) — article, colour, large size marker, MRP inclusive of all taxes, packed date, content description, QR code, and the full manufacturer footer.
- **Master-carton labels** (100×150mm) — company logo, article details, and a **size-assortment grid** showing per-size quantities and total pairs at a glance.

### Master data that fits the business
A **Product Master** extended with the client's real taxonomy — category, section (Hawaii / PU / EVA / Fabrication / Canvas / PVC / Sports Shoes), manufacturing location, article group, HSN code for GST, and size group. A **Customer Master** capturing firm details, GSTIN, delivery location, private marka, GR number, and contacts — so dispatch links to a real customer record instead of free-text guesswork.

### Traceability and audit by design
An immutable, append-only transaction log and a system-wide audit trail capture **every** state change with user, timestamp, and prior state. Any pair can be traced end-to-end, and any discrepancy can be explained.

### Access control that the client controls
Role-based access with a built-in **Role Manager** — administrators define, per role, exactly which modules a user can view, add, edit, or delete, and even *up to which lifecycle stage* an action is permitted. The Admin role is a protected super-admin, so the system can never be accidentally locked out.

---

## Beyond the brief — a partnership that kept delivering

Phase 1 shipped in six weeks. But the real story is what happened *after* go-live, when Basiq360 turned client feedback into a steady cadence of enhancements — each one shaped by how the warehouse actually operated:

- **7-level inventory drill-down** — a browse-the-catalog view that mirrors how Binny thinks about footwear: Section → Category → Article Group → Article → Colour → Size Group → carton. Counts roll up in pairs at every level, with a live "in-warehouse only" view for replenishment decisions.
- **Legacy stock onboarding** — a pragmatic path to bring pre-go-live cartons (already sealed, no QR labels) into the system via CSV, then progressively convert them to full per-box tracking with an "Open for Repacking" flow. The new platform didn't demand the client throw away existing stock to adopt it.
- **E-commerce & sample channels** — dedicated stock views and scan-to-allocate flows for the client's online and sampling operations, reusing the same drill-down machinery for a consistent experience.
- **Label reprint, bulk uploads, and catalog tooling** — per-row and bulk QR reprints, bulk product create/update by CSV, and product export — the day-to-day conveniences that make a system something operators *want* to use.

When the client hit real-world edge cases — a bulk import failing on a casing mismatch, duplicate rows splitting inventory, scan queues skipping boxes under rapid fire — Basiq360 diagnosed each to root cause and shipped a durable fix, not a patch.

### A go-live migration done right
Perhaps the clearest proof of engineering discipline: when it was time to move the client's real inventory onto the live server, Basiq360 migrated **1,000+ master cartons and 56,300+ child boxes while preserving every physical barcode already pasted on the shelves** — so not a single label had to be reprinted, and no barcode could ever collide between environments. Every step ran behind a full database backup, dry-run-then-commit transactions, and post-migration integrity checks (zero orphans, zero mismatches).

---

## Business impact

| Before | After |
|---|---|
| Handwritten carton labels | Scan-verified digital identity for every pair |
| No record of unpack/repack events | Every event timestamped, attributed, and reason-coded |
| Phantom stock and dispatch errors | Digital record locked to physical reality by database constraints |
| Discrepancies untraceable | Full end-to-end lineage for any pair, any carton |
| Reconciliation done by hand | Real-time inventory that reconciles automatically on every scan |
| Dedicated scanner hardware | Any warehouse phone, online or offline |

The platform didn't just digitize a paper process — it **made an entire class of errors structurally impossible.**

---

## Why it works

- **Correctness enforced at the foundation.** Business rules live in the database as constraints and atomic transactions — a child box *cannot* be in two active cartons, a non-closed carton *cannot* be dispatched. The system is safe even under concurrent operators and race conditions.
- **Built for warehouse reality.** Offline-first, sub-second scans, durable labels with reprint support, and a UI simple enough to need minimal training.
- **Adopted, not imposed.** Legacy stock onboarding and configurable roles let Binny fold the platform into an operation already in motion.
- **A living product.** Six enhancement cycles after launch, the client is still adding SKUs, still shipping requests, still growing on the platform — the surest sign a system earned its place.

---

## The technology

Next.js (TypeScript) PWA + native mobile app · Node.js / Express REST API · PostgreSQL with integrity constraints, atomic transactions, and audit triggers · JWT auth with configurable RBAC · html5-qrcode scanning · TSPL thermal-label generation · fully Dockerized, single-command deployment.

---

## In one line

> **Basiq360 took Binny Footwear from handwritten cartons to a scan-verified digital warehouse — eliminating phantom stock, making 56,000+ pairs individually traceable, and delivering a platform the client keeps building on.**

---

*Prepared for marketing and company-profile use. Operational metrics reflect the live production system. Client and vendor names used with reference to the project engagement.*
