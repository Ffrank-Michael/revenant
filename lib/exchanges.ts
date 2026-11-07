// A small, hand-edited list of wallets known to belong to exchanges.
//
// HOW TO ADD ONE: open data/known-exchanges.json and add a line like
//     { "0x1234...abcd": "Binance hot wallet" }
// (address on the left, a label on the right; separate several lines with commas).
// Only add addresses you have verified from a trustworthy source.
//
// The trace stops when it reaches a wallet on this list, because an exchange tells
// us nothing about who is behind the money. The "busy wallet" check (see trace.ts)
// catches most exchange wallets even when they are not on the list.

import list from "@/data/known-exchanges.json";
import { normalizeSuiAddress } from "./sui";

const known = new Map<string, string>(
  Object.entries(list as Record<string, string>)
    .filter(([address]) => /^0x[0-9a-fA-F]+$/.test(address))
    .map(([address, label]) => [normalizeSuiAddress(address), String(label)]),
);

// Returns the label (e.g. "Binance hot wallet") if the wallet is on the list, otherwise null.
export function exchangeLabel(address: string): string | null {
  return known.get(normalizeSuiAddress(address)) ?? null;
}
