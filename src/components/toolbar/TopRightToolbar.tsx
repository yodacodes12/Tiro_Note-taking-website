import { useEffect, useRef, useState } from "react";
import { useBoardStore } from "../../store/boardStore";
import { MAX_HIGHLIGHTERS, MAX_MARKERS } from "../../types";
import { captureAllPages, exportAsImages, exportAsPDF, type PageCapture } from "../../lib/exportBoard";

function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-white/10 p-0.5 text-xs" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-2 py-1.5 transition-colors ${
            value === o.value ? "bg-white/90 text-slate-800" : "text-white/70 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/75">{label}</span>
      <div className="flex items-center gap-2">
        <button aria-label={`Fewer ${label.toLowerCase()}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span className="w-4 text-center tabular-nums text-white">{value}</span>
        <button aria-label={`More ${label.toLowerCase()}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
        <span className="w-10 text-right text-white/35">max {max}</span>
      </div>
    </div>
  );
}

export default function TopRightToolbar() {
  const theme = useBoardStore((s) => s.theme);
  const setTheme = useBoardStore((s) => s.setTheme);
  const setGlassBackground = useBoardStore((s) => s.setGlassBackground);
  const setMistBackground = useBoardStore((s) => s.setMistBackground);
  const glassOpacity = useBoardStore((s) => s.glassOpacity);
  const setGlassOpacity = useBoardStore((s) => s.setGlassOpacity);
  const addPage = useBoardStore((s) => s.addPage);
  const toolbarStyle = useBoardStore((s) => s.toolbarStyle);
  const setToolbarStyle = useBoardStore((s) => s.setToolbarStyle);
  const toolbarPosition = useBoardStore((s) => s.toolbarPosition);
  const setToolbarPosition = useBoardStore((s) => s.setToolbarPosition);
  const markerCount = useBoardStore((s) => s.markerCount);
  const setMarkerCount = useBoardStore((s) => s.setMarkerCount);
  const highlighterCount = useBoardStore((s) => s.highlighterCount);
  const setHighlighterCount = useBoardStore((s) => s.setHighlighterCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "image" | null>(null);
  const [captures, setCaptures] = useState<PageCapture[] | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const captureRunRef = useRef(0);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen && !exportOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
        setExportOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [settingsOpen, exportOpen]);

  // Opening the tray captures every page once (full 2x quality); those same
  // captures are the thumbnails *and* what gets exported, so the preview is
  // exactly what you'll get.
  const openExportTray = async () => {
    setSettingsOpen(false);
    setExportOpen(true);
    setCaptures(null);
    const run = ++captureRunRef.current;
    const result = await captureAllPages();
    if (run !== captureRunRef.current) return;
    setCaptures(result);
    setSelectedPages(new Set(result.map((c) => c.pageId)));
  };

  const togglePage = (pageId: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const runExport = async (kind: "pdf" | "image") => {
    if (!captures) return;
    const chosen = captures.filter((c) => selectedPages.has(c.pageId));
    if (chosen.length === 0) return;
    setExporting(kind);
    try {
      if (kind === "pdf") await exportAsPDF(chosen.map((c) => c.dataUrl));
      else await exportAsImages(chosen);
      setExportOpen(false);
    } finally {
      setExporting(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        if (theme === "mist") setMistBackground(reader.result);
        else setGlassBackground(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      ref={toolbarRef}
      className="absolute top-5 right-5 z-30 flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-1.5 shadow-lg"
      style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(14px)" }}
    >
      <div className="flex items-center rounded-full bg-white/10 p-0.5 text-xs">
        <button
          onClick={() => setTheme("mist")}
          className={`rounded-full px-3 py-1.5 transition-colors ${
            theme === "mist" ? "bg-white/90 text-slate-800" : "text-white/70 hover:text-white"
          }`}
        >
          Mist
        </button>
        <button
          onClick={() => setTheme("glass")}
          className={`rounded-full px-3 py-1.5 transition-colors ${
            theme === "glass" ? "bg-white/90 text-slate-800" : "text-white/70 hover:text-white"
          }`}
        >
          Glass
        </button>
      </div>
      <div className="mx-1 h-5 w-px bg-white/15" />

      <button
        title="New board"
        onClick={addPage}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        title={theme === "mist" ? "Choose the scene behind the misted glass" : "Choose a background image for Glass mode"}
        onClick={() => fileInputRef.current?.click()}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </button>

      <div className="relative">
        <button
          title="Export board"
          onClick={() => {
            if (exportOpen) {
              captureRunRef.current++;
              setExportOpen(false);
            } else {
              void openExportTray();
            }
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            exportOpen ? "bg-white/90 text-slate-800" : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </button>
        {exportOpen && (
          <div
            className="absolute top-11 right-0 w-[480px] rounded-2xl border border-white/15 p-4 text-sm text-white/85"
            style={{ background: "rgba(20,20,30,0.92)", backdropFilter: "blur(16px)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-white">Export boards</span>
              {captures && captures.length > 1 && (
                <button
                  className="text-xs text-white/60 hover:text-white"
                  onClick={() =>
                    setSelectedPages(
                      selectedPages.size === captures.length ? new Set() : new Set(captures.map((c) => c.pageId))
                    )
                  }
                >
                  {selectedPages.size === captures.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {!captures ? (
              <div className="flex h-40 items-center justify-center gap-2 text-white/60">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-9-9" strokeLinecap="round" />
                </svg>
                Preparing previews…
              </div>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
                {captures.map((c) => {
                  const checked = selectedPages.has(c.pageId);
                  return (
                    <label
                      key={c.pageId}
                      className={`relative block cursor-pointer overflow-hidden rounded-xl border-2 transition-colors ${
                        checked ? "border-violet-400" : "border-white/10 opacity-60 hover:opacity-90"
                      }`}
                    >
                      <img src={c.dataUrl} alt={`Board ${c.index + 1}`} className="block aspect-[16/10] w-full object-cover" />
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePage(c.pageId)}
                        className="absolute top-2 left-2 h-4 w-4 accent-violet-500"
                      />
                      <span className="absolute right-2 bottom-1.5 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                        Board {c.index + 1}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                disabled={!captures || selectedPages.size === 0 || exporting !== null}
                onClick={() => void runExport("pdf")}
                className="flex-1 rounded-full bg-white/90 px-4 py-2 font-medium text-slate-800 hover:bg-white disabled:opacity-40"
              >
                {exporting === "pdf" ? "Exporting…" : "Export as PDF"}
              </button>
              <button
                disabled={!captures || selectedPages.size === 0 || exporting !== null}
                onClick={() => void runExport("image")}
                className="flex-1 rounded-full border border-white/25 px-4 py-2 font-medium text-white hover:bg-white/10 disabled:opacity-40"
              >
                {exporting === "image" ? "Exporting…" : selectedPages.size > 1 ? "Export images (.zip)" : "Export as image"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="relative">
        <button
          title="Settings"
          onClick={() => {
            setSettingsOpen((v) => !v);
            setExportOpen(false);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            settingsOpen ? "bg-white/90 text-slate-800" : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
        {settingsOpen && (
          <div
            className="absolute top-11 right-0 w-64 rounded-2xl border border-white/15 p-4 text-sm text-white/85"
            style={{ background: "rgba(20,20,30,0.9)", backdropFilter: "blur(16px)" }}
          >
            <p className="mb-2">Toolbar</p>
            <SegmentedChoice
              options={[
                { value: "2d", label: "2D toolbar" },
                { value: "3d", label: "3D toolbar" },
              ]}
              value={toolbarStyle}
              onChange={setToolbarStyle}
            />

            {toolbarStyle === "3d" && (
              <div className="mt-3 space-y-2 rounded-xl bg-white/5 p-3">
                <Stepper label="Markers" value={markerCount} min={1} max={MAX_MARKERS} onChange={setMarkerCount} />
                <Stepper
                  label="Highlighters"
                  value={highlighterCount}
                  min={1}
                  max={MAX_HIGHLIGHTERS}
                  onChange={setHighlighterCount}
                />
              </div>
            )}

            <p className="mt-4 mb-2">Toolbar position</p>
            <SegmentedChoice
              options={[
                { value: "bottom", label: "Bottom" },
                { value: "right", label: "Right" },
                { value: "left", label: "Left" },
                { value: "top", label: "Top" },
              ]}
              value={toolbarPosition}
              onChange={setToolbarPosition}
            />

            <div className="my-4 h-px bg-white/10" />

            <label className="flex items-center justify-between gap-2">
              <span>Board transparency</span>
              <span className="tabular-nums text-white/60">{glassOpacity}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={glassOpacity}
              onChange={(e) => setGlassOpacity(Number(e.target.value))}
              className="mt-2 w-full accent-white"
            />
            <p className="mt-1 text-xs text-white/40">Applies to Glass mode</p>
          </div>
        )}
      </div>
    </div>
  );
}
