"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  revokeConnectedAppAction,
  setLeaderboardHiddenAction,
} from "./actions";

export function AddPasskeyForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await authClient.passkey.addPasskey({ name: name.trim() });
      toast.success("Passkey ajoutée avec succès.");
      setName("");
    } catch {
      toast.error("Erreur lors de l'ajout de la passkey.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <Input
        placeholder="Nom de la passkey"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        required
      />
      <Button type="submit" disabled={loading || !name.trim()}>
        {loading ? "Ajout..." : "Ajouter"}
      </Button>
    </form>
  );
}

/** La case « Masquer mon nom du classement », enregistrée dès qu'on la coche. */
export function LeaderboardVisibilityToggle({
  initialHidden,
}: {
  initialHidden: boolean;
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setHidden(next);
    startTransition(async () => {
      try {
        await setLeaderboardHiddenAction(next);
        toast.success(
          next
            ? "Votre nom n'apparaît plus dans le classement."
            : "Votre nom apparaît de nouveau dans le classement.",
        );
      } catch {
        setHidden(!next);
        toast.error("L'enregistrement a échoué. Réessayez.");
      }
    });
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={hidden}
        disabled={pending}
        onChange={(event) => toggle(event.target.checked)}
        className="mt-0.5 size-4 accent-[#9ED0FF]"
      />
      <span>
        Masquer mon nom du classement des contributeurs
        <small className="mt-0.5 block text-xs text-muted-foreground">
          Vos points restent comptés, et continuent de compter dans ceux de vos
          organisations.
        </small>
      </span>
    </label>
  );
}

export function RevokeConnectedAppButton({ consentId }: { consentId: string }) {
  const t = useTranslations("ConnectedApps");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await revokeConnectedAppAction(consentId);
          toast.success(t("revoked"));
        })
      }
    >
      {t("revoke")}
    </Button>
  );
}
