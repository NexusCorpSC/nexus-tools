/**
 * Essai de fumée du serveur MCP : se connecte à `/mcp` dans les deux époques du
 * protocole (2025, avec `initialize`, et 2026-07-28, sans état), liste les
 * outils, ressources et prompts, puis appelle chaque cas de `CASES`.
 *
 *   npm run mcp:smoke                       # http://localhost:3000/mcp
 *   MCP_URL=https://… npm run mcp:smoke
 *   MCP_TOKEN=…   → envoyé en `Authorization: Bearer` (outils personnels)
 *   MCP_SMOKE_LOCAL=1 → saute les cas qui exigent la recherche Atlas
 *   MCP_SMOKE_SELLER=1 → essaie aussi les outils vendeur (le compte du jeton
 *   vend dans « Smoke Shop 2 » : `MCP_SMOKE_SELLER_EMAIL` au seed)
 *
 * Une élicitation reçue est acceptée avec la réponse prévue par le cas
 * (`answers`), ou acceptée vide s'il n'en prévoit pas.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

type Case = {
  tool: string;
  args: Record<string, unknown>;
  /** Le cas réussit si l'outil répond une erreur (`isError`). */
  expectError?: boolean;
  /** Exige la recherche plein texte d'Atlas, absente d'un Mongo local. */
  atlas?: boolean;
  /** Exige un jeton (`MCP_TOKEN`). */
  auth?: boolean;
  /** Exige que le compte du jeton vende dans « Smoke Shop 2 ». */
  seller?: boolean;
  /** Réponses aux élicitations, par message contenant la clé. */
  answers?: Record<string, Record<string, unknown>>;
  /**
   * Un outil qui écrit : en 2025 (sans élicitation), le premier appel doit
   * demander confirmation et le second, avec `confirm: true`, aboutir ; en
   * 2026-07-28, l'élicitation confirme d'elle-même.
   */
  write?: boolean;
  /** Le statut attendu d'une écriture (`done` par défaut). */
  status?: string;
  /** Seulement en 2026-07-28 (refus par l'élicitation). */
  modernOnly?: boolean;
  /** Retient des valeurs du résultat pour les arguments `$nom` des cas suivants. */
  save?: (structured: Record<string, unknown>) => Record<string, string>;
};

/** Remplace les valeurs `"$nom"`, à toute profondeur, par les valeurs retenues. */
function fill(
  args: Record<string, unknown>,
  vars: Record<string, string>,
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(args).replace(/"\$(\w+)"/g, (match, name: string) =>
      name in vars ? JSON.stringify(vars[name]) : match,
    ),
  );
}

const CASES: Case[] = [
  { tool: "whoami", args: {}, auth: true },
  { tool: "search_blueprints", args: { query: "rifle" }, atlas: true },
  { tool: "get_blueprint_by_slug", args: { slug: "smoke-blueprint" } },
  { tool: "get_blueprint_by_slug", args: { slug: "nope" }, expectError: true },
  { tool: "search", args: { query: "smoke" } },
  { tool: "search_items", args: { query: "smoke", kind: "weapon" } },
  { tool: "list_item_facets", args: {} },
  { tool: "get_item", args: { slug: "smoke-item" } },
  { tool: "compare_items", args: { slugs: ["smoke-item", "smoke-item-2"] } },
  { tool: "search_places", args: { query: "smoke" } },
  { tool: "list_place_facets", args: {} },
  { tool: "get_place", args: { slug: "smoke-outpost" } },
  { tool: "get_place_plan", args: { slug: "smoke-outpost" } },
  {
    tool: "get_place_plan",
    args: { slug: "smoke-station" },
    expectError: true,
  },
  {
    tool: "nps_locate",
    args: {
      location: "Coordinates: x:1000100000.000 y:1000.000 z:0.000",
      destination: "smoke-station",
    },
  },
  {
    tool: "nps_locate",
    args: { location: "n'importe quoi" },
    expectError: true,
  },
  { tool: "search_listings", args: { query: "smoke" } },
  { tool: "list_listing_facets", args: {} },
  { tool: "get_listing", args: { id: "smoke-listing" } },
  { tool: "get_shop", args: { id: "smoke-shop" } },
  // Outils personnels, avec MCP_TOKEN : écritures confirmées.
  {
    tool: "add_inventory",
    args: {
      location: "Smoke Outpost",
      lots: [{ name: "Smoke Rifle", quantity: 2, quality: 500 }],
    },
    auth: true,
    write: true,
  },
  {
    tool: "list_inventory",
    args: { query: "Smoke Rifle", location: "smoke-outpost" },
    auth: true,
    save: (s) => ({ lot: (s.lots as { id: string }[])[0]?.id ?? "" }),
  },
  { tool: "search_inventory_locations", args: { query: "smoke" }, auth: true },
  {
    tool: "add_inventory",
    args: { location: "Nowhere at all", lots: [{ name: "X", quantity: 1 }] },
    auth: true,
    expectError: true,
  },
  {
    tool: "update_inventory_lot",
    args: { lotId: "$lot", adjust: 1, description: "fumée" },
    auth: true,
    write: true,
  },
  {
    tool: "update_inventory_lot",
    args: { lotId: "$lot", remove: true },
    auth: true,
    write: true,
    modernOnly: true,
    answers: { Remove: { confirm: false } },
    status: "cancelled",
  },
  {
    tool: "move_inventory_lot",
    args: { lotId: "$lot", location: "smoke-station", quantity: 1 },
    auth: true,
    write: true,
  },
  {
    tool: "update_inventory_lot",
    args: { lotId: "$lot", remove: true },
    auth: true,
    write: true,
  },
  { tool: "my_contributor_standing", args: {}, auth: true },
  {
    tool: "contribute_place_edit",
    args: {
      place: "smoke-station",
      changes: { tip: `Astuce de fumée ${Date.now()}` },
    },
    auth: true,
    write: true,
  },
  {
    tool: "contribute_place_position",
    args: {
      place: "smoke-station",
      location: "Coordinates: x:1000100000.000 y:1500.000 z:0.000",
    },
    auth: true,
    write: true,
  },
  {
    tool: "contribute_item_edit",
    args: {
      item: "smoke-item",
      changes: { description: `Description de fumée ${Date.now()}` },
    },
    auth: true,
    write: true,
  },
  {
    tool: "contribute_place_edit",
    args: { place: "nope", changes: { tip: "x" } },
    auth: true,
    expectError: true,
  },
  // Plans dessinés par un agent.
  {
    tool: "plan_draft_create",
    args: {
      place: "smoke-station",
      name: "Plan de fumée",
      widthCm: 3000,
      heightCm: 2000,
    },
    auth: true,
    save: (s) => ({
      draft: String(s.draftId),
      level: (s.outline as { levels: { id: string }[] }).levels[0].id,
    }),
  },
  {
    tool: "plan_draft_edit",
    args: {
      draftId: "$draft",
      ops: [
        {
          op: "add_room",
          levelId: "$level",
          id: "hall",
          name: "Hall",
          kind: "circulation",
          x: 200,
          y: 200,
          w: 800,
          h: 600,
        },
        {
          op: "add_room",
          levelId: "$level",
          id: "store",
          name: "Réserve",
          kind: "storage",
          w: 500,
          h: 600,
          nextTo: { room: "Hall", side: "east" },
        },
        { op: "add_door", levelId: "$level", x: 1000, y: 500 },
        { op: "add_door", levelId: "$level", x: 600, y: 210, kind: "double" },
        {
          op: "add_marker",
          levelId: "$level",
          x: 450,
          y: 400,
          place: "smoke-outpost",
          label: "Vers l'avant-poste",
        },
        { op: "add_label", levelId: "$level", text: "Nord", x: 1500, y: 100 },
      ],
    },
    auth: true,
  },
  {
    tool: "plan_draft_edit",
    args: { draftId: "$draft", ops: [{ op: "remove", id: "nope" }] },
    auth: true,
    expectError: true,
  },
  { tool: "plan_draft_render", args: { draftId: "$draft" }, auth: true },
  { tool: "plan_draft_get", args: { draftId: "$draft" }, auth: true },
  { tool: "plan_draft_get", args: {}, auth: true },
  {
    tool: "plan_draft_submit",
    args: { draftId: "$draft", source: "fumée" },
    auth: true,
    write: true,
  },
  {
    tool: "plan_draft_create",
    args: { place: "smoke-outpost", fromPlanId: "smoke-plan" },
    auth: true,
    save: (s) => ({ copy: String(s.draftId) }),
  },
  { tool: "plan_draft_discard", args: { draftId: "$copy" }, auth: true },
  // Marketplace, côté acheteur.
  {
    tool: "cart_add",
    args: { listingId: "smoke-listing", quantity: 1 },
    auth: true,
    write: true,
  },
  {
    tool: "cart_update",
    args: { listingId: "smoke-listing", quantity: 2 },
    auth: true,
    write: true,
  },
  { tool: "cart_view", args: {}, auth: true },
  {
    tool: "cart_checkout",
    args: { shops: [{ shopId: "smoke-shop", note: "fumée" }] },
    auth: true,
    write: true,
    save: (s) => ({ order: (s.orders as { id: string }[])[0]?.id ?? "" }),
  },
  { tool: "cart_checkout", args: {}, auth: true, expectError: true },
  { tool: "my_orders", args: {}, auth: true },
  { tool: "get_order", args: { orderId: "$order" }, auth: true },
  {
    tool: "order_action",
    args: { orderId: "$order", action: "deliver" },
    auth: true,
    expectError: true,
  },
  {
    tool: "order_action",
    args: { orderId: "$order", action: "cancel", message: "fumée" },
    auth: true,
    write: true,
  },
  {
    tool: "order_now",
    args: {
      listingId: "smoke-listing",
      quantity: 1,
      proposedPickup: "Smoke Station",
    },
    auth: true,
    write: true,
    save: (s) => ({ order2: (s.order as { id: string }).id }),
  },
  {
    tool: "order_message",
    args: { orderId: "$order2", message: "Bonjour, fumée" },
    auth: true,
    write: true,
  },
  {
    tool: "order_now",
    args: { listingId: "smoke-listing", quantity: 10_000 },
    auth: true,
    expectError: true,
  },
  {
    tool: "request_custom_order",
    args: { shopId: "smoke-shop", message: "Dix casques, fumée" },
    auth: true,
    write: true,
  },
  // Marketplace, côté vendeur.
  { tool: "my_shops", args: {}, auth: true },
  {
    tool: "shop_listings",
    args: { shopId: "smoke-shop-2" },
    auth: true,
    seller: true,
  },
  {
    tool: "shop_orders",
    args: { shopId: "smoke-shop-2" },
    auth: true,
    seller: true,
  },
  {
    tool: "shop_orders",
    args: { shopId: "smoke-shop" },
    auth: true,
    expectError: true,
  },
  {
    tool: "update_listing",
    args: { listingId: "smoke-own-listing", stockChange: 2, price: 900 },
    auth: true,
    seller: true,
    write: true,
  },
  {
    tool: "order_action",
    args: { orderId: "$sellerOrder", action: "confirm" },
    auth: true,
    seller: true,
    write: true,
  },
  {
    tool: "order_action",
    args: { orderId: "$sellerOrder", action: "deliver", message: "Remis" },
    auth: true,
    seller: true,
    write: true,
  },
  {
    tool: "add_inventory",
    args: {
      location: "smoke-outpost",
      lots: [{ name: "Smoke Ammo", quantity: 30 }],
    },
    auth: true,
    seller: true,
    write: true,
  },
  {
    tool: "list_inventory",
    args: { query: "Smoke Ammo" },
    auth: true,
    seller: true,
    save: (s) => ({ ammo: (s.lots as { id: string }[])[0]?.id ?? "" }),
  },
  {
    tool: "sell_lot",
    args: { lotId: "$ammo", shopId: "smoke-shop-2", price: 10, limit: 20 },
    auth: true,
    seller: true,
    write: true,
  },
  {
    tool: "update_inventory_lot",
    args: { lotId: "$ammo", remove: true },
    auth: true,
    seller: true,
    write: true,
  },
];

/** Les modèles de ressources et prompts dont on essaie l'autocomplétion. */
const COMPLETIONS = [
  {
    ref: { type: "ref/resource", uri: "nexus://items/{slug}" },
    argument: "slug",
    value: "smo",
  },
  {
    ref: { type: "ref/resource", uri: "nexus://places/{slug}" },
    argument: "slug",
    value: "smoke-o",
  },
  {
    ref: { type: "ref/prompt", name: "where_to_get_item" },
    argument: "item",
    value: "smoke",
  },
] as const;

const url = new URL(process.env.MCP_URL || "http://localhost:3000/mcp");
const token = process.env.MCP_TOKEN;
const local = process.env.MCP_SMOKE_LOCAL === "1";
const seller = process.env.MCP_SMOKE_SELLER === "1";

function connectClient(era: "legacy" | "2026-07-28", current: { case?: Case }) {
  const client = new Client(
    { name: "nexus-mcp-smoke", version: "1.0.0" },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation:
        era === "legacy" ? { mode: "legacy" } : { mode: { pin: era } },
    },
  );
  client.setRequestHandler("elicitation/create", async (request) => {
    const message = String(request.params.message ?? "");
    const answers = current.case?.answers ?? {};
    const key = Object.keys(answers).find((k) => message.includes(k));
    console.log(`    ↳ élicitation : ${message.split("\n")[0]}`);
    return { action: "accept", content: key ? answers[key] : {} } as never;
  });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  return { client, transport };
}

async function run(era: "legacy" | "2026-07-28"): Promise<number> {
  const current: { case?: Case } = {};
  const { client, transport } = connectClient(era, current);
  await client.connect(transport);
  console.log(`\n== ${era} (${url.href})`);

  const tools = await client.listTools();
  console.log(
    `tools (${tools.tools.length}) : ${tools.tools.map((t) => t.name).join(", ")}`,
  );
  const caps = client.getServerCapabilities() ?? {};
  if (caps.resources) {
    const templates = await client.listResourceTemplates();
    console.log(
      `resource templates : ${templates.resourceTemplates.map((t) => t.uriTemplate).join(", ")}`,
    );
  }
  let failures = 0;
  if (caps.resources) {
    // Les vues MCP Apps : une page HTML compilée (`npm run mcp:views`).
    const view = (
      await client.readResource({ uri: "ui://nexus/marketplace.html" })
    ).contents[0] as { mimeType?: string; text?: string };
    const ok =
      view.mimeType === "text/html;profile=mcp-app" &&
      !!view.text?.includes('data-view="marketplace"') &&
      !view.text.includes("npm run mcp:views");
    console.log(`${ok ? "✓" : "✗"} vue ui://nexus/marketplace.html`);
    if (!ok) failures++;
  }
  if (caps.prompts) {
    const prompts = await client.listPrompts();
    console.log(`prompts : ${prompts.prompts.map((p) => p.name).join(", ")}`);
  }

  if (caps.completions) {
    for (const c of COMPLETIONS) {
      try {
        const result = await client.complete({
          ref: c.ref as never,
          argument: { name: c.argument, value: c.value },
        });
        const values = result.completion.values;
        console.log(
          `${values.length ? "✓" : "✗"} complétion ${JSON.stringify(c.ref)} « ${c.value} » : ${values.slice(0, 5).join(", ")}`,
        );
        if (!values.length) failures++;
      } catch (error) {
        console.log(
          `✗ complétion ${JSON.stringify(c.ref)} : ${(error as Error).message}`,
        );
        failures++;
      }
    }
  }

  const known = new Set(tools.tools.map((t) => t.name));
  const vars: Record<string, string> = { sellerOrder: `smoke-order-${era}` };
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const first = (result.content as { type: string; text?: string }[])?.find(
      (part) => part.type === "text",
    )?.text;
    return {
      isError: Boolean(result.isError),
      structured: (result.structuredContent ?? {}) as Record<string, unknown>,
      text: (first ?? "").split("\n")[0].slice(0, 100),
    };
  };
  for (const c of CASES) {
    if ((c.atlas && local) || (c.auth && !token) || (c.seller && !seller)) {
      continue;
    }
    if (c.modernOnly && era === "legacy") continue;
    if (!known.has(c.tool)) {
      console.log(`✗ ${c.tool} : outil absent`);
      failures++;
      continue;
    }
    current.case = c;
    const args = fill(c.args, vars);
    try {
      let result = await call(c.tool, args);
      let ok = result.isError === Boolean(c.expectError);
      if (ok && c.write && era === "legacy") {
        // Sans élicitation : rien n'est fait avant `confirm: true`.
        ok = result.structured.status === "confirmation_required";
        if (ok) result = await call(c.tool, { ...args, confirm: true });
      }
      if (ok && c.write) {
        ok =
          !result.isError && result.structured.status === (c.status ?? "done");
      }
      if (ok && c.save) Object.assign(vars, c.save(result.structured));
      console.log(
        `${ok ? "✓" : "✗"} ${c.tool} ${JSON.stringify(args)}${result.isError ? " (erreur)" : ""} : ${result.text}`,
      );
      if (!ok) failures++;
    } catch (error) {
      console.log(`✗ ${c.tool} : ${(error as Error).message}`);
      failures++;
    }
  }
  await client.close();
  return failures;
}

async function main() {
  const failures = (await run("legacy")) + (await run("2026-07-28"));
  console.log(failures ? `\n${failures} échec(s)` : "\nTout est passé.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
