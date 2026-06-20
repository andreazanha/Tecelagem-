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

  const prod = await all("SELECT setor, status, COUNT(*) n, COALESCE(SUM(pecas),0) p FROM producao GROUP BY setor, status");
  const cnt = (setor: string, status?: string) =>
    prod.filter((r) => r.setor === setor && (!status || r.status === status)).reduce((s, r) => s + (r.n as number), 0);
  const pecasSetor = (setor: string) => prod.filter((r) => r.setor === setor).reduce((s, r) => s + (r.p as number), 0);
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

  // Esteira: total por setor (independente do status) + quantos estão "fazendo".
  const SETORES = ["tecelagem", "passadoria", "corte", "costura", "revisao", "expedicao"];
  const esteira = SETORES.map((s) => ({
    setor: s,
    total: cnt(s),
    fazendo: cnt(s, "fazendo"),
    aguardando: cnt(s, "aguardando"),
    pecas: pecasSetor(s),
  }));

  const urgentes = await all(
    `SELECT p.numero_erp numero, p.cliente_nome cliente, p.data_entrega,
            CASE WHEN p.data_entrega < date('now') THEN 1 ELSE 0 END atrasado,
            (SELECT pr.setor FROM producao pr WHERE pr.pedido_id=p.id ORDER BY ${ORDEM_SETOR} LIMIT 1) etapa
       FROM pedidos p WHERE p.data_entrega IS NOT NULL
   ORDER BY p.data_entrega ASC LIMIT 14`
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

  // ── Gráficos ──────────────────────────────────────────────────────────────
  const pedidosPorEtapa = esteira.map((e) => ({ etapa: e.setor, qtd: e.total }));
  const pecasPorEtapa = esteira.map((e) => ({ etapa: e.setor, pecas: e.pecas }));

  const pedidosPorDia = (await all(
    `SELECT date(created_at) dia, COUNT(*) qtd
       FROM pedidos WHERE created_at >= date('now','-13 day')
   GROUP BY date(created_at) ORDER BY dia`
  )) as { dia: string; qtd: number }[];

  const pecasSemana = (await all(
    `SELECT date(p.created_at) dia, COALESCE(SUM(i.qtd),0) pecas
       FROM pedidos p JOIN pedido_itens i ON i.pedido_id=p.id
      WHERE p.created_at >= date('now','-6 day')
   GROUP BY date(p.created_at) ORDER BY dia`
  )) as { dia: string; pecas: number }[];

  const statusPrazo = {
    atrasados: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega IS NOT NULL AND data_entrega < date('now')")).n || 0,
    hoje: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega = date('now')")).n || 0,
    amanha: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega = date('now','+1 day')")).n || 0,
    emDia: (await one("SELECT COUNT(*) n FROM pedidos WHERE data_entrega IS NOT NULL AND data_entrega > date('now','+1 day')")).n || 0,
  };

  const topRepresentantes = (await all(
    `SELECT COALESCE(NULLIF(TRIM(vendedor),''),'Sem representante') nome, COUNT(*) qtd
       FROM pedidos GROUP BY nome ORDER BY qtd DESC LIMIT 5`
  )) as { nome: string; qtd: number }[];

  const topClientes = (await all(
    `SELECT p.cliente_nome nome, COALESCE(SUM(i.qtd),0) pecas
       FROM pedidos p JOIN pedido_itens i ON i.pedido_id=p.id
   GROUP BY p.cliente_nome ORDER BY pecas DESC LIMIT 5`
  )) as { nome: string; pecas: number }[];

  const hojeOntem = {
    hoje: hoje.pedidos,
    ontem: (await one("SELECT COUNT(*) n FROM pedidos WHERE date(created_at)=date('now','-1 day')")).n || 0,
  };

  const metaMes = {
    realizadoPedidos: (await one("SELECT COUNT(*) n FROM pedidos WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')")).n || 0,
    realizadoPecas:
      (await one(
        "SELECT COALESCE(SUM(i.qtd),0) n FROM pedido_itens i JOIN pedidos p ON p.id=i.pedido_id WHERE strftime('%Y-%m',p.created_at)=strftime('%Y-%m','now')"
      )).n || 0,
  };

  return c.json({
    hoje,
    producao,
    esteira,
    urgentes,
    ranking,
    expedicao,
    avisos,
    graficos: {
      pedidosPorEtapa,
      pecasPorEtapa,
      pedidosPorDia,
      pecasSemana,
      statusPrazo,
      topRepresentantes,
      topClientes,
      hojeOntem,
      metaMes,
    },
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
