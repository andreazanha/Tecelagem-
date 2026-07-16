import { Hono } from "hono";
import type { Env } from "../index";

// Estoque das etiquetas de colar (por produto + tamanho + cor).
export const etiquetas = new Hono<{ Bindings: Env }>();

// Saldos de um produto.
etiquetas.get("/", async (c) => {
  const produto = (c.req.query("produto") || "").trim();
  if (!produto) return c.json([]);
  const { results } = await c.env.DB.prepare(
    "SELECT tamanho, cor, saldo, minimo FROM etiqueta_estoque WHERE produto = ?"
  ).bind(produto).all();
  return c.json(results);
});

// Entrada (recebido da gráfica): soma no saldo, criando a linha se não existir.
etiquetas.post("/entrada", async (c) => {
  const b = (await c.req.json<{ produto?: string; itens?: { tamanho?: string; cor?: string; quantidade?: number }[] }>().catch(() => ({}))) as { produto?: string; itens?: { tamanho?: string; cor?: string; quantidade?: number }[] };
  const produto = (b.produto || "").trim();
  if (!produto) return c.json({ error: "produto é obrigatório" }, 400);
  const stmts = [];
  let n = 0;
  for (const it of b.itens || []) {
    const tam = (it.tamanho || "").trim();
    const cor = (it.cor || "").trim();
    const q = Number(it.quantidade);
    if (!tam || !cor || !q || isNaN(q) || q <= 0) continue;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO etiqueta_estoque (produto, tamanho, cor, saldo) VALUES (?, ?, ?, ?)
       ON CONFLICT(produto, tamanho, cor) DO UPDATE SET saldo = saldo + excluded.saldo`
    ).bind(produto, tam, cor, q));
    n++;
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true, itens: n });
});

// Ajuste manual: DEFINE o saldo (e o mínimo) de uma combinação.
etiquetas.post("/ajuste", async (c) => {
  const b = (await c.req.json<{ produto?: string; tamanho?: string; cor?: string; saldo?: number; minimo?: number }>().catch(() => ({}))) as { produto?: string; tamanho?: string; cor?: string; saldo?: number; minimo?: number };
  const produto = (b.produto || "").trim(), tam = (b.tamanho || "").trim(), cor = (b.cor || "").trim();
  if (!produto || !tam || !cor) return c.json({ error: "produto, tamanho e cor são obrigatórios" }, 400);
  const saldo = Math.max(0, Number(b.saldo) || 0);
  const minimo = Math.max(0, Number(b.minimo) || 0);
  await c.env.DB.prepare(
    `INSERT INTO etiqueta_estoque (produto, tamanho, cor, saldo, minimo) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(produto, tamanho, cor) DO UPDATE SET saldo = excluded.saldo, minimo = excluded.minimo`
  ).bind(produto, tam, cor, saldo, minimo).run();
  return c.json({ ok: true });
});
