import Link from "next/link";

import { YahooFooter } from "@/components/home-page";

export default function MatchupNotFound() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
            Lander&apos;s League Loser Bowl
          </p>
          <h1 className="text-4xl font-black">Matchup Not Found</h1>
        </div>
      </header>
      <main>
        <section className="bg-stone-100">
          <div className="mx-auto flex min-h-[52vh] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
            <div className="w-full border border-dashed border-stone-400 bg-white px-5 py-10 text-center">
              <p className="mb-2 text-sm font-semibold uppercase text-rose-800">
                Unknown matchup
              </p>
              <h2 className="text-2xl font-black text-stone-950">
                That bracket slot does not exist.
              </h2>
              <Link
                href="/"
                className="mt-5 inline-flex border border-stone-950 px-3 py-2 text-sm font-black uppercase text-stone-950 hover:bg-stone-950 hover:text-white"
              >
                Back home
              </Link>
            </div>
          </div>
        </section>
      </main>
      <YahooFooter />
    </div>
  );
}
