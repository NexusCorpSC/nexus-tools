export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ [_: string]: string | string[] | undefined }>;
}) {
  const sParams = await searchParams;
  const email = sParams.email || "";
  const token = sParams.token || "";
  const callbackUrl = sParams.callbackUrl ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-[#CCE7FF]">Login</h1>
        <form
          className="space-y-4"
          action="/api/auth/callback/email"
          method="get"
        >
          {!email ? (
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#9ED0FF]/80"
              >
                Email :
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={email}
                className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
                required
              />
            </div>
          ) : (
            <input
              type="hidden"
              id="email"
              name="email"
              defaultValue={email}
              className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
              required
            />
          )}
          <input
            type="hidden"
            id="callbackUrl"
            name="callbackUrl"
            defaultValue={callbackUrl}
            className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
            required
          />
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-[#9ED0FF]/80"
            >
              Code de validation :
            </label>
            <input
              type="text"
              id="token"
              name="token"
              defaultValue={token}
              className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
              required
              pattern="\d{6}"
              maxLength={6}
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-md shadow-sm hover:bg-primary/90 focus:outline-hidden focus:ring-2"
          >
            Valider
          </button>
        </form>
      </div>
    </div>
  );
}
