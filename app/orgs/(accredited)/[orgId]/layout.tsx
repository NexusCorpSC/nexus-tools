import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// https://refactored-halibut-696v5w474q6c54r7-3000.app.github.dev/orgs/0193f970-563d-7f03-a87c-dd415a7e2cae/join/41f27013-4f11-4e79-ab24-58d7f648c0c3

export default async function OrgLayout({
  params,
  children,
}: {
  params: Promise<{ orgId: string }>;
  children: React.ReactNode;
}) {
  const { orgId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
          pipeline: [{ $project: { name: 1, avatar: 1, email: 1, _id: 1 } }],
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
        <h1 className="tex-2xl">Organisation inexistante</h1>
      </div>
    );
  }

  if (
    !organization.public &&
    (!session?.user ||
      !organization.members.some((member) =>
        member.userId.equals(session.user?.id),
      ))
  ) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="tex-2xl">
          Accréditation insuffisante pour accéder à cette organisation.
        </h1>
      </div>
    );
  }

  return <>{children}</>;
}
