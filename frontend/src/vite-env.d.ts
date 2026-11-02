
/// <reference types="vite/client" />

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, callback: (...args: any[]) => void) => void;
    removeAllListeners: (event: string) => void;
  };
}
