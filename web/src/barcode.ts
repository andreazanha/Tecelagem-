import JsBarcode from "jsbarcode";

// Gera o SVG (como texto) de um código de barras Code 128 a partir de um texto
// (ex.: a referência do produto). Code 128 é lido por leitor USB e pela câmera
// do celular. Devolve uma string de SVG, reaproveitada tanto na PRÉVIA (React,
// via dangerouslySetInnerHTML) quanto na IMPRESSÃO (HTML numa nova janela).
export function svgBarcode(texto: string, opts?: { height?: number; fontSize?: number; width?: number; displayValue?: boolean }): string {
  const code = String(texto ?? "").trim();
  if (!code) return "";
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, code, {
      format: "CODE128",
      displayValue: opts?.displayValue ?? true,
      fontSize: opts?.fontSize ?? 14,
      textMargin: 1,
      height: opts?.height ?? 40,
      width: opts?.width ?? 1.4,
      margin: 2,
      background: "transparent",
    });
    // Deixa o SVG escalar dentro da etiqueta: usa viewBox (do tamanho gerado) e
    // tira width/height fixos, pra o CSS controlar a largura/altura na etiqueta.
    const w = parseFloat(svg.getAttribute("width") || "0");
    const h = parseFloat(svg.getAttribute("height") || "0");
    if (w > 0 && h > 0) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return svg.outerHTML;
  } catch {
    // Fallback legível se algo falhar: mostra o código em texto (nunca quebra a etiqueta).
    return `<div style="font:bold 9pt monospace;text-align:center">${code}</div>`;
  }
}
