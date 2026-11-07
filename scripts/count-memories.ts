// Counts the memories in each Walrus namespace (read-only): npx tsx --env-file=.env.local scripts/count-memories.ts
import { getMemWal } from "../lib/memwal";
import { withRetry } from "../lib/retry";
async function main() {
  for (const ns of ["revenant-rugs", "revenant-warnings"]) {
    const m = getMemWal(ns);
    const l = await withRetry("list " + ns, () => m.listMemories({ namespace: ns, limit: 500 }));
    const r = await withRetry("recall " + ns, () => m.recall({ query: "REVENANT", namespace: ns, limit: 1000, sort: "recent" }));
    console.log(`${ns}: ${l.memories.length} memories listed, ${r.results.length} recalled`);
    for (const x of r.results) console.log("   ", x.text.slice(0, 95).replace(/\n/g, " "));
  }
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
