import Link from "next/link";

export const dynamic = "force-dynamic";

type OauthDonePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Outcome = {
  ok: boolean;
  heading: string;
  detail: string;
};

const OUTCOMES: Record<string, Outcome> = {
  connected: {
    ok: true,
    heading: "Yahoo connected",
    detail:
      "Access and refresh tokens are stored. The token renews itself, so this is a one-time step.",
  },
  denied: {
    ok: false,
    heading: "Authorization declined",
    detail: "Yahoo reported that the request was not approved. Nothing was stored.",
  },
  state: {
    ok: false,
    heading: "Security check failed",
    detail:
      "The callback did not carry a matching one-time token. Start the connection again from the admin page.",
  },
  code: {
    ok: false,
    heading: "No authorization code",
    detail: "Yahoo redirected back without a code. Start the connection again.",
  },
  exchange: {
    ok: false,
    heading: "Token exchange failed",
    detail:
      "Yahoo rejected the authorization code. The reason was written to the server log.",
  },
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OauthDonePage({ searchParams }: OauthDonePageProps) {
  const params = await searchParams;
  const outcome = OUTCOMES[firstParam(params.status) ?? ""] ?? {
    ok: false,
    heading: "Unknown result",
    detail: "The Yahoo connection returned an unrecognized status.",
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
            Lander&apos;s League Loser Bowl
          </p>
          <h1 className="text-4xl font-black">Yahoo Connection</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          className={`border px-4 py-5 ${
            outcome.ok
              ? "border-emerald-300 bg-emerald-50"
              : "border-rose-300 bg-rose-50"
          }`}
        >
          <h2
            className={`text-2xl font-black ${
              outcome.ok ? "text-emerald-950" : "text-rose-950"
            }`}
          >
            {outcome.heading}
          </h2>
          <p
            className={`mt-2 text-sm font-semibold ${
              outcome.ok ? "text-emerald-950" : "text-rose-950"
            }`}
          >
            {outcome.detail}
          </p>
        </div>

        {/*
          This page exists only so the admin session survives the trip. Landing
          straight on /admin from Yahoo drops the sameSite=strict session cookie:
          the browser withholds it for the whole redirect chain because a
          cross-site page started it, so /admin bounces to the login screen and
          the result message is lost. Reaching /admin from a link on this page
          makes the navigation same-site-initiated, so the cookie is sent.
        */}
        <Link
          href="/admin"
          className="mt-6 inline-flex border border-stone-800 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-stone-800"
        >
          Continue to Admin
        </Link>
      </main>
    </div>
  );
}
