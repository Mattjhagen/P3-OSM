import { ClientLogService } from '../../services/clientLogService';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('ClientLogService', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = { localStorage: new MockStorage() };
    ClientLogService.clearLogs();
  });

  afterAll(() => {
    (globalThis as any).window = originalWindow;
  });

  it('stores and retrieves manual logs', () => {
    ClientLogService.addManualLog('render deploy failed', 'error');
    const logs = ClientLogService.getLogs(10);

    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('render deploy failed');
    expect(logs[0].level).toBe('error');
  });

  it('clears logs', () => {
    ClientLogService.addManualLog('temp message', 'warn');
    expect(ClientLogService.getLogs(10).length).toBe(1);

    ClientLogService.clearLogs();
    expect(ClientLogService.getLogs(10).length).toBe(0);
  });
});

