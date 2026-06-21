// Gráficos leves em SVG/CSS para o Painel de TV — sem dependências externas.
// Visual escuro, números grandes, animações suaves.

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Rosca (donut) com número grande no centro. */
export function Donut({
  data,
  size = 280,
  thickness = 38,
  centerBig,
  centerSub,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerBig: string | number;
  centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="chart-donut" style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff10" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = (d.value / total) * C;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`}
                strokeDashoffset={-acc}
                className="donut-seg"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            );
            acc += len;
            return seg;
          })}
        </g>
      </svg>
      <div className="chart-donut-center">
        <div className="big">{centerBig}</div>
        {centerSub && <div className="sub">{centerSub}</div>}
      </div>
    </div>
  );
}

export function DonutLegend({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="chart-legend">
      {data.map((d) => (
        <div className="leg" key={d.label}>
          <span className="dot" style={{ background: d.color }} />
          <span className="lbl">{d.label}</span>
          <span className="val">{d.value}</span>
          <span className="pct">{Math.round((d.value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/** Barras horizontais grandes (ranking / top). */
export function BarsH({
  data,
  accent = "#a855f7",
  unidade,
}: {
  data: { label: string; value: number; color?: string; ghost?: boolean }[];
  accent?: string;
  unidade?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-bars">
      {data.map((d, i) => (
        <div className={"cbar" + (d.ghost ? " ghost" : "")} key={d.label + i}>
          <span className="cbar-lbl">{d.label}</span>
          <div className="cbar-track">
            {!d.ghost && (
              <div
                className="cbar-fill"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: d.color
                    ? `linear-gradient(90deg, ${d.color}cc, ${d.color})`
                    : `linear-gradient(90deg, #6366f1, ${accent})`,
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                <span className="cbar-val">
                  {d.value}
                  {unidade ? ` ${unidade}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Gráfico de linha com área (evolução diária). */
export function LineArea({
  data,
  color = "#38bdf8",
  height = 300,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const w = 1000;
  const h = height;
  const padB = 46;
  const padT = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const x = (i: number) => (n <= 1 ? w / 2 : 30 + (i / (n - 1)) * (w - 60));
  const y = (v: number) => padT + (1 - v / max) * (h - padB - padT);
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${x(0)},${h - padB} ${line} ${x(n - 1)},${h - padB}`;
  const gid = "lg-" + color.replace("#", "");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-line" style={{ width: "100%", height: "auto" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={30} x2={w - 30} y1={padT + g * (h - padB - padT)} y2={padT + g * (h - padB - padT)} stroke="#ffffff0d" strokeWidth={1} />
      ))}
      <polygon points={area} fill={`url(#${gid})`} className="line-area" />
      <polyline points={line} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" className="line-path" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={6} fill="#0b1020" stroke={color} strokeWidth={3} />
          <text x={x(i)} y={h - padB + 26} textAnchor="middle" className="chart-axis">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Colunas verticais (peças por dia / pedidos por dia). */
export function Columns({
  data,
  color = "#a855f7",
  height = 300,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-cols" style={{ height }}>
      {data.map((d, i) => (
        <div className="ccol" key={d.label + i}>
          <div className="ccol-v">{d.value}</div>
          <div className="ccol-bar-wrap">
            <div
              className="ccol-bar"
              style={{
                height: `${(d.value / max) * 100}%`,
                background: `linear-gradient(180deg, ${color}, ${color}55)`,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          </div>
          <div className="ccol-lbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Anel de progresso para metas. */
export function Gauge({
  pct,
  big,
  sub,
  color = "#4ade80",
  size = 280,
}: {
  pct: number;
  big: string | number;
  sub?: string;
  color?: string;
  size?: number;
}) {
  const thickness = 30;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="chart-donut" style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff12" strokeWidth={thickness} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${p * C} ${C}`}
            className="donut-seg"
          />
        </g>
      </svg>
      <div className="chart-donut-center">
        <div className="big">{big}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
