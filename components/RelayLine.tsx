// The line between two cards, with small dots drifting along it while money moves.
// Phone: vertical, with the sentence on a tag in the middle of the line.
// Desktop: horizontal, with the sentence above the line.

export function RelayLine({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center lg:mt-24 lg:w-[170px] lg:shrink-0 lg:self-start" role="img" aria-label={text}>
      {/* phone */}
      <div className="relative flex h-36 w-full items-center justify-center lg:hidden">
        <div className="flow-y relative h-full w-px bg-warn/50">
          {[0, 3, 6].map((d) => (
            <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
          ))}
          <span aria-hidden="true" className="absolute -bottom-px left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-warn/70" />
        </div>
        <p className="absolute max-w-[86%] rounded border border-line bg-ink px-3 py-2 text-center text-xs leading-5 text-warn">{text}</p>
      </div>

      {/* desktop */}
      <p className="mb-3 hidden text-center text-xs leading-5 text-warn lg:block">{text}</p>
      <div className="flow-x relative hidden h-px w-full bg-warn/50 lg:block">
        {[0, 3, 6].map((d) => (
          <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
        ))}
        <span aria-hidden="true" className="absolute -right-px top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-warn/70" />
      </div>
    </div>
  );
}
