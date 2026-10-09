// Ordens de compra de insumos PERSISTIDAS, com aprovação do gestor.
// Fluxo: PCP cria (aguardando_aprovacao) -> gestor edita/aprova -> gera PDF e
// envia no WhatsApp (status 'enviada'). Recusar marca 'recusada'.
//
// Permissões: compras.ordem = criar/ver; compras.aprovar = editar/aprovar/recusar.
import { Hono } from "hono";
import type { Env } from "../index";
import { exigirFuncao, exigirAlgumaFuncao, permissoesDoUsuario } from "../permissoes";
import type { UsuarioAuth } from "../sessao";
import { enviarMidiaZapi, abParaBase64, enviarWhatsapp } from "./atendimento";
import { gerarOrdemCompra, type OrdemCompraItem } from "../pdf";

const compras = new Hono<{ Bindings: Env }>();
const uid = () => crypto.randomUUID();

// Quem aprova (gestor/admin/legado) vê TODAS as ordens; os demais (PCP) só as próprias.
async function podeAprovarOrdens(env: Env, u: UsuarioAuth): Promise<boolean> {
  if (u.admin) return true;
  const p = await permissoesDoUsuario(env, u.id);
  if (!p.configurado) return true;                 // legado: mantém tudo até configurar
  return p.funcoes.has("compras.aprovar");
}

type EmpresaDados = { nome?: string; cnpj?: string; endereco?: string; telefone?: string; email?: string };
type FornDados = { nome?: string; contato?: string; telefone?: string; email?: string; cnpj?: string };
type ItemBody = { material_id?: string; nome?: string; codigo?: string; tamanho?: string; cor?: string; unidade?: string; saldo?: number; minimo?: number; qtd?: number; preco?: number };

function numOrNull(v: unknown): number | null { return v == null || v === "" ? null : (Number(v)); }

const p2 = (n: number) => String(n).padStart(2, "0");
function agoraBR() { return new Date(Date.now() - 3 * 3600 * 1000); } // horário de Brasília
function numeroOC(d: Date) {
  return `OC-${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
}
function parse<T>(s: string | null | undefined, fb: T): T { try { return s ? JSON.parse(s) as T : fb; } catch { return fb; } }

// Monta o objeto completo (cabeçalho + itens) de uma ordem.
async function carregarOrdem(env: Env, id: string) {
  const o = await env.DB.prepare("SELECT * FROM ordens_compra WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!o) return null;
  const { results } = await env.DB.prepare("SELECT * FROM ordem_compra_itens WHERE ordem_id=? ORDER BY ordem, rowid").bind(id).all();
  return {
    ...o,
    empresa: parse<EmpresaDados>(o.empresa_json as string, {}),
    fornecedor: parse<FornDados>(o.fornecedor_json as string, { nome: (o.fornecedor_nome as string) || "" }),
    itens: (results || []) as Array<Record<string, unknown>>,
  } as OrdemFull;
}

type OrdemFull = Record<string, unknown> & {
  empresa: EmpresaDados;
  fornecedor: FornDados;
  itens: Array<Record<string, unknown>>;
};

function totalItens(itens: Array<{ qtd?: unknown; preco?: unknown }>) {
  return itens.reduce((s, it) => s + (Number(it.preco) || 0) * (Number(it.qtd) || 0), 0);
}

// ── Criar ordem (PCP) — NÃO envia WhatsApp; fica aguardando aprovação ──────────
compras.post("/ordens", async (c) => {
  const g = await exigirFuncao(c, "compras.ordem"); if ("erro" in g) return g.erro;
  type Body = {
    fornecedor?: string; fornecedor_id?: string;
    empresa?: EmpresaDados; fornecedorDados?: FornDados;
    obs?: string; forma_pagamento?: string; itens?: ItemBody[];
  };
  const b = await c.req.json<Body>().catch(() => ({} as Body));
  const itens = (Array.isArray(b.itens) ? b.itens : []).filter((it) => it && (Number(it.qtd) || 0) > 0);
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);

  const now = agoraBR();
  const id = uid();
  const numero = numeroOC(now);
  const fornNome = b.fornecedorDados?.nome || b.fornecedor || "—";
  const total = totalItens(itens as Array<{ qtd?: unknown; preco?: unknown }>);
  const criadoEm = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO ordens_compra
       (id, numero, fornecedor_id, fornecedor_nome, fornecedor_json, empresa_json,
        status, total, obs, forma_pagamento, criado_por_id, criado_por_nome, criado_em)
     VALUES (?,?,?,?,?,?, 'aguardando_aprovacao', ?,?,?,?,?,?)`
  ).bind(
    id, numero, b.fornecedor_id || null, fornNome,
    JSON.stringify(b.fornecedorDados || { nome: fornNome }),
    JSON.stringify(b.empresa || { nome: "Big Tricot" }),
    total, (b.obs || "").trim() || null, (b.forma_pagamento || "").trim() || null, g.u.id, g.u.nome, criadoEm,
  ).run();

  const stmts = itens.map((it, i) => c.env.DB.prepare(
    `INSERT INTO ordem_compra_itens (id, ordem_id, material_id, nome, codigo, tamanho, cor, unidade, saldo, minimo, qtd, preco, ordem)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(uid(), id, it.material_id || null, it.nome || "", it.codigo || null, it.tamanho || null, it.cor || null, it.unidade || null, numOrNull(it.saldo), numOrNull(it.minimo), Number(it.qtd) || 0, Number(it.preco) || 0, i));
  if (stmts.length) await c.env.DB.batch(stmts);

  // Avisa o gestor no WhatsApp (só texto) que há uma nova ordem aguardando aprovação.
  let aviso = false;
  const num = ((await c.env.DB.prepare("SELECT valor FROM config WHERE chave='estoque_min_wpp'").first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
  if (num) {
    const rBR = (n: number) => { try { return "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { return "R$ " + (Number(n) || 0).toFixed(2); } };
    const texto =
      `📝 *NOVA ORDEM DE COMPRA* — aguardando sua aprovação\n` +
      `Nº ${numero}\n` +
      `🚛 ${fornNome}\n` +
      `${itens.length} item(ns) · Total estimado ${rBR(total)}\n` +
      `Criada por ${g.u.nome}\n` +
      `Abra o sistema em *Ordens de compra* para revisar e aprovar.`;
    const r = await enviarWhatsapp(c.env, num, { tipo: "texto", texto }).catch(() => ({ enviado: false }));
    aviso = !!r.enviado;
  }

  return c.json({ ok: true, id, numero, aviso });
});

// ── Listar ordens (PCP ou gestor) ─────────────────────────────────────────────
compras.get("/ordens", async (c) => {
  const g = await exigirAlgumaFuncao(c, ["compras.ordem", "compras.aprovar"]); if ("erro" in g) return g.erro;
  const todas = await podeAprovarOrdens(c.env, g.u); // gestor vê todas; PCP só as próprias
  const status = (c.req.query("status") || "").trim();
  let sql = `SELECT o.*, (SELECT COUNT(*) FROM ordem_compra_itens i WHERE i.ordem_id=o.id) AS n_itens
               FROM ordens_compra o`;
  const binds: unknown[] = [];
  const where: string[] = [];
  if (status) { where.push("o.status=?"); binds.push(status); }
  if (!todas) { where.push("o.criado_por_id=?"); binds.push(g.u.id); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY o.criado_em DESC LIMIT 300";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results || []);
});

// ── Detalhe de uma ordem ──────────────────────────────────────────────────────
compras.get("/ordens/:id", async (c) => {
  const g = await exigirAlgumaFuncao(c, ["compras.ordem", "compras.aprovar"]); if ("erro" in g) return g.erro;
  const o = await carregarOrdem(c.env, c.req.param("id"));
  if (!o) return c.json({ error: "nao_encontrada" }, 404);
  const todas = await podeAprovarOrdens(c.env, g.u);
  if (!todas && o.criado_por_id !== g.u.id) return c.json({ error: "nao_encontrada" }, 404); // PCP não vê ordem de outro
  return c.json(o);
});

// ── Editar ordem (gestor) — em qualquer status, menos recusada (aprovada/enviada
//    podem ser editadas e depois reenviadas pelo gestor). ───────────────────────
compras.patch("/ordens/:id", async (c) => {
  const g = await exigirFuncao(c, "compras.aprovar"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const o = await c.env.DB.prepare("SELECT status FROM ordens_compra WHERE id=?").bind(id).first<{ status: string }>();
  if (!o) return c.json({ error: "nao_encontrada" }, 404);
  if (o.status === "recusada") return c.json({ error: "nao_editavel", status: o.status }, 409);

  type Body = { obs?: string; forma_pagamento?: string; itens?: ItemBody[] };
  const b = await c.req.json<Body>().catch(() => ({} as Body));
  if (Array.isArray(b.itens)) {
    const itens = b.itens.filter((it) => it && (Number(it.qtd) || 0) > 0);
    await c.env.DB.prepare("DELETE FROM ordem_compra_itens WHERE ordem_id=?").bind(id).run();
    const stmts = itens.map((it, i) => c.env.DB.prepare(
      `INSERT INTO ordem_compra_itens (id, ordem_id, material_id, nome, codigo, tamanho, cor, unidade, saldo, minimo, qtd, preco, ordem)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(uid(), id, it.material_id || null, it.nome || "", it.codigo || null, it.tamanho || null, it.cor || null, it.unidade || null, numOrNull(it.saldo), numOrNull(it.minimo), Number(it.qtd) || 0, Number(it.preco) || 0, i));
    if (stmts.length) await c.env.DB.batch(stmts);
    const total = totalItens(itens as Array<{ qtd?: unknown; preco?: unknown }>);
    await c.env.DB.prepare("UPDATE ordens_compra SET total=? WHERE id=?").bind(total, id).run();
  }
  if (b.obs !== undefined) await c.env.DB.prepare("UPDATE ordens_compra SET obs=? WHERE id=?").bind((b.obs || "").trim() || null, id).run();
  if (b.forma_pagamento !== undefined) await c.env.DB.prepare("UPDATE ordens_compra SET forma_pagamento=? WHERE id=?").bind((b.forma_pagamento || "").trim() || null, id).run();
  const atual = await carregarOrdem(c.env, id);
  return c.json({ ok: true, ordem: atual });
});

// ── Aprovar: gera PDF e envia no WhatsApp ─────────────────────────────────────
compras.post("/ordens/:id/aprovar", async (c) => {
  const g = await exigirFuncao(c, "compras.aprovar"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const o = await carregarOrdem(c.env, id);
  if (!o) return c.json({ error: "nao_encontrada" }, 404);
  if (o.status === "recusada") return c.json({ error: "recusada" }, 409);
  const reenvio = o.status === "enviada" || o.status === "aprovada"; // já passou por aprovação → é reenvio

  const num = ((await c.env.DB.prepare("SELECT valor FROM config WHERE chave='estoque_min_wpp'").first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
  if (!num) return c.json({ error: "numero_nao_configurado" }, 400);

  const now = agoraBR();
  const dataBR = `${p2(now.getUTCDate())}/${p2(now.getUTCMonth() + 1)}/${now.getUTCFullYear()}`;
  const itens: OrdemCompraItem[] = (o.itens as Array<Record<string, unknown>>).map((it) => ({
    nome: String(it.nome || ""), tamanho: (it.tamanho as string) || undefined, cor: (it.cor as string) || undefined,
    codigo: (it.codigo as string) || undefined, unidade: (it.unidade as string) || undefined,
    saldo: it.saldo == null ? undefined : Number(it.saldo), minimo: it.minimo == null ? undefined : Number(it.minimo),
    qtd: Number(it.qtd) || 0, preco: Number(it.preco) || 0,
  }));
  if (!itens.length) return c.json({ error: "sem_itens" }, 400);
  const fornNome = (o.fornecedor as FornDados)?.nome || (o.fornecedor_nome as string) || "—";
  const total = totalItens(itens);

  // Marca aprovada ANTES de enviar (quem aprovou / quando).
  // No REENVIO (ordem já aprovada/enviada) preserva o aprovador original via COALESCE.
  const aprovadoEm = new Date().toISOString();
  if (reenvio) {
    await c.env.DB.prepare(
      "UPDATE ordens_compra SET status='aprovada', total=?, aprovado_por_id=COALESCE(aprovado_por_id,?), aprovado_por_nome=COALESCE(aprovado_por_nome,?), aprovado_em=COALESCE(aprovado_em,?), erro=NULL WHERE id=?"
    ).bind(total, g.u.id, g.u.nome, aprovadoEm, id).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE ordens_compra SET status='aprovada', total=?, aprovado_por_id=?, aprovado_por_nome=?, aprovado_em=?, erro=NULL WHERE id=?"
    ).bind(total, g.u.id, g.u.nome, aprovadoEm, id).run();
  }

  let base64 = "";
  try {
    const bytes = await gerarOrdemCompra({
      empresa: (o.empresa as EmpresaDados) || { nome: "Big Tricot" },
      fornecedor: (o.fornecedor as FornDados) || { nome: fornNome },
      numero: String(o.numero), data: dataBR, itens,
      forma_pagamento: (o.forma_pagamento as string) || null,
      obs: (o.obs as string) || null,
    });
    base64 = abParaBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch (e) {
    await c.env.DB.prepare("UPDATE ordens_compra SET erro=? WHERE id=?").bind("pdf_falhou: " + String(e), id).run();
    return c.json({ ok: false, status: "aprovada", motivo: "pdf_falhou", detalhe: String(e) }, 500);
  }

  const rBR = (n: number) => { try { return "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { return "R$ " + (Number(n) || 0).toFixed(2); } };
  const caption =
    `🧾 *ORDEM DE COMPRA* ${o.numero}\n` +
    `📅 ${dataBR}\n` +
    `🚛 ${fornNome}\n` +
    `${itens.length} item(ns) · Total estimado ${rBR(total)}` +
    (o.obs ? `\n📝 ${o.obs}` : "");
  const fileName = `${o.numero}.pdf`.replace(/[^\w.\-]+/g, "_");

  const r = await enviarMidiaZapi(c.env, num, {
    url: "", docData: `data:application/pdf;base64,${base64}`,
    ehImagem: false, ext: "pdf", fileName, caption,
  }).catch(() => ({ enviado: false }));

  if (r.enviado) {
    await c.env.DB.prepare("UPDATE ordens_compra SET status='enviada', enviado_em=?, erro=NULL WHERE id=?").bind(new Date().toISOString(), id).run();
    return c.json({ ok: true, status: "enviada", numero: num });
  }
  const motivo = (r as { motivo?: string }).motivo || "falha";
  await c.env.DB.prepare("UPDATE ordens_compra SET erro=? WHERE id=?").bind("envio: " + motivo, id).run();
  return c.json({ ok: false, status: "aprovada", motivo });
});

// ── Recusar ───────────────────────────────────────────────────────────────────
compras.post("/ordens/:id/recusar", async (c) => {
  const g = await exigirFuncao(c, "compras.aprovar"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const o = await c.env.DB.prepare("SELECT status FROM ordens_compra WHERE id=?").bind(id).first<{ status: string }>();
  if (!o) return c.json({ error: "nao_encontrada" }, 404);
  if (o.status === "enviada") return c.json({ error: "ja_enviada" }, 409);
  const b = await c.req.json<{ motivo?: string }>().catch(() => ({} as { motivo?: string }));
  await c.env.DB.prepare("UPDATE ordens_compra SET status='recusada', erro=? WHERE id=?").bind((b.motivo || "").trim() || null, id).run();
  return c.json({ ok: true, status: "recusada" });
});

export default compras;
