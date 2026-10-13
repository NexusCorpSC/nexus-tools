import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listMarkerSystems, listMarkers } from "@/lib/markers";
import { MarkersView } from "./markers-view";

export const metadata: Metadata = {
  title: "Mes marqueurs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Les marqueurs du joueur : des positions relevées en jeu pour y revenir,
 * rangées en collections. L'app les crée d'un geste depuis le NPS ; ici on
 * les range, on les partage par collection et on en ajoute en collant un
 * relevé.
 */
export default async function MarkersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/marqueurs")}`);
  }
  const [data, systems] = await Promise.all([
    listMarkers(session.user.id),
    listMarkerSystems(),
  ]);
  return <MarkersView initial={data} systems={systems} />;
}
