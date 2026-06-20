import { Hono } from "hono";
import { cors } from "hono/cors";
import { pedidos } from "./routes/pedidos";
import { clientes } from "./routes/clientes";
import { modelos, cores, tasseis, prestadores, costura } from "./routes/catalogo";

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

// Fallback: serve o SPA (assets estáticos do build do Vite).
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = "/index.html";
    return c.env.ASSETS.fetch(new Request(url.toString(), { headers: c.req.raw.headers }));
  }
  return res;
});

export default app;
