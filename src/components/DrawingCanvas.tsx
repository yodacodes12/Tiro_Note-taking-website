import { useEffect, useRef } from "react";
import type { EraserMode, Point, StrokeObject, Theme } from "../types";
import { useBoardStore, createId, loadMistMask, saveMistMask } from "../store/boardStore";
import { startWipeSound, startBoardSound, type WipeHandle, type BoardSoundHandle } from "../lib/sounds";

interface Props {
  pageId: string;
  theme: Theme;
  active: boolean; // true when tool is pen or eraser
  eraserMode: EraserMode;
  onShapeErasePoint: (point: Point, isNewStroke: boolean) => void;
  onShapeEraseEnd: () => void;
}

// ---------------------------------------------------------------------------
// Glass-theme ink (unchanged): real strokes stored as board objects, drawn
// straight to the canvas with the usual destination-out eraser trick.
// ---------------------------------------------------------------------------

function strokePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  thickness: number,
  composite: GlobalCompositeOperation,
  strokeStyle: string,
  blur = 0
) {
  if (points.length < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = thickness;
  ctx.strokeStyle = strokeStyle;
  if (blur > 0) {
    ctx.shadowColor = strokeStyle;
    ctx.shadowBlur = blur;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

// A highlighter mark: one translucent, flat-tipped path. Stroking the whole
// point list as a single path keeps the colour even where the stroke
// crosses itself (as real highlighter ink does), while separate strokes
// that overlap still layer up darker.
const HIGHLIGHTER_ALPHA = 0.42;

function highlighterWidth(thickness: number) {
  return thickness * 2.5 + 10;
}

function drawHighlighterPath(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  if (points.length < 1) return;
  ctx.save();
  ctx.globalAlpha = HIGHLIGHTER_ALPHA;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) ctx.lineTo(points[0].x + width * 0.3, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Mist-theme condensation system.
//
// Four conceptual layers, per spec:
//   1. Environment (rendered elsewhere, behind this canvas)
//   2. Glass look (panel's own backdrop blur, in Board.tsx)
//   3. Condensation texture + droplets — `visualCanvas`, redrawn whenever
//      droplets move, independent of user interaction
//   4. Visibility mask — `maskCanvas`, an alpha map the pen carves clear
//      (destination-out) and the eraser / Mistify Again restores
//      (source-over), completely decoupled from the droplet animation
//
// Each frame we composite: draw visualCanvas, then destination-in with
// maskCanvas, onto the on-screen canvas. Both offscreen buffers live in
// refs so none of this touches React state/re-renders.
// ---------------------------------------------------------------------------

interface Droplet {
  x: number;
  y: number;
  r: number;
  wobbleSeed: number;
  life: number;
}

const DROPLET_UPDATE_MS = 90; // how often droplet positions advance — slow & deliberate
const MERGE_CHECK_EVERY = 22; // update ticks between merge scans (~2s)
const MISTIFY_DURATION_MS = 1700;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}


function buildMistBase(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d")!;

  // Uneven base wash — not a flat fill — so density already varies before
  // any patches are layered on.
  const baseGrad = ctx.createLinearGradient(0, 0, w, h);
  baseGrad.addColorStop(0, "rgba(205,214,220,0.5)");
  baseGrad.addColorStop(0.5, "rgba(215,223,228,0.58)");
  baseGrad.addColorStop(1, "rgba(198,208,215,0.5)");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Soft density patches — thicker condensation in some regions, thinner
  // (more see-through) in others.
  const patchCount = Math.round((w * h) / 26000) + 10;
  for (let i = 0; i < patchCount; i++) {
    const x = rand(0, w);
    const y = rand(0, h);
    const r = rand(Math.min(w, h) * 0.12, Math.min(w, h) * 0.42);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dense = Math.random() > 0.45;
    grad.addColorStop(0, dense ? "rgba(225,232,236,0.3)" : "rgba(255,255,255,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // thin patches that let more background show through, for real variation
  const clearPatchCount = Math.round((w * h) / 70000) + 3;
  for (let i = 0; i < clearPatchCount; i++) {
    const x = rand(0, w);
    const y = rand(0, h);
    const r = rand(Math.min(w, h) * 0.08, Math.min(w, h) * 0.2);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(0,0,0,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // fine grain speckle — avoids the "flat digital blur" look
  const speckCount = Math.round((w * h) / 900);
  for (let i = 0; i < speckCount; i++) {
    const x = rand(0, w);
    const y = rand(0, h);
    const r = rand(0.5, 1.6);
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 120},${Math.random() > 0.5 ? 255 : 130},${Math.random() > 0.5 ? 255 : 140},${rand(0.05, 0.22)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // a handful of baked-in meandering water streaks, ending in a bright bead
  const streakCount = Math.round(Math.max(3, w / 220));
  for (let i = 0; i < streakCount; i++) {
    const startX = rand(0, w);
    const startY = rand(0, h * 0.3);
    const len = rand(h * 0.3, h * 0.75);
    const width = rand(2, 5);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = `rgba(0,0,0,${rand(0.08, 0.16)})`;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    let x = startX;
    let y = startY;
    ctx.moveTo(x, y);
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      y = startY + (len * s) / steps;
      x += rand(-6, 6);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    const beadR = rand(2, 4);
    const beadGrad = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, beadR);
    beadGrad.addColorStop(0, "rgba(255,255,255,0.9)");
    beadGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = beadGrad;
    ctx.beginPath();
    ctx.arc(x, y, beadR, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// Dew beads sit still, like real condensation does between wipes — no
// "speed"/gravity field here, just a size and a slow idle wobble so the
// glass still feels faintly alive without ever visibly sliding or
// dripping, which would be distracting while actually taking notes.
function spawnDroplet(w: number, h: number): Droplet {
  return {
    x: rand(0, w),
    y: rand(0, h),
    r: rand(1.5, 6),
    wobbleSeed: rand(0, 1000),
    life: rand(0, 1000),
  };
}

function makeDroplets(w: number, h: number): Droplet[] {
  const count = Math.max(24, Math.min(80, Math.round((w * h) / 16000)));
  const drops: Droplet[] = [];
  for (let i = 0; i < count; i++) drops.push(spawnDroplet(w, h));
  return drops;
}

function drawDroplet(ctx: CanvasRenderingContext2D, d: Droplet) {
  const { x, y, r } = d;
  ctx.save();

  // The drop itself: taller than it is wide and weighted toward the
  // bottom — a teardrop reading, not a plain circle — with its gradient
  // already fading out toward the top so it blends into the trail above
  // instead of needing a separate erase pass (which left a visible seam).
  const ry = r * 1.15;
  const rx = r * 0.82;
  const cy = y - r * 0.1;
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
  const body = ctx.createRadialGradient(x - rx * 0.3, cy + ry * 0.15, rx * 0.08, x, cy + ry * 0.2, Math.max(rx, ry) * 1.1);
  body.addColorStop(0, "rgba(255,255,255,0.82)");
  body.addColorStop(0.35, "rgba(224,235,240,0.42)");
  body.addColorStop(0.7, "rgba(170,186,196,0.24)");
  body.addColorStop(0.92, "rgba(95,113,125,0.3)");
  body.addColorStop(1, "rgba(95,113,125,0)");
  ctx.fillStyle = body;
  ctx.fill();

  // Thin highlight rim, only along the rounded underside.
  ctx.lineWidth = Math.max(0.5, r * 0.1);
  ctx.strokeStyle = "rgba(55,70,80,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0.35, Math.PI - 0.35);
  ctx.stroke();

  ctx.restore();
}

interface MistifyBlob {
  x: number;
  y: number;
  r: number;
  phase: number; // 0..1, when it reveals during the restore animation
  drawn: boolean;
}

export default function DrawingCanvas({ pageId, theme, active, eraserMode, onShapeErasePoint, onShapeEraseEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const wipeSoundRef = useRef<WipeHandle | null>(null);
  const boardSoundRef = useRef<BoardSoundHandle | null>(null);

  const objects = useBoardStore((s) => s.objects);
  const tool = useBoardStore((s) => s.tool);
  const toolSettings = useBoardStore((s) => s.toolSettings);
  const addObject = useBoardStore((s) => s.addObject);
  const commit = useBoardStore((s) => s.commit);
  const mistifyNonce = useBoardStore((s) => s.mistifyNonce);
  const highlighterColor = useBoardStore((s) => s.highlighterColor);
  const registerMistMaskIO = useBoardStore((s) => s.registerMistMaskIO);
  const unregisterMistMaskIO = useBoardStore((s) => s.unregisterMistMaskIO);

  // --- glass-theme ink (unchanged behaviour) ---
  const redrawGlass = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const strokes = objects.filter((o): o is StrokeObject => o.type === "stroke" && !o.highlighter);
    for (const s of strokes) {
      if (s.erasing) {
        strokePath(ctx, s.points, s.thickness, "destination-out", "rgba(0,0,0,1)");
      } else {
        strokePath(ctx, s.points, s.thickness, "source-over", s.color);
      }
    }
  };

  // --- highlighter layer (both themes) ---
  // Highlights live on their own canvas above the ink/fog so they can be
  // translucent over everything beneath; ink-eraser strokes are replayed
  // here too, so erasing rubs highlights out along with ink.
  const redrawHighlights = (live?: { points: Point[]; color: string; width: number }) => {
    const canvas = highlightCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const o of objects) {
      if (o.type !== "stroke") continue;
      if (o.highlighter) drawHighlighterPath(ctx, o.points, o.color, o.thickness);
      else if (o.erasing) strokePath(ctx, o.points, o.thickness, "destination-out", "rgba(0,0,0,1)");
    }
    if (live) drawHighlighterPath(ctx, live.points, live.color, live.width);
  };

  const pageHasHighlights = () => objects.some((o) => o.type === "stroke" && o.highlighter);

  // --- mist-theme condensation state ---
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticFogRef = useRef<HTMLCanvasElement | null>(null);
  const dropletsRef = useRef<Droplet[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const ticksRef = useRef(0);
  const mistifyRef = useRef<{ active: boolean; start: number; blobs: MistifyBlob[] } | null>(null);
  const visualDirtyRef = useRef(true);

  const ensureMistBuffers = (reset: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const sizeChanged = sizeRef.current.w !== w || sizeRef.current.h !== h;
    if (!sizeChanged && !reset) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const prevMask = maskCanvasRef.current;
    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;
    const maskCtx = mask.getContext("2d")!;
    const saved = loadMistMask(pageId);
    if (prevMask && !reset) {
      // best-effort preserve existing clear/restore state across a resize
      maskCtx.drawImage(prevMask, 0, 0, w, h);
    } else if (saved) {
      // This page's ink from earlier in the session (the canvas remounts on
      // every page switch, so the mask has to be restored from outside it).
      maskCtx.drawImage(saved, 0, 0, w, h);
    } else {
      maskCtx.fillStyle = "white";
      maskCtx.fillRect(0, 0, w, h);
    }
    maskCanvasRef.current = mask;

    const visual = document.createElement("canvas");
    visual.width = w;
    visual.height = h;
    visualCanvasRef.current = visual;

    staticFogRef.current = buildMistBase(w, h);
    dropletsRef.current = makeDroplets(w, h);
    sizeRef.current = { w, h };
    visualDirtyRef.current = true;
  };

  const redrawVisual = () => {
    const visual = visualCanvasRef.current;
    const fog = staticFogRef.current;
    if (!visual || !fog) return;
    const vctx = visual.getContext("2d")!;
    vctx.clearRect(0, 0, visual.width, visual.height);
    vctx.drawImage(fog, 0, 0);
    for (const d of dropletsRef.current) drawDroplet(vctx, d);
  };

  const compositeMist = () => {
    const canvas = canvasRef.current;
    const mask = maskCanvasRef.current;
    const visual = visualCanvasRef.current;
    if (!canvas || !mask || !visual) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.drawImage(visual, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  };

  // Checkpoint this page's mask after every finished edit, so it survives
  // the canvas remounting on a page switch or export.
  const persistMask = () => {
    if (maskCanvasRef.current) saveMistMask(pageId, maskCanvasRef.current);
  };

  // Lets the store's undo/redo fold fog changes into the same timeline as
  // shape/text/sticky edits, so pressing undo after wiping a patch of
  // condensation actually brings the fog back instead of doing nothing.
  const getMaskSnapshot = (): string | null => {
    const mask = maskCanvasRef.current;
    return mask ? mask.toDataURL() : null;
  };

  const restoreMaskSnapshot = (data: string | null) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    if (!data) {
      // No snapshot recorded for this point in history — treat it as the
      // pristine, fully-fogged baseline.
      ctx.clearRect(0, 0, mask.width, mask.height);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, mask.width, mask.height);
      visualDirtyRef.current = true;
      compositeMist();
      persistMask();
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, mask.width, mask.height);
      ctx.drawImage(img, 0, 0, mask.width, mask.height);
      visualDirtyRef.current = true;
      compositeMist();
      persistMask();
    };
    img.src = data;
  };

  // Shapes/text in Mist carve straight into the fog mask — the same
  // destination-out wipe the pen makes — instead of sitting on top of it
  // as a coloured overlay, so they genuinely read as "drawn in the
  // condensation" the same way a pen stroke does.
  const carveMistStroke = (points: Point[], thickness: number) => {
    if (!maskCanvasRef.current || points.length === 0) return;
    if (points.length === 1) {
      const p = points[0];
      clearMistSegment(p, { x: p.x + 0.1, y: p.y + 0.1 }, thickness);
    } else {
      for (let i = 1; i < points.length; i++) {
        clearMistSegment(points[i - 1], points[i], thickness);
      }
    }
    compositeMist();
    persistMask();
  };

  const carveMistTextGlyphs = (
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    style: { fontSize: number; fontFamily: string; fontWeight: number; italic: boolean; align: "left" | "center" | "right" }
  ) => {
    const mask = maskCanvasRef.current;
    if (!mask || !text.trim()) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const glyphs = document.createElement("canvas");
    glyphs.width = w;
    glyphs.height = h;
    const gctx = glyphs.getContext("2d")!;
    gctx.font = `${style.italic ? "italic " : ""}${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    gctx.fillStyle = "black";
    gctx.textBaseline = "alphabetic";
    gctx.textAlign = style.align;
    const anchorX = style.align === "center" ? w / 2 : style.align === "right" ? w : 0;
    const lineHeight = style.fontSize * 1.3;
    const lines = text.split("\n");
    lines.forEach((line, i) => gctx.fillText(line, anchorX, style.fontSize + i * lineHeight));

    const ctx = mask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(glyphs, x, y);
    ctx.restore();
    compositeMist();
    persistMask();
  };

  useEffect(() => {
    if (theme !== "mist") return;
    const io = {
      get: getMaskSnapshot,
      restore: restoreMaskSnapshot,
      carveStroke: carveMistStroke,
      carveText: carveMistTextGlyphs,
    };
    registerMistMaskIO(io);
    return () => unregisterMistMaskIO(io);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    return () => {
      wipeSoundRef.current?.stop();
      wipeSoundRef.current = null;
      boardSoundRef.current?.stop();
      boardSoundRef.current = null;
    };
  }, []);

  const updateDroplets = () => {
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const drops = dropletsRef.current;
    for (const d of drops) {
      // No vertical drift — these are idle dew beads, not sliding drops;
      // only a slow, tiny positional wobble so the glass still feels
      // faintly alive without ever looking like it's dripping.
      d.life += 1;
      d.x += Math.sin(d.life * 0.05 + d.wobbleSeed) * 0.05;
      d.y += Math.cos(d.life * 0.04 + d.wobbleSeed) * 0.04;
    }
    ticksRef.current += 1;
    if (ticksRef.current % MERGE_CHECK_EVERY === 0) {
      for (let i = 0; i < drops.length; i++) {
        for (let j = i + 1; j < drops.length; j++) {
          const a = drops[i];
          const b = drops[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          const combined = a.r + b.r;
          if (dist < combined * 0.55 && Math.random() < 0.35) {
            // merge: one bead absorbs the other and grows slightly, the
            // other respawns elsewhere on the glass
            const keep = Math.random() < 0.5 ? a : b;
            const other = keep === a ? b : a;
            keep.r = Math.min(13, Math.sqrt(a.r * a.r + b.r * b.r) * 0.92);
            const fresh = spawnDroplet(w, h);
            other.x = fresh.x;
            other.y = fresh.y;
            other.r = fresh.r;
            other.wobbleSeed = fresh.wobbleSeed;
            other.life = 0;
            break;
          }
        }
      }
    }
  };

  const ensureMistifyBlobs = (): MistifyBlob[] => {
    const { w, h } = sizeRef.current;
    const count = Math.max(40, Math.round((w * h) / 9000));
    const avgR = Math.sqrt((w * h) / count) * 0.85;
    const blobs: MistifyBlob[] = [];
    for (let i = 0; i < count; i++) {
      blobs.push({ x: rand(0, w), y: rand(0, h), r: avgR * rand(0.8, 1.3), phase: rand(0, 1), drawn: false });
    }
    return blobs;
  };

  const startMistify = () => {
    if (!maskCanvasRef.current) return;
    mistifyRef.current = { active: true, start: performance.now(), blobs: ensureMistifyBlobs() };
  };

  const stepMistify = (now: number) => {
    const state = mistifyRef.current;
    const mask = maskCanvasRef.current;
    if (!state || !state.active || !mask) return;
    const progress = Math.min(1, (now - state.start) / MISTIFY_DURATION_MS);
    const ctx = mask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const b of state.blobs) {
      if (!b.drawn && b.phase <= progress) {
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        b.drawn = true;
      }
    }
    ctx.restore();
    if (progress >= 1) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, mask.width, mask.height);
      state.active = false;
      persistMask();
    }
    visualDirtyRef.current = true;
  };

  // init + resize
  useEffect(() => {
    if (theme !== "mist") return;
    ensureMistBuffers(true);
    redrawVisual();
    compositeMist();
    const onResize = () => {
      ensureMistBuffers(false);
      redrawVisual();
      compositeMist();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ambient animation loop — droplets drift independently of pointer input
  useEffect(() => {
    if (theme !== "mist") return;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (mistifyRef.current?.active) stepMistify(now);
      if (now - lastUpdateRef.current >= DROPLET_UPDATE_MS) {
        lastUpdateRef.current = now;
        updateDroplets();
        visualDirtyRef.current = true;
      }
      if (visualDirtyRef.current) {
        redrawVisual();
        compositeMist();
        visualDirtyRef.current = false;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // "Mistify Again" trigger from the toolbar
  const lastMistifyNonceRef = useRef(mistifyNonce);
  useEffect(() => {
    if (theme !== "mist") return;
    if (mistifyNonce === lastMistifyNonceRef.current) return;
    lastMistifyNonceRef.current = mistifyNonce;
    startMistify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mistifyNonce, theme]);

  useEffect(() => {
    redrawHighlights();
    const onResize = () => redrawHighlights();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);

  // glass-theme redraw (unchanged)
  useEffect(() => {
    if (theme === "mist") return;
    redrawGlass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, objects]);

  useEffect(() => {
    if (theme === "mist") return;
    const onResize = () => redrawGlass();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, objects]);

  const getPoint = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const doShapeErase = tool === "eraser" && (eraserMode === "shape" || eraserMode === "all");
  const doInkErase = tool === "eraser" && (eraserMode === "ink" || eraserMode === "all");
  const doInkDraw = tool === "pen" || doInkErase;

  const clearMistSegment = (p1: Point, p2: Point, thickness: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = thickness;
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = thickness * 0.35;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  };

  const restoreMistSegment = (p1: Point, p2: Point, thickness: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = thickness;
    ctx.shadowColor = "rgba(255,255,255,1)";
    ctx.shadowBlur = thickness * 0.35;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  };

  const isHighlighter = tool === "highlighter";
  const liveHighlight = (points: Point[]) => ({
    points,
    color: highlighterColor,
    width: highlighterWidth(toolSettings.thickness),
  });

  // Live erase on the highlight layer, so highlights disappear under the
  // eraser as it moves rather than only on release.
  const eraseHighlightSegment = (p1: Point, p2: Point) => {
    const ctx = highlightCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    strokePath(ctx, [p1, p2], toolSettings.thickness * 2.2, "destination-out", "rgba(0,0,0,1)");
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getPoint(e);
    currentPointsRef.current = [pt];

    if (isHighlighter) {
      boardSoundRef.current?.stop();
      boardSoundRef.current = startBoardSound();
      redrawHighlights(liveHighlight([pt]));
      return;
    }
    if (doShapeErase) onShapeErasePoint(pt, true);

    // Erasing sounds like wiping condensation/ink off the glass (muted in
    // Mist); actually writing with the pen plays one of the recorded
    // "board" clips instead — see startBoardSound.
    wipeSoundRef.current?.stop();
    wipeSoundRef.current = null;
    boardSoundRef.current?.stop();
    boardSoundRef.current = null;
    if (doInkErase) {
      wipeSoundRef.current = startWipeSound(theme === "mist" ? 0.35 : 1);
    } else if (tool === "pen") {
      boardSoundRef.current = startBoardSound();
    }

    if (theme === "mist" && doInkDraw) {
      const p2 = { x: pt.x + 0.1, y: pt.y + 0.1 };
      if (doInkErase) restoreMistSegment(pt, p2, toolSettings.thickness * 2.2);
      else clearMistSegment(pt, p2, toolSettings.thickness);
      compositeMist();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!active || !drawingRef.current) return;
    const pt = getPoint(e);
    currentPointsRef.current.push(pt);

    if (isHighlighter) {
      redrawHighlights(liveHighlight(currentPointsRef.current));
      return;
    }

    if (doShapeErase) onShapeErasePoint(pt, false);
    if (!doInkDraw) return;

    const pts = currentPointsRef.current;
    const last2 = pts.slice(-2);
    if (doInkErase && last2.length === 2) eraseHighlightSegment(last2[0], last2[1]);

    if (theme === "mist") {
      if (doInkErase) restoreMistSegment(last2[0], last2[1], toolSettings.thickness * 2.2);
      else clearMistSegment(last2[0], last2[1], toolSettings.thickness);
      compositeMist();
      return;
    }

    const ctx = canvasRef.current!.getContext("2d")!;
    if (doInkErase) {
      strokePath(ctx, last2, toolSettings.thickness * 2.2, "destination-out", "rgba(0,0,0,1)");
    } else {
      strokePath(ctx, last2, toolSettings.thickness, "source-over", toolSettings.color);
    }
  };

  const handlePointerUp = () => {
    wipeSoundRef.current?.stop();
    wipeSoundRef.current = null;
    boardSoundRef.current?.stop();
    boardSoundRef.current = null;
    if (!active || !drawingRef.current) return;
    drawingRef.current = false;
    const points = currentPointsRef.current;
    currentPointsRef.current = [];
    if (points.length < 1) return;

    if (isHighlighter) {
      addObject({
        id: createId(),
        type: "stroke",
        points,
        color: highlighterColor,
        thickness: highlighterWidth(toolSettings.thickness),
        highlighter: true,
        rotation: 0,
        zIndex: 0,
      });
      commit();
      return;
    }

    if (doShapeErase) onShapeEraseEnd();
    if (!doInkDraw) return;
    if (theme === "mist") {
      // The condensation mask itself (not a StrokeObject) is the record of
      // this edit, but it still needs to land on the shared undo timeline.
      // If there are highlights here, the eraser also has to be recorded
      // as a stroke so it keeps rubbing them out on every redraw.
      persistMask();
      if (doInkErase && pageHasHighlights()) {
        addObject({
          id: createId(),
          type: "stroke",
          points,
          color: "#000",
          thickness: toolSettings.thickness * 2.2,
          erasing: true,
          rotation: 0,
          zIndex: 0,
        });
      }
      commit();
      return;
    }

    const stroke: StrokeObject = {
      id: createId(),
      type: "stroke",
      points,
      color: toolSettings.color,
      thickness: doInkErase ? toolSettings.thickness * 2.2 : toolSettings.thickness,
      erasing: doInkErase,
      rotation: 0,
      zIndex: 0,
    };
    addObject(stroke);
    commit();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: active ? "crosshair" : "default", pointerEvents: active ? "auto" : "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {/* On Glass, multiply makes it behave like real highlighter ink —
          tinting what's under it while dark ink stays dark. On Mist's dark
          fog, multiply would swallow the colour, so it's laid on normally. */}
      <canvas
        ref={highlightCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: theme === "glass" ? "multiply" : "normal" }}
      />
    </>
  );
}
