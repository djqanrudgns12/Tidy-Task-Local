// ═══════════════════════════════════════════════════════════════════════
// [업데이트 서명 확인] 앱(tauri-plugin-updater)과 똑같은 규칙으로 설치 파일의 서명을 확인합니다.
//
// 왜 배포 도구에서도 확인하는가:
//   다른 키로 서명한 설치 파일을 올리면 모든 사용자의 앱이 "공식 파일이 아님"으로 설치를 거부합니다.
//   사용자가 겪기 전에, 올리기 직전과 올린 직후에 같은 검사를 한 번씩 더 합니다.
//
// 형식 (minisign, Tauri는 파일 내용을 base64로 한 번 더 감쌉니다):
//   공개 키  : "untrusted comment: ...\n" + base64("Ed" + 키 번호 8바이트 + 공개 키 32바이트)
//   서명     : "untrusted comment: ...\n" + base64("ED" + 키 번호 8바이트 + 서명 64바이트) + "\n"
//              + "trusted comment: ...\n" + base64(전역 서명 64바이트)
//   "ED"는 파일의 BLAKE2b-512 요약에, "Ed"(옛 방식)는 파일 자체에 서명한 것입니다.
//   전역 서명은 (서명 64바이트 + trusted comment)에 대한 서명이라, 설명 문구를 바꿔치기해도 드러납니다.
// ═══════════════════════════════════════════════════════════════════════
import { createHash, createPublicKey, verify } from 'node:crypto';

// Ed25519 공개 키 32바이트를 Node가 읽는 SPKI(DER) 형식으로 감싸는 머리말
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const TRUSTED_PREFIX = 'trusted comment: ';

/** @param {string} value */
function unwrapBase64Text(value) {
  const text = Buffer.from(String(value).trim(), 'base64').toString('utf8');
  if (!text.startsWith('untrusted comment:')) {
    throw new Error('minisign 형식(base64로 감싼 파일 내용)이 아닙니다.');
  }
  return text.split(/\r?\n/);
}

// tauri.conf.json의 pubkey 값을 풉니다.
/** @param {string} pubkey @returns {{ keyId: string, key: Buffer }} */
export function decodePublicKey(pubkey) {
  const lines = unwrapBase64Text(pubkey);
  const raw = Buffer.from((lines[1] || '').trim(), 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') {
    throw new Error('공개 키 형식이 올바르지 않습니다.');
  }
  return { keyId: raw.subarray(2, 10).toString('hex'), key: raw.subarray(10) };
}

// .sig 파일 내용(= latest.json의 signature)을 풉니다.
/** @param {string} signature */
export function decodeSignature(signature) {
  const lines = unwrapBase64Text(signature);
  const raw = Buffer.from((lines[1] || '').trim(), 'base64');
  const trusted = lines[2] || '';
  const global = Buffer.from((lines[3] || '').trim(), 'base64');
  if (raw.length !== 74 || !trusted.startsWith(TRUSTED_PREFIX) || global.length !== 64) {
    throw new Error('서명 형식이 올바르지 않습니다.');
  }
  const algorithm = raw.subarray(0, 2).toString('latin1');
  if (algorithm !== 'ED' && algorithm !== 'Ed') {
    throw new Error(`알 수 없는 서명 방식입니다: ${algorithm}`);
  }
  return {
    algorithm,
    keyId: raw.subarray(2, 10).toString('hex'),
    signature: raw.subarray(10),
    trustedComment: trusted.slice(TRUSTED_PREFIX.length),
    globalSignature: global,
  };
}

// trusted comment의 "file:이름\tversion:1.2.3" 같은 항목을 읽습니다.
/** @param {string} trustedComment @returns {Record<string, string>} */
export function parseTrustedComment(trustedComment) {
  /** @type {Record<string, string>} */
  const fields = {};
  for (const part of String(trustedComment).split('\t')) {
    const at = part.indexOf(':');
    if (at > 0) fields[part.slice(0, at)] = part.slice(at + 1);
  }
  return fields;
}

// 서명이 맞으면 { keyId, trustedComment, fields }를 돌려주고, 틀리면 이유를 담아 예외를 던집니다.
/** @param {Buffer | Uint8Array} data @param {string} signature @param {string} pubkey */
export function verifySignature(data, signature, pubkey) {
  const publicKey = decodePublicKey(pubkey);
  const parsed = decodeSignature(signature);
  if (parsed.keyId !== publicKey.keyId) {
    throw new Error(
      `서명한 키(${parsed.keyId})가 앱에 들어 있는 공개 키(${publicKey.keyId})와 다릅니다. ` +
      '다른 키로 서명한 파일을 올리면 사용자 앱이 설치를 거부합니다.',
    );
  }
  const keyObject = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey.key]),
    format: 'der',
    type: 'spki',
  });
  const message = parsed.algorithm === 'ED'
    ? createHash('blake2b512').update(data).digest()
    : Buffer.from(data);
  if (!verify(null, message, keyObject, parsed.signature)) {
    throw new Error('파일 내용이 서명과 맞지 않습니다(파일이 바뀌었거나 다른 파일의 서명입니다).');
  }
  const globalMessage = Buffer.concat([parsed.signature, Buffer.from(parsed.trustedComment, 'utf8')]);
  if (!verify(null, globalMessage, keyObject, parsed.globalSignature)) {
    throw new Error('서명의 설명(trusted comment)이 바뀌었습니다.');
  }
  return {
    keyId: parsed.keyId,
    trustedComment: parsed.trustedComment,
    fields: parseTrustedComment(parsed.trustedComment),
  };
}
