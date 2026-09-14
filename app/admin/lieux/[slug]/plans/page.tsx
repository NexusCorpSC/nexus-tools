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
import { getPlacePlans } from "@/lib/places";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlanEditor } from "../../components/plan-editor";

export const metadata: Metadata = {
  title: "Plans du lieu",
  robots: { index: false, follow: false },
};

export default async function EditPlansPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission(PLACES_EDIT_PERMISSION);

  const { slug } = await params;
  const place = await getPlacePlans(slug);
  if (!place) notFound();

  const t = await getTranslations("Places");

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/lieux">
              {t("Admin.managerTitle")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/lieux/${place.slug}`}>
              {place.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("planTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">
        {t("Admin.plansPageTitle", { name: place.name })}
      </h1>

      <PlanEditor
        slug={place.slug}
        initialPlans={place.plans}
        initialTargets={place.targets}
      />
    </div>
  );
}
