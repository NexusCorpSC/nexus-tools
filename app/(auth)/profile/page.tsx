import { signOut, auth } from "@/auth";
import { ArrowRightIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";
import Image from "next/image";

export type User = {
  _id: ObjectId;
  name: string;
  email: string;
};

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    return <>Not authenticated.</>;
  }

  const user = await db
    .db()
    .collection<User>("users")
    .findOne({ _id: new ObjectId(session?.user?.id) });

  if (!user) {
    return <>User not found.</>;
  }

  const organizations = session?.user
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
      <h1 className="text-2xl font-bold mb-4">Mon profil</h1>

      <div className="mt-6 border-t border-gray-100">
        <dl className="divide-y divide-gray-100">
          <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
            <dt className="text-sm/6 font-medium text-gray-900">Pseudo</dt>
            <dd className="mt-1 flex text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
              <span className="grow">{user.name}</span>
              <span className="ml-4 shrink-0">
                <button
                  type="button"
                  className="rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Modifier
                </button>
              </span>
            </dd>
          </div>
          <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
            <dt className="text-sm/6 font-medium text-gray-900">Email</dt>
            <dd className="mt-1 flex text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
              <span className="grow">{user.email}</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Organisations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <p className="text-sm">{org.members[0]?.rank}</p>
                </div>
              </div>
              <ArrowRightIcon className="h-6 w-6 m-4" />
            </Link>
          ))}
        </div>
      </div>

      <form
        action={async () => {
          "use server";

          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90">
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
