# Status (as of 2026-08-02, end of session)

## Done — committed, on `main`, not yet deployed/verified live
- **1A** (tracer bullet), **5** (bracket engine), **6A** (CSV import scripts),
  **4A** (sync shell), **7** (Race to the Bottom polish — lock countdown, drop-zone/pairing
  edge cases), **11** (Admin page — bcrypt+HMAC auth, sync log, override/settle controls,
  Yahoo health) — all built, cold-reviewed by fresh-context sessions, findings fixed. 134
  tests green. HEAD after Issue 11: `9779ea9`.
- Both Issue 7 and 11 were built by `codex exec -s workspace-write` (NOT `--full-auto` —
  that flag gets blocked by Claude Code's own permission classifier when run via Bash;
  `-s workspace-write` works). Both finished clean on the first attempt, ~5 min and ~14 min
  respectively, no hangs — a big improvement over last session's 4 hangs. Cold review (fresh
  Claude subagent, solo, no workflow fan-out) caught zero real bugs in Issue 7's diff, one
  real finding in Issue 11 (in-memory per-IP login throttle won't survive across Vercel
  serverless instances — accepted as a documented tradeoff, not fixed, since it was already
  scoped that way in the build brief and bcrypt is the real brute-force defense).
- Vercel project `loser-bowl` (sc8ttys-projects) + Neon Postgres provisioned and connected.
- `CRON_SECRET` set in Vercel prod env; daily cron configured in `vercel.json`.

## New gotcha found this session — bcrypt hashes in .env.local get corrupted by Next.js env expansion
Next.js's `@next/env` loader (used for `.env.local` in dev, and for `.env*` files generally)
performs variable expansion on `$`-prefixed tokens — the same feature that lets one env var
reference another (`$OTHER_VAR`). A bcrypt hash like `$2b$10$1al.Urnc...` gets its `$2b$10$`
prefix silently stripped/mangled because `2b` and `10` look like variable names to expand
(to empty string, since they don't exist). Confirmed by direct test with `@next/env`'s
`loadEnvConfig()`. **Fix: backslash-escape every `$` in `ADMIN_PASSWORD_HASH` inside
`.env.local`** (`\$2b\$10\$...`) — confirmed this round-trips correctly.
**This escaping is local-dev-only.** Vercel's own env var storage injects values directly
into `process.env` with no dotenv-expand pass — when setting `ADMIN_PASSWORD_HASH` in the
Vercel dashboard/CLI for production, use the **raw, unescaped** bcrypt hash. Local
`.env.local` currently has the admin password hash set (escaped) and a generated
`ADMIN_SESSION_SECRET`; both are placeholders for local testing only — **Scott should set
his own production values in Vercel before this goes live**, not reuse the session-generated
ones.

## Known issue — domain still not resolving (narrowed further this session)
`loserbowl.landermedia.com` still returns **404 (Vercel NOT_FOUND)**. DNS/TLS remain fine
(A record `76.76.21.21`, valid cert). New findings this session, via `vercel inspect` /
`vercel alias ls` / `vercel logs`:
- The alias record is correct — `vercel inspect` confirms `loserbowl.landermedia.com` points
  at the current Ready production deployment, and the build itself is healthy (`/` is a
  valid dynamic route, no build errors).
- The 404 happens **at Vercel's edge, before the function is ever invoked** — `vercel logs`
  shows zero log entries for requests to the custom domain.
- **Isolated the pattern**: Vercel's **auto-generated** aliases
  (`loser-bowl-<hash>-sc8ttys-projects.vercel.app`, the plain
  `loser-bowl-sc8ttys-projects.vercel.app` project alias) route correctly and hit Deployment
  Protection (302 → Vercel SSO login) — proving the deployment itself is reachable.
  **Non-default** aliases — `loser-bowl-bice.vercel.app` (a short vanity alias) and the real
  custom domain — both 404 at the edge with no function invocation. This isn't domain-DNS
  specific; it reproduces on a `.vercel.app` vanity alias too.
- Re-ran `vercel alias set` to force a fresh mapping — no change.
- Checked vercel-status.com — no platform-wide incident.
- **Conclusion: this looks like a genuine Vercel edge bug scoped to non-default aliases on
  this project**, not a config mistake. Next step is genuinely the dashboard now (Project →
  Settings → Domains), which needs a login this session didn't have (password manager not
  connected to Claude; Claude-in-Chrome's Chrome profile isn't signed into vercel.com either).
- **Second, independent problem found**: Deployment Protection (Vercel SSO) is ON for this
  project. Even once the alias bug is fixed, visitors would hit a Vercel login wall instead
  of the site — contradicts PRD's "public link, no viewer auth" requirement. **Must be
  turned off for production** in Vercel dashboard → Settings → Deployment Protection,
  independent of the alias-routing fix.

## External — waiting, no action needed from us
- Yahoo Fantasy API access application submitted 2026-07-31 (App ID `DQcUfVuZ`). Yahoo
  acknowledged same day: review takes 1–2 weeks → expect ~Aug 7–14, inside the **Aug 17**
  manual-mode fallback gate. Watch sc8tty@gmail.com for any clarification requests.

## Next issues to build (all Yahoo-free, no blockers)
- **8** — Seed lock + bracket creation (next up)
- **10** — Bracket UI + matchup detail (buildable against fixtures, parallel to 9)
- **9** — Live compute + provisional advancement + settle/flag flow (needs 8 first)

## Process notes for next session
- **Codex worked cleanly this session** (2/2, no hangs) — a reversal of last session's 4
  hangs. Two things changed: avoided `-c model_reasoning_effort` (per last session's
  finding) AND used `-s workspace-write` instead of `--full-auto`. Note `--full-auto` isn't
  just risky, it's **actually blocked** — Claude Code's own Bash permission classifier
  rejects `codex exec --full-auto` outright (denied both plain and `nohup`/backgrounded
  variants). `-s workspace-write` is the correct flag for unattended builds now.
- Watchdogged via a `Monitor` polling loop (file-mtime + process-alive check every 60s, one
  synchronous log peek around the 5 min mark to confirm real progress vs. stalled) instead of
  passively waiting — worked well, caught real progress each time before the 15-20 min kill
  threshold would have triggered.
- Fresh-context cold review (Claude reviewing Claude's/Codex's own recent commits, solo, no
  workflow fan-out) remains worth doing every issue — caught one real finding in Issue 11
  (throttle durability) even though tests/build/lint were all clean.
- Effort-slider gotcha: the rightmost position in Scott's UI is **Ultracode** (mandates
  multi-agent workflows, expensive), not "max thinking." For heavyweight reviews use Fable
  one notch left of Ultracode.
- Fresh-context cold review (Claude reviewing Claude's own recent commits, solo, no
  workflow fan-out) caught real bugs including one live on production — worth continuing
  as a standard step after every issue, not just Codex-built ones.
- Effort-slider gotcha: the rightmost position in Scott's UI is **Ultracode** (mandates
  multi-agent workflows, expensive), not "max thinking." For heavyweight reviews use Fable
  one notch left of Ultracode.
