import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addInventoryRows } from "@/lib/inventory-quick-add";

/**
 * POST /api/inventory/items/bulk
 * Body: `{ rows: QuickAddRow[] }`. Adds them all, topping up a lot already
 * held rather than splitting it (see `addInventoryRows`). Answers
 * `{ created, merged }`, or 400 with the first row that does not hold.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await addInventoryRows(
    session.user.id,
    (body as { rows?: unknown } | null)?.rows,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    { created: result.created, merged: result.merged },
    { status: 201 },
  );
}
