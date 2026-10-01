// Comercial / CRM: cadastro de representantes e vendas por representante.
import { Hono } from "hono";
import type { Env } from "../index";
import { enviarWhatsapp } from "./atendimento";
import { exigirAlgumaFuncao } from "../permissoes";

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

// ── ENVIO AUTOMÁTICO do relatório semanal no WhatsApp ────────────────────────────
// Cada representante recebe o DELE; o gestor recebe um resumo GERAL. Dispara toda
// segunda de manhã (guardas no cron). Começa DESLIGADO (config relatorio_vendas_ativo).
const moneyBR = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const diaBR = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : iso || "—");
const cfgLer = async (env: Env, k: string) => ((await env.DB.prepare("SELECT valor FROM config WHERE chave=?").bind(k).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
const cfgSet = async (env: Env, k: string, v: string) => { await env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES (?, ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(k, v).run(); };

type RelRep = Extract<Awaited<ReturnType<typeof montarRelatorio>>, { tipo: "rep" }>;
type RelGeral = Extract<Awaited<ReturnType<typeof montarRelatorio>>, { tipo: "geral" }>;

function textoRelatorioRep(rel: RelRep): string {
  const { periodo, semana, mes, mesPeriodo, comissaoPct } = rel;
  const linhas = [
    `📊 *Vendas da semana* — ${rel.rep}`,
    `${diaBR(periodo.de)} a ${diaBR(periodo.ate)}`,
    ``,
    `🗓️ Semana: *${moneyBR(semana.valor)}* · ${semana.pedidos} pedido(s) · ${semana.pecas} peça(s)`,
    `📅 Mês (até ${diaBR(mesPeriodo.ate)}): ${moneyBR(mes.valor)} · ${mes.pedidos} pedido(s)`,
  ];
  if (comissaoPct != null) linhas.push(`💰 Comissão (semana): ${moneyBR(semana.valor * comissaoPct / 100)} (${comissaoPct}%)`);
  if (rel.topProdutos && rel.topProdutos.length) {
    linhas.push(``, `🏆 Top produtos:`);
    for (const t of rel.topProdutos) linhas.push(`• ${t.produto} — ${moneyBR(t.valor)}`);
  }
  linhas.push(``, `💛 Bom trabalho!`);
  return linhas.join("\n");
}

function textoRelatorioGeral(rel: RelGeral): string {
  const { periodo, semana, mes, mesPeriodo } = rel;
  const linhas = [
    `📊 *Vendas da semana — GERAL*`,
    `${diaBR(periodo.de)} a ${diaBR(periodo.ate)}`,
    ``,
    `Total: *${moneyBR(semana.totais.valor)}* · ${semana.totais.pedidos} pedido(s) · ${semana.totais.pecas} peça(s)`,
    `Mês (até ${diaBR(mesPeriodo.ate)}): ${moneyBR(mes.totais.valor)}`,
  ];
  if (semana.lista.length) {
    linhas.push(``, `🏅 Ranking da semana:`);
    semana.lista.slice(0, 15).forEach((r, i) => linhas.push(`${i + 1}. ${r.vendedor} — ${moneyBR(r.valor)} (${r.pedidos} ped.)`));
  }
  return linhas.join("\n");
}

// Executa o envio. opts.force ignora as guardas (usado pelo botão de teste).
export async function enviarRelatoriosSemanais(env: Env, opts: { force?: boolean; soGestor?: boolean } = {}): Promise<{ enviados: number; reps: number; de: string; ate: string; gestor: boolean }> {
  const agoraBR = new Date(Date.now() - 3 * 3600 * 1000);
  if (!opts.force) {
    if (agoraBR.getUTCDay() !== 1) return { enviados: 0, reps: 0, de: "", ate: "", gestor: false };   // só segunda
    if (agoraBR.getUTCHours() < 7) return { enviados: 0, reps: 0, de: "", ate: "", gestor: false };    // só de manhã
    if (await cfgLer(env, "relatorio_vendas_ativo") !== "1") return { enviados: 0, reps: 0, de: "", ate: "", gestor: false };
    const hoje = agoraBR.toISOString().slice(0, 10);
    if (await cfgLer(env, "relatorio_vendas_ultimo") === hoje) return { enviados: 0, reps: 0, de: "", ate: "", gestor: false };
    await cfgSet(env, "relatorio_vendas_ultimo", hoje);
  }
  const { de, ate } = semanaPassada(agoraBR);
  let enviados = 0, totalReps = 0;
  if (!opts.soGestor) {
    const { results: reps } = await env.DB.prepare(
      "SELECT nome, whatsapp FROM representantes WHERE ativo = 1 AND whatsapp IS NOT NULL AND TRIM(whatsapp) <> ''"
    ).all<{ nome: string; whatsapp: string }>();
    totalReps = reps.length;
    for (const r of reps) {
      const rel = await montarRelatorio(env, r.nome, de, ate);
      if (rel.tipo !== "rep") continue;
      const res = await enviarWhatsapp(env, r.whatsapp, { tipo: "texto", texto: textoRelatorioRep(rel) }).catch(() => ({ enviado: false }));
      if (res.enviado) enviados++;
    }
  }
  // Resumo geral pro gestor.
  const num = (await cfgLer(env, "relatorio_vendas_wpp")) || (await cfgLer(env, "estoque_min_wpp"));
  let gestor = false;
  if (num) {
    const geral = await montarRelatorio(env, "geral", de, ate);
    if (geral.tipo === "geral") {
      const res = await enviarWhatsapp(env, num, { tipo: "texto", texto: textoRelatorioGeral(geral) }).catch(() => ({ enviado: false }));
      gestor = !!res.enviado;
    }
  }
  return { enviados, reps: totalReps, de, ate, gestor };
}

// Liga/desliga + número do gestor pro relatório semanal.
comercial.get("/relatorio/config", async (c) => {
  const g = await exigirAlgumaFuncao(c, ["comercial", "pedidos"]); if ("erro" in g) return g.erro;
  return c.json({
    ativo: (await cfgLer(c.env, "relatorio_vendas_ativo")) === "1",
    numero: (await cfgLer(c.env, "relatorio_vendas_wpp")) || (await cfgLer(c.env, "estoque_min_wpp")) || "",
  });
});
comercial.post("/relatorio/config", async (c) => {
  const g = await exigirAlgumaFuncao(c, ["comercial", "pedidos"]); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ ativo?: boolean; numero?: string }>().catch(() => ({} as { ativo?: boolean; numero?: string }));
  if (b.ativo !== undefined) await cfgSet(c.env, "relatorio_vendas_ativo", b.ativo ? "1" : "0");
  if (b.numero !== undefined) await cfgSet(c.env, "relatorio_vendas_wpp", (b.numero || "").trim());
  return c.json({ ok: true });
});

// Teste: envia AGORA o resumo geral pro gestor (não manda pros representantes).
comercial.post("/relatorio/testar", async (c) => {
  const g = await exigirAlgumaFuncao(c, ["comercial", "pedidos"]); if ("erro" in g) return g.erro;
  const num = (await cfgLer(c.env, "relatorio_vendas_wpp")) || (await cfgLer(c.env, "estoque_min_wpp"));
  if (!num) return c.json({ error: "numero_nao_configurado" }, 400);
  const r = await enviarRelatoriosSemanais(c.env, { force: true, soGestor: true });
  return c.json({ ok: r.gestor, numero: num, de: r.de, ate: r.ate });
});
