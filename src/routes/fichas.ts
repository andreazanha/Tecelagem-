// Ficha Técnica de Programa (tricô) — cadastro + listas auxiliares (máquina, galga) + imagem.
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../index";
import { usuarioLogado } from "../sessao";

export const fichas = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();
const norm = (s: unknown) => String(s ?? "").trim();

async function exigeLogin(c: Context) {
  const u = await usuarioLogado(c.env as Env, c);
  if (!u) return null;
  return u;
}

// ── Listas auxiliares (máquina / galga) ───────────────────────────────────────
for (const tipo of ["maquina", "galga"] as const) {
  const tabela = tipo === "maquina" ? "ficha_maquina" : "ficha_galga";
  fichas.get(`/${tipo}s`, async (c) => {
    if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
    const { results } = await c.env.DB.prepare(`SELECT id, nome FROM ${tabela} ORDER BY ordem, nome`).all<{ id: string; nome: string }>();
    return c.json(results || []);
  });
  fichas.post(`/${tipo}s`, async (c) => {
    if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
    const b = await c.req.json<{ nome?: string }>().catch(() => ({} as { nome?: string }));
    const nome = norm(b.nome); if (!nome) return c.json({ error: "sem_nome" }, 400);
    const ja = await c.env.DB.prepare(`SELECT id FROM ${tabela} WHERE lower(nome)=lower(?)`).bind(nome).first<{ id: string }>();
    if (ja) return c.json({ ok: true, id: ja.id });
    const id = uid();
    await c.env.DB.prepare(`INSERT INTO ${tabela} (id, nome) VALUES (?, ?)`).bind(id, nome).run();
    return c.json({ ok: true, id });
  });
  fichas.delete(`/${tipo}s/:id`, async (c) => {
    if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
    await c.env.DB.prepare(`DELETE FROM ${tabela} WHERE id=?`).bind(c.req.param("id")).run();
    return c.json({ ok: true });
  });
}

// ── Fichas ────────────────────────────────────────────────────────────────────
const CAMPOS_JSON = ["programa", "guia_fios", "economizador", "graduacao", "take_down", "velocidade"] as const;
function parseFicha(r: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...r };
  for (const k of CAMPOS_JSON) { try { o[k] = JSON.parse(String(r[k] || "[]")); } catch { o[k] = []; } }
  return o;
}

fichas.get("/", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const { results } = await c.env.DB.prepare(
    "SELECT id, numero, cliente, descricao, maquina, galga, data, atualizado_em FROM ficha_programa ORDER BY COALESCE(atualizado_em, criado_em) DESC LIMIT 500"
  ).all();
  return c.json(results || []);
});

fichas.get("/:id", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const r = await c.env.DB.prepare("SELECT * FROM ficha_programa WHERE id=?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!r) return c.json({ error: "nao_encontrada" }, 404);
  return c.json(parseFicha(r));
});

type FichaBody = Record<string, unknown> & { id?: string };
fichas.post("/", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const b = await c.req.json<FichaBody>().catch(() => ({} as FichaBody));
  const id = norm(b.id) || uid();
  const txt = (k: string) => norm(b[k]);
  const json = (k: string) => { try { return JSON.stringify(Array.isArray(b[k]) ? b[k] : []); } catch { return "[]"; } };
  const existe = await c.env.DB.prepare("SELECT id FROM ficha_programa WHERE id=?").bind(id).first();
  if (existe) {
    await c.env.DB.prepare(
      `UPDATE ficha_programa SET numero=?, cliente=?, descricao=?, programador=?, maquina=?, galga=?, fio=?, data=?,
         peso_total=?, tempo_total=?, programa=?, guia_fios=?, economizador=?, graduacao=?, take_down=?, velocidade=?,
         atualizado_em=datetime('now') WHERE id=?`
    ).bind(txt("numero"), txt("cliente"), txt("descricao"), txt("programador"), txt("maquina"), txt("galga"), txt("fio"), txt("data"),
      txt("peso_total"), txt("tempo_total"), json("programa"), json("guia_fios"), json("economizador"), json("graduacao"), json("take_down"), json("velocidade"), id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO ficha_programa (id, numero, cliente, descricao, programador, maquina, galga, fio, data,
         peso_total, tempo_total, programa, guia_fios, economizador, graduacao, take_down, velocidade)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, txt("numero"), txt("cliente"), txt("descricao"), txt("programador"), txt("maquina"), txt("galga"), txt("fio"), txt("data"),
      txt("peso_total"), txt("tempo_total"), json("programa"), json("guia_fios"), json("economizador"), json("graduacao"), json("take_down"), json("velocidade")).run();
  }
  const r = await c.env.DB.prepare("SELECT * FROM ficha_programa WHERE id=?").bind(id).first<Record<string, unknown>>();
  return c.json({ ok: true, ficha: r ? parseFicha(r) : null });
});

fichas.delete("/:id", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("SELECT imagem_key FROM ficha_programa WHERE id=?").bind(id).first<{ imagem_key: string | null }>();
  if (r?.imagem_key) { try { await c.env.BUCKET.delete(r.imagem_key); } catch { /* ok */ } }
  await c.env.DB.prepare("DELETE FROM ficha_programa WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// Imagem: upload (multipart) + servir. Guardada em ficha/<id>.<ext> no R2.
fichas.post("/:id/imagem", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file") as unknown as File | null;
  if (!file || typeof file.arrayBuffer !== "function") return c.json({ error: "sem_arquivo" }, 400);
  const ct = file.type || "image/jpeg";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const key = `ficha/${id}.${ext}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: ct } });
  await c.env.DB.prepare("UPDATE ficha_programa SET imagem_key=?, atualizado_em=datetime('now') WHERE id=?").bind(key, id).run();
  return c.json({ ok: true, imagem_key: key });
});

fichas.get("/imagem/:id", async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("SELECT imagem_key FROM ficha_programa WHERE id=?").bind(id).first<{ imagem_key: string | null }>();
  if (!r?.imagem_key) return c.notFound();
  const obj = await c.env.BUCKET.get(r.imagem_key);
  if (!obj) return c.notFound();
  const ct = obj.httpMetadata?.contentType || "image/jpeg";
  return new Response(obj.body, { headers: { "Content-Type": ct, "Cache-Control": "no-cache" } });
});
