import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { auth } from "@/auth";
import { ObjectId } from "bson";
import Image from "next/image";
import { handleRemoveMember } from "@/app/orgs/actions";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EditIcon } from "lucide-react";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const t = await getTranslations("Organizations");

  const { orgId } = await params;
  const session = await auth();

  const organizations = await db
    .db()
    .collection("organizations")
    .aggregate<
      Omit<Organization, "members"> & {
        members: {
          name: string;
          userId: ObjectId;
          rank: string;
          editor: boolean;
          avatar: string;
        }[];
      }
    >([
      { $match: { _id: orgId } },
      {
        $lookup: {
          from: "users",
          localField: "members.userId",
          foreignField: "_id",
          as: "users",
          pipeline: [{ $project: { name: 1, avatar: 1, _id: 1 } }],
        },
      },
      {
        $addFields: {
          members: {
            $map: {
              input: "$members",
              in: {
                $mergeObjects: [
                  "$$this",
                  {
                    $arrayElemAt: [
                      "$users",
                      { $indexOfArray: ["$users._id", "$$this.userId"] },
                    ],
                  },
                ],
              },
            },
          },
          users: "$$REMOVE",
        },
      },
    ])
    .toArray();
  const organization = organizations[0];

  if (!organization) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
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
              <BreadcrumbPage>Non trouvée</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="tex-2xl">Organisation inexistante</h1>
      </div>
    );
  }

  const userIsEditor =
    session?.user &&
    organization.members.some(
      (member) => member.userId.equals(session.user?.id) && member.editor,
    );

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
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
            <BreadcrumbPage>{organization.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Image
        src={organization.image}
        alt={`Logo de l'organization ${organization.name}`}
        height={200}
        width={200}
        priority={true}
      />

      <div className="flex flex-row justify-between">
        <h1 className="text-2xl font-bold mb-4">
          {organization.name} [{organization.tag}]
        </h1>
        {userIsEditor && (
          <Button variant="outline" asChild>
            <Link href={`/orgs/${organization._id}/edit`}>
              <EditIcon className="size-5" />
              Editer
            </Link>
          </Button>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">{t("description")}</h2>
        <p className="text-lg">{organization.description}</p>
      </div>

      <hr />

      <div>
        <Link
          href={`/orgs/${orgId}/reps`}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
        >
          Réputations
        </Link>
      </div>

      <hr />

      {session?.user &&
        organization.members.some((member) =>
          member.userId.equals(session.user?.id),
        ) && (
          <div>
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold mb-2">{t("members")}</h2>
              <Button>Invite member</Button>
            </div>
            <ul className="divide-y divide-gray-100">
              {organization.members.map((member, index) => (
                <li key={index} className="flex justify-between gap-x-6 py-5">
                  <div className="flex min-w-0 gap-x-4">
                    <Image
                      alt=""
                      src={member.avatar}
                      className="size-12 flex-none rounded-full bg-gray-50"
                      height={50}
                      width={50}
                    />
                    <div className="min-w-0 flex-auto">
                      <p className="text-sm/6 font-semibold text-gray-900">
                        {member.name}
                      </p>
                      <p className="mt-1 truncate text-xs/5 text-gray-500">
                        {member.rank}
                      </p>
                    </div>
                  </div>
                  <div className="hidden shrink-0 sm:flex sm:flex-col sm:items-end">
                    {userIsEditor && (
                      <>
                        <form
                          action={handleRemoveMember}
                          style={{ display: "inline" }}
                        >
                          <input type="hidden" name="orgId" value={orgId} />
                          <input
                            type="hidden"
                            name="memberId"
                            value={member.userId.toString()}
                          />
                          <button className="text-red-500 hover:text-red-700">
                            {member.userId.equals(session.user?.id)
                              ? t("leaveOrg")
                              : t("kickMember")}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
