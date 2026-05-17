import { ObjectId } from "bson";

export type MissionDb = {
  _id: ObjectId;
  category: string;
  missionType: string;
  title: string;
  description: string;
  factionId: ObjectId;
  canBeShared: boolean;
  illegal: boolean;
  rewardUEC?: number;
  blueprints: ObjectId[];
};
