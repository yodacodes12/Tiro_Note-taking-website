import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { useBoardStore } from "../store/boardStore";

export interface PageCapture {
  pageId: string;
  index: number;
  dataUrl: string;
}

// After jumping to a page, give the canvas effects (mist mask restore +
// compositing, glass redraw) and the background image a moment to settle
// before snapshotting — otherwise the capture can race a blank first paint.
function waitForPaint(ms = 320) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// jsPDF re-encodes a PNG losslessly, which is enormous for a photographic
// background (tens of MB). The board has no transparency to preserve, so
// the PDF embeds a high-quality JPEG of the same capture instead.
function toJpeg(dataUrl: string, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function downloadHref(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadHref(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function timestampedName(base: string, ext: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}-${stamp}.${ext}`;
}

// Captures the whole screen as the user sees it — background, frame, ink,
// shapes, text, placed sticky notes and the board tracker — minus anything
// tagged data-export-exclude (both toolbars, the sticky-note stack, the
// prev/next arrows), and minus any other page still mounted mid-switch.
async function capturePage(pageId: string): Promise<string> {
  const root = document.querySelector<HTMLElement>("[data-export-root]");
  if (!root) throw new Error("Board capture root not found");
  return toPng(root, {
    cacheBust: true,
    pixelRatio: 2,
    skipFonts: true,
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.hasAttribute("data-export-exclude")) return false;
      if (node.hasAttribute("data-page-root") && node.dataset.pageId !== pageId) return false;
      return true;
    },
  });
}

// Walks every page — including the current one — jumping to each in turn,
// capturing it at 2x resolution, then lands back exactly where the user
// was, with their undo history intact.
export async function captureAllPages(): Promise<PageCapture[]> {
  const start = useBoardStore.getState();
  const originalIndex = start.currentPageIndex;
  const { history, historyIndex } = start;

  start.snapshotLivePageIntoPages();
  const pages = useBoardStore.getState().pages;

  const captures: PageCapture[] = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      useBoardStore.getState().exportJumpToPage(i);
      await waitForPaint();
      captures.push({ pageId: pages[i].id, index: i, dataUrl: await capturePage(pages[i].id) });
    }
  } finally {
    useBoardStore.getState().exportJumpToPage(originalIndex);
    useBoardStore.setState({ history, historyIndex });
  }
  return captures;
}

export async function exportAsPDF(images: string[]) {
  if (images.length === 0) return;
  const sizes = await Promise.all(images.map(imageSize));
  const jpegs = await Promise.all(images.map((d) => toJpeg(d)));

  const first = sizes[0];
  const pdf = new jsPDF({
    orientation: first.w >= first.h ? "landscape" : "portrait",
    unit: "px",
    format: [first.w, first.h],
    compress: true,
  });
  jpegs.forEach((dataUrl, i) => {
    const { w, h } = sizes[i];
    if (i > 0) pdf.addPage([w, h], w >= h ? "landscape" : "portrait");
    pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
  });
  pdf.save(timestampedName("tiro-board", "pdf"));
}

export async function exportAsImages(images: { dataUrl: string; index: number }[]) {
  if (images.length === 0) return;
  if (images.length === 1) {
    downloadHref(images[0].dataUrl, timestampedName(`tiro-board-${images[0].index + 1}`, "png"));
    return;
  }
  const zip = new JSZip();
  for (const { dataUrl, index } of images) {
    zip.file(`board-${index + 1}.png`, dataUrl.slice(dataUrl.indexOf(",") + 1), { base64: true });
  }
  downloadBlob(await zip.generateAsync({ type: "blob" }), timestampedName("tiro-boards", "zip"));
}
