# Toolkit assets

## Icon
Generated specifically for Tidy Task on 2026-09-19 using the imagegen skill. Flat stationery toolkit in sage/amber; transparent RGBA, no lettering. Original: `toolkit-icon-master.png`; runtime: `public/images/toolkit/toolkit-icon.png` (256 × 256). No third-party trademark/icon copied. Downsampled with FFmpeg Lanczos; alpha retained.

## Sounds
All three recordings are CC0; source URLs and credits are shipped in `public/audio/toolkit/LICENSE.txt`. Original downloads are kept under `audio/`; exact runtime hashes/durations are in `audio/manifest.json`. No external network is needed during playback.

- Tick: cemkalyoncu — Tick and Tock (`tick.wav`). Mono 48 kHz, highpass 250 Hz, gain 2.24, fade out 0.20–0.23s, trimmed to 0.23s.
- Warning: Kenney — Interface Sounds (`select_002.ogg`). Mono 48 kHz, gain 0.175.
- End: Kenney — Interface Sounds (`confirmation_002.ogg`). Mono 48 kHz, gain 0.395.

Runtime loops tick and warning through one-second AudioBufferSource buffers. End uses a one-shot source. Duration, stop, reset, close and mute cancel existing scheduled sources. BGM is deliberately absent.
