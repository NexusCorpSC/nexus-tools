import { signIn } from "@/auth";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ [_: string]: string | string[] | undefined }>;
}) {
  const sParams = await searchParams;
  const callbackUrl = (sParams.callbackUrl as string) ?? "";

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form
          className="space-y-4"
          action={async (formData) => {
            "use server";

            await signIn("email", {
              email: formData.get("email"),
              redirectTo: callbackUrl,
            });
          }}
        >
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            <p>Note: Votre adresse email ne sera utilisée que pour l&apos;authentification sur ce site et ne sera pas partagée avec des tiers. Vous pouvez demander la suppression de vos données à tout moment.</p>
          </div>
          
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-md shadow hover:bg-primary/90 focus:outline-none focus:ring-2"
          >
            Envoyer le code de connexion
          </button>
        </form>
      </div>
    </div>
  );
}
