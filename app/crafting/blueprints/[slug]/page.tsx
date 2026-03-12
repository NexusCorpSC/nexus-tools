import { getBlueprintBySlug } from "@/lib/crafting";
import { formatCraftingTime } from "@/lib/crafting-time";
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

      {blueprint.obtention && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {t("Blueprints.obtention")}
          </h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{blueprint.obtention}</p>
        </div>
      )}

      {/* Tier & Crafting time */}
      <div className="flex flex-wrap gap-6">
        {blueprint.tier !== undefined && (
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Blueprints.tier")}
            </span>
            <p className="mt-0.5 text-gray-800 font-medium">{blueprint.tier}</p>
          </div>
        )}
        {blueprint.craftingTime !== undefined && (
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Blueprints.craftingTime")}
            </span>
            <p className="mt-0.5 text-gray-800 font-medium">
              {formatCraftingTime(blueprint.craftingTime)}
            </p>
          </div>
        )}
      </div>

      {/* Statistics */}
      {blueprint.statistics && Object.keys(blueprint.statistics).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("Blueprints.statistics")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(blueprint.statistics).map(([name, stat]) => (
              <div
                key={name}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <p className="text-xs text-gray-500">{name}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {stat.value}
                  {stat.unit ? ` ${stat.unit}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipe */}
      {blueprint.recipe && blueprint.recipe.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("Blueprints.recipe")}
          </h2>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t("Blueprints.recipeComponent")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t("Blueprints.recipeQuantity")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t("Blueprints.recipeMinQuality")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {blueprint.recipe.map((step, i) =>
                  Object.entries(step).map(([name, v]) => (
                    <tr key={`${i}-${name}`}>
                      <td className="px-4 py-2 text-gray-800">{name}</td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {v.quantity}
                        {v.unit ? ` ${v.unit}` : ""}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {v.minQuality !== undefined ? v.minQuality : "—"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
