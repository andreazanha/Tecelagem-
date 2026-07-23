import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api";

// Tela alvo do QR (via celular): mostra o item e o saldo, e você registra
// ENTRADA ou SAÍDA digitando a quantidade. Params: ?f=fio&cor=Areia
// ou ?f=material&id=<id>. O QR guarda a URL desta tela.
const nf = (n: number | undefined) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

type Item = { chave: string; titulo: string; sub: string; saldo: number; caixas: number | null; unidade: string };

export function EstoqueScan() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const f = (sp.get("f") || "").toLowerCase();
  const id = sp.get("id") || "";
  const cor = sp.get("cor") || "";

  const [item, setItem] = useState<Item | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tipo, setTipo] = useState<"entrada" | "baixa">("entrada");
  const [alvo, setAlvo] = useState<"saldo" | "caixas">("saldo");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<string>("");

  async function carregar() {
    setCarregando(true); setErro(""); setFeito("");
    try {
      if (f === "fio") {
        const cs = await api.listarCores();
        const c = cs.find((x) => x.nome === cor);
        if (!c) { setErro(`Cor "${cor}" não encontrada.`); setItem(null); }
        else setItem({ chave: c.nome, titulo: c.nome, sub: `Fio ${c.fio_nome || ""}`.trim(), saldo: Number(c.saldo) || 0, caixas: null, unidade: "kg" });
      } else if (f === "material") {
        const ms = await api.listarMateriais();
        const m = ms.find((x) => x.id === id);
        if (!m) { setErro("Material não encontrado."); setItem(null); }
        else setItem({ chave: m.id, titulo: [m.cor, m.tamanho].filter(Boolean).join(" · ") || m.nome, sub: m.categoria || "", saldo: Number(m.saldo) || 0, caixas: Number(m.caixas) || 0, unidade: "un" });
      } else { setErro("QR inválido."); setItem(null); }
    } catch { setErro("Não consegui carregar o item."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [f, id, cor]);

  const podeCaixas = item?.caixas != null;
  const unidadeLabel = useMemo(() => (item?.unidade === "kg" ? "kg" : alvo === "caixas" ? "caixas" : "un"), [item, alvo]);

  async function confirmar() {
    if (!item) return;
    const q = Number((qtd || "").replace(",", "."));
    if (isNaN(q) || q <= 0) { alert("Digite a quantidade."); return; }
    setSalvando(true);
    try {
      if (f === "fio") {
        const r = await api.movFio(item.chave, { tipo, quantidade: q, motivo: motivo.trim() || undefined });
        setItem({ ...item, saldo: r.saldo });
      } else {
        const r = await api.movMaterial(item.chave, { tipo, quantidade: q, alvo, motivo: motivo.trim() || undefined });
        setItem({ ...item, saldo: r.saldo, caixas: r.caixas });
      }
      setFeito(`${tipo === "entrada" ? "Entrada" : "Saída"} de ${nf(q)} ${unidadeLabel} registrada.`);
      setQtd(""); setMotivo("");
    } catch { alert("Não consegui registrar. Tente de novo."); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "18px 16px 40px" }}>
      <div className="page-head" style={{ marginBottom: 12 }}><div><h1 style={{ fontSize: 22 }}>Estoque · escaneado</h1></div></div>

      {carregando ? <p className="muted">Carregando…</p> : erro ? (
        <div className="card pad">
          <p className="erro" style={{ margin: 0 }}>{erro}</p>
          <div style={{ marginTop: 14 }}><button className="btn btn-soft" onClick={() => nav("/estoque-materiais")}>Ir para o estoque</button></div>
        </div>
      ) : item && (
        <div className="card pad">
          <div style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{item.sub}</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: "2px 0 10px" }}>{item.titulo}</div>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 16 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Saldo atual</div><div style={{ fontSize: 30, fontWeight: 800 }}>{nf(item.saldo)} <span style={{ fontSize: 15 }}>{item.unidade}</span></div></div>
            {podeCaixas && <div><div className="muted" style={{ fontSize: 12 }}>Caixas</div><div style={{ fontSize: 22, fontWeight: 700 }}>{nf(item.caixas ?? 0)}</div></div>}
          </div>

          {feito && <div style={{ background: "#ecfdf5", color: "#047857", fontWeight: 700, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>✓ {feito}</div>}

          {/* Entrada / Saída */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <button className={"btn " + (tipo === "entrada" ? "btn-primary" : "btn-soft")} style={{ padding: "12px" }} onClick={() => setTipo("entrada")}>➕ Entrada</button>
            <button className={"btn " + (tipo === "baixa" ? "btn-primary" : "btn-soft")} style={{ padding: "12px" }} onClick={() => setTipo("baixa")}>➖ Saída</button>
          </div>

          {podeCaixas && (
            <label className="campo"><span className="campo-label">Contar em</span>
              <select value={alvo} onChange={(e) => setAlvo(e.target.value as "saldo" | "caixas")}>
                <option value="saldo">Unidades</option><option value="caixas">Caixas</option>
              </select>
            </label>
          )}
          <label className="campo"><span className="campo-label">Quantidade ({unidadeLabel})</span>
            <input type="number" inputMode="decimal" min={0} step="any" autoFocus value={qtd} placeholder="0" style={{ fontSize: 22, padding: "12px 14px" }} onChange={(e) => setQtd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} />
          </label>
          <label className="campo"><span className="campo-label">Observação (opcional)</span>
            <input value={motivo} placeholder="ex.: nota / fornecedor" onChange={(e) => setMotivo(e.target.value)} />
          </label>

          <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 16, marginTop: 6 }} disabled={salvando} onClick={confirmar}>
            {salvando ? "Salvando…" : `Confirmar ${tipo === "entrada" ? "entrada" : "saída"}`}
          </button>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button className="btn btn-soft" onClick={() => nav(f === "fio" ? "/fio-por-cor" : "/estoque-materiais")}>Ir para o estoque</button>
          </div>
        </div>
      )}
    </div>
  );
}
