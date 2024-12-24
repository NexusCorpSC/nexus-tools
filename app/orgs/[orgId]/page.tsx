import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { auth } from "@/auth";
import { ObjectId } from "bson";
import Image from "next/image";
import { handleRemoveMember } from "@/app/orgs/actions";

export default async function OrganizationPage({
  params,
}: {
  params: { orgId: string };
}) {
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

  const userIsEditor =
    session?.user &&
    organization.members.some(
      (member) => member.userId.equals(session.user?.id) && member.editor,
    );

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <Image
        src={organization.image}
        alt={`Logo de l'organization ${organization.name}`}
        height={200}
        width={200}
        priority={true}
      />

      <h1 className="text-2xl font-bold mb-4">
        {organization.name} [{organization.tag}]
      </h1>

      <div>
        <h2 className="text-xl font-semibold mb-2">Description</h2>
        <p className="text-lg">{organization.description}</p>
      </div>

      {session?.user &&
        organization.members.some((member) =>
          member.userId.equals(session.user?.id),
        ) && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Membres</h2>
            <ul className="divide-y divide-gray-100">
              {organization.members.map((member, index) => (
                <li key={index} className="flex justify-between gap-x-6 py-5">
                  <div className="flex min-w-0 gap-x-4">
                    <img
                      alt=""
                      src={member.avatar}
                      className="size-12 flex-none rounded-full bg-gray-50"
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
                              ? "Quitter"
                              : "Expulser"}
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
