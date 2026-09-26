import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isPkceValue, issueDesktopCode } from "@/lib/desktop-auth";

export const metadata: Metadata = {
  title: "Connexion de Nexus App",
  description: "Connectez l'application Nexus App à votre compte Nexus Tools.",
  robots: { index: false, follow: false },
};

/** Ce que l'application renvoie tel quel pour reconnaître sa demande. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parsePort(value: string | undefined): number | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const port = Number(value);
  return port >= 1024 && port <= 65535 ? port : null;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Point d'entrée de la connexion de Nexus App (voir `lib/desktop-auth.ts`).
 *
 * Connecté, l'utilisateur est aussitôt renvoyé vers l'application ; sinon, il
 * passe par la page de connexion, qui le ramène ici.
 *
 * La redirection ne va jamais qu'à la boucle locale : un lien vers cette page
 * ne peut envoyer le code nulle part ailleurs que sur la machine de celui qui
 * clique.
 */
export default async function DesktopConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ [_: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const port = parsePort(first(params.port));
  const state = first(params.state);
  const challenge = first(params.challenge);

  if (!port || !state || !STATE_PATTERN.test(state) || !isPkceValue(challenge)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
          <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">
            Lien invalide
          </h1>
          <p className="text-sm text-[#9ED0FF]/80">
            Relancez la connexion depuis l&apos;application Nexus App.
          </p>
        </div>
      </div>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    const back = `/desktop/connect?${new URLSearchParams({
      port: String(port),
      state,
      challenge,
    })}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const code = await issueDesktopCode(
    await auth.$context,
    session.user.id,
    challenge,
  );

  redirect(
    `http://127.0.0.1:${port}/callback?${new URLSearchParams({ code, state })}`,
  );
}
