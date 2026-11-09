// Precisa Produzir (Pronta Entrega) — kits montados + almofadas avulsas, por cor, com o
// disponível REAL do Syntech (saldo − reservado), o mínimo que a equipe define e o status.
// Fila automática (mais crítico primeiro). "Criar OP" gera uma reposição que entra na esteira
// (Tecelagem→Corte→Revisão). Edição Limitada não entra (ponta de estoque).
import { useEffect, useMemo, useState } from "react";
import { api, type UnidadePE, type NecessidadeResumo } from "../api";

const STATUS: Record<UnidadePE["status"], { txt: string; cor: string; bg: string }> = {
  zerado_pedido: { txt: "⛔ Zerado — tem pedido", cor: "#991b1b", bg: "#fef2f2" },
  zerado: { txt: "⚠️ Zerado", cor: "#b45309", bg: "#fffbeb" },
  abaixo: { txt: "🔸 Abaixo do mínimo", cor: "#92400e", bg: "#fffbeb" },
  ok: { txt: "✓ OK", cor: "#166534", bg: "transparent" },
};
const ERRO_OP: Record<string, string> = {
  op_ja_aberta: "Já existe uma ordem de produção aberta pra esse modelo+cor.",
  op_ja_em_producao: "A produção já começou — cancele pela esteira (Tecelagem/Corte/Revisão).",
  qtd_invalida: "Quantidade inválida.",
};

export function ProducaoNecessidade() {
  const [unidades, setUnidades] = useState<UnidadePE[] | null>(null);
  const [resumo, setResumo] = useState<NecessidadeResumo | null>(null);
  const [erro, setErro] = useState("");
  const [todos, setTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [minEdit, setMinEdit] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState("");

  function carregar() {
    setUnidades(null); setErro("");
    api.producaoNecessidade(todos).then((r) => { setUnidades(r.unidades); setResumo(r.resumo); }).catch((e) => setErro((e as Error).message));
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [todos]);

  const filtrada = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (unidades || []).filter((u) => !b || u.modelo.toLowerCase().includes(b) || u.cor.toLowerCase().includes(b) || u.ref.toLowerCase().includes(b));
  }, [unidades, busca]);
  const emProducao = filtrada.filter((u) => u.op_aberta);
  const fila = filtrada.filter((u) => !u.op_aberta && u.status !== "ok");
  const okList = filtrada.filter((u) => !u.op_aberta && u.status === "ok");

  async function salvarMin(u: UnidadePE, valor: string) {
    const k = u.ref + "|" + u.cor.toLowerCase();
    const n = Math.max(0, Math.round(Number(valor) || 0));
    if (n === u.minimo) { setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; }); return; }
    setOcupado(k);
    try { await api.estoqueMinSalvar(u.ref, u.cor, n); setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; }); carregar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(""); }
  }

  async function criarOp(u: UnidadePE) {
    const sugerido = Math.max(u.falta, u.reservado, 1);
    const resp = window.prompt(`Criar ordem de produção de "${u.modelo}" (${u.cor}).\nEla entra na esteira (Tecelagem → Corte → Revisão).\n\nQuantas peças produzir?`, String(sugerido));
    if (resp == null) return;
    const qtd = Math.max(1, Math.round(Number(resp) || 0));
    if (!qtd) { setErro("Quantidade inválida."); return; }
    const k = u.ref + "|" + u.cor.toLowerCase();
    setOcupado(k); setErro("");
    try { await api.producaoOpCriar({ ref: u.ref, cor: u.cor, tipo: u.tipo, modelo: u.modelo, qtd }); carregar(); }
    catch (e) { setErro(ERRO_OP[(e as Error).message] || (e as Error).message); }
    finally { setOcupado(""); }
  }

  async function cancelarOp(u: UnidadePE) {
    if (!window.confirm(`Cancelar a ordem de produção ${u.op_numero || ""} de "${u.modelo}" (${u.cor})?\nSó dá pra cancelar se a produção ainda não começou.`)) return;
    const k = u.ref + "|" + u.cor.toLowerCase();
    setOcupado(k); setErro("");
    try { await api.producaoOpCancelar(u.ref, u.cor); carregar(); }
    catch (e) { setErro(ERRO_OP[(e as Error).message] || (e as Error).message); }
    finally { setOcupado(""); }
  }

  const tipoBadge = (u: UnidadePE) => (
    <span style={{ fontSize: 10, marginLeft: 6, background: u.tipo === "kit" ? "#eef2ff" : "#ecfeff", color: u.tipo === "kit" ? "#3730a3" : "#0e7490", borderRadius: 5, padding: "1px 5px", fontWeight: 600 }}>{u.tipo === "kit" ? "🧩 kit" : "avulso"}</span>
  );

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🏭 Precisa Produzir</h2>
        <span className="muted" style={{ fontSize: 12 }}>Pronta Entrega · kit montado + avulsos, por cor. Disponível = saldo real − reservado. Edição Limitada não entra.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar}>↻ Atualizar</button>
      </div>

      {resumo && (
        <div className="row-gap" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="card pad" style={{ flex: "1 1 140px", minWidth: 130, background: resumo.zerado_pedido > 0 ? "#fef2f2" : undefined }}>
            <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>⛔ Zerado com pedido</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#dc2626" }}>{resumo.zerado_pedido}</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 140px", minWidth: 130, background: resumo.zerado > 0 ? "#fffbeb" : undefined }}>
            <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>⚠️ Zerado</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#b45309" }}>{resumo.zerado}</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 140px", minWidth: 130 }}>
            <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>🔸 Abaixo do mínimo</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#b45309" }}>{resumo.abaixo}</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 140px", minWidth: 130, background: resumo.em_producao > 0 ? "#eff6ff" : undefined }}>
            <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>🏭 Em produção</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#1d4ed8" }}>{resumo.em_producao}</div>
          </div>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={busca} placeholder="Filtrar por modelo ou cor…" style={{ flex: "1 1 240px", padding: "8px 12px", fontSize: 14 }} onChange={(e) => setBusca(e.target.value)} />
        <label className="row-gap" style={{ alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Ver tudo (inclui OK)
        </label>
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c", marginBottom: 12 }}>{erro}</div>}
      {unidades == null && !erro && <div className="card pad muted">Carregando…</div>}

      {/* FILA — precisa produzir, numerada por prioridade */}
      {unidades != null && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 14 }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>📋 Fila de produção <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {fila.length} na fila (mais crítico primeiro)</span></div>
          {fila.length === 0
            ? <div className="pad muted">🎉 Nada na fila — tudo acima do mínimo (ou já em produção).</div>
            : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th style={{ width: 36 }}>#</th><th>Situação</th><th>Modelo</th><th>Cor</th><th className="num">Disp.</th><th className="num">Mín.</th><th className="num">Falta</th><th>O que falta</th><th></th></tr></thead>
                <tbody>
                  {fila.map((u, i) => {
                    const k = u.ref + "|" + u.cor.toLowerCase();
                    const st = STATUS[u.status];
                    const valorMin = minEdit[k] ?? String(u.minimo || "");
                    return (
                      <tr key={k} style={{ background: st.bg }}>
                        <td style={{ fontWeight: 800, color: "#64748b", textAlign: "center" }}>{i + 1}º</td>
                        <td style={{ color: st.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{st.txt}</td>
                        <td className="strong">{u.modelo}{tipoBadge(u)}</td>
                        <td>{u.cor || "—"}</td>
                        <td className="num" style={{ fontWeight: 700, color: u.disponivel > 0 ? "#166534" : "#dc2626" }}>{u.disponivel.toLocaleString("pt-BR")}{u.reservado > 0 ? <span className="muted" style={{ fontSize: 11, display: "block", fontWeight: 400 }}>{u.reservado} res.</span> : null}</td>
                        <td className="num">
                          <input value={valorMin} onChange={(e) => setMinEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))} onBlur={(e) => salvarMin(u, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} disabled={ocupado === k} inputMode="numeric" style={{ width: 56, padding: "4px 6px", textAlign: "right", fontSize: 13 }} placeholder="—" />
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: u.falta > 0 ? "#dc2626" : "var(--muted)" }}>{u.falta > 0 ? u.falta.toLocaleString("pt-BR") : "—"}</td>
                        <td className="muted">{u.limitante || (u.tipo === "avulso" ? "produzir avulso" : "")}</td>
                        <td><button className="btn btn-primary" style={{ whiteSpace: "nowrap", fontSize: 12, padding: "5px 10px" }} disabled={ocupado === k} onClick={() => criarOp(u)}>+ Criar OP</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* EM PRODUÇÃO — OPs abertas */}
      {emProducao.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 14, borderColor: "#bfdbfe" }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#1d4ed8" }}>🏭 Em produção <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {emProducao.length} OP(s) na esteira</span></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>OP</th><th>Modelo</th><th>Cor</th><th className="num">Produzindo</th><th className="num">Disp. atual</th><th></th></tr></thead>
            <tbody>
              {emProducao.map((u) => {
                const k = u.ref + "|" + u.cor.toLowerCase();
                return (
                  <tr key={k} style={{ background: "#eff6ff" }}>
                    <td className="strong" style={{ color: "#1d4ed8" }}>{u.op_numero || "—"}</td>
                    <td className="strong">{u.modelo}{tipoBadge(u)}</td>
                    <td>{u.cor || "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{u.op_qtd.toLocaleString("pt-BR")}</td>
                    <td className="num">{u.disponivel.toLocaleString("pt-BR")}</td>
                    <td><button className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px", color: "#b91c1c" }} disabled={ocupado === k} onClick={() => cancelarOp(u)}>Cancelar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OK (só no "ver tudo") */}
      {todos && okList.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#166534" }}>✓ Acima do mínimo <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {okList.length}</span></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Modelo</th><th>Cor</th><th className="num">Disp.</th><th className="num">Mín.</th></tr></thead>
            <tbody>
              {okList.map((u) => {
                const k = u.ref + "|" + u.cor.toLowerCase();
                const valorMin = minEdit[k] ?? String(u.minimo || "");
                return (
                  <tr key={k}>
                    <td className="strong">{u.modelo}{tipoBadge(u)}</td>
                    <td>{u.cor || "—"}</td>
                    <td className="num" style={{ fontWeight: 700, color: "#166534" }}>{u.disponivel.toLocaleString("pt-BR")}</td>
                    <td className="num"><input value={valorMin} onChange={(e) => setMinEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))} onBlur={(e) => salvarMin(u, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} disabled={ocupado === k} inputMode="numeric" style={{ width: 56, padding: "4px 6px", textAlign: "right", fontSize: 13 }} placeholder="—" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 A <b>fila</b> é automática (mais crítico primeiro). <b>+ Criar OP</b> gera uma ordem de produção que entra na esteira
        (Tecelagem → Corte → Revisão), igual às reposições de hoje — <b>ainda não grava no Syntech</b> (isso é a próxima etapa).
        Defina o <b>mínimo por modelo+cor</b> na coluna Mín. (Enter salva). <b>Kit</b> = quantos dá pra montar; <b>O que falta</b> = a peça que trava.
      </p>
    </>
  );
}
