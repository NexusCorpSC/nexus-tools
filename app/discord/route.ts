import { getBlueprintBySlug, searchBlueprints } from "@/lib/crafting";
import { REST } from "@discordjs/rest";
import {
  APIChatInputApplicationCommandInteraction,
  APIMessageComponentSelectMenuInteraction,
  InteractionType,
  Routes,
} from "discord-api-types/v10";
import { verify } from "discord-verify/node";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  ActionRowBuilder,
  EmbedBuilder,
  SelectMenuBuilder,
  SelectMenuOptionBuilder,
} from "@discordjs/builders";

const agentId = "eee0b470-5a15-40f0-bb0d-ff816867ab50";
const aiAllowedDiscordIds = JSON.parse(
  process.env.AI_ALLOWED_DISCORD_IDS ?? "[]",
) as string[];

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_TOKEN ?? "",
);

export async function POST(req: Request) {
  const body = await req.json();

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = JSON.stringify(body);

  console.debug(body);

  const isValid = await verify(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY ?? "",
    crypto.webcrypto.subtle,
  );

  if (!isValid) {
    console.warn("Invalid request signature");
    return NextResponse.json({ success: false }, { status: 403 });
  }

  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  } else if (body.type === InteractionType.ApplicationCommand) {
    return handleApplicationCommand(
      body as APIChatInputApplicationCommandInteraction,
    );
  } else if (body.type === InteractionType.MessageComponent) {
    return handleComponentSelectMenuInteraction(
      body as APIMessageComponentSelectMenuInteraction,
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

async function handleComponentSelectMenuInteraction(
  interaction: APIMessageComponentSelectMenuInteraction,
) {
  if (interaction.data.custom_id === "bp-slug") {
    console.log(interaction.data);
    const slug = interaction.data.values[0];

    const blueprint = await getBlueprintBySlug(slug);

    if (!blueprint) {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: "Ce blueprint n'existe pas.",
              flags: 64, // Ephemeral
            },
          },
        },
      );
      return NextResponse.json({ success: true }, { status: 200 });
    }

    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: `Informations pour : ${blueprint.name}`,
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  } else {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Interaction inconnue.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

async function handleApplicationCommand(
  body: APIChatInputApplicationCommandInteraction,
) {
  if (body.data.name === "blueprints") {
    return handleSearchBlueprintsCommand(body);
  } else if (body.data.name === "ask") {
    return handleAskCommand(body);
  }
}

async function handleAskCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  const message = interaction.data.options?.find(
    (option) => option.name === "message" && option.type === 3,
  ) as { value: string } | undefined;
  if (!message?.value) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Veuillez fournir un message.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const userDiscordId = interaction.user?.id ?? interaction.member?.user?.id;
  if (!userDiscordId) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Impossible de récupérer votre ID Discord.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  }
  if (!aiAllowedDiscordIds.includes(userDiscordId)) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content:
              "Votre compte Discord n'est pas autorisé à utiliser cette commande en langage naturel.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  }

  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: "I'm looking into it...",
        },
      },
    },
  );

  const responseRaw = await fetch(
    `${process.env.BREIGN_ENDPOINT}/agents/${agentId}/prompts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.BREIGN_API_KEY ?? "",
      },
      body: JSON.stringify({
        message: message.value,
        lang: "auto",
      }),
    },
  );
  const response = await responseRaw.json();

  await rest.patch(
    Routes.webhookMessage(
      interaction.application_id,
      interaction.token,
      "@original",
    ),
    {
      body: {
        content: response.text,
      },
    },
  );

  return NextResponse.json({ success: true }, { status: 200 });
}

async function handleSearchBlueprintsCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  const query = interaction.data.options?.find(
    (option) => option.name === "query" && option.type === 3,
  ) as { value: string } | undefined;
  if (!query?.value) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Veuillez fournir une requête de recherche.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const blueprints = await searchBlueprints(query.value, { fuzzy: true });

  const embed = new EmbedBuilder().setDescription(
    "Voici quelques blueprints correspondant à votre recherche :",
  );
  const actionRow = new ActionRowBuilder<SelectMenuBuilder>().addComponents(
    new SelectMenuBuilder().setCustomId("bp-slug").setOptions(
      blueprints.map((bp) => {
        return new SelectMenuOptionBuilder()
          .setLabel(bp.name)
          .setValue(bp.slug)
          .setDescription(`${bp.category} > ${bp.subcategory}`);
      }),
    ),
  );

  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: `Voici quelques blueprints correspondant à votre recherche : ${query.value}`,
          components: [actionRow.toJSON()],
        },
      },
    },
  );

  return NextResponse.json({ success: true }, { status: 200 });
}
