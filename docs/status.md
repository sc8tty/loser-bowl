# Status (as of 2026-08-01, end of session)

## Done — committed, pushed, deployed
- **1A** (tracer bullet), **5** (bracket engine), **6A** (CSV import scripts),
  **4A** (sync shell) — all built, cold-reviewed by fresh-context sessions, findings fixed,
  117 tests green, on `main` (HEAD after Issue 4A's review fixes: `c9efe23`).
- Vercel project `loser-bowl` (sc8ttys-projects) + Neon Postgres provisioned and connected.
- `CRON_SECRET` set in Vercel prod env; daily cron configured in `vercel.json`.

## Known issue — domain not resolving yet
`loserbowl.landermedia.com` returns **404 (Vercel NOT_FOUND)**, not a DNS or TLS problem —
both are confirmed fine (A record `76.76.21.21` resolves correctly; HTTPS handshake
succeeds with valid Vercel-issued cert headers). The `.vercel.app` aliases 404 too, which
points at **Vercel's alias-to-deployment mapping**, not the custom domain specifically. Tried
`vercel alias set <deployment> loserbowl.landermedia.com` once — did not resolve it
immediately; did not chase further (token budget). **Next step:** check again first — it may
have self-resolved. If not, check the Vercel dashboard directly (Project → Deployments →
confirm which deployment is marked Production) before more CLI debugging.

## External — waiting, no action needed from us
- Yahoo Fantasy API access application submitted 2026-07-31 (App ID `DQcUfVuZ`). Yahoo
  acknowledged same day: review takes 1–2 weeks → expect ~Aug 7–14, inside the **Aug 17**
  manual-mode fallback gate. Watch sc8tty@gmail.com for any clarification requests.

## Next issues to build (all Yahoo-free, no blockers)
- **7** — Race to the Bottom page (mostly wired via 4A already; confirm/polish)
- **11** — Admin page (CSRF + bcrypt + cookie auth, sync log, override form)
- **8** — Seed lock + bracket creation

## Process notes for next session
- Codex (`codex exec`) hung 4× total during this session on longer build tasks — demoted to
  advisor; Claude builds directly now. See `codex-mcp-setup` memory for the diagnosed
  pattern (the `-c model_reasoning_effort` override reproduced the hang 2/2; plain runs
  succeeded but still hung twice more on unrelated long tasks — treat any `codex exec`
  taking >15 min with zero file writes as hung, kill it, and build directly).
- Fresh-context cold review (Claude reviewing Claude's own recent commits, solo, no
  workflow fan-out) caught real bugs including one live on production — worth continuing
  as a standard step after every issue, not just Codex-built ones.
- Effort-slider gotcha: the rightmost position in Scott's UI is **Ultracode** (mandates
  multi-agent workflows, expensive), not "max thinking." For heavyweight reviews use Fable
  one notch left of Ultracode.
