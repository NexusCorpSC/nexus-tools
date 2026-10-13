import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getPrivatePlace, myOrgOptions } from "@/lib/private-places";
import { PrivatePlaceForm } from "../../prives/private-place-form";
import { PlaceBreadcrumb } from "../sections";

export const metadata: Metadata = {
  title: "Modifier un lieu privé",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Modifier un lieu privé, par son créateur. Un lieu du catalogue se corrige
 * par une contribution (`/lieux/{slug}/contribuer`), pas ici.
 */
export default async function EditPrivatePlacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/lieux/${slug}/modifier`)}`,
    );
  }
  const place = await getPrivatePlace(session.user.id, slug);
  if (!place) notFound();
  if (!place.isOwner) redirect(`/lieux/${slug}`);
  const [orgs, t] = await Promise.all([
    myOrgOptions(session.user.id),
    getTranslations("PrivatePlaces"),
  ]);

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb
        ancestors={[
          ...place.ancestors,
          { slug: place.slug, name: place.name, type: place.type },
        ]}
        name={t("editTitle")}
      />
      <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
      <PrivatePlaceForm place={place} orgs={orgs} />
    </div>
  );
}
