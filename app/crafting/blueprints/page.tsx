import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { hasPermission } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { BlueprintGrid } from "./components";

export default async function Page() {
  const t = await getTranslations("Crafting");
  const canOperateBlueprints = await hasPermission("blueprints:edit");

  const session = await auth.api.getSession({ headers: await headers() });
  const isLoggedIn = !!session?.user;

  return (
    <div className="m-2 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("Blueprints.title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("Blueprints.title")}</h1>
          <p className="text-gray-600">{t("Blueprints.header")}</p>
        </div>
        {canOperateBlueprints && (
          <Button asChild size="sm">
            <Link href="/crafting/blueprints/new">
              <PlusIcon className="size-4 mr-1.5" />
              {t("Blueprints.Admin.newBlueprintButton")}
            </Link>
          </Button>
        )}
      </div>

      <BlueprintGrid isLoggedIn={isLoggedIn} />
    </div>
  );
}
