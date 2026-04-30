import { getBlueprintById, searchBlueprints } from '@/lib/crafting';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod/v3';

async function handleSearchBlueprints(input: { query: string }): Promise<{ content: TextContent[], isError?: boolean }> {
    const blueprints = await searchBlueprints(input.query, { fuzzy: true });

    return {
        content: [
            {
                type: 'text',
                text: `You searched for: ${input.query}\n\nFound ${blueprints.length} blueprints:\n` + blueprints.map(bp => `- ${bp.name} (id: ${bp.id})`).join('\n'),
            },
        ],
    };
}

const handler = createMcpHandler(server => {
    server.registerTool("search_blueprints", {
        title: "Search for a blueprint",
        description: "Search for blueprints and their details.",
        inputSchema: {
            query: z.string(),
        },
    }, handleSearchBlueprints);
    server.registerTool("get_blueprint_by_id", {
        title: "Get blueprint details by ID",
        description: "Retrieve detailed information about a blueprint using its ID.",
        inputSchema: {
            id: z.string(),
        },
    }, async (input: { id: string }) => {
        const blueprint = await getBlueprintById(input.id);
        if (!blueprint) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No blueprint found with ID: ${input.id}`,
                    },
                ],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: `Blueprint Details:\nName: ${blueprint.name}\nCategory: ${blueprint.category}\nSubcategory: ${blueprint.subcategory}\nObtained from: ${blueprint.obtention}\nDescription: ${blueprint.description}`,
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