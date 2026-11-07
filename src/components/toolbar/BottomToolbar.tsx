import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ClearBoardIcon, EraserIcon, MistifyIcon, ToolButton } from "./toolbarParts";
import { SHAPE_BUTTONS, TOOL_BUTTONS } from "./toolbarButtons";
import { HIGHLIGHTER_COLORS, MARKER_COLORS } from "../../types";
import { useBoardStore } from "../../store/boardStore";

// Where the bar sits for each "Toolbar position" setting, which way it
// drops in, and which way its little menus open (always toward the board).
const PLACEMENT = {
  bottom: { wrap: "bottom-6 left-1/2 -translate-x-1/2", enter: { y: -400 }, menu: "bottom-12 left-1/2 -translate-x-1/2" },
  top: { wrap: "top-6 left-1/2 -translate-x-1/2", enter: { y: -200 }, menu: "top-12 left-1/2 -translate-x-1/2" },
  left: { wrap: "left-6 top-6 bottom-[190px]", enter: { x: -200 }, menu: "left-12 top-1/2 -translate-y-1/2" },
  right: { wrap: "right-6 top-[90px] bottom-6", enter: { x: 200 }, menu: "right-12 top-1/2 -translate-y-1/2" },
} as const;

export default function BottomToolbar() {
  const position = useBoardStore((s) => s.toolbarPosition);
  const vertical = position === "left" || position === "right";
  const place = PLACEMENT[position];
  const divider = vertical ? "my-1 h-px w-6 bg-white/15" : "mx-1 h-6 w-px bg-white/15";
  const theme = useBoardStore((s) => s.theme);
  const triggerMistify = useBoardStore((s) => s.triggerMistify);
  const clearGlassBoard = useBoardStore((s) => s.clearGlassBoard);
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const toolSettings = useBoardStore((s) => s.toolSettings);
  const setColor = useBoardStore((s) => s.setColor);
  const highlighterColor = useBoardStore((s) => s.highlighterColor);
  const setHighlighterColor = useBoardStore((s) => s.setHighlighterColor);
  const setThickness = useBoardStore((s) => s.setThickness);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const selectedId = useBoardStore((s) => s.selectedId);
  const deleteSelected = useBoardStore((s) => s.deleteSelected);
  const duplicateObject = useBoardStore((s) => s.duplicateObject);
  const eraserMode = useBoardStore((s) => s.eraserMode);
  const setEraserMode = useBoardStore((s) => s.setEraserMode);

  const [shapesOpen, setShapesOpen] = useState(false);
  const [eraserOpen, setEraserOpen] = useState(false);
  const isShapeTool = SHAPE_BUTTONS.some((b) => b.id === tool);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useLayoutEffect(() => {
    if (!vertical) return;
    const band = bandRef.current;
    const bar = toolbarRef.current;
    if (!band || !bar) return;
    const fit = () => setFitScale(Math.min(1, band.clientHeight / bar.offsetHeight));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(band);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [vertical]);
  useEffect(() => {
    if (!shapesOpen && !eraserOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShapesOpen(false);
        setEraserOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [shapesOpen, eraserOpen]);

  return (
    // On a side edge the bar is centred in the band between the corner
    // furniture (sticky pad bottom-left, top-right toolbar), shrinking to
    // fit if the screen is too short.
    <div
      ref={bandRef}
      className={`absolute z-30 ${place.wrap} ${vertical ? "pointer-events-none flex items-center" : ""}`}
    >
      <motion.div
        key={position}
        ref={toolbarRef}
        initial={place.enter}
        animate={{ x: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: vertical ? 22 : 11, mass: 1 }}
        className={`flex items-center gap-1.5 border border-white/15 shadow-xl ${
          vertical ? "pointer-events-auto flex-col rounded-[26px] px-1.5 py-2.5" : "rounded-full px-2.5 py-1.5"
        }`}
        style={{
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(16px)",
          ...(vertical && fitScale < 1 ? { scale: fitScale, transformOrigin: position === "left" ? "0% 50%" : "100% 50%" } : {}),
        }}
      >
      {TOOL_BUTTONS.map((b) => (
        <ToolButton key={b.id} active={tool === b.id} label={b.label} icon={b.icon} onClick={() => setTool(b.id)} />
      ))}

      <div className="relative">
        <ToolButton
          active={tool === "eraser"}
          label="Eraser"
          icon={<EraserIcon />}
          onClick={() => {
            setTool("eraser");
            setEraserOpen((v) => !v);
            setShapesOpen(false);
          }}
        />
        {eraserOpen && (
          <div
            className={`absolute ${place.menu} w-40 overflow-hidden rounded-2xl border border-white/15 text-sm`}
            style={{ background: "rgba(20,20,30,0.9)", backdropFilter: "blur(16px)" }}
          >
            <button
              className={`block w-full px-3 py-2 text-left hover:bg-white/10 ${
                eraserMode === "ink" ? "text-white" : "text-white/70"
              }`}
              onClick={() => {
                setEraserMode("ink");
                setEraserOpen(false);
              }}
            >
              {eraserMode === "ink" ? "● " : "○ "}Erase Ink
            </button>
            <button
              className={`block w-full px-3 py-2 text-left hover:bg-white/10 ${
                eraserMode === "shape" ? "text-white" : "text-white/70"
              }`}
              onClick={() => {
                setEraserMode("shape");
                setEraserOpen(false);
              }}
            >
              {eraserMode === "shape" ? "● " : "○ "}Erase Shape
            </button>
            <button
              className={`block w-full px-3 py-2 text-left hover:bg-white/10 ${
                eraserMode === "all" ? "text-white" : "text-white/70"
              }`}
              onClick={() => {
                setEraserMode("all");
                setEraserOpen(false);
              }}
            >
              {eraserMode === "all" ? "● " : "○ "}Erase All
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <ToolButton
          active={isShapeTool}
          label="Shapes"
          icon="◈"
          onClick={() => {
            setShapesOpen((v) => !v);
            setEraserOpen(false);
          }}
        />
        {shapesOpen && (
          <div
            className={`absolute ${place.menu} flex gap-1 rounded-2xl border border-white/15 p-1.5 ${vertical ? "flex-col" : ""}`}
            style={{ background: "rgba(20,20,30,0.85)", backdropFilter: "blur(16px)" }}
          >
            {SHAPE_BUTTONS.map((b) => (
              <ToolButton
                key={b.id}
                active={tool === b.id}
                label={b.label}
                icon={b.icon}
                onClick={() => {
                  setTool(b.id);
                  setShapesOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className={divider} />

      {tool === "highlighter" ? (
        <div className={`flex items-center gap-1 rounded-full bg-white/5 ${vertical ? "flex-col px-1 py-2" : "px-2 py-1"}`}>
          {HIGHLIGHTER_COLORS.map((c) => (
            <button
              key={c}
              title="Highlighter colour"
              onClick={() => setHighlighterColor(c)}
              className={`h-5 w-5 rounded-full border transition-transform ${
                highlighterColor === c ? "scale-110 border-white" : "border-white/30"
              }`}
              style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}99` }}
            />
          ))}
        </div>
      ) : theme !== "mist" && (
        <div className={`flex items-center gap-1 rounded-full bg-white/5 ${vertical ? "flex-col px-1 py-2" : "px-2 py-1"}`}>
          {MARKER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                // Picking a colour implies "I want to draw" — switch out of
                // tools that don't use it rather than making the user do
                // that by hand first.
                if (tool === "select" || tool === "eraser" || tool === "text") setTool("pen");
              }}
              className={`h-5 w-5 rounded-full border transition-transform ${
                toolSettings.color === c ? "scale-110 border-white" : "border-white/30"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      <div className={vertical ? "flex h-24 w-9 items-center justify-center" : "contents"}>
        <input
          type="range"
          title="Size"
          min={1}
          max={24}
          value={toolSettings.thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          className={vertical ? "w-20 shrink-0 -rotate-90 accent-white" : "mx-1 w-20 accent-white"}
        />
      </div>

      <div className={divider} />

      <ToolButton active={false} label="Undo" icon="↺" onClick={undo} />
      <ToolButton active={false} label="Redo" icon="↻" onClick={redo} />

      {theme === "mist" && (
        <>
          <div className={divider} />
          <ToolButton
            active={false}
            label="Mistify Again — re-fog the whole board (keeps notes, text & shapes)"
            icon={<MistifyIcon />}
            onClick={triggerMistify}
          />
        </>
      )}

      {theme === "glass" && (
        <>
          <div className={divider} />
          <ToolButton
            active={false}
            label="Clear Board — wipe all ink (keeps notes, text & shapes)"
            icon={<ClearBoardIcon />}
            onClick={clearGlassBoard}
          />
        </>
      )}

      {selectedId && (
        <>
          <div className={divider} />
          <ToolButton active={false} label="Duplicate" icon="⧉" onClick={() => duplicateObject(selectedId)} />
          <ToolButton active={false} label="Delete" icon="✕" onClick={deleteSelected} />
        </>
      )}
      </motion.div>
    </div>
  );
}
