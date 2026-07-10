// Chat interno da equipe: canais por setor + mensagens diretas (dm:A|B), foto (R2),
// @menção e push direcionado. Sem conexão persistente — o app atualiza por polling.
import { Hono } from "hono";
import type { Env } from "../index";
import { enviarPushPara } from "../push-send";

export const chat = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();

// Contatos para iniciar uma conversa direta (usuários + operadores, sem repetir).
chat.get("/contatos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT DISTINCT nome FROM (SELECT nome FROM usuarios UNION SELECT nome FROM operadores) WHERE nome IS NOT NULL AND nome <> '' ORDER BY nome"
  ).all<{ nome: string }>().catch(() => ({ results: [] as { nome: string }[] }));
  return c.json(results.map((r) => r.nome));
});

// Conversas diretas em que "me" participa (canal dm:A|B) — para montar as abas.
chat.get("/dms", async (c) => {
  const me = (c.req.query("me") || "").trim();
  const { results } = await c.env.DB.prepare(
    "SELECT DISTINCT canal FROM chat_mensagens WHERE canal LIKE 'dm:%'"
  ).all<{ canal: string }>();
  const out: { canal: string; outro: string }[] = [];
  for (const r of results) {
    const partes = r.canal.slice(3).split("|");
    if (partes.includes(me)) out.push({ canal: r.canal, outro: partes.find((p) => p !== me) || partes[0] });
  }
  return c.json(out);
});

// Não lidas: mensagens depois de `desde` que NÃO são minhas.
chat.get("/nao-lidas", async (c) => {
  const desde = c.req.query("desde") || "1970-01-01";
  const autor = c.req.query("autor") || "";
  const r = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chat_mensagens WHERE criado_em > ? AND autor <> ?"
  ).bind(desde, autor).first<{ n: number }>();
  return c.json({ nao_lidas: r?.n || 0 });
});

// Serve a foto de uma mensagem (R2). imagem_key = id; chave no bucket = chat/<id>.
chat.get("/foto/:id", async (c) => {
  const obj = await c.env.BUCKET.get(`chat/${c.req.param("id")}`);
  if (!obj) return c.json({ error: "sem foto" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
});

// Últimas 100 mensagens de um canal, em ordem cronológica.
chat.get("/:canal", async (c) => {
  const canal = c.req.param("canal");
  const { results } = await c.env.DB.prepare(
    "SELECT id, canal, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE canal = ? ORDER BY criado_em DESC LIMIT 100"
  ).bind(canal).all();
  return c.json(results.reverse());
});

// Notifica destinatário de DM + mencionados (@Nome), menos o autor. Best-effort.
async function notificar(env: Env, waitUntil: ((p: Promise<unknown>) => void) | undefined, canal: string, autor: string, resumo: string) {
  try {
    const alvos: string[] = [];
    if (canal.startsWith("dm:")) alvos.push(...canal.slice(3).split("|").filter((p) => p && p !== autor));
    if (resumo.includes("@")) {
      const { results } = await env.DB.prepare(
        "SELECT DISTINCT nome FROM (SELECT nome FROM usuarios UNION SELECT nome FROM operadores) WHERE nome IS NOT NULL AND nome <> ''"
      ).all<{ nome: string }>();
      for (const r of results) if (r.nome !== autor && resumo.includes("@" + r.nome)) alvos.push(r.nome);
    }
    if (!alvos.length) return;
    const p = enviarPushPara(env, alvos, { titulo: `💬 ${autor}`, corpo: resumo.slice(0, 120), url: "/", tag: "chat" }).catch(() => {});
    if (waitUntil) waitUntil(p); else await p;
  } catch { /* push é best-effort */ }
}
const waitUntilDe = (c: { executionCtx?: { waitUntil?: (p: Promise<unknown>) => void } }) => {
  try { const ctx = c.executionCtx; return ctx && typeof ctx.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : undefined; }
  catch { return undefined; } // fora do Worker (testes) o getter lança
};

// Envia mensagem de texto.
chat.post("/:canal", async (c) => {
  const canal = c.req.param("canal");
  const b = await c.req.json<{ autor?: string; texto?: string }>().catch(() => ({}) as Record<string, unknown>);
  const autor = String(b.autor ?? "").trim() || "Anônimo";
  const texto = String(b.texto ?? "").trim();
  if (!texto) return c.json({ error: "mensagem vazia" }, 400);
  const id = uid();
  await c.env.DB.prepare("INSERT INTO chat_mensagens (id, canal, autor, texto) VALUES (?, ?, ?, ?)").bind(id, canal, autor, texto.slice(0, 2000)).run();
  await notificar(c.env, waitUntilDe(c), canal, autor, texto);
  return c.json({ id }, 201);
});

// Envia uma FOTO (multipart) — sobe no R2 e cria a mensagem com a imagem.
chat.post("/:canal/foto", async (c) => {
  const canal = c.req.param("canal");
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);
  const autor = String(body["autor"] ?? "").trim() || "Anônimo";
  const legenda = String(body["texto"] ?? "").trim();
  const id = uid();
  await c.env.BUCKET.put(`chat/${id}`, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "image/jpeg" } });
  await c.env.DB.prepare("INSERT INTO chat_mensagens (id, canal, autor, texto, imagem_key) VALUES (?, ?, ?, ?, ?)").bind(id, canal, autor, legenda.slice(0, 500), id).run();
  await notificar(c.env, waitUntilDe(c), canal, autor, legenda || "📷 enviou uma foto");
  return c.json({ id, imagem_key: id }, 201);
});
