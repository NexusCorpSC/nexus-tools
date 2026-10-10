import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";
import { MCP_SCOPES, OIDC_SCOPES } from "@/lib/mcp/oauth-config";
import { ConsentButtons } from "./consent-buttons";

export const metadata: Metadata = {
  title: "Autoriser une application",
  robots: { index: false, follow: false },
};

const KNOWN_SCOPES = new Set<string>([...OIDC_SCOPES, ...MCP_SCOPES]);

/**
 * L'écran de consentement OAuth : un assistant (Claude, ChatGPT…) demande
 * l'accès au compte pour les outils MCP personnels. better-auth y renvoie le
 * joueur connecté avec une requête signée ; on la vérifie avant d'afficher quoi
 * que ce soit, puis le bouton rend la décision (`/oauth2/consent`).
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("OAuthConsent");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined) params.append(key, one);
    }
  }

  const { secret } = await auth.$context;
  const valid = await verifyOAuthQueryParams(params.toString(), secret);
  const session = await auth.api.getSession({ headers: await headers() });
  if (valid && !session) redirect(`/login?${params.toString()}`);

  const clientId = params.get("client_id");
  const client =
    valid && clientId
      ? await auth.api
          .getOAuthClientPublic({
            query: { client_id: clientId },
            headers: await headers(),
          })
          .catch(() => null)
      : null;

  if (!valid || !client || !session) {
    return (
      <div className="m-2 mx-auto max-w-lg rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold">{t("title")}</h1>
        <p>{t("invalid")}</p>
      </div>
    );
  }

  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const name = client.client_name || t("unknownClient");

  return (
    <div className="m-2 mx-auto max-w-lg space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {client.logo_uri && (
          // Le logo vient du client, d'un hôte que `next/image` ne connaît pas.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.logo_uri}
            alt=""
            className="h-12 w-12 rounded-lg border border-[#9ED0FF]/20 object-contain"
          />
        )}
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      <p className="text-[#CCE7FF]">{t("intro", { client: name })}</p>
      {client.client_uri && (
        <p className="text-sm text-[#9ED0FF]/70">
          {t("website")} :{" "}
          <span className="font-mono">{new URL(client.client_uri).host}</span>
        </p>
      )}
      <p className="text-sm text-[#9ED0FF]/70">
        {t("signedInAs", { name: session.user.name })}
      </p>
      <div>
        <p className="font-semibold">{t("requested")}</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[#CCE7FF]">
          {scopes.map((scope) => (
            <li key={scope}>
              {KNOWN_SCOPES.has(scope)
                ? t(`scopes.${scope}` as "scopes.openid")
                : scope}
            </li>
          ))}
        </ul>
      </div>
      <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
        {t("warning")}
      </p>
      <ConsentButtons
        labels={{ allow: t("allow"), deny: t("deny"), error: t("error") }}
      />
    </div>
  );
}
