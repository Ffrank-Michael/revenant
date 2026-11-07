// Server-side helper for Walrus Memory (MemWal).
// Only import this from server code (API routes). The keys stay in .env.local.

import { MemWal } from "@mysten-incubation/memwal";

// Generous timeouts: this network is slow and saving to Walrus can take a while.
export const MEMWAL_REQUEST_TIMEOUT_MS = 120_000; // each normal request (default was 30s)
export const MEMWAL_RECALL_TIMEOUT_MS = 60_000; // searching memories (default was 15s)
export const MEMWAL_PREFLIGHT_TIMEOUT_MS = 20_000; // quick version/health checks (default was 5s)
export const MEMWAL_SAVE_WAIT_MS = 120_000; // how long to wait for a save to finish

export function getMemWal(namespace?: string): MemWal {
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  const serverUrl =
    process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz";

  if (!key || !accountId) {
    throw new Error(
      "MEMWAL_PRIVATE_KEY or MEMWAL_ACCOUNT_ID is empty. Add them to .env.local and restart.",
    );
  }

  return MemWal.create({
    key,
    accountId,
    serverUrl,
    namespace,
    requestTimeoutMs: MEMWAL_REQUEST_TIMEOUT_MS,
    recallTimeoutMs: MEMWAL_RECALL_TIMEOUT_MS,
    preflightTimeoutMs: MEMWAL_PREFLIGHT_TIMEOUT_MS,
  });
}

// Writes everything we can learn about a Walrus error to the terminal running `npm run dev`.
// Walrus errors can carry the server's raw answer in `cause`; Sui errors carry status/statusText.
export function logWalrusError(step: string, e: unknown): void {
  const err = e as {
    name?: string;
    message?: string;
    status?: number;
    statusText?: string;
    serverCode?: string;
    retryAfterSeconds?: number;
    cause?: unknown;
    stack?: string;
  };
  const cause =
    typeof err?.cause === "string"
      ? err.cause.slice(0, 2000)
      : err?.cause
        ? JSON.stringify(err.cause, Object.getOwnPropertyNames(err.cause as object)).slice(0, 2000)
        : undefined;

  console.error(
    `[walrus] ${step} FAILED${err?.status === 404 ? " (HTTP 404)" : ""}\n` +
      JSON.stringify(
        {
          name: err?.name,
          message: err?.message,
          status: err?.status,
          statusText: err?.statusText,
          serverCode: err?.serverCode,
          retryAfterSeconds: err?.retryAfterSeconds,
          responseOrCause: cause,
        },
        null,
        2,
      ) +
      `\n${err?.stack ?? ""}`,
  );
}
