"use client";

import { type ReactNode } from "react";

// Opens and closes smoothly (slowly, not flashy). Hidden content cannot be tabbed into while closed.
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} className="grid transition-[grid-template-rows] duration-700 ease-in-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}
