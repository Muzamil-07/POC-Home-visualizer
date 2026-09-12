"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-white/8 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] text-[#efece6] hover:bg-white/5"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          className={`size-3.5 text-[#9aa0a6] transition-transform ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </section>
  );
}
