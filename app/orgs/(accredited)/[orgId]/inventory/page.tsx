import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import db from "@/lib/db";
import { ObjectId } from "bson";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Organization } from "@/app/orgs/page";
import { OrgInventoryGrid } from "./components";

export default async function OrgInventoryPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const t = await getTranslations("Inventory");

  // Fetch org metadata for the breadcrumb + access check
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne(
      { _id: orgId },
      { projection: { name: 1, public: 1, members: 1 } }
    );

  if (!org) notFound();

  const isMember = org.members.some((m) =>
    new ObjectId(m.userId).equals(session.user.id)
  );
  if (!isMember && !org.public) {
    redirect(`/orgs/${orgId}`);
  }

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/orgs">Organizations</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/orgs/${orgId}`}>{org.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("orgInventoryTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold mb-1">{t("orgInventoryTitle")}</h1>
        <p className="text-gray-600">{t("orgInventoryHeader")}</p>
      </div>

      <OrgInventoryGrid orgId={orgId} />
    </div>
  );
}
