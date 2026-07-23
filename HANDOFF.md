# 🖥️ DEVICE HANDOFF — Binny Inventory (Basiq360)

**Written:** 2026-07-23 · **Purpose:** resume this project on a new machine without losing context, memory, or in-flight work.

> **Read order on the new machine:** this file → `progress.md` (the canonical dated log / single source of truth) → `ONBOARDING.md` (how to run & deploy). The `[[…]]`-style references inside `progress.md` are *aspirational* — no separate memory files exist; everything lives in `progress.md` + this file.

---

## 0. ⚠️ FIRST — did everything actually come across?

A plain `git clone` is **NOT enough**. It will miss files that are **gitignored but required**:

- **`backend/.env`, `frontend/.env`, `mobile/.env`** (and any `.env.*`) — local secrets / DB creds / API URLs. Without these, local dev won't boot.
- **`scratchpad/*.md` specs** — `mobile-returns-spec.md`, `mobile-carton-membership-spec.md`, `returns-backend-spec.md`, `returns-frontend-spec.md`. (These live in the session scratchpad, not the repo.)
- **`backups/`** — local DB backup copies.
- **Client data & assets** — the top-level `.csv` / `.xlsx` / `.jpeg` / `.pdf` files, `app17_04.apk`, logos.

**➡️ Primary transfer method: copy the ENTIRE project folder** (working tree included) to the new machine. Git push (below) is the **backup/safety net**, not a full substitute.

**Verify after transfer** — from the project root:
```bash
git status            # should match §2 exactly (1 commit ahead, same modified/untracked set)
ls backend/.env frontend/.env mobile/.env   # env files present?
git log --oneline -1  # should show 45c03ab (returns) unless already pushed/advanced
```

---

## 1. What this project is (30-second version)

QR-driven warehouse inventory for **Binny Footwear (Mahavir Polymers Pvt. Ltd.)**, Jaipur — built by **Basiq360** (vendor). Two-level QR hierarchy (Child Box → Master Carton), lifecycle `PACK → STORE → UNPACK → REPACK → DISPATCH`, plus Sample (SR) / E-commerce (EC) / Returns record types.

**Stack:** Node+Express+TS+knex backend · PostgreSQL 16 · Next.js 14.2 (App Router) frontend PWA · Expo/React-Native mobile · Docker Compose (`docker-compose.yml` dev, `docker-compose.prod.yml` prod).

**Phase:** 1–5 shipped/live; **Phase 6 (post-QA modifications)** in progress.

---

## 2. Exact git & working-tree state at handoff

- **Branch:** `main` — at commit **`45c03ab`** (`feat(returns): Returns management module + dispatch return-status`).
- **`45c03ab` is NOT pushed** to `origin/main` (ahead by 1). *(The transfer step in §6 pushes it.)*
- **Remote:** `https://github.com/MayankH2407/binny_inventory_management.git`
- **Uncommitted work in the tree** — DO NOT blindly commit; see the "held files" warning:

  **🔒 4 HELD web files — must stay UNCOMMITTED** (deploys use `git archive HEAD` specifically to keep these un-UAT'd files *out* of TEST/LIVE):
  - `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx`
  - `frontend/src/app/(dashboard)/child-boxes/page.tsx`
  - `frontend/src/app/(dashboard)/dispatch/page.tsx`
  - `frontend/src/app/(dashboard)/reports/page.tsx`

  **📱 Mobile M7 (commit-when-verified):** modified `mobile/app/(tabs)/menu.tsx`, `mobile/app/dispatch/[id].tsx`, `mobile/app/dispatch/index.tsx`, `mobile/app/ecommerce/[id].tsx`, `mobile/app/ecommerce/create.tsx`, `mobile/app/samples/[id].tsx`, `mobile/app/samples/create.tsx`, `mobile/constants/index.ts`, `mobile/services/{dispatch,ecommerce,samples}.service.ts`, `mobile/types/index.ts`, `mobile/package.json`, `mobile/package-lock.json` — plus **new** `mobile/services/returns.service.ts`, `mobile/app/returns/`, `mobile/utils/exportCsv.ts`, `mobile/__tests__/services/{returns,carton-membership}.service.test.ts`.

  **Docs:** new `docs/qr-label-layouting-guide.md`; modified `progress.md`.

---

## 3. Where each workstream stands (2026-07-23)

### 📱 Mobile M7 — Expo app parity catch-up  ← **the active task**
Built by 2 Sonnet agents on an Opus plan. Adds to mobile: **Returns** (blind-scan create + against-dispatch return action + return-status pills/filters), **dispatch CSV export/share** (`expo-file-system/legacy` + `expo-sharing`, both newly installed), **carton membership** (scan master carton into samples/ecommerce).
- ✅ Combined `mobile tsc --noEmit` clean; new-service jest passes (**returns 7/7, carton 6/6**).
- ❌ **NOT** independently Opus-verified, **NOT** committed, **NOT** built to APK.
- **To finish:** independent full-jest run + Expo Router route-resolution sanity + actually drive the app → then commit Mobile M7 → optional APK (EAS `preview` profile → TEST API; auth via `EXPO_TOKEN`).
- ⚠️ **3 PRE-EXISTING jest suite failures are unrelated** and expected: `hooks/useApi.test.ts`, `components/ui.test.tsx`, `services/api.test.ts`.
- ⚠️ **Known bug noticed, NOT fixed (fix separately):** mobile dispatch date-filter is a no-op — `mobile/app/dispatch/index.tsx` + `dispatch.service.ts` send `start_date`/`end_date` but the backend reads `from_date`/`to_date`. (The new `exportCsv` already uses the correct `from_date`/`to_date`.)

### 🔄 Returns (WEB) — deployed to TEST, awaiting UAT
Module + rework + dispatch return-status. Committed as `45c03ab` (scope-isolated), deployed to TEST (`srv1409601`), migration `20260721100001` applied, verified read-only. **AWAITING CLIENT UAT. NOT on LIVE.** On sign-off → LIVE (backup + BOTH frontends `--env-file .env`).

### 🔐 TEST TLS cert — fixed 2026-07-23
Shared `edge-nginx` was serving an expired cert; fixed via `docker exec edge-nginx nginx -s reload` (valid now to Sep 20). **Recurrence risk ~Sep 20** — no deploy-hook reloads edge-nginx on renewal (shared infra; awaiting OK to add one).

---

## 4. Environments, servers, credentials

| | TEST (client operates here) | LIVE |
|---|---|---|
| URL | `srv1409601.hstgr.cloud/binny` | `binnyfootwear.basiq360.com` |
| Server | `srv1409601` | `srv1689976` (aka `187.127.130.99`) |
| Path | `/opt/binny` | `/opt/binny` |
| Containers | `binny-backend`, `binny-frontend`, `binny-db` | `binny-backend`, **BOTH** `binny-frontend` **&** `binny-frontend-root`, `binny-db` |
| Data | ~5.5k products / ~114k child boxes | 720 products, ~56k child boxes, customers=0 |
| Admin login | `admin@binny.com` / `Admin@123` (default, autoSeed-maintained) | **ROTATED by client** — verify via `docker exec` greps + DB + health only |
| Env-gated caps | defaults (500/500) | `CHILD_BOX_MAX_PER_GENERATION=1500`, `PRODUCT_CSV_MAX_ROWS=2000` (+ `NEXT_PUBLIC_` equivalents baked at FE build) |

---

## 5. Deploy recipes (concise — full detail in `progress.md`)

**Local dev:** `docker compose up` (uses `docker-compose.yml` + `docker-compose.override.yml`). Needs `.env` files present.

**TEST deploy** (single frontend, safe iteration target):
1. `git archive HEAD` of `backend/src` + `backend/migrations` + `frontend/src` + `progress.md` → over SSH → `rm -rf backend/src frontend/src && tar xf -` (clean-slate; tar doesn't delete removed files).
2. `docker compose -f docker-compose.prod.yml build binny-backend binny-frontend` (**run detached** — `next build` can take ~40 min on the loaded host).
3. `up -d`, then `docker compose -f docker-compose.prod.yml exec -T binny-backend npm run migrate:up`.
4. Verify: running image IDs `== :latest`, health 200, feature-specific greps in the served bundle/dist.

**LIVE deploy** (UAT-gated):
1. **Backup first:** `pg_dump | gzip` → `/opt/binny/backup-pre-<change>-<date>.sql.gz` (also pull a copy locally).
2. `git archive HEAD` clean-slate src (**`.env` untouched**) — `git archive HEAD` is deliberate: keeps the 4 held working-tree files OUT of LIVE.
3. Rebuild `binny-backend` **+ BOTH** `binny-frontend` **&** `binny-frontend-root` with **`--env-file .env`** (detached), `up -d`, `migrate:up`.
4. Verify: images `== :latest`, health 200 on **both** URLs, **caps preserved** (backend `printenv` 1500/2000 + baked into both frontends), feature greps. Client does UI spot-check (LIVE creds rotated → no authed calls from our side). Note PWA staleness (client close/reopen app).

**Mobile APK:** EAS build, `preview` profile → TEST API; auth via `EXPO_TOKEN` env var (see `progress.md` EAS notes).

---

## 6. How the transfer was set up (git safety net)

To guarantee nothing is lost even without the folder copy:
- **`main` pushed to origin** — carries `45c03ab` (Returns) + this `HANDOFF.md`.
- **Full snapshot branch `transfer/device-20260723` pushed** — a single commit containing the *entire* working tree (all held files + Mobile M7 + docs). **Marked DO NOT MERGE.** It exists only to move the uncommitted work between machines.

**Restore the exact in-flight state on the new machine** (only needed if you clone instead of copying the folder):
```bash
git clone https://github.com/MayankH2407/binny_inventory_management.git
cd binny_inventory_management
git checkout main
# bring the uncommitted work back into the working tree without committing it to main:
git checkout transfer/device-20260723 -- .
git reset                       # unstage → files now show as modified/untracked, matching §2
git status                      # sanity-check against §2
# once confirmed, retire the snapshot branch:
git branch -D transfer/device-20260723
git push origin --delete transfer/device-20260723
```
> Still add the gitignored `.env` files, scratchpad specs, and client data manually (§0) — the snapshot branch does not include gitignored files.

---

## 7. Next-session TODO (priority order)

1. **Verify the transfer** (§0): `git status` matches §2, `.env` files present, `docker compose up` boots locally.
2. **Finish Mobile M7:** independent full-jest + Expo Router route sanity + drive the app → commit → optional APK.
3. **Fix the mobile dispatch date-filter bug** (§3) — small, separate.
4. **Returns (web):** chase client UAT on TEST → on sign-off deploy LIVE (§5).
5. **Watch TEST cert ~Sep 20** (§3) — reload edge-nginx or add a deploy-hook if client OKs.
6. Retire the `transfer/device-20260723` branch once the new machine is confirmed good.

---

*If you're Claude reading this on the new machine: after confirming §0, offer to (a) drive the Mobile M7 verification, and (b) seed fresh memory files under this project's memory dir from `progress.md` + this doc.*
