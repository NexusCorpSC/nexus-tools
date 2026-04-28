import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function NewOrgPage() {
  const t = useTranslations("NewOrganization");

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("error")}</p>

      <Button asChild>
        <Link href="/orgs">{t("backToOrgs")}</Link>
      </Button>
    </div>
  );
}
