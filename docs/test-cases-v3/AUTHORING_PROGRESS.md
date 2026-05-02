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
| 4 | Mobile master cartons | `phase-24-mobile-master-cartons.md` | ⏳ Pending | — | — | List, create, detail, add/remove box, close, full-unpack |
| 5 | Mobile samples (M2) | `phase-25-mobile-samples.md` | ⏳ Pending | — | — | Full sample lifecycle on mobile |
| 6 | Mobile e-commerce (M3) | `phase-26-mobile-ecommerce.md` | ⏳ Pending | — | — | Full ecommerce lifecycle on mobile |
| 7 | Mobile dispatch (M4) | `phase-27-mobile-dispatch.md` | ⏳ Pending | — | — | 3-way source picker, source-type chip, jump-link |
| 8 | Mobile customers + users | `phase-28-mobile-customers-users.md` | ⏳ Pending | — | — | Customers per role; Users (Admin only) |
| 9 | Mobile scan + traceability | `phase-29-mobile-scan-traceability.md` | ⏳ Pending | — | — | Scan tab, parseQRCode for CB/MC/SR/EC (M1), traceability path |
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

(Future sessions: append here.)

---

## Per-session briefs

### Session 2 brief (to be authored when Session 2 starts)

Will cover `mobile/app/(tabs)/inventory.tsx`. Reference for new behavior: M5 commit `108796d`. Key surfaces: tab toggle (Child Box | Master Carton), MRP conditional drill (when `distinctMrpCount > 1`), breadcrumbs (per tab), Master Carton hierarchy `status → section → article_name → carton`, status-breakdown chips, utilization bar, leaf carton routing to `/master-cartons/[id]`, load-more pagination on carton-leaf, summary cards. Web reference: `frontend/src/app/(dashboard)/inventory/page.tsx`. Each role's view + drill ability tested separately.

### Sessions 3-13 briefs

Authored in the session that starts that work. The plan summary table above + each phase's mobile-parity commit reference (`2d77d19` M1, `c5c92a4` M2, `206c353` M3, `ae73320` M4, `108796d` M5, `e75bcc6` M6) are sufficient context for Opus to write a fresh brief at session start.

---

*Session 1 authored by Sonnet under Opus dispatch. Updated 2026-05-02.*
