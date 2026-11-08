// The link between two cards: a ruled box with the sentence in label style, sitting on a line with
// small dots drifting along it while money moves.
// Phone: vertical line with the sentence on it. Desktop: a short horizontal arrow level with the middle of the cards;
// the sentence is shown in a full-width row under the three cards (see CaseBoard).

const BOX = "border border-line bg-ink px-2 py-2 text-center font-mono text-[11px] uppercase leading-4 tracking-[0.1em] text-warn";

export function RelayLine({ text }: { text: string }) {
  return (
    <div className="relative flex items-center justify-center lg:w-[64px] lg:shrink-0 lg:self-stretch" role="img" aria-label={text}>
      {/* phone */}
      <div className="relative flex h-40 w-full items-center justify-center lg:hidden">
        <div className="flow-y relative h-full w-px bg-warn/50">
          {[0, 3, 6].map((d) => (
            <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
          ))}
          <span aria-hidden="true" className="absolute -bottom-px left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-warn/70" />
        </div>
        <p className={`absolute max-w-[86%] ${BOX}`}>{text}</p>
      </div>

      {/* desktop */}
      <div className="flow-x absolute inset-x-0 top-1/2 hidden h-px bg-warn/50 lg:block">
        {[0, 3, 6].map((d) => (
          <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
        ))}
        <span aria-hidden="true" className="absolute -right-px top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-warn/70" />
      </div>
    </div>
  );
}
