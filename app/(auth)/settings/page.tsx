import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AddPasskeyForm } from "./components";

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <>Not authenticated.</>;
  }

  const passKeys = await auth.api.listPasskeys({
    headers: await headers(),
  });

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <h1 className="text-2xl font-bold mb-4">Paramètres</h1>

      <h2 className="text-xl font-semibold">Passkeys/WebAuthN</h2>
      
      {passKeys.length === 0 ? (
        <p>Aucun passkey enregistré.</p>
      ) : (
        <ul className="list-disc list-inside">
          {passKeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between">
              <span>{pk.name}</span>
              <span className="text-sm text-gray-500">
                Enregistré le{" "}
                {new Date(pk.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <AddPasskeyForm />

    </div>
  );
}
