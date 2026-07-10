import { Hono } from "hono";
import type { Env } from "../index";
import { DEFAULT_PARTE1, norm } from "../classificar";
import { colsBulk } from "./materiais";

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
    cores?: string[]; // cores do produto (nomes)
    tamanhos?: { tamanho?: string; peso?: number; tempo?: number }[]; // tamanhos + fio(kg)/peça + tempo
    materiais?: { tamanho?: string; material_id?: string; quantidade?: number; unidade?: string; obs?: string; status?: string; fonte?: string }[]; // ficha de consumo por tamanho
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
    // move as cores/tamanhos do nome antigo para o novo (não perde ao renomear)
    stmts.push(c.env.DB.prepare("UPDATE modelo_cores SET modelo_nome = ? WHERE modelo_nome = ?").bind(nome, de));
    stmts.push(c.env.DB.prepare("UPDATE modelo_tamanhos SET modelo_nome = ? WHERE modelo_nome = ?").bind(nome, de));
    stmts.push(c.env.DB.prepare("UPDATE modelo_materiais SET modelo_nome = ? WHERE modelo_nome = ?").bind(nome, de));
  }
  // Cores do produto (substitui o conjunto quando enviado).
  if (Array.isArray(b.cores)) {
    stmts.push(c.env.DB.prepare("DELETE FROM modelo_cores WHERE modelo_nome = ?").bind(nome));
    for (const cor of [...new Set(b.cores.map((x) => (x || "").trim()).filter(Boolean))])
      stmts.push(c.env.DB.prepare("INSERT INTO modelo_cores (modelo_nome, cor_nome) VALUES (?, ?)").bind(nome, cor));
  }
  // Tamanhos do produto + fio(kg)/peça + tempo (substitui o conjunto quando enviado).
  if (Array.isArray(b.tamanhos)) {
    stmts.push(c.env.DB.prepare("DELETE FROM modelo_tamanhos WHERE modelo_nome = ?").bind(nome));
    const vistos = new Set<string>();
    for (const t of b.tamanhos) {
      const tam = (t.tamanho || "").trim().toUpperCase();
      if (!tam || vistos.has(tam)) continue;
      vistos.add(tam);
      const peso = t.peso == null || isNaN(Number(t.peso)) ? null : Number(t.peso);
      const tempo = t.tempo == null || isNaN(Number(t.tempo)) ? null : Math.trunc(Number(t.tempo));
      stmts.push(c.env.DB.prepare("INSERT INTO modelo_tamanhos (modelo_nome, tamanho, peso, tempo) VALUES (?, ?, ?, ?)").bind(nome, tam, peso, tempo));
    }
  }
  // Materiais da ficha técnica POR TAMANHO (substitui o conjunto quando enviado).
  if (Array.isArray(b.materiais)) {
    stmts.push(c.env.DB.prepare("DELETE FROM modelo_materiais WHERE modelo_nome = ?").bind(nome));
    const vistos = new Set<string>();
    for (const mt of b.materiais) {
      const tam = (mt.tamanho || "").trim().toUpperCase();
      const mid = (mt.material_id || "").trim();
      if (!tam || !mid) continue;
      const chave = `${tam}::${mid}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const q = mt.quantidade == null || isNaN(Number(mt.quantidade)) ? null : Number(mt.quantidade);
      const un = (mt.unidade || "").trim() || null;
      const obs = (mt.obs || "").trim() || null;
      const status = String(mt.status || "ativo").trim() === "inativo" ? "inativo" : "ativo";
      const fonte = String(mt.fonte || "material").trim() === "fio" ? "fio" : "material";
      stmts.push(c.env.DB.prepare(
        "INSERT INTO modelo_materiais (modelo_nome, tamanho, material_id, quantidade, unidade, obs, status, fonte) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(nome, tam, mid, q, un, obs, status, fonte));
    }
  }
  await c.env.DB.batch(stmts);

  return c.json(
    { nome, parte, ref: b.ref || null, composicao: b.composicao || null, tassel_peseira: tp, tassel_almofada: ta },
    201
  );
});

// DETALHE do produto (modelo) com suas cores e seus tamanhos (fio/peça + tempo).
modelos.get("/:nome", async (c) => {
  const nome = decodeURIComponent(c.req.param("nome"));
  const m = await c.env.DB.prepare(
    "SELECT nome, parte, ref, composicao, tassel_peseira, tassel_almofada FROM modelos WHERE nome = ?"
  ).bind(nome).first();
  if (!m) return c.json({ error: "produto não encontrado" }, 404);
  const { results: cores } = await c.env.DB.prepare("SELECT cor_nome FROM modelo_cores WHERE modelo_nome = ?").bind(nome).all<{ cor_nome: string }>();
  const { results: tamanhos } = await c.env.DB.prepare("SELECT tamanho, peso, tempo FROM modelo_tamanhos WHERE modelo_nome = ?").bind(nome).all();
  const { results: materiais } = await c.env.DB.prepare(
    `SELECT mm.tamanho, mm.material_id, mm.quantidade, mm.obs, mm.status, mm.fonte,
            COALESCE(mm.unidade, m.unidade, CASE WHEN mm.fonte='fio' THEN 'kg' END) AS unidade,
            COALESCE(m.categoria, CASE WHEN mm.fonte='fio' THEN 'fio' END) AS categoria,
            COALESCE(m.nome, tf.nome) AS nome,
            m.cor, m.codigo, m.tamanho AS variacao, m.extra,
            COALESCE(m.preco, tf.preco) AS preco
       FROM modelo_materiais mm
       LEFT JOIN materiais  m  ON m.id  = mm.material_id AND mm.fonte <> 'fio'
       LEFT JOIN tipos_fio  tf ON tf.id = mm.material_id AND mm.fonte  = 'fio'
      WHERE mm.modelo_nome = ? ORDER BY categoria, mm.tamanho, nome`
  ).bind(nome).all();
  return c.json({ ...m, cores: cores.map((x) => x.cor_nome), tamanhos, materiais });
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
  const nome = decodeURIComponent(c.req.param("nome"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM modelos WHERE nome = ?").bind(nome),
    c.env.DB.prepare("DELETE FROM modelo_cores WHERE modelo_nome = ?").bind(nome),
    c.env.DB.prepare("DELETE FROM modelo_tamanhos WHERE modelo_nome = ?").bind(nome),
    c.env.DB.prepare("DELETE FROM modelo_materiais WHERE modelo_nome = ?").bind(nome),
  ]);
  return c.json({ ok: true });
});

// ── Cores (definem 100% Poliéster) ───────────────────────────────────────────
export const cores = new Hono<{ Bindings: Env }>();

cores.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.nome, c.hex, c.foto_key, c.codigo, c.fio_id,
            f.nome AS fio_nome, f.fornecedor_id, fo.nome AS fornecedor_nome
       FROM cores c
       LEFT JOIN tipos_fio f ON f.id = c.fio_id
       LEFT JOIN fornecedores fo ON fo.id = f.fornecedor_id
      ORDER BY c.nome`
  ).all();
  return c.json(results);
});

cores.post("/", async (c) => {
  const b = await c.req.json<{ nome?: string; de?: string; hex?: string; codigo?: string; fio_id?: string }>();
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const de = (b.de || "").trim();
  // valida hex (#RGB ou #RRGGBB); vazio = mantém o que já tinha
  const hexRaw = (b.hex || "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexRaw) ? hexRaw : null;
  const codigo = (b.codigo || "").trim() || null;
  const fioId = (b.fio_id || "").trim() || null;
  await c.env.DB.prepare(
    `INSERT INTO cores (nome, hex, codigo, fio_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET
       hex = COALESCE(excluded.hex, cores.hex), codigo = excluded.codigo, fio_id = excluded.fio_id`
  )
    .bind(nome, hex, codigo, fioId)
    .run();
  if (de && de !== nome) await c.env.DB.prepare("DELETE FROM cores WHERE nome = ?").bind(de).run();
  return c.json({ nome, hex, codigo, fio_id: fioId }, 201);
});

// ATRIBUIR várias cores a um tipo de fio de uma vez (fio_id vazio = tira do fio).
cores.post("/atribuir-fio", async (c) => {
  const b = await c.req.json<{ fio_id?: string; cores?: string[] }>().catch(() => ({}) as Record<string, unknown>);
  const fioId = String(b.fio_id ?? "").trim() || null;
  const nomes = (Array.isArray(b.cores) ? b.cores : []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!nomes.length) return c.json({ error: "selecione ao menos uma cor" }, 400);
  const ph = nomes.map(() => "?").join(",");
  await c.env.DB.prepare(`UPDATE cores SET fio_id = ? WHERE nome IN (${ph})`).bind(fioId, ...nomes).run();
  return c.json({ ok: true, atualizadas: nomes.length });
});

// COLAR/DIGITAR VÁRIAS cores de uma vez. Cada linha vira uma cor; se tiver
// separador (tab da planilha, ; ou ,) a 2ª parte é o código. Todas entram no
// tipo de fio informado (fio_id). Nome que já existe só atualiza código/fio.
cores.post("/bulk", async (c) => {
  const b = await c.req.json<{ texto?: string; fio_id?: string }>().catch(() => ({}) as Record<string, unknown>);
  const fioId = String(b.fio_id ?? "").trim() || null;
  const linhas = String(b.texto || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: { nome: string; codigo: string | null }[] = [];
  const vistos = new Set<string>();
  for (const linha of linhas) {
    const partes = linha.split(/[\t;,]/).map((s) => s.trim()).filter(Boolean);
    const nome = partes[0] || "";
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    parsed.push({ nome, codigo: partes[1] || null });
  }
  if (!parsed.length) return c.json({ error: "nenhuma cor reconhecida", exemplo: "ROMENIA 1075 / uma por linha" }, 400);

  const nomes = parsed.map((p) => p.nome);
  const ph = nomes.map(() => "?").join(",");
  const { results: exist } = await c.env.DB.prepare(`SELECT nome FROM cores WHERE nome IN (${ph})`).bind(...nomes).all<{ nome: string }>();
  const jaTinha = new Set(exist.map((x) => x.nome));

  const stmts = parsed.map((p) =>
    c.env.DB.prepare(
      `INSERT INTO cores (nome, codigo, fio_id) VALUES (?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET codigo = COALESCE(excluded.codigo, cores.codigo), fio_id = excluded.fio_id`
    ).bind(p.nome, p.codigo, fioId)
  );
  await c.env.DB.batch(stmts);
  const criados = parsed.filter((p) => !jaTinha.has(p.nome)).length;
  return c.json({ total: parsed.length, criados, ignorados: parsed.length - criados, cores: nomes }, 201);
});

// ── Tipos de fio (nome + fornecedor, para ordem de compras) ───────────────────
export const tiposFio = new Hono<{ Bindings: Env }>();

tiposFio.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.nome, t.cor, t.preco, t.fornecedor_id, f.nome AS fornecedor_nome
       FROM tipos_fio t LEFT JOIN fornecedores f ON f.id = t.fornecedor_id
      ORDER BY t.nome`
  ).all();
  return c.json(results);
});

tiposFio.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; fornecedor_id?: string; cor?: string; preco?: number }>().catch(() => ({}) as Record<string, string>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = b.id || crypto.randomUUID();
  const forn = String(b.fornecedor_id ?? "").trim() || null;
  const corRaw = String(b.cor ?? "").trim();
  const cor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(corRaw) ? corRaw : null;
  const preco = b.preco == null || isNaN(Number(b.preco)) ? null : Number(b.preco);
  await c.env.DB.prepare(
    `INSERT INTO tipos_fio (id, nome, fornecedor_id, cor, preco) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, fornecedor_id = excluded.fornecedor_id,
       cor = COALESCE(excluded.cor, tipos_fio.cor), preco = excluded.preco`
  ).bind(id, nome, forn, cor, preco).run();
  return c.json({ id, nome, fornecedor_id: forn, cor, preco });
});

tiposFio.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tipos_fio WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// COLAR EM MASSA: uma linha = um tipo de fio. Colunas por Tab/;/, na ordem
// nome · cor (hex) · preço. Só o nome é obrigatório. Nome repetido é ignorado.
tiposFio.post("/bulk", async (c) => {
  const b = await c.req.json<{ texto?: string }>().catch(() => ({}) as Record<string, unknown>);
  const linhas = String(b.texto || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: { nome: string; cor: string | null; preco: number | null }[] = [];
  const vistos = new Set<string>();
  let total = 0;
  for (const linha of linhas) {
    const p = colsBulk(linha);
    const nome = p[0] || "";
    if (!nome) continue;
    total++;
    if (vistos.has(nome.toLowerCase())) continue;
    vistos.add(nome.toLowerCase());
    const corRaw = p[1] || "";
    const cor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(corRaw) ? corRaw : null;
    const precoN = Number((p[2] || "").replace(",", "."));
    parsed.push({ nome, cor, preco: isNaN(precoN) || !p[2] ? null : precoN });
  }
  if (!total) return c.json({ error: "nenhum tipo de fio reconhecido", exemplo: "Polisoft;#7c3aed;28,50" }, 400);

  const { results: exist } = await c.env.DB.prepare("SELECT nome FROM tipos_fio").all<{ nome: string }>();
  const jaTinha = new Set(exist.map((x) => x.nome.toLowerCase()));
  const novos = parsed.filter((p) => !jaTinha.has(p.nome.toLowerCase())).map((p) => ({ ...p, id: crypto.randomUUID() }));
  const stmts = novos.map((p) =>
    c.env.DB.prepare("INSERT INTO tipos_fio (id, nome, cor, preco) VALUES (?, ?, ?, ?)").bind(p.id, p.nome, p.cor, p.preco)
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ total, criados: novos.length, ignorados: total - novos.length, ids: novos.map((p) => p.id) }, 201);
});

// ── Tamanhos (cada modelo tem vários) ─────────────────────────────────────────
export const tamanhos = new Hono<{ Bindings: Env }>();

tamanhos.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, nome, ordem FROM tamanhos ORDER BY ordem, nome").all();
  return c.json(results);
});

tamanhos.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; ordem?: number }>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome || "").trim().toUpperCase();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id as string) || crypto.randomUUID();
  const ordem = Math.trunc(Number(b.ordem) || 0);
  await c.env.DB.prepare(
    `INSERT INTO tamanhos (id, nome, ordem) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem`
  ).bind(id, nome, ordem).run();
  return c.json({ id, nome, ordem });
});

tamanhos.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tamanhos WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Normaliza um tamanho "AxB" (aceita x/X/*, vírgula ou ponto, espaços) → "50X50".
export function normalizarTamanho(raw: string): string | null {
  const m = String(raw || "").match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const fmt = (s: string) => s.replace(",", "."); // mantém a notação (1.20, 0.90)
  return `${fmt(m[1])}X${fmt(m[2])}`.toUpperCase();
}
// Área em cm² (detecta metro: valor < 10 → ×100) para ordenar do menor pro maior.
export function areaTamanho(nome: string): number {
  const m = String(nome || "").match(/([\d.]+)\s*X\s*([\d.]+)/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const cm = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n < 10 ? n * 100 : n; };
  return cm(m[1]) * cm(m[2]);
}

// COLAR/DIGITAR VÁRIOS: extrai os tamanhos de um texto solto, normaliza, junta
// com os já cadastrados, ordena por tamanho real e reatribui a ordem.
tamanhos.post("/bulk", async (c) => {
  const b = await c.req.json<{ texto?: string; nomes?: string[] }>().catch(() => ({}) as Record<string, unknown>);
  const brutos = Array.isArray(b.nomes) ? b.nomes : (String(b.texto || "").match(/\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?/gi) || []);
  const novos = [...new Set(brutos.map((x) => normalizarTamanho(String(x))).filter((x): x is string => !!x))];
  if (!novos.length) return c.json({ error: "nenhum tamanho reconhecido", exemplo: "50x50, 90x200, 1.20x1.80" }, 400);

  const { results: exist } = await c.env.DB.prepare("SELECT id, nome FROM tamanhos").all<{ id: string; nome: string }>();
  const idPorNome = new Map(exist.map((t) => [t.nome, t.id]));
  const todos = [...new Set([...exist.map((t) => t.nome), ...novos])].sort((a, b2) => areaTamanho(a) - areaTamanho(b2));
  const stmts = todos.map((nome, i) =>
    c.env.DB.prepare(
      "INSERT INTO tamanhos (id, nome, ordem) VALUES (?, ?, ?) ON CONFLICT(nome) DO UPDATE SET ordem = excluded.ordem"
    ).bind(idPorNome.get(nome) || crypto.randomUUID(), nome, i + 1)
  );
  await c.env.DB.batch(stmts);
  const criados = novos.filter((n) => !idPorNome.has(n)).length;
  return c.json({ total: todos.length, criados, ignorados: novos.length - criados, ordenados: todos });
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

// COLAR EM MASSA: uma linha = um operador. Colunas por Tab/;/, na ordem
// nome · senha · setor. Nome e senha são obrigatórios (linhas sem os dois são
// ignoradas). Nome repetido faz upsert da senha/setor.
operadores.post("/bulk", async (c) => {
  const b = await c.req.json<{ texto?: string }>().catch(() => ({}) as Record<string, unknown>);
  const linhas = String(b.texto || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: { nome: string; senha: string; setor: string | null }[] = [];
  const vistos = new Set<string>();
  let semSenha = 0, total = 0;
  for (const linha of linhas) {
    const p = colsBulk(linha);
    const nome = p[0] || "", senha = p[1] || "";
    if (!nome) continue;
    total++;
    if (!senha) { semSenha++; continue; }
    if (vistos.has(nome.toLowerCase())) continue;
    vistos.add(nome.toLowerCase());
    parsed.push({ nome, senha, setor: p[2] || null });
  }
  if (!parsed.length) return c.json({ error: "nenhum operador válido (nome e senha por linha)", exemplo: "Maria;1234;costura" }, 400);

  const { results: exist } = await c.env.DB.prepare("SELECT nome FROM operadores").all<{ nome: string }>();
  const jaTinha = new Set(exist.map((x) => x.nome.toLowerCase()));
  // Novos = INSERT (podem ser desfeitos); existentes = UPDATE (edição, sem undo).
  const novos = parsed.filter((p) => !jaTinha.has(p.nome.toLowerCase())).map((p) => ({ ...p, id: crypto.randomUUID() }));
  const editar = parsed.filter((p) => jaTinha.has(p.nome.toLowerCase()));
  const stmts = [
    ...novos.map((p) => c.env.DB.prepare("INSERT INTO operadores (id, nome, senha, setor) VALUES (?, ?, ?, ?)").bind(p.id, p.nome, p.senha, p.setor)),
    ...editar.map((p) => c.env.DB.prepare("UPDATE operadores SET senha = ?, setor = ? WHERE nome = ?").bind(p.senha, p.setor, p.nome)),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ total, criados: novos.length, ignorados: total - novos.length, sem_senha: semSenha, ids: novos.map((p) => p.id) }, 201);
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
