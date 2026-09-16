"use client";

import { PrinterIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

/**
 * Le PDF d'une planche, c'est l'impression du navigateur.
 *
 * Rien à installer, rien à rastériser sur le serveur, et le lecteur garde le
 * choix du format et des marges — ce qu'un PDF fabriqué à sa place lui
 * retirerait.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <PrinterIcon className="size-4" />
      {label}
    </Button>
  );
}
