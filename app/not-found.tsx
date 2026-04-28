import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
