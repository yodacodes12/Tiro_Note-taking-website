import type { Theme } from "../types";
import { useBoardStore } from "../store/boardStore";
import TextObject from "./TextObject";
import ShapeObject from "./ShapeObject";

// Sticky notes are rendered separately by StickyLayer, outside this
// overflow-hidden surface, so they can spill over the board's edge.
export default function ObjectsLayer({ theme }: { theme: Theme }) {
  const objects = useBoardStore((s) => s.objects);
  const sorted = [...objects]
    .filter((o) => o.type === "text" || o.type === "shape")
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {sorted.map((obj) => {
        if (obj.type === "text") return <TextObject key={obj.id} obj={obj} theme={theme} />;
        if (obj.type === "shape") return <ShapeObject key={obj.id} obj={obj} theme={theme} />;
        return null;
      })}
    </div>
  );
}
