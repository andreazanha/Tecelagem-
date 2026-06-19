// Classifica os itens de um pedido em Parte 1 / Parte 2 (ou Parte Única) + Kits (Pronta Entrega),
// agrupando por Modelo + Ref + Cor com quebra por Tamanho. Usa os catálogos (Modelos da Parte 1 e
// Cores 100% Poliéster). Regra: Parte 1 = modelos da Máquina 3; restante = Parte 2; kit = à parte;
// se não houver nenhum modelo da Parte 1 → Parte Única.

export interface ItemBase {
  produto: string;
  ref?: string | null;
  cor_grade?: string | null;
  tamanho?: string | null;
  qtd: number;
  parte?: string | null;
}

export interface Bloco {
  modelo: string;
  ref: string;
  comp: string;
  cor: string;
  sizes: { tamanho: string; qtd: number }[];
  total: number;
}

export interface Classificacao {
  modo: "unica" | "split";
  parteUnica?: Bloco[];
  parte1?: Bloco[];
  parte2?: Bloco[];
  kits: Bloco[];
  temKit: boolean;
}

export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

// Modelo amigável a partir do nome do produto do ERP (PES/MAN/ALMOFADA/KIT + MODELO + tamanho).
export function modeloDe(produto: string): string {
  const semPref = produto
    .trim()
    .replace(/^(PESEIRA|PES|MANTA|MAN|ALMOFADA|KIT)\s+/i, "")
    .trim();
  const primeira = semPref.split(/\s+/)[0] || semPref;
  return titleCase(primeira);
}

function ehKit(it: ItemBase): boolean {
  return /^kit\b/i.test(it.produto.trim()) || it.parte === "kit";
}

function agrupar(itens: ItemBase[], coresPoliester: Set<string>): Bloco[] {
  const map = new Map<string, Bloco>();
  const ordem: string[] = [];
  for (const it of itens) {
    const modelo = modeloDe(it.produto);
    const ref = (it.ref || "").trim();
    const cor = (it.cor_grade || "").trim();
    const key = `${modelo}|${ref}|${cor}`;
    let b = map.get(key);
    if (!b) {
      b = {
        modelo,
        ref,
        cor,
        comp: cor && coresPoliester.has(norm(cor)) ? "100% POLIÉSTER" : "",
        sizes: [],
        total: 0,
      };
      map.set(key, b);
      ordem.push(key);
    }
    b.sizes.push({ tamanho: (it.tamanho || "—").trim() || "—", qtd: it.qtd });
    b.total += it.qtd;
  }
  return ordem.map((k) => map.get(k)!);
}

export function classificar(
  itens: ItemBase[],
  modelosParte1: Set<string>, // nomes normalizados (norm())
  coresPoliester: Set<string> // nomes normalizados (norm())
): Classificacao {
  const kitsItens = itens.filter(ehKit);
  const prod = itens.filter((i) => !ehKit(i));
  const kits = agrupar(kitsItens, coresPoliester);
  const temKit = kits.length > 0;

  const p1 = prod.filter((i) => modelosParte1.has(norm(modeloDe(i.produto))));
  const p2 = prod.filter((i) => !modelosParte1.has(norm(modeloDe(i.produto))));

  if (p1.length === 0) {
    return { modo: "unica", parteUnica: agrupar(prod, coresPoliester), kits, temKit };
  }
  return {
    modo: "split",
    parte1: agrupar(p1, coresPoliester),
    parte2: agrupar(p2, coresPoliester),
    kits,
    temKit,
  };
}
