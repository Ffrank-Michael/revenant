// Server-side helper for talking to Sui Mainnet through Tatum's GraphQL gateway.
// Only import this from server code (API routes). The key stays in .env.local.
//
// Tatum no longer serves Sui JSON-RPC (it returns 404). Its live gateway speaks
// GraphQL at /graphql (see https://sui-mainnet.gateway.tatum.io/_methods).
//
// Tatum's free plan allows 3 requests per second. Every call goes through a small
// "queue" below: calls are spaced at least 400ms apart (max 2.5 per second), and if
// Tatum still answers 429 (too many requests) we wait as long as it asks (retry-after)
// and try again.

import { withRetry } from "./retry";

const TATUM_SUI_GRAPHQL_URL = "https://sui-mainnet.gateway.tatum.io/graphql";

const MIN_GAP_MS = 400; // 1000ms / 400ms = 2.5 requests per second, under the free limit of 3
const MAX_429_RETRIES = 6;

// The "next free slot" is kept on globalThis so every route in the app shares one queue.
const shared = globalThis as unknown as { __tatumNextSlot?: number; __tatumRequests?: number };

// How many requests we have sent to Tatum since the server started (counts every try,
// including ones answered with 429). Handy for staying inside a budget.
export function getTatumRequestCount(): number {
  return shared.__tatumRequests ?? 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Waits for our turn. Each caller reserves the next slot, so even many calls at once
// are released one by one, 400ms apart.
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, shared.__tatumNextSlot ?? 0);
  shared.__tatumNextSlot = start + MIN_GAP_MS;
  if (start > now) await sleep(start - now);
}

// A real answer from Tatum with a bad status (401 wrong key, 404, ...). Never retried.
export class TatumHttpError extends Error {
  status: number;
  constructor(status: number, statusText: string, body: string) {
    super(`Tatum returned HTTP ${status} ${statusText}: ${body.slice(0, 300)}`);
    this.name = "TatumHttpError";
    this.status = status;
  }
}

export async function suiGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    throw new Error("TATUM_API_KEY is empty. Add it to .env.local and restart.");
  }

  // withRetry handles network errors and timeouts. The loop inside handles 429.
  return withRetry("Tatum Sui GraphQL", async () => {
    for (let attempt = 0; ; attempt++) {
      await waitForSlot();
      shared.__tatumRequests = (shared.__tatumRequests ?? 0) + 1;

      const res = await fetch(TATUM_SUI_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey, // this is how Tatum wants the key sent
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });

      // 429 = "too many requests". Wait as long as Tatum asks, then try again.
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        await res.text(); // read and discard the body
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000;
        // Push the shared queue back too, so other waiting calls also pause.
        shared.__tatumNextSlot = Math.max(shared.__tatumNextSlot ?? 0, Date.now() + waitMs);
        console.warn(`[tatum] 429 rate limited. Waiting ${waitMs}ms (try ${attempt + 1} of ${MAX_429_RETRIES}).`);
        continue;
      }

      if (!res.ok) {
        throw new TatumHttpError(res.status, res.statusText, await res.text());
      }

      const json = (await res.json()) as {
        data?: T;
        errors?: { message: string; extensions?: { chain?: string[] } }[];
      };
      if (json.errors?.length) {
        // `extensions.chain` often holds the real reason (e.g. "data below earliest available").
        throw new Error(
          `Sui GraphQL error: ${json.errors
            .map((e) => e.message + (e.extensions?.chain?.length ? ` [${e.extensions.chain.join("; ")}]` : ""))
            .join("; ")}`,
        );
      }
      return json.data as T;
    }
  });
}

// Latest checkpoint number (a counter that goes up as Sui records new blocks of activity).
export async function getLatestCheckpoint(): Promise<string> {
  const data = await suiGraphQL<{ checkpoint: { sequenceNumber: number | string } }>(
    "{ checkpoint { sequenceNumber } }",
  );
  return String(data.checkpoint.sequenceNumber);
}
