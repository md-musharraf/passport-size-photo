// jsPDF (with its optional html2canvas / DOMPurify pieces) is one of the
// largest libraries in the app but is only needed at export time, so it is
// loaded on demand instead of being part of the first page load.

import type { jsPDF as JsPDF } from 'jspdf';

let jsPdfPromise: Promise<typeof JsPDF> | null = null;

/** Load (once) and return the jsPDF constructor. */
export function loadJsPDF(): Promise<typeof JsPDF> {
  if (!jsPdfPromise) {
    jsPdfPromise = import('jspdf')
      .then((m) => m.jsPDF)
      .catch((err) => {
        jsPdfPromise = null; // allow a retry (e.g. after reconnecting)
        throw err;
      });
  }
  return jsPdfPromise;
}

/** Fetch jsPDF in the background so the first export doesn't wait for it. */
export function preloadJsPDF(): void {
  loadJsPDF().catch(() => undefined);
}
