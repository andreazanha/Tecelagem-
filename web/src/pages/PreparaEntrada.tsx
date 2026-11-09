// Preparar Entrada — a lista pronta pra DIGITAR NO SYNTECH. Pra cada ordem de produção de
// estoque que já ficou pronta, mostra exatamente o que deu entrada: produto + cor + código
// do tamanho + quantidade (o KIT já vem explodido nas peças reais). Depois de digitar no
// Syntech, clique "Marcar entrada feita" pra tirar a OP da lista. A entrada em si é no Syntech.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PreparaEntradaOp } from "../api";

const nf = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");

export function PreparaEntrada() {
  const [ops, setOps] = useState<PreparaEntradaOp[] | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [so, setSo] = useState<"prontas" | "todas">("prontas");

  function carregar() { setErro(""); api.prepararEntrada().then((r) => setOps(r.ops)).catch((e) => setErro((e as Error).message)); }
  useEffect(() => { carregar(); }, []);

  async function feita(o: PreparaEntradaOp) {
    if (!window.confirm(`Confirmar que você JÁ DEU ENTRADA desta ordem no Syntech?\n\n${o.modelo} — ${nf(o.qtd)} un.\n\nIsso tira a ordem da lista. O saldo vem do Syntech automaticamente.`)) return;
    setOcupado(o.id);
    try { const r = await api.prepararEntradaFeita(o.id); if (r.error) throw new Error(r.error); carregar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(""); }
  }

  function imprimir() { window.print(); }

  const lista = (ops || []).filter((o) => (so === "todas" ? true : o.pronta));
  const prontas = (ops || []).filter((o) => o.pronta).length;
  const emProd = (ops || []).filter((o) => o.em_producao).length;

  return (
    <>
      <div className="row-gap no-print" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>📥 Preparar Entrada</h2>
        <span className="muted" style={{ fontSize: 12 }}>A lista pronta pra digitar no Syntech. O kit já vem explodido nas peças.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar}>↻ Atualizar</button>
        <button className="btn btn-soft" onClick={imprimir}>🖨️ Imprimir</button>
      </div>

      <div className="card pad no-print" style={{ marginBottom: 12, background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <div style={{ fontSize: 13, color: "#1e3a8a" }}>
          💡 <b>Como funciona:</b> a entrada de estoque é feita <b>no Syntech</b> (nota de entrada). Aqui o sistema te mostra
          exatamente o que entrou — <b>produto + cor + código do tamanho + quantidade</b>, com o kit já aberto nas peças —
          pra você digitar rapidinho na tela do Syntech. Quando terminar, clique <b>“✓ Marcar entrada feita”</b>: a ordem sai da lista
          e o saldo volta do Syntech automaticamente (sincroniza sozinho).
        </div>
      </div>

      {erro && <div className="card pad no-print" style={{ color: "#b91c1c", marginBottom: 12 }}>{erro}</div>}

      <div className="row-gap no-print" style={{ gap: 4, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {([["prontas", `Prontas pra entrada (${prontas})`], ["todas", `Todas as ordens (${(ops || []).length})`]] as const).map(([v, lbl]) => (
          <button key={v} className={"btn " + (so === v ? "btn-primary" : "btn-soft")} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setSo(v)}>{lbl}</button>
        ))}
        {emProd > 0 && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>⏳ {emProd} ainda em produção</span>}
      </div>

      {ops == null && !erro && <div className="card pad muted">Carregando…</div>}
      {ops && lista.length === 0 && (
        <div className="card pad muted">
          {so === "prontas"
            ? "Nenhuma ordem pronta pra dar entrada agora. Assim que uma ordem de reposição ficar pronta na produção, ela aparece aqui."
            : "Nenhuma ordem de produção de estoque aberta."}
          <div style={{ marginTop: 8 }}><Link className="btn btn-soft" to="/precisa-produzir">🏭 Precisa Produzir</Link></div>
        </div>
      )}

      {lista.map((o) => (
        <div key={o.id} className="card" style={{ marginBottom: 12 }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>
              {o.pronta ? "✅ " : "⏳ "}{o.modelo}
              <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · {nf(o.qtd)} un.</span>
            </div>
            {o.numero && <span className="muted" style={{ fontSize: 12 }}>pedido {o.numero}</span>}
            {o.pronta
              ? <span style={{ fontSize: 11, color: "#166534", fontWeight: 700 }}>pronta pra entrada</span>
              : <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>ainda em produção</span>}
            <button className="btn btn-primary no-print" style={{ marginLeft: "auto", fontSize: 13 }}
              disabled={!o.pronta || ocupado === o.id} onClick={() => feita(o)}>
              {ocupado === o.id ? "…" : "✓ Marcar entrada feita"}
            </button>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Produto (peça)</th><th>Cor</th><th>Tamanho (código)</th><th className="num">Quantidade</th></tr></thead>
            <tbody>
              {o.itens.map((it, i) => (
                <tr key={it.ref + "|" + it.cor + "|" + it.tamanho + "|" + i}>
                  <td className="strong">{it.produto} <span className="muted" style={{ fontSize: 11 }}>{it.ref}</span></td>
                  <td>{it.cor || "—"}</td>
                  <td><span className="strong" style={{ fontFamily: "monospace" }}>{it.tamanho || "—"}</span></td>
                  <td className="num" style={{ fontWeight: 700 }}>{nf(it.qtd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="muted no-print" style={{ fontSize: 12, marginTop: 10 }}>
        💡 O <b>código do tamanho</b> é o mesmo que o Syntech usa (ex.: 5K, 1C) — digite igual. Só ordens já <b>prontas na produção</b> podem
        ser marcadas; as que ainda estão em produção aparecem como ⏳ em “Todas as ordens”.
      </p>
    </>
  );
}
