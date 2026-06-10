# Phase 29 — Mobile Scan & Traceability

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — `(tabs)/scan` screen; `BarcodeScanner` component; `traceService`; `parseQRCode` utility
**Mobile build under test:** Post-EAS preview build (short-barcode era, post-May-5 migration)
**Test framework:** Maestro for E2E flows; manual + API for the rest
**Last updated:** 2026-05-11

---

## Table of Contents

- [Section 29.1 — Scan tab: role-agnostic access (all 4 roles)](#section-291--scan-tab-role-agnostic-access)
- [Section 29.2 — Scan tab: page layout (title, description, camera button, divider, TextInput, buttons)](#section-292--scan-tab-page-layout)
- [Section 29.3 — Manual entry: TextInput properties (autoCapitalize, onSubmitEditing, stale placeholder)](#section-293--manual-entry-textinput-properties)
- [Section 29.4 — Camera scan button: opens BarcodeScanner with expectedType="any"](#section-294--camera-scan-button)
- [Section 29.5 — BarcodeScanner: permission undetermined → request grant view](#section-295--barcodescanner-permission-undetermined)
- [Section 29.6 — BarcodeScanner: permission denied → "Camera Access Denied" view](#section-296--barcodescanner-permission-denied)
- [Section 29.7 — BarcodeScanner: camera frame overlay layout](#section-297--barcodescanner-camera-frame-overlay-layout)
- [Section 29.8 — BarcodeScanner: single-shot guard (scannedRef)](#section-298--barcodescanner-single-shot-guard)
- [Section 29.9 — BarcodeScanner: expectedType filter + rejection toast](#section-299--barcodescanner-expectedtype-filter)
- [Section 29.10 — parseQRCode: short format (CB/MC/SR/EC + 6 Crockford chars)](#section-2910--parseqrcode-short-format)
- [Section 29.11 — parseQRCode: legacy BINNY-XX-{uuid} format](#section-2911--parseqrcode-legacy-format)
- [Section 29.12 — parseQRCode: unknown type + whitespace + embedded match](#section-2912--parseqrcode-unknown-type)
- [Section 29.13 — Trace: child box result rendering](#section-2913--trace-child-box-result-rendering)
- [Section 29.14 — Trace: master carton result rendering](#section-2914--trace-master-carton-result-rendering)
- [Section 29.15 — Trace: timeline card rendering](#section-2915--trace-timeline-card-rendering)
- [Section 29.16 — Trace: missing sample/ecommerce rendering (UX gap)](#section-2916--trace-missing-sampleecommerce-rendering)
- [Section 29.17 — Trace: error state](#section-2917--trace-error-state)
- [Section 29.18 — Trace: empty state](#section-2918--trace-empty-state)
- [Section 29.19 — Trace: GENERATED auto-activation side effect](#section-2919--trace-generated-auto-activation-side-effect)
- [Section 29.20 — Negative / edge cases](#section-2920--negative--edge-cases)
- [Maestro flows index](#maestro-flows-index)
- [Open questions / `[?]` flags](#open-questions--flags)

---

## Preconditions

- Mobile app installed from EAS preview build (package `com.basiq360.binnyinventory`).
- Backend reachable at `https://srv1409601.hstgr.cloud/binny/api/v1`.
- All 4 role accounts seeded (see phase-21 Preconditions):
  - Admin: `admin@binny.com` / `Admin@123`
  - Supervisor: `supervisor@binny.com` / `Sup@123`
  - Warehouse Operator: `warehouse@binny.com` / `Wh@123`
  - Dispatch Operator: `dispatch@binny.com` / `Dp@123`
- Maestro CLI installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- App data cleared (`clearState` in Maestro) before each E2E flow unless otherwise stated.
- **Camera permission state**: each camera-related TC starts with permission in the stated state; use OS settings or `clearState` to reset.

## Test-data fixtures

| Fixture ID | Description | Status | Used in |
|---|---|---|---|
| `CB-FREE-01` | FREE child box, short barcode e.g. `CBABC123`. Article + colour + size + MRP all set. | FREE | 29.1, 29.2, 29.13, 29.15, 29.20 |
| `CB-GENERATED-01` | GENERATED child box (barcode printed but not yet activated). | GENERATED | 29.19 |
| `CB-PACKED-01` | PACKED child box inside master carton `MC-CLOSED-01`. | PACKED | 29.13, 29.14 |
| `MC-CLOSED-01` | CLOSED master carton containing `CB-PACKED-01`. child_count ≥ 1. | CLOSED | 29.14 |
| `CB-SAMPLE-01` | Child box with status SAMPLE. | SAMPLE | 29.13 |
| `CB-ECOM-01` | Child box with status ECOMMERCE. | ECOMMERCE | 29.13 |
| `CB-DISPATCHED-01` | DISPATCHED child box. | DISPATCHED | 29.13, 29.15 |
| `SR-SAMPLE-01` | Sample record with SR-prefix barcode (e.g. `SRABCD12`). | — | 29.16 |
| `EC-ECOM-01` | E-commerce record with EC-prefix barcode (e.g. `ECXYZ789`). | — | 29.16 |
| `CB-TIMELINE-01` | Child box with ≥3 timeline events (created, packed, dispatched). Each event has `performed_by` or `description`. | — | 29.15 |
| `CB-LEGACY-01` | Legacy barcode `BINNY-CB-{uuid}` — mark `[SKIP-POST-MIGRATION]` if barcode no longer scannable via short-format device QR. | — | 29.11 |
| `FAKE-BARCODE` | String `ZZZZZZZZ` — not a valid barcode in the system. | — | 29.17, 29.20 |

---

## Section 29.1 — Scan tab: role-agnostic access

No `<RoleGate>` wraps the scan screen. `_layout.tsx` lists `scan` as a plain `<Tabs.Screen>` with no auth check. All 4 roles see the tab and can interact fully.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-001 | Admin | Admin sees Scan tab in bottom bar | P0 | 1. Login as Admin. 2. Observe bottom tab bar. | "Scan" tab visible with `qr-code` icon. | E2E | `mobile/app/(tabs)/_layout.tsx:42-49` — no role gate |
| TC-MOB-SCAN-002 | Supervisor | Supervisor sees Scan tab | P0 | 1. Login as Supervisor. 2. Observe bottom tab bar. | "Scan" tab visible. | E2E | `mobile/app/(tabs)/_layout.tsx:42-49` |
| TC-MOB-SCAN-003 | Warehouse Operator | Warehouse Op sees Scan tab | P0 | 1. Login as Warehouse Op. 2. Observe bottom tab bar. | "Scan" tab visible; tap navigates to Scan & Trace screen. | E2E | `mobile/app/(tabs)/_layout.tsx:42-49` — no RoleGate wrapping |
| TC-MOB-SCAN-004 | Dispatch Operator | Dispatch Op sees Scan tab | P0 | 1. Login as Dispatch Op. 2. Observe bottom tab bar. | "Scan" tab visible; tap navigates to Scan & Trace screen. | E2E | `mobile/app/(tabs)/_layout.tsx:42-49` |

---

## Section 29.2 — Scan tab: page layout

`scan.tsx` renders inside a `KeyboardAvoidingView` > `ScrollView`. The search `Card` contains the title, description, camera button, divider, TextInput, Trace, and conditional Clear button.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-005 | Admin | Screen title "Scan & Trace" visible | P1 | 1. Login as Admin. 2. Tap Scan tab. | Card header shows "Scan & Trace" (fontSize 18, bold). | Manual | `mobile/app/(tabs)/scan.tsx:59` |
| TC-MOB-SCAN-006 | Admin | Description text visible | P1 | 1. Tap Scan tab. | Text "Enter a barcode to trace the complete lifecycle of any item" visible below title. | Manual | `mobile/app/(tabs)/scan.tsx:60` |
| TC-MOB-SCAN-007 | Admin | "Scan with Camera" button visible | P1 | 1. Tap Scan tab. | Primary button "Scan with Camera" with `qr-code-outline` icon displayed, full width. | Manual | `mobile/app/(tabs)/scan.tsx:63-69` |
| TC-MOB-SCAN-008 | Admin | "or enter manually" divider visible | P2 | 1. Tap Scan tab. | Small centred label "or enter manually" between camera button and TextInput. | Manual | `mobile/app/(tabs)/scan.tsx:72` |
| TC-MOB-SCAN-009 | Admin | Manual TextInput visible | P1 | 1. Tap Scan tab. | TextInput with placeholder "Enter barcode (e.g., BINNY-CB-...)" displayed. | Manual | `mobile/app/(tabs)/scan.tsx:75-85` |
| TC-MOB-SCAN-010 | Admin | "Trace" button always visible | P1 | 1. Tap Scan tab (no result yet). | "Trace" button with `search` icon visible. | Manual | `mobile/app/(tabs)/scan.tsx:87` |
| TC-MOB-SCAN-011 | Admin | "Clear" button hidden until result exists | P1 | 1. Tap Scan tab (no result). 2. Verify Clear absent. 3. Trace a valid barcode. 4. Verify Clear appears. | Clear button NOT visible in step 2; appears in step 4 alongside Trace. | Manual | `mobile/app/(tabs)/scan.tsx:88` — `{result && <Button title="Clear" …>}` |

---

## Section 29.3 — Manual entry: TextInput properties

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-012 | Admin | TextInput auto-capitalises input | P1 | 1. Tap TextInput. 2. Type lowercase `cbabc123`. | Input displays `CBABC123` (auto-capitalised). | Manual | `mobile/app/(tabs)/scan.tsx:82` `autoCapitalize="characters"` |
| TC-MOB-SCAN-013 | Admin | Return key triggers trace | P1 | 1. Type valid barcode. 2. Tap "Search" / "Go" on keyboard. | `handleTrace()` fires; loading spinner appears; result renders. | E2E | `mobile/app/(tabs)/scan.tsx:81` `onSubmitEditing={() => handleTrace()}` |
| TC-MOB-SCAN-014 | Admin | Placeholder references legacy format `[?67]` | P3 | 1. Open Scan tab with empty input. | Placeholder text is `"Enter barcode (e.g., BINNY-CB-...)"` — references legacy long format, not current short format. | Manual | `mobile/app/(tabs)/scan.tsx:77` — post-May-5 migration, placeholder is stale; see `[?67]` |
| TC-MOB-SCAN-015 | Admin | Empty input returns early (no API call) | P1 | 1. Leave TextInput empty. 2. Tap Trace. | No loading spinner; no result; no error. API not called. | Manual | `mobile/app/(tabs)/scan.tsx:24` `if (!trimmed) return;` |
| TC-MOB-SCAN-016 | Admin | Whitespace-only input returns early | P1 | 1. Type `"   "` (spaces) in TextInput. 2. Tap Trace. | No API call; no loading state triggered. | Manual | `mobile/app/(tabs)/scan.tsx:23` `.trim()` before empty check |

---

## Section 29.4 — Camera scan button

Tapping "Scan with Camera" sets `scannerOpen=true`, rendering `<BarcodeScanner visible expectedType="any">`. On successful scan, `onScan(data)` populates `barcode` state AND immediately calls `handleTrace(data)`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-017 | Warehouse Operator | Camera button opens BarcodeScanner modal | P0 | 1. Login as Warehouse Op. 2. Tap Scan tab. 3. Tap "Scan with Camera". | Full-screen scanner modal opens (slide animation). | E2E | `mobile/app/(tabs)/scan.tsx:65` `setScannerOpen(true)`; `BarcodeScanner` props: `expectedType="any"` |
| TC-MOB-SCAN-018 | Admin | Successful camera scan populates barcode field | P0 | 1. Open scanner. 2. Scan valid QR. | Modal closes; barcode field shows scanned value; trace result renders. | E2E | `mobile/app/(tabs)/scan.tsx:96-99` — `setBarcode(data); handleTrace(data)` |
| TC-MOB-SCAN-019 | Admin | Camera scan passes raw string (not parsed id) to handleTrace | P1 | 1. Scan short-format barcode e.g. `CBABC123`. | `handleTrace` receives `"CBABC123"` (raw); backend resolves via prefix detection. | Manual | `mobile/app/(tabs)/scan.tsx:97-98` passes `data` directly; trace endpoint accepts raw barcode |
| TC-MOB-SCAN-020 | Admin | Closing scanner without scan leaves barcode field unchanged | P1 | 1. Open scanner. 2. Tap X close. | Modal closes; barcode field empty (or previously entered value preserved). | Manual | `mobile/app/(tabs)/scan.tsx:95` `onClose={() => setScannerOpen(false)` only |

---

## Section 29.5 — BarcodeScanner: permission undetermined

When permission status is `'undetermined'` (first launch or cleared), `renderPermissionRequest()` is shown.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-021 | Admin | Permission undetermined shows request view | P0 | 1. Clear app camera permission. 2. Tap "Scan with Camera". | Modal opens with `camera-outline` icon (64px, `COLORS.primary`), title "Camera Access Required", desc "Allow camera access to scan QR codes". | Manual | `mobile/components/BarcodeScanner.tsx:102-116` `renderPermissionRequest()` |
| TC-MOB-SCAN-022 | Admin | "Grant Camera Access" button triggers system prompt | P0 | 1. On permission-request view. 2. Tap "Grant Camera Access". | OS camera-permission dialog appears. | E2E | `mobile/components/BarcodeScanner.tsx:109` `onPress={requestPermission}` |
| TC-MOB-SCAN-023 | Admin | Granting permission transitions to camera view | P0 | 1. On permission-request view. 2. Tap "Grant Camera Access". 3. Allow in OS dialog. | Camera viewfinder appears with frame overlay. | E2E | `mobile/components/BarcodeScanner.tsx:188-195` — `permission.granted` → `renderScanner()` |
| TC-MOB-SCAN-024 | Admin | "Cancel" on permission-request closes modal | P1 | 1. On permission-request view. 2. Tap "Cancel". | Scanner modal closes; scan tab visible again. | E2E | `mobile/components/BarcodeScanner.tsx:112-114` `onPress={onClose}` |

---

## Section 29.6 — BarcodeScanner: permission denied

When permission is permanently denied (`!permission.granted && permission.status !== 'undetermined'`), `renderPermissionDenied()` is shown.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-025 | Admin | Denied view shows correct icon + copy | P0 | 1. Deny camera in OS settings. 2. Tap "Scan with Camera". | `close-circle-outline` icon (64px, `COLORS.error`), title "Camera Access Denied", desc "Camera access denied. Enable it from system settings." | Manual | `mobile/components/BarcodeScanner.tsx:120-131` |
| TC-MOB-SCAN-026 | Admin | Denied view has only "Close" button (no settings deep-link) `[?69]` | P1 | 1. On denied view. 2. Verify buttons present. | Only "Close" button visible. No "Open Settings" / `Linking.openSettings()` button. | Manual | `mobile/components/BarcodeScanner.tsx:127` single button; see `[?69]` |
| TC-MOB-SCAN-027 | Admin | "Close" on denied view closes modal | P1 | 1. On denied view. 2. Tap "Close". | Scanner modal closes; returns to scan tab. | E2E | `mobile/components/BarcodeScanner.tsx:127` `onPress={onClose}` |
| TC-MOB-SCAN-028 | Admin | Granting permission after denial transitions to camera | P2 | 1. Deny permission. 2. Manually open OS settings, grant. 3. Re-open scanner. | Camera view renders (no longer denied view). | Manual | `mobile/components/BarcodeScanner.tsx:188-195` — re-evaluates on next `visible` change |

---

## Section 29.7 — BarcodeScanner: camera frame overlay layout

Frame size = `Math.round(Math.min(width, height) * 0.7)`. Four semi-transparent dark strips surround the frame. Frame border is `COLORS.accent`, 2px. Title bar at top; hint at bottom.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-029 | Admin | Camera frame is centred on screen | P1 | 1. Grant camera. 2. Open scanner. | Square frame centred horizontally and vertically; ~70% of narrower dimension. | Manual | `mobile/components/BarcodeScanner.tsx:96-98` `frameSize = round(min(w,h)*0.7)` |
| TC-MOB-SCAN-030 | Admin | Dark overlay strips surround frame | P1 | 1. Open scanner with camera. | Regions above, below, left, right of frame are dark semi-transparent. | Manual | `mobile/components/BarcodeScanner.tsx:146-162` overlay strips `rgba(0,0,0,0.5)` |
| TC-MOB-SCAN-031 | Admin | Frame border accent colour visible | P1 | 1. Open scanner with camera. | 2px `COLORS.accent` border around transparent frame window. | Manual | `mobile/components/BarcodeScanner.tsx:236-240` `borderWidth:2, borderColor:COLORS.accent` |
| TC-MOB-SCAN-032 | Admin | Top title bar shows scanner title and X button | P1 | 1. Open scanner. | Title (default "Scan QR Code") with X `close` icon (28px, `COLORS.surface`) in top-right. | Manual | `mobile/components/BarcodeScanner.tsx:164-170` |
| TC-MOB-SCAN-033 | Admin | Bottom hint "Point camera at the QR code" visible | P2 | 1. Open scanner with camera. | Text "Point camera at the QR code" centred near bottom (60px from bottom edge). | Manual | `mobile/components/BarcodeScanner.tsx:173-175` |
| TC-MOB-SCAN-034 | Admin | Modal is full-screen (presentationStyle=fullScreen) | P1 | 1. Open scanner. | Scanner covers entire screen including status bar (Android: translucent status bar). | Manual | `mobile/components/BarcodeScanner.tsx:202-205` `presentationStyle="fullScreen"`, `statusBarTranslucent` |

---

## Section 29.8 — BarcodeScanner: single-shot guard

`scannedRef.current` prevents processing more than one scan per modal open. Resets to `false` on `visible=true` (via `useEffect`). Re-armed after 1500ms cooldown when a rejection occurs.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-035 | Admin | Single scan per open — second immediate scan ignored | P1 | 1. Open scanner. 2. Rapidly scan same QR twice (mock double-fire). | Only first scan triggers `onScan`; second is suppressed. | Manual | `mobile/components/BarcodeScanner.tsx:67-68` `if (scannedRef.current) return; scannedRef.current = true` |
| TC-MOB-SCAN-036 | Admin | Guard resets when scanner reopened | P1 | 1. Scan + close. 2. Reopen scanner. 3. Scan again. | Second open accepts a scan normally. | Manual | `mobile/components/BarcodeScanner.tsx:47-51` `useEffect` on `visible` |
| TC-MOB-SCAN-037 | Admin | Guard re-arms after rejection toast (1.5s) | P2 | 1. Open scanner with `expectedType="child"`. 2. Present MC barcode (triggers rejection). 3. Wait 1.5s. 4. Present CB barcode. | After cooldown, scanner accepts the CB barcode. | Manual | `mobile/components/BarcodeScanner.tsx:82-84` `setTimeout(() => { scannedRef.current = false; }, 1500)` |

---

## Section 29.9 — BarcodeScanner: expectedType filter

When `expectedType !== 'any'`, mismatched scans show a red toast `"Expected a {label} QR"`. The scan screen uses `expectedType="any"` so no filtering occurs there, but the component is tested here for its filtering logic (used by other screens in other phases).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-038 | Admin | expectedType="any" accepts all 4 types | P0 | 1. Scan tab opens scanner with `expectedType="any"`. 2. Scan CB, MC, SR, EC barcodes one at a time. | All 4 types accepted; `onScan` fires; modal closes. | Manual | `mobile/app/(tabs)/scan.tsx:100` `expectedType="any"`; `mobile/components/BarcodeScanner.tsx:72` |
| TC-MOB-SCAN-039 | Admin | Type mismatch shows red toast | P1 | 1. Invoke BarcodeScanner with `expectedType="child"`. 2. Scan a `MC…` barcode. | Red toast "Expected a master carton QR" — wait, correction: toast says "Expected a child box QR" (expected=child, received=master). | Manual | `mobile/components/BarcodeScanner.tsx:73-85` — toast = `"Expected a ${typeLabels[expectedType]} QR"` i.e. the **expected** label, not the scanned label |
| TC-MOB-SCAN-040 | Admin | Toast label mapping: child → "child box" | P2 | 1. `expectedType="child"`, scan non-CB barcode. | Toast: "Expected a child box QR". | Manual | `mobile/components/BarcodeScanner.tsx:74` `child: 'child box'` |
| TC-MOB-SCAN-041 | Admin | Toast label mapping: master → "master carton" | P2 | 1. `expectedType="master"`, scan non-MC barcode. | Toast: "Expected a master carton QR". | Manual | `mobile/components/BarcodeScanner.tsx:75` `master: 'master carton'` |
| TC-MOB-SCAN-042 | Admin | Toast label mapping: sample → "sample" | P2 | 1. `expectedType="sample"`, scan non-SR barcode. | Toast: "Expected a sample QR". | Manual | `mobile/components/BarcodeScanner.tsx:76` `sample: 'sample'` |
| TC-MOB-SCAN-043 | Admin | Toast label mapping: ecommerce → "e-commerce package" | P2 | 1. `expectedType="ecommerce"`, scan non-EC barcode. | Toast: "Expected a e-commerce package QR". | Manual | `mobile/components/BarcodeScanner.tsx:77` `ecommerce: 'e-commerce package'` |
| TC-MOB-SCAN-044 | Admin | Toast animates in (200ms) → holds (1600ms) → fades out (300ms) | P2 | 1. Trigger rejection toast. 2. Observe timing. | Toast fades in quickly, holds ~1.6s, fades out. Total visible ≈2.1s. | Manual | `mobile/components/BarcodeScanner.tsx:56-62` Animated.sequence |
| TC-MOB-SCAN-045 | Admin | No frame-border flash on rejection `[?71]` | P3 | 1. Trigger type-mismatch rejection. | Frame border remains `COLORS.accent` (no red flash). Toast-only feedback. | Manual | `mobile/components/BarcodeScanner.tsx:236-240` no style change on rejection; see `[?71]` |

---

## Section 29.10 — parseQRCode: short format

Short format regex: `/^(CB|MC|SR|EC)[0-9A-Z]{6}$/`. 8 characters total. `id` field returns the original trimmed string (preserves user-typed case).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-046 | Admin | CB prefix → type "child", id preserved | P0 | API test: `parseQRCode("CBABC123")`. | Returns `{type:"child", id:"CBABC123"}`. | Unit | `mobile/utils/index.ts:35` |
| TC-MOB-SCAN-047 | Admin | MC prefix → type "master", id preserved | P0 | API test: `parseQRCode("MCXYZ456")`. | Returns `{type:"master", id:"MCXYZ456"}`. | Unit | `mobile/utils/index.ts:36` |
| TC-MOB-SCAN-048 | Admin | SR prefix → type "sample", id preserved | P0 | API test: `parseQRCode("SR123ABC")`. | Returns `{type:"sample", id:"SR123ABC"}`. | Unit | `mobile/utils/index.ts:37` |
| TC-MOB-SCAN-049 | Admin | EC prefix → type "ecommerce", id preserved | P0 | API test: `parseQRCode("EC9Z8Y7X")`. | Returns `{type:"ecommerce", id:"EC9Z8Y7X"}`. | Unit | `mobile/utils/index.ts:38` |
| TC-MOB-SCAN-050 | Admin | Short format regex requires exactly 6 Crockford chars (0-9, A-Z) | P1 | Test: `parseQRCode("CB@BC123")` (invalid char @). | Falls through to legacy check; likely returns `{type:"unknown", ...}` if no BINNY- prefix found. | Unit | `mobile/utils/index.ts:32` `/^(CB|MC|SR|EC)[0-9A-Z]{6}$/` — `@` not in `[0-9A-Z]` |
| TC-MOB-SCAN-051 | Admin | Short format requires exactly 8 chars (prefix+6) | P1 | Test: `parseQRCode("CBABC12")` (7 chars). | Returns `{type:"unknown", id:"CBABC12"}` — too short for short format, no BINNY- prefix. | Unit | `mobile/utils/index.ts:32` |
| TC-MOB-SCAN-052 | Admin | Case-preservation in short format `[?70]` | P2 | Test: `parseQRCode("cbabc123")` (lowercase). | Short regex fails (lowercase `c`, `b`). Falls to legacy check; no match. Returns `{type:"unknown", id:"cbabc123"}`. Typed-lowercase short barcodes silently unrecognised. | Unit | `mobile/utils/index.ts:32` — regex is `[0-9A-Z]` uppercase only; `autoCapitalize="characters"` mitigates on manual entry; camera scanner returns upper from QR payload; see `[?70]` |
| TC-MOB-SCAN-053 | Admin | Leading/trailing whitespace trimmed before match | P1 | Test: `parseQRCode("  CBABC123  ")`. | Returns `{type:"child", id:"CBABC123"}`. | Unit | `mobile/utils/index.ts:29` `raw.trim()` |

---

## Section 29.11 — parseQRCode: legacy BINNY-XX-{uuid} format

Legacy regex: `/BINNY-(CB|MC|SR|EC)-[A-Za-z0-9-]+/i` (case-insensitive). Can match a sub-string (embedded). The matched token is `.toUpperCase()` before prefix-checking — different from short format which preserves case.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-054 | Admin | BINNY-CB prefix → type "child", id UPPERCASED | P0 | `parseQRCode("BINNY-CB-550e8400-e29b-41d4")`. | Returns `{type:"child", id:"BINNY-CB-550E8400-E29B-41D4"}` (id uppercased). | Unit | `mobile/utils/index.ts:44-45` `toUpperCase()` |
| TC-MOB-SCAN-055 | Admin | BINNY-MC prefix → type "master", id UPPERCASED | P0 | `parseQRCode("BINNY-MC-abc123")`. | Returns `{type:"master", id:"BINNY-MC-ABC123"}`. | Unit | `mobile/utils/index.ts:46` |
| TC-MOB-SCAN-056 | Admin | BINNY-SR prefix → type "sample" | P0 | `parseQRCode("BINNY-SR-aabbcc")`. | Returns `{type:"sample", id:"BINNY-SR-AABBCC"}`. | Unit | `mobile/utils/index.ts:47` |
| TC-MOB-SCAN-057 | Admin | BINNY-EC prefix → type "ecommerce" | P0 | `parseQRCode("BINNY-EC-xxyyzz")`. | Returns `{type:"ecommerce", id:"BINNY-EC-XXYYZZ"}`. | Unit | `mobile/utils/index.ts:48` |
| TC-MOB-SCAN-058 | Admin | Legacy match is case-insensitive (lowercase BINNY) | P1 | `parseQRCode("binny-cb-abc123")`. | Matches case-insensitively; returns `{type:"child", id:"BINNY-CB-ABC123"}`. | Unit | `mobile/utils/index.ts:42` — regex flag `i` |
| TC-MOB-SCAN-059 | Admin | Legacy regex matches sub-string (embedded) | P1 | `parseQRCode("LABEL:BINNY-CB-abc123:END")`. | Regex finds embedded `BINNY-CB-abc123`; returns `{type:"child", id:"BINNY-CB-ABC123"}`. | Unit | `mobile/utils/index.ts:42` — no `^$` anchors on legacy regex |
| TC-MOB-SCAN-060 | Admin | id-case inconsistency: legacy forces uppercase, short preserves `[?70]` | P2 | Compare `parseQRCode("CBABC123").id` vs `parseQRCode("BINNY-CB-abc").id`. | Short: `"CBABC123"` (preserved); legacy: `"BINNY-CB-ABC"` (uppercased). Downstream must be case-insensitive to handle both. | Unit | `mobile/utils/index.ts:35` vs `44`; see `[?70]` |

---

## Section 29.12 — parseQRCode: unknown type + edge cases

If neither short nor legacy regex matches, returns `{type:"unknown", id:trimmed}`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-061 | Admin | Random string → type "unknown" | P1 | `parseQRCode("ZZZZZZZZ")`. | Returns `{type:"unknown", id:"ZZZZZZZZ"}`. | Unit | `mobile/utils/index.ts:51` |
| TC-MOB-SCAN-062 | Admin | 9-char CB string (too long for short, no BINNY-) → unknown | P1 | `parseQRCode("CBABC1234")` (9 chars). | Returns `{type:"unknown", id:"CBABC1234"}`. | Unit | `mobile/utils/index.ts:32` — `$` anchor fails at 9 chars |
| TC-MOB-SCAN-063 | Admin | BINNY- prefix without valid type code → unknown | P1 | `parseQRCode("BINNY-XX-abc123")`. | Legacy regex matches but none of CB/MC/SR/EC branches match; falls through; returns `{type:"unknown", id:"BINNY-XX-ABC123"}` — or more precisely, `longMatch` captures but token doesn't satisfy any `startsWith` → falls to return unknown. | Unit | `mobile/utils/index.ts:44-49` — no matching prefix branch |
| TC-MOB-SCAN-064 | Admin | Empty string → unknown | P1 | `parseQRCode("")`. | Returns `{type:"unknown", id:""}`. | Unit | `mobile/utils/index.ts:29,51` — `"".trim()=""` matches neither regex |
| TC-MOB-SCAN-065 | Admin | Whitespace-only → unknown with empty id | P1 | `parseQRCode("   ")`. | Returns `{type:"unknown", id:""}`. | Unit | `mobile/utils/index.ts:29` `.trim()` → empty string |

---

## Section 29.13 — Trace: child box result rendering

When `result.childBox` is truthy, a Card shows status badge (`type="childBox"`), Barcode, Article, Colour/Size (composite), and MRP formatted `₹X.XX`.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-066 | Admin | Child Box card visible for CB barcode | P0 | 1. Enter `CB-FREE-01` barcode. 2. Tap Trace. | "Child Box" card appears with status badge. | E2E | `mobile/app/(tabs)/scan.tsx:115-138` `result.childBox` check |
| TC-MOB-SCAN-067 | Admin | Status badge renders for FREE status | P1 | Trace `CB-FREE-01`. | Badge shows "FREE" with `type="childBox"` styling. | Manual | `mobile/app/(tabs)/scan.tsx:119` `<Badge label={result.childBox.status} type="childBox" />` |
| TC-MOB-SCAN-068 | Admin | Status badge renders for GENERATED status | P1 | Trace `CB-GENERATED-01` (before activation side-effect triggers). | Badge shows "GENERATED" — but note: auto-activation side effect may transition to FREE first (see Section 29.19). | Manual | `mobile/app/(tabs)/scan.tsx:119` |
| TC-MOB-SCAN-069 | Admin | Status badge renders for PACKED status | P1 | Trace `CB-PACKED-01`. | Badge shows "PACKED". | Manual | `mobile/app/(tabs)/scan.tsx:119` |
| TC-MOB-SCAN-070 | Admin | Status badge renders for SAMPLE status | P1 | Trace `CB-SAMPLE-01`. | Badge shows "SAMPLE". | Manual | `mobile/app/(tabs)/scan.tsx:119` |
| TC-MOB-SCAN-071 | Admin | Status badge renders for DISPATCHED status | P1 | Trace `CB-DISPATCHED-01`. | Badge shows "DISPATCHED". | Manual | `mobile/app/(tabs)/scan.tsx:119` |
| TC-MOB-SCAN-072 | Admin | Barcode detail row shows raw barcode string | P1 | Trace `CB-FREE-01`. | Row label "Barcode", value = fixture barcode e.g. `CBABC123`. | Manual | `mobile/app/(tabs)/scan.tsx:123` |
| TC-MOB-SCAN-073 | Admin | Article detail row shows article_name | P1 | Trace `CB-FREE-01`. | Row label "Article", value = product article name. | Manual | `mobile/app/(tabs)/scan.tsx:127` |
| TC-MOB-SCAN-074 | Admin | Colour/Size shows composite "{colour} / {size}" | P1 | Trace `CB-FREE-01`. | Row label "Colour / Size", value = e.g. "Red / 6". | Manual | `mobile/app/(tabs)/scan.tsx:131` `{result.childBox.colour} / {result.childBox.size}` |
| TC-MOB-SCAN-075 | Admin | MRP formatted as ₹X.XX | P1 | Trace `CB-FREE-01` with MRP=299. | Row label "MRP", value = "₹299.00". | Manual | `mobile/app/(tabs)/scan.tsx:135` `₹${Number(mrp).toFixed(2)}` |

---

## Section 29.14 — Trace: master carton result rendering

When `result.masterCarton` is truthy, a separate Card appears. Tracing a CB that is PACKED inside a CLOSED MC returns both childBox + masterCarton cards.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-076 | Admin | Master Carton card visible for packed child box | P0 | Trace `CB-PACKED-01` (inside `MC-CLOSED-01`). | "Master Carton" card visible below Child Box card. | E2E | `mobile/app/(tabs)/scan.tsx:141-156` `result.masterCarton` check |
| TC-MOB-SCAN-077 | Admin | Master Carton barcode row shows carton_barcode | P1 | Trace `CB-PACKED-01`. | Row label "Barcode", value = `MC-CLOSED-01`'s barcode. | Manual | `mobile/app/(tabs)/scan.tsx:149` `result.masterCarton.carton_barcode` |
| TC-MOB-SCAN-078 | Admin | Child Boxes row shows child_count | P1 | Trace `CB-PACKED-01`. | Row label "Child Boxes", value = integer count (e.g. "4"). | Manual | `mobile/app/(tabs)/scan.tsx:153` `result.masterCarton.child_count` |
| TC-MOB-SCAN-079 | Admin | Master Carton card has status badge type="carton" | P1 | Trace `MC-CLOSED-01` directly by carton barcode. | Badge shows carton status (e.g. "CLOSED") with `type="carton"` styling. | Manual | `mobile/app/(tabs)/scan.tsx:145` `<Badge label={result.masterCarton.status} type="carton" />` |
| TC-MOB-SCAN-080 | Admin | Tracing a FREE child box shows no Master Carton card | P1 | Trace `CB-FREE-01` (not in any carton). | Only Child Box card rendered; no Master Carton card. | Manual | `mobile/app/(tabs)/scan.tsx:141` — `result.masterCarton` is null/undefined |

---

## Section 29.15 — Trace: timeline card rendering

When `result.timeline.length > 0`, a Timeline card renders. Each event: dot + action + (description OR performed_by) + en-IN locale date.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-081 | Admin | Timeline card visible when events exist | P1 | Trace `CB-TIMELINE-01`. | "Timeline" card appears below other result cards. | E2E | `mobile/app/(tabs)/scan.tsx:159-175` `result.timeline.length > 0` |
| TC-MOB-SCAN-082 | Admin | Timeline hidden when events array is empty | P1 | Trace `CB-FREE-01` (no events). | No Timeline card rendered. | Manual | `mobile/app/(tabs)/scan.tsx:159` — condition `length > 0` |
| TC-MOB-SCAN-083 | Admin | Each event shows accent-coloured dot | P2 | Trace `CB-TIMELINE-01`. | Each row has a 10px circular dot with `COLORS.accent` background. | Manual | `mobile/app/(tabs)/scan.tsx:164` `timelineDot` style |
| TC-MOB-SCAN-084 | Admin | Event action text rendered bold | P2 | Trace `CB-TIMELINE-01`. | `event.action` displayed in `timelineAction` style (fontWeight 600). | Manual | `mobile/app/(tabs)/scan.tsx:166` |
| TC-MOB-SCAN-085 | Admin | Description shown if present, else performed_by | P1 | 1. Trace event with `description`. 2. Trace event with `description=null, performed_by="Admin"`. | Step 1: description shown. Step 2: performed_by shown as fallback. | Manual | `mobile/app/(tabs)/scan.tsx:167` `event.description \|\| event.performed_by` |
| TC-MOB-SCAN-086 | Admin | Date formatted with en-IN locale | P2 | Trace `CB-TIMELINE-01`; inspect date output. | Date shown as e.g. "11/5/2026, 10:30:00 am" (Indian locale format). | Manual | `mobile/app/(tabs)/scan.tsx:169` `toLocaleString('en-IN')` |
| TC-MOB-SCAN-087 | Admin | Multiple events render in order returned by API | P1 | Trace `CB-TIMELINE-01` (3+ events). | All events listed; order matches API response (typically chronological). | Manual | `mobile/app/(tabs)/scan.tsx:162` — `result.timeline.map()` preserves API order |

---

## Section 29.16 — Trace: missing sample/ecommerce rendering

`scan.tsx` only checks `result.childBox` and `result.masterCarton` for card rendering. SR and EC barcodes are accepted by `expectedType="any"` and `parseQRCode` returns correct types, but if the backend responds with neither `childBox` nor `masterCarton` in the root payload, NO data card appears — only the Timeline card (if events exist).

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-088 | Admin | Scanning SR barcode: no sample card rendered `[?65]` | P0 | 1. Enter `SR-SAMPLE-01` barcode. 2. Tap Trace. | API returns sample data; but UI shows NO "Sample" card. Timeline may appear if events exist. Child Box and Master Carton cards absent. **UX gap.** | E2E | `mobile/app/(tabs)/scan.tsx:114-156` — only `result.childBox` and `result.masterCarton` branches exist; see `[?65]` |
| TC-MOB-SCAN-089 | Admin | Scanning EC barcode: no ecommerce card rendered `[?65]` | P0 | 1. Enter `EC-ECOM-01` barcode. 2. Tap Trace. | API returns ecommerce data; UI shows NO "E-commerce" card. Timeline may appear if events exist. **UX gap.** | E2E | `mobile/app/(tabs)/scan.tsx:114-156`; see `[?65]` |
| TC-MOB-SCAN-090 | Admin | SR trace result does show timeline (if events exist) | P2 | Enter `SR-SAMPLE-01`; API returns timeline events. | Timeline card renders normally. Only the source-entity card is missing. | Manual | `mobile/app/(tabs)/scan.tsx:159` — timeline check is independent of childBox/masterCarton |

---

## Section 29.17 — Trace: error state

On API error, `setError(err?.response?.data?.message || err?.message || 'Item not found')` is called. An error Card with `alert-circle` icon and red background is shown.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-091 | Admin | Unknown barcode shows error card | P0 | 1. Enter `FAKE-BARCODE`. 2. Tap Trace. | Error card appears: `alert-circle` icon (24px, `COLORS.error`), error message text (e.g. "Item not found"). | E2E | `mobile/app/(tabs)/scan.tsx:104-109` `errorCard` style `backgroundColor: '#FEF2F2'` |
| TC-MOB-SCAN-092 | Admin | API error message shown if available | P1 | Mock API to return `{ message: "Barcode not registered" }`. | Error card shows "Barcode not registered" (from `err?.response?.data?.message`). | Manual | `mobile/app/(tabs)/scan.tsx:42` |
| TC-MOB-SCAN-093 | Admin | Generic JS error message used as fallback | P1 | Mock network error (no response body). | Shows `err.message` e.g. "Network Error". | Manual | `mobile/app/(tabs)/scan.tsx:42` — `err?.message` fallback |
| TC-MOB-SCAN-094 | Admin | "Item not found" shown if no message anywhere | P1 | Mock error with no message property. | Shows "Item not found". | Manual | `mobile/app/(tabs)/scan.tsx:42` — last fallback string |
| TC-MOB-SCAN-095 | Admin | Error clears on new Trace call | P1 | 1. Trace invalid barcode → error shown. 2. Type new barcode. 3. Tap Trace. | `setError('')` fires at start of `handleTrace`; error card disappears when loading begins. | Manual | `mobile/app/(tabs)/scan.tsx:26` `setError('')` |
| TC-MOB-SCAN-096 | Admin | No timeout guard — loading spinner may persist `[?75]` | P3 | Mock backend to hang indefinitely. | `loading` spinner remains on screen with no cancel option. | Manual | `mobile/app/(tabs)/scan.tsx:25,44` — `setLoading(true)` without timeout; see `[?75]` |

---

## Section 29.18 — Trace: empty state

Shown when `!result && !error && !loading`. Uses `<EmptyState>` with `qr-code-outline` icon.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-097 | Admin | Empty state shown on initial load | P1 | 1. Tap Scan tab. 2. No action taken. | `qr-code-outline` icon, title "Scan or enter a barcode", message "Track the complete lifecycle of any child box or master carton". | Manual | `mobile/app/(tabs)/scan.tsx:179-184` |
| TC-MOB-SCAN-098 | Admin | Empty state copy omits sample/ecommerce `[?68]` | P2 | Read message text in empty state. | Message says only "child box or master carton" — sample and ecommerce types omitted despite `expectedType="any"` accepting them. | Manual | `mobile/app/(tabs)/scan.tsx:183`; see `[?68]` |
| TC-MOB-SCAN-099 | Admin | Empty state hidden once result present | P1 | 1. Trace valid barcode. 2. Observe empty state. | Empty state disappears; result card(s) take its place. | Manual | `mobile/app/(tabs)/scan.tsx:179` — condition `!result && !error && !loading` |
| TC-MOB-SCAN-100 | Admin | Empty state hidden while loading | P1 | 1. Tap Trace. 2. Observe during loading. | Empty state not visible while spinner runs (`loading=true`). | Manual | `mobile/app/(tabs)/scan.tsx:179` — condition includes `!loading` |

---

## Section 29.19 — Trace: GENERATED auto-activation side effect

When a traced box has `status === 'GENERATED'`, `handleTrace` silently calls `childBoxService.activate(id)` — a write operation triggered by a conceptually read-only scan.

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-101 | Admin | Scanning GENERATED box triggers activation `[?66]` | P0 | 1. Trace `CB-GENERATED-01`. | `POST /child-boxes/{id}/activate` fired automatically. Alert "Box activated" / "Box activated — now part of available stock" shown. | E2E | `mobile/app/(tabs)/scan.tsx:31-35` auto-activation path |
| TC-MOB-SCAN-102 | Admin | After activation, result shows FREE status | P0 | 1. Trace `CB-GENERATED-01` (activation succeeds). | Child Box card badge shows "FREE" (activated data replaces original). | E2E | `mobile/app/(tabs)/scan.tsx:34` `data.childBox = activated` |
| TC-MOB-SCAN-103 | Warehouse Operator | Warehouse Op scanning GENERATED box also triggers activation `[?66]` | P1 | 1. Login as Warehouse Op. 2. Trace `CB-GENERATED-01`. | Activation fires; Alert shown; FREE badge displayed. Warehouse Op has no special prevention. | Manual | `mobile/app/(tabs)/scan.tsx:31-39` — no role check before activation |
| TC-MOB-SCAN-104 | Admin | Activation failure silently swallowed `[?66][?74]` | P1 | 1. Mock `childBoxService.activate` to throw. 2. Trace `CB-GENERATED-01`. | No error shown; no Alert; trace result displays with original GENERATED status. Empty `catch {}` silently drops the error. | Manual | `mobile/app/(tabs)/scan.tsx:36-38` empty `catch {}`; see `[?66]` and `[?74]` |
| TC-MOB-SCAN-105 | Admin | No confirmation prompt before activation `[?66]` | P2 | Trace `CB-GENERATED-01`. | Activation fires immediately with no user confirmation dialog. User performing a read-only inspect unknowingly activates stock. | Manual | `mobile/app/(tabs)/scan.tsx:31-35` — no `Alert.alert(…, [{ text:'Confirm' }])` before `childBoxService.activate` |

---

## Section 29.20 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|---|---|---|---|---|---|---|---|
| TC-MOB-SCAN-106 | Admin | Clear button resets barcode, result, and error | P1 | 1. Trace valid barcode → result shows. 2. Tap "Clear". | `barcode` field empty; result card gone; error card gone; empty state returns. `loading` state unaffected (already false). | Manual | `mobile/app/(tabs)/scan.tsx:48-52` `handleClear` — does NOT reset `loading` |
| TC-MOB-SCAN-107 | Admin | Network failure shows error card | P1 | 1. Disable network. 2. Enter barcode. 3. Tap Trace. | Error card shows "Network Error" or similar. Loading spinner stops. | E2E | `mobile/app/(tabs)/scan.tsx:41-43` catch block |
| TC-MOB-SCAN-108 | Admin | Tapping Trace during loading is idempotent | P2 | 1. Tap Trace (slow network). 2. Immediately tap Trace again. | Second tap calls `handleTrace` again; `setLoading(true)` again; `setResult(null)` again; first in-flight request may race. No double-spinner guard. | Manual | `mobile/app/(tabs)/scan.tsx:22-46` — no in-flight check; both calls proceed |
| TC-MOB-SCAN-109 | Admin | Unknown-type barcode passes through to backend | P1 | 1. Enter `ZZZZZZZZ`. 2. Tap Trace. | `handleTrace` calls `traceByBarcode("ZZZZZZZZ")`; backend returns 404; error card "Item not found" shown. | Manual | `mobile/app/(tabs)/scan.tsx:29` — `handleTrace` does not pre-filter by `parseQRCode` type |
| TC-MOB-SCAN-110 | Admin | Embedded legacy barcode in QR text is traced raw | P2 | Camera QR payload: `"SCAN:BINNY-CB-abc:END"`. On scan tab. | `handleTrace("SCAN:BINNY-CB-abc:END")` fires; backend receives raw string; may 404 if endpoint requires clean barcode. Note: `parseQRCode` would match sub-string, but `handleTrace` uses raw `data` from camera, not parsed `.id`. | Manual | `mobile/app/(tabs)/scan.tsx:97-98` `handleTrace(data)` passes raw; `mobile/services/trace.service.ts:6` sends raw to URL |
| TC-MOB-SCAN-111 | Admin | Scan same barcode twice: result replaces previous | P1 | 1. Trace barcode A → result A. 2. Trace barcode B → result B. | Result B card replaces result A; no duplicate cards. | Manual | `mobile/app/(tabs)/scan.tsx:27` `setResult(null)` clears previous before setting new |
| TC-MOB-SCAN-112 | Admin | Camera scan while manual barcode entered: barcode field updated | P1 | 1. Type `CBABC123` in field. 2. Open scanner. 3. Scan `MCXYZ456`. | Field now shows `MCXYZ456`; trace result for MC barcode shows. | Manual | `mobile/app/(tabs)/scan.tsx:96-99` `setBarcode(data)` overwrites field |
| TC-MOB-SCAN-113 | Dispatch Operator | Dispatch Op can scan and trace (no role restriction) | P1 | 1. Login as Dispatch Op. 2. Trace `CB-FREE-01`. | Result renders normally. | E2E | `mobile/app/(tabs)/_layout.tsx:41-49` — no role gate on scan tab |

---

## Maestro flows index

Paths: `mobile/.maestro/scan/<name>.yaml`. Not created — index only.

| Flow | File | Roles | Covers |
|---|---|---|---|
| scan-tab-access-warehouse | `mobile/.maestro/scan/scan-tab-access-warehouse.yaml` | Warehouse Operator | TC-MOB-SCAN-003, TC-MOB-SCAN-113 — Verify Scan tab visible and functional for non-Admin role |
| scan-camera-permission-denied | `mobile/.maestro/scan/scan-camera-permission-denied.yaml` | Admin | TC-MOB-SCAN-025, TC-MOB-SCAN-026, TC-MOB-SCAN-027 — denied view copy + Close button |
| scan-manual-entry-happy-path | `mobile/.maestro/scan/scan-manual-entry-happy-path.yaml` | Admin | TC-MOB-SCAN-013, TC-MOB-SCAN-066, TC-MOB-SCAN-072, TC-MOB-SCAN-075 — type CB barcode, tap Trace, verify Child Box card |
| scan-clear-resets | `mobile/.maestro/scan/scan-clear-resets.yaml` | Admin | TC-MOB-SCAN-106 — trace, verify result, tap Clear, verify empty state |
| scan-generated-auto-activate | `mobile/.maestro/scan/scan-generated-auto-activate.yaml` | Admin | TC-MOB-SCAN-101, TC-MOB-SCAN-102 — scan GENERATED box, verify Alert + FREE badge |
| scan-error-not-found | `mobile/.maestro/scan/scan-error-not-found.yaml` | Admin | TC-MOB-SCAN-091, TC-MOB-SCAN-094 — fake barcode → error card |
| scan-master-carton-only | `mobile/.maestro/scan/scan-master-carton-only.yaml` | Admin | TC-MOB-SCAN-079, TC-MOB-SCAN-080 — trace MC barcode directly; Master Carton card appears; no Child Box card |

```yaml
# Example: scan-manual-entry-happy-path.yaml
# mobile/.maestro/scan/scan-manual-entry-happy-path.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- tapOn: "Login"
- inputText: "admin@binny.com"
- tapOn: "Password"
- inputText: "Admin@123"
- tapOn: "Sign In"
- tapOn:
    text: "Scan"
    index: 0
- assertVisible: "Scan & Trace"
- tapOn: "Enter barcode"
- inputText: "CBABC123"
- tapOn: "Trace"
- assertVisible: "Child Box"
- assertVisible: "Barcode"
- assertVisible: "Article"
- assertVisible: "Colour / Size"
- assertVisible: "MRP"
```

```yaml
# Example: scan-generated-auto-activate.yaml
# mobile/.maestro/scan/scan-generated-auto-activate.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- tapOn: "Login"
- inputText: "admin@binny.com"
- tapOn: "Password"
- inputText: "Admin@123"
- tapOn: "Sign In"
- tapOn:
    text: "Scan"
    index: 0
- tapOn: "Enter barcode"
- inputText: "CBGEN001"        # CB-GENERATED-01 barcode
- tapOn: "Trace"
- assertVisible: "Box activated"
- tapOn: "OK"
- assertVisible: "FREE"
```

---

## Open questions / `[?]` flags

Rows continue from phase-28 (which ended at `[?64]`).

| # | Severity | Flag | Location | Recommendation |
|---|---|---|---|---|
| 65 | HIGH | **Sample / E-commerce trace results not rendered in UI** | `mobile/app/(tabs)/scan.tsx:114-156` — only `result.childBox` and `result.masterCarton` branches. `parseQRCode` supports SR/EC; backend resolves them; but UI has no card for samples or ecommerce records. Timeline renders, source info hidden. | Extend `scan.tsx` with Sample and E-commerce result cards, or document Scan tab as CB/MC-only and adjust `expectedType` accordingly. |
| 66 | HIGH | **Auto-activation side effect on GENERATED boxes** | `mobile/app/(tabs)/scan.tsx:31-39` — conceptually read-only Trace silently transitions GENERATED→FREE. Any role (including Warehouse Op) scanning to inspect inadvertently activates stock. | Add confirmation `Alert.alert` before calling `activate`; surface activation failure from empty `catch {}`. |
| 67 | MEDIUM | **Manual-entry placeholder references legacy format only** | `mobile/app/(tabs)/scan.tsx:77` placeholder `"Enter barcode (e.g., BINNY-CB-...)"`. Post-May-5 migration most boxes use short format. | Update placeholder to `"e.g., CBABC123 or BINNY-CB-…"` or short-format-only. |
| 68 | LOW | **Empty-state copy omits sample/ecommerce types** | `mobile/app/(tabs)/scan.tsx:183` "Track the complete lifecycle of any child box or master carton". Inconsistent with `expectedType="any"`. | Update copy to include sample and ecommerce, or restrict `expectedType` to `child\|master`. |
| 69 | MEDIUM | **Camera permission-denied view has no "Open Settings" deep-link** | `mobile/components/BarcodeScanner.tsx:127` — only "Close" button; no `Linking.openSettings()`. | Add "Open Settings" button to let users grant camera access without leaving the app. |
| 70 | LOW | **`parseQRCode` case-preservation inconsistency** | `mobile/utils/index.ts:35-38` short format returns `id: trimmed` (case-preserved); `:44` legacy returns `id: longMatch[0].toUpperCase()` (forced uppercase). | Normalise to always uppercase, or document that backend must be case-insensitive. Short-format codes typed lowercase would fail `[0-9A-Z]{6}` regex anyway (`autoCapitalize` helps on manual entry). |
| 71 | LOW | **No QR-frame visual rejection feedback** | `mobile/components/BarcodeScanner.tsx:79-86` — toast-only mismatch feedback; frame border stays accent-coloured. | Flash frame border red for ~300ms on rejection to complement toast. |
| 72 | LOW | **No haptic on manual Trace button tap** | `mobile/components/BarcodeScanner.tsx:88` — haptic only on camera success path. `handleTrace` in `scan.tsx` has no haptic. | Add `Haptics.notificationAsync(Success)` on successful trace result. |
| 73 | INFO | **No "Recent Scans" history** | `mobile/app/(tabs)/scan.tsx:48-52` — Clear discards everything. | Consider a short in-memory or AsyncStorage history list for QA and repeated tracing workflows. |
| 74 | HIGH | **GENERATED auto-activation failure silently swallowed** | `mobile/app/(tabs)/scan.tsx:36-38` — empty `catch {}`. Activation failure leaves trace result with stale GENERATED status; user unaware. | At minimum log to console; ideally surface a non-blocking warning banner. |
| 75 | MEDIUM | **No timeout on `traceByBarcode`** | `mobile/app/(tabs)/scan.tsx:25,44` — `loading` stays `true` indefinitely if backend hangs; no cancel button. | Add axios timeout config or a `Promise.race` with a 15s timeout; show a retry/cancel option. |

---

*Phase 29 authored: 2026-05-11 | Session 9 of 13 | Author: Claude Code (Sonnet 4.6) for Basiq360*

