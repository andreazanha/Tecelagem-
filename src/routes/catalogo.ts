import { Hono } from "hono";
import type { Env } from "../index";
import { DEFAULT_PARTE1, norm } from "../classificar";

const BASE_P1 = new Set(DEFAULT_PARTE1.map((n) => norm(n)));

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

// IMPORTAÇÃO em lote (nome + código). Cria os modelos que faltam e atualiza o código dos
// existentes SEM mexer em parte/composição já cadastradas. Modelos novos que estejam na lista
// base da Parte 1 nascem como Parte 1; os demais como Parte 2.
modelos.post("/bulk", async (c) => {
  const b = await c.req
    .json<{ itens?: { nome?: string; ref?: string }[] }>()
    .catch(() => ({}) as { itens?: { nome?: string; ref?: string }[] });
  const itens = (b.itens || [])
    .map((i) => ({ nome: (i.nome || "").trim(), ref: (i.ref || "").trim() }))
    .filter((i) => i.nome);
  if (itens.length === 0) return c.json({ error: "nenhum modelo válido na lista" }, 400);

  const stmts = itens.map((i) =>
    c.env.DB.prepare(
      `INSERT INTO modelos (nome, parte, ref)
       VALUES (?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET ref = excluded.ref`
    ).bind(i.nome, BASE_P1.has(norm(i.nome)) ? 1 : 2, i.ref || null)
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, total: itens.length }, 201);
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
    "SELECT nome, hex FROM cores ORDER BY nome"
  ).all();
  return c.json(results);
});

cores.post("/", async (c) => {
  const b = await c.req.json<{ nome?: string; hex?: string }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  // valida hex (#RGB ou #RRGGBB); vazio = sem cor definida
  const hexRaw = (b.hex || "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexRaw) ? hexRaw : null;
  await c.env.DB.prepare(
    `INSERT INTO cores (nome, hex) VALUES (?, ?)
     ON CONFLICT(nome) DO UPDATE SET hex = excluded.hex`
  )
    .bind(nome, hex)
    .run();
  return c.json({ nome, hex }, 201);
});

cores.delete("/:nome", async (c) => {
  await c.env.DB.prepare("DELETE FROM cores WHERE nome = ?")
    .bind(decodeURIComponent(c.req.param("nome")))
    .run();
  return c.json({ ok: true });
});
