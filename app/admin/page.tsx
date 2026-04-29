import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">Bienvenue dans l&apos;Admin</h1>
        <p className="mb-6 text-[#9ED0FF]/70">
          Utilisez le menu pour naviguer entre les différentes sections de
          l&apos;administration.
        </p>

        <Button asChild>
          <Link href="/admin/blueprints" className="w-full">
            Gérer les Blueprints
          </Link>
        </Button>
      </div>
    </div>
  );
}
