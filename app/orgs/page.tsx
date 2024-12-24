import { auth } from "@/auth";
import db from "@/lib/db";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import { ObjectId } from "bson";

export type Organization = {
  _id: string;
  name: string;
  tag: string;
  description: string;
  image: string;
  members: { userId: ObjectId; rank: string; editor: boolean }[];
  public: boolean;
};

export default async function OrganizationsPage() {
  const session = await auth();

  const organizations = await db
    .db()
    .collection<Organization>("organizations")
    .find({ public: true })
    .project({ members: 0 })
    .limit(10)
    .toArray();
  const userOrganizations = session?.user
    ? await db
        .db()
        .collection<Organization>("organizations")
        .find({
          "members.userId": new ObjectId(session?.user?.id),
        })
        .project({
          _id: 1,
          name: 1,
          tag: 1,
          image: 1,
          members: { $elemMatch: { userId: new ObjectId(session?.user?.id) } },
        })
        .limit(20)
        .toArray()
    : [];

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Organisations</h1>

      {session?.user && (
        <div className="">
          <h2 className="text-xl">Mes organisations</h2>

          <Link
            href={"/orgs/new"}
            className="uppercase block rounded-lg bg-primary bg-gradient-to-r from-orange-800 hover:from-orange-600 to-blue-800 hover:to-blue-600 p-8 m-4 text-secondary font-bold"
          >
            Ajouter une nouvelle organisation
          </Link>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userOrganizations.map((org, index) => (
              <Link
                href={`/orgs/${org._id}`}
                key={index}
                className="bg-gradient-to-r from-blue-500 hover:from-blue-400 to-purple-500 hover:to-purple-400 text-white rounded-lg shadow-lg flex flex-row justify-between"
              >
                <div className="flex justify-between">
                  <Image
                    className="rounded-l-lg"
                    src={org.image}
                    height={100}
                    width={100}
                    alt={`Logo de l'organization ${org.name}`}
                  />
                  <div className="m-4">
                    <h3 className="text-lg font-bold mb-2">{org.name}</h3>
                    <p className="text-sm">{org.members[0]?.rank}</p>
                  </div>
                </div>
                <ArrowRightIcon className="h-6 w-6 m-4" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl">Organisations publiques</h2>

        {organizations.map((org, index) => (
          <Link
            href={`/orgs/${org._id}`}
            key={index}
            className="bg-gradient-to-r from-blue-500 hover:from-blue-400 to-purple-500 hover:to-purple-400 text-white rounded-lg shadow-lg flex flex-row justify-between"
          >
            <div className="flex justify-between">
              <Image
                className="rounded-l-lg"
                src={org.image}
                height={100}
                width={100}
                alt={`Logo de l'organization ${org.name}`}
              />
              <div className="m-4">
                <h3 className="text-lg font-bold mb-2">{org.name}</h3>
                <p className="italic mb-2">{org.description}</p>
              </div>
            </div>
            <ArrowRightIcon className="h-6 w-6 m-4" />
          </Link>
        ))}
      </div>
    </div>
  );
}
