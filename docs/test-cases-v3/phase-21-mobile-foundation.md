# Phase 21 — Mobile App Foundation (Auth, Tab Shell, Menu, Settings)

**Suite:** Binny Inventory v3
**Module focus:** Mobile-only — login/logout, session persistence, AuthGate routing, tab bar, Dashboard tab, Menu grid (role-gated tiles), Settings screen
**Mobile build under test:** Latest commit on `main` (mobile parity M1-M7 complete, EAS preview build `50dc7551`)
**Test framework:** Maestro for E2E flows (`mobile/.maestro/`); manual + API for the rest
**Last updated:** 2026-05-02

---

## Table of Contents

- [Section 21.1 — Login screen rendering](#section-211--login-screen-rendering)
- [Section 21.2 — Login validation and error paths](#section-212--login-validation-and-error-paths)
- [Section 21.3 — Login success per role](#section-213--login-success-per-role)
- [Section 21.4 — Token persistence and session restoration](#section-214--token-persistence-and-session-restoration)
- [Section 21.5 — AuthGate routing](#section-215--authgate-routing)
- [Section 21.6 — Tab bar (Dashboard / Scan / Inventory / Menu)](#section-216--tab-bar-dashboard--scan--inventory--menu)
- [Section 21.7 — Dashboard tab content](#section-217--dashboard-tab-content)
- [Section 21.8 — Menu grid — base tiles (all roles)](#section-218--menu-grid--base-tiles-all-roles)
- [Section 21.9 — Menu grid — Admin + Supervisor tiles](#section-219--menu-grid--admin--supervisor-tiles)
- [Section 21.10 — Menu grid — Admin-only tiles](#section-2110--menu-grid--admin-only-tiles)
- [Section 21.11 — Menu grid — Logout flow](#section-2111--menu-grid--logout-flow)
- [Section 21.12 — Settings screen](#section-2112--settings-screen)
- [Section 21.13 — 401 / token-expired handling](#section-2113--401--token-expired-handling)
- [Section 21.14 — Negative / edge cases](#section-2114--negative--edge-cases)

---

## Preconditions

- Mobile app installed from EAS preview build URL (or sideloaded `eas build --profile preview` APK). Package name: `com.basiq360.binnyinventory`.
- Backend reachable at the configured `API_BASE_URL` (default `https://srv1409601.hstgr.cloud/binny/api/v1`).
- All 4 role accounts exist (run `TC-USER-SEED-001` from `phase-02-user-management.md` if not — Admin can create the others via web `/users`):
  - Admin: `admin@binny.com` / `Admin@123`
  - Supervisor: `supervisor@binny.com` / `Sup@123`
  - Warehouse Operator: `warehouse@binny.com` / `Wh@123`
  - Dispatch Operator: `dispatch@binny.com` / `Dp@123`
- Device: Android emulator or physical device; iOS simulator optional.
- Maestro CLI installed locally for E2E flows: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- SecureStore is cleared before any session-persistence test (use `clearState` in Maestro or wipe app data via device settings).

---

## Section 21.1 — Login screen rendering

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-001 | Unauthenticated | Login screen renders Binny logo (letter B) | P0 | 1. Launch app cold (no stored session). 2. Wait for AuthGate to resolve. 3. Observe the screen. | A rounded square containing the letter "B" in white on accent-colored (`#E31E24`) background is visible in the header area. No crash or blank screen. | Manual | `styles.logoContainer` backgroundColor = `COLORS.accent`; `styles.logoB` fontSize 36 |
| TC-MOB-FOUND-002 | Unauthenticated | Login screen renders app title "Binny Inventory" | P0 | 1. Launch app with no session. 2. Observe header text below logo. | Text "Binny Inventory" is visible in white, fontSize 28, fontWeight 800. | Manual | `styles.appName` |
| TC-MOB-FOUND-003 | Unauthenticated | Login screen renders subtitle "Mahavir Polymers Pvt. Ltd." | P0 | 1. Launch app with no session. 2. Observe text below app title. | Text "Mahavir Polymers Pvt. Ltd." is visible in semi-transparent white (`rgba(255,255,255,0.7)`). | Manual | `styles.subtitle` |
| TC-MOB-FOUND-004 | Unauthenticated | Login screen renders "Sign In" card with correct form title and subtitle | P0 | 1. Launch app with no session. 2. Observe the white card below the header. | Card shows title "Sign In" (fontSize 22, fontWeight 700) and subtitle "Enter your credentials to continue" (fontSize 14, COLORS.textSecondary). | Manual | `styles.formCard` + `styles.formTitle` |
| TC-MOB-FOUND-005 | Unauthenticated | Login screen renders Email input with correct keyboard attributes | P0 | 1. Launch app with no session. 2. Observe Email input field. 3. Tap the field and observe the keyboard that appears. | Input labelled "Email" is visible; placeholder text "admin@binny.com"; keyboard type is email (@ visible on default row); autoCapitalize is none (no auto-capitalisation); autoComplete=email. | Manual | `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"` |
| TC-MOB-FOUND-006 | Unauthenticated | Login screen renders Password input with masked text and onSubmitEditing | P0 | 1. Launch app with no session. 2. Observe Password input. 3. Type any characters; observe rendering. 4. Press the keyboard submit button. | Input labelled "Password" with placeholder "Enter password"; typed characters render as dots/asterisks (secureTextEntry); pressing keyboard submit triggers handleLogin (same as tapping "Sign In"). | Manual | `secureTextEntry`, `autoComplete="password"`, `onSubmitEditing={handleLogin}` |
| TC-MOB-FOUND-007 | Unauthenticated | Login screen renders "Sign In" button | P0 | 1. Launch app with no session. 2. Observe the button inside the card. | Button with title "Sign In" is visible, full-width, large size; tappable. | Manual | `<Button title="Sign In" fullWidth size="lg" />` |
| TC-MOB-FOUND-008 | Unauthenticated | Login screen renders "Powered by Basiq360" footer | P0 | 1. Launch app with no session. 2. Scroll to bottom of card if needed. | Text "Powered by Basiq360" is visible centered below the Sign In button in `COLORS.textLight` (#9CA3AF), fontSize 12. | Manual | `styles.poweredBy` |
| TC-MOB-FOUND-010 | Unauthenticated | Login screen error box is hidden on initial render | P0 | 1. Launch app with no session. 2. Observe form card; do not interact. | No red error box is visible. The `error` state is empty string; conditional render `{error ? <View>...</View> : null}` evaluates to null. | Manual | `login.tsx:48` |

### Maestro flows for Section 21.1

```yaml
# mobile/.maestro/foundation/login-render.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- waitForAnimationToEnd
- assertVisible: "Binny Inventory"
- assertVisible: "Mahavir Polymers Pvt. Ltd."
- assertVisible: "Sign In"
- assertVisible: "Enter your credentials to continue"
- assertVisible: "Powered by Basiq360"
- assertNotVisible: "Please enter both email and password"
```

---

## Section 21.2 — Login validation and error paths

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-011 | Unauthenticated | Tapping Sign In with both fields empty shows inline error | P0 | 1. Launch app; observe login screen. 2. Leave Email and Password empty. 3. Tap "Sign In". | Red error box appears inside the form card with text "Please enter both email and password". No network call is made. `loading` remains false. | Manual | `login.tsx:17-19` — client-side guard before any API call |
| TC-MOB-FOUND-012 | Unauthenticated | Tapping Sign In with Email blank but Password filled shows inline error | P0 | 1. Launch app. 2. Leave Email empty; type "anything" in Password. 3. Tap "Sign In". | Error box: "Please enter both email and password". No API call. | Manual | `!email.trim()` is truthy even if password is filled |
| TC-MOB-FOUND-013 | Unauthenticated | Tapping Sign In with Password blank but Email filled shows inline error | P0 | 1. Launch app. 2. Type valid email; leave Password empty. 3. Tap "Sign In". | Error box: "Please enter both email and password". No API call. | Manual | `!password.trim()` guard |
| TC-MOB-FOUND-014 | Unauthenticated | Wrong credentials error is shown from API response | P0 | 1. Launch app. 2. Enter `admin@binny.com` in Email. 3. Enter `WrongPass99` in Password. 4. Tap "Sign In". 5. Wait for response. | Error box displays the API error message (e.g., "Invalid email or password") in red text inside the `errorBox` container (`backgroundColor: '#FEF2F2'`). URL remains on login screen. | Manual | `login.tsx:26` — `err?.response?.data?.message` |
| TC-MOB-FOUND-015 | Unauthenticated | Server 401 response is shown in error box | P0 | 1. POST `https://srv1409601.hstgr.cloud/binny/api/v1/auth/login` body `{"email":"nobody@example.com","password":"AnyPass@1"}` — confirm it returns HTTP 401 with `{"success":false,"message":"Invalid email or password"}`. 2. On mobile: enter those credentials and tap "Sign In". | Error box shows the exact `message` string from the 401 response. | Integration | Confirms `err.response.data.message` path is used |
| TC-MOB-FOUND-016 | Unauthenticated | Server 4xx/5xx response is shown in error box (429 rate-limit and 500 server error) | P1 | 1. Trigger repeated failed logins until backend returns 429 (or simulate 500). 2. Observe error box. | Error box shows the API `message` field for 429 (e.g., "Too many login attempts") or any 5xx message; falls back to "Login failed. Please check your credentials." when `err.response.data.message` is absent. Screen remains on login. | Manual | `login.tsx:26` — `err?.response?.data?.message \|\| 'Login failed...'` |
| TC-MOB-FOUND-018 | Unauthenticated | Network failure (no connection) shows fallback error message | P0 | 1. Disable Wi-Fi / mobile data on device. 2. Enter valid credentials. 3. Tap "Sign In". Wait 30 s (axios timeout). | Error box shows "Login failed. Please check your credentials." (the fallback). The axios timeout of 30 000 ms fires; `err.response` is undefined so `err?.response?.data?.message` is undefined; fallback string is used. | Manual | `api.ts:7` — `timeout: 30000` |
| TC-MOB-FOUND-019 | Unauthenticated | "Sign In" button shows loading indicator while login is in-flight | P0 | 1. Enter valid credentials. 2. Tap "Sign In". 3. Immediately observe the button before response arrives. | Button renders its loading state (spinner / activity indicator from `<Button loading={loading} />`). Button is not tappable during loading. | Manual | `login.tsx:13` — `loading` state; `<Button loading={loading} />` |
| TC-MOB-FOUND-020 | Unauthenticated | Error box clears when a new login attempt starts | P1 | 1. Enter wrong credentials; tap "Sign In" to produce an error. 2. Correct the credentials; tap "Sign In" again. 3. Observe error box before the new response arrives. | Error box disappears (`setError('')` on line 21 of `login.tsx`) at the start of the second attempt, before the API call resolves. | Manual | `login.tsx:21` |

### Maestro flows for Section 21.2

```yaml
# mobile/.maestro/foundation/login-empty-fields.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn: "Sign In"
- assertVisible: "Please enter both email and password"
```

```yaml
# mobile/.maestro/foundation/login-wrong-credentials.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "admin@binny.com"
- tapOn:
    text: "Password"
- inputText: "WrongPassword99"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Invalid email or password"
```

---

## Section 21.3 — Login success per role

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-021 | Admin | Admin login succeeds and lands on Dashboard tab | P0 | 1. Clear app state / SecureStore. 2. Enter `admin@binny.com` / `Admin@123`. 3. Tap "Sign In". 4. Wait for navigation. | Login screen dismisses; app navigates to `/(tabs)` (Dashboard tab). "Welcome to Binny Inventory" text is visible. Tab bar at the bottom shows 4 tabs. No error box. | E2E | AuthGate detects `isAuthenticated=true` → replaces to `/(tabs)` |
| TC-MOB-FOUND-022 | Supervisor | Supervisor login succeeds and lands on Dashboard tab | P0 | 1. Clear app state. 2. Enter `supervisor@binny.com` / `Sup@123`. 3. Tap "Sign In". 4. Wait for navigation. | Login screen dismisses; Dashboard tab visible with "Welcome to Binny Inventory". Tab bar present. | E2E | Requires TC-USER-SEED-001 |
| TC-MOB-FOUND-023 | Warehouse Operator | Warehouse Operator login succeeds and lands on Dashboard tab | P0 | 1. Clear app state. 2. Enter `warehouse@binny.com` / `Wh@123`. 3. Tap "Sign In". 4. Wait for navigation. | Login screen dismisses; Dashboard tab visible. | E2E | Requires TC-USER-SEED-001 |
| TC-MOB-FOUND-024 | Dispatch Operator | Dispatch Operator login succeeds and lands on Dashboard tab | P0 | 1. Clear app state. 2. Enter `dispatch@binny.com` / `Dp@123`. 3. Tap "Sign In". 4. Wait for navigation. | Login screen dismisses; Dashboard tab visible. | E2E | Requires TC-USER-SEED-001 |
| TC-MOB-FOUND-025 | Admin | Successful login stores token in SecureStore key `binny_auth_token` | P0 | 1. Clear app state. 2. Login as Admin. 3. Open a debug tool / adb shell to inspect SecureStore (or verify via subsequent app relaunch restoring session — see Section 21.4). | After login, `SecureStore.getItemAsync('binny_auth_token')` returns a non-empty JWT string. | Integration | `authStore.ts:26` |
| TC-MOB-FOUND-026 | Admin | Successful login stores user data in SecureStore key `binny_user_data` | P0 | 1. Clear app state. 2. Login as Admin. 3. Inspect SecureStore. | `SecureStore.getItemAsync('binny_user_data')` returns a valid JSON string with fields `id`, `name`, `email`, `role === "Admin"`. | Integration | `authStore.ts:27` |
| TC-MOB-FOUND-027 | Admin | Token is attached as Authorization header to the first post-login API call | P0 | 1. Set up a network proxy (e.g., Charles Proxy or `adb logcat`). 2. Login as Admin. 3. Observe the request to `GET /dashboard/stats` that fires on Dashboard load. | Request header contains `Authorization: Bearer <token>`. Token matches the one stored in SecureStore. | Integration | `api.ts:14-23` — request interceptor |

### Maestro flows for Section 21.3

```yaml
# mobile/.maestro/foundation/login-admin-success.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
- assertNotVisible: "Please enter both email and password"
```

```yaml
# mobile/.maestro/foundation/login-supervisor-success.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "supervisor@binny.com"
  PASSWORD: "Sup@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
```

```yaml
# mobile/.maestro/foundation/login-warehouse-success.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
```

```yaml
# mobile/.maestro/foundation/login-dispatch-success.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "dispatch@binny.com"
  PASSWORD: "Dp@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
```

---

## Section 21.4 — Token persistence and session restoration

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-028 | Admin | App relaunch with valid stored token restores session and skips login | P0 | 1. Login as Admin. 2. Background the app. 3. Terminate (force-kill) the app process. 4. Relaunch the app. 5. Observe the first screen shown. | App briefly shows a centered `ActivityIndicator` (COLORS.primary spinner on COLORS.background) while `loadStoredAuth` runs. Then navigates directly to `/(tabs)` (Dashboard). Login screen is NOT shown. | E2E | `authStore.ts:41-54`; `_layout.tsx:40-46` |
| TC-MOB-FOUND-029 | Admin | ActivityIndicator is shown during loadStoredAuth before navigation | P0 | 1. Login as Admin. 2. Force-kill the app. 3. Relaunch while observing the first rendered frame. | For a brief moment (until `loadStoredAuth` resolves), the screen shows a full-screen white/background view with a large `ActivityIndicator`. Then navigates to Dashboard. | Manual | `_layout.tsx:40-46` — `isLoading=true` initial state renders spinner |
| TC-MOB-FOUND-030 | Admin | Clearing SecureStore manually forces login screen on next launch | P0 | 1. Login as Admin. 2. Clear app data / wipe SecureStore from device settings. 3. Relaunch app. | `loadStoredAuth` finds no token; `isAuthenticated` stays false; AuthGate redirects to `/(auth)/login`. Login screen shown. | E2E | Verifies the non-persisted path |
| TC-MOB-FOUND-031 | Any | `loadStoredAuth` with corrupted USER_DATA (invalid JSON) does not crash | P0 | 1. Manually write a non-JSON string to SecureStore key `binny_user_data` (e.g., using a test harness or by modifying the app in debug mode). 2. Relaunch app. | App does NOT crash. `catch` block in `loadStoredAuth` (`authStore.ts:49-51`) swallows the `JSON.parse` error; `isLoading` is set false in `finally`; `isAuthenticated` remains false; user lands on login screen. | Manual | `authStore.ts:49-51` |
| TC-MOB-FOUND-032 | Any | `loadStoredAuth` with token present but USER_DATA absent results in login screen | P1 | 1. Write a valid token to `binny_auth_token` in SecureStore. 2. Ensure `binny_user_data` is absent. 3. Relaunch app. | The `if (token && userData)` guard (`authStore.ts:45`) fails; `isAuthenticated` stays false; login screen shown. | Manual | Guards against partial-write corruption |
| TC-MOB-FOUND-033 | Admin | SecureStore key names are exactly `binny_auth_token` and `binny_user_data` | P0 | 1. Login as Admin. 2. Inspect SecureStore keys via a debug build or device logs. | Exactly two keys are written: `binny_auth_token` (the JWT) and `binny_user_data` (JSON string). No other auth-related keys are created. | Integration | `constants/index.ts:30-33` — `STORAGE_KEYS.AUTH_TOKEN` and `STORAGE_KEYS.USER_DATA` |

### Maestro flows for Section 21.4

```yaml
# mobile/.maestro/foundation/session-restore.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
# Force relaunch without clearing state (simulates process kill + reopen)
- launchApp:
    clearState: false
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
- assertNotVisible: "Sign In"
```

---

## Section 21.5 — AuthGate routing

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-034 | Unauthenticated | Unauthenticated user attempting /(tabs) is redirected to login | P0 | 1. Clear all SecureStore (no session). 2. Launch app. 3. Observe first non-loading screen. | App renders `ActivityIndicator` briefly while `loadStoredAuth` runs, then `AuthGate` detects `!isAuthenticated && !inAuthGroup` and calls `router.replace('/(auth)/login')`. Login screen is displayed. | E2E | `_layout.tsx:33-34` |
| TC-MOB-FOUND-035 | Admin | Authenticated user navigating to /(auth)/login is redirected to tabs | P0 | 1. Login as Admin (session established). 2. Attempt to navigate to `/(auth)/login` (e.g., via deep link `binny://login` or programmatic nav). | AuthGate detects `isAuthenticated && inAuthGroup` and calls `router.replace('/(tabs)')`. Dashboard is shown; login screen is NOT shown. | E2E | `_layout.tsx:35-37` |
| TC-MOB-FOUND-036 | Unauthenticated | Deep link to a protected route while logged out routes to login | P1 | 1. Ensure no session. 2. Open deep link `binny://child-boxes` or similar protected route. 3. Observe navigation. | App opens to login screen (AuthGate redirects unauthenticated users). The deep-link target is NOT rendered without auth. | Manual | `[?]` After login, app may or may not return to the deep-link target — see Open Questions |
| TC-MOB-FOUND-037 | Any | AuthGate isLoading blocks routing until loadStoredAuth completes | P0 | 1. Launch app. 2. Observe that no navigation occurs during the loading phase. | `isLoading` starts as `true`. The `useEffect` in AuthGate returns early (`if (isLoading) return`) on line 29 of `_layout.tsx`. Neither login nor dashboard is shown until `loadStoredAuth` resolves. Only `ActivityIndicator` is visible. | Manual | `_layout.tsx:29` |

### Maestro flows for Section 21.5

```yaml
# mobile/.maestro/foundation/authgate-unauth-redirect.yaml
appId: com.basiq360.binnyinventory
---
- clearState
- launchApp
- waitForAnimationToEnd
# If no session, AuthGate should have redirected to login
- assertVisible: "Sign In"
- assertVisible: "Binny Inventory"
- assertNotVisible: "Welcome to Binny Inventory"
```

```yaml
# mobile/.maestro/foundation/authgate-auth-skip-login.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
# Now authenticated — relaunch without clear; should land on dashboard, not login
- launchApp:
    clearState: false
- waitForAnimationToEnd
- assertNotVisible: "Sign In"
- assertVisible: "Dashboard"
```

---

## Section 21.6 — Tab bar (Dashboard / Scan / Inventory / Menu)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-038 | Admin | Tab bar shows exactly 4 tabs: Dashboard, Scan, Inventory, Menu | P0 | 1. Login as Admin. 2. Observe the bottom tab bar. | Tab bar shows 4 labels: "Dashboard", "Scan", "Inventory", "Menu". No other tabs visible. | E2E | `(tabs)/_layout.tsx` — 4 `Tabs.Screen` entries |
| TC-MOB-FOUND-039 | Admin | All 4 tab icons are correct Ionicons (home / qr-code / layers / grid) | P0 | 1. Login as Admin. 2. Observe each tab icon in the bottom bar. | Dashboard tab: `home` icon. Scan tab: `qr-code` icon. Inventory tab: `layers` icon. Menu tab: `grid` icon. Each icon appears alongside its label. | Manual | `_layout.tsx:36-63` |
| TC-MOB-FOUND-043 | Admin | Active tab tint is COLORS.primary (#2D2A6E) | P0 | 1. Login as Admin. 2. Tap each tab in turn. 3. Observe icon and label colour of the active tab vs inactive tabs. | Active tab icon and label render in `#2D2A6E`; inactive tabs render in `COLORS.textLight` (`#9CA3AF`). | Manual | `tabBarActiveTintColor: COLORS.primary`, `tabBarInactiveTintColor: COLORS.textLight` |
| TC-MOB-FOUND-045 | Admin | Header bar is COLORS.primary with white tint and bold title | P0 | 1. Login as Admin. 2. Navigate to Dashboard; observe the screen header. | Header background color is `#2D2A6E`; title text ("Dashboard") is white (`COLORS.surface`); title fontWeight 700, fontSize 18. | Manual | `_layout.tsx:21-30` |
| TC-MOB-FOUND-046 | Admin | Tapping Dashboard tab navigates to Dashboard screen without losing auth | P0 | 1. Login as Admin. 2. Tap the Menu tab. 3. Tap the Dashboard tab. | Dashboard screen is shown ("Welcome to Binny Inventory" visible). Auth state is intact; no redirect to login. | E2E | Verifies tab switch doesn't reset auth |
| TC-MOB-FOUND-047 | Admin | Tapping Inventory tab navigates to Inventory screen | P0 | 1. Login as Admin. 2. Tap the "Inventory" tab. | Inventory tab screen is rendered. Tab bar remains visible at the bottom. | E2E | |
| TC-MOB-FOUND-048 | Admin | Tapping Menu tab navigates to Menu screen | P0 | 1. Login as Admin. 2. Tap the "Menu" tab. | Menu grid screen is rendered with user card and tiles. Tab bar visible. | E2E | |
| TC-MOB-FOUND-049 | Admin | Tab bar is hidden on /settings Stack screen | P0 | 1. Login as Admin. 2. From Menu tab, tap "Settings". 3. Observe bottom of screen on Settings page. | Settings screen opens as a Stack screen (not a tab). Tab bar is NOT visible on this screen. Stack header shows "Settings" title. | Manual | `settings.tsx` uses `<Stack.Screen options={{ title: 'Settings' }} />` — outside the tab navigator |
| TC-MOB-FOUND-050 | Warehouse Operator | Tab bar shows same 4 tabs for Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Observe tab bar. | Same 4 tabs (Dashboard, Scan, Inventory, Menu) are visible. No tabs are hidden for this role. Tab bar is not role-gated. | E2E | All 4 tabs visible to all authenticated roles per `(tabs)/_layout.tsx` |

### Maestro flows for Section 21.6

```yaml
# mobile/.maestro/foundation/tab-navigation.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Dashboard"
- assertVisible: "Scan"
- assertVisible: "Inventory"
- assertVisible: "Menu"
- tapOn: "Menu"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- tapOn: "Dashboard"
- waitForAnimationToEnd
- assertVisible: "Welcome to Binny Inventory"
```

---

## Section 21.7 — Dashboard tab content

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-051 | Admin | Dashboard shows "Welcome to Binny Inventory" text | P0 | 1. Login as Admin. 2. Dashboard tab is active by default. 3. Observe top of scroll content. | Text "Welcome to Binny Inventory" is visible (fontSize 15, COLORS.textSecondary). | E2E | `index.tsx:45` |
| TC-MOB-FOUND-052 | Admin | Dashboard shows 4 stat cards in 2×2 grid | P0 | 1. Login as Admin. 2. Observe the stat card grid on Dashboard. | Four stat cards visible: "Child Boxes" (COLORS.primary icon), "Master Cartons" (COLORS.info), "Dispatches" (COLORS.success), "Pairs in Stock" (COLORS.accent). Cards are arranged in a 2-column wrap layout. | E2E | `index.tsx:47-51` |
| TC-MOB-FOUND-053 | Admin | Child Boxes stat card shows correct icon and value from API | P0 | 1. `GET https://srv1409601.hstgr.cloud/binny/api/v1/dashboard/stats` with valid Admin token. Note `totalChildBoxes` value. 2. Login as Admin on mobile. 3. Observe Child Boxes card. | Card shows `cube-outline` icon in a tinted square (COLORS.primary + 15% opacity), numeric value matching `totalChildBoxes`, label "Child Boxes". | Integration | `index.tsx:48`; `dashboardService.getStats()` |
| TC-MOB-FOUND-054 | Admin | Master Cartons stat card shows `totalMasterCartons` from API | P0 | 1. Note `totalMasterCartons` from `GET /dashboard/stats`. 2. Observe Master Cartons card on Dashboard. | Numeric value matches `totalMasterCartons`; icon `archive-outline`; label "Master Cartons"; COLORS.info tint. | Integration | `index.tsx:49` |
| TC-MOB-FOUND-055 | Admin | Dispatches stat card shows `totalDispatches` from API | P0 | 1. Note `totalDispatches` from `GET /dashboard/stats`. 2. Observe Dispatches card. | Value matches `totalDispatches`; icon `paper-plane-outline`; label "Dispatches"; COLORS.success tint. | Integration | `index.tsx:50` |
| TC-MOB-FOUND-056 | Admin | Pairs in Stock stat card shows `totalPairsInStock` from API | P0 | 1. Note `totalPairsInStock` from `GET /dashboard/stats`. 2. Observe Pairs in Stock card. | Value matches `totalPairsInStock`; icon `footsteps-outline`; label "Pairs in Stock"; COLORS.accent tint. | Integration | `index.tsx:51` |
| TC-MOB-FOUND-057 | Admin | Quick Summary card shows all 5 rows with correct labels | P0 | 1. Login as Admin. 2. Scroll to Quick Summary card. | Card has section title "Quick Summary" (fontWeight 700). Five rows visible: "Free Boxes", "Packed Boxes", "Active Cartons", "Closed Cartons", "Today's Dispatches". Each row shows label on left and value on right. | E2E | `index.tsx:54-76` |
| TC-MOB-FOUND-058 | Admin | Quick Summary values match GET /dashboard/stats response fields | P0 | 1. Call `GET /dashboard/stats` with Admin token; record `freeChildBoxes`, `packedChildBoxes`, `activeMasterCartons`, `closedMasterCartons`, `todayDispatches`. 2. Compare with Quick Summary rows on Dashboard. | Row values match exactly: Free Boxes=`freeChildBoxes`, Packed Boxes=`packedChildBoxes`, Active Cartons=`activeMasterCartons`, Closed Cartons=`closedMasterCartons`, Today's Dispatches=`todayDispatches`. | Integration | `index.tsx:57-75` |
| TC-MOB-FOUND-060 | Admin | Dashboard shows Spinner fullscreen while stats are loading | P0 | 1. On a slow connection, login as Admin. 2. Observe Dashboard tab immediately after navigation. | Before `GET /dashboard/stats` response arrives, the entire Dashboard screen shows a fullscreen `<Spinner />` component. No partial UI is visible during load. | Manual | `index.tsx:37` — `if (isLoading) return <Spinner fullScreen />` |
| TC-MOB-FOUND-061 | Admin | Pull-to-refresh re-fetches dashboard stats | P0 | 1. Login as Admin. 2. Note current stat values on Dashboard. 3. Create a new dispatch via web portal to change `totalDispatches`. 4. On mobile, pull down on Dashboard screen (pull-to-refresh gesture). | `RefreshControl` fires `onRefresh` callback; `refetch()` is called; dashboard stats update to reflect new data. `refreshing` spinner is visible during re-fetch. | Integration | `index.tsx:31-35` — `onRefresh` callback |
| TC-MOB-FOUND-062 | Warehouse Operator | All 4 roles can view Dashboard (no role gate) | P0 | 1. Login as each of the 4 roles in separate test runs. 2. Navigate to Dashboard tab. | Dashboard with stat cards and Quick Summary is visible to all roles — Admin, Supervisor, Warehouse Operator, Dispatch Operator. No "access denied" or empty screen. | Manual | Dashboard has no `<RoleGate>` wrapper |

---

## Section 21.8 — Menu grid — base tiles (all roles)

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-063 | Warehouse Operator | All 8 base tiles visible to Warehouse Operator | P0 | 1. Login as Warehouse Operator. 2. Tap Menu tab. 3. Observe tile grid. | The following 8 tiles are visible: "Child Boxes", "Master Cartons", "Pack", "Dispatch", "Unpack", "Repack", "Storage", "Settings". All rendered without role gate. | E2E | `menu.tsx:72-79` — all 8 rendered unconditionally |
| TC-MOB-FOUND-064 | Admin | All 8 base tiles visible to Admin | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Observe tile grid. | The following 8 base tiles are visible: "Child Boxes", "Master Cartons", "Pack", "Dispatch", "Unpack", "Repack", "Storage", "Settings". | E2E | `menu.tsx:72-79` — base tiles render unconditionally |
| TC-MOB-FOUND-065 | Admin | Child Boxes tile navigates to /child-boxes | P0 | 1. Login as Admin. 2. Menu tab → tap "Child Boxes". | App navigates to `/child-boxes` route. Child Boxes screen renders. Tab bar is hidden (stack screen). | E2E | `menu.tsx:72` — `route: '/child-boxes'` |
| TC-MOB-FOUND-066 | Admin | Master Cartons tile navigates to /master-cartons | P0 | 1. Login as Admin. 2. Menu tab → tap "Master Cartons". | App navigates to `/master-cartons`. | E2E | `menu.tsx:73` |
| TC-MOB-FOUND-067 | Admin | Pack tile navigates to /master-cartons/create | P0 | 1. Login as Admin. 2. Menu tab → tap "Pack". | App navigates to `/master-cartons/create`. | E2E | `menu.tsx:74` — `route: '/master-cartons/create'` |
| TC-MOB-FOUND-068 | Admin | Dispatch tile navigates to /dispatch | P0 | 1. Login as Admin. 2. Menu tab → tap "Dispatch". | App navigates to `/dispatch`. | E2E | `menu.tsx:75` |
| TC-MOB-FOUND-069 | Admin | Unpack tile navigates to /unpack | P0 | 1. Login as Admin. 2. Menu tab → tap "Unpack". | App navigates to `/unpack`. | E2E | `menu.tsx:76` |
| TC-MOB-FOUND-070 | Supervisor | All 8 base tiles visible to Supervisor | P0 | 1. Login as Supervisor. 2. Tap Menu tab. 3. Observe tile grid. | All 8 base tiles ("Child Boxes", "Master Cartons", "Pack", "Dispatch", "Unpack", "Repack", "Storage", "Settings") are visible. | E2E | `menu.tsx:72-79` |
| TC-MOB-FOUND-071 | Dispatch Operator | All 8 base tiles visible to Dispatch Operator | P0 | 1. Login as Dispatch Operator. 2. Tap Menu tab. 3. Observe tile grid. | All 8 base tiles ("Child Boxes", "Master Cartons", "Pack", "Dispatch", "Unpack", "Repack", "Storage", "Settings") are visible. The Dispatch Op cannot mutate via several of these screens (gated downstream), but the menu tile is still rendered. | E2E | `menu.tsx:72-79` — tiles are not RoleGated; downstream screens may deny actions |
| TC-MOB-FOUND-072 | Admin | Settings tile navigates to /settings | P0 | 1. Login as Admin. 2. Menu tab → tap "Settings". | App navigates to `/settings`. Settings screen renders with Stack header "Settings". | E2E | `menu.tsx:79` |
| TC-MOB-FOUND-073 | Admin | User card shows first letter of name as avatar | P0 | 1. Login as Admin (name "Admin" or as set in DB). 2. Tap Menu tab. 3. Observe user card at top. | Avatar circle (48×48, COLORS.primary) shows the first letter of the user's name in white (fontSize 20, fontWeight 700). | E2E | `menu.tsx:61` — `user?.name?.charAt(0) || 'U'` |
| TC-MOB-FOUND-074 | Admin | User card shows full name and role label | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Observe user card text. | Full name (from `user.name`) displayed in fontSize 16, fontWeight 700. Role ("Admin") displayed below in fontSize 13, COLORS.textSecondary. | E2E | `menu.tsx:63-66` |

### Maestro flows for Section 21.8

```yaml
# mobile/.maestro/foundation/menu-base-tiles.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- assertVisible: "Master Cartons"
- assertVisible: "Pack"
- assertVisible: "Dispatch"
- assertVisible: "Unpack"
- assertVisible: "Repack"
- assertVisible: "Storage"
- assertVisible: "Settings"
```

```yaml
# mobile/.maestro/foundation/menu-tile-navigation.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Settings"
- waitForAnimationToEnd
- assertVisible: "Settings"
- back
- waitForAnimationToEnd
```

---

## Section 21.9 — Menu grid — Admin + Supervisor tiles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-075 | Admin | Admin sees all 5 Admin+Supervisor tiles | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Scroll through tile grid. | Tiles visible: "Products", "Customers", "Samples", "E-commerce", "Reports". All 5 present. | E2E | `menu.tsx:82-96` — `<RoleGate allow={['Admin', 'Supervisor']}>` |
| TC-MOB-FOUND-076 | Supervisor | Supervisor sees all 5 Admin+Supervisor tiles | P0 | 1. Login as Supervisor. 2. Tap Menu tab. | Same 5 tiles visible: Products, Customers, Samples, E-commerce, Reports. | E2E | |
| TC-MOB-FOUND-077 | Warehouse Operator | Warehouse Operator does NOT see Products, Customers, Samples, E-commerce, Reports tiles | P0 | 1. Login as Warehouse Operator. 2. Tap Menu tab. 3. Verify tile grid. | Tiles "Products", "Customers", "Samples", "E-commerce", and "Reports" are NOT visible. `RoleGate` renders null for roles not in `['Admin', 'Supervisor']`. | E2E | `RoleGate.tsx:14` — renders `fallback` (null) |
| TC-MOB-FOUND-078 | Dispatch Operator | Dispatch Operator does NOT see Products, Customers, Samples, E-commerce, Reports tiles | P0 | 1. Login as Dispatch Operator. 2. Tap Menu tab. 3. Verify tile grid. | Tiles "Products", "Customers", "Samples", "E-commerce", and "Reports" are NOT visible. `RoleGate` with `allow={['Admin', 'Supervisor']}` renders null for Dispatch Operator. | E2E | `menu.tsx:82-96` |
| TC-MOB-FOUND-079 | Admin | Products tile navigates to /products | P0 | 1. Login as Admin. 2. Menu → tap "Products". | App navigates to `/products`. | E2E | `menu.tsx:83` |
| TC-MOB-FOUND-080 | Admin | Customers tile navigates to /customers | P0 | 1. Login as Admin. 2. Menu → tap "Customers". | App navigates to `/customers`. | E2E | `menu.tsx:86` |
| TC-MOB-FOUND-081 | Admin | Samples tile navigates to /samples | P0 | 1. Login as Admin. 2. Menu → tap "Samples". | App navigates to `/samples`. | E2E | `menu.tsx:89` |
| TC-MOB-FOUND-082 | Admin | E-commerce tile navigates to /ecommerce | P0 | 1. Login as Admin. 2. Menu → tap "E-commerce". | App navigates to `/ecommerce`. | E2E | `menu.tsx:92` |
| TC-MOB-FOUND-083 | Admin | Reports tile navigates to /reports | P0 | 1. Login as Admin. 2. Menu → tap "Reports". | App navigates to `/reports`. | E2E | `menu.tsx:95` |

### Maestro flows for Section 21.9

```yaml
# mobile/.maestro/foundation/menu-admin-supervisor-tiles-visible.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "supervisor@binny.com"
  PASSWORD: "Sup@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- assertVisible: "Products"
- assertVisible: "Customers"
- assertVisible: "Samples"
- assertVisible: "E-commerce"
- assertVisible: "Reports"
```

```yaml
# mobile/.maestro/foundation/menu-warehouse-restricted-tiles.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "warehouse@binny.com"
  PASSWORD: "Wh@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- assertNotVisible: "Products"
- assertNotVisible: "Customers"
- assertNotVisible: "Samples"
- assertNotVisible: "E-commerce"
- assertNotVisible: "Reports"
- assertNotVisible: "Users"
```

---

## Section 21.10 — Menu grid — Admin-only tiles

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-084 | Admin | Admin sees "Users" tile in menu | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Observe grid. | Tile labelled "Users" is visible (icon `person-add-outline`, COLORS.accent tint). | E2E | `menu.tsx:99-101` — `<RoleGate allow={['Admin']}>` |
| TC-MOB-FOUND-085 | Supervisor | Supervisor does NOT see "Users" tile | P0 | 1. Login as Supervisor. 2. Tap Menu tab. | "Users" tile is NOT visible. `RoleGate` with `allow={['Admin']}` renders null for Supervisor. | E2E | |
| TC-MOB-FOUND-086 | Warehouse Operator | Warehouse Operator does NOT see "Users" tile | P0 | 1. Login as Warehouse Operator. 2. Tap Menu tab. | "Users" tile is NOT visible. `RoleGate` with `allow={['Admin']}` renders null for Warehouse Operator. | E2E | `menu.tsx:99-101` |
| TC-MOB-FOUND-087 | Dispatch Operator | Dispatch Operator does NOT see "Users" tile | P0 | 1. Login as Dispatch Operator. 2. Tap Menu tab. | "Users" tile is NOT visible. `RoleGate` with `allow={['Admin']}` renders null for Dispatch Operator. | E2E | `menu.tsx:99-101` |
| TC-MOB-FOUND-088 | Admin | Users tile navigates to /users | P0 | 1. Login as Admin. 2. Menu → tap "Users". | App navigates to `/users`. | E2E | `menu.tsx:100` — `route: '/users'` |

### Maestro flows for Section 21.10

```yaml
# mobile/.maestro/foundation/menu-admin-only-tile.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- assertVisible: "Users"
```

```yaml
# mobile/.maestro/foundation/menu-supervisor-no-users-tile.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "supervisor@binny.com"
  PASSWORD: "Sup@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- assertNotVisible: "Users"
```

---

## Section 21.11 — Menu grid — Logout flow

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-089 | Admin | Logout tile on Menu shows confirmation Alert | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Tap "Logout" tile (red icon, bottom of grid). | `Alert.alert` fires with title "Logout", message "Are you sure you want to logout?", two buttons: "Cancel" (cancel style) and "Logout" (destructive style). No immediate logout occurs. | E2E | `menu.tsx:49-53` |
| TC-MOB-FOUND-090 | Admin | Tapping Cancel on logout Alert dismisses dialog and stays on Menu | P0 | 1. Login as Admin. 2. Menu → tap "Logout". 3. In the Alert dialog, tap "Cancel". | Alert dismisses. User remains on Menu tab. Auth state unchanged. Session is still active. | E2E | `{ text: 'Cancel', style: 'cancel' }` |
| TC-MOB-FOUND-091 | Admin | Tapping Logout on logout Alert clears SecureStore and returns to login | P0 | 1. Login as Admin. 2. Menu → tap "Logout". 3. In the Alert dialog, tap "Logout" (destructive). | `logout()` is called; both SecureStore keys (`binny_auth_token`, `binny_user_data`) are deleted; `isAuthenticated` becomes false; AuthGate redirects to `/(auth)/login`. Login screen is shown. | E2E | `authStore.ts:31-38` |
| TC-MOB-FOUND-092 | Supervisor | Logout tile visible and functional for Supervisor | P0 | 1. Login as Supervisor. 2. Menu → tap "Logout" → confirm. | Logout completes; login screen shown. | E2E | Logout tile is rendered unconditionally (not role-gated) |
| TC-MOB-FOUND-093 | Admin | After logout, reopening app shows login screen (no persisted session) | P0 | 1. Login as Admin. 2. Logout via Menu (confirm in Alert). 3. Background and relaunch the app. | SecureStore is empty; `loadStoredAuth` finds nothing; AuthGate shows login screen. No previous session restored. | E2E | Verifies SecureStore was fully cleared |

### Maestro flows for Section 21.11

```yaml
# mobile/.maestro/foundation/menu-logout-cancel.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Logout"
- waitForAnimationToEnd
- assertVisible: "Are you sure you want to logout?"
- tapOn: "Cancel"
- waitForAnimationToEnd
- assertVisible: "Child Boxes"
- assertNotVisible: "Sign In"
```

```yaml
# mobile/.maestro/foundation/menu-logout-confirm.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Logout"
- waitForAnimationToEnd
- assertVisible: "Are you sure you want to logout?"
- tapOn: "Logout"
- waitForAnimationToEnd
- assertVisible: "Sign In"
- assertNotVisible: "Welcome to Binny Inventory"
```

---

## Section 21.12 — Settings screen

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-E2E-001 | Admin | Settings screen is reachable from Menu → Settings tile | P0 | 1. Login as Admin. 2. Tap Menu tab. 3. Tap "Settings" tile. | Settings screen opens. Stack header shows title "Settings". Tab bar is NOT visible (Stack screen). | E2E | `settings.tsx:28` — `<Stack.Screen options={{ title: 'Settings' }} />` |
| TC-MOB-FOUND-E2E-002 | Admin | Settings user card shows 56px avatar with first letter of name | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Observe user card. | User card shows a 56×56 circular avatar (borderRadius 28) with `COLORS.primary` background and the first letter of the logged-in user's name in white (fontSize 24, fontWeight 700). | E2E | `settings.tsx:77-82` |
| TC-MOB-FOUND-E2E-003 | Admin | Settings user card shows name and email | P0 | 1. Login as Admin. 2. Navigate to Settings. | User card shows full name (`user.name`) in fontSize 17 fontWeight 700, and email (`user.email`) in fontSize 13 COLORS.textSecondary. | E2E | `settings.tsx:37-38` |
| TC-MOB-FOUND-E2E-004 | Admin | Settings user card shows role Badge | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Observe below email in user card. | A `<Badge>` component with label "Admin" and color `COLORS.primary` is visible in the `roleRow` area. | E2E | `settings.tsx:39` — `<Badge label={user.role} color={COLORS.primary} />` |
| TC-MOB-FOUND-E2E-005 | Supervisor | Settings shows correct role label "Supervisor" in Badge | P0 | 1. Login as Supervisor. 2. Navigate to Settings via Menu → Settings. | Badge shows label "Supervisor". | E2E | |
| TC-MOB-FOUND-E2E-006 | Admin | Settings About section shows App="Binny Inventory" | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Observe About card. | Row labelled "App" has value "Binny Inventory". | E2E | `settings.tsx:45` |
| TC-MOB-FOUND-E2E-007 | Admin | Settings About section shows Version from app.json (1.0.0) | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Observe "Version" row. | Row labelled "Version" shows "1.0.0" (matching `expo.version` in `mobile/app.json`). Derived from `Constants.expoConfig.version`. | E2E | `settings.tsx:13` — `Constants.expoConfig?.version ?? '—'` |
| TC-MOB-FOUND-E2E-008 | Admin | Settings About section shows Platform row | P0 | 1. Login as Admin on Android device/emulator. 2. Navigate to Settings. 3. Observe "Platform" row. | Row labelled "Platform" shows value like "android 29" or "android 34" (Platform.OS + " " + Platform.Version). | E2E | `settings.tsx:47` — `${Platform.OS} ${Platform.Version}` |
| TC-MOB-FOUND-E2E-009 | Admin | Settings About section API row is visible in dev builds only | P1 | 1. Run the app via `npx expo start` (dev build, `__DEV__=true`). 2. Login as Admin. 3. Navigate to Settings. 4. Observe About card. | Row labelled "API" is visible showing `https://srv1409601.hstgr.cloud/binny/api/v1` (or the active `EXPO_PUBLIC_API_URL`). In a production/preview build (`__DEV__=false`), this row is NOT rendered. | Manual | `settings.tsx:48` — `{__DEV__ ? <Row label="API" value={API_BASE_URL} mono /> : null}` |
| TC-MOB-FOUND-E2E-010 | Admin | Settings Logout button is red and full-width | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Scroll to bottom if needed. | A full-width red button labelled "Logout" is visible at the bottom of the screen (variant="danger", with `log-out-outline` icon). | E2E | `settings.tsx:51-58` |
| TC-MOB-FOUND-E2E-011 | Admin | Settings Logout button shows confirmation Alert | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Tap "Logout" button. | `Alert.alert('Logout', 'Are you sure you want to logout?', ...)` fires with "Cancel" and "Logout" buttons — identical to Menu logout Alert. | E2E | `settings.tsx:16-23` |
| TC-MOB-FOUND-E2E-012 | Admin | Confirming logout from Settings returns to login screen | P0 | 1. Login as Admin. 2. Navigate to Settings. 3. Tap "Logout". 4. In Alert, tap "Logout". | `logout()` fires; SecureStore cleared; AuthGate redirects to `/(auth)/login`. Login screen shown. | E2E | Same flow as Menu logout |
| TC-MOB-FOUND-E2E-013 | Dispatch Operator | All 4 roles can access Settings (no role gate) | P0 | 1. Login as each of the 4 roles. 2. Navigate to Settings via Menu → Settings. | Settings screen renders for every role without any "access denied" or role-gate block. All rows (user card, About, Logout button) are visible. | Manual | No `<RoleGate>` in `settings.tsx` |

### Maestro flows for Section 21.12

```yaml
# mobile/.maestro/foundation/settings-screen.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Settings"
- waitForAnimationToEnd
- assertVisible: "Settings"
- assertVisible: "Binny Inventory"
- assertVisible: "Version"
- assertVisible: "Platform"
- assertVisible: "Logout"
```

```yaml
# mobile/.maestro/foundation/settings-logout-confirm.yaml
appId: com.basiq360.binnyinventory
env:
  EMAIL: "admin@binny.com"
  PASSWORD: "Admin@123"
---
- clearState
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: "Email"
- inputText: "${EMAIL}"
- tapOn:
    text: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Sign In"
- waitForAnimationToEnd
- tapOn: "Menu"
- waitForAnimationToEnd
- tapOn: "Settings"
- waitForAnimationToEnd
- tapOn: "Logout"
- waitForAnimationToEnd
- assertVisible: "Are you sure you want to logout?"
- tapOn: "Logout"
- waitForAnimationToEnd
- assertVisible: "Sign In"
```

---

## Section 21.13 — 401 / token-expired handling

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-094 | Admin | 401 response on any API call wipes SecureStore | P0 | 1. Login as Admin; verify token is in SecureStore. 2. On server, invalidate the token (e.g., force-expire or rotate the JWT secret, or simulate via a debug endpoint). 3. On mobile, trigger any API call (e.g., pull-to-refresh on Dashboard). | The axios 401 interceptor fires (`api.ts:44-51`); `SecureStore.deleteItemAsync('binny_auth_token')` and `SecureStore.deleteItemAsync('binny_user_data')` are called. SecureStore is now empty. | Integration | `api.ts:43-53` |
| TC-MOB-FOUND-095 | Admin | After SecureStore is wiped by 401, next navigation redirects to login | P0 | 1. Continuing from TC-MOB-FOUND-094: SecureStore has been wiped by the 401 interceptor. 2. Navigate away from the current screen (or background+relaunch the app). | On next AuthGate evaluation, `loadStoredAuth` finds no token; `isAuthenticated` becomes false; `router.replace('/(auth)/login')` is called. Login screen shown. | Integration | `api.ts` interceptor clears store but does not immediately redirect; redirect happens on next AuthGate cycle |
| TC-MOB-FOUND-096 | Admin | Concurrent device logout (token revoked server-side) triggers 401 flow | P1 | 1. Login as Admin on Device A. 2. Login as Admin on Device B (new token issued; old token on Device A may still be valid within the 15-min window). 3. Server-side revoke the Device A token. 4. On Device A, trigger a Dashboard refresh. | Device A receives 401; interceptor wipes SecureStore on Device A; user is redirected to login on next navigation event. | Manual | `[?]` JWT is stateless — server must explicitly maintain a revocation list or use short TTLs; behavior depends on backend implementation |
| TC-MOB-FOUND-097 | Any | 401 interceptor does not crash when SecureStore.deleteItemAsync throws | P1 | 1. Simulate a scenario where SecureStore is unavailable (device in background, first-boot keystore not ready). 2. Trigger a 401 response from the API. | The `catch` block in the 401 handler (`api.ts:47-49`) swallows the error. App does not crash. The `Promise.reject(error)` on line 52 is still called, propagating the original 401 error to the caller. | Manual | `api.ts:47-49` — bare `catch` block |

---

## Section 21.14 — Negative / edge cases

| TC ID | Role | Title | Priority | Steps | Expected Result | Type | Notes |
|-------|------|-------|----------|-------|-----------------|------|-------|
| TC-MOB-FOUND-098 | Any | EXPO_PUBLIC_API_URL env var overrides default API_BASE_URL at build time | P1 | 1. Build the app with `EXPO_PUBLIC_API_URL=https://custom.example.com/api/v1 eas build --profile preview`. 2. Launch built APK. 3. In a dev build, navigate to Settings → verify "API" row. | `API_BASE_URL` resolves to `https://custom.example.com/api/v1` (the env var). `process.env.EXPO_PUBLIC_API_URL ?? '...'` in `constants/index.ts:1` picks up the var at build time. All API calls use the override URL. | Manual | `constants/index.ts:1` |
| TC-MOB-FOUND-099 | Any | Default API_BASE_URL is HTTPS — no plaintext HTTP fallback in production | P0 | 1. Review `constants/index.ts:1`. 2. Confirm fallback value. | Fallback value is `https://srv1409601.hstgr.cloud/binny/api/v1` — HTTPS. No `http://` URL appears in the production fallback. On Android, the network security config must not allow plaintext traffic to the production host. | Manual | `constants/index.ts:1` — hardcoded HTTPS fallback |
| TC-MOB-FOUND-100 | Any | Axios timeout is 30 000 ms — slow network on login shows error after 30 s | P0 | 1. Set up a network throttle (e.g., Android emulator network condition → offline after login starts). 2. Enter credentials and tap "Sign In". 3. Wait at least 30 s. | After ~30 s, `axios` fires a timeout error (no `err.response`); `err?.response?.data?.message` is undefined; fallback string "Login failed. Please check your credentials." is shown in the error box. | Manual | `api.ts:7` — `timeout: 30000` |

---

## Maestro flows index

All YAML files embedded in this phase, in logical execution order:

1. `mobile/.maestro/foundation/login-render.yaml` — Section 21.1
2. `mobile/.maestro/foundation/login-empty-fields.yaml` — Section 21.2
3. `mobile/.maestro/foundation/login-wrong-credentials.yaml` — Section 21.2
4. `mobile/.maestro/foundation/login-admin-success.yaml` — Section 21.3
5. `mobile/.maestro/foundation/login-supervisor-success.yaml` — Section 21.3
6. `mobile/.maestro/foundation/login-warehouse-success.yaml` — Section 21.3
7. `mobile/.maestro/foundation/login-dispatch-success.yaml` — Section 21.3
8. `mobile/.maestro/foundation/session-restore.yaml` — Section 21.4
9. `mobile/.maestro/foundation/authgate-unauth-redirect.yaml` — Section 21.5
10. `mobile/.maestro/foundation/authgate-auth-skip-login.yaml` — Section 21.5
11. `mobile/.maestro/foundation/tab-navigation.yaml` — Section 21.6
12. `mobile/.maestro/foundation/menu-base-tiles.yaml` — Section 21.8
13. `mobile/.maestro/foundation/menu-tile-navigation.yaml` — Section 21.8
14. `mobile/.maestro/foundation/menu-admin-supervisor-tiles-visible.yaml` — Section 21.9
15. `mobile/.maestro/foundation/menu-warehouse-restricted-tiles.yaml` — Section 21.9
16. `mobile/.maestro/foundation/menu-admin-only-tile.yaml` — Section 21.10
17. `mobile/.maestro/foundation/menu-supervisor-no-users-tile.yaml` — Section 21.10
18. `mobile/.maestro/foundation/menu-logout-cancel.yaml` — Section 21.11
19. `mobile/.maestro/foundation/menu-logout-confirm.yaml` — Section 21.11
20. `mobile/.maestro/foundation/settings-screen.yaml` — Section 21.12
21. `mobile/.maestro/foundation/settings-logout-confirm.yaml` — Section 21.12

---

## Open questions / `[?]` flags

| # | TC | Question |
|---|---|---|
| 1 | TC-MOB-FOUND-036 | After deep-link to a protected route while logged out, does the app return to the deep-link target after successful login? The current `AuthGate` implementation (`_layout.tsx:33-37`) calls `router.replace('/(auth)/login')` without storing the intended destination. Return-to-target after login is likely NOT implemented. Needs confirmation with the dev team. |
| 2 | TC-MOB-FOUND-096 | Concurrent device logout / token revocation behavior depends on whether the backend maintains a JWT revocation list or relies solely on token expiry TTL. If tokens are stateless with no revocation list, a token remains valid until expiry even after a second login session begins. Confirm backend behavior. |

---

*Authored 2026-05-02 by Sonnet under Opus dispatch (Session 1 of 13 in mobile coverage workstream).*
