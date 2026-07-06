import { Hono } from "hono";
import { cors } from "hono/cors";
import { pedidos } from "./routes/pedidos";
import { clientes } from "./routes/clientes";
import { modelos, cores, tasseis, prestadores, costura, operadores, usuarios } from "./routes/catalogo";
import { producao } from "./routes/producao";
import { expedicao } from "./routes/expedicao";
import { romaneios } from "./routes/romaneios";
import { dashboard } from "./routes/dashboard";
import { push } from "./routes/push";
import { produtos, insumos, lembreteReposicao } from "./routes/produtos";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  // Web Push (notificação de pedido novo). Definidos em wrangler.jsonc › vars.
  VAPID_PUBLIC?: string;
  VAPID_JWK?: string;
  VAPID_SUBJECT?: string;
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

// Fallback: serve o SPA (assets estáticos do build do Vite).
// IMPORTANTE: como o worker intercepta todas as rotas e busca o asset por código,
// o arquivo _headers NÃO é aplicado. Então definimos o cache aqui:
//  - HTML (index.html / SPA): nunca cacheia → toda atualização chega na hora.
//  - /assets/* (nomes com hash): cache eterno e imutável.
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
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(lembreteReposicao(env));
  },
};
