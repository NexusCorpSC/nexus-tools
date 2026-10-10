"use client";

import { isToolUIPart, type DynamicToolUIPart } from "ai";
import { useTranslations } from "next-intl";
import {
  Check,
  CircleAlert,
  Loader2,
  ShieldQuestion,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";
import { toolLabel, type ChatUIMessage } from "@/lib/chat/client";

type ToolPart = DynamicToolUIPart;

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
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#1A5C8A]/70 px-4 py-2 text-sm text-[#F2F7FC]">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return part.text.trim() ? (
            <MarkdownContent key={index} content={part.text} />
          ) : null;
        }
        if (isToolUIPart(part)) {
          return (
            <ToolCard
              key={part.toolCallId}
              part={part as ToolPart}
              onApproval={onApproval}
              disabled={disabled}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ToolCard({
  part,
  onApproval,
  disabled,
}: {
  part: ToolPart;
  onApproval: (approvalId: string, approved: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Chat.tool");
  const name = toolLabel(part.toolName ?? "");

  if (part.state === "approval-requested") {
    return (
      <div className="space-y-3 rounded-xl border border-[#F7D2AE]/40 bg-[#3A2A12]/40 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#F7D2AE]">
          <ShieldQuestion className="size-4" aria-hidden />
          {t("approvalTitle")}
        </p>
        <p className="whitespace-pre-wrap text-sm text-[#F2F7FC]">
          {part.approval.requestReason || name}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onApproval(part.approval.id, true)}
          >
            {t("confirm")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onApproval(part.approval.id, false)}
          >
            {t("decline")}
          </Button>
        </div>
      </div>
    );
  }

  let icon = <Loader2 className="size-3.5 animate-spin" aria-hidden />;
  let label = t("running", { name });
  let detail: string | undefined;
  switch (part.state) {
    case "approval-responded":
      label = part.approval.approved
        ? t("confirmed", { name })
        : t("declined", { name });
      break;
    case "output-available":
      icon = <Check className="size-3.5 text-[#9EE6B8]" aria-hidden />;
      label = part.approval
        ? t("confirmedDone", { name })
        : t("done", { name });
      detail = part.approval?.requestReason;
      break;
    case "output-denied":
      icon = <X className="size-3.5 text-[#F7D2AE]" aria-hidden />;
      // Refusé par le joueur, ou par le serveur (argument refusé…).
      label = part.approval.isAutomatic
        ? t("refused", { name })
        : t("declined", { name });
      detail = part.approval.isAutomatic
        ? part.approval.reason
        : part.approval.requestReason;
      break;
    case "output-error":
      icon = <CircleAlert className="size-3.5 text-[#F7A8A8]" aria-hidden />;
      label = t("failed", { name });
      break;
    case "input-streaming":
    case "input-available":
      icon = (
        <span className="flex items-center gap-1">
          <Wrench className="size-3.5" aria-hidden />
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        </span>
      );
      break;
  }

  return (
    <div className="rounded-lg border border-[#9ED0FF]/12 bg-[#092840]/60 px-3 py-1.5 text-xs text-[#F2F7FC]/70">
      <p className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </p>
      {detail && (
        <p className="mt-1 whitespace-pre-wrap pl-5.5 text-[#F2F7FC]/60">
          {detail}
        </p>
      )}
    </div>
  );
}
