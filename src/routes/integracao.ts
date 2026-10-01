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

export const integracao = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
const inteiro = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

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
    `SELECT p.id, p.numero_erp, p.cliente_nome, p.data_pedido, p.data_entrega, p.created_at,
            (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = p.id) AS linhas,
            (SELECT COALESCE(SUM(i.qtd),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS pecas
       FROM pedidos p
      WHERE COALESCE(p.erp_integracao,0) = 1 AND p.status = 'aguardando_aprovacao'
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

// ── APROVAR: tira de 'aguardando_aprovacao' → entra na produção (explode) ────────
integracao.post("/pendentes/:id/aprovar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    "UPDATE pedidos SET status = 'novo' WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status = 'aguardando_aprovacao'"
  ).bind(id).run();
  // A explosão/cards são gerados pelo garantirCards quando o quadro da produção carrega.
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

// ── RECUSAR: apaga o pedido do ERP (ex.: cancelado) ─────────────────────────────
integracao.post("/pendentes/:id/recusar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id = ? AND (SELECT COALESCE(erp_integracao,0) FROM pedidos WHERE id = ?) = 1").bind(id, id),
    c.env.DB.prepare("DELETE FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status = 'aguardando_aprovacao'").bind(id),
  ]);
  return c.json({ ok: true });
});
