import { matchupStatusView, type PublicMatchup } from "@/lib/public/matchups";

const badgeToneClasses = {
  stone: "border-stone-400 bg-stone-50 text-stone-700",
  rose: "border-rose-700 bg-rose-50 text-rose-900",
  amber: "border-amber-600 bg-amber-50 text-amber-900",
  emerald: "border-emerald-700 bg-emerald-50 text-emerald-900",
};

export function StatusBadge({
  matchup,
  upstreamUnderReview = false,
}: {
  matchup: Pick<PublicMatchup, "status"> &
    Partial<Pick<PublicMatchup, "computedTally" | "liveTally">>;
  upstreamUnderReview?: boolean;
}) {
  const status = matchupStatusView(matchup, upstreamUnderReview);

  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-black uppercase ${badgeToneClasses[status.tone]}`}
    >
      {status.label}
    </span>
  );
}
