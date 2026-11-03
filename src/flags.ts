// ─────────────────────────────────────────────────────────────────────────────
// INTERRUPTORES DO NOVO SISTEMA (feature flags do servidor).
//
// Três funções novas, controladas por chaves na tabela `config`. Regra de ouro:
// SEGURO POR PADRÃO. Uma função só liga quando o valor é EXATAMENTE "1". Ausente,
// vazio, "0", qualquer outro texto, ou erro de leitura → DESLIGADO. Assim a
// produção (que não tem essas chaves) roda igual a antes, sem ativação acidental.
//
// O WhatsApp continua com o controle JÁ existente (`zapi_ativo`), lido no próprio
// enviarWhatsapp — não é repetido aqui de propósito.
//
// A validação é SEMPRE no servidor (estes gates), nunca só na interface.
// ─────────────────────────────────────────────────────────────────────────────
import type { Env } from "./index";

export const FLAG_RESERVAS = "reservas_ativo";    // reserva automática de estoque no carrinho/checkout
export const FLAG_PCP_POPUP = "pcp_popup_ativo";   // pop-up "Para conferir" no PCP (pedido novo do ERP)
export const FLAG_CRM_POPUP = "crm_popup_ativo";   // pop-up individual "seu cliente fez um pedido" no CRM

// true SOMENTE quando config.<chave> == "1" (após trim). Qualquer outro caso → false.
// Nunca lança: em erro de banco, devolve false (desligado) — o lado seguro.
export async function flagLigado(env: Env, chave: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare("SELECT valor FROM config WHERE chave=? LIMIT 1").bind(chave).first<{ valor: string | null }>();
    return String(row?.valor ?? "").trim() === "1";
  } catch {
    return false;
  }
}
