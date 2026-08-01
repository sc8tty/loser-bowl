# Review Log — PRD Revision History

Six review rounds between Claude (author; fresh-context Plan-agent research) and Codex
(external reviewer; clean context each round), July 30–31, 2026. Every round found something
real; the loop closed by mutual agreement when findings dropped below design level.

This log exists so implementing agents know **why decisions look the way they do** and don't
"simplify" hard-won fixes back into bugs. If a design element below seems overwrought
(internal IDs everywhere, the 4A/4B split, the freeze semantics), it earned its shape here.

## Round 1 (rev 1→2)

Codex found: the **settle-buffer conflict** — rev 1 finalized results after a 24 h
stat-correction window while the next round starts Monday morning; the two facts couldn't
coexist (the one true design bug of the loop; fixed with provisional advancement). Also:
treat Yahoo API access as a gated critical path with a decision date (Aug 17) and a real
fallback; prove the fallback in the spike ("an unproven fallback isn't a fallback"); make
Vercel Hobby constraints explicit (dynamic pages, maxDuration, chunked/local backfill); add
provisional/settle schema fields; move security (CSRF, hashing, noindex) into the build
rather than a deferred hardening pass.

Claude's counter-contributions: canonical-source ruling (Yahoo's published numbers canonical
wherever Yahoo adjudicated; our comparator only for bowl matchups — reversing rev 1), the
`stat_lines` source-agnostic seam, the no-auto-rewire freeze rule, and backfill as a local
script instead of contorted serverless.

## Round 2 (rev 2→3)

Fallback made activatable-in-an-hour (CSV shape + import scripts built early, not on
gate-failure day); Yahoo payload provenance stored for disputes; exact freeze semantics
specified (frozen matchup, public banner, downstream badge, branch-only advancement pause,
admin resolution); backfill rigor (idempotent, logged, dry-runnable, committed). Password
hashing kept — Codex's accidental-leak framing (logs, dashboard copy-paste) beat Claude's
threat-model shrug.

## Round 3 (rev 3→4)

Best catch: the fallback was **Yahoo-shaped** — CSVs validated against an API-derived
settings snapshot and keyed by Yahoo team keys, both of which only exist if the API works
(circular). Fixed with internal team ids, nullable Yahoo keys, seedable settings, and the
1A/1B tracer split. Also: the **innings-pitched minimum** rule (standard Yahoo baseball
setting that can flip ERA/WHIP outcomes — a genuine domain miss); seed-lock corrections
given the same provisional policy as round corrections; OAuth `state` must ride a
SameSite=Lax cookie (the Yahoo redirect is cross-site — Strict silently breaks the
callback); `after()` inherits the invoking route's duration budget; Yahoo attribution;
stat_id CSV keys; explicit timezone + region pinning.

## Round 4 (rev 4→5)

Same coupling bug, second instance: Issue 6 (the fallback importer!) was transitively
blocked on Yahoo via Issue 4 → split 6A/6B. Manual mode couldn't adjudicate ties — added
regular-season-matchup and outcome_totals imports. Internal-ID cleanup finished through
matchups and stat slugs. CSV gained support-stat columns. Champion phase made status-aware
(COALESCE alone would confetti a provisional final).

## Round 5 (rev 5→6)

Same coupling bug, **third instance**, now on the app path (Race, Admin, Seed Lock all
transited Issue 4 → 1B → Yahoo) → 4A/4B split, yielding the explicit Yahoo-free frontier:
0B → 1A → {4A, 5, 6A} → {7, 8, 11} → 10. The sneakiest catch of the loop: WHIP support
stats conflated batting hits/walks with hits-allowed/walks-allowed — a bug that
type-checks, survives same-mental-model fixtures, and fires only in manual mode in a
WHIP-decided matchup. Fixed with distinct slugs that make the conflation inexpressible.
Plus explicit storage for outcome_totals and seed-lock review state (spec-schema drift).
Both reviewers agreed to close the loop.

## Round 6 (final)

Implementation-ready verdict. One alignment fix: the spike paragraph rewritten to prove the
importer's exact six support slugs rather than aggregate components.

## Lessons (transferable beyond this project)

1. **Fresh-context review works.** The two best catches (settle-buffer, WHIP conflation)
   were structurally invisible from inside the context that produced them.
2. **Sweep for the pattern, not the instance.** The identical Yahoo-coupling bug was found
   three times (data layer, issue-graph edge, app path). After a reviewer finds one instance
   of a coupling bug, the author should walk every path back to the dependency and audit for
   the class — Claude fixed instances and never self-initiated the sweep.
3. **Prose amendments must trigger a schema/graph re-walk.** Three findings were pure
   spec-schema drift: behavior added in later revs (outcome_totals, seed-lock states, spike
   wording) with no storage or no updated proof obligation.
4. **Know when to stop.** Finding profile across rounds: design bug → process gaps →
   coupling/domain → coupling again + bookkeeping → wording. When findings drop below design
   level and remaining unknowns are empirical, hand off to a spike, not another round.
5. **Verification instruments must speak the implementation's vocabulary.** The spike proves
   the six exact slugs the importer consumes, not a paraphrase of them.
6. **A designed fallback is judged by its ancestry.** "Fallback exists" is not the bar;
   "fallback's entire dependency ancestry avoids the thing it's a fallback for" is.
