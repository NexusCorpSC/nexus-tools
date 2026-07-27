import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listCargoShips } from "@/lib/cargo-ships";
import ShipsManager from "./components/ships-manager";

export const metadata: Metadata = {
  title: "Admin — Vaisseaux cargo",
  description:
    "Gestion des vaisseaux proposés sur la feuille de route cargo Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function AdminCargoShipsPage() {
  const ships = await listCargoShips();

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">Vaisseaux cargo</h1>
          <p className="mt-1 text-[#9ED0FF]/70">
            Les vaisseaux enregistrés ici alimentent le sélecteur de transport
            de la feuille de route{" "}
            <Link href="/industry/cargo" className="underline">
              /industry/cargo
            </Link>
            .
          </p>
        </div>

        <ShipsManager ships={ships} usesDefaults={ships.length === 0} />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">Retour à l&apos;administration</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
