// Gera o PDF de produção/pronta-entrega no padrão Big Tricot (pdf-lib, roda no Worker).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import qrcode from "qrcode-generator";
import type { Bloco, TasselRomaneio, RomaneioCostura } from "./classificar";

const A4W = 595.28;
const A4H = 841.89;

function hx(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const NAVY = hx("#22416b"),
  GOLD = hx("#c2a05a"),
  GREEN = hx("#1f7a4d"),
  GREY = hx("#eef0f3"),
  REDC = hx("#c0392b"),
  QBLUE = hx("#1d4ed8"),
  INK = hx("#111827"),
  MUTE = hx("#94a3b8"),
  WHITE = hx("#ffffff"),
  LINEC = hx("#e5e7eb");
const SW: Record<string, string> = {
  ROMENIA: "#7a5230", TERRACOTA: "#c2693f", AREIA: "#d9c7a0", GEADA: "#e6ecee",
  TORNADO: "#6b7280", "BEGE NOVO": "#d8c1a0", AVELA: "#b0894f", "VERDE MATA": "#3c5a3c",
  MARE: "#3f6f8f", "MARÉ": "#3f6f8f", MARINHO: "#1e2a52", MOSTARDA: "#c8a22a", CACAU: "#5b3a29",
  COLMEIA: "#d8a23f", COBRE: "#b5651d", "OFF-WHITE": "#f4efe3", "OFF WHITE": "#f4efe3",
};

export interface PedidoInfo {
  cliente: string;
  representante: string;
  numero: string; // código principal — código pai (OP-xxxx) ou número do pedido único
  pedidos?: string; // números originais quando é OP consolidada (ex.: "3756, 3768")
  emissao: string;
  entrega: string;
  observacao?: string; // exibida em VERMELHO no cabeçalho
}

// Quebra um texto em linhas que cabem em `maxW` (pdf-lib não tem wrap automático).
// Também quebra PALAVRAS muito longas (sem espaços) caractere a caractere.
function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  const fechar = () => {
    if (atual) {
      linhas.push(atual);
      atual = "";
    }
  };
  for (let p of s.split(/\s+/).filter(Boolean)) {
    // palavra maior que a largura → corta em pedaços que cabem
    while (font.widthOfTextAtSize(p, size) > maxW) {
      fechar();
      let i = 1;
      while (i < p.length && font.widthOfTextAtSize(p.slice(0, i + 1), size) <= maxW) i++;
      linhas.push(p.slice(0, i));
      p = p.slice(i);
    }
    if (!p) continue;
    const tent = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(tent, size) > maxW && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tent;
    }
  }
  fechar();
  return linhas;
}

// Trunca com reticências para caber em `maxW` (evita estourar o cabeçalho).
function fit(s: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (font.widthOfTextAtSize(s.slice(0, mid) + "…", size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + "…";
}

function geradoEm(): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // ~horário de Brasília (UTC-3)
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Junta vários PDFs (um por parte) num único arquivo de várias páginas — usado na PRÉVIA.
export async function mergePdfs(lista: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of lista) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

export async function gerarPdfParte(
  parteLabel: string,
  subtitulo: string,
  banda: "gold" | "green",
  ped: PedidoInfo,
  blocos: Bloco[],
  cores: Record<string, { hex?: string; foto?: Uint8Array }> = {} // nome(maiúsculo) -> cor visual
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);

  // pré-embute as fotos das cores (quando houver)
  const fotos = new Map<string, PDFImage>();
  for (const [k, v] of Object.entries(cores)) {
    if (!v.foto || v.foto.length < 4) continue;
    try {
      const img = v.foto[0] === 0x89 && v.foto[1] === 0x50 ? await doc.embedPng(v.foto) : await doc.embedJpg(v.foto);
      fotos.set(k, img);
    } catch {
      /* imagem inválida: ignora, cai no hex */
    }
  }
  const bandaColor = banda === "green" ? GREEN : GOLD;
  const bandaTxt = banda === "green" ? WHITE : hx("#3a2f12");

  const M = 34;
  const ix = M;
  const iw = A4W - 2 * M;
  const qx = ix + iw * 0.52;

  let page = doc.addPage([A4W, A4H]);
  const T = (s: string, x: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x, y: A4H - yTop, size, font: f, color: c });
  const TR = (s: string, xr: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: A4H - yTop, size, font: f, color: c });
  const R = (x: number, yTop: number, w: number, h: number, c = INK) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, color: c });
  const RB = (x: number, yTop: number, w: number, h: number, c: ReturnType<typeof rgb>, bw = 1) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, borderColor: c, borderWidth: bw });
  const L = (x1: number, y1: number, x2: number, c: ReturnType<typeof rgb>, th = 1) =>
    page.drawLine({ start: { x: x1, y: A4H - y1 }, end: { x: x2, y: A4H - y1 }, thickness: th, color: c });
  const Circle = (cx: number, cyTop: number, r: number, c: ReturnType<typeof rgb>) =>
    page.drawCircle({ x: cx, y: A4H - cyTop, size: r, color: c, borderColor: hx("#94a3b8"), borderWidth: 0.7 });

  function header(): number {
    const bh = 88;
    R(0, 0, A4W, bh, NAVY);
    T("BIG TRICOT", ix, 44, 24, bld, WHITE);
    T("HOME DECOR", ix + 2, 60, 8, reg, hx("#c7d2e0"));
    T("Ordem de Produção", ix + 210, 40, 16, bld, WHITE);
    T(subtitulo, ix + 210, 58, 10, reg, hx("#c7d2e0"));
    TR(`Gerado em ${geradoEm()}`, ix + iw, 34, 8.5, reg, hx("#aab8cc"));
    const pw = 16 + bld.widthOfTextAtSize(parteLabel, 9);
    R(ix + iw - pw, 46, pw, 20, bandaColor);
    T(parteLabel, ix + iw - pw + 8, 60, 9, bld, bandaTxt);
    // dados
    let y = bh + 26;
    const info = (k: string, v: string, vc = INK) => {
      T(k, ix, y, 8.5, bld, MUTE);
      T(fit(v, bld, 10, iw - 140 - 4), ix + 140, y, 10, bld, vc);
      y += 20;
    };
    info("CLIENTE", ped.cliente);
    info("REPRESENTANTE", ped.representante);
    if (ped.pedidos && ped.pedidos.trim()) {
      info("CÓDIGO PAI", ped.numero);
      info("PEDIDOS", ped.pedidos);
    } else {
      info(ped.numero.includes(",") ? "PEDIDOS" : "PEDIDO", ped.numero);
    }
    T("DATAS", ix, y, 8.5, bld, MUTE);
    T(`Emissão: ${ped.emissao}`, ix + 140, y, 10, bld);
    T(`Entrega: ${ped.entrega}`, ix + 320, y, 10, bld);
    y += 20;
    // OBSERVAÇÃO em VERMELHO, logo abaixo do bloco de dados (antes dos itens).
    if (ped.observacao && ped.observacao.trim()) {
      y += 6;
      T("OBSERVAÇÃO", ix, y, 8.5, bld, MUTE);
      const linhas = wrap(ped.observacao.trim().toUpperCase(), bld, 10.5, iw - 140);
      for (const ln of linhas) {
        T(ln, ix + 140, y, 10.5, bld, REDC);
        y += 15;
      }
      y += 5;
    } else {
      y += 8;
    }
    const titulo = banda === "green" ? "ITENS — PRONTA ENTREGA" : "ITENS A PRODUZIR";
    T(titulo, ix, y, 13, bld, NAVY);
    R(ix, y + 6, iw, 2.5, NAVY);
    return y + 22;
  }

  // Cabeçalho de CONTINUAÇÃO (páginas 2+): só uma faixa fina identificando a parte.
  function headerCont(): number {
    const bh = 34;
    R(0, 0, A4W, bh, NAVY);
    T("BIG TRICOT", ix, 22, 13, bld, WHITE);
    T(`Ordem de Produção · ${parteLabel} (continuação)`, ix + 130, 22, 10, reg, hx("#c7d2e0"));
    const pw = 16 + bld.widthOfTextAtSize(parteLabel, 9);
    R(ix + iw - pw, 8, pw, 18, bandaColor);
    T(parteLabel, ix + iw - pw + 8, 21, 9, bld, bandaTxt);
    return bh + 24;
  }

  let y = header();
  const total = blocos.reduce((a, b) => a + b.total, 0);

  for (const b of blocos) {
    const blocoH = 26 + 16 + b.sizes.length * 18 + 10;
    if (y + blocoH > A4H - 70) {
      page = doc.addPage([A4W, A4H]);
      y = headerCont();
    }
    // barra cinza
    R(ix, y, iw, 26, GREY);
    let tx = ix + 10;
    T("Modelo:", tx, y + 17, 9.5, reg, hx("#6b7280")); tx += reg.widthOfTextAtSize("Modelo:", 9.5) + 6;
    T(b.modelo, tx, y + 17, 11, bld); tx += bld.widthOfTextAtSize(b.modelo, 11) + 14;
    T("Ref:", tx, y + 17, 9.5, reg, hx("#6b7280")); tx += reg.widthOfTextAtSize("Ref:", 9.5) + 5;
    T(b.ref || "—", tx, y + 17, 10, bld); tx += bld.widthOfTextAtSize(b.ref || "—", 10) + 10;
    if (b.comp) T("· " + b.comp, tx, y + 17, 8.5, bld, REDC);
    const corKey = (b.cor || "").toUpperCase();
    const foto = fotos.get(corKey);
    if (foto) {
      // foto da cor como um quadradinho onde ficaria a bolinha
      page.drawImage(foto, { x: qx, y: A4H - (y + 7) - 13, width: 13, height: 13 });
    } else {
      Circle(qx + 6, y + 13, 6, hx(cores[corKey]?.hex || SW[corKey] || "#c9cdd3"));
    }
    T(b.cor, qx + 18, y + 17, 10.5, bld);
    TR(`Total: ${b.total} ${b.total === 1 ? "peça" : "peças"}`, ix + iw - 10, y + 17, 10, bld);
    // cabeçalho tabela
    let ry = y + 26;
    T("PRODUTO / TAMANHO", ix + 10, ry + 13, 8, bld, MUTE);
    T("QUANTIDADE PEDIDA", qx + 14, ry + 13, 8, bld, MUTE);
    L(ix, ry + 18, ix + iw, LINEC, 1);
    ry += 18;
    for (const s of b.sizes) {
      T(`${s.tipo ? s.tipo + " " : ""}${s.tamanho}`, ix + 10, ry + 14, 10, bld);
      RB(qx + 14, ry + 5, 11, 11, hx("#9aa3b2"), 1.2);
      T(`${s.qtd} ${s.qtd === 1 ? "peça" : "peças"}`, qx + 32, ry + 14, 10, bld, QBLUE);
      L(ix, ry + 19, ix + iw, hx("#eef0f4"), 0.8);
      ry += 18;
    }
    y = ry + 10;
  }

  // faixa total
  if (y + 50 > A4H - 30) {
    page = doc.addPage([A4W, A4H]);
    y = headerCont();
  }
  R(ix, y + 6, iw, 34, bandaColor);
  const rot = parteLabel === "PARTE ÚNICA" ? "QTD TOTAL" : `QTD ${parteLabel}`;
  const txt = `${rot}: ${total}`;
  page.drawText(txt, {
    x: ix + iw / 2 - bld.widthOfTextAtSize(txt, 14) / 2,
    y: A4H - (y + 6) - 23,
    size: 14,
    font: bld,
    color: bandaTxt,
  });

  return await doc.save();
}

// ── Romaneio de TASSEL — 3 vias na mesma página, só a quantidade total ───────
const money = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

export async function gerarRomaneioTassel(
  ped: PedidoInfo,
  prestador: string,
  rom: TasselRomaneio,
  opts: { volumes?: string; dataSaida?: string; dataRetorno?: string } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 34;
  const ix = M;
  const iw = A4W - 2 * M;
  const page = doc.addPage([A4W, A4H]);

  const T = (s: string, x: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x, y: A4H - yTop, size, font: f, color: c });
  const TR = (s: string, xr: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: A4H - yTop, size, font: f, color: c });
  const TC = (s: string, xc: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xc - f.widthOfTextAtSize(s, size) / 2, y: A4H - yTop, size, font: f, color: c });
  const R = (x: number, yTop: number, w: number, h: number, c = INK) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, color: c });
  const RB = (x: number, yTop: number, w: number, h: number, c: ReturnType<typeof rgb>, bw = 0.8) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, borderColor: c, borderWidth: bw });
  const seg = (x1: number, y1: number, x2: number, y2: number, c: ReturnType<typeof rgb>, th = 0.8, dash?: number[]) =>
    page.drawLine({ start: { x: x1, y: A4H - y1 }, end: { x: x2, y: A4H - y2 }, thickness: th, color: c, ...(dash ? { dashArray: dash } : {}) });

  const LINEC2 = hx("#cbd5e1");
  const GREY2 = hx("#eef1f5");
  const SLATE = hx("#334155");
  // 5 colunas: Cor | Tam | Tasseis | Vl Unit | Vl Total
  const colX = [ix, ix + iw * 0.40, ix + iw * 0.53, ix + iw * 0.69, ix + iw * 0.85, ix + iw];
  const viaH = (A4H - 16) / 3;
  const nRows = rom.linhas.length || 1;

  function drawVia(top: number, n: number) {
    // Cabeçalho branco compacto: logo à esquerda, ROMANEIO Nº à direita.
    T("BIG TRICOT", ix, top + 15, 13, bld, INK);
    T("HOME DECOR", ix + 2, top + 24, 6, reg, MUTE);
    const via = ["Empresa", "Prestador", "Caixa"][n - 1] || "";
    TR(`ROMANEIO TASSEL Nº ${ped.numero}`, ix + iw, top + 13, 11, bld, INK);
    TR(`${n}ª via (${via}) · Emitido em ${opts.dataSaida || ped.emissao}`, ix + iw, top + 24, 7.5, reg, MUTE);
    seg(ix, top + 31, ix + iw, top + 31, LINEC2, 0.8);

    // Bloco de dados (2 colunas, compacto).
    const rx = ix + iw * 0.55;
    let iy = top + 44;
    const lab = (x: number, yy: number, t: string) => T(t, x, yy, 8, bld, SLATE);
    const val = (x: number, yy: number, t: string, max: number) => T(fit(t, reg, 9, max), x, yy, 9, reg, INK);
    lab(ix, iy, "Cliente:");
    val(ix + 48, iy, ped.cliente, iw * 0.42);
    lab(rx, iy, "Pedido:");
    val(rx + 48, iy, `#${ped.numero}`, iw * 0.40);
    iy += 13;
    lab(ix, iy, "Prestador:");
    T(prestador || "______________________", ix + 56, iy, 9, bld, INK);
    lab(rx, iy, "Volumes:");
    val(rx + 48, iy, opts.volumes || "—", iw * 0.40);
    iy += 13;
    lab(ix, iy, "Data Saída:");
    val(ix + 58, iy, opts.dataSaida || ped.emissao, 120);
    lab(rx, iy, "Data Retorno:");
    val(rx + 66, iy, opts.dataRetorno || "—", 120);

    // Tabela com grade — altura da linha adaptada para caber as 3 vias.
    const ty = iy + 14;
    const headH = 15, totH = 18, footH = 26;
    const avail = viaH - (ty - top) - headH - totH - footH - 6;
    const rowH = Math.max(11, Math.min(16, avail / nRows));
    const tableH = headH + nRows * rowH + totH;
    R(ix, ty, iw, headH, GREY2);
    R(ix, ty + headH + nRows * rowH, iw, totH, GREY2);
    T("Cor", colX[0] + 7, ty + 11, 8, bld, SLATE);
    T("Tam", colX[1] + 5, ty + 11, 8, bld, SLATE);
    TR("Tasseis", colX[3] - 7, ty + 11, 8, bld, SLATE);
    TR("Vl Unit.", colX[4] - 7, ty + 11, 8, bld, SLATE);
    TR("Vl Total", colX[5] - 7, ty + 11, 8, bld, SLATE);
    let ry = ty + headH;
    for (const l of rom.linhas) {
      const yb = ry + rowH - 5;
      T(fit(l.cor || "—", reg, 9, colX[1] - colX[0] - 12), colX[0] + 7, yb, 9, reg);
      T(l.tamanho, colX[1] + 5, yb, 9, bld);
      TR(String(l.tasseis), colX[3] - 7, yb, 9.5, bld, QBLUE);
      TR(l.valorUnit ? money(l.valorUnit) : "—", colX[4] - 7, yb, 9, reg);
      TR(l.total ? money(l.total) : "—", colX[5] - 7, yb, 9, bld);
      ry += rowH;
    }
    T("TOTAL", colX[0] + 7, ry + 13, 9.5, bld, INK);
    TR(`${rom.totalTasseis} tasseis`, colX[3] - 7, ry + 13, 9, bld, INK);
    TR(money(rom.totalValor), colX[5] - 7, ry + 13, 10, bld, INK);
    RB(ix, ty, iw, tableH, LINEC2, 0.8);
    seg(ix, ty + headH, ix + iw, ty + headH, LINEC2, 0.8);
    seg(ix, ty + headH + nRows * rowH, ix + iw, ty + headH + nRows * rowH, LINEC2, 0.8);
    for (let i = 1; i < nRows; i++) seg(ix, ty + headH + i * rowH, ix + iw, ty + headH + i * rowH, hx("#e6eaf0"), 0.5);
    for (let i = 1; i < 5; i++) seg(colX[i], ty, colX[i], ty + tableH, LINEC2, 0.8);

    // Só a 1ª via (Empresa) tem assinatura — dois campos (IDA / RETORNO), igual à costura.
    // 2ª (Prestador) e 3ª (Caixa) são controle, sem assinatura.
    const fy = ty + tableH + 14;
    if (n === 1) {
      seg(ix, fy, ix + iw * 0.45, fy, LINEC2, 0.8);
      seg(ix + iw * 0.53, fy, ix + iw, fy, LINEC2, 0.8);
      T("Conferido na IDA", ix, fy + 11, 8, bld, SLATE);
      T("Assinatura / Data", ix, fy + 20, 7, reg, MUTE);
      T("Conferido no RETORNO", ix + iw * 0.53, fy + 11, 8, bld, SLATE);
      T("Assinatura / Data", ix + iw * 0.53, fy + 20, 7, reg, MUTE);
    }
  }

  for (let i = 0; i < 3; i++) drawVia(8 + i * viaH, i + 1);
  for (let i = 1; i < 3; i++) {
    const cutY = i * viaH + 4;
    seg(ix, cutY, ix + iw, cutY, hx("#9aa3b2"), 0.7, [4, 3]);
    const ct = "CORTAR AQUI";
    const ctw = bld.widthOfTextAtSize(ct, 7.5) + 22;
    R(A4W / 2 - ctw / 2, cutY - 5, ctw, 10, WHITE);
    TC(ct, A4W / 2, cutY + 2.5, 7.5, bld, hx("#64748b"));
  }
  return await doc.save();
}

// Uma linha de serviço do romaneio de costura (nome + qtd + valor unit + total).
export interface ServicoLinha {
  nome: string;
  agrupamento: string;
  qtd: number;
  valorUnit: number;
  total: number;
}

// ── Romaneio de COSTURA — 2 vias (1ª Empresa / 2ª Costureira) ─────────────────
// Tabela Serviço · Qtd · Vl Unit · Vl Total (valores pré-fixados do cadastro) e
// TOTAL GERAL (peças + R$). Se não houver serviços cadastrados, cai nas duas
// famílias (Peseiras/Mantas, Almofadas/Capas) sem valor.
export async function gerarRomaneioCostura(
  ped: PedidoInfo,
  prestador: string,
  rom: RomaneioCostura,
  servicos: ServicoLinha[] = [],
  totalValor = 0,
  opts: { volumes?: string; dataSaida?: string; dataRetorno?: string } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 34;
  const ix = M;
  const iw = A4W - 2 * M;
  const page = doc.addPage([A4W, A4H]);

  const T = (s: string, x: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x, y: A4H - yTop, size, font: f, color: c });
  const TR = (s: string, xr: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: A4H - yTop, size, font: f, color: c });
  const TC = (s: string, xc: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xc - f.widthOfTextAtSize(s, size) / 2, y: A4H - yTop, size, font: f, color: c });
  const R = (x: number, yTop: number, w: number, h: number, c = INK) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, color: c });
  const RB = (x: number, yTop: number, w: number, h: number, c: ReturnType<typeof rgb>, bw = 0.8) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, borderColor: c, borderWidth: bw });
  const seg = (x1: number, y1: number, x2: number, y2: number, c: ReturnType<typeof rgb>, th = 0.8, dash?: number[]) =>
    page.drawLine({ start: { x: x1, y: A4H - y1 }, end: { x: x2, y: A4H - y2 }, thickness: th, color: c, ...(dash ? { dashArray: dash } : {}) });

  const temValor = servicos.length > 0;
  // Linhas: serviços (com valor) OU as 2 famílias (fallback sem valor).
  const linhas: { nome: string; qtd: number; valorUnit: number; total: number }[] = temValor
    ? servicos.map((s) => ({ nome: s.nome, qtd: s.qtd, valorUnit: s.valorUnit, total: s.total }))
    : [
        { nome: "Peseiras / Mantas", qtd: rom.peseirasMantas, valorUnit: 0, total: 0 },
        { nome: "Almofadas / Capas", qtd: rom.almofadasCapas, valorUnit: 0, total: 0 },
        ...(rom.outros > 0 ? [{ nome: "Outros", qtd: rom.outros, valorUnit: 0, total: 0 }] : []),
      ];

  // Geometria da tabela (4 colunas).
  const colX = [ix, ix + iw * 0.595, ix + iw * 0.735, ix + iw * 0.865, ix + iw];
  const LINEC2 = hx("#cbd5e1");
  const GREY2 = hx("#eef1f5");
  const SLATE = hx("#334155");

  function drawVia(top: number) {
    // Cabeçalho branco: logo (texto) à esquerda, ROMANEIO Nº à direita.
    T("BIG TRICOT", ix, top + 20, 17, bld, INK);
    T("HOME DECOR", ix + 2, top + 31, 7, reg, MUTE);
    TR(`ROMANEIO Nº ${ped.numero}`, ix + iw, top + 18, 13, bld, INK);
    TR(`Emitido em ${opts.dataSaida || ped.emissao}`, ix + iw, top + 31, 8, reg, MUTE);
    seg(ix, top + 42, ix + iw, top + 42, LINEC2, 0.8);

    // Bloco de dados (2 colunas).
    const rx = ix + iw * 0.55;
    let iy = top + 60;
    const lab = (x: number, yy: number, t: string) => T(t, x, yy, 8.5, bld, SLATE);
    const val = (x: number, yy: number, t: string, max: number) => T(fit(t, reg, 9.5, max), x, yy, 9.5, reg, INK);
    // Cliente (pode quebrar em 2 linhas)
    lab(ix, iy, "Cliente:");
    const clLines = wrap(ped.cliente, reg, 9.5, iw * 0.40);
    T(clLines[0] || "—", ix + 50, iy, 9.5, reg, INK);
    if (clLines[1]) T(fit(clLines[1], reg, 9.5, iw * 0.40), ix + 50, iy + 11, 9.5, reg, INK);
    lab(rx, iy, "Pedido:");
    val(rx + 52, iy, `#${ped.numero}`, iw * 0.40);
    iy += 22;
    lab(ix, iy, "Costureira:");
    T(prestador || "______________________", ix + 62, iy, 9.5, bld, INK);
    lab(rx, iy, "Volumes:");
    val(rx + 52, iy, opts.volumes || "—", iw * 0.40);
    iy += 16;
    lab(ix, iy, "Data Saída:");
    val(ix + 62, iy, opts.dataSaida || ped.emissao, 120);
    lab(rx, iy, "Data Retorno:");
    val(rx + 70, iy, opts.dataRetorno || "—", 120);

    // Tabela com grade.
    let ty = iy + 20;
    const headH = 20, rowH = 22, totH = 26;
    const tableH = headH + linhas.length * rowH + totH;
    R(ix, ty, iw, headH, GREY2); // header fill
    R(ix, ty + headH + linhas.length * rowH, iw, totH, GREY2); // total fill
    // header labels
    T("Serviço", colX[0] + 8, ty + 13, 8.5, bld, SLATE);
    TR("Qtd", colX[2] - 8, ty + 13, 8.5, bld, SLATE);
    TR("Vl Unit.", colX[3] - 8, ty + 13, 8.5, bld, SLATE);
    TR("Vl Total", colX[4] - 8, ty + 13, 8.5, bld, SLATE);
    // rows
    let ry = ty + headH;
    for (const l of linhas) {
      T(fit(l.nome, bld, 9.5, colX[1] - colX[0] - 16), colX[0] + 8, ry + 15, 9.5, bld);
      TR(String(l.qtd), colX[2] - 8, ry + 15, 10, bld, QBLUE);
      TR(temValor ? money(l.valorUnit) : "—", colX[3] - 8, ry + 15, 9.5, reg);
      TR(temValor ? money(l.total) : "—", colX[4] - 8, ry + 15, 9.5, bld);
      ry += rowH;
    }
    // total row
    T("TOTAL GERAL", colX[0] + 8, ry + 17, 10, bld, INK);
    TR(`${rom.totalPecas} pç`, colX[2] - 8, ry + 17, 9.5, bld, INK);
    if (temValor) TR(money(totalValor), colX[4] - 8, ry + 17, 11, bld, INK);
    // grade: borda externa + linhas
    RB(ix, ty, iw, tableH, LINEC2, 0.8);
    seg(ix, ty + headH, ix + iw, ty + headH, LINEC2, 0.8); // sob o cabeçalho
    seg(ix, ty + headH + linhas.length * rowH, ix + iw, ty + headH + linhas.length * rowH, LINEC2, 0.8); // sobre o total
    for (let i = 1; i < linhas.length; i++)
      seg(ix, ty + headH + i * rowH, ix + iw, ty + headH + i * rowH, hx("#e6eaf0"), 0.6);
    for (let i = 1; i < 4; i++) seg(colX[i], ty, colX[i], ty + tableH, LINEC2, 0.8);

    // Rodapé: assinaturas (IDA / RETORNO).
    const fy = ty + tableH + 34;
    seg(ix, fy, ix + iw * 0.45, fy, LINEC2, 0.8);
    seg(ix + iw * 0.53, fy, ix + iw, fy, LINEC2, 0.8);
    T("Conferido na IDA", ix, fy + 12, 8.5, bld, SLATE);
    T("Assinatura / Data", ix, fy + 22, 7.5, reg, MUTE);
    T("Conferido no RETORNO", ix + iw * 0.53, fy + 12, 8.5, bld, SLATE);
    T("Assinatura / Data", ix + iw * 0.53, fy + 22, 7.5, reg, MUTE);
  }

  const viaH = (A4H - 16) / 2;
  drawVia(20);
  drawVia(20 + viaH);
  // linha de corte entre as vias
  const cutY = viaH + 12;
  seg(ix, cutY, ix + iw, cutY, hx("#9aa3b2"), 0.7, [4, 3]);
  const ct = "CORTAR AQUI";
  const ctw = bld.widthOfTextAtSize(ct, 8) + 26;
  R(A4W / 2 - ctw / 2, cutY - 6, ctw, 12, WHITE);
  TC(ct, A4W / 2, cutY + 3, 8, bld, hx("#64748b"));
  return await doc.save();
}

// ── Relatório de Pagamento (Costureiras / Tassel) ─────────────────────────────
export interface ResumoPagamentoLinha {
  numero: string;
  data_saida: string | null;
  data_retorno: string | null;
  retornou: number;
  total_pecas: number;
  total_valor: number;
}
export interface ResumoPagamentoGrupo {
  costureira: string;
  romaneios: ResumoPagamentoLinha[];
  totalPecas: number;
  totalValor: number;
  pendentes: number;
  pendentePecas: number;
  pendenteValor: number;
}
export interface ResumoPagamento {
  mes: string;
  tipo: string; // costura | tassel
  grupos: ResumoPagamentoGrupo[];
  totalGeral: number;
}

export async function gerarRelatorioPagamento(resumo: ResumoPagamento, tipo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 34;
  const ix = M;
  const iw = A4W - 2 * M;
  let page = doc.addPage([A4W, A4H]);
  let y = 0;
  const SLATE = hx("#334155"),
    LINEC2 = hx("#cbd5e1"),
    GREY2 = hx("#eef1f5"),
    FADE = hx("#aab2c0"),
    AMBER = hx("#b45309");
  const unidade = tipo === "tassel" ? "tasseis" : "pç";

  const T = (s: string, x: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x, y: A4H - yTop, size, font: f, color: c });
  const TR = (s: string, xr: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: A4H - yTop, size, font: f, color: c });
  const R = (x: number, yTop: number, w: number, h: number, c = INK) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, color: c });
  const seg = (x1: number, y1: number, x2: number, c: ReturnType<typeof rgb>, th = 0.7) =>
    page.drawLine({ start: { x: x1, y: A4H - y1 }, end: { x: x2, y: A4H - y1 }, thickness: th, color: c });
  const quebra = (need: number) => {
    if (y + need > A4H - 40) {
      page = doc.addPage([A4W, A4H]);
      y = 40;
    }
  };

  // Cabeçalho
  R(0, 0, A4W, 60, NAVY);
  T("BIG TRICOT", ix, 28, 17, bld, WHITE);
  T("HOME DECOR", ix + 2, 40, 7, reg, hx("#c7d2e0"));
  TR("RELATÓRIO DE PAGAMENTO", ix + iw, 26, 13, bld, WHITE);
  TR(`${tipo === "tassel" ? "Tassel" : "Costureiras"} · ${resumo.mes || "todos os meses"} · gerado ${geradoEm()}`, ix + iw, 40, 8.5, reg, hx("#c7d2e0"));
  y = 84;

  // Colunas: Romaneio | Saída | Retorno prev. | Status | Qtd | Valor
  const cX = [ix, ix + iw * 0.20, ix + iw * 0.37, ix + iw * 0.55, ix + iw * 0.74, ix + iw];

  for (const g of resumo.grupos) {
    quebra(60);
    // título da pessoa
    R(ix, y, iw, 22, GREY2);
    T(g.costureira, ix + 8, y + 15, 11, bld, INK);
    TR(`a pagar: ${g.totalPecas} ${unidade} · ${money(g.totalValor)}`, ix + iw - 8, y + 15, 10, bld, INK);
    y += 22;
    // cabeçalho da tabela
    T("Romaneio", cX[0] + 6, y + 12, 8, bld, SLATE);
    T("Saída", cX[1] + 6, y + 12, 8, bld, SLATE);
    T("Retorno prev.", cX[2] + 6, y + 12, 8, bld, SLATE);
    T("Status", cX[3] + 6, y + 12, 8, bld, SLATE);
    TR("Qtd", cX[4] - 6, y + 12, 8, bld, SLATE);
    TR("Valor", cX[5] - 6, y + 12, 8, bld, SLATE);
    y += 16;
    seg(ix, y, ix + iw, LINEC2);
    for (const r of g.romaneios) {
      quebra(18);
      const dt = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");
      // Pendente = não liberado: linha esmaecida (não entra no total a pagar).
      const cor = r.retornou ? INK : FADE;
      T(`Nº ${r.numero}`, cX[0] + 6, y + 13, 9, bld, cor);
      T(dt(r.data_saida), cX[1] + 6, y + 13, 8.5, reg, cor);
      T(dt(r.data_retorno), cX[2] + 6, y + 13, 8.5, reg, cor);
      if (r.retornou) T("Liberado", cX[3] + 6, y + 13, 8.5, bld, hx("#047857"));
      else T("PENDENTE", cX[3] + 6, y + 13, 8.5, bld, FADE);
      TR(`${r.total_pecas}`, cX[4] - 6, y + 13, 9, reg, cor);
      TR(money(r.total_valor), cX[5] - 6, y + 13, 9, bld, cor);
      y += 17;
      seg(ix, y, ix + iw, hx("#eef0f4"), 0.5);
    }
    // subtotal a pagar (só liberados)
    R(ix, y, iw, 20, hx("#f8fafc"));
    T("TOTAL A PAGAR", cX[0] + 6, y + 14, 9.5, bld, INK);
    TR(`${g.totalPecas} ${unidade}`, cX[4] - 6, y + 14, 9, bld, INK);
    TR(money(g.totalValor), cX[5] - 6, y + 14, 10, bld, INK);
    y += 20;
    if (g.pendentes > 0) {
      T(`Pendentes (não entram no pagamento): ${g.pendentes} romaneio(s) · ${money(g.pendenteValor)}`, cX[0] + 6, y + 12, 8.5, reg, AMBER);
      y += 16;
    }
    y += 10;
  }

  quebra(30);
  R(ix, y, iw, 26, GOLD);
  T("TOTAL GERAL A PAGAR (liberados)", ix + 10, y + 17, 11, bld, hx("#3a2f12"));
  TR(money(resumo.totalGeral), ix + iw - 10, y + 17, 13, bld, hx("#3a2f12"));
  T("Pendentes (esmaecidos) ainda não voltaram da costura/prestador — não entram no pagamento até retornarem.", ix, A4H - 24, 8.5, reg, MUTE);
  return await doc.save();
}

// ── Recibo de Pagamento (com QR Code Pix e valor preenchido) ──────────────────
export interface ReciboDados {
  costureira: string;
  mesLabel: string;
  valor: number;
  romaneios: number; // qtd de romaneios liberados
  pecas: number;
  unidade: string; // "pç" | "tasseis"
  servico: string; // "costura" | "tassel"
  pixPayload: string; // "copia e cola"
  chave: string;
  temPix: boolean;
}

export async function gerarReciboPagamento(d: ReciboDados): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 40;
  const ix = M;
  const iw = A4W - 2 * M;
  const page = doc.addPage([A4W, A4H]);
  const SLATE = hx("#334155"),
    LINEC2 = hx("#cbd5e1");

  const T = (s: string, x: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x, y: A4H - yTop, size, font: f, color: c });
  const TR = (s: string, xr: number, yTop: number, size: number, f: PDFFont, c = INK) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: A4H - yTop, size, font: f, color: c });
  const R = (x: number, yTop: number, w: number, h: number, c = INK) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, color: c });
  const RB = (x: number, yTop: number, w: number, h: number, c: ReturnType<typeof rgb>, bw = 0.8) =>
    page.drawRectangle({ x, y: A4H - yTop - h, width: w, height: h, borderColor: c, borderWidth: bw });
  const seg = (x1: number, y1: number, x2: number, c: ReturnType<typeof rgb>, th = 0.8) =>
    page.drawLine({ start: { x: x1, y: A4H - y1 }, end: { x: x2, y: A4H - y1 }, thickness: th, color: c });

  // Cabeçalho
  R(0, 0, A4W, 70, NAVY);
  T("BIG TRICOT", ix, 34, 19, bld, WHITE);
  T("HOME DECOR", ix + 2, 47, 7.5, reg, hx("#c7d2e0"));
  TR("RECIBO DE PAGAMENTO", ix + iw, 32, 15, bld, WHITE);
  TR(`Emitido em ${geradoEm()}`, ix + iw, 47, 8.5, reg, hx("#c7d2e0"));

  let y = 110;
  // Corpo: declaração
  const texto =
    `Recebi de BIG TRICOT HOME DECOR a importância de ${money(d.valor)}, referente à mão de obra de ` +
    `${d.servico === "tassel" ? "tassel" : "costura"} do período de ${d.mesLabel}, conforme os romaneios ` +
    `liberados (retornados) relacionados abaixo.`;
  for (const ln of wrap(texto, reg, 11.5, iw)) {
    T(ln, ix, y, 11.5, reg, SLATE);
    y += 17;
  }
  y += 6;

  // Valor em destaque
  R(ix, y, iw, 46, hx("#f1f5f9"));
  RB(ix, y, iw, 46, LINEC2, 0.8);
  T("VALOR A RECEBER", ix + 16, y + 19, 9, bld, MUTE);
  T(money(d.valor), ix + 16, y + 38, 22, bld, NAVY);
  TR(`${d.romaneios} romaneio(s) · ${d.pecas} ${d.unidade}`, ix + iw - 16, y + 28, 11, bld, SLATE);
  y += 64;

  // Beneficiário
  T("BENEFICIÁRIO", ix, y, 9, bld, MUTE);
  T(d.costureira, ix + 110, y, 13, bld, INK);
  y += 26;
  seg(ix, y, ix + iw, LINEC2);
  y += 22;

  // Bloco Pix (QR + dados)
  if (d.temPix) {
    T("PAGAMENTO VIA PIX", ix, y, 11, bld, NAVY);
    y += 8;
    const qrSize = 150;
    const qrTop = y;
    // desenha o QR Code
    const qr = qrcode(0, "M");
    qr.addData(d.pixPayload);
    qr.make();
    const n = qr.getModuleCount();
    const cell = qrSize / n;
    RB(ix, qrTop, qrSize, qrSize, LINEC2, 0.8);
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(r, col)) R(ix + col * cell, qrTop + r * cell, cell + 0.3, cell + 0.3, INK);
      }
    }
    // dados ao lado do QR
    const dx = ix + qrSize + 24;
    let dy = qrTop + 16;
    T("Chave Pix:", dx, dy, 9, bld, MUTE);
    T(fit(d.chave, reg, 11, iw - qrSize - 24), dx, dy + 15, 11, reg, INK);
    dy += 40;
    T("Valor:", dx, dy, 9, bld, MUTE);
    T(money(d.valor), dx, dy + 16, 14, bld, NAVY);
    dy += 42;
    T("Escaneie o QR Code ou use o", dx, dy, 9, reg, SLATE);
    T("Pix Copia e Cola abaixo. O valor", dx, dy + 12, 9, reg, SLATE);
    T("já vem preenchido.", dx, dy + 24, 9, reg, SLATE);
    y = qrTop + qrSize + 20;

    // Pix copia e cola (texto completo)
    T("PIX COPIA E COLA", ix, y, 8.5, bld, MUTE);
    y += 12;
    R(ix, y, iw, 4 + 11 * 3, hx("#f8fafc"));
    RB(ix, y, iw, 4 + 11 * 3, LINEC2, 0.6);
    let cy = y + 12;
    for (const ln of wrap(d.pixPayload, reg, 7.5, iw - 16).slice(0, 3)) {
      T(ln, ix + 8, cy, 7.5, reg, SLATE);
      cy += 11;
    }
    y += 4 + 11 * 3 + 24;
  } else {
    R(ix, y, iw, 30, hx("#fff7ed"));
    RB(ix, y, iw, 30, hx("#fed7aa"), 0.8);
    T("⚠ Cadastre a chave Pix do prestador em Romaneios › Prestadores para o QR Code aparecer.", ix + 12, y + 19, 9.5, bld, hx("#b45309"));
    y += 50;
  }

  // Assinatura
  y = Math.max(y, A4H - 130);
  T("Para os devidos fins, firmo o presente recibo.", ix, y, 10, reg, SLATE);
  y += 50;
  seg(ix, y, ix + iw * 0.6, LINEC2);
  T(d.costureira, ix, y + 14, 10.5, bld, INK);
  T("Assinatura do beneficiário", ix, y + 26, 8.5, reg, MUTE);
  TR("Data: ____ / ____ / ______", ix + iw, y + 14, 10, reg, SLATE);
  return await doc.save();
}
