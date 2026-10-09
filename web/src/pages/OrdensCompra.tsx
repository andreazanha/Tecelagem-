// Ordens de compra de insumos — lista + detalhe com aprovação do gestor.
// Fluxo: PCP cria (aguardando aprovação) → gestor abre, ajusta se quiser e
// APROVA → o sistema gera o PDF e envia no WhatsApp. Também dá pra RECUSAR.
import { useEffect, useState, useCallback } from "react";
import { api, type OrdemCompra, type OrdemCompraDetalhe, type OrdemCompraItemRow, type OrdemCompraStatus } from "../api";
import { getUser, podeFuncao } from "../auth";

const nBR = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const rBR = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dataHora(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const ST: Record<OrdemCompraStatus, { txt: string; bg: string; fg: string }> = {
  aguardando_aprovacao: { txt: "Aguardando aprovação", bg: "#fef3c7", fg: "#92400e" },
  aprovada: { txt: "Aprovada (falha no envio)", bg: "#e0e7ff", fg: "#3730a3" },
  enviada: { txt: "Enviada ✓", bg: "#dcfce7", fg: "#166534" },
  recusada: { txt: "Recusada", bg: "#fee2e2", fg: "#991b1b" },
};
function Selo({ s }: { s: OrdemCompraStatus }) {
  const c = ST[s] || { txt: s, bg: "#e5e7eb", fg: "#374151" };
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{c.txt}</span>;
}

const FILTROS: { id: string; label: string }[] = [
  { id: "", label: "Todas" },
  { id: "aguardando_aprovacao", label: "Aguardando" },
  { id: "enviada", label: "Enviadas" },
  { id: "aprovada", label: "Com falha" },
  { id: "recusada", label: "Recusadas" },
];

export function OrdensCompra() {
  const u = getUser();
  const podeAprovar = podeFuncao(u, "compras.aprovar");
  const [filtro, setFiltro] = useState("");
  const [lista, setLista] = useState<OrdemCompra[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try { setLista(await api.listarOrdensCompra(filtro)); } catch { /* mantém */ }
    finally { setCarregou(true); }
  }, [filtro]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Ordens de compra</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {podeAprovar ? "Revise, ajuste e aprove para enviar ao fornecedor." : "Suas ordens criadas (o gestor aprova e envia)."}
        </span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={recarregar}>↻ Atualizar</button>
      </div>

      <div className="row-gap" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button key={f.id} className={"btn " + (filtro === f.id ? "btn-primary" : "btn-soft")} style={{ fontSize: 13 }} onClick={() => setFiltro(f.id)}>{f.label}</button>
        ))}
      </div>

      {carregou && lista.length === 0 && (
        <div className="card pad empty">Nenhuma ordem {filtro ? "neste filtro" : "ainda"}.</div>
      )}

      {lista.length > 0 && (
        <div className="card">
          <table className="table">
            <thead><tr>
              <th>Nº</th><th>Fornecedor</th><th className="num">Itens</th><th className="num">Total</th>
              <th>Status</th><th>Criada</th><th>Por</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setAbertaId(o.id)}>
                  <td className="strong">{o.numero}</td>
                  <td>{o.fornecedor_nome || "—"}</td>
                  <td className="num">{o.n_itens ?? "—"}</td>
                  <td className="num">{rBR(o.total)}</td>
                  <td><Selo s={o.status} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{dataHora(o.criado_em)}</td>
                  <td className="muted">{o.criado_por_nome || "—"}</td>
                  <td><button className="btn btn-soft" style={{ fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setAbertaId(o.id); }}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abertaId && (
        <DetalheOrdem id={abertaId} podeAprovar={podeAprovar} onFechar={() => setAbertaId(null)} onMudou={recarregar} />
      )}
    </>
  );
}

function DetalheOrdem({ id, podeAprovar, onFechar, onMudou }: { id: string; podeAprovar: boolean; onFechar: () => void; onMudou: () => void }) {
  const [ord, setOrd] = useState<OrdemCompraDetalhe | null>(null);
  const [itens, setItens] = useState<OrdemCompraItemRow[]>([]);
  const [obs, setObs] = useState("");
  const [formaPag, setFormaPag] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.obterOrdemCompra(id).then((o) => { if (!vivo) return; setOrd(o); setItens(o.itens || []); setObs(o.obs || ""); setFormaPag(o.forma_pagamento || ""); })
      .catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [id]);

  // Gestor pode editar em qualquer status menos "recusada" (inclui aprovada/enviada → reenvia o PDF atualizado).
  const editavel = podeAprovar && !!ord && ord.status !== "recusada";
  const jaAprovada = !!ord && (ord.status === "aprovada" || ord.status === "enviada");
  const total = itens.reduce((s, it) => s + (Number(it.qtd) || 0) * (Number(it.preco) || 0), 0);

  function setItem(i: number, patch: Partial<OrdemCompraItemRow>) {
    setItens((arr) => arr.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  }
  function removerItem(i: number) { setItens((arr) => arr.filter((_, k) => k !== i)); }

  async function salvar(): Promise<boolean> {
    if (!ord) return false;
    try {
      const r = await api.editarOrdemCompra(ord.id, {
        obs, forma_pagamento: formaPag,
        itens: itens.map((it) => ({ material_id: it.material_id, nome: it.nome || "", codigo: it.codigo, tamanho: it.tamanho, cor: it.cor, unidade: it.unidade, saldo: it.saldo, minimo: it.minimo, qtd: Number(it.qtd) || 0, preco: Number(it.preco) || 0 })),
      });
      setOrd(r.ordem); setItens(r.ordem.itens || []);
      return true;
    } catch (e) { alert((e as Error).message); return false; }
  }

  async function aprovar() {
    if (!ord) return;
    const itensValidos = itens.filter((it) => (Number(it.qtd) || 0) > 0);
    if (!itensValidos.length) { alert("A ordem precisa de ao menos um item com quantidade."); return; }
    const msg = jaAprovada
      ? `Salvar as alterações e REENVIAR o PDF atualizado da ordem ${ord.numero} no WhatsApp do fornecedor?`
      : `Aprovar a ordem ${ord.numero} e enviar o PDF no WhatsApp?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      if (editavel) { if (!(await salvar())) { setBusy(false); return; } }
      const r = await api.aprovarOrdemCompra(ord.id);
      onMudou();
      if (r.ok) { alert(jaAprovada ? `✅ Ordem ${ord.numero} atualizada e reenviada no WhatsApp.` : `✅ Ordem ${ord.numero} aprovada e enviada no WhatsApp.`); onFechar(); }
      else if (r.status === "aprovada") { alert(`A ordem foi ${jaAprovada ? "salva" : "APROVADA"}, mas o envio no WhatsApp falhou (${r.motivo || "falha"}). Confira o número do gestor e a conexão, e tente reenviar.`); const o = await api.obterOrdemCompra(ord.id); setOrd(o); }
      else alert(`⚠️ ${r.motivo || "Não foi possível aprovar."}`);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function recusar() {
    if (!ord) return;
    const motivo = prompt("Recusar esta ordem? (opcional: diga o motivo)");
    if (motivo === null) return;
    setBusy(true);
    try { await api.recusarOrdemCompra(ord.id, motivo || undefined); onMudou(); onFechar(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onFechar(); }}>
      <div className="card pad" style={{ maxWidth: 760, width: "96%", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        {!ord && !erro && <p className="muted">Carregando…</p>}
        {erro && <p style={{ color: "#b91c1c" }}>{erro}</p>}
        {ord && (
          <>
            <div className="row-gap" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{ord.numero}</h2>
              <Selo s={ord.status} />
              <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={onFechar}>✕ Fechar</button>
            </div>
            <div className="muted" style={{ fontSize: 13, margin: "6px 0 2px" }}>
              🚛 <strong>{ord.fornecedor_nome || ord.fornecedor?.nome || "—"}</strong>
              {ord.fornecedor?.telefone ? ` · ${ord.fornecedor.telefone}` : ""}
              {ord.fornecedor?.cnpj ? ` · CNPJ ${ord.fornecedor.cnpj}` : ""}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Criada por {ord.criado_por_nome || "—"} em {dataHora(ord.criado_em)}
              {ord.aprovado_por_nome ? ` · Aprovada por ${ord.aprovado_por_nome} em ${dataHora(ord.aprovado_em)}` : ""}
              {ord.enviado_em ? ` · Enviada em ${dataHora(ord.enviado_em)}` : ""}
            </div>
            {ord.erro && <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "6px 10px", fontSize: 12, margin: "8px 0" }}>⚠️ {ord.erro}</div>}

            <table className="table" style={{ marginTop: 10 }}>
              <thead><tr>
                <th>Cód.</th><th>Material</th><th className="num">Estoque</th><th className="num">Mín.</th><th className="num">Comprar</th><th>Un</th><th className="num">Vl unit.</th><th className="num">Total</th>{editavel && <th></th>}
              </tr></thead>
              <tbody>
                {itens.map((it, i) => {
                  const baixo = it.saldo != null && it.minimo != null && Number(it.saldo) < Number(it.minimo);
                  return (
                  <tr key={it.id || i}>
                    <td className="strong">{it.codigo || "—"}</td>
                    <td>{it.nome}{it.tamanho ? ` · ${it.tamanho}` : ""}{it.cor ? ` · ${it.cor}` : ""}</td>
                    <td className="num" style={baixo ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{it.saldo != null ? nBR(Number(it.saldo)) : "—"}</td>
                    <td className="num muted">{it.minimo != null ? nBR(Number(it.minimo)) : "—"}</td>
                    <td className="num">
                      {editavel
                        ? <input value={String(it.qtd ?? 0)} inputMode="decimal" style={{ width: 70, textAlign: "right" }} onChange={(e) => setItem(i, { qtd: Number(e.target.value.replace(",", ".")) || 0 })} />
                        : nBR(it.qtd)}
                    </td>
                    <td className="muted">{it.unidade || ""}</td>
                    <td className="num">
                      {editavel
                        ? <input value={String(it.preco ?? 0)} inputMode="decimal" style={{ width: 80, textAlign: "right" }} onChange={(e) => setItem(i, { preco: Number(e.target.value.replace(",", ".")) || 0 })} />
                        : (it.preco ? rBR(it.preco) : "—")}
                    </td>
                    <td className="num">{it.preco ? rBR((Number(it.qtd) || 0) * (Number(it.preco) || 0)) : "—"}</td>
                    {editavel && <td><button className="btn btn-soft" title="Remover item" style={{ fontSize: 12 }} onClick={() => removerItem(i)}>🗑</button></td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: "right", fontWeight: 700, margin: "8px 2px" }}>Total estimado: {rBR(total)}</div>

            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Forma de pagamento <span style={{ opacity: .7 }}>(sai no PDF)</span></label>
              <input list="formas-pag-sugestoes" value={formaPag} disabled={!editavel} style={{ width: "100%", marginTop: 4 }}
                placeholder={editavel ? "ex.: Boleto 30 dias · PIX à vista · 30/60/90…" : "—"} onChange={(e) => setFormaPag(e.target.value)} />
              <datalist id="formas-pag-sugestoes">
                <option value="PIX à vista" />
                <option value="Boleto 30 dias" />
                <option value="Boleto 30/60" />
                <option value="Boleto 30/60/90" />
                <option value="Dinheiro" />
                <option value="Cartão" />
              </datalist>
            </div>

            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Observação <span style={{ opacity: .7 }}>(sai no PDF)</span></label>
              <textarea value={obs} disabled={!editavel} rows={2} style={{ width: "100%", marginTop: 4 }}
                placeholder={editavel ? "ex.: prazo de entrega, condições…" : ""} onChange={(e) => setObs(e.target.value)} />
            </div>

            <div className="row-gap" style={{ marginTop: 14, gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {editavel && !jaAprovada && <button className="btn btn-soft" disabled={busy} onClick={salvar}>💾 Salvar alterações</button>}
              {podeAprovar && ord.status === "aguardando_aprovacao" && (
                <>
                  <button className="btn btn-soft" disabled={busy} style={{ color: "#b91c1c" }} onClick={recusar}>✖ Recusar</button>
                  <button className="btn btn-primary" disabled={busy} onClick={aprovar}>{busy ? "Processando…" : "✅ Aprovar e enviar"}</button>
                </>
              )}
              {podeAprovar && jaAprovada && (
                <button className="btn btn-primary" disabled={busy} onClick={aprovar}>{busy ? "Enviando…" : "📲 Salvar e reenviar"}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
