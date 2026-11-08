import { CaseBoard } from "@/components/CaseBoard";
import { SearchPanel } from "@/components/SearchPanel";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <span className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-text">Revenant</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-dim">Case file · Sui</span>
      </header>

      <main className="flex flex-1 flex-col gap-16 pt-8 sm:pt-12">
        {/* The hero: what Revenant remembers */}
        <section aria-labelledby="board-title" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warn">Open case · stored on Walrus</p>
            <h1 id="board-title" className="font-serif text-4xl leading-[1.05] text-text sm:text-6xl">
              The evidence board
            </h1>
            <p className="max-w-2xl text-base leading-7 text-dim">
              The same SUI coins moved from one rug to the next. Each card is a coin Revenant remembers. Tap a card to see the proof.
            </p>
          </div>
          <CaseBoard />
        </section>

        {/* Check a coin of your own */}
        <section aria-labelledby="check-title" className="flex max-w-2xl flex-col gap-6 border-t border-line pt-10">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warn">File open · new coin</p>
            <h2 id="check-title" className="font-serif text-3xl leading-[1.1] text-text sm:text-4xl">
              Who really funded this coin?
            </h2>
            <p className="text-base leading-7 text-dim">
              Paste a new Sui coin. Revenant follows the creator&apos;s first money back a few steps, then checks whether that money is linked to rugs it already
              remembers.
            </p>
          </div>
          <SearchPanel />
        </section>
      </main>

      <footer className="mt-16 border-t border-line pt-4 text-xs leading-5 text-dim">
        A link between wallets is a lead, not proof that anyone did something wrong. History on this service starts around 23 January 2026.
      </footer>
    </div>
  );
}
