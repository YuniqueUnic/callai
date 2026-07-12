/**
 * Procedural cozy SFX via Web Audio API (no asset files).
 * Soft pentatonic-ish blips for Animal Crossing–adjacent feel.
 */

export type SoundKind = "start" | "success" | "fail" | "soft";

let ctx: AudioContext | null = null;
let enabled = true;

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

function tone(
  c: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  detune = 0,
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  const g = envGain(c, t0, peak, 0.012, Math.max(0.04, dur - 0.012));
  // gentle lowpass for "soft" character
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(2200, t0);
  f.Q.setValueAtTime(0.7, t0);
  o.connect(f);
  f.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Soft wood-block-ish blip: task starting. */
function playStart(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  tone(c, 523.25, t0, 0.09, "triangle", 0.11); // C5
  tone(c, 659.25, t0 + 0.07, 0.12, "triangle", 0.09); // E5
}

/** Cheerful resolve: success. */
function playSuccess(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  // C major arpeggio, soft
  tone(c, 523.25, t0, 0.1, "sine", 0.1);
  tone(c, 659.25, t0 + 0.08, 0.1, "sine", 0.095);
  tone(c, 783.99, t0 + 0.16, 0.14, "triangle", 0.11);
  tone(c, 1046.5, t0 + 0.26, 0.18, "sine", 0.08);
}

/** Gentle down-step: fail / timeout / cancel. */
function playFail(c: AudioContext) {
  const t0 = c.currentTime + 0.01;
  tone(c, 392.0, t0, 0.14, "triangle", 0.1); // G4
  tone(c, 329.63, t0 + 0.1, 0.16, "triangle", 0.09); // E4
  tone(c, 261.63, t0 + 0.22, 0.22, "sine", 0.08); // C4
}

/** Tiny UI soft click. */
function playSoft(c: AudioContext) {
  const t0 = c.currentTime + 0.005;
  tone(c, 880, t0, 0.05, "sine", 0.05);
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
        playStart(c);
        break;
      case "success":
        playSuccess(c);
        break;
      case "fail":
        playFail(c);
        break;
      case "soft":
        playSoft(c);
        break;
    }
  } catch {
    /* autoplay / closed context */
  }
}

/** Map execution log status → sfx. */
export function playForRunStatus(status: string | undefined | null) {
  if (!status) return;
  if (status === "success") playSound("success");
  else if (
    status === "failed" ||
    status === "timeout" ||
    status === "canceled"
  ) {
    playSound("fail");
  }
}
