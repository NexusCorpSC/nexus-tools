"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export default function ReputationPage() {
  const reputations = [
    {
      name: "Hurston Dynamics",
      level: {
        id: 3,
        name: "Veteran",
      },
      player: {
        name: "Nakasar",
        id: "player-nakasar",
      },
    },
    {
      name: "MicroTech",
      level: {
        id: 5,
        name: "Confirmed",
      },
      player: {
        name: "Nakasar",
        id: "player-nakasar",
      },
    },
    {
      name: "Citizens for Prosperity",
      level: {
        id: -1,
        name: "Hostile",
      },
      player: {
        name: "Nakasar",
        id: "player-nakasar",
      },
    },
    {
      name: "Headhunters",
      level: {
        id: 0,
        name: "Applicant",
      },
      player: {
        name: "Nakasar",
        id: "player-nakasar",
      },
    },
    {
      name: "Xenothreat",
      level: {
        id: 1,
        name: "Journeyman",
      },
      player: {
        name: "Nakasar",
        id: "player-nakasar",
      },
    },
    {
      name: "Hurston Dynamics",
      level: {
        id: 1,
        name: "Journeyman",
      },
      player: {
        name: "Eowen",
        id: "player-eowen",
      },
    },
    {
      name: "MicroTech",
      level: {
        id: -1,
        name: "Hostile",
      },
      player: {
        name: "Eowen",
        id: "player-eowen",
      },
    },
    {
      name: "MicroTech",
      level: {
        id: 3,
        name: "Veteran",
      },
      player: {
        name: "Max",
        id: "player-max",
      },
    },
    {
      name: "MicroTech",
      level: {
        id: 3,
        name: "Veteran",
      },
      player: {
        name: "Genesix",
        id: "player-genesix",
      },
    },
  ];
  const orgReputationsStatsByFaction = reputations.reduce(
    (
      acc: {
        name: string;
        levels: { [name: string]: number };
      }[],
      rep,
    ) => {
      const faction = acc.find((f) => f.name === rep.name);
      if (faction) {
        if (faction.levels[rep.level.name]) {
          faction.levels[rep.level.name]++;
        } else {
          faction.levels[rep.level.name] = 1;
        }
      } else {
        acc.push({
          name: rep.name,
          levels: { [rep.level.id]: 1 },
        });
      }
      return acc;
    },
    [],
  );

  console.log(orgReputationsStatsByFaction);

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
      <h1 className="text-2xl font-bold mb-4">Réputation</h1>

      <div>
        <div>
          <ChartContainer
            config={{
              "levels.-1": {
                label: "Hostile",
                color: "darkred",
              },
              "levels.0": {
                label: "Applicant",
                color: "gray",
              },
              "levels.1": {
                label: "Journeyman",
                color: "gray",
              },
              "levels.2": {
                label: "Beginner",
                color: "gray",
              },
              "levels.3": {
                label: "Veteran",
                color: "gray",
              },
              "levels.4": {
                label: "Applicant",
                color: "gray",
              },
              "levels.5": {
                label: "Confirmed",
                color: "darkgreen",
              },
            }}
          >
            <BarChart accessibilityLayer data={orgReputationsStatsByFaction}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar dataKey="levels.-1" fill="darkred" radius={4} />
              <Bar dataKey="levels.0" fill="gray" radius={4} />
              <Bar dataKey="levels.1" fill="darkblue" radius={4} />
              <Bar dataKey="levels.3" fill="darkblue" radius={4} />
              <Bar dataKey="levels.4" fill="darkblue" radius={4} />
              <Bar dataKey="levels.5" fill="darkgreen" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
