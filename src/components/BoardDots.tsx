import { useBoardStore } from "../store/boardStore";

// The current page is marked with a small faceted deep-purple gem — the
// same artwork as the browser-tab icon (public/gem.svg, favicon.svg).
function DiamondMarker() {
  return (
    <img
      src="/gem.svg"
      alt=""
      draggable={false}
      width={13}
      height={20}
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 4px rgba(124,58,237,0.45))" }}
    />
  );
}

// A GNOME-workspace-style indicator: one small dot per board page, with
// the current page marked by a cute 3D diamond instead of a plain dash.
// Click any marker to jump straight to that page.
export default function BoardDots() {
  const pages = useBoardStore((s) => s.pages);
  const currentPageIndex = useBoardStore((s) => s.currentPageIndex);
  const goToPage = useBoardStore((s) => s.goToPage);
  // The toolbar takes the top edge when positioned there, so the tracker
  // moves down to the bottom.
  const atBottom = useBoardStore((s) => s.toolbarPosition === "top");

  if (pages.length <= 1) return null;

  return (
    <div
      className={`absolute ${atBottom ? "bottom-5" : "top-5"} left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/15 px-3 py-2 shadow-lg`}
      style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(14px)" }}
    >
      {pages.map((p, i) =>
        i === currentPageIndex ? (
          <button
            key={p.id}
            title={`Board ${i + 1}`}
            onClick={() => goToPage(i)}
            className="flex h-5 w-[13px] items-center justify-center transition-transform hover:scale-110"
          >
            <DiamondMarker />
          </button>
        ) : (
          <button
            key={p.id}
            title={`Board ${i + 1}`}
            onClick={() => goToPage(i)}
            className="h-[7px] w-[7px] rounded-full transition-all duration-300 hover:bg-white/60"
            style={{ background: "rgba(255,255,255,0.35)" }}
          />
        )
      )}
    </div>
  );
}
