import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from "@modelcontextprotocol/ext-apps/server";

/**
 * Les MCP Apps de Nexus Tools : des vues que l'hôte (Claude, ChatGPT…) affiche
 * dans la conversation à côté du résultat de certains outils.
 *
 * Toutes les vues sont une même page React (`mcp-views/`), compilée en un
 * seul fichier HTML par `npm run mcp:views` dans `lib/mcp/views/dist/`. Chaque
 * vue a sa ressource `ui://nexus/<vue>.html` : la page y reçoit son nom sur
 * `<html data-view>`, puis se dessine à partir du `structuredContent` de
 * l'outil. Un hôte sans MCP Apps reçoit le texte et le `structuredContent`
 * comme avant : rien ne dépend des vues.
 */

export const APP_VIEWS = [
  "marketplace",
  "sheet",
  "inventory",
  "plan",
  "nps",
] as const;
export type AppView = (typeof APP_VIEWS)[number];

/** La vue de chaque outil qui en a une. */
const TOOL_VIEWS: Record<string, AppView> = {
  search_listings: "marketplace",
  get_listing: "marketplace",
  get_shop: "marketplace",
  cart_view: "marketplace",
  get_item: "sheet",
  get_place: "sheet",
  list_inventory: "inventory",
  get_place_plan: "plan",
  plan_draft_render: "plan",
  nps_locate: "nps",
};

export const viewUri = (view: AppView) => `ui://nexus/${view}.html`;

/** Le `_meta` d'un outil qui s'affiche dans une vue (clé récente et ancienne). */
export function viewMeta(
  view: AppView,
  visibility?: ("model" | "app")[],
): Record<string, unknown> {
  return {
    ui: { resourceUri: viewUri(view), ...(visibility && { visibility }) },
    [RESOURCE_URI_META_KEY]: viewUri(view),
  };
}

/**
 * Le serveur, dont `registerTool` ajoute la vue des outils de `TOOL_VIEWS` :
 * les outils restent déclarés dans leur domaine, la liste des vues ici.
 */
export function withAppViews(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, property, receiver) {
      if (property !== "registerTool") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (
        name: string,
        config: { _meta?: Record<string, unknown> },
        ...rest: unknown[]
      ) => {
        const view = TOOL_VIEWS[name];
        const withView = view
          ? { ...config, _meta: { ...config._meta, ...viewMeta(view) } }
          : config;
        return (target.registerTool as (...args: unknown[]) => unknown).call(
          target,
          name,
          withView,
          ...rest,
        );
      };
    },
  });
}

/**
 * Les images que les vues affichent : le site (illustrations relatives), le
 * blob storage et les médias du jeu. Les vues ne parlent qu'à l'hôte : pas de
 * `connectDomains`.
 */
function resourceDomains(): string[] {
  const site = new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://tools.services.nexus",
  ).origin;
  return [
    site,
    "https://gwgsmex5adyadzri.public.blob.vercel-storage.com",
    "https://media.robertsspaceindustries.com",
    "https://media.starcitizen.tools",
  ];
}

const FALLBACK_HTML =
  '<!doctype html><html><body style="font-family:sans-serif">' +
  "The Nexus Tools views are not built: run <code>npm run mcp:views</code>." +
  "</body></html>";

let pageCache: Promise<string> | null = null;

/** La page compilée, lue une fois par instance. */
function loadPage(): Promise<string> {
  pageCache ??= readFile(
    path.join(process.cwd(), "lib/mcp/views/dist/index.html"),
    "utf8",
  ).catch(() => {
    pageCache = null;
    return FALLBACK_HTML;
  });
  return pageCache;
}

export function registerAppViews(server: McpServer) {
  const csp = { resourceDomains: resourceDomains() };
  for (const view of APP_VIEWS) {
    const uri = viewUri(view);
    server.registerResource(
      `view-${view}`,
      uri,
      {
        title: `Nexus Tools ${view} view`,
        description: `Interactive view shown next to the ${view} tools`,
        mimeType: RESOURCE_MIME_TYPE,
        _meta: { ui: { csp, prefersBorder: true } },
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: (await loadPage()).replace(
              "<html",
              `<html data-view="${view}"`,
            ),
            _meta: { ui: { csp, prefersBorder: true } },
          },
        ],
      }),
    );
  }
}
