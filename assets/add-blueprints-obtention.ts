import { readFileSync } from "fs";
import path from "node:path";
import db from "@/lib/db";
import { ObjectId } from "bson";

async function addBlueprintsObtention() {
  const raw: {
    version: string;
    blueprintPools: {
      [blueprintPoolId: string]: {
        name: string;
        blueprints: {
          weight: 1;
          name: string;
        }[];
      };
    };
    contracts: {
      id: string;
      missionType: string;
      title: string;
      blueprintRewards: {
        blueprintPool: string;
        chance: number;
        poolName: string;
      }[];
    }[];
  } = JSON.parse(
    await readFileSync(path.join(__dirname, "missions.json"), "utf8"),
  );

  const blueprintsCursor = db
    .db()
    .collection<{
      name: string;
      _id: ObjectId;
    }>("blueprints")
    .find();

  while (await blueprintsCursor.hasNext()) {
    const blueprint = await blueprintsCursor.next();

    console.log(blueprint);

    // Compute list of ID of blueprintPools where the blueprint is found in.
    const poolsWithItem: string[] = [];

    // Compute list of contracts that have one of the pools as rewards
    const missions: { name: string; type: string }[] = [];

    console.log(missions);

    break;
  }

  console.log("DONE");
}

addBlueprintsObtention()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
