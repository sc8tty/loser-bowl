import { notFound } from "next/navigation";

import { MatchupDetailView } from "@/components/matchup-detail";
import { getMatchupDetailData } from "@/lib/sync/trigger";

export const dynamic = "force-dynamic";
// after()-scheduled syncs inherit this page's duration budget (PRD).
export const maxDuration = 60;

type MatchupPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchupPage({ params }: MatchupPageProps) {
  const { id } = await params;
  const data = await getMatchupDetailData(id);

  if (data.status === "unknown_matchup") {
    notFound();
  }

  return <MatchupDetailView data={data} />;
}
