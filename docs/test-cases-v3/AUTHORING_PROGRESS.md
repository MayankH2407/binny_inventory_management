# Mobile Test-Case Authoring — Session Tracker

**Workstream:** Add mobile coverage to v3 test-case suite (phases 21-32 + README update).
**Started:** 2026-05-02
**Owner:** Opus orchestrator + Sonnet sub-agents (one Sonnet agent per session).
**Resume rule:** Future sessions read this file first to find the next pending session, then proceed.

**Commit rule:** No per-session commits during this workstream. User will do one combined commit covering all 13 sessions when the full mobile coverage authoring is done. Working tree will grow uncommitted across sessions — that's expected.

**Cross-workstream note (2026-05-02) — TWO supplemental web refreshes queued:**

**Supp #1 — phase-09 label refresh (from commit `e6a3617`):** Child-box label print is now **2-up on a 100mm-wide roll**. phase-09 (`phase-09-childbox-labels.md`, 56 TCs) needs:
- New `@page` is `100mm 50mm`, not `50mm 50mm`
- Labels are paired into rows; page-break happens on `.row`, not `.label`
- Odd-count print runs get a hidden `.label-empty` placeholder in the last row
- Each label is still 50×50mm with a 1.5px border; the inner table content is unchanged

**Supp #2 — HID scanner UX refresh (from commit `eba073d`):** Web scan UX rebuilt around the BPS250BC HID barcode scanner. The new `<HIDScannerInput>` component is the primary scan surface; camera is fallback only. Affects these phases:
- phase-10 (Master Cartons) — TCs that assert "Open Scanner" button or camera-first UX
- phase-11 (Samples) — same
- phase-12 (E-commerce) — same
- phase-13 (Dispatch) — same, plus the 3-source picker has 3 distinct HID inputs (only the active tab's is focused)
- phase-18 (Scan & Traceability) — primary scan UI was the camera card; now it's HID input with camera behind "Use Camera Instead" toggle

For each affected phase, new TCs to add:
- HID input is auto-focused on page mount (green "Scanner ready" badge visible)
- Pressing Enter (or HID scanner injection) with valid value triggers `onScan` and clears + refocuses input
- Input refocuses globally on any printable keystroke when nothing else is focused (focus drift recovery)
- "Use Camera Instead" toggle reveals `<QRScanner>` as the fallback path
- Each role can use both HID and camera paths (no role gate on the component itself)

Both supplemental refreshes are phase updates to the **web** suite, NOT new mobile phases. Track them as "Session B-supp-1" and "Session B-supp-2" or similar; do not collide with the 13-session mobile numbering.

---

## Plan summary

13 sessions producing ~870-1,170 new mobile TCs. Each session = one phase markdown file under `docs/test-cases-v3/`. The session boundary is the natural pause/resume point. Last session (13) updates the v3 README + this tracker to reflect "all sessions complete".

Format conventions (carried from v3): 8-column markdown table (`TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes`); E2E flows on mobile use Maestro YAML (not Playwright); embed YAML in fenced blocks under each Section's table; cover all 4 roles + Unauthenticated where applicable; no summarisation; each TC standalone.

---

## Session status

| # | Session | File | Status | TC count | Commit | Notes |
|--:|---|---|---|---:|---|---|
| 1 | Mobile foundation | `phase-21-mobile-foundation.md` | ✅ Authored 2026-05-02 | 106 | (deferred — combined at end) | Auth, AuthGate, tab bar, Dashboard, Menu grid (role-gated tiles), Settings. 21 Maestro flows. 2 `[?]` flags. |
| 2 | Mobile inventory | `phase-22-mobile-inventory.md` | ✅ Authored 2026-05-02 | 94 | (deferred — combined at end) | 22 sections covering Child Box hierarchy w/ MRP grouping (M5), Master Carton tab w/ status pills + util bar + load-more pagination, per-tab breadcrumbs, summary cards. 19 Maestro flows. 4 `[?]` flags. |
| 3 | Mobile products + child-boxes | `phase-23-mobile-products-childboxes.md` | ✅ Authored 2026-05-02 | 122 | (deferred — combined at end) | 23 sections covering Products (30), Child Boxes incl. aging tint + Generate stub (31), Repack (28), Unpack (16), Storage (17). 15 Maestro flows. 6 `[?]` flags incl. 2 real behavioral inconsistencies. |
| 4 | Mobile master cartons | `phase-24-mobile-master-cartons.md` | ✅ Authored 2026-05-11 | 150 | (deferred — combined at end) | 25 sections covering list (role-agnostic view, search debounce, status chips, infinite scroll, FAB role gate), Pack Carton (capacity stepper, scan flow w/ FREE+GENERATED, dedupe, capacity-reached, submit), Detail (header, timeline, action-bar role gate, Close & Store, Unpack confirm, Dispatch button matrix, assortment, collapsible child-boxes >5). 10 Maestro flows. 7 `[?]` flags (13-19) incl. Dispatch Op locked out of dispatch on mobile despite `canDispatch=true`, and GENERATED-box pack-accept potential web/mobile inconsistency. |
| 5 | Mobile samples (M2) | `phase-25-mobile-samples.md` | ✅ Authored 2026-05-11 | 178 | (deferred — combined at end) | 30 sections covering list (role-agnostic view + FAB gate **excluding** Warehouse Op — differs from cartons), Customer picker modal (autofocus, debounced search, infinite scroll), Create (optimistic add w/ rollback on invalid status, Name required, optional Customer/Recipient/Purpose/Date/Notes, Clear All), Detail (per-button role gates → Dispatch Op CAN dispatch CLOSED samples unlike cartons, Add Box pessimistic flow, Close, Full Unpack, individual Remove Box w/ trash, assortment, collapsible). 12 Maestro flows. 9 `[?]` flags (20-28) incl. role-gate strategy inconsistency between samples (per-button) and cartons (outer RoleGate), Sample Date as bare TextInput, optimistic-vs-pessimistic add divergence. |
| 6 | Mobile e-commerce (M3) | `phase-26-mobile-ecommerce.md` | ✅ Authored 2026-05-11 | 170 | (deferred — combined at end) | 30 sections covering list (purple `#7C3AED` FAB instead of primary, marketplace+listing_sku composite row 3, same `[Admin,Supervisor]` FAB gate as samples), Create (Marketplace/Order Ref/Listing SKU/Mapped Date/Notes form; same optimistic-add flow as samples; no customer picker), Detail (per-button role gates → Dispatch Op CAN dispatch CLOSED records, expanded timeline w/ Marketplace+Order Ref+Listing SKU rows, Add Box/Close/Full Unpack/Remove Box flows mirrored from samples). 8 Maestro flows. 8 `[?]` flags (29-36) incl. marketplace displayed twice on detail header+timeline, FAB color hardcoded literal, list-row-3 inconsistent labelling between marketplace-present and listing_sku-only modes, marketplace getAll filter declared but UI-unused, per-button vs outer-gate inconsistency confirmed across 3 modules. |
| 7 | Mobile dispatch (M4) | `phase-27-mobile-dispatch.md` | ✅ Authored 2026-05-11 | 185 | (deferred — combined at end) | 28 sections covering list (no status chips — terminal records; source-type chip Carton/Sample/E-commerce w/ distinct colours; date-range filter w/ silent invalid-string drop; quick-select Today/7/30/Clear chips), FAB role gate (NEW pattern — Warehouse Op excluded, Dispatch Op included), Create (3-way segmented source picker, switchSource clears OTHER sources but preserves shared form, Master Carton CLOSED-only multi-record w/ status-specific reject messages, Sample/E-commerce CLOSED-only single-record w/ ACTIVE not specifically handled, Customer picker required, shared LR/Vehicle/Transport/Destination/Notes), Detail (no role gate, no actions, header/Customer/Source w/ View-source jump-link/Shipment conditional/Contents/Notes/audit footer). 12 Maestro flows. 14 `[?]` flags (37-50) incl. **real bugs**: `sourceType` ternary always returns `'master_carton'` (legacy mislabelling), `invalidateKeys` omits `samples`/`ecommerce` (stale source-list after dispatch), `router.replace('/dispatch')` instead of detail (inconsistency vs all other modules), audit-footer same-day check ignores timezone. |
| 8 | Mobile customers + users | `phase-28-mobile-customers-users.md` | ✅ Authored 2026-05-11 | 143 (135 cust + 8 user) | (deferred — combined at end) | 24 sections covering Customers (screen + FAB role gate `[Admin, Supervisor]` — Warehouse Op AND Dispatch Op denied; list w/ type filter Primary Dealer/Sub Dealer; create w/ Type toggle + DealerPickerModal for Sub Dealers (client-side filter, no debounce); detail w/ View/Edit toggle, dynamic title, no delete, no activate/deactivate UI) and Users module gap (Admin-only tile routes to `/users` which has no screen → expo-router unmatched route; `user.service.ts` fully declared but UI-dead). 10 Maestro flows. 14 `[?]` flags (51-64) incl. **Users tile leads to unmatched route (real product gap — either remove tile or build screen)**, no customer delete on mobile, no is_active toggle, FAB gate redundant w/ screen gate, DealerPickerModal duplicated across `new.tsx`+`[id].tsx`, primary_dealer_name fallback exposes UUID. |
| 9 | Mobile scan + traceability | `phase-29-mobile-scan-traceability.md` | ✅ Authored 2026-05-11 | 113 | (deferred — combined at end) | 20 sections covering scan tab (no role gate; all 4 roles), camera scanner permission flow (no settings deep-link on denied), `parseQRCode` (4 prefixes × short + legacy formats; case preservation inconsistency), BarcodeScanner expectedType filter w/ rejection toast, traceByBarcode + child box / master carton / timeline result rendering, GENERATED auto-activation side effect on trace (silent FREE transition, silent failure swallow). 7 Maestro flows. 11 `[?]` flags (65-75) incl. **#65 Sample/E-commerce trace results NOT rendered in UI (real UX gap)**, **#66 auto-activation triggered by read-only trace operation (warehouse-ops risk)**, #67 stale `BINNY-CB-...` placeholder post-migration, case-preservation inconsistency between short/legacy paths in parseQRCode. |
| 10 | Mobile reports (M6) | `phase-30-mobile-reports.md` | ⏳ Pending | — | — | Stock Sample/Ecommerce columns + Totals; Cartons / Dispatches / Activity tabs |
| 11 | Cross-platform parity | `phase-31-cross-platform-parity.md` | ⏳ Pending | — | — | Web→mobile data, JWT sharing, status changes both ways |
| 12 | Mobile edge cases | `phase-32-mobile-edge-cases.md` | ⏳ Pending | — | — | Network, offline, camera perms, token refresh, perf smoke |
| 13 | README + tracker finalise | (updates `README.md` + this file) | ⏳ Pending | — | — | Add mobile capability matrix rows, drop "out of scope" line, finalise tracker |

---

## How to resume

1. Read this file. Find the lowest # row with status `⏳ Pending`.
2. Read the corresponding phase brief in this tracker (Session 2 brief is below; subsequent briefs are written by Opus when that session starts so they reflect any code drift).
3. Plan the brief with Opus (or read it from this file if pre-written), dispatch Sonnet to author the file.
4. Verify: TC count in target range, all 4 roles + Unauthenticated covered where applicable, format matches phase-21, Maestro YAML embedded for E2E sections.
5. Commit the phase file.
6. Update this tracker: mark session complete, fill TC count + commit hash.
7. Stop and ask the user whether to continue with the next session.

The 4-role rule: For positive role tests (role X CAN do Y), each allowed role gets its own TC. For negative role tests (role X CANNOT do Y), each disallowed role gets its own TC. Use TC ID gaps in numbering to insert per-role rows without renumbering downstream IDs.

---

## Open questions raised across sessions

(From phase-21, Session 1)
1. **Deep-link return-to-target after login** — when an unauthenticated user deep-links to a protected route, AuthGate redirects to login but the intended destination is not stored. Needs product confirmation: should we add return-to behavior, or document this as expected? (TC-MOB-FOUND-036)
2. **Concurrent device logout / token revocation** — JWT is stateless on the backend; revocation on logout from another device may not be enforced server-side. Needs backend confirmation: is there a JWT revocation list? (TC-MOB-FOUND-096)

(From phase-22, Session 2)
3. **No explicit error UI for inventory API failures** — `useApiQuery` errors fall through to empty state with no banner/toast. Needs UX confirmation: is silent fallback acceptable, or should we surface "Failed to load inventory"?
4. **Missing `node.id` on carton leaf** — the tap handler silently does nothing if `node.id` is missing. No user feedback. Should we render the card differently (e.g., disabled style) or surface a message?
5. **Maestro carton-leaf tap selector** — matching by status text "ACTIVE" is non-deterministic when multiple cards have ACTIVE pills on screen. Needs `testID` props on `CartonLeafCard` components or an alternative selector strategy.
6. **Large `cartonCount` formatting** — values render as raw integers without locale formatting (no thousands separator). Cosmetic only; flag for product call.

(From phase-23, Session 3)
7. **Menu tile vs screen-level role gate consistency** — denied roles (e.g., Dispatch Op for Products) should NOT see the tile in Menu; verify menu hides it AND the screen-level RoleGate handles direct deep-link denial. Cross-reference with phase-21 menu tests.
8. **Unpack does NOT block CREATED-status cartons** — Repack and Storage error on CREATED ("Source carton is empty" / "Add child boxes"), but Unpack does not. Likely a behavioral gap in `mobile/app/unpack.tsx`. Needs product confirmation: should CREATED be blocked, or is unpacking 0 boxes a valid no-op?
9. **Storage RoleGate vs backend authorize() mismatch** — Storage allows Warehouse Operator at the mobile screen level, but the backend may deny the close mutation (`POST /master-cartons/:id/close` is Admin+Supervisor per the v3 capability matrix). Mobile UX shows the screen and only fails at API call. Needs alignment: either widen the backend allow list or narrow the mobile RoleGate.
10. **Repack mutation field name** — Sonnet wrote TCs assuming `child_box_barcodes` (string array) in the payload. Cross-check with phase-10 web tests + `mobile/services/masterCarton.service.ts`.
11. **Generate Labels Menu tile label** — the visible text in `mobile/app/(tabs)/menu.tsx` for the child-box generate stub may differ from `Stack.Screen title`. Verify exact label.
12. **No distinct network-error UI in Products / Child Boxes** — both screens fall through to the empty-state copy "Try adjusting filters." on network failure. Same UX concern as item 3.

(From phase-24, Session 4)
13. **Dispatch Operator cannot dispatch from mobile carton detail** — `RoleGate allow={[Admin, Supervisor, Warehouse Operator]}` wraps the entire action bar in `mobile/app/master-cartons/[id].tsx:275`. The Dispatch button (inside the same gate) uses `useHasRole([Admin, Supervisor, Dispatch Operator])` which is `true` for Dispatch Op, but the outer RoleGate hides everything first. On web, Dispatch Op can dispatch directly from carton detail. Mobile-web parity gap. Resolution: move Dispatch button outside the outer gate or widen the allow list.
14. **Dispatch button does not pass carton ID** — `router.push('/dispatch/create')` at `master-cartons/[id].tsx:341` navigates without source carton context. User must re-scan on the dispatch screen. Intentional re-verification step or UX friction?
15. **Unpack button shown on CREATED carton with 0 boxes** — `master-cartons/[id].tsx:347-363` renders Unpack with no `child_count > 0` guard. Cross-reference phase-23 item 8 (Unpack screen also doesn't block CREATED). Should detail Unpack be hidden/disabled when `child_count === 0`?
16. **GENERATED-status child box accepted during Pack Carton on mobile** — `mobile/app/master-cartons/create.tsx:118` allows both `FREE` and `GENERATED`. Verify web Create Master Carton at `frontend/src/app/(dashboard)/master-cartons/create/page.tsx` has the same allow list. Possible mobile-permissive inconsistency.
17. **Close & Store toasts on success, Unpack does not** — `closeMutation` has `successMessage`; `unpackMutation` has none (`master-cartons/[id].tsx:128` vs `:154-163`). Intentional asymmetry or oversight?
18. **Race condition on rapid double-scan during pack** — `create.tsx:102` dedupes from React state snapshot; two in-flight `handleScan` calls can both pass dedupe before either resolves. No in-flight-barcode guard. Low probability with HID scanner, higher with camera fast-trigger.
19. **No label-print flow on mobile carton detail** — web-only via TSC printer. Is mobile label-print on roadmap, or web-only by design (operators print from desktop, scan from printed labels)?

(From phase-25, Session 5)
20. **Role-gate strategy is inconsistent between samples and cartons** — `mobile/app/samples/[id].tsx:368-446` uses per-button gates (each action button conditionally rendered on its own role/status flag), so Dispatch Op CAN see + tap the Dispatch button on a CLOSED sample. `mobile/app/master-cartons/[id].tsx:275` wraps the entire action bar in an outer `RoleGate` that hides everything from Dispatch Op. Same conceptual button (Dispatch), opposite outcome on the two modules. Which is the intended design — converge to per-button (widens Dispatch Op on cartons) or to outer gate (narrows Dispatch Op on samples)?
21. **Dispatch button does not pass sample ID** — `router.push('/dispatch/create')` at `samples/[id].tsx:443` mirrors the carton gap (#14). Sample dispatch requires re-scanning at the dispatch screen.
22. **Warehouse Operator completely locked out of sample management** — FAB hidden (`index.tsx:255`), `DeniedView` on create (`create.tsx:567`), zero action buttons on detail (`[id].tsx:113` `isManager` excludes them). Yet Warehouse Op is the primary actor for cartons. Verify business intent: is sample management a managerial-only workflow by design?
23. **Sample Date has no date picker** — `create.tsx:419-428` renders a bare `TextInput` with `keyboardType="numbers-and-punctuation"` and default value `new Date().toISOString().split('T')[0]`. No YYYY-MM-DD format validation; invalid strings forwarded to API.
24. **Optimistic vs pessimistic add divergence** — Create screen (`create.tsx:247-279`) optimistically appends the barcode and rolls back on validation/API failure. Detail Add Box (`[id].tsx:151-174`) validates server-side before adding (no rollback path needed). Same conceptual action; different UX. Intentional or drift?
25. **Full Unpack on a 0-box sample has no front-end guard** — `canUnpack = isManager && (CREATED|ACTIVE|CLOSED)` (line 309) does not check `child_count > 0`. Alert reads "This will release all 0 boxes…" Backend may succeed or reject. Same class as carton #15.
26. **`SAMPLE_INVALIDATE_KEYS` includes `inventory-hierarchy` and `dashboard-stats`** — `[id].tsx:35-43`. Verify these query keys are subscribed to by active queries; otherwise invalidation is silently a no-op.
27. **CustomerPicker uses plain "Loading…" text, not `<Spinner>`** — `create.tsx:174-177`. Inconsistent with other loading states in the app. Cosmetic.
28. **Add Box panel preserves `manualBarcode` when collapsed** — `[id].tsx:146-148` doesn't reset state on `addBoxOpen=false`. Re-opening shows stale text. Cosmetic UX.

(From phase-26, Session 6)
29. **Marketplace displayed twice on e-commerce detail screen** — `mobile/app/ecommerce/[id].tsx:338` puts marketplace in `headerMeta`; lines 357-359 ALSO render it as a `<TimelineRow>`. Visual redundancy. Intentional emphasis or UX oversight? (Samples does not have this — header shows recipient, timeline doesn't.)
30. **FAB color is a hardcoded hex literal** — `mobile/app/ecommerce/index.tsx:404` uses `'#7C3AED'` directly instead of a `COLORS` constant. Brand-token drift risk; design system bypass for the one purple FAB. Cosmetic but indicative.
31. **E-commerce list card row 3 has inconsistent labelling between modes** — `mobile/app/ecommerce/index.tsx:73-82`. When marketplace present: "Marketplace: {x}[ · {sku}]". When only listing_sku present: just the SKU with no label prefix. Two display modes; pick a consistent format.
32. **Mapped Date field has no date picker** — `mobile/app/ecommerce/create.tsx:246` — same class as sample-date (#23) and shared with the cross-module "no date pickers anywhere on mobile" pattern. Cross-cutting UX gap.
33. **Dispatch button does not pass record ID — now confirmed across all three modules** — Cartons (#14), Samples (#21), E-commerce (`mobile/app/ecommerce/[id].tsx:443`). Triple-module gap; needs a single fix that flows source identity through to `/dispatch/create`.
34. **Per-button vs outer-RoleGate inconsistency confirmed module-wide** — Samples + E-commerce use per-button gates → Dispatch Op CAN dispatch CLOSED records on both. Cartons (#13/#20) wrap action bar in outer `RoleGate` → Dispatch Op CANNOT dispatch CLOSED cartons. Same conceptual button, opposite outcome on cartons. **Architectural decision needed: converge to per-button (widen carton Dispatch Op visibility) or to outer-gate (remove sample/ecommerce Dispatch Op visibility).**
35. **`getAll` accepts `marketplace?` filter but UI does not expose it** — `mobile/services/ecommerce.service.ts:18` declares the param; `mobile/app/ecommerce/index.tsx` has no input or chip wiring it. Dead surface or planned feature?
36. **`ECOMMERCE_INVALIDATE_KEYS` mirrors `SAMPLE_INVALIDATE_KEYS` orphan keys** — `mobile/app/ecommerce/[id].tsx:35-43` includes `inventory-hierarchy` and `dashboard-stats`. Verify subscribers exist. Same as samples (#26).

(From phase-27, Session 7)
37. ⚠️ **`sourceType` derivation ternary is a no-op (REAL BUG)** — `mobile/app/dispatch/index.tsx:135-137` and `mobile/app/dispatch/[id].tsx:101-103`: `dispatch.source_type ?? (dispatch.master_carton_id ? 'master_carton' : 'master_carton')`. The ternary always returns `'master_carton'`. Any legacy record with both `source_type` AND `master_carton_id` null is mislabelled "Carton" in chip + detail. Probable copy-paste during M4 (`ae73320`).
38. **Date range inputs silently reject invalid strings** — `mobile/app/dispatch/index.tsx:32-38` `toISO()` returns `undefined` for unparseable inputs; filter falls through to "no filter". No error UI. UX gap.
39. **`switchSource` preserves shared form fields across tab switches** — `create.tsx:249-255` clears other-source state but leaves customer/destination/transport/lr/vehicle/notes intact. Likely intentional (form persistence) but worth documenting.
40. **`switchSource` clears OTHER sources, never the current one** — by design. On verification: switching away from a source clears its state, so re-entry always arrives empty. (Initial concern was unfounded but documented for clarity.)
41. **Sample/E-commerce ACTIVE status NOT specifically handled in scan rejection** — `create.tsx:328-335` and `:365-371` only call out DISPATCHED and CREATED; ACTIVE falls into generic "Only CLOSED..." else. Master Carton explicitly handles ACTIVE ("Close the carton before dispatching."). Less helpful UX for the most likely rejection case.
42. **Multi-record asymmetry between source types** — Master Carton allows multiple cartons per dispatch; Sample and E-commerce are single-record only. Intentional or oversight?
43. ⚠️ **`invalidateKeys` omits `samples` and `ecommerce` (REAL BUG)** — `create.tsx:263-270`. Only `masterCartons` is invalidated. After dispatching a sample/ecommerce record, the source list shows stale CLOSED status until pull-to-refresh. Cache propagation gap.
44. **`router.replace('/dispatch')` after submit instead of detail** — `create.tsx:273`. All other create flows (cartons/samples/ecommerce) `router.replace` to the new record's detail page. Dispatch goes back to the list. UX inconsistency.
45. **Audit footer same-day comparison ignores timezone** — `[id].tsx:96-98` splits raw ISO strings on 'T'. For records created near midnight UTC, local-time same-day check can flip wrongly. Edge case but real.
46. **Dispatch list has no status / source-type / customer filters** — only search + date range. Other modules have richer filter UI. By design (terminal records have no status to filter) or future feature?
47. **No way to select multiple samples in a single dispatch** — `setSelectedSample` overwrites; selecting another sample replaces the first. Either intentional (single-per-dispatch business rule) or UX gap. Same for ecommerce.
48. **`CustomerPicker` is duplicated between `samples/create.tsx` and `dispatch/create.tsx`** — near-identical components with slight styling drift (picker row borderRadius, separator height). Refactor opportunity to lift to a shared `mobile/components/CustomerPicker.tsx`.
49. **No explicit "Remove customer" action** — once a customer is picked, the only way to clear is via the "Change" link which re-opens the picker. User cannot return to the no-customer state without picking a different customer first.
50. **`canSubmit` derived inline — verify no stale-closure** — `create.tsx:442-448` recomputes per-render so should be safe; flagged for explicit TC coverage during execution.

(From phase-28, Session 8)
51. ⚠️ **Users tile routes to unmatched route (REAL PRODUCT GAP)** — `mobile/app/(tabs)/menu.tsx:100` exposes Users tile (Admin-only) → `/users`, but `mobile/app/users/` directory does not exist. Tapping triggers expo-router's unmatched fallback (blank screen or `_unmatched.tsx`). Either remove tile or build screens.
52. **No `customerService.remove` exposed on mobile** — `customer.service.ts` declares getAll/getById/create/update/getPrimaryDealers; no delete method. Detail screen has no delete UI. Admin/Sup cannot delete customers from mobile.
53. **No activate/deactivate toggle on customer detail** — `is_active` displayed (inactive badge) but not editable. To reactivate, must use web app.
54. **List FAB RoleGate redundant with screen RoleGate** — `customers/index.tsx:264-272` nests an identical `[Admin, Supervisor]` gate inside an already-gated screen (lines 280-286). Dead defensive code.
55. **`customerService.getAll` accepts no `is_active` filter param** — web exposes it; mobile cannot filter inactive customers. No "Show inactive" toggle in UI.
56. **DealerPickerModal filter has NO debounce** — `customers/new.tsx:55-58` filters synchronously per keystroke (client-side `.filter()` on the cached `getPrimaryDealers` result). Different pattern from CustomerPicker (sample/dispatch) which uses 300ms debounce. May lag at hundreds of dealers.
57. **DealerPickerModal duplicated between `customers/new.tsx` and `customers/[id].tsx`** — near-identical components. Refactor opportunity (similar to CustomerPicker duplication #48).
58. **Customer create invalidates only `['customers']`, not `['customer']`** — `new.tsx:195`. Cosmetic since no individual cache exists yet, but worth noting vs detail update which invalidates both keys.
59. **Stack.Screen title fallback misses empty-string `firm_name`** — `[id].tsx:333`: `title: customer.firm_name ?? 'Customer'`. Optional-chain catches null/undefined but not empty string. Edge case.
60. **Customer detail Save button uses inline TouchableOpacity instead of `<Button disabled>`** — `[id].tsx:365-385`. Inconsistency with rest of app's Button component pattern.
61. **No haptic on DealerPicker row tap** — only the create-mutation success haptic fires; picker selections get no tactile feedback. (Same pattern in CustomerPicker on sample/dispatch screens.)
62. **`user.service.ts` is dead code on mobile** — fully declared (getAll/getById/create/update/remove) but zero UI consumers. Either remove or implement Users screens.
63. **Primary dealer SummaryRow fallback exposes UUID to user** — `customers/[id].tsx:416`: `value={customer.primary_dealer_name ?? customer.primary_dealer_id}`. If `primary_dealer_name` is null (orphan reference), the user sees the raw UUID. Should show "—" or "(deleted dealer)".
64. **DealerPickerModal loading state uses plain `<Text>"Loading…"` not `<Spinner>`** — `customers/new.tsx:130-132`. Same cosmetic inconsistency as CustomerPicker (#27).

(From phase-29, Session 9)
65. ⚠️ **Sample / E-commerce trace results are NOT rendered in scan tab UI** — `mobile/app/(tabs)/scan.tsx:114-156` only checks `result.childBox` and `result.masterCarton`. Scanning SR or EC barcodes returns data from backend but UI has no card rendering for samples/ecommerce. Timeline card alone shows. Real UX gap. Either extend scan.tsx with sample + ecommerce cards or document as web-only.
66. ⚠️ **GENERATED auto-activation side effect on trace operation** — `mobile/app/(tabs)/scan.tsx:31-39` silently transitions GENERATED → FREE when a GENERATED box is traced. Warehouse operator scanning to inspect can inadvertently activate stock. Trace is conceptually read-only; auto-activation breaks that. Confirmation prompt or opt-in toggle would be safer.
67. **Manual-entry placeholder references legacy format only** — `scan.tsx:77`: `"Enter barcode (e.g., BINNY-CB-...)"`. Post-May-5 migration most boxes are short format (`CB[A-Z0-9]{6}`). Stale.
68. **Empty-state copy mentions only "child box or master carton"** — `scan.tsx:183`. Inconsistent with `expectedType="any"` accepting all 4 types.
69. **Camera permission-denied view has no "Open Settings" deep-link** — `BarcodeScanner.tsx:127`. Add `Linking.openSettings()` to let users grant via system settings without leaving the app.
70. **`parseQRCode` case-preservation inconsistency** — `utils/index.ts:35-38` short-format returns `id: trimmed` (preserves case); `:44` legacy returns `id: longMatch[0].toUpperCase()`. Short-format codes typed lowercase silently fall to `unknown` because regex is `[0-9A-Z]{6}` (uppercase only). Mitigated by `autoCapitalize="characters"` on most inputs but not bulletproof.
71. **No QR-frame visual rejection feedback** — `BarcodeScanner.tsx:79-86` toast fires on expectedType mismatch but camera frame doesn't flash red. Toast can be missed.
72. **No haptic on Trace button tap (manual entry)** — only camera-scan path gets haptic (BarcodeScanner.tsx:88). Manual Trace + Find paths silent.
73. **No "Recent Scans" history** — Clear button discards. Common workflow pattern absent.
74. **GENERATED auto-activation failure is silently swallowed** — `scan.tsx:36-38` empty `catch {}`. User sees trace result with original GENERATED status but never learns activation didn't happen. Should at minimum log or surface a non-blocking warning.
75. **No timeout on `traceByBarcode`** — if backend hangs, loading stays true indefinitely with no cancel button.

(Future sessions: append here.)

---

## Per-session briefs

### Session 2 brief (to be authored when Session 2 starts)

Will cover `mobile/app/(tabs)/inventory.tsx`. Reference for new behavior: M5 commit `108796d`. Key surfaces: tab toggle (Child Box | Master Carton), MRP conditional drill (when `distinctMrpCount > 1`), breadcrumbs (per tab), Master Carton hierarchy `status → section → article_name → carton`, status-breakdown chips, utilization bar, leaf carton routing to `/master-cartons/[id]`, load-more pagination on carton-leaf, summary cards. Web reference: `frontend/src/app/(dashboard)/inventory/page.tsx`. Each role's view + drill ability tested separately.

### Sessions 3-13 briefs

Authored in the session that starts that work. The plan summary table above + each phase's mobile-parity commit reference (`2d77d19` M1, `c5c92a4` M2, `206c353` M3, `ae73320` M4, `108796d` M5, `e75bcc6` M6) are sufficient context for Opus to write a fresh brief at session start.

---

*Session 1 authored by Sonnet under Opus dispatch. Updated 2026-05-02.*
