import { Hono } from "hono";
import type { Env } from "../index";
import { limparVendedor } from "./comercial";
import { ehClienteInterno } from "./funil";

export const clientes = new Hono<{ Bindings: Env }>();

const str = (v: unknown) => String(v ?? "").trim() || null;

type ClienteRow = {
  id: string; nome: string; contato: string | null; whatsapp: string | null; email: string | null;
  cidade: string | null; uf: string | null; cnpj: string | null; representante: string | null;
  instagram: string | null; observacao: string | null; ultima_compra?: string | null; created_at?: string | null;
};

// Último vendedor conhecido de cada cliente (fallback do representante quando o
// cadastro não tem representante definido). Mapa nome → vendedor (limpo).
async function ultimoVendedorPorCliente(env: Env): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare(
    `SELECT cliente_nome AS nome, vendedor FROM pedidos
      WHERE COALESCE(vendedor,'') <> '' AND COALESCE(reposicao,0)=0
      ORDER BY (data_pedido IS NULL), data_pedido ASC`
  ).all<{ nome: string; vendedor: string | null }>();
  const m = new Map<string, string>();
  for (const r of results) { const v = limparVendedor(r.vendedor); if (v) m.set(r.nome, v); } // último ganha
  return m;
}

// LISTA. Sem `?crm` mantém o formato leve (id+nome) usado no autocomplete do pedido.
// Com `?crm=1` traz os campos + estatísticas (pedidos, total, última compra, representante).
clientes.get("/", async (c) => {
  if (!c.req.query("crm")) {
    const { results } = await c.env.DB.prepare("SELECT id, nome FROM clientes ORDER BY nome").all();
    return c.json(results);
  }
  const { results: cliAll } = await c.env.DB.prepare(
    "SELECT id, nome, contato, whatsapp, email, cidade, uf, cnpj, representante, instagram, observacao, ultima_compra, created_at FROM clientes ORDER BY nome"
  ).all<ClienteRow>();
  // Nomes internos (ESTOQUE, OP CONSOLIDADA, REPOSIÇÃO, BIG TRICOT) não são clientes reais.
  const cli = cliAll.filter((c0) => !ehClienteInterno(c0.nome));
  const { results: stats } = await c.env.DB.prepare(
    `SELECT p.cliente_nome AS nome, COUNT(DISTINCT p.id) AS pedidos,
            COALESCE(SUM(i.qtd * i.valor_unit), 0) AS total, MAX(p.data_pedido) AS ultima
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE COALESCE(p.reposicao,0)=0
      GROUP BY p.cliente_nome`
  ).all<{ nome: string; pedidos: number; total: number; ultima: string | null }>();
  const smap = new Map(stats.map((s) => [s.nome, s]));
  const vmap = await ultimoVendedorPorCliente(c.env);
  const lista = cli.map((c0) => {
    const s = smap.get(c0.nome);
    const pedidos = s?.pedidos || 0;
    const total = Number(s?.total) || 0;
    return {
      ...c0,
      representante: c0.representante || vmap.get(c0.nome) || null,
      pedidos, total, ultima: s?.ultima || c0.ultima_compra || null,
      ticket: pedidos ? total / pedidos : 0,
    };
  });
  return c.json(lista);
});

// FICHA 360: dados do cliente + histórico de pedidos (não-reposição) + KPIs.
clientes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const cli = await c.env.DB.prepare(
    "SELECT id, nome, contato, whatsapp, email, cidade, uf, cnpj, representante, instagram, observacao, ultima_compra, created_at FROM clientes WHERE id = ?"
  ).bind(id).first<ClienteRow>();
  if (!cli) return c.json({ error: "cliente não encontrado" }, 404);

  const { results: peds } = await c.env.DB.prepare(
    `SELECT p.id, p.numero_erp, p.data_pedido, p.status,
            COALESCE(SUM(i.qtd * i.valor_unit), 0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE p.cliente_nome = ? AND COALESCE(p.reposicao,0)=0
      GROUP BY p.id
      ORDER BY (p.data_pedido IS NULL), p.data_pedido DESC`
  ).bind(cli.nome).all<{ id: string; numero_erp: string | null; data_pedido: string | null; status: string; valor: number }>();

  // Situação de cada pedido pela produção: tudo na expedição → entregue; senão em produção.
  const situ = new Map<string, string>();
  if (peds.length) {
    const ph = peds.map(() => "?").join(",");
    const { results: pr } = await c.env.DB.prepare(
      `SELECT pedido_id, COUNT(*) AS tot, SUM(CASE WHEN setor='expedicao' THEN 1 ELSE 0 END) AS exp
         FROM producao WHERE pedido_id IN (${ph}) GROUP BY pedido_id`
    ).bind(...peds.map((p) => p.id)).all<{ pedido_id: string; tot: number; exp: number }>();
    for (const r of pr) situ.set(r.pedido_id, r.tot > 0 && r.exp === r.tot ? "entregue" : "producao");
  }
  const pedidos = peds.map((p) => ({
    id: p.id, numero: p.numero_erp, data: p.data_pedido, valor: Number(p.valor) || 0,
    situacao: situ.get(p.id) || (p.status === "novo" ? "novo" : "producao"),
  }));
  const total = pedidos.reduce((s, p) => s + p.valor, 0);
  const kpis = { total, pedidos: pedidos.length, ticket: pedidos.length ? total / pedidos.length : 0, ultima: pedidos[0]?.data || cli.ultima_compra || null };
  const vmap = await ultimoVendedorPorCliente(c.env);
  return c.json({ ...cli, representante: cli.representante || vmap.get(cli.nome) || null, kpis, historico: pedidos });
});

// CRIA/ATUALIZA. Sem id, procura por nome (mantém 1 registro por cliente).
// Importação em lote (planilha). Cria/atualiza clientes casando por CNPJ (dígitos) ou nome,
// garante o representante e vincula todos os clientes a ele.
clientes.post("/importar", async (c) => {
  const b = await c.req.json<{ representante?: string; clientes?: Partial<ClienteRow>[] }>().catch(() => ({}) as { representante?: string; clientes?: Partial<ClienteRow>[] });
  const rep = String(b.representante ?? "").trim();
  const lista = Array.isArray(b.clientes) ? b.clientes : [];
  if (!lista.length) return c.json({ error: "planilha vazia ou não reconhecida" }, 400);
  if (rep) {
    const ex = await c.env.DB.prepare("SELECT id FROM representantes WHERE nome = ? LIMIT 1").bind(rep).first<{ id: string }>().catch(() => null);
    if (!ex) await c.env.DB.prepare("INSERT INTO representantes (id, nome, ativo) VALUES (?, ?, 1)").bind(crypto.randomUUID(), rep).run();
  }
  let criados = 0, atualizados = 0, ignorados = 0;
  for (const r of lista) {
    const nome = String(r.nome ?? "").trim();
    if (!nome) { ignorados++; continue; }
    const cnpjDig = String(r.cnpj ?? "").replace(/\D/g, "");
    let ex: { id: string } | null = null;
    if (cnpjDig.length >= 11) ex = await c.env.DB.prepare("SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-','') = ? LIMIT 1").bind(cnpjDig).first<{ id: string }>().catch(() => null);
    if (!ex) ex = await c.env.DB.prepare("SELECT id FROM clientes WHERE nome = ? LIMIT 1").bind(nome).first<{ id: string }>().catch(() => null);
    const id = ex?.id || crypto.randomUUID();
    const repFinal = rep || String(r.representante ?? "").trim() || null;
    await c.env.DB.prepare(
      `INSERT INTO clientes (id, nome, whatsapp, email, cidade, uf, cnpj, representante, observacao, ultima_compra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         whatsapp = COALESCE(NULLIF(excluded.whatsapp,''), clientes.whatsapp),
         email = COALESCE(NULLIF(excluded.email,''), clientes.email),
         cidade = COALESCE(NULLIF(excluded.cidade,''), clientes.cidade),
         uf = COALESCE(NULLIF(excluded.uf,''), clientes.uf),
         cnpj = COALESCE(NULLIF(excluded.cnpj,''), clientes.cnpj),
         representante = COALESCE(NULLIF(excluded.representante,''), clientes.representante),
         observacao = COALESCE(NULLIF(excluded.observacao,''), clientes.observacao),
         ultima_compra = COALESCE(NULLIF(excluded.ultima_compra,''), clientes.ultima_compra)`
    ).bind(id, nome, str(r.whatsapp), str(r.email), str(r.cidade), str(r.uf), str(r.cnpj), repFinal, str(r.observacao), str((r as { ultima_compra?: string }).ultima_compra)).run();
    if (ex) atualizados++; else criados++;
  }
  return c.json({ ok: true, criados, atualizados, ignorados });
});

clientes.post("/", async (c) => {
  const b = await c.req.json<Partial<ClienteRow>>().catch(() => ({}) as Partial<ClienteRow>);
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  let id = b.id;
  if (!id) {
    const ex = await c.env.DB.prepare("SELECT id FROM clientes WHERE nome = ?").bind(nome).first<{ id: string }>();
    id = ex?.id || crypto.randomUUID();
  }
  await c.env.DB.prepare(
    `INSERT INTO clientes (id, nome, contato, whatsapp, email, cidade, uf, cnpj, representante, instagram, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, contato=excluded.contato, whatsapp=excluded.whatsapp,
       email=excluded.email, cidade=excluded.cidade, uf=excluded.uf, cnpj=excluded.cnpj,
       representante=excluded.representante, instagram=excluded.instagram, observacao=excluded.observacao`
  )
    .bind(id, nome, str(b.contato), str(b.whatsapp), str(b.email), str(b.cidade), str(b.uf), str(b.cnpj), str(b.representante), str(b.instagram), str(b.observacao))
    .run();
  return c.json({ id, nome });
});
