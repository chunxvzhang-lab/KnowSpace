// Setup test environment
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
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

const storageInstance = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storageInstance,
  writable: true,
  configurable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageInstance,
    writable: true,
    configurable: true,
  });
}

// ─── jsdom gaps ──────────────────────────────────────────────────────────────
//
// jsdom implements layout as a no-op, so scrolling APIs are simply absent.
// App.tsx scrolls the reader container when jumping to a heading or restoring a
// reading position, and without these the shell throws on mount — which is why
// no test rendered <App /> until now.
//
// The stubs record the requested position on the element so assertions can
// still observe where the app *wanted* to scroll.

type ScrollTarget = { top?: number; left?: number };

function applyScrollStub(target: Element) {
  return function scrollTo(this: Element, arg?: number | ScrollTarget, y?: number) {
    if (typeof arg === "object" && arg !== null) {
      if (typeof arg.top === "number") (this as HTMLElement).scrollTop = arg.top;
      if (typeof arg.left === "number") (this as HTMLElement).scrollLeft = arg.left;
    } else if (typeof arg === "number") {
      (this as HTMLElement).scrollTop = arg;
      if (typeof y === "number") (this as HTMLElement).scrollLeft = y;
    }
  };
}

if (typeof Element !== "undefined") {
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = applyScrollStub(Element.prototype) as Element["scrollTo"];
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
