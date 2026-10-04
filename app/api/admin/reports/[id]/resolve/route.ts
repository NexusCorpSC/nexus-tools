import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ReportError, parseResolveInput, resolveReport } from "@/lib/reports";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";

/**
 * POST /api/admin/reports/:id/resolve
 * Body : `{ action, note?, contributionId?, force?, sanction?, authorId? }`.
 * `action` parmi `dismiss`, `correct`, `revert` (avec `contributionId`),
 * `delete` ; `sanction` parmi `warn`, `suspend`. Répond le dossier tranché.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    !(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = await params;
  try {
    return NextResponse.json(
      await resolveReport(
        id,
        { id: new ObjectId(session.user.id), name: session.user.name },
        parseResolveInput(body),
        {
          places: await hasPermission(PLACES_EDIT_PERMISSION),
          items: await hasPermission(ITEMS_EDIT_PERMISSION),
        },
      ),
    );
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json(
        { error: error.code, detail: error.detail },
        { status: error.status },
      );
    }
    throw error;
  }
}
