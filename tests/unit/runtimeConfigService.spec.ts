import { RuntimeConfigService } from '../../services/runtimeConfigService';

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

describe('RuntimeConfigService', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = { localStorage: new MockStorage() };
  });

  afterAll(() => {
    (globalThis as any).window = originalWindow;
  });

  it('uses env fallback when runtime value is not set', () => {
    const value = RuntimeConfigService.getEffectiveValue('GEMINI_API_KEY', 'env-key-123');
    expect(value).toBe('env-key-123');
  });

  it('saves runtime config values with metadata', () => {
    const entry = RuntimeConfigService.setConfigValue('COINGECKO_API_KEY', 'abc123', 'admin@p3lending.space');

    expect(entry.value).toBe('abc123');
    expect(entry.updatedBy).toBe('admin@p3lending.space');
    expect(entry.rotationCount).toBe(0);
    expect(RuntimeConfigService.getConfigValue('COINGECKO_API_KEY')).toBe('abc123');
  });

  it('increments rotation count when rotating a key', () => {
    RuntimeConfigService.setConfigValue('GEMINI_API_KEY', 'first-key', 'admin@p3lending.space');
    const rotated = RuntimeConfigService.rotateConfigValue('GEMINI_API_KEY', 'second-key', 'admin@p3lending.space');

    expect(rotated.value).toBe('second-key');
    expect(rotated.rotationCount).toBe(1);
  });

  it('clears runtime override and returns to fallback', () => {
    RuntimeConfigService.setConfigValue('BACKEND_URL', 'https://runtime.example.com', 'admin@p3lending.space');
    RuntimeConfigService.clearConfigValue('BACKEND_URL');

    const value = RuntimeConfigService.getEffectiveValue('BACKEND_URL', 'https://env.example.com');
    expect(value).toBe('https://env.example.com');
  });
});

