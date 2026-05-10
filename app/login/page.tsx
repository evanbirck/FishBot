type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  const next = params.next?.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="min-h-screen bg-[#f7f8f3] px-6 py-12 text-[#15201c]">
      <section className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#176b5b] font-bold text-white">F</div>
          <div>
            <p className="text-sm font-bold uppercase text-[#176b5b]">Internal access</p>
            <h1 className="text-2xl font-black tracking-normal">FishBot</h1>
          </div>
        </div>

        <form action="/api/auth/login" method="post" className="rounded-lg border border-[#dbe4de] bg-white p-6 shadow-sm">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-bold text-[#60716b]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 min-h-11 w-full rounded-md border border-[#dbe4de] px-3 outline-none focus:border-[#176b5b] focus:ring-2 focus:ring-[#176b5b]/20"
          />
          {error === "invalid" ? <p className="mt-3 text-sm font-semibold text-[#b42318]">Password is incorrect.</p> : null}
          {error === "missing_config" ? <p className="mt-3 text-sm font-semibold text-[#b42318]">DASHBOARD_PASSWORD is not configured.</p> : null}
          <button className="mt-5 min-h-11 w-full rounded-md bg-[#176b5b] px-4 font-extrabold text-white hover:bg-[#0f4c42]" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
