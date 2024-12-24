import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { ObjectId } from "bson";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();

        const userId = (await params).userId;

        if (!session || session.user?.id !== userId) {
          throw new Error("Not authenticated.");
        }

        if (pathname.match(/^users\/[A-z0-9]+\/avatar\.[a-z0-9]{1,6}$/)) {
          throw new Error("Invalid pathname.");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png"],
          tokenPayload: JSON.stringify({
            userId,
          }),
          maximumSizeInBytes: 2 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) {
          throw new Error("Missing token payload");
        }

        try {
          const { userId } = JSON.parse(tokenPayload);
          await db
            .db()
            .collection("users")
            .updateOne(
              { _id: new ObjectId(userId) },
              { $set: { avatar: blob.url } },
            );
        } catch {
          throw new Error("Could not update user");
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }, // The webhook will retry 5 times waiting for a 200
    );
  }
}
