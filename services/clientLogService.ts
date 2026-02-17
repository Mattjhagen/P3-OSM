export type ClientLogLevel = 'info' | 'warn' | 'error';
export type ClientLogSource = 'console' | 'window_error' | 'unhandled_rejection' | 'manual';

export interface ClientLogEntry {
  id: string;
  level: ClientLogLevel;
  source: ClientLogSource;
  message: string;
  context?: string;
  timestamp: number;
}

const STORAGE_KEY = 'p3_client_logs_v1';
const MAX_LOG_ENTRIES = 400;

let installed = false;
let captureMuted = false;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  return window.localStorage;
};

const asString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message || 'Error';
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
};

const readLogs = (): ClientLogEntry[] => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => item && typeof item.message === 'string');
  } catch {
    return [];
  }
};

const writeLogs = (logs: ClientLogEntry[]) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOG_ENTRIES)));
};

const appendLog = (entry: Omit<ClientLogEntry, 'id' | 'timestamp'>) => {
  if (captureMuted) return;

  const logs = readLogs();
  logs.push({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    ...entry,
  });
  writeLogs(logs);
};

export const ClientLogService = {
  installGlobalCapture: () => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalConsole = {
      info: console.info.bind(console),
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    const wrap =
      (level: ClientLogLevel, original: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        original(...args);
        appendLog({
          level,
          source: 'console',
          message: args.map(asString).join(' '),
        });
      };

    console.info = wrap('info', originalConsole.info);
    console.log = wrap('info', originalConsole.log);
    console.warn = wrap('warn', originalConsole.warn);
    console.error = wrap('error', originalConsole.error);

    window.addEventListener('error', (event) => {
      appendLog({
        level: 'error',
        source: 'window_error',
        message: event.message || 'Unhandled window error',
        context: `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      appendLog({
        level: 'error',
        source: 'unhandled_rejection',
        message: asString(event.reason),
      });
    });
  },

  addManualLog: (message: string, level: ClientLogLevel = 'info') => {
    appendLog({
      level,
      source: 'manual',
      message: message.trim(),
    });
  },

  getLogs: (limit = 200): ClientLogEntry[] => {
    return readLogs().slice(-Math.max(1, limit)).reverse();
  },

  clearLogs: () => {
    writeLogs([]);
  },

  withMutedCapture: async <T>(fn: () => Promise<T>): Promise<T> => {
    captureMuted = true;
    try {
      return await fn();
    } finally {
      captureMuted = false;
    }
  },
};

