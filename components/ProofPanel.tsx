"use client";

import { useState, type ReactNode } from "react";
import { AddressText } from "./AddressText";
import { RelayChain } from "./RelayChain";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { rugSummary, watchedSummary } from "@/lib/proofText";
import type { BoardLink, BoardRug, BoardWatched } from "@/lib/board";

// The proof: a wide panel with a short plain summary first, then the details.

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="paper rounded-lg border border-warn/40 p-4 pl-11 sm:p-6 sm:pl-12">
      <h3 className="font-serif text-2xl text-text sm:text-3xl">{title}</h3>
      {children}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-warn">{children}</p>;
}

function MoneyTrail({ link, direction }: { link: BoardLink; direction: "out" | "in" }) {
  return (
    <div className="flex flex-col gap-4">
      <Heading>{direction === "out" ? `Where the money went: ${link.to}` : `Where the money came from: ${link.from}`}</Heading>
      <p className="text-sm leading-6 text-text">
        One SUI coin made in the {link.from} pull stayed in one piece. It went through {link.relayCount} other wallets in {fmtDuration(link.seconds)} and reached the
        creator of {link.to}. It has the same ID the whole way, so this is not a guess.
      </p>
      <RelayChain link={link} />
      <AddressText label="The SUI coin" value={link.coinId} />
      <AddressText label="Transaction where it left" value={link.leftTx} tx />
      <AddressText label="Transaction where it arrived" value={link.arrivedTx} tx />
      <p className="text-xs leading-5 text-dim">This shows the money moved. It does not show who is behind the wallets.</p>
    </div>
  );
}

export function RugProof({ rug, links }: { rug: BoardRug; links: BoardLink[] }) {
  const out = links.filter((l) => l.from === rug.symbol);
  const inc = links.filter((l) => l.to === rug.symbol);
  return (
    <Box title={`${rug.symbol}: the proof`}>
      <p className="mt-3 max-w-3xl text-base leading-7 text-text">{rugSummary(rug, links)}</p>

      <div className="mt-6 flex flex-col gap-6 border-t border-line pt-5">
        {out.map((l) => (
          <MoneyTrail key={l.coinId + "o"} link={l} direction="out" />
        ))}
        {inc.map((l) => (
          <div key={l.coinId + "i"} className="flex flex-col gap-3">
            <MoneyTrail link={l} direction="in" />
            {rug.pullCoinObjects.some((o) => o.id === l.coinId && o.role === "gas_coin") && (
              <p className="text-xs leading-5 text-dim">That same coin later paid the fees for this coin&apos;s own pull.</p>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-4">
          <Heading>The details</Heading>
          {rug.pullDigests.map((d, i) => (
            <AddressText key={d} label={rug.pullDigests.length > 1 ? `Pull transaction ${i + 1}` : "Pull transaction"} value={d} tx />
          ))}
          <AddressText label="Creator wallet" value={rug.creator} />
          <AddressText label="Coin type" value={rug.coinType} />
          {rug.pullCoinObjects.map((o) => (
            <AddressText key={o.id} label={o.role === "gas_coin" ? "SUI coin that paid the pull fees" : "SUI coin made by the pull"} value={o.id} />
          ))}
        </div>
      </div>
    </Box>
  );
}

export function WatchedProof({ w, links }: { w: BoardWatched; links: BoardLink[] }) {
  const inc = links.filter((l) => l.to === w.symbol);
  const [nowMs] = useState(() => Date.now());
  return (
    <Box title={`${w.symbol}: the proof`}>
      <p className="mt-3 max-w-3xl text-base leading-7 text-text">{watchedSummary(w, links, nowMs)}</p>
      {w.warning && (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-dim">
          Our warning is saved on Walrus, a public storage network, so it cannot be changed afterwards.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6 border-t border-line pt-5">
        {inc.map((l) => (
          <MoneyTrail key={l.coinId} link={l} direction="in" />
        ))}
        <div className="flex flex-col gap-4">
          <Heading>The details</Heading>
          {w.warning?.blobId && <AddressText label="Our warning on Walrus" value={w.warning.blobId} />}
          {w.pull?.digest ? <AddressText label="Pull transaction" value={w.pull.digest} tx /> : <p className="text-sm leading-6 text-text">Not pulled yet, so there is no pull to check.</p>}
          <AddressText label="Creator wallet" value={w.creator} />
          <AddressText label="Coin type" value={w.coinType} />
          {w.lastCheckAt && <p className="text-xs text-dim">Last checked {fmtDateTime(w.lastCheckAt)}. A link to earlier rug pulls is a warning sign, not proof.</p>}
        </div>
      </div>
    </Box>
  );
}
