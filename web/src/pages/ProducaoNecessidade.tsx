// Precisa Produzir (Pronta Entrega) — fila automática do que falta + "Criar OP" (reposição que
// entra na esteira Tecelagem→Corte→Revisão). Também dá pra criar OP de QUALQUER produto/cor/tamanho
// pelo botão "Nova OP". Ainda não grava no Syntech (próxima etapa). Edição Limitada não entra na fila.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type UnidadePE, type NecessidadeResumo, type OpAberta, type ProdutoBusca } from "../api";

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
  const [picker, setPicker] = useState(false);

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

  async function criarOpFila(u: UnidadePE) {
    const sugerido = Math.max(u.falta, u.reservado, 1);
    const resp = window.prompt(`Criar ordem de produção de "${u.modelo}" (${u.cor}).\nEla entra na esteira (Tecelagem → Corte → Revisão).\n\nQuantas peças produzir?`, String(sugerido));
    if (resp == null) return;
    const qtd = Math.max(1, Math.round(Number(resp) || 0));
    const k = u.ref + "|" + u.cor.toLowerCase();
    setOcupado(k); setErro("");
    try {
      const r = await api.producaoOpCriar({ ref: u.ref, cor: u.cor, tipo: u.tipo, modelo: u.modelo, qtd });
      if (r.pedido_id) await api.gerarPdfs(r.pedido_id).catch(() => {}); // gera o PDF + trava o card no PCP
      carregar();
    }
    catch (e) { setErro(ERRO_OP[(e as Error).message] || (e as Error).message); }
    finally { setOcupado(""); }
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

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🏭 Precisa Produzir</h2>
        <span className="muted" style={{ fontSize: 12 }}>Pronta Entrega · kit montado + avulsos, por cor. Disponível = saldo real − reservado. Edição Limitada não entra na fila.</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setPicker(true)}>➕ Nova OP (escolher produto)</button>
        <button className="btn btn-soft" onClick={carregar}>↻ Atualizar</button>
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
            ? <div className="pad muted">🎉 Nada na fila — tudo acima do mínimo (ou já em produção). Use “Nova OP” pra produzir algo mesmo assim.</div>
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
                        <td className="strong">{u.modelo}{tipoBadge(u.tipo)}</td>
                        <td>{u.cor || "—"}</td>
                        <td className="num" style={{ fontWeight: 700, color: u.disponivel > 0 ? "#166534" : "#dc2626" }}>{u.disponivel.toLocaleString("pt-BR")}{u.reservado > 0 ? <span className="muted" style={{ fontSize: 11, display: "block", fontWeight: 400 }}>{u.reservado} res.</span> : null}</td>
                        <td className="num">
                          <input value={valorMin} onChange={(e) => setMinEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))} onBlur={(e) => salvarMin(u, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} disabled={ocupado === k} inputMode="numeric" style={{ width: 56, padding: "4px 6px", textAlign: "right", fontSize: 13 }} placeholder="—" />
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: u.falta > 0 ? "#dc2626" : "var(--muted)" }}>{u.falta > 0 ? u.falta.toLocaleString("pt-BR") : "—"}</td>
                        <td className="muted">{u.limitante || (u.tipo === "avulso" ? "produzir avulso" : "")}</td>
                        <td><button className="btn btn-primary" style={{ whiteSpace: "nowrap", fontSize: 12, padding: "5px 10px" }} disabled={ocupado === k} onClick={() => criarOpFila(u)}>+ Criar OP</button></td>
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
        💡 A <b>fila</b> é automática (mais crítico primeiro). <b>+ Criar OP</b> / <b>Nova OP</b> geram uma ordem que entra na esteira
        (Tecelagem → Corte → Revisão) — <b>ainda não grava no Syntech</b> (próxima etapa). Defina o <b>mínimo por modelo+cor</b> na coluna Mín. (Enter salva).
      </p>

      {picker && <PickerOP onFechar={() => setPicker(false)} onCriado={() => { setPicker(false); carregar(); }} />}
    </>
  );
}

// ── Modal: criar OP de QUALQUER produto (busca no catálogo) + cor + tamanho + quantidade ──
function PickerOP({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [q, setQ] = useState("");
  const [produtos, setProdutos] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<ProdutoBusca | null>(null);
  const [cor, setCor] = useState("");
  const [tam, setTam] = useState("");
  const [qtd, setQtd] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setProdutos([]); return; }
    setBuscando(true);
    timer.current = setTimeout(() => {
      api.produtosBusca(q.trim()).then((r) => setProdutos(r.produtos || [])).catch((e) => setErro((e as Error).message)).finally(() => setBuscando(false));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  function escolher(p: ProdutoBusca) {
    setSel(p); setErro("");
    setCor(p.cores.length === 1 ? p.cores[0] : "");
    setTam(p.tamanhos.length === 1 ? p.tamanhos[0].codigo : "");
  }

  async function criar() {
    if (!sel || !cor) { setErro("Escolha o produto e a cor."); return; }
    const n = Math.max(1, Math.round(Number(qtd) || 0));
    if (!n) { setErro("Informe a quantidade."); return; }
    setSalvando(true); setErro("");
    try {
      const r = await api.producaoOpCriar({ ref: sel.ref, cor, tamanho: tam, tipo: "avulso", modelo: sel.nome, qtd: n });
      if (r.pedido_id) await api.gerarPdfs(r.pedido_id).catch(() => {}); // gera o PDF + trava no PCP
      onCriado();
    } catch (e) { setErro(ERRO_OP[(e as Error).message] || (e as Error).message); setSalvando(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="card pad" style={{ maxWidth: 560, width: "95%", maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>➕ Nova ordem de produção</h2>
          <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={onFechar}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Busque qualquer produto do catálogo, escolha cor e tamanho e a quantidade. A OP entra na esteira (ainda não grava no Syntech).</p>

        <input autoFocus value={q} placeholder="Buscar produto por nome ou código…" style={{ width: "100%", padding: "9px 12px", fontSize: 14, marginBottom: 8 }} onChange={(e) => setQ(e.target.value)} />

        {!sel && (
          <div style={{ maxHeight: 220, overflow: "auto", border: q.trim().length >= 2 ? "1px solid var(--line)" : "none", borderRadius: 8 }}>
            {buscando && <div className="pad muted">Buscando…</div>}
            {!buscando && q.trim().length >= 2 && produtos.length === 0 && <div className="pad muted">Nada encontrado.</div>}
            {produtos.map((p) => (
              <button key={p.ref} onClick={() => escolher(p)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--line)", padding: "9px 12px", cursor: "pointer" }}>
                <strong>{p.nome}</strong> <span className="muted" style={{ fontSize: 11 }}>{p.ref}</span>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>{p.cores.length} cor(es) · {p.tamanhos.length} tamanho(s)</span>
              </button>
            ))}
          </div>
        )}

        {sel && (
          <div>
            <div className="card pad" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <div><strong>{sel.nome}</strong> <span className="muted" style={{ fontSize: 11 }}>{sel.ref}</span></div>
              <button className="btn btn-soft" style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => { setSel(null); setCor(""); setTam(""); }}>Trocar produto</button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Cor</div>
              {sel.cores.length === 0 ? <input value={cor} placeholder="Digite a cor" style={{ width: "100%", padding: "7px 10px" }} onChange={(e) => setCor(e.target.value)} /> : (
                <div className="row-gap" style={{ gap: 6, flexWrap: "wrap" }}>
                  {sel.cores.map((c) => (
                    <button key={c} onClick={() => setCor(c)} className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px", border: cor === c ? "2px solid #2563eb" : undefined, fontWeight: cor === c ? 700 : 400 }}>{c}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tamanho</div>
              {sel.tamanhos.length === 0 ? <input value={tam} placeholder="Código do tamanho (ex.: 1C)" style={{ width: "100%", padding: "7px 10px" }} onChange={(e) => setTam(e.target.value)} /> : (
                <div className="row-gap" style={{ gap: 6, flexWrap: "wrap" }}>
                  {sel.tamanhos.map((t) => (
                    <button key={t.codigo + t.medida} onClick={() => setTam(t.codigo)} className="btn btn-soft" style={{ fontSize: 12, padding: "5px 10px", border: tam === t.codigo ? "2px solid #2563eb" : undefined, fontWeight: tam === t.codigo ? 700 : 400 }}>{t.medida || t.codigo}{t.medida && t.codigo ? <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>({t.codigo})</span> : null}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantidade a produzir</div>
              <input value={qtd} inputMode="numeric" placeholder="0" style={{ width: 120, padding: "7px 10px", fontSize: 15 }} onChange={(e) => setQtd(e.target.value.replace(/[^\d]/g, ""))} />
            </div>

            {erro && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>{erro}</div>}
            <div className="row-gap" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={salvando || !cor || !qtd} onClick={criar}>{salvando ? "Criando…" : "Criar OP"}</button>
              <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
            </div>
          </div>
        )}
        {!sel && erro && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{erro}</div>}
      </div>
    </div>
  );
}
