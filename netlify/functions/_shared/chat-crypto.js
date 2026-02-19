import { createHash, webcrypto } from 'crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const fromBase64 = (value) => new Uint8Array(Buffer.from(String(value || ''), 'base64'));

const cryptoApi = globalThis.crypto || webcrypto;
const importAesKey = async (rawBytes) =>
  cryptoApi.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

const normalizeEscrowSecret = (secret) => {
  const normalized = String(secret || '').trim();
  if (!normalized) throw new Error('missing_chat_escrow_secret');
  const digest = createHash('sha256').update(normalized).digest();
  return new Uint8Array(digest);
};

const buildAdditionalData = (aadValue) => encoder.encode(String(aadValue || ''));

export const generateDekB64 = () => {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return toBase64(bytes);
};

export const encryptPlaintextWithDek = async (plaintext, dekB64, aadValue = '') => {
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(fromBase64(dekB64));
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: buildAdditionalData(aadValue) },
    key,
    encoder.encode(String(plaintext || ''))
  );
  return {
    enc_v: 1,
    alg: 'AES-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    ...(aadValue ? { aad: String(aadValue) } : {}),
  };
};

export const decryptEnvelopeWithDek = async (envelope, dekB64) => {
  const iv = fromBase64(envelope?.iv || '');
  const ciphertext = fromBase64(envelope?.ciphertext || '');
  const key = await importAesKey(fromBase64(dekB64));
  const decrypted = await cryptoApi.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: buildAdditionalData(envelope?.aad || ''),
    },
    key,
    ciphertext
  );
  return decoder.decode(new Uint8Array(decrypted));
};

export const wrapDekForEscrow = async (dekB64, escrowSecret) => {
  const wrapIv = cryptoApi.getRandomValues(new Uint8Array(12));
  const escrowKey = await importAesKey(normalizeEscrowSecret(escrowSecret));
  const wrapped = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv, additionalData: encoder.encode('chat_escrow_v1') },
    escrowKey,
    fromBase64(dekB64)
  );
  return {
    wrappedDek: toBase64(new Uint8Array(wrapped)),
    wrapIv: toBase64(wrapIv),
    wrapAlg: 'AES-GCM',
  };
};

export const unwrapDekFromEscrow = async ({ wrappedDek, wrapIv }, escrowSecret) => {
  const escrowKey = await importAesKey(normalizeEscrowSecret(escrowSecret));
  const decrypted = await cryptoApi.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(wrapIv),
      additionalData: encoder.encode('chat_escrow_v1'),
    },
    escrowKey,
    fromBase64(wrappedDek)
  );
  return toBase64(new Uint8Array(decrypted));
};

