import { Hono } from "hono";
import type { Env } from "../index";
import { romaneioCostura, romaneioTassel, criarCatalogo, type ItemBase, type RomaneioCostura } from "../classificar";
import { gerarRomaneioCostura, type PedidoInfo, type ServicoLinha } from "../pdf";

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
  const lista = [];
  for (const p of peds) {
    const its = porPedido.get(p.id) || [];
    const rom = romaneioCostura(its, !!Number(p.reposicao), cat);
    if (rom.totalPecas <= 0) continue;
    lista.push({
      pedido_id: p.id,
      numero: p.codigo_pai || p.numero_erp || p.id.slice(0, 8),
      cliente_nome: p.cliente_nome,
      data_pedido: p.data_pedido,
      data_entrega: p.data_entrega,
      reposicao: !!Number(p.reposicao),
      ...rom,
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

// PAGAMENTO: resumo por costureira num mês (base p/ pagamento no fim do mês).
// Registrado ANTES de "/:id" para não ser capturado pela rota com parâmetro.
romaneios.get("/pagamento", async (c) => {
  const mes = c.req.query("mes") || ""; // YYYY-MM (filtra por data_saida)
  const { results } = await c.env.DB.prepare(
    `SELECT pedido_id, numero, costureira, total_pecas, total_valor, data_saida, data_retorno
       FROM romaneios_costura ORDER BY costureira, data_saida`
  ).all<{
    pedido_id: string;
    numero: string;
    costureira: string | null;
    total_pecas: number;
    total_valor: number;
    data_saida: string | null;
    data_retorno: string | null;
  }>();
  const filtrados = mes ? results.filter((r) => (r.data_saida || "").slice(0, 7) === mes) : results;
  const porCostureira = new Map<
    string,
    { costureira: string; romaneios: typeof filtrados; totalPecas: number; totalValor: number }
  >();
  for (const r of filtrados) {
    const nome = r.costureira || "— sem costureira —";
    const g = porCostureira.get(nome) || { costureira: nome, romaneios: [], totalPecas: 0, totalValor: 0 };
    g.romaneios.push(r);
    g.totalPecas += r.total_pecas || 0;
    g.totalValor += r.total_valor || 0;
    porCostureira.set(nome, g);
  }
  const grupos = [...porCostureira.values()].sort((a, b) => a.costureira.localeCompare(b.costureira, "pt"));
  const totalGeral = grupos.reduce((s, g) => s + g.totalValor, 0);
  return c.json({ mes, grupos, totalGeral });
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
    .json<{ prestador?: string; volumes?: string; dataRetorno?: string }>()
    .catch(() => ({}) as { prestador?: string; volumes?: string; dataRetorno?: string });
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

  // Salva/atualiza o registro do romaneio (base da costureira p/ pagamento).
  await c.env.DB.prepare(
    `INSERT INTO romaneios_costura
       (pedido_id, numero, costureira, volumes, total_pecas, total_valor, data_saida, data_retorno, servicos, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(pedido_id) DO UPDATE SET
       numero = excluded.numero, costureira = excluded.costureira, volumes = excluded.volumes,
       total_pecas = excluded.total_pecas, total_valor = excluded.total_valor,
       data_saida = excluded.data_saida, data_retorno = excluded.data_retorno,
       servicos = excluded.servicos, updated_at = datetime('now')`
  )
    .bind(
      id,
      numero,
      prestador || null,
      volumes || null,
      rom.totalPecas,
      totalValor,
      dataSaidaISO,
      dataRetornoISO || null,
      JSON.stringify(linhas)
    )
    .run();

  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-costura`, totalValor, servicos: linhas, ...rom });
});
