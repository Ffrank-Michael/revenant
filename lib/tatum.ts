// Server-side helper for talking to Sui Mainnet through Tatum's GraphQL gateway.
// Only import this from server code (API routes). The key stays in .env.local.
//
// Tatum no longer serves Sui JSON-RPC (it returns 404). Its live gateway speaks
// GraphQL at /graphql (see https://sui-mainnet.gateway.tatum.io/_methods).

import { withRetry } from "./retry";

const TATUM_SUI_GRAPHQL_URL = "https://sui-mainnet.gateway.tatum.io/graphql";

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

  return withRetry("Tatum Sui GraphQL", async () => {
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

    if (!res.ok) {
      throw new TatumHttpError(res.status, res.statusText, await res.text());
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (json.errors?.length) {
      throw new Error(
        `Sui GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    return json.data as T;
  });
}

// Latest checkpoint number (a counter that goes up as Sui records new blocks of activity).
export async function getLatestCheckpoint(): Promise<string> {
  const data = await suiGraphQL<{ checkpoint: { sequenceNumber: number | string } }>(
    "{ checkpoint { sequenceNumber } }",
  );
  return String(data.checkpoint.sequenceNumber);
}
