import { useBoardStore } from "../store/boardStore";

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

// Fixed arrows pinned to either edge of the screen so the user can step
// between boards without reaching for the dot/diamond tracker up top.
export default function BoardEdgeNav() {
  const pages = useBoardStore((s) => s.pages);
  const currentPageIndex = useBoardStore((s) => s.currentPageIndex);
  const goToPage = useBoardStore((s) => s.goToPage);
  // A toolbar on the left/right edge would sit right on top of that side's
  // arrow, so the arrow steps inward past it.
  const toolbarPosition = useBoardStore((s) => s.toolbarPosition);
  const toolbarStyle = useBoardStore((s) => s.toolbarStyle);
  const inset = (edge: "left" | "right") =>
    toolbarPosition === edge ? (toolbarStyle === "3d" ? 150 : 96) : 16;

  if (pages.length <= 1) return null;

  const hasPrev = currentPageIndex > 0;
  const hasNext = currentPageIndex < pages.length - 1;

  const btnClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/80 shadow-lg transition-all hover:scale-105 hover:bg-white/15 hover:text-white disabled:opacity-0 disabled:pointer-events-none";

  return (
    <>
      <button
        title="Previous board"
        disabled={!hasPrev}
        onClick={() => goToPage(currentPageIndex - 1)}
        style={{ left: inset("left"), background: "rgba(255,255,255,0.08)", backdropFilter: "blur(14px)" }}
        className={`absolute top-1/2 z-30 -translate-y-1/2 ${btnClass}`}
      >
        <ChevronIcon dir="left" />
      </button>
      <button
        title="Next board"
        disabled={!hasNext}
        onClick={() => goToPage(currentPageIndex + 1)}
        style={{ right: inset("right"), background: "rgba(255,255,255,0.08)", backdropFilter: "blur(14px)" }}
        className={`absolute top-1/2 z-30 -translate-y-1/2 ${btnClass}`}
      >
        <ChevronIcon dir="right" />
      </button>
    </>
  );
}
