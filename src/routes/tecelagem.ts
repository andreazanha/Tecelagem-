// Controle da Tecelagem: cadastro de máquinas e motivos, registro 2×/dia da % da
// máquina + tempo parado por motivo, e resumo mensal (base da bonificação).
import { Hono } from "hono";
import type { Env } from "../index";

export const tecelagem = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const str = (v: unknown) => String(v ?? "").trim() || null;
const int = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

type MaqBody = { id?: string; nome?: string; ordem?: number; ativo?: boolean };
type MotBody = { id?: string; codigo?: string; nome?: string; tipo?: string; ordem?: number };
type RegBody = { maquina_id?: string; data?: string; turno?: string; percentual?: number; operador?: string; obs?: string; paradas?: Record<string, number> };

// ── Máquinas ──────────────────────────────────────────────────────────────────
tecelagem.get("/maquinas", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, ordem, ativo FROM tecelagem_maquinas ORDER BY ordem, nome"
  ).all();
  return c.json(results);
});
tecelagem.post("/maquinas", async (c) => {
  const b = await c.req.json<MaqBody>().catch(() => ({} as MaqBody));
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = b.id || uid();
  await c.env.DB.prepare(
    `INSERT INTO tecelagem_maquinas (id, nome, ordem, ativo) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, ordem=excluded.ordem, ativo=excluded.ativo`
  ).bind(id, nome, int(b.ordem), b.ativo === false ? 0 : 1).run();
  return c.json({ id });
});
tecelagem.delete("/maquinas/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tecelagem_maquinas WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Motivos ───────────────────────────────────────────────────────────────────
tecelagem.get("/motivos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, codigo, nome, tipo, ordem, ativo FROM tecelagem_motivos WHERE ativo = 1 ORDER BY ordem, codigo"
  ).all();
  return c.json(results);
});
tecelagem.post("/motivos", async (c) => {
  const b = await c.req.json<MotBody>().catch(() => ({} as MotBody));
  const codigo = (b.codigo || "").trim();
  if (!codigo) return c.json({ error: "código é obrigatório" }, 400);
  const tipo = ["parada", "limpeza", "manutencao"].includes(b.tipo || "") ? b.tipo : "parada";
  const id = b.id || uid();
  await c.env.DB.prepare(
    `INSERT INTO tecelagem_motivos (id, codigo, nome, tipo, ordem, ativo) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, tipo=excluded.tipo, ordem=excluded.ordem, ativo=1`
  ).bind(id, codigo, (b.nome || codigo).trim(), tipo, int(b.ordem)).run();
  return c.json({ id, codigo });
});
tecelagem.delete("/motivos/:id", async (c) => {
  // Soft-delete: mantém histórico das paradas já lançadas.
  await c.env.DB.prepare("UPDATE tecelagem_motivos SET ativo = 0 WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Registro de um turno (carregar 1) ─────────────────────────────────────────
// GET /registro?maquina_id=&data=YYYY-MM-DD&turno=manha|tarde
tecelagem.get("/registro", async (c) => {
  const maquina_id = c.req.query("maquina_id") || "";
  const data = c.req.query("data") || "";
  const turno = c.req.query("turno") || "";
  if (!maquina_id || !data || !turno) return c.json({ registro: null, paradas: {} });
  const reg = await c.env.DB.prepare(
    "SELECT id, percentual, operador, obs FROM tecelagem_registros WHERE maquina_id = ? AND data = ? AND turno = ?"
  ).bind(maquina_id, data, turno).first<{ id: string; percentual: number | null; operador: string | null; obs: string | null }>();
  if (!reg) return c.json({ registro: null, paradas: {} });
  const { results } = await c.env.DB.prepare(
    "SELECT motivo, minutos FROM tecelagem_paradas WHERE registro_id = ?"
  ).bind(reg.id).all<{ motivo: string; minutos: number }>();
  const paradas: Record<string, number> = {};
  for (const p of results) paradas[p.motivo] = p.minutos;
  return c.json({ registro: reg, paradas });
});

// ── Salvar/atualizar um turno ─────────────────────────────────────────────────
// POST /registro { maquina_id, data, turno, percentual, operador, obs, paradas: {motivo: minutos} }
tecelagem.post("/registro", async (c) => {
  const b = await c.req.json<RegBody>().catch(() => ({} as RegBody));
  const maquina_id = (b.maquina_id || "").trim();
  const data = (b.data || "").trim();
  const turno = (b.turno || "").trim();
  if (!maquina_id || !data || !turno) return c.json({ error: "máquina, data e turno são obrigatórios" }, 400);
  const pct = b.percentual == null || isNaN(Number(b.percentual)) ? null : Math.max(0, Math.min(100, Number(b.percentual)));

  const existente = await c.env.DB.prepare(
    "SELECT id FROM tecelagem_registros WHERE maquina_id = ? AND data = ? AND turno = ?"
  ).bind(maquina_id, data, turno).first<{ id: string }>();
  const id = existente?.id || uid();
  if (existente) {
    await c.env.DB.prepare(
      "UPDATE tecelagem_registros SET percentual = ?, operador = ?, obs = ?, atualizado_em = datetime('now') WHERE id = ?"
    ).bind(pct, str(b.operador), str(b.obs), id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO tecelagem_registros (id, maquina_id, data, turno, percentual, operador, obs) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, maquina_id, data, turno, pct, str(b.operador), str(b.obs)).run();
  }
  // Substitui as paradas do registro.
  await c.env.DB.prepare("DELETE FROM tecelagem_paradas WHERE registro_id = ?").bind(id).run();
  const paradas = b.paradas || {};
  for (const [motivo, minutos] of Object.entries(paradas)) {
    const min = int(minutos);
    if (min > 0) {
      await c.env.DB.prepare(
        "INSERT INTO tecelagem_paradas (id, registro_id, motivo, minutos) VALUES (?, ?, ?, ?)"
      ).bind(uid(), id, motivo, min).run();
    }
  }
  return c.json({ id });
});

// ── Resumo mensal (base da bonificação) ───────────────────────────────────────
// GET /resumo?mes=YYYY-MM  → por máquina: média %, turnos, minutos por tipo e por motivo.
tecelagem.get("/resumo", async (c) => {
  const mes = (c.req.query("mes") || "").trim(); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(mes)) return c.json({ error: "mês inválido (use YYYY-MM)" }, 400);
  const ini = mes + "-01";
  const fim = mes + "-31";

  const { results: maquinas } = await c.env.DB.prepare(
    "SELECT id, nome FROM tecelagem_maquinas ORDER BY ordem, nome"
  ).all<{ id: string; nome: string }>();

  // Média da % e nº de turnos preenchidos por máquina.
  const { results: pcts } = await c.env.DB.prepare(
    `SELECT maquina_id, AVG(percentual) AS media, COUNT(percentual) AS turnos
       FROM tecelagem_registros WHERE data >= ? AND data <= ? GROUP BY maquina_id`
  ).bind(ini, fim).all<{ maquina_id: string; media: number | null; turnos: number }>();

  // Minutos por máquina e tipo de motivo (parada | limpeza | manutencao).
  const { results: portipo } = await c.env.DB.prepare(
    `SELECT r.maquina_id AS maquina_id, COALESCE(mo.tipo,'parada') AS tipo, SUM(p.minutos) AS minutos
       FROM tecelagem_paradas p
       JOIN tecelagem_registros r ON r.id = p.registro_id
       LEFT JOIN tecelagem_motivos mo ON mo.codigo = p.motivo
      WHERE r.data >= ? AND r.data <= ?
      GROUP BY r.maquina_id, tipo`
  ).bind(ini, fim).all<{ maquina_id: string; tipo: string; minutos: number }>();

  // Minutos por máquina e motivo (detalhe).
  const { results: pormotivo } = await c.env.DB.prepare(
    `SELECT r.maquina_id AS maquina_id, p.motivo AS motivo, SUM(p.minutos) AS minutos
       FROM tecelagem_paradas p
       JOIN tecelagem_registros r ON r.id = p.registro_id
      WHERE r.data >= ? AND r.data <= ?
      GROUP BY r.maquina_id, p.motivo`
  ).bind(ini, fim).all<{ maquina_id: string; motivo: string; minutos: number }>();

  const pctMap = new Map(pcts.map((p) => [p.maquina_id, p]));
  const linhas = maquinas.map((m) => {
    const p = pctMap.get(m.id);
    const tipos = { parada: 0, limpeza: 0, manutencao: 0 } as Record<string, number>;
    for (const t of portipo) if (t.maquina_id === m.id) tipos[t.tipo] = (tipos[t.tipo] || 0) + (t.minutos || 0);
    const motivos: Record<string, number> = {};
    for (const t of pormotivo) if (t.maquina_id === m.id) motivos[t.motivo] = t.minutos || 0;
    return {
      maquina_id: m.id, nome: m.nome,
      media: p?.media != null ? Math.round(p.media * 10) / 10 : null,
      turnos: p?.turnos || 0,
      minParada: tipos.parada || 0, minLimpeza: tipos.limpeza || 0, minManutencao: tipos.manutencao || 0,
      motivos,
    };
  });
  return c.json({ mes, maquinas: linhas });
});
