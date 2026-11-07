import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Environment from "./Environment";
import DrawingCanvas from "./DrawingCanvas";
import ObjectsLayer from "./ObjectsLayer";
import StickyLayer from "./StickyLayer";
import BoardDots from "./BoardDots";
import BoardEdgeNav from "./BoardEdgeNav";
import TopRightToolbar from "./toolbar/TopRightToolbar";
import BottomToolbar from "./toolbar/BottomToolbar";
import StationeryToolbar from "./toolbar/StationeryToolbar";
import { useBoardStore, createId } from "../store/boardStore";
import { MIST_INK_COLOR } from "../types";
import type { Point, ShapeObjectData, ToolId } from "../types";
import { shapeCarvePaths } from "../lib/mistCarve";
import { startBoardSound, type BoardSoundHandle } from "../lib/sounds";

const SHAPE_ERASE_THICKNESS_MULTIPLIER = 3;

interface ShapeDraft {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Live preview of the shape actually being drawn — not just a diagonal
// guideline — so rectangles and ellipses visibly grow with the cursor
// before the pointer is released.
function renderShapeDraftPreview(
  tool: ToolId,
  draft: ShapeDraft,
  toolSettings: { color: string; thickness: number },
  previewColor: string
) {
  const { x1, y1, x2, y2 } = draft;
  const common = {
    stroke: previewColor,
    strokeWidth: toolSettings.thickness,
    strokeDasharray: "4 4",
    opacity: 0.8,
    fill: "none",
  } as const;

  switch (tool) {
    case "rectangle":
      return (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          rx={4}
          {...common}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          rx={Math.abs(x2 - x1) / 2}
          ry={Math.abs(y2 - y1) / 2}
          {...common}
        />
      );
    case "arrow": {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 10 + toolSettings.thickness * 2;
      const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const hy1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const hy2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
      return (
        <g {...common} strokeLinecap="round">
          <line x1={x1} y1={y1} x2={x2} y2={y2} />
          <polyline points={`${hx1},${hy1} ${x2},${y2} ${hx2},${hy2}`} />
        </g>
      );
    }
    case "line":
    default:
      return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeLinecap="round" />;
  }
}

function renderFreeArrowPreview(points: Point[], toolSettings: { color: string; thickness: number }, previewColor: string) {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLen = 10 + toolSettings.thickness * 2;
  const hx1 = b.x - headLen * Math.cos(angle - Math.PI / 6);
  const hy1 = b.y - headLen * Math.sin(angle - Math.PI / 6);
  const hx2 = b.x - headLen * Math.cos(angle + Math.PI / 6);
  const hy2 = b.y - headLen * Math.sin(angle + Math.PI / 6);
  return (
    <g
      stroke={previewColor}
      strokeWidth={toolSettings.thickness}
      strokeDasharray="4 4"
      opacity={0.8}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} />
      <polyline points={`${hx1},${hy1} ${b.x},${b.y} ${hx2},${hy2}`} />
    </g>
  );
}

const SHAPE_TOOLS = ["line", "arrow", "freeArrow", "rectangle", "ellipse"] as const;

function BoardPageContent({ pageId }: { pageId: string }) {
  const theme = useBoardStore((s) => s.theme);
  const tool = useBoardStore((s) => s.tool);
  const toolSettings = useBoardStore((s) => s.toolSettings);
  const setSelected = useBoardStore((s) => s.setSelected);
  const setTool = useBoardStore((s) => s.setTool);
  const addObject = useBoardStore((s) => s.addObject);
  const commit = useBoardStore((s) => s.commit);
  const nextZIndex = useBoardStore((s) => s.nextZIndex);
  const carveMistStroke = useBoardStore((s) => s.carveMistStroke);
  const selectedId = useBoardStore((s) => s.selectedId);
  const deleteSelected = useBoardStore((s) => s.deleteSelected);
  const eraserMode = useBoardStore((s) => s.eraserMode);
  const beginShapeErase = useBoardStore((s) => s.beginShapeErase);
  const extendShapeErase = useBoardStore((s) => s.extendShapeErase);
  const commitShapeErase = useBoardStore((s) => s.commitShapeErase);
  const glassOpacity = useBoardStore((s) => s.glassOpacity);

  const panelRef = useRef<HTMLDivElement>(null);
  const [shapeDraft, setShapeDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [freeArrowPoints, setFreeArrowPoints] = useState<Point[] | null>(null);
  const draggingShape = useRef(false);
  const boardSoundRef = useRef<BoardSoundHandle | null>(null);

  const isShapeTool = (SHAPE_TOOLS as readonly string[]).includes(tool);
  const isMist = theme === "mist";

  const toPanelPoint = (e: React.PointerEvent) => {
    const rect = panelRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePanelPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // ignore bubbling from child objects

    if (tool === "select") {
      setSelected(null);
      return;
    }

    if (tool === "freeArrow") {
      const pt = toPanelPoint(e);
      draggingShape.current = true;
      setFreeArrowPoints([pt]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      boardSoundRef.current?.stop();
      boardSoundRef.current = startBoardSound();
      return;
    }

    if (isShapeTool) {
      const pt = toPanelPoint(e);
      draggingShape.current = true;
      setShapeDraft({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      boardSoundRef.current?.stop();
      boardSoundRef.current = startBoardSound();
      return;
    }

    if (tool === "text") {
      const pt = toPanelPoint(e);
      const id = createId();
      addObject({
        id,
        type: "text",
        x: pt.x,
        y: pt.y,
        width: 240,
        text: "",
        color: isMist ? MIST_INK_COLOR : toolSettings.color === "#ffffff" ? "#15171c" : toolSettings.color,
        fontSize: 22,
        fontFamily: "ui-sans-serif, system-ui",
        fontWeight: 500,
        italic: false,
        align: "left",
        underline: false,
        rotation: 0,
        zIndex: nextZIndex(),
      });
      commit();
      setSelected(id);
      setTool("select");
    }
  };

  const handlePanelPointerMove = (e: React.PointerEvent) => {
    if (!draggingShape.current) return;
    const pt = toPanelPoint(e);
    if (freeArrowPoints) {
      setFreeArrowPoints((pts) => (pts ? [...pts, pt] : pts));
      return;
    }
    if (shapeDraft) {
      setShapeDraft((d) => (d ? { ...d, x2: pt.x, y2: pt.y } : d));
    }
  };

  const handlePanelPointerUp = () => {
    boardSoundRef.current?.stop();
    boardSoundRef.current = null;
    if (!draggingShape.current) return;
    draggingShape.current = false;

    if (freeArrowPoints) {
      const points = freeArrowPoints;
      setFreeArrowPoints(null);
      if (points.length < 2) return;
      const first = points[0];
      const last = points[points.length - 1];
      const shape: ShapeObjectData = {
        id: createId(),
        type: "shape",
        shape: "freeArrow",
        x1: first.x,
        y1: first.y,
        x2: last.x,
        y2: last.y,
        points,
        color: isMist ? MIST_INK_COLOR : toolSettings.color,
        thickness: toolSettings.thickness,
        rotation: 0,
        zIndex: nextZIndex(),
      };
      addObject(shape);
      if (isMist) for (const path of shapeCarvePaths(shape)) carveMistStroke(path, shape.thickness);
      commit();
      return;
    }

    if (!shapeDraft) return;
    const { x1, y1, x2, y2 } = shapeDraft;
    setShapeDraft(null);
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 4) return;

    const shape: ShapeObjectData = {
      id: createId(),
      type: "shape",
      shape: tool as ShapeObjectData["shape"],
      x1,
      y1,
      x2,
      y2,
      color: isMist ? MIST_INK_COLOR : toolSettings.color,
      thickness: toolSettings.thickness,
      rotation: 0,
      zIndex: nextZIndex(),
    };
    addObject(shape);
    if (isMist) for (const path of shapeCarvePaths(shape)) carveMistStroke(path, shape.thickness);
    commit();
  };

  useEffect(() => {
    return () => {
      boardSoundRef.current?.stop();
      boardSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedId) return;
      const active = document.activeElement as HTMLElement | null;
      const isEditableFocus =
        !!active && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isEditableFocus) {
        // Selecting a text/sticky object focuses its editable text (so the
        // user can start typing right away), but that same focus must not
        // swallow Delete when there's nothing to edit yet. Only defer to
        // native text editing once there's actual text to delete from.
        const hasText = (active!.textContent ?? "").trim().length > 0;
        if (hasText) return;
        active!.blur();
      }
      e.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, deleteSelected]);

  const handleShapeErasePoint = (pt: Point, isNewStroke: boolean) => {
    if (isNewStroke) beginShapeErase(pt);
    else extendShapeErase(pt);
  };

  const handleShapeEraseEnd = () => {
    commitShapeErase(toolSettings.thickness * SHAPE_ERASE_THICKNESS_MULTIPLIER);
  };

  const isGlass = theme === "glass";

  // 0 = opaque board, 100 = fully see-through. Drives both how much white
  // frost tint sits on the glass and how strongly the backdrop is blurred.
  const t = glassOpacity / 100;
  const glassTintA = 0.3 - 0.27 * t;
  const glassTintB = 0.08 - 0.07 * t;
  const glassBlur = 16 - 13 * t;

  return (
    <div className="absolute inset-0 h-full w-full no-select">
      <div className="absolute inset-0 h-full w-full">
      <Environment theme={theme} />

      {/* SVG distortion filter powering the "liquid glass" refraction on
          the glass-theme panel. Rendered once, applied via backdrop-filter. */}
      <svg aria-hidden className="absolute h-0 w-0 overflow-hidden">
        <filter id="liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="3" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="34" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* Metal bezel: a ring only — no fill — so the glass panel's
          backdrop-filter samples the real scene behind it, not this
          frame's own paint. Drawn with a mask (rather than border-image)
          so the corner radius is identical, inside and out, to the glass
          panel it surrounds — border-image doesn't round its inner edge. */}
      <div
        className="pointer-events-none absolute inset-4 rounded-[40px] p-[9px] md:inset-8"
        style={{
          background:
            "linear-gradient(150deg, #f1f1f4 0%, #c6c8cf 12%, #84868d 32%, #fafafb 48%, #797b82 62%, #d4d6dc 82%, #efeff2 100%)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          boxShadow:
            "0 35px 80px -18px rgba(0,0,0,0.65), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -2px 3px rgba(0,0,0,0.35)",
        }}
      />

      <div className="absolute inset-4 rounded-[40px] p-[9px] md:inset-8">
        <div
          ref={panelRef}
          className="relative h-full w-full overflow-hidden rounded-[31px]"
          style={
            isGlass
              ? {
                  background: `linear-gradient(135deg, rgba(255,255,255,${glassTintA}), rgba(255,255,255,${glassTintB * 0.2}) 40%, rgba(255,255,255,${glassTintB}))`,
                  backdropFilter: `url(#liquid-glass-distortion) blur(${glassBlur}px) saturate(130%) brightness(1.03)`,
                  WebkitBackdropFilter: `blur(${glassBlur}px) saturate(130%) brightness(1.03)`,
                  boxShadow:
                    "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -22px 46px -30px rgba(255,255,255,0.15), inset 0 0 0 1px rgba(255,255,255,0.25)",
                }
              : {
                  // A light glass blur so the environment behind shows
                  // through, softly, wherever the condensation is wiped
                  // clear — not just a flat view straight to the backdrop.
                  backdropFilter: "blur(2.5px) saturate(108%) brightness(1.03)",
                  WebkitBackdropFilter: "blur(2.5px) saturate(108%) brightness(1.03)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 2px 6px rgba(0,0,0,0.5)",
                }
          }
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
        >
          {isGlass && (
            <>
              {/* subtle frosted grain */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />
              {/* glossy top-left specular sheen, typical of liquid-glass UI */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 22%, transparent 45%)",
                }}
              />
            </>
          )}
          <DrawingCanvas
            pageId={pageId}
            theme={theme}
            active={tool === "pen" || tool === "highlighter" || tool === "eraser"}
            eraserMode={eraserMode}
            onShapeErasePoint={handleShapeErasePoint}
            onShapeEraseEnd={handleShapeEraseEnd}
          />

          {shapeDraft && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {renderShapeDraftPreview(tool, shapeDraft, toolSettings, isMist ? MIST_INK_COLOR : toolSettings.color)}
            </svg>
          )}

          {freeArrowPoints && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {renderFreeArrowPreview(freeArrowPoints, toolSettings, isMist ? MIST_INK_COLOR : toolSettings.color)}
            </svg>
          )}

          <ObjectsLayer theme={theme} />
        </div>
      </div>
      </div>

      <StickyLayer />
    </div>
  );
}

// Direction the active page should slide in from / out towards, matching
// the "which way did we move" signal the store keeps while a page switch
// is in flight — mirrors the GNOME-workspace feel of sliding desktops
// horizontally rather than crossfading them.
// Plain module-scope flag (not React state/ref) so reading it during
// render triggers neither "ref read during render" nor "setState in
// effect" lint warnings — it only ever needs to flip once, the first time
// the app has fully painted.
let hasAppMountedOnce = false;

// `instant` is set when a page change didn't come from the user (export
// walking through every board) — those jumps happen with no slide at all.
interface PageCustom {
  dir: number;
  instant: boolean;
}
const PAGE_EASE = [0.32, 0.72, 0, 1] as const;
const pageTransitionFor = (c: PageCustom) => ({ duration: c.instant ? 0 : 0.45, ease: PAGE_EASE });
const pageVariants = {
  enter: (c: PageCustom) => ({ x: c.dir >= 0 ? "100%" : "-100%" }),
  center: (c: PageCustom) => ({ x: 0, transition: pageTransitionFor(c) }),
  exit: (c: PageCustom) => ({ x: c.dir >= 0 ? "-100%" : "100%", transition: pageTransitionFor(c) }),
};

export default function Board() {
  const currentPageIndex = useBoardStore((s) => s.currentPageIndex);
  const pageId = useBoardStore((s) => s.pages[s.currentPageIndex]?.id ?? "");
  const pageTransition = useBoardStore((s) => s.pageTransition);
  const pageTransitionId = useBoardStore((s) => s.pageTransitionId);
  const clearPageTransition = useBoardStore((s) => s.clearPageTransition);
  const toolbarStyle = useBoardStore((s) => s.toolbarStyle);
  const pageCustom: PageCustom = { dir: pageTransition === "prev" ? -1 : 1, instant: pageTransition === null };

  // The very first page shouldn't slide in from off-screen on initial app
  // load — but AnimatePresence's own `initial={false}` (the usual way to
  // suppress that) also suppresses *nested* motion components' first-mount
  // animations app-wide (e.g. a sticky note's delete-and-fall), not just
  // this wrapper's. So instead this one render is opted out individually,
  // via the motion.div's own `initial` prop, while AnimatePresence itself
  // stays at its default so descendants animate normally from the start.
  const skipFirstEntrance = !hasAppMountedOnce;
  useEffect(() => {
    hasAppMountedOnce = true;
  }, []);

  return (
    <div data-export-root className="relative h-full w-full no-select overflow-hidden">
      <AnimatePresence custom={pageCustom} mode="popLayout">
        <motion.div
          key={currentPageIndex}
          data-page-root
          data-page-id={pageId}
          custom={pageCustom}
          variants={pageVariants}
          initial={skipFirstEntrance ? false : "enter"}
          animate="center"
          exit="exit"
          onAnimationComplete={() => clearPageTransition(pageTransitionId)}
          className="absolute inset-0"
        >
          <BoardPageContent pageId={pageId} />
        </motion.div>
      </AnimatePresence>

      <BoardDots />
      <div data-export-exclude>
        <BoardEdgeNav />
        <TopRightToolbar />
        {toolbarStyle === "3d" ? <StationeryToolbar /> : <BottomToolbar />}
      </div>
    </div>
  );
}
