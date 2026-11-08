// The line between two cards. Small dots drift along it to show money moving through the relay wallets.
// Phone: vertical, with the label on a tag in the middle of the line. Desktop: horizontal, label above.
// Only drawn for links proven by an exact SUI coin ID.

export function RelayLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center lg:mt-24 lg:w-[150px] lg:shrink-0 lg:self-start" role="img" aria-label={`${label}, ${detail}`}>
      {/* desktop label, above the line */}
      <p className="mb-3 hidden text-center font-mono text-[11px] leading-4 text-warn lg:block">
        {label}
        <span className="mt-1 block text-dim">{detail}</span>
      </p>

      {/* vertical line (phone) */}
      <div className="relative flex h-32 w-full items-center justify-center lg:hidden">
        <div className="flow-y relative h-full w-px bg-warn/50">
          {[0, 2, 4, 6].map((d) => (
            <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
          ))}
          <span aria-hidden="true" className="absolute -bottom-px left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-warn/70" />
        </div>
        <p className="absolute max-w-[78%] rounded border border-line bg-ink px-3 py-1.5 text-center font-mono text-[11px] leading-4 text-warn">
          {label}
          <span className="block text-dim">{detail}</span>
        </p>
      </div>

      {/* horizontal line (desktop) */}
      <div className="flow-x relative hidden h-px w-full bg-warn/50 lg:block">
        {[0, 2, 4, 6].map((d) => (
          <span key={d} className="flow-dot" style={{ animationDelay: `${d}s` }} />
        ))}
        <span aria-hidden="true" className="absolute -right-px top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-warn/70" />
      </div>
    </div>
  );
}
