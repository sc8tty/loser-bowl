import { HomePage } from "@/components/home-page";
import { getLeagueData } from "@/lib/sync/trigger";

export const dynamic = "force-dynamic";
// after()-scheduled syncs inherit this page's duration budget (PRD).
export const maxDuration = 60;

export default async function Home() {
  const data = await getLeagueData();

  return <HomePage data={data} now={new Date()} />;
}
