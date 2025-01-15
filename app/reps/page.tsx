import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { Faction } from "@/lib/reputations";
import { Radio, RadioGroup } from "@headlessui/react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { FactionsList } from "@/app/reps/components/factions-list";

export default async function ReputationPage() {
  const t = await getTranslations("Reputations");

  const session = await auth();

  if (!session?.user) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("connectToUse")}</p>

        <Button asChild>
          <Link href="/">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  const factionsConfig = await db
    .db()
    .collection<{ factions: Faction[] }>("configuration")
    .findOne({ key: "reputations" });

  if (!factionsConfig) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("noFactions")}</p>
      </div>
    );
  }
  const factions = factionsConfig.factions;

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("selectCurrentLevelInstructions")}</p>

      <FactionsList factions={factions} />
    </div>
  );
}
