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

// ── Termos técnicos (autocomplete + dedup) ────────────────────────────────────
// Normaliza para busca/dedup: minúsculo, sem acento, espaços colapsados.
const chaveNorm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
// Padroniza grafia: só a 1ª letra maiúscula, resto como foi digitado (não força CAIXA ALTA).
const capInicial = (s: unknown) => { const t = String(s ?? "").trim().replace(/\s+/g, " "); return t ? t[0].toUpperCase() + t.slice(1) : t; };

// Termos genéricos (pontos, stitch, nomes de programa, localizações…).
fichas.get("/termos", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const tipo = chaveNorm(c.req.query("tipo"));
  if (!tipo) return c.json([]);
  const q = chaveNorm(c.req.query("q"));
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, nome_norm FROM ficha_termo WHERE tipo=? ORDER BY usos DESC, nome LIMIT 500"
  ).bind(tipo).all<{ id: string; nome: string; nome_norm: string }>();
  const lista = results || [];
  const filt = q ? lista.filter((r) => r.nome_norm.includes(q)) : lista;
  return c.json(filt.slice(0, 50).map((r) => ({ id: r.id, nome: r.nome })));
});
fichas.post("/termos", async (c) => {
  const u = await exigeLogin(c);
  if (!u) return c.json({ error: "login" }, 401);
  const b = await c.req.json<{ tipo?: string; nome?: string }>().catch(() => ({} as { tipo?: string; nome?: string }));
  const tipo = chaveNorm(b.tipo);
  const nome = capInicial(b.nome);
  const nn = chaveNorm(nome);
  if (!tipo || !nn) return c.json({ error: "sem_dados" }, 400);
  const ja = await c.env.DB.prepare("SELECT id, nome FROM ficha_termo WHERE tipo=? AND nome_norm=?").bind(tipo, nn).first<{ id: string; nome: string }>();
  if (ja) { await c.env.DB.prepare("UPDATE ficha_termo SET usos=usos+1 WHERE id=?").bind(ja.id).run(); return c.json({ ok: true, id: ja.id, nome: ja.nome }); }
  const id = uid();
  await c.env.DB.prepare("INSERT INTO ficha_termo (id, tipo, nome, nome_norm, usos, criado_por) VALUES (?,?,?,?,1,?)").bind(id, tipo, nome, nn, u.nome || null).run();
  return c.json({ ok: true, id, nome });
});

// Fios: REUTILIZA o cadastro de fios dos produtos (tipos_fio). Dedup por grafia normalizada.
fichas.get("/fios", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const q = chaveNorm(c.req.query("q"));
  const { results } = await c.env.DB.prepare("SELECT id, nome FROM tipos_fio ORDER BY nome LIMIT 2000").all<{ id: string; nome: string }>();
  const lista = results || [];
  const filt = q ? lista.filter((r) => chaveNorm(r.nome).includes(q)) : lista;
  return c.json(filt.slice(0, 50));
});
fichas.post("/fios", async (c) => {
  if (!(await exigeLogin(c))) return c.json({ error: "login" }, 401);
  const b = await c.req.json<{ nome?: string }>().catch(() => ({} as { nome?: string }));
  const nome = capInicial(b.nome);
  const nn = chaveNorm(nome);
  if (!nn) return c.json({ error: "sem_nome" }, 400);
  const { results } = await c.env.DB.prepare("SELECT id, nome FROM tipos_fio").all<{ id: string; nome: string }>();
  const ja = (results || []).find((r) => chaveNorm(r.nome) === nn);
  if (ja) return c.json({ ok: true, id: ja.id, nome: ja.nome });
  const id = uid();
  await c.env.DB.prepare("INSERT INTO tipos_fio (id, nome) VALUES (?, ?)").bind(id, nome).run();
  return c.json({ ok: true, id, nome });
});

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
