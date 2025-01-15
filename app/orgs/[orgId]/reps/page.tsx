"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

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
  const orgReputationsStats = reputations.reduce(
    (
      acc: {
        name: string;
        levels: { id: number; name: string; count: number }[];
      }[],
      rep,
    ) => {
      const faction = acc.find((f) => f.name === rep.name);
      if (faction) {
        const level = faction.levels.find((l) => l.id === rep.level.id);
        if (level) {
          level.count++;
        } else {
          faction.levels.push({
            id: rep.level.id,
            name: rep.level.name,
            count: 1,
          });
        }
      } else {
        acc.push({
          name: rep.name,
          levels: [{ id: rep.level.id, name: rep.level.name, count: 1 }],
        });
      }
      return acc;
    },
    [],
  );

  console.log(
    orgReputationsStats.flatMap((f) =>
      f.levels.map((l) => ({
        label: `${f.name} - ${l.name}`,
        data: [l.count],
        backgroundColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.5)`,
      })),
    ),
  );

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
      <h1 className="text-2xl font-bold mb-4">Réputation</h1>

      <div>
        <div>
          <Bar
            data={{
              labels: orgReputationsStats.map((f) => f.name),
              datasets: orgReputationsStats.flatMap((f) =>
                f.levels.map((l) => ({
                  label: `${f.name} - ${l.name}`,
                  data: [l.count],
                  backgroundColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.5)`,
                })),
              ),
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: "top",
                },
                title: {
                  display: true,
                  text: "Reputation Levels by Faction",
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
