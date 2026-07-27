import { useEffect, useMemo, useState } from "react";
import { api, type MaquinaTec, type MotivoTec, type ResumoTec } from "../api";
import { getUser } from "../auth";

// ── Entrada de tempo "odômetro": digita só números e vira H:MM (130 → 1:30). ──
// O valor guardado é sempre em MINUTOS. Sem precisar digitar os dois-pontos.
function TimeInput({ minutos, onChange, style }: { minutos: number; onChange: (m: number) => void; style?: React.CSSProperties }) {
  const display = minutos > 0 ? `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}` : "";
  const toMin = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(-4); // mantém os últimos 4 dígitos (HHMM)
    if (!d) return 0;
    const p = d.padStart(3, "0");
    return parseInt(p.slice(0, -2), 10) * 60 + parseInt(p.slice(-2), 10);
  };
  return (
    <input inputMode="numeric" value={display} placeholder="0:00"
      onChange={(e) => onChange(toMin(e.target.value))}
      style={{ width: 74, textAlign: "center", fontVariantNumeric: "tabular-nums", ...style }} />
  );
}

const p2 = (n: number) => String(n).padStart(2, "0");
const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const mesStr = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
// Minutos → "1h30" / "45min" / "—".
const fmtMin = (m: number) => {
  if (!m) return "—";
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? (mm ? `${h}h${p2(mm)}` : `${h}h`) : `${mm}min`;
};

export function ControleTecelagem() {
  const [aba, setAba] = useState<"registrar" | "resumo">("registrar");
  const [maquinas, setMaquinas] = useState<MaquinaTec[]>([]);
  const [motivos, setMotivos] = useState<MotivoTec[]>([]);
  const [gerMaq, setGerMaq] = useState(false);
  const [gerMot, setGerMot] = useState(false);

  const carregarBase = () => {
    api.listarMaquinasTec().then(setMaquinas).catch(() => {});
    api.listarMotivosTec().then(setMotivos).catch(() => {});
  };
  useEffect(carregarBase, []);

  return (
    <>
      <div className="page-head"><div><h1>Controle da Tecelagem</h1><div className="breadcrumb">Produção › Eficiência das máquinas</div></div></div>

      <div className="row-gap" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button className={"btn " + (aba === "registrar" ? "btn-primary" : "btn-soft")} onClick={() => setAba("registrar")}>📝 Registrar</button>
        <button className={"btn " + (aba === "resumo" ? "btn-primary" : "btn-soft")} onClick={() => setAba("resumo")}>📊 Resumo mensal</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-soft" onClick={() => setGerMaq(true)}>🧵 Máquinas</button>
          <button className="btn btn-soft" onClick={() => setGerMot(true)}>🗂️ Motivos</button>
        </div>
      </div>

      {aba === "registrar"
        ? <Registrar maquinas={maquinas} motivos={motivos} />
        : <Resumo maquinas={maquinas} motivos={motivos} />}

      {gerMaq && <GerenciarMaquinas maquinas={maquinas} onFechar={() => setGerMaq(false)} onMudou={carregarBase} />}
      {gerMot && <GerenciarMotivos motivos={motivos} onFechar={() => setGerMot(false)} onMudou={carregarBase} />}
    </>
  );
}

// ═══════════════════════════ Aba REGISTRAR ═══════════════════════════
function Registrar({ maquinas, motivos }: { maquinas: MaquinaTec[]; motivos: MotivoTec[] }) {
  const [maquinaId, setMaquinaId] = useState("");
  const [data, setData] = useState(hojeStr());
  const [turno, setTurno] = useState<"manha" | "tarde">("manha");
  const [percentual, setPercentual] = useState("");
  const [paradas, setParadas] = useState<Record<string, number>>({});
  const [obs, setObs] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { if (!maquinaId && maquinas[0]) setMaquinaId(maquinas[0].id); }, [maquinas, maquinaId]);

  // Carrega o registro do turno escolhido (se já existir) pra editar.
  useEffect(() => {
    if (!maquinaId || !data || !turno) return;
    setCarregando(true); setMsg("");
    api.getRegistroTec(maquinaId, data, turno)
      .then((r) => { setPercentual(r.registro?.percentual != null ? String(r.registro.percentual) : ""); setParadas(r.paradas || {}); setObs(r.registro?.obs || ""); })
      .catch(() => { setPercentual(""); setParadas({}); setObs(""); })
      .finally(() => setCarregando(false));
  }, [maquinaId, data, turno]);

  const paradasN = motivos.filter((m) => m.tipo === "parada");
  const limpeza = motivos.find((m) => m.tipo === "limpeza");
  const manut = motivos.find((m) => m.tipo === "manutencao");
  const setMin = (cod: string, m: number) => setParadas((p) => ({ ...p, [cod]: m }));

  const totalParada = useMemo(() => paradasN.reduce((s, m) => s + (paradas[m.codigo] || 0), 0), [paradasN, paradas]);
  const totalLimp = limpeza ? (paradas[limpeza.codigo] || 0) : 0;
  const totalManut = manut ? (paradas[manut.codigo] || 0) : 0;

  async function salvar() {
    if (!maquinaId) { setMsg("Escolha a máquina."); return; }
    setSalvando(true); setMsg("");
    try {
      const pct = percentual.trim() === "" ? null : Number(percentual.replace(",", "."));
      await api.salvarRegistroTec({ maquina_id: maquinaId, data, turno, percentual: pct, operador: getUser()?.nome || "", obs: obs.trim(), paradas });
      setMsg("✓ Salvo!");
      setTimeout(() => setMsg(""), 2500);
    } catch { setMsg("Não consegui salvar. Tente de novo."); }
    finally { setSalvando(false); }
  }

  if (!maquinas.length) return <div className="card pad muted">Nenhuma máquina cadastrada ainda. Clique em <strong>🧵 Máquinas</strong> acima para adicionar.</div>;

  return (
    <>
      <div className="card pad">
        <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="campo" style={{ minWidth: 200, margin: 0 }}>
            <span className="campo-label">Máquina</span>
            <select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}>
              {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <label className="campo" style={{ minWidth: 150, margin: 0 }}>
            <span className="campo-label">Dia</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-label">Turno</span>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <button type="button" className={"btn " + (turno === "manha" ? "btn-primary" : "btn-soft")} style={{ padding: "9px 16px" }} onClick={() => setTurno("manha")}>☀️ Manhã</button>
              <button type="button" className={"btn " + (turno === "tarde" ? "btn-primary" : "btn-soft")} style={{ padding: "9px 16px" }} onClick={() => setTurno("tarde")}>🌆 Tarde</button>
            </span>
          </label>
          <label className="campo" style={{ minWidth: 150, margin: 0 }} title="A % que aparece no painel da máquina.">
            <span className="campo-label">% da máquina</span>
            <input type="number" min={0} max={100} step="any" value={percentual} placeholder="ex.: 92" onChange={(e) => setPercentual(e.target.value)}
              style={{ fontWeight: 800, fontSize: 18 }} />
          </label>
        </div>
        {carregando && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Carregando…</p>}
      </div>

      {/* Motivos de parada — cada um com seu tempo (digite só números: 130 = 1:30) */}
      <div className="card pad" style={{ marginTop: 14 }}>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <strong>⏱️ Tempo parado por motivo</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>Digite só números — <b>130</b> vira <b>1:30</b>. Deixe em branco o que não parou.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {paradasN.map((m) => (
            <label key={m.codigo} className="campo" style={{ margin: 0, gap: 4 }}>
              <span className="campo-label" style={{ textTransform: "uppercase", letterSpacing: ".03em" }}>{m.nome || m.codigo}</span>
              <TimeInput minutos={paradas[m.codigo] || 0} onChange={(v) => setMin(m.codigo, v)} style={{ width: "100%", padding: "10px 12px", fontSize: 17 }} />
            </label>
          ))}
        </div>

        {/* Paradas justificadas — não descontam da bonificação */}
        {(limpeza || manut) && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--line, #e2e8f0)" }}>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Paradas justificadas (não contam contra a máquina):</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {limpeza && (
                <label className="campo" style={{ margin: 0, gap: 4, minWidth: 150 }}>
                  <span className="campo-label">🧹 {limpeza.nome || "Limpeza"}</span>
                  <TimeInput minutos={paradas[limpeza.codigo] || 0} onChange={(v) => setMin(limpeza.codigo, v)} style={{ width: "100%", padding: "10px 12px", fontSize: 17 }} />
                </label>
              )}
              {manut && (
                <label className="campo" style={{ margin: 0, gap: 4, minWidth: 150 }}>
                  <span className="campo-label">🔧 {manut.nome || "Manutenção"}</span>
                  <TimeInput minutos={paradas[manut.codigo] || 0} onChange={(v) => setMin(manut.codigo, v)} style={{ width: "100%", padding: "10px 12px", fontSize: 17 }} />
                </label>
              )}
            </div>
          </div>
        )}

        <div className="row-gap" style={{ gap: 18, marginTop: 16, flexWrap: "wrap", fontSize: 13.5 }}>
          <span>Parada (conta): <strong>{fmtMin(totalParada)}</strong></span>
          {totalLimp > 0 && <span className="muted">🧹 Limpeza: <strong>{fmtMin(totalLimp)}</strong></span>}
          {totalManut > 0 && <span className="muted">🔧 Manutenção: <strong>{fmtMin(totalManut)}</strong></span>}
        </div>

        <label className="campo" style={{ margin: "14px 0 0", maxWidth: 520 }}>
          <span className="campo-label">Observação (opcional)</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: troca de rolo demorada" />
        </label>

        <div className="row-gap" style={{ marginTop: 14, alignItems: "center", gap: 12 }}>
          <button className="btn btn-primary" disabled={salvando || carregando} onClick={salvar} style={{ padding: "10px 22px" }}>{salvando ? "Salvando…" : "💾 Salvar turno"}</button>
          {msg && <span style={{ fontWeight: 700, color: msg.startsWith("✓") ? "#15803d" : "#b91c1c" }}>{msg}</span>}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════ Aba RESUMO ═══════════════════════════
function Resumo({ maquinas, motivos }: { maquinas: MaquinaTec[]; motivos: MotivoTec[] }) {
  const [mes, setMes] = useState(mesStr());
  const [dados, setDados] = useState<ResumoTec | null>(null);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    setCarregando(true);
    api.resumoTec(mes).then(setDados).catch(() => setDados(null)).finally(() => setCarregando(false));
  }, [mes]);
  const motParada = motivos.filter((m) => m.tipo === "parada");
  // Ranking pela maior % média (melhor máquina primeiro).
  const linhas = useMemo(() => (dados?.maquinas || []).slice().sort((a, b) => (b.media ?? -1) - (a.media ?? -1)), [dados]);

  return (
    <div className="card pad">
      <div className="row-gap" style={{ alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <label className="campo" style={{ margin: 0, minWidth: 160 }}>
          <span className="campo-label">Mês</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>Média da % e tempos parados no mês — base da bonificação. Ordenado da melhor máquina para a pior.</span>
      </div>
      {carregando ? <p className="muted pad">Carregando…</p> : !linhas.length ? <p className="muted pad">Sem dados nesse mês.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Máquina</th>
                <th className="num">% média</th>
                <th className="num">Turnos</th>
                <th className="num">Parado (conta)</th>
                {motParada.map((m) => <th key={m.codigo} className="num" title={m.codigo}>{m.nome || m.codigo}</th>)}
                <th className="num">🧹 Limpeza</th>
                <th className="num">🔧 Manut.</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.maquina_id}>
                  <td className="strong">{i === 0 && l.media != null ? "🏆 " : ""}{l.nome}</td>
                  <td className="num strong" style={{ fontVariantNumeric: "tabular-nums", fontSize: 16, color: l.media == null ? "#94a3b8" : l.media >= 90 ? "#15803d" : l.media >= 75 ? "#ca8a04" : "#b91c1c" }}>
                    {l.media != null ? l.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}
                  </td>
                  <td className="num">{l.turnos}</td>
                  <td className="num strong" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMin(l.minParada)}</td>
                  {motParada.map((m) => <td key={m.codigo} className="num muted" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMin(l.motivos[m.codigo] || 0)}</td>)}
                  <td className="num muted" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMin(l.minLimpeza)}</td>
                  <td className="num muted" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMin(l.minManutencao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════ Gerenciar máquinas ═══════════════════════════
function GerenciarMaquinas({ maquinas, onFechar, onMudou }: { maquinas: MaquinaTec[]; onFechar: () => void; onMudou: () => void }) {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function add() {
    const n = nome.trim(); if (!n) return;
    setSalvando(true);
    try { await api.salvarMaquinaTec({ nome: n, ordem: maquinas.length + 1 }); setNome(""); onMudou(); }
    catch { alert("Não consegui salvar."); } finally { setSalvando(false); }
  }
  async function excluir(m: MaquinaTec) {
    if (!confirm(`Remover a máquina "${m.nome}"? (os registros antigos continuam guardados)`)) return;
    try { await api.excluirMaquinaTec(m.id); onMudou(); } catch { alert("Não consegui remover."); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460, width: "min(460px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Máquinas (teares)</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Tear 01" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button className="btn btn-primary" disabled={salvando || !nome.trim()} onClick={add}>Adicionar</button>
        </div>
        <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
          {maquinas.length === 0 ? <p className="muted">Nenhuma máquina ainda.</p> : maquinas.map((m) => (
            <div key={m.id} className="row-gap" style={{ alignItems: "center", padding: "8px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <span className="strong">{m.nome}</span>
              <button className="icon-btn danger" style={{ marginLeft: "auto" }} onClick={() => excluir(m)}>🗑</button>
            </div>
          ))}
        </div>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-soft" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Gerenciar motivos ═══════════════════════════
function GerenciarMotivos({ motivos, onFechar, onMudou }: { motivos: MotivoTec[]; onFechar: () => void; onMudou: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function add() {
    const c = codigo.trim(); if (!c) return;
    setSalvando(true);
    try { await api.salvarMotivoTec({ codigo: c, nome: c, tipo: "parada", ordem: motivos.length + 1 }); setCodigo(""); onMudou(); }
    catch { alert("Não consegui salvar."); } finally { setSalvando(false); }
  }
  async function excluir(m: MotivoTec) {
    if (!confirm(`Remover o motivo "${m.nome || m.codigo}"?`)) return;
    try { await api.excluirMotivoTec(m.id); onMudou(); } catch { alert("Não consegui remover."); }
  }
  const nome = (m: MotivoTec) => m.tipo === "limpeza" ? "🧹 " + (m.nome || m.codigo) : m.tipo === "manutencao" ? "🔧 " + (m.nome || m.codigo) : (m.nome || m.codigo);
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460, width: "min(460px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Motivos de parada</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: YARN" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button className="btn btn-primary" disabled={salvando || !codigo.trim()} onClick={add}>Adicionar</button>
        </div>
        <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
          {motivos.map((m) => (
            <div key={m.id} className="row-gap" style={{ alignItems: "center", padding: "8px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <span className="strong">{nome(m)}</span>
              {m.tipo !== "parada" && <span className="chip" style={{ fontSize: 10 }}>justificada</span>}
              <button className="icon-btn danger" style={{ marginLeft: "auto" }} onClick={() => excluir(m)}>🗑</button>
            </div>
          ))}
        </div>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-soft" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}
