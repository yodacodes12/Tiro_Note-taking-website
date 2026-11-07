import { motion } from "framer-motion";
import type { StickyNoteData } from "../types";
import { useBoardStore } from "../store/boardStore";
import SelectableBox from "./SelectableBox";

// Fast, gravity-like fall: a short "release" beat where a rotated note
// snaps back upright (and the pin pops off), then the note drops straight
// down quickly with no further rotation or sideways drift.
const FALL_DURATION = 1.3; // seconds, total
const STRAIGHTEN_FRACTION = 0.22; // release beat ends here, then it's a straight drop
const RELEASE_LIFT = 10; // tiny upward pop as the pin releases

interface Props {
  obj: StickyNoteData;
  bounds: { width: number; height: number };
}

export default function StickyNote({ obj, bounds }: Props) {
  const tool = useBoardStore((s) => s.tool);
  const selectedId = useBoardStore((s) => s.selectedId);
  const fallingStickyId = useBoardStore((s) => s.fallingStickyId);
  const setSelected = useBoardStore((s) => s.setSelected);
  const updateObject = useBoardStore((s) => s.updateObject);
  const commit = useBoardStore((s) => s.commit);
  const finishStickyFall = useBoardStore((s) => s.finishStickyFall);

  const falling = fallingStickyId === obj.id;
  const interactive = tool === "select" && !falling;
  const selected = selectedId === obj.id && !falling;

  // Fall well past the bottom of the actual browser viewport, not just
  // past the board's own edge, regardless of where on the board the note
  // started.
  const fallDistance = (typeof window !== "undefined" ? window.innerHeight : 1000) + 300;

  // The pin — not the whole sheet of paper — is what's actually fixed to
  // the board. It sits horizontally centered at the note's top edge, so
  // only that point is clamped to stay inside the board while dragging;
  // the paper itself is free to hang off the edge around it.
  const handleChange = (patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => {
    if ((patch.x === undefined && patch.y === undefined) || bounds.width === 0) {
      updateObject(obj.id, patch);
      return;
    }
    const width = patch.width ?? obj.width;
    let x = patch.x ?? obj.x;
    let y = patch.y ?? obj.y;
    const pinX = x + width / 2;
    const pinY = y;
    const clampedPinX = Math.min(Math.max(pinX, 0), bounds.width);
    const clampedPinY = Math.min(Math.max(pinY, 0), bounds.height);
    x += clampedPinX - pinX;
    y += clampedPinY - pinY;
    updateObject(obj.id, { ...patch, x, y });
  };

  return (
    <SelectableBox
      x={obj.x}
      y={obj.y}
      width={obj.width}
      height={obj.height}
      rotation={falling ? 0 : obj.rotation}
      selected={selected}
      interactive={interactive}
      minWidth={80}
      minHeight={80}
      onSelect={() => setSelected(obj.id)}
      onChange={handleChange}
      onCommit={commit}
    >
      <motion.div
        key={falling ? "falling" : "idle"}
        initial={falling ? { scale: 1, y: 0, rotate: obj.rotation } : { scale: 0.92, y: -6 }}
        animate={
          falling
            ? {
                // Shared keyframe timing for both properties — splitting
                // y and rotate into separate per-key transition objects
                // silently breaks duration/completion timing in this
                // Motion version, so both ride one flat transition instead.
                // The ancestor SelectableBox wrapper drops its static tilt
                // the moment falling starts (rotation=0 above), so this
                // element carries 100% of the rotation itself — starting
                // at obj.rotation (to avoid a visual jump) and animating
                // to 0. That keeps the whole rotate+translate chain on a
                // single element: once rotate settles at 0 (end of phase
                // 1) the frame is screen-aligned, so the big fall in
                // phase 2 is genuinely vertical with no diagonal skew —
                // splitting the rotation across parent+child (the
                // previous approach) composed non-commutatively with the
                // translate and made the note drift sideways as it fell.
                // Phase 1 (release, 0 -> STRAIGHTEN_FRACTION): rotation
                // snaps back to upright and the note pops up slightly —
                // it stays essentially in place, no sideways drift.
                // Phase 2 (drop, STRAIGHTEN_FRACTION -> 1): already
                // upright, falls straight down fast, accelerating.
                y: [0, -RELEASE_LIFT, fallDistance],
                rotate: [obj.rotation, 0, 0],
              }
            : { scale: 1, y: 0 }
        }
        transition={
          falling
            ? {
                type: "tween",
                duration: FALL_DURATION,
                times: [0, STRAIGHTEN_FRACTION, 1],
                ease: ["easeOut", "easeIn"],
              }
            : { type: "spring", stiffness: 420, damping: 18 }
        }
        onAnimationComplete={() => {
          if (falling) finishStickyFall(obj.id);
        }}
        className="relative h-full w-full p-3"
        style={{
          backgroundColor: obj.color,
          boxShadow: "0 10px 18px -6px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.2)",
          borderRadius: "2px 2px 6px 6px",
          pointerEvents: falling ? "none" : undefined,
        }}
      >
        {/* pushpin: pops off and vanishes right as the note is released */}
        <motion.div
          className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full"
          animate={falling ? { y: [0, -14, -26], opacity: [1, 1, 0] } : { y: 0, opacity: 1 }}
          transition={
            falling
              ? { duration: FALL_DURATION * STRAIGHTEN_FRACTION, times: [0, 0.4, 1], ease: "easeOut" }
              : undefined
          }
          style={{
            background: "radial-gradient(circle at 35% 30%, #ff8a8a, #b91c1c 70%)",
            boxShadow: "0 2px 3px rgba(0,0,0,0.5)",
          }}
        />
        <div
          contentEditable={selected && interactive}
          suppressContentEditableWarning
          className="h-full w-full overflow-hidden text-sm leading-snug text-neutral-800 outline-none"
          style={{ fontFamily: "'Segoe Print', 'Comic Sans MS', cursive", wordBreak: "break-word" }}
          onPointerDown={(e) => {
            if (selected && interactive) e.stopPropagation();
          }}
          onBlur={(e) => {
            updateObject(obj.id, { text: e.currentTarget.textContent ?? "" });
            commit();
          }}
        >
          {obj.text}
        </div>
      </motion.div>
    </SelectableBox>
  );
}
