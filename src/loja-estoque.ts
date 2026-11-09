// TRAVA DE ESTOQUE DA LOJA — fecha a janela entre "cliente enviou" e "Syntech empenhou +
// ponte sincronizou". Reserva as PEÇAS FÍSICAS (capa/peseira) de cada pedido no nível do
// componente, pra nunca vender a mesma capa duas vezes (Queen/King dividem a capa 55×35;
// Manta/avulsa dividem a 50×50; kit cheio usa a mesma capa do vazio).
//
// Fonte de verdade: SALDO do Syntech (espelho erp_estoque) — já com o empenho descontado.
// A reserva local só vale ENQUANTO o pedido ainda não apareceu no SALDO (status 'pendente'
// ou 'enviado' mas antes da sincronização que o reflete). Depois o empenho do Syntech assume.
import type { Env } from "./index";
import { flagLigado, FLAG_RESERVAS } from "./flags";

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
    else {
      // EDIÇÃO LIMITADA avulsa: a ALMOFADA (ref …A) consome a MESMA CAPA (…C) — é a mesma peça
      // física (almofada = capa + enchimento). Controla-se o estoque PELA CAPA, igual aos kits.
      // Capa e almofada do mesmo modelo usam o mesmo código de tamanho, então mantemos cor/tam.
      const ref = /^ED\d/i.test(it.ref) && /A$/i.test(it.ref) ? it.ref.replace(/A$/i, "C") : it.ref;
      add(ref, it.cor, it.tam, it.qtd);
    }
  }
  return out;
}

// Filtro das reservas que CONTAM contra a disponibilidade (uma peça física). Regra aprovada:
//  • pendente/erro/enviado SEMPRE contam — ENVIADO (recebido no Syntech) NÃO expira sozinho,
//    fica protegido até uma liberação CONFIÁVEL (cancelamento/exclusão) — sem teto de dias;
//  • rascunho (carrinho) conta só enquanto a janela de 12h está ativa.
// (Mesmo filtro é usado no desconto do catálogo e na trava atômica.)
export const FILTRO_RESERVA_ATIVA =
  "( COALESCE(p.erp_sync_status,'') IN ('pendente','erro','enviado') " +
  "  OR (COALESCE(p.erp_sync_status,'')='rascunho' AND p.reserva_expira_em IS NOT NULL AND p.reserva_expira_em > datetime('now')) )";

// Quanto já está RESERVADO de uma peça por OUTROS pedidos ATIVOS (sem teto de 7 dias: um pedido
// recebido no Syntech segura a peça indefinidamente até ser liberado de verdade).
async function reservadoDe(env: Env, ref: string, cor: string, tam: string, pedidoId: string): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(rv.qtd),0) AS q
       FROM erp_reserva rv JOIN pedidos p ON p.id = rv.pedido_id
      WHERE lower(rv.ref)=lower(?) AND lower(COALESCE(rv.cor,''))=lower(?) AND COALESCE(rv.tamanho,'')=?
        AND rv.pedido_id <> ? AND ${FILTRO_RESERVA_ATIVA}`
  ).bind(ref, cor, tam, pedidoId).first<{ q: number }>();
  return Number(r?.q) || 0;
}

async function saldoDe(env: Env, ref: string, cor: string, tam: string): Promise<number> {
  const r = await env.DB.prepare(
    "SELECT COALESCE(SUM(saldo),0) AS s FROM erp_estoque WHERE lower(ref)=lower(?) AND lower(COALESCE(cor,''))=lower(?) AND COALESCE(tamanho,'')=?"
  ).bind(ref, cor, tam).first<{ s: number }>();
  return Number(r?.s) || 0;
}

// EDIÇÃO LIMITADA — identificada pelo PREFIXO da ref da PEÇA FÍSICA: "ED" seguido de dígito
// (ex.: ED01C, ED01A). Mesmo critério que o catálogo usa para o espelho capa/almofada.
export const ehRefEL = (ref: string): boolean => /^ED\d/i.test(String(ref || "").trim());

// Peça que RESERVA estoque automaticamente: Edição Limitada (ref ED) OU peça de KIT de pronta
// entrega (ref KT). O kit (uma capa) é vendido como pronta entrega; quem BAIXA de verdade são as
// peças KT, mapeadas pela receita (erp_kit_receita). Vale para TODOS os kits. Produtos normais,
// produção e outras categorias NÃO reservam — seguem como hoje.
export const ehRefReservavel = (ref: string): boolean => ehRefEL(ref) || /^KT/i.test(String(ref || "").trim());

// Explode o pedido nas PEÇAS FÍSICAS e mantém só as que RESERVAM: rastreadas (têm saldo no espelho)
// E reserváveis (Edição Limitada ED… ou peça de kit KT…). Produto SOB ENCOMENDA (sem linha no
// espelho) e produto de OUTRA categoria ficam de fora — não travam estoque.
async function explodirAlvo(env: Env, itens: { ref: string; cor: string; tam: string; qtd: number }[]): Promise<ItemConsumo[]> {
  const consumo = await explodirPedido(env, itens);
  if (!consumo.size) return [];
  const refs = [...new Set([...consumo.values()].map((c) => c.ref))];
  const rastreado = new Set<string>();
  for (let i = 0; i < refs.length; i += 50) {
    const lote = refs.slice(i, i + 50);
    const ph = lote.map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT DISTINCT lower(ref) AS ref FROM erp_estoque WHERE lower(ref) IN (${ph})`).bind(...lote.map((r) => r.toLowerCase())).all<{ ref: string }>().catch(() => ({ results: [] as { ref: string }[] }))).results || [];
    for (const r of rows) rastreado.add(String(r.ref).toLowerCase());
  }
  // GATE: só reserva peça rastreada E reservável (Edição Limitada ED… ou peça de kit KT…). Assim a
  // janela de 12h só abre quando há peça reservável; carrinho sem nenhuma dessas nunca cria/expira reserva.
  return [...consumo.values()].filter((c) => rastreado.has(c.ref.toLowerCase()) && ehRefReservavel(c.ref));
}

// TRAVA ATÔMICA (Etapa 7) — monta os statements que gravam a reserva de forma SEGURA contra
// concorrência: cada peça entra por um INSERT CONDICIONAL cuja disponibilidade (SALDO − reservas
// de OUTROS pedidos ativos) é reavaliada NO MOMENTO DA ESCRITA, dentro da transação serializada do
// batch. Assim dois clientes/representantes disputando a MESMA última unidade (inclusive via kits
// que dividem a mesma peça, pois explodirPedido agrega tudo na peça física) nunca reservam além do
// saldo — o 2º INSERT simplesmente não grava nada. Os statements entram no MESMO batch do pedido.
export async function montarReservaAtomica(env: Env, pedidoId: string, itens: { ref: string; cor: string; tam: string; qtd: number }[]):
  Promise<{ stmts: D1PreparedStatement[]; alvo: ItemConsumo[] }> {
  const alvo = await explodirAlvo(env, itens);
  const stmts: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pedidoId)];
  for (const c of alvo) {
    stmts.push(env.DB.prepare(
      `INSERT INTO erp_reserva (id, pedido_id, ref, cor, tamanho, qtd)
         SELECT ?,?,?,?,?,?
          WHERE ? <= (
            (SELECT COALESCE(SUM(saldo),0) FROM erp_estoque WHERE lower(ref)=lower(?) AND lower(COALESCE(cor,''))=lower(?) AND COALESCE(tamanho,'')=?)
            - (SELECT COALESCE(SUM(rv.qtd),0) FROM erp_reserva rv JOIN pedidos p ON p.id=rv.pedido_id
                WHERE lower(rv.ref)=lower(?) AND lower(COALESCE(rv.cor,''))=lower(?) AND COALESCE(rv.tamanho,'')=? AND rv.pedido_id<>? AND ${FILTRO_RESERVA_ATIVA})
          )`
    ).bind(uid(), pedidoId, c.ref, c.cor || null, c.tam || null, c.qtd, c.qtd, c.ref, c.cor, c.tam, c.ref, c.cor, c.tam, pedidoId));
  }
  return { stmts, alvo };
}

// Depois do batch, confere O QUE REALMENTE ficou reservado. Devolve as faltas (peças que não
// couberam) — vazio = tudo reservado. `tem` = disponível real (SALDO − reservas de outros).
export async function faltasDaReserva(env: Env, pedidoId: string, alvo: ItemConsumo[]): Promise<{ ref: string; cor: string; tam: string; pede: number; tem: number }[]> {
  if (!alvo.length) return [];
  const got = new Map<string, number>();
  const rows = (await env.DB.prepare("SELECT lower(ref) AS ref, lower(COALESCE(cor,'')) AS cor, COALESCE(tamanho,'') AS tam, SUM(qtd) AS q FROM erp_reserva WHERE pedido_id=? GROUP BY 1,2,3")
    .bind(pedidoId).all<{ ref: string; cor: string; tam: string; q: number }>().catch(() => ({ results: [] as { ref: string; cor: string; tam: string; q: number }[] }))).results || [];
  for (const r of rows) got.set(`${r.ref}|${r.cor}|${r.tam}`, Number(r.q) || 0);
  const faltas: { ref: string; cor: string; tam: string; pede: number; tem: number }[] = [];
  for (const c of alvo) {
    const key = `${c.ref.toLowerCase()}|${(c.cor || "").toLowerCase()}|${c.tam || ""}`;
    if ((got.get(key) || 0) < c.qtd) {
      const saldo = await saldoDe(env, c.ref, c.cor, c.tam);
      const outros = await reservadoDe(env, c.ref, c.cor, c.tam, pedidoId);
      faltas.push({ ref: c.ref, cor: c.cor, tam: c.tam, pede: c.qtd, tem: Math.max(0, saldo - outros) });
    }
  }
  return faltas;
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
        return { peca: rotulo(c.ref), tipo: tipoPeca(nome.get(c.ref) || ""), saldo: sld, qtd: c.qtd, max: Math.floor(sld / (c.qtd || 1)) };
      });
      if (!linhas.length) continue;
      const montaveis = Math.max(0, Math.min(...linhas.map((l) => l.max)));
      // peças sobrando = saldo que não vira kit por falta de outra peça. CAPA/ALMOFADA que sobra
      // NÃO fica parada: vira estoque AVULSO (vendida sozinha, regra da loja). Só alerta peça SEM
      // venda avulsa (ex.: peseira) encalhada por falta de outra — essa sim precisa de reposição.
      const sobrando = linhas
        .filter((l) => l.tipo !== "capa" && l.tipo !== "almofada")
        .map((l) => ({ peca: l.peca, qtd: l.saldo - montaveis * l.qtd })).filter((s) => s.qtd >= 1);
      if (!sobrando.length) continue; // nada encalhado (fora capa/almofada avulsa) → sem alerta
      const limit = linhas.slice().sort((a, b) => a.max - b.max)[0]; // a peça que trava
      out.push({ kit: `Kit ${pk.familia.charAt(0) + pk.familia.slice(1).toLowerCase()}${pk.variacao ? " " + pk.variacao.charAt(0) + pk.variacao.slice(1).toLowerCase() : ""}`, cor, montaveis, faltando: limit.peca, sobrando });
    }
  }
  // mais graves primeiro (mais peças paradas)
  out.sort((a, b) => b.sobrando.reduce((s, x) => s + x.qtd, 0) - a.sobrando.reduce((s, x) => s + x.qtd, 0));
  return out;
}

// ── NECESSIDADE DE PRODUÇÃO (Pronta Entrega) ─────────────────────────────────
// Mostra o estoque do jeito que a fábrica estoca: KITS montados (igual catálogo) +
// ALMOFADAS AVULSAS, por cor. disponível = saldo − reservado (mesma conta da loja).
// Compara com o MÍNIMO (estoque_min por modelo+cor) e diz o que PRECISA PRODUZIR.
// Edição Limitada (ref ED) fica de fora — é ponta de estoque, não se repõe.
export type UnidadePE = {
  tipo: "kit" | "avulso";
  ref: string;            // chave do mínimo (kit_ref vazio, ou ref do avulso)
  modelo: string;         // nome amigável do modelo
  cor: string;
  disponivel: number;     // kit: quantos dá pra montar (c/ reserva descontada); avulso: soma disponível
  saldo: number;          // idem, mas sem descontar reserva (pra detectar demanda)
  reservado: number;      // total reservado nas peças (sinal de demanda)
  minimo: number;
  falta: number;          // quanto falta pro mínimo (0 se já atende)
  limitante: string;      // peça que trava o kit (ou "")
  status: "zerado_pedido" | "zerado" | "abaixo" | "ok";
  op_aberta: boolean;     // já tem ordem de produção rodando na esteira?
  op_numero: string;      // número da OP (se aberta)
  op_qtd: number;         // quantidade da OP (se aberta)
};

const ehRefED = (ref: string) => /^ED\d/i.test(String(ref || "").trim());
const rankStatus: Record<UnidadePE["status"], number> = { zerado_pedido: 0, zerado: 1, abaixo: 2, ok: 3 };

export async function necessidadeProducao(env: Env): Promise<UnidadePE[]> {
  // 1) receita dos kits
  const rec = (await env.DB.prepare("SELECT kit_ref, componente_ref, quantidade, tamanho FROM erp_kit_receita").all<{ kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }>().catch(() => ({ results: [] as { kit_ref: string; componente_ref: string; quantidade: number; tamanho: string | null }[] }))).results || [];
  const recPorKit = new Map<string, { ref: string; tam: string; qtd: number }[]>();
  const refsRec = new Set<string>();
  const kitRefs = new Set<string>();
  for (const r of rec) {
    kitRefs.add(String(r.kit_ref).toLowerCase());
    refsRec.add(r.kit_ref); refsRec.add(r.componente_ref);
    const a = recPorKit.get(r.kit_ref) || [];
    a.push({ ref: r.componente_ref, tam: String(r.tamanho || "").trim(), qtd: Number(r.quantidade) || 1 });
    recPorKit.set(r.kit_ref, a);
  }
  // 2) saldo por peça + cores por ref
  const est = (await env.DB.prepare("SELECT ref, cor, tamanho, saldo FROM erp_estoque").all<{ ref: string | null; cor: string | null; tamanho: string | null; saldo: number }>().catch(() => ({ results: [] as { ref: string | null; cor: string | null; tamanho: string | null; saldo: number }[] }))).results || [];
  const saldoMap = new Map<string, number>();        // ref|cor|tam (lower) → saldo
  const coresDaRef = new Map<string, Set<string>>(); // ref(lower) → cores (nome original)
  const refsEstoque = new Set<string>();
  for (const e of est) {
    const ref = (e.ref || "").trim(); if (!ref) continue;
    refsEstoque.add(ref);
    const cor = (e.cor || "").trim(); const tam = (e.tamanho || "").trim();
    saldoMap.set(`${ref.toLowerCase()}|${cor.toLowerCase()}|${tam.toLowerCase()}`, Number(e.saldo) || 0);
    const s = coresDaRef.get(ref.toLowerCase()) || new Set<string>(); if (cor) s.add(cor); coresDaRef.set(ref.toLowerCase(), s);
  }
  // 3) reservado por peça (pedidos ativos)
  const resMap = new Map<string, number>();
  const resRows = (await env.DB.prepare(
    `SELECT lower(rv.ref) AS ref, lower(COALESCE(rv.cor,'')) AS cor, lower(COALESCE(rv.tamanho,'')) AS tam, COALESCE(SUM(rv.qtd),0) AS q
       FROM erp_reserva rv JOIN pedidos p ON p.id = rv.pedido_id WHERE ${FILTRO_RESERVA_ATIVA} GROUP BY 1,2,3`
  ).all<{ ref: string; cor: string; tam: string; q: number }>().catch(() => ({ results: [] as { ref: string; cor: string; tam: string; q: number }[] }))).results || [];
  for (const r of resRows) resMap.set(`${r.ref}|${r.cor}|${r.tam}`, Number(r.q) || 0);
  // 4) nomes + grupo dos produtos (pra nome do modelo e achar os avulsos de pronta entrega)
  const nomes = new Map<string, string>(); const grupos = new Map<string, string>();
  const prod = (await env.DB.prepare("SELECT ref, nome, grupo FROM erp_produtos WHERE COALESCE(inativo,0)=0").all<{ ref: string; nome: string | null; grupo: string | null }>().catch(() => ({ results: [] as { ref: string; nome: string | null; grupo: string | null }[] }))).results || [];
  for (const p of prod) { nomes.set(p.ref, String(p.nome || p.ref)); grupos.set(p.ref, String(p.grupo || "")); }
  // 5) mínimos cadastrados
  const minMap = new Map<string, number>(); // ref(lower)|cor(lower) → minimo
  const mins = (await env.DB.prepare("SELECT ref, cor, minimo FROM estoque_min").all<{ ref: string; cor: string; minimo: number }>().catch(() => ({ results: [] as { ref: string; cor: string; minimo: number }[] }))).results || [];
  for (const m of mins) minMap.set(`${String(m.ref).toLowerCase()}|${String(m.cor).toLowerCase()}`, Number(m.minimo) || 0);
  const minDe = (ref: string, cor: string) => minMap.get(`${ref.toLowerCase()}|${cor.toLowerCase()}`) || 0;
  // 6) OPs abertas (pedido de reposição ainda ativo) por ref+cor
  const opMap = new Map<string, { numero: string; qtd: number }>(); // ref(lower)|cor(lower) → OP
  const ops = (await env.DB.prepare(
    `SELECT o.ref, lower(o.cor) AS cor, o.qtd, COALESCE(ped.numero_erp,'') AS numero
       FROM producao_op_estoque o JOIN pedidos ped ON ped.id = o.pedido_id
      WHERE o.concluida_em IS NULL AND COALESCE(ped.status,'') NOT IN ('cancelado','recusado')`
  ).all<{ ref: string; cor: string; qtd: number; numero: string }>().catch(() => ({ results: [] as { ref: string; cor: string; qtd: number; numero: string }[] }))).results || [];
  for (const o of ops) { const k = `${String(o.ref).toLowerCase()}|${o.cor}`; const cur = opMap.get(k); opMap.set(k, { numero: o.numero, qtd: (cur?.qtd || 0) + (Number(o.qtd) || 0) }); }
  const opDe = (ref: string, cor: string) => opMap.get(`${ref.toLowerCase()}|${cor.toLowerCase()}`) || null;
  const peca = (ref: string) => { const t = tipoPeca(nomes.get(ref) || ""); return t === "peseira" ? "Peseira" : t === "capa" ? "Capa" : t === "almofada" ? "Almofada" : (nomes.get(ref) || ref); };

  const out: UnidadePE[] = [];
  // ── KITS (montados, igual catálogo) ──
  for (const [kitRef, comps] of recPorKit) {
    const pk = parseKit(nomes.get(kitRef) || kitRef);
    if (pk.temEnch) continue; // só o kit vazio (o cheio usa as mesmas capas → não dobra)
    const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
    const fam = pk.familia.replace(/^KIT\s+/i, ""); // evita "Kit Kit balls" (a família já pode vir com "KIT")
    const modelo = `Kit ${titulo(fam)}${pk.variacao ? " " + titulo(pk.variacao) : ""}`;
    const cores = new Set<string>();
    for (const c of comps) { const s = coresDaRef.get(c.ref.toLowerCase()); if (s) for (const x of s) cores.add(x); }
    for (const cor of cores) {
      let montDisp = Infinity, montSaldo = Infinity, resTot = 0, limMax = Infinity, limNome = "";
      for (const c of comps) {
        const k = `${c.ref.toLowerCase()}|${cor.toLowerCase()}|${c.tam.toLowerCase()}`;
        const sld = saldoMap.get(k) || 0;
        const res = resMap.get(k) || 0; resTot += res;
        const disp = Math.max(0, sld - res);
        const maxD = Math.floor(disp / (c.qtd || 1)); const maxS = Math.floor(sld / (c.qtd || 1));
        montDisp = Math.min(montDisp, maxD); montSaldo = Math.min(montSaldo, maxS);
        if (maxD < limMax) { limMax = maxD; limNome = peca(c.ref); }
      }
      if (!isFinite(montDisp)) continue;
      out.push(montarUnidade("kit", kitRef, modelo, cor, montDisp, montSaldo, resTot, minDe(kitRef, cor), limNome, opDe(kitRef, cor)));
    }
  }
  // ── AVULSOS (pronta entrega estocada solta): produto com grupo "pronta", fora kit/ED/peça-KT ──
  for (const ref of refsEstoque) {
    const grupo = (grupos.get(ref) || "").toLowerCase();
    const ehAvulsoPE = grupo.includes("pronta") && !ehRefED(ref) && !/^kt/i.test(ref) && !kitRefs.has(ref.toLowerCase());
    if (!ehAvulsoPE) continue;
    const cores = coresDaRef.get(ref.toLowerCase()); if (!cores) continue;
    for (const cor of cores) {
      // soma todos os tamanhos dessa cor (almofada avulsa normalmente tem 1 tamanho)
      let dispSum = 0, saldoSum = 0, resSum = 0;
      for (const e of est) {
        if ((e.ref || "").trim().toLowerCase() !== ref.toLowerCase() || (e.cor || "").trim().toLowerCase() !== cor.toLowerCase()) continue;
        const tam = (e.tamanho || "").trim().toLowerCase();
        const sld = Number(e.saldo) || 0; const res = resMap.get(`${ref.toLowerCase()}|${cor.toLowerCase()}|${tam}`) || 0;
        saldoSum += sld; resSum += res; dispSum += Math.max(0, sld - res);
      }
      out.push(montarUnidade("avulso", ref, nomes.get(ref) || ref, cor, dispSum, saldoSum, resSum, minDe(ref, cor), "", opDe(ref, cor)));
    }
  }
  out.sort((a, b) => rankStatus[a.status] - rankStatus[b.status] || b.falta - a.falta || b.reservado - a.reservado || a.modelo.localeCompare(b.modelo, "pt-BR"));
  return out;
}

// OPs de estoque ABERTAS (pedido de reposição ainda ativo) — inclui as criadas pelo buscador
// (produto+cor+tamanho), não só as da fila de kit. Usado na seção "Em produção".
export type OpAberta = { id: string; pedido_id: string; ref: string; cor: string; tamanho: string; tipo: string; modelo: string; qtd: number; numero: string; criado_em: string; bloqueado: number };
export async function listarOpsAbertas(env: Env): Promise<OpAberta[]> {
  const rows = (await env.DB.prepare(
    `SELECT o.id, o.pedido_id, o.ref, COALESCE(o.cor,'') AS cor, COALESCE(o.tamanho,'') AS tamanho, COALESCE(o.tipo,'') AS tipo,
            COALESCE(o.modelo, o.ref) AS modelo, COALESCE(o.qtd,0) AS qtd, COALESCE(ped.numero_erp,'') AS numero,
            COALESCE(o.criado_em,'') AS criado_em, COALESCE(ped.bloqueado,0) AS bloqueado
       FROM producao_op_estoque o JOIN pedidos ped ON ped.id = o.pedido_id
      WHERE o.concluida_em IS NULL AND COALESCE(ped.status,'') NOT IN ('cancelado','recusado')
      ORDER BY o.criado_em DESC`
  ).all<OpAberta>().catch(() => ({ results: [] as OpAberta[] }))).results || [];
  return rows;
}

function montarUnidade(tipo: "kit" | "avulso", ref: string, modelo: string, cor: string, disponivel: number, saldo: number, reservado: number, minimo: number, limitante: string, op: { numero: string; qtd: number } | null): UnidadePE {
  const falta = Math.max(0, minimo - disponivel);
  let status: UnidadePE["status"];
  if (disponivel <= 0) status = reservado > 0 ? "zerado_pedido" : "zerado";
  else if (minimo > 0 && disponivel < minimo) status = "abaixo";
  else status = "ok";
  return { tipo, ref, modelo, cor, disponivel, saldo, reservado, minimo, falta, limitante, status, op_aberta: !!op, op_numero: op?.numero || "", op_qtd: op?.qtd || 0 };
}

// EXPIRAÇÃO DO CARRINHO (Etapa 2) — ao vencer a janela de 12h (sem prorrogação válida e sem ter
// sido enviado ao Syntech), ESVAZIA o carrinho por completo: apaga a reserva, os itens e o
// próprio rascunho, INCLUSIVE os produtos sob encomenda (que não reservam estoque, mas moram no
// mesmo rascunho). Só mexe em RASCUNHO da loja; pedido já enviado (pendente/enviado) NUNCA é
// tocado — as peças seguem reservadas aguardando aprovação (regras 8 e 9). O relógio é o do
// servidor (datetime('now')), nunca o do navegador. Devolve quantos carrinhos foram esvaziados.
export async function expirarCarrinhosVencidos(env: Env): Promise<number> {
  // INTERRUPTOR "reservas_ativo": desligado → NÃO expira nada. Congela o ciclo de reservas; uma
  // reserva já criada (quando estava ligado) NUNCA é apagada/liberada automaticamente ao desligar.
  if (!(await flagLigado(env, FLAG_RESERVAS))) return 0;
  const cond = "canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho' AND reserva_expira_em IS NOT NULL AND reserva_expira_em <= datetime('now')";
  const alvo = (await env.DB.prepare(`SELECT id FROM pedidos WHERE ${cond}`).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }))).results || [];
  if (!alvo.length) return 0;
  const ids = alvo.map((r) => r.id);
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const lote = ids.slice(i, i + 40); const ph = lote.map(() => "?").join(",");
    stmts.push(env.DB.prepare(`DELETE FROM erp_reserva WHERE pedido_id IN (${ph})`).bind(...lote));
    stmts.push(env.DB.prepare(`DELETE FROM pedido_itens WHERE pedido_id IN (${ph})`).bind(...lote));
    stmts.push(env.DB.prepare(`DELETE FROM pedidos WHERE id IN (${ph})`).bind(...lote));
  }
  await env.DB.batch(stmts);
  return ids.length;
}

// Solta SÓ as reservas que podem ser liberadas com segurança: pedido que não existe mais,
// recusado/cancelado, ou RASCUNHO (carrinho) com a janela vencida. Chamado ao fim de cada
// sincronização de estoque. ATENÇÃO (Etapa 7, regra aprovada): pedido 'enviado' (recebido no
// Syntech) NÃO é liberado aqui por tempo/sincronização nenhuma — fica protegido até uma
// liberação confiável (cancelamento) ou conferência manual. Sem teto de dias.
export async function limparReservasRefletidas(env: Env): Promise<number> {
  const r = await env.DB.prepare(
    `DELETE FROM erp_reserva WHERE pedido_id IN (
       SELECT rv.pedido_id FROM erp_reserva rv LEFT JOIN pedidos p ON p.id = rv.pedido_id
        WHERE p.id IS NULL
           OR COALESCE(p.erp_sync_status,'') IN ('recusado','cancelado')
           OR (COALESCE(p.erp_sync_status,'')='rascunho'
               AND (p.reserva_expira_em IS NULL OR p.reserva_expira_em <= datetime('now')))
     )`
  ).run().catch(() => ({ meta: { changes: 0 } }));
  return (r.meta && (r.meta.changes as number)) || 0;
}
