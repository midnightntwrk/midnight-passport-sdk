// Guilloché — the fine interwoven line engraving used on passports and
// banknotes as an anti-forgery feature. Each curve is a hypotrochoid (the
// path traced by a point offset `d` from the centre of a circle of radius `r`
// rolling inside a circle of radius `R`); layering a few at slightly detuned
// parameters produces the characteristic moiré rosette. Purely decorative and
// aria-hidden — it is the security-print texture of the document, not content.

interface Ring {
  R: number;
  r: number;
  d: number;
  turns: number;
  width: number;
  opacity: number;
  color: string;
}

function hypotrochoid({ R, r, d, turns }: Ring, radius: number): string {
  const k = (R - r) / r;
  const step = 0.03;
  const end = turns * Math.PI * 2;
  const scale = radius / (R - r + d);
  const points: string[] = [];
  for (let t = 0; t <= end; t += step) {
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    points.push(`${(x * scale).toFixed(2)},${(y * scale).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

export function Guilloche({
  size = 120,
  className,
  rings,
}: {
  size?: number;
  className?: string;
  rings?: Ring[];
}) {
  const accent = 'var(--accent)';
  const gold = 'var(--accent-2)';
  const design: Ring[] = rings ?? [
    { R: 11, r: 4, d: 6, turns: 4, width: 0.5, opacity: 0.9, color: accent },
    { R: 13, r: 5, d: 7, turns: 5, width: 0.4, opacity: 0.55, color: gold },
    { R: 8, r: 3, d: 5, turns: 3, width: 0.5, opacity: 0.7, color: accent },
  ];
  const radius = size / 2 - 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      {design.map((ring, i) => (
        <path
          key={i}
          d={hypotrochoid(ring, radius)}
          fill="none"
          stroke={ring.color}
          strokeWidth={ring.width}
          opacity={ring.opacity}
        />
      ))}
    </svg>
  );
}
