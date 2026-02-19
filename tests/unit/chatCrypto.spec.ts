import { describe, expect, it } from 'vitest';
import { decryptWithDek, encryptWithDek, generateDekB64 } from '../../services/chatCrypto';

describe('chatCrypto', () => {
  it('encrypts and decrypts message payloads', async () => {
    const dek = await generateDekB64();
    const envelope = await encryptWithDek('hello secure world', dek, { keyRef: 'thread-1' });
    const plaintext = await decryptWithDek(envelope, dek);
    expect(plaintext).toBe('hello secure world');
    expect(envelope.enc_v).toBe(1);
    expect(envelope.alg).toBe('AES-GCM');
  });
});

