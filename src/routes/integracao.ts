// INTEGRAÇÃO COM ERP (Syntech/Firebird) — "porta de entrada" dos pedidos.
// A ponte (programa que lê o Firebird) envia cada pedido novo aqui, autenticando
// com o header X-Integracao-Token (segredo do ambiente INTEGRACAO_TOKEN).
//
// Modo CONFERÊNCIA: o pedido entra como status 'aguardando_aprovacao' — fica FORA
// da produção (garantirCards ignora esse status) até alguém APROVAR. Ao aprovar,
// vira 'novo' e a explosão acontece normalmente. Assim nenhum cancelado/rascunho
// cai na produção sem conferência.
import { Hono } from "hono";
import type { Env } from "../index";
import { exigirFuncao } from "../permissoes";
import { proximoCodigoPai } from "./pedidos";
import { cadastrarProdutosDoPedido } from "./produtos";
import { consumoDoPedido, baixarPorPedido, type Autor } from "../estoque-baixa";
import { SYNC_JS, SYNC_VERSAO } from "../bridgeScript";
import { SITE_ONLINE_HTML } from "../siteTemplate";
import { SITE_FULL_HTML } from "../siteTemplateFull";
import { SITE_LOJA_HTML } from "../siteLoja";
import { lerDocumento, gravarDocumento } from "../firestore";
import { limparReservasRefletidas, kitAlertas } from "../loja-estoque";

export const integracao = new Hono<{ Bindings: Env }>();

// ── HEARTBEAT DA PONTE ───────────────────────────────────────────────────────
// Toda chamada autenticada com o token da integração (ou seja, vinda da PONTE)
// grava o horário do "último contato". Serve só pro indicador de status no
// sistema — é fire-and-forget e NUNCA atrapalha a resposta da ponte.
integracao.use("*", async (c, next) => {
  try {
    const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
    const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
    if (esperado && recebido && recebido === esperado) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          "INSERT INTO config (chave, valor, atualizado_em) VALUES ('ponte_ultimo_contato', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
        ).bind(new Date().toISOString()).run().then(() => {}).catch(() => {})
      );
    }
  } catch { /* nunca atrapalha a ponte */ }
  await next();
});

// ── AUTO-ATUALIZAÇÃO DA PONTE ────────────────────────────────────────────────
// A ponte (bridge/sync.js) baixa daqui a versão mais nova de si mesma e se
// atualiza sozinha. Protegido pelo mesmo token. O conteúdo é gerado no build a
// partir de bridge/sync.js (scripts/gen-bridge-script.mjs).
integracao.get("/bridge-sync", (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  return new Response(SYNC_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Ponte-Versao": SYNC_VERSAO,
      "Cache-Control": "no-store",
    },
  });
});

const uid = () => crypto.randomUUID();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
const inteiro = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

// Depois que um pedido importado "vira produção" (aprovado), roda o MESMO pós-processo
// do PDF: cadastra os produtos que faltam e dá baixa de estoque dos insumos. Não trava.
async function posProcessar(env: Env, pedidoId: string, autor?: Autor) {
  await cadastrarProdutosDoPedido(env, pedidoId).catch(() => {});
  await baixarPorPedido(env, pedidoId, await consumoDoPedido(env, pedidoId), autor).catch(() => {});
}

type ItemIn = { produto?: string; ref?: string; cor?: string; tamanho?: string; qtd?: number | string; preco?: number | string };
type PedidoIn = {
  numero?: string | number; data?: string; data_entrega?: string; vendedor?: string;
  cliente?: { nome?: string; cnpj?: string; cidade?: string; uf?: string } | string;
  itens?: ItemIn[];
};

// ── PORTA DE ENTRADA: recebe um pedido do ERP (via ponte) ───────────────────────
integracao.post("/pedido", async (c) => {
  // Autenticação por token (segredo do ambiente). Sem token configurado → recusa tudo.
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  const b = await c.req.json<PedidoIn>().catch(() => ({} as PedidoIn));
  const numero = str(b.numero);
  if (!numero) return c.json({ error: "numero_obrigatorio" }, 400);
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const cliente = typeof b.cliente === "string" ? { nome: b.cliente } : (b.cliente || {});
  const clienteNome = str(cliente.nome) || "SEM CLIENTE";

  // Idempotência: se já importamos esse número do ERP, não duplica (a ponte pode reenviar).
  const existe = await c.env.DB.prepare(
    "SELECT id, status FROM pedidos WHERE numero_erp = ? AND COALESCE(erp_integracao,0) = 1"
  ).bind(numero).first<{ id: string; status: string | null }>();
  if (existe) return c.json({ ok: true, duplicado: true, pedido_id: existe.id, status: existe.status });

  const pedidoId = uid();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO pedidos (id, numero_erp, cliente_nome, vendedor, tipo, data_pedido, data_entrega, status, erp_integracao, created_at)
       VALUES (?, ?, ?, ?, 'pedido', ?, ?, 'aguardando_aprovacao', 1, datetime('now'))`
    ).bind(pedidoId, numero, clienteNome, str(b.vendedor), str(b.data), str(b.data_entrega)),
  ];
  for (const it of itens) {
    const produto = str(it.produto);
    if (!produto) continue;
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte) VALUES (?, ?, ?, ?, ?, ?, ?, 'unico')"
      ).bind(uid(), pedidoId, produto, str(it.ref), str(it.cor), str(it.tamanho), inteiro(it.qtd))
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, pedido_id: pedidoId, numero, itens: stmts.length - 1 }, 201);
});

// ── PORTA DE ENTRADA: recebe os REPRESENTANTES (GUIAS) do Syntech ───────────────
// A ponte lê a tabela GUIAS do ERP e manda a lista aqui. A gente liga pelo CÓDIGO
// (codigo_erp), nunca por nome — assim some a duplicação. Não renomeia nem apaga
// cadastro existente: se já há um rep com esse código, atualiza contatos/comissão/UF;
// senão cria (casando por nome EXATO quando houver, sem roubar o código de outro).
type GuiaIn = { codigo?: string | number; fantasia?: string; nome?: string; cpf?: string; uf?: string; cidade?: string; telefone?: string; email?: string; comissao?: number | string; bloqueado?: string | number | boolean };
integracao.post("/representantes", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  const b = await c.req.json<{ representantes?: GuiaIn[] }>().catch(() => ({} as { representantes?: GuiaIn[] }));
  const lista = Array.isArray(b.representantes) ? b.representantes : [];
  if (!lista.length) return c.json({ error: "sem_representantes" }, 400);

  const soDigitos = (v: unknown) => { const s = String(v ?? "").replace(/\D/g, ""); return s || null; };
  const ufLimpa = (v: unknown) => { const s = String(v ?? "").trim().toUpperCase().slice(0, 2); return /^[A-Z]{2}$/.test(s) ? s : null; };
  const num = (v: unknown) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const ehBloqueado = (v: unknown) => { const s = String(v ?? "").trim().toUpperCase(); return s === "S" || s === "1" || s === "TRUE" || v === true; };
  const primeiroNome = (nome: string) => nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\s\-]+/).filter(Boolean)[0] || "";

  // Carrega os reps que AINDA não têm código, pra tentar casar automaticamente pelo
  // 1º nome (+UF) e só ANEXAR o código — sem criar duplicado nem renomear.
  const semCodigo = (await c.env.DB.prepare("SELECT id, nome, ufs FROM representantes WHERE COALESCE(codigo_erp,'') = ''").all<{ id: string; nome: string; ufs: string | null }>()).results;
  const porPrimeiro = new Map<string, { id: string; nome: string; ufs: string | null }[]>();
  for (const r of semCodigo) { const k = primeiroNome(r.nome); if (!k) continue; (porPrimeiro.get(k) || porPrimeiro.set(k, []).get(k)!).push(r); }
  const jaAnexados = new Set<string>();

  let recebidos = 0, pulados = 0, criados = 0, casados = 0, atualizados = 0;
  for (const g of lista) {
    const codigo = str(g.codigo);
    const nomeFinal = (str(g.fantasia) || str(g.nome) || "").trim();
    if (!codigo || !nomeFinal) { pulados++; continue; }
    recebidos++;
    const wpp = soDigitos(g.telefone);
    const email = str(g.email);
    const com = num(g.comissao);
    const uf2 = ufLimpa(g.uf);
    const ativo = ehBloqueado(g.bloqueado) ? 0 : 1;

    // 1) já existe rep com esse código? atualiza contatos/comissão/UF (sem renomear).
    const up = await c.env.DB.prepare(
      `UPDATE representantes SET
         whatsapp = COALESCE(NULLIF(TRIM(COALESCE(whatsapp,'')),''), ?),
         email    = COALESCE(NULLIF(TRIM(COALESCE(email,'')),''), ?),
         ufs      = COALESCE(NULLIF(TRIM(COALESCE(ufs,'')),''), ?),
         comissao = COALESCE(?, comissao),
         ativo    = ?
       WHERE codigo_erp = ?`
    ).bind(wpp, email, uf2, com, ativo, codigo).run();
    if ((up.meta?.changes ?? 0) > 0) { atualizados++; continue; }

    // 2) tenta casar com um cadastro existente SEM código, pelo 1º nome (+UF se houver).
    //    Só anexa quando o casamento é ÚNICO e ainda não foi usado — evita flood e erro.
    const cand = (porPrimeiro.get(primeiroNome(nomeFinal)) || []).filter((r) => !jaAnexados.has(r.id));
    let alvo: { id: string; nome: string; ufs: string | null } | null = null;
    if (cand.length === 1) alvo = cand[0];
    else if (cand.length > 1 && uf2) {
      const porUf = cand.filter((r) => (r.ufs || "").toUpperCase().includes(uf2));
      if (porUf.length === 1) alvo = porUf[0];
    }
    if (alvo) {
      jaAnexados.add(alvo.id);
      await c.env.DB.prepare(
        `UPDATE representantes SET codigo_erp = ?,
           whatsapp = COALESCE(NULLIF(TRIM(COALESCE(whatsapp,'')),''), ?),
           email    = COALESCE(NULLIF(TRIM(COALESCE(email,'')),''), ?),
           ufs      = COALESCE(NULLIF(TRIM(COALESCE(ufs,'')),''), ?),
           comissao = COALESCE(?, comissao), ativo = ?
         WHERE id = ?`
      ).bind(codigo, wpp, email, uf2, com, ativo, alvo.id).run();
      casados++;
      continue;
    }

    // 3) sem casamento: cria (ou, se já existir rep com NOME exato, anexa o código sem roubar).
    await c.env.DB.prepare(
      `INSERT INTO representantes (id, nome, whatsapp, email, ativo, ufs, cidades, comissao, codigo_erp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(nome) DO UPDATE SET
         codigo_erp = COALESCE(representantes.codigo_erp, excluded.codigo_erp),
         whatsapp   = COALESCE(NULLIF(TRIM(COALESCE(representantes.whatsapp,'')),''), excluded.whatsapp),
         email      = COALESCE(NULLIF(TRIM(COALESCE(representantes.email,'')),''), excluded.email),
         ufs        = COALESCE(NULLIF(TRIM(COALESCE(representantes.ufs,'')),''), excluded.ufs),
         comissao   = COALESCE(excluded.comissao, representantes.comissao),
         ativo      = excluded.ativo`
    ).bind(uid(), nomeFinal, wpp, email, ativo, uf2, str(g.cidade), com, codigo).run();
    criados++;
  }
  const tot = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM representantes WHERE COALESCE(codigo_erp,'') <> ''").first<{ n: number }>();
  return c.json({ ok: true, recebidos, pulados, criados, casados, atualizados, com_codigo: tot?.n ?? 0 });
});

// ── PORTA DE ENTRADA: carteira por CÓDIGO (CLIENTES.GUIA do Syntech) ─────────────
// A ponte manda, pra cada cliente, o código do representante dele no Syntech
// (CLIENTES.GUIA). A gente grava em clientes.rep_codigo, casando pelo código do
// cliente no ERP (clientes.codigo_erp = CLIENTES.CODIGO). Assim a carteira de cada
// rep passa a ser contada por código — independente da grafia do nome. NÃO mexe no
// texto clientes.representante (nada é apagado); a contagem por código tem prioridade.
type CarteiraIn = { cod?: string | number; cnpj?: string; guia?: string | number };
integracao.post("/carteira-codigos", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  const b = await c.req.json<{ mapa?: CarteiraIn[] }>().catch(() => ({} as { mapa?: CarteiraIn[] }));
  const mapa = Array.isArray(b.mapa) ? b.mapa : [];
  if (!mapa.length) return c.json({ error: "sem_mapa" }, 400);

  // A maioria dos clientes NÃO tem codigo_erp (entraram por PDF/manual), então casamos
  // principalmente pelo CNPJ (dígitos). Monta índices em memória pra não varrer a tabela
  // a cada linha. (id, cnpj, codigo_erp de todos os clientes.)
  const soDig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const todos = (await c.env.DB.prepare("SELECT id, cnpj, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(rep_codigo,'') AS rep_codigo FROM clientes").all<{ id: string; cnpj: string | null; codigo_erp: string; rep_codigo: string }>()).results;
  const porCnpj = new Map<string, { id: string; rep: string }>();
  const porCodigo = new Map<string, { id: string; rep: string }>();
  for (const cli of todos) {
    const d = soDig(cli.cnpj);
    if (d.length >= 11) porCnpj.set(d, { id: cli.id, rep: cli.rep_codigo });
    if (cli.codigo_erp) porCodigo.set(cli.codigo_erp.trim(), { id: cli.id, rep: cli.rep_codigo });
  }

  const stmts: D1PreparedStatement[] = [];
  let casados = 0, semCliente = 0;
  const jaFeito = new Set<string>();
  for (const m of mapa) {
    const cod = str(m.cod);
    const guia = str(m.guia);
    const cnpjD = soDig(m.cnpj);
    if (!guia || guia === "0") continue;
    // casa primeiro por código do cliente (quando existe), senão por CNPJ.
    const alvo = (cod && porCodigo.get(cod)) || (cnpjD.length >= 11 ? porCnpj.get(cnpjD) : undefined);
    if (!alvo) { semCliente++; continue; }
    if (jaFeito.has(alvo.id)) continue;
    jaFeito.add(alvo.id);
    casados++;
    if (alvo.rep === guia) continue; // já está certo
    stmts.push(c.env.DB.prepare("UPDATE clientes SET rep_codigo = ? WHERE id = ?").bind(guia, alvo.id));
  }
  let aplicados = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const res = await c.env.DB.batch(stmts.slice(i, i + 50));
    for (const r of res) aplicados += (r.meta?.changes ?? 0);
  }
  const ligados = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM clientes WHERE COALESCE(rep_codigo,'') <> ''").first<{ n: number }>();
  return c.json({ ok: true, recebidos: mapa.length, casados, sem_cliente: semCliente, atualizados: aplicados, clientes_com_codigo: ligados?.n ?? 0 });
});

// ── LISTA os pedidos do ERP aguardando conferência ──────────────────────────────
integracao.get("/pendentes", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.numero_erp, p.cliente_nome, p.status, p.data_pedido, p.data_entrega, p.created_at,
            (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = p.id) AS linhas,
            (SELECT COALESCE(SUM(i.qtd),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS pecas
       FROM pedidos p
      WHERE COALESCE(p.erp_integracao,0) = 1 AND p.status IN ('aguardando_aprovacao','aguardando_explosao')
      ORDER BY p.created_at DESC, p.numero_erp DESC`
  ).all();
  return c.json(results);
});

// Itens de um pedido pendente (pra conferir antes de aprovar).
integracao.get("/pendentes/:id", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare(
    "SELECT id, numero_erp, cliente_nome, data_pedido, data_entrega FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1"
  ).bind(id).first();
  if (!ped) return c.json({ error: "nao_encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade AS cor, tamanho, qtd, COALESCE(valor_unit,0) AS valor_unit FROM pedido_itens WHERE pedido_id = ? ORDER BY produto, tamanho"
  ).bind(id).all();
  return c.json({ pedido: ped, itens });
});

// ── ACEITAR (segurar): pedido válido, FORA da produção, pra explodir depois ──────
// Fica numa fila de "aguardando explosão" — serve pra acumular pedidos pequenos e
// depois explodir vários juntos (render mais na tecelagem). Não gera cards ainda.
integracao.post("/pendentes/:id/aceitar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    "UPDATE pedidos SET status = 'aguardando_explosao' WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status = 'aguardando_aprovacao'"
  ).bind(id).run();
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

// ── APROVAR/EXPLODIR: entra na produção. Vale pra pendente OU aceito (segurado). ──
integracao.post("/pendentes/:id/aprovar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(
    "UPDATE pedidos SET status = 'novo', bloqueado = 1 WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')"
  ).bind(id).run();
  const ok = (r.meta?.changes ?? 0) > 0;
  // Igual ao PDF: nasce bloqueado (PCP libera), cadastra produtos e baixa estoque.
  // A explosão/cards são gerados pelo garantirCards quando o quadro da produção carrega.
  if (ok) await posProcessar(c.env, id, { id: g.u.id, nome: g.u.nome });
  return c.json({ ok });
});

// ── APROVAR VÁRIOS JUNTOS (explosão consolidada / OP pai) ────────────────────────
// Junta vários pedidos do ERP numa OP só (código pai), pra render mais na tecelagem.
// Cada item guarda a ORIGEM (pedido + loja/cliente), então depois o sistema desmembra
// por pedido/loja (inclusive mesma empresa com CNPJs diferentes). Igual aos PDFs.
integracao.post("/aprovar-lote", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ ids?: string[] }>().catch(() => ({} as { ids?: string[] }));
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length < 2) return c.json({ error: "selecione_dois_ou_mais" }, 400);

  const ph = ids.map(() => "?").join(",");
  const { results: peds } = await c.env.DB.prepare(
    `SELECT id, numero_erp, cliente_nome, data_pedido, data_entrega FROM pedidos
      WHERE id IN (${ph}) AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')`
  ).bind(...ids).all<{ id: string; numero_erp: string; cliente_nome: string; data_pedido: string | null; data_entrega: string | null }>();
  if (peds.length < 2) return c.json({ error: "pedidos_nao_encontrados" }, 400);

  const { results: itens } = await c.env.DB.prepare(
    `SELECT pedido_id, produto, ref, cor_grade, tamanho, qtd FROM pedido_itens WHERE pedido_id IN (${ph}) ORDER BY produto, tamanho`
  ).bind(...ids).all<{ pedido_id: string; produto: string; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number }>();

  const porId = new Map(peds.map((p) => [p.id, p]));
  const numeros = peds.map((p) => p.numero_erp).join(", ");
  const clientesDistintos = [...new Set(peds.map((p) => p.cliente_nome))];
  const clienteOP = clientesDistintos.length === 1 ? clientesDistintos[0] : "VÁRIOS CLIENTES";
  const dataPedido = peds.map((p) => p.data_pedido).filter(Boolean).sort()[0] || null;
  const dataEntrega = peds.map((p) => p.data_entrega).filter(Boolean).sort()[0] || null;
  const codigoPai = await proximoCodigoPai(c.env);

  const novoId = uid();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO pedidos (id, numero_erp, cliente_nome, codigo_pai, tipo, data_pedido, data_entrega, status, erp_integracao, bloqueado, created_at)
       VALUES (?, ?, ?, ?, 'pedido', ?, ?, 'novo', 1, 1, datetime('now'))`
    ).bind(novoId, numeros, clienteOP, codigoPai, dataPedido, dataEntrega),
  ];
  for (const it of itens) {
    const org = porId.get(it.pedido_id);
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte, origem, origem_cliente) VALUES (?, ?, ?, ?, ?, ?, ?, 'unico', ?, ?)"
      ).bind(uid(), novoId, it.produto, it.ref, it.cor_grade, it.tamanho, it.qtd, org?.numero_erp || null, org?.cliente_nome || null)
    );
  }
  // Remove os pedidos individuais (viraram a OP consolidada).
  for (const id of ids) {
    stmts.push(c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id = ?").bind(id));
    stmts.push(c.env.DB.prepare("DELETE FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')").bind(id));
  }
  await c.env.DB.batch(stmts);
  await posProcessar(c.env, novoId, { id: g.u.id, nome: g.u.nome });
  return c.json({ ok: true, pedido_id: novoId, codigo_pai: codigoPai, pedidos: peds.length });
});

// ── ESTOQUE DE PRODUTOS (espelho do ERP) ────────────────────────────────────────
// A ponte manda o saldo (lido do Firebird). Guardamos e só EXIBIMOS. Read-only aqui.
// body: { itens: [{ produto, ref, cor, tamanho, saldo, unidade }], full?: boolean }
integracao.post("/estoque", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  type EstoqueIn = { produto?: string; ref?: string; cor?: string; tamanho?: string; saldo?: number | string; unidade?: string };
  const b = await c.req.json<{ itens?: EstoqueIn[]; full?: boolean; lote?: string; fim?: boolean }>().catch(() => ({} as { itens?: EstoqueIn[]; full?: boolean; lote?: string; fim?: boolean }));
  const itens: EstoqueIn[] = Array.isArray(b.itens) ? b.itens : [];
  const norm = (s: unknown) => String(s ?? "").trim();
  const lote = norm(b.lote) || null; // carimbo desta rodada de sincronização
  // Permite itens VAZIO só quando é o fim de uma rodada com lote → "Syntech sem nada" →
  // limpa o espelho inteiro (a ponte confirma que leu e não veio saldo nenhum).
  const limparTudo = itens.length === 0 && b.fim === true && !!lote;
  if (!itens.length && !limparTudo) return c.json({ error: "sem_itens" }, 400);

  const chaveDe = (ref: string, cor: string, tam: string) => `${ref}|${cor}|${tam}`.toLowerCase();
  const stmts = itens.map((it) => {
    const ref = norm(it.ref), cor = norm(it.cor), tam = norm(it.tamanho);
    const chave = chaveDe(ref, cor, tam);
    const saldo = Number(it.saldo) || 0;
    return c.env.DB.prepare(
      `INSERT INTO erp_estoque (chave, produto, ref, cor, tamanho, saldo, unidade, lote, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(chave) DO UPDATE SET produto=excluded.produto, ref=excluded.ref, cor=excluded.cor,
         tamanho=excluded.tamanho, saldo=excluded.saldo, unidade=excluded.unidade, lote=excluded.lote, atualizado_em=datetime('now')`
    ).bind(chave, norm(it.produto) || null, ref || null, cor || null, tam || null, saldo, norm(it.unidade) || null, lote);
  });
  if (stmts.length) await c.env.DB.batch(stmts);
  // FIM da rodada: apaga tudo que NÃO é deste lote (saldo que sumiu do Syntech) — assim o
  // espelho fica idêntico ao Syntech, sem estoque fantasma. Só varre se a rodada chegou
  // completa (fim=true) e com lote (senão não mexe, pra não apagar nada por engano).
  let removidos = 0;
  if (b.fim === true && lote) {
    const del = await c.env.DB.prepare("DELETE FROM erp_estoque WHERE lote IS NULL OR lote <> ?").bind(lote).run();
    removidos = (del.meta && (del.meta.changes as number)) || 0;
    // marca a hora desta sincronização e solta as reservas locais que o SALDO já reflete.
    await c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('estoque_sync_em', datetime('now'), datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=datetime('now'), atualizado_em=datetime('now')").run().catch(() => {});
    await limparReservasRefletidas(c.env).catch(() => 0);
  }
  return c.json({ ok: true, n: stmts.length, removidos });
});

// LÊ o estoque espelhado (pra exibir). Filtro opcional ?ref= / ?busca=.
integracao.get("/estoque", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const ref = (c.req.query("ref") || "").trim();
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  let sql = "SELECT produto, ref, cor, tamanho, saldo, unidade, atualizado_em FROM erp_estoque";
  const cond: string[] = [], binds: unknown[] = [];
  if (ref) { cond.push("ref = ?"); binds.push(ref); }
  if (busca) { cond.push("(lower(produto) LIKE ? OR lower(ref) LIKE ?)"); binds.push(`%${busca}%`, `%${busca}%`); }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY produto, cor, tamanho LIMIT 1000";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

// DIAGNÓSTICO visual de um produto/kit: mostra, numa página legível, a receita do kit
// e o SALDO POR COR E TAMANHO (erp_estoque) de cada peça + o estoque_geral. Serve pra
// ver DE ONDE vem cada número. Abra logado: /api/integracao/diag-produto?busca=balls
integracao.get("/diag-produto", async (c) => {
  // Aceita sessão (UI) OU o token de integração (?token=) — assim dá pra abrir direto
  // no navegador pra diagnosticar o estoque por cor das peças. Só leitura.
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  if (!(!!esperado && recebido === esperado)) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  const busca = (c.req.query("busca") || "balls").trim().toLowerCase();
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] || ch));
  // 1) produtos (erp_produtos) que casam a busca — inclui kit e peças (KT…).
  const prod = await c.env.DB.prepare(
    "SELECT ref, nome, estoque_geral, cores, tamanhos, COALESCE(inativo,0) AS inativo FROM erp_produtos WHERE lower(nome) LIKE ? OR lower(ref) LIKE ? ORDER BY nome LIMIT 60"
  ).bind(`%${busca}%`, `%${busca}%`).all<{ ref: string; nome: string | null; estoque_geral: number | null; cores: string | null; tamanhos: string | null; inativo: number }>().catch(() => ({ results: [] as Record<string, unknown>[] }));
  const refs = new Set<string>((prod.results as { ref: string }[]).map((p) => p.ref).filter(Boolean));
  // 2) receita dos kits encontrados + peças (componentes) referenciadas.
  const recRows = await c.env.DB.prepare("SELECT kit_ref, componente_ref, quantidade, tamanho FROM erp_kit_receita").all<{ kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }>().catch(() => ({ results: [] as Record<string, unknown>[] }));
  const rec = (recRows.results as { kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }[]).filter((r) => refs.has(r.kit_ref));
  for (const r of rec) refs.add(r.componente_ref);
  // 3) estoque por cor/tamanho (erp_estoque) de TODAS as refs envolvidas.
  const refList = [...refs];
  let estoque: { ref: string | null; cor: string | null; tamanho: string | null; saldo: number }[] = [];
  if (refList.length) {
    const ph = refList.map(() => "?").join(",");
    const r = await c.env.DB.prepare(`SELECT ref, cor, tamanho, saldo FROM erp_estoque WHERE ref IN (${ph}) ORDER BY ref, cor, tamanho`).bind(...refList).all<{ ref: string | null; cor: string | null; tamanho: string | null; saldo: number }>().catch(() => ({ results: [] as typeof estoque }));
    estoque = (r.results as typeof estoque);
  }
  const estPorRef = new Map<string, typeof estoque>();
  for (const e of estoque) { const k = (e.ref || ""); const a = estPorRef.get(k) || []; a.push(e); estPorRef.set(k, a); }
  // JSON (consumido pelo painel do admin) — mesma informação, sem HTML.
  if ((c.req.query("format") || "") === "json") {
    return c.json({
      busca,
      produtos: prod.results,
      receita: rec,
      estoque_por_peca: Object.fromEntries([...estPorRef.entries()]),
      pecas_sem_espelho: refList.filter((r) => !(estPorRef.get(r) || []).length),
    });
  }
  // monta HTML
  const tabProd = (prod.results as { ref: string; nome: string | null; estoque_geral: number | null; cores: string | null; tamanhos: string | null; inativo: number }[]).map((p) => {
    let nc = 0, nt = 0; try { nc = (JSON.parse(p.cores || "[]") as unknown[]).length; } catch { /* */ } try { nt = (JSON.parse(p.tamanhos || "[]") as unknown[]).length; } catch { /* */ }
    return `<tr><td><b>${esc(p.ref)}</b></td><td>${esc(p.nome)}</td><td style="text-align:right">${esc(p.estoque_geral)}</td><td style="text-align:center">${nc}</td><td style="text-align:center">${nt}</td><td style="text-align:center">${p.inativo ? "sim" : "não"}</td></tr>`;
  }).join("");
  const tabRec = rec.map((r) => `<tr><td><b>${esc(r.kit_ref)}</b></td><td>${esc(r.componente_ref)}</td><td style="text-align:center">${esc(r.quantidade)}</td><td style="text-align:center">${esc(r.tamanho)}</td></tr>`).join("");
  const blocosEst = refList.map((ref) => {
    const rows = (estPorRef.get(ref) || []);
    if (!rows.length) return `<h3>${esc(ref)} <span style="color:#b91c1c;font-weight:400">— sem linhas no erp_estoque (não espelhado por cor)</span></h3>`;
    const body = rows.map((e) => `<tr><td>${esc(e.tamanho)}</td><td>${esc(e.cor)}</td><td style="text-align:right">${esc(e.saldo)}</td></tr>`).join("");
    return `<h3>${esc(ref)} <span style="color:#555;font-weight:400">(${rows.length} linha(s))</span></h3><table><thead><tr><th>Tamanho</th><th>Cor</th><th>Saldo</th></tr></thead><tbody>${body}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico — ${esc(busca)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f4ef;color:#2c2721;padding:18px}h1{font-size:20px}h2{font-size:16px;margin-top:26px;border-bottom:2px solid #e2dccf;padding-bottom:4px}h3{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%;max-width:720px;background:#fff;border:1px solid #e2dccf;border-radius:8px;overflow:hidden;font-size:13px}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#faf7f1;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b6358}.muted{color:#6b6358;font-size:13px}</style></head>
<body><h1>Diagnóstico de estoque — "${esc(busca)}"</h1>
<p class="muted">Mostra, direto do espelho (erp_produtos / erp_kit_receita / erp_estoque), de onde vem cada número. Troque a busca na URL: <code>?busca=balls</code>.</p>
<h2>1) Produtos encontrados (erp_produtos)</h2><table><thead><tr><th>Ref</th><th>Nome</th><th>Estoque geral</th><th>#cores</th><th>#tam</th><th>inativo</th></tr></thead><tbody>${tabProd || '<tr><td colspan="6">nada</td></tr>'}</tbody></table>
<h2>2) Receita do(s) kit(s) (erp_kit_receita)</h2><table><thead><tr><th>Kit</th><th>Componente</th><th>Qtd</th><th>Tam</th></tr></thead><tbody>${tabRec || '<tr><td colspan="4">nenhum kit nessa busca</td></tr>'}</tbody></table>
<h2>3) Saldo por cor e tamanho de cada peça (erp_estoque)</h2>${blocosEst || '<p class="muted">sem dados</p>'}
</body></html>`;
  return c.html(html);
});

// ALERTA de peças do kit: avisa a equipe quando as peças não batem pra montar o kit
// (ex.: sobra peseira por falta de capa). Usado pelo popup no admin.
integracao.get("/kit-alertas", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const alertas = await kitAlertas(c.env).catch(() => []);
  return c.json({ alertas });
});

// STATUS da sincronização do ERP: quantos itens de estoque/produtos e QUANDO foi a
// última atualização da ponte. Serve pra saber se o espelho do estoque está "vivo".
integracao.get("/sync-status", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const est = await c.env.DB.prepare("SELECT COUNT(*) AS n, MAX(atualizado_em) AS ult FROM erp_estoque").first<{ n: number; ult: string | null }>().catch(() => null);
  const prod = await c.env.DB.prepare("SELECT COUNT(*) AS n, MAX(atualizado_em) AS ult FROM erp_produtos").first<{ n: number; ult: string | null }>().catch(() => null);
  let diag: unknown = null;
  try { const d = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='estoque_diag'").first<{ valor: string | null }>(); diag = d?.valor ? JSON.parse(d.valor) : null; } catch { diag = null; }
  return c.json({
    estoque: { itens: Number(est?.n) || 0, atualizado_em: est?.ult || null },
    produtos: { itens: Number(prod?.n) || 0, atualizado_em: prod?.ult || null },
    diag,
    agora: new Date().toISOString(),
  });
});

// Status da PONTE pro indicador no sistema: quando foi o último contato dela e se
// está em dia. A ponte roda ~a cada 2 min, então damos folga: até 5 min = ativa,
// até 15 min = atrasada, mais que isso = parada.
integracao.get("/ponte-status", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const row = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='ponte_ultimo_contato'").first<{ valor: string | null }>().catch(() => null);
  const ultimo = row?.valor || null;
  let ha_segundos: number | null = null;
  if (ultimo) { const t = Date.parse(ultimo); if (!isNaN(t)) ha_segundos = Math.max(0, Math.round((Date.now() - t) / 1000)); }
  let status: "ativa" | "atrasada" | "parada" | "sem_dados" = "sem_dados";
  if (ha_segundos != null) status = ha_segundos <= 300 ? "ativa" : ha_segundos <= 900 ? "atrasada" : "parada";
  return c.json({ ultimo_contato: ultimo, ha_segundos, status, agora: new Date().toISOString() });
});

// Zera o estoque espelhado (erp_estoque). A ponte repõe tudo na próxima rodada, já com a
// correção de cor — serve pra "começar do zero" o estoque e limpar linhas antigas.
integracao.post("/estoque-reset", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  await c.env.DB.prepare("DELETE FROM erp_estoque").run();
  return c.json({ ok: true });
});

// A ponte reporta o resultado da sincronização de estoque por cor (diagnóstico).
integracao.post("/estoque-diag", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({}));
  const valor = JSON.stringify({ ...(b as Record<string, unknown>), em: new Date().toISOString() }).slice(0, 4000);
  await c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('estoque_diag', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(valor).run();
  return c.json({ ok: true });
});

// ── DIAGNÓSTICO: a ponte manda a estrutura do banco do Syntech (uma vez) ───────
// Guardo cru na config (chave erp_diag) pra inspecionar os nomes das colunas de
// preço por tamanho. POST protegido por token (vem da ponte); GET pede sessão.
integracao.post("/diag", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 900000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
// Diagnóstico LEVE das procedures APP_* (Fase 4). Guardado numa chave própria pra não
// colidir com o diagnóstico grande (erp_diag). Lido via GET /diag?pedido=procs.
integracao.post("/diag-procs", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag_procs', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 200000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
// Diagnóstico da RECEITA DO KIT no Syntech (tabelas/colunas com KIT). Lido via GET /diag?pedido=kit.
integracao.post("/diag-kit", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  const txt = await c.req.text();
  await c.env.DB.prepare(
    "INSERT INTO config (chave, valor, atualizado_em) VALUES ('erp_diag_kit', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')"
  ).bind(txt.slice(0, 300000)).run();
  return c.json({ ok: true, bytes: txt.length });
});
// RECEITA DO KIT (tabela INSUMOS_PROD do Syntech). A ponte manda a lista toda e aqui
// a gente SUBSTITUI a tabela erp_kit_receita inteira (é pequena). Protegido por token.
integracao.post("/kits", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);
  type KitIn = { kit?: string; componente?: string; quantidade?: number | string; tamanho?: string };
  const b = await c.req.json<{ itens?: KitIn[] }>().catch(() => ({} as { itens?: KitIn[] }));
  const itens: KitIn[] = Array.isArray(b.itens) ? b.itens : [];
  const norm = (s: unknown) => String(s ?? "").trim();
  // Dedup por (kit, componente) — a última linha vence (PK não aceita repetido).
  const mapa = new Map<string, KitIn>();
  for (const it of itens) {
    const kit = norm(it.kit), comp = norm(it.componente);
    if (!kit || !comp) continue;
    mapa.set(`${kit}|${comp}`.toLowerCase(), it);
  }
  const stmts = [c.env.DB.prepare("DELETE FROM erp_kit_receita")];
  for (const it of mapa.values()) {
    stmts.push(c.env.DB.prepare(
      "INSERT INTO erp_kit_receita (kit_ref, componente_ref, quantidade, tamanho, atualizado_em) VALUES (?, ?, ?, ?, datetime('now'))"
    ).bind(norm(it.kit), norm(it.componente), Number(it.quantidade) || 1, norm(it.tamanho) || null));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, n: stmts.length - 1 });
});
integracao.get("/diag", async (c) => {
  // ?pedido=envio → resposta CRUA da Z-API do ÚLTIMO envio (pra ver por que uma mensagem
  // não chegou, inclusive em grupo). Liberado sem login pra abrir direto no navegador.
  if (c.req.query("pedido") === "envio") {
    const r = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='webhook_send_ultimo'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (!r || !r.valor) return c.json({ vazio: true, msg: "Ainda não há registro de envio. Mande uma mensagem pelo sistema e abra este link de novo." });
    let obj: unknown = null; try { obj = JSON.parse(r.valor); } catch { obj = r.valor; }
    return c.json({ atualizado_em: r.atualizado_em, ultimo_envio: obj });
  }
  // ?pedido=kit → receita do kit (só a ESTRUTURA das tabelas/colunas/amostra, nada
  // sensível). Liberado SEM login pra a dona conseguir abrir direto no navegador.
  if (c.req.query("pedido") === "kit") {
    const kr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag_kit'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (!kr || !kr.valor) return c.json({ vazio: true, msg: "Ainda não recebi o diagnóstico de kit da ponte. Rode a ponte e tente de novo." });
    let obj: unknown = null; try { obj = JSON.parse(kr.valor); } catch { obj = kr.valor; }
    return c.json({ atualizado_em: kr.atualizado_em, diag: obj });
  }
  // ?pedido=kits → a RECEITA já espelhada (erp_kit_receita), agrupada por kit. Liberado
  // sem login (só códigos/quantidades, nada sensível) pra conferir a sincronização.
  if (c.req.query("pedido") === "kits") {
    const { results } = await c.env.DB.prepare(
      "SELECT r.kit_ref, p1.nome AS kit_nome, p1.preco_atacado AS kit_preco, r.componente_ref, p2.nome AS componente_nome, " +
      "r.quantidade, r.tamanho, p2.estoque_geral AS componente_estoque, p2.preco_atacado AS comp_atacado, p2.preco_varejo AS comp_varejo " +
      "FROM erp_kit_receita r " +
      "LEFT JOIN erp_produtos p1 ON p1.ref = r.kit_ref " +
      "LEFT JOIN erp_produtos p2 ON p2.ref = r.componente_ref " +
      "ORDER BY r.kit_ref, r.componente_ref"
    ).all<{ kit_ref: string; kit_nome: string | null; kit_preco: number | null; componente_ref: string; componente_nome: string | null; quantidade: number; tamanho: string | null; componente_estoque: number | null; comp_atacado: number | null; comp_varejo: number | null }>();
    const kits: Record<string, { nome: string | null; preco_kit: number; estoque_vivo: number; soma_pecas: number; componentes: { ref: string; nome: string | null; quantidade: number; tamanho: string | null; estoque: number; preco_atacado: number; preco_varejo: number }[] }> = {};
    for (const r of results) {
      const k = (kits[r.kit_ref] ||= { nome: r.kit_nome, preco_kit: Number(r.kit_preco) || 0, estoque_vivo: Infinity, soma_pecas: 0, componentes: [] });
      const est = Number(r.componente_estoque) || 0;
      const qtd = Number(r.quantidade) || 1;
      const pa = Number(r.comp_atacado) || 0, pv = Number(r.comp_varejo) || 0;
      k.componentes.push({ ref: r.componente_ref, nome: r.componente_nome, quantidade: qtd, tamanho: r.tamanho, estoque: est, preco_atacado: pa, preco_varejo: pv });
      k.soma_pecas = Math.round((k.soma_pecas + (pa || pv) * qtd) * 100) / 100;
      k.estoque_vivo = Math.min(k.estoque_vivo, Math.floor(est / qtd));
    }
    for (const k of Object.values(kits)) if (!isFinite(k.estoque_vivo)) k.estoque_vivo = 0;
    // Também lista TODOS os produtos cujo nome fala "KIT" (pra achar duplicado no catálogo).
    const { results: pk } = await c.env.DB.prepare(
      "SELECT ref, nome, estoque_geral, COALESCE(inativo,0) AS inativo FROM erp_produtos WHERE UPPER(COALESCE(nome,'')) LIKE '%KIT%' OR UPPER(COALESCE(ref,'')) LIKE '%1078%' ORDER BY nome"
    ).all<{ ref: string; nome: string | null; estoque_geral: number | null; inativo: number }>().catch(() => ({ results: [] as { ref: string; nome: string | null; estoque_geral: number | null; inativo: number }[] }));
    return c.json({ total_kits: Object.keys(kits).length, kits, produtos_kit: pk });
  }
  // ?pedido=fichas → nomes das FICHAS do catálogo antigo (foto/vídeo/textos) que tenham
  // "BALLS" no nome, pra eu ver de onde o kit pode herdar vídeo/textos. Sem login.
  if (c.req.query("pedido") === "fichas") {
    type FProd = { nome?: string; foto?: string; video?: string; blocos?: Record<string, unknown> };
    let base: Record<string, unknown> = {};
    try { base = (await lerDocumento(c.env, "catalogo/main")) || {}; } catch { base = {}; }
    const el = (base.edicao_limitada && typeof base.edicao_limitada === "object") ? (base.edicao_limitada as Record<string, unknown>) : {};
    const todos = [
      ...(Array.isArray(base.produtos) ? (base.produtos as FProd[]) : []),
      ...(Array.isArray(el.produtos) ? (el.produtos as FProd[]) : []),
    ];
    const lista = todos
      .filter((p) => /BALL|KIT/i.test(String(p?.nome || "")))
      .map((p) => ({ nome: p.nome || "", tem_foto: !!p.foto, tem_video: !!p.video, blocos: p.blocos && typeof p.blocos === "object" ? Object.keys(p.blocos) : [] }));
    return c.json({ total_fichas: todos.length, com_ball_ou_kit: lista });
  }
  // Aceita sessão (UI) OU o token de integração (pra eu, dev, inspecionar sem login).
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  const temToken = !!esperado && recebido === esperado;
  if (!temToken) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  // ?pedido=tabelas → só o ESQUEMA (nomes de tabela + colunas) que a ponte já mapeou,
  // do diagnóstico guardado (erp_diag). Nada de dados. Protegido (exige login OU token,
  // como o resto deste GET). ?q=GUIA filtra por nome de tabela/coluna; sem q, destaca as
  // que parecem de representante/vendedor/comissão. Serve pra montar a sincronização de reps.
  if (c.req.query("pedido") === "tabelas") {
    const r = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (!r || !r.valor) return c.json({ vazio: true, msg: "Ainda não recebi o diagnóstico da ponte." });
    let d: { quando?: string; tabelas?: { nome: string; colunas: string[] }[] } = {};
    try { d = JSON.parse(r.valor); } catch { return c.json({ erro: "diag ilegível" }); }
    const tabs = Array.isArray(d.tabelas) ? d.tabelas : [];
    const q = (c.req.query("q") || "").toUpperCase().trim();
    const alvo = q || "GUIA|REPRES|VEND|COMISS|FANTASIA|AGENTE";
    const re = new RegExp(alvo);
    const casa = tabs
      .filter((t) => re.test(String(t.nome).toUpperCase()) || (t.colunas || []).some((cc) => re.test(String(cc).toUpperCase())))
      .map((t) => ({ nome: t.nome, colunas: t.colunas }));
    return c.json({ quando: d.quando || r.atualizado_em, total_tabelas: tabs.length, nomes: tabs.map((t) => t.nome), casam: casa });
  }
  // ?pedido=procs → confirmação LEVE das procedures APP_* (Fase 4). Lê do diagnóstico
  // minúsculo dedicado (erp_diag_procs); se não houver, cai de volta no erp_diag.pedido.
  if (c.req.query("pedido") === "procs") {
    type ProcSrc = {
      quando?: string;
      procedures?: Record<string, { campo: string; ordem: number; dir: string; tipo: number; tam: number }[]>;
      triggers?: Record<string, { nome: string; tipo: number; seq: number; inativo: boolean }[]>;
      erros?: string[];
    };
    let src: ProcSrc | null = null;
    let quando: string | null = null;
    const pr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag_procs'").first<{ valor: string | null; atualizado_em: string | null }>();
    if (pr && pr.valor) { try { src = JSON.parse(pr.valor) as ProcSrc; quando = (src.quando || pr.atualizado_em) ?? null; } catch { /* ignora */ } }
    if (!src || !src.procedures) {
      const dr = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag'").first<{ valor: string | null; atualizado_em: string | null }>();
      if (dr && dr.valor) { try { const dd = JSON.parse(dr.valor) as { pedido?: ProcSrc; quando?: string }; if (dd.pedido && dd.pedido.procedures) { src = dd.pedido; quando = (dd.quando || dr.atualizado_em) ?? null; } } catch { /* ignora */ } }
    }
    if (!src || !src.procedures) return c.json({ pronto: false, aviso: "A ponte ainda não confirmou as procedures. Espere a ponte rodar (~2 min)." });
    const procedures: Record<string, string> = {};
    for (const nome of Object.keys(src.procedures || {})) {
      const ins = (src.procedures[nome] || []).filter((x) => x.dir === "in").map((x) => x.campo);
      const outs = (src.procedures[nome] || []).filter((x) => x.dir === "out").map((x) => x.campo);
      procedures[nome] = `(${ins.join(", ")})` + (outs.length ? ` → ${outs.join(", ")}` : "");
    }
    const triggers: Record<string, string[]> = {};
    for (const t of Object.keys(src.triggers || {})) triggers[t] = (src.triggers![t] || []).map((x) => `${x.nome}${x.inativo ? " (inativo)" : ""}`);
    return c.json({ pronto: true, quando, procedures, procedures_detalhe: src.procedures || {}, triggers, erros: src.erros || [] });
  }
  const row = await c.env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave='erp_diag'").first<{ valor: string | null; atualizado_em: string | null }>();
  if (!row || !row.valor) return c.json({ pronto: false, aviso: "A ponte ainda não mandou o diagnóstico. Espere a ponte rodar (~2 min)." });
  // ?raw=1 devolve o JSON completo; senão um resumo focado em preços/tamanhos.
  if (c.req.query("raw") === "1") return new Response(row.valor, { headers: { "Content-Type": "application/json; charset=utf-8" } });
  let d: { tabelas?: { nome: string; colunas: string[] }[]; amostras?: Record<string, unknown[]>; erros?: string[]; quando?: string; pedido?: unknown } = {};
  try { d = JSON.parse(row.valor); } catch { return c.json({ pronto: true, erro: "json_invalido", quando: row.atualizado_em }); }
  // ?pedido=1 → resumo ENXUTO da estrutura de escrita de pedido (Fase 4):
  // só os campos obrigatórios, geradores com valor, e a amostra de um pedido real.
  // ?pedido=full → o objeto completo (grande).
  if (c.req.query("pedido")) {
    const p = (d.pedido || {}) as {
      colunas?: Record<string, { campo: string; obrigatorio: boolean; tipo: number; tam: number }[]>;
      geradores?: { nome: string; valor: number | null }[];
      amostra?: { pedido?: Record<string, unknown>; itens?: unknown[]; cores?: unknown[] };
      outras?: Record<string, unknown[]>;
      procedures?: Record<string, { campo: string; ordem: number; dir: string; tipo: number; tam: number }[]>;
      triggers?: Record<string, { nome: string; tipo: number; seq: number; inativo: boolean; fonte: string | null }[]>;
      erros?: string[];
    };
    if (c.req.query("pedido") === "full") return c.json({ pronto: true, quando: d.quando || row.atualizado_em, pedido: d.pedido || null });
    const obrigatorios: Record<string, string[]> = {};
    for (const t of Object.keys(p.colunas || {})) obrigatorios[t] = (p.colunas![t] || []).filter((x) => x.obrigatorio).map((x) => x.campo);
    const outras_qtd: Record<string, number> = {};
    for (const t of Object.keys(p.outras || {})) outras_qtd[t] = Array.isArray(p.outras![t]) ? p.outras![t].length : 0;
    return c.json({
      pronto: true, quando: d.quando || row.atualizado_em,
      obrigatorios,
      geradores_com_valor: (p.geradores || []).filter((g) => g.valor != null),
      amostra: p.amostra || null,
      outras_qtd,
      erros: p.erros || [],
    });
  }
  const tabelas = Array.isArray(d.tabelas) ? d.tabelas : [];
  const tamProd = tabelas.find((t) => t.nome === "TAMANHO_PROD");
  const produtos = tabelas.find((t) => t.nome === "PRODUTOS");
  return c.json({
    pronto: true,
    quando: d.quando || row.atualizado_em,
    total_tabelas: tabelas.length,
    TAMANHO_PROD_colunas: tamProd?.colunas || null,
    PRODUTOS_colunas: produtos?.colunas || null,
    amostra_TAMANHO_PROD: d.amostras?.["TAMANHO_PROD"] || null,
    amostra_PRODUTOS: d.amostras?.["PRODUTOS"] || null,
    outras_amostras: Object.keys(d.amostras || {}).filter((k) => k !== "TAMANHO_PROD" && k !== "PRODUTOS"),
    erros: d.erros || [],
  });
});

// ── CONFERE os preços por tamanho que vieram do ERP ────────────────────────────
// Mostra uma amostra legível (ref, nome, cada tamanho com atacado/varejo) pra
// confirmar que o preço por tamanho chegou. Token OU sessão.
integracao.get("/catalogo-precos", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  if (!(esperado && recebido === esperado)) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  const { results } = await c.env.DB.prepare(
    "SELECT ref, nome, tamanhos FROM erp_produtos WHERE COALESCE(inativo,0)=0 ORDER BY nome LIMIT 25"
  ).all<{ ref: string; nome: string | null; tamanhos: string | null }>();
  type T = { medida?: string; tamanho?: string; atacado?: number; varejo?: number };
  const amostra = (results || []).map((p) => {
    let ts: unknown[] = []; try { const a = JSON.parse(p.tamanhos || "[]"); ts = Array.isArray(a) ? a : []; } catch { /* vazio */ }
    const tamanhos = ts.map((t) => typeof t === "string"
      ? { medida: t, atacado: null, varejo: null }
      : { medida: (t as T).medida || (t as T).tamanho || "", atacado: (t as T).atacado ?? null, varejo: (t as T).varejo ?? null });
    return { ref: p.ref, nome: p.nome, tamanhos };
  });
  const com_preco = amostra.filter((p) => p.tamanhos.some((t) => Number(t.atacado) > 0)).length;
  return c.json({ total_produtos: results?.length || 0, com_preco, aviso: com_preco ? "Preços por tamanho OK ✓" : "Ainda sem preço por tamanho — espere a ponte re-puxar (~4 min).", amostra });
});

// ── GERADOR do catálogo no FORMATO DO SITE (prévia) ──────────────────────────────
// Transforma os produtos do ERP (erp_produtos + erp_estoque) no formato que o site
// (Firebase catalogo/main) espera: banco_cores, banco_tamanhos, produtos, estoque.
// É só PRÉVIA — não grava no site. Serve pra validar o formato antes de ligar.
function slugId(s: string, usados: Set<string>): string {
  let base = String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  let id = base, i = 2;
  while (usados.has(id)) { id = `${base}-${i++}`; }
  usados.add(id);
  return id;
}
export async function gerarCatalogoSite(env: Env): Promise<{
  banco_cores: { id: string; nome: string; hex: string; categoria: string; foto: string }[];
  banco_tamanhos: { id: string; nome: string; medida: string }[];
  produtos: unknown[];
  estoque: { atualizadoMs: number; itens: Record<string, Record<string, Record<string, number>>> };
  _resumo: { produtos: number; cores: number; tamanhos: number };
}> {
  const cfg = async (k: string) => ((await env.DB.prepare("SELECT valor FROM config WHERE chave=?").bind(k).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
  const fotosBase = ((await cfg("erp_fotos_base")) || "https://bigtricot.syntechsistemas.com").replace(/\/+$/, "");
  const markupNorte = Number(await cfg("catalogo_markup_norte_pct")) || 10;
  // Qual preço o catálogo mostra: "atacado" (lojista, padrão) ou "varejo" (consumidor).
  // Os dois vêm por tamanho do ERP (TAMANHO_PROD.PRECO_VENDA / PRECO_VENDA_LJ).
  const campoPreco = (await cfg("catalogo_preco")) === "varejo" ? "varejo" : "atacado";

  // Produtos com código começando em "KT" são PEÇAS/COMPONENTES de kit — não entram
  // no catálogo (o kit "pai" aparece inteiro, com a composição no próprio nome).
  const { results: prodsRaw } = await env.DB.prepare(
    "SELECT ref, nome, classe, grupo, preco_varejo, preco_atacado, estoque_geral, cores, tamanhos FROM erp_produtos WHERE COALESCE(inativo,0)=0 AND UPPER(COALESCE(ref,'')) NOT LIKE 'KT%' ORDER BY nome"
  ).all<{ ref: string; nome: string | null; classe: string | null; grupo: string | null; preco_varejo: number | null; preco_atacado: number | null; estoque_geral: number | null; cores: string | null; tamanhos: string | null }>();
  // Ignora códigos bichados (com espaço/TAB no ref) — ex.: um duplicado "\tQC107855X35"
  // que o ERP gerou com um TAB grudado no código e polui o catálogo.
  const prods = prodsRaw.filter((p) => { const r = String(p.ref || ""); return r !== "" && !/\s/.test(r); });

  const idsCor = new Set<string>(), idsTam = new Set<string>();
  const corPorChave = new Map<string, { id: string; nome: string; hex: string; categoria: string; foto: string }>();
  const corIdPorNome = new Map<string, string>();
  const tamPorMedida = new Map<string, { id: string; nome: string; medida: string }>();
  const idCor = (nome: string, hex: string, categoria: string) => {
    // Identidade da cor = só o NOME (minúsculo, sem espaços nas pontas). O MESMO nome sempre
    // vira o MESMO id, não importa o hex nem de onde veio (produto, peça de kit ou estoque).
    // Antes a chave incluía o hex, então uma cor que só existe em peça de kit (ex.: "bege
    // novo", só na capa) ganhava um id diferente do estoque e "sumia" do catálogo.
    const chave = (nome || "").trim().toLowerCase() || ("#" + (hex || "").toLowerCase());
    let c = corPorChave.get(chave);
    if (!c) { c = { id: slugId(nome || hex || "cor", idsCor), nome: nome || "", hex: hex || "", categoria: categoria || "", foto: "" }; corPorChave.set(chave, c); if (nome) corIdPorNome.set((nome || "").trim().toLowerCase(), c.id); }
    else { if (!c.hex && hex) c.hex = hex; if (!c.categoria && categoria) c.categoria = categoria; if (!c.nome && nome) c.nome = nome; } // completa hex/cat se vier depois
    return c.id;
  };
  const idTam = (medida: string) => {
    const m = String(medida || "").trim();
    let t = tamPorMedida.get(m.toLowerCase());
    if (!t) { t = { id: slugId(m || "tam", idsTam), nome: m, medida: m }; tamPorMedida.set(m.toLowerCase(), t); }
    return t.id;
  };

  // O código do ERP diz o TIPO pela letra final: 8019A=Almofada, 8019C=Capa,
  // 8019P=Peseira/Manta. O número base (8019) é o MODELO. No site a gente mostra
  // UM produto por modelo (ex.: "GENEBRA") e, DENTRO dele, um grupo por tipo
  // (Almofada/Capa/Peseira-Manta), cada grupo com seus tamanhos. As cores ficam
  // no nível do produto (união das variações).
  // Títulos e ordem das seções iguais ao site: Mantas e Peseiras, Capas, Almofadas.
  const TIPO_NOME: Record<string, string> = { P: "Mantas e Peseiras", C: "Capas", A: "Almofadas", M: "Mantas", K: "Kits" };
  const TIPO_ORDEM: Record<string, number> = { P: 0, C: 1, A: 2, M: 3, K: 4 };
  const baseCod = (ref: string) => (ref || "").replace(/[A-Za-z]+$/, "") || ref || "";
  const tipoLetra = (ref: string) => { const m = (ref || "").match(/([A-Za-z])$/); return m ? m[1].toUpperCase() : ""; };
  // Tira só a palavra do TIPO no começo (ALMOFADA/CAPA/…) pra exibir o modelo limpo.
  // "KIT" é mantido de propósito: o nome do kit carrega a composição (ex.: "KIT ASPEN
  // +2- 55X35 C/ ENCHIMENTO"), então o cliente vê o nome E o que compõe o kit.
  const nomeModelo = (nome: string) => (nome || "").replace(/^\s*(ALMOFADAS?|CAPAS?|PESEIRAS?|MANTAS?|PESEIRA E MANTA)\s+/i, "").trim() || nome || "";

  // Mapeia o GRUPO do Syntech para a SEÇÃO do site. O site usa o campo "linha"
  // (polisoft/soft/natal/padrao) + a flag "pronta_entrega". Edição Limitada é
  // uma seção separada (edicao_limitada) — por ora cai em padrao, marcada.
  const secaoDoGrupo = (grupo: string): { linha: string; pronta_entrega: boolean; edicao_limitada: boolean } => {
    const g = (grupo || "").toLowerCase();
    if (g.includes("polisoft")) return { linha: "polisoft", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("soft")) return { linha: "soft", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("natal")) return { linha: "natal", pronta_entrega: false, edicao_limitada: false };
    if (g.includes("pronta")) return { linha: "padrao", pronta_entrega: true, edicao_limitada: false };
    if (g.includes("limitad") || g.includes("edic")) return { linha: "padrao", pronta_entrega: false, edicao_limitada: true };
    return { linha: "padrao", pronta_entrega: false, edicao_limitada: false };
  };

  type Linha = { id: string; cod: string; id_tamanho: string; sul: number; norte: number };
  type Variacao = { ref: string; base: string; letra: string; nomeModelo: string; grupo: string; foto: string; estoque: number; cores: { id_cor: string; oculta: boolean }[]; linhas: Linha[] };
  // tamanho pode vir como texto antigo ("45X45") ou objeto novo com preço por tamanho.
  type TamIn = { medida: string; tamanho?: string; atacado?: number; varejo?: number };
  const normTam = (t: unknown): TamIn => (typeof t === "string"
    ? { medida: t }
    : { medida: String((t as TamIn)?.medida || (t as TamIn)?.tamanho || "").trim(), tamanho: (t as TamIn)?.tamanho, atacado: Number((t as TamIn)?.atacado) || 0, varejo: Number((t as TamIn)?.varejo) || 0 });
  const variacoes: Variacao[] = prods.map((p) => {
    const cores = ((): { nome?: string; hex?: string }[] => { try { return JSON.parse(p.cores || "[]"); } catch { return []; } })();
    const tamanhos = ((): TamIn[] => { try { const a = JSON.parse(p.tamanhos || "[]"); return (Array.isArray(a) ? a : []).map(normTam).filter((x) => x.medida); } catch { return []; } })();
    // preço de fallback (nível do produto) — usado só se o tamanho não trouxer preço.
    const fb = Number(campoPreco === "varejo" ? p.preco_varejo : p.preco_atacado) || 0;
    const prodCores = cores.map((co) => ({ id_cor: idCor(co.nome || "", co.hex || "", p.grupo || ""), oculta: false }));
    const linhas = (tamanhos.length ? tamanhos : [{ medida: "" } as TamIn]).map((t) => {
      const porTam = Number(campoPreco === "varejo" ? t.varejo : t.atacado) || 0;
      const base = porTam || fb; // preço por tamanho; cai no do produto se faltar
      const sul = Math.round(base * 100) / 100;
      const norte = Math.round(base * (1 + markupNorte / 100) * 100) / 100;
      return { id: `${p.ref}-${idTam(t.medida)}`, cod: p.ref, id_tamanho: idTam(t.medida), sul, norte };
    });
    return { ref: p.ref, base: baseCod(p.ref), letra: tipoLetra(p.ref), nomeModelo: nomeModelo(p.nome || p.ref), grupo: p.grupo || "", foto: p.classe && p.ref ? `${fotosBase}/${encodeURIComponent(p.classe)}/${encodeURIComponent(p.ref)}.jpg` : "", estoque: Number(p.estoque_geral) || 0, cores: prodCores, linhas };
  });

  // agrupa as variações (A/C/P) por modelo (código base)
  const porModelo = new Map<string, { base: string; nome: string; grupo: string; foto: string; cores: Map<string, { id_cor: string; oculta: boolean }>; vars: Variacao[] }>();
  for (const v of variacoes) {
    let g = porModelo.get(v.base);
    if (!g) { g = { base: v.base, nome: v.nomeModelo, grupo: v.grupo, foto: "", cores: new Map(), vars: [] }; porModelo.set(v.base, g); }
    g.vars.push(v);
    if (!g.grupo && v.grupo) g.grupo = v.grupo;
    if (v.nomeModelo && (!g.nome || v.nomeModelo.length < g.nome.length)) g.nome = v.nomeModelo;
    if (!g.foto && v.foto) g.foto = v.foto;
    for (const c of v.cores) if (!g.cores.has(c.id_cor)) g.cores.set(c.id_cor, c);
  }

  const produtos = [...porModelo.values()].map((g) => {
    const vars = g.vars.slice().sort((a, b) => (TIPO_ORDEM[a.letra] ?? 9) - (TIPO_ORDEM[b.letra] ?? 9) || a.ref.localeCompare(b.ref));
    const sec = secaoDoGrupo(g.grupo);
    // Edição Limitada é definida SÓ pela sigla ED na referência (ex.: ED1012-C/A/P), NÃO
    // pelo nome do grupo do Syntech — que vinha marcando produto errado como EL. Quem é ED
    // não entra em Pronta Entrega nem nas linhas: vai só pra seção Edição Limitada.
    const isEL = vars.some((v) => /^ED\d/i.test((v.ref || "").trim()));
    return {
      id: g.base,
      nome: g.nome,
      linha: isEL ? "padrao" : sec.linha,
      pronta_entrega: isEL ? false : sec.pronta_entrega,
      _edicao_limitada: isEL,
      _kit: false,
      _kitTitulo: "",
      composicao: "100% Poliéster",
      tipo: "avulso",
      lancamento: false,
      foto: g.foto,
      video: "",
      // blocos: textos descritivos por produto (o site faz Object.keys(blocos)).
      // Vazio aqui — pode vir a ser preenchido depois.
      blocos: {},
      estoque_geral: vars.reduce((s, v) => s + (Number(v.estoque) || 0), 0),
      cores: [...g.cores.values()],
      grupos: vars.map((v) => ({ id: `${g.base}-${v.letra || "x"}`, titulo: TIPO_NOME[v.letra] || "", ref: v.ref, estoque: v.estoque, linhas: v.linhas })),
    };
  });

  // estoque: itens[ref][medida][id_cor] = saldo (casa a cor pelo nome)
  const { results: est } = await env.DB.prepare("SELECT ref, cor, tamanho, saldo FROM erp_estoque").all<{ ref: string | null; cor: string | null; tamanho: string | null; saldo: number }>().catch(() => ({ results: [] as { ref: string | null; cor: string | null; tamanho: string | null; saldo: number }[] }));
  const itens: Record<string, Record<string, Record<string, number>>> = {};
  for (const e of est) {
    const ref = (e.ref || "").trim(); if (!ref) continue;
    const med = (e.tamanho || "").trim() || "-";
    // MESMO id da cor que a exibição usa (idCor, por NOME) — assim o saldo casa mesmo
    // quando a cor só existe em peça de kit (ex.: bege novo). Antes gerava id separado.
    const cid = idCor((e.cor || "").trim() || "cor", "", "");
    itens[ref] = itens[ref] || {};
    itens[ref][med] = itens[ref][med] || {};
    itens[ref][med][cid] = Number(e.saldo) || 0;
  }
  // Desconta as RESERVAS locais (pedidos já enviados pelo cliente/rep, mas ainda não
  // refletidos no SALDO do Syntech). Assim vender um kit/capa baixa NA HORA as outras
  // opções que dividem a mesma capa (vazio, cheio e avulsa). Quando o Syntech empenha e a
  // ponte traz o SALDO menor, a reserva deixa de contar (não desconta duas vezes).
  try {
    const syncEm = (await env.DB.prepare("SELECT valor FROM config WHERE chave='estoque_sync_em'").first<{ valor: string | null }>())?.valor || null;
    const { results: rvs } = await env.DB.prepare(
      `SELECT rv.ref AS ref, rv.cor AS cor, rv.tamanho AS tamanho, SUM(rv.qtd) AS q
         FROM erp_reserva rv JOIN pedidos p ON p.id = rv.pedido_id
        WHERE rv.criado_em > datetime('now','-7 days')
          AND COALESCE(p.erp_sync_status,'') IN ('pendente','erro','enviado')
          AND NOT (COALESCE(p.erp_sync_status,'')='enviado' AND p.erp_sync_em IS NOT NULL AND ? IS NOT NULL AND p.erp_sync_em <= ?)
        GROUP BY rv.ref, rv.cor, rv.tamanho`
    ).bind(syncEm, syncEm).all<{ ref: string; cor: string | null; tamanho: string | null; q: number }>();
    for (const rv of rvs || []) {
      const ref = (rv.ref || "").trim(); if (!ref) continue;
      const med = (rv.tamanho || "").trim() || "-";
      const cid = idCor((rv.cor || "").trim() || "cor", "", "");
      if (itens[ref] && itens[ref][med] && itens[ref][med][cid] != null) {
        itens[ref][med][cid] = Math.max(0, (Number(itens[ref][med][cid]) || 0) - (Number(rv.q) || 0));
      }
    }
  } catch { /* reservas: nunca derruba o catálogo */ }

  // ── KITS (pronta entrega): usa a RECEITA do Syntech (erp_kit_receita) pra
  //   1) marcar o produto como KIT e jogar na Pronta Entrega;
  //   2) nome do anúncio = só a FAMÍLIA ("Kit Balls"); o tamanho (Queen 70×2,20)
  //      vira a opção DENTRO, no lugar do "UN"/"único";
  //   3) COMPOSIÇÃO com os tamanhos de verdade ("1× Peseira 70×2,20 + 2× Capas 55×35");
  //   4) estoque AO VIVO = menor( estoque_da_peça ÷ quantidade ).
  // As peças (KT…) ficam fora do catálogo, mas existem em erp_produtos (com estoque).
  try {
    const { results: rec } = await env.DB.prepare(
      "SELECT kit_ref, componente_ref, quantidade, tamanho FROM erp_kit_receita"
    ).all<{ kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }>();
    if (rec && rec.length) {
      const compRefs = [...new Set(rec.map((r) => r.componente_ref).filter(Boolean))];
      type CompFull = { nome: string; estoque: number; cores: { nome?: string; hex?: string }[]; tamanhos: TamIn[]; pa: number; pv: number };
      const compInfo = new Map<string, CompFull>();
      if (compRefs.length) {
        const ph = compRefs.map(() => "?").join(",");
        const { results: cps } = await env.DB.prepare(
          `SELECT ref, nome, estoque_geral, cores, tamanhos, preco_atacado, preco_varejo FROM erp_produtos WHERE ref IN (${ph})`
        ).bind(...compRefs).all<{ ref: string; nome: string | null; estoque_geral: number | null; cores: string | null; tamanhos: string | null; preco_atacado: number | null; preco_varejo: number | null }>();
        for (const cp of cps) {
          let cc: { nome?: string; hex?: string }[] = [], tt: TamIn[] = [];
          try { const a = JSON.parse(cp.cores || "[]"); if (Array.isArray(a)) cc = a; } catch { /* ignora */ }
          try { const a = JSON.parse(cp.tamanhos || "[]"); if (Array.isArray(a)) tt = a.map(normTam).filter((x) => x.medida); } catch { /* ignora */ }
          compInfo.set(cp.ref, { nome: String(cp.nome || cp.ref).trim(), estoque: Number(cp.estoque_geral) || 0, cores: cc, tamanhos: tt, pa: Number(cp.preco_atacado) || 0, pv: Number(cp.preco_varejo) || 0 });
        }
      }
      const recPorKit = new Map<string, { comp: string; qtd: number; tam: string }[]>();
      for (const r of rec) {
        const arr = recPorKit.get(r.kit_ref) || [];
        arr.push({ comp: r.componente_ref, qtd: Number(r.quantidade) || 1, tam: String(r.tamanho || "").trim() });
        recPorKit.set(r.kit_ref, arr);
      }
      const tituloCaso = (s: string) => s.toLowerCase().replace(/\b[\p{L}]/gu, (ch) => ch.toUpperCase());
      // Dimensão da PESEIRA/colcha pela variação (a dona confirmou as medidas).
      const DIM_VARIACAO: Record<string, string> = { QUEEN: "70×2,20", KING: "70×2,50", MANTA: "90×2,00", MANTAS: "90×2,00" };
      // Lê do NOME do kit a família ("Kit Balls"), a variação (QUEEN) e a medida da
      // almofada (o "+ 55X35"). Ex.: "KIT BALLS QUEEN + 55X35".
      const parseKit = (nome: string) => {
        const up = (nome || "").toUpperCase();
        let almofada = "";
        const mp = up.match(/\+\s*([0-9]{1,3}\s*[X×]\s*[0-9]{1,3}(?:[.,][0-9]+)?)/);
        if (mp) almofada = mp[1].replace(/\s+/g, "").replace(/X/g, "×");
        let variacao = "", peseiraDim = "";
        for (const k of Object.keys(DIM_VARIACAO)) { if (new RegExp("\\b" + k + "\\b").test(up)) { variacao = k; peseiraDim = DIM_VARIACAO[k]; break; } }
        let fam = nome;
        if (variacao) { const i = up.indexOf(variacao); if (i >= 0) fam = nome.slice(0, i); }
        else { const ip = nome.indexOf("+"); if (ip >= 0) fam = nome.slice(0, ip); }
        fam = fam.replace(/[-–+\s]+$/, "").trim();
        return { familia: fam || nome, variacao, almofada, peseiraDim };
      };
      // Tipo da peça pelo NOME: peseira/manta, almofada (cheia, c/ enchimento) ou capa (só a capa).
      const tipoPeca = (n: string) => { const u = (n || "").toUpperCase(); if (/PESEIRA|MANTA/.test(u)) return "peseira"; if (/ALMOFADA/.test(u)) return "almofada"; if (/CAPA/.test(u)) return "capa"; return "outro"; };
      const VAR_ORDEM: Record<string, number> = { QUEEN: 0, KING: 1, MANTA: 2, MANTAS: 2 };

      // 1) Calcula cada KIT (variação) e AGRUPA por família ("Kit Balls"), pra virar
      //    UM anúncio só, com cada variação como uma opção de tamanho.
      type Linha0 = { id: string; cod: string; id_tamanho: string; sul: number; norte: number };
      type KitVar = { prod: typeof produtos[number]; medida: string; vivo: number; pecas: number; variacao: string; temEnch: boolean; almofada: string; linha: Linha0 | null; estCor: Record<string, number>; temCor: boolean };
      const porFamilia = new Map<string, { fam: string; vars: KitVar[] }>();
      for (const prod of produtos) {
        const itensR = recPorKit.get(prod.id);
        if (!itensR) continue;
        const pk = parseKit(prod.nome);
        const temEnch = /ENCHIMENTO/i.test(prod.nome);
        let vivo = Infinity;
        let pecas = 0;
        const partes: { ordem: number; txt: string }[] = [];
        for (const it of itensR) {
          const info = compInfo.get(it.comp) || { nome: it.comp, estoque: 0 };
          pecas += Number(it.qtd) || 0;
          vivo = Math.min(vivo, Math.floor(info.estoque / (it.qtd || 1)));
          const tp = tipoPeca(info.nome);
          const dim = tp === "peseira" ? pk.peseiraDim : (tp === "capa" || tp === "almofada") ? pk.almofada : "";
          const rotulo = tp === "peseira" ? (it.qtd > 1 ? "Peseiras" : "Peseira")
            : tp === "almofada" ? (it.qtd > 1 ? "Almofadas" : "Almofada")
              : tp === "capa" ? (it.qtd > 1 ? "Capas" : "Capa")
                : tituloCaso(info.nome);
          partes.push({ ordem: tp === "peseira" ? 0 : 1, txt: `${it.qtd}- ${rotulo}${dim ? " " + dim : ""}` });
        }
        vivo = isFinite(vivo) ? Math.max(0, vivo) : 0;
        // Estoque do kit POR COR = SÓ a CAPA (a peça que tem a cor do cliente). Puxa o
        // saldo individual da capa (erp_estoque), por cor, SÓ no tamanho em que ela entra
        // neste kit (it.tam, código do Syntech ex.: "5K") — nunca soma os outros tamanhos
        // (era o bug que inflava, ex.: 160/180). Peseira/enchimento não limitam.
        const corTamStock = (comp: string, tam: string): Record<string, number> | null => {
          const m = itens[comp]; if (!m) return null;
          const keys = Object.keys(m);
          const t = String(tam || "").trim().toLowerCase();
          // casa o TAMANHO da peça no kit (código do Syntech) com a chave do estoque;
          // se não casar, usa todas as chaves (seguro).
          let meds = keys;
          if (t) { const hit = keys.filter((k) => String(k).trim().toLowerCase() === t); if (hit.length) meds = hit; }
          const acc: Record<string, number> = {}; let any = false;
          for (const med of meds) for (const cid of Object.keys(m[med])) { acc[cid] = (acc[cid] || 0) + (Number(m[med][cid]) || 0); any = true; }
          return any ? acc : null;
        };
        // As peças COM cor (capa E peseira) limitam o kit. Para cada cor, o menor
        // ( saldo_da_peça_na_cor ÷ qtd ), puxando cada peça do cadastro individual no SEU
        // tamanho. Enchimento (sem cor) não limita.
        const coloridas = itensR
          .map((it) => ({ qtd: Number(it.qtd) || 1, cs: corTamStock(it.comp, it.tam), info: compInfo.get(it.comp) }))
          .filter((x) => !!(x.info && Array.isArray(x.info.cores) && x.info.cores.length > 0));
        const temCor = coloridas.length > 0 && coloridas.every((x) => x.cs != null);
        const estCor: Record<string, number> = {};
        if (temCor) {
          const cids = new Set<string>();
          for (const x of coloridas) for (const cid of Object.keys(x.cs!)) cids.add(cid);
          for (const cid of cids) {
            let v = Infinity;
            for (const x of coloridas) v = Math.min(v, Math.floor((Number(x.cs![cid]) || 0) / (x.qtd || 1)));
            estCor[cid] = isFinite(v) ? Math.max(0, v) : 0;
          }
        }
        // total do kit (badge/soma) = soma das cores; se não tiver por cor, mantém o 'vivo'.
        if (temCor) vivo = Object.values(estCor).reduce((s, n) => s + (Number(n) || 0), 0);
        else vivo = 0; // SEM saldo real por cor/tamanho das peças → NÃO chuta o total do cadastro; mostra 0 (sob encomenda)
        partes.sort((a, b) => a.ordem - b.ordem);
        // Composição no formato pedido (regra fixa): "1- Peseira 70×2,20 + 2- Capas 55×35
        // ( sem enchimento )" e "... + 2- Almofadas 55×35 ( com enchimento )". Separador "+".
        const compBase = partes.map((p) => p.txt).join(" + ");
        const comp = compBase ? `${compBase} ( ${temEnch ? "com" : "sem"} enchimento )` : compBase;
        const medida = comp || (pk.variacao ? tituloCaso(pk.variacao) : "Único");
        const fam = pk.familia ? tituloCaso(pk.familia) : (prod.nome || prod.id);
        const l0 = (prod.grupos[0] && prod.grupos[0].linhas[0]) || null;
        const g = porFamilia.get(fam) || { fam, vars: [] };
        g.vars.push({ prod, medida, vivo, pecas, variacao: pk.variacao, temEnch, almofada: pk.almofada, linha: l0, estCor, temCor });
        porFamilia.set(fam, g);
      }

      // 1b) KITS SEM RECEITA no Syntech (ex.: WAVE): sem composição cadastrada em
      //     INSUMOS_PROD, o passo acima os ignora e eles ficam como cards soltos (um por
      //     tamanho). Aqui montamos a variação pela REGRA FIXA do kit (1 peseira + 2
      //     capas/almofadas = 3 peças) só para AGRUPAR os tamanhos num anúncio só. Sem
      //     receita não há saldo por peça → ficam "sob encomenda" (vivo=0) até cadastrarem
      //     a composição; aí passam a puxar estoque igual à balls, sem mexer no código.
      for (const prod of produtos) {
        if (recPorKit.has(prod.id)) continue;             // já tratado pela receita acima
        if (!/\bKIT\b/i.test(prod.nome || "")) continue;   // só kits
        const pk = parseKit(prod.nome);
        if (!pk.variacao) continue;                        // precisa de Queen/King/Manta pra agrupar
        const temEnch = /ENCHIMENTO/i.test(prod.nome || "");
        const partes = [
          { ordem: 0, txt: `1- Peseira${pk.peseiraDim ? " " + pk.peseiraDim : ""}` },
          { ordem: 1, txt: `2- ${temEnch ? "Almofadas" : "Capas"}${pk.almofada ? " " + pk.almofada : ""}` },
        ].sort((a, b) => a.ordem - b.ordem);
        const compBase = partes.map((p) => p.txt).join(" + ");
        const medida = `${compBase} ( ${temEnch ? "com" : "sem"} enchimento )`;
        const fam = pk.familia ? tituloCaso(pk.familia) : (prod.nome || prod.id);
        const l0 = (prod.grupos[0] && prod.grupos[0].linhas[0]) || null;
        const g = porFamilia.get(fam) || { fam, vars: [] };
        g.vars.push({ prod, medida, vivo: 0, pecas: 3, variacao: pk.variacao, temEnch, almofada: pk.almofada, linha: l0, estCor: {}, temCor: false });
        porFamilia.set(fam, g);
      }

      // 2) Monta um PRODUTO unificado por família e remove os individuais.
      const idsRemover = new Set<string>();
      const unificados: (typeof produtos[number])[] = [];
      for (const grp of porFamilia.values()) {
        const vars = grp.vars.slice().sort((a, b) =>
          ((VAR_ORDEM[a.variacao] ?? 9) - (VAR_ORDEM[b.variacao] ?? 9)) || ((a.temEnch ? 1 : 0) - (b.temEnch ? 1 : 0)));
        // Cada kit lê o estoque da SUA peça colorida: o "sem enchimento" (vazio) pela CAPA
        // (KT…-C) e o "com enchimento" (cheio) pela ALMOFADA (KT…-A) — cada peça tem saldo
        // próprio no Syntech, por cor/tamanho. Quem limita o kit é min(saldo_da_peça ÷ 2,
        // peseira). As almofadas são divididas entre o kit e a venda avulsa (ver RESERVA
        // abaixo): o que o kit cheio segura não aparece mais na almofada avulsa.
        //
        // REGRA capa/almofada (clone): numa MESMA variação (Queen/King/Manta), o kit "sem
        // enchimento" (capa) e o "com enchimento" (almofada) são a MESMA peça física — a
        // almofada é a capa já com o enchimento. As duas opções COMPARTILHAM o estoque:
        // tanto faz em qual peça o Syntech tem o saldo, as duas mostram o mesmo número por
        // cor. A loja conta a peça UMA vez e impede vender as duas além do que existe.
        const porVariacao = new Map<string, typeof vars>();
        for (const v of vars) { const k = v.variacao || "x"; const a = porVariacao.get(k); if (a) a.push(v); else porVariacao.set(k, [v]); }
        for (const lista of porVariacao.values()) {
          if (lista.length < 2) continue;                 // só há clone quando há capa E almofada
          const cids = new Set<string>();
          for (const v of lista) for (const cid of Object.keys(v.estCor)) cids.add(cid);
          if (!cids.size) continue;                       // sem saldo por cor (ex.: WAVE) → nada a clonar
          const shared: Record<string, number> = {};
          for (const cid of cids) shared[cid] = Math.max(...lista.map((v) => Number(v.estCor[cid]) || 0));
          const vivoShared = Object.values(shared).reduce((s, n) => s + (Number(n) || 0), 0);
          for (const v of lista) { v.estCor = { ...shared }; v.temCor = true; v.vivo = vivoShared; }
        }
        const coresMap = new Map<string, { id_cor: string; oculta: boolean }>();
        // UMA SEÇÃO por tamanho (Queen/King/Manta), cada uma com a capa e a almofada
        // dela embaixo — pra separar e não confundir. A variação vira o TÍTULO da seção
        // (não repete no texto de cada opção).
        const secoes = new Map<string, { titulo: string; est: number; linhas: Linha0[] }>();
        const ordemSec: string[] = [];
        let estTotal = 0;
        for (const v of vars) {
          idsRemover.add(v.prod.id);
          for (const c of v.prod.cores) if (!coresMap.has(c.id_cor)) coresMap.set(c.id_cor, c);
          const tid = idTam(v.medida);
          const key = v.variacao || "x";
          if (!secoes.has(key)) {
            const tituloSec = v.variacao
              ? `Kit ${v.pecas} ${v.pecas === 1 ? "Peça" : "Peças"} ${tituloCaso(v.variacao)}`
              : (v.pecas ? `Kit ${v.pecas} ${v.pecas === 1 ? "Peça" : "Peças"}` : "Tamanho");
            secoes.set(key, { titulo: tituloSec, est: 0, linhas: [] }); ordemSec.push(key);
          }
          const sec = secoes.get(key)!;
          sec.linhas.push({ id: `${v.prod.id}-${tid}`, cod: v.prod.id, id_tamanho: tid, sul: v.linha ? v.linha.sul : 0, norte: v.linha ? v.linha.norte : 0 });
          // estoque da variação contado UMA vez: capa e almofada são a mesma peça (clone),
          // então o saldo da seção é o do par, não a soma das duas opções.
          sec.est = v.temCor ? Object.values(v.estCor).reduce((s, n) => s + (Number(n) || 0), 0) : Math.max(sec.est, v.vivo);
          // estoque por variação E por cor (cada opção tem o código do kit dela). Kit SEM
          // receita no Syntech (ex.: WAVE ainda sem composição) escreve 0 → aparece como
          // "estoque esgotado" e não deixa comprar (kit é pronta entrega, não sob encomenda);
          // volta a ter saldo quando cadastrarem a composição no Syntech.
          itens[v.prod.id] = itens[v.prod.id] || {};
          itens[v.prod.id][v.medida] = itens[v.prod.id][v.medida] || {};
          if (v.prod.cores.length) { for (const c of v.prod.cores) itens[v.prod.id][v.medida][c.id_cor] = v.temCor ? (v.estCor[c.id_cor] || 0) : v.vivo; }
          else itens[v.prod.id][v.medida]["-"] = v.vivo;
        }
        // total do anúncio = soma do saldo de cada variação (já contado uma vez por par).
        estTotal = [...secoes.values()].reduce((s, sec) => s + (Number(sec.est) || 0), 0);
        const prim = vars[0].prod;
        // `compartilha` marca as seções de KIT (capa+almofada da mesma peça) pra loja
        // impedir vender as duas além do estoque; seções avulsas não compartilham.
        const grupos = ordemSec.map((key) => { const s = secoes.get(key)!; return { id: `${prim.id}-${key}`, titulo: s.titulo, ref: "", estoque: s.est, linhas: s.linhas, compartilha: s.linhas.length > 1 }; });

        // RESERVA de componentes pelos kits: cada kit disponível "segura" as peças que
        // usa (capa/almofada) no tamanho dela. A venda avulsa mostra só o que SOBRA —
        // assim não vende a mesma capa duas vezes (ex.: 10 kits manta usam 20 capas; de
        // 30 sobram 10 pra avulsa). reservado[ref][tam][cor] = Σ (kit disponível × qtd).
        const reservado: Record<string, Record<string, Record<string, number>>> = {};
        for (const v of vars) {
          // cada kit disponível reserva a SUA peça colorida: o vazio reserva a CAPA, o
          // cheio reserva a ALMOFADA. Como são peças (refs) diferentes, não há dupla
          // contagem; a venda avulsa de cada peça mostra só o que SOBRA depois dos kits.
          if (!v.temCor) continue;
          for (const it of (recPorKit.get(v.prod.id) || [])) {
            const tamKey = String(it.tam || "").trim();
            const r1 = (reservado[it.comp] ||= {});
            const r2 = (r1[tamKey] ||= {});
            for (const cid of Object.keys(v.estCor)) r2[cid] = (r2[cid] || 0) + (Number(v.estCor[cid]) || 0) * (Number(it.qtd) || 1);
          }
        }

        // AVULSAS: além dos kits, vende a CAPA e a ALMOFADA separadas (só 50×50), no
        // mesmo anúncio. Usa os componentes do kit (ex.: KT1078-C capa, KT1078-A almofada),
        // que têm estoque, preço (por tamanho) e cores próprios.
        const compRefsFam = new Set<string>();
        for (const v of vars) for (const it of (recPorKit.get(v.prod.id) || [])) compRefsFam.add(it.comp);
        const soDig = (m: string) => String(m || "").toLowerCase().replace(/[^0-9]/g, "");
        // Tamanho 50×50 de CADA peça, tirado da receita da variação 50×50 (Manta): ex.
        // capa → 5K, almofada → 7K. É a fonte confiável do "qual tamanho é o 50×50".
        const tam50 = new Map<string, string>();
        for (const v of vars) {
          if (soDig(v.almofada) !== "5050") continue;
          for (const it of (recPorKit.get(v.prod.id) || [])) if (it.tam) tam50.set(it.comp, it.tam.slice(0, 10));
        }
        // Linhas avulsas de UMA peça (capa OU almofada), já com o rótulo de enchimento no
        // nome da medida ("50×50 ( sem enchimento )" / "( com enchimento )") — a loja joga
        // esse "enchimento" numa linha de baixo em destaque, igual aos kits.
        const avulsaLinhas = (ref: string, ench: "sem" | "com") => {
          const cf = compInfo.get(ref); if (!cf) return null;
          const cod = (tam50.get(ref) || "").toLowerCase();
          // só o tamanho 50×50: casa pelo CÓDIGO da receita (5K/7K); se não achar, pela MEDIDA 50×50.
          let tams = cod ? cf.tamanhos.filter((t) => String(t.tamanho || "").trim().toLowerCase() === cod) : [];
          if (!tams.length) tams = cf.tamanhos.filter((t) => soDig(t.medida) === "5050");
          if (!tams.length) return null;                        // sem 50×50 → sem opção avulsa
          const linhasA: Linha0[] = [];
          let estAv = 0;
          for (const t of tams) {
            const porTam = Number(campoPreco === "varejo" ? t.varejo : t.atacado) || 0;
            const base = porTam || (campoPreco === "varejo" ? cf.pv : cf.pa) || 0;
            const sul = Math.round(base * 100) / 100;
            const norte = Math.round(base * (1 + markupNorte / 100) * 100) / 100;
            const medEnch = `${t.medida} ( ${ench} enchimento )`;   // ex.: "50×50 ( sem enchimento )"
            const tid = idTam(medEnch);
            linhasA.push({ id: `${ref}-${tid}`, cod: ref, id_tamanho: tid, sul, norte });
            // saldo POR COR da peça NESTE tamanho (cadastro individual = erp_estoque, por
            // código Syntech ex.: "5K"). Nunca usa o estoque_geral (soma de tudo).
            const escTam = (itens[ref] && itens[ref][String(t.tamanho || "").trim()]) || null;
            const resvTam = (reservado[ref] && reservado[ref][String(t.tamanho || "").trim()]) || {}; // capas já seguradas pelos kits
            itens[ref] = itens[ref] || {};
            itens[ref][medEnch] = itens[ref][medEnch] || {};
            // SEM saldo por cor/tamanho no espelho → 0 (sob encomenda), nunca o total do cadastro.
            if (cf.cores.length) { for (const c of cf.cores) { const cid = idCor(c.nome || "", c.hex || "", ""); const bruto = escTam ? (Number(escTam[cid]) || 0) : 0; const s = Math.max(0, bruto - (Number(resvTam[cid]) || 0)); itens[ref][medEnch][cid] = s; estAv += s; } }
            else { const bruto = escTam ? Object.values(escTam).reduce((a, n) => a + (Number(n) || 0), 0) : 0; const resvTotal = Object.values(resvTam).reduce((a, n) => a + (Number(n) || 0), 0); const s = Math.max(0, bruto - resvTotal); itens[ref][medEnch]["-"] = s; estAv += s; }
          }
          for (const c of cf.cores) { const cid = idCor(c.nome || "", c.hex || "", ""); if (!coresMap.has(cid)) coresMap.set(cid, { id_cor: cid, oculta: false }); }
          return { estoque: estAv, linhas: linhasA };
        };
        const capaRef = [...compRefsFam].find((r) => tipoPeca(compInfo.get(r)?.nome || "") === "capa");
        const almoRef = [...compRefsFam].find((r) => tipoPeca(compInfo.get(r)?.nome || "") === "almofada");
        // UMA seção "Almofada avulsa 50×50" com as duas opções: sem enchimento (capa) e com
        // enchimento (almofada), cada uma com seu preço e estoque próprios.
        const avSem = capaRef ? avulsaLinhas(capaRef, "sem") : null;
        const avCom = almoRef ? avulsaLinhas(almoRef, "com") : null;
        const avLinhas = [...(avSem?.linhas || []), ...(avCom?.linhas || [])];
        if (avLinhas.length) {
          const estAv = (avSem?.estoque || 0) + (avCom?.estoque || 0);
          grupos.push({ id: `${prim.id}-av`, titulo: "Almofada avulsa 50×50", ref: "", estoque: estAv, linhas: avLinhas, compartilha: false });
          estTotal += estAv;
        }

        unificados.push({
          id: "kit-" + grp.fam.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""),
          nome: grp.fam, linha: prim.linha, pronta_entrega: true, _edicao_limitada: false,
          _kit: true, _kitTitulo: grp.fam, composicao: "", tipo: "avulso", lancamento: false,
          foto: prim.foto, video: "", blocos: {}, estoque_geral: estTotal,
          cores: [...coresMap.values()],
          grupos,
        });
      }
      // troca os kits individuais pelos anúncios unificados
      for (let i = produtos.length - 1; i >= 0; i--) if (idsRemover.has(produtos[i].id)) produtos.splice(i, 1);
      for (const u of unificados) produtos.push(u);
    }
  } catch { /* kits: silencioso — nunca derruba o catálogo */ }

  return {
    banco_cores: [...corPorChave.values()],
    banco_tamanhos: [...tamPorMedida.values()],
    produtos,
    estoque: { atualizadoMs: Date.now(), itens },
    _resumo: { produtos: produtos.length, cores: corPorChave.size, tamanhos: tamPorMedida.size },
  };
}

// Monta o DOCUMENTO COMPLETO do catálogo no formato do site, 100% do ERP.
// Usa só o LAYOUT/CONFIG do catálogo atual (aberturas, linhas_ocultas, reajustes,
// varejo, _bancoTamV3, region, cor_categorias, capa, representantes, pedido_config,
// contato…) e troca TODO o conteúdo de produto pelo ERP. Separa a Edição Limitada
// na seção própria. IMPORTANTE: o site NÃO mostra produto SEM FOTO — por isso
// casamos cada produto do ERP com a FOTO do catálogo atual pelo NOME do modelo
// (as fotos continuam no Cloudinary; só o preço/estrutura vem do Syntech).
const normNome = (s: string) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
export async function gerarDocSite(env: Env): Promise<Record<string, unknown>> {
  const cat = await gerarCatalogoSite(env);
  type Prod = { nome?: string; foto?: string; fotoDescricao?: string; blocos?: Record<string, unknown>; _edicao_limitada?: boolean;[k: string]: unknown };
  const prods = (cat.produtos as Prod[]) || [];
  let base: Record<string, unknown> = {};
  try { base = (await lerDocumento(env, "catalogo/main")) || {}; } catch { base = {}; }
  const baseEL = (base.edicao_limitada && typeof base.edicao_limitada === "object") ? (base.edicao_limitada as Record<string, unknown>) : {};

  // Mapa NOME-do-modelo → foto/vídeo/descrição/blocos, do catálogo atual (produtos + EL).
  type FotoInfo = { foto: string; video: string; fotoDescricao: string; blocos: Record<string, unknown> };
  const fotoMap = new Map<string, FotoInfo>();
  const baseProdAll = [
    ...(Array.isArray(base.produtos) ? (base.produtos as Prod[]) : []),
    ...(Array.isArray(baseEL.produtos) ? (baseEL.produtos as Prod[]) : []),
  ];
  for (const p of baseProdAll) {
    if (p && p.foto) {
      const k = normNome(p.nome || "");
      if (k && !fotoMap.has(k)) fotoMap.set(k, { foto: p.foto, video: String((p as { video?: unknown }).video || ""), fotoDescricao: p.fotoDescricao || "", blocos: (p.blocos && typeof p.blocos === "object") ? p.blocos : {} });
    }
  }
  const aber = (base.aberturas && typeof base.aberturas === "object") ? (base.aberturas as Record<string, { foto?: string }>) : {};
  const placeholder = aber.padrao?.foto || ((base.capa as { foto?: string } | undefined)?.foto) || "";
  // Deriva o MODELO (a linha, ex.: "WAVE") a partir do nome do kit, pra casar a
  // foto/ficha do card curado mesmo quando o kit AINDA não está agrupado (sem receita):
  // "KIT WAVE KING + 55X35" → tira "KIT", corta na variação/"+" → "WAVE".
  const modeloDoNome = (nome: string) =>
    String(nome || "").replace(/^\s*KITS?\s+/i, "").replace(/\b(QUEEN|KING|MANTAS?)\b.*$/i, "").replace(/\+.*$/, "").trim();
  for (const p of prods) {
    // KIT: casa foto/vídeo/textos tentando vários nomes — a ficha do catálogo antigo
    // pode estar na FAMÍLIA ("Kit Balls"), no MODELO sem "KIT" ("Balls"/"Wave", a mesma
    // linha das peças) ou no nome longo do Syntech ("KIT BALLS QUEEN + 55X35").
    const kitTit = (p as { _kitTitulo?: unknown })._kitTitulo;
    const fam = (typeof kitTit === "string" && kitTit.trim()) ? kitTit.trim() : "";
    // modelo = da família ("Kit Balls" → "Balls") OU derivado do nome do produto
    // (serve pros kits ainda NÃO agrupados: "KIT WAVE KING + 55X35" → "Wave").
    const modelo = (fam ? fam.replace(/^\s*KITS?\s+/i, "").trim() : "") || modeloDoNome(p.nome || "");
    const mMain = (fam && fotoMap.get(normNome(fam))) || fotoMap.get(normNome(p.nome || ""));
    const mAlt = modelo ? fotoMap.get(normNome(modelo)) : undefined;      // herda foto/vídeo/textos do modelo ("Balls"/"Wave")
    p.foto = mMain?.foto || mAlt?.foto || p.foto || placeholder;
    p.video = mMain?.video || mAlt?.video || "";
    p.fotoDescricao = mMain?.fotoDescricao || mAlt?.fotoDescricao || "";
    const bl = (mMain?.blocos && Object.keys(mMain.blocos).length) ? mMain.blocos
      : (mAlt?.blocos && Object.keys(mAlt.blocos).length) ? mAlt.blocos : null;
    if (bl) p.blocos = bl;
  }
  // KIT: só AGORA (depois de casar a foto/vídeo/textos) renomeia o anúncio pra só a
  // família ("Kit Balls"), deixando o título limpo.
  for (const p of prods) {
    const t = (p as { _kitTitulo?: unknown })._kitTitulo;
    if (typeof t === "string" && t.trim()) p.nome = t.trim();
  }

  // EXTRA da dona (nosso banco): vídeo e textos que ela coloca por produto. Vence o
  // catálogo antigo — é a forma de pôr vídeo/texto em quem não tem (ex.: kits).
  try {
    const { results: extras } = await env.DB.prepare("SELECT ref, video, texto FROM loja_produto_extra").all<{ ref: string; video: string | null; texto: string | null }>();
    if (extras && extras.length) {
      const exMap = new Map<string, { video: string | null; texto: string | null }>();
      for (const e of extras) exMap.set(String(e.ref || "").trim(), { video: e.video, texto: e.texto });
      for (const p of prods) {
        const ex = exMap.get(String((p as { id?: unknown }).id || "").trim());
        if (!ex) continue;
        if (ex.video && ex.video.trim()) p.video = ex.video.trim();
        if (ex.texto && ex.texto.trim()) {
          const bl: Record<string, unknown> = (p.blocos && typeof p.blocos === "object") ? { ...p.blocos } : {};
          bl["Detalhes"] = ex.texto.trim();
          p.blocos = bl;
        }
      }
    }
  } catch { /* extra: silencioso */ }

  // Foto do TECIDO por cor: casa pelo NOME da cor com o banco_cores do catálogo atual.
  type CorBase = { nome?: string; foto?: string };
  const corFotoMap = new Map<string, string>();
  for (const c of (Array.isArray(base.banco_cores) ? (base.banco_cores as CorBase[]) : [])) {
    const k = normNome(c.nome || "");
    if (k && c.foto && !corFotoMap.has(k)) corFotoMap.set(k, c.foto);
  }
  for (const c of (Array.isArray(cat.banco_cores) ? (cat.banco_cores as { nome?: string; foto?: string }[]) : [])) {
    const f = corFotoMap.get(normNome(c.nome || ""));
    if (f) c.foto = f;
  }

  // OVERRIDE de imagens da dona (tabela loja_imagem, editada na página "Imagens"):
  //  - foto do PRODUTO (tipo='produto') vence a foto casada do Syntech/Cloudinary;
  //  - foto da COR por MODELO (tipo='cor') — a global é por NOME de cor (igual pra todos),
  //    então aqui gravamos a foto NA PRÓPRIA cor do produto, pra cada modelo ter a sua
  //    (é o que conserta Stanza/Chess). A loja lê a foto da cor do produto, caindo na
  //    global só quando não há override.
  try {
    const { results: imgs } = await env.DB.prepare("SELECT tipo, modelo, cor, foto FROM loja_imagem").all<{ tipo: string; modelo: string; cor: string; foto: string }>();
    const ovProd = new Map<string, string>(), ovCor = new Map<string, string>();
    for (const r of imgs || []) { if (!r.foto) continue; if (r.tipo === "produto") ovProd.set(String(r.modelo), r.foto); else ovCor.set(String(r.modelo) + "|" + String(r.cor), r.foto); }
    const corFotoGlobal = new Map<string, string>();
    for (const c of (Array.isArray(cat.banco_cores) ? (cat.banco_cores as { id?: string; foto?: string }[]) : [])) if (c.id && c.foto) corFotoGlobal.set(String(c.id), c.foto);
    for (const p of prods) {
      const pid = String((p as { id?: unknown }).id || "");
      if (pid && ovProd.has(pid)) p.foto = ovProd.get(pid)!;
      const cores = (p as { cores?: { id_cor: string; foto?: string }[] }).cores;
      if (Array.isArray(cores)) for (const c of cores) {
        c.foto = ovCor.get(pid + "|" + String(c.id_cor)) || corFotoGlobal.get(String(c.id_cor)) || "";
      }
    }
  } catch { /* overrides de imagem: silencioso */ }

  // Estoque REAL por cor/tamanho (espelho do erp_estoque), pra decidir o "sai quando zera"
  // da EL. NÃO usa estoque_geral do cadastro — esse costuma vir 0 mesmo com saldo por cor.
  const estItens = ((cat.estoque as { itens?: Record<string, Record<string, Record<string, number>>> } | undefined)?.itens) || {};
  const temEstoqueReal = (p: Prod): boolean => {
    const gs = (p as { grupos?: { linhas?: { cod?: string }[] }[] }).grupos || [];
    for (const g of gs) for (const l of (g.linhas || [])) {
      const m = estItens[String(l.cod || "")]; if (!m) continue;
      for (const med of Object.keys(m)) for (const cor of Object.keys(m[med])) if ((Number(m[med][cor]) || 0) > 0) return true;
    }
    return false;
  };
  const normais: Prod[] = [], limitada: Prod[] = [];
  for (const p of prods) {
    if (p._edicao_limitada) {
      // Edição Limitada é promoção com estoque controlado: SAI do catálogo quando NÃO há
      // mais saldo REAL (por cor/tamanho). Enquanto tiver saldo, aparece.
      if (temEstoqueReal(p)) limitada.push(p);
    } else normais.push(p);
  }
  // Edição Limitada: SÓ o que tem sigla ED (ED####) E ainda tem estoque. Não herda os
  // produtos do catálogo antigo — monta explícito e esconde se vazio.
  const edicaoLimitada = {
    produtos: limitada,
    oculta: limitada.length === 0,
    abertura: (baseEL as { abertura?: unknown }).abertura ?? null,
    ordenar_por: (baseEL as { ordenar_por?: unknown }).ordenar_por ?? null,
    categorias: [],
  };
  return {
    ...base, // mantém TODO o layout/config do site
    produtos: normais,
    edicao_limitada: edicaoLimitada,
    estoque_el: {}, // estoque da EL antiga não se aplica
    banco_cores: cat.banco_cores,
    banco_tamanhos: cat.banco_tamanhos,
    estoque: cat.estoque,
    atualizado_em: Date.now(),
    _origem_erp: true,
    _resumo: {
      ...cat._resumo,
      normais: normais.length,
      edicao_limitada: limitada.length,
      produtos_com_foto: prods.filter((p) => p.foto && (!placeholder || p.foto !== placeholder)).length,
    },
  };
}

// Prévia (JSON) do catálogo gerado do ERP no formato do site. Não grava no site.
integracao.get("/catalogo-site", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  return c.json(await gerarCatalogoSite(c.env));
});

// Lista os produtos do catálogo (id, nome, se já tem vídeo) + o EXTRA salvo pela dona,
// pra tela "Vídeos e textos" do admin escolher e editar.
integracao.get("/catalogo-produtos", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const doc = await gerarDocSite(c.env);
  const normais = Array.isArray(doc.produtos) ? (doc.produtos as Record<string, unknown>[]) : [];
  const elDoc = doc.edicao_limitada as { produtos?: unknown[] } | undefined;
  const limitada = elDoc && Array.isArray(elDoc.produtos) ? (elDoc.produtos as Record<string, unknown>[]) : [];
  const todos = [...normais, ...limitada];
  const { results: ex } = await c.env.DB.prepare("SELECT ref, video, texto FROM loja_produto_extra").all<{ ref: string; video: string | null; texto: string | null }>().catch(() => ({ results: [] as { ref: string; video: string | null; texto: string | null }[] }));
  const exMap = new Map(ex.map((e) => [String(e.ref || "").trim(), e]));
  const lista = todos.map((p) => {
    const id = String(p.id || "");
    const e = exMap.get(id.trim());
    return {
      id, nome: String(p.nome || ""), pronta_entrega: !!p.pronta_entrega, kit: !!p._kit,
      tem_video: !!(p.video && String(p.video).trim()),
      extra_video: e?.video || "", extra_texto: e?.texto || "",
    };
  }).filter((p) => p.id);
  return c.json(lista);
});

// Salva (ou apaga) o vídeo/texto EXTRA de um produto do catálogo.
integracao.post("/produto-extra", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ id?: string; video?: string; texto?: string }>().catch(() => ({} as { id?: string; video?: string; texto?: string }));
  const id = String(b.id || "").trim();
  if (!id) return c.json({ error: "sem_id" }, 400);
  const video = String(b.video || "").trim() || null;
  const texto = String(b.texto || "").trim() || null;
  if (!video && !texto) {
    await c.env.DB.prepare("DELETE FROM loja_produto_extra WHERE ref=?").bind(id).run();
    return c.json({ ok: true, removido: true });
  }
  await c.env.DB.prepare(
    "INSERT INTO loja_produto_extra (ref, video, texto, atualizado_em) VALUES (?,?,?,datetime('now')) ON CONFLICT(ref) DO UPDATE SET video=excluded.video, texto=excluded.texto, atualizado_em=datetime('now')"
  ).bind(id, video, texto).run();
  return c.json({ ok: true });
});

// ── BANNERS da loja (cadastrados pela dona) ──────────────────────────────────
// Lê/grava a lista de banners (config loja_banners). Cada banner:
//   { id, img, kicker, titulo, sub, botao_texto, botao_link, ativo, ordem }
integracao.get("/loja-banners", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const raw = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='loja_banners'").first<{ valor: string | null }>();
  let banners: unknown[] = [];
  try { const a = raw?.valor ? JSON.parse(raw.valor) : []; if (Array.isArray(a)) banners = a; } catch { banners = []; }
  const ir = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='loja_banner_intervalo'").first<{ valor: string | null }>();
  const intervalo = Math.max(2, Math.min(30, Number(ir?.valor) || 5));
  return c.json({ banners, intervalo });
});
integracao.post("/loja-banners", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ banners?: unknown[]; intervalo?: number }>().catch(() => ({} as { banners?: unknown[]; intervalo?: number }));
  const lista = Array.isArray(b.banners) ? b.banners.slice(0, 30) : [];
  const intervalo = Math.max(2, Math.min(30, Number(b.intervalo) || 5));
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('loja_banners', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(JSON.stringify(lista)),
    c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('loja_banner_intervalo', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(String(intervalo)),
  ]);
  return c.json({ ok: true, n: lista.length });
});
// Upload da imagem do banner → R2 → devolve a URL pública nossa.
integracao.post("/banner-upload", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") return c.json({ error: "arquivo é obrigatório" }, 400);
  const file = entry as Blob & { name?: string };
  if (file.size === 0) return c.json({ error: "arquivo vazio" }, 400);
  if (file.size > 12 * 1024 * 1024) return c.json({ error: "imagem muito grande (máx. 12MB)" }, 400);
  const ct = file.type || "image/jpeg";
  if (!ct.startsWith("image/")) return c.json({ error: "envie uma imagem (jpg/png/webp)" }, 400);
  const ext = (String(file.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const nome = `banner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try { await c.env.BUCKET.put(`loja/${nome}`, await file.arrayBuffer(), { httpMetadata: { contentType: ct } }); }
  catch (e) { return c.json({ error: "não consegui salvar (" + String((e as Error)?.message || e).slice(0, 100) + ")" }, 500); }
  return c.json({ ok: true, url: `${new URL(c.req.url).origin}/api/integracao/loja-arquivo/${nome}` });
});
// Serve a imagem do banner (do R2).
integracao.get("/loja-arquivo/:nome", async (c) => {
  const nome = c.req.param("nome").replace(/[^a-zA-Z0-9._-]/g, "");
  const obj = await c.env.BUCKET.get(`loja/${nome}`);
  if (!obj) return c.text("não encontrado", 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers: h });
});

// ── IMAGENS da loja (fotos de cor por modelo + foto do produto) ──────────────
// Página "Imagens": a dona sobe/troca as fotos. Guarda em loja_imagem e serve do R2.
// Upload da imagem → R2 → devolve a URL nossa (mesmo esquema do banner).
integracao.post("/loja-imagem-upload", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") return c.json({ error: "arquivo é obrigatório" }, 400);
  const file = entry as Blob & { name?: string };
  if (file.size === 0) return c.json({ error: "arquivo vazio" }, 400);
  if (file.size > 12 * 1024 * 1024) return c.json({ error: "imagem muito grande (máx. 12MB)" }, 400);
  const ct = file.type || "image/jpeg";
  if (!ct.startsWith("image/")) return c.json({ error: "envie uma imagem (jpg/png/webp)" }, 400);
  const ext = (String(file.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const nome = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try { await c.env.BUCKET.put(`loja/${nome}`, await file.arrayBuffer(), { httpMetadata: { contentType: ct } }); }
  catch (e) { return c.json({ error: "não consegui salvar (" + String((e as Error)?.message || e).slice(0, 100) + ")" }, 500); }
  return c.json({ ok: true, url: `${new URL(c.req.url).origin}/api/integracao/loja-arquivo/${nome}` });
});
// Lista os produtos do catálogo (com as cores) e a foto ATUAL de cada um — já com os
// overrides aplicados — pra a dona ver e trocar. Inclui a Edição Limitada.
integracao.get("/loja-imagens", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const doc = await gerarDocSite(c.env);
  type Cor = { id_cor?: string; foto?: string };
  type P = { id?: string; nome?: string; foto?: string; cores?: Cor[]; pronta_entrega?: boolean; linha?: string };
  const banco = Array.isArray((doc as { banco_cores?: unknown }).banco_cores) ? (doc as { banco_cores: { id?: string; nome?: string; hex?: string }[] }).banco_cores : [];
  const corInfo = new Map<string, { nome: string; hex: string }>();
  for (const c2 of banco) corInfo.set(String(c2.id || ""), { nome: String(c2.nome || ""), hex: String(c2.hex || "") });
  const normais = Array.isArray((doc as { produtos?: unknown }).produtos) ? (doc as { produtos: P[] }).produtos : [];
  const elDoc = (doc as { edicao_limitada?: { produtos?: P[] } }).edicao_limitada;
  const el = elDoc && Array.isArray(elDoc.produtos) ? elDoc.produtos : [];
  // Mesma divisão de categorias que o catálogo da loja usa (SECOES em loja.html).
  const catOf = (p: P): string =>
    p.pronta_entrega ? "Pronta Entrega"
      : p.linha === "polisoft" ? "Linha Polisoft"
        : p.linha === "soft" ? "Linha Soft"
          : p.linha === "natal" ? "Natal"
            : "Outros";
  const monta = (p: P, categoria: string) => ({
    id: String(p.id || ""), nome: String(p.nome || ""), foto: String(p.foto || ""), categoria,
    cores: (Array.isArray(p.cores) ? p.cores : []).map((c2) => { const ci = corInfo.get(String(c2.id_cor || "")) || { nome: "", hex: "" }; return { id_cor: String(c2.id_cor || ""), nome: ci.nome, hex: ci.hex, foto: String(c2.foto || "") }; }),
  });
  const produtos = [...normais.map((p) => monta(p, catOf(p))), ...el.map((p) => monta(p, "Edição Limitada"))];
  return c.json({ produtos });
});
// Salva (ou remove, se foto vazia) a foto de um produto (tipo=produto) ou de uma cor de
// um modelo (tipo=cor). Chave: (tipo, modelo, cor).
integracao.post("/loja-imagem", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ tipo?: string; modelo?: string; cor?: string; foto?: string }>().catch(() => ({} as { tipo?: string; modelo?: string; cor?: string; foto?: string }));
  const tipo = b.tipo === "cor" ? "cor" : "produto";
  const modelo = String(b.modelo || "").trim();
  const cor = tipo === "cor" ? String(b.cor || "").trim() : "";
  const foto = String(b.foto || "").trim();
  if (!modelo) return c.json({ error: "modelo é obrigatório" }, 400);
  if (tipo === "cor" && !cor) return c.json({ error: "cor é obrigatória" }, 400);
  if (!foto) {
    await c.env.DB.prepare("DELETE FROM loja_imagem WHERE tipo=? AND modelo=? AND cor=?").bind(tipo, modelo, cor).run();
    return c.json({ ok: true, removido: true });
  }
  await c.env.DB.prepare("INSERT INTO loja_imagem (tipo, modelo, cor, foto, atualizado_em) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(tipo,modelo,cor) DO UPDATE SET foto=excluded.foto, atualizado_em=datetime('now')").bind(tipo, modelo, cor, foto).run();
  return c.json({ ok: true });
});
// DIAGNÓSTICO (aberto, só leitura): por que a Edição Limitada não aparece? Mostra os
// produtos candidatos (sigla ED na ref OU grupo com "limit"/"edic"), com grupo, se tem
// ED, estoque_geral do cadastro e o estoque REAL (soma do erp_estoque por ref).
integracao.get("/diag-el", async (c) => {
  const { results: prods } = await c.env.DB.prepare("SELECT ref, nome, grupo, estoque_geral FROM erp_produtos").all<{ ref: string | null; nome: string | null; grupo: string | null; estoque_geral: number | null }>().catch(() => ({ results: [] as { ref: string | null; nome: string | null; grupo: string | null; estoque_geral: number | null }[] }));
  const { results: est } = await c.env.DB.prepare("SELECT ref, SUM(saldo) AS s FROM erp_estoque GROUP BY ref").all<{ ref: string | null; s: number | null }>().catch(() => ({ results: [] as { ref: string | null; s: number | null }[] }));
  const estByRef = new Map<string, number>();
  for (const e of est || []) estByRef.set(String(e.ref || "").trim(), Number(e.s) || 0);
  const grupos = new Map<string, number>();
  const amostra: { ref: string; nome: string; grupo: string; isED: boolean; estoque_geral: number; estoque_real: number }[] = [];
  for (const p of prods || []) {
    const ref = String(p.ref || "").trim(); const grupo = String(p.grupo || "");
    const gl = grupo.toLowerCase();
    const isED = /^ED\d/i.test(ref);
    if (!(isED || gl.includes("limit") || gl.includes("edic"))) continue;
    grupos.set(grupo, (grupos.get(grupo) || 0) + 1);
    if (amostra.length < 80) amostra.push({ ref, nome: String(p.nome || ""), grupo, isED, estoque_geral: Number(p.estoque_geral) || 0, estoque_real: estByRef.get(ref) || 0 });
  }
  return c.json({ candidatos: amostra.length, grupos: [...grupos.entries()].map(([g, n]) => ({ grupo: g, n })), amostra });
});

// ── LOJA B2B (catálogo NOVO, feito do zero) ──────────────────────────────────
// Página própria (site/loja.html), 100% dos dados do Syntech: produtos, preços
// por tamanho, estoque, cores, seções. As fotos vêm casadas do Cloudinary (o
// Syntech guarda foto no servidor interno, que o cliente não acessa pela net).
// Aberta por enquanto (prévia). Login/carrinho/pedido vêm nas próximas fases.
// Monta o HTML da loja com os dados injetados. repPortal=true marca a página como
// "portal do representante" (usado no subdomínio vendas.* pra abrir o login do rep
// direto na raiz, sem ?rep=1 na URL). Lança erro se não conseguir montar os dados.
export async function construirLojaHtml(env: Env, repPortal = false): Promise<string> {
  let dados: { produtos: unknown[]; banco_cores: unknown; banco_tamanhos: unknown; estoque: unknown; banners?: unknown[]; banner_intervalo?: number; whatsapp?: string };
  {
    const doc = await gerarDocSite(env);
    const normais = Array.isArray(doc.produtos) ? (doc.produtos as unknown[]) : [];
    const elDoc = doc.edicao_limitada as { produtos?: unknown[] } | undefined;
    const limitada = elDoc && Array.isArray(elDoc.produtos) ? elDoc.produtos : [];
    // Banners cadastrados pela dona (config loja_banners). Só os ATIVOS, por ordem.
    let banners: unknown[] = [];
    try {
      const raw = await env.DB.prepare("SELECT valor FROM config WHERE chave='loja_banners'").first<{ valor: string | null }>();
      const arr = raw?.valor ? JSON.parse(raw.valor) : [];
      // "agora" em horário de Brasília no formato YYYY-MM-DDTHH:mm (compara com as datas do agendamento).
      const agora = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
      if (Array.isArray(arr)) banners = arr.filter((b) => {
        if (!b || (b as { ativo?: unknown }).ativo === false) return false;        // inativo nunca aparece
        const ini = String((b as { inicio?: unknown }).inicio || "").trim();
        const fim = String((b as { fim?: unknown }).fim || "").trim();
        if (ini && agora < ini) return false;   // ainda não começou
        if (fim && agora > fim) return false;    // já terminou
        return true;
      }).sort((a, b) => (Number((a as { ordem?: number }).ordem) || 0) - (Number((b as { ordem?: number }).ordem) || 0));
    } catch { banners = []; }
    let banner_intervalo = 5;
    try { const ir = await env.DB.prepare("SELECT valor FROM config WHERE chave='loja_banner_intervalo'").first<{ valor: string | null }>(); banner_intervalo = Math.max(2, Math.min(30, Number(ir?.valor) || 5)); } catch { banner_intervalo = 5; }
    // Número do WhatsApp da Big (pro botão flutuante da loja). Usa loja_whatsapp se
    // existir, senão o numero_whatsapp do atendimento. Só dígitos.
    let whatsapp = "";
    try {
      const w = await env.DB.prepare("SELECT valor FROM config WHERE chave IN ('loja_whatsapp','numero_whatsapp') ORDER BY CASE chave WHEN 'loja_whatsapp' THEN 0 ELSE 1 END LIMIT 1").first<{ valor: string | null }>();
      whatsapp = String(w?.valor || "").replace(/\D+/g, "");
    } catch { whatsapp = ""; }
    dados = { produtos: [...normais, ...limitada], banco_cores: doc.banco_cores, banco_tamanhos: doc.banco_tamanhos, estoque: doc.estoque, banners, banner_intervalo, whatsapp };
  }
  const json = JSON.stringify(dados).split("<").join("\\u003c").split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
  let inject = `<script>window.__DADOS__=${json};</script>`;
  if (repPortal) inject = `<script>window.__REP_PORTAL__=true;</script>` + inject;
  return SITE_LOJA_HTML.includes("</head>") ? SITE_LOJA_HTML.replace("</head>", inject + "</head>") : inject + SITE_LOJA_HTML;
}

integracao.get("/loja", async (c) => {
  try {
    const html = await construirLojaHtml(c.env);
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response("Não consegui montar a loja:\n\n" + (e as Error).message, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 4 — Pedido da loja B2B → Syntech (via ponte + procedures APP_*)
// ════════════════════════════════════════════════════════════════════════════
const tokenOk = (c: { env: Env; req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  return !!esperado && recebido === esperado;
};
const lerCfg = async (env: Env, k: string) => ((await env.DB.prepare("SELECT valor FROM config WHERE chave=?").bind(k).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
// Modo de envio da loja → ERP: 'off' (nada), 'teste' (só os liberados), 'on' (todos).
const modoEnvioLoja = async (env: Env) => { const m = await lerCfg(env, "loja_erp_envio"); return m === "on" || m === "off" ? m : "teste"; };

// Desmembra KITS em PEÇAS (o Syntech não explode pela integração). Usado no envio pro
// Syntech E na tela "Ver itens", pra os dois mostrarem/enviarem a mesma coisa.
type ItemLoja = { ref: string; produto: string | null; cor_grade: string | null; cod_cor: number | null; tamanho?: string | null; erp_tamanho: string | null; qtd: number; valor_unit: number | null };
async function desmembrarKits(env: Env, itensRaw: ItemLoja[]): Promise<ItemLoja[]> {
  const out: ItemLoja[] = [];
  for (const it of itensRaw) {
    const { results: rec } = await env.DB.prepare(
      "SELECT componente_ref, quantidade, tamanho FROM erp_kit_receita WHERE kit_ref = ?"
    ).bind(it.ref).all<{ componente_ref: string; quantidade: number; tamanho: string | null }>().catch(() => ({ results: [] as { componente_ref: string; quantidade: number; tamanho: string | null }[] }));
    if (rec && rec.length) {
      const refs = [...new Set(rec.map((r) => r.componente_ref))];
      const ph = refs.map(() => "?").join(",");
      const { results: comps } = await env.DB.prepare(
        `SELECT ref, nome, preco_atacado, preco_varejo, tamanhos FROM erp_produtos WHERE ref IN (${ph})`
      ).bind(...refs).all<{ ref: string; nome: string | null; preco_atacado: number | null; preco_varejo: number | null; tamanhos: string | null }>().catch(() => ({ results: [] as { ref: string; nome: string | null; preco_atacado: number | null; preco_varejo: number | null; tamanhos: string | null }[] }));
      const cmap = new Map(comps.map((cp) => [cp.ref, cp]));
      const nrm = (s: unknown) => String(s ?? "").trim().toLowerCase();
      // Preço REAL da peça. A Big Tricot usa "Preços Diferenciados": o preço fica POR
      // TAMANHO (ex.: capa 4K = R$58, peseira 1K = R$146), não no cabeçalho do produto
      // (que costuma vir 0). Então procura o preço no tamanho da receita (4K/1K); só
      // se não achar é que cai no preço de cabeçalho.
      const precoLinha = (ref: string, tam: string | null): number => {
        const cp = cmap.get(ref);
        if (!cp) return 0;
        try {
          const arr = cp.tamanhos ? JSON.parse(cp.tamanhos) : [];
          if (Array.isArray(arr) && arr.length) {
            const alvo = nrm(tam);
            const t = (alvo && arr.find((x: { tamanho?: string; medida?: string }) => nrm(x.tamanho) === alvo || nrm(x.medida) === alvo)) || arr[0];
            const pt = Number(t?.atacado || t?.varejo || 0);
            if (pt > 0) return pt;
          }
        } catch { /* usa cabeçalho */ }
        return Number(cp.preco_atacado || cp.preco_varejo || 0);
      };
      let somaPrecos = 0; for (const r of rec) somaPrecos += precoLinha(r.componente_ref, r.tamanho) * (Number(r.quantidade) || 1);
      const usarPreco = somaPrecos > 0;
      const baseDe = (r: { componente_ref: string; tamanho: string | null }) => (usarPreco ? precoLinha(r.componente_ref, r.tamanho) : 1);
      let somaBase = 0; for (const r of rec) somaBase += baseDe(r) * (Number(r.quantidade) || 1);
      const fator = somaBase > 0 ? (Number(it.valor_unit) || 0) / somaBase : 0;
      for (const r of rec) {
        const cp = cmap.get(r.componente_ref);
        const tcod = (String(r.tamanho || "").trim() || "UN").slice(0, 10);
        out.push({
          ref: r.componente_ref, produto: cp?.nome || r.componente_ref, cor_grade: it.cor_grade, cod_cor: it.cod_cor,
          tamanho: tcod, erp_tamanho: tcod, qtd: (Number(r.quantidade) || 1) * (Number(it.qtd) || 0),
          valor_unit: Math.round(baseDe(r) * fator * 100) / 100,
        });
      }
    } else {
      let t = String(it.erp_tamanho || "").trim();
      if (t.length > 6) {
        try {
          const row = await env.DB.prepare("SELECT tamanhos FROM erp_produtos WHERE ref=?").bind(it.ref).first<{ tamanhos: string | null }>();
          const arr = row?.tamanhos ? JSON.parse(row.tamanhos) : [];
          const t0 = Array.isArray(arr) && arr[0] ? arr[0] : null;
          if (t0) t = String(t0.tamanho || t0.medida || t).trim();
        } catch { /* mantém */ }
        t = t.slice(0, 10);
      }
      out.push({ ...it, erp_tamanho: t });
    }
  }
  // CONSOLIDA peças iguais (mesma ref + tamanho + cor) numa linha só. O Syntech recusa
  // a MESMA cor repetida na mesma linha do pedido (trigger BI_CORES_PEDIDO → "JA_EXISTE"),
  // o que acontece quando o pedido tem a mesma peça/cor vinda de kits diferentes (ex.:
  // capa da mesma cor no kit Queen e no King). Soma a quantidade e faz a média ponderada
  // do preço (mantém o total do pedido).
  const mapc = new Map<string, ItemLoja & { _tot: number }>();
  for (const it of out) {
    const key = `${it.ref}|${(it.erp_tamanho || "").trim()}|${it.cod_cor ?? ""}`;
    const q = Number(it.qtd) || 0;
    const v = Number(it.valor_unit) || 0;
    const ex = mapc.get(key);
    if (ex) { ex.qtd += q; ex._tot += q * v; }
    else mapc.set(key, { ...it, qtd: q, _tot: q * v });
  }
  const consol: ItemLoja[] = [];
  for (const g of mapc.values()) {
    const tot = g._tot, qt = g.qtd;
    const item: ItemLoja = { ref: g.ref, produto: g.produto, cor_grade: g.cor_grade, cod_cor: g.cod_cor, tamanho: g.tamanho, erp_tamanho: g.erp_tamanho, qtd: qt, valor_unit: qt > 0 ? Math.round((tot / qt) * 100) / 100 : g.valor_unit };
    consol.push(item);
  }
  return consol;
}
// A PONTE busca aqui os pedidos de loja prontos pra gravar no Syntech (auth token).
integracao.get("/pedidos-para-erp", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const modo = await modoEnvioLoja(c.env);
  if (modo === "off") return c.json({ modo, pedidos: [] });
  // Pedido de REPRESENTANTE (tem vendedor) SEMPRE espera a aprovação da Big — mesmo no modo "on".
  // Pedido de cliente direto segue o modo (on = envia automático; teste = só liberados).
  const filtroLiberado = modo === "on"
    ? " AND (COALESCE(p.vendedor,'') = '' OR COALESCE(p.erp_liberado,0) = 1)"
    : " AND COALESCE(p.erp_liberado,0) = 1";
  const { results: peds } = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.valor_total, p.data_pedido, cl.codigo_erp AS cod_cli
       FROM pedidos p LEFT JOIN clientes cl ON cl.id = p.cliente_id
      WHERE p.canal='loja_b2b' AND COALESCE(p.erp_sync_status,'pendente')='pendente'${filtroLiberado}
      ORDER BY p.created_at LIMIT 20`
  ).all<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; valor_total: number | null; data_pedido: string | null; cod_cli: string | null }>();
  const pedidos = [];
  for (const p of peds) {
    const { results: itensRaw } = await c.env.DB.prepare(
      "SELECT ref, erp_tamanho, cod_cor, qtd, valor_unit, produto, cor_grade FROM pedido_itens WHERE pedido_id = ? ORDER BY rowid"
    ).bind(p.id).all<ItemLoja>();
    const itens = await desmembrarKits(c.env, itensRaw);   // kit vira as peças aqui
    pedidos.push({ id: p.id, cliente_nome: p.cliente_nome, cnpj: p.cliente_cnpj, cod_cli: p.cod_cli, valor_total: p.valor_total, data: p.data_pedido, itens });
  }
  return c.json({ modo, pedidos });
});

// A PONTE confirma que gravou no ERP (auth token): guarda o NUMERO do Syntech e,
// se descobriu o COD_CLI pelo CNPJ, guarda no cliente (cache pros próximos).
integracao.post("/pedido-erp-gravado", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; numero_erp?: number | string; cod_cli?: number | string };
  const id = String(b.id || "").trim();
  const numero = Math.trunc(Number(b.numero_erp) || 0);
  if (!id || !numero) return c.json({ error: "faltam_dados" }, 400);
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='enviado', erp_numero=?, erp_sync_em=datetime('now'), erp_sync_erro=NULL WHERE id=? AND canal='loja_b2b'").bind(numero, id),
  ];
  const cod = String(b.cod_cli || "").trim();
  if (cod) stmts.push(c.env.DB.prepare("UPDATE clientes SET codigo_erp=? WHERE id=(SELECT cliente_id FROM pedidos WHERE id=?) AND COALESCE(codigo_erp,'')=''").bind(cod, id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// A PONTE avisa que deu erro ao gravar (auth token): marca o pedido como 'erro'.
integracao.post("/pedido-erp-erro", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; erro?: string };
  const id = String(b.id || "").trim();
  if (!id) return c.json({ error: "faltam_dados" }, 400);
  await c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='erro', erp_sync_erro=?, erp_sync_em=datetime('now') WHERE id=? AND canal='loja_b2b'")
    .bind(String(b.erro || "erro desconhecido").slice(0, 500), id).run();
  return c.json({ ok: true });
});

// ── Fase S: CLIENTES da loja pra ponte criar no Syntech ─────────────────────────
// A ponte busca os cadastros APROVADOS que o gestor liberou (loja_criar_erp=1) e que
// ainda não têm código no Syntech. Devolve tudo que o APP_CLIENTES_INSERT_V2 pede.
integracao.get("/clientes-para-erp", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  // Trava de segurança: só cria cliente no Syntech quando o gestor ligou o automático.
  const flag = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='loja_criar_clientes'").first<{ valor: string | null }>();
  if (String(flag?.valor || "") !== "1") return c.json({ clientes: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT id, nome, fantasia, cnpj, inscricao_estadual, endereco, numero, complemento, bairro, cep,
            cidade, uf, email, nascimento, telefone, whatsapp, simples_nacional, loja_cod_prazo
       FROM clientes
      WHERE COALESCE(loja_criar_erp,0)=1 AND COALESCE(loja_status,'')='aprovado' AND COALESCE(codigo_erp,'')=''
      ORDER BY loja_cadastro_em LIMIT 10`
  ).all();
  return c.json({ clientes: results });
});

// A ponte confirma que criou o cliente no Syntech: guarda o CODIGO e fecha o pedido de criação.
integracao.post("/cliente-erp-gravado", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; codigo_erp?: number | string };
  const id = String(b.id || "").trim();
  const cod = String(b.codigo_erp || "").trim();
  if (!id || !cod) return c.json({ error: "faltam_dados" }, 400);
  await c.env.DB.prepare(
    "UPDATE clientes SET codigo_erp=?, loja_criar_erp=0, loja_erp_erro=NULL WHERE id=?"
  ).bind(cod, id).run();
  return c.json({ ok: true });
});

// A ponte avisa que deu erro ao criar o cliente (guarda o motivo pra aparecer na fila).
integracao.post("/cliente-erp-erro", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { id?: string; erro?: string };
  const id = String(b.id || "").trim();
  if (!id) return c.json({ error: "faltam_dados" }, 400);
  await c.env.DB.prepare("UPDATE clientes SET loja_erp_erro=? WHERE id=?")
    .bind(String(b.erro || "erro desconhecido").slice(0, 500), id).run();
  return c.json({ ok: true });
});

// A ponte espelha a tabela PRAZO do Syntech (formas de pagamento) pro nosso D1.
integracao.post("/prazos", async (c) => {
  if (!tokenOk(c)) return c.json({ error: "nao_autorizado" }, 401);
  const b = await c.req.json().catch(() => ({})) as { prazos?: { codigo?: unknown; descricao?: unknown }[] };
  const lista = Array.isArray(b.prazos) ? b.prazos : [];
  if (!lista.length) return c.json({ ok: true, gravados: 0 });
  const stmts: D1PreparedStatement[] = [];
  for (const p of lista) {
    const cod = String(p.codigo ?? "").trim();
    if (!cod) continue;
    stmts.push(c.env.DB.prepare(
      "INSERT INTO erp_prazos (codigo, descricao, atualizado_em) VALUES (?, ?, datetime('now')) " +
      "ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao, atualizado_em=datetime('now')"
    ).bind(cod, String(p.descricao ?? "").trim() || null));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true, gravados: stmts.length });
});

// ── ADMIN (gestor): tela "Pedidos da Loja" ──────────────────────────────────
integracao.get("/loja-pedidos", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const modo = await modoEnvioLoja(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.valor_total, p.data_pedido, p.created_at,
            COALESCE(p.erp_sync_status,'pendente') AS erp_sync_status, COALESCE(p.erp_liberado,0) AS erp_liberado,
            p.erp_numero, p.erp_sync_erro,
            (SELECT COUNT(*) FROM pedido_itens WHERE pedido_id=p.id) AS itens,
            (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens WHERE pedido_id=p.id) AS pecas
       FROM pedidos p WHERE p.canal='loja_b2b' AND COALESCE(p.erp_sync_status,'')!='rascunho'
       ORDER BY p.created_at DESC LIMIT 200`
  ).all();
  return c.json({ modo, pedidos: results });
});
integracao.get("/loja-pedidos/:id", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare(
    `SELECT id, cliente_nome, cliente_cnpj, valor_total, data_pedido, created_at,
            COALESCE(erp_sync_status,'pendente') AS erp_sync_status, COALESCE(erp_liberado,0) AS erp_liberado, erp_numero, erp_sync_erro
       FROM pedidos WHERE id=? AND canal='loja_b2b'`
  ).bind(id).first();
  if (!ped) return c.json({ error: "nao_encontrado" }, 404);
  const { results: itensRaw } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id=? ORDER BY rowid"
  ).bind(id).all<ItemLoja>();
  // Mostra o KIT já desmembrado nas peças — igual ao que vai pro Syntech.
  const itens = await desmembrarKits(c.env, itensRaw);
  return c.json({ pedido: ped, itens });
});
integracao.post("/loja-pedidos/:id/liberar", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE pedidos SET erp_liberado=1 WHERE id=? AND canal='loja_b2b' AND COALESCE(erp_sync_status,'pendente')='pendente'").bind(id).run();
  return c.json({ ok: true });
});
integracao.post("/loja-pedidos/:id/reenviar", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const b = await c.req.json<{ forcar?: boolean }>().catch(() => ({} as { forcar?: boolean }));
  if (b.forcar) {
    // FORÇADO: reenvia um pedido marcado como ENVIADO (a ponte confirmou, mas o Syntech
    // não persistiu). Limpa o número antigo pra ganhar um novo. CUIDADO: só usar quando
    // confirmado que o pedido NÃO está no Syntech — senão duplica.
    await c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='pendente', erp_liberado=1, erp_numero=NULL, erp_sync_erro=NULL WHERE id=? AND canal='loja_b2b' AND erp_sync_status IN ('enviado','erro')").bind(id).run();
  } else {
    // volta pra 'pendente' (com liberado) pra ponte tentar de novo — só se deu erro.
    await c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='pendente', erp_liberado=1, erp_sync_erro=NULL WHERE id=? AND canal='loja_b2b' AND erp_sync_status='erro'").bind(id).run();
  }
  return c.json({ ok: true });
});
// Excluir UM pedido da loja (limpeza de testes). Apaga do NOSSO sistema — NÃO apaga do
// Syntech (lá, se já entrou como orçamento, exclua por lá).
integracao.delete("/loja-pedidos/:id", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(id), // solta a reserva de estoque
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=? AND (SELECT canal FROM pedidos WHERE id=?)='loja_b2b'").bind(id, id),
    c.env.DB.prepare("DELETE FROM pedidos WHERE id=? AND canal='loja_b2b'").bind(id),
  ]);
  return c.json({ ok: true });
});
// Excluir TODOS os pedidos da loja (limpeza geral de testes).
integracao.post("/loja-pedidos/limpar-todos", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id IN (SELECT id FROM pedidos WHERE canal='loja_b2b')"),
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE canal='loja_b2b')"),
    c.env.DB.prepare("DELETE FROM pedidos WHERE canal='loja_b2b'"),
  ]);
  return c.json({ ok: true });
});
integracao.post("/loja-config", async (c) => {
  const g = await exigirFuncao(c, "relatorios"); if ("erro" in g) return g.erro;
  const b = await c.req.json().catch(() => ({})) as { modo?: string };
  const modo = b.modo === "on" || b.modo === "off" || b.modo === "teste" ? b.modo : null;
  if (!modo) return c.json({ error: "modo_invalido" }, 400);
  await c.env.DB.prepare("INSERT INTO config (chave, valor, atualizado_em) VALUES ('loja_erp_envio', ?, datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')").bind(modo).run();
  return c.json({ ok: true, modo });
});

// TESTE DE CONEXÃO com o Firebase do site. Lê catalogo/main e devolve os campos
// do topo (sem expor conteúdo sensível) — serve pra validar a chave FIREBASE_SA.
integracao.get("/site/firebase-check", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  try {
    const main = await lerDocumento(c.env, "catalogo/main");
    if (!main) return c.json({ ok: true, existe_main: false });
    const prods = Array.isArray((main as { produtos?: unknown[] }).produtos) ? (main as { produtos: unknown[] }).produtos.length : 0;
    return c.json({ ok: true, existe_main: true, campos: Object.keys(main), produtos_no_main: prods });
  } catch (e) {
    return c.json({ ok: false, erro: (e as Error).message }, 200);
  }
});

// INSPECIONA a estrutura do catálogo real do site (catalogo/main) — só leitura.
// Mostra os campos do topo, nº de produtos (inclusive edição limitada) e uma
// amostra com os códigos/preços por tamanho (cod, id_tamanho, sul, norte). Serve
// pra eu entender como casar os preços do ERP sem mudar o layout. Token ou sessão.
integracao.get("/site/inspecionar", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || c.req.query("token") || "").trim();
  if (!(esperado && recebido === esperado)) { const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro; }
  const alvo = c.req.query("alvo") === "teste" ? "teste" : "main";
  try {
    const doc = (await lerDocumento(c.env, "catalogo/" + alvo)) as Record<string, unknown> | null;
    if (!doc) return c.json({ existe: false, alvo });
    type Linha = { cod?: unknown; id_tamanho?: unknown; sul?: unknown; norte?: unknown };
    type Grupo = { titulo?: unknown; linhas?: Linha[] };
    type Prod = { id?: unknown; nome?: unknown; linha?: unknown; pronta_entrega?: unknown; grupos?: Grupo[] };
    const prods = Array.isArray(doc.produtos) ? (doc.produtos as Prod[]) : [];
    const elRaw = doc.edicao_limitada as { produtos?: unknown } | undefined;
    const el = elRaw && Array.isArray(elRaw.produtos) ? (elRaw.produtos as Prod[]) : [];
    const amostraProd = (p: Prod) => ({
      id: p?.id, nome: p?.nome, linha: p?.linha, pronta_entrega: p?.pronta_entrega,
      grupos: Array.isArray(p?.grupos) ? p.grupos.map((g) => ({
        titulo: g?.titulo,
        linhas: Array.isArray(g?.linhas) ? g.linhas.slice(0, 3).map((l) => ({ cod: l?.cod, id_tamanho: l?.id_tamanho, sul: l?.sul, norte: l?.norte })) : [],
      })) : [],
    });
    return c.json({
      existe: true, alvo, _origem_erp: doc._origem_erp === true,
      campos_topo: Object.keys(doc),
      total_produtos: prods.length,
      total_edicao_limitada: el.length,
      amostra_produtos: prods.slice(0, 3).map(amostraProd),
      amostra_edicao_limitada: el.slice(0, 2).map(amostraProd),
      banco_tamanhos: Array.isArray(doc.banco_tamanhos) ? (doc.banco_tamanhos as unknown[]).slice(0, 12) : null,
    });
  } catch (e) { return c.json({ erro: (e as Error).message }, 200); }
});

// PUBLICA o catálogo do ERP no Firebase do site. alvo=teste (padrão, cliente não
// vê) ou alvo=main (vai pro ar). Lê o catalogo/main atual pra preservar os campos
// editoriais (capa, representantes, textos…) e só troca produtos/cores/tamanhos.
integracao.post("/site/publicar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const alvo = c.req.query("alvo") === "main" ? "main" : "teste";
  try {
    const doc = await gerarDocSite(c.env);
    await gravarDocumento(c.env, "catalogo/" + alvo, doc);
    return c.json({ ok: true, alvo, resumo: doc._resumo });
  } catch (e) {
    return c.json({ ok: false, alvo, erro: (e as Error).message }, 200);
  }
});

// PRÉVIA no LAYOUT COMPLETO do site (index.html, com "Montar pedido"). O servidor
// lê a ÁREA DE TESTE (catalogo/teste) pela chave de serviço e injeta na página
// (window.__PREVIEW_DATA__) — não depende das regras do Firebase nem toca no site
// no ar. Entra em modo visualização, sem login. Abra sem precisar de senha.
integracao.get("/site-teste", async (c) => {
  // Catálogo montado AO VIVO 100% do ERP (não lê o catálogo antigo de produtos).
  // Usa só o layout do site. Sempre fresco — reflete o Syntech na hora.
  let data: Record<string, unknown> = {};
  try { data = await gerarDocSite(c.env); }
  catch (e) { return new Response("Não consegui montar o catálogo do ERP:\n\n" + (e as Error).message, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  // Diagnóstico: ?debug=1 mostra o que foi gerado (origem, contagens, amostras por seção).
  if (c.req.query("debug") === "1") {
    type P = { nome?: string; linha?: string; pronta_entrega?: boolean; grupos?: { linhas?: { sul?: number }[] }[] };
    const resumo = (p: P) => ({ nome: p.nome, linha: p.linha, pe: p.pronta_entrega === true, menor_preco: p.grupos?.[0]?.linhas?.[0]?.sul });
    const ps = Array.isArray((data as { produtos?: unknown[] }).produtos) ? (data as { produtos: P[] }).produtos : [];
    const el = (((data as { edicao_limitada?: { produtos?: unknown[] } }).edicao_limitada) || {}).produtos;
    const elArr = Array.isArray(el) ? (el as P[]) : [];
    return c.json({
      origem_erp: (data as { _origem_erp?: boolean })._origem_erp === true,
      resumo: (data as { _resumo?: unknown })._resumo,
      total_produtos: ps.length,
      total_edicao_limitada: elArr.length,
      amostra_produtos: ps.slice(0, 8).map(resumo),
      amostra_edicao_limitada: elArr.slice(0, 8).map(resumo),
    });
  }
  // Blindagem: o site faz Object.keys(produto.blocos); garante que todo produto
  // (inclusive os de Edição Limitada) tenha os campos que ele espera.
  const blindar = (p: Record<string, unknown>) => {
    if (p && typeof p === "object") {
      if (p.blocos == null || typeof p.blocos !== "object") p.blocos = {};
      if (p.video == null) p.video = "";
      if (!Array.isArray(p.cores)) p.cores = [];
      if (!Array.isArray(p.grupos)) p.grupos = [];
    }
  };
  const prods = Array.isArray((data as { produtos?: unknown[] }).produtos) ? (data as { produtos: Record<string, unknown>[] }).produtos : [];
  for (const p of prods) blindar(p);
  const elp = ((data as { edicao_limitada?: { produtos?: unknown[] } }).edicao_limitada || {}).produtos;
  if (Array.isArray(elp)) for (const p of elp as Record<string, unknown>[]) blindar(p);
  const json = JSON.stringify(data).split("<").join("\\u003c").split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
  // Diagnóstico no TÍTULO da aba: se a injeção funcionar, o título começa com
  // "PREVIEW_OK:<n> prods". Se der erro de execução, "PREVIEW_ERRO: ...". Se o
  // título continuar o normal do site, o <script> injetado teve erro de sintaxe.
  const inject = `<script>try{window.__PREVIEW_DATA__=${json};try{document.title="PREVIEW_OK:"+((window.__PREVIEW_DATA__&&window.__PREVIEW_DATA__.produtos||[]).length)+" prods";}catch(_e){}}catch(e){try{document.title="PREVIEW_ERRO: "+(e&&e.message||e);}catch(_e){}}</script>`;
  const html = SITE_FULL_HTML.includes("</head>") ? SITE_FULL_HTML.replace("</head>", inject + "</head>") : inject + SITE_FULL_HTML;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

// PRÉVIA VISUAL: serve o HTML do site REAL (catalogo-online) com os produtos do
// ERP injetados. NÃO toca no site que está no ar (catalogo/main no Firebase) —
// os dados são embutidos na página (window.__PREVIEW_DATA__), sem ler/gravar o
// Firebase. Serve só pra ver o visual com os dados reais.
integracao.get("/catalogo-preview", async (c) => {
  const cat = await gerarCatalogoSite(c.env);
  const data = {
    produtos: cat.produtos,
    banco_cores: cat.banco_cores,
    banco_tamanhos: cat.banco_tamanhos,
    estoque: cat.estoque,
    capa: null,
    representantes: [],
    popup_promo: null,
    edicao_limitada: {},
    linhas_ocultas: {},
    atualizado_em: Date.now(),
  };
  // Escapa "<" (evita fechar o <script> sem querer) e os separadores de linha
  // U+2028/U+2029 (válidos em JSON, inválidos em string JS). Sem regex literal
  // pra não confundir o empacotador.
  const json = JSON.stringify(data)
    .split("<").join("\\u003c")
    .split(" ").join("\\u2028")
    .split(" ").join("\\u2029");
  const inject = `<script>window.__PREVIEW_DATA__=${json};</script>`;
  const html = SITE_ONLINE_HTML.includes("</head>")
    ? SITE_ONLINE_HTML.replace("</head>", inject + "</head>")
    : inject + SITE_ONLINE_HTML;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});

// ── CATÁLOGO DE PRODUTOS (espelho do ERP) ────────────────────────────────────────
// A ponte manda os produtos (nome, preços, grupo, classe, cores, tamanhos). Read-only.
// body: { itens: [{ ref, nome, unidade, classe, grupo, preco_atacado, preco_varejo,
//   preco_atacado_promo, preco_varejo_promo, estoque_geral, inativo, cores:[...], tamanhos:[...] }] }
integracao.post("/produtos", async (c) => {
  const esperado = (c.env.INTEGRACAO_TOKEN || "").trim();
  const recebido = (c.req.header("X-Integracao-Token") || "").trim();
  if (!esperado || recebido !== esperado) return c.json({ error: "nao_autorizado" }, 401);

  type ProdIn = {
    ref?: string; nome?: string; unidade?: string; classe?: string; grupo?: string;
    preco_atacado?: number | string; preco_varejo?: number | string;
    preco_atacado_promo?: number | string; preco_varejo_promo?: number | string;
    estoque_geral?: number | string; inativo?: number | string | boolean;
    cores?: unknown; tamanhos?: unknown; data_alt_reg?: string;
  };
  const b = await c.req.json<{ itens?: ProdIn[] }>().catch(() => ({} as { itens?: ProdIn[] }));
  const itens: ProdIn[] = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const numOrNull = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const stmts = itens.filter((it) => str(it.ref)).map((it) =>
    c.env.DB.prepare(
      `INSERT INTO erp_produtos (ref, nome, unidade, classe, grupo, preco_atacado, preco_varejo, preco_atacado_promo, preco_varejo_promo, estoque_geral, inativo, cores, tamanhos, data_alt_reg, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ref) DO UPDATE SET nome=excluded.nome, unidade=excluded.unidade, classe=excluded.classe, grupo=excluded.grupo,
         preco_atacado=excluded.preco_atacado, preco_varejo=excluded.preco_varejo,
         preco_atacado_promo=excluded.preco_atacado_promo, preco_varejo_promo=excluded.preco_varejo_promo,
         estoque_geral=excluded.estoque_geral, inativo=excluded.inativo, cores=excluded.cores,
         tamanhos=excluded.tamanhos, data_alt_reg=excluded.data_alt_reg, atualizado_em=datetime('now')`
    ).bind(
      str(it.ref), str(it.nome), str(it.unidade), str(it.classe), str(it.grupo),
      numOrNull(it.preco_atacado), numOrNull(it.preco_varejo), numOrNull(it.preco_atacado_promo), numOrNull(it.preco_varejo_promo),
      numOrNull(it.estoque_geral), (it.inativo === 1 || it.inativo === "1" || it.inativo === true || it.inativo === "S") ? 1 : 0,
      JSON.stringify(Array.isArray(it.cores) ? it.cores : []), JSON.stringify(Array.isArray(it.tamanhos) ? it.tamanhos : []),
      str(it.data_alt_reg)
    )
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, n: stmts.length });
});

// LÊ o catálogo (pra exibir). Junta o saldo total (erp_estoque) e a base das fotos.
integracao.get("/produtos", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const busca = (c.req.query("busca") || "").trim().toLowerCase();
  const grupo = (c.req.query("grupo") || "").trim();
  let sql =
    `SELECT p.ref, p.nome, p.unidade, p.classe, p.grupo, p.preco_atacado, p.preco_varejo,
            p.preco_atacado_promo, p.preco_varejo_promo, p.estoque_geral, p.inativo, p.cores, p.tamanhos, p.atualizado_em,
            (SELECT COALESCE(SUM(e.saldo),0) FROM erp_estoque e WHERE e.ref = p.ref) AS saldo
       FROM erp_produtos p`;
  const cond: string[] = [], binds: unknown[] = [];
  if (busca) { cond.push("(lower(p.nome) LIKE ? OR lower(p.ref) LIKE ?)"); binds.push(`%${busca}%`, `%${busca}%`); }
  if (grupo) { cond.push("p.grupo = ?"); binds.push(grupo); }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY p.inativo, p.nome LIMIT 2000";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  const fotos_base = (await c.env.DB.prepare("SELECT valor FROM config WHERE chave='erp_fotos_base'").first<{ valor: string | null }>().catch(() => null))?.valor || "";
  // grupos distintos (pro filtro)
  const { results: grupos } = await c.env.DB.prepare("SELECT DISTINCT grupo FROM erp_produtos WHERE grupo IS NOT NULL AND grupo <> '' ORDER BY grupo").all<{ grupo: string }>().catch(() => ({ results: [] as { grupo: string }[] }));
  return c.json({ fotos_base, grupos: (grupos || []).map((x) => x.grupo), itens: results || [] });
});

// ── RECUSAR: apaga o pedido do ERP (ex.: cancelado) ─────────────────────────────
integracao.post("/pendentes/:id/recusar", async (c) => {
  const g = await exigirFuncao(c, "pedidos"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id = ? AND (SELECT COALESCE(erp_integracao,0) FROM pedidos WHERE id = ?) = 1").bind(id, id),
    c.env.DB.prepare("DELETE FROM pedidos WHERE id = ? AND COALESCE(erp_integracao,0) = 1 AND status IN ('aguardando_aprovacao','aguardando_explosao')").bind(id),
  ]);
  return c.json({ ok: true });
});
