# RCA — Surveydesk Coexistence Issues (May 2026)

**Project:** Binny Footwear Inventory Management (Basiq360)
**Author:** Basiq360 Engineering
**Date drafted:** 2026-05-26
**Status:** Both incidents resolved; preventative actions partially in flight (see §6)

---

## 1. Executive Summary

Between **2026-05-23** and **2026-05-26**, the Binny Inventory deployment hit two operational issues caused by sharing infrastructure with another Basiq360 client application, **Surveydesk**, on Hostinger VPS hosts.

| # | Date | Host | Severity | Symptom | Root cause |
|---|---|---|---|---|---|
| A | 2026-05-23 | LIVE (`srv1689976.hstgr.cloud`) | Blocker (deploy-stop) | Could not bind Binny to a public port without conflicting with Surveydesk; alt-port pivot blocked by upstream firewall | Surveydesk owned 80/443; Hostinger network filters non-standard ports upstream of the VPS |
| B | 2026-05-26 | TEST (`srv1409601.hstgr.cloud`) | Sev-3 (performance) | Test portal slow for client (bulk label print taking ~4× normal); host load avg 5.6+, 1.3 GiB swap in use | 11 stuck `docker compose logs --tail=N` processes from `/opt/surveydesk` had been accumulating since 2026-05-20/21, holding open log streams against `dockerd` |

Both were resolved without data loss and without Binny code defects. Both shared the same underlying issue: **two unrelated tenant stacks on a single VPS with no enforced boundaries**, where one tenant's choices (Surveydesk's port ownership and its operator's stuck commands) leaked into the other tenant's runtime behaviour.

This RCA documents what happened, why, and the changes (some applied, some still pending) that prevent recurrence.

---

## 2. Hosts and Tenants Reference

| Host | Hostname | IP | Binny role | Surveydesk role |
|---|---|---|---|---|
| TEST | `srv1409601.hstgr.cloud` | 76.13.245.90 | `/opt/binny/` running `binny-frontend`, `binny-backend`, `binny-db` | `/opt/surveydesk/` — operators occasionally run `docker compose logs` from here |
| LIVE | `srv1689976.hstgr.cloud` | 187.127.130.99 | `/opt/binny/` running `binny-frontend`, `binny-frontend-root`, `binny-backend`, `binny-db` | `/opt/surveydesk/` owns ports 80 + 443; `surveydesk-frontend` nginx is the shared edge for both apps |

Both VPSes are Ubuntu 26.04, Docker 29.5.2, with Hostinger-managed network firewalling upstream.

---

## 3. Incident A — Port Conflict on LIVE Server (2026-05-23)

### 3.1 Timeline

| Time (UTC, approx.) | Event |
|---|---|
| T+0 | Began LIVE infra setup on `srv1689976.hstgr.cloud` per the agreed go-live plan. |
| T+~10m | Discovered `surveydesk-frontend` already binding to host ports 80 and 443. Standard ports unavailable for Binny's nginx ingress. |
| T+~15m | First pivot: bring up `binny-edge` container on ports **8080/8443** with a self-signed cert as a separate ingress. UFW and `iptables INPUT` opened; container healthy and reachable on the loopback interface. |
| T+~25m | External smoke test from local dev machine: ports 8080/8443 unreachable. Confirmed via `curl -v` and `nc -zv` that the TCP handshake never completes from outside the host. UFW + iptables show ACCEPT. |
| T+~35m | Concluded the filter is **upstream of the VPS** (Hostinger network-level firewall, no self-service control). Standard ports (22/80/443) confirmed the only inbound paths. |
| T+~40m | Second pivot: shared-edge architecture. Surveydesk's nginx becomes the shared edge for both tenants. |
| T+~80m | Patched `/opt/surveydesk/nginx.frontend.conf` with a second `server { listen 443 ssl; server_name srv1689976.hstgr.cloud 187.127.130.99; ... }` block. Mounted via `docker-compose.override.yml`. Created `edge-network` bridge; joined `surveydesk-frontend`, `binny-frontend`, `binny-backend` to it. |
| T+~85m | Recreated `surveydesk-frontend` (~4 s downtime for Surveydesk users). Binny endpoints serving cleanly; Surveydesk `/health` still 200. |
| T+~100m | Let's Encrypt cert issued for `srv1689976.hstgr.cloud` via `certbot/certbot --webroot`. Live portal up at `https://srv1689976.hstgr.cloud/binny/`. |

### 3.2 Root Causes

Two independent causes compounded:

1. **Port ownership not negotiated up front.** The new VPS was treated as a clean Binny host. It was not — Surveydesk was already there with 80/443 bound. The go-live plan ([[project_go_live_infra]]) was written for an AWS host under Basiq360's direct control; it was not updated when the host swapped to a shared Hostinger VPS.
2. **Provider-level constraints not validated.** The fallback plan ("bind to 8080/8443") assumed Hostinger behaves like a stock cloud VPS where the operator controls inbound traffic via UFW/iptables. Hostinger applies an additional **network-level filter upstream of the VM** that blocks non-standard ports. This was discovered empirically during the deploy, not in pre-flight checks.

### 3.3 Impact

- **Deploy time slipped by ~90 minutes** vs. the planned setup (multiple architecture pivots).
- **Surveydesk experienced ~4 s downtime** during the `surveydesk-frontend` recreate. Users active at that moment would have seen one failed request and an automatic browser retry succeed. No data integrity impact.
- **No Binny data loss** (deploy was greenfield — fresh DB).
- Architectural debt introduced: Binny's reachability is now coupled to Surveydesk's nginx process lifecycle (see §5.1).

### 3.4 Resolution Applied

Shared-edge architecture, documented in [[project_live_deployment]]:

- `surveydesk-frontend` is the only listener on host 80/443.
- A second `server { ... }` block inside Surveydesk's nginx routes `/binny/*` to Binny containers.
- A docker bridge network `edge-network` connects `surveydesk-frontend` to Binny containers by name.
- Patched nginx config and override compose live in `/opt/surveydesk/`, not `/opt/binny/`. Backup at `/opt/surveydesk/nginx.frontend.conf.bak.before-binny`.

Brand-URL cutover on 2026-05-25 added a second `server_name binnyfootwear.basiq360.com` block in the same nginx, plus a second Binny frontend container (`binny-frontend-root`) with no `basePath`. Backup at `/opt/surveydesk/nginx.frontend.conf.bak.before-binnyfootwear`. See the May 25 entry in `progress.md` for the full sequence.

---

## 4. Incident B — Stale `docker compose logs` Zombies on TEST Server (2026-05-26)

### 4.1 Timeline

| Time | Event |
|---|---|
| 2026-05-20 / -21 | (Earliest observed) — Surveydesk operator runs `docker compose logs --tail=N` commands inside `/opt/surveydesk` from an interactive SSH session. Each invocation should be a one-shot read; instead they hang. The SSH session disconnects without reaping them. They reparent to PID 1 and stay alive holding open log streams against `dockerd`. |
| 2026-05-23 (Binny deploy session) | Flagged in `progress.md` as a known-noisy-neighbour TODO; not acted on (deploy was the priority, box was reachable). |
| 2026-05-26 (this incident) | Client reports test portal "extremely slow" — printing 50–60 child-box labels at once takes ~4× normal. |
| T+10m | Investigation begins. Verified Binny containers themselves are idle (`binny-frontend` 0% CPU / 44 MiB; backend 0% / 29 MiB; DB 0% / 72 MiB; DB total 17 MB). Print code is client-side React state-rendered — server load doesn't bottleneck the print itself, but the page navigation, bulk-create API call, and asset fetches around it do. |
| T+20m | Host metrics: 5/15-min load average 5.64 / 5.77 on a small VPS; **1.3 GiB swap actively in use**. `dockerd` showing 9.2% lifetime average CPU and #5 process by CPU. |
| T+25m | `ps -ef \| grep 'docker compose logs'` returns **11 stuck processes**, all parented to PID 1 (init), oldest from 2026-05-20. All invoked with `--tail=30` or `--tail=50` (no `-f`), so they should have exited immediately. |
| T+30m | Cleared with `pkill -f 'docker compose logs --tail='`. |
| T+30m+ | Stuck procs: 0 (verified). API health: 200 in 0.71 s. 5/15-min load trending down to 7.88 / 4.92 (1-min temporarily spiked to 12-13 because `unattended-upgrade --download-only` happened to be running — unrelated, Ubuntu daily job, self-resolves). |

### 4.2 Root Cause

`docker compose logs --tail=N` (without `-f`) is a one-shot read that should print N lines and exit. In this case it did not exit — it held the log stream open against `dockerd` indefinitely. Why these specific invocations hung is not 100% determined (likely a `dockerd` <-> `containerd` log-driver edge case under load, possibly involving the `local` driver and a stalled buffered read), but the **operational cause is clear**: the Surveydesk operator's commands were fired from a watcher loop in an interactive SSH session that disconnected without reaping its children.

Once parented to init, each stuck process holds a goroutine inside `dockerd` doing a blocking stream read. Eleven of these accumulating over a week drove `dockerd`'s CPU draw up, contended with all other Docker operations (including Binny's), and pushed the small VPS into swap.

### 4.3 Impact

- **Client-visible:** test portal felt sluggish for ~2-3 days, peaking on 2026-05-26 when the client ran a bulk print job. Bulk operations (50–60 labels) most affected because they hit multiple endpoints in series and load multiple asset bundles in the print window.
- **No data loss, no incorrect data, no Binny code defect.**
- **Did NOT affect LIVE** — different host. Incident B is test-box-only.

### 4.4 Self-Inflicted Footgun During Cleanup

The **first** `pkill` attempt used pattern `'docker compose logs --tail'` (without the `=`). That literal string also appeared in the argv of the bash command running pkill itself (because pkill was invoked from a remote SSH shell whose command line contained the same substring). pkill killed its own SSH session mid-loop.

The corrected pattern `'docker compose logs --tail='` anchors on `=` (present in all stuck procs as `--tail=30` / `--tail=50` but absent in the pkill wrapper command line). All 11 procs were signalled before the bash exited, so the cleanup succeeded despite the SSH drop — but the right move next time is to use the safe pattern from the start. **Rule:** when scripting `pkill -f`, always pick a pattern that **cannot match the killer's own command line**.

### 4.5 Resolution Applied

- Stuck procs killed (`pkill -f 'docker compose logs --tail='`).
- Memory updated ([[live-deployment-server]] and [[project_deployment]]) so future sessions check for this pattern first instead of re-diagnosing from scratch.
- Deferred: `docker system prune -af` on the test box (77% disk, 23 GB free — not urgent; better done right after a fresh build so layer cache stays warm).

---

## 5. Contributing Factors (both incidents)

### 5.1 Single-VPS multi-tenancy with no isolation contract

Two unrelated client apps share each VPS at the OS level. There is no formal "tenant contract" defining:
- which ports each tenant owns,
- which directories each tenant owns,
- which networks/interfaces each tenant may attach to,
- which operator may run which commands inside which working directory.

Result: Surveydesk's operational choices (port binding, log commands) directly affected Binny's runtime.

### 5.2 Plans not re-validated when infrastructure changed

The go-live plan was written for AWS and not updated when LIVE swapped to a shared Hostinger VPS. The first deploy session discovered Surveydesk + the upstream firewall in production rather than in a pre-flight check.

### 5.3 No active health/load monitoring on either host

The test-box slowness existed for ~3 days before the client noticed and reported it. There is currently no alerting on:
- host load average,
- swap usage,
- number of `docker compose logs` processes (or process count generally),
- container CPU/memory.

Without monitoring, every Sev-3 manifests as a client complaint, not a proactive page.

### 5.4 Operator habits on the shared boxes are not codified

The Surveydesk operator(s) likely don't realise their interactive `docker compose logs` invocations can starve a sibling tenant. There is no shared operations runbook, no shell wrapper, no `.bashrc` hook flagging shared-resource commands.

---

## 6. Preventative Measures

Listed in priority order. Status as of 2026-05-26.

### 6.1 Architectural

| # | Action | Status | Owner | Notes |
|---|---|---|---|---|
| A1 | **Document the shared-edge architecture** as a deliberate design, not an accident. Diagram both the hstgr fallback and the binnyfootwear canonical paths. | DONE for live ([[live-deployment-server]] memory); diagram still TODO | Basiq360 eng | Reduces "what is this?" panic during incident response. |
| A2 | **Move toward per-tenant isolation** for new client onboarding. Each new client gets either (a) its own VPS, or (b) a documented shared-host contract with a Basiq360 ops sign-off. | TODO (policy decision) | Basiq360 leadership | Long-term fix for §5.1. |
| A3 | **Decouple Binny ingress from Surveydesk's nginx process lifecycle.** Two options: (a) move the shared edge to a host-managed nginx (systemd) so neither tenant container restart blips the other; (b) replace surveydesk-frontend's image with one that mounts nginx.conf from host (so the edge container is co-owned, not Surveydesk-owned). | TODO | Basiq360 eng | Today a `surveydesk-frontend` recreate = Binny 502 for ~4 s. |
| A4 | **Drop the hstgr fallback URL** after binnyfootwear stabilises (2-4 week observation window from 2026-05-25). One container fewer = simpler mental model. | Decision pending mid-June | Basiq360 + client | Already flagged as a follow-up in [[live-deployment-server]] item 4b. |

### 6.2 Operational

| # | Action | Status | Owner | Notes |
|---|---|---|---|---|
| O1 | **Pre-flight checklist for new VPS deploys** must include: confirm no other tenant on the host, confirm port 80/443 free, validate firewall behaviour on a non-standard port BEFORE building infra around the assumption. | TODO — write checklist into `docs/` and link from go-live plans | Basiq360 eng | Would have caught the Hostinger upstream-filter issue in 10 min instead of 90. |
| O2 | **Shared-host operator runbook** for both Surveydesk and Binny ops staff. Rules: never run `docker compose logs` without `-f` from an interactive session that may disconnect; always run with `timeout 30s docker compose logs --tail=N`; document the kill pattern (`pkill -f 'docker compose logs --tail='`). | TODO | Basiq360 ops | Direct counter to §5.4. |
| O3 | **Weekly stale-process sweep** on both VPSes via cron: `pkill -f 'docker compose logs --tail='` (or any other identified noisy pattern). Cheap, idempotent, no-op when clean. | TODO | Basiq360 ops | Belt-and-braces backstop for O2. |
| O4 | **LE cert renewal automation** on the LIVE box. Two certs (hstgr 2026-08-21; binnyfootwear 2026-08-23) currently have no auto-renew. Set up before mid-August. | TODO (already tracked as live follow-up #5) | Basiq360 eng | Not surveydesk-related directly, but a known prod cliff. |
| O5 | **Periodic `docker system prune -af`** scheduled on both hosts after successful deploys (when image-layer cache is fresh) — not before deploys. | TODO | Basiq360 ops | Test box at 77% disk; not urgent but trending up. |

### 6.3 Monitoring & Alerting

| # | Action | Status | Owner | Notes |
|---|---|---|---|---|
| M1 | **Host-level baseline alerting** on both VPSes: load avg, swap usage, disk %, process count. Email or push to Basiq360 ops Slack/equivalent at thresholds (e.g. load > 5 for 10 min, swap > 200 MiB, disk > 85%). | TODO | Basiq360 eng | Would have paged on 2026-05-23 when test box load hit 17-24, instead of waiting for the client report on 2026-05-26. |
| M2 | **Container-level health check + restart policy audit** on both stacks. Confirm every Binny container has `restart: unless-stopped` and a meaningful HEALTHCHECK. | TODO (audit pending) | Basiq360 eng | Pre-empts silent-degradation Sev-3s. |
| M3 | **External uptime monitoring** (e.g. UptimeRobot, free tier) hitting `https://binnyfootwear.basiq360.com/api/v1/health` and `https://srv1409601.hstgr.cloud/binny/api/v1/health` every 5 min, paging on 3 consecutive failures. | TODO | Basiq360 eng | Catches a wider class of outages than host-level monitoring alone. |
| M4 | **Specific zombie-process check:** `count(pgrep -f 'docker compose logs --tail=') > 2` triggers a warning. | TODO | Basiq360 eng | Direct §4.2 prevention. Trivial to add once M1 is in place. |

### 6.4 Process / Communications

| # | Action | Status | Owner | Notes |
|---|---|---|---|---|
| P1 | **Cross-team shared-host coordination channel** (Slack/Teams) between Binny and Surveydesk engineering. Notify the other tenant before any nginx, network, or `docker compose down`-class operation on the shared edge. | TODO | Basiq360 leadership | Direct §5.4 counter. |
| P2 | **Mandatory "shared host" tag on incidents** so they're tracked separately from Binny-code defects and Binny-data issues. | TODO | Basiq360 eng | Helps prioritise A2 long-term. |

---

## 7. Open Action Items (Quick Reference)

For the next working session, prioritised:

1. **O1** — Write the new-VPS pre-flight checklist (`docs/ops/vps-preflight-checklist.md`). ~1 hr.
2. **M1 + M3 + M4** — Stand up baseline + uptime + zombie-process alerting on both hosts. ~2-4 hr.
3. **O2 + P1** — Draft and circulate the shared-host operator runbook + agree the cross-team channel. ~2 hr.
4. **O3** — Add the weekly cron sweep. ~15 min.
5. **A3** — Investigate decoupling Binny ingress from Surveydesk container lifecycle. Spike, then decide. ~2-4 hr.
6. **O4** — LE renewal automation on LIVE before August. ~1 hr (well in advance).

The cumulative effort to close everything in §6 is approximately **1-2 engineering days** spread across the next sprint. None of it is blocking client UAT or further feature work; all of it is paying down the operational risk surfaced by these two incidents.

---

## 8. Lessons Learned

1. **Treat shared infrastructure as a first-class architectural concern.** "Just put it on the box that's already there" is fast in the short term and expensive every time a sibling tenant misbehaves.
2. **Validate provider constraints empirically before planning around them.** Hostinger's upstream port filter was discoverable in 5 minutes of pre-flight testing; instead it was discovered mid-deploy and reshaped the whole architecture.
3. **No host monitoring = the client is your monitoring.** Three days of degraded performance is too long to learn about a problem from a customer.
4. **`pkill -f` patterns must not self-match.** Always anchor on a substring guaranteed unique to the targets and absent from the killer's own command line.
5. **Document the deliberate decision, not just the final state.** The shared-edge architecture is fine; what was missing was a written record explaining why we chose it and what the trade-offs are. That document is now this RCA + [[live-deployment-server]].

---

*Document owners: Basiq360 Engineering. Update this RCA if Action Items in §6 are completed or if a related incident recurs.*
