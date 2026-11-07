import type { ReactNode } from "react";
import type { ToolId } from "../../types";
import { HighlighterIcon } from "./toolbarParts";

export const TOOL_BUTTONS: { id: ToolId; label: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "highlighter", label: "Highlighter", icon: <HighlighterIcon /> },
  { id: "text", label: "Text", icon: "T" },
];

export const SHAPE_BUTTONS: { id: ToolId; label: string; icon: string }[] = [
  { id: "line", label: "Line", icon: "╱" },
  { id: "arrow", label: "Arrow", icon: "↗" },
  { id: "freeArrow", label: "Free Arrow", icon: "➳" },
  { id: "rectangle", label: "Rectangle", icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "◯" },
];

