// Motor do robô de atendimento (triagem no WhatsApp) — máquina de estados PURA:
// recebe a conversa + o texto do cliente e devolve o novo estado e as respostas.
// Não fala com banco nem com provedor — isso fica no route. Assim é testável.

export type EstadoAtend =
  | "novo" | "menu" | "ia-triagem" | "aguardando-setor" | "triagem-nome" | "aguardando-cnpj"
  | "aguardando-cidade-parceiro" | "catalogo-enviado" | "follow-up-24h"
  | "atendimento-humano" | "reclamacao" | "nao-qualificado" | "indicado-parceiro" | "sem-retorno"
  | "pedido-realizado" | "pedido-faturado" | "pedido-enviado" | "pos-venda" | "recompra";

export interface Conversa {
  estado: EstadoAtend;
  nome?: string | null;
  setor?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lojista?: number | null;
  // CRM Fase 1: contexto de identificação (preenchido pelo route antes de processar).
  origem?: string | null;                 // whatsapp | instagram | formulario | catalogo
  tipo?: string | null;                   // lojista | consumidor | representante | fornecedor | sem-identificacao
  representante?: string | null;          // representante responsável (nome)
  clienteConhecido?: boolean;             // true = telefone já está no cadastro de clientes
}

export interface Saida { tipo: "texto" | "arquivo" | "sistema"; texto: string }
export interface LojaParceira { nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; instagram?: string | null; ativo?: boolean; freq?: boolean }
export interface Deps {
  // Consulta o CNPJ (base própria → Receita/BrasilAPI). existe=achou o CNPJ,
  // ativa=situação cadastral ativa, nome=razão/fantasia, erro=falha na consulta
  // (nesse caso não bloqueia o lojista — manda catálogo e deixa pra conferência).
  consultarCnpj: (cnpjDigitos: string) => Promise<{ existe: boolean; ativa: boolean; nome: string | null; uf?: string | null; cidade?: string | null; erro?: boolean; fonte?: string }>;
  // Busca lojas parceiras perto da cidade/UF (prioriza ativas e frequentes).
  parceiros: (cidade: string | null, uf: string | null) => Promise<LojaParceira[]>;
  // URL da vitrine pública de lojas parceiras (link enviado ao consumidor final).
  vitrineUrl?: string | null;
  // Catálogo (configurado no CRM). Precedência: mensagem pronta > link (+senha) > placeholder.
  catalogoMsg?: string | null;   // mensagem completa colada pela loja (com link e senha)
  catalogoUrl?: string | null;
  catalogoSenha?: string | null;
}

// Monta o envio do catálogo. 1º usa a mensagem pronta da loja (se houver); senão
// monta link+senha; senão, o placeholder antigo (modo teste sem nada configurado).
// Monta a mensagem do catálogo — que é VIRTUAL (link), nunca um PDF.
// Precedência: mensagem pronta > link (+senha) > aviso de que o vendedor envia.
export function montarCatalogo(deps: Deps): Saida[] {
  const url = (deps.catalogoUrl || "").trim();
  const senha = (deps.catalogoSenha || "").trim();
  const msg = (deps.catalogoMsg || "").trim();
  if (msg) {
    let txt = msg;
    // Se a mensagem colada NÃO tem link e existe um link configurado, anexa o link
    // (e a senha, se ainda não estiver no texto). Assim o link sempre chega ao cliente.
    if (url && !/https?:\/\//i.test(msg)) {
      txt += `\n\n${url}`;
      if (senha && !msg.toLowerCase().includes(senha.toLowerCase())) txt += `\n🔑 Senha: *${senha}*`;
    }
    return [{ tipo: "texto", texto: txt }];
  }
  if (url) {
    let txt = `📒 Nosso catálogo é digital, dá uma olhada aqui:\n${url}`;
    if (senha) txt += `\n\n🔑 Senha de acesso: *${senha}*`;
    return [{ tipo: "texto", texto: txt }];
  }
  // Sem catálogo configurado: não inventa PDF — avisa que o vendedor manda o acesso.
  return [{ tipo: "texto", texto: "Nosso catálogo é digital 💛 Já vou pedir pro nosso vendedor te enviar o acesso, tá?" }];
}

// Validação real do CNPJ (dígitos verificadores) — pega número errado/inventado.
export function cnpjValido(cnpj: string): boolean {
  const d = (cnpj || "").replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // todos os dígitos iguais
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i], 10) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d1 === parseInt(d[12], 10) && d2 === parseInt(d[13], 10);
}
export interface Resultado { conv: Conversa; saidas: Saida[]; notificarHumano: boolean; qualificado: boolean }

// ── Colunas do board (na ordem) + mapeamento estado → coluna ────────────────────
// Colunas do quadro de ATENDIMENTO: só o que precisa de ação NA CONVERSA.
// (Etapas de venda ficam no Funil.) A coluna de cada conversa é derivada do estado
// + responsável + últimas mensagens (ver colunaAtendimento em routes/atendimento.ts).
export const ATEND_COLUNAS = [
  { id: "triagem", label: "🟣 Triagem (chegando agora)", cor: "#8b5cf6" },
  { id: "aguardando-humano", label: "Aguardando atendimento humano", cor: "#f59e0b" },
  { id: "em-atendimento", label: "Em atendimento", cor: "#6366f1" },
  { id: "montando-pedido", label: "Montando pedido", cor: "#f97316" },
  { id: "aguardando-setor", label: "💰 Orçando", cor: "#a855f7" },
  { id: "contato-followup", label: "⏰ Contato follow-up", cor: "#3b82f6" },
  { id: "pendente", label: "📩 Recebeu catálogo — chamar novamente", cor: "#db2777" },
  { id: "campanha", label: "📣 Campanhas", cor: "#0ea5e9" },
  { id: "grupos", label: "👥 Grupos", cor: "#0891b2" },
  { id: "finalizado", label: "Atendimento finalizado", cor: "#22c55e" },
  { id: "reclamacao", label: "⚠️ Reclamação ou pendência", cor: "#ef4444" },
  { id: "cliente-final", label: "🏠 Cliente final", cor: "#14b8a6" },
] as const;

// Mapa simples estado → coluna (aproximação; o quadro usa colunaAtendimento, mais rico).
export function colunaDe(estado: string): string {
  switch (estado) {
    case "novo": case "menu": return "triagem";
    case "ia-triagem": case "triagem-vendas": case "triagem-nome": case "aguardando-cnpj": case "aguardando-cidade-parceiro": return "triagem";
    case "aguardando-setor": return "aguardando-setor";
    case "atendimento-humano": return "em-atendimento";
    case "reclamacao": return "reclamacao";                               // reclamação → coluna própria
    case "indicado-parceiro": case "aguardando-cidade-parceiro": return "cliente-final";   // consumidor final
    default: return "finalizado";
  }
}

// ── Mensagens ───────────────────────────────────────────────────────────────────
export const BOAS_VINDAS =
  "Olá! 👋 Aqui é o atendimento da *Big Tricot*.\nCom qual setor você quer falar?\n\n1️⃣ Vendas\n2️⃣ Financeiro\n3️⃣ Pós-venda\n4️⃣ Outros";
const MENU_REPETE = "Não entendi 😅. Responda com o número:\n1️⃣ Vendas  2️⃣ Financeiro  3️⃣ Pós-venda  4️⃣ Outros";
const NAO_LOJISTA =
  "Entendi! 💛 Hoje a Big Tricot atende *apenas lojistas e vendas no atacado* — mas posso te indicar uma *loja parceira* perto de você.\nMe diz sua *cidade e estado*?";
const SETOR_HUMANO: Record<string, string> = {
  financeiro: "Certo! Vou te passar para o nosso *Financeiro*. Um instante que já te respondem. 💬",
  "pos-venda": "Certo! Vou te passar para o *Pós-venda*. Um instante que já te respondem. 💬",
  outros: "Certo! Já vou chamar alguém do time pra te ajudar. Um instante. 💬",
};

function parseSetor(t: string): string | null {
  const s = t.trim().toLowerCase();
  if (/^1\b/.test(s) || /venda/.test(s)) return "vendas";
  if (/^2\b/.test(s) || /financ/.test(s)) return "financeiro";
  if (/^3\b/.test(s) || /p[óo]s|pos.?venda/.test(s)) return "pos-venda";
  if (/^4\b/.test(s) || /outro/.test(s)) return "outros";
  return null;
}
function parseCidadeUf(t: string): { cidade: string | null; uf: string | null } {
  const m = t.match(/^(.+?)[,\/\-–]\s*([A-Za-zÀ-ú]{2})\s*$/);
  if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  const uf = (t.match(/\b([A-Za-z]{2})\b\s*$/) || [])[1];
  const cidade = t.replace(/\b[A-Za-z]{2}\b\s*$/, "").replace(/[,\/\-–]\s*$/, "").trim();
  return { cidade: cidade || null, uf: uf ? uf.toUpperCase() : null };
}
function formatCnpj(d: string): string {
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}
function cardLoja(l: LojaParceira): string {
  const linhas = [`🏬 *${l.nome}*`, [l.cidade, l.uf].filter(Boolean).join("/")];
  const selos = [l.ativo ? "⭐ cliente ativa" : "", l.freq ? "🔁 compra frequente" : ""].filter(Boolean).join(" · ");
  if (selos) linhas.push(selos);
  const cont = [l.whatsapp ? `📲 ${l.whatsapp}` : "", l.instagram ? `📸 ${l.instagram}` : ""].filter(Boolean).join(" · ");
  if (cont) linhas.push(cont);
  return linhas.filter(Boolean).join("\n");
}

async function indicar(conv: Conversa, saidas: Saida[], deps: Deps): Promise<Resultado> {
  const uf = String(conv.uf ?? "").trim().toUpperCase();
  // Sem estado nem cidade → pergunta o estado e aguarda.
  if (!uf && !conv.cidade) {
    saidas.push({ tipo: "texto", texto: "Me diz de qual *estado* você é? Aí já te mando as lojas parceiras da Big Tricot da sua região. 😊" });
    conv.estado = "aguardando-cidade-parceiro";
    return { conv, saidas, notificarHumano: false, qualificado: false };
  }
  if (deps.vitrineUrl) {
    // Link da vitrine filtrado pelo ESTADO: a pessoa escolhe a cidade mais perto dela lá dentro.
    const q = new URLSearchParams();
    if (uf) q.set("uf", uf); else if (conv.cidade) q.set("cidade", String(conv.cidade));
    const link = deps.vitrineUrl + "?" + q.toString();
    saidas.push({ tipo: "texto", texto: `Prontinho! 💛 Abre esse link, escolha a *cidade mais perto de você* e veja os contatos das lojas parceiras 👇\n${link}` });
  } else {
    // Sem vitrine configurada → mostra os cards no chat (comportamento antigo).
    const lojas = await deps.parceiros(conv.cidade ?? null, conv.uf ?? null);
    if (lojas.length) {
      saidas.push({ tipo: "texto", texto: "Achei essas lojas parceiras pertinho de você: 👇" });
      for (const l of lojas.slice(0, 3)) saidas.push({ tipo: "texto", texto: cardLoja(l) });
    } else {
      saidas.push({ tipo: "texto", texto: `No momento não achei uma loja parceira pertinho de ${conv.cidade || "você"}. 😕 Assim que abrir uma, te aviso!` });
    }
  }
  conv.estado = "indicado-parceiro";
  return { conv, saidas, notificarHumano: false, qualificado: false };
}

// ── Motor ─────────────────────────────────────────────────────────────────────
export async function processar(conv0: Conversa, texto: string, deps: Deps): Promise<Resultado> {
  const conv: Conversa = { ...conv0 };
  const t = (texto || "").trim();
  const digitos = t.replace(/\D/g, "");
  const saidas: Saida[] = [];
  const push = (s: string) => saidas.push({ tipo: "texto", texto: s });
  let notificarHumano = false, qualificado = false;

  switch (conv.estado) {
    case "novo":
      if (conv.clienteConhecido) {
        // Já é cliente da base → atendimento comercial. Ainda NÃO promete um vendedor:
        // o encaminhamento ao representante passa por autorização da equipe.
        push(`Olá${conv.nome ? `, *${conv.nome}*` : ""}! 👋 Que bom te ver de novo na *Big Tricot* 💛\nJá já alguém do nosso time te atende. Me conta: como posso ajudar hoje? 😊`);
        conv.estado = "atendimento-humano";
        notificarHumano = true;
      } else {
        push(BOAS_VINDAS);
        conv.estado = "aguardando-setor";
      }
      break;

    case "aguardando-setor": {
      const setor = parseSetor(t);
      if (!setor) { push(MENU_REPETE); break; }
      conv.setor = setor;
      if (setor === "vendas") {
        push("Perfeito! Antes de te passar pro vendedor, preciso de uns dados rápidos. 😉\n\nQual o *nome da sua loja*?");
        conv.estado = "triagem-nome";
      } else {
        push(SETOR_HUMANO[setor]);
        conv.estado = "atendimento-humano";
        notificarHumano = true;
      }
      break;
    }

    case "triagem-nome":
      conv.nome = t.slice(0, 80);
      push("E o *CNPJ* da loja?");
      conv.estado = "aguardando-cnpj";
      break;

    case "aguardando-cnpj": {
      // Saída de emergência: pediu atendente/humano a qualquer momento.
      if (/atendente|humano|falar com|uma pessoa/i.test(t)) {
        push("Claro! Já chamo alguém do nosso time pra te atender. 💬");
        conv.estado = "atendimento-humano";
        notificarHumano = true;
        break;
      }
      // Poucos dígitos / "não tenho" → é consumidor final: trilha de loja parceira.
      if (digitos.length < 8) {
        push(NAO_LOJISTA);
        if (conv.cidade && conv.uf) return await indicar(conv, saidas, deps);
        conv.estado = "aguardando-cidade-parceiro";
        break;
      }
      // Tentou um CNPJ, mas os dígitos verificadores não batem → pede pra reenviar.
      if (!cnpjValido(digitos)) {
        push("Hmm, esse CNPJ não parece válido 🤔. Confere os números e me reenvia? (são *14 dígitos*)\n\nSe você *não tem CNPJ*, é só dizer que te indico uma loja parceira. 😉");
        break; // continua em aguardando-cnpj
      }
      conv.cnpj = formatCnpj(digitos);
      const r = await deps.consultarCnpj(digitos);
      if (r.erro) {
        // Consulta indisponível → não trava o lojista; confirma cadastro e PASSA PRO VENDEDOR (humano).
        // O catálogo/preço quem manda é o vendedor (o robô não envia).
        conv.lojista = 1;
        if (!conv.nome && r.nome) conv.nome = r.nome;
        push("Perfeito, cadastro anotado! ✅ Já vou te passar pra um dos nossos vendedores pra te atender e te enviar o catálogo com os valores, tá? 💛");
        conv.estado = "atendimento-humano";
        notificarHumano = true;
        qualificado = true;
      } else if (r.existe && r.ativa) {
        conv.lojista = 1;
        if (!conv.nome && r.nome) conv.nome = r.nome;
        if (r.uf && !conv.uf) conv.uf = r.uf;
        if (r.cidade && !conv.cidade) conv.cidade = r.cidade;
        push(`Show! Confirmei seu CNPJ${r.nome ? ` (*${r.nome}*)` : ""}. ✅ Cadastro feito!\nJá vou te passar pra um dos nossos vendedores pra te atender e te mandar o catálogo com os valores. 💛`);
        conv.estado = "atendimento-humano";
        notificarHumano = true;
        qualificado = true;
      } else if (r.existe && !r.ativa) {
        conv.lojista = 0;
        push("Encontrei seu CNPJ, mas ele consta como *não ativo* na Receita. 😕\nVou te passar pra um atendente conferir, tudo bem?");
        conv.estado = "atendimento-humano";
        notificarHumano = true;
      } else {
        // Passou nos dígitos, mas a Receita não achou → provável erro de digitação.
        push("Não encontrei esse CNPJ na base da Receita. 🤔 Pode conferir e me reenviar?\n\nSe preferir, digite *atendente* que eu chamo alguém do time.");
        break; // continua em aguardando-cnpj
      }
      break;
    }

    case "aguardando-cidade-parceiro": {
      const loc = parseCidadeUf(t);
      conv.cidade = loc.cidade || conv.cidade;
      conv.uf = loc.uf || conv.uf;
      return await indicar(conv, saidas, deps);
    }

    default:
      // Estados terminais / humano: o robô não responde sozinho. Se o cliente
      // respondeu enquanto aguardava (catálogo/follow-up), avisa o atendente.
      if (["catalogo-enviado", "follow-up-24h", "sem-retorno", "pedido-realizado", "pedido-faturado", "pedido-enviado", "pos-venda", "recompra"].includes(conv.estado)) notificarHumano = true;
      break;
  }

  return { conv, saidas, notificarHumano, qualificado };
}

// Mensagem de retomada do follow-up 24h (disparada pelo cron).
export const FOLLOWUP_24H =
  "Oi, tudo bem? 😊 Passando pra saber se conseguiu olhar nosso catálogo. Posso te ajudar com modelos, valores ou montagem do pedido?";
