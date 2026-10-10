"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copie un texte (l'adresse du serveur, un extrait de configuration). */
export function CopyButton({
  text,
  label,
  done,
}: {
  text: string;
  label: string;
  done: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? done : label}
    </Button>
  );
}
