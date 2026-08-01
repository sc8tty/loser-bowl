# Issue 5 max-effort review — findings (2026-08-01)

Reviewer: fresh-context Claude (Fable, max effort) against commit 9a1e364. The reviewer's
formal P1/P2/P3 report was cut off by a usage limit, but all eight findings below carry
**executed evidence** (refute-by-execution) from its transcript. Verdict implied: NEEDS FIXES.

## Findings (as reported)

- **A1/A2 — Freeze bypass (P1):** `record_provisional_result` on an `under_review` matchup
  wipes the review state and emits `advance_winner` for the corrected team; on a settled
  `final` it un-settles and clobbers the override. PRD requires under_review to be FROZEN
  (no further recompute; only admin confirm/override exits it) and settled results immutable.
- **B — Override rewire gap (P1):** `admin_override_corrected` emits no side effect carrying
  the corrected team downstream — the next-round pairing never learns about the corrected
  winner.
- **C — Seed immutability (P1):** a settled seed lock re-opens to `provisional` when a new
  standings fingerprint arrives. PRD: once settled, seeds are immutable for the season.
- **D — Numeric IP inversion (P2):** `100.2` as a number vs `"100.1"` as a string picks the
  wrong category winner — numeric input is interpreted as decimal innings, string as
  Yahoo thirds notation; mixed inputs invert a comparison.
- **E — Missing-IP forfeit (P2):** reproduces (innings-minimum policy misbehaves when IP
  stat absent).
- **F — Garbage tiebreak input (P2):** reproduces (tiebreaker chain accepts malformed
  context without erroring).
- **H — Null-vs-present silent tie (P2):** reproduces (a category present for one team and
  missing for the other silently ties instead of erroring).
- **Confirmed non-bug:** malformed `bracketLockDate` fails safe ("bracket never starts",
  stuck in race — not an early flip).

## Resolution log

Fixes applied by the orchestrator session immediately following (see commit referencing
this file). Each fix lands with a regression test reproducing the reviewer's evidence first.
