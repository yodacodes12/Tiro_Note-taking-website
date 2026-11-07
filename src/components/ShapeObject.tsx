import { useMemo, useRef } from "react";
import type { ShapeEraseStrokeData, ShapeObjectData, Theme } from "../types";
import { useBoardStore } from "../store/boardStore";
import { shapeCarvePaths } from "../lib/mistCarve";
import { startBoardSound, type BoardSoundHandle } from "../lib/sounds";

const PAD = 16;
const ERASE_THICKNESS_MULTIPLIER = 3;

interface DragState {
  startX: number;
  startY: number;
  orig: ShapeObjectData;
}

export default function ShapeObject({ obj, theme }: { obj: ShapeObjectData; theme: Theme }) {
  const tool = useBoardStore((s) => s.tool);
  const selectedId = useBoardStore((s) => s.selectedId);
  const setSelected = useBoardStore((s) => s.setSelected);
  const updateObject = useBoardStore((s) => s.updateObject);
  const commit = useBoardStore((s) => s.commit);
  const carveMistStroke = useBoardStore((s) => s.carveMistStroke);
  // Select the raw (referentially stable) array and filter afterwards —
  // filtering inside the selector itself returns a new array on every
  // snapshot call, which breaks useSyncExternalStore's caching requirement
  // and causes an infinite render loop.
  const objects = useBoardStore((s) => s.objects);
  const eraseStrokes = useMemo(
    () =>
      objects.filter(
        (o): o is ShapeEraseStrokeData => o.type === "shapeErase" && o.targetShapeIds.includes(obj.id)
      ),
    [objects, obj.id]
  );
  const activeShapeErasePoints = useBoardStore((s) => s.activeShapeErasePoints);
  const eraserThickness = useBoardStore((s) => s.toolSettings.thickness * ERASE_THICKNESS_MULTIPLIER);

  const interactive = tool === "select";
  const selected = selectedId === obj.id;

  const isFreeArrow = obj.shape === "freeArrow" && !!obj.points && obj.points.length > 0;
  const allPoints = isFreeArrow ? obj.points! : [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];

  const minX = Math.min(...allPoints.map((p) => p.x)) - PAD;
  const minY = Math.min(...allPoints.map((p) => p.y)) - PAD;
  const maxX = Math.max(...allPoints.map((p) => p.x)) + PAD;
  const maxY = Math.max(...allPoints.map((p) => p.y)) + PAD;
  const w = maxX - minX;
  const h = maxY - minY;

  const lx1 = obj.x1 - minX;
  const ly1 = obj.y1 - minY;
  const lx2 = obj.x2 - minX;
  const ly2 = obj.y2 - minY;
  const localPoints = allPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));

  const dragRef = useRef<DragState | null>(null);
  const modeRef = useRef<"move" | "p1" | "p2" | null>(null);
  const boardSoundRef = useRef<BoardSoundHandle | null>(null);

  const beginDrag = (e: React.PointerEvent, mode: "move" | "p1" | "p2") => {
    if (!interactive) return;
    e.stopPropagation();
    setSelected(obj.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, orig: obj };
    modeRef.current = mode;
    boardSoundRef.current?.stop();
    boardSoundRef.current = startBoardSound();
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const mode = modeRef.current;
    const orig = dragRef.current.orig;
    if (mode === "move") {
      if (orig.shape === "freeArrow" && orig.points) {
        updateObject(obj.id, {
          x1: orig.x1 + dx,
          y1: orig.y1 + dy,
          x2: orig.x2 + dx,
          y2: orig.y2 + dy,
          points: orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        });
      } else {
        updateObject(obj.id, { x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy });
      }
    } else if (mode === "p1") {
      updateObject(obj.id, { x1: orig.x1 + dx, y1: orig.y1 + dy });
    } else if (mode === "p2") {
      updateObject(obj.id, { x2: orig.x2 + dx, y2: orig.y2 + dy });
    }
  };

  const onUp = () => {
    boardSoundRef.current?.stop();
    boardSoundRef.current = null;
    if (dragRef.current) {
      dragRef.current = null;
      // Moving/resizing doesn't un-carve the old clearing (the fog can't
      // un-wipe itself), but it does carve the shape's new outline fresh,
      // so the visible clearing catches up with wherever it ends up.
      if (theme === "mist") for (const path of shapeCarvePaths(obj)) carveMistStroke(path, obj.thickness);
      commit();
    }
  };

  const strokeW = obj.thickness;
  const isMist = theme === "mist";
  const displayColor = isMist && !selected ? "transparent" : obj.color;

  const renderShape = () => {
    switch (obj.shape) {
      case "line":
        return <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={displayColor} strokeWidth={strokeW} strokeLinecap="round" />;
      case "arrow": {
        const angle = Math.atan2(ly2 - ly1, lx2 - lx1);
        const headLen = 10 + strokeW * 2;
        const hx1 = lx2 - headLen * Math.cos(angle - Math.PI / 6);
        const hy1 = ly2 - headLen * Math.sin(angle - Math.PI / 6);
        const hx2 = lx2 - headLen * Math.cos(angle + Math.PI / 6);
        const hy2 = ly2 - headLen * Math.sin(angle + Math.PI / 6);
        return (
          <g stroke={displayColor} strokeWidth={strokeW} strokeLinecap="round" fill="none">
            <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} />
            <polyline points={`${hx1},${hy1} ${lx2},${ly2} ${hx2},${hy2}`} />
          </g>
        );
      }
      case "rectangle":
        return (
          <rect
            x={Math.min(lx1, lx2)}
            y={Math.min(ly1, ly2)}
            width={Math.abs(lx2 - lx1)}
            height={Math.abs(ly2 - ly1)}
            stroke={displayColor}
            strokeWidth={strokeW}
            fill="none"
            rx={4}
          />
        );
      case "ellipse":
        return (
          <ellipse
            cx={(lx1 + lx2) / 2}
            cy={(ly1 + ly2) / 2}
            rx={Math.abs(lx2 - lx1) / 2}
            ry={Math.abs(ly2 - ly1) / 2}
            stroke={displayColor}
            strokeWidth={strokeW}
            fill="none"
          />
        );
      case "freeArrow": {
        if (localPoints.length < 2) return null;
        const a = localPoints[localPoints.length - 2];
        const b = localPoints[localPoints.length - 1];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const headLen = 10 + strokeW * 2;
        const hx1 = b.x - headLen * Math.cos(angle - Math.PI / 6);
        const hy1 = b.y - headLen * Math.sin(angle - Math.PI / 6);
        const hx2 = b.x - headLen * Math.cos(angle + Math.PI / 6);
        const hy2 = b.y - headLen * Math.sin(angle + Math.PI / 6);
        return (
          <g stroke={displayColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <polyline points={localPoints.map((p) => `${p.x},${p.y}`).join(" ")} />
            <polyline points={`${hx1},${hy1} ${b.x},${b.y} ${hx2},${hy2}`} />
          </g>
        );
      }
    }
  };

  // Free-flow eraser cutouts: translate each board-coordinate erase stroke
  // into this shape's local SVG space and subtract it from a mask, so the
  // shape appears genuinely rubbed away rather than deleted whole.
  const maskId = `shape-erase-mask-${obj.id}`;
  const hasErasure = eraseStrokes.length > 0 || (activeShapeErasePoints?.length ?? 0) > 0;

  const toLocalPoints = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x - minX},${p.y - minY}`).join(" ");

  const content = renderShape();
  const blurId = `shape-mist-blur-${obj.id}`;

  return (
    <div
      className="absolute"
      style={{ left: minX, top: minY, width: w, height: h, pointerEvents: interactive ? "auto" : "none" }}
    >
      <svg width={w} height={h} className="absolute inset-0 overflow-visible">
        {isMist && (
          <defs>
            <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.35" />
            </filter>
          </defs>
        )}
        {hasErasure && (
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
              <rect x={0} y={0} width={w} height={h} fill="white" />
              {eraseStrokes.map((es) => (
                <polyline
                  key={es.id}
                  points={toLocalPoints(es.points)}
                  fill="none"
                  stroke="black"
                  strokeWidth={es.thickness}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {activeShapeErasePoints && activeShapeErasePoints.length > 0 && (
                <polyline
                  points={toLocalPoints(activeShapeErasePoints)}
                  fill="none"
                  stroke="black"
                  strokeWidth={eraserThickness}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </mask>
          </defs>
        )}

        <g mask={hasErasure ? `url(#${maskId})` : undefined} filter={isMist ? `url(#${blurId})` : undefined}>
          {content}
        </g>

        {/* wider invisible hit area for grabbing — intentionally outside
            the mask, so a partly-erased shape can still be selected/moved
            by its original footprint */}
        <g
          onPointerDown={(e) => beginDrag(e, "move")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{ cursor: interactive ? "move" : "default" }}
        >
          {isFreeArrow ? (
            <polyline
              points={localPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(18, strokeW + 14)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="transparent" strokeWidth={Math.max(18, strokeW + 14)} />
          )}
        </g>

        {selected && interactive && !isFreeArrow && (
          <>
            <circle
              cx={lx1}
              cy={ly1}
              r={6}
              fill="white"
              stroke="#333"
              strokeWidth={1}
              onPointerDown={(e) => beginDrag(e, "p1")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              style={{ cursor: "pointer" }}
            />
            <circle
              cx={lx2}
              cy={ly2}
              r={6}
              fill="white"
              stroke="#333"
              strokeWidth={1}
              onPointerDown={(e) => beginDrag(e, "p2")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              style={{ cursor: "pointer" }}
            />
          </>
        )}
      </svg>
    </div>
  );
}
