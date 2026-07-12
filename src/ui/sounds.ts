/**
 * Procedural cozy SFX via Web Audio API (no asset files).
 *
 * Brand (PRODUCT.md): 可爱、温和、治愈、有仪式感 — Animal Crossing–adjacent.
 * Not cold UI beeps; short pentatonic-ish / wooden / soft-metal grains.
 *
 * Families:
 * - tick     gear detent (wheels / select options)
 * - soft     tiny UI acknowledge
 * - confirm  primary positive press (save / OK / add)
 * - success  outcome resolve (toast success)
 * - cancel   neutral dismiss
 * - warn     gentle caution (validation / timeout-ish)
 * - error    serious fail (still soft, never harsh alarm)
 * - start    task begins
 * - fail     alias of error (execution path)
 */

export type SoundKind =
  | "start"
  | "success"
  | "fail"
  | "soft"
  | "tick"
  | "confirm"
  | "cancel"
  | "warn"
  | "error";

let ctx: AudioContext | null = null;
let enabled = true;

/** Min gap between mechanical ticks (ms). */
const TICK_MIN_GAP_MS = 36;
let lastTickAt = 0;

/** Min gap for soft UI blips (avoid double-fire toast+button). */
const UI_MIN_GAP_MS = 55;
const lastUiAt: Partial<Record<SoundKind, number>> = {};

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Resume after user gesture (browsers suspend AudioContext until then). */
export async function unlockAudio(): Promise<void> {
  const c = getCtx();
  if (c && c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

export function isSoundEnabled() {
  return enabled;
}

function envGain(
  c: AudioContext,
  t0: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function impulseGain(
  c: AudioContext,
  t0: number,
  peak: number,
  decay: number,
): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.004, decay));
  return g;
}

function tone(
  c: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  detune = 0,
  lowpass = 3200,
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  const g = envGain(c, t0, peak, 0.01, Math.max(0.04, dur - 0.01));
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(lowpass, t0);
  f.Q.setValueAtTime(0.65, t0);
  o.connect(f);
  f.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/**
 * Crisp mechanical detent / gear tooth.
 * Short noise + high transient — granular, not muffled.
 */
function playTickSynth(c: AudioContext) {
  const t0 = c.currentTime + 0.0005;
  const j = 0.92 + Math.random() * 0.16;
  const bright = 0.9 + Math.random() * 0.2;

  const durSec = 0.009;
  const n = Math.max(48, Math.floor(c.sampleRate * durSec));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const env = Math.exp(-x * 9) * (1 - x);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;

  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(2200 * bright, t0);
  hp.Q.setValueAtTime(0.7, t0);

  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(6200 * j * bright, t0);
  bp.Q.setValueAtTime(2.2, t0);

  const shelf = c.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.setValueAtTime(5000, t0);
  shelf.gain.setValueAtTime(6, t0);

  const ng = impulseGain(c, t0, 0.16, 0.012);
  noise.connect(hp);
  hp.connect(bp);
  bp.connect(shelf);
  shelf.connect(ng);
  ng.connect(c.destination);
  noise.start(t0);
  noise.stop(t0 + durSec + 0.005);

  const o = c.createOscillator();
  o.type = "square";
  const f0 = 3200 * j;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(900, f0 * 0.55), t0 + 0.008);
  const og = impulseGain(c, t0, 0.055, 0.008);
  const ohp = c.createBiquadFilter();
  ohp.type = "highpass";
  ohp.frequency.setValueAtTime(1800, t0);
  o.connect(ohp);
  ohp.connect(og);
  og.connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.012);

  const ping = c.createOscillator();
  ping.type = "sine";
  ping.frequency.setValueAtTime(7800 * j, t0);
  const pg = impulseGain(c, t0, 0.028, 0.01);
  ping.connect(pg);
  pg.connect(c.destination);
  ping.start(t0);
  ping.stop(t0 + 0.014);
}

/** Soft wood-block-ish blip: task starting. */
function playStart(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  tone(c, 523.25, t0, 0.09, "triangle", 0.11, 0, 2800); // C5
  tone(c, 659.25, t0 + 0.07, 0.12, "triangle", 0.09, 0, 3000); // E5
}

/**
 * Primary positive press — short rising two-step (ritual, not full fanfare).
 * Use for Save / OK / Add before async; success toast can still play success.
 */
function playConfirm(c: AudioContext) {
  const t0 = c.currentTime + 0.005;
  // G5 → C6 soft island chime
  tone(c, 783.99, t0, 0.07, "triangle", 0.1, 0, 4200);
  tone(c, 1046.5, t0 + 0.055, 0.11, "sine", 0.09, 0, 4800);
  // tiny sparkle
  tone(c, 1567.98, t0 + 0.1, 0.08, "sine", 0.035, 0, 6000);
}

/** Cheerful resolve: success outcome. */
function playSuccess(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  tone(c, 523.25, t0, 0.1, "sine", 0.1, 0, 3600);
  tone(c, 659.25, t0 + 0.08, 0.1, "sine", 0.095, 0, 3800);
  tone(c, 783.99, t0 + 0.16, 0.14, "triangle", 0.11, 0, 4000);
  tone(c, 1046.5, t0 + 0.26, 0.18, "sine", 0.08, 0, 4500);
}

/** Neutral dismiss / cancel — soft wooden drop, no alarm. */
function playCancel(c: AudioContext) {
  const t0 = c.currentTime + 0.005;
  tone(c, 392.0, t0, 0.07, "triangle", 0.07, 0, 2200); // G4
  tone(c, 329.63, t0 + 0.05, 0.09, "sine", 0.055, 0, 2000); // E4
}

/** Caution / validation / mild problem — soft amber, not scary. */
function playWarn(c: AudioContext) {
  const t0 = c.currentTime + 0.008;
  // two mid “wood + soft bell”
  tone(c, 466.16, t0, 0.1, "triangle", 0.1, 0, 2600); // Bb4
  tone(c, 415.3, t0 + 0.09, 0.14, "sine", 0.085, 0, 2400); // Ab4
  // gentle noise dust
  const n = Math.max(32, Math.floor(c.sampleRate * 0.02));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-x * 6) * 0.35;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1800, t0);
  bp.Q.setValueAtTime(1.2, t0);
  const g = envGain(c, t0, 0.04, 0.004, 0.04);
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + 0.03);
}

/** Serious fail — deeper down-step, still warm (PRODUCT: not cold harsh). */
function playError(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  tone(c, 349.23, t0, 0.12, "triangle", 0.11, 0, 2000); // F4
  tone(c, 277.18, t0 + 0.1, 0.14, "triangle", 0.1, 0, 1800); // Db4
  tone(c, 220.0, t0 + 0.22, 0.22, "sine", 0.09, 0, 1600); // A3
  // soft low thud body
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
  const g = envGain(c, t0, 0.06, 0.004, 0.14);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.16);
}

/** Tiny UI soft click. */
function playSoft(c: AudioContext) {
  const t0 = c.currentTime + 0.005;
  tone(c, 880, t0, 0.05, "sine", 0.05, 0, 4000);
  tone(c, 1320, t0 + 0.02, 0.04, "sine", 0.025, 0, 5000);
}

function allowUi(kind: SoundKind): boolean {
  if (kind === "tick") return true;
  const now = performance.now();
  const last = lastUiAt[kind] ?? 0;
  if (now - last < UI_MIN_GAP_MS) return false;
  lastUiAt[kind] = now;
  return true;
}

export function playSound(kind: SoundKind): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().then(() => playSound(kind));
    return;
  }
  try {
    switch (kind) {
      case "start":
        if (!allowUi("start")) return;
        playStart(c);
        break;
      case "success":
        if (!allowUi("success")) return;
        playSuccess(c);
        break;
      case "confirm":
        if (!allowUi("confirm")) return;
        playConfirm(c);
        break;
      case "cancel":
        if (!allowUi("cancel")) return;
        playCancel(c);
        break;
      case "warn":
        if (!allowUi("warn")) return;
        playWarn(c);
        break;
      case "fail":
      case "error":
        if (!allowUi("error")) return;
        playError(c);
        break;
      case "soft":
        if (!allowUi("soft")) return;
        playSoft(c);
        break;
      case "tick":
        playTickThrottled(c);
        break;
    }
  } catch {
    /* autoplay / closed context */
  }
}

function playTickThrottled(c: AudioContext) {
  const now = performance.now();
  if (now - lastTickAt < TICK_MIN_GAP_MS) return;
  lastTickAt = now;
  playTickSynth(c);
}

/** Gear detent for scroll wheels / select options. */
export function playTick(): void {
  playSound("tick");
}

/** Positive primary press (save / OK / add). */
export function playConfirmSound(): void {
  playSound("confirm");
}

/** Neutral cancel / dismiss. */
export function playCancelSound(): void {
  playSound("cancel");
}

/** Map toast kind → SFX (central feedback path). */
export function playForToastKind(
  kind: "success" | "info" | "warning" | "error",
): void {
  switch (kind) {
    case "success":
      playSound("success");
      break;
    case "info":
      playSound("soft");
      break;
    case "warning":
      playSound("warn");
      break;
    case "error":
      playSound("error");
      break;
  }
}

/** Map execution log status → sfx. */
export function playForRunStatus(status: string | undefined | null) {
  if (!status) return;
  if (status === "success") playSound("success");
  else if (status === "canceled") playSound("cancel");
  else if (
    status === "failed" ||
    status === "timeout" ||
    status === "error"
  ) {
    // timeout is caution-ish; failed is error
    if (status === "timeout") playSound("warn");
    else playSound("error");
  }
}

/**
 * Gear ticks when pointer enters animal-island Select options.
 * Idempotent; respects sound_enabled + throttle.
 */
export function installSelectOptionTicks(): () => void {
  const onOver = (e: Event) => {
    if (!enabled) return;
    const pe = e as PointerEvent;
    const target = pe.target;
    if (!(target instanceof Element)) return;
    const option = target.closest('[class*="animal-option"]');
    if (!option) return;
    const related = pe.relatedTarget;
    if (
      related instanceof Element &&
      related.closest('[class*="animal-option"]') === option
    ) {
      return;
    }
    playTick();
  };
  document.addEventListener("pointerover", onOver, true);
  return () => document.removeEventListener("pointerover", onOver, true);
}
