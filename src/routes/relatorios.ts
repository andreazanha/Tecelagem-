import { Hono } from "hono";
import type { Env } from "../index";

export const relatorios = new Hono<{ Bindings: Env }>();

// Relatório de vendas por produto/cor/tamanho, com peças e faturamento.
// Filtro opcional por período (de/ate, yyyy-mm-dd). Ignora kits (foco nas
// peças de produção). Base: pedido_itens × pedidos.
relatorios.get("/vendas", async (c) => {
  const de = (c.req.query("de") || "").trim();
  const ate = (c.req.query("ate") || "").trim();
  const kits = (c.req.query("kits") || "todos").toLowerCase(); // todos | so | sem
  const dataExpr = "COALESCE(NULLIF(p.data_pedido,''), date(p.created_at))";
  const cond = ["i.qtd > 0"];
  if (kits === "so") cond.push("COALESCE(i.kit,0) = 1");
  else if (kits === "sem") cond.push("COALESCE(i.kit,0) = 0");
  const binds: unknown[] = [];
  if (de) { cond.push(`${dataExpr} >= ?`); binds.push(de); }
  if (ate) { cond.push(`${dataExpr} <= ?`); binds.push(ate); }
  const base = `FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE ${cond.join(" AND ")}`;
  const pecas = "SUM(i.qtd)";
  const valor = "SUM(i.qtd * i.valor_unit)";
  const run = async (sel: string, extra: string) =>
    (await c.env.DB.prepare(`SELECT ${sel} ${base} ${extra}`).bind(...binds).all()).results;

  const resumo = await c.env.DB.prepare(
    `SELECT ${pecas} AS pecas, ${valor} AS valor, COUNT(DISTINCT p.id) AS pedidos, COUNT(DISTINCT i.produto) AS modelos ${base}`
  ).bind(...binds).first();

  const modelos = await run(
    `i.produto AS produto, MAX(COALESCE(i.kit,0)) AS kit, ${pecas} AS pecas, ${valor} AS valor, COUNT(DISTINCT i.cor_grade) AS cores, COUNT(DISTINCT i.tamanho) AS tamanhos`,
    "GROUP BY i.produto ORDER BY pecas DESC");
  const cores = await run(`COALESCE(NULLIF(i.cor_grade,''),'—') AS cor, ${pecas} AS pecas, ${valor} AS valor`, "GROUP BY cor ORDER BY pecas DESC");
  const tamanhos = await run(`COALESCE(NULLIF(i.tamanho,''),'—') AS tamanho, ${pecas} AS pecas, ${valor} AS valor`, "GROUP BY tamanho ORDER BY pecas DESC");
  const combos = await run(
    `i.produto AS produto, MAX(COALESCE(i.kit,0)) AS kit, COALESCE(NULLIF(i.cor_grade,''),'—') AS cor, COALESCE(NULLIF(i.tamanho,''),'—') AS tamanho, ${pecas} AS pecas, ${valor} AS valor`,
    "GROUP BY i.produto, cor, tamanho ORDER BY pecas DESC LIMIT 40");
  const porModeloCor = await run(`i.produto AS produto, COALESCE(NULLIF(i.cor_grade,''),'—') AS cor, ${pecas} AS pecas`, "GROUP BY i.produto, cor ORDER BY i.produto, pecas DESC");
  const porModeloTam = await run(`i.produto AS produto, COALESCE(NULLIF(i.tamanho,''),'—') AS tamanho, ${pecas} AS pecas`, "GROUP BY i.produto, tamanho ORDER BY i.produto, pecas DESC");

  return c.json({ resumo, modelos, cores, tamanhos, combos, porModeloCor, porModeloTam });
});
