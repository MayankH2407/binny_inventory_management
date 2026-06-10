# Binny Inventory — Onboarding

Welcome. This doc gets you from "I just cloned the repo" to "I can ship a change to the testing portal" without having to re-discover the things this codebase doesn't make obvious from the file tree alone.

If you open this in Claude Code, ask Claude things like "show me the dispatch flow end-to-end" or "what does the qr-cell layout look like" — it can read the actual code and answer better than a frozen doc.

---

## 1. What this is

A QR-driven warehouse inventory system for **Binny Footwear (Mahavir Polymers Pvt. Ltd.)**, a footwear manufacturer in Jaipur. Built by **Basiq360** (us, the vendor). ~20–30 warehouse operators use it daily across four roles (Admin / Manager / Warehouse Op / Dispatch Op).

The model is a **two-level QR hierarchy**:

- **Child Box** — inner carton holding 1 pair (or N pairs); permanent QR sticker; barcode lives forever on that box.
- **Master Carton** — outer carton that holds many child boxes; dynamic QR (printed at pack time, retired on dispatch).

Lifecycle a box moves through: `PACK → STORE → UNPACK → REPACK → DISPATCH`. There are also Sample (SR) and E-commerce (EC) record types that share the dispatch surface.

There's also a **mobile app** (Expo / React Native) that the warehouse uses on Android — same backend, separate UI.

---

## 2. Status as of handover (2026-05-19)

Read `progress.md` at the root for the canonical, dated log — it's the single source of truth for "what was done when." This section is the executive summary.

**Shipped & live on testing portal:**
- Phase 1 — core inventory, 6-week build (auth, products, child boxes, master cartons, dispatch, dashboard, reports)
- Phase 1.5 — perf / optimisation pass
- Phase 2 — UI enhancement (theme, navigation polish)
- Phase 3 — PWA (offline-capable, installable)
- Phase 4 — post-meeting client feedback batch (multiple sub-modules)

**Active workstreams:**
- **Phase 5 — Mobile (Expo APK):** in progress. APK builds wired up via EAS (see §10). Mobile covers scan/trace, inventory, dispatch, masters; some role-gate inconsistencies and a missing `mobile/app/users/` screen are tracked as `[?]` flags in `docs/test-cases-v3/AUTHORING_PROGRESS.md`.
- **Phase 6 — Post-QA modifications:** in progress, ongoing client iterations. Recent focus is label templates (child box + master carton) — see the Print-Iteration Playbook in §13.

**Held in working tree (don't disturb on git):**
- **13-session mobile test-case authoring batch** (`docs/test-cases-v3/phase-21..32-*.md` + `AUTHORING_PROGRESS.md` + `README.md`). User wants ONE combined commit when all 13 sessions land. **9 of 13 done as of handover. Do NOT commit per-session.**
- Stray loose files: `backend/scripts/migrate-barcodes-to-short-format.js`, `docs/tsc-printer-setup-guide.html`, `scripts/progress-checkpoint.sh`. Leave as-is unless you know they need to go in.

**Production go-live decisions (confirmed 2026-05-18):**
- Production domain: **`binny.basiq360.com`** (subdomain of basiq360.com)
- Production host: **AWS** under Basiq360's existing account (leaving Hostinger)
- Ops ownership: Basiq360 (us). Client is non-technical.
- Mobile APK must be rebuilt against prod URL before cutover.

---

## 3. Tech stack at a glance

| Layer | Stack |
|---|---|
| Backend API | Node.js + Express + TypeScript, JWT auth, knex migrations |
| Database | PostgreSQL 16 (`postgres:16-alpine`) |
| Frontend portal | Next.js 14.2 (App Router) + TypeScript + Tailwind, PWA-enabled |
| Mobile app | Expo SDK (React Native + TypeScript), expo-router |
| Local dev | Docker Compose (`docker-compose.yml`) |
| Prod deploy | Docker Compose (`docker-compose.prod.yml`) + nginx reverse-proxy |
| Printer | TSC thermal label printer (TSPL); web-based print uses browser print dialog |
| Mobile builds | EAS Build (Expo cloud, free tier — queue delay 10–30min) |

Containers (local): `binny_backend` (3001), `binny_frontend` (3000), `binny_postgres` (5432). On the server they're named with hyphens: `binny-backend`, `binny-frontend`, `binny-db`.

---

## 4. Repo layout

```
backend/                # Express API
  src/
    app.ts              # express app setup
    index.ts            # server entry
    config/             # env/db config
    controllers/        # route handlers
    routes/             # express routers (one per resource)
    services/           # business logic
    middleware/         # auth, validation, error handling
    models/             # query helpers
    types/              # shared TS types
    utils/              # helpers (note: labelTemplates.ts is unwired, zero callers)
  migrations/           # knex migrations, date-prefixed YYYYMMDD*
  seeds/                # knex seeds (realistic dummy data)
  init.sql              # initial postgres bootstrap
  Dockerfile

frontend/               # Next.js portal
  src/
    app/                # App Router pages
      (dashboard)/      # auth-gated route group
        child-boxes/    # incl. generate/page.tsx — the live child-box label
        master-cartons/ # incl. [id]/page.tsx — the live master-carton label
        dispatch/       # dispatch flow
        ...
      login/
    components/         # shared UI
    hooks/              # useApi, useAuth, etc.
    services/           # client-side API service wrappers
    store/              # zustand stores
    constants/          # routes, app constants
  e2e/                  # Playwright tests
  Dockerfile

mobile/                 # Expo app
  app/                  # expo-router screens
    (tabs)/scan.tsx     # mobile scan + trace screen
    ...
  components/
  services/             # client-side API
  e2e-maestro/          # Maestro flow tests
  app.json              # expo config (owner: kanikabehl)
  eas.json              # build profiles

docs/                   # project docs
  project-brief.md
  implementation-plan.md
  sql-migration-plan.md
  security-audit-report.md
  phase-1.5-optimization-report.md
  test-cases-v2-phases-*.md     # legacy v2 test cases (web)
  test-cases-v3/                # v3 (mobile + cross-platform), in progress
    AUTHORING_PROGRESS.md       # canonical tracker for the 13-session batch
    README.md
    phase-01..29-*.md           # phases 21-29 are held, mobile-specific
  tsc-printer-setup-guide.html

nginx/                  # reverse-proxy config for prod
docker-compose.yml      # local dev (Windows-friendly, polling HMR)
docker-compose.prod.yml # production (server uses this)
progress.md             # dated activity log — canonical source of truth
ONBOARDING.md           # this file
```

**Top-level kickoff materials & client references** (don't delete):
- `Kick_off_Doc.pdf`, `Kickoff_Document_Binny_Basiq360.html`, `Binny Footwear Kick Off.txt` — scope of work
- `Final Scope of Work - Binny Footwear_Inventory Application.pdf` — formal SOW
- `Updated Label format.jpeg`, `Reference.jpeg`, `Child Box label information.jpeg`, `Master Box label information.jpeg`, `Rollsize.jpeg`, `child qr.png`, `child qr new.png` — label / QR reference photos from client
- `Product Master Details.jpeg`, `Customer master details.jpeg` — domain reference photos
- `UAT Observations.docx` — running client-side QA list
- `BinnyLogo.png`, `monogram.png`, `Basiq360 Logo.png` — brand assets
- `app17_04.apk`, `binny-inventory-*.apk` — historical APK builds shared with client
- `phase-e-0*.png` — screenshots from earlier phases

---

## 5. Local dev — getting it running

### Prerequisites
- Docker Desktop (Windows: WSL2 backend required)
- Node 20+ (for occasional outside-container scripts; not strictly needed)
- A `.env` at repo root — copy from `.env.example` if missing
- SSH key at `~/.ssh/id_ed25519` if you need to deploy (see §6)
- Optional: an Expo access token from `kanikabehl`'s account if you'll be building APKs (§10)

### Bring up the stack

```bash
docker compose up -d
```

Wait ~30s on first run for Postgres + Next dev server to warm up.

- Portal: <http://localhost:3000>
- API:    <http://localhost:3001/api/v1/health>
- DB:     `localhost:5432`, db `binny_inventory`, user `binny_admin`

The compose mounts `backend/src` and `frontend/src` as bind mounts, so edits propagate live. Login credentials are in `backend/seeds/` (one Admin and one of each operator role are seeded with predictable passwords — check `backend/seeds/*users*.{js,ts}` to confirm what's there before asking around).

### Windows HMR quirk (important)

Windows host → Linux container file-change events don't fire reliably for the Next.js webpack watcher. The frontend service in `docker-compose.yml` therefore sets:

```yaml
WATCHPACK_POLLING: "true"
CHOKIDAR_USEPOLLING: "true"
```

If you ever see "I saved the file but the page didn't refresh," check that those env vars are still there. Linux/macOS hosts don't strictly need them and can pull them down if it bothers you — small CPU overhead, not a correctness issue.

### Useful container commands

```bash
docker compose logs -f binny_frontend         # tail frontend
docker compose logs -f binny_backend          # tail backend
docker compose exec binny_postgres psql -U binny_admin binny_inventory
docker compose down                           # stop everything
```

### Running migrations / seeds

From outside the container:
```bash
cd backend
npm run migrate:latest     # apply pending migrations
npm run seed:run           # populate dummy data
```
Or hit them via the running container with `docker compose exec binny_backend …`. The migrations are date-prefixed and idempotent.

---

## 6. Deploying to the testing portal

Single target right now: **Hostinger VPS** serving <https://srv1409601.hstgr.cloud/binny/>. nginx reverse-proxies `/binny/` to the frontend container.

There is **no GitHub Actions / webhook / cron git-pull**. Every deploy is manual. A `git push` alone does nothing to the portal.

### Recipe

```bash
# 1. Stream changed source into /opt/binny
tar cf - backend/src frontend/src progress.md \
  | ssh -i ~/.ssh/id_ed25519 root@srv1409601.hstgr.cloud "cd /opt/binny && tar xf -"

# 2. Rebuild & restart on the server
ssh -i ~/.ssh/id_ed25519 root@srv1409601.hstgr.cloud \
  "cd /opt/binny && docker compose -f docker-compose.prod.yml build binny-backend binny-frontend \
   && docker compose -f docker-compose.prod.yml up -d binny-backend binny-frontend"

# 3. Verify
curl -sS https://srv1409601.hstgr.cloud/binny/api/v1/health
```

Full frontend rebuild: ~90s. Backend: ~30s. `binny-db` stays up across deploys.

### Things to know
- **SSH key:** `~/.ssh/id_ed25519` (your personal one). The `~/.ssh/binny-deploy` file in the project is dead — it was never added to the server's `authorized_keys`. Ignore it.
- **Server repo path:** `/opt/binny/` — plain directory, NOT a git clone. Don't `git pull` on the server.
- **DO NOT overwrite** `/opt/binny/.env` or `/opt/binny/.env.production` during a tar sync — they hold server-side secrets. The recipe above doesn't include them; keep it that way.
- **Rsync is not installed locally on Windows** — use tar-over-ssh, not rsync.
- The server is reachable at IP `76.13.245.90`, hostname `srv1409601.hstgr.cloud`, deploy user `root`.

### When the client says "I don't see my changes on the portal"

It's almost always one of:
1. You pushed to GitHub but didn't run the deploy recipe.
2. You ran the deploy but the client has a stale browser cache (hard-refresh, or DevTools → Disable cache).
3. Service worker (PWA) is serving an old asset. Mostly happens on first visit after a deploy; second refresh clears it.

---

## 7. How we work — conventions & rhythm

This section is opinionated and codifies how the project has actually been run. Follow it and you'll match the existing style; deviate if you have a reason, but please be deliberate.

### 7.1 `progress.md` is the canonical log

Every meaningful task gets a dated entry. Newest entries on top, under `## Phase N — …` headings. Read existing entries to match tone — concise, opinionated, focused on the *why* and the *gotchas* future-you will care about. Not a play-by-play of every keystroke.

Update `progress.md` **per discrete unit of work** (per test case, per fix, per ship-able feature), **not on a timer** and **not in one big dump at the end**. If you find a script called `scripts/progress-checkpoint.sh` running, kill it and delete `.progress-checkpoint.pid` + any `progress-checkpoint.md` — that was a deprecated experiment that produced noisy 60-second churn.

### 7.2 Workflow rhythm

A typical non-trivial change goes:

1. **Talk through the approach first** — write a brief plan in chat (or to yourself), get alignment with the user / client.
2. **CURRENT EXECUTION block** — at the top of `progress.md`, drop:
   ```
   ## CURRENT EXECUTION
   - Prompt: <user's literal ask>
   - Plan: <one paragraph>
   - Steps:
     - [ ] step 1
     - [ ] step 2
   ```
   This is for crash resumption — if the session dies mid-task, you (or future-you) can pick up.
3. **Execute, tick boxes as you go** — small `progress.md` updates per step. Per-test-case cadence, not per-hour.
4. **Collapse CURRENT EXECUTION into a dated entry** when done — convert to a normal `### YYYY-MM-DD …` block under the right phase.
5. **Stage + commit** with a tight subject; body explains the *why*.
6. **Deploy if appropriate** — confirm scope, run the recipe in §6, verify with `curl …/health`.

Skip the ceremony for genuinely-one-shot changes (typo fix, single CSS tweak). Keep it for everything else.

### 7.3 Commit hygiene

- Branch: `main`. Work directly on main — no PR review process is set up for vendor-internal work.
- Make small, focused commits with a descriptive subject. Match the style of `git log` — recent commits are good templates.
- **Exception — held batch:** During the 13-session mobile test-case authoring workstream, do **NOT** commit per session. The user wants one combined commit at the end. 9/13 sessions done as of handover. Stage all changes, mark sessions complete in `AUTHORING_PROGRESS.md`, leave uncommitted between sessions. When sessions 10–13 finish, run the combined commit.
- Selective commits when the working tree is mixed: always be explicit about scope (`git add` specific paths, not `git add -A`). The held mobile-test batch shouldn't accidentally leave with a label-only commit.

### 7.4 Risky-action discipline

For anything visible or hard to reverse — pushing code, deploying to the testing portal, force-pushing, deleting branches, sending messages, building/uploading APKs — **confirm scope first** even if the user said "push it" earlier in the session.

When the working tree is mixed (multiple unrelated changes), confirm explicitly which subset goes. We had a real moment today where today's label work was mixed with the held mobile-test batch in the working tree; the right move was to stage selectively and ask before pushing, not push everything.

The cost of pausing to confirm is low; the cost of a wrong push to a shared server is high.

### 7.5 Working with Claude / AI agents

This project has been built and is being maintained with heavy use of Claude (Claude Code). If you'll continue with the same workflow:

**Model split:**
- **Opus** (default model for this user, persistent in memory) for planning, design decisions, diagnosing failures, judgment-dense code edits. Opus 4.7 has a 1M-context mode available; `/fast` toggles faster output without downgrading the model.
- **Sonnet** (delegated via Claude's Agent tool with `model: "sonnet"`) for execution — running test suites, long builds, bulk log scraping, anything that's "follow these steps and report the results."

Don't lapse back to running tests from the Opus session after the first delegation — every re-run, targeted spec, or verification pass goes through Sonnet too. Quick single-purpose probes from Opus (curl health, cat config, `git status`) are fine; full test executions are not.

**Subagent prompt discipline** — every Agent prompt that does code work must include the forbid block:

> "Do NOT modify `progress.md`. Do NOT commit / push / run the emulator."

Otherwise the agent will helpfully but verbosely append duplicate Phase-X entries to `progress.md` and may proactively push code. See §13 incident #1.

**Memory awareness** — Claude Code keeps per-project auto-memory at `~/.claude/projects/D--Projects-Mahavir-Polymers---Inverntory-Management/memory/`. The `MEMORY.md` file is loaded into context every conversation, and individual feedback / project / reference files capture point-in-time decisions. Treat memory as historical evidence — verify against current code before asserting facts. If you're not using Claude, ignore it; this onboarding doc distills what those memories contain.

### 7.6 Test cases live in `docs/test-cases-v3/`

- v2 (web-portal) test cases are at `docs/test-cases-v2-phases-*.md` — legacy, kept for reference.
- v3 (mobile + cross-platform) is the active set. Phases 21–29 are mobile-specific and currently held under the 13-session authoring batch.
- `docs/test-cases-v3/AUTHORING_PROGRESS.md` is the canonical per-session tracker — **always read first when resuming the workstream**, and look for `[?]` flags (numbered open questions / surfaced bugs) before answering "is anything pending?"

---

## 8. Key technical decisions (don't second-guess without checking)

Confirmed by client / project lead, do not change unilaterally:

- **App name:** Binny Inventory
- **Theme:** Red `#E31E24` primary, white secondary, dark-gray text. Brand B icon in `monogram.png`.
- **Auth:** Email/password with JWT (access + refresh tokens, 15m / 7d expiry)
- **QR format:** Industry-standard structured identifiers — **8-char short barcodes** (migrated from `BINNY-CB-{uuid}` on 2026-05-05). Anything still showing the long format is legacy.
- **Barcode prefix convention:** Child boxes are 8 chars `[A-Z0-9]`; master cartons are `MC` + 6 chars (e.g. `MCJ24YXS`).
- **Roles:** Admin / Manager / Warehouse Op / Dispatch Op. Role gates are inconsistently implemented across modules — see `[?]`33–34 in `AUTHORING_PROGRESS.md` for an open architectural cleanup.
- **Dispatch required fields:** Party Name + Invoice No. Optional: Transport Details, LR Number, Destination.
- **Customer Master:** Separate module since 2026-03-16; dispatch links to Customer Master, not free-text destination.
- **Product Master extra fields:** category (Gents/Ladies/Boys/Girls), section (Hawaii/PU/EVA/Fabrication/Canvas/PVC/Sports Shoes), location (VKIA/MIA/F540), article group, HSN code, size group/range.
- **Manufacturer footer (printed on every child box label):**
  `Mahavir Polymers Pvt Ltd / FE 16-17 MIA Jaipur - 302017 Raj (India) / Customer Care: 0141 2751684`
- **UI language:** English only (no localisation in Phase 1).
- **No SMS / email notifications in Phase 1.**

---

## 9. External accounts you'll need

### GitHub
- Repo: <https://github.com/MayankH2407/binny_inventory_management> (origin, branch `main`)
- Auth via your own GitHub credentials / PAT.

### Expo (for mobile APK builds)
- Project owner account: **`kanikabehl`** (email `kanika@basiq360.com`)
- The password is not handy locally. Auth the EAS CLI via access token:
  1. Open <https://expo.dev/settings/access-tokens> while logged in as `kanikabehl`
  2. Create a new token ("binny-apk-build"), copy it
  3. Use inline: `EXPO_TOKEN="<token>" npx eas-cli <command>` from `mobile/`
  4. Or persist: `setx EXPO_TOKEN "<token>"` on Windows
- Tokens are stateless; the CLI's "Not logged in" output is misleading — builds still work via the env var.
- Build command for client APK:
  ```bash
  cd mobile && EXPO_TOKEN="<token>" npx eas-cli build --profile preview --platform android --non-interactive
  ```
- The `preview` profile produces an installable APK pointing at the testing portal (`https://srv1409601.hstgr.cloud/binny/api/v1` — the fallback in `mobile/constants/index.ts`).
- Free-tier queue waits 10–30 min before starting a build. If the client needs faster turnaround, upgrade at <https://expo.dev/accounts/kanikabehl/settings/billing>.

### Hostinger testing server
- SSH: `ssh -i ~/.ssh/id_ed25519 root@srv1409601.hstgr.cloud`
- Web: <https://srv1409601.hstgr.cloud/binny/>
- See §6 for the deploy recipe.

### AWS (for production, coming soon)
- Production will live under **Basiq360's existing AWS account** on subdomain `binny.basiq360.com`.
- Migration hasn't happened yet — testing portal stays on Hostinger until cutover.
- All env vars (`CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`) should point at `https://binny.basiq360.com` for prod. Keep `NEXT_PUBLIC_BASE_PATH` empty (serve at root, not `/binny/`) since the subdomain replaces the path-prefix role.
- DNS records (A or CNAME for `binny`) need to be added under whichever DNS provider hosts `basiq360.com`.
- Backups, monitoring accounts, and uptime checks live in Basiq360's vendor accounts.

---

## 10. Things to watch / open items

- **TSC printer driver media size** — the current child-box label uses `@page 96mm × 48mm`, master-carton uses `150mm × 100mm` (landscape, as of 2026-05-19). If the physical printer driver is still set to the old media sizes, prints will be scaled/clipped. See `docs/tsc-printer-setup-guide.html` for the driver walkthrough. Always confirm physical roll spec + driver setting matches the `@page` when label changes ship.
- **Role-gate inconsistency** — Samples / E-commerce gate per-button, Master Cartons gate the whole action bar. Cross-cutting cleanup pending. `[?]`34 in `AUTHORING_PROGRESS.md`.
- **Mobile users module is dead code** — `mobile/services/user.service.ts` exists but no UI; `mobile/app/(tabs)/menu.tsx` exposes an Admin-only Users tile that routes to a non-existent `/users` screen. Either build it or remove the tile. `[?]`51, `[?]`52, `[?]`62.
- **Mobile customer module has no delete / activate-deactivate UI** — must use web for those actions. `[?]`52, `[?]`53.
- **Scan trace auto-activates GENERATED boxes** — `mobile/app/(tabs)/scan.tsx:31-39` silently transitions a `GENERATED` box to `FREE` when scanned via trace. Trace should be read-only conceptually; this is a UX bug. `[?]`66.
- **Mobile scan placeholder is stale** — still shows `"Enter barcode (e.g., BINNY-CB-...)"` post-May-5 short-format migration. `[?]`67.
- **AWS migration** for production go-live — not started. Hostinger stays the staging URL until cutover.
- **Held mobile-test-authoring batch** — 4 sessions remaining (10: reports/M6, 11: cross-platform parity, 12: edge cases, 13: README + tracker finalise). Combined commit fires after session 13.

---

## 11. Quick reference

### Domain glossary
- **Article** = product (e.g. "MOGLI PLUS 02") — top-level SKU.
- **Colour / Size** — child variants under an article.
- **MRP** = Maximum Retail Price (₹), printed on label, inclusive of all taxes.
- **Pack date** = date the child box was sealed.
- **Pair / Content** = a child box typically holds 1 pair = 2 N (2 units).
- **Master Carton** = a master container of child boxes, identified by carton barcode.
- **Assortment** = the per-size breakdown of what's inside a master carton.
- **Sample (SR) / E-commerce (EC)** = alternative dispatch source types alongside Master Carton.

### Child Box statuses
`GENERATED → FREE → ACTIVE (inside a carton) → DISPATCHED`
(Trace endpoint silently auto-activates a `GENERATED` box on scan — see §10; conceptual bug.)

### Master Carton statuses
`CREATED → ACTIVE → CLOSED → DISPATCHED`

### API health endpoints
- Local: <http://localhost:3001/api/v1/health>
- Testing: <https://srv1409601.hstgr.cloud/binny/api/v1/health>
- Both return `{"status":"ok","timestamp":"…"}`.

### Critical user-facing files (frequent edit targets)
- `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx` — child-box label print template
- `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx` — master-carton label print template
- `frontend/src/app/(dashboard)/dispatch/page.tsx` + `dispatches/page.tsx` — dispatch flow
- `backend/src/controllers/*.ts` — API surface, one controller per resource
- `mobile/app/(tabs)/scan.tsx` — mobile scan + trace screen
- `progress.md` — your future self will thank you

---

## 12. Print-iteration playbook

Label edits (child box, master carton) have a recurring iteration pattern because the output is hard to predict from CSS alone — physical printers, thermal media, browser print engines, and the 48mm × 48mm constraint all conspire. Here's the playbook:

1. **Apply the CSS / HTML change** in `frontend/src/app/(dashboard)/child-boxes/generate/page.tsx` or `frontend/src/app/(dashboard)/master-cartons/[id]/page.tsx`. The label HTML is built inside `handlePrint` / `handlePrintLabel` via a template literal — find the `<table class="main">` and the `<style>` block.
2. **Polling HMR picks it up** automatically (~1–3s) since the frontend service has `WATCHPACK_POLLING: true`. Watch the container logs for `✓ Compiled`.
3. **Hard-refresh** the generate / detail page in the browser (`Ctrl+Shift+R`) and click **Print Labels** again. **Close any old print-preview tabs** — each Print click opens a fresh window, but stale tabs don't update.
4. **Eyeball preview, then print a sample** if it looks right. Test print verifies what the browser preview doesn't (thermal-printer kerning, actual roll dimensions, driver scaling).
5. **If the client sends a photo of a printed label**, treat it as authoritative — the on-screen preview lies sometimes (subpixel differences, browser-vs-printer kerning).

Recurring constraints to keep in mind:

- **Total content must fit** `48mm × 48mm` (child box) or `150mm × 100mm` landscape (master carton). `.label { overflow: hidden }` clips silently — if content disappears, suspect overflow first.
- **`@page` size MUST match** the physical roll AND the TSC driver media size. If those three disagree, you get scaled / clipped / rotated prints.
- **`vertical-align`, `rowspan`, and `table.main { height: 100% }`** interact unpredictably with print engines. A `rowspan="3"` cell holding a fixed-height QR will redistribute its height across rows in browser-dependent ways; with `height: 100%` on the table you can push trailing rows past the `overflow: hidden` cutoff.
- **Long strings need `white-space: nowrap`** (e.g. "Packed on: 19 MAY 26", article name, barcode under QR). The `word-break: break-all` is a common foot-gun — it'll split mid-string even when there's room.
- **Multi-colour / multi-MRP master cartons** must aggregate distinct values across all rows (see the `articleSet` / `colourSet` / `mrpSet` pattern in `master-cartons/[id]/page.tsx`). Showing only the first value is a regression.

When in doubt, ship a smaller incremental change. Label work is iteration-heavy by nature; multiple small "let me see another sample" rounds with the client are normal.

---

## 13. Past gotchas / lessons learned

Things that have gone wrong on this project. None are catastrophic, but knowing them up-front saves an hour each.

1. **Sonnet subagents auto-edit `progress.md`** — in late April 2026, a batch of 9 implementation agents each appended a verbose Phase 5 Mobile entry to the top of `progress.md`. ~160 lines of duplicate prose had to be `awk`-cut out. Fix: always include the forbid line in agent prompts (see §7.5).
2. **Time-based checkpointer was noisy** — `scripts/progress-checkpoint.sh` rewrote a checkpoint file every 60s. Per-test-case cadence is preferred. If you find a `.progress-checkpoint.pid` file or a running checkpoint loop, stop it and delete the artifacts.
3. **Windows file-watcher silence** — Next.js webpack watcher doesn't reliably see edits in Windows-host → Linux-container bind mounts. Polling env vars (`WATCHPACK_POLLING`, `CHOKIDAR_USEPOLLING`) are required on the dev compose. Removing them would silently kill HMR.
4. **Stale browser cache after deploys** — Service worker + PWA + Next.js chunk caching means "I deployed but I don't see the change" reports are usually browser-side. First instinct: Ctrl+Shift+R the page, check DevTools Network → Disable cache, or try incognito.
5. **`~/.ssh/binny-deploy` is dead** — there's a project-tracked key file by that name; it was never added to the server's `authorized_keys`. Always use `~/.ssh/id_ed25519` (your personal key). Don't waste time troubleshooting deploys with the wrong key.
6. **Multi-colour master carton labels** — early label code aggregated only the first colour/article/MRP. The May 6, 2026 fix aggregates *distinct* values across all rows. Any new master-carton label work should keep that distinct-set pattern.
7. **The `Article: ` prefix was redundant** — early child box label had `Article: MOGLI PLUS 02`. Client preferred just the name centred. Default is "show the value, not the label" for label printing. When in doubt, drop the field name.
8. **`overflow: hidden` on `.label` silently eats content** — if a row stops appearing, first check whether the total table content overflowed past `48mm`. Reduce padding / shrink fonts / restructure rowspans before getting fancy with absolute positioning.
9. **Barcode short format migration (2026-05-05)** — child boxes moved from `BINNY-CB-{uuid}` to 8-char short codes. Anywhere you see the long format, treat as legacy. Mobile placeholder text in `scan.tsx` is still stale — see `[?]`67 in tracker.
10. **EAS free-tier queue delay** — APK builds can wait 10–30 min before starting. Plan ahead if the client needs a same-day APK. Upgrade path exists.
11. **`word-break: break-all`** caused the master-carton barcode to split mid-string even though it fit comfortably. Fix: remove `word-break`, add `white-space: nowrap`. General lesson: `break-all` is rarely what you actually want — it pre-empts the engine's wrap logic even when there's room.
12. **`docker-compose.yml` vs `docker-compose.prod.yml`** — the dev compose has live bind mounts + polling HMR + the `binny_*` underscore-named containers. The prod compose has built images + the `binny-*` hyphen-named containers. Don't confuse them on the server.

---

## 14. Client communication & feedback patterns

How feedback typically enters the project:

- **Kickoff materials at repo root** — `Kick_off_Doc.pdf`, `Kickoff_Document_Binny_Basiq360.html`, `Final Scope of Work…pdf`, `Binny Footwear Kick Off.txt`. These are the contract; check them when client asks for something that "wasn't agreed."
- **Reference photos at repo root** — client sends hand-marked photos of printed samples during reviews (`Updated Label format.jpeg` is a recent one). Save new ones with descriptive names. Reference photos are authoritative for label work.
- **UAT observations** — `UAT Observations.docx` is the running client-side QA list. Tick items off as they ship.
- **Verbal / chat feedback** — client is non-technical. Translates roughly:
  - "label looks wrong" → "the article name wrapped to 2 lines because the column got narrower"
  - "I can't see X" → either layout overflow OR stale browser cache (eliminate cache first)
  - "barcode not printing" → check actual print, not just preview
  - "changes not visible on portal" → ran `git push` but forgot the tar+rebuild deploy
- **Test-print loop** — for label work specifically, client prints a physical sample, takes a phone photo, sends it. Photo is authoritative. (See §12.)
- **Iteration cadence** — label / UI work routinely goes through 3–8 rounds with the client before settling. Don't bundle multiple speculative changes into one round; let the client redirect at each step.

When a client request is ambiguous, ask one clarifying question rather than guessing. Time spent on the wrong direction is more expensive than 30 seconds confirming.

---

## 15. First-week checklist

- [ ] Clone the repo, copy `.env.example` → `.env`, `docker compose up -d`
- [ ] Hit <http://localhost:3000>, log in with a seeded user (check `backend/seeds/`)
- [ ] Read `progress.md` from top down to ~3 phases back to absorb the recent context
- [ ] Skim `docs/project-brief.md` and `docs/implementation-plan.md`
- [ ] Read `docs/test-cases-v3/README.md` + `AUTHORING_PROGRESS.md` (the test-suite shape tells you a lot about the app)
- [ ] Get SSH access set up to the Hostinger server — share your public key with the project lead, have them add it to `/root/.ssh/authorized_keys` on the server; test by running step 3 of the deploy recipe
- [ ] Get an Expo access token from `kanikabehl` and verify with `EXPO_TOKEN="<token>" npx eas-cli whoami` from `mobile/`
- [ ] Print one child-box label end-to-end (generate → print preview → reach for a paper sheet) — feels small but verifies the whole stack works for you
- [ ] Find someone to walk you through a real warehouse scenario — packing a child box, packing a master carton, dispatching to a customer — so you understand the physical workflow the UI is modelling

When in doubt: `progress.md` first, then `docs/`, then the code. When still in doubt: ask.
