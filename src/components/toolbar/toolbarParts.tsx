import type { ReactNode } from "react";

// Icons and buttons shared by the 2D toolbar and the 3D stationery toolbar.

export function HighlighterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}

export function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="9" width="14" height="8" rx="1.5" transform="rotate(-20 12 13)" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function MistifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 17a3.5 3.5 0 0 1-.5-6.96A4.5 4.5 0 0 1 14.2 8.1 4 4 0 0 1 17.5 15" />
      <path d="M17.5 15a3 3 0 0 1 0 6H7" />
      <path d="M7.5 20.5h0M11 20.5h0M14.5 20.5h0" strokeLinecap="round" />
    </svg>
  );
}

export function ClearBoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

export function ToolButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors ${
        active ? "bg-white/90 text-slate-800 shadow" : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}

