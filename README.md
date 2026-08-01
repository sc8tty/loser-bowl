# Lander's League Loser Bowl

A consolation bracket tracker for the 8 teams that miss the playoffs in a 16-team Yahoo
fantasy baseball league. Winners advance; the last loser standing (well, the best of them)
takes the pot. Yahoo doesn't support consolation brackets for 8-team-playoff leagues, so
this exists.

**Live at:** [loserbowl.landermedia.com](https://loserbowl.landermedia.com) *(once deployed)*

## What it does

- **Race to the Bottom** (regular season): live standings highlighting who's falling into
  seeds 9–16, with projected round-one matchups and a countdown to bracket lock.
- **Bracket** (playoff weeks): 3 rounds mirroring Yahoo's playoff calendar, with live
  category tallies computed from Yahoo weekly team stats — full stat lines per category,
  re-seeding each round, worked tiebreaker rules.
- **Champion**: celebration takeover when the final settles.

Public, read-only, mobile-first. One password-gated admin page for the commissioner.

## Stack

Next.js 15 (App Router) on Vercel · Neon Postgres + Drizzle · hand-rolled Yahoo Fantasy API
client with OAuth2 · visit-triggered background sync with daily cron backstop.

## Docs

- [PRD.md](PRD.md) — the destination document: product spec, technical design, task graph.
  Decisions there are interview-settled and review-hardened; don't relitigate them in
  implementation sessions.
- [docs/review-log.md](docs/review-log.md) — six rounds of external design review and the
  transferable lessons. Read before "simplifying" anything that looks overwrought.

Fantasy data provided by Yahoo Fantasy.
