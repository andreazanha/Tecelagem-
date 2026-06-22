import type { CardExpedicao, Volume } from "./api";

export const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
export const brLong = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

export const opCodigo = (c: { codigo_pai?: string | null; numero_erp?: string | null; pedido_id: string }) =>
  "OP " + (c.codigo_pai || c.numero_erp || c.pedido_id.slice(0, 6));

const TIPO_PARTE: Record<string, { label: string; cls: string }> = {
  "parte-1": { label: "PARTE 1", cls: "p1" },
  "parte-2": { label: "PARTE 2", cls: "p2" },
  "parte-unica": { label: "ÚNICA", cls: "unica" },
  "pronta-entrega": { label: "KIT", cls: "kit" },
};
export const partesList = (s?: string | null) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((p) => TIPO_PARTE[p] || { label: p, cls: "" });

export function tipoDe(partes?: string | null): { label: string; cls: string } {
  const ps = (partes || "").split(",").map((x) => x.trim());
  const tem = (x: string) => ps.includes(x);
  if (tem("pronta-entrega") && (tem("parte-1") || tem("parte-2") || tem("parte-unica")))
    return { label: "MISTO", cls: "misto" };
  if (tem("pronta-entrega")) return { label: "KIT", cls: "kit" };
  if (tem("parte-1") || tem("parte-2")) return { label: "P1+P2", cls: "p1" };
  return { label: "ÚNICO", cls: "unica" };
}

export function parseVolumes(json?: string | null): Volume[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as Volume[]) : [];
  } catch {
    return [];
  }
}

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
export function resumoVolumes(vols: Volume[]): string {
  if (!vols.length) return "—";
  const peso = vols.reduce((s, v) => s + num(v.peso), 0);
  const pesoStr = peso ? `${peso.toString().replace(".", ",")} kg` : "";
  return `${vols.length} vol${pesoStr ? ` · ${pesoStr}` : ""}`;
}
export function totalPeso(vols: Volume[]): number {
  return vols.reduce((s, v) => s + num(v.peso), 0);
}

export const dur = (min: number) => {
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60),
    m = min % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24),
    hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
};

// Transportadoras fixas (abas do Transporte).
export const TRANSPORTADORAS: { slug: string; nome: string; ini: string; cor: string }[] = [
  { slug: "braspress", nome: "Braspress", ini: "BP", cor: "#dc2626" },
  { slug: "translovato", nome: "Trans Lovato", ini: "TL", cor: "#2563eb" },
  { slug: "jadlog", nome: "Jadlog", ini: "JL", cor: "#7c3aed" },
  { slug: "correios", nome: "Correios", ini: "CO", cor: "#ea580c" },
  { slug: "envio-proprio", nome: "Envio próprio", ini: "EP", cor: "#0d9488" },
  { slug: "cliente-retirou", nome: "Cliente retirou", ini: "CR", cor: "#475569" },
];
export const transpNome = (slug?: string | null) =>
  TRANSPORTADORAS.find((t) => t.slug === slug)?.nome || slug || "—";

// Nome e cor de cada fase (linha do tempo de "Todos os pedidos").
export const FASE_INFO: Record<string, { nome: string; ic: string; cor: string }> = {
  tecelagem: { nome: "Tecelagem", ic: "🧶", cor: "#6366f1" },
  passadoria: { nome: "Passadoria", ic: "🔥", cor: "#f97316" },
  corte: { nome: "Corte", ic: "✂️", cor: "#06b6d4" },
  costura: { nome: "Costura", ic: "🪡", cor: "#ec4899" },
  revisao: { nome: "Revisão", ic: "🔍", cor: "#eab308" },
  expedicao: { nome: "Expedição", ic: "📦", cor: "#22c55e" },
  fiscal: { nome: "Fiscal", ic: "🧾", cor: "#f59e0b" },
  transporte: { nome: "Transporte", ic: "🚚", cor: "#38bdf8" },
  entregue: { nome: "Entregue", ic: "✓", cor: "#10b981" },
};
export const FASES_ORDEM = [
  "tecelagem",
  "passadoria",
  "corte",
  "costura",
  "revisao",
  "expedicao",
  "fiscal",
  "transporte",
  "entregue",
];

export type Card = CardExpedicao;
