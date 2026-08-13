import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { MatchupDetailView } from "@/components/matchup-detail";
import { getMatchupDetailData } from "@/lib/sync/trigger";
import { E2E_SCENARIO_HEADER } from "@/lib/testing/e2eFixtures";

export const dynamic = "force-dynamic";
// after()-scheduled syncs inherit this page's duration budget (PRD).
export const maxDuration = 60;

type MatchupPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchupPage({ params }: MatchupPageProps) {
  const { id } = await params;
  const e2eScenarioHeader =
    process.env.E2E_TEST_MODE === "true"
      ? (await headers()).get(E2E_SCENARIO_HEADER)
      : null;
  const data = await getMatchupDetailData(id, e2eScenarioHeader);

  if (data.status === "unknown_matchup") {
    notFound();
  }

  return <MatchupDetailView data={data} />;
}
