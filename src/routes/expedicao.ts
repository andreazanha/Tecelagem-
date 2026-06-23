import { Hono } from "hono";
import type { Env } from "../index";

export const expedicao = new Hono<{ Bindings: Env }>();

// Ordem canônica das fases do pedido (linha do tempo / "Todos os pedidos").
const FASES = ["tecelagem", "passadoria", "corte", "costura", "revisao", "expedicao", "fiscal", "transporte", "entregue"];
const idxFase = (s: string) => {
  const i = FASES.indexOf(s);
  return i < 0 ? 0 : i;
};

// Cria a linha de Expedição para todo pedido cujas partes já chegaram ao setor
// 'expedicao' (vindas da Revisão) e que ainda não têm registro de expedição.
async function garantirExpedicao(env: Env) {
  await env.DB.prepare(
    `INSERT INTO expedicao (pedido_id)
       SELECT DISTINCT pr.pedido_id FROM producao pr
        WHERE pr.setor = 'expedicao'
          AND NOT EXISTS (SELECT 1 FROM expedicao e WHERE e.pedido_id = pr.pedido_id)`
  ).run();
}

// Registra o avanço de fase na linha do tempo (mesma tabela da produção, parte sintética).
async function registrarEvento(env: Env, pedido_id: string, fase: string, status: string) {
  await env.DB.prepare(
    "INSERT INTO producao_eventos (pedido_id, parte, setor, status, operador) VALUES (?, '_envio', ?, ?, NULL)"
  )
    .bind(pedido_id, fase, status)
    .run();
}

// QUADRO de uma FASE (expedicao | fiscal | transporte) — um card por pedido.
expedicao.get("/", async (c) => {
  await garantirExpedicao(c.env);
  const fase = c.req.query("fase") || "expedicao";
  const { results } = await c.env.DB.prepare(
    `SELECT e.pedido_id, e.fase, e.status, e.volumes, e.nf_numero, e.frete, e.transportadora, e.entrou_em,
            p.numero_erp, p.codigo_pai, p.cliente_nome, p.data_pedido, p.data_entrega, p.observacao,
            (SELECT SUM(pecas) FROM producao pr WHERE pr.pedido_id = e.pedido_id) AS pecas,
            (SELECT GROUP_CONCAT(DISTINCT parte) FROM producao pr WHERE pr.pedido_id = e.pedido_id) AS partes,
            (SELECT GROUP_CONCAT(DISTINCT resumo) FROM producao pr WHERE pr.pedido_id = e.pedido_id) AS resumos
       FROM expedicao e JOIN pedidos p ON p.id = e.pedido_id
      WHERE e.fase = ?
        -- Transporte: cards já despachados numa transportadora somem após 15 dias.
        AND NOT (e.fase = 'transporte' AND e.transportadora IS NOT NULL
                 AND e.entrou_em < datetime('now', '-15 days'))
   ORDER BY (p.data_entrega IS NULL), p.data_entrega, p.numero_erp`
  )
    .bind(fase)
    .all();
  return c.json(results);
});

// Atualiza a expedição de um pedido: muda fase/status, salva volumes/NF/frete/transportadora.
expedicao.post("/:pedido_id", async (c) => {
  const pedido_id = c.req.param("pedido_id");
  const b = await c.req
    .json<{
      fase?: string;
      status?: string;
      volumes?: unknown;
      nf_numero?: string | null;
      frete?: string | null;
      transportadora?: string | null;
    }>()
    .catch(() => ({}) as Record<string, never>);

  const atual = await c.env.DB.prepare("SELECT fase, status, transportadora FROM expedicao WHERE pedido_id = ?")
    .bind(pedido_id)
    .first<{ fase: string; status: string; transportadora: string | null }>();
  if (!atual) return c.json({ error: "pedido não está em expedição" }, 404);

  const sets: string[] = ["updated_at = datetime('now')"];
  const binds: (string | null)[] = [];
  let novaFase = atual.fase;
  let novoStatus = atual.status;

  if (b.fase && FASES.includes(b.fase)) {
    novaFase = b.fase;
    sets.push("fase = ?", "entrou_em = datetime('now')");
    binds.push(b.fase);
  }
  if (b.status !== undefined) {
    novoStatus = b.status || "aguardando";
    sets.push("status = ?");
    binds.push(novoStatus);
  }
  if (b.volumes !== undefined) {
    sets.push("volumes = ?");
    binds.push(b.volumes == null ? null : JSON.stringify(b.volumes));
  }
  if (b.nf_numero !== undefined) {
    sets.push("nf_numero = ?");
    binds.push((b.nf_numero || "").trim() || null);
  }
  if (b.frete !== undefined) {
    sets.push("frete = ?");
    binds.push((b.frete || "").trim() || null);
  }
  if (b.transportadora !== undefined) {
    sets.push("transportadora = ?", "entrou_em = datetime('now')");
    binds.push((b.transportadora || "").trim() || null);
  }

  binds.push(pedido_id);
  await c.env.DB.prepare(`UPDATE expedicao SET ${sets.join(", ")} WHERE pedido_id = ?`)
    .bind(...binds)
    .run();

  // Registra a entrada na nova fase (linha do tempo), só quando a fase muda.
  if (novaFase !== atual.fase) await registrarEvento(c.env, pedido_id, novaFase, novoStatus);
  return c.json({ ok: true });
});

// TODOS OS PEDIDOS: lista geral com a fase atual, a etapa e a linha do tempo
// (por onde passou e quanto tempo ficou em cada fase). Filtros por mês e setor.
expedicao.get("/todos", async (c) => {
  await garantirExpedicao(c.env);
  const mes = c.req.query("mes") || ""; // "YYYY-MM"
  const setor = c.req.query("setor") || ""; // filtra pela fase atual

  // Pedidos (com itens em produção) + dados de cabeçalho.
  const { results: peds } = await c.env.DB.prepare(
    `SELECT p.id AS pedido_id, p.numero_erp, p.codigo_pai, p.cliente_nome, p.data_pedido, p.data_entrega, p.created_at,
            (SELECT SUM(pecas) FROM producao pr WHERE pr.pedido_id = p.id) AS pecas,
            (SELECT GROUP_CONCAT(DISTINCT parte) FROM producao pr WHERE pr.pedido_id = p.id) AS partes
       FROM pedidos p
      WHERE EXISTS (SELECT 1 FROM producao pr WHERE pr.pedido_id = p.id)`
  ).all<{
    pedido_id: string;
    numero_erp: string | null;
    codigo_pai: string | null;
    cliente_nome: string;
    data_pedido: string | null;
    data_entrega: string | null;
    created_at: string;
    pecas: number | null;
    partes: string | null;
  }>();

  // Setor atual de cada parte (produção) e fase de expedição.
  const { results: prRows } = await c.env.DB.prepare(
    "SELECT pedido_id, setor, status, parte, prioridade FROM producao"
  ).all<{ pedido_id: string; setor: string; status: string; parte: string; prioridade: number }>();
  const setoresProd = new Map<string, string[]>();
  const cardsDe = new Map<string, { setor: string; status: string; parte: string; prioridade: number }[]>();
  for (const r of prRows) {
    const a = setoresProd.get(r.pedido_id) || [];
    a.push(r.setor);
    setoresProd.set(r.pedido_id, a);
    const cs = cardsDe.get(r.pedido_id) || [];
    cs.push(r);
    cardsDe.set(r.pedido_id, cs);
  }
  const { results: expRows } = await c.env.DB.prepare(
    "SELECT pedido_id, fase, status, transportadora FROM expedicao"
  ).all<{ pedido_id: string; fase: string; status: string; transportadora: string | null }>();
  const expDe = new Map<string, { fase: string; status: string; transportadora: string | null }>();
  for (const r of expRows) expDe.set(r.pedido_id, r);

  // Eventos (linha do tempo) de todos os pedidos.
  const { results: evRows } = await c.env.DB.prepare(
    "SELECT pedido_id, setor, em FROM producao_eventos ORDER BY em, id"
  ).all<{ pedido_id: string; setor: string; em: string }>();
  const eventosDe = new Map<string, { setor: string; em: string }[]>();
  for (const r of evRows) {
    const a = eventosDe.get(r.pedido_id) || [];
    a.push({ setor: r.setor, em: r.em });
    eventosDe.set(r.pedido_id, a);
  }

  const ms = (s?: string | null) => {
    if (!s) return NaN;
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z";
    return Date.parse(withZ);
  };
  const agora = Date.now();

  const lista = peds.map((p) => {
    // Fase atual: se há expedição, ela manda; senão, a fase mais avançada na produção.
    const exp = expDe.get(p.pedido_id);
    let faseAtual: string;
    if (exp) faseAtual = exp.fase;
    else {
      const setores = setoresProd.get(p.pedido_id) || ["tecelagem"];
      faseAtual = setores.reduce((acc, s) => (idxFase(s) > idxFase(acc) ? s : acc), setores[0]);
    }

    // Linha do tempo por FASE: primeira entrada em cada fase (a partir dos eventos + criação).
    const entradas = new Map<string, number>();
    entradas.set("tecelagem", ms(p.created_at));
    for (const e of eventosDe.get(p.pedido_id) || []) {
      const t = ms(e.em);
      if (!isNaN(t) && (!entradas.has(e.setor) || t < entradas.get(e.setor)!)) entradas.set(e.setor, t);
    }
    const ordenadas = [...entradas.entries()]
      .filter(([f]) => FASES.includes(f))
      .sort((a, b2) => idxFase(a[0]) - idxFase(b2[0]));
    const passagens = ordenadas.map(([fase, entrouT], i) => {
      const proxT = i < ordenadas.length - 1 ? ordenadas[i + 1][1] : agora;
      const atualF = fase === faseAtual;
      return {
        fase,
        entrouEm: new Date(entrouT).toISOString(),
        duracaoMin: Math.max(0, Math.round(((atualF ? agora : proxT) - entrouT) / 60000)),
        atual: atualF,
      };
    });

    const tipos = (p.partes || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const tem = (x: string) => tipos.includes(x);
    let tipo = "ÚNICO";
    if (tem("pronta-entrega") && (tem("parte-1") || tem("parte-2") || tem("parte-unica"))) tipo = "MISTO";
    else if (tem("pronta-entrega")) tipo = "KIT";
    else if (tem("parte-1") || tem("parte-2")) tipo = "P1+P2";

    // Coluna/situação dentro do setor atual (para os filtros de "Todos os Pedidos").
    const cards = cardsDe.get(p.pedido_id) || [];
    const noSetor = cards.filter((cd) => cd.setor === faseAtual);
    const situacoes = exp ? [exp.status] : [...new Set(noSetor.map((cd) => cd.status))];
    const partesNoSetor = [...new Set(noSetor.map((cd) => cd.parte))];
    const prioridade = noSetor.some((cd) => !!cd.prioridade);

    return {
      pedido_id: p.pedido_id,
      numero_erp: p.numero_erp,
      codigo_pai: p.codigo_pai,
      cliente_nome: p.cliente_nome,
      data_pedido: p.data_pedido,
      data_entrega: p.data_entrega,
      created_at: p.created_at,
      pecas: p.pecas || 0,
      tipo,
      faseAtual,
      idx: idxFase(faseAtual),
      statusExp: exp ? exp.status : null,
      transportadora: exp ? exp.transportadora : null,
      situacoes,
      partesNoSetor,
      prioridade,
      passagens,
    };
  });

  const filtrada = lista.filter((o) => {
    if (setor && o.faseAtual !== setor) return false;
    if (mes) {
      const base = (o.data_pedido || o.created_at || "").slice(0, 7);
      if (base !== mes) return false;
    }
    return true;
  });
  filtrada.sort((a, b2) => (b2.created_at || "").localeCompare(a.created_at || ""));
  return c.json(filtrada);
});
