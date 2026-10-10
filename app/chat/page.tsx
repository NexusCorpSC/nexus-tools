import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { getChatStatus } from "@/lib/chat/access";
import {
  cleanMessages,
  getConversation,
  listConversations,
} from "@/lib/chat/conversations";
import { Button } from "@/components/ui/button";
import { ChatClient } from "@/components/chat/chat-client";
import { CHAT_ID_PATTERN } from "@/types/chat";

export const metadata: Metadata = {
  title: "Nexus Chat",
  description:
    "Un assistant qui connaît Nexus Tools : il cherche objets, lieux et annonces, et gère votre inventaire et vos commandes avec votre accord.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const t = await getTranslations("Chat");
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold">{t("title")}</h1>
        <p>{t("connectToUse")}</p>
        <Button asChild>
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  const userId = new ObjectId(session.user.id);
  const { c } = await searchParams;
  const requested = typeof c === "string" && CHAT_ID_PATTERN.test(c) ? c : null;

  const [status, conversations, conversation] = await Promise.all([
    getChatStatus(userId),
    listConversations(userId),
    requested ? getConversation(userId, requested) : null,
  ]);

  return (
    <div className="m-2 mx-auto max-w-7xl">
      <ChatClient
        initialStatus={status}
        initialConversations={conversations}
        initialConversation={
          conversation
            ? {
                id: conversation._id,
                messages: cleanMessages(conversation.messages),
              }
            : null
        }
      />
    </div>
  );
}
