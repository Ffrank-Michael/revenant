"use client";

// The coin search box. Look and motion are inspired by a 21st.dev prompt input:
// a small pill that springs open into a card, with a round send button.
// Everything else from that component (model picker, effort, uploads, voice) is intentionally left out.

import { useCallback, useEffect, useRef, useState } from "react";

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const MIN_TEXT_HEIGHT = 52;
const MAX_TEXT_HEIGHT = 140;
const BUTTON_ROW = 44; // room under the text for the send button

export function SearchBox({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Paste a token address on Sui",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [textHeight, setTextHeight] = useState(MIN_TEXT_HEIGHT);
  const area = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hasValue = value.trim() !== "";

  // Open whenever there is text (for example after "Try a rug we caught" fills it in).
  useEffect(() => {
    if (hasValue) setOpen(true);
  }, [hasValue]);

  // Move the cursor into the box when it opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = area.current;
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  // The box grows with the text (up to a limit), like the reference.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    const h = Math.max(MIN_TEXT_HEIGHT, Math.min(el.scrollHeight, MAX_TEXT_HEIGHT));
    el.style.height = `${h}px`;
    setTextHeight(h);
  }, [value, open]);

  const submit = useCallback(() => {
    if (!hasValue || disabled) return;
    onSubmit(value.trim());
  }, [hasValue, disabled, onSubmit, value]);

  return (
    <div
      ref={box}
      onBlur={(e) => {
        if (box.current?.contains(e.relatedTarget as Node)) return;
        if (!hasValue) setOpen(false);
      }}
      className="relative w-full"
      style={{ maxWidth: "100%" }}
    >
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-line bg-paper focus-within:border-warn/60"
        style={{ height: open ? textHeight + BUTTON_ROW : 52, transition: `height 0.4s ${SPRING}, border-color 0.2s` }}
      >
        {/* Closed: looks like a button. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the token search box"
          tabIndex={open ? -1 : 0}
          className="absolute inset-0 px-4 text-left font-mono text-sm text-dim"
          style={{ opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto", transition: "opacity 0.25s" }}
        >
          {placeholder}
        </button>

        {/* Open: the real input. */}
        <textarea
          ref={area}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && !hasValue) setOpen(false);
          }}
          placeholder={placeholder}
          aria-label="Token address on Sui"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={1}
          className="absolute inset-x-0 top-0 w-full resize-none bg-transparent px-4 py-[14px] font-mono text-base leading-6 text-text outline-none placeholder:text-dim sm:text-sm"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            overflowY: textHeight >= MAX_TEXT_HEIGHT ? "auto" : "hidden",
            transition: "opacity 0.3s",
          }}
        />

        {/* Send button */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          disabled={!hasValue || disabled}
          aria-label="Check this token"
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-warn text-ink transition-all duration-300 disabled:bg-line disabled:text-dim"
          style={{ opacity: open ? 1 : 0, transform: open ? "scale(1)" : "scale(0.6)", pointerEvents: open ? "auto" : "none", transitionTimingFunction: SPRING }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
