"use client";

import { WarnedClock } from "./WarnedClock";

// One card: the name and stamp, one sentence, a ruled grid of facts, and the button at the bottom.
// All the detail lives in the proof panel.

export type CardCell = { label: string; value: string };
export type CardFace = {
  name: string;
  status: { label: string; tone: "alert" | "plain" };
  sentence: string; // the one sentence at the top
  facts: CardCell[]; // the small cells (two per row)
  wide: CardCell[]; // full-width cells under them
  clock?: { warnedAt: string; pulledAt: string | null } | null; // our warning, as a full-width cell
};

export const LABEL = "font-mono text-[11px] uppercase tracking-[0.2em] text-dim";
const CELL_LABEL = "font-mono text-[11px] uppercase tracking-[0.1em] text-dim";

export function CaseCard({ face, open, onToggle, delay = 0, controls }: { face: CardFace; open: boolean; onToggle: () => void; delay?: number; controls?: string }) {
  const alert = face.status.tone === "alert";
  // Extra height goes to the last row only, so the rows line up from card to card.
  const rows = Math.ceil(face.facts.length / 2) + face.wide.length + (face.clock ? 1 : 0);
  return (
    <article
      className={`card-in paper relative flex min-w-0 flex-1 flex-col gap-4 rounded-lg border p-4 pl-10 transition-colors duration-500 sm:pl-12 lg:p-3 lg:pl-9 ${open ? "border-warn/60" : "border-line"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-col items-start gap-2">
        <h3 className="font-serif text-2xl leading-none text-text">{face.name}</h3>
        <span className="stamp text-[10px]" style={{ ["--tilt" as string]: alert ? "-3deg" : "2deg", color: alert ? "var(--warn)" : "var(--text)" }}>
          {face.status.label}
        </span>
      </div>

      <p className="font-serif text-base leading-6 text-text">{face.sentence}</p>

      {/* The ruled grid. It grows to fill the card, so there is no gap above the button. */}
      <div className="grid flex-1 grid-cols-2 gap-px border border-line bg-line" style={{ gridTemplateRows: `repeat(${rows - 1}, auto) 1fr` }}>
        {face.facts.map((c) => (
          <Cell key={c.label} cell={c} />
        ))}
        {face.wide.map((c) => (
          <Cell key={c.label} cell={c} wide />
        ))}
        {face.clock && (
          <div className="col-span-2 bg-ink p-2">
            <p className={CELL_LABEL}>Our warning</p>
            <WarnedClock warnedAt={face.clock.warnedAt} pulledAt={face.clock.pulledAt} className="mt-1 font-serif text-base leading-6 text-warn" />
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={controls}
          className="whitespace-nowrap rounded-full border border-warn/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-warn transition-colors hover:bg-warn hover:text-ink"
        >
          {open ? "Hide the proof" : "See the proof"}
        </button>
      </div>
    </article>
  );
}

function Cell({ cell, wide = false }: { cell: CardCell; wide?: boolean }) {
  return (
    <div className={`min-w-0 bg-ink p-2 ${wide ? "col-span-2" : ""}`}>
      <p className={CELL_LABEL}>{cell.label}</p>
      <p className={`mt-1 text-base leading-6 text-text ${wide ? "font-serif" : "font-mono"}`}>{cell.value}</p>
    </div>
  );
}
