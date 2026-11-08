"use client";

import { useState } from "react";
import { AddressText } from "./AddressText";
import { fmtClock, fmtDate, fmtDuration, shortAddr } from "@/lib/format";
import type { BoardLink } from "@/lib/board";

// The real relay chain for one proven link: every relay wallet that held the same SUI coin, in order,
// with the real time it received it. Data comes from the coin's own history (data/proven-links.json).
// Phone: a vertical list. Desktop: one row of blocks. Amber dots drift along the spine.

function gap(seconds: number) {
  return seconds < 60 ? `+${Math.round(seconds)} s` : `+${fmtDuration(Math.round(seconds))}`;
}

export function RelayChain({ link }: { link: BoardLink }) {
  const [sel, setSel] = useState<number | null>(null);
  const hops = link.hops;
  if (!hops.length) return null;

  // "about N seconds apart" is the typical gap after the first wallet (the middle value, not the average)
  const gaps = hops.slice(1).map((h, i) => (Date.parse(h.arrivedAt) - Date.parse(hops[i].arrivedAt)) / 1000);
  const typical = gaps.length ? [...gaps.slice(1)].sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)] : null;
  const chosen = sel !== null ? hops[sel] : null;

  return (
    <div className="rounded-lg border border-line bg-ink/40 p-3 sm:p-4">
      <p className="text-sm leading-6 text-warn">
        The same SUI coin went from {link.from} to {link.to} through {link.relayCount} other wallets in {fmtDuration(link.seconds)}.
      </p>
      <p className="mt-1 text-xs leading-5 text-dim">
        {fmtDate(link.leftAt)}. {typical !== null && gaps.length > 1 ? `After the first wallet, each one passed it on about ${Math.round(typical)} seconds later. ` : ""}
        Tap a wallet to see all of it.
      </p>

      <ol className="relative mt-4 flex flex-col lg:grid lg:grid-cols-10">
        {/* the spine the dots travel along */}
        <div aria-hidden="true" className="flow-y absolute bottom-4 left-[5px] top-4 w-px bg-warn/40 lg:hidden">
          {[0, 3, 6].map((d) => (
            <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
        <div aria-hidden="true" className="flow-x absolute left-[5%] right-[5%] top-[5px] hidden h-px bg-warn/40 lg:block">
          {[0, 3, 6].map((d) => (
            <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>

        {hops.map((h, i) => {
          const isSel = sel === i;
          const tag = i === 0 ? "first" : i === hops.length - 1 ? "last" : null;
          return (
            <li key={h.tx + i} className="relative flex items-center gap-3 lg:flex-col lg:gap-1.5 lg:text-center">
              <span aria-hidden="true" className={`relative z-10 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-warn ${isSel ? "bg-warn" : "bg-ink"}`} />
              <button
                type="button"
                onClick={() => setSel(isSel ? null : i)}
                aria-pressed={isSel}
                aria-label={`Wallet ${i + 1} of ${hops.length}, ${shortAddr(h.address)}`}
                className={`flex min-h-[34px] min-w-0 flex-1 items-center justify-between gap-2 rounded border px-2 py-1 text-left font-mono text-[11px] leading-4 transition-colors lg:min-h-0 lg:flex-col lg:justify-start lg:px-1 lg:text-center ${
                  isSel ? "border-warn bg-warn/10 text-text" : "border-line text-dim hover:border-warn/60"
                }`}
              >
                <span className="flex flex-col">
                  <span className="text-text">{shortAddr(h.address)}</span>
                  {tag && <span className="text-[9px] uppercase tracking-widest text-warn">{tag} wallet</span>}
                </span>
                <span className="flex flex-col text-right lg:text-center">
                  <span>{fmtClock(h.arrivedAt)}</span>
                  <span className="text-[10px] text-dim">{i === 0 ? "received it" : gap(gaps[i - 1])}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* The tapped wallet, in full */}
      <div className="grid transition-[grid-template-rows] duration-500 ease-in-out" style={{ gridTemplateRows: chosen ? "1fr" : "0fr" }}>
        <div className="overflow-hidden" inert={!chosen}>
          {chosen && sel !== null && (
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <AddressText label={`Wallet ${sel + 1} of ${hops.length}${sel === 0 ? " (first)" : sel === hops.length - 1 ? " (last)" : ""}`} value={chosen.address} />
              <AddressText label="Transaction where it received the coin" value={chosen.tx} tx />
              <p className="text-xs text-dim">Received at {fmtClock(chosen.arrivedAt)} UTC.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
