// Browser-side helper: asks /api/trace and turns EVERY outcome into something the page can show in plain words.
// Raw errors never leave this file: they are logged to the browser console for the developer only.

import type { TraceWithMemory } from "./rugs";

export type TraceOutcome =
  | { kind: "ok"; data: TraceWithMemory }
  | { kind: "bad_input"; message: string } // the person can fix this themselves
  | { kind: "retry"; message: string } // not their fault: temporary, try again
  | { kind: "cancelled" };

const TIMEOUT_MS = 150_000; // the server gives up at 120s

export const RETRY_MESSAGE = "Something went wrong on our side. Please try again.";

export async function fetchTrace(coin: string, signal: AbortSignal): Promise<TraceOutcome> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onCancel = () => timeout.abort();
  signal.addEventListener("abort", onCancel);
  try {
    const res = await fetch(`/api/trace?coin=${encodeURIComponent(coin)}`, { signal: timeout.signal, cache: "no-store" });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      console.error("[trace] the answer was not readable JSON (HTTP " + res.status + ")");
      return { kind: "retry", message: RETRY_MESSAGE };
    }
    const b = body as { ok?: boolean; code?: string } | null;
    if (res.ok && b?.ok === true) return { kind: "ok", data: body as TraceWithMemory };

    console.error("[trace] the server said:", res.status, body);
    if (b?.code === "invalid_coin_type" || b?.code === "missing_coin") {
      return { kind: "bad_input", message: "That does not look like a token address on Sui. It should have three parts joined by ::, like 0x123::coin::NAME." };
    }
    if (b?.code === "package_not_found") {
      return { kind: "bad_input", message: "We could not find that token on Sui. Check that you copied all of it." };
    }
    return { kind: "retry", message: RETRY_MESSAGE };
  } catch (e) {
    if (signal.aborted) return { kind: "cancelled" }; // the person pressed Cancel
    console.error("[trace] request failed:", e);
    return { kind: "retry", message: timeout.signal.aborted ? "This is taking too long. Please try again in a minute." : RETRY_MESSAGE };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onCancel);
  }
}
