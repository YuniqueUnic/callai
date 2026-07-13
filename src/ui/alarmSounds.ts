/**
 * Web Audio preview for algorithmically generated alarm sounds.
 * Mirrors Rust `alarm_sound` families so UI preview matches runtime character.
 */
import type { BuiltinSoundId } from "../domain/types";
import { unlockAudio } from "./sounds";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, dur));
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(4200, t0);
  o.connect(f);
  f.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noiseBurst(c: AudioContext, t0: number, dur: number, peak: number) {
  const n = Math.max(32, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-x * 8);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(900, t0);
  bp.Q.setValueAtTime(1.4, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function playAlarmSoundPreview(id: string | null | undefined) {
  void unlockAudio();
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().then(() => playAlarmSoundPreview(id));
    return;
  }
  const kind = (id || "soft_chime") as BuiltinSoundId | "default";
  const t0 = c.currentTime + 0.01;
  switch (kind) {
    case "island_bell":
      tone(c, 783.99, t0, 0.14, "triangle", 0.12);
      tone(c, 1046.5, t0 + 0.07, 0.18, "sine", 0.1);
      tone(c, 1318.5, t0 + 0.16, 0.26, "sine", 0.07);
      break;
    case "wood_knock":
      noiseBurst(c, t0, 0.05, 0.18);
      noiseBurst(c, t0 + 0.12, 0.05, 0.16);
      noiseBurst(c, t0 + 0.24, 0.07, 0.14);
      break;
    case "warm_rise":
      tone(c, 349.23, t0, 0.16, "triangle", 0.11);
      tone(c, 440, t0 + 0.12, 0.16, "triangle", 0.11);
      tone(c, 523.25, t0 + 0.24, 0.22, "sine", 0.12);
      tone(c, 659.25, t0 + 0.36, 0.28, "sine", 0.09);
      break;
    case "gentle_ping":
      tone(c, 880, t0, 0.12, "sine", 0.1);
      tone(c, 1320, t0 + 0.04, 0.1, "sine", 0.05);
      break;
    case "soft_chime":
    case "default":
    default:
      tone(c, 523.25, t0, 0.18, "sine", 0.12);
      tone(c, 659.25, t0 + 0.09, 0.22, "sine", 0.1);
      tone(c, 783.99, t0 + 0.2, 0.32, "triangle", 0.1);
      break;
  }
}
