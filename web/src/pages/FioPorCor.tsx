import { useEffect, useMemo, useState } from "react";
import { api, type Cor } from "../api";
import { EstoqueScanner } from "../components/EstoqueScanner";
import { imprimirEtiquetasQR } from "../qrPrint";

// Formata kg com até 3 casas (ex.: 12,5 kg · 0,75 kg).
const kg = (n: number | undefined) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

type Mov = { tipo: string; quantidade: number; motivo: string | null; pedido_id: string | null; criado_em: string };

export function FioPorCor() {
  const [cores, setCores] = useState<Cor[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  // Modal de movimento (entrada/ajuste) e de extrato.
  const [movCor, setMovCor] = useState<Cor | null>(null);
  const [movTipo, setMovTipo] = useState<"entrada" | "ajuste">("entrada");
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [extratoCor, setExtratoCor] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<Mov[]>([]);
  const [scan, setScan] = useState(false);

  function recarregar() { setCarregando(true); api.listarCores().then(setCores).catch(() => {}).finally(() => setCarregando(false)); }
  useEffect(recarregar, []);

  // Só cores com tipo de fio definido (é o estoque de fio). Agrupa por fio.
  const grupos = useMemo(() => {
    const f = busca.trim().toLowerCase();
    const lista = cores.filter((c) => c.fio_nome && `${c.nome} ${c.codigo || ""}`.toLowerCase().includes(f));
    const map = new Map<string, Cor[]>();
    for (const c of lista) { const k = c.fio_nome || "—"; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cores, busca]);

  const totalKg = useMemo(() => cores.reduce((s, c) => s + (Number(c.saldo) || 0), 0), [cores]);
  const nComFio = useMemo(() => cores.filter((c) => c.fio_nome).length, [cores]);

  function abrirMov(cor: Cor, tipo: "entrada" | "ajuste") {
    setMovCor(cor); setMovTipo(tipo);
    setMovQtd(tipo === "ajuste" ? String(cor.saldo ?? 0) : "");
    setMovMotivo("");
  }
  async function salvarMov() {
    if (!movCor) return;
    const q = Number((movQtd || "").replace(",", "."));
    if (isNaN(q) || (movTipo === "entrada" && q <= 0)) { alert("Informe os kg."); return; }
    setSalvando(true);
    try {
      const r = await api.movFio(movCor.nome, { tipo: movTipo, quantidade: q, motivo: movMotivo.trim() || undefined });
      setCores((cs) => cs.map((c) => (c.nome === movCor.nome ? { ...c, saldo: r.saldo } : c)));
      setMovCor(null);
    } catch { alert("Não consegui salvar o movimento."); }
    finally { setSalvando(false); }
  }
  async function abrirExtrato(nome: string) {
    setExtratoCor(nome); setExtrato([]);
    try { setExtrato(await api.movimentosFio(nome)); } catch { /* ignore */ }
  }

  const rotuloMov = (m: Mov) =>
    m.pedido_id ? (m.quantidade < 0 ? `Baixa · pedido ${m.pedido_id}` : `Estorno · pedido ${m.pedido_id}`)
      : m.tipo === "entrada" ? "Entrada" : m.tipo === "baixa" ? "Baixa manual" : "Ajuste";

  return (
    <>
      <div className="page-head"><div><h1>Estoque de fios</h1><div className="breadcrumb">Estoque › Estoque de fios (kg, por cor)</div></div></div>

      <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card pad" style={{ minWidth: 160 }}><div className="muted" style={{ fontSize: 12 }}>Cores com fio</div><div style={{ fontSize: 26, fontWeight: 800 }}>{nComFio}</div></div>
        <div className="card pad" style={{ minWidth: 160 }}><div className="muted" style={{ fontSize: 12 }}>Total em estoque</div><div style={{ fontSize: 26, fontWeight: 800 }}>{kg(totalKg)} <span style={{ fontSize: 14, fontWeight: 600 }}>kg</span></div></div>
      </div>

      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="busca-ped" style={{ flex: 1, minWidth: 200 }} placeholder="🔎 Buscar cor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn btn-soft" onClick={() => setScan(true)}>📷 Escanear</button>
          <button className="btn btn-soft" disabled={cores.filter((c) => c.fio_nome).length === 0} onClick={() => imprimirEtiquetasQR(cores.filter((c) => c.fio_nome).map((c) => ({ url: `${location.origin}/estoque-scan?f=fio&cor=${encodeURIComponent(c.nome)}`, titulo: c.nome, sub: c.fio_nome || "" })))}>🏷️ Imprimir QR</button>
          <span className="muted" style={{ fontSize: 12.5 }}>A baixa por pedido é automática. Escaneie o QR pra dar entrada/saída no celular.</span>
        </div>
        {carregando ? <p className="muted pad">Carregando…</p> : grupos.length === 0 ? (
          <p className="muted pad">Nenhuma cor com tipo de fio definido{busca ? " para essa busca" : ""}. (Defina o tipo de fio das cores no cadastro de Cores.)</p>
        ) : grupos.map(([fio, lista]) => (
          <div key={fio} style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0", color: "var(--accent)" }}>{fio} · {lista.length} cor(es)</div>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 560 }}>
                <thead><tr><th style={{ width: 30 }}></th><th>Cor</th><th>Código</th><th className="num">Saldo (kg)</th><th style={{ width: 260 }}></th></tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.nome}>
                      <td>{c.hex ? <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: 4, background: c.hex, border: "1px solid #0002" }} /> : null}</td>
                      <td className="strong">{c.nome}</td>
                      <td className="muted">{c.codigo || "—"}</td>
                      <td className="num" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: (Number(c.saldo) || 0) <= 0 ? "#b91c1c" : undefined }}>{kg(c.saldo)}</td>
                      <td className="num">
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => abrirMov(c, "entrada")}>+ Entrada</button>
                          <button className="btn btn-soft" style={{ padding: "5px 10px" }} onClick={() => abrirMov(c, "ajuste")}>Ajustar</button>
                          <button className="btn btn-soft" style={{ padding: "5px 10px" }} onClick={() => abrirExtrato(c.nome)}>Extrato</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {scan && <EstoqueScanner onFechar={() => setScan(false)} />}

      {/* Modal entrada/ajuste */}
      {movCor && (
        <div className="modal-bg" onClick={() => setMovCor(null)}>
          <div className="modal-card" style={{ maxWidth: 420, width: "min(420px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{movTipo === "entrada" ? "Entrada de fio" : "Ajustar saldo"} · {movCor.nome}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{movCor.fio_nome} · saldo atual <strong>{kg(movCor.saldo)} kg</strong></p>
            <label className="campo">
              <span className="campo-label">{movTipo === "entrada" ? "Quilos que chegaram (kg)" : "Novo saldo (kg)"}</span>
              <input type="number" min={0} step="any" autoFocus value={movQtd} placeholder="ex.: 12,5" onChange={(e) => setMovQtd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvarMov(); }} />
            </label>
            <label className="campo">
              <span className="campo-label">Observação (opcional)</span>
              <input value={movMotivo} placeholder="ex.: nota 1234 / fornecedor" onChange={(e) => setMovMotivo(e.target.value)} />
            </label>
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
              <button className="btn btn-soft" onClick={() => setMovCor(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvarMov}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal extrato */}
      {extratoCor && (
        <div className="modal-bg" onClick={() => setExtratoCor(null)}>
          <div className="modal-card" style={{ maxWidth: 520, width: "min(520px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Extrato · {extratoCor}</h2>
            {extrato.length === 0 ? <p className="muted">Sem movimentos ainda.</p> : (
              <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
                <table className="table">
                  <thead><tr><th>Quando</th><th>Movimento</th><th className="num">kg</th></tr></thead>
                  <tbody>
                    {extrato.map((m, i) => (
                      <tr key={i}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{(m.criado_em || "").replace("T", " ").slice(0, 16)}</td>
                        <td>{rotuloMov(m)}{m.motivo ? <span className="muted"> · {m.motivo}</span> : ""}</td>
                        <td className="num" style={{ fontWeight: 700, color: m.quantidade < 0 ? "#b91c1c" : "#15803d", fontVariantNumeric: "tabular-nums" }}>{m.quantidade > 0 ? "+" : ""}{kg(m.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-soft" onClick={() => setExtratoCor(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
