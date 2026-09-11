import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getItemDetails } from "@/lib/items";
import { hasPermission } from "@/lib/permissions";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import { ResourceView } from "./views/resource-view";
import { StandardView } from "./views/standard-view";
import { VehicleView } from "./views/vehicle-view";
import { WeaponView } from "./views/weapon-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    return { title: "Objet introuvable" };
  }

  const description =
    item.description?.slice(0, 160) ??
    `${item.name} — ${[item.category, item.subcategory].filter(Boolean).join(" › ")}`;

  return {
    title: item.name,
    description,
    openGraph: {
      title: `${item.name} — Objets Nexus Tools`,
      description,
      url: `https://tools.services.nexus/items/${item.slug}`,
      images: item.imageUrl ? [{ url: item.imageUrl, alt: item.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${item.name} — Objets Nexus Tools`,
      description,
      images: item.imageUrl ? [item.imageUrl] : [],
    },
  };
}

/**
 * Each kind of object gets the fiche its data deserves: a vehicle is a
 * showcase, a weapon a firing dossier, a resource a trading sheet. They share
 * the same skeleton — the sections that are common live in `sections.tsx`.
 */
export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    const t = await getTranslations("Items");
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold">{t("notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/items">{t("backToItems")}</Link>
        </Button>
      </div>
    );
  }

  const canEdit = await hasPermission(ITEMS_EDIT_PERMISSION);

  switch (item.kind) {
    case "vehicle":
      return <VehicleView item={item} canEdit={canEdit} />;
    case "weapon":
      return <WeaponView item={item} canEdit={canEdit} />;
    case "resource":
      return <ResourceView item={item} canEdit={canEdit} />;
    default:
      return <StandardView item={item} canEdit={canEdit} />;
  }
}
