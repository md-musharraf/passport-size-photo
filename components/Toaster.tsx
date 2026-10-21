'use client';
import { useEffect, useState } from 'react';
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo, FiX } from 'react-icons/fi';
import { subscribeToasts, type ToastMessage } from '@/lib/toast';

const ICONS = {
  success: FiCheckCircle,
  info: FiInfo,
  warning: FiAlertTriangle,
  error: FiAlertCircle,
};

const TONES = {
  success: 'text-success-app',
  info: 'text-accent-app',
  warning: 'text-warning-app',
  error: 'text-danger-app',
};

export default function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(
    () =>
      subscribeToasts((t) => {
        // The same message twice at once is noise: show it once.
        setItems((prev) => (prev.some((x) => x.text === t.text) ? prev : [...prev.slice(-2), t]));
        setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.kind === 'error' ? 7000 : 4000);
      }),
    [],
  );

  return (
    <div
      className="fixed z-[100] bottom-20 left-1/2 -translate-x-1/2 w-[min(92vw,420px)] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto animate-slideUp flex items-start gap-3 rounded-lg border border-border-app bg-card-app px-4 py-3 text-[14px] text-text-primary elevate-lg"
          >
            <Icon className={`w-[18px] h-[18px] mt-0.5 shrink-0 ${TONES[t.kind]}`} />
            <p className="flex-1 leading-snug">{t.text}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-text-secondary hover:text-text-primary cursor-pointer"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
