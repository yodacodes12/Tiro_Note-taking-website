import { motion } from "framer-motion";
import type { Theme } from "../types";
import { useBoardStore } from "../store/boardStore";

/**
 * The lowest visual layer: the "world" behind the glass/mist surface.
 */
export default function Environment({ theme }: { theme: Theme }) {
  const glassBackground = useBoardStore((s) => s.glassBackground);
  const mistBackground = useBoardStore((s) => s.mistBackground);

  if (theme === "mist") {
    if (mistBackground) {
      // User-chosen scene behind the condensation — darkened and gently
      // drifting, same depth treatment as the glass background, but with
      // a heavier night-window tint so it still reads as "through fogged
      // glass" rather than a plain photo.
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#05060a]">
          <motion.div
            className="absolute -inset-[6%]"
            style={{
              backgroundImage: `url(${mistBackground})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "saturate(88%) brightness(0.68) contrast(1.03)",
            }}
            animate={{ scale: [1.04, 1.08, 1.04], x: [0, 8, 0], y: [0, -6, 0] }}
            transition={{ duration: 55, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#05060a]/55 via-transparent to-[#05060a]/65" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.42)_100%)]" />
        </div>
      );
    }
    // A dark window at night: near-black gradient with warm bokeh lights
    // glowing through from outside, like streetlamps or house windows
    // seen through rain-streaked glass.
    const lights = [
      { top: "8%", left: "12%", size: 180, color: "#ffb15e", opacity: 0.35 },
      { top: "22%", left: "72%", size: 140, color: "#ff9d4d", opacity: 0.3 },
      { top: "55%", left: "85%", size: 220, color: "#ffc877", opacity: 0.28 },
      { top: "68%", left: "20%", size: 160, color: "#ffac5c", opacity: 0.22 },
      { top: "40%", left: "45%", size: 120, color: "#7fa8c9", opacity: 0.18 },
      { top: "85%", left: "60%", size: 190, color: "#ff8f3d", opacity: 0.2 },
    ];
    return (
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#0a0d12] via-[#0c1016] to-[#06070a]">
        {lights.map((l, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              top: l.top,
              left: l.left,
              width: l.size,
              height: l.size,
              background: l.color,
              opacity: l.opacity,
            }}
            animate={{ opacity: [l.opacity * 0.7, l.opacity, l.opacity * 0.7] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />
      </div>
    );
  }

  // A real photographic scene sits behind the glass, softly blurred and
  // gently drifting, so the panel has genuine depth and transparency
  // instead of flat CSS blobs standing in for "something behind it".
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e9ece6]">
      <motion.div
        className="absolute -inset-[6%]"
        style={{
          backgroundImage: `url(${glassBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(112%) brightness(1.02)",
        }}
        animate={{ scale: [1.04, 1.08, 1.04], x: [0, 10, 0], y: [0, -8, 0] }}
        transition={{ duration: 50, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.12),transparent_60%)]" />
    </div>
  );
}
