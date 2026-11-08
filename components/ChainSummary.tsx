"use client";

import { Fragment } from "react";
import { useBoard } from "./BoardContext";
import { chainOrder } from "@/lib/chain";
import { fmtDay, fmtDuration, fmtSui } from "@/lib/format";

const LABEL = "font-mono text-[11px] uppercase tracking-[0.2em] text-dim";
const CELL_LABEL = "block whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.1em] text-dim";

// A compact version of the proven chain for the top of the page: one ruled box, one row per coin,
// with the money trail between the rows. Built from the same board data as the cards below.
export function ChainSummary() {
  const { state } = useBoard();
  if (state.name === "loading")
    return <div aria-hidden="true" className="h-64 animate-pulse border border-line bg-paper opacity-60" />;
  if (state.name !== "ready") return null;

  const { rugs, watched, links } = state.data;
  const rows = chainOrder(links)
    .map((name) => {
      const r = rugs.find((x) => x.symbol === name);
      const w = watched.find((x) => x.symbol === name);
      const at = r?.pulledAt ?? w?.pull?.at ?? null;
      const out = r ? r.suiTaken : w?.pull ? w.pull.suiTaken : null;
      return { name, at, out };
    })
    .filter((r) => rugs.some((x) => x.symbol === r.name) || watched.some((x) => x.symbol === r.name));
  if (rows.length < 2) return null;

  return (
    <div className="border border-line bg-paper" aria-label="The chain of linked rug pulls">
      <p className={`${LABEL} border-b border-line px-4 py-2`}>The chain: one pull paid for the next coin</p>
      <div className="flex flex-col">
        {rows.map((r, i) => {
          const link = links.find((l) => l.from === r.name && l.to === rows[i + 1]?.name);
          return (
            <Fragment key={r.name}>
              <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 px-4 py-4">
                <span className="font-serif text-2xl leading-none text-text">{r.name}</span>
                <span className="text-right">
                  <span className={CELL_LABEL}>Pulled on</span>
                  <span className="font-mono text-base text-text">{r.at ? fmtDay(r.at) : "Not yet"}</span>
                </span>
                <span className="text-right">
                  <span className={CELL_LABEL}>Took out</span>
                  <span className="font-mono text-base text-text">{r.out !== null ? fmtSui(r.out) : "Nothing yet"}</span>
                </span>
              </div>
              {link && (
                <div className="flex items-center gap-2 border-y border-line bg-ink px-4 py-2">
                  <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true" className="shrink-0 text-warn">
                    <path d="M6 1V14M6 14L1.5 9.5M6 14L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className={`${LABEL} text-warn`}>
                    Money passed through {link.relayCount} wallets in {fmtDuration(link.seconds)}
                  </p>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
