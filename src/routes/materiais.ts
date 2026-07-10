// Cadastro de MATERIAIS (insumos da ficha técnica) com CONTROLE DE ESTOQUE.
// Categorias são CADASTRÁVEIS (material_categorias): os 6 padrão (forro, zíper,
// etiqueta, encarte, embalagem, refil) já vêm semeados e o usuário cria novos.
// Cada material tem saldo/mínimo/preço → base pras COMPRAS (saldo < mínimo).
import { Hono } from "hono";
import type { Env } from "../index";

export const materiais = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;
const num = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Number(v));
// Colar em massa: separa as colunas de UMA linha. "Fareja" o separador (Tab tem
// prioridade, depois ";", só então ","), para NÃO quebrar preços com vírgula
// decimal (ex.: "1,50") quando a linha usa ";" ou Tab entre as colunas.
export const colsBulk = (linha: string): string[] =>
  (linha.includes("\t") ? linha.split("\t") : linha.includes(";") ? linha.split(";") : linha.split(","))
    .map((s) => s.trim());
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

async function slugsValidos(env: Env): Promise<Set<string>> {
  const { results } = await env.DB.prepare("SELECT slug FROM material_categorias").all<{ slug: string }>();
  return new Set(results.map((r) => r.slug));
}

// ── Categorias de material (dinâmicas) ────────────────────────────────────────
materiais.get("/categorias", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT mc.id, mc.slug, mc.nome, mc.cor, mc.icone, mc.ordem,
            (SELECT COUNT(*) FROM materiais m WHERE m.categoria = mc.slug) AS itens
       FROM material_categorias mc ORDER BY mc.ordem, mc.nome`
  ).all();
  return c.json(results);
});

materiais.post("/categorias", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id as string) || uid();
  const slug = String(b.slug ?? "").trim() || slugify(nome);
  if (!slug) return c.json({ error: "nome inválido" }, 400);
  const corRaw = String(b.cor ?? "").trim();
  const cor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(corRaw) ? corRaw : null;
  const ordem = Math.trunc(Number(b.ordem) || 0);
  // slug é único: se colidir com outra categoria (nome novo), erro amigável.
  if (!b.id) {
    const existe = await c.env.DB.prepare("SELECT id FROM material_categorias WHERE slug = ?").bind(slug).first();
    if (existe) return c.json({ error: `Já existe um insumo "${nome}".` }, 409);
  }
  await c.env.DB.prepare(
    `INSERT INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, cor=excluded.cor, icone=excluded.icone, ordem=excluded.ordem`
  ).bind(id, slug, nome, cor, str(b.icone), ordem).run();
  return c.json({ id, slug, nome, cor, icone: str(b.icone), ordem });
});

materiais.delete("/categorias/:id", async (c) => {
  const cat = await c.env.DB.prepare("SELECT slug FROM material_categorias WHERE id = ?").bind(c.req.param("id")).first<{ slug: string }>();
  if (!cat) return c.json({ ok: true });
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM materiais WHERE categoria = ?").bind(cat.slug).first<{ n: number }>();
  if ((n?.n || 0) > 0) return c.json({ error: "Há materiais nesse insumo. Remova-os antes de excluir a categoria." }, 409);
  await c.env.DB.prepare("DELETE FROM material_categorias WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Sugestão de COMPRAS: materiais com saldo abaixo do mínimo, por fornecedor ──
materiais.get("/compras", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.categoria, m.nome, m.tamanho, m.cor, m.codigo, m.unidade,
            m.saldo, m.minimo, m.preco, m.fornecedor_id,
            f.nome AS fornecedor_nome,
            (m.minimo - m.saldo) AS faltam
       FROM materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
      WHERE m.minimo > 0 AND m.saldo < m.minimo
      ORDER BY f.nome IS NULL, f.nome, m.categoria, m.nome`
  ).all();
  return c.json(results);
});

// ── Materiais ─────────────────────────────────────────────────────────────────
materiais.get("/", async (c) => {
  const cat = (c.req.query("categoria") || "").toLowerCase();
  let sql = "SELECT m.*, f.nome AS fornecedor_nome FROM materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id";
  const binds: unknown[] = [];
  if (cat) { sql += " WHERE m.categoria = ?"; binds.push(cat); }
  sql += " ORDER BY m.categoria, m.nome, m.tamanho";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

materiais.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const categoria = String(b.categoria ?? "").trim().toLowerCase();
  if (!(await slugsValidos(c.env)).has(categoria)) return c.json({ error: "categoria inválida" }, 400);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id as string) || uid();
  const hexRaw = String(b.cor_hex ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexRaw) ? hexRaw : null;
  const status = String(b.status ?? "ativo").trim() === "inativo" ? "inativo" : "ativo";
  // extra: campos específicos do tipo (JSON). Aceita objeto ou string já serializada.
  let extra: string | null = null;
  if (b.extra != null) {
    try { extra = typeof b.extra === "string" ? (b.extra.trim() || null) : JSON.stringify(b.extra); }
    catch { extra = null; }
  }
  await c.env.DB.prepare(
    `INSERT INTO materiais (id, categoria, nome, tamanho, fornecedor_id, cor, cor_hex, codigo, unidade, preco, minimo,
       codigo_interno, status, obs, extra, saldo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT saldo FROM materiais WHERE id = ?), 0))
     ON CONFLICT(id) DO UPDATE SET categoria=excluded.categoria, nome=excluded.nome, tamanho=excluded.tamanho,
       fornecedor_id=excluded.fornecedor_id, cor=excluded.cor, cor_hex=excluded.cor_hex, codigo=excluded.codigo,
       unidade=excluded.unidade, preco=excluded.preco, minimo=excluded.minimo,
       codigo_interno=excluded.codigo_interno, status=excluded.status, obs=excluded.obs, extra=excluded.extra`
  ).bind(id, categoria, nome, str(b.tamanho), str(b.fornecedor_id), str(b.cor), hex, str(b.codigo),
         str(b.unidade), num(b.preco), num(b.minimo) ?? 0, str(b.codigo_interno), status, str(b.obs), extra, id).run();
  return c.json({ id });
});

// ── Mapa de refil: medida do produto → medida do refil (base da ficha) ─────────
materiais.get("/refil-mapa", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT medida_produto, medida_refil FROM refil_mapa ORDER BY medida_produto"
  ).all();
  return c.json(results);
});

materiais.post("/refil-mapa", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const medida = String(b.medida_produto ?? "").trim();
  if (!medida) return c.json({ error: "medida_produto é obrigatória" }, 400);
  const refil = str(b.medida_refil); // NULL = sem refil
  await c.env.DB.prepare(
    `INSERT INTO refil_mapa (medida_produto, medida_refil) VALUES (?, ?)
     ON CONFLICT(medida_produto) DO UPDATE SET medida_refil = excluded.medida_refil`
  ).bind(medida, refil).run();
  return c.json({ medida_produto: medida, medida_refil: refil });
});

materiais.delete("/refil-mapa/:medida", async (c) => {
  await c.env.DB.prepare("DELETE FROM refil_mapa WHERE medida_produto = ?").bind(c.req.param("medida")).run();
  return c.json({ ok: true });
});

// COLAR EM MASSA: uma linha = um material. Colunas por Tab/;/, na ordem
// nome · tamanho · unidade · preço · estoque mínimo. Só o nome é obrigatório.
materiais.post("/bulk", async (c) => {
  const b = await c.req.json<{ categoria?: string; texto?: string }>().catch(() => ({}) as Record<string, unknown>);
  const categoria = String(b.categoria ?? "").trim().toLowerCase();
  if (!(await slugsValidos(c.env)).has(categoria)) return c.json({ error: "categoria inválida" }, 400);
  const linhas = String(b.texto || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: { nome: string; tamanho: string | null; unidade: string | null; preco: number | null; minimo: number }[] = [];
  const vistos = new Set<string>();
  let total = 0; // linhas com nome (base para "ignorados")
  for (const linha of linhas) {
    const p = colsBulk(linha);
    const nome = p[0] || "";
    if (!nome) continue;
    total++;
    const tamanho = p[1] || null;
    const chave = (nome + "||" + (tamanho || "")).toLowerCase();
    if (vistos.has(chave)) continue; // duplicata na própria colagem
    vistos.add(chave);
    parsed.push({ nome, tamanho, unidade: p[2] || null, preco: num((p[3] || "").replace(",", ".")), minimo: num((p[4] || "").replace(",", ".")) ?? 0 });
  }
  if (!total) return c.json({ error: "nenhum material reconhecido", exemplo: "Zíper preto;40;un;1,50;10" }, 400);

  // Já existentes (mesma categoria + nome + tamanho) contam como ignorados.
  const { results: exist } = await c.env.DB.prepare(
    "SELECT nome, tamanho FROM materiais WHERE categoria = ?"
  ).bind(categoria).all<{ nome: string; tamanho: string | null }>();
  const jaTinha = new Set(exist.map((x) => (x.nome + "||" + (x.tamanho || "")).toLowerCase()));

  const novos = parsed.filter((p) => !jaTinha.has((p.nome + "||" + (p.tamanho || "")).toLowerCase()));
  const stmts = novos.map((p) =>
    c.env.DB.prepare(
      `INSERT INTO materiais (id, categoria, nome, tamanho, unidade, preco, minimo, status, saldo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo', 0)`
    ).bind(uid(), categoria, p.nome, p.tamanho, p.unidade, p.preco, p.minimo)
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ total, criados: novos.length, ignorados: total - novos.length }, 201);
});

// Movimenta o estoque do material (entrada de compra, baixa manual, ajuste).
materiais.post("/:id/mov", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const tipo = String(b.tipo ?? "entrada").trim();
  if (!["entrada", "baixa", "ajuste"].includes(tipo)) return c.json({ error: "tipo inválido" }, 400);
  const qtd = Number(b.quantidade);
  if (!qtd || isNaN(qtd)) return c.json({ error: "quantidade inválida" }, 400);
  const mat = await c.env.DB.prepare("SELECT saldo FROM materiais WHERE id = ?").bind(id).first<{ saldo: number }>();
  if (!mat) return c.json({ error: "material não encontrado" }, 404);
  // entrada soma; baixa subtrai; ajuste DEFINE o saldo (delta = alvo − atual).
  const delta = tipo === "entrada" ? Math.abs(qtd) : tipo === "baixa" ? -Math.abs(qtd) : qtd - (mat.saldo || 0);
  const novo = Math.max(0, (mat.saldo || 0) + delta);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materiais SET saldo = ? WHERE id = ?").bind(novo, id),
    c.env.DB.prepare("INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo) VALUES (?, ?, ?, ?, ?)")
      .bind(uid(), id, tipo, delta, str(b.motivo)),
  ]);
  return c.json({ id, saldo: novo });
});

materiais.delete("/:id", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM materiais WHERE id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM material_mov WHERE material_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM modelo_materiais WHERE material_id = ?").bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});
