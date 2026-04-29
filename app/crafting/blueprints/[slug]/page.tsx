import { getBlueprintBySlug } from "@/lib/crafting";
import { formatCraftingTime } from "@/lib/crafting-time";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
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
import {
  BlueprintOwnershipCard,
  BlueprintOrgOwnersSection,
  AdminBlueprintSection,
  BlueprintCraftSection,
} from "./server-components";
import { BlueprintImageCover } from "@/app/crafting/blueprints/[slug]/components";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    return { title: "Blueprint introuvable" };
  }

  const description = blueprint.description
    ? blueprint.description.slice(0, 160)
    : `Blueprint de crafting Star Citizen : ${blueprint.name}. Catégorie : ${blueprint.category}.`;

  const imageUrl =
    blueprint.imageUrl ??
    `https://gwgsmex5adyadzri.public.blob.vercel-storage.com/blueprints/images/${blueprint.slug}.jpg`;

  return {
    title: blueprint.name,
    description,
    openGraph: {
      title: `${blueprint.name} — Blueprints Nexus Tools`,
      description,
      url: `https://tools.nexus.services/crafting/blueprints/${slug}`,
      images: [{ url: imageUrl, alt: blueprint.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${blueprint.name} — Blueprints Nexus Tools`,
      description,
      images: [imageUrl],
    },
  };
}

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
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
    <div className="m-2 mx-auto max-w-4xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
            <h1 className="text-3xl font-bold">{blueprint.name}</h1>
          </div>
          <Suspense fallback={null}>
            <AdminBlueprintSection blueprint={blueprint} />
          </Suspense>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-gray-200">
        <BlueprintImageCover
          imageUrl={
            blueprint.imageUrl ??
            `https://gwgsmex5adyadzri.public.blob.vercel-storage.com/blueprints/images/${blueprint.slug}.jpg`
          }
          name={blueprint.name}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold  uppercase tracking-wide mb-1">
          {t("Blueprints.description")}
        </h2>
        <p className="leading-relaxed  prose prose-invert">
          {blueprint.description}
        </p>
      </div>

      {blueprint.obtention && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-1">
            {t("Blueprints.obtention")}
          </h2>
          <p className="prose prose-invert leading-relaxed whitespace-pre-line">
            {blueprint.obtention}
          </p>
        </div>
      )}

      {/* Tier & Crafting time */}
      <div className="flex flex-wrap gap-6">
        {blueprint.tier !== undefined && (
          <div>
            <span className="text-xs font-semibold  uppercase tracking-wide">
              {t("Blueprints.tier")}
            </span>
            <p className="mt-0.5 font-medium">{blueprint.tier}</p>
          </div>
        )}
        {blueprint.craftingTime !== undefined && (
          <div>
            <span className="text-xs font-semibold  uppercase tracking-wide">
              {t("Blueprints.craftingTime")}
            </span>
            <p className="mt-0.5 font-medium">
              {formatCraftingTime(blueprint.craftingTime)}
            </p>
          </div>
        )}
      </div>

      {/* Statistics */}
      {blueprint.statistics && Object.keys(blueprint.statistics).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold  uppercase tracking-wide mb-2">
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
      {blueprint.recipe && blueprint.recipe.components.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("Blueprints.recipe")}
          </h2>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-nexus-bg text-nexus-primary border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold  uppercase tracking-wide">
                    {t("Blueprints.recipeComponent")}
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-semibold  uppercase tracking-wide">
                    {t("Blueprints.recipeOption")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold  uppercase tracking-wide">
                    {t("Blueprints.recipeQuantity")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold  uppercase tracking-wide">
                    {t("Blueprints.recipeMinQuality")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nexus-bg">
                {blueprint.recipe.components.map((component) =>
                  component.options.map((option, oi) => (
                    <tr key={`${component.name}-${oi}`}>
                      {oi === 0 && (
                        <td
                          className="px-4 py-2  font-medium"
                          rowSpan={component.options.length}
                        >
                          {component.name}
                        </td>
                      )}
                      <td className="px-4 py-2 ">{option.name}</td>
                      <td className="px-4 py-2 text-right ">
                        {option.quantity}
                      </td>
                      <td className="px-4 py-2 text-right ">
                        {option.minQuality !== undefined
                          ? option.minQuality
                          : "—"}
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
          <div className="rounded-xl border border-gray-200 p-5 animate-pulse h-16" />
        }
      >
        <BlueprintCraftSection blueprint={blueprint} />
      </Suspense>

      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 p-5 animate-pulse h-16" />
        }
      >
        <BlueprintOwnershipCard blueprint={blueprint} />
      </Suspense>

      {!blueprint.isDefault && (
        <Suspense
          fallback={
            <div className="rounded-xl border border-gray-200  p-5 animate-pulse h-16" />
          }
        >
          <BlueprintOrgOwnersSection blueprint={blueprint} />
        </Suspense>
      )}

      <p className="text-xs text-gray-600">
        Images retrieved from various incredible tools such as{" "}
        <Link href="https://starcitizen.tools/" target="_blank">
          Star Citizen Tools
        </Link>
        .
      </p>

      <Button asChild variant="outline">
        <Link href="/crafting/blueprints">
          {t("Blueprints.backToBlueprints")}
        </Link>
      </Button>
    </div>
  );
}
