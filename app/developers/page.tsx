import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DevelopersPage() {
  return (
    <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <h1 className="text-2xl font-bold mb-4">Développeurs</h1>

      <p>
        Vous êtes développeur ? Votre avis nous intéresse ! Nous essayons de
        créer une boîte à outils la plus accessible et la plus modulaire
        possible et nous voulons que des développeurs puissent l&apos;utiliser
        et l&apos;intégrer facilement. Contactez-nous pour nous aider à la
        mettre en place en nous faisant part de vos besoins !
      </p>

      <Button asChild>
        <Link href="/">Retour à la page principale.</Link>
      </Button>
    </div>
  );
}
