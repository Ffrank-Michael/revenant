"use client";

import { useId, type ReactNode } from "react";

// One case-file card. The face is always visible; the evidence opens smoothly below it when tapped.

export type CardFace = {
  fileNo: string;
  name: string;
  published: string; // "7 Nov 2026"
  pulled: string | null; // "7 Nov 2026"
  putIn: string | null;
  pulledOut: string | null;
  stamp: { text: string; tone: "alert" | "plain" };
  statusLine: string; // plain words under the stamp
  extra?: { label: string; value: string } | null; // e.g. "SUI still in the pool"
  warnedStamp?: string | null; // the BUBBLES "warned before any pull" stamp
};

export function CaseCard({
  face,
  open,
  onToggle,
  children,
  small = false,
  delay = 0,
  expandInside = true,
}: {
  face: CardFace;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode; // the evidence
  small?: boolean;
  delay?: number;
  expandInside?: boolean;
}) {
  const id = useId();
  return (
    <article className={`card-in paper relative min-w-0 rounded-lg border ${open ? "border-warn/60" : "border-line"} transition-colors duration-500`} style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={expandInside ? id : undefined}
        className={`block w-full text-left ${small ? "p-3 pl-9" : "p-4 pl-11 sm:p-5 sm:pl-12"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-dim">File {face.fileNo}</span>
          <span className="stamp text-[10px]" style={{ ["--tilt" as string]: face.stamp.tone === "alert" ? "3deg" : "-2deg", color: face.stamp.tone === "alert" ? "var(--warn)" : "var(--text)" }}>
            {face.stamp.text}
          </span>
        </div>

        <h3 className={`mt-2 font-serif leading-none text-text ${small ? "text-2xl" : "text-4xl"}`}>{face.name}</h3>
        <p className={`mt-2 text-dim ${small ? "text-xs" : "text-sm"}`}>{face.statusLine}</p>

        <dl className={`mt-3 grid gap-x-3 gap-y-2 ${small ? "grid-cols-2 text-xs" : "grid-cols-2 text-sm"}`}>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-widest text-dim">Published</dt>
            <dd className="text-text">{face.published}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-widest text-dim">Pulled</dt>
            <dd className="text-text">{face.pulled ?? "Not yet"}</dd>
          </div>
          {face.putIn && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-dim">Put in</dt>
              <dd className="whitespace-nowrap font-mono text-text">{face.putIn}</dd>
            </div>
          )}
          {face.pulledOut && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-dim">Pulled out</dt>
              <dd className="whitespace-nowrap font-mono text-warn">{face.pulledOut}</dd>
            </div>
          )}
          {face.extra && (
            <div className="col-span-2">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-dim">{face.extra.label}</dt>
              <dd className="font-mono text-text">{face.extra.value}</dd>
            </div>
          )}
        </dl>

        {face.warnedStamp && (
          <p className="stamp mt-4 text-[10px] text-warn" style={{ ["--tilt" as string]: "-2.5deg", animationDelay: `${delay + 500}ms` }}>
            {face.warnedStamp}
          </p>
        )}

        <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span aria-hidden="true" className={`inline-block transition-transform duration-500 ${open ? "rotate-90" : ""}`}>
            &#9656;
          </span>
          {open ? "Hide the evidence" : "Tap for the evidence"}
        </p>
      </button>

      {expandInside && (
        <div id={id} className="grid transition-[grid-template-rows] duration-700 ease-in-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
          <div className="overflow-hidden" inert={!open}>
            <div className={`border-t border-line ${small ? "p-3 pl-9" : "p-4 pl-11 sm:p-5 sm:pl-12"}`}>{children}</div>
          </div>
        </div>
      )}
    </article>
  );
}
