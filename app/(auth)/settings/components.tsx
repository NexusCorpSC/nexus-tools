"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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
