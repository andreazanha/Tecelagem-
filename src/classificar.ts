// Classifica os itens de um pedido em Parte 1 / Parte 2 (ou Parte Única) + Kits (Pronta Entrega),
// agrupando por Modelo + Ref + Cor com quebra por Tamanho.
//
// Regras (Big Tricot):
//  • Parte 1 = modelos da Máquina 3; restante = Parte 2; se não houver nenhum modelo
//    da Parte 1 no pedido → Parte Única.
//  • Kit (Pronta Entrega) SÓ quando o nome do produto traz a palavra "KIT" (ex.: "KIT ASPEN 90x200").
//  • O modelo de cada item é resolvido por CÓDIGO (grade) primeiro — bem mais confiável que o
//    nome — e só então pelo nome (prefixo PES/MAN/ALMOFADA + modelo, ou nome contido no texto).

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

// Lista base dos modelos da Parte 1 (Máquina 3). Sempre entram como Parte 1 (o catálogo
// do banco pode sobrescrever), para a divisão em 2 partes nunca depender do seed remoto.
export const DEFAULT_PARTE1 = [
  "Aspen", "Elo", "Perola", "Balls", "Kora", "Celine",
  "Linea", "Rice", "Montana", "Daytona", "Otto", "Pipoca",
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

// Modelo "cru" a partir do nome do produto do ERP: tira o prefixo (PESEIRA/PES./MANTA/MAN/
// ALMOFADA/ALM/KIT, com ou sem ponto) e pega a primeira palavra.
export function modeloDe(produto: string): string {
  const semPref = produto
    .trim()
    .replace(/^(PESEIRA|PES|MANTA|MAN|ALMOFADA|ALM|KIT)\.?\s+/i, "")
    .trim();
  const primeira = semPref.split(/\s+/)[0] || semPref;
  return titleCase(primeira);
}

// Kit (Pronta Entrega) SÓ quando o NOME do produto contém a palavra "KIT" (ex.: "KIT ASPEN 90x200").
// Atenção: um CÓDIGO/grade como "KT1092" NÃO faz o item virar kit — peseira/almofada/manta com
// código "KT..." são componentes que compõem os kits e são produzidos individualmente. Por isso só
// olhamos o nome (it.produto), nunca o código (it.ref), e "KT" não é a palavra "KIT".
function ehKit(it: ItemBase): boolean {
  return /\bkit\b/i.test(it.produto || "");
}

export interface ModeloInfo {
  nome: string; // nome canônico (exibição)
  parte: number; // 1 | 2
  composicao: string;
  codigo?: string; // código/grade (já normalizado)
}

export interface Catalogo {
  porNome: Map<string, ModeloInfo>; // norm(nome) -> info
  porCodigo: Map<string, ModeloInfo>; // norm(codigo) -> info
  lista: ModeloInfo[];
}

export interface CatalogoRow {
  nome: string;
  parte: number;
  composicao?: string | null;
  ref?: string | null; // código/grade
}

// Monta o catálogo: começa com os 12 modelos base da Parte 1 e deixa as linhas do banco
// (tela de Cadastros) sobrescreverem nome/parte/composição/código.
export function criarCatalogo(rows: CatalogoRow[]): Catalogo {
  const porNome = new Map<string, ModeloInfo>();
  const set = (info: ModeloInfo) => porNome.set(norm(info.nome), info);

  for (const n of DEFAULT_PARTE1) set({ nome: n, parte: 1, composicao: "" });
  for (const r of rows) {
    const nome = (r.nome || "").trim();
    if (!nome) continue;
    set({
      nome,
      parte: Number(r.parte) === 1 ? 1 : 2,
      composicao: r.composicao || "",
      codigo: r.ref ? norm(r.ref) : undefined,
    });
  }

  const porCodigo = new Map<string, ModeloInfo>();
  for (const info of porNome.values()) {
    if (info.codigo) porCodigo.set(info.codigo, info);
  }
  return { porNome, porCodigo, lista: [...porNome.values()] };
}

// Resolve qual modelo do catálogo corresponde ao item: código (grade) → nome (prefixo) →
// nome contido no texto do produto.
export function resolverModelo(it: ItemBase, cat: Catalogo): ModeloInfo | undefined {
  const cod = norm((it.ref || "").trim());
  if (cod && cat.porCodigo.has(cod)) return cat.porCodigo.get(cod);

  const porNome = cat.porNome.get(norm(modeloDe(it.produto)));
  if (porNome) return porNome;

  const alvo = ` ${norm(it.produto)} `;
  let best: ModeloInfo | undefined;
  for (const info of cat.lista) {
    const n = norm(info.nome);
    if (n.length >= 3 && alvo.includes(` ${n} `)) {
      if (!best || n.length > norm(best.nome).length) best = info;
    }
  }
  return best;
}

function agrupar(itens: ItemBase[], cat: Catalogo): Bloco[] {
  const map = new Map<string, Bloco>();
  const sizeIdx = new Map<string, Map<string, number>>(); // key -> (tamanho -> índice em sizes)
  const ordem: string[] = [];
  for (const it of itens) {
    const info = resolverModelo(it, cat);
    const modelo = info?.nome || modeloDe(it.produto);
    const ref = (it.ref || "").trim();
    const cor = (it.cor_grade || "").trim();
    const key = `${modelo}|${ref}|${cor}`;
    let b = map.get(key);
    if (!b) {
      b = { modelo, ref, cor, comp: info?.composicao || "", sizes: [], total: 0 };
      map.set(key, b);
      sizeIdx.set(key, new Map());
      ordem.push(key);
    }
    const tamanho = (it.tamanho || "—").trim() || "—";
    const idxMap = sizeIdx.get(key)!;
    // Consolida: mesma medida soma a quantidade (junta pedidos repetidos numa OP).
    if (idxMap.has(tamanho)) {
      b.sizes[idxMap.get(tamanho)!].qtd += it.qtd;
    } else {
      idxMap.set(tamanho, b.sizes.length);
      b.sizes.push({ tamanho, qtd: it.qtd });
    }
    b.total += it.qtd;
  }
  return ordem.map((k) => map.get(k)!);
}

export function classificar(itens: ItemBase[], cat: Catalogo): Classificacao {
  const kits = agrupar(itens.filter(ehKit), cat);
  const prod = itens.filter((i) => !ehKit(i));
  const temKit = kits.length > 0;

  const ehP1 = (i: ItemBase) => resolverModelo(i, cat)?.parte === 1;
  const p1 = prod.filter(ehP1);
  const p2 = prod.filter((i) => !ehP1(i));

  if (p1.length === 0) {
    return { modo: "unica", parteUnica: agrupar(prod, cat), kits, temKit };
  }
  return { modo: "split", parte1: agrupar(p1, cat), parte2: agrupar(p2, cat), kits, temKit };
}
