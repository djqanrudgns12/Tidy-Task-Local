"""고정 버전과 SHA-256을 확인한 모델만 제작 폴더에 저장합니다."""
import argparse
import hashlib
import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--model-dir', type=pathlib.Path, required=True)
args = parser.parse_args()
manifest = json.loads((root / 'src/lib/vote/speech/model-files.json').read_text('utf-8'))
base = f'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/{manifest["revision"]}/'
for name, spec in manifest['files'].items():
    target = args.model_dir / name
    def valid(path):
        return path.exists() and path.stat().st_size == spec['size'] and hashlib.sha256(path.read_bytes()).hexdigest() == spec['sha256']
    if valid(target):
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.download')
    with urllib.request.urlopen(base + name, timeout=180) as response, temporary.open('wb') as output:
        while data := response.read(1024 * 1024):
            output.write(data)
    if not valid(temporary):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f'모델 검증 실패: {name}')
    temporary.replace(target)
    print(name, flush=True)
