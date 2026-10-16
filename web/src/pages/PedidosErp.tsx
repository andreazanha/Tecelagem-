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
  const [prodView, setProdView] = useState(true);  // junta capa+almofada (mesma peça na máquina)

  // Para a PRODUÇÃO, capa e almofada do mesmo modelo+cor+tamanho são a MESMA peça
  // tricotada (a almofada é a capa com enchimento). Junta as quantidades. Não muda o
  // pedido — é só a visão de quanto tricotar. Peseira e demais ficam como estão.
  type ItemProd = { produto: string; ref: string | null; cor: string | null; tamanho: string | null; qtd: number; _junta?: boolean };
  function juntarCapaAlmofada(itens: { produto: string; ref: string | null; cor: string | null; tamanho: string | null; qtd: number }[]): ItemProd[] {
    const map = new Map<string, ItemProd>();
    const out: ItemProd[] = [];
    for (const it of itens) {
      const nome = String(it.produto || "").trim();
      const tipo = (nome.split(/\s+/)[0] || "").toUpperCase();
      if (tipo === "CAPA" || tipo === "CAPAS" || tipo === "ALMOFADA" || tipo === "ALMOFADAS") {
        const modelo = nome.replace(/^\s*(CAPAS?|ALMOFADAS?)\s+/i, "").trim() || nome;
        const key = `${modelo.toUpperCase()}|${String(it.cor || "").toUpperCase()}|${String(it.tamanho || "").toUpperCase()}`;
        let g = map.get(key);
        if (!g) { g = { produto: modelo, ref: "capa+almofada", cor: it.cor, tamanho: it.tamanho, qtd: 0, _junta: true }; map.set(key, g); out.push(g); }
        g.qtd += Number(it.qtd) || 0;
      } else {
        out.push({ produto: it.produto, ref: it.ref, cor: it.cor, tamanho: it.tamanho, qtd: Number(it.qtd) || 0 });
      }
    }
    return out;
  }

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
  // Abre o pedido numa página limpa (documento) pra visualizar/imprimir/salvar em PDF.
  function escH(s: unknown) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  async function visualizar(p: ErpPendente) {
    const d = (aberto === p.id && detalhe) ? detalhe : await api.erpPendenteDetalhe(p.id).catch(() => null);
    if (!d) { alert("Não consegui carregar os itens do pedido."); return; }
    const itens = prodView ? juntarCapaAlmofada(d.itens) : d.itens;
    const totPec = itens.reduce((s, it) => s + (Number(it.qtd) || 0), 0);
    const rows = itens.map((it) => `<tr><td class="b">${escH(it.produto)}${(it as ItemProd)._junta ? '<span class="tag">capa+almofada</span>' : ""}</td><td class="m">${escH(it.ref || "—")}</td><td>${escH(it.cor || "—")}</td><td>${escH(it.tamanho || "—")}</td><td class="n">${Number(it.qtd) || 0}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedido ${escH(p.numero_erp)} — Big Tricot</title><style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2c2721;margin:0;padding:26px;background:#f3f1ec}
      .doc{max-width:820px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:28px 30px}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #ae5033;padding-bottom:14px;margin-bottom:16px;gap:16px}
      .logo{font-family:Georgia,serif;font-weight:700;font-size:24px;letter-spacing:.02em}
      .logo small{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#ae5033;font-weight:600;font-family:-apple-system,Arial,sans-serif}
      .meta{text-align:right;font-size:13px;color:#5f584e;line-height:1.5}
      .meta b{color:#2c2721;font-size:15px}
      table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
      th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a8278;border-bottom:1px solid #e6e1d8;padding:8px 10px}
      td{padding:9px 10px;border-bottom:1px solid #f0ece4}
      td.b{font-weight:600} td.m{color:#8a8278;font-size:12px} td.n{text-align:right;font-weight:700} th.n{text-align:right}
      .tag{display:inline-block;margin-left:7px;font-size:10px;font-weight:600;color:#8a8278;background:#f1ece3;border-radius:5px;padding:1px 6px}
      tfoot td{border-top:2px solid #e6e1d8;font-weight:700;padding-top:10px}
      .acts{max-width:820px;margin:0 auto 14px;display:flex;gap:10px;justify-content:flex-end}
      .acts button{border:0;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
      .pr{background:#ae5033;color:#fff}
      @media print{ body{background:#fff;padding:0} .doc{box-shadow:none;border-radius:0;max-width:none} .acts{display:none} }
    </style></head><body>
      <div class="acts"><button class="pr" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
      <div class="doc">
        <div class="hd">
          <div class="logo">BIG TRICOT<small>Pedido para produção</small></div>
          <div class="meta"><b>Pedido nº ${escH(p.numero_erp)}</b><br>${escH(p.cliente_nome || "")}<br>Pedido: ${escH(dataBR(p.data_pedido))}${p.data_entrega ? `<br>Entrega: ${escH(dataBR(p.data_entrega))}` : ""}</div>
        </div>
        ${prodView ? '<div style="font-size:12px;color:#8a8278;margin-bottom:6px">🧶 Visão de produção — capa e almofada do mesmo modelo/cor/tamanho estão somadas.</div>' : ""}
        <table><thead><tr><th>Produto</th><th>Código</th><th>Cor</th><th>Tamanho</th><th class="n">Qtd</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total de peças</td><td class="n">${totPec}</td></tr></tfoot></table>
      </div>
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("O navegador bloqueou a janela. Permita pop-ups pra visualizar o pedido."); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }
  async function explodirJuntos() {
    const ids = [...sel];
    if (ids.length < 2) return;
    if (!confirm(`Explodir ${ids.length} pedidos JUNTOS numa explosão? Viram uma produção só (código pai) e se desmembram depois por pedido/loja.`)) return;
    setExplodindo(true);
    try {
      const r = await api.erpAprovarLote(ids);
      setLista((xs) => xs.filter((x) => !sel.has(x.id))); setSel(new Set());
      setMsg(`✓ ${r.pedidos} pedidos explodidos juntos na Explosão ${r.codigo_pai}.`); setTimeout(() => setMsg(""), 5000);
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
          <button className="btn btn-soft" style={{ padding: "7px 12px" }} onClick={() => visualizar(p)}>📄 Visualizar pedido</button>
          <button className="btn btn-ok" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aprovar(p)}>{ocupado === p.id ? "…" : (held ? "💥 Explodir" : "✓ Aprovar e explodir")}</button>
          {!held && <button className="btn btn-soft" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aceitar(p)}>📥 Aceitar (segurar)</button>}
          <button className="btn btn-danger" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => recusar(p)}>✗ Recusar</button>
        </div>

        {aberto === p.id && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {!detalhe ? <p className="muted">Carregando itens…</p> : (
              <>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={prodView} onChange={(e) => setProdView(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  🧶 <b>Juntar capa + almofada</b> <span className="muted">(visão de produção — mesma peça na máquina)</span>
                </label>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ minWidth: 520 }}>
                    <thead><tr><th>Produto</th><th>Código</th><th>Cor</th><th>Tamanho</th><th className="num">Qtd</th></tr></thead>
                    <tbody>
                      {(prodView ? juntarCapaAlmofada(detalhe.itens) : detalhe.itens).map((it, i) => (
                        <tr key={i}>
                          <td className="strong">{it.produto}{(it as ItemProd)._junta ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · capa+almofada</span> : null}</td>
                          <td className="muted">{it.ref || "—"}</td>
                          <td>{it.cor || "—"}</td><td>{it.tamanho || "—"}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{it.qtd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
          <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}>Juntar numa explosão (código pai) pra render mais na tecelagem. Desmembra depois por pedido/loja.</span>
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
