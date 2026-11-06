// CATÁLOGO DIGITAL SEGURO — isolamento real das duas tabelas comerciais (Sul/SE/CO × Norte/NE).
//
// Regra: o navegador NUNCA recebe as duas tabelas. O servidor valida um token opaco, recalcula a
// REGIÃO pelo cadastro (loja_regiao prioritário; divergência com a UF → recusa) e entrega SÓ os
// preços da região autorizada. Mexer na URL não revela a outra tabela (a região vem do cadastro).
//
// Este arquivo tem só LÓGICA PURA + acesso à tabela catalogo_acessos (D1). Não lê o Firestore
// nem serve HTML — isso fica nas rotas. Assim dá pra testar o filtro e os tokens isoladamente.
import type { Env } from "./index";
import { cnpjValido } from "./atendimento_bot";

export type Regiao = "sul" | "norte";

// Estados Norte + Nordeste (Regra 2). Todo o resto (RS,SC,PR,SP,RJ,MG,ES,GO,MT,MS,DF) = Sul (Regra 1).
export const UF_NORTE = new Set([
  "AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE",
]);
export function regiaoDeUF(uf?: string | null): Regiao {
  return UF_NORTE.has(String(uf || "").trim().toUpperCase()) ? "norte" : "sul";
}

// Dados mínimos do cliente usados para autorizar e escolher a região.
export interface ClienteCat {
  id: string;
  nome?: string | null;
  cnpj?: string | null;
  uf?: string | null;
  loja_regiao?: string | null;
  bloqueado?: number | null;
  codigo_erp?: string | null;
}

// REGIÃO COMERCIAL do cliente (determinística — NUNCA vem do Llama nem da URL):
//  • tabela atribuída (loja_regiao = 'sul'/'norte') é PRIORITÁRIA;
//  • se há tabela atribuída E UF, e eles DIVERGEM → 'divergencia' (não envia nada → humano);
//  • sem tabela atribuída, usa a região da UF;
//  • sem tabela e sem UF → 'indefinida' (não envia nada → humano).
export type ResultadoRegiao =
  | { tipo: "ok"; regiao: Regiao }
  | { tipo: "divergencia"; atribuida: Regiao; porUf: Regiao }
  | { tipo: "indefinida" };
export function regiaoComercial(cli: ClienteCat): ResultadoRegiao {
  const lr = String(cli.loja_regiao || "").trim().toLowerCase();
  const atribuida: Regiao | null = lr === "sul" || lr === "norte" ? (lr as Regiao) : null;
  const uf = String(cli.uf || "").trim();
  const porUf: Regiao | null = uf ? regiaoDeUF(uf) : null;
  if (atribuida && porUf && atribuida !== porUf) return { tipo: "divergencia", atribuida, porUf };
  if (atribuida) return { tipo: "ok", regiao: atribuida };
  if (porUf) return { tipo: "ok", regiao: porUf };
  return { tipo: "indefinida" };
}

// Autorizado a receber catálogo: reconhecido + NÃO bloqueado + (tem código no ERP OU CNPJ válido).
export function autorizadoCatalogo(cli: ClienteCat): boolean {
  if (Number(cli.bloqueado || 0) === 1) return false;
  const temErp = String(cli.codigo_erp || "").trim() !== "";
  return temErp || cnpjValido(String(cli.cnpj || ""));
}

// FILTRO DE REGIÃO (o coração do isolamento). Remove, recursivamente, TODAS as chaves da OUTRA
// região: a chave base ('norte'/'sul') e qualquer chave terminada em '_norte'/'_sul'. Mantém só a
// região autorizada. Genérico de propósito: funciona mesmo para campos de preço que a gente não
// enumerou (valor_*, desconto_pct_*, etc.) e para estruturas futuras, sem deixar vazar a outra tabela.
// `regiao = null` → remove AS DUAS regiões (catálogo SEM preço, p/ tela de identificação).
export function filtrarRegiao<T>(valor: T, regiao: Regiao | null): T {
  const remover = regiao === "norte" ? "sul" : regiao === "sul" ? "norte" : null; // o que tirar
  const manter = regiao; // o que manter (null = tira os dois)
  const ehChaveDeRegiao = (k: string): "norte" | "sul" | null => {
    if (k === "norte" || k === "sul") return k;
    if (/_norte$/i.test(k)) return "norte";
    if (/_sul$/i.test(k)) return "sul";
    return null;
  };
  const anda = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(anda);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const reg = ehChaveDeRegiao(k);
        if (reg) {
          // chave de região: só mantém se for a região autorizada (manter). null → tira as duas.
          if (manter && reg === manter) out[k] = anda(x);
          // (reg === remover, ou manter === null) → NÃO copia (removida)
          continue;
        }
        out[k] = anda(x);
      }
      return out;
    }
    return v;
  };
  return anda(valor) as T;
}

// ── Tokens de acesso (D1: tabela catalogo_acessos) ────────────────────────────────────────────
// Token OPACO e aleatório (sem CNPJ/região/dado sensível). Toda a autorização mora no servidor.
export function gerarTokenOpaco(nbytes = 24): string {
  const a = new Uint8Array(nbytes);
  crypto.getRandomValues(a);
  let s = "";
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const VALIDADE_PADRAO_DIAS = 60;

// Emite um token novo para o cliente (validade em dias). Devolve o token.
export async function emitirTokenCatalogo(env: Env, clienteId: string, dias = VALIDADE_PADRAO_DIAS): Promise<string> {
  const token = gerarTokenOpaco();
  const d = Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : VALIDADE_PADRAO_DIAS;
  await env.DB.prepare(
    "INSERT INTO catalogo_acessos (token, cliente_id, criado_em, expira_em, revogado) VALUES (?, ?, datetime('now'), datetime('now', ?), 0)"
  ).bind(token, clienteId, `+${d} days`).run();
  return token;
}

// Valida o token: existe, NÃO revogado e NÃO expirado. Devolve o cliente_id ou null.
export async function validarTokenCatalogo(env: Env, token: string): Promise<{ clienteId: string } | null> {
  const t = String(token || "").trim();
  if (t.length < 16) return null;
  const row = await env.DB.prepare(
    "SELECT cliente_id FROM catalogo_acessos WHERE token=? AND revogado=0 AND expira_em > datetime('now') LIMIT 1"
  ).bind(t).first<{ cliente_id: string }>().catch(() => null);
  return row ? { clienteId: row.cliente_id } : null;
}

// Revoga um token específico (ou todos de um cliente).
export async function revogarTokenCatalogo(env: Env, token: string): Promise<void> {
  await env.DB.prepare("UPDATE catalogo_acessos SET revogado=1 WHERE token=?").bind(String(token || "")).run();
}
export async function revogarTokensDoCliente(env: Env, clienteId: string): Promise<void> {
  await env.DB.prepare("UPDATE catalogo_acessos SET revogado=1 WHERE cliente_id=?").bind(String(clienteId || "")).run();
}

// Núcleo canônico do telefone: DDD (2) + últimos 8 dígitos. Reconhece a mesma pessoa com/sem o
// 9º dígito e com/sem DDI 55. (Mesma ideia do atendimento, replicada aqui p/ o módulo ser isolado.)
export function nucleoTel(t: unknown): string {
  let d = String(t ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d;
}
