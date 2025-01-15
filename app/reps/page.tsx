import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DevelopersPage() {
  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Réputation</h1>

      <p>En cours de développement.</p>

      <Button asChild>
        <Link href="/">Retour à la page principale.</Link>
      </Button>
    </div>
  );
}
