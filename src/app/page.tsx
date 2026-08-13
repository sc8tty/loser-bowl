import { headers } from "next/headers";

import { HomePage } from "@/components/home-page";
import { getLeagueData } from "@/lib/sync/trigger";
import { E2E_SCENARIO_HEADER } from "@/lib/testing/e2eFixtures";

export const dynamic = "force-dynamic";
// after()-scheduled syncs inherit this page's duration budget (PRD).
export const maxDuration = 60;

export default async function Home() {
  const e2eScenarioHeader =
    process.env.E2E_TEST_MODE === "true"
      ? (await headers()).get(E2E_SCENARIO_HEADER)
      : null;
  const data = await getLeagueData(e2eScenarioHeader);

  return <HomePage data={data} now={new Date()} />;
}
