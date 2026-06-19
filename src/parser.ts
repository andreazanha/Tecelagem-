// Parser heurístico: recebe o texto (extraído do PDF ou do OCR) e tenta
// identificar os campos do pedido. Sempre passa pela CONFERÊNCIA do usuário.
// Ajustável ao layout real do PDF do ERP (ver tuning com amostra real).

export interface ItemSugerido {
  produto: string;
  ref?: string; // grade (ex.: 1075, 1083, KT1096)
  cor_grade?: string; // cor (ex.: ROMENIA)
  tamanho?: string; // ex.: 50X50, 90X200
  qtd: number;
  parte: string;
}

// Extrai o tamanho (ex.: 50X50, 90X200, 1.20X1.80) do nome do produto.
function extrairTamanho(nome: string): { produto: string; tamanho?: string } {
  const m = nome.match(/(\d[\d.,]*\s*[xX]\s*\d[\d.,]*)/);
  if (!m) return { produto: nome.trim() };
  const tamanho = m[1].replace(/\s+/g, "");
  const produto = nome.replace(m[1], "").replace(/\s{2,}/g, " ").trim();
  return { produto: produto || nome.trim(), tamanho };
}

export interface SugestaoPedido {
  numero_erp?: string;
  cliente_nome?: string;
  vendedor?: string;
  data_pedido?: string; // yyyy-mm-dd
  data_entrega?: string; // yyyy-mm-dd
  itens: ItemSugerido[];
  confianca: number; // 0..100 (estimativa grosseira)
  texto: string; // texto bruto (para conferência/depuração)
}

function dataBRtoISO(d?: string): string | undefined {
  if (!d) return undefined;
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return undefined;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = "20" + yy;
  return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function primeiraCaptura(text: string, regexes: RegExp[]): string | undefined {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

function parteDoTexto(s: string): string {
  const t = s.toLowerCase();
  if (/\bkit\b/.test(t)) return "kit";
  if (/pronta\s*entrega|\bp\.?e\.?\b/.test(t)) return "pe";
  if (/parte\s*2|\bp2\b/.test(t)) return "p2";
  if (/parte\s*1|\bp1\b/.test(t)) return "p1";
  if (/estoque/.test(t)) return "estoque";
  return "unico";
}

// Tenta interpretar tabelas em markdown (| col | col |) ou linhas "qtd x produto".
function extrairItens(text: string): ItemSugerido[] {
  const linhas = text.split("\n").map((l) => l.trim());
  const itens: ItemSugerido[] = [];

  // 1) Tabela markdown com cabeçalho
  const tabela = linhas.filter((l) => l.includes("|") && l.replace(/[^|]/g, "").length >= 2);
  if (tabela.length >= 2) {
    const header = tabela[0].toLowerCase();
    const cols = header.split("|").map((c) => c.trim());
    const idx = (alts: string[]) =>
      cols.findIndex((c) => alts.some((a) => c.includes(a)));
    const iProd = idx(["produto", "descri", "item"]);
    const iRef = idx(["ref", "código", "codigo", "cód"]);
    const iCor = idx(["cor", "grade", "tam"]);
    const iQtd = idx(["qtd", "quant"]);
    if (iProd >= 0) {
      for (const row of tabela.slice(1)) {
        if (/^[\s|:-]+$/.test(row)) continue; // separador ---
        const cells = row.split("|").map((c) => c.trim());
        const produto = cells[iProd] || "";
        if (!produto || /produto|descri/i.test(produto)) continue;
        const qtd = iQtd >= 0 ? parseInt((cells[iQtd] || "").replace(/\D/g, ""), 10) || 0 : 0;
        itens.push({
          produto,
          ref: iRef >= 0 ? cells[iRef] || undefined : undefined,
          cor_grade: iCor >= 0 ? cells[iCor] || undefined : undefined,
          qtd,
          parte: parteDoTexto(`${produto} ${cells[iRef] ?? ""} ${cells[iCor] ?? ""}`),
        });
      }
      if (itens.length) return itens;
    }
  }

  // 2) Heurística "123 x Produto" ou "Produto .... 123"
  for (const l of linhas) {
    let m = l.match(/^(\d{1,5})\s*[xX×]\s*(.+)$/);
    if (m) {
      itens.push({ produto: m[2].trim(), qtd: parseInt(m[1], 10), parte: parteDoTexto(m[2]) });
      continue;
    }
    m = l.match(/^(.{3,60}?)\s+(\d{1,5})\s*(pç|pcs|un|und|peças)?$/i);
    if (m && !/total|subtotal|valor|r\$/i.test(l)) {
      itens.push({ produto: m[1].trim(), qtd: parseInt(m[2], 10), parte: parteDoTexto(m[1]) });
    }
  }
  return itens;
}

// ───────────────────────────────────────────────────────────────────────────
// Parser específico do ERP da Big Tricot (PDF digital).
// Cabeçalho: "Pedido: 003.768 <CLIENTE> Ped. Cliente: ..." · "Data: dd/mm/aaaa"
//            "Entrega: De dd/mm/aaaa ... a dd/mm/aaaa" · "Representante: ... LTDA"
// Itens:     "Produto: <g> <cod> <NOME> Col: <c> <preço>Preço Un.: Cores <grade> UN
//             Qte. Valor em R$ <corcod> <COR> <q> <q> <valor> [...] T.: <total> <valor>"
// ───────────────────────────────────────────────────────────────────────────
function pareceERPBigTricot(text: string): boolean {
  return /Pre[çc]o\s*Un\./i.test(text) && /Produto:/i.test(text) && /Pedido:/i.test(text);
}

function parseItensERP(text: string): ItemSugerido[] {
  const itens: ItemSugerido[] = [];
  const blocos = text.split(/Produto:\s*/i).slice(1);
  const reCor =
    /(\d{4})\s+(?:\d{2,3}\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 ]*?)\s+(\d+)\s+(\d+)\s+\d{1,3}(?:\.\d{3})*,\d{2}/g;
  for (const bloco of blocos) {
    const mNome = bloco.match(/^\s*\d+\s+(\d+)\s+(.+?)\s+Col:/i);
    if (!mNome) continue;
    const nomeBruto = mNome[2].replace(/\s+/g, " ").trim();
    const { produto, tamanho } = extrairTamanho(nomeBruto);
    // Ref = GRADE (código após "Cores"); fallback para o código do produto.
    const ref = (bloco.match(/Cores\s+(\S+)\s+UN/i)?.[1] || mNome[1]).trim();
    const parte = /\bkit\b/i.test(nomeBruto) ? "kit" : "unico";
    const antesTotal = bloco.split(/\bT\.:/)[0];
    const cores = (antesTotal.split(/Valor\s*em\s*R\$/i).pop() || "").trim();
    let m: RegExpExecArray | null;
    reCor.lastIndex = 0;
    let achouCor = false;
    while ((m = reCor.exec(cores))) {
      achouCor = true;
      const cor = m[2].replace(/\s+/g, " ").trim();
      const qtd = parseInt(m[4], 10) || parseInt(m[3], 10) || 0;
      itens.push({ produto, ref, cor_grade: cor, tamanho, qtd, parte });
    }
    if (!achouCor) {
      const mTot = bloco.match(/T\.:\s*(\d+)/);
      itens.push({ produto, ref, tamanho, qtd: mTot ? parseInt(mTot[1], 10) : 0, parte });
    }
  }
  return itens;
}

function parseERPBigTricot(text: string): SugestaoPedido {
  const numRaw = text.match(/Pedido:\s*([\d.]+)/i)?.[1];
  const numero_erp = numRaw ? String(parseInt(numRaw.replace(/\D/g, ""), 10)) : undefined;

  const cliente_nome = text
    .match(/Pedido:\s*[\d.]+\s+(.+?)\s+Ped\.\s*Cliente:/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();

  const vendedor = text
    .match(/Representante:\s*(?:Fones:\S*\s*)?(.+?\s+LTDA)\b/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();

  const data_pedido = dataBRtoISO(text.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const data_entrega = dataBRtoISO(text.match(/\bDe\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]);

  const itens = parseItensERP(text);

  let achados = 0;
  for (const v of [numero_erp, cliente_nome, vendedor, data_pedido, data_entrega]) if (v) achados++;
  const confianca = Math.min(100, Math.round((achados / 5) * 50 + (itens.length > 0 ? 50 : 0)));

  return {
    numero_erp,
    cliente_nome: cliente_nome?.slice(0, 120),
    vendedor: vendedor?.slice(0, 80),
    data_pedido,
    data_entrega,
    itens,
    confianca,
    texto: text,
  };
}

export function parsePedido(texto: string): SugestaoPedido {
  const text = (texto || "").replace(/\r/g, "");
  if (pareceERPBigTricot(text)) return parseERPBigTricot(text);

  const numero_erp = primeiraCaptura(text, [
    /pedido[^\d]{0,15}(\d{3,8})/i,
    /\bn[ºo°]\s*[:.]?\s*(\d{3,8})/i,
    /\bnumero\b[^\d]{0,8}(\d{3,8})/i,
  ]);

  // Para textos "sem quebras" (PDF digital costuma juntar tudo): a captura
  // de um campo rotulado para no PRÓXIMO rótulo conhecido.
  const STOP =
    "(?=\\s+(?:vendedor|representante|data|entrega|emiss[\\u00e3a]o|pedido|n[\\u00ba\\u00bao\\u00b0]|produto|descri|refer|c[\\u00f3o]digo|qtd|quant|cor|grade|tamanho|total|subtotal|valor|r\\$|cnpj|cpf|fone|telefone|endere)|\\n|$)";
  const cliente_nome = primeiraCaptura(text, [
    new RegExp(`cliente\\s*[:\\-]\\s*(.+?)${STOP}`, "i"),
    new RegExp(`raz[\\u00e3a]o\\s*social\\s*[:\\-]\\s*(.+?)${STOP}`, "i"),
  ]);

  const vendedor = primeiraCaptura(text, [
    new RegExp(`(?:vendedor|representante)\\s*[:\\-]\\s*(.+?)${STOP}`, "i"),
  ]);

  // datas: prioriza rótulos; senão usa 1ª (pedido) e última (entrega)
  const data_entrega =
    dataBRtoISO(primeiraCaptura(text, [/entrega[^\d]{0,15}(\d{1,2}\/\d{1,2}\/\d{2,4})/i])) ||
    undefined;
  const data_pedido =
    dataBRtoISO(
      primeiraCaptura(text, [
        /(?:data|emiss[ãa]o|pedido)[^\d]{0,15}(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      ])
    ) || undefined;

  const itens = extrairItens(text);

  let achados = 0;
  for (const v of [numero_erp, cliente_nome, vendedor, data_pedido, data_entrega])
    if (v) achados++;
  const confianca = Math.min(
    100,
    Math.round((achados / 5) * 60 + (itens.length > 0 ? 40 : 0))
  );

  return {
    numero_erp,
    cliente_nome: cliente_nome?.slice(0, 120),
    vendedor: vendedor?.slice(0, 80),
    data_pedido,
    data_entrega,
    itens,
    confianca,
    texto: text,
  };
}
