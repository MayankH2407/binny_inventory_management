# LIVE Deploy Checklist — Phase 6 combined bundle

**Target:** live production box `srv1689976.hstgr.cloud` (`187.127.130.99`), stack at `/opt/binny`.
**URLs:** canonical `https://binnyfootwear.basiq360.com/` + fallback `https://srv1689976.hstgr.cloud/binny/`.
**Scope of this deploy:** the entire combined bundle currently on TEST-only (May 29 → Jun 10) — Inventory drill-down, Role Manager, Legacy inventory CSV + unpack/repack, Phase 6a/6b, sample foot-split, Repack removal + pack-by-barcode, Unpack&Repack 2-tab redesign, label fixes.

> Created 2026-06-11. Reflects the bundle merged to `main` at commit `1d22a39`.

---

## 0. GATE — do not start until this is true

- [ ] **Client has signed off UAT** on the test portal (`srv1409601.hstgr.cloud/binny/`). Live deploy is blocked until then per the deployment workflow rule.
- [ ] `main` is pushed to origin and is the source of truth for this deploy.

---

## 1. Pre-deploy safety

- [ ] **Backup the live DB** before any migration:
      ```bash
      ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 \
        "docker exec binny-db pg_dump -U binny_admin binny_inventory > /opt/binny/backup-pre-phase6-$(date +%F).sql"
      ```
- [ ] Confirm disk headroom for two frontend rebuilds (`df -h`); optional `docker builder prune -af` if the box is tight/loaded.
- [ ] **Never overwrite `/opt/binny/.env`** during sync — it holds prod secrets. Exclude it from the tar.

---

## 2. Set the cap env vars (LIVE only)

> **Infra plumbing fix (2026-06-11):** "just set `.env`" was insufficient — the prod containers never received these vars. `docker-compose.prod.yml` now passes `CHILD_BOX_MAX_PER_GENERATION` / `PRODUCT_CSV_MAX_ROWS` into the backend `environment:` block and `NEXT_PUBLIC_CHILD_BOX_MAX` / `NEXT_PUBLIC_PRODUCT_CSV_MAX` into the `build.args` of **both** frontend services; `frontend/Dockerfile` now declares the two `NEXT_PUBLIC_*` ARG/ENV so Next.js bakes them at build time. All default to `500` if unset. **These two files must be synced to the box (§4) before the build (§5).**

Edit `/opt/binny/.env` and add all four (do NOT overwrite existing lines):

- [ ] `CHILD_BOX_MAX_PER_GENERATION=1500`  (backend runtime)
- [ ] `PRODUCT_CSV_MAX_ROWS=2000`  (backend runtime)
- [ ] `NEXT_PUBLIC_CHILD_BOX_MAX=1500`  (frontend build-arg → baked into BOTH frontends)
- [ ] `NEXT_PUBLIC_PRODUCT_CSV_MAX=2000`  (frontend build-arg → baked into BOTH frontends)

> ⚠️ `NEXT_PUBLIC_*` are baked at **build time** into both `binny-frontend` (hstgr URL) and `binny-frontend-root` (binnyfootwear URL). They must be present in `.env` **before** the build in §5, or the UI silently keeps the 500 cap even though the backend allows more.

---

## 4. Sync code from local → live

From the local repo (on `main`):

- [ ] Stream changed source + the updated infra files (must include `docker-compose.prod.yml` and `frontend/Dockerfile` — the §2 cap wiring lives there), excluding build artefacts and `.env`:
      ```bash
      tar --exclude='node_modules' --exclude='.next' --exclude='.env' \
        -cf - backend/src backend/migrations frontend/src frontend/Dockerfile \
              docker-compose.prod.yml progress.md \
        | ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 "cd /opt/binny && tar xf -"
      ```

---

## 5. Rebuild + restart

- [ ] Rebuild backend + **both** frontends:
      ```bash
      ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 \
        "cd /opt/binny && docker compose -f docker-compose.prod.yml --env-file .env \
         build binny-backend binny-frontend binny-frontend-root"
      ```
- [ ] Recreate:
      ```bash
      ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 \
        "cd /opt/binny && docker compose -f docker-compose.prod.yml --env-file .env \
         up -d binny-backend binny-frontend binny-frontend-root"
      ```
- [ ] **Stale-image check:** confirm the running container image IDs match `:latest` after recreate (Next.js can serve a stale image if not recreated). `docker compose ps` + compare image IDs.

---

## 6. Run migrations

> There is **no `migrate:status` script** (only `migrate:up`/`migrate:down`). node-pg-migrate tracks applied migrations in the `pgmigrations` table, and `migrate:up` is idempotent (runs only pending). Confirmed against prod 2026-06-11: last applied is `20260527120001`, so **6 migrations are pending** (`20260527120001` is already applied — NOT in the pending set).

- [ ] Inspect applied set: `docker exec binny-db psql -U binny_admin -d binny_inventory -t -c "SELECT name FROM pgmigrations ORDER BY id;"`
- [ ] `docker exec binny-backend npm run migrate:up`
- [ ] Expected **6 pending** migrations to be applied:
  - `20260529100001_create-role-permissions-table`
  - `20260531100001_add-legacy-carton-fields`
  - `20260602100001_add-legacy-carton-opened-transaction-type`
  - `20260605100001_add-foot-to-sample-box-mapping`
  - `20260609120001_sample-box-mapping-per-foot`
  - `20260610120001_add-unpacked-tracking-to-master-cartons`
- [ ] Re-run the `pgmigrations` SELECT to confirm all 6 now present.
- [ ] If `role_permissions` is newly created, confirm roles auto-backfilled (on test this was 8 rows / 4 roles).
- [ ] DB extension sanity: if `binny-db` was ever recreated, ensure `uuid-ossp` + `pg_trgm` exist (prod compose does not mount `init.sql`).

---

## 7. Verify (live)

- [ ] Health: `curl -sS https://binnyfootwear.basiq360.com/api/v1/health` → 200
- [ ] Health (fallback): `curl -sS https://srv1689976.hstgr.cloud/binny/api/v1/health` → 200
- [ ] `/unpack-repack` serves 200; old `/repack` gone; `POST /master-cartons/repack/free-both` → 404 (removed).
- [ ] `pack-by-barcode` endpoint alive (400 without body is fine).
- [ ] Roles UI loads at `/admin/roles`; inventory drill-down loads.
- [ ] **Cap spot-check:** on the live UI, child-box generate input `max` shows 1500 and product CSV modal text shows 2000 (proves the NEXT_PUBLIC args baked into BOTH frontends).
- [ ] Backend dist contains `unpacked_at` stamping; `repackFreeBoth` absent.

---

## 8. Communicate to client (behavior changes / UAT flags)

- [ ] Supervisor + WH-Operator can no longer create/manage Samples or E-commerce **by default** (now Admin-only) — grant via Role Manager if desired.
- [ ] The old Repack page is gone; replaced by the new **Unpack & Repack** 2-tab module.

---

## 9. Do-NOT-touch rules on the prod box

- Never overwrite `/opt/binny/.env`.
- Never restart `surveydesk-surveydesk-frontend-1` (it's also Binny's nginx edge).
- Never `docker network disconnect edge-network surveydesk-surveydesk-frontend-1` (502s all binny traffic).

---

## Post-deploy

- [ ] Update `progress.md` with the live-deploy entry (date, commit, migrations applied, env vars set, verification results).
- [ ] Tag/note the deployed commit.

---

## Out of scope for this deploy (tracked separately)

- DNS cutover to `binny.basiq360.com` (brand URL) — A record + cert + nginx + env.
- Live mobile APK rebuild against `https://binnyfootwear.basiq360.com/api/v1`.
- JWT secret rotation on live (secrets were once echoed to a transcript).
- LE cert renewal automation (certs expire 2026-08-21 / 2026-08-23).
- Dropping the hstgr fallback frontend after binnyfootwear stabilises.
