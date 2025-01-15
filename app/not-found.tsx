import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Wow!</h1>

      <p>
        Vous semblez vous être égaré. Cette page n&apos;existe pas (ou vous
        n&apos;avez pas les droits pour y accéder).
      </p>

      <Button asChild>
        <Link href="/">Retour en territoire cartographié.</Link>
      </Button>
    </div>
  );
}
