import qrcode from "qrcode-generator";

// Gera o SVG (escalável) de um QR a partir de um texto/URL.
function svgQR(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 1, scalable: true });
}

// Abre uma folha de impressão com um QR por item (para colar na caixa/prateleira).
// Cada QR guarda a URL da tela de escaneamento do item.
export function imprimirEtiquetasQR(itens: { url: string; titulo: string; sub?: string }[]) {
  if (!itens.length) { alert("Nada para imprimir."); return; }
  const cards = itens.map((it) =>
    `<div class="q"><div class="qr">${svgQR(it.url)}</div><div class="t">${it.titulo}</div>${it.sub ? `<div class="s">${it.sub}</div>` : ""}</div>`
  ).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>QR do estoque</title><style>
    *{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;padding:8mm}
    .q{border:1px solid #b9b9c2;border-radius:6px;padding:3mm;text-align:center;break-inside:avoid;display:flex;flex-direction:column;align-items:center;gap:1mm}
    .qr{width:30mm;height:30mm} .qr svg{width:100%;height:100%;display:block}
    .t{font-weight:800;font-size:10.5pt;line-height:1.1}
    .s{font-size:8pt;color:#555}
    @page{margin:8mm}
  </style></head><body><div class="grid">${cards}</div><script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
