"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GlobeAltIcon, LockClosedIcon } from "@heroicons/react/24/outline";

/**
 * « Ajouter un lieu » commence par un choix : public, c'est une contribution
 * relue qui rapporte des points ; privé, il existe tout de suite, pour soi et
 * une organisation. Les deux formulaires sont prêts, le choix montre l'un.
 */
export function AddPlaceChoice({
  points,
  initial,
  publicPart,
  privatePart,
}: {
  points: number;
  initial: "public" | "private";
  publicPart: React.ReactNode;
  privatePart: React.ReactNode;
}) {
  const t = useTranslations("PrivatePlaces");
  const [choice, setChoice] = useState(initial);

  const option = (
    value: "public" | "private",
    icon: React.ReactNode,
    title: React.ReactNode,
    hint: string,
  ) => {
    const checked = choice === value;
    return (
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
          checked
            ? value === "private"
              ? "border-[#c4b2ff] bg-[#c4b2ff]/10 ring-1 ring-[#c4b2ff]"
              : "border-[#9ED0FF] bg-[#9ED0FF]/10 ring-1 ring-[#9ED0FF]"
            : "border-[#9ED0FF]/25 hover:bg-white/5"
        }`}
      >
        <input
          type="radio"
          name="place-visibility"
          checked={checked}
          onChange={() => setChoice(value)}
          className={`mt-1 size-4 ${value === "private" ? "accent-[#c4b2ff]" : "accent-[#C2E2FF]"}`}
        />
        <span className="space-y-0.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label={t("choiceLabel")}
        className="grid gap-3 sm:grid-cols-2"
      >
        {option(
          "public",
          <GlobeAltIcon className="size-4" />,
          <>
            {t("choicePublic")}
            <span className="font-mono text-[11px] font-bold text-amber-200">
              +{points}
            </span>
          </>,
          t("choicePublicHint"),
        )}
        {option(
          "private",
          <LockClosedIcon className="size-4" />,
          t("choicePrivate"),
          t("choicePrivateHint"),
        )}
      </div>
      <div hidden={choice !== "public"}>{publicPart}</div>
      <div hidden={choice !== "private"}>{privatePart}</div>
    </div>
  );
}
