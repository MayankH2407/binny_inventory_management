# Basiq360 Inventory Management System — Progress Tracker
## Client: Binny Footwear (Mahavir Polymers Pvt. Ltd.)
## Vendor: Basiq360
## Project Start: March 2026
## Phase: 1 (6 weeks)

---

## Project Status: PHASE 1 COMPLETE — PHASE 1.5 COMPLETE — PHASE 2 (UI ENHANCEMENT) COMPLETE — PHASE 3 (PWA) COMPLETE — DEPLOYED TO PRODUCTION — PHASE 4 (MEETING FEEDBACK) COMPLETE — PHASE 5 (MOBILE APP) IN PROGRESS — PHASE 6 (POST-QA MODIFICATIONS) IN PROGRESS

---

## Phase 5 Mobile — Repack wizard (April 23, 2026)

### April 23, 2026 — Mobile: Full Repack 4-step wizard

**Goal:** Replace `mobile/app/repack.tsx` placeholder with a real multi-step repack flow: scan source carton → select boxes → scan destination carton → confirm + commit.

**Files rewritten:**
| File | Lines | Description |
|------|-------|-------------|
| `mobile/app/repack.tsx` | 561 | Full 4-step repack wizard with inline Stepper, BoxRow, CartonInfoCard, RoleGate |

**Key implementation details:**
- **Step 1 (Source):** Scan source carton via `getByBarcode`, validates status (DISPATCHED → error, CREATED/child_count=0 → "empty"), then fetches full carton via `getById` to hydrate `child_boxes` array. Advances to Step 2.
- **Step 2 (Select):** Checkbox list of `sourceCarton.child_boxes`. "Select all / Clear all" toggle, running `X of Y selected` count. "Continue" disabled when selection empty. "Back" goes to Step 1 and clears all forward state.
- **Step 3 (Destination):** Shows progress banner (selected count + source barcode). Scans dest carton via `getByBarcode`, validates: not same as source, not CLOSED/DISPATCHED, capacity check (`dest.child_count + selected.size <= dest.max_capacity`). Advances to Step 4.
- **Step 4 (Confirm):** Two-column FROM/TO transfer card with barcode + status badges. Moving N boxes summary line. Expandable/collapsible barcode list. "Commit Repack" danger button → `Alert.alert` confirm dialog → `repackMutation.mutate({ source_carton_id, destination_carton_id, child_box_barcodes })`.
- **Stepper:** Horizontal 4-dot row with connecting lines. Past steps show checkmark (primary bg); current step shows number (primary bg); future steps border-only. Tapping a past dot navigates back and clears forward state.
- **getById refetch:** Always called after `getByBarcode` for source, because the QR endpoint may return a stub without `child_boxes`. Dest scan only needs `getByBarcode` (no need to enumerate its boxes).
- **Mutation invalidates:** `['masterCartons']`, `['masterCarton']`, `['childBoxes']`, `['inventory-summary']`, `['inventory-hierarchy']`, `['dashboard-stats']`.
- **Android hardware back:** Wired — `BackHandler.addEventListener` active whenever any progress state is set. Shows "Cancel repack?" alert; confirm resets all state. iOS swipe-back preserves wizard state (acceptable; noted as Phase D polish).
- **Role gate:** `Admin`, `Supervisor`, `Warehouse Operator` allowed.

**tsc result:** 11 pre-existing errors in `__tests__/` (unchanged). Zero errors in new file.

---

## Phase 5 Mobile — Dispatch Create screen (April 23, 2026)

### April 23, 2026 — Mobile: Full Dispatch Create flow

**Goal:** Replace the `dispatch/create.tsx` placeholder with a full dispatch flow: scan 1+ CLOSED master cartons, pick a customer from a searchable modal picker, fill optional transport fields, submit POST to `/dispatches`.

**Files rewritten:**
| File | Lines | Description |
|------|-------|-------------|
| `mobile/app/dispatch/create.tsx` | 440 | Full dispatch create screen with inline `CustomerPicker` modal, multi-scan carton list, optional details form, role gate |

**Key implementation details:**
- `handleScan`: fetches carton by barcode via `masterCartonService.getByBarcode`, validates `status === 'CLOSED'`, deduplicated by `carton_barcode`. Status-specific alert messages for ACTIVE/CREATED/DISPATCHED states.
- `useApiMutation<DispatchRecord, CreateDispatchRequest>`: invalidates `masterCartons`, `dispatches`, `childBoxes`, `inventory-summary`, `inventory-hierarchy`, `dashboard-stats`. Haptic + `router.replace('/dispatch')` on success.
- `CustomerPicker`: inline component (single-screen use), `useInfiniteQuery` with `['customers-picker', { search }]`, enabled only when modal `visible`. 300 ms debounce on search. `FlatList` with `onEndReached` infinite scroll. Resets search state on each open via `useEffect([visible])`.
- `Input` component reused for all 5 detail fields (Destination, Transport Details, LR Number, Vehicle Number, Notes). Notes field uses `multiline`, `numberOfLines={3}`, `textAlignVertical="top"`.
- Submit button: plural/singular grammar (`N Carton` vs `N Cartons`), disabled when `scannedCartons.length === 0 || !customer || dispatchMutation.isPending`.
- `RoleGate` allows `Admin`, `Supervisor`, `Dispatch Operator`; Warehouse Operator blocked with `DeniedView`.
- No deviation from `CreateDispatchRequest` typed fields — no extra fields added.

**tsc result:** 11 pre-existing errors in `__tests__/` (unchanged). Zero errors in new file.

---

## Phase 5 Mobile — Child Boxes real list screen + detail stub (April 23, 2026)

### April 23, 2026 — Mobile: Child Boxes infinite-scroll list + [id] detail stub

**Goal:** Replace the `child-boxes/index.tsx` placeholder with a full-featured list screen (infinite scroll, search with debounce, status filter chips, aging highlight, FlatList) mirroring the web `/child-boxes` page. Add a tappable `[id].tsx` detail stub so navigation is not dead-ended.

**Files created/rewritten:**
| File | Lines | Description |
|------|-------|-------------|
| `mobile/app/child-boxes/index.tsx` | 290 | Full list screen: `useInfiniteQuery`, debounced search, 4 status chips, aging legend + row tints, FlatList with infinite scroll + pull-to-refresh |
| `mobile/app/child-boxes/[id].tsx` | 130 | Detail stub: fetches single box via `useApiQuery`, shows all fields in a two-column label/value layout, Phase B.2 note |

**Key implementation details:**
- `useInfiniteQuery` (TanStack v5) with `initialPageParam: 1`, `getNextPageParam` from `last.page < last.totalPages`. Query key includes `{ status, search }` so filter/search changes auto-invalidate.
- Debounce: inline `useEffect` + `setTimeout(300ms)` — no lodash dependency.
- `FlatList` used at root level (not nested in `ScrollView`) to avoid the illegal nesting issue.
- Card bg tint computed eagerly as a merged object style (spread) rather than a style array — avoids TS2322 on `Card`'s `style?: ViewStyle` prop.
- Aging legend (yellow/red swatches) shown only when filter is `ALL` or `FREE`.
- Age pill shows for FREE boxes with age ≥ 90d; yellow 90–179, red 180+.
- Row tint: `rgba(254,243,199,0.6)` for yellow band, `rgba(254,226,226,0.6)` for red band.
- Monospace barcode font: `Menlo` (iOS) / `monospace` (Android) via `Platform.OS`.

**tsc result:** 11 pre-existing errors in `__tests__/` (unchanged). Zero errors in new files.

---

## Phase 5 Mobile — Role-gating + stub routes (April 23, 2026)

### April 23, 2026 — Mobile: RoleGate primitive + 14 stub screens + menu navigation wired

**Goal:** Build role-gating wrapper, stub all web route equivalents as expo-router screens, and rewire the Menu tab to push real routes instead of "Coming Soon" alerts.

**Files created:**
| File | Lines | Description |
|------|-------|-------------|
| `mobile/components/RoleGate.tsx` | 22 | `RoleGate` wrapper + `useHasRole` hook; reads `useAuthStore`, no effects |
| `mobile/components/PlaceholderScreen.tsx` | 57 | Shared stub shell with `Stack.Screen` title injection, primary-color icon tile |
| `mobile/app/child-boxes/index.tsx` | 9 | Stub: Child Boxes list |
| `mobile/app/child-boxes/generate.tsx` | 9 | Stub: Generate child box QR labels |
| `mobile/app/master-cartons/index.tsx` | 9 | Stub: Master Cartons list |
| `mobile/app/master-cartons/create.tsx` | 9 | Stub: Pack master carton |
| `mobile/app/dispatch/index.tsx` | 9 | Stub: Dispatch history |
| `mobile/app/dispatch/create.tsx` | 9 | Stub: Create dispatch |
| `mobile/app/storage.tsx` | 9 | Stub: Storage |
| `mobile/app/unpack.tsx` | 9 | Stub: Unpack |
| `mobile/app/repack.tsx` | 9 | Stub: Repack |
| `mobile/app/products.tsx` | 9 | Stub: Products |
| `mobile/app/customers.tsx` | 9 | Stub: Customers |
| `mobile/app/reports.tsx` | 9 | Stub: Reports |
| `mobile/app/users.tsx` | 9 | Stub: Users |
| `mobile/app/settings.tsx` | 9 | Stub: Settings |

**Files modified:**
- `mobile/app/(tabs)/menu.tsx`: Replaced `Alert.alert('Coming Soon', ...)` with `router.push(item.route as any)`. Added 5 new items (Unpack, Repack, Storage, Settings, Users). Wrapped Products/Customers/Reports in `<RoleGate allow={['Admin','Supervisor']}>` and Users in `<RoleGate allow={['Admin']}>`. Pack route updated to `/master-cartons/create`. Logout handler untouched.

**Root `_layout.tsx`:** No changes needed. Root `<Stack>` only names `(auth)` and `(tabs)` explicitly; all new routes outside those groups are auto-registered by expo-router file routing. Per-screen `headerShown: true` in `PlaceholderScreen` overrides the global `headerShown: false` default correctly.

**tsc result:** 11 pre-existing errors in `__tests__/` (stale `username`/`email` field mismatches and a return-type mismatch in test mocks). Zero errors in new or modified files.

---

## Phase 6 — Post-QA Modifications (batched; testing deferred to after all mods)

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

## CURRENT EXECUTION (resumption marker — MOBILE PHASE 5 PARITY IN PROGRESS 2026-04-23)

**Active workstream:** Mobile app feature parity with web portal. Opus plans, Sonnet executes per file-scoped tasks. Web Phase 6 mod queue is **paused** — user shifted focus to mobile after the Apr 23 testing-portal deploy.

**Decisions locked (2026-04-23):**
- Label printing stays **web-only** for Phase 5 — no Bluetooth TSPL integration on mobile. No print items in the mobile menu.
- Parity = **adapted, not literal** — scan-heavy operator flows first-class; admin masters read + edit-single; no bulk-size-range on mobile, no 4-tab reports explorer, no CSV export.
- Offline scan queue → **deferred to Phase 5.5** (post-parity).

**Plan (phased, ~12–17d total):**
- **Phase A (foundation)** — ✅ done 2026-04-23. Env, camera scanner, RoleGate, stub routes, menu rewire.
- **Phase B (operator workflows, scan-heavy)** — in progress. Child-boxes list, master-cartons list, pack (create carton by scanning boxes), carton detail, unpack, storage, repack, dispatch create, dispatch list. Camera scanner reused throughout.
- **Phase C (admin / masters)** — products list+edit, customers list+edit, users admin, settings. Read-first; creates selectively.
- **Phase D (polish + testing)** — empty states, network-error toasts, Maestro e2e suite expanded from 10 login flows to ~40–50 flows covering all screens.

**Env state:**
- Local backend: `binny_backend` + `binny_postgres` docker containers up; frontend dev on :3000 still hot-reloading for any web work.
- Testing portal: `srv1409601.hstgr.cloud/binny/` on Phase 6 batch #1 (commit `1b56928` deployed 2026-04-23).
- Mobile APK tooling: ready from Apr 20. No APK built against the new Phase A code yet — EAS `preview` profile needed when we cut a build for the client.

**Next up:** Phase B.1 — Child Boxes list + Master Cartons list (parallel Sonnet tasks).

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
