/**
 * Essai de fumée du serveur MCP : se connecte à `/mcp` dans les deux époques du
 * protocole (2025, avec `initialize`, et 2026-07-28, sans état), liste les
 * outils, ressources et prompts, puis appelle chaque cas de `CASES`.
 *
 *   npm run mcp:smoke                       # http://localhost:3000/mcp
 *   MCP_URL=https://… npm run mcp:smoke
 *   MCP_TOKEN=…   → envoyé en `Authorization: Bearer` (outils personnels)
 *   MCP_SMOKE_LOCAL=1 → saute les cas qui exigent la recherche Atlas
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
  /** Réponses aux élicitations, par message contenant la clé. */
  answers?: Record<string, Record<string, unknown>>;
};

const CASES: Case[] = [
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
  if (caps.prompts) {
    const prompts = await client.listPrompts();
    console.log(`prompts : ${prompts.prompts.map((p) => p.name).join(", ")}`);
  }

  let failures = 0;
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
  for (const c of CASES) {
    if ((c.atlas && local) || (c.auth && !token)) continue;
    if (!known.has(c.tool)) {
      console.log(`✗ ${c.tool} : outil absent`);
      failures++;
      continue;
    }
    current.case = c;
    try {
      const result = await client.callTool({ name: c.tool, arguments: c.args });
      const isError = Boolean(result.isError);
      const ok = isError === Boolean(c.expectError);
      const first = (result.content as { type: string; text?: string }[])?.find(
        (part) => part.type === "text",
      )?.text;
      console.log(
        `${ok ? "✓" : "✗"} ${c.tool} ${JSON.stringify(c.args)}${isError ? " (erreur)" : ""} : ${(first ?? "").split("\n")[0].slice(0, 100)}`,
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
