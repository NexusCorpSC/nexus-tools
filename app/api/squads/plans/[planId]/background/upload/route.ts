import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { PLAN_BACKGROUND_MAX_BYTES } from "@/types/plan";
import { resolvePlan } from "../../../caller";

/**
 * The token that lets a client put the plan's background straight into the blob
 * store.
 *
 * The same shape as the item and blueprint uploads: the browser asks here for a
 * token, uploads with it, and the URL it gets back is written onto the plan by
 * `PATCH /api/squads/plans/[planId]` — `onUploadCompleted` does not fire on a
 * developer's machine, so nothing is persisted from it.
 *
 * The pathname is the plan's own, so re-importing a background replaces the
 * previous one rather than leaving it orphaned in the store.
 *
 * **Whoever runs the plan may set it.** The background is common to every phase
 * and locked once posted: it is the one drawing decision that is not everyone's.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // The plan id is read from the path rather than from the pathname the client
  // proposes, so the rank check and the file it guards cannot disagree.
  const planId = new URL(request.url).pathname.split("/").at(-3) ?? "";

  try {
    const answer = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const outcome = await resolvePlan(request, planId);

        if ("refused" in outcome) throw new Error("Plan not found.");
        if (!outcome.governs) throw new Error("Not allowed to set the background.");

        if (
          !new RegExp(
            `^plans/${planId}/background\\.(jpe?g|png|webp)$`,
            "i",
          ).test(pathname)
        ) {
          throw new Error("Invalid pathname.");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: PLAN_BACKGROUND_MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async () => {
        // The URL is written onto the plan by the client, with the image's own
        // size, which only it can measure.
      },
    });

    return NextResponse.json(answer);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
