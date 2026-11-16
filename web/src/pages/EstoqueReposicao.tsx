import { useEffect, useMemo, useState } from "react";
import { api, type UnidadePE } from "../api";

// Data amigável da última sincronização + "há quanto tempo".
function syncInfo(em: string | null, minutos: number | null) {
  if (!em) return { txt: "nunca sincronizou", cor: "#b91c1c" };
  const quando = new Date(em.replace(" ", "T") + (em.includes("Z") ? "" : "Z"));
  const rel = minutos == null ? "" : minutos < 1 ? "agora mesmo" : minutos < 60 ? `há ${minutos} min` : minutos < 1440 ? `há ${Math.round(minutos / 60)} h` : `há ${Math.round(minutos / 1440)} dia(s)`;
  const cor = minutos == null ? "#64748b" : minutos <= 10 ? "#15803d" : minutos <= 30 ? "#b45309" : "#b91c1c";
  return { txt: `${rel} · ${quando.toLocaleString("pt-BR").slice(0, 17)}`, cor };
}

// Cor estável do avatar do modelo (a partir do nome).
function corModelo(nome: string) {
  const cores = ["#4338ca", "#be185d", "#0f766e", "#b45309", "#7c3aed", "#0369a1", "#15803d", "#9f1239"];
  let h = 0; for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return cores[h % cores.length];
}
const iniciais = (nome: string) => nome.replace(/^Kit\s+/i, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";

// Recalcula necessidade/status local depois de editar mínimo/ideal (mesma regra do backend).
function recalc(u: UnidadePE, minimo: number, ideal: number): UnidadePE {
  const alvo = ideal > 0 ? ideal : minimo;
  const emFlight = (u.op_qtd || 0) + (u.em_producao || 0);
  const necessidade = (minimo > 0 && u.disponivel < minimo) ? Math.max(0, alvo - u.disponivel - emFlight) : 0;
  const falta = Math.max(0, minimo - u.disponivel);
  let status: UnidadePE["status"];
  if (u.disponivel <= 0) status = u.reservado > 0 ? "zerado_pedido" : "zerado";
  else if (minimo > 0 && u.disponivel < minimo) status = "abaixo";
  else status = "ok";
  return { ...u, minimo, ideal, necessidade, falta, status };
}

// Campinho numérico que salva ao sair/Enter (só se mudou).
function NumEdit({ valor, onSalvar, destaque }: { valor: number; onSalvar: (n: number) => void; destaque?: boolean }) {
  const [v, setV] = useState(String(valor || ""));
  useEffect(() => { setV(String(valor || "")); }, [valor]);
  const commit = () => { const n = Math.max(0, Math.round(Number(v) || 0)); if (n !== (valor || 0)) onSalvar(n); };
  return (
    <input value={v} inputMode="numeric" onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: 54, padding: "4px 6px", textAlign: "center", border: "1px solid " + (destaque ? "#fca5a5" : "var(--line,#e2e8f0)"), borderRadius: 6, fontSize: 13, fontWeight: 600, background: "var(--card,#fff)", color: "inherit" }} />
  );
}

export function EstoqueReposicao() {
  const [unidades, setUnidades] = useState<UnidadePE[]>([]);
  const [sync, setSync] = useState<{ em: string | null; minutos: number | null; desatualizado: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  function carregar() {
    setCarregando(true);
    api.estoqueReposicao().then((r) => { setUnidades(r.unidades); setSync(r.sync); }).catch(() => setUnidades([])).finally(() => setCarregando(false));
  }
  useEffect(carregar, []);

  async function salvar(u: UnidadePE, campo: "minimo" | "ideal", valor: number) {
    const novoMin = campo === "minimo" ? valor : u.minimo;
    const novoIdeal = campo === "ideal" ? valor : u.ideal;
    setUnidades((xs) => xs.map((x) => (x.ref === u.ref && x.cor === u.cor) ? recalc(x, novoMin, novoIdeal) : x)); // otimista
    try { await api.estoqueMinIdeal(u.ref, u.cor, { [campo]: valor }); }
    catch { alert("Não consegui salvar o valor. Confira a conexão."); carregar(); }
  }

  const termo = busca.trim().toLowerCase();
  const abaixoDe = (u: UnidadePE) => u.necessidade > 0 || (u.minimo > 0 && u.disponivel < u.minimo);
  const filtradas = useMemo(() => unidades.filter((u) => {
    if (soAbaixo && !abaixoDe(u)) return false;
    if (!termo) return true;
    return [u.modelo, u.ref, u.cor].some((x) => String(x || "").toLowerCase().includes(termo));
  }), [unidades, termo, soAbaixo]);

  const modelos = useMemo(() => {
    const map = new Map<string, UnidadePE[]>();
    for (const u of filtradas) { const a = map.get(u.modelo) || []; a.push(u); map.set(u.modelo, a); }
    const arr = [...map.entries()].map(([modelo, cores]) => ({
      modelo, ref: cores[0]?.ref || "",
      cores: cores.slice().sort((a, b) => (b.necessidade - a.necessidade) || a.cor.localeCompare(b.cor, "pt-BR")),
      precisam: cores.filter((c) => c.necessidade > 0).length,
      totalNec: cores.reduce((s, c) => s + c.necessidade, 0),
      totalDisp: cores.reduce((s, c) => s + c.disponivel, 0),
    }));
    arr.sort((a, b) => (b.totalNec - a.totalNec) || a.modelo.localeCompare(b.modelo, "pt-BR"));
    return arr;
  }, [filtradas]);

  const modelosRepor = modelos.filter((m) => m.precisam > 0).length;
  const pecasRepor = modelos.reduce((s, m) => s + m.totalNec, 0);
  const s = sync ? syncInfo(sync.em, sync.minutos) : null;

  const col: React.CSSProperties = { padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const th: React.CSSProperties = { ...col, fontSize: 10.5, letterSpacing: ".04em", textTransform: "uppercase", color: "#8a8278", fontWeight: 700, borderBottom: "1px solid var(--line,#e6e1d8)" };

  return (
    <>
      <div className="page-head">
        <div><h1>Estoque & Reposição</h1><div className="breadcrumb">Estoque › Produtos acabados e reposição</div></div>
        <button className="btn btn-soft" onClick={carregar}>↻ Atualizar</button>
      </div>

      {/* Barra de sincronização (fonte oficial = Syntech) */}
      {s && (
        <div className="card pad" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.cor, flex: "0 0 auto" }} />
          <span>📦 <b>Saldo do Syntech</b> · última sincronização <b style={{ color: s.cor }}>{s.txt}</b></span>
          {sync?.desatualizado && <span className="chip" style={{ background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>⚠️ dados podem estar desatualizados</span>}
        </div>
      )}

      {/* Toolbar: busca + filtro + resumo */}
      <div className="card pad" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar por modelo, referência, cor ou SKU…"
          style={{ flex: 1, minWidth: 220, padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line,#e2e8f0)" }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} style={{ width: 16, height: 16 }} />
          Só abaixo do mínimo
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {modelos.length} modelo(s) · <b style={{ color: modelosRepor ? "#b91c1c" : "#15803d" }}>{modelosRepor}</b> precisam repor · <b>{pecasRepor}</b> peça(s) a produzir
        </span>
      </div>

      {carregando ? <p className="muted pad">Carregando estoque…</p> : modelos.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>{soAbaixo ? "Nenhum modelo abaixo do mínimo. 👍" : "Nada encontrado."}</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {modelos.map((m) => {
            const exp = aberto.has(m.modelo);
            return (
              <div key={m.modelo} className="card" style={{ overflow: "hidden" }}>
                {/* Linha compacta do MODELO */}
                <div onClick={() => setAberto((a) => { const n = new Set(a); n.has(m.modelo) ? n.delete(m.modelo) : n.add(m.modelo); return n; })}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, background: corModelo(m.modelo), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flex: "0 0 auto" }}>{iniciais(m.modelo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.modelo}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{m.ref} · {m.cores.length} cor(es) · {m.totalDisp} disponível(is)</div>
                  </div>
                  {m.precisam > 0
                    ? <span className="chip" style={{ background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>⚠️ repor {m.totalNec}</span>
                    : <span className="chip" style={{ background: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>✓ ok</span>}
                  <span className="muted" style={{ fontSize: 16, width: 16, textAlign: "center" }}>{exp ? "▾" : "▸"}</span>
                </div>

                {/* Variações por COR */}
                {exp && (
                  <div style={{ overflowX: "auto", borderTop: "1px solid var(--line,#eee)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
                      <thead><tr>
                        <th style={{ ...th, textAlign: "left" }}>Cor</th>
                        <th style={th}>Físico</th><th style={th}>Reserv.</th><th style={th}>Dispon.</th>
                        <th style={th}>Em repos.</th><th style={th}>Mínimo</th><th style={th}>Ideal</th><th style={th}>Repor</th>
                      </tr></thead>
                      <tbody>
                        {m.cores.map((u) => {
                          const emRepos = (u.op_qtd || 0) + (u.em_producao || 0);
                          const critico = u.status === "zerado" || u.status === "zerado_pedido";
                          const abaixo = u.status === "abaixo";
                          return (
                            <tr key={u.ref + "|" + u.cor} style={{ background: critico ? "#fef2f2" : abaixo ? "#fffbeb" : "transparent", borderBottom: "1px solid var(--line,#f0ece4)" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{u.cor || "—"}{u.limitante ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · trava: {u.limitante}</span> : null}</td>
                              <td style={col}>{u.saldo}</td>
                              <td style={col}>{u.reservado || "—"}</td>
                              <td style={{ ...col, fontWeight: 800, color: critico ? "#b91c1c" : abaixo ? "#b45309" : "#15803d" }}>{u.disponivel}</td>
                              <td style={col}>{emRepos ? emRepos : "—"}</td>
                              <td style={{ ...col, padding: "4px 8px" }}><NumEdit valor={u.minimo} destaque={abaixo || critico} onSalvar={(n) => salvar(u, "minimo", n)} /></td>
                              <td style={{ ...col, padding: "4px 8px" }}><NumEdit valor={u.ideal} onSalvar={(n) => salvar(u, "ideal", n)} /></td>
                              <td style={{ ...col, fontWeight: 800, color: u.necessidade > 0 ? "#b91c1c" : "#94a3b8" }}>{u.necessidade > 0 ? u.necessidade : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="muted" style={{ fontSize: 11, padding: "6px 10px" }}>
                      Disponível = físico − reservado · Repor = ideal − disponível − já em reposição (dispara quando disponível fica abaixo do mínimo).
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
