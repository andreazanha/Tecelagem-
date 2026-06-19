import { Hono } from "hono";
import type { Env } from "../index";

// ── Modelos (definem Parte 1 / Parte 2) ──────────────────────────────────────
export const modelos = new Hono<{ Bindings: Env }>();

modelos.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT nome, parte, ref, composicao, tassel_peseira, tassel_almofada FROM modelos ORDER BY nome"
  ).all();
  return c.json(results);
});

modelos.post("/", async (c) => {
  const b = await c.req.json<{
    nome?: string;
    de?: string; // nome anterior (quando renomeia um modelo já cadastrado)
    parte?: number;
    ref?: string;
    composicao?: string;
    tassel_peseira?: number;
    tassel_almofada?: number;
  }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const de = (b.de || "").trim();
  const parte = b.parte === 1 ? 1 : 2;
  const tp = Math.max(0, Math.trunc(Number(b.tassel_peseira) || 0));
  const ta = Math.max(0, Math.trunc(Number(b.tassel_almofada) || 0));

  // renomeação: o nome é a chave primária; se mudou, não pode colidir com outro
  if (de && de !== nome) {
    const existe = await c.env.DB.prepare("SELECT nome FROM modelos WHERE nome = ?")
      .bind(nome)
      .first();
    if (existe) return c.json({ error: `Já existe um modelo chamado "${nome}".` }, 409);
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO modelos (nome, parte, ref, composicao, tassel_peseira, tassel_almofada)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET
         parte = excluded.parte, ref = excluded.ref, composicao = excluded.composicao,
         tassel_peseira = excluded.tassel_peseira, tassel_almofada = excluded.tassel_almofada`
    ).bind(nome, parte, b.ref || null, b.composicao || null, tp, ta),
  ];
  if (de && de !== nome) {
    stmts.push(c.env.DB.prepare("DELETE FROM modelos WHERE nome = ?").bind(de));
  }
  await c.env.DB.batch(stmts);

  return c.json(
    { nome, parte, ref: b.ref || null, composicao: b.composicao || null, tassel_peseira: tp, tassel_almofada: ta },
    201
  );
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
