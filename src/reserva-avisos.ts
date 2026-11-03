// ETAPA 3 — AVISOS DE RESERVA POR WHATSAPP + PRORROGAÇÃO
// Reusa a integração Z-API do CRM (o "sender" é injetado — normalmente enviarWhatsapp — pra
// não acoplar nem criar ciclo de import). Todo envio é registrado em reserva_historico (auditoria
// e também "simulação de envio" nos testes). Regras aprovadas nas Etapas 1 e 2 são respeitadas:
//   • a janela/prazo é do SERVIDOR; aviso1 = 1h após criar, aviso2 = 1h antes de vencer;
//   • pedido já enviado ao Syntech (sync != rascunho) nunca recebe aviso de reserva;
//   • cliente: 1 prorrogação (6/12h), teto 24h desde o início; rep: 6/12/18/24h, teto 48h.
import type { Env } from "./index";
import { flagLigado, FLAG_CRM_POPUP, FLAG_RESERVAS } from "./flags";
import { protegerNoturno } from "./noite";

export type Sender = (env: Env, tel: string, texto: string) => Promise<unknown>;

const ASSINATURA = "_Esta é uma mensagem automática do sistema Big Tricot._";
const uid = () => crypto.randomUUID();
const digits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");
const core = (s: unknown) => digits(s).replace(/^55/, "").slice(-8);
const H = 3600000;

// 'YYYY-MM-DD HH:MM:SS' (UTC) do instante — mesmo formato de datetime('now'), pra comparar no SQLite.
const toSqlUTC = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
// epoch a partir do texto UTC do banco.
const fromSql = (s: string | null) => (s ? new Date(String(s).replace(" ", "T") + "Z").getTime() : null);

// "HH:MM de DD/MM" no fuso de Brasília.
function fmtBR(ms: number): string {
  try {
    const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    const p: Record<string, string> = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    return `${p.hour}:${p.minute} de ${p.day}/${p.month}`;
  } catch {
    const d = new Date(ms - 3 * H); // fallback UTC-3
    const z = (n: number) => String(n).padStart(2, "0");
    return `${z(d.getUTCHours())}:${z(d.getUTCMinutes())} de ${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}`;
  }
}

// "HH:MM de DD/MM" no fuso de Brasília — exportado p/ a tela (loja) formatar igual ao WhatsApp.
export { fmtBR };

// Opções de prorrogação VÁLIDAS agora (número fixo → horas), filtradas pelo teto total.
// Cliente: só 1 prorrogação (nenhuma opção depois disso), teto 24h; rep: teto 48h.
export function opcoesValidas(ehRep: boolean, iniMs: number, expMs: number, prorr: number): [number, number][] {
  if (!ehRep && prorr >= 1) return [];
  const tetoH = ehRep ? 48 : 24;
  const capAbs = iniMs + tetoH * H;
  const tabela: [number, number][] = ehRep ? [[1, 6], [2, 12], [3, 18], [4, 24]] : [[1, 6], [2, 12]];
  return tabela.filter(([, h]) => expMs + h * H <= capAbs + 60000); // 1min de folga
}
const listaOpcoes = (opts: [number, number][]) => opts.map(([n, h]) => `*${n}* = +${h} horas`).join("\n");

// ── Mensagens ────────────────────────────────────────────────────────────────
function msgAviso1(ehRep: boolean, cliente: string, expMs: number): string {
  const quem = ehRep ? `do cliente *${cliente}*` : "do seu carrinho";
  return `🧶 *Big Tricot* — Reserva confirmada\n\nSeparamos os itens ${quem}. Eles ficam *reservados até ${fmtBR(expMs)}* (horário de Brasília).\nFinalize o pedido antes disso para garantir as peças. 💛\n\n${ASSINATURA}`;
}
function msgAviso2(ehRep: boolean, cliente: string, expMs: number, opts: [number, number][]): string {
  const quem = ehRep ? `A reserva do cliente *${cliente}*` : "Sua reserva";
  const base = `⏳ *Big Tricot* — Vencimento da reserva\n\n${quem} vence às *${fmtBR(expMs)}* (horário de Brasília), daqui a cerca de 1 hora.`;
  const extra = opts.length
    ? `\n\nQuer mais tempo? Responda com o número:\n${listaOpcoes(opts)}\n\nOu finalize o pedido agora para garantir as peças.`
    : `\n\nFinalize o pedido agora para garantir as peças.`;
  return `${base}${extra}\n\n${ASSINATURA}`;
}
function msgConfirma(ehRep: boolean, cliente: string, novoExpMs: number): string {
  const quem = ehRep ? `A reserva do cliente *${cliente}*` : "Sua reserva";
  return `✅ *Big Tricot* — Prazo estendido\n\n${quem} agora vence às *${fmtBR(novoExpMs)}* (horário de Brasília).\n\n${ASSINATURA}`;
}
function msgRecusa(motivo: string, ehRep: boolean, opts: [number, number][], expMs: number): string {
  let corpo: string;
  if (motivo === "ja_prorrogado") corpo = `Esta reserva já foi prorrogada uma vez e não pode ser estendida novamente. Ela vence às *${fmtBR(expMs)}*.`;
  else if (motivo === "expirado") corpo = "Esta reserva já venceu e as peças foram liberadas. Monte o pedido novamente, se desejar. 💛";
  else corpo = opts.length ? `Opção inválida. Responda com:\n${listaOpcoes(opts)}` : `Não há mais prorrogação disponível. A reserva vence às *${fmtBR(expMs)}*.`;
  return `*Big Tricot*\n\n${corpo}\n\n${ASSINATURA}`;
}
const msgAmbiguo = () => `*Big Tricot*\n\nVocê tem mais de um carrinho com reserva ativa. Para prorrogar o prazo com segurança, fale com a Big Tricot informando o cliente/pedido. 💛\n\n${ASSINATURA}`;

async function registrar(env: Env, pedidoId: string, evento: string, tel: string, detalhe: string): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO reserva_historico (id, pedido_id, evento, telefone, detalhe) VALUES (?,?,?,?,?)")
      .bind(uid(), pedidoId, evento, tel || null, detalhe.slice(0, 2000)).run();
  } catch { /* histórico nunca derruba o fluxo */ }
}

// Destinatário do aviso: representante (por nome) quando é pedido de rep; senão o cliente.
async function destinoDoPedido(env: Env, p: { vendedor: string; cliente_id: string | null; cliente_nome: string }):
  Promise<{ tel: string; ehRep: boolean; cliente: string } | null> {
  if (p.vendedor) {
    const rep = await env.DB.prepare("SELECT whatsapp FROM representantes WHERE lower(nome)=lower(?) LIMIT 1").bind(p.vendedor).first<{ whatsapp: string | null }>().catch(() => null);
    const tel = digits(rep?.whatsapp);
    return tel ? { tel, ehRep: true, cliente: p.cliente_nome } : null;
  }
  const cli = await env.DB.prepare("SELECT COALESCE(whatsapp,'') AS w, COALESCE(telefone,'') AS t, COALESCE(nome,'') AS nome FROM clientes WHERE id=? LIMIT 1").bind(p.cliente_id).first<{ w: string; t: string; nome: string }>().catch(() => null);
  const tel = digits(cli?.w) || digits(cli?.t);
  return tel ? { tel, ehRep: false, cliente: cli?.nome || p.cliente_nome } : null;
}

type PedRow = { id: string; vendedor: string; cliente_id: string | null; cliente_nome: string; ini: string | null; exp: string | null; a1: string | null; a2: string | null; prorr: number };

// NÚCLEO DA PRORROGAÇÃO — compartilhado entre WhatsApp e TELA (mesmas regras/limites).
// Valida a opção (1..4 → horas) contra o teto (cliente 24h/1x · rep 48h) e aplica de forma
// ATÔMICA e idempotente. `exigirOferta`=true no WhatsApp (precisa do aviso2 pendente, o que
// também bloqueia resposta repetida); false na tela (o dono pode prorrogar durante a janela).
// Ao aplicar, zera reserva_aviso2_em → REAGENDA o aviso de vencimento pro novo prazo.
export type ProrrogaRes =
  | { ok: true; horas: number; novoExpMs: number; ehRep: boolean; cliente: string }
  | { ok: false; motivo: "sem_reserva" | "expirado" | "opcao_invalida" | "ja_prorrogado" | "nao_aplicou"; expMs?: number; ehRep?: boolean; opts?: [number, number][] };
export async function prorrogarPedido(env: Env, pedidoId: string, opt: number, exigirOferta: boolean): Promise<ProrrogaRes> {
  const p = await env.DB.prepare(
    `SELECT COALESCE(vendedor,'') AS vendedor, COALESCE(cliente_nome,'') AS cliente_nome,
            reserva_iniciada_em AS ini, reserva_expira_em AS exp, COALESCE(reserva_prorrogacoes,0) AS prorr,
            COALESCE(erp_sync_status,'') AS sync, reserva_aviso2_em AS a2
       FROM pedidos WHERE id=? AND canal='loja_b2b' LIMIT 1`
  ).bind(pedidoId).first<{ vendedor: string; cliente_nome: string; ini: string | null; exp: string | null; prorr: number; sync: string; a2: string | null }>().catch(() => null);
  if (!p || p.sync !== "rascunho") return { ok: false, motivo: "sem_reserva" };
  const iniMs = fromSql(p.ini), expMs = fromSql(p.exp);
  const ehRep = !!p.vendedor;
  if (iniMs == null || expMs == null || expMs <= Date.now()) return { ok: false, motivo: "expirado", ehRep };
  const opts = opcoesValidas(ehRep, iniMs, expMs, p.prorr);
  const escolha = opts.find(([n]) => n === opt);
  if (!escolha) return { ok: false, motivo: (!ehRep && p.prorr >= 1) ? "ja_prorrogado" : "opcao_invalida", expMs, ehRep, opts };
  const horas = escolha[1];
  // PROTEÇÃO NOTURNA na prorrogação (Etapa 1): os +Xh partem do vencimento EFETIVO atual; se o novo
  // vencimento cair de madrugada (20h–8h SP), reaplica a proteção (volta para as 10h). Guarda o
  // vencimento base (pré-proteção) em reserva_expira_original e marca reserva_noturna.
  const baseMs = expMs + horas * H;
  const prot = protegerNoturno(baseMs);
  const novoExpMs = prot.exp;
  const cond = exigirOferta ? "AND reserva_aviso2_em IS NOT NULL" : "";
  const r = await env.DB.prepare(
    `UPDATE pedidos SET reserva_expira_em=?, reserva_expira_original=?, reserva_noturna=?, reserva_prorrogacoes=COALESCE(reserva_prorrogacoes,0)+1, reserva_aviso2_em=NULL
       WHERE id=? AND canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho' AND reserva_expira_em > datetime('now') ${cond}`
  ).bind(toSqlUTC(novoExpMs), toSqlUTC(baseMs), prot.protegido ? 1 : 0, pedidoId).run();
  if (Number((r as { meta?: { changes?: number } })?.meta?.changes ?? 0) <= 0) return { ok: false, motivo: "nao_aplicou", expMs, ehRep, opts };
  return { ok: true, horas, novoExpMs, ehRep, cliente: p.cliente_nome };
}

// Varredura dos avisos — chamada pelo cron */5. Envia aviso1 (1h após criar) e aviso2 (1h antes
// de vencer). Só mexe em RASCUNHO ativo da loja; nunca em pedido enviado ao Syntech.
export async function processarAvisosReserva(env: Env, sender: Sender): Promise<{ aviso1: number; aviso2: number }> {
  // INTERRUPTOR "reservas_ativo": desligado → não processa avisos (o ciclo de reservas está parado).
  // Não altera pedido/reserva algum; apenas não dispara avisos novos. (O envio em si ainda depende
  // do controle próprio do WhatsApp, zapi_ativo, dentro do sender.)
  if (!(await flagLigado(env, FLAG_RESERVAS))) return { aviso1: 0, aviso2: 0 };
  const now = Date.now();
  const rows = ((await env.DB.prepare(
    `SELECT id, COALESCE(vendedor,'') AS vendedor, cliente_id, COALESCE(cliente_nome,'') AS cliente_nome,
            reserva_iniciada_em AS ini, reserva_expira_em AS exp, reserva_aviso1_em AS a1, reserva_aviso2_em AS a2,
            COALESCE(reserva_prorrogacoes,0) AS prorr
       FROM pedidos
      WHERE canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho'
        AND reserva_expira_em IS NOT NULL AND reserva_expira_em > datetime('now')`
  ).all<PedRow>().catch(() => ({ results: [] as PedRow[] }))).results) || [];
  let c1 = 0, c2 = 0;
  for (const p of rows) {
    const iniMs = fromSql(p.ini), expMs = fromSql(p.exp);
    if (iniMs == null || expMs == null || now >= expMs) continue;
    const dest = await destinoDoPedido(env, p);
    if (!dest) continue; // sem telefone → não há como avisar
    // AVISO 1 — 1h após a criação (uma única vez). RECLAMA o envio de forma atômica (UPDATE
    // condicional) ANTES de enviar: dois crons concorrentes nunca mandam o mesmo aviso duas vezes.
    if (!p.a1 && now >= iniMs + H) {
      const r = await env.DB.prepare("UPDATE pedidos SET reserva_aviso1_em=datetime('now'), reserva_aviso_tel=? WHERE id=? AND reserva_aviso1_em IS NULL").bind(dest.tel, p.id).run();
      if (Number((r as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0) {
        const texto = msgAviso1(dest.ehRep, dest.cliente, expMs);
        await registrar(env, p.id, "aviso1", dest.tel, texto);
        await sender(env, dest.tel, texto).catch(() => {});
        c1++;
      }
    }
    // AVISO 2 — 1h antes do vencimento (reagenda ao prorrogar, pois a2 volta a NULL). Mesma reclamação atômica.
    if (!p.a2 && now >= expMs - H) {
      const r = await env.DB.prepare("UPDATE pedidos SET reserva_aviso2_em=datetime('now'), reserva_aviso_tel=? WHERE id=? AND reserva_aviso2_em IS NULL").bind(dest.tel, p.id).run();
      if (Number((r as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0) {
        const opts = opcoesValidas(dest.ehRep, iniMs, expMs, p.prorr);
        const texto = msgAviso2(dest.ehRep, dest.cliente, expMs, opts);
        await registrar(env, p.id, "aviso2", dest.tel, texto);
        await sender(env, dest.tel, texto).catch(() => {});
        c2++;
      }
    }
  }
  return { aviso1: c1, aviso2: c2 };
}

// ETAPA 5 — CONFIRMAÇÃO DE RECEBIMENTO NO SYNTECH (Evento 1).
// Chamada quando a ponte confirma a gravação no Syntech (erp_sync_status='enviado' + numero).
// Envia UMA mensagem de recebimento (idempotente via reserva_recebido_aviso_em), ao destinatário
// certo (cliente direto → cliente; pedido de rep → só o rep, identificando o cliente). NÃO libera
// estoque e NÃO significa aprovação. Falha de WhatsApp não afeta o pedido (best-effort).
export async function avisarRecebidoSyntech(env: Env, pedidoId: string, numero: number | string, sender: Sender): Promise<"enviado" | "ja_avisado" | "sem_destino" | "sem_pedido"> {
  // reclama o aviso de forma atômica: só o PRIMEIRO a marcar envia (a ponte pode reenviar).
  const r = await env.DB.prepare(
    "UPDATE pedidos SET reserva_recebido_aviso_em=datetime('now') WHERE id=? AND canal='loja_b2b' AND reserva_recebido_aviso_em IS NULL"
  ).bind(pedidoId).run();
  if (Number((r as { meta?: { changes?: number } })?.meta?.changes ?? 0) <= 0) {
    // ou o pedido não é loja_b2b, ou já avisamos antes
    const existe = await env.DB.prepare("SELECT 1 FROM pedidos WHERE id=? AND canal='loja_b2b' LIMIT 1").bind(pedidoId).first().catch(() => null);
    return existe ? "ja_avisado" : "sem_pedido";
  }
  const p = await env.DB.prepare("SELECT COALESCE(vendedor,'') AS vendedor, cliente_id, COALESCE(cliente_nome,'') AS cliente_nome FROM pedidos WHERE id=? LIMIT 1").bind(pedidoId).first<{ vendedor: string; cliente_id: string | null; cliente_nome: string }>().catch(() => null);
  if (!p) return "sem_pedido";
  const dest = await destinoDoPedido(env, p);
  if (!dest) return "sem_destino"; // sem telefone → não há como avisar (o carimbo fica; não retentamos)
  const num = String(numero);
  const msg = dest.ehRep
    ? `Olá! 😊 O pedido nº ${num}, do cliente ${dest.cliente}, foi recebido pela Big Tricot!\nCaso tenhamos alguma dúvida ou precisemos confirmar alguma informação, nossa equipe entrará em contato.\nEsta é uma mensagem automática do sistema Big Tricot.`
    : `Olá! 😊 Seu pedido nº ${num} foi recebido pela Big Tricot!\nCaso tenhamos alguma dúvida ou precisemos confirmar alguma informação, nossa equipe entrará em contato.\nAgradecemos pela preferência!\nEsta é uma mensagem automática do sistema Big Tricot.`;
  await registrar(env, pedidoId, "recebido", dest.tel, msg);
  await sender(env, dest.tel, msg).catch(() => {});
  return "enviado";
}

// ETAPA 6 — NOTIFICAÇÃO INDIVIDUAL DO CRM (Evento 1, recebido no Syntech).
// Cria o aviso "seu cliente fez um pedido" SÓ para o VENDEDOR INTERNO dono da carteira do cliente.
// Sem vendedor vinculado → NÃO notifica ninguém (o cliente aparece na lista admin "sem vínculo").
// Idempotente (único por pedido+usuário). NÃO mexe em representante, PCP, produção ou reservas.
export async function notificarVendedorInterno(env: Env, pedidoId: string, numero: number | string): Promise<"criada" | "sem_vendedor" | "sem_pedido" | "desligado"> {
  // INTERRUPTOR "crm_popup_ativo": desligado (padrão) → NÃO cria notificação de CRM.
  // O recebido no Syntech segue normal; só o pop-up individual deixa de ser gerado.
  if (!(await flagLigado(env, FLAG_CRM_POPUP))) return "desligado";
  const p = await env.DB.prepare(
    "SELECT cliente_id, COALESCE(cliente_nome,'') AS cliente_nome, COALESCE(vendedor,'') AS vendedor, valor_total AS valor FROM pedidos WHERE id=? AND canal='loja_b2b' LIMIT 1"
  ).bind(pedidoId).first<{ cliente_id: string | null; cliente_nome: string; vendedor: string; valor: number | null }>().catch(() => null);
  if (!p) return "sem_pedido";
  const cli = await env.DB.prepare("SELECT COALESCE(vendedor_interno,'') AS vi, COALESCE(representante,'') AS rep FROM clientes WHERE id=? LIMIT 1").bind(p.cliente_id).first<{ vi: string; rep: string }>().catch(() => null);
  const vi = (cli?.vi || "").trim();
  if (!vi) return "sem_vendedor";
  const pc = await env.DB.prepare("SELECT COALESCE(SUM(qtd),0) AS n FROM pedido_itens WHERE pedido_id=?").bind(pedidoId).first<{ n: number }>().catch(() => null);
  const pecas = Number(pc?.n) || 0;
  const representante = (p.vendedor || cli?.rep || "").trim() || null;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO crm_notificacoes (id, usuario_id, pedido_id, cliente_id, numero_erp, cliente_nome, representante, valor_total, pecas, recebido_em) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))"
  ).bind(uid(), vi, pedidoId, p.cliente_id ?? null, String(numero), p.cliente_nome, representante, p.valor ?? null, pecas).run().catch(() => {});
  return "criada";
}

// Trata uma resposta recebida no WhatsApp. Devolve null se NÃO for uma resposta de prorrogação
// (aí o webhook segue o fluxo normal do CRM). Devolve um rótulo quando tratou (aplicou/negou).
// Segurança: só age se houver UMA oferta ativa (aviso2 enviado, não vencida) PARA ESTE telefone.
export async function tratarRespostaProrrogacao(env: Env, phone: string, texto: string, sender: Sender): Promise<string | null> {
  const m = String(texto ?? "").trim().match(/^([1-4])(?:\D|$)/); // opção 1..4 (bare ou "2 por favor")
  if (!m) return null;
  const opt = Number(m[1]);
  const pc = core(phone);
  if (pc.length < 7) return null;
  const rows = ((await env.DB.prepare(
    `SELECT id, COALESCE(vendedor,'') AS vendedor, cliente_id, COALESCE(cliente_nome,'') AS cliente_nome,
            reserva_iniciada_em AS ini, reserva_expira_em AS exp, reserva_aviso1_em AS a1, reserva_aviso2_em AS a2,
            COALESCE(reserva_prorrogacoes,0) AS prorr, COALESCE(reserva_aviso_tel,'') AS tel
       FROM pedidos
      WHERE canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho'
        AND reserva_aviso2_em IS NOT NULL AND reserva_expira_em > datetime('now')
        AND reserva_aviso_tel IS NOT NULL`
  ).all<PedRow & { tel: string }>().catch(() => ({ results: [] as (PedRow & { tel: string })[] }))).results) || [];
  const cands = rows.filter((r) => core(r.tel) === pc);
  if (cands.length === 0) return null;                 // telefone sem oferta ativa → não é pra nós
  if (cands.length > 1) { await sender(env, phone, msgAmbiguo()).catch(() => {}); return "ambiguo"; }
  const p = cands[0];
  const res = await prorrogarPedido(env, p.id, opt, true); // WhatsApp: exige a oferta (aviso2) ativa
  if (!res.ok) {
    const motivo = res.motivo === "nao_aplicou" ? "expirado" : res.motivo;
    const msg = msgRecusa(motivo, !!res.ehRep, res.opts || [], res.expMs ?? fromSql(p.exp) ?? Date.now());
    await registrar(env, p.id, "prorrogacao_negada", phone, `[${motivo} opt=${opt}] ${msg}`);
    await sender(env, phone, msg).catch(() => {});
    return motivo;
  }
  await registrar(env, p.id, "prorrogacao", phone, `whatsapp +${res.horas}h -> ${toSqlUTC(res.novoExpMs)}`);
  const conf = msgConfirma(res.ehRep, res.cliente, res.novoExpMs);
  await registrar(env, p.id, "confirmacao", phone, conf);
  await sender(env, phone, conf).catch(() => {});
  return "prorrogado";
}
