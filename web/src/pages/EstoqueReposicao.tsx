import { useEffect, useMemo, useState } from "react";
import { api, type UnidadePE } from "../api";
import { podeFuncao, getUser } from "../auth";

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
const iniciais = (nome: string) => {
  const limpo = nome.replace(/^Kit\s+/i, "").trim();
  const ws = limpo.split(/\s+/).filter(Boolean);
  const s = ws.length >= 2 ? ws.slice(0, 2).map((p) => p[0] || "").join("") : limpo.slice(0, 2);
  return s.toUpperCase() || "?";
};

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
  const [limite, setLimite] = useState(50);
  const [lote, setLote] = useState<{ u: UnidadePE; qtd: number }[] | null>(null); // sugestão em revisão
  const [futuroN, setFuturoN] = useState(0);
  const [aprovando, setAprovando] = useState(false);
  const [msgA, setMsgA] = useState("");
  const podeAprovar = podeFuncao(getUser(), "estoque.aprovar_reposicao");

  function carregar() {
    setCarregando(true);
    api.estoqueReposicao().then((r) => { setUnidades(r.unidades); setSync(r.sync); setLimite(r.limite || 50); }).catch(() => setUnidades([])).finally(() => setCarregando(false));
  }
  useEffect(carregar, []);

  async function salvar(u: UnidadePE, campo: "minimo" | "ideal", valor: number) {
    const novoMin = campo === "minimo" ? valor : u.minimo;
    const novoIdeal = campo === "ideal" ? valor : u.ideal;
    setUnidades((xs) => xs.map((x) => (x.ref === u.ref && x.cor === u.cor) ? recalc(x, novoMin, novoIdeal) : x)); // otimista
    try { await api.estoqueMinIdeal(u.ref, u.cor, { [campo]: valor }); }
    catch { alert("Não consegui salvar o valor. Confira a conexão."); carregar(); }
  }

  // Gera a sugestão CONSOLIDADA: todos os SKUs que precisam repor, priorizando os mais críticos,
  // enchendo até o LIMITE de peças por ordem. O que passar do limite vira "necessidade futura".
  const rankS: Record<UnidadePE["status"], number> = { zerado_pedido: 0, zerado: 1, abaixo: 2, ok: 3 };
  function gerarSugestao() {
    const crit = unidades.filter((u) => u.necessidade > 0)
      .sort((a, b) => rankS[a.status] - rankS[b.status] || b.falta - a.falta || b.necessidade - a.necessidade);
    const novo: { u: UnidadePE; qtd: number }[] = []; let acc = 0, fut = 0;
    for (const u of crit) {
      let q = u.necessidade;
      if (limite > 0) { if (acc >= limite) { fut += u.necessidade; continue; } if (acc + q > limite) q = limite - acc; }
      if (q > 0) { novo.push({ u, qtd: q }); acc += q; }
      fut += (u.necessidade - q);
    }
    setFuturoN(fut); setLote(novo); setMsgA("");
  }
  async function salvarLimite(n: number) { setLimite(n); try { await api.reposicaoLimiteSalvar(n); } catch { /* ok */ } }
  async function aprovar() {
    if (!lote) return;
    const itens = lote.filter((x) => x.qtd > 0).map((x) => ({ ref: x.u.ref, cor: x.u.cor, tipo: x.u.tipo, modelo: x.u.modelo, qtd: x.qtd }));
    const total = itens.reduce((s, x) => s + x.qtd, 0);
    if (!itens.length) { setMsgA("Nenhum item com quantidade."); return; }
    if (!confirm(`Aprovar a reposição e gerar as ordens de produção?\n\n${itens.length} item(ns) · ${total} peça(s).\n\nAs ordens entram na esteira BLOQUEADAS — o PCP libera pra produzir.`)) return;
    setAprovando(true); setMsgA("");
    try {
      const r = await api.reposicaoAprovar(itens);
      if (r.error === "dados_desatualizados" || r.error === "sem_sincronizacao") { setMsgA("❌ Estoque desatualizado — espere a próxima sincronização do Syntech e tente de novo."); setAprovando(false); return; }
      if (!r.ok) { setMsgA("❌ Não consegui aprovar: " + (r.error || "erro")); setAprovando(false); return; }
      setMsgA(`✓ ${r.criadas} ordem(ns) criada(s) (${r.total_pecas} peças)${r.puladas ? ` · ${r.puladas} já tinham OP aberta` : ""}. Entraram na esteira (bloqueadas pro PCP liberar).`);
      setLote(null); carregar();
    } catch { setMsgA("❌ Erro ao aprovar. Confira a conexão."); } finally { setAprovando(false); }
  }

  const termo = busca.trim().toLowerCase();
  const abaixoDe = (u: UnidadePE) => u.necessidade > 0 || (u.minimo > 0 && u.disponivel < u.minimo);
  const filtradas = useMemo(() => unidades.filter((u) => {
    if (soAbaixo && !abaixoDe(u)) return false;
    if (!termo) return true;
    return [u.modelo, u.ref, u.cor, u.designNome, u.variacao].some((x) => String(x || "").toLowerCase().includes(termo));
  }), [unidades, termo, soAbaixo]);

  // Agrupa por DESIGN (código base, ex. 1078): um card "Balls" com todos os tamanhos/peças dentro.
  const designs = useMemo(() => {
    const map = new Map<string, UnidadePE[]>();
    for (const u of filtradas) { const a = map.get(u.design) || []; a.push(u); map.set(u.design, a); }
    const arr = [...map.entries()].map(([design, itens]) => ({
      design,
      nome: itens[0]?.designNome || itens[0]?.modelo || design,
      refs: [...new Set(itens.map((i) => i.ref))],
      // ordena por tamanho/variação, depois por quem precisa repor, depois por cor
      itens: itens.slice().sort((a, b) => (a.variacao || "").localeCompare(b.variacao || "", "pt-BR") || (b.necessidade - a.necessidade) || a.cor.localeCompare(b.cor, "pt-BR")),
      precisam: itens.filter((c) => c.necessidade > 0).length,
      totalNec: itens.reduce((s, c) => s + c.necessidade, 0),
      totalDisp: itens.reduce((s, c) => s + c.disponivel, 0),
    }));
    arr.sort((a, b) => (b.totalNec - a.totalNec) || a.nome.localeCompare(b.nome, "pt-BR"));
    return arr;
  }, [filtradas]);

  const modelosRepor = designs.filter((m) => m.precisam > 0).length;
  const pecasRepor = designs.reduce((s, m) => s + m.totalNec, 0);
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
          {designs.length} modelo(s) · <b style={{ color: modelosRepor ? "#b91c1c" : "#15803d" }}>{modelosRepor}</b> precisam repor · <b>{pecasRepor}</b> peça(s) a produzir
        </span>
        {pecasRepor > 0 && !lote && <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={gerarSugestao}>💡 Gerar sugestão de reposição</button>}
      </div>

      {/* SUGESTÃO + aprovação humana (a IA prepara; só quem tem permissão libera) */}
      {lote && (
        <div className="card pad" style={{ marginBottom: 14, border: "2px solid #c7d2fe", background: "#eef2ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <b style={{ fontSize: 15, color: "#3730a3" }}>💡 Sugestão de reposição</b>
            <label style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Máx. por ordem:
              <input value={String(limite)} inputMode="numeric"
                onChange={(e) => setLimite(Math.max(0, Math.round(Number(e.target.value.replace(/[^\d]/g, "")) || 0)))}
                onBlur={(e) => salvarLimite(Math.max(0, Math.round(Number(e.target.value.replace(/[^\d]/g, "")) || 0)))}
                style={{ width: 62, padding: "4px 6px", textAlign: "center", border: "1px solid var(--line,#e2e8f0)", borderRadius: 6, fontSize: 13 }} /> peças
            </label>
            <button className="btn btn-soft" style={{ fontSize: 12 }} onClick={gerarSugestao}>↻ Recalcular</button>
            <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => { setLote(null); setMsgA(""); }}>Fechar</button>
          </div>
          {lote.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nada a repor dentro do limite.</p> : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "var(--card,#fff)", borderRadius: 8 }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Modelo</th><th style={{ ...th, textAlign: "left" }}>Cor</th>
                    <th style={th}>Disp.</th><th style={th}>Mín.</th><th style={th}>Ideal</th><th style={th}>Produzir</th>
                  </tr></thead>
                  <tbody>
                    {lote.map((x, i) => (
                      <tr key={x.u.ref + "|" + x.u.cor} style={{ borderBottom: "1px solid var(--line,#f0ece4)" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>{x.u.modelo}</td>
                        <td style={{ padding: "6px 8px" }}>{x.u.cor}</td>
                        <td style={col}>{x.u.disponivel}</td><td style={col}>{x.u.minimo}</td><td style={col}>{x.u.ideal || "—"}</td>
                        <td style={{ ...col, padding: "4px 8px" }}>
                          <NumEdit valor={x.qtd} destaque onSalvar={(n) => setLote((l) => l && l.map((y, j) => j === i ? { ...y, qtd: n } : y))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                <b style={{ fontSize: 14 }}>Este lote: {lote.reduce((s, x) => s + x.qtd, 0)} peça(s) · {lote.filter((x) => x.qtd > 0).length} item(ns)</b>
                {futuroN > 0 && <span className="chip" style={{ background: "#fffbeb", color: "#92400e", fontWeight: 600 }}>+{futuroN} ficam p/ a próxima ordem (necessidade futura)</span>}
                <span style={{ marginLeft: "auto" }} />
                {podeAprovar
                  ? <button className="btn btn-primary" disabled={aprovando || !!sync?.desatualizado} onClick={aprovar}>{aprovando ? "Aprovando…" : `✅ Aprovar e produzir (${lote.reduce((s, x) => s + x.qtd, 0)})`}</button>
                  : <span className="chip" style={{ background: "#f1f5f9", color: "#64748b", fontWeight: 600 }}>🔒 só quem tem permissão de aprovar reposição</span>}
              </div>
              {!!sync?.desatualizado && podeAprovar && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>⚠️ Estoque desatualizado — a aprovação fica travada até a próxima sincronização do Syntech.</div>}
              {msgA && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: msgA[0] === "✓" ? "#15803d" : "#b91c1c" }}>{msgA}</div>}
            </>
          )}
        </div>
      )}

      {carregando ? <p className="muted pad">Carregando estoque…</p> : designs.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>{soAbaixo ? "Nenhum modelo abaixo do mínimo. 👍" : "Nada encontrado."}</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {designs.map((m) => {
            const exp = aberto.has(m.design);
            const temVar = m.refs.length > 1; // tem tamanhos/peças diferentes dentro do design
            return (
              <div key={m.design} className="card" style={{ overflow: "hidden" }}>
                {/* Linha compacta do DESIGN (ex.: "Balls") */}
                <div onClick={() => setAberto((a) => { const n = new Set(a); n.has(m.design) ? n.delete(m.design) : n.add(m.design); return n; })}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, background: corModelo(m.nome), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flex: "0 0 auto" }}>{iniciais(m.nome)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.nome}</div>
                    <div className="muted" style={{ fontSize: 12 }}>cód. {m.design} · {m.refs.length} {temVar ? "tamanho(s)/peça(s)" : "peça"} · {m.itens.length} variação(ões) · {m.totalDisp} disponível(is)</div>
                  </div>
                  {m.precisam > 0
                    ? <span className="chip" style={{ background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>⚠️ repor {m.totalNec}</span>
                    : <span className="chip" style={{ background: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>✓ ok</span>}
                  <span className="muted" style={{ fontSize: 16, width: 16, textAlign: "center" }}>{exp ? "▾" : "▸"}</span>
                </div>

                {/* Tamanhos/peças × cor dentro do design */}
                {exp && (
                  <div style={{ overflowX: "auto", borderTop: "1px solid var(--line,#eee)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
                      <thead><tr>
                        <th style={{ ...th, textAlign: "left" }}>Tamanho / Peça</th>
                        <th style={{ ...th, textAlign: "left" }}>Cor</th>
                        <th style={th}>Físico</th><th style={th}>Reserv.</th><th style={th}>Dispon.</th>
                        <th style={th}>Em repos.</th><th style={th}>Mínimo</th><th style={th}>Ideal</th><th style={th}>Repor</th>
                      </tr></thead>
                      <tbody>
                        {m.itens.map((u) => {
                          const emRepos = (u.op_qtd || 0) + (u.em_producao || 0);
                          const critico = u.status === "zerado" || u.status === "zerado_pedido";
                          const abaixo = u.status === "abaixo";
                          return (
                            <tr key={u.ref + "|" + u.cor} style={{ background: critico ? "#fef2f2" : abaixo ? "#fffbeb" : "transparent", borderBottom: "1px solid var(--line,#f0ece4)" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{u.variacao || "—"}{u.limitante ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · trava: {u.limitante}</span> : null}</td>
                              <td style={{ padding: "6px 8px" }}>{u.cor || "—"}</td>
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
