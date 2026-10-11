// Single source of truth for all document-photo presets.
//
// Historically these specs were duplicated across ImageEditor.tsx,
// DownloadButton.tsx and BatchWorkspace.tsx (and had drifted out of sync —
// e.g. US width was 50.8mm in one file and 51mm in another). Everything now
// derives from PASSPORT_PRESETS below so the specs can never disagree again.
//
// All pixel dimensions are computed at 300 DPI (print quality).

export interface PassportPreset {
  /** Stable key used throughout the app (do not rename existing keys). */
  key: string;
  /** Full descriptive name. */
  name: string;
  /** Short label shown on the preset card. */
  label: string;
  /** Emoji flag (legacy — kept for backwards compatibility; UI now uses `country`). */
  flag: string;
  /** ISO-style country code driving the inline SVG flag icon on the preset card. */
  country: 'us' | 'in' | 'gb' | 'eu' | 'de' | 'ca' | 'au' | 'jp' | 'sg' | 'cn';
  /** Physical print size in millimetres. */
  widthMm: number;
  heightMm: number;
  /** Human-readable aspect ratio, e.g. "7:9". */
  ratio: string;
  /** Suggested backdrop colour for this document standard. */
  bgColor: string;
  /** Suggested print-grid capacity (columns x rows on the target sheet). */
  cols: number;
  rows: number;
  /**
   * ICAO / document compliance: acceptable head height (crown-to-chin)
   * expressed as a percentage of the photo's total height.
   */
  headMinPct: number;
  headMaxPct: number;
  /**
   * Acceptable eye-line position, measured from the TOP of the photo as a
   * percentage of total height.
   */
  eyeMinPct: number;
  eyeMaxPct: number;
}

const DPI = 300;
const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);

export const PASSPORT_PRESETS: Record<string, PassportPreset> = {
  us: {
    key: 'us', name: 'US Passport / Visa', label: 'US Passport / Visa', flag: '🇺🇸', country: 'us',
    widthMm: 50.8, heightMm: 50.8, ratio: '1:1', bgColor: '#FFFFFF',
    cols: 3, rows: 3, headMinPct: 50, headMaxPct: 69, eyeMinPct: 34, eyeMaxPct: 45,
  },
  in: {
    key: 'in', name: 'Indian Passport', label: 'Indian Passport', flag: '🇮🇳', country: 'in',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#A1CAF1',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 80, eyeMinPct: 30, eyeMaxPct: 45,
  },
  uk: {
    key: 'uk', name: 'UK / EU Passport', label: 'UK / EU Passport', flag: '🇬🇧', country: 'gb',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 64, headMaxPct: 76, eyeMinPct: 30, eyeMaxPct: 43,
  },
  eu: {
    key: 'eu', name: 'Schengen / EU Visa', label: 'Schengen / EU Visa', flag: '🇪🇺', country: 'eu',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
  },
  de: {
    key: 'de', name: 'Germany Biometric', label: 'Germany Biometric', flag: '🇩🇪', country: 'de',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
  },
  ca: {
    key: 'ca', name: 'Canada Passport', label: 'Canada Passport', flag: '🇨🇦', country: 'ca',
    widthMm: 50, heightMm: 70, ratio: '5:7', bgColor: '#FFFFFF',
    cols: 4, rows: 4, headMinPct: 44, headMaxPct: 51, eyeMinPct: 30, eyeMaxPct: 40,
  },
  au: {
    key: 'au', name: 'Australia Passport', label: 'Australia Passport', flag: '🇦🇺', country: 'au',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 71, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
  },
  jp: {
    key: 'jp', name: 'Japan Passport / Visa', label: 'Japan Passport', flag: '🇯🇵', country: 'jp',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
  },
  sg: {
    key: 'sg', name: 'Singapore Passport', label: 'Singapore Passport', flag: '🇸🇬', country: 'sg',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 55, headMaxPct: 78, eyeMinPct: 30, eyeMaxPct: 45,
  },
  cn: {
    key: 'cn', name: 'China Visa', label: 'China Visa', flag: '🇨🇳', country: 'cn',
    widthMm: 33, heightMm: 48, ratio: '11:16', bgColor: '#FFFFFF',
    cols: 4, rows: 5, headMinPct: 58, headMaxPct: 70, eyeMinPct: 30, eyeMaxPct: 45,
  },
  oci: {
    key: 'oci', name: 'India OCI / PAN', label: 'OCI / PAN Card', flag: '🇮🇳', country: 'in',
    widthMm: 35, heightMm: 35, ratio: '1:1', bgColor: '#FFFFFF',
    cols: 4, rows: 7, headMinPct: 55, headMaxPct: 78, eyeMinPct: 30, eyeMaxPct: 48,
  },
  stamp: {
    key: 'stamp', name: 'Indian Stamp Size', label: 'Indian Stamp Size', flag: '🇮🇳', country: 'in',
    widthMm: 20, heightMm: 25, ratio: '4:5', bgColor: '#FFFFFF',
    cols: 8, rows: 10, headMinPct: 55, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 48,
  },
  pan: {
    key: 'pan', name: 'Indian PAN / Aadhaar', label: 'PAN / Aadhaar', flag: '🇮🇳', country: 'in',
    widthMm: 25, heightMm: 35, ratio: '5:7', bgColor: '#FFFFFF',
    cols: 6, rows: 7, headMinPct: 55, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 48,
  },
};

export type PresetKey = keyof typeof PASSPORT_PRESETS;

/** Get a preset by key, falling back to US so callers never crash on bad input. */
export const getPreset = (key: string): PassportPreset =>
  PASSPORT_PRESETS[key] ?? PASSPORT_PRESETS.us;

// ---------------------------------------------------------------------------
// Backwards-compatible views. Existing code imports `PRESETS` and
// `PRESET_PIXELS`; keep those shapes stable while deriving from the table above.
// ---------------------------------------------------------------------------

export const PRESETS: Record<string, { name: string; width: number; height: number; ratio: string }> =
  Object.fromEntries(
    Object.values(PASSPORT_PRESETS).map((p) => [
      p.key,
      { name: p.name, width: p.widthMm, height: p.heightMm, ratio: p.ratio },
    ]),
  );

export const PRESET_PIXELS: Record<
  string,
  { widthPx: number; heightPx: number; widthMm: number; heightMm: number; cols: number; rows: number; ratio: string }
> = Object.fromEntries(
  Object.values(PASSPORT_PRESETS).map((p) => [
    p.key,
    {
      widthPx: mmToPx(p.widthMm),
      heightPx: mmToPx(p.heightMm),
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      cols: p.cols,
      rows: p.rows,
      ratio: p.ratio,
    },
  ]),
);

export const CLOTHING_TEMPLATES = [
  { id: 'none' as const, name: 'Original', path: '' },
  { id: 'suit_male' as const, name: 'Male Suit', path: 'clothing/suit_male.png' },
  { id: 'suit_female' as const, name: 'Female Suit', path: 'clothing/suit_female.png' },
  { id: 'tuxedo' as const, name: 'Tuxedo', path: 'clothing/tuxedo.png' },
];
