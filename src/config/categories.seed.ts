export type StatCategory = {
  slug: string;
  display_name: string;
  sort_order: "asc" | "desc";
  is_only_display_stat: boolean;
  required_support_stats: string[];
  yahoo_stat_id: string | null;
};

export const SEEDED_LEAGUE_SETTINGS_NOTE =
  "Confirmed against the live Yahoo league's Scoring & Settings page 2026-09-07 (Scott, via Claude Browser) — 15 categories, min IP 24/week. OPS, ERA, WHIP, and K/9 are all transcribed into the CSV rather than computed by the import script itself — the parser trusts whatever value is in the era/whip/k9/ops columns. CORRECTED 2026-09-08 (Scott caught this): that does NOT mean the week's cumulative ERA/WHIP/K9 has to be 'whatever Yahoo showed for the most recent day,' as this note originally claimed on 2026-09-07 — only OPS is genuinely stuck that way, since it needs batter BB/HBP/SF that Yahoo never exposes even indirectly. ERA and WHIP CAN be reconstructed across every day pulled so far: each day's Yahoo-reported ratio plus that day's innings pitched is one equation with exactly one unknown (that day's earned runs / hits allowed), so summing the derived numerators across days and dividing by total innings gives a mathematically exact cumulative ratio — equivalently, an innings-weighted average of each day's ratio (see docs/status.md, 'THE established daily procedure', step 4). K/9 needs none of this trickery — K and innings pitched are both already exact tracked counting stats, so the cumulative K/9 is just K_total*9/IP_total.";

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
