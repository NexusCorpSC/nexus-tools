"use client";

import { isToolUIPart, type DynamicToolUIPart } from "ai";
import { useTranslations } from "next-intl";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { toolLabel, type ChatUIMessage } from "@/lib/chat/client";

type ToolPart = DynamicToolUIPart;

/** Ce qui s'affiche d'une réponse : du texte, des outils, une confirmation. */
type Block =
  | { kind: "text"; key: number; text: string }
  | { kind: "tools"; key: string; parts: ToolPart[]; closed: boolean }
  | { kind: "approval"; key: string; part: ToolPart };

/**
 * Les parties d'une réponse, les outils qui se suivent regroupés : ils
 * s'affichent en pastilles côte à côte. Une écriture confirmée ou refusée
 * ferme son groupe : son résumé suit juste en dessous d'elle.
 */
function blocks(message: ChatUIMessage): Block[] {
  const result: Block[] = [];
  message.parts.forEach((part, index) => {
    if (part.type === "text") {
      if (part.text.trim()) {
        result.push({ kind: "text", key: index, text: part.text });
      }
      return;
    }
    if (!isToolUIPart(part)) return;
    const tool = part as ToolPart;
    if (tool.state === "approval-requested") {
      result.push({ kind: "approval", key: tool.toolCallId, part: tool });
      return;
    }
    const previous = result.at(-1);
    if (previous?.kind === "tools" && !previous.closed && !tool.approval) {
      previous.parts.push(tool);
    } else {
      result.push({
        kind: "tools",
        key: tool.toolCallId,
        parts: [tool],
        closed: Boolean(tool.approval),
      });
    }
  });
  return result;
}

/**
 * Un message de la conversation : le texte du joueur, ou la réponse de
 * l'assistant avec les outils qu'il a appelés et les confirmations qu'il
 * attend.
 */
export function ChatMessage({
  message,
  onApproval,
  disabled,
}: {
  message: ChatUIMessage;
  onApproval: (approvalId: string, approved: boolean) => void;
  disabled?: boolean;
}) {
  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");
    return (
      <div className="flex justify-end">
        <div className="chat-bubble max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2 text-sm text-white shadow-md shadow-black/20">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[#DBE9FA]">
      {blocks(message).map((block) => {
        switch (block.kind) {
          case "text":
            return <ChatMarkdown key={block.key} content={block.text} />;
          case "tools":
            return <ToolChips key={block.key} parts={block.parts} />;
          case "approval":
            return (
              <ApprovalCard
                key={block.key}
                part={block.part}
                onApproval={onApproval}
                disabled={disabled}
              />
            );
        }
      })}
    </div>
  );
}

/** Le nom d'un outil pour le joueur, ou son nom technique s'il est nouveau. */
function useToolName() {
  const t = useTranslations("Chat.tool");
  return (toolName: string | undefined) => {
    const key = `names.${toolName ?? ""}`;
    return t.has(key) ? t(key) : toolLabel(toolName ?? "");
  };
}

/** La confirmation qu'attend une écriture (commande, ajout, contribution…). */
function ApprovalCard({
  part,
  onApproval,
  disabled,
}: {
  part: ToolPart;
  onApproval: (approvalId: string, approved: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Chat.tool");
  const toolName = useToolName();
  if (part.state !== "approval-requested") return null;

  return (
    <div className="chat-confirm space-y-3 rounded-2xl border border-[#8FD0FF]/45 p-4">
      <p className="text-[11px] font-bold tracking-[0.18em] text-[#8FD0FF] uppercase">
        {t("approvalTitle")}
      </p>
      <p className="whitespace-pre-wrap text-sm text-[#CFE2F7]">
        {part.approval.requestReason || toolName(part.toolName)}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onApproval(part.approval.id, false)}
        >
          {t("decline")}
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onApproval(part.approval.id, true)}
        >
          {t("confirm")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Les outils appelés à la suite, en pastilles : en cours, faits, refusés ou
 * en erreur. Le résumé d'une écriture confirmée ou refusée suit en dessous.
 */
function ToolChips({ parts }: { parts: ToolPart[] }) {
  const t = useTranslations("Chat.tool");
  const toolName = useToolName();

  const chips = parts.map((part) => {
    const name = toolName(part.toolName);
    let icon = <Loader2 className="size-3.5 animate-spin" aria-hidden />;
    let label = t("running", { name });
    let tone = "border-[#3AA0DC]/35 bg-[#3AA0DC]/12 text-[#8FD0FF]";
    let detail: string | undefined;
    switch (part.state) {
      case "approval-responded":
        label = part.approval.approved
          ? t("confirmed", { name })
          : t("declined", { name });
        break;
      case "output-available":
        icon = <Done />;
        label = part.approval
          ? t("confirmedDone", { name })
          : t("done", { name });
        detail = part.approval?.requestReason;
        break;
      case "output-denied":
        icon = <X className="size-3.5" aria-hidden />;
        tone = "border-[#9ED0FF]/20 bg-transparent text-[#8FB1D6]";
        // Refusé par le joueur, ou par le serveur (argument refusé…).
        label = part.approval.isAutomatic
          ? t("refused", { name })
          : t("declined", { name });
        detail = part.approval.isAutomatic
          ? part.approval.reason
          : part.approval.requestReason;
        break;
      case "output-error":
        icon = <X className="size-3.5" aria-hidden />;
        tone = "border-[#F7A8A8]/35 bg-[#F7A8A8]/10 text-[#F7C4C4]";
        label = t("failed", { name });
        break;
    }
    return { id: part.toolCallId, icon, label, tone, detail };
  });

  return (
    <div className="space-y-1.5">
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li
            key={chip.id}
            className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs ${chip.tone}`}
          >
            {chip.icon}
            <span className="truncate">{chip.label}</span>
          </li>
        ))}
      </ul>
      {chips.map(
        (chip) =>
          chip.detail && (
            <p
              key={chip.id}
              className="whitespace-pre-wrap border-l-2 border-[#8FD0FF]/25 pl-3 text-xs text-[#8FB1D6]"
            >
              {chip.detail}
            </p>
          ),
      )}
    </div>
  );
}

/** La coche pleine d'un outil fait. */
function Done() {
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#4ADE80] text-[#052E16]"
      aria-hidden
    >
      <Check className="size-2.5" strokeWidth={4} />
    </span>
  );
}
