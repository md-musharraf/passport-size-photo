// Tiny app-wide toast notifier. Replaces blocking `alert()` popups with
// non-blocking messages rendered by <Toaster /> (components/Toaster.tsx).

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

type Listener = (t: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function toast(text: string, kind: ToastKind = 'info'): void {
  const msg = { id: nextId++, kind, text };
  if (listeners.size === 0) {
    // No toaster mounted (e.g. very early in startup) — still surface it.
    console.warn(`[${kind}] ${text}`);
    return;
  }
  listeners.forEach((l) => l(msg));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
