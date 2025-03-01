"use server";

import { auth } from "@/auth";
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { DbRefiningJob, RefiningJob } from "@/lib/refining-jobs";
import Ajv from "ajv";

const ajv = new Ajv({ coerceTypes: true });

// Validation schema for refining jobs
const validateRefiningJob = ajv.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    location: { type: "string", maxLength: 500 },
    content: { type: "string", maxLength: 2000 },
    duration: { type: "integer", minimum: 1 },
  },
  required: ["location", "content", "duration"],
});

// Create a new refining job
export async function addRefiningJob(formData: FormData) {
  const session = await auth();
  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const jobData = {
    location: formData.get("location"),
    content: formData.get("content"),
    duration: parseInt(formData.get("duration") as string),
  };

  if (!validateRefiningJob(jobData)) {
    console.warn({
      errors: validateRefiningJob.errors,
      message: "Invalid refining job data",
    });
    throw new Error("Invalid refining job data");
  }

  const job: DbRefiningJob = {
    id: randomUUID(),
    userId: new ObjectId(session.user.id),
    location: jobData.location as string,
    content: jobData.content as string,
    duration: jobData.duration,
    startTime: new Date().toISOString(),
    status: "active",
  };

  await db.db().collection("refiningJobs").insertOne(job);
  revalidatePath("/industry/refine");
  return { success: true, jobId: job.id };
}

// Update an existing refining job
export async function updateRefiningJob(formData: FormData) {
  const session = await auth();
  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const jobId = formData.get("jobId") as string;
  if (!jobId) {
    throw new Error("Missing job ID");
  }

  const updateData: Partial<RefiningJob> = {};
  
  const content = formData.get("content");
  if (content) {
    updateData.content = content as string;
  }
  
  const durationStr = formData.get("duration");
  if (durationStr) {
    const duration = parseInt(durationStr as string);
    if (isNaN(duration) || duration <= 0) {
      throw new Error("Invalid duration");
    }
    updateData.duration = duration;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No fields to update");
  }

  const result = await db
    .db()
    .collection("refiningJobs")
    .updateOne(
      { id: jobId, userId: new ObjectId(session.user.id) },
      { $set: updateData }
    );

  if (result.matchedCount === 0) {
    throw new Error("Job not found or not owned by user");
  }

  revalidatePath("/industry/refine");
  return { success: true };
}

// Delete a refining job
export async function deleteRefiningJob(jobId: string) {
  const session = await auth();
  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const result = await db
    .db()
    .collection("refiningJobs")
    .deleteOne({ id: jobId, userId: new ObjectId(session.user.id) });

  if (result.deletedCount === 0) {
    throw new Error("Job not found or not owned by user");
  }

  revalidatePath("/industry/refine");
  return { success: true };
}