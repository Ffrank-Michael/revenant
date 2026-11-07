import { connection } from "next/server";
import { getLatestCheckpoint } from "@/lib/tatum";
import { getMemWal, logWalrusError, MEMWAL_SAVE_WAIT_MS } from "@/lib/memwal";
import { withRetry } from "@/lib/retry";

export const maxDuration = 300; // slow network + retries + saving to Walrus can take a while

const NAMESPACE = "revenant-test";
const TEST_TEXT = "Revenant connection test";

type Check = { ok: boolean; [key: string]: unknown };

// Shows the real reason behind errors like "fetch failed" (network code, address, etc.).
function errorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  // HTTP errors (from Walrus or Sui code) carry the status and the server's raw answer.
  const http = e as { status?: number; statusText?: string; serverCode?: string };
  if (http.status !== undefined) {
    parts.push(
      `status=${http.status}${http.statusText ? " " + http.statusText : ""}${http.serverCode ? " serverCode=" + http.serverCode : ""}`,
    );
  }
  let cause: unknown = (e as { cause?: unknown }).cause;
  if (typeof cause === "string") {
    parts.push(`response: ${cause.slice(0, 500)}`);
    cause = undefined;
  }
  for (let depth = 0; cause && depth < 4; depth++) {
    const c = cause as {
      code?: string;
      message?: string;
      address?: string;
      port?: number;
      syscall?: string;
      errors?: { code?: string; address?: string; port?: number }[];
      cause?: unknown;
    };
    const bits = [
      c.code && `code=${c.code}`,
      c.syscall && `syscall=${c.syscall}`,
      c.address && `address=${c.address}${c.port ? ":" + c.port : ""}`,
      c.message && `message=${c.message}`,
    ].filter(Boolean);
    // Some errors bundle several attempts (e.g. IPv6 + IPv4 tried separately).
    if (c.errors?.length) {
      bits.push(
        "attempts=[" +
          c.errors
            .map((x) => `${x.code ?? "?"} ${x.address ?? ""}${x.port ? ":" + x.port : ""}`)
            .join("; ") +
          "]",
      );
    }
    parts.push(`cause: ${bits.join(", ")}`);
    cause = c.cause;
  }
  return parts.join(" | ");
}

export async function GET() {
  // With cacheComponents on, this tells Next.js "wait for a real request".
  // That way the checks run fresh every time and are never cached or prerendered.
  await connection();

  const result: { tatum: Check; walrus: Check; memory: Check } = {
    tatum: { ok: false },
    walrus: { ok: false },
    memory: { ok: false },
  };

  // a. Tatum: ask Sui for the latest checkpoint number
  try {
    const checkpoint = await getLatestCheckpoint();
    result.tatum = { ok: true, latestCheckpoint: checkpoint };
  } catch (e) {
    result.tatum = { ok: false, error: errorText(e) };
  }

  // b. Walrus: is the relayer reachable?
  let memwal;
  try {
    memwal = getMemWal(NAMESPACE);
    const walrus = memwal;
    const health = await withRetry("Walrus health", () => walrus.health());
    result.walrus = { ok: true, status: health.status, version: health.version };
  } catch (e) {
    logWalrusError("health check", e);
    result.walrus = { ok: false, error: errorText(e) };
  }

  // c. Walrus Memory: save one memory, then recall it
  if (memwal && result.walrus.ok) {
    const walrus = memwal;
    let step = "save";
    try {
      await withRetry("Walrus save", () =>
        walrus.rememberAndWait(TEST_TEXT, NAMESPACE, {
          timeoutMs: MEMWAL_SAVE_WAIT_MS,
        }),
      );

      // Search can lag a moment behind saving, so try a few times.
      step = "recall";
      let found: string | null = null;
      for (let attempt = 0; attempt < 5 && !found; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
        const recalled = await withRetry("Walrus recall", () =>
          walrus.recall({
            query: TEST_TEXT,
            namespace: NAMESPACE,
            limit: 5,
          }),
        );
        found =
          recalled.results.find((m) => m.text.includes(TEST_TEXT))?.text ??
          null;
      }

      result.memory = found
        ? { ok: true, namespace: NAMESPACE, recalledText: found }
        : { ok: false, error: "Saved the memory, but could not recall it yet." };
    } catch (e) {
      // Full details (status, server answer, stack) go to the terminal running `npm run dev`.
      logWalrusError(step, e);
      result.memory = { ok: false, failedStep: step, error: errorText(e) };
    }
  } else {
    result.memory = { ok: false, error: "Skipped because Walrus is not OK." };
  }

  const allOk = result.tatum.ok && result.walrus.ok && result.memory.ok;
  return Response.json({ ok: allOk, ...result }, { status: allOk ? 200 : 502 });
}
