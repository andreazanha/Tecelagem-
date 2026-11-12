import { Hono } from "hono";
import type { Env } from "../index";
import { usuarioLogado } from "../sessao";

// CHAT INTERNO da equipe — conversa 1 a 1 entre SETORES. Totalmente separado do
// resto do sistema: NÃO toca em pedido, estoque nem Syntech. Só lê/grava as suas
// próprias tabelas (chat_mensagens, chat_leitura).
export const chat = new Hono<{ Bindings: Env }>();

// Setores que usam o chat (lista fixa por enquanto — fácil de mudar depois).
const SETORES = [
  { id: "tecelagem", nome: "Tecelagem" },
  { id: "corte", nome: "Corte" },
  { id: "revisao", nome: "Revisão" },
  { id: "expedicao", nome: "Expedição" },
  { id: "estoque", nome: "Estoque" },
  { id: "fiscal", nome: "Fiscal" },
  { id: "pcp", nome: "PCP" },
  { id: "boss", nome: "Boss" },
];
const IDS = new Set(SETORES.map((s) => s.id));
const parDe = (a: string, b: string) => [a, b].sort().join("|");
const uid = () => crypto.randomUUID();

type Msg = { id: string; de_setor: string; para_setor: string; autor: string | null; texto: string | null; imagem_key: string | null; criado_em: string };

// Lista dos setores do chat (o front usa pra montar os contatos e o seletor do PC).
chat.get("/setores", (c) => c.json(SETORES));

// Conversas do MEU setor: cada OUTRO setor, com a última mensagem e quantas não lidas.
chat.get("/conversas", async (c) => {
  const setor = (c.req.query("setor") || "").trim();
  if (!IDS.has(setor)) return c.json({ error: "setor inválido" }, 400);
  const out = [];
  for (const s of SETORES) {
    if (s.id === setor) continue;
    const par = parDe(setor, s.id);
    const ultima = await c.env.DB.prepare(
      "SELECT texto, de_setor, autor, imagem_key, criado_em FROM chat_mensagens WHERE par=? ORDER BY criado_em DESC, rowid DESC LIMIT 1"
    ).bind(par).first<Partial<Msg>>();
    const leitura = await c.env.DB.prepare(
      "SELECT lido_em FROM chat_leitura WHERE setor=? AND com_setor=?"
    ).bind(setor, s.id).first<{ lido_em: string }>();
    const naoLidas = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM chat_mensagens WHERE par=? AND para_setor=? AND criado_em > COALESCE(?, '')"
    ).bind(par, setor, leitura?.lido_em || "").first<{ n: number }>();
    out.push({ setor: s.id, nome: s.nome, ultima: ultima || null, nao_lidas: Number(naoLidas?.n || 0) });
  }
  return c.json(out);
});

// Mensagens de uma conversa. Com ?desde=<criado_em> traz só as mais novas (polling).
// Abrir a conversa (sem ?desde) marca como lida.
chat.get("/mensagens", async (c) => {
  const setor = (c.req.query("setor") || "").trim();
  const com = (c.req.query("com") || "").trim();
  if (!IDS.has(setor) || !IDS.has(com) || setor === com) return c.json({ error: "setor inválido" }, 400);
  const par = parDe(setor, com);
  const desde = (c.req.query("desde") || "").trim();
  let msgs: Msg[];
  if (desde) {
    const { results } = await c.env.DB.prepare(
      "SELECT id, de_setor, para_setor, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE par=? AND criado_em > ? ORDER BY criado_em, rowid LIMIT 500"
    ).bind(par, desde).all<Msg>();
    msgs = results;
  } else {
    const { results } = await c.env.DB.prepare(
      "SELECT id, de_setor, para_setor, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE par=? ORDER BY criado_em DESC, rowid DESC LIMIT 200"
    ).bind(par).all<Msg>();
    msgs = results.reverse(); // devolve em ordem cronológica
    // marca a conversa como lida (só quando abre a conversa inteira)
    await c.env.DB.prepare(
      "INSERT INTO chat_leitura (setor, com_setor, lido_em) VALUES (?,?,datetime('now')) ON CONFLICT(setor,com_setor) DO UPDATE SET lido_em=datetime('now')"
    ).bind(setor, com).run();
  }
  return c.json(msgs);
});

// Envia uma mensagem de texto do setor "de" para o setor "para".
chat.post("/enviar", async (c) => {
  const u = await usuarioLogado(c.env, c);
  const b = (await c.req.json<{ de?: string; para?: string; texto?: string }>().catch(() => ({}))) as { de?: string; para?: string; texto?: string };
  const de = (b.de || "").trim(), para = (b.para || "").trim();
  const texto = (b.texto || "").trim().slice(0, 4000);
  if (!IDS.has(de) || !IDS.has(para) || de === para) return c.json({ error: "setor inválido" }, 400);
  if (!texto) return c.json({ error: "vazio" }, 400);
  const id = uid();
  await c.env.DB.prepare(
    "INSERT INTO chat_mensagens (id, par, de_setor, para_setor, autor, texto) VALUES (?,?,?,?,?,?)"
  ).bind(id, parDe(de, para), de, para, u?.nome || null, texto).run();
  const row = await c.env.DB.prepare(
    "SELECT id, de_setor, para_setor, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE id=?"
  ).bind(id).first<Msg>();
  return c.json(row);
});

// Marca uma conversa como lida (sem precisar recarregar as mensagens).
chat.post("/lido", async (c) => {
  const b = (await c.req.json<{ setor?: string; com?: string }>().catch(() => ({}))) as { setor?: string; com?: string };
  const setor = (b.setor || "").trim(), com = (b.com || "").trim();
  if (!IDS.has(setor) || !IDS.has(com)) return c.json({ error: "setor inválido" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO chat_leitura (setor, com_setor, lido_em) VALUES (?,?,datetime('now')) ON CONFLICT(setor,com_setor) DO UPDATE SET lido_em=datetime('now')"
  ).bind(setor, com).run();
  return c.json({ ok: true });
});

// Envia uma FOTO (com legenda opcional). Guarda no R2; a mensagem leva o imagem_key.
chat.post("/enviar-foto", async (c) => {
  const u = await usuarioLogado(c.env, c);
  const form = await c.req.formData().catch(() => null);
  const de = String(form?.get("de") || "").trim();
  const para = String(form?.get("para") || "").trim();
  const texto = (String(form?.get("texto") || "").trim().slice(0, 4000)) || null;
  const file = form?.get("file") as unknown as File | null;
  if (!IDS.has(de) || !IDS.has(para) || de === para) return c.json({ error: "setor inválido" }, 400);
  if (!file || typeof file.arrayBuffer !== "function") return c.json({ error: "sem_arquivo" }, 400);
  const ct = file.type || "image/jpeg";
  if (!ct.startsWith("image/")) return c.json({ error: "so_imagem" }, 400);
  const buf = await file.arrayBuffer();
  if (buf.byteLength > 12 * 1024 * 1024) return c.json({ error: "muito_grande" }, 400); // 12 MB
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("gif") ? "gif" : "jpg";
  const nome = `${uid()}.${ext}`;
  await c.env.BUCKET.put(`chat/${nome}`, buf, { httpMetadata: { contentType: ct } });
  const id = uid();
  await c.env.DB.prepare(
    "INSERT INTO chat_mensagens (id, par, de_setor, para_setor, autor, texto, imagem_key) VALUES (?,?,?,?,?,?,?)"
  ).bind(id, parDe(de, para), de, para, u?.nome || null, texto, nome).run();
  const row = await c.env.DB.prepare(
    "SELECT id, de_setor, para_setor, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE id=?"
  ).bind(id).first<Msg>();
  return c.json(row);
});

// Serve a foto do chat (guardada no R2 em chat/<nome>).
chat.get("/foto/:nome", async (c) => {
  const nome = c.req.param("nome");
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) return c.notFound();
  const obj = await c.env.BUCKET.get(`chat/${nome}`);
  if (!obj) return c.notFound();
  const ct = obj.httpMetadata?.contentType || "image/jpeg";
  return new Response(obj.body, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" } });
});
