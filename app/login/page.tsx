"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const sParams = useSearchParams();
  const callbackUrl = sParams.get("callbackUrl");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        {emailSent ? (
          <form
            className="space-y-4"
            action={async (formData) => {
              await authClient.signIn.emailOtp({
                email,
                otp: code,
              });

              if (callbackUrl) {
                router.push(callbackUrl);
              } else {
                router.push("/");
              }
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-gray-700"
              >
                Code :
              </label>
              <input
                type="text"
                id="otp"
                name="otp"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <div className="mt-2 text-xs text-gray-500">
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
                className="block text-sm font-medium text-gray-700"
              >
                Email :
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mt-2 text-xs text-gray-500">
              <p>
                Note: Votre adresse email ne sera utilisée que pour
                l&apos;authentification sur ce site et ne sera pas partagée avec
                des tiers. Vous pouvez demander la suppression de vos données à
                tout moment.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-md shadow-sm hover:bg-primary/90 focus:outline-hidden focus:ring-2"
            >
              Envoyer le code de connexion
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
