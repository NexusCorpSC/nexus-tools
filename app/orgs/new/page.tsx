import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function NewOrgPage() {
  const t = useTranslations("NewOrganization");

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("error")}</p>

      <Button asChild>
        <Link href="/orgs">{t("backToOrgs")}</Link>
      </Button>
    </div>
  );
}
