import { useEffect, useMemo, useState } from "react";
import { api, type Material, type MaterialCategoriaDef } from "../api";
import { EstoqueScanner } from "../components/EstoqueScanner";
import { imprimirEtiquetasQR } from "../qrPrint";

const nf = (n: number | undefined) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
type Mov = { tipo: string; quantidade: number; motivo: string | null; pedido_id: string | null; fonte: string | null; criado_em: string };

export function EstoqueMateriais() {
  const [cats, setCats] = useState<MaterialCategoriaDef[]>([]);
  const [cat, setCat] = useState<string>("");
  const [itens, setItens] = useState<Material[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mov, setMov] = useState<Material | null>(null);
  const [movTipo, setMovTipo] = useState<"entrada" | "ajuste">("entrada");
  const [movAlvo, setMovAlvo] = useState<"saldo" | "caixas">("saldo");
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [extratoNome, setExtratoNome] = useState("");
  const [extrato, setExtrato] = useState<Mov[]>([]);
  const [scan, setScan] = useState(false);

  useEffect(() => {
    api.listarCategoriasMaterial().then((cs) => {
      setCats(cs);
      setCat((atual) => atual || (cs.find((c) => (c.itens || 0) > 0)?.slug ?? cs[0]?.slug ?? ""));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!cat) { setItens([]); return; }
    setCarregando(true);
    api.listarMateriais(cat).then(setItens).catch(() => setItens([])).finally(() => setCarregando(false));
  }, [cat]);

  const catNome = cats.find((c) => c.slug === cat)?.nome || "material";
  const temCor = itens.some((m) => m.cor);
  const temTam = itens.some((m) => m.tamanho);
  const temCod = itens.some((m) => m.codigo);

  const lista = useMemo(() => {
    const f = busca.trim().toLowerCase();
    return itens.filter((m) => `${m.cor || ""} ${m.nome} ${m.tamanho || ""} ${m.codigo || ""}`.toLowerCase().includes(f))
      .sort((a, b) => (a.cor || a.nome).localeCompare(b.cor || b.nome) || (a.tamanho || "").localeCompare(b.tamanho || ""));
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
  const idDe = (m: Material) => [m.cor, m.tamanho].filter(Boolean).join(" · ") || m.nome;
  async function abrirExtrato(m: Material) {
    setExtratoId(m.id); setExtratoNome(idDe(m)); setExtrato([]);
    try { setExtrato(await api.movimentosMaterial(m.id)); } catch { /* ignore */ }
  }
  const rotuloMov = (m: Mov) =>
    (m.pedido_id ? (m.quantidade < 0 ? `Baixa · pedido ${m.pedido_id}` : `Estorno · pedido ${m.pedido_id}`)
      : m.tipo === "entrada" ? "Entrada" : m.tipo === "baixa" ? "Baixa manual" : "Ajuste")
    + (m.fonte === "caixas" ? " (caixas)" : "");

  return (
    <>
      <div className="page-head"><div><h1>Estoque de materiais</h1><div className="breadcrumb">Estoque › Materiais (por categoria)</div></div></div>

      {/* Seletor de categoria */}
      <div className="row-gap" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {cats.map((c) => (
          <button key={c.slug} className={"btn " + (c.slug === cat ? "btn-primary" : "btn-soft")} style={{ padding: "8px 14px" }} onClick={() => { setCat(c.slug); setBusca(""); }}>
            {c.icone ? c.icone + " " : ""}{c.nome}{typeof c.itens === "number" ? ` (${c.itens})` : ""}
          </button>
        ))}
      </div>

      <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Itens</div><div style={{ fontSize: 26, fontWeight: 800 }}>{itens.length}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Total em unidades</div><div style={{ fontSize: 26, fontWeight: 800 }}>{nf(totalUn)}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Total em caixas</div><div style={{ fontSize: 26, fontWeight: 800 }}>{nf(totalCx)}</div></div>
      </div>

      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="busca-ped" style={{ flex: 1, minWidth: 200 }} placeholder={`🔎 Buscar em ${catNome}…`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn btn-soft" onClick={() => setScan(true)}>📷 Escanear</button>
          <button className="btn btn-soft" disabled={lista.length === 0} onClick={() => imprimirEtiquetasQR(lista.map((m) => ({ url: `${location.origin}/estoque-scan?f=material&id=${encodeURIComponent(m.id)}`, titulo: (m.cor || m.nome), sub: [m.tamanho, m.codigo].filter(Boolean).join(" · ") })))}>🏷️ Imprimir QR</button>
          <span className="muted" style={{ fontSize: 12.5 }}>A baixa por pedido é automática. Escaneie o QR pra dar entrada/saída no celular.</span>
        </div>
        {carregando ? <p className="muted pad">Carregando…</p> : lista.length === 0 ? (
          <p className="muted pad">Nenhum item em {catNome}{busca ? " para essa busca" : ""}. (Cadastre em Cadastros › Materiais.)</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr>
                {temCor && <th style={{ width: 24 }}></th>}
                <th>{temCor ? "Cor" : "Item"}</th>
                {temTam && <th>Tamanho</th>}
                {temCod && <th>Código</th>}
                <th className="num">Un.</th><th className="num">Caixas</th><th style={{ width: 200 }}></th>
              </tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    {temCor && <td>{m.cor_hex ? <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: 4, background: m.cor_hex, border: "1px solid #0002" }} /> : null}</td>}
                    <td className="strong">{temCor ? (m.cor || m.nome) : m.nome}</td>
                    {temTam && <td className="muted">{m.tamanho || "—"}</td>}
                    {temCod && <td className="muted">{m.codigo || "—"}</td>}
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
        )}
      </div>

      {scan && <EstoqueScanner onFechar={() => setScan(false)} />}

      {/* Modal entrada/ajuste */}
      {mov && (
        <div className="modal-bg" onClick={() => setMov(null)}>
          <div className="modal-card" style={{ maxWidth: 440, width: "min(440px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{movTipo === "entrada" ? "Entrada" : "Ajustar saldo"} · {idDe(mov)}</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{catNome} · saldo: <strong>{nf(mov.saldo)} un</strong> · <strong>{nf(mov.caixas)} cx</strong></p>
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
