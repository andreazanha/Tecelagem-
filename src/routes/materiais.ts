// Cadastro de MATERIAIS (insumos da ficha técnica) com CONTROLE DE ESTOQUE.
// Categorias são CADASTRÁVEIS (material_categorias): os 6 padrão (forro, zíper,
// etiqueta, encarte, embalagem, refil) já vêm semeados e o usuário cria novos.
// Cada material tem saldo/mínimo/preço → base pras COMPRAS (saldo < mínimo).
import { Hono } from "hono";
import type { Env } from "../index";

export const materiais = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;
// Primeira letra maiúscula (mantém o resto). Ex.: "off white" → "Off white".
const capFirst = (s: string | null) => { const t = (s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
const num = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Number(v));
// Colar em massa: separa as colunas de UMA linha. "Fareja" o separador (Tab tem
// prioridade, depois ";", só então ","), para NÃO quebrar preços com vírgula
// decimal (ex.: "1,50") quando a linha usa ";" ou Tab entre as colunas.
export const colsBulk = (linha: string): string[] =>
  (linha.includes("\t") ? linha.split("\t") : linha.includes(";") ? linha.split(";") : linha.split(","))
    .map((s) => s.trim());

// Identidade de um material para deduplicar na colagem (nome+tamanho+cor+código).
const chaveMat = (m: { nome: string; tamanho?: string | null; cor?: string | null; codigo?: string | null }) =>
  (m.nome + "||" + (m.tamanho || "") + "||" + (m.cor || "") + "||" + (m.codigo || "")).toLowerCase();

// Preço colado pode vir com "R$", espaços e milhar: "R$ 2.350,75" → 2350.75; "2,35" → 2.35.
const parseMoeda = (v: string): number | null => {
  let s = String(v || "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // vírgula = decimal; ponto = milhar
  const n = Number(s);
  return isNaN(n) ? null : n;
};
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
  const nome = capFirst(String(b.nome ?? "").trim());
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const corCap = capFirst(str(b.cor)) || null;
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
  ).bind(id, categoria, nome, str(b.tamanho), str(b.fornecedor_id), corCap, hex, str(b.codigo),
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
  const b = await c.req.json<{ categoria?: string; texto?: string; colunas?: string[]; labels?: string[]; nomeTemplate?: string; defaults?: Record<string, string> }>().catch(() => ({}) as Record<string, unknown>);
  const categoria = String(b.categoria ?? "").trim().toLowerCase();
  if (!(await slugsValidos(c.env)).has(categoria)) return c.json({ error: "categoria inválida" }, 400);
  const labels = Array.isArray(b.labels) ? b.labels.map(String) : [];
  // Nome derivado quando o tipo não tem coluna "nome" (ex.: refil → "Refil {tamanho}").
  const nomeTemplate = typeof b.nomeTemplate === "string" ? b.nomeTemplate : "";
  // Valores padrão por coluna quando a célula vem vazia (ex.: embalagem tipo = "PVC").
  const defaults: Record<string, string> = (b.defaults && typeof b.defaults === "object") ? b.defaults as Record<string, string> : {};
  // colunas: ordem dos campos de CADA linha, igual à tela do tipo. Ex. do zíper:
  // ["nome","codigo_interno","tamanho","cor","codigo","extra:comprimento","unidade","preco","minimo","status"].
  // extra:<chave> vai para o JSON `extra` (campos específicos do tipo). Sem `colunas`,
  // usa o formato simples antigo (compatível).
  const colunas = Array.isArray(b.colunas) && b.colunas.length ? b.colunas.map(String) : ["nome", "tamanho", "unidade", "preco", "minimo"];
  const rawLinhas = String(b.texto || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const md = rawLinhas.some((l) => l.includes("|")); // tabela colada com "|"
  const splitRow = (l: string): string[] => {
    if (md) {
      const cells = l.split("|").map((s) => s.trim());
      if (cells.length && cells[0] === "") cells.shift();
      if (cells.length && cells[cells.length - 1] === "") cells.pop();
      return cells;
    }
    return colsBulk(l);
  };
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const isSep = (cells: string[]) => cells.length > 0 && cells.every((x) => x === "" || /^:?-+:?$/.test(x));

  type Mat = { nome: string; tamanho: string | null; unidade: string | null; preco: number | null; minimo: number;
    codigo_interno: string | null; cor: string | null; codigo: string | null; status: string; obs: string | null;
    fornecedor_nome: string | null; fornecedor_id: string | null; extra: Record<string, string> };
  const parsed: Mat[] = [];
  const vistos = new Set<string>();
  let total = 0, headerPulado = false;
  for (const linha of rawLinhas) {
    const cells = splitRow(linha);
    if (isSep(cells)) continue; // linha "---" de markdown
    // Pula o cabeçalho colado junto: 1ª linha cujo 1º campo bate com o rótulo (ou é "nome").
    if (!headerPulado) {
      const c0 = norm(cells[0] || "");
      if (c0 === "nome" || (labels[0] && c0 === norm(labels[0]))) { headerPulado = true; continue; }
    }
    const m: Mat = { nome: "", tamanho: null, unidade: null, preco: null, minimo: 0, codigo_interno: null, cor: null, codigo: null, status: "ativo", obs: null, fornecedor_nome: null, fornecedor_id: null, extra: {} };
    colunas.forEach((campo, i) => {
      const v = (cells[i] || "").trim();
      if (campo === "nome") m.nome = v;
      else if (campo === "tamanho") m.tamanho = v || null;
      else if (campo === "unidade") m.unidade = v ? v.toLowerCase() : null;
      else if (campo === "preco") m.preco = parseMoeda(v);
      else if (campo === "minimo") m.minimo = parseMoeda(v) ?? 0;
      else if (campo === "codigo_interno") m.codigo_interno = v || null;
      else if (campo === "cor") m.cor = v || null;
      else if (campo === "codigo") m.codigo = v || null;
      else if (campo === "obs") m.obs = v || null;
      else if (campo === "fornecedor") m.fornecedor_nome = v || null;
      else if (campo === "status") m.status = /inativ/i.test(v) ? "inativo" : "ativo";
      else if (campo.startsWith("extra:")) { if (v) m.extra[campo.slice(6)] = v; }
    });
    // Aplica valores padrão nas colunas que vieram vazias.
    for (const [key, dv] of Object.entries(defaults)) {
      if (!dv) continue;
      if (key.startsWith("extra:")) { const k = key.slice(6); if (!m.extra[k]) m.extra[k] = dv; }
      else if (key === "unidade") { if (!m.unidade) m.unidade = dv.toLowerCase(); }
      else if (key === "codigo") { if (!m.codigo) m.codigo = dv; }
      else if (key === "codigo_interno") { if (!m.codigo_interno) m.codigo_interno = dv; }
    }
    // "Não usa refil" / "sem refil" não é item de estoque — ignora.
    if (m.tamanho && /n[ãa]o usa|sem refil/i.test(m.tamanho)) continue;
    // Nome automático quando o tipo não tem coluna "nome" (ex.: "Refil {tamanho}").
    if (!m.nome && nomeTemplate) {
      m.nome = nomeTemplate.replace(/\{(\w+)\}/g, (_s, k: string) => {
        const direto = (m as unknown as Record<string, unknown>)[k];
        return String((typeof direto === "string" && direto) || m.extra[k] || "");
      }).trim();
    }
    if (!m.nome) continue;
    m.nome = capFirst(m.nome); // primeira letra maiúscula
    if (m.cor) m.cor = capFirst(m.cor);
    total++;
    const chave = chaveMat(m);
    if (vistos.has(chave)) continue; // duplicata na própria colagem
    vistos.add(chave);
    parsed.push(m);
  }
  if (!total) return c.json({ error: "nenhum material reconhecido", exemplo: "Zíper preto;40;un;1,50;10" }, 400);

  // Já existentes contam como ignorados. Identidade = nome+tamanho+cor+código
  // (no zíper o nome se repete e só a cor muda, então cor entra na chave).
  const { results: exist } = await c.env.DB.prepare(
    "SELECT nome, tamanho, cor, codigo FROM materiais WHERE categoria = ?"
  ).bind(categoria).all<{ nome: string; tamanho: string | null; cor: string | null; codigo: string | null }>();
  const jaTinha = new Set(exist.map((x) => chaveMat(x)));

  const novos = parsed.filter((p) => !jaTinha.has(chaveMat(p))).map((p) => ({ ...p, id: uid() }));

  // Fornecedor por NOME: acha o existente (case-insensitive) ou cria na hora.
  const nomesForn = [...new Set(novos.map((p) => p.fornecedor_nome).filter((n): n is string => !!n).map((n) => n.trim()))];
  if (nomesForn.length) {
    const { results: fs } = await c.env.DB.prepare("SELECT id, nome FROM fornecedores").all<{ id: string; nome: string }>();
    const byNome = new Map(fs.map((f) => [f.nome.toLowerCase(), f.id]));
    const novosForn = nomesForn.filter((n) => !byNome.has(n.toLowerCase())).map((n) => ({ id: uid(), nome: n }));
    novosForn.forEach((f) => byNome.set(f.nome.toLowerCase(), f.id));
    if (novosForn.length) await c.env.DB.batch(novosForn.map((f) => c.env.DB.prepare("INSERT INTO fornecedores (id, nome, ativo) VALUES (?, ?, 1)").bind(f.id, f.nome)));
    for (const p of novos) if (p.fornecedor_nome) p.fornecedor_id = byNome.get(p.fornecedor_nome.trim().toLowerCase()) || null;
  }

  const stmts = novos.map((p) =>
    c.env.DB.prepare(
      `INSERT INTO materiais (id, categoria, nome, tamanho, unidade, preco, minimo, codigo_interno, cor, codigo, status, obs, fornecedor_id, extra, saldo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).bind(p.id, categoria, p.nome, p.tamanho, p.unidade, p.preco, p.minimo, p.codigo_interno, p.cor, p.codigo, p.status, p.obs, p.fornecedor_id,
           Object.keys(p.extra).length ? JSON.stringify(p.extra) : null)
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ total, criados: novos.length, ignorados: total - novos.length, ids: novos.map((p) => p.id) }, 201);
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

// Excluir TODOS os materiais de um tipo (categoria). Uso: limpar e recadastrar.
materiais.post("/excluir-todos", async (c) => {
  const b = await c.req.json<{ categoria?: string }>().catch(() => ({}) as Record<string, unknown>);
  const categoria = String(b.categoria ?? "").trim().toLowerCase();
  if (!categoria) return c.json({ error: "categoria é obrigatória" }, 400);
  const { results } = await c.env.DB.prepare("SELECT id FROM materiais WHERE categoria = ?").bind(categoria).all<{ id: string }>();
  const ids = results.map((r) => r.id);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM materiais WHERE categoria = ?").bind(categoria),
    ...ids.map((id) => c.env.DB.prepare("DELETE FROM material_mov WHERE material_id = ?").bind(id)),
    ...ids.map((id) => c.env.DB.prepare("DELETE FROM modelo_materiais WHERE material_id = ?").bind(id)),
  ]);
  return c.json({ ok: true, excluidos: ids.length });
});

materiais.delete("/:id", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM materiais WHERE id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM material_mov WHERE material_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM modelo_materiais WHERE material_id = ?").bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});
