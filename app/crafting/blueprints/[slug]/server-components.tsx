import { auth } from "@/auth";
import { isUserOwningBlueprint } from "@/lib/crafting";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Blueprint } from "@/types/crafting";
import { Button } from "@/components/ui/button";
import {
  addBlueprintAction,
  removeBlueprintAction,
} from "@/app/crafting/blueprints/actions";
import { BookmarkIcon, BookmarkSlashIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";

export async function BlueprintOwnershipCard({
  blueprint,
}: {
  blueprint: Blueprint;
}) {
  const t = await getTranslations("Crafting.Blueprints");
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-gray-500">
          <BookmarkIcon className="size-5 shrink-0" />
          <p className="text-sm">{t("ownershipLoginPrompt")}</p>
        </div>
        <Button asChild size="sm" className="self-start">
          <Link href="/login">{t("ownershipLoginButton")}</Link>
        </Button>
      </div>
    );
  }

  const owns = await isUserOwningBlueprint(session.user.id!, blueprint.id);

  if (owns) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <BookmarkSolidIcon className="size-5 shrink-0" />
          <p className="text-sm font-medium">{t("ownershipOwned")}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await removeBlueprintAction(blueprint.id, blueprint.slug);
          }}
        >
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
          >
            <BookmarkSlashIcon className="size-4" />
            {t("ownershipRemove")}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-gray-500">
        <BookmarkIcon className="size-5 shrink-0" />
        <p className="text-sm">{t("ownershipNotOwned")}</p>
      </div>
      <form
        action={async () => {
          "use server";
          await addBlueprintAction(blueprint.id, blueprint.slug);
        }}
      >
        <Button type="submit" size="sm" className="flex items-center gap-1">
          <BookmarkSolidIcon className="size-4" />
          {t("ownershipAdd")}
        </Button>
      </form>
    </div>
  );
}
