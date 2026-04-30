import { getBlueprintById, getBlueprintBySlug, searchBlueprints } from '@/lib/crafting';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod/v3';

async function handleSearchBlueprints(input: { query: string }): Promise<{ content: TextContent[], isError?: boolean }> {
    const blueprints = await searchBlueprints(input.query, { fuzzy: true });

    return {
        content: [
            {
                type: 'text',
                text: `You searched for: ${input.query}\n\nFound ${blueprints.length} blueprints:\n` + blueprints.map(bp => `- ${bp.name} (slug: ${bp.slug}) (link: [${bp.name}](https://tools.services.nexus/crafting/blueprints/${bp.slug}))`).join('\n'),
            },
        ],
    };
}

const handler = createMcpHandler(server => {
    server.registerTool("search_blueprints", {
        title: "Search for a blueprint",
        description: "Search for 3 blueprints with a generic query and return their slugs and full names to use with other tools.",
        inputSchema: {
            query: z.string(),
        },
    }, handleSearchBlueprints);
    server.registerTool("get_blueprint_by_slug", {
        title: "Get blueprint details by slug",
        description: "Retrieve detailed information about a blueprint, recipe, obtention, statistics, ... using its slug.",
        inputSchema: {
            slug: z.string(),
        },
    }, async (input: { slug: string }) => {
        const blueprint = await getBlueprintBySlug(input.slug);
        if (!blueprint) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No blueprint found with slug: ${input.slug}`,
                    },
                ],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: `Blueprint Details:\nName: ${blueprint.name}\nCategory: ${blueprint.category}\nSubcategory: ${blueprint.subcategory}\nObtained from: ${blueprint.obtention || "No information about how to get this blueprint."}\nDescription: ${blueprint.description}\nLink with details: [${blueprint.name}](https://tools.services.nexus/crafting/blueprints/${blueprint.slug})\n${blueprint.imageUrl ? `Image: ![${blueprint.name}](${blueprint.imageUrl})` : ""}`,
                },
            ],
        };
    });
}, {
    serverInfo: {
        name: "Nexus Tools",
        version: "1.0.0",
    }
}, {
    basePath: '',
    verboseLogs: true,
    maxDuration: 60,
});

export { handler as GET, handler as POST, handler as DELETE };