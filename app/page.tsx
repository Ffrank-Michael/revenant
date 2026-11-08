import { BoardProvider } from "@/components/BoardContext";
import { CaseBoard } from "@/components/CaseBoard";
import { ChainSummary } from "@/components/ChainSummary";
import { SearchPanel } from "@/components/SearchPanel";
import { Logo } from "@/components/Logo";

// One type scale for the whole page: heading, section title, body, small label.
// One spacing scale: 8, 16, 24, 40, 64 px.
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="flex items-center border-b border-line pb-4">
        <Logo />
      </header>

      <BoardProvider>
        <main className="flex flex-1 flex-col gap-4 pt-10 lg:gap-6">
          {/* 1. Two columns on desktop: heading, search and buttons on the left, the chain on the right */}
          <SearchPanel
            intro={
              <div className="flex flex-col gap-4">
                <h1 id="page-title" className="font-serif text-[2.5rem] leading-[1.1] text-balance text-text sm:text-4xl">
                  Check a Sui coin before you buy it
                </h1>
                <p className="max-w-[60ch] text-pretty text-base leading-7 text-dim">
                  Some people launch a coin, take all the money out, then use that money to launch the next one. Revenant remembers the ones it has caught and tells you
                  when a new coin is paid for by one of them.
                </p>
              </div>
            }
            side={<ChainSummary />}
          />

          {/* 2. A real example, the other rugs, then the counters */}
          <CaseBoard />
        </main>
      </BoardProvider>

      <footer className="mt-6 border-t border-line pt-4 text-xs leading-5 text-dim lg:mt-10">
        A link between wallets is a lead. It does not prove anyone did something wrong. History starts on 23 January 2026.
      </footer>
    </div>
  );
}
