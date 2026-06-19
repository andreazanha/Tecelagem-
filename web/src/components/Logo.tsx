// Logo Big Tricot (vetor) — monograma BiG com "TRICOT" vertical + descritivo.
export function Logo({
  h = 40,
  color = "#ffffff",
  sub = false,
}: {
  h?: number;
  color?: string;
  sub?: boolean;
}) {
  const F = h;
  const base = F * 0.8;
  const wB = F * 0.6;
  const gap = F * 0.24;
  const wG = F * 0.74;
  const total = wB + gap + wG;
  const stemx = wB + gap * 0.5;
  const stemy = F * 0.47;
  const serif = "Georgia, 'Times New Roman', serif";
  const width = total + 6;
  const height = sub ? base + F * 0.34 : base + 4;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Big Tricot">
      <text x={0} y={base} fontSize={F} fontWeight="bold" fontFamily={serif} fill={color}>
        B
      </text>
      <text x={wB + gap} y={base} fontSize={F} fontWeight="bold" fontFamily={serif} fill={color}>
        G
      </text>
      <text
        x={stemx}
        y={stemy}
        fontSize={F * 0.135}
        fontWeight="bold"
        textAnchor="middle"
        letterSpacing={1.5}
        transform={`rotate(90 ${stemx} ${stemy})`}
        fill={color}
      >
        TRICOT
      </text>
      <circle cx={stemx} cy={F * 0.07} r={F * 0.06} fill={color} />
      {sub && (
        <text
          x={total / 2}
          y={base + F * 0.26}
          fontSize={F * 0.155}
          textAnchor="middle"
          letterSpacing={F * 0.02}
          fill={color}
        >
          BIG TRICOT HOME DECOR
        </text>
      )}
    </svg>
  );
}
