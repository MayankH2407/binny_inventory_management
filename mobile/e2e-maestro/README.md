# Binny Inventory — Maestro E2E Tests

Mobile end-to-end tests for `com.basiq360.binnyinventory` using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

- Android emulator `emulator-5554` running (Pixel6_API34, Android 14)
- APK installed: `com.basiq360.binnyinventory` v1.0.0
- Maestro CLI on PATH (`~/.maestro/bin`)
- Production backend live: `https://srv1409601.hstgr.cloud/binny/api/v1`

Export env vars if not on PATH:

```bash
export JAVA_HOME="/c/jdk17/jdk-17.0.18+8"
export ANDROID_HOME="/c/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/34.0.0:$HOME/.maestro/bin:$PATH"
```

## Test Credentials

| Role | Email | Password | Status |
|------|-------|----------|--------|
| Admin | admin@binny.com | Admin@123 | Active on prod |
| Supervisor | supervisor@binny.com | Pass@123 | NOT on prod (account missing) |
| Warehouse Operator | wh@binny.com | Pass@123 | NOT on prod (account missing) |
| Dispatch Operator | dispatch@binny.com | Pass@123 | NOT on prod (account missing) |

> Note: The spec lists `Pass@123` for all accounts but prod was re-seeded. Admin password is `Admin@123`.
> TCs 007-009 (Supervisor, WH Operator, Dispatch Operator) cannot run until those accounts are created on prod.

## Directory Structure

```
mobile/e2e-maestro/
  config.yaml              # Shared appId + default flow steps
  README.md                # This file
  01-login/
    TC-MOB-LOGIN-001.yaml  # App launches → login screen shown
    TC-MOB-LOGIN-002.yaml  # Login form has email + password fields
    TC-MOB-LOGIN-003.yaml  # Sign In button visible
    TC-MOB-LOGIN-004.yaml  # Submit empty fields → error
    TC-MOB-LOGIN-005.yaml  # Wrong credentials → error
    TC-MOB-LOGIN-006.yaml  # Admin login → Dashboard
    TC-MOB-LOGIN-007.yaml  # Supervisor login → Dashboard (SKIPPED — account missing)
    TC-MOB-LOGIN-008.yaml  # WH Operator login → Dashboard (SKIPPED — account missing)
    TC-MOB-LOGIN-009.yaml  # Dispatch Operator login → Dashboard (SKIPPED — account missing)
    TC-MOB-LOGIN-010.yaml  # Kill + reopen → auto-login
```

## Non-UI Assertion Substitutions

Some TC specs assert internal state (Expo SecureStore, `useAuthStore`, JWT) that is not directly observable via Maestro. These are replaced with the closest observable UI proof:

- **TC-006 "JWT stored in SecureStore"** → Tab bar visible after successful login
- **TC-007/008/009 "`user.role` set correctly"** → Tab bar and Dashboard visible
- **TC-010 "JWT persisted across app kills"** → App re-opens directly to tab bar (no login screen)

## Run All Phase 1 (Login) Tests

```bash
cd "D:/Projects/Mahavir Polymers - Inverntory Management"
for f in mobile/e2e-maestro/01-login/TC-MOB-LOGIN-*.yaml; do
  name=$(basename "$f" .yaml)
  echo "=== $name ==="
  maestro test "$f" 2>&1 | tee "/tmp/maestro-$name.log" | tail -30
done
```

## Run a Single Test

```bash
maestro test mobile/e2e-maestro/01-login/TC-MOB-LOGIN-006.yaml
```
