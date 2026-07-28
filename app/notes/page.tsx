import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { getUserNote } from "@/lib/notes";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NoteEditor } from "@/components/note-editor";

export const metadata: Metadata = {
  title: "Bloc-notes",
  description:
    "Prenez des notes en ligne et retrouvez-les sur tous vos appareils : routes de minage, prix, plans de mission et check-lists Star Citizen.",
  openGraph: {
    title: "Bloc-notes — Nexus Tools",
    description:
      "Un bloc-notes en ligne pour garder vos notes Star Citizen à portée de main.",
    url: "https://tools.services.nexus/notes",
  },
};

export default async function NotesPage() {
  const t = await getTranslations("Notes");

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold">{t("title")}</h1>

        <p>{t("connectToUse")}</p>

        <Button asChild>
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  const note = await getUserNote(new ObjectId(session.user.id));

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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

      <h1 className="mb-4 text-2xl font-bold">{t("title")}</h1>

      <p className="text-sm text-[#9ED0FF]/70">
        {t("instructions")} {t("shortcutHint", { shortcut: t("shortcut") })}
      </p>

      <NoteEditor initialNote={note} className="min-h-[32rem]" />
    </div>
  );
}
