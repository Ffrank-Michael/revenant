"use client";

import { useState, type ReactNode } from "react";
import { AddressText } from "./AddressText";
import { fmtDateTime, fmtSui } from "@/lib/format";
import type { TraceWithMemory } from "@/lib/rugs";
import type { Trail as TrailData, TrailWallet } from "@/lib/trace";

// "Where the creator's money came from": a vertical list, newest first.
// Everything shown comes from the trace. Nothing is guessed.

type Row =
  | { kind: "wallet"; w: TrailWallet; sent: { amountSui: number; at: string; digest: string } | null; isFirst: boolean }
  | { kind: "run"; wallets: { w: TrailWallet; sent: { amountSui: number; at: string; digest: string } | null }[] };

const norm = (a: string) => a.toLowerCase();

const ROLE_TEXT: Record<string, (rug: string) => string> = {
  "received the profits of": (r) => `This wallet received the profits of the ${r} rug pull.`,
  created: (r) => `This wallet created ${r}, a coin that was rug pulled.`,
  "held the mint key of": (r) => `This wallet controlled ${r}, a coin that was rug pulled.`,
  "passed money along for": (r) => `This wallet passed money along for the ${r} rug pull.`,
  funded: (r) => `This wallet paid for ${r}, a coin that was rug pulled.`,
};

// "about 8 seconds", "about 3 minutes"
function about(sec: number): string {
  if (sec < 90) return `about ${Math.max(1, Math.round(sec))} second${Math.round(sec) === 1 ? "" : "s"}`;
  const m = Math.round(sec / 60);
  if (m < 90) return `about ${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `about ${h} hour${h === 1 ? "" : "s"}`;
}

function stopText(t: TrailData, count: number): string {
  const last = t.wallets[t.wallets.length - 1];
  switch (t.stoppedBecause.code) {
    case "exchange":
      return `We stopped here because this wallet belongs to ${last?.exchange ?? "an exchange"}. Exchanges do not tell us who is behind the money.`;
    case "busy_wallet":
      return "We stopped here because this wallet is very busy, like an exchange. This does not tell us who is behind the money.";
    case "relay_cap":
      return `We stopped here because the money went through at least ${count} pass-through wallets, which is as far as we follow.`;
    case "max_hops_reached":
      return `We stopped here because the trail reached the limit of ${t.wallets.filter((w) => !w.isRelay && w.hop !== 0).length} wallets before the creator.`;
    case "no_earlier_funding":
      return "We stopped here because this wallet has no earlier money in.";
    case "history_limit":
      return "We stopped here because this is the start of the history we can read. The money may have come from further back.";
    case "cycle":
      return "We stopped here because the money came back to a wallet already on this list.";
    default:
      return "We stopped here because we could not look any further back.";
  }
}

export function Trail({ data, controller = false, title = "Where the creator's money came from" }: { data: TraceWithMemory; controller?: boolean; title?: string }) {
  const trail = controller ? data.controllerTrail : data.trail;
  if (!trail || trail.wallets.length === 0) return null;

  // Rug links by wallet.
  const linkOf = new Map<string, { symbol: string; role: string }[]>();
  for (const m of data.rugMatches) {
    const where = controller ? "controller trail" : "creator trail";
    if (m.foundIn !== where) continue;
    const list = linkOf.get(norm(m.address)) ?? [];
    for (const p of m.pastRugs) list.push({ symbol: p.symbol ?? "an earlier coin", role: p.roleInThatRug });
    linkOf.set(norm(m.address), list);
  }
  const coinLinks = data.coinObjectMatches.filter((c) => (controller ? c.heldBy !== "creator" : c.heldBy === "creator"));

  // What each wallet sent: the money that arrived at the wallet before it in the list.
  const sentBy = (i: number) => {
    const prev = trail.wallets[i - 1];
    const f = prev?.firstFunding;
    return f && norm(f.from) === norm(trail.wallets[i].address) ? { amountSui: f.amountSui, at: f.at, digest: f.digest } : null;
  };

  // Group runs of pass-through wallets (two or more in a row) into one row.
  const rows: Row[] = [];
  for (let i = 0; i < trail.wallets.length; i++) {
    const w = trail.wallets[i];
    if (i > 0 && w.isRelay) {
      let j = i;
      while (j < trail.wallets.length && trail.wallets[j].isRelay) j++;
      if (j - i >= 2) {
        rows.push({ kind: "run", wallets: trail.wallets.slice(i, j).map((x, k) => ({ w: x, sent: sentBy(i + k) })) });
        i = j - 1;
        continue;
      }
    }
    rows.push({ kind: "wallet", w, sent: i > 0 ? sentBy(i) : null, isFirst: i === 0 });
  }

  const relayTotal = trail.wallets.filter((w) => w.isRelay).length;

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-warn">{title}</p>
      <ol className="mt-4 flex flex-col">
        {rows.map((r, i) => (
          <li key={i} className="relative pb-6 pl-6 last:pb-0">
            <span aria-hidden="true" className="absolute left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-warn" />
            {i < rows.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[9px] top-6 w-px bg-line" />}
            {r.kind === "wallet" ? (
              <WalletRow row={r} links={linkOf.get(norm(r.w.address)) ?? []} coinLinks={r.isFirst ? coinLinks : []} data={data} controller={controller} />
            ) : (
              <RunRow row={r} linkOf={linkOf} />
            )}
          </li>
        ))}
        <li className="relative pl-6">
          <span aria-hidden="true" className="absolute left-[3px] top-2 h-3.5 w-3.5 rounded-sm border border-dim bg-ink" />
          <p className="text-base leading-7 text-dim">{stopText(trail, relayTotal)}</p>
        </li>
      </ol>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded border border-warn/60 px-2 py-1 font-mono text-[11px] leading-4 text-warn">{children}</span>;
}

function SentLine({ sent }: { sent: { amountSui: number; at: string; digest: string } | null }) {
  if (!sent) return null;
  return (
    <p className="text-base leading-7 text-text">
      Sent {fmtSui(sent.amountSui)} on {fmtDateTime(sent.at)}.{" "}
      <a
        href={`https://suiscan.xyz/mainnet/tx/${sent.digest}`}
        target="_blank"
        rel="noopener noreferrer"
        className="whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-warn underline underline-offset-4"
      >
        See the transfer
      </a>
    </p>
  );
}

function LinkTags({ links }: { links: { symbol: string; role: string }[] }) {
  const bySymbol = new Map<string, string>();
  for (const l of links) if (!bySymbol.has(l.symbol)) bySymbol.set(l.symbol, l.role);
  return (
    <>
      {[...bySymbol.entries()].map(([symbol, role]) => (
        <div key={symbol} className="flex flex-col items-start gap-1">
          <Tag>Linked to the {symbol} rug pull</Tag>
          <p className="text-sm leading-6 text-dim">{(ROLE_TEXT[role] ?? (() => `This wallet is linked to the ${symbol} rug pull.`))(symbol)}</p>
        </div>
      ))}
    </>
  );
}

function WalletRow({
  row,
  links,
  coinLinks,
  data,
  controller,
}: {
  row: Extract<Row, { kind: "wallet" }>;
  links: { symbol: string; role: string }[];
  coinLinks: TraceWithMemory["coinObjectMatches"];
  data: TraceWithMemory;
  controller: boolean;
}) {
  const { w, sent, isFirst } = row;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {isFirst ? (
        <p className="text-base leading-7 text-text">
          {controller ? "Controls the coin. This wallet was given the coin's control key." : `Created the coin on ${fmtDateTime(data.creator.publishedAt)}.`}
        </p>
      ) : w.isRelay ? (
        <p className="text-base leading-7 text-text">Passed the same money along.</p>
      ) : null}
      <SentLine sent={sent} />
      <AddressText label={isFirst ? (controller ? "Controller wallet" : "Creator wallet") : "Wallet"} value={w.address} account wrap />
      {coinLinks.map((c) => (
        <div key={c.objectId} className="flex flex-col items-start gap-1">
          <Tag>Holds a SUI coin from the {c.pastRug.symbol ?? "earlier"} rug pull</Tag>
          <p className="text-sm leading-6 text-dim">
            The same SUI coin, with the same ID, came out of that pull and is in this wallet now. That shows the money moved. This does not show who is behind the wallets.
          </p>
        </div>
      ))}
      <LinkTags links={links} />
    </div>
  );
}

function RunRow({ row, linkOf }: { row: Extract<Row, { kind: "run" }>; linkOf: Map<string, { symbol: string; role: string }[]> }) {
  const [open, setOpen] = useState(false);
  const n = row.wallets.length;
  const times = row.wallets.map((x) => (x.sent ? Date.parse(x.sent.at) : NaN)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000);
  const avgGap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;
  const amounts = row.wallets.map((x) => x.sent?.amountSui).filter((x): x is number => typeof x === "number");
  const linked = new Set<string>();
  for (const x of row.wallets) for (const l of linkOf.get(norm(x.w.address)) ?? []) linked.add(l.symbol);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 rounded-lg border border-line bg-ink/40 px-3 py-3 text-left transition-colors hover:border-warn/60"
      >
        <span className="text-base leading-7 text-text">
          {n} wallets passed the same money along{avgGap !== null ? `, ${about(avgGap)} apart` : ""}.
          {amounts.length > 0 && <span className="block text-sm text-dim">About {fmtSui(amounts[0])} went through.</span>}
        </span>
        <span className="mt-1 shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-warn">{open ? "Hide" : "Show all"}</span>
      </button>
      {linked.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...linked].map((s) => (
            <Tag key={s}>Some are linked to the {s} rug pull</Tag>
          ))}
        </div>
      )}
      {open && (
        <ol className="flex flex-col gap-4 border-l border-line pl-3">
          {row.wallets.map(({ w, sent }, i) => (
            <li key={w.address + i} className="flex min-w-0 flex-col gap-2">
              <SentLine sent={sent} />
              <AddressText label={`Wallet ${i + 1} of ${n}`} value={w.address} account wrap />
              <LinkTags links={linkOf.get(norm(w.address)) ?? []} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
