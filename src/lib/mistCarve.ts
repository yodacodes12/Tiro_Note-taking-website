import type { Point, ShapeObjectData } from "../types";

// Breaks a shape object down into the polylines that trace its visible
// stroke (matching ShapeObject's own SVG rendering) — used to carve that
// same outline directly into the Mist condensation mask, so a shape reads
// as a genuine clearing rather than a coloured overlay sitting on the fog.
export function shapeCarvePaths(shape: ShapeObjectData): Point[][] {
  const { x1, y1, x2, y2, thickness } = shape;

  function arrowHead(tipX: number, tipY: number, fromX: number, fromY: number): Point[] {
    const angle = Math.atan2(tipY - fromY, tipX - fromX);
    const headLen = 10 + thickness * 2;
    const hx1 = tipX - headLen * Math.cos(angle - Math.PI / 6);
    const hy1 = tipY - headLen * Math.sin(angle - Math.PI / 6);
    const hx2 = tipX - headLen * Math.cos(angle + Math.PI / 6);
    const hy2 = tipY - headLen * Math.sin(angle + Math.PI / 6);
    return [
      { x: hx1, y: hy1 },
      { x: tipX, y: tipY },
      { x: hx2, y: hy2 },
    ];
  }

  switch (shape.shape) {
    case "line":
      return [
        [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ],
      ];
    case "arrow":
      return [
        [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ],
        arrowHead(x2, y2, x1, y1),
      ];
    case "rectangle": {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      return [
        [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: minY },
        ],
      ];
    }
    case "ellipse": {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const pts: Point[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
      }
      return [pts];
    }
    case "freeArrow": {
      if (!shape.points || shape.points.length < 2) return [];
      const pts = shape.points;
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      return [pts, arrowHead(b.x, b.y, a.x, a.y)];
    }
    default:
      return [];
  }
}
