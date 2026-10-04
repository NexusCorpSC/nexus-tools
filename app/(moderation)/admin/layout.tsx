import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";

/**
 * L'accueil de l'admin et la modération des contributions et signalements :
 * ouverts aux admins et aux modérateurs (`contributions:review`). Le reste de
 * l'admin, sous `app/admin`, garde son contrôle réservé aux admins.
 */
export default async function ModerationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
          <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">
            Accès refusé
          </h1>
          <p className="mb-6 text-[#9ED0FF]/70">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette
            page.
          </p>
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
