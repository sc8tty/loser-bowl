export type StatCategory = {
  slug: string;
  display_name: string;
  sort_order: "asc" | "desc";
  is_only_display_stat: boolean;
  required_support_stats: string[];
  yahoo_stat_id: string | null;
};

export const SEEDED_LEAGUE_SETTINGS_NOTE =
  "Confirmed against the live Yahoo league's Scoring & Settings page 2026-09-07 (Scott, via Claude Browser) — 15 categories, min IP 24/week. OPS, ERA, WHIP, and K/9 are all transcribed as Yahoo reports them (not derived), per Scott's call 2026-09-07: Yahoo's team/player pages never expose earned runs allowed or hits allowed as raw counts (only the already-computed ratios), so there's no clean source to derive ERA/WHIP from, and OPS needs three fields (batter BB, HBP, SF) not shown anywhere on the standings/team pages either.";

export const SEEDED_STAT_CATEGORIES = [
  {
    slug: "r",
    display_name: "R",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "2b",
    display_name: "2B",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "3b",
    display_name: "3B",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "hr",
    display_name: "HR",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "rbi",
    display_name: "RBI",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "sb",
    display_name: "SB",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "avg",
    display_name: "AVG",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: ["at_bats", "batting_hits"],
    yahoo_stat_id: null,
  },
  {
    // Trusted as transcribed from Yahoo, not derived — see SEEDED_LEAGUE_SETTINGS_NOTE.
    slug: "ops",
    display_name: "OPS",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "w",
    display_name: "W",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "bb",
    display_name: "BB",
    sort_order: "asc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "k",
    display_name: "K",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    // Trusted as transcribed from Yahoo, not derived — see SEEDED_LEAGUE_SETTINGS_NOTE.
    slug: "era",
    display_name: "ERA",
    sort_order: "asc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    // Trusted as transcribed from Yahoo, not derived — see SEEDED_LEAGUE_SETTINGS_NOTE.
    slug: "whip",
    display_name: "WHIP",
    sort_order: "asc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    // Trusted as transcribed from Yahoo, not derived — see SEEDED_LEAGUE_SETTINGS_NOTE.
    slug: "k9",
    display_name: "K/9",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "nsvh",
    display_name: "NSVH",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "at_bats",
    display_name: "AB",
    sort_order: "desc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "batting_hits",
    display_name: "H",
    sort_order: "desc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    // Kept for the min-innings-pitched policy check only — ERA/WHIP/K9 no
    // longer derive from it (see SEEDED_LEAGUE_SETTINGS_NOTE).
    slug: "innings_pitched",
    display_name: "IP",
    sort_order: "desc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
] as const satisfies readonly StatCategory[];

export const SEEDED_LEAGUE_SETTINGS = {
  season: 2026,
  statCategories: SEEDED_STAT_CATEGORIES,
  minInningsPitched: 24,
  playoffStartWeek: 24,
  source: "seed",
  version: 1,
} as const;
