// INTEGRAÇÃO COM ERP (Syntech/Firebird) — "porta de entrada" dos pedidos.
// A ponte (programa que lê o Firebird) envia cada pedido novo aqui, autenticando
// com o header X-Integracao-Token (segredo do ambiente INTEGRACAO_TOKEN).
//
// Modo CONFERÊNCIA: o pedido entra como status 'aguardando_aprovacao' — fica FORA
// da produção (garantirCards ignora esse status) até alguém APROVAR. Ao aprovar,
// vira 'novo' e a explosão acontece normalmente. Assim nenhum cancelado/rascunho
// cai na produção sem conferência.
import { Hono } from "hono";
import type { Env } from "../index";
import { exigirFuncao } from "../permissoes";
import { proximoCodigoPai } from "./pedidos";
import { cadastrarProdutosDoPedido } from "./produtos";
import { consumoDoPedido, baixarPorPedido, type Autor } from "../estoque-baixa";
import { SYNC_JS, SYNC_VERSAO } from "../bridgeScript";
import { SITE_ONLINE_HTML } from "../siteTemplate";
import { SITE_FULL_HTML } from "../siteTemplateFull";
import { SITE_LOJA_HTML } from "../siteLoja";
import { lerDocumento, gravarDocumento } from "../firestore";

export const integracao = new Hono<{ Bindings: Env }>();

// ── AUTO-ATUALIZAÇÃO DA PONTE ────────────────────────────────────────────────
// A ponte (bridge/sync.js) baixa daqui a versão mais nova de si mesma e se
// atualiza sozinha. Protegido pelo mesmo token. O conteúdo é gerado no build a
// partir de bridge/sync.js (scripts/gen-bridge-script.mjs).
integracao.get("/bridge-sync", (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  return new Response(SYNC_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Ponte-Versao": SYNC_VERSAO,
      "Cache-Control": "no-store",
    },
  });
});

const uid = () => crypto.randomUUID();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
const inteiro = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

// Depois que um pedido importado "vira produção" (aprovado), roda o MESMO pós-processo
// do PDF: cadastra os produtos que faltam e dá baixa de estoque dos insumos. Não trava.
async function posProcessar(env: Env, pedidoId: string, autor?: Autor) {
  await cadastrarProdutosDoPedido(env, pedidoId).catch(() => {});
  await baixarPorPedido(env, pedidoId, await consumoDoPedido(env, pedidoId), autor).catch(() => {});
}

type ItemIn = { produto?: string; ref?: string; cor?: string; tamanho?: string; qtd?: number | string; preco?: number | string };
type PedidoIn = {
  numero?: string | number; data?: string; data_entrega?: string; vendedor?: string;
  cliente?: { nome?: string; cnpj?: string; cidade?: string; uf?: string } | string;
  itens?: ItemIn[];
};

// ── PORTA DE ENTRADA: recebe um pedido do ERP (via ponte) ───────────────────────
integracao.post("/pedido", async (c) => {
  // Autenticação por token (segredo do ambiente). Sem token configurado → recusa tudo.
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  const b = await c.req.json<PedidoIn>().catch(() => ({} as PedidoIn));
  const numero = str(b.numero);
  if (!numero) return c.json({ error: "numero_obrigatorio" }, 400);
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const cliente = typeof b.cliente === "string" ? { nome: b.cliente } : (b.cliente || {});
  const clienteNome = str(cliente.nome) || "SEM CLIENTE";

  // Idempotência: se já importamos esse número do ERP, não duplica (a ponte pode reenviar).
  const existe = await c.env.DB.prepare(
    "SELECT id, status FROM pedidos WHERE numero_erp = ? AND COALESCE(erp_integracao,0) = 1"
  ).bind(numero).first<{ id: string; status: string | null }>();
  if (existe) return c.json({ ok: true, duplicado: true, pedido_id: existe.id, status: existe.status });

  const pedidoId = uid();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO pedidos (id, numero_erp, cliente_nome, vendedor, tipo, data_pedido, data_entrega, status, erp_integracao, created_at)
       VALUES (?, ?, ?, ?, 'pedido', ?, ?, 'aguardando_aprovacao', 1, datetime('now'))`
    ).bind(pedidoId, numero, clienteNome, str(b.vendedor), str(b.data), str(b.data_entrega)),
  ];
  for (const it of itens) {
    const produto = str(it.produto);
    if (!produto) continue;
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte) VALUES (?, ?, ?, ?, ?, ?, ?, 'unico')"
      ).bind(uid(), pedidoId, produto, str(it.ref), str(it.cor), str(it.tamanho), inteiro(it.qtd))
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, pedido_id: pedidoId, numero, itens: stmts.length - 1 }, 201);
});

// ── LISTA os pedidos do ERP aguardando conferência ──────────────────────────────
integracao.get("/pendentes", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.numero_erp, p.cliente_nome, p.status, p.data_pedido, p.data_entrega, p.created_at,
            (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = p.id) AS linhas,
            (SELECT COALESCE(SUM(i.qtd),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS pecas
       FROM pedidos p
      WHERE COALESCE(p.erp_integracao,0) = 1 AND p.status IN ('aguardando_aprovacao','aguardando_explosao')
      ORDER BY p.created_at DESC, p.numero_erp DESC`
  ).all();
  return c.json(results);
});

// Itens de um pedido pendente (pra conferir antes de aprovar).
integracao.get("/pendentes/:id", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare(
    "SELECT id, numero_erp, cliente_nome, data_pedido, data_entrega FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1"
  ).bind(id).first();
  if (!ped) return c.json({ error: "nao_encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade AS cor, tamanho, qtd FROM pedido_itens WHERE pedido_id = ? ORDER BY produto, tamanho"
  ).bind(id).all();
  return c.json({ pedido: ped, itens });
});

// ── ACEITAR (segurar): pedido válido, FORA da produção, pra explodir depois ──────
// Fica numa fila de "aguardando explosão" — serve pra acumular pedidos pequenos e
// depois explodir vários juntos (render mais na tecelagem). Não gera cards ainda.
integracao.post("/pendentes/:id/aceitar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    "UPDATE pedidos SET status = 'aguardando_explosao' WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status = 'aguardando_aprovacao'"
  ).bind(id).run();
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

// ── APROVAR/EXPLODIR: entra na produção. Vale pra pendente OU aceito (segurado). ──
integracao.post("/pendentes/:id/aprovar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    "UPDATE pedidos SET status = 'novo', bloqueado = 1 WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')"
  ).bind(id).run();
  const ok = (r.meta?.changes ?? 0) > 0;
  // Igual ao PDF: nasce bloqueado (PCP libera), cadastra produtos e baixa estoque.
  // A explosão/cards são gerados pelo garantirCards quando o quadro da produção carrega.
  if (ok) await posProcessar(c.env, id, { id: g.u.id, nome: g.u.nome });
  return c.json({ ok });
});

// ── APROVAR VÁRIOS JUNTOS (explosão consolidada / OP pai) ────────────────────────
// Junta vários pedidos do ERP numa OP só (código pai), pra render mais na tecelagem.
// Cada item guarda a ORIGEM (pedido + loja/cliente), então depois o sistema desmembra
// por pedido/loja (inclusive mesma empresa com CNPJs diferentes). Igual aos PDFs.
integracao.post("/aprovar-lote", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ ids?: string[] }>().catch(() => ({} as { ids?: string[] }));
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length < 2) return c.json({ error: "selecione_dois_ou_mais" }, 400);

  const ph = ids.map(() => "?").join(",");
  const { results: peds } = await c.env.DB.prepare(
    `SELECT id, numero_erp, cliente_nome, data_pedido, data_entrega FROM pedidos
      WHERE id IN (${ph}) AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')`
  ).bind(...ids).all<{ id: string; numero_erp: string; cliente_nome: string; data_pedido: string | null; data_entrega: string | null }>();
  if (peds.length < 2) return c.json({ error: "pedidos_nao_encontrados" }, 400);

  const { results: itens } = await c.env.DB.prepare(
    `SELECT pedido_id, produto, ref, cor_grade, tamanho, qtd FROM pedido_itens WHERE pedido_id IN (${ph}) ORDER BY produto, tamanho`
  ).bind(...ids).all<{ pedido_id: string; produto: string; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number }>();

  const porId = new Map(peds.map((p) => [p.id, p]));
  const numeros = peds.map((p) => p.numero_erp).join(", ");
  const clientesDistintos = [...new Set(peds.map((p) => p.cliente_nome))];
  const clienteOP = clientesDistintos.length === 1 ? clientesDistintos[0] : "VÁRIOS CLIENTES";
  const dataPedido = peds.map((p) => p.data_pedido).filter(Boolean).sort()[0] || null;
  const dataEntrega = peds.map((p) => p.data_entrega).filter(Boolean).sort()[0] || null;
  const codigoPai = await proximoCodigoPai(c.env);

  const novoId = uid();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO pedidos (id, numero_erp, cliente_nome, codigo_pai, tipo, data_pedido, data_entrega, status, erp_integracao, bloqueado, created_at)
       VALUES (?, ?, ?, ?, 'pedido', ?, ?, 'novo', 1, 1, datetime('now'))`
    ).bind(novoId, numeros, clienteOP, codigoPai, dataPedido, dataEntrega),
  ];
  for (const it of itens) {
    const org = porId.get(it.pedido_id);
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte, origem, origem_cliente) VALUES (?, ?, ?, ?, ?, ?, ?, 'unico', ?, ?)"
      ).bind(uid(), novoId, it.produto, it.ref, it.cor_grade, it.tamanho, it.qtd, org?.numero_erp || null, org?.cliente_nome || null)
    );
  }
  // Remove os pedidos individuais (viraram a OP consolidada).
  for (const id of ids) {
    stmts.push(c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id = ?").bind(id));
    stmts.push(c.env.DB.prepare("DELETE FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')").bind(id));
  }
  await c.env.DB.batch(stmts);
  await posProcessar(c.env, novoId, { id: g.u.id, nome: g.u.nome });
  return c.json({ ok: true, pedido_id: novoId, codigo_pai: codigoPai, pedidos: peds.length });
});

// ── ESTOQUE DE PRODUTOS (espelho do ERP) ────────────────────────────────────────
// A ponte manda o saldo (lido do Firebird). Guardamos e só EXIBIMOS. Read-only aqui.
// body: { itens: [{ produto, ref, cor, tamanho, saldo, unidade }], full?: boolean }
integracao.post("/estoque", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  type EstoqueIn = { produto?: string; ref?: string; cor?: string; tamanho?: string; saldo?: number | string; unidade?: string };
  const b = await c.req.json<{ itens?: EstoqueIn[]; full?: boolean }>().catch(() => ({} as { itens?: EstoqueIn[]; full?: boolean }));
  const itens: EstoqueIn[] = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const norm = (s: unknown) => String(s ?? "").trim();
  const chaveDe = (ref: string, cor: string, tam: string) => `${ref}|${cor}|${tam}`.toLowerCase();
  const stmts = itens.map((it) => {
    const ref = norm(it.ref), cor = norm(it.cor), tam = norm(it.tamanho);
    const chave = chaveDe(ref, cor, tam);
    const saldo = Number(it.saldo) || 0;
    return c.env.DB.prepare(
      `INSERT INTO erp_estoque (chave, produto, ref, cor, tamanho, saldo, unidade, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(chave) DO UPDATE SET produto=excluded.produto, ref=excluded.ref, cor=excluded.cor,
         tamanho=excluded.tamanho, saldo=excluded.saldo, unidade=excluded.unidade, atualizado_em=datetime('now')`
    ).bind(chave, norm(it.produto) || null, ref || null, cor || null, tam || null, saldo, norm(it.unidade) || null);
  });
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, n: stmts.length });
});

// LÊ o estoque espelhado (pra exibir). Filtro opcional ?ref= / ?busca=.
integracao.get("/estoque", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const ref = (c.req.query("ref") || "").trim();
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  let sql = "SELECT produto, ref, cor, tamanho, saldo, unidade, atualizado_em FROM erp_estoque";
  const cond: string[] = [], binds: unknown[] = [];
  if (ref) { cond.push("ref = ?"); binds.push(ref); }
  if (busca) { cond.push("(lower(produto) LIKE ? OR lower(ref) LIKE ?)"); binds.push(`%${busca}%`, `%${busca}%`); }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY produto, cor, tamanho LIMIT 1000";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

// ── DIAGNÓSTICO: a ponte manda a estrutura do banco do Syntech (uma vez) ───────
// Guardo cru na config (chave erp_diag) pra inspecionar os nomes das colunas de
// preço por tamanho. POST protegido por token (vem da ponte); GET pede sessão.
integracao.post("/diag", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 900000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
// Diagnóstico LEVE das procedures APP_* (Fase 4). Guardado numa chave própria pra não
// colidir com o diagnóstico grande (erp_diag). Lido via GET /diag?pedido=procs.
integracao.post("/diag-procs", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag_procs', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 200000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
// Fonte (código-fonte) de uma procedure do Syntech — pra achar a linha do erro de conversão.
integracao.post("/diag-src", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag_src', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 60000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
integracao.get("/diag", async (c) => {
  // Acesso TEMPORÁRIO (capability) só pra ler a fonte da procedure no diagnóstico da Fase 4.
  // String longa e aleatória = difícil de adivinhar; conteúdo é SQL interno (não é segredo).
  // Removido assim que eu achar a linha do erro de conversão.
  if (c.req.query("pedido") === "src" && c.req.query("cap") === "d14fix-7a3f9c21b8e04d6f") {
    const sr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag_src'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (!sr || !sr.valor) return new Response("(ainda sem fonte — espere a ponte rodar)", { status: 200 });
    let corpo = sr.valor;
    try { const j = JSON.parse(sr.valor) as { src?: string; nome?: string; versao?: string }; corpo = `-- ${j.nome || ""} (ponte ${j.versao || ""}, ${sr.atualizado_em || ""})\n\n${j.src || ""}`; } catch { /* usa cru */ }
    return new Response(corpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // Aceita sessão (UI) OU o token de integração (pra eu, dev, inspecionar sem login).
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  const temToken = !!esperado && recebido === esperado;
  if (!temToken) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  // ?pedido=src → código-fonte da APP_PEDIDO_INSERT_V2 (texto puro, pra ler a linha do erro).
  if (c.req.query("pedido") === "src") {
    const sr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag_src'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (!sr || !sr.valor) return c.json({ pronto: false, aviso: "A ponte ainda não mandou a fonte da procedure. Espere a ponte rodar (~2 min)." });
    let corpo = sr.valor;
    try { const j = JSON.parse(sr.valor) as { src?: string; nome?: string; versao?: string }; corpo = `-- ${j.nome || ""} (ponte ${j.versao || ""}, ${sr.atualizado_em || ""})\n\n${j.src || ""}`; } catch { /* usa cru */ }
    return new Response(corpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // ?pedido=procs → confirmação LEVE das procedures APP_* (Fase 4). Lê do diagnóstico
  // minúsculo dedicado (erp_diag_procs); se não houver, cai de volta no erp_diag.pedido.
  if (c.req.query("pedido") === "procs") {
    type ProcSrc = {
      quando?: string;
      procedures?: Record<string, { campo: string; ordem: number; dir: string; tipo: number; tam: number }[]>;
      triggers?: Record<string, { nome: string; tipo: number; seq: number; inativo: boolean }[]>;
      erros?: string[];
    };
    let src: ProcSrc | null = null;
    let quando: string | null = null;
    const pr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag_procs'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (pr && pr.valor) { try { src = JSON.parse(pr.valor) as ProcSrc; quando = (src.quando || pr.atualizado_em) ?? null; } catch { /* ignora */ } }
    if (!src || !src.procedures) {
      const dr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag'").first<{ valor: string | null; atualizado_em: string | null }>();
      if (dr && dr.valor) { try { const dd = JSON.parse(dr.valor) as { pedido?: ProcSrc; quando?: string }; if (dd.pedido && dd.pedido.procedures) { src = dd.pedido; quando = (dd.quando || dr.atualizado_em) ?? null; } } catch { /* ignora */ } }
    }
    if (!src || !src.procedures) return c.json({ pronto: false, aviso: "A ponte ainda não confirmou as procedures. Espere a ponte rodar (~2 min)." });
    const procedures: Record<string, string> = {};
    for (const nome of Object.keys(src.procedures || {})) {
      const ins = (src.procedures[nome] || []).filter((x) => x.dir === "in").map((x) => x.campo);
      const outs = (src.procedures[nome] || []).filter((x) => x.dir === "out").map((x) => x.campo);
      procedures[nome] = `(${ins.join(", ")})` + (outs.length ? ` → ${outs.join(", ")}` : "");
    }
    const triggers: Record<string, string[]> = {};
    for (const t of Object.keys(src.triggers || {})) triggers[t] = (src.triggers![t] || []).map((x) => `${x.nome}${x.inativo ? " (inativo)" : ""}`);
    return c.json({ pronto: true, quando, procedures, procedures_detalhe: src.procedures || {}, triggers, erros: src.erros || [] });
  }
  const row = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag'").first<{ valor: string | null; atualizado_em: string | null }>();
  if (!row || !row.valor) return c.json({ pronto: false, aviso: "A ponte ainda não mandou o diagnóstico. Espere a ponte rodar (~2 min)." });
  // ?raw=1 devolve o JSON completo; senão um resumo focado em preços/tamanhos.
  if (c.req.query("raw") === "1") return new Response(row.valor, { headers: { "Content-Type": "application/json; charset=utf-8" } });
  let d: { tabelas?: { nome: string; colunas: string[] }[]; amostras?: Record<string, unknown[]>; erros?: string[]; quando?: string; pedido?: unknown } = {};
  try { d = JSON.parse(row.valor); } catch { return c.json({ pronto: true, erro: "json_invalido", quando: row.atualizado_em }); }
  // ?pedido=1 → resumo ENXUTO da estrutura de escrita de pedido (Fase 4):
  // só os campos obrigatórios, geradores com valor, e a amostra de um pedido real.
  // ?pedido=full → o objeto completo (grande).
  if (c.req.query("pedido")) {
    const p = (d.pedido || {}) as {
      colunas?: Record<string, { campo: string; obrigatorio: boolean; tipo: number; tam: number }[]>;
      geradores?: { nome: string; valor: number | null }[];
      amostra?: { pedido?: Record<string, unknown>; itens?: unknown[]; cores?: unknown[] };
      outras?: Record<string, unknown[]>;
      procedures?: Record<string, { campo: string; ordem: number; dir: string; tipo: number; tam: number }[]>;
      triggers?: Record<string, { nome: string; tipo: number; seq: number; inativo: boolean; fonte: string | null }[]>;
      erros?: string[];
    };
    if (c.req.query("pedido") === "full") return c.json({ pronto: true, quando: d.quando || row.atualizado_em, pedido: d.pedido || null });
    const obrigatorios: Record<string, string[]> = {};
    for (const t of Object.keys(p.colunas || {})) obrigatorios[t] = (p.colunas![t] || []).filter((x) => x.obrigatorio).map((x) => x.campo);
    const outras_qtd: Record<string, number> = {};
    for (const t of Object.keys(p.outras || {})) outras_qtd[t] = Array.isArray(p.outras![t]) ? p.outras![t].length : 0;
    return c.json({
      pronto: true, quando: d.quando || row.atualizado_em,
      obrigatorios,
      geradores_com_valor: (p.geradores || []).filter((g) => g.valor != null),
      amostra: p.amostra || null,
      outras_qtd,
      erros: p.erros || [],
    });
  }
  const tabelas = Array.isArray(d.tabelas) ? d.tabelas : [];
  const tamProd = tabelas.find((t) => t.nome === "TAMANHO_PROD");
  const produtos = tabelas.find((t) => t.nome === "PRODUTOS");
  return c.json({
    pronto: true,
    quando: d.quando || row.atualizado_em,
    total_tabelas: tabelas.length,
    TAMANHO_PROD_colunas: tamProd?.colunas || null,
    PRODUTOS_colunas: produtos?.colunas || null,
    amostra_TAMANHO_PROD: d.amostras?.["TAMANHO_PROD"] || null,
    amostra_PRODUTOS: d.amostras?.["PRODUTOS"] || null,
    outras_amostras: Object.keys(d.amostras || {}).filter((k) => k !== "TAMANHO_PROD" && k !== "PRODUTOS"),
    erros: d.erros || [],
  });
});

// ── CONFERE os preços por tamanho que vieram do ERP ────────────────────────────
// Mostra uma amostra legível (ref, nome, cada tamanho com atacado/varejo) pra
// confirmar que o preço por tamanho chegou. Token OU sessão.
integracao.get("/catalogo-precos", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  if (!(esperado && recebido === esperado)) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  const { results } = await c.env.DB.prepare(
    "SELECT ref, nome, tamanhos FROM erp_produtos WHERE COALESCE(inativo,0)=0 ORDER BY nome LIMIT 25"
  ).all<{ ref: string; nome: string | null; tamanhos: string | null }>();
  type T = { medida?: string; tamanho?: string; atacado?: number; varejo?: number };
  const amostra = (results || []).map((p) => {
    let ts: unknown[] = []; try { const a = JSON.parse(p.tamanhos || "[]"); ts = Array.isArray(a) ? a : []; } catch { /* vazio */ }
    const tamanhos = ts.map((t) => typeof t === "string"
      ? { medida: t, atacado: null, varejo: null }
      : { medida: (t as T).medida || (t as T).tamanho || "", atacado: (t as T).atacado ?? null, varejo: (t as T).varejo ?? null });
    return { ref: p.ref, nome: p.nome, tamanhos };
  });
  const com_preco = amostra.filter((p) => p.tamanhos.some((t) => Number(t.atacado) > 0)).length;
  return c.json({ total_produtos: results?.length || 0, com_preco, aviso: com_preco ? "Preços por tamanho OK ✓" : "Ainda sem preço por tamanho — espere a ponte re-puxar (~4 min).", amostra });
});

// ── GERADOR do catálogo no FORMATO DO SITE (prévia) ──────────────────────────────
// Transforma os produtos do ERP (erp_produtos + erp_estoque) no formato que o site
// (Firebase catalogo/main) espera: banco_cores, banco_tamanhos, produtos, estoque.
// É só PRÉVIA — não grava no site. Serve pra validar o formato antes de ligar.
function slugId(s: string, usados: Set<string>): string {
  let base = String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  let id = base, i = 2;
  while (usados.has(id)) { id = `${base}-${i++}`; }
  usados.add(id);
  return id;
}
export async function gerarCatalogoSite(env: Env): Promise<{
  banco_cores: { id: string; nome: string; hex: string; categoria: string; foto: string }[];
  banco_tamanhos: { id: string; nome: string; medida: string }[];
  produtos: unknown[];
  estoque: { atualizadoMs: number; itens: Record<string, Record<string, Record<string, number>>> };
  _resumo: { produtos: number; cores: number; tamanhos: number };
}> {
  const cfg = async (k: string) => ((await env.DB.prepare("SELECT valor FROM config WHERE chave=?").bind(k).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
  const fotosBase = ((await cfg("erp_fotos_base")) || "https://bigtricot.syntechsistemas.com").replace(/\/+$/, "");
  const markupNorte = Number(await cfg("catalogo_markup_norte_pct")) || 10;
  // Qual preço o catálogo mostra: "atacado" (lojista, padrão) ou "varejo" (consumidor).
  // Os dois vêm por tamanho do ERP (TAMANHO_PROD.PRECO_VENDA / PRECO_VENDA_LJ).
  const campoPreco = (await cfg("catalogo_preco")) === "varejo" ? "varejo" : "atacado";

  const { results: prods } = await env.DB.prepare(
    "SELECT ref, nome, classe, grupo, preco_varejo, preco_atacado, estoque_geral, cores, tamanhos FROM erp_produtos WHERE COALESCE(inativo,0)=0 ORDER BY nome"
  ).all<{ ref: string; nome: string | null; classe: string | null; grupo: string | null; preco_varejo: number | null; preco_atacado: number | null; estoque_geral: number | null; cores: string | null; tamanhos: string | null }>();

  const idsCor = new Set<string>(), idsTam = new Set<string>();
  const corPorChave = new Map<string, { id: string; nome: string; hex: string; categoria: string; foto: string }>();
  const corIdPorNome = new Map<string, string>();
  const tamPorMedida = new Map<string, { id: string; nome: string; medida: string }>();
  const idCor = (nome: string, hex: string, categoria: string) => {
    const chave = (nome || "").toLowerCase() + "|" + (hex || "").toLowerCase();
    let c = corPorChave.get(chave);
    if (!c) { c = { id: slugId(nome || hex || "cor", idsCor), nome: nome || "", hex: hex || "", categoria: categoria || "", foto: "" }; corPorChave.set(chave, c); if (nome) corIdPorNome.set(nome.toLowerCase(), c.id); }
    return c.id;
  };
  const idTam = (medida: string) => {
    const m = String(medida || "").trim();
    let t = tamPorMedida.get(m.toLowerCase());
    if (!t) { t = { id: slugId(m || "tam", idsTam), nome: m, medida: m }; tamPorMedida.set(m.toLowerCase(), t); }
    return t.id;
  };

  // O código do ERP diz o TIPO pela letra final: 8019A=Almofada, 8019C=Capa,
  // 8019P=Peseira/Manta. O número base (8019) é o MODELO. No site a gente mostra
  // UM produto por modelo (ex.: "GENEBRA") e, DENTRO dele, um grupo por tipo
  // (Almofada/Capa/Peseira-Manta), cada grupo com seus tamanhos. As cores ficam
  // no nível do produto (união das variações).
  // Títulos e ordem das seções iguais ao site: Mantas e Peseiras, Capas, Almofadas.
  const TIPO_NOME: Record<string, string> = { P: "Mantas e Peseiras", C: "Capas", A: "Almofadas", M: "Mantas", K: "Kits" };
  const TIPO_ORDEM: Record<string, number> = { P: 0, C: 1, A: 2, M: 3, K: 4 };
  const baseCod = (ref: string) => (ref || "").replace(/[A-Za-z]+$/, "") || ref || "";
  const tipoLetra = (ref: string) => { const m = (ref || "").match(/([A-Za-z])$/); return m ? m[1].toUpperCase() : ""; };
  const nomeModelo = (nome: string) => (nome || "").replace(/^\s*(ALMOFADAS?|CAPAS?|PESEIRAS?|MANTAS?|KITS?|PESEIRA E MANTA)\s+/i, "").trim() || nome || "";

  // Mapeia o GRUPO do Syntech para a SEÇÃO do site. O site usa o campo "linha"
  // (polisoft/soft/natal/padrao) + a flag "pronta_entrega". Edição Limitada é
  // uma seção separada (edicao_limitada) — por ora cai em padrao, marcada.
  const secaoDoGrupo = (grupo: string): { linha: string; pronta_entrega: boolean; edicao_limitada: boolean } => {
    const g = (grupo || "").toLowerCase();
    if (g.includes("polisoft")) return { linha: "polisoft", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("soft")) return { linha: "soft", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("natal")) return { linha: "natal", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("pronta")) return { linha: "padrao", pronta_entrega: true, edicao_limitada: false };
    if (g.includes("limitad") || g.includes("edic")) return { linha: "padrao", pronta_entrega: false, edicao_limitada: true };
    return { linha: "padrao", pronta_entrega: false, edicao_limitada: false };
  };

  type Linha = { id: string; cod: string; id_tamanho: string; sul: number; norte: number };
  type Variacao = { ref: string; base: string; letra: string; nomeModelo: string; grupo: string; foto: string; estoque: number; cores: { id_cor: string; oculta: boolean }[]; linhas: Linha[] };
  // tamanho pode vir como texto antigo ("45X45") ou objeto novo com preço por tamanho.
  type TamIn = { medida: string; tamanho?: string; atacado?: number; varejo?: number };
  const normTam = (t: unknown): TamIn => (typeof t === "string"
    ? { medida: t }
    : { medida: String((t as TamIn)?.medida || (t as TamIn)?.tamanho || "").trim(), tamanho: (t as TamIn)?.tamanho, atacado: Number((t as TamIn)?.atacado) || 0, varejo: Number((t as TamIn)?.varejo) || 0 });
  const variacoes: Variacao[] = prods.map((p) => {
    const cores = ((): { nome?: string; hex?: string }[] => { try { return JSON.parse(p.cores || "[]"); } catch { return []; } })();
    const tamanhos = ((): TamIn[] => { try { const a = JSON.parse(p.tamanhos || "[]"); return (Array.isArray(a) ? a : []).map(normTam).filter((x) => x.medida); } catch { return []; } })();
    // preço de fallback (nível do produto) — usado só se o tamanho não trouxer preço.
    const fb = Number(campoPreco === "varejo" ? p.preco_varejo : p.preco_atacado) || 0;
    const prodCores = cores.map((co) => ({ id_cor: idCor(co.nome || "", co.hex || "", p.grupo || ""), oculta: false }));
    const linhas = (tamanhos.length ? tamanhos : [{ medida: "" } as TamIn]).map((t) => {
      const porTam = Number(campoPreco === "varejo" ? t.varejo : t.atacado) || 0;
      const base = porTam || fb; // preço por tamanho; cai no do produto se faltar
      const sul = Math.round(base * 100) / 100;
      const norte = Math.round(base * (1 + markupNorte / 100) * 100) / 100;
      return { id: `${p.ref}-${idTam(t.medida)}`, cod: p.ref, id_tamanho: idTam(t.medida), sul, norte };
    });
    return { ref: p.ref, base: baseCod(p.ref), letra: tipoLetra(p.ref), nomeModelo: nomeModelo(p.nome || p.ref), grupo: p.grupo || "", foto: p.classe && p.ref ? `${fotosBase}/${encodeURIComponent(p.classe)}/${encodeURIComponent(p.ref)}.jpg` : "", estoque: Number(p.estoque_geral) || 0, cores: prodCores, linhas };
  });

  // agrupa as variações (A/C/P) por modelo (código base)
  const porModelo = new Map<string, { base: string; nome: string; grupo: string; foto: string; cores: Map<string, { id_cor: string; oculta: boolean }>; vars: Variacao[] }>();
  for (const v of variacoes) {
    let g = porModelo.get(v.base);
    if (!g) { g = { base: v.base, nome: v.nomeModelo, grupo: v.grupo, foto: "", cores: new Map(), vars: [] }; porModelo.set(v.base, g); }
    g.vars.push(v);
    if (!g.grupo && v.grupo) g.grupo = v.grupo;
    if (v.nomeModelo && (!g.nome || v.nomeModelo.length < g.nome.length)) g.nome = v.nomeModelo;
    if (!g.foto && v.foto) g.foto = v.foto;
    for (const c of v.cores) if (!g.cores.has(c.id_cor)) g.cores.set(c.id_cor, c);
  }

  const produtos = [...porModelo.values()].map((g) => {
    const vars = g.vars.slice().sort((a, b) => (TIPO_ORDEM[a.letra] ?? 9) - (TIPO_ORDEM[b.letra] ?? 9) || a.ref.localeCompare(b.ref));
    const sec = secaoDoGrupo(g.grupo);
    return {
      id: g.base,
      nome: g.nome,
      linha: sec.linha,
      pronta_entrega: sec.pronta_entrega,
      _edicao_limitada: sec.edicao_limitada,
      composicao: "100% Poliéster",
      tipo: "avulso",
      lancamento: false,
      foto: g.foto,
      video: "",
      // blocos: textos descritivos por produto (o site faz Object.keys(blocos)).
      // Vazio aqui — pode vir a ser preenchido depois.
      blocos: {},
      estoque_geral: vars.reduce((s, v) => s + (Number(v.estoque) || 0), 0),
      cores: [...g.cores.values()],
      grupos: vars.map((v) => ({ id: `${g.base}-${v.letra || "x"}`, titulo: TIPO_NOME[v.letra] || "", ref: v.ref, estoque: v.estoque, linhas: v.linhas })),
    };
  });

  // estoque: itens[ref][medida][id_cor] = saldo (casa a cor pelo nome)
  const { results: est } = await env.DB.prepare("SELECT ref, cor, tamanho, saldo FROM erp_estoque").all<{ ref: string | null; cor: string | null; tamanho: string | null; saldo: number }>().catch(() => ({ results: [] as { ref: string | null; cor: string | null; tamanho: string | null; saldo: number }[] }));
  const itens: Record<string, Record<string, Record<string, number>>> = {};
  for (const e of est) {
    const ref = (e.ref || "").trim(); if (!ref) continue;
    const med = (e.tamanho || "").trim() || "-";
    const cid = corIdPorNome.get((e.cor || "").toLowerCase()) || slugId(e.cor || "cor", idsCor);
    itens[ref] = itens[ref] || {};
    itens[ref][med] = itens[ref][med] || {};
    itens[ref][med][cid] = Number(e.saldo) || 0;
  }

  return {
    banco_cores: [...corPorChave.values()],
    banco_tamanhos: [...tamPorMedida.values()],
    produtos,
    estoque: { atualizadoMs: Date.now(), itens },
    _resumo: { produtos: produtos.length, cores: corPorChave.size, tamanhos: tamPorMedida.size },
  };
}

// Monta o DOCUMENTO COMPLETO do catálogo no formato do site, 100% do ERP.
// Usa só o LAYOUT/CONFIG do catálogo atual (aberturas, linhas_ocultas, reajustes,
// varejo, _bancoTamV3, region, cor_categorias, capa, representantes, pedido_config,
// contato…) e troca TODO o conteúdo de produto pelo ERP. Separa a Edição Limitada
// na seção própria. IMPORTANTE: o site NÃO mostra produto SEM FOTO — por isso
// casamos cada produto do ERP com a FOTO do catálogo atual pelo NOME do modelo
// (as fotos continuam no Cloudinary; só o preço/estrutura vem do Syntech).
const normNome = (s: string) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
export async function gerarDocSite(env: Env): Promise<Record<string, unknown>> {
  const cat = await gerarCatalogoSite(env);
  type Prod = { nome?: string; foto?: string; fotoDescricao?: string; blocos?: Record<string, unknown>; _edicao_limitada?: boolean;[k: string]: unknown };
  const prods = (cat.produtos as Prod[]) || [];
  let base: Record<string, unknown> = {};
  try { base = (await lerDocumento(env, "catalogo/main")) || {}; } catch { base = {}; }
  const baseEL = (base.edicao_limitada && typeof base.edicao_limitada === "object") ? (base.edicao_limitada as Record<string, unknown>) : {};

  // Mapa NOME-do-modelo → foto/vídeo/descrição/blocos, do catálogo atual (produtos + EL).
  type FotoInfo = { foto: string; video: string; fotoDescricao: string; blocos: Record<string, unknown> };
  const fotoMap = new Map<string, FotoInfo>();
  const baseProdAll = [
    ...(Array.isArray(base.produtos) ? (base.produtos as Prod[]) : []),
    ...(Array.isArray(baseEL.produtos) ? (baseEL.produtos as Prod[]) : []),
  ];
  for (const p of baseProdAll) {
    if (p && p.foto) {
      const k = normNome(p.nome || "");
      if (k && !fotoMap.has(k)) fotoMap.set(k, { foto: p.foto, video: String((p as { video?: unknown }).video || ""), fotoDescricao: p.fotoDescricao || "", blocos: (p.blocos && typeof p.blocos === "object") ? p.blocos : {} });
    }
  }
  const aber = (base.aberturas && typeof base.aberturas === "object") ? (base.aberturas as Record<string, { foto?: string }>) : {};
  const placeholder = aber.padrao?.foto || ((base.capa as { foto?: string } | undefined)?.foto) || "";
  for (const p of prods) {
    const m = fotoMap.get(normNome(p.nome || ""));
    p.foto = m?.foto || p.foto || placeholder;
    p.video = m?.video || "";
    p.fotoDescricao = m?.fotoDescricao || "";
    if (m?.blocos && Object.keys(m.blocos).length) p.blocos = m.blocos;
  }

  // Foto do TECIDO por cor: casa pelo NOME da cor com o banco_cores do catálogo atual.
  type CorBase = { nome?: string; foto?: string };
  const corFotoMap = new Map<string, string>();
  for (const c of (Array.isArray(base.banco_cores) ? (base.banco_cores as CorBase[]) : [])) {
    const k = normNome(c.nome || "");
    if (k && c.foto && !corFotoMap.has(k)) corFotoMap.set(k, c.foto);
  }
  for (const c of (Array.isArray(cat.banco_cores) ? (cat.banco_cores as { nome?: string; foto?: string }[]) : [])) {
    const f = corFotoMap.get(normNome(c.nome || ""));
    if (f) c.foto = f;
  }

  const normais: Prod[] = [], limitada: Prod[] = [];
  for (const p of prods) { (p._edicao_limitada ? limitada : normais).push(p); }
  // Edição Limitada: SÓ o que vier do Syntech (grupo "edição limitada"). Não
  // herda os produtos do catálogo antigo — monta explícito e esconde se vazio.
  const edicaoLimitada = {
    produtos: limitada,
    oculta: limitada.length === 0,
    abertura: (baseEL as { abertura?: unknown }).abertura ?? null,
    ordenar_por: (baseEL as { ordenar_por?: unknown }).ordenar_por ?? null,
    categorias: [],
  };
  return {
    ...base, // mantém TODO o layout/config do site
    produtos: normais,
    edicao_limitada: edicaoLimitada,
    estoque_el: {}, // estoque da EL antiga não se aplica
    banco_cores: cat.banco_cores,
    banco_tamanhos: cat.banco_tamanhos,
    estoque: cat.estoque,
    atualizado_em: Date.now(),
    _origem_erp: true,
    _resumo: {
      ...cat._resumo,
      normais: normais.length,
      edicao_limitada: limitada.length,
      produtos_com_foto: prods.filter((p) => p.foto && (!placeholder || p.foto !== placeholder)).length,
    },
  };
}

// Prévia (JSON) do catálogo gerado do ERP no formato do site. Não grava no site.
integracao.get("/catalogo-site", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  return c.json(await gerarCatalogoSite(c.env));
});

// ── LOJA B2B (catálogo NOVO, feito do zero) ──────────────────────────────────
// Página própria (site/loja.html), 100% dos dados do Syntech: produtos, preços
// por tamanho, estoque, cores, seções. As fotos vêm casadas do Cloudinary (o
// Syntech guarda foto no servidor interno, que o cliente não acessa pela net).
// Aberta por enquanto (prévia). Login/carrinho/pedido vêm nas próximas fases.
integracao.get("/loja", async (c) => {
  let dados: { produtos: unknown[]; banco_cores: unknown; banco_tamanhos: unknown; estoque: unknown };
  try {
    const doc = await gerarDocSite(c.env);
    const normais = Array.isArray(doc.produtos) ? (doc.produtos as unknown[]) : [];
    const elDoc = doc.edicao_limitada as { produtos?: unknown[] } | undefined;
    const limitada = elDoc && Array.isArray(elDoc.produtos) ? elDoc.produtos : [];
    dados = { produtos: [...normais, ...limitada], banco_cores: doc.banco_cores, banco_tamanhos: doc.banco_tamanhos, estoque: doc.estoque };
  } catch (e) {
    return new Response("Não consegui montar a loja:\n\n" + (e as Error).message, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const json = JSON.stringify(dados).split("<").join("\\u003c").split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
  const inject = `<script>window.__DADOS__=${json};</script>`;
  const html = SITE_LOJA_HTML.includes("</head>") ? SITE_LOJA_HTML.replace("</head>", inject + "</head>") : inject + SITE_LOJA_HTML;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 4 — Pedido da loja B2B → Syntech (via ponte + procedures APP_*)
// ════════════════════════════════════════════════════════════════════════════
const tokenOk = (c: { env: Env; req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  return !!esperado && recebido === esperado;
};
const lerCfg = async (env: Env, k: string) => ((await env.DB.prepare("SELECT valor FROM config WHERE chave=?").bind(k).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
// Modo de envio da loja → ERP: 'off' (nada), 'teste' (só os liberados), 'on' (todos).
const modoEnvioLoja = async (env: Env) => { const m = await lerCfg(env, "loja_erp_envio"); return m === "on" || m === "off" ? m : "teste"; };

// A PONTE busca aqui os pedidos de loja prontos pra gravar no Syntech (auth token).
integracao.get("/pedidos-para-erp", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const modo = await modoEnvioLoja(c.env);
  if (modo === "off") return c.json({ modo, pedidos: [] });
  const filtroLiberado = modo === "on" ? "" : " AND COALESCE(p.erp_liberado,0) = 1";
  const { results: peds } = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.valor_total, p.data_pedido, cl.codigo_erp AS cod_cli
       FROM pedidos p LEFT JOIN clientes cl ON cl.id = p.cliente_id
      WHERE p.canal='loja_b2b' AND COALESCE(p.erp_sync_status,'pendente')='pendente'${filtroLiberado}
      ORDER BY p.created_at LIMIT 20`
  ).all<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; valor_total: number | null; data_pedido: string | null; cod_cli: string | null }>();
  const pedidos = [];
  for (const p of peds) {
    const { results: itens } = await c.env.DB.prepare(
      "SELECT ref, erp_tamanho, cod_cor, qtd, valor_unit, produto, cor_grade FROM pedido_itens WHERE pedido_id = ? ORDER BY rowid"
    ).bind(p.id).all<{ ref: string; erp_tamanho: string | null; cod_cor: number | null; qtd: number; valor_unit: number | null; produto: string | null; cor_grade: string | null }>();
    pedidos.push({ id: p.id, cliente_nome: p.cliente_nome, cnpj: p.cliente_cnpj, cod_cli: p.cod_cli, valor_total: p.valor_total, data: p.data_pedido, itens });
  }
  return c.json({ modo, pedidos });
});

// A PONTE confirma que gravou no ERP (auth token): guarda o NUMERO do Syntech e,
// se descobriu o COD_CLI pelo CNPJ, guarda no cliente (cache pros próximos).
integracao.post("/pedido-erp-gravado", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; numero_erp?: number | string; cod_cli?: number | string };
  const id = String(b.id || "").trim();
  const numero = Math.trunc(Number(b.numero_erp) || 0);
  if (!id || !numero) return c.json({ error: "faltam_dados" }, 400);
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='enviado', erp_numero=?, erp_sync_em=datetime('now'), erp_sync_erro=NULL WHERE id=? AND canal='loja_b2b'").bind(numero, id),
  ];
  const cod = String(b.cod_cli || "").trim();
  if (cod) stmts.push(c.env.DB.prepare("UPDATE clientes SET codigo_erp=? WHERE id=(SELECT cliente_id FROM pedidos WHERE id=?) AND COALESCE(codigo_erp,'')=''").bind(cod, id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// A PONTE avisa que deu erro ao gravar (auth token): marca o pedido como 'erro'.
integracao.post("/pedido-erp-erro", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; erro?: string };
  const id = String(b.id || "").trim();
  if (!id) return c.json({ error: "faltam_dados" }, 400);
  await c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='erro', erp_sync_erro=?, erp_sync_em=datetime('now') WHERE id=? AND canal='loja_b2b'")
    .bind(String(b.erro || "erro desconhecido").slice(0, 500), id).run();
  return c.json({ ok: true });
});

// ── ADMIN (gestor): tela "Pedidos da Loja" ──────────────────────────────────
integracao.get("/loja-pedidos", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const modo = await modoEnvioLoja(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.valor_total, p.data_pedido, p.created_at,
            COALESCE(p.erp_sync_status,'pendente') AS erp_sync_status, COALESCE(p.erp_liberado,0) AS erp_liberado,
            p.erp_numero, p.erp_sync_erro,
            (SELECT COUNT(*) FROM pedido_itens WHERE pedido_id=p.id) AS itens,
            (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens WHERE pedido_id=p.id) AS pecas
       FROM pedidos p WHERE p.canal='loja_b2b' ORDER BY p.created_at DESC LIMIT 200`
  ).all();
  return c.json({ modo, pedidos: results });
});
integracao.get("/loja-pedidos/:id", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare(
    `SELECT id, cliente_nome, cliente_cnpj, valor_total, data_pedido, created_at,
            COALESCE(erp_sync_status,'pendente') AS erp_sync_status, COALESCE(erp_liberado,0) AS erp_liberado, erp_numero, erp_sync_erro
       FROM pedidos WHERE id=? AND canal='loja_b2b'`
  ).bind(id).first();
  if (!ped) return c.json({ error: "nao_encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id=? ORDER BY rowid"
  ).bind(id).all();
  return c.json({ pedido: ped, itens });
});
integracao.post("/loja-pedidos/:id/liberar", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE pedidos SET erp_liberado=1 WHERE id=? AND canal='loja_b2b' AND COALESCE(erp_sync_status,'pendente')='pendente'").bind(id).run();
  return c.json({ ok: true });
});
integracao.post("/loja-pedidos/:id/reenviar", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  // volta pra 'pendente' (com liberado) pra ponte tentar de novo — só se deu erro.
  await c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='pendente', erp_liberado=1, erp_sync_erro=NULL WHERE id=? AND canal='loja_b2b' AND erp_sync_status='erro'").bind(id).run();
  return c.json({ ok: true });
});
integracao.post("/loja-config", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const b = await c.req.json().catch(() => ({})) as { modo?: string };
  const modo = b.modo === "on" || b.modo === "off" || b.modo === "teste" ? b.modo : null;
  if (!modo) return c.json({ error: "modo_invalido" }, 400);
  await c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('loja_erp_envio', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(modo).run();
  return c.json({ ok: true, modo });
});

// TESTE DE CONEXÃO com o Firebase do site. Lê catalogo/main e devolve os campos
// do topo (sem expor conteúdo sensível) — serve pra validar a chave FIREBASE_SA.
integracao.get("/site/firebase-check", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  try {
    const main = await lerDocumento(c.env, "catalogo/main");
    if (!main) return c.json({ ok: true, existe_main: false });
    const prods = Array.isArray((main as { produtos?: unknown[] }).produtos) ? (main as { produtos: unknown[] }).produtos.length : 0;
    return c.json({ ok: true, existe_main: true, campos: Object.keys(main), produtos_no_main: prods });
  } catch (e) {
    return c.json({ ok: false, erro: (e as Error).message }, 200);
  }
});

// INSPECIONA a estrutura do catálogo real do site (catalogo/main) — só leitura.
// Mostra os campos do topo, nº de produtos (inclusive edição limitada) e uma
// amostra com os códigos/preços por tamanho (cod, id_tamanho, sul, norte). Serve
// pra eu entender como casar os preços do ERP sem mudar o layout. Token ou sessão.
integracao.get("/site/inspecionar", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  if (!(esperado && recebido === esperado)) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  const alvo = c.req.query("alvo") === "teste" ? "teste" : "main";
  try {
    const doc = (await lerDocumento(c.env, "catalogo/" + alvo)) as Record<string, unknown> | null;
    if (!doc) return c.json({ existe: false, alvo });
    type Linha = { cod?: unknown; id_tamanho?: unknown; sul?: unknown; norte?: unknown };
    type Grupo = { titulo?: unknown; linhas?: Linha[] };
    type Prod = { id?: unknown; nome?: unknown; linha?: unknown; pronta_entrega?: unknown; grupos?: Grupo[] };
    const prods = Array.isArray(doc.produtos) ? (doc.produtos as Prod[]) : [];
    const elRaw = doc.edicao_limitada as { produtos?: unknown } | undefined;
    const el = elRaw && Array.isArray(elRaw.produtos) ? (elRaw.produtos as Prod[]) : [];
    const amostraProd = (p: Prod) => ({
      id: p?.id, nome: p?.nome, linha: p?.linha, pronta_entrega: p?.pronta_entrega,
      grupos: Array.isArray(p?.grupos) ? p.grupos.map((g) => ({
        titulo: g?.titulo,
        linhas: Array.isArray(g?.linhas) ? g.linhas.slice(0, 3).map((l) => ({ cod: l?.cod, id_tamanho: l?.id_tamanho, sul: l?.sul, norte: l?.norte })) : [],
      })) : [],
    });
    return c.json({
      existe: true, alvo, _origem_erp: doc._origem_erp === true,
      campos_topo: Object.keys(doc),
      total_produtos: prods.length,
      total_edicao_limitada: el.length,
      amostra_produtos: prods.slice(0, 3).map(amostraProd),
      amostra_edicao_limitada: el.slice(0, 2).map(amostraProd),
      banco_tamanhos: Array.isArray(doc.banco_tamanhos) ? (doc.banco_tamanhos as unknown[]).slice(0, 12) : null,
    });
  } catch (e) { return c.json({ erro: (e as Error).message }, 200); }
});

// PUBLICA o catálogo do ERP no Firebase do site. alvo=teste (padrão, cliente não
// vê) ou alvo=main (vai pro ar). Lê o catalogo/main atual pra preservar os campos
// editoriais (capa, representantes, textos…) e só troca produtos/cores/tamanhos.
integracao.post("/site/publicar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const alvo = c.req.query("alvo") === "main" ? "main" : "teste";
  try {
    const doc = await gerarDocSite(c.env);
    await gravarDocumento(c.env, "catalogo/" + alvo, doc);
    return c.json({ ok: true, alvo, resumo: doc._resumo });
  } catch (e) {
    return c.json({ ok: false, alvo, erro: (e as Error).message }, 200);
  }
});

// PRÉVIA no LAYOUT COMPLETO do site (index.html, com "Montar pedido"). O servidor
// lê a ÁREA DE TESTE (catalogo/teste) pela chave de serviço e injeta na página
// (window.__PREVIEW_DATA__) — não depende das regras do Firebase nem toca no site
// no ar. Entra em modo visualização, sem login. Abra sem precisar de senha.
integracao.get("/site-teste", async (c) => {
  // Catálogo montado AO VIVO 100% do ERP (não lê o catálogo antigo de produtos).
  // Usa só o layout do site. Sempre fresco — reflete o Syntech na hora.
  let data: Record<string, unknown> = {};
  try { data = await gerarDocSite(c.env); }
  catch (e) { return new Response("Não consegui montar o catálogo do ERP:\n\n" + (e as Error).message, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  // Diagnóstico: ?debug=1 mostra o que foi gerado (origem, contagens, amostras por seção).
  if (c.req.query("debug") === "1") {
    type P = { nome?: string; linha?: string; pronta_entrega?: boolean; grupos?: { linhas?: { sul?: number }[] }[] };
    const resumo = (p: P) => ({ nome: p.nome, linha: p.linha, pe: p.pronta_entrega === true, menor_preco: p.grupos?.[0]?.linhas?.[0]?.sul });
    const ps = Array.isArray((data as { produtos?: unknown[] }).produtos) ? (data as { produtos: P[] }).produtos : [];
    const el = (((data as { edicao_limitada?: { produtos?: unknown[] } }).edicao_limitada) || {}).produtos;
    const elArr = Array.isArray(el) ? (el as P[]) : [];
    return c.json({
      origem_erp: (data as { _origem_erp?: boolean })._origem_erp === true,
      resumo: (data as { _resumo?: unknown })._resumo,
      total_produtos: ps.length,
      total_edicao_limitada: elArr.length,
      amostra_produtos: ps.slice(0, 8).map(resumo),
      amostra_edicao_limitada: elArr.slice(0, 8).map(resumo),
    });
  }
  // Blindagem: o site faz Object.keys(produto.blocos); garante que todo produto
  // (inclusive os de Edição Limitada) tenha os campos que ele espera.
  const blindar = (p: Record<string, unknown>) => {
    if (p && typeof p === "object") {
      if (p.blocos == null || typeof p.blocos !== "object") p.blocos = {};
      if (p.video == null) p.video = "";
      if (!Array.isArray(p.cores)) p.cores = [];
      if (!Array.isArray(p.grupos)) p.grupos = [];
    }
  };
  const prods = Array.isArray((data as { produtos?: unknown[] }).produtos) ? (data as { produtos: Record<string, unknown>[] }).produtos : [];
  for (const p of prods) blindar(p);
  const elp = ((data as { edicao_limitada?: { produtos?: unknown[] } }).edicao_limitada || {}).produtos;
  if (Array.isArray(elp)) for (const p of elp as Record<string, unknown>[]) blindar(p);
  const json = JSON.stringify(data).split("<").join("\\u003c").split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
  // Diagnóstico no TÍTULO da aba: se a injeção funcionar, o título começa com
  // "PREVIEW_OK:<n> prods". Se der erro de execução, "PREVIEW_ERRO: ...". Se o
  // título continuar o normal do site, o <script> injetado teve erro de sintaxe.
  const inject = `<script>try{window.__PREVIEW_DATA__=${json};try{document.title="PREVIEW_OK:"+((window.__PREVIEW_DATA__&&window.__PREVIEW_DATA__.produtos||[]).length)+" prods";}catch(_e){}}catch(e){try{document.title="PREVIEW_ERRO: "+(e&&e.message||e);}catch(_e){}}</script>`;
  const html = SITE_FULL_HTML.includes("</head>") ? SITE_FULL_HTML.replace("</head>", inject + "</head>") : inject + SITE_FULL_HTML;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

// PRÉVIA VISUAL: serve o HTML do site REAL (catalogo-online) com os produtos do
// ERP injetados. NÃO toca no site que está no ar (catalogo/main no Firebase) —
// os dados são embutidos na página (window.__PREVIEW_DATA__), sem ler/gravar o
// Firebase. Serve só pra ver o visual com os dados reais.
integracao.get("/catalogo-preview", async (c) => {
  const cat = await gerarCatalogoSite(c.env);
  const data = {
    produtos: cat.produtos,
    banco_cores: cat.banco_cores,
    banco_tamanhos: cat.banco_tamanhos,
    estoque: cat.estoque,
    capa: null,
    representantes: [],
    popup_promo: null,
    edicao_limitada: {},
    linhas_ocultas: {},
    atualizado_em: Date.now(),
  };
  // Escapa "<" (evita fechar o <script> sem querer) e os separadores de linha
  // U+2028/U+2029 (válidos em JSON, inválidos em string JS). Sem regex literal
  // pra não confundir o empacotador.
  const json = JSON.stringify(data)
    .split("<").join("\\u003c")
    .split(" ").join("\\u2028")
    .split(" ").join("\\u2029");
  const inject = `<script>window.__PREVIEW_DATA__=${json};</script>`;
  const html = SITE_ONLINE_HTML.includes("</head>")
    ? SITE_ONLINE_HTML.replace("</head>", inject + "</head>")
    : inject + SITE_ONLINE_HTML;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});

// ── CATÁLOGO DE PRODUTOS (espelho do ERP) ────────────────────────────────────────
// A ponte manda os produtos (nome, preços, grupo, classe, cores, tamanhos). Read-only.
// body: { itens: [{ ref, nome, unidade, classe, grupo, preco_atacado, preco_varejo,
//   preco_atacado_promo, preco_varejo_promo, estoque_geral, inativo, cores:[...], tamanhos:[...] }] }
integracao.post("/produtos", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  type ProdIn = {
    ref?: string; nome?: string; unidade?: string; classe?: string; grupo?: string;
    preco_atacado?: number | string; preco_varejo?: number | string;
    preco_atacado_promo?: number | string; preco_varejo_promo?: number | string;
    estoque_geral?: number | string; inativo?: number | string | boolean;
    cores?: unknown; tamanhos?: unknown; data_alt_reg?: string;
  };
  const b = await c.req.json<{ itens?: ProdIn[] }>().catch(() => ({} as { itens?: ProdIn[] }));
  const itens: ProdIn[] = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const numOrNull = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const stmts = itens.filter((it) => str(it.ref)).map((it) =>
    c.env.DB.prepare(
      `INSERT INTO erp_produtos (ref, nome, unidade, classe, grupo, preco_atacado, preco_varejo, preco_atacado_promo, preco_varejo_promo, estoque_geral, inativo, cores, tamanhos, data_alt_reg, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ref) DO UPDATE SET nome=excluded.nome, unidade=excluded.unidade, classe=excluded.classe, grupo=excluded.grupo,
         preco_atacado=excluded.preco_atacado, preco_varejo=excluded.preco_varejo,
         preco_atacado_promo=excluded.preco_atacado_promo, preco_varejo_promo=excluded.preco_varejo_promo,
         estoque_geral=excluded.estoque_geral, inativo=excluded.inativo, cores=excluded.cores,
         tamanhos=excluded.tamanhos, data_alt_reg=excluded.data_alt_reg, atualizado_em=datetime('now')`
    ).bind(
      str(it.ref), str(it.nome), str(it.unidade), str(it.classe), str(it.grupo),
      numOrNull(it.preco_atacado), numOrNull(it.preco_varejo), numOrNull(it.preco_atacado_promo), numOrNull(it.preco_varejo_promo),
      numOrNull(it.estoque_geral), (it.inativo === 1 || it.inativo === "1" || it.inativo === true || it.inativo === "S") ? 1 : 0,
      JSON.stringify(Array.isArray(it.cores) ? it.cores : []), JSON.stringify(Array.isArray(it.tamanhos) ? it.tamanhos : []),
      str(it.data_alt_reg)
    )
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, n: stmts.length });
});

// LÊ o catálogo (pra exibir). Junta o saldo total (erp_estoque) e a base das fotos.
integracao.get("/produtos", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  const grupo = (c.req.query("grupo") || "").trim();
  let sql =
    `SELECT p.ref, p.nome, p.unidade, p.classe, p.grupo, p.preco_atacado, p.preco_varejo,
            p.preco_atacado_promo, p.preco_varejo_promo, p.estoque_geral, p.inativo, p.cores, p.tamanhos, p.atualizado_em,
            (SELECT COALESCE(SUM(e.saldo),0) FROM erp_estoque e WHERE e.ref = p.ref) AS saldo
       FROM erp_produtos p`;
  const cond: string[] = [], binds: unknown[] = [];
  if (busca) { cond.push("(lower(p.nome) LIKE ? OR lower(p.ref) LIKE ?)"); binds.push(`%${busca}%`, `%${busca}%`); }
  if (grupo) { cond.push("p.grupo = ?"); binds.push(grupo); }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY p.inativo, p.nome LIMIT 2000";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  const fotos_base = (await c.env.DB.prepare("SELECT valor FROM config WHERE chave='erp_fotos_base'").first<{ valor: string | null }>().catch(() => null))?.valor || "";
  // grupos distintos (pro filtro)
  const { results: grupos } = await c.env.DB.prepare("SELECT DISTINCT grupo FROM erp_produtos WHERE grupo IS NOT NULL AND grupo <> '' ORDER BY grupo").all<{ grupo: string }>().catch(() => ({ results: [] as { grupo: string }[] }));
  return c.json({ fotos_base, grupos: (grupos || []).map((x) => x.grupo), itens: results || [] });
});

// ── RECUSAR: apaga o pedido do ERP (ex.: cancelado) ─────────────────────────────
integracao.post("/pendentes/:id/recusar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id = ? AND (SELECT COALESCE(erp_integracao,0) FROM pedidos WHERE id = ?) = 1").bind(id, id),
    c.env.DB.prepare("DELETE FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')").bind(id),
  ]);
  return c.json({ ok: true });
});
