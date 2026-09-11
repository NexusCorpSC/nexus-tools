import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/permissions";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        await auth.api.getSession({ headers: await headers() });
        await requirePermission(ITEMS_EDIT_PERMISSION);

        if (!pathname.match(/^items\/[^/]+\/image\.[a-z0-9]{1,6}$/i)) {
          throw new Error("Invalid pathname.");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8_000_000,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async () => {
        // The imageUrl is stored by the client via hidden input on form submit
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
