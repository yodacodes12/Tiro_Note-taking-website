export type Theme = "mist" | "glass";

export type ToolbarStyle = "2d" | "3d";
export type ToolbarPosition = "bottom" | "right" | "left" | "top";

export type ToolId =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "line"
  | "arrow"
  | "freeArrow"
  | "rectangle"
  | "ellipse";

export interface Point {
  x: number;
  y: number;
}

interface BaseObject {
  id: string;
  rotation: number; // degrees
  zIndex: number;
}

export interface StrokeObject extends BaseObject {
  type: "stroke";
  points: Point[];
  color: string;
  thickness: number;
  erasing?: boolean; // mist clearing stroke vs ink stroke
  highlighter?: boolean; // translucent highlighter mark, drawn on its own layer
}

export interface TextObjectData extends BaseObject {
  type: "text";
  x: number;
  y: number;
  width: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  align: "left" | "center" | "right";
  underline: boolean;
}

export interface ShapeObjectData extends BaseObject {
  type: "shape";
  shape: "line" | "arrow" | "freeArrow" | "rectangle" | "ellipse";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness: number;
  // Only present for "freeArrow": the full freehand path the user drew,
  // with an arrowhead rendered at the final point's direction of travel.
  points?: Point[];
}

export interface StickyNoteData extends BaseObject {
  type: "sticky";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

// A free-flow eraser pass over vector shapes. Stored as board-coordinate
// points, like a stroke, but rendered by each ShapeObject as a local SVG
// mask cutout rather than as a visible mark of its own. Scoped to the
// shapes it actually overlapped at erase-time (targetShapeIds), so it
// never masks a different, later-drawn shape that happens to occupy the
// same area.
export interface ShapeEraseStrokeData extends BaseObject {
  type: "shapeErase";
  points: Point[];
  thickness: number;
  targetShapeIds: string[];
}

export type BoardObject =
  | StrokeObject
  | TextObjectData
  | ShapeObjectData
  | StickyNoteData
  | ShapeEraseStrokeData;

export type EraserMode = "ink" | "shape" | "all";

// A single board "page". The user can have any number of these; each is a
// fully independent canvas (own theme, own objects, own backgrounds).
export interface BoardPageData {
  id: string;
  theme: Theme;
  objects: BoardObject[];
  glassBackground: string;
  glassOpacity: number; // 0 (opaque) – 100 (fully transparent)
  mistBackground: string | null; // null = the default dark bokeh-window scene
}

export interface BoardState {
  pages: BoardPageData[];
  currentPageIndex: number;
}

export const DEFAULT_GLASS_BACKGROUND = "/backgrounds/nature-default.jpg";

// In Mist mode, ink (pen, shapes, text) is meant to read as bare clearings
// in the condensation rather than coloured marker strokes — so everything
// drawn there uses this one fixed, hue-less tone instead of the user's
// chosen marker colour. High-opacity and only very lightly softened (see
// the blur filters in ShapeObject/TextObject), so a stroke reads as a full
// wiped-clear patch of glass, not a faint coloured smudge.
export const MIST_INK_COLOR = "rgba(240,247,249,0.82)";

export const STICKY_COLORS = [
  "#ffd43b", // vivid sticky-note yellow
  "#7af0c0", // bright mint green
  "#5cc8ff", // bright sky blue
  "#ff7a9c", // hot pink
  "#ffa64d", // vivid orange
  "#c89bff", // bright violet
];

// Saturated, glowing "glass marker" colours — closer to real dry-erase /
// window marker ink than muted UI swatches.
// Fluorescent highlighter inks — drawn translucent, so these are the
// saturated "neon" bases, not pastel versions.
export const HIGHLIGHTER_COLORS = [
  "#fff200", // yellow
  "#39ff14", // green
  "#00c8ff", // blue
  "#ff3d6e", // red / pink
  "#c77dff", // lavender
  "#ff9500", // orange
];

export const MARKER_COLORS = [
  "#15171c", // near-black ink
  "#ff2d78", // vivid magenta/pink
  "#2979ff", // vivid blue
  "#ffd60a", // golden yellow
  "#2fe88f", // vivid emerald green
  "#b14bff", // vivid purple
  "#ffffff", // white (mist / dark glass)
];

// ── 3D stationery toolbar ──────────────────────────────────────────────
export const MAX_MARKERS = 7;
export const MAX_HIGHLIGHTERS = 5;
export const DEFAULT_MARKER_COUNT = 5;
export const DEFAULT_HIGHLIGHTER_COUNT = 3;

// Cap colours for each marker slot (only the first `markerCount` show).
export const DEFAULT_MARKER_SLOT_COLORS = [
  "#e8302a", // red
  "#2a6fe8", // blue
  "#2dbf2f", // green
  "#7c3ae6", // purple
  "#1b1d22", // black
  "#ff7a12", // orange
  "#ff3d8b", // pink
];

// Translucent neon cap colours for each highlighter slot.
export const DEFAULT_HIGHLIGHTER_SLOT_COLORS = [
  "#f2ff1a", // neon yellow
  "#5dff1f", // neon green
  "#ff2bd6", // neon pink
  "#00c8ff", // neon blue
  "#ff9500", // neon orange
];

// What the 3D toolbar's colour picker offers for markers, shapes and text.
export const PICKER_MARKER_COLORS = [
  "#e8302a", "#ff7a12", "#f5c400", "#2dbf2f", "#14b8a6", "#2a6fe8", "#4338ca",
  "#7c3ae6", "#d946ef", "#ff3d8b", "#8b5a2b", "#1b1d22", "#6b7280", "#ffffff",
];

// …and the special neon set, offered only for highlighters.
export const PICKER_NEON_COLORS = [
  "#f2ff1a", "#c6ff1a", "#5dff1f", "#39ff14", "#00ffc8",
  "#00c8ff", "#4d7cff", "#c77dff", "#ff2bd6", "#ff3d6e", "#ff9500",
];
