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

// DESMEMBRA uma OP consolidada: separa o card (pedido_id, parte) em um card por
// OP de origem (número do pedido original). Cada card vira "<parte>#<op>" e guarda
// `op`. Segue a produção independente. Idempotente (não redivide o que já tem "#").
type CardRow = {
  pedido_id: string; parte: string; op: string | null; setor: string; status: string;
  pecas: number; operador: string | null; prioridade: number; iniciado_em: string | null; finalizado_em: string | null;
};
async function desmembrarCard(env: Env, pedidoId: string, parteFull: string): Promise<{ ok: boolean; criados?: number; motivo?: string }> {
  if (parteFull.includes("#")) return { ok: false, motivo: "já desmembrado" };
  const card = await env.DB.prepare("SELECT * FROM producao WHERE pedido_id = ? AND parte = ?").bind(pedidoId, parteFull).first<CardRow>();
  if (!card) return { ok: false, motivo: "card não encontrado" };
  const ped = await env.DB.prepare("SELECT numero_erp, codigo_pai, cliente_nome FROM pedidos WHERE id = ?").bind(pedidoId).first<{ numero_erp: string | null; codigo_pai: string | null; cliente_nome: string }>();
  if (!ped) return { ok: false, motivo: "pedido não encontrado" };
  const { results: itens } = await env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, kit, origem, origem_cliente FROM pedido_itens WHERE pedido_id = ?"
  ).bind(pedidoId).all<ItemBase & { origem_cliente?: string | null }>();
  const primeiro = (ped.numero_erp || "").split(",")[0].trim();
  const origemDe = (it: ItemBase) => (it.origem || "").trim() || primeiro || (ped.codigo_pai || "");
  const origens = [...new Set(itens.map(origemDe).filter(Boolean))];
  if (origens.length <= 1) return { ok: false, motivo: "pedido tem uma única OP" };
  // Cliente de cada OP de origem (guardado no item quando os pedidos foram juntados);
  // se não tiver, usa o cliente do pedido consolidado.
  const clienteDe = (origem: string): string => {
    const it = itens.find((i) => origemDe(i) === origem && (i.origem_cliente || "").trim());
    return (it?.origem_cliente || "").trim() || ped.cliente_nome;
  };

  const cat = await catalogoDe(env);
  const totalParte = (cl: ReturnType<typeof classificar>): number => {
    if (parteFull === "pronta-entrega") return cl.kits.reduce((s, b) => s + b.total, 0);
    if (parteFull === "parte-unica") return (cl.parteUnica || []).reduce((s, b) => s + b.total, 0);
    if (parteFull === "parte-1") return (cl.parte1 || []).reduce((s, b) => s + b.total, 0);
    if (parteFull === "parte-2") return (cl.parte2 || []).reduce((s, b) => s + b.total, 0);
    return 0;
  };
  const stmts: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM producao WHERE pedido_id = ? AND parte = ?").bind(pedidoId, parteFull)];
  let criados = 0;
  for (const origem of origens) {
    const pecas = totalParte(classificar(itens.filter((it) => origemDe(it) === origem), cat));
    if (pecas <= 0) continue; // essa OP não tem peça nesta parte
    stmts.push(
      env.DB.prepare(
        `INSERT INTO producao (pedido_id, parte, op, setor, status, pecas, resumo, cliente, operador, prioridade, iniciado_em, finalizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(pedidoId, `${parteFull}#${origem}`, origem, card.setor, card.status, pecas, `OP ${origem}`, clienteDe(origem), card.operador, card.prioridade, card.iniciado_em, card.finalizado_em)
    );
    criados++;
  }
  if (criados <= 1) return { ok: false, motivo: "não há peças em mais de uma OP nesta parte" };
  await env.DB.batch(stmts);
  return { ok: true, criados };
}

// Backfill: todo pedido vira card de Tecelagem (mesmo sem ter gerado PDF).
async function garantirCards(env: Env) {
  const { results: faltantes } = await env.DB.prepare(
    `SELECT p.id, p.reposicao, p.entrega_pe FROM pedidos p
      WHERE NOT EXISTS (SELECT 1 FROM producao pr WHERE pr.pedido_id = p.id)
        AND COALESCE(p.status, '') <> 'aguardando_aprovacao'`
  ).all<{ id: string; reposicao: number; entrega_pe: string | null }>();
  if (!faltantes.length) return;
  const cat = await catalogoDe(env);
  for (const f of faltantes) {
    const { results: itens } = await env.DB.prepare(
      "SELECT produto, ref, cor_grade, tamanho, qtd, parte, kit, origem FROM pedido_itens WHERE pedido_id = ?"
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
      // Onde o card NASCE:
      //  • Reposição (produzir p/ estocar): tudo começa na Tecelagem.
      //  • Pedido de cliente: a pronta-entrega já está no estoque → nasce no Estoque
      //    (Junto = "Pronta entrega com produção"/pronto; Separado = "Separação"/fazendo).
      let setor = "tecelagem";
      let status = "aguardando";
      if (parte === "pronta-entrega" && !f.reposicao) {
        setor = "estoque";
        status = f.entrega_pe === "separado" ? "fazendo" : "pronto";
      }
      stmts.push(
        env.DB.prepare(
          `INSERT INTO producao (pedido_id, parte, setor, status, pecas, resumo) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(pedido_id, parte) DO NOTHING`
        ).bind(f.id, parte, setor, status, pecas, `${blocos.length} modelo(s)`)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
}

// Auto-correção dos kits (pronta-entrega) de PEDIDO DE CLIENTE (não-reposição):
//  1) os que caíram na Tecelagem por engano voltam para o Estoque;
//  2) no Estoque, a COLUNA segue o entrega_pe do pedido (separado → "Separação"/fazendo,
//     junto → "Pronta entrega com produção"/pronto).
// Só mexe em cards intocados (sem operador/início/fim); nunca em reposição.
async function corrigirKitsEstoque(env: Env) {
  // 1) Tecelagem → Estoque
  await env.DB.prepare(
    `UPDATE producao
        SET setor = 'estoque',
            status = CASE WHEN (SELECT entrega_pe FROM pedidos WHERE id = producao.pedido_id) = 'separado'
                          THEN 'fazendo' ELSE 'pronto' END
      WHERE parte = 'pronta-entrega'
        AND setor = 'tecelagem'
        AND status = 'aguardando'
        AND operador IS NULL AND iniciado_em IS NULL AND finalizado_em IS NULL
        AND pedido_id IN (SELECT id FROM pedidos WHERE COALESCE(reposicao, 0) = 0)`
  ).run();
  // 2) Estoque: a coluna acompanha o entrega_pe do pedido (cards ainda não trabalhados)
  await env.DB.prepare(
    `UPDATE producao
        SET status = CASE WHEN (SELECT entrega_pe FROM pedidos WHERE id = producao.pedido_id) = 'separado'
                          THEN 'fazendo' ELSE 'pronto' END
      WHERE parte = 'pronta-entrega'
        AND setor = 'estoque'
        AND status IN ('pronto', 'fazendo')
        AND operador IS NULL AND iniciado_em IS NULL AND finalizado_em IS NULL
        AND pedido_id IN (SELECT id FROM pedidos WHERE COALESCE(reposicao, 0) = 0)`
  ).run();
}

// QUADRO de um SETOR (default tecelagem) — partes naquele setor, com dados do pedido.
producao.get("/", async (c) => {
  await garantirCards(c.env);
  await corrigirKitsEstoque(c.env);
  const setor = c.req.query("setor") || "tecelagem";
  const { results } = await c.env.DB.prepare(
    `SELECT pr.pedido_id, pr.parte, pr.op, pr.setor, pr.status, pr.pecas, pr.resumo, pr.maquina, pr.operador,
            pr.prioridade, pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, COALESCE(NULLIF(pr.cliente, ''), p.cliente_nome) AS cliente_nome,
            p.data_pedido, p.data_entrega, p.data_tecelagem, p.codigo_terceiro, p.codigo_pai, p.observacao, p.reposicao
       FROM producao pr
       JOIN pedidos p ON p.id = pr.pedido_id
      WHERE pr.setor = ?
   ORDER BY pr.prioridade DESC, (p.data_entrega IS NULL), p.data_entrega, p.numero_erp`
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
            pr.prioridade, pr.iniciado_em, pr.finalizado_em,
            p.numero_erp, COALESCE(NULLIF(pr.cliente, ''), p.cliente_nome) AS cliente_nome,
            p.vendedor, p.data_pedido, p.data_entrega, p.observacao,
            p.codigo_terceiro, p.codigo_pai
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

const STATUS = ["aguardando", "fazendo", "pronto", "defeito"];

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
    sets.push("setor = ?", "maquina = NULL", "iniciado_em = NULL", "finalizado_em = NULL");
    binds.push(b.setor.trim());
    // Ao mudar de setor zera o operador — exceto se um operador for enviado junto
    // (caso de "desfazer/refazer", que restaura o estado anterior).
    if (b.operador === undefined) sets.push("operador = NULL");
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

  // AUTOMÁTICO: ao ENTRAR na Revisão, uma OP consolidada ainda inteira se desmembra
  // sozinha em um card por OP (se já foi desmembrada no Corte, os cards têm "#" e nada muda).
  let desmembrou = false;
  if (b.setor === "revisao" && !parte.includes("#")) {
    const r = await desmembrarCard(c.env, pedido_id, parte).catch(() => ({ ok: false }));
    desmembrou = !!r.ok;
  }
  return c.json({ ok: true, desmembrou });
});

// DESMEMBRAR manual (botão no Corte): separa a OP consolidada em um card por OP.
producao.post("/:pedido_id/:parte/desmembrar", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const r = await desmembrarCard(c.env, pedido_id, parte);
  if (!r.ok) return c.json({ error: r.motivo || "não foi possível desmembrar" }, 400);
  return c.json(r);
});

// CLIENTE do card: corrige/define o cliente de um card (usado nos cards desmembrados
// de OP consolidada — cada OP é de um cliente diferente). Vazio volta ao cliente do pedido.
producao.post("/:pedido_id/:parte/cliente", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const b = await c.req.json<{ cliente?: string }>().catch(() => ({}) as { cliente?: string });
  const cliente = (b.cliente || "").trim() || null;
  await c.env.DB.prepare("UPDATE producao SET cliente = ? WHERE pedido_id = ? AND parte = ?").bind(cliente, pedido_id, parte).run();
  // Guarda também no item de origem, para o cliente reaparecer se o card for redesmembrado.
  const card = await c.env.DB.prepare("SELECT op FROM producao WHERE pedido_id = ? AND parte = ?").bind(pedido_id, parte).first<{ op: string | null }>();
  if (card?.op && cliente) {
    await c.env.DB.prepare("UPDATE pedido_itens SET origem_cliente = ? WHERE pedido_id = ? AND origem = ?").bind(cliente, pedido_id, card.op).run();
  }
  return c.json({ ok: true, cliente });
});

// CONCLUIR: remove o card do quadro (ex.: reposição que já deu entrada no estoque).
producao.post("/:pedido_id/:parte/concluir", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  await c.env.DB.prepare("DELETE FROM producao WHERE pedido_id = ? AND parte = ?").bind(pedido_id, parte).run();
  return c.json({ ok: true });
});

// "Passar na frente": liga/desliga a prioridade de uma parte.
producao.post("/:pedido_id/:parte/prioridade", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const parte = decodeURIComponent(c.req.param("parte"));
  const b = await c.req.json<{ prioridade?: number | boolean }>().catch(() => ({}) as { prioridade?: number | boolean });
  const v = b.prioridade ? 1 : 0;
  await c.env.DB.prepare("UPDATE producao SET prioridade = ? WHERE pedido_id = ? AND parte = ?")
    .bind(v, pedido_id, parte)
    .run();
  return c.json({ ok: true, prioridade: v });
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
