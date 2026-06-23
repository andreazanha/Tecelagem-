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
    "SELECT nome, hex, foto_key FROM cores ORDER BY nome"
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

// FOTO da cor (amostra real) — sobe no R2 e cria a cor se ainda não existir.
cores.post("/:nome/foto", async (c) => {
  const nome = decodeURIComponent(c.req.param("nome")).trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);
  const key = `cores/${nome}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });
  await c.env.DB.prepare(
    `INSERT INTO cores (nome, foto_key) VALUES (?, ?)
     ON CONFLICT(nome) DO UPDATE SET foto_key = excluded.foto_key`
  )
    .bind(nome, key)
    .run();
  return c.json({ ok: true, foto_key: key });
});

cores.get("/:nome/foto", async (c) => {
  const nome = decodeURIComponent(c.req.param("nome")).trim();
  const obj = await c.env.BUCKET.get(`cores/${nome}`);
  if (!obj) return c.json({ error: "sem foto" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/png",
      "Cache-Control": "no-cache",
    },
  });
});

cores.delete("/:nome/foto", async (c) => {
  const nome = decodeURIComponent(c.req.param("nome")).trim();
  await c.env.BUCKET.delete(`cores/${nome}`);
  await c.env.DB.prepare("UPDATE cores SET foto_key = NULL WHERE nome = ?").bind(nome).run();
  return c.json({ ok: true });
});

// ── Tasseis (cor + tamanho + valor da mão de obra) ───────────────────────────
export const tasseis = new Hono<{ Bindings: Env }>();

tasseis.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT cor, tamanho, valor FROM tasseis ORDER BY cor, tamanho"
  ).all();
  return c.json(results);
});

tasseis.post("/", async (c) => {
  const b = await c.req.json<{ cor?: string; tamanho?: string; valor?: number | string }>();
  const cor = (b.cor || "").trim();
  const tamanho = (b.tamanho || "").trim().toUpperCase();
  if (!cor || !tamanho) return c.json({ error: "cor e tamanho são obrigatórios" }, 400);
  const valor = Math.max(0, Number(b.valor) || 0);
  await c.env.DB.prepare(
    `INSERT INTO tasseis (cor, tamanho, valor) VALUES (?, ?, ?)
     ON CONFLICT(cor, tamanho) DO UPDATE SET valor = excluded.valor`
  )
    .bind(cor, tamanho, valor)
    .run();
  return c.json({ cor, tamanho, valor }, 201);
});

tasseis.delete("/:cor/:tamanho", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasseis WHERE cor = ? AND tamanho = ?")
    .bind(decodeURIComponent(c.req.param("cor")), decodeURIComponent(c.req.param("tamanho")).toUpperCase())
    .run();
  return c.json({ ok: true });
});

// ── Prestadores de serviço ───────────────────────────────────────────────────
export const prestadores = new Hono<{ Bindings: Env }>();

prestadores.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, telefone, servico, obs, pix, cidade FROM prestadores ORDER BY nome"
  ).all();
  return c.json(results);
});

prestadores.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; telefone?: string; servico?: string; obs?: string; pix?: string; cidade?: string }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = b.id || crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO prestadores (id, nome, telefone, servico, obs, pix, cidade) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET telefone = excluded.telefone, servico = excluded.servico, obs = excluded.obs,
       pix = excluded.pix, cidade = excluded.cidade`
  )
    .bind(id, nome, b.telefone || null, b.servico || null, b.obs || null, (b.pix || "").trim() || null, (b.cidade || "").trim() || null)
    .run();
  return c.json({ id, nome, telefone: b.telefone || null, servico: b.servico || null, obs: b.obs || null, pix: b.pix || null, cidade: b.cidade || null }, 201);
});

prestadores.delete("/:nome", async (c) => {
  await c.env.DB.prepare("DELETE FROM prestadores WHERE nome = ?")
    .bind(decodeURIComponent(c.req.param("nome")))
    .run();
  return c.json({ ok: true });
});

// ── Cadastro de Costura (serviço + valor) ────────────────────────────────────
export const costura = new Hono<{ Bindings: Env }>();

costura.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT nome, valor, agrupamento FROM costura ORDER BY nome").all();
  return c.json(results);
});

costura.post("/", async (c) => {
  const b = await c.req.json<{ nome?: string; valor?: number | string; agrupamento?: string }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const valor = Math.max(0, Number(b.valor) || 0);
  const ag = ["peseira_manta", "almofada_capa", "todas"].includes(b.agrupamento || "") ? b.agrupamento! : "todas";
  await c.env.DB.prepare(
    `INSERT INTO costura (nome, valor, agrupamento) VALUES (?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor, agrupamento = excluded.agrupamento`
  )
    .bind(nome, valor, ag)
    .run();
  return c.json({ nome, valor, agrupamento: ag }, 201);
});

costura.delete("/:nome", async (c) => {
  await c.env.DB.prepare("DELETE FROM costura WHERE nome = ?")
    .bind(decodeURIComponent(c.req.param("nome")))
    .run();
  return c.json({ ok: true });
});

// ── Operadores (lista pré-salva + senha) ──────────────────────────────────────
export const operadores = new Hono<{ Bindings: Env }>();

operadores.get("/", async (c) => {
  const setor = c.req.query("setor");
  // Nunca expõe a senha na listagem.
  let sql = "SELECT id, nome, setor FROM operadores";
  const binds: string[] = [];
  if (setor) {
    sql += " WHERE setor IS NULL OR setor = ?";
    binds.push(setor);
  }
  sql += " ORDER BY nome";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

operadores.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; senha?: string; setor?: string }>();
  const nome = (b.nome || "").trim();
  const senha = (b.senha || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  if (!senha) return c.json({ error: "senha é obrigatória" }, 400);
  const id = b.id || crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO operadores (id, nome, senha, setor) VALUES (?, ?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET senha = excluded.senha, setor = excluded.setor`
  )
    .bind(id, nome, senha, b.setor || null)
    .run();
  return c.json({ id, nome, setor: b.setor || null }, 201);
});

operadores.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM operadores WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Usuários (login + permissões de telas) ────────────────────────────────────
export const usuarios = new Hono<{ Bindings: Env }>();

usuarios.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, usuario, admin, paginas FROM usuarios ORDER BY nome"
  ).all<{ id: string; nome: string; usuario: string; admin: number; paginas: string }>();
  return c.json(
    results.map((u) => ({ id: u.id, nome: u.nome, usuario: u.usuario, admin: !!u.admin, paginas: JSON.parse(u.paginas || "[]") }))
  );
});

usuarios.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; usuario?: string; senha?: string; admin?: boolean; paginas?: string[] }>();
  const nome = (b.nome || "").trim();
  const usuario = (b.usuario || "").trim().toLowerCase();
  if (!nome || !usuario) return c.json({ error: "nome e usuário são obrigatórios" }, 400);
  const ex = await c.env.DB.prepare("SELECT id, senha FROM usuarios WHERE usuario = ?")
    .bind(usuario)
    .first<{ id: string; senha: string }>();
  const senha = b.senha && b.senha.trim() ? b.senha.trim() : ex?.senha || "";
  if (!senha) return c.json({ error: "senha é obrigatória" }, 400);
  const id = ex?.id || b.id || crypto.randomUUID();
  const paginas = JSON.stringify(Array.isArray(b.paginas) ? b.paginas : []);
  const admin = b.admin ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO usuarios (id, nome, usuario, senha, admin, paginas) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario) DO UPDATE SET nome = excluded.nome, senha = excluded.senha, admin = excluded.admin, paginas = excluded.paginas`
  )
    .bind(id, nome, usuario, senha, admin, paginas)
    .run();
  return c.json({ id, nome, usuario, admin: !!admin, paginas: JSON.parse(paginas) }, 201);
});

usuarios.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM usuarios WHERE id = ? AND usuario <> 'admin'").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

usuarios.post("/login", async (c) => {
  const b = await c.req.json<{ usuario?: string; senha?: string }>().catch(() => ({}) as { usuario?: string; senha?: string });
  const usuario = (b.usuario || "").trim().toLowerCase();
  const row = await c.env.DB.prepare("SELECT id, nome, usuario, senha, admin, paginas FROM usuarios WHERE usuario = ?")
    .bind(usuario)
    .first<{ id: string; nome: string; usuario: string; senha: string; admin: number; paginas: string }>();
  if (!row || row.senha !== (b.senha || "")) return c.json({ ok: false }, 401);
  return c.json({
    ok: true,
    user: { id: row.id, nome: row.nome, usuario: row.usuario, admin: !!row.admin, paginas: JSON.parse(row.paginas || "[]") },
  });
});

// Valida a senha do operador selecionado (usado ao iniciar produção).
operadores.post("/validar", async (c) => {
  const b = await c.req.json<{ id?: string; senha?: string }>();
  const row = await c.env.DB.prepare("SELECT nome, senha FROM operadores WHERE id = ?")
    .bind(b.id || "")
    .first<{ nome: string; senha: string }>();
  if (!row || row.senha !== (b.senha || "")) return c.json({ ok: false }, 401);
  return c.json({ ok: true, nome: row.nome });
});
