export type StatCategory = {
  slug: string;
  display_name: string;
  sort_order: "asc" | "desc";
  is_only_display_stat: boolean;
  required_support_stats: string[];
  yahoo_stat_id: string | null;
};

export const SEEDED_LEAGUE_SETTINGS_NOTE =
  "Issue 1A placeholder pending real Yahoo league settings; do not treat as a verified league snapshot.";

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
    slug: "w",
    display_name: "W",
    sort_order: "desc",
    is_only_display_stat: false,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "sv",
    display_name: "SV",
    sort_order: "desc",
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
    slug: "era",
    display_name: "ERA",
    sort_order: "asc",
    is_only_display_stat: false,
    required_support_stats: ["earned_runs_allowed", "innings_pitched"],
    yahoo_stat_id: null,
  },
  {
    slug: "whip",
    display_name: "WHIP",
    sort_order: "asc",
    is_only_display_stat: false,
    required_support_stats: [
      "hits_allowed",
      "walks_allowed",
      "innings_pitched",
    ],
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
    slug: "earned_runs_allowed",
    display_name: "ER",
    sort_order: "asc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "hits_allowed",
    display_name: "HA",
    sort_order: "asc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
    slug: "walks_allowed",
    display_name: "BBA",
    sort_order: "asc",
    is_only_display_stat: true,
    required_support_stats: [],
    yahoo_stat_id: null,
  },
  {
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
  minInningsPitched: null,
  playoffStartWeek: 23,
  source: "seed",
  version: 1,
} as const;
