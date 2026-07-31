// CRM — Funil de Vendas (pipeline). Cartões (clientes/leads) por etapa, com
// tarefas, timeline e regras recalculadas ao abrir (sem cron nesta 1ª versão).
import { Hono } from "hono";
import type { Env } from "../index";

export const funil = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;
const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

// Etapas na ordem do quadro. Funil é de relacionamento/venda — o acompanhamento
// de produção de um pedido fica nos painéis, não aqui.
export const ETAPAS = [
  "atendimento", // conversas que não são prospecção (fiscal, financeiro, dúvida)
  "reativacao", // clientes há muito tempo sem faturar (fila de mensagem de reativação)
  "novo-lead", "primeiro-contato", "negociacao", "aguardando-retorno",
  "pos-venda", "ativo", "inativo", "perdido",
] as const;
type Etapa = (typeof ETAPAS)[number];
const ehEtapa = (e: string): e is Etapa => (ETAPAS as readonly string[]).includes(e);

const MOTIVOS = ["preco", "concorrencia", "sem-interesse", "fechou-loja", "inadimplencia", "nao-respondeu", "outro"];

// "Clientes" internos criados por pedidos de estoque / OPs consolidadas /
// reposição — NÃO são clientes reais, não entram no funil.
export function ehClienteInterno(nome?: string | null): boolean {
  const n = (nome || "").trim().toUpperCase();
  if (!n) return true;
  return n === "ESTOQUE" || /CONSOLIDAD/.test(n) || /BIG\s*TRICOT/.test(n) || /REPOSI[ÇC]/.test(n);
}

async function apagarCard(env: Env, id: string) {
  await env.DB.prepare("DELETE FROM funil_tarefas WHERE card_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM funil_eventos WHERE card_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM funil_cards WHERE id = ?").bind(id).run();
}

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

  // Conversa de WhatsApp vinculada a cada card (abrir o atendimento direto do funil).
  const { results: convs } = await c.env.DB.prepare(
    "SELECT card_id, id FROM atend_conversas WHERE card_id IS NOT NULL"
  ).all<{ card_id: string; id: string }>().catch(() => ({ results: [] as { card_id: string; id: string }[] }));
  const conversaDe = new Map<string, string>();
  for (const cv of convs) if (!conversaDe.has(cv.card_id)) conversaDe.set(cv.card_id, cv.id);

  // Compras reais de cada cliente vinculado (para as regras automáticas):
  // nº de pedidos, data da última compra e quando o último pedido foi lançado.
  const nomesVinc = [...new Set(cards.filter((k) => k.cliente_id).map((k) => k.nome))];
  const compras = new Map<string, { n: number; ultima: string | null; ultimoCriado: string | null }>();
  if (nomesVinc.length) {
    const ph = nomesVinc.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT cliente_nome AS nome, COUNT(*) AS n, MAX(data_pedido) AS ultima, MAX(created_at) AS ultimoCriado
         FROM pedidos WHERE cliente_nome IN (${ph}) AND COALESCE(reposicao,0)=0 AND COALESCE(tipo,'') <> 'estoque'
        GROUP BY cliente_nome`
    ).bind(...nomesVinc).all<{ nome: string; n: number; ultima: string | null; ultimoCriado: string | null }>();
    for (const r of results) compras.set(r.nome, { n: r.n, ultima: r.ultima, ultimoCriado: r.ultimoCriado });
  }

  const PROSPECT = new Set(["novo-lead", "primeiro-contato", "negociacao", "aguardando-retorno"]);
  // Tarefa-padrão + texto do log ao entrar em cada etapa por automação.
  const MOVE: Record<string, { tarefa: string; prazo: string; log: string }> = {
    "pos-venda": { tarefa: "Confirmar recebimento (pós-venda)", prazo: "+2 day", log: "Converteu (novo pedido) → Pós-venda" },
    "ativo-reativado": { tarefa: "Retomar relacionamento", prazo: "+3 day", log: "Reativado (comprou de novo) → Ativo" },
    "ativo-posvenda": { tarefa: "Acompanhamento periódico", prazo: "+30 day", log: "Pós-venda concluída → Ativo" },
    "inativo": { tarefa: "Campanha de reativação", prazo: "+2 day", log: "120+ dias sem comprar → Inativo" },
  };

  const hoje = hojeISO();
  const auto: { id: string; etapa: Etapa; chave: string }[] = [];
  const out = cards.map((k) => {
    let diasParado = diasDesde(k.movido_em);
    let etapa: Etapa = k.etapa as Etapa;
    let diasSemComprar: number | null = null;
    let faixa: string | null = null;
    const info = k.cliente_id ? compras.get(k.nome) : undefined;

    if (etapa === "ativo" || etapa === "inativo") {
      const uc = info?.ultima || null;
      diasSemComprar = uc ? diasDesde(uc) : null;
      if (diasSemComprar != null) {
        if (diasSemComprar >= 180) faixa = "prioridade";
        else if (diasSemComprar >= 120) faixa = "inativo";
        else if (diasSemComprar >= 90) faixa = "atencao";
      }
    }

    // ── Movimentação automática (uma transição por abertura) ──
    let chave = "";
    if (info && PROSPECT.has(etapa) && info.ultimoCriado && k.criado_em && info.ultimoCriado > k.criado_em) {
      etapa = "pos-venda"; chave = "pos-venda"; // prospect que comprou depois de virar lead
    } else if (etapa === "inativo" && diasSemComprar != null && diasSemComprar < 90) {
      etapa = "ativo"; chave = "ativo-reativado"; // voltou a comprar
    } else if (etapa === "ativo" && diasSemComprar != null && diasSemComprar >= 120) {
      etapa = "inativo"; chave = "inativo"; // esfriou
    } else if (etapa === "pos-venda" && diasParado > 15) {
      etapa = "ativo"; chave = "ativo-posvenda"; // pós-venda madura
    }
    if (chave) { auto.push({ id: k.id, etapa, chave }); diasParado = 0; }

    const proxTar = chave ? { titulo: MOVE[chave].tarefa, vence_em: null } : proxTarefa.get(k.id) || null;
    // "atendimento" (só conversa) não exige tarefa nem dispara alerta de parado.
    const semTarefa = etapa !== "perdido" && etapa !== "atendimento" && !proxTar;
    const retornoVencido = etapa === "aguardando-retorno" && !!k.retorno_em && k.retorno_em <= hoje;
    const alerta = semTarefa || retornoVencido || (etapa === "negociacao" && diasParado > 7) || (etapa !== "atendimento" && diasParado > 15);
    const vermelho = (etapa === "negociacao" && diasParado >= 7) || (etapa !== "atendimento" && diasParado > 15);

    return {
      id: k.id, cliente_id: k.cliente_id, nome: k.nome, cidade: k.cidade, uf: k.uf, whatsapp: k.whatsapp,
      etapa, responsavel: k.responsavel, valor_estimado: k.valor_estimado, probabilidade: k.probabilidade,
      retorno_em: k.retorno_em, motivo_perdido: k.motivo_perdido, tentativas: k.tentativas,
      diasParado, proxTarefa: proxTar, semTarefa, alerta, vermelho, retornoVencido,
      diasSemComprar, faixa, conversa_id: conversaDe.get(k.id) ?? null,
    };
  });

  // Persiste as transições automáticas (move, cria tarefa-padrão e loga).
  for (const a of auto) {
    const m = MOVE[a.chave];
    await c.env.DB.prepare("UPDATE funil_cards SET etapa=?, movido_em=datetime('now') WHERE id=?").bind(a.etapa, a.id).run();
    await c.env.DB.prepare(
      "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em) VALUES (?, ?, ?, date('now', ?))"
    ).bind(uid(), a.id, m.tarefa, m.prazo).run();
    await logar(c.env, a.id, "etapa", "Automático: " + m.log);
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
  // Histórico de pedidos — SÓ para cartão vinculado a um cliente da base
  // (cliente_id) E fora do estágio "Novo Lead" (prospect não mostra pedido).
  // Lead criado na mão não tem vínculo → não puxa pedido de homônimo.
  let pedidos: { id: string; numero: string | null; data: string | null; valor: number; situacao: string }[] = [];
  if (card.cliente_id && card.etapa !== "novo-lead") {
    const cli = await c.env.DB.prepare("SELECT nome FROM clientes WHERE id = ?").bind(card.cliente_id).first<{ nome: string }>();
    const nomeCli = cli?.nome || card.nome;
    const { results: peds } = await c.env.DB.prepare(
      `SELECT p.id, p.numero_erp AS numero, p.data_pedido AS data, p.status,
              COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor
         FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.cliente_nome = ? AND COALESCE(p.reposicao,0)=0 AND COALESCE(p.tipo,'') <> 'estoque'
        GROUP BY p.id ORDER BY (p.data_pedido IS NULL), p.data_pedido DESC`
    ).bind(nomeCli).all<{ id: string; numero: string | null; data: string | null; status: string; valor: number }>();
    // Situação: tudo na expedição → entregue; senão em produção.
    const situ = new Map<string, string>();
    if (peds.length) {
      const ph = peds.map(() => "?").join(",");
      const { results: pr } = await c.env.DB.prepare(
        `SELECT pedido_id, COUNT(*) AS tot, SUM(CASE WHEN setor='expedicao' THEN 1 ELSE 0 END) AS exp
           FROM producao WHERE pedido_id IN (${ph}) GROUP BY pedido_id`
      ).bind(...peds.map((p) => p.id)).all<{ pedido_id: string; tot: number; exp: number }>();
      for (const r of pr) situ.set(r.pedido_id, r.tot > 0 && r.exp === r.tot ? "entregue" : "producao");
    }
    pedidos = peds.map((p) => ({
      id: p.id, numero: p.numero, data: p.data, valor: Number(p.valor) || 0,
      situacao: situ.get(p.id) || (p.status === "novo" ? "novo" : "producao"),
    }));
  }
  return c.json({ ...card, tarefas, timeline, pedidos });
});

// ── SINCRONIZAR clientes da base → cartões ──────────────────────────────────────
// Cria um cartão para cada cliente que ainda não tem, já posicionado pela última
// compra: <120d → Ativo; 120d+ → Inativo; sem compra → Novo Lead. Cada cartão
// ganha uma tarefa-padrão (não fica em alerta). Pedidos de estoque são ignorados.
funil.post("/sincronizar", async (c) => {
  const { results: clientes } = await c.env.DB.prepare(
    "SELECT id, nome, cidade, uf, whatsapp, representante FROM clientes"
  ).all<{ id: string; nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; representante: string | null }>();
  // Clientes que já são de um REPRESENTANTE não entram no funil de prospecção
  // (têm vendedor no pedido ou representante no cadastro).
  const { results: comVend } = await c.env.DB.prepare(
    "SELECT DISTINCT cliente_nome AS nome FROM pedidos WHERE COALESCE(vendedor,'') <> ''"
  ).all<{ nome: string }>();
  const deRep = new Set(comVend.map((r) => r.nome));
  for (const cli of clientes) if (str(cli.representante)) deRep.add(cli.nome);
  const fora = (nome: string) => ehClienteInterno(nome) || deRep.has(nome);

  const { results: existentes } = await c.env.DB.prepare("SELECT id, nome FROM funil_cards").all<{ id: string; nome: string }>();
  // Limpa cartões que não deveriam estar aqui (internos ou de representante).
  let removidos = 0;
  for (const e of existentes) if (fora(e.nome)) { await apagarCard(c.env, e.id); removidos++; }
  const jaTem = new Set(existentes.filter((e) => !fora(e.nome)).map((e) => e.nome));

  const { results: ult } = await c.env.DB.prepare(
    "SELECT cliente_nome AS nome, COUNT(*) AS n, MAX(data_pedido) AS ultima FROM pedidos WHERE COALESCE(reposicao,0)=0 AND COALESCE(tipo,'') <> 'estoque' GROUP BY cliente_nome"
  ).all<{ nome: string; n: number; ultima: string | null }>();
  const compras = new Map(ult.map((r) => [r.nome, r] as const));

  let criados = 0;
  for (const cli of clientes) {
    if (fora(cli.nome)) continue; // pula internos e clientes de representante
    if (jaTem.has(cli.nome)) continue;
    const id = uid();
    const resp = str(cli.representante);
    const info = compras.get(cli.nome);
    let etapa: Etapa, tarefa: string, prazo: string;
    if (!info || info.n === 0) {
      // Sem nenhum pedido real → prospect.
      etapa = "novo-lead"; tarefa = "1º contato"; prazo = "+1 day";
    } else {
      // Já comprou → é cliente. Sem data no pedido, trata como compra recente.
      const dias = info.ultima ? diasDesde(info.ultima) : 0;
      if (dias >= 120) { etapa = "inativo"; tarefa = "Campanha de reativação"; prazo = "+2 day"; }
      else { etapa = "ativo"; tarefa = "Acompanhamento periódico"; prazo = "+30 day"; }
    }
    await c.env.DB.prepare(
      "INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, cli.id, cli.nome, str(cli.cidade), str(cli.uf), str(cli.whatsapp), etapa, resp).run();
    await c.env.DB.prepare(
      `INSERT INTO funil_tarefas (id, card_id, titulo, vence_em, responsavel) VALUES (?, ?, ?, date('now', ?), ?)`
    ).bind(uid(), id, tarefa, prazo, resp).run();
    await logar(c.env, id, "etapa", "Sincronizado da base de clientes");
    criados++;
  }
  return c.json({ criados, removidos, ignorados: clientes.length - criados });
});

// ── REATIVAÇÃO / PÓS-VENDA ─────────────────────────────────────────────────────
// 30 dias (padrão) depois do faturamento, se o cliente com WhatsApp ainda NÃO
// falou com a gente, entra na coluna "reativacao" para o pós-venda: perguntar se
// recebeu o pedido / deu tudo certo e depois oferecer reposição. Idempotente:
// pula quem já tem cartão no funil OU quem já tem conversa (já mandou mensagem).
funil.post("/reativacao", async (c) => {
  const dias = Math.max(1, Math.floor(Number(c.req.query("dias")) || 30));
  const { results: clientes } = await c.env.DB.prepare(
    `SELECT id, nome, cidade, uf, whatsapp, representante
       FROM clientes
      WHERE COALESCE(whatsapp,'') <> ''
        AND COALESCE(ultimo_faturamento,'') <> ''
        AND ultimo_faturamento <= date('now', ?)
      ORDER BY ultimo_faturamento ASC`
  ).bind(`-${dias} day`).all<{ id: string; nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; representante: string | null }>();

  const { results: existentes } = await c.env.DB.prepare("SELECT nome FROM funil_cards").all<{ nome: string }>();
  const jaTem = new Set(existentes.map((e) => e.nome));
  // Quem já tem conversa (já mandou / já falamos) não entra na fila de prospecção.
  const { results: convs } = await c.env.DB.prepare("SELECT telefone, cliente_id FROM atend_conversas").all<{ telefone: string | null; cliente_id: string | null }>().catch(() => ({ results: [] as { telefone: string | null; cliente_id: string | null }[] }));
  const jaFalou = new Set<string>();
  for (const cv of convs) {
    if (cv.cliente_id) jaFalou.add("id:" + cv.cliente_id);
    const t = (cv.telefone || "").replace(/\D/g, ""); if (t.length >= 8) jaFalou.add("tel:" + t.slice(-8));
  }

  let criados = 0;
  for (const cli of clientes) {
    if (ehClienteInterno(cli.nome) || jaTem.has(cli.nome)) continue;
    if (cli.id && jaFalou.has("id:" + cli.id)) continue;
    const tel8 = (cli.whatsapp || "").replace(/\D/g, "").slice(-8);
    if (tel8 && jaFalou.has("tel:" + tel8)) continue;
    const cardId = uid();
    const resp = str(cli.representante);
    await c.env.DB.prepare(
      "INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, ?, 'reativacao', ?)"
    ).bind(cardId, cli.id, cli.nome, str(cli.cidade), str(cli.uf), str(cli.whatsapp), resp).run();
    // Fala direto com o cliente (pós-venda + catálogo). Se ele quiser comprar e
    // tiver representante, passa a venda pro representante fechar. Se o cliente
    // reclamar que o representante não atende / atende mal, a loja assume o cliente.
    const tarefa = resp
      ? `Pós-venda + catálogo (pode falar direto): perguntar se recebeu o pedido e se deu tudo certo, mandar novidades. Se quiser comprar, passar para o representante ${resp} fechar a venda. Se reclamar que ${resp} não atende / atende mal, assumir o cliente.`
      : "Pós-venda + catálogo: perguntar se recebeu o pedido e se deu tudo certo, mandar novidades e oferecer reposição.";
    await c.env.DB.prepare(
      "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em, responsavel) VALUES (?, ?, ?, date('now','+1 day'), ?)"
    ).bind(uid(), cardId, tarefa, resp).run();
    await logar(c.env, cardId, "etapa", resp
      ? `Pós-venda automático (+${dias}d): cliente do representante ${resp} — venda vai pro representante; assumir só se houver reclamação`
      : `Pós-venda automático (+${dias}d): sem representante — contato direto`);
    jaTem.add(cli.nome);
    criados++;
  }
  return c.json({ criados, dias });
});

// ── APAGAR cartão ────────────────────────────────────────────────────────────────
funil.delete("/:id", async (c) => {
  await apagarCard(c.env, c.req.param("id"));
  return c.json({ ok: true });
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
