import { ObjectId } from "mongodb";
import db from "./db";
import { _ } from "ajv";

export interface RefiningJob {
  id: string;
  userId: string; // Changed from ObjectId to string for client compatibility
  location: string;
  content: string;
  duration: number; // duration in minutes
  startTime: string; // ISO string
  status: "active" | "completed";
}

// Internal interface for database operations
interface DbRefiningJob {
  id: string;
  userId: ObjectId;
  location: string;
  content: string;
  duration: number;
  startTime: string;
  status: "active" | "completed";
}

export interface RefiningJobWithTimeRemaining extends RefiningJob {
  timeRemaining: number; // remaining time in minutes
  isFinished: boolean;
}

export async function getUserRefiningJobs(userId: ObjectId): Promise<RefiningJobWithTimeRemaining[]> {
  const jobs = await db
    .db()
    .collection<DbRefiningJob>("refiningJobs")
    .find({ userId }, { projection: { _id: 0 } })
    .toArray();

  return jobs.map(job => {
    const startTime = new Date(job.startTime).getTime();
    const currentTime = new Date().getTime();
    const elapsedMinutes = Math.floor((currentTime - startTime) / (1000 * 60));
    const timeRemaining = Math.max(0, job.duration - elapsedMinutes);
    const isFinished = timeRemaining <= 0;

    return {
      ...job,
      userId: job.userId.toString(), // Convert ObjectId to string
      timeRemaining,
      isFinished
    };
  });
}

export async function getRefiningJob(jobId: string, userId: ObjectId): Promise<RefiningJobWithTimeRemaining | null> {
  const job = await db
    .db()
    .collection<DbRefiningJob>("refiningJobs")
    .findOne({ id: jobId, userId }, { projection: { _id: 0 } })

  if (!job) return null;

  const startTime = new Date(job.startTime).getTime();
  const currentTime = new Date().getTime();
  const elapsedMinutes = Math.floor((currentTime - startTime) / (1000 * 60));
  const timeRemaining = Math.max(0, job.duration - elapsedMinutes);
  const isFinished = timeRemaining <= 0;

  return {
    ...job,
    userId: job.userId.toString(), // Convert ObjectId to string
    timeRemaining,
    isFinished
  };
}