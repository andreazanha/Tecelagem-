// Assistente (copiloto) do Big Tricot: responde perguntas em português usando os
// NÚMEROS REAIS do sistema. O backend monta um "retrato" atual dos dados e a IA
// (Workers AI) só interpreta/explica — não inventa número.
import { Hono } from "hono";
import type { Env } from "../index";
import { limparVendedor } from "./comercial";

export const assistente = new Hono<{ Bindings: Env }>();

const n = (v: unknown) => Number(v) || 0;

// Monta um retrato compacto do estado atual do ERP (produção, atrasos, estoque, vendas).
async function retrato(env: Env): Promise<string> {
  const linhas: string[] = [];

  // Produção por setor
  const prod = await env.DB.prepare("SELECT setor, COUNT(*) AS n, COALESCE(SUM(pecas),0) AS pc FROM producao GROUP BY setor").all<{ setor: string; n: number; pc: number }>();
  if (prod.results.length) linhas.push("PRODUÇÃO (cards por setor): " + prod.results.map((r) => `${r.setor}=${r.n} card(s)/${r.pc} pç`).join(", "));

  // Pedidos atrasados (entrega já passou e ainda estão em produção)
  const atr = await env.DB.prepare(
    `SELECT p.numero_erp, COALESCE(NULLIF(pr.cliente,''), p.cliente_nome) AS cliente, p.data_entrega, pr.setor
       FROM producao pr JOIN pedidos p ON p.id = pr.pedido_id
      WHERE p.data_entrega IS NOT NULL AND p.data_entrega < date('now')
      ORDER BY p.data_entrega LIMIT 12`
  ).all<{ numero_erp: string | null; cliente: string; data_entrega: string; setor: string }>();
  linhas.push(`PEDIDOS ATRASADOS: ${atr.results.length}` + (atr.results.length ? " — " + atr.results.map((r) => `#${r.numero_erp || "?"} ${r.cliente} (entrega ${r.data_entrega}, em ${r.setor})`).join("; ") : ""));

  // Produtos com estoque baixo
  const est = await env.DB.prepare(
    `SELECT nome, cor, tamanho, estoque, estoque_min FROM produtos
      WHERE ativo=1 AND estoque_min>0 AND estoque<=estoque_min
      ORDER BY (CAST(estoque AS REAL)/estoque_min) ASC LIMIT 15`
  ).all<{ nome: string; cor: string | null; tamanho: string | null; estoque: number; estoque_min: number }>();
  linhas.push(`PRODUTOS EM FALTA (estoque ≤ mínimo): ${est.results.length}` + (est.results.length ? " — " + est.results.map((r) => `${r.nome}${r.cor ? " " + r.cor : ""}${r.tamanho ? " " + r.tamanho : ""} (${r.estoque}/${r.estoque_min})`).join("; ") : ""));

  // Insumos com estoque baixo
  const ins = await env.DB.prepare(
    `SELECT nome, cor, estoque, estoque_min FROM insumos WHERE estoque_min>0 AND estoque<=estoque_min ORDER BY estoque LIMIT 12`
  ).all<{ nome: string; cor: string | null; estoque: number; estoque_min: number }>();
  linhas.push(`INSUMOS EM FALTA: ${ins.results.length}` + (ins.results.length ? " — " + ins.results.map((r) => `${r.nome}${r.cor ? " " + r.cor : ""} (${r.estoque}/${r.estoque_min})`).join("; ") : ""));

  // Reposições aguardando aprovação
  const rep = await env.DB.prepare("SELECT COUNT(*) AS n FROM reposicao_alertas WHERE status='pendente'").first<{ n: number }>();
  linhas.push(`REPOSIÇÕES AGUARDANDO APROVAÇÃO: ${n(rep?.n)}`);

  // Vendas do mês por vendedor (top 5)
  const vend = await env.DB.prepare(
    `SELECT p.vendedor, COALESCE(SUM(i.qtd*i.valor_unit),0) AS valor, COALESCE(SUM(i.qtd),0) AS pc
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id=p.id
      WHERE COALESCE(p.reposicao,0)=0 AND p.data_pedido >= date('now','start of month')
      GROUP BY p.id`
  ).all<{ vendedor: string | null; valor: number; pc: number }>();
  const mapV = new Map<string, { valor: number; pc: number }>();
  for (const r of vend.results) {
    const nome = limparVendedor(r.vendedor) || "(sem vendedor)";
    const g = mapV.get(nome) || { valor: 0, pc: 0 };
    g.valor += n(r.valor); g.pc += n(r.pc); mapV.set(nome, g);
  }
  const topV = [...mapV.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 5);
  if (topV.length) linhas.push("VENDAS DO MÊS (por representante): " + topV.map(([nome, g]) => `${nome} R$ ${g.valor.toFixed(2)} (${g.pc} pç)`).join("; "));

  return linhas.join("\n");
}

assistente.post("/", async (c) => {
  const b = await c.req.json<{ pergunta?: string }>().catch(() => ({}) as { pergunta?: string });
  const pergunta = (b.pergunta || "").trim();
  if (!pergunta) return c.json({ error: "faça uma pergunta" }, 400);

  const dados = await retrato(c.env);
  const hoje = new Date().toISOString().slice(0, 10);
  const sistema =
    "Você é o assistente do ERP têxtil 'Big Tricot'. Responda em português do Brasil, de forma curta e direta (no máximo alguns tópicos). " +
    "Use SOMENTE os dados do RETRATO abaixo — nunca invente números, nomes ou datas. Se a resposta não estiver nos dados, diga que não tem essa informação no sistema. " +
    `Hoje é ${hoje}.\n\nRETRATO ATUAL DO SISTEMA:\n${dados}`;

  try {
    const res = await (c.env.AI as unknown as { run: (m: string, o: unknown) => Promise<{ response?: string }> }).run(
      "@cf/meta/llama-3.1-8b-instruct",
      { messages: [{ role: "system", content: sistema }, { role: "user", content: pergunta }], max_tokens: 512 }
    );
    const resposta = (res?.response || "").trim() || "Não consegui gerar uma resposta agora.";
    return c.json({ resposta, dados });
  } catch (e) {
    return c.json({ error: "IA indisponível: " + (e as Error).message, dados }, 502);
  }
});
