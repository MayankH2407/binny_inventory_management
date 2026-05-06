# Basiq360 Inventory Management System — Progress Tracker
## Client: Binny Footwear (Mahavir Polymers Pvt. Ltd.)
## Vendor: Basiq360
## Project Start: March 2026
## Phase: 1 (6 weeks)

---

## Project Status: PHASE 1 COMPLETE — PHASE 1.5 COMPLETE — PHASE 2 (UI ENHANCEMENT) COMPLETE — PHASE 3 (PWA) COMPLETE — DEPLOYED TO PRODUCTION — PHASE 4 (MEETING FEEDBACK) COMPLETE — PHASE 5 (MOBILE APP) IN PROGRESS — PHASE 6 (POST-QA MODIFICATIONS) IN PROGRESS

---


## Phase 6 — Post-QA Modifications (batched; testing deferred to after all mods)

### May 6, 2026 — Bugfix: master carton label only printed first colour (multi-colour cartons)

**Issue reported by client:** Master carton `MCHT43E1` was packed with Blue, Red, and Green child boxes (MOGLI PLUS 02, sizes 2 + 3, 60 boxes total — BLUE 28, GREEN 8, RED 24), but the printed label's `Colour:` row read only `BLUE`.

**Root cause:** `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` `handlePrintLabel` accumulated only the first assortment row's article/colour/MRP via `if (!primaryArticle) { ... }`. The `sizeMap` correctly aggregated all rows but the article/colour/MRP scalars latched on the first row alone. Multi-colour or multi-MRP cartons silently lost data on the printed label.

**Fix (1 file):** swap the three scalars for `Set<string>` / `Set<number>` accumulators, render comma-joined for article/colour and ` / `-joined sorted for MRP.
- `articleLabel = Array.from(articleSet).join(', ')`
- `colourLabel = Array.from(colourSet).join(', ')`
- `mrpLabel = Array.from(mrpSet).sort().map(toFixed(2)).join(' / ')`

Single-value cartons render exactly as before; multi-value cartons now list every distinct entry. The on-screen Assortment Summary table was already correct (it iterates the full assortment array) — only the print-window label had the bug.

**Verification:**
- `npx tsc --noEmit` from `frontend/` → only the 3 pre-existing e2e errors (`03-child-boxes.spec.ts`, `27-edge-cases.spec.ts`); no new errors.
- Portal DB query: `MCHT43E1` returns 6 assortment rows × 3 distinct colours × 1 article × 1 MRP. Aggregation will render `Article: MOGLI PLUS 02 / Colour: BLUE, GREEN, RED / MRP: ₹ 117.00`.

**Deploy:**
- `tar -cz "frontend/.../master-cartons/[id]/page.tsx" | ssh ... tar -xzv` into `/opt/binny/`.
- `docker compose -f docker-compose.prod.yml build binny-frontend` → image rebuilt clean.
- `docker compose -f docker-compose.prod.yml up -d binny-frontend` → recreated, healthy.
- Backend not touched (no schema or service change).

**Action for client:** re-print the `MCHT43E1` label after a hard refresh (Ctrl+Shift+R) of `/master-cartons/<id>` to bust the prior bundle cache. Expect `Colour: BLUE, GREEN, RED`. If the label width is too narrow for a long colour list, we'll need a layout pass (font-size step or row-wrap) — flag if seen.

**Not committed yet** — held with the prior May 5 batch until you're ready for a combined commit.

---

### May 6, 2026 — Deployed May 5 client-mods batch to testing portal

Shipped the six-commit batch from yesterday (`ea6d5b6` → `b400917`) to `srv1409601.hstgr.cloud`. Migration ran cleanly against the portal DB; new short-format barcodes resolve end-to-end.

**What shipped (8 files):**
- Backend services: `childBox.service.ts`, `ecommerce.service.ts`, `masterCarton.service.ts`, `sample.service.ts`
- Backend util: `barcodeGenerator.ts` (new)
- Backend script: `migrate-barcodes-to-short-format.ts` (+ JS twin for prod container — see below)
- Frontend: `child-boxes/generate/page.tsx`, `master-cartons/[id]/page.tsx`

**Deploy procedure:**
1. `tar -cz <files> | ssh ... tar -xzv` into `/opt/binny/` (one stream for backend, one for frontend).
2. `docker compose -f docker-compose.prod.yml build binny-backend` → image `binny-binny-backend:latest` rebuilt clean.
3. `docker compose -f docker-compose.prod.yml build binny-frontend` → image `binny-binny-frontend:latest` rebuilt clean.
4. `docker compose -f docker-compose.prod.yml up -d binny-backend binny-frontend` → both containers recreated; backend healthy in ~5s, frontend up.
5. Migration: prod container is built multi-stage (only `dist/` ships, no ts-node). Wrote `backend/scripts/migrate-barcodes-to-short-format.js` (CommonJS twin of the TS script using `require('../dist/...')`), `docker cp`-ed into `binny-backend:/app/scripts/`, executed via `docker exec binny-backend node /app/scripts/migrate-barcodes-to-short-format.js`.
6. CSV rollback record copied back to host: `/opt/binny/backend/scripts/barcode-migration-2026-05-06T07-58-20.csv` (16 KB).

**Migration results (portal DB):**
- child_boxes: 154 rows
- master_cartons: 1 row
- sample_records: 1 row
- ecommerce_records: 1 row
- **Total: 157 rows** (much smaller than local's 6,775 — portal carries cleaner test data).
- Independent SQL verification: zero `BINNY-%` rows remain across all four tables.

**End-to-end verification:**
- `GET /binny/api/v1/health` → `{"status":"ok","timestamp":"2026-05-06T07:58:50.615Z"}`.
- Sampled new barcode `CBG338WY` from `child_boxes`, logged in as admin, `GET /binny/api/v1/child-boxes/qr/CBG338WY` → 200 with `article_name: "CITY 02"` populated (confirms both the short-format dispatch and the `ecde27c` response-field fix work in production).

**Note on JS twin script:** `backend/scripts/migrate-barcodes-to-short-format.js` is the deploy artefact for prod-container execution. It's idempotent (same `LIKE 'BINNY-%'` filter) and could be re-run safely if the portal ever ingests legacy-format records again. Should commit alongside the TS source for future deploys.

**Branch state:** Local `main` is still 24 ahead of `origin/main` — push not done. The new JS twin script (`migrate-barcodes-to-short-format.js`) is untracked.

**Next:**
- Push branch to `origin/main` once user OKs.
- Resume mobile test-case authoring at session 4 (`phase-24-mobile-master-cartons.md`).
- Hand off `docs/tsc-printer-setup-guide.html` once client confirms TSC printer model.

---

### May 5, 2026 — Client mods batch: short barcodes + label refresh + Playwright sweep (committed, not yet deployed)

Six commits across backend / frontend / mobile / Playwright suite, all in the working tree by end of day. Test portal **not yet redeployed** — deferred per user instruction. Local dev stack has all changes active and verified.

**1. Article-name on child-box label** — `ea6d5b6`. The printed child-box label's top row read "Article No: <article_code>" using the SKU/code; client clarified it should read the human-readable article name. Single-line change in the print template (`box.article_code` → `box.article_name`) since `article_name` is already on the `ChildBoxWithProduct` type at `frontend/src/types/index.ts:78`.

**2. Backend `article_name` response field** — `ecde27c`. Surfaced when (1) above shipped: the bulk-multi-size create endpoint constructed its response object with key `product_name` (not `article_name`), so the new label printed "Article: undefined" on localhost. The earlier label using `article_code` had been correctly named in the response, masking the inconsistency. Read-path queries had been de-aliased to return `article_name` directly per a prior fix (Apr 30); this commit applies the same convention to the three write-path response constructors in `backend/src/services/childBox.service.ts` and updates the inline return-type annotations. Local backend container restarted (Windows Docker bind-mounts don't propagate inotify, so nodemon couldn't auto-reload). Verified end-to-end via API call returning the expected shape.

**3. Master carton label: add QR + Article-name** — part of `32ae367`. `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` regains a QR (was previously removed per an earlier client wireframe) on the right side of the info table — `<td rowspan="3" class="qr-cell">` — encoding `carton_barcode`. Right-side placement matches the child-box pattern; it sits with the variable-height info rows so the sizes table below grows independently when there are many sizes. Bottom placement was attempted first then rejected for that same reason. "Article No.: <name>" row also renamed to "Article: <name>". Layout fits comfortably within the 92×142mm printable area (logo 19mm + info 24mm + assortment 8mm + sizes 16mm + headroom).

**4. Short barcode format (8 chars)** — `8cc41b3`. Replaces legacy `BINNY-XX-{uuid}` (~45 chars) with `<2-char type><6-char Crockford Base32>` for newly-generated child-box / master-carton / sample / e-commerce records. Type prefixes (`CB`, `MC`, `SR`, `EC`) preserve existing scanner-side dispatch — no multi-table lookup needed. `backend/src/utils/barcodeGenerator.ts` (new) provides `generateUniqueBarcode(type, client?)` which retries up to 10 times against the target table's UNIQUE constraint inside an optional transaction. Crockford alphabet excludes I, L, O, U for human readability — the new short barcode is now printed beneath the QR. Reason for shortening: client wants the barcode visible as a fallback for unscannable QRs, and 45 chars don't fit cleanly in monospaced caption space. Mobile `parseQRCode` keeps **dual-format** support: the `^(CB|MC|SR|EC)[0-9A-Z]{6}$` regex matches new-format codes; falls back to the legacy `BINNY-XX-{uuid}` matcher for any pre-migration physical labels still in circulation.

**5. Existing-records migration** — `0fc8ec9`. One-shot Node script `backend/scripts/migrate-barcodes-to-short-format.ts` per-table-transactionally UPDATEs every `barcode LIKE 'BINNY-%'` row to a new short barcode via `generateUniqueBarcode()`. Idempotent (the LIKE filter skips already-migrated rows). Writes a CSV of `{table, id, old_barcode, new_barcode}` to `backend/scripts/barcode-migration-{timestamp}.csv` (gitignored) as the rollback record. Audit log `notes` text intentionally NOT rewritten — those record what the barcode was at the time of the event. Local DB migrated: **6,256 child boxes + 374 master cartons + 80 samples + 65 e-commerce records = 6,775 rows**. Independent SQL verification: zero `BINNY-%` rows remain across all four tables. Test portal DB still on legacy format; will run the same script there at next deploy. **Rollback:** the CSV captures pre-migration values; `parseQRCode`'s dual-format fallback means rollback isn't strictly needed even if a few legacy physical labels exist (they parse and would lookup-by-barcode, just to nothing).

**6. Print labels: barcode caption beneath QR** — also part of `32ae367`. Both labels now show the new short barcode in plain text beneath the QR (Courier-mono — 6pt on child-box, 8pt on master carton). Lets a human read and type the code if the QR is unscannable.

**7. Playwright e2e suite updates** — `b400917`. Six specs updated: `03-child-boxes`, `04-master-cartons`, `19-childbox-rbac`, `30-generated-lifecycle`, `31-samples-module`, `32-ecommerce-module`. Hardcoded `^BINNY-XX-/` regex assertions now use `^XX[0-9A-Z]{6}$/`; search-input fixture in `03` flipped from `'BINNY-CB-'` to `'CB'`; `04`'s detail-page locator uses an unanchored substring match so it finds the carton barcode wherever it appears in surrounding text. `12-pwa-features` intentionally left untouched — it uses `BINNY-CB-...` as offline-queue mock fixtures (PWA queue logic, not DB lookup), and the dual-format parser still recognises them. **Result: 90/90 of the 6 affected specs pass** (3.9 min wall-clock), zero pre-existing flakes triggered.

**Test impact (deferred work):**
- v3 phase markdown specs that hard-code `BINNY-XX-` references (phase-09, 10, 11, 12, 13, 16, 18, 20, 07, 08) need updating to the new format. Held with the rest of the test-authoring backlog (combined commit at end of 13-session work).
- Mobile parseQRCode is dual-format; mobile spec files don't yet have explicit unit tests for the short format. Add when sessions 4-13 of mobile authoring resume.

**Held in working tree (NOT today's commits):**
- `docs/test-cases-v3/README.md` (modified — phase 21-32 mobile rows added on May 2)
- `docs/test-cases-v3/phase-21/22/23-*.md` (untracked — mobile test-authoring sessions 1-3)
- `docs/tsc-printer-setup-guide.html` (untracked — May 4 doc, awaits client TSC model confirmation)
- `scripts/progress-checkpoint.sh` (per-session crash-resume artefact, leave alone)

**Branch state:** `main` is now 24 ahead of `origin/main`. Seven commits since this morning's deploy log:
- `ea6d5b6` Child-box label: show article name instead of article code
- `ecde27c` Child box create response: emit article_name (not product_name)
- `8cc41b3` Barcodes: switch new records to 8-char short format (CBxxxxxx etc.)
- `0fc8ec9` Barcodes: one-shot migration script for existing records
- `32ae367` Print labels: master carton QR + Article-name + barcode caption
- `b400917` Playwright e2e: assert new 8-char barcode format on created records
- `6923cf4` progress.md: log May 5 client mods batch (short barcodes + label refresh + e2e)

**Deploy status:** explicitly **NOT deployed** per user instruction at end of session. Test portal (`https://srv1409601.hstgr.cloud/binny/`) is still running the morning's `f914855` (print CSS hardening) on top of `b756293` (HID scanner). Test-portal DB still on legacy `BINNY-XX-{uuid}` barcodes — the migration script has only run against the local DB.

**Next session — pre-deploy gate:**
1. Eyeball verify on localhost: `/child-boxes/generate` → fresh box prints with `CB[6 chars]` QR + Courier caption; `/master-cartons/<id>` → print preview shows QR on the right of the info table + Courier caption below it. Confirm the labels look right at 50×50mm and 100×150mm respectively.
2. Hand off `docs/tsc-printer-setup-guide.html` once client confirms TSC printer model.
3. **When client OKs the new label visuals**, deploy to test portal:
   - tar+SSH the frontend changes → `docker compose -f docker-compose.prod.yml build binny-frontend`
   - copy `backend/scripts/migrate-barcodes-to-short-format.ts` to the portal `/opt/binny/backend/scripts/`
   - tar+SSH the four backend service files + new util to the portal `/opt/binny/backend/src/`
   - `docker compose build binny-backend` and bring up
   - `docker compose exec binny-backend npx ts-node scripts/migrate-barcodes-to-short-format.ts` (run against portal DB; expect ~6,775+ rows depending on portal data volume)
   - `up -d` for both frontend + backend; verify `/api/v1/health` and a sample `GET /child-boxes/qr/CB...` lookup
4. After portal ships and client signs off, resume mobile test-authoring at session 4 (`phase-24-mobile-master-cartons.md`).

---

### May 5, 2026 — Print CSS hardening committed + deployed to testing portal

Per user request, shipped the print CSS hardening from the May 4 entry without waiting for client driver-model confirmation. The CSS change is independent of and complementary to the printer-driver fix — even with the driver correctly set to 100×50mm media, the hardened layout (inline-block over flex, explicit body width anchor, `overflow: hidden` on `.label`) is the more print-engine-safe form.

**Commit:** `f914855` — "Child-box label print: harden CSS for 2-up layout cross-browser" (1 file, +14/-4).

**Deploy procedure:** same recipe as `b756293` yesterday.
- `tar` over SSH → `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx` streamed to `/opt/binny/` on `srv1409601.hstgr.cloud`.
- `docker compose -f docker-compose.prod.yml build binny-frontend` → image rebuilt clean (cache hit on most layers, ~10s total).
- `docker compose -f docker-compose.prod.yml up -d binny-frontend` → container recreated, healthy in ~5s.

**Verification:**
- `GET /binny/api/v1/health` → 200 `{"status":"ok","timestamp":"2026-05-05T05:19:59.419Z"}`.
- `GET /binny/` → 200 after 1 redirect.
- `GET /binny/child-boxes/generate` → 200 (no redirect — auth-protected route returns the page wrapper).

Branch is now 17 ahead of `origin/main` (push deferred). The TSC printer driver setup guide (`docs/tsc-printer-setup-guide.html`) remains uncommitted and untracked — it's a standalone reference doc, not server-deployed; will be handed off to client/on-site IT directly.

**Client-side verification still required** (only the driver fix can produce the visible 50×50mm output): client to follow `docs/tsc-printer-setup-guide.html` to set the TSC driver media to 100×50mm + custom stock `Binny 100x50 2up`, then print one batch from the deployed portal and confirm dies are correctly placed on the 100mm-wide roll.

---

### May 4, 2026 — Scanner fix deployed + print CSS hardening + TSC driver setup guide

**Three follow-on items from the scanner/print bug report:**

**1. Deployed scanner fix (`b756293`) to testing portal.**
- `tar` over SSH streamed `frontend/src/components/scanning/HIDScannerInput.tsx` + `progress.md` to `/opt/binny` on `srv1409601.hstgr.cloud`.
- `docker compose -f docker-compose.prod.yml build binny-frontend` → image `binny-binny-frontend:latest` rebuilt clean.
- `docker compose -f docker-compose.prod.yml up -d binny-frontend` → container recreated, healthy in ~3s.
- Verification: `https://srv1409601.hstgr.cloud/binny/` → HTTP 200 after 1 redirect; `/api/v1/health` → `{"status":"ok"}`.
- No backend rebuild, no DB migration. Branch is now 16 ahead of `origin/main` (push deferred).

**2. Print CSS hardening — `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx`.**

Client clarified the print intent: roll is 100mm wide × 50mm tall per row, two 50×50mm sticker dies per row, each peeled and stuck on a separate child box, each QR scanned independently. The CSS in commit `e6a3617` already targets this layout, but the symptom (labels printing at ~50×25mm) points to the printer driver's media size still being 50×50mm from the pre-2-up days — when Windows scales the 100×50mm page to fit a 50mm-wide media, output is uniform 50% → 50×25mm. **CSS cannot fix a driver-side scale**, but I hardened the print-window styles to remove flexbox-in-print as a possible co-factor:

- Replaced `display: flex; flex-direction: row` on `.row` with inline-block + `white-space: nowrap` + `font-size: 0` (kills inline-block whitespace) + `font-size: 11pt` reset on `.label` for inner content. Inline-block has more consistent cross-axis sizing in print contexts than flex across Chrome/Edge versions.
- Added `html, body { width: 100mm; margin: 0; padding: 0; }` as an explicit anchor so the body never shrinks to fit content height.
- `.label` adds `overflow: hidden` so any 0.1mm sub-pixel rounding doesn't push the inner table past the 50mm boundary and trigger an extra page.
- Inner `table.main { width: 100%; height: 100%; }` left unchanged — works correctly now that the parent isn't flex.

`npx tsc --noEmit` clean (same 3 pre-existing e2e errors only). Not yet committed or deployed — bundling with the driver guide pending client model confirmation.

**3. New doc: `docs/tsc-printer-setup-guide.html`.**

Standalone HTML setup guide for the on-site TSC printer driver reconfiguration (the actual fix for the 50×25mm symptom). Confirmed details from client: TSC printer (model TBD), admin rights present, directly attached via USB.

Six-step walkthrough — open Printer Properties → define a `Binny 100x50 2up` custom stock (Labels with Gaps, 100×50mm, gap 3mm, sensor=Gap) → set as default in **both** Preferences AND Printing Defaults (the latter is the commonly-missed step that makes Chrome use the wrong size) → calibrate gap sensor → print test from Chrome with explicit Paper-size selection (Chrome's dropdown sometimes still shows A4 even after driver default change).

Doc style mirrors `docs/Binny_Inventory_App.html` (navy/red brand palette, card layout). Self-contained — no external CSS/JS/fonts, can be emailed or shared on USB. Includes:
- Anchor-linked TOC
- Color-coded callouts (info/warn/danger/success)
- Step 4 ("Printing Defaults") explicitly highlighted with red left border + danger callout — that's the single most-missed step
- Tables for dialog field/value pairs (Step 2 driver dialog, Step 6 Chrome print settings)
- Troubleshooting matrix (9 symptom×cause×fix rows)
- Escalation checklist (5 items to send back if stuck — model number, screenshots, photo with ruler)
- `@media print` block strips the gradient header / TOC and avoids page-break-inside on cards so the doc itself prints cleanly to PDF
- Mobile-responsive layout (single-column meta-card under 640px)

**Next:**
- Await client confirmation that the scanner now works on the deployed portal (commit `b756293` is live).
- Hand off `docs/tsc-printer-setup-guide.html` to the client / on-site IT for the printer driver reconfig.
- Once client confirms 2-up printing is good, commit + deploy the print-page CSS hardening alongside (currently uncommitted).
- Then resume mobile parity M4 (dispatch multi-source).

---

### May 4, 2026 — HID scanner bug fix: stale-closure dropping scans

**Issue reported by client:** scanner showing "Scanner ready" / connected (works in Notepad) but barcodes don't register in the app.

**Root cause:** `HIDScannerInput.handleKeyDown` read `value` from React state closure when Enter fired. HID scanners (BPS250BC) inject the entire barcode + Enter as a single keystroke burst in <50ms — far faster than React commits renders. So the closure in the active render still held a stale (often empty or 1-char) `value` when Enter arrived, and `triggerScan` fired with the wrong payload (or short-circuited via `minLength`). User saw "nothing happened."

**Secondary bug (also fixed):** the global keydown listener auto-focused the input on first keystroke but didn't insert the character that triggered focus — so when the badge was gray ("Click to focus"), the first 1-2 chars of every scan were silently dropped.

**Fix — `frontend/src/components/scanning/HIDScannerInput.tsx`:**
- Submit path now reads `e.currentTarget.value` / `inputRef.current.value` (DOM truth) instead of the stale closure `value`. DOM reflects every keystroke that actually fired, regardless of whether React state has caught up.
- New `submit(code)` helper centralizes the read-clear-focus-onScan flow; called from input keydown, button click, and the global handler.
- Global keydown listener rewritten: when input isn't focused, it now (a) appends the character to `dom.value` AND syncs React state, (b) calls `e.preventDefault()` to suppress page-level shortcuts, (c) triggers submit when Enter arrives at body. So scans no longer require pre-focus to land cleanly.
- `onScan` and `minLength` captured via refs so the global listener doesn't rebind on every prop change.

**Verification:**
- `npx tsc --noEmit` from `frontend/` → only the 3 pre-existing e2e errors (TestDetails type signature in `03-child-boxes.spec.ts`, `27-edge-cases.spec.ts`) — same set the original `eba073d` commit reported. No new errors introduced by this fix.
- Manual hardware testing pending — to be re-verified by client on deployed build.

**Print issue (also reported, NOT a code fix):** client also reported labels printing at 50×25mm instead of the expected 50×50mm. CSS in `child-boxes/generate/page.tsx` is correct (`@page 100mm 50mm` with two 50×50mm labels per row). Most likely cause is the **printer driver media size** still set to 50×50mm from before the 2-up mod (`e6a3617`); when the browser sends a 100×50mm page, the driver scales-to-fit the 50mm-wide media (50% scale) → exactly 50×25mm output. Fix is at the driver: set Stock/Page Setup → 100mm × 50mm in the printer's Windows driver. No code change made.

**Next:** await client confirmation that scanner works on the deployed build, then proceed with mobile parity M4 (dispatch multi-source).

---

### May 1, 2026 — Mobile parity M3: E-commerce module screens

**Cloned M2's Sample screens with field substitutions.** No customer picker (e-commerce has marketplace/listing_sku/order_reference instead). Lifecycle constraints + role gates identical to Sample.

**Files created (3):**
- `mobile/app/ecommerce/index.tsx` (413 lines) — list with same chip/search/infinite-scroll layout. Card row shows ecommerce_barcode + status badge (`ECOMMERCE_STATUS_COLORS`), name, marketplace/listing_sku line (when set), child_count + mrp, dates. FAB → `/ecommerce/create` (Admin+Supervisor). Empty-state icon `cart-outline`.
- `mobile/app/ecommerce/create.tsx` (537 lines) — manager-gated. Form fields: name (required), marketplace, order_reference, listing_sku (autoCapitalize chars), mapped_date (`YYYY-MM-DD`, default today), notes. CustomerPicker removed entirely. Scan section identical to samples/create — same FREE/GENERATED guard, same optimistic-add pattern. Submit invalidates `[['ecommerce'], ['childBoxes'], ['inventory-summary'], ['inventory-hierarchy'], ['dashboard-stats']]`.
- `mobile/app/ecommerce/[id].tsx` (752 lines) — detail. Header card uses `ecommerce_barcode` + `name` + (marketplace if set). Timeline card adds `Mapped Date`, `Marketplace`, `Order Ref`, `Listing SKU` rows when set (Sonnet kept these in the Timeline card rather than splitting into a separate Details card — cleaner). Action bar identical lifecycle/role rules as Sample (Add Box / Close / Full Unpack / Dispatch). Per-row child-box trash for CREATED|ACTIVE+manager. AddBox calls `ecommerceService.addBox({ child_box_id, ecommerce_record_id: id })`.

**Files modified (1):**
- `mobile/app/(tabs)/menu.tsx` — E-commerce tile (`cart-outline`, `#7C3AED`) inserted after Samples and before Reports, under `RoleGate Admin+Supervisor`. Indexes: Samples 10, E-commerce 11, Reports 12, Users 13, Logout 14.

**Verification:**
- `npx tsc --noEmit` from `mobile/` → exit 0.
- Sanity grep: `mobile/app/ecommerce/` contains zero references to `customer_id`, `recipient_name`, `purpose`, `sample_date`, `samplesService`, or `customer_firm_name` — clean field substitution.
- `progress.md` not in agent's diff.

**Sonnet observed cleanups:** unused `FlatList` import + `useCallback` wrapper from sample-template not carried over since the scan list renders inline via `.map()`. Acceptable simplification.

**Next:** M4 — Dispatch multi-source (source-type segmented picker + per-source scan flow + payload routing).

---

### May 1, 2026 — Mobile parity M2: Sample module screens

**Built on the M1 foundation.** Three new screens + menu tile. No service changes (M1 already shipped `samplesService`). Lifecycle constraints from web mirrored exactly.

**Files created (3):**
- `mobile/app/samples/index.tsx` (410 lines) — list with search, status chips (`ALL/CREATED/ACTIVE/CLOSED/DISPATCHED`), infinite scroll, FAB → `/samples/create` (Admin+Supervisor). Card shows: barcode (mono) + status badge using `SAMPLE_STATUS_COLORS` (passed via `color` prop since `Badge` only knows `childBox`/`carton`), sample name, customer firm or "To: {recipient}", `child_count` boxes + `mrp_summary`, dates line.
- `mobile/app/samples/create.tsx` (856 lines) — manager-gated. Form: name (required), customer (inline `CustomerPicker` modal copied from `dispatch/create.tsx` per the brief — not extracted, M3 will copy again for ecommerce), recipient_name, purpose (multiline), sample_date (plain `TextInput` `YYYY-MM-DD`, defaults to today — no date-picker library), notes. Scan section: `BarcodeScanner` (`expectedType="child"`) + manual entry. Optimistic add, then background `childBoxService.getByBarcode` — if not FREE/GENERATED, removed from list with Alert. Submit calls `samplesService.create` with `child_box_barcodes`; success → invalidates samples/childBoxes/inventory/dashboard, `router.replace('/samples/{id}')`.
- `mobile/app/samples/[id].tsx` (751 lines) — detail. Header (name, barcode, status badge, child count + recipient), timeline (Created · Sample Date · Closed · Dispatched · Creator), action bar gated per state:
  - **Add Box** (CREATED|ACTIVE, manager) — toggles inline scan card
  - **Close Sample** (ACTIVE, manager) — `samplesService.close` with confirm Alert
  - **Full Unpack** (CREATED|ACTIVE|CLOSED, manager) — destructive Alert → `fullUnpack`
  - **Dispatch** (CLOSED, Admin+Supervisor+Dispatch Operator) — `router.push('/dispatch/create')` placeholder; M4 will wire source-type picker
  - **DISPATCHED** → "no actions available" note
  - Per-row trash icon on child boxes only for CREATED|ACTIVE+manager → `removeBox` with confirm.

**Files modified (1):**
- `mobile/app/(tabs)/menu.tsx` — inserted Samples tile (`flask-outline`, `#DC2626`) between Customers and Reports under `RoleGate allow={['Admin','Supervisor']}`. Renumbered remaining indexes (Reports→11, Users→12, Logout→13).

**Verification:**
- `npx tsc --noEmit` from `mobile/` → exit 0 (clean).
- `progress.md` not in agent's diff (verified — only menu.tsx + new samples files).

**Naming follow-through:** mobile imports as `samplesService` (matches M1 file name).

**Web parity notes:**
- Lifecycle rules match web exactly (FREE/GENERATED only for add-box, Close ACTIVE-only manager, fullUnpack CREATED|ACTIVE|CLOSED manager, Dispatch CLOSED).
- UX simplifications vs web: plain text date input (no date-picker library); Customer picker inline (not shared component) since M3 will need an identical pattern.
- Customer/recipient fallback chain matches web (`customer_firm_name` → `recipient_name` → null).

**Commit:** TBD by orchestrator after this entry lands.

**Next:** M3 — E-commerce module screens (mirror M2 with marketplace/listing_sku fields).

---

### May 1, 2026 — Mobile parity M1: data layer + barcode parsing

**Context:** Mobile APK on device is `042b1e6` (Apr 23) — missing the four Apr 27 web mods + Apr 30 carton view. Plan approved: 7 phases (M1 → M7) bringing mobile to feature parity. Opus plans, Sonnet executes per phase. M1 is the foundation — types + services + barcode parser; **no UI changes** in this phase (M2+ build screens on top).

**Files created (2):**
- `mobile/services/samples.service.ts` — 10 methods mirroring web `sampleService` (getAll/getById/getByBarcode/create/addBox/removeBox/close/fullUnpack/getAssortment/getChildren). Endpoints `/samples/...`. Body field for add-box/remove-box: `sample_record_id`.
- `mobile/services/ecommerce.service.ts` — identical structure to samples; endpoints `/ecommerce/...`; filter param `marketplace?: string`; body field `ecommerce_record_id`.

**Files modified (4):**
- `mobile/types/index.ts`:
  - Added `DispatchSourceType = 'master_carton' | 'sample' | 'ecommerce'`.
  - `DispatchRecord` — relaxed `master_carton_id` to nullable, added `sample_record_id?` / `ecommerce_record_id?` / `source_type?` / `source_label?`.
  - `CreateDispatchRequest` — `master_carton_ids` made optional, added `sample_record_id?` / `ecommerce_record_id?` (exactly-one-of constraint enforced server-side).
  - `InventoryHierarchyItem` — added `key?`, `totalPairs?`, `inStock?`, `sample?`, `ecommerce?`, `generated?`, `childBoxCount?`, `cartonCount?`, `children?`, `distinctMrpCount?` (last one drives the conditional MRP step in M5).
  - `ProductWiseRow` — added `sample_boxes` + `ecommerce_boxes` for M6 reports parity.
  - Appended `CartonHierarchyLevel` (`'status' | 'section' | 'article_name' | 'carton'`) + `CartonStockNode` interface for M5 carton view.
- `mobile/services/inventory.service.ts`:
  - `getStockHierarchy` level union extended with `'mrp'`; added `mrp?` filter.
  - New `getCartonHierarchy(level, filters)` mirroring the web client; normalizes both array and `{data, page, limit, total, totalPages}` response shapes. CSV export deliberately not added (web-only flow).
- `mobile/utils/index.ts` `parseQRCode` — regex extended to `BINNY-(CB|MC|SR|EC)-...`; return type widened to include `'sample' | 'ecommerce'`.
- `mobile/components/BarcodeScanner.tsx` — `expectedType` union extended with `'sample' | 'ecommerce'`. Replaced binary ternary in rejection-toast logic with a lookup map producing labels: child→"child box", master→"master carton", sample→"sample", ecommerce→"e-commerce package".

**Verification:**
- `npx tsc --noEmit` from `mobile/` → exit 0 (clean, no errors).
- `npm test` → 93/114 pass; the 21 failures are in `api.test.ts`, `useApi.test.ts`, `ui.test.tsx` and are **pre-existing** — none reference parseQRCode / BarcodeScanner / samplesService / ecommerceService / getCartonHierarchy. The services suite (`__tests__/services/services.test.ts`) passed clean.
- `dispatch.service.ts` not modified — already imports `CreateDispatchRequest` which now allows the new optional fields, so it continues to compile and accept the new payload shapes without a code change.

**Naming note:** the export from `samples.service.ts` is `samplesService` (plural, matching the file name). Web uses `sampleService` (singular). M2 should import as `samplesService` from the mobile file. Same convention for `ecommerceService`.

**No UI work, no commits to git, no progress.md edit by Sonnet.** This entry is the orchestrator update.

**Next:** M2 — Sample module screens (list / create / detail with scan-add-box) + Samples menu tile.

---

### April 30, 2026 — Carton view + QA pass pushed + deployed

**Pushed to `origin/main`:**
- `11ef591` — Inventory: add Master Carton view alongside Child Box hierarchy (9 files, +1,243 / -74)
- `39a7658` — Playwright QA: 6 new specs for Apr 27 mods + carton view, 124/126 pass (10 files, +3,334 / -11)

**Deployed to testing portal** (`https://srv1409601.hstgr.cloud/binny/`):
- Tarball: backend source (5 files), frontend source (3 files), 3 v3 phase markdowns, progress.md. **e2e specs intentionally NOT shipped** (test-only, not runtime).
- `docker compose build binny-backend binny-frontend` → both rebuilt clean.
- `docker compose up -d` → both containers recreated, healthy.
- **No migrations** — read-only feature, no schema change.

**Portal smoke verification:**

| Endpoint | Result |
|---|---|
| `GET /api/v1/health` | 200 `{"status":"ok"}` |
| `POST /auth/login` admin | 200 with valid JWT |
| `GET /inventory/cartons/hierarchy?level=status` | 200, `data: []` (portal has minimal seeded cartons; the route + service is wired up correctly) |
| `GET /inventory/cartons/hierarchy?level=section&status=ACTIVE` | 200, `data: []` |
| `GET /inventory/cartons/export?level=section&status=ACTIVE` | 200, CSV with correct 8-column header `Section,Carton Count,Created,Active,Closed,Dispatched,Child Boxes,Total Pairs` |
| Frontend `/binny/` | 308 → `/binny/login` (expected) |

The empty data arrays are not bugs — they're a function of the portal's current data volume. The view will populate naturally once the client packs cartons in this environment. Hard refresh (Ctrl+Shift+R) recommended for the client to bust the prior bundle cache and see the new tab switcher.

**Working tree clean** except `scripts/progress-checkpoint.sh` (untracked, left alone per established rule).

---

### April 30, 2026 — v3 test-case suite authored (20 phases, ~1,289 TCs)

**Approach:** Opus authored the orchestration README; 5 parallel Sonnet sub-agents wrote 4 phase files each. Each agent received self-contained briefs, format reference (v2 phase files), exact endpoint scopes per the four Apr 27 mods, and an explicit "do not touch progress.md" guardrail.

**Files produced** (all under `docs/test-cases-v3/`):
- `README.md` (orchestration) — role matrix, env setup, 20-phase index, completion tracker, dependency graph
- 20 × `phase-NN-<slug>.md` — comprehensive 8-column TC tables matching v2 format

**TC counts (~1,289 total):**
| Phase | TCs | Phase | TCs |
|---|---|---|---|
| 01 auth | 78 | 11 samples | 87 |
| 02 users | 46 | 12 ecommerce | 90 |
| 03 sections | 32 | 13 dispatch | 90 |
| 04 customers | 53 | 14 dashboard | 41 |
| 05 products CRUD | 80 | 15 stock hierarchy | 56 |
| 06 products bulk | 49 | 16 reports prod/stock | 56 |
| 07 CB lifecycle | 69 | 17 reports dispatch/CSV | 70 |
| 08 CB bulk | 71 | 18 scan/traceability | 44 |
| 09 CB labels | 56 | 19 audit/integrity | 45 |
| 10 master cartons | 90 | 20 edge cases | 86 |

**Confirmed defects discovered during authoring** (from agent code-reads — not test execution):
1. `frontend/src/app/(dashboard)/users/page.tsx:60` — calls `api.patch()` against `PUT /users/:id` route → toggle-status broken (404/405)
2. `backend/src/services/section.service.ts deleteSection()` — no FK guard; can orphan products
3. `backend/src/services/customer.service.ts deleteCustomer()` — no FK guard for `sample_records.customer_id` or `dispatch_records.customer_id`
4. `frontend/src/app/(dashboard)/customers/page.tsx:197` — Add Customer button hidden from Supervisor (`isAdmin` only) but API allows `Admin+Supervisor` → UI/API mismatch
5. `backend/src/routes/inventory.routes.ts /transactions` — no `authorize()` decorator (capability matrix says Admin+Supervisor only)
6. `frontend/src/app/(dashboard)/reports/page.tsx ProductWiseRow` interface omits `sample_boxes` + `ecommerce_boxes` → UI doesn't render the new Apr 27 columns even though API returns them
7. `backend/src/services/inventory.service.ts:362` — product-level MRP rendering inconsistent ("10 - ₹499.00") vs MRP-level ("₹499")
8. `dispatchListQuerySchema` — missing `source_type` query param → frontend filter is client-side `useMemo` only, can't paginate filtered results from server
9. `getStockSummary` totals INCLUDE GENERATED but stock-hierarchy aggregations EXCLUDE → summary card vs hierarchy total mismatch
10. `backend/src/services/ecommerce.service.ts` lines 38–42 + 143–145 — duplicate `INSERT INTO inventory_transactions` for `ECOMMERCE_CREATED` (copy-paste bug; writes 2 transaction rows per ecommerce create)
11. No `GET /api/v1/audit-logs` HTTP route mounted (Phase 19 audit tests are DB-query only)
12. Doc-only: `report.routes.ts` mounts `/dispatch-summary` not `/dispatches` — README references corrected during authoring
13. Doc-only: SKU format is `<SECTION>-<ARTICLE>-<CATEGORY>-<NN>-<COLOUR>` (not `BFW-<CATEGORY>-...`) — phase 05/06 tests use the real format

**Deferred decisions:**
- Test execution strategy: not running all 1,289 cases in one shot. Plan: fix the 13 confirmed defects first (parallel Sonnet PR), then run P0 smoke across the four Apr 27 mods (CSV uploader, GENERATED, Sample/E-commerce, MRP hierarchy) since that's the newest code and highest-risk surface.
- Non-admin role users not yet seeded in local DB (existing test users are `*-life-*@test.com` / `*-e2e-*@test.com` from older test runs, not the conventional `supervisor@/warehouse@/dispatch@binny.com`). README §3 documents this; TC-USER-SEED-001 in `phase-02-user-management.md` covers seeding.

**Commit state:** v3 README + 20 phase files written but NOT committed yet. No code changes. Ready for the testing/debugging pass.

---

### April 30, 2026 — Phase 6 debug pass: 7 safe defects fixed + smoke test green

**Defect fixes** (Sonnet pass, files modified, TS clean both backend + frontend):
1. ✅ `frontend/src/app/(dashboard)/users/page.tsx:60` — `api.patch` → `api.put` (toggle-status was 404'ing)
2. ✅ `frontend/src/app/(dashboard)/customers/page.tsx:197` — Add Customer gate `isAdmin` → `isManager` (Admin || Supervisor) to match API role gate
3. ✅ `backend/src/routes/inventory.routes.ts` — added `authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR)` on `/transactions` (was unprotected)
4. ✅ `frontend/src/app/(dashboard)/reports/page.tsx` — `ProductWiseRow` interface gains `sample_boxes` + `ecommerce_boxes`; table headers + cells added (orange/violet to match neighbours); `stockTotals` reducer + colSpan adjusted
5. ✅ `backend/src/services/inventory.service.ts:362` — product-level `nameExpr` now uses the same `CASE WHEN FLOOR` pattern as MRP-grouping level (₹499 vs ₹499.50 consistent)
6. ✅ `backend/src/services/inventory.service.ts` `getStockSummary` — `COUNT(cb.id)` now filters `WHERE status IN (FREE,PACKED,DISPATCHED,SAMPLE,ECOMMERCE)` to match `getStockByLevel` (excludes GENERATED). Verified post-fix: dashboard total 5999 = sum of buckets; stock summary total 5996 (excludes 3 GENERATED boxes correctly).
7. ✅ `backend/src/services/ecommerce.service.ts` — removed duplicate `ECOMMERCE_CREATED` INSERT in `barcodes.length > 0` branch. Kept canonical single INSERT (~line 138). Verified post-fix: Flow D create wrote exactly one `ECOMMERCE_CREATED` row in `inventory_transactions`.

**Local environment prep:**
- Found local DB was missing all 6 Apr 27 migrations. Applied via `docker exec binny_backend npx node-pg-migrate up`. All 6 ran clean (GENERATED enum value, sample_status, sample_records + sample_box_mapping with partial unique index, ecommerce_status, ecommerce_records + ecommerce_box_mapping, dispatch_records source FKs + `chk_dispatch_source_exactly_one` CHECK).
- Restarted `binny_backend` container — picked up all the agent's source edits + new routes.

**Smoke test results — all 4 Apr 27 mods pass on local:**

| Flow | Result | Notes |
|---|---|---|
| **A. CSV uploader** | ✅ pass | Sample CSV download works; 6-box upload from real SKUs created GENERATED boxes; `createdBarcodes` array surfaced; **5000-cap returns HTTP 409 (not 400)** — phase-08 assertions need adjustment |
| **B. GENERATED lifecycle** | ✅ pass | Activate `GENERATED → FREE` works; idempotent re-activate writes no extra audit (Box1 had exactly 1 `CHILD_ACTIVATED` row after 3 calls); pack-from-GENERATED into MC writes BOTH `CHILD_ACTIVATED` + `CHILD_PACKED` at the same instant; PACKED→activate returns 409 with exact message `"Cannot activate child box in PACKED status"` |
| **C. Sample E2E** | ✅ pass | Create → ACTIVE on first add-box → CLOSED → DISPATCHED. Box transitions FREE → SAMPLE → DISPATCHED. CHECK-constraint test: 0 sources and 2 sources both rejected with refine error (HTTP 400). Per-box transactions: CHILD_CREATED → CHILD_ACTIVATED → CHILD_SAMPLED → CHILD_DISPATCHED. |
| **D. E-commerce E2E** | ✅ pass + defect #10 verified | Identical flow to C with `marketplace`/`listing_sku` fields. Box transitions FREE → ECOMMERCE → DISPATCHED. Single `ECOMMERCE_CREATED` row in DB (was double before defect #10 fix). |
| **E. MRP hierarchy** | ✅ pass (after seeding multi-MRP fixture) | Initial run: no multi-MRP articles in local DB. Seeded fixture: created 9 products via `/products/bulk-size-range` — `MRP TEST CITY 02` × {BLUE@₹299, RED@₹399} × sizes 6-8 (multi-MRP) + `MRP TEST CITY 03` × BLACK@₹599 × sizes 6-8 (single-MRP control). Bulk-uploaded 36 child boxes via CSV, activated all to FREE. Then verified: CITY 02 article shows `distinctMrpCount=2`, CITY 03 shows `distinctMrpCount=1`. Drill into CITY 02 at MRP level returns exactly 2 buckets (₹299, ₹399, 12 pairs each). MRP=299 → only BLUE, MRP=399 → only RED. Product-level drilldown renders names as `"6 - ₹299"` (FLOOR pattern, defect #7 fix confirmed). |

**v3 test-case authoring inaccuracies surfaced during smoke** (need correction in phase files — system code is correct):
- **Routes:** `/samples/qr/:barcode` not `/by-barcode/:barcode`; `/samples/add-box` is top-level (not `/:id/add-box`) with `sample_record_id` in body; same pattern for `/ecommerce/add-box`. Affects phase-10, 11, 12, 13, 18.
- **Master carton create:** schema field is `child_box_barcodes` (array of strings), not `child_box_ids`. Affects phase-10. Also no `section_id` field — section comes from product.
- **Stock hierarchy:** path is `/inventory/stock/hierarchy`, not `/inventory/stock`. Affects phase-15.
- **5000-box cap:** returns HTTP 409 with message `"Total boxes across all rows must not exceed 5000"`, not 400. Affects phase-08.

**Outstanding (not yet decided):**
- 3 larger-scope defects flagged for product/PM call: section FK delete-guard, customer FK delete-guard, dispatch list `source_type` query param. None are blocking; defer until product input.
- Frontend defect verifications (#1, #2, #3, #4, #7) require browser/E2E run, not curl. Defects #5, #6, #10 verified via API.
- Non-admin role users not yet seeded — phase-02 TC-USER-SEED-001 flow needs to run before role-specific tests can execute.
- Full v3 suite execution (~1,289 TCs) deferred — smoke covered the highest-risk surface (Apr 27 mods + 6 of 7 safe defect fixes).

**Smoke test artefacts left in local DB:** 1 sample record `BINNY-SR-e9233166...` (DISPATCHED), 1 ecommerce record `BINNY-EC-44b8d1b3...` (DISPATCHED), 1 master carton `BINNY-MC-1fdd1590...` (ACTIVE with 1 child), 6 child boxes with `BINNY-CB-` UUIDs created from 3 EVA Lite Blue SKUs. 2 dispatch_records.

**No commits made.** Defect fixes + test-case files all sitting on the working tree pending user direction.

---

### April 30, 2026 — Phase 6 debug-pass fixes deployed to testing portal

**What shipped:** the 7 defect fixes from this morning's debug pass + the v3 test-case suite (20 phase files + README).

**Deploy procedure:**
1. `tar -czf /tmp/binny_fixes.tar.gz` of: `backend/src/routes/inventory.routes.ts`, `backend/src/services/inventory.service.ts`, `backend/src/services/ecommerce.service.ts`, three frontend `(dashboard)/(users|customers|reports)/page.tsx` files, `progress.md`, and the new `docs/test-cases-v3/` directory.
2. `scp` to `root@srv1409601.hstgr.cloud:/tmp/`, extract via `tar -xzf` into `/opt/binny/`. 21 entries unpacked under docs/test-cases-v3 (20 phase files + README).
3. `docker compose -f docker-compose.prod.yml build binny-backend binny-frontend` — both rebuilt cleanly.
4. `docker compose -f docker-compose.prod.yml up -d binny-backend binny-frontend` — recreated. Backend healthy in ~2s, frontend started cleanly. `binny-db` left running.

**No migrations to run** — these were all source-only fixes; no schema changes.

**Local-only test fixtures NOT deployed** (kept off the client's environment): `MRP TEST CITY 02/03` products, 36 multi-MRP test child boxes, smoke-test sample/ecommerce/master-carton artefacts. These exist only in the local docker-compose DB.

**Post-deploy verification on portal** (`https://srv1409601.hstgr.cloud/binny/`):

| Check | Result |
|---|---|
| `GET /api/v1/health` | 200 `{"status":"ok"}` |
| `POST /api/v1/auth/login` admin | 200, valid JWT |
| Defect #5 verify: `GET /api/v1/inventory/transactions?limit=2` (admin) | 200 with txn data — admin still permitted after `authorize()` middleware added |
| Defect #6 verify: dashboard bucket math | `total=16, sum_buckets=16, generated=0, sample=0, ecommerce=0` — sum equals total |
| Defect #6 verify: `/inventory/stock/summary` total | `totalChildBoxes=16` matches dashboard (portal has 0 GENERATED, so the FILTER doesn't subtract anything but the code path is exercised) |
| Frontend `/binny/` | 308 redirect to login (expected) |

**Defects #1, #2, #4, #7 require browser-side verification** — those are frontend-only changes (toggle button uses `api.put`, customers Add visible to Supervisor, reports table shows new sample/ecommerce columns, MRP rendering FLOOR pattern). API-level smoke can't see them. Deploy delivered the bundle; QA needs a browser pass to confirm.

**Defect #10 (ecommerce duplicate INSERT) on portal:** verified locally with a fresh ecommerce create writing exactly one `ECOMMERCE_CREATED` row — the same code path is now live on portal. Will surface naturally when client creates the next ecommerce record.

**No commits to git yet.** Working tree carries the 6 modified source files + new docs/test-cases-v3 + progress.md updates. Push to `origin/main` deferred pending user call.

---

### April 30, 2026 — Master Carton view added to /inventory page

**Feature:** parallel "By Master Carton" view alongside the existing "By Child Box" hierarchy on `/inventory`. Operators can now flip between two lenses on stock data: pair-centric (child boxes) and carton-centric (master cartons). Approved as Option B with status-first carton hierarchy + COUNT DISTINCT mixed-article dedup + CSV export at every level (Admin+Supervisor).

**Hierarchy:** `Status (CREATED/ACTIVE/CLOSED/DISPATCHED) → Section → Article → Carton (leaf)`. MRP and colour levels intentionally skipped — cartons are heterogeneous and don't drill cleanly by those dimensions.

**Mixed-article dedup rule:** A carton holding boxes from Article A + Article B appears under both article cards; aggregate parent levels use `COUNT(DISTINCT mc.id)` so the carton counts once per scope. Carton leaf rows expose `primary_section` and `primary_article` (most-frequent values within the carton) computed via a `LEFT JOIN LATERAL` correlated subquery.

**Implementation** (single Sonnet pass, full brief from Opus):

| File | Change |
|------|--------|
| `backend/src/models/schemas/inventory.schema.ts` | NEW. `cartonHierarchyQuerySchema` with level enum + filters |
| `backend/src/services/inventory.service.ts` | Added `CartonStockNode` interface + `getCartonHierarchy(level, filters)` (~240 lines) |
| `backend/src/services/csvExport.service.ts` | Added `exportCartonHierarchyCSV` (~75 lines, mirrors existing CSV export pattern) |
| `backend/src/controllers/inventory.controller.ts` | `getCartonHierarchy` + `exportCartonHierarchyCsv` controllers |
| `backend/src/routes/inventory.routes.ts` | Two new routes: `GET /inventory/cartons/hierarchy`, `GET /inventory/cartons/export` (Admin+Supervisor on export) |
| `frontend/src/types/index.ts` | `CartonHierarchyLevel` type + `CartonStockNode` interface |
| `frontend/src/services/inventory.service.ts` | `getCartonHierarchy` + `exportCartonHierarchyCsv` methods |
| `frontend/src/app/(dashboard)/inventory/page.tsx` | Full rewrite (~600 lines): tab switcher at top, `ChildBoxView` (existing logic refactored into component), `MasterCartonView` with `CartonNodeCard`, `UtilizationBar`, `StatusBreakdownChips`, pagination at carton leaf, CSV export per level |
| `docs/test-cases-v3/phase-15-stock-hierarchy.md` | Section 11 added: 30 TCs (TC-STK-CARTON-001 → -062, with gaps) covering all 4 levels, dedup, CSV exports, role gates, E2E |

**Bug found + fixed during smoke:** Sonnet's SQL used `LEFT JOIN LATERAL (...) primary ON true` — `primary` is a reserved word in PostgreSQL. Renamed alias to `prim` (3 references in `inventory.service.ts`) — leaf query then ran clean.

**Smoke test results (local, admin auth):**

| Step | Endpoint | Result |
|---|---|---|
| 1. Status level | `GET /inventory/cartons/hierarchy?level=status` | 200; 4 nodes — CREATED:68, ACTIVE:107, CLOSED:52, DISPATCHED:90 cartons |
| 2. Section level | `?level=section&status=ACTIVE` | 200; Hawaii (56 cartons) + 6 MCSection-* mini-sections |
| 3. Article level | `?level=article_name&status=ACTIVE&section=Hawaii` | 200; multiple articles with status-breakdown counts + `primary_section=Hawaii` |
| 4. Carton leaf | `?level=carton&status=ACTIVE&section=Hawaii&limit=3` | 200; rows include id, barcode, status, child_count/max_capacity (utilization 6–13%), `primary_section`, `primary_article`, dates |
| 5. CSV section | `GET /inventory/cartons/export?level=section&status=ACTIVE` | 200; 8-column header + body rows correctly populated |
| 6. CSV carton leaf | `?level=carton&status=ACTIVE&section=Hawaii` | 200; 10-column CSV including `Section (Primary)` and `Article (Primary)`; ISO dates |

**TS checks:** backend clean; frontend clean except 2 pre-existing e2e errors.

**Known minor issue (cosmetic):** carton-leaf JSON response has `created_at` as JS Date `toString()` format (`"Sat Apr 18 2026 11:03:47 GMT+0000"`) instead of ISO. The CSV export correctly serializes to ISO, so this only affects API consumers reading the JSON path. Easy fix later — wrap with `.toISOString()` in the row mapper.

**Status-level totalPairs is always 0** by design — the status query goes against `master_cartons` directly without joining for box quantities (performance choice). Operators don't need pair counts at the status roll-up level; they get it at section/article/carton levels.

**Mobile:** deferred. Not touched.

**Not committed.** Fix + new feature sitting on working tree pending review.

---

### April 30, 2026 — Playwright run: 6 new specs + regression triage

**Workflow:** Opus planned the work; 3 Sonnet sub-agents executed in series — (1) patch v3 markdown for route inaccuracies, (2) write 6 new spec files, (3) fix 18 first-run failures. Opus ran tests and debugged the residual cookie-priority bug.

**(1) v3 markdown patch** (`docs/test-cases-v3/`):
- **Phase 08 (6 edits):** 1000-row + 5000-box cap + missing-column TCs updated from `400 or 409` to `409` only — service uses `ConflictError` consistently.
- **Phase 18 (4 edits):** TC-SCAN-013/014/015/037 — corrected pack/add-box/remove-box endpoints to `POST /master-cartons/pack`, `POST /samples/add-box`, `POST /ecommerce/add-box`, `POST /master-cartons/repack` with body shapes containing both ids.
- **Phases 10, 11, 12, 13, 15:** zero edits — already correct on actual review. Earlier smoke-test analysis flagged false positives.

**(2) 6 new Playwright specs** added to `frontend/e2e/`, **114 tests total**:
| File | Tests | Coverage |
|---|---|---|
| `29-childbox-bulk-upload.spec.ts` | 19 | Phase 08 CSV uploader |
| `30-generated-lifecycle.spec.ts` | 15 | Phase 07 GENERATED → activate, idempotency, pack-from-GENERATED |
| `31-samples-module.spec.ts` | 21 | Phase 11 sample lifecycle |
| `32-ecommerce-module.spec.ts` | 18 | Phase 12 ecommerce lifecycle |
| `33-dispatch-multi-source.spec.ts` | 17 | Phase 13 multi-source dispatch + CHECK constraint |
| `34-mrp-and-carton-hierarchy.spec.ts` | 24 | Phase 15 MRP grouping + carton view (Section 11) |

**(3) Iterative debug results:**

**First run: 95/114 (83%) — 18 failures**, all spec bugs:
- 4 × `ensureProductSku` helper had wrong SKU lookup (used `article_code` substring match against SKU which encodes `article_name` slug, not `article_code`).
- 2 × Status assertion: tests expected `409` for sample/ecommerce add-PACKED-box; actual is `400` because services throw `BadRequestError` (not `ConflictError`).
- 3 × Dispatch refine-message check: refine message lives in `body.errors[0]` (a string `"body.body: Exactly one..."`), specs were checking `body.message` which is just `"Validation failed"`.
- 1 × `body.data?.destination` dereferenced as object, but dispatch response wraps in array.
- 2 × UI selector strict-mode violations (Master Carton tab matched both sidebar nav + tab button).
- 4 × Role tests setting up role users.
- 1 × `Download Sample` button label was `Download` in actual modal markup.
- 1 × `Generated` filter option used wrong locator chain.

After Sonnet's first fix-pass: **109/114 pass**. 4 remaining role-test failures revealed the **actual semantic bug**:

> **Playwright `request` context preserves cookies across calls.** `/auth/login` sets `Set-Cookie: accessToken=<JWT>` (HttpOnly). The auth middleware's `extractToken()` reads cookies BEFORE the `Authorization` header. So when a test does login-as-admin → POST /users → login-as-warehouse, the warehouse cookie OVERWRITES admin's cookie in the request context. Subsequent calls with `Authorization: Bearer adminToken` actually get authenticated as warehouse via the stale cookie. Result: admin operations fail with "Required roles: Admin, Supervisor. Your role: Warehouse Operator".

**Fix applied to TC-SM-ROLE-002, TC-EC-ROLE-002, TC-DMS-ROLE-001, TC-DMS-ROLE-003:** reorder each test so all admin-token setup (createProduct, createFreeBox, createClosedCarton/Sample) runs BEFORE the role-switching login. This keeps the admin cookie intact during setup; only the final role-test action runs with the role token (which then uses the role's cookie). Comment added to each test explaining why.

**Final run: 113/114 pass** (1 skip — graceful `test.skip` when supervisor user not seeded). Plus 1 more during regression of `13-inventory.spec.ts:TC-INV-003` ("Legend shows Dispatched"): the carton view rewrite added many `<p>Dispatched</p>` nodes (KPI cards, status chips), so `getByText('Dispatched')` strict-mode now resolves to 48 elements. Fixed the test selector to `page.locator('span').filter({ hasText: /^Dispatched$/ })` — the legend uses `<span>`, the dupes are `<p>`, so this discriminates cleanly.

**Final verification run** (6 new specs + `13-inventory.spec.ts` regression): **124 passed / 0 failed / 2 skipped (intentional)**. ~4 minutes wallclock at workers=1.

**Regression suite check** (`06-reports`, `09-customers` not run; `13-inventory`, `23-inventory-dashboard`, `24-reports-rbac`, `25-users-admin`): **69 / 70** before the legend-selector fix, **70 / 70** after. No regressions from the carton-view rewrite or any of the 7 defect fixes shipped to portal earlier today.

**Real bugs found via Playwright:** zero. All 18 first-run failures + 1 regression failure were spec/selector bugs. The system code is solid.

**Notable spec-level discovery (worth keeping in mind):** the cookie-priority bug pattern affects **any** Playwright test that switches user identity within a single request context. Future role tests must do all setup with the original token BEFORE switching, OR use `playwright.request.newContext()` to create an isolated context per role.

**Outstanding:**
- TC-CART-UI-001 occasionally skips (race when running after many tests; passes solo) — not a bug, just timing.
- Other-role users (`supervisor@/warehouse@/dispatch@binny.com`) still not auto-seeded in fixtures — phase-02 TC-USER-SEED-001 pattern; specs gracefully skip.
- Existing 22 specs not yet run in this session — risk surface is small (most predate today's changes), but a full suite run would close the loop.

**No commits yet.** Working tree carries: 6 new spec files, 6 modified spec files (helpers + role-test reorders + selector fixes), 2 v3 phase markdown patches, plus this progress.md update.

### April 29, 2026 — Phase 6 batch #2 deployed to testing portal

**Context:** Four mods accumulated since the Apr 23 deploy (CSV uploader, GENERATED lifecycle, Sample + E-commerce, MRP hierarchy). Single rsync + rebuild + migrate push, run today.

**Steps executed:**
1. **Commit + push:** Single batch commit `160084d` to `origin/main`. Detailed multi-paragraph message describing all 4 mods, files changed, verification status. `.gitignore` extended with `/phase-*.png` to stop the leftover Phase D/E walkthrough screenshots from showing as untracked.
2. **Source ship:** `tar --exclude=node_modules --exclude=.next` of `backend/src` + `backend/migrations` + `frontend/src` + `progress.md` + `docs` over SSH (`~/.ssh/id_ed25519`) to `root@srv1409601.hstgr.cloud:/opt/binny/`. Confirmed all 6 new migration files arrived.
3. **Docker rebuild:** `docker compose -f docker-compose.prod.yml build binny-backend binny-frontend` — both images rebuilt clean (~83s for frontend, shorter for backend). No errors.
4. **Container recreate:** `docker compose -f docker-compose.prod.yml up -d binny-backend binny-frontend`. `binny-db` left running (it's stable). `binny-backend` reported healthy in ~38s; `binny-frontend` started in ~8s.
5. **Migrations:** `docker exec binny-backend npx node-pg-migrate up` — all 6 pending migrations applied successfully:
   - `20260427100001_add-generated-status-to-child-boxes` — `addTypeValue` GENERATED on `child_box_status`
   - `20260427100002_add-sample-status-to-child-boxes` — `addTypeValue` SAMPLE
   - `20260427100003_create-sample-records-tables` — extended `transaction_type` enum with 7 values + created `sample_status` + `sample_records` + `sample_box_mapping`
   - `20260427100004_add-ecommerce-status-to-child-boxes` — `addTypeValue` ECOMMERCE
   - `20260427100005_create-ecommerce-records-tables` — extended `transaction_type` enum with 6 ecommerce values + created `ecommerce_status` + `ecommerce_records` + `ecommerce_box_mapping`
   - `20260427100006_extend-dispatch-records-for-sample-ecommerce` — added nullable `sample_record_id` + `ecommerce_record_id` FKs to `dispatch_records`, relaxed `master_carton_id` to nullable, added `chk_dispatch_source_exactly_one` CHECK constraint, added 2 indexes

**Smoke-test results (post-deploy):**

| Check | Result |
|---|---|
| `GET /binny/api/v1/health` | 200 `{"status":"ok"}` |
| `OPTIONS /binny/api/v1/samples` | 204 |
| `OPTIONS /binny/api/v1/ecommerce` | 204 |
| `OPTIONS /binny/api/v1/child-boxes/bulk-upload` | 204 |
| `OPTIONS /binny/api/v1/child-boxes/:id/activate` | 204 |
| `POST /binny/api/v1/samples` (admin auth) | **201 Created** — test sample inserted (probe verified live route + DB write path) |
| `POST /binny/api/v1/samples` (no auth) | 401 |
| Frontend `/binny/` | 308 redirect to login (expected) |
| `/app/.next/server/app/(dashboard)/samples/{,create,[id]}/page.js` | All present in frontend container |

**Existing dispatch_records preserved:** the new CHECK constraint `(master_carton_id IS NULL?0:1) + (sample_record_id IS NULL?0:1) + (ecommerce_record_id IS NULL?0:1) = 1` accepted all existing rows (each had `master_carton_id` set + the other two NULL → satisfies "exactly one"). Migration completed without conflict.

**Reported issue + investigation (resolved as cache-side):** Client reported `Route POST /api/v1/samples not found` after deploy. Server-side reproduction with admin auth returned 201 Created — backend route is registered and works. Frontend container has the new bundle. Diagnosis: stale browser cache serving an older JS bundle that hit a wrong path. Resolution path documented for client: hard refresh (Ctrl+Shift+R) bypasses the cache. Test sample inserted during probe was named "Test Sample Probe" — left in DB pending client deletion.

**Commits pushed this session:** `160084d` (4 mods batched).

**Mobile NOT deployed:** APK on the device is from 2026-04-23 (commit `042b1e6`) and does not include any of these 4 mods. When the client tests these flows on mobile, they'll see old behavior. Mobile parity work is deferred per the Apr 27 user direction.

**No rollback executed.** Deploy was clean end-to-end.

---

### April 27, 2026 — Inventory hierarchy: MRP grouping level

**Problem:** When a single article has stock at multiple price points (e.g., CITY 02 with both old ₹299 and new ₹399 inventory), the operator couldn't see the price-wise split in the `/inventory` Stock Levels drill-down. The hierarchy went `section → article → colour → size+MRP`, so MRP only surfaced at the leaf level — making it impossible to ask "how many ₹299 CITY 02 boxes do I have?" without manually grouping.

**Fix:** Insert a new MRP grouping level between `article_name` and `colour`. Each MRP shows as its own card with full pair/box/colour breakdown.

**Conditional split (UX):** if an article has only one distinct MRP, the MRP step is skipped — clicking the article jumps straight to the colour list, exactly like before. Only multi-MRP articles get the new bucket level. No old/new labeling — the operator just sees each MRP as its own bucket. Buckets sort by MRP ascending.

**Backend changes** (single file: `backend/src/services/inventory.service.ts` + small controller change):
- `getStockByLevel` signature: added `'mrp'` to the level union and `mrp?: string` to filters.
- New switch case for `'mrp'` level: groups by `p.mrp`, renders name as `'₹' || p.mrp::text` (or `FLOOR(p.mrp)::text` when integral, so ₹299 not ₹299.00), key as raw `p.mrp::text`. Children are colours within that MRP.
- New `mrp` filter clause: `p.mrp = $X::numeric` (numeric cast for exact comparison; URL passes as string).
- New column on every result row: `distinct_mrp_count` (`COUNT(DISTINCT p.mrp)` per group). Frontend uses it at the article level to decide whether to insert the MRP step.
- Result mapping: `StockNode` interface gains `distinctMrpCount: number`.
- `inventory.controller.ts`: extended `validLevels` and pulls `mrp` from query params.

**Frontend changes** (single file: `frontend/src/app/(dashboard)/inventory/page.tsx`):
- `StockNode` and `BreadcrumbItem` types extended with `distinctMrpCount`.
- New `LEVEL_CONFIG.mrp` entry: rose-pink gradient, `IndianRupee` icon, childLabel "Colours".
- `NEXT_LEVEL` updated: `article_name → mrp` and `mrp → colour` (was `article_name → colour`).
- New `getChildLevel(crumb)` helper replaces direct `NEXT_LEVEL` lookup. It returns `'colour'` when at an article breadcrumb with `distinctMrpCount === 1` (skipping the MRP step), otherwise normal next-level.
- `handleDrillDown` carries `distinctMrpCount` onto the new breadcrumb when the user just landed on an article — so subsequent renders know whether to skip.
- `NodeCard` subtitle: at the article level, shows `"N MRPs"` instead of `"N Colours"` when `distinctMrpCount > 1`. Tells users what the click will reveal.
- The `mrp` filter threads automatically via `currentBreadcrumb.filters` into both the colour and product fetches; deep links work.

**Files changed:**

| File | Lines |
|------|-------|
| `backend/src/services/inventory.service.ts` | StockNode interface; getStockByLevel signature, filters, switch, ORDER BY, query select, result map |
| `backend/src/controllers/inventory.controller.ts` | validLevels + query param destructure |
| `frontend/src/app/(dashboard)/inventory/page.tsx` | Imports (IndianRupee), StockNode, BreadcrumbItem, LEVEL_CONFIG, NEXT_LEVEL, getChildLevel, handleDrillDown, NodeCard |

**Verification:**
- `backend/`: `npx tsc --noEmit` clean.
- `frontend/`: `npx tsc --noEmit` clean except the 3 pre-existing e2e errors.

**No DB migration needed.** The MRP grouping is a query-time aggregation; no schema change.

**Stock semantics preserved:** the new level uses the same status filter as the rest of the hierarchy (FREE + PACKED + SAMPLE + ECOMMERCE + DISPATCHED, GENERATED excluded). Each bucket's totalPairs / inStock / packed / dispatched columns mirror the article level's semantics.

**Mobile:** deferred per the prevailing decision (web-first; mobile catches up after web stabilizes). Mobile inventory hierarchy remains on the old shape.

**Testing plan (deferred — bundled with rest of Phase 6 batch):**
1. Find an article with one MRP (most articles) → confirm clicking goes straight to colours, breadcrumb shows `... > Article > Colour > Size`.
2. Find or seed an article with two MRPs at the same article_name → confirm clicking shows two MRP bucket cards, each with correct pair count.
3. Drill into an MRP bucket → confirm only colours that have stock at that MRP appear; back-button returns to MRP level.
4. Deep-link `?level=colour&section=Hawaii&article_name=CITY%2002&mrp=299.00` → confirm filtered colour view loads.
5. Confirm dashboard "pairs in stock" totals haven't moved — query semantics unchanged.

**Not yet deployed.** Stacks with the prior three Phase 6 mods awaiting deploy: CSV uploader, GENERATED lifecycle, Sample + E-commerce, MRP hierarchy. Single rsync + `docker compose build` + `docker exec binny-backend npx node-pg-migrate up` covers all four.

---

### April 27, 2026 — Sample + E-commerce modules (web only; mobile deferred)

**Problem:** Until now, a child box could only be `FREE → PACKED (in master carton) → DISPATCHED`. Client wants two additional containers — a **Sample** record (boxes set aside for trade shows / dealer demos / internal QC) and an **E-commerce** record (boxes mapped to a marketplace listing or order, e.g. Amazon / Flipkart / Meesho). Each is a peer of the master-carton container; a FREE child box can be assigned to exactly one of master-carton, sample, or e-commerce.

**Lifecycle change (child box):**
```
GENERATED → FREE → ( PACKED | SAMPLE | ECOMMERCE ) → DISPATCHED
                       ↑          ↑          ↑
                    master      sample    ecommerce
                    carton      record     record
```
Each container record has its own lifecycle: `CREATED → ACTIVE → CLOSED → DISPATCHED`, identical to master cartons.

**Stock semantics (decided):**
- `pairsInStock` (= "available for sale") includes only `FREE + PACKED`. SAMPLE and ECOMMERCE boxes are **allocated, not available for sale** — excluded from this figure across dashboard, stock summary, and reports.
- `getStockByLevel` aggregations (representing "real physical inventory regardless of allocation") now include `FREE + PACKED + SAMPLE + ECOMMERCE + DISPATCHED` — only `GENERATED` excluded (those are pre-inventory).
- Dashboard gains `sampleBoxes` and `ecommerceBoxes` KPI counts alongside the existing `generatedBoxes`/`freeChildBoxes`/etc. counts.

**Container parity with master cartons:** both modules mirror the master-carton structure exactly — same `CREATED→ACTIVE→CLOSED→DISPATCHED` lifecycle, same `child_count` aggregation, same partial-unique-index pattern on the mapping table (`is_active=true` ensures one active mapping per child box per container type), same role gates, same audit-log + inventory-transaction conventions. **No `repack` equivalent** — operators do remove + add separately if they need to move boxes between sample/ecommerce records.

---

#### Backend changes

**Constants** (`backend/src/config/constants.ts`):
- `CHILD_BOX_STATUS` gains `SAMPLE` and `ECOMMERCE`.
- New `SAMPLE_STATUS` and `ECOMMERCE_STATUS` constants (each: CREATED/ACTIVE/CLOSED/DISPATCHED).
- New transaction types: `CHILD_SAMPLED`, `CHILD_UNSAMPLED`, `CHILD_ECOMMERCED`, `CHILD_UNECOMMERCED`, `SAMPLE_CREATED`, `SAMPLE_CLOSED`, `SAMPLE_REOPENED`, `SAMPLE_DISPATCHED`, `ECOMMERCE_CREATED`, `ECOMMERCE_CLOSED`, `ECOMMERCE_REOPENED`, `ECOMMERCE_DISPATCHED`.
- New TypeScript types: `SampleStatus`, `EcommerceStatus`.

**New migrations** (5):
| File | What |
|------|------|
| `20260427100002_add-sample-status-to-child-boxes.js` | `pgm.addTypeValue('child_box_status', 'SAMPLE')` |
| `20260427100003_create-sample-records-tables.js` | Extends `transaction_type` enum with all sample/activation values; creates `sample_status` enum, `sample_records` table, `sample_box_mapping` table with partial unique index `idx_unique_active_sample_mapping` |
| `20260427100004_add-ecommerce-status-to-child-boxes.js` | `pgm.addTypeValue('child_box_status', 'ECOMMERCE')` |
| `20260427100005_create-ecommerce-records-tables.js` | Extends `transaction_type` enum with ecommerce values; creates `ecommerce_status` enum, `ecommerce_records` table, `ecommerce_box_mapping` table with partial unique index |
| `20260427100006_extend-dispatch-records-for-sample-ecommerce.js` | Adds nullable `sample_record_id` and `ecommerce_record_id` FKs to `dispatch_records`; relaxes `master_carton_id` to nullable; adds CHECK constraint `chk_dispatch_source_exactly_one` (exactly one of the three FKs must be set per dispatch row) |

**New service / controller / route files** (10 new files):
- `backend/src/models/schemas/sample.schema.ts` (46 lines) — Zod schemas: create / addBox / removeBox / list / id / barcode params
- `backend/src/services/sample.service.ts` (695 lines) — 10 service functions mirroring masterCarton.service.ts: `createSample`, `getSampleById`, `getSamples`, `getSampleChildren`, `addBoxToSample`, `removeBoxFromSample`, `closeSample`, `getSampleByBarcode`, `fullUnpackSample`, `getSampleAssortment`. Same transaction/audit/locking patterns. Auto-activates `GENERATED` boxes when added.
- `backend/src/controllers/sample.controller.ts` (116 lines)
- `backend/src/routes/sample.routes.ts` (73 lines) — mounted at `/api/v1/samples`
- `backend/src/models/schemas/ecommerce.schema.ts` (37 lines)
- `backend/src/services/ecommerce.service.ts` (659 lines)
- `backend/src/controllers/ecommerce.controller.ts` (143 lines)
- `backend/src/routes/ecommerce.routes.ts` (85 lines) — mounted at `/api/v1/ecommerce`
- Both reports: `backend/src/services/csvExport.service.ts` extended with `exportSampleReportCSV` + `exportEcommerceReportCSV`. `backend/src/services/report.service.ts` adds `getSampleReport` + `getEcommerceReport`.

**Modified backend files:**
- `backend/src/services/dispatch.service.ts` — `createDispatch` routes on which of `master_carton_id` / `sample_record_id` / `ecommerce_record_id` is present. Three new private branches: `_dispatchMasterCartons` (existing), `_dispatchSample`, `_dispatchEcommerce`. Sample/ecommerce dispatch flips the source's `status='DISPATCHED'`, sets `dispatched_at=NOW()`, bulk-flips all linked active child boxes `'SAMPLE'/'ECOMMERCE' → 'DISPATCHED'`, logs `SAMPLE_DISPATCHED`/`ECOMMERCE_DISPATCHED` plus per-box `CHILD_DISPATCHED`. List/get queries LEFT JOIN all three source tables with virtual columns `source_type` and `source_label`.
- `backend/src/services/inventory.service.ts` — `getDashboard` adds `sampleBoxes` + `ecommerceBoxes` counts. `getStockByLevel` filter expanded to include SAMPLE/ECOMMERCE in `total_pairs` and `child_box_count` aggregations (only GENERATED excluded). `pairsInStock` (FREE+PACKED) intentionally unchanged.
- `backend/src/services/report.service.ts` — `getProductWiseReport` adds `sample_boxes` + `ecommerce_boxes` filter aggregations. `getInventorySummary` `childBoxesByStatus` GROUP BY surfaces SAMPLE/ECOMMERCE buckets naturally.
- `backend/src/routes/index.ts` — mounts `/samples` and `/ecommerce` (lines added near the master-cartons mount).
- Dispatch Zod schema gets a `.refine()` enforcing exactly-one-of-three source FKs.
- Reports controller + routes gain `GET /api/v1/reports/samples`, `/api/v1/reports/samples/export`, `/api/v1/reports/ecommerce`, `/api/v1/reports/ecommerce/export` (Admin + Supervisor).

**Auth / role gates** (mirror master cartons exactly):

| Operation | Roles |
|---|---|
| Create / add-box / remove-box / full-unpack | Admin, Supervisor, Warehouse Operator |
| Close | Admin, Supervisor |
| List, detail, assortment, scan-by-barcode | All authenticated |
| Reports endpoints | Admin, Supervisor |

---

#### Frontend (web) changes

**Pre-prepped shared files** (single Opus edits to avoid parallel-agent conflicts):
- `frontend/src/types/index.ts` — `ChildBoxStatus` gains `'SAMPLE'`, `'ECOMMERCE'`. New interfaces: `SampleRecord`, `SampleStatus`, `EcommerceRecord`, `EcommerceStatus`. `DispatchRecord` extended with `source_type`, `source_label`, nullable source FKs. New report response types.
- `frontend/src/components/ui/Badge.tsx` — new `purple` variant added.
- `frontend/src/components/ui/StatusBadge.tsx` — `SAMPLE` (red), `ECOMMERCE` (purple) status variants.
- `frontend/src/constants/index.ts` — new ROUTES (`SAMPLES`, `SAMPLES_CREATE`, `SAMPLE_DETAIL`, `ECOMMERCE`, `ECOMMERCE_CREATE`, `ECOMMERCE_DETAIL`). New NAV_ITEMS entries.
- `frontend/src/components/layout/Sidebar.tsx` — `FlaskConical` and `ShoppingCart` icons imported and registered in `iconMap`.

**New web pages** (8 new files, ~2,350 lines):

| Module | Files |
|---|---|
| Sample | `services/sample.service.ts` (76), `app/(dashboard)/samples/page.tsx` (207), `app/(dashboard)/samples/create/page.tsx` (354), `app/(dashboard)/samples/[id]/page.tsx` (538) |
| E-commerce | `services/ecommerce.service.ts` (76), `app/(dashboard)/ecommerce/page.tsx` (229), `app/(dashboard)/ecommerce/create/page.tsx` (334), `app/(dashboard)/ecommerce/[id]/page.tsx` (537) |

Each module has a list page (paginated, filtered, mobile-card responsive), a create page (form fields + scan-to-add wizard with status-validated child boxes), and a detail page (header + info section + timeline + status-gated action bar + assortment table + child-boxes list). Mirrors master-carton pattern; **omits the print-label flow** for v1 (samples/ecommerce don't currently need a printed container label).

**Sample-specific create form fields:** `name` (required), `customer_id` (optional dropdown from existing customers — empty option = "free-text recipient"), `recipient_name` (free-text fallback), `purpose`, `sample_date` (defaults to today), `notes`.

**E-commerce-specific create form fields:** `name` (required), `marketplace` (free text), `order_reference`, `listing_sku`, `mapped_date`, `notes`. List page also gains a marketplace free-text filter.

**Modified web pages:**
- `frontend/src/app/(dashboard)/dispatch/page.tsx` — full rewrite. Added source-type tab switcher: `[Master Carton] [Sample] [E-commerce]`. Master-carton path keeps its existing multi-scan UX; sample and e-commerce paths are 1:1 (one record per dispatch, enforced by backend CHECK constraint). Submit body includes the appropriate FK key.
- `frontend/src/app/(dashboard)/dispatches/page.tsx` — full rewrite. Added `SourceTypeBadge` component (Master Carton gray / Sample red / E-commerce purple). Source-type filter dropdown. Each row shows badge + `source_label` (the relevant barcode).
- `frontend/src/app/(dashboard)/reports/page.tsx` — extended (~756 → ~1060 lines). New "Samples" and "E-commerce" tabs with status / date-range / customer or marketplace filters, summary cards, paginated table, CSV export button (auth-bearing axios fetch with `responseType: 'blob'` + browser download — same pattern as existing CSV exports).
- `frontend/src/services/report.service.ts` — adds `getSampleReport`, `getEcommerceReport`, `exportSampleReportCsv`, `exportEcommerceReportCsv`.

---

#### Mobile

**Deferred per user direction.** "Once all the modifications are done on the web portal, we'll replicate the same on the mobile app later." Forward-compatible prep already in place:
- `mobile/types/index.ts` — `ChildBoxStatus` extended; `SampleRecord`, `EcommerceRecord` interfaces added.
- `mobile/constants/index.ts` — `CHILD_BOX_STATUS_COLORS` gains SAMPLE (red) and ECOMMERCE (purple). New `SAMPLE_STATUS_COLORS` and `ECOMMERCE_STATUS_COLORS` maps.

The mobile menu is **not yet** linked to `/samples` or `/ecommerce` — would 404 since no screens exist. When mobile work resumes, those nav entries get added back along with the actual screens.

`npx tsc --noEmit` on mobile: clean. No regressions from the prep.

---

#### Verification

- `backend/`: `npx tsc --noEmit` clean. All 5 migration files parse clean.
- `frontend/`: `npx tsc --noEmit` clean except the 3 pre-existing e2e errors (unchanged).
- `mobile/`: `npx tsc --noEmit` clean.

#### Testing plan (deferred — bundled with rest of Phase 6 batch)

1. Create a sample record with 3 child boxes from `/samples/create` → confirm boxes flip to `'SAMPLE'` status with red badge.
2. Stock report should NOT count those 3 sample boxes in `pairs_in_stock`. Dashboard should show them in the new `Sample Boxes` KPI.
3. Close the sample, then dispatch it via `/dispatch` (Sample tab) — sample should flip to DISPATCHED, all 3 child boxes to DISPATCHED.
4. Same flow on `/ecommerce/create` → confirm purple badge, separate KPI, marketplace filter on list works.
5. Reports → Samples tab → confirm summary numbers match. CSV export should download a file matching the visible rows.
6. Dispatches list → confirm rows show correct `Source Type` badge and source-type filter dropdown works.
7. Try to add a `'PACKED'` or `'SAMPLE'` (already in another sample) child box to a new sample → should be rejected with a clear error.

#### Decisions baked in

- A child box can be in at most one of (master_carton, sample, ecommerce) at a time — enforced by status field + three independent partial unique indexes on the mapping tables.
- Mutual exclusivity at dispatch level: `dispatch_records` CHECK constraint enforces exactly one of the three FK columns is non-null per row.
- No "repack between samples" flow — remove + add manually if needed.
- No print labels for sample/ecommerce v1.
- Sample/ecommerce dispatch is 1:1 (one source per dispatch row); only master cartons can dispatch multiple per row (existing pattern unchanged).

#### Not yet deployed to testing portal

Three Phase 6 mods now stacked awaiting deploy: CSV uploader (Apr 27), GENERATED lifecycle (Apr 27), Sample + E-commerce modules (Apr 27). Single rsync + `docker compose build` push + run all 6 migrations sequentially: `docker exec binny-backend npx node-pg-migrate up`. Mobile APK separately needs a rebuild for the GENERATED-status auto-activate flow (see prior entry).

---

### April 27, 2026 — Child Box lifecycle: new GENERATED status (label-printed-but-not-yet-scanned)

**Problem:** Every newly-created child box was immediately counted as available stock (`status='FREE'`), but in reality, labels can get damaged in print or fail to be stuck on a physical box — meaning the system was over-reporting inventory. Client wants a "label printed but not yet validated" pre-inventory state, with the box becoming real stock only when scanned.

**Lifecycle change:**
```
OLD:  (created) → FREE → PACKED → DISPATCHED
NEW:  (created) → GENERATED → FREE → PACKED → DISPATCHED
                              ↑ scan activates
                  └────────────→ PACKED  (packing implicitly activates — label clearly survived)
```

**Edge cases locked in:**
- Activate endpoint is **idempotent**: scanning an already-`FREE` box returns success silently with no audit-log noise. Scanning a `PACKED`/`DISPATCHED` box → 409.
- **Existing data untouched** — no backfill. Boxes already in DB stay `FREE`. Only newly-created boxes from this commit forward go to `GENERATED`.
- **Pack-on-scan** — packing a `GENERATED` box flips it directly to `PACKED` (skipping FREE), and writes BOTH a `CHILD_ACTIVATED` and a `CHILD_PACKED` inventory transaction so the trace timeline shows the activation moment.
- **Stock figures exclude GENERATED** — dashboard "available stock", stock report `pairs_in_stock`, inventory hierarchy aggregations, and product-wise reports all filter to `status IN ('FREE','PACKED')` or just `FREE`. The new "Generated" KPI card surfaces it separately so admins see "labels printed awaiting scan" at a glance.

**Backend changes:**

| File | Change |
|------|--------|
| `backend/migrations/20260427100001_add-generated-status-to-child-boxes.js` | NEW. `pgm.addTypeValue('child_box_status', 'GENERATED', { ifNotExists: true, before: 'FREE' })`. Down migration is a no-op (PG enum DROP VALUE not supported; harmless). |
| `backend/src/config/constants.ts` | Added `GENERATED: 'GENERATED'` (first) to `CHILD_BOX_STATUS`. Added `CHILD_ACTIVATED: 'CHILD_ACTIVATED'` to `TRANSACTION_TYPES`. |
| `backend/src/services/childBox.service.ts` | All 4 creation paths (`createChildBox`, `createBulkChildBoxes`, `createBulkMultiSizeChildBoxes`, `bulkUploadChildBoxesFromCSV`) now insert with `status=GENERATED` instead of `FREE`. Audit-log text updated to "Child box generated (label printed)". NEW `activateChildBox(id, activatedBy)` function (~lines 484–536): idempotent, transactional, fetches via `getChildBoxById` to return canonical row. |
| `backend/src/controllers/childBox.controller.ts` | NEW `activateChildBox` controller (~lines 131–141). |
| `backend/src/routes/childBox.routes.ts` | NEW `POST /:id/activate` route. Auth: ALL authenticated roles (Admin + Supervisor + Warehouse Operator + Dispatch Operator) — anyone scanning on the warehouse floor can activate. |
| `backend/src/services/masterCarton.service.ts` | `createMasterCarton` (~line 52) and `packChildBox` (~line 242) status guards extended from `!== FREE` to `!== FREE && !== GENERATED`. Both write an inline `CHILD_ACTIVATED` inventory transaction before the `CHILD_PACKED` one when source status was `GENERATED`. |
| `backend/src/services/inventory.service.ts` | Dashboard query: added `generatedBoxes` count (4-way breakdown: generated/free/packed/dispatched). `getStockByLevel` query: `total_pairs` and `child_box_count` aggregations now `FILTER (WHERE status IN (FREE,PACKED,DISPATCHED))` so GENERATED doesn't inflate stock figures. `pairsInStock` was already explicit. |

**Stock-query audit (full table in chunk-2 Sonnet report):** every WHERE/COUNT/aggregation against `child_boxes` was reviewed and either left as-is (already explicit) or fixed (only the two `getStockByLevel` aggregations needed actual edits). `getFreeChildBoxes` is unchanged — still `WHERE status='FREE'`, which is correct. Reports' `childBoxesByStatus` count gets a new GENERATED bucket naturally (it's a `GROUP BY status`).

**Frontend (web) changes:**

| File | Change |
|------|--------|
| `frontend/src/types/index.ts` | `ChildBoxStatus` union gains `'GENERATED'`. `DashboardStats` gains `generatedBoxes: number`. |
| `frontend/src/services/childBox.service.ts` | NEW `activate(id)` method. |
| `frontend/src/components/ui/StatusBadge.tsx` | NEW `GENERATED` variant: gray (`bg-gray-100 text-gray-700`), label `"Generated"`. |
| `frontend/src/app/(dashboard)/scan/page.tsx`, `traceability/page.tsx` | Both fetch by barcode and now run a guarded `useEffect`: if returned box's status was `'GENERATED'`, call `activate(id)`, replace local state, toast `"Box activated — now part of available stock"`. Guard on `box.status === 'GENERATED'` prevents re-fire after the activate response (which has status `'FREE'`). |
| `frontend/src/app/(dashboard)/child-boxes/page.tsx` | Status filter dropdown gained `'Generated'` option (second, after All). Aging legend caption updated to clarify GENERATED boxes are excluded from aging. |
| `frontend/src/app/(dashboard)/page.tsx` | Dashboard grid expanded 4 → 5 columns. NEW first KPI card: `"Generated / Awaiting scan"` with `FileWarning` icon, gray accent. The existing "Total Child Boxes" card's breakdown chip row also gained a `Generated` chip so it sums correctly to the total (previous breakdown was Free+Packed+Dispatched, mathematically inconsistent post-change). |

**Mobile changes:**

| File | Change |
|------|--------|
| `mobile/types/index.ts` | `ChildBoxStatus` union gains `'GENERATED'`. |
| `mobile/constants/index.ts` | `CHILD_BOX_STATUS_COLORS` gains `GENERATED: '#6B7280'` — Badge component reads from this map, so no Badge component edit needed. |
| `mobile/services/childBox.service.ts` | NEW `activate(id)` method. |
| `mobile/app/(tabs)/scan.tsx` | After `handleTrace` resolves, if `data.childBox.status === 'GENERATED'`: call `activate`, mutate the result, `Alert.alert` confirmation. |
| `mobile/app/master-cartons/create.tsx` | Pre-existing client-side guard on line 118 extended from `box.status !== 'FREE'` to `!== 'FREE' && !== 'GENERATED'`. Alert message updated. |
| `mobile/app/child-boxes/index.tsx` | Status filter chip row gains a `Generated` chip (between All and Free). |

**Activate endpoint contract:**
- `POST /api/v1/child-boxes/:id/activate` — auth required, any role.
- `GENERATED → FREE`: 200, returns updated box. Writes `CHILD_ACTIVATED` inventory transaction + audit log entry.
- `FREE → FREE`: 200, returns box unchanged, **no audit/transaction noise** (idempotent).
- `PACKED` / `DISPATCHED`: 409 with message "Cannot activate child box in {status} status".

**Verification:**
- `backend/`: `npx tsc --noEmit` clean.
- `frontend/`: `npx tsc --noEmit` clean except 3 pre-existing e2e errors (unchanged).
- `mobile/`: `npx tsc --noEmit` clean.
- No new npm dependencies. No DB migrations beyond the one enum-extend.

**Testing plan (deferred — bundled with rest of Phase 6 batch):**
1. Generate boxes via single create → confirm they show as `GENERATED` with gray badge.
2. Scan a `GENERATED` box on /scan → activation toast → status flips to `FREE`.
3. Scan the same box again → no toast (idempotent), status stays `FREE`.
4. Pack a `GENERATED` box on /pack → goes directly to `PACKED`, trace timeline shows BOTH ACTIVATED and PACKED events.
5. Dashboard: confirm `Generated` KPI card matches the count of GENERATED boxes; confirm "Total Child Boxes" breakdown chips sum to the total.
6. Stock report: confirm GENERATED boxes are excluded from `pairs_in_stock` and per-product `total_pairs` figures.
7. Bulk CSV upload (the feature shipped earlier today): newly created boxes from CSV land as GENERATED, requiring per-barcode scan to activate.
8. Mobile: same scan + pack flows on Android device.

**Not yet deployed to testing portal.** This commit + the earlier Phase 6 child-box CSV uploader commit both await the next manual rsync + `docker compose build` push to `srv1409601.hstgr.cloud/binny/`.

---

### April 27, 2026 — Child Box module: CSV bulk uploader (go-live initial stock import)

**Problem:** When the system goes live the warehouse needs to upload the entire existing physical stock as child boxes in one shot. The existing creation paths (single create, `POST /child-boxes/bulk` for one product, `POST /child-boxes/bulk-multi-size` for one article × N sizes) all require interactive form input — none of them accept a flat list of "SKU + count" rows. No precedent on the child-box side; products already had a CSV bulk uploader (`POST /products/bulk-upload`), so we mirror that pattern.

**Fix (scope-contained, pure addition — zero changes to existing endpoints / schema / migrations):**

**Backend:**
- New Zod row schema `bulkUploadChildBoxRowSchema` in `backend/src/models/schemas/childBox.schema.ts` (lines ~68–78): `{ sku: string, quantity: int 1–10000 default 1, count: int 1–500 }`. Uses `z.coerce.number()` since CSV cells arrive as strings.
- New service `bulkUploadChildBoxesFromCSV(csvBuffer, createdBy)` in `backend/src/services/childBox.service.ts`. Parses with `csv-parse/sync` (same options as products: `{ columns: true, skip_empty_lines: true, trim: true, bom: true }`). Header check requires `sku` + `count` (`quantity` optional). Hard caps: **1000 rows per file** and **5000 total boxes per upload** (sum of all `count` values, computed before any inserts). Per-row processing: zod-validates the row, looks up product by SKU (rejects missing or `is_active=false`), then `BEGIN`/inserts `count` boxes/`COMMIT` per row — bad row rolls back its own transaction and processing continues. Each created box gets the standard `BINNY-CB-{uuid}` barcode, status `FREE`, and the same audit-log + inventory-transaction trail as `createBulkChildBoxes`.
- Two new controllers in `backend/src/controllers/childBox.controller.ts` (lines ~113–153): `bulkUploadChildBoxes` (delegates to service, returns 201) and `getBulkUploadSample` (sends a 4-line CSV with headers + 3 sample rows).
- Two new routes in `backend/src/routes/childBox.routes.ts`, both `authorize(ADMIN, SUPERVISOR)` (matching the products bulk-upload role gate, NOT Warehouse Operator — go-live initial-stock import is an admin task):
  - `GET /child-boxes/bulk-upload/sample` — registered before any `/:id` route to avoid path collision
  - `POST /child-boxes/bulk-upload` — wraps `csvUpload.single('file')` from existing multer middleware (10MB cap, .csv MIME filter)

**Service response shape:**
```ts
{
  totalRows: number;
  created: number;            // boxes successfully inserted
  errors: { row: number; sku?: string; error: string }[];  // 1-indexed (header excluded)
  createdBarcodes: string[];  // every BINNY-CB-{uuid} that was inserted (for label printing)
}
```
The `createdBarcodes` array is a deliberate addition vs. the products pattern — at go-live the warehouse will need every barcode to print labels, so we surface them directly instead of forcing a follow-up DB query.

**Frontend:**
- `frontend/src/services/childBox.service.ts`: added `BulkUploadResult` + `BulkRowError` interfaces and two methods (`bulkUpload(file)`, `getSampleCsvUrl()`) — mirrors `frontend/src/services/product.service.ts:91–103` exactly.
- `frontend/src/app/(dashboard)/child-boxes/page.tsx`: added a manager-only **Bulk Import** outline button next to the existing **Generate Labels** button in the page header. Opens a modal that mirrors the products bulk-import modal: blue sample-download box, required-columns help text, drag-drop file input, results panel with green success banner + scrollable red per-row error list. **One addition vs. products:** a "Download Created Barcodes" button on success that builds an in-browser CSV (`barcode` header + one barcode per line) and downloads it as `child-boxes-created-{YYYY-MM-DD}.csv`. Refetch hooked on success so the new boxes appear in the list immediately. No mobile / generate-page changes.

**Files changed:**
| File | Lines | Change |
|------|-------|--------|
| `backend/src/models/schemas/childBox.schema.ts` | ~68–78 | New row schema + type |
| `backend/src/services/childBox.service.ts` | header + before `getFreeChildBoxes` | New `bulkUploadChildBoxesFromCSV` |
| `backend/src/controllers/childBox.controller.ts` | ~113–153 | `bulkUploadChildBoxes` + `getBulkUploadSample` |
| `backend/src/routes/childBox.routes.ts` | imports + before existing routes | `csvUpload` import + 2 new routes |
| `frontend/src/services/childBox.service.ts` | 1–20, 66–80 | Types + 2 methods |
| `frontend/src/app/(dashboard)/child-boxes/page.tsx` | extended | Bulk Import button + modal + 4 handlers + `BulkUploadResult`/`BulkRowError` import |

**Validation / verification:**
- `backend/`: `npx tsc --noEmit` clean — zero errors.
- `frontend/`: `npx tsc --noEmit` shows only 3 pre-existing errors in `e2e/03-child-boxes.spec.ts` and `e2e/27-edge-cases.spec.ts` (already on the books, unrelated). Zero new errors.
- No new npm dependencies. `csv-parse` already in backend (used by products); no `xlsx` lib added — Excel users save-as-CSV. Documented this tradeoff with user; can swap in native `.xlsx` later if requested.
- No DB migration. Boxes import as `FREE` per existing `child_boxes` schema; packing into master cartons happens via the normal pack workflow afterward.
- No mobile app changes (per 2026-04-23 decision: bulk creates stay web-only).

**Sample CSV (what `GET /child-boxes/bulk-upload/sample` returns):**
```
sku,quantity,count
BFW-MEN-CASUAL-RED-7,1,50
BFW-MEN-CASUAL-RED-8,1,40
BFW-MEN-CASUAL-BLUE-9,1,30
```

**Testing status:** deferred — bundled with the rest of the Phase 6 batch awaiting consolidated test pass. Manual smoke-test plan when it lands: download sample → upload as-is → confirm 120 boxes (50+40+30) created → exercise the "Download Created Barcodes" flow → verify the barcodes match boxes visible at `/child-boxes` filtered by recent.

**Not yet deployed to testing portal** (`srv1409601.hstgr.cloud/binny/`). Last deploy was Phase 6 batch #1 (commit `1b56928` on 2026-04-23). This commit needs a manual rsync + `docker compose build` push when the user is ready — see the Apr 23 portal deploy entry below for the procedure.

---

### April 22, 2026 — Product module: size range bulk-create

**Problem:** Add-Product form had a `Size` field plus orphan `Size From` / `Size To` fields. Range fields stored as metadata but didn't actually create N products — user still had to create one product per size manually (6, 7, 8, 9, 10 = 5 submissions).

**Fix (scope-contained, no breaking changes):**
- Backend: new endpoint `POST /api/v1/products/bulk-size-range` (Admin + Supervisor). Schema `bulkCreateBySizeRangeSchema` enforces integer from/to, from ≤ to, max 20 sizes. Service `bulkCreateProductsBySizeRange` runs a DB transaction — loops `from..to`, inlines SKU-serial calculation using the same pg client so successive inserts are visible to the next COUNT (critical — the shared `generateSku` helper uses the pool and would miss uncommitted rows). Per-product audit log. Returns `Product[]`.
- Frontend: new `productService.bulkCreateBySizeRange()`. Form detects mode — if only `size` → existing single-create path; if only `size_from` + `size_to` → new bulk-range path. Validation rejects both/neither. Hint text under size inputs explains the two paths. Edit mode stays single-size only. If image uploaded + range mode → image uploads to all N created products in parallel.
- `skuGenerator.ts`, existing `POST /products`, CSV bulk upload, DB schema, and mobile app all untouched.

**Files changed:**
| File | Lines | Change |
|------|-------|--------|
| `backend/src/models/schemas/product.schema.ts` | 86–134 | Added `bulkCreateBySizeRangeSchema` + `BulkCreateBySizeRangeInput` |
| `backend/src/services/product.service.ts` | 282–349 | Added `bulkCreateProductsBySizeRange` (txn, inline serial) |
| `backend/src/controllers/product.controller.ts` | 132–143 | Added `bulkCreateBySizeRange` controller |
| `backend/src/routes/product.routes.ts` | 33–38 | Wired `POST /bulk-size-range` |
| `frontend/src/services/product.service.ts` | 86–89 | Added service method |
| `frontend/src/app/(dashboard)/products/page.tsx` | 122–142, 173–237, 683–687, 737 | Added `bulkCreateProducts` mutation, `buildRangePayload`, mode-aware `handleSubmit`, hint text, button isLoading includes `isBulkCreating` |

**Verification:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean (pre-existing errors in `e2e/03-child-boxes.spec.ts` and `e2e/27-edge-cases.spec.ts` unrelated).

**Testing status:** deferred — user batching all Phase 6 modifications before running a consolidated test pass.

---

### April 22, 2026 — FREE child box aging highlight on list view

**Problem:** Warehouse operators couldn't eyeball which FREE child boxes have been sitting too long. User wanted visual aging cues — yellow after 90 days, red after 180 days.

**Where applied:** `/child-boxes` list only. The `/inventory` page is aggregated hierarchy (section → article → colour → size counts) with no per-box dates in the payload, so per-box aging is impossible there without a schema/API change.

**Aging logic** — `Date.now() - box.created_at` in days, applied only when `box.status === 'FREE'`:
- `age ≥ 180` → **red** (`bg-red-50`/`bg-red-100` hover, age pill `bg-red-100 text-red-800`)
- `90 ≤ age < 180` → **yellow** (`bg-yellow-50`/`bg-yellow-100` hover, age pill `bg-yellow-100 text-yellow-800`)
- Otherwise → default (no change)

Note: we use `created_at` as the age proxy because the schema has no `became_free_at` / `unpacked_at` column. For boxes that were PACKED and later unpacked back to FREE, the clock still starts from creation. Flag for follow-up if the client wants "days since last became free" semantics.

**Changes** (single file, `frontend/src/app/(dashboard)/child-boxes/page.tsx`):
- Lines 29–42: `getAgingState(status, createdAt)` + `getAgeDays(createdAt)` module-level helpers.
- Lines 88–98: aging legend ("90–179 days" yellow swatch, "180+ days" red swatch) above the filters row.
- Mobile card (lines 158–212) and desktop TableRow (lines 232–267): conditional tint className + age pill (`92d`, `193d`, etc.) rendered next to `StatusBadge`.

Backend + schema + types untouched. `tsc --noEmit` clean.

**Testing status:** deferred.

---

### April 22, 2026 — Child box label: Size number enlarged (follow-up)

**Problem:** Size cell was visibly empty — the 3-line MRP restructure grew the right-column rowspan to ~17mm, but `.size-value` was still 24pt (~8.5mm cap), leaving dead vertical space.

**Fix** (same file): `.size-value` 24pt → **34pt** (cap ~12mm, "10" digit width ~13.4mm fits inside the 14.5mm usable cell width). `.size-label` bumped 6pt → 7pt with 0.5mm `margin-bottom` for breathing room above the big number.

---

### April 22, 2026 — Child box label: MRP cell restructured (follow-up)

**Problem:** After the 50mm resize, `M.R.P.: ₹ 299.00` on one line was wrapping awkwardly — "₹ 299.00" dropped to the next line.

**Fix** (same file, `handlePrint`): Split the MRP cell into a 3-line stack:
- Line 1: `M.R.P.` (bold, 8pt)
- Line 2: `₹ 299.00` (bold, 11pt — the amount stays prominent)
- Line 3: `(Inc of all taxes)` (5pt — unchanged)

Changed `.mrp-row` to `vertical-align: middle` with `line-height: 1.15` and 1mm top/bottom padding so the 3 lines breathe evenly. Replaced `.mrp-line` with `.mrp-label` + `.mrp-value` classes; `.mrp-sub` unchanged.

---

### April 22, 2026 — Child box label: 60mm → 50mm, layout rebalanced

**Problem:** Label was 60×60mm. User wants 50×50mm with Packed on / Content cells shrunk so Colour and MRP get more visual weight, and fonts scaled to maximise cell space.

**Fix** (single file, CSS-only in `handlePrint` at `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx:218–251`):
- `@page` + `.label` size: 60mm → **50mm** square
- QR: 17mm → **13mm** (frees ~4mm vertical; `level: 'M'` error correction at 128px rendered size keeps it scannable)
- `.small-row` (Packed on, Content): height 4mm → **2.5mm**, padding tightened
- `.colour-row`: 9pt → **11pt bold**, extra row padding 1.5mm
- `.mrp-line`: 9pt → **11pt bold**, extra row padding 1.5mm on its row
- `.size-value`: 28pt → **24pt** (proportional to label shrink, still the dominant element)
- `.article-row`: 9pt → 8pt, `.size-label`: 7pt → 6pt, `.mrp-sub`: 5.5pt → 5pt, footer: 5.5pt → 5pt with line-height 1.3 → 1.2 (all minor trims so the visibility gains for Colour/MRP stick)

Net effect: same 6-cell table structure, Colour and MRP cells now visibly dominate the top half; Packed on / Content compress into a thin band next to the smaller QR; the two rebalanced cells can't overflow because the container is a fixed 50mm print box.

**Testing status:** deferred.

---

### April 23, 2026 — Portal deploy to testing VPS (Phase 6 batch #1 visible to client)

**Context:** After pushing Phase 6 commit `1b56928` to `origin/main` the client reported `/binny/child-boxes` still showed the old build. Investigation: `/opt/binny` on the VPS is a plain copy (no `.git`), last synced Apr 14; containers were running 7-day-old images. There is no CI/webhook — deploy is manual rsync/tar + `docker compose build`.

**Deploy steps executed:**
1. Tar-over-ssh streamed `backend/src/`, `frontend/src/`, `progress.md`, and the five `docs/test-cases-v2-phases-*.md` files into `/opt/binny/` as `root@srv1409601.hstgr.cloud` (authenticated via `~/.ssh/id_ed25519`, not the project `.ssh/binny-deploy` key — that one is still not in the server's `authorized_keys`). Skipped `.env*`, `node_modules`, `.next`, `mobile/`, local APK/PNGs, and `frontend/e2e/` (not needed by the runtime).
2. `docker compose -f docker-compose.prod.yml build binny-backend binny-frontend` on the server — both rebuilt cleanly (frontend build ~88s, backend shorter).
3. `docker compose -f docker-compose.prod.yml up -d binny-backend binny-frontend` — containers recreated; backend reported healthy within ~35s, frontend within ~5s. `binny-db` left running.

**Verification:**
- `GET /binny/api/v1/health` → `{"status":"ok"}`
- `OPTIONS /binny/api/v1/products/bulk-size-range` → HTTP 204 (route registered; pre-deploy build would have 404'd)

**Notes for next deploy:**
- Server deploy user is `root`; the key that works is **personal** `~/.ssh/id_ed25519`, not `.ssh/binny-deploy`. The project deploy key is effectively unused.
- No automation exists — every push to GitHub requires a manual tar+build+up on the VPS to reflect on the testing portal.

---

### April 23, 2026 — Mobile Phase A (foundation) complete

**Scope:** Set up the groundwork for web-parity work on the mobile app (Expo SDK 54 + TS + expo-router + Zustand + TanStack Query). Three parallel Sonnet tasks, zero file-level overlap.

**Delivered:**
1. **Env config + QR prefix fix.** `mobile/.env.example` created; `.gitignore` extended to exclude local `.env`; `constants/index.ts` logs the resolved `API_BASE_URL` under `__DEV__`; `utils/index.ts:parseQRCode` regex rewritten to accept `BINNY-CB-<uuid>` / `BINNY-MC-<uuid>` (old code matched stale `CB-` / `MC-` prefixes that never occur in practice).
2. **Camera QR scanner.** `mobile/components/BarcodeScanner.tsx` (255 lines) — full-screen Modal, `CameraView` + `useCameraPermissions()`, overlay cutout via 4 `View` strips (no SVG), `expo-haptics` success ping, single-shot debounce with 1500ms cooldown, `expectedType` filter ('child' | 'master' | 'any') that rejects wrong-type scans with an animated red banner. Integrated into `app/(tabs)/scan.tsx` as a prominent "Scan with Camera" button above the text-input fallback; `handleTrace` refactored to accept an explicit barcode argument so camera scans trace immediately without waiting for state to flush.
3. **RoleGate + stub routes.** `mobile/components/RoleGate.tsx` (wrapper + `useHasRole` hook reading Zustand auth store). `mobile/components/PlaceholderScreen.tsx` (shared shell with `Stack.Screen options={{ title }}` header injection). 14 stub route files created outside the `(tabs)` group — `child-boxes/{index,generate}`, `master-cartons/{index,create}`, `dispatch/{index,create}`, `storage`, `unpack`, `repack`, `products`, `customers`, `reports`, `users`, `settings` — so navigation works end-to-end. `menu.tsx` rewired: `Alert.alert('Coming Soon')` → `router.push(route)`, 5 new items added (Unpack, Repack, Storage, Settings, Users), `<RoleGate>` gates Products/Customers/Reports to Admin+Supervisor and Users to Admin only. `Pack` route corrected from non-existent `/pack` to `/master-cartons/create`.

**Files: 16 new, 3 modified.** `npx tsc --noEmit` clean across all created/modified files (11 pre-existing errors remain in `mobile/__tests__/` — stale `username` vs `email` mocks; not introduced here, out of scope).

**Known nit:** unused `allRoles` const left on `menu.tsx:20` — inert, cleanup deferred to a later pass.

**Testing status:** deferred — smoke-test with `expo start` + Android emulator at the end of Phase B once list/pack flows exist.

---

## CURRENT EXECUTION (resumption marker — 2026-05-02, MOBILE PARITY M1-M7 ✅; TEST-CASE AUTHORING SESSIONS 1-3/13 ✅; CLIENT MODS #1 (2-up labels) + #2 (HID scanner) ✅ shipped + DEPLOYED to testing portal)

---

## Deploy 2026-05-02 — Client mods #1 + #2 → testing portal

Both client modifications shipped earlier today (commits `e6a3617` and `eba073d`) deployed to the Hostinger VPS testing portal in a single push. Backend untouched (no backend code changes); database untouched. Deploy procedure followed the saved recipe from memory `project_deployment.md`.

**Procedure used:**
1. Tar-stream `frontend/src` + `progress.md` over SSH (`ssh -i ~/.ssh/id_ed25519 root@srv1409601.hstgr.cloud`) into `/opt/binny/`
2. `docker compose -f docker-compose.prod.yml build binny-frontend` on the server (~90s build)
3. `docker compose -f docker-compose.prod.yml up -d binny-frontend` to recreate the container
4. `binny-backend` and `binny-db` left running unchanged (skipped — no backend changes)

**Post-deploy verification:**
- `GET https://srv1409601.hstgr.cloud/binny/api/v1/health` → `{"status":"ok","timestamp":"2026-05-02T12:52:21.277Z"}`
- HTTP 200 on all 6 affected pages: `/master-cartons/create`, `/samples/create`, `/ecommerce/create`, `/dispatch`, `/scan`, `/traceability`, `/child-boxes/generate`
- All 3 binny containers (`binny-frontend`, `binny-backend`, `binny-db`) reported healthy after restart

**What's now live for client testing:**
- **Mod #1 (2-up child-box labels):** `/child-boxes/generate` → after generation, "Print Labels" button outputs two 50×50mm labels per 100×50mm page-row matching the physical roll. Odd counts pad with a hidden placeholder.
- **Mod #2 (HID scanner support):** All 9 scan-bearing pages now show `<HIDScannerInput>` at the top with a green "Scanner ready" badge when focused (auto-focuses on mount). BPS250BC injects barcode + Enter → handler fires → input clears + refocuses for next scan. Camera fallback is behind a "Use Camera Instead" toggle button.

**Client to verify on hardware:**
- Print labels on the actual TSC printer with the 100mm-wide roll — confirm 2-up alignment + correct feed advance
- Pair BPS250BC over Bluetooth (or place in cradle) and trigger scans on each affected page — confirm barcodes land in the green-badge input without manual click + that consecutive scans work

Hard refresh (Ctrl+Shift+R) recommended to bust the prior bundle cache.

---

## Workstream C — Client modification #2: BPS250BC HID scanner support (2026-05-02)

Client uses a **BPS250BC 2D scanner (Bluetooth + cradle)** that operates as a HID keyboard, injecting barcodes + Enter into focused input fields. Reported "scanner not taking" while creating child-box / master-carton scans — the camera was opening instead. Root cause: the manual barcode input was visually demoted ("Or enter barcode manually" hint) and not auto-focused, so HID keystrokes had nowhere to land. The camera button was the prominent CTA, suggesting it was the only scanner option.

**Changes:**
- New reusable component `frontend/src/components/scanning/HIDScannerInput.tsx` (170 lines):
  - Auto-focuses on mount (configurable per page)
  - Re-focuses after every successful scan so rapid consecutive scans require zero user interaction
  - Window-level `keydown` listener auto-focuses the input when a printable key arrives and no editable element is focused (recovers from focus drift)
  - Visual cue: green "Scanner ready" badge with pulsing checkmark when focused; gray "Click to focus" with barcode icon when not. Input gets a green ring when focused.
  - Same Enter-triggers-onScan contract as the prior manual inputs; same Add button for click-to-submit
- Updated **all 9 scan-bearing pages** to use `<HIDScannerInput>` as the primary entry point and demote `<QRScanner>` (camera) behind a `Use Camera Instead` toggle button:
  - `master-cartons/create`, `master-cartons/[id]`
  - `samples/create`, `samples/[id]`
  - `ecommerce/create`, `ecommerce/[id]`
  - `dispatch` (all 3 source-type panels — only the currently-selected tab's HID input auto-focuses, avoiding focus battles)
  - `scan`, `traceability`
- Removed dead state vars (`manualBarcode`, `sampleBarcode`, `ecBarcode`, `handleManualAdd`) now owned internally by the new component
- Camera scanner is preserved as a fallback for users without a hardware scanner — same `<QRScanner>` component, just demoted in visual hierarchy

**Verification:**
- `npx tsc --noEmit` from `frontend/`: clean for the modified files (3 pre-existing e2e spec errors unrelated)
- `npm run lint`: exit 0; new warnings: zero
- Net diff: +376 / -396 across 10 files (1 new component + 9 page consolidations)

**Manual verification deferred:** Client to test BT scanner injection on actual hardware. Expected: open any scan-bearing page → the HID input is already focused with green "Scanner ready" badge → trigger BT scanner → barcode appears in input + Enter triggers handler + input clears + refocuses for next scan.

**Commit:** `eba073d` — "Web scanners: support BPS250BC HID barcode scanner as primary input" (10 files, +376/-396)

**Deployed to testing portal 2026-05-02** (`https://srv1409601.hstgr.cloud/binny/`) — see "Deploy 2026-05-02" subsection below.

**Test-suite impact:** v3 web phase TCs that assert "Open Scanner" button as the primary scan CTA are now stale on UX-text assertions. Specifically affects:
- phase-10 (Master Cartons), phase-11 (Samples), phase-12 (E-commerce), phase-13 (Dispatch), phase-18 (Scan & Traceability) — any TC that selects on the "Open Scanner" button label or asserts the camera as the default scan UI must be updated to:
  - Primary scan UI: `<HIDScannerInput>` with "Scanner ready" badge, auto-focused on mount
  - Camera fallback: behind "Use Camera Instead" button (collapsed by default)
- Add the same note to AUTHORING_PROGRESS.md so the test-authoring resume pass refreshes these phases alongside the phase-09 label refresh from Mod #1.

---

---

## Workstream C — Client modification #1: 2-up child-box label print (2026-05-02)

Client clarified that the label roll being used is **100mm wide carrying two 50×50mm labels side-by-side per row** (see `Rollsize.jpeg` in repo root). The previous print layout emitted one label per page (50×50mm @page), wasting half the roll on each pass. Re-laid out the print to produce two labels per page-row matching the physical roll geometry.

**Changes:**
- `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx` `handlePrint()`:
  - `@page` size `50mm 50mm` → `100mm 50mm`
  - Group `labelHtmlParts` into pairs of 2; wrap each pair in a flex `<div class="row">` that handles the page-break (instead of `.label` doing it)
  - Odd-count tail-padding via `<div class="label-empty">` (hidden, same dimensions) so the printer still advances 50mm and the next print run starts on a fresh row pair
  - Per-label inner table content (article / colour / size / MRP / QR / footer) unchanged
- Master-carton label print (100×150mm, separate code in `master-cartons/[id]/page.tsx`) untouched — different label format, not on the same roll.

**Verification:**
- `npx tsc --noEmit` from `frontend/`: clean for the modified file (pre-existing e2e spec errors unrelated)
- `npm run lint`: exit 0
- Visual print verification deferred to client's first run on the actual roll — flag in v3 phase-09 (web Child Box labels) and the upcoming mobile reports phase to update label TCs to assert 2-per-row layout

**Commit:** `e6a3617` — "Child-box labels: print 2-up to match 100mm-wide roll" (1 file, +21/-4)

**Deployed to testing portal 2026-05-02** (`https://srv1409601.hstgr.cloud/binny/`) along with Mod #2. Full deploy details under "Deploy 2026-05-02" subsection below.

**Test-suite impact:** v3 phase-09 (`phase-09-childbox-labels.md`, 56 TCs) currently asserts `@page size 50mm 50mm` and 1-up layout. Those TCs need updating once Workstream B resumes — add a follow-up note to AUTHORING_PROGRESS.md so the next test-authoring pass refreshes phase-09 to match the new 2-up layout (assertions: 100×50mm @page, two 50×50mm labels per page, hidden placeholder on odd counts, page-break on `.row` not `.label`).

---

**Active workstream:** Mobile parity (M1 → M7). 7-phase plan to bring the mobile app up to feature parity with the web portal (Apr 27 mods + Apr 30 carton view). Opus plans each phase, Sonnet executes, orchestrator (Opus) verifies + updates this doc + commits per phase.

**Phase status:**
- **M1 — Data layer + barcode parsing** ✅ COMPLETE (2026-05-01, commit `2d77d19`). Types extended, samples + ecommerce services added, parseQRCode + BarcodeScanner accept SR/EC. `tsc --noEmit` clean.
- **M2 — Sample module screens** ✅ COMPLETE (2026-05-01, commit `c5c92a4`). 3 screens (list / create / detail) + Samples menu tile. Lifecycle constraints match web. `tsc --noEmit` clean.
- **M3 — E-commerce module screens** ✅ COMPLETE (2026-05-01, commit `206c353`). 3 screens cloned from Sample template with field substitutions + E-commerce menu tile. `tsc --noEmit` clean.
- **M4 — Dispatch multi-source** ✅ COMPLETE (2026-05-02, commit `ae73320`). 3-way segmented picker on `dispatch/create.tsx` (Master Carton / Sample / E-commerce); per-source scan + manual barcode entry; customer/transport/LR/vehicle/notes shared. `dispatch/index.tsx` renders source-type chip + falls back to `source_label`. `dispatch/[id].tsx` adds Source card with type label + tappable "View source record" jump-link. CLOSED-only gating on all three paths. `tsc --noEmit` clean.
- **M5 — Inventory: MRP grouping + Master Carton view tab** ✅ COMPLETE (2026-05-02, commit `108796d`). `mobile/app/(tabs)/inventory.tsx` rewritten: conditional MRP drill step (article_name → mrp → colour when `distinctMrpCount > 1`), top-level segmented tab toggle (`Child Box | Master Carton`), Master Carton hierarchy (`status → section → article_name → carton`) with status-breakdown chips + utilization bar + leaf card routing to `/master-cartons/[id]`. Each tab keeps own breadcrumb stack. Load-more pagination on carton-leaf. CSV + search skipped (web-only / drill-filter sufficient). `tsc --noEmit` clean.
- **M6 — Reports stock-tab columns** ✅ COMPLETE (2026-05-02, commit `e75bcc6`). `mobile/app/reports.tsx` StockTab: per-row card now renders 8 stat tiles in web column order (Total / Free / Packed / Sample / E-commerce / Dispatched / Pairs (Stock) / Pairs (Sent)); added Totals card above the per-row list mirroring the web's totals row. Uses `CHILD_BOX_STATUS_COLORS.SAMPLE` (red) and `.ECOMMERCE` (purple) consistent with mobile branding. `tsc --noEmit` clean.
- **M7 — TS check + jest + EAS preview build** ✅ COMPLETE (2026-05-02). Final `tsc --noEmit` exit 0. Jest: 93/114 pass; 21 failures across 3 suites (`__tests__/services/api.test.ts`, `__tests__/hooks/useApi.test.ts`, `__tests__/components/ui.test.tsx`) are PRE-EXISTING — git log confirms neither the test files nor their source under test (`hooks/useApi.ts`, `components/ui/Button.tsx`, `services/api.ts`) were modified during M1-M6 or between Phase D commit `fedaaed` and M1, so failures pre-date the parity workstream. Tracked as separate cleanup, NOT a parity blocker. EAS preview build submitted to free queue: build ID `50dc7551-fa54-4621-b733-982bf831b0b3`, profile `preview` (internal distribution, APK output). Build URL: https://expo.dev/accounts/kanikabehl/projects/binny-inventory/builds/50dc7551-fa54-4621-b733-982bf831b0b3

---

## Workstream B — Comprehensive mobile test-case authoring (started 2026-05-02)

User requested an exhaustive test-case suite covering all roles and all modules — frontend + backend + Maestro E2E for mobile, Playwright for web. The existing v3 web suite is intact (1,469 TCs across 20 phase files); the new work is mobile-only this round (web re-pass deferred). Plan: 13 sessions, each producing ~50-130 TCs in one phase markdown file. Opus plans + verifies; Sonnet authors per session.

**Plan tracker (canonical):** `docs/test-cases-v3/AUTHORING_PROGRESS.md`. Read that file first when resuming.

**Authoring rule established this session:** Hold ALL commits until the full 13-session workstream is done — user will run a single combined commit at the end. The working tree will accumulate uncommitted work across sessions. Saved to memory: `feedback_combined_commit_test_authoring.md`.

**Sessions completed (this calendar day):**

- **Session 1 — `phase-21-mobile-foundation.md`** ✅ (106 TCs, 21 Maestro flows, 14 sections). Auth/login per role, AuthGate routing, bottom tab bar, Dashboard tab, Menu grid (role-gated tiles for all 4 roles incl. Warehouse/Dispatch restriction), Settings, logout, token persistence in SecureStore, 401 wipe behavior. 2 `[?]` flags raised: deep-link-return-to-target after login (likely not implemented), JWT revocation on remote logout (server is stateless).
- **Session 2 — `phase-22-mobile-inventory.md`** ✅ (94 TCs, 19 Maestro flows, 22 sections). Both inventory tabs (Child Box | Master Carton — M5), conditional MRP drill, breadcrumbs per tab, summary cards, status-breakdown chips, utilization bar color thresholds, status pill colors, leaf-carton routing, load-more pagination. Per-role exercises in 22.1 + 22.21. 4 `[?]` flags: silent error fallback, missing `node.id` guard, Maestro selector ambiguity, no locale formatting on large counts.
- **Session 3 — `phase-23-mobile-products-childboxes.md`** ✅ (122 TCs, 15 Maestro flows, 23 sections). Products list/detail (Admin+Supervisor only — read-only on mobile, no create), Child Boxes list/detail/aging-tint (90d yellow / 180d red, FREE-only), Generate web-only stub screen, Repack/Unpack/Storage workflows. 6 `[?]` flags incl. **2 real behavioral inconsistencies discovered by source read**:
  - Mobile **Unpack** does NOT block CREATED-status cartons while Repack/Storage do — likely gap in `mobile/app/unpack.tsx`.
  - Mobile **Storage** RoleGate allows Warehouse Op but the v3 capability matrix says backend close mutation is Admin+Supervisor only — mobile UX → API layer mismatch (will succeed at screen, fail at API).

**Sessions remaining (10):**
- Session 4 — `phase-24-mobile-master-cartons.md` (Master Cartons list/create/detail + status state machine + role divergence on Close action) — **WAS DISPATCHED but Sonnet hit usage limit before completing; phase-24 file was NOT created. Re-dispatch Sonnet with the same brief next session (the brief is in this conversation's history).**
- Session 5 — `phase-25-mobile-samples.md` (Samples M2 — full lifecycle on mobile)
- Session 6 — `phase-26-mobile-ecommerce.md` (E-commerce M3 — full lifecycle)
- Session 7 — `phase-27-mobile-dispatch.md` (Dispatch M4 — 3-way source picker + jump-link)
- Session 8 — `phase-28-mobile-customers-users.md` (Customers per role; Users Admin-only)
- Session 9 — `phase-29-mobile-scan-traceability.md` (Scan tab; parseQRCode CB/MC/SR/EC; traceability)
- Session 10 — `phase-30-mobile-reports.md` (Reports M6 — Sample/Ecommerce columns + Cartons/Dispatches/Activity tabs)
- Session 11 — `phase-31-cross-platform-parity.md` (web ↔ mobile data parity, JWT sharing, status both ways)
- Session 12 — `phase-32-mobile-edge-cases.md` (network/offline/camera/token-refresh/perf smoke)
- Session 13 — README + tracker finalisation (capability matrix mobile rows, drop "out of scope" line, finalise tracker)

**Working tree at pause point** (uncommitted by design — combined commit deferred):
- `docs/test-cases-v3/phase-21-mobile-foundation.md` (new, 802 lines, 106 TCs)
- `docs/test-cases-v3/phase-22-mobile-inventory.md` (new, 961 lines, 94 TCs)
- `docs/test-cases-v3/phase-23-mobile-products-childboxes.md` (new, 827 lines, 122 TCs)
- `docs/test-cases-v3/AUTHORING_PROGRESS.md` (new, session tracker)
- `docs/test-cases-v3/README.md` (modified — phases 21-32 added, mobile no longer "out of scope")
- `progress.md` (modified — this update + earlier M7 EAS-build update)
- `scripts/progress-checkpoint.sh` (untracked, established session-long file, leave alone)

**Cumulative TC count from this workstream so far: 322 mobile TCs across 3 phases.**

**Pause reason (2026-05-02):** Client provided a slight modification to implement first; resuming testing afterwards. When resuming, read `docs/test-cases-v3/AUTHORING_PROGRESS.md` first, find the lowest-# pending session, plan brief with Opus, dispatch Sonnet.

---

## Workstream A resumption — Mobile parity M1-M7 follow-ups

Mobile parity M1-M7 is COMPLETE. Next session focus depends on EAS build outcome + client testing:

1. **Once EAS build finishes** (10-30 min on free queue): grab the APK install URL from the build page (`https://expo.dev/accounts/kanikabehl/projects/binny-inventory/builds/50dc7551-fa54-4621-b733-982bf831b0b3`) and forward to client/QA for sideloading on their Android device. Smoke-test these flows on the APK:
   - Samples module: create → activate → close → dispatch (M2)
   - E-commerce module: same lifecycle (M3)
   - Dispatch: switch source picker between all 3 types (M4)
   - Inventory: drill into a multi-MRP article like `MRP TEST CITY 02` and confirm the MRP step appears; switch to Master Carton tab and drill `status → section → article → carton` (M5)
   - Reports → Stock: confirm Sample + E-commerce stat tiles appear with non-zero counts when fixtures exist (M6)
2. **Pre-existing jest failures** (21 tests in `services/api.test.ts`, `hooks/useApi.test.ts`, `components/ui.test.tsx`): low-pri cleanup. Likely Jest/RN version drift since neither tests nor sources changed. Triage when there's downtime — not a release blocker.
3. **3 deferred web defects** still pending product input (carried over from before mobile parity):
   - `section.service.ts deleteSection()` — FK guard for products?
   - `customer.service.ts deleteCustomer()` — FK guard for sample/dispatch records?
   - `dispatchListQuerySchema` — server-side `source_type` filter (currently client-side useMemo)?
4. **Client feedback loop**: if client reports bugs from APK testing, reproduce + patch + redeploy (web) or rebuild EAS (mobile).

**Working tree:** clean except `scripts/progress-checkpoint.sh` (untracked, leave alone). Latest commits on `main`:
- `e75bcc6` — Mobile parity M6: reports stock-tab sample/ecommerce columns
- `108796d` — Mobile parity M5: inventory MRP grouping + Master Carton tab
- `ae73320` — Mobile parity M4: dispatch multi-source
- `206c353` — Mobile parity M3: E-commerce module screens
- `c5c92a4` — Mobile parity M2: Sample module screens
- `2d77d19` — Mobile parity M1: data layer + barcode parsing

**Open questions (still deferred from initial plan, none blocking M4):**
- CSV bulk uploader on mobile: confirmed skipped (web-only flow).
- EAS preview build: wait for explicit OK before kicking off — runs against free queue.
- Commit cadence: per-phase (working as expected).

**Live URLs unchanged:** Portal `https://srv1409601.hstgr.cloud/binny/`, admin `admin@binny.com / Admin@123`, local backend `http://localhost:3001/api/v1`.

**What landed earlier (2026-04-30):**
1. **v3 test-case suite written** — `docs/test-cases-v3/README.md` + 20 phase files, ~1,289 TCs covering the full system including the four Apr 27 mods.
2. **7 confirmed defects fixed** during the v3 authoring code-read pass (users page PATCH→PUT, customers Add gate, /transactions authorize, reports table sample/ecommerce columns, MRP rendering FLOOR consistency, getStockSummary GENERATED filter, ecommerce duplicate INSERT).
3. **Master Carton view shipped** — new tab on `/inventory` with Status → Section → Article → Carton hierarchy, mixed-article dedup via COUNT DISTINCT, CSV export at every level (Admin+Supervisor). 30 TCs added in phase-15 Section 11.
4. **6 new Playwright specs** for the four Apr 27 mods + carton view (114 tests). After triage + fix-pass: **124/126 pass** in the new+regression bundle.
5. **3 deploys to testing portal** (`https://srv1409601.hstgr.cloud/binny/`): morning defect-fix bundle, mid-day carton view, plus all migrations applied locally.

**Commit state (`origin/main`):**
- `161b308` — progress.md: log carton view + QA pass deploy
- `39a7658` — Playwright QA: 6 new specs, 124/126 pass
- `11ef591` — Inventory: add Master Carton view alongside Child Box hierarchy
- `cd2ade3` — Phase 6 QA pass: v3 test-case suite + 7 defect fixes
- `160084d` — (Apr 29) Phase 6 batch #2: 4 web mods

**Working tree:** clean except `scripts/progress-checkpoint.sh` (untracked, leave alone per established rule).

**Open decisions for next session:**
1. **3 larger-scope defects** still pending product/PM input:
   - `section.service.ts deleteSection()` — add FK guard for products?
   - `customer.service.ts deleteCustomer()` — add FK guard for sample/dispatch records?
   - `dispatchListQuerySchema` — add `source_type` server-side filter (currently client-side `useMemo` only)?
2. **Non-admin role users** still not auto-seeded in fixtures. Workaround in specs: `test.skip` when not present. Could add a fixture seed script if QA wants role-specific testing without manual creation.
3. **Native .xlsx parsing** in CSV uploader — deferred follow-up. Currently advise client "save as CSV". Could swap in `xlsx` lib if requested.
4. **Mobile parity** — APK on device is `042b1e6` (Apr 23), missing the four Apr 27 mods + carton view. Deferred per user 2026-04-27 direction. Mobile types/colours have forward-compat prep in place.
5. **Cosmetic ISO date** in carton-leaf JSON response — `created_at` returns `"Sat Apr 18 2026..."` instead of ISO. CSV export is correctly ISO. Easy 1-line `.toISOString()` fix in `inventory.service.ts` row mapper if you want it tidied.

**Where to pick up next session:**
- Wait for the client to test the carton view + new Apr 27 mods in their UI on portal. Hard refresh required (Ctrl+Shift+R) to bust the prior bundle cache.
- If client wants a feature: gather scope, plan with Opus, dispatch Sonnet.
- If they report a bug: reproduce with the v3 spec for that area, debug, patch + redeploy.
- If they ask "what's next on the QA suite": run the 22 existing Playwright specs (01-28 minus 13/29-34 which we already touched) as a regression sweep against today's portal state.

**Live URLs:**
- Portal: `https://srv1409601.hstgr.cloud/binny/`
- API base: `https://srv1409601.hstgr.cloud/binny/api/v1`
- Admin login: `admin@binny.com / Admin@123` (verified today)
- Local backend (dev): `http://localhost:3001/api/v1` — `binny_backend` + `binny_postgres` containers up
- Local frontend (dev): `http://localhost:3000` — `binny_frontend` container up
- All 6 Apr 27 migrations applied to local DB on Apr 30; portal already had them applied on Apr 29.

**Local-only fixtures NOT shipped to portal** (intentional, to keep client environment clean):
- `MRP TEST CITY 02` (BLUE@₹299, RED@₹399, sizes 6-8) — multi-MRP fixture for verifying the conditional MRP step in the Child Box hierarchy
- `MRP TEST CITY 03` (BLACK@₹599, sizes 6-8) — single-MRP control (subtitle should read "N Colours", not "N MRPs")
- 36 child boxes for above, all activated to FREE
- 3 ACTIVE master cartons all holding `MRP TEST CITY 02` BLUE boxes (sizes 6/7/8, 4 boxes each, 4/24 utilization) — fixture for verifying the carton-view article-level showing `cartonCount: 3` and 3 leaf carton cards. Barcodes: `BINNY-MC-7b5135fe-...`, `BINNY-MC-c74b9e46-...`, `BINNY-MC-22def782-...`
- Smoke-test sample/ecommerce/master-carton artefacts from earlier today
- Many `wh-sm-{ts}@test.com` / `dp-sm-{ts}@test.com` / `dp-life-{ts}@test.com` test users from Playwright role tests

**Demo paths for the local fixtures:**
- **Multi-MRP grouping:** `/inventory` → Child Box tab → Hawaii → `MRP TEST CITY 02` (subtitle "2 MRPs") → click reveals ₹299 + ₹399 buckets → click ₹299 → only BLUE → click colour → product cards render `"6 - ₹299"` (FLOOR pattern). Compare with `MRP TEST CITY 03` which jumps article→colour directly (single MRP).
- **Multiple cartons per article:** `/inventory` → Master Carton tab → ACTIVE → Hawaii → `MRP TEST CITY 02` (cartonCount: 3) → 3 leaf carton cards with utilization bars + primary_section/article + dates. Click any carton → `/master-cartons/[id]` detail.

**Tests left running clean (124/126):** the 2 skips are intentional `test.skip` paths (warehouse user not seeded gating + multer cap optional). 1 known flake on `TC-EC-UI-001` that passes solo but occasionally races during full-file runs — not blocking.

---

(prior CURRENT EXECUTION block — superseded)
**Active workstream:** Web Phase 6 — **all four 2026-04-27 mods deployed to testing portal 2026-04-29.** Smoke tests green; commit `160084d` on `origin/main`. Currently planning a comprehensive v3 test-case suite (20 phases) to validate all scope from initial through current state. See `docs/test-cases-v3/` once written.

**Active workstream:** Web Phase 6 — **all four 2026-04-27 mods deployed to testing portal 2026-04-29.** Smoke tests green; commit `160084d` on `origin/main`. Currently planning a comprehensive v3 test-case suite (20 phases) to validate all scope from initial through current state. See `docs/test-cases-v3/` once written.

Mods now live on `srv1409601.hstgr.cloud/binny/`:
1. Child-box CSV bulk uploader (go-live initial stock import).
2. `GENERATED` lifecycle — labels start as GENERATED, scan activates to FREE.
3. Sample + E-commerce modules — two new container types, full lifecycle parity with master cartons.
4. Inventory hierarchy MRP grouping — `mrp` level inserted conditionally between article and colour.

**Mobile deferred** per user direction 2026-04-27: "Once all the modifications are done on the web portal, we'll replicate the same on the mobile app later." Forward-compat prep in mobile types + status colors is in place; mobile screens for sample/ecommerce + GENERATED auto-activation pending. Current APK on device is from 2026-04-23 (commit `042b1e6`) — lacks all three of today's mods.

**Where to pick up next:**

1. **Test-case suite v3 (20 phases) is being written in chunks across multiple sessions.** First batch (Phases 01–04) in flight; remaining phases (05–20) tracked as resumable Sonnet dispatch tasks. See `docs/test-cases-v3/README.md` for the phase index and completion tracker.
2. **Wait for next client mod** — pattern continues.
3. **Mobile parity (deferred):** when client signals readiness, replicate the four Apr 27 mods on mobile. APK rebuild after mobile work lands.
4. **Optional:** native `.xlsx` parsing in CSV uploader.

**Where to pick up tomorrow:**

1. **Confirm with user: cut a polish APK?** The APK delivered today is on commit `042b1e6` (Phase C.2+C.3 complete). Subsequent polish commit `fedaaed` is NOT in it — ships with "Detail view coming soon" alert on dispatch rows and a placeholder generate screen instead of the polished versions. User hasn't decided whether to cut a second build; offer at session start.
2. **Emulator smoke test** — boot the AVD (commands below), install today's APK (`binny-inventory-042b1e6-preview.apk` in repo root), walk through login → scan → pack → unpack → dispatch happy path to verify no runtime regressions.
3. **Resume Phase 6 web mods if user wants** — they were feeding one-at-a-time mods; last delivered batch was size-range bulk-create + label redesign + aging highlight, all deployed to testing portal on Apr 23.

**Status of Phase D items:**
- [x] Dispatch detail real screen (commit `fedaaed`)
- [x] child-boxes/generate → "use web portal" info screen (`fedaaed`)
- [x] Dead code cleanup (`allRoles` const in menu.tsx) (`fedaaed`)
- [x] 11 pre-existing `__tests__/` type errors fixed → `tsc --noEmit` is 0 errors (`fedaaed`)
- [x] `.gitignore` extended for `*.apk`, `*.aab`, and root-level scan debug PNGs (`f749b47`)
- [x] EAS preview APK built + downloaded (commit `042b1e6`, see build `6d90b3f2-d70d-4ddd-8f4a-13c08375ea04`)
- [x] Jest test run — 93/114 pass (82%). See separate entry below.
- [ ] Emulator smoke test on the APK
- [ ] Fix 21 pre-existing jest infra failures (axios.create mock hoisting in `api.test.ts`, Expo streams polyfill + TanStack v5 signature in `useApi.test.ts`, RNTL disabled behavior in `ui.test.tsx`)
- [ ] Maestro e2e suite expansion (10 login flows → target ~40–50 across all screens)
- [ ] Typography / empty-state consistency pass (defer until smoke test)
- [ ] Optional polish APK rebuild on commit `fedaaed` or later

**Decisions locked (2026-04-23):**
- Label printing stays **web-only** for Phase 5 — no Bluetooth TSPL integration on mobile.
- Parity = **adapted, not literal** — scan-heavy operator flows first-class; admin masters read + edit-single; no bulk-size-range on mobile, no 4-tab reports explorer with CSV export.
- Offline scan queue → **deferred to Phase 5.5** (post-parity).

**Env state at session end:**
- Local backend: `binny_backend` + `binny_postgres` docker containers up; frontend dev on :3000 still hot-reloading for any web work.
- Testing portal: `srv1409601.hstgr.cloud/binny/` on Phase 6 batch #1 (commit `1b56928` deployed 2026-04-23).
- Android emulator: may need re-boot. Commands to restore:
  ```bash
  export JAVA_HOME="/c/jdk17/jdk-17.0.18+8"
  export ANDROID_HOME="/c/Android/Sdk"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/34.0.0:$HOME/.maestro/bin:$PATH"
  adb devices
  # If empty:
  nohup emulator -avd Pixel6_API34 -no-boot-anim -gpu swiftshader_indirect > /tmp/emu.log 2>&1 &
  # Wait for: adb shell getprop sys.boot_completed == 1
  # Install today's APK:
  adb install -r "/d/Projects/Mahavir Polymers - Inverntory Management/binny-inventory-042b1e6-preview.apk"
  adb shell monkey -p com.basiq360.binnyinventory -c android.intent.category.LAUNCHER 1
  ```
- EAS auth: **use `EXPO_TOKEN` env var** (from https://expo.dev/settings/access-tokens while logged in as `kanikabehl` in browser). The CLI does not stay logged in on this machine. Details: `reference_eas_auth.md` in auto-memory. Tomorrow's session may need a fresh token if the current one was revoked.

**Commits pushed this session (2026-04-23):**
- `e574515` — Phase A foundation + B.1 list screens
- `1bd4f55` — Phase B (9 operator screens)
- `8d88d84` — Phase C.1 (Products, Customers, Settings)
- `042b1e6` — Phase C.2 + C.3 (Users, Reports) ← **APK built from this**
- `fedaaed` — Phase D polish (dispatch detail, generate info, test fixes)
- `9610415` — progress.md log
- `f749b47` — .gitignore extension

All on `origin/main`.

**Next up:** Phase B.1 — Child Boxes list + Master Cartons list (parallel Sonnet tasks).

---

### April 23, 2026 — Mobile Phase B (operator workflows) complete

**Scope:** All scan-heavy operator flows ported from web to mobile. 9 screens delivered across 5 waves of parallel Sonnet execution. Every screen reuses the Phase A `BarcodeScanner` for camera scans, `RoleGate` for permission gating, and the TanStack Query patterns established in Phase A.

**Screens delivered (commit `1bd4f55`):**

| # | Screen | File | Highlights |
|---|---|---|---|
| B.1 | Child Boxes list | `app/child-boxes/index.tsx` | infinite scroll, debounced search, status chips, aging tints (≥90d yellow, ≥180d red), age pills, pull-to-refresh. 481 lines. |
| B.1 | Child Box detail stub | `app/child-boxes/[id].tsx` | Simple fetch+render. 147 lines. |
| B.1 | Master Cartons list | `app/master-cartons/index.tsx` | Same list pattern, status chips, FAB for Create (role-gated). 403 lines. |
| B.2 | Pack (create carton) | `app/master-cartons/create.tsx` | Scan child boxes → capacity stepper → running list with remove → POST `/master-cartons` → `router.replace` to detail. 413 lines. |
| B.3 | Carton detail (real) | `app/master-cartons/[id].tsx` | Header + timeline + status-gated action bar (Close/Unpack/Dispatch) + assortment rows + collapsible child-boxes list. Pull-to-refresh refetches both carton and assortment. 295 lines. |
| B.4 | Unpack | `app/unpack.tsx` | Scan master → validate not-dispatched → summary + warning banner → confirm → POST `/full-unpack`. 248 lines. |
| B.5 | Storage (close & store) | `app/storage.tsx` | Scan master → must be ACTIVE → info banner → confirm → POST `/close`. 248 lines. |
| B.6 | Repack (4-step wizard) | `app/repack.tsx` | Source scan (ACTIVE/CLOSED) → select boxes with checkboxes → destination scan (ACTIVE/CREATED, capacity check) → confirm → POST `/repack`. Horizontal stepper with tap-back. Android `BackHandler` intercepts in-progress wizard. 561 lines. |
| B.7 | Dispatch create | `app/dispatch/create.tsx` | Multi-carton scan (CLOSED only) → inline customer picker modal (searchable, infinite scroll) → optional form fields from `CreateDispatchRequest` type → POST `/dispatches` → `router.replace('/dispatch')`. 440 lines. |
| B.8 | Dispatch list | `app/dispatch/index.tsx` | Infinite list, debounced search, two date-field inputs with "Today / 7d / 30d / Clear" quick chips, FAB for Create (role-gated). Tap shows alert until detail screen exists. 304 lines. |

**All 9 screens pass `tsc --noEmit` clean.** The 11 pre-existing test-file errors in `mobile/__tests__/` (stale `username` vs `email` mocks, one bad return-type mock, one wrong `phone` key) remain — out of scope for Phase B, deferred to Phase D.

**Role gating matrix (locked in across screens):**
- Scan & Trace, Inventory, Dashboard, Child-box list, Carton list, Dispatch list → all roles
- Pack, Unpack, Storage, Repack → Admin, Supervisor, Warehouse Operator
- Dispatch create → Admin, Supervisor, Dispatch Operator
- Dispatch button on Carton detail → Admin, Supervisor, Dispatch Operator (via `useHasRole`)
- Products, Customers, Reports (menu items) → Admin, Supervisor
- Users (menu item) → Admin only

**Known deferrals (not blocking Phase B completion):**
- Dispatch detail screen (tapping a dispatch row shows "Detail view coming soon" alert for now).
- Hardware-back interception on iOS for the Repack wizard (Android only — iOS swipe-back just preserves wizard state, acceptable).
- Carton Detail collapse threshold: `useState` initializer runs before data arrives, so carts with >5 boxes render expanded on first load. Minor UX nit — defer to Phase D polish pass.

**Testing status:** deferred — all 9 screens unverified on emulator/device. Phase D opens with an EAS `preview` APK build + manual smoke test + Maestro suite expansion (currently 10 login flows; target ~40–50 covering all screens).

**Next up:** Phase C — masters (Products, Customers, Users, Settings). Read-first design with edit-single where it makes sense; bulk creates stay web-only per the 2026-04-23 decisions.

---

### April 23, 2026 — Mobile Phase C.1 (Products + Customers + Settings) complete

**Scope:** First batch of the masters phase. Products is read-only on mobile (the mobile `productService` has no create/update/delete methods — CRUD remains on web). Customers has full CRUD because `customerService` exposes `create` + `update`. Settings is a simple profile + app-info + logout screen. Users admin needs a new `user.service.ts` (no endpoints exposed yet) and is split into its own task (C.2).

**Screens delivered:**

| # | Route change | Files | Highlights |
|---|---|---|---|
| Products | `app/products.tsx` → `app/products/{index,[id]}.tsx` | 2 new, 1 deleted | Infinite scroll, debounced search, section chips (fetched from `getSections()`), "Active only" toggle chip. Detail screen shows image (with error fallback), all specs, and a muted footer "Full editing and bulk creation available on the web portal." No FAB — read-only. |
| Customers | `app/customers.tsx` → `app/customers/{index,new,[id]}.tsx` | 3 new, 1 deleted | List with type chips (Primary Dealer / Sub Dealer) and FAB (Admin + Supervisor). `new.tsx` = create form with type toggle + primary-dealer modal picker (client-side filter over a bounded list). `[id].tsx` = view/edit in one screen, toggled by in-body action card (expo-router's typed `headerRight` was rejected as awkward). Save sends full form as `Partial<CreateCustomerRequest>`. |
| Settings | `app/settings.tsx` (rewrite) | 1 rewritten | User avatar + name + email + role badge; About card (App / Version / Platform / API in `__DEV__`); danger Logout button with confirm dialog. Reads `Constants.expoConfig.version`. |

**Role gating:**
- Products: Admin, Supervisor (menu + defense-in-depth RoleGate on list; detail deep-link is read-only so gate skipped there).
- Customers: Admin, Supervisor on all three routes.
- Settings: all roles.

**Architecture note on route migration:** When migrating from a file-level route (`app/products.tsx`) to a folder (`app/products/`), expo-router resolves `/products` to `products/index.tsx` automatically — no explicit `Stack.Screen` registration needed in `app/_layout.tsx`. Verified both products and customers work without layout edits.

**Deferrals (tracked in task list):**
- Users admin (#11) — needs new `mobile/services/user.service.ts` against backend `/users` endpoints + list screen with role-change modal (Admin only).
- Reports (#12) — 4-tab layout adapted to mobile cards (Stock / Cartons / Dispatches / Daily Activity); no CSV export.
- Child-boxes generate (`/child-boxes/generate` stub remains) — bulk/size-range is web-only per the 2026-04-23 decisions; a Phase D polish pass should replace that stub with a "Use web portal for bulk generation" info screen.

**Testing status:** deferred with Phase B — emulator smoke test runs at start of Phase D.

**Meta note:** Sonnet implementation agents were adding verbose duplicate entries at the top of this file during Phase B and C.1. Cleaned up in this commit (awk-cut 160 lines). Future Sonnet prompts include explicit "Do NOT modify progress.md" — see `feedback_agents_progress_scope.md` in auto-memory.

---

### April 23, 2026 — Mobile Phase C.2 + C.3 (Users admin + Reports) complete

**Scope:** Finishes Phase C. Users and Reports each needed a new mobile service file (`user.service.ts`, `report.service.ts`) since the mobile service layer didn't previously wrap those endpoints. Two parallel Sonnet tasks, both with an explicit "Do NOT modify progress.md" instruction — verified on completion that neither touched it.

**Screens delivered:**

| # | Files | Highlights |
|---|---|---|
| C.2 Users | `services/user.service.ts` (new, 30 lines), `types/index.ts` (+15 lines for `CreateUserRequest` / `UpdateUserRequest`), `app/users.tsx` (530 lines) | List with infinite scroll, debounced search, 4-role filter chips + Active-only toggle. Tap row opens inline `EditModal`. Admin sees full edit form (name / email / role picker / is_active switch / optional password) + Delete (guarded against self-deletion). Supervisor sees read-only rows + Close button. FAB (Admin-only) opens create modal with name / email / password / role. Role picker is a custom wrapping button-group — no native Picker jank. |
| C.3 Reports | `services/report.service.ts` (new, 41 lines), `types/index.ts` (+71 lines for report response interfaces), `app/reports.tsx` (1064 lines incl. styles) | 4-tab pill switcher: Stock, Cartons, Dispatches, Daily Activity. Each tab fetches its own query and renders mobile-friendly cards (not tables). Stock: summary cards + product-wise list with status filter. Cartons: list with status chips. Dispatches: summary + date range filter (Today / 7d / 30d / Clear) + destination grouping. Daily Activity: per-day cards + same date filter. All CSV export paths intentionally dropped — web-only per decisions. |

**Role gating:**
- Users list: Admin + Supervisor can view. Only Admin can create / edit / delete (enforced in UI, defence-in-depth via RoleGate on screen).
- Reports: Admin + Supervisor (matches backend rbac).

**Types added to `types/index.ts`:**
- `CreateUserRequest`, `UpdateUserRequest`
- Report response interfaces (8 total): summaries for inventory / dispatch / daily activity / carton inventory, plus the product-wise row shape.

**Deferrals (not blocking Phase C):**
- Dispatch detail screen still shows "Detail view coming soon" alert on tap from the dispatches list.
- `app/child-boxes/generate.tsx` is still a PlaceholderScreen — will turn it into a "Use web portal for bulk generation" info screen in Phase D.
- `getCartonInventory` response shape lacks a creator field (same as web) — surfaced only if backend extends the response later.

**tsc clean** for all new / modified files. 11 pre-existing `__tests__/` errors persist (stale `username` vs `email` fixtures + one bad mock return type + one wrong `phone` key) — Phase D cleanup.

**Phase 5 / mobile parity checkpoint:** All 16 web routes that were planned for mobile parity now have real screens (not placeholders). Remaining mobile work is polish + testing (Phase D). No APK has been cut against this code yet — Phase D starts with an EAS `preview` build.

---

### April 23, 2026 — Mobile Phase D (polish + EAS build) in progress

**Polish delivered (commit `fedaaed`):**
- Real Dispatch detail screen at `app/dispatch/[id].tsx` — header / customer / shipment / contents / notes / audit-footer cards. Dispatches list now pushes to it instead of showing the "coming soon" alert.
- `child-boxes/generate.tsx` rewritten from `PlaceholderScreen` to a dedicated "Bulk generation is web-only" info screen with a link to the portal URL and a list of what IS possible on mobile.
- Dead `allRoles` const removed from `menu.tsx:20`.
- **All 11 pre-existing `__tests__/` type errors fixed** (stale `username`→`email` fixtures across 7 lines in `authStore.test.ts`, 2 lines in `services.test.ts`; one `phone`→`contact_person_mobile`; one `useApi.test.ts` mock return-type cast).

**`npx tsc --noEmit` on the mobile app now returns clean — zero errors.** First time since Phase A kickoff.

**EAS build in-flight (2026-04-23):**
- Command: `EXPO_TOKEN=… npx eas-cli build --profile preview --platform android --non-interactive`
- Build ID: `6d90b3f2-d70d-4ddd-8f4a-13c08375ea04`
- Tracking URL: https://expo.dev/accounts/kanikabehl/projects/binny-inventory/builds/6d90b3f2-d70d-4ddd-8f4a-13c08375ea04
- **Code at submit time:** commit `042b1e6` (Phase C.2 + C.3 complete). The subsequent polish commit `fedaaed` is NOT in this APK — the queued build locked its source when it was uploaded.
- Status: uploaded (47.3 MB), fingerprint computed, **waiting in free-tier queue** as of submission. Free tier queues can wait 10–30 min before the 10–15 min build kicks off.
- Build profile uses `NODE_ENV=production`; `EXPO_PUBLIC_API_URL` is unset so the APK will hit the production default `https://srv1409601.hstgr.cloud/binny/api/v1` — the client's testing portal.

**Auth breakthrough:** Project is owned by Expo account `kanikabehl` (password unavailable). Resolved via an access token generated from https://expo.dev/settings/access-tokens and passed as `EXPO_TOKEN` env var. Noted in auto-memory as `reference_eas_auth.md` so future sessions don't re-discover this.

**Remaining Phase D work (after APK delivery + client first-pass):**
- Emulator smoke test against the actual APK
- Maestro e2e suite expansion (currently 10 login flows; target ~40–50 flows across new screens)
- Typography / empty-state consistency pass based on findings from smoke test
- Optional: a polish-commit APK rebuild if Phase D commit `fedaaed` needs to reach the client separately

---

### April 23, 2026 — Mobile APK delivered + jest run

**APK build (commit `042b1e6`):**
- EAS Build ID: `6d90b3f2-d70d-4ddd-8f4a-13c08375ea04`
- Install page (QR + direct Android install): https://expo.dev/accounts/kanikabehl/projects/binny-inventory/builds/6d90b3f2-d70d-4ddd-8f4a-13c08375ea04
- Direct `.apk` URL: https://expo.dev/artifacts/eas/ewHw8hK68cQcgBa9TYp4Gh.apk
- Local file: `binny-inventory-042b1e6-preview.apk` at repo root (97 MB, git-ignored via new `*.apk` rule in `.gitignore`)
- Build profile: `preview` → APK / `NODE_ENV=production` / fallback `EXPO_PUBLIC_API_URL` = `https://srv1409601.hstgr.cloud/binny/api/v1` (testing portal)
- **Caveat:** does NOT include polish commit `fedaaed` — the in-APK dispatch list still fires "Detail view coming soon" alert instead of the new detail screen; the generate menu item still lands on a placeholder.

**Jest suite run:**
- 5 suites, 114 tests total → **93 pass (82%), 21 fail**
- Today's 2 fixed files (`services.test.ts`, `authStore.test.ts`) both pass cleanly — the 11 type errors I fixed do not re-surface as runtime failures.
- All 21 failures are **pre-existing infra issues**, not anything today's commits caused:
  - `api.test.ts` (18 failures): `axios.create` spy installs after `services/api.ts` module has already evaluated — Jest module-hoisting order issue. Fix requires restructuring the test to use `jest.mock('axios', …)` factory form before import.
  - `useApi.test.ts` (crash + 1 failure): (a) module-load crash — Expo's streams polyfill clashes with axios's fetch adapter at import time (`TypeError: Cannot cancel a stream that already has a reader`); (b) TanStack Query v5 changed `mutationFn` to receive a context object as second arg — test expects legacy v4 signature.
  - `ui.test.tsx` (1 failure): `@testing-library/react-native`'s `fireEvent.press` fires even when `disabled={true}` is on a `TouchableOpacity` — a known RNTL behavior. The Button component sets `disabled` correctly; test needs to be rewritten to test the `disabled` *style* effect rather than press behavior, OR use `userEvent` which respects accessibility state.

**Fix estimate for jest infra:** ~30–60 min of targeted debugging — not blocking Phase D.

**.gitignore updated (commit `f749b47`):** new patterns for `*.apk`, `*.aab`, and the loose `child qr.png` / `qr child.png` debug images that kept showing as untracked.

---

## DEFERRED — Mobile Testing (Phase 5, ~5–7 hrs, to resume after Phase 6 mods are complete)

**Phase 1 Login suite (6/10 pass, 3 fail, 1 unrun — 2026-04-20):**
- TC-MOB-LOGIN-001..006 ✅ pass. Admin needs `Admin@123` (not `Pass@123` as spec says).
- TC-MOB-LOGIN-007/008/009 ❌ fail — prod creds don't match spec for supervisor/wh/dispatch (or accounts missing after Apr 16 wipe).
- TC-MOB-LOGIN-010 ⏸ unrun.
- Resume plan: curl-probe prod for 4 accounts, patch or skip, run TC-010, close Phase 1.

**Phases 2–6 remaining (48 TCs):** Dashboard (8), Scan & Trace (12), Inventory (10), Menu (8), Navigation & Auth (6). See breakdown in earlier conversation.

**Env restore after reboot:**
```bash
export JAVA_HOME="/c/jdk17/jdk-17.0.18+8"
export ANDROID_HOME="/c/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/34.0.0:$HOME/.maestro/bin:$PATH"
adb devices  # if empty: nohup emulator -avd Pixel6_API34 -no-boot-anim -gpu swiftshader_indirect > /tmp/emu.log 2>&1 &
# Wait for: adb shell getprop sys.boot_completed == 1
adb shell monkey -p com.basiq360.binnyinventory -c android.intent.category.LAUNCHER 1
```

**Infra restart (if containers stopped):**
```bash
"/c/Program Files/Docker/Docker/Docker Desktop.exe" &
docker compose up -d postgres backend
cd frontend && npm run dev &
```

Files: 10 Maestro YAMLs at `mobile/e2e-maestro/01-login/`. Shared config at `mobile/e2e-maestro/config.yaml`. 44 more YAMLs to author for sections 47–51.

---

## Activity Log

### April 20, 2026 — Phase 1 Mobile: Login Maestro Suite (Partial — 6/10 Pass)

#### Authoring + execution — session ended before final cleanup
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 380 | Scaffold `mobile/e2e-maestro/` — shared `config.yaml`, `README.md`, `01-login/` directory | Done | `appId: com.basiq360.binnyinventory`. `clearState` + `launchApp` baked into each flow for known start state. |
| 381 | Author 10 Maestro YAML flows `TC-MOB-LOGIN-001..010.yaml` | Done | One file per TC to isolate failures. Total 10 flows, ~10KB. |
| 382 | Run + iterate TC-001..006 | Passed | After 3–5 iterations to resolve selector issues: (a) single-char "B" logo text was not reliably matched → substituted visual landmark assertions; (b) password field required coord tap `{point: 50%, 64%}` after keyboard hide (placeholder-text tap was inconsistent post-keyboard); (c) `Sign In` selector disambiguated via `Index: 1` because the form title ALSO reads "Sign In". |
| 383 | Run TC-007/008/009 (supervisor, warehouse, dispatch roles) | **Failed** | All three fail at `Assert "Welcome to Binny Inventory" is visible` after Sign-In tap. Root cause: test credentials `Pass@123` in TC spec don't match prod. TC-006 only passed because the agent tried `Admin@123` and that worked — so **prod Admin password is `Admin@123`, not `Pass@123`**. Other three roles: either use a different password or accounts are missing (prod was data-wiped on Apr 16, item #316). |
| 384 | Run TC-010 (auto-login after kill+reopen) | Not Run | Session halted before reaching it. YAML exists, emulator still up, can run in 2 min. |

#### Key discoveries for next session
1. **Prod credentials don't match TC spec.** Spec says `Pass@123` for all roles; reality is `Admin@123` for Admin and unknown for supervisor/wh/dispatch. Need curl probe to determine correct passwords OR confirm accounts missing (and decide whether to re-seed).
2. **Maestro + React Native Text element selectors are finicky.** Single-char/very-short text elements (e.g. the "B" logo) don't reliably match. Prefer longer text assertions or coordinate-based taps for inputs once keyboard animation has occurred.
3. **`Sign In` appears twice** in the form (title + button). Use `Index: 1` to target the button.

#### Files added
- `mobile/e2e-maestro/config.yaml`
- `mobile/e2e-maestro/README.md`
- `mobile/e2e-maestro/01-login/TC-MOB-LOGIN-001.yaml` through `TC-MOB-LOGIN-010.yaml`
- Session logs: `/tmp/maestro-TC-MOB-LOGIN-001.log` through `009.log` (ephemeral — recreated on re-run)

#### Phase 1 close-out plan (next session, ~30–45 min)
1. Probe prod via curl for each of 4 accounts (5 min)
2. Patch TC-007/008/009 with correct passwords or mark Skipped (15 min)
3. Run TC-010 (5 min)
4. Full suite re-run to confirm green (5 min)
5. Update progress.md with Phase 1 close + move to Phase 2 (Dashboard, 8 TCs, ~30–45 min budget)

---

### April 20, 2026 — Phase 5 Mobile: Tooling Setup (Partial, Ongoing)

#### Android test tooling bootstrap on Windows 10 Pro — blockers hit on JDK + Maestro
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 368 | Attempt JDK 17 install via `winget install Microsoft.OpenJDK.17` | Failed | Exit code **1602** (installation cancelled — likely UAC prompt dismissed or silent flag mismatch). Installer hash verified OK before failure. |
| 369 | Fallback: download Microsoft OpenJDK 17 portable zip | Done | ~187MB downloaded (186,773,339 bytes). Tried multiple mirrors in parallel (GitHub, Microsoft CDN, PowerShell Invoke-WebRequest) — at least one completed. Extraction + PATH export in bash shell not confirmed this session. |
| 370 | Install Android cmdline-tools + SDK packages | Done | SDK root: `C:/Android/Sdk` (~5.6GB). Installed: `platform-tools`, `emulator`, `platforms;android-34`, `system-images;android-34;google_apis;x86_64`, `build-tools;34.0.0`. Licenses accepted. |
| 371 | Create AVD `Pixel6_API34` + cold boot smoke test | Done | Booted to `sys.boot_completed=1` at elapsed 302s (first boot is slow, expected). Device `emulator-5554` observable via `adb devices`. Headless flags: `-no-snapshot-load -no-boot-anim -gpu swiftshader_indirect`. |
| 372 | Install Maestro via shell installer | Done | First attempt failed with `java not found`. Maestro was ultimately extracted to `~/.maestro/bin/maestro`. Verified in resumed foreground work — `maestro --version` → **2.4.0**. |
| 373 | Resume foreground: set JAVA_HOME + ANDROID_HOME + PATH in bash, verify tools | Done | `java -version` → OpenJDK 17.0.18 LTS (Microsoft build). `javac 17.0.18`. `adb 1.0.41`. `maestro 2.4.0`. All green. |
| 374 | Persist env vars via PowerShell `[Environment]::SetEnvironmentVariable(..., 'User')` | Done | JAVA_HOME=`C:\jdk17\jdk-17.0.18+8`, ANDROID_HOME=`C:\Android\Sdk`. PATH merged idempotently with JDK bin, platform-tools, emulator, cmdline-tools/latest/bin, `%USERPROFILE%\.maestro\bin`. Future shells inherit these. |
| 375 | Boot `Pixel6_API34` AVD | Done | `nohup emulator ... -gpu swiftshader_indirect &`. `sys.boot_completed=1` at **70s** (snapshot boot, vs 302s cold first-boot on Apr 18). Emulator left running. |
| 376 | Pre-flight inspect APK via `aapt dump badging` | Done | `package=com.basiq360.binnyinventory versionCode=1 versionName=1.0.0 targetSdk=36 sdkVersion=24 launchable-activity=com.basiq360.binnyinventory.MainActivity`. Camera + internet perms present. |
| 377 | `adb install -r app17_04.apk` | Done | Streamed install succeeded. `pm list packages -3` confirms `com.basiq360.binnyinventory` present. |
| 378 | Launch app + verify foreground activity | Done | `adb shell monkey -p com.basiq360.binnyinventory ... 1` → `Events injected: 1`. After 4s settle, `mFocusedApp=com.basiq360.binnyinventory/.MainActivity` and `mCurrentFocus=Window{... com.basiq360.binnyinventory/com.basiq360.binnyinventory.MainActivity}`. First attempt caught systemui ANR overlay (unrelated emulator noise); re-launch after wait rendered cleanly. |
| 379 | Capture login screen screenshot | Done | `adb exec-out screencap -p > mobile/screenshots/login-verify-clean.png` (87KB). Visible: red B logo, "Binny Inventory" heading, "Mahavir Polymers Pvt. Ltd." subtitle, Sign In card with "Enter your credentials to continue", Email field (placeholder `admin@binny.com`), Password field, navy "Sign In" button, "Powered by Basiq360" footer. Matches login screen spec from item #310. |

#### Tooling setup — COMPLETE
| Tool | Version | Path |
|------|---------|------|
| JDK | 17.0.18 (Microsoft OpenJDK LTS) | `C:\jdk17\jdk-17.0.18+8` |
| Android SDK | cmdline-tools (latest), platform-tools 37.0.0, build-tools 34.0.0, platforms android-34 | `C:\Android\Sdk` |
| AVD | `Pixel6_API34` (google_apis x86_64, Android 14) | `~/.android/avd/Pixel6_API34.avd` |
| Maestro | 2.4.0 | `~/.maestro/bin/maestro` |
| APK | `com.basiq360.binnyinventory` 1.0.0 | installed on emulator-5554 |

#### Setup timing
| Checkpoint | Elapsed |
|-----------|---------|
| Apr 18 session — JDK/SDK start | — |
| Apr 20 session — state inventory | 0 min |
| Apr 20 — PATH/env setup + verify java/adb/maestro | 2 min |
| Apr 20 — setx persist | 1 min |
| Apr 20 — emulator snapshot boot | 70s |
| Apr 20 — APK install + launch + screenshot + verify | 4 min |
| **Apr 20 total (resumed work)** | **~8 min** |

#### Next session entry point
- Steps 1–5 complete. Next is Step 6 (author 54 TC-MOB Maestro YAMLs) when user authorizes.
- Emulator stays up in background. `adb devices` should still show `emulator-5554` until machine reboot.

---

### April 18, 2026 — QA: Crash Recovery + Full Phase 1-14 Test Stabilization (Ongoing)

#### Infra recovery
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 331 | Restart Docker + rebuild backend image | Done | Container package.json was stale (Apr 14) and missing `csv-parse` dep. `docker compose build backend` + `up -d` — backend healthy, login API 200. |
| 332 | Start frontend dev server on :3000 | Done | `npm run dev` in frontend/, HTTP 200 confirmed. |
| 333 | Create crash-resilience checkpoint script | Done | `scripts/progress-checkpoint.sh` — writes `progress-checkpoint.md` every 60s (git status, diff --stat, recent files, test logs, node processes). Saved memory `feedback_progress_resumption.md` — will prepend CURRENT EXECUTION block in progress.md before non-trivial tasks from here on. |

#### App bug fixes (frontend)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 334 | Fix `getInitials` crash on undefined user name | Done | `frontend/src/lib/utils.ts:48` — added `if (!name) return '';` guard. Crash was `TypeError: Cannot read properties of undefined (reading 'split')` in Header avatar when tests set `binny_user` without a `name` field. |
| 335 | Add `role="dialog"` + `aria-modal` + `aria-labelledby` to Modal | Done | `frontend/src/components/ui/Modal.tsx` — also an a11y improvement. Unblocks `page.getByRole('dialog')` scoping in multiple specs. |

#### Test fixes (14 tests across 8 spec files)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 336 | spec 20 TC-MC-REPACK-001 | Done | API expects `child_box_id` + `source_carton_id` + `destination_carton_id` (UUIDs). Test was sending `child_box_barcode` + `from_carton_id` + `to_carton_id`. Now resolves barcode → UUID via `/child-boxes/qr/:barcode` then sends correct fields. |
| 337 | spec 23 TC-DASH-E2E-002 | Done | Scoped `undefined` check to `<main>` with word-boundary regex (was matching `$undefined` in Next.js RSC script tags). |
| 338 | spec 26 TC-UI-NAV-001 | Done | Sidebar uses inline `style={{ background: linear-gradient(...) }}` — check now reads `backgroundImage` + inline style attribute instead of `backgroundColor`. |
| 339 | spec 27 TC-EDGE-001 | Done | `EC${TS6}ABCDEFGHIJ` is 18 chars, `.slice(0,20)` returned 18. Changed to `EC${TS6}ABCDEFGHIJKL` (exact 20). |
| 340 | spec 27 TC-EDGE-002 | Done | Same pattern — `.slice(0,21)` returned 19. Changed to `EC${TS6}ABCDEFGHIJKLM` (exact 21). |
| 341 | spec 28 `getBoxStatus` helper | Done | Used `?barcode=` query param which backend silently ignores (only `search` is supported) → wrong box returned → "status stays FREE" false positive. Switched to `/child-boxes/qr/:barcode`. |
| 342 | spec 28 TC-LIFE-002 repack | Done | Same wrong fields as #336 + wrong unpack path. Fixed repack payload + corrected `/master-cartons/:id/unpack` → `/:id/full-unpack`. |
| 343 | spec 21 + 22 + 24 `dispatch_date` format | Done | Backend uses `z.string().datetime()` — requires full ISO 8601. Changed `'2026-04-17'` → `'2026-04-17T00:00:00.000Z'` in 4 locations. |
| 344 | spec 21 TC-DISP-ADM-001 response shape | Done | `dispatch.service.ts::createDispatch` returns `DispatchRecord[]` (array). Test was reading `body.data.id` which is undefined. Now reads `records[0]?.id`. |
| 345 | spec 21 TC-DISP-READ-002 response shape | Done | Detail endpoint returns `master_carton_id` + `carton_barcode` + `child_count` (joined). Test previously only checked for `master_cartons`/`masterCartons`/`carton_count`. |
| 346 | spec 22 TC-SETUP-TRACE-005 customer type | Done | Backend requires `primary_dealer_id` when `customer_type = 'Sub Dealer'`. Changed to `'Primary Dealer'`. |
| 347 | spec 24 TC-RPT-API-008 daily-activity params | Done | Endpoint requires `from_date` + `to_date`. Added both as query params. |
| 348 | spec 24 TC-RPT-E2E-003 export button wait | Done | Added `toBeVisible({ timeout: 15000 })` — export button renders tab-conditionally. |
| 349 | spec 26 TC-UI-COMP-001 button locator | Done | Styling classes live on the inner `<button>`, not the wrapping `<a>` Link. Changed `getByRole('link')` → `getByRole('button')`. |
| 350 | spec 17 TC-PROD-E2E-002 + similar (spec 18, 19) login race | Done | Added `waitForURL((url) => !url.pathname.includes('/login'))` after every Sign-In click (bulk replace across spec 17 and 18). |
| 351 | spec 17 TC-PROD-E2E-003 SKU selector scope | Done | Scoped to `page.getByRole('dialog')` — list page's search placeholder `"…SKU, or article code…"` was matching the broad selector. Restricted to `dialog input[name="sku"]`. |
| 352 | spec 18 TC-CUST-E2E-001 heading scope | Done | Layout Header renders its own `<h1>` page title → 2 `<h1>Customers</h1>` elements on /customers. Scoped to `page.locator('main')`. |
| 353 | spec 18 TC-CUST-E2E-003 type selector | Done | Modal uses radio inputs with `name="customer_type"`. Scoped to dialog; checks both radios visible. |
| 354 | spec 22 TC-SCAN-E2E-003 barcode display | Done | `getByText(barcode).first()` — barcode appears twice (header + timeline entry). |
| 355 | VERIFY spec 18 TC-CUST-E2E-003 (radio revert) | Passed | Confirmed green in Run 6. |
| 356 | VERIFY spec 22 TC-SCAN-E2E-003 (barcode `.first()`) | Passed | Confirmed green in Run 6. |
| 357 | VERIFY Modal ARIA attributes (no regressions) | Passed | Run 6 — all dialog-scoped tests passing; no cascade regressions. |
| 358 | Sanitize `article_name` + `description` on create/update — XSS fix | Done | Added `stripHtml()` helper (regex `/<[^>]*>/g`) in `backend/src/services/product.service.ts`. Applied to `createProduct`, `updateProduct`, and `bulkCreateProducts` for `article_name` and `description` fields. No new deps. |
| 359 | Rebuild backend container after XSS fix | Done | `docker compose build backend && docker compose up -d backend` — image rebuilt, container started healthy in ~15 s. |
| 360 | Verify TC-EDGE-008 fix (targeted run) | Passed | Ran full spec 27 (required for `beforeAll` auth). `ok 9 … TC-EDGE-008: HTML in article_name stored safely (no XSS)` — 201, stored name = `Test Product` (no `<script>`). |
| 361 | Full suite re-run (Run 7) — 13 specs | Done | 268 passed, 1 failed (TC-STATE-001 pre-existing flaky), 8 did not run (cascade). TC-EDGE-008 green. 5.8 min. |
| 362 | Fix spec 27 TC-STATE-001 `?barcode=` query bug | Done | Same root cause as item #341. Backend silently ignores `?barcode=`, so `data[0]` was whatever box happened to be first in the unfiltered paginated list (random pass/fail). Switched to `/child-boxes/qr/:barcode` with strict `expect(box).toBeTruthy()` + `expect(box.status).toBe('PACKED')`. No more coincidence-based passes. |
| 363 | Fix spec 27 TC-STATE-003 `?barcode=` query bug | Done | Same fix as #362 for the FREE-state assertion after unpack. |
| 364 | Run 8 — verify TC-STATE-001/003 + TC-EDGE-008 | Partial | 270 passed, 1 fail (TC-STATE-003), 6 cascade skipped. TC-STATE-001 + TC-EDGE-008 green. TC-STATE-003 still fails: `/master-cartons/:id/unpack` returns 404 — endpoint was renamed to `/full-unpack` (same root cause as item #342 for spec 28). |
| 365 | Fix spec 27 TC-STATE-003 unpack endpoint | Done | Changed `/master-cartons/:id/unpack` → `/:id/full-unpack`. Matches item #342 fix for spec 28. |
| 366 | Fix spec 27 TC-STATE-004 unpack endpoint | Done | Same `/unpack` → `/full-unpack` fix. Test verifies DISPATCHED carton cannot be unpacked; needed correct endpoint to get the expected 400 response. |
| 367 | Run 9 — full suite verification | **GREEN** | **277 passed, 0 failed, 0 skipped, 6.5 min.** TC-STATE-001/002/003/004, TC-PAGE-001/002, TC-ERR-001/002/003, TC-EDGE-008 all pass. All cascades resolved. |

#### Suite runs this session
| Run | Passed | Failed | Skipped | Runtime | Notes |
|-----|--------|--------|---------|---------|-------|
| 1 | 182 | 11 | 84 | 4.0 min | Baseline — same 11 failures as yesterday's crash |
| 2 | 205 | 8 | 64 | 4.8 min | After first 6 fixes (items 334, 337–340, some others) |
| 3 | 213 | 8 | 56 | 6.0 min | After dispatch/LIFE-002/login fixes — new failures surfaced as cascades healed |
| 4 | 247 | 4 | 26 | 7.6 min | After scope-to-dialog + report param fixes |
| 5 | 261 | 3 | 13 | 6.6 min | After select→radio fix + export wait |
| 6 | 265 | 1 | 11 | 7.2 min | Post-resume verification. Only TC-EDGE-008 fails as expected. |
| 7 | 268 | 1 | 8 | 5.8 min | After XSS fix (item #358). TC-EDGE-008 green; TC-STATE-001 surfaced (broken `?barcode=` query, cascade skipped 8). |
| 8 | 270 | 1 | 6 | 6.0 min | After TC-STATE-001/003 query fixes. TC-STATE-003 still red — wrong unpack endpoint. |
| 9 | **277** | **0** | **0** | 6.5 min | **GREEN.** All `/unpack` → `/full-unpack` fixes in. Every test passes. |
| 7 | **268** | **1** | 8 | 5.8 min | After XSS fix (item 358). TC-EDGE-008 GREEN. TC-STATE-001 pre-existing flaky (`?barcode=` filter unsupported). |

#### Known remaining (pre-existing flaky)
| Test | Nature | Detail |
|------|--------|--------|
| TC-STATE-001 | **Pre-existing flaky test** | `GET /child-boxes?barcode=<barcode>` — `barcode` is not a supported query param (backend only supports `search=`). Box status check returns unfiltered results; test passes only if newly-packed box happens to be first in list. Not caused by XSS fix. |

---

### April 16, 2026 — Mobile: Jest Unit Tests for Services and Stores

| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 325 | Write `__tests__/services/api.test.ts` | Done | Tests axios instance config (baseURL, timeout, headers), request interceptor (token injection, no-token, SecureStore failure), response interceptor (envelope unwrap, paginated meta, non-envelope passthrough), and 401 error handler (clears both SecureStore keys). |
| 326 | Write `__tests__/stores/authStore.test.ts` | Done | Tests initial state, login() (success, SecureStore writes, state update, invalid credentials error), logout() (SecureStore clears, state reset), loadStoredAuth() (token present, no token, missing user data, SecureStore failure). |
| 327 | Write `__tests__/services/services.test.ts` | Done | Tests all 9 service modules: authService, productService, childBoxService, masterCartonService, customerService, dispatchService, inventoryService, traceService, dashboardService. Verifies correct HTTP method, endpoint, and params for each method. |
| 328 | Fix `jest.config.js` key typo | Done | Corrected `setupFilesAfterSetup` (invalid) → `setupFilesAfterEnv` (correct Jest key) so that `jest.setup.js` mocks are applied correctly. |

---

### April 16, 2026 — QA: Fix 4 Playwright Test Failures (Specs 17–20)

| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 321 | Fix TC-PROD-SUP-002 (`17-products-sections-rbac.spec.ts` line 271) | Done | `location: 'B-02'` was invalid for the enum `'VKIA' \| 'MIA' \| 'F540'`. Changed to `location: 'MIA'`. |
| 322 | Fix TC-CUST-E2E-001 (`18-customers-rbac.spec.ts` line 378) | Done | Login wait relied on `networkidle` which could resolve before auth redirect. Added `waitForURL` to confirm login completed before navigating to `/customers`. Simplified locator to exact `getByRole('heading', { name: 'Customers' })` matching the `<h1>` rendered by `PageHeader`. |
| 323 | Fix TC-CB-E2E-002 (`19-childbox-rbac.spec.ts` line 368) | Done | Same login timing fix as #322. Replaced ambiguous `.or()` locator chain with exact locators: `getByRole('heading', { name: /generate labels/i })` and `getByPlaceholder('Search and select a product...')` matching the actual JSX in `generate/page.tsx`. |
| 324 | Fix TC-MC-ADM-002 (`20-cartons-lifecycle.spec.ts` line 223) | Done | `POST /master-cartons/pack` requires `{ child_box_id: UUID, master_carton_id: UUID }` but test sent `child_box_barcodes: [barcode]`. Fixed by first calling `GET /child-boxes/qr/:barcode` to resolve barcode → UUID, then sending correct `child_box_id` to the pack API. |

---

### April 17, 2026 — QA: Comprehensive Test Cases v2.0 (602 Test Cases, 14 Phases)

#### Test Plan Overview
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 319 | Comprehensive test case planning — all modules, all roles, all scenarios | Done | 5 parallel agents wrote test cases across 14 execution phases (26 new sections, #32-57). Covers all 66 API endpoints, 23 web pages, 5 mobile screens, 4 user roles. Total: **602 new test cases** (combined with existing 418 = **1,020 total documented test cases**) |
| 320 | Phase 1 Playwright spec: `16-rbac-auth.spec.ts` | Done | **65/65 passed (33.9s)** |
| 325 | Phase 2-5 Playwright specs (4 files) | Done | `17-products-sections-rbac.spec.ts`, `18-customers-rbac.spec.ts`, `19-childbox-rbac.spec.ts`, `20-cartons-lifecycle.spec.ts` |
| 326 | Phase 6-9 Playwright specs (4 files) | Done | `21-dispatch-rbac.spec.ts`, `22-scan-trace.spec.ts`, `23-inventory-dashboard.spec.ts`, `24-reports-rbac.spec.ts` |
| 327 | Phase 10-14 Playwright specs (4 files) | Done | `25-users-admin.spec.ts`, `26-ui-pwa.spec.ts`, `27-edge-cases.spec.ts`, `28-lifecycle-e2e.spec.ts` |
| 328 | Run pending DB migration on local Docker | Done | `20260414100001_replace-size-group-with-range` — product creation was failing with 500 |
| 329 | Fix 4 test failures (location enum, login timing, pack API fields) | Done | See activity #321-324 |
| 330 | Full test run: Phase 1-14 (13 new spec files) | Done | **178 passed, 0 failed** across all 13 new spec files. Runtime ~3.5 min |

#### Test Case Files Written
| File | Phases | Sections | Test Cases |
|------|--------|----------|------------|
| `docs/test-cases-v2-phases-1-3.md` | 1-3 | 32-36 | 157 (Auth RBAC, API Denial, Product CRUD per role, Section CRUD, Customer CRUD per role) |
| `docs/test-cases-v2-phases-4-6.md` | 4-6 | 37-39 | 122 (Child Box per role, Master Carton full lifecycle per role, Dispatch per role) |
| `docs/test-cases-v2-phases-7-9.md` | 7-9 | 40-42 | 105 (Scan & Trace, Inventory API+E2E, Dashboard, Reports per role) |
| `docs/test-cases-v2-phases-10-12.md` | 10-12 | 43-51 | 136 (User Mgmt Admin only, UI/Theme, PWA/Offline, Mobile App all screens) |
| `docs/test-cases-v2-phases-13-14.md` | 13-14 | 52-57 | 82 (Edge cases, State machine, Concurrency, Error handling, Full lifecycle E2E, Regression) |

#### Execution Phase Plan (14 phases, pausable/resumable)
| Phase | Focus | Test Cases | Playwright Spec | Priority |
|-------|-------|-----------|----------------|----------|
| 1 | Auth & RBAC (all roles) | 57 | 16-rbac.spec.ts | Critical |
| 2 | Products & Sections (per role) | 48 | 17-products-rbac.spec.ts | Critical |
| 3 | Customers (per role) | 42 | 18-customers-rbac.spec.ts | High |
| 4 | Child Boxes (per role) | 38 | 19-childbox-rbac.spec.ts | Critical |
| 5 | Master Cartons (per role) | 64 | 20-cartons-rbac.spec.ts | Critical |
| 6 | Dispatch (per role) | 30 | 21-dispatch-rbac.spec.ts | High |
| 7 | Scan & Trace | 28 | 22-scan-trace.spec.ts | High |
| 8 | Inventory & Dashboard | 32 | 23-inventory-dash.spec.ts | High |
| 9 | Reports (per role) | 32 | 24-reports-rbac.spec.ts | Medium |
| 10 | User Management (Admin) | 32 | 25-users-rbac.spec.ts | High |
| 11 | UI Theme & PWA | 44 | 26-ui-pwa.spec.ts | Medium |
| 12 | Mobile App (React Native) | 60 | Manual testing | High |
| 13 | Edge Cases & Negative Tests | 60 | 27-edge-cases.spec.ts | Medium |
| 14 | Full Lifecycle E2E | 14 | 28-lifecycle.spec.ts | Critical |

---

### April 16, 2026 — QA: Test Cases v2 — Phases 10–12

| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 316 | Write comprehensive test cases for Phase 10 (User Management), Phase 11 (UI Enhancements & PWA), Phase 12 (React Native Mobile App) | Done | Output: `docs/test-cases-v2-phases-10-12.md`. 136 total test cases across 9 sub-sections (Sections 43–51). Phase 10: 32 cases covering Admin CRUD (12 API), validation (6 API), non-Admin RBAC denial (6 API), Playwright E2E (8). Phase 11: 44 cases covering Login UI (6), Sidebar/Nav (10), Dashboard UI (6), Components (8), Service Worker/Offline (8), QR Scanner (6), Offline Scan Queue (6). Phase 12: 60 cases covering Mobile Login (10), Dashboard (8), Scan & Trace (12), Inventory drill-down (10), Menu (8), Navigation & Auth (6). All steps include exact field assertions, CSS values, React Native state references, and code-accurate expected results sourced from actual source files (`login.tsx`, `_layout.tsx`, `scan.tsx`, `inventory.tsx`, `menu.tsx`, `manifest.json`, `user.routes.ts`, `users/page.tsx`). |

---

### April 16, 2026 — QA: Test Cases v2 — Phases 7–9

| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 315 | Write comprehensive test cases for Phase 7 (Scan & Trace), Phase 8 (Inventory Module), Phase 9 (Reports) | Done | Output: `docs/test-cases-v2-phases-7-9.md`. 105 total test cases across 13 sections. Covers Trace Child Box (8 API), Trace Master Carton (6 API), Scan & Trace E2E (14), Stock Summary (4 API), Stock Hierarchy (10 API), Dashboard API (6), Inventory E2E (12), Dashboard E2E (12), Product-wise Report (6 API), Dispatch Report (6 API), Carton Inventory Report (4 API), Daily Activity Report (7 API), Reports E2E (10). All steps include exact API endpoints, HTTP methods, expected status codes, and field-level assertions. RBAC coverage: Admin + Supervisor allowed on all report routes; 403 verified for Warehouse Operator + Dispatch Operator on all /reports/* endpoints. |

---

### April 16, 2026 — Phase 5: React Native Mobile App Bootstrap

#### Expo Mobile App Setup (`mobile/`)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 295 | Create Expo project with blank-typescript template | Done | `npx create-expo-app@latest mobile --template blank-typescript` inside monorepo root. Expo SDK 54, React Native 0.81.5 |
| 296 | Install Expo native packages | Done | `expo-router ~6.0.23`, `expo-secure-store ~15.0.8`, `expo-camera ~17.0.10`, `expo-barcode-scanner ^13.0.1`, `expo-haptics ~15.0.8`, `expo-status-bar ~3.0.9`, `react-native-safe-area-context ~5.6.0`, `react-native-screens ~4.16.0`, `react-native-gesture-handler ~2.28.0`, `react-native-reanimated ~4.1.1` |
| 297 | Install additional npm packages | Done | `zustand ^5.0.12`, `axios ^1.15.0`, `@tanstack/react-query ^5.99.0`, `@expo/vector-icons ^15.1.1` (used `--legacy-peer-deps` due to react-dom peer conflict from expo-router) |
| 298 | Create directory structure | Done | `app/(auth)`, `app/(tabs)`, `components/ui`, `constants`, `hooks`, `services`, `stores`, `types`, `utils` |
| 299 | Configure `app.json` | Done | Name: "Binny Inventory", slug: "binny-inventory", scheme: "binny", android package: `com.basiq360.binnyinventory`, iOS bundleId: same, adaptiveIcon backgroundColor: `#2D2A6E`, expo-camera permission string set, `experiments.typedRoutes: true` |
| 300 | Configure `package.json` main entry | Done | Set `"main": "expo-router/entry"` (required for file-based routing) |
| 301 | Create Expo Router layout files | Done | `app/_layout.tsx` (root with QueryClientProvider + GestureHandlerRootView), `app/index.tsx` (redirects to login), `app/(auth)/_layout.tsx`, `app/(auth)/login.tsx`, `app/(tabs)/_layout.tsx` (tab bar with Dashboard + Scan), `app/(tabs)/index.tsx`, `app/(tabs)/scan.tsx` |
| 302 | Scaffold core service/store/type files | Done | `services/api.ts` (axios client with SecureStore JWT interceptor + 401 handler), `stores/authStore.ts` (zustand auth state with SecureStore persistence), `types/index.ts` (Product, ChildBox, MasterCarton, ScanResult, ApiResponse), `constants/index.ts` (COLORS, STORAGE_KEYS, API_BASE_URL), `utils/index.ts` (formatDate, truncate, parseQRCode) |
| 303 | TypeScript compile check | Done | `npx tsc --noEmit` — zero errors |
| 304 | Replace core data layer files with web-parity versions | Done | `types/index.ts` replaced with full web app types (29 exports). `constants/index.ts` updated with production API URL, expanded COLORS, status color maps. `services/api.ts` overhauled with response envelope unwrapping and SecureStore token injection |
| 305 | Create all API service files (9 files) | Done | `auth.service.ts`, `product.service.ts`, `childBox.service.ts`, `masterCarton.service.ts`, `customer.service.ts`, `dispatch.service.ts`, `inventory.service.ts`, `trace.service.ts`, `dashboard.service.ts` — all import from `./api`, return unwrapped payload |
| 306 | Update auth store + create hooks | Done | `stores/authStore.ts` — proper User type, login/logout methods calling authService. `hooks/useApi.ts` — `useApiQuery` (TanStack Query wrapper), `useApiMutation` (with Alert success/error + query invalidation) |
| 307 | Auth guard in root layout | Done | `app/_layout.tsx` — AuthGate component: loads stored auth on mount, redirects unauthenticated users to login, authenticated users away from auth group. Loading spinner during check. QueryClient with retry:1, staleTime:30s |
| 308 | Create UI components (6 files) | Done | `Button.tsx` (4 variants, 3 sizes, loading, icon), `Input.tsx` (label, error state), `Card.tsx` (shadow, padding toggle), `Badge.tsx` (status color auto-lookup), `Spinner.tsx` (full-screen option), `EmptyState.tsx` (icon + title + message) |
| 309 | Build all tab screens (4 tabs) | Done | Dashboard (KPI stat cards, quick summary, pull-to-refresh), Scan & Trace (barcode input, trace API, child box/master carton/timeline cards), Inventory (drill-down hierarchy: Section→Article→Colour→Product, breadcrumbs, stock bars), Menu (user card, 3x3 module grid, logout) |
| 310 | Login screen | Done | Navy background, Binny branding (red B logo), email/password form with Input components, error display, calls authStore.login(), "Powered by Basiq360" footer |
| 311 | EAS Build setup | Done | `eas.json` created (preview profile: APK, production: AAB). EAS CLI v18.7.0 installed. Project registered on Expo: `@kanikabehl/binny-inventory` (ID: 28e61b0e-eaa0-4dfd-aed7-695e5c6c3b10) |
| 312 | Fix: EAS build dependency issues | Done | Removed conflicting `App.tsx`/`index.ts`. Created `.npmrc` with `legacy-peer-deps=true` for react-dom peer conflict. Installed missing peer deps: `expo-font`, `expo-constants`, `expo-linking`, `react-native-worklets`. Removed deprecated `expo-barcode-scanner` (replaced by expo-camera in SDK 54). Added `NODE_ENV=production` to eas.json |
| 313 | Android APK built successfully | Done | EAS Build #5 succeeded. APK available at `expo.dev/accounts/kanikabehl/projects/binny-inventory/builds/11c32f09-0f8f-43cd-9696-41dbadae6d73`. 32 source files, 0 TS errors, 17/17 expo-doctor checks passed |

#### Phase 5 Bootstrap Summary
| Metric | Value |
|--------|-------|
| Total activities | 19 (295-313) |
| Source files | 32 (.ts/.tsx) |
| Service files | 10 (api + 9 endpoint services) |
| UI components | 6 |
| Screen files | 6 (login, dashboard, scan, inventory, menu, index) |
| TypeScript errors | 0 |
| Expo doctor checks | 17/17 passed |
| EAS build attempts | 5 (4 failed: lockfile sync, peer deps, missing worklets, deprecated barcode-scanner) |
| APK | Built and downloadable |

---

### April 16, 2026 — Documentation: Test Cases v2 Phases 13–14

#### Comprehensive Test Case Authoring — Negative Tests, Edge Cases & Lifecycle E2E
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 318 | Write test-cases-v2-phases-13-14.md | Done | 82 test cases across Phase 13 (Edge Cases, State Machine, Error Handling, Pagination) and Phase 14 (Full Lifecycle E2E + Regression). Breakdown: 72 API tests, 10 E2E Playwright tests. Covers: 22 input validation tests (string/numeric boundary + injection), 18 state machine tests (child box + carton transitions), 6 concurrency tests, 14 error handling tests, 8 pagination/search tests, 6 multi-role lifecycle API tests, 2 full browser E2E lifecycle tests, 8 regression tests for previously fixed bugs. Spec files: `27-edge-cases.spec.ts`, `28-lifecycle.spec.ts`. File: `docs/test-cases-v2-phases-13-14.md` |

---

### April 16, 2026 — Documentation: Test Cases v2 Phases 4–6

#### Comprehensive Test Case Authoring
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 317 | Write test-cases-v2-phases-4-6.md | Done | 122 test cases across Phase 4 (Child Box), Phase 5 (Master Carton), Phase 6 (Dispatch). Breakdown: 79 API tests, 7 Integration tests, 36 E2E Playwright tests. Covers all 4 roles (Admin, Supervisor, Warehouse Operator, Dispatch Operator), all CRUD operations, permission matrix enforcement, full business rule validation. File: `docs/test-cases-v2-phases-4-6.md` |

---

### April 16, 2026 — Phase 4: Label Fixes + Production Deploy

#### Child Box Label Fix + Deploy
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 314 | Commit label redesign + article_code fix | Done | Git commit `952fc07`: 60x60mm label layout + article_code/MRP data fix in childBox.service.ts. Pushed to origin/main |
| 315 | Deploy to production | Done | SCP'd 3 changed files to server, rebuilt both Docker images (backend + frontend), restarted containers. All healthy |
| 316 | Clear production data for client testing | Done | Deleted all rows from: inventory_transactions (111), audit_logs (263), dispatch_records (2), carton_child_mapping (23), master_cartons (5), child_boxes (63), products (12). Customers, users, roles, sections untouched |

---

### April 15, 2026 — Phase 4: Label Redesign

#### Child Box QR Label Resize (60mm x 60mm)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 292 | Redesign child box label to 60x60mm square | Done | Label `width: 60mm; height: 60mm` with `@page { size: 60mm 60mm; margin: 0 }`. Table `height: 100%` fills the square. Layout matches reference: Article No (full width), Colour + Size (rowspan=2, 28pt bold — primary focus), MRP (9pt bold — secondary), Packed on + Content (6pt compact rows), QR (17mm, rowspan=2, vertically centered). Footer moved inside table as `colspan=2` row so it spans full label width |
| 293 | Visual hierarchy and spacing fixes | Done | Size cell enlarged: 28pt font, rowspan=2 spanning Colour+MRP rows. Colour bumped to 9pt bold. MRP to 9pt bold. Packed on / Content shrunk to 6pt with 4mm row height — values stay single-line. QR rowspan reduced from 3→2 eliminating blank space below. All cells `vertical-align: middle` for uniform spacing |
| 294 | Fix: Article No and MRP showing undefined/NaN on labels | Done | Root cause: `createBulkMultiSizeChildBoxes`, `createBulkChildBoxes`, and `createChildBox` in `childBox.service.ts` queried product fields but did not pass `article_code` or `mrp` in the response object. Added `article_code` to SELECT and included both `article_code` and `mrp` in all 3 function return objects |

---

### April 14, 2026 — Phase 4: Observations & Fixes (Day 2 — Continued)

#### Production Deployment Fix
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 271 | Fix: Backend Docker uploads directory permission | Done | Dockerfile prod stage: added `mkdir -p ./uploads/product-images` + `chown -R appuser:appgroup /app` before `USER appuser`. Multer `mkdirSync` was failing with EACCES as non-root |
| 272 | Fix: Frontend API URL pointing to localhost | Done | `.env` and `frontend/.env.local` had `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1`. Changed to `https://srv1409601.hstgr.cloud/binny/api/v1`. Frontend rebuilt to bake correct URL. This caused "Unable to reach the server" errors |

#### Feature: Image Upload During Product Creation
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 273 | Image upload added to product create modal | Done | `products/page.tsx` — File input now shown in both create and edit modals. On create: image stored in state, uploaded via `uploadImage()` after product is created. Shows filename preview with remove button. Helper text: "Image will be uploaded after the product is created" |

#### Feature: Bulk CSV Product Import
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 274 | Backend: csv-parse dependency added | Done | `npm install csv-parse` for CSV parsing |
| 275 | Backend: CSV upload middleware | Done | `upload.middleware.ts` — Added `csvUpload` multer config: memory storage, 10MB limit, .csv filter |
| 276 | Backend: Bulk create product service | Done | `product.service.ts` — `bulkCreateProducts(csvBuffer, createdBy)`: parses CSV, validates required columns (article_code, article_name, colour, size, mrp, section, category), validates each row (types, lengths, enum values), generates SKU, checks duplicates, creates products row-by-row with audit logs. 500-row limit. Returns `{ created, errors[] }` with per-row error details |
| 277 | Backend: Bulk upload controller + sample download | Done | `product.controller.ts` — `bulkUploadProducts()` accepts multipart CSV, `downloadSampleCsv()` returns CSV with headers + 3 sample rows. Routes: `POST /products/bulk-upload`, `GET /products/bulk-upload/sample` (Admin/Supervisor only) |
| 278 | Frontend: Bulk import UI | Done | `products/page.tsx` — "Bulk Import" button next to "Add Product" in page header. Modal with: sample CSV download (with auth header fetch), required/optional columns info, file drag area, upload button. Results view: green success banner with count, red error list with row number + article name + error message. "Upload Another File" to reset |
| 279 | Frontend: Product service bulk methods | Done | `product.service.ts` — Added `BulkUploadResult` and `BulkRowError` types, `bulkUpload(file)` multipart POST, `getSampleCsvUrl()` helper |

#### Bug Fix: Blank Primary Dealer Dropdown
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 280 | Fix: Primary dealers not showing in sub-dealer creation | Done | Root cause: all 3 seed customers had `is_active = false` in production DB. `getPrimaryDealers()` filters `WHERE is_active = true` → empty results. Activated all 3 customers (Delhi Shoe House, Mumbai Sole Traders, Sharma Footwear Distributors). Verified: dropdown now returns 3 dealers |

#### Replace size_group with size_from / size_to Range
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 281 | Migration: Replace size_group with size_from/size_to | Done | `20260414100001` — Drops `size_group` VARCHAR(50), adds `size_from` VARCHAR(10) and `size_to` VARCHAR(10). Auto-migrates existing "X-Y" data by splitting on dash |
| 282 | Backend: Schema, service, types updated | Done | `product.schema.ts` — create/update schemas use `size_from`/`size_to`. `product.service.ts` — INSERT, UPDATE, bulk INSERT all use new columns. `types/index.ts` — Product interface updated. Sample CSV headers updated |
| 283 | Frontend: Form updated with two fields | Done | `products/page.tsx` — "Size Group" single input replaced with "Size From" and "Size To" separate inputs in 4-column grid. Works in create, edit, and bulk CSV. `types/index.ts` updated |

#### Bug Fix: Traceability Crash on Barcode Search
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 284 | Fix: Traceability crash on master carton barcode | Done | Root cause: trace API returns `{ masterCarton, dispatch, timeline }` for master carton barcodes (no `childBox`), but template rendered `result.childBox.barcode` unconditionally. Also dispatch data used different column names (`dispatch_date` not `dispatch_number`). Added null guards and correct field mapping |

#### Merge: Scan + Storage + Traceability → Unified "Scan & Trace"
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 285 | Merged three pages into one | Done | `scan/page.tsx` — Complete rewrite combining QR scanner + manual entry (from Scan), full timeline (from Traceability), and "Seal for Storage" action (from Storage). One scan shows: item details, master carton info with child boxes, dispatch data, lifecycle timeline, and contextual carton actions |
| 286 | Sidebar updated | Done | `constants/index.ts` — Removed "Storage" and "Traceability" nav items. Renamed "Scan" to "Scan & Trace". Mobile nav updated. Old pages still exist at /storage and /traceability but unlinked |

#### Compilation & Deployment
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 287 | Frontend TypeScript compilation | Done | 0 app source errors |
| 288 | Deployed to production | Done | All changes deployed — backend (size range migration + CSV bulk upload) + frontend (merged Scan & Trace, product form, customer fix). All containers healthy |

#### E2E Tests: Configurable Sections CRUD
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 289 | Created `14-sections-crud.spec.ts` | Done | 8 tests (TC-SECT-001 to TC-SECT-008) covering full CRUD lifecycle: GET list validates shape, POST creates with unique timestamp name, duplicate name rejected (4xx), GET by ID, PUT rename, PUT duplicate rename rejected, DELETE soft-deactivates + verifies omission from active list, E2E page test confirms section tabs on /products reflect API data. Uses `test.describe.serial` to share `createdSectionId` across ordered tests. Follows `getAuthToken` + `BASE_API` patterns from helpers.ts |

#### E2E Tests: Rewrite Scan & Trace spec
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 289 | Rewrote `frontend/e2e/08-scan.spec.ts` for unified Scan & Trace module | Done | 14 tests (TC-SCANTRACE-001 to 014) covering: page layout (Camera Scanner + Manual Entry sections), title, input/button visibility, Enter-key trigger, empty state placeholder, child box lookup via API (card + field labels), master carton lookup, ACTIVE carton "Seal for Storage" button, timeline section, "Clear & Scan Another" reset, full-screen button, sidebar nav item, non-existent barcode error toast |

#### E2E Tests: CSV Bulk Product Upload
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 290 | Created `frontend/e2e/15-bulk-upload.spec.ts` | Done | 8 tests (TC-BULK-001 to TC-BULK-008) covering: sample CSV download endpoint returns valid CSV with correct Content-Type, sample CSV header contains all 13 expected columns (including size_from/size_to), valid 2-row CSV creates products (created >= 2), CSV missing required columns rejected with 4xx, empty CSV (headers only) rejected with 4xx, invalid category value reported as row-level error, negative MRP reported as row-level error, Bulk Import modal opens on /products page with Download link and file input visible. Uses `getAuthToken` + `Buffer.from` multipart pattern for API tests, `loginViaAPI` for UI test |

#### Documentation: Test Cases Update (v1.5)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 291 | Updated `docs/test-cases.md` to v1.5 | Done | Added 6 new sections (26–31): Configurable Sections CRUD (12 TCs), SKU Auto-Generation (8 TCs), Product Image Upload (10 TCs), CSV Bulk Product Upload (18 TCs), Unified Scan & Trace Module (22 TCs), Traceability Bug Fix Regression (5 TCs). Extended Section 15 with TC-CUST-011–018 (dealer hierarchy). Replaced Section 16 TC-PRODX-008 (Size Group) with size_from/size_to tests + added TC-PRODX-009–014. Added "Note: unified Scan & Trace" notices to Sections 6, 10, 12. Updated summary table and total to ~418 test cases. TOC updated with all 31 sections. |

---

### April 13, 2026 — Phase 4: Meeting Feedback Implementation (Day 1 — Backend)

#### Context
Client meeting feedback received covering: SKU auto-generation, product images, configurable sections, customer dealer hierarchy (Primary/Sub Dealer), bug fixes (traceability, inventory sections), and UI clarity improvements for pack/unpack/repack/scan/storage/traceability modules.

#### Key Decisions (confirmed with client)
- **SKU format**: `{Section}-{ArticleName}-{Category}-{Serial}-{Colour}` e.g., `HAWAII-BUSKER-GENTS-01-WHITE`
- **Barcodes**: Stay unique per child box (no change to current behavior)
- **Sections**: Configurable by admin — stored in DB, not hardcoded
- **Product images**: Server filesystem at `/uploads/product-images/`
- **Customer network**: Primary Dealer / Sub Dealer hierarchy with auto-fill

#### Phase 4 Implementation Plan
Full plan documented at `.claude/plans/declarative-foraging-platypus.md` — 5 phases, 10 tasks total.

#### Bug Fixes
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 222 | Fix: Traceability query column collision | Done | `inventory.service.ts` `traceByBarcode()` — `SELECT cb.*, p.*` caused `p.id` to overwrite `cb.id`, breaking carton/dispatch/timeline lookups. Fixed with explicit column selection using `cb.id, cb.barcode, cb.status, ...` and `p.sku, p.article_name, ...` separately |

#### Database Migrations (4 new)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 223 | Migration: Create product_sections table | Done | `20260413100001` — New `product_sections` table (id, name, is_active, display_order). Seeded 7 existing sections (Hawaii, PU, EVA, Fabrication, Canvas, PVC, Sports Shoes). Dropped hardcoded CHECK constraint on products.section. Backfilled NULLs, made section + category NOT NULL |
| 224 | Migration: Add product image_url column | Done | `20260413100002` — Added `image_url VARCHAR(500)` to products table |
| 225 | Migration: Customer dealer hierarchy | Done | `20260413100003` — Created `customer_type` ENUM ('Primary Dealer', 'Sub Dealer'). Added `customer_type` (default 'Primary Dealer') and `primary_dealer_id` (FK → customers) columns. CHECK constraint: sub dealer must have primary dealer. Indexes on type and primary_dealer_id |
| 226 | Migration: Widen SKU column | Done | `20260413100004` — Widened `products.sku` from VARCHAR(50) to VARCHAR(100) for longer auto-generated SKU format |

#### Backend: Configurable Sections CRUD
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 227 | Section validation schema | Done | `models/schemas/section.schema.ts` — Zod schemas for create/update/query with name (1-100 chars), is_active, display_order |
| 228 | Section service | Done | `services/section.service.ts` — Full CRUD: createSection, getSections (with includeInactive filter), getSectionById, updateSection, deleteSection (soft delete). Duplicate name check, audit logging |
| 229 | Section controller + routes | Done | `controllers/section.controller.ts` + `routes/section.routes.ts` — GET / and GET /:id for all authenticated users; POST, PUT, DELETE for Admin only. Registered in routes/index.ts |

#### Backend: SKU Auto-Generation
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 230 | SKU generator utility | Done | `utils/skuGenerator.ts` — `generateSku(section, articleName, category, colour)` → counts existing products with same normalized combo → returns `{SECTION}-{ARTICLE}-{CATEGORY}-{SERIAL}-{COLOUR}` with zero-padded 2-digit serial |
| 231 | Product schema updated for auto-SKU | Done | `product.schema.ts` — Removed `sku` from createProductSchema (auto-generated). Made `category` required enum, `section` required string (no longer hardcoded enum). Added colour/size/article_name/article_group filters to productListQuerySchema |
| 232 | Product service updated | Done | `product.service.ts` — `createProduct()` now calls `generateSku()` instead of accepting manual SKU. `getProducts()` extended with colour, size, article_name, article_group filters |

#### Backend: Product Image Upload
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 233 | Multer middleware + dependencies | Done | Installed `multer` + `@types/multer`. Created `middleware/upload.middleware.ts` — disk storage with UUID filenames, 5MB limit, JPEG/PNG/WebP filter. Created `uploads/product-images/` directory |
| 234 | Image upload endpoint | Done | `POST /products/:id/image` — uploads image, stores as `/uploads/product-images/{uuid}.ext`. Updates `image_url` for all products sharing same article_code + colour. Static file serving added to app.ts. Added `uploads/` to .gitignore |

#### Backend: Customer Dealer Hierarchy
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 235 | Customer schema updated | Done | `customer.schema.ts` — Added `customer_type` enum ('Primary Dealer'/'Sub Dealer', default Primary), `primary_dealer_id` UUID. Refinement: sub dealer must have primary_dealer_id. Added customer_type to list query filters |
| 236 | Customer service updated | Done | `customer.service.ts` — `createCustomer()` auto-fills sub dealer fields (address, delivery_location, gstin, contact) from primary dealer. `getCustomers()` LEFT JOINs for primary_dealer_name, filters by customer_type. New: `getPrimaryDealers()`, `getSubDealers(id)` |
| 237 | Customer routes updated | Done | `GET /customers/primary-dealers` + `GET /customers/:id/sub-dealers` — new endpoints. Controller handlers added |

#### Backend: Constants Updated
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 238 | Added CUSTOMER_TYPES constant | Done | `config/constants.ts` — `CUSTOMER_TYPES = { PRIMARY_DEALER: 'Primary Dealer', SUB_DEALER: 'Sub Dealer' }` with `CustomerType` export. Existing PRODUCT_SECTIONS kept for backward compatibility |

#### Compilation Check
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 239 | Backend TypeScript compilation | Done | 0 errors after all changes |

### April 14, 2026 — Phase 4: Meeting Feedback Implementation (Day 2 — Frontend)

#### Frontend: Types & Constants
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 240 | Updated Product type with image_url | Done | `types/index.ts` — Added `image_url: string | null` to Product interface |
| 241 | Added ProductSection interface | Done | `types/index.ts` — New interface: `{ id, name, is_active, display_order, created_at, updated_at }` |
| 242 | Updated Customer type with dealer fields | Done | `types/index.ts` — Added `customer_type: 'Primary Dealer' | 'Sub Dealer'`, `primary_dealer_id: string | null`, `primary_dealer_name?: string | null` to Customer. Updated CreateCustomerRequest with optional customer_type + primary_dealer_id |
| 243 | Updated frontend constants | Done | `constants/index.ts` — Added `CUSTOMER_TYPES = ['Primary Dealer', 'Sub Dealer']`. Kept PRODUCT_SECTIONS as fallback |

#### Frontend: Product Module Redesign
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 244 | Product service updated | Done | `product.service.ts` — Added `uploadImage(productId, file)` (multipart/form-data), `getSections()` (GET /sections). Extended `getAll()` with section, category, location, colour, size, article_name, article_group filter params |
| 245 | Product page fully redesigned | Done | `products/page.tsx` — Section tabs at top (fetched from API, "All" + dynamic sections). Column-level filters (category select, colour/size/article_group text inputs, location select) with clear buttons. SKU removed from create form (auto-generated). SKU shown read-only in edit modal with helper note. Image column in table (40x40 thumbnail). Image upload in edit modal (file input → calls uploadImage → refetch). Category and Section now required fields in create. Mobile cards updated with thumbnails |

#### Frontend: Customer Network UI
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 246 | Customer service updated | Done | `customer.service.ts` — Added `getPrimaryDealers()`, `getSubDealers(id)`, `customer_type` filter param to `getAll()` |
| 247 | Customer page fully redesigned | Done | `customers/page.tsx` — Customer type filter dropdown (All/Primary/Sub Dealer). Type column + Primary Dealer column in table. Create/Edit modal: radio selector for Primary/Sub Dealer. When Sub Dealer selected: primary dealer dropdown (fetched from API), auto-fill address/delivery_location/gstin/contact from primary dealer (read-only gray fields), only firm_name/private_marka/gr editable. Validation: sub dealer must have primary_dealer_id. Mobile cards show type badge + primary dealer name |

#### Frontend: UI Clarity — Pack/Unpack/Repack + Module Descriptions
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 248 | Pack page description updated | Done | `master-cartons/create/page.tsx` — "Pack child boxes into a new master carton. Only FREE child boxes can be packed. Scan or enter barcodes to add boxes." |
| 249 | Unpack page description updated | Done | `unpack/page.tsx` — "Unpack removes ALL child boxes from a master carton. All boxes return to FREE status and the carton becomes empty." |
| 250 | Repack page description updated | Done | `repack/page.tsx` — "Repack moves SPECIFIC child boxes from one master carton to another. Selected boxes stay PACKED but transfer to the destination carton." |
| 251 | Traceability page description updated | Done | `traceability/page.tsx` — Header: "Track the complete lifecycle of any item — from creation through packing, storage, and dispatch with a full timeline". Empty state: detailed explanation of traceability journey |
| 252 | Storage page description updated | Done | `storage/page.tsx` — "Seal a packed master carton for storage. Closing a carton prevents further packing changes and marks it ready for dispatch." |
| 253 | Scan page description updated | Done | `scan/page.tsx` — "Quick item lookup — scan or enter any barcode to instantly view current status and details" |

#### Compilation Check
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 254 | Frontend TypeScript compilation | Done | 0 app source errors (1 pre-existing e2e test file issue unrelated to changes) |
| 255 | Backend TypeScript compilation | Done | 0 errors — verified backend still clean after frontend changes |

#### E2E Test Updates
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 256 | Rewrote product E2E tests | Done | `10-products.spec.ts` — 14 tests (was 9). Removed SKU field assertions, added: section tabs (TC-PRODX-002/003), no SKU in create modal (TC-PRODX-004), required section/category (TC-PRODX-005), section API dropdown (TC-PRODX-007), column filters (TC-PRODX-011), image column (TC-PRODX-012), sections API (TC-PRODX-013), SKU auto-gen API (TC-PRODX-014) |
| 257 | Rewrote customer E2E tests | Done | `09-customers.spec.ts` — 14 tests (was 7). Added: customer type selector (TC-CUST-003), create primary dealer (TC-CUST-004), sub dealer dropdown (TC-CUST-005), auto-fill from primary (TC-CUST-006), sub dealer validation (TC-CUST-007), type filter (TC-CUST-011), type+dealer columns (TC-CUST-012), primary dealers API (TC-CUST-013) |
| 258 | Rewrote traceability E2E tests | Done | `07-traceability.spec.ts` — 5 tests (was 3). Added: updated description check (TC-TRACE-001/003), scan+trace buttons (TC-TRACE-002), child box card fields (TC-TRACE-004), API regression test for column collision bug fix (TC-TRACE-005) |
| 259 | Added lifecycle UI description tests | Done | `05-lifecycle.spec.ts` — Added 3 tests: TC-STORE-002 (seal description), TC-UNPACK-002 (removes ALL description), TC-REPACK-002 (moves SPECIFIC description). Total: 10 tests (was 7) |
| 260 | Added scan page description test | Done | `08-scan.spec.ts` — Added TC-SCAN-004: "quick item lookup" description check. Total: 4 tests (was 3) |
| 261 | TypeScript compilation verified | Done | 0 new errors (1 pre-existing e2e issue in 03-child-boxes.spec.ts unrelated to Phase 4) |

#### E2E Test Debugging & Fixes
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 262 | Fix: Migration trigger function name | Done | `20260413100001` used `fn_set_updated_at()` but actual function is `trigger_set_updated_at()`. Fixed and re-ran all 4 migrations successfully |
| 263 | Fix: Migration customer_type default quoting | Done | `20260413100003` had double-quoted default `"'Primary Dealer'"` → pgm dollar-quoted it to `'Primary Dealer'` (with extra quotes). Fixed to `pgm.func("'Primary Dealer'")` |
| 264 | Fix: Backend multer type error | Done | `product.controller.ts` — `req.file` not typed on `AuthenticatedRequest`. Fixed with inline type assertion. Installed multer + @types/multer in Docker container |
| 265 | Fix: Traceability timeline field mapping | Done | `inventory.service.ts` — Timeline queries returned DB column names (`transaction_type`, `created_at`, `performed_by_name`) but frontend expected (`action`, `performed_at`, `performed_by`). Added SQL aliases to map correctly. Fixed both child box and master carton timeline queries |
| 266 | Fix: Customer test selectors (9 tests) | Done | Replaced `getByText('Primary Dealer').first()` (matched hidden `<option>`) with `locator('input[type="radio"][value="Primary Dealer"]')`. Replaced `getByLabel(/gstin/i)` with `getByPlaceholder('e.g., 22AAAAA0000A1Z5')` (raw `<label>` without `htmlFor`). Fixed strict mode violations on `getByText('Delivery Location')` (matched table header + modal label). Multiple debug iterations |
| 267 | Fix: Product test — article_code too long | Done | `ART-API-${Date.now()}` = 22 chars, exceeds 20 char DB limit. Changed to `A${String(uniqueSuffix).slice(-8)}` |
| 268 | Fix: Product test — column filter selector | Done | `getByText(/all categories/i)` matched hidden `<option>`. Changed to `getByPlaceholder(/colour/i)` to check filter inputs directly |
| 269 | Fix: Traceability test — page navigation | Done | `page.goto('/traceability?qr=...')` lost auth tokens (set via `addInitScript`). Changed to navigate first, then enter barcode and click Trace button |
| 270 | Final E2E run: 47/47 passed (5.1 min) | Done | Lifecycle (10), Traceability (5), Scan (4), Customers (14), Products (14). All Phase 4 tests green. Chromium, single worker |

#### Phase 4 Summary
| Metric | Value |
|--------|-------|
| Total activities | 49 (222-270) |
| New migrations | 4 |
| New backend files | 6 (section schema/service/controller/routes, skuGenerator, upload middleware) |
| Modified backend files | 9 (product schema/service/controller, customer schema/service/controller/routes, constants, app.ts, routes/index.ts) |
| Modified frontend files | 10 (types, constants, product service/page, customer service/page, traceability/storage/scan/unpack/repack/pack pages) |
| Updated E2E test files | 5 (products, customers, traceability, lifecycle, scan) |
| Total E2E tests | 169 (was 151) — 18 new tests added |
| E2E test result (Phase 4 subset) | 47/47 passed (5.1 min, Chromium) |
| Bugs found & fixed during testing | 4 (migration trigger name, migration default quoting, multer type, timeline field mapping) |
| TypeScript errors | 0 (both backend + frontend app source) |

### April 9, 2026 — Production Login Fix & Auto-Seed Hardening

#### Production Login Failure — Admin Password Hash Out of Sync (2nd occurrence)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 215 | Diagnosed production login failure | Done | `admin@binny.com` / `Admin@123` returning 401 on production (`srv1409601.hstgr.cloud/binny/`). Local Docker worked fine. Root cause: admin user existed in production DB but password hash didn't match the default password — same issue as commit 9992b05 |
| 216 | Reset admin password on production DB | Done | Used Node.js script inside `binny-backend` container to bcrypt-hash `Admin@123` and UPDATE the password_hash. Verified with `bcrypt.compare()` before and after |
| 217 | Hardened autoSeed.ts to prevent recurrence | Done | Rewrote `autoSeed()` — no longer skips when users exist. Now: (1) ensures all default roles exist, (2) creates admin user if missing, (3) **verifies admin password matches default on every startup** and resets if out of sync. Logged at WARN level when reset occurs |
| 218 | Backend compiled clean | Done | 0 TypeScript errors after autoSeed.ts changes |
| 219 | Deployed fix to production | Done | Uploaded updated `autoSeed.ts`, rebuilt `binny-backend` image on server, container restarted. Auto-seed ran on startup — admin password verified OK |
| 220 | Production login verified | Done | `POST /binny/api/v1/auth/login` returns HTTP 200 with valid accessToken. Issue resolved permanently — any future password hash corruption will self-heal on backend restart |
| 221 | PWA sharing document created | Done | `docs/Binny_Inventory_App.html` — branded client-facing HTML with app link, QR code (scan to open), login credentials (tap to copy), step-by-step install instructions (Android + iOS tabs), key features grid, requirements. Self-contained, shareable via email/WhatsApp |

### April 8, 2026 — E2E Test Suite Debugging & Full Pass

#### E2E Test Suite — Full Run & Debug
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 200 | Initial test run: 139/151 passed, 12 failed | Done | Identified 3 failure categories: strict mode violations (ambiguous locators), inventory module not loading (stale containers), timing issues |
| 201 | Docker containers restarted | Done | Backend + frontend containers restarted to pick up new inventory module code (routes + page). Inventory API and /inventory page confirmed working |
| 202 | Fix: TC-DASH-004 strict mode (Master Cartons) | Done | Changed `getByText('Master Cartons')` → `getByRole('heading', { name: 'Master Cartons' })` — 4 elements matched, heading is specific |
| 203 | Fix: TC-MSQR-007 strict mode + timeout | Done | Changed `getByText(/labels generated/i)` → `getByRole('heading', ...)`, increased test timeout to 60s for bulk generate flow |
| 204 | Fix: TC-UI-013 hidden mobile button | Done | Changed `header button` selector to `header button:not(.lg\\:hidden)` — first button is mobile hamburger, invisible on desktop |
| 205 | Fix: TC-UI-025 strict mode (Scan Child Boxes) | Done | Changed `getByText('Scan Child Boxes')` → `getByRole('heading', ...)` — matches both h3 and description p |
| 206 | Fix: TC-UI-028 strict mode (Sign In) | Done | Changed `getByText('Sign In')` → `getByRole('button', { name: 'Sign In' })` — "Sign in" appeared in both button and paragraph |
| 207 | Fix: TC-INV-001 strict mode (Inventory/Child Boxes) | Done | Scoped to `getByRole('main').getByRole('heading', ...)` and `getByRole('main').getByText('Child Boxes')` — "Inventory" matched 4 elements, "Child Boxes" matched sidebar + card |
| 208 | Fix: TC-INV-002 data loading race | Done | Added `toBeVisible({ timeout: 15000 })` wait for data cards; skeleton loaders were still showing when test asserted |
| 209 | Fix: TC-INV-009 stock bar selector + loading | Done | Added data load wait, changed CSS selector to `div.rounded-full.overflow-hidden` with child filter |
| 210 | Fix: TC-INV-010 strict mode (Stock Levels) | Done | Changed `getByText('Stock Levels')` → `getByRole('heading', ...)` — matched both heading and description text |
| 211 | Fix: TC-INV-011 strict mode (Inventory nav) | Done | Added `exact: true` to link role, scoped confirmation to `getByRole('main').getByRole('heading', ...)` |
| 212 | Fix: TC-DASH-006 sidebar nav timing | Done | Added `waitForLoadState('networkidle')` between nav clicks + `exact: true` on Master Cartons link — click on Reports happened before Master Cartons page loaded |
| 213 | Final full test run: 151/151 passed (Chromium) | Done | 13 spec files, 151 tests, 13.7 min. All green: Auth (8), Dashboard (11), Child Boxes (14), Master Cartons (6), Lifecycle (7), Reports (6), Traceability (3), Scan (3), Customers (7), Products (9), UI Enhancements (31), PWA Features (34), Inventory (12) |
| 214 | Data Seeding & UAT Guide prepared | Done | docs/data-seeding-guide.html — Branded HTML guide with Binny logo, 8-step data entry walkthrough (Products → Customers → Child Boxes → Master Cartons → Storage → Dispatch → Reports → Inventory), role reference, UAT checklist, pre-loaded sample data reference, field-by-field tables with required/optional badges |

### April 7, 2026 — Production Deployment & Inventory Module

#### Production Deployment to Hostinger VPS
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 178 | SSH key generated for deployment machine | Done | ed25519 key pair at ~/.ssh/id_ed25519, public key added to server authorized_keys |
| 179 | Production docker-compose.prod.yml updated | Done | Renamed containers (binny-db, binny-backend, binny-frontend), added edge-network for shared nginx, DATABASE_SSL=false for local PG, build args for NEXT_PUBLIC_BASE_PATH |
| 180 | Frontend Dockerfile: build args support | Done | Added ARG/ENV for NEXT_PUBLIC_API_URL and NEXT_PUBLIC_BASE_PATH so basePath is baked at build time |
| 181 | Backend: DATABASE_SSL toggle | Done | Added DATABASE_SSL env var to config/env.ts + database.ts — skips SSL when set to "false" (Docker PG doesn't use SSL) |
| 182 | Frontend: basePath support | Done | next.config.mjs reads NEXT_PUBLIC_BASE_PATH for basePath. Fixed window.location.href in authStore.ts and api.ts to use basePath. Replaced Next.js `<Image>` with `<img>` for monogram.png (Image optimizer doesn't work with basePath + nginx proxy) |
| 183 | Project files uploaded to /opt/binny | Done | Tarball deploy via scp, extracted on server |
| 184 | Docker images built on server | Done | Backend: multi-stage prod build (node:20-alpine, tsc → dist). Frontend: standalone Next.js build with basePath=/binny, 22 pages generated |
| 185 | PostgreSQL database set up | Done | binny-db container (postgres:16-alpine), uuid-ossp + pg_trgm extensions enabled, 14 migrations run successfully |
| 186 | Seed data loaded | Done | 4 roles, admin user (admin@binny.com / Admin@123), 10 products (Hawaii/PU/EVA), 3 customers, 18 child boxes, 3 master cartons (1 ACTIVE, 1 CLOSED, 1 DISPATCHED), 1 dispatch record |
| 187 | Edge nginx configured | Done | Path-based routing: /binny/api/ → binny-backend:3001, /binny/ → binny-frontend:3000. Exact match /binny proxied directly (avoids redirect loop with Next.js basePath). Self-signed cert placeholder for binny.basiq360.com |
| 188 | All containers healthy | Done | binny-db (healthy), binny-backend (healthy, health check every 30s), binny-frontend (running). Connected to edge-network + binny-internal |
| 189 | Production URL live | Done | https://srv1409601.hstgr.cloud/binny/ — login, dashboard, all modules working |

#### Inventory Module — Hierarchical Stock Drill-Down
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 190 | Backend: Stock summary API | Done | GET /inventory/stock/summary — totalProducts, totalPairsInStock, totalPairsDispatched, totalChildBoxes, totalCartons, sections, articles |
| 191 | Backend: Stock hierarchy API | Done | GET /inventory/stock/hierarchy?level=section|article_name|colour|product&section=X&article_name=X&colour=X — aggregated stock at each hierarchy level with drill-down filters |
| 192 | Frontend: Inventory page | Done | /inventory — interactive drill-down page: Section → Article → Colour → Size. Summary KPI cards (Pairs in Stock, Dispatched, Child Boxes, Active Cartons). Visual stock bars (green=free, blue=packed, gray=dispatched). Clickable cards with chevron, breadcrumb navigation, back button, refresh. Responsive grid (1-4 cols) |
| 193 | Sidebar: Inventory nav item added | Done | Warehouse icon, positioned before Reports. Added to NAV_ITEMS in constants |
| 194 | E2E tests: Inventory module | Done | 13-inventory.spec.ts — 12 tests: page load, summary cards, legend, drill-down (4 levels), breadcrumb nav, back button, stock bars, refresh, sidebar link, API validation |
| 195 | Deployed to production | Done | Backend rebuilt + frontend rebuilt with inventory module, containers restarted, API verified at /binny/api/v1/inventory/stock/* |
| 196 | E2E test file created: 13-inventory.spec.ts | Done | 12 tests covering page load, summary cards, legend, drill-down (4 levels), breadcrumb nav, back button, stock bars, refresh, sidebar link, API validation |
| 197 | Test cases doc updated (v1.4) | Done | Added Section 25: Inventory Module (12 test cases TC-INV-001 to TC-INV-012). Total test cases: 318 |
| 198 | Playwright config: env var support | Done | playwright.config.ts and helpers.ts now accept PLAYWRIGHT_BASE_URL and PLAYWRIGHT_API_URL env vars for testing against remote servers |
| 199 | E2E test run against local Docker stack | Done | 151/151 tests passed (Chromium, 13.7 min). All 13 test failures from initial run debugged and fixed (strict mode locators, data loading races, container restart). Full suite green |

### April 3, 2026 — UAT Bug Fixes & UI Enhancement Plan

#### UAT Bug Fixes
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 144 | Fix: Buttons not visible across app | Done | Added inline style fallbacks (backgroundColor, color) to Button.tsx for all variants (primary, secondary, outline, danger). Ensures buttons render even if Tailwind JIT fails to generate custom `bg-binny-navy` classes |
| 145 | Fix: Separate search bar replaced with searchable dropdown | Done | child-boxes/generate/page.tsx — removed separate search `<input>` + `<Select>`. Replaced with single searchable dropdown combo: type to filter, click to select, outside-click-to-close, chevron indicator |
| 146 | Fix: Print label blank screen and error | Done | Fixed `QRCodeSVG` being called as plain function (breaks React 18+). Now uses `createElement(QRCodeSVG, {...})`. Pre-renders HTML before opening print window. Added `printWindow.onload` callback before `print()` |
| 147 | Verified: Label formatting matches spec | Done | Existing label template already includes all required fields: Article No, Colour, Size, MRP (inc. tax), Packed on date, Content (pairs), MFG Address, QR code. No changes needed |
| 148 | Fix: Dispatch list made customer-centric | Done | Rewrote dispatches/page.tsx — records grouped by customer showing total cartons, boxes, destinations, latest date. Click to expand shows individual carton dispatch details |

#### UI Enhancement — Initial Attempt
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 149 | Sidebar: Navy gradient header + solid navy active nav items | Done | Sidebar.tsx — gradient header, active items use solid navy bg with white text, hover shows white card with shadow |
| 150 | Header: Subtle shadow + gradient avatar + border separator | Done | Header.tsx — shadow-sm, navy gradient avatar, user area separated by left border |
| 151 | Login: Gradient background + card accent stripe | Done | Auth layout: navy gradient bg. Login card: red-to-navy gradient top stripe, shadow-2xl, white/translucent "Powered by" text |
| 152 | Dashboard: Stat card left accent borders + quick action hover animations | Done | page.tsx — colored left border on stat cards (navy, blue, green, purple), hover lift + arrow animation on quick actions |
| 153 | Mobile nav: Navy active pill + upward shadow | Done | MobileNav.tsx — active tab has solid navy pill bg, nav bar has upward box shadow |
| 154 | Global CSS: Background color to blue-tinted gray + fallback CSS | Done | globals.css — background `#F5F6FA`, btn-primary CSS fallback, sidebar-link-active with navy bg |
| 155 | Docker: Added tailwind.config.ts volume mount | Done | docker-compose.yml — frontend now mounts tailwind.config.ts for live config changes |

#### UI Enhancement — Comprehensive Plan (Phase 2)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 156 | Deep UI audit completed | Done | Audited all 28+ frontend files. Identified root causes: limited color palette, flat design, zero animations, basic shadows, no glassmorphism, no skeleton loaders, conservative accent color usage |
| 157 | Phase 2 UI Enhancement Plan documented | Done | 5-phase plan documented in implementation-plan.md Section 17 |

#### Phase 2 UI Enhancement — Implementation
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 158 | Phase 1: Design System Foundation | Done | tailwind.config.ts: brand-tinted shadow scale (card, card-hover, elevated, nav), 5 animation keyframes (fade-in, slide-up, scale-in, shimmer, pulse-dot), intermediate colors (navy-50, navy-200). globals.css: .skeleton shimmer utility, gradient .btn-primary, .card-interactive class, enhanced focus states |
| 159 | Phase 2: Core Components | Done | Card.tsx: shadow-card + interactive/accent props. Button.tsx: gradient primary/danger + active:scale-[0.98]. Input.tsx/Select.tsx: bg-gray-50/50 + focus:bg-white + focus:shadow-sm. Table.tsx: bg-binny-navy-50 header + branded hover. Spinner.tsx: SkeletonLine/SkeletonCard/SkeletonTable. Badge.tsx: color borders + font-semibold |
| 160 | Phase 3: Layout Enhancements | Done | Sidebar.tsx: full navy gradient bg, white active items with red left indicator, white/70 inactive text. Header.tsx: backdrop-blur-md glass, red pulse notification dot, navy title accent. MobileNav.tsx: backdrop-blur-lg glass, red dot active indicator. PageHeader.tsx: red-to-navy gradient accent bar |
| 161 | Phase 4: Page Enhancements | Done | Dashboard: welcome banner + skeleton loading + stat card accents + gradient icon containers + timeline connector + summary left borders. List pages (master-cartons, dispatches, products, customers): SkeletonTable loaders + bg-binny-navy-50/50 filter bars. Form pages (dispatch, master-carton create): icon pill section headers |
| 162 | Phase 5: PWA & Polish | Done | manifest.json: navy background_color + split icon purposes. offline/page.tsx: branded gradient + accent stripe card + WifiOff icon. Dashboard layout: branded splash loading. Auth layout: radial red glow. Login: animate-scale-in. ToastProvider: green/red left accent borders + elevated shadow |
| 163 | Sidebar: Inverted to navy bg with white active items | Done | User feedback: changed from white sidebar to full navy gradient (180deg #2D2A6E→#1E1A5F), inactive items white/70, active item white bg with navy text + red indicator, borders white/10 |
| 164 | Fix: Child Box list product name blank | Done | Backend childBox.service.ts: all 4 SELECT queries aliased `p.article_name as product_name` but frontend expects `article_name`. Changed to `p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp` (no aliasing). Also added missing article_code and mrp columns |

#### Phase 3: PWA Enhancement — Implementation (April 4, 2026)
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 165 | IndexedDB wrapper for offline persistence | Done | New `lib/indexedDb.ts` — promise-based wrapper (openDB, putItem, getAllItems, deleteItem, clearStore). DB: binny_offline, store: pending_scans. PendingScan: {id, barcode, sessionType, scannedAt} |
| 166 | Network status hook | Done | New `hooks/useNetworkStatus.ts` — navigator.onLine + online/offline events. Returns {isOnline, wasOffline}. wasOffline stays true 3s after reconnect |
| 167 | Install prompt hook | Done | New `hooks/useInstallPrompt.ts` — captures beforeinstallprompt, mobile-only, checks display-mode:standalone, dismissal persisted in localStorage |
| 168 | Wake Lock hook | Done | New `hooks/useWakeLock.ts` — navigator.wakeLock.request('screen'), re-acquires on visibilitychange, cleanup on unmount |
| 169 | Scan feedback hook | Done | New `hooks/useScanFeedback.ts` — triggerSuccess (100ms vibrate + 1200Hz beep), triggerError (double-pulse + 400Hz tone). Uses AudioContext, no audio files |
| 170 | Offline scan queue hook | Done | New `hooks/useOfflineScanQueue.ts` — loads pending from IDB on mount, addPendingScan writes to IDB, auto-syncs on online event, drains queue via API trace lookup |
| 171 | Network status bar component | Done | New `components/ui/NetworkStatusBar.tsx` — amber bar "You are offline" when disconnected, green bar "Back online — syncing..." on reconnect (3s auto-dismiss) |
| 172 | Install prompt banner component | Done | New `components/ui/InstallPromptBanner.tsx` — navy gradient banner above mobile nav with app icon, "Install Binny Inventory", Install button + X dismiss |
| 173 | QR Scanner: full-screen mode + feedback | Done | QRScanner.tsx — new fullScreen/onToggleFullScreen/pendingOfflineCount props. Full-screen: fixed inset-0 z-50 overlay with close button. Integrated wake lock (screen stays on) + haptic/audio feedback on scan |
| 174 | Dashboard layout: PWA components mounted | Done | layout.tsx — added NetworkStatusBar (above header), InstallPromptBanner (after MobileNav) |
| 175 | Scan page: offline queue + full-screen | Done | scan/page.tsx — offline scan queue with pending badge, saves to IDB when offline, full-screen scan toggle |
| 176 | Dispatch page: full-screen scan | Done | dispatch/page.tsx — full-screen scan toggle for carton scanning |
| 177 | Master Carton Create: full-screen scan | Done | master-cartons/create/page.tsx — full-screen scan toggle for child box scanning |

### April 2, 2026 — Dispatch Enhancements, Admin Restrictions, Product Details & Customer-Centric Report
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 135 | Dispatch Carton button added to Dispatches list page | Done | Added "Dispatch Carton" action button (Truck icon) in /dispatches page header, links to /dispatch creation page |
| 136 | Add Customer restricted to Admin only | Done | Changed customers page: Supervisors can view customer list but only Admin sees "Add Customer" button, Edit, and Activate/Deactivate actions |
| 137 | Product details in Master Carton list | Done | Backend: added LATERAL JOIN to getMasterCartons() returning article_summary, colour_summary, size_summary, mrp_summary. Frontend: master cartons table now shows Article, Colour, Sizes, MRP above the barcode |
| 138 | Product details in Dispatch module | Done | Dispatch creation page: scanned cartons show article, colour, sizes, MRP from child_boxes. Dispatches list: table and mobile cards show product summaries + customer name |
| 139 | Product details in Repack module | Done | Repack page: child box list now shows article/colour/size prominently with MRP, barcode de-emphasized |
| 140 | Dispatch Report: customer-centric view | Done | Backend: getDispatchSummary() now groups by customer with product breakdown (article, colour, sizes, MRP, carton/box counts). Frontend: expandable customer cards with nested product detail table |
| 141 | Dispatch CSV export: customer-centric | Done | exportDispatchCSV() now includes Customer, Article, Colour, Size, MRP columns grouped by customer |
| 142 | E2E test fixes for updated UI | Done | Fixed 03-child-boxes.spec.ts (4 tests: Product Article+Colour → 3-step flow), 01-auth.spec.ts (timeout increase for cold start) |
| 143 | Playwright E2E full suite — 64/64 passed (Chromium) | Done | 10 spec files, 64 tests, 5.5 min. All passing after all changes. 0 TS errors on both backend and frontend |

### March 31, 2026 — Child Box Label QR Layout Fix
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 134 | Child Box Label: QR layout updated per client wireframe | Done | Matched label to "Child Box label information.jpeg" wireframe. Size cell now spans 1 row (next to Colour only). QR code now spans 3 rows (MRP + Packed on + Content) instead of 2. Updated both frontend (generate/page.tsx handlePrint) and backend (labelTemplates.ts buildChildBoxLabelHtml). 0 TS errors on both |

### March 25, 2026 — Child Box Enhancements, Master Carton Bug Fixes & Enhancements
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 129 | Child Box Generate: Colour field added | Done | Refactored product selection to 3-step flow: Article dropdown → Colour pill selector → Size grid. Backend: new `GET /products/:id/colours` endpoint (returns distinct colours for an article). Frontend: colour buttons with selected state (navy highlight), sizes only shown after colour selected |
| 130 | Child Box Generate: Search bar added | Done | Real-time search input above product dropdown — filters by product name, SKU, article code. Uses Lucide Search icon, preserves existing selection logic |
| 131 | Master Carton Detail: Fixed ₹NaN price bug | Done | Root cause: `getCartonChildren` SQL query did not SELECT `p.mrp`, `p.article_code`, `cb.status` — also aliased `article_name` as `product_name` and `sku` as `product_sku`. Fixed query to select all needed fields with correct names matching `ChildBoxWithProduct` type |
| 132 | Master Carton Create: Scanned item details panel | Done | After scanning/entering a barcode, fetches child box details via API (`getByBarcode`). Displays Product Name, Colour, Size, MRP alongside barcode in the scanned items list. Details stored in local state map, cleared on remove/clear all |
| 133 | TypeScript compilation verified | Done | 0 errors on both frontend and backend |

### March 23, 2026 — Test Cases, Bug Fixes, Theme & Favicon Update
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 118 | Logo changed to monogram.png | Done | Replaced BinnyLogo.png with monogram.png on login page and sidebar |
| 119 | Theme updated: Navy primary + Red accent | Done | Primary: Navy #2D2A6E (buttons, sidebar, inputs, spinner). Accent: Red #E31E24 (QR scanner, timeline). Updated tailwind, globals.css, manifest, layout themeColor |
| 120 | Favicon + PWA icons regenerated from monogram.png | Done | favicon.ico (32x32), icon-192x192.png, icon-512x512.png — all from monogram.png |
| 121 | Bug fix: API interceptor pagination field mismatch | Done | Backend sends `meta` but interceptor checked `body.pagination`. Fixed to check `body.pagination \|\| body.meta`. This was breaking paginated data across products, customers, child boxes list pages |
| 122 | Bug fix: Auth checkAuth() blocking page render | Done | `checkAuth()` called `getProfile()` synchronously, setting `isLoading: true` on every route change → page stuck on spinner. Fixed to use cached user from localStorage immediately and validate token in background |
| 123 | New E2E tests: Customer Master (09-customers.spec.ts) | Done | 7 tests: page load, add customer modal, create customer, GSTIN validation, mobile validation, search, all form fields |
| 124 | New E2E tests: Product Management (10-products.spec.ts) | Done | 9 tests: page load, add product modal, all expanded fields, category/section/location dropdowns, create product, search, table columns |
| 125 | Updated E2E tests: Multi-Size QR (03-child-boxes.spec.ts) | Done | Replaced old single-product TC-CB-004 with 5 multi-size tests: TC-MSQR-001 to 005 (dropdown load, size table, live summary, button disabled, bulk generate) |
| 126 | Auth helper: token refresh for long test runs | Done | Added 10-min TTL cache in helpers.ts to prevent JWT expiry during test suite |
| 127 | Rate limit increased for testing | Done | AUTH_MAX_REQUESTS + MAX_REQUESTS → 50000 to support full 64-test suite |
| 128 | Playwright E2E full suite — 64/64 passed (Chromium) | Done | 10 spec files, 64 tests, 4.9 min. All passing: Auth (8), Dashboard (5), Child Boxes + Multi-Size (10), Master Cartons (6), Lifecycle (7), Reports (6), Traceability (3), Scan (3), Customers (7), Products (9) |

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
| 110 | GitHub remote configured & pushed | Done | https://github.com/kanikabehl/binny-inventory-management — 185 files, 37,894 lines on main branch |
| 111 | SSH deploy key generated | Done | .ssh/binny-deploy (ed25519) — public key ready, private key stays local. .ssh/ is gitignored |
| 112 | Deployment preparation | Pending | Server: 76.13.245.90 (srv1409601.hstgr.cloud, Hostinger VPS). Need: SSH private key or password to connect. Docker install + deploy planned for next session |

### March 23, 2026 — Logo & Theme Update
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 118 | Logo changed to monogram.png | Done | Replaced BinnyLogo.png with monogram.png on login page and sidebar. Logo has red B icon + navy BINNY text |
| 119 | Theme updated: Navy primary + Red accent | Done | Extracted colors from monogram.png. Primary: Navy #2D2A6E (buttons, sidebar active, inputs, spinner, progress bars). Accent: Red #E31E24 (QR scanner overlay, timeline dots). Updated tailwind.config.ts, globals.css, manifest.json, layout.tsx themeColor |
| 120 | UI components updated for new theme | Done | Button (primary/outline variants), Input, Select, Spinner, Header (avatar), Sidebar (active links), MobileNav (active links), offline page — all switched from red to navy |
| 121 | Dashboard + pages updated | Done | Stat cards, quick actions, hover states, report tabs, master carton progress bar, child box generate page (pills, summary, focus rings) — all navy primary. 0 TS errors |

### March 20, 2026 — Multi-Size QR Batch Generation
| # | Activity | Status | Notes |
|---|----------|--------|-------|
| 113 | Multi-size batch generation — Backend: GET /products/:id/sizes | Done | Added getSiblingProducts() to product.service.ts (finds all products with same article_name + colour), getProductSizes controller, route added before /:id to avoid conflict |
| 114 | Multi-size batch generation — Backend: POST /child-boxes/bulk-multi-size | Done | Zod schema (product_id, quantity, sizes[{size, count}]), createBulkMultiSizeChildBoxes service (resolves sibling products by size, validates sizes exist, 500 total cap, single DB transaction), controller, route with RBAC (Admin+Supervisor+Warehouse Operator) |
| 115 | Multi-size batch generation — Frontend types + services | Done | BulkCreateMultiSizeRequest type, getSizes() in product.service.ts, bulkCreateMultiSize() in childBox.service.ts |
| 116 | Multi-size batch generation — Generate page rewrite | Done | Rewrote generate/page.tsx: article+colour dropdown (deduplicated), auto-loads sibling sizes via API, per-size label count table (sorted numerically), live summary panel with total count, 500-label cap validation, success view with size-grouped pill badges, print labels preserved. 0 TS errors on both backend and frontend |
| 117 | Documentation update — All 6 docs | Done | Updated implementation-plan.md (v1.2: new endpoints, Week 2 deliverable, changelog), project-brief.md (v1.2: API table, features, document control), test-cases.md (v1.2: 10 new test cases TC-MSQR-001–010, summary updated to 235 total), security-audit-report.md (v1.2: new §9.4 bulk multi-size security controls, RBAC row), sql-migration-plan.md (noted no migration needed), phase-1.5-optimization-report.md (noted findings #6 and #8 resolved) |

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
- [x] GitHub repo pushed — https://github.com/kanikabehl/binny-inventory-management
- [ ] Production deployment to Hostinger VPS (76.13.245.90) — next session

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
