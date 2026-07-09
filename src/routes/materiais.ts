// Cadastro de MATERIAIS (insumos da ficha técnica): forro, zíper, etiqueta,
// encarte, embalagem, refil. Tamanho em texto livre; zíper tem cor + código.
import { Hono } from "hono";
import type { Env } from "../index";

export const materiais = new Hono<{ Bindings: Env }>();

export const MAT_CATEGORIAS = ["forro", "ziper", "etiqueta", "encarte", "embalagem", "refil"] as const;
const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;

materiais.get("/", async (c) => {
  const cat = (c.req.query("categoria") || "").toLowerCase();
  let sql = "SELECT m.*, f.nome AS fornecedor_nome FROM materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id";
  const binds: unknown[] = [];
  if ((MAT_CATEGORIAS as readonly string[]).includes(cat)) { sql += " WHERE m.categoria = ?"; binds.push(cat); }
  sql += " ORDER BY m.categoria, m.nome, m.tamanho";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

materiais.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const categoria = String(b.categoria ?? "").trim().toLowerCase();
  if (!(MAT_CATEGORIAS as readonly string[]).includes(categoria)) return c.json({ error: "categoria inválida" }, 400);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id as string) || uid();
  const hexRaw = String(b.cor_hex ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexRaw) ? hexRaw : null;
  await c.env.DB.prepare(
    `INSERT INTO materiais (id, categoria, nome, tamanho, fornecedor_id, cor, cor_hex, codigo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET categoria=excluded.categoria, nome=excluded.nome, tamanho=excluded.tamanho,
       fornecedor_id=excluded.fornecedor_id, cor=excluded.cor, cor_hex=excluded.cor_hex, codigo=excluded.codigo`
  ).bind(id, categoria, nome, str(b.tamanho), str(b.fornecedor_id), str(b.cor), hex, str(b.codigo)).run();
  return c.json({ id });
});

materiais.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM materiais WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
