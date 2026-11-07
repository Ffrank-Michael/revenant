"use client";

import { useState } from "react";
import { SearchBox } from "./SearchBox";

// The example coin used by the "Try BUBBLES" button.
const BUBBLES_COIN = "0x25607c967deeb5e22e48d275bd2af73eb147b57c67e679c8f42f6e925e767ee0::bubbles::BUBBLES";

export function SearchPanel() {
  const [coin, setCoin] = useState("");
  const [asked, setAsked] = useState<string | null>(null);

  return (
    <section aria-label="Check a coin" className="flex flex-col gap-4">
      <SearchBox value={coin} onChange={setCoin} onSubmit={(v) => setAsked(v)} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => {
            setCoin(BUBBLES_COIN);
            setAsked(null);
          }}
          className="rounded-full border border-warn/50 px-4 py-2 font-mono text-xs uppercase tracking-widest text-warn transition-colors hover:bg-warn hover:text-ink"
        >
          Try BUBBLES
        </button>
        <span className="text-sm text-dim">An example coin Revenant is watching right now.</span>
      </div>

      {/* Step 1 only: the check is not connected yet. */}
      {asked && (
        <p role="status" className="break-all border-l-2 border-warn pl-3 font-mono text-xs leading-5 text-dim">
          Step 1 preview. The check is not connected yet. You asked about:
          <span className="mt-1 block text-text">{asked}</span>
        </p>
      )}
    </section>
  );
}
