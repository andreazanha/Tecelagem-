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
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [explodindo, setExplodindo] = useState(false);

  function carregar() { setCarregando(true); api.erpPendentes().then(setLista).catch(() => setLista([])).finally(() => { setCarregando(false); setSel(new Set()); }); }
  useEffect(carregar, []);

  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeSel = (id: string) => setSel((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });

  async function abrir(id: string) {
    if (aberto === id) { setAberto(null); setDetalhe(null); return; }
    setAberto(id); setDetalhe(null);
    try { setDetalhe(await api.erpPendenteDetalhe(id)); } catch { /* ignore */ }
  }
  async function aprovar(p: ErpPendente) {
    if (!confirm(`Explodir o pedido ${p.numero_erp} (${p.cliente_nome})? Vai pra produção.`)) return;
    setOcupado(p.id);
    try { await api.erpAprovar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); removeSel(p.id); setMsg(`✓ Pedido ${p.numero_erp} explodido — foi pra produção.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui explodir."); }
    finally { setOcupado(null); }
  }
  async function aceitar(p: ErpPendente) {
    setOcupado(p.id);
    try { await api.erpAceitar(p.id); setLista((xs) => xs.map((x) => x.id === p.id ? { ...x, status: "aguardando_explosao" } : x)); setMsg(`📥 Pedido ${p.numero_erp} aceito — guardado pra explodir depois.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui aceitar."); }
    finally { setOcupado(null); }
  }
  async function recusar(p: ErpPendente) {
    if (!confirm(`Recusar/descartar o pedido ${p.numero_erp} (${p.cliente_nome})? Ele NÃO entra na produção e será removido.`)) return;
    setOcupado(p.id);
    try { await api.erpRecusar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); removeSel(p.id); setMsg(`Pedido ${p.numero_erp} recusado.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui recusar."); }
    finally { setOcupado(null); }
  }
  async function explodirJuntos() {
    const ids = [...sel];
    if (ids.length < 2) return;
    if (!confirm(`Explodir ${ids.length} pedidos JUNTOS numa OP consolidada? Viram uma produção só (código pai) e se desmembram depois por pedido/loja.`)) return;
    setExplodindo(true);
    try {
      const r = await api.erpAprovarLote(ids);
      setLista((xs) => xs.filter((x) => !sel.has(x.id))); setSel(new Set());
      setMsg(`✓ ${r.pedidos} pedidos explodidos juntos na OP ${r.codigo_pai}.`); setTimeout(() => setMsg(""), 5000);
    } catch { alert("Não consegui explodir juntos."); }
    finally { setExplodindo(false); }
  }

  const pendentes = lista.filter((p) => p.status === "aguardando_aprovacao");
  const aceitos = lista.filter((p) => p.status === "aguardando_explosao");

  function Card({ p, held }: { p: ErpPendente; held: boolean }) {
    return (
      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} title="Selecionar pra explodir junto" style={{ width: 18, height: 18, cursor: "pointer" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{p.numero_erp} <span className="muted" style={{ fontWeight: 400 }}>· {p.cliente_nome}</span></div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {p.linhas} linha(s) · <b>{p.pecas}</b> peça(s) · pedido {dataBR(p.data_pedido)}{p.data_entrega ? ` · entrega ${dataBR(p.data_entrega)}` : ""}
            </div>
          </div>
          <button className="btn btn-soft" style={{ padding: "7px 12px" }} onClick={() => abrir(p.id)}>{aberto === p.id ? "Ocultar itens" : "👁 Conferir itens"}</button>
          <button className="btn btn-ok" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aprovar(p)}>{ocupado === p.id ? "…" : (held ? "💥 Explodir" : "✓ Aprovar e explodir")}</button>
          {!held && <button className="btn btn-soft" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aceitar(p)}>📥 Aceitar (segurar)</button>}
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
                        <td className="strong">{it.produto}</td><td className="muted">{it.ref || "—"}</td>
                        <td>{it.cor || "—"}</td><td>{it.tamanho || "—"}</td>
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
    );
  }

  return (
    <>
      <div className="page-head"><div><h1>Pedidos do ERP</h1><div className="breadcrumb">PCP › Pedidos do ERP (conferência)</div></div>
        <button className="btn btn-soft" onClick={carregar}>↻ Atualizar</button>
      </div>

      <div className="card pad" style={{ marginBottom: 14, background: "#f8fafc", borderStyle: "dashed" }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pedidos vindos do ERP (Syntech) chegam aqui <b>antes</b> da produção. Você pode:
          <b style={{ color: "#16a34a" }}> ✓ Aprovar e explodir</b> (vai pra produção agora),
          <b> 📥 Aceitar (segurar)</b> (guarda pra explodir depois — bom pra juntar pedidos pequenos),
          ou <b style={{ color: "#dc2626" }}>✗ Recusar</b> (descarta). Marque vários e use <b>💥 Explodir juntos</b> pra render mais na tecelagem.
        </p>
      </div>

      {msg && <div className="card pad" style={{ marginBottom: 14, background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>{msg}</div>}

      {sel.size >= 2 && (
        <div className="card pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#eef2ff", borderColor: "#c7d2fe", position: "sticky", top: 8, zIndex: 5 }}>
          <b style={{ color: "#3730a3" }}>{sel.size} pedidos selecionados</b>
          <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}>Juntar numa OP só (código pai) pra render mais na tecelagem. Desmembra depois por pedido/loja.</span>
          <button className="btn btn-soft" onClick={() => setSel(new Set())}>Limpar</button>
          <button className="btn btn-primary" disabled={explodindo} onClick={explodirJuntos}>{explodindo ? "Explodindo…" : `💥 Explodir juntos (${sel.size})`}</button>
        </div>
      )}

      {carregando ? <p className="muted pad">Carregando…</p> : lista.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>Nenhum pedido do ERP na fila. 👍</p></div>
      ) : (
        <>
          <h2 style={{ fontSize: 16, margin: "4px 0 10px" }}>📥 Para conferir <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({pendentes.length})</span></h2>
          {pendentes.length === 0 ? <p className="muted" style={{ marginBottom: 16 }}>Nada pra conferir.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>{pendentes.map((p) => <Card key={p.id} p={p} held={false} />)}</div>
          )}

          {aceitos.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, margin: "4px 0 10px" }}>⏸️ Aceitos — aguardando explosão <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({aceitos.length})</span></h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{aceitos.map((p) => <Card key={p.id} p={p} held={true} />)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}
