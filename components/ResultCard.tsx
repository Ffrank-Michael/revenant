"use client";

import { useEffect, useState } from "react";
import { AddressText } from "./AddressText";
import { WarnedClock } from "./WarnedClock";
import { buildVerdict } from "@/lib/verdict";
import { fmtDateTime } from "@/lib/format";
import type { TraceWithMemory } from "@/lib/rugs";
import type { BoardWatched } from "@/lib/board";

// The result of a trace: a headline, the reasons in plain sentences, and where the coin came from.
// The wallet trail goes in the marked slot at the bottom (next step).

export function ResultCard({ data }: { data: TraceWithMemory }) {
  const v = buildVerdict(data);
  const linked = v.level === "linked";
  const name = data.coin.symbol ?? "This coin";

  // If we watch this coin, find the warning we saved about it (read-only, from the board data).
  const [watched, setWatched] = useState<BoardWatched | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/memory", { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { watched?: BoardWatched[] } | null) => {
        setWatched(b?.watched?.find((w) => w.coinType === data.coin.type) ?? null);
      })
      .catch(() => {
        /* the warning line is a bonus: the verdict stands without it */
      });
    return () => ctl.abort();
  }, [data.coin.type]);

  return (
    <div role="status" className={`paper rounded-lg border p-4 pl-11 sm:p-6 sm:pl-12 ${linked ? "border-warn/60" : "border-line"}`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim">Result for {name}</p>
      <h2 className={`mt-2 font-serif text-3xl leading-tight sm:text-4xl ${linked ? "text-warn" : v.level === "signs" ? "text-text" : "text-dim"}`}>{v.headline}</h2>
      {v.note && <p className="mt-3 max-w-2xl text-base leading-7 text-dim">{v.note}</p>}

      {watched?.warning && (
        <div className="mt-3">
          <WarnedClock warnedAt={watched.warning.flaggedAt} pulledAt={watched.pull?.at ?? null} />
        </div>
      )}

      {v.reasons.length > 0 && (
        <ul className="mt-5 flex max-w-3xl flex-col gap-3">
          {v.reasons.map((r, i) => (
            <li key={i} className="flex gap-3 text-base leading-7 text-text">
              <span aria-hidden="true" className={`mt-3 h-1.5 w-1.5 shrink-0 rounded-full ${linked ? "bg-warn" : "bg-dim"}`} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-warn">Coin created</p>
        <p className="text-base leading-7 text-text">
          {name} was created on {fmtDateTime(data.creator.publishedAt)} by this wallet.
        </p>
        <AddressText label="Creator wallet" value={data.creator.address} account />
      </div>

      {/* Next step: the trail of wallets goes here. */}
      <div id="trail-slot" data-slot="trail" />
    </div>
  );
}
