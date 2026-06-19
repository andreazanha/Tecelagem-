// Gera o PDF de produção/pronta-entrega no padrão Big Tricot (pdf-lib, roda no Worker).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Bloco } from "./classificar";

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
  numero: string; // número(s) do(s) pedido(s) — ex.: "3756, 3765, 3768" numa OP consolidada
  emissao: string;
  entrega: string;
  observacao?: string; // exibida em VERMELHO no cabeçalho
}

// Quebra um texto em linhas que cabem em `maxW` (pdf-lib não tem wrap automático).
function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const palavras = s.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tent = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(tent, size) > maxW && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tent;
    }
  }
  if (atual) linhas.push(atual);
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
  blocos: Bloco[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bld = await doc.embedFont(StandardFonts.HelveticaBold);
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
    let y = bh + 24;
    // Observação em VERMELHO LOGO ABAIXO DO CABEÇALHO (destaque), com quebra de linha.
    if (ped.observacao && ped.observacao.trim()) {
      T("OBSERVAÇÃO", ix, y, 8.5, bld, MUTE);
      const linhas = wrap(ped.observacao.trim().toUpperCase(), bld, 10.5, iw - 140);
      for (const ln of linhas) {
        T(ln, ix + 140, y, 10.5, bld, REDC);
        y += 15;
      }
      y += 12;
    }
    const info = (k: string, v: string, vc = INK) => {
      T(k, ix, y, 8.5, bld, MUTE);
      T(fit(v, bld, 10, iw - 140 - 4), ix + 140, y, 10, bld, vc);
      y += 20;
    };
    info("CLIENTE", ped.cliente);
    info("REPRESENTANTE", ped.representante);
    info(ped.numero.includes(",") ? "PEDIDOS" : "PEDIDO", ped.numero);
    T("DATAS", ix, y, 8.5, bld, MUTE);
    T(`Emissão: ${ped.emissao}`, ix + 140, y, 10, bld);
    T(`Entrega: ${ped.entrega}`, ix + 320, y, 10, bld);
    y += 28;
    const titulo = banda === "green" ? "ITENS — PRONTA ENTREGA" : "ITENS A PRODUZIR";
    T(titulo, ix, y, 13, bld, NAVY);
    R(ix, y + 6, iw, 2.5, NAVY);
    return y + 22;
  }

  let y = header();
  const total = blocos.reduce((a, b) => a + b.total, 0);

  for (const b of blocos) {
    const blocoH = 26 + 16 + b.sizes.length * 18 + 10;
    if (y + blocoH > A4H - 70) {
      page = doc.addPage([A4W, A4H]);
      y = header();
    }
    // barra cinza
    R(ix, y, iw, 26, GREY);
    let tx = ix + 10;
    T("Modelo:", tx, y + 17, 9.5, reg, hx("#6b7280")); tx += reg.widthOfTextAtSize("Modelo:", 9.5) + 6;
    T(b.modelo, tx, y + 17, 11, bld); tx += bld.widthOfTextAtSize(b.modelo, 11) + 14;
    T("Ref:", tx, y + 17, 9.5, reg, hx("#6b7280")); tx += reg.widthOfTextAtSize("Ref:", 9.5) + 5;
    T(b.ref || "—", tx, y + 17, 10, bld); tx += bld.widthOfTextAtSize(b.ref || "—", 10) + 10;
    if (b.comp) T("· " + b.comp, tx, y + 17, 8.5, bld, REDC);
    Circle(qx + 6, y + 13, 6, hx(SW[b.cor?.toUpperCase()] || "#c9cdd3"));
    T(b.cor, qx + 18, y + 17, 10.5, bld);
    TR(`Total: ${b.total} ${b.total === 1 ? "peça" : "peças"}`, ix + iw - 10, y + 17, 10, bld);
    // cabeçalho tabela
    let ry = y + 26;
    T("TAMANHO", ix + 10, ry + 13, 8, bld, MUTE);
    T("QUANTIDADE PEDIDA", qx + 14, ry + 13, 8, bld, MUTE);
    L(ix, ry + 18, ix + iw, LINEC, 1);
    ry += 18;
    for (const s of b.sizes) {
      T(s.tamanho, ix + 10, ry + 14, 10, bld);
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
    y = 50;
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
