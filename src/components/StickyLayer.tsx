import { useEffect, useRef, useState } from "react";
import type { StickyNoteData } from "../types";
import { useBoardStore } from "../store/boardStore";
import StickyNote from "./StickyNote";
import StickyNotePad from "./StickyNotePad";

/**
 * Sticky notes render in their own unclipped layer, stacked on top of the
 * (overflow-hidden) glass/mist surface and its metal frame. That way a note
 * dragged to an edge keeps its full silhouette and visibly overlaps the
 * board's border, instead of being clipped away like ink/shapes/text are.
 * This layer shares the exact same box (inset + padding) as the writable
 * surface beneath it, so a note's stored x/y stays valid in both.
 */
export default function StickyLayer() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const objects = useBoardStore((s) => s.objects);
  const stickies = objects
    .filter((o): o is StickyNoteData => o.type === "sticky")
    .sort((a, b) => a.zIndex - b.zIndex);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const update = () => setBounds({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="pointer-events-none absolute inset-4 p-[9px] md:inset-8">
      <div ref={layerRef} className="relative h-full w-full">
        {stickies.map((obj) => (
          <StickyNote key={obj.id} obj={obj} bounds={bounds} />
        ))}
        <div data-export-exclude>
          <StickyNotePad boardRef={layerRef} />
        </div>
      </div>
    </div>
  );
}
