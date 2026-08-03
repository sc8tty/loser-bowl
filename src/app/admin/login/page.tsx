import { redirect } from "next/navigation";

import { isAdminCookieAuthenticated } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined): string {
  if (
    value === undefined ||
    !value.startsWith("/admin") ||
    value.startsWith("/admin/login") ||
    value.startsWith("//")
  ) {
    return "/admin";
  }

  return value;
}

function loginMessage(error: string | undefined): string | null {
  switch (error) {
    case "invalid":
      return "Password did not match.";
    case "throttled":
      return "Too many attempts. Try again in a few minutes.";
    case "csrf":
      return "That login request did not pass the Origin check.";
    case "config":
      return "Admin login is not configured yet.";
    case "expired":
      return "Session expired. Sign in again.";
    default:
      return null;
  }
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  if (await isAdminCookieAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;
  const error = firstParam(params.error);
  const next = safeNextPath(firstParam(params.next));
  const message = loginMessage(error);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
            Scott only
          </p>
          <h1 className="text-4xl font-black">Loser Bowl Admin</h1>
        </div>
      </header>
      <main className="mx-auto flex min-h-[58vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="w-full border border-stone-300 bg-white px-5 py-6">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase text-rose-800">
              Password gate
            </p>
            <h2 className="text-2xl font-black">Sign in</h2>
          </div>
          {message ? (
            <div className="mb-5 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
              {message}
            </div>
          ) : null}
          <form action="/api/admin/login" method="post" className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-stone-700">
                Admin password
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full border border-stone-400 bg-stone-50 px-3 py-3 text-base font-semibold text-stone-950 outline-none focus:border-rose-700 focus:bg-white"
              />
            </label>
            <button
              type="submit"
              className="inline-flex border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-rose-900"
            >
              Enter admin
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
