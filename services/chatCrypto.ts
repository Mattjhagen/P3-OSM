const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface EncryptedEnvelope {
  enc_v: 1;
  alg: 'AES-GCM';
  iv: string;
  ciphertext: string;
  aad?: string;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const importDek = async (keyB64: string): Promise<CryptoKey> => {
  const keyBytes = fromBase64(keyB64);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const generateDekB64 = async (): Promise<string> => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes);
};

export const encryptWithDek = async (
  plaintext: string,
  keyB64: string,
  aadPayload?: Record<string, unknown>
): Promise<EncryptedEnvelope> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importDek(keyB64);
  const aadJson = aadPayload ? JSON.stringify(aadPayload) : '';
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: textEncoder.encode(aadJson),
    },
    key,
    textEncoder.encode(String(plaintext || ''))
  );
  return {
    enc_v: 1,
    alg: 'AES-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    ...(aadJson ? { aad: aadJson } : {}),
  };
};

export const decryptWithDek = async (
  envelope: EncryptedEnvelope,
  keyB64: string
): Promise<string> => {
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await importDek(keyB64);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: textEncoder.encode(String(envelope.aad || '')),
    },
    key,
    ciphertext
  );
  return textDecoder.decode(new Uint8Array(decrypted));
};

