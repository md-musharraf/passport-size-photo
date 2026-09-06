'use client';

// Real inline SVG flags for the preset cards.
//
// We previously rendered flag emojis (🇺🇸, 🇮🇳, …). Those look fine on macOS/iOS
// but Windows has no flag glyphs, so they degrade to plain letter pairs ("US",
// "IN") in tiny boxes — which is exactly the "emoji looks broken" issue. These
// crisp, dependency-free SVGs render identically on every platform.

export type CountryCode = 'us' | 'in' | 'gb' | 'eu' | 'de' | 'ca' | 'au' | 'jp' | 'sg' | 'cn';

interface CountryFlagProps {
  code: CountryCode;
  className?: string;
}

// Five-point star polygon points for a star centred at (cx, cy) with outer radius r.
function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const outer = (Math.PI / 180) * (-90 + i * 72);
    const inner = (Math.PI / 180) * (-90 + i * 72 + 36);
    pts.push(`${cx + r * Math.cos(outer)},${cy + r * Math.sin(outer)}`);
    pts.push(`${cx + r * 0.4 * Math.cos(inner)},${cy + r * 0.4 * Math.sin(inner)}`);
  }
  return pts.join(' ');
}

const FLAGS: Record<CountryCode, React.ReactNode> = {
  // United States — 13 stripes + blue canton with stars.
  us: (
    <>
      <rect width="60" height="40" fill="#fff" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} y={i * (40 / 13) * 2} width="60" height={40 / 13} fill="#b22234" />
      ))}
      <rect width="26" height={40 / 13 * 7} fill="#3c3b6e" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <polygon
            key={`${row}-${col}`}
            points={starPoints(4 + col * 6, 4 + row * 6, 2)}
            fill="#fff"
          />
        )),
      )}
    </>
  ),
  // India — saffron / white / green + navy Ashoka chakra.
  in: (
    <>
      <rect width="60" height="13.33" fill="#ff9933" />
      <rect y="13.33" width="60" height="13.34" fill="#fff" />
      <rect y="26.67" width="60" height="13.33" fill="#138808" />
      <circle cx="30" cy="20" r="4.4" fill="none" stroke="#000080" strokeWidth="1" />
      <circle cx="30" cy="20" r="0.9" fill="#000080" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (Math.PI / 12) * i;
        return (
          <line
            key={i}
            x1={30}
            y1={20}
            x2={30 + 4.4 * Math.cos(a)}
            y2={20 + 4.4 * Math.sin(a)}
            stroke="#000080"
            strokeWidth="0.4"
          />
        );
      })}
    </>
  ),
  // United Kingdom — Union Jack.
  gb: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" strokeWidth="4" />
      <rect x="25" width="10" height="40" fill="#fff" />
      <rect y="15" width="60" height="10" fill="#fff" />
      <rect x="27" width="6" height="40" fill="#c8102e" />
      <rect y="17" width="60" height="6" fill="#c8102e" />
    </>
  ),
  // European Union — 12 gold stars on blue.
  eu: (
    <>
      <rect width="60" height="40" fill="#003399" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (Math.PI / 6) * i - Math.PI / 2;
        return (
          <polygon
            key={i}
            points={starPoints(30 + 12 * Math.cos(a), 20 + 12 * Math.sin(a), 2.1)}
            fill="#ffcc00"
          />
        );
      })}
    </>
  ),
  // Germany — black / red / gold.
  de: (
    <>
      <rect width="60" height="13.33" fill="#000" />
      <rect y="13.33" width="60" height="13.34" fill="#dd0000" />
      <rect y="26.67" width="60" height="13.33" fill="#ffce00" />
    </>
  ),
  // Canada — red bands + red maple leaf.
  ca: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect width="15" height="40" fill="#d52b1e" />
      <rect x="45" width="15" height="40" fill="#d52b1e" />
      <path
        d="M30 8 l2 5 4-2 -1.5 5 5 -0.5 -3 4 3.5 3 -5 0.5 1 4.5 -4-2.5 -0.5 4 -0.5-4 -4 2.5 1-4.5 -5-0.5 3.5-3 -3-4 5 0.5 -1.5-5 4 2z"
        fill="#d52b1e"
      />
    </>
  ),
  // Australia — Union Jack canton + Commonwealth star + Southern Cross (simplified).
  au: (
    <>
      <rect width="60" height="40" fill="#00008b" />
      <g transform="translate(0,0)">
        <rect width="30" height="20" fill="#012169" />
        <path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" strokeWidth="4" />
        <path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" strokeWidth="2" />
        <rect x="12.5" width="5" height="20" fill="#fff" />
        <rect y="7.5" width="30" height="5" fill="#fff" />
        <rect x="13.5" width="3" height="20" fill="#c8102e" />
        <rect y="8.5" width="30" height="3" fill="#c8102e" />
      </g>
      <polygon points={starPoints(15, 30, 3)} fill="#fff" />
      <polygon points={starPoints(45, 10, 2)} fill="#fff" />
      <polygon points={starPoints(52, 22, 2)} fill="#fff" />
      <polygon points={starPoints(44, 30, 2)} fill="#fff" />
      <polygon points={starPoints(50, 33, 1.5)} fill="#fff" />
    </>
  ),
  // Japan — red disc on white.
  jp: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="11" fill="#bc002d" />
    </>
  ),
  // Singapore — red over white, crescent + five stars.
  sg: (
    <>
      <rect width="60" height="20" fill="#ed2939" />
      <rect y="20" width="60" height="20" fill="#fff" />
      <circle cx="14" cy="10" r="6.5" fill="#fff" />
      <circle cx="16.5" cy="10" r="6.5" fill="#ed2939" />
      {[
        [20, 5],
        [25, 8.5],
        [25, 13.5],
        [20, 15],
        [16.5, 11.5],
      ].map(([x, y], i) => (
        <polygon key={i} points={starPoints(x, y, 1.6)} fill="#fff" />
      ))}
    </>
  ),
  // China — red field, one large + four small gold stars.
  cn: (
    <>
      <rect width="60" height="40" fill="#de2910" />
      <polygon points={starPoints(10, 10, 5)} fill="#ffde00" />
      <polygon points={starPoints(20, 4, 1.6)} fill="#ffde00" />
      <polygon points={starPoints(24, 8, 1.6)} fill="#ffde00" />
      <polygon points={starPoints(24, 13, 1.6)} fill="#ffde00" />
      <polygon points={starPoints(20, 17, 1.6)} fill="#ffde00" />
    </>
  ),
};

export default function CountryFlag({ code, className }: CountryFlagProps) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={className}
      role="img"
      aria-label={`${code} flag`}
      preserveAspectRatio="xMidYMid slice"
    >
      {FLAGS[code] ?? <rect width="60" height="40" fill="#64748b" />}
    </svg>
  );
}
