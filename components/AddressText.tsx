"use client";

import { useEffect, useState } from "react";

// A label, the FULL value on one line (it scrolls sideways if it is too long), and a copy button.
// Used for wallets, transaction IDs and coin IDs.
export function AddressText({ label, value, tx = false }: { label: string; value: string; tx?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers: select-and-copy fallback
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
  }

  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code tabIndex={0} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-line bg-ink/60 px-2 py-1.5 font-mono text-xs leading-5 text-text">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded border border-line px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-dim transition-colors hover:border-warn hover:text-warn"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {tx && (
          <a
            href={`https://suiscan.xyz/mainnet/tx/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap rounded border border-warn/50 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-warn transition-colors hover:bg-warn hover:text-ink"
          >
            Open on Suiscan
          </a>
        )}
      </div>
    </div>
  );
}
