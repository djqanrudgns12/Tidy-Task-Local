"""Prepare initial classroom sound candidates; stdlib only. Originals stay intact."""
import array
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import wave

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'artwork/toolkit/focus-bell'
DEST = ROOT / 'public/audio/toolkit/focus-bell'
if (SOURCE / 'sources-v2.json').exists():
    raise SystemExit('Revision 2 is selected. Use scripts/refresh-focus-bell-audio.cjs; this legacy script would restore rejected sounds.')
DEST.mkdir(parents=True, exist_ok=True)
records = []

for key, filename, limit, repeats, gap in [
    ('bell', 'pleasing-bell.wav', None, 3, 0.22),
    ('fart', 'gastricdistress_bylfa_0.wav', 1.5, 1, 0),
    ('siren', 'alarm_0.wav', None, 1, 0),
]:
    with wave.open(str(SOURCE / 'originals' / filename), 'rb') as source:
        rate, channels = source.getframerate(), source.getnchannels()
        assert source.getsampwidth() == 2
        frames = min(source.getnframes(), round(limit * rate)) if limit else source.getnframes()
        data = array.array('h', source.readframes(frames))
        if sys.byteorder != 'little': data.byteswap()
    mono = [sum(data[i:i + channels]) / channels / 32768 for i in range(0, len(data), channels)]
    peak = max(abs(v) for v in mono)
    gain = 10 ** (-9 / 20) / peak if peak else 1
    fade_in, fade_out = round(rate * 0.004), round(rate * 0.03)
    mono = [v * gain * min(1, i / fade_in, (len(mono) - 1 - i) / fade_out) for i, v in enumerate(mono)]
    samples = []
    for i in range(repeats):
        if i: samples.extend([0] * round(gap * rate))
        samples.extend(mono)
    pcm = array.array('h', (round(max(-1, min(1, v)) * 32767) for v in samples))
    if sys.byteorder != 'little': pcm.byteswap()
    target = DEST / f'{key}.wav'
    with wave.open(str(target), 'wb') as output:
        output.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        output.writeframes(pcm.tobytes())
    records.append(dict(id=key, file=target.name, durationSeconds=len(samples)/rate,
        processing=dict(sourceStartSeconds=0, sourceDurationSeconds=frames/rate,
            repetitions=repeats, gapSeconds=gap, peakTargetDbFS=-9,
            fadeInSeconds=0.004, fadeOutSeconds=0.03, channels=1),
        measuredPeakDbFS=20*math.log10(max(abs(v) for v in samples)),
        sha256=hashlib.sha256(target.read_bytes()).hexdigest()))

# FLAC STREAMINFO: sample rate, channels, bit depth, total samples.
original = SOURCE / 'originals/synthetic_explosion_1.flac'
blob = original.read_bytes()
assert blob[:4] == b'fLaC' and blob[4] & 0x7f == 0
packed = int.from_bytes(blob[18:26], 'big')
rate = packed >> 44
frames = packed & ((1 << 36) - 1)
shutil.copyfile(original, DEST / 'bomb.flac')
records.append(dict(id='bomb', file='bomb.flac', durationSeconds=frames/rate,
    processing='Original FLAC, unchanged; loudness adjustment pending decoded playback review',
    sha256=hashlib.sha256(blob).hexdigest()))
manifest = dict(status='initial-candidates-not-connected-to-app',
    sourceManifest='../../../../artwork/toolkit/focus-bell/sources.json',
    license='CC0-1.0', sounds=records,
    verification='WAV PCM processed and FLAC STREAMINFO checked; listening and WebView playback QA pending')
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(records, ensure_ascii=False, indent=2))
