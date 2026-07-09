// Coleções de produtos (many-to-many). Cada coleção agrupa produtos escolhidos;
// um produto pode estar em várias coleções, com tipo de fio diferente em cada.
import { Hono } from "hono";
import type { Env } from "../index";

export const colecoes = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();

// Lista as coleções com a contagem de produtos.
colecoes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT col.id, col.nome, col.ordem,
            (SELECT COUNT(*) FROM colecao_produtos cp WHERE cp.colecao_id = col.id) AS produtos
       FROM colecoes col ORDER BY col.ordem, col.nome`
  ).all();
  return c.json(results);
});

// Cria ou renomeia uma coleção.
colecoes.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; ordem?: number }>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id as string) || uid();
  const ordem = Math.trunc(Number(b.ordem) || 0);
  await c.env.DB.prepare(
    `INSERT INTO colecoes (id, nome, ordem) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem`
  ).bind(id, nome, ordem).run();
  return c.json({ id, nome, ordem });
});

colecoes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM colecoes WHERE id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM colecao_produtos WHERE colecao_id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

// Produtos de uma coleção (com dados do modelo e o nome do fio escolhido).
colecoes.get("/:id/produtos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT cp.modelo_nome, cp.fio_id, m.ref, m.parte, m.composicao, f.nome AS fio_nome
       FROM colecao_produtos cp
       LEFT JOIN modelos m ON m.nome = cp.modelo_nome
       LEFT JOIN tipos_fio f ON f.id = cp.fio_id
      WHERE cp.colecao_id = ? ORDER BY cp.modelo_nome`
  ).bind(c.req.param("id")).all();
  return c.json(results);
});

// Define os produtos da coleção (substitui o conjunto). Cada item: {modelo_nome, fio_id?}.
colecoes.post("/:id/produtos", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ produtos?: { modelo_nome?: string; fio_id?: string | null }[] }>().catch(() => ({}) as Record<string, unknown>);
  const itens = Array.isArray(b.produtos) ? b.produtos : [];
  const stmts = [c.env.DB.prepare("DELETE FROM colecao_produtos WHERE colecao_id = ?").bind(id)];
  const vistos = new Set<string>();
  for (const it of itens) {
    const nome = String(it.modelo_nome ?? "").trim();
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    const fio = String(it.fio_id ?? "").trim() || null;
    stmts.push(c.env.DB.prepare("INSERT INTO colecao_produtos (colecao_id, modelo_nome, fio_id) VALUES (?, ?, ?)").bind(id, nome, fio));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, total: vistos.size });
});
