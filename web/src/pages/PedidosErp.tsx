import { useEffect, useState } from "react";
import { api, type ErpPendente, type ErpPendenteDetalhe } from "../api";

const dataBR = (s: string | null) => s ? (s.includes("T") || s.includes(" ") ? s.replace("T", " ").slice(0, 16) : s.split("-").reverse().join("/")) : "—";

export function PedidosErp() {
  const [lista, setLista] = useState<ErpPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ErpPendenteDetalhe | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  function carregar() { setCarregando(true); api.erpPendentes().then(setLista).catch(() => setLista([])).finally(() => setCarregando(false)); }
  useEffect(carregar, []);

  async function abrir(id: string) {
    if (aberto === id) { setAberto(null); setDetalhe(null); return; }
    setAberto(id); setDetalhe(null);
    try { setDetalhe(await api.erpPendenteDetalhe(id)); } catch { /* ignore */ }
  }
  async function aprovar(p: ErpPendente) {
    if (!confirm(`Aprovar o pedido ${p.numero_erp} (${p.cliente_nome})? Ele vai pra produção e será explodido.`)) return;
    setOcupado(p.id);
    try { await api.erpAprovar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); setMsg(`✓ Pedido ${p.numero_erp} aprovado — foi pra produção.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui aprovar."); }
    finally { setOcupado(null); }
  }
  async function recusar(p: ErpPendente) {
    if (!confirm(`Recusar/descartar o pedido ${p.numero_erp} (${p.cliente_nome})? Ele NÃO entra na produção e será removido da fila.`)) return;
    setOcupado(p.id);
    try { await api.erpRecusar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); setMsg(`Pedido ${p.numero_erp} recusado.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui recusar."); }
    finally { setOcupado(null); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Pedidos do ERP</h1><div className="breadcrumb">PCP › Pedidos do ERP (conferência)</div></div>
        <button className="btn btn-soft" onClick={carregar}>↻ Atualizar</button>
      </div>

      <div className="card pad" style={{ marginBottom: 14, background: "#f8fafc", borderStyle: "dashed" }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Os pedidos que chegam do ERP (Syntech) aparecem aqui <b>antes</b> de entrar na produção. Confira e clique
          em <b style={{ color: "#16a34a" }}>✓ Aprovar</b> pra explodir e mandar pra produção, ou <b style={{ color: "#dc2626" }}>✗ Recusar</b> pra descartar (ex.: cancelado). Nada entra na produção sem a sua conferência.
        </p>
      </div>

      {msg && <div className="card pad" style={{ marginBottom: 14, background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>{msg}</div>}

      {carregando ? <p className="muted pad">Carregando…</p> : lista.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>Nenhum pedido do ERP aguardando conferência. 👍</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lista.map((p) => (
            <div key={p.id} className="card pad">
              <div className="row-gap" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{p.numero_erp} <span className="muted" style={{ fontWeight: 400 }}>· {p.cliente_nome}</span></div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {p.linhas} linha(s) · <b>{p.pecas}</b> peça(s) · pedido {dataBR(p.data_pedido)}{p.data_entrega ? ` · entrega ${dataBR(p.data_entrega)}` : ""}
                  </div>
                </div>
                <button className="btn btn-soft" style={{ padding: "7px 12px" }} onClick={() => abrir(p.id)}>{aberto === p.id ? "Ocultar itens" : "👁 Conferir itens"}</button>
                <button className="btn btn-ok" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aprovar(p)}>{ocupado === p.id ? "…" : "✓ Aprovar"}</button>
                <button className="btn btn-danger" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => recusar(p)}>✗ Recusar</button>
              </div>

              {aberto === p.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  {!detalhe ? <p className="muted">Carregando itens…</p> : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table" style={{ minWidth: 520 }}>
                        <thead><tr><th>Produto</th><th>Código</th><th>Cor</th><th>Tamanho</th><th className="num">Qtd</th></tr></thead>
                        <tbody>
                          {detalhe.itens.map((it, i) => (
                            <tr key={i}>
                              <td className="strong">{it.produto}</td>
                              <td className="muted">{it.ref || "—"}</td>
                              <td>{it.cor || "—"}</td>
                              <td>{it.tamanho || "—"}</td>
                              <td className="num" style={{ fontWeight: 700 }}>{it.qtd}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
