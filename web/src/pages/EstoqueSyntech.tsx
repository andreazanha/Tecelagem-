// Estoque do Syntech (espelho) — visão por MODELO, COR e TAMANHO, igual à tela
// "Estoque por Tamanho e Cor" do Syntech. Mostra o SALDO disponível (já com o
// empenho descontado pelo ERP). Só leitura — a ponte alimenta a cada ~2 min.
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

type Linha = { produto: string | null; ref: string | null; cor: string | null; tamanho: string | null; saldo: number; unidade: string | null; atualizado_em: string };

function haQuanto(iso: string | null, agora: string): { txt: string; cor: string } {
  if (!iso) return { txt: "sem dados", cor: "#b91c1c" };
  const ms = new Date(agora).getTime() - new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min <= 5) return { txt: `sincronizado há ${min} min`, cor: "#16a34a" };
  if (min <= 30) return { txt: `sincronizado há ${min} min`, cor: "#b45309" };
  const h = Math.round(min / 60);
  return { txt: `sincronizado há ${h} h — a ponte pode estar parada`, cor: "#b91c1c" };
}

export function EstoqueSyntech() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [sync, setSync] = useState<{ atualizado_em: string | null; agora: string; itens: number } | null>(null);
  const [alertas, setAlertas] = useState<{ kit: string; cor: string; montaveis: number; faltando: string; sobrando: { peca: string; qtd: number }[] }[]>([]);
  const [popup, setPopup] = useState(false);

  function carregar() {
    setLinhas(null); setErro("");
    api.erpEstoque().then((r) => setLinhas(r as Linha[])).catch((e) => setErro((e as Error).message));
    api.erpSyncStatus().then((s) => setSync({ atualizado_em: s.estoque.atualizado_em, agora: s.agora, itens: s.estoque.itens })).catch(() => {});
    api.erpKitAlertas().then((r) => { setAlertas(r.alertas || []); if ((r.alertas || []).length) setPopup(true); }).catch(() => {});
  }
  useEffect(() => { carregar(); }, []);

  // agrupa por produto (modelo) → cada um com suas linhas cor/tamanho
  const grupos = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const filtradas = (linhas || []).filter((l) =>
      !b || (l.produto || "").toLowerCase().includes(b) || (l.ref || "").toLowerCase().includes(b) || (l.cor || "").toLowerCase().includes(b));
    const m = new Map<string, { ref: string; nome: string; linhas: Linha[] }>();
    for (const l of filtradas) {
      const ref = (l.ref || "—");
      const g = m.get(ref) || { ref, nome: l.produto || ref, linhas: [] };
      g.linhas.push(l); m.set(ref, g);
    }
    const arr = [...m.values()];
    for (const g of arr) g.linhas.sort((a, b2) => (a.tamanho || "").localeCompare(b2.tamanho || "") || (a.cor || "").localeCompare(b2.cor || ""));
    arr.sort((a, b2) => a.nome.localeCompare(b2.nome));
    return arr;
  }, [linhas, busca]);

  const hq = sync ? haQuanto(sync.atualizado_em, sync.agora) : null;

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Estoque do Syntech</h2>
        <span className="muted" style={{ fontSize: 12 }}>Espelho por modelo · cor · tamanho. Saldo disponível (empenho já descontado).</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar}>↻ Atualizar</button>
      </div>

      {alertas.length > 0 && (
        <div className="card pad" style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <strong>Peças de kit desbalanceadas:</strong>
          <span>{alertas.length} {alertas.length === 1 ? "caso" : "casos"} — tem peça sobrando por falta de outra pra montar o kit.</span>
          <button className="btn btn-soft" style={{ marginLeft: "auto", color: "#991b1b" }} onClick={() => setPopup(true)}>Ver detalhes</button>
        </div>
      )}

      {popup && alertas.length > 0 && (
        <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setPopup(false); }}>
          <div className="card pad" style={{ maxWidth: 680, width: "95%", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row-gap" style={{ alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, color: "#991b1b" }}>⚠️ Faltam peças para montar kits</h2>
              <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => setPopup(false)}>✕ Fechar</button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              O kit é montado inteiro. Nestes casos tem peça parada por falta da outra — a equipe
              precisa repor pra não faltar na hora de montar/vender.
            </p>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Kit</th><th>Cor</th><th className="num">Dá pra montar</th><th>Falta</th><th>Sobrando</th></tr></thead>
              <tbody>
                {alertas.map((a, i) => (
                  <tr key={i}>
                    <td className="strong">{a.kit}</td>
                    <td>{a.cor}</td>
                    <td className="num" style={{ fontWeight: 700, color: a.montaveis > 0 ? "#854d0e" : "#991b1b" }}>{a.montaveis}</td>
                    <td style={{ color: "#991b1b", fontWeight: 600 }}>{a.faltando}</td>
                    <td>{a.sobrando.map((s) => `${s.qtd} ${s.peca}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hq && (
        <div className="card pad" style={{ marginBottom: 12, fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: hq.cor, display: "inline-block" }} />
          <span style={{ color: hq.cor, fontWeight: 600 }}>{hq.txt}</span>
          <span className="muted">· {sync?.itens ?? 0} saldos no espelho</span>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12 }}>
        <input value={busca} placeholder="Filtrar por modelo, código ou cor…" style={{ width: "100%", padding: "8px 12px", fontSize: 14 }}
          onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
      {linhas == null && !erro && <div className="card pad muted">Carregando estoque…</div>}
      {linhas != null && grupos.length === 0 && <div className="card pad muted">Nada encontrado{busca ? ` para "${busca}"` : " no espelho (a ponte ainda não trouxe o estoque por cor)"}.</div>}

      {grupos.map((g) => {
        const total = g.linhas.reduce((s, l) => s + (Number(l.saldo) || 0), 0);
        return (
          <div className="card" key={g.ref} style={{ marginBottom: 12 }}>
            <div className="pad" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
              <strong>{g.nome}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{g.ref}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#166534", fontWeight: 700 }}>Total: {total.toLocaleString("pt-BR")}</span>
            </div>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Tamanho</th><th>Cor</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {g.linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.tamanho || "—"}</td>
                    <td>{l.cor || "—"}</td>
                    <td className="num" style={{ fontWeight: 700, color: (Number(l.saldo) || 0) > 0 ? "#166534" : "#b91c1c" }}>{(Number(l.saldo) || 0).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
