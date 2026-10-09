// LOJA B2B — captura do pedido do cliente (Fase 4).
// A loja (/api/integracao/loja) monta o carrinho e, no "Finalizar pedido", chama
// POST /api/loja/pedido com o CNPJ + itens. Aqui a gente:
//  1) acha o cliente pelo CNPJ (sem pontuação) e confere que não está bloqueado;
//  2) resolve, por item, as CHAVES do Syntech (TAMANHO código + COD_COR) a partir
//     do espelho erp_produtos (fonte autoritativa) — se não achar a cor, RECUSA
//     (não deixa pedido errado ir pro ERP);
//  3) grava em pedidos/pedido_itens num canal próprio ('loja_b2b'), status
//     'aguardando_aprovacao' (fora da produção) e erp_sync_status='pendente'.
// O envio pro Syntech é feito DEPOIS pela ponte (passo 4), atrás da trava erp_liberado.
import { Hono } from "hono";
import type { Env } from "../index";

export const loja = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D+/g, "");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

// Região de PREÇO da loja: Norte+Nordeste usam a tabela "norte"; o resto, "sul".
// (mesma lógica do catálogo em atendimento.ts). A região do CADASTRO tem prioridade.
const UF_NORTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);
function regiaoDeUF(uf?: string | null): "sul" | "norte" {
  return UF_NORTE.has(String(uf || "").trim().toUpperCase()) ? "norte" : "sul";
}
function regiaoDoCliente(lojaRegiao?: string | null, uf?: string | null): "sul" | "norte" {
  const r = String(lojaRegiao || "").trim().toLowerCase();
  if (r === "sul" || r === "norte") return r;
  return regiaoDeUF(uf);
}

type ItemLoja = {
  cod?: string; medida?: string; corNome?: string; corId?: string;
  qtd?: number | string; preco?: number | string; regiao?: string; nome?: string; grupo?: string;
};
type CorErp = { numero?: number; nome?: string };
type TamErp = { medida?: string; tamanho?: string };

// ENTRADA NA LOJA — identifica o cliente pelo CNPJ e devolve nome + região de preço.
// Sem senha (B2B provisório): só confirma que o CNPJ existe e não está bloqueado.
loja.post("/entrar", async (c) => {
  let body: { cnpj?: string } = {};
  try { body = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const cnpjDig = soDigitos(body.cnpj);
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido." }, 400);

  const cli = await c.env.DB.prepare(
    "SELECT nome, uf, loja_regiao, COALESCE(bloqueado,0) AS bloqueado FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string | null; uf: string | null; loja_regiao: string | null; bloqueado: number }>();

  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ no nosso cadastro. Fale com a Big Tricot para liberar seu acesso." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);

  return c.json({ ok: true, nome: cli.nome || "", regiao: regiaoDoCliente(cli.loja_regiao, cli.uf) });
});

loja.post("/pedido", async (c) => {
  let body: { cnpj?: string; itens?: ItemLoja[]; idem?: string } = {};
  try { body = await c.req.json(); } catch { return c.json({ erro: "json_invalido", msg: "Não consegui ler o pedido." }, 400); }

  const cnpjDig = soDigitos(body.cnpj);
  const itensIn = Array.isArray(body.itens) ? body.itens : [];
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido para enviar o pedido." }, 400);
  if (!itensIn.length) return c.json({ erro: "carrinho_vazio", msg: "Seu carrinho está vazio." }, 400);

  // 1) cliente pelo CNPJ (comparando só os dígitos), não bloqueado
  const cli = await c.env.DB.prepare(
    "SELECT id, nome, cnpj, COALESCE(bloqueado,0) AS bloqueado, codigo_erp FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; nome: string | null; cnpj: string | null; bloqueado: number; codigo_erp: string | null }>();
  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ no nosso cadastro. Fale com a Big Tricot para liberar seu acesso." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);

  // idempotência: se o mesmo checkout já foi gravado, devolve o mesmo pedido.
  const idem = String(body.idem || "").trim().slice(0, 80) || null;
  if (idem) {
    const ex = await c.env.DB.prepare("SELECT id, erp_numero FROM pedidos WHERE canal='loja_b2b' AND idem = ? LIMIT 1")
      .bind(idem).first<{ id: string; erp_numero: number | null }>();
    if (ex) return c.json({ ok: true, duplicado: true, pedido_id: ex.id, erp_numero: ex.erp_numero });
  }

  // 2) resolve as chaves do Syntech (TAMANHO código + COD_COR) por item, via erp_produtos.
  const refs = [...new Set(itensIn.map((i) => String(i.cod || "").trim()).filter(Boolean))];
  const mapProd = new Map<string, { cores: CorErp[]; tamanhos: TamErp[] }>();
  for (const ref of refs) {
    const row = await c.env.DB.prepare("SELECT cores, tamanhos FROM erp_produtos WHERE ref = ?").bind(ref)
      .first<{ cores: string | null; tamanhos: string | null }>();
    if (row) {
      let cores: CorErp[] = [], tamanhos: TamErp[] = [];
      try { const a = JSON.parse(row.cores || "[]"); if (Array.isArray(a)) cores = a; } catch { /* ignora */ }
      try { const a = JSON.parse(row.tamanhos || "[]"); if (Array.isArray(a)) tamanhos = a; } catch { /* ignora */ }
      mapProd.set(ref, { cores, tamanhos });
    }
  }

  type Resolvido = { ref: string; nome: string; grupo: string; medida: string; erp_tamanho: string; corNome: string; cod_cor: number | null; qtd: number; preco: number };
  const resolvidos: Resolvido[] = [];
  const erros: string[] = [];
  for (const it of itensIn) {
    const ref = String(it.cod || "").trim();
    const qtd = Math.max(0, Math.trunc(Number(it.qtd) || 0));
    const preco = Math.round((Number(it.preco) || 0) * 100) / 100;
    if (!ref || qtd <= 0) continue;
    const medida = String(it.medida || "").trim();
    const corNome = String(it.corNome || "").trim();
    const p = mapProd.get(ref);
    let erp_tamanho = medida; let cod_cor: number | null = null;
    if (p) {
      const tam = p.tamanhos.find((t) => norm(t.medida) === norm(medida) || norm(t.tamanho) === norm(medida));
      if (tam && tam.tamanho) erp_tamanho = String(tam.tamanho).trim();
      const cor = p.cores.find((cc) => norm(cc.nome) === norm(corNome));
      if (cor && cor.numero != null) cod_cor = Number(cor.numero);
    } else {
      erros.push(`Produto ${ref} não encontrado no catálogo do ERP.`);
    }
    if (cod_cor == null && p) erros.push(`Cor "${corNome}" do produto ${ref} não encontrada.`);
    resolvidos.push({ ref, nome: String(it.nome || ref), grupo: String(it.grupo || ""), medida, erp_tamanho, corNome, cod_cor, qtd, preco });
  }
  if (!resolvidos.length) return c.json({ erro: "sem_itens_validos", msg: "Não há itens válidos no pedido." }, 400);
  // Se faltou identificar a cor/produto de algum item, NÃO grava (evita pedido errado no Syntech).
  if (erros.length) return c.json({ erro: "mapeamento_incompleto", msg: "Alguns itens não puderam ser identificados automaticamente. Fale com a Big Tricot.", detalhe: [...new Set(erros)] }, 422);

  const total = Math.round(resolvidos.reduce((s, r) => s + r.qtd * r.preco, 0) * 100) / 100;

  // 3) grava o pedido (canal loja_b2b, fora da produção, pendente de envio ao ERP)
  const pedidoId = uid();
  const stmts: D1PreparedStatement[] = [];
  stmts.push(c.env.DB.prepare(
    `INSERT INTO pedidos (id, cliente_nome, cliente_id, cliente_cnpj, tipo, status, canal, valor_total,
       erp_sync_status, erp_liberado, idem, data_pedido, created_at)
     VALUES (?, ?, ?, ?, 'pedido', 'aguardando_aprovacao', 'loja_b2b', ?, 'pendente', 0, ?, datetime('now'), datetime('now'))`
  ).bind(pedidoId, cli.nome || "SEM CLIENTE", cli.id, cnpjDig, total, idem));
  for (const r of resolvidos) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit, parte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unico')`
    ).bind(uid(), pedidoId, r.nome, r.ref, r.corNome, r.cod_cor, r.medida, r.erp_tamanho, r.qtd, r.preco));
  }
  await c.env.DB.batch(stmts);

  return c.json({
    ok: true,
    pedido_id: pedidoId,
    cliente: cli.nome,
    itens: resolvidos.length,
    pecas: resolvidos.reduce((s, r) => s + r.qtd, 0),
    total,
    msg: "Pedido recebido! Ele será enviado para a Big Tricot (Syntech) e confirmado em breve.",
  }, 201);
});
