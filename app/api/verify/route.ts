import { connection } from "next/server";
import { verifyCoin } from "@/lib/verify";

export const maxDuration = 120; // many queries, spaced out to respect Tatum's limit

// Example: /api/verify?coin=0xPACKAGE::module::NAME
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

  const result = await verifyCoin(coin);
  if (result.ok) return Response.json(result);

  const status = result.code === "invalid_coin_type" ? 400 : result.code === "package_not_found" ? 404 : 502;
  return Response.json(result, { status });
}
