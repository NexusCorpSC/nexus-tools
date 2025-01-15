import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CraftingPage() {
  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Crafting</h1>

      <p>
        Nous travaillons à créer cette page, et nous attendons d&apos;avoir de
        nouvelles informations sur l&apos;artisanat dans le Verse pour compléter
        cette fonctionnalité.
      </p>

      <Button asChild>
        <Link href="/">Retour à la page principale.</Link>
      </Button>
    </div>
  );
}
