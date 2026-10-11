// One-time probe of what the current machine can do, shared by every AI
// pipeline (face landmarks, background removal) so they all make the same
// hardware decision instead of each guessing on its own.
//
// The probe is cheap and cached for the lifetime of the page. A GPU path that
// fails at runtime is remembered (per machine, via localStorage) so the next
// launch goes straight to the CPU path instead of failing again.

export type DeviceTier = 'low' | 'mid' | 'high';

export interface DeviceProfile {
  /** A WebGPU adapter is available (used for background removal). */
  webgpu: boolean;
  /** WebGL2 is available (used by the MediaPipe GPU delegate). */
  webgl2: boolean;
  /** Logical CPU cores reported by the browser. */
  cores: number;
  /** Approximate device memory in GB (Chromium only), null when unknown. */
  memoryGB: number | null;
  /** Coarse performance tier derived from the numbers above. */
  tier: DeviceTier;
  /** Primary input is touch (phones / tablets). */
  touch: boolean;
}

const GPU_FAILED_KEY = 'pids-gpu-failed-v1';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Remember that the GPU path crashed on this machine so we stop retrying it. */
export function markGpuFailed(): void {
  try {
    localStorage.setItem(GPU_FAILED_KEY, '1');
  } catch {
    /* storage unavailable — the in-memory fallback still applies */
  }
}

export function isGpuMarkedFailed(): boolean {
  return readFlag(GPU_FAILED_KEY);
}

async function probeWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    // Some drivers never resolve requestAdapter(); don't let that stall the app.
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return adapter != null;
  } catch {
    return false;
  }
}

function probeWebGl2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

function computeTier(cores: number, memoryGB: number | null): DeviceTier {
  if (cores <= 4 || (memoryGB !== null && memoryGB <= 4)) return 'low';
  if (cores >= 8 && (memoryGB === null || memoryGB >= 8)) return 'high';
  return 'mid';
}

let profilePromise: Promise<DeviceProfile> | null = null;

export function getDeviceProfile(): Promise<DeviceProfile> {
  if (profilePromise) return profilePromise;
  profilePromise = (async () => {
    if (typeof window === 'undefined') {
      return { webgpu: false, webgl2: false, cores: 4, memoryGB: null, tier: 'mid', touch: false };
    }
    const cores = navigator.hardwareConcurrency || 4;
    const memoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
    const gpuBlocked = isGpuMarkedFailed();
    const [webgpu, webgl2] = await Promise.all([
      gpuBlocked ? Promise.resolve(false) : probeWebGpu(),
      Promise.resolve(gpuBlocked ? false : probeWebGl2()),
    ]);
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return { webgpu, webgl2, cores, memoryGB, tier: computeTier(cores, memoryGB), touch };
  })();
  return profilePromise;
}

/**
 * Run `fn` when the browser is idle (or after `timeout` ms at the latest), so
 * background work never competes with input or the first paint. Returns a
 * function that cancels it.
 */
export function onIdle(fn: () => void, timeout = 2000): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback!(id);
  }
  // Safari has no requestIdleCallback.
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}

/**
 * The user asked to save data, is on a very slow connection, or the device has
 * very little memory. Optional background downloads (e.g. pre-loading the
 * 40–90 MB background-removal model) are skipped there and happen on first use.
 */
export function isConstrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const conn = nav.connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true;
  return nav.deviceMemory !== undefined && nav.deviceMemory <= 2;
}
