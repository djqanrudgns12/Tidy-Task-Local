"""무료 로컬 모델로 기본 안내를 제작합니다. 검수 상태는 자동 승인하지 않습니다.
실행: python scripts/vote-speech/generate.py --model-dir output/vote-speech-research/model
필요: numpy, onnxruntime, ffmpeg, ffprobe, node. 모델 파일은 README의 고정 출처를 사용합니다.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import wave
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).parent / 'vendor'))
from supertonic import load_text_to_speech, load_voice_style

MODEL_REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', type=pathlib.Path, required=True)
    parser.add_argument('--only', default='')
    args = parser.parse_args()
    catalog = json.loads(subprocess.check_output(['node', 'scripts/vote-speech/catalog.mjs'], cwd=ROOT))
    output = ROOT / 'src/assets/vote/speech'
    originals = ROOT / 'output/vote-speech/originals'
    output.mkdir(parents=True, exist_ok=True)
    originals.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'manifest.json'
    entries = json.loads(manifest_path.read_text('utf-8'))['entries'] if manifest_path.exists() else {}
    expected = {f'{v}.{s}.{k}' for v in ['female', 'male'] for s in ['normal', 'slow'] for k in catalog['entries']}
    for key in list(entries):
        if key not in expected:
            stale = (output / entries[key]['file']).resolve()
            if stale.parent != output.resolve() or stale.suffix != '.mp3':
                raise RuntimeError('이전 음원 경로를 확인해 주세요.')
            stale.unlink(missing_ok=True)
            del entries[key]
    tts = load_text_to_speech(str(args.model_dir / 'onnx'))
    for voice, style_name in [('female', 'F1'), ('male', 'M1')]:
        style = load_voice_style([str(args.model_dir / f'voice_styles/{style_name}.json')])
        for index, (key, text) in enumerate(catalog['entries'].items()):
            if args.only and key != args.only:
                continue
            text_hash = hashlib.sha256(text.encode()).hexdigest()
            normal_key = f'{voice}.normal.{key}'
            if all(entries.get(f'{voice}.{speed}.{key}', {}).get('textHash') == text_hash and (output / f'{voice}.{speed}.{key}.mp3').exists() for speed in ['normal', 'slow']):
                continue
            np.random.seed(int(text_hash[:8], 16))
            wav, duration = tts(text, 'ko', style, total_step=8, speed=1.0)
            pcm = (np.clip(wav[0], -1, 1) * 32767).astype('<i2')
            source = originals / f'{voice}.{key}.wav'
            with wave.open(str(source), 'wb') as file:
                file.setnchannels(1)
                file.setsampwidth(2)
                file.setframerate(tts.sample_rate)
                file.writeframes(pcm.tobytes())
            for speed in ['normal', 'slow']:
                entry_key = f'{voice}.{speed}.{key}'
                target = output / f'{entry_key}.mp3'
                filters = ('atempo=0.9,' if speed == 'slow' else '') + 'loudnorm=I=-20:TP=-3:LRA=7'
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source), '-af', filters, '-ar', '44100', '-ac', '1', '-b:a', '80k', str(target)], check=True)
                seconds = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(target)]))
                entries[entry_key] = {'file': target.name, 'text': text, 'textHash': text_hash, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'durationMs': round(seconds * 1000), 'voice': voice, 'style': style_name, 'speed': speed, 'reviewStatus': 'pending'}
            manifest = {'version': 1, 'catalogVersion': catalog['version'], 'provider': 'supertonic-3-local', 'modelRevision': MODEL_REVISION, 'steps': 8, 'entries': entries}
            temporary = manifest_path.with_suffix('.tmp')
            temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
            temporary.replace(manifest_path)
            print(f'{voice} {index + 1}/{len(catalog["entries"])} {key}', flush=True)
    # 모든 파일이 재사용되어도 오래된 대본 항목 제거를 저장합니다.
    manifest = {'version': 1, 'catalogVersion': catalog['version'], 'provider': 'supertonic-3-local', 'modelRevision': MODEL_REVISION, 'steps': 8, 'entries': entries}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')


if __name__ == '__main__':
    main()
