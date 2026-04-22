import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// jsdom does not implement HTMLMediaElement.play / pause; stub them so
// components using <audio>/new Audio() don't crash under test.
window.HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
window.HTMLMediaElement.prototype.pause = function () {};

// Node 25 exposes a native (experimental) `localStorage` placeholder that
// shadows jsdom's implementation and lacks `setItem` / `clear` / etc. when
// no `--localstorage-file` is provided. Replace both `window.localStorage`
// and `globalThis.localStorage` with a simple in-memory Storage polyfill
// so tests that rely on browser storage behave correctly.
class MemoryStorage implements Storage {
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
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
  const storage = new MemoryStorage();
  Object.defineProperty(window, name, {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
  });
}

installStorage('localStorage');
installStorage('sessionStorage');

// Reset data-theme between tests so residual state from one test doesn't
// leak into another (jsdom keeps documentElement attributes across tests).
beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});
