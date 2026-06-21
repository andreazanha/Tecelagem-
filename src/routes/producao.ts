import { Hono } from "hono";
import type { Env } from "../index";
import { classificar, criarCatalogo, type ItemBase } from "../classificar";

export const producao = new Hono<{ Bindings: Env }>();

async function catalogoDe(env: Env) {
  const m = await env.DB.prepare(
    "SELECT nome, parte, composicao, ref, tassel_peseira, tassel_almofada FROM modelos"
  ).all();
  return criarCatalogo(m.results as never[]);
}

// Backfill: todo pedido vira card de Tecelagem (mesmo sem ter gerado PDF).
async function garantirCards(env: Env) {
  const { results: faltantes } = await env.DB.prepare(
    `SELECT p.id FROM pedidos p
      WHERE NOT EXISTS (SELECT 1 FROM producao pr WHERE pr.pedido_id = p.id)`
  ).all<{ id: string }>();
  if (!faltantes.length) return;
  const cat = await catalogoDe(env);
  for (const f of faltantes) {
    const { results: itens } = await env.DB.prepare(
      "SELECT produto, ref, cor_grade, tamanho, qtd, parte, origem FROM pedido_itens WHERE pedido_id = ?"
    )
      .bind(f.id)
      .all<ItemBase>();
    const cl = classificar(itens, cat);
    const partes: [string, ReturnType<typeof classificar>["kits"]][] = [];
    if (cl.modo === "unica") partes.push(["parte-unica", cl.parteUnica!]);
    else {
      partes.push(["parte-1", cl.parte1!]);
      partes.push(["parte-2", cl.parte2!]);
    }
    if (cl.temKit) partes.push(["pronta-entrega", cl.kits]);
    const stmts = [];
    for (const [parte, blocos] of partes) {
      if (!blocos.length) continue;
      const pecas = blocos.reduce((s, b) => s + b.total, 0);
      stmts.push(
        env.DB.prepare(
          `INSERT INTO producao (pedido_id, parte, pecas, resumo) VALUES (?, ?, ?, ?)
           ON CONFLICT(pedido_id, parte) DO NOTHING`
        ).bind(f.id, parte, pecas, `${blocos.length} modelo(s)`)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
}

// QUADRO de um SETOR (default tecelagem) — partes naquele setor, com dados do pedido.
producao.get("/", async (c) => {
  await garantirCards(c.env);
  const setor = c.req.query("setor") || "tecelagem";
  const { results } = await c.env.DB.prepare(
    `SELECT pr.pedido_id, pr.parte, pr.setor, pr.status, pr.pecas, pr.resumo, pr.maquina, pr.operador,
            pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, p.cliente_nome, p.data_pedido, p.data_entrega
       FROM producao pr
       JOIN pedidos p ON p.id = pr.pedido_id
      WHERE pr.setor = ?
   ORDER BY (p.data_entrega IS NULL), p.data_entrega, p.numero_erp`
  )
    .bind(setor)
    .all();
  return c.json(results);
});

// DETALHE de uma parte (para o popup): dados + os blocos (modelo/cor/tamanhos) daquela parte.
producao.get("/:pedido_id/:parte", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const card = await c.env.DB.prepare(
    `SELECT pr.pedido_id, pr.parte, pr.status, pr.pecas, pr.resumo, pr.maquina, pr.operador,
            pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, p.cliente_nome, p.vendedor, p.data_pedido, p.data_entrega, p.observacao,
            p.codigo_terceiro
       FROM producao pr JOIN pedidos p ON p.id = pr.pedido_id
      WHERE pr.pedido_id = ? AND pr.parte = ?`
  )
    .bind(pedido_id, parte)
    .first();
  if (!card) return c.json({ error: "não encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, origem FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(pedido_id)
    .all<ItemBase>();
  const cl = classificar(itens, await catalogoDe(c.env));
  const blocos =
    parte === "parte-1" ? cl.parte1 : parte === "parte-2" ? cl.parte2 : parte === "parte-unica" ? cl.parteUnica : cl.kits;
  return c.json({ ...card, blocos: blocos || [] });
});

const STATUS = ["aguardando", "fazendo", "pronto"];

// MUDA status/setor de uma parte: Fazer → fazendo, Finalizar → pronto, Enviar → próximo setor.
producao.post("/:pedido_id/:parte", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const b = await c.req
    .json<{ status?: string; setor?: string; maquina?: string; operador?: string }>()
    .catch(() => ({}) as { status?: string; setor?: string; maquina?: string; operador?: string });
  const status = STATUS.includes(b.status || "") ? (b.status as string) : "aguardando";

  const sets: string[] = ["status = ?"];
  const binds: (string | null)[] = [status];
  if (b.setor) {
    sets.push("setor = ?", "maquina = NULL", "operador = NULL", "iniciado_em = NULL", "finalizado_em = NULL");
    binds.push(b.setor.trim());
  }
  if (b.maquina !== undefined) {
    sets.push("maquina = ?");
    binds.push((b.maquina || "").trim() || null);
  }
  if (b.operador !== undefined) {
    sets.push("operador = ?");
    binds.push((b.operador || "").trim() || null);
  }
  if (status === "fazendo") sets.push("iniciado_em = datetime('now')");
  if (status === "pronto") sets.push("finalizado_em = datetime('now')");

  binds.push(pedido_id, parte);
  await c.env.DB.prepare(`UPDATE producao SET ${sets.join(", ")} WHERE pedido_id = ? AND parte = ?`)
    .bind(...binds)
    .run();

  // Registra o evento (linha do tempo): estado resultante após a mudança.
  const after = await c.env.DB.prepare(
    "SELECT setor, status, operador FROM producao WHERE pedido_id = ? AND parte = ?"
  )
    .bind(pedido_id, parte)
    .first<{ setor: string; status: string; operador: string | null }>();
  if (after) {
    await c.env.DB.prepare(
      "INSERT INTO producao_eventos (pedido_id, parte, setor, status, operador) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(pedido_id, parte, after.setor, after.status, after.operador)
      .run();
  }
  return c.json({ ok: true });
});

// HISTÓRICO de uma parte: por onde passou, qual operador e o tempo em cada setor.
producao.get("/:pedido_id/:parte/historico", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const ped = await c.env.DB.prepare("SELECT created_at FROM pedidos WHERE id = ?")
    .bind(pedido_id)
    .first<{ created_at: string }>();
  const row = await c.env.DB.prepare(
    "SELECT setor, status, operador, iniciado_em, finalizado_em, created_at FROM producao WHERE pedido_id = ? AND parte = ?"
  )
    .bind(pedido_id, parte)
    .first<{ setor: string; status: string; operador: string | null; iniciado_em: string | null; finalizado_em: string | null; created_at: string }>();
  if (!row) return c.json({ error: "não encontrado" }, 404);

  const criadoEm = ped?.created_at || row.created_at;
  let { results: ev } = await c.env.DB.prepare(
    "SELECT setor, status, operador, em FROM producao_eventos WHERE pedido_id = ? AND parte = ? ORDER BY em, id"
  )
    .bind(pedido_id, parte)
    .all<{ setor: string; status: string; operador: string | null; em: string }>();

  // Cards antigos (sem eventos): reconstrói o básico a partir da linha atual.
  if (!ev.length) {
    ev = [];
    if (row.iniciado_em) ev.push({ setor: row.setor, status: "fazendo", operador: row.operador, em: row.iniciado_em });
    if (row.finalizado_em) ev.push({ setor: row.setor, status: "pronto", operador: row.operador, em: row.finalizado_em });
    if (!ev.length) ev.push({ setor: row.setor, status: row.status, operador: row.operador, em: criadoEm });
  }

  // Âncora de criação: o pedido entra na primeira etapa no momento da criação.
  const eventos = [{ setor: ev[0].setor, status: "aguardando", operador: null as string | null, em: criadoEm }, ...ev];

  const ms = (s?: string | null) => {
    if (!s) return NaN;
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z";
    return Date.parse(withZ);
  };
  const agora = new Date().toISOString();

  type Passagem = { setor: string; status: string; operador: string | null; entrouEm: string; saiuEm: string | null; duracaoMin: number; atual: boolean };
  const passagens: Passagem[] = [];
  let cur: Passagem | null = null;
  for (const e of eventos) {
    if (!cur || cur.setor !== e.setor) {
      if (cur) cur.saiuEm = e.em;
      cur = { setor: e.setor, status: e.status, operador: e.operador, entrouEm: e.em, saiuEm: null, duracaoMin: 0, atual: false };
      passagens.push(cur);
    } else {
      if (e.operador) cur.operador = e.operador;
      cur.status = e.status;
    }
  }
  for (const p of passagens) {
    const fim = p.saiuEm || agora;
    p.duracaoMin = Math.max(0, Math.round((ms(fim) - ms(p.entrouEm)) / 60000));
    p.atual = !p.saiuEm;
  }
  const totalMin = Math.max(0, Math.round((ms(agora) - ms(criadoEm)) / 60000));

  return c.json({ criadoEm, agora, totalMin, passagens });
});
