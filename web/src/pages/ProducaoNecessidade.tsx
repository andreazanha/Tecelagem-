// Precisa Produzir (Pronta Entrega) — kits montados + almofadas avulsas, por cor, com o
// disponível REAL do Syntech (saldo − reservado), o mínimo que a equipe define e o status.
// Ordenado do mais crítico pro menos (fila automática). Edição Limitada não entra (ponta de estoque).
import { useEffect, useMemo, useState } from "react";
import { api, type UnidadePE, type NecessidadeResumo } from "../api";

const STATUS: Record<UnidadePE["status"], { txt: string; cor: string; bg: string }> = {
  zerado_pedido: { txt: "⛔ Zerado — tem pedido", cor: "#991b1b", bg: "#fef2f2" },
  zerado: { txt: "⚠️ Zerado", cor: "#b45309", bg: "#fffbeb" },
  abaixo: { txt: "🔸 Abaixo do mínimo", cor: "#92400e", bg: "#fffbeb" },
  ok: { txt: "✓ OK", cor: "#166534", bg: "transparent" },
};

export function ProducaoNecessidade() {
  const [unidades, setUnidades] = useState<UnidadePE[] | null>(null);
  const [resumo, setResumo] = useState<NecessidadeResumo | null>(null);
  const [erro, setErro] = useState("");
  const [todos, setTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [minEdit, setMinEdit] = useState<Record<string, string>>({}); // "ref|cor" → valor sendo digitado
  const [salvando, setSalvando] = useState("");

  function carregar() {
    setUnidades(null); setErro("");
    api.producaoNecessidade(todos).then((r) => { setUnidades(r.unidades); setResumo(r.resumo); }).catch((e) => setErro((e as Error).message));
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [todos]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (unidades || []).filter((u) => !b || u.modelo.toLowerCase().includes(b) || u.cor.toLowerCase().includes(b) || u.ref.toLowerCase().includes(b));
  }, [unidades, busca]);

  async function salvarMin(u: UnidadePE, valor: string) {
    const k = u.ref + "|" + u.cor.toLowerCase();
    const n = Math.max(0, Math.round(Number(valor) || 0));
    if (n === u.minimo) { setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; }); return; }
    setSalvando(k);
    try {
      await api.estoqueMinSalvar(u.ref, u.cor, n);
      setMinEdit((m) => { const c = { ...m }; delete c[k]; return c; });
      carregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setSalvando(""); }
  }

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🏭 Precisa Produzir</h2>
        <span className="muted" style={{ fontSize: 12 }}>Pronta Entrega · kit montado + avulsos, por cor. Disponível = saldo real − reservado. Edição Limitada não entra.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar}>↻ Atualizar</button>
      </div>

      {resumo && (
        <div className="row-gap" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="card pad" style={{ flex: "1 1 150px", minWidth: 140, background: resumo.zerado_pedido > 0 ? "#fef2f2" : undefined }}>
            <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>⛔ Zerado com pedido</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#dc2626" }}>{resumo.zerado_pedido}</div>
            <div className="muted" style={{ fontSize: 12 }}>sem peça e tem cliente esperando</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 150px", minWidth: 140, background: resumo.zerado > 0 ? "#fffbeb" : undefined }}>
            <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>⚠️ Zerado</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#b45309" }}>{resumo.zerado}</div>
            <div className="muted" style={{ fontSize: 12 }}>disponível chegou a 0</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 150px", minWidth: 140 }}>
            <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>🔸 Abaixo do mínimo</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#b45309" }}>{resumo.abaixo}</div>
            <div className="muted" style={{ fontSize: 12 }}>precisa definir/atingir o mínimo</div>
          </div>
          <div className="card pad" style={{ flex: "1 1 150px", minWidth: 140 }}>
            <div className="muted" style={{ fontSize: 12 }}>Modelos acompanhados</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{resumo.kits} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>kits</span></div>
            <div className="muted" style={{ fontSize: 12 }}>+ {resumo.avulsos} avulsos</div>
          </div>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={busca} placeholder="Filtrar por modelo ou cor…" style={{ flex: "1 1 240px", padding: "8px 12px", fontSize: 14 }} onChange={(e) => setBusca(e.target.value)} />
        <label className="row-gap" style={{ alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Ver tudo (inclui o que está OK)
        </label>
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
      {unidades == null && !erro && <div className="card pad muted">Carregando…</div>}
      {unidades != null && lista.length === 0 && (
        <div className="card pad muted">{todos ? "Nada encontrado." : "🎉 Nada pra produzir agora — tudo acima do mínimo. (Marque \"Ver tudo\" pra conferir os mínimos.)"}</div>
      )}

      {lista.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Situação</th><th>Modelo</th><th>Cor</th>
                <th className="num">Disponível</th><th className="num">Mínimo</th><th className="num">Falta</th><th>O que falta</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => {
                const k = u.ref + "|" + u.cor.toLowerCase();
                const st = STATUS[u.status];
                const valorMin = minEdit[k] ?? String(u.minimo || "");
                return (
                  <tr key={k} style={{ background: st.bg }}>
                    <td style={{ color: st.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{st.txt}</td>
                    <td className="strong">
                      {u.modelo}
                      <span style={{ fontSize: 10, marginLeft: 6, background: u.tipo === "kit" ? "#eef2ff" : "#ecfeff", color: u.tipo === "kit" ? "#3730a3" : "#0e7490", borderRadius: 5, padding: "1px 5px", fontWeight: 600 }}>{u.tipo === "kit" ? "🧩 kit" : "avulso"}</span>
                    </td>
                    <td>{u.cor || "—"}</td>
                    <td className="num" style={{ fontWeight: 700, color: u.disponivel > 0 ? "#166534" : "#dc2626" }}>
                      {u.disponivel.toLocaleString("pt-BR")}
                      {u.reservado > 0 ? <span className="muted" style={{ fontSize: 11, display: "block", fontWeight: 400 }}>{u.reservado} reservado</span> : null}
                    </td>
                    <td className="num">
                      <input
                        value={valorMin}
                        onChange={(e) => setMinEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))}
                        onBlur={(e) => salvarMin(u, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        disabled={salvando === k}
                        inputMode="numeric"
                        style={{ width: 64, padding: "4px 6px", textAlign: "right", fontSize: 13 }}
                        placeholder="—"
                      />
                    </td>
                    <td className="num" style={{ fontWeight: 700, color: u.falta > 0 ? "#dc2626" : "var(--muted)" }}>{u.falta > 0 ? u.falta.toLocaleString("pt-BR") : "—"}</td>
                    <td className="muted">{u.limitante || (u.tipo === "avulso" ? "produzir avulso" : "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 Defina o <b>mínimo por modelo+cor</b> direto na coluna Mínimo (Enter pra salvar). O que ficar <b>abaixo do mínimo</b> ou <b>zerado</b> entra nesta fila, do mais crítico pro menos.
        Deixe 0 pra só avisar quando zerar. <b>Kit</b> = quantos dá pra montar com as peças; <b>O que falta</b> mostra a peça que trava a montagem.
      </p>
    </>
  );
}
