import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { countPendingContributions } from "@/lib/contributions";

export const metadata: Metadata = {
  title: "Administration",
  description: "Interface d'administration de Nexus Tools.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const pending = await countPendingContributions();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">
          Bienvenue dans l&apos;Admin
        </h1>
        <p className="mb-6 text-[#9ED0FF]/70">
          Utilisez le menu pour naviguer entre les différentes sections de
          l&apos;administration.
        </p>

        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/admin/contributions" className="w-full">
              Relire les contributions
              {pending > 0 && (
                <span className="rounded-full bg-amber-300 px-2 font-mono text-xs font-bold text-amber-950">
                  {pending}
                </span>
              )}
            </Link>
          </Button>

          <Button asChild>
            <Link href="/admin/blueprints" className="w-full">
              Gérer les Blueprints
            </Link>
          </Button>

          <Button asChild>
            <Link href="/admin/items" className="w-full">
              Gérer les objets
            </Link>
          </Button>

          <Button asChild>
            <Link href="/admin/lieux" className="w-full">
              Gérer les lieux
            </Link>
          </Button>

          <Button asChild>
            <Link href="/admin/cargo-ships" className="w-full">
              Gérer les vaisseaux cargo
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
