import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { useBoardStore } from "../../store/boardStore";
import type { ToolbarPosition } from "../../types";
import { PICKER_MARKER_COLORS, PICKER_NEON_COLORS } from "../../types";
import { ClearBoardIcon, MistifyIcon, ToolButton } from "./toolbarParts";
import { SHAPE_BUTTONS } from "./toolbarButtons";

// The "3D toolbar": physical markers, highlighters and an eraser poking up
// from below the bottom edge of the screen, followed by a separate dark
// glass panel for the remaining tools. Everything is CSS/SVG geometry —
// cylinder shading is layered horizontal gradients, grip ridges are placed
// by projecting evenly spaced angles round the cylinder onto the front face.

// ── Geometry (px, before responsive scaling) ──────────────────────────────
const MARKER_W = 60;
const MARKER_CAP_H = 84;
const HL_W = 58;
const HL_CAP_H = 88;
const PEN_BODY_H = 240; // full white barrel length, almost all off-screen
const ERASER_W = 76;
const ERASER_TOP_H = 58;
const ERASER_BASE_H = 220;

// Resting: the whole cap plus ~3% of the full pen length shows.
const MARKER_REST_BODY = Math.round((MARKER_CAP_H + PEN_BODY_H) * 0.03);
const HL_REST_BODY = Math.round((HL_CAP_H + PEN_BODY_H) * 0.03);
const ERASER_REST_BASE = 18;

const HOVER_LIFT = 34;
const SELECTED_LIFT = 22;
const ITEM_GAP = 18;
const GROUP_GAP = 34;
// Side edges have far less room than the bottom, so spacing tightens there.
const ITEM_GAP_VERTICAL = 10;
const GROUP_GAP_VERTICAL = 20;

const MIST_MARKER_CAP = "#1b1d22";
const PAD_RESERVE_LEFT = 190; // sticky-note pad lives in the bottom-left corner
const EDGE_MARGIN = 24;

const LIFT_TRANSITION = {
  type: "tween",
  ease: [0.22, 1, 0.36, 1],
  duration: 0.32,
} as const;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Left-lit cylinder: dark rim, bright specular band left of centre, a long
// soft fall-off to a darker right rim.
const CYLINDER_SHADE =
  "linear-gradient(90deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.14) 9%, rgba(255,255,255,.08) 18%, rgba(255,255,255,.46) 26%, rgba(255,255,255,.14) 33%, rgba(255,255,255,0) 46%, rgba(0,0,0,.06) 66%, rgba(0,0,0,.24) 86%, rgba(0,0,0,.5) 100%)";

const WHITE_MATTE =
  "linear-gradient(90deg, #a6abb2 0%, #d9dce0 11%, #f3f4f6 28%, #ffffff 42%, #eef0f2 66%, #cdd1d6 88%, #9fa4ab 100%)";

// Grooves sit at fixed angles round the cap; projected onto the front face
// they bunch up and narrow toward the edges, which is what sells the curve.
const RIDGE_ANGLES = [-66, -22, 22, 66];

function Ridges({
  width,
  top,
  bottom,
  strength = 1,
}: {
  width: number;
  top: number;
  bottom: number;
  strength?: number;
}) {
  return (
    <>
      {RIDGE_ANGLES.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const grooveW = Math.max(2, 7 * Math.cos(rad));
        const cx = width / 2 + (width / 2 - 3) * Math.sin(rad);
        return (
          <div
            key={deg}
            className="absolute rounded-full"
            style={{
              left: cx - grooveW / 2,
              width: grooveW,
              top,
              bottom,
              background: `linear-gradient(90deg, rgba(0,0,0,${0.42 * strength}) 0%, rgba(0,0,0,${0.18 * strength}) 45%, rgba(255,255,255,${0.32 * strength}) 100%)`,
            }}
          />
        );
      })}
    </>
  );
}

function WhiteBody({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="relative mx-auto"
      style={{ width: width - 4, height, background: WHITE_MATTE }}
    >
      {/* contact shadow just under the cap */}
      <div
        className="absolute inset-x-0 top-0 h-2"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0))",
        }}
      />
    </div>
  );
}

function MarkerCap({ color }: { color: string }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: MARKER_W,
        height: MARKER_CAP_H,
        borderRadius: "16px 16px 3px 3px / 11px 11px 3px 3px",
        background: `${CYLINDER_SHADE}, ${color}`,
      }}
    >
      <Ridges width={MARKER_W} top={9} bottom={13} />
      {/* rounded top edge catching the light */}
      <div
        className="absolute inset-x-0 top-0 h-4"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.12) 45%, rgba(255,255,255,0))",
        }}
      />
      {/* moulded rim at the open end */}
      <div
        className="absolute inset-x-0 bottom-0 h-[7px]"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,.3), rgba(255,255,255,.16) 35%, rgba(0,0,0,.22))",
        }}
      />
    </div>
  );
}

// Translucent neon cap with the chisel nib and its stepped holder visible
// inside, plus wall-thickness lines and a specular streak over the top.
function HighlighterCap({ color }: { color: string }) {
  const W = HL_W;
  const H = HL_CAP_H;
  const nibGrad = `hl-nib-${color.replace("#", "")}`;
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: W,
        height: H,
        borderRadius: "15px 15px 3px 3px / 11px 11px 3px 3px",
        background: `linear-gradient(90deg, rgba(0,0,0,.18) 0%, rgba(255,255,255,.05) 14%, rgba(255,255,255,.28) 24%, rgba(255,255,255,0) 40%, rgba(0,0,0,.05) 70%, rgba(0,0,0,.22) 100%), ${hexToRgba(color, 0.5)}`,
        boxShadow: `inset 0 0 0 1.5px ${hexToRgba(color, 0.85)}, inset 0 0 14px ${hexToRgba(color, 0.55)}`,
        backdropFilter: "blur(3px) saturate(1.4)",
      }}
    >
      {/* the nib + holder, seen through the plastic */}
      <svg
        className="absolute inset-0"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
      >
        <defs>
          <linearGradient id={nibGrad} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor={color} stopOpacity="1" />
            <stop offset="1" stopColor="#000" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {/* collar */}
        <rect
          x={W * 0.2}
          y={H * 0.68}
          width={W * 0.6}
          height={H * 0.32}
          fill={color}
          opacity="0.75"
        />
        <rect
          x={W * 0.2}
          y={H * 0.68}
          width={W * 0.6}
          height={H * 0.32}
          fill={`url(#${nibGrad})`}
          opacity="0.6"
        />
        {/* holder */}
        <rect
          x={W * 0.3}
          y={H * 0.5}
          width={W * 0.4}
          height={H * 0.19}
          fill={color}
          opacity="0.9"
        />
        <rect
          x={W * 0.3}
          y={H * 0.5}
          width={W * 0.4}
          height={H * 0.19}
          fill={`url(#${nibGrad})`}
          opacity="0.55"
        />
        {/* chisel tip, higher on the left */}
        <path
          d={`M ${W * 0.36} ${H * 0.51} L ${W * 0.36} ${H * 0.16} L ${W * 0.64} ${H * 0.3} L ${W * 0.64} ${H * 0.51} Z`}
          fill={color}
        />
        <path
          d={`M ${W * 0.36} ${H * 0.51} L ${W * 0.36} ${H * 0.16} L ${W * 0.64} ${H * 0.3} L ${W * 0.64} ${H * 0.51} Z`}
          fill={`url(#${nibGrad})`}
          opacity="0.6"
        />
        <path
          d={`M ${W * 0.36} ${H * 0.16} L ${W * 0.64} ${H * 0.3}`}
          stroke="#fff"
          strokeOpacity="0.6"
          strokeWidth="1.2"
        />
      </svg>
      {/* inner wall of the cap — the plastic's thickness, slightly refracting */}
      <div
        className="absolute top-2 bottom-2 left-[5px] w-[2px] rounded-full"
        style={{ background: hexToRgba(color, 0.9), filter: "blur(.4px)" }}
      />
      <div
        className="absolute top-2 bottom-2 right-[5px] w-[2px] rounded-full"
        style={{ background: "rgba(0,0,0,.18)" }}
      />
      <Ridges width={W} top={10} bottom={12} strength={0.35} />
      {/* specular streak + top dome */}
      <div
        className="absolute top-1 bottom-2 left-[22%] w-[5px] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,.75), rgba(255,255,255,.25))",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-4"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,0))",
        }}
      />
      {/* opaque moulded ring at the open end */}
      <div
        className="absolute inset-x-0 bottom-0 h-[8px]"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,.35), rgba(0,0,0,.18)), ${hexToRgba(color, 0.95)}`,
        }}
      />
    </div>
  );
}

function EraserShape() {
  return (
    <div style={{ width: ERASER_W }}>
      <div
        className="relative overflow-hidden"
        style={{
          height: ERASER_TOP_H,
          borderRadius: "18px 18px 0 0 / 14px 14px 0 0",
          background: WHITE_MATTE,
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-5"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,0))",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-3"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.12))",
          }}
        />
      </div>
      <div
        className="relative"
        style={{
          height: ERASER_BASE_H,
          background:
            "linear-gradient(90deg, #000 0%, #1d1f23 14%, #3b3e44 28%, #23252a 45%, #121316 75%, #000 100%)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: "rgba(255,255,255,.18)" }}
        />
      </div>
    </div>
  );
}

type Side = ToolbarPosition;

// Which way the open end of the toolbar faces (i.e. which screen edge the
// stationery pokes out of), and how each piece is turned so its cap always
// points at the board.
const ITEM_POSE: Record<Side, { rotate: number; scaleY: number }> = {
  bottom: { rotate: 0, scaleY: 1 },
  top: { rotate: 0, scaleY: -1 }, // flipped vertically: caps hang down
  left: { rotate: 90, scaleY: 1 }, // caps point right
  right: { rotate: -90, scaleY: 1 }, // caps point left
};

function isVertical(side: Side) {
  return side === "left" || side === "right";
}

// One piece of stationery: rests with only its top showing, rises on hover,
// sits a little raised while it's the active tool. `visible` is how much
// of it shows at rest; the rest of its `length` runs off-screen.
function StationeryItem({
  side,
  width,
  length,
  visible,
  label,
  active,
  glow,
  onClick,
  children,
}: {
  side: Side;
  width: number;
  length: number;
  visible: number;
  label: string;
  active: boolean;
  glow: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const lift =
    (active ? SELECTED_LIFT : 0) +
    (hovered ? HOVER_LIFT - (active ? 16 : 0) : 0);
  const vertical = isVertical(side);

  // Place the un-turned pen (width × length, cap at its top) so that once
  // turned, its cap end sits flush with the board side of this slot.
  let left = 0;
  let top = 0;
  if (side === "top") top = visible - length;
  if (side === "left") {
    left = visible - length / 2 - width / 2;
    top = width / 2 - length / 2;
  }
  if (side === "right") {
    left = length / 2 - width / 2;
    top = width / 2 - length / 2;
  }
  const { rotate, scaleY } = ITEM_POSE[side];
  const move =
    side === "bottom"
      ? { x: 0, y: -lift }
      : side === "top"
        ? { x: 0, y: lift }
        : side === "left"
          ? { x: lift, y: 0 }
          : { x: -lift, y: 0 };

  return (
    <div
      className="relative shrink-0"
      style={vertical ? { width: visible, height: width } : { width, height: visible }}
    >
      <motion.button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        initial={false}
        animate={{ ...move, rotate, scaleY }}
        transition={LIFT_TRANSITION}
        className="pointer-events-auto absolute block cursor-pointer outline-none"
        style={{
          left,
          top,
          width,
          height: length,
          filter: `drop-shadow(0 10px 14px rgba(0,0,0,${hovered || active ? 0.5 : 0.38}))${
            active ? ` drop-shadow(0 0 14px ${glow})` : ""
          }`,
          transition: "filter .3s ease",
        }}
      >
        {children}
      </motion.button>
    </div>
  );
}

// Popovers open toward the board, centred on whatever spawned them.
const POPOVER_CENTER: Record<Side, string> = {
  bottom: "left-1/2 -translate-x-1/2",
  top: "left-1/2 -translate-x-1/2",
  left: "top-1/2 -translate-y-1/2",
  right: "top-1/2 -translate-y-1/2",
};

function Popover({
  side,
  gap = 12,
  children,
  className = "",
}: {
  side: Side;
  gap?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute z-10 rounded-2xl border border-white/15 p-2 text-sm text-white/85 shadow-2xl ${POPOVER_CENTER[side]} ${className}`}
      style={{
        [side]: `calc(100% + ${gap}px)`,
        background: "rgba(20,22,30,0.9)",
        backdropFilter: "blur(16px)",
      }}
    >
      {children}
    </div>
  );
}

// The tools panel is a tab whose open (square) side sits on the screen edge.
const PANEL_SHAPE: Record<Side, string> = {
  bottom: "h-[76px] flex-row rounded-t-[28px] border-b-0 px-5",
  top: "h-[76px] flex-row rounded-b-[28px] border-t-0 px-5",
  left: "w-[76px] flex-col !gap-0.5 rounded-r-[28px] border-l-0 py-4",
  right: "w-[76px] flex-col !gap-0.5 rounded-l-[28px] border-r-0 py-4",
};

const SHAPE_IDS = new Set(SHAPE_BUTTONS.map((b) => b.id));

// Space kept clear at each end of the toolbar so it never runs under the
// sticky-note pad (bottom-left corner) or the top-right toolbar.
const RESERVE: Record<Side, { start: number; end: number }> = {
  bottom: { start: PAD_RESERVE_LEFT, end: EDGE_MARGIN },
  top: { start: EDGE_MARGIN, end: 330 },
  left: { start: EDGE_MARGIN, end: PAD_RESERVE_LEFT },
  right: { start: 90, end: EDGE_MARGIN },
};

const ORIGIN: Record<Side, string> = {
  bottom: "50% 100%",
  top: "50% 0%",
  left: "0% 50%",
  right: "100% 50%",
};

const ENTER_FROM: Record<Side, { x: number; y: number }> = {
  bottom: { x: 0, y: 140 },
  top: { x: 0, y: -140 },
  left: { x: -140, y: 0 },
  right: { x: 140, y: 0 },
};

export default function StationeryToolbar() {
  const side = useBoardStore((s) => s.toolbarPosition);
  const vertical = isVertical(side);
  const theme = useBoardStore((s) => s.theme);
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const toolSettings = useBoardStore((s) => s.toolSettings);
  const setColor = useBoardStore((s) => s.setColor);
  const setThickness = useBoardStore((s) => s.setThickness);
  const setHighlighterColor = useBoardStore((s) => s.setHighlighterColor);
  const highlighterColor = useBoardStore((s) => s.highlighterColor);
  const markerCount = useBoardStore((s) => s.markerCount);
  const highlighterCount = useBoardStore((s) => s.highlighterCount);
  const markerSlotColors = useBoardStore((s) => s.markerSlotColors);
  const highlighterSlotColors = useBoardStore((s) => s.highlighterSlotColors);
  const activeMarkerSlot = useBoardStore((s) => s.activeMarkerSlot);
  const activeHighlighterSlot = useBoardStore((s) => s.activeHighlighterSlot);
  const selectMarkerSlot = useBoardStore((s) => s.selectMarkerSlot);
  const selectHighlighterSlot = useBoardStore((s) => s.selectHighlighterSlot);
  const setMarkerSlotColor = useBoardStore((s) => s.setMarkerSlotColor);
  const setHighlighterSlotColor = useBoardStore(
    (s) => s.setHighlighterSlotColor,
  );
  const eraserMode = useBoardStore((s) => s.eraserMode);
  const setEraserMode = useBoardStore((s) => s.setEraserMode);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const triggerMistify = useBoardStore((s) => s.triggerMistify);
  const clearGlassBoard = useBoardStore((s) => s.clearGlassBoard);
  const selectedId = useBoardStore((s) => s.selectedId);
  const deleteSelected = useBoardStore((s) => s.deleteSelected);
  const duplicateObject = useBoardStore((s) => s.duplicateObject);

  const [openMenu, setOpenMenu] = useState<
    "shapes" | "eraser" | "color" | null
  >(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Shrink the whole set uniformly on small screens rather than overflow.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const { start, end } = RESERVE[side];
    const fit = () => {
      const available = (vertical ? window.innerHeight : window.innerWidth) - start - end;
      const needed = vertical ? row.offsetHeight : row.offsetWidth;
      setScale(Math.min(1, available / needed));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [side, vertical]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node))
        setOpenMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  // What the colour picker is editing depends on the active tool.
  const pickerContext: "marker" | "highlighter" | "other" =
    tool === "pen"
      ? "marker"
      : tool === "highlighter"
        ? "highlighter"
        : "other";
  const pickerColor =
    pickerContext === "marker"
      ? markerSlotColors[activeMarkerSlot]
      : pickerContext === "highlighter"
        ? highlighterColor
        : toolSettings.color;
  const pickerTitle =
    pickerContext === "marker"
      ? "Marker colour"
      : pickerContext === "highlighter"
        ? "Highlighter colour"
        : tool === "text"
          ? "Text colour"
          : SHAPE_IDS.has(tool)
            ? "Shape colour"
            : "Shape & text colour";
  const pickColor = (c: string) => {
    if (pickerContext === "marker") {
      setMarkerSlotColor(activeMarkerSlot, c);
      setColor(c);
    } else if (pickerContext === "highlighter") {
      setHighlighterSlotColor(activeHighlighterSlot, c);
      setHighlighterColor(c);
    } else {
      setColor(c);
    }
  };
  const swatches =
    pickerContext === "highlighter" ? PICKER_NEON_COLORS : PICKER_MARKER_COLORS;
  // On Mist only highlighters have a colour; pens, shapes and text just clear fog.
  const colorless = theme === "mist" && pickerContext !== "highlighter";
  const shownPickerColor = colorless ? MIST_MARKER_CAP : pickerColor;

  const isShapeTool = SHAPE_IDS.has(tool);

  const groupGap = vertical ? GROUP_GAP_VERTICAL : GROUP_GAP;
  // Every group hugs the screen edge the toolbar lives on.
  const alignEdge = side === "bottom" || side === "right" ? "flex-end" : "flex-start";
  const groupStyle = (gapBefore: number): CSSProperties => ({
    display: "flex",
    flexDirection: vertical ? "column" : "row",
    alignItems: alignEdge,
    gap: vertical ? ITEM_GAP_VERTICAL : ITEM_GAP,
    ...(vertical ? { marginTop: gapBefore } : { marginLeft: gapBefore }),
  });
  const markerGeom = {
    side,
    width: MARKER_W,
    length: MARKER_CAP_H + PEN_BODY_H,
    visible: MARKER_CAP_H + MARKER_REST_BODY,
  };
  const hlGeom = {
    side,
    width: HL_W,
    length: HL_CAP_H + PEN_BODY_H,
    visible: HL_CAP_H + HL_REST_BODY,
  };
  const divider = vertical ? "my-1.5 h-px w-8 bg-white/15" : "mx-1.5 h-8 w-px bg-white/15";

  return (
    // overflow: clip (not hidden) so the off-screen barrels can never make
    // anything scrollable — e.g. focusing a pen won't scroll the board.
    <div
      className="pointer-events-none absolute inset-0 z-30 flex overflow-clip"
      style={{
        justifyContent: vertical ? (side === "left" ? "flex-start" : "flex-end") : "center",
        alignItems: vertical ? "center" : side === "top" ? "flex-start" : "flex-end",
        ...(vertical
          ? { paddingTop: RESERVE[side].start, paddingBottom: RESERVE[side].end }
          : { paddingLeft: RESERVE[side].start, paddingRight: RESERVE[side].end }),
      }}
    >
      <motion.div
        key={side}
        initial={ENTER_FROM[side]}
        animate={{ x: 0, y: 0 }}
        transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
      >
        <div
          ref={rowRef}
          className="flex"
          style={{
            flexDirection: vertical ? "column" : "row",
            alignItems: alignEdge,
            transform: `scale(${scale})`,
            transformOrigin: ORIGIN[side],
          }}
        >
          {/* Markers */}
          <div style={groupStyle(0)}>
            {theme === "mist" ? (
              // Mist ink has no colour — it just clears the fog — so the
              // mist board gets a single black-capped marker.
              <StationeryItem
                label="Marker"
                {...markerGeom}
                active={tool === "pen"}
                glow="rgba(255,255,255,.35)"
                onClick={() => {
                  setTool("pen");
                  setOpenMenu(null);
                }}
              >
                <MarkerCap color={MIST_MARKER_CAP} />
                <WhiteBody width={MARKER_W} height={PEN_BODY_H} />
              </StationeryItem>
            ) : (
              markerSlotColors.slice(0, markerCount).map((c, i) => (
                <StationeryItem
                  key={`m${i}`}
                  label={`Marker ${i + 1}`}
                  {...markerGeom}
                  active={tool === "pen" && activeMarkerSlot === i}
                  glow={hexToRgba(c, 0.55)}
                  onClick={() => {
                    selectMarkerSlot(i);
                    setOpenMenu(null);
                  }}
                >
                  <MarkerCap color={c} />
                  <WhiteBody width={MARKER_W} height={PEN_BODY_H} />
                </StationeryItem>
              ))
            )}
          </div>

          {/* Highlighters */}
          <div style={groupStyle(groupGap)}>
            {highlighterSlotColors.slice(0, highlighterCount).map((c, i) => (
              <StationeryItem
                key={`h${i}`}
                label={`Highlighter ${i + 1}`}
                {...hlGeom}
                active={tool === "highlighter" && activeHighlighterSlot === i}
                glow={hexToRgba(c, 0.7)}
                onClick={() => {
                  selectHighlighterSlot(i);
                  setOpenMenu(null);
                }}
              >
                <HighlighterCap color={c} />
                <WhiteBody width={HL_W} height={PEN_BODY_H} />
              </StationeryItem>
            ))}
          </div>

          {/* Eraser — click again while it's active for the erase mode */}
          <div
            className="relative"
            style={vertical ? { marginTop: groupGap } : { marginLeft: groupGap }}
          >
            <StationeryItem
              label={
                tool === "eraser"
                  ? "Eraser — click again for erase mode"
                  : "Eraser"
              }
              side={side}
              width={ERASER_W}
              length={ERASER_TOP_H + ERASER_BASE_H}
              visible={ERASER_TOP_H + ERASER_REST_BASE}
              active={tool === "eraser"}
              glow="rgba(255,255,255,.45)"
              onClick={() => {
                if (tool === "eraser")
                  setOpenMenu((m) => (m === "eraser" ? null : "eraser"));
                else {
                  setTool("eraser");
                  setOpenMenu(null);
                }
              }}
            >
              <EraserShape />
            </StationeryItem>
            {openMenu === "eraser" && (
              <Popover
                side={side}
                gap={SELECTED_LIFT + 12}
                className="pointer-events-auto w-40 !p-0 overflow-hidden"
              >
                {(
                  [
                    ["ink", "Erase Ink"],
                    ["shape", "Erase Shape"],
                    ["all", "Erase All"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={`block w-full px-3 py-2 text-left hover:bg-white/10 ${eraserMode === mode ? "text-white" : "text-white/70"}`}
                    onClick={() => {
                      setEraserMode(mode);
                      setOpenMenu(null);
                    }}
                  >
                    {eraserMode === mode ? "● " : "○ "}
                    {label}
                  </button>
                ))}
              </Popover>
            )}
          </div>

          {/* Other tools — a separate dark glass panel */}
          <div
            className={`pointer-events-auto relative flex items-center gap-1.5 border border-white/15 ${PANEL_SHAPE[side]}`}
            style={{
              ...(vertical ? { marginTop: 18 } : { marginLeft: 26 }),
              background:
                "linear-gradient(180deg, rgba(40,44,56,.5), rgba(22,24,32,.55))",
              backdropFilter: "blur(18px) saturate(1.2)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.12), 0 -6px 24px rgba(0,0,0,.18)",
            }}
          >
            <ToolButton
              active={tool === "select"}
              label="Select"
              icon="↖"
              onClick={() => setTool("select")}
            />

            <div className="relative">
              <ToolButton
                active={isShapeTool}
                label="Shapes"
                icon="◈"
                onClick={() =>
                  setOpenMenu((m) => (m === "shapes" ? null : "shapes"))
                }
              />
              {openMenu === "shapes" && (
                <Popover side={side} className={`flex gap-1 !p-1.5 ${vertical ? "flex-col" : ""}`}>
                  {SHAPE_BUTTONS.map((b) => (
                    <ToolButton
                      key={b.id}
                      active={tool === b.id}
                      label={b.label}
                      icon={b.icon}
                      onClick={() => {
                        setTool(b.id);
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </Popover>
              )}
            </div>

            <ToolButton
              active={tool === "text"}
              label="Text"
              icon="T"
              onClick={() => setTool("text")}
            />

            <div className="relative">
              <button
                title={pickerTitle}
                onClick={() =>
                  setOpenMenu((m) => (m === "color" ? null : "color"))
                }
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  openMenu === "color" ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <span
                  className="block h-5 w-5 rounded-full border-2 border-white/80"
                  style={{
                    backgroundColor: shownPickerColor,
                    boxShadow:
                      pickerContext === "highlighter"
                        ? `0 0 10px ${pickerColor}`
                        : undefined,
                  }}
                />
              </button>
              {openMenu === "color" && (
                <Popover side={side} className="w-60 !p-3">
                  <div className="mb-2 text-xs text-white/60">
                    {pickerTitle}
                  </div>
                  {!colorless && (
                    <div className="grid grid-cols-7 gap-1.5">
                      {swatches.map((c) => (
                        <button
                          key={c}
                          title={c}
                          onClick={() => pickColor(c)}
                          className={`h-6 w-6 rounded-full border transition-transform ${
                            pickerColor.toLowerCase() === c.toLowerCase()
                              ? "scale-110 border-white"
                              : "border-white/25 hover:scale-105"
                          }`}
                          style={{
                            backgroundColor: c,
                            boxShadow:
                              pickerContext === "highlighter"
                                ? `0 0 8px ${c}99`
                                : undefined,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {pickerContext !== "highlighter" && !colorless && (
                    <label className="mt-3 flex items-center justify-between text-xs text-white/60">
                      Custom
                      <input
                        type="color"
                        value={pickerColor}
                        onChange={(e) => pickColor(e.target.value)}
                        className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                    </label>
                  )}
                  {colorless && (
                    <div className="text-[11px] leading-snug text-white/45">
                      On Mist, pens, shapes and text clear the fog instead of
                      using ink colour.
                    </div>
                  )}
                  <label className="mt-3 block text-xs text-white/60">
                    Size
                    <input
                      type="range"
                      min={1}
                      max={24}
                      value={toolSettings.thickness}
                      onChange={(e) => setThickness(Number(e.target.value))}
                      className="mt-1 block w-full accent-white"
                    />
                  </label>
                </Popover>
              )}
            </div>

            <div className={divider} />

            <ToolButton active={false} label="Undo" icon="↺" onClick={undo} />
            <ToolButton active={false} label="Redo" icon="↻" onClick={redo} />

            <div className={divider} />

            {theme === "mist" ? (
              <ToolButton
                active={false}
                label="Mistify Again — re-fog the whole board (keeps notes, text & shapes)"
                icon={<MistifyIcon />}
                onClick={triggerMistify}
              />
            ) : (
              <ToolButton
                active={false}
                label="Clear Board — wipe all ink (keeps notes, text & shapes)"
                icon={<ClearBoardIcon />}
                onClick={clearGlassBoard}
              />
            )}

            {selectedId && (
              <>
                <div className={divider} />
                <ToolButton
                  active={false}
                  label="Duplicate"
                  icon="⧉"
                  onClick={() => duplicateObject(selectedId)}
                />
                <ToolButton
                  active={false}
                  label="Delete"
                  icon="✕"
                  onClick={deleteSelected}
                />
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
