import { Hono } from "hono";
import type { Env } from "../index";

// =============================================================================
// PLACAR — endpoint SÓ DE LEITURA pra ferramentas de fora (ex.: Ryze/Indi)
// lerem o total de VENDAS e PEDIDOS rumo à meta (ex.: R$ 800 mil).
//
// SEGURANÇA:
//  - Não devolve NADA sensível: só números somados (total vendido, nº de
//    pedidos, peças, por mês). Sem nome de cliente, sem CNPJ, sem detalhe.
//  - Não escreve nada: só SELECT. Jamais toca em pedido/estoque/Syntech.
//  - Barreira por chave PRÓPRIA (não é a chave da ponte). No repositório fica
//    só o HASH (SHA-256) da chave — não dá pra reverter. A chave de verdade só
//    o dono tem (cola no Ryze). Pra REVOGAR/trocar: gere outra chave, troque o
//    hash abaixo e republique.
// =============================================================================

export const placar = new Hono<{ Bindings: Env }>();

// SHA-256 (hex) da chave de leitura do placar. A chave em si NUNCA vai no código.
const PLACAR_TOKEN_SHA256 = "ccef0319a7b9c642ba4f97d2b2a2a3fde286c9ff5cce9e03f4a8fa8ed559d4bb";

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparação de tempo constante (evita descobrir a chave medindo o tempo).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Barreira: só passa quem manda a chave certa.
// Aceita em: Authorization: Bearer <chave>  |  X-Placar-Token: <chave>  |  ?token=<chave>
placar.use("*", async (c, next) => {
  const auth = c.req.header("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const recebido = (bearer || c.req.header("x-placar-token") || c.req.query("token") || "").trim();
  if (!recebido) return c.json({ ok: false, erro: "chave de acesso ausente" }, 401);
  const ok = timingSafeEqual(await sha256hex(recebido), PLACAR_TOKEN_SHA256);
  if (!ok) return c.json({ ok: false, erro: "chave de acesso invalida" }, 401);
  await next();
});

// GET /api/placar — total de vendas e pedidos no período, rumo à meta.
//   Período padrão = ano corrente (1º jan → hoje).  Override: ?de=YYYY-MM-DD&ate=YYYY-MM-DD
//   Meta padrão = 800000 (R$).                       Override: ?meta=
// Mesma base do "Relatório de vendas" (pedido_itens × pedidos): SUM(qtd × valor_unit).
placar.get("/", async (c) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const ano = hoje.slice(0, 4);
  const de = (c.req.query("de") || `${ano}-01-01`).trim();
  const ate = (c.req.query("ate") || hoje).trim();
  const meta = Math.max(0, Number(c.req.query("meta") || 800000) || 800000);

  const dataExpr = "COALESCE(NULLIF(p.data_pedido,''), date(p.created_at))";
  const base =
    `FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id ` +
    `WHERE i.qtd > 0 AND ${dataExpr} >= ? AND ${dataExpr} <= ?`;

  const resumo = await c.env.DB.prepare(
    `SELECT SUM(i.qtd * i.valor_unit) AS vendido, SUM(i.qtd) AS pecas, COUNT(DISTINCT p.id) AS pedidos ${base}`
  ).bind(de, ate).first<{ vendido: number | null; pecas: number | null; pedidos: number | null }>();

  const vendido = Math.round(Number(resumo?.vendido || 0) * 100) / 100;
  const pedidos = Number(resumo?.pedidos || 0);
  const pecas = Number(resumo?.pecas || 0);

  const porMes = (await c.env.DB.prepare(
    `SELECT substr(${dataExpr}, 1, 7) AS mes, ` +
    `ROUND(SUM(i.qtd * i.valor_unit), 2) AS vendido, COUNT(DISTINCT p.id) AS pedidos ` +
    `${base} GROUP BY mes ORDER BY mes`
  ).bind(de, ate).all()).results;

  return c.json({
    ok: true,
    meta,
    periodo: { de, ate },
    vendido,
    pedidos,
    pecas,
    percentual: meta > 0 ? Math.round((vendido / meta) * 1000) / 10 : 0,
    falta: Math.max(0, Math.round((meta - vendido) * 100) / 100),
    por_mes: porMes,
    gerado_em: new Date().toISOString(),
  });
});
