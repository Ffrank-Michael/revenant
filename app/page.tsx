import { CaseBoard } from "@/components/CaseBoard";
import { SearchPanel } from "@/components/SearchPanel";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="flex items-center border-b border-line pb-4">
        <span className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-text">Revenant</span>
      </header>

      <main className="flex flex-1 flex-col gap-16 pt-10 sm:pt-14">
        {/* 1. Heading, subtext and the search box */}
        <section aria-labelledby="page-title" className="flex max-w-2xl flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h1 id="page-title" className="font-serif text-4xl leading-[1.05] text-text sm:text-6xl">
              Check a Sui coin before you buy it
            </h1>
            <p className="text-base leading-7 text-dim sm:text-lg sm:leading-8">
              Some people launch a coin, take all the money out, then use that money to launch the next one. Revenant remembers the ones it has caught and tells you
              when a new coin is paid for by one of them.
            </p>
          </div>
          <SearchPanel />
        </section>

        {/* 2. A real example, then the counters */}
        <CaseBoard />
      </main>

      <footer className="mt-16 border-t border-line pt-4 text-xs leading-5 text-dim">
        A link between wallets is a lead. It does not prove anyone did something wrong. History starts on 23 January 2026.
      </footer>
    </div>
  );
}
