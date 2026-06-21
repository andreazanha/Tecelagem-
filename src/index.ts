import { Hono } from "hono";
import { cors } from "hono/cors";
import { pedidos } from "./routes/pedidos";
import { clientes } from "./routes/clientes";
import { modelos, cores, tasseis, prestadores, costura, operadores } from "./routes/catalogo";
import { producao } from "./routes/producao";
import { dashboard } from "./routes/dashboard";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
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
app.route("/api/producao", producao);
app.route("/api/dashboard", dashboard);

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

export default app;
