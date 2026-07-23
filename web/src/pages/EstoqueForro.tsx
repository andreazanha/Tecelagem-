import { useEffect, useMemo, useState } from "react";
import { api, type Material } from "../api";

const nf = (n: number | undefined) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
type Mov = { tipo: string; quantidade: number; motivo: string | null; pedido_id: string | null; fonte: string | null; criado_em: string };

export function EstoqueForro() {
  const [itens, setItens] = useState<Material[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [mov, setMov] = useState<Material | null>(null);
  const [movTipo, setMovTipo] = useState<"entrada" | "ajuste">("entrada");
  const [movAlvo, setMovAlvo] = useState<"saldo" | "caixas">("saldo");
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [extratoNome, setExtratoNome] = useState("");
  const [extrato, setExtrato] = useState<Mov[]>([]);

  function recarregar() { setCarregando(true); api.listarMateriais("forro").then(setItens).catch(() => {}).finally(() => setCarregando(false)); }
  useEffect(recarregar, []);

  // Agrupa por cor; dentro, ordena por tamanho.
  const grupos = useMemo(() => {
    const f = busca.trim().toLowerCase();
    const lista = itens.filter((m) => `${m.cor || m.nome} ${m.tamanho || ""} ${m.codigo || ""}`.toLowerCase().includes(f));
    const map = new Map<string, Material[]>();
    for (const m of lista) { const k = m.cor || m.nome || "—"; if (!map.has(k)) map.set(k, []); map.get(k)!.push(m); }
    for (const arr of map.values()) arr.sort((a, b) => (a.tamanho || "").localeCompare(b.tamanho || ""));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens, busca]);
  const totalUn = useMemo(() => itens.reduce((s, m) => s + (Number(m.saldo) || 0), 0), [itens]);
  const totalCx = useMemo(() => itens.reduce((s, m) => s + (Number(m.caixas) || 0), 0), [itens]);

  function abrirMov(m: Material, tipo: "entrada" | "ajuste", alvo: "saldo" | "caixas") {
    setMov(m); setMovTipo(tipo); setMovAlvo(alvo);
    setMovQtd(tipo === "ajuste" ? String((alvo === "caixas" ? m.caixas : m.saldo) ?? 0) : "");
    setMovMotivo("");
  }
  async function salvarMov() {
    if (!mov) return;
    const q = Number((movQtd || "").replace(",", "."));
    if (isNaN(q) || (movTipo === "entrada" && q <= 0)) { alert("Informe a quantidade."); return; }
    setSalvando(true);
    try {
      const r = await api.movMaterial(mov.id, { tipo: movTipo, quantidade: q, alvo: movAlvo, motivo: movMotivo.trim() || undefined });
      setItens((xs) => xs.map((x) => (x.id === mov.id ? { ...x, saldo: r.saldo, caixas: r.caixas } : x)));
      setMov(null);
    } catch { alert("Não consegui salvar o movimento."); }
    finally { setSalvando(false); }
  }
  async function abrirExtrato(m: Material) {
    setExtratoId(m.id); setExtratoNome(`${m.cor || m.nome} · ${m.tamanho || "—"}`); setExtrato([]);
    try { setExtrato(await api.movimentosMaterial(m.id)); } catch { /* ignore */ }
  }
  const rotuloMov = (m: Mov) =>
    (m.pedido_id ? (m.quantidade < 0 ? `Baixa · pedido ${m.pedido_id}` : `Estorno · pedido ${m.pedido_id}`)
      : m.tipo === "entrada" ? "Entrada" : m.tipo === "baixa" ? "Baixa manual" : "Ajuste")
    + (m.fonte === "caixas" ? " (caixas)" : "");

  return (
    <>
      <div className="page-head"><div><h1>Estoque de forro</h1><div className="breadcrumb">Estoque › Forro (por cor e tamanho)</div></div></div>

      <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Itens de forro</div><div style={{ fontSize: 26, fontWeight: 800 }}>{itens.length}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Total em unidades</div><div style={{ fontSize: 26, fontWeight: 800 }}>{nf(totalUn)}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Total em caixas</div><div style={{ fontSize: 26, fontWeight: 800 }}>{nf(totalCx)}</div></div>
      </div>

      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="busca-ped" style={{ flex: 1, minWidth: 220 }} placeholder="🔎 Buscar cor ou tamanho…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="muted" style={{ fontSize: 12.5 }}>A baixa por pedido é automática. Aqui você dá entrada, ajusta e vê o extrato.</span>
        </div>
        {carregando ? <p className="muted pad">Carregando…</p> : grupos.length === 0 ? (
          <p className="muted pad">Nenhum forro cadastrado{busca ? " para essa busca" : ""}. (Cadastre os forros em Materiais › Forro.)</p>
        ) : grupos.map(([cor, lista]) => (
          <div key={cor} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, margin: "6px 0", color: "var(--accent)" }}>
              {lista[0]?.cor_hex ? <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 4, background: lista[0].cor_hex, border: "1px solid #0002" }} /> : null}
              {cor} · {lista.length} tamanho(s)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 620 }}>
                <thead><tr><th>Tamanho</th><th>Código</th><th className="num">Un.</th><th className="num">Caixas</th><th style={{ width: 200 }}></th></tr></thead>
                <tbody>
                  {lista.map((m) => (
                    <tr key={m.id}>
                      <td className="strong">{m.tamanho || "—"}</td>
                      <td className="muted">{m.codigo || "—"}</td>
                      <td className="num" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: (Number(m.saldo) || 0) <= 0 ? "#b91c1c" : undefined }}>{nf(m.saldo)}</td>
                      <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{nf(m.caixas)}</td>
                      <td className="num">
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: "5px 9px" }} onClick={() => abrirMov(m, "entrada", "saldo")}>+ Entrada</button>
                          <button className="btn btn-soft" style={{ padding: "5px 9px" }} onClick={() => abrirMov(m, "ajuste", "saldo")}>Ajustar</button>
                          <button className="btn btn-soft" style={{ padding: "5px 9px" }} onClick={() => abrirExtrato(m)}>Extrato</button>
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

      {/* Modal entrada/ajuste */}
      {mov && (
        <div className="modal-bg" onClick={() => setMov(null)}>
          <div className="modal-card" style={{ maxWidth: 440, width: "min(440px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{movTipo === "entrada" ? "Entrada de forro" : "Ajustar saldo"} · {mov.cor || mov.nome} {mov.tamanho ? `· ${mov.tamanho}` : ""}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>saldo: <strong>{nf(mov.saldo)} un</strong> · <strong>{nf(mov.caixas)} cx</strong></p>
            <label className="campo">
              <span className="campo-label">Contar em</span>
              <select value={movAlvo} onChange={(e) => { const a = e.target.value as "saldo" | "caixas"; setMovAlvo(a); if (movTipo === "ajuste") setMovQtd(String((a === "caixas" ? mov.caixas : mov.saldo) ?? 0)); }}>
                <option value="saldo">Unidades</option>
                <option value="caixas">Caixas</option>
              </select>
            </label>
            <label className="campo">
              <span className="campo-label">{movTipo === "entrada" ? `Quantidade que chegou (${movAlvo === "caixas" ? "caixas" : "un"})` : `Novo saldo (${movAlvo === "caixas" ? "caixas" : "un"})`}</span>
              <input type="number" min={0} step="any" autoFocus value={movQtd} placeholder="ex.: 200" onChange={(e) => setMovQtd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvarMov(); }} />
            </label>
            <label className="campo">
              <span className="campo-label">Observação (opcional)</span>
              <input value={movMotivo} placeholder="ex.: nota 1234 / fornecedor" onChange={(e) => setMovMotivo(e.target.value)} />
            </label>
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
              <button className="btn btn-soft" onClick={() => setMov(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvarMov}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal extrato */}
      {extratoId && (
        <div className="modal-bg" onClick={() => setExtratoId(null)}>
          <div className="modal-card" style={{ maxWidth: 540, width: "min(540px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Extrato · {extratoNome}</h2>
            {extrato.length === 0 ? <p className="muted">Sem movimentos ainda.</p> : (
              <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
                <table className="table">
                  <thead><tr><th>Quando</th><th>Movimento</th><th className="num">Qtd</th></tr></thead>
                  <tbody>
                    {extrato.map((m, i) => (
                      <tr key={i}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{(m.criado_em || "").replace("T", " ").slice(0, 16)}</td>
                        <td>{rotuloMov(m)}{m.motivo ? <span className="muted"> · {m.motivo}</span> : ""}</td>
                        <td className="num" style={{ fontWeight: 700, color: m.quantidade < 0 ? "#b91c1c" : "#15803d", fontVariantNumeric: "tabular-nums" }}>{m.quantidade > 0 ? "+" : ""}{nf(m.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-soft" onClick={() => setExtratoId(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
