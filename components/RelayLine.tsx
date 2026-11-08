// Desktop only: the short line between two cards. Small dots drift along it while money moves.
// (On a phone the full relay chain sits between the cards instead; see RelayChain.)

export function RelayLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="hidden lg:mt-24 lg:flex lg:w-[130px] lg:shrink-0 lg:flex-col lg:items-center lg:self-start" role="img" aria-label={`${label}, ${detail}`}>
      <p className="mb-3 text-center font-mono text-[11px] leading-4 text-warn">
        {label}
        <span className="mt-1 block text-dim">{detail}</span>
      </p>
      <div className="flow-x relative h-px w-full bg-warn/50">
        {[0, 3, 6].map((d) => (
          <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
        ))}
        <span aria-hidden="true" className="absolute -right-px top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-warn/70" />
      </div>
    </div>
  );
}
