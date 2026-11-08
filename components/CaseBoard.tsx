"use client";

import { Fragment, useRef, useState } from "react";
import { CaseCard, LABEL, type CardFace } from "./CaseCard";
import { Collapse } from "./Collapse";
import { RelayLine } from "./RelayLine";
import { RugProof, WatchedProof } from "./ProofPanel";
import { ErrorNotice } from "./ErrorNotice";
import { useBoard } from "./BoardContext";
import { chainOrder } from "@/lib/chain";
import { fmtDay, fmtDuration, fmtSui } from "@/lib/format";
import { fmtSpan } from "@/lib/proofText";
import type { BoardLink, BoardRug, BoardWatched } from "@/lib/board";

// Every block on the page is a section with a thin rule on top. The same spacing everywhere:
// 24 px above the rule and 40 px below it on desktop, 16 and 24 on phones.
export const SECTION = "border-t border-line pt-6 lg:pt-10";
const TITLE = "font-serif text-2xl leading-tight text-text";
const BODY = "text-base leading-7 text-dim";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

const putTakeSentence = (putIn: number, taken: number, at: string | null) =>
  `The creator put in ${fmtSui(putIn)} and took out ${fmtSui(taken)}${at ? ` on ${fmtDay(at)}` : ""}.`;

// One plain line about the money trail, from the real links
function linkLine(name: string, links: BoardLink[]): string | null {
  const out = links.find((l) => l.from === name);
  if (out) return `That money was later sent to ${out.to}'s creator.`;
  const inc = links.find((l) => l.to === name);
  if (inc) return `The creator was paid with money from ${inc.from}'s rug pull.`;
  return null;
}

function rugFace(r: BoardRug, links: BoardLink[]): CardFace {
  const ms = r.pulledAt ? Date.parse(r.pulledAt) - Date.parse(r.publishedAt) : null;
  const link = linkLine(r.symbol, links);
  return {
    name: r.symbol,
    status: { label: "Rug pulled", tone: "alert" },
    sentence: putTakeSentence(r.suiPutIn, r.suiTaken, r.pulledAt),
    facts: [
      { label: "Put in (SUI)", value: num(r.suiPutIn) },
      { label: "Took out (SUI)", value: num(r.suiTaken) },
      { label: "Pulled on", value: r.pulledAt ? fmtDay(r.pulledAt) : "Not yet" },
      { label: "Lasted", value: ms !== null ? fmtSpan(ms) : "Not pulled yet" },
    ],
    wide: [
      ...(link ? [{ label: "Money trail", value: link }] : []),
    ],
  };
}

function watchedFace(w: BoardWatched, links: BoardLink[]): CardFace {
  const pulled = w.status === "pulled" && w.pull;
  const putIn = w.suiPutIn ?? w.suiInPool ?? 0;
  const out = pulled && w.pull ? w.pull.suiTaken : (w.suiTakenOut ?? 0);
  const ms = (pulled && w.pull ? Date.parse(w.pull.at) : Date.now()) - Date.parse(w.publishedAt);
  const link = linkLine(w.symbol, links);
  return {
    name: w.symbol,
    status: pulled ? { label: "Rug pulled", tone: "alert" } : { label: "Being watched", tone: "plain" },
    sentence:
      pulled && w.pull
        ? putTakeSentence(putIn, w.pull.suiTaken, w.pull.at)
        : out > 0
          ? `The creator put in ${fmtSui(putIn)} and has taken out ${fmtSui(out)} so far.`
          : `The creator put in ${fmtSui(putIn)} and has taken nothing out yet.`,
    facts: [
      { label: "Put in (SUI)", value: num(putIn) },
      { label: "Took out (SUI)", value: num(out) },
      { label: "Pulled on", value: pulled && w.pull ? fmtDay(w.pull.at) : "Not yet" },
      { label: pulled ? "Lasted" : "Live for", value: fmtSpan(ms) },
    ],
    wide: link ? [{ label: "Money trail", value: link }] : [],
    clock: w.warning ? { warnedAt: w.warning.flaggedAt, pulledAt: pulled && w.pull ? w.pull.at : null } : null,
  };
}

export function CaseBoard() {
  const { state, reload } = useBoard();
  const [open, setOpen] = useState<string | null>(null);
  const lastOpen = useRef<string | null>(null); // remembered so a closing panel keeps its content while it shrinks

  if (state.name === "loading")
    return (
      <section className={SECTION}>
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <p className={`${LABEL} text-warn`}>Loading the example…</p>
          <p className={BODY}>The first load can take a few seconds.</p>
          <div className="flex flex-col gap-4 lg:flex-row">
            {[0, 1, 2].map((i) => (
              <div key={i} className="paper h-64 flex-1 animate-pulse rounded-lg border border-line opacity-60" />
            ))}
          </div>
        </div>
      </section>
    );
  if (state.name === "error")
    return (
      <section className={SECTION}>
        <ErrorNotice message="We could not load the example. Please try again." onRetry={reload} />
      </section>
    );

  const { rugs, watched, links, counters, notes } = state.data;
  const items = new Map<string, { rug?: BoardRug; watched?: BoardWatched }>();
  rugs.forEach((r) => items.set(r.symbol, { rug: r }));
  watched.forEach((w) => items.set(w.symbol, { watched: w }));
  const chain = chainOrder(links).filter((n) => items.has(n));
  const rest = rugs.filter((r) => !chain.includes(r.symbol)).sort((a, b) => (a.pulledAt ?? "").localeCompare(b.pulledAt ?? ""));
  const toggle = (k: string) => setOpen((cur) => (cur === k ? null : k));
  if (open) lastOpen.current = open;

  const proofFor = (name: string) => {
    const it = items.get(name);
    if (!it) return null;
    return it.rug ? <RugProof rug={it.rug} links={links} /> : <WatchedProof w={it.watched!} links={links} />;
  };
  const faceFor = (name: string) => {
    const it = items.get(name)!;
    return it.rug ? rugFace(it.rug, links) : watchedFace(it.watched!, links);
  };
  const openChain = open && chain.includes(open) ? open : null;
  const shownChain = lastOpen.current && chain.includes(lastOpen.current) ? lastOpen.current : null;

  return (
    <>
      {chain.length > 1 && (
        <section className={SECTION}>
          <div className="flex flex-col gap-2">
            <h2 className={TITLE}>Rugs we caught: AXIS, VETO and BUBBLES</h2>
            <p className={`${BODY} max-w-[70ch] text-pretty`}>
              A rug pull is when the creators empty a token's trading pool so nobody can sell the token for real money anymore.
            </p>
          </div>

          <div className="mt-6 flex flex-col lg:flex-row lg:items-stretch">
            {chain.map((name, i) => {
              const next = chain[i + 1];
              const link = next ? links.find((l) => l.from === name && l.to === next) : undefined;
              return (
                <Fragment key={name}>
                  <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col lg:mx-0 lg:max-w-none lg:flex-1">
                    <CaseCard face={faceFor(name)} open={open === name} onToggle={() => toggle(name)} delay={i * 250} controls={`proof-${name}`} />
                    {/* phone: the proof opens right under the card you tapped */}
                    <div className="lg:hidden">
                      <Collapse open={open === name} id={`proof-${name}`}>
                        <div className="pt-4">{lastOpen.current === name && proofFor(name)}</div>
                      </Collapse>
                    </div>
                  </div>
                  {link && <RelayLine text={`This money went through ${link.relayCount} other wallets in ${fmtDuration(link.seconds)} before reaching the next creator.`} />}
                </Fragment>
              );
            })}
          </div>

          {/* desktop: the link text, one ruled cell per link, under the cards */}
          <div className="mt-4 hidden gap-px border border-line bg-line lg:grid" style={{ gridTemplateColumns: `repeat(${chain.length - 1}, 1fr)` }}>
            {chain.slice(0, -1).map((name, i) => {
              const link = links.find((l) => l.from === name && l.to === chain[i + 1]);
              if (!link) return <div key={name} className="bg-ink" />;
              return (
                <div key={name} className="bg-ink p-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-dim">
                    {name} to {chain[i + 1]}
                  </p>
                  <p className="mt-1 font-mono text-[11px] uppercase leading-4 tracking-[0.1em] text-warn">
                    This money went through {link.relayCount} other wallets in {fmtDuration(link.seconds)} before reaching the next creator.
                  </p>
                </div>
              );
            })}
          </div>

          {/* desktop: one wide proof panel under the row of cards */}
          <div className="hidden lg:block">
            <Collapse open={!!openChain}>
              <div className="pt-4">{shownChain && proofFor(shownChain)}</div>
            </Collapse>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className={SECTION}>
          <h2 className={TITLE}>Other rug pulls Revenant remembers</h2>
          <p className={`${BODY} mt-2 max-w-[70ch] text-pretty`}>
            We found no exact token link between these five saved rugs. Similar tricks alone do not show that one person is behind them.
          </p>

          {/* A table: one row per rug, thin rules between the rows */}
          <div className="mt-6 border border-line bg-paper" role="table" aria-label="Other rug pulls">
            <div role="row" className={`${LABEL} hidden grid-cols-[1.2fr_1fr_1fr_1fr_8.5rem] gap-4 border-b border-line px-4 py-2 sm:grid`}>
              <span role="columnheader">Token</span>
              <span role="columnheader">Pulled on</span>
              <span role="columnheader">Put in (SUI)</span>
              <span role="columnheader">Took out (SUI)</span>
              <span role="columnheader">
                <span className="sr-only">Proof</span>
              </span>
            </div>
            {rest.map((r) => (
              <div key={r.symbol} role="row" className="border-b border-line last:border-b-0">
                <div className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-x-3 gap-y-4 px-4 py-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr_8.5rem] sm:gap-x-4 sm:gap-y-0">
                  <span role="cell" className="col-span-2 font-serif text-2xl leading-none text-text sm:col-span-1">
                    {r.symbol}
                  </span>
                  <Cell label="Pulled on" value={r.pulledAt ? fmtDay(r.pulledAt) : "Not yet"} className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto" />
                  <Cell label="Put in (SUI)" value={num(r.suiPutIn)} className="row-start-2 sm:row-start-auto" />
                  <Cell label="Took out (SUI)" value={num(r.suiTaken)} className="row-start-2 sm:row-start-auto" />
                  <span role="cell" className="col-start-3 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-stretch">
                    <button
                      type="button"
                      onClick={() => toggle(r.symbol)}
                      aria-expanded={open === r.symbol}
                      aria-controls={`proof-${r.symbol}`}
                      className="w-full whitespace-nowrap rounded-full border border-warn/60 px-3 py-2 font-mono text-xs uppercase tracking-wider text-warn transition-colors hover:bg-warn hover:text-ink sm:px-4"
                    >
                      {open === r.symbol ? "Hide the proof" : "See the proof"}
                    </button>
                  </span>
                </div>
                <Collapse open={open === r.symbol} id={`proof-${r.symbol}`}>
                  <div className="px-4 pb-4">{lastOpen.current === r.symbol && <RugProof rug={r} links={links} />}</div>
                </Collapse>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={SECTION}>
        <dl className="grid grid-cols-3 gap-px border border-line bg-line">
          <Counter value={String(counters.rugsRemembered)} label="rug pulls remembered" />
          <Counter value={counters.memoriesOnWalrus !== null ? String(counters.memoriesOnWalrus) : "?"} label="memories saved on Walrus" />
          <Counter value={String(counters.coinsChecked)} label="tokens checked" sub={counters.coinsScreened ? `out of ${counters.coinsScreened} looked at` : undefined} />
        </dl>
        {notes.length > 0 && <p className="mt-4 text-xs text-dim">{notes.join(" ")}</p>}
      </section>
    </>
  );
}

// A table cell: on phones it shows its own label above the value; from sm up the header row has the labels.
function Cell({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <span role="cell" className={`min-w-0 ${className}`}>
      <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-dim sm:hidden">{label}</span>
      <span className="block font-mono text-base text-text">{value}</span>
    </span>
  );
}

function Counter({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-paper p-4 text-center">
      <dd className="font-serif text-2xl text-text">{value}</dd>
      <dt className={`${LABEL} mt-2 leading-4 tracking-[0.12em]`}>{label}</dt>
      {sub && <p className="mt-1 text-balance font-mono text-[11px] text-dim">{sub}</p>}
    </div>
  );
}
