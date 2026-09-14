"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { PLACE_SERVICE_ICON, PLACE_TYPE_ICON } from "@/lib/place-icons";
import type { PlaceTreeNode } from "@/types/places";

/** Ce qu'une ligne a besoin de savoir, une fois la liste plate parcourue. */
type Row = {
  node: PlaceTreeNode;
  /** Vrai quand la ligne suivante est plus profonde : elle a de quoi déplier. */
  hasChildren: boolean;
  open: boolean;
};

/**
 * La liste arrive plate et déjà dans l'ordre de parcours de l'arbre — c'est le
 * tri sur `path`, côté base. Le repliage se joue donc en une seule passe, avec
 * un seuil de profondeur : aucun arbre n'est reconstruit ici.
 *
 * Le chevron se décide sur « la ligne suivante est-elle plus profonde ? »
 * plutôt que sur le nombre d'enfants du lieu : sous filtre, un lieu peut avoir
 * quatre enfants dont aucun ne répond, et un chevron qui se déplie sur du vide
 * est un chevron qui ment.
 */
function toRows(nodes: PlaceTreeNode[], expanded: Set<string>): Row[] {
  const rows: Row[] = [];
  let cutoff = Number.POSITIVE_INFINITY;

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.depth > cutoff) continue;

    const next = nodes[index + 1];
    const hasChildren = !!next && next.depth > node.depth;
    const open = expanded.has(node.slug);

    rows.push({ node, hasChildren, open });
    cutoff = open ? Number.POSITIVE_INFINITY : node.depth;
  }

  return rows;
}

export function PlacesTree({
  nodes,
  expanded,
  onToggle,
}: {
  nodes: PlaceTreeNode[];
  expanded: Set<string>;
  onToggle: (slug: string) => void;
}) {
  const t = useTranslations("Places");
  const rows = toRows(nodes, expanded);

  return (
    // Une liste, pas un `role="tree"` : ces lignes sont des liens, et l'attribut
    // `aria-selected` qu'un arbre réclame promettrait une sélection qui
    // n'existe pas. Le dépliage s'annonce sur le bouton, là où il se joue.
    <div className="flex flex-col gap-1">
      {rows.map(({ node, hasChildren, open }) => {
        const TypeIcon = PLACE_TYPE_ICON[node.type];
        const services = (node.services ?? []).slice(0, 5);
        const rest = (node.services ?? []).length - services.length;

        return (
          <div
            key={node.slug}
            style={{ marginLeft: node.depth * 28 }}
            className={`flex items-center gap-2.5 rounded-lg border border-[#9ED0FF]/12 px-3 py-2 transition-colors hover:bg-white/5 ${
              node.depth > 0 ? "border-l-2 border-l-[#9ED0FF]/25" : ""
            } ${node.matched ? "" : "opacity-60"}`}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={
                  open
                    ? t("treeCollapse", { name: node.name })
                    : t("treeExpand", { name: node.name })
                }
                onClick={() => onToggle(node.slug)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-nexus"
              >
                {open ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                )}
              </button>
            ) : (
              <span className="size-6 shrink-0" />
            )}

            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#9ED0FF]/12 text-nexus-primary">
              <TypeIcon className="size-4" />
            </span>

            <Link
              href={`/lieux/${node.slug}`}
              className="min-w-0 flex-1 text-nexus hover:text-white"
            >
              <span className="block truncate text-sm font-semibold">
                {node.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t(`types.${node.type}`)}
              </span>
            </Link>

            <span className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex">
              {services.map((service) => {
                const ServiceIcon = PLACE_SERVICE_ICON[service];
                return (
                  <ServiceIcon
                    key={service}
                    className="size-4"
                    title={t(`services.${service}`)}
                  />
                );
              })}
              {rest > 0 && <span className="text-xs font-medium">+{rest}</span>}
            </span>

            <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground md:block">
              {node.shopCount > 0
                ? t("shopsCount", { count: node.shopCount })
                : "—"}
            </span>

            <span
              className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold lg:block ${
                node.planCount > 0
                  ? "border-primary/45 text-primary"
                  : "border-muted-foreground/35 text-muted-foreground"
              }`}
            >
              {t("plansCount", { count: node.planCount })}
            </span>

            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </div>
        );
      })}
    </div>
  );
}
