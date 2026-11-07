import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { STICKY_COLORS } from "../types";
import { useBoardStore, createId } from "../store/boardStore";
import { playStickyTear } from "../lib/sounds";

const NOTE_SIZE = 96;
const PAD_SIZE = 108;

export default function StickyNotePad({ boardRef }: { boardRef: React.RefObject<HTMLDivElement | null> }) {
  const addObject = useBoardStore((s) => s.addObject);
  const commit = useBoardStore((s) => s.commit);
  const setSelected = useBoardStore((s) => s.setSelected);
  const nextZIndex = useBoardStore((s) => s.nextZIndex);

  const [dragging, setDragging] = useState(false);
  const [sheets, setSheets] = useState(5);
  const [nextColor, setNextColor] = useState(
    () => STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
  );
  const colorRef = useRef(nextColor);
  const rotRef = useRef(0);

  const pickNextColor = (excluding: string) => {
    const choices = STICKY_COLORS.filter((c) => c !== excluding);
    return choices[Math.floor(Math.random() * choices.length)] ?? STICKY_COLORS[0];
  };
  const pointerIdRef = useRef<number | null>(null);
  const padRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 500, damping: 32 });
  const springY = useSpring(y, { stiffness: 500, damping: 32 });

  // Track the drag with window-level listeners so the note follows the
  // cursor anywhere on screen, independent of which element is under it
  // (the pad's small hit-box, or the floating ghost itself).
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      x.set(e.clientX);
      y.set(e.clientY);
    };

    const handleUp = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      setDragging(false);
      pointerIdRef.current = null;

      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const dropX = e.clientX - rect.left - NOTE_SIZE / 2;
      const dropY = e.clientY - rect.top - NOTE_SIZE / 2;

      const withinBoard =
        e.clientX > rect.left + 12 &&
        e.clientX < rect.right - 12 &&
        e.clientY > rect.top + 12 &&
        e.clientY < rect.bottom - 12;

      if (withinBoard) {
        const id = createId();
        addObject({
          id,
          type: "sticky",
          x: dropX,
          y: dropY,
          width: NOTE_SIZE,
          height: NOTE_SIZE,
          text: "",
          color: colorRef.current,
          rotation: rotRef.current,
          zIndex: nextZIndex(),
        });
        commit();
        setSelected(id);
        setSheets((s) => Math.max(3, s - 1));
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!boardRef.current) return;
    playStickyTear(); // the peel-off-the-stack moment, not later when it's placed/removed
    pointerIdRef.current = e.pointerId;
    colorRef.current = nextColor;
    rotRef.current = (Math.random() - 0.5) * 10;
    // The stack's visible top sheet must reflect the *next* note the
    // instant this one is pulled off — not after it's been placed.
    setNextColor((c) => pickNextColor(c));

    // Every new note must start its peel animation from the pad's stack,
    // never from wherever the previous note happened to end up. Hard-jump
    // the spring to the stack position first, then let it animate from
    // there toward the cursor.
    const stackRect = padRef.current?.getBoundingClientRect();
    const stackX = stackRect ? stackRect.left + 6 + NOTE_SIZE / 2 : e.clientX;
    const stackY = stackRect ? stackRect.bottom - 6 - NOTE_SIZE / 2 : e.clientY;
    springX.jump(stackX);
    springY.jump(stackY);

    x.set(e.clientX);
    y.set(e.clientY);
    setDragging(true);
  };

  return (
    <>
      <div
        ref={padRef}
        className="absolute bottom-6 left-6 z-20 select-none"
        style={{ width: PAD_SIZE, height: PAD_SIZE, pointerEvents: "auto" }}
      >
        {Array.from({ length: Math.min(4, sheets - 1) }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-sm"
            style={{
              width: NOTE_SIZE,
              height: NOTE_SIZE,
              left: 6 + i * 1.5,
              bottom: 6 - i * 1.5,
              backgroundColor: STICKY_COLORS[0],
              filter: `brightness(${1 - i * 0.05})`,
              transform: `rotate(${(i - 1.5) * 2.2}deg)`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        ))}
        {!dragging && (
          <motion.div
            className="absolute cursor-grab touch-none rounded-sm"
            style={{
              width: NOTE_SIZE,
              height: NOTE_SIZE,
              left: 6,
              bottom: 6,
              backgroundColor: nextColor,
              boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
            }}
            whileHover={{ y: -4, rotate: -2 }}
            whileTap={{ scale: 0.97 }}
            onPointerDown={onPointerDown}
          />
        )}
      </div>

      {dragging && (
        <motion.div
          className="pointer-events-none fixed z-50 rounded-sm"
          style={{
            width: NOTE_SIZE,
            height: NOTE_SIZE,
            left: springX,
            top: springY,
            x: -NOTE_SIZE / 2,
            y: -NOTE_SIZE / 2,
            backgroundColor: colorRef.current,
            boxShadow: "0 18px 30px -8px rgba(0,0,0,0.55)",
          }}
          initial={{ rotate: -14, scale: 0.9, skewX: 6 }}
          animate={{ rotate: rotRef.current, scale: 1, skewX: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        />
      )}
    </>
  );
}
