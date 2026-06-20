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

// QUADRO — todas as partes em produção (não enviadas), com dados do pedido.
producao.get("/", async (c) => {
  await garantirCards(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT pr.pedido_id, pr.parte, pr.status, pr.pecas, pr.resumo, pr.maquina, pr.operador,
            pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, p.cliente_nome, p.data_pedido, p.data_entrega
       FROM producao pr
       JOIN pedidos p ON p.id = pr.pedido_id
      WHERE pr.status != 'enviado'
   ORDER BY (p.data_entrega IS NULL), p.data_entrega, p.numero_erp`
  ).all();
  return c.json(results);
});

// DETALHE de uma parte (para o popup): dados + os blocos (modelo/cor/tamanhos) daquela parte.
producao.get("/:pedido_id/:parte", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const card = await c.env.DB.prepare(
    `SELECT pr.pedido_id, pr.parte, pr.status, pr.pecas, pr.resumo, pr.maquina, pr.operador,
            pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, p.cliente_nome, p.vendedor, p.data_pedido, p.data_entrega, p.observacao
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

const STATUS = ["aguardando", "tecendo", "pronto", "enviado"];

// MUDA O STATUS de uma parte (Tecer → tecendo, Finalizar → pronto, Enviar → enviado).
producao.post("/:pedido_id/:parte", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const b = await c.req
    .json<{ status?: string; maquina?: string; operador?: string }>()
    .catch(() => ({}) as { status?: string; maquina?: string; operador?: string });
  const status = STATUS.includes(b.status || "") ? (b.status as string) : "aguardando";

  const sets: string[] = ["status = ?"];
  const binds: (string | null)[] = [status];
  if (b.maquina !== undefined) {
    sets.push("maquina = ?");
    binds.push((b.maquina || "").trim() || null);
  }
  if (b.operador !== undefined) {
    sets.push("operador = ?");
    binds.push((b.operador || "").trim() || null);
  }
  if (status === "tecendo") sets.push("iniciado_em = datetime('now')");
  if (status === "pronto") sets.push("finalizado_em = datetime('now')");

  binds.push(pedido_id, parte);
  await c.env.DB.prepare(`UPDATE producao SET ${sets.join(", ")} WHERE pedido_id = ? AND parte = ?`)
    .bind(...binds)
    .run();
  return c.json({ ok: true });
});
