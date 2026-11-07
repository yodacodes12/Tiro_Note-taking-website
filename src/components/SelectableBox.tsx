import { useRef, type ReactNode } from "react";

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  selected: boolean;
  interactive: boolean; // true when select tool is active
  minWidth?: number;
  minHeight?: number;
  onSelect: () => void;
  onChange: (patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
  onCommit: () => void;
  children: ReactNode;
}

export default function SelectableBox({
  x,
  y,
  width,
  height,
  rotation,
  selected,
  interactive,
  minWidth = 24,
  minHeight = 24,
  onSelect,
  onChange,
  onCommit,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const rotateRef = useRef<{ startAngle: number; origRotation: number } | null>(null);

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const onBodyPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    stop(e);
    onSelect();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
  };

  const onBodyPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onChange({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };

  const onBodyPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      onCommit();
    }
  };

  const onResizeDown = (e: React.PointerEvent) => {
    stop(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: width, origH: height };
  };

  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    onChange({
      width: Math.max(minWidth, resizeRef.current.origW + dx),
      height: Math.max(minHeight, resizeRef.current.origH + dy),
    });
  };

  const onResizeUp = () => {
    if (resizeRef.current) {
      resizeRef.current = null;
      onCommit();
    }
  };

  const onRotateDown = (e: React.PointerEvent) => {
    stop(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = boxRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    rotateRef.current = { startAngle, origRotation: rotation };
  };

  const onRotateMove = (e: React.PointerEvent) => {
    if (!rotateRef.current) return;
    const rect = boxRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    const delta = angle - rotateRef.current.startAngle;
    onChange({ rotation: rotateRef.current.origRotation + delta });
  };

  const onRotateUp = () => {
    if (rotateRef.current) {
      rotateRef.current = null;
      onCommit();
    }
  };

  return (
    <div
      ref={boxRef}
      className="absolute"
      style={{
        left: x,
        top: y,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: interactive ? "auto" : "none",
      }}
      onPointerDown={onBodyPointerDown}
      onPointerMove={onBodyPointerMove}
      onPointerUp={onBodyPointerUp}
    >
      {children}
      {selected && interactive && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-white/70" />
          <div
            className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white/80 bg-white/90 shadow"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <div
            className="absolute left-1/2 -top-7 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-white/80 bg-white/90 shadow"
            onPointerDown={onRotateDown}
            onPointerMove={onRotateMove}
            onPointerUp={onRotateUp}
          />
          <div className="pointer-events-none absolute left-1/2 -top-7 h-5 w-px -translate-x-1/2 bg-white/50" />
        </>
      )}
    </div>
  );
}
