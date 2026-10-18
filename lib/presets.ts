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
  /** Category grouping for tabbed navigation. */
  category: 'india_gov' | 'india_exam' | 'international';
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
  /** Government portal notes or instructions. */
  examNote?: string;
  /** Whether the portal requires Name and Date of Photo (DOP) printed. */
  requiresSlate?: boolean;
  /** File size constraints (in KB) mandated by the portal. */
  targetKbMin?: number;
  targetKbMax?: number;
  /** Recommended print resolution in DPI. */
  recommendedDpi?: number;
}

const DPI = 300;
const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);

export const PASSPORT_PRESETS: Record<string, PassportPreset> = {
  // ── Indian Government Documents ───────────────────────────────────────────
  in: {
    key: 'in', name: 'Indian Passport', label: 'Indian Passport', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'Passport Seva Kendra mandate: Plain white/light background, 70-80% face coverage.',
    targetKbMin: 20, targetKbMax: 100, recommendedDpi: 300,
  },
  in_visa: {
    key: 'in_visa', name: 'Indian Visa / e-Visa', label: 'Indian Visa (2×2")', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 50.8, heightMm: 50.8, ratio: '1:1', bgColor: '#FFFFFF',
    cols: 3, rows: 3, headMinPct: 60, headMaxPct: 70, eyeMinPct: 32, eyeMaxPct: 45,
    examNote: 'Indian e-Visa / Consular 2x2 inch square format on plain white background.',
    targetKbMin: 20, targetKbMax: 300, recommendedDpi: 300,
  },
  pan: {
    key: 'pan', name: 'Indian PAN Card (NSDL / UTIITSL)', label: 'PAN Card (2.5×3.5cm)', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 25, heightMm: 35, ratio: '5:7', bgColor: '#FFFFFF',
    cols: 6, rows: 7, headMinPct: 55, headMaxPct: 75, eyeMinPct: 28, eyeMaxPct: 48,
    examNote: 'NSDL / UTIITSL standard: 200 DPI, white background, strictly under 50 KB.',
    targetKbMin: 20, targetKbMax: 50, recommendedDpi: 200,
  },
  aadhaar: {
    key: 'aadhaar', name: 'Aadhaar Photo Update (UIDAI)', label: 'Aadhaar Card', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 65, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'UIDAI standard for biometric photo enrollment and update centers.',
    targetKbMin: 20, targetKbMax: 100, recommendedDpi: 300,
  },
  dl_parivahan: {
    key: 'dl_parivahan', name: 'Driving Licence (Parivahan Sarathi)', label: 'Driving Licence', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'Ministry of Road Transport & Highways Sarathi portal: strictly 10 to 20 KB.',
    targetKbMin: 10, targetKbMax: 20, recommendedDpi: 200,
  },
  stamp: {
    key: 'stamp', name: 'Indian Stamp Size (20×25mm)', label: 'Stamp Size (20×25)', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 20, heightMm: 25, ratio: '4:5', bgColor: '#FFFFFF',
    cols: 8, rows: 10, headMinPct: 55, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 48,
    examNote: 'Used for school/college admission, notarized affidavits, pension cards.',
    targetKbMin: 10, targetKbMax: 50, recommendedDpi: 300,
  },
  stamp_alt: {
    key: 'stamp_alt', name: 'Indian Stamp Size (25×30mm)', label: 'Stamp Size (25×30)', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 25, heightMm: 30, ratio: '5:6', bgColor: '#FFFFFF',
    cols: 7, rows: 9, headMinPct: 55, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 48,
    examNote: 'Alternative stamp photo size for bank accounts and legal verification.',
    targetKbMin: 10, targetKbMax: 50, recommendedDpi: 300,
  },
  oci: {
    key: 'oci', name: 'India OCI / PIO Card', label: 'OCI / PIO (35×35mm)', flag: '🇮🇳', country: 'in', category: 'india_gov',
    widthMm: 35, heightMm: 35, ratio: '1:1', bgColor: '#FFFFFF',
    cols: 4, rows: 7, headMinPct: 55, headMaxPct: 78, eyeMinPct: 30, eyeMaxPct: 48,
    examNote: 'Overseas Citizenship of India card standard with light background.',
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },

  // ── Indian Competitive Exams (UPSC, SSC, NEET, JEE, Banking, Railway) ─────
  upsc: {
    key: 'upsc', name: 'UPSC (Civil Services / NDA / CDS)', label: 'UPSC (Name & DOP)', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'MANDATORY: Candidate name and Date of Photo (DOP) printed at bottom; max 10 days old.',
    requiresSlate: true, targetKbMin: 20, targetKbMax: 300, recommendedDpi: 300,
  },
  ssc: {
    key: 'ssc', name: 'SSC (CGL / CHSL / MTS / GD)', label: 'SSC Exams (20-50KB)', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'Staff Selection Commission: Strict 20 to 50 KB limit; Name & Date strip recommended.',
    requiresSlate: true, targetKbMin: 20, targetKbMax: 50, recommendedDpi: 200,
  },
  neet_jee: {
    key: 'neet_jee', name: 'NTA NEET / JEE Main (Passport)', label: 'NEET / JEE Passport', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'NTA Mandate: 80% face coverage on white background with Candidate Name & Date of Photo.',
    requiresSlate: true, targetKbMin: 10, targetKbMax: 200, recommendedDpi: 300,
  },
  neet_postcard: {
    key: 'neet_postcard', name: 'NTA NEET Postcard Photo (4×6")', label: 'NEET Postcard (4×6")', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 101.6, heightMm: 152.4, ratio: '2:3', bgColor: '#FFFFFF',
    cols: 1, rows: 1, headMinPct: 50, headMaxPct: 70, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'Mandatory 4x6 inch Postcard size with Name & DOP to paste on NEET exam attendance sheet.',
    requiresSlate: true, targetKbMin: 50, targetKbMax: 300, recommendedDpi: 300,
  },
  ibps: {
    key: 'ibps', name: 'IBPS / SBI Banking Exams', label: 'IBPS / SBI Banking', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'IBPS/SBI exam standard: 20 to 50 KB photo; signature strictly 10 to 20 KB.',
    targetKbMin: 20, targetKbMax: 50, recommendedDpi: 200,
  },
  rrb: {
    key: 'rrb', name: 'Railway RRB (NTPC / Group D)', label: 'Railway RRB', flag: '🇮🇳', country: 'in', category: 'india_exam',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 6, rows: 6, headMinPct: 60, headMaxPct: 75, eyeMinPct: 30, eyeMaxPct: 45,
    examNote: 'Railway Recruitment Board: Color photo on plain white background, 20 to 50 KB.',
    targetKbMin: 20, targetKbMax: 50, recommendedDpi: 200,
  },

  // ── International Passports & Visas ───────────────────────────────────────
  us: {
    key: 'us', name: 'US Passport / Visa', label: 'US Passport / Visa', flag: '🇺🇸', country: 'us', category: 'international',
    widthMm: 50.8, heightMm: 50.8, ratio: '1:1', bgColor: '#FFFFFF',
    cols: 3, rows: 3, headMinPct: 50, headMaxPct: 69, eyeMinPct: 34, eyeMaxPct: 45,
    examNote: 'US Department of State: 2x2 inch square on plain white background.',
    targetKbMin: 20, targetKbMax: 240, recommendedDpi: 300,
  },
  uk: {
    key: 'uk', name: 'UK / EU Passport', label: 'UK / EU Passport', flag: '🇬🇧', country: 'gb', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 64, headMaxPct: 76, eyeMinPct: 30, eyeMaxPct: 43,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  eu: {
    key: 'eu', name: 'Schengen / EU Visa', label: 'Schengen / EU Visa', flag: '🇪🇺', country: 'eu', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  de: {
    key: 'de', name: 'Germany Biometric', label: 'Germany Biometric', flag: '🇩🇪', country: 'de', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#F5F5F5',
    cols: 4, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  ca: {
    key: 'ca', name: 'Canada Passport', label: 'Canada Passport', flag: '🇨🇦', country: 'ca', category: 'international',
    widthMm: 50, heightMm: 70, ratio: '5:7', bgColor: '#FFFFFF',
    cols: 4, rows: 4, headMinPct: 44, headMaxPct: 51, eyeMinPct: 30, eyeMaxPct: 40,
    targetKbMin: 20, targetKbMax: 250, recommendedDpi: 300,
  },
  au: {
    key: 'au', name: 'Australia Passport', label: 'Australia Passport', flag: '🇦🇺', country: 'au', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 71, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  jp: {
    key: 'jp', name: 'Japan Passport / Visa', label: 'Japan Passport', flag: '🇯🇵', country: 'jp', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 70, headMaxPct: 80, eyeMinPct: 28, eyeMaxPct: 42,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  sg: {
    key: 'sg', name: 'Singapore Passport', label: 'Singapore Passport', flag: '🇸🇬', country: 'sg', category: 'international',
    widthMm: 35, heightMm: 45, ratio: '7:9', bgColor: '#FFFFFF',
    cols: 5, rows: 6, headMinPct: 55, headMaxPct: 78, eyeMinPct: 30, eyeMaxPct: 45,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
  cn: {
    key: 'cn', name: 'China Visa', label: 'China Visa', flag: '🇨🇳', country: 'cn', category: 'international',
    widthMm: 33, heightMm: 48, ratio: '11:16', bgColor: '#FFFFFF',
    cols: 4, rows: 5, headMinPct: 58, headMaxPct: 70, eyeMinPct: 30, eyeMaxPct: 45,
    targetKbMin: 20, targetKbMax: 200, recommendedDpi: 300,
  },
};

export type PresetKey = keyof typeof PASSPORT_PRESETS;

/** Get a preset by key, falling back to Indian Passport so callers never crash on bad input. */
export const getPreset = (key: string): PassportPreset =>
  PASSPORT_PRESETS[key] ?? PASSPORT_PRESETS.in;

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
