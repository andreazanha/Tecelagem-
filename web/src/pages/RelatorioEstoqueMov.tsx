import { useEffect, useState } from "react";
import { api, type RelEstoqueMov } from "../api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataHora = (em: string) => (em || "").replace("T", " ").slice(0, 16);
const qtdFmt = (n: number) => { const v = Number(n) || 0; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","); };

export function RelatorioEstoqueMov() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [tipo, setTipo] = useState<"" | "entrada" | "saida">("");
  const [classe, setClasse] = useState<"" | "insumo" | "produto">("");
  const [busca, setBusca] = useState("");
  const [usuario, setUsuario] = useState("");
  const [dados, setDados] = useState<RelEstoqueMov | null>(null);
  const [carregando, setCarregando] = useState(true);

  function carregar() {
    setCarregando(true);
    api.relatorioEstoqueMov({ de: de || undefined, ate: ate || undefined, tipo: tipo || undefined, classe: classe || undefined, busca: busca.trim() || undefined, usuario: usuario || undefined })
      .then(setDados).catch(() => setDados(null)).finally(() => setCarregando(false));
  }
  useEffect(() => { const t = setTimeout(carregar, busca ? 350 : 0); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [de, ate, tipo, classe, busca, usuario]);

  function presetDias(dias: number) { const a = new Date(); const d = new Date(); d.setDate(d.getDate() - dias); setDe(iso(d)); setAte(iso(a)); }
  function presetHoje() { const a = iso(new Date()); setDe(a); setAte(a); }
  function tudo() { setDe(""); setAte(""); }

  const r = dados?.resumo;
  const movs = dados?.movimentos || [];
  const usuarios = dados?.usuarios || [];
  const pil = (atual: string, val: string, txt: string, set: (v: string) => void) => (
    <button className={"btn " + (atual === val ? "btn-primary" : "btn-soft")} style={{ padding: "6px 11px" }} onClick={() => set(val)}>{txt}</button>
  );

  return (
    <>
      <div className="page-head"><div><h1>Relatório de Estoque</h1><div className="breadcrumb">Gestão › Relatórios › Entrada e Saída</div></div></div>

      {/* Filtros */}
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="row-gap" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-soft" style={{ padding: "6px 11px" }} onClick={presetHoje}>Hoje</button>
          <button className="btn btn-soft" style={{ padding: "6px 11px" }} onClick={() => presetDias(7)}>7 dias</button>
          <button className="btn btn-soft" style={{ padding: "6px 11px" }} onClick={() => presetDias(30)}>30 dias</button>
          <button className="btn btn-soft" style={{ padding: "6px 11px" }} onClick={tudo}>Tudo</button>
          <span className="muted">·</span>
          <input type="date" className="at-dt" value={de} onChange={(e) => setDe(e.target.value)} />
          <span className="muted">até</span>
          <input type="date" className="at-dt" value={ate} onChange={(e) => setAte(e.target.value)} />
          <span style={{ flex: 1 }} />
          <input placeholder="🔎 Item (ex.: enchimento)…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 180 }} />
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="row-gap" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {pil(tipo, "", "Entradas e saídas", (v) => setTipo(v as ""))}
          {pil(tipo, "entrada", "⬆ Só entradas", (v) => setTipo(v as "entrada"))}
          {pil(tipo, "saida", "⬇ Só saídas", (v) => setTipo(v as "saida"))}
          <span className="muted">·</span>
          {pil(classe, "", "Insumos e produtos", (v) => setClasse(v as ""))}
          {pil(classe, "insumo", "🧵 Insumos", (v) => setClasse(v as "insumo"))}
          {pil(classe, "produto", "📦 Produtos", (v) => setClasse(v as "produto"))}
        </div>
      </div>

      {/* Resumo */}
      <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Movimentos no período</div><div style={{ fontSize: 26, fontWeight: 800 }}>{r?.total ?? 0}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>⬆ Entradas</div><div style={{ fontSize: 26, fontWeight: 800, color: "#15803d" }}>{r?.entradas ?? 0}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>⬇ Saídas</div><div style={{ fontSize: 26, fontWeight: 800, color: "#b91c1c" }}>{r?.saidas ?? 0}</div></div>
      </div>

      {/* Tabela */}
      <div className="card pad">
        {carregando ? <p className="muted pad">Carregando…</p> : movs.length === 0 ? (
          <p className="muted pad">Nenhuma movimentação nesse filtro.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 880 }}>
              <thead><tr>
                <th>Quando</th><th>Item</th><th>Tipo</th><th className="num">Qtd</th>
                <th>Usuário</th><th>Origem</th><th>Pedido</th>
              </tr></thead>
              <tbody>
                {movs.map((m, i) => {
                  const ent = m.tipo === "entrada";
                  return (
                    <tr key={i}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{dataHora(m.data)}</td>
                      <td className="strong">{m.item}
                        <span className="chip" style={{ marginLeft: 6, fontSize: 10, padding: "1px 7px", background: m.classe === "insumo" ? "#eef2ff" : "#fef3e7", color: m.classe === "insumo" ? "#4338ca" : "#9a3412", border: "none" }}>{m.classe === "insumo" ? "insumo" : "produto"}</span>
                      </td>
                      <td style={{ whiteSpace: "nowrap", color: ent ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{ent ? "⬆ Entrada" : "⬇ Saída"}</td>
                      <td className="num" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{qtdFmt(m.qtd)} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{m.unidade}</span></td>
                      <td className="strong">{m.usuario || <span className="muted" style={{ fontWeight: 400 }}>—</span>}</td>
                      <td className="muted">{m.origem || "—"}</td>
                      <td className="muted">{m.pedido || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {movs.length >= 1000 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Mostrando os 1000 movimentos mais recentes. Estreite o período pra ver o resto.</p>}
          </div>
        )}
      </div>
    </>
  );
}
