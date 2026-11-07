import { useEffect, useRef } from "react";
import type { TextObjectData, Theme } from "../types";
import { useBoardStore } from "../store/boardStore";
import SelectableBox from "./SelectableBox";

export default function TextObject({ obj, theme }: { obj: TextObjectData; theme: Theme }) {
  const tool = useBoardStore((s) => s.tool);
  const selectedId = useBoardStore((s) => s.selectedId);
  const setSelected = useBoardStore((s) => s.setSelected);
  const updateObject = useBoardStore((s) => s.updateObject);
  const commit = useBoardStore((s) => s.commit);
  const carveMistText = useBoardStore((s) => s.carveMistText);
  const contentRef = useRef<HTMLDivElement>(null);

  const interactive = tool === "select";
  const selected = selectedId === obj.id;
  const isMist = theme === "mist";

  useEffect(() => {
    if (!selected || !interactive) return;
    // Deferred: a new text box is created on pointerdown, and that same
    // click's default mousedown focus handling would otherwise immediately
    // move focus back to <body>, swallowing everything the user types.
    const raf = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return () => cancelAnimationFrame(raf);
  }, [selected, interactive]);

  const textShadow =
    theme === "mist"
      ? "0 0 2px rgba(255,255,255,0.25)"
      : "0 1px 1px rgba(0,0,0,0.15)";

  // Text in Mist carves its glyphs straight into the fog mask, the same
  // way the pen does — see ShapeObject for the shape-side equivalent. The
  // DOM text itself stays visible only while actively being edited (for
  // live feedback while typing); once deselected the carved clearing is
  // the only thing showing.
  const doCarve = (text: string) => {
    if (!isMist) return;
    carveMistText(obj.x, obj.y, obj.width, Math.max(32, obj.fontSize * 1.6), text, {
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      italic: obj.italic,
      align: obj.align,
    });
  };

  return (
    <SelectableBox
      x={obj.x}
      y={obj.y}
      width={obj.width}
      height={Math.max(32, obj.fontSize * 1.6)}
      rotation={obj.rotation}
      selected={selected}
      interactive={interactive}
      minWidth={40}
      minHeight={24}
      onSelect={() => setSelected(obj.id)}
      onChange={(patch) => updateObject(obj.id, patch)}
      onCommit={() => {
        // A move/resize re-carves at the new position — the old carve
        // can't un-fog itself, but the text should still end up legible
        // wherever it was dropped.
        doCarve(obj.text);
        commit();
      }}
    >
      <div
        ref={contentRef}
        contentEditable={selected && tool === "select"}
        suppressContentEditableWarning
        className="h-full w-full outline-none"
        style={{
          color: isMist && !selected ? "transparent" : obj.color,
          fontSize: obj.fontSize,
          fontFamily: obj.fontFamily,
          fontWeight: obj.fontWeight,
          fontStyle: obj.italic ? "italic" : "normal",
          textDecoration: obj.underline ? "underline" : "none",
          textAlign: obj.align,
          textShadow,
          filter: theme === "mist" ? "blur(0.15px)" : undefined,
          cursor: interactive ? (selected ? "text" : "move") : "default",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
        onPointerDown={(e) => {
          if (selected && interactive) e.stopPropagation();
        }}
        onBlur={(e) => {
          const newText = e.currentTarget.textContent ?? "";
          updateObject(obj.id, { text: newText });
          doCarve(newText);
          commit();
        }}
      >
        {obj.text}
      </div>
    </SelectableBox>
  );
}
