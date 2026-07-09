// Motor do robô de atendimento (triagem no WhatsApp) — máquina de estados PURA:
// recebe a conversa + o texto do cliente e devolve o novo estado e as respostas.
// Não fala com banco nem com provedor — isso fica no route. Assim é testável.

export type EstadoAtend =
  | "novo" | "aguardando-setor" | "triagem-nome" | "aguardando-cnpj"
  | "aguardando-cidade-parceiro" | "catalogo-enviado" | "follow-up-24h"
  | "atendimento-humano" | "nao-qualificado" | "indicado-parceiro";

export interface Conversa {
  estado: EstadoAtend;
  nome?: string | null;
  setor?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lojista?: number | null;
}

export interface Saida { tipo: "texto" | "arquivo" | "sistema"; texto: string }
export interface LojaParceira { nome: string; cidade: string | null; uf: string | null; whatsapp: string | null; instagram?: string | null; ativo?: boolean; freq?: boolean }
export interface Deps {
  // Consulta se o CNPJ é lojista (SINTEGRA / base própria). Retorna lojista true/false.
  sintegra: (cnpjDigitos: string) => Promise<{ lojista: boolean; fonte?: string }>;
  // Busca lojas parceiras perto da cidade/UF (prioriza ativas e frequentes).
  parceiros: (cidade: string | null, uf: string | null) => Promise<LojaParceira[]>;
}
export interface Resultado { conv: Conversa; saidas: Saida[]; notificarHumano: boolean; qualificado: boolean }

// ── Colunas do board (na ordem) + mapeamento estado → coluna ────────────────────
export const ATEND_COLUNAS = [
  { id: "primeiro-contato", label: "Primeiro contato", cor: "#3b82f6" },
  { id: "aguardando-setor", label: "Aguardando setor", cor: "#8b5cf6" },
  { id: "triagem-vendas", label: "Triagem de vendas", cor: "#f59e0b" },
  { id: "aguardando-cnpj", label: "Aguardando CNPJ", cor: "#0ea5e9" },
  { id: "catalogo-enviado", label: "Catálogo enviado", cor: "#22c55e" },
  { id: "follow-up-24h", label: "Follow-up 24h", cor: "#eab308" },
  { id: "atendimento-humano", label: "Atendimento humano", cor: "#6366f1" },
  { id: "nao-qualificado", label: "Não qualificado", cor: "#ef4444" },
  { id: "indicado-parceiro", label: "Consumidor → loja parceira", cor: "#14b8a6" },
] as const;

export function colunaDe(estado: string): string {
  switch (estado) {
    case "novo": return "primeiro-contato";
    case "aguardando-setor": return "aguardando-setor";
    case "triagem-nome": return "triagem-vendas";
    case "aguardando-cnpj": return "aguardando-cnpj";
    case "catalogo-enviado": return "catalogo-enviado";
    case "follow-up-24h": return "follow-up-24h";
    case "atendimento-humano": return "atendimento-humano";
    case "aguardando-cidade-parceiro": return "nao-qualificado";
    case "nao-qualificado": return "nao-qualificado";
    case "indicado-parceiro": return "indicado-parceiro";
    default: return "primeiro-contato";
  }
}

// ── Mensagens ───────────────────────────────────────────────────────────────────
const BOAS_VINDAS =
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
  const lojas = await deps.parceiros(conv.cidade ?? null, conv.uf ?? null);
  if (lojas.length) {
    saidas.push({ tipo: "texto", texto: "Achei essas lojas parceiras pertinho de você: 👇" });
    for (const l of lojas.slice(0, 3)) saidas.push({ tipo: "texto", texto: cardLoja(l) });
    saidas.push({ tipo: "texto", texto: "Elas vão te atender super bem! Qualquer coisa, é só chamar. 😊" });
  } else {
    saidas.push({ tipo: "texto", texto: `No momento não achei uma loja parceira pertinho de ${conv.cidade || "você"}. 😕 Assim que abrir uma, te aviso!` });
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
      push(BOAS_VINDAS);
      conv.estado = "aguardando-setor";
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
      if (digitos.length !== 14) {
        // sem CNPJ / recusa → trilha de não-lojista
        push(NAO_LOJISTA);
        if (conv.cidade && conv.uf) return await indicar(conv, saidas, deps);
        conv.estado = "aguardando-cidade-parceiro";
        break;
      }
      conv.cnpj = formatCnpj(digitos);
      const r = await deps.sintegra(digitos);
      if (r.lojista) {
        conv.lojista = 1;
        push("Show! Confirmei aqui que você é lojista. ✅\nJá vou te mandar nosso catálogo. 📒");
        saidas.push({ tipo: "arquivo", texto: "Catálogo Big Tricot 2026.pdf" });
        push("Um dos nossos vendedores já vai assumir a conversa pra montar seu pedido. 🚀");
        conv.estado = "catalogo-enviado";
        notificarHumano = true;
        qualificado = true;
      } else {
        conv.lojista = 0;
        push(NAO_LOJISTA);
        if (conv.cidade && conv.uf) return await indicar(conv, saidas, deps);
        conv.estado = "aguardando-cidade-parceiro";
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
      if (conv.estado === "catalogo-enviado" || conv.estado === "follow-up-24h") notificarHumano = true;
      break;
  }

  return { conv, saidas, notificarHumano, qualificado };
}

// Mensagem de retomada do follow-up 24h (disparada pelo cron).
export const FOLLOWUP_24H =
  "Oi, tudo bem? 😊 Passando pra saber se conseguiu olhar nosso catálogo. Posso te ajudar com modelos, valores ou montagem do pedido?";
