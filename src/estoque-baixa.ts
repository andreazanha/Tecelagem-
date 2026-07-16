// ── Baixa automática de estoque + estorno (amarrados ao pedido) ──────────────
// Regras de segurança (crítico para a operação — não pode errar):
//  • Livro-razão: toda mudança é um registro em material_mov, com pedido_id.
//  • Idempotente: baixa acontece UMA vez por pedido; estorno só se ainda não
//    estornou. Rodar de novo não tira/devolve em dobro.
//  • Atômico: tudo do pedido num único DB.batch (ou todas, ou nenhuma).
//  • Estorno EXATO: devolve exatamente o que saiu, ao mesmo material de origem,
//    usando os movimentos gravados — nunca recalcula "no chute".
// Mexe só na unidade base (materiais.saldo). Caixas é manual/QR (independente).
import type { Env } from "./index";

const uid = () => crypto.randomUUID();
const MOTIVO_BAIXA = "pedido";
const MOTIVO_ESTORNO = "estorno pedido";

export type ConsumoItem = { material_id: string; quantidade: number };

// Soma consumos do mesmo material (um pedido pode usar o mesmo insumo em vários itens).
export function somarConsumo(itens: ConsumoItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of itens) {
    const id = (it.material_id || "").trim();
    const q = Number(it.quantidade);
    if (!id || !q || isNaN(q) || q <= 0) continue;
    m.set(id, (m.get(id) || 0) + q);
  }
  return m;
}

// Dá baixa do consumo de um pedido. Idempotente por pedido_id.
export async function baixarPorPedido(env: Env, pedidoId: string, itens: ConsumoItem[]): Promise<{ baixados: number; jaFeito: boolean }> {
  const pid = (pedidoId || "").trim();
  if (!pid) return { baixados: 0, jaFeito: false };
  // já baixou esse pedido? (trava contra baixa dupla)
  const existe = await env.DB.prepare(
    "SELECT 1 FROM material_mov WHERE pedido_id = ? AND motivo = ? LIMIT 1"
  ).bind(pid, MOTIVO_BAIXA).first();
  if (existe) return { baixados: 0, jaFeito: true };

  const consumo = somarConsumo(itens);
  if (consumo.size === 0) return { baixados: 0, jaFeito: false };

  // pega saldos atuais só dos materiais envolvidos
  const ids = [...consumo.keys()];
  const ph = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT id, saldo FROM materiais WHERE id IN (${ph})`).bind(...ids).all<{ id: string; saldo: number }>();
  const saldo = new Map(results.map((r) => [r.id, Number(r.saldo) || 0]));

  const stmts = [] as ReturnType<Env["DB"]["prepare"]>[];
  for (const [id, qtd] of consumo) {
    if (!saldo.has(id)) continue; // material não existe mais → ignora (não trava o pedido)
    const novo = (saldo.get(id) || 0) - qtd; // pode ficar negativo → mostra a falta (não "some" com o consumo)
    stmts.push(env.DB.prepare("UPDATE materiais SET saldo = ? WHERE id = ?").bind(novo, id));
    stmts.push(env.DB.prepare(
      "INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id) VALUES (?, ?, 'baixa', ?, ?, ?)"
    ).bind(uid(), id, -qtd, MOTIVO_BAIXA, pid));
  }
  if (!stmts.length) return { baixados: 0, jaFeito: false };
  await env.DB.batch(stmts);
  return { baixados: stmts.length / 2, jaFeito: false };
}

// Estorna (devolve) o que o pedido consumiu. Idempotente: só devolve baixas ainda
// não estornadas; se já devolveu, não faz nada.
export async function estornarPedido(env: Env, pedidoId: string): Promise<{ estornados: number }> {
  const pid = (pedidoId || "").trim();
  if (!pid) return { estornados: 0 };
  const { results: baixas } = await env.DB.prepare(
    "SELECT id, material_id, quantidade FROM material_mov WHERE pedido_id = ? AND motivo = ? AND estornado = 0"
  ).bind(pid, MOTIVO_BAIXA).all<{ id: string; material_id: string; quantidade: number }>();
  if (!baixas.length) return { estornados: 0 };

  const stmts = [] as ReturnType<Env["DB"]["prepare"]>[];
  for (const b of baixas) {
    const devolver = Math.abs(Number(b.quantidade) || 0); // quantidade da baixa é negativa
    if (devolver > 0) {
      stmts.push(env.DB.prepare("UPDATE materiais SET saldo = saldo + ? WHERE id = ?").bind(devolver, b.material_id));
      stmts.push(env.DB.prepare(
        "INSERT INTO material_mov (id, material_id, tipo, quantidade, motivo, pedido_id) VALUES (?, ?, 'entrada', ?, ?, ?)"
      ).bind(uid(), b.material_id, devolver, MOTIVO_ESTORNO, pid));
    }
    stmts.push(env.DB.prepare("UPDATE material_mov SET estornado = 1 WHERE id = ?").bind(b.id));
  }
  await env.DB.batch(stmts);
  return { estornados: baixas.length };
}
