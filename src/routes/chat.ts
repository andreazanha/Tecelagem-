// Chat interno da equipe: canais por setor + mensagens diretas (dm:A|B), foto (R2),
// @menção e push direcionado. Sem conexão persistente — o app atualiza por polling.
import { Hono } from "hono";
import type { Env } from "../index";
import { enviarPushPara } from "../push-send";
import { enviarWhatsapp, enviarMidiaZapi, abParaBase64 } from "./atendimento";

export const chat = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

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

// Resumo das conversas diretas de "me": última mensagem e autor de cada DM.
// Usado pra mostrar a bolinha de "não lido" em cada membro da equipe.
chat.get("/dm-resumo", async (c) => {
  const me = (c.req.query("me") || "").trim();
  if (!me) return c.json([]);
  // DMs (dm:A|B) + threads de membros externos (ext:<id>), da mais recente pra mais antiga.
  const { results } = await c.env.DB.prepare(
    "SELECT canal, autor, criado_em FROM chat_mensagens WHERE canal LIKE 'dm:%' OR canal LIKE 'ext:%' ORDER BY criado_em DESC, rowid DESC"
  ).all<{ canal: string; autor: string; criado_em: string }>();
  // O que "me" já leu em cada canal (servidor → igual em qualquer aparelho).
  const { results: lidos } = await c.env.DB.prepare(
    "SELECT canal, visto_em FROM chat_lido WHERE usuario = ?"
  ).bind(me).all<{ canal: string; visto_em: string | null }>().catch(() => ({ results: [] as { canal: string; visto_em: string | null }[] }));
  const lidoMap = new Map(lidos.map((l) => [l.canal, l.visto_em || ""]));
  // Nome de cada membro externo (pra rotular a thread ext:<id>).
  const { results: membros } = await c.env.DB.prepare("SELECT id, nome FROM chat_membros").all<{ id: string; nome: string }>().catch(() => ({ results: [] as { id: string; nome: string }[] }));
  const membroNome = new Map(membros.map((m) => ["ext:" + m.id, m.nome]));
  const vistos = new Set<string>();
  const out: { outro: string; canal: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean }[] = [];
  for (const r of results) {
    if (vistos.has(r.canal)) continue; // já pegamos a mais recente deste canal
    let outro: string;
    if (r.canal.startsWith("ext:")) {
      outro = membroNome.get(r.canal) || "";
      if (!outro) continue; // membro apagado
    } else {
      const partes = r.canal.slice(3).split("|");
      if (!partes.includes(me)) continue;
      outro = partes.find((p) => p !== me) || partes[0];
    }
    vistos.add(r.canal);
    const nao_lido = r.autor !== me && r.criado_em > (lidoMap.get(r.canal) || "");
    out.push({ outro, canal: r.canal, ultima_em: r.criado_em, ultimo_autor: r.autor, nao_lido });
  }
  return c.json(out);
});

// Marca um canal como lido por "me" até a última mensagem (servidor).
chat.post("/marcar-lido", async (c) => {
  const b = await c.req.json<{ usuario?: string; canal?: string }>().catch(() => ({}) as Record<string, string>);
  const usuario = (b.usuario || "").trim();
  const canal = (b.canal || "").trim();
  if (!usuario || !canal) return c.json({ error: "usuario e canal são obrigatórios" }, 400);
  const ult = await c.env.DB.prepare("SELECT MAX(criado_em) AS m FROM chat_mensagens WHERE canal = ?").bind(canal).first<{ m: string | null }>();
  await c.env.DB.prepare(
    "INSERT INTO chat_lido (usuario, canal, visto_em) VALUES (?, ?, ?) ON CONFLICT(usuario, canal) DO UPDATE SET visto_em=excluded.visto_em"
  ).bind(usuario, canal, ult?.m || null).run();
  return c.json({ ok: true });
});

// ── Membros da equipe por OUTRO número de WhatsApp (canal ext:<id>) ──────────────
// A equipe conversa com eles aqui e o texto vai/volta pelo WhatsApp deles (Z-API).
chat.get("/membros", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, telefone, COALESCE(tipo,'externo') AS tipo FROM chat_membros ORDER BY nome"
  ).all<{ id: string; nome: string; telefone: string; tipo: string }>().catch(() => ({ results: [] as { id: string; nome: string; telefone: string; tipo: string }[] }));
  return c.json(results);
});
chat.post("/membros", async (c) => {
  const b = await c.req.json<{ nome?: string; telefone?: string; tipo?: string }>().catch(() => ({}) as Record<string, string>);
  const nome = (b.nome || "").trim();
  const tipo = b.tipo === "interno" ? "interno" : "externo";
  const tel = soDigitos(b.telefone);
  if (!nome) return c.json({ error: "Informe o nome." }, 400);
  if (tipo === "externo" && tel.length < 10) return c.json({ error: "Informe um número de WhatsApp válido (com DDD)." }, 400);
  const id = uid();
  await c.env.DB.prepare("INSERT INTO chat_membros (id, nome, telefone, tipo) VALUES (?, ?, ?, ?)").bind(id, nome, tipo === "interno" ? "" : tel, tipo).run();
  return c.json({ id, nome, telefone: tipo === "interno" ? "" : tel, tipo }, 201);
});
chat.delete("/membros/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM chat_membros WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Não lidas: mensagens depois de `desde` que NÃO são minhas.
chat.get("/nao-lidas", async (c) => {
  const desde = c.req.query("desde") || "1970-01-01";
  const autor = c.req.query("autor") || "";
  const r = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chat_mensagens WHERE criado_em > ? AND autor <> ?"
  ).bind(desde, autor).first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    "SELECT id, canal, autor, texto, imagem_key, criado_em FROM chat_mensagens WHERE criado_em > ? AND autor <> ? ORDER BY criado_em DESC LIMIT 1"
  ).bind(desde, autor).all();
  return c.json({ nao_lidas: r?.n || 0, ultima: results[0] || null });
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
    "SELECT id, canal, autor, texto, imagem_key, midia_tipo, criado_em FROM chat_mensagens WHERE canal = ? ORDER BY criado_em DESC LIMIT 100"
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
  // Membro externo (ext:<id>): manda o texto pro WhatsApp pessoal dele, com o nome de quem escreveu.
  if (canal.startsWith("ext:")) {
    const m = await c.env.DB.prepare("SELECT telefone FROM chat_membros WHERE id = ?").bind(canal.slice(4)).first<{ telefone: string }>().catch(() => null);
    if (m?.telefone) {
      const p = enviarWhatsapp(c.env, m.telefone, { tipo: "texto", texto: `*${autor}* (equipe):\n${texto}` }).then(() => {}).catch(() => {});
      const wu = waitUntilDe(c); if (wu) wu(p); else await p;
    }
  } else {
    await notificar(c.env, waitUntilDe(c), canal, autor, texto);
  }
  return c.json({ id }, 201);
});

// Envia uma MÍDIA (multipart) — foto, áudio OU arquivo (PDF/doc). Sobe no R2 e cria a mensagem.
// O tipo é deduzido do content-type do arquivo. Se o canal for de um membro EXTERNO (WhatsApp),
// a mídia também é encaminhada pro WhatsApp dele (igual ao atendimento de clientes).
chat.post("/:canal/foto", async (c) => {
  const canal = c.req.param("canal");
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);
  if (file.size > 16 * 1024 * 1024) return c.json({ error: "arquivo muito grande (máx. 16MB)" }, 400);
  const autor = String(body["autor"] ?? "").trim() || "Anônimo";
  const legenda = String(body["texto"] ?? "").trim();
  const ctFile = file.type || "";
  const tipo: "audio" | "imagem" | "arquivo" = ctFile.startsWith("audio/") ? "audio" : ctFile.startsWith("image/") ? "imagem" : "arquivo";
  const nomeArq = (file.name || (tipo === "audio" ? "audio" : tipo === "imagem" ? "imagem" : "arquivo")).slice(0, 120);
  const id = uid();
  const ct = ctFile || (tipo === "audio" ? "audio/ogg" : tipo === "imagem" ? "image/jpeg" : "application/octet-stream");
  const bytes = await file.arrayBuffer();
  await c.env.BUCKET.put(`chat/${id}`, bytes, { httpMetadata: { contentType: ct } });
  // Pra ARQUIVO sem legenda, mostra o nome do arquivo como rótulo (pra dar pra clicar/baixar).
  const textoMsg = legenda || (tipo === "arquivo" ? nomeArq : "");
  await c.env.DB.prepare("INSERT INTO chat_mensagens (id, canal, autor, texto, imagem_key, midia_tipo) VALUES (?, ?, ?, ?, ?, ?)").bind(id, canal, autor, textoMsg.slice(0, 500), id, tipo).run();
  if (canal.startsWith("ext:")) {
    // Membro externo → encaminha a mídia pro WhatsApp pessoal dele.
    const m = await c.env.DB.prepare("SELECT telefone FROM chat_membros WHERE id = ?").bind(canal.slice(4)).first<{ telefone: string }>().catch(() => null);
    if (m?.telefone) {
      const origin = new URL(c.req.url).origin;
      const url = `${origin}/api/chat/foto/${id}`;
      const ext = (nomeArq.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
      const docData = tipo === "arquivo" ? `data:${ct};base64,${abParaBase64(bytes)}` : undefined;
      const p = enviarMidiaZapi(c.env, m.telefone, { url, docData, ehImagem: tipo === "imagem", ehAudio: tipo === "audio", ext, fileName: nomeArq, caption: legenda ? `*${autor}* (equipe): ${legenda}` : `*${autor}* (equipe)` }).then(() => {}).catch(() => {});
      const wu = waitUntilDe(c); if (wu) wu(p); else await p;
    }
  } else {
    await notificar(c.env, waitUntilDe(c), canal, autor, legenda || (tipo === "audio" ? "🎤 enviou um áudio" : tipo === "imagem" ? "📷 enviou uma foto" : "📎 enviou um arquivo"));
  }
  return c.json({ id, imagem_key: id, midia_tipo: tipo }, 201);
});
