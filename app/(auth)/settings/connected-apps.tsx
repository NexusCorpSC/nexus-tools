import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { RevokeConnectedAppButton } from "./components";

/**
 * Les applications que le joueur a autorisées par OAuth (assistants branchés
 * sur le serveur MCP), avec les accès accordés et de quoi les retirer.
 */
export async function ConnectedApps() {
  const t = await getTranslations("ConnectedApps");
  const tScopes = await getTranslations("OAuthConsent.scopes");
  const locale = await getLocale();
  const requestHeaders = await headers();

  const consents = await auth.api
    .getOAuthConsents({ headers: requestHeaders })
    .catch(() => []);
  const apps = await Promise.all(
    consents.map(async (consent) => {
      const client = await auth.api
        .getOAuthClientPublic({
          query: { client_id: consent.clientId },
          headers: requestHeaders,
        })
        .catch(() => null);
      return { consent, name: client?.client_name || consent.clientId };
    }),
  );

  const scopeLabel = (scope: string) =>
    tScopes.has(scope) ? tScopes(scope) : scope;

  return (
    <section className="space-y-2">
      <h2 id="applications" className="scroll-mt-20 pt-4 text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-[#9ED0FF]/70">{t("intro")}</p>
      {apps.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {apps.map(({ consent, name }) => (
            <li
              key={consent.id}
              className="flex flex-col gap-2 rounded-lg border border-[#9ED0FF]/15 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{name}</p>
                <p className="text-sm text-[#9ED0FF]/70">
                  {t("since", {
                    date: new Date(consent.createdAt).toLocaleDateString(
                      locale,
                    ),
                  })}
                </p>
                <p className="text-sm text-[#9ED0FF]/70">
                  {t("scopes", {
                    scopes: consent.scopes.map(scopeLabel).join(", "),
                  })}
                </p>
              </div>
              <RevokeConnectedAppButton consentId={consent.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
