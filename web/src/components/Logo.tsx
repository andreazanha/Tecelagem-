// Logo Big Tricot para a barra do app — wordmark limpo (não deforma em telas pequenas).
export function Logo({
  h = 22,
  color = "#ffffff",
  sub = true,
}: {
  h?: number;
  color?: string;
  sub?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1, flexShrink: 0 }}>
      <span
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontWeight: 700,
          fontSize: h,
          letterSpacing: 0.5,
          color,
        }}
      >
        BIG TRICOT
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "Inter, 'Segoe UI', sans-serif",
            fontSize: Math.max(8, h * 0.34),
            letterSpacing: 3,
            color,
            opacity: 0.8,
            marginTop: 2,
          }}
        >
          HOME DECOR
        </span>
      )}
    </span>
  );
}
