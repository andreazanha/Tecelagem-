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
  kit?: boolean | number | null; // marcado como kit (pronta-entrega/estoque) na criação
  origem?: string | null; // número do pedido de origem (OP que junta vários)
  valor_unit?: number | null; // preço de venda unitário (para o espelho do cliente)
}

export interface Bloco {
  modelo: string;
  ref: string;
  comp: string;
  cor: string;
  // cada linha traz o TIPO junto do tamanho (ex.: "Almofada 55X35", "Peseira 70X250")
  sizes: { tipo: string; tamanho: string; qtd: number; valorUnit?: number }[];
  total: number;
  valorTotal?: number; // soma de qtd × valor_unit das linhas (espelho do cliente)
  // Combinação de cores casada (nome do pedido = nome da combinação): as guias de fio GFx → cor.
  // Preenchida só no PDF da tecelagem, quando o produto tem uma combinação com o nome desta cor.
  guias?: { guia: string; cor: string }[];
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
    .replace(/^(PESEIRA|PES|MANTA|MAN|ALMOFADA|ALM|CAPA|KIT)\.?\s+/i, "")
    .trim();
  const primeira = semPref.split(/\s+/)[0] || semPref;
  return titleCase(primeira);
}

// Tipo do produto a partir do prefixo do nome (PES→Peseira, MAN→Manta, ALM→Almofada, CAPA, KIT).
// Importante: peseira e almofada do MESMO modelo são produtos diferentes e NÃO podem se misturar.
// Se não houver prefixo, infere pelo TAMANHO padrão (peseira 70x2.50, almofada 50x50, capa 45x45,
// manta 90x2.00 / 1.20x1.80).
const TAMANHO_PADRAO: Record<string, string> = {
  "70X250": "Peseira",
  "50X50": "Almofada",
  "45X45": "Capa",
  "90X200": "Manta",
  "120X180": "Manta",
};
export function tipoDe(produto: string, tamanho?: string | null): string {
  const m = produto.trim().match(/^(PESEIRA|PES|MANTA|MAN|ALMOFADA|ALM|CAPA|KIT)\b/i);
  if (m) {
    const t = m[1].toUpperCase();
    if (t === "PES" || t === "PESEIRA") return "Peseira";
    if (t === "MAN" || t === "MANTA") return "Manta";
    if (t === "ALM" || t === "ALMOFADA") return "Almofada";
    if (t === "CAPA") return "Capa";
    if (t === "KIT") return "Kit";
  }
  if (tamanho) {
    const t = tamanho.toUpperCase().replace(/[^0-9X]/g, "");
    if (TAMANHO_PADRAO[t]) return TAMANHO_PADRAO[t];
  }
  return "";
}

// Kit (Pronta Entrega) SÓ quando o NOME do produto contém a palavra "KIT" (ex.: "KIT ASPEN 90x200").
// Atenção: um CÓDIGO/grade como "KT1092" NÃO faz o item virar kit — peseira/almofada/manta com
// código "KT..." são componentes que compõem os kits e são produzidos individualmente. Por isso só
// olhamos o nome (it.produto), nunca o código (it.ref), e "KT" não é a palavra "KIT".
export function ehKit(it: ItemBase): boolean {
  // Marcado manualmente como kit (pedido de estoque) OU nome contém "KIT".
  return !!it.kit || /\bkit\b/i.test(it.produto || "");
}

// Tipo da PEÇA PRINCIPAL do kit pelo tamanho (largura): ~70 → Peseira; 90+ → Manta; pequeno → Almofada.
function tipoPorMedida(tamanho: string): string {
  const m = (tamanho || "").toUpperCase().replace(/\s/g, "").match(/^([\d.,]+)X([\d.,]+)/);
  if (!m) return "";
  const cm = (x: string) => {
    const n = parseFloat(x.replace(",", "."));
    return n < 10 ? Math.round(n * 100) : Math.round(n);
  };
  const W = cm(m[1]);
  const H = cm(m[2]);
  if (W <= 60 && H <= 60) return "Almofada";
  if (W <= 75) return "Peseira";
  return "Manta";
}

// Composição do kit lida do NOME do ERP: "KIT ASPEN +2- 55X35 C/ ENCHIMENTO" + tamanho da peça
// principal (ex.: 70X2.50) → "Peseira 70X2.50 + 2 Almofada 55X35 c/ ench.".
function composicaoKit(produto: string, tamanho: string): string {
  const nome = (produto || "").toUpperCase();
  const main = tipoPorMedida(tamanho) || "Peça";
  let label = `${main} ${tamanho}`.trim();
  const count = nome.match(/\+\s*(\d+)/)?.[1];
  const almSize = (
    nome.match(/\+\s*\d+\s*-?\s*(\d[\d.,]*\s*X\s*\d[\d.,]*)/i)?.[1] ||
    nome.match(/(\d[\d.,]*\s*X\s*\d[\d.,]*)/i)?.[1]
  )?.replace(/\s+/g, "");
  const almTipo = /\bCAPA\b/.test(nome) ? "Capa" : "Almofada";
  if (almSize) label += ` + ${count ? count + " " : ""}${almTipo} ${almSize}`;
  if (/ENCH/.test(nome)) label += " c/ ench.";
  return label;
}

export interface ModeloInfo {
  nome: string; // nome canônico (exibição)
  parte: number; // 1 | 2
  composicao: string;
  codigo?: string; // código do modelo (como cadastrado, para exibir)
  tasselPeseira: number; // tasseis por peseira (tamanho G)
  tasselAlmofada: number; // tasseis por almofada (tamanho P)
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
  tassel_peseira?: number | null;
  tassel_almofada?: number | null;
}

// Monta o catálogo: começa com os 12 modelos base da Parte 1 e deixa as linhas do banco
// (tela de Cadastros) sobrescreverem nome/parte/composição/código.
export function criarCatalogo(rows: CatalogoRow[]): Catalogo {
  const porNome = new Map<string, ModeloInfo>();
  const set = (info: ModeloInfo) => porNome.set(norm(info.nome), info);

  for (const n of DEFAULT_PARTE1)
    set({ nome: n, parte: 1, composicao: "", tasselPeseira: 0, tasselAlmofada: 0 });
  for (const r of rows) {
    const nome = (r.nome || "").trim();
    if (!nome) continue;
    set({
      nome,
      parte: Number(r.parte) === 1 ? 1 : 2,
      composicao: r.composicao || "",
      codigo: (r.ref || "").trim() || undefined,
      tasselPeseira: Math.max(0, Math.trunc(Number(r.tassel_peseira) || 0)),
      tasselAlmofada: Math.max(0, Math.trunc(Number(r.tassel_almofada) || 0)),
    });
  }

  const porCodigo = new Map<string, ModeloInfo>();
  for (const info of porNome.values()) {
    if (info.codigo) porCodigo.set(norm(info.codigo), info);
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

export function agrupar(itens: ItemBase[], cat: Catalogo): Bloco[] {
  const map = new Map<string, Bloco>();
  const sizeIdx = new Map<string, Map<string, number>>(); // key -> (tamanho -> índice em sizes)
  const ordem: string[] = [];
  for (const it of itens) {
    const info = resolverModelo(it, cat);
    const modelo = info?.nome || modeloDe(it.produto);
    // Para KIT a linha mostra a COMPOSIÇÃO (peseira/manta + almofada/capa); para os demais, o tipo.
    const kit = ehKit(it);
    const tipo = kit ? "" : tipoDe(it.produto, it.tamanho);
    // código do MODELO (cadastro) — ignora a grade do ERP quando o modelo é conhecido;
    // assim os produtos do mesmo modelo/cor ficam num bloco só (ex.: Aspen Almofada + Manta).
    const ref = info?.codigo || (it.ref || "").trim();
    const cor = (it.cor_grade || "").trim();
    // Bloco = modelo + cor; o TIPO vai na linha do tamanho (Almofada 55X35, Peseira 70X250).
    const key = `${modelo}|${cor}`;
    let b = map.get(key);
    if (!b) {
      b = { modelo, ref, cor, comp: info?.composicao || "", sizes: [], total: 0 };
      map.set(key, b);
      sizeIdx.set(key, new Map());
      ordem.push(key);
    }
    const tamanho = kit
      ? composicaoKit(it.produto, (it.tamanho || "").trim())
      : (it.tamanho || "—").trim() || "—";
    const sk = `${tipo}|${tamanho}`;
    const idxMap = sizeIdx.get(key)!;
    const valor = Number(it.valor_unit) || 0;
    // Consolida: mesmo tipo+medida soma a quantidade (junta pedidos repetidos numa OP).
    if (idxMap.has(sk)) {
      const sz = b.sizes[idxMap.get(sk)!];
      sz.qtd += it.qtd;
      if (!sz.valorUnit && valor) sz.valorUnit = valor;
    } else {
      idxMap.set(sk, b.sizes.length);
      b.sizes.push({ tipo, tamanho, qtd: it.qtd, valorUnit: valor });
    }
    b.total += it.qtd;
    b.valorTotal = (b.valorTotal || 0) + it.qtd * valor;
  }
  // dentro do bloco: ordena as linhas por tipo e depois por tamanho
  for (const b of map.values()) {
    b.sizes.sort((a, c) => a.tipo.localeCompare(c.tipo, "pt") || a.tamanho.localeCompare(c.tamanho, "pt"));
  }
  // blocos: ordem alfabética por FAMÍLIA (modelo) e, dentro, por COR (cor diferente = linha de baixo)
  return ordem
    .map((k) => map.get(k)!)
    .sort((a, b) => a.modelo.localeCompare(b.modelo, "pt") || a.cor.localeCompare(b.cor, "pt"));
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

// ── Romaneio de COSTURA (simplificado) ───────────────────────────────────────
// Agrupa as peças do pedido em DUAS famílias, sem cor nem tamanho:
//   • Peseiras + Mantas  (somam juntas)
//   • Almofadas + Capas  (somam juntas)
// Itens de produção (não-kit) entram pelo tipo. KITS de REPOSIÇÃO são desmembrados:
//   peça principal (manta/peseira/almofada) + as almofadas/capas que o acompanham
//   (ex.: "KIT PEROLA 90x2.00 + 2 50x50" = 1 Manta + 2 Almofadas por kit).
// Kits de pedido de CLIENTE (venda, não produzidos) são ignorados.
export interface RomaneioCostura {
  peseirasMantas: number;
  almofadasCapas: number;
  outros: number;
  totalPecas: number;
}

// Quantas peças de cada família UM kit (de reposição) gera (sem multiplicar pela qtd).
function pecasDoKit(produto: string, tamanho: string): { pm: number; ac: number } {
  const nome = (produto || "").toUpperCase();
  let mainTam = (tamanho || "").trim();
  if (!mainTam) mainTam = nome.match(/(\d[\d.,]*\s*X\s*\d[\d.,]*)/i)?.[1] || "";
  const main = tipoPorMedida(mainTam.replace(/\s+/g, ""));
  let pm = 0,
    ac = 0;
  if (main === "Manta" || main === "Peseira") pm += 1;
  else if (main === "Almofada") ac += 1;
  // peças que acompanham: "+ 2 50x50" → 2 almofadas/capas
  const count = parseInt(nome.match(/\+\s*(\d+)/)?.[1] || "0", 10);
  if (count > 0) ac += count;
  return { pm, ac };
}

export function romaneioCostura(itens: ItemBase[], reposicao: boolean, cat: Catalogo): RomaneioCostura {
  let pm = 0,
    ac = 0,
    outros = 0;
  for (const it of itens) {
    const qtd = Number(it.qtd) || 0;
    if (ehKit(it)) {
      if (!reposicao) continue; // kit de cliente = venda (já no estoque), não produz
      const d = pecasDoKit(it.produto, (it.tamanho || "").trim());
      pm += d.pm * qtd;
      ac += d.ac * qtd;
      if (d.pm === 0 && d.ac === 0) outros += qtd;
      continue;
    }
    const tipo = tipoDe(it.produto, it.tamanho);
    if (tipo === "Peseira" || tipo === "Manta") pm += qtd;
    else if (tipo === "Almofada" || tipo === "Capa") ac += qtd;
    else outros += qtd;
  }
  void cat; // catálogo reservado para evoluções (ex.: serviços por modelo)
  return { peseirasMantas: pm, almofadasCapas: ac, outros, totalPecas: pm + ac + outros };
}

// ── Romaneio de TASSEL ───────────────────────────────────────────────────────
// Regra: peseira → tassel tamanho G; almofada → tassel tamanho P. A quantidade por peça
// vem do MODELO (tasselPeseira/tasselAlmofada). O valor (mão de obra) vem da tabela de
// Tasseis por (cor, tamanho). Tudo somado automaticamente.
export type TabelaTassel = Record<string, number>; // `${COR}|${TAM}` -> valor unit

export interface TasselLinha {
  cor: string;
  tamanho: "G" | "P";
  tasseis: number; // quantidade total de tasseis (todas as peças somadas)
  valorUnit: number;
  total: number;
}
export interface TasselRomaneio {
  linhas: TasselLinha[];
  totalTasseis: number;
  totalValor: number;
}

// Agrupa por (cor, tamanho) e mostra só a QUANTIDADE TOTAL de tasseis (peseira=G, almofada=P).
export function romaneioTassel(itens: ItemBase[], cat: Catalogo, valores: TabelaTassel): TasselRomaneio {
  const map = new Map<string, TasselLinha>();
  const ordem: string[] = [];
  for (const it of itens) {
    if (ehKit(it)) continue;
    const tipo = tipoDe(it.produto, it.tamanho);
    if (tipo !== "Peseira" && tipo !== "Almofada") continue;
    const info = resolverModelo(it, cat);
    const porPeca = tipo === "Peseira" ? info?.tasselPeseira || 0 : info?.tasselAlmofada || 0;
    if (porPeca <= 0) continue;
    const cor = (it.cor_grade || "").trim();
    const tam: "G" | "P" = tipo === "Peseira" ? "G" : "P";
    const valorUnit = valores[`${cor.toUpperCase()}|${tam}`] || 0;
    const key = `${cor}|${tam}`;
    let l = map.get(key);
    if (!l) {
      l = { cor, tamanho: tam, tasseis: 0, valorUnit, total: 0 };
      map.set(key, l);
      ordem.push(key);
    }
    l.tasseis += it.qtd * porPeca;
    l.valorUnit = valorUnit;
    l.total = l.tasseis * valorUnit;
  }
  const linhas = ordem
    .map((k) => map.get(k)!)
    .sort((a, b) => a.cor.localeCompare(b.cor, "pt") || a.tamanho.localeCompare(b.tamanho, "pt"));
  const totalTasseis = linhas.reduce((s, l) => s + l.tasseis, 0);
  const totalValor = linhas.reduce((s, l) => s + l.total, 0);
  return { linhas, totalTasseis, totalValor };
}
