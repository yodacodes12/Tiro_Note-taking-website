import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  BoardObject,
  BoardPageData,
  EraserMode,
  Point,
  ShapeObjectData,
  StickyNoteData,
  TextObjectData,
  Theme,
  ToolbarPosition,
  ToolbarStyle,
  ToolId,
} from "../types";
import {
  DEFAULT_HIGHLIGHTER_COUNT,
  DEFAULT_HIGHLIGHTER_SLOT_COLORS,
  DEFAULT_MARKER_COUNT,
  DEFAULT_MARKER_SLOT_COLORS,
  MAX_HIGHLIGHTERS,
  MAX_MARKERS,
} from "../types";

function pointsBoundingBox(points: Point[], pad: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  };
}

function boxesOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number }
) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
import { DEFAULT_GLASS_BACKGROUND, HIGHLIGHTER_COLORS } from "../types";
import { saveBoard } from "../persistence/db";
import { playStickyRemove } from "../lib/sounds";

interface HistoryEntry {
  objects: BoardObject[];
  // The mist fog mask (as a data URL) at the moment this entry was
  // committed — present only when the page is themed "mist", so undo/redo
  // can restore condensation wiped by the pen alongside the object list,
  // instead of leaving fog changes outside the undo timeline entirely.
  // Absent (not just empty-string) on entries recorded before this existed.
  mistMask?: string | null;
}

// The mist mask lives on an offscreen canvas owned by DrawingCanvas, not in
// store state (it's not serializable board data) — so DrawingCanvas
// registers this getter/setter/carve bundle here for commit/undo/redo (and
// shape/text placement) to call. A plain module-level variable, not store
// state, since it holds functions and changing it should never trigger a
// re-render.
interface MistTextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  align: "left" | "center" | "right";
}
type MistMaskIO = {
  get: () => string | null;
  restore: (data: string | null) => void;
  // Shapes/text in Mist are meant to read as genuine clearings in the fog —
  // the same destination-out carve the pen makes — not a coloured overlay
  // sitting on top of it, so placing one also wipes its outline/glyphs
  // directly into the condensation mask.
  carveStroke: (points: Point[], thickness: number) => void;
  carveText: (x: number, y: number, width: number, height: number, text: string, style: MistTextStyle) => void;
};
let mistMaskIO: MistMaskIO | null = null;

// Per-page copy of each Mist board's condensation mask. DrawingCanvas
// remounts on every page switch (and export walks through every page), so
// without this a page's mist ink would be wiped the moment you left it.
// In-memory only: it lives for the session and is gone on reload.
const mistMaskByPage = new Map<string, HTMLCanvasElement>();

export function saveMistMask(pageId: string, mask: HTMLCanvasElement) {
  let copy = mistMaskByPage.get(pageId);
  if (!copy) {
    copy = document.createElement("canvas");
    mistMaskByPage.set(pageId, copy);
  }
  copy.width = mask.width;
  copy.height = mask.height;
  const ctx = copy.getContext("2d")!;
  ctx.clearRect(0, 0, copy.width, copy.height);
  ctx.drawImage(mask, 0, 0);
}

export function loadMistMask(pageId: string): HTMLCanvasElement | undefined {
  return mistMaskByPage.get(pageId);
}

interface ToolSettings {
  color: string;
  thickness: number;
}

function emptyPage(theme: Theme = "glass"): BoardPageData {
  return {
    id: uuid(),
    theme,
    objects: [],
    glassBackground: DEFAULT_GLASS_BACKGROUND,
    glassOpacity: 55,
    mistBackground: null,
  };
}

interface BoardStore {
  // Multi-board state: `pages` holds every board page; the fields below
  // (theme, objects, glassBackground, ...) always mirror pages[currentPageIndex]
  // — kept flat so the rest of the app can read/write "the current board"
  // without needing to know pages exist at all. Switching pages snapshots
  // these flat fields back into `pages` and loads the target page's data
  // into them.
  pages: BoardPageData[];
  currentPageIndex: number;
  // Ephemeral: which way the board-switch animation should slide. Cleared
  // once the transition has played.
  pageTransition: "next" | "prev" | null;
  // If goToPage is called again while a transition is still playing, the
  // request is queued here instead of overlapping it — each slide then
  // plays out in full before the next one starts, so rapid clicks (e.g.
  // stepping board 1 -> board 4) stay smooth instead of jumping/glitching.
  queuedPageIndex: number | null;
  // Bumped on every transition start. The exiting *and* entering page both
  // fire their own onAnimationComplete around the same time; each call is
  // tagged with the id current when it was scheduled, so a late call from
  // an already-superseded transition can't clear a newer one's state.
  pageTransitionId: number;

  theme: Theme;
  objects: BoardObject[];
  glassBackground: string;
  glassOpacity: number;
  mistBackground: string | null;
  tool: ToolId;
  eraserMode: EraserMode;
  toolSettings: ToolSettings;
  selectedId: string | null;
  fallingStickyId: string | null;
  activeShapeErasePoints: Point[] | null;
  history: HistoryEntry[];
  historyIndex: number;
  hydrated: boolean;
  // Bumped to signal "Mistify Again" — the mist condensation layer is
  // ephemeral canvas state (not board data), so it's a nonce the
  // drawing layer watches, not something persisted/undoable here.
  mistifyNonce: number;
  // App-level UI preferences (not per board). Behaviour for these is not
  // wired up yet — only the choice itself is stored.
  toolbarStyle: ToolbarStyle;
  toolbarPosition: ToolbarPosition;
  highlighterColor: string;
  // 3D stationery toolbar
  markerCount: number;
  highlighterCount: number;
  markerSlotColors: string[];
  highlighterSlotColors: string[];
  activeMarkerSlot: number;
  activeHighlighterSlot: number;
  setMarkerCount: (n: number) => void;
  setHighlighterCount: (n: number) => void;
  selectMarkerSlot: (i: number) => void;
  selectHighlighterSlot: (i: number) => void;
  setMarkerSlotColor: (i: number, color: string) => void;
  setHighlighterSlotColor: (i: number, color: string) => void;

  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setGlassBackground: (url: string) => void;
  setGlassOpacity: (value: number) => void;
  setHighlighterColor: (color: string) => void;
  setToolbarStyle: (style: ToolbarStyle) => void;
  setToolbarPosition: (position: ToolbarPosition) => void;
  setMistBackground: (url: string | null) => void;
  setTool: (tool: ToolId) => void;
  setEraserMode: (mode: EraserMode) => void;
  setColor: (color: string) => void;
  setThickness: (thickness: number) => void;
  setSelected: (id: string | null) => void;

  addObject: (obj: BoardObject) => void;
  updateObject: (id: string, patch: Partial<BoardObject>) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  deleteSelected: () => void;
  startStickyFall: (id: string) => void;
  finishStickyFall: (id: string) => void;

  beginShapeErase: (point: Point) => void;
  extendShapeErase: (point: Point) => void;
  commitShapeErase: (thickness: number) => void;
  triggerMistify: () => void;
  clearGlassBoard: () => void;

  addPage: () => void;
  goToPage: (index: number) => void;
  clearPageTransition: (id: number) => void;
  snapshotLivePageIntoPages: () => void;
  exportJumpToPage: (index: number) => void;

  commit: () => void; // push current state onto history (call after a gesture ends)
  undo: () => void;
  redo: () => void;
  registerMistMaskIO: (io: MistMaskIO) => void;
  unregisterMistMaskIO: (io: MistMaskIO) => void;
  carveMistStroke: (points: Point[], thickness: number) => void;
  carveMistText: (x: number, y: number, width: number, height: number, text: string, style: MistTextStyle) => void;

  nextZIndex: () => number;
}

// Snapshot the store's flat "current page" fields into a BoardPageData,
// preserving the target page's id.
function snapshotCurrentPage(s: BoardStore, id: string): BoardPageData {
  return {
    id,
    theme: s.theme,
    objects: s.objects,
    glassBackground: s.glassBackground,
    glassOpacity: s.glassOpacity,
    mistBackground: s.mistBackground,
  };
}

function flatFieldsFromPage(page: BoardPageData) {
  return {
    theme: page.theme,
    objects: page.objects,
    glassBackground: page.glassBackground || DEFAULT_GLASS_BACKGROUND,
    glassOpacity: page.glassOpacity ?? 55,
    mistBackground: page.mistBackground ?? null,
  };
}

function persistPages(get: () => BoardStore) {
  const s = get();
  const pages = s.pages.map((p, i) => (i === s.currentPageIndex ? snapshotCurrentPage(s, p.id) : p));
  void saveBoard({ pages, currentPageIndex: s.currentPageIndex });
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  pages: [emptyPage()],
  currentPageIndex: 0,
  pageTransition: null,
  queuedPageIndex: null,
  pageTransitionId: 0,

  theme: "glass",
  objects: [],
  glassBackground: DEFAULT_GLASS_BACKGROUND,
  glassOpacity: 55,
  mistBackground: null,
  tool: "select",
  eraserMode: "ink",
  toolSettings: { color: "#15171c", thickness: 4 },
  selectedId: null,
  fallingStickyId: null,
  activeShapeErasePoints: null,
  history: [{ objects: [] }],
  historyIndex: 0,
  hydrated: false,
  mistifyNonce: 0,
  toolbarStyle: "2d",
  toolbarPosition: "bottom",
  highlighterColor: HIGHLIGHTER_COLORS[0],
  markerCount: DEFAULT_MARKER_COUNT,
  highlighterCount: DEFAULT_HIGHLIGHTER_COUNT,
  markerSlotColors: [...DEFAULT_MARKER_SLOT_COLORS],
  highlighterSlotColors: [...DEFAULT_HIGHLIGHTER_SLOT_COLORS],
  activeMarkerSlot: 0,
  activeHighlighterSlot: 0,

  hydrate: async () => {
    // Every launch starts clean: a single, empty Glass board — no restored
    // pages, ink, notes, or theme from a previous visit. (saveBoard() still
    // runs during the session in case that changes again, but it's never
    // read back on load.)
    set({ pages: [emptyPage()], currentPageIndex: 0, hydrated: true });
  },

  setTheme: (theme) => {
    set({ theme });
    persistPages(get);
  },

  setGlassBackground: (url) => {
    set({ glassBackground: url });
    persistPages(get);
  },

  setHighlighterColor: (highlighterColor) => set({ highlighterColor }),
  setToolbarStyle: (toolbarStyle) => set({ toolbarStyle }),
  setToolbarPosition: (toolbarPosition) => set({ toolbarPosition }),

  setMarkerCount: (n) => {
    const markerCount = Math.max(1, Math.min(MAX_MARKERS, Math.round(n)));
    set((s) => ({ markerCount, activeMarkerSlot: Math.min(s.activeMarkerSlot, markerCount - 1) }));
  },
  setHighlighterCount: (n) => {
    const highlighterCount = Math.max(1, Math.min(MAX_HIGHLIGHTERS, Math.round(n)));
    set((s) => ({ highlighterCount, activeHighlighterSlot: Math.min(s.activeHighlighterSlot, highlighterCount - 1) }));
  },
  // Picking up a marker = pen in that cap's colour; a highlighter = the
  // highlighter tool in its neon colour.
  selectMarkerSlot: (i) =>
    set((s) => ({
      tool: "pen",
      selectedId: null,
      activeMarkerSlot: i,
      toolSettings: { ...s.toolSettings, color: s.markerSlotColors[i] },
    })),
  selectHighlighterSlot: (i) =>
    set((s) => ({
      tool: "highlighter",
      selectedId: null,
      activeHighlighterSlot: i,
      highlighterColor: s.highlighterSlotColors[i],
    })),
  setMarkerSlotColor: (i, color) =>
    set((s) => {
      const markerSlotColors = s.markerSlotColors.slice();
      markerSlotColors[i] = color;
      return { markerSlotColors };
    }),
  setHighlighterSlotColor: (i, color) =>
    set((s) => {
      const highlighterSlotColors = s.highlighterSlotColors.slice();
      highlighterSlotColors[i] = color;
      return { highlighterSlotColors };
    }),

  setGlassOpacity: (value) => {
    set({ glassOpacity: value });
    persistPages(get);
  },

  setMistBackground: (url) => {
    set({ mistBackground: url });
    persistPages(get);
  },

  setTool: (tool) => set({ tool, selectedId: tool === "select" ? get().selectedId : null }),
  setEraserMode: (eraserMode) => set({ eraserMode }),
  setColor: (color) => set((s) => ({ toolSettings: { ...s.toolSettings, color } })),
  setThickness: (thickness) => set((s) => ({ toolSettings: { ...s.toolSettings, thickness } })),
  setSelected: (id) => set({ selectedId: id }),

  addObject: (obj) => {
    set((s) => ({ objects: [...s.objects, obj] }));
  },

  updateObject: (id, patch) => {
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as BoardObject) : o)),
    }));
  },

  removeObject: (id) => {
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
    get().commit();
  },

  duplicateObject: (id) => {
    const obj = get().objects.find((o) => o.id === id);
    if (!obj) return;
    const clone: BoardObject = {
      ...obj,
      id: uuid(),
      zIndex: get().nextZIndex(),
    } as BoardObject;
    if ("x" in clone) (clone as StickyNoteData | TextObjectData).x += 20;
    if ("y" in clone) (clone as StickyNoteData | TextObjectData).y += 20;
    if ("x1" in clone) {
      (clone as ShapeObjectData).x1 += 20;
      (clone as ShapeObjectData).x2 += 20;
      (clone as ShapeObjectData).y1 += 20;
      (clone as ShapeObjectData).y2 += 20;
      const pts = (clone as ShapeObjectData).points;
      if (pts) (clone as ShapeObjectData).points = pts.map((p) => ({ x: p.x + 20, y: p.y + 20 }));
    }
    set((s) => ({ objects: [...s.objects, clone], selectedId: clone.id }));
    get().commit();
  },

  bringToFront: (id) => {
    get().updateObject(id, { zIndex: get().nextZIndex() });
    get().commit();
  },

  sendToBack: (id) => {
    const minZ = Math.min(0, ...get().objects.map((o) => o.zIndex));
    get().updateObject(id, { zIndex: minZ - 1 });
    get().commit();
  },

  deleteSelected: () => {
    const id = get().selectedId;
    if (!id) return;
    const obj = get().objects.find((o) => o.id === id);
    if (!obj) return;
    if (obj.type === "sticky") {
      get().startStickyFall(id);
    } else {
      get().removeObject(id);
    }
  },

  startStickyFall: (id) => {
    playStickyRemove();
    set({ fallingStickyId: id, selectedId: null });
  },

  finishStickyFall: (id) => {
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      fallingStickyId: s.fallingStickyId === id ? null : s.fallingStickyId,
    }));
    get().commit();
  },

  beginShapeErase: (point) => set({ activeShapeErasePoints: [point] }),

  extendShapeErase: (point) =>
    set((s) => ({
      activeShapeErasePoints: s.activeShapeErasePoints ? [...s.activeShapeErasePoints, point] : [point],
    })),

  commitShapeErase: (thickness) => {
    const points = get().activeShapeErasePoints;
    set({ activeShapeErasePoints: null });
    if (!points || points.length === 0) return;

    // Scope this erasure to only the shapes it actually overlapped, so it
    // never masks a different shape drawn later over the same spot.
    const eraseBox = pointsBoundingBox(points, thickness / 2);
    const targetShapeIds = get()
      .objects.filter((o): o is ShapeObjectData => o.type === "shape")
      .filter((shape) => {
        const pts = shape.points && shape.points.length > 0 ? shape.points : [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }];
        const shapeBox = pointsBoundingBox(pts, shape.thickness / 2 + 6);
        return boxesOverlap(eraseBox, shapeBox);
      })
      .map((shape) => shape.id);

    if (targetShapeIds.length === 0) return;

    get().addObject({
      id: uuid(),
      type: "shapeErase",
      points,
      thickness,
      targetShapeIds,
      rotation: 0,
      zIndex: 0,
    });
    get().commit();
  },

  // Re-fogging the board is a full wipe — the condensation animation covers
  // the ink/mask side (handled by DrawingCanvas watching mistifyNonce), and
  // any text or shape objects drawn on top go with it too, exactly like
  // writing or doodling in real condensation disappears when it re-fogs.
  // Sticky notes are physical objects stuck to the glass, not condensation,
  // so they're left alone.
  triggerMistify: () => {
    set((s) => ({
      mistifyNonce: s.mistifyNonce + 1,
      objects: s.objects.filter(
        (o) =>
          o.type !== "text" &&
          o.type !== "shape" &&
          o.type !== "shapeErase" &&
          !(o.type === "stroke" && o.highlighter)
      ),
      selectedId: null,
    }));
    get().commit();
  },

  // Glass mode's equivalent of "Mistify Again": wipes all drawn ink
  // strokes clean while leaving sticky notes, text and shapes untouched.
  clearGlassBoard: () => {
    set((s) => ({
      objects: s.objects.filter((o) => o.type !== "stroke"),
      selectedId: null,
    }));
    get().commit();
  },

  addPage: () => {
    const s = get();
    if (s.pageTransition !== null) return; // let the current slide finish cleanly first
    const pages = s.pages.map((p, i) => (i === s.currentPageIndex ? snapshotCurrentPage(s, p.id) : p));
    const newPage = emptyPage();
    const allPages = [...pages, newPage];
    set({
      pages: allPages,
      currentPageIndex: allPages.length - 1,
      pageTransition: "next",
      pageTransitionId: s.pageTransitionId + 1,
      ...flatFieldsFromPage(newPage),
      history: [{ objects: [] }],
      historyIndex: 0,
      selectedId: null,
      fallingStickyId: null,
      activeShapeErasePoints: null,
    });
    persistPages(get);
  },

  goToPage: (index) => {
    const s = get();
    if (index < 0 || index >= s.pages.length) return;
    if (s.pageTransition !== null) {
      // A slide is already playing — remember only the latest request
      // instead of starting an overlapping one; it fires the instant the
      // current slide finishes (see clearPageTransition).
      if (index !== s.currentPageIndex) set({ queuedPageIndex: index });
      return;
    }
    if (index === s.currentPageIndex) return;
    const pages = s.pages.map((p, i) => (i === s.currentPageIndex ? snapshotCurrentPage(s, p.id) : p));
    const target = pages[index];
    set({
      pages,
      currentPageIndex: index,
      pageTransition: index > s.currentPageIndex ? "next" : "prev",
      pageTransitionId: s.pageTransitionId + 1,
      ...flatFieldsFromPage(target),
      history: [{ objects: target.objects }],
      historyIndex: 0,
      selectedId: null,
      fallingStickyId: null,
      activeShapeErasePoints: null,
    });
    persistPages(get);
  },

  clearPageTransition: (id) => {
    const s = get();
    if (s.pageTransitionId !== id) return; // a newer transition has already started
    set({ pageTransition: null });
    const queued = get().queuedPageIndex;
    if (queued !== null) {
      set({ queuedPageIndex: null });
      get().goToPage(queued);
    }
  },

  // Export-only helpers: flush any unsaved live edits into `pages`, then
  // hard-jump between pages with no slide animation (unlike goToPage) so a
  // multi-page export can walk every page quickly, capture it, and land
  // back where the user left off.
  snapshotLivePageIntoPages: () => {
    const s = get();
    set({ pages: s.pages.map((p, i) => (i === s.currentPageIndex ? snapshotCurrentPage(s, p.id) : p)) });
  },

  exportJumpToPage: (index) => {
    const s = get();
    const target = s.pages[index];
    if (!target) return;
    set({
      currentPageIndex: index,
      pageTransition: null,
      ...flatFieldsFromPage(target),
      history: [{ objects: target.objects }],
      historyIndex: 0,
      selectedId: null,
      fallingStickyId: null,
      activeShapeErasePoints: null,
    });
  },

  commit: () => {
    const { objects, history, historyIndex, theme } = get();
    const truncated = history.slice(0, historyIndex + 1);
    const entry: HistoryEntry =
      theme === "mist" && mistMaskIO ? { objects, mistMask: mistMaskIO.get() } : { objects };
    const newHistory = [...truncated, entry];
    // cap history length to avoid unbounded growth
    const capped = newHistory.length > 100 ? newHistory.slice(newHistory.length - 100) : newHistory;
    set({ history: capped, historyIndex: capped.length - 1 });
    persistPages(get);
  },

  undo: () => {
    const { history, historyIndex, theme } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({ objects: prev.objects, historyIndex: historyIndex - 1, selectedId: null });
    if (theme === "mist" && mistMaskIO) mistMaskIO.restore(prev.mistMask ?? null);
    persistPages(get);
  },

  redo: () => {
    const { history, historyIndex, theme } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({ objects: next.objects, historyIndex: historyIndex + 1, selectedId: null });
    if (theme === "mist" && mistMaskIO) mistMaskIO.restore(next.mistMask ?? null);
    persistPages(get);
  },

  registerMistMaskIO: (io) => {
    mistMaskIO = io;
  },

  // Only clear if it's still ours: on a page switch the outgoing page
  // unmounts *after* the incoming one has already registered.
  unregisterMistMaskIO: (io) => {
    if (mistMaskIO === io) mistMaskIO = null;
  },

  carveMistStroke: (points, thickness) => {
    mistMaskIO?.carveStroke(points, thickness);
  },

  carveMistText: (x, y, width, height, text, style) => {
    mistMaskIO?.carveText(x, y, width, height, text, style);
  },

  nextZIndex: () => {
    const { objects } = get();
    return objects.length === 0 ? 1 : Math.max(...objects.map((o) => o.zIndex)) + 1;
  },
}));

export function createId() {
  return uuid();
}
