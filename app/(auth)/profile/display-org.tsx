"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DisplayOrgOption, MyDisplayOrg } from "@/types/display-org";

/** Sans choix : chacun voit la première organisation qu'il partage. */
const AUTO = "auto";

/**
 * Le choix de l'organisation affichée avec mon pseudo, dans la liste d'amis
 * des autres. Enregistré dès qu'il change.
 */
export function DisplayOrgPicker({
  initialOrgId,
  organizations,
}: {
  initialOrgId: string | null;
  organizations: DisplayOrgOption[];
}) {
  const t = useTranslations("Profile.DisplayOrg");
  const [orgId, setOrgId] = useState(initialOrgId);
  const [pending, setPending] = useState(false);

  async function choose(value: string) {
    const next = value === AUTO ? null : value;
    const previous = orgId;
    setOrgId(next);
    setPending(true);
    try {
      const response = await fetch("/api/me/display-org", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const saved = (await response.json()) as MyDisplayOrg;
      setOrgId(saved.orgId);
      toast.success(t("saved"));
    } catch {
      setOrgId(previous);
      toast.error(t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wider text-[#86AED2] uppercase">
        {t("label")}
      </p>
      <Select
        value={orgId ?? AUTO}
        onValueChange={(value) => void choose(value)}
        disabled={pending}
      >
        <SelectTrigger
          aria-label={t("label")}
          className="h-10 border-[#9ED0FF]/20 bg-[#061E30]/70 text-[#CCE7FF]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>{t("auto")}</SelectItem>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.tag ? `${org.name} [${org.tag}]` : org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-[#A9CDEE]">{t("hint")}</p>
    </div>
  );
}
