// ── Baixa automática de estoque + estorno (amarrados ao pedido) ──────────────
// Regras de segurança (crítico para a operação — não pode errar):
//  • Livro-razão: toda mudança é um registro em material_mov, com pedido_id.
//  • Idempotente: baixa acontece UMA vez por pedido (baixa ativa); estorno só se
//    ainda não estornou. Rodar de novo não tira/devolve em dobro.
//  • Atômico: tudo do pedido num único DB.batch.
//  • Estorno EXATO: devolve exatamente o que saiu, à origem, pelos movimentos
//    gravados — nunca recalcula "no chute".
// Duas origens de estoque:
//  • fonte 'material' → materiais.saldo (por materiais.id).
//  • fonte 'fio'      → cores.saldo   (por cores.nome — a cor já implica o fio).
// Mexe só na unidade base; caixas é manual/QR (independente).
import type { Env } from "./index";

const uid = () => crypto.randomUUID();
const MOTIVO_BAIXA = "pedido";
const MOTIVO_ESTORNO = "estorno pedido";

export type ConsumoItem = { fonte: "material" | "fio"; material_id: string; quantidade: number };

// Soma consumos da mesma origem+item (um pedido usa o mesmo insumo em vários itens).
export function somarConsumo(itens: ConsumoItem[]): Map<string, ConsumoItem> {
  const m = new Map<string, ConsumoItem>();
  for (const it of itens) {
    const fonte = it.fonte === "fio" ? "fio" : "material";
    const id = (it.material_id || "").trim();
    const q = Number(it.quantidade);
    if (!id || !q || isNaN(q) || q <= 0) continue;
    const k = fonte + "|" + id;
    const cur = m.get(k);
    if (cur) cur.quantidade += q;
    else m.set(k, { fonte, material_id: id, quantidade: q });
  }
  return m;
}

// Monta o consumo de estoque de um pedido a partir da ficha dos produtos:
//  • insumos da ficha (modelo_materiais) de (produto, tamanho), respeitando a COR
//    no zíper (cor_produto = cor do item, ou "todas"); consumo = qtd/peça × qtd do item.
//  • fio: peso (kg) do tamanho (seção Peso) × qtd do item, na COR do item.
export async function consumoDoPedido(env: Env, pedidoId: string): Promise<ConsumoItem[]> {
  const { results: itens } = await env.DB.prepare(
    "SELECT produto, cor_grade AS cor, tamanho, qtd FROM pedido_itens WHERE pedido_id = ?"
  ).bind(pedidoId).all<{ produto: string; cor: string | null; tamanho: string | null; qtd: number }>();
  const out: ConsumoItem[] = [];
  for (const it of itens) {
    const P = (it.produto || "").trim();
    const C = (it.cor || "").trim();
    const T = (it.tamanho || "").trim().toUpperCase();
    const N = Math.max(0, Math.trunc(Number(it.qtd) || 0));
    if (!P || !T || N <= 0) continue;
    // insumos da ficha (respeitando a cor no zíper)
    const { results: mats } = await env.DB.prepare(
      `SELECT material_id, quantidade FROM modelo_materiais
        WHERE modelo_nome = ? AND tamanho = ? AND fonte = 'material' AND status = 'ativo'
          AND (cor_produto IS NULL OR cor_produto = ?)`
    ).bind(P, T, C).all<{ material_id: string; quantidade: number | null }>();
    for (const m of mats) {
      const porPeca = m.quantidade == null ? 1 : Number(m.quantidade);
      const q = porPeca * N;
      if (q > 0) out.push({ fonte: "material", material_id: m.material_id, quantidade: q });
    }
    // fio: peso (kg) do tamanho × N, da cor do item
    if (C) {
      const tam = await env.DB.prepare("SELECT peso FROM modelo_tamanhos WHERE modelo_nome = ? AND tamanho = ?").bind(P, T).first<{ peso: number | null }>();
      const peso = Number(tam?.peso) || 0;
      if (peso > 0) out.push({ fonte: "fio", material_id: C, quantidade: peso * N });
    }
  }
  return out;
}

// Aplica UPDATE de saldo + registro no ledger, conforme a origem.
function stmtsBaixa(env: Env, pid: string, c: ConsumoItem) {
  if (c.fonte === "fio") {
    return [
      env.DB.prepare("UPDATE cores SET saldo = saldo - ? WHERE nome = ?").bind(c.quantidade, c.material_id),
      env.DB.prepare("INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id, fonte) VALUES (?, ?, 'baixa', ?, ?, ?, 'fio')").bind(uid(), c.material_id, -c.quantidade, MOTIVO_BAIXA, pid),
    ];
  }
  return [
    env.DB.prepare("UPDATE materiais SET saldo = saldo - ? WHERE id = ?").bind(c.quantidade, c.material_id),
    env.DB.prepare("INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id, fonte) VALUES (?, ?, 'baixa', ?, ?, ?, 'material')").bind(uid(), c.material_id, -c.quantidade, MOTIVO_BAIXA, pid),
  ];
}

// Dá baixa do consumo de um pedido. Idempotente por pedido (ignora baixas já estornadas).
export async function baixarPorPedido(env: Env, pedidoId: string, itens: ConsumoItem[]): Promise<{ baixados: number; jaFeito: boolean }> {
  const pid = (pedidoId || "").trim();
  if (!pid) return { baixados: 0, jaFeito: false };
  const ativa = await env.DB.prepare(
    "SELECT 1 FROM material_mov WHERE pedido_id = ? AND motivo = ? AND estornado = 0 LIMIT 1"
  ).bind(pid, MOTIVO_BAIXA).first();
  if (ativa) return { baixados: 0, jaFeito: true };

  const consumo = somarConsumo(itens);
  if (consumo.size === 0) return { baixados: 0, jaFeito: false };

  // só baixa alvos que existem (material apagado / cor inexistente não trava o pedido)
  const matIds = [...consumo.values()].filter((c) => c.fonte === "material").map((c) => c.material_id);
  const corNomes = [...consumo.values()].filter((c) => c.fonte === "fio").map((c) => c.material_id);
  const existeMat = new Set<string>();
  const existeCor = new Set<string>();
  if (matIds.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM materiais WHERE id IN (${matIds.map(() => "?").join(",")})`).bind(...matIds).all<{ id: string }>();
    results.forEach((r) => existeMat.add(r.id));
  }
  if (corNomes.length) {
    const { results } = await env.DB.prepare(`SELECT nome FROM cores WHERE nome IN (${corNomes.map(() => "?").join(",")})`).bind(...corNomes).all<{ nome: string }>();
    results.forEach((r) => existeCor.add(r.nome));
  }

  const stmts: D1PreparedStatement[] = [];
  let n = 0;
  for (const c of consumo.values()) {
    const existe = c.fonte === "fio" ? existeCor.has(c.material_id) : existeMat.has(c.material_id);
    if (!existe) continue;
    stmts.push(...stmtsBaixa(env, pid, c));
    n++;
  }
  if (!stmts.length) return { baixados: 0, jaFeito: false };
  await env.DB.batch(stmts);
  return { baixados: n, jaFeito: false };
}

// Estorna (devolve) o que o pedido consumiu. Idempotente: só baixas ainda não estornadas.
export async function estornarPedido(env: Env, pedidoId: string): Promise<{ estornados: number }> {
  const pid = (pedidoId || "").trim();
  if (!pid) return { estornados: 0 };
  const { results: baixas } = await env.DB.prepare(
    "SELECT id, material_id, quantidade, fonte FROM material_mov WHERE pedido_id = ? AND motivo = ? AND estornado = 0"
  ).bind(pid, MOTIVO_BAIXA).all<{ id: string; material_id: string; quantidade: number; fonte: string }>();
  if (!baixas.length) return { estornados: 0 };

  const stmts: D1PreparedStatement[] = [];
  for (const b of baixas) {
    const devolver = Math.abs(Number(b.quantidade) || 0); // a baixa é negativa
    if (devolver > 0) {
      if (b.fonte === "fio") {
        stmts.push(env.DB.prepare("UPDATE cores SET saldo = saldo + ? WHERE nome = ?").bind(devolver, b.material_id));
        stmts.push(env.DB.prepare("INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id, fonte) VALUES (?, ?, 'entrada', ?, ?, ?, 'fio')").bind(uid(), b.material_id, devolver, MOTIVO_ESTORNO, pid));
      } else {
        stmts.push(env.DB.prepare("UPDATE materiais SET saldo = saldo + ? WHERE id = ?").bind(devolver, b.material_id));
        stmts.push(env.DB.prepare("INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id, fonte) VALUES (?, ?, 'entrada', ?, ?, ?, 'material')").bind(uid(), b.material_id, devolver, MOTIVO_ESTORNO, pid));
      }
    }
    stmts.push(env.DB.prepare("UPDATE material_mov SET estornado = 1 WHERE id = ?").bind(b.id));
  }
  await env.DB.batch(stmts);
  return { estornados: baixas.length };
}
