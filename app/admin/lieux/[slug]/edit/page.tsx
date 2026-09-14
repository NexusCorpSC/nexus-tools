import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requirePermission } from "@/lib/permissions";
import { getPlaceBySlug } from "@/lib/places";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlaceForm } from "../../components/place-form";

export const metadata: Metadata = {
  title: "Modifier le lieu",
  robots: { index: false, follow: false },
};

export default async function EditPlacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission(PLACES_EDIT_PERMISSION);

  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  if (!place) notFound();

  const t = await getTranslations("Places");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/lieux">
              {t("Admin.managerTitle")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{place.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("Admin.editPageTitle")}</h1>

      <PlaceForm place={place} parentName={place.parentName} />
    </div>
  );
}
