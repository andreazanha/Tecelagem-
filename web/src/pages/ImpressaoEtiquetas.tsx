import { useEffect, useMemo, useState } from "react";
import { api, type Pedido } from "../api";

type Etq = { cliente: string; modelo: string; tamanho: string | null; cor: string | null; composicao: string | null };

// Impressão de etiquetas dos pedidos em folha A4.
// Você escolhe um ou mais pedidos; o sistema lê os itens de PRODUÇÃO (pronta
// entrega fica de fora), gera uma etiqueta por peça e monta na A4. Dá pra somar
// vários pedidos para aproveitar a folha. (As coordenadas exatas virão depois.)
export function ImpressaoEtiquetas() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [rows, setRows] = useState<{ pedido: string | null; cliente: string; modelo: string; tamanho: string | null; cor: string | null; qtd: number; composicao: string | null }[]>([]);
  const [cols, setCols] = useState(3);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { api.listarPedidos().then(setPedidos).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel.length) { setRows([]); return; }
    setCarregando(true);
    api.etiquetasPedidos(sel).then(setRows).catch(() => setRows([])).finally(() => setCarregando(false));
  }, [sel]);

  // Uma etiqueta por peça (expande pela quantidade).
  const etqs = useMemo<Etq[]>(() => {
    const out: Etq[] = [];
    for (const r of rows) for (let i = 0; i < Math.max(0, Math.trunc(r.qtd)); i++)
      out.push({ cliente: r.cliente, modelo: r.modelo, tamanho: r.tamanho, cor: r.cor, composicao: r.composicao });
    return out;
  }, [rows]);

  const label = (p: Pedido) => `${p.numero_erp || p.codigo_pai || p.id.slice(0, 6)} · ${p.cliente_nome}`;
  const addPedido = (id: string) => { if (id && !sel.includes(id)) setSel((s) => [...s, id]); };
  const removePedido = (id: string) => setSel((s) => s.filter((x) => x !== id));

  function imprimir() {
    const cel = (e: Etq) => `<div class="et">
      <div class="cli">${e.cliente || ""}</div>
      <div class="mod">${e.modelo || ""}</div>
      <div class="lin">Tamanho: <b>${e.tamanho || "—"}</b></div>
      <div class="lin">${e.composicao || ""}</div>
      <div class="lin">Cor: <b>${e.cor || "—"}</b></div>
    </div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      @page { size: A4; margin: 8mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 3mm; }
      .et { border: 1px dashed #999; border-radius: 2mm; padding: 3mm; height: 30mm; display: flex; flex-direction: column; justify-content: center; gap: 0.6mm; overflow: hidden; }
      .cli { font-size: 8pt; color: #333; }
      .mod { font-size: 12pt; font-weight: 800; }
      .lin { font-size: 8.5pt; color: #222; }
      .lin b { font-weight: 700; }
    </style></head><body><div class="grid">${etqs.map(cel).join("")}</div>
    <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Impressão de etiquetas</h1>
          <div className="breadcrumb">Expedição › Etiquetas dos pedidos (A4)</div>
        </div>
      </div>

      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label className="campo" style={{ minWidth: 280 }}>
            <span className="campo-label">Adicionar pedido</span>
            <select value="" onChange={(e) => { addPedido(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">— escolha um pedido —</option>
              {pedidos.filter((p) => !sel.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </select>
          </label>
          <label className="campo" style={{ width: 120 }}>
            <span className="campo-label">Colunas na A4</span>
            <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} disabled={etqs.length === 0} onClick={imprimir}>🖨️ Imprimir A4</button>
        </div>

        {sel.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {sel.map((id) => { const p = pedidos.find((x) => x.id === id); return (
              <span key={id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {p ? label(p) : id}
                <button className="icon-btn" title="Tirar" style={{ padding: 0, lineHeight: 1 }} onClick={() => removePedido(id)}>✕</button>
              </span>
            ); })}
          </div>
        )}

        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {carregando ? "Carregando…" : sel.length === 0 ? "Escolha um ou mais pedidos. Pronta entrega fica de fora." : <>Peças de produção: <strong>{etqs.length}</strong> etiqueta(s) — pronta entrega fica de fora.</>}
        </p>
      </div>

      {/* Prévia da folha A4 (proporcional). As coordenadas exatas serão ajustadas depois. */}
      {etqs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Prévia da folha A4:</div>
          <div className="a4-folha">
            <div className="a4-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {etqs.slice(0, cols * 9).map((e, i) => (
                <div key={i} className="a4-et">
                  <div className="a4-cli">{e.cliente}</div>
                  <div className="a4-mod">{e.modelo}</div>
                  <div className="a4-lin">Tamanho: <b>{e.tamanho || "—"}</b></div>
                  <div className="a4-lin">{e.composicao || ""}</div>
                  <div className="a4-lin">Cor: <b>{e.cor || "—"}</b></div>
                </div>
              ))}
            </div>
            {etqs.length > cols * 9 && <div className="muted" style={{ fontSize: 11, textAlign: "center", padding: 8 }}>… +{etqs.length - cols * 9} etiqueta(s) (continuam na impressão)</div>}
          </div>
        </div>
      )}
    </>
  );
}
