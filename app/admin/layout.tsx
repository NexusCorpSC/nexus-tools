import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await isAdmin())) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
          <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">Accès refusé</h1>
          <p className="mb-6 text-[#9ED0FF]/70">
            Vous n'avez pas les permissions nécessaires pour accéder à cette
            page.
          </p>
          <Button asChild>
            <Link href="/">Retour à l'accueil</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
