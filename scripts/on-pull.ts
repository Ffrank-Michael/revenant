// What happens when the watcher sees a coin get pulled. Called by watch-coin.ts, or run by hand:
//
//   npx tsx --env-file=.env.local scripts/on-pull.ts <change-file.json> [warnedAtISO] [warningBlobId]   (real run)
//   npx tsx --env-file=.env.local scripts/on-pull.ts --dry VETO                                          (rehearsal: uses the saved VETO case, writes NOTHING)
//
// Steps (each one is tried even if an earlier one failed, and the result is written to a file):
//  a. save the coin to "revenant-rugs" as "auto-verified, awaiting investigator review"
//  b. save an outcome memory in "revenant-warnings" that points to the original warning
//  c. rebuild the index from Walrus, then commit the results (no push)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { getMemWal, MEMWAL_SAVE_WAIT_MS } from "../lib/memwal";
import { withRetry } from "../lib/retry";
import { traceCoin, type TraceResult } from "../lib/trace";
import type { VerifyResult } from "../lib/verify";
import { buildRugCase, refreshRugIndex, rugCaseToMemoryText, saveRugCase } from "../lib/rugs";
import { pullCoinObjects } from "../lib/coinobjects";

export const DEFAULT_WARNED_AT = "2026-11-07T22:50:03Z";
export const DEFAULT_WARNING_BLOB = "CL2SsuV1hC7nqTxtnplAbx_vYZeFZhGDmW-DEUb7o4o";
const WARNINGS_NS = "revenant-warnings";

type StepResult = { step: string; ok: boolean; detail: string };

export function outcomeText(v: VerifyResult, warnedAt: string, warningBlob: string, pullDigest: string): { text: string; hours: number } {
  const pulledAt = v.firstRugAt ?? v.evidence.find((e) => e.kind === "liquidity_remove")?.at ?? new Date().toISOString();
  const hours = (Date.parse(pulledAt) - Date.parse(warnedAt)) / 3_600_000;
  const hoursTxt = Math.abs(hours).toFixed(1);
  const rel = hours >= 0 ? `so the warning came ${hoursTxt} hours before the rug` : `so the pull happened ${hoursTxt} hours BEFORE the warning (the warning was late)`;
  const sym = v.coin.symbol ?? "the coin";
  const text =
    `REVENANT OUTCOME (recorded ${new Date().toISOString()}): Revenant warned about ${sym} (${v.coin.type}) at ${warnedAt}. ` +
    `The original warning is saved in Walrus blob ${warningBlob} (namespace ${WARNINGS_NS}). ` +
    `The creator ${v.creator} then pulled the liquidity at ${pulledAt} (tx ${pullDigest}), taking ${v.numbers.totalSuiTaken.toFixed(2)} SUI out, ` +
    `${rel}. Revenant's own on-chain check says: ${v.verdict} (${v.methods.join(" + ")}). ` +
    `Status: auto-verified, awaiting investigator review. The rug itself is saved in namespace revenant-rugs.`;
  return { text, hours };
}

export async function onPull(o: { name: string; verify: VerifyResult; trace?: TraceResult; warnedAt?: string; warningBlob?: string; dry?: boolean; commit?: boolean }) {
  const warnedAt = o.warnedAt ?? DEFAULT_WARNED_AT;
  const warningBlob = o.warningBlob ?? DEFAULT_WARNING_BLOB;
  const results: StepResult[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    try { const detail = await fn(); results.push({ step: name, ok: true, detail }); }
    catch (e) { results.push({ step: name, ok: false, detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }); }
    const r = results[results.length - 1];
    console.log(`  [${r.ok ? "ok" : "FAILED"}] ${r.step}: ${r.detail.slice(0, 300)}`);
  };

  const v = o.verify;
  if (v.verdict !== "rugged") {
    console.log(`  not saving: the rug check says "${v.verdict}", not "rugged".`);
    return { saved: false, results };
  }
  const pullDigests = v.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest);
  const pullDigest = pullDigests[0] ?? "";

  let rugText = "";
  await step("a. save to revenant-rugs (auto-verified, awaiting investigator review)", async () => {
    const trace = o.trace ?? (await traceCoin(v.coin.type));
    if (!trace.ok) throw new Error("trace failed: " + trace.message);
    const coinObjects = await pullCoinObjects(pullDigests);
    const c = buildRugCase(trace, v, { coinObjects, reviewStatus: "auto_verified_awaiting_review" });
    if (!c) throw new Error("case could not be built");
    rugText = rugCaseToMemoryText(c);
    const summary = `pull tx ${pullDigest}, ${c.suiTaken.toFixed(2)} SUI taken, ${coinObjects.length} pull coin objects`;
    if (o.dry) return `DRY RUN, would save (${rugText.length} chars): ${summary}\n${rugText.split("\n")[0].slice(0, 400)}`;
    const r = await saveRugCase(c, { replace: true });
    return `${r.status}${r.blobId ? " blob " + r.blobId : ""}: ${summary}`;
  });

  await step("b. save outcome memory in revenant-warnings", async () => {
    const { text, hours } = outcomeText(v, warnedAt, warningBlob, pullDigest);
    if (o.dry) return `DRY RUN, would save (${hours.toFixed(1)} h between warning and pull):\n${text}`;
    const m = getMemWal(WARNINGS_NS);
    const saved = await withRetry("save outcome", () => m.rememberAndWait(text, WARNINGS_NS, { timeoutMs: MEMWAL_SAVE_WAIT_MS }));
    return `saved blob ${saved.blob_id}; warning came ${hours.toFixed(1)} h before the pull`;
  });

  if (!o.dry) {
    await step("c1. rebuild the index from Walrus", async () => { await refreshRugIndex(); return "index rebuilt (snapshot file updated)"; });
    if (o.commit !== false) {
      await step("c2. commit (not pushed)", async () => {
        const caseFile = `data/cases/${o.name}-PULLED-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        fs.writeFileSync(caseFile, JSON.stringify({ capturedAt: new Date().toISOString(), verify: v, steps: results }, null, 1));
        execFileSync("git", ["add", caseFile, "data/rug-index.snapshot.json"]);
        const msg = `${o.name} pulled: auto-verified rug saved to Walrus (awaiting investigator review) + outcome memory\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n`;
        execFileSync("git", ["commit", "-q", "-m", msg]);
        return `committed ${caseFile}`;
      });
    }
  }
  return { saved: results.every((r) => r.ok), results };
}

// ---- run by hand ----
async function cli() {
  const args = process.argv.slice(2);
  if (args[0] === "--dry") {
    const file = fs.readdirSync("data/cases").filter((f) => f.startsWith(args[1] + "-") && !f.includes("PULLED")).sort().pop()!;
    const snap = JSON.parse(fs.readFileSync(`data/cases/${file}`, "utf8"));
    console.log(`DRY RUN with the saved ${args[1]} case (${file}); nothing is written anywhere.`);
    await onPull({ name: args[1], verify: snap.verify, trace: snap.trace, dry: true });
    return;
  }
  const verify = JSON.parse(fs.readFileSync(args[0], "utf8")) as VerifyResult;
  const r = await onPull({ name: verify.coin.symbol ?? "COIN", verify, warnedAt: args[1], warningBlob: args[2] });
  process.exit(r.saved ? 0 : 1);
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/on-pull.ts")) cli().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
