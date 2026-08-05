// Robô de atendimento do WhatsApp — rotas: recebe mensagem (webhook/simulador),
// roda a máquina de estados, persiste conversa+histórico e responde. O envio real
// pela Z-API e a consulta SINTEGRA entram nos stubs marcados com TODO.
import { Hono } from "hono";
import type { Env } from "../index";
import { processar, colunaDe, ATEND_COLUNAS, BOAS_VINDAS, montarCatalogo, type Conversa, type Deps, type LojaParceira, type Saida, type EstadoAtend } from "../atendimento_bot";
import { ehClienteInterno } from "./funil";
import { enviarPush } from "../push-send";

export const atendimento = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// ── Config (chave/valor no banco) ────────────────────────────────────────────────
async function lerConfig(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare("SELECT chave, valor FROM config").all<{ chave: string; valor: string | null }>().catch(() => ({ results: [] as { chave: string; valor: string | null }[] }));
  const out: Record<string, string> = {};
  for (const r of results) out[r.chave] = r.valor ?? "";
  return out;
}

type ConvRow = Conversa & {
  id: string; telefone: string; responsavel: string | null; card_id: string | null; cliente_id: string | null; contato_nome: string | null;
  autorizado: number | null; followup_etapa: number | null; ultima_in_em: string | null; ultima_out_em: string | null; criado_em: string; atualizado_em: string;
  coluna_manual: string | null; encerrado_em: string | null;
};

// Site PÚBLICO de "Onde Comprar" (lojas parceiras) que a Big manda pro consumidor final.
// É o domínio oficial — NÃO o endereço interno (workers.dev). Pode ser trocado na config
// (chave "vitrine_url"); se vazio, usa este padrão.
const VITRINE_PUBLICA = "https://ondecomprar.bigtricot.com.br";

// ── Dependências (SINTEGRA + lojas parceiras) ────────────────────────────────────
function deps(env: Env, cat?: { url?: string | null; senha?: string | null; msg?: string | null }, vitrineUrl?: string | null): Deps {
  return {
    vitrineUrl: (vitrineUrl || VITRINE_PUBLICA).replace(/\/+$/, ""),
    catalogoMsg: cat?.msg ?? null,
    catalogoUrl: cat?.url ?? null,
    catalogoSenha: cat?.senha ?? null,
    // Consulta o CNPJ: 1º na base própria (cliente já cadastrado → aceita na hora,
    // offline-safe); senão na Receita via BrasilAPI (confirma existência + situação).
    async consultarCnpj(cnpj) {
      const cli = await env.DB.prepare(
        "SELECT nome, cidade, uf FROM clientes WHERE REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-','') = ? LIMIT 1"
      ).bind(cnpj).first<{ nome: string | null; cidade: string | null; uf: string | null }>().catch(() => null);
      if (cli) return { existe: true, ativa: true, nome: cli.nome ?? null, uf: cli.uf, cidade: cli.cidade, fonte: "base" };
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
        });
        if (resp.status === 404) return { existe: false, ativa: false, nome: null, fonte: "brasilapi" };
        if (!resp.ok) return { existe: false, ativa: false, nome: null, erro: true, fonte: `brasilapi-${resp.status}` };
        const j = await resp.json<{ razao_social?: string; nome_fantasia?: string; descricao_situacao_cadastral?: string; situacao_cadastral?: number | string; uf?: string; municipio?: string }>();
        const desc = String(j.descricao_situacao_cadastral ?? "").toUpperCase();
        const ativa = desc.includes("ATIVA") || Number(j.situacao_cadastral) === 2;
        const nome = (j.nome_fantasia || j.razao_social || "").trim() || null;
        const uf = (j.uf || "").trim().toUpperCase() || null;
        const cidade = (j.municipio || "").trim() || null;
        return { existe: true, ativa, nome, uf, cidade, fonte: "brasilapi" };
      } catch {
        return { existe: false, ativa: false, nome: null, erro: true, fonte: "erro-rede" };
      }
    },
    // Lojas parceiras perto da cidade/UF: cadastro próprio (tabela lojas_parceiras).
    async parceiros(cidade, uf) {
      const cond: string[] = ["COALESCE(ativo,1)=1"];
      const args: unknown[] = [];
      if (uf) { cond.push("UPPER(COALESCE(uf,'')) = ?"); args.push(uf.toUpperCase()); }
      if (cidade) { cond.push("UPPER(COALESCE(cidade,'')) LIKE ?"); args.push("%" + cidade.trim().toUpperCase() + "%"); }
      if (!uf && !cidade) return [];
      const { results } = await env.DB.prepare(
        `SELECT nome, cidade, uf, whatsapp, instagram FROM lojas_parceiras WHERE ${cond.join(" AND ")} ORDER BY cidade, nome`
      ).bind(...args).all<{ nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; instagram: string | null }>().catch(() => ({ results: [] as { nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; instagram: string | null }[] }));
      return results.map((r) => ({ nome: r.nome, cidade: r.cidade, uf: r.uf, whatsapp: r.whatsapp, instagram: r.instagram, ativo: true, freq: false }));
    },
  };
}

// ── CRM: identificação do contato + roteamento por região ────────────────────────
// Casa o telefone pelo sufixo (últimos 8 dígitos): ignora DDI, formatação e o 9º dígito.
const LIMPA_WPP = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''),'.',''),'-',''),'(',''),')',''),' ','')";

async function identificarCliente(env: Env, tel: string) {
  const core = digitos(tel).slice(-8);
  if (core.length < 8) return null;
  return env.DB.prepare(
    `SELECT id, nome, cnpj, cidade, uf, representante, instagram FROM clientes WHERE ${LIMPA_WPP} LIKE '%' || ? LIMIT 1`
  ).bind(core).first<{ id: string; nome: string; cnpj: string | null; cidade: string | null; uf: string | null; representante: string | null; instagram: string | null }>().catch(() => null);
}

// Núcleo canônico do telefone: DDD (2) + últimos 8 dígitos. Serve pra reconhecer a MESMA pessoa
// mesmo quando o número chega ora com o 9º dígito, ora sem (ex.: 5565992752099 e 556592752099),
// ou com/sem o DDI 55. Assim a gente NÃO cria duas conversas (dois cards) pro mesmo contato.
function nucleoTel(t: unknown): string {
  let d = digitos(t);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2); // tira o DDI do Brasil
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d;
}
// Acha a conversa da pessoa tolerando variação do número (9º dígito / DDI). Tenta o exato
// primeiro; se não achar, procura pelos últimos 8 dígitos e confirma pelo núcleo canônico.
async function acharConversaPorTelefone(env: Env, tel: string): Promise<ConvRow | null> {
  const t = digitos(tel);
  const exato = await env.DB.prepare("SELECT * FROM atend_conversas WHERE telefone = ?").bind(t).first<ConvRow>();
  if (exato) return exato;
  const core8 = t.slice(-8);
  if (core8.length < 8) return null;
  const nuc = nucleoTel(t);
  const { results } = await env.DB.prepare("SELECT * FROM atend_conversas WHERE telefone LIKE '%' || ? ORDER BY atualizado_em DESC").bind(core8).all<ConvRow>().catch(() => ({ results: [] as ConvRow[] }));
  for (const r of (results || [])) if (nucleoTel(String(r.telefone)) === nuc) return r;
  return null;
}

async function ehRepresentante(env: Env, tel: string) {
  const core = digitos(tel).slice(-8);
  if (core.length < 8) return null;
  return env.DB.prepare(
    `SELECT nome FROM representantes WHERE COALESCE(ativo,1)=1 AND ${LIMPA_WPP} LIKE '%' || ? LIMIT 1`
  ).bind(core).first<{ nome: string }>().catch(() => null);
}

// Representante cuja carteira (representantes.ufs, CSV "MG,SP,GO") cobre a UF.
async function representantePorRegiao(env: Env, uf: string | null | undefined): Promise<string | null> {
  const u = String(uf ?? "").trim().toUpperCase();
  if (!u) return null;
  const r = await env.DB.prepare(
    `SELECT nome FROM representantes WHERE COALESCE(ativo,1)=1 AND ufs IS NOT NULL
       AND (',' || REPLACE(UPPER(ufs),' ','') || ',') LIKE '%,' || ? || ',%' LIMIT 1`
  ).bind(u).first<{ nome: string }>().catch(() => null);
  return r?.nome ?? null;
}

// Detecta interesse comercial (preço, cores, mínimo, frete…) e modelos citados.
const INTERESSE_RE = /pre[çc]o|valor|quanto (custa|sai|fica|é)|\bcores?\b|estoque|dispon[íi]vel|pedido m[íi]nimo|\bm[íi]nimo\b|pagament|\bfrete|parcel|\bcondi[çc][õo]es|tabela|or[çc]ament/i;
// Sinais de reclamação/problema → prioriza atendimento humano (§12/§16).
const RECLAMACAO_RE = /reclama|problema|defeito|quebrad|rasgad|estragad|veio errad|errad[oa]|faltou|faltando|falta (uma|um|de)|troca(r)?|devolu|devolv|atras(ad|o)|n[ãa]o chegou|ainda n[ãa]o (chegou|recebi)|insatisfeit|p[ée]ssim/i;

async function detectarInteresse(env: Env, convId: string, texto: string, modelosCsv: string): Promise<boolean> {
  const t = texto || "";
  const interessou = INTERESSE_RE.test(t);
  const citados: string[] = [];
  for (const m of modelosCsv.split(",").map((s) => s.trim()).filter(Boolean)) {
    const re = new RegExp(`(^|[^a-zA-ZÀ-ú])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (re.test(t)) citados.push(m);
  }
  for (const termo of citados) {
    await env.DB.prepare("INSERT OR IGNORE INTO atend_interesses (id, conversa_id, termo) VALUES (?, ?, ?)").bind(uid(), convId, termo).run();
  }
  if (interessou || citados.length) {
    await env.DB.prepare("UPDATE atend_conversas SET interessado=1, atualizado_em=datetime('now') WHERE id=?").bind(convId).run();
  }
  return interessou || citados.length > 0;
}

// Push (notificação do SO — funciona em qualquer tela e com o navegador fechado)
// quando uma conversa ACABA de cair no atendimento humano.
async function avisarHumanoPush(env: Env, c: { id: string; nome?: string | null; contato_nome?: string | null; telefone: string }) {
  const quem = (c.nome || c.contato_nome || "").trim() || ("+" + digitos(c.telefone));
  await enviarPush(env, { titulo: "🔔 Atendimento humano", corpo: `${quem} precisa de um atendente no WhatsApp.`, url: "/atendimento", tag: "atend-" + c.id }).catch(() => {});
}

async function addMsg(env: Env, convId: string, direcao: "in" | "out", autor: string, tipo: string, texto: string, opts: { zapId?: string | null; responderTexto?: string | null; arquivoUrl?: string | null } = {}) {
  const id = uid();
  await env.DB.prepare(
    "INSERT INTO atend_mensagens (id, conversa_id, direcao, autor, tipo, texto, zap_id, responder_texto, arquivo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, convId, direcao, autor, tipo, texto, opts.zapId || null, opts.responderTexto || null, opts.arquivoUrl || null).run();
  return id;
}

// Envia uma mensagem NOSSA (bot/IA) pro cliente E guarda o id da Z-API na linha da mensagem.
// Sem isso, o callback de status (entregue/lido) não acha a mensagem pelo zap_id e os ✓✓
// nunca acendem nas respostas da IA (só nas do atendente humano, que já guardava o id).
async function enviarBot(env: Env, convId: string, tel: string, saida: { tipo: string; texto: string }, autor = "bot") {
  const msgId = await addMsg(env, convId, "out", autor, saida.tipo, saida.texto);
  const r = await enviarWhatsapp(env, tel, saida);
  if (r.enviado && r.messageId) await env.DB.prepare("UPDATE atend_mensagens SET zap_id=?, status='sent' WHERE id=?").bind(r.messageId, msgId).run();
  return r;
}

// Registra na CONVERSA do cliente uma mensagem que saiu por FORA do chat (ex.: campanha em
// massa) — assim ela aparece no histórico da conversa (com ✓✓), não só no controle da campanha.
// Acha a conversa pelo telefone; se não existir, cria uma "quieta" (origem 'campanha', que o
// board só mostra depois que o cliente responder).
async function registrarEnvioNaConversa(env: Env, tel: string, texto: string, messageId: string | null, autor = "Campanha") {
  const t = digitos(tel);
  if (t.length < 8) return;
  const conv = await acharConversaPorTelefone(env, t);
  let convId: string;
  if (conv) { convId = conv.id; }
  else {
    convId = uid();
    const cli = await identificarCliente(env, t).catch(() => null);
    await env.DB.prepare(
      "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, cliente_id, nome, ultima_out_em, atualizado_em) VALUES (?, ?, 'ia-triagem', 'campanha', ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind(convId, t, cli ? "lojista" : null, cli?.id ?? null, cli?.nome ?? null).run();
  }
  const msgId = await addMsg(env, convId, "out", autor, "texto", texto, { zapId: messageId || null });
  if (messageId) await env.DB.prepare("UPDATE atend_mensagens SET status='sent' WHERE id=?").bind(msgId).run();
  await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(convId).run();
}

// Baixa uma mídia externa (áudio/foto que o cliente mandou, via Z-API) e guarda no
// R2, devolvendo uma URL pública nossa — pra o atendente ouvir/ver depois na conversa.
async function guardarMidiaExterna(env: Env, origin: string, url: string, extHint = "bin"): Promise<string> {
  if (!url) return "";
  try {
    const cfg = await lerConfig(env);
    const headers: Record<string, string> = {};
    if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok || !r.body) return "";
    const ct = (r.headers.get("content-type") || "").split(";")[0];
    const ext = ((ct.split("/")[1] || extHint).replace(/[^a-z0-9]/gi, "").slice(0, 8)) || extHint;
    const nome = `${uid()}.${ext}`;
    await env.BUCKET.put(`atend/${nome}`, r.body, { httpMetadata: { contentType: ct || "application/octet-stream" } });
    return `${origin}/api/atendimento/arquivo/${nome}`;
  } catch { return ""; }
}

// Registra uma mensagem de GRUPO na conversa do grupo. O robô NUNCA responde em grupo — aqui
// a gente só ARQUIVA (texto + mídia), com o nome de quem falou, pra você ver/responder à mão.
// A conversa fica na coluna "👥 Grupos". Chave = id do grupo (o telefone da conversa).
async function registrarGrupo(env: Env, origin: string, b: Record<string, unknown>): Promise<boolean> {
  if (b.fromMe === true) return false;                       // não registra o que NÓS mandamos no grupo
  const groupId = digitos(b.phone ?? (b as { chatId?: unknown }).chatId ?? "");
  if (groupId.length < 6) return false;
  const nomeGrupo = String(b.chatName ?? "Grupo").trim().slice(0, 80) || "Grupo";
  const remetente = String((b as { senderName?: unknown }).senderName ?? (b as { pushName?: unknown }).pushName ?? "").trim();
  const t = b.text as { message?: string } | undefined;
  const img = b.image as { caption?: string; imageUrl?: string; url?: string } | undefined;
  const audio = b.audio as { audioUrl?: string; url?: string } | undefined;
  const doc = b.document as { documentUrl?: string; url?: string; fileName?: string; title?: string; mimeType?: string; caption?: string } | undefined;
  let corpo = String(t?.message ?? img?.caption ?? doc?.caption ?? "").trim();
  let arquivoUrl = "";
  if (audio && (audio.audioUrl || audio.url)) { arquivoUrl = await guardarMidiaExterna(env, origin, audio.audioUrl || audio.url || "", "ogg"); if (!corpo) corpo = "🎤 (áudio)"; }
  else if (img && (img.imageUrl || img.url)) { arquivoUrl = await guardarMidiaExterna(env, origin, img.imageUrl || img.url || "", "jpg"); if (!corpo) corpo = "📷 (foto)"; }
  else if (doc && (doc.documentUrl || doc.url)) { const nm = String(doc.fileName || doc.title || "documento").trim(); const ext = (nm.match(/\.([a-z0-9]{2,5})$/i)?.[1] || (String(doc.mimeType || "").includes("pdf") ? "pdf" : "bin")).toLowerCase(); arquivoUrl = await guardarMidiaExterna(env, origin, doc.documentUrl || doc.url || "", ext); if (!corpo) corpo = "📎 " + nm; }
  if (!corpo && !arquivoUrl) return false;
  const texto = remetente ? `*${remetente}:* ${corpo}` : corpo;
  const conv = await env.DB.prepare("SELECT id FROM atend_conversas WHERE telefone=?").bind(groupId).first<{ id: string }>();
  let convId: string;
  if (conv) {
    convId = conv.id;
    await env.DB.prepare("UPDATE atend_conversas SET estado='grupo', origem='grupo', nome=?, atualizado_em=datetime('now') WHERE id=?").bind(nomeGrupo, convId).run();
  } else {
    convId = uid();
    await env.DB.prepare("INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, nome, atualizado_em) VALUES (?, ?, 'grupo', 'grupo', 'grupo', ?, datetime('now'))").bind(convId, groupId, nomeGrupo).run();
  }
  await addMsg(env, convId, "in", "cliente", "texto", texto, { zapId: String(b.messageId ?? "") || null, arquivoUrl: arquivoUrl || null });
  await env.DB.prepare("UPDATE atend_conversas SET ultima_in_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(convId).run();
  return true;
}

// Cliente bloqueado (caloteiro): não enviar NADA pra ele. Usado no texto e na mídia.
async function clienteBloqueado(env: Env, tel: string): Promise<boolean> {
  const core = digitos(tel).replace(/^55/, "").slice(-8);
  if (core.length < 8) return false;
  const bloq = await env.DB.prepare(
    `SELECT 1 FROM clientes WHERE COALESCE(bloqueado,0)=1 AND ${LIMPA_WPP} LIKE '%' || ? LIMIT 1`
  ).bind(core).first().catch(() => null);
  return !!bloq;
}

// Garante um card na coluna "📥 Catálogo (contato)" para uma conversa vinda do
// catálogo (cliente entrou em contato / atividade do catálogo). Idempotente: se a
// conversa já tem card, não duplica. Lê os dados direto da conversa.
async function garantirCardDaConversa(env: Env, convId: string, texto = "Catálogo (cliente entrou em contato)", etapa = "catalogo-recebido") {
  const cv = await env.DB.prepare(
    "SELECT id, card_id, cliente_id, nome, contato_nome, cidade, uf, representante, telefone FROM atend_conversas WHERE id=?"
  ).bind(convId).first<{ id: string; card_id: string | null; cliente_id: string | null; nome: string | null; contato_nome: string | null; cidade: string | null; uf: string | null; representante: string | null; telefone: string | null }>().catch(() => null);
  if (!cv || cv.card_id || ehClienteInterno(cv.nome)) return;
  // Nome do card: loja > nome do contato (perfil do WhatsApp) > telefone.
  const nomeCard = (cv.nome || cv.contato_nome || "").trim() || ("+" + digitos(cv.telefone || ""));
  const cardId = uid();
  await env.DB.prepare(
    "INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(cardId, cv.cliente_id ?? null, nomeCard, cv.cidade ?? null, cv.uf ?? null, digitos(cv.telefone || ""), etapa, cv.representante ?? null).run();
  await env.DB.prepare("INSERT INTO funil_eventos (id, card_id, tipo, texto) VALUES (?, ?, 'etapa', ?)").bind(uid(), cardId, texto).run();
  await env.DB.prepare("UPDATE atend_conversas SET card_id=? WHERE id=?").bind(cardId, convId).run();
}

// ── IA de triagem (atendente virtual antes do CNPJ) ──────────────────────────────
// A IA conversa naturalmente, entende a necessidade e CLASSIFICA o contato:
//  • lojista pronto pra ver produtos → "coletar_lojista" (aí o fluxo pede nome+CNPJ)
//  • consumidor final               → "indicar_parceiro" (loja parceira da região)
//  • financeiro/pós-venda/reclamação/pediu humano → "humano"
//  • ainda conversando              → "conversar"
// O motor determinístico (CNPJ, catálogo, parceiros) segue intacto — a IA só faz a frente.
const IA_SISTEMA = `Você é a *Big*, atendente virtual da *Big Tricot* no WhatsApp.
A Big Tricot é uma fábrica de tricô (mantas, capas de almofada, almofadas e afins) que vende **no ATACADO, apenas para LOJISTAS** (revendedores com CNPJ).

SEU PAPEL: acolher quem chama, conversar de forma natural e humana, ENTENDER o que a pessoa quer e descobrir se ela é LOJISTA (compra pra revender) ou CONSUMIDOR FINAL (compra pra usar/presente).

REGRAS IMPORTANTES:
- NÃO peça o CNPJ logo de cara. Primeiro converse, entenda a necessidade (que tipo de produto procura, se já conhece a marca, etc.) e só depois, quando fizer sentido, encaminhe pra pegar os dados.
- Se perceber que é LOJISTA e a pessoa quer comprar/revender/fazer cadastro: use acao "coletar_lojista" e, na sua resposta, peça gentilmente o NOME DA LOJA (o sistema pede o CNPJ na sequência).
- CATÁLOGO: nosso catálogo é DIGITAL (um link), nunca um PDF. NUNCA envie o catálogo por conta própria nem prometa enviar "automaticamente". Envie SÓ quando o cliente PEDIR o catálogo (ex.: "me manda o catálogo", "quero ver os produtos", "tem catálogo?") — aí use acao "enviar_catalogo" (o sistema anexa o link). Não peça CNPJ como condição para mandar o catálogo se o cliente só quer dar uma olhada.
- Se for CONSUMIDOR FINAL (pessoa física, "pra mim", "uso pessoal", "presente", sem loja/CNPJ): use acao "indicar_parceiro". Explique com carinho, em 1 linha, que a Big Tricot vende no atacado para lojistas, mas que você indica as lojas parceiras da região dele. Você só precisa do ESTADO — se ainda não souber, pergunte "de qual estado você é?". Preencha o campo "uf" com a sigla (ex.: MG). O SISTEMA envia automaticamente o link do site de lojas parceiras filtrado pelo estado; NUNCA diga "vou te passar os dados/contatos depois", NUNCA tente listar lojas você mesmo, e NÃO fale de modelos/cores com o consumidor final. ⚠️ NUNCA escreva um link, uma URL ou um "[link]" na sua resposta — QUEM MANDA O LINK É O SISTEMA, sozinho. Você só diz que vai indicar as lojas da região; não escreva "aqui está o link", nem "[link]", nem invente endereço.
- STATUS DE PEDIDO: se o cliente perguntar sobre um pedido dele (ex.: "como está meu pedido?", "meu pedido já saiu?", "em que fase está?"): use acao "consultar_pedido". O sistema identifica pelo CNPJ e responde a fase de produção + a data prevista — você não precisa inventar nada. Se você JÁ sabe o CNPJ dele, preencha o campo "cnpj". Se NÃO souber, peça o CNPJ da loja na resposta. IMPORTANTE: depois que o status for informado, se o cliente fizer MAIS perguntas sobre o pedido (adiantar, alterar, reclamar do prazo), use acao "humano" e diga que vai chamar alguém do *time de produção* pra ajudar (NÃO fale a sigla "PCP" pro cliente — é interno).
- Se o cliente pedir PRIVATE LABEL (marca própria, etiqueta própria, fabricar com a marca dele): use acao "humano" — isso é com um vendedor especializado. Na resposta, diga que já vai chamar o vendedor.
- Se pedir Financeiro, Pós-venda, tratar de um pedido já feito, reclamação/problema, ou pedir pra falar com uma pessoa: use acao "humano".
- 🤝 CLIENTE QUE JÁ ESTÁ COMPRANDO/PEDINDO: se a pessoa manda uma LISTA de produtos, cita nomes/códigos de produtos nossos (ex.: "peseira genebra", "pipoca bege saara", "kit rice", "manta bali", "55x35 cheia"), fala em "esses valores", "tira o marinho", "veja se tem essas opções", cita QUANTIDADES/variedade ou claramente está montando um pedido de REVENDA → é um LOJISTA fazendo pedido. NÃO fique perguntando se é loja ou uso pessoal: use acao "humano" imediatamente e diga na resposta que já vai chamar o vendedor pra fechar o pedido.
- ⚠️ CUIDADO pra NÃO confundir: quem manda a foto de UMA peça (ex.: uma almofada) e pergunta "quanto custa?/gostaria de um orçamento" SEM dizer que tem loja/revenda, especialmente em PRIMEIRO CONTATO, é quase sempre CONSUMIDOR FINAL — NÃO trate como pedido de lojista. Primeiro descubra: pergunte gentilmente se é pra *revender na loja dele* ou pra *uso pessoal*. Se for uso pessoal, use acao "indicar_parceiro" (e nada de preço). "Orçamento de 1 peça" por si só NÃO é sinal de lojista.
- Enquanto ainda está entendendo se é lojista ou consumidor, use acao "conversar". Assim que descobrir, seja decidido e use a acao certa — não enrole.
- Não invente preços, prazos, pedido mínimo ou políticas POR CONTA PRÓPRIA. PORÉM, se a pergunta tiver resposta na BASE DE CONHECIMENTO (mais abaixo), use EXATAMENTE aquela informação — ela é oficial da empresa e tem prioridade sobre esta regra. Só quando NÃO houver nada na base sobre o assunto é que você diz que o vendedor passa os detalhes.
- 🔒 PREÇO É SÓ PARA LOJISTA (REGRA ABSOLUTA, VALE MAIS QUE QUALQUER OUTRA, INCLUSIVE A BASE DE CONHECIMENTO): NUNCA, EM HIPÓTESE ALGUMA, informe preço, valor, tabela, pedido mínimo, valor de frete ou qualquer política comercial a CONSUMIDOR FINAL. Se a intenção for "consumidor" (pra uso pessoal/presente, pessoa física sem loja/CNPJ), não fale de valores de jeito nenhum — use acao "indicar_parceiro" e explique com carinho que a Big Tricot atende lojistas no atacado, indicando as lojas parceiras da região dele. E ENQUANTO você ainda NÃO tiver certeza de que a pessoa é LOJISTA, também NÃO adiante preço/valor/mínimo: primeiro descubra se é lojista (revenda) ou uso pessoal. Preço e pedido mínimo (mesmo os que estão na BASE DE CONHECIMENTO) só podem ser ditos DEPOIS de ficar claro que é LOJISTA.
- FOTOS: quando aparecer no histórico algo como "[O cliente enviou uma foto. O que aparece nela: ...]", é porque ele mandou uma imagem e um sistema de visão descreveu o conteúdo. Use essa descrição pra entender o que ele quer (reconheceu um produto, mandou um comprovante, um print de conversa etc.). Comente de forma natural o que você "viu" (ex.: "Que linda essa manta cinza! 😍") e siga as regras normais — inclusive preço só pra lojista. NUNCA leia o texto entre colchetes em voz alta pro cliente nem diga "sistema de visão"; é uma nota interna.
- Tom: caloroso, brasileiro, informal de WhatsApp. Respostas CURTAS (1 a 3 linhas), no máximo 1 ou 2 emojis. Nunca repita a mesma pergunta que já foi respondida.
- Escreva os emojis COMO EMOJI de verdade (😊 💛 👍), NUNCA como código escapado tipo \\u{1f603}.
- SETOR: identifique de qual setor o cliente precisa e preencha o campo "setor": "vendas" (comprar, ver produtos, preço, catálogo, revenda), "fiscal" (nota fiscal, boleto, pagamento, cobrança, financeiro), "estoque" (disponibilidade, se tem tal cor/modelo, quando repõe), "pcp" (andamento/status de um pedido em produção). Se ainda não der pra saber, deixe vazio.

RESPONDA **SOMENTE** com um JSON válido, sem texto fora dele, neste formato exato:
{"resposta": "<o que enviar pro cliente>", "intencao": "lojista" | "consumidor" | "indefinido", "acao": "conversar" | "coletar_lojista" | "enviar_catalogo" | "consultar_pedido" | "indicar_parceiro" | "humano", "uf": "<sigla do estado, ex.: MG, se souber; senão vazio>", "cidade": "<cidade se souber; senão vazio>", "cnpj": "<CNPJ do cliente se ele informar ou você já souber; senão vazio>", "setor": "vendas" | "fiscal" | "estoque" | "pcp" | ""}`;

// Estados "terminados" em que a Big reengaja o contato que volta a falar (ela usa o
// histórico e continua). Ficam de fora: coleta determinística e estados de pedido/pós-venda.
const IA_REENGATA = new Set<string>(["indicado-parceiro", "catalogo-enviado", "nao-qualificado", "sem-retorno", "follow-up-24h"]);

// Saudação fixa do primeiro contato (lead novo, desconhecido) quando a IA está ligada.
const SAUDACAO_NOVO =
  "Olá! Tudo bem? 🤗\n" +
  "Seja bem-vindo à *Big Tricot*!\n\n" +
  "Somos uma fábrica especializada em tricô para decoração e atendemos exclusivamente lojistas no atacado.\n\n" +
  "Para eu te ajudar melhor, você já é nosso cliente ou está entrando em contato pela primeira vez?";

// Junta as regras base (fixas, incluindo o formato JSON) com os ajustes que o lojista
// escreve na config. Ajustes se SOMAM — nunca substituem o núcleo, pra não quebrar a Big.
function sistemaIa(extra?: string | null): string {
  const e = String(extra ?? "").trim();
  return e ? `${IA_SISTEMA}\n\nAJUSTES DO LOJISTA (siga também estas instruções, sem quebrar o formato JSON acima):\n${e}` : IA_SISTEMA;
}

// Base de conhecimento (treino da Big): injeta as perguntas/respostas ativas no prompt,
// pra ela responder dúvidas complexas do jeito certo. Vazio se não houver entradas.
async function lerConhecimento(env: Env): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT pergunta, resposta FROM ia_conhecimento WHERE COALESCE(ativo,1)=1 ORDER BY criado_em"
  ).all<{ pergunta: string; resposta: string }>().catch(() => ({ results: [] as { pergunta: string; resposta: string }[] }));
  if (!results.length) return "";
  const itens = results.map((r) => `P: ${String(r.pergunta).trim()}\nR: ${String(r.resposta).trim()}`).join("\n\n");
  return `\n\nBASE DE CONHECIMENTO OFICIAL (PRIORIDADE MÁXIMA): quando a pergunta do cliente for sobre um destes temas, responda COM BASE na resposta correspondente — mesmo que seja sobre preço, prazo ou pedido mínimo. Estas respostas foram definidas pela empresa e valem MAIS que a regra geral de "não inventar". Adapte só o tom, sem mudar a informação. Se não houver nada relacionado, siga as regras acima. EXCEÇÃO: informação de PREÇO, VALOR ou PEDIDO MÍNIMO desta base NUNCA pode ser dita a CONSUMIDOR FINAL nem a quem ainda não confirmou ser LOJISTA — a regra "PREÇO É SÓ PARA LOJISTA" vale acima desta base.\n${itens}`;
}

const IA_MODELOS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
];

interface IaDecisao { resposta: string; intencao: string; acao: string; uf?: string; cidade?: string; cnpj?: string; setor?: string }

// Setores válidos do atendimento (a Big roteia pra um deles).
const SETORES_VALIDOS = new Set(["vendas", "fiscal", "estoque", "pcp"]);
const setorDe = (s?: string | null) => { const t = String(s ?? "").trim().toLowerCase(); return SETORES_VALIDOS.has(t) ? t : ""; };

// Normaliza estado → sigla UF (aceita "MG" ou "minas gerais").
const UF_NOMES: Record<string, string> = {
  "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE",
  "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT",
  "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
  "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC",
  "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO",
};
function ufDe(s?: string | null): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const norm = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return UF_NOMES[norm] ?? "";
}

// Alguns modelos escapam emojis como texto literal ("\u{1f603}" ou "😃")
// dentro do JSON. Converte esses escapes de volta pro caractere real.
function decodificarEscapes(s: string): string {
  return String(s ?? "")
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch { return ""; } });
}

// Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em ``` ou prosa).
function extrairJson(txt: string): IaDecisao | null {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Partial<IaDecisao>;
    if (typeof o.resposta === "string") {
      return { resposta: decodificarEscapes(o.resposta.trim()), intencao: String(o.intencao ?? "indefinido"), acao: String(o.acao ?? "conversar"), uf: String(o.uf ?? ""), cidade: String(o.cidade ?? ""), cnpj: String(o.cnpj ?? ""), setor: String(o.setor ?? "") };
    }
  } catch { /* json inválido */ }
  return null;
}

// Chama a IA com o histórico da conversa e devolve a decisão (ou null se indisponível).
// `sistema` é o prompt de personalidade/regras — editável pelo lojista na config.
async function chamarIa(env: Env, conv: ConvRow, sistema: string): Promise<IaDecisao | null> {
  const AI = env.AI as unknown as { run: (m: string, o: unknown) => Promise<{ response?: string }> };
  if (!AI?.run) return null;
  // Histórico recente (as últimas trocas de texto), pra IA ter contexto.
  const { results } = await env.DB.prepare(
    "SELECT direcao, autor, texto FROM atend_mensagens WHERE conversa_id=? AND tipo='texto' AND autor IN ('cliente','bot') ORDER BY criado_em ASC, rowid ASC"
  ).bind(conv.id).all<{ direcao: string; autor: string; texto: string | null }>();
  const hist = results.slice(-16).map((r) => ({ role: r.autor === "cliente" ? "user" : "assistant", content: String(r.texto ?? "") })).filter((m) => m.content.trim());
  const messages = [{ role: "system", content: sistema }, ...hist];
  for (const modelo of IA_MODELOS) {
    try {
      const res = await AI.run(modelo, { messages, max_tokens: 400, temperature: 0.6 });
      const txt = (res?.response || "").trim();
      if (!txt) continue;
      const dec = extrairJson(txt);
      if (dec && dec.resposta) return dec;
      // Modelo respondeu, mas não em JSON → usa o texto como fala e segue conversando.
      if (!txt.includes("{")) return { resposta: decodificarEscapes(txt), intencao: "indefinido", acao: "conversar" };
    } catch { /* tenta o próximo modelo */ }
  }
  return null;
}

// Transcreve um áudio (nota de voz do WhatsApp) em texto, via IA (Whisper na
// Cloudflare Workers AI). Retorna "" se não der (sem binding, download falhou, áudio
// vazio…) — aí o webhook responde pedindo pra mandar por escrito.
async function transcreverAudio(env: Env, url: string): Promise<string> {
  const AI = env.AI as unknown as { run: (m: string, o: unknown) => Promise<{ text?: string }> };
  if (!AI?.run || !url) return "";
  try {
    const resp = await fetch(url);
    if (!resp.ok) return "";
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!buf.length) return "";
    const res = await AI.run("@cf/openai/whisper", { audio: [...buf] });
    return String(res?.text ?? "").trim();
  } catch { return ""; }
}

// "Enxerga" uma imagem (foto que o cliente mandou) e descreve em português, via IA de
// visão (LLaVA na Workers AI). Retorna "" se não der. A descrição vira contexto pra Big.
async function descreverImagem(env: Env, url: string): Promise<string> {
  const AI = env.AI as unknown as { run: (m: string, o: unknown) => Promise<{ description?: string; response?: string }> };
  if (!AI?.run || !url) return "";
  try {
    const resp = await fetch(url);
    if (!resp.ok) return "";
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!buf.length) return "";
    const res = await AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
      image: [...buf],
      prompt: "Descreva em português, de forma curta e objetiva, o que aparece nesta imagem. Se for um produto de decoração/tricô (manta, almofada, capa de almofada, peseira), diga o tipo, a cor e o padrão. Se for um comprovante de pagamento, print de conversa ou documento, diga isso.",
      max_tokens: 300,
    });
    return String(res?.description ?? res?.response ?? "").trim();
  } catch { return ""; }
}

// ── Status do pedido (Big consulta a produção pelo CNPJ) ──────────────────────────
// Esteira canônica de fases (produção + pós-revisão). Ordem = avanço do pedido.
const FASES_PEDIDO = ["tecelagem", "passadoria", "corte", "costura", "revisao", "expedicao", "fiscal", "transporte", "entregue"];
const FASE_CURTA: Record<string, string> = {
  tecelagem: "Tecelagem", passadoria: "Passadoria", corte: "Corte", costura: "Costura",
  revisao: "Revisão", expedicao: "Expedição", fiscal: "Nota fiscal", transporte: "Transporte", entregue: "Entregue",
};
function dataBr(iso?: string | null): string {
  const m = String(iso ?? "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// Dado o CNPJ (só dígitos), acha o cliente → pedido mais recente → fase atual + data prevista.
async function consultarStatusPedido(env: Env, cnpjDig: string): Promise<Saida[]> {
  const cli = await env.DB.prepare(
    "SELECT nome FROM clientes WHERE REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string }>().catch(() => null);
  if (!cli) return [{ tipo: "texto", texto: "Não encontrei um cadastro com esse CNPJ aqui. 🤔 Confere os números pra mim? Se estiver certo, eu chamo alguém do time pra verificar." }];
  const ped = await env.DB.prepare(
    "SELECT id, numero_erp, data_entrega FROM pedidos WHERE cliente_nome = ? AND COALESCE(reposicao,0)=0 ORDER BY (data_pedido IS NULL), data_pedido DESC, rowid DESC LIMIT 1"
  ).bind(cli.nome).first<{ id: string; numero_erp: string | null; data_entrega: string | null }>().catch(() => null);
  if (!ped) return [{ tipo: "texto", texto: `Oi! Não achei nenhum pedido em produção no cadastro de *${cli.nome}*. 😕 Se você fez um pedido recente, me avisa que eu chamo o time pra conferir!` }];
  // Fase atual: expedição sobrepõe produção; senão, o setor mais avançado das partes.
  const exp = await env.DB.prepare("SELECT fase FROM expedicao WHERE pedido_id=? LIMIT 1").bind(ped.id).first<{ fase: string }>().catch(() => null);
  let fase = "";
  if (exp?.fase) fase = String(exp.fase).toLowerCase().trim();
  else {
    const { results } = await env.DB.prepare("SELECT DISTINCT setor FROM producao WHERE pedido_id=?").bind(ped.id).all<{ setor: string }>().catch(() => ({ results: [] as { setor: string }[] }));
    let idx = -1;
    for (const r of results) { const i = FASES_PEDIDO.indexOf(String(r.setor ?? "").toLowerCase().trim()); if (i > idx) idx = i; }
    fase = idx >= 0 ? FASES_PEDIDO[idx] : "";
  }
  const numero = ped.numero_erp ? ` (nº ${ped.numero_erp})` : "";
  const prazo = dataBr(ped.data_entrega) ? `\n📅 Previsão de entrega: *${dataBr(ped.data_entrega)}*` : "";
  if (!fase) return [{ tipo: "texto", texto: `Seu pedido${numero} já está no nosso sistema e logo entra em produção! 💛${prazo}` }];
  if (fase === "entregue") return [{ tipo: "texto", texto: `Seu pedido${numero} já foi *entregue*! ✅ Qualquer coisa, é só chamar. 💛` }];
  const idx = FASES_PEDIDO.indexOf(fase);
  const faltam = FASES_PEDIDO.slice(idx + 1).filter((f) => f !== "entregue" && f !== "fiscal").map((f) => FASE_CURTA[f]);
  let txt = `📦 Seu pedido${numero} está na etapa *${FASE_CURTA[fase] || fase}*.`;
  if (faltam.length) txt += `\nDepois ainda passa por: ${faltam.join(" → ")}.`;
  txt += prazo;
  return [{ tipo: "texto", texto: txt }];
}

interface IaSaida { saidas: Saida[]; novoEstado: EstadoAtend; notificarHumano: boolean; tipo: string | null; catalogo?: boolean; consultarPedido?: boolean; cnpjConsulta?: string; setor?: string }

// Roda a IA de triagem e traduz a decisão em resposta + próximo estado do fluxo.
// `origin` é usado pra montar o link da vitrine (indicação de consumidor final).
async function iaTriagem(env: Env, conv: ConvRow, sistema: string, vitrineBase: string): Promise<IaSaida> {
  const dec = await chamarIa(env, conv, sistema);
  // IA indisponível (binding ausente/erro) → degrada pro menu determinístico, que é à prova de falhas.
  if (!dec) return { saidas: [{ tipo: "texto", texto: BOAS_VINDAS }], novoEstado: "aguardando-setor", notificarHumano: false, tipo: null };
  const setor = setorDe(dec.setor); // setor que a Big identificou (vendas/fiscal/estoque/pcp)

  // CONSUMIDOR FINAL: guardrail robusto — não depende só do "acao" do modelo. Se ele marcou
  // indicar_parceiro OU disse que é consumidor, tratamos como indicação. Com o ESTADO em mãos,
  // o sistema JÁ envia o link da vitrine filtrado por UF (a pessoa escolhe a cidade mais perto lá).
  const uf = ufDe(dec.uf) || ufDe(conv.uf);
  const querIndicar = dec.acao === "indicar_parceiro" || dec.intencao === "consumidor";
  if (querIndicar) {
    if (uf) {
      const link = `${(vitrineBase || VITRINE_PUBLICA).replace(/\/+$/, "")}?uf=${encodeURIComponent(uf)}`;
      // Mensagem fixa (rápida e sem "vou passar depois"): manda o link do estado na hora.
      const saidas: Saida[] = [
        { tipo: "texto", texto: `Prontinho! 💛 Abre esse link, escolha a *cidade mais perto de você* e veja os contatos das lojas parceiras de ${uf} 👇\n${link}` },
      ];
      return { saidas, novoEstado: "indicado-parceiro", notificarHumano: false, tipo: "consumidor", setor };
    }
    // Ainda não sabemos o estado → a IA pergunta (a resposta dela já pede) e aguardamos.
    return { saidas: [{ tipo: "texto", texto: dec.resposta }], novoEstado: "aguardando-cidade-parceiro", notificarHumano: false, tipo: "consumidor", setor };
  }

  const saidas: Saida[] = [{ tipo: "texto", texto: dec.resposta }];
  switch (dec.acao) {
    case "coletar_lojista":
      // A IA já pediu o nome da loja na resposta → o fluxo determinístico captura o nome e pede o CNPJ.
      return { saidas, novoEstado: "triagem-nome", notificarHumano: false, tipo: "lojista", setor: setor || "vendas" };
    case "enviar_catalogo":
      // SÓ quando o cliente PEDE o catálogo. A mensagem do catálogo (link virtual) é
      // anexada no núcleo (receberMensagem) e JÁ é o convite completo (texto + link +
      // senha). Não enviamos a resposta da IA aqui pra não mandar o convite 2× (bug do
      // "mesma mensagem repetida"). Envia só o catálogo.
      return { saidas: [], novoEstado: "catalogo-enviado", notificarHumano: false, tipo: "lojista", catalogo: true, setor: setor || "vendas" };
    case "consultar_pedido":
      // Cliente quer saber o status do pedido. O núcleo resolve o CNPJ e consulta a produção.
      return { saidas, novoEstado: "ia-triagem", notificarHumano: false, tipo: conv.tipo ?? null, consultarPedido: true, cnpjConsulta: digitos(dec.cnpj) || digitos(conv.cnpj), setor: setor || "pcp" };
    case "humano":
      return { saidas, novoEstado: "atendimento-humano", notificarHumano: true, tipo: conv.tipo ?? null, setor };
    default:
      return { saidas, novoEstado: "ia-triagem", notificarHumano: false, tipo: conv.tipo ?? null, setor };
  }
}

// Estados do NORTE + NORDESTE (usam a tabela "norte" do catálogo). O resto (S/SE/CO)
// usa a tabela padrão (Sul). O link do catálogo ganha "r=norte" para essa região.
const REGIAO_NORTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);
// DDDs de Norte + Nordeste — usados como palpite quando não há UF no cadastro.
const DDD_NORTE = new Set(["68", "69", "92", "97", "95", "91", "93", "94", "96", "63", "98", "99", "86", "89", "85", "88", "84", "83", "81", "87", "82", "79", "71", "73", "74", "75", "77"]);
function ehRegiaoNorte(uf?: string | null, tel?: string | null): boolean {
  const u = String(uf || "").trim().toUpperCase();
  if (u) return REGIAO_NORTE.has(u);           // UF do cadastro tem prioridade
  const d = digitos(tel);                       // senão, deduz pelo DDD
  const ddd = d.startsWith("55") && d.length >= 4 ? d.slice(2, 4) : d.slice(0, 2);
  return DDD_NORTE.has(ddd);
}
// Pedido claro de catálogo (rede de segurança quando a IA "enrola" e não envia).
// Evita casar com "ver o pedido" (status do pedido, que é outro fluxo).
const PEDE_CATALOGO_RE = /cat[aá]logo|ver (as |os |o )?(pe[çc]as|produtos|mantas|novidades|cole[çc][aã]o)/i;
// Ajusta o link do catálogo à tabela da região do cliente: Norte/NE → insere r=norte.
function ajustarCatalogoRegiao(texto: string, uf?: string | null, tel?: string | null): string {
  if (!ehRegiaoNorte(uf, tel)) return texto; // Sul é o padrão (sem r=)
  return texto.replace(/(catalogo\.bigtricot\.com\.br\/#)(?!r=)/gi, "$1r=norte&");
}

// ── Núcleo: recebe uma mensagem do cliente, roda o robô, responde e qualifica ────
// Usado tanto pelo simulador (/entrada) quanto pelo webhook real da Z-API (/webhook).
async function receberMensagem(env: Env, telRaw: unknown, textoRaw: unknown, origem = "whatsapp", contatoNome = "", origin: string | null = null, zapId = "", arquivoUrl = "", soRegistrar = false, jaRegistrada = false) {
  const tel = digitos(telRaw);
  const texto = String(textoRaw ?? "");
  const contato = String(contatoNome ?? "").trim().slice(0, 80) || null;
  if (!tel) return { erro: "telefone é obrigatório" as const };

  let conv = await acharConversaPorTelefone(env, tel);
  if (!conv) {
    // Primeiro contato: tenta reconhecer quem é (cliente da base ou representante).
    const id = uid();
    const cliente = await identificarCliente(env, tel);
    const rep = cliente ? null : await ehRepresentante(env, tel);
    let tipo: string | null = null, representante: string | null = null;
    let nome: string | null = null, cnpj: string | null = null, cidade: string | null = null, uf: string | null = null, clienteId: string | null = null;
    if (cliente) {
      tipo = "lojista"; clienteId = cliente.id; nome = cliente.nome; cnpj = cliente.cnpj;
      cidade = cliente.cidade; uf = cliente.uf;
      representante = cliente.representante || (await representantePorRegiao(env, cliente.uf));
    } else if (rep) {
      tipo = "representante"; representante = rep.nome;
    }
    await env.DB.prepare(
      "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, representante, cliente_id, nome, cnpj, cidade, uf, contato_nome) VALUES (?, ?, 'novo', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, tel, origem, tipo, representante, clienteId, nome, cnpj, cidade, uf, contato).run();
    conv = { id, telefone: tel, estado: "novo", origem, tipo, representante, cliente_id: clienteId, nome, cnpj, cidade, uf, contato_nome: contato } as ConvRow;
  } else if (contato && !conv.contato_nome) {
    // Preenche o nome do perfil se ainda não temos.
    await env.DB.prepare("UPDATE atend_conversas SET contato_nome=? WHERE id=?").bind(contato, conv.id).run();
    conv.contato_nome = contato;
  }
  // Cruza com a BASE DE CLIENTES a cada contato: se a conversa ainda não está vinculada a um
  // cliente (ex.: o cadastro foi criado DEPOIS do primeiro contato), acha pelo telefone e
  // preenche SÓ os campos do mini-cadastro que estiverem vazios — nunca sobrescreve o que já
  // foi preenchido à mão. Assim, conforme os clientes vão sendo cadastrados, as conversas
  // antigas se completam sozinhas no próximo "oi" do cliente.
  if (!conv.cliente_id) {
    const cli = await identificarCliente(env, tel).catch(() => null);
    if (cli) {
      const nome = conv.nome || cli.nome || null;
      const cnpj = conv.cnpj || cli.cnpj || null;
      const cidade = conv.cidade || cli.cidade || null;
      const uf = conv.uf || cli.uf || null;
      const rep = conv.representante || cli.representante || (await representantePorRegiao(env, cli.uf)) || null;
      const tipo = conv.tipo || "lojista";   // se ainda não classificado, é um lojista da base
      await env.DB.prepare(
        "UPDATE atend_conversas SET cliente_id=?, nome=?, cnpj=?, cidade=?, uf=?, representante=?, tipo=?, atualizado_em=datetime('now') WHERE id=?"
      ).bind(cli.id, nome, cnpj, cidade, uf, rep, tipo, conv.id).run();
      conv.cliente_id = cli.id; conv.nome = nome; conv.cnpj = cnpj; conv.cidade = cidade; conv.uf = uf; conv.representante = rep; conv.tipo = tipo;
    }
  }
  // jaRegistrada: a mensagem já está no histórico (ex.: a IA está reassumindo e respondendo
  // uma pergunta que o cliente já tinha mandado) → NÃO registra de novo, só reprocessa.
  if (!jaRegistrada) await addMsg(env, conv.id, "in", "cliente", "texto", texto, { zapId: zapId || null, arquivoUrl: arquivoUrl || null });
  // Cliente mandou mensagem NOVA → "chamou de volta". Se o card estava ESTACIONADO numa
  // coluna à mão (coluna_manual), destrava: ele volta pro fluxo automático (Em atendimento /
  // Aguardando humano) pra ninguém esquecer que a cliente está esperando resposta.
  // Exceção: "Montando pedido" é trabalho em andamento — não sai só porque a cliente escreveu.
  await env.DB.prepare("UPDATE atend_conversas SET ultima_in_em = datetime('now'), coluna_manual = CASE WHEN coluna_manual = 'montando-pedido' THEN coluna_manual ELSE NULL END WHERE id = ?").bind(conv.id).run();

  // Detecta interesse comercial + modelos citados (vale inclusive no atendimento humano).
  const cfgAt = await lerConfig(env);
  await detectarInteresse(env, conv.id, texto, cfgAt.interesse_modelos || "");
  // Cliente CHAMOU antes do "Chamar IA" agendado → cancela o agendamento (o robô não precisa
  // mais dar o "oi", ele já veio). O card sai da coluna de follow-up e volta pro fluxo normal:
  // como há mensagem nova sem resposta, cai em "Aguardando atendimento humano" e fica piscando.
  try {
    const ag = lerAgendamentos(cfgAt);
    if (ag.some((a) => a && a.conversaId === conv.id)) await salvarConfigJson(env, "atend_agendamentos", ag.filter((a) => a && a.conversaId !== conv.id));
  } catch { /* ok */ }

  // EQUIPE: números do time NÃO recebem atendimento automático — a Big fica quieta pra vocês
  // conversarem/testarem sem o robô responder. (Cadastrados na aba "Equipe".)
  const equipe = (cfgAt.equipe_numeros || "").split(/[,;\s]+/).map((x) => digitos(x)).filter((x) => x.length >= 8);
  if (equipe.some((e) => tel.slice(-8) === e.slice(-8))) {
    return { conversa_id: conv.id, estado: conv.estado, coluna: colunaDe(conv.estado), respostas: [], notificarHumano: false };
  }
  // MODO MANUAL (robô pausado): com a IA desligada, a Big NÃO responde ninguém — só registra
  // a mensagem e deixa pra um humano atender. Ideal pra fase de prospecção (acumular conversas
  // sem o robô falar sozinho). Liga a IA de novo quando quiser que ela atenda.
  if (soRegistrar || cfgAt.atendimento_ia !== "1") {
    if (conv.estado === "novo") await env.DB.prepare("UPDATE atend_conversas SET estado='ia-triagem', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
    return { conversa_id: conv.id, estado: conv.estado === "novo" ? "ia-triagem" : conv.estado, coluna: "aguardando-setor", respostas: [], notificarHumano: true };
  }

  // Cliente respondeu durante o follow-up → cancela a cadência e sinaliza a retomada.
  if ((conv.followup_etapa ?? 0) > 0 && ["catalogo-enviado", "follow-up-24h", "sem-retorno"].includes(conv.estado)) {
    await env.DB.prepare("UPDATE atend_conversas SET followup_etapa=0 WHERE id=?").bind(conv.id).run();
    await addMsg(env, conv.id, "out", "sistema", "sistema", "🔔 Cliente respondeu ao follow-up — retomar atendimento.");
  }

  // Estado antes desta mensagem (pra saber se a conversa ACABOU de virar "humano").
  const estadoAntes = conv.estado;
  // Fora do horário de atendimento → quando passar pra humano, avisa o cliente sobre o horário.
  const aviso = (await foraDoHorarioAtend(env, cfgAt)) ? avisoHorarioTxt(cfgAt) : "";

  // Atendente humano assumiu (ou já é reclamação), OU já existe um responsável (ex.: Pedro
  // já estava atendendo) → o robô NÃO responde de jeito nenhum, só registra e avisa o humano.
  // Isso impede a IA de se meter numa conversa que já está com alguém do time.
  if (conv.estado === "atendimento-humano" || conv.estado === "reclamacao" || String(conv.responsavel ?? "").trim()) {
    return { conversa_id: conv.id, estado: conv.estado, coluna: colunaDe(conv.estado), respostas: [], notificarHumano: true };
  }

  // Cliente CONHECIDO (já é cliente ou lojista confirmado) mandou FOTO/ÁUDIO (lista de
  // produtos, pedido, comprovante, print) → é assunto de gente: passa DIRETO pro humano.
  // Se a pessoa AINDA não foi qualificada (não sabemos se é lojista ou consumidor final),
  // NÃO joga pro humano: deixa a IA qualificar — consumidor final vai pro "onde comprar",
  // lojista vira pedido com o vendedor. (Ex.: consumidor mandando foto de 1 almofada e
  // pedindo preço não deve ocupar um atendente; a IA indica a loja parceira.)
  if (arquivoUrl && (conv.cliente_id || conv.lojista === 1)) {
    const primeiro = String(conv.nome ?? conv.contato_nome ?? "").trim().split(/\s+/)[0] || "";
    const hBR = (new Date().getUTCHours() + 21) % 24;
    const ola = hBR < 12 ? "Bom dia" : hBR < 18 ? "Boa tarde" : "Boa noite";
    const saud = (conv.estado === "novo"
      ? `${ola}${primeiro ? ", " + primeiro : ""}! 🤗 Aqui é da *Big Tricot* 💛 Recebi sua mensagem, já vou chamar alguém do nosso time pra te atender! 😊`
      : "Recebi aqui! 👀 Já vou chamar alguém do nosso time pra te atender direitinho, tá? 😊") + aviso;
    await env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
    await garantirCardDaConversa(env, conv.id, "Cliente enviou foto/áudio → humano", "atendimento");
    await avisarHumanoPush(env, conv).catch(() => {});
    await enviarBot(env, conv.id, tel, { tipo: "texto", texto: saud });
    await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(conv.id).run();
    return { conversa_id: conv.id, estado: "atendimento-humano", coluna: "atendimento-humano", respostas: [{ tipo: "texto", texto: saud }], notificarHumano: true };
  }

  // Reclamação/problema → coluna própria "Reclamação": a Big dá um retorno acolhedor,
  // avisa o time e deixa o caso separado e visível pra resolver com prioridade.
  // Guarda contra falso positivo ("sem problema", "tudo certo").
  if (RECLAMACAO_RE.test(texto) && !/sem problema|nenhum problema|tranquil|tudo certo|tudo (ó|o)k|sem reclama/i.test(texto)) {
    await env.DB.prepare("UPDATE atend_conversas SET estado='reclamacao', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
    await avisarHumanoPush(env, conv).catch(() => {});
    const ack = "Poxa, sinto muito por isso! 😟 Já vou passar pro nosso time resolver o quanto antes. Obrigada por avisar, viu? 💛" + aviso;
    await enviarBot(env, conv.id, tel, { tipo: "texto", texto: ack });
    await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(conv.id).run();
    return { conversa_id: conv.id, estado: "reclamacao", coluna: "reclamacao", respostas: [{ tipo: "texto", texto: ack }], notificarHumano: true };
  }

  // IA de triagem (se ligada). A Big responde TODO MUNDO de forma natural — inclusive
  // representantes (nada de menu numerado "digite 1/2/3"). Reengaja também quem já tinha
  // terminado a conversa e voltou a falar. NÃO reengaja estados de coleta determinística
  // (nome/CNPJ/cidade) nem "atendimento-humano" (já tratado acima).
  if (cfgAt.atendimento_ia === "1"
      && (conv.estado === "novo" || conv.estado === "ia-triagem" || IA_REENGATA.has(conv.estado))) {
    // PRIMEIRO CONTATO: saudação fixa (sem gastar chamada de IA). Se o número já está
    // na base de clientes, identifica e saúda pelo nome; senão manda a saudação padrão.
    if (conv.estado === "novo") {
      const primeiro = String(conv.nome ?? conv.contato_nome ?? "").trim().split(/\s+/)[0] || "";
      const hBR = (new Date().getUTCHours() + 21) % 24;                    // Brasil (UTC-3)
      const ola = hBR < 12 ? "Bom dia" : hBR < 18 ? "Boa tarde" : "Boa noite";
      // Conversa que JÁ vinha em andamento (cliente da base OU a 1ª mensagem já fala de
      // pedido/relação — ex.: "tirar um novo pedido", "meu boleto"). Nesse caso a Big só
      // cumprimenta e passa DIRETO pro humano, sem o fluxo de "você é novo cliente?".
      const ehContinuacao = /(meu|nosso|[uú]ltimo|novo|pr[oó]ximo)\s+pedido|tirar\s+(um\s+|o\s+|mais\s+um\s+)?pedido|j[aá]\s+(comprei|compramos|fiz|fizemos)|sempre\s+compr|comprei\s+(com|de)\s+voc|nota\s+fiscal|boleto|fatura|reposi[çc]|mercadoria|meu\s+pagamento|confirma.*valor|valores?\s+(est|certo)|tira\s+o\s+|c[oó]d\.?\s*produto|qtd|desconto/i.test(texto);
      // Foto/áudio sozinho NÃO joga mais pro humano quando a pessoa é desconhecida: pode ser
      // consumidor final (a IA qualifica e indica loja parceira). Só vai direto pro humano
      // se já é cliente conhecido ou a mensagem indica um assunto em andamento (pedido etc.).
      if (conv.cliente_id || ehContinuacao) {
        const saud = (conv.cliente_id
          ? `${ola}${primeiro ? ", " + primeiro : ""}! 🤗 Que bom te ver de novo na *Big Tricot* 💛\nJá vou chamar alguém do nosso time pra te atender, tá? 😊`
          : `${ola}! 🤗 Aqui é da *Big Tricot* 💛\nJá vou chamar alguém do nosso time pra continuar seu atendimento, tá? 😊`) + aviso;
        await env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
        await garantirCardDaConversa(env, conv.id, conv.cliente_id ? "Cliente conhecido voltou a falar" : "Conversa em andamento → humano", "atendimento");
        await avisarHumanoPush(env, conv).catch(() => {});
        await enviarBot(env, conv.id, tel, { tipo: "texto", texto: saud });
        await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();
        return { conversa_id: conv.id, estado: "atendimento-humano", coluna: "atendimento-humano", respostas: [{ tipo: "texto", texto: saud }], notificarHumano: true };
      }
      // Contato novo → saudação padrão + a IA qualifica. Já cria o card no Funil (coluna Atendimento).
      const saud = SAUDACAO_NOVO;
      await env.DB.prepare("UPDATE atend_conversas SET estado='ia-triagem', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
      await garantirCardDaConversa(env, conv.id, "Novo contato no WhatsApp", "atendimento");
      await enviarBot(env, conv.id, tel, { tipo: "texto", texto: saud });
      await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();
      return { conversa_id: conv.id, estado: "ia-triagem", coluna: colunaDe("ia-triagem"), respostas: [{ tipo: "texto", texto: saud }], notificarHumano: false };
    }
    // Conversa em andamento: a IA responde. Cliente já cadastrado entra com contexto extra.
    let sistema = sistemaIa(cfgAt.ia_prompt) + await lerConhecimento(env);
    if (conv.cliente_id) {
      sistema += `\n\nCONTEXTO IMPORTANTE: este contato JÁ É CLIENTE cadastrado da Big Tricot (loja: ${conv.nome || "?"}${conv.cidade ? ", de " + conv.cidade + (conv.uf ? "/" + conv.uf : "") : ""}). Trate como cliente conhecido: NÃO peça CNPJ nem o nome da loja de novo. Ajude no que precisar; se ele PEDIR o catálogo use acao "enviar_catalogo"; se for pedido ou assunto comercial, use acao "humano" pra chamar o vendedor.`;
    } else if (conv.lojista === 1 || conv.cnpj) {
      sistema += `\n\nCONTEXTO: este lojista JÁ FOI QUALIFICADO (CNPJ confirmado${conv.nome ? ", loja: " + conv.nome : ""}). NÃO peça CNPJ nem nome da loja de novo. Ajude no que precisar; se ele PEDIR o catálogo use acao "enviar_catalogo".`;
    }
    const ia = await iaTriagem(env, conv, sistema, cfgAt.vitrine_url || VITRINE_PUBLICA);
    // Rede de segurança: se o cliente PEDIU o catálogo de forma clara mas a IA não
    // classificou (às vezes ela responde "vou enviar… aguarde" e não manda), força o
    // envio do link agora — sem a resposta enrolada.
    if (!ia.catalogo && PEDE_CATALOGO_RE.test(texto)) { ia.catalogo = true; ia.saidas = []; ia.novoEstado = "catalogo-enviado"; }
    // Cliente pediu o catálogo → anexa a mensagem do catálogo (virtual/link), montada da config.
    if (ia.catalogo) {
      // Manda a tabela da REGIÃO do cliente (Norte/NE vs Sul), pela UF.
      for (const s of montarCatalogo(deps(env, { url: cfgAt.catalogo_url, senha: cfgAt.catalogo_senha, msg: cfgAt.catalogo_msg }))) {
        s.texto = ajustarCatalogoRegiao(s.texto, conv.uf, tel);
        ia.saidas.push(s);
      }
      // Registra na coluna "📥 Catálogo (contato)" do funil — cliente que entrou em contato e recebeu.
      await garantirCardDaConversa(env, conv.id, "Catálogo enviado (cliente entrou em contato)");
    }
    // Cliente quer o status do pedido → resolve o CNPJ (do cadastro, da IA, ou da própria
    // mensagem) e consulta a produção. Sem CNPJ, pede. Guarda o CNPJ na conversa pra próxima.
    if (ia.consultarPedido) {
      const cnpj = [ia.cnpjConsulta, digitos(conv.cnpj), digitos(texto)].find((x) => (x || "").length === 14) || "";
      if (cnpj) {
        if (!conv.cnpj) await env.DB.prepare("UPDATE atend_conversas SET cnpj=? WHERE id=?").bind(cnpj, conv.id).run();
        ia.saidas = await consultarStatusPedido(env, cnpj);
      } else {
        ia.saidas = [{ tipo: "texto", texto: "Pra localizar seu pedido, me passa o *CNPJ* da sua loja (só os números)? 😊" }];
      }
    }
    await env.DB.prepare("UPDATE atend_conversas SET estado=?, tipo=COALESCE(?, tipo), setor=COALESCE(NULLIF(?,''), setor), atualizado_em=datetime('now') WHERE id=?")
      .bind(ia.novoEstado, ia.tipo, ia.setor ?? "", conv.id).run();
    if (ia.novoEstado === "atendimento-humano" && estadoAntes !== "atendimento-humano") await avisarHumanoPush(env, conv);
    // Fora do horário e a IA está passando pra humano → avisa o cliente sobre o horário.
    if (ia.novoEstado === "atendimento-humano" && aviso) {
      if (ia.saidas.length) ia.saidas[ia.saidas.length - 1].texto += aviso;
      else ia.saidas.push({ tipo: "texto", texto: aviso.trimStart() });
    }
    for (const s of ia.saidas) {
      await enviarBot(env, conv.id, tel, s);
    }
    if (ia.saidas.length) await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();
    return { conversa_id: conv.id, estado: ia.novoEstado, coluna: colunaDe(ia.novoEstado), respostas: ia.saidas, notificarHumano: ia.notificarHumano };
  }

  // Passa o contexto de identificação pro robô (saudação personalizada de cliente conhecido).
  conv.clienteConhecido = !!conv.cliente_id;
  const r = await processar(conv as Conversa, texto, deps(env, { url: cfgAt.catalogo_url, senha: cfgAt.catalogo_senha, msg: cfgAt.catalogo_msg }, cfgAt.vitrine_url || VITRINE_PUBLICA));

  // Representante responsável: 1º o que já veio (cliente/base), senão pela região da UF.
  let representanteFinal = conv.representante ?? null;
  if (!representanteFinal && (r.qualificado || r.conv.lojista === 1) && r.conv.uf) {
    representanteFinal = await representantePorRegiao(env, r.conv.uf);
  }
  // Classificação do tipo conforme o desfecho.
  let tipoFinal = conv.tipo ?? null;
  if (r.qualificado || r.conv.lojista === 1) tipoFinal = "lojista";
  else if (r.conv.estado === "aguardando-cidade-parceiro" || r.conv.estado === "indicado-parceiro") tipoFinal = "consumidor";

  // Encaminhamento ao representante NÃO é automático: se há um representante
  // sugerido e ainda não foi autorizado, marca como PENDENTE (a equipe aprova).
  let autorizado = conv.autorizado ?? null;
  if (representanteFinal && autorizado == null) autorizado = 0;

  await env.DB.prepare(
    `UPDATE atend_conversas SET estado=?, nome=?, setor=?, cnpj=?, cidade=?, uf=?, lojista=?, tipo=?, representante=?, autorizado=?, atualizado_em=datetime('now') WHERE id=?`
  ).bind(r.conv.estado, r.conv.nome ?? null, r.conv.setor ?? null, r.conv.cnpj ?? null, r.conv.cidade ?? null, r.conv.uf ?? null, r.conv.lojista ?? null, tipoFinal, representanteFinal, autorizado, conv.id).run();

  if (r.conv.estado === "atendimento-humano" && estadoAntes !== "atendimento-humano") {
    await avisarHumanoPush(env, { id: conv.id, nome: r.conv.nome ?? conv.nome, contato_nome: conv.contato_nome, telefone: conv.telefone });
  }
  // Fora do horário e passou pra humano → avisa sobre o horário de atendimento.
  if (r.conv.estado === "atendimento-humano" && aviso) {
    if (r.saidas.length) r.saidas[r.saidas.length - 1].texto += aviso;
    else r.saidas.push({ tipo: "texto", texto: aviso.trimStart() });
  }

  for (const s of r.saidas) {
    await enviarBot(env, conv.id, tel, s);
  }
  if (r.saidas.length) await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();

  // Qualificou (lojista + catálogo) → vira lead no Funil de Vendas, já com o representante.
  if (r.qualificado && !conv.card_id) {
    const cardId = uid();
    await env.DB.prepare(
      "INSERT INTO funil_cards (id, nome, whatsapp, etapa, responsavel) VALUES (?, ?, ?, 'primeiro-contato', ?)"
    ).bind(cardId, r.conv.nome || "Lead WhatsApp", tel, representanteFinal ?? conv.responsavel ?? null).run();
    await env.DB.prepare(
      "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em) VALUES (?, ?, 'Assumir e montar pedido', date('now','+1 day'))"
    ).bind(uid(), cardId).run();
    await env.DB.prepare("UPDATE atend_conversas SET card_id=? WHERE id=?").bind(cardId, conv.id).run();
  }

  return { conversa_id: conv.id, estado: r.conv.estado, coluna: colunaDe(r.conv.estado), respostas: r.saidas, notificarHumano: r.notificarHumano };
}

// ── ENTRADA de mensagem (SIMULADOR) ──────────────────────────────────────────────
// Corpo: { telefone, texto }. Mesma lógica do webhook, para testar sem WhatsApp.
atendimento.post("/entrada", async (c) => {
  const b = await c.req.json<{ telefone?: string; texto?: string }>().catch(() => ({}) as Record<string, string>);
  const r = await receberMensagem(c.env, b.telefone, b.texto, "whatsapp", "", new URL(c.req.url).origin);
  if ("erro" in r) return c.json({ error: r.erro }, 400);
  return c.json(r);
});

// ── RESET de conversa (SIMULADOR) ────────────────────────────────────────────────
// Apaga a conversa daquele telefone (mensagens, interesses e o card do funil, se
// houver) para testar o robô do zero — o "oi" volta a abrir o atendimento.
atendimento.post("/reset", async (c) => {
  const b = await c.req.json<{ telefone?: string }>().catch(() => ({}) as Record<string, string>);
  const tel = digitos(b.telefone);
  if (!tel) return c.json({ error: "telefone é obrigatório" }, 400);
  const conv = await c.env.DB.prepare("SELECT id, card_id FROM atend_conversas WHERE telefone = ?")
    .bind(tel).first<{ id: string; card_id: string | null }>();
  if (conv) {
    if (conv.card_id) {
      await c.env.DB.prepare("DELETE FROM funil_tarefas WHERE card_id = ?").bind(conv.card_id).run();
      await c.env.DB.prepare("DELETE FROM funil_cards WHERE id = ?").bind(conv.card_id).run();
    }
    await c.env.DB.prepare("DELETE FROM atend_interesses WHERE conversa_id = ?").bind(conv.id).run();
    await c.env.DB.prepare("DELETE FROM atend_mensagens WHERE conversa_id = ?").bind(conv.id).run();
    await c.env.DB.prepare("DELETE FROM atend_conversas WHERE id = ?").bind(conv.id).run();
  }
  return c.json({ ok: true, removida: !!conv });
});

// ── WEBHOOK da Z-API (mensagem recebida) ─────────────────────────────────────────
// Configure no painel Z-API (Ao receber) a URL: <seu-dominio>/api/atendimento/webhook
// Ignora mensagens enviadas por nós (fromMe) e callbacks de status. Só texto por ora.
atendimento.post("/webhook", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  // Callback de STATUS (entregue/lido) — atualiza os ✓✓ das mensagens que ENVIAMOS.
  // IMPORTANTE: mensagem RECEBIDA da Z-API também traz status:"RECEIVED" — por isso NÃO
  // pode capturar aqui pelo status; só o callback de status real (type MessageStatusCallback,
  // que manda "ids" em array). ReceivedCallback é sempre tratado como mensagem, mais abaixo.
  if (b.type !== "ReceivedCallback" && (b.type === "MessageStatusCallback" || b.type === "DeliveryCallback" || Array.isArray(b.ids))) {
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String) : (b.messageId ? [String(b.messageId)] : []);
    const st = String(b.status ?? "").toUpperCase();
    const novo = (st === "READ" || st === "PLAYED") ? "read" : (st === "RECEIVED" || st === "DELIVERED") ? "delivered" : (st === "SENT") ? "sent" : "";
    const rank = novo === "read" ? 3 : novo === "delivered" ? 2 : novo === "sent" ? 1 : 0;
    if (novo && ids.length) {
      for (const mid of ids) {
        await c.env.DB.prepare(
          "UPDATE atend_mensagens SET status=? WHERE zap_id=? AND (CASE status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END) < ?"
        ).bind(novo, mid, rank).run();
      }
    }
    return c.json({ ok: true, status: novo, n: ids.length });
  }
  // Interruptor mestre: se o atendimento automático estiver desligado, NÃO responde
  // clientes reais (fica em modo teste interno pelo Simulador). Ignora silenciosamente.
  const cfg = await lerConfig(c.env);
  // Diagnóstico: guarda o último webhook recebido (pra depurar "mensagem não chegou").
  try { await c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('webhook_ultimo', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(JSON.stringify(b).slice(0, 3000)).run(); } catch { /* ignora */ }
  // "Atendimento automático" desligado: NÃO deixa mais a mensagem sumir — ela é REGISTRADA
  // (aparece na caixa e vai pra humano), só que a Big não responde sozinha (soRegistrar=true).
  const soRegistrar = cfg.atendimento_ativo !== "1";
  // GRUPOS: o robô NUNCA responde no grupo, mas ARQUIVA a mensagem na coluna "👥 Grupos"
  // pra você ver e responder à mão. (Não segue pro fluxo do robô.)
  if (b.isGroup === true || b.isGroupMessage === true) {
    const okG = await registrarGrupo(c.env, new URL(c.req.url).origin, b);
    return c.json({ ok: okG, grupo: true });
  }
  // Só processa mensagem recebida de terceiro.
  if (b.fromMe === true) return c.json({ ignorado: "fromMe" });
  if (b.type && b.type !== "ReceivedCallback") return c.json({ ignorado: String(b.type) });
  const phone = digitos(b.phone ?? b.participantPhone ?? b.connectedPhone);
  // Texto pode vir em text.message, ou legendas de mídia (image.caption etc.).
  const t = b.text as { message?: string } | undefined;
  const img = b.image as { caption?: string; imageUrl?: string; url?: string } | undefined;
  const audio = b.audio as { audioUrl?: string; url?: string } | undefined;
  let texto = (t?.message ?? img?.caption ?? "").toString();
  const nomeContato = String(b.senderName ?? b.chatName ?? b.pushName ?? "").trim();
  if (!phone) return c.json({ ignorado: "sem-telefone" });
  // É um MEMBRO da equipe (número externo cadastrado na Comunicação interna)? Então a
  // mensagem NÃO vai pro robô de clientes — ela cai no chat interno da equipe (canal ext:<id>).
  {
    const coreM = phone.replace(/^55/, "").slice(-8);
    const membro = coreM.length >= 8
      ? await c.env.DB.prepare("SELECT id, nome FROM chat_membros WHERE telefone <> '' AND telefone LIKE '%' || ? LIMIT 1").bind(coreM).first<{ id: string; nome: string }>().catch(() => null)
      : null;
    if (membro) {
      let txt = String((b.text as { message?: string } | undefined)?.message ?? (b.image as { caption?: string } | undefined)?.caption ?? "").trim();
      if (!txt && b.audio) { const a = b.audio as { audioUrl?: string; url?: string }; txt = (await transcreverAudio(c.env, a.audioUrl || a.url || "").catch(() => "")) || "🎤 (áudio)"; }
      if (!txt && b.image) txt = "📷 (foto)";
      if (!txt) txt = "(mensagem)";
      await c.env.DB.prepare("INSERT INTO chat_mensagens (id, canal, autor, texto) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), "ext:" + membro.id, membro.nome, txt.slice(0, 2000)).run();
      return c.json({ ok: true, membro: membro.id });
    }
  }
  // Áudio (nota de voz): transcreve com IA e trata como texto normal. Se não der pra
  // ouvir, responde pedindo por escrito — em vez de ignorar e deixar o cliente sem resposta.
  const origin = new URL(c.req.url).origin;
  let arquivoUrl = "";
  if (!texto.trim() && audio) {
    const audioSrc = audio.audioUrl || audio.url || "";
    texto = await transcreverAudio(c.env, audioSrc);
    arquivoUrl = await guardarMidiaExterna(c.env, origin, audioSrc, "ogg"); // pra o atendente OUVIR
    if (!texto.trim()) {
      // Sem transcrição, mas guardamos o áudio: registra a conversa com o player, avisa o cliente.
      if (arquivoUrl) { await receberMensagem(c.env, phone, "🎤 (áudio)", "whatsapp", nomeContato, origin, String(b.messageId ?? ""), arquivoUrl, soRegistrar); return c.json({ ok: true, audio: true }); }
      if (!soRegistrar) await enviarWhatsapp(c.env, phone, { tipo: "texto", texto: "Oi! 😊 Recebi seu áudio, mas não consegui ouvir direitinho por aqui. Pode me mandar por *escrito*, por favor? Assim já te respondo! 💛" });
      else await receberMensagem(c.env, phone, "🎤 (áudio)", "whatsapp", nomeContato, origin, String(b.messageId ?? ""), "", soRegistrar);
      return c.json({ ignorado: "audio-sem-transcricao" });
    }
  }
  // Imagem: a Big "enxerga" a foto com IA de visão e usa o que viu como contexto. Mantém
  // a legenda (se houver) como a fala do cliente e anexa a descrição do que aparece.
  if (img && (img.imageUrl || img.url)) {
    const imgSrc = img.imageUrl || img.url || "";
    arquivoUrl = await guardarMidiaExterna(c.env, origin, imgSrc, "jpg"); // pra o atendente VER a foto
    const desc = await descreverImagem(c.env, imgSrc);
    if (desc) {
      const legenda = (img.caption || "").trim();
      texto = legenda
        ? `${legenda}\n\n[O cliente enviou uma foto. O que aparece nela: ${desc}]`
        : `[O cliente enviou uma foto (sem legenda). O que aparece nela: ${desc}]`;
    } else if (arquivoUrl) {
      texto = (img.caption || "").trim() || "📷 (foto)";
    }
  }
  // Documento (PDF, planilha, etc.): guarda o arquivo no nosso R2 pra o atendente ABRIR/baixar
  // na conversa. Sem isto, um PDF do cliente era ignorado (não virava link no chat).
  const doc = b.document as { documentUrl?: string; url?: string; fileName?: string; title?: string; mimeType?: string; caption?: string } | undefined;
  if (!arquivoUrl && doc && (doc.documentUrl || doc.url)) {
    const docSrc = doc.documentUrl || doc.url || "";
    const nomeArq = String(doc.fileName || doc.title || "documento").trim();
    const ext = (nomeArq.match(/\.([a-z0-9]{2,5})$/i)?.[1] || (String(doc.mimeType || "").includes("pdf") ? "pdf" : "bin")).toLowerCase();
    arquivoUrl = await guardarMidiaExterna(c.env, origin, docSrc, ext);
    if (arquivoUrl) {
      const legenda = (doc.caption || "").trim();
      texto = legenda ? `${legenda}\n📎 ${nomeArq}` : `📎 ${nomeArq}`;
    }
  }
  if (!texto.trim()) {
    // Foto que não deu pra descrever e sem legenda: responde em vez de ignorar.
    if (img) {
      if (!soRegistrar) await enviarWhatsapp(c.env, phone, { tipo: "texto", texto: "Oi! 😊 Recebi sua foto! Me conta em uma frase o que você procura (produto, cor, tamanho) que eu já te ajudo? 💛" });
      else await receberMensagem(c.env, phone, "📷 (foto)", "whatsapp", nomeContato, origin, String(b.messageId ?? ""), arquivoUrl, soRegistrar);
      return c.json({ ignorado: "imagem-sem-descricao" });
    }
    return c.json({ ignorado: "sem-texto" });
  }
  const r = await receberMensagem(c.env, phone, texto, "whatsapp", nomeContato, origin, String(b.messageId ?? ""), arquivoUrl, soRegistrar);
  if ("erro" in r) return c.json({ error: r.erro }, 400);
  return c.json({ ok: true, conversa_id: r.conversa_id });
});

// ── EVENTO do catálogo (o catálogo faz POST aqui) ────────────────────────────────
// Body: { tipo, telefone, loja?, rep?, produto?, code? }.
// tipo: acesso | abertura | download | envio | rep_acesso | produto.
// Cria/atualiza a conversa (origem=catálogo, vira lead) e registra o evento no histórico.
const EVENTO_LABEL: Record<string, (b: { loja?: string; rep?: string; produto?: string }) => string> = {
  acesso: (b) => `🔗 Entrou no catálogo${b.loja ? ` — loja: *${b.loja}*` : ""}`,
  abertura: () => "📖 Abriu o catálogo",
  download: () => "⬇️ Baixou o catálogo",
  envio: () => "📤 Catálogo enviado",
  rep_acesso: (b) => `🧑‍💼 Acesso pelo link do representante${b.rep ? ` (${b.rep})` : ""}`,
  produto: (b) => `👀 Visualizou: *${b.produto || "produto"}*`,
};

// Cria/atualiza a conversa a partir de um evento do catálogo e registra no histórico.
async function registrarEventoCatalogo(env: Env, ev: { tipo?: string; telefone?: string; loja?: string; rep?: string; produto?: string }): Promise<string | null> {
  const tel = digitos(ev.telefone);
  if (!tel) return null;
  const tipo = (ev.tipo || "").trim().toLowerCase();
  const loja = (ev.loja || "").trim().slice(0, 80) || null;
  const rep = (ev.rep || "").trim() || null;

  let conv: { id: string; nome?: string | null; representante?: string | null } | null = await acharConversaPorTelefone(env, tel);
  if (!conv) {
    const id = uid();
    const cliente = await identificarCliente(env, tel);
    let representante = rep, nome = loja, cnpj: string | null = null, cidade: string | null = null, uf: string | null = null, clienteId: string | null = null;
    let tipoConv: string | null = rep ? "lojista" : null;
    if (cliente) {
      clienteId = cliente.id; nome = nome || cliente.nome; cnpj = cliente.cnpj; cidade = cliente.cidade; uf = cliente.uf; tipoConv = "lojista";
      representante = representante || cliente.representante || (await representantePorRegiao(env, cliente.uf));
    }
    await env.DB.prepare(
      "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, representante, cliente_id, nome, cnpj, cidade, uf) VALUES (?, ?, 'novo', 'catalogo', ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, tel, tipoConv, representante, clienteId, nome, cnpj, cidade, uf).run();
    conv = { id, nome, representante };
  } else {
    const sets = ["origem='catalogo'"], binds: unknown[] = [];
    if (loja && !conv.nome) { sets.push("nome=?"); binds.push(loja); }
    if (rep && !conv.representante) { sets.push("representante=?"); binds.push(rep); }
    await env.DB.prepare(`UPDATE atend_conversas SET ${sets.join(", ")}, atualizado_em=datetime('now') WHERE id=?`).bind(...binds, conv.id).run();
  }

  const label = (EVENTO_LABEL[tipo] || ((x: { produto?: string }) => `📌 Catálogo: ${tipo}${x.produto ? ` (${x.produto})` : ""}`))({ loja: loja || undefined, rep: rep || undefined, produto: ev.produto });
  // Anti-flood: não grava o mesmo evento de catálogo se um idêntico já foi registrado
  // nesta conversa nas últimas 6h. Sem isso, reabrir o link várias vezes inunda o
  // histórico com dezenas de "Entrou no catálogo" iguais (bug do "eee").
  const repetido = await env.DB.prepare(
    "SELECT 1 FROM atend_mensagens WHERE conversa_id=? AND autor='catalogo' AND texto=? AND criado_em >= datetime('now','-6 hours') LIMIT 1"
  ).bind(conv.id, label).first().catch(() => null);
  if (!repetido) await addMsg(env, conv.id, "in", "catalogo", "sistema", label);
  await env.DB.prepare("UPDATE atend_conversas SET atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
  if (tipo === "produto" && ev.produto) {
    await env.DB.prepare("INSERT OR IGNORE INTO atend_interesses (id, conversa_id, termo) VALUES (?, ?, ?)").bind(uid(), conv.id, String(ev.produto).trim().slice(0, 60)).run();
    await env.DB.prepare("UPDATE atend_conversas SET interessado=1 WHERE id=?").bind(conv.id).run();
  }
  // Lead do catálogo aparece como card no funil (coluna "📥 Catálogo (contato)").
  await garantirCardDaConversa(env, conv.id, `Lead do catálogo (${tipo || "acesso"})`);
  return conv.id;
}

atendimento.post("/catalogo-evento", async (c) => {
  // Desativado a pedido: quem só VÊ o catálogo NÃO é trazido pro atendimento/funil.
  // O evento é aceito (pra não dar erro no catálogo), mas ignorado — só entra no sistema
  // quem realmente manda mensagem no WhatsApp.
  return c.json({ ok: true, ignorado: "catalogo-visualizacao" });
});

// ── LEITURA (PULL) da atividade do catálogo (bt-atividade) — chamado pelo cron ────
// Lê GET no /log configurado, mapeia repId→repNome (dos eventos "envio"), e cria os
// leads no board. Guarda o último ts processado para não repetir. Read-only p/ o cliente.
// Corrige a URL do log: codifica o "|" cru.
function urlLogAtividade(cfg: Record<string, string>): string {
  return (cfg.catalogo_log_url || "").trim().replace(/\|/g, "%7C");
}
// Busca o /log usando o service binding (Worker→Worker direto) quando disponível;
// senão cai no fetch normal. O binding evita o 404 de chamada entre workers.dev.
function buscarLogAtividade(env: Env, url: string): Promise<Response> {
  const init: RequestInit = { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) };
  return env.ATIVIDADE ? env.ATIVIDADE.fetch(url, init) : fetch(url, init);
}
export async function lerAtividadeCatalogo(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  const url = urlLogAtividade(cfg);
  if (!url) return 0;
  let eventos: Array<Record<string, unknown>> = [];
  try {
    const resp = await buscarLogAtividade(env, url);
    if (!resp.ok) return 0;
    const dados = await resp.json<{ eventos?: Array<Record<string, unknown>> }>();
    eventos = Array.isArray(dados?.eventos) ? dados.eventos : [];
  } catch {
    return 0;
  }
  // Mapa repId → repNome. O "acesso" não traz o nome; resolvemos por 2 fontes:
  //  1) os representantes cadastrados no catálogo (Firestore) — fonte principal;
  //  2) eventos "envio", que às vezes já trazem o repNome.
  const repMap = new Map<string, string>();
  try {
    const cat = await catalogoExterno();
    const reps = cat.representantes;
    if (Array.isArray(reps)) {
      for (const r of reps as Record<string, unknown>[]) {
        const rid = String(r?.repId ?? r?.id ?? r?.codigo ?? "").trim();
        const rnome = String(r?.nome ?? r?.name ?? r?.repNome ?? "").trim();
        if (rid && rnome) repMap.set(rid, rnome);
      }
    }
  } catch { /* sem catálogo agora → cai no mapa por eventos */ }
  for (const e of eventos) {
    const rid = String(e.repId ?? ""), rnome = String(e.repNome ?? "").trim();
    if (rid && rnome) repMap.set(rid, rnome);
  }
  const ultimoTs = Number(cfg.catalogo_log_ts || "0");
  eventos.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));
  let maxTs = ultimoTs, n = 0;
  for (const e of eventos) {
    const ts = Number(e.ts ?? 0);
    if (ts <= ultimoTs) continue;
    const rep = String(e.repNome ?? "").trim() || repMap.get(String(e.repId ?? "")) || null;
    await registrarEventoCatalogo(env, {
      tipo: String(e.tipo ?? ""),
      telefone: String(e.telefone ?? e.clienteTel ?? ""),
      loja: String(e.loja ?? e.clienteNome ?? ""),
      rep: rep ?? undefined,
    });
    if (ts > maxTs) maxTs = ts;
    n++;
  }
  if (maxTs > ultimoTs) {
    await env.DB.prepare(
      "INSERT INTO config (chave, valor, atualizado_em) VALUES ('catalogo_log_ts', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
    ).bind(String(maxTs)).run();
  }
  return n;
}

// ── CONFIG Z-API (ler/salvar/testar) — antes de "/:id" para não ser capturado ────
const ZAPI_CHAVES = ["zapi_base", "zapi_instance", "zapi_token", "zapi_client_token", "zapi_ativo"] as const;
const BOOL_CHAVES = new Set(["zapi_ativo", "atendimento_ativo", "atendimento_ia", "followup_ativo", "followup_domingo", "followup_ia", "pos_venda_ativo", "recompra_ativo", "reativacao_ativo", "atend_domingo"]);

atendimento.get("/config", async (c) => {
  const cfg = await lerConfig(c.env);
  return c.json({
    zapi_base: cfg.zapi_base || "https://api.z-api.io",
    zapi_instance: cfg.zapi_instance || "",
    zapi_token: cfg.zapi_token || "",
    zapi_client_token: cfg.zapi_client_token || "",
    zapi_ativo: cfg.zapi_ativo === "1",
    atendimento_ativo: cfg.atendimento_ativo === "1",
    atendimento_ia: cfg.atendimento_ia === "1",
    equipe_numeros: cfg.equipe_numeros || "",
    ia_prompt: cfg.ia_prompt || "",
    ia_prompt_padrao: IA_SISTEMA,
    catalogo_url: cfg.catalogo_url || "",
    catalogo_senha: cfg.catalogo_senha || "",
    catalogo_msg: cfg.catalogo_msg || "",
    atend_hora_ini: cfg.atend_hora_ini || "7",
    atend_hora_fim: cfg.atend_hora_fim || "17",
    atend_domingo: cfg.atend_domingo === "1",
    followup_ativo: (cfg.followup_ativo ?? "1") === "1",
    followup_hora_ini: cfg.followup_hora_ini || "8",
    followup_hora_fim: cfg.followup_hora_fim || "18",
    followup_domingo: cfg.followup_domingo === "1",
    followup_ia: cfg.followup_ia === "1",
    pos_venda_ativo: (cfg.pos_venda_ativo ?? "1") === "1",
    pos_venda_dias: cfg.pos_venda_dias || "7",
    recompra_ativo: (cfg.recompra_ativo ?? "1") === "1",
    recompra_dias: cfg.recompra_dias || "45",
    reativacao_ativo: (cfg.reativacao_ativo ?? "0") === "1",
    reativacao_dias: cfg.reativacao_dias || "30",
    reativacao_limite: cfg.reativacao_limite || "12",
    reativacao_intervalo_seg: cfg.reativacao_intervalo_seg || "40",
    reativacao_msg: cfg.reativacao_msg || "",
    reativacao_msg_padrao: MSG_REATIVACAO_PADRAO,
    catalogo_evento_token: cfg.catalogo_evento_token || "",
    catalogo_evento_url: new URL(c.req.url).origin + "/api/atendimento/catalogo-evento",
    catalogo_log_url: cfg.catalogo_log_url || "",
    webhook_url: new URL(c.req.url).origin + "/api/atendimento/webhook",
  });
});

atendimento.post("/config", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const pares: [string, string][] = [];
  for (const k of [...ZAPI_CHAVES, "atendimento_ativo", "atendimento_ia", "equipe_numeros", "ia_prompt", "catalogo_url", "catalogo_senha", "catalogo_msg", "atend_hora_ini", "atend_hora_fim", "atend_domingo", "followup_ativo", "followup_hora_ini", "followup_hora_fim", "followup_domingo", "followup_ia", "pos_venda_ativo", "pos_venda_dias", "recompra_ativo", "recompra_dias", "reativacao_ativo", "reativacao_dias", "reativacao_limite", "reativacao_intervalo_seg", "reativacao_msg", "catalogo_evento_token", "catalogo_log_url"] as const) {
    if (k in b) {
      const v = BOOL_CHAVES.has(k) ? (b[k] ? "1" : "0") : String(b[k] ?? "").trim();
      pares.push([k, v]);
    }
  }
  for (const [chave, valor] of pares) {
    await c.env.DB.prepare(
      "INSERT INTO config (chave, valor, atualizado_em) VALUES (?, ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
    ).bind(chave, valor).run();
  }
  return c.json({ ok: true });
});

// ── Respostas prontas (atalhos de texto que o atendente insere na conversa) ──────
// Guardadas como JSON na tabela config (chave respostas_rapidas). Editáveis pelo
// próprio atendente na tela da conversa.
// Respostas DA EMPRESA (compartilhadas): aparecem pra todos os atendentes. Editáveis
// pelo gestor. Guardadas na chave global "respostas_empresa".
const RESPOSTAS_EMPRESA_PADRAO: { titulo: string; texto: string }[] = [
  { titulo: "Convite pra cadastrar no site (lojista)", texto: "📢 *Sua loja pode ser encontrada por novos clientes!*\n\nTodos os dias recebemos mensagens de consumidores perguntando onde encontrar produtos Big Tricot em suas cidades.\n\nPensando nisso, estamos criando em nosso site a página *“Onde Encontrar”*, onde o consumidor poderá pesquisar por estado e cidade e encontrar as lojas parceiras que revendem Big Tricot.\n\nAlém disso, vamos divulgar essa página em nossas redes sociais para facilitar ainda mais essa conexão entre consumidores e nossos parceiros.\n\nSe você deseja que sua loja apareça nessa busca, basta preencher o cadastro no link abaixo:\n\n👉 https://cadastro.bigtricot.com.br\n\nO cadastro é rápido e gratuito.\n\nEsperamos contar com você para fortalecer ainda mais a rede de lojas Big Tricot! 🖤" },
  { titulo: "Indicar loja parceira (consumidor)", texto: "Oi! 😊 A Big Tricot é uma *fábrica* e trabalha no *atacado, só com lojistas* — por isso não fazemos venda direta pro consumidor final.\n\nMas a gente te ajuda a encontrar uma *loja parceira* que revende nossos produtos pertinho de você! 🖤\n\nÉ só acessar e buscar pela sua cidade:\n👉 https://ondecomprar.bigtricot.com.br\n\nQualquer dúvida, estou por aqui! 💛" },
  { titulo: "Horário de atendimento", texto: "Nosso atendimento é de *segunda a sexta, das 8h às 18h*. Assim que abrir já te respondo por aqui! 🙌" },
  { titulo: "Pedir dados da loja", texto: "Pra eu já adiantar seu cadastro, me manda por favor: *nome da loja*, *cidade/UF* e *CNPJ*. 📋" },
];
// Cada atendente tem as SUAS respostas: guardadas na chave respostas_rapidas:<usuario>.
// Sem usuário (compatibilidade) cai na chave global antiga.
const respostasKey = (u?: string | null) => {
  const s = String(u ?? "").trim().toLowerCase();
  return s ? `respostas_rapidas:${s}` : "respostas_rapidas";
};
// Normaliza uma lista de respostas recebida do cliente (título + texto).
function normalizarRespostas(src: unknown): { titulo: string; texto: string }[] {
  return Array.isArray(src)
    ? src.filter((x): x is { titulo?: unknown; texto?: unknown } => !!x && typeof x === "object" && typeof (x as { texto?: unknown }).texto === "string" && String((x as { texto: string }).texto).trim() !== "")
        .map((x) => ({ titulo: String(x.titulo ?? "").slice(0, 60), texto: String(x.texto).slice(0, 1000) }))
    : [];
}
async function salvarConfigJson(env: Env, chave: string, valor: unknown) {
  await env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES (?, ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(chave, JSON.stringify(valor)).run();
}
atendimento.get("/respostas", async (c) => {
  const cfg = await lerConfig(c.env);
  const raw = cfg[respostasKey(c.req.query("u"))];
  if (raw == null) return c.json([]); // pessoais começam vazias; as padrão ficam em "empresa"
  let arr: unknown = [];
  try { arr = JSON.parse(raw); } catch { arr = []; }
  return c.json(Array.isArray(arr) ? arr : []);
});
atendimento.post("/respostas", async (c) => {
  const b = await c.req.json<unknown>().catch(() => ({}));
  // Aceita { usuario, respostas: [...] } (novo) ou um array direto (antigo/global).
  const usuario = (b && typeof b === "object" && !Array.isArray(b)) ? (b as { usuario?: string }).usuario : undefined;
  const arr = normalizarRespostas(Array.isArray(b) ? b : (b as { respostas?: unknown })?.respostas);
  await salvarConfigJson(c.env, respostasKey(usuario), arr);
  return c.json({ ok: true, respostas: arr });
});
// Respostas da empresa (compartilhadas com todos).
atendimento.get("/respostas-empresa", async (c) => {
  const cfg = await lerConfig(c.env);
  if (cfg.respostas_empresa == null) return c.json(RESPOSTAS_EMPRESA_PADRAO);
  let arr: unknown = [];
  try { arr = JSON.parse(cfg.respostas_empresa); } catch { arr = []; }
  return c.json(Array.isArray(arr) ? arr : []);
});
atendimento.post("/respostas-empresa", async (c) => {
  const b = await c.req.json<unknown>().catch(() => ({}));
  const arr = normalizarRespostas(Array.isArray(b) ? b : (b as { respostas?: unknown })?.respostas);
  await salvarConfigJson(c.env, "respostas_empresa", arr);
  return c.json({ ok: true, respostas: arr });
});

// ── COLUNAS do quadro de atendimento (built-in + customizadas + ordem) ────────────
// Colunas criadas à mão que devem ser ESCONDIDAS (pedido do gestor). Comparação sem acento
// e minúscula. Os cards que estiverem nelas caem no fluxo automático (não somem).
const COLUNAS_OCULTAS = new Set(["em negociacao"]);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
async function lerColunasAtend(env: Env): Promise<{ id: string; label: string; cor: string; custom?: boolean }[]> {
  const cfg = await lerConfig(env);
  let extra: { id: string; label: string; cor: string; custom: boolean }[] = [];
  try {
    const raw = JSON.parse(cfg.atend_colunas_extra || "[]");
    if (Array.isArray(raw)) extra = raw.filter((x) => x && x.id && x.label && !COLUNAS_OCULTAS.has(semAcento(String(x.label)))).map((x) => ({ id: String(x.id), label: String(x.label), cor: String(x.cor || "#64748b"), custom: true }));
  } catch { extra = []; }
  const base = ATEND_COLUNAS.map((c0) => ({ id: c0.id as string, label: c0.label as string, cor: c0.cor as string }));
  const baseIdx = new Map(base.map((b, i) => [b.id, i]));
  const todas = [...base, ...extra.filter((e) => !base.some((b) => b.id === e.id))];
  let ordem: string[] = [];
  try { const o = JSON.parse(cfg.atend_colunas_ordem || "[]"); if (Array.isArray(o)) ordem = o.map(String); } catch { ordem = []; }
  // As colunas PADRÃO seguem a ordem CANÔNICA do código (ATEND_COLUNAS) — assim reordenar
  // é só mexer no array, e uma ordem antiga salva no banco não bagunça mais. As colunas
  // CRIADAS pelo gestor vêm depois, na ordem que ele salvou.
  const customPos = (id: string) => { const i = ordem.indexOf(id); return i < 0 ? 9999 : i; };
  const chave = (id: string) => (baseIdx.has(id) ? baseIdx.get(id)! : 1000 + customPos(id));
  const ordenadas = todas.map((c0, i) => ({ ...c0, _i: i })).sort((a, b) => (chave(a.id) - chave(b.id)) || (a._i - b._i)).map(({ _i, ...c0 }) => { void _i; return c0; });
  // "Reclamação ou pendência" SEMPRE por último (depois inclusive das colunas criadas).
  const iRec = ordenadas.findIndex((c0) => c0.id === "reclamacao");
  if (iRec >= 0) ordenadas.push(ordenadas.splice(iRec, 1)[0]);
  return ordenadas;
}
atendimento.get("/colunas", async (c) => c.json({ colunas: await lerColunasAtend(c.env) }));
atendimento.post("/colunas", async (c) => {
  const b = await c.req.json<{ extra?: { id?: string; label?: string; cor?: string }[]; ordem?: string[] }>().catch(() => ({}) as Record<string, never>);
  const extra = Array.isArray(b.extra)
    ? b.extra.filter((x) => x && String(x.label ?? "").trim()).map((x) => ({ id: String(x.id || ("col-" + uid())).slice(0, 40), label: String(x.label).slice(0, 40), cor: String(x.cor || "#64748b").slice(0, 20) }))
    : [];
  const ordem = Array.isArray(b.ordem) ? b.ordem.map(String) : [];
  await salvarConfigJson(c.env, "atend_colunas_extra", extra);
  await salvarConfigJson(c.env, "atend_colunas_ordem", ordem);
  return c.json({ ok: true, colunas: await lerColunasAtend(c.env) });
});
// Encerrar atendimento: só marca como resolvido (para de piscar). NÃO envia nada ao cliente.
atendimento.post("/:id/encerrar", async (c) => {
  const b = await c.req.json<{ autor?: string; reabrir?: boolean }>().catch(() => ({}) as Record<string, string>);
  const id = c.req.param("id");
  if (b.reabrir) {
    await c.env.DB.prepare("UPDATE atend_conversas SET encerrado_em=NULL, atualizado_em=datetime('now') WHERE id=?").bind(id).run();
    return c.json({ ok: true, reaberto: true });
  }
  // Encerrar: marca a data E limpa a fixação manual da coluna — senão, se o card já tinha
  // sido movido na mão (ex.: pra "Aguardando atendimento humano"), ele continuaria travado lá.
  await c.env.DB.prepare("UPDATE atend_conversas SET encerrado_em=datetime('now'), coluna_manual=NULL, atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  await addMsg(c.env, id, "out", "sistema", "sistema", `Atendimento encerrado${b.autor ? " por " + String(b.autor).trim() : ""}.`);
  return c.json({ ok: true });
});

// Foto de perfil do contato (Z-API) — pra mostrar o avatar real na conversa.
atendimento.get("/:id/foto-perfil", async (c) => {
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(c.req.param("id")).first<{ telefone: string }>();
  if (!conv) return c.json({ link: null });
  const cfg = await lerConfig(c.env);
  if (cfg.zapi_ativo !== "1") return c.json({ link: null });
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "", token = cfg.zapi_token || "";
  if (!inst || !token) return c.json({ link: null });
  const headers: Record<string, string> = {};
  if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
  try {
    const r = await fetch(`${base}/instances/${inst}/token/${token}/profile-picture?phone=${digitos(conv.telefone)}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return c.json({ link: null });
    const d = await r.json().catch(() => ({})) as { link?: string; imgUrl?: string };
    return c.json({ link: d?.link || d?.imgUrl || null });
  } catch { return c.json({ link: null }); }
});

// Mover um card pra outra coluna (arrastar) — grava a coluna manual.
atendimento.post("/:id/coluna", async (c) => {
  const b = await c.req.json<{ coluna?: string }>().catch(() => ({}) as Record<string, string>);
  const coluna = String(b.coluna ?? "").trim() || null;
  await c.env.DB.prepare("UPDATE atend_conversas SET coluna_manual=?, atualizado_em=datetime('now') WHERE id=?").bind(coluna, c.req.param("id")).run();
  return c.json({ ok: true });
});

// Diagnóstico do webhook (última chamada recebida + estado dos interruptores).
atendimento.get("/webhook-debug", async (c) => {
  const cfg = await lerConfig(c.env);
  let ultimo: unknown = null;
  try { ultimo = JSON.parse(cfg.webhook_ultimo || "null"); } catch { ultimo = cfg.webhook_ultimo || null; }
  return c.json({
    atendimento_ativo: cfg.atendimento_ativo === "1",
    atendimento_ia: cfg.atendimento_ia === "1",
    zapi_ativo: cfg.zapi_ativo === "1",
    equipe_numeros: cfg.equipe_numeros || "",
    ultimo_webhook: ultimo,
  });
});

// ── CAMPANHAS (envio em massa aos poucos) ─────────────────────────────────────────
atendimento.get("/campanhas", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.nome, c.mensagem, c.intervalo_seg, c.status, c.criado_em, c.ultimo_envio_em,
       (SELECT COUNT(*) FROM atend_campanha_alvos a WHERE a.campanha_id=c.id) AS total,
       (SELECT COUNT(*) FROM atend_campanha_alvos a WHERE a.campanha_id=c.id AND a.status='enviado') AS enviados,
       (SELECT COUNT(*) FROM atend_campanha_alvos a WHERE a.campanha_id=c.id AND a.status='pendente') AS pendentes,
       (SELECT COUNT(*) FROM atend_campanha_alvos a WHERE a.campanha_id=c.id AND a.status='falhou') AS falhas
     FROM atend_campanhas c ORDER BY c.criado_em DESC LIMIT 50`
  ).all().catch(() => ({ results: [] as unknown[] }));
  return c.json(results);
});
atendimento.post("/campanhas", async (c) => {
  const b = await c.req.json<{ nome?: string; mensagem?: string; intervalo_seg?: number; alvos?: { telefone: string; nome?: string }[] }>().catch(() => ({}) as Record<string, never>);
  const mensagem = String(b.mensagem ?? "").trim();
  if (!mensagem) return c.json({ error: "mensagem é obrigatória" }, 400);
  const vistos = new Set<string>();
  const alvos = (Array.isArray(b.alvos) ? b.alvos : [])
    .map((a) => ({ telefone: digitos(a.telefone), nome: String(a.nome ?? "").slice(0, 80) }))
    .filter((a) => a.telefone.length >= 10 && !vistos.has(a.telefone.slice(-11)) && (vistos.add(a.telefone.slice(-11)), true));
  if (!alvos.length) return c.json({ error: "escolha pelo menos um contato válido" }, 400);
  const id = uid();
  const intervalo = Math.max(15, Number(b.intervalo_seg) || 40);
  await c.env.DB.prepare("INSERT INTO atend_campanhas (id, nome, mensagem, intervalo_seg, status) VALUES (?, ?, ?, ?, 'ativa')")
    .bind(id, String(b.nome ?? "").slice(0, 80) || null, mensagem, intervalo).run();
  const stmts = alvos.map((a) => c.env.DB.prepare("INSERT INTO atend_campanha_alvos (id, campanha_id, telefone, nome) VALUES (?, ?, ?, ?)").bind(uid(), id, a.telefone, a.nome || null));
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
  return c.json({ ok: true, id, total: alvos.length });
});
atendimento.post("/campanhas/:id/status", async (c) => {
  const b = await c.req.json<{ status?: string }>().catch(() => ({}) as Record<string, string>);
  const st = ["ativa", "pausada", "concluida"].includes(String(b.status)) ? String(b.status) : "";
  if (!st) return c.json({ error: "status inválido" }, 400);
  await c.env.DB.prepare("UPDATE atend_campanhas SET status=? WHERE id=?").bind(st, c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── PROXY DO CATÁLOGO (Firestore → JSON limpo, com cache) ────────────────────────
// Busca o documento catalogo/main no Firestore público do catálogo, decodifica o
// formato tipado e devolve JSON limpo (produtos, preços por região, representantes).
const FIRESTORE_CATALOGO = "https://firestore.googleapis.com/v1/projects/bigtricot-catalogo/databases/(default)/documents/catalogo/main";
// Decodifica um "value" tipado do Firestore para valor JS puro.
function fsVal(v: Record<string, unknown>): unknown {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return ((v.arrayValue as { values?: Record<string, unknown>[] })?.values || []).map(fsVal);
  if ("mapValue" in v) return fsFields((v.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {});
  return null;
}
function fsFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k in fields) o[k] = fsVal(fields[k]);
  return o;
}
let _catCache: { ts: number; data: Record<string, unknown> } | null = null;
async function catalogoExterno(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (_catCache && now - _catCache.ts < 10 * 60 * 1000) return _catCache.data; // cache 10 min
  const resp = await fetch(FIRESTORE_CATALOGO, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error("firestore http " + resp.status);
  const doc = await resp.json<{ fields?: Record<string, Record<string, unknown>> }>();
  const data = fsFields(doc.fields || {});
  _catCache = { ts: now, data };
  return data;
}
atendimento.get("/catalogo-dados", async (c) => {
  try { return c.json({ ok: true, catalogo: await catalogoExterno() }); }
  catch (e) { return c.json({ ok: false, error: String((e as Error).message || e) }, 502); }
});

// ── PONTE CATÁLOGO → FUNIL (pública) ─────────────────────────────────────────────
// O botão de WhatsApp do catálogo aponta pra cá. Registra o contato no funil
// (coluna "📥 Catálogo (contato)") e redireciona pro WhatsApp de destino (loja ou
// representante). Assim o cliente cai no WhatsApp normalmente E fica no funil.
// Parâmetros: ?para=<zap destino> &wa=<zap do cliente> &nome= &uf= &rep= &texto=
const SUFIXO_TEL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''),'.',''),'-',''),'(',''),')',''),' ','')";
atendimento.get("/catalogo-whatsapp", async (c) => {
  const paraDig = digitos(c.req.query("para") || c.req.query("p") || "");
  const waDig = digitos(c.req.query("wa") || c.req.query("cliente") || "");
  const nome = (c.req.query("nome") || c.req.query("loja") || "").toString().trim().slice(0, 120);
  const uf = (c.req.query("uf") || "").toString().trim().toUpperCase().slice(0, 2);
  const rep = (c.req.query("rep") || "").toString().trim().slice(0, 80);
  const texto = (c.req.query("texto") || c.req.query("text") || "").toString().slice(0, 600);

  // Registra o lead no funil se veio o WhatsApp do cliente (idempotente por telefone).
  if (waDig.length >= 10 && !ehClienteInterno(nome)) {
    const core = waDig.slice(-8);
    const jaCard = await c.env.DB.prepare(`SELECT id FROM funil_cards WHERE ${SUFIXO_TEL} LIKE '%'||? LIMIT 1`).bind(core).first<{ id: string }>().catch(() => null);
    if (!jaCard) {
      const cli = await c.env.DB.prepare(
        `SELECT id, representante FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''),'.',''),'-',''),'(',''),')',''),' ','') LIKE '%'||? LIMIT 1`
      ).bind(core).first<{ id: string; representante: string | null }>().catch(() => null);
      const cardId = uid();
      await c.env.DB.prepare(
        "INSERT INTO funil_cards (id, cliente_id, nome, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, 'catalogo-recebido', ?)"
      ).bind(cardId, cli?.id ?? null, nome || "(catálogo)", uf || null, waDig, rep || cli?.representante || null).run();
      await c.env.DB.prepare("INSERT INTO funil_eventos (id, card_id, tipo, texto) VALUES (?, ?, 'etapa', 'Clicou no WhatsApp pelo catálogo')").bind(uid(), cardId).run();
    }
  }
  // Redireciona pro WhatsApp de destino (loja/representante), se informado.
  if (paraDig.length >= 10) {
    const full = paraDig.length <= 11 ? "55" + paraDig : paraDig;
    return c.redirect(`https://wa.me/${full}` + (texto ? `?text=${encodeURIComponent(texto)}` : ""), 302);
  }
  return c.json({ ok: true, registrado: waDig.length >= 10 });
});

// Diagnóstico da IA (botão "Testar IA"): roda o modelo com uma mensagem de teste
// e devolve, por modelo, se respondeu ou o erro exato. Serve pra ver se o Workers AI
// está disponível na conta e qual modelo funciona — sem adivinhação.
atendimento.post("/ia-teste", async (c) => {
  const AI = c.env.AI as unknown as { run: (m: string, o: unknown) => Promise<{ response?: string }> };
  const cfg = await lerConfig(c.env);
  if (!AI?.run) return c.json({ ok: false, ia_ligada: cfg.atendimento_ia === "1", erro: "Binding de IA (env.AI) ausente no Worker.", tentativas: [] });
  const messages = [
    { role: "system", content: sistemaIa(cfg.ia_prompt) + await lerConhecimento(c.env) },
    { role: "user", content: "oi, queria ver as mantas de vocês" },
  ];
  const tentativas: { modelo: string; ok: boolean; resposta?: string; erro?: string }[] = [];
  for (const modelo of IA_MODELOS) {
    try {
      const res = await AI.run(modelo, { messages, max_tokens: 300, temperature: 0.6 });
      const txt = (res?.response || "").trim();
      tentativas.push({ modelo, ok: !!txt, resposta: txt.slice(0, 400) });
      if (txt) break;
    } catch (e) {
      tentativas.push({ modelo, ok: false, erro: String((e as { message?: string })?.message ?? e).slice(0, 240) });
    }
  }
  return c.json({ ok: tentativas.some((t) => t.ok), ia_ligada: cfg.atendimento_ia === "1", tentativas });
});

// Puxa a atividade do catálogo agora (botão "Sincronizar agora").
atendimento.post("/sincronizar-catalogo", async (c) => {
  const n = await lerAtividadeCatalogo(c.env);
  // Backfill: leads de catálogo que já existiam (antes do card no funil) ganham card agora.
  const { results: semCard } = await c.env.DB.prepare(
    "SELECT id FROM atend_conversas WHERE origem='catalogo' AND (card_id IS NULL OR card_id='')"
  ).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }));
  let backfill = 0;
  for (const cv of semCard) {
    const antes = await c.env.DB.prepare("SELECT card_id FROM atend_conversas WHERE id=?").bind(cv.id).first<{ card_id: string | null }>().catch(() => null);
    await garantirCardDaConversa(c.env, cv.id, "Lead do catálogo (histórico)");
    const depois = await c.env.DB.prepare("SELECT card_id FROM atend_conversas WHERE id=?").bind(cv.id).first<{ card_id: string | null }>().catch(() => null);
    if (!antes?.card_id && depois?.card_id) backfill++;
  }
  // Diagnóstico: URL usada, erro de leitura, total de eventos, conversas de catálogo e último ts.
  const cfg = await lerConfig(c.env);
  const logUrl = urlLogAtividade(cfg);
  let logTotal = -1, logErro = "";
  if (!logUrl) {
    logErro = "URL vazia — preencha e clique em SALVAR antes de sincronizar";
  } else {
    try {
      const r = await buscarLogAtividade(c.env, logUrl);
      if (!r.ok) logErro = "HTTP " + r.status;
      else {
        const d = await r.json<{ eventos?: unknown[] }>().catch(() => null);
        if (d && Array.isArray(d.eventos)) logTotal = d.eventos.length;
        else logErro = "resposta sem o campo 'eventos'";
      }
    } catch (e) { logErro = "falha ao buscar: " + String((e as Error).message || e).slice(0, 120); }
  }
  const cat = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM atend_conversas WHERE origem='catalogo'").first<{ n: number }>().catch(() => ({ n: -1 }));
  return c.json({ ok: true, novos: n, backfill, logTotal, logErro, logUrl, catalogoConversas: cat?.n ?? -1, ultimoTs: cfg.catalogo_log_ts || "0" });
});

// Envia uma mensagem de teste pelo número informado (valida credenciais/QR).
atendimento.post("/config/testar", async (c) => {
  const b = await c.req.json<{ telefone?: string }>().catch(() => ({}) as Record<string, string>);
  const tel = digitos(b.telefone);
  if (!tel) return c.json({ error: "informe um telefone (com DDD)" }, 400);
  const r = await enviarWhatsapp(c.env, tel, { tipo: "texto", texto: "✅ Teste de conexão do CRM da Tecelagem. Se você recebeu isto, o WhatsApp está funcionando!" });
  return c.json(r);
});

// Envio real pela Z-API. Se a integração estiver desligada ou sem credenciais,
// vira no-op (o board/histórico e o simulador seguem funcionando normalmente).
// Apaga uma mensagem NOSSA no WhatsApp do cliente (revoga "para todos") via Z-API.
// Só funciona pra mensagens que ENVIAMOS (owner=true) e que têm o id da Z-API (zap_id).
async function apagarWhatsapp(env: Env, tel: string, zapId: string): Promise<{ ok: boolean; motivo?: string }> {
  const cfg = await lerConfig(env);
  if (cfg.zapi_ativo !== "1") return { ok: false, motivo: "desligado" };
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "", token = cfg.zapi_token || "";
  if (!inst || !token || !zapId) return { ok: false, motivo: "sem-dados" };
  const headers: Record<string, string> = {};
  if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
  const q = new URLSearchParams({ messageId: zapId, phone: digitos(tel), owner: "true" });
  try {
    const resp = await fetch(`${base}/instances/${inst}/token/${token}/messages?${q.toString()}`, { method: "DELETE", headers });
    return { ok: resp.ok, motivo: resp.ok ? "" : `http-${resp.status}` };
  } catch {
    return { ok: false, motivo: "erro-rede" };
  }
}

// Deixa os links CLICÁVEIS no WhatsApp: (1) tira asteriscos colados numa URL — o "negrito" em
// cima do link impede o clique; (2) põe https:// em domínio "pelado". Não mexe em e-mail nem em
// links que já estão certos.
export function linksClicaveis(t: string): string {
  if (!t) return t;
  const dom = "(?:[a-z0-9-]+\\.)+(?:com\\.br|gov\\.br|org\\.br|net\\.br|com|net|org|io|app)(?:\\/[^\\s*]*)?";
  t = t.replace(new RegExp("\\*(https?:\\/\\/[^\\s*]+|" + dom + ")\\*", "gi"), "$1");
  t = t.replace(new RegExp("(^|[\\s(\\n])(" + dom + ")", "gi"), (m, pre, url) => (/^https?:\/\//i.test(url) ? m : pre + "https://" + url));
  return t;
}

export async function enviarWhatsapp(env: Env, tel: string, saida: { tipo: string; texto: string }, quote: { zapId?: string | null; texto?: string | null } = {}) {
  const cfg = await lerConfig(env);
  if (cfg.zapi_ativo !== "1") return { enviado: false, motivo: "desligado" };
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "";
  const token = cfg.zapi_token || "";
  if (!inst || !token) return { enviado: false, motivo: "sem-credenciais" };
  const phone = digitos(tel);
  let texto = linksClicaveis(String(saida.texto ?? "").trim());
  if (!phone || !texto) return { enviado: false, motivo: "vazio" };
  // Cliente BLOQUEADO (caloteiro/inadimplente): não envia NADA — nem robô, nem campanha.
  if (await clienteBloqueado(env, phone)) return { enviado: false, motivo: "cliente-bloqueado" };
  // Responder uma mensagem específica: se temos o id da Z-API, cita de forma NATIVA
  // (messageId). Se não (mensagem antiga sem id), cai num fallback citando o trecho.
  const body: Record<string, unknown> = { phone };
  if (quote.zapId) body.messageId = quote.zapId;
  else if (quote.texto) texto = `↪ _"${String(quote.texto).slice(0, 120)}"_\n\n${texto}`;
  // "Digitando…": a Z-API mostra o status de digitação por N segundos antes de enviar.
  // Proporcional ao tamanho do texto (1s + ~1s a cada 50 caracteres), no máx. 5s.
  const delayTyping = Math.min(5, 1 + Math.floor(texto.length / 50));
  body.message = texto; body.delayTyping = delayTyping;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
    const resp = await fetch(`${base}/instances/${inst}/token/${token}/send-text`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    if (!resp.ok) return { enviado: false, motivo: `http-${resp.status}` };
    const dj = await resp.json().catch(() => ({})) as { messageId?: string; id?: string; zaapId?: string };
    return { enviado: true, messageId: dj?.messageId || dj?.id || dj?.zaapId || null };
  } catch (e) {
    return { enviado: false, motivo: "erro-rede", detalhe: String(e) };
  }
}

// Envia um ARQUIVO (imagem ou documento) pela Z-API, a partir de uma URL pública.
// Base64 de um ArrayBuffer (em blocos, pra não estourar o argumento do fromCharCode).
export function abParaBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
export async function enviarMidiaZapi(env: Env, tel: string, opts: { url: string; docData?: string; ehImagem: boolean; ehAudio?: boolean; ext: string; fileName: string; caption?: string }) {
  const cfg = await lerConfig(env);
  if (cfg.zapi_ativo !== "1") return { enviado: false, motivo: "desligado" };
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "", token = cfg.zapi_token || "";
  if (!inst || !token) return { enviado: false, motivo: "sem-credenciais" };
  const phone = digitos(tel);
  if (!phone) return { enviado: false, motivo: "vazio" };
  if (await clienteBloqueado(env, phone)) return { enviado: false, motivo: "cliente-bloqueado" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
  const endpoint = opts.ehAudio ? "send-audio" : opts.ehImagem ? "send-image" : `send-document/${opts.ext || "bin"}`;
  const body = opts.ehAudio
    ? { phone, audio: opts.url }
    : opts.ehImagem
    ? { phone, image: opts.url, caption: opts.caption || "" }
    // Documento: manda EMBUTIDO (base64) quando disponível — não depende da Z-API baixar nossa
    // URL (era o que fazia o PDF não chegar). Cai pra URL só se não tiver o base64.
    : { phone, document: opts.docData || opts.url, fileName: opts.fileName };
  try {
    // Timeout: a Z-API baixa o arquivo da nossa URL e reenvia — se travar, não deixa pendurado.
    const resp = await fetch(`${base}/instances/${inst}/token/${token}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    if (!resp.ok) return { enviado: false, motivo: `http-${resp.status}` };
    const dj = await resp.json().catch(() => ({})) as { messageId?: string; id?: string; zaapId?: string };
    return { enviado: true, messageId: dj?.messageId || dj?.id || dj?.zaapId || null };
  } catch (e) {
    return { enviado: false, motivo: "erro-rede", detalhe: String(e) };
  }
}

// ── TREINO DA BIA (base de conhecimento) — antes de "/:id" pra não ser capturado ──
atendimento.get("/conhecimento", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, pergunta, resposta, ativo, criado_em FROM ia_conhecimento ORDER BY criado_em DESC"
  ).all().catch(() => ({ results: [] }));
  return c.json(results);
});

atendimento.post("/conhecimento", async (c) => {
  const b = await c.req.json<{ id?: string; pergunta?: string; resposta?: string; ativo?: boolean | number }>().catch(() => ({}) as Record<string, never>);
  const pergunta = String(b.pergunta ?? "").trim();
  const resposta = String(b.resposta ?? "").trim();
  if (!pergunta || !resposta) return c.json({ error: "pergunta e resposta são obrigatórias" }, 400);
  const id = b.id || uid();
  const ativo = b.ativo === false || b.ativo === 0 ? 0 : 1;
  await c.env.DB.prepare(
    `INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET pergunta=excluded.pergunta, resposta=excluded.resposta, ativo=excluded.ativo`
  ).bind(id, pergunta, resposta, ativo).run();
  return c.json({ ok: true, id });
});

atendimento.delete("/conhecimento/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM ia_conhecimento WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Abre (ou cria) a conversa de WhatsApp de um card do funil / cliente, pra chamar do funil.
atendimento.post("/abrir-conversa", async (c) => {
  const b = await c.req.json<{ telefone?: string; nome?: string; card_id?: string; cliente_id?: string; criar_card?: boolean; destino?: string }>().catch(() => ({}) as Record<string, never>);
  const tel = digitos(b.telefone);
  let cardId = String(b.card_id ?? "").trim() || null;
  // destino do card: "prospeccao" (novo lead) ou "atendimento" (só conversa). criar_card:true = prospecção (compat).
  const destino = String(b.destino ?? "").trim() || (b.criar_card ? "prospeccao" : "");
  // 1) Já existe conversa vinculada a esse card?
  let conv = cardId ? await c.env.DB.prepare("SELECT id, card_id FROM atend_conversas WHERE card_id=? LIMIT 1").bind(cardId).first<{ id: string; card_id: string | null }>().catch(() => null) : null;
  // 2) Senão, procura pelo telefone (sufixo de 8 dígitos).
  if (!conv && tel.length >= 8) {
    const core = tel.slice(-8);
    conv = await c.env.DB.prepare(
      `SELECT id, card_id FROM atend_conversas WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone,'.',''),'-',''),'(',''),')',''),' ','') LIKE '%' || ? LIMIT 1`
    ).bind(core).first<{ id: string; card_id: string | null }>().catch(() => null);
    if (conv && cardId) await c.env.DB.prepare("UPDATE atend_conversas SET card_id=? WHERE id=? AND (card_id IS NULL OR card_id='')").bind(cardId, conv.id).run();
  }
  if (conv) return c.json({ id: conv.id, card_id: cardId || conv.card_id || null });
  // 3) Não existe → cria uma conversa "manual" já em atendimento humano (pronta pra responder).
  if (!tel) return c.json({ error: "Este cliente não tem WhatsApp no cadastro. Adicione o número em Clientes e tente de novo." });
  const cli = await identificarCliente(c.env, tel);
  const nome = (b.nome || cli?.nome || "").trim();
  // 3b) Garante um card no funil e vincula a conversa: prospecção → "novo-lead"
  //     (com tarefa de 1º contato); atendimento → coluna "atendimento" (só conversa).
  if (!cardId && (destino === "prospeccao" || destino === "atendimento")) {
    const cliId = String(b.cliente_id ?? "").trim() || cli?.id || null;
    let card = cliId ? await c.env.DB.prepare("SELECT id FROM funil_cards WHERE cliente_id=? LIMIT 1").bind(cliId).first<{ id: string }>().catch(() => null) : null;
    if (!card && nome) card = await c.env.DB.prepare("SELECT id FROM funil_cards WHERE nome=? LIMIT 1").bind(nome).first<{ id: string }>().catch(() => null);
    if (card) cardId = card.id;
    else {
      const info = cliId ? await c.env.DB.prepare("SELECT cidade, uf, representante FROM clientes WHERE id=?").bind(cliId).first<{ cidade: string | null; uf: string | null; representante: string | null }>().catch(() => null) : null;
      const etapa = destino === "atendimento" ? "atendimento" : "novo-lead";
      const novo = uid();
      await c.env.DB.prepare(
        "INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(novo, cliId, nome || "(sem nome)", info?.cidade ?? null, info?.uf ?? null, tel, etapa, info?.representante ?? null).run();
      if (destino === "prospeccao") {
        await c.env.DB.prepare(
          "INSERT INTO funil_tarefas (id, card_id, titulo, vence_em, responsavel) VALUES (?, ?, '1º contato (24h)', date('now','+1 day'), ?)"
        ).bind(uid(), novo, info?.representante ?? null).run();
      }
      const logTxt = destino === "atendimento" ? "Conversa iniciada pelo WhatsApp (atendimento)" : "Prospecção iniciada pelo WhatsApp";
      await c.env.DB.prepare("INSERT INTO funil_eventos (id, card_id, tipo, texto) VALUES (?, ?, 'etapa', ?)").bind(uid(), novo, logTxt).run();
      cardId = novo;
    }
  }
  const id = uid();
  await c.env.DB.prepare(
    "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, card_id, cliente_id, nome) VALUES (?, ?, 'atendimento-humano', 'manual', 'lojista', ?, ?, ?)"
  ).bind(id, tel, cardId, cli?.id ?? null, nome || null).run();
  return c.json({ id, card_id: cardId });
});

// ── SETORES do atendimento (cadastro + membros) — antes de "/:id" ─────────────────
atendimento.get("/setores", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, membros, ativo, criado_em FROM atend_setores ORDER BY nome"
  ).all().catch(() => ({ results: [] }));
  return c.json(results);
});

atendimento.post("/setores", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; membros?: string[] | string; ativo?: boolean | number }>().catch(() => ({}) as Record<string, never>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const membros = Array.isArray(b.membros) ? b.membros.map((m) => String(m).trim()).filter(Boolean).join(",") : String(b.membros ?? "").trim();
  const id = b.id || uid();
  const ativo = b.ativo === false || b.ativo === 0 ? 0 : 1;
  await c.env.DB.prepare(
    `INSERT INTO atend_setores (id, nome, membros, ativo) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, membros=excluded.membros, ativo=excluded.ativo`
  ).bind(id, nome, membros || null, ativo).run();
  return c.json({ ok: true, id });
});

atendimento.delete("/setores/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM atend_setores WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── PAINEL DO GESTOR (métricas de atendimento) — antes de "/:id" ──────────────────
// Fuso: "hoje" = dia em Brasília (UTC-3). Espera em minutos desde a última msg do cliente.
atendimento.get("/painel", async (c) => {
  const db = c.env.DB;
  const g = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM atend_conversas WHERE date(criado_em,'-3 hours')=date('now','-3 hours')) AS novas_hoje,
       (SELECT COUNT(*) FROM atend_conversas WHERE estado='atendimento-humano') AS em_humano,
       (SELECT COUNT(*) FROM atend_conversas WHERE estado='atendimento-humano' AND (responsavel IS NULL OR responsavel='')) AS nao_assumidas,
       (SELECT COUNT(*) FROM atend_conversas WHERE estado='catalogo-enviado' AND date(atualizado_em,'-3 hours')=date('now','-3 hours')) AS catalogos_hoje,
       (SELECT COUNT(*) FROM atend_conversas WHERE COALESCE(interessado,0)=1 AND date(atualizado_em,'-3 hours')=date('now','-3 hours')) AS leads_hoje,
       (SELECT COUNT(*) FROM atend_conversas WHERE estado='indicado-parceiro' AND date(atualizado_em,'-3 hours')=date('now','-3 hours')) AS indicados_hoje`
  ).first<Record<string, number>>().catch(() => ({} as Record<string, number>));

  const { results: fila } = await db.prepare(
    `SELECT id, telefone, nome, setor, responsavel, ultima_in_em,
            CAST((julianday('now') - julianday(COALESCE(ultima_in_em, atualizado_em))) * 1440 AS INTEGER) AS espera_min
       FROM atend_conversas WHERE estado='atendimento-humano'
      ORDER BY COALESCE(ultima_in_em, atualizado_em) ASC`
  ).all<{ id: string; telefone: string; nome: string | null; setor: string | null; responsavel: string | null; ultima_in_em: string | null; espera_min: number }>().catch(() => ({ results: [] as never[] }));

  const { results: atendentes } = await db.prepare(
    `SELECT COALESCE(NULLIF(responsavel,''),'(não assumido)') AS atendente, COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(ultima_in_em,'') > COALESCE(ultima_out_em,'') THEN 1 ELSE 0 END) AS aguardando
       FROM atend_conversas WHERE estado='atendimento-humano' GROUP BY atendente ORDER BY total DESC`
  ).all<{ atendente: string; total: number; aguardando: number }>().catch(() => ({ results: [] as never[] }));

  const { results: setores } = await db.prepare(
    `SELECT COALESCE(NULLIF(setor,''),'(sem setor)') AS setor, COUNT(*) AS total
       FROM atend_conversas WHERE date(criado_em,'-3 hours')=date('now','-3 hours') GROUP BY setor ORDER BY total DESC`
  ).all<{ setor: string; total: number }>().catch(() => ({ results: [] as never[] }));

  // Tempo de resposta (hoje): pareia msg do cliente → 1ª resposta humana (autor ≠ bot/sistema/cliente).
  const { results: msgs } = await db.prepare(
    `SELECT conversa_id, direcao, autor, criado_em FROM atend_mensagens
      WHERE date(criado_em,'-3 hours')=date('now','-3 hours') AND tipo='texto'
      ORDER BY conversa_id, criado_em ASC, rowid ASC`
  ).all<{ conversa_id: string; direcao: string; autor: string | null; criado_em: string }>().catch(() => ({ results: [] as never[] }));
  const porAtend: Record<string, { soma: number; n: number }> = {};
  let esperandoCliente: { conversa_id: string; t: number } | null = null;
  let convAtual = "";
  for (const m of msgs) {
    if (m.conversa_id !== convAtual) { convAtual = m.conversa_id; esperandoCliente = null; }
    const autor = String(m.autor ?? "");
    const ehHumano = m.direcao === "out" && autor && !["bot", "sistema"].includes(autor);
    if (m.direcao === "in") { if (!esperandoCliente) esperandoCliente = { conversa_id: m.conversa_id, t: Date.parse(m.criado_em + "Z") }; }
    else if (ehHumano && esperandoCliente) {
      const dt = (Date.parse(m.criado_em + "Z") - esperandoCliente.t) / 60000;
      if (dt >= 0 && dt < 1440) { (porAtend[autor] ??= { soma: 0, n: 0 }); porAtend[autor].soma += dt; porAtend[autor].n++; }
      esperandoCliente = null;
    }
  }
  const tempoResposta = Object.entries(porAtend).map(([atendente, v]) => ({ atendente, media_min: Math.round(v.soma / v.n), respostas: v.n })).sort((a, b) => b.media_min - a.media_min);

  return c.json({ gerais: g, fila, atendentes, setores, tempoResposta });
});

// Coluna do ATENDIMENTO derivada do estado + responsável + últimas mensagens + encerrado.
// É isso que faz os cards se moverem SOZINHOS conforme a conversa anda.
function colunaAtendimento(c: { estado?: string | null; responsavel?: string | null; ultima_in_em?: string | null; ultima_out_em?: string | null; encerrado_em?: string | null; tipo?: string | null }): string {
  const inn = c.ultima_in_em || "", out = c.ultima_out_em || "", enc = c.encerrado_em || "";
  const estado = String(c.estado || "");
  if (estado === "grupo") return "grupos";                            // mensagens de grupo → coluna própria
  // Consumidor final (não é lojista): coluna própria pra não poluir a fila de atendimento de lojista.
  if (String(c.tipo || "") === "consumidor" || estado === "indicado-parceiro" || estado === "aguardando-cidade-parceiro") return "consumidor-final";
  if (enc && inn <= enc) return "finalizado";                         // encerrado e sem msg nova depois
  if (estado === "reclamacao") return "reclamacao";
  if (estado === "aguardando-setor") return "aguardando-setor";
  if (estado === "atendimento-humano") {
    if (String(c.responsavel || "").trim()) return (inn && inn > out) ? "em-atendimento" : "aguardando-cliente";
    return "aguardando-humano";                                        // precisa de humano, ninguém assumiu
  }
  if (["ia-triagem", "triagem-vendas", "triagem-nome", "aguardando-cnpj", "aguardando-cidade-parceiro"].includes(estado)) return "triagem";
  if (estado === "novo") return "triagem";                            // contato novo → cai na triagem automática
  // Estados de funil/venda: no ATENDIMENTO só importam se o cliente está esperando resposta.
  if (inn && inn > out) return "aguardando-humano";
  return "finalizado";
}

// ── BOARD (conversas por coluna) ──────────────────────────────────────────────────
atendimento.get("/", async (c) => {
  // Atendente (gestor≠1) vê só as conversas DELE + as não assumidas (fila). Gestor/admin vê tudo.
  const usuario = String(c.req.query("usuario") ?? "").trim();
  const gestor = c.req.query("gestor") === "1";
  // Quem SÓ entrou no catálogo/prospecção (nunca mandou mensagem) não aparece na Caixa de
  // entrada — só entra no inbox quem realmente escreveu. (O lead segue rastreado no Funil.)
  const cond: string[] = ["(COALESCE(c.origem,'') NOT IN ('catalogo','reativacao','campanha') OR c.ultima_in_em IS NOT NULL)"];
  const binds: string[] = [];
  if (!gestor && usuario) { cond.push("(c.responsavel = ? OR c.responsavel IS NULL OR c.responsavel = '')"); binds.push(usuario); }
  const stmt = c.env.DB.prepare(
    `SELECT c.id, c.telefone, c.nome, c.estado, c.setor, c.cnpj, c.cidade, c.uf, c.lojista, c.cliente_id, c.responsavel, c.atualizado_em, c.ultima_in_em, c.ultima_out_em, c.encerrado_em, c.coluna_manual, c.tipo, c.representante, c.origem, c.contato_nome, c.autorizado, c.interessado,
            (SELECT texto FROM atend_mensagens m WHERE m.conversa_id=c.id AND m.tipo NOT IN ('nota','sistema') ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 1) AS ultima_msg,
            (SELECT etapa FROM funil_cards fc WHERE fc.id = c.card_id) AS funil_etapa
       FROM atend_conversas c WHERE ${cond.join(" AND ")} ORDER BY c.atualizado_em DESC`
  );
  const { results } = await stmt.bind(...binds).all<Record<string, unknown>>();
  const colunas = await lerColunasAtend(c.env);
  const validos = new Set(colunas.map((x) => x.id));
  // Lembretes (cards que pulsam) e SILENCIADOS (não pulsam / sem som) — listas JSON na config.
  const cfgB = await lerConfig(c.env);
  let lembretes = new Set<string>(), mudos = new Set<string>();
  try { const l = JSON.parse(cfgB.atend_lembretes || "[]"); if (Array.isArray(l)) lembretes = new Set(l.map(String)); } catch { lembretes = new Set(); }
  try { const s = JSON.parse(cfgB.atend_silenciados || "[]"); if (Array.isArray(s)) mudos = new Set(s.map(String)); } catch { mudos = new Set(); }
  const agendados = new Map<string, { quando: number; enviado: boolean }>();
  for (const a of lerAgendamentos(cfgB)) if (a && a.conversaId) agendados.set(String(a.conversaId), { quando: Number(a.quando), enviado: !!a.enviado });
  const conversas = results.map((r) => {
    const manual = r.coluna_manual && validos.has(String(r.coluna_manual)) ? String(r.coluna_manual) : null;
    // Card com "Chamar IA" agendado fica na coluna de follow-up: antes de disparar (esperando a
    // hora) e também DEPOIS de disparar, enquanto o cliente não responde. Sai só quando responder.
    const ag = agendados.get(String(r.id));
    // O agendamento MANDA na coluna: mesmo que o card tenha sido arrastado à mão pra outro lugar
    // (coluna_manual), enquanto houver "Chamar IA" ele fica no follow-up. Sai só quando cancelar
    // o agendamento ou o cliente responder (aí volta pra coluna manual/natural).
    return { ...r, coluna: ag ? "contato-followup" : (manual || colunaAtendimento(r)), lembrete: lembretes.has(String(r.id)) ? 1 : 0, silenciado: mudos.has(String(r.id)) ? 1 : 0, agendado_ia: ag ? ag.quando : null, agendado_enviado: ag && ag.enviado ? 1 : 0 };
  });
  return c.json({ colunas, conversas });
});

// Silencia/reativa uma conversa (grupo barulhento, etc.): o card NÃO pisca e não toca som/aviso.
atendimento.post("/:id/silenciar", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ on?: boolean }>().catch(() => ({} as { on?: boolean }));
  const cfg = await lerConfig(c.env);
  let arr: string[] = [];
  try { const s = JSON.parse(cfg.atend_silenciados || "[]"); if (Array.isArray(s)) arr = s.map(String); } catch { arr = []; }
  const set = new Set(arr);
  if (b.on === false) set.delete(id);
  else if (b.on === true) set.add(id);
  else { if (set.has(id)) set.delete(id); else set.add(id); }
  await salvarConfigJson(c.env, "atend_silenciados", [...set]);
  return c.json({ ok: true, silenciado: set.has(id) });
});

// Marca/desmarca um LEMBRETE no card (deixa o card pulsando pra não esquecer de falar com o lead).
atendimento.post("/:id/lembrete", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ on?: boolean }>().catch(() => ({} as { on?: boolean }));
  const cfg = await lerConfig(c.env);
  let arr: string[] = [];
  try { const l = JSON.parse(cfg.atend_lembretes || "[]"); if (Array.isArray(l)) arr = l.map(String); } catch { arr = []; }
  const set = new Set(arr);
  if (b.on === false) set.delete(id);
  else if (b.on === true) set.add(id);
  else { if (set.has(id)) set.delete(id); else set.add(id); }
  await salvarConfigJson(c.env, "atend_lembretes", [...set]);
  return c.json({ ok: true, lembrete: set.has(id) });
});

// ── "Chamar IA": agenda uma saudação automática pra um dia/horário escolhido ──────────
// Guarda uma lista JSON (atend_agendamentos) de { id, conversaId, telefone, quando(ms) }.
// O cron de 5 min (processarAgendamentos) dispara quando chega a hora, com a saudação
// certa pelo período: manhã → "Bom dia", tarde → "Boa tarde", noite → "Boa noite".
type Agendamento = { id: string; conversaId: string; telefone: string; quando: number; criado_em: number; enviado?: boolean };
function lerAgendamentos(cfg: Record<string, string>): Agendamento[] {
  try { const l = JSON.parse(cfg.atend_agendamentos || "[]"); return Array.isArray(l) ? l as Agendamento[] : []; } catch { return []; }
}
atendimento.post("/:id/agendar-ia", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ quando?: number; cancelar?: boolean }>().catch(() => ({} as { quando?: number; cancelar?: boolean }));
  const cfg = await lerConfig(c.env);
  // Só um agendamento por conversa: remove o anterior antes de gravar o novo.
  let arr = lerAgendamentos(cfg).filter((a) => a && a.conversaId !== id);
  if (b.cancelar) { await salvarConfigJson(c.env, "atend_agendamentos", arr); return c.json({ ok: true, agendado: null }); }
  const quando = Number(b.quando || 0);
  if (!quando || !isFinite(quando)) return c.json({ error: "Escolha o dia e o horário." }, 400);
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "Conversa não encontrada." }, 404);
  arr.push({ id: uid(), conversaId: id, telefone: conv.telefone, quando, criado_em: Date.now() });
  await salvarConfigJson(c.env, "atend_agendamentos", arr.slice(-500));
  return c.json({ ok: true, agendado: quando });
});

// ── CONTATOS salvos no WhatsApp (via Z-API) — pra iniciar conversa com alguém ───────
atendimento.get("/contatos-whatsapp", async (c) => {
  const cfg = await lerConfig(c.env);
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "", token = cfg.zapi_token || "";
  if (!inst || !token) return c.json({ contatos: [], erro: "sem-credenciais" });
  const headers: Record<string, string> = {};
  if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
  const map = new Map<string, { nome: string; telefone: string }>();
  try {
    for (let page = 1; page <= 30; page++) {
      const r = await fetch(`${base}/instances/${inst}/token/${token}/contacts?page=${page}&pageSize=200`, { headers, signal: AbortSignal.timeout(12000) });
      if (!r.ok) break;
      const data = await r.json() as unknown;
      const arr: Array<Record<string, unknown>> = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
      if (!arr.length) break;
      for (const ct of arr) {
        const tel = digitos(ct.phone ?? ct.id ?? "");
        if (tel.length < 10 || tel.length > 15) continue;                 // pula grupos/inválidos
        const nome = String(ct.name ?? ct.short ?? ct.notify ?? ct.vname ?? "").trim().slice(0, 80) || ("+" + tel);
        if (!map.has(tel)) map.set(tel, { nome, telefone: tel });
      }
      if (arr.length < 200) break;
    }
  } catch { /* devolve o que já tiver */ }
  const contatos = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return c.json({ contatos });
});

// ── INICIAR uma conversa (o atendente manda a 1ª mensagem) ─────────────────────────
atendimento.post("/nova-conversa", async (c) => {
  const b = await c.req.json<{ telefone?: string; texto?: string; nome?: string; responsavel?: string }>().catch(() => ({}) as Record<string, string>);
  const tel = digitos(b.telefone);
  const texto = String(b.texto ?? "").trim();
  if (tel.length < 10) return c.json({ error: "número inválido" }, 400);
  if (!texto) return c.json({ error: "escreva uma mensagem" }, 400);
  const resp = (b.responsavel || "").trim() || "Atendente";
  const nomeManual = String(b.nome ?? "").trim().slice(0, 80) || null;
  const conv = await acharConversaPorTelefone(c.env, tel);
  let convId: string;
  if (conv) {
    convId = conv.id;
    await c.env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', responsavel=?, atualizado_em=datetime('now') WHERE id=?").bind(resp, convId).run();
  } else {
    convId = uid();
    const cliente = await identificarCliente(c.env, tel);
    await c.env.DB.prepare(
      "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, cliente_id, nome, contato_nome, responsavel, ultima_out_em, atualizado_em) VALUES (?, ?, 'atendimento-humano', 'manual', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind(convId, tel, cliente ? "lojista" : null, cliente?.id ?? null, cliente?.nome ?? nomeManual, nomeManual, resp).run();
  }
  await addMsg(c.env, convId, "out", resp, "texto", texto);
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(convId).run();
  await enviarWhatsapp(c.env, tel, { tipo: "texto", texto });
  return c.json({ ok: true, conversa_id: convId });
});

// ── ANEXAR e ENVIAR um arquivo (imagem/documento) pro cliente ─────────────────────
atendimento.post("/:id/enviar-arquivo", async (c) => {
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") return c.json({ error: "arquivo é obrigatório" }, 400);
  const file = entry as Blob & { name?: string };
  if (file.size === 0) return c.json({ error: "arquivo é obrigatório" }, 400);
  if (file.size > 40 * 1024 * 1024) return c.json({ error: "arquivo muito grande (máx. 40MB)" }, 400);
  const autor = String(form?.get("autor") || "Atendente").trim() || "Atendente";
  const legenda = String(form?.get("legenda") || "").trim();
  const nomeArq = (file.name || "arquivo").slice(0, 120);
  const ext = (nomeArq.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const ct = file.type || "application/octet-stream";
  const ehImagem = ct.startsWith("image/");
  const ehAudio = ct.startsWith("audio/");
  const nome = `${uid()}.${ext}`;
  // Salva no R2 bufferizando (length conhecido) — mais confiável que um stream sem tamanho.
  // Blindado: se falhar, devolve um ERRO CLARO (nada de 500 solto que vira "não consegui enviar").
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
    await c.env.BUCKET.put(`atend/${nome}`, bytes, { httpMetadata: { contentType: ct } });
  } catch (e) {
    return c.json({ error: "não consegui salvar o arquivo (" + String((e as Error)?.message || e).slice(0, 120) + ")" }, 500);
  }
  const url = `${new URL(c.req.url).origin}/api/atendimento/arquivo/${nome}`;
  const msgId = await addMsg(c.env, id, "out", autor, "arquivo", legenda || nomeArq, { arquivoUrl: url });
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  // Documento (PDF, etc.): arquivos PEQUENOS vão EMBUTIDOS (base64), o que é mais confiável.
  // Arquivos MAIORES (>8MB) vão por URL (a Z-API baixa do nosso R2) — base64 grande demais
  // estoura o corpo da requisição. Imagem/áudio seguem por URL (já funcionam).
  let docData: string | undefined;
  try { if (!ehImagem && !ehAudio && bytes.byteLength <= 8 * 1024 * 1024) docData = `data:${ct};base64,${abParaBase64(bytes)}`; } catch { docData = undefined; }
  // Envia pro Z-API em BACKGROUND: a resposta volta NA HORA (o arquivo já está na conversa), sem
  // deixar o botão "Enviando…" travado.
  const enviarBg = (async () => {
    const r = await enviarMidiaZapi(c.env, conv.telefone, { url, docData, ehImagem, ehAudio, ext, fileName: nomeArq, caption: legenda });
    if (r.enviado && r.messageId) await c.env.DB.prepare("UPDATE atend_mensagens SET zap_id=?, status='sent' WHERE id=?").bind(r.messageId, msgId).run();
  })().catch(() => { /* falha no envio não derruba a resposta; o arquivo já está na conversa */ });
  try { c.executionCtx.waitUntil(enviarBg); } catch { /* sem executionCtx: segue sem bloquear */ }
  return c.json({ ok: true, enviado: true, url });
});

// Serve o arquivo anexado (do R2). A Z-API também busca por esta URL pública.
// Tipo de conteúdo por extensão do arquivo — garante que PDF/imagem/áudio sejam servidos com o
// Content-Type certo (senão o navegador não desenha a PRÉVIA do PDF e nem toca o áudio inline).
const CT_POR_EXT: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm", aac: "audio/aac", amr: "audio/amr",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
atendimento.get("/arquivo/:nome", async (c) => {
  const nome = c.req.param("nome");
  const obj = await c.env.BUCKET.get(`atend/${nome}`);
  if (!obj) return c.json({ error: "arquivo não encontrado" }, 404);
  const ext = (nome.split(".").pop() || "").toLowerCase();
  const ct = CT_POR_EXT[ext] || obj.httpMetadata?.contentType || "application/octet-stream";
  // Accept-Ranges ajuda o visualizador de PDF do Chrome a renderizar a prévia.
  return new Response(obj.body, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes" } });
});

// ── ARQUIVOS RÁPIDOS: catálogos/PDFs salvos pra mandar com 1 clique ─────────────────
interface ArqRapido { id: string; nome: string; nomeArq: string; key: string; ct: string; tamanho: number }
async function lerArquivosRapidos(env: Env): Promise<ArqRapido[]> {
  const cfg = await lerConfig(env);
  try { const a = JSON.parse(cfg.atend_arquivos_rapidos || "[]"); return Array.isArray(a) ? a as ArqRapido[] : []; } catch { return []; }
}
atendimento.get("/arquivos-rapidos", async (c) => c.json({ arquivos: await lerArquivosRapidos(c.env) }));
atendimento.post("/arquivos-rapidos", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") return c.json({ error: "arquivo é obrigatório" }, 400);
  const file = entry as Blob & { name?: string };
  if (file.size === 0) return c.json({ error: "arquivo vazio" }, 400);
  if (file.size > 40 * 1024 * 1024) return c.json({ error: "arquivo muito grande (máx. 40MB)" }, 400);
  const nomeFile = (file.name || "arquivo").slice(0, 120);
  const nome = (String(form?.get("nome") || "").trim() || nomeFile).slice(0, 80);
  const ext = (nomeFile.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const ct = file.type || CT_POR_EXT[ext] || "application/octet-stream";
  const key = `${uid()}.${ext}`;
  await c.env.BUCKET.put(`atend/${key}`, await file.arrayBuffer(), { httpMetadata: { contentType: ct } });
  const arr = await lerArquivosRapidos(c.env);
  arr.unshift({ id: uid(), nome, nomeArq: nomeFile, key, ct, tamanho: file.size });
  await salvarConfigJson(c.env, "atend_arquivos_rapidos", arr.slice(0, 100));
  return c.json({ ok: true, arquivos: arr });
});
atendimento.delete("/arquivos-rapidos/:aid", async (c) => {
  const aid = c.req.param("aid");
  const arr = await lerArquivosRapidos(c.env);
  const alvo = arr.find((x) => x.id === aid);
  if (alvo?.key) await c.env.BUCKET.delete(`atend/${alvo.key}`).catch(() => {});
  const novo = arr.filter((x) => x.id !== aid);
  await salvarConfigJson(c.env, "atend_arquivos_rapidos", novo);
  return c.json({ ok: true, arquivos: novo });
});
atendimento.post("/:id/enviar-rapido", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ aid?: string; autor?: string }>().catch(() => ({} as { aid?: string; autor?: string }));
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const alvo = (await lerArquivosRapidos(c.env)).find((x) => x.id === b.aid);
  if (!alvo) return c.json({ error: "arquivo não encontrado" }, 404);
  const autor = (b.autor || "Atendente").trim();
  const ext = (alvo.key.split(".").pop() || "bin").toLowerCase();
  const ehImagem = alvo.ct.startsWith("image/"), ehAudio = alvo.ct.startsWith("audio/");
  const url = `${new URL(c.req.url).origin}/api/atendimento/arquivo/${alvo.key}`;
  const msgId = await addMsg(c.env, id, "out", autor, "arquivo", alvo.nomeArq || alvo.nome, { arquivoUrl: url });
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  let docData: string | undefined;
  if (!ehImagem && !ehAudio) {
    try { const obj = await c.env.BUCKET.get(`atend/${alvo.key}`); if (obj) { const bytes = await obj.arrayBuffer(); if (bytes.byteLength <= 8 * 1024 * 1024) docData = `data:${alvo.ct};base64,${abParaBase64(bytes)}`; } } catch { docData = undefined; }
  }
  const enviarBg = (async () => {
    const r = await enviarMidiaZapi(c.env, conv.telefone, { url, docData, ehImagem, ehAudio, ext, fileName: alvo.nomeArq || alvo.nome, caption: "" });
    if (r.enviado && r.messageId) await c.env.DB.prepare("UPDATE atend_mensagens SET zap_id=?, status='sent' WHERE id=?").bind(r.messageId, msgId).run();
  })().catch(() => { /* falha não derruba a resposta */ });
  try { c.executionCtx.waitUntil(enviarBg); } catch { /* ok */ }
  return c.json({ ok: true });
});

// ── ENVIAR o link do catálogo numa conversa (botão do atendente) ───────────────────
atendimento.post("/:id/enviar-catalogo", async (c) => {
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT id, telefone, uf FROM atend_conversas WHERE id=?").bind(id).first<{ id: string; telefone: string; uf: string | null }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const cfgAt = await lerConfig(c.env);
  const origin = new URL(c.req.url).origin;
  for (const s of montarCatalogo(deps(c.env, { url: cfgAt.catalogo_url, senha: cfgAt.catalogo_senha, msg: cfgAt.catalogo_msg }))) {
    s.texto = ajustarCatalogoRegiao(s.texto, conv.uf, conv.telefone);
    await addMsg(c.env, id, "out", "bot", s.tipo, s.texto);
    await enviarWhatsapp(c.env, conv.telefone, s);
  }
  await garantirCardDaConversa(c.env, id, "Catálogo enviado pelo atendente", "catalogo-recebido");
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// ── DETALHE (conversa + histórico) ─────────────────────────────────────────────────
atendimento.get("/:id", async (c) => {
  const conv = await c.env.DB.prepare("SELECT * FROM atend_conversas WHERE id = ?").bind(c.req.param("id")).first<ConvRow>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  // Só as ÚLTIMAS 250 mensagens: conversas antigas (ou floods) podem ter centenas
  // de mensagens e travar a tela ("página sem resposta") em PC mais fraco.
  const { results: msgsDesc } = await c.env.DB.prepare(
    "SELECT id, direcao, autor, tipo, texto, responder_texto, arquivo_url, status, criado_em FROM atend_mensagens WHERE conversa_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 250"
  ).bind(conv.id).all();
  const mensagens = (msgsDesc as unknown[]).slice().reverse();
  const { results: interesses } = await c.env.DB.prepare(
    "SELECT termo FROM atend_interesses WHERE conversa_id = ? ORDER BY criado_em"
  ).bind(conv.id).all<{ termo: string }>();

  // Resumo de pedidos do cliente (quando a conversa está vinculada à base).
  let pedidos_resumo: { nome: string; qtd: number; total: number; ultima: string | null } | null = null;
  if (conv.cliente_id) {
    const cli = await c.env.DB.prepare("SELECT nome FROM clientes WHERE id = ?").bind(conv.cliente_id).first<{ nome: string }>();
    if (cli) {
      const r = await c.env.DB.prepare(
        `SELECT COUNT(DISTINCT p.id) AS qtd, COALESCE(SUM(i.qtd * i.valor_unit), 0) AS total, MAX(p.data_pedido) AS ultima
           FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
          WHERE p.cliente_nome = ? AND COALESCE(p.reposicao,0)=0`
      ).bind(cli.nome).first<{ qtd: number; total: number; ultima: string | null }>();
      pedidos_resumo = { nome: cli.nome, qtd: r?.qtd || 0, total: Number(r?.total) || 0, ultima: r?.ultima || null };
    }
  }
  // Cliente bloqueado? (por telefone) — pra avisar o atendente que nada será enviado.
  const core = digitos(conv.telefone).replace(/^55/, "").slice(-8);
  let bloqueado = 0;
  if (core.length >= 8) {
    const bq = await c.env.DB.prepare(`SELECT 1 FROM clientes WHERE COALESCE(bloqueado,0)=1 AND ${LIMPA_WPP} LIKE '%' || ? LIMIT 1`).bind(core).first().catch(() => null);
    bloqueado = bq ? 1 : 0;
  }
  const colManual = conv.coluna_manual && ATEND_COLUNAS.some((x) => x.id === conv.coluna_manual) ? conv.coluna_manual : null;
  // Lembrete (pulsa) e silenciado (não pulsa/sem som) — listas JSON de config.
  let lembrete = 0, silenciado = 0, agendado_ia: number | null = null, agendado_enviado = 0;
  try { const cfgL = await lerConfig(c.env); const l = JSON.parse(cfgL.atend_lembretes || "[]"); if (Array.isArray(l) && l.map(String).includes(String(conv.id))) lembrete = 1; const s = JSON.parse(cfgL.atend_silenciados || "[]"); if (Array.isArray(s) && s.map(String).includes(String(conv.id))) silenciado = 1; const ag = lerAgendamentos(cfgL).find((a) => a && a.conversaId === conv.id); if (ag) { agendado_ia = Number(ag.quando); agendado_enviado = ag.enviado ? 1 : 0; } } catch { /* ok */ }
  return c.json({ ...conv, coluna: agendado_ia ? "contato-followup" : (colManual || colunaAtendimento(conv)), mensagens, interesses: interesses.map((i) => i.termo), pedidos_resumo, bloqueado, lembrete, silenciado, agendado_ia, agendado_enviado });
});

// ── Atendente humano assume ─────────────────────────────────────────────────────────
atendimento.post("/:id/assumir", async (c) => {
  const b = await c.req.json<{ responsavel?: string }>().catch(() => ({}) as Record<string, string>);
  const resp = (b.responsavel || "").trim() || "Atendente";
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', responsavel=?, atualizado_em=datetime('now') WHERE id=?").bind(resp, id).run();
  // Registro INTERNO (só a equipe vê) de quem assumiu. NÃO manda nada pro cliente.
  await addMsg(c.env, id, "out", "sistema", "sistema", `${resp} assumiu o atendimento.`);
  return c.json({ ok: true });
});

// ── Devolver a conversa pra IA (a Big volta a responder automaticamente) ──────────────
// Inverso do "assumir": tira o responsável humano, volta o estado pra 'ia-triagem' e solta
// a coluna manual — assim a Big responde a PRÓXIMA mensagem do cliente por conta própria.
// (Precisa da IA de atendimento LIGADA em Configurações; senão ninguém responde.)
atendimento.post("/:id/ia-assumir", async (c) => {
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT id, telefone FROM atend_conversas WHERE id=?").bind(id).first<{ id: string; telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const cfg = await lerConfig(c.env);
  await c.env.DB.prepare("UPDATE atend_conversas SET estado='ia-triagem', responsavel=NULL, coluna_manual=NULL, encerrado_em=NULL, atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  await addMsg(c.env, id, "out", "sistema", "sistema", "🤖 A Big (IA) voltou a assumir este atendimento.");
  const iaLigada = cfg.atendimento_ia === "1";
  // Se a última mensagem for uma PERGUNTA do cliente ainda sem resposta, a Big já responde
  // agora (assume E responde) — reprocessa essa mensagem pela mesma pipeline, sem duplicá-la.
  let respondeu = false;
  if (iaLigada) {
    const ultima = await c.env.DB.prepare(
      "SELECT direcao, texto FROM atend_mensagens WHERE conversa_id=? AND tipo NOT IN ('sistema','nota') ORDER BY criado_em DESC, rowid DESC LIMIT 1"
    ).bind(id).first<{ direcao: string; texto: string | null }>();
    if (ultima && ultima.direcao === "in" && (ultima.texto || "").trim()) {
      try {
        const r = await receberMensagem(c.env, conv.telefone, ultima.texto, "whatsapp", "", new URL(c.req.url).origin, "", "", false, true);
        respondeu = !!(r && "respostas" in r && Array.isArray(r.respostas) && r.respostas.length);
      } catch { /* se falhar, a IA ainda responde na próxima mensagem do cliente */ }
    }
  }
  return c.json({ ok: true, ia_ligada: iaLigada, respondeu });
});

// ── Sugestão de resposta por IA (o vendedor edita antes de enviar) ────────────────
atendimento.post("/:id/sugerir", async (c) => {
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT nome FROM atend_conversas WHERE id=?").bind(id).first<{ nome: string | null }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const { results } = await c.env.DB.prepare(
    "SELECT direcao, texto FROM atend_mensagens WHERE conversa_id=? AND tipo NOT IN ('sistema','nota') ORDER BY criado_em DESC, rowid DESC LIMIT 12"
  ).bind(id).all<{ direcao: string; texto: string | null }>();
  const hist = results.reverse().map((m) => `${m.direcao === "in" ? "Cliente" : "Atendente"}: ${m.texto || ""}`).join("\n");
  if (!c.env.AI?.run) return c.json({ error: "IA indisponível no momento" }, 503);
  const sys = "Você é vendedor(a) da Big Tricot, atacado de tricô para o lar (mantas, capas, almofadas), atendendo LOJISTAS pelo WhatsApp. Sugira a PRÓXIMA resposta do atendente: curta (até 2 frases), calorosa e natural em português do Brasil, no máximo 1 emoji. NUNCA invente preços, prazos ou promoções. Responda apenas com a mensagem sugerida, sem aspas.";
  const usr = `Conversa até agora:\n${hist || "(sem histórico)"}\n\nEscreva a próxima resposta do atendente${conv.nome ? ` para ${conv.nome}` : ""}.`;
  const messages = [{ role: "system", content: sys }, { role: "user", content: usr }];
  // Mesma cascata de modelos do robô: se o primeiro estiver fora do ar, tenta o próximo.
  for (const modelo of IA_MODELOS) {
    try {
      const r = (await c.env.AI.run(modelo, { messages, max_tokens: 160, temperature: 0.6 })) as { response?: string };
      const sug = (r?.response || "").trim().replace(/^["']+|["']+$/g, "");
      if (sug) return c.json({ sugestao: sug });
    } catch { /* tenta o próximo modelo */ }
  }
  return c.json({ error: "não consegui sugerir agora" }, 503);
});

// ── Preencher/corrigir os "Dados coletados" à mão (quando a IA não pegou) ──────────
atendimento.post("/:id/dados", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ contato_nome?: string; nome?: string; setor?: string; cnpj?: string; cidade?: string; uf?: string; lojista?: unknown }>().catch(() => ({} as { contato_nome?: string; nome?: string; setor?: string; cnpj?: string; cidade?: string; uf?: string; lojista?: unknown }));
  const campos: string[] = [];
  const vals: (string | number | null)[] = [];
  const setTxt = (col: string, v: unknown) => { if (v !== undefined) { campos.push(`${col}=?`); const s = String(v ?? "").trim(); vals.push(s || null); } };
  setTxt("contato_nome", b.contato_nome);
  setTxt("nome", b.nome);
  setTxt("cnpj", b.cnpj);
  setTxt("cidade", b.cidade);
  if (b.uf !== undefined) { campos.push("uf=?"); vals.push(b.uf ? String(b.uf).trim().toUpperCase().slice(0, 2) : null); }
  if (b.setor !== undefined) { campos.push("setor=?"); vals.push(setorDe(b.setor) || null); }
  if (b.lojista !== undefined) { campos.push("lojista=?"); vals.push(b.lojista === "" || b.lojista == null ? null : (b.lojista === "1" || b.lojista === 1 || b.lojista === true ? 1 : 0)); }
  if (!campos.length) return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE atend_conversas SET ${campos.join(", ")}, atualizado_em=datetime('now') WHERE id=?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ── Nota interna (chat da equipe DENTRO da conversa) — NÃO vai pro cliente ─────────
// ── Excluir mensagem: "para mim" (só some do CRM) ou "para todos" (apaga no WhatsApp) ──
atendimento.post("/:id/mensagem/:msgId/excluir", async (c) => {
  const id = c.req.param("id"), msgId = c.req.param("msgId");
  const b = await c.req.json<{ paraTodos?: boolean }>().catch(() => ({}) as { paraTodos?: boolean });
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const m = await c.env.DB.prepare("SELECT id, direcao, zap_id FROM atend_mensagens WHERE id=? AND conversa_id=?").bind(msgId, id).first<{ id: string; direcao: string; zap_id: string | null }>();
  if (!m) return c.json({ error: "mensagem não encontrada" }, 404);
  if (!b.paraTodos) {
    // Excluir só do CRM: remove a linha (o cliente continua com a mensagem no WhatsApp dele).
    await c.env.DB.prepare("DELETE FROM atend_mensagens WHERE id=?").bind(msgId).run();
    return c.json({ ok: true, paraTodos: false, revogada: false });
  }
  // Para todos: só dá pra apagar no WhatsApp uma mensagem que NÓS enviamos (e que tem id da Z-API).
  if (m.direcao !== "out") return c.json({ error: "só dá pra apagar 'para todos' as mensagens que a gente enviou" }, 400);
  const r = await apagarWhatsapp(c.env, conv.telefone, m.zap_id || "");
  // Marca como apagada no CRM (mantém o registro pra equipe ver que foi revogada).
  await c.env.DB.prepare("UPDATE atend_mensagens SET tipo='sistema', texto='🚫 Mensagem apagada', arquivo_url=NULL WHERE id=?").bind(msgId).run();
  return c.json({ ok: true, paraTodos: true, revogada: r.ok, motivo: r.ok ? "" : (r.motivo || "") });
});

atendimento.post("/:id/nota", async (c) => {
  const b = await c.req.json<{ texto?: string; autor?: string }>().catch(() => ({}) as Record<string, string>);
  const texto = (b.texto || "").trim();
  if (!texto) return c.json({ error: "texto é obrigatório" }, 400);
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT id FROM atend_conversas WHERE id=?").bind(id).first<{ id: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  // tipo "nota": aparece na conversa só pra equipe; NÃO chama enviarWhatsapp.
  await addMsg(c.env, id, "out", (b.autor || "Equipe").trim(), "nota", texto);
  await c.env.DB.prepare("UPDATE atend_conversas SET atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// ── Opt-out: não enviar mensagens automáticas para este cliente ───────────────────
atendimento.post("/:id/nao-perturbe", async (c) => {
  const b = await c.req.json<{ nao_perturbe?: boolean }>().catch(() => ({}) as Record<string, boolean>);
  await c.env.DB.prepare("UPDATE atend_conversas SET nao_perturbe=?, atualizado_em=datetime('now') WHERE id=?")
    .bind(b.nao_perturbe ? 1 : 0, c.req.param("id")).run();
  return c.json({ ok: true, nao_perturbe: !!b.nao_perturbe });
});

// ── Autorizar encaminhamento ao representante (aprovação da equipe) ────────────────
// Nada vai pro cliente/representante automaticamente — só depois de alguém autorizar.
atendimento.post("/:id/autorizar", async (c) => {
  const b = await c.req.json<{ representante?: string }>().catch(() => ({}) as Record<string, string>);
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT telefone, representante FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string; representante: string | null }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const rep = (b.representante || conv.representante || "").trim();
  if (!rep) return c.json({ error: "informe o representante" }, 400);
  await c.env.DB.prepare(
    "UPDATE atend_conversas SET representante=?, responsavel=?, autorizado=1, estado='atendimento-humano', atualizado_em=datetime('now') WHERE id=?"
  ).bind(rep, rep, id).run();
  await addMsg(c.env, id, "out", "sistema", "sistema", `Encaminhamento para ${rep} autorizado.`);
  const aviso = `👤 *${rep}* vai cuidar do seu atendimento a partir de agora. 😊`;
  await addMsg(c.env, id, "out", rep, "texto", aviso);
  await enviarWhatsapp(c.env, conv.telefone, { tipo: "texto", texto: aviso });
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(id).run();
  return c.json({ ok: true, representante: rep });
});

// ── Atendente envia mensagem manual ──────────────────────────────────────────────────
atendimento.post("/:id/enviar", async (c) => {
  const b = await c.req.json<{ texto?: string; autor?: string; responder_a?: string }>().catch(() => ({}) as Record<string, string>);
  const texto = (b.texto || "").trim();
  if (!texto) return c.json({ error: "texto é obrigatório" }, 400);
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  // Responder uma mensagem marcada: busca a original (dela vem o trecho citado e o id da Z-API).
  let quote: { zapId?: string | null; texto?: string | null } = {};
  if (b.responder_a) {
    const alvo = await c.env.DB.prepare("SELECT texto, zap_id FROM atend_mensagens WHERE id=? AND conversa_id=?").bind(b.responder_a, id).first<{ texto: string | null; zap_id: string | null }>();
    if (alvo) quote = { zapId: alvo.zap_id, texto: (alvo.texto || "").slice(0, 180) };
  }
  const autor = (b.autor || "Atendente").trim();
  const msgId = await addMsg(c.env, id, "out", autor, "texto", texto, { responderTexto: quote.texto || null });
  await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(id).run();
  // O CLIENTE vê o NOME de quem está atendendo na frente da mensagem — assim a conversa fica
  // identificada e passa pelo sistema (não pelo WhatsApp pessoal do vendedor). No CRM a mensagem
  // fica limpa (o nome já aparece do lado); o prefixo vai só pro WhatsApp do cliente.
  const primeiro = autor.split(/\s+/)[0] || autor;
  const textoWpp = autor && autor.toLowerCase() !== "atendente" ? `*${primeiro}:*\n${texto}` : texto;
  const r = await enviarWhatsapp(c.env, conv.telefone, { tipo: "texto", texto: textoWpp }, quote);
  // Guarda o id da Z-API pra casar com os callbacks de status (✓ enviado / ✓✓ lido).
  if (r.enviado && r.messageId) await c.env.DB.prepare("UPDATE atend_mensagens SET zap_id=?, status='sent' WHERE id=?").bind(r.messageId, msgId).run();
  return c.json({ ok: true });
});

// ── FOLLOW-UP 24h (chamado pelo cron) ────────────────────────────────────────────────
// Conversas com catálogo enviado há +24h sem resposta do cliente → mensagem de
// retomada e move para a coluna Follow-up 24h.
// ── Sincroniza o status do pedido com a conversa (chamado pelo cron) ──────────────
// Detecta o marco do pedido mais recente do cliente (realizado → faturado → enviado)
// e, quando avança, move a conversa e avisa o cliente. Não repete marco já avisado e
// NÃO dispara em massa por pedidos antigos (baseline silencioso no 1º vínculo).
const MARCO_ORDEM: Record<string, number> = { realizado: 1, faturado: 2, enviado: 3, "pos-venda": 4, recompra: 5 };

// Horário comercial (Brasil UTC-3): sem madrugada, sem domingo (salvo config).
// Fora do horário de ATENDIMENTO (padrão 7h–17h, Brasil; domingo fechado). Configurável em
// atend_hora_ini / atend_hora_fim / atend_domingo.
async function foraDoHorarioAtend(env: Env, cfg: Record<string, string>): Promise<boolean> {
  const t = await env.DB.prepare("SELECT strftime('%w','now','-3 hours') AS dow, CAST(strftime('%H','now','-3 hours') AS INTEGER) AS h").first<{ dow: string; h: number }>();
  const dow = Number(t?.dow ?? "1"), hora = Number(t?.h ?? 12);
  const hIni = parseInt(cfg.atend_hora_ini || "7", 10);
  const hFim = parseInt(cfg.atend_hora_fim || "17", 10);
  if (dow === 0 && (cfg.atend_domingo ?? "0") !== "1") return true; // domingo fechado
  return !(hora >= hIni && hora < hFim);
}
function avisoHorarioTxt(cfg: Record<string, string>): string {
  const ini = parseInt(cfg.atend_hora_ini || "7", 10);
  const fim = parseInt(cfg.atend_hora_fim || "17", 10);
  return `\n\n⏰ *Nosso horário de atendimento é das ${ini}h às ${fim}h.* Assim que a gente abrir, um vendedor já te responde por aqui, tá? 💛`;
}
async function horarioComercialOk(env: Env, cfg: Record<string, string>): Promise<boolean> {
  const t = await env.DB.prepare(
    "SELECT strftime('%w','now','-3 hours') AS dow, CAST(strftime('%H','now','-3 hours') AS INTEGER) AS h"
  ).first<{ dow: string; h: number }>();
  const dow = Number(t?.dow ?? "1"), hora = Number(t?.h ?? 12);
  const hIni = parseInt(cfg.followup_hora_ini || "8", 10);
  const hFim = parseInt(cfg.followup_hora_fim || "18", 10);
  if (dow === 0 && (cfg.followup_domingo ?? "0") !== "1") return false;
  return hora >= hIni && hora < hFim;
}

// ── AGENDAMENTOS "Chamar IA" (chamado pelo cron de 5 min) ─────────────────────────────
// Dispara as saudações agendadas cujo horário já chegou. A saudação sai conforme o período
// escolhido pelo atendente (Brasil, UTC-3): manhã → Bom dia, tarde → Boa tarde, noite → Boa noite.
export async function processarAgendamentos(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  const arr = lerAgendamentos(cfg);
  if (!arr.length) return 0;
  const agora = Date.now();
  // Vence só o que ainda NÃO foi enviado (o já-enviado fica na lista pra o card seguir no follow-up).
  const venceu = (a: Agendamento) => a && a.telefone && !a.enviado && Number(a.quando) <= agora;
  const vencidos = arr.filter(venceu);
  if (!vencidos.length) return 0;
  // Marca como ENVIADO antes de disparar (evita reenvio se travar/reprocessar) e MANTÉM na lista:
  // assim, se o cliente não responder, o card continua na coluna de follow-up. Ele só sai quando
  // o cliente escreve (receberMensagem apaga o agendamento) — aí vai pra "Aguardando humano".
  const idsVencidos = new Set(vencidos.map((a) => a.id));
  await salvarConfigJson(env, "atend_agendamentos", arr.map((a) => idsVencidos.has(a.id) ? { ...a, enviado: true } : a));
  let enviados = 0;
  for (const a of vencidos) {
    try {
      const conv = await env.DB.prepare("SELECT id, telefone, nome, contato_nome FROM atend_conversas WHERE id=?")
        .bind(a.conversaId).first<{ id: string; telefone: string; nome: string | null; contato_nome: string | null }>();
      const tel = conv?.telefone || a.telefone;
      const nome = String(conv?.contato_nome || conv?.nome || "").trim().split(/\s+/)[0] || "";
      // Período pela HORA AGENDADA (Brasil = UTC-3), não pela hora do disparo.
      const horaBr = new Date(Number(a.quando) - 3 * 3600 * 1000).getUTCHours();
      const saud = horaBr >= 5 && horaBr < 12 ? "Bom dia" : horaBr >= 12 && horaBr < 18 ? "Boa tarde" : "Boa noite";
      const texto = `Olá${nome ? `, ${nome}` : ""}! ${saud}, tudo bem? 😊`;
      if (conv) {
        await enviarBot(env, conv.id, tel, { tipo: "texto", texto }, "bot");
        await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
      } else {
        const r = await enviarWhatsapp(env, tel, { tipo: "texto", texto });
        await registrarEnvioNaConversa(env, tel, texto, r.messageId ?? null, "IA");
      }
      enviados++;
    } catch { /* erro pontual num envio — segue os demais */ }
  }
  return enviados;
}

function textoMarco(marco: string, nome: string | null): { estado: string; texto: string } {
  const oi = `Oi${nome ? `, *${nome}*` : ""}!`;
  if (marco === "faturado") return { estado: "pedido-faturado", texto: `${oi} Seu pedido da *Big Tricot* foi *faturado* e já está seguindo para o envio. 📦 Assim que a transportadora atualizar, te aviso por aqui!` };
  if (marco === "enviado") return { estado: "pedido-enviado", texto: `${oi} Seu pedido *saiu para entrega* 🚚. Qualquer coisa, é só me chamar!` };
  return { estado: "pedido-realizado", texto: `Seu pedido foi recebido com sucesso! ✅ Agora ele segue para a nossa programação. Assim que tivermos novidades, te aviso por aqui. 🧶` };
}

export async function sincronizarPedidos(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  if (cfg.atendimento_ativo !== "1") return 0; // modo teste não mexe com clientes reais

  const { results: convs } = await env.DB.prepare(
    `SELECT id, telefone, nome, contato_nome, cliente_id, cnpj, pedido_id, pedido_marco
       FROM atend_conversas
      WHERE (cliente_id IS NOT NULL OR (cnpj IS NOT NULL AND cnpj <> ''))
        AND estado NOT IN ('nao-qualificado','indicado-parceiro','aguardando-cidade-parceiro')`
  ).all<{ id: string; telefone: string; nome: string | null; contato_nome: string | null; cliente_id: string | null; cnpj: string | null; pedido_id: string | null; pedido_marco: string | null }>();

  let mudou = 0;
  for (const cv of convs) {
    // Nome do cliente (para casar com pedidos.cliente_nome).
    let clienteNome: string | null = null;
    if (cv.cliente_id) clienteNome = (await env.DB.prepare("SELECT nome FROM clientes WHERE id = ?").bind(cv.cliente_id).first<{ nome: string }>())?.nome ?? null;
    if (!clienteNome && cv.cnpj) {
      const dig = digitos(cv.cnpj);
      clienteNome = (await env.DB.prepare("SELECT nome FROM clientes WHERE REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-','') = ? LIMIT 1").bind(dig).first<{ nome: string }>())?.nome ?? null;
    }
    if (!clienteNome) continue;

    const ped = await env.DB.prepare(
      `SELECT p.id, p.numero_erp, e.nf_numero, e.fase, e.transportadora,
              (p.data_pedido >= date('now','-3 days')) AS recente
         FROM pedidos p LEFT JOIN expedicao e ON e.pedido_id = p.id
        WHERE p.cliente_nome = ? AND COALESCE(p.reposicao,0) = 0
        ORDER BY (p.data_pedido IS NULL), p.data_pedido DESC, p.rowid DESC LIMIT 1`
    ).bind(clienteNome).first<{ id: string; numero_erp: string | null; nf_numero: string | null; fase: string | null; transportadora: string | null; recente: number }>();
    if (!ped) continue;

    const marco = ped.fase === "transporte" && ped.transportadora ? "enviado" : ped.nf_numero ? "faturado" : "realizado";
    const mesmoPedido = ped.id === cv.pedido_id;
    const avancou = !mesmoPedido || MARCO_ORDEM[marco] > (MARCO_ORDEM[cv.pedido_marco || ""] || 0);
    if (!avancou) continue;

    // Anuncia se já acompanhava um pedido, ou se este é recente. Senão, só baseline.
    const anunciar = !!cv.pedido_id || ped.recente === 1;
    if (anunciar) {
      const { estado, texto } = textoMarco(marco, cv.contato_nome || cv.nome);
      await addMsg(env, cv.id, "out", "bot", "texto", texto);
      await enviarWhatsapp(env, cv.telefone, { tipo: "texto", texto });
      await env.DB.prepare(
        "UPDATE atend_conversas SET pedido_id=?, pedido_marco=?, estado=?, followup_etapa=0, ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?"
      ).bind(ped.id, marco, estado, cv.id).run();
      mudou++;
    } else {
      // Baseline silencioso (pedido antigo no 1º vínculo) — não spamma.
      await env.DB.prepare("UPDATE atend_conversas SET pedido_id=?, pedido_marco=? WHERE id=?").bind(ped.id, marco, cv.id).run();
    }
  }
  return mudou;
}

// ── Pós-venda e recompra (por tempo, após a entrega) — chamado pelo cron ──────────
export async function posVendaRecompra(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  if (cfg.atendimento_ativo !== "1") return 0;
  if (!(await horarioComercialOk(env, cfg))) return 0;

  const enviar = async (id: string, telefone: string, texto: string, estado: string, marco: string) => {
    await addMsg(env, id, "out", "bot", "texto", texto);
    await enviarWhatsapp(env, telefone, { tipo: "texto", texto });
    await env.DB.prepare(
      "UPDATE atend_conversas SET estado=?, pedido_marco=?, ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?"
    ).bind(estado, marco, id).run();
  };
  let n = 0;

  // Pós-venda: passou X dias desde o "enviado", sem resposta nova.
  if ((cfg.pos_venda_ativo ?? "1") === "1") {
    const dias = parseInt(cfg.pos_venda_dias || "7", 10);
    const { results } = await env.DB.prepare(
      `SELECT id, telefone, nome, contato_nome FROM atend_conversas
        WHERE pedido_marco='enviado' AND COALESCE(nao_perturbe,0)=0
          AND ultima_out_em IS NOT NULL AND ultima_out_em <= datetime('now', ?)
          AND (ultima_in_em IS NULL OR ultima_in_em <= ultima_out_em)`
    ).bind(`-${dias} days`).all<{ id: string; telefone: string; nome: string | null; contato_nome: string | null }>();
    for (const cv of results) {
      const nome = cv.contato_nome || cv.nome;
      const texto = `Oi${nome ? `, *${nome}*` : ""}! 😊 Vi que seu pedido foi entregue. Chegou tudo certinho? Depois me conta quais peças seus clientes mais gostaram! 💛`;
      await enviar(cv.id, cv.telefone, texto, "pos-venda", "pos-venda");
      n++;
    }
  }

  // Recompra: passou Y dias (após pós-venda/enviado) sem novo pedido.
  if ((cfg.recompra_ativo ?? "1") === "1") {
    const dias = parseInt(cfg.recompra_dias || "45", 10);
    const { results } = await env.DB.prepare(
      `SELECT id, telefone, nome, contato_nome FROM atend_conversas
        WHERE pedido_marco IN ('enviado','pos-venda') AND COALESCE(nao_perturbe,0)=0
          AND ultima_out_em IS NOT NULL AND ultima_out_em <= datetime('now', ?)
          AND (ultima_in_em IS NULL OR ultima_in_em <= ultima_out_em)`
    ).bind(`-${dias} days`).all<{ id: string; telefone: string; nome: string | null; contato_nome: string | null }>();
    for (const cv of results) {
      const nome = cv.contato_nome || cv.nome;
      const texto = `Oi${nome ? `, *${nome}*` : ""}! Como foi a saída das peças do seu último pedido? 🧶 Chegaram novidades e posso verificar a reposição dos modelos que você já levou. Quer dar uma olhada?`;
      await enviar(cv.id, cv.telefone, texto, "recompra", "recompra");
      n++;
    }
  }
  return n;
}

// ── PROSPECÇÃO por catálogo (reativação por faturamento) — chamado pelo cron ──────
// X dias (padrão 30) depois do faturamento, se o cliente com WhatsApp AINDA não tem
// conversa, manda o catálogo atualizado como "desculpa" pra puxar conversa — vale
// pra cliente de representante ou não. Envia UMA vez (a conversa criada evita reenvio).
const MSG_REATIVACAO_PADRAO =
  "Olá {nome}! 💛 Aqui é da *Big Tricot*. Já faz {dias} dias desde o seu último pedido e preparei nosso *catálogo atualizado* pra você. Se precisar repor os modelos que mais saíram ou quiser ver as novidades, é só me chamar por aqui! 🧶";

function primeiroNome(s?: string | null): string {
  const n = String(s || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}
function diasDesdeISO(iso?: string | null, nowMs = Date.now()): number {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}
function linkCatalogo(cfg: Record<string, string>): string {
  const url = (cfg.catalogo_url || "").trim();
  if (!url) return "";
  const senha = (cfg.catalogo_senha || "").trim();
  return `👉 ${url}` + (senha ? `\n🔑 Senha: *${senha}*` : "");
}
function montarMsgReativacao(cfg: Record<string, string>, nome: string, dias: number): string {
  const base = (cfg.reativacao_msg || "").trim() || MSG_REATIVACAO_PADRAO;
  let txt = base.replace(/\{nome\}/gi, nome).replace(/\{dias\}/gi, String(dias));
  txt = txt.replace(/\s+([!?.,])/g, "$1").replace(/,\s*,/g, ",").replace(/ {2,}/g, " ").trim();
  const link = linkCatalogo(cfg);
  if (link && !/https?:\/\//i.test(base)) txt += `\n\n${link}`;
  return txt;
}

// Processa as campanhas ativas: envia aos poucos, respeitando o intervalo (anti-ban).
// Roda no cron frequente. Cada tick dispara por até ~4min e o resto segue no próximo.
export async function processarCampanhas(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  if (cfg.zapi_ativo !== "1") return 0;
  const { results: camps } = await env.DB.prepare(
    "SELECT id, mensagem, intervalo_seg FROM atend_campanhas WHERE status='ativa'"
  ).all<{ id: string; mensagem: string; intervalo_seg: number }>().catch(() => ({ results: [] as { id: string; mensagem: string; intervalo_seg: number }[] }));
  let enviados = 0;
  const inicio = Date.now();
  for (const camp of camps) {
    const intervalo = Math.max(15, Number(camp.intervalo_seg) || 40);
    const { results: alvos } = await env.DB.prepare(
      "SELECT id, telefone FROM atend_campanha_alvos WHERE campanha_id=? AND status='pendente' ORDER BY rowid LIMIT 500"
    ).bind(camp.id).all<{ id: string; telefone: string }>();
    if (!alvos.length) { await env.DB.prepare("UPDATE atend_campanhas SET status='concluida' WHERE id=?").bind(camp.id).run(); continue; }
    for (const alvo of alvos) {
      if (Date.now() - inicio > 4 * 60 * 1000) return enviados; // segue no próximo tick do cron
      // Confere se a campanha ainda está ativa (pode ter sido pausada no meio).
      const ativa = await env.DB.prepare("SELECT 1 FROM atend_campanhas WHERE id=? AND status='ativa'").bind(camp.id).first();
      if (!ativa) break;
      const r = await enviarWhatsapp(env, alvo.telefone, { tipo: "texto", texto: camp.mensagem });
      const st = r.enviado ? "enviado" : (r.motivo === "cliente-bloqueado" ? "bloqueado" : "falhou");
      // Enviou de verdade → grava a mensagem NA CONVERSA do cliente (aparece no histórico, com ✓✓).
      if (r.enviado) await registrarEnvioNaConversa(env, alvo.telefone, camp.mensagem, r.messageId ?? null);
      await env.DB.prepare("UPDATE atend_campanha_alvos SET status=?, motivo=?, enviado_em=datetime('now') WHERE id=?").bind(st, r.motivo || null, alvo.id).run();
      await env.DB.prepare("UPDATE atend_campanhas SET ultimo_envio_em=datetime('now') WHERE id=?").bind(camp.id).run();
      if (r.enviado) enviados++;
      await new Promise((res) => setTimeout(res, intervalo * 1000));
    }
  }
  return enviados;
}

export async function prospeccaoCatalogo(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  if (cfg.atendimento_ativo !== "1") return 0;          // modo teste não mexe com clientes reais
  if ((cfg.reativacao_ativo ?? "0") !== "1") return 0;   // desligado por padrão (liga na config)
  if (cfg.zapi_ativo !== "1") return 0;
  if (!(await horarioComercialOk(env, cfg))) return 0;

  const dias = Math.max(1, parseInt(cfg.reativacao_dias || "30", 10) || 30);
  const limite = Math.max(1, parseInt(cfg.reativacao_limite || "12", 10) || 12);

  const { results: clientes } = await env.DB.prepare(
    `SELECT id, nome, contato, whatsapp, cidade, uf, representante, ultimo_faturamento FROM clientes
      WHERE COALESCE(whatsapp,'') <> '' AND COALESCE(ultimo_faturamento,'') <> ''
        AND ultimo_faturamento <= date('now', ?)
      ORDER BY ultimo_faturamento ASC`
  ).bind(`-${dias} day`).all<{ id: string; nome: string; contato: string | null; whatsapp: string | null; cidade: string | null; uf: string | null; representante: string | null; ultimo_faturamento: string | null }>();
  if (!clientes.length) return 0;

  // Já tem conversa? (não reenvia nem incomoda quem já falou com a gente)
  const { results: convs } = await env.DB.prepare("SELECT telefone, cliente_id FROM atend_conversas").all<{ telefone: string | null; cliente_id: string | null }>();
  const jaFalou = new Set<string>();
  for (const cv of convs) { if (cv.cliente_id) jaFalou.add("id:" + cv.cliente_id); const t = digitos(cv.telefone || ""); if (t.length >= 8) jaFalou.add("tel:" + t.slice(-8)); }

  // Anti-banimento: NÃO dispara em rajada. Espaça cada envio (intervalo aleatório,
  // padrão 25–55s) e para o disparo depois de ~8 min pra não estourar o tempo do cron
  // (o que sobrar sai no próximo horário; é idempotente). Intervalo é configurável.
  const gapMin = Math.max(5, parseInt(cfg.reativacao_intervalo_seg || "40", 10) || 40);
  const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const inicio = Date.now();
  const agora = inicio;
  let enviados = 0;
  for (const cli of clientes) {
    if (enviados >= limite) break;
    if (Date.now() - inicio > 8 * 60 * 1000) break; // orçamento de tempo do cron
    if (ehClienteInterno(cli.nome)) continue;
    const tel = digitos(cli.whatsapp || "");
    if (tel.length < 10) continue;
    if (jaFalou.has("id:" + cli.id) || jaFalou.has("tel:" + tel.slice(-8))) continue;
    if (enviados > 0) await dormir((gapMin + Math.floor(Math.random() * 30)) * 1000); // espaço entre um cliente e o próximo
    // Só usa nome quando há CONTATO (pessoa). Sem contato, chama só "Olá!" —
    // evita usar a razão social da empresa como se fosse o nome da pessoa.
    const d = diasDesdeISO(cli.ultimo_faturamento, agora);
    const texto = ajustarCatalogoRegiao(montarMsgReativacao(cfg, primeiroNome(cli.contato), d), cli.uf, tel);
    // Cria a conversa PRIMEIRO (ainda sem card) e ENVIA de verdade, guardando o id da Z-API
    // (pra ✓✓ entregue/lido funcionar). Só cria o card de "Catálogo enviado" se o envio REALMENTE
    // saiu. Se falhar (número inválido, cliente bloqueado, Z-API fora do ar), apaga a conversa e
    // segue — nada de card fantasma marcado como "enviado" sem ter saído.
    const convId = uid();
    await env.DB.prepare(
      "INSERT INTO atend_conversas (id, telefone, estado, origem, tipo, cliente_id, nome, pedido_marco, ultima_out_em, atualizado_em) VALUES (?, ?, 'prospeccao-catalogo', 'reativacao', 'lojista', ?, ?, 'reativacao', datetime('now'), datetime('now'))"
    ).bind(convId, tel, cli.id, cli.nome).run();
    const envio = await enviarBot(env, convId, tel, { tipo: "texto", texto });
    if (!envio.enviado) {
      await env.DB.prepare("DELETE FROM atend_mensagens WHERE conversa_id=?").bind(convId).run();
      await env.DB.prepare("DELETE FROM atend_conversas WHERE id=?").bind(convId).run();
      continue; // não conta como enviado; tenta de novo no próximo horário
    }
    // Enviou de verdade → cria o card "Catálogo enviado" e liga na conversa.
    const cardId = uid();
    await env.DB.prepare(
      "INSERT INTO funil_cards (id, cliente_id, nome, cidade, uf, whatsapp, etapa, responsavel) VALUES (?, ?, ?, ?, ?, ?, 'prospeccao-enviada', ?)"
    ).bind(cardId, cli.id, cli.nome, cli.cidade ?? null, cli.uf ?? null, tel, cli.representante ?? null).run();
    await env.DB.prepare("INSERT INTO funil_eventos (id, card_id, tipo, texto) VALUES (?, ?, 'etapa', ?)").bind(uid(), cardId, `Catálogo enviado automaticamente (+${d} dias do faturamento)`).run();
    await env.DB.prepare("UPDATE atend_conversas SET card_id=? WHERE id=?").bind(cardId, convId).run();
    jaFalou.add("id:" + cli.id); jaFalou.add("tel:" + tel.slice(-8));
    enviados++;
  }
  return enviados;
}

// Texto de cada etapa do follow-up (personalizado com o nome, se houver).
function textoFollowup(etapa: number, nome: string | null): string {
  const oi = `Oi${nome ? `, *${nome}*` : ""}!`;
  if (etapa === 1) return `${oi} 😊 Passando pra saber se você conseguiu dar uma olhada no nosso catálogo. Tem algum modelo que chamou sua atenção? Posso te ajudar a montar uma seleção pra sua loja!`;
  if (etapa === 2) return `${oi} Passando só pra saber se ficou alguma dúvida sobre os produtos ou as condições de pedido. Posso te ajudar a montar uma seleção pra sua loja. 💛`;
  return `Vou deixar seu atendimento em aberto por aqui 🌸. Quando quiser conhecer melhor nossos produtos ou receber sugestões pra sua loja, é só me chamar!`;
}

// Gera o texto do follow-up por IA (Cloudflare Workers AI). Personaliza com nome/cidade
// e a intenção da etapa. Qualquer falha (ou IA desligada) cai no modelo pronto.
async function textoFollowupIA(env: Env, etapa: number, ctx: { nome: string | null; cidade: string | null }): Promise<string> {
  const fallback = textoFollowup(etapa, ctx.nome);
  try {
    const objetivo = etapa === 1
      ? "primeira retomada, leve e simpática, perguntando se conseguiu ver o catálogo"
      : etapa === 2
        ? "segunda tentativa, oferecendo ajuda para montar uma seleção para a loja dela"
        : "última mensagem, deixando o atendimento em aberto, sem insistir";
    const sys = "Você é atendente da Big Tricot, atacado de tricô para o lar (mantas, capas, almofadas), falando com LOJISTAS pelo WhatsApp. Escreva UMA mensagem curta (1 a 2 frases), calorosa e natural em português do Brasil, com no máximo 1 emoji. NUNCA invente preços, produtos, prazos ou promoções. Não seja insistente. Responda apenas com a mensagem, sem aspas.";
    const usr = `Objetivo: ${objetivo}.${ctx.nome ? ` Nome da loja/cliente: ${ctx.nome}.` : ""}${ctx.cidade ? ` Cidade: ${ctx.cidade}.` : ""}`;
    const r = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 140,
    })) as { response?: string };
    const txt = (r?.response || "").trim().replace(/^["']+|["']+$/g, "");
    return txt.length >= 10 && txt.length <= 400 ? txt : fallback;
  } catch {
    return fallback;
  }
}

// ── FOLLOW-UP em cadência (24h → +3d → +7d → para) com regras (chamado pelo cron) ──
// Regras: só em horário comercial (Brasil, sem madrugada/domingo), nunca 2× no mesmo
// dia, para quando o cliente responde, não insiste após a última tentativa, e respeita
// o opt-out (nao_perturbe) e o interruptor mestre.
export async function followupAtendimento(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  if (cfg.atendimento_ativo !== "1") return 0;        // modo teste: não mexe com clientes reais
  if ((cfg.followup_ativo ?? "1") !== "1") return 0;   // cadência desligada
  if (!(await horarioComercialOk(env, cfg))) return 0; // horário comercial (Brasil)

  // etapa atual → intervalo desde a última mensagem → próxima etapa/estado.
  const estagios = [
    { de: 0, gap: "-24 hours", para: 1, estado: "follow-up-24h" },
    { de: 1, gap: "-3 days", para: 2, estado: "follow-up-24h" },
    { de: 2, gap: "-7 days", para: 3, estado: "sem-retorno" },
  ];
  const usarIA = (cfg.followup_ia ?? "0") === "1";
  let enviados = 0;
  for (const e of estagios) {
    const { results } = await env.DB.prepare(
      `SELECT id, telefone, nome, contato_nome, cidade FROM atend_conversas
        WHERE followup_etapa = ? AND COALESCE(nao_perturbe,0) = 0
          AND estado IN ('catalogo-enviado','follow-up-24h')
          AND ultima_out_em IS NOT NULL AND ultima_out_em <= datetime('now', ?)
          AND (ultima_in_em IS NULL OR ultima_in_em <= ultima_out_em)`
    ).bind(e.de, e.gap).all<{ id: string; telefone: string; nome: string | null; contato_nome: string | null; cidade: string | null }>();
    for (const conv of results) {
      const nome = conv.contato_nome || conv.nome;
      const texto = usarIA ? await textoFollowupIA(env, e.para, { nome, cidade: conv.cidade }) : textoFollowup(e.para, nome);
      await addMsg(env, conv.id, "out", "bot", "texto", texto);
      await enviarWhatsapp(env, conv.telefone, { tipo: "texto", texto });
      await env.DB.prepare(
        "UPDATE atend_conversas SET followup_etapa=?, estado=?, ultima_out_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?"
      ).bind(e.para, e.estado, conv.id).run();
      enviados++;
    }
  }
  return enviados;
}
