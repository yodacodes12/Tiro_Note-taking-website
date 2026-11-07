// Sound-effect library: peeling a sticky note off the stack and drawing on
// the board use recorded clips under /public/sounds; deleting a note and
// erasing are synthesized.

const STICKY_TEAR_SRC = "/sounds/sticky-tear.wav";
const BOARD_TRACK_SRCS = [
  "/sounds/board/Track2.wav",
  "/sounds/board/Track3.wav",
  "/sounds/board/Track4.wav",
  "/sounds/board/Track5.wav",
  "/sounds/board/Track6.wav",
];

function playClip(src: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(src);
  void audio.play().catch(() => {});
  return audio;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Peeling a fresh note off the stack.
export function playStickyTear() {
  playClip(STICKY_TEAR_SRC);
}

// Deleting a note (it tears off the glass and falls): a quick crinkly rip —
// bandpass noise with a fast upward filter sweep, plus a few short "catch"
// clicks for paper texture.
export function playStickyRemove() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.32;

  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c, dur);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(3200, now + dur * 0.7);
  filter.frequency.exponentialRampToValueAtTime(1800, now + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(now);
  src.stop(now + dur);

  for (const t of [0.05, 0.14, 0.22]) {
    const click = c.createBufferSource();
    click.buffer = makeNoiseBuffer(c, 0.03);
    const clickFilter = c.createBiquadFilter();
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 2500;
    const clickGain = c.createGain();
    clickGain.gain.setValueAtTime(0.18, now + t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.03);
    click.connect(clickFilter).connect(clickGain).connect(c.destination);
    click.start(now + t);
    click.stop(now + t + 0.03);
  }
}

function randomBoardTrack(): string {
  return BOARD_TRACK_SRCS[Math.floor(Math.random() * BOARD_TRACK_SRCS.length)];
}

export interface BoardSoundHandle {
  stop: () => void;
}

// Writing with the pen or highlighter, or drawing/dragging a shape: a
// random "board" clip plays immediately, then another random one every 2s
// for as long as the stroke/drag keeps going. Lifting the pointer cuts off
// whatever is still playing.
export function startBoardSound(): BoardSoundHandle {
  let current = playClip(randomBoardTrack());
  const interval = window.setInterval(() => {
    current = playClip(randomBoardTrack());
  }, 2000);
  return {
    stop: () => {
      window.clearInterval(interval);
      if (current) {
        current.pause();
        current.currentTime = 0;
        current = null;
      }
    },
  };
}

function makeNoiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export interface WipeHandle {
  stop: () => void;
}

// A sustained, slightly uneven "squeak-wipe" loop for the eraser — used for
// the duration of a drag. `intensity` (0–1) scales loudness and brightness,
// so it reads as a firm glass wipe or (low) a softer finger-on-mist murmur.
export function startWipeSound(intensity = 1): WipeHandle {
  const c = getCtx();
  if (!c) return { stop: () => {} };
  const now = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c, 1.4);
  src.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.1;
  const baseFreq = 500 + intensity * 900;
  filter.frequency.setValueAtTime(baseFreq, now);

  const masterGain = c.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  // Halved from the original 0.22 / 0.05 floor.
  masterGain.gain.exponentialRampToValueAtTime(Math.max(0.025, 0.11 * intensity), now + 0.08);

  const lfo = c.createOscillator();
  lfo.frequency.value = 2.6;
  const lfoGain = c.createGain();
  lfoGain.gain.value = baseFreq * 0.35;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start(now);

  src.connect(filter).connect(masterGain).connect(c.destination);
  src.start(now);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.stop(t + 0.14);
      lfo.stop(t + 0.14);
    },
  };
}
