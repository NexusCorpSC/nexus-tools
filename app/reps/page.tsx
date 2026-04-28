import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { getFactions, getPlayerReputations } from "@/lib/reputations";
import { FactionsList } from "@/app/reps/components/factions-list";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function ReputationPage() {
  const t = await getTranslations("Reputations");

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return (
      <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
      <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("noFactions")}</p>
      </div>
    );
  }

  const playerReputation = await getPlayerReputations(session.user.id);

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("selectCurrentLevelInstructions")}</p>

      <FactionsList factions={factions} playerReputation={playerReputation} />
    </div>
  );
}
