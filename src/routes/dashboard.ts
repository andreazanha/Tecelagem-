import { Hono } from "hono";
import type { Env } from "../index";

export const dashboard = new Hono<{ Bindings: Env }>();

const ORDEM_SETOR =
  "CASE pr.setor WHEN 'tecelagem' THEN 1 WHEN 'passadoria' THEN 2 WHEN 'corte' THEN 3 WHEN 'costura' THEN 4 WHEN 'revisao' THEN 5 WHEN 'expedicao' THEN 6 ELSE 9 END";

// AGREGADO para o painel de TV (dados reais).
dashboard.get("/", async (c) => {
  const db = c.env.DB;
  const one = async (sql: string) => ((await db.prepare(sql).first<Record<string, number>>()) || {}) as Record<string, number>;
  const all = async (sql: string) => (await db.prepare(sql).all()).results as Record<string, unknown>[];

  const hoje = {
    pedidos: (await one("SELECT COUNT(*) n FROM pedidos WHERE date(created_at)=date('now')")).n || 0,
    pecas:
      (await one(
        "SELECT COALESCE(SUM(i.qtd),0) n FROM pedido_itens i JOIN pedidos p ON p.id=i.pedido_id WHERE date(p.created_at)=date('now')"
      )).n || 0,
    atrasados: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega IS NOT NULL AND data_entrega < date('now')")).n || 0,
    entregaProxima: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega BETWEEN date('now') AND date('now','+3 day')")).n || 0,
    finalizados: (await one("SELECT COUNT(*) n FROM producao WHERE status='pronto'")).n || 0,
  };

  const prod = await all("SELECT setor, status, COUNT(*) n FROM producao GROUP BY setor, status");
  const cnt = (setor: string, status?: string) =>
    prod.filter((r) => r.setor === setor && (!status || r.status === status)).reduce((s, r) => s + (r.n as number), 0);
  const producao = {
    aguardando_tecelagem: cnt("tecelagem", "aguardando"),
    em_tecelagem: cnt("tecelagem", "fazendo"),
    aguardando_passadoria: cnt("passadoria", "aguardando"),
    em_passadoria: cnt("passadoria", "fazendo"),
    aguardando_corte: cnt("corte", "aguardando"),
    em_corte: cnt("corte", "fazendo"),
    costura: cnt("costura"),
    revisao: cnt("revisao"),
    expedicao: cnt("expedicao"),
  };

  const urgentes = await all(
    `SELECT p.numero_erp numero, p.cliente_nome cliente, p.data_entrega,
            CASE WHEN p.data_entrega < date('now') THEN 1 ELSE 0 END atrasado,
            (SELECT pr.setor FROM producao pr WHERE pr.pedido_id=p.id ORDER BY ${ORDEM_SETOR} LIMIT 1) etapa
       FROM pedidos p WHERE p.data_entrega IS NOT NULL
   ORDER BY p.data_entrega ASC LIMIT 12`
  );

  const ranking = (await all("SELECT setor etapa, COUNT(*) qtd FROM producao GROUP BY setor ORDER BY qtd DESC")) as {
    etapa: string;
    qtd: number;
  }[];

  const expedicao = {
    prontos: cnt("expedicao", "aguardando"),
    aguardando_nf: 0,
    enviados_hoje: cnt("expedicao", "pronto"),
  };

  const avisos = (await all("SELECT id, texto FROM avisos ORDER BY created_at DESC")) as { id: string; texto: string }[];

  const up = (await db
    .prepare(
      `SELECT p.id, p.numero_erp numero, p.cliente_nome cliente, p.vendedor, p.data_entrega, p.created_at,
              (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens i WHERE i.pedido_id=p.id) pecas
         FROM pedidos p ORDER BY p.created_at DESC, p.rowid DESC LIMIT 1`
    )
    .first()) as Record<string, unknown> | null;

  return c.json({
    hoje,
    producao,
    urgentes,
    ranking,
    expedicao,
    avisos,
    ultimoPedido: up && up.id ? up : null,
    geradoEm: new Date().toISOString(),
  });
});

// Avisos (CRUD usado na configuração do painel).
dashboard.post("/avisos", async (c) => {
  const b = await c.req.json<{ texto?: string }>().catch(() => ({}) as { texto?: string });
  const texto = (b.texto || "").trim();
  if (!texto) return c.json({ error: "texto é obrigatório" }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO avisos (id, texto) VALUES (?, ?)").bind(id, texto).run();
  return c.json({ id, texto }, 201);
});

dashboard.delete("/avisos/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM avisos WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
