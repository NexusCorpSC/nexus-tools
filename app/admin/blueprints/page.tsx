import { Button } from "@/components/ui/button";

export default function AdminBlueprintsPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">Blueprints</h1>
        <p className="mb-6 text-[#9ED0FF]/70">
          Exportez tous les blueprints de la base de données au format CSV.
        </p>
        <Button asChild>
          <a href="/api/admin/blueprints/export" download>
            Télécharger en CSV
          </a>
        </Button>
      </div>
    </div>
  );
}
