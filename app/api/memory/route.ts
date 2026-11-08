import { connection } from "next/server";
import { getBoard } from "@/lib/board";

export const maxDuration = 60;

// Read-only: what Revenant remembers, for the website's case board. Writes nothing anywhere.
export async function GET() {
  await connection();
  try {
    return Response.json({ ok: true, ...(await getBoard()) });
  } catch (e) {
    console.error("[api/memory] failed:", e);
    return Response.json({ ok: false, code: "memory_unavailable" }, { status: 502 });
  }
}
