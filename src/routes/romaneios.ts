import { Hono } from "hono";
import type { Env } from "../index";
import { romaneioCostura, criarCatalogo, type ItemBase } from "../classificar";
import { gerarRomaneioCostura, type PedidoInfo } from "../pdf";

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

// LISTA dos pedidos que vão para produção (têm peças a costurar), com o romaneio já somado.
// Pedidos puramente de pronta-entrega de cliente (venda) não aparecem (não produzem).
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
    if (rom.totalPecas <= 0) continue; // sem produção (ex.: pronta-entrega de cliente)
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

// GERA o PDF do romaneio de costura (2 vias) já preenchido e devolve a URL.
romaneios.post("/:id", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT * FROM pedidos WHERE id = ?")
    .bind(id)
    .first<Record<string, string>>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const body = await c.req.json<{ prestador?: string }>().catch(() => ({}) as { prestador?: string });
  const prestador = (body.prestador || "").trim();

  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, kit FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const cat = await catalogoDe(c.env);
  const rom = romaneioCostura(itens, !!Number(ped.reposicao), cat);
  if (rom.totalPecas <= 0) return c.json({ error: "Pedido sem peças de produção para o romaneio." }, 400);

  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero: ped.codigo_pai || ped.numero_erp || id.slice(0, 8),
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
  };
  const bytes = await gerarRomaneioCostura(info, prestador, rom);
  await c.env.BUCKET.put(`pedidos/${id}/romaneio-costura.pdf`, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  return c.json({ ok: true, url: `/api/pedidos/${id}/pdf/romaneio-costura`, ...rom });
});
