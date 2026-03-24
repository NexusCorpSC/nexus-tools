import db from "@/lib/db";
import { JoinRequest, Organization } from "@/app/orgs/page";
import { ObjectId } from "bson";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { JoinRequestButton } from "@/app/orgs/[orgId]/join/[code]/components";

export default async function JoinOrgPage({
  params,
}: {
  params: Promise<{ orgId: string; code: string }>;
}) {
  const { orgId, code } = await params;

  const organization = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId, joinCode: code });

  if (!organization) return notFound();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  let requestStatus: "NONE" | "PENDING" | "BLOCKED" | "MEMBER" = "NONE";

  if (session?.user) {
    const isMember = organization.members.some((m) =>
      m.userId.equals(new ObjectId(session.user!.id)),
    );
    if (isMember) {
      requestStatus = "MEMBER";
    } else {
      const existing = await db
        .db()
        .collection<JoinRequest>("joinRequests")
        .findOne({ orgId, userId: session.user.id });
      if (existing) {
        requestStatus = existing.status;
      }
    }
  }

  return (
    <div className="m-2 p-6 max-w-xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/orgs">Organisations</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/orgs/${orgId}`}>
              {organization.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Rejoindre</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src={organization.image}
          alt={`Logo de ${organization.name}`}
          height={120}
          width={120}
          priority
          className="rounded-xl"
        />
        <h1 className="text-2xl font-bold">
          {organization.name}{" "}
          <span className="text-gray-400 font-normal">[{organization.tag}]</span>
        </h1>
        {organization.description && (
          <p className="text-gray-500 text-sm">{organization.description}</p>
        )}
      </div>

      <div className="flex justify-center">
        <JoinRequestButton
          orgId={orgId}
          code={code}
          isAuthenticated={!!session?.user}
          requestStatus={requestStatus}
        />
      </div>
    </div>
  );
}
