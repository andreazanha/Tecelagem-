// Resolve a FOTO (bytes) de cada MODELO de um pedido, puxando a MESMA foto que o
// catálogo online mostra: o documento "catalogo/main" guarda os produtos com a URL
// da foto (Cloudinary), casada por NOME do modelo. Usado no "Espelho do Pedido" (com
// valor) e no PDF do pedido do catálogo, pra mostrar a miniatura do produto no card.
//
// Falha SEMPRE de forma graciosa: sem documento, sem foto cadastrada ou erro de rede,
// o modelo simplesmente fica sem miniatura (o card continua compacto). Nunca derruba o PDF.
import { lerDocumento } from "./firestore";

// Normaliza nome do modelo pra casar (tira acento, caixa, espaços repetidos).
const norm = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type ProdCat = { nome?: string; foto?: string };

// Só JPG/PNG (magic bytes) — são os formatos que o pdf-lib embute.
function fotoValida(b: Uint8Array): boolean {
  return b.length > 4 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));
}

export async function fotosProdutoDoPedido(
  env: { FIREBASE_SA?: string },
  modelos: string[]
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  const alvos = [...new Set(modelos.map((m) => (m || "").trim()).filter(Boolean))];
  if (!alvos.length) return out;

  let base: Record<string, unknown> | null = null;
  try {
    base = await lerDocumento(env, "catalogo/main");
  } catch {
    return out; // sem catálogo → sem miniatura
  }
  if (!base) return out;

  const el = base.edicao_limitada && typeof base.edicao_limitada === "object" ? (base.edicao_limitada as Record<string, unknown>) : {};
  const prods: ProdCat[] = [
    ...(Array.isArray(base.produtos) ? (base.produtos as ProdCat[]) : []),
    ...(Array.isArray((el as { produtos?: unknown }).produtos) ? ((el as { produtos: ProdCat[] }).produtos) : []),
  ];
  // nome normalizado do modelo → URL da foto
  const mapa = new Map<string, string>();
  for (const p of prods) {
    if (p && p.foto && p.nome) {
      const k = norm(p.nome);
      if (k && !mapa.has(k)) mapa.set(k, String(p.foto));
    }
  }
  if (!mapa.size) return out;

  // Busca cada URL só uma vez (vários modelos podem não repetir, mas protege de qualquer forma).
  const cache = new Map<string, Uint8Array | null>();
  for (const modelo of alvos) {
    const url = mapa.get(norm(modelo));
    if (!url) continue;
    let bytes = cache.get(url);
    if (bytes === undefined) {
      bytes = null;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const buf = new Uint8Array(await resp.arrayBuffer());
          if (fotoValida(buf)) bytes = buf;
        }
      } catch {
        bytes = null; // timeout/erro de rede → segue sem a foto desse modelo
      }
      cache.set(url, bytes);
    }
    if (bytes) out[modelo.toUpperCase().trim()] = bytes;
  }
  return out;
}
