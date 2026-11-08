// The Revenant mark: a coin made of a ring of linked dots, with the middle dot joined to the top one.
export function LogoMark({ size = 24 }: { size?: number }) {
  const n = 8;
  const dots = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [12 + 8.5 * Math.cos(a), 12 + 8.5 * Math.sin(a)] as [number, number];
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="8.5" stroke="var(--warn)" strokeWidth="1.2" opacity="0.7" />
      <path d="M12 12L12 3.5" stroke="var(--warn)" strokeWidth="1.2" />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 0 ? 2.1 : 1.7} fill="var(--warn)" />
      ))}
      <circle cx="12" cy="12" r="2.6" fill="var(--warn)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={40} />
      <span className="font-mono text-xl font-bold uppercase tracking-[0.25em] text-warn sm:text-2xl sm:tracking-[0.3em]">Revenant</span>
    </span>
  );
}
