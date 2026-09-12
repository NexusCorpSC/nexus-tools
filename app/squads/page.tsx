import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { currentSquadView } from "@/lib/squad-view";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SquadBoard } from "./squad-board";

export const metadata: Metadata = {
  title: "Escouade",
  description:
    "Votre escouade Star Citizen en temps réel : qui est prêt, qui est à terre, qui tient quel rôle — et le raid qui regroupe plusieurs escouades.",
  openGraph: {
    title: "Escouade — Nexus Tools",
    description:
      "Tenez l'état de votre escouade et de votre raid, depuis le site comme depuis Nexus App.",
    url: "https://tools.services.nexus/squads",
  },
};

/**
 * The squad, on the site — the same one the desktop overlay draws over the
 * game, for whoever is on a phone in the hangar or on a second screen.
 *
 * The first view is rendered here, server-side, so the roster is on screen
 * before the first poll; everything after that is the client's, against the
 * same `/api/squads` routes the overlay uses.
 */
export default async function SquadsPage() {
  const t = await getTranslations("Squads");

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return (
      <div className="m-2 mx-auto max-w-3xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
        <h1 className="mb-4 text-2xl font-bold">{t("title")}</h1>

        <p>{t("connectToUse")}</p>

        <Button asChild>
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  const view = await currentSquadView(session.user.id, null);

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <SquadBoard initialView={view} userId={session.user.id} />
    </div>
  );
}
