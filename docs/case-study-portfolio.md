# Binny Footwear Inventory Platform

### Product case study — building & shipping a production warehouse system as an AI-driven Product Manager

**My role:** Product Manager & builder — I owned the product end to end: discovery with the client, scoping, technical decisions, and the actual build, which I drove through AI-assisted development. I didn't hand a spec to a dev team; I directed the tooling, made the calls, and shipped.

**Outcome:** A QR-based inventory platform now running in live production — tracking **56,000+ pairs of footwear**, **1,000+ cartons**, and **3,400+ SKUs** for a real manufacturer. Phase 1 shipped in **6 weeks**, followed by six enhancement cycles driven by live client feedback.

---

## The problem I was solving

Binny Footwear (Mahavir Polymers) ran a vertically integrated factory and warehouse on **handwritten carton labels**. The moment a carton got unpacked and repacked — which happens constantly in a real warehouse — the records and the shelf diverged. That produced phantom stock, dispatch errors, and hours of manual reconciliation, with no audit trail to explain any of it.

The interesting part wasn't the tech. It was the **product framing**: the failure didn't happen at data-entry time, it happened at the *physical event* — the unpack, the repack, the dispatch. So the product had to instrument those events, not just store a snapshot of inventory.

## The product bet

I designed the system around a **two-level hierarchy that mirrors the physical world**:

- **Child box** = one pair, one **permanent QR** that lives from production to dispatch.
- **Master carton** = a *temporary* container with a **lifecycle** (`CREATED → ACTIVE → CLOSED → DISPATCHED`).

Then I made the workflow — Pack → Store → Unpack → Repack → Dispatch — something the system *enforces* rather than merely records. A child box can only live in one active carton at a time; a carton that isn't closed can't be dispatched. Crucially, I pushed those rules **down into the database as constraints**, not just app logic — so correctness holds even under 20–30 concurrent operators. The digital record physically *cannot* drift from reality.

That was the whole thesis: **make an entire class of errors structurally impossible**, instead of asking staff to be more careful.

---

## How I worked — AI-driven, product-led

I built this by orchestrating AI development against a tight product spec — which changed how I spent my time. Less time typing code, far more time on the things that actually decide whether a product succeeds:

**Discovery & scoping.** I ran the requirement sessions, translated a warehouse manager's language ("we open cartons to pull orders") into enforceable system rules, and locked scope hard — an explicit Phase 1 boundary with change requests tracked separately, so a 6-week delivery stayed a 6-week delivery.

**Decision-making under ambiguity.** Real product calls, made with the client and documented: Count in *pairs* at every level. In-warehouse stock excludes dispatched cartons. Legacy stock is count-level, so it never mixes with piece counts. Ship the Role Manager and inventory drill-down as one bundle, not two. Each of these was a fork with real trade-offs; I picked, justified, and moved.

**Directing the build.** I drove implementation through AI tooling — decomposing features, reviewing output, catching regressions, and keeping architecture coherent across a TypeScript PWA, an Express API, and PostgreSQL. The value I added wasn't keystrokes; it was judgment about *what* to build, *in what order*, and *when it was actually correct*.

**Shipping discipline.** I ran a strict deploy pipeline — localhost → test server → client UAT → live — with a full database backup and a git revert baseline before every data-touching operation. Nothing hit production untested.

**Root-cause debugging, not patching.** When a client bulk-import failed, I traced it to a case-sensitivity mismatch in the catalog — not a UI bug. When operators reported "it saves but nothing changes," I dug past the obvious PWA-cache theory to the real cause: unstable list ordering from bulk uploads sharing an identical timestamp, so the paginated list reshuffled and users edited the wrong row. When rapid scanning skipped boxes, I found the serialized scan-queue race. Each one got a durable fix backed by a reproduction, not a band-aid.

---

## The build

**Scan-first PWA** — installs on any phone, no dedicated hardware. Sub-second scan-to-confirmation, with an **offline queue** that buffers scans through warehouse dead-zones and syncs on reconnect.

**Thermal label printing** — TSPL templates for TSC printers generated in-browser: child-box labels (article, colour, size, tax-inclusive MRP, QR) and master-carton labels with a per-size assortment grid.

**Master data** — a Product Master fitted to the client's real taxonomy (section, category, HSN, size group) and a Customer Master (GSTIN, delivery location, private marka) that dispatch links to.

**Configurable RBAC** — a Role Manager where an admin sets, per role, view/add/edit/delete rights *and* the lifecycle stage up to which an action is allowed — with a protected super-admin so the system can't be locked out.

**7-level inventory drill-down** — a browse view that mirrors how the client thinks about footwear (Section → Category → Article Group → Article → Colour → Size Group → carton), counts rolling up in pairs.

**Full traceability & audit** — an immutable transaction log; any pair traceable end to end, any discrepancy explainable.

---

## The moment I'm proudest of

**A zero-reprint go-live migration.** Moving the client's real inventory onto the live server, I migrated **1,000+ cartons and 56,300+ child boxes while preserving every physical barcode already pasted on the shelves** — so not one label had to be reprinted, and no barcode could ever collide between environments. It ran behind a full backup, as a dry-run-then-commit transaction, verified with integrity checks: zero orphans, zero count mismatches.

That's the kind of thing that separates a demo from a product people actually trust with their warehouse.

---

## What this demonstrates

- **Product judgment** — framing the real problem (instrument the event, not the snapshot) and betting the architecture on it.
- **AI-driven delivery** — shipping a full-stack production system by directing AI tooling with a clear spec and strong review, not by writing every line by hand.
- **Ownership across the stack** — discovery, scoping, technical architecture, deployment, debugging, client comms — one person, end to end.
- **Shipping to real users** — live in production, six iteration cycles deep, with the client still adding SKUs daily. The truest signal a product earned its place.

---

## Stack

Next.js (TypeScript) PWA · Node.js / Express · PostgreSQL (integrity constraints, atomic transactions, audit triggers) · JWT + configurable RBAC · html5-qrcode · TSPL thermal-label generation · Dockerized, single-command deploy.

---

*Product case study — Binny Footwear (Mahavir Polymers) inventory platform. Metrics reflect the live production system.*
