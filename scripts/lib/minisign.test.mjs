import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { decodePublicKey, decodeSignature, parseTrustedComment, verifySignature } from './minisign.mjs';

// 실제 Tauri CLI(2.10.1)가 만든 시험용 키와 서명입니다. (배포 키와 무관한 버리는 키)
// 내용: "hello\n" 을 `tauri signer sign`으로 서명
const CLI_PUBKEY = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDE3RUExREMxMERGQTY4NTQKUldSVWFQb053UjNxRnhKM2Z3RjZ3Y2FQQ3JyTVpDcWM1bHRQbHNaN0trdDFaT1g1ckVNSjFCeDMK';
const CLI_SIGNATURE = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSVWFQb053UjNxRjV4L0czWjdGUGhSUE9odnNVbXdNTmp4K1dlVlUwMUF5RWZGcEFaTWNBSzN1MmJOR0VOZ3JibFhjWDJ1UDU0S05GUUVkRGlWRGFKMWRsM00yeVk2RUFFPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwMDMzNTMzCWZpbGU6ZHVtbXkuZXhlCjNWS0RBQmJla09oYytKQi9jTENWRU9PSm5DQm5ZTHU5dEpwNVVqQkxRWWNaNUc3ZVMrRTRubU5JUkFscU55QUYzTHAyaE9taE5id0plVjk1QmswekFRPT0K';
const CLI_DATA = Buffer.from('hello\n');

// 시험 중에 새 키를 만들어 minisign 형식으로 서명합니다 (틀린 경우를 자유롭게 만들기 위해).
function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  const keyId = randomBytes(8);
  const text = `untrusted comment: minisign public key: TEST\n${Buffer.concat([Buffer.from('Ed'), keyId, raw]).toString('base64')}\n`;
  return { privateKey, keyId, pubkey: Buffer.from(text).toString('base64') };
}

/** @param {ReturnType<typeof makeKey>} key @param {Buffer} data */
function signData(key, data, { trusted = 'timestamp:1\tfile:app.exe', prehashed = true, trustedShown = trusted } = {}) {
  const message = prehashed ? createHash('blake2b512').update(data).digest() : data;
  const signature = sign(null, message, key.privateKey);
  const global = sign(null, Buffer.concat([signature, Buffer.from(trusted)]), key.privateKey);
  const head = Buffer.concat([Buffer.from(prehashed ? 'ED' : 'Ed'), key.keyId, signature]).toString('base64');
  const text = `untrusted comment: signature from tauri secret key\n${head}\ntrusted comment: ${trustedShown}\n${global.toString('base64')}\n`;
  return Buffer.from(text).toString('base64');
}

test('verifySignature: 실제 Tauri CLI가 만든 서명을 앱과 같은 규칙으로 확인한다', () => {
  const result = verifySignature(CLI_DATA, CLI_SIGNATURE, CLI_PUBKEY);
  assert.equal(result.fields.file, 'dummy.exe');
  assert.equal(result.fields.timestamp, '1790033533');
  assert.equal(decodeSignature(CLI_SIGNATURE).algorithm, 'ED');
});

test('verifySignature: 한 바이트라도 바뀐 파일은 거부한다', () => {
  assert.throws(() => verifySignature(Buffer.from('hellp\n'), CLI_SIGNATURE, CLI_PUBKEY), /파일 내용이 서명과 맞지 않습니다/);
  assert.throws(() => verifySignature(Buffer.alloc(0), CLI_SIGNATURE, CLI_PUBKEY), /파일 내용이 서명과 맞지 않습니다/);
});

test('verifySignature: 다른 키로 서명한 파일은 키 번호부터 다르다고 알려 준다', () => {
  const other = makeKey();
  const signature = signData(other, CLI_DATA);
  assert.throws(() => verifySignature(CLI_DATA, signature, CLI_PUBKEY), /공개 키.*다릅니다/);
  // 같은 키라면 통과합니다.
  assert.equal(verifySignature(CLI_DATA, signature, other.pubkey).fields.file, 'app.exe');
});

test('verifySignature: 설명(trusted comment)을 바꿔치기하면 거부한다', () => {
  const key = makeKey();
  const data = randomBytes(4096);
  const forged = signData(key, data, { trusted: 'timestamp:1\tfile:old.exe', trustedShown: 'timestamp:1\tfile:new.exe' });
  assert.throws(() => verifySignature(data, forged, key.pubkey), /설명\(trusted comment\)이 바뀌었습니다/);
});

test('verifySignature: 요약 없이 서명한 옛 방식(Ed)도 확인한다', () => {
  const key = makeKey();
  const data = randomBytes(1024);
  const signature = signData(key, data, { prehashed: false });
  assert.equal(decodeSignature(signature).algorithm, 'Ed');
  assert.ok(verifySignature(data, signature, key.pubkey));
  assert.throws(() => verifySignature(Buffer.concat([data, Buffer.from([0])]), signature, key.pubkey));
});

test('decodePublicKey / decodeSignature: 형식이 아닌 값은 이유와 함께 거부한다', () => {
  assert.equal(decodePublicKey(CLI_PUBKEY).keyId, decodeSignature(CLI_SIGNATURE).keyId);
  for (const bad of ['', 'not base64 !!', Buffer.from('hello').toString('base64')]) {
    assert.throws(() => decodePublicKey(bad), /형식/);
    assert.throws(() => decodeSignature(bad), /형식/);
  }
  // 서명 자리에 공개 키를 넣은 실수
  assert.throws(() => decodeSignature(CLI_PUBKEY), /서명 형식/);
});

test('parseTrustedComment: 탭으로 나뉜 key:value를 읽는다', () => {
  assert.deepEqual(parseTrustedComment('timestamp:1\tfile:Tidy Task_5.5.3_x64-setup.exe\tversion:5.5.3'), {
    timestamp: '1',
    file: 'Tidy Task_5.5.3_x64-setup.exe',
    version: '5.5.3',
  });
  assert.deepEqual(parseTrustedComment(''), {});
});
