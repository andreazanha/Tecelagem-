import { Hono } from "hono";
import type { Env } from "../index";

// ── Modelos (definem Parte 1 / Parte 2) ──────────────────────────────────────
export const modelos = new Hono<{ Bindings: Env }>();

modelos.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT nome, parte, ref FROM modelos ORDER BY parte, nome"
  ).all();
  return c.json(results);
});

modelos.post("/", async (c) => {
  const b = await c.req.json<{ nome?: string; parte?: number; ref?: string }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const parte = b.parte === 1 ? 1 : 2;
  await c.env.DB.prepare(
    `INSERT INTO modelos (nome, parte, ref) VALUES (?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET parte = excluded.parte, ref = excluded.ref`
  )
    .bind(nome, parte, b.ref || null)
    .run();
  return c.json({ nome, parte, ref: b.ref || null }, 201);
});

modelos.delete("/:nome", async (c) => {
  await c.env.DB.prepare("DELETE FROM modelos WHERE nome = ?")
    .bind(decodeURIComponent(c.req.param("nome")))
    .run();
  return c.json({ ok: true });
});

// ── Cores (definem 100% Poliéster) ───────────────────────────────────────────
export const cores = new Hono<{ Bindings: Env }>();

cores.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT nome, poliester FROM cores ORDER BY nome"
  ).all();
  return c.json(results);
});

cores.post("/", async (c) => {
  const b = await c.req.json<{ nome?: string; poliester?: boolean | number }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const poliester = b.poliester ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO cores (nome, poliester) VALUES (?, ?)
     ON CONFLICT(nome) DO UPDATE SET poliester = excluded.poliester`
  )
    .bind(nome, poliester)
    .run();
  return c.json({ nome, poliester }, 201);
});

cores.delete("/:nome", async (c) => {
  await c.env.DB.prepare("DELETE FROM cores WHERE nome = ?")
    .bind(decodeURIComponent(c.req.param("nome")))
    .run();
  return c.json({ ok: true });
});
