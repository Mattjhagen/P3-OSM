import type { PortalPinLockSettings } from '../types';

export const PORTAL_PIN_MIN_LENGTH = 4;
export const PORTAL_PIN_MAX_LENGTH = 6;
export const PORTAL_PIN_TIMEOUT_OPTIONS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_PORTAL_PIN_TIMEOUT_MINUTES = 10;

const PORTAL_PIN_HASH_NAMESPACE = 'p3-portal-pin-v1';

type PortalPinTimeoutOption = (typeof PORTAL_PIN_TIMEOUT_OPTIONS)[number];

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const toBase64 = (value: string): string => {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value);
  }
  return Buffer.from(value, 'utf8').toString('base64');
};

const normalizeTimeoutCandidate = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return DEFAULT_PORTAL_PIN_TIMEOUT_MINUTES;
};

export const normalizePortalPinTimeout = (value: unknown): PortalPinTimeoutOption => {
  const candidate = normalizeTimeoutCandidate(value);
  if (PORTAL_PIN_TIMEOUT_OPTIONS.includes(candidate as PortalPinTimeoutOption)) {
    return candidate as PortalPinTimeoutOption;
  }
  return DEFAULT_PORTAL_PIN_TIMEOUT_MINUTES;
};

export const normalizePortalPinInput = (value: string): string =>
  String(value || '')
    .replace(/\D/g, '')
    .slice(0, PORTAL_PIN_MAX_LENGTH);

export const validatePortalPin = (pin: string): string | null => {
  const normalized = normalizePortalPinInput(pin);
  if (normalized.length < PORTAL_PIN_MIN_LENGTH || normalized.length > PORTAL_PIN_MAX_LENGTH) {
    return `PIN must be ${PORTAL_PIN_MIN_LENGTH} to ${PORTAL_PIN_MAX_LENGTH} digits.`;
  }
  if (!/^\d+$/.test(normalized)) {
    return 'PIN must contain only digits.';
  }
  return null;
};

export const normalizePortalPinLockSettings = (
  settings: Partial<PortalPinLockSettings> | undefined
): PortalPinLockSettings => {
  const pinHash = String(settings?.pinHash || '').trim();
  const parsedLength = Number(settings?.pinLength || 0);
  const pinLength =
    Number.isFinite(parsedLength) &&
    parsedLength >= PORTAL_PIN_MIN_LENGTH &&
    parsedLength <= PORTAL_PIN_MAX_LENGTH
      ? parsedLength
      : 0;
  const inactivityMinutes = normalizePortalPinTimeout(settings?.inactivityMinutes);
  const enabled = Boolean(settings?.enabled) && pinHash.length > 0;
  const updatedAt = String(settings?.updatedAt || '').trim();

  return {
    enabled,
    inactivityMinutes,
    pinHash,
    pinLength,
    updatedAt,
  };
};

export const hashPortalPin = async (pin: string, userId: string): Promise<string> => {
  const normalizedPin = normalizePortalPinInput(pin);
  const normalizedUserId = String(userId || '').trim().toLowerCase();
  const source = `${normalizedUserId}:${normalizedPin}:${PORTAL_PIN_HASH_NAMESPACE}`;
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const encoded = new TextEncoder().encode(source);
    const digest = await subtle.digest('SHA-256', encoded);
    return `sha256:${toHex(new Uint8Array(digest))}`;
  }

  return `legacy:${toBase64(source)}`;
};

export const verifyPortalPin = async (
  pin: string,
  userId: string,
  expectedHash: string
): Promise<boolean> => {
  const normalizedExpectedHash = String(expectedHash || '').trim();
  if (!normalizedExpectedHash) return false;
  const actualHash = await hashPortalPin(pin, userId);
  return actualHash === normalizedExpectedHash;
};
