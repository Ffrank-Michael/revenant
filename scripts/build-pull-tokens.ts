// Reads, from the chain, how many tokens the pool paid out at each pull (the pool's remove-liquidity event,
// the same number Suiscan shows) and each token's total supply. Writes data/pull-tokens.json. Read-only on chain.
// Usage: npx tsx --env-file=.env.local scripts/build-pull-tokens.ts
import fs from "node:fs";
import { suiGraphQL } from "../lib/tatum";

async function main() {
  const idx = JSON.parse(fs.readFileSync("data/rug-index.snapshot.json", "utf8"));
  const out: Record<string, { symbol: string; removed: number | null; supply: number | null; decimals: number; digest: string; note?: string }> = {};
  for (const c of idx.cases) {
    const rem = c.evidence.find((e: { kind: string }) => e.kind === "liquidity_remove");
    const meta: { coinMetadata: { decimals: number | null; supply: string | null } | null } = await suiGraphQL(
      `query($t:String!){ coinMetadata(coinType:$t){ decimals supply } }`,
      { t: c.coinType },
    );
    const decimals = meta.coinMetadata?.decimals ?? 9;
    const supply = meta.coinMetadata?.supply ? Number(BigInt(meta.coinMetadata.supply)) / 10 ** decimals : null;
    const tx: { transaction: { effects: { events: { nodes: { contents: { type: { repr: string }; json: Record<string, string> } }[] } } } } = await suiGraphQL(
      `query($d:String!){ transaction(digest:$d){ effects{ events(first:50){ nodes{ contents{ type{ repr } json } } } } } }`,
      { d: rem.digest },
    );
    let removed: number | null = null;
    let note = "";
    const ev = tx.transaction.effects.events.nodes.find((n) => /RemoveLiquidity|DecreaseLiquidity/.test(n.contents.type.repr));
    if (ev?.contents.json.amount_a && ev.contents.json.amount_b) {
      const a = Number(BigInt(ev.contents.json.amount_a)) / 10 ** decimals;
      const b = Number(BigInt(ev.contents.json.amount_b)) / 1e9;
      // The SUI side is the amount that matches the SUI the creator received (fees are small); the other side is the token.
      const aIsSui = Math.abs(a - rem.suiAmount) / rem.suiAmount < 0.02;
      const bIsSui = Math.abs(b - rem.suiAmount) / rem.suiAmount < 0.02;
      if (bIsSui && !aIsSui) removed = a;
      else if (aIsSui && !bIsSui) removed = Number(BigInt(ev.contents.json.amount_b)) / 10 ** decimals;
      else note = "could not tell which side is SUI";
    } else note = "no remove-liquidity event found";
    out[c.coinType] = { symbol: c.symbol, removed, supply, decimals, digest: rem.digest, ...(note ? { note } : {}) };
    console.log(c.symbol.padEnd(8), "removed", removed?.toLocaleString("en-US"), "| supply", supply?.toLocaleString("en-US"), note);
  }
  fs.writeFileSync("data/pull-tokens.json", JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
