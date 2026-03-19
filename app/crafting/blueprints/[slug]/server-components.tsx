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
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";
import { AdminBlueprintMenu, BlueprintOrgOwnersClient, CraftFromInventoryClient } from "./components";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPermission, isAdmin } from "@/lib/permissions";

export async function BlueprintOwnershipCard({
  blueprint,
}: {
  blueprint: Blueprint;
}) {
  const t = await getTranslations("Crafting.Blueprints");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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

export async function BlueprintOrgOwnersSection({
  blueprint,
}: {
  blueprint: Blueprint;
}) {
  const t = await getTranslations("Crafting.Blueprints");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {t("orgOwnersTitle")}
        </h2>
        <p className="text-sm text-gray-500">{t("orgOwnersLoginPrompt")}</p>
        <Button asChild size="sm" className="self-start">
          <Link href="/login">{t("ownershipLoginButton")}</Link>
        </Button>
      </div>
    );
  }

  const userOrgs = await db
    .db()
    .collection<Organization>("organizations")
    .find(
      { "members.userId": new ObjectId(session.user.id) },
      { projection: { _id: 1, name: 1 } },
    )
    .limit(20)
    .toArray();

  const orgs = userOrgs.map((o) => ({
    id: o._id.toString(),
    name: o.name,
  }));

  return (
    <BlueprintOrgOwnersClient
      blueprintId={blueprint.id}
      organizations={orgs}
      sectionTitle={t("orgOwnersTitle")}
      selectPlaceholder={t("orgOwnersSelectPlaceholder")}
      emptyLabel={t("orgOwnersEmpty")}
      loadingLabel={t("orgOwnersLoading")}
      noOrgsLabel={t("orgOwnersNoOrgs")}
    />
  );
}

export async function AdminBlueprintSection({
  blueprint,
}: {
  blueprint: Blueprint;
}) {
  const canEdit = await hasPermission("blueprints:edit");
  if (!canEdit) return null;
  const t = await getTranslations("Crafting.Blueprints.Admin");

  return (
    <AdminBlueprintMenu
      blueprintId={blueprint.id}
      blueprintSlug={blueprint.slug}
      labels={{
        menuLabel: t("menuLabel"),
        edit: t("edit"),
        delete: t("delete"),
        deleteConfirmTitle: t("deleteConfirmTitle"),
        deleteConfirmDescription: t("deleteConfirmDescription"),
        deleteConfirmCancel: t("deleteConfirmCancel"),
        deleteConfirmConfirm: t("deleteConfirmConfirm"),
      }}
    />
  );
}

export async function BlueprintCraftSection({
  blueprint,
}: {
  blueprint: Blueprint;
}) {
  if (!blueprint.recipe || blueprint.recipe.length === 0) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  return <CraftFromInventoryClient recipe={blueprint.recipe} />;
}
