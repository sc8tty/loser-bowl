/**
 * Yahoo team logos for the 2026 Loser Bowl field, read from each team's page
 * in the logged-in league (img[alt="Team logo"]) on 2026-09-07. Yahoo serves
 * these from public CDNs (no login needed; verified with an anonymous fetch),
 * so the site hotlinks them. If one 404s, the card just shows the name.
 * Manual-mode stand-in for the avatar URL the Yahoo API would carry.
 */
export const TEAM_AVATARS: Readonly<Record<string, string>> = {
  "slump-busters": "https://s.yimg.com/cv/apiv2/default/mlb/mlb_1_m.png",
  "eat-the-rich":
    "https://yahoofantasysports-res.cloudinary.com/image/upload/t_s192sq/fantasy-logos/59cb02d1f4404fe78cbda4f2cd9c80a98df91c1e0a302040f9adf547d94aa860.jpg",
  "trouts-honor":
    "https://yahoofantasysports-res.cloudinary.com/image/upload/t_s192sq/fantasy-logos/57242308234_a779f7.png",
  "me-so-hoerner":
    "https://s.yimg.com/ep/cx/blendr/v2/image-yes-png_1721245198616.png",
  "you-hangem-we-bangem":
    "https://s.yimg.com/ep/cx/blendr/v2/image-hot-dog-png_1721245308418.png",
  "sheatriptease-bangeliers":
    "https://yahoofantasysports-res.cloudinary.com/image/upload/t_s192sq/fantasy-logos/b9e08b7c1c6f2ef87384a8a29638ee6fdbfde9b75ae4dfd59057ea417d0ca80a.jpg",
  "springfield-isotopes":
    "https://yahoofantasysports-res.cloudinary.com/image/upload/t_s192sq/fantasy-logos/55933705333_a75222.jpg",
  "baseball-furries":
    "https://s.yimg.com/ep/cx/blendr/v2/image-baseball-1-png_1721239625414.png",
};

export function teamAvatarUrl(teamId: string | null | undefined): string | null {
  return teamId === null || teamId === undefined
    ? null
    : (TEAM_AVATARS[teamId] ?? null);
}
