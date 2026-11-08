"use client";

import { WarnedClock } from "./WarnedClock";

// One card says one thing a stranger can repeat. All the detail lives in the proof panel.

export type CardFace = {
  name: string;
  status: { label: string; tone: "alert" | "plain" };
  sentence: string; // the main sentence, large
  linkLine?: string | null; // one line about where the money went (or came from)
  clock?: { warnedAt: string; pulledAt: string | null } | null; // live count from our warning
};

export function CaseCard({
  face,
  open,
  onToggle,
  small = false,
  delay = 0,
  controls,
}: {
  face: CardFace;
  open: boolean;
  onToggle: () => void;
  small?: boolean;
  delay?: number;
  controls?: string;
}) {
  const alert = face.status.tone === "alert";
  return (
    <article
      className={`card-in paper relative flex min-w-0 flex-col rounded-lg border transition-colors duration-500 ${open ? "border-warn/60" : "border-line"} ${
        small ? "p-3 pl-9" : "p-4 pl-11 sm:p-5 sm:pl-12 lg:p-4 lg:pl-10"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className={`font-serif leading-none text-text ${small ? "text-2xl" : "text-4xl lg:text-3xl"}`}>{face.name}</h3>
      <span
        className="stamp mt-3 self-start text-[10px]"
        style={{ ["--tilt" as string]: alert ? "-3deg" : "2deg", color: alert ? "var(--warn)" : "var(--text)" }}
      >
        {face.status.label}
      </span>

      <p className={`mt-4 font-serif leading-snug text-text ${small ? "text-base" : "text-xl lg:text-lg"}`}>{face.sentence}</p>
      {face.linkLine && <p className="mt-3 text-sm leading-6 text-dim">{face.linkLine}</p>}
      {face.clock && <WarnedClock warnedAt={face.clock.warnedAt} pulledAt={face.clock.pulledAt} />}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        className="mt-5 self-start whitespace-nowrap rounded-full border border-warn/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-warn transition-colors hover:bg-warn hover:text-ink"
      >
        {open ? "Hide the proof" : "See the proof"}
      </button>
    </article>
  );
}
