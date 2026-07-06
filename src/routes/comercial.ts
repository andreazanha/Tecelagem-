// Comercial / CRM: cadastro de representantes e vendas por representante.
import { Hono } from "hono";
import type { Env } from "../index";

const uid = () => crypto.randomUUID();

// Limpa o nome do vendedor que às vezes vem poluído do PDF do ERP
// ("PEDRO HENRIQUE 35992103017 EMITENTE Entrega:…") — mesma regra do quadro.
export function limparVendedor(v?: string | null): string {
  if (!v) return "";
  let s = v.split(/\s+\d{4,}/)[0];
  s = s.split(/\s*\b(EMITENTE|ENTREGA|TRANSPORTADOR|FONES?|OBS|ADICION|CNPJ|CPF|RG|INSCR)/i)[0];
  s = s.replace(/[-–·,;:]+\s*$/, "").trim();
  return s;
}

// ── Cadastro de representantes ────────────────────────────────────────────────
export const representantes = new Hono<{ Bindings: Env }>();

representantes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, whatsapp, email, ativo, observacao FROM representantes ORDER BY nome"
  ).all();
  return c.json(results);
});

representantes.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; whatsapp?: string; email?: string; ativo?: boolean | number; observacao?: string }>().catch(() => ({}) as Record<string, never>);
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const existe = b.id ? await c.env.DB.prepare("SELECT id FROM representantes WHERE id = ?").bind(b.id).first() : null;
  const id = b.id || uid();
  await c.env.DB.prepare(
    `INSERT INTO representantes (id, nome, whatsapp, email, ativo, observacao) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, whatsapp = excluded.whatsapp, email = excluded.email,
       ativo = excluded.ativo, observacao = excluded.observacao`
  )
    .bind(id, nome, (b.whatsapp || "").trim() || null, (b.email || "").trim() || null, b.ativo === false || b.ativo === 0 ? 0 : 1, (b.observacao || "").trim() || null)
    .run();
  return c.json({ id, nome }, existe ? 200 : 201);
});

representantes.post("/:id/ativo", async (c) => {
  const b = await c.req.json<{ ativo?: boolean }>().catch(() => ({}) as { ativo?: boolean });
  await c.env.DB.prepare("UPDATE representantes SET ativo = ? WHERE id = ?").bind(b.ativo ? 1 : 0, c.req.param("id")).run();
  return c.json({ ok: true });
});

representantes.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM representantes WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Vendas por representante ──────────────────────────────────────────────────
export const comercial = new Hono<{ Bindings: Env }>();

// Agrega os pedidos por vendedor (valor = Σ qtd × preço, peças e nº de pedidos)
// no período (?de=YYYY-MM-DD&ate=YYYY-MM-DD). Junta os nomes já "limpos".
comercial.get("/vendas", async (c) => {
  const de = (c.req.query("de") || "").trim();
  const ate = (c.req.query("ate") || "").trim();
  const cond: string[] = ["COALESCE(p.reposicao, 0) = 0"];
  const binds: string[] = [];
  if (de) { cond.push("p.data_pedido >= ?"); binds.push(de); }
  if (ate) { cond.push("p.data_pedido <= ?"); binds.push(ate); }
  const where = "WHERE " + cond.join(" AND ");
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.vendedor, COALESCE(SUM(i.qtd), 0) AS pecas, COALESCE(SUM(i.qtd * i.valor_unit), 0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
       ${where}
      GROUP BY p.id`
  ).bind(...binds).all<{ id: string; vendedor: string | null; pecas: number; valor: number }>();

  const map = new Map<string, { vendedor: string; pedidos: number; pecas: number; valor: number }>();
  for (const r of results) {
    const nome = limparVendedor(r.vendedor) || "(sem vendedor)";
    const g = map.get(nome) || { vendedor: nome, pedidos: 0, pecas: 0, valor: 0 };
    g.pedidos += 1;
    g.pecas += Number(r.pecas) || 0;
    g.valor += Number(r.valor) || 0;
    map.set(nome, g);
  }
  const lista = [...map.values()].sort((a, b) => b.valor - a.valor);
  const totais = lista.reduce((t, g) => ({ pedidos: t.pedidos + g.pedidos, pecas: t.pecas + g.pecas, valor: t.valor + g.valor }), { pedidos: 0, pecas: 0, valor: 0 });
  return c.json({ lista, totais });
});

// Detalhe das vendas de UM representante no período: cada pedido com cliente,
// data, peças, valor e se é cliente novo (primeira compra dentro do período —
// ou a 1ª compra do cliente na base, quando não há filtro de data).
comercial.get("/vendas/detalhe", async (c) => {
  const vend = (c.req.query("vendedor") || "").trim();
  const de = (c.req.query("de") || "").trim();
  const ate = (c.req.query("ate") || "").trim();
  if (!vend) return c.json({ error: "vendedor é obrigatório" }, 400);

  const cond: string[] = ["COALESCE(p.reposicao, 0) = 0"];
  const binds: string[] = [];
  if (de) { cond.push("p.data_pedido >= ?"); binds.push(de); }
  if (ate) { cond.push("p.data_pedido <= ?"); binds.push(ate); }
  const where = "WHERE " + cond.join(" AND ");
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.numero_erp, p.vendedor, p.cliente_nome, p.data_pedido,
            COALESCE(SUM(i.qtd), 0) AS pecas, COALESCE(SUM(i.qtd * i.valor_unit), 0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
       ${where}
      GROUP BY p.id
      ORDER BY p.data_pedido DESC, p.created_at DESC`
  ).bind(...binds).all<{ id: string; numero_erp: string | null; vendedor: string | null; cliente_nome: string; data_pedido: string | null; pecas: number; valor: number }>();

  // 1ª compra de cada cliente na base inteira (para marcar "cliente novo").
  const primeiras = await c.env.DB.prepare(
    "SELECT cliente_nome, MIN(data_pedido) AS primeira FROM pedidos WHERE data_pedido IS NOT NULL GROUP BY cliente_nome"
  ).all<{ cliente_nome: string; primeira: string | null }>();
  const primeiraDe = new Map<string, string | null>();
  for (const r of primeiras.results) primeiraDe.set(r.cliente_nome, r.primeira);

  const pedidos = results
    .filter((r) => (limparVendedor(r.vendedor) || "(sem vendedor)") === vend)
    .map((r) => {
      const primeira = primeiraDe.get(r.cliente_nome) || null;
      // novo: a 1ª compra do cliente caiu dentro do período (ou é este pedido).
      const novo = de ? !!(primeira && primeira >= de) : !!(primeira && r.data_pedido && primeira >= r.data_pedido);
      return {
        id: r.id,
        numero: r.numero_erp,
        cliente: r.cliente_nome,
        data: r.data_pedido,
        pecas: Number(r.pecas) || 0,
        valor: Number(r.valor) || 0,
        clienteNovo: novo,
      };
    });
  const totais = pedidos.reduce((t, p) => ({ pedidos: t.pedidos + 1, pecas: t.pecas + p.pecas, valor: t.valor + p.valor, novos: t.novos + (p.clienteNovo ? 1 : 0) }), { pedidos: 0, pecas: 0, valor: 0, novos: 0 });
  return c.json({ vendedor: vend, pedidos, totais });
});
