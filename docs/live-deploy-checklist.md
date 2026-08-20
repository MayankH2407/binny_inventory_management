# LIVE Deploy Checklist — Phase 6 combined bundle

**Target:** live production box `srv1689976.hstgr.cloud` (`187.127.130.99`), stack at `/opt/binny`.
**URLs:** canonical `https://binnyfootwear.basiq360.com/` + fallback `https://srv1689976.hstgr.cloud/binny/`.
**Scope of this deploy:** the entire combined bundle currently on TEST-only (May 29 → Jun 10) — Inventory drill-down, Role Manager, Legacy inventory CSV + unpack/repack, Phase 6a/6b, sample foot-split, Repack removal + pack-by-barcode, Unpack&Repack 2-tab redesign, label fixes.

> Created 2026-06-11. Reflects the bundle merged to `main` at commit `1d22a39`.
> **Content-frozen at that scope — do not treat §6's migration list as current.** Follow the *structure*
> (gate → backup → env → sync → build → migrate → verify → comms → post-deploy), not the specific
> filenames, and always re-derive the pending migration set fresh from `pgmigrations` (§6). See the
> **"Hard-won facts, updated 2026-08-20"** section near the bottom for corrections learned on the
> 2026-08-20 deploy (Returns + Samples + E-commerce pool redesign + size fix) — those apply to every
> future LIVE deploy, not just that one.
>
> **SSH:** the `-i ~/.ssh/id_ed25519` paths below are stale on the current (post-transfer) machine —
> that bare key file doesn't exist here. Use the SSH config aliases instead: `surveydesk-hostinger`
> for LIVE, `alstone-vps` for TEST (e.g. `ssh surveydesk-hostinger "docker exec ..."` instead of
> `ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 "docker exec ..."`). Never hand-type a `-i` path.

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

> ⚠️ **`tar xf` only adds/overwrites — it NEVER deletes** (learned the hard way 2026-06-11: a bundle-deleted `repack/page.tsx` lingered on the box and failed `next build`). When the box trails a bundle that removed/renamed files, **clean-slate the `src` dirs first** so deletions propagate. This is safe — running containers serve from baked images, not on-disk `src`. Also sync `package.json`/`package-lock.json` for both ends.

- [ ] Stream changed source + the updated infra files, clearing `src` first so deletions propagate:
      ```bash
      tar --exclude='node_modules' --exclude='.next' --exclude='.env' \
        -cf - backend/src backend/migrations backend/package.json backend/package-lock.json \
              frontend/src frontend/package.json frontend/package-lock.json frontend/Dockerfile \
              docker-compose.prod.yml progress.md \
        | ssh -i ~/.ssh/id_ed25519 root@187.127.130.99 \
            "cd /opt/binny && rm -rf backend/src frontend/src && tar xf -"
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
- [ ] `/unpack-repack` serves 200.
- [ ] **Removed `repackFreeBoth`:** confirm via backend dist, NOT HTTP — without a token, a removed route returns **401 (auth guard runs before routing), not 404**. Use `docker exec binny-backend sh -c "grep -rl repackFreeBoth dist | wc -l"` → expect `0`.
- [ ] `pack-by-barcode` endpoint alive: `POST` without token → **401** (not 404).
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
- ⚠️ **As of 2026-08-20, the shared HTTP ingress on this box is a container named `binny-nginx`** — hand-started (`docker run`, not compose-managed, zero compose labels), mounting `/opt/binny/nginx.binny.conf`, serving ~15 other unrelated clients on this box in addition to Binny. It does **not** show up in `docker compose -f docker-compose.prod.yml ps` — that's expected and confirms it's outside compose's reach, not a sign something's missing. Never restart it, never touch its mounted conf file casually, never `docker network disconnect edge-network binny-nginx`. (The earlier `surveydesk-surveydesk-frontend-1` reference below is from an older box topology and may no longer be the correct container name — verify the actual ingress with `docker ps` before assuming either name is still right.)
- Never restart `surveydesk-surveydesk-frontend-1` if it still exists on this box (historical note — was Binny's nginx edge at one point).
- Never `docker network disconnect edge-network <the real ingress container>` (502s all binny traffic, and everyone else's).
- Always `-f docker-compose.prod.yml` + explicit service names + `--no-deps` on any `up`/`build` — a bare `docker compose` command can pick up an unrelated compose file or accidentally evaluate `binny-db`.

---

## Post-deploy

- [ ] Update `progress.md` with the live-deploy entry (date, commit, migrations applied, env vars set, verification results).
- [ ] Tag/note the deployed commit.

---

## Hard-won facts, updated 2026-08-20

Learned during the Returns + Samples + E-commerce-pool-redesign + size-fix LIVE deploy. Apply to
every future LIVE (and TEST) deploy, not just that one:

1. **Build before migrate, always.** `backend/migrations` is baked into the Docker image at build
   time, not live-mounted. Running `migrate:up` before the rebuild silently prints "No migrations
   to run!" against the *old* image — no error, just wrong. Correct order: sync → **build** →
   recreate (`up -d`) → **then** migrate.
2. **`node-pg-migrate` 7.x defaults `checkOrder: true`.** If the target's `pgmigrations` ledger has
   ever applied a later-dated migration while an earlier-dated one was skipped (can happen when a
   box lags behind and catches up out of sequence), a plain `migrate:up` throws *"Not run migration
   X is preceding already run migration Y"* before touching any table. Harmless if the two files
   are genuinely independent, but pass `--no-check-order` to avoid a wasted, confusing failed
   attempt. Always run `--dry-run` first (genuinely non-mutating — skips every `db.query` including
   the ledger insert) to confirm the pending set and order before running for real.
3. **Prefer `git archive HEAD <paths>` over a working-tree `tar`** for the sync step. It emits only
   tracked, committed content at LF, which excludes CRLF noise and any held/uncommitted work (e.g.
   `mobile/`, QA screenshots) *by construction* — no exclude-list to get wrong. If something needs
   to be in the deploy but isn't on `main` (e.g. the child-box label A/B variant a given box is
   running), build a **throwaway local integration branch** with that one file checked out from its
   source commit and committed there, then archive from that branch — never merge it into `main`.
4. **Build all target images fully before recreating any container.** Never interleave
   build-then-recreate per service. If a later build stalls or fails after an earlier one already
   recreated, you get a split-brain: some containers on new code/schema, others on old — and if the
   backend is shared between two frontends (as here), a `/health` check on the backend stays green
   even while one frontend is stale, masking the problem. Confirm all builds succeeded, *then*
   recreate all target services together.
5. **`git diff --name-only` does not honour `-w`/`-b`.** It lists every file whose blob differs,
   including pure line-ending churn. For real-change detection use
   `git diff -w --numstat | awk '$1!=0||$2!=0{print $3}'`. A `-w`/`-b` diff can also look correct
   but fail to `git apply` if the file is CRLF in the working tree and LF at `HEAD` (or vice versa)
   — normalize line endings on the specific files you need to patch before generating a patch from
   them, not repo-wide.
6. **A `pg_dump` isn't a backup until it's been restore-tested.** `pg_restore -l` only proves the
   archive lists its table of contents; it doesn't prove the data restores cleanly. Restore into a
   scratch database on the box and spot-check a couple of row counts against the source before
   trusting the dump as your rollback path — especially since `migrate:down` is often *not* a clean
   inverse (enum-value additions can never be dropped; some `down`s deliberately leave a column
   nullable rather than fully reversing).

---

## Out of scope for this deploy (tracked separately)

- DNS cutover to `binny.basiq360.com` (brand URL) — A record + cert + nginx + env.
- Live mobile APK rebuild against `https://binnyfootwear.basiq360.com/api/v1`.
- JWT secret rotation on live (secrets were once echoed to a transcript).
- LE cert renewal automation (certs expire 2026-08-21 / 2026-08-23).
- Dropping the hstgr fallback frontend after binnyfootwear stabilises.
