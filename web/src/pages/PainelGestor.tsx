import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AtendPainel } from "../api";

const LIMITE_MIN = 10; // acima disso, destaca em vermelho ("demorando demais")

function tempo(min: number) {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}
function fone(t: string) {
  const d = (t || "").replace(/\D/g, ""); const n = d.startsWith("55") ? d.slice(2) : d;
  return n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7, 11)}` : t;
}

function Kpi({ n, label, cor }: { n: number; label: string; cor?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--line,#e2e8f0)", borderRadius: 12, padding: "12px 14px", color: "#1e293b", minWidth: 120, flex: "1 1 130px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || "#1e293b" }}>{n ?? 0}</div>
      <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</div>
    </div>
  );
}

export function PainelGestor() {
  const [d, setD] = useState<AtendPainel | null>(null);
  const [erro, setErro] = useState("");

  function carregar() { api.atendPainel().then(setD).catch(() => setErro("Não consegui carregar o painel.")); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t); }, []);

  const g = d?.gerais || {};
  return (
    <div className="pagina" style={{ maxWidth: 1000, margin: "0 auto", padding: "0 12px" }}>
      <div style={{ margin: "10px 0 8px" }}>
        <h1 style={{ margin: 0 }}>📊 Painel do Gestor</h1>
        <p className="muted" style={{ margin: "2px 0 0" }}>Atendimento ao vivo · atualiza sozinho · destaque em vermelho acima de {LIMITE_MIN} min de espera.</p>
      </div>
      {erro && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13.5 }}>{erro}</div>}
      {!d ? <p className="muted">Carregando…</p> : (
        <>
          {/* Números gerais */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <Kpi n={g.novas_hoje || 0} label="Novas hoje" />
            <Kpi n={g.em_humano || 0} label="Em atendimento" cor="#2563eb" />
            <Kpi n={g.nao_assumidas || 0} label="Não assumidas" cor={(g.nao_assumidas || 0) > 0 ? "#dc2626" : undefined} />
            <Kpi n={g.leads_hoje || 0} label="Leads hoje" cor="#16a34a" />
            <Kpi n={g.catalogos_hoje || 0} label="Catálogos hoje" />
            <Kpi n={g.indicados_hoje || 0} label="Indicados p/ loja" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pg-grid">
            {/* Fila de espera */}
            <div>
              <h3 style={{ margin: "0 0 8px" }}>⏳ Fila de espera ({d.fila.length})</h3>
              {d.fila.length === 0 ? <p className="muted">Ninguém esperando. 🎉</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {d.fila.map((c) => {
                    const atrasado = c.espera_min >= LIMITE_MIN;
                    return (
                      <Link key={c.id} to="/atendimento" style={{ textDecoration: "none", color: "inherit" }}>
                        <div style={{ border: "1px solid " + (atrasado ? "#fca5a5" : "var(--line,#e2e8f0)"), background: atrasado ? "#fef2f2" : "#fff", color: "#1e293b", borderRadius: 10, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome || fone(c.telefone)}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>{c.responsavel ? `👤 ${c.responsavel}` : "🔴 não assumida"}{c.setor ? ` · ${c.setor}` : ""}</div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: atrasado ? "#dc2626" : "#475569", whiteSpace: "nowrap" }}>{tempo(c.espera_min)}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Volume + tempo por atendente */}
            <div>
              <h3 style={{ margin: "0 0 8px" }}>👥 Por atendente</h3>
              {d.atendentes.length === 0 ? <p className="muted">Nenhuma conversa em atendimento humano.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {d.atendentes.map((a) => {
                    const tr = d.tempoResposta.find((t) => t.atendente === a.atendente);
                    return (
                      <div key={a.atendente} style={{ border: "1px solid var(--line,#e2e8f0)", background: "#fff", color: "#1e293b", borderRadius: 10, padding: "9px 11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                          <span>{a.atendente}</span>
                          <span>{a.total} conversa(s)</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {a.aguardando > 0 ? `⏳ ${a.aguardando} aguardando resposta` : "✅ em dia"}
                          {tr ? ` · resposta média ${tempo(tr.media_min)}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 style={{ margin: "16px 0 8px" }}>🏢 Hoje por setor</h3>
              {d.setores.length === 0 ? <p className="muted">Sem conversas hoje.</p> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {d.setores.map((s) => (
                    <div key={s.setor} style={{ border: "1px solid var(--line,#e2e8f0)", background: "#fff", color: "#1e293b", borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 700 }}>
                      {s.setor}: <b>{s.total}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
