import { Hono } from "hono";
import type { Env } from "../index";
import { romaneioCostura, romaneioTassel, criarCatalogo, type ItemBase, type RomaneioCostura } from "../classificar";
import { gerarRomaneioCostura, gerarRomaneioTassel, gerarRelatorioPagamento, type PedidoInfo, type ServicoLinha } from "../pdf";

export const romaneios = new Hono<{ Bindings: Env }>();

async function catalogoDe(env: Env) {
  const m = await env.DB.prepare(
    "SELECT nome, parte, composicao, ref, tassel_peseira, tassel_almofada FROM modelos"
  ).all();
  return criarCatalogo(m.results as never[]);
}
function br(iso?: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

interface CosturaServico {
  nome: string;
  valor: number;
  agrupamento: string;
}
async function servicosCostura(env: Env): Promise<CosturaServico[]> {
  const { results } = await env.DB.prepare(
    "SELECT nome, valor, agrupamento FROM costura ORDER BY nome"
  ).all<CosturaServico>();
  return results;
}
async function tabelaTassel(env: Env): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare("SELECT cor, tamanho, valor FROM tasseis").all<{
    cor: string;
    tamanho: string;
    valor: number;
  }>();
  const m: Record<string, number> = {};
  for (const r of results) m[`${(r.cor || "").trim().toUpperCase()}|${(r.tamanho || "").trim().toUpperCase()}`] = Number(r.valor) || 0;
  return m;
}

// Monta as linhas do romaneio: cada serviço cadastrado cobra a família dele
// (peseira_manta / almofada_capa / todas). Qtd vem das peças somadas.
function montarServicos(servicos: CosturaServico[], rom: RomaneioCostura): { linhas: ServicoLinha[]; totalValor: number } {
  const linhas: ServicoLinha[] = [];
  for (const s of servicos) {
    const qtd =
      s.agrupamento === "peseira_manta" ? rom.peseirasMantas : s.agrupamento === "almofada_capa" ? rom.almofadasCapas : rom.totalPecas;
    if (qtd <= 0) continue;
    const valorUnit = Math.max(0, Number(s.valor) || 0);
    linhas.push({ nome: s.nome, agrupamento: s.agrupamento, qtd, valorUnit, total: qtd * valorUnit });
  }
  const totalValor = linhas.reduce((sum, l) => sum + l.total, 0);
  return { linhas, totalValor };
}

// LISTA dos pedidos que vão para produção (têm peças a costurar), com o romaneio já somado.
romaneios.get("/pedidos", async (c) => {
  const cat = await catalogoDe(c.env);
  const { results: peds } = await c.env.DB.prepare(
    `SELECT id, numero_erp, codigo_pai, cliente_nome, data_pedido, data_entrega, reposicao, created_at
       FROM pedidos ORDER BY created_at DESC`
  ).all<{
    id: string;
    numero_erp: string | null;
    codigo_pai: string | null;
    cliente_nome: string;
    data_pedido: string | null;
    data_entrega: string | null;
    reposicao: number;
    created_at: string;
  }>();
  const { results: itens } = await c.env.DB.prepare(
    "SELECT pedido_id, produto, ref, cor_grade, tamanho, qtd, parte, kit FROM pedido_itens"
  ).all<ItemBase & { pedido_id: string }>();
  const porPedido = new Map<string, ItemBase[]>();
  for (const it of itens) {
    const a = porPedido.get(it.pedido_id) || [];
    a.push(it);
    porPedido.set(it.pedido_id, a);
  }
  const valoresTassel = await tabelaTassel(c.env);
  const lista = [];
  for (const p of peds) {
    const its = porPedido.get(p.id) || [];
    const rom = romaneioCostura(its, !!Number(p.reposicao), cat);
    if (rom.totalPecas <= 0) continue;
    const tassel = romaneioTassel(its, cat, valoresTassel);
    lista.push({
      pedido_id: p.id,
      numero: p.codigo_pai || p.numero_erp || p.id.slice(0, 8),
      cliente_nome: p.cliente_nome,
      data_pedido: p.data_pedido,
      data_entrega: p.data_entrega,
      reposicao: !!Number(p.reposicao),
      ...rom,
      temTassel: tassel.linhas.length > 0,
      tasselTasseis: tassel.totalTasseis,
      tasselValor: tassel.totalValor,
    });
  }
  return c.json(lista);
});

// Carrega tudo de um pedido para o romaneio (cabeçalho + peças somadas).
async function dadosPedido(env: Env, id: string) {
  const ped = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(id).first<Record<string, string>>();
  if (!ped) return null;
  const { results: itens } = await env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, kit FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const cat = await catalogoDe(env);
  const rom = romaneioCostura(itens, !!Number(ped.reposicao), cat);
  return { ped, rom, itens, cat };
}

// Mapeamento por tipo (costura | tassel) para reuso nos endpoints de emitidos.
const tipoOk = (t: string) => (t === "tassel" ? "tassel" : "costura");
const tabelaDe = (t: string) => (t === "tassel" ? "romaneios_tassel" : "romaneios_costura");
const pessoaCol = (t: string) => (t === "tassel" ? "prestador" : "costureira");
const qtdCol = (t: string) => (t === "tassel" ? "total_tasseis" : "total_pecas");
const pdfNome = (t: string) => (t === "tassel" ? "romaneio-tassel" : "romaneio-costura");

interface EmitidoRow {
  pedido_id: string;
  numero: string;
  pessoa: string | null;
  total_pecas: number;
  total_valor: number;
  data_saida: string | null;
  data_retorno: string | null;
  data_retorno_real: string | null;
  retornou: number;
}
// Resumo de pagamento por prestador (costureira/tasselista) num mês.
async function resumoPagamento(env: Env, mes: string, tipo: string, costureira: string) {
  const pcol = pessoaCol(tipo);
  const { results } = await env.DB.prepare(
    `SELECT pedido_id, numero, ${pcol} AS pessoa, ${qtdCol(tipo)} AS total_pecas, total_valor,
            data_saida, data_retorno, data_retorno_real, retornou
       FROM ${tabelaDe(tipo)} WHERE excluido = 0 ORDER BY ${pcol}, data_saida`
  ).all<EmitidoRow>();
  let filtrados = mes ? results.filter((r) => (r.data_saida || "").slice(0, 7) === mes) : results;
  if (costureira) filtrados = filtrados.filter((r) => (r.pessoa || "") === costureira);
  const porPessoa = new Map<string, { costureira: string; romaneios: EmitidoRow[]; totalPecas: number; totalValor: number; pendentes: number; pendentePecas: number; pendenteValor: number }>();
  for (const r of filtrados) {
    const nome = r.pessoa || (tipo === "tassel" ? "— sem prestador —" : "— sem costureira —");
    const g = porPessoa.get(nome) || { costureira: nome, romaneios: [], totalPecas: 0, totalValor: 0, pendentes: 0, pendentePecas: 0, pendenteValor: 0 };
    g.romaneios.push(r);
    // Só os RETORNADOS (liberados) entram no total a pagar; pendentes ficam à parte.
    if (r.retornou) {
      g.totalPecas += r.total_pecas || 0;
      g.totalValor += r.total_valor || 0;
    } else {
      g.pendentes += 1;
      g.pendentePecas += r.total_pecas || 0;
      g.pendenteValor += r.total_valor || 0;
    }
    porPessoa.set(nome, g);
  }
  const grupos = [...porPessoa.values()].sort((a, b) => a.costureira.localeCompare(b.costureira, "pt"));
  const totalGeral = grupos.reduce((s, g) => s + g.totalValor, 0); // liberados
  return { mes, tipo, grupos, totalGeral };
}

// PAGAMENTO (JSON). Registrado ANTES de "/:id" para não cair na rota com parâmetro.
romaneios.get("/pagamento", async (c) => {
  const r = await resumoPagamento(c.env, c.req.query("mes") || "", tipoOk(c.req.query("tipo") || ""), c.req.query("costureira") || "");
  return c.json(r);
});

// LISTA de todos os romaneios emitidos (costura + tassel), com status pendente/retornou.
romaneios.get("/emitidos", async (c) => {
  const filtroTipo = c.req.query("tipo") || ""; // ""|costura|tassel
  const status = c.req.query("status") || ""; // ""|pendente|retornou
  const costureira = c.req.query("costureira") || "";
  const carregar = async (tipo: string) => {
    const { results } = await c.env.DB.prepare(
      `SELECT '${tipo}' AS tipo, pedido_id, numero, cliente, ${pessoaCol(tipo)} AS pessoa, volumes,
              ${qtdCol(tipo)} AS qtd, total_valor, data_saida, data_retorno, data_retorno_real, retornou
         FROM ${tabelaDe(tipo)} WHERE excluido = 0`
    ).all();
    return results as Record<string, unknown>[];
  };
  let lista: Record<string, unknown>[] = [];
  if (filtroTipo !== "tassel") lista = lista.concat(await carregar("costura"));
  if (filtroTipo !== "costura") lista = lista.concat(await carregar("tassel"));
  if (status === "pendente") lista = lista.filter((r) => !r.retornou);
  if (status === "retornou") lista = lista.filter((r) => r.retornou);
  if (costureira) lista = lista.filter((r) => (r.pessoa || "") === costureira);
  lista.sort((a, b) => String(b.data_saida || "").localeCompare(String(a.data_saida || "")));
  return c.json(lista);
});

// Marca/desmarca o RETORNO da costura/prestador.
romaneios.post("/emitido/:tipo/:id/retorno", async (c) => {
  const tipo = tipoOk(c.req.param("tipo"));
  const id = c.req.param("id");
  const b = await c.req.json<{ retornou?: boolean }>().catch(() => ({}) as { retornou?: boolean });
  const v = b.retornou ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE ${tabelaDe(tipo)} SET retornou = ?, data_retorno_real = CASE WHEN ? = 1 THEN date('now') ELSE NULL END, updated_at = datetime('now') WHERE pedido_id = ?`
  )
    .bind(v, v, id)
    .run();
  return c.json({ ok: true, retornou: !!v });
});

// Soft-delete / restaurar (para o undo/redo).
romaneios.post("/emitido/:tipo/:id/excluir", async (c) => {
  const tipo = tipoOk(c.req.param("tipo"));
  const b = await c.req.json<{ excluido?: boolean }>().catch(() => ({}) as { excluido?: boolean });
  await c.env.DB.prepare(`UPDATE ${tabelaDe(tipo)} SET excluido = ?, updated_at = datetime('now') WHERE pedido_id = ?`)
    .bind(b.excluido ? 1 : 0, c.req.param("id"))
    .run();
  return c.json({ ok: true, excluido: !!b.excluido });
});

// Regera o PDF a partir do snapshot salvo (cabeçalho + linhas).
async function regenerarPdf(env: Env, tipo: string, id: string) {
  const r = await env.DB.prepare(`SELECT * FROM ${tabelaDe(tipo)} WHERE pedido_id = ?`).bind(id).first<Record<string, string>>();
  if (!r) return;
  const info: PedidoInfo = { cliente: r.cliente || "—", representante: "—", numero: r.numero, emissao: br(r.data_saida), entrega: "" };
  const opts = { volumes: r.volumes || "", dataSaida: br(r.data_saida), dataRetorno: r.data_retorno ? br(r.data_retorno) : "" };
  if (tipo === "tassel") {
    const linhas = JSON.parse(r.linhas || "[]");
    const bytes = await gerarRomaneioTassel(info, r.prestador || "", { linhas, totalTasseis: Number(r.total_tasseis) || 0, totalValor: Number(r.total_valor) || 0 }, opts);
    await env.BUCKET.put(`pedidos/${id}/romaneio-tassel.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
  } else {
    const servicos = JSON.parse(r.servicos || "[]");
    const totalPecas = Number(r.total_pecas) || 0;
    const rom = { peseirasMantas: 0, almofadasCapas: 0, outros: totalPecas, totalPecas };
    const bytes = await gerarRomaneioCostura(info, r.costureira || "", rom, servicos, Number(r.total_valor) || 0, opts);
    await env.BUCKET.put(`pedidos/${id}/romaneio-costura.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
  }
}

// EDITA um romaneio emitido (prestador, volumes, data de retorno) e regera o PDF.
romaneios.put("/emitido/:tipo/:id", async (c) => {
  const tipo = tipoOk(c.req.param("tipo"));
  const id = c.req.param("id");
  const b = await c.req
    .json<{ prestador?: string; volumes?: string; dataRetorno?: string }>()
    .catch(() => ({}) as { prestador?: string; volumes?: string; dataRetorno?: string });
  await c.env.DB.prepare(
    `UPDATE ${tabelaDe(tipo)} SET ${pessoaCol(tipo)} = ?, volumes = ?, data_retorno = ?, updated_at = datetime('now') WHERE pedido_id = ?`
  )
    .bind((b.prestador || "").trim() || null, (b.volumes || "").trim() || null, (b.dataRetorno || "").trim() || null, id)
    .run();
  await regenerarPdf(c.env, tipo, id);
  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/${pdfNome(tipo)}` });
});

// PDF do relatório de pagamento (Gerar relatório / Baixar PDF).
romaneios.get("/pagamento/pdf", async (c) => {
  const mes = c.req.query("mes") || "";
  const tipo = tipoOk(c.req.query("tipo") || "");
  const costureira = c.req.query("costureira") || "";
  const resumo = await resumoPagamento(c.env, mes, tipo, costureira);
  const bytes = await gerarRelatorioPagamento(resumo, tipo);
  return new Response(bytes, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="pagamento-${tipo}-${mes || "tudo"}.pdf"` },
  });
});

// ROMANEIO AVULSO: produtos que NÃO passam pela produção. O usuário informa
// cliente, prestador, datas e as linhas (serviços+qtd p/ costura, ou cor/tam/qtd
// p/ tassel). Os VALORES vêm do cadastro. Gera o PDF e salva p/ pagamento.
// Registrado ANTES de "/:id" para não ser capturado pela rota com parâmetro.
romaneios.post("/avulso", async (c) => {
  const b = await c.req
    .json<{
      tipo?: string;
      cliente?: string;
      numero?: string;
      prestador?: string;
      volumes?: string;
      dataRetorno?: string;
      linhas?: { nome?: string; cor?: string; tamanho?: string; qtd?: number | string }[];
    }>()
    .catch(() => ({}) as Record<string, never>);
  const tipo = b.tipo === "tassel" ? "tassel" : "costura";
  const cliente = (b.cliente || "").trim() || "—";
  const numero = (b.numero || "").trim() || "AVULSO";
  const prestador = (b.prestador || "").trim();
  const volumes = (b.volumes || "").trim();
  const dataRetornoISO = (b.dataRetorno || "").trim();
  const dataSaidaISO = new Date().toISOString().slice(0, 10);
  const entrada = (b.linhas || []).filter((l) => Number(l.qtd) > 0);
  if (!entrada.length) return c.json({ error: "Adicione pelo menos uma linha com quantidade." }, 400);

  const id = `avulso-${crypto.randomUUID()}`;
  const info: PedidoInfo = { cliente, representante: "—", numero, emissao: br(dataSaidaISO), entrega: "" };
  const opts = { volumes, dataSaida: br(dataSaidaISO), dataRetorno: dataRetornoISO ? br(dataRetornoISO) : "" };

  if (tipo === "tassel") {
    const valores = await tabelaTassel(c.env);
    const linhas = entrada.map((l) => {
      const cor = (l.cor || "").trim();
      const tam = (l.tamanho || "G").trim().toUpperCase() === "P" ? "P" : "G";
      const qtd = Math.max(0, Math.trunc(Number(l.qtd) || 0));
      const valorUnit = valores[`${cor.toUpperCase()}|${tam}`] || 0;
      return { cor, tamanho: tam as "G" | "P", tasseis: qtd, valorUnit, total: qtd * valorUnit };
    });
    const totalTasseis = linhas.reduce((s, l) => s + l.tasseis, 0);
    const totalValor = linhas.reduce((s, l) => s + l.total, 0);
    const tassel = { linhas, totalTasseis, totalValor };
    const bytes = await gerarRomaneioTassel(info, prestador, tassel, opts);
    await c.env.BUCKET.put(`pedidos/${id}/romaneio-tassel.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
    await c.env.DB.prepare(
      `INSERT INTO romaneios_tassel (pedido_id, numero, cliente, prestador, volumes, total_tasseis, total_valor, data_saida, data_retorno, linhas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, numero, cliente, prestador || null, volumes || null, totalTasseis, totalValor, dataSaidaISO, dataRetornoISO || null, JSON.stringify(linhas))
      .run();
    return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-tassel`, totalValor });
  }

  // costura
  const mapValor = new Map<string, { valor: number; agrupamento: string }>();
  for (const s of await servicosCostura(c.env)) mapValor.set(s.nome, { valor: Number(s.valor) || 0, agrupamento: s.agrupamento });
  const servicos: ServicoLinha[] = entrada.map((l) => {
    const nome = (l.nome || "").trim();
    const qtd = Math.max(0, Math.trunc(Number(l.qtd) || 0));
    const cad = mapValor.get(nome);
    const valorUnit = cad?.valor || 0;
    return { nome, agrupamento: cad?.agrupamento || "todas", qtd, valorUnit, total: qtd * valorUnit };
  });
  const totalValor = servicos.reduce((s, l) => s + l.total, 0);
  const totalPecas = servicos.reduce((s, l) => s + l.qtd, 0);
  const rom = { peseirasMantas: 0, almofadasCapas: 0, outros: totalPecas, totalPecas };
  const bytes = await gerarRomaneioCostura(info, prestador, rom, servicos, totalValor, opts);
  await c.env.BUCKET.put(`pedidos/${id}/romaneio-costura.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
  await c.env.DB.prepare(
    `INSERT INTO romaneios_costura (pedido_id, numero, cliente, costureira, volumes, total_pecas, total_valor, data_saida, data_retorno, servicos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, numero, cliente, prestador || null, volumes || null, totalPecas, totalValor, dataSaidaISO, dataRetornoISO || null, JSON.stringify(servicos))
    .run();
  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-costura`, totalValor });
});

// DADOS do romaneio (para a tela grande): cabeçalho + serviços (costura, valores
// pré-fixados) + romaneio de tassel (se houver tasseis a fazer).
romaneios.get("/:id", async (c) => {
  const d = await dadosPedido(c.env, c.req.param("id"));
  if (!d) return c.json({ error: "pedido não encontrado" }, 404);
  const { ped, rom, itens, cat } = d;
  const { linhas, totalValor } = montarServicos(await servicosCostura(c.env), rom);
  const tassel = romaneioTassel(itens, cat, await tabelaTassel(c.env));
  return c.json({
    pedido_id: ped.id,
    numero: ped.codigo_pai || ped.numero_erp || ped.id.slice(0, 8),
    cliente_nome: ped.cliente_nome,
    data_pedido: ped.data_pedido,
    data_entrega: ped.data_entrega,
    reposicao: !!Number(ped.reposicao),
    ...rom,
    servicos: linhas,
    totalValor,
    tassel: tassel.linhas.length ? tassel : null,
  });
});

// GERA o PDF do romaneio de costura (2 vias) já preenchido, salva o registro
// (base da costureira p/ pagamento) e devolve a URL.
romaneios.post("/:id", async (c) => {
  const id = c.req.param("id");
  const d = await dadosPedido(c.env, id);
  if (!d) return c.json({ error: "pedido não encontrado" }, 404);
  const { ped, rom } = d;
  if (rom.totalPecas <= 0) return c.json({ error: "Pedido sem peças de produção para o romaneio." }, 400);
  const body = await c.req
    .json<{ prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean }>()
    .catch(() => ({}) as { prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean });
  const prestador = (body.prestador || "").trim();
  const volumes = (body.volumes || "").trim();
  const dataRetornoISO = (body.dataRetorno || "").trim(); // YYYY-MM-DD
  const dataSaidaISO = new Date().toISOString().slice(0, 10);
  const { linhas, totalValor } = montarServicos(await servicosCostura(c.env), rom);

  const numero = ped.codigo_pai || ped.numero_erp || id.slice(0, 8);
  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero,
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
  };
  const bytes = await gerarRomaneioCostura(info, prestador, rom, linhas, totalValor, {
    volumes,
    dataSaida: br(dataSaidaISO),
    dataRetorno: dataRetornoISO ? br(dataRetornoISO) : "",
  });
  await c.env.BUCKET.put(`pedidos/${id}/romaneio-costura.pdf`, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });

  // registrar=false → só visualizar (não grava na base). Senão, salva/atualiza.
  if (body.registrar !== false) {
    await c.env.DB.prepare(
      `INSERT INTO romaneios_costura
         (pedido_id, numero, cliente, costureira, volumes, total_pecas, total_valor, data_saida, data_retorno, servicos, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(pedido_id) DO UPDATE SET
         numero = excluded.numero, cliente = excluded.cliente, costureira = excluded.costureira, volumes = excluded.volumes,
         total_pecas = excluded.total_pecas, total_valor = excluded.total_valor,
         data_saida = excluded.data_saida, data_retorno = excluded.data_retorno,
         servicos = excluded.servicos, excluido = 0, updated_at = datetime('now')`
    )
      .bind(id, numero, ped.cliente_nome, prestador || null, volumes || null, rom.totalPecas, totalValor, dataSaidaISO, dataRetornoISO || null, JSON.stringify(linhas))
      .run();
  }

  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-costura`, totalValor, servicos: linhas, ...rom });
});

// GERA o PDF do romaneio de TASSEL (3 vias) já preenchido, salva o registro
// (base do prestador de tassel p/ pagamento) e devolve a URL.
romaneios.post("/:id/tassel", async (c) => {
  const id = c.req.param("id");
  const d = await dadosPedido(c.env, id);
  if (!d) return c.json({ error: "pedido não encontrado" }, 404);
  const { ped, itens, cat } = d;
  const tassel = romaneioTassel(itens, cat, await tabelaTassel(c.env));
  if (tassel.linhas.length === 0)
    return c.json({ error: "Nenhum tassel a confeccionar. Configure o tassel por peça nos Modelos e a tabela de Tasseis." }, 400);
  const body = await c.req
    .json<{ prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean }>()
    .catch(() => ({}) as { prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean });
  const prestador = (body.prestador || "").trim();
  const volumes = (body.volumes || "").trim();
  const dataRetornoISO = (body.dataRetorno || "").trim();
  const dataSaidaISO = new Date().toISOString().slice(0, 10);

  const numero = ped.codigo_pai || ped.numero_erp || id.slice(0, 8);
  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero,
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
  };
  const bytes = await gerarRomaneioTassel(info, prestador, tassel, {
    volumes,
    dataSaida: br(dataSaidaISO),
    dataRetorno: dataRetornoISO ? br(dataRetornoISO) : "",
  });
  await c.env.BUCKET.put(`pedidos/${id}/romaneio-tassel.pdf`, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  if (body.registrar !== false) {
    await c.env.DB.prepare(
      `INSERT INTO romaneios_tassel
         (pedido_id, numero, cliente, prestador, volumes, total_tasseis, total_valor, data_saida, data_retorno, linhas, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(pedido_id) DO UPDATE SET
         numero = excluded.numero, cliente = excluded.cliente, prestador = excluded.prestador, volumes = excluded.volumes,
         total_tasseis = excluded.total_tasseis, total_valor = excluded.total_valor,
         data_saida = excluded.data_saida, data_retorno = excluded.data_retorno,
         linhas = excluded.linhas, excluido = 0, updated_at = datetime('now')`
    )
      .bind(id, numero, ped.cliente_nome, prestador || null, volumes || null, tassel.totalTasseis, tassel.totalValor, dataSaidaISO, dataRetornoISO || null, JSON.stringify(tassel.linhas))
      .run();
  }
  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-tassel`, ...tassel });
});
