"use client";

import { useEffect, useState } from "react";

// A label, the FULL value in monospace, and a copy button. Used for wallets, digests and coin IDs.
export function AddressText({ label, value }: { label: string; value: string }) {
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
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-text">{value}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-dim transition-colors hover:border-warn hover:text-warn"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
