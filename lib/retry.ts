// Retry helper: tries again ONLY for network problems and timeouts.
// Errors like "wrong key" (401/403), "not found" (404) or bad requests are
// NOT retried, because trying again can never fix them.

const NETWORK_CODES = new Set([
  "ENETUNREACH",
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TIMEOUT_NAMES = new Set(["TimeoutError", "AbortError", "MemWalRequestTimeout"]);

export function isRetryableNetworkError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 5) return false;
  const e = err as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
    jobId?: string;
    cause?: unknown;
    errors?: unknown[];
  };

  // The Walrus SDK tries Sui's gRPC server first and falls back to a JSON-RPC server that is
  // dead (it answers 404 to everything). If the gRPC try hiccups, that fake 404 is all we see.
  // A real "not found" never comes from this Sui client, so treat it as a temporary glitch.
  if (e.name === "SuiHTTPStatusError" && e.status === 404) return true;

  // A waiting-for-job timeout means "the job may still finish" - re-sending the save could duplicate it.
  if (e.jobId) return false;

  if (e.code && NETWORK_CODES.has(e.code)) return true;
  if (e.name && TIMEOUT_NAMES.has(e.name)) return true;
  // Node's fetch reports connection failures as a TypeError("fetch failed") with the real reason in .cause
  if (e.name === "TypeError" && e.message === "fetch failed") return true;

  // Any other error that carries an HTTP status is a real answer from a server: don't retry.
  if (typeof e.status === "number") return false;

  if (e.errors?.some((x) => isRetryableNetworkError(x, depth + 1))) return true;
  return isRetryableNetworkError(e.cause, depth + 1);
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { extraTries = 2, waitMs = 1500 }: { extraTries?: number; waitMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= extraTries || !isRetryableNetworkError(e)) throw e;
      const wait = waitMs * (attempt + 1); // 1.5s, then 3s
      console.warn(
        `[retry] ${label} failed with a network/timeout error (try ${attempt + 1} of ${extraTries + 1}). Retrying in ${wait}ms.`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
