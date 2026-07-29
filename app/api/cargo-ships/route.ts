import { NextResponse } from "next/server";
import { getAvailableTransports } from "@/lib/cargo-ships";

/**
 * GET /api/cargo-ships
 * Returns the ships the cargo sheet offers, with their capacity in SCU.
 * Public — the configuration is the same for every player.
 *
 * Added for the desktop client, whose cargo sheet is otherwise entirely
 * offline: it reads this list once and keeps it in its own store, so the tool
 * still works without a connection.
 */
export async function GET() {
  const transports = await getAvailableTransports();

  return NextResponse.json({ transports });
}
