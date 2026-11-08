"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CaseCard, type CardFace } from "./CaseCard";
import { Collapse } from "./Collapse";
import { RelayLine } from "./RelayLine";
import { RugProof, WatchedProof } from "./ProofPanel";
import { ErrorNotice } from "./ErrorNotice";
import { fmtDay, fmtDuration, fmtSui } from "@/lib/format";
import type { BoardData, BoardLink, BoardRug, BoardWatched } from "@/lib/board";

type Loaded = BoardData & { ok: true };
type State = { name: "loading" } | { name: "error" } | { name: "ready"; data: Loaded };

// Puts the linked coins in order: the one nothing points at first, then whatever it points to.
function chainOrder(links: BoardLink[]): string[] {
  if (!links.length) return [];
  const to = new Set(links.map((l) => l.to));
  let cur = links.find((l) => !to.has(l.from))?.from ?? links[0].from;
  const order = [cur];
  for (let i = 0; i < links.length; i++) {
    const next = links.find((l) => l.from === cur && !order.includes(l.to));
    if (!next) break;
    order.push(next.to);
    cur = next.to;
  }
  return order;
}

const putTakeSentence = (putIn: number, taken: number, at: string | null) =>
  `The creator put in ${fmtSui(putIn)} and took out ${fmtSui(taken)}${at ? ` on ${fmtDay(at)}` : ""}.`;

// One plain line about the money trail, from the real links
function linkLine(name: string, links: BoardLink[]): string | null {
  const out = links.find((l) => l.from === name);
  if (out) return `That money was later sent to ${out.to}'s creator.`;
  const inc = links.find((l) => l.to === name);
  if (inc) return `Its creator was paid with money from ${inc.from}'s rug pull.`;
  return null;
}

function rugFace(r: BoardRug, links: BoardLink[], withLink: boolean): CardFace {
  return {
    name: r.symbol,
    status: { label: "Rug pulled", tone: "alert" },
    sentence: putTakeSentence(r.suiPutIn, r.suiTaken, r.pulledAt),
    linkLine: withLink ? linkLine(r.symbol, links) : null,
  };
}

function watchedFace(w: BoardWatched, links: BoardLink[]): CardFace {
  const pulled = w.status === "pulled" && w.pull;
  const putIn = w.suiPutIn ?? w.suiInPool ?? 0;
  const out = w.suiTakenOut ?? 0;
  return {
    name: w.symbol,
    status: pulled ? { label: "Rug pulled", tone: "alert" } : { label: "Being watched", tone: "plain" },
    sentence: pulled && w.pull ? putTakeSentence(putIn, w.pull.suiTaken, w.pull.at) : out > 0 ? `The creator put in ${fmtSui(putIn)} and has taken out ${fmtSui(out)} so far.` : `The creator put in ${fmtSui(putIn)} and has taken nothing out yet.`,
    linkLine: linkLine(w.symbol, links),
    clock: w.warning ? { warnedAt: w.warning.flaggedAt, pulledAt: pulled && w.pull ? w.pull.at : null } : null,
  };
}

// The short story under "A real example", built from the real links and dates
function exampleStory(chain: string[], items: Map<string, { rug?: BoardRug; watched?: BoardWatched }>): string {
  const when = (n: string) => {
    const it = items.get(n);
    const at = it?.rug?.pulledAt ?? it?.watched?.pull?.at ?? null;
    return at ? fmtDay(at) : null;
  };
  const tail = (n: string) => {
    const it = items.get(n);
    if (it?.watched && it.watched.status !== "pulled") return ", which is live now";
    const d = when(n);
    return d ? `, which was rug pulled on ${d}` : "";
  };
  const parts: string[] = [];
  chain.slice(0, -1).forEach((n, i) => {
    const next = chain[i + 1];
    const last = i === chain.length - 2;
    const d = when(n);
    if (i === 0) {
      parts.push(`${n} was rug pulled${d ? ` on ${d}` : ""}.`);
      parts.push(`The money it took was sent to the person who launched ${next}${last ? tail(next) : ""}.`);
    } else {
      parts.push(`${n} was rug pulled${d ? ` on ${d}` : ""}, and that money was sent to the person who launched ${next}${last ? tail(next) : ""}.`);
    }
  });
  return parts.join(" ");
}

export function CaseBoard() {
  const [state, setState] = useState<State>({ name: "loading" });
  const [open, setOpen] = useState<string | null>(null);
  const lastChainOpen = useRef<string | null>(null); // keeps the desktop panel filled while it closes
  const lastOpen = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState({ name: "loading" });
    try {
      const res = await fetch("/api/memory", { cache: "no-store", signal: AbortSignal.timeout(90_000) });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error("memory answer was not ok: " + res.status);
      setState({ name: "ready", data: body as Loaded });
    } catch (e) {
      console.error("[board] could not load the examples:", e);
      setState({ name: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.name === "loading")
    return (
      <Section>
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <p className="font-mono text-xs uppercase tracking-widest text-warn">Loading the example…</p>
          <p className="text-sm text-dim">The first load can take a few seconds.</p>
          <div className="flex flex-col gap-4 lg:flex-row">
            {[0, 1, 2].map((i) => (
              <div key={i} className="paper h-48 flex-1 animate-pulse rounded-lg border border-line opacity-60" />
            ))}
          </div>
        </div>
      </Section>
    );
  if (state.name === "error")
    return (
      <Section>
        <ErrorNotice message="We could not load the example. Please try again." onRetry={load} />
      </Section>
    );

  const { rugs, watched, links, counters, notes } = state.data;
  const items = new Map<string, { rug?: BoardRug; watched?: BoardWatched }>();
  rugs.forEach((r) => items.set(r.symbol, { rug: r }));
  watched.forEach((w) => items.set(w.symbol, { watched: w }));
  const chain = chainOrder(links).filter((n) => items.has(n));
  const rest = rugs.filter((r) => !chain.includes(r.symbol)).sort((a, b) => (a.pulledAt ?? "").localeCompare(b.pulledAt ?? ""));
  const toggle = (k: string) => setOpen((cur) => (cur === k ? null : k));
  const openRest = rest.find((r) => r.symbol === open);
  // (shownRest is set just below, once the open card is remembered)
  if (open) lastOpen.current = open; // remembered so a closing panel keeps its content while it shrinks
  if (open && chain.includes(open)) lastChainOpen.current = open;
  const shownRest = rest.find((r) => r.symbol === lastOpen.current);

  const proofFor = (name: string) => {
    const it = items.get(name);
    if (!it) return null;
    return it.rug ? <RugProof rug={it.rug} links={links} /> : <WatchedProof w={it.watched!} links={links} />;
  };
  const faceFor = (name: string) => {
    const it = items.get(name)!;
    return it.rug ? rugFace(it.rug, links, true) : watchedFace(it.watched!, links);
  };

  return (
    <div className="flex flex-col gap-14">
      {chain.length > 1 && (
        <Section>
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-3xl leading-[1.1] text-text sm:text-4xl">A real example from this week</h2>
            <p className="max-w-2xl text-base leading-7 text-dim">A rug pull is when the people who made a coin take all the money out and leave buyers stuck.</p>
            <p className="max-w-2xl text-base leading-7 text-text">{exampleStory(chain, items)}</p>
          </div>

          <div className="mt-8 flex flex-col lg:flex-row lg:items-stretch">
            {chain.map((name, i) => {
              const next = chain[i + 1];
              const link = next ? links.find((l) => l.from === name && l.to === next) : undefined;
              return (
                <Fragment key={name}>
                  <div className="mx-auto w-full min-w-0 max-w-xl lg:mx-0 lg:flex lg:max-w-none lg:flex-1 lg:flex-col">
                    <CaseCard face={faceFor(name)} open={open === name} onToggle={() => toggle(name)} delay={i * 250} controls={`proof-${name}`} />
                    {/* phone: the proof opens right under the card you tapped */}
                    <div className="lg:hidden">
                      <div className="pt-3">
                        <Collapse open={open === name} id={`proof-${name}`}>
                          {lastOpen.current === name && proofFor(name)}
                        </Collapse>
                      </div>
                    </div>
                  </div>
                  {link && (
                    <RelayLine text={`This money went through ${link.relayCount} other wallets in ${fmtDuration(link.seconds)} before reaching the next creator.`} />
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* desktop: one wide proof panel under the row of cards */}
          <div className="hidden lg:block">
            <div className="pt-4">
              <Collapse open={!!open && chain.includes(open)}>{lastChainOpen.current && proofFor(lastChainOpen.current)}</Collapse>
            </div>
          </div>
        </Section>
      )}

      {rest.length > 0 && (
        <Section>
          <h2 className="font-serif text-2xl leading-[1.1] text-text sm:text-3xl">Other rug pulls Revenant remembers</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-dim">
            We have not found a link between these and any other coin. Similar tricks alone do not show that one person is behind them.
          </p>
          {/* A swipeable row on phones, five across on desktop */}
          <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0">
            {rest.map((r, i) => (
              <div key={r.symbol} className="w-[250px] shrink-0 snap-start lg:w-auto">
                <CaseCard small face={rugFace(r, links, false)} open={open === r.symbol} onToggle={() => toggle(r.symbol)} delay={600 + i * 120} controls="proof-rest" />
              </div>
            ))}
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim lg:hidden">Swipe sideways for more</p>
          <div className="pt-3">
            <Collapse open={!!openRest} id="proof-rest">
              {shownRest && <RugProof rug={shownRest} links={links} />}
            </Collapse>
          </div>
        </Section>
      )}

      <Section>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <Counter value={String(counters.rugsRemembered)} label="rug pulls remembered" />
          <Counter value={counters.memoriesOnWalrus !== null ? String(counters.memoriesOnWalrus) : "?"} label="memories saved on Walrus" />
          <Counter value={String(counters.coinsChecked)} label="coins checked" sub={counters.coinsScreened ? `out of ${counters.coinsScreened} looked at` : undefined} />
        </dl>
        {notes.length > 0 && <p className="mt-3 text-xs text-dim">{notes.join(" ")}</p>}
      </Section>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}

function Counter({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-paper p-3 text-center sm:p-4">
      <dd className="font-serif text-3xl text-text sm:text-4xl">{value}</dd>
      <dt className="mt-1 text-xs leading-4 text-dim">{label}</dt>
      {sub && <p className="mt-0.5 text-balance text-[11px] text-dim">{sub}</p>}
    </div>
  );
}
