"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * La décision du joueur. `oauthProviderClient` joint la requête signée de la
 * page ; la réponse est l'adresse où renvoyer le navigateur — l'application
 * cliente, avec son code ou avec le refus.
 */
export function ConsentButtons({
  labels,
}: {
  labels: { allow: string; deny: string; error: string };
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function decide(accept: boolean) {
    setPending(true);
    setFailed(false);
    const { data, error } = await authClient.$fetch<{ url?: string }>(
      "/oauth2/consent",
      { method: "POST", body: { accept } },
    );
    if (error || !data?.url) {
      setPending(false);
      setFailed(true);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide(true)}>
          {labels.allow}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => decide(false)}
        >
          {labels.deny}
        </Button>
      </div>
      {failed && <p className="text-sm text-red-300">{labels.error}</p>}
    </div>
  );
}
