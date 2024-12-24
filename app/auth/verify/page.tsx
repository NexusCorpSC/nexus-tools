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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form
          className="space-y-4"
          action="/api/auth/callback/email"
          method="get"
        >
          {!email ? (
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email :
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={email}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
          ) : (
            <input
              type="hidden"
              id="email"
              name="email"
              defaultValue={email}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          )}
          <input
            type="hidden"
            id="callbackUrl"
            name="callbackUrl"
            defaultValue={callbackUrl}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-gray-700"
            >
              Code de validation :
            </label>
            <input
              type="text"
              id="token"
              name="token"
              defaultValue={token}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              pattern="\d{6}"
              maxLength={6}
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-md shadow hover:bg-primary/90 focus:outline-none focus:ring-2"
          >
            Valider
          </button>
        </form>
      </div>
    </div>
  );
}
