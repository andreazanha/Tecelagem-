import { Hono } from "hono";
import { cors } from "hono/cors";
import { pedidos } from "./routes/pedidos";
import { clientes } from "./routes/clientes";
import { modelos, cores, tiposFio, tamanhos, tasseis, prestadores, costura, operadores, usuarios } from "./routes/catalogo";
import { producao } from "./routes/producao";
import { expedicao } from "./routes/expedicao";
import { romaneios } from "./routes/romaneios";
import { dashboard } from "./routes/dashboard";
import { push } from "./routes/push";
import { produtos, insumos, fornecedores, lembreteReposicao } from "./routes/produtos";
import { representantes, comercial } from "./routes/comercial";
import { funil } from "./routes/funil";
import { parceiros, vitrineHtml, cadastroHtml } from "./routes/parceiros";
import { materiais } from "./routes/materiais";
import { colecoes } from "./routes/colecoes";
import { chat } from "./routes/chat";
import { etiquetas } from "./routes/etiquetas";
import { atendimento, followupAtendimento, sincronizarPedidos, posVendaRecompra, prospeccaoCatalogo, processarCampanhas } from "./routes/atendimento";
import { assistente } from "./routes/assistente";
import { relatorios } from "./routes/relatorios";
import { tecelagem } from "./routes/tecelagem";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  // Service binding para o worker de atividade do catálogo (bt-atividade).
  // Necessário porque Worker→Worker no mesmo *.workers.dev dá 404 por fetch normal.
  ATIVIDADE?: Fetcher;
  // Web Push (notificação de pedido novo). Definidos em wrangler.jsonc › vars.
  VAPID_PUBLIC?: string;
  VAPID_JWK?: string;
  VAPID_SUBJECT?: string;
  // Digital Asset Links do app Android (TWA/PWABuilder) — preenchido quando o
  // instalador é gerado (fingerprint SHA-256). Ver wrangler.jsonc › vars.
  ASSETLINKS?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "rolagem-de-fase", ts: new Date().toISOString() })
);

app.route("/api/pedidos", pedidos);
app.route("/api/clientes", clientes);
app.route("/api/modelos", modelos);
app.route("/api/cores", cores);
app.route("/api/tipos-fio", tiposFio);
app.route("/api/tamanhos", tamanhos);
app.route("/api/materiais", materiais);
app.route("/api/colecoes", colecoes);
app.route("/api/chat", chat);
app.route("/api/etiquetas", etiquetas);
app.route("/api/tasseis", tasseis);
app.route("/api/prestadores", prestadores);
app.route("/api/costura", costura);
app.route("/api/operadores", operadores);
app.route("/api/usuarios", usuarios);
app.route("/api/producao", producao);
app.route("/api/expedicao", expedicao);
app.route("/api/romaneios", romaneios);
app.route("/api/dashboard", dashboard);
app.route("/api/push", push);
app.route("/api/produtos", produtos);
app.route("/api/insumos", insumos);
app.route("/api/fornecedores", fornecedores);
app.route("/api/representantes", representantes);
app.route("/api/comercial", comercial);
app.route("/api/funil", funil);
app.route("/api/parceiros", parceiros);
app.route("/api/atendimento", atendimento);
app.route("/api/assistente", assistente);
app.route("/api/relatorios", relatorios);
app.route("/api/tecelagem", tecelagem);

// Fallback: serve o SPA (assets estáticos do build do Vite).
// IMPORTANTE: como o worker intercepta todas as rotas e busca o asset por código,
// o arquivo _headers NÃO é aplicado. Então definimos o cache aqui:
//  - HTML (index.html / SPA): nunca cacheia → toda atualização chega na hora.
//  - /assets/* (nomes com hash): cache eterno e imutável.
// Digital Asset Links: liga o app Android (TWA gerado pelo PWABuilder) a este
// domínio, para abrir em tela cheia sem a barra do navegador. O conteúdo (com o
// fingerprint SHA-256 do instalador) é definido na var ASSETLINKS depois de gerar o APK.
app.get("/.well-known/assetlinks.json", (c) => {
  try { return c.json(c.env.ASSETLINKS ? JSON.parse(c.env.ASSETLINKS) : []); } catch { return c.json([]); }
});

// No subdomínio cadastro.bigtricot.com.br, a RAIZ serve direto o formulário de
// auto-cadastro da loja — assim o link fica limpo (só "cadastro.bigtricot.com.br",
// sem caminho). Só intercepta a raiz; /api, assets e o resto seguem normais.
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith("cadastro.") && url.pathname === "/") {
    return c.html(cadastroHtml(), 200, { "Cache-Control": "no-cache" });
  }
  await next();
});

// Vitrine pública de lojas parceiras (SEM login) — link que a Big manda pro consumidor
// final e que pode ser divulgado por fora. Aceita ?uf= e ?cidade= pra já filtrar.
app.get("/vitrine", async (c) => {
  const url = new URL(c.req.url);
  const html = await vitrineHtml(c.env, url.searchParams.get("uf") ?? undefined, url.searchParams.get("cidade") ?? undefined);
  return c.html(html, 200, { "Cache-Control": "no-cache" });
});

// Autocadastro público de loja parceira (link do convite enviado aos lojistas).
app.get("/cadastrar-loja", (c) => c.html(cadastroHtml(), 200, { "Cache-Control": "no-cache" }));

app.all("*", async (c) => {
  let res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = "/index.html";
    res = await c.env.ASSETS.fetch(new Request(url.toString(), { headers: c.req.raw.headers }));
  }
  const ct = res.headers.get("content-type") || "";
  const path = new URL(c.req.url).pathname;
  res = new Response(res.body, res);
  if (ct.includes("text/html")) {
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  } else if (path.startsWith("/assets/")) {
    res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return res;
});

// Worker: além do fetch (SPA + API), um handler AGENDADO (cron) que relembra as
// reposições pendentes por push — "várias vezes até o pedido ser gerado".
export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx),
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    // Cron frequente (a cada 5 min): só as campanhas — dispara aos poucos, sem banir.
    if (event.cron === "*/5 * * * *") { ctx.waitUntil(processarCampanhas(env)); return; }
    ctx.waitUntil(lembreteReposicao(env));
    ctx.waitUntil(followupAtendimento(env)); // retomada 24h do robô de atendimento
    ctx.waitUntil(sincronizarPedidos(env));  // status do pedido → conversa (realizado/faturado/enviado)
    ctx.waitUntil(posVendaRecompra(env));    // pós-venda e recompra por tempo
    ctx.waitUntil(prospeccaoCatalogo(env));  // reativação: catálogo X dias após o faturamento
    ctx.waitUntil(processarCampanhas(env));  // também nos crons diários (garantia)
    // (desativado a pedido) lerAtividadeCatalogo — quem só VÊ o catálogo NÃO vira lead aqui.
  },
};
