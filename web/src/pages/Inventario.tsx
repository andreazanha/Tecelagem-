// Inventário — contagem física do estoque comparada com o saldo do sistema (Syntech).
// Mostra divergências (contado × sistema) com motivo provável. O ajuste no Syntech depende da
// escrita (pendente); por ora o inventário conta, aponta divergências e registra.
import { useEffect, useMemo, useState } from "react";
import { api, type InventarioItem } from "../api";

type Dados = {
  inventario: { id: string; nome: string; criado_em: string; fechado_em: string | null };
  resumo: { skus: number; contados: number; nao_contados: number; divergentes: number; pecas_mais: number; pecas_menos: number };
  itens: InventarioItem[];
};
const nf = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");

export function Inventario() {
  const [lista, setLista] = useState<{ id: string; nome: string; criado_em: string; fechado_em: string | null; contados: number; divergentes: number }[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "div" | "naocontado">("todos");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState("");

  function carregarLista() { api.inventarioListar().then((r) => setLista(r.inventarios)).catch((e) => setErro((e as Error).message)); }
  function carregar(id: string) { api.inventarioGet(id).then((r) => setDados(r as Dados)).catch((e) => setErro((e as Error).message)); }
  useEffect(() => { carregarLista(); }, []);
  useEffect(() => { if (sel) { setDados(null); carregar(sel); } }, [sel]);

  async function novo() {
    setErro("");
    try { const r = await api.inventarioCriar(); carregarLista(); setSel(r.id); } catch (e) { setErro((e as Error).message); }
  }
  async function fechar() {
    if (!sel || !window.confirm("Fechar este inventário? Ele fica salvo como histórico.")) return;
    try { await api.inventarioFechar(sel); carregarLista(); carregar(sel); } catch (e) { setErro((e as Error).message); }
  }
  const key = (it: InventarioItem) => `${it.ref}|${it.cor}|${it.tamanho}`.toLowerCase();
  async function salvarContagem(it: InventarioItem, valor: string, motivo?: string) {
    if (!sel) return;
    const k = key(it);
    const contado = valor === "" ? null : Math.max(0, Math.round(Number(valor) || 0));
    setOcupado(k);
    try {
      await api.inventarioContar(sel, { ref: it.ref, cor: it.cor, tamanho: it.tamanho, produto: it.produto || "", contado, motivo: motivo ?? it.motivo });
      setEdit((m) => { const c = { ...m }; delete c[k]; return c; });
      carregar(sel);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(""); }
  }

  const itensFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (dados?.itens || []).filter((it) => {
      if (b && !((it.produto || "").toLowerCase().includes(b) || it.ref.toLowerCase().includes(b) || it.cor.toLowerCase().includes(b))) return false;
      if (filtro === "div") return it.contado != null && it.diferenca !== 0;
      if (filtro === "naocontado") return it.contado == null;
      return true;
    });
  }, [dados, busca, filtro]);

  // ── LISTA de inventários ──
  if (!sel) {
    return (
      <>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>🔢 Inventário</h2>
          <span className="muted" style={{ fontSize: 12 }}>Contagem física × saldo do sistema, com divergências e motivos.</span>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={novo}>➕ Começar inventário</button>
        </div>
        {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
        {lista == null && <div className="card pad muted">Carregando…</div>}
        {lista && lista.length === 0 && <div className="card pad muted">Nenhum inventário ainda. Clique em "Começar inventário".</div>}
        {lista && lista.length > 0 && (
          <div className="card">
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Inventário</th><th>Criado</th><th className="num">Contados</th><th className="num">Divergências</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setSel(i.id)}>
                    <td className="strong">{i.nome}</td>
                    <td className="muted">{i.criado_em}</td>
                    <td className="num">{nf(i.contados)}</td>
                    <td className="num" style={{ color: i.divergentes > 0 ? "#b45309" : "var(--muted)", fontWeight: 700 }}>{nf(i.divergentes)}</td>
                    <td>{i.fechado_em ? <span className="muted">fechado</span> : <span style={{ color: "#166534", fontWeight: 600 }}>aberto</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  // ── CONTAGEM de um inventário ──
  const fechado = !!dados?.inventario.fechado_em;
  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <button className="btn btn-soft" onClick={() => { setSel(null); setDados(null); }}>← Inventários</button>
        <h2 style={{ margin: 0 }}>🔢 {dados?.inventario.nome || "Inventário"}</h2>
        {fechado && <span className="muted" style={{ fontSize: 12 }}>(fechado)</span>}
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => sel && carregar(sel)}>↻ Atualizar</button>
        {!fechado && <button className="btn btn-soft" onClick={fechar}>Fechar inventário</button>}
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c", marginBottom: 12 }}>{erro}</div>}

      {dados && (
        <div className="row-gap" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="card pad" style={{ flex: "1 1 130px", minWidth: 120 }}><div className="muted" style={{ fontSize: 12 }}>SKUs</div><div style={{ fontSize: 22, fontWeight: 800 }}>{nf(dados.resumo.skus)}</div></div>
          <div className="card pad" style={{ flex: "1 1 130px", minWidth: 120 }}><div className="muted" style={{ fontSize: 12 }}>Contados</div><div style={{ fontSize: 22, fontWeight: 800, color: "#166534" }}>{nf(dados.resumo.contados)}</div><div className="muted" style={{ fontSize: 11 }}>{nf(dados.resumo.nao_contados)} a contar</div></div>
          <div className="card pad" style={{ flex: "1 1 130px", minWidth: 120, background: dados.resumo.divergentes > 0 ? "#fffbeb" : undefined }}><div style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>⚠️ Divergências</div><div style={{ fontSize: 22, fontWeight: 800, color: "#b45309" }}>{nf(dados.resumo.divergentes)}</div></div>
          <div className="card pad" style={{ flex: "1 1 130px", minWidth: 120 }}><div className="muted" style={{ fontSize: 12 }}>Sobra / Falta (peças)</div><div style={{ fontSize: 18, fontWeight: 800 }}><span style={{ color: "#166534" }}>+{nf(dados.resumo.pecas_mais)}</span> / <span style={{ color: "#dc2626" }}>−{nf(dados.resumo.pecas_menos)}</span></div></div>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={busca} placeholder="Filtrar por produto, código ou cor…" style={{ flex: "1 1 220px", padding: "8px 12px", fontSize: 14 }} onChange={(e) => setBusca(e.target.value)} />
        <div className="row-gap" style={{ gap: 4 }}>
          {([["todos", "Todos"], ["naocontado", "Não contados"], ["div", "Só divergências"]] as const).map(([v, lbl]) => (
            <button key={v} className={"btn " + (filtro === v ? "btn-primary" : "btn-soft")} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setFiltro(v)}>{lbl}</button>
          ))}
        </div>
      </div>

      {dados == null && !erro && <div className="card pad muted">Carregando…</div>}
      {dados && itensFiltrados.length === 0 && <div className="card pad muted">Nada aqui.</div>}

      {dados && itensFiltrados.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Produto</th><th>Cor</th><th>Tam.</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferença</th><th>Motivo provável</th></tr></thead>
            <tbody>
              {itensFiltrados.map((it) => {
                const k = key(it);
                const val = edit[k] ?? (it.contado != null ? String(it.contado) : "");
                const dif = it.diferenca;
                return (
                  <tr key={k} style={{ background: it.contado != null && dif !== 0 ? "#fffbeb" : undefined }}>
                    <td className="strong">{it.produto || it.ref} <span className="muted" style={{ fontSize: 11 }}>{it.ref}</span></td>
                    <td>{it.cor || "—"}</td>
                    <td>{it.medida || it.tamanho || "—"}</td>
                    <td className="num">{nf(it.sistema)}{it.reservado > 0 ? <span className="muted" style={{ fontSize: 10, display: "block", fontWeight: 400 }}>{it.reservado} res.</span> : null}</td>
                    <td className="num">
                      <input value={val} inputMode="numeric" disabled={fechado || ocupado === k}
                        onChange={(e) => setEdit((m) => ({ ...m, [k]: e.target.value.replace(/[^\d]/g, "") }))}
                        onBlur={(e) => { const v = e.target.value; if (v !== (it.contado != null ? String(it.contado) : "")) salvarContagem(it, v); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{ width: 64, padding: "4px 6px", textAlign: "right", fontSize: 13 }} placeholder="—" />
                    </td>
                    <td className="num" style={{ fontWeight: 700, color: dif == null ? "var(--muted)" : dif === 0 ? "#166534" : dif > 0 ? "#166534" : "#dc2626" }}>{dif == null ? "—" : dif > 0 ? `+${dif}` : dif}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{it.motivo_provavel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 Digite o <b>contado</b> (Enter salva). A <b>diferença</b> = contado − sistema. ⚠️ O <b>ajuste no Syntech</b> depende da escrita (pendente) —
        por ora o inventário conta, mostra as divergências e o motivo provável, e fica registrado.
      </p>
    </>
  );
}
