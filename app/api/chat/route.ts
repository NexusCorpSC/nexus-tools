import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
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
  type ChatSettings,
} from "@/lib/chat/access";
import {
  cleanMessages,
  getConversation,
  hasConfirmedWrite,
  modelWindow,
  saveConversation,
  titleFrom,
  type ChatUIMessage,
} from "@/lib/chat/conversations";
import { chatInstructions } from "@/lib/chat/instructions";
import {
  acquireChatLock,
  chatStopRequested,
  releaseChatLock,
} from "@/lib/chat/lock";
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
 *
 * Une seule réponse à la fois par joueur (`lib/chat/lock.ts`) : une autre
 * requête pendant ce temps reçoit `busy`.
 */
export const maxDuration = 300;

/** Nombre d'étapes (appel du modèle, puis outils) par réponse. */
const MAX_STEPS = 12;

/** Sortie maximale d'une étape : borne ce qu'une étape peut dépasser du budget. */
const MAX_OUTPUT_TOKENS = 4096;

/** Le verrou d'une réponse survit à `maxDuration`, avec de la marge. */
const LOCK_TTL_MS = (maxDuration + 60) * 1000;

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

/**
 * La conversation telle que la requête la prolonge : l'historique de la
 * base, plus le nouveau message du joueur ou ses réponses aux
 * confirmations. `null` si la requête ne prolonge rien.
 */
function extend(
  history: ChatUIMessage[],
  message: ChatUIMessage,
): ChatUIMessage[] | null {
  const text = userText(message);
  if (text === null) {
    const last = history.at(-1);
    const answered = last ? applyApprovals(last, message) : null;
    return answered ? [...history.slice(0, -1), answered] : null;
  }
  // Un nouvel essai d'un message déjà envoyé (après une erreur, ou
  // « Réessayer ») reprend la conversation à ce message… sauf si la réponse
  // a déjà fait une écriture confirmée : la rejouer la referait (une
  // commande en double). Le message suit alors la conversation, qui garde
  // l'écriture.
  const retryAt = history.findIndex(
    (entry) => entry.role === "user" && entry.id === message.id,
  );
  const replay =
    retryAt >= 0 && !history.slice(retryAt + 1).some(hasConfirmedWrite);
  const keepId =
    typeof message.id === "string" && message.id !== "" && retryAt < 0;
  return [
    ...(replay ? history.slice(0, retryAt) : history),
    {
      id: keepId || replay ? message.id : generateMessageId(),
      role: "user",
      parts: [{ type: "text", text }],
    },
  ];
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

  const settings = await getChatSettings();
  if (!settings.enabled) return error("disabled", 403);

  // Une réponse à la fois par joueur : le budget et l'historique lus
  // ci-dessous restent vrais jusqu'à la fin de celle-ci.
  const lock = await acquireChatLock(userId, id, LOCK_TTL_MS);
  if (!lock) return error("busy", 409);

  let response: Response;
  let streaming = false;
  try {
    response = await respond({
      userId,
      userName: session.user.name,
      id,
      message,
      settings,
      lock,
      onStream: () => {
        streaming = true;
      },
    });
  } catch (cause) {
    console.error({ message: "Nexus Chat: request failed", cause });
    response = error("unavailable", 503);
  }
  // Sans flux, rien d'autre ne rendra le verrou.
  if (!streaming) await releaseChatLock(userId, lock).catch(() => {});
  return response;
}

/** Lit un flux jusqu'au bout, sans rien en garder. */
async function drain(stream: ReadableStream<unknown>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (!(await reader.read()).done) {
      // Rien : c'est la lecture qui fait avancer la réponse.
    }
  } catch (cause) {
    console.error({ message: "Nexus Chat: stream failed", cause });
  }
}

async function respond({
  userId,
  userName,
  id,
  message,
  settings,
  lock,
  onStream,
}: {
  userId: ObjectId;
  userName: string;
  id: string;
  message: ChatUIMessage;
  settings: ChatSettings;
  lock: string;
  /** Le flux part : c'est lui qui rendra le verrou, à sa fin. */
  onStream: () => void;
}): Promise<Response> {
  const status = await getChatStatus(userId, settings);
  if (status.status !== "granted") return error("no_access", 403);
  if (status.remainingMicros <= 0) return error("budget_exhausted", 402);

  const conversation = await getConversation(userId, id);
  const history = cleanMessages(conversation?.messages ?? []);
  const messages = extend(history, message);
  if (!messages) return error("invalid_request", 400);
  let title = conversation?.title ?? "";
  if (!title) {
    const text = userText(message);
    if (text !== null) title = titleFrom(text);
  }

  // Une nouvelle conversation est réservée, avec le message du joueur, avant
  // de faire tourner le modèle : un identifiant déjà pris par un autre
  // joueur est refusé avant d'avoir rien coûté.
  if (!conversation) {
    const saved = await saveConversation(userId, id, messages, title || "…");
    if (!saved) return error("invalid_request", 400);
  }

  const locale = await getUserLocale();

  let chat;
  try {
    chat = await openChatTools(userId.toHexString());
  } catch (cause) {
    console.error({ message: "Nexus Chat: MCP tools unavailable", cause });
    return error("unavailable", 503);
  }
  const { client, tools, approval } = chat;

  try {
    const modelMessages = await convertToModelMessages(modelWindow(messages), {
      tools,
      ignoreIncompleteToolCalls: true,
    });

    const model = settings.model;
    const remaining = status.remainingMicros;
    let spent = 0;
    let lastStepCost = 0;
    let budgetExhausted = false;
    let stopRequested = false;
    // Une étape coûte au moins la précédente (l'historique ne fait que
    // grandir) : on s'arrête avant celle qui dépasserait le budget.
    const budgetReached: StopCondition<ToolSet> = () => {
      budgetExhausted = spent + lastStepCost >= remaining;
      return budgetExhausted;
    };
    const stopped: StopCondition<ToolSet> = () => stopRequested;

    const providerOptions = {
      // Le cache de prompt : instructions, outils, puis l'historique.
      cacheControl: { type: "ephemeral" },
      metadata: { userId: userId.toHexString() },
      // Haiku n'a pas de repli côté serveur ; Sonnet et Opus en ont un.
      ...(model !== "claude-haiku-5-5" && { fallbacks: "default" as const }),
    } satisfies AnthropicLanguageModelOptions;

    const result = streamText({
      model: anthropic(model),
      instructions: chatInstructions({
        serverInstructions: client.instructions,
        locale,
        playerName: userName,
      }),
      messages: modelMessages,
      tools,
      toolApproval: ({ toolCall }) =>
        approval(toolCall.toolName, toolCall.input),
      experimental_toolApprovalSecret: approvalSecret(),
      stopWhen: [stepCountIs(MAX_STEPS), stopped, budgetReached],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: { anthropic: providerOptions },
      onStepEnd: async (step) => {
        const iterations = (
          step.providerMetadata?.anthropic as
            | { iterations?: UsageIteration[] | null }
            | undefined
        )?.iterations;
        const cost = stepCostMicros(
          model,
          step.usage,
          iterations,
          settings.pricing,
        );
        spent += cost;
        lastStepCost = cost;
        const [stop] = await Promise.all([
          chatStopRequested(userId, lock).catch(() => false),
          recordChatUsage({
            userId,
            conversationId: id,
            model: step.response?.modelId ?? model,
            ...tokenCounts(step.usage),
            costMicros: cost,
            createdAt: new Date(),
          }).catch((cause) =>
            console.error({ message: "Nexus Chat: usage not recorded", cause }),
          ),
        ]);
        stopRequested = stop;
      },
      onEnd: async () => {
        await client.close().catch(() => {});
      },
      onError: async ({ error: cause }) => {
        console.error({ message: "Nexus Chat: generation failed", cause });
        await client.close().catch(() => {});
      },
    });

    // L'heure d'enregistrement, fixée au bloc `finish` : l'app la lit dans
    // les métadonnées pour savoir ce qu'elle affiche déjà.
    let savedAt = new Date();
    const stream = toUIMessageStream<ToolSet, ChatUIMessage>({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId,
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return undefined;
        savedAt = new Date();
        return {
          costMicros: spent,
          remainingMicros: Math.max(0, remaining - spent),
          budgetExhausted: budgetExhausted && !stopRequested,
          savedAt: savedAt.toISOString(),
        };
      },
      onError: () => "error",
      onEnd: async ({ messages: updated }) => {
        await saveConversation(
          userId,
          id,
          updated,
          title || "…",
          savedAt,
        ).catch((cause) =>
          console.error({ message: "Nexus Chat: not saved", cause }),
        );
        await releaseChatLock(userId, lock).catch(() => {});
      },
    });

    // La réponse va jusqu'au bout, s'enregistre et rend le verrou même si
    // le joueur ferme la page en cours de route : le serveur lit sa propre
    // copie du flux, le navigateur l'autre. « Arrêter » passe par
    // `/api/chat/stop`.
    const [toClient, toServer] = stream.tee();
    after(drain(toServer));
    onStream();
    return createUIMessageStreamResponse({ stream: toClient });
  } catch (cause) {
    // Le flux n'est pas parti : ses `onEnd` et `onError` ne fermeront pas le
    // client MCP.
    await client.close().catch(() => {});
    throw cause;
  }
}
