import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createHmac } from "node:crypto";
import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isToolUIPart,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type StopCondition,
  type ToolSet,
} from "ai";
import { auth } from "@/lib/auth";
import { getUserLocale } from "@/i18n/locale";
import {
  getChatSettings,
  getChatStatus,
  recordChatUsage,
} from "@/lib/chat/access";
import {
  cleanMessages,
  getConversation,
  MAX_HISTORY_MESSAGES,
  saveConversation,
  titleFrom,
  type ChatUIMessage,
} from "@/lib/chat/conversations";
import { chatInstructions } from "@/lib/chat/instructions";
import { openChatTools } from "@/lib/chat/mcp";
import {
  stepCostMicros,
  tokenCounts,
  type UsageIteration,
} from "@/lib/chat/pricing";
import {
  CHAT_ID_PATTERN,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatErrorCode,
} from "@/types/chat";

/**
 * POST /api/chat
 * Une réponse de Nexus Chat, en flux (protocole UI de l'AI SDK, `useChat`).
 * Sert le site et l'app de bureau, qui envoient le cookie de session.
 *
 * Body: { id, message }
 * - `id` : la conversation (créée au premier message) ;
 * - `message` : le nouveau message du joueur, ou le dernier message de
 *   l'assistant avec les réponses du joueur aux confirmations.
 *
 * L'historique vient de la base, pas du client : seul le texte d'un nouveau
 * message, ou la réponse (oui / non) à une confirmation en attente, est pris
 * de la requête. Les confirmations sont en plus signées par le serveur
 * (`experimental_toolApprovalSecret`).
 */
export const maxDuration = 300;

/** Nombre d'étapes (appel du modèle, puis outils) par réponse. */
const MAX_STEPS = 12;

/** Sortie maximale d'une étape : borne ce qu'une étape peut dépasser du budget. */
const MAX_OUTPUT_TOKENS = 4096;

const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

function error(code: ChatErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** La clé qui signe les confirmations, dérivée du secret du site. */
function approvalSecret(): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update("nexus-chat-tool-approvals")
    .digest("base64url");
}

/** Le texte d'un nouveau message du joueur, ou `null` s'il n'en est pas un. */
function userText(message: ChatUIMessage): string | null {
  if (message.role !== "user" || !Array.isArray(message.parts)) return null;
  const text = message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text && text.length <= CHAT_MESSAGE_MAX_LENGTH ? text : null;
}

/**
 * Reporte sur le dernier message enregistré les réponses du joueur aux
 * confirmations en attente — et rien d'autre du message du client.
 * `null` si le message ne répond à aucune confirmation en attente.
 */
function applyApprovals(
  stored: ChatUIMessage,
  incoming: ChatUIMessage,
): ChatUIMessage | null {
  if (incoming.id !== stored.id || !Array.isArray(incoming.parts)) return null;
  const answers = new Map<string, boolean>();
  for (const part of incoming.parts) {
    if (!isToolUIPart(part) || part.state !== "approval-responded") continue;
    if (typeof part.approval?.approved !== "boolean") continue;
    answers.set(part.approval.id, part.approval.approved);
  }
  let changed = false;
  const parts = stored.parts.map((part) => {
    if (!isToolUIPart(part) || part.state !== "approval-requested") return part;
    const approved = answers.get(part.approval.id);
    if (approved === undefined) return part;
    changed = true;
    return {
      ...part,
      state: "approval-responded" as const,
      approval: { ...part.approval, approved },
    };
  });
  return changed ? ({ ...stored, parts } as ChatUIMessage) : null;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return error("unauthorized", 401);
  const userId = new ObjectId(session.user.id);

  let body: { id?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("invalid_request", 400);
  }
  const id = body.id;
  const message = body.message as ChatUIMessage | undefined;
  if (
    typeof id !== "string" ||
    !CHAT_ID_PATTERN.test(id) ||
    !message ||
    typeof message !== "object"
  ) {
    return error("invalid_request", 400);
  }

  const [settings, status] = await Promise.all([
    getChatSettings(),
    getChatStatus(userId),
  ]);
  if (!settings.enabled) return error("disabled", 403);
  if (status.status !== "granted") return error("no_access", 403);
  if (status.remainingMicros <= 0) return error("budget_exhausted", 402);

  // L'historique, et ce que la requête y ajoute.
  const conversation = await getConversation(userId, id);
  const history = cleanMessages(conversation?.messages ?? []);
  let messages: ChatUIMessage[];
  let title = conversation?.title ?? "";
  const text = userText(message);
  if (text !== null) {
    // Un nouvel essai d'un message déjà envoyé (après une erreur, ou
    // « Réessayer ») reprend la conversation à ce message.
    const retryAt = history.findIndex(
      (entry) => entry.role === "user" && entry.id === message.id,
    );
    messages = [
      ...(retryAt >= 0 ? history.slice(0, retryAt) : history),
      {
        id: typeof message.id === "string" ? message.id : generateMessageId(),
        role: "user",
        parts: [{ type: "text", text }],
      },
    ];
    if (!title) title = titleFrom(text);
  } else {
    const last = history.at(-1);
    const answered = last ? applyApprovals(last, message) : null;
    if (!last || !answered) return error("invalid_request", 400);
    messages = [...history.slice(0, -1), answered];
  }

  let chat;
  try {
    chat = await openChatTools(session.user.id);
  } catch (cause) {
    console.error({ message: "Nexus Chat: MCP tools unavailable", cause });
    return error("unavailable", 503);
  }
  const { client, tools, approval } = chat;

  const model = settings.model;
  const remaining = status.remainingMicros;
  let spent = 0;
  let budgetExhausted = false;
  const budgetReached: StopCondition<ToolSet> = () => {
    budgetExhausted = spent >= remaining;
    return budgetExhausted;
  };

  const providerOptions = {
    // Le cache de prompt : instructions, outils, puis l'historique.
    cacheControl: { type: "ephemeral" },
    metadata: { userId: session.user.id },
    // Haiku n'a pas de repli côté serveur ; Sonnet et Opus en ont un.
    ...(model !== "claude-haiku-5-5" && { fallbacks: "default" as const }),
  } satisfies AnthropicLanguageModelOptions;

  const result = streamText({
    model: anthropic(model),
    instructions: chatInstructions({
      serverInstructions: client.instructions,
      locale: await getUserLocale(),
      playerName: session.user.name,
    }),
    messages: await convertToModelMessages(
      messages.slice(-MAX_HISTORY_MESSAGES),
      { tools, ignoreIncompleteToolCalls: true },
    ),
    tools,
    toolApproval: ({ toolCall }) => approval(toolCall.toolName, toolCall.input),
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: [stepCountIs(MAX_STEPS), budgetReached],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: { anthropic: providerOptions },
    onStepEnd: async (step) => {
      const iterations = (
        step.providerMetadata?.anthropic as
          | { iterations?: UsageIteration[] | null }
          | undefined
      )?.iterations;
      const cost = stepCostMicros(model, step.usage, iterations);
      spent += cost;
      await recordChatUsage({
        userId,
        conversationId: id,
        model: step.response?.modelId ?? model,
        ...tokenCounts(step.usage),
        costMicros: cost,
        createdAt: new Date(),
      }).catch((cause) =>
        console.error({ message: "Nexus Chat: usage not recorded", cause }),
      );
    },
    onEnd: async () => {
      await client.close().catch(() => {});
    },
    onError: async ({ error: cause }) => {
      console.error({ message: "Nexus Chat: generation failed", cause });
      await client.close().catch(() => {});
    },
  });

  // La réponse va jusqu'au bout (et s'enregistre) même si le joueur ferme
  // la page en cours de route.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, ChatUIMessage>({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId,
      messageMetadata: ({ part }) =>
        part.type === "finish"
          ? {
              costMicros: spent,
              remainingMicros: Math.max(0, remaining - spent),
              budgetExhausted,
            }
          : undefined,
      onError: () => "error",
      onEnd: async ({ messages: updated }) => {
        await saveConversation(userId, id, updated, title || "…").catch(
          (cause) => console.error({ message: "Nexus Chat: not saved", cause }),
        );
      },
    }),
  });
}
