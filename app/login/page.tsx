"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Où revenir après la connexion : un chemin du site, jamais une autre origine.
 */
function safeCallbackUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function Login() {
  const sParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(sParams.get("callbackUrl"));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();

  // Venue d'un assistant (connexion OAuth du serveur MCP) : la page porte la
  // requête signée d'autorisation, que le plugin client joint à la connexion.
  const oauthQuery = sParams.has("sig") ? sParams.toString() : null;

  /**
   * Après une connexion lancée par une autorisation OAuth, better-auth répond
   * par la suite de l'autorisation (`{ redirect, url }`) : le consentement, ou
   * directement l'assistant si le joueur l'a déjà autorisé.
   */
  function continueAfterSignIn(data: unknown) {
    const next = data as { redirect?: boolean; url?: string } | null;
    if (oauthQuery && next?.redirect && next.url) {
      window.location.assign(next.url);
    } else {
      goBack();
    }
  }

  function goBack() {
    // La connexion de Nexus App finit par une redirection vers l'application,
    // hors du site : une navigation complète, que le routeur ne ferait pas.
    if (callbackUrl.startsWith("/desktop/")) {
      window.location.assign(callbackUrl);
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col space-y-4 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-[#CCE7FF]">
          Login
        </h1>
        {emailSent ? (
          <form
            className="space-y-4"
            action={async (formData) => {
              const { data, error } = await authClient.signIn.emailOtp({
                email,
                otp: code,
              });

              if (!error) continueAfterSignIn(data);
            }}
          >
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
                className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-[#9ED0FF]/80"
              >
                Code :
              </label>
              <input
                type="text"
                id="otp"
                name="otp"
                className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <div className="mt-2 text-xs text-[#9ED0FF]/60">
              <p>
                Note: Votre adresse email ne sera utilisée que pour
                l&apos;authentification sur ce site et ne sera pas partagée avec
                des tiers. Vous pouvez demander la suppression de vos données à
                tout moment.
              </p>
            </div>

            <Button type="submit">Valider le code</Button>

            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await authClient.emailOtp.sendVerificationOtp({
                  email,
                  type: "sign-in",
                });
              }}
            >
              Renvoyer un code
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            action={async (formData) => {
              await authClient.emailOtp.sendVerificationOtp({
                email,
                type: "sign-in",
              });
              setEmailSent(true);
            }}
          >
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
                className="mt-1 block w-full rounded-md border border-[#9ED0FF]/25 bg-[#06243A]/70 px-3 py-2 text-[#CCE7FF] shadow-xs placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/45 focus:outline-hidden focus:ring-[#9ED0FF]/50 sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mt-2 text-xs text-[#9ED0FF]/60">
              <p>
                Note: Votre adresse email ne sera utilisée que pour
                l&apos;authentification sur ce site et ne sera pas partagée avec
                des tiers. Vous pouvez demander la suppression de vos données à
                tout moment.
              </p>
            </div>

            <Button type="submit" className="w-full">
              Envoyer le code de connexion
            </Button>
          </form>
        )}

        <Button
          className="w-full"
          onClick={async () => {
            await authClient.signIn.social({
              provider: "discord",
              // Discord ramène sur le site sans la suite de l'autorisation :
              // on repasse alors par l'écran de consentement, qui la reprend.
              callbackURL: oauthQuery
                ? `/oauth/consent?${oauthQuery}`
                : callbackUrl,
            });
          }}
        >
          Login with Discord
        </Button>

        <Button
          className="w-full"
          onClick={async () => {
            await authClient.signIn.passkey({
              fetchOptions: {
                onSuccess(ctx) {
                  continueAfterSignIn(ctx.data);
                },
              },
            });
          }}
        >
          Utiliser WebAuthN/PassKey
        </Button>
      </div>
    </div>
  );
}
