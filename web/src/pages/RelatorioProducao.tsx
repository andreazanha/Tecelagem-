import { useEffect, useMemo, useState } from "react";
import { api, type RelProducaoDetalhado, type RelProdEvento } from "../api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
// Rótulo amigável de cada fase (setor).
const SETORES: { id: string; label: string }[] = [
  { id: "", label: "Todas as fases" },
  { id: "tecelagem", label: "Tecelagem" },
  { id: "corte", label: "Corte" },
  { id: "costura", label: "Costura" },
  { id: "revisao", label: "Revisão" },
  { id: "passadoria", label: "Passadoria" },
  { id: "expedicao", label: "Expedição" },
  { id: "estoque", label: "Estoque" },
  { id: "transporte", label: "Transporte" },
];
const rotSetor = (s: string) => SETORES.find((x) => x.id === s)?.label || (s || "—");
// status da produção → ação legível.
const rotAcao = (st: string) =>
  st === "fazendo" ? "▶ Iniciou" : st === "pronto" ? "✓ Finalizou" : st === "defeito" ? "⚠ Defeito" : st === "aguardando" ? "→ Enviou/Fila" : st;
// duração em segundos → texto curto.
function dur(ev: RelProdEvento): string {
  if (ev.status !== "pronto") return "—";
  if (ev.duracao_seg == null) return "não iniciou";
  const s = ev.duracao_seg;
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
const dataHora = (em: string) => (em || "").replace("T", " ").slice(0, 16);
const pedidoLabel = (ev: RelProdEvento) => ev.codigo_pai ? `Explosão ${ev.codigo_pai}` : (ev.numero_erp || ev.pedido_id.slice(0, 6));

export function RelatorioProducao() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [setor, setSetor] = useState("");
  const [operador, setOperador] = useState("");
  const [flag, setFlag] = useState<"" | "irregular" | "suspeito" | "fora">("");
  const [dados, setDados] = useState<RelProducaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);

  function carregar() {
    setCarregando(true);
    api.relatorioProducaoDetalhado({ de: de || undefined, ate: ate || undefined, setor: setor || undefined, operador: operador.trim() || undefined, flag: flag || undefined })
      .then(setDados).catch(() => setDados(null)).finally(() => setCarregando(false));
  }
  // Recarrega quando muda qualquer filtro (operador com um pequeno atraso pra não bater a cada tecla).
  useEffect(() => { const t = setTimeout(carregar, operador ? 350 : 0); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [de, ate, setor, operador, flag]);

  function presetDias(dias: number) { const a = new Date(); const d = new Date(); d.setDate(d.getDate() - dias); setDe(iso(d)); setAte(iso(a)); }
  function presetHoje() { const a = iso(new Date()); setDe(a); setAte(a); }
  function tudo() { setDe(""); setAte(""); }

  const r = dados?.resumo;
  const evs = dados?.eventos || [];
  const pilFlag = (id: typeof flag, txt: string) => (
    <button className={"btn " + (flag === id ? "btn-primary" : "btn-soft")} style={{ padding: "6px 11px" }} onClick={() => setFlag(id)}>{txt}</button>
  );

  return (
    <>
      <div className="page-head"><div><h1>Relatório de Produção</h1><div className="breadcrumb">Gestão › Relatórios › Produção (detalhado)</div></div></div>

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
          <select value={setor} onChange={(e) => setSetor(e.target.value)}>
            {SETORES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input placeholder="🔎 Pessoa (operador)…" value={operador} onChange={(e) => setOperador(e.target.value)} style={{ minWidth: 180 }} />
        </div>
        <div className="row-gap" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {pilFlag("", "Todas as ações")}
          {pilFlag("irregular", "⚠️ Só irregularidades")}
          {pilFlag("suspeito", "⏱️ Conclusões instantâneas")}
          {pilFlag("fora", "🚫 Fora do setor")}
        </div>
      </div>

      {/* Resumo */}
      <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Ações no período</div><div style={{ fontSize: 26, fontWeight: 800 }}>{r?.total ?? 0}</div></div>
        <div className="card pad" style={{ minWidth: 150, background: (r?.suspeitos || 0) > 0 ? "#fef2f2" : undefined }}><div className="muted" style={{ fontSize: 12 }}>⏱️ Instantâneas</div><div style={{ fontSize: 26, fontWeight: 800, color: (r?.suspeitos || 0) > 0 ? "#b91c1c" : undefined }}>{r?.suspeitos ?? 0}</div></div>
        <div className="card pad" style={{ minWidth: 150, background: (r?.fora || 0) > 0 ? "#fef2f2" : undefined }}><div className="muted" style={{ fontSize: 12 }}>🚫 Fora do setor</div><div style={{ fontSize: 26, fontWeight: 800, color: (r?.fora || 0) > 0 ? "#b91c1c" : undefined }}>{r?.fora ?? 0}</div></div>
        <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Pessoas</div><div style={{ fontSize: 26, fontWeight: 800 }}>{r?.pessoas ?? 0}</div></div>
      </div>

      {/* Tabela detalhada */}
      <div className="card pad">
        {carregando ? <p className="muted pad">Carregando…</p> : evs.length === 0 ? (
          <p className="muted pad">Nenhuma ação registrada nesse filtro.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 860 }}>
              <thead><tr>
                <th>Quando</th><th>Pedido / OP</th><th>Parte</th><th>Fase</th><th>Ação</th>
                <th>Quem</th><th>Setor da pessoa</th><th className="num">Duração</th><th>Alertas</th>
              </tr></thead>
              <tbody>
                {evs.map((ev) => {
                  const quem = (ev.agente || ev.operador || "—");
                  const irregular = ev.suspeito || ev.fora_setor;
                  return (
                    <tr key={ev.id} style={irregular ? { background: "#fff7f7" } : undefined}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{dataHora(ev.em)}</td>
                      <td className="strong">{pedidoLabel(ev)}{ev.cliente_nome ? <span className="muted" style={{ fontWeight: 400 }}> · {ev.cliente_nome}</span> : ""}</td>
                      <td className="muted">{ev.parte}</td>
                      <td>{rotSetor(ev.setor)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{rotAcao(ev.status)}</td>
                      <td className="strong">{quem}</td>
                      <td className="muted">{ev.agente_setor ? rotSetor(ev.agente_setor) : "—"}</td>
                      <td className="num" style={{ fontVariantNumeric: "tabular-nums", color: ev.suspeito ? "#b91c1c" : undefined, fontWeight: ev.suspeito ? 700 : 400 }}>{dur(ev)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {ev.suspeito ? <span className="chip" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: 11, padding: "1px 7px", marginRight: 4 }}>⏱️ instantânea</span> : null}
                        {ev.fora_setor ? <span className="chip" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: 11, padding: "1px 7px" }}>🚫 fora do setor</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {evs.length >= 1000 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Mostrando as 1000 ações mais recentes. Estreite o período pra ver o resto.</p>}
          </div>
        )}
      </div>
    </>
  );
}
