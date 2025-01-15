import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function CraftingPage() {
  const t = useTranslations("Crafting");

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("wip")}</p>

      <Button asChild>
        <Link href="/">{t("backButton")}</Link>
      </Button>
    </div>
  );
}
