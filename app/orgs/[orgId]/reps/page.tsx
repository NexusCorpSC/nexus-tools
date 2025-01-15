import db from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { getFactions } from "@/lib/reputations";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default async function ReputationPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const t = await getTranslations("OrganizationReputations");

  const { orgId } = await params;

  const aggregation = await db
    .db()
    .collection("organizations")
    .aggregate([
      { $match: { _id: orgId } },
      {
        $lookup: {
          from: "users",
          localField: "members.userId",
          foreignField: "_id",
          as: "users",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                avatar: 1,
                reputations: 1,
              },
            },
          ],
        },
      },
    ])
    .project<{
      name: string;
      users: {
        avatar: string;
        name: string;
        reputations: { [faction: string]: { level: number; name: string } };
      }[];
    }>({ users: 1, name: 1 })
    .toArray();

  const factions = await getFactions();

  if (!factions) {
    return <div>loading...</div>;
  }

  const organisation = aggregation[0];

  const usersByFactionLevel = factions.reduce(
    (
      acc: { [faction: string]: { [level: string]: { name: string }[] } },
      faction,
    ) => {
      acc[faction.name] = faction.levels.reduce(
        (levelAcc: { [level: string]: { name: string }[] }, level) => {
          levelAcc[level.name] = organisation.users.filter((user) => {
            const userReputation = user.reputations?.[faction.name];
            return userReputation && userReputation.level === level.level;
          });

          return levelAcc;
        },
        {},
      );

      return acc;
    },
    {},
  );

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
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
              {organisation.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Réputations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <div>
        {Object.entries(usersByFactionLevel).map(([factionName, levels]) => (
          <div key={factionName}>
            <h2 className="text-xl font-semibold mb-2">{factionName}</h2>
            {Object.entries(levels).map(([levelName, users]) => (
              <div key={levelName} className="mb-4">
                <h3 className="text-lg font-medium">{levelName}</h3>
                <ul className="list-disc list-inside">
                  {users.map((user, index) => (
                    <li key={index} className="text-sm">
                      {user.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
