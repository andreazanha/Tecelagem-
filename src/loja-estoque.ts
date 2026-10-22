// TRAVA DE ESTOQUE DA LOJA — fecha a janela entre "cliente enviou" e "Syntech empenhou +
// ponte sincronizou". Reserva as PEÇAS FÍSICAS (capa/peseira) de cada pedido no nível do
// componente, pra nunca vender a mesma capa duas vezes (Queen/King dividem a capa 55×35;
// Manta/avulsa dividem a 50×50; kit cheio usa a mesma capa do vazio).
//
// Fonte de verdade: SALDO do Syntech (espelho erp_estoque) — já com o empenho descontado.
// A reserva local só vale ENQUANTO o pedido ainda não apareceu no SALDO (status 'pendente'
// ou 'enviado' mas antes da sincronização que o reflete). Depois o empenho do Syntech assume.
import type { Env } from "./index";

const uid = () => crypto.randomUUID();
const up = (s: unknown) => String(s ?? "").toUpperCase();

// Tipo da peça pelo NOME (mesma regra do catálogo).
export function tipoPeca(n: string): "peseira" | "almofada" | "capa" | "outro" {
  const u = up(n);
  if (/PESEIRA|MANTA/.test(u)) return "peseira";
  if (/ALMOFADA/.test(u)) return "almofada";
  if (/CAPA/.test(u)) return "capa";
  return "outro";
}

// Lê do NOME do kit a FAMÍLIA ("Kit Balls"), a VARIAÇÃO (QUEEN/KING/MANTA) e se é CHEIO
// (C/ ENCHIMENTO). Mesma leitura do catálogo (gerarDocSite).
const VARIACOES = ["QUEEN", "KING", "MANTA", "MANTAS"];
export function parseKit(nome: string): { familia: string; variacao: string; temEnch: boolean } {
  const u = up(nome);
  const temEnch = /ENCHIMENTO/i.test(nome);
  let variacao = "";
  for (const k of VARIACOES) { if (new RegExp("\\b" + k + "\\b").test(u)) { variacao = k === "MANTAS" ? "MANTA" : k; break; } }
  let fam = nome;
  const vpos = variacao ? u.indexOf(variacao) : -1;
  if (vpos >= 0) fam = nome.slice(0, vpos);
  else { const ip = nome.indexOf("+"); if (ip >= 0) fam = nome.slice(0, ip); }
  fam = fam.replace(/[-–+\s]+$/, "").trim();
  return { familia: (fam || nome).toUpperCase(), variacao, temEnch };
}

type Fisico = { ref: string; tam: string; qtd: number }; // consumo por UNIDADE do kit

// Para CADA kit (ref), as PEÇAS FÍSICAS que ele consome por unidade. O kit CHEIO (almofada)
// é mapeado pra MESMA capa do kit VAZIO da mesma família/variação (a almofada = capa +
// enchimento; no Syntech baixa a capa). Peças que não têm capa correspondente caem na peça
// original (seguro).
export async function consumoDosKits(env: Env): Promise<Map<string, Fisico[]>> {
  const rec = (await env.DB.prepare("SELECT kit_ref, componente_ref, quantidade, tamanho FROM erp_kit_receita").all<{ kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }>().catch(() => ({ results: [] as { kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }[] }))).results || [];
  const out = new Map<string, Fisico[]>();
  if (!rec.length) return out;
  const recPorKit = new Map<string, Fisico[]>();
  const refs = new Set<string>();
  for (const r of rec) {
    refs.add(r.kit_ref); refs.add(r.componente_ref);
    const a = recPorKit.get(r.kit_ref) || [];
    a.push({ ref: r.componente_ref, tam: String(r.tamanho || "").trim(), qtd: Number(r.quantidade) || 1 });
    recPorKit.set(r.kit_ref, a);
  }
  // nomes dos produtos (kits + componentes) pra identificar tipo e parsear o kit
  const nome = new Map<string, string>();
  const lista = [...refs];
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100);
    const ph = lote.map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT ref, nome FROM erp_produtos WHERE ref IN (${ph})`).bind(...lote).all<{ ref: string; nome: string | null }>().catch(() => ({ results: [] as { ref: string; nome: string | null }[] }))).results || [];
    for (const r of rows) nome.set(r.ref, String(r.nome || r.ref));
  }
  // capa de cada (família|variação), tirada dos kits VAZIOS (que têm a capa na receita)
  const capaDaVar = new Map<string, Fisico>();
  for (const [kitRef, comps] of recPorKit) {
    const pk = parseKit(nome.get(kitRef) || kitRef);
    if (pk.temEnch) continue;
    const capa = comps.find((c) => tipoPeca(nome.get(c.ref) || "") === "capa");
    if (capa) capaDaVar.set(pk.familia + "|" + pk.variacao, capa);
  }
  // monta o consumo físico de cada kit (almofada → capa da mesma variação)
  for (const [kitRef, comps] of recPorKit) {
    const pk = parseKit(nome.get(kitRef) || kitRef);
    const fis: Fisico[] = [];
    for (const c of comps) {
      const tp = tipoPeca(nome.get(c.ref) || "");
      if (tp === "almofada") {
        const capa = capaDaVar.get(pk.familia + "|" + pk.variacao);
        if (capa) fis.push({ ref: capa.ref, tam: capa.tam, qtd: c.qtd });
        else fis.push({ ref: c.ref, tam: c.tam, qtd: c.qtd }); // sem capa correspondente → peça original
      } else {
        fis.push({ ref: c.ref, tam: c.tam, qtd: c.qtd });
      }
    }
    out.set(kitRef, fis);
  }
  return out;
}

export type ItemConsumo = { ref: string; cor: string; tam: string; qtd: number };

// Explode os itens do pedido nas PEÇAS FÍSICAS (ref|cor|tam → qtd). Item que é kit vira as
// peças da receita; item avulso/produto direto consome ele mesmo.
export async function explodirPedido(env: Env, itens: { ref: string; cor: string; tam: string; qtd: number }[]): Promise<Map<string, ItemConsumo>> {
  const kits = await consumoDosKits(env);
  const out = new Map<string, ItemConsumo>();
  const add = (ref: string, cor: string, tam: string, qtd: number) => {
    if (!ref || qtd <= 0) return;
    const k = `${ref}|${cor}|${tam}`.toLowerCase();
    const e = out.get(k) || { ref, cor, tam, qtd: 0 };
    e.qtd += qtd; out.set(k, e);
  };
  for (const it of itens) {
    const fis = kits.get(it.ref);
    if (fis && fis.length) { for (const f of fis) add(f.ref, it.cor, f.tam, it.qtd * f.qtd); }
    else add(it.ref, it.cor, it.tam, it.qtd);
  }
  return out;
}

// Quanto já está RESERVADO de uma peça por OUTROS pedidos ainda não refletidos no SALDO.
// Conta pedidos 'pendente'/'erro' (ainda não empenharam no Syntech) e 'enviado' cujo
// erp_sync_em é DEPOIS da última sincronização de estoque (empenho ainda não veio no SALDO).
async function reservadoDe(env: Env, ref: string, cor: string, tam: string, pedidoId: string, syncEm: string | null): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(rv.qtd),0) AS q
       FROM erp_reserva rv JOIN pedidos p ON p.id = rv.pedido_id
      WHERE lower(rv.ref)=lower(?) AND lower(COALESCE(rv.cor,''))=lower(?) AND COALESCE(rv.tamanho,'')=?
        AND rv.pedido_id <> ?
        AND rv.criado_em > datetime('now','-7 days')
        AND COALESCE(p.erp_sync_status,'') IN ('pendente','erro','enviado')
        AND NOT (COALESCE(p.erp_sync_status,'')='enviado' AND p.erp_sync_em IS NOT NULL AND ? IS NOT NULL AND p.erp_sync_em <= ?)`
  ).bind(ref, cor, tam, pedidoId, syncEm, syncEm).first<{ q: number }>();
  return Number(r?.q) || 0;
}

async function saldoDe(env: Env, ref: string, cor: string, tam: string): Promise<number> {
  const r = await env.DB.prepare(
    "SELECT COALESCE(SUM(saldo),0) AS s FROM erp_estoque WHERE lower(ref)=lower(?) AND lower(COALESCE(cor,''))=lower(?) AND COALESCE(tamanho,'')=?"
  ).bind(ref, cor, tam).first<{ s: number }>();
  return Number(r?.s) || 0;
}

// Confere se o pedido CABE no estoque (SALDO − reservas de outros) e, se couber, grava a
// reserva. Devolve os statements da reserva pra entrarem no MESMO batch do pedido, ou a
// lista de faltas pra recusar. Pedido em RASCUNHO não reserva (não chama isto).
export async function conferirEReservar(env: Env, pedidoId: string, itens: { ref: string; cor: string; tam: string; qtd: number }[]):
  Promise<{ ok: true; reservas: D1PreparedStatement[] } | { ok: false; faltas: { ref: string; cor: string; tam: string; pede: number; tem: number }[] }> {
  const consumo = await explodirPedido(env, itens);
  if (!consumo.size) return { ok: true, reservas: [] };
  // Só trava peças RASTREADAS (que têm saldo no espelho). Produto SOB ENCOMENDA (sem linha
  // no espelho) não é limitado por estoque — passa sem travar.
  const refs = [...new Set([...consumo.values()].map((c) => c.ref))];
  const rastreado = new Set<string>();
  for (let i = 0; i < refs.length; i += 50) {
    const lote = refs.slice(i, i + 50);
    const ph = lote.map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT DISTINCT lower(ref) AS ref FROM erp_estoque WHERE lower(ref) IN (${ph})`).bind(...lote.map((r) => r.toLowerCase())).all<{ ref: string }>().catch(() => ({ results: [] as { ref: string }[] }))).results || [];
    for (const r of rows) rastreado.add(String(r.ref).toLowerCase());
  }
  const alvo = [...consumo.values()].filter((c) => rastreado.has(c.ref.toLowerCase()));
  if (!alvo.length) return { ok: true, reservas: [] };
  const syncEm = (await env.DB.prepare("SELECT valor FROM config WHERE chave='estoque_sync_em'").first<{ valor: string | null }>().catch(() => null))?.valor || null;
  const faltas: { ref: string; cor: string; tam: string; pede: number; tem: number }[] = [];
  for (const c of alvo) {
    const saldo = await saldoDe(env, c.ref, c.cor, c.tam);
    const reservado = await reservadoDe(env, c.ref, c.cor, c.tam, pedidoId, syncEm);
    const disp = saldo - reservado;
    if (c.qtd > disp) faltas.push({ ref: c.ref, cor: c.cor, tam: c.tam, pede: c.qtd, tem: Math.max(0, disp) });
  }
  if (faltas.length) return { ok: false, faltas };
  // (re)grava a reserva deste pedido: limpa a antiga + insere a nova (só das peças rastreadas)
  const reservas: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pedidoId)];
  for (const c of alvo) {
    reservas.push(env.DB.prepare("INSERT INTO erp_reserva (id, pedido_id, ref, cor, tamanho, qtd) VALUES (?,?,?,?,?,?)")
      .bind(uid(), pedidoId, c.ref, c.cor || null, c.tam || null, c.qtd));
  }
  return { ok: true, reservas };
}

// ── ALERTA DE PEÇAS DO KIT ──────────────────────────────────────────────────
// O kit é montado inteiro (peseira + capas). Se as peças não batem (ex.: tem peseira
// mas falta capa), a equipe precisa saber ANTES de vender/montar. Detecta, por kit +
// cor, quantos kits dá pra montar e quais peças ESTÃO SOBRANDO porque falta a outra.
export type KitAlerta = { kit: string; cor: string; montaveis: number; faltando: string; sobrando: { peca: string; qtd: number }[] };

export async function kitAlertas(env: Env): Promise<KitAlerta[]> {
  const rec = (await env.DB.prepare("SELECT kit_ref, componente_ref, quantidade, tamanho FROM erp_kit_receita").all<{ kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }>().catch(() => ({ results: [] as { kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }[] }))).results || [];
  if (!rec.length) return [];
  const recPorKit = new Map<string, { ref: string; tam: string; qtd: number }[]>();
  const refs = new Set<string>();
  for (const r of rec) {
    refs.add(r.kit_ref); refs.add(r.componente_ref);
    const a = recPorKit.get(r.kit_ref) || [];
    a.push({ ref: r.componente_ref, tam: String(r.tamanho || "").trim(), qtd: Number(r.quantidade) || 1 });
    recPorKit.set(r.kit_ref, a);
  }
  const nome = new Map<string, string>();
  const lista = [...refs];
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100);
    const ph = lote.map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT ref, nome FROM erp_produtos WHERE ref IN (${ph})`).bind(...lote).all<{ ref: string; nome: string | null }>().catch(() => ({ results: [] as { ref: string; nome: string | null }[] }))).results || [];
    for (const r of rows) nome.set(r.ref, String(r.nome || r.ref));
  }
  // saldo de todas as peças, em memória
  const est = (await env.DB.prepare("SELECT ref, cor, tamanho, saldo FROM erp_estoque").all<{ ref: string | null; cor: string | null; tamanho: string | null; saldo: number }>().catch(() => ({ results: [] as { ref: string | null; cor: string | null; tamanho: string | null; saldo: number }[] }))).results || [];
  const saldo = new Map<string, number>();     // ref|cor|tam (lower) → saldo
  const coresDaRef = new Map<string, Set<string>>(); // ref(lower) → cores
  for (const e of est) {
    const ref = (e.ref || "").trim().toLowerCase(); if (!ref) continue;
    const cor = (e.cor || "").trim(); const tam = (e.tamanho || "").trim();
    saldo.set(`${ref}|${cor.toLowerCase()}|${tam.toLowerCase()}`, Number(e.saldo) || 0);
    const s = coresDaRef.get(ref) || new Set<string>(); if (cor) s.add(cor); coresDaRef.set(ref, s);
  }
  const rotulo = (ref: string) => { const t = tipoPeca(nome.get(ref) || ""); return t === "peseira" ? "Peseira" : t === "capa" ? "Capa" : t === "almofada" ? "Almofada" : (nome.get(ref) || ref); };
  const out: KitAlerta[] = [];
  for (const [kitRef, comps] of recPorKit) {
    const pk = parseKit(nome.get(kitRef) || kitRef);
    if (pk.temEnch) continue; // só o kit vazio (o cheio usa as mesmas capas)
    // cores candidatas = união das cores das peças coloridas do kit
    const cores = new Set<string>();
    for (const c of comps) { const s = coresDaRef.get(c.ref.toLowerCase()); if (s) for (const x of s) cores.add(x); }
    for (const cor of cores) {
      const linhas = comps.map((c) => {
        const sld = saldo.get(`${c.ref.toLowerCase()}|${cor.toLowerCase()}|${c.tam.toLowerCase()}`) || 0;
        return { peca: rotulo(c.ref), saldo: sld, qtd: c.qtd, max: Math.floor(sld / (c.qtd || 1)) };
      });
      if (!linhas.length) continue;
      const montaveis = Math.max(0, Math.min(...linhas.map((l) => l.max)));
      // peças sobrando = saldo que não vira kit por falta de outra peça
      const sobrando = linhas.map((l) => ({ peca: l.peca, qtd: l.saldo - montaveis * l.qtd })).filter((s) => s.qtd >= 1);
      if (!sobrando.length) continue; // tudo casado → sem alerta
      const limit = linhas.slice().sort((a, b) => a.max - b.max)[0]; // a peça que trava
      out.push({ kit: `Kit ${pk.familia.charAt(0) + pk.familia.slice(1).toLowerCase()}${pk.variacao ? " " + pk.variacao.charAt(0) + pk.variacao.slice(1).toLowerCase() : ""}`, cor, montaveis, faltando: limit.peca, sobrando });
    }
  }
  // mais graves primeiro (mais peças paradas)
  out.sort((a, b) => b.sobrando.reduce((s, x) => s + x.qtd, 0) - a.sobrando.reduce((s, x) => s + x.qtd, 0));
  return out;
}

// Limpa reservas que já foram refletidas no SALDO (pedido enviado + sincronização depois)
// ou de pedidos que não existem mais. Chamado ao fim de cada sincronização de estoque.
export async function limparReservasRefletidas(env: Env): Promise<number> {
  const r = await env.DB.prepare(
    `DELETE FROM erp_reserva WHERE pedido_id IN (
       SELECT rv.pedido_id FROM erp_reserva rv LEFT JOIN pedidos p ON p.id = rv.pedido_id
        WHERE p.id IS NULL
           OR COALESCE(p.erp_sync_status,'') IN ('rascunho','recusado','cancelado')
           OR (COALESCE(p.erp_sync_status,'')='enviado' AND p.erp_sync_em IS NOT NULL
               AND p.erp_sync_em <= COALESCE((SELECT valor FROM config WHERE chave='estoque_sync_em'), '0'))
     )`
  ).run().catch(() => ({ meta: { changes: 0 } }));
  return (r.meta && (r.meta.changes as number)) || 0;
}
