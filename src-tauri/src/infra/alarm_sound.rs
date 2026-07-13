//! Algorithmically generated attention sounds (no static audio assets).
//!
//! WAV PCM is synthesized in-process and played via platform tools.
//! We do not try to bypass system mute / Do Not Disturb: players honor
//! output volume, and notification paths use system APIs where available.

use std::f32::consts::PI;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::BuiltinSoundId;

const SAMPLE_RATE: u32 = 22_050;

#[derive(Debug, Clone, Copy)]
struct Tone {
    freq: f32,
    start_ms: u32,
    dur_ms: u32,
    peak: f32,
    kind: ToneKind,
}

#[derive(Debug, Clone, Copy)]
enum ToneKind {
    Sine,
    Triangle,
    Noise,
}

fn score(id: BuiltinSoundId) -> Vec<Tone> {
    match id {
        BuiltinSoundId::SoftChime => vec![
            Tone {
                freq: 523.25,
                start_ms: 0,
                dur_ms: 180,
                peak: 0.28,
                kind: ToneKind::Sine,
            },
            Tone {
                freq: 659.25,
                start_ms: 90,
                dur_ms: 220,
                peak: 0.24,
                kind: ToneKind::Sine,
            },
            Tone {
                freq: 783.99,
                start_ms: 200,
                dur_ms: 320,
                peak: 0.22,
                kind: ToneKind::Triangle,
            },
        ],
        BuiltinSoundId::IslandBell => vec![
            Tone {
                freq: 783.99,
                start_ms: 0,
                dur_ms: 140,
                peak: 0.26,
                kind: ToneKind::Triangle,
            },
            Tone {
                freq: 1046.5,
                start_ms: 70,
                dur_ms: 180,
                peak: 0.22,
                kind: ToneKind::Sine,
            },
            Tone {
                freq: 1318.5,
                start_ms: 160,
                dur_ms: 260,
                peak: 0.16,
                kind: ToneKind::Sine,
            },
        ],
        BuiltinSoundId::WoodKnock => vec![
            Tone {
                freq: 180.0,
                start_ms: 0,
                dur_ms: 50,
                peak: 0.35,
                kind: ToneKind::Noise,
            },
            Tone {
                freq: 220.0,
                start_ms: 120,
                dur_ms: 50,
                peak: 0.32,
                kind: ToneKind::Noise,
            },
            Tone {
                freq: 196.0,
                start_ms: 240,
                dur_ms: 70,
                peak: 0.3,
                kind: ToneKind::Noise,
            },
        ],
        BuiltinSoundId::WarmRise => vec![
            Tone {
                freq: 349.23,
                start_ms: 0,
                dur_ms: 160,
                peak: 0.24,
                kind: ToneKind::Triangle,
            },
            Tone {
                freq: 440.0,
                start_ms: 120,
                dur_ms: 160,
                peak: 0.24,
                kind: ToneKind::Triangle,
            },
            Tone {
                freq: 523.25,
                start_ms: 240,
                dur_ms: 220,
                peak: 0.26,
                kind: ToneKind::Sine,
            },
            Tone {
                freq: 659.25,
                start_ms: 360,
                dur_ms: 280,
                peak: 0.2,
                kind: ToneKind::Sine,
            },
        ],
        BuiltinSoundId::GentlePing => vec![
            Tone {
                freq: 880.0,
                start_ms: 0,
                dur_ms: 120,
                peak: 0.2,
                kind: ToneKind::Sine,
            },
            Tone {
                freq: 1320.0,
                start_ms: 40,
                dur_ms: 100,
                peak: 0.12,
                kind: ToneKind::Sine,
            },
        ],
    }
}

fn sample_tone(kind: ToneKind, freq: f32, t: f32) -> f32 {
    match kind {
        ToneKind::Sine => (2.0 * PI * freq * t).sin(),
        ToneKind::Triangle => {
            let phase = (freq * t).fract();
            4.0 * (phase - 0.5).abs() - 1.0
        }
        ToneKind::Noise => {
            // Deterministic-ish soft noise from phase hash
            let x = (t * 12_989.0 + freq * 79.0).sin() * 43_758.547;
            x.fract() * 2.0 - 1.0
        }
    }
}

/// Render mono 16-bit PCM WAV bytes for a built-in sound.
pub fn render_wav(id: BuiltinSoundId) -> Vec<u8> {
    let tones = score(id);
    let end_ms = tones
        .iter()
        .map(|t| t.start_ms + t.dur_ms + 40)
        .max()
        .unwrap_or(200);
    let n = ((SAMPLE_RATE as u64) * (end_ms as u64) / 1000) as usize;
    let mut samples = vec![0.0f32; n.max(1)];

    for tone in &tones {
        let start = ((SAMPLE_RATE as u64) * (tone.start_ms as u64) / 1000) as usize;
        let len = ((SAMPLE_RATE as u64) * (tone.dur_ms as u64) / 1000) as usize;
        for i in 0..len {
            let idx = start + i;
            if idx >= samples.len() {
                break;
            }
            let t = i as f32 / SAMPLE_RATE as f32;
            let env = {
                let attack = 0.008_f32;
                let rel = (tone.dur_ms as f32 / 1000.0).max(0.02);
                let a = (t / attack).min(1.0);
                let d = (1.0 - (t / rel)).max(0.0).powf(1.6);
                a * d
            };
            samples[idx] += sample_tone(tone.kind, tone.freq, t) * tone.peak * env;
        }
    }

    // Soft clip
    for s in &mut samples {
        *s = s.clamp(-0.95, 0.95);
    }

    encode_wav_pcm16(&samples)
}

fn encode_wav_pcm16(samples: &[f32]) -> Vec<u8> {
    let data_bytes = samples.len() * 2;
    let mut out = Vec::with_capacity(44 + data_bytes);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_bytes as u32).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_bytes as u32).to_le_bytes());
    for s in samples {
        let v = (s * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

fn temp_wav_path(id: BuiltinSoundId) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("callai-sound-{}-{nanos}.wav", id.as_str()))
}

/// Best-effort playback. Returns true if a player was launched successfully.
/// Honors system volume/mute; does not force sound through DND bypass hacks.
pub fn play_sound(id: BuiltinSoundId) -> Result<bool, String> {
    // Unit tests must not touch speakers / system audio tools.
    if cfg!(test) {
        let _ = id;
        let _ = render_wav(id); // still exercise generation
        return Ok(true);
    }
    let wav = render_wav(id);
    let path = temp_wav_path(id);
    {
        let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
        f.write_all(&wav).map_err(|e| e.to_string())?;
    }
    let played = play_wav_file(&path)?;
    // Cleanup shortly after start (players typically open immediately).
    let cleanup = path.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(4));
        let _ = fs::remove_file(cleanup);
    });
    Ok(played)
}

fn play_wav_file(path: &std::path::Path) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("afplay")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        Ok(status.success())
    }
    #[cfg(target_os = "linux")]
    {
        if which_exists("paplay") {
            let status = Command::new("paplay")
                .arg(path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|e| e.to_string())?;
            return Ok(status.success());
        }
        if which_exists("aplay") {
            let status = Command::new("aplay")
                .arg(path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|e| e.to_string())?;
            return Ok(status.success());
        }
        Ok(false)
    }
    #[cfg(target_os = "windows")]
    {
        let ps = format!(
            r#"Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]'{path}'); $p.Play(); Start-Sleep -Milliseconds 900"#,
            path = path.display().to_string().replace('\'', "''")
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        Ok(status.success())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = path;
        Ok(false)
    }
}

#[cfg(target_os = "linux")]
fn which_exists(bin: &str) -> bool {
    which::which(bin).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_has_riff_header_for_all_sounds() {
        for id in BuiltinSoundId::ALL {
            let wav = render_wav(id);
            assert!(wav.len() > 100, "{id:?}");
            assert_eq!(&wav[0..4], b"RIFF");
            assert_eq!(&wav[8..12], b"WAVE");
        }
    }

    #[test]
    fn default_sound_is_soft_chime() {
        assert_eq!(BuiltinSoundId::default().as_str(), "soft_chime");
    }
}
