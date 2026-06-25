// Rotas de Web Push: chave pública (para o navegador inscrever), inscrever e
// desinscrever um aparelho. O envio em si fica em ../push-send.ts.
import { Hono } from "hono";
import type { Env } from "../index";

export const push = new Hono<{ Bindings: Env }>();

// O navegador precisa da chave pública VAPID para criar a inscrição.
push.get("/public-key", (c) => c.json({ key: c.env.VAPID_PUBLIC || "" }));

push.post("/subscribe", async (c) => {
  const b = await c.req
    .json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>()
    .catch(() => ({}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } });
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) return c.json({ error: "inscrição inválida" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`
  )
    .bind(b.endpoint, b.keys.p256dh, b.keys.auth, c.req.header("user-agent") || "")
    .run();
  return c.json({ ok: true });
});

push.post("/unsubscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string }>().catch(() => ({}) as { endpoint?: string });
  if (b.endpoint) await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(b.endpoint).run();
  return c.json({ ok: true });
});
