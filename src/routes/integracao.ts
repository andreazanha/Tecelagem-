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
import { consumoDoPedido, baixarPorPedido } from "../estoque-baixa";

export const integracao = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
const inteiro = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

// Depois que um pedido importado "vira produção" (aprovado), roda o MESMO pós-processo
// do PDF: cadastra os produtos que faltam e dá baixa de estoque dos insumos. Não trava.
async function posProcessar(env: Env, pedidoId: string) {
  await cadastrarProdutosDoPedido(env, pedidoId).catch(() => {});
  await baixarPorPedido(env, pedidoId, await consumoDoPedido(env, pedidoId)).catch(() => {});
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
  if (ok) await posProcessar(c.env, id);
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
  await posProcessar(c.env, novoId);
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
