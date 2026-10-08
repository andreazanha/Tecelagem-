import { Fragment, useEffect, useState } from "react";
import { api, type LojaPedido, type LojaPedidoItem } from "../api";

const brl = (v: number | null) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
const dataHora = (em: string | null) => (em || "").replace("T", " ").slice(0, 16);

function statusTxt(p: LojaPedido): { txt: string; cor: string } {
  if (p.erp_sync_status === "enviado") return { txt: "✓ No Syntech" + (p.erp_numero ? " (nº " + p.erp_numero + ")" : ""), cor: "#166534" };
  if (p.erp_sync_status === "erro") return { txt: "⚠ Erro ao enviar", cor: "#b91c1c" };
  if (Number(p.erp_liberado) === 1) return { txt: "Liberado — a ponte envia em ~2 min", cor: "#92610a" };
  return { txt: "Aguardando liberação", cor: "#555" };
}

export function LojaPedidos() {
  const [modo, setModo] = useState<string>("teste");
  const [pedidos, setPedidos] = useState<LojaPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, LojaPedidoItem[]>>({});
  const [agindo, setAgindo] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    api.lojaPedidos().then((d) => { setModo(d.modo || "teste"); setPedidos(d.pedidos || []); }).catch(() => setPedidos([])).finally(() => setCarregando(false));
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, []);

  function verItens(id: string) {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    if (!itens[id]) api.lojaPedidoDetalhe(id).then((d) => setItens((m) => ({ ...m, [id]: d.itens || [] }))).catch(() => {});
  }
  async function liberar(id: string) {
    if (!confirm("Liberar este pedido para ir ao Syntech? Ele entra como ORÇAMENTO/PENDENTE lá (dá para conferir e excluir no Syntech).")) return;
    setAgindo(id); try { await api.lojaLiberar(id); carregar(); } finally { setAgindo(null); }
  }
  async function reenviar(id: string) {
    setAgindo(id); try { await api.lojaReenviar(id); carregar(); } finally { setAgindo(null); }
  }
  async function trocarModo(m: string) {
    if (m === "on" && !confirm("Ligar o envio AUTOMÁTICO? A partir de agora TODO pedido da loja vai sozinho pro Syntech (como orçamento). Confirme só depois do pedido de teste ter dado certo.")) return;
    try { await api.lojaConfig(m); setModo(m); carregar(); } catch { alert("Não consegui mudar o modo."); }
  }

  const pil = (val: string, txt: string, hint: string) => (
    <button className={"btn " + (modo === val ? "btn-primary" : "btn-soft")} style={{ padding: "8px 12px", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => trocarModo(val)} title={hint}>
      <b>{txt}</b><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{hint}</span>
    </button>
  );

  return (
    <>
      <div className="page-head"><div><h1>Pedidos da Loja (B2B)</h1><div className="breadcrumb">Gestão › Pedidos vindos do catálogo online</div></div>
        <button className="btn btn-soft" onClick={carregar}>Atualizar</button>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Envio para o Syntech</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pil("off", "Desligado", "Não envia nada")}
          {pil("teste", "Teste", "Só envia os que você LIBERAR, um a um")}
          {pil("on", "Automático", "Envia TODO pedido da loja sozinho")}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
          Os pedidos entram no Syntech como <b>orçamento/pendente</b> (não vão direto pra produção) — dá pra conferir e, se precisar, excluir lá. Comece no <b>Teste</b>, libere 1 pedido, confira no Syntech, e só então ligue o <b>Automático</b>.
        </div>
      </div>

      {carregando && !pedidos.length ? <div style={{ padding: 20, color: "#777" }}>Carregando…</div> : null}
      {!carregando && !pedidos.length ? <div className="card" style={{ padding: 20, color: "#777" }}>Nenhum pedido da loja ainda. Quando um cliente finalizar um pedido no catálogo online (com o CNPJ), ele aparece aqui.</div> : null}

      {pedidos.length ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Quando</th><th>Cliente</th><th>CNPJ</th><th style={{ textAlign: "right" }}>Peças</th><th style={{ textAlign: "right" }}>Total</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {pedidos.map((p) => {
                const s = statusTxt(p);
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>{dataHora(p.created_at || p.data_pedido)}</td>
                      <td>{p.cliente_nome || "—"}</td>
                      <td>{p.cliente_cnpj || "—"}</td>
                      <td style={{ textAlign: "right" }}>{p.pecas ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{brl(p.valor_total)}</td>
                      <td style={{ color: s.cor }}>{s.txt}{p.erp_sync_status === "erro" && p.erp_sync_erro ? <div style={{ fontSize: 11 }}>{p.erp_sync_erro}</div> : null}</td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <button className="btn btn-soft" style={{ padding: "5px 9px", marginRight: 6 }} onClick={() => verItens(p.id)}>{aberto === p.id ? "Fechar" : "Ver itens"}</button>
                        {p.erp_sync_status === "pendente" && Number(p.erp_liberado) === 0 ? (
                          <button className="btn btn-primary" style={{ padding: "5px 9px" }} disabled={agindo === p.id} onClick={() => liberar(p.id)}>{agindo === p.id ? "…" : "Liberar envio"}</button>
                        ) : null}
                        {p.erp_sync_status === "erro" ? (
                          <button className="btn btn-primary" style={{ padding: "5px 9px" }} disabled={agindo === p.id} onClick={() => reenviar(p.id)}>{agindo === p.id ? "…" : "Tentar de novo"}</button>
                        ) : null}
                      </td>
                    </tr>
                    {aberto === p.id ? (
                      <tr><td colSpan={7} style={{ background: "var(--bg-soft)", color: "var(--ink)" }}>
                        {!itens[p.id] ? <div style={{ padding: 8, color: "var(--muted)" }}>Carregando itens…</div> : (
                          <table className="table" style={{ margin: 4 }}>
                            <thead><tr><th>Produto</th><th>Ref</th><th>Cor</th><th>Tamanho</th><th style={{ textAlign: "right" }}>Qtd</th><th style={{ textAlign: "right" }}>Preço</th></tr></thead>
                            <tbody>
                              {itens[p.id].map((it, i) => (
                                <tr key={i}>
                                  <td>{it.produto || "—"}</td>
                                  <td>{it.ref || "—"}</td>
                                  <td>{(it.cor_grade || "—") + (it.cod_cor != null ? " (cód " + it.cod_cor + ")" : "")}</td>
                                  <td>{it.tamanho || it.erp_tamanho || "—"}{it.erp_tamanho && it.erp_tamanho !== it.tamanho ? " [" + it.erp_tamanho + "]" : ""}</td>
                                  <td style={{ textAlign: "right" }}>{it.qtd}</td>
                                  <td style={{ textAlign: "right" }}>{brl(it.valor_unit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td></tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
