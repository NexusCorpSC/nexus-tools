import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getFactions, getPlayerReputations } from "@/lib/reputations";
import { FactionsList } from "@/app/reps/components/factions-list";

export default async function ReputationPage() {
  const t = await getTranslations("Reputations");

  const session = await auth();

  if (!session?.user?.id) {
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

  const factions = await getFactions();

  if (!factions) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("noFactions")}</p>
      </div>
    );
  }

  const playerReputation = await getPlayerReputations(session.user.id);

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("selectCurrentLevelInstructions")}</p>

      <FactionsList factions={factions} playerReputation={playerReputation} />
    </div>
  );
}
