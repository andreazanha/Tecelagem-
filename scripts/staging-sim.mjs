#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SIMULADOR DO STAGING — Syntech (ERP) e WhatsApp recebido.
//
// Este script NÃO faz parte do Worker: ele apenas CHAMA os endpoints de
// integração que já existem (os mesmos que a ponte real usaria), apontando para
// a URL do STAGING e usando o token de staging. Não toca em produção.
//
// A simulação testa o NOSSO lado (reserva, prazos, pop-ups, liberação). Ela NÃO
// prova o comportamento real do Syntech — a validação D2 segue pendente.
//
// Uso:
//   node scripts/staging-sim.mjs <comando> [args]
//
// Variáveis de ambiente:
//   STAGING_URL    = https://rolagem-de-fase-staging.<subdominio>.workers.dev
//   STAGING_TOKEN  = o INTEGRACAO_TOKEN do staging (default: staging-sim-token-trocar)
//
// Comandos:
//   estoque <ref> <cor> <tamanho> <saldo>      ajusta o estoque espelhado de uma peça
//   pedido-pcp <numero> <cliente>              Evento 2: entra pedido novo do ERP → pop-up PCP
//   recebido <pedidoId> <numero>               Evento 1: "recebido no Syntech" → encerra prazo
//   erro <pedidoId> [mensagem]                 a ponte falhou ao gravar o pedido
//   whatsapp-in <telefone> <texto>             simula mensagem RECEBIDA no WhatsApp (ex.: "12")
//
// ORDEM DO FLUXO REAL (ver FLUXO-PEDIDO-ERP.md): a ponte grava no Syntech (recebido),
// o Syntech APROVA, e SÓ ENTÃO o pedido volta para "Pedidos do ERP" / "Para conferir".
// Logo, simule nesta ordem: 1) recebido  →  2) pedido-pcp (pedido aprovado que retornou).
//
// Exemplos:
//   STAGING_URL=https://...workers.dev node scripts/staging-sim.mjs estoque ED01C Marinho 45X45 1
//   ... node scripts/staging-sim.mjs recebido <id-do-pedido> 90001
//   ... node scripts/staging-sim.mjs whatsapp-in 5500000000011 12
// ─────────────────────────────────────────────────────────────────────────────

const BASE = (process.env.STAGING_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.STAGING_TOKEN || "staging-sim-token-trocar";
const [cmd, ...args] = process.argv.slice(2);

if (!BASE) {
  console.error("Defina STAGING_URL (a URL do worker de staging). Abortando — nada foi enviado.");
  process.exit(1);
}
// Trava de segurança: recusa apontar para um host de produção.
if (!/staging/i.test(BASE)) {
  console.error(`STAGING_URL não parece ser de staging (${BASE}). Por segurança, abortando.`);
  process.exit(1);
}

async function post(path, body, withToken = true) {
  const headers = { "Content-Type": "application/json" };
  if (withToken) headers["X-Integracao-Token"] = TOKEN;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await res.text();
  let out; try { out = JSON.parse(txt); } catch { out = txt; }
  console.log(`${res.status} ${path} →`, out);
  if (!res.ok) process.exitCode = 1;
  return out;
}

async function main() {
  switch (cmd) {
    case "estoque": {
      const [ref, cor, tamanho, saldo] = args;
      if (!ref || !cor || !tamanho || saldo == null) throw new Error("uso: estoque <ref> <cor> <tamanho> <saldo>");
      return post("/api/integracao/estoque", { itens: [{ ref, cor, tamanho, saldo: Number(saldo), unidade: "UN" }] });
    }
    case "pedido-pcp": {
      const [numero, ...nome] = args;
      if (!numero) throw new Error("uso: pedido-pcp <numero> <cliente>");
      return post("/api/integracao/pedido", {
        numero, cliente: { nome: nome.join(" ") || "Cliente Teste" }, vendedor: "Rogério",
        data: new Date().toISOString().slice(0, 10),
        itens: [{ produto: "ALMOFADA MODELO TESTE A", ref: "ED01A", cor: "Off-White", tamanho: "45X45", qtd: 2 }],
      });
    }
    case "recebido": {
      const [id, numero] = args;
      if (!id || !numero) throw new Error("uso: recebido <pedidoId> <numero>");
      return post("/api/integracao/pedido-erp-gravado", { id, numero_erp: Number(numero) });
    }
    case "erro": {
      const [id, ...msg] = args;
      if (!id) throw new Error("uso: erro <pedidoId> [mensagem]");
      return post("/api/integracao/pedido-erp-erro", { id, erro: msg.join(" ") || "falha simulada" });
    }
    case "whatsapp-in": {
      const [phone, ...texto] = args;
      if (!phone || !texto.length) throw new Error("uso: whatsapp-in <telefone> <texto>");
      // Formato ReceivedCallback (Z-API). SEM token: o webhook é público. Nada é ENVIADO
      // (zapi_ativo=0); isto só simula uma mensagem que CHEGOU.
      return post("/api/atendimento/webhook", { type: "ReceivedCallback", phone, text: { message: texto.join(" ") } }, false);
    }
    default:
      console.log("Comandos: estoque | pedido-pcp | recebido | erro | whatsapp-in");
      console.log("Rode sem argumentos para ver o cabeçalho deste arquivo.");
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
