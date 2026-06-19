import { Hono } from "hono";
import type { Env } from "../index";

export const clientes = new Hono<{ Bindings: Env }>();

// Lista de clientes (para autocompletar no formulário)
clientes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome FROM clientes ORDER BY nome"
  ).all();
  return c.json(results);
});

// Cria cliente (idempotente por nome)
clientes.post("/", async (c) => {
  const body = await c.req.json<{ nome?: string }>();
  const nome = (body.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO clientes (id, nome) VALUES (?, ?) ON CONFLICT(nome) DO NOTHING"
  )
    .bind(id, nome)
    .run();
  const row = await c.env.DB.prepare("SELECT id, nome FROM clientes WHERE nome = ?")
    .bind(nome)
    .first();
  return c.json(row, 201);
});
