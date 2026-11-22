import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listStoredRadarSignatures } from "@/lib/radar-signatures";
import SignaturesManager from "./components/signatures-manager";

export const metadata: Metadata = {
  title: "Admin — Signatures radar",
  description:
    "Gestion des signatures radar connues que compare le scanner de Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function AdminRadarSignaturesPage() {
  const signatures = await listStoredRadarSignatures();

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">
            Signatures radar
          </h1>
          <p className="mt-1 text-[#9ED0FF]/70">
            La signature d&apos;un seul élément (rocher, astéroïde, panneau
            d&apos;épave) : le scanner du site{" "}
            <Link href="/industry/radar" className="underline">
              /industry/radar
            </Link>
            , celui de l&apos;app et l&apos;outil MCP cherchent les multiples de
            ces valeurs. À corriger ici quand un patch du jeu les change.
          </p>
        </div>

        <SignaturesManager
          signatures={signatures}
          usesDefaults={signatures.length === 0}
        />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">Retour à l&apos;administration</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
