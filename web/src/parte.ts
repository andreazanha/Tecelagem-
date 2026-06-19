// Classificação da Parte no FRONT (espelha src/classificar.ts), só para exibir na tela
// de Novo Pedido a parte real de cada item (por código → nome → nome no texto).
import type { Modelo, PedidoItem } from "./api";

const DEFAULT_PARTE1 = [
  "Aspen", "Elo", "Perola", "Balls", "Kora", "Celine",
  "Linea", "Rice", "Montana", "Daytona", "Otto", "Pipoca",
];

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function modeloDe(produto: string): string {
  const semPref = produto
    .trim()
    .replace(/^(PESEIRA|PES|MANTA|MAN|ALMOFADA|ALM|CAPA|KIT)\.?\s+/i, "")
    .trim();
  return semPref.split(/\s+/)[0] || semPref;
}

export interface ParteCalc {
  value: string; // p1 | p2 | unico | pe
  label: string;
}

export function calcularPartes(itens: PedidoItem[], modelos: Modelo[]): ParteCalc[] {
  const porNome = new Map<string, number>();
  const porCodigo = new Map<string, number>();
  for (const n of DEFAULT_PARTE1) porNome.set(norm(n), 1);
  for (const m of modelos) {
    const p = m.parte === 1 ? 1 : 2;
    porNome.set(norm(m.nome), p);
    if (m.ref) porCodigo.set(norm(m.ref), p);
  }

  const ehKit = (p: string) => /\bkit\b/i.test(p || "");
  const parteDe = (it: PedidoItem): number | "kit" => {
    if (ehKit(it.produto)) return "kit";
    const cod = norm((it.ref || "").trim());
    if (cod && porCodigo.has(cod)) return porCodigo.get(cod)!;
    const nm = porNome.get(norm(modeloDe(it.produto)));
    if (nm) return nm;
    const alvo = ` ${norm(it.produto)} `;
    let best: number | undefined;
    let bestLen = 0;
    for (const m of modelos) {
      const n = norm(m.nome);
      if (n.length >= 3 && alvo.includes(` ${n} `) && n.length > bestLen) {
        best = m.parte === 1 ? 1 : 2;
        bestLen = n.length;
      }
    }
    return best ?? 2;
  };

  const raw = itens.map(parteDe);
  const temP1 = raw.some((r) => r === 1);
  return raw.map((r) => {
    if (r === "kit") return { value: "pe", label: "Pronta Entrega" };
    if (r === 1) return { value: "p1", label: "Parte 1" };
    if (!temP1) return { value: "unico", label: "Parte Única" };
    return { value: "p2", label: "Parte 2" };
  });
}
