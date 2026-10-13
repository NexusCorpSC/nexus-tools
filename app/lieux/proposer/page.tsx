import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPlaceBySlug } from "@/lib/places";
import { getMarker } from "@/lib/markers";
import { myOrgOptions } from "@/lib/private-places";
import { PlaceForm } from "@/app/admin/lieux/components/place-form";
import { ContributionNotice } from "@/app/contributions/notice";
import { requireContributor } from "@/app/contributions/session";
import { PlaceBreadcrumb } from "../[slug]/sections";
import { AddPlaceChoice } from "../prives/add-place-choice";
import { PrivatePlaceForm } from "../prives/private-place-form";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";

export const metadata: Metadata = {
  title: "Ajouter un lieu",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Ajouter un lieu, depuis la liste des lieux : public, c'est proposer un lieu
 * qui manque au catalogue, le pendant de « Proposer un objet » ; privé, c'est
 * un lieu à soi et à une organisation (`lib/private-places.ts`). Le parent se
 * choisit dans le formulaire (`?parent=` le préremplit) ; `?prive=1` ouvre sur
 * le lieu privé, et `?emplacement=` complète un emplacement de l'inventaire.
 */
export default async function ProposeAnyPlacePage({
  searchParams,
}: {
  searchParams: Promise<{
    parent?: string;
    prive?: string;
    emplacement?: string;
    nom?: string;
    marqueur?: string;
  }>;
}) {
  const {
    parent: requestedParent,
    prive,
    emplacement,
    nom,
    marqueur,
  } = await searchParams;
  const query = new URLSearchParams();
  if (requestedParent) query.set("parent", requestedParent);
  if (prive) query.set("prive", prive);
  if (emplacement) query.set("emplacement", emplacement);
  if (nom) query.set("nom", nom);
  if (marqueur) query.set("marqueur", marqueur);
  const { userId, standing } = await requireContributor(
    `/lieux/proposer${query.size ? `?${query}` : ""}`,
  );

  // Un marqueur qui devient un lieu privé : son corps (ou son système) pour
  // parent, sa position, sa note pour description.
  const marker = marqueur ? await getMarker(String(userId), marqueur) : null;
  const fromMarker = marker?.isOwner ? marker : null;
  const parentSlug =
    requestedParent ?? fromMarker?.bodySlug ?? fromMarker?.systemSlug;
  const found = parentSlug ? await getPlaceBySlug(parentSlug) : null;
  // Un magasin ne contient pas d'autre lieu : on laisse alors choisir.
  const parent = found?.type === "shop" ? null : found;
  const parentSystemSlug =
    parent?.type === "star" ? parent.slug : parent?.systemSlug;
  const [t, tPrivate, orgs] = await Promise.all([
    getTranslations("Contributions.Form"),
    getTranslations("PrivatePlaces"),
    myOrgOptions(String(userId)),
  ]);

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb ancestors={[]} name={tPrivate("addTitle")} />
      <h1 className="text-2xl font-bold">{tPrivate("addTitle")}</h1>

      <AddPlaceChoice
        points={POINTS.placeCreate}
        initial={prive || emplacement || fromMarker ? "private" : "public"}
        publicPart={
          <div className="space-y-5">
            <div className="space-y-2">
              <ContributionNotice
                standing={standing}
                direct={standing.level >= DIRECT_EDIT_LEVEL}
                points={POINTS.placeCreate}
                resumed={null}
              />
              <p className="text-sm text-muted-foreground">
                {t("newPlaceHint")}
              </p>
            </div>
            <PlaceForm
              contribution={{
                mode: "create",
                pickParent: true,
                parentSlug: parent?.slug,
                parentName: parent?.name,
                parentSystemSlug,
              }}
            />
          </div>
        }
        privatePart={
          <PrivatePlaceForm
            orgs={orgs}
            initialParent={
              parent
                ? {
                    slug: parent.slug,
                    name: parent.name,
                    systemSlug: parentSystemSlug,
                  }
                : undefined
            }
            initialName={nom ?? fromMarker?.name}
            initialPosition={fromMarker?.position}
            initialDescription={fromMarker?.note}
            fromLocationId={emplacement}
            fromMarkerId={fromMarker?.id}
          />
        }
      />
    </div>
  );
}
