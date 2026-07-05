// Área de PRODUTOS: catálogo, estoque, ficha técnica, insumos, baixa de insumos
// e histórico. Tudo em tabelas novas — não toca no fluxo de pedidos/produção.
import { Hono } from "hono";
import type { Env } from "../index";
import { gerarRelatorioEstoque, type LinhaEstoque } from "../pdf";

const uid = () => crypto.randomUUID();
const num = (v: unknown) => Math.max(0, Number(v) || 0);

// Grava uma linha no histórico da área de produtos (data/usuário/descrição).
async function log(env: Env, tipo: string, descricao: string, usuario?: string | null, refId?: string | null) {
  await env.DB.prepare(
    "INSERT INTO produtos_log (id, tipo, descricao, usuario, ref_id) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(uid(), tipo, descricao, (usuario || "").trim() || null, refId || null)
    .run();
}

const normTxt = (s: unknown) => String(s || "").trim().toLowerCase();
type ProdLite = { id: string; nome: string; ref: string | null; cor: string | null; tamanho: string | null };
type ItemLite = { produto?: string; ref?: string | null; cor_grade?: string | null; tamanho?: string | null; qtd?: number };

// Casa um item de pedido a um produto cadastrado (pela referência; refina por cor/tamanho).
export function casarProduto(it: ItemLite, prods: ProdLite[]): ProdLite | null {
  let cand = prods.filter((p) => p.ref && normTxt(p.ref) === normTxt(it.ref));
  if (cand.length > 1) {
    const fino = cand.filter((p) => normTxt(p.cor) === normTxt(it.cor_grade) && normTxt(p.tamanho) === normTxt(it.tamanho));
    if (fino.length) cand = fino;
  }
  return cand[0] || null;
}

// Onde as peças de um pedido estão na produção (setor/status de cada parte).
export async function localizacaoProducao(env: Env, pedidoId: string) {
  const { results } = await env.DB.prepare(
    "SELECT parte, setor, status FROM producao WHERE pedido_id = ?"
  ).bind(pedidoId).all<{ parte: string; setor: string; status: string }>();
  return results;
}

// Baixa AUTOMÁTICA das peças de PRONTA ENTREGA no estoque de produtos (ao gerar os PDFs).
// Idempotente: se já baixou este pedido, não repete. Retorna o que ficou sem vínculo.
export async function baixaProntaEntrega(
  env: Env,
  pedido: { id: string; numero: string },
  kitItens: ItemLite[]
): Promise<{ baixados: number; jaBaixado: boolean; semVinculo: (ItemLite & { qtd: number })[] }> {
  const ja = await env.DB.prepare("SELECT 1 FROM produto_mov WHERE pedido_id = ? AND origem = 'pronta-entrega' LIMIT 1").bind(pedido.id).first();
  if (ja) return { baixados: 0, jaBaixado: true, semVinculo: [] };
  const { results: prods } = await env.DB.prepare("SELECT id, nome, ref, cor, tamanho FROM produtos WHERE ativo = 1").all<ProdLite>();
  const semVinculo: (ItemLite & { qtd: number })[] = [];
  let baixados = 0;
  for (const it of kitItens) {
    const qtd = Math.max(0, Math.trunc(Number(it.qtd) || 0));
    if (qtd <= 0) continue;
    const match = casarProduto(it, prods);
    if (!match) { semVinculo.push({ ...it, qtd }); continue; }
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO produto_mov (id, produto_id, tipo, origem, qtd, pedido_id, pedido_numero, observacao)
         VALUES (?, ?, 'saida', 'pronta-entrega', ?, ?, ?, ?)`
      ).bind(uid(), match.id, qtd, pedido.id, pedido.numero, `Baixa automática (pronta entrega) — pedido ${pedido.numero}`),
      env.DB.prepare("UPDATE produtos SET estoque = estoque - ?, atualizado_em = datetime('now') WHERE id = ?").bind(qtd, match.id),
    ]);
    baixados++;
  }
  await log(env, "estoque", `Baixa automática pronta entrega ${pedido.numero}: ${baixados} produto(s)${semVinculo.length ? ` · ${semVinculo.length} sem vínculo` : ""}`, null, pedido.id);
  return { baixados, jaBaixado: false, semVinculo };
}

// ══════════════════════════════ PRODUTOS ══════════════════════════════
export const produtos = new Hono<{ Bindings: Env }>();

// LISTA (filtros: ?ativo=1|0|todos, ?busca=)
produtos.get("/", async (c) => {
  const ativo = c.req.query("ativo") ?? "todos";
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  let sql = "SELECT * FROM produtos";
  const binds: unknown[] = [];
  const cond: string[] = [];
  if (ativo === "1" || ativo === "0") cond.push(`ativo = ${ativo === "1" ? 1 : 0}`);
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY nome";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  const lista = busca
    ? results.filter((p) => `${p.nome} ${p.ref || ""} ${p.categoria || ""} ${p.cor || ""}`.toLowerCase().includes(busca))
    : results;
  return c.json(lista);
});

// Movimentações recentes de estoque (aba "Entradas"). ?tipo= ?origem=
produtos.get("/movimentacoes", async (c) => {
  const tipo = c.req.query("tipo") || "";
  const origem = c.req.query("origem") || "";
  const cond: string[] = [];
  if (tipo) cond.push(`m.tipo = '${tipo === "saida" ? "saida" : "entrada"}'`);
  if (origem) cond.push(`m.origem = '${["avulsa", "pedido", "ajuste"].includes(origem) ? origem : "avulsa"}'`);
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, p.nome AS produto_nome, p.ref AS produto_ref, p.unidade AS produto_unidade
       FROM produto_mov m LEFT JOIN produtos p ON p.id = m.produto_id
       ${where} ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 300`
  ).all();
  return c.json(results);
});

// RELATÓRIO DE ESTOQUE em PDF (faltas e sobras, organizado por categoria). ?so=falta
produtos.get("/relatorio-estoque/pdf", async (c) => {
  const so = c.req.query("so");
  const { results } = await c.env.DB.prepare(
    "SELECT nome, ref, categoria, cor, tamanho, tipo, unidade, estoque, estoque_min FROM produtos WHERE ativo = 1 ORDER BY categoria, nome"
  ).all<LinhaEstoque>();
  const linhas = so === "falta" ? results.filter((l) => (Number(l.estoque) || 0) < (Number(l.estoque_min) || 0)) : results;
  const bytes = await gerarRelatorioEstoque(linhas);
  return new Response(bytes, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="relatorio-estoque.pdf"' },
  });
});

// Histórico geral (aba "Histórico"). ?tipo=
produtos.get("/log", async (c) => {
  const tipo = c.req.query("tipo") || "";
  const where = tipo ? "WHERE tipo = ?" : "";
  const stmt = c.env.DB.prepare(`SELECT * FROM produtos_log ${where} ORDER BY criado_em DESC, rowid DESC LIMIT 400`);
  const { results } = await (tipo ? stmt.bind(tipo) : stmt).all();
  return c.json(results);
});

// Itens de um pedido já existente, casados com produtos pela referência (entrada por pedido).
produtos.get("/pedido/:pedidoId/itens", async (c) => {
  const pedidoId = c.req.param("pedidoId");
  const ped = await c.env.DB.prepare("SELECT id, numero_erp, codigo_pai FROM pedidos WHERE id = ?")
    .bind(pedidoId)
    .first<{ id: string; numero_erp: string | null; codigo_pai: string | null }>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, SUM(qtd) AS qtd FROM pedido_itens WHERE pedido_id = ? GROUP BY produto, ref, cor_grade, tamanho"
  )
    .bind(pedidoId)
    .all<{ produto: string; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number }>();
  const { results: prods } = await c.env.DB.prepare("SELECT id, nome, ref, cor, tamanho FROM produtos WHERE ativo = 1").all<ProdLite>();
  const casados = itens.map((it) => {
    const match = casarProduto(it, prods);
    return {
      ref: it.ref,
      produto: it.produto,
      cor: it.cor_grade,
      tamanho: it.tamanho,
      qtd: Number(it.qtd) || 0,
      produto_id: match?.id || null,
      produto_nome: match?.nome || null,
    };
  });
  // localização na produção (onde estão as peças) — ajuda quando falta vínculo
  const producao = await localizacaoProducao(c.env, pedidoId);
  return c.json({ pedido: { id: ped.id, numero: ped.codigo_pai || ped.numero_erp || ped.id.slice(0, 8) }, itens: casados, producao });
});

// Prévia dos insumos a baixar de uma ENTRADA (ficha × quantidade da entrada).
produtos.get("/mov/:movId/baixa-preview", async (c) => {
  const movId = c.req.param("movId");
  const mov = await c.env.DB.prepare("SELECT * FROM produto_mov WHERE id = ?")
    .bind(movId)
    .first<Record<string, unknown>>();
  if (!mov) return c.json({ error: "movimentação não encontrada" }, 404);
  const { results: ficha } = await c.env.DB.prepare(
    "SELECT * FROM produto_insumos WHERE produto_id = ?"
  )
    .bind(mov.produto_id as string)
    .all<Record<string, unknown>>();
  const qtdEntrada = Number(mov.qtd) || 0;
  const linhas = [] as Record<string, unknown>[];
  for (const f of ficha) {
    let estoque: number | null = null;
    if (f.insumo_id) {
      const ins = await c.env.DB.prepare("SELECT estoque FROM insumos WHERE id = ?").bind(f.insumo_id as string).first<{ estoque: number }>();
      estoque = ins ? Number(ins.estoque) : null;
    }
    linhas.push({
      insumo_id: f.insumo_id,
      nome: f.nome,
      tipo: f.tipo,
      unidade: f.unidade,
      qtd_por_unidade: Number(f.qtd_por_unidade) || 0,
      qtd_total: (Number(f.qtd_por_unidade) || 0) * qtdEntrada,
      estoque_atual: estoque,
      vinculado: !!f.insumo_id,
    });
  }
  return c.json({ ja_baixado: !!Number(mov.insumos_baixados), qtd_entrada: qtdEntrada, linhas });
});

// Um produto + sua ficha técnica.
produtos.get("/:id", async (c) => {
  const id = c.req.param("id");
  const p = await c.env.DB.prepare("SELECT * FROM produtos WHERE id = ?").bind(id).first();
  if (!p) return c.json({ error: "produto não encontrado" }, 404);
  const { results: ficha } = await c.env.DB.prepare("SELECT * FROM produto_insumos WHERE produto_id = ? ORDER BY rowid").bind(id).all();
  const { results: kit } = await c.env.DB.prepare("SELECT * FROM produto_kit WHERE kit_id = ? ORDER BY rowid").bind(id).all();
  return c.json({ ...p, ficha, kit });
});

// Movimentações de estoque de um produto (extrato).
produtos.get("/:id/movs", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM produto_mov WHERE produto_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 200"
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(results);
});

// Foto do produto (R2).
produtos.get("/:id/foto", async (c) => {
  const obj = await c.env.BUCKET.get(`produtos/${c.req.param("id")}`);
  if (!obj) return c.json({ error: "sem foto" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType || "image/png", "Cache-Control": "no-cache" },
  });
});

// CRIA/ATUALIZA produto (upsert por id).
produtos.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const existe = b.id ? await c.env.DB.prepare("SELECT id FROM produtos WHERE id = ?").bind(b.id as string).first() : null;
  const id = (b.id as string) || uid();
  const tipo = b.tipo === "kit" ? "kit" : "avulso";
  await c.env.DB.prepare(
    `INSERT INTO produtos (id, nome, ref, categoria, tamanho, cor, tipo_fio, unidade, tipo, estoque_min, ativo, observacao, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, ref = excluded.ref, categoria = excluded.categoria,
       tamanho = excluded.tamanho, cor = excluded.cor, tipo_fio = excluded.tipo_fio, unidade = excluded.unidade,
       tipo = excluded.tipo, estoque_min = excluded.estoque_min, ativo = excluded.ativo, observacao = excluded.observacao, atualizado_em = datetime('now')`
  )
    .bind(
      id,
      nome,
      String(b.ref || "").trim() || null,
      String(b.categoria || "").trim() || null,
      String(b.tamanho || "").trim() || null,
      String(b.cor || "").trim() || null,
      String(b.tipo_fio || "").trim() || null,
      String(b.unidade || "un").trim() || "un",
      tipo,
      num(b.estoque_min),
      b.ativo === false || b.ativo === 0 ? 0 : 1,
      String(b.observacao || "").trim() || null
    )
    .run();
  await log(c.env, "produto", `${existe ? "Produto editado" : "Produto criado"}: ${nome}`, b.usuario as string, id);
  return c.json({ id, nome }, existe ? 200 : 201);
});

// Ativar/desativar.
produtos.post("/:id/ativo", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ ativo?: boolean; usuario?: string }>().catch(() => ({}) as { ativo?: boolean; usuario?: string });
  const v = b.ativo ? 1 : 0;
  const p = await c.env.DB.prepare("SELECT nome FROM produtos WHERE id = ?").bind(id).first<{ nome: string }>();
  await c.env.DB.prepare("UPDATE produtos SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?").bind(v, id).run();
  await log(c.env, "produto", `Produto ${v ? "ativado" : "desativado"}: ${p?.nome || id}`, b.usuario, id);
  return c.json({ ok: true, ativo: !!v });
});

// EXCLUI produto (mantém as movimentações no histórico).
produtos.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const p = await c.env.DB.prepare("SELECT nome FROM produtos WHERE id = ?").bind(id).first<{ nome: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM produto_insumos WHERE produto_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM produtos WHERE id = ?").bind(id),
  ]);
  await c.env.BUCKET.delete(`produtos/${id}`).catch(() => {});
  await log(c.env, "produto", `Produto excluído: ${p?.nome || id}`, c.req.query("usuario"), id);
  return c.json({ ok: true });
});

// FOTO (multipart) → R2.
produtos.post("/:id/foto", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);
  const key = `produtos/${id}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "image/png" } });
  await c.env.DB.prepare("UPDATE produtos SET foto_key = ?, atualizado_em = datetime('now') WHERE id = ?").bind(key, id).run();
  return c.json({ ok: true, foto_key: key });
});

produtos.delete("/:id/foto", async (c) => {
  const id = c.req.param("id");
  await c.env.BUCKET.delete(`produtos/${id}`).catch(() => {});
  await c.env.DB.prepare("UPDATE produtos SET foto_key = NULL WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// MOVIMENTAÇÃO de estoque (entrada/saída avulsa ou ajuste).
produtos.post("/:id/mov", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const tipo = b.tipo === "saida" ? "saida" : "entrada";
  const origem = ["avulsa", "ajuste"].includes(String(b.origem)) ? String(b.origem) : "avulsa";
  const qtd = num(b.qtd);
  if (qtd <= 0) return c.json({ error: "quantidade deve ser maior que zero" }, 400);
  const p = await c.env.DB.prepare("SELECT nome, estoque, unidade FROM produtos WHERE id = ?").bind(id).first<{ nome: string; estoque: number; unidade: string }>();
  if (!p) return c.json({ error: "produto não encontrado" }, 404);
  const delta = tipo === "entrada" ? qtd : -qtd;
  const movId = uid();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO produto_mov (id, produto_id, tipo, origem, qtd, usuario, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(movId, id, tipo, origem, qtd, (String(b.usuario || "").trim() || null), String(b.observacao || "").trim() || null),
    c.env.DB.prepare("UPDATE produtos SET estoque = estoque + ?, atualizado_em = datetime('now') WHERE id = ?").bind(delta, id),
  ]);
  await log(c.env, "estoque", `${tipo === "entrada" ? "Entrada" : "Saída"} ${qtd} ${p.unidade} — ${p.nome} (${origem})`, b.usuario as string, id);
  return c.json({ ok: true, mov_id: movId, estoque: Number(p.estoque) + delta });
});

// ENTRADA POR PEDIDO: cria entradas a partir dos itens escolhidos de um pedido.
produtos.post("/entrada-pedido", async (c) => {
  const b = await c.req.json<{ pedido_id?: string; pedido_numero?: string; usuario?: string; itens?: { produto_id?: string; qtd?: number; observacao?: string }[] }>().catch(() => ({}) as Record<string, never>);
  const itens = (b.itens || []).filter((i) => i.produto_id && num(i.qtd) > 0);
  if (!itens.length) return c.json({ error: "selecione ao menos um item com produto e quantidade" }, 400);
  const criadas: { produto_id: string; mov_id: string; qtd: number }[] = [];
  for (const it of itens) {
    const qtd = num(it.qtd);
    const movId = uid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO produto_mov (id, produto_id, tipo, origem, qtd, pedido_id, pedido_numero, usuario, observacao)
         VALUES (?, ?, 'entrada', 'pedido', ?, ?, ?, ?, ?)`
      ).bind(movId, it.produto_id!, qtd, b.pedido_id || null, b.pedido_numero || null, (b.usuario || "").trim() || null, (it.observacao || "").trim() || null),
      c.env.DB.prepare("UPDATE produtos SET estoque = estoque + ?, atualizado_em = datetime('now') WHERE id = ?").bind(qtd, it.produto_id!),
    ]);
    criadas.push({ produto_id: it.produto_id!, mov_id: movId, qtd });
  }
  await log(c.env, "estoque", `Entrada por pedido ${b.pedido_numero || ""}: ${criadas.length} produto(s)`, b.usuario, b.pedido_id);
  return c.json({ ok: true, criadas });
});

// Cria os produtos (avulsos) dos itens de um pedido que AINDA não existem no
// catálogo (casados por ref/cor/tamanho). Não duplica. Reutilizado na criação do
// pedido (automático ao subir/salvar o PDF) e no botão de cadastro manual.
export async function cadastrarProdutosDoPedido(env: Env, pedidoId: string, usuario?: string | null): Promise<{ criados: number; nomes: string[] }> {
  const { results: itens } = await env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho FROM pedido_itens WHERE pedido_id = ? GROUP BY produto, ref, cor_grade, tamanho"
  ).bind(pedidoId).all<{ produto: string; ref: string | null; cor_grade: string | null; tamanho: string | null }>();
  const { results: prods } = await env.DB.prepare("SELECT id, nome, ref, cor, tamanho FROM produtos WHERE ativo = 1").all<ProdLite>();
  const nomes: string[] = [];
  for (const it of itens) {
    if (!String(it.produto || "").trim()) continue;
    if (casarProduto(it, prods)) continue; // já existe produto vinculável
    const id = uid();
    await env.DB.prepare(
      `INSERT INTO produtos (id, nome, ref, cor, tamanho, unidade, tipo, ativo) VALUES (?, ?, ?, ?, ?, 'un', 'avulso', 1)`
    ).bind(id, it.produto.trim(), String(it.ref || "").trim() || null, String(it.cor_grade || "").trim() || null, String(it.tamanho || "").trim() || null).run();
    prods.push({ id, nome: it.produto, ref: it.ref, cor: it.cor_grade, tamanho: it.tamanho }); // evita duplicar iguais no mesmo pedido
    nomes.push(it.produto.trim());
  }
  if (nomes.length) await log(env, "produto", `Cadastro automático via pedido: ${nomes.length} produto(s)`, usuario, pedidoId);
  return { criados: nomes.length, nomes };
}

// CADASTRO AUTOMÁTICO a partir de um pedido (botão manual / pedidos antigos).
produtos.post("/cadastrar-do-pedido", async (c) => {
  const b = await c.req.json<{ pedido_id?: string; usuario?: string }>().catch(() => ({}) as { pedido_id?: string; usuario?: string });
  if (!b.pedido_id) return c.json({ error: "pedido_id é obrigatório" }, 400);
  const r = await cadastrarProdutosDoPedido(c.env, b.pedido_id, b.usuario);
  return c.json({ ok: true, ...r });
});

// FICHA TÉCNICA: substitui a lista de insumos do produto.
produtos.post("/:id/ficha", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ usuario?: string; itens?: Record<string, unknown>[] }>().catch(() => ({}) as { usuario?: string; itens?: Record<string, unknown>[] });
  const p = await c.env.DB.prepare("SELECT nome FROM produtos WHERE id = ?").bind(id).first<{ nome: string }>();
  if (!p) return c.json({ error: "produto não encontrado" }, 404);
  const linhas = (b.itens || []).filter((i) => String(i.nome || "").trim());
  const stmts: D1PreparedStatement[] = [c.env.DB.prepare("DELETE FROM produto_insumos WHERE produto_id = ?").bind(id)];
  for (const l of linhas) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO produto_insumos (id, produto_id, insumo_id, nome, tipo, qtd_por_unidade, unidade, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uid(),
        id,
        (l.insumo_id as string) || null,
        String(l.nome).trim(),
        String(l.tipo || "").trim() || null,
        num(l.qtd_por_unidade),
        String(l.unidade || "").trim() || null,
        String(l.observacao || "").trim() || null
      )
    );
  }
  await c.env.DB.batch(stmts);
  await log(c.env, "ficha", `Ficha técnica atualizada: ${p.nome} (${linhas.length} insumo(s))`, b.usuario, id);
  return c.json({ ok: true, total: linhas.length });
});

// COMPOSIÇÃO DO KIT: substitui a lista de produtos que compõem o kit.
produtos.post("/:id/kit", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ usuario?: string; itens?: Record<string, unknown>[] }>().catch(() => ({}) as { usuario?: string; itens?: Record<string, unknown>[] });
  const p = await c.env.DB.prepare("SELECT nome FROM produtos WHERE id = ?").bind(id).first<{ nome: string }>();
  if (!p) return c.json({ error: "produto não encontrado" }, 404);
  const linhas = (b.itens || []).filter((i) => String(i.nome || "").trim() && num(i.qtd) > 0);
  const stmts: D1PreparedStatement[] = [c.env.DB.prepare("DELETE FROM produto_kit WHERE kit_id = ?").bind(id)];
  for (const l of linhas) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO produto_kit (id, kit_id, componente_id, nome, qtd, observacao) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(uid(), id, (l.componente_id as string) || null, String(l.nome).trim(), num(l.qtd), String(l.observacao || "").trim() || null)
    );
  }
  await c.env.DB.batch(stmts);
  await log(c.env, "produto", `Composição do kit atualizada: ${p.nome} (${linhas.length} produto(s))`, b.usuario, id);
  return c.json({ ok: true, total: linhas.length });
});

// BAIXA DE INSUMOS de uma entrada (aplica a prévia; deduz o estoque dos insumos vinculados).
produtos.post("/mov/:movId/baixar-insumos", async (c) => {
  const movId = c.req.param("movId");
  const b = await c.req.json<{ usuario?: string }>().catch(() => ({}) as { usuario?: string });
  const mov = await c.env.DB.prepare("SELECT * FROM produto_mov WHERE id = ?").bind(movId).first<Record<string, unknown>>();
  if (!mov) return c.json({ error: "movimentação não encontrada" }, 404);
  if (Number(mov.insumos_baixados)) return c.json({ error: "os insumos desta entrada já foram baixados" }, 409);
  const prod = await c.env.DB.prepare("SELECT nome FROM produtos WHERE id = ?").bind(mov.produto_id as string).first<{ nome: string }>();
  const { results: ficha } = await c.env.DB.prepare("SELECT * FROM produto_insumos WHERE produto_id = ?").bind(mov.produto_id as string).all<Record<string, unknown>>();
  const qtdEntrada = Number(mov.qtd) || 0;
  const stmts: D1PreparedStatement[] = [];
  let baixados = 0;
  for (const f of ficha) {
    if (!f.insumo_id) continue; // só baixa insumos vinculados ao cadastro
    const total = (Number(f.qtd_por_unidade) || 0) * qtdEntrada;
    if (total <= 0) continue;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO insumo_mov (id, insumo_id, tipo, origem, qtd, produto_mov_id, usuario, observacao)
         VALUES (?, ?, 'saida', 'ficha', ?, ?, ?, ?)`
      ).bind(uid(), f.insumo_id as string, total, movId, (b.usuario || "").trim() || null, `Baixa por entrada de ${prod?.nome || ""}`)
    );
    stmts.push(c.env.DB.prepare("UPDATE insumos SET estoque = estoque - ?, atualizado_em = datetime('now') WHERE id = ?").bind(total, f.insumo_id as string));
    baixados++;
  }
  stmts.push(c.env.DB.prepare("UPDATE produto_mov SET insumos_baixados = 1 WHERE id = ?").bind(movId));
  await c.env.DB.batch(stmts);
  await log(c.env, "baixa", `Baixa de insumos: ${prod?.nome || ""} × ${qtdEntrada} (${baixados} insumo(s))`, b.usuario, mov.produto_id as string);
  return c.json({ ok: true, baixados });
});

// ══════════════════════════════ INSUMOS ══════════════════════════════
export const insumos = new Hono<{ Bindings: Env }>();

insumos.get("/", async (c) => {
  const ativo = c.req.query("ativo") ?? "todos";
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  let sql = "SELECT * FROM insumos";
  if (ativo === "1" || ativo === "0") sql += ` WHERE ativo = ${ativo === "1" ? 1 : 0}`;
  sql += " ORDER BY nome";
  const { results } = await c.env.DB.prepare(sql).all<Record<string, unknown>>();
  const lista = busca
    ? results.filter((i) => `${i.nome} ${i.categoria || ""} ${i.codigo || ""}`.toLowerCase().includes(busca))
    : results;
  return c.json(lista);
});

insumos.get("/:id/movs", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM insumo_mov WHERE insumo_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 200"
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(results);
});

insumos.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const existe = b.id ? await c.env.DB.prepare("SELECT id FROM insumos WHERE id = ?").bind(b.id as string).first() : null;
  const id = (b.id as string) || uid();
  await c.env.DB.prepare(
    `INSERT INTO insumos (id, nome, categoria, unidade, codigo, estoque_min, ativo, observacao, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, categoria = excluded.categoria, unidade = excluded.unidade,
       codigo = excluded.codigo, estoque_min = excluded.estoque_min, ativo = excluded.ativo,
       observacao = excluded.observacao, atualizado_em = datetime('now')`
  )
    .bind(
      id,
      nome,
      String(b.categoria || "").trim() || null,
      String(b.unidade || "un").trim() || "un",
      String(b.codigo || "").trim() || null,
      num(b.estoque_min),
      b.ativo === false || b.ativo === 0 ? 0 : 1,
      String(b.observacao || "").trim() || null
    )
    .run();
  await log(c.env, "insumo", `${existe ? "Insumo editado" : "Insumo criado"}: ${nome}`, b.usuario as string, id);
  return c.json({ id, nome }, existe ? 200 : 201);
});

insumos.post("/:id/ativo", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ ativo?: boolean; usuario?: string }>().catch(() => ({}) as { ativo?: boolean; usuario?: string });
  const v = b.ativo ? 1 : 0;
  const i = await c.env.DB.prepare("SELECT nome FROM insumos WHERE id = ?").bind(id).first<{ nome: string }>();
  await c.env.DB.prepare("UPDATE insumos SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?").bind(v, id).run();
  await log(c.env, "insumo", `Insumo ${v ? "ativado" : "desativado"}: ${i?.nome || id}`, b.usuario, id);
  return c.json({ ok: true, ativo: !!v });
});

insumos.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const i = await c.env.DB.prepare("SELECT nome FROM insumos WHERE id = ?").bind(id).first<{ nome: string }>();
  await c.env.DB.prepare("DELETE FROM insumos WHERE id = ?").bind(id).run();
  await log(c.env, "insumo", `Insumo excluído: ${i?.nome || id}`, c.req.query("usuario"), id);
  return c.json({ ok: true });
});

// Movimentação de estoque do insumo (entrada/saída avulsa ou ajuste).
insumos.post("/:id/mov", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const tipo = b.tipo === "saida" ? "saida" : "entrada";
  const origem = ["avulsa", "ajuste"].includes(String(b.origem)) ? String(b.origem) : "avulsa";
  const qtd = num(b.qtd);
  if (qtd <= 0) return c.json({ error: "quantidade deve ser maior que zero" }, 400);
  const i = await c.env.DB.prepare("SELECT nome, estoque, unidade FROM insumos WHERE id = ?").bind(id).first<{ nome: string; estoque: number; unidade: string }>();
  if (!i) return c.json({ error: "insumo não encontrado" }, 404);
  const delta = tipo === "entrada" ? qtd : -qtd;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO insumo_mov (id, insumo_id, tipo, origem, qtd, usuario, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(uid(), id, tipo, origem, qtd, (String(b.usuario || "").trim() || null), String(b.observacao || "").trim() || null),
    c.env.DB.prepare("UPDATE insumos SET estoque = estoque + ?, atualizado_em = datetime('now') WHERE id = ?").bind(delta, id),
  ]);
  await log(c.env, "insumo", `${tipo === "entrada" ? "Entrada" : "Saída"} ${qtd} ${i.unidade} — ${i.nome} (${origem})`, b.usuario as string, id);
  return c.json({ ok: true, estoque: Number(i.estoque) + delta });
});
