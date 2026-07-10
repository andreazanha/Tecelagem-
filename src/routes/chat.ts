// Chat interno da equipe: mensagens por canal (setor). Sem conexão persistente —
// o app atualiza por polling; badge de não lidas via /nao-lidas.
import { Hono } from "hono";
import type { Env } from "../index";

export const chat = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();

// Não lidas: mensagens depois de `desde` que NÃO são minhas (autor). Deve vir antes
// de /:canal para não ser capturado pelo parâmetro.
chat.get("/nao-lidas", async (c) => {
  const desde = c.req.query("desde") || "1970-01-01";
  const autor = c.req.query("autor") || "";
  const r = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chat_mensagens WHERE criado_em > ? AND autor <> ?"
  ).bind(desde, autor).first<{ n: number }>();
  return c.json({ nao_lidas: r?.n || 0 });
});

// Últimas 100 mensagens de um canal, em ordem cronológica.
chat.get("/:canal", async (c) => {
  const canal = c.req.param("canal");
  const { results } = await c.env.DB.prepare(
    "SELECT id, canal, autor, texto, criado_em FROM chat_mensagens WHERE canal = ? ORDER BY criado_em DESC LIMIT 100"
  ).bind(canal).all();
  return c.json(results.reverse());
});

// Envia uma mensagem para um canal.
chat.post("/:canal", async (c) => {
  const canal = c.req.param("canal");
  const b = await c.req.json<{ autor?: string; texto?: string }>().catch(() => ({}) as Record<string, unknown>);
  const autor = String(b.autor ?? "").trim() || "Anônimo";
  const texto = String(b.texto ?? "").trim();
  if (!texto) return c.json({ error: "mensagem vazia" }, 400);
  const id = uid();
  await c.env.DB.prepare("INSERT INTO chat_mensagens (id, canal, autor, texto) VALUES (?, ?, ?, ?)")
    .bind(id, canal, autor, texto.slice(0, 2000)).run();
  return c.json({ id }, 201);
});
