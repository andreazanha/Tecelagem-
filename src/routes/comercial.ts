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
    "SELECT id, nome, whatsapp, email, ativo, observacao, ufs, instagram, cidades, comissao FROM representantes ORDER BY nome"
  ).all();
  return c.json(results);
});

representantes.post("/", async (c) => {
  const b = await c.req.json<{ id?: string; nome?: string; whatsapp?: string; email?: string; ativo?: boolean | number; observacao?: string; ufs?: string; instagram?: string; cidades?: string; comissao?: number | string }>().catch(() => ({}) as Record<string, never>);
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  // Normaliza a carteira de UFs: "mg, sp ; go" → "MG,SP,GO".
  const ufs = (b.ufs || "").split(/[,;\s]+/).map((u) => u.trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u)).join(",") || null;
  const cidades = (b.cidades || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).join(", ") || null;
  const comissao = b.comissao != null && String(b.comissao).trim() !== "" ? Number(String(b.comissao).replace(",", ".")) : null;
  const existe = b.id ? await c.env.DB.prepare("SELECT id FROM representantes WHERE id = ?").bind(b.id).first() : null;
  const id = b.id || uid();
  await c.env.DB.prepare(
    `INSERT INTO representantes (id, nome, whatsapp, email, ativo, observacao, ufs, instagram, cidades, comissao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, whatsapp = excluded.whatsapp, email = excluded.email,
       ativo = excluded.ativo, observacao = excluded.observacao, ufs = excluded.ufs, instagram = excluded.instagram,
       cidades = excluded.cidades, comissao = excluded.comissao`
  )
    .bind(id, nome, (b.whatsapp || "").trim() || null, (b.email || "").trim() || null, b.ativo === false || b.ativo === 0 ? 0 : 1, (b.observacao || "").trim() || null, ufs, (b.instagram || "").trim() || null, cidades, Number.isFinite(comissao as number) ? comissao : null)
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

// ── RELATÓRIO DE VENDAS (semana + mês, por representante ou geral) ────────────────
// Base do relatório semanal: reúne, para um período, o total por representante, e
// calcula em paralelo o acumulado do mês. Usado pela tela, pelo PDF e pelo envio.
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

// Última semana COMPLETA (domingo→sábado) já encerrada antes de hoje.
export function semanaPassada(hoje = new Date()): { de: string; ate: string } {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const dow = d.getUTCDay();                       // 0=domingo … 6=sábado
  const voltaAteSabado = dow === 6 ? 7 : dow + 1;  // dias até o sábado anterior
  const sab = new Date(d); sab.setUTCDate(d.getUTCDate() - voltaAteSabado);
  const dom = new Date(sab); dom.setUTCDate(sab.getUTCDate() - 6);
  return { de: isoDia(dom), ate: isoDia(sab) };
}
// Mês corrente até a data de referência (1º dia → ate).
const mesAte = (ate: string) => ({ de: `${ate.slice(0, 7)}-01`, ate });

// Agrega vendas por representante no período (mesma conta do /vendas: Σ qtd×preço).
async function agregarVendas(env: Env, de: string, ate: string) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.vendedor, COALESCE(SUM(i.qtd),0) AS pecas, COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE COALESCE(p.reposicao,0)=0 AND p.data_pedido >= ? AND p.data_pedido <= ?
      GROUP BY p.id`
  ).bind(de, ate).all<{ vendedor: string | null; pecas: number; valor: number }>();
  const map = new Map<string, { vendedor: string; pedidos: number; pecas: number; valor: number }>();
  for (const r of results) {
    const nome = limparVendedor(r.vendedor) || "(sem vendedor)";
    const g = map.get(nome) || { vendedor: nome, pedidos: 0, pecas: 0, valor: 0 };
    g.pedidos += 1; g.pecas += Number(r.pecas) || 0; g.valor += Number(r.valor) || 0;
    map.set(nome, g);
  }
  const lista = [...map.values()].sort((a, b) => b.valor - a.valor);
  const totais = lista.reduce((t, g) => ({ pedidos: t.pedidos + g.pedidos, pecas: t.pecas + g.pecas, valor: t.valor + g.valor }), { pedidos: 0, pecas: 0, valor: 0 });
  return { lista, totais };
}
const doRep = (a: { vendedor: string; pedidos: number; pecas: number; valor: number }[], rep: string) =>
  a.find((x) => x.vendedor === rep) || { vendedor: rep, pedidos: 0, pecas: 0, valor: 0 };

// Vendas por dia da semana (Σ por data_pedido) de UM representante.
async function vendasPorDia(env: Env, rep: string, de: string, ate: string) {
  const { results } = await env.DB.prepare(
    `SELECT p.data_pedido AS dia, p.vendedor, COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE COALESCE(p.reposicao,0)=0 AND p.data_pedido >= ? AND p.data_pedido <= ?
      GROUP BY p.id`
  ).bind(de, ate).all<{ dia: string | null; vendedor: string | null; valor: number }>();
  const porDia = new Map<string, number>();
  for (const r of results) {
    if ((limparVendedor(r.vendedor) || "(sem vendedor)") !== rep || !r.dia) continue;
    porDia.set(r.dia, (porDia.get(r.dia) || 0) + (Number(r.valor) || 0));
  }
  return [...porDia.entries()].map(([dia, valor]) => ({ dia, valor })).sort((a, b) => a.dia.localeCompare(b.dia));
}

// Top produtos (Σ valor) de UM representante no período.
async function topProdutos(env: Env, rep: string, de: string, ate: string, limite = 5) {
  const { results } = await env.DB.prepare(
    `SELECT p.vendedor, i.produto, COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor
       FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
      WHERE COALESCE(p.reposicao,0)=0 AND p.data_pedido >= ? AND p.data_pedido <= ?
      GROUP BY p.id, i.produto`
  ).bind(de, ate).all<{ vendedor: string | null; produto: string; valor: number }>();
  const map = new Map<string, number>();
  for (const r of results) {
    if ((limparVendedor(r.vendedor) || "(sem vendedor)") !== rep) continue;
    map.set(r.produto, (map.get(r.produto) || 0) + (Number(r.valor) || 0));
  }
  const ord = [...map.entries()].map(([produto, valor]) => ({ produto, valor })).sort((a, b) => b.valor - a.valor);
  const top = ord.slice(0, limite);
  const outros = ord.slice(limite).reduce((s, x) => s + x.valor, 0);
  if (outros > 0) top.push({ produto: "Outros", valor: outros });
  return top;
}

// Monta o relatório completo (dados prontos pra tela e pro PDF).
export async function montarRelatorio(env: Env, rep: string, de: string, ate: string) {
  const mes = mesAte(ate);
  const [semAgg, mesAgg] = await Promise.all([agregarVendas(env, de, ate), agregarVendas(env, mes.de, mes.ate)]);
  const geral = !rep || rep.toLowerCase() === "todos" || rep.toLowerCase() === "geral";
  if (geral) {
    return { tipo: "geral" as const, periodo: { de, ate }, mesPeriodo: mes, semana: semAgg, mes: mesAgg };
  }
  const comissaoRow = await env.DB.prepare("SELECT comissao FROM representantes WHERE lower(nome)=lower(?) LIMIT 1").bind(rep).first<{ comissao: number | null }>().catch(() => null);
  const [porDia, top] = await Promise.all([vendasPorDia(env, rep, de, ate), topProdutos(env, rep, de, ate)]);
  return {
    tipo: "rep" as const, rep, periodo: { de, ate }, mesPeriodo: mes,
    comissaoPct: comissaoRow?.comissao ?? null,
    semana: doRep(semAgg.lista, rep),
    mes: doRep(mesAgg.lista, rep),
    porDia, topProdutos: top,
  };
}

comercial.get("/relatorio", async (c) => {
  const rep = (c.req.query("rep") || "").trim();
  let de = (c.req.query("de") || "").trim();
  let ate = (c.req.query("ate") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    const w = semanaPassada(); de = w.de; ate = w.ate;
  }
  return c.json(await montarRelatorio(c.env, rep, de, ate));
});
