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
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { PlayerReputations } from "@/types/reputations";

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
        reputations?: PlayerReputations;
      }[];
    }>({ users: 1, name: 1 })
    .toArray();

  const factions = await getFactions();

  if (!factions) {
    return <div>loading...</div>;
  }

  const organisation = aggregation[0];

  const membersBreakdown: Record<
    string,
    {
      name: string;
      standings: Record<
        string,
        { name: string; count: number; members: string[] }
      >;
      careers: Record<
        string,
        {
          name: string;
          levels: Record<
            string,
            { name: string; count: number; members: string[] }
          >;
        }
      >;
    }
  > = {};

  organisation.users.forEach((user) => {
    if (!user.reputations) {
      return;
    }

    factions.forEach((faction) => {
      const factionName = faction.name;

      if (!membersBreakdown[factionName]) {
        membersBreakdown[factionName] = {
          name: factionName,
          standings: {},
          careers: {},
        };
      }

      if (!user.reputations?.[factionName]) {
        return;
      }

      faction.standings.forEach((standing) => {
        if (!membersBreakdown[factionName].standings[standing]) {
          membersBreakdown[factionName].standings[standing] = {
            name: standing,
            count: 0,
            members: [],
          };
        }

        if (!user.reputations?.[factionName]) {
          return;
        }

        if (user.reputations[factionName].standing === standing) {
          membersBreakdown[factionName].standings[standing].count++;
          membersBreakdown[factionName].standings[standing].members.push(
            user.name,
          );
        }
      });

      faction.careers.forEach((career) => {
        const careerName = career.name;

        if (!membersBreakdown[factionName].careers[careerName]) {
          membersBreakdown[factionName].careers[careerName] = {
            name: careerName,
            levels: {},
          };
        }

        career.levels.forEach((level) => {
          const levelName = level.name;

          if (
            !membersBreakdown[factionName].careers[careerName].levels[levelName]
          ) {
            membersBreakdown[factionName].careers[careerName].levels[
              levelName
            ] = {
              name: levelName,
              count: 0,
              members: [],
            };
          }

          if (!user.reputations?.[factionName]?.careers[careerName]) {
            return;
          }

          if (
            user.reputations[factionName].careers[careerName].level.name ===
            levelName
          ) {
            membersBreakdown[factionName].careers[careerName].levels[levelName]
              .count++;
            membersBreakdown[factionName].careers[careerName].levels[
              levelName
            ].members.push(user.name);
          }
        });
      });
    });
  });

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
      <p>{t("description")}</p>

      <div className="space-y-4">
        {Object.values(membersBreakdown).map((faction) => (
          <Card key={faction.name} className="p-4">
            <CardTitle>{faction.name}</CardTitle>
            <CardContent>
              <div className="">
                <h2 className="font-bold">Réputations</h2>
                <div className="flex gap-2 flex-wrap">
                  {Object.values(faction.standings).map((standing) => (
                    <div key={standing.name} className="flex items-center">
                      <span className="mr-2">{standing.name}</span>
                      <span>{standing.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <h2 className="font-bold">Carrières</h2>
              <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-4">
                {Object.values(faction.careers).map((career) => (
                  <div key={career.name}>
                    <h3 className="font-semibold">{career.name}</h3>
                    <div className="">
                      {Object.values(career.levels).map((level) => (
                        <div key={level.name} className="flex items-center">
                          <span className="mr-2">{level.name}</span>
                          <span>{level.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
