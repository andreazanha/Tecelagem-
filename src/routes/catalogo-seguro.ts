// CATÁLOGO DIGITAL SEGURO — rotas (Etapa 1: servido em URL de TESTE; produção intocada).
//
// Fluxo:
//  • GET  /api/catalogo/ver?t=TOKEN  → valida o token, recalcula a região do cadastro (com a regra
//        de divergência), lê catalogo/main NO SERVIDOR, remove a OUTRA tabela e serve a página com
//        os dados já filtrados injetados (window.__PREVIEW_DATA__ + __REGIAO__ + __CATALOGO_SEGURO__).
//        Sem token/ inválido/ não autorizado/ divergência/ região indefinida → tela de identificação
//        (profissional, SEM preço).
//  • POST /api/catalogo/identificar {whatsapp} → reconhece pelo telefone; 1 autorizado → emite token
//        e devolve a URL; vários → humano; nenhum/não autorizado → mensagem amigável.
//  • POST /api/catalogo/emitir  {cnpj|cliente_id} (admin) → gera o link com token (para a Big/testes).
//  • POST /api/catalogo/revogar {token|cliente_id} (admin) → revoga.
//
// NÃO altera o Firestore nem o catálogo real. Só LÊ catalogo/main (conta de serviço) e filtra.
import { Hono } from "hono";
import type { Env } from "../index";
import { SITE_FULL_HTML } from "../siteTemplateFull";
import { lerDocumento } from "../firestore";
import { exigirFuncao } from "../permissoes";
import {
  type ClienteCat, type Regiao,
  regiaoComercial, autorizadoCatalogo, filtrarRegiao,
  emitirTokenCatalogo, validarTokenCatalogo, revogarTokenCatalogo, revogarTokensDoCliente,
  nucleoTel, VALIDADE_PADRAO_DIAS,
} from "../catalogo-seguro";

export const catalogoSeguro = new Hono<{ Bindings: Env }>();

const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
// Limpa a coluna de telefone no SQL (tira pontuação) pra casar pelo sufixo.
const LIMPA = (col: string) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col},''),'.',''),'-',''),'(',''),')',''),' ','')`;

const CAMPOS_CLI = "id, nome, cnpj, uf, loja_regiao, COALESCE(bloqueado,0) AS bloqueado, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(whatsapp,'') AS whatsapp, COALESCE(telefone,'') AS telefone";

async function clientePorId(env: Env, id: string): Promise<(ClienteCat & { whatsapp: string; telefone: string }) | null> {
  return env.DB.prepare(`SELECT ${CAMPOS_CLI} FROM clientes WHERE id=? LIMIT 1`)
    .bind(id).first<ClienteCat & { whatsapp: string; telefone: string }>().catch(() => null);
}

// Reconhece pelo telefone (whatsapp E telefone), casando pelo núcleo DDD+8. Devolve TODOS os
// candidatos distintos — quem decide (1 / vários / nenhum) é o chamador.
async function clientesPorTelefone(env: Env, tel: string): Promise<(ClienteCat & { whatsapp: string; telefone: string })[]> {
  const core = digitos(tel).slice(-8);
  if (core.length < 8) return [];
  const nuc = nucleoTel(tel);
  const { results } = await env.DB.prepare(
    `SELECT ${CAMPOS_CLI} FROM clientes WHERE ${LIMPA("whatsapp")} LIKE '%' || ? OR ${LIMPA("telefone")} LIKE '%' || ?`
  ).bind(core, core).all<ClienteCat & { whatsapp: string; telefone: string }>().catch(() => ({ results: [] as (ClienteCat & { whatsapp: string; telefone: string })[] }));
  const vistos = new Set<string>();
  const out: (ClienteCat & { whatsapp: string; telefone: string })[] = [];
  for (const r of results || []) {
    if (nucleoTel(r.whatsapp) !== nuc && nucleoTel(r.telefone) !== nuc) continue; // confirma pelo núcleo
    if (vistos.has(r.id)) continue;
    vistos.add(r.id); out.push(r);
  }
  return out;
}

// Escapa o JSON pra embutir com segurança dentro de <script> (igual à prévia do catálogo).
function escJsonParaScript(obj: unknown): string {
  return JSON.stringify(obj).split("<").join("\\u003c").split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
}

// Serve a página REAL do catálogo com os dados JÁ FILTRADOS injetados + a região autoritativa.
function servirCatalogo(regiao: Regiao, dados: Record<string, unknown>): Response {
  const inject = `<script>window.__CATALOGO_SEGURO__=true;window.__REGIAO__=${JSON.stringify(regiao)};window.__PREVIEW_DATA__=${escJsonParaScript(dados)};</script>`;
  const html = SITE_FULL_HTML.includes("</head>") ? SITE_FULL_HTML.replace("</head>", inject + "</head>") : inject + SITE_FULL_HTML;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// Tela de identificação (links antigos / sem token / não autorizado). Simples e profissional,
// SEM preço. Pede o WhatsApp e, se reconhecer 1 cliente autorizado, redireciona pro catálogo.
function telaIdentificacao(motivo: string): Response {
  const msgs: Record<string, string> = {
    sem_token: "Para ver os preços, confirme seu WhatsApp cadastrado.",
    expirado: "Seu link expirou. Confirme seu WhatsApp para gerar um novo acesso.",
    nao_autorizado: "Não encontramos uma autorização ativa para este cadastro. Fale com a Big Tricot.",
    divergencia: "Precisamos confirmar sua tabela comercial. Já vamos te atender pelo WhatsApp.",
    indefinida: "Precisamos confirmar sua região. Já vamos te atender pelo WhatsApp.",
    varios: "Encontramos mais de um cadastro com esse número. Fale com a Big Tricot para confirmar.",
  };
  const aviso = msgs[motivo] || msgs.sem_token;
  const soAviso = motivo === "nao_autorizado" || motivo === "divergencia" || motivo === "indefinida" || motivo === "varios";
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Big Tricot — Catálogo</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f0ea;color:#2c2721;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border:1px solid #ece5d8;border-radius:18px;max-width:420px;width:100%;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.06);text-align:center}
.marca{font-weight:800;font-size:22px;color:#ad5033;letter-spacing:.5px}
.sub{font-size:12.5px;color:#8a8073;letter-spacing:1.5px;margin-top:2px;text-transform:uppercase}
h1{font-size:18px;margin:20px 0 6px}
p{font-size:14px;color:#6b645a;line-height:1.5;margin:0 0 18px}
input{width:100%;padding:12px 14px;border:1px solid #d9d2c6;border-radius:12px;font-size:16px;text-align:center}
button{width:100%;margin-top:12px;padding:12px 14px;border:0;border-radius:12px;background:#2c3e50;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
button:disabled{opacity:.6}
.msg{min-height:18px;font-size:13px;margin-top:12px}
.err{color:#b91c1c}.ok{color:#166534}
</style></head><body>
<div class="card">
  <div class="marca">Big Tricot</div><div class="sub">Catálogo de Atacado</div>
  <h1>${soAviso ? "Vamos te atender 💛" : "Confirme seu acesso"}</h1>
  <p>${aviso}</p>
  ${soAviso ? "" : `
  <input id="wa" type="tel" inputmode="tel" placeholder="Seu WhatsApp com DDD" autocomplete="tel">
  <button id="btn" type="button">Ver catálogo</button>
  <div class="msg" id="msg"></div>`}
</div>
<script>
(function(){
  var btn=document.getElementById("btn"); if(!btn) return;
  var wa=document.getElementById("wa"), msg=document.getElementById("msg");
  function enviar(){
    var num=(wa.value||"").replace(/\\D/g,"");
    if(num.length<10){ msg.className="msg err"; msg.textContent="Digite seu WhatsApp com DDD."; return; }
    msg.className="msg"; msg.textContent="Conferindo…"; btn.disabled=true;
    fetch("/api/catalogo/identificar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({whatsapp:num})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d&&d.status==="ok"&&d.url){ msg.className="msg ok"; msg.textContent="Tudo certo! Abrindo…"; location.href=d.url; return; }
        btn.disabled=false; msg.className="msg err";
        msg.textContent=(d&&d.msg)||"Não consegui confirmar. Fale com a Big Tricot.";
      })
      .catch(function(){ btn.disabled=false; msg.className="msg err"; msg.textContent="Sem conexão. Tente de novo."; });
  }
  btn.addEventListener("click",enviar);
  wa.addEventListener("keydown",function(e){ if(e.key==="Enter") enviar(); });
})();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// Decide a região e, se OK, serve o catálogo filtrado. Centraliza a regra (um lugar só).
async function servirParaCliente(env: Env, cli: ClienteCat): Promise<Response> {
  if (!autorizadoCatalogo(cli)) return telaIdentificacao("nao_autorizado");
  const rr = regiaoComercial(cli);
  if (rr.tipo === "divergencia") return telaIdentificacao("divergencia");
  if (rr.tipo === "indefinida") return telaIdentificacao("indefinida");
  let doc: Record<string, unknown> | null = null;
  try { doc = await lerDocumento(env, "catalogo/main"); } catch { doc = null; }
  if (!doc) return telaIdentificacao("sem_token"); // sem dados → não arrisca; cai na identificação
  const dados = filtrarRegiao(doc, rr.regiao);
  return servirCatalogo(rr.regiao, dados);
}

// DIAGNÓSTICO (público, só contagens — sem preço): confirma o que o servidor LÊ do catalogo/main
// (quantos produtos, quantos têm foto, e o domínio da primeira foto). Serve pra achar o "sem foto".
catalogoSeguro.get("/diag", async (c) => {
  let doc: Record<string, unknown> | null = null;
  let erro = "";
  try { doc = await lerDocumento(c.env, "catalogo/main"); } catch (e) { erro = String((e as Error).message || e); }
  const prods = Array.isArray((doc as { produtos?: unknown })?.produtos) ? ((doc as { produtos: unknown[] }).produtos) : [];
  const temFoto = (p: unknown) => !!p && typeof (p as { foto?: unknown }).foto === "string" && String((p as { foto: string }).foto).trim() !== "";
  const comFoto = prods.filter(temFoto).length;
  const amostra = prods.find(temFoto) as { foto?: string } | undefined;
  let dominio = "";
  try { dominio = amostra?.foto ? new URL(String(amostra.foto)).host : ""; } catch { dominio = amostra?.foto ? String(amostra.foto).slice(0, 40) : ""; }
  const chaves = prods[0] && typeof prods[0] === "object" ? Object.keys(prods[0] as object).slice(0, 25) : [];
  return c.json({
    leu_documento: !!doc, erro: erro || undefined,
    produtos: prods.length, com_foto: comFoto, foto_dominio: dominio,
    chaves_do_primeiro_produto: chaves,
    tem_edicao_limitada: !!(doc as { edicao_limitada?: unknown })?.edicao_limitada,
  });
});

// ── Rotas ──────────────────────────────────────────────────────────────────────────────────────
catalogoSeguro.get("/ver", async (c) => {
  const token = String(c.req.query("t") || "").trim();
  if (!token) return telaIdentificacao("sem_token");
  const val = await validarTokenCatalogo(c.env, token);
  if (!val) return telaIdentificacao("expirado");
  const cli = await clientePorId(c.env, val.clienteId);
  if (!cli) return telaIdentificacao("nao_autorizado");
  return servirParaCliente(c.env, cli);
});

catalogoSeguro.post("/identificar", async (c) => {
  const b = await c.req.json<{ whatsapp?: string }>().catch(() => ({} as { whatsapp?: string }));
  const tel = digitos(b.whatsapp);
  if (tel.length < 10) return c.json({ status: "erro", msg: "Informe um WhatsApp com DDD." }, 400);
  const cands = await clientesPorTelefone(c.env, tel);
  if (cands.length === 0) return c.json({ status: "nao_encontrado", msg: "Não encontramos seu cadastro. Fale com a Big Tricot." });
  if (cands.length > 1) return c.json({ status: "varios", msg: "Há mais de um cadastro com esse número. Fale com a Big Tricot." });
  const cli = cands[0];
  if (!autorizadoCatalogo(cli)) return c.json({ status: "nao_autorizado", msg: "Seu cadastro não tem autorização ativa. Fale com a Big Tricot." });
  const token = await emitirTokenCatalogo(c.env, cli.id, VALIDADE_PADRAO_DIAS);
  return c.json({ status: "ok", url: `/api/catalogo/ver?t=${encodeURIComponent(token)}` });
});

// ADMIN: gera o link com token p/ um cliente (por CNPJ ou id). Serve p/ a Big e p/ os testes.
catalogoSeguro.post("/emitir", async (c) => {
  const g = await exigirFuncao(c, "clientes.aprovar"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ cnpj?: string; cliente_id?: string; dias?: number }>().catch(() => ({} as { cnpj?: string; cliente_id?: string; dias?: number }));
  let cli: (ClienteCat & { whatsapp: string; telefone: string }) | null = null;
  if (b.cliente_id) cli = await clientePorId(c.env, String(b.cliente_id));
  else if (b.cnpj) {
    const cnpjDig = digitos(b.cnpj);
    cli = await c.env.DB.prepare(`SELECT ${CAMPOS_CLI} FROM clientes WHERE ${LIMPA("cnpj")} = ? LIMIT 1`)
      .bind(cnpjDig).first<ClienteCat & { whatsapp: string; telefone: string }>().catch(() => null);
  } else return c.json({ error: "informe_cnpj_ou_id" }, 400);
  if (!cli) return c.json({ error: "cliente_nao_encontrado" }, 404);
  const rr = regiaoComercial(cli);
  const token = await emitirTokenCatalogo(c.env, cli.id, Number(b.dias) || VALIDADE_PADRAO_DIAS);
  const origin = new URL(c.req.url).origin;
  return c.json({
    ok: true, nome: cli.nome || "", cliente_id: cli.id,
    autorizado: autorizadoCatalogo(cli),
    regiao: rr.tipo === "ok" ? rr.regiao : rr.tipo,
    url: `${origin}/api/catalogo/ver?t=${encodeURIComponent(token)}`,
  });
});

// ADMIN: revoga um token específico OU todos de um cliente.
catalogoSeguro.post("/revogar", async (c) => {
  const g = await exigirFuncao(c, "clientes.aprovar"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ token?: string; cliente_id?: string }>().catch(() => ({} as { token?: string; cliente_id?: string }));
  if (b.token) { await revogarTokenCatalogo(c.env, String(b.token)); return c.json({ ok: true, revogado: "token" }); }
  if (b.cliente_id) { await revogarTokensDoCliente(c.env, String(b.cliente_id)); return c.json({ ok: true, revogado: "cliente" }); }
  return c.json({ error: "informe_token_ou_cliente_id" }, 400);
});
