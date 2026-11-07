import { connection } from "next/server";
import { traceCoin } from "@/lib/trace";
import { addRugMemory } from "@/lib/rugs";

export const maxDuration = 120; // a trace makes many queries, spaced out to respect Tatum's limit

// Example: /api/trace?coin=0xPACKAGE::module::NAME
// The answer also says which wallets in the trail match past confirmed rugs (from Walrus Memory).
export async function GET(request: Request) {
  // Wait for a real request: the answer is never cached.
  await connection();

  const coin = new URL(request.url).searchParams.get("coin");
  if (!coin) {
    return Response.json(
      { ok: false, code: "missing_coin", message: "Add ?coin=0xPACKAGE::module::NAME to the address." },
      { status: 400 },
    );
  }

  const result = await traceCoin(coin);
  if (!result.ok) {
    const status = result.code === "invalid_coin_type" ? 400 : result.code === "package_not_found" ? 404 : 502;
    return Response.json(result, { status });
  }

  // If the memory cannot be read, the trace is still returned without matches.
  try {
    return Response.json(await addRugMemory(result));
  } catch (e) {
    // Show the REAL cause in the answer and in the server log (not just "unavailable").
    console.error("[api/trace] the rug-memory step failed:", e);
    const cause = e instanceof Error ? { name: e.name, message: e.message, where: e.stack?.split("\n")[1]?.trim() ?? null } : { name: "unknown", message: String(e), where: null };
    return Response.json({ ...result, rugMatches: [], coinObjectMatches: [], memory: { status: "unavailable", rugsKnown: 0, note: `${cause.name}: ${cause.message}`, cause } });
  }
}
