// Parser heurístico: recebe o texto (extraído do PDF ou do OCR) e tenta
// identificar os campos do pedido. Sempre passa pela CONFERÊNCIA do usuário.
// Ajustável ao layout real do PDF do ERP (ver tuning com amostra real).

export interface ItemSugerido {
  produto: string;
  ref?: string;
  cor_grade?: string;
  qtd: number;
  parte: string;
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

export function parsePedido(texto: string): SugestaoPedido {
  const text = (texto || "").replace(/\r/g, "");

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
