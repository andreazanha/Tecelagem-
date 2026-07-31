// Robô de atendimento do WhatsApp — rotas: recebe mensagem (webhook/simulador),
// roda a máquina de estados, persiste conversa+histórico e responde. O envio real
// pela Z-API e a consulta SINTEGRA entram nos stubs marcados com TODO.
import { Hono } from "hono";
import type { Env } from "../index";
import { processar, colunaDe, ATEND_COLUNAS, BOAS_VINDAS, montarCatalogo, type Conversa, type Deps, type LojaParceira, type Saida, type EstadoAtend } from "../atendimento_bot";
import { ehClienteInterno } from "./funil";

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
};

// ── Dependências (SINTEGRA + lojas parceiras) ────────────────────────────────────
function deps(env: Env, cat?: { url?: string | null; senha?: string | null; msg?: string | null }, origin?: string | null): Deps {
  return {
    vitrineUrl: origin ? origin + "/vitrine" : null,
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

async function addMsg(env: Env, convId: string, direcao: "in" | "out", autor: string, tipo: string, texto: string) {
  await env.DB.prepare(
    "INSERT INTO atend_mensagens (id, conversa_id, direcao, autor, tipo, texto) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(uid(), convId, direcao, autor, tipo, texto).run();
}

// ── IA de triagem (atendente virtual antes do CNPJ) ──────────────────────────────
// A IA conversa naturalmente, entende a necessidade e CLASSIFICA o contato:
//  • lojista pronto pra ver produtos → "coletar_lojista" (aí o fluxo pede nome+CNPJ)
//  • consumidor final               → "indicar_parceiro" (loja parceira da região)
//  • financeiro/pós-venda/reclamação/pediu humano → "humano"
//  • ainda conversando              → "conversar"
// O motor determinístico (CNPJ, catálogo, parceiros) segue intacto — a IA só faz a frente.
const IA_SISTEMA = `Você é a *Bia*, atendente virtual da *Big Tricot* no WhatsApp.
A Big Tricot é uma fábrica de tricô (mantas, capas de almofada, almofadas e afins) que vende **no ATACADO, apenas para LOJISTAS** (revendedores com CNPJ).

SEU PAPEL: acolher quem chama, conversar de forma natural e humana, ENTENDER o que a pessoa quer e descobrir se ela é LOJISTA (compra pra revender) ou CONSUMIDOR FINAL (compra pra usar/presente).

REGRAS IMPORTANTES:
- NÃO peça o CNPJ logo de cara. Primeiro converse, entenda a necessidade (que tipo de produto procura, se já conhece a marca, etc.) e só depois, quando fizer sentido, encaminhe pra pegar os dados.
- Se perceber que é LOJISTA e a pessoa quer comprar/revender/fazer cadastro: use acao "coletar_lojista" e, na sua resposta, peça gentilmente o NOME DA LOJA (o sistema pede o CNPJ na sequência).
- CATÁLOGO: nosso catálogo é DIGITAL (um link), nunca um PDF. NUNCA envie o catálogo por conta própria nem prometa enviar "automaticamente". Envie SÓ quando o cliente PEDIR o catálogo (ex.: "me manda o catálogo", "quero ver os produtos", "tem catálogo?") — aí use acao "enviar_catalogo" (o sistema anexa o link). Não peça CNPJ como condição para mandar o catálogo se o cliente só quer dar uma olhada.
- Se for CONSUMIDOR FINAL (pessoa física, "pra mim", "uso pessoal", "presente", sem loja/CNPJ): use acao "indicar_parceiro". Explique com carinho, em 1 linha, que a Big Tricot vende no atacado para lojistas, mas que você indica as lojas parceiras da região dele. Você só precisa do ESTADO — se ainda não souber, pergunte "de qual estado você é?". Preencha o campo "uf" com a sigla (ex.: MG). O SISTEMA envia automaticamente o link da vitrine de lojas parceiras filtrado pelo estado; NUNCA diga "vou te passar os dados/contatos depois", NUNCA tente listar lojas você mesmo, e NÃO fale de modelos/cores com o consumidor final.
- STATUS DE PEDIDO: se o cliente perguntar sobre um pedido dele (ex.: "como está meu pedido?", "meu pedido já saiu?", "em que fase está?"): use acao "consultar_pedido". O sistema identifica pelo CNPJ e responde a fase de produção + a data prevista — você não precisa inventar nada. Se você JÁ sabe o CNPJ dele, preencha o campo "cnpj". Se NÃO souber, peça o CNPJ da loja na resposta. IMPORTANTE: depois que o status for informado, se o cliente fizer MAIS perguntas sobre o pedido (adiantar, alterar, reclamar do prazo), use acao "humano" e diga que vai chamar alguém do *time de produção* pra ajudar (NÃO fale a sigla "PCP" pro cliente — é interno).
- Se o cliente pedir PRIVATE LABEL (marca própria, etiqueta própria, fabricar com a marca dele): use acao "humano" — isso é com um vendedor especializado. Na resposta, diga que já vai chamar o vendedor.
- Se pedir Financeiro, Pós-venda, tratar de um pedido já feito, reclamação/problema, ou pedir pra falar com uma pessoa: use acao "humano".
- Enquanto ainda está entendendo se é lojista ou consumidor, use acao "conversar". Assim que descobrir, seja decidido e use a acao certa — não enrole.
- Não invente preços, prazos, pedido mínimo ou políticas POR CONTA PRÓPRIA. PORÉM, se a pergunta tiver resposta na BASE DE CONHECIMENTO (mais abaixo), use EXATAMENTE aquela informação — ela é oficial da empresa e tem prioridade sobre esta regra. Só quando NÃO houver nada na base sobre o assunto é que você diz que o vendedor passa os detalhes.
- Tom: caloroso, brasileiro, informal de WhatsApp. Respostas CURTAS (1 a 3 linhas), no máximo 1 ou 2 emojis. Nunca repita a mesma pergunta que já foi respondida.
- Escreva os emojis COMO EMOJI de verdade (😊 💛 👍), NUNCA como código escapado tipo \\u{1f603}.

RESPONDA **SOMENTE** com um JSON válido, sem texto fora dele, neste formato exato:
{"resposta": "<o que enviar pro cliente>", "intencao": "lojista" | "consumidor" | "indefinido", "acao": "conversar" | "coletar_lojista" | "enviar_catalogo" | "consultar_pedido" | "indicar_parceiro" | "humano", "uf": "<sigla do estado, ex.: MG, se souber; senão vazio>", "cidade": "<cidade se souber; senão vazio>", "cnpj": "<CNPJ do cliente se ele informar ou você já souber; senão vazio>"}`;

// Estados "terminados" em que a Bia reengaja o contato que volta a falar (ela usa o
// histórico e continua). Ficam de fora: coleta determinística e estados de pedido/pós-venda.
const IA_REENGATA = new Set<string>(["indicado-parceiro", "catalogo-enviado", "nao-qualificado", "sem-retorno", "follow-up-24h"]);

// Saudação fixa do primeiro contato (lead novo, desconhecido) quando a IA está ligada.
const SAUDACAO_NOVO =
  "Olá! Tudo bem? 🤗\n" +
  "Seja bem-vindo à *Big Tricot*!\n\n" +
  "Somos uma fábrica especializada em tricô para decoração e atendemos exclusivamente lojistas no atacado.\n\n" +
  "Para eu te ajudar melhor, você já é nosso cliente ou está entrando em contato pela primeira vez?";

// Junta as regras base (fixas, incluindo o formato JSON) com os ajustes que o lojista
// escreve na config. Ajustes se SOMAM — nunca substituem o núcleo, pra não quebrar a Bia.
function sistemaIa(extra?: string | null): string {
  const e = String(extra ?? "").trim();
  return e ? `${IA_SISTEMA}\n\nAJUSTES DO LOJISTA (siga também estas instruções, sem quebrar o formato JSON acima):\n${e}` : IA_SISTEMA;
}

// Base de conhecimento (treino da Bia): injeta as perguntas/respostas ativas no prompt,
// pra ela responder dúvidas complexas do jeito certo. Vazio se não houver entradas.
async function lerConhecimento(env: Env): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT pergunta, resposta FROM ia_conhecimento WHERE COALESCE(ativo,1)=1 ORDER BY criado_em"
  ).all<{ pergunta: string; resposta: string }>().catch(() => ({ results: [] as { pergunta: string; resposta: string }[] }));
  if (!results.length) return "";
  const itens = results.map((r) => `P: ${String(r.pergunta).trim()}\nR: ${String(r.resposta).trim()}`).join("\n\n");
  return `\n\nBASE DE CONHECIMENTO OFICIAL (PRIORIDADE MÁXIMA): quando a pergunta do cliente for sobre um destes temas, responda COM BASE na resposta correspondente — mesmo que seja sobre preço, prazo ou pedido mínimo. Estas respostas foram definidas pela empresa e valem MAIS que a regra geral de "não inventar". Adapte só o tom, sem mudar a informação. Se não houver nada relacionado, siga as regras acima.\n${itens}`;
}

const IA_MODELOS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct",
];

interface IaDecisao { resposta: string; intencao: string; acao: string; uf?: string; cidade?: string; cnpj?: string }

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
      return { resposta: decodificarEscapes(o.resposta.trim()), intencao: String(o.intencao ?? "indefinido"), acao: String(o.acao ?? "conversar"), uf: String(o.uf ?? ""), cidade: String(o.cidade ?? ""), cnpj: String(o.cnpj ?? "") };
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

// ── Status do pedido (Bia consulta a produção pelo CNPJ) ──────────────────────────
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

interface IaSaida { saidas: Saida[]; novoEstado: EstadoAtend; notificarHumano: boolean; tipo: string | null; catalogo?: boolean; consultarPedido?: boolean; cnpjConsulta?: string }

// Roda a IA de triagem e traduz a decisão em resposta + próximo estado do fluxo.
// `origin` é usado pra montar o link da vitrine (indicação de consumidor final).
async function iaTriagem(env: Env, conv: ConvRow, sistema: string, origin: string | null): Promise<IaSaida> {
  const dec = await chamarIa(env, conv, sistema);
  // IA indisponível (binding ausente/erro) → degrada pro menu determinístico, que é à prova de falhas.
  if (!dec) return { saidas: [{ tipo: "texto", texto: BOAS_VINDAS }], novoEstado: "aguardando-setor", notificarHumano: false, tipo: null };

  // CONSUMIDOR FINAL: guardrail robusto — não depende só do "acao" do modelo. Se ele marcou
  // indicar_parceiro OU disse que é consumidor, tratamos como indicação. Com o ESTADO em mãos,
  // o sistema JÁ envia o link da vitrine filtrado por UF (a pessoa escolhe a cidade mais perto lá).
  const uf = ufDe(dec.uf) || ufDe(conv.uf);
  const querIndicar = dec.acao === "indicar_parceiro" || dec.intencao === "consumidor";
  if (querIndicar) {
    if (uf && origin) {
      const link = `${origin}/vitrine?uf=${encodeURIComponent(uf)}`;
      // Mensagem fixa (rápida e sem "vou passar depois"): manda o link do estado na hora.
      const saidas: Saida[] = [
        { tipo: "texto", texto: `Prontinho! 💛 Abre esse link, escolha a *cidade mais perto de você* e veja os contatos das lojas parceiras de ${uf} 👇\n${link}` },
      ];
      return { saidas, novoEstado: "indicado-parceiro", notificarHumano: false, tipo: "consumidor" };
    }
    // Ainda não sabemos o estado → a IA pergunta (a resposta dela já pede) e aguardamos.
    return { saidas: [{ tipo: "texto", texto: dec.resposta }], novoEstado: "aguardando-cidade-parceiro", notificarHumano: false, tipo: "consumidor" };
  }

  const saidas: Saida[] = [{ tipo: "texto", texto: dec.resposta }];
  switch (dec.acao) {
    case "coletar_lojista":
      // A IA já pediu o nome da loja na resposta → o fluxo determinístico captura o nome e pede o CNPJ.
      return { saidas, novoEstado: "triagem-nome", notificarHumano: false, tipo: "lojista" };
    case "enviar_catalogo":
      // SÓ quando o cliente PEDE o catálogo. A mensagem do catálogo (link virtual) é
      // anexada no núcleo (receberMensagem), que tem a config. Aqui só sinalizamos.
      return { saidas, novoEstado: "catalogo-enviado", notificarHumano: false, tipo: "lojista", catalogo: true };
    case "consultar_pedido":
      // Cliente quer saber o status do pedido. O núcleo resolve o CNPJ e consulta a produção.
      return { saidas, novoEstado: "ia-triagem", notificarHumano: false, tipo: conv.tipo ?? null, consultarPedido: true, cnpjConsulta: digitos(dec.cnpj) || digitos(conv.cnpj) };
    case "humano":
      return { saidas, novoEstado: "atendimento-humano", notificarHumano: true, tipo: conv.tipo ?? null };
    default:
      return { saidas, novoEstado: "ia-triagem", notificarHumano: false, tipo: conv.tipo ?? null };
  }
}

// ── Núcleo: recebe uma mensagem do cliente, roda o robô, responde e qualifica ────
// Usado tanto pelo simulador (/entrada) quanto pelo webhook real da Z-API (/webhook).
async function receberMensagem(env: Env, telRaw: unknown, textoRaw: unknown, origem = "whatsapp", contatoNome = "", origin: string | null = null) {
  const tel = digitos(telRaw);
  const texto = String(textoRaw ?? "");
  const contato = String(contatoNome ?? "").trim().slice(0, 80) || null;
  if (!tel) return { erro: "telefone é obrigatório" as const };

  let conv = await env.DB.prepare("SELECT * FROM atend_conversas WHERE telefone = ?").bind(tel).first<ConvRow>();
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
  await addMsg(env, conv.id, "in", "cliente", "texto", texto);
  await env.DB.prepare("UPDATE atend_conversas SET ultima_in_em = datetime('now') WHERE id = ?").bind(conv.id).run();

  // Detecta interesse comercial + modelos citados (vale inclusive no atendimento humano).
  const cfgAt = await lerConfig(env);
  await detectarInteresse(env, conv.id, texto, cfgAt.interesse_modelos || "");
  // Reclamação/problema → sinaliza para o time tratar com prioridade.
  if (RECLAMACAO_RE.test(texto)) {
    await addMsg(env, conv.id, "out", "sistema", "sistema", "⚠️ Possível reclamação/problema — priorizar atendimento humano.");
  }

  // Cliente respondeu durante o follow-up → cancela a cadência e sinaliza a retomada.
  if ((conv.followup_etapa ?? 0) > 0 && ["catalogo-enviado", "follow-up-24h", "sem-retorno"].includes(conv.estado)) {
    await env.DB.prepare("UPDATE atend_conversas SET followup_etapa=0 WHERE id=?").bind(conv.id).run();
    await addMsg(env, conv.id, "out", "sistema", "sistema", "🔔 Cliente respondeu ao follow-up — retomar atendimento.");
  }

  // Atendente humano assumiu → o robô não responde mais, só registra a mensagem.
  if (conv.estado === "atendimento-humano") {
    return { conversa_id: conv.id, estado: conv.estado, coluna: colunaDe(conv.estado), respostas: [], notificarHumano: true };
  }

  // IA de triagem (se ligada). Representantes seguem o fluxo padrão (menu).
  // Reengaja também quem já tinha terminado a conversa e voltou a falar (a Bia tem o
  // histórico e continua). NÃO reengaja estados de coleta determinística (nome/CNPJ/cidade)
  // nem "atendimento-humano" (já tratado acima).
  if (cfgAt.atendimento_ia === "1" && conv.tipo !== "representante"
      && (conv.estado === "novo" || conv.estado === "ia-triagem" || IA_REENGATA.has(conv.estado))) {
    // PRIMEIRO CONTATO: saudação fixa (sem gastar chamada de IA). Se o número já está
    // na base de clientes, identifica e saúda pelo nome; senão manda a saudação padrão.
    if (conv.estado === "novo") {
      const primeiro = String(conv.nome ?? "").trim().split(/\s+/)[0] || "";
      const saud = conv.cliente_id
        ? `Olá${primeiro ? ", " + primeiro : ""}! Tudo bem? 🤗\nQue bom te ver de novo na *Big Tricot*! 💛\nComo posso te ajudar hoje?`
        : SAUDACAO_NOVO;
      await env.DB.prepare("UPDATE atend_conversas SET estado='ia-triagem', atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
      await addMsg(env, conv.id, "out", "bot", "texto", saud);
      await enviarWhatsapp(env, tel, { tipo: "texto", texto: saud });
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
    const ia = await iaTriagem(env, conv, sistema, origin);
    // Cliente pediu o catálogo → anexa a mensagem do catálogo (virtual/link), montada da config.
    if (ia.catalogo) {
      for (const s of montarCatalogo(deps(env, { url: cfgAt.catalogo_url, senha: cfgAt.catalogo_senha, msg: cfgAt.catalogo_msg }, origin))) ia.saidas.push(s);
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
    await env.DB.prepare("UPDATE atend_conversas SET estado=?, tipo=COALESCE(?, tipo), atualizado_em=datetime('now') WHERE id=?")
      .bind(ia.novoEstado, ia.tipo, conv.id).run();
    for (const s of ia.saidas) {
      await addMsg(env, conv.id, "out", "bot", s.tipo, s.texto);
      await enviarWhatsapp(env, tel, s);
    }
    if (ia.saidas.length) await env.DB.prepare("UPDATE atend_conversas SET ultima_out_em = datetime('now') WHERE id = ?").bind(conv.id).run();
    return { conversa_id: conv.id, estado: ia.novoEstado, coluna: colunaDe(ia.novoEstado), respostas: ia.saidas, notificarHumano: ia.notificarHumano };
  }

  // Passa o contexto de identificação pro robô (saudação personalizada de cliente conhecido).
  conv.clienteConhecido = !!conv.cliente_id;
  const r = await processar(conv as Conversa, texto, deps(env, { url: cfgAt.catalogo_url, senha: cfgAt.catalogo_senha, msg: cfgAt.catalogo_msg }, origin));

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

  for (const s of r.saidas) {
    await addMsg(env, conv.id, "out", "bot", s.tipo, s.texto);
    await enviarWhatsapp(env, tel, s);
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
  // Interruptor mestre: se o atendimento automático estiver desligado, NÃO responde
  // clientes reais (fica em modo teste interno pelo Simulador). Ignora silenciosamente.
  const cfg = await lerConfig(c.env);
  if (cfg.atendimento_ativo !== "1") return c.json({ ignorado: "atendimento-desligado" });
  // Não responde em grupos (só conversas 1:1).
  if (b.isGroup === true || b.isGroupMessage === true) return c.json({ ignorado: "grupo" });
  // Só processa mensagem recebida de terceiro.
  if (b.fromMe === true) return c.json({ ignorado: "fromMe" });
  if (b.type && b.type !== "ReceivedCallback") return c.json({ ignorado: String(b.type) });
  const phone = digitos(b.phone ?? b.participantPhone ?? b.connectedPhone);
  // Texto pode vir em text.message, ou legendas de mídia (image.caption etc.).
  const t = b.text as { message?: string } | undefined;
  const img = b.image as { caption?: string } | undefined;
  const texto = (t?.message ?? img?.caption ?? "").toString();
  const nomeContato = String(b.senderName ?? b.chatName ?? b.pushName ?? "").trim();
  if (!phone) return c.json({ ignorado: "sem-telefone" });
  if (!texto.trim()) return c.json({ ignorado: "sem-texto" });
  const r = await receberMensagem(c.env, phone, texto, "whatsapp", nomeContato, new URL(c.req.url).origin);
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

  let conv = await env.DB.prepare("SELECT id, nome, representante FROM atend_conversas WHERE telefone = ?").bind(tel).first<{ id: string; nome: string | null; representante: string | null }>();
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
  await addMsg(env, conv.id, "in", "catalogo", "sistema", label);
  await env.DB.prepare("UPDATE atend_conversas SET atualizado_em=datetime('now') WHERE id=?").bind(conv.id).run();
  if (tipo === "produto" && ev.produto) {
    await env.DB.prepare("INSERT OR IGNORE INTO atend_interesses (id, conversa_id, termo) VALUES (?, ?, ?)").bind(uid(), conv.id, String(ev.produto).trim().slice(0, 60)).run();
    await env.DB.prepare("UPDATE atend_conversas SET interessado=1 WHERE id=?").bind(conv.id).run();
  }
  return conv.id;
}

atendimento.post("/catalogo-evento", async (c) => {
  const cfg = await lerConfig(c.env);
  const b = await c.req.json<{ tipo?: string; telefone?: string; loja?: string; rep?: string; produto?: string; code?: string }>().catch(() => ({}) as Record<string, string>);
  if (cfg.catalogo_evento_token && (b.code || "") !== cfg.catalogo_evento_token) return c.json({ error: "não autorizado" }, 401);
  if (!digitos(b.telefone)) return c.json({ error: "telefone é obrigatório" }, 400);
  const id = await registrarEventoCatalogo(c.env, b);
  return c.json({ ok: true, conversa_id: id });
});

// ── LEITURA (PULL) da atividade do catálogo (bt-atividade) — chamado pelo cron ────
// Lê GET no /log configurado, mapeia repId→repNome (dos eventos "envio"), e cria os
// leads no board. Guarda o último ts processado para não repetir. Read-only p/ o cliente.
export async function lerAtividadeCatalogo(env: Env): Promise<number> {
  const cfg = await lerConfig(env);
  const url = (cfg.catalogo_log_url || "").trim();
  if (!url) return 0;
  let eventos: Array<Record<string, unknown>> = [];
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return 0;
    const dados = await resp.json<{ eventos?: Array<Record<string, unknown>> }>();
    eventos = Array.isArray(dados?.eventos) ? dados.eventos : [];
  } catch {
    return 0;
  }
  // Mapa repId → repNome (o "acesso" não traz o nome; o "envio" traz).
  const repMap = new Map<string, string>();
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
const BOOL_CHAVES = new Set(["zapi_ativo", "atendimento_ativo", "atendimento_ia", "followup_ativo", "followup_domingo", "followup_ia", "pos_venda_ativo", "recompra_ativo"]);

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
    ia_prompt: cfg.ia_prompt || "",
    ia_prompt_padrao: IA_SISTEMA,
    catalogo_url: cfg.catalogo_url || "",
    catalogo_senha: cfg.catalogo_senha || "",
    catalogo_msg: cfg.catalogo_msg || "",
    followup_ativo: (cfg.followup_ativo ?? "1") === "1",
    followup_hora_ini: cfg.followup_hora_ini || "8",
    followup_hora_fim: cfg.followup_hora_fim || "18",
    followup_domingo: cfg.followup_domingo === "1",
    followup_ia: cfg.followup_ia === "1",
    pos_venda_ativo: (cfg.pos_venda_ativo ?? "1") === "1",
    pos_venda_dias: cfg.pos_venda_dias || "7",
    recompra_ativo: (cfg.recompra_ativo ?? "1") === "1",
    recompra_dias: cfg.recompra_dias || "45",
    catalogo_evento_token: cfg.catalogo_evento_token || "",
    catalogo_evento_url: new URL(c.req.url).origin + "/api/atendimento/catalogo-evento",
    catalogo_log_url: cfg.catalogo_log_url || "",
    webhook_url: new URL(c.req.url).origin + "/api/atendimento/webhook",
  });
});

atendimento.post("/config", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const pares: [string, string][] = [];
  for (const k of [...ZAPI_CHAVES, "atendimento_ativo", "atendimento_ia", "ia_prompt", "catalogo_url", "catalogo_senha", "catalogo_msg", "followup_ativo", "followup_hora_ini", "followup_hora_fim", "followup_domingo", "followup_ia", "pos_venda_ativo", "pos_venda_dias", "recompra_ativo", "recompra_dias", "catalogo_evento_token", "catalogo_log_url"] as const) {
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
  return c.json({ ok: true, novos: n });
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
async function enviarWhatsapp(env: Env, tel: string, saida: { tipo: string; texto: string }) {
  const cfg = await lerConfig(env);
  if (cfg.zapi_ativo !== "1") return { enviado: false, motivo: "desligado" };
  const base = (cfg.zapi_base || "https://api.z-api.io").replace(/\/+$/, "");
  const inst = cfg.zapi_instance || "";
  const token = cfg.zapi_token || "";
  if (!inst || !token) return { enviado: false, motivo: "sem-credenciais" };
  const phone = digitos(tel);
  const texto = String(saida.texto ?? "").trim();
  if (!phone || !texto) return { enviado: false, motivo: "vazio" };
  // "Digitando…": a Z-API mostra o status de digitação por N segundos antes de enviar.
  // Proporcional ao tamanho do texto (1s + ~1s a cada 50 caracteres), no máx. 5s.
  const delayTyping = Math.min(5, 1 + Math.floor(texto.length / 50));
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
    const resp = await fetch(`${base}/instances/${inst}/token/${token}/send-text`, {
      method: "POST", headers, body: JSON.stringify({ phone, message: texto, delayTyping }),
    });
    if (!resp.ok) return { enviado: false, motivo: `http-${resp.status}` };
    return { enviado: true };
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

// ── BOARD (conversas por coluna) ──────────────────────────────────────────────────
atendimento.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.telefone, c.nome, c.estado, c.setor, c.cnpj, c.cidade, c.uf, c.lojista, c.responsavel, c.atualizado_em, c.tipo, c.representante, c.origem, c.contato_nome, c.autorizado, c.interessado,
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
  return c.json({ ...conv, coluna: colunaDe(conv.estado), mensagens, interesses: interesses.map((i) => i.termo), pedidos_resumo });
});

// ── Atendente humano assume ─────────────────────────────────────────────────────────
atendimento.post("/:id/assumir", async (c) => {
  const b = await c.req.json<{ responsavel?: string }>().catch(() => ({}) as Record<string, string>);
  const resp = (b.responsavel || "").trim() || "Atendente";
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE atend_conversas SET estado='atendimento-humano', responsavel=?, atualizado_em=datetime('now') WHERE id=?").bind(resp, id).run();
  await addMsg(c.env, id, "out", "sistema", "sistema", `${resp} assumiu o atendimento.`);
  // Apresenta o atendente pro cliente.
  const conv = await c.env.DB.prepare("SELECT telefone FROM atend_conversas WHERE id=?").bind(id).first<{ telefone: string }>();
  if (conv) {
    const aviso = `Olá! 👋 Aqui é *${resp}* da *Big Tricot*, vou continuar seu atendimento por aqui. 😊`;
    await addMsg(c.env, id, "out", resp, "texto", aviso);
    await enviarWhatsapp(c.env, conv.telefone, { tipo: "texto", texto: aviso });
    await c.env.DB.prepare("UPDATE atend_conversas SET ultima_out_em=datetime('now') WHERE id=?").bind(id).run();
  }
  return c.json({ ok: true });
});

// ── Sugestão de resposta por IA (o vendedor edita antes de enviar) ────────────────
atendimento.post("/:id/sugerir", async (c) => {
  const id = c.req.param("id");
  const conv = await c.env.DB.prepare("SELECT nome FROM atend_conversas WHERE id=?").bind(id).first<{ nome: string | null }>();
  if (!conv) return c.json({ error: "conversa não encontrada" }, 404);
  const { results } = await c.env.DB.prepare(
    "SELECT direcao, texto FROM atend_mensagens WHERE conversa_id=? AND tipo<>'sistema' ORDER BY criado_em DESC, rowid DESC LIMIT 12"
  ).bind(id).all<{ direcao: string; texto: string | null }>();
  const hist = results.reverse().map((m) => `${m.direcao === "in" ? "Cliente" : "Atendente"}: ${m.texto || ""}`).join("\n");
  try {
    const sys = "Você é vendedor(a) da Big Tricot, atacado de tricô para o lar (mantas, capas, almofadas), atendendo LOJISTAS pelo WhatsApp. Sugira a PRÓXIMA resposta do atendente: curta (até 2 frases), calorosa e natural em português do Brasil, no máximo 1 emoji. NUNCA invente preços, prazos ou promoções. Responda apenas com a mensagem sugerida, sem aspas.";
    const usr = `Conversa até agora:\n${hist || "(sem histórico)"}\n\nEscreva a próxima resposta do atendente${conv.nome ? ` para ${conv.nome}` : ""}.`;
    const r = (await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 160,
    })) as { response?: string };
    const sug = (r?.response || "").trim().replace(/^["']+|["']+$/g, "");
    if (!sug) return c.json({ error: "não consegui sugerir agora" }, 503);
    return c.json({ sugestao: sug });
  } catch {
    return c.json({ error: "IA indisponível no momento" }, 503);
  }
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
// ── Sincroniza o status do pedido com a conversa (chamado pelo cron) ──────────────
// Detecta o marco do pedido mais recente do cliente (realizado → faturado → enviado)
// e, quando avança, move a conversa e avisa o cliente. Não repete marco já avisado e
// NÃO dispara em massa por pedidos antigos (baseline silencioso no 1º vínculo).
const MARCO_ORDEM: Record<string, number> = { realizado: 1, faturado: 2, enviado: 3, "pos-venda": 4, recompra: 5 };

// Horário comercial (Brasil UTC-3): sem madrugada, sem domingo (salvo config).
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
