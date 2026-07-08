// CRM — Funil de Vendas (pipeline). Cartões (clientes/leads) por etapa, com
// tarefas, timeline e regras recalculadas ao abrir (sem cron nesta 1ª versão).
import { Hono } from "hono";
import type { Env } from "../index";

export const funil = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;
const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

// Etapas na ordem do quadro. `req` = exige próxima tarefa (todas menos "perdido").
export const ETAPAS = [
  "novo-lead", "primeiro-contato", "negociacao", "aguardando-retorno",
  "pedido-andamento", "pos-venda", "ativo", "inativo", "perdido",
] as const;
type Etapa = (typeof ETAPAS)[number];
const ehEtapa = (e: string): e is Etapa => (ETAPAS as readonly string[]).includes(e);

const MOTIVOS = ["preco", "concorrencia", "sem-interesse", "fechou-loja", "inadimplencia", "nao-respondeu", "outro"];

// datas do SQLite ("YYYY-MM-DD HH:MM:SS", UTC) → ms; aceita data pura também.
function ms(s?: string | null): number | null {
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z");
  const t = Date.parse(iso.length <= 10 ? s + "T00:00:00Z" : iso);
  return isNaN(t) ? null : t;
}
const diasDesde = (s?: string | null): number => {
  const t = ms(s);
  return t == null ? 0 : Math.floor((Date.now() - t) / 86400000);
};
const hojeISO = () => new Date().toISOString().slice(0, 10);

type CardRow = {
  id: string; cliente_id: string | null; nome: string; cidade: string | null; uf: string | null;
  whatsapp: string | null; etapa: string; responsavel: string | null; valor_estimado: number | null;
  probabilidade: number | null; retorno_em: string | null; motivo_perdido: string | null;
  pedido_id: string | null; tentativas: number; criado_em: string; movido_em: string;
};

async function logar(env: Env, cardId: string, tipo: string, texto: string, autor?: string | null) {
  await env.DB.prepare("INSERT INTO funil_eventos (id, card_id, tipo, texto, autor) VALUES (?, ?, ?, ?, ?)")
    .bind(uid(), cardId, tipo, texto, str(autor)).run();
}

// ── QUADRO ────────────────────────────────────────────────────────────────────
// Recalcula ao abrir: dias parado, alertas (parado>7, sem tarefa, retorno vencido)
// e move automaticamente Ativo→Inativo por tempo sem comprar (120 dias).
funil.get("/", async (c) => {
  const { results: cards } = await c.env.DB.prepare("SELECT * FROM funil_cards").all<CardRow>();

  // Próxima tarefa aberta de cada cartão (a que vence primeiro) + se tem alguma.
  const { results: tar } = await c.env.DB.prepare(
    `SELECT card_id, titulo, vence_em FROM funil_tarefas WHERE feita = 0
       ORDER BY (vence_em IS NULL), vence_em ASC`
  ).all<{ card_id: string; titulo: string; vence_em: string | null }>();
  const proxTarefa = new Map<string, { titulo: string; vence_em: string | null }>();
  for (const t of tar) if (!proxTarefa.has(t.card_id)) proxTarefa.set(t.card_id, { titulo: t.titulo, vence_em: t.vence_em });

  // Pedido em andamento: valor + fase da produção mais avançada.
  const pedIds = cards.filter((k) => k.etapa === "pedido-andamento" && k.pedido_id).map((k) => k.pedido_id!);
  const pedInfo = new Map<string, { numero: string | null; valor: number; setor: string | null; previsao: string | null }>();
  if (pedIds.length) {
    const ph = pedIds.map(() => "?").join(",");
    const { results: pr } = await c.env.DB.prepare(
      `SELECT p.id, p.numero_erp, p.data_entrega,
              COALESCE(SUM(i.qtd * i.valor_unit), 0) AS valor
         FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.id IN (${ph}) GROUP BY p.id`
    ).bind(...pedIds).all<{ id: string; numero_erp: string | null; data_entrega: string | null; valor: number }>();
    const ORD = ["tecelagem", "passadoria", "corte", "costura", "revisao", "expedicao"];
    const { results: fases } = await c.env.DB.prepare(
      `SELECT pedido_id, setor FROM producao WHERE pedido_id IN (${ph})`
    ).bind(...pedIds).all<{ pedido_id: string; setor: string }>();
    const setorDe = new Map<string, string>();
    for (const f of fases) {
      const cur = setorDe.get(f.pedido_id);
      if (!cur || ORD.indexOf(f.setor) < ORD.indexOf(cur)) setorDe.set(f.pedido_id, f.setor); // fase mais atrasada = a que falta
    }
    for (const p of pr) pedInfo.set(p.id, { numero: p.numero_erp, valor: Number(p.valor) || 0, setor: setorDe.get(p.id) || null, previsao: p.data_entrega });
  }

  // Ativo/Inativo: dias sem comprar (última compra não-reposição pelo nome).
  const nomesAtivos = [...new Set(cards.filter((k) => k.etapa === "ativo" || k.etapa === "inativo").map((k) => k.nome))];
  const ultimaCompra = new Map<string, string>();
  if (nomesAtivos.length) {
    const ph = nomesAtivos.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT cliente_nome AS nome, MAX(data_pedido) AS ultima FROM pedidos
        WHERE cliente_nome IN (${ph}) AND COALESCE(reposicao,0)=0 GROUP BY cliente_nome`
    ).bind(...nomesAtivos).all<{ nome: string; ultima: string | null }>();
    for (const r of results) if (r.ultima) ultimaCompra.set(r.nome, r.ultima);
  }

  const hoje = hojeISO();
  const auto: string[] = []; // ids que migraram p/ inativo (persistir + logar)
  const out = cards.map((k) => {
    const px = proxTarefa.get(k.id) || null;
    const semTarefa = k.etapa !== "perdido" && !px;
    let diasParado = diasDesde(k.movido_em);
    let etapa = k.etapa;
    let diasSemComprar: number | null = null;
    let faixa: string | null = null;

    if (etapa === "ativo" || etapa === "inativo") {
      const uc = ultimaCompra.get(k.nome);
      diasSemComprar = uc ? diasDesde(uc) : null;
      if (diasSemComprar != null) {
        if (diasSemComprar >= 180) faixa = "prioridade";
        else if (diasSemComprar >= 120) faixa = "inativo";
        else if (diasSemComprar >= 90) faixa = "atencao";
        if (etapa === "ativo" && diasSemComprar >= 120) { etapa = "inativo"; auto.push(k.id); }
      }
    }
    const retornoVencido = etapa === "aguardando-retorno" && !!k.retorno_em && k.retorno_em <= hoje;
    const alerta = semTarefa || retornoVencido || (etapa === "negociacao" && diasParado > 7) || diasParado > 15;
    const vermelho = (etapa === "negociacao" && diasParado >= 7) || diasParado > 15;

    return {
      id: k.id, cliente_id: k.cliente_id, nome: k.nome, cidade: k.cidade, uf: k.uf, whatsapp: k.whatsapp,
      etapa, responsavel: k.responsavel, valor_estimado: k.valor_estimado, probabilidade: k.probabilidade,
      retorno_em: k.retorno_em, motivo_perdido: k.motivo_perdido, tentativas: k.tentativas,
      diasParado, proxTarefa: px, semTarefa, alerta, vermelho, retornoVencido,
      diasSemComprar, faixa,
      pedido: k.pedido_id ? pedInfo.get(k.pedido_id) || null : null,
    };
  });

  // Persiste as migrações automáticas p/ inativo (recalcula ao abrir).
  for (const id of auto) {
    await c.env.DB.prepare("UPDATE funil_cards SET etapa='inativo', movido_em=datetime('now') WHERE id=?").bind(id).run();
    await logar(c.env, id, "etapa", "Movido automaticamente para Inativo (120+ dias sem comprar)");
  }

  const resumo = {
    parados: out.filter((k) => k.diasParado > 7 && k.etapa !== "perdido").length,
    semTarefa: out.filter((k) => k.semTarefa).length,
    retornos: out.filter((k) => k.retornoVencido).length,
    alertas: out.filter((k) => k.alerta).length,
  };
  return c.json({ etapas: ETAPAS, cards: out, resumo });
});

// ── DETALHE (ficha do cartão + tarefas + timeline) ─────────────────────────────
funil.get("/:id", async (c) => {
  const id = c.req.param("id");
  const card = await c.env.DB.prepare("SELECT * FROM funil_cards WHERE id = ?").bind(id).first<CardRow>();
  if (!card) return c.json({ error: "cartão não encontrado" }, 404);
  const { results: tarefas } = await c.env.DB.prepare(
    "SELECT id, titulo, vence_em, responsavel, feita, criado_em, feito_em FROM funil_tarefas WHERE card_id = ? ORDER BY feita ASC, (vence_em IS NULL), vence_em ASC"
  ).bind(id).all();
  const { results: timeline } = await c.env.DB.prepare(
    "SELECT id, tipo, texto, autor, criado_em FROM funil_eventos WHERE card_id = ? ORDER BY criado_em DESC, rowid DESC"
  ).bind(id).all();
  // Histórico de pedidos do cliente (se o nome bate com a base).
  const { results: pedidos } = await c.env.DB.prepare(
    `SELECT p.id, p.numero_erp AS numero, p.data_pedido AS data, COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE p.cliente_nome = ? AND COALESCE(p.reposicao,0)=0
      GROUP BY p.id ORDER BY (p.data_pedido IS NULL), p.data_pedido DESC`
  ).bind(card.nome).all();
  return c.json({ ...card, tarefas, timeline, pedidos });
});

// ── CRIA lead ──────────────────────────────────────────────────────────────────
// Obrigatório nome + whatsapp (telefone). Já cria a tarefa de 1º contato em 24h.
funil.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const nome = String(b.nome ?? "").trim();
  const whatsapp = String(b.whatsapp ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  if (!whatsapp) return c.json({ error: "telefone/WhatsApp é obrigatório" }, 400);
  const id = uid();
  await c.env.DB.prepare(
    `INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel)
     VALUES (?, ?, ?, ?, ?, ?, 'novo-lead', ?)`
  ).bind(id, str(b.cliente_id), nome, str(b.cidade), str(b.uf), whatsapp, str(b.responsavel)).run();
  await c.env.DB.prepare(
    "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em, responsavel) VALUES (?, ?, '1º contato (24h)', date('now','+1 day'), ?)"
  ).bind(uid(), id, str(b.responsavel)).run();
  await logar(c.env, id, "etapa", "Lead criado", str(b.responsavel));
  return c.json({ id, nome });
});

// ── ATUALIZA / move de etapa ────────────────────────────────────────────────────
// Move de etapa registra a movimentação (zera "dias parado") e valida as regras:
// perdido exige motivo; aguardando-retorno exige data de retorno.
funil.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const card = await c.env.DB.prepare("SELECT * FROM funil_cards WHERE id = ?").bind(id).first<CardRow>();
  if (!card) return c.json({ error: "cartão não encontrado" }, 404);

  const campos: string[] = [];
  const valores: unknown[] = [];
  const set = (col: string, v: unknown) => { campos.push(`${col} = ?`); valores.push(v); };

  let novaEtapa: string | null = null;
  if (b.etapa !== undefined && b.etapa !== card.etapa) {
    const e = String(b.etapa);
    if (!ehEtapa(e)) return c.json({ error: "etapa inválida" }, 400);
    const motivo = b.motivo_perdido !== undefined ? str(b.motivo_perdido) : card.motivo_perdido;
    const retorno = b.retorno_em !== undefined ? str(b.retorno_em) : card.retorno_em;
    if (e === "perdido" && !motivo) return c.json({ error: "motivo é obrigatório para Perdido" }, 400);
    if (e === "aguardando-retorno" && !retorno) return c.json({ error: "data de retorno é obrigatória" }, 400);
    novaEtapa = e;
    set("etapa", e);
    campos.push("movido_em = datetime('now')"); // sem placeholder — não empurra valor
  }
  if (b.responsavel !== undefined) set("responsavel", str(b.responsavel));
  if (b.valor_estimado !== undefined) set("valor_estimado", num(b.valor_estimado));
  if (b.probabilidade !== undefined) set("probabilidade", num(b.probabilidade));
  if (b.retorno_em !== undefined) set("retorno_em", str(b.retorno_em));
  if (b.motivo_perdido !== undefined) set("motivo_perdido", str(b.motivo_perdido));
  if (b.pedido_id !== undefined) set("pedido_id", str(b.pedido_id));
  if (b.cidade !== undefined) set("cidade", str(b.cidade));
  if (b.uf !== undefined) set("uf", str(b.uf));
  if (b.whatsapp !== undefined) set("whatsapp", str(b.whatsapp));
  if (b.nome !== undefined && String(b.nome).trim()) set("nome", String(b.nome).trim());
  if (b.incrementarTentativa) set("tentativas", card.tentativas + 1);

  if (!campos.length) return c.json({ ok: true });
  valores.push(id);
  await c.env.DB.prepare(`UPDATE funil_cards SET ${campos.join(", ")} WHERE id = ?`).bind(...valores).run();
  if (novaEtapa) await logar(c.env, id, "etapa", `Movido para ${novaEtapa}`, str(b.autor));
  return c.json({ ok: true });
});

// ── TAREFAS ─────────────────────────────────────────────────────────────────────
funil.post("/:id/tarefa", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const titulo = String(b.titulo ?? "").trim();
  if (!titulo) return c.json({ error: "título é obrigatório" }, 400);
  const tid = uid();
  await c.env.DB.prepare(
    "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em, responsavel) VALUES (?, ?, ?, ?, ?)"
  ).bind(tid, id, titulo, str(b.vence_em), str(b.responsavel)).run();
  await logar(c.env, id, "tarefa", `Tarefa: ${titulo}`, str(b.responsavel));
  return c.json({ id: tid });
});

funil.post("/tarefa/:tid/concluir", async (c) => {
  const tid = c.req.param("tid");
  const t = await c.env.DB.prepare("SELECT card_id, titulo FROM funil_tarefas WHERE id = ?").bind(tid).first<{ card_id: string; titulo: string }>();
  if (!t) return c.json({ error: "tarefa não encontrada" }, 404);
  await c.env.DB.prepare("UPDATE funil_tarefas SET feita = 1, feito_em = datetime('now') WHERE id = ?").bind(tid).run();
  await c.env.DB.prepare("UPDATE funil_cards SET movido_em = datetime('now') WHERE id = ?").bind(t.card_id).run();
  await logar(c.env, t.card_id, "tarefa", `Concluída: ${t.titulo}`);
  return c.json({ ok: true });
});

// ── TIMELINE (registrar interação) ────────────────────────────────────────────────
// Qualquer interação (ligação, WhatsApp, e-mail, observação) conta como
// movimentação e zera os "dias parado".
funil.post("/:id/evento", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const tipo = String(b.tipo ?? "obs");
  const texto = String(b.texto ?? "").trim();
  if (!texto) return c.json({ error: "texto é obrigatório" }, 400);
  await logar(c.env, id, tipo, texto, str(b.autor));
  await c.env.DB.prepare("UPDATE funil_cards SET movido_em = datetime('now') WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export { MOTIVOS };
