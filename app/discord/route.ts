import { searchBlueprints } from "@/lib/crafting";
import { REST } from "@discordjs/rest";
import { APIApplicationCommandInteraction, APIChatInputApplicationCommandInteraction, APIMessage, APIMessageApplicationCommandInteraction, InteractionType, Routes } from "discord-api-types/v10";
import { verify } from "discord-verify/node";
import { NextResponse } from "next/server";
import crypto from 'node:crypto'; 

const agentId = "eee0b470-5a15-40f0-bb0d-ff816867ab50";

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN ?? '');

export async function POST(req: Request) {
    const body = await req.json();

    const signature = req.headers.get("x-signature-ed25519");
	const timestamp = req.headers.get("x-signature-timestamp");
	const rawBody = JSON.stringify(body);

    console.debug(body);

    const isValid = await verify(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY ?? '', crypto.webcrypto.subtle);
    
    if (!isValid) {
        console.warn('Invalid request signature');
        return NextResponse.json({ success: false }, { status: 403 });
    }

    if (body.type === 1) {
        return NextResponse.json({ type: 1 });
    } else if (body.type === InteractionType.ApplicationCommand) {
        return handleApplicationCommand(body as APIChatInputApplicationCommandInteraction);
    }

    return NextResponse.json({ success: true }, { status: 200 });
}


async function handleApplicationCommand(body: APIChatInputApplicationCommandInteraction) {
    if (body.data.name === 'blueprints') {
        return handleSearchBlueprintsCommand(body);
    } else if (body.data.name === 'ask') {
        return handleAskCommand(body);
    }
}

async function handleAskCommand(interaction: APIChatInputApplicationCommandInteraction) {
    const message = interaction.data.options?.find(option => option.name === 'message' && option.type === 3) as { value: string } | undefined;
    if (!message?.value) {
        await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
            body: {
                type: 4,
                data: {
                    content: 'Veuillez fournir un message.',
                    flags: 64, // Ephemeral
                },
            },
        });
        return NextResponse.json({ success: true }, { status: 200 });
    }

    const responseRaw = await fetch(`${process.env.BREIGN_ENDPOINT}/agents/${agentId}/prompts`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.BREIGN_API_KEY ?? '',
        },
        body: JSON.stringify({
            message: message.value,
            lang: "auto", 
        }),
    });
    const response = await responseRaw.json();

    console.log({ response })

    await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
        body: {
            type: 4,
            data: {
                content: response.content,
            },
        },
    });

    return NextResponse.json({ success: true }, { status: 200 });
}

async function handleSearchBlueprintsCommand(interaction: APIChatInputApplicationCommandInteraction) {
    const query = interaction.data.options?.find(option => option.name === 'query' && option.type === 3) as { value: string } | undefined;
    if (!query?.value) {
        await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
            body: {
                type: 4,
                data: {
                    content: 'Veuillez fournir une requête de recherche.',
                    flags: 64, // Ephemeral
                },
            },
        });
        return NextResponse.json({ success: true }, { status: 200 });
    }

    const blueprints = await searchBlueprints(query.value, { fuzzy: true });

    await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
        body: {
            type: 4,
            data: {
                content: `Voici les blueprints correspondant à votre recherche : ${query.value}\n${blueprints.map(bp => `- ${bp.name}`).join('\n')}`,
            },
        },
    });

    return NextResponse.json({ success: true }, { status: 200 });
}