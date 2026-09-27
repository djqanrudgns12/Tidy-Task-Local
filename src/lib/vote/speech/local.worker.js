// 모델 파일만 내려받으며 투표 제목·이름·안건은 이 작업자 안에서만 처리합니다.
import * as ort from 'onnxruntime-web/wasm';
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { TextToSpeech, UnicodeProcessor, Style, writeWavFile } from './vendor/supertonic.js';
import manifest from './model-files.json';
import { cacheGet, cachePut, hash } from './cache.js';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { wasm, mjs };
const base = `https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/${manifest.revision}/`;
/** @type {any} */ let tts;
/** @type {Record<string,any>} */ const styles = {};
let busy = false;

/** @param {string} path @param {number} id */
async function modelFile(path, id) {
  const spec = /** @type {Record<string,{size:number,sha256:string}>} */ (manifest.files)[path];
  const key = `${manifest.revision}/${path}`;
  const cached = await cacheGet('models', key);
  if (cached instanceof ArrayBuffer && cached.byteLength === spec.size && await hash(cached) === spec.sha256) return cached;
  postMessage({ id, progress: `음성 자료 내려받는 중 · ${path.split('/').pop()}` });
  const response = await fetch(base + path, { credentials: 'omit', signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error('음성 자료를 내려받지 못했어요. 인터넷 연결을 확인해 주세요.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== spec.size || await hash(bytes) !== spec.sha256) throw new Error('음성 자료가 손상되었어요. 다시 준비해 주세요.');
  await cachePut('models', key, bytes);
  return bytes;
}
/** @param {number} id */
async function initialize(id) {
  if (tts) return;
  const json = async (/** @type {string} */ path) => JSON.parse(new TextDecoder().decode(await modelFile(path, id)));
  const cfg = await json('onnx/tts.json'), indexer = await json('onnx/unicode_indexer.json');
  const sessions = [];
  for (const name of ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder']) {
    const bytes = await modelFile(`onnx/${name}.onnx`, id);
    postMessage({ id, progress: '이 기기에서 사용할 음성을 준비하고 있어요' });
    sessions.push(await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }));
  }
  for (const [voice, name] of [['female', 'F1'], ['male', 'M1']]) {
    const data = await json(`voice_styles/${name}.json`);
    const tensor = (/** @type {any} */ s) => new ort.Tensor('float32', new Float32Array(s.data.flat(Infinity)), s.dims);
    styles[voice] = new Style(tensor(data.style_ttl), tensor(data.style_dp));
  }
  tts = new TextToSpeech(cfg, new UnicodeProcessor(indexer), ...sessions);
}
self.onmessage = async ({ data }) => {
  if (busy) { postMessage({ id: data.id, error: '음성을 하나씩 준비해 주세요.' }); return; }
  busy = true;
  try {
    if (typeof data.text !== 'string' || data.text.length > 500 || !['female', 'male'].includes(data.voice) || !['slow', 'normal'].includes(data.speed)) throw new Error('안내 문장을 확인해 주세요.');
    await initialize(data.id);
    const result = await tts.call(data.text, 'ko', styles[data.voice], 8, data.speed === 'slow' ? 0.9 : 1);
    if (!result.wav.length || result.wav.length > tts.sampleRate * 30 || result.wav.some((/** @type {number} */ n) => !Number.isFinite(n))) throw new Error('안내가 너무 길거나 음성을 만들지 못했어요. 읽는 방법을 짧게 고쳐 주세요.');
    // 과도한 피크를 피합니다. 실제 청취 음량은 공통 master에서 제어합니다.
    let peak = 0; for (const value of result.wav) peak = Math.max(peak, Math.abs(value));
    if (peak < 0.0001) throw new Error('음성에 소리가 없어요. 읽는 방법을 확인해 주세요.');
    const gain = Math.min(1, 0.7 / peak);
    const bytes = writeWavFile(result.wav.map((/** @type {number} */ v) => v * gain), tts.sampleRate);
    postMessage({ id: data.id, bytes }, { transfer: [bytes] });
  } catch (error) { postMessage({ id: data.id, error: error instanceof Error ? error.message : '음성을 준비하지 못했어요.' }); }
  finally { busy = false; }
};
