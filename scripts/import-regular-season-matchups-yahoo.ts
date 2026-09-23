/**
 * Populates `regular_season_matchups` from the Yahoo scoreboard.
 *
 * Why this exists alongside the CSV importer: the head-to-head series is the
 * league's FIRST playoff tiebreaker ("Best regular season record vs opponent
 * wins"), but the table sat EMPTY in production for the whole 2026 season —
 * the CSV importer was never run and the Yahoo sync never populated it. An
 * empty table made every tie skip head-to-head and fall through to season
 * totals. `applyTiebreakers` now refuses to run on an empty table; this fills
 * it from the source of truth instead of asking anyone to hand-build a CSV of
 * 180+ rows.
 *
 * Read-only against Yahoo. Idempotent: re-running upserts the same rows.
 *
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/import-regular-season-matchups-yahoo.ts [--dry-run] [--weeks 1-23]
 */
import { sql } from "drizzle-orm";

import * as schema from "../src/db/schema.ts";
import {
  createImportDb,
  fetchKnownTeamIds,
  logSyncRun,
  normalizeMatchupPair,
  runImportScript,
} from "./lib/import-common.ts";

const LEAGUE_KEY = process.env.LEAGUE_KEY ?? "469.l.16468";

type Args = { dryRun: boolean; firstWeek: number; lastWeek: number };

function parseArgs(argv: readonly string[]): Args {
  const dryRun = argv.includes("--dry-run");
  const weeksAt = argv.indexOf("--weeks");
  let firstWeek = 1;
  let lastWeek = 23;

  if (weeksAt !== -1) {
    const spec = argv[weeksAt + 1] ?? "";
    const match = /^(\d+)-(\d+)$/.exec(spec);

    if (match === null) {
      throw new Error(`--weeks expects a range like 1-23 (got "${spec}").`);
    }

    firstWeek = Number(match[1]);
    lastWeek = Number(match[2]);

    if (firstWeek < 1 || lastWeek < firstWeek) {
      throw new Error(`--weeks range is not sensible: ${spec}`);
    }
  }

  return { dryRun, firstWeek, lastWeek };
}

/**
 * Reads the stored Yahoo token directly rather than through
 * `src/lib/yahoo/tokens.ts`, which is `server-only` and cannot be imported by a
 * plain Node script. A refreshed token is deliberately NOT persisted here: this
 * script is read-only against Yahoo, and the app refreshes and stores its own
 * on the next sync.
 */
async function yahooAccessToken(db: ReturnType<typeof createImportDb>): Promise<string> {
  const rows = await db
    .select({
      accessToken: schema.oauthTokens.accessToken,
      refreshToken: schema.oauthTokens.refreshToken,
      expiresAt: schema.oauthTokens.expiresAt,
    })
    .from(schema.oauthTokens)
    .where(sql`${schema.oauthTokens.id} = 1`)
    .limit(1);
  const stored = rows[0];

  if (stored === undefined) {
    throw new Error("Yahoo is not connected — no stored OAuth token.");
  }

  if (stored.expiresAt.getTime() > Date.now() + 60_000) {
    return stored.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    client_id: requiredEnv("YAHOO_CLIENT_ID"),
    client_secret: requiredEnv("YAHOO_CLIENT_SECRET"),
    redirect_uri: requiredEnv("YAHOO_REDIRECT_URI"),
  });
  const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // Never echo the body: a token endpoint's error can carry the credential.
    throw new Error(`Yahoo token refresh failed (${response.status}).`);
  }

  return (await response.json()).access_token as string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

type ScoreboardMatchup = {
  week: number;
  teamKeys: [string, string];
  isPlayoffs: boolean;
  status: string;
  winnerTeamKey: string | null;
  categoryWins: Record<string, number>;
  tiedCategories: number;
};

async function fetchWeek(week: number, token: string): Promise<ScoreboardMatchup[]> {
  const response = await fetch(
    `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard;week=${week}?format=json`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(`Yahoo scoreboard week ${week} failed (${response.status}).`);
  }

  const json = await response.json();
  const scoreboard = json.fantasy_content.league[1].scoreboard;
  const collection = scoreboard["0"].matchups;
  const out: ScoreboardMatchup[] = [];

  for (let index = 0; index < Number(collection.count); index += 1) {
    const matchup = collection[String(index)].matchup;
    const teams = matchup["0"].teams;
    const teamKeys = [0, 1].map((slot) => {
      const meta = teams[String(slot)].team[0];
      const key = meta.find(
        (entry: unknown) =>
          typeof entry === "object" && entry !== null && "team_key" in entry,
      )?.team_key;

      if (typeof key !== "string") {
        throw new Error(`Week ${week} matchup ${index} is missing a team_key.`);
      }

      return key;
    }) as [string, string];

    const categoryWins: Record<string, number> = {};
    let tiedCategories = 0;

    for (const entry of matchup.stat_winners ?? []) {
      const winner = entry.stat_winner;

      if (winner.is_tied) {
        tiedCategories += 1;
      } else if (typeof winner.winner_team_key === "string") {
        categoryWins[winner.winner_team_key] =
          (categoryWins[winner.winner_team_key] ?? 0) + 1;
      }
    }

    out.push({
      week,
      teamKeys,
      isPlayoffs: matchup.is_playoffs === "1",
      status: matchup.status,
      winnerTeamKey:
        typeof matchup.winner_team_key === "string" ? matchup.winner_team_key : null,
      categoryWins,
      tiedCategories,
    });
  }

  return out;
}

async function main() {
  const { dryRun, firstWeek, lastWeek } = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const db = createImportDb();

  try {
    const teamRows = await db
      .select({ id: schema.teams.id, yahooTeamKey: schema.teams.yahooTeamKey })
      .from(schema.teams);
    const teamIdByKey = new Map<string, string>();

    for (const team of teamRows) {
      if (team.yahooTeamKey !== null) {
        teamIdByKey.set(team.yahooTeamKey, team.id);
      }
    }

    if (teamIdByKey.size === 0) {
      throw new Error(
        "No teams carry a yahoo_team_key — run scripts/backfill-yahoo-team-keys.ts first.",
      );
    }

    const knownTeamIds = await fetchKnownTeamIds(db);
    const token = await yahooAccessToken(db);
    const rows: (typeof schema.regularSeasonMatchups.$inferInsert)[] = [];
    const seen = new Set<string>();
    const skipped: string[] = [];

    for (let week = firstWeek; week <= lastWeek; week += 1) {
      for (const matchup of await fetchWeek(week, token)) {
        // Only completed REGULAR-season games belong in the head-to-head
        // series; the bowl bracket is scored by this app, not by Yahoo.
        if (matchup.isPlayoffs) {
          skipped.push(`week ${week}: playoff matchup`);
          continue;
        }

        if (matchup.status !== "postevent") {
          skipped.push(`week ${week}: status "${matchup.status}" (not complete)`);
          continue;
        }

        const [keyA, keyB] = matchup.teamKeys;
        const idA = teamIdByKey.get(keyA);
        const idB = teamIdByKey.get(keyB);

        if (idA === undefined || idB === undefined) {
          throw new Error(
            `Week ${week}: no DB team for Yahoo key ${idA === undefined ? keyA : keyB}.`,
          );
        }

        for (const teamId of [idA, idB]) {
          if (!knownTeamIds.has(teamId)) {
            throw new Error(`Week ${week}: unknown team_id "${teamId}".`);
          }
        }

        const winner =
          matchup.winnerTeamKey === null
            ? ("tie" as const)
            : matchup.winnerTeamKey === keyA
              ? ("a" as const)
              : ("b" as const);
        const normalized = normalizeMatchupPair(idA, idB, winner);
        const key = `${week}:${normalized.teamAId}:${normalized.teamBId}`;

        if (seen.has(key)) {
          throw new Error(`Yahoo returned a duplicate matchup: ${key}`);
        }

        seen.add(key);

        // Category counts follow the normalized pair, not Yahoo's ordering.
        const winsByNormalizedA =
          normalized.teamAId === idA
            ? matchup.categoryWins[keyA]
            : matchup.categoryWins[keyB];
        const winsByNormalizedB =
          normalized.teamAId === idA
            ? matchup.categoryWins[keyB]
            : matchup.categoryWins[keyA];

        rows.push({
          week,
          teamAId: normalized.teamAId,
          teamBId: normalized.teamBId,
          winnerTeamId:
            normalized.winner === "tie"
              ? null
              : normalized.winner === "a"
                ? normalized.teamAId
                : normalized.teamBId,
          teamACategoryWins: winsByNormalizedA ?? 0,
          teamBCategoryWins: winsByNormalizedB ?? 0,
          tiedCategories: matchup.tiedCategories,
          source: "yahoo" as const,
          raw: { source: "yahoo_scoreboard", week, teamKeys: matchup.teamKeys },
        });
      }
    }

    if (rows.length === 0) {
      throw new Error(
        `No completed regular-season matchups found in weeks ${firstWeek}-${lastWeek}.`,
      );
    }

    const weeksSeen = [...new Set(rows.map((row) => row.week))].sort((a, b) => a - b);
    console.log(
      `${dryRun ? "[dry-run] " : ""}${rows.length} completed regular-season matchup(s) across weeks ${weeksSeen[0]}-${weeksSeen[weeksSeen.length - 1]}.`,
    );

    if (skipped.length > 0) {
      console.log(`  skipped ${skipped.length}: ${[...new Set(skipped)].join("; ")}`);
    }

    if (dryRun) {
      for (const row of rows.slice(0, 5)) {
        console.log(
          `  wk${row.week} ${row.teamAId} vs ${row.teamBId} -> ${row.winnerTeamId ?? "tie"} (${row.teamACategoryWins}-${row.teamBCategoryWins}-${row.tiedCategories})`,
        );
      }
      console.log("  [dry-run] nothing written.");
    } else {
      await db
        .insert(schema.regularSeasonMatchups)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            schema.regularSeasonMatchups.week,
            schema.regularSeasonMatchups.teamAId,
            schema.regularSeasonMatchups.teamBId,
          ],
          set: {
            winnerTeamId: sql`excluded.winner_team_id`,
            teamACategoryWins: sql`excluded.team_a_category_wins`,
            teamBCategoryWins: sql`excluded.team_b_category_wins`,
            tiedCategories: sql`excluded.tied_categories`,
            source: sql`excluded.source`,
            raw: sql`excluded.raw`,
          },
        });
      console.log(`Wrote ${rows.length} regular-season matchup(s).`);
    }

    await logSyncRun(db, {
      script: "import-regular-season-matchups-yahoo",
      status: "success",
      startedAt,
      rowCount: rows.length,
      dryRun,
    });
  } catch (error) {
    await logSyncRun(db, {
      script: "import-regular-season-matchups-yahoo",
      status: "error",
      startedAt,
      rowCount: 0,
      dryRun,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});

    throw error;
  }
}

runImportScript(main);
