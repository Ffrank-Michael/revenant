"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { CaseCard, type CardFace } from "./CaseCard";
import { RelayLine } from "./RelayLine";
import { RelayChain } from "./RelayChain";
import { AddressText } from "./AddressText";
import { ErrorNotice } from "./ErrorNotice";
import { fmtDate, fmtDateTime, fmtDuration, fmtShortDay, fmtSui, fmtTime, numberWord } from "@/lib/format";
import type { BoardData, BoardLink, BoardRug, BoardWatched } from "@/lib/board";

type Loaded = BoardData & { ok: true };
type State = { name: "loading" } | { name: "error" } | { name: "ready"; data: Loaded };

const CHECKED_BY: Record<BoardRug["checkedBy"], { line: string; long: string }> = {
  "project owner": { line: "Rugged. Confirmed by the project owner.", long: "The project owner checked the transactions on Suiscan and confirmed them." },
  investigator: { line: "Rugged. Confirmed by an investigator.", long: "An investigator checked the transactions on Suiscan and confirmed them." },
  revenant: { line: "Rugged. Checked by Revenant, awaiting review.", long: "Revenant's own on-chain check found this. No person has reviewed it yet." },
};

// Puts the linked cases in order: the one nothing points at first, then whatever it points to.
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

function rugFace(r: BoardRug, fileNo: string): CardFace {
  return {
    fileNo,
    name: r.symbol,
    published: fmtDate(r.publishedAt),
    pulled: r.pulledAt ? fmtDate(r.pulledAt) : null,
    putIn: fmtSui(r.suiPutIn),
    pulledOut: fmtSui(r.suiTaken),
    stamp: { text: "Rugged", tone: "alert" },
    statusLine: CHECKED_BY[r.checkedBy].line,
  };
}

function watchedFace(w: BoardWatched, fileNo: string): CardFace {
  const pulled = w.status === "pulled" && w.pull;
  let warned: string | null = null;
  if (w.warning) {
    const when = `${fmtTime(w.warning.flaggedAt)} ${fmtShortDay(w.warning.flaggedAt)}`;
    if (pulled && w.pull?.hoursAfterWarning != null) {
      const h = w.pull.hoursAfterWarning;
      warned = h >= 0 ? `Warned on Walrus ${when}, ${h.toFixed(1)} hours before the pull` : `Pulled ${Math.abs(h).toFixed(1)} hours before the warning`;
    } else {
      warned = `Warned on Walrus ${when}, before any pull`;
    }
  }
  return {
    fileNo,
    name: w.symbol,
    published: fmtDate(w.publishedAt),
    pulled: pulled && w.pull ? fmtDate(w.pull.at) : null,
    putIn: null,
    pulledOut: pulled && w.pull ? fmtSui(w.pull.suiTaken) : null,
    stamp: pulled ? { text: "Pulled", tone: "alert" } : { text: "Watching", tone: "plain" },
    statusLine: pulled ? "Pulled. Revenant's own check says this is a rug, awaiting review." : "Not pulled yet. Revenant checks it every 10 minutes.",
    extra: !pulled && w.suiInPool !== null ? { label: "SUI still in the pool", value: fmtSui(w.suiInPool) } : null,
    warnedStamp: warned,
    clock: w.warning ? { warnedAt: w.warning.flaggedAt, pulledAt: pulled && w.pull ? w.pull.at : null } : null,
  };
}

// ---------------------------------------------------------------------------
// The evidence, in plain words
// ---------------------------------------------------------------------------
function LinkEvidence({ link, mine }: { link: BoardLink; mine: "from" | "to" }) {
  return (
    <div className="rounded border border-warn/30 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-warn">{mine === "from" ? `Money moved on to ${link.to}` : `Money arrived from ${link.from}`}</p>
      <p className="mt-2 text-sm leading-6 text-text">
        One SUI coin, with this exact ID, was made in the {link.from} pull. It stayed in one piece. It left the {link.from} creator at {fmtDateTime(link.leftAt)} and passed
        through {link.relayCount} relay wallets in {fmtDuration(link.seconds)}, then reached the creator of {link.to} at {fmtDateTime(link.arrivedAt)}.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <AddressText label="SUI coin ID" value={link.coinId} />
        <AddressText label="Transaction where it left" value={link.leftTx} />
        <AddressText label="Transaction where it arrived" value={link.arrivedTx} />
      </div>
      <p className="mt-3 text-xs leading-5 text-dim">This proves the money moved. It does not show who controls the wallets.</p>
    </div>
  );
}

function RugEvidence({ rug, links }: { rug: BoardRug; links: BoardLink[] }) {
  const out = links.filter((l) => l.from === rug.symbol);
  const inc = links.filter((l) => l.to === rug.symbol);
  const net = rug.suiTaken - rug.suiPutIn;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-text">
        The creator of {rug.symbol} put in {fmtSui(rug.suiPutIn)}, then removed the liquidity{rug.exchange ? ` on ${rug.exchange}` : ""}
        {rug.pulledAt ? ` on ${fmtDateTime(rug.pulledAt)}` : ""} and took out {fmtSui(rug.suiTaken)}. That is {net >= 0 ? "a gain" : "a loss"} of {fmtSui(Math.abs(net))}.
      </p>
      <p className="text-sm leading-6 text-dim">{CHECKED_BY[rug.checkedBy].long}</p>
      {inc.map((l) => (
        <div key={l.coinId} className="flex flex-col gap-3">
          <LinkEvidence link={l} mine="to" />
          {rug.pullCoinObjects.some((o) => o.id === l.coinId && o.role === "gas_coin") && (
            <p className="text-xs leading-5 text-dim">That same coin later paid the fees for this coin&apos;s own pull.</p>
          )}
        </div>
      ))}
      {out.map((l) => (
        <LinkEvidence key={l.coinId} link={l} mine="from" />
      ))}
      {rug.pullDigests.map((d, i) => (
        <AddressText key={d} label={rug.pullDigests.length > 1 ? `Pull transaction ${i + 1}` : "Pull transaction"} value={d} />
      ))}
      <AddressText label="Creator wallet" value={rug.creator} />
      <AddressText label="Coin type" value={rug.coinType} />
      {rug.pullCoinObjects.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">SUI coins touched by the pull</p>
          {rug.pullCoinObjects.map((o) => (
            <AddressText key={o.id} label={o.role === "gas_coin" ? "Paid the pull fees" : "Created by the pull"} value={o.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchedEvidence({ w, links }: { w: BoardWatched; links: BoardLink[] }) {
  const inc = links.filter((l) => l.to === w.symbol);
  return (
    <div className="flex flex-col gap-4">
      {w.status === "pulled" && w.pull ? (
        <p className="text-sm leading-6 text-text">
          {w.symbol} was pulled on {fmtDateTime(w.pull.at)}. The creator took out {fmtSui(w.pull.suiTaken)}.
          {w.pull.hoursAfterWarning != null && (w.pull.hoursAfterWarning >= 0 ? ` Revenant's warning was saved ${w.pull.hoursAfterWarning.toFixed(1)} hours before that.` : " The pull happened before the warning was saved.")}
        </p>
      ) : (
        <p className="text-sm leading-6 text-text">
          {w.symbol} has not been pulled. {w.suiInPool !== null ? `About ${fmtSui(w.suiInPool)} is still in its pool. ` : ""}
          {w.lastCheckAt ? `Revenant last checked at ${fmtDateTime(w.lastCheckAt)}. ` : ""}It checks again every 10 minutes. Being linked to earlier rugs is a warning sign, not a verdict.
        </p>
      )}
      {w.warning && (
        <div className="rounded border border-warn/30 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-warn">The warning</p>
          <p className="mt-2 text-sm leading-6 text-text">
            Revenant saved a warning about {w.symbol} on {fmtDateTime(w.warning.flaggedAt)}, before any pull. It is stored on Walrus Mainnet, so it cannot be changed afterwards.
          </p>
          {w.warning.blobId && (
            <div className="mt-3">
              <AddressText label="Warning record on Walrus" value={w.warning.blobId} />
            </div>
          )}
        </div>
      )}
      {inc.map((l) => (
        <LinkEvidence key={l.coinId} link={l} mine="to" />
      ))}
      {w.pull?.digest && <AddressText label="Pull transaction" value={w.pull.digest} />}
      <AddressText label="Creator wallet" value={w.creator} />
      <AddressText label="Coin type" value={w.coinType} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
export function CaseBoard() {
  const [state, setState] = useState<State>({ name: "loading" });
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ name: "loading" });
    try {
      const res = await fetch("/api/memory", { cache: "no-store", signal: AbortSignal.timeout(90_000) });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error("memory answer was not ok: " + res.status);
      setState({ name: "ready", data: body as Loaded });
    } catch (e) {
      console.error("[board] could not load the case file:", e);
      setState({ name: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.name === "loading")
    return (
      <div className="flex flex-col gap-6">
        <BoardHeading title="Reading the case file…" />
        <BoardSkeleton />
      </div>
    );
  if (state.name === "error")
    return (
      <div className="flex flex-col gap-6">
        <BoardHeading title="The case file" />
        <ErrorNotice message="We couldn't open the case file just now. This is usually temporary." onRetry={load} />
      </div>
    );

  const { rugs, watched, links, counters, notes } = state.data;
  const bySymbol = new Map<string, { rug?: BoardRug; watched?: BoardWatched }>();
  rugs.forEach((r) => bySymbol.set(r.symbol, { rug: r }));
  watched.forEach((w) => bySymbol.set(w.symbol, { watched: w }));
  const chain = chainOrder(links).filter((n) => bySymbol.has(n));
  const rest = rugs.filter((r) => !chain.includes(r.symbol)).sort((a, b) => (a.pulledAt ?? "").localeCompare(b.pulledAt ?? ""));
  const toggle = (k: string) => setOpen((cur) => (cur === k ? null : k));
  const openRest = rest.find((r) => r.symbol === open);

  const fact = factFromLinks(links);
  const chainLinks = chain.slice(0, -1).map((n, i) => links.find((l) => l.from === n && l.to === chain[i + 1])).filter((l): l is BoardLink => !!l);

  return (
    <div className="flex flex-col gap-10">
      <BoardHeading title={fact?.title ?? "The evidence board"} sub={fact?.sub} />

      {/* The linked cases */}
      <div className="flex flex-col lg:flex-row lg:items-start">
        {chain.map((name, i) => {
          const item = bySymbol.get(name)!;
          const fileNo = String(i + 1).padStart(2, "0");
          const next = chain[i + 1];
          const link = next ? links.find((l) => l.from === name && l.to === next) : undefined;
          return (
            <Fragment key={name}>
              <div className="mx-auto w-full max-w-xl min-w-0 lg:mx-0 lg:max-w-none lg:flex-1">
                <CaseCard face={item.rug ? rugFace(item.rug, fileNo) : watchedFace(item.watched!, fileNo)} open={open === name} onToggle={() => toggle(name)} delay={i * 250}>
                  {item.rug ? <RugEvidence rug={item.rug} links={links} /> : <WatchedEvidence w={item.watched!} links={links} />}
                </CaseCard>
              </div>
              {/* phone: the real relay chain runs down between the cards */}
              {link && (
                <div className="mx-auto my-3 w-full max-w-xl lg:hidden">
                  <RelayChain link={link} />
                </div>
              )}
              {/* desktop: a short line with moving dots here, the full chain just below the row */}
              {link && <RelayLine label={`${link.relayCount} relay wallets`} detail={`in ${fmtDuration(link.seconds)}`} />}
            </Fragment>
          );
        })}
      </div>

      {chainLinks.length > 0 && (
        <div className="hidden flex-col gap-4 lg:flex">
          {chainLinks.map((l) => (
            <RelayChain key={l.coinId} link={l} />
          ))}
        </div>
      )}

      {/* The other rugs: smaller cards, no lines */}
      {rest.length > 0 && (
        <section aria-label="Other rugs in memory">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warn">{rest.length} other confirmed rugs</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-dim">
            No exact SUI coin link has been found between these and any other case. Similar tactics alone do not show one person is behind them.
          </p>
          {/* A swipeable row on phones, five across on desktop */}
          <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0">
            {rest.map((r, i) => (
              <div key={r.symbol} className="w-[232px] shrink-0 snap-start lg:w-auto">
                <CaseCard small expandInside={false} face={rugFace(r, String(chain.length + i + 1).padStart(2, "0"))} open={open === r.symbol} onToggle={() => toggle(r.symbol)} delay={600 + i * 120} />
              </div>
            ))}
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim lg:hidden">Swipe sideways for more</p>
          <div className="grid transition-[grid-template-rows] duration-700 ease-in-out" style={{ gridTemplateRows: openRest ? "1fr" : "0fr" }}>
            <div className="overflow-hidden" inert={!openRest}>
              {openRest && (
                <div className="paper mt-3 rounded-lg border border-warn/40 p-4 pl-11 sm:p-5 sm:pl-12">
                  <h3 className="font-serif text-2xl text-text">{openRest.symbol}: the evidence</h3>
                  <div className="mt-3">
                    <RugEvidence rug={openRest} links={links} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Counters */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <Counter value={String(counters.rugsRemembered)} label="Rugs remembered" />
        <Counter value={counters.memoriesOnWalrus !== null ? String(counters.memoriesOnWalrus) : "?"} label="Memories on Walrus Mainnet" />
        <Counter value={String(counters.coinsChecked)} label="Coins checked" sub={counters.coinsScreened ? `of ${counters.coinsScreened} screened` : undefined} />
      </dl>
      {notes.length > 0 && <p className="-mt-6 text-xs text-dim">{notes.join(" ")}</p>}
    </div>
  );
}

// A fact built from the real link data. Nothing here is typed in by hand: counts and times come from the links.
function factFromLinks(links: BoardLink[]): { title: string; sub: string } | null {
  if (!links.length) return null;
  const coins = new Set(links.map((l) => l.coinId)).size;
  const tokens = new Set(links.flatMap((l) => [l.from, l.to])).size;
  const wallets = links.reduce((n, l) => n + l.relayCount, 0);
  const seconds = links.reduce((n, l) => n + l.seconds, 0);
  const days = [...new Set([...links].sort((a, b) => a.leftAt.localeCompare(b.leftAt)).map((l) => fmtDate(l.leftAt).slice(0, -5)))]; // "6 Nov", oldest first
  const under = seconds < 60 ? "a minute" : `${Math.floor(seconds / 60) + 1} minutes`;
  return {
    title: `${numberWord(coins)} SUI coin${coins === 1 ? "" : "s"}. ${numberWord(tokens)} tokens. ${wallets} relay wallets in under ${under}.`,
    sub:
      `The same SUI coins moved from one token's pull to the next token's creator. ` +
      (links.length > 1 ? `The time is added up across ${numberWord(links.length).toLowerCase()} separate relays, on ${days.join(" and ")}. ` : `It happened on ${days[0]}. `) +
      `Each card is a token Revenant remembers. Tap one to see the proof.`,
  };
}

function BoardHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warn">Open case · stored on Walrus</p>
      <h1 id="board-title" className="font-serif text-3xl leading-[1.08] text-text sm:text-5xl">
        {title}
      </h1>
      {sub && <p className="max-w-2xl text-base leading-7 text-dim">{sub}</p>}
    </div>
  );
}

function Counter({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="paper p-3 text-center sm:p-4" style={{ backgroundImage: "none" }}>
      <dd className="font-serif text-3xl text-text sm:text-4xl">{value}</dd>
      <dt className="mt-1 font-mono text-[10px] uppercase leading-4 tracking-widest text-dim">{label}</dt>
      {sub && <p className="mt-0.5 text-[11px] text-dim">{sub}</p>}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <p className="font-mono text-xs uppercase tracking-widest text-warn">Opening the case file…</p>
      <p className="text-sm text-dim">The first load can take a few seconds while Revenant reads its memory.</p>
      <div className="flex flex-col gap-4 lg:flex-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="paper h-48 flex-1 animate-pulse rounded-lg border border-line opacity-60" />
        ))}
      </div>
    </div>
  );
}
