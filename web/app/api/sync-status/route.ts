import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/queries/syncStatus";

// Pas de cache (comportement par défaut des Route Handlers, cf. AGENTS.md) --
// cette route est pollée côté client (composant "Live Market Data") pour
// refléter en direct les runs en cours.
export async function GET() {
  try {
    const data = await getSyncStatus();
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/sync-status failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
