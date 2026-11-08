"use client";

// A plain-words problem message. Only ever shows text written for people, never a raw error.
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-warn/40 bg-paper p-4 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-warn">{onRetry ? "Couldn't finish" : "Check the coin address"}</p>
      <p className="mt-2 text-base leading-7 text-text">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full bg-warn px-5 py-2 font-mono text-xs font-bold uppercase tracking-widest text-ink transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
