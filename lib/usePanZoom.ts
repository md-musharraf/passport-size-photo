'use client';
// Unified drag-to-pan + zoom gestures for the photo canvases.
//
// - Pointer Events, so mouse, touch and pen all work (the old handlers were
//   mouse-only, which made the editor unusable on touch screens).
// - Two-finger pinch zooms; trackpad/mouse wheel zooms (non-passive listener,
//   so the page itself never scrolls underneath).
// - Updates are coalesced to one per animation frame, keeping dragging smooth
//   even though every move re-renders the editor.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface PanZoomStart {
  x: number;
  y: number;
  scale: number;
}

export interface PanZoomHandlers {
  /** Values captured at gesture start (current pan position % and zoom %). */
  getStart: () => PanZoomStart;
  /** Pointer moved by (dxPct, dyPct) of the element size since the gesture started. */
  onPan: (dxPct: number, dyPct: number, start: PanZoomStart) => void;
  /** Zoom by `factor` relative to the gesture start (pinch) or the current value (wheel). */
  onZoom: (factor: number, start: PanZoomStart) => void;
  /** Gesture finished — good moment for an undo snapshot. */
  onEnd?: () => void;
}

const WHEEL_STEP = 0.06;
const WHEEL_IDLE_MS = 250;

export function usePanZoom(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  handlers: PanZoomHandlers,
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false);
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let start: PanZoomStart | null = null;
    let origin = { x: 0, y: 0 };
    let pinchStartDist = 0;
    let frame = 0;
    let pending: (() => void) | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (fn: () => void) => {
      pending = fn;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const run = pending;
          pending = null;
          run?.();
        });
      }
    };

    const centroid = () => {
      let x = 0;
      let y = 0;
      pointers.forEach((p) => {
        x += p.x;
        y += p.y;
      });
      return { x: x / pointers.size, y: y / pointers.size };
    };
    const spread = () => {
      const [a, b] = Array.from(pointers.values());
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    // (Re)start a gesture from the current state — called whenever the
    // number of fingers changes so pan and pinch never jump.
    const begin = () => {
      start = handlersRef.current.getStart();
      origin = centroid();
      pinchStartDist = pointers.size >= 2 ? spread() : 0;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      begin();
      setIsDragging(true);
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = start;
      const c = centroid();
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      const dist = pointers.size >= 2 ? spread() : 0;
      schedule(() => {
        handlersRef.current.onPan(((c.x - origin.x) / w) * 100, ((c.y - origin.y) / h) * 100, s);
        if (pinchStartDist > 0 && dist > 0) handlersRef.current.onZoom(dist / pinchStartDist, s);
      });
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size > 0) {
        begin();
        return;
      }
      start = null;
      setIsDragging(false);
      handlersRef.current.onEnd?.();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpads send many small deltas, mice a few big ones; normalise both.
      const steps = Math.max(-3, Math.min(3, -e.deltaY / 100));
      const factor = Math.pow(1 + WHEEL_STEP, steps);
      const s = handlersRef.current.getStart();
      schedule(() => handlersRef.current.onZoom(factor, s));
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => handlersRef.current.onEnd?.(), WHEEL_IDLE_MS);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      if (frame) cancelAnimationFrame(frame);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [ref, enabled]);

  return { isDragging };
}
