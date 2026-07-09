// Robô de atendimento do WhatsApp — rotas: recebe mensagem (webhook/simulador),
// roda a máquina de estados, persiste conversa+histórico e responde. O envio real
// pela Z-API e a consulta SINTEGRA entram nos stubs marcados com TODO.
import { Hono } from "hono";
import type { Env } from "../index";
import { processar, colunaDe, ATEND_COLUNAS, FOLLOWUP_24H, type Conversa, type Deps, type LojaParceira } from "../atendimento_bot";
import { ehClienteInterno } from "./funil";

export const atendimento = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

type ConvRow = Conversa & {
  id: string; telefone: string; responsavel: string | null; card_id: string | null;
  ultima_in_em: string | null; ultima_out_em: string | null; criado_em: string; atualizado_em: string;
};

// ── Dependências (SINTEGRA + lojas parceiras) ────────────────────────────────────
function deps(env: Env): Deps {
  return {
    // TODO(SINTEGRA): trocar pela consulta real de IE/SINTEGRA. Por ora: se o CNPJ
    // já é cliente da base → lojista; senão assume lojista (pendente de verificação).
    async sintegra(cnpj) {
      const cli = await env.DB.prepare(
        "SELECT 1 FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-','') = ? LIMIT 1"
      ).bind(cnpj).first().catch(() => null);
      return { lojista: true, fonte: cli ? "base" : "pendente-sintegra" };
    },
    // Lojas parceiras perto da cidade/UF: clientes reais, priorizando ativos e frequentes.
    async parceiros(cidade, uf) {
      const conds: string[] = ["COALESCE(reposicao,0)=0"]; // via subquery abaixo
      const cond: string[] = [];
      const args: unknown[] = [];
      if (uf) { cond.push("UPPER(COALESCE(c.uf,'')) = ?"); args.push(uf.toUpperCase()); }
      if (cidade) { cond.push("UPPER(COALESCE(c.cidade,'')) LIKE ?"); args.push("%" + cidade.trim().toUpperCase() + "%"); }
      if (!cond.length) return [];
      void conds;
      const { results } = await env.DB.prepare(
        `SELECT c.nome, c.cidade, c.uf, c.whatsapp,
                (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_nome=c.nome AND COALESCE(p.reposicao,0)=0 AND COALESCE(p.tipo,'')<>'estoque') AS n,
                (SELECT MAX(p.data_pedido) FROM pedidos p WHERE p.cliente_nome=c.nome AND COALESCE(p.reposicao,0)=0 AND COALESCE(p.tipo,'')<>'estoque') AS ultima
           FROM clientes c WHERE ${cond.join(" AND ")}`
      ).bind(...args).all<{ nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; n: number; ultima: string | null }>();
      const hoje = Date.now();
      const lojas: (LojaParceira & { score: number })[] = results
        .filter((r) => !ehClienteInterno(r.nome))
        .map((r) => {
          const dias = r.ultima ? Math.floor((hoje - Date.parse(r.ultima + "T00:00:00Z")) / 86400000) : 9999;
          const ativo = dias <= 90;
          const freq = r.n >= 3;
          return { nome: r.nome, cidade: r.cidade, uf: r.uf, whatsapp: r.whatsapp, ativo, freq, score: (ativo ? 100 : 0) + Math.min(r.n, 20) - dias / 30 };
        });
      lojas.sort((a, b) => b.score - a.score);
      return lojas.slice(0, 3);
    },
  };
}

async function addMsg(env: Env, convId: string, direcao: "in" | "out", autor: string, tipo: string, texto: string) {
  await env.DB.prepare(
    "INSERT INTO atend_mensagens (id, conversa_id, direcao, autor, tipo, texto) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(uid(), convId, direcao, autor, tipo, texto).run();
}

// ── ENTRADA de mensagem (webhook da Z-API OU simulador) ──────────────────────────
// Corpo: { telefone, texto }. Cria/atualiza a conversa, roda o robô e devolve as
// respostas (o envio real pela Z-API é feito aqui, no stub enviarWhatsapp).
atendimento.post("/entrada", async (c) => {
  const b = await c.req.json<{ telefone?: string; texto?: string }>().catch(() => ({}) as Record<string, string>);
  const tel = digitos(b.telefone);
  const texto = String(b.texto ?? "");
  if (!tel) return c.json({ error: "telefone é obrigatório" }, 400);

  let conv = await c.env.DB.prepare("SELECT * FROM atend_conversas WHERE telefone = ?").bind(tel).first<ConvRow>();
  if (!conv) {
    const id = uid();
    await c.env.DB.prepare("INSERT INTO atend_conversas (id, telefone, estado) VALUES (?, ?, 'novo')").bind(id, tel).run();
    conv = { id, telefone: tel, estado: "novo" } as ConvRow;
  }
  await addMsg(c.env, conv.id, "in", "cliente", "texto", texto);
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_in_em = datetime('now') WHERE id = ?").bind(conv.id).run();

  const r = await processar(conv as Conversa, texto, deps(c.env));
  await c.env.DB.prepare(
    `UPDATE atend_conversas SET estado=?, nome=?, setor=?, cnpj=?, cidade=?, uf=?, lojista=?, atualizado_em=datetime('now') WHERE id=?`
  ).bind(r.conv.estado, r.conv.nome ?? null, r.conv.setor ?? null, r.conv.cnpj ?? null, r.conv.cidade ?? null, r.conv.uf ?? null, r.conv.lojista ?? null, conv.id).run();

  for (const s of r.saidas) {
    await addMsg(c.env, conv.id, "out", "bot", s.tipo, s.texto);
    await enviarWhatsapp(c.env, tel, s); // TODO(Z-API): envio real
  }
  if (r.saidas.length) await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();

  // Qualificou (lojista + catálogo) → vira lead no Funil de Vendas.
  if (r.qualificado && !conv.card_id) {
    const cardId = uid();
    await c.env.DB.prepare(
      "INSERT INTO funil_cards (id, nome, whatsapp, etapa, responsavel) VALUES (?, ?, ?, 'primeiro-contato', ?)"
    ).bind(cardId, r.conv.nome || "Lead WhatsApp", tel, conv.responsavel ?? null).run();
    await c.env.DB.prepare(
      "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em) VALUES (?, ?, 'Assumir e montar pedido', date('now','+1 day'))"
    ).bind(uid(), cardId).run();
    await c.env.DB.prepare("UPDATE atend_conversas SET card_id=? WHERE id=?").bind(cardId, conv.id).run();
  }

  return c.json({ conversa_id: conv.id, estado: r.conv.estado, coluna: colunaDe(r.conv.estado), respostas: r.saidas, notificarHumano: r.notificarHumano });
});

// Stub de envio pela Z-API (substituir pela chamada HTTP real).
async function enviarWhatsapp(_env: Env, _tel: string, _saida: { tipo: string; texto: string }) {
  // TODO(Z-API): POST https://api.z-api.io/instances/<id>/token/<t>/send-text
  return;
}

// ── BOARD (conversas por coluna) ──────────────────────────────────────────────────
atendimento.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.telefone, c.nome, c.estado, c.setor, c.cnpj, c.cidade, c.uf, c.lojista, c.responsavel, c.atualizado_em,
            (SELECT texto FROM atend_mensagens m WHERE m.conversa_id=c.id ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 1) AS ultima_msg
       FROM atend_conversas c ORDER BY c.atualizado_em DESC`
  ).all<Record<string, unknown>>();
  const conversas = results.map((r) => ({ ...r, coluna: colunaDe(String(r.estado)) }));
  return c.json({ colunas: ATEND_COLUNAS, conversas });
});

// ── DETALHE (conversa + histórico) ─────────────────────────────────────────────────
atendimento.get("/:id", async (c) => {
  const conv = await c.env.DB.prepare("SELECT * FROM atend_conversas WHERE id = ?").bind(c.req.param("id")).first<ConvRow>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const { results: mensagens } = await c.env.DB.prepare(
    "SELECT id, direcao, autor, tipo, texto, criado_em FROM atend_mensagens WHERE conversa_id = ? ORDER BY criado_em ASC, rowid ASC"
  ).bind(conv.id).all();
  return c.json({ ...conv, coluna: colunaDe(conv.estado), mensagens });
});

// ── Atendente humano assume ─────────────────────────────────────────────────────────
atendimento.post("/:id/assumir", async (c) => {
  const b = await c.req.json<{ responsavel?: string }>().catch(() => ({}) as Record<string, string>);
  const resp = (b.responsavel || "").trim() || "Atendente";
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', responsavel=?, atualizado_em=datetime('now') WHERE id=?").bind(resp, id).run();
  await addMsg(c.env, id, "out", "sistema", "sistema", `${resp} assumiu o atendimento.`);
  return c.json({ ok: true });
});

// ── Atendente envia mensagem manual ──────────────────────────────────────────────────
atendimento.post("/:id/enviar", async (c) => {
  const b = await c.req.json<{ texto?: string; autor?: string }>().catch(() => ({}) as Record<string, string>);
  const texto = (b.texto || "").trim();
  if (!texto) return c.json({ error: "texto é obrigatório" }, 400);
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  await addMsg(c.env, id, "out", (b.autor || "Atendente").trim(), "texto", texto);
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  await enviarWhatsapp(c.env, conv.telefone, { tipo: "texto", texto });
  return c.json({ ok: true });
});

// ── FOLLOW-UP 24h (chamado pelo cron) ────────────────────────────────────────────────
// Conversas com catálogo enviado há +24h sem resposta do cliente → mensagem de
// retomada e move para a coluna Follow-up 24h.
export async function followupAtendimento(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, telefone FROM atend_conversas
      WHERE estado='catalogo-enviado'
        AND ultima_out_em IS NOT NULL
        AND ultima_out_em <= datetime('now','-24 hours')
        AND (ultima_in_em IS NULL OR ultima_in_em <= ultima_out_em)`
  ).all<{ id: string; telefone: string }>();
  for (const conv of results) {
    await addMsg(env, conv.id, "out", "bot", "texto", FOLLOWUP_24H);
    await enviarWhatsapp(env, conv.telefone, { tipo: "texto", texto: FOLLOWUP_24H });
    await env.DB.prepare("UPDATE atend_conversas SET estado='follow-up-24h', ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
  }
  return results.length;
}
