// Builds data/proven-links.json: links between cases that are PROVEN by an exact SUI coin ID.
// For each rug, take the SUI coins its pull created, follow every owner of that coin, and see whether it
// reached the creator of another case. The wallets in between are the relay wallets.
// Read-only (Tatum). Usage: npx tsx --env-file=.env.local scripts/build-links.ts
import fs from "node:fs";
import { ownersOfObject } from "../lib/coinobjects";
import type { RugCase } from "../lib/rugs";

type Case = { name: string; creator: string };
async function main() {
  const rugs: RugCase[] = JSON.parse(fs.readFileSync("data/rug-index.snapshot.json", "utf8")).cases;
  const watched: { name: string; creator: string }[] = JSON.parse(fs.readFileSync("data/watched.json", "utf8"));
  const cases: Case[] = [...rugs.map((r) => ({ name: r.symbol ?? r.coinType, creator: r.creator })), ...watched.map((w) => ({ name: w.name, creator: w.creator }))];
  const byCreator = new Map(cases.map((c) => [c.creator, c.name]));
  const links: object[] = [];

  for (const r of rugs) {
    const from = r.symbol ?? r.coinType;
    for (const coin of (r.coinObjects ?? []).filter((c) => c.role === "pull_output")) {
      const owners = await ownersOfObject(coin.id);
      const start = owners.findIndex((o) => o.address === r.creator);
      if (start < 0) continue;
      const between: typeof owners = [];
      for (let i = start + 1; i < owners.length; i++) {
        const o = owners[i];
        if (o.address === r.creator) { between.length = 0; continue; }
        const dest = byCreator.get(o.address);
        if (dest && dest !== from) {
          const relays = [...new Set(between.map((b) => b.address))];
          links.push({
            from, to: dest, coinId: coin.id, relayCount: relays.length,
            leftAt: (between[0] ?? o).at, arrivedAt: o.at,
            seconds: Math.round((Date.parse(o.at) - Date.parse((between[0] ?? o).at)) / 1000),
            leftTx: (between[0] ?? o).tx, arrivedTx: o.tx, pullTx: coin.digest, relays,
          });
          console.log(`${from} -> ${dest}: coin ${coin.id.slice(0, 12)}… through ${relays.length} relay wallets`);
          break;
        }
        between.push(o);
      }
    }
  }
  fs.writeFileSync("data/proven-links.json", JSON.stringify({ generatedAt: new Date().toISOString(), method: "exact SUI coin object ID followed through its ownership history", links }, null, 1));
  console.log(`${links.length} proven links written`);
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
