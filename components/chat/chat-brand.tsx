"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * Le haut du chat, comme sur les visuels promo : le logo, « Nexus Chat » et,
 * quand le joueur y a accès, « En ligne ».
 */
export function ChatBrand({
  online,
  as: Title = "h2",
}: {
  online: boolean;
  as?: "h1" | "h2";
}) {
  const t = useTranslations("Chat");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <Image
        alt=""
        src="/nexus_logo_square.png"
        className="size-7 shrink-0"
        width={28}
        height={28}
      />
      <Title className="truncate text-base font-bold text-[#EAF3FF]">
        {t("title")}
      </Title>
      {online && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pr-1 text-xs text-[#4ADE80]">
          <span
            className="size-1.5 rounded-full bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]"
            aria-hidden
          />
          {t("online")}
        </span>
      )}
    </div>
  );
}
