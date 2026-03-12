import { Button } from "@/components/ui/button";

export default function AdminBlueprintsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4">Blueprints</h1>
        <p className="text-gray-600 mb-6">
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
