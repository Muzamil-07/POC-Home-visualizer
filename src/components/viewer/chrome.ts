export function toolbarToggleClass(active: boolean) {
  return `inline-flex min-h-9 items-center gap-1.5 rounded px-2.5 text-[12px] tracking-wide transition-colors ${
    active
      ? "bg-[#efece6] text-[#16181c]"
      : "text-[#c8c4bc] hover:bg-white/10 hover:text-[#efece6]"
  }`;
}

export function accentButtonClass(disabled = false) {
  return `inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-[12px] font-medium tracking-wide transition-colors ${
    disabled
      ? "cursor-not-allowed bg-[#c45c4a]/35 text-[#efece6]/50"
      : "bg-[#c45c4a] text-[#efece6] hover:bg-[#d46b58]"
  }`;
}

export function panelClassName() {
  return "bg-[#16181c] text-[#efece6]";
}

export function fieldClassName() {
  return "w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[12px] text-[#efece6] outline-none focus:border-white/25";
}

export function iconButtonClass(disabled = false) {
  return `inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[#c8c4bc] transition-colors ${
    disabled
      ? "cursor-not-allowed opacity-35"
      : "hover:bg-white/10 hover:text-[#efece6]"
  }`;
}

export function sectionLabelClass() {
  return "text-[11px] font-medium text-[#9aa0a6]";
}
