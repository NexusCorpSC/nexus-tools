import { getBlueprintBySlug } from "@/lib/crafting";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import Image from "next/image";
import {
  BlueprintOwnershipCard,
  BlueprintOrgOwnersSection,
  AdminBlueprintSection,
} from "./server-components";

export default async function BlueprintDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("Crafting");
  const { slug } = await params;

  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">{t("Blueprints.notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/crafting/blueprints">
            {t("Blueprints.backToBlueprints")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting/blueprints">
              {t("Blueprints.title")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{blueprint.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
              {blueprint.category}
            </span>
            <h1 className="text-3xl font-bold text-gray-900">
              {blueprint.name}
            </h1>
          </div>
          <Suspense fallback={null}>
            <AdminBlueprintSection blueprint={blueprint} />
          </Suspense>
        </div>
      </div>

      {blueprint.imageUrl && (
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          <Image
            src={blueprint.imageUrl}
            alt={blueprint.name}
            width={896}
            height={400}
            className="w-full object-cover max-h-80"
            priority
          />
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
          {t("Blueprints.description")}
        </h2>
        <p className="text-gray-700 leading-relaxed">{blueprint.description}</p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 animate-pulse h-16" />
        }
      >
        <BlueprintOwnershipCard blueprint={blueprint} />
      </Suspense>

      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 animate-pulse h-16" />
        }
      >
        <BlueprintOrgOwnersSection blueprint={blueprint} />
      </Suspense>

      <Button asChild variant="outline">
        <Link href="/crafting/blueprints">
          {t("Blueprints.backToBlueprints")}
        </Link>
      </Button>
    </div>
  );
}
