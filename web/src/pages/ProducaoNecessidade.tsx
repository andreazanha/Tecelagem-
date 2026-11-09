// Precisa Produzir (Pronta Entrega) — fila automática do que falta (o que e quanto produzir).
// A ORDEM DE PRODUÇÃO é criada no Syntech; quando criada lá, aparece em "Em produção no Syntech"
// (coluna PRODUCAO lida pela ponte). Aqui a gente só mostra a necessidade. Edição Limitada fica fora.
import { useEffect, useMemo, useState } from "react";
import { api, type UnidadePE, type NecessidadeResumo, type OpAberta } from "../api";

const STATUS: Record<UnidadePE["status"], { txt: string; cor: string; bg: string }> = {
  zerado_pedido: { txt: "⛔ Zerado — tem pedido", cor: "#991b1b", bg: "#fef2f2" },
  zerado: { txt: "⚠️ Zerado", cor: "#b45309", bg: "#fffbeb" },
  abaixo: { txt: "🔸 Abaixo do mínimo", cor: "#92400e", bg: "#fffbeb" },
  ok: { txt: "✓ OK", cor: "#166534", bg: "transparent" },
};
const ERRO_OP: Record<string, string> = {
  op_ja_aberta: "Já existe uma OP aberta pra esse produto+cor+tamanho.",
  op_ja_em_producao: "A produção já começou — cancele pela esteira (Tecelagem/Corte/Revisão).",
  qtd_invalida: "Quantidade inválida.",
  ref_cor_obrigatorios: "Escolha o produto e a cor.",
};
const tipoBadge = (tipo: string) => (
  <span style={{ fontSize: 10, marginLeft: 6, background: tipo === "kit" ? "#eef2ff" : "#ecfeff", color: tipo === "kit" ? "#3730a3" : "#0e7490", borderRadius: 5, padding: "1px 5px", fontWeight: 600 }}>{tipo === "kit" ? "🧩 kit" : "avulso"}</span>
);

export function ProducaoNecessidade() {
  const [unidades, setUnidades] = useState<UnidadePE[] | null>(null);
  const [ops, setOps] = useState<OpAberta[]>([]);
  const [prodErp, setProdErp] = useState<UnidadePE[]>([]);
  const [resumo, setResumo] = useState<NecessidadeResumo | null>(null);
  const [erro, setErro] = useState("");
  const [todos, setTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [minEdit, setMinEdit] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState("");

  function carregar() {
    setUnidades(null); setErro("");
    api.producaoNecessidade(todos).then((r) => { setUnidades(r.unidades); setOps(r.ops || []); setProdErp(r.producao_erp || []); setResumo(r.resumo); }).catch((e) => setErro((e as Error).message));
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [todos]);

  const fila = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (unidades || []).filter((u) => u.status !== "ok").filter((u) => !b || u.modelo.toLowerCase().includes(b) || u.cor.toLowerCase().includes(b) || u.ref.toLowerCase().includes(b));
  }, [unidades, busca]);
  const okList = useMemo(() => (unidades || []).filter((u) => u.status === "ok"), [unidades]);
  const emProducao = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return ops.filter((o) => !b || o.modelo.toLowerCase().includes(b) || o.cor.toLowerCase().includes(b) || o.ref.toLowerCase().includes(b));
  }, [ops, busca]);
  const emProducaoErp = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return prodErp.filter((u) => !b || u.modelo.toLowerCase().includes(b) || u.cor.toLowerCase().includes(b) || u.ref.toLowerCase().includes(b));
  }, [prodErp, busca]);

  async function salvarMin(u: UnidadePE, valor: string) {
    const k = u.ref + "|" + u.cor.toLowerCase();
    const n = Math.max(0, Math.round(Number(valor) || 0));
    if (n === u.minimo) { setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; }); return; }
    setOcupado(k);
    try { await api.estoqueMinSalvar(u.ref, u.cor, n); setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; }); carregar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(""); }
  }

  async function imprimirOp(o: OpAberta) {
    setOcupado("op:" + o.id); setErro("");
    try {
      const r = await api.gerarPdfs(o.pedido_id);
      const arq = (r.arquivos || []).find((a) => a.tipo === "pronta-entrega") || (r.arquivos || [])[0];
      if (arq) window.open(arq.url, "_blank"); else setErro("PDF não gerado.");
    } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(""); }
  }

  async function cancelarOp(o: OpAberta) {
    if (!window.confirm(`Cancelar a OP ${o.numero || ""} de "${o.modelo}" (${o.cor}${o.tamanho ? " " + o.tamanho : ""})?\nSó dá pra cancelar se a produção ainda não começou.`)) return;
    setOcupado("op:" + o.id); setErro("");
    try { await api.producaoOpCancelar(o.id); carregar(); }
    catch (e) { setErro(ERRO_OP[(e as Error).message] || (e as Error).message); }
    finally { setOcupado(""); }
  }

  async function excluirOp(o: OpAberta) {
    if (!window.confirm(`EXCLUIR de vez a OP ${o.numero || ""} de "${o.modelo}" (${o.cor}${o.tamanho ? " " + o.tamanho : ""})?\n\nIsso APAGA o pedido, os itens e os cards — mesmo que a produção já tenha começado. Use pra limpar OPs de teste. Não dá pra desfazer.`)) return;
    setOcupado("op:" + o.id); setErro("");
    try { await api.producaoOpExcluir(o.id); carregar(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(""); }
  }

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🏭 Precisa Produzir</h2>
        <span className="muted" style={{ fontSize: 12 }}>Pronta Entrega · kit montado + avulsos, por cor. Disponível = saldo real − reservado. A OP é criada no Syntech.</span>
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
            <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>🏭 Em produção (nossa OP)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#1d4ed8" }}>{resumo.em_producao}</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 140px", minWidth: 130, background: resumo.em_producao_erp > 0 ? "#eef2ff" : undefined }}>
            <div style={{ fontSize: 12, color: "#4338ca", fontWeight: 600 }}>🏭 Em produção (Syntech)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#4338ca" }}>{resumo.em_producao_erp}</div>
            <div className="muted" style={{ fontSize: 10 }}>OP criada no Syntech</div>
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
                <thead><tr><th style={{ width: 36 }}>#</th><th>Situação</th><th>Modelo</th><th>Cor</th><th className="num">Disp.</th><th className="num">Mín.</th><th className="num">Falta</th><th>O que falta</th></tr></thead>
                <tbody>
                  {fila.map((u, i) => {
                    const k = u.ref + "|" + u.cor.toLowerCase();
                    const st = STATUS[u.status];
                    const valorMin = minEdit[k] ?? String(u.minimo || "");
                    return (
                      <tr key={k} style={{ background: st.bg }}>
                        <td style={{ fontWeight: 800, color: "#64748b", textAlign: "center" }}>{i + 1}º</td>
                        <td style={{ color: st.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{st.txt}</td>
                        <td className="strong">{u.modelo}{tipoBadge(u.tipo)}</td>
                        <td>{u.cor || "—"}</td>
                        <td className="num" style={{ fontWeight: 700, color: u.disponivel > 0 ? "#166534" : "#dc2626" }}>{u.disponivel.toLocaleString("pt-BR")}{u.reservado > 0 ? <span className="muted" style={{ fontSize: 11, display: "block", fontWeight: 400 }}>{u.reservado} res.</span> : null}</td>
                        <td className="num">
                          <input value={valorMin} onChange={(e) => setMinEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))} onBlur={(e) => salvarMin(u, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} disabled={ocupado === k} inputMode="numeric" style={{ width: 56, padding: "4px 6px", textAlign: "right", fontSize: 13 }} placeholder="—" />
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: u.falta > 0 ? "#dc2626" : "var(--muted)" }}>{u.falta > 0 ? u.falta.toLocaleString("pt-BR") : "—"}</td>
                        <td className="muted">{u.limitante || (u.tipo === "avulso" ? "produzir avulso" : "")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* EM PRODUÇÃO — OPs abertas (fila + buscador) */}
      {emProducao.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 14, borderColor: "#bfdbfe" }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#1d4ed8" }}>🏭 Em produção <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {emProducao.length} OP(s) na esteira</span></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>OP</th><th>Modelo</th><th>Cor</th><th>Tam.</th><th className="num">Produzindo</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {emProducao.map((o) => (
                <tr key={o.id} style={{ background: "#eff6ff" }}>
                  <td className="strong" style={{ color: "#1d4ed8" }}>{o.numero || "—"}</td>
                  <td className="strong">{o.modelo}{tipoBadge(o.tipo)}</td>
                  <td>{o.cor || "—"}</td>
                  <td>{o.tamanho || "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{o.qtd.toLocaleString("pt-BR")}</td>
                  <td>{o.bloqueado ? <span style={{ color: "#b45309", fontWeight: 600 }}>🔒 aguardando PCP</span> : <span style={{ color: "#166534" }}>✓ liberada</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px" }} disabled={ocupado === "op:" + o.id} onClick={() => imprimirOp(o)}>📄 PDF</button>
                    <button className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px", color: "#b91c1c", marginLeft: 4 }} disabled={ocupado === "op:" + o.id} onClick={() => cancelarOp(o)}>Cancelar</button>
                    <button className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px", color: "#fff", background: "#dc2626", marginLeft: 4 }} disabled={ocupado === "op:" + o.id} onClick={() => excluirOp(o)}>🗑️ Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* EM PRODUÇÃO NO SYNTECH — a OP foi criada lá (coluna PRODUCAO); só leitura */}
      {emProducaoErp.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 14, borderColor: "#c7d2fe" }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#4338ca", background: "#eef2ff" }}>
            🏭 Em produção no Syntech <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {emProducaoErp.length} · OP criada lá — já saiu da fila daqui</span>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Modelo</th><th>Cor</th><th className="num">Disp.</th><th className="num">Mín.</th><th className="num">Em produção</th></tr></thead>
            <tbody>
              {emProducaoErp.map((u) => (
                <tr key={u.ref + "|" + u.cor.toLowerCase()} style={{ background: "#f5f3ff" }}>
                  <td className="strong">{u.modelo}{tipoBadge(u.tipo)}</td>
                  <td>{u.cor || "—"}</td>
                  <td className="num" style={{ fontWeight: 700, color: u.disponivel > 0 ? "#166534" : "#dc2626" }}>{u.disponivel.toLocaleString("pt-BR")}</td>
                  <td className="num">{u.minimo || "—"}</td>
                  <td className="num" style={{ fontWeight: 800, color: "#4338ca" }}>{u.em_producao.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pad muted" style={{ fontSize: 11 }}>💡 Esses estão com <b>OP aberta no Syntech</b> (a ponte lê a coluna PRODUCAO). Por isso saíram da fila de “Precisa Produzir” — pra não mandar produzir de novo.</div>
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
                    <td className="strong">{u.modelo}{tipoBadge(u.tipo)}</td>
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
        💡 A <b>fila</b> é automática (mais crítico primeiro) — ela te diz <b>o que</b> e <b>quanto</b> produzir. A <b>ordem de produção (OP) é criada no Syntech</b>;
        quando você cria lá, ela aparece em “🏭 Em produção no Syntech”. Defina o <b>mínimo por modelo+cor</b> na coluna Mín. (Enter salva).
      </p>
    </>
  );
}
