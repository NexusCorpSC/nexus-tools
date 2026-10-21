"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/markdown-content";
import {
  ContributionMetaFields,
  useContribute,
  type ContributionMetaValue,
} from "@/app/contributions/contribute-kit";
import {
  MAX_TIMELINE_GUIDE_BODY_LENGTH,
  MAX_TIMELINE_GUIDE_TITLE_LENGTH,
} from "@/types/timeline-events";

/** Une section du guide : un titre, du markdown, et l'aperçu à côté. */
export function GuideForm({
  slug,
  sectionId,
  initialTitle,
  initialBody,
  otherTitles,
  contributionId,
  source,
  gameVersion,
}: {
  slug: string;
  /** Absent : une nouvelle section, ajoutée en fin de guide. */
  sectionId?: string;
  initialTitle: string;
  initialBody: string;
  otherTitles: string[];
  contributionId?: string;
  source?: string;
  gameVersion?: string;
}) {
  const t = useTranslations("Timeline.Guide");
  const tForm = useTranslations("Contributions.Form");
  const router = useRouter();
  const { contribute, errorMessage } = useContribute();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [preview, setPreview] = useState(false);
  const [meta, setMeta] = useState<ContributionMetaValue>({
    source: source ?? "",
    gameVersion: gameVersion ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const duplicate = otherTitles.some(
    (other) => other.trim().toLowerCase() === title.trim().toLowerCase(),
  );

  const send = (remove: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await contribute(
        {
          kind: "timelineEdit",
          slug,
          input: remove
            ? { guideRemoved: [sectionId] }
            : { guide: [{ ...(sectionId ? { id: sectionId } : {}), title, body }] },
        },
        { ...meta, contributionId },
      );
      if (!result.ok) {
        setError(errorMessage(result));
        return;
      }
      router.push(`/timeline/${slug}`);
      router.refresh();
    });
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        send(false);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="guide-title">{t("sectionTitle")}</Label>
        <Input
          id="guide-title"
          required
          maxLength={MAX_TIMELINE_GUIDE_TITLE_LENGTH}
          value={title}
          placeholder={t("sectionTitlePlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
        />
        {duplicate && (
          <p className="text-xs text-amber-200">{t("duplicateTitle")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="guide-body">{t("body")}</Label>
          <div role="tablist" className="flex gap-1 text-xs">
            {[false, true].map((mode) => (
              <button
                key={String(mode)}
                type="button"
                role="tab"
                aria-selected={preview === mode}
                onClick={() => setPreview(mode)}
                className={`rounded-md px-2 py-1 ${
                  preview === mode
                    ? "bg-[#9ED0FF]/15 text-[#E3F1FF]"
                    : "text-muted-foreground hover:text-nexus"
                }`}
              >
                {mode ? t("preview") : t("write")}
              </button>
            ))}
          </div>
        </div>
        {preview ? (
          <div className="min-h-64 rounded-md border border-[#9ED0FF]/20 bg-[#030912]/25 p-4">
            {body.trim() ? (
              <MarkdownContent content={body} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("previewEmpty")}</p>
            )}
          </div>
        ) : (
          <Textarea
            id="guide-body"
            rows={14}
            maxLength={MAX_TIMELINE_GUIDE_BODY_LENGTH}
            value={body}
            placeholder={t("bodyPlaceholder")}
            onChange={(event) => setBody(event.target.value)}
            className="font-mono text-[13px]"
          />
        )}
        <p className="text-xs text-muted-foreground">
          {t("bodyHint", {
            count: body.length,
            max: MAX_TIMELINE_GUIDE_BODY_LENGTH,
          })}
        </p>
      </div>

      <ContributionMetaFields value={meta} onChange={setMeta} />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={pending || !title.trim()}>
          {tForm("submit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          {t("cancel")}
        </Button>
        {sectionId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("removeConfirm"))) send(true);
            }}
            className="ml-auto text-sm text-[#FFB4A8] hover:underline disabled:opacity-50"
          >
            {t("remove")}
          </button>
        )}
      </div>
    </form>
  );
}
